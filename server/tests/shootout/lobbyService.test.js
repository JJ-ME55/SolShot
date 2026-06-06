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
