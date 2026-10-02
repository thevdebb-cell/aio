'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../lib/db');
const auth = require('../lib/auth');
const metrics = require('../services/metrics');
const deployments = require('../services/deployments');
const runtimes = require('../services/runtimes');

const router = express.Router();

router.get('/system', auth.requireSession, (req, res) => {
  const host = metrics.hostStats();
  const ram = deployments.ramReport();
  const all = deployments.rows();
  const live = all.map((row) => require('../services/processes').snapshot(row.id));
  res.json({
    host,
    ram,
    limits: {
      portMin: config.portMin,
      portMax: config.portMax,
      maxUploadMb: config.maxUploadMb,
      overcommit: config.allowOvercommit,
      consoleLines: config.consoleLines,
    },
    counts: {
      deployments: all.length,
      running: live.filter((entry) => entry.status === 'running').length,
      crashed: live.filter((entry) => entry.status === 'crashed').length,
      runtimesInstalled: runtimes.listInstalled().length,
    },
    usedMemoryBytes: live.reduce((sum, entry) => sum + (entry.memoryBytes || 0), 0),
  });
});

router.get('/audit', auth.requireAdmin, (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 120));
  const rows = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ entries: rows });
});

router.get('/sessions', auth.requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT id, role, scope, deployment_id, label, created_at, last_seen_at, expires_at, ip FROM sessions ORDER BY id DESC LIMIT 100')
    .all();
  res.json({ sessions: rows });
});

module.exports = router;
