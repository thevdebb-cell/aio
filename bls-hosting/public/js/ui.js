// Copy on this panel separates ideas with spaces instead of punctuation. HTML
// collapses a run of spaces so the separator is drawn as a middot instead
export function tidy(text) {
  return String(text).replace(/ {2,}/g, ' \u00b7 ');
}

// A style attribute is inline CSS so the panel content security policy refuses it
// Writing through the CSSOM is not inline CSS and keeps the policy strict
function applyStyle(node, style) {
  if (!style) return;
  for (const declaration of String(style).split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    const name = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (name && value) node.style.setProperty(name, value);
  }
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') applyStyle(node, value);
    else if (key === 'text') node.textContent = tidy(value);
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'readOnly') {
      node[key] = Boolean(value);
    } else node.setAttribute(key, value);
  }
  for (const child of children.flat(3)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(tidy(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

const toastHost = el('div', { class: 'toasts' });
document.body.append(toastHost);

export function toast(message, kind = '', ms = 4200) {
  const node = el('div', { class: `toast ${kind}`.trim(), text: message });
  toastHost.append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

export function openModal({ title, lead, body, confirmLabel = 'Save', cancelLabel = 'Cancel', danger = false, wide = false, onConfirm }) {
  return new Promise((resolve) => {
    let busy = false;
    const confirmBtn = el('button', { class: danger ? 'danger' : 'primary', text: confirmLabel });
    const cancelBtn = el('button', { text: cancelLabel });
    const modal = el(
      'div',
      { class: 'modal', style: wide ? 'width:min(760px,100%)' : null, role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: title }),
      lead ? el('p', { class: 'lead', text: lead }) : null,
      body,
      el('div', { class: 'actions' }, cancelBtn, confirmBtn)
    );
    const backdrop = el('div', { class: 'backdrop' }, modal);

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) close(null);
    };

    cancelBtn.addEventListener('click', () => close(null));
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop && !busy) close(null);
    });
    document.addEventListener('keydown', onKey);

    confirmBtn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      const label = confirmBtn.textContent;
      confirmBtn.replaceChildren(el('span', { class: 'spin' }), document.createTextNode(' working'));
      try {
        const result = onConfirm ? await onConfirm() : true;
        if (result === false) {
          busy = false;
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          confirmBtn.textContent = label;
          return;
        }
        close(result);
      } catch (err) {
        busy = false;
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        confirmBtn.textContent = label;
        toast(err.message || 'That did not work', 'bad');
      }
    });

    document.body.append(backdrop);
    const first = modal.querySelector('input, select, textarea, button.primary, button.danger');
    if (first) first.focus();
  });
}

export function confirmBox({ title, lead, confirmLabel = 'Confirm', danger = true, extra = null }) {
  return openModal({
    title,
    lead,
    body: extra || el('div'),
    confirmLabel,
    danger,
    onConfirm: () => true,
  });
}

export function field(label, control, hint) {
  return el('div', { class: 'field' }, el('label', { text: label }), control, hint ? el('div', { class: 'hint', text: hint }) : null);
}

export function fmtBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function fmtMb(mb) {
  const value = Number(mb) || 0;
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
}

export function fmtDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtTime(iso) {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fmtClock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

export function meterClass(ratio) {
  if (ratio >= 0.9) return 'meter bad';
  if (ratio >= 0.7) return 'meter warn';
  return 'meter ok';
}

export function statCard({ k, v, s, ratio }) {
  return el(
    'div',
    { class: 'card stat' },
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v', text: v }),
    s ? el('div', { class: 's', text: s }) : null,
    ratio === undefined || ratio === null
      ? null
      : el('div', { class: meterClass(ratio) }, el('i', { style: `width:${Math.min(100, Math.max(2, ratio * 100))}%` }))
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied', 'ok', 1800);
  } catch {
    toast('Copy failed  select it by hand', 'warn');
  }
}
