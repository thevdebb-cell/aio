const { supabase, json, preflight, getSession, levelOf, audit } = require('./_common');

function isSchemaErr(e) { return e && /could not find|does not exist|schema cache/i.test(e.message || ''); }

function staffCategory(status, oldStaff) {
  if (oldStaff) return 'before_revamp';
  const s = String(status || '').toLowerCase();
  if (['retired', 'fired', 'blacklisted', 'suspended', 'dr', 'd/r'].indexOf(s) !== -1) return 'inactive';
  return 'active';
}
function caseCategory(c) {
  const s = String(c.status || '').toLowerCase();
  if (c.sealed || c.archived || ['closed', 'confirmed', 'expired'].indexOf(s) !== -1) return 'inactive';
  return 'active';
}

async function syncMilweb(session) {
  const result = { staffAdded: 0, staffUpdated: 0, casesAdded: 0, casesUpdated: 0, notes: [] };

  const { data: profiles, error: pErr } = await supabase.from('milweb_profiles').select('*');
  if (pErr) { result.notes.push('MilWeb staff not reachable: ' + pErr.message); }
  for (const p of (profiles || [])) {
    const category = staffCategory(p.status, p.old_staff);
    const row = {
      discord_id: p.user_id, username: p.username || 'Unknown',
      position: p.position_role_name || null, category,
      join_date: p.join_date || null, roblox_username: p.roblox || null,
      roblox_id: p.roblox_id || null, notes: p.note || null, source: 'milweb'
    };
    const { data: existing } = await supabase.from('crd_staff').select('id').eq('discord_id', p.user_id).limit(1);
    if (existing && existing.length) {
      let res = await supabase.from('crd_staff').update(row).eq('id', existing[0].id);
      if (res.error && isSchemaErr(res.error)) { delete row.source; res = await supabase.from('crd_staff').update(row).eq('id', existing[0].id); }
      result.staffUpdated++;
    } else {
      row.created_at = new Date().toISOString();
      let res = await supabase.from('crd_staff').insert(row);
      if (res.error && isSchemaErr(res.error)) { delete row.source; res = await supabase.from('crd_staff').insert(row); }
      if (!res.error) result.staffAdded++;
    }
  }

  const { data: cases, error: cErr } = await supabase.from('cases').select('*').or('deleted.is.null,deleted.eq.false');
  if (cErr) { result.notes.push('MilWeb cases not reachable: ' + cErr.message); }
  for (const c of (cases || [])) {
    const category = caseCategory(c);
    const violations = Array.isArray(c.violations) ? c.violations.join('; ') : (c.violations || null);
    const row = {
      number: c.number, category,
      subject_id: c.subject_id || null, subject_username: c.subject_username || 'Unknown',
      date_opened: c.date_submitted || c.date_opened || Math.floor(Date.now() / 1000),
      subject_matter: violations, status: c.status || 'On file',
      department: c.dept || null, outcome: c.sanction || null, source: 'milweb'
    };
    let res = await supabase.from('crd_cases').upsert(row, { onConflict: 'number' });
    if (res.error && isSchemaErr(res.error)) {
      delete row.source; delete row.department; delete row.outcome;
      res = await supabase.from('crd_cases').upsert(row, { onConflict: 'number' });
    }
    if (!res.error) result.casesAdded++;
  }

  await audit('sync_milweb', session, `synced ${result.staffAdded + result.staffUpdated} staff, ${result.casesAdded} cases from MilWeb`);
  return result;
}

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

  if (body.action === 'sync_milweb') {
    try {
      const r = await syncMilweb(session);
      return json(200, { ok: true, result: r });
    } catch (e) {
      return json(200, { ok: false, error: e.message });
    }
  }

  return json(400, { error: 'Unknown action' });
};
