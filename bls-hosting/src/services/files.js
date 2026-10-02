'use strict';

const fs = require('fs');
const path = require('path');
const fflate = require('fflate');
const config = require('../config');
const util = require('../lib/util');

const MAX_EDIT_BYTES = 2 * 1024 * 1024;
const MAX_UNPACK_BYTES = 2 * 1024 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', '.cache']);
const GUARDED = new Set(['.env']);

function guard(target) {
  if (GUARDED.has(path.basename(target).toLowerCase())) {
    throw new Error('The env file is managed in the Environment tab');
  }
}

function dirOf(deployment) {
  const dir = util.deploymentDir(deployment.slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listDir(deployment, relative = '') {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  if (!fs.existsSync(target)) throw new Error('Folder not found');
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) throw new Error('That path is a file');

  const entries = fs.readdirSync(target, { withFileTypes: true }).map((entry) => {
    const full = path.join(target, entry.name);
    let size = 0;
    let modified = null;
    try {
      const info = fs.statSync(full);
      size = info.size;
      modified = info.mtime.toISOString();
    } catch {}
    const rel = util.toPosix(path.relative(base, full));
    return {
      name: entry.name,
      path: rel,
      kind: entry.isDirectory() ? 'dir' : 'file',
      size,
      modified,
      editable: entry.isFile() && size <= MAX_EDIT_BYTES && util.looksText(entry.name),
      heavy: entry.isDirectory() && SKIP_DIRS.has(entry.name),
    };
  });

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });

  return {
    path: util.toPosix(path.relative(base, target)),
    parent: target === base ? null : util.toPosix(path.relative(base, path.dirname(target))),
    entries,
  };
}

// Flat list of candidate entry points for the startup picker
function startupCandidates(deployment, kind) {
  const base = dirOf(deployment);
  const matcher = kind === 'python' ? /\.py$/i : /\.(js|mjs|cjs|ts)$/i;
  const found = [];
  const walk = (current, depth) => {
    if (depth > 3 || found.length > 400) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(current, entry.name), depth + 1);
      } else if (entry.isFile() && (matcher.test(entry.name) || /\.(bat|cmd|ps1|exe|jar)$/i.test(entry.name))) {
        found.push(util.toPosix(path.relative(base, path.join(current, entry.name))));
      }
    }
  };
  walk(base, 0);
  return found.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

function readFile(deployment, relative) {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('File not found');
  const stat = fs.statSync(target);
  guard(target);
  if (stat.size > MAX_EDIT_BYTES) throw new Error('File is too large for the editor');
  if (!util.looksText(target)) throw new Error('That file is not text');
  return {
    path: util.toPosix(path.relative(base, target)),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    content: fs.readFileSync(target, 'utf8'),
  };
}

function writeFile(deployment, relative, content) {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  guard(target);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) throw new Error('That path is a folder');
  if (!util.looksText(target)) throw new Error('Only text files can be edited here');
  const body = String(content ?? '');
  if (Buffer.byteLength(body) > MAX_EDIT_BYTES) throw new Error('File is too large to save');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.bls-tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, target);
  const stat = fs.statSync(target);
  return { path: util.toPosix(path.relative(base, target)), size: stat.size, modified: stat.mtime.toISOString() };
}

function createEntry(deployment, relative, kind) {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  if (fs.existsSync(target)) throw new Error('That name already exists');
  if (kind === 'dir') {
    fs.mkdirSync(target, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '', 'utf8');
  }
  return { path: util.toPosix(path.relative(base, target)), kind };
}

function renameEntry(deployment, relative, nextRelative) {
  const base = dirOf(deployment);
  const from = util.safeJoin(base, relative);
  const to = util.safeJoin(base, nextRelative);
  if (!from || !to) throw new Error('Path leaves the deployment folder');
  if (!fs.existsSync(from)) throw new Error('Source not found');
  if (fs.existsSync(to)) throw new Error('Target already exists');
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return { path: util.toPosix(path.relative(base, to)) };
}

function deleteEntry(deployment, relative) {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  if (target === base) throw new Error('The root folder cannot be deleted');
  if (!fs.existsSync(target)) throw new Error('Nothing to delete there');
  util.rmrf(target);
  return { path: util.toPosix(path.relative(base, target)) };
}

function filePathFor(deployment, relative) {
  const base = dirOf(deployment);
  const target = util.safeJoin(base, relative);
  if (!target) throw new Error('Path leaves the deployment folder');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('File not found');
  return target;
}

// --- archives -----------------------------------------------------------------

function extractArchive(deployment, buffer, { clean = false, onLog = () => {} } = {}) {
  const base = dirOf(deployment);
  let files;
  try {
    files = fflate.unzipSync(new Uint8Array(buffer));
  } catch (err) {
    throw new Error('That archive could not be read  upload a plain zip file');
  }
  const names = Object.keys(files);
  if (!names.length) throw new Error('The archive is empty');

  let totalBytes = 0;
  for (const name of names) totalBytes += files[name].length;
  if (totalBytes > MAX_UNPACK_BYTES) throw new Error('Archive content is too large');

  // A zip that wraps everything in one folder gets flattened  unsafe entries never
  // count towards that decision so a crafted archive cannot defeat the flattening
  const safeNames = new Set(names.filter(
    (name) => !path.isAbsolute(name) && !name.split('/').includes('..') && !/^[A-Za-z]:/.test(name)
  ));
  const roots = new Set([...safeNames].map((name) => name.split('/')[0]));
  const rootFiles = [...safeNames].filter((name) => !name.includes('/'));
  let strip = '';
  if (roots.size === 1 && rootFiles.length === 0) strip = `${[...roots][0]}/`;

  if (clean) {
    onLog('clearing the deployment folder');
    for (const entry of fs.readdirSync(base)) {
      util.rmrf(path.join(base, entry));
    }
  }

  let written = 0;
  let skipped = 0;
  for (const name of names) {
    if (!safeNames.has(name)) {
      skipped += 1;
      continue;
    }
    const relative = strip && name.startsWith(strip) ? name.slice(strip.length) : name;
    if (!relative || relative.endsWith('/')) continue;
    const target = util.safeJoin(base, relative);
    if (!target) {
      skipped += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(files[name]));
    written += 1;
  }
  onLog(`archive unpacked  ${written} files${skipped ? `  ${skipped} entries skipped as unsafe` : ''}`);
  return { written, skipped, bytes: totalBytes, stripped: strip.replace(/\/$/, '') || null };
}

function buildZip(deployment) {
  const base = dirOf(deployment);
  const payload = {};
  let total = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        total += stat.size;
        if (total > 512 * 1024 * 1024) throw new Error('Deployment is too large to zip here');
        payload[util.toPosix(path.relative(base, full))] = new Uint8Array(fs.readFileSync(full));
      }
    }
  };
  walk(base);
  if (!Object.keys(payload).length) throw new Error('Nothing to download yet');
  return Buffer.from(fflate.zipSync(payload, { level: 6 }));
}

module.exports = {
  listDir,
  startupCandidates,
  readFile,
  writeFile,
  createEntry,
  renameEntry,
  deleteEntry,
  filePathFor,
  extractArchive,
  buildZip,
  MAX_EDIT_BYTES,
};
