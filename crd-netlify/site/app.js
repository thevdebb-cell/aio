
var TOKEN = null;
var USER = null;
var pollTimer = null;

var SECTION_CAT   = { main: 'active', inactive: 'inactive', revamp: 'before_revamp', archive: 'archived' };
var SECTION_LABEL = { main: 'Active', inactive: 'Inactive', revamp: 'Before Revamp', archive: 'Archived' };
var CAT_SECTION   = { active: 'main', inactive: 'inactive', before_revamp: 'revamp', archived: 'archive' };
var SUB = { main: 'staff', inactive: 'staff', revamp: 'staff', archive: 'cases' };

async function api(fn, data) {
  try {
    var res = await fetch('/.netlify/functions/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: TOKEN }, data || {}))
    });
    try { return await res.json(); } catch (e) { return { error: 'Server error (' + res.status + ')' }; }
  } catch (e) {
    return { error: 'Network error - is the site online?' };
  }
}

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function ic(name, cls) { return '<i class="ic ' + (cls || '') + '" style="--src:url(\'assets/icons/' + name + '.svg\')"></i>'; }
function $(id) { return document.getElementById(id); }

function fmtDate(v) {
  if (!v) return '';
  var d = (typeof v === 'number') ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
function bytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function toast(msg, kind) {
  var el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function () { el.remove(); }, 300); }, 3200);
}

function openModal(opts) {
  var foot = opts.footer || '';
  $('modal-root').innerHTML =
    '<div class="modal-back" onclick="if(event.target===this)closeModal()">' +
      '<div class="modal">' +
        '<div class="modal-head">' + (opts.icon ? ic(opts.icon) : '') +
          '<h3>' + esc(opts.title || '') + '</h3>' +
          '<span class="x" onclick="closeModal()">' + ic('x') + '</span>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (foot ? '<div class="modal-foot">' + foot + '</div>' : '') +
      '</div>' +
    '</div>';
}
function closeModal() { $('modal-root').innerHTML = ''; }

function confirmDo(message, onYes) {
  openModal({
    title: 'Please confirm', icon: 'alert',
    body: '<p class="field">' + esc(message) + '</p>',
    footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
            '<button class="btn danger" id="cf-yes">Confirm</button>'
  });
  $('cf-yes').onclick = function () { closeModal(); onYes(); };
}

function saveToken(token, remember) {
  try { if (remember) localStorage.setItem('crd_token', token); else sessionStorage.setItem('crd_token', token); } catch (e) {}
}
function readToken() { try { return localStorage.getItem('crd_token') || sessionStorage.getItem('crd_token'); } catch (e) { return null; } }
function clearToken() { try { localStorage.removeItem('crd_token'); sessionStorage.removeItem('crd_token'); } catch (e) {} }

function currentTheme() { try { return localStorage.getItem('crd_theme') || 'dark'; } catch (e) { return 'dark'; } }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  var lbl = $('theme-label'), tic = $('theme-ic');
  if (lbl) lbl.textContent = t === 'light' ? 'Light' : 'Dark';
  if (tic) tic.style.setProperty('--src', "url('assets/icons/" + (t === 'light' ? 'sun' : 'moon') + ".svg')");
  var sl = $('side-logo');
  if (sl) { sl.src = (t === 'light') ? 'assets/logo-on-light.png' : 'assets/logo-on-dark.png'; }
}
function toggleTheme() {
  var t = currentTheme() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('crd_theme', t); } catch (e) {}
  applyTheme(t);
}

async function boot() {
  applyTheme(currentTheme());
  var saved = readToken();
  if (saved) {
    TOKEN = saved;
    var r = await api('auth', { action: 'me' });
    if (r.status === 'ok') { USER = r.user; enterApp(); return; }
    clearToken(); TOKEN = null;
  }
  startLogin();
}

async function startLogin() {
  var r = await api('auth', { action: 'start', remember: $('remember').checked });
  TOKEN = r.token;
  $('login-code').textContent = r.code;
  $('tip-code').textContent = r.code;
  $('login-idle').style.display = 'block';
  $('login-denied').style.display = 'none';
  pollTimer = setInterval(checkLogin, 3000);
}

async function checkLogin() {
  var r = await api('auth', { action: 'check' });
  if (r.status === 'ok') {
    clearInterval(pollTimer);
    USER = r.user;
    saveToken(TOKEN, $('remember').checked);
    enterApp();
  } else if (r.status === 'denied') {
    clearInterval(pollTimer);
    $('login-idle').style.display = 'none';
    $('login-denied').style.display = 'block';
  } else if (r.status === 'expired') {
    $('login-status').innerHTML = 'Code expired, refreshing...';
    clearInterval(pollTimer);
    startLogin();
  }
}

function enterApp() {
  $('page-login').style.display = 'none';
  $('app').style.display = 'flex';
  var role = USER.is_whitelist ? 'Whitelist' : 'Reader';
  $('user-name').textContent = USER.username || '-';
  $('user-role').textContent = role + (USER.is_whitelist ? '' : ' (view only)');
  $('user-av').textContent = (USER.username || '?').substring(0, 2).toUpperCase();
  $('hello-line').innerHTML = 'Signed in as <b>' + esc(USER.username) + '</b> - ' + esc(role);
  if (USER.is_whitelist) $('nav-admin').style.display = 'flex';
  routeFromUrl();
}

async function logout() {
  await api('auth', { action: 'logout' });
  clearToken();
  location.hash = '';
  location.reload();
}

function openNav() { $('app').classList.add('nav-open'); }
function closeNav() { $('app').classList.remove('nav-open'); }

var PAGES = ['home', 'main', 'inactive', 'revamp', 'archive', 'search', 'admin'];
var TITLES = { home: 'Dashboard', main: 'Main Work', inactive: 'Inactive', revamp: 'Before Revamp', archive: 'Archive', search: 'Search', admin: 'Admin' };

function go(name) {
  if (PAGES.indexOf(name) === -1) name = 'home';
  if (name === 'admin' && (!USER || !USER.is_whitelist)) name = 'home';
  closeNav();
  location.hash = '#/' + name;
}

function showPage(name) {
  for (var i = 0; i < PAGES.length; i++) {
    var el = $('view-' + PAGES[i]);
    if (el) el.style.display = (PAGES[i] === name) ? 'block' : 'none';
  }
  ['home', 'main', 'inactive', 'revamp', 'archive', 'admin'].forEach(function (n) {
    var a = $('nav-' + n); if (a) a.className = (n === name) ? 'on' : '';
  });
  $('tb-title').textContent = TITLES[name] || 'CRD';
  document.title = 'CRD - ' + (TITLES[name] || '');
  var sc = document.querySelector('.scroll'); if (sc) sc.scrollTo(0, 0);
  if (['main', 'inactive', 'revamp', 'archive'].indexOf(name) !== -1) { buildSubtabs(name); loadSection(name); }
  if (name === 'admin') { loadAccessList(); loadAudit(); }
  if (name === 'home') loadDashboard();
}

function routeFromUrl() {
  var name = (location.hash || '#/home').replace('#/', '');
  if (PAGES.indexOf(name) === -1) name = 'home';
  if (name === 'admin' && (!USER || !USER.is_whitelist)) name = 'home';
  showPage(name);
}
window.onhashchange = routeFromUrl;

function canWrite() { return !!(USER && USER.is_whitelist); }

async function loadDashboard() {
  var r = await api('records', { action: 'dashboard' });
  var counts = r.counts || {};
  var totals = r.totals || { staff: 0, cases: 0 };

  $('dash-stats').innerHTML =
    statCard('users', totals.staff, 'Staff on file') +
    statCard('folder', totals.cases, 'Cases on file') +
    statCard('briefcase', (counts.active || {}).cases || 0, 'Active cases') +
    statCard('archive', (counts.archived || {}).cases || 0, 'Archived cases');

  var tiles = [
    ['main', 'briefcase', 'Main Work', 'active'],
    ['inactive', 'user-clock', 'Inactive', 'inactive'],
    ['revamp', 'scroll', 'Before Revamp', 'before_revamp'],
    ['archive', 'archive', 'Archive', 'archived']
  ];
  $('dash-tiles').innerHTML = tiles.map(function (t) {
    var d = counts[t[3]] || { staff: 0, cases: 0 };
    return '<div class="tile" onclick="go(\'' + t[0] + '\')">' +
      '<div class="tile-ic">' + ic(t[1], 'lg') + '</div>' +
      '<div class="tile-label">' + t[2] + '</div>' +
      '<div class="tile-count">' + d.staff + ' staff &middot; ' + d.cases + ' cases</div>' +
    '</div>';
  }).join('');

  var rc = r.recentCases || [];
  var recentHtml = '<h3 class="sec-title">' + ic('folder') + ' Recent cases</h3>';
  if (!rc.length) recentHtml += '<div class="empty">No case recorded yet.</div>';
  else {
    recentHtml += '<div class="list">' + rc.map(function (c) {
      return caseRow(CAT_SECTION[c.category] || 'main', c);
    }).join('') + '</div>';
  }
  $('dash-recent').innerHTML = recentHtml;

  if (r.isOwner && (r.activity || []).length) {
    $('dash-activity').innerHTML = '<h3 class="sec-title">' + ic('history') + ' Recent activity</h3>' +
      (r.activity).map(function (a) {
        return '<div class="audit-row">' + ic('dot') + '<span><b>' + esc(a.action) + '</b> - ' + esc(a.detail || '') +
          ' <span class="small">by ' + esc(a.actor_name || a.actor_id || '-') + '</span></span></div>';
      }).join('');
  } else { $('dash-activity').innerHTML = ''; }
}
function statCard(icon, num, label) {
  return '<div class="stat"><div class="st-ic">' + ic(icon) + '</div>' +
    '<div class="st-num">' + esc(num) + '</div><div class="st-lab">' + esc(label) + '</div></div>';
}

function buildSubtabs(section) {
  var order = (section === 'archive') ? ['cases', 'staff'] : ['staff', 'cases'];
  var labels = {
    staff: { main: 'Active Staff', inactive: 'Inactive Staff', revamp: 'Old Staff', archive: 'Archived Staff' },
    cases: { main: 'Active Cases', inactive: 'Inactive Cases', revamp: 'Old Cases', archive: 'Archived Cases' }
  };
  var icons = { staff: 'users', cases: 'folder' };
  if (SUB[section] !== 'staff' && SUB[section] !== 'cases') SUB[section] = order[0];
  $(section + '-subtabs').innerHTML = order.map(function (s) {
    return '<a class="sub ' + (SUB[section] === s ? 'on' : '') + '" onclick="setSub(\'' + section + '\',\'' + s + '\')">' +
      ic(icons[s]) + ' ' + labels[s][section] + '</a>';
  }).join('');
}

function setSub(section, sub) {
  SUB[section] = sub;
  buildSubtabs(section);
  $(section + '-detail').innerHTML = '';
  loadSection(section);
}

function toolbarHtml(section) {
  if (!canWrite()) return '';
  var sub = SUB[section];
  var addBtn = (sub === 'staff')
    ? '<button class="btn primary" onclick="showAddStaff(\'' + section + '\')">' + ic('plus') + ' Add staff</button>'
    : '<button class="btn primary" onclick="showAddCase(\'' + section + '\')">' + ic('plus') + ' Add case</button>';
  var csv = '<button class="btn ghost" onclick="exportListCsv(\'' + section + '\')">' + ic('download') + ' Export list (CSV)</button>';
  return addBtn + csv;
}

async function loadSection(section) {
  var cat = SECTION_CAT[section];
  var sub = SUB[section];
  $(section + '-toolbar').innerHTML = toolbarHtml(section);
  if (sub === 'staff') {
    var r = await api('records', { action: 'list_staff', category: cat });
    renderStaffList(section, r.staff || []);
  } else {
    var r2 = await api('records', { action: 'list_cases', category: cat });
    renderCaseList(section, r2.cases || []);
  }
}

function staffRow(section, s) {
  return '<div class="row-item" onclick="openStaff(\'' + section + '\',' + s.id + ')">' +
    '<div class="ri-ic">' + ic('user') + '</div>' +
    '<div class="ri-main"><span class="ri-title">' + esc(s.username) + '</span>' +
    '<span class="ri-sub">' + esc(s.position || 'No position on file') + (s.discordId ? ' &middot; ' + esc(s.discordId) : '') + '</span></div>' +
    '<div class="ri-end">' + (s.classified ? '<span class="pill pill-grey">' + ic('lock') + ' classified</span>' : '') + '</div>' +
  '</div>';
}
function caseRow(section, c) {
  return '<div class="row-item" onclick="openCase(\'' + section + '\',\'' + esc(c.number) + '\')">' +
    '<div class="ri-ic">' + ic('folder') + '</div>' +
    '<div class="ri-main"><span class="ri-title mono case-num">' + esc(c.number) + '</span>' +
    '<span class="ri-sub">' + esc(c.subjectUsername || 'Unknown') + (c.subjectMatter ? ' &middot; ' + esc(String(c.subjectMatter).slice(0, 48)) : '') + '</span></div>' +
    '<div class="ri-end">' + statusPill(c) +
      (c.locked ? '<span class="pill pill-grey">' + ic('lock') + '</span>' : '') +
      (['confidential', 'secret'].indexOf(c.confidentiality) !== -1 ? '<span class="pill pill-red">' + ic('shield') + '</span>' : '') +
      ((c.proof && c.proof.length) ? '<span class="pill pill-grey">' + ic('paperclip') + ' ' + c.proof.length + '</span>' : '') +
    '</div>' +
  '</div>';
}
function statusPill(c) {
  var s = (c.status || c.category || '').toLowerCase();
  var cls = 'pill-blue';
  if (/active|open|confirm/.test(s)) cls = 'pill-green';
  else if (/expire|closed|terminat|blacklist|ban/.test(s)) cls = 'pill-red';
  else if (/await|pending|review/.test(s)) cls = 'pill-yellow';
  else if (/archiv|file/.test(s)) cls = 'pill-grey';
  return '<span class="pill ' + cls + '">' + esc(c.status || c.category) + '</span>';
}

var STATUS_OPTIONS = ['Active', 'Open', 'Under Review', 'Awaiting', 'On Hold', 'Confirmed', 'Closed', 'Expired', 'Dismissed', 'On file'];
var CONF_LEVELS = ['public', 'internal', 'restricted', 'confidential', 'secret'];
var CONF_META = {
  public: { label: 'Public', cls: 'pill-green' },
  internal: { label: 'Internal', cls: 'pill-blue' },
  restricted: { label: 'Restricted', cls: 'pill-yellow' },
  confidential: { label: 'Confidential', cls: 'pill-red' },
  secret: { label: 'Secret', cls: 'pill-red' }
};
function confPill(conf) {
  var m = CONF_META[conf || 'internal'] || CONF_META.internal;
  return '<span class="pill ' + m.cls + '">' + ic('shield') + ' ' + m.label + '</span>';
}
function priorityPill(p) {
  if (!p) return '';
  var s = String(p).toLowerCase();
  var cls = /crit/.test(s) ? 'pill-red' : /high/.test(s) ? 'pill-yellow' : /low/.test(s) ? 'pill-grey' : 'pill-blue';
  return '<span class="pill ' + cls + '">' + esc(p) + '</span>';
}
function lockPill() { return '<span class="pill pill-grey">' + ic('lock') + ' Locked</span>'; }

function selectHtml(id, options, current, placeholderNone) {
  var opts = (placeholderNone ? '<option value="">' + esc(placeholderNone) + '</option>' : '') +
    options.map(function (o) {
      var v = (typeof o === 'object') ? o.value : o;
      var l = (typeof o === 'object') ? o.label : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(current || '') ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  return '<select id="' + id + '">' + opts + '</select>';
}

function renderStaffList(section, list) {
  var el = $(section + '-list');
  if (!list.length) { el.innerHTML = '<div class="empty">No profile in this category yet.</div>'; return; }
  el.innerHTML = '<div class="list">' + list.map(function (s) { return staffRow(section, s); }).join('') + '</div>';
}
function renderCaseList(section, list) {
  var el = $(section + '-list');
  if (!list.length) { el.innerHTML = '<div class="empty">No case in this category yet.</div>'; return; }
  el.innerHTML = '<div class="list">' + list.map(function (c) { return caseRow(section, c); }).join('') + '</div>';
}

function avatarHtml(s) {
  var initials = esc((s.username || '?').substring(0, 2).toUpperCase());
  if (!s.robloxAvatar) return '<div class="pp-text">' + initials + '</div>';
  return '<img class="pp" src="' + esc(s.robloxAvatar) + '" alt="avatar" ' +
    'onerror="this.insertAdjacentHTML(\'afterend\',\'<div class=&quot;pp-text&quot;>' + initials + '</div>\');this.remove();">';
}

async function openStaff(section, id) {
  var r = await api('records', { action: 'get_staff', id: id });
  if (!r.found) return;
  var s = r.staff;
  var html = '<div class="card">' +
    '<div class="profile-top">' + avatarHtml(s) +
      '<div><p class="profile-name">' + esc(s.username) + '</p>' +
      '<p class="small">' + esc(s.position || 'No position on file') + '</p></div></div>' +
    (s.discordId ? '<p class="field"><b>Discord ID:</b> <span class="mono">' + esc(s.discordId) + '</span></p>' : '') +
    (s.roblox ? '<p class="field"><b>Roblox:</b> ' + esc(s.roblox) + (s.robloxId ? ' (id ' + esc(s.robloxId) + ')' : '') + '</p>' : '') +
    (s.joinDate ? '<p class="field"><b>Join date:</b> ' + esc(s.joinDate) + '</p>' : '') +
    (s.approxEra ? '<p class="field"><b>Era:</b> ' + esc(s.approxEra) + '</p>' : '') +
    (s.notes ? '<p class="field"><b>Notes:</b> ' + esc(s.notes) + '</p>' : '') +
    '<p class="field"><b>Category:</b> <span class="pill pill-blue">' + esc(SECTION_LABEL[CAT_SECTION[s.category]] || s.category) + '</span></p>' +
    '<p class="field"><b>Added by:</b> ' + esc(s.addedBy || '-') + '</p>';

  if (canWrite()) {
    html += '<div class="actions">' +
      '<button class="btn ghost" onclick="editStaff(\'' + section + '\',' + s.id + ')">' + ic('edit') + ' Edit</button>' +
      (s.category !== 'archived' ? '<button class="btn gold" onclick="doArchiveStaff(\'' + section + '\',' + s.id + ')">' + ic('archive') + ' Move to Archive</button>' : '') +
      '<button class="btn danger" onclick="doDeleteStaff(\'' + section + '\',' + s.id + ')">' + ic('trash') + ' Delete</button>' +
    '</div>';
  }
  html += '</div>';

  html += fileSection('Documents', 'staff_documents', s.id, s.documents || [], 'file');

  var det = $(section + '-detail');
  det.innerHTML = html;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openCase(section, number) {
  var r = await api('records', { action: 'get_case', number: number });
  if (!r.found) return;
  var c = r.case;
  var det = $(section + '-detail');

  if (c.redacted) {
    det.innerHTML = '<div class="card"><h3>' + ic('folder') + '<span class="mono case-num">' + esc(c.number) + '</span> ' + statusPill(c) + ' ' + confPill(c.confidentiality) + '</h3>' +
      '<div class="banner red">' + ic('shield') + ' Restricted - you do not have clearance to view the content of this case. Ask a whitelisted member.</div></div>';
    det.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  var locked = !!c.locked;
  var auth = (c.authorizations || []).map(function (a) { return '<span class="tag">' + ic('user-check') + ' ' + esc(a) + '</span>'; }).join('');
  var tags = (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');

  var head = '<div class="card">' +
    '<h3>' + ic('folder') + '<span class="mono case-num">' + esc(c.number) + '</span> ' + statusPill(c) + ' ' + confPill(c.confidentiality) +
      (locked ? ' ' + lockPill() : '') +
      (c.priority ? ' ' + priorityPill(c.priority) : '') +
      (c.classified ? ' <span class="pill pill-grey">classified</span>' : '') + '</h3>' +
    (locked ? '<div class="banner">' + ic('lock') + ' This case is locked' + (c.lockedBy ? ' by ' + esc(c.lockedBy) : '') + '. Content is read-only until it is unlocked.</div>' : '') +
    '<p class="field"><b>Subject:</b> ' + esc(c.subjectUsername || 'Unknown') + (c.subjectId ? ' (<span class="mono">' + esc(c.subjectId) + '</span>)' : '') + '</p>' +
    (c.department ? '<p class="field"><b>Department:</b> ' + esc(c.department) + '</p>' : '') +
    (c.lead ? '<p class="field"><b>Lead investigator:</b> ' + esc(c.lead) + '</p>' : '') +
    (c.approxDate ? '<p class="field"><b>Roughly when:</b> ' + esc(c.approxDate) + '</p>' : (c.date ? '<p class="field"><b>Opened:</b> ' + esc(fmtDate(c.date)) + '</p>' : '')) +
    (c.subjectMatter ? '<p class="field"><b>Subject matter:</b> ' + esc(c.subjectMatter) + '</p>' : '') +
    (c.testimony ? '<p class="field"><b>Testimony:</b> ' + esc(c.testimony) + '</p>' : '') +
    (c.outcome ? '<p class="field"><b>Outcome:</b> ' + esc(c.outcome) + '</p>' : '') +
    (tags ? '<p class="field"><b>Tags:</b> ' + tags + '</p>' : '') +
    (c.source === 'milweb' ? '<p class="small">' + ic('info') + ' Synced from MilWeb (Dillan).</p>' : '') +
    '<p class="field"><b>Added by:</b> ' + esc(c.addedBy || '-') + '</p>';

  if (canWrite() && !locked) {
    head += '<div class="field" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><b>Quick status:</b> ' +
      '<span style="max-width:220px;">' + selectHtml('qs-' + escId(c.number), STATUS_OPTIONS, c.status) + '</span>' +
      '<button class="btn ghost sm" onclick="setCaseStatus(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('check') + ' Apply</button></div>';
  }

  head += '<div class="actions">' +
    '<button class="btn ghost" onclick="exportCasePdf(\'' + esc(c.number) + '\')">' + ic('pdf') + ' Export PDF</button>' +
    '<button class="btn ghost" onclick="exportCaseWord(\'' + esc(c.number) + '\')">' + ic('word') + ' Export Word</button>';
  if (canWrite()) {
    head += '<button class="btn ' + (locked ? 'gold' : 'ghost') + '" onclick="toggleLock(\'' + section + '\',\'' + esc(c.number) + '\',' + (locked ? 'false' : 'true') + ')">' + ic('lock') + (locked ? ' Unlock' : ' Lock') + '</button>';
    if (!locked) {
      head += '<button class="btn ghost" onclick="editCase(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('edit') + ' Edit</button>' +
        (c.category !== 'archived' ? '<button class="btn gold" onclick="doArchiveCase(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('archive') + ' Archive</button>' : '') +
        '<button class="btn danger" onclick="doDeleteCase(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('trash') + ' Delete</button>';
    }
  }
  head += '</div></div>';

  var idInfo = '<div class="card"><h3>' + ic('info') + ' ID &amp; Information</h3>' +
    '<p class="field"><b>Subject:</b> ' + esc(c.subjectUsername || 'Unknown') + '</p>' +
    '<p class="field"><b>Subject Discord ID:</b> <span class="mono">' + esc(c.subjectId || '-') + '</span></p>' +
    (c.subjectStaffId ? '<p class="field"><b>Staff ID:</b> <span class="mono">' + esc(c.subjectStaffId) + '</span></p>' : '') +
    (c.subjectOldPosition ? '<p class="field"><b>Old position:</b> ' + esc(c.subjectOldPosition) + '</p>' : '') +
    '</div>';

  var html = head + idInfo +
    '<div class="card"><h3>' + ic('user-check') + ' User Authorization</h3>' +
      '<p class="small">Personnel authorized to handle or view this case.</p>' +
      '<div>' + (auth || '<span class="small">No one recorded.</span>') + '</div>' +
      (canWrite() && !locked ? '<div class="actions"><button class="btn ghost" onclick="editAuthorizations(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('edit') + ' Edit authorizations</button></div>' : '') +
    '</div>';

  html += fileSection('Proof &amp; Evidence', 'case_proof', c.number, c.proof || [], 'paperclip', locked);
  html += fileSection('Authorization Documents', 'case_documents', c.number, c.documents || [], 'file', locked);

  det.innerHTML = html;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  autoPreview(section);
}

function escId(s) { return String(s).replace(/[^\w-]/g, '_'); }

async function setCaseStatus(section, number) {
  var val = $('qs-' + escId(number)).value;
  var r = await api('records', { action: 'set_status', number: number, status: val });
  if (r.error) { toast(r.error, 'err'); return; }
  toast('Status updated.', 'ok'); loadSection(section); openCase(section, number);
}

function toggleLock(section, number, lock) {
  api('records', { action: lock ? 'lock_case' : 'unlock_case', number: number }).then(function (r) {
    if (r.error) { toast(r.error, 'err'); return; }
    toast(lock ? 'Case locked.' : 'Case unlocked.', 'ok');
    loadSection(section); openCase(section, number);
  });
}

function previewKind(f) {
  var t = (f.type || '').toLowerCase();
  var n = (f.name || '').toLowerCase();
  if (t.indexOf('image') === 0 || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return 'image';
  if (t.indexOf('audio') === 0 || /\.(mp3|wav|ogg|m4a|flac|aac)$/.test(n)) return 'audio';
  if (t.indexOf('video') === 0 || /\.(mp4|webm|mov|mkv|avi)$/.test(n)) return 'video';
  if (t.indexOf('pdf') !== -1 || /\.pdf$/.test(n)) return 'pdf';
  return null;
}
function fileIcon(f) {
  var k = previewKind(f);
  if (k === 'image') return 'image';
  if (k === 'audio') return 'audio';
  if (k === 'video') return 'video';
  if (k === 'pdf') return 'pdf';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(f.name || '')) return 'archive';
  return 'file';
}

function fileSection(title, slot, ownerId, files, headerIcon, locked) {
  var cards = files.map(function (f) { return fileCardHtml(slot, ownerId, f); }).join('');
  var uploader = (canWrite() && !locked)
    ? '<div class="uploader" id="up-' + slot + '" onclick="pickFile(\'' + slot + '\',\'' + esc(ownerId) + '\')">' +
        ic('upload') + ' Click to upload &mdash; or drop files here (any format: audio, video, images, PDF, zip...)' +
        '<div class="progress" id="prog-' + slot + '" style="display:none;"><span></span></div>' +
      '</div>' +
    '<input type="file" id="fin-' + slot + '" multiple style="display:none;" onchange="onFilePicked(this,\'' + slot + '\',\'' + esc(ownerId) + '\')">'
    : '';
  return '<div class="card" data-slot="' + slot + '" data-owner="' + esc(ownerId) + '">' +
    '<h3>' + ic(headerIcon || 'paperclip') + ' ' + title + ' <span class="small">(' + files.length + ')</span></h3>' +
    '<div class="filegrid" id="fg-' + slot + '">' + (cards || '<span class="small">No file yet.</span>') + '</div>' +
    uploader +
  '</div>';
}

function fileCardHtml(slot, ownerId, f) {
  var kind = previewKind(f);
  var uid = 'fc-' + Math.random().toString(36).slice(2, 9);
  var meta = [f.type || 'file', bytes(f.size), (f.uploadedBy ? 'by ' + f.uploadedBy : '')].filter(Boolean).join(' &middot; ');
  var actions = '';
  if (kind) actions += '<button class="btn ghost sm" onclick="togglePreview(this,\'' + uid + '\',\'' + kind + '\',\'' + encodeURIComponent(f.path) + '\')">' + ic('eye') + ' Preview</button>';
  actions += '<button class="btn ghost sm" onclick="downloadFile(\'' + encodeURIComponent(f.path) + '\',\'' + esc(encodeURIComponent(f.name)) + '\')">' + ic('download') + '</button>';
  if (canWrite()) actions += '<button class="btn ghost sm" onclick="removeFile(\'' + slot + '\',\'' + esc(ownerId) + '\',\'' + encodeURIComponent(f.path) + '\')">' + ic('trash') + '</button>';
  return '<div class="filecard" id="' + uid + '" data-kind="' + (kind || '') + '" data-path="' + esc(f.path) + '">' +
    '<div class="fc-head">' +
      '<div class="fc-ic">' + ic(fileIcon(f)) + '</div>' +
      '<div class="fc-main"><div class="fc-name">' + esc(f.name) + '</div><div class="fc-meta">' + meta + '</div></div>' +
      '<div class="fc-actions">' + actions + '</div>' +
    '</div>' +
    '<div class="fc-preview" id="' + uid + '-p"></div>' +
  '</div>';
}

async function signedUrl(path, name) {
  var r = await api('uploads', { action: 'sign_download', path: decodeURIComponent(path), name: name ? decodeURIComponent(name) : undefined });
  return r.url || null;
}

async function togglePreview(btn, uid, kind, path) {
  var box = $(uid + '-p');
  if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="small">Loading...</span>';
  var url = await signedUrl(path);
  if (!url) { box.innerHTML = '<span class="msg-err">Could not load file.</span>'; return; }
  if (kind === 'image') box.innerHTML = '<img src="' + esc(url) + '" alt="preview">';
  else if (kind === 'audio') box.innerHTML = '<audio controls preload="none" src="' + esc(url) + '"></audio>';
  else if (kind === 'video') box.innerHTML = '<video controls preload="none" src="' + esc(url) + '"></video>';
  else if (kind === 'pdf') { window.open(url, '_blank'); box.innerHTML = '<span class="small">Opened in a new tab.</span>'; }
}

async function autoPreview(section) {
  var cards = document.querySelectorAll('#' + section + '-detail .filecard[data-kind="image"]');
  for (var i = 0; i < cards.length && i < 6; i++) {
    var card = cards[i];
    var path = encodeURIComponent(card.getAttribute('data-path'));
    var box = card.querySelector('.fc-preview');
    if (box && !box.innerHTML.trim()) {
      var url = await signedUrl(path);
      if (url) box.innerHTML = '<img src="' + esc(url) + '" alt="preview">';
    }
  }
}

async function downloadFile(path, name) {
  var url = await signedUrl(path, name);
  if (!url) { toast('Could not fetch the file.', 'err'); return; }
  var a = document.createElement('a');
  a.href = url; a.download = decodeURIComponent(name || '');
  document.body.appendChild(a); a.click(); a.remove();
}

function pickFile(slot) { $('fin-' + slot).click(); }
function onFilePicked(input, slot, ownerId) {
  var files = Array.prototype.slice.call(input.files || []);
  input.value = '';
  uploadMany(slot, ownerId, files);
}

async function uploadMany(slot, ownerId, files) {
  if (!files.length) return;
  var prog = $('prog-' + slot);
  if (prog) { prog.style.display = 'block'; }
  for (var i = 0; i < files.length; i++) {
    try {
      await uploadOne(slot, ownerId, files[i], function (p) {
        if (prog) prog.querySelector('span').style.width = Math.round(((i + p) / files.length) * 100) + '%';
      });
    } catch (e) { toast('Upload failed: ' + (e.message || e), 'err'); }
  }
  if (prog) { prog.querySelector('span').style.width = '100%'; setTimeout(function () { prog.style.display = 'none'; prog.querySelector('span').style.width = '0'; }, 600); }
  toast('Upload complete.', 'ok');
  refreshCurrentDetail(slot, ownerId);
}

async function uploadOne(slot, ownerId, file, onProgress) {
  var s = await api('uploads', { action: 'sign_upload', slot: slot, ownerId: ownerId, name: file.name });
  if (s.error) throw new Error(s.error);
  await putWithProgress(s.url, file, onProgress);
  var a = await api('uploads', {
    action: 'attach', slot: slot, ownerId: ownerId,
    path: s.path, name: file.name, type: file.type || 'application/octet-stream', size: file.size
  });
  if (a.error) throw new Error(a.error);
  return a.file;
}

function putWithProgress(url, file, onProgress) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (xhr.upload) xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = function () { (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('storage ' + xhr.status)); };
    xhr.onerror = function () { reject(new Error('network')); };
    xhr.send(file);
  });
}

function removeFile(slot, ownerId, path) {
  confirmDo('Remove this file permanently?', async function () {
    var r = await api('uploads', { action: 'remove', slot: slot, ownerId: ownerId, path: decodeURIComponent(path) });
    if (r.error) { toast(r.error, 'err'); return; }
    toast('File removed.', 'ok');
    refreshCurrentDetail(slot, ownerId);
  });
}

function refreshCurrentDetail(slot, ownerId) {
  var section = currentSection();
  if (!section) return;
  if (slot === 'staff_documents') openStaff(section, ownerId);
  else openCase(section, ownerId);
}
function currentSection() {
  var name = (location.hash || '#/home').replace('#/', '');
  return (['main', 'inactive', 'revamp', 'archive'].indexOf(name) !== -1) ? name : null;
}

document.addEventListener('dragover', function (e) {
  var up = e.target.closest ? e.target.closest('.uploader') : null;
  if (up) { e.preventDefault(); up.classList.add('drag'); }
});
document.addEventListener('dragleave', function (e) {
  var up = e.target.closest ? e.target.closest('.uploader') : null;
  if (up) up.classList.remove('drag');
});
document.addEventListener('drop', function (e) {
  var up = e.target.closest ? e.target.closest('.uploader') : null;
  if (!up) return;
  e.preventDefault(); up.classList.remove('drag');
  var slot = up.id.replace('up-', '');
  var card = up.closest('.card');
  var ownerId = card ? card.getAttribute('data-owner') : null;
  if (ownerId) uploadMany(slot, ownerId, Array.prototype.slice.call(e.dataTransfer.files || []));
});

var lastRobloxId = null;
function showAddStaff(section) {
  var cat = SECTION_CAT[section];
  lastRobloxId = null;
  openModal({
    title: 'Add profile - ' + SECTION_LABEL[section], icon: 'user',
    body:
      '<div class="field-row"><div><label class="lbl">Username *</label><input type="text" id="ns-username"></div>' +
      '<div><label class="lbl">Discord ID</label><input type="text" id="ns-discord"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Position / role</label><input type="text" id="ns-position"></div>' +
      '<div><label class="lbl">Join date</label><input type="text" id="ns-join" placeholder="e.g. 12 Mar 2023"></div></div>' +
      (cat === 'before_revamp' ? '<label class="lbl">Era</label><input type="text" id="ns-era" placeholder="e.g. founding era, ~2022">' : '') +
      '<label class="lbl">Roblox username</label>' +
      '<div class="field-row"><input type="text" id="ns-roblox"><button class="btn ghost" type="button" onclick="fetchRoblox(\'ns\')">' + ic('search') + ' Lookup</button></div>' +
      '<div id="ns-roblox-result" class="small"></div>' +
      '<label class="lbl">Notes / info</label><textarea id="ns-notes"></textarea>' +
      '<label class="check"><input type="checkbox" id="ns-classified"> Mark classified</label>' +
      '<div id="ns-msg"></div>',
    footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
            '<button class="btn primary" onclick="submitAddStaff(\'' + section + '\')">' + ic('check') + ' Save profile</button>'
  });
}

async function fetchRoblox(prefix) {
  var uname = $(prefix + '-roblox').value;
  var el = $(prefix + '-roblox-result');
  if (!uname) { el.textContent = ''; return; }
  el.textContent = 'Looking up...';
  var r = await api('records', { action: 'roblox_lookup', username: uname });
  if (!r.found) { el.textContent = 'Roblox user not found.'; lastRobloxId = null; return; }
  lastRobloxId = r.robloxId;
  el.innerHTML = 'Found: <b>' + esc(r.username) + '</b> (id ' + esc(r.robloxId) + ') <img src="' + esc(r.avatar) + '" style="height:26px;vertical-align:middle;border-radius:50%;margin-left:6px;">';
}

async function submitAddStaff(section) {
  var fields = {
    username: $('ns-username').value,
    discordId: $('ns-discord').value,
    position: $('ns-position').value,
    joinDate: $('ns-join').value,
    roblox: $('ns-roblox').value,
    robloxId: lastRobloxId,
    notes: $('ns-notes').value,
    classified: $('ns-classified').checked,
    category: SECTION_CAT[section]
  };
  var eraEl = $('ns-era'); if (eraEl) fields.approxEra = eraEl.value;
  var r = await api('records', { action: 'create_staff', fields: fields });
  if (r.error) { $('ns-msg').innerHTML = '<div class="msg-err">' + esc(r.error) + '</div>'; return; }
  closeModal(); toast('Profile saved.', 'ok'); loadSection(section);
}

async function editStaff(section, id) {
  var r = await api('records', { action: 'get_staff', id: id });
  if (!r.found) return;
  var s = r.staff;
  openModal({
    title: 'Edit profile', icon: 'edit',
    body:
      '<div class="field-row"><div><label class="lbl">Username</label><input type="text" id="es-username" value="' + esc(s.username) + '"></div>' +
      '<div><label class="lbl">Discord ID</label><input type="text" id="es-discord" value="' + esc(s.discordId || '') + '"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Position</label><input type="text" id="es-position" value="' + esc(s.position || '') + '"></div>' +
      '<div><label class="lbl">Join date</label><input type="text" id="es-join" value="' + esc(s.joinDate || '') + '"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Roblox username</label><input type="text" id="es-roblox" value="' + esc(s.roblox || '') + '"></div>' +
      '<div><label class="lbl">Roblox ID</label><input type="text" id="es-robloxid" value="' + esc(s.robloxId || '') + '"></div></div>' +
      '<label class="lbl">Category</label><select id="es-category">' +
        ['active', 'inactive', 'before_revamp', 'archived'].map(function (c) { return '<option value="' + c + '"' + (c === s.category ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
      '</select>' +
      '<label class="lbl">Notes</label><textarea id="es-notes">' + esc(s.notes || '') + '</textarea>' +
      '<label class="check"><input type="checkbox" id="es-classified"' + (s.classified ? ' checked' : '') + '> Classified</label>' +
      '<div id="es-msg"></div>',
    footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
            '<button class="btn primary" onclick="submitEditStaff(\'' + section + '\',' + s.id + ')">' + ic('check') + ' Save</button>'
  });
}

async function submitEditStaff(section, id) {
  var fields = {
    username: $('es-username').value, discordId: $('es-discord').value, position: $('es-position').value,
    joinDate: $('es-join').value, roblox: $('es-roblox').value, robloxId: $('es-robloxid').value,
    category: $('es-category').value, notes: $('es-notes').value, classified: $('es-classified').checked
  };
  var r = await api('records', { action: 'edit_staff', id: id, fields: fields });
  if (r.error) { $('es-msg').innerHTML = '<div class="msg-err">' + esc(r.error) + '</div>'; return; }
  closeModal(); toast('Saved.', 'ok'); loadSection(section); openStaff(section, id);
}

function doArchiveStaff(section, id) {
  confirmDo('Move this profile to Archive?', async function () {
    await api('records', { action: 'archive_staff', id: id }); toast('Archived.', 'ok'); loadSection(section);
    $(section + '-detail').innerHTML = '';
  });
}
function doDeleteStaff(section, id) {
  confirmDo('Delete this profile permanently?', async function () {
    await api('records', { action: 'delete_staff', id: id }); $(section + '-detail').innerHTML = ''; toast('Deleted.', 'ok'); loadSection(section);
  });
}

var PRIORITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];
function confSelectOptions() { return CONF_LEVELS.map(function (l) { return { value: l, label: CONF_META[l].label }; }); }

function showAddCase(section) {
  var cat = SECTION_CAT[section];
  var isOld = (cat === 'before_revamp');
  openModal({
    title: 'Add case - ' + SECTION_LABEL[section], icon: 'folder',
    body:
      '<div class="field-row"><div><label class="lbl">Subject username *</label><input type="text" id="nc-subname"></div>' +
      '<div><label class="lbl">Subject Discord ID</label><input type="text" id="nc-subid"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Subject staff ID (if staff)</label><input type="text" id="nc-staffid"></div>' +
      '<div><label class="lbl">Old position</label><input type="text" id="nc-oldpos"></div></div>' +
      (isOld ? '<label class="lbl">Roughly when</label><input type="text" id="nc-approx" placeholder="e.g. early 2022">' : '') +
      '<div class="field-row"><div><label class="lbl">Status</label>' + selectHtml('nc-status', STATUS_OPTIONS, cat === 'active' ? 'Active' : 'On file') + '</div>' +
      '<div><label class="lbl">Confidentiality</label>' + selectHtml('nc-conf', confSelectOptions(), 'internal') + '</div></div>' +
      '<div class="field-row"><div><label class="lbl">Department</label><input type="text" id="nc-dept" placeholder="HI / IA / ..."></div>' +
      '<div><label class="lbl">Priority</label>' + selectHtml('nc-priority', PRIORITY_OPTS, '', 'None') + '</div></div>' +
      '<label class="lbl">Lead investigator</label><input type="text" id="nc-lead">' +
      '<label class="lbl">What it was about</label><textarea id="nc-matter"></textarea>' +
      '<label class="lbl">Witness / testimony</label><textarea id="nc-testimony"></textarea>' +
      '<label class="lbl">Outcome / decision</label><textarea id="nc-outcome"></textarea>' +
      '<label class="lbl">Authorized personnel (one per line)</label><textarea id="nc-auth" placeholder="Names, roles or IDs allowed on this case"></textarea>' +
      '<label class="lbl">Tags (comma separated)</label><input type="text" id="nc-tags" placeholder="raid, alt, priority...">' +
      '<label class="check"><input type="checkbox" id="nc-classified"> Mark classified</label>' +
      '<p class="small">' + ic('info') + ' You can attach proof &amp; documents (audio, video, PDF...) after the case is created.</p>' +
      '<div id="nc-msg"></div>',
    footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
            '<button class="btn primary" onclick="submitAddCase(\'' + section + '\')">' + ic('check') + ' Create case</button>'
  });
}

function splitTags(v) { return String(v || '').split(/[,\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }

async function submitAddCase(section) {
  var fields = {
    subjectId: $('nc-subid').value, subjectUsername: $('nc-subname').value,
    subjectStaffId: $('nc-staffid').value, subjectOldPosition: $('nc-oldpos').value,
    status: $('nc-status').value, confidentiality: $('nc-conf').value,
    department: $('nc-dept').value, priority: $('nc-priority').value, lead: $('nc-lead').value,
    subjectMatter: $('nc-matter').value, testimony: $('nc-testimony').value, outcome: $('nc-outcome').value,
    authorizations: $('nc-auth').value, tags: splitTags($('nc-tags').value),
    classified: $('nc-classified').checked, category: SECTION_CAT[section]
  };
  var approxEl = $('nc-approx'); if (approxEl) fields.approxDate = approxEl.value;
  var r = await api('records', { action: 'create_case', fields: fields });
  if (r.error) { $('nc-msg').innerHTML = '<div class="msg-err">' + esc(r.error) + '</div>'; return; }
  closeModal(); toast('Case created: ' + r.number, 'ok'); loadSection(section);
  setTimeout(function () { openCase(section, r.number); }, 120);
}

async function editCase(section, number) {
  var r = await api('records', { action: 'get_case', number: number });
  if (!r.found) return;
  var c = r.case;
  openModal({
    title: 'Edit ' + c.number, icon: 'edit',
    body:
      '<div class="field-row"><div><label class="lbl">Subject username</label><input type="text" id="ec-subname" value="' + esc(c.subjectUsername || '') + '"></div>' +
      '<div><label class="lbl">Subject Discord ID</label><input type="text" id="ec-subid" value="' + esc(c.subjectId || '') + '"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Subject staff ID</label><input type="text" id="ec-staffid" value="' + esc(c.subjectStaffId || '') + '"></div>' +
      '<div><label class="lbl">Old position</label><input type="text" id="ec-oldpos" value="' + esc(c.subjectOldPosition || '') + '"></div></div>' +
      '<div class="field-row"><div><label class="lbl">Status</label>' + selectHtml('ec-status', STATUS_OPTIONS.concat(c.status && STATUS_OPTIONS.indexOf(c.status) === -1 ? [c.status] : []), c.status) + '</div>' +
      '<div><label class="lbl">Confidentiality</label>' + selectHtml('ec-conf', confSelectOptions(), c.confidentiality || 'internal') + '</div></div>' +
      '<div class="field-row"><div><label class="lbl">Category</label>' + selectHtml('ec-category', ['active', 'inactive', 'before_revamp', 'archived'], c.category) + '</div>' +
      '<div><label class="lbl">Priority</label>' + selectHtml('ec-priority', PRIORITY_OPTS, c.priority || '', 'None') + '</div></div>' +
      '<div class="field-row"><div><label class="lbl">Department</label><input type="text" id="ec-dept" value="' + esc(c.department || '') + '"></div>' +
      '<div><label class="lbl">Roughly when</label><input type="text" id="ec-approx" value="' + esc(c.approxDate || '') + '"></div></div>' +
      '<label class="lbl">Lead investigator</label><input type="text" id="ec-lead" value="' + esc(c.lead || '') + '">' +
      '<label class="lbl">Subject matter</label><textarea id="ec-matter">' + esc(c.subjectMatter || '') + '</textarea>' +
      '<label class="lbl">Testimony</label><textarea id="ec-testimony">' + esc(c.testimony || '') + '</textarea>' +
      '<label class="lbl">Outcome / decision</label><textarea id="ec-outcome">' + esc(c.outcome || '') + '</textarea>' +
      '<label class="lbl">Tags (comma separated)</label><input type="text" id="ec-tags" value="' + esc((c.tags || []).join(', ')) + '">' +
      '<label class="check"><input type="checkbox" id="ec-classified"' + (c.classified ? ' checked' : '') + '> Classified</label>' +
      '<div id="ec-msg"></div>',
    footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
            '<button class="btn primary" onclick="submitEditCase(\'' + section + '\',\'' + esc(c.number) + '\')">' + ic('check') + ' Save</button>'
  });
}

async function submitEditCase(section, number) {
  var fields = {
    subjectId: $('ec-subid').value, subjectUsername: $('ec-subname').value,
    subjectStaffId: $('ec-staffid').value, subjectOldPosition: $('ec-oldpos').value, status: $('ec-status').value,
    confidentiality: $('ec-conf').value, approxDate: $('ec-approx').value, category: $('ec-category').value,
    department: $('ec-dept').value, priority: $('ec-priority').value, lead: $('ec-lead').value,
    subjectMatter: $('ec-matter').value, testimony: $('ec-testimony').value, outcome: $('ec-outcome').value,
    tags: splitTags($('ec-tags').value), classified: $('ec-classified').checked
  };
  var r = await api('records', { action: 'edit_case', number: number, fields: fields });
  if (r.error) { $('ec-msg').innerHTML = '<div class="msg-err">' + esc(r.error) + '</div>'; return; }
  closeModal(); toast('Saved.', 'ok'); loadSection(section); openCase(section, number);
}

function editAuthorizations(section, number) {
  api('records', { action: 'get_case', number: number }).then(function (r) {
    if (!r.found) return;
    var c = r.case;
    openModal({
      title: 'Authorized personnel', icon: 'user-check',
      body: '<label class="lbl">One per line</label><textarea id="au-list" style="min-height:120px;">' + esc((c.authorizations || []).join('\n')) + '</textarea><div id="au-msg"></div>',
      footer: '<button class="btn ghost" onclick="closeModal()">Cancel</button>' +
              '<button class="btn primary" onclick="submitAuth(\'' + section + '\',\'' + esc(number) + '\')">' + ic('check') + ' Save</button>'
    });
  });
}
async function submitAuth(section, number) {
  var r = await api('records', { action: 'edit_case', number: number, fields: { authorizations: $('au-list').value } });
  if (r.error) { $('au-msg').innerHTML = '<div class="msg-err">' + esc(r.error) + '</div>'; return; }
  closeModal(); toast('Saved.', 'ok'); openCase(section, number);
}

function doArchiveCase(section, number) {
  confirmDo('Move ' + number + ' to Archive?', async function () {
    await api('records', { action: 'archive_case', number: number }); toast('Archived.', 'ok'); $(section + '-detail').innerHTML = ''; loadSection(section);
  });
}
function doDeleteCase(section, number) {
  confirmDo('Delete case ' + number + ' permanently?', async function () {
    await api('records', { action: 'delete_case', number: number }); $(section + '-detail').innerHTML = ''; toast('Deleted.', 'ok'); loadSection(section);
  });
}

async function fetchImage(url) {
  try {
    var res = await fetch(url);
    if (!res.ok) return null;
    var blob = await res.blob();
    var dataUrl = await new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.onerror = function () { r(null); }; fr.readAsDataURL(blob); });
    if (!dataUrl) return null;
    var dim = await new Promise(function (r) { var im = new Image(); im.onload = function () { r({ w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function () { r({ w: 0, h: 0 }); }; im.src = dataUrl; });
    return { dataUrl: dataUrl, w: dim.w, h: dim.h };
  } catch (e) { return null; }
}

async function exportCasePdf(number) {
  var r = await api('records', { action: 'get_case', number: number });
  if (!r.found) return;
  var c = r.case;
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'a4' });
  var W = doc.internal.pageSize.getWidth();
  var M = 42, y = 40;

  var banner = await fetchImage('assets/banner.png');
  if (banner && banner.w) {
    var bw = W - M * 2, bh = Math.min(120, bw * (banner.h / banner.w));
    doc.addImage(banner.dataUrl, 'PNG', M, y, bw, bh, '', 'FAST');
    y += bh + 20;
  } else {
    doc.setFillColor(18, 29, 52); doc.rect(0, 0, W, 84, 'F');
    doc.setTextColor(230, 238, 250); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('NYUC', M, 40); doc.setFontSize(11); doc.setTextColor(160, 185, 215);
    doc.text('CENTRAL RECORD DIRECTORY', M, 60);
    y = 108;
  }

  doc.setTextColor(18, 29, 52); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Case File ' + c.number, M, y); y += 8;
  doc.setDrawColor(31, 95, 191); doc.setLineWidth(1.4); doc.line(M, y, W - M, y); y += 20;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  function line(label, value) {
    if (value == null || value === '') return;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(31, 95, 191);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(35, 40, 50);
    var txt = doc.splitTextToSize(String(value), W - M * 2);
    y += 15; doc.text(txt, M, y); y += txt.length * 14 + 8;
    if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 50; }
  }
  line('Category', SECTION_LABEL[CAT_SECTION[c.category]] || c.category);
  line('Status', c.status || '-');
  line('Subject', (c.subjectUsername || 'Unknown') + (c.subjectId ? '  (' + c.subjectId + ')' : ''));
  line('Roughly when', c.approxDate);
  line('Opened', c.date ? fmtDate(c.date) : '');
  line('Subject matter', c.subjectMatter);
  line('Testimony', c.testimony);
  if (c.authorizations && c.authorizations.length) line('Authorized personnel', c.authorizations.join(', '));
  if (c.proof && c.proof.length) line('Proof on file', c.proof.map(function (f) { return f.name; }).join(', '));
  if (c.documents && c.documents.length) line('Documents on file', c.documents.map(function (f) { return f.name; }).join(', '));
  line('Added by', c.addedBy);

  var H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(210, 218, 230); doc.setLineWidth(0.8); doc.line(M, H - 46, W - M, H - 46);
  doc.setFontSize(9); doc.setTextColor(120, 130, 145);
  doc.text('NYUC - Central Record Directory - Confidential', M, H - 30);
  doc.text('Generated ' + fmtDate(Math.floor(Date.now() / 1000)), W - M, H - 30, { align: 'right' });
  doc.save(c.number + '.pdf');
}

async function exportCaseWord(number) {
  var r = await api('records', { action: 'get_case', number: number });
  if (!r.found) return;
  var c = r.case;
  var banner = await fetchImage('assets/banner.png');
  var header = banner
    ? '<img src="' + banner.dataUrl + '" style="width:100%;max-height:150px;object-fit:cover;" />'
    : '<div style="background:#121d34;color:#eef2f8;padding:18px 22px;">' +
      '<div style="font-size:20px;font-weight:bold;letter-spacing:1px;">NYUC</div>' +
      '<div style="font-size:11px;letter-spacing:3px;color:#a9cbe5;">CENTRAL RECORD DIRECTORY</div></div>';

  function row(label, value) {
    if (value == null || value === '') return '';
    return '<tr><td style="padding:7px 10px;border:1px solid #d5deea;background:#f4f7fb;font-weight:bold;color:#1f5fbf;width:190px;vertical-align:top;">' +
      esc(label) + '</td><td style="padding:7px 10px;border:1px solid #d5deea;color:#222;">' + esc(value).replace(/\n/g, '<br>') + '</td></tr>';
  }
  var html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Arial,sans-serif;color:#222;">' + header +
    '<h1 style="color:#121d34;font-size:20px;margin:18px 0 4px;">Case File ' + esc(c.number) + '</h1>' +
    '<div style="height:3px;background:#1f5fbf;width:100%;margin:0 0 14px;"></div>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
    row('Category', SECTION_LABEL[CAT_SECTION[c.category]] || c.category) +
    row('Status', c.status || '-') +
    row('Subject', (c.subjectUsername || 'Unknown') + (c.subjectId ? '  (' + c.subjectId + ')' : '')) +
    row('Roughly when', c.approxDate) +
    row('Opened', c.date ? fmtDate(c.date) : '') +
    row('Subject matter', c.subjectMatter) +
    row('Testimony', c.testimony) +
    row('Authorized personnel', (c.authorizations || []).join('\n')) +
    row('Proof on file', (c.proof || []).map(function (f) { return f.name; }).join('\n')) +
    row('Documents on file', (c.documents || []).map(function (f) { return f.name; }).join('\n')) +
    row('Added by', c.addedBy) +
    '</table>' +
    '<p style="margin-top:26px;font-size:10px;color:#8a92a0;border-top:1px solid #d5deea;padding-top:10px;">' +
    'NYUC - Central Record Directory - Confidential &middot; Generated ' + esc(fmtDate(Math.floor(Date.now() / 1000))) + '</p>' +
    '</body></html>';

  var blob = new Blob(['﻿' + html], { type: 'application/msword' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = c.number + '.doc';
  document.body.appendChild(a); a.click(); a.remove();
}

async function exportListCsv(section) {
  var cat = SECTION_CAT[section];
  var sub = SUB[section];
  var rows, name;
  if (sub === 'staff') {
    var r = await api('records', { action: 'list_staff', category: cat });
    rows = [['Username', 'Position', 'Discord ID', 'Roblox', 'Join date', 'Era', 'Added by']];
    (r.staff || []).forEach(function (s) { rows.push([s.username, s.position || '', s.discordId || '', s.roblox || '', s.joinDate || '', s.approxEra || '', s.addedBy || '']); });
    name = 'crd-' + section + '-staff.csv';
  } else {
    var r2 = await api('records', { action: 'list_cases', category: cat });
    rows = [['Number', 'Subject', 'Status', 'Roughly when', 'Subject matter', 'Proof', 'Added by']];
    (r2.cases || []).forEach(function (c) { rows.push([c.number, c.subjectUsername || '', c.status || '', c.approxDate || '', (c.subjectMatter || '').replace(/\n/g, ' '), (c.proof || []).length, c.addedBy || '']); });
    name = 'crd-' + section + '-cases.csv';
  }
  var csv = rows.map(function (row) { return row.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

async function quickSearch() {
  var v = $('quick-search').value;
  if (!v) return;
  go('search');
  var r = await api('records', { action: 'search', query: v });
  $('search-sub').textContent = 'Results for "' + v + '"';
  var el = $('search-results');
  var html = '';
  var staff = r.staff || [], cases = r.cases || [];
  if (staff.length) {
    html += '<h3 class="sec-title">' + ic('users') + ' Staff</h3><div class="list">' +
      staff.map(function (s) {
        return '<div class="row-item" onclick="jumpToStaff(' + s.id + ',\'' + s.category + '\')">' +
          '<div class="ri-ic">' + ic('user') + '</div>' +
          '<div class="ri-main"><span class="ri-title">' + esc(s.username) + '</span><span class="ri-sub">' + esc(s.position || s.discordId || '') + '</span></div>' +
          '<div class="ri-end"><span class="pill pill-blue">' + esc(SECTION_LABEL[CAT_SECTION[s.category]] || s.category) + '</span></div></div>';
      }).join('') + '</div>';
  }
  if (cases.length) {
    html += '<h3 class="sec-title">' + ic('folder') + ' Cases</h3><div class="list">' +
      cases.map(function (c) {
        return '<div class="row-item" onclick="jumpToCase(\'' + esc(c.number) + '\',\'' + c.category + '\')">' +
          '<div class="ri-ic">' + ic('folder') + '</div>' +
          '<div class="ri-main"><span class="ri-title mono case-num">' + esc(c.number) + '</span><span class="ri-sub">' + esc(c.subjectUsername) + '</span></div>' +
          '<div class="ri-end">' + statusPill(c) + '</div></div>';
      }).join('') + '</div>';
  }
  if (!staff.length && !cases.length) html = '<div class="empty">No result.</div>';
  el.innerHTML = html;
}

function jumpToStaff(id, category) {
  var section = CAT_SECTION[category] || 'main';
  go(section);
  setTimeout(function () { setSub(section, 'staff'); openStaff(section, id); }, 80);
}
function jumpToCase(number, category) {
  var section = CAT_SECTION[category] || 'main';
  go(section);
  setTimeout(function () { setSub(section, 'cases'); openCase(section, number); }, 80);
}

async function runSync() {
  var btn = $('sync-btn'); var res = $('sync-result');
  if (btn) { btn.disabled = true; btn.innerHTML = ic('history') + ' Syncing...'; }
  res.innerHTML = '<p class="small">Working... this can take a moment.</p>';
  var r = await api('admin', { action: 'sync_milweb' });
  if (btn) { btn.disabled = false; btn.innerHTML = ic('download') + ' Sync now'; }
  if (!r.ok) { res.innerHTML = '<div class="msg-err">' + esc(r.error || 'Sync failed.') + '</div>'; return; }
  var d = r.result || {};
  var notes = (d.notes || []).length ? '<p class="small">' + (d.notes).map(esc).join('<br>') + '</p>' : '';
  res.innerHTML = '<div class="msg-ok">Sync done.</div>' +
    '<p class="field">Staff: <b>' + (d.staffAdded || 0) + '</b> added, <b>' + (d.staffUpdated || 0) + '</b> updated &middot; Cases: <b>' + (d.casesAdded || 0) + '</b> imported.</p>' + notes;
  toast('MilWeb sync complete.', 'ok');
  loadDashboard();
}

async function loadAccessList() {
  var r = await api('admin', { action: 'access_list' });
  var el = $('access-list');
  var rows = r.access || [];
  if (!rows.length) { el.innerHTML = '<p class="small">No one individually granted yet (whitelisted members always have access).</p>'; return; }
  el.innerHTML = '<div class="list">' + rows.map(function (a) {
    return '<div class="row-item"><div class="ri-ic">' + ic('user-check') + '</div>' +
      '<div class="ri-main"><span class="ri-title mono">' + esc(a.username || a.discord_id) + '</span>' +
      '<span class="ri-sub">' + esc(a.discord_id) + ' &middot; granted by ' + esc(a.granted_by || '-') + '</span></div>' +
      '<div class="ri-end small">' + esc(fmtDate(a.granted_at)) + '</div></div>';
  }).join('') + '</div>';
}

async function loadAudit() {
  var r = await api('admin', { action: 'audit' });
  var el = $('audit-list');
  var rows = r.audit || [];
  if (!rows.length) { el.innerHTML = '<p class="small">Nothing yet.</p>'; return; }
  el.innerHTML = rows.map(function (a) {
    return '<div class="audit-row">' + ic('dot') + '<span><b>' + esc(a.action) + '</b> - ' + esc(a.detail || '') +
      ' <span class="small">by ' + esc(a.actor_name || a.actor_id || '-') + ' &middot; ' + esc(fmtDate(a.created_at)) + '</span></span></div>';
  }).join('');
}

boot();
