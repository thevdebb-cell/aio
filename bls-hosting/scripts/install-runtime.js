'use strict';

require('./_sqlite-guard');

// Installs one or more runtimes from the command line
// usage  node scripts/install-runtime.js node-24 python-312
const runtimes = require('../src/services/runtimes');

const wanted = process.argv.slice(2);
if (!wanted.length) {
  console.log('available runtimes');
  for (const entry of runtimes.catalog()) console.log(`  ${entry.id}  ${entry.label}  ${entry.version}`);
  process.exit(0);
}

(async () => {
  let failed = 0;
  for (const id of wanted) {
    process.stdout.write(`installing ${id}\n`);
    try {
      const row = await runtimes.install(id, (line) => console.log(`  ${line}`));
      console.log(`  ok  ${row.label} at ${row.exe_path}`);
    } catch (err) {
      failed += 1;
      console.error(`  failed  ${err.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
