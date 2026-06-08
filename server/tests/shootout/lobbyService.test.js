/**
 * Tests for Shootout lobbyService.
 *
 * Phase C Checkpoint 1 — Tasks C.1 through C.6. Stateless wrappers
 * around ShootoutLobby Mongo ops. Mongo ops are mocked via node:test's
 * built-in `mock.method` — no live DB is required.
 *
 * Reference: server/services/games/critter-kart/lobbyService.js for
 * conventions (formatDisplayName, newId pattern, structured logger
 * calls). State-machine strings differ — Shootout uses
 * OPEN/FULL/READY/STARTING/IN_MATCH/CLOSED.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import ShootoutLobby from '../../models/ShootoutLobby.js';
import {
    generateLobbyCode,
    createLobby,
    joinLobbyByCode,
    leaveLobby,
    setReady,
    startMatch,
    pickTeam,
    listOpenLobbies,
} from '../../services/games/shootout/lobbyService.js';

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

// Build a fake mongoose-document shape that captures created/saved docs
// without touching Mongo. `data` is the doc payload createLobby would
// pass to ShootoutLobby.create.
function fakeDoc(data) {
    return {
        ...data,
        toObject() { return { ...this }; },
        async save() { return this; },
    };
}

// ── C.1 generateLobbyCode ────────────────────────────────────────────

test('generateLobbyCode: 6 chars, uppercase alphanumeric, no ambiguous (0/O/1/I/L)', () => {
    const codes = new Set();
    for (let i = 0; i < 500; i++) codes.add(generateLobbyCode());
    for (const c of codes) {
        assert.equal(c.length, 6);
        assert.match(c, /^[A-HJ-NP-Z2-9]+$/);  // no 0,O,1,I,L
        for (const ch of '01OIL') assert.equal(c.includes(ch), false);
    }
    assert.ok(codes.size > 400, 'codes should be reasonably unique (>400/500)');
});

// ── C.2 createLobby ──────────────────────────────────────────────────

test('createLobby 1v1: returns ok+lobby with cap 2, host first member, state OPEN', async () => {
    let captured = null;
    const createMock = mock.method(ShootoutLobby, 'create', async (doc) => {
        captured = doc;
        return fakeDoc(doc);
    });
    try {
        const res = await createLobby({
            mode: '1v1', telegramUserId: 42, telegramUsername: 'fish', socketId: 'sock-1',
        });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.mode, '1v1');
        assert.equal(res.lobby.cap, 2);
        assert.equal(res.lobby.state, 'OPEN');
        assert.equal(res.lobby.hostTelegramUserId, 42);
        assert.match(res.lobby.code, CODE_RE);
        assert.ok(res.lobby.lobbyId.startsWith('lobby-'));
        assert.equal(res.lobby.members.length, 1);
        const host = res.lobby.members[0];
        assert.equal(host.telegramUserId, 42);
        assert.equal(host.isHost, true);
        assert.equal(host.displayName, '@fish');
        assert.equal(host.socketId, 'sock-1');
        assert.equal(createMock.mock.callCount(), 1);
        assert.equal(captured.matchId, null);
    } finally {
        createMock.mock.restore();
    }
});

test('createLobby 2v2: cap 4', async () => {
    const createMock = mock.method(ShootoutLobby, 'create', async (doc) => fakeDoc(doc));
    try {
        const res = await createLobby({ mode: '2v2', telegramUserId: 7 });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.cap, 4);
        assert.equal(res.lobby.mode, '2v2');
    } finally {
        createMock.mock.restore();
    }
});

test('createLobby rejects unknown mode without hitting DB', async () => {
    const createMock = mock.method(ShootoutLobby, 'create', async () => {
        throw new Error('should not be called');
    });
    try {
        const res = await createLobby({ mode: '5v5', telegramUserId: 7 });
        assert.equal(res.ok, undefined);
        assert.equal(res.error, 'invalid_mode');
        assert.equal(createMock.mock.callCount(), 0);
    } finally {
        createMock.mock.restore();
    }
});

test('createLobby displayName: firstName fallback, then Player <last4>', async () => {
    const createMock = mock.method(ShootoutLobby, 'create', async (doc) => fakeDoc(doc));
    try {
        const a = await createLobby({ mode: '1v1', telegramUserId: 100, firstName: 'Jacob' });
        assert.equal(a.lobby.members[0].displayName, 'Jacob');
        const b = await createLobby({ mode: '1v1', telegramUserId: 1234567 });
        assert.equal(b.lobby.members[0].displayName, 'Player 4567');
    } finally {
        createMock.mock.restore();
    }
});

test('createLobby retries on unique code collision (E11000)', async () => {
    let call = 0;
    const createMock = mock.method(ShootoutLobby, 'create', async (doc) => {
        call += 1;
        if (call < 3) {
            const err = new Error('dup key');
            err.code = 11000;
            err.keyPattern = { code: 1 };
            throw err;
        }
        return fakeDoc(doc);
    });
    try {
        const res = await createLobby({ mode: '1v1', telegramUserId: 9 });
        assert.equal(res.ok, true);
        assert.equal(createMock.mock.callCount(), 3);
    } finally {
        createMock.mock.restore();
    }
});

// ── C.3 joinLobbyByCode ──────────────────────────────────────────────

// Helper: build a mutable lobby doc that supports .save() like a Mongo doc.
function fakeLobby({ code = 'ABCDEF', mode = '2v2', cap = 4, state = 'OPEN',
                     members = [], matchId = null, hostTelegramUserId = 1 } = {}) {
    const doc = {
        lobbyId: 'lobby-x',
        code, mode, cap, state, matchId,
        hostTelegramUserId,
        members,
        closedAt: null,
        lastActiveAt: new Date(0),
        async save() { return this; },
        toObject() {
            // shallow snapshot — sufficient for assertions
            return { ...this, members: this.members.map(m => ({ ...m })) };
        },
    };
    return doc;
}

function hostMember(overrides = {}) {
    return {
        telegramUserId: 1, telegramUsername: 'host', firstName: null,
        displayName: '@host', socketId: 'sock-host',
        isHost: true, isReady: false, team: 'red', slot: -1,
        ...overrides,
    };
}

test('joinLobbyByCode: OPEN with room → adds member with no team yet (still OPEN if not at cap)', async () => {
    const lobby = fakeLobby({ members: [hostMember()], cap: 4, mode: '2v2' });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await joinLobbyByCode({
            code: 'ABCDEF', telegramUserId: 2, telegramUsername: 'mate', socketId: 'sock-2',
        });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members.length, 2);
        assert.equal(res.lobby.members[1].telegramUserId, 2);
        // Phase C (2026-06-08): members join unassigned; team is picked
        // during Ready Up via shootout:lobby:pickTeam.
        assert.equal(res.lobby.members[1].team, null);
        assert.equal(res.lobby.members[1].isHost, false);
        assert.equal(res.lobby.members[1].displayName, '@mate');
        assert.equal(res.lobby.members[1].socketId, 'sock-2');
        assert.equal(res.lobby.state, 'OPEN'); // 2/4, not full yet
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: FULL lobby returns lobby_full', async () => {
    const lobby = fakeLobby({
        state: 'FULL',
        members: [hostMember(), { telegramUserId: 2, displayName: '@b', isHost: false }],
        cap: 2,
        mode: '1v1',
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 3 });
        assert.equal(res.ok, undefined);
        assert.equal(res.error, 'lobby_full');
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: members at cap (but state not yet FULL) also returns lobby_full', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', // race condition: stale state but actually full
        members: [hostMember(), { telegramUserId: 2, displayName: '@b', isHost: false }],
        cap: 2,
        mode: '1v1',
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 3 });
        assert.equal(res.error, 'lobby_full');
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: unknown code → lobby_not_found', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const res = await joinLobbyByCode({ code: 'ZZZZZZ', telegramUserId: 9 });
        assert.equal(res.error, 'lobby_not_found');
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: re-join by same telegramUserId is idempotent + updates socketId', async () => {
    const lobby = fakeLobby({
        members: [hostMember(), {
            telegramUserId: 2, telegramUsername: 'mate', firstName: null,
            displayName: '@mate', socketId: 'old-sock',
            isHost: false, isReady: false, team: 'blue', slot: -1,
        }],
        cap: 4,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await joinLobbyByCode({
            code: 'ABCDEF', telegramUserId: 2, socketId: 'new-sock',
        });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members.length, 2); // no dup
        const mate = res.lobby.members.find(m => m.telegramUserId === 2);
        assert.equal(mate.socketId, 'new-sock');
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: last seat fills → state OPEN → FULL', async () => {
    const lobby = fakeLobby({
        state: 'OPEN',
        cap: 2,
        mode: '1v1',
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 2 });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.state, 'FULL');
    } finally {
        findMock.mock.restore();
    }
});

test('joinLobbyByCode: 2v2 members join with team=null (Phase C: user-picks during Ready Up)', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', cap: 4, mode: '2v2',
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const r1 = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 2 });
        assert.equal(r1.lobby.members[1].team, null);
        const r2 = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 3 });
        assert.equal(r2.lobby.members[2].team, null);
        const r3 = await joinLobbyByCode({ code: 'ABCDEF', telegramUserId: 4 });
        assert.equal(r3.lobby.members[3].team, null);
        assert.equal(r3.lobby.state, 'FULL');
    } finally {
        findMock.mock.restore();
    }
});

// ── C.4 leaveLobby ───────────────────────────────────────────────────

test('leaveLobby: non-host member leaves, FULL → OPEN', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember(),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await leaveLobby({ lobbyId: 'lobby-x', telegramUserId: 2 });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members.length, 1);
        assert.equal(res.lobby.state, 'OPEN');
        assert.equal(res.lobby.members[0].telegramUserId, 1);
    } finally {
        findMock.mock.restore();
    }
});

test('leaveLobby: host leaves with others remaining → host transfers to next member', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember(),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue' },
        ],
        hostTelegramUserId: 1,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await leaveLobby({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members.length, 1);
        assert.equal(res.lobby.members[0].telegramUserId, 2);
        assert.equal(res.lobby.members[0].isHost, true);
        assert.equal(res.lobby.hostTelegramUserId, 2);
        assert.equal(res.lobby.state, 'OPEN'); // was FULL, now under cap
    } finally {
        findMock.mock.restore();
    }
});

test('leaveLobby: last member leaves → state CLOSED + closedAt set', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', cap: 2, mode: '1v1',
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await leaveLobby({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.ok, true);
        assert.equal(res.closed, true);
        assert.equal(res.lobby.state, 'CLOSED');
        assert.equal(res.lobby.members.length, 0);
        assert.ok(res.lobby.closedAt instanceof Date);
    } finally {
        findMock.mock.restore();
    }
});

test('leaveLobby: unknown lobby returns lobby_not_found', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const res = await leaveLobby({ lobbyId: 'lobby-missing', telegramUserId: 1 });
        assert.equal(res.error, 'lobby_not_found');
    } finally {
        findMock.mock.restore();
    }
});

test('leaveLobby: non-member of existing lobby is a no-op', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', cap: 4, mode: '2v2',
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await leaveLobby({ lobbyId: 'lobby-x', telegramUserId: 999 });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members.length, 1);
        assert.equal(res.lobby.state, 'OPEN');
    } finally {
        findMock.mock.restore();
    }
});

// ── C.5 setReady ─────────────────────────────────────────────────────

test('setReady: flips member isReady true → false → true', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember(),
            { telegramUserId: 2, displayName: '@b', isHost: false, isReady: false, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        let res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 2, ready: true });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members[1].isReady, true);
        res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 2, ready: false });
        assert.equal(res.lobby.members[1].isReady, false);
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: all members ready while FULL → state READY', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember({ isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, isReady: false, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 2, ready: true });
        assert.equal(res.lobby.state, 'READY');
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: one un-readies while READY → back to FULL', async () => {
    const lobby = fakeLobby({
        state: 'READY', cap: 2, mode: '1v1',
        members: [
            hostMember({ isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, isReady: true, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 2, ready: false });
        assert.equal(res.lobby.state, 'FULL');
        assert.equal(res.lobby.members[1].isReady, false);
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: unknown lobby returns lobby_not_found', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const res = await setReady({ lobbyId: 'nope', telegramUserId: 1, ready: true });
        assert.equal(res.error, 'lobby_not_found');
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: non-member returns not_member', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember(),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 999, ready: true });
        assert.equal(res.error, 'not_member');
    } finally {
        findMock.mock.restore();
    }
});

// ── C.6 startMatch ───────────────────────────────────────────────────

test('startMatch: non-host returns not_host', async () => {
    const lobby = fakeLobby({
        state: 'READY', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [
            hostMember({ isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, isReady: true, team: 'blue' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 2 });
        assert.equal(res.error, 'not_host');
        assert.equal(lobby.state, 'READY'); // unchanged
        assert.equal(lobby.matchId, null);
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch: non-READY state returns not_ready', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [hostMember(), { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue' }],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.error, 'not_ready');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch: unknown lobby returns lobby_not_found', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const res = await startMatch({ lobbyId: 'nope', telegramUserId: 1 });
        assert.equal(res.error, 'lobby_not_found');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch: success → matchId set, slots 0..n-1, state STARTING, teams preserved', async () => {
    const lobby = fakeLobby({
        state: 'READY', cap: 4, mode: '2v2',
        hostTelegramUserId: 1,
        members: [
            hostMember({ isReady: true, team: 'red' }),
            { telegramUserId: 2, displayName: '@b', isHost: false, isReady: true, team: 'blue', slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, isReady: true, team: 'red', slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, isReady: true, team: 'blue', slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.ok, true);
        assert.ok(res.matchId);
        assert.ok(res.matchId.startsWith('match-'));
        assert.equal(res.lobby.matchId, res.matchId);
        assert.equal(res.lobby.state, 'STARTING');
        // Slots 0..3 in join order
        assert.deepEqual(res.lobby.members.map(m => m.slot), [0, 1, 2, 3]);
        // Teams preserved from join-order assignment
        assert.deepEqual(res.lobby.members.map(m => m.team), ['red', 'blue', 'red', 'blue']);
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch allowSolo: OPEN lobby with one member starts (no ready gate)', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [hostMember({ isReady: false })],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1, allowSolo: true });
        assert.equal(res.ok, true);
        assert.ok(res.matchId.startsWith('match-'));
        assert.equal(res.lobby.state, 'STARTING');
        assert.equal(res.lobby.members[0].slot, 0);
        assert.equal(res.lobby.members[0].isReady, true, 'host ready forced on');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch allowSolo: non-host still rejected', async () => {
    const lobby = fakeLobby({
        state: 'OPEN', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 99, allowSolo: true });
        assert.equal(res.error, 'not_host');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch allowSolo: CLOSED lobby rejected with not_startable', async () => {
    const lobby = fakeLobby({
        state: 'CLOSED', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [hostMember()],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1, allowSolo: true });
        assert.equal(res.error, 'not_startable');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch (full-lobby path unchanged): FULL state still rejected with not_ready', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        hostTelegramUserId: 1,
        members: [hostMember(), { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue' }],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.error, 'not_ready');
    } finally {
        findMock.mock.restore();
    }
});

// ── listOpenLobbies passthrough ──────────────────────────────────────

test('listOpenLobbies delegates to ShootoutLobby.openLobbies()', async () => {
    const fake = [{ lobbyId: 'lobby-a' }];
    const m = mock.method(ShootoutLobby, 'openLobbies', async () => fake);
    try {
        const res = await listOpenLobbies();
        assert.deepEqual(res, fake);
        assert.equal(m.mock.callCount(), 1);
    } finally {
        m.mock.restore();
    }
});

// ── pickTeam (Phase C, 2026-06-08) ────────────────────────────────────

test('pickTeam: sets member.team and persists', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember({ team: null }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: null, isReady: false, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await pickTeam({ lobbyId: 'lobby-x', telegramUserId: 2, team: 'blue' });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members[1].team, 'blue');
    } finally {
        findMock.mock.restore();
    }
});

test('pickTeam: rejects bad_team when value is not red or blue', async () => {
    const lobby = fakeLobby({ members: [hostMember()] });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await pickTeam({ lobbyId: 'lobby-x', telegramUserId: 1, team: 'green' });
        assert.equal(res.error, 'bad_team');
    } finally {
        findMock.mock.restore();
    }
});

test('pickTeam: rejects team_full when target side already at cap (2v2)', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 4, mode: '2v2',
        members: [
            hostMember({ team: 'red' }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'red', isReady: false, slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, team: 'blue', isReady: false, slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, team: null, isReady: false, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await pickTeam({ lobbyId: 'lobby-x', telegramUserId: 4, team: 'red' });
        assert.equal(res.error, 'team_full');
        assert.equal(lobby.members[3].team, null);
    } finally {
        findMock.mock.restore();
    }
});

test('pickTeam: allows swap from red->blue if blue has capacity (2v2)', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 4, mode: '2v2',
        members: [
            hostMember({ team: 'red' }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'red', isReady: true, slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, team: 'blue', isReady: false, slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, team: null, isReady: false, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await pickTeam({ lobbyId: 'lobby-x', telegramUserId: 2, team: 'blue' });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members[1].team, 'blue');
        // Swapping un-readies the swapper so the host can't smuggle a
        // team-swap past a ready-up vote.
        assert.equal(res.lobby.members[1].isReady, false);
    } finally {
        findMock.mock.restore();
    }
});

test('pickTeam: no-op when picking own current team', async () => {
    const lobby = fakeLobby({
        state: 'READY',
        members: [
            hostMember({ team: 'red', isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue', isReady: true, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await pickTeam({ lobbyId: 'lobby-x', telegramUserId: 1, team: 'red' });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.members[0].isReady, true);
        assert.equal(res.lobby.state, 'READY');
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: errors pick_team_first when ready=true and member has no team', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 2, mode: '1v1',
        members: [
            hostMember({ team: null }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue', isReady: false, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 1, ready: true });
        assert.equal(res.error, 'pick_team_first');
    } finally {
        findMock.mock.restore();
    }
});

test('setReady: FULL->READY requires balanced teams (2v2 3-1 stays FULL)', async () => {
    const lobby = fakeLobby({
        state: 'FULL', cap: 4, mode: '2v2',
        members: [
            hostMember({ team: 'red', isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'red',  isReady: true, slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, team: 'red',  isReady: false, slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, team: 'blue', isReady: true, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await setReady({ lobbyId: 'lobby-x', telegramUserId: 3, ready: true });
        assert.equal(res.ok, true);
        assert.equal(res.lobby.state, 'FULL');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch: errors unbalanced when teams not 2-2 in 2v2', async () => {
    const lobby = fakeLobby({
        state: 'READY', cap: 4, mode: '2v2',
        hostTelegramUserId: 1,
        members: [
            hostMember({ team: 'red', isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'red',  isReady: true, slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, team: 'red',  isReady: true, slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, team: 'blue', isReady: true, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.error, 'unbalanced');
    } finally {
        findMock.mock.restore();
    }
});

test('startMatch: assigns slots by team (red->even, blue->odd)', async () => {
    const lobby = fakeLobby({
        state: 'READY', cap: 4, mode: '2v2',
        hostTelegramUserId: 1,
        members: [
            hostMember({ team: 'red',  isReady: true }),
            { telegramUserId: 2, displayName: '@b', isHost: false, team: 'blue', isReady: true, slot: -1 },
            { telegramUserId: 3, displayName: '@c', isHost: false, team: 'red',  isReady: true, slot: -1 },
            { telegramUserId: 4, displayName: '@d', isHost: false, team: 'blue', isReady: true, slot: -1 },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobby);
    try {
        const res = await startMatch({ lobbyId: 'lobby-x', telegramUserId: 1 });
        assert.equal(res.ok, true);
        const slotByUid = Object.fromEntries(res.lobby.members.map(m => [m.telegramUserId, m.slot]));
        assert.equal(slotByUid[1], 0); // red 1
        assert.equal(slotByUid[2], 1); // blue 1
        assert.equal(slotByUid[3], 2); // red 2
        assert.equal(slotByUid[4], 3); // blue 2
    } finally {
        findMock.mock.restore();
    }
});
