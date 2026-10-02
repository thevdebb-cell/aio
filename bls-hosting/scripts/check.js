'use strict';

require('./_sqlite-guard');

// Prints what the panel sees  handy when something looks wrong on the server
const fs = require('fs');
const config = require('../src/config');
const { db } = require('../src/lib/db');
const runtimes = require('../src/services/runtimes');
const metrics = require('../src/services/metrics');

const host = metrics.hostStats();
const line = (k, v) => console.log(`${String(k).padEnd(22)} ${v}`);

console.log('--- BLS.Hosting check ---');
line('panel version', require('../package.json').version);
line('node', process.versions.node);
line('platform', host.platform);
line('root', config.dirs.root);
line('bind', `${config.host}:${config.port}`);
line('public url', config.publicUrl || 'not set');
line('secure cookies', config.secureCookies);
line('ram total', `${host.ram.totalMb} MB`);
line('ram free', `${host.ram.freeMb} MB`);
line('ram pool', `${config.ramPoolMb} MB  reserve ${config.ramReserveMb} MB`);
line('disk free', `${(host.disk.freeBytes / 1073741824).toFixed(1)} GB on ${host.disk.drive}`);
line('port range', `${config.portMin} to ${config.portMax}`);
line('overcommit', config.allowOvercommit);
line('max upload', `${config.maxUploadMb} MB`);

console.log('\nruntimes');
const installed = runtimes.installedRows();
if (!installed.length) console.log('  none  install one from the panel or with scripts/install-runtime.js');
for (const row of installed) {
  line(`  ${row.id}`, `${row.label}  ${fs.existsSync(row.exe_path) ? 'ok' : 'MISSING'}  ${row.exe_path}`);
}

console.log('\naccess codes');
for (const row of db.prepare("SELECT * FROM access_codes WHERE revoked = 0 ORDER BY scope DESC, id").all()) {
  line(`  ${row.label}`, `${row.role}  ${row.scope}${row.deployment_id ? ` on ${row.deployment_id}` : ''}  hint ${row.code_hint}  used ${row.use_count}`);
}

console.log('\ndeployments');
const rows = db.prepare('SELECT * FROM deployments ORDER BY name').all();
if (!rows.length) console.log('  none yet');
for (const row of rows) {
  line(`  ${row.name}`, `${row.runtime_id}  ${row.ram_mb} MB  port ${row.port || 'none'}  startup ${row.startup_file || 'not set'}  autostart ${row.autostart ? 'yes' : 'no'}`);
}

const allocated = rows.reduce((sum, row) => sum + row.ram_mb, 0);
console.log(`\nallocated ${allocated} MB of the ${config.ramPoolMb} MB pool`);
console.log('--- end ---');
