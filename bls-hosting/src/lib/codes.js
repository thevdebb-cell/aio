'use strict';

const crypto = require('crypto');
const { db, nowIso, audit } = require('./db');
const config = require('../config');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashCode(code, salt) {
  return crypto
    .scryptSync(code.normalize('NFKC'), salt, SCRYPT.keylen, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      maxmem: 64 * 1024 * 1024,
    })
    .toString('hex');
}

// Keyed lookup index so a login attempt costs one scrypt pass and not one per stored code
function lookupOf(code) {
  return crypto
    .createHmac('sha256', config.secret)
    .update('access-code:' + code.normalize('NFKC'))
    .digest('hex');
}

function hintOf(code) {
  if (code.length <= 4) return code.slice(0, 1) + '***';
  return code.slice(0, 2) + '*'.repeat(Math.max(3, code.length - 4)) + code.slice(-2);
}

function createCode({ code, label, role, scope = 'global', deploymentId = null, createdBy = 'system' }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashCode(code, salt);
  const info = db
    .prepare(
      `INSERT INTO access_codes(label, role, scope, deployment_id, code_hash, code_salt, code_lookup, code_hint, created_at, created_by)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      label,
      role,
      scope,
      deploymentId,
      hash,
      salt,
      lookupOf(code),
      hintOf(code),
      nowIso(),
      createdBy
    );
  return Number(info.lastInsertRowid);
}

function generateCode() {
  const groups = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) =>
    Array.from({ length: n }, () => groups[crypto.randomInt(groups.length)]).join('');
  return `BLS-${pick(5)}-${pick(5)}`;
}

function verifyCode(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return null;
  const row = db
    .prepare('SELECT * FROM access_codes WHERE revoked = 0 AND code_lookup = ?')
    .get(lookupOf(trimmed));
  if (!row) {
    // Keep the timing of a miss close to the timing of a hit
    hashCode(trimmed, 'bls-decoy-salt');
    return null;
  }
  const a = Buffer.from(hashCode(trimmed, row.code_salt), 'hex');
  const b = Buffer.from(row.code_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return row;
}

function touchCode(id) {
  db.prepare('UPDATE access_codes SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?').run(
    nowIso(),
    id
  );
}

function revokeCode(id) {
  db.prepare('UPDATE access_codes SET revoked = 1 WHERE id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE code_id = ?').run(id);
}

function listCodes(deploymentId) {
  if (deploymentId === undefined) {
    return db
      .prepare('SELECT * FROM access_codes WHERE revoked = 0 ORDER BY scope DESC, id ASC')
      .all();
  }
  return db
    .prepare('SELECT * FROM access_codes WHERE revoked = 0 AND deployment_id = ? ORDER BY id ASC')
    .all(deploymentId);
}

function seedGlobalCodes() {
  const already = db
    .prepare("SELECT COUNT(*) AS n FROM access_codes WHERE scope = 'global'")
    .get().n;
  if (already > 0) return false;
  const admin = config.seedAdminCode;
  const viewer = config.seedViewerCode;
  if (!admin || !viewer) {
    console.warn('[bls] no seed codes configured  set BLS_SEED_ADMIN_CODE and BLS_SEED_VIEWER_CODE');
    return false;
  }
  createCode({ code: admin, label: 'Admin', role: 'admin', scope: 'global' });
  createCode({ code: viewer, label: 'Viewer', role: 'viewer', scope: 'global' });
  audit({ action: 'codes.seed', detail: 'global admin and viewer codes created' });
  return true;
}

module.exports = {
  createCode,
  generateCode,
  verifyCode,
  touchCode,
  revokeCode,
  listCodes,
  seedGlobalCodes,
  hintOf,
};
