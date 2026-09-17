// Owner-only tools: see who has been granted access (managed from Discord via
// /crdmanage) and read the audit trail.
const { supabase, json, preflight, getSession, levelOf } = require('./_common');

exports.handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad body' }); }

  const session = await getSession(body.token);
  if (!session) return json(401, { error: 'Not logged in' });
  if (levelOf(session) !== 'whitelist') return json(403, { error: 'Owner only' });

  if (body.action === 'access_list') {
    const { data } = await supabase.from('crd_access').select('*').order('granted_at', { ascending: false });
    return json(200, { access: data || [] });
  }

  if (body.action === 'audit') {
    const { data } = await supabase.from('crd_audit').select('*').order('id', { ascending: false }).limit(200);
    return json(200, { audit: data || [] });
  }

  return json(400, { error: 'Unknown action' });
};
