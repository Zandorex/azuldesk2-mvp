function config() {
  return { base: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''), key: process.env.EVOLUTION_API_KEY || '' };
}

async function request(path, options = {}) {
  const { base, key } = config();
  if (!base || !key) throw new Error('Evolution API ainda não foi configurada.');
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', apikey: key, ...(options.headers || {}) } });
  const body = await response.text();
  let data; try { data = body ? JSON.parse(body) : {}; } catch { data = { raw: body }; }
  if (!response.ok) throw new Error(data.message || data.error || `Evolution respondeu ${response.status}`);
  return data;
}

async function sendText(instance, number, text) {
  return request(`/message/sendText/${encodeURIComponent(instance)}`, { method: 'POST', body: JSON.stringify({ number: String(number).replace(/\D/g, ''), text }) });
}

async function status(instance) {
  return request(`/instance/connectionState/${encodeURIComponent(instance)}`);
}

module.exports = { sendText, status };
