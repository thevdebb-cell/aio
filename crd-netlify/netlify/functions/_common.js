// Shared helper for all CRD functions.
// The SUPABASE SERVICE KEY lives ONLY here (server side), never in the browser.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FILE_BUCKET = 'crd-files';

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(obj)
  };
}

// Preflight helper for browsers (functions can call this first).
function preflight(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  return null;
}

// Read the session from a token. Returns the session row or null.
async function getSession(token) {
  if (!token) return null;
  const { data } = await supabase.from('crd_sessions').select('*').eq('token', token).maybeSingle();
  if (!data || !data.active || !data.discord_id) return null;
  return data;
}

// Only two levels here: 'whitelist' (full read/write) or 'reader' (view only).
// Being logged in at all already means the bot authorized this person.
function levelOf(session) {
  if (!session) return 'none';
  return session.is_whitelist ? 'whitelist' : 'reader';
}

async function audit(action, actor, detail) {
  try {
    await supabase.from('crd_audit').insert({
      action,
      actor_id: actor ? actor.discord_id : null,
      actor_name: actor ? actor.username : null,
      detail
    });
  } catch (e) { /* auditing must never break a request */ }
}

// Roblox avatar helper (headshot) from a roblox user id
function robloxAvatar(robloxId) {
  if (!robloxId) return null;
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`;
}

// ---------- Storage: signed upload / download for any file format ----------

// A short-lived signed URL the browser can GET/stream/download.
async function signedDownloadUrl(path, downloadName) {
  if (!path) return null;
  const opts = downloadName ? { download: downloadName } : undefined;
  const { data, error } = await supabase.storage
    .from(FILE_BUCKET)
    .createSignedUrl(path, 60 * 60, opts); // 1 hour
  if (error) return null;
  return data.signedUrl;
}

module.exports = {
  supabase, FILE_BUCKET, json, preflight,
  getSession, levelOf, audit, robloxAvatar, signedDownloadUrl
};
