'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const config = require('../config');
const { db, nowIso, audit } = require('../lib/db');
const util = require('../lib/util');
const runtimes = require('./runtimes');

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const STOP_GRACE_MS = 8000;
const RESTART_DELAY_MS = 10000;
const CRASH_WINDOW_MS = 5 * 60 * 1000;
const CRASH_LIMIT = 5;

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** @type {Map<number, object>} */
const running = new Map();

function envSafeKeys() {
  return [
    'SystemRoot', 'windir', 'SystemDrive', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS',
    'OS', 'PROCESSOR_ARCHITECTURE', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'HOME', 'LANG', 'TZ', 'HOMEDRIVE', 'HOMEPATH', 'PUBLIC', 'ProgramData', 'ProgramFiles',
    'ProgramFiles(x86)', 'CommonProgramFiles',
  ];
}

function buildEnv(deployment, runtime) {
  const env = {};
  for (const key of envSafeKeys()) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  const runtimeDir = path.dirname(runtime.exe_path);
  const scripts = path.join(runtimeDir, 'Scripts');
  const sep = config.isWindows ? ';' : ':';
  const extra = [runtimeDir];
  if (fs.existsSync(scripts)) extra.push(scripts);
  env.PATH = [...extra, process.env.PATH || ''].filter(Boolean).join(sep);
  if (config.isWindows) env.Path = env.PATH;

  env.NODE_ENV = 'production';
  env.PYTHONUNBUFFERED = '1';
  env.PYTHONIOENCODING = 'utf-8';
  env.FORCE_COLOR = '0';
  env.NO_COLOR = '1';
  env.BLS_DEPLOYMENT = deployment.name;
  env.BLS_RAM_MB = String(deployment.ram_mb);
  if (deployment.port) {
    env.PORT = String(deployment.port);
    env.BLS_PORT = String(deployment.port);
  }

  for (const row of db
    .prepare('SELECT key, value FROM env_vars WHERE deployment_id = ?')
    .all(deployment.id)) {
    env[row.key] = row.value;
  }
  return env;
}

function state(id) {
  let entry = running.get(id);
  if (!entry) {
    entry = {
      id,
      status: 'stopped',
      pid: null,
      child: null,
      lines: [],
      seq: 0,
      startedAt: null,
      memoryBytes: 0,
      memoryPeakBytes: 0,
      overLimitSamples: 0,
      manualStop: false,
      crashes: [],
      restartTimer: null,
      logStream: null,
      logBytes: 0,
      task: null,
    };
    running.set(id, entry);
  }
  return entry;
}

function setStatus(id, status, extra = {}) {
  const entry = state(id);
  entry.status = status;
  bus.emit('status', { id, status, pid: entry.pid, ...extra });
}

function openLog(slug, entry) {
  const dir = util.logDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'console.log');
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_LOG_BYTES) {
      fs.renameSync(file, path.join(dir, 'console.1.log'));
      entry.logBytes = 0;
    } else {
      entry.logBytes = stat.size;
    }
  } catch {
    entry.logBytes = 0;
  }
  entry.logStream = fs.createWriteStream(file, { flags: 'a' });
}

function closeLog(entry) {
  if (entry.logStream) {
    try { entry.logStream.end(); } catch {}
    entry.logStream = null;
  }
}

function push(id, stream, text) {
  const entry = state(id);
  const chunks = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const chunk of chunks) {
    if (chunk === '' ) continue;
    entry.seq += 1;
    const line = { seq: entry.seq, at: nowIso(), stream, text: chunk.slice(0, 4000) };
    entry.lines.push(line);
    if (entry.lines.length > config.consoleLines) entry.lines.splice(0, entry.lines.length - config.consoleLines);
    if (entry.logStream) {
      const row = `[${line.at}] ${stream === 'err' ? 'ERR ' : stream === 'sys' ? 'SYS ' : 'OUT '}${line.text}\n`;
      entry.logBytes += Buffer.byteLength(row);
      try { entry.logStream.write(row); } catch {}
    }
    bus.emit('console', { id, line });
  }
}

const sys = (id, text) => push(id, 'sys', text);

function getDeployment(id) {
  return db.prepare('SELECT * FROM deployments WHERE id = ?').get(Number(id));
}

function writeEnvFile(deployment) {
  const dir = util.deploymentDir(deployment.slug);
  const rows = db
    .prepare('SELECT key, value FROM env_vars WHERE deployment_id = ? ORDER BY key ASC')
    .all(deployment.id);
  const body = rows.map((row) => `${row.key}=${row.value}`).join('\r\n');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.env'), body ? `${body}\r\n` : '', { mode: 0o600 });
  } catch (err) {
    sys(deployment.id, `could not write env file  ${err.message}`);
  }
}

function winTaskkill(pid, force) {
  return new Promise((resolve) => {
    const args = force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid), '/T'];
    execFile('taskkill.exe', args, { timeout: 15000, windowsHide: true }, () => resolve());
  });
}

async function signalTree(pid, force) {
  if (config.isWindows) return winTaskkill(pid, force);
  try {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); } catch {}
  }
}

function runStep(id, { exe, args, raw }, cwd, env, label) {
  return new Promise((resolve) => {
    const entry = state(id);
    sys(id, `${label} started`);
    const child = raw
      ? spawn(raw, { cwd, env, shell: true, windowsHide: true })
      : spawn(exe, args, { cwd, env, windowsHide: true, detached: !config.isWindows });
    entry.task = child;
    entry.pid = child.pid || null;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => push(id, 'out', data));
    child.stderr.on('data', (data) => push(id, 'err', data));
    child.on('error', (err) => {
      push(id, 'err', `${label} could not run  ${err.message}`);
    });
    child.on('close', (code) => {
      entry.task = null;
      entry.pid = null;
      sys(id, `${label} finished with code ${code ?? 0}`);
      resolve(code ?? 0);
    });
  });
}

async function installDependencies(id, actor = 'system') {
  const deployment = getDeployment(id);
  if (!deployment) throw new Error('deployment not found');
  const entry = state(id);
  if (entry.status === 'running' || entry.status === 'installing') {
    throw new Error('stop the deployment before installing');
  }
  const runtime = runtimes.resolve(deployment.runtime_id);
  if (!runtime) throw new Error('runtime is not installed');
  const dir = util.deploymentDir(deployment.slug);
  const command = runtimes.installCommand(runtime, deployment, dir);
  if (!command) {
    sys(id, 'nothing to install for this runtime');
    return 0;
  }
  if (!entry.logStream) openLog(deployment.slug, entry);
  setStatus(id, 'installing');
  const code = await runStep(id, command, dir, buildEnv(deployment, runtime), 'dependency install');
  setStatus(id, 'stopped');
  audit({ actor, role: 'admin', action: 'deployment.install', target: deployment.name, detail: `exit ${code}` });
  return code;
}

async function start(id, actor = 'system') {
  const deployment = getDeployment(id);
  if (!deployment) throw new Error('deployment not found');
  const entry = state(id);
  if (entry.status === 'running' || entry.status === 'starting') return entry.status;
  if (entry.status === 'installing') throw new Error('an install is running  wait for it to finish');

  const runtime = runtimes.resolve(deployment.runtime_id);
  if (!runtime) throw new Error('runtime is not installed  install it in Runtimes');
  if (!deployment.startup_file) throw new Error('pick a startup file first');

  const dir = util.deploymentDir(deployment.slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const startupPath = util.safeJoin(dir, deployment.startup_file);
  if (!startupPath || !fs.existsSync(startupPath)) {
    throw new Error(`startup file ${deployment.startup_file} is missing`);
  }

  writeEnvFile(deployment);
  if (!entry.logStream) openLog(deployment.slug, entry);
  entry.manualStop = false;
  if (entry.restartTimer) {
    clearTimeout(entry.restartTimer);
    entry.restartTimer = null;
  }
  setStatus(id, 'starting');

  const command = runtimes.startCommand(runtime, deployment, dir);
  const env = buildEnv(deployment, runtime);
  sys(id, `starting with ${runtime.label}  ram ${deployment.ram_mb} MB${deployment.port ? `  port ${deployment.port}` : ''}`);
  sys(id, `command ${path.basename(command.exe)} ${command.args.join(' ')}`);

  const child = spawn(command.exe, command.args, {
    cwd: dir,
    env,
    windowsHide: true,
    detached: !config.isWindows,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  entry.child = child;
  entry.pid = child.pid || null;
  entry.startedAt = Date.now();
  entry.memoryBytes = 0;
  entry.memoryPeakBytes = 0;
  entry.overLimitSamples = 0;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (data) => push(id, 'out', data));
  child.stderr.on('data', (data) => push(id, 'err', data));

  child.on('error', (err) => {
    push(id, 'err', `process error  ${err.message}`);
  });

  child.on('close', (code, signal) => {
    const wasManual = entry.manualStop;
    entry.child = null;
    entry.pid = null;
    entry.startedAt = null;
    db.prepare('UPDATE deployments SET last_stopped_at = ?, last_exit_code = ?, last_exit_note = ? WHERE id = ?').run(
      nowIso(),
      code ?? -1,
      signal ? `signal ${signal}` : wasManual ? 'stopped by operator' : 'exited',
      id
    );
    sys(id, `process ended  code ${code ?? 'none'}${signal ? `  signal ${signal}` : ''}`);
    const crashed = !wasManual && code !== 0;
    setStatus(id, crashed ? 'crashed' : 'stopped', { exitCode: code });

    if (crashed) {
      entry.crashes = entry.crashes.filter((t) => Date.now() - t < CRASH_WINDOW_MS);
      entry.crashes.push(Date.now());
      const fresh = getDeployment(id);
      if (fresh && fresh.auto_restart) {
        if (entry.crashes.length >= CRASH_LIMIT) {
          sys(id, `restart loop detected  ${CRASH_LIMIT} crashes inside 5 minutes  auto restart paused`);
          entry.crashes = [];
          return;
        }
        sys(id, `auto restart in ${RESTART_DELAY_MS / 1000} seconds`);
        entry.restartTimer = setTimeout(() => {
          entry.restartTimer = null;
          start(id, 'auto restart').catch((err) => sys(id, `auto restart failed  ${err.message}`));
        }, RESTART_DELAY_MS);
        entry.restartTimer.unref?.();
      }
    } else if (!wasManual) {
      closeLogLater(entry);
    } else {
      closeLogLater(entry);
    }
  });

  db.prepare('UPDATE deployments SET last_started_at = ? WHERE id = ?').run(nowIso(), id);
  setStatus(id, 'running');
  audit({ actor, role: 'admin', action: 'deployment.start', target: deployment.name, detail: `pid ${child.pid}` });
  return 'running';
}

function closeLogLater(entry) {
  setTimeout(() => {
    if (!entry.child && !entry.task) closeLog(entry);
  }, 2000).unref?.();
}

async function stop(id, actor = 'system', force = false) {
  const entry = state(id);
  const deployment = getDeployment(id);
  const child = entry.child || entry.task;
  if (!child || !child.pid) {
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
      entry.restartTimer = null;
      sys(id, 'pending auto restart cancelled');
    }
    entry.manualStop = true;
    setStatus(id, 'stopped');
    return 'stopped';
  }
  entry.manualStop = true;
  if (entry.restartTimer) {
    clearTimeout(entry.restartTimer);
    entry.restartTimer = null;
  }
  setStatus(id, 'stopping');
  sys(id, force ? 'kill requested' : 'stop requested');
  const pid = child.pid;

  await signalTree(pid, force);
  if (!force) {
    const ended = await waitForExit(entry, STOP_GRACE_MS);
    if (!ended) {
      sys(id, 'still alive after the grace window  forcing');
      await signalTree(pid, true);
      await waitForExit(entry, 5000);
    }
  } else {
    await waitForExit(entry, 5000);
  }
  audit({
    actor,
    role: 'admin',
    action: force ? 'deployment.kill' : 'deployment.stop',
    target: deployment ? deployment.name : String(id),
  });
  return 'stopped';
}

function waitForExit(entry, timeoutMs) {
  return new Promise((resolve) => {
    if (!entry.child && !entry.task) return resolve(true);
    const timer = setTimeout(() => resolve(!entry.child && !entry.task), timeoutMs);
    const check = setInterval(() => {
      if (!entry.child && !entry.task) {
        clearInterval(check);
        clearTimeout(timer);
        resolve(true);
      }
    }, 150);
    timer.unref?.();
    check.unref?.();
  });
}

async function restart(id, actor = 'system') {
  await stop(id, actor, false);
  await new Promise((r) => setTimeout(r, 600));
  return start(id, actor);
}

function writeStdin(id, text) {
  const entry = state(id);
  if (!entry.child || !entry.child.stdin || entry.child.stdin.destroyed) {
    throw new Error('deployment is not running');
  }
  entry.child.stdin.write(`${text}\n`);
  push(id, 'sys', `> ${text}`);
}

function snapshot(id) {
  const entry = state(id);
  return {
    status: entry.status,
    pid: entry.pid,
    uptimeSeconds: entry.startedAt ? Math.floor((Date.now() - entry.startedAt) / 1000) : 0,
    memoryBytes: entry.memoryBytes,
    memoryPeakBytes: entry.memoryPeakBytes,
    autoRestartPending: Boolean(entry.restartTimer),
  };
}

function consoleLines(id, afterSeq = 0) {
  return state(id).lines.filter((line) => line.seq > Number(afterSeq || 0));
}

function clearConsole(id) {
  const entry = state(id);
  entry.lines = [];
  bus.emit('clear', { id });
}

function isBusy(id) {
  const entry = state(id);
  return ['running', 'starting', 'stopping', 'installing'].includes(entry.status);
}

function forget(id) {
  const entry = running.get(id);
  if (entry) {
    if (entry.restartTimer) clearTimeout(entry.restartTimer);
    closeLog(entry);
    running.delete(id);
  }
}

// --- supervision --------------------------------------------------------------

const metrics = require('./metrics');

async function sampleMemory() {
  const live = [...running.values()].filter((entry) => entry.pid);
  if (!live.length) return;
  const usage = await metrics.processMemory(live.map((entry) => entry.pid));
  for (const entry of live) {
    const bytes = usage[entry.pid] || 0;
    entry.memoryBytes = bytes;
    if (bytes > entry.memoryPeakBytes) entry.memoryPeakBytes = bytes;
    const deployment = getDeployment(entry.id);
    if (!deployment || !entry.child) continue;
    const limit = deployment.ram_mb * 1048576 * 1.05;
    if (bytes > limit) {
      entry.overLimitSamples += 1;
      if (entry.overLimitSamples === 1) {
        sys(entry.id, `memory above the ${deployment.ram_mb} MB allocation  watching`);
      }
      if (entry.overLimitSamples >= 3) {
        sys(entry.id, `memory limit reached  stopping the process`);
        entry.overLimitSamples = 0;
        stop(entry.id, 'memory watchdog', true).catch(() => {});
      }
    } else {
      entry.overLimitSamples = 0;
    }
  }
  bus.emit('tick');
}

function startSupervisor() {
  const timer = setInterval(() => {
    sampleMemory().catch(() => {});
  }, 5000);
  timer.unref();
  return timer;
}

async function bootAutostart() {
  const rows = db.prepare('SELECT * FROM deployments WHERE autostart = 1 ORDER BY id ASC').all();
  for (const row of rows) {
    try {
      await start(row.id, 'autostart');
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`[bls] autostart skipped for ${row.name}  ${err.message}`);
    }
  }
}

async function shutdownAll() {
  const live = [...running.values()].filter((entry) => entry.child || entry.task);
  await Promise.all(live.map((entry) => stop(entry.id, 'panel shutdown', false).catch(() => {})));
}

module.exports = {
  bus,
  start,
  stop,
  restart,
  installDependencies,
  writeStdin,
  snapshot,
  consoleLines,
  clearConsole,
  isBusy,
  forget,
  state,
  push,
  sys,
  writeEnvFile,
  startSupervisor,
  bootAutostart,
  shutdownAll,
  sampleMemory,
};
