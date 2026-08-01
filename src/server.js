require('dotenv').config({ path: require('path').resolve('.env') });
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const store = require('./store');
const evolution = require('./evolution');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'mude-esta-chave-em-producao';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

function sign(user) { return jwt.sign({ id: user.id, companyId: user.companyId, role: user.role }, jwtSecret, { expiresIn: '7d' }); }
function auth(req, res, next) { try { req.auth = jwt.verify(req.cookies.azuldesk_token || '', jwtSecret); next(); } catch { res.status(401).json({ error: 'Sessão expirada.' }); } }
function cleanNumber(value) { let n = String(value || '').replace(/\D/g, ''); if (n && n.length <= 11 && !n.startsWith('55')) n = `55${n}`; return n; }
function textFromMessage(msg) { return msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || (msg?.audioMessage ? '🎤 Áudio' : msg?.imageMessage ? '📷 Imagem' : msg?.documentMessage?.fileName ? `📎 ${msg.documentMessage.fileName}` : 'Mensagem'); }

app.post('/api/auth/login', (req, res) => {
  const db = store.read(); const email = String(req.body.email || '').toLowerCase().trim();
  const user = db.users.find(u => u.email === email && u.active);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  res.cookie('azuldesk_token', sign(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 604800000 });
  res.json({ ok: true });
});
app.post('/api/auth/logout', (_, res) => { res.clearCookie('azuldesk_token'); res.json({ ok: true }); });

app.get('/api/bootstrap', auth, (req, res) => {
  const db = store.read(); const cid = req.auth.companyId;
  const user = db.users.find(u => u.id === req.auth.id); const company = db.companies.find(c => c.id === cid);
  res.json({ user: { id: user.id, name: user.name, role: user.role }, company, contacts: db.contacts.filter(x => x.companyId === cid), conversations: db.conversations.filter(x => x.companyId === cid).sort((a,b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')), messages: db.messages.filter(x => x.companyId === cid), tags: db.tags.filter(x => x.companyId === cid), quickReplies: db.quickReplies.filter(x => x.companyId === cid), users: db.users.filter(x => x.companyId === cid).map(({passwordHash,...u}) => u) });
});

app.post('/api/conversations/:id/send', auth, async (req, res) => {
  const db = store.read(); const conv = db.conversations.find(c => c.id === req.params.id && c.companyId === req.auth.companyId);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const text = String(req.body.text || '').trim(); if (!text) return res.status(400).json({ error: 'Digite uma mensagem.' });
  try {
    await evolution.sendText(conv.instance, conv.remoteNumber, text);
    const message = { id: store.id('msg'), companyId: conv.companyId, conversationId: conv.id, externalId: null, direction: 'out', type: 'text', text, status: 'sent', createdAt: new Date().toISOString(), userId: req.auth.id };
    store.update(d => { d.messages.push(message); const c = d.conversations.find(x => x.id === conv.id); c.lastMessage = text; c.lastMessageAt = message.createdAt; });
    io.to(`company:${conv.companyId}`).emit('message', message); res.json(message);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.patch('/api/conversations/:id', auth, (req, res) => {
  let updated; store.update(db => { const c = db.conversations.find(x => x.id === req.params.id && x.companyId === req.auth.companyId); if (!c) return; for (const k of ['status','assigneeId','tagIds']) if (req.body[k] !== undefined) c[k] = req.body[k]; updated = c; });
  if (!updated) return res.status(404).json({ error: 'Conversa não encontrada.' }); io.to(`company:${req.auth.companyId}`).emit('conversation', updated); res.json(updated);
});

app.post('/api/contacts', auth, (req, res) => {
  const number = cleanNumber(req.body.number); if (!number) return res.status(400).json({ error: 'Informe o WhatsApp.' });
  const db = store.read(); const company = db.companies.find(c => c.id === req.auth.companyId); let contact, conv;
  store.update(d => { contact = d.contacts.find(x => x.companyId === req.auth.companyId && x.number === number); if (!contact) { contact = { id: store.id('ct'), companyId: req.auth.companyId, name: String(req.body.name || number), number, avatar: '', createdAt: new Date().toISOString() }; d.contacts.push(contact); } conv = d.conversations.find(x => x.companyId === req.auth.companyId && x.contactId === contact.id); if (!conv) { conv = { id: store.id('cv'), companyId: req.auth.companyId, contactId: contact.id, remoteNumber: number, instance: company.instance, status: 'open', assigneeId: req.auth.id, tagIds: [], unread: 0, lastMessage: 'Nova conversa', lastMessageAt: new Date().toISOString() }; d.conversations.push(conv); } });
  res.json({ contact, conversation: conv });
});

app.get('/api/integration/status', auth, async (req, res) => { const c = store.read().companies.find(x => x.id === req.auth.companyId); try { res.json(await evolution.status(c.instance)); } catch (e) { res.status(502).json({ error: e.message }); } });

app.post('/webhooks/evolution/:companyId', (req, res) => {
  const expected = process.env.WEBHOOK_SECRET; if (expected && req.query.secret !== expected) return res.status(401).json({ error: 'Webhook não autorizado.' });
  const db = store.read(); const company = db.companies.find(c => c.id === req.params.companyId); if (!company) return res.status(404).json({ error: 'Empresa desconhecida.' });
  const body = req.body || {}; const event = String(body.event || '').toUpperCase(); if (!event.includes('MESSAGES_UPSERT')) return res.json({ received: true, ignored: event });
  const data = body.data || body; const key = data.key || {}; if (key.fromMe) return res.json({ received: true, ignored: 'fromMe' });
  const remote = cleanNumber(String(key.remoteJid || data.remoteJid || '').split('@')[0]); if (!remote) return res.json({ received: true, ignored: 'no-number' });
  const externalId = key.id || data.id; if (externalId && db.messages.some(m => m.externalId === externalId)) return res.json({ received: true, duplicate: true });
  let created; store.update(d => { let contact = d.contacts.find(x => x.companyId === company.id && x.number === remote); if (!contact) { contact = { id: store.id('ct'), companyId: company.id, name: data.pushName || remote, number: remote, avatar: '', createdAt: new Date().toISOString() }; d.contacts.push(contact); } let conv = d.conversations.find(x => x.companyId === company.id && x.contactId === contact.id); if (!conv) { conv = { id: store.id('cv'), companyId: company.id, contactId: contact.id, remoteNumber: remote, instance: body.instance || company.instance, status: 'open', assigneeId: null, tagIds: ['tag_novo'], unread: 0 }; d.conversations.push(conv); } const text = textFromMessage(data.message); created = { id: store.id('msg'), companyId: company.id, conversationId: conv.id, externalId, direction: 'in', type: Object.keys(data.message || {})[0] || 'text', text, status: 'received', createdAt: new Date(data.messageTimestamp ? Number(data.messageTimestamp) * 1000 : Date.now()).toISOString(), userId: null }; d.messages.push(created); conv.lastMessage = text; conv.lastMessageAt = created.createdAt; conv.unread = (conv.unread || 0) + 1; });
  io.to(`company:${company.id}`).emit('message', created); res.json({ received: true });
});

io.use((socket, next) => { try { const cookies = Object.fromEntries(String(socket.handshake.headers.cookie || '').split(';').map(v => v.trim().split('='))); socket.authUser = jwt.verify(cookies.azuldesk_token || '', jwtSecret); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => socket.join(`company:${socket.authUser.companyId}`));

app.get('/health', (_, res) => res.json({ status: 'ok', app: 'Azuldesk', version: '1.0.0' }));
app.get('*path', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
server.listen(port, () => console.log(`Azuldesk em http://localhost:${port}`));
