'use strict';

const crypto = require('crypto');
const config = require('../config');
const { db, nowIso, audit } = require('./db');
const codes = require('./codes');

const COOKIE = 'bls_session';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM login_attempts WHERE at < ?').run(cutoff);
}

function attemptState(ip) {
  const since = new Date(Date.now() - config.loginWindowMinutes * 60000).toISOString();
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ok = 0 AND at >= ?')
    .get(ip, since);
  const failed = row ? row.n : 0;
  return { failed, locked: failed >= config.loginMaxAttempts, left: Math.max(0, config.loginMaxAttempts - failed) };
}

function recordAttempt(ip, ok) {
  db.prepare('INSERT INTO login_attempts(ip, ok, at) VALUES(?, ?, ?)').run(ip, ok ? 1 : 0, nowIso());
  if (ok) db.prepare('DELETE FROM login_attempts WHERE ip = ? AND ok = 0').run(ip);
}

function createSession(req, res, code) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + config.sessionMinutes * 60000);
  db.prepare(
    `INSERT INTO sessions(token_hash, csrf, code_id, role, scope, deployment_id, label, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sha256(token),
    csrf,
    code.id,
    code.role,
    code.scope,
    code.deployment_id,
    code.label,
    nowIso(),
    nowIso(),
    expires.toISOString(),
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 250)
  );
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.sessionMinutes * 60}`,
  ];
  if (config.secureCookies) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
  codes.touchCode(code.id);
  return { token, csrf, expires };
}

function readSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!row) return null;
  if (row.expires_at < nowIso()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  const slide = new Date(Date.now() + config.sessionMinutes * 60000).toISOString();
  db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
    nowIso(),
    slide,
    row.id
  );
  return row;
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (config.secureCookies) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// --- middleware ---------------------------------------------------------------

function attachSession(req, res, next) {
  req.session = readSession(req);
  req.clientIp = clientIp(req);
  next();
}

function requireSession(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Session expired  sign in again' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'Session expired  sign in again' });
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Viewer role is read only' });
  }
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session) return res.status(401).json({ error: 'Session expired  sign in again' });
  const sent = req.get('x-bls-csrf') || (req.body && req.body._csrf) || '';
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(req.session.csrf));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Bad request token  reload the page' });
  }
  next();
}

// A deployment scoped session may only touch its own deployment
function scopeAllows(session, deploymentId) {
  if (!session) return false;
  if (session.scope === 'global') return true;
  return Number(session.deployment_id) === Number(deploymentId);
}

function requireScope(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad deployment id' });
  if (!scopeAllows(req.session, id)) {
    return res.status(403).json({ error: 'This code does not open that deployment' });
  }
  next();
}

function actorOf(session) {
  if (!session) return 'anonymous';
  return `${session.label} (${session.role})`;
}

function log(req, action, target, detail) {
  audit({
    actor: actorOf(req.session),
    role: req.session ? req.session.role : 'anonymous',
    action,
    target: target || '',
    detail: detail || '',
    ip: req.clientIp || clientIp(req),
  });
}

module.exports = {
  COOKIE,
  parseCookies,
  sha256,
  clientIp,
  pruneSessions,
  attemptState,
  recordAttempt,
  createSession,
  readSession,
  destroySession,
  attachSession,
  requireSession,
  requireAdmin,
  requireCsrf,
  requireScope,
  scopeAllows,
  actorOf,
  log,
};
