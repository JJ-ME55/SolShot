// ── State ─────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const myUserId = Number(params.get('u') || '0') || (1000 + Math.floor(Math.random() * 9000));
const myUsername = 'user_' + myUserId;
document.getElementById('whoami').textContent = `u=${myUserId} (${myUsername})`;

const state = { lobby: null, match: null };

// ── Log helpers ───────────────────────────────────────────────────
const logEl = document.getElementById('log');
const log = (cls, ...parts) => {
  const ts = new Date().toISOString().slice(11, 23);
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = `[${ts}] ${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
};

// ── Socket ────────────────────────────────────────────────────────
const socket = io();
socket.on('connect',    () => log('meta', `connected sid=${socket.id}`));
socket.on('disconnect', (reason) => log('err', `disconnected: ${reason}`));
socket.on('connect_error', (err) => log('err', `connect_error: ${err.message}`));

const emit = (event, payload) => new Promise((resolve) => {
  log('emit', `→ ${event}`, payload);
  socket.emit(event, payload, (ack) => {
    log('ack', `← ${event} ack`, ack);
    resolve(ack);
  });
});

// ── Render ────────────────────────────────────────────────────────
function renderLobby() {
  const l = state.lobby;
  const panel = document.getElementById('lobbyPanel');
  if (!l) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('lobbyId').textContent = l.lobbyId;
  document.getElementById('lobbyCode').textContent = l.code;
  document.getElementById('lobbyMode').textContent = l.mode;
  document.getElementById('lobbyState').textContent = l.state;

  const me = l.members.find(m => m.telegramUserId === myUserId);
  const mlist = document.getElementById('memberList');
  mlist.innerHTML = '';
  l.members.forEach(m => {
    const div = document.createElement('div');
    div.className = 'member' + (m.telegramUserId === myUserId ? ' me' : '');
    div.textContent =
      `${m.telegramUsername || m.firstName || ('u_' + m.telegramUserId)}` +
      ` · team=${m.team} · slot=${m.slot ?? '-'}` +
      (m.isHost ? ' · HOST' : '') +
      (m.isReady ? ' · READY' : '');
    mlist.appendChild(div);
  });

  document.getElementById('btnReady').textContent = me?.isReady ? 'Un-ready' : 'Ready';
  const showStart = me?.isHost && l.state === 'READY';
  document.getElementById('btnStart').style.display = showStart ? '' : 'none';
}

function renderMatch() {
  const panel = document.getElementById('matchPanel');
  if (!state.match) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  document.getElementById('matchInfo').textContent = JSON.stringify(state.match, null, 2);
}

// ── Server events ────────────────────────────────────────────────
socket.on('shootout:lobby:state', ({ lobby }) => {
  log('evt', '↓ shootout:lobby:state', { state: lobby.state, members: lobby.members.length });
  state.lobby = lobby;
  renderLobby();
});

socket.on('shootout:lobby:closed', (payload) => {
  log('evt', '↓ shootout:lobby:closed', payload);
  state.lobby = null;
  renderLobby();
});

socket.on('shootout:match:start', async (payload) => {
  // GOTCHA #5 — yourSlot is per-socket. Loudly highlight it so
  // side-by-side tabs trivially confirm 0 vs 1 vs 2 vs 3.
  log('evt', `↓ shootout:match:start yourSlot=${payload.yourSlot}`, payload);
  state.match = payload;
  renderMatch();
  // Auto-join the match room (GOTCHA #1 — only the client knows when its
  // screen is mounted; here "mounted" == matchPanel rendered).
  const ack = await emit('shootout:joinMatch', {
    matchId: payload.matchId,
    telegramUserId: myUserId,
  });
  state.match = { ...state.match, _joinAck: ack };
  renderMatch();
});

// ── UI handlers ──────────────────────────────────────────────────
document.getElementById('btnCreate').onclick = async () => {
  const ack = await emit('shootout:lobby:create', {
    mode: document.getElementById('mode').value,
    telegramUserId: myUserId,
    telegramUsername: myUsername,
  });
  if (ack?.code) document.getElementById('joinCode').value = ack.code;
};

document.getElementById('btnJoin').onclick = async () => {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!code) return;
  await emit('shootout:lobby:join', {
    code,
    telegramUserId: myUserId,
    telegramUsername: myUsername,
  });
};

document.getElementById('btnReady').onclick = async () => {
  if (!state.lobby) return;
  const me = state.lobby.members.find(m => m.telegramUserId === myUserId);
  await emit('shootout:lobby:ready', {
    lobbyId: state.lobby.lobbyId,
    telegramUserId: myUserId,
    ready: !me?.isReady,
  });
};

document.getElementById('btnStart').onclick = async () => {
  if (!state.lobby) return;
  await emit('shootout:lobby:start', {
    lobbyId: state.lobby.lobbyId,
    telegramUserId: myUserId,
  });
};

document.getElementById('btnLeave').onclick = async () => {
  if (!state.lobby) return;
  await emit('shootout:lobby:leave', {
    lobbyId: state.lobby.lobbyId,
    telegramUserId: myUserId,
  });
  state.lobby = null;
  state.match = null;
  renderLobby();
  renderMatch();
};
