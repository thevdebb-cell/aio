#!/usr/bin/env node
'use strict';

// Launcher. node:sqlite needs --experimental-sqlite before Node 23 so we re-exec
// once with the flag when running on an older runtime. On Node 23+ this is a no-op
// and the server starts in this very process.
const path = require('path');
const major = Number(process.versions.node.split('.')[0]);
const entry = path.join(__dirname, '..', 'src', 'server.js');

if (major >= 23) {
  require(entry);
} else if (major >= 22) {
  const { spawn } = require('child_process');
  const child = spawn(
    process.execPath,
    ['--experimental-sqlite', '--no-warnings=ExperimentalWarning', entry, ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env }
  );
  const forward = (sig) => process.on(sig, () => { try { child.kill(sig); } catch {} });
  ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'].forEach(forward);
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
} else {
  console.error('BLS.Hosting needs Node 22.5 or newer. Found ' + process.versions.node);
  process.exit(1);
}
