'use strict';

for (const img of document.querySelectorAll('.brandimg')) {
  img.addEventListener('error', () => { img.style.display = 'none'; });
}

const tilesEl = document.getElementById('tiles');
const msgEl = document.getElementById('msg');

function tileNode(tile, vpnMessage) {
  const node = document.createElement(tile.status === 'open' ? 'a' : 'button');
  node.className = 'tile';
  node.dataset.status = tile.status;
  node.dataset.id = tile.id;
  if (tile.status === 'open') {
    node.href = '/access';
  } else {
    node.type = 'button';
    node.addEventListener('click', () => {
      msgEl.textContent = vpnMessage;
    });
  }

  const img = document.createElement('img');
  img.className = 'icon';
  img.alt = '';
  img.src = `/img/${tile.icon}`;
  img.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.className = 'fallback';
    fallback.textContent = tile.name.slice(0, 1).toUpperCase();
    img.replaceWith(fallback);
  });

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = tile.name;

  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = tile.status === 'open' ? 'Available' : 'VPN only';

  node.append(img, name, note);
  return node;
}

async function load() {
  try {
    const res = await fetch('/api/portal', { credentials: 'same-origin' });
    const data = await res.json();
    document.getElementById('notice').textContent = data.notice.replace(/ {2,}/g, ' \u00b7 ');
    tilesEl.replaceChildren(...data.tiles.map((tile) => tileNode(tile, data.vpnMessage)));
  } catch {
    msgEl.textContent = 'Portal did not load  refresh the page';
  }
}

load();
