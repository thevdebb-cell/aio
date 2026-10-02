'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, nowIso } = require('../lib/db');
const util = require('../lib/util');
const runtimes = require('./runtimes');
const processes = require('./processes');
const metrics = require('./metrics');

function rows() {
  return db.prepare('SELECT * FROM deployments ORDER BY name COLLATE NOCASE ASC').all();
}

function byId(id) {
  return db.prepare('SELECT * FROM deployments WHERE id = ?').get(Number(id));
}

function bySlug(slug) {
  return db.prepare('SELECT * FROM deployments WHERE slug = ?').get(slug);
}

function ramAllocatedMb(exceptId = null) {
  const row = db
    .prepare('SELECT COALESCE(SUM(ram_mb), 0) AS total FROM deployments WHERE id IS NOT ?')
    .get(exceptId === null ? -1 : Number(exceptId));
  return Number(row.total || 0);
}

function ramReport(exceptId = null) {
  const host = metrics.hostStats();
  const allocated = ramAllocatedMb(exceptId);
  return {
    poolMb: config.ramPoolMb,
    allocatedMb: allocated,
    freePoolMb: Math.max(0, config.ramPoolMb - allocated),
    hostFreeMb: host.ram.freeMb,
    hostTotalMb: host.ram.totalMb,
    reserveMb: config.ramReserveMb,
    overcommit: config.allowOvercommit,
  };
}

function usedPorts(exceptId = null) {
  return db
    .prepare('SELECT port FROM deployments WHERE port IS NOT NULL AND id IS NOT ?')
    .all(exceptId === null ? -1 : Number(exceptId))
    .map((row) => Number(row.port));
}

function decorate(deployment, { includeSize = false } = {}) {
  const live = processes.snapshot(deployment.id);
  const runtime = runtimes.resolve(deployment.runtime_id);
  const dir = util.deploymentDir(deployment.slug);
  const out = {
    id: deployment.id,
    name: deployment.name,
    slug: deployment.slug,
    runtimeId: deployment.runtime_id,
    runtimeLabel: runtime ? runtime.label : `${deployment.runtime_id} missing`,
    runtimeKind: runtime ? runtime.kind : 'unknown',
    runtimeReady: Boolean(runtime),
    ramMb: deployment.ram_mb,
    port: deployment.port,
    startupFile: deployment.startup_file,
    installCmd: deployment.install_cmd,
    extraArgs: deployment.extra_args,
    autostart: Boolean(deployment.autostart),
    autoRestart: Boolean(deployment.auto_restart),
    notes: deployment.notes,
    createdAt: deployment.created_at,
    updatedAt: deployment.updated_at,
    lastStartedAt: deployment.last_started_at,
    lastStoppedAt: deployment.last_stopped_at,
    lastExitCode: deployment.last_exit_code,
    lastExitNote: deployment.last_exit_note,
    hasFiles: fs.existsSync(dir) && fs.readdirSync(dir).length > 0,
    ...live,
  };
  if (includeSize) out.diskBytes = fs.existsSync(dir) ? util.dirSize(dir) : 0;
  return out;
}

function list(options) {
  return rows().map((row) => decorate(row, options));
}

function uniqueSlug(name) {
  const base = util.slugify(name) || 'bot';
  let slug = base;
  let n = 2;
  while (bySlug(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function nameTaken(name, exceptId = null) {
  const row = db
    .prepare('SELECT id FROM deployments WHERE name = ? COLLATE NOCASE AND id IS NOT ?')
    .get(String(name).trim(), exceptId === null ? -1 : Number(exceptId));
  return Boolean(row);
}

function validateRam(ramMb, exceptId = null) {
  const value = Number(ramMb);
  if (!Number.isFinite(value) || value < 64) return { error: 'RAM needs at least 64 MB' };
  if (value > config.hostTotalRamMb) return { error: `RAM cannot pass the host total of ${config.hostTotalRamMb} MB` };
  const report = ramReport(exceptId);
  if (value > report.freePoolMb && !config.allowOvercommit) {
    return { error: `Only ${report.freePoolMb} MB left in the pool` };
  }
  return { value: Math.round(value), warning: value > report.freePoolMb ? `pool is overcommitted by ${value - report.freePoolMb} MB` : null };
}

async function create(input) {
  const nameError = util.validName(input.name);
  if (nameError) throw new Error(nameError);
  if (nameTaken(input.name)) throw new Error('A deployment already uses that name');

  const runtime = runtimes.resolve(input.runtimeId);
  if (!runtime) throw new Error('Pick a runtime that is installed');

  const ram = validateRam(input.ramMb);
  if (ram.error) throw new Error(ram.error);

  let port = null;
  if (input.port === 'auto' || input.port === undefined || input.port === null || input.port === '') {
    port = await util.nextFreePort(usedPorts());
    if (!port) throw new Error('No free port left in the configured range');
  } else if (input.port === 'none') {
    port = null;
  } else {
    port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a number between 1 and 65535');
    if (usedPorts().includes(port)) throw new Error('That port is already taken by another deployment');
  }

  const slug = uniqueSlug(input.name);
  const dir = util.deploymentDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(util.logDir(slug), { recursive: true });

  const info = db
    .prepare(
      `INSERT INTO deployments(name, slug, runtime_id, ram_mb, port, startup_file, install_cmd, extra_args, autostart, auto_restart, notes, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(input.name).trim(),
      slug,
      input.runtimeId,
      ram.value,
      port,
      String(input.startupFile || '').trim(),
      String(input.installCmd || '').trim(),
      String(input.extraArgs || '').trim(),
      input.autostart ? 1 : 0,
      input.autoRestart === false ? 0 : 1,
      String(input.notes || '').trim(),
      nowIso(),
      nowIso()
    );
  const deployment = byId(Number(info.lastInsertRowid));
  processes.sys(deployment.id, `deployment ${deployment.name} created`);
  return { deployment, warning: ram.warning };
}

function update(id, input) {
  const current = byId(id);
  if (!current) throw new Error('deployment not found');
  const fields = {};
  const warnings = [];

  if (input.name !== undefined && String(input.name).trim() !== current.name) {
    const nameError = util.validName(input.name);
    if (nameError) throw new Error(nameError);
    if (nameTaken(input.name, id)) throw new Error('A deployment already uses that name');
    fields.name = String(input.name).trim();
  }
  if (input.runtimeId !== undefined && input.runtimeId !== current.runtime_id) {
    if (!runtimes.resolve(input.runtimeId)) throw new Error('Pick a runtime that is installed');
    if (processes.isBusy(id)) throw new Error('Stop the deployment before changing the runtime');
    fields.runtime_id = input.runtimeId;
  }
  if (input.ramMb !== undefined && Number(input.ramMb) !== current.ram_mb) {
    const ram = validateRam(input.ramMb, id);
    if (ram.error) throw new Error(ram.error);
    fields.ram_mb = ram.value;
    if (ram.warning) warnings.push(ram.warning);
    if (processes.isBusy(id)) warnings.push('restart the deployment to apply the new RAM');
  }
  if (input.port !== undefined) {
    if (input.port === 'none' || input.port === null || input.port === '') {
      fields.port = null;
    } else {
      const port = Number(input.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a number between 1 and 65535');
      if (port !== current.port && usedPorts(id).includes(port)) throw new Error('That port is already taken by another deployment');
      fields.port = port;
    }
    if (fields.port !== current.port && processes.isBusy(id)) warnings.push('restart the deployment to apply the new port');
  }
  if (input.startupFile !== undefined) {
    const value = String(input.startupFile || '').trim().replace(/\\/g, '/');
    if (value) {
      const target = util.safeJoin(util.deploymentDir(current.slug), value);
      if (!target) throw new Error('Startup file must stay inside the deployment folder');
      if (!fs.existsSync(target)) throw new Error('That startup file does not exist yet');
    }
    fields.startup_file = value;
  }
  if (input.installCmd !== undefined) fields.install_cmd = String(input.installCmd || '').trim().slice(0, 500);
  if (input.extraArgs !== undefined) fields.extra_args = String(input.extraArgs || '').trim().slice(0, 500);
  if (input.autostart !== undefined) fields.autostart = input.autostart ? 1 : 0;
  if (input.autoRestart !== undefined) fields.auto_restart = input.autoRestart ? 1 : 0;
  if (input.notes !== undefined) fields.notes = String(input.notes || '').slice(0, 2000);

  const keys = Object.keys(fields);
  if (keys.length) {
    fields.updated_at = nowIso();
    const sql = `UPDATE deployments SET ${Object.keys(fields).map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...Object.values(fields), Number(id));
  }
  return { deployment: byId(id), warnings, changed: keys };
}

async function remove(id, actor) {
  const deployment = byId(id);
  if (!deployment) throw new Error('deployment not found');
  await processes.stop(id, actor, true).catch(() => {});
  processes.forget(Number(id));
  db.prepare('DELETE FROM deployments WHERE id = ?').run(Number(id));
  const dir = util.deploymentDir(deployment.slug);
  try { util.rmrf(dir); } catch {}
  try { util.rmrf(util.logDir(deployment.slug)); } catch {}
  return deployment;
}

function envList(id, { reveal }) {
  return db
    .prepare('SELECT id, key, value, secret FROM env_vars WHERE deployment_id = ? ORDER BY key ASC')
    .all(Number(id))
    .map((row) => ({
      id: row.id,
      key: row.key,
      secret: Boolean(row.secret),
      value: row.secret && !reveal ? '' : row.value,
      masked: Boolean(row.secret) && !reveal,
      length: row.value.length,
    }));
}

function envReplace(id, entries) {
  const deployment = byId(id);
  if (!deployment) throw new Error('deployment not found');
  const clean = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const key = String(entry.key || '').trim();
    if (!key) continue;
    if (!util.validEnvKey(key)) throw new Error(`Key ${key} is not valid  use letters digits and underscore`);
    if (seen.has(key)) throw new Error(`Key ${key} appears twice`);
    seen.add(key);
    clean.push({
      key,
      value: String(entry.value ?? '').slice(0, 8000),
      secret: entry.secret === false ? 0 : 1,
      keep: entry.keep === true,
    });
  }
  const existing = new Map(
    db.prepare('SELECT key, value FROM env_vars WHERE deployment_id = ?').all(Number(id)).map((row) => [row.key, row.value])
  );
  db.prepare('DELETE FROM env_vars WHERE deployment_id = ?').run(Number(id));
  const insert = db.prepare('INSERT INTO env_vars(deployment_id, key, value, secret) VALUES(?, ?, ?, ?)');
  for (const entry of clean) {
    const value = entry.keep && existing.has(entry.key) ? existing.get(entry.key) : entry.value;
    insert.run(Number(id), entry.key, value, entry.secret);
  }
  processes.writeEnvFile(byId(id));
  return envList(id, { reveal: false });
}

module.exports = {
  rows,
  byId,
  bySlug,
  list,
  decorate,
  create,
  update,
  remove,
  ramReport,
  ramAllocatedMb,
  usedPorts,
  envList,
  envReplace,
  validateRam,
  nameTaken,
};
