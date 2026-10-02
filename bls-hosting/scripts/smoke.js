'use strict';

// End to end smoke test against a running panel
const fflate = require('fflate');

const BASE = process.env.BLS_TEST_URL || 'http://127.0.0.1:3300';
let cookie = '';
let csrf = '';
let failures = 0;

function check(label, condition, extra = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
  return ok;
}

async function call(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (csrf && method !== 'GET') headers['x-bls-csrf'] = csrf;
  let payload = body;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (form) payload = form;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: 'manual' });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const entry of setCookie) {
    const pair = entry.split(';')[0];
    if (pair.startsWith('bls_session=')) cookie = pair;
  }
  if (raw) return { res, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { res, data };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The panel rate limits sign ins per IP so running this suite several times in a
// row trips it on purpose. Say so plainly instead of reporting a false failure.
async function login(code) {
  const r = await call('/api/auth/login', { method: 'POST', body: { code } });
  if (r.res.status === 429) {
    console.log('\nThe login rate limiter kicked in which means it works');
    console.log('Restart the panel or wait out the window then run this again');
    process.exit(2);
  }
  if (r.data && r.data.csrf) csrf = r.data.csrf;
  return r;
}

(async () => {
  console.log(`--- BLS.Hosting smoke test against ${BASE} ---`);

  let r = await call('/healthz');
  check('health endpoint answers', r.res.ok && r.data.ok);

  r = await call('/api/portal');
  check('portal lists 4 tiles', r.data.tiles.length === 4, r.data.tiles.map((t) => t.name).join(' '));
  check('only bls hosting is open', r.data.tiles.filter((t) => t.status === 'open').length === 1);
  check('vpn message is set', r.data.vpnMessage === 'BLS VPN Required');
  check('contacts carry the three names', r.data.contacts.map((c) => c.name).join(' ') === 'Net Folded Eyes');

  r = await call('/api/deployments');
  check('api needs a session', r.res.status === 401);

  r = await call('/api/auth/login', { method: 'POST', body: { code: 'bad-code' } });
  check('wrong code refused', r.res.status === 401, r.data.error);

  r = await login('Wplm9-c15!');
  check('admin code signs in', r.res.ok && r.data.role === 'admin');
  check('session cookie stored', cookie.startsWith('bls_session='));

  const savedCsrf = csrf;
  csrf = 'wrong-token';
  r = await call('/api/deployments', { method: 'POST', body: { name: 'csrf probe', runtimeId: 'node-system', ramMb: 128 } });
  check('bad csrf token refused', r.res.status === 403, r.data.error);
  csrf = savedCsrf;

  r = await call('/api/system');
  check('system metrics returned', r.res.ok && r.data.host.ram.totalMb > 0, `pool ${r.data.ram.poolMb} MB`);

  r = await call('/api/runtimes');
  const runtime = r.data.runtimes.find((item) => item.installed);
  check('a runtime is installed', Boolean(runtime), runtime && runtime.label);
  check('catalog offers several node versions', r.data.runtimes.filter((item) => item.kind === 'node').length >= 4);
  check('catalog offers python', r.data.runtimes.some((item) => item.kind === 'python'));

  r = await call('/api/deployments', {
    method: 'POST',
    body: { name: 'Smoke Bot', runtimeId: runtime.id, ramMb: 192, port: 'auto', autostart: false, autoRestart: false },
  });
  check('deployment created', r.res.status === 201, r.data.error || `${r.data.deployment.name} port ${r.data.deployment.port}`);
  const id = r.data.deployment.id;

  r = await call('/api/deployments', { method: 'POST', body: { name: 'Smoke Bot 2', runtimeId: runtime.id, ramMb: 999999 } });
  check('oversized ram refused', r.res.status === 400, r.data.error);

  r = await call(`/api/deployments/${id}/start`, { method: 'POST' });
  check('start without a startup file refused', r.res.status === 400, r.data.error);

  const botCode = [
    "let n = 0;",
    "console.log('bot online on port ' + (process.env.PORT || 'none'));",
    "console.log('secret seen: ' + (process.env.SMOKE_TOKEN ? 'yes' : 'no'));",
    "process.stdin.on('data', (d) => console.log('got input: ' + String(d).trim()));",
    "setInterval(() => console.log('tick ' + (++n)), 700);",
    "process.on('SIGTERM', () => { console.log('closing'); process.exit(0); });",
  ].join('\n');

  const zip = fflate.zipSync({
    'smoke/index.js': Buffer.from(botCode),
    'smoke/package.json': Buffer.from('{"name":"smoke","version":"1.0.0","main":"index.js"}'),
    '../escape.js': Buffer.from('should never land'),
  });

  const form = new FormData();
  form.append('clean', 'true');
  form.append('archive', new Blob([zip], { type: 'application/zip' }), 'smoke.zip');
  r = await call(`/api/deployments/${id}/upload`, { method: 'POST', form });
  check('zip uploaded and unpacked', r.res.ok && r.data.written === 2, r.data.error || `${r.data.written} files  skipped ${r.data.skipped}`);
  check('wrapper folder flattened', r.data.stripped === 'smoke');
  check('traversal entry skipped', r.data.skipped === 1);
  check('startup file auto picked', r.data.startupFile === 'index.js', r.data.startupFile);

  r = await call(`/api/deployments/${id}/env`, { method: 'PUT', body: { env: [{ key: 'SMOKE_TOKEN', value: 'super-secret', secret: true }] } });
  check('env saved', r.res.ok && r.data.env.length === 1);

  r = await call(`/api/deployments/${id}/env`);
  check('secret value hidden by default', r.data.env[0].value === '' && r.data.env[0].masked === true);
  r = await call(`/api/deployments/${id}/env?reveal=1`);
  check('admin can reveal the secret', r.data.env[0].value === 'super-secret');

  r = await call(`/api/deployments/${id}/env`, { method: 'PUT', body: { env: [{ key: 'bad key', value: 'x' }] } });
  check('bad env key refused', r.res.status === 400, r.data.error);

  r = await call(`/api/deployments/${id}/start`, { method: 'POST' });
  check('deployment starts', r.res.ok && r.data.state.status === 'running', r.data.error || `pid ${r.data.state.pid}`);

  await wait(2400);
  r = await call(`/api/deployments/${id}/console`);
  const text = r.data.lines.map((line) => line.text).join('\n');
  check('console captured stdout', /bot online/.test(text));
  check('env var reached the process', /secret seen: yes/.test(text));
  check('port reached the process', /on port \d+/.test(text), (text.match(/on port \d+/) || [''])[0]);
  check('ticks keep coming', /tick 2/.test(text));

  await call(`/api/deployments/${id}/console/input`, { method: 'POST', body: { text: 'hello bot' } });
  await wait(700);
  r = await call(`/api/deployments/${id}/console`);
  check('stdin reached the process', /got input: hello bot/.test(r.data.lines.map((l) => l.text).join('\n')));

  await wait(5200);
  r = await call(`/api/deployments/${id}`);
  check('memory sampled', r.data.deployment.memoryBytes > 0, `${Math.round(r.data.deployment.memoryBytes / 1048576)} MB`);
  check('uptime counted', r.data.deployment.uptimeSeconds >= 1);

  r = await call(`/api/deployments/${id}/restart`, { method: 'POST' });
  check('restart works', r.res.ok && r.data.state.status === 'running');
  await wait(900);

  r = await call(`/api/deployments/${id}/stop`, { method: 'POST' });
  check('stop works', r.res.ok, r.data.error);
  await wait(500);
  r = await call(`/api/deployments/${id}`);
  check('status back to stopped', r.data.deployment.status === 'stopped', r.data.deployment.status);

  r = await call(`/api/deployments/${id}/files`);
  check('file listing works', r.res.ok && r.data.entries.length === 3, r.data.entries.map((e) => e.name).join(' '));
  r = await call(`/api/deployments/${id}/file?path=index.js`);
  check('file read works', r.res.ok && /bot online/.test(r.data.file.content));
  r = await call(`/api/deployments/${id}/file`, { method: 'PUT', body: { path: 'index.js', content: 'console.log("edited")' } });
  check('file write works', r.res.ok);
  r = await call(`/api/deployments/${id}/file?path=../../../etc/passwd`);
  check('path traversal on read refused', r.res.status === 400, r.data.error);
  r = await call(`/api/deployments/${id}/files/new`, { method: 'POST', body: { path: 'lib/helper.js', kind: 'file' } });
  check('nested file created', r.res.status === 201, r.data.path);

  const dl = await call(`/api/deployments/${id}/download`, { raw: true });
  check('admin can download the zip', dl.res.ok && dl.buffer.length > 100, `${dl.buffer.length} bytes`);

  r = await call(`/api/deployments/${id}/codes`, { method: 'POST', body: { role: 'viewer', label: 'smoke viewer' } });
  check('viewer code generated', r.res.status === 201 && /^BLS-/.test(r.data.code), r.data.code);
  const viewerCode = r.data.code;

  r = await call('/api/audit');
  check('audit log filled', r.res.ok && r.data.entries.length > 5, `${r.data.entries.length} entries`);

  cookie = '';
  csrf = '';
  r = await login(viewerCode);
  check('viewer code signs in', r.res.ok && r.data.role === 'viewer' && r.data.scope === 'deployment');

  r = await call(`/api/deployments/${id}/file?path=index.js`);
  check('viewer can read the code', r.res.ok && r.data.readOnly === true);
  r = await call(`/api/deployments/${id}/file`, { method: 'PUT', body: { path: 'index.js', content: 'hacked' } });
  check('viewer cannot write', r.res.status === 403, r.data.error);
  r = await call(`/api/deployments/${id}/download`, { raw: true });
  check('viewer cannot download', r.res.status === 403);
  r = await call(`/api/deployments/${id}/start`, { method: 'POST' });
  check('viewer cannot start', r.res.status === 403);
  r = await call(`/api/deployments/${id}/env`);
  check('viewer sees keys but not values', r.res.ok && r.data.env[0].value === '' && r.data.canReveal === false);
  r = await call(`/api/deployments/${id}/env?reveal=1`);
  check('viewer reveal is ignored', r.data.env[0].value === '');
  r = await call('/api/audit');
  check('viewer cannot read the audit log', r.res.status === 403);
  r = await call(`/api/deployments/${id + 999}`);
  check('scoped code cannot reach another deployment', r.res.status === 403, r.data.error);
  r = await call('/api/deployments');
  check('scoped code sees only its deployment', r.data.deployments.length === 1);

  cookie = '';
  csrf = '';
  await login('Wplm9-c15!');
  r = await call(`/api/deployments/${id}?confirm=wrong`, { method: 'DELETE' });
  check('delete needs the exact name', r.res.status === 400, r.data.error);
  r = await call(`/api/deployments/${id}?confirm=${encodeURIComponent('Smoke Bot')}`, { method: 'DELETE' });
  check('deployment deleted', r.res.ok);
  r = await call('/api/deployments');
  check('list is empty again', r.data.deployments.length === 0);

  r = await call('/api/auth/logout', { method: 'POST' });
  check('logout works', r.res.ok);
  r = await call('/api/system');
  check('session gone after logout', r.res.status === 401);

  console.log(`--- ${failures ? `${failures} FAILURES` : 'all checks passed'} ---`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('smoke test crashed', err);
  process.exit(1);
});
