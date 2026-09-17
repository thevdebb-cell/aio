// CRD records: staff profiles and cases, across the 4 categories
// (active, inactive, before_revamp, archived). Everyone logged in can read.
// Every write needs whitelist.

const { supabase, json, preflight, getSession, levelOf, audit, robloxAvatar, signedDownloadUrl } = require('./_common');

const CATS = ['active', 'inactive', 'before_revamp', 'archived'];

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch { /* not json */ }
    return v.split('\n').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function mapStaff(s) {
  return {
    id: s.id,
    discordId: s.discord_id,
    username: s.username,
    position: s.position,
    category: s.category,
    joinDate: s.join_date,
    approxEra: s.approx_era,
    roblox: s.roblox_username,
    robloxId: s.roblox_id,
    robloxAvatar: robloxAvatar(s.roblox_id),
    notes: s.notes,
    classified: !!s.classified,
    documents: asArray(s.documents),
    addedBy: s.added_by,
    createdAt: s.created_at
  };
}

function mapCase(c) {
  return {
    number: c.number,
    category: c.category,
    subjectId: c.subject_id,
    subjectUsername: c.subject_username,
    date: c.date_opened,
    approxDate: c.approx_date,
    subjectMatter: c.subject_matter,
    testimony: c.testimony,
    proof: asArray(c.proof),
    documents: asArray(c.documents),
    authorizations: asArray(c.authorizations),
    status: c.status,
    classified: !!c.classified,
    addedBy: c.added_by,
    createdAt: c.created_at
  };
}

exports.handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad body' }); }

  const session = await getSession(body.token);
  if (!session) return json(401, { error: 'Not logged in' });
  const isOwner = levelOf(session) === 'whitelist';

  const cat = CATS.includes(body.category) ? body.category : null;

  // ---------------- READ (any logged in reader) ----------------

  if (body.action === 'list_staff') {
    let q = supabase.from('crd_staff').select('*').order('username', { ascending: true });
    if (cat) q = q.eq('category', cat);
    const { data } = await q;
    return json(200, { staff: (data || []).map(mapStaff) });
  }

  if (body.action === 'list_cases') {
    let q = supabase.from('crd_cases').select('*').order('created_at', { ascending: false });
    if (cat) q = q.eq('category', cat);
    const { data } = await q;
    return json(200, { cases: (data || []).map(mapCase) });
  }

  if (body.action === 'get_staff') {
    const { data } = await supabase.from('crd_staff').select('*').eq('id', body.id).maybeSingle();
    if (!data) return json(200, { found: false });
    return json(200, { found: true, staff: mapStaff(data) });
  }

  if (body.action === 'get_case') {
    const { data } = await supabase.from('crd_cases').select('*').eq('number', body.number).maybeSingle();
    if (!data) return json(200, { found: false });
    return json(200, { found: true, case: mapCase(data) });
  }

  // global search across every category, staff + cases at once
  if (body.action === 'search') {
    const q = String(body.query || '').trim().toLowerCase();
    if (!q) return json(200, { staff: [], cases: [] });
    const { data: staff } = await supabase.from('crd_staff').select('*');
    const { data: cases } = await supabase.from('crd_cases').select('*');
    const st = (staff || []).filter((s) =>
      (s.username || '').toLowerCase().includes(q) ||
      (s.discord_id || '').toLowerCase().includes(q) ||
      (s.position || '').toLowerCase().includes(q) ||
      (s.roblox_username || '').toLowerCase().includes(q));
    const cs = (cases || []).filter((c) =>
      (c.number || '').toLowerCase().includes(q) ||
      (c.subject_username || '').toLowerCase().includes(q) ||
      (c.subject_id || '').toLowerCase().includes(q) ||
      (c.subject_matter || '').toLowerCase().includes(q));
    return json(200, { staff: st.map(mapStaff), cases: cs.map(mapCase) });
  }

  // roblox username -> id/avatar auto-fetch, used by the "add profile" forms
  if (body.action === 'roblox_lookup') {
    const uname = String(body.username || '').trim();
    if (!uname) return json(200, { found: false });
    try {
      const r = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [uname], excludeBannedUsers: false })
      });
      const j = await r.json();
      const hit = j && j.data && j.data[0];
      if (!hit) return json(200, { found: false });
      return json(200, { found: true, robloxId: hit.id, username: hit.name, avatar: robloxAvatar(hit.id) });
    } catch {
      return json(200, { found: false });
    }
  }

  // homepage counters, one round trip
  if (body.action === 'counts') {
    const { data: staff } = await supabase.from('crd_staff').select('category');
    const { data: cases } = await supabase.from('crd_cases').select('category');
    const count = (rows, c) => (rows || []).filter((r) => r.category === c).length;
    const out = {};
    for (const c of CATS) out[c] = { staff: count(staff, c), cases: count(cases, c) };
    return json(200, { counts: out });
  }

  // one-shot dashboard payload: counts + recent cases + recent activity
  if (body.action === 'dashboard') {
    const { data: staff } = await supabase.from('crd_staff').select('category');
    const { data: allCases } = await supabase.from('crd_cases').select('*').order('created_at', { ascending: false });
    const count = (rows, c) => (rows || []).filter((r) => r.category === c).length;
    const counts = {};
    for (const c of CATS) counts[c] = { staff: count(staff, c), cases: count(allCases, c) };
    const recentCases = (allCases || []).slice(0, 6).map(mapCase);
    let activity = [];
    if (isOwner) {
      const { data: aud } = await supabase.from('crd_audit').select('*').order('id', { ascending: false }).limit(8);
      activity = aud || [];
    }
    const totals = {
      staff: (staff || []).length,
      cases: (allCases || []).length
    };
    return json(200, { counts, totals, recentCases, activity, isOwner });
  }

  // ---------------- WRITE (whitelist only) ----------------
  if (!isOwner) return json(403, { error: 'View only - ask a whitelisted member for changes.' });

  if (body.action === 'create_staff') {
    const f = body.fields || {};
    if (!f.username) return json(400, { error: 'Username is required.' });
    const row = {
      discord_id: f.discordId || null,
      username: f.username,
      position: f.position || null,
      category: CATS.includes(f.category) ? f.category : 'active',
      join_date: f.joinDate || null,
      approx_era: f.approxEra || null,
      roblox_username: f.roblox || null,
      roblox_id: f.robloxId || null,
      notes: f.notes || null,
      classified: !!f.classified,
      documents: [],
      added_by: session.username,
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('crd_staff').insert(row).select().maybeSingle();
    if (error) return json(400, { error: error.message });
    await audit('create_staff', session, `added staff ${f.username} (${row.category})`);
    return json(200, { ok: true, staff: mapStaff(data) });
  }

  if (body.action === 'edit_staff') {
    const f = body.fields || {};
    const update = {};
    ['discord_id', 'username', 'position', 'join_date', 'approx_era', 'roblox_username', 'roblox_id', 'notes']
      .forEach((k) => { const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); if (f[camel] !== undefined) update[k] = f[camel] || null; });
    if (f.category !== undefined && CATS.includes(f.category)) update.category = f.category;
    if (f.classified !== undefined) update.classified = !!f.classified;
    if (Object.keys(update).length === 0) return json(400, { error: 'Nothing to update' });
    await supabase.from('crd_staff').update(update).eq('id', body.id);
    await audit('edit_staff', session, `edited staff #${body.id}`);
    return json(200, { ok: true });
  }

  if (body.action === 'delete_staff') {
    await supabase.from('crd_staff').delete().eq('id', body.id);
    await audit('delete_staff', session, `deleted staff #${body.id}`);
    return json(200, { ok: true });
  }

  if (body.action === 'create_case') {
    const f = body.fields || {};
    const category = CATS.includes(f.category) ? f.category : 'active';
    const year = new Date().getFullYear();
    const key = `crd-${year}`;
    const { data: cnt } = await supabase.from('crd_counters').select('value').eq('key', key).maybeSingle();
    const n = (cnt ? cnt.value : 0) + 1;
    await supabase.from('crd_counters').upsert({ key, value: n });
    const number = `CRD-${year}-${String(n).padStart(4, '0')}`;

    const row = {
      number, category,
      subject_id: f.subjectId || null,
      subject_username: f.subjectUsername || 'Unknown',
      date_opened: Math.floor(Date.now() / 1000),
      approx_date: f.approxDate || null,
      subject_matter: f.subjectMatter || null,
      testimony: f.testimony || null,
      proof: [],
      documents: [],
      authorizations: asArray(f.authorizations),
      status: f.status || (category === 'active' ? 'Active' : category === 'inactive' ? 'Expired' : 'On file'),
      classified: !!f.classified,
      added_by: session.username,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('crd_cases').insert(row);
    if (error) return json(400, { error: error.message });
    await audit('create_case', session, `added case ${number} (${category})`);
    return json(200, { ok: true, number });
  }

  if (body.action === 'edit_case') {
    const f = body.fields || {};
    const update = {};
    ['subject_id', 'subject_username', 'approx_date', 'subject_matter', 'testimony', 'status']
      .forEach((k) => { const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); if (f[camel] !== undefined) update[k] = f[camel] || null; });
    if (f.category !== undefined && CATS.includes(f.category)) update.category = f.category;
    if (f.classified !== undefined) update.classified = !!f.classified;
    if (f.authorizations !== undefined) update.authorizations = asArray(f.authorizations);
    if (Object.keys(update).length === 0) return json(400, { error: 'Nothing to update' });
    await supabase.from('crd_cases').update(update).eq('number', body.number);
    await audit('edit_case', session, `edited case ${body.number}`);
    return json(200, { ok: true });
  }

  if (body.action === 'delete_case') {
    await supabase.from('crd_cases').delete().eq('number', body.number);
    await audit('delete_case', session, `deleted case ${body.number}`);
    return json(200, { ok: true });
  }

  // one click move to archive from any tile (staff or case)
  if (body.action === 'archive_staff') {
    await supabase.from('crd_staff').update({ category: 'archived', classified: true }).eq('id', body.id);
    await audit('archive_staff', session, `archived staff #${body.id}`);
    return json(200, { ok: true });
  }
  if (body.action === 'archive_case') {
    await supabase.from('crd_cases').update({ category: 'archived', classified: true }).eq('number', body.number);
    await audit('archive_case', session, `archived case ${body.number}`);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action' });
};
