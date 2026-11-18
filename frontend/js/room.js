// Страница P2P-комнаты: вход, список участников и чат по RTCDataChannel.

import { PeerRoom } from './p2p/peer-room.js';
import { signalingUrl } from './config.js';

const PLANETS = { ielts: 'IELTS', sat: 'SAT', csca: 'CSCA', programming: 'Programming' };
const CODE_RE = /^[a-z0-9]{3,16}$/;

const joinForm = document.querySelector('[data-join]');
const joinButton = document.querySelector('[data-join-button]');
const joinMsg = document.querySelector('[data-join-msg]');
const nameInput = document.getElementById('room-name');
const planetSelect = document.getElementById('room-planet');
const codeInput = document.getElementById('room-code');
const live = document.querySelector('[data-live]');
const roomTitle = document.querySelector('[data-room-title]');
const statusEl = document.querySelector('[data-status]');
const peersEl = document.querySelector('[data-peers]');
const logEl = document.querySelector('[data-log]');
const chatForm = document.querySelector('[data-chat]');
const chatInput = document.getElementById('chat-input');
const leaveButton = document.querySelector('[data-leave]');

let room = null;
let selfName = '';
const peers = new Map(); // id → { name, direct }

// Запоминаем имя между визитами — меньше рутинного ввода
try {
  nameInput.value = localStorage.getItem('skillorbit:room-name') || '';
} catch {
  /* localStorage недоступен */
}

function showJoinError(text, input) {
  joinMsg.textContent = text;
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

[nameInput, codeInput].forEach((input) =>
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    joinMsg.textContent = '';
  }),
);

function renderPeers() {
  peersEl.replaceChildren();
  const self = document.createElement('li');
  self.className = 'peers__item';
  self.innerHTML = '<span></span><span class="peers__state">You</span>';
  self.firstChild.textContent = selfName;
  peersEl.append(self);

  for (const [, peer] of peers) {
    const li = document.createElement('li');
    li.className = 'peers__item';
    const name = document.createElement('span');
    name.textContent = peer.name;
    const state = document.createElement('span');
    state.className = `peers__state${peer.direct ? ' is-direct' : ''}`;
    state.textContent = peer.direct ? 'Direct link open' : 'Connecting';
    li.append(name, state);
    peersEl.append(li);
  }

  const direct = [...peers.values()].filter((p) => p.direct).length;
  statusEl.textContent =
    direct === 0
      ? 'Waiting for a peer. Open this page in another tab or share the room code.'
      : `Connected directly to ${direct} ${direct === 1 ? 'peer' : 'peers'}.`;
}

function log(text, { name = '', kind = 'system' } = {}) {
  const li = document.createElement('li');
  li.className = `chat__item is-${kind}`;
  if (name) {
    const who = document.createElement('span');
    who.className = 'chat__name';
    who.textContent = name;
    li.append(who);
  }
  li.append(document.createTextNode(text));
  logEl.append(li);
  logEl.scrollTop = logEl.scrollHeight;
}

function resetUi() {
  peers.clear();
  logEl.replaceChildren();
  live.hidden = true;
  joinForm.hidden = false;
  joinButton.textContent = 'Join room';
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toLowerCase();
  const planet = planetSelect.value;

  if (!name) return showJoinError('Enter a name so peers know who you are.', nameInput);
  if (code && !CODE_RE.test(code)) {
    return showJoinError('Use 3 to 16 lowercase letters or digits for the room code.', codeInput);
  }

  try {
    localStorage.setItem('skillorbit:room-name', name);
  } catch {
    /* не критично */
  }

  selfName = name;
  joinButton.textContent = 'Joining';
  joinMsg.textContent = '';
  const roomId = code ? `${planet}-${code}` : planet;
  room = new PeerRoom({ url: signalingUrl(), room: roomId, name });

  room.addEventListener('peer-joined', ({ detail }) => {
    peers.set(detail.id, { name: detail.name, direct: false });
    log(`${detail.name} joined the room.`);
    renderPeers();
  });
  room.addEventListener('peer-connected', ({ detail }) => {
    peers.set(detail.id, { name: detail.name, direct: true });
    log(`Direct link to ${detail.name} is open.`);
    renderPeers();
  });
  room.addEventListener('peer-left', ({ detail }) => {
    if (peers.delete(detail.id)) log(`${detail.name} left the room.`);
    renderPeers();
  });
  room.addEventListener('message', ({ detail }) => log(detail.text, { name: detail.name, kind: 'peer' }));
  room.addEventListener('error', ({ detail }) => log(detail.message || 'Something went wrong with the connection.'));
  room.addEventListener('status', ({ detail }) => {
    if (detail.state === 'closed' && !live.hidden) log('Disconnected from the signaling server. Direct links stay open until peers leave.');
  });

  try {
    const welcome = await room.join();
    for (const peer of welcome.peers || []) peers.set(peer.id, { name: peer.name, direct: false });
    roomTitle.textContent = code ? `${PLANETS[planet]} room "${code}"` : `${PLANETS[planet]} open room`;
    joinForm.hidden = true;
    live.hidden = false;
    renderPeers();
    log('You joined. Messages go straight to peers, not through our server.');
    chatInput.focus();
  } catch (error) {
    room = null;
    joinButton.textContent = 'Join room';
    showJoinError(error.message);
  }
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !room) return;
  const sent = room.send(text);
  if (sent === 0) {
    log('Nobody is connected directly yet, so this message was not sent.');
    return;
  }
  log(text, { name: `${selfName} (you)`, kind: 'self' });
  chatInput.value = '';
});

leaveButton.addEventListener('click', () => {
  if (room) room.leave();
  room = null;
  resetUi();
  nameInput.focus();
});

window.addEventListener('pagehide', () => {
  if (room) room.leave();
});
