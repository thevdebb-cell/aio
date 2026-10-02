'use strict';

for (const img of document.querySelectorAll('.brandimg')) {
  img.addEventListener('error', () => { img.style.display = 'none'; });
}

const form = document.getElementById('form');
const codeInput = document.getElementById('code');
const msgEl = document.getElementById('msg');
const submitBtn = document.getElementById('submit');
const contactsEl = document.getElementById('contacts');

async function loadContacts() {
  try {
    const res = await fetch('/api/portal', { credentials: 'same-origin' });
    const data = await res.json();
    contactsEl.replaceChildren(
      ...data.contacts.map((contact) => {
        const tr = document.createElement('tr');
        const name = document.createElement('td');
        name.textContent = contact.name;
        const discord = document.createElement('td');
        discord.textContent = contact.discord || 'none';
        const email = document.createElement('td');
        email.textContent = contact.email || 'none';
        if (!contact.email || contact.email === 'none') email.className = 'dim';
        tr.append(name, discord, email);
        return tr;
      })
    );
  } catch {
    msgEl.textContent = 'Contacts did not load';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  msgEl.textContent = '';
  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: codeInput.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.signedIn) {
      window.location.href = '/panel';
      return;
    }
    msgEl.textContent = data.error || 'Access refused';
    codeInput.select();
  } catch {
    msgEl.textContent = 'Panel did not answer  try again';
  } finally {
    submitBtn.disabled = false;
  }
});

loadContacts();
