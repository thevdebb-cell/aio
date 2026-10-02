'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const auth = require('../lib/auth');
const deployments = require('../services/deployments');
const processes = require('../services/processes');
const runtimes = require('../services/runtimes');
const files = require('../services/files');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

function pick(req, res) {
  const deployment = deployments.byId(req.params.id);
  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return null;
  }
  return deployment;
}

router.get('/deployments/:id/files', auth.requireSession, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    res.json(files.listDir(deployment, req.query.path || ''));
  } catch (err) {
    next(err);
  }
});

router.get('/deployments/:id/file', auth.requireSession, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    res.json({ file: files.readFile(deployment, req.query.path || ''), readOnly: req.session.role !== 'admin' });
  } catch (err) {
    next(err);
  }
});

router.put('/deployments/:id/file', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const body = req.body || {};
    const saved = files.writeFile(deployment, body.path, body.content);
    auth.log(req, 'file.save', deployment.name, saved.path);
    res.json({ file: saved });
  } catch (err) {
    next(err);
  }
});

router.post('/deployments/:id/files/new', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const body = req.body || {};
    const created = files.createEntry(deployment, body.path, body.kind === 'dir' ? 'dir' : 'file');
    auth.log(req, 'file.create', deployment.name, created.path);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post('/deployments/:id/files/rename', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const body = req.body || {};
    const moved = files.renameEntry(deployment, body.path, body.to);
    auth.log(req, 'file.rename', deployment.name, `${body.path} to ${moved.path}`);
    res.json(moved);
  } catch (err) {
    next(err);
  }
});

router.delete('/deployments/:id/files', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const removed = files.deleteEntry(deployment, req.query.path || '');
    auth.log(req, 'file.delete', deployment.name, removed.path);
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

// Viewers may read code but never pull it off the box
router.get('/deployments/:id/download', auth.requireAdmin, auth.requireScope, (req, res, next) => {
  try {
    const deployment = pick(req, res);
    if (!deployment) return;
    const single = req.query.path;
    if (single) {
      const full = files.filePathFor(deployment, single);
      auth.log(req, 'file.download', deployment.name, single);
      return res.download(full, path.basename(full));
    }
    const zip = files.buildZip(deployment);
    auth.log(req, 'deployment.download', deployment.name, `${zip.length} bytes`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${deployment.slug}.zip"`);
    res.send(zip);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/deployments/:id/upload',
  auth.requireAdmin,
  auth.requireScope,
  upload.single('archive'),
  async (req, res, next) => {
    try {
      const deployment = pick(req, res);
      if (!deployment) return;
      if (!req.file) return res.status(400).json({ error: 'Attach a zip file' });
      const name = String(req.file.originalname || '');
      if (!/\.zip$/i.test(name)) return res.status(400).json({ error: 'Only zip archives are accepted' });
      if (processes.isBusy(deployment.id)) {
        return res.status(409).json({ error: 'Stop the deployment before uploading' });
      }

      const clean = String(req.body.clean || '') === 'true';
      const log = [];
      const result = files.extractArchive(deployment, req.file.buffer, {
        clean,
        onLog: (line) => {
          log.push(line);
          processes.sys(deployment.id, line);
        },
      });

      const runtime = runtimes.resolve(deployment.runtime_id);
      let startup = deployment.startup_file;
      const fs = require('fs');
      const util = require('../lib/util');
      const dir = util.deploymentDir(deployment.slug);
      if (!startup || !fs.existsSync(path.join(dir, startup))) {
        const guess = runtimes.guessStartup(dir, runtime ? runtime.kind : 'node');
        if (guess) {
          deployments.update(deployment.id, { startupFile: guess });
          startup = guess;
          processes.sys(deployment.id, `startup file set to ${guess}`);
        }
      }

      auth.log(req, 'deployment.upload', deployment.name, `${name}  ${result.written} files  clean ${clean}`);
      res.json({
        ...result,
        log,
        startupFile: startup,
        deployment: deployments.decorate(deployments.byId(deployment.id)),
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
