'use strict';

// node:sqlite needs --experimental-sqlite before Node 23. Console scripts re-exec
// themselves once with the flag so they work on any supported runtime.
const major = Number(process.versions.node.split('.')[0]);
const alreadyFlagged = process.execArgv.includes('--experimental-sqlite');

if (major < 23 && !alreadyFlagged) {
  const { spawnSync } = require('child_process');
  const result = spawnSync(
    process.execPath,
    ['--experimental-sqlite', '--no-warnings=ExperimentalWarning', ...process.argv.slice(1)],
    { stdio: 'inherit' }
  );
  process.exit(result.status === null ? 1 : result.status);
}
