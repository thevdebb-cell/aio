'use strict';

const express = require('express');
const crypto = require('crypto');
const auth = require('../lib/auth');
const runtimes = require('../services/runtimes');
const { db } = require('../lib/db');

const router = express.Router();

// Installing a runtime downloads tens of megabytes so it runs as a background job
// the panel polls  no request sits open for minutes
const jobs = new Map();

function newJob(runtimeId) {
  const id = crypto.randomBytes(8).toString('hex');
  jobs.set(id, { id, runtimeId, state: 'running', lines: [], startedAt: Date.now(), error: null });
  if (jobs.size > 20) {
    const oldest = [...jobs.values()].sort((a, b) => a.startedAt - b.startedAt)[0];
    if (oldest && oldest.state !== 'running') jobs.delete(oldest.id);
  }
  return jobs.get(id);
}

router.get('/runtimes', auth.requireSession, (req, res) => {
  const installed = runtimes.installedRows();
  const installedById = new Map(installed.map((row) => [row.id, row]));
  const catalog = runtimes.catalog().map((entry) => {
    const row = installedById.get(entry.id);
    return {
      ...entry,
      installed: Boolean(row),
      installedVersion: row ? row.version : null,
      exePath: row && req.session.role === 'admin' ? row.exe_path : null,
    };
  });
  const extras = installed
    .filter((row) => !catalog.some((entry) => entry.id === row.id))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      version: row.version,
      family: row.kind === 'python' ? 'Python' : row.kind === 'node' ? 'JavaScript' : 'Custom',
      installed: true,
      installedVersion: row.version,
      exePath: req.session.role === 'admin' ? row.exe_path : null,
      custom: true,
    }));
  res.json({ runtimes: [...catalog, ...extras] });
});

router.post('/runtimes/:id/install', auth.requireAdmin, (req, res) => {
  const id = String(req.params.id);
  if (!runtimes.catalog().some((entry) => entry.id === id)) {
    return res.status(404).json({ error: 'Unknown runtime' });
  }
  const running = [...jobs.values()].find((job) => job.state === 'running');
  if (running) return res.status(409).json({ error: 'Another runtime install is already running' });

  const job = newJob(id);
  auth.log(req, 'runtime.install', id);
  runtimes
    .install(id, (line) => job.lines.push(String(line)))
    .then((row) => {
      job.state = 'done';
      job.lines.push(`${row.label} registered`);
    })
    .catch((err) => {
      job.state = 'failed';
      job.error = err.message;
      job.lines.push(`install failed  ${err.message}`);
    });
  res.status(202).json({ jobId: job.id });
});

router.get('/runtimes/jobs/:jobId', auth.requireSession, (req, res) => {
  const job = jobs.get(String(req.params.jobId));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ id: job.id, runtimeId: job.runtimeId, state: job.state, error: job.error, lines: job.lines });
});

router.post('/runtimes/custom', auth.requireAdmin, (req, res) => {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const exePath = String(body.exePath || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/i.test(id)) {
    return res.status(400).json({ error: 'Id may use letters digits dot dash and underscore' });
  }
  if (!exePath) return res.status(400).json({ error: 'Give the full path to the executable' });
  const fs = require('fs');
  if (!fs.existsSync(exePath)) return res.status(400).json({ error: 'That executable was not found on disk' });
  const row = runtimes.register({
    id,
    kind: String(body.kind || 'custom'),
    version: String(body.version || 'custom'),
    label: String(body.label || id),
    exePath,
    pkgPath: String(body.pkgPath || '') || null,
  });
  auth.log(req, 'runtime.custom', id, exePath);
  res.json({ runtime: { id: row.id, label: row.label, kind: row.kind, version: row.version } });
});

router.delete('/runtimes/:id', auth.requireAdmin, (req, res) => {
  const id = String(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS n FROM deployments WHERE runtime_id = ?').get(id).n;
  if (used > 0) return res.status(409).json({ error: `${used} deployments still use that runtime` });
  runtimes.remove(id);
  auth.log(req, 'runtime.remove', id);
  res.json({ ok: true });
});

module.exports = router;
