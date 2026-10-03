import { api, setCsrf } from './api.js';
import { el, clear, tidy, toast, openModal, confirmBox, field, fmtBytes, fmtMb, fmtDuration, fmtTime, statCard, meterClass } from './ui.js';
import { icon } from './icons.js';
import { renderDeployment, closeConsole } from './deployment.js';

export const state = {
  me: null,
  system: null,
  deployments: [],
  ram: null,
  runtimes: [],
  route: { view: 'overview', id: null, tab: 'console' },
};

const sideEl = document.getElementById('side');
const mainEl = document.getElementById('main');

export const isAdmin = () => state.me && state.me.role === 'admin';
export const statusLabel = (status) => ({
  running: 'running',
  stopped: 'stopped',
  crashed: 'crashed',
  starting: 'starting',
  stopping: 'stopping',
  installing: 'installing',
}[status] || status);

// ---------- theme -------------------------------------------------------------

const themeBtn = document.getElementById('themeBtn');
const THEMES = ['system', 'dark', 'light'];

function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  themeBtn.textContent = `Theme ${theme}`;
  try {
    localStorage.setItem('bls-theme', theme);
  } catch {}
}

function initTheme() {
  let saved = 'system';
  try {
    saved = localStorage.getItem('bls-theme') || 'system';
  } catch {}
  applyTheme(THEMES.includes(saved) ? saved : 'system');
  themeBtn.addEventListener('click', () => {
    const current = themeBtn.textContent.replace('Theme ', '');
    applyTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  });
}

document.getElementById('brandLogo').addEventListener('error', (event) => {
  event.target.style.display = 'none';
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {}
  window.location.href = '/';
});

// ---------- routing -----------------------------------------------------------

function parseHash() {
  const raw = (window.location.hash || '#/overview').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { view: 'overview', id: null, tab: 'console' };
  if (parts[0] === 'd' && parts[1]) {
    const tab = ['console', 'files', 'env', 'settings'].includes(parts[2]) ? parts[2] : 'console';
    return { view: 'deployment', id: Number(parts[1]), tab };
  }
  if (['overview', 'runtimes', 'activity'].includes(parts[0])) return { view: parts[0], id: null, tab: 'console' };
  return { view: 'overview', id: null, tab: 'console' };
}

export function go(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
}

async function render() {
  const next = parseHash();
  const leaving = state.route.view === 'deployment' && (next.view !== 'deployment' || next.id !== state.route.id);
  if (leaving) closeConsole();
  state.route = next;
  renderSide();
  try {
    if (next.view === 'overview') await renderOverview(mainEl);
    else if (next.view === 'runtimes') await renderRuntimes(mainEl);
    else if (next.view === 'activity') await renderActivity(mainEl);
    else if (next.view === 'deployment') await renderDeployment(mainEl, next.id, next.tab);
  } catch (err) {
    clear(mainEl).append(el('div', { class: 'banner bad', text: err.message || 'That view did not load' }));
  }
}

window.addEventListener('hashchange', render);

// ---------- shell -------------------------------------------------------------

function navItem({ label, hash, dot, right, on, ico }) {
  return el(
    'button',
    { class: `nav-item${on ? ' on' : ''}`, onclick: () => go(hash) },
    dot ? el('span', { class: `dot ${dot}` }) : ico ? icon(ico, 16) : null,
    el('span', { class: 'grow', text: label }),
    right ? el('span', { class: 'tiny', text: right }) : null
  );
}

function renderSide() {
  const route = state.route;
  const scoped = state.me && state.me.scope !== 'global';
  const groups = [];

  if (!scoped) {
    groups.push(
      el(
        'div',
        { class: 'nav-group' },
        el('div', { class: 'nav-label', text: 'Panel' }),
        navItem({ label: 'Overview', hash: '#/overview', ico: 'overview', on: route.view === 'overview' }),
        navItem({ label: 'Runtimes', hash: '#/runtimes', ico: 'runtime', on: route.view === 'runtimes' }),
        isAdmin() ? navItem({ label: 'Activity', hash: '#/activity', ico: 'activity', on: route.view === 'activity' }) : null
      )
    );
  }

  const list = el('div', { class: 'nav-group' }, el('div', { class: 'nav-label', text: `Deployments ${state.deployments.length}` }));
  for (const deployment of state.deployments) {
    list.append(
      navItem({
        label: deployment.name,
        hash: `#/d/${deployment.id}/console`,
        dot: deployment.status,
        right:
          deployment.status === 'running' && deployment.memoryBytes
            ? fmtMb(deployment.memoryBytes / 1048576)
            : statusLabel(deployment.status),
        on: route.view === 'deployment' && route.id === deployment.id,
      })
    );
  }
  if (!state.deployments.length) {
    list.append(el('div', { class: 'nav-label dim', text: 'none yet' }));
  }
  if (isAdmin() && !scoped) {
    list.append(
      el('button', { class: 'nav-item', onclick: openCreate }, icon('plus', 16), el('span', { class: 'grow', text: 'New deployment' }))
    );
  }
  groups.push(list);
  clear(sideEl).append(...groups.filter(Boolean));
}

function renderTop() {
  const roleChip = document.getElementById('roleChip');
  roleChip.textContent = tidy(`${state.me.label}  ${state.me.role}`);
  roleChip.className = `chip ${state.me.role === 'admin' ? 'accent' : ''}`.trim();
  if (state.me.scope !== 'global') roleChip.textContent += ' \u00b7 single deployment';

  const hostChip = document.getElementById('hostChip');
  if (!state.system) return;
  const host = state.system.host;
  hostChip.textContent = tidy(
    `cpu ${host.cpuPercent}%  ram ${fmtMb(host.ram.usedMb)} of ${fmtMb(host.ram.totalMb)}  disk ${fmtBytes(host.disk.freeBytes)} free`
  );
}

// ---------- data --------------------------------------------------------------

export async function refreshDeployments() {
  const data = await api('/deployments');
  state.deployments = data.deployments;
  state.ram = data.ram;
  renderSide();
  return data;
}

export async function refreshSystem() {
  state.system = await api('/system');
  renderTop();
  return state.system;
}

export async function refreshRuntimes() {
  const data = await api('/runtimes');
  state.runtimes = data.runtimes;
  return state.runtimes;
}

// ---------- overview ----------------------------------------------------------

async function renderOverview(host) {
  await Promise.all([refreshSystem(), refreshDeployments()]);
  const system = state.system;
  const ram = state.ram;
  const hostInfo = system.host;

  const cards = el(
    'div',
    { class: 'cards' },
    statCard({
      k: 'RAM pool',
      v: fmtMb(ram.allocatedMb),
      s: `allocated  ${fmtMb(ram.freePoolMb)} free of ${fmtMb(ram.poolMb)}`,
      ratio: ram.poolMb ? ram.allocatedMb / ram.poolMb : 0,
    }),
    statCard({
      k: 'Host memory',
      v: fmtMb(hostInfo.ram.usedMb),
      s: `used  ${fmtMb(hostInfo.ram.freeMb)} free of ${fmtMb(hostInfo.ram.totalMb)}`,
      ratio: hostInfo.ram.totalMb ? hostInfo.ram.usedMb / hostInfo.ram.totalMb : 0,
    }),
    statCard({
      k: 'CPU',
      v: `${hostInfo.cpuPercent}%`,
      s: `${hostInfo.cpuCount} cores`,
      ratio: hostInfo.cpuPercent / 100,
    }),
    statCard({
      k: 'Disk',
      v: fmtBytes(hostInfo.disk.freeBytes),
      s: `free on ${hostInfo.disk.drive}`,
      ratio: hostInfo.disk.totalBytes ? hostInfo.disk.usedBytes / hostInfo.disk.totalBytes : 0,
    }),
    statCard({
      k: 'Deployments',
      v: `${system.counts.running} up`,
      s: `${system.counts.deployments} total  ${system.counts.crashed} crashed`,
    }),
    statCard({
      k: 'Runtimes',
      v: String(system.counts.runtimesInstalled),
      s: 'installed on this host',
    })
  );

  const table = el(
    'table',
    { class: 'grid' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { text: 'Deployment' }),
        el('th', { text: 'Runtime' }),
        el('th', { text: 'RAM' }),
        el('th', { text: 'Port' }),
        el('th', { text: 'Uptime' }),
        el('th', { text: 'Startup' }),
        el('th', { class: 'right', text: 'Actions' })
      )
    ),
    el(
      'tbody',
      {},
      ...state.deployments.map((deployment) => deploymentRow(deployment))
    )
  );

  const body = [
    el('h1', { class: 'page', text: 'Overview' }),
    el('p', { class: 'lead', text: `${hostInfo.hostname} on ${hostInfo.platform}  up ${fmtDuration(hostInfo.uptimeSeconds)}  panel up ${fmtDuration(hostInfo.panelUptimeSeconds)}` }),
    cards,
  ];

  if (ram.allocatedMb > ram.poolMb) {
    body.push(
      el('div', { class: 'banner', text: `The pool is overcommitted by ${fmtMb(ram.allocatedMb - ram.poolMb)}  that is allowed here but watch the host memory` })
    );
  }

  body.push(el('h2', { class: 'sec', text: 'Deployments' }));
  body.push(
    state.deployments.length
      ? el('div', { class: 'card', style: 'padding:4px 6px' }, table)
      : el(
          'div',
          { class: 'empty-state' },
          el('div', { text: 'No deployment yet' }),
          isAdmin() ? el('div', { style: 'margin-top:12px' }, el('button', { class: 'primary', text: 'Create the first one', onclick: openCreate })) : null
        )
  );

  clear(host).append(...body);
  schedulePoll();
}

function deploymentRow(deployment) {
  const actions = el('div', { class: 'row tight right', style: 'justify-content:flex-end' });
  if (isAdmin()) {
    if (deployment.status === 'running') {
      actions.append(
        el('button', { class: 'sm', onclick: (event) => actOn(event, deployment.id, 'restart') }, icon('restart', 13), 'Restart'),
        el('button', { class: 'sm danger', onclick: (event) => actOn(event, deployment.id, 'stop') }, icon('stop', 13), 'Stop')
      );
    } else {
      actions.append(el('button', { class: 'sm primary', onclick: (event) => actOn(event, deployment.id, 'start') }, icon('start', 13), 'Start'));
    }
  }
  actions.append(el('button', { class: 'sm ghost', text: 'Open', onclick: () => go(`#/d/${deployment.id}/console`) }));

  return el(
    'tr',
    { class: 'clickable', onclick: (event) => {
        if (event.target.closest('button')) return;
        go(`#/d/${deployment.id}/console`);
      } },
    el(
      'td',
      {},
      el(
        'div',
        { class: 'row tight' },
        el('span', { class: `dot ${deployment.status}` }),
        el('span', { style: 'font-weight:600', text: deployment.name })
      ),
      el('div', { class: 'dim', style: 'font-size:12px', text: `${statusLabel(deployment.status)}${deployment.pid ? `  pid ${deployment.pid}` : ''}` })
    ),
    el('td', { class: 'nowrap' }, el('span', { class: 'chip', text: deployment.runtimeLabel })),
    el(
      'td',
      { class: 'nowrap' },
      el('div', { text: fmtMb(deployment.ramMb) }),
      deployment.status === 'running' && deployment.memoryBytes
        ? el('div', { class: 'dim', style: 'font-size:12px', text: `using ${fmtBytes(deployment.memoryBytes)}` })
        : null
    ),
    el('td', { class: 'mono nowrap', text: deployment.port ? String(deployment.port) : 'none' }),
    el('td', { class: 'nowrap', text: deployment.status === 'running' ? fmtDuration(deployment.uptimeSeconds) : fmtTime(deployment.lastStoppedAt) }),
    el('td', { class: 'mono', text: deployment.startupFile || 'not set' }),
    el('td', { class: 'right' }, actions)
  );
}

export async function actOn(event, id, action) {
  if (event) event.stopPropagation();
  const button = event && event.target.closest('button');
  if (button) button.disabled = true;
  try {
    await api(`/deployments/${id}/${action}`, { method: 'POST' });
    toast(`${action} sent`, 'ok');
    await refreshDeployments();
    if (state.route.view === 'overview') await renderOverview(mainEl);
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    if (button) button.disabled = false;
  }
}

let pollTimer = null;
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (document.hidden) return schedulePoll();
    try {
      if (state.route.view === 'overview') await renderOverview(mainEl);
      else {
        await refreshSystem();
        await refreshDeployments();
        schedulePoll();
      }
    } catch {
      schedulePoll();
    }
  }, 5000);
}

// ---------- runtimes ----------------------------------------------------------

async function renderRuntimes(host) {
  await refreshRuntimes();
  const rows = state.runtimes.map((runtime) => {
    const action = runtime.installed
      ? el(
          'div',
          { class: 'row tight', style: 'justify-content:flex-end' },
          el('span', { class: 'chip ok', text: `ready ${runtime.installedVersion}` }),
          isAdmin() ? el('button', { class: 'sm danger', onclick: () => removeRuntime(runtime) }, icon('trash', 13), 'Remove') : null
        )
      : isAdmin()
        ? el('button', { class: 'sm primary', text: 'Install', onclick: () => installRuntime(runtime) })
        : el('span', { class: 'chip', text: 'not installed' });
    return el(
      'tr',
      {},
      el('td', {}, el('div', { style: 'font-weight:600', text: runtime.label }), el('div', { class: 'dim', style: 'font-size:12px', text: runtime.family })),
      el('td', { class: 'mono', text: runtime.version }),
      el('td', { class: 'mono dim', text: runtime.exePath || '' }),
      el('td', { class: 'right' }, action)
    );
  });

  clear(host).append(
    el('h1', { class: 'page', text: 'Runtimes' }),
    el('p', { class: 'lead', text: 'Install the versions you need  each deployment picks one of them' }),
    el('div', { class: 'banner info', text: 'Node packages come from nodejs org and Python from python org  the host needs outbound https for an install' }),
    el(
      'div',
      { class: 'card', style: 'padding:4px 6px' },
      el(
        'table',
        { class: 'grid' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Runtime' }), el('th', { text: 'Version' }), el('th', { text: 'Path' }), el('th', { class: 'right', text: '' }))),
        el('tbody', {}, ...rows)
      )
    )
  );
}

async function installRuntime(runtime) {
  const log = el('div', { class: 'console', style: 'height:240px' }, el('span', { class: 'empty', text: 'starting' }));
  let done = false;
  openModal({
    title: `Install ${runtime.label}`,
    lead: 'This downloads the official build and registers it  keep this open',
    body: log,
    confirmLabel: 'Close',
    cancelLabel: 'Hide',
    onConfirm: () => done,
  });

  try {
    const { jobId } = await api(`/runtimes/${runtime.id}/install`, { method: 'POST' });
    const poll = async () => {
      const job = await api(`/runtimes/jobs/${jobId}`);
      clear(log).append(...job.lines.map((line) => el('span', { class: 'l', text: line })));
      log.scrollTop = log.scrollHeight;
      if (job.state === 'running') return setTimeout(poll, 1200);
      done = true;
      if (job.state === 'done') {
        toast(`${runtime.label} installed`, 'ok');
        await renderRuntimes(mainEl);
      } else {
        toast(job.error || 'Install failed', 'bad');
      }
    };
    poll();
  } catch (err) {
    done = true;
    clear(log).append(el('span', { class: 'l err', text: err.message }));
    toast(err.message, 'bad');
  }
}

async function removeRuntime(runtime) {
  const ok = await confirmBox({
    title: `Remove ${runtime.label}`,
    lead: 'The panel forgets this runtime  files stay on disk',
    confirmLabel: 'Remove',
  });
  if (!ok) return;
  try {
    await api(`/runtimes/${runtime.id}`, { method: 'DELETE' });
    toast('Runtime removed', 'ok');
    await renderRuntimes(mainEl);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

// ---------- activity ----------------------------------------------------------

async function renderActivity(host) {
  const data = await api('/audit?limit=200');
  clear(host).append(
    el('h1', { class: 'page', text: 'Activity' }),
    el('p', { class: 'lead', text: 'Every write action on this panel is written down' }),
    el(
      'div',
      { class: 'card', style: 'padding:4px 6px' },
      el(
        'table',
        { class: 'grid' },
        el('thead', {}, el('tr', {}, el('th', { text: 'When' }), el('th', { text: 'Who' }), el('th', { text: 'Action' }), el('th', { text: 'Target' }), el('th', { text: 'Detail' }), el('th', { text: 'From' }))),
        el(
          'tbody',
          {},
          ...data.entries.map((entry) =>
            el(
              'tr',
              {},
              el('td', { class: 'nowrap dim', text: fmtTime(entry.at) }),
              el('td', { text: entry.actor }),
              el('td', { class: 'mono', text: entry.action }),
              el('td', { text: entry.target || '' }),
              el('td', { class: 'dim', text: entry.detail || '' }),
              el('td', { class: 'mono dim', text: entry.ip || '' })
            )
          )
        )
      )
    )
  );
}

// ---------- create ------------------------------------------------------------

export async function openCreate() {
  await Promise.all([refreshRuntimes(), refreshSystem()]);
  const installed = state.runtimes.filter((runtime) => runtime.installed);
  if (!installed.length) {
    toast('Install a runtime first', 'warn');
    return go('#/runtimes');
  }

  const ram = state.ram || (await refreshDeployments()).ram;
  const freePool = Math.max(128, ram.freePoolMb);
  const suggested = Math.min(512, freePool);

  const nameInput = el('input', { placeholder: 'my discord bot', maxlength: '48', required: 'required' });
  const runtimeSelect = el(
    'select',
    {},
    ...installed.map((runtime) =>
      el('option', { value: runtime.id, text: `${runtime.label}  ${runtime.version}` })
    )
  );
  const ramRange = el('input', { type: 'range', min: '64', max: String(Math.max(1024, Math.min(state.system.host.ram.totalMb, freePool * 2))), step: '64', value: String(suggested) });
  const ramNumber = el('input', { type: 'number', min: '64', max: String(state.system.host.ram.totalMb), step: '32', value: String(suggested), style: 'max-width:120px' });
  const ramNote = el('div', { class: 'hint' });
  const portMode = el(
    'select',
    {},
    el('option', { value: 'auto', text: 'Pick the next free port' }),
    el('option', { value: 'none', text: 'No port  this bot does not listen' }),
    el('option', { value: 'fixed', text: 'Set the port by hand' })
  );
  const portInput = el('input', { type: 'number', min: '1', max: '65535', placeholder: String(ram.portMin || ''), style: 'display:none' });
  const autostart = el('input', { type: 'checkbox', checked: true, style: 'width:auto' });
  const autoRestart = el('input', { type: 'checkbox', checked: true, style: 'width:auto' });

  const syncRam = (value) => {
    const mb = Math.max(64, Number(value) || 64);
    ramRange.value = String(Math.min(Number(ramRange.max), mb));
    ramNumber.value = String(mb);
    ramNote.textContent =
      mb > freePool
        ? `${fmtMb(mb)} is more than the ${fmtMb(freePool)} left in the pool  allowed but keep an eye on the host`
        : `${fmtMb(freePool - mb)} would stay free in the pool`;
    ramNote.style.color = mb > freePool ? 'var(--warn)' : 'var(--muted)';
  };
  ramRange.addEventListener('input', () => syncRam(ramRange.value));
  ramNumber.addEventListener('input', () => syncRam(ramNumber.value));
  portMode.addEventListener('change', () => {
    portInput.style.display = portMode.value === 'fixed' ? '' : 'none';
  });
  syncRam(suggested);

  const body = el(
    'div',
    {},
    field('Name', nameInput, 'Letters digits space dot dash and underscore'),
    field('Runtime', runtimeSelect, 'Pick the language and version this bot runs on'),
    field(
      'Memory',
      el('div', { class: 'row' }, el('div', { class: 'grow' }, ramRange), ramNumber, el('span', { class: 'dim', text: 'MB' })),
      null
    ),
    ramNote,
    field('Port', el('div', {}, portMode, el('div', { style: 'margin-top:8px' }, portInput)), `Ports stay on 127 0 0 1 and are reached through the proxy`),
    el(
      'div',
      { class: 'row', style: 'gap:18px;margin-top:4px' },
      el('label', { class: 'row tight', style: 'font-size:13px;font-weight:600' }, autostart, 'Start with the panel'),
      el('label', { class: 'row tight', style: 'font-size:13px;font-weight:600' }, autoRestart, 'Restart after a crash')
    )
  );

  const created = await openModal({
    title: 'New deployment',
    lead: 'Set the basics now  upload the zip right after',
    body,
    confirmLabel: 'Create',
    onConfirm: async () => {
      const payload = {
        name: nameInput.value.trim(),
        runtimeId: runtimeSelect.value,
        ramMb: Number(ramNumber.value),
        port: portMode.value === 'fixed' ? Number(portInput.value) : portMode.value,
        autostart: autostart.checked,
        autoRestart: autoRestart.checked,
      };
      const data = await api('/deployments', { method: 'POST', body: payload });
      if (data.warning) toast(data.warning, 'warn', 6000);
      return data.deployment;
    },
  });

  if (created) {
    toast(`${created.name} created  upload the files now`, 'ok');
    await refreshDeployments();
    go(`#/d/${created.id}/files`);
  }
}

// ---------- boot --------------------------------------------------------------

async function boot() {
  initTheme();
  document.getElementById('themeBtn').prepend(icon('theme', 14));
  document.getElementById('signOutBtn').prepend(icon('logout', 14));
  try {
    const me = await api('/auth/me');
    if (!me.signedIn) {
      window.location.href = '/access';
      return;
    }
    state.me = me;
    setCsrf(me.csrf);
  } catch {
    window.location.href = '/access';
    return;
  }

  try {
    const portal = await fetch('/api/portal', { credentials: 'same-origin' }).then((res) => res.json());
    document.getElementById('noticeChip').textContent = tidy(portal.notice);
  } catch {}

  await refreshSystem();
  await refreshDeployments();
  renderTop();

  if (state.me.scope !== 'global' && state.me.deploymentId) {
    if (!window.location.hash || window.location.hash === '#/overview') {
      window.location.hash = `#/d/${state.me.deploymentId}/console`;
    }
  }
  await render();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshSystem().catch(() => {});
  });
}

boot();
