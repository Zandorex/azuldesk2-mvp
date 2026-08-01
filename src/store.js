const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const file = path.resolve(process.env.DATA_FILE || './data/azuldesk.json');

function seed() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'Azuldesk@2026';
  return {
    meta: { version: 1, createdAt: new Date().toISOString() },
    companies: [{ id: 'azulmedsp', name: 'AzulmedSP', plan: 'MVP', active: true, instance: process.env.EVOLUTION_INSTANCE || 'azulmedsp', color: '#1177cc' }],
    users: [{ id: 'u_admin', companyId: 'azulmedsp', name: 'Administrador', email: (process.env.ADMIN_EMAIL || 'admin@azuldesk.com.br').toLowerCase(), passwordHash: bcrypt.hashSync(adminPassword, 10), role: 'owner', active: true }],
    contacts: [], conversations: [], messages: [],
    tags: [{ id: 'tag_novo', companyId: 'azulmedsp', name: 'Novo cliente', color: '#38bdf8' }, { id: 'tag_orcamento', companyId: 'azulmedsp', name: 'Orçamento', color: '#f59e0b' }, { id: 'tag_cliente', companyId: 'azulmedsp', name: 'Cliente', color: '#22c55e' }],
    quickReplies: [{ id: 'qr_ola', companyId: 'azulmedsp', shortcut: '/ola', title: 'Saudação', text: 'Olá! Sou da AzulmedSP. Como posso ajudar?' }, { id: 'qr_cep', companyId: 'azulmedsp', shortcut: '/cep', title: 'Solicitar CEP', text: 'Para verificar disponibilidade e entrega, poderia informar seu CEP?' }]
  };
}

function ensure() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(seed(), null, 2));
}
function read() { ensure(); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(db) { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, file); return db; }
function update(fn) { const db = read(); const result = fn(db); write(db); return result; }
function id(prefix) { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

module.exports = { read, write, update, id, file };
