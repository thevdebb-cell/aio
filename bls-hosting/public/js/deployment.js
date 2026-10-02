import { api } from './api.js';
import { el, clear, toast, openModal, confirmBox, field, fmtBytes, fmtMb, fmtDuration, fmtTime, fmtClock, copyText } from './ui.js';

let ws = null;
let current = null;
let consoleEl = null;
let autoScroll = true;

export function closeConsole() {
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }
  consoleEl = null;
}

async function shell() {
  return import('./panel.js');
}

const statusChip = (status) => {
  const kind = status === 'running' ? 'ok' : status === 'crashed' ? 'bad' : ['starting', 'stopping', 'installing'].includes(status) ? 'warn' : '';
  return el('span', { class: `chip ${kind}`.trim() }, el('span', { class: `dot ${status}` }), status);
};

export async function renderDeployment(host, id, tab) {
  const panel = await shell();
  const data = await api(`/deployments/${id}`);
  current = data.deployment;
  const admin = panel.isAdmin();

  const header = el(
    'div',
    { class: 'row', style: 'align-items:flex-start;gap:14px' },
    el(
      'div',
      { class: 'grow' },
      el('h1', { class: 'page', text: current.name }),
      el('p', {
        class: 'lead',
        text: `${current.runtimeLabel}  ${fmtMb(current.ramMb)} allocated  ${current.port ? `port ${current.port}` : 'no port'}  startup ${current.startupFile || 'not set'}`,
      })
    ),
    el(
      'div',
      { class: 'row tight' },
      statusChip(current.status),
      current.pid ? el('span', { class: 'chip', text: `pid ${current.pid}` }) : null,
      current.status === 'running' ? el('span', { class: 'chip', text: `up ${fmtDuration(current.uptimeSeconds)}` }) : null,
      current.status === 'running' && current.memoryBytes
      ? el('span', { class: 'chip', text: `ram ${fmtBytes(current.memoryBytes)}` })
      : null
    )
  );

  const controls = el('div', { class: 'row tight', style: 'margin-top:4px' });
  if (admin) {
    const act = async (action, button) => {
      button.disabled = true;
      try {
        await api(`/deployments/${id}/${action}`, { method: 'POST' });
        toast(`${action} sent`, 'ok');
        await panel.refreshDeployments();
      } catch (err) {
        toast(err.message, 'bad');
      } finally {
        button.disabled = false;
      }
    };
    const mk = (label, action, cls) => {
      const button = el('button', { class: cls, text: label });
      button.addEventListener('click', () => act(action, button));
      return button;
    };
    controls.append(
      mk('Start', 'start', 'primary'),
      mk('Stop', 'stop', ''),
      mk('Restart', 'restart', ''),
      mk('Kill', 'kill', 'danger'),
      mk('Install deps', 'install', '')
    );
  } else {
    controls.append(el('span', { class: 'chip', text: 'viewer role  read only' }));
  }

  const tabs = el(
    'div',
    { class: 'tabs' },
    ...[
      ['console', 'Console'],
      ['files', 'Files'],
      ['env', 'Environment'],
      ['settings', 'Settings'],
    ].map(([key, label]) =>
      el('button', {
        class: `tab${tab === key ? ' on' : ''}`,
        text: label,
        onclick: () => panel.go(`#/d/${id}/${key}`),
      })
    )
  );

  const body = el('div', { id: 'tabBody' });
  clear(host).append(header, controls, tabs, body);

  if (!current.runtimeReady) {
    body.append(el('div', { class: 'banner bad', text: `The runtime ${current.runtimeId} is not installed on this host  install it in Runtimes` }));
  }
  if (!current.startupFile) {
    body.append(el('div', { class: 'banner', text: 'No startup file picked yet  upload your files then choose one in Settings' }));
  }

  if (tab === 'console') await renderConsole(body, id, admin);
  else if (tab === 'files') await renderFiles(body, id, admin);
  else if (tab === 'env') await renderEnv(body, id, admin);
  else await renderSettings(body, id, admin, panel);
}

// ---------- console -----------------------------------------------------------

function lineNode(line) {
  return el(
    'span',
    { class: `l ${line.stream}` },
    el('span', { class: 't', text: fmtClock(line.at) }),
    document.createTextNode(line.text)
  );
}

async function renderConsole(host, id, admin) {
  consoleEl = el('div', { class: 'console', id: 'console' }, el('span', { class: 'empty', text: 'waiting for output' }));
  consoleEl.addEventListener('scroll', () => {
    autoScroll = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 30;
  });

  const bar = el('div', { class: 'console-bar' });
  if (admin) {
    const input = el('input', { class: 'grow', placeholder: 'send a line to the process and press enter' });
    const send = async () => {
      const text = input.value;
      if (!text.trim()) return;
      try {
        await api(`/deployments/${id}/console/input`, { method: 'POST', body: { text } });
        input.value = '';
      } catch (err) {
        toast(err.message, 'bad');
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') send();
    });
    bar.append(
      input,
      el('button', { text: 'Send', onclick: send }),
      el('button', {
        class: 'ghost',
        text: 'Clear',
        onclick: async () => {
          try {
            await api(`/deployments/${id}/console/clear`, { method: 'POST' });
          } catch (err) {
            toast(err.message, 'bad');
          }
        },
      })
    );
  } else {
    bar.append(el('span', { class: 'dim', style: 'font-size:12px', text: 'viewers can read the console but cannot type into it' }));
  }

  host.append(consoleEl, bar);
  connectConsole(id);
}

function connectConsole(id) {
  closeConsole();
  consoleEl = document.getElementById('console');
  if (!consoleEl) return;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${scheme}://${window.location.host}/ws?id=${id}`);

  const paint = (lines) => {
    if (!consoleEl) return;
    if (!lines.length) {
      clear(consoleEl).append(el('span', { class: 'empty', text: 'no output yet  start the deployment to see it live' }));
      return;
    }
    clear(consoleEl).append(...lines.map(lineNode));
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  ws.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!consoleEl) return;
    if (payload.type === 'backlog') paint(payload.lines || []);
    else if (payload.type === 'clear') paint([]);
    else if (payload.type === 'line') {
      const empty = consoleEl.querySelector('.empty');
      if (empty) empty.remove();
      consoleEl.append(lineNode(payload.line));
      while (consoleEl.childElementCount > 2200) consoleEl.firstElementChild.remove();
      if (autoScroll) consoleEl.scrollTop = consoleEl.scrollHeight;
    } else if (payload.type === 'status') {
      import('./panel.js').then((panel) => panel.refreshDeployments().catch(() => {}));
    }
  });

  ws.addEventListener('close', () => {
    if (ws && consoleEl) setTimeout(() => {
      if (document.getElementById('console')) connectConsole(id);
    }, 3000);
  });
  ws.addEventListener('error', () => {});
}

// ---------- files -------------------------------------------------------------

async function renderFiles(host, id, admin) {
  const wrap = el('div');
  host.append(wrap);
  await paintDir(wrap, id, admin, '');
}

async function paintDir(wrap, id, admin, dirPath) {
  const listing = await api(`/deployments/${id}/files?path=${encodeURIComponent(dirPath)}`);
  const parts = listing.path ? listing.path.split('/') : [];

  const crumbs = el('div', { class: 'crumbs' }, el('button', { text: 'root', onclick: () => paintDir(wrap, id, admin, '') }));
  parts.forEach((part, index) => {
    const target = parts.slice(0, index + 1).join('/');
    crumbs.append(el('span', { class: 'sep', text: '/' }), el('button', { text: part, onclick: () => paintDir(wrap, id, admin, target) }));
  });

  const tools = el('div', { class: 'row', style: 'margin-bottom:12px' });
  if (admin) {
    tools.append(
      el('button', { class: 'sm', text: 'New file', onclick: () => createEntry(wrap, id, admin, listing.path, 'file') }),
      el('button', { class: 'sm', text: 'New folder', onclick: () => createEntry(wrap, id, admin, listing.path, 'dir') }),
      el('button', {
        class: 'sm',
        text: 'Download all',
        onclick: () => downloadZip(id),
      })
    );
  }
  tools.append(el('span', { class: 'grow' }), el('button', { class: 'sm ghost', text: 'Reload', onclick: () => paintDir(wrap, id, admin, listing.path) }));

  const rows = listing.entries.map((entry) => {
    const actions = el('div', { class: 'row tight', style: 'justify-content:flex-end' });
    if (entry.kind === 'file') {
      if (entry.editable) {
        actions.append(
          el('button', { class: 'sm ghost', text: admin ? 'Edit' : 'View', onclick: () => openEditor(wrap, id, admin, entry.path, listing.path) })
        );
      }
      if (admin) {
        actions.append(
          el('button', { class: 'sm ghost', text: 'Startup', title: 'Use this file as the entry point', onclick: () => setStartup(id, entry.path) }),
          el('button', { class: 'sm ghost', text: 'Get', onclick: () => downloadFile(id, entry.path) })
        );
      }
    }
    if (admin) {
      actions.append(
        el('button', { class: 'sm ghost', text: 'Rename', onclick: () => renameEntry(wrap, id, admin, entry, listing.path) }),
        el('button', { class: 'sm danger', text: 'Delete', onclick: () => deleteEntry(wrap, id, admin, entry, listing.path) })
      );
    }

    const name = el(
      'div',
      { class: 'row tight' },
      el('span', { class: 'dim', text: entry.kind === 'dir' ? '[dir]' : '[file]' }),
      entry.kind === 'dir'
        ? el('button', { class: 'ghost sm', style: 'font-weight:600', text: entry.name, onclick: () => paintDir(wrap, id, admin, entry.path) })
        : el('span', { style: 'font-weight:500', text: entry.name }),
      current && current.startupFile === entry.path ? el('span', { class: 'chip accent', text: 'startup' }) : null
    );

    return el(
      'tr',
      {},
      el('td', {}, name),
      el('td', { class: 'nowrap dim', text: entry.kind === 'dir' ? '' : fmtBytes(entry.size) }),
      el('td', { class: 'nowrap dim', text: fmtTime(entry.modified) }),
      el('td', { class: 'right' }, actions)
    );
  });

  const table = el(
    'div',
    { class: 'card', style: 'padding:4px 6px' },
    el(
      'table',
      { class: 'grid' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Name' }), el('th', { text: 'Size' }), el('th', { text: 'Changed' }), el('th', { class: 'right', text: '' }))),
      el('tbody', {}, ...rows)
    )
  );

  const empty = el('div', { class: 'empty-state', text: 'This folder is empty' });

  clear(wrap).append(
    admin ? uploadZone(wrap, id, admin) : null,
    crumbs,
    tools,
    rows.length ? table : empty
  );
}

function uploadZone(wrap, id, admin) {
  const fileInput = el('input', { type: 'file', accept: '.zip', style: 'display:none' });
  const cleanBox = el('input', { type: 'checkbox', style: 'width:auto' });
  const status = el('div', { class: 'hint' });
  const drop = el(
    'div',
    { class: 'drop' },
    el('div', { style: 'font-weight:600;color:var(--fg)', text: 'Drop a zip here or pick one' }),
    el('div', { style: 'font-size:12px;margin-top:4px', text: 'It unpacks straight into the deployment folder' }),
    el(
      'div',
      { class: 'row', style: 'justify-content:center;margin-top:12px' },
      el('button', { class: 'primary sm', text: 'Choose zip', onclick: () => fileInput.click() }),
      el('label', { class: 'row tight', style: 'font-size:12px;font-weight:600' }, cleanBox, 'Clear the folder first')
    ),
    status,
    fileInput
  );

  const send = async (file) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      toast('Only zip archives are accepted', 'bad');
      return;
    }
    status.textContent = `uploading ${file.name}  ${fmtBytes(file.size)}`;
    const form = new FormData();
    form.append('clean', cleanBox.checked ? 'true' : 'false');
    form.append('archive', file);
    try {
      const result = await api(`/deployments/${id}/upload`, { method: 'POST', body: form });
      status.textContent = '';
      toast(`${result.written} files unpacked${result.startupFile ? `  startup ${result.startupFile}` : ''}`, 'ok', 6000);
      if (result.skipped) toast(`${result.skipped} unsafe entries were skipped`, 'warn');
      current = result.deployment;
      const panel = await shell();
      await panel.refreshDeployments();
      // The header carries the startup file so the whole view is repainted
      await renderDeployment(document.getElementById('main'), id, 'files');
    } catch (err) {
      status.textContent = '';
      toast(err.message, 'bad', 6000);
    }
  };

  fileInput.addEventListener('change', () => send(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('over');
    })
  );
  ['dragleave', 'drop'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove('over');
    })
  );
  drop.addEventListener('drop', (event) => send(event.dataTransfer.files[0]));

  return el('div', { style: 'margin-bottom:14px' }, drop);
}

async function openEditor(wrap, id, admin, filePath, dirPath) {
  const data = await api(`/deployments/${id}/file?path=${encodeURIComponent(filePath)}`);
  const readOnly = data.readOnly || !admin;
  const area = el('textarea', { class: 'editor', spellcheck: 'false', readOnly });
  area.value = data.file.content;

  const saveBtn = el('button', { class: 'primary', text: 'Save' });
  const status = el('span', { class: 'dim', style: 'font-size:12px', text: `${fmtBytes(data.file.size)}  changed ${fmtTime(data.file.modified)}` });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const saved = await api(`/deployments/${id}/file`, { method: 'PUT', body: { path: filePath, content: area.value } });
      status.textContent = `saved  ${fmtBytes(saved.file.size)}  ${fmtTime(saved.file.modified)}`;
      toast('File saved  restart to apply', 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      saveBtn.disabled = false;
    }
  });

  area.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (!readOnly) saveBtn.click();
    }
  });

  clear(wrap).append(
    el(
      'div',
      { class: 'row', style: 'margin-bottom:10px' },
      el('button', { class: 'sm', text: 'Back to files', onclick: () => paintDir(wrap, id, admin, dirPath) }),
      el('span', { class: 'mono grow', text: filePath }),
      readOnly ? el('span', { class: 'chip', text: 'read only' }) : saveBtn
    ),
    area,
    el('div', { style: 'margin-top:8px' }, status)
  );
}

async function createEntry(wrap, id, admin, dirPath, kind) {
  const input = el('input', { placeholder: kind === 'dir' ? 'folder name' : 'file name  example index js' });
  const ok = await openModal({
    title: kind === 'dir' ? 'New folder' : 'New file',
    body: field('Name', input),
    confirmLabel: 'Create',
    onConfirm: async () => {
      const name = input.value.trim();
      if (!name) throw new Error('Give it a name');
      const target = dirPath ? `${dirPath}/${name}` : name;
      await api(`/deployments/${id}/files/new`, { method: 'POST', body: { path: target, kind } });
      return true;
    },
  });
  if (ok) {
    toast('Created', 'ok');
    await paintDir(wrap, id, admin, dirPath);
  }
}

async function renameEntry(wrap, id, admin, entry, dirPath) {
  const input = el('input', { value: entry.name });
  const ok = await openModal({
    title: `Rename ${entry.name}`,
    body: field('New name', input),
    confirmLabel: 'Rename',
    onConfirm: async () => {
      const name = input.value.trim();
      if (!name) throw new Error('Give it a name');
      const target = dirPath ? `${dirPath}/${name}` : name;
      await api(`/deployments/${id}/files/rename`, { method: 'POST', body: { path: entry.path, to: target } });
      return true;
    },
  });
  if (ok) {
    toast('Renamed', 'ok');
    await paintDir(wrap, id, admin, dirPath);
  }
}

async function deleteEntry(wrap, id, admin, entry, dirPath) {
  const ok = await confirmBox({
    title: `Delete ${entry.name}`,
    lead: entry.kind === 'dir' ? 'The folder and everything inside goes away' : 'This cannot be undone',
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    await api(`/deployments/${id}/files?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' });
    toast('Deleted', 'ok');
    await paintDir(wrap, id, admin, dirPath);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function setStartup(id, filePath) {
  try {
    await api(`/deployments/${id}`, { method: 'PATCH', body: { startupFile: filePath } });
    current.startupFile = filePath;
    toast(`Startup file set to ${filePath}`, 'ok');
    const panel = await shell();
    await panel.refreshDeployments();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function downloadZip(id) {
  try {
    const res = await api(`/deployments/${id}/download`, { raw: true });
    triggerDownload(await res.blob(), `${current.slug}.zip`);
  } catch (err) {
    toast(err.message || 'Download refused', 'bad');
  }
}

async function downloadFile(id, filePath) {
  try {
    const res = await api(`/deployments/${id}/download?path=${encodeURIComponent(filePath)}`, { raw: true });
    triggerDownload(await res.blob(), filePath.split('/').pop());
  } catch (err) {
    toast(err.message || 'Download refused', 'bad');
  }
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- env ---------------------------------------------------------------

async function renderEnv(host, id, admin) {
  const data = await api(`/deployments/${id}/env`);
  const rows = el('tbody');
  let revealed = false;

  const addRow = (entry = { key: '', value: '', secret: true, masked: false }) => {
    const keyInput = el('input', { class: 'mono', value: entry.key, placeholder: 'TOKEN', readOnly: !admin });
    const valueInput = el('input', {
      class: 'mono',
      type: entry.masked ? 'password' : 'text',
      value: entry.masked ? '' : entry.value,
      placeholder: entry.masked ? `hidden  ${entry.length} characters` : 'value',
      readOnly: !admin,
    });
    valueInput.dataset.keep = entry.masked ? 'true' : 'false';
    valueInput.addEventListener('input', () => {
      valueInput.dataset.keep = 'false';
    });
    const secretBox = el('input', { type: 'checkbox', checked: entry.secret !== false, style: 'width:auto', disabled: !admin });
    const row = el(
      'tr',
      {},
      el('td', {}, keyInput),
      el('td', {}, valueInput),
      el('td', { class: 'nowrap' }, el('label', { class: 'row tight', style: 'font-size:12px' }, secretBox, 'secret')),
      el(
        'td',
        { class: 'right' },
        admin ? el('button', { class: 'sm danger ghost', text: 'Remove', onclick: () => row.remove() }) : null
      )
    );
    row.dataset.row = '1';
    rows.append(row);
  };

  data.env.forEach(addRow);
  if (!data.env.length && admin) addRow();

  const save = async () => {
    const payload = [...rows.querySelectorAll('tr[data-row]')].map((row) => {
      const [keyInput, valueInput] = row.querySelectorAll('input.mono');
      const secretBox = row.querySelector('input[type="checkbox"]');
      return {
        key: keyInput.value.trim(),
        value: valueInput.value,
        secret: secretBox.checked,
        keep: valueInput.dataset.keep === 'true',
      };
    }).filter((entry) => entry.key);
    try {
      const result = await api(`/deployments/${id}/env`, { method: 'PUT', body: { env: payload } });
      toast(`${result.env.length} ${result.env.length === 1 ? 'key' : 'keys'} saved  restart to apply`, 'ok');
      await renderEnv(host, id, admin);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const revealBtn = el('button', { class: 'sm', text: 'Reveal values' });
  revealBtn.addEventListener('click', async () => {
    if (revealed) {
      await renderEnv(host, id, admin);
      return;
    }
    try {
      const full = await api(`/deployments/${id}/env?reveal=1`);
      revealed = true;
      rows.replaceChildren();
      full.env.forEach(addRow);
      revealBtn.textContent = 'Hide values';
      toast('Values shown  this is written to the activity log', 'warn');
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  const card = el(
    'div',
    { class: 'card', style: 'padding:4px 6px' },
    el(
      'table',
      { class: 'grid' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Key', style: 'width:32%' }), el('th', { text: 'Value' }), el('th', { text: 'Hidden' }), el('th', { class: 'right', text: '' }))),
      rows
    )
  );

  clear(host).append(
    el('div', { class: 'banner info', text: 'These keys land in a env file inside the deployment folder and in the process environment  restart the deployment to apply a change' }),
    el(
      'div',
      { class: 'row', style: 'margin-bottom:12px' },
      admin ? el('button', { class: 'sm', text: 'Add key', onclick: () => addRow() }) : null,
      data.canReveal ? revealBtn : el('span', { class: 'chip', text: 'values stay hidden for viewers' }),
      el('span', { class: 'grow' }),
      admin ? el('button', { class: 'primary', text: 'Save environment', onclick: save }) : null
    ),
    card
  );
}

// ---------- settings ----------------------------------------------------------

async function renderSettings(host, id, admin, panel) {
  const [detail, runtimesData, candidates] = await Promise.all([
    api(`/deployments/${id}`),
    api('/runtimes'),
    api(`/deployments/${id}/startup-candidates`),
  ]);
  const deployment = detail.deployment;
  current = deployment;
  const ram = detail.ram;
  const installed = runtimesData.runtimes.filter((runtime) => runtime.installed);

  const nameInput = el('input', { value: deployment.name, readOnly: !admin });
  const runtimeSelect = el(
    'select',
    { disabled: !admin },
    ...installed.map((runtime) =>
      el('option', { value: runtime.id, text: `${runtime.label}  ${runtime.version}`, selected: runtime.id === deployment.runtimeId })
    )
  );
  const ramInput = el('input', { type: 'number', min: '64', step: '32', value: String(deployment.ramMb), readOnly: !admin });
  const portInput = el('input', { type: 'number', min: '1', max: '65535', value: deployment.port ? String(deployment.port) : '', placeholder: 'none', readOnly: !admin });
  const startupSelect = el(
    'select',
    { disabled: !admin },
    el('option', { value: '', text: 'not set' }),
    ...candidates.candidates.map((candidate) =>
      el('option', { value: candidate, text: candidate, selected: candidate === deployment.startupFile })
    )
  );
  if (deployment.startupFile && !candidates.candidates.includes(deployment.startupFile)) {
    startupSelect.append(el('option', { value: deployment.startupFile, text: deployment.startupFile, selected: true }));
  }
  const argsInput = el('input', { class: 'mono', value: deployment.extraArgs, placeholder: 'extra arguments passed after the startup file', readOnly: !admin });
  const installInput = el('input', { class: 'mono', value: deployment.installCmd, placeholder: 'leave empty to use npm or pip automatically', readOnly: !admin });
  const autostart = el('input', { type: 'checkbox', checked: deployment.autostart, style: 'width:auto', disabled: !admin });
  const autoRestart = el('input', { type: 'checkbox', checked: deployment.autoRestart, style: 'width:auto', disabled: !admin });
  const notesInput = el('textarea', { rows: '3', value: deployment.notes, placeholder: 'notes for the team', readOnly: !admin });

  const save = async () => {
    try {
      const result = await api(`/deployments/${id}`, {
        method: 'PATCH',
        body: {
          name: nameInput.value.trim(),
          runtimeId: runtimeSelect.value,
          ramMb: Number(ramInput.value),
          port: portInput.value ? Number(portInput.value) : 'none',
          startupFile: startupSelect.value,
          extraArgs: argsInput.value,
          installCmd: installInput.value,
          autostart: autostart.checked,
          autoRestart: autoRestart.checked,
          notes: notesInput.value,
        },
      });
      (result.warnings || []).forEach((warning) => toast(warning, 'warn', 6000));
      toast('Settings saved', 'ok');
      await panel.refreshDeployments();
      await renderDeployment(document.getElementById('main'), id, 'settings');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const generalCard = el(
    'div',
    { class: 'card' },
    el('h2', { class: 'sec', style: 'margin-top:0', text: 'General' }),
    field('Name', nameInput),
    field('Runtime', runtimeSelect, 'Stop the deployment before changing this'),
    field('Memory in MB', ramInput, `${fmtMb(ram.freePoolMb)} free in the pool  overcommit is ${ram.overcommit ? 'allowed' : 'blocked'}`),
    field('Port', portInput, 'Leave empty when the bot does not listen on a port'),
    field('Startup file', startupSelect, 'The file the runtime boots'),
    field('Extra arguments', argsInput),
    field('Install command', installInput, 'Runs when you press Install deps'),
    el(
      'div',
      { class: 'row', style: 'gap:18px;margin:8px 0 4px' },
      el('label', { class: 'row tight', style: 'font-size:13px;font-weight:600' }, autostart, 'Start with the panel'),
      el('label', { class: 'row tight', style: 'font-size:13px;font-weight:600' }, autoRestart, 'Restart after a crash')
    ),
    field('Notes', notesInput),
    admin ? el('button', { class: 'primary', text: 'Save settings', onclick: save }) : el('span', { class: 'chip', text: 'viewer role  read only' })
  );

  const infoCard = el(
    'div',
    { class: 'card' },
    el('h2', { class: 'sec', style: 'margin-top:0', text: 'Facts' }),
    el(
      'table',
      { class: 'grid' },
      el(
        'tbody',
        {},
        ...[
          ['Slug', deployment.slug],
          ['Folder size', fmtBytes(deployment.diskBytes || 0)],
          ['Created', fmtTime(deployment.createdAt)],
          ['Updated', fmtTime(deployment.updatedAt)],
          ['Last start', fmtTime(deployment.lastStartedAt)],
          ['Last stop', fmtTime(deployment.lastStoppedAt)],
          ['Last exit', deployment.lastExitCode === null ? 'none' : `code ${deployment.lastExitCode}  ${deployment.lastExitNote || ''}`],
          ['Peak memory', fmtBytes(deployment.memoryPeakBytes || 0)],
        ].map(([key, value]) => el('tr', {}, el('td', { class: 'dim nowrap', text: key }), el('td', { class: 'mono', text: String(value) })))
      )
    )
  );

  const cards = el('div', { class: 'cards', style: 'grid-template-columns:repeat(auto-fit,minmax(320px,1fr))' }, generalCard, infoCard);
  clear(host).append(cards);

  if (admin) {
    host.append(await codesCard(id, deployment));
    host.append(dangerCard(id, deployment, panel));
  }
}

async function codesCard(id, deployment) {
  const card = el('div', { class: 'card', style: 'margin-top:14px' });
  const body = el('div');

  const paint = async () => {
    const data = await api(`/deployments/${id}/codes`);
    const rows = data.codes.map((code) =>
      el(
        'tr',
        {},
        el('td', { text: code.label }),
        el('td', {}, el('span', { class: `chip ${code.role === 'admin' ? 'accent' : ''}`.trim(), text: code.role })),
        el('td', { class: 'mono dim', text: code.hint }),
        el('td', { class: 'dim nowrap', text: fmtTime(code.createdAt) }),
        el('td', { class: 'dim nowrap', text: `${code.useCount} uses  last ${fmtTime(code.lastUsedAt)}` }),
        el(
          'td',
          { class: 'right' },
          el('button', {
            class: 'sm danger ghost',
            text: 'Revoke',
            onclick: async () => {
              const ok = await confirmBox({ title: `Revoke ${code.label}`, lead: 'Anyone holding that code loses access right away', confirmLabel: 'Revoke' });
              if (!ok) return;
              await api(`/deployments/${id}/codes/${code.id}`, { method: 'DELETE' });
              toast('Code revoked', 'ok');
              paint();
            },
          })
        )
      )
    );
    clear(body).append(
      rows.length
        ? el(
            'table',
            { class: 'grid' },
            el('thead', {}, el('tr', {}, el('th', { text: 'Label' }), el('th', { text: 'Role' }), el('th', { text: 'Hint' }), el('th', { text: 'Created' }), el('th', { text: 'Used' }), el('th', { class: 'right', text: '' }))),
            el('tbody', {}, ...rows)
          )
        : el('div', { class: 'dim', style: 'font-size:13px', text: 'No code for this deployment yet' })
    );
  };

  const generate = async (role) => {
    const labelInput = el('input', { value: `${deployment.name} ${role}`, maxlength: '60' });
    const result = await openModal({
      title: `New ${role} code`,
      lead: role === 'admin' ? 'An admin code can manage this deployment only' : 'A viewer code can read the code and the console but cannot change or download anything',
      body: field('Label', labelInput),
      confirmLabel: 'Generate',
      onConfirm: () => api(`/deployments/${id}/codes`, { method: 'POST', body: { role, label: labelInput.value.trim() } }),
    });
    if (!result) return;
    const box = el('div', { class: 'codebox', text: result.code });
    await openModal({
      title: 'Copy this code now',
      lead: result.note,
      body: el('div', {}, box, el('div', { class: 'row', style: 'justify-content:center;margin-top:12px' }, el('button', { class: 'sm', text: 'Copy', onclick: () => copyText(result.code) }))),
      confirmLabel: 'Done',
      cancelLabel: 'Close',
      onConfirm: () => true,
    });
    paint();
  };

  card.append(
    el(
      'div',
      { class: 'row' },
      el('h2', { class: 'sec grow', style: 'margin:0', text: 'Access codes for this deployment' }),
      el('button', { class: 'sm', text: 'New viewer code', onclick: () => generate('viewer') }),
      el('button', { class: 'sm', text: 'New admin code', onclick: () => generate('admin') })
    ),
    el('p', { class: 'lead', style: 'margin:6px 0 12px', text: 'A code made here opens this deployment only  nothing else on the panel' }),
    body
  );
  await paint();
  return card;
}

function dangerCard(id, deployment, panel) {
  return el(
    'div',
    { class: 'card', style: 'margin-top:14px;border-color:var(--bad)' },
    el('h2', { class: 'sec', style: 'margin-top:0;color:var(--bad)', text: 'Delete this deployment' }),
    el('p', { class: 'lead', style: 'margin:0 0 12px', text: 'The process is killed and the folder with the logs is wiped  there is no undo' }),
    el('button', {
      class: 'danger',
      text: `Delete ${deployment.name}`,
      onclick: async () => {
        const confirmInput = el('input', { placeholder: deployment.name });
        const ok = await openModal({
          title: `Delete ${deployment.name}`,
          lead: 'Type the exact name to confirm',
          body: field('Deployment name', confirmInput),
          confirmLabel: 'Delete for good',
          danger: true,
          onConfirm: async () => {
            await api(`/deployments/${id}?confirm=${encodeURIComponent(confirmInput.value.trim())}`, { method: 'DELETE' });
            return true;
          },
        });
        if (!ok) return;
        toast('Deployment deleted', 'ok');
        await panel.refreshDeployments();
        panel.go('#/overview');
      },
    })
  );
}
