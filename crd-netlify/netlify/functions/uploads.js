// ============================================================
//  CRD uploads  -  evidence & documents, ANY file format.
//
//  Big files (audio / video / zip) never pass through the
//  function: the browser uploads straight to Supabase Storage
//  with a short-lived signed URL we mint here (service key).
//
//  Actions:
//    sign_upload   (whitelist) -> { path, url }   browser PUTs the file to url
//    attach        (whitelist) -> record the uploaded file on a case/staff
//    remove        (whitelist) -> delete a file from a case/staff + storage
//    sign_download (any reader)-> { url }          short-lived link to view/download
// ============================================================

const crypto = require('crypto');
const { supabase, FILE_BUCKET, json, preflight, getSession, levelOf, audit, signedDownloadUrl } = require('./_common');

// where each kind of file lives inside the bucket
const SLOTS = {
  case_proof:     { table: 'crd_cases', key: 'number', col: 'proof' },
  case_documents: { table: 'crd_cases', key: 'number', col: 'documents' },
  staff_documents:{ table: 'crd_staff', key: 'id',     col: 'documents' }
};

function safeName(name) {
  return String(name || 'file')
    .normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-80) || 'file';
}

function slotFolder(slot, ownerId) {
  const clean = String(ownerId || 'misc').replace(/[^\w.\-]+/g, '_');
  if (slot === 'case_proof')      return `cases/${clean}/proof`;
  if (slot === 'case_documents')  return `cases/${clean}/documents`;
  if (slot === 'staff_documents') return `staff/${clean}/documents`;
  return `misc/${clean}`;
}

async function loadArray(slot, ownerId) {
  const s = SLOTS[slot];
  const { data } = await supabase.from(s.table).select(`${s.key}, ${s.col}`).eq(s.key, ownerId).maybeSingle();
  if (!data) return null;
  return Array.isArray(data[s.col]) ? data[s.col] : [];
}

async function saveArray(slot, ownerId, arr) {
  const s = SLOTS[slot];
  const patch = {}; patch[s.col] = arr;
  await supabase.from(s.table).update(patch).eq(s.key, ownerId);
}

exports.handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad body' }); }

  const session = await getSession(body.token);
  if (!session) return json(401, { error: 'Not logged in' });
  const isOwner = levelOf(session) === 'whitelist';

  // -------- download link (anyone logged in) --------
  if (body.action === 'sign_download') {
    const path = String(body.path || '');
    if (!path || path.includes('..')) return json(400, { error: 'Bad path' });
    const url = await signedDownloadUrl(path, body.name || undefined);
    if (!url) return json(404, { error: 'File not found' });
    return json(200, { url });
  }

  // everything below writes -> whitelist only
  if (!isOwner) return json(403, { error: 'View only - ask a whitelisted member for changes.' });

  const slot = SLOTS[body.slot] ? body.slot : null;

  if (body.action === 'sign_upload') {
    if (!slot) return json(400, { error: 'Unknown slot' });
    const folder = slotFolder(slot, body.ownerId);
    const path = `${folder}/${crypto.randomUUID()}-${safeName(body.name)}`;
    const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUploadUrl(path);
    if (error) return json(400, { error: error.message });
    let url = data.signedUrl;
    if (url && !/^https?:\/\//.test(url)) url = String(process.env.SUPABASE_URL).replace(/\/+$/, '') + url;
    return json(200, { path, url, token: data.token });
  }

  if (body.action === 'attach') {
    if (!slot) return json(400, { error: 'Unknown slot' });
    const arr = await loadArray(slot, body.ownerId);
    if (arr === null) return json(404, { error: 'Record not found' });
    const file = {
      path: body.path,
      name: body.name || 'file',
      type: body.type || 'application/octet-stream',
      size: Number(body.size) || 0,
      note: body.note || null,
      uploadedBy: session.username,
      uploadedAt: Math.floor(Date.now() / 1000)
    };
    arr.push(file);
    await saveArray(slot, body.ownerId, arr);
    await audit('attach_file', session, `${body.slot} on ${body.ownerId}: ${file.name}`);
    return json(200, { ok: true, file });
  }

  if (body.action === 'remove') {
    if (!slot) return json(400, { error: 'Unknown slot' });
    const arr = await loadArray(slot, body.ownerId);
    if (arr === null) return json(404, { error: 'Record not found' });
    const path = String(body.path || '');
    const next = arr.filter((f) => f.path !== path);
    await saveArray(slot, body.ownerId, next);
    if (path && !path.includes('..')) {
      try { await supabase.storage.from(FILE_BUCKET).remove([path]); } catch (e) { /* orphan is fine */ }
    }
    await audit('remove_file', session, `${body.slot} on ${body.ownerId}`);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action' });
};
