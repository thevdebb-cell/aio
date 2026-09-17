var ALL = [];

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(v) {
  if (!v) return '';
  var d = (typeof v === 'number') ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
}
function bytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function previewKind(f) {
  var t = (f.type || '').toLowerCase(), n = (f.name || '').toLowerCase();
  if (t.indexOf('image') === 0 || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'image';
  if (t.indexOf('audio') === 0 || /\.(mp3|wav|ogg|m4a|flac|aac)$/.test(n)) return 'audio';
  if (t.indexOf('video') === 0 || /\.(mp4|webm|mov|mkv)$/.test(n)) return 'video';
  return null;
}

function go(number) { location.hash = number ? '#/case/' + encodeURIComponent(number) : '#/'; }

async function route() {
  var h = location.hash || '#/';
  var m = h.match(/^#\/case\/(.+)$/);
  if (m) { showDetail(decodeURIComponent(m[1])); }
  else { document.getElementById('view-detail').style.display = 'none'; document.getElementById('view-list').style.display = 'block'; }
}
window.onhashchange = route;

async function loadList() {
  var r = await fetch('/api/cases').then(function (x) { return x.json(); }).catch(function () { return { cases: [] }; });
  ALL = r.cases || [];
  renderList(ALL);
}
function renderList(list) {
  var el = document.getElementById('list');
  if (!list.length) { el.innerHTML = '<div class="empty">No public case at the moment.</div>'; return; }
  el.innerHTML = list.map(function (c) {
    return '<div class="row" onclick="go(\'' + esc(c.number) + '\')">' +
      '<span class="num">' + esc(c.number) + '</span>' +
      '<span class="subj">' + esc(c.subject || 'Unknown') + (c.matter ? ' - ' + esc(String(c.matter).slice(0, 60)) : '') + '</span>' +
      (c.files ? '<span class="files">' + c.files + ' file(s)</span>' : '') +
      '<span class="status">' + esc(c.status || 'On file') + '</span></div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function () {
  var s = document.getElementById('search');
  if (s) s.addEventListener('input', function () {
    var q = s.value.trim().toLowerCase();
    if (!q) return renderList(ALL);
    renderList(ALL.filter(function (c) {
      return (c.number || '').toLowerCase().indexOf(q) !== -1 ||
        (c.subject || '').toLowerCase().indexOf(q) !== -1 ||
        (c.matter || '').toLowerCase().indexOf(q) !== -1;
    }));
  });
});

async function showDetail(number) {
  document.getElementById('view-list').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';
  var el = document.getElementById('detail');
  el.innerHTML = '<p>Loading...</p>';
  var r = await fetch('/api/case/' + encodeURIComponent(number)).then(function (x) { return x.json(); }).catch(function () { return {}; });
  if (!r.case) { el.innerHTML = '<div class="empty">This case is not available.</div>'; return; }
  var c = r.case;
  var auth = (c.authorizations || []).map(function (a) { return '<span class="tag">' + esc(a) + '</span>'; }).join('');
  var files = (c.files || []).map(function (f) {
    var kind = previewKind(f);
    var prev = '';
    if (kind === 'image') prev = '<img src="' + esc(f.url) + '" alt="">';
    else if (kind === 'audio') prev = '<audio controls preload="none" src="' + esc(f.url) + '"></audio>';
    else if (kind === 'video') prev = '<video controls preload="none" src="' + esc(f.url) + '"></video>';
    return '<div class="file"><div class="fname">' + esc(f.name) + '</div>' +
      '<div class="fmeta">' + esc(f.kind) + ' &middot; ' + esc(f.type || '') + ' &middot; ' + bytes(f.size) + '</div>' +
      '<a class="dl" href="' + esc(f.url) + '">Download</a>' + prev + '</div>';
  }).join('');

  el.innerHTML = '<div class="card">' +
    '<h2><span class="num">' + esc(c.number) + '</span> - ' + esc(c.subject || 'Unknown') + '</h2>' +
    '<p class="field"><b>Status:</b> ' + esc(c.status || 'On file') + '</p>' +
    (c.department ? '<p class="field"><b>Department:</b> ' + esc(c.department) + '</p>' : '') +
    (c.date ? '<p class="field"><b>Date:</b> ' + esc(fmtDate(c.date)) + '</p>' : '') +
    (c.matter ? '<p class="field"><b>Subject matter:</b> ' + esc(c.matter) + '</p>' : '') +
    (c.testimony ? '<p class="field"><b>Testimony:</b> ' + esc(c.testimony) + '</p>' : '') +
    (c.outcome ? '<p class="field"><b>Outcome:</b> ' + esc(c.outcome) + '</p>' : '') +
    (auth ? '<p class="field"><b>Authorized:</b> ' + auth + '</p>' : '') +
    '</div>' +
    (files ? '<div class="card"><h2>Documents &amp; evidence</h2>' + files + '</div>' : '<div class="card"><p class="field">No public document on this case.</p></div>');
}

loadList();
route();
