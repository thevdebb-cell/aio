'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const APP_DIR = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(APP_DIR, '.env'));

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};
const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const isWindows = process.platform === 'win32';
const defaultRoot = isWindows ? 'C:\\bls' : path.join(APP_DIR, 'var');
const root = process.env.BLS_ROOT && process.env.BLS_ROOT.trim() ? process.env.BLS_ROOT.trim() : defaultRoot;

const dirs = {
  root,
  data: path.join(root, 'data'),
  deployments: path.join(root, 'deployments'),
  runtimes: path.join(root, 'runtimes'),
  logs: path.join(root, 'logs'),
  backups: path.join(root, 'backups'),
  tmp: path.join(root, 'tmp'),
};

for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

let secret = process.env.BLS_SECRET;
if (!secret || secret.length < 32 || secret === 'change-me-to-64-random-hex-chars') {
  const keyFile = path.join(dirs.data, 'secret.key');
  if (fs.existsSync(keyFile)) {
    secret = fs.readFileSync(keyFile, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(keyFile, secret, { mode: 0o600 });
  }
}

const publicUrl = (process.env.BLS_PUBLIC_URL || '').trim().replace(/\/+$/, '');

const config = {
  appDir: APP_DIR,
  isWindows,
  host: process.env.BLS_HOST || '127.0.0.1',
  port: int(process.env.BLS_PORT, 3300),
  publicUrl,
  secureCookies: publicUrl.startsWith('https://'),
  secret,
  sessionMinutes: int(process.env.BLS_SESSION_MINUTES, 720),
  portMin: int(process.env.BLS_PORT_MIN, 3400),
  portMax: int(process.env.BLS_PORT_MAX, 3499),
  ramReserveMb: int(process.env.BLS_RAM_RESERVE_MB, 1536),
  allowOvercommit: bool(process.env.BLS_ALLOW_OVERCOMMIT, true),
  maxUploadMb: int(process.env.BLS_MAX_UPLOAD_MB, 256),
  consoleLines: int(process.env.BLS_CONSOLE_LINES, 2000),
  loginMaxAttempts: int(process.env.BLS_LOGIN_MAX_ATTEMPTS, 8),
  loginWindowMinutes: int(process.env.BLS_LOGIN_WINDOW_MINUTES, 15),
  seedAdminCode: process.env.BLS_SEED_ADMIN_CODE || '',
  seedViewerCode: process.env.BLS_SEED_VIEWER_CODE || '',
  dirs,
  hostTotalRamMb: Math.floor(os.totalmem() / 1024 / 1024),
};

config.ramPoolMb = Math.max(256, config.hostTotalRamMb - config.ramReserveMb);

module.exports = config;
