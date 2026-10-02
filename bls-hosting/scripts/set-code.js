'use strict';

require('./_sqlite-guard');

// Rotates a global access code
// usage  node scripts/set-code.js admin "NewCode123!"
const { db } = require('../src/lib/db');
const codes = require('../src/lib/codes');

const role = String(process.argv[2] || '').toLowerCase();
const plain = process.argv[3];

if (!['admin', 'viewer'].includes(role) || !plain) {
  console.error('usage  node scripts/set-code.js <admin|viewer> "<new code>"');
  process.exit(1);
}
if (plain.length < 8) {
  console.error('pick a code of at least 8 characters');
  process.exit(1);
}

const existing = db
  .prepare("SELECT id FROM access_codes WHERE scope = 'global' AND role = ? AND revoked = 0")
  .all(role);
for (const row of existing) codes.revokeCode(row.id);

codes.createCode({
  code: plain,
  label: role === 'admin' ? 'Admin' : 'Viewer',
  role,
  scope: 'global',
  createdBy: 'console',
});

console.log(`global ${role} code replaced  old sessions using it were dropped`);
