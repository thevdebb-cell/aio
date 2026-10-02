'use strict';

const express = require('express');
const auth = require('../lib/auth');
const config = require('../config');
const { db } = require('../lib/db');
const util = require('../lib/util');
const deployments = require('../services/deployments');
const processes = require('../services/processes');
const runtimes = require('../services/runtimes');
const files = require('../services/files');
const codes = require('../lib/codes');

const router = express.Router();

function pick(req, res) {
  const deployment = deployments.byId(req.params.id);
  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return null;
  }
  return deployment;
}

const visible = (session, row) => auth.scopeAllows(session, row.id);

router.get('/deployments', auth.requireSession, (req, res) => {
  const all = deployments.list();
  res.json({
    deployments: all.filter((row) => visible(req.session, row)),
    ram: deployments.ramReport(),
  });
});

router.get('/deployments/:id', auth.requireSession, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  res.json({
    deployment: deployments.decorate(deployment, { includeSize: true }),
    ram: deployments.ramReport(deployment.id),
    usedPorts: deployments.usedPorts(deployment.id),
  });
});

router.post('/deployments', auth.requireAdmin, async (req, res, next) => {
  try {
    if (req.session.scope !== 'global') {
      return res.status(403).json({ error: 'This code opens one deployment only' });
    }
    const { deployment, warning } = await deployments.create(req.body || {});
    auth.log(req, 'deployment.create', deployment.name, `runtime ${deployment.runtime_id}  ram ${deployment.ram_mb} MB`);
    res.status(201).json({
      deployment: deployments.decorate(deployment),
      warning,
      ram: deployments.ramReport(),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/deployments/:id', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const result = deployments.update(deployment.id, req.body || {});
    auth.log(req, 'deployment.update', deployment.name, result.changed.join(' '));
    res.json({
      deployment: deployments.decorate(result.deployment),
      warnings: result.warnings,
      ram: deployments.ramReport(),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/deployments/:id', auth.requireAdmin, auth.requireScope, async (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    if (String(req.query.confirm || '') !== deployment.name) {
      return res.status(400).json({ error: 'Type the deployment name to confirm' });
    }
    await deployments.remove(deployment.id, auth.actorOf(req.session));
    auth.log(req, 'deployment.delete', deployment.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- lifecycle ----------------------------------------------------------------

const ACTIONS = {
  start: (id, actor) => processes.start(id, actor),
  stop: (id, actor) => processes.stop(id, actor, false),
  restart: (id, actor) => processes.restart(id, actor),
  kill: (id, actor) => processes.stop(id, actor, true),
  install: (id, actor) => processes.installDependencies(id, actor),
};

router.post('/deployments/:id/:action(start|stop|restart|kill|install)', auth.requireAdmin, auth.requireScope, async (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const action = ACTIONS[req.params.action];
    const result = await action(deployment.id, auth.actorOf(req.session));
    auth.log(req, `deployment.${req.params.action}`, deployment.name);
    res.json({ ok: true, result, state: processes.snapshot(deployment.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/deployments/:id/console', auth.requireSession, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  res.json({
    lines: processes.consoleLines(deployment.id, req.query.after),
    state: processes.snapshot(deployment.id),
  });
});

router.post('/deployments/:id/console/input', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const text = String((req.body && req.body.text) || '').slice(0, 2000);
    if (!text.trim()) return res.status(400).json({ error: 'Nothing to send' });
    processes.writeStdin(deployment.id, text);
    auth.log(req, 'deployment.stdin', deployment.name, text.slice(0, 120));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/deployments/:id/console/clear', auth.requireAdmin, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  processes.clearConsole(deployment.id);
  res.json({ ok: true });
});

// --- env ----------------------------------------------------------------------

router.get('/deployments/:id/env', auth.requireSession, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  const reveal = req.query.reveal === '1' && req.session.role === 'admin';
  if (reveal) auth.log(req, 'env.reveal', deployment.name);
  res.json({ env: deployments.envList(deployment.id, { reveal }), canReveal: req.session.role === 'admin' });
});

router.put('/deployments/:id/env', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const entries = Array.isArray(req.body && req.body.env) ? req.body.env : [];
    if (entries.length > 300) return res.status(400).json({ error: 'Too many keys' });
    const saved = deployments.envReplace(deployment.id, entries);
    auth.log(req, 'env.save', deployment.name, `${saved.length} keys`);
    res.json({ env: saved, note: 'restart the deployment to apply' });
  } catch (err) {
    next(err);
  }
});

// --- access codes -------------------------------------------------------------

function codeView(row) {
  return {
    id: row.id,
    label: row.label,
    role: row.role,
    scope: row.scope,
    deploymentId: row.deployment_id,
    hint: row.code_hint,
    createdAt: row.created_at,
    createdBy: row.created_by,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
  };
}

router.get('/deployments/:id/codes', auth.requireAdmin, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  res.json({ codes: codes.listCodes(deployment.id).map(codeView) });
});

router.post('/deployments/:id/codes', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const role = String((req.body && req.body.role) || 'viewer');
    if (!['admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Role must be admin or viewer' });
    const label = String((req.body && req.body.label) || `${deployment.name} ${role}`).slice(0, 60);
    const existing = codes.listCodes(deployment.id).length;
    if (existing >= 20) return res.status(409).json({ error: 'That deployment already has 20 codes' });
    const plain = codes.generateCode();
    const id = codes.createCode({
      code: plain,
      label,
      role,
      scope: 'deployment',
      deploymentId: deployment.id,
      createdBy: auth.actorOf(req.session),
    });
    auth.log(req, 'code.create', deployment.name, `${role} code ${label}`);
    res.status(201).json({
      code: plain,
      note: 'copy it now  it is stored hashed and cannot be shown again',
      entry: codeView(codes.listCodes(deployment.id).find((row) => row.id === id)),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/deployments/:id/codes/:codeId', auth.requireAdmin, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  const row = db
    .prepare('SELECT * FROM access_codes WHERE id = ? AND deployment_id = ?')
    .get(Number(req.params.codeId), deployment.id);
  if (!row) return res.status(404).json({ error: 'Code not found' });
  codes.revokeCode(row.id);
  auth.log(req, 'code.revoke', deployment.name, row.label);
  res.json({ ok: true });
});

router.get('/codes', auth.requireAdmin, (req, res) => {
  if (req.session.scope !== 'global') return res.status(403).json({ error: 'This code opens one deployment only' });
  res.json({ codes: codes.listCodes().map(codeView) });
});

// --- startup helpers ----------------------------------------------------------

router.get('/deployments/:id/startup-candidates', auth.requireSession, auth.requireScope, (req, res) => {
  const deployment = pick(req, res);
  if (!deployment) return;
  const runtime = runtimes.resolve(deployment.runtime_id);
  const kind = runtime ? runtime.kind : 'node';
  res.json({
    candidates: files.startupCandidates(deployment, kind),
    guess: runtimes.guessStartup(util.deploymentDir(deployment.slug), kind),
  });
});

router.get('/ports/next', auth.requireAdmin, async (req, res) => {
  const port = await util.nextFreePort(deployments.usedPorts());
  res.json({ port, range: { min: config.portMin, max: config.portMax } });
});

module.exports = router;
