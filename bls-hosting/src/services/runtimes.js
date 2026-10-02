'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const fflate = require('fflate');
const config = require('../config');
const { db, nowIso } = require('../lib/db');

// Known good fallbacks  the installer still asks nodejs org for the newest patch first
const NODE_MAJORS = [
  { major: 24, fallback: '24.21.0', label: 'Node 24' },
  { major: 22, fallback: '22.23.3', label: 'Node 22' },
  { major: 20, fallback: '20.19.5', label: 'Node 20' },
  { major: 18, fallback: '18.20.8', label: 'Node 18' },
];

const PYTHON_VERSIONS = [
  { version: '3.13.9', label: 'Python 3 13' },
  { version: '3.12.11', label: 'Python 3 12' },
  { version: '3.11.9', label: 'Python 3 11' },
];

function catalog() {
  const items = [];
  for (const entry of NODE_MAJORS) {
    items.push({
      id: `node-${entry.major}`,
      kind: 'node',
      major: entry.major,
      label: entry.label,
      version: entry.fallback,
      family: 'JavaScript',
    });
  }
  for (const entry of PYTHON_VERSIONS) {
    items.push({
      id: `python-${entry.version.split('.').slice(0, 2).join('')}`,
      kind: 'python',
      label: entry.label,
      version: entry.version,
      family: 'Python',
    });
  }
  return items;
}

function installedRows() {
  return db.prepare('SELECT * FROM runtimes ORDER BY kind ASC, version DESC').all();
}

function listInstalled() {
  return installedRows().filter((row) => fs.existsSync(row.exe_path));
}

function resolve(id) {
  const row = db.prepare('SELECT * FROM runtimes WHERE id = ?').get(id);
  if (!row) return null;
  if (!fs.existsSync(row.exe_path)) return null;
  return row;
}

function register({ id, kind, version, label, exePath, pkgPath }) {
  db.prepare(
    `INSERT INTO runtimes(id, kind, version, label, exe_path, pkg_path, installed_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, version=excluded.version,
       label=excluded.label, exe_path=excluded.exe_path, pkg_path=excluded.pkg_path,
       installed_at=excluded.installed_at`
  ).run(id, kind, version, label, exePath, pkgPath || null, nowIso());
  return resolve(id);
}

function remove(id) {
  db.prepare('DELETE FROM runtimes WHERE id = ?').run(id);
}

// Registers whatever node is running the panel so a fresh install always has one runtime
function registerSystemRuntime() {
  const major = process.versions.node.split('.')[0];
  const exe = process.execPath;
  const dir = path.dirname(exe);
  const npm = config.isWindows
    ? path.join(dir, 'npm.cmd')
    : path.join(dir, 'npm');
  return register({
    id: 'node-system',
    kind: 'node',
    version: process.versions.node,
    label: `Node ${major} host`,
    exePath: exe,
    pkgPath: fs.existsSync(npm) ? npm : null,
  });
}

async function resolveLatestNode(major) {
  try {
    const res = await fetch('https://nodejs.org/dist/index.json', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`index returned ${res.status}`);
    const list = await res.json();
    const match = list
      .map((entry) => String(entry.version).replace(/^v/, ''))
      .filter((version) => Number(version.split('.')[0]) === Number(major))
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        return pb[1] - pa[1] || pb[2] - pa[2];
      });
    if (match[0]) return match[0];
  } catch {
    // Offline or blocked  fall back to the pinned version
  }
  const entry = NODE_MAJORS.find((item) => item.major === Number(major));
  return entry ? entry.fallback : null;
}

async function download(url, destFile, onLog) {
  onLog(`fetching ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
  if (!res.ok) throw new Error(`download failed with status ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  const chunks = [];
  let seen = 0;
  let lastPct = -10;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    seen += chunk.length;
    if (total) {
      const pct = Math.floor((seen / total) * 100);
      if (pct - lastPct >= 10) {
        lastPct = pct;
        onLog(`downloaded ${pct} percent`);
      }
    }
  }
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(destFile, buffer);
  onLog(`saved ${(buffer.length / 1048576).toFixed(1)} MB`);
  return buffer;
}

function unzipTo(buffer, targetDir, onLog) {
  const files = fflate.unzipSync(new Uint8Array(buffer));
  const names = Object.keys(files);
  // Strip the single wrapping folder node ships inside its archive
  let strip = '';
  const firstSegments = new Set(names.map((name) => name.split('/')[0]));
  if (firstSegments.size === 1) strip = `${[...firstSegments][0]}/`;
  let written = 0;
  for (const name of names) {
    const data = files[name];
    const relative = strip && name.startsWith(strip) ? name.slice(strip.length) : name;
    if (!relative || relative.endsWith('/')) continue;
    if (relative.split('/').includes('..')) continue;
    const dest = path.join(targetDir, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(data));
    written += 1;
  }
  onLog(`extracted ${written} files`);
}

async function installNode(major, onLog) {
  const version = await resolveLatestNode(major);
  if (!version) throw new Error(`no known Node version for major ${major}`);
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  const folder = config.isWindows ? `node-v${version}-win-${arch}` : `node-v${version}-linux-${arch}`;
  const target = path.join(config.dirs.runtimes, folder);
  const exe = config.isWindows ? path.join(target, 'node.exe') : path.join(target, 'bin', 'node');
  const npm = config.isWindows ? path.join(target, 'npm.cmd') : path.join(target, 'bin', 'npm');

  if (fs.existsSync(exe)) {
    onLog('already on disk  registering');
  } else {
    if (!config.isWindows) throw new Error('automatic Node install is supported on Windows only');
    fs.mkdirSync(target, { recursive: true });
    const url = `https://nodejs.org/dist/v${version}/${folder}.zip`;
    const tmp = path.join(config.dirs.tmp, `${folder}.zip`);
    const buffer = await download(url, tmp, onLog);
    unzipTo(buffer, target, onLog);
    try { fs.unlinkSync(tmp); } catch {}
  }
  if (!fs.existsSync(exe)) throw new Error('node executable missing after install');
  const row = register({
    id: `node-${major}`,
    kind: 'node',
    version,
    label: `Node ${major}`,
    exePath: exe,
    pkgPath: fs.existsSync(npm) ? npm : null,
  });
  onLog(`Node ${version} ready`);
  return row;
}

function runInstaller(exe, args, onLog) {
  return new Promise((resolveDone, reject) => {
    onLog(`running installer  this can take a minute`);
    execFile(exe, args, { timeout: 20 * 60 * 1000, windowsHide: true }, (err, stdout, stderr) => {
      if (stdout) String(stdout).split(/\r?\n/).filter(Boolean).forEach(onLog);
      if (stderr) String(stderr).split(/\r?\n/).filter(Boolean).forEach(onLog);
      if (err) return reject(new Error(`installer exited with ${err.code ?? 'error'}`));
      resolveDone();
    });
  });
}

async function installPython(version, onLog) {
  if (!config.isWindows) throw new Error('automatic Python install is supported on Windows only');
  const short = version.split('.').slice(0, 2).join('');
  const target = path.join(config.dirs.runtimes, `python-${version}`);
  const exe = path.join(target, 'python.exe');
  const pip = path.join(target, 'Scripts', 'pip.exe');

  if (!fs.existsSync(exe)) {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
    const url = `https://www.python.org/ftp/python/${version}/python-${version}-${arch}.exe`;
    const tmp = path.join(config.dirs.tmp, `python-${version}.exe`);
    await download(url, tmp, onLog);
    await runInstaller(
      tmp,
      [
        '/quiet',
        'InstallAllUsers=0',
        'PrependPath=0',
        'Include_pip=1',
        'Include_test=0',
        'Include_launcher=0',
        'Shortcuts=0',
        'AssociateFiles=0',
        `TargetDir=${target}`,
      ],
      onLog
    );
    try { fs.unlinkSync(tmp); } catch {}
  } else {
    onLog('already on disk  registering');
  }
  if (!fs.existsSync(exe)) throw new Error('python executable missing after install');
  const row = register({
    id: `python-${short}`,
    kind: 'python',
    version,
    label: `Python ${version.split('.').slice(0, 2).join(' ')}`,
    exePath: exe,
    pkgPath: fs.existsSync(pip) ? pip : null,
  });
  onLog(`Python ${version} ready`);
  return row;
}

async function install(id, onLog = () => {}) {
  const entry = catalog().find((item) => item.id === id);
  if (!entry) throw new Error('unknown runtime');
  if (entry.kind === 'node') return installNode(entry.major, onLog);
  if (entry.kind === 'python') return installPython(entry.version, onLog);
  throw new Error('unsupported runtime kind');
}

// Builds the argv used to boot a deployment
function startCommand(runtime, deployment, deployDir) {
  const startup = deployment.startup_file || '';
  const extra = String(deployment.extra_args || '').trim();
  const extraArgs = extra ? extra.split(/\s+/) : [];

  if (runtime.kind === 'node') {
    const heap = Math.max(64, Math.floor(deployment.ram_mb * 0.85));
    return {
      exe: runtime.exe_path,
      args: [`--max-old-space-size=${heap}`, startup, ...extraArgs],
      shell: false,
    };
  }
  if (runtime.kind === 'python') {
    return { exe: runtime.exe_path, args: ['-u', startup, ...extraArgs], shell: false };
  }
  const lower = startup.toLowerCase();
  if (lower.endsWith('.bat') || lower.endsWith('.cmd') || lower.endsWith('.ps1') || lower.endsWith('.exe')) {
    return { exe: path.join(deployDir, startup), args: extraArgs, shell: false };
  }
  return { exe: runtime.exe_path, args: [startup, ...extraArgs], shell: false };
}

function installCommand(runtime, deployment, deployDir) {
  const custom = String(deployment.install_cmd || '').trim();
  if (custom) return { exe: null, args: [], raw: custom };
  if (runtime.kind === 'node') {
    if (!fs.existsSync(path.join(deployDir, 'package.json'))) return null;
    const hasLock = fs.existsSync(path.join(deployDir, 'package-lock.json'));
    const npm = runtime.pkg_path;
    if (!npm) return null;
    return { exe: npm, args: [hasLock ? 'ci' : 'install', '--omit=dev', '--no-audit', '--no-fund'], raw: null };
  }
  if (runtime.kind === 'python') {
    if (!fs.existsSync(path.join(deployDir, 'requirements.txt'))) return null;
    return { exe: runtime.exe_path, args: ['-m', 'pip', 'install', '--no-input', '-r', 'requirements.txt'], raw: null };
  }
  return null;
}

// Guesses a sensible entry point right after an archive lands
function guessStartup(deployDir, kind) {
  const candidates =
    kind === 'python'
      ? ['main.py', 'bot.py', 'app.py', 'run.py', 'index.py', '__main__.py']
      : ['index.js', 'bot.js', 'main.js', 'app.js', 'server.js', 'start.js', 'src/index.js', 'src/bot.js'];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(deployDir, candidate))) return candidate;
  }
  if (kind === 'node') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(deployDir, 'package.json'), 'utf8'));
      if (pkg.main && fs.existsSync(path.join(deployDir, pkg.main))) return pkg.main;
    } catch {}
  }
  try {
    const found = fs
      .readdirSync(deployDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .find((name) => (kind === 'python' ? name.endsWith('.py') : /\.(js|mjs|cjs)$/.test(name)));
    if (found) return found;
  } catch {}
  return '';
}

module.exports = {
  catalog,
  listInstalled,
  installedRows,
  resolve,
  register,
  remove,
  registerSystemRuntime,
  install,
  startCommand,
  installCommand,
  guessStartup,
};
