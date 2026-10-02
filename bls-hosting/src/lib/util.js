'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const config = require('../config');

const RESERVED_SLUGS = new Set(['new', 'api', 'panel', 'static', 'public', 'data', 'logs']);

function slugify(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function validName(name) {
  const value = String(name || '').trim();
  if (value.length < 2 || value.length > 48) return 'Name needs between 2 and 48 characters';
  if (!/^[\w][\w .-]*$/.test(value)) return 'Name may use letters digits space dot dash and underscore only';
  const slug = slugify(value);
  if (!slug) return 'Name must contain at least one letter or digit';
  if (RESERVED_SLUGS.has(slug)) return 'That name is reserved';
  return null;
}

function validEnvKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(String(key || ''));
}

function deploymentDir(slug) {
  return path.join(config.dirs.deployments, slug);
}

function logDir(slug) {
  return path.join(config.dirs.logs, slug);
}

// Resolves a user supplied relative path inside a deployment and refuses anything
// that escapes the folder  symlinks included
function safeJoin(baseDir, relative) {
  const base = path.resolve(baseDir);
  const cleaned = String(relative || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (cleaned.split('/').some((part) => part === '..')) return null;
  const target = path.resolve(base, cleaned);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try {
    const real = fs.realpathSync(target);
    const realBase = fs.realpathSync(base);
    const realRel = path.relative(realBase, real);
    if (realRel.startsWith('..') || path.isAbsolute(realRel)) return null;
  } catch {
    // Target does not exist yet which is fine for writes
  }
  return target;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}

function dirSize(dir) {
  let total = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {}
      }
    }
  };
  walk(dir);
  return total;
}

function portFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function nextFreePort(taken = []) {
  const used = new Set(taken.map(Number));
  for (let port = config.portMin; port <= config.portMax; port += 1) {
    if (used.has(port)) continue;
    if (await portFree(port)) return port;
  }
  return null;
}

function humanBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.json', '.jsonc', '.py', '.txt', '.md', '.env', '.yml', '.yaml',
  '.toml', '.ini', '.cfg', '.conf', '.sql', '.html', '.htm', '.css', '.scss', '.xml', '.csv',
  '.sh', '.bat', '.ps1', '.gitignore', '.npmrc', '.lock', '.log', '.properties', '.jsx', '.tsx',
]);

function looksText(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  if (!ext && /^(dockerfile|procfile|makefile|license|readme)$/i.test(path.basename(file))) return true;
  return false;
}

module.exports = {
  slugify,
  validName,
  validEnvKey,
  deploymentDir,
  logDir,
  safeJoin,
  toPosix,
  rmrf,
  dirSize,
  portFree,
  nextFreePort,
  humanBytes,
  looksText,
};
