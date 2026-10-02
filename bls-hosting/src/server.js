'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { db, audit } = require('./lib/db');
const auth = require('./lib/auth');
const codesLib = require('./lib/codes');
const { securityHeaders, sameOrigin, makeRateLimiter } = require('./lib/security');
const processes = require('./services/processes');
const runtimes = require('./services/runtimes');
const deployments = require('./services/deployments');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use(securityHeaders);
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(auth.attachSession);
app.use(sameOrigin);

const apiLimiter = makeRateLimiter({ windowMs: 60000, max: 600, message: 'Slow down a moment' });

const PUBLIC_DIR = path.join(config.appDir, 'public');

// --- pages --------------------------------------------------------------------

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/access', (req, res) => {
  if (req.session) return res.redirect('/panel');
  res.sendFile(path.join(PUBLIC_DIR, 'access.html'));
});
app.get('/panel', (req, res) => {
  if (!req.session) return res.redirect('/access');
  res.sendFile(path.join(PUBLIC_DIR, 'panel.html'));
});
app.get('/healthz', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: 'deny',
    etag: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    },
  })
);

// --- api ----------------------------------------------------------------------

app.use('/api', apiLimiter);
app.use('/api', require('./routes/auth'));
app.use('/api', auth.requireCsrf);
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/runtimes'));
app.use('/api', require('./routes/deployments'));
app.use('/api', require('./routes/files'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Archive is over the ${config.maxUploadMb} MB limit` });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload is too large' });
  }
  // Validation errors are plain Error objects raised by our own services. Anything
  // carrying a system code or a subclass name is a real fault and stays generic
  const message = err && err.message ? String(err.message) : 'Unexpected error';
  const expected =
    err &&
    (err.expose === true ||
      (err instanceof Error && err.name === 'Error' && !err.code && !err.syscall));
  const status = Number(err && err.status) || (expected ? 400 : 500);
  if (!expected) console.error('[bls] error', err);
  res.status(status).json({ error: expected ? message : 'Something went wrong on the panel' });
});

// --- websocket console --------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const session = auth.readSession(req);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const id = Number(url.searchParams.get('id'));
  if (!Number.isFinite(id) || !auth.scopeAllows(session, id)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.deploymentId = id;
    ws.role = session.role;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const id = ws.deploymentId;
  const send = (payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };
  send({ type: 'backlog', lines: processes.consoleLines(id), state: processes.snapshot(id) });

  const onConsole = (event) => {
    if (event.id === id) send({ type: 'line', line: event.line });
  };
  const onStatus = (event) => {
    if (event.id === id) send({ type: 'status', state: processes.snapshot(id), status: event.status });
  };
  const onClear = (event) => {
    if (event.id === id) send({ type: 'clear' });
  };
  const onTick = () => send({ type: 'state', state: processes.snapshot(id) });

  processes.bus.on('console', onConsole);
  processes.bus.on('status', onStatus);
  processes.bus.on('clear', onClear);
  processes.bus.on('tick', onTick);

  const ping = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, 25000);
  ping.unref();

  ws.on('close', () => {
    clearInterval(ping);
    processes.bus.off('console', onConsole);
    processes.bus.off('status', onStatus);
    processes.bus.off('clear', onClear);
    processes.bus.off('tick', onTick);
  });
  ws.on('error', () => {});
});

// --- boot ---------------------------------------------------------------------

function boot() {
  auth.pruneSessions();
  codesLib.seedGlobalCodes();
  if (!runtimes.listInstalled().length) {
    try {
      const row = runtimes.registerSystemRuntime();
      console.log(`[bls] registered host runtime ${row.label}`);
    } catch (err) {
      console.warn('[bls] could not register the host runtime', err.message);
    }
  }
  processes.startSupervisor();

  server.listen(config.port, config.host, () => {
    console.log(`[bls] BLS.Hosting panel on http://${config.host}:${config.port}`);
    console.log(`[bls] root ${config.dirs.root}`);
    console.log(`[bls] ram pool ${config.ramPoolMb} MB of ${config.hostTotalRamMb} MB`);
    console.log(`[bls] deployments ${deployments.rows().length}  runtimes ${runtimes.listInstalled().length}`);
    audit({ action: 'panel.start', detail: `port ${config.port}` });
    processes.bootAutostart().catch(() => {});
  });

  const prune = setInterval(() => auth.pruneSessions(), 30 * 60 * 1000);
  prune.unref();
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bls] ${signal} received  stopping deployments`);
  audit({ action: 'panel.stop', detail: signal });
  const timeout = setTimeout(() => process.exit(0), 20000);
  timeout.unref();
  try {
    await processes.shutdownAll();
  } catch {}
  wss.clients.forEach((client) => client.terminate());
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
process.on('uncaughtException', (err) => {
  console.error('[bls] uncaught', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[bls] unhandled rejection', err);
});

boot();

module.exports = { app, server };
