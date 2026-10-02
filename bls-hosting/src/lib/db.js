'use strict';

const path = require('path');
const config = require('../config');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('node:sqlite is not available on this runtime');
  console.error('Run the panel through bin/bls.js on Node 22.5 or newer');
  throw err;
}

const dbFile = path.join(config.dirs.data, 'bls.db');
const db = new DatabaseSync(dbFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_codes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  scope         TEXT NOT NULL CHECK (scope IN ('global','deployment')),
  deployment_id INTEGER REFERENCES deployments(id) ON DELETE CASCADE,
  code_hash     TEXT NOT NULL,
  code_salt     TEXT NOT NULL,
  code_lookup   TEXT NOT NULL,
  code_hint     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL DEFAULT 'system',
  last_used_at  TEXT,
  use_count     INTEGER NOT NULL DEFAULT 0,
  revoked       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  csrf          TEXT NOT NULL,
  code_id       INTEGER REFERENCES access_codes(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  scope         TEXT NOT NULL,
  deployment_id INTEGER,
  label         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ip   TEXT NOT NULL,
  ok   INTEGER NOT NULL,
  at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_at ON login_attempts(ip, at);

CREATE TABLE IF NOT EXISTS runtimes (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  version      TEXT NOT NULL,
  label        TEXT NOT NULL,
  exe_path     TEXT NOT NULL,
  pkg_path     TEXT,
  installed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  runtime_id      TEXT NOT NULL,
  ram_mb          INTEGER NOT NULL,
  port            INTEGER,
  startup_file    TEXT NOT NULL DEFAULT '',
  install_cmd     TEXT NOT NULL DEFAULT '',
  extra_args      TEXT NOT NULL DEFAULT '',
  autostart       INTEGER NOT NULL DEFAULT 1,
  auto_restart    INTEGER NOT NULL DEFAULT 1,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_started_at TEXT,
  last_stopped_at TEXT,
  last_exit_code  INTEGER,
  last_exit_note  TEXT
);

CREATE TABLE IF NOT EXISTS env_vars (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL DEFAULT '',
  secret        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (deployment_id, key)
);

CREATE TABLE IF NOT EXISTS audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  actor         TEXT NOT NULL,
  role          TEXT NOT NULL,
  action        TEXT NOT NULL,
  target        TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
CREATE INDEX IF NOT EXISTS idx_access_codes_lookup ON access_codes(code_lookup);
`);

const nowIso = () => new Date().toISOString();

const getSetting = (key, fallback = null) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
};

const setSetting = (key, value) => {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
};

const audit = (entry) => {
  db.prepare(
    'INSERT INTO audit(at, actor, role, action, target, detail, ip) VALUES(?, ?, ?, ?, ?, ?, ?)'
  ).run(
    nowIso(),
    entry.actor || 'system',
    entry.role || 'system',
    entry.action,
    entry.target || '',
    entry.detail || '',
    entry.ip || ''
  );
};

module.exports = { db, dbFile, nowIso, getSetting, setSetting, audit };
