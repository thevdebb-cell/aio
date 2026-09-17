
const crypto = require('crypto');
const { supabase, json, preflight } = require('./_common');

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

exports.handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad body' }); }
  const action = body.action;

  if (action === 'start') {
    const token = crypto.randomUUID();
    const code = makeCode();
    const remember = !!body.remember;
    await supabase.from('crd_sessions').insert({ token, code, active: false, denied: false, remember });
    return json(200, { token, code });
  }

  if (action === 'check') {
    const { data } = await supabase.from('crd_sessions').select('*').eq('token', body.token).maybeSingle();
    if (!data) return json(200, { status: 'expired' });
    if (data.denied) return json(200, { status: 'denied' });
    if (data.active && data.discord_id) {
      return json(200, { status: 'ok', user: { username: data.username, is_whitelist: data.is_whitelist } });
    }
    return json(200, { status: 'waiting' });
  }

  if (action === 'me') {
    const { data } = await supabase.from('crd_sessions').select('*').eq('token', body.token).maybeSingle();
    if (!data || !data.active || !data.discord_id) return json(200, { status: 'no' });
    return json(200, { status: 'ok', user: { username: data.username, is_whitelist: data.is_whitelist } });
  }

  if (action === 'logout') {
    await supabase.from('crd_sessions').delete().eq('token', body.token);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action' });
};
