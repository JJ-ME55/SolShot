/**
 * Tests for Shootout socket lobby handlers.
 *
 * Phase D — Tasks D.1 through D.4. Light unit tests over the
 * registerShootoutHandlers wiring: fake the `client` and `io` objects,
 * mock the ShootoutLobby Mongoose model (same approach as
 * lobbyService.test.js — namespace imports from lobbyService.js are
 * frozen so we can't mock.method them, but the Mongoose model is a
 * mutable object).
 *
 * Real socket.io / Mongo integration tests are out of scope for
 * Checkpoint 1 — lobbyService already has 28 unit tests covering the
 * Mongo behavior; here we only assert the socket handler glues it
 * together correctly (ack shape, room joins, broadcasts).
 *
 * Reference template: server/socket-io/critter-kart.js. We mirror its
 * `registerCritterKartHandlers` pattern but on the shootout:* prefix.
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import ShootoutLobby from '../../models/ShootoutLobby.js';
import {
    initShootoutSocket,
    registerShootoutHandlers,
    _activeMatches,
} from '../../socket-io/shootout.js';

// ── Fakes ────────────────────────────────────────────────────────────

function makeFakeClient() {
    const handlers = new Map();
    const client = {
        id: 'sock-test',
        handlers,
        emits: [],
        joined: [],
        left: [],
        on(evt, fn) { handlers.set(evt, fn); },
        emit(evt, payload) { this.emits.push({ evt, payload }); },
        join(room) { this.joined.push(room); },
        leave(room) { this.left.push(room); },
    };
    return client;
}

function makeFakeIo() {
    const io = {
        emitted: [],
        to(room) {
            return {
                emit: (evt, payload) => io.emitted.push({ room, evt, payload }),
            };
        },
        sockets: { sockets: new Map() },
    };
    return io;
}

// Mongoose-doc shape that mirrors the lobbyService.test.js fakeDoc.
function fakeDoc(data) {
    return {
        ...data,
        toObject() { return { ...this }; },
        async save() { return this; },
    };
}

// ── D.1 — initShootoutSocket + shootout:lobby:create ─────────────────

test('initShootoutSocket: exported and callable without throwing', () => {
    const io = makeFakeIo();
    assert.equal(typeof initShootoutSocket, 'function');
    assert.doesNotThrow(() => initShootoutSocket(io));
});

test('registerShootoutHandlers: registers shootout:lobby:create on the client', () => {
    const client = makeFakeClient();
    const io = makeFakeIo();
    registerShootoutHandlers(client, io);
    assert.ok(client.handlers.has('shootout:lobby:create'),
        'expected handler for shootout:lobby:create');
});

test('shootout:lobby:create — happy path calls createLobby, joins room, emits lobby:state, acks ok', async () => {
    let captured = null;
    const createMock = mock.method(ShootoutLobby, 'create', async (doc) => {
        captured = doc;
        return fakeDoc(doc);
    });
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        const handler = client.handlers.get('shootout:lobby:create');

        let ackResult;
        await handler(
            { mode: '1v1', telegramUserId: 1, telegramUsername: 'fish' },
            (r) => { ackResult = r; },
        );

        assert.equal(createMock.mock.callCount(), 1);
        assert.equal(captured.mode, '1v1');
        assert.equal(captured.hostTelegramUserId, 1);
        assert.equal(captured.members[0].socketId, 'sock-test');

        assert.equal(ackResult.ok, true);
        assert.ok(ackResult.lobbyId?.startsWith('lobby-'));
        assert.match(ackResult.code, /^[A-HJ-NP-Z2-9]{6}$/);

        const room = `lobby:${ackResult.lobbyId}`;
        assert.deepEqual(client.joined, [room]);

        const stateEmit = io.emitted.find(e =>
            e.evt === 'shootout:lobby:state' && e.room === room);
        assert.ok(stateEmit, 'expected shootout:lobby:state to lobby room');
        assert.equal(stateEmit.payload.lobby.lobbyId, ackResult.lobbyId);
    } finally {
        createMock.mock.restore();
    }
});

test('shootout:lobby:create — invalid mode short-circuits to ack {error}, no DB call, no room/broadcast', async () => {
    let dbCallCount = 0;
    const createMock = mock.method(ShootoutLobby, 'create', async () => {
        dbCallCount += 1;
        throw new Error('should not be called');
    });
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:create')(
            { mode: 'bogus', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'invalid_mode');
        assert.equal(dbCallCount, 0);
        assert.equal(client.joined.length, 0);
        assert.equal(io.emitted.length, 0);
    } finally {
        createMock.mock.restore();
    }
});

test('shootout:lobby:create — thrown service error → ack {error:internal}', async () => {
    const createMock = mock.method(ShootoutLobby, 'create', async () => {
        throw new Error('mongo dead');
    });
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:create')(
            { mode: '1v1', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'internal');
        assert.equal(client.joined.length, 0);
    } finally {
        createMock.mock.restore();
    }
});

// ── D.3 — shootout:lobby:join ────────────────────────────────────────

test('registerShootoutHandlers: registers shootout:lobby:join', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:lobby:join'));
});

test('shootout:lobby:join — happy path joins room, emits lobby:state, acks ok', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-J1',
        code: 'AB1234',
        mode: '1v1',
        cap: 2,
        state: 'OPEN',
        members: [{ telegramUserId: 99, isHost: true, displayName: '@host' }],
        hostTelegramUserId: 99,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:join')(
            { code: 'AB1234', telegramUserId: 1, telegramUsername: 'joiner' },
            (r) => { ackResult = r; },
        );
        assert.equal(findMock.mock.callCount(), 1);
        assert.equal(ackResult.ok, true);
        assert.equal(ackResult.lobbyId, 'lobby-J1');
        // Joiner should be in the room
        assert.deepEqual(client.joined, ['lobby:lobby-J1']);
        // Broadcast lobby:state
        const stateEmit = io.emitted.find(e =>
            e.evt === 'shootout:lobby:state' && e.room === 'lobby:lobby-J1');
        assert.ok(stateEmit, 'expected lobby:state broadcast');
        // Member was added
        assert.equal(stateEmit.payload.lobby.members.length, 2);
        assert.equal(stateEmit.payload.lobby.members[1].telegramUserId, 1);
    } finally {
        findMock.mock.restore();
    }
});

test('shootout:lobby:join — lobby not found → ack {error:lobby_not_found}, no room/broadcast', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:join')(
            { code: 'XXXXXX', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'lobby_not_found');
        assert.equal(client.joined.length, 0);
        assert.equal(io.emitted.length, 0);
    } finally {
        findMock.mock.restore();
    }
});

test('shootout:lobby:join — already-member is idempotent, joins room and acks', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-J2',
        code: 'CD5678',
        mode: '1v1',
        cap: 2,
        state: 'OPEN',
        members: [{ telegramUserId: 7, isHost: true, displayName: '@me' }],
        hostTelegramUserId: 7,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:join')(
            { code: 'CD5678', telegramUserId: 7 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.ok, true);
        assert.equal(ackResult.alreadyMember, true);
        // Joiner still added to socket room (so they receive lobby:state)
        assert.deepEqual(client.joined, ['lobby:lobby-J2']);
    } finally {
        findMock.mock.restore();
    }
});

// ── D.4 — shootout:lobby:leave ───────────────────────────────────────

test('registerShootoutHandlers: registers shootout:lobby:leave', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:lobby:leave'));
});

test('shootout:lobby:leave — happy path leaves room, emits lobby:state, acks ok', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-L1',
        code: 'EF1111',
        mode: '2v2',
        cap: 4,
        state: 'FULL',
        members: [
            { telegramUserId: 1, isHost: true, displayName: '@h' },
            { telegramUserId: 2, isHost: false, displayName: '@b' },
        ],
        hostTelegramUserId: 1,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:leave')(
            { lobbyId: 'lobby-L1', telegramUserId: 2 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.ok, true);
        assert.equal(ackResult.closed, undefined);
        assert.deepEqual(client.left, ['lobby:lobby-L1']);
        const stateEmit = io.emitted.find(e =>
            e.evt === 'shootout:lobby:state' && e.room === 'lobby:lobby-L1');
        assert.ok(stateEmit, 'expected lobby:state broadcast');
        // The closed event must NOT fire for non-terminal leaves
        const closedEmit = io.emitted.find(e => e.evt === 'shootout:lobby:closed');
        assert.equal(closedEmit, undefined);
    } finally {
        findMock.mock.restore();
    }
});

test('shootout:lobby:leave — last member triggers lobby:closed broadcast', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-L2',
        code: 'GH2222',
        mode: '1v1',
        cap: 2,
        state: 'OPEN',
        members: [{ telegramUserId: 5, isHost: true, displayName: '@solo' }],
        hostTelegramUserId: 5,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:leave')(
            { lobbyId: 'lobby-L2', telegramUserId: 5 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.ok, true);
        assert.equal(ackResult.closed, true);
        const closedEmit = io.emitted.find(e =>
            e.evt === 'shootout:lobby:closed' && e.room === 'lobby:lobby-L2');
        assert.ok(closedEmit, 'expected shootout:lobby:closed broadcast');
        assert.equal(closedEmit.payload.lobbyId, 'lobby-L2');
        assert.equal(closedEmit.payload.reason, 'empty');
        // Client also leaves the room
        assert.deepEqual(client.left, ['lobby:lobby-L2']);
    } finally {
        findMock.mock.restore();
    }
});

test('shootout:lobby:leave — lobby not found → ack {error}', async () => {
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:leave')(
            { lobbyId: 'nope', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'lobby_not_found');
    } finally {
        findMock.mock.restore();
    }
});

// ── D.4 — shootout:lobby:ready ───────────────────────────────────────

test('registerShootoutHandlers: registers shootout:lobby:ready', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:lobby:ready'));
});

test('shootout:lobby:ready — happy path emits lobby:state, acks ok', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-R1',
        code: 'IJ3333',
        mode: '1v1',
        cap: 2,
        state: 'FULL',
        members: [
            { telegramUserId: 1, isHost: true, isReady: false, displayName: '@h' },
            { telegramUserId: 2, isHost: false, isReady: false, displayName: '@b' },
        ],
        hostTelegramUserId: 1,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:ready')(
            { lobbyId: 'lobby-R1', telegramUserId: 2, ready: true },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.ok, true);
        const stateEmit = io.emitted.find(e =>
            e.evt === 'shootout:lobby:state' && e.room === 'lobby:lobby-R1');
        assert.ok(stateEmit, 'expected lobby:state broadcast');
        // Member 2 isReady is now true
        const m2 = stateEmit.payload.lobby.members.find(m => m.telegramUserId === 2);
        assert.equal(m2.isReady, true);
    } finally {
        findMock.mock.restore();
    }
});

test('shootout:lobby:ready — not_member surfaces as ack {error}', async () => {
    const lobbyDoc = fakeDoc({
        lobbyId: 'lobby-R2',
        code: 'KL4444',
        mode: '1v1',
        cap: 2,
        state: 'OPEN',
        members: [{ telegramUserId: 1, isHost: true, isReady: false, displayName: '@h' }],
        hostTelegramUserId: 1,
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:ready')(
            { lobbyId: 'lobby-R2', telegramUserId: 999, ready: true },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'not_member');
        // No broadcast on error
        assert.equal(io.emitted.length, 0);
    } finally {
        findMock.mock.restore();
    }
});

// ── D.4 — shootout:lobby:list ────────────────────────────────────────

test('registerShootoutHandlers: registers shootout:lobby:list', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:lobby:list'));
});

test('shootout:lobby:list — acks with the open-lobbies list', async () => {
    const fakeLobbies = [
        { lobbyId: 'l1', code: 'AAAAAA', mode: '1v1', state: 'OPEN', members: [{}] },
        { lobbyId: 'l2', code: 'BBBBBB', mode: '2v2', state: 'OPEN', members: [{}, {}] },
    ];
    const listMock = mock.method(ShootoutLobby, 'openLobbies', async () => fakeLobbies);
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:list')(
            {},
            (r) => { ackResult = r; },
        );
        assert.equal(listMock.mock.callCount(), 1);
        assert.equal(ackResult.ok, true);
        assert.deepEqual(ackResult.lobbies, fakeLobbies);
        // :list does not broadcast — answer goes in ack only
        assert.equal(io.emitted.length, 0);
    } finally {
        listMock.mock.restore();
    }
});

test('shootout:lobby:list — service throw → ack {error:internal}', async () => {
    const listMock = mock.method(ShootoutLobby, 'openLobbies', async () => {
        throw new Error('mongo dead');
    });
    try {
        const client = makeFakeClient();
        const io = makeFakeIo();
        registerShootoutHandlers(client, io);
        let ackResult;
        await client.handlers.get('shootout:lobby:list')(
            {},
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'internal');
    } finally {
        listMock.mock.restore();
    }
});

// ── End-state: all 5 handlers registered ─────────────────────────────

test('registerShootoutHandlers: all Checkpoint-1 lobby events registered', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    for (const evt of [
        'shootout:lobby:create',
        'shootout:lobby:join',
        'shootout:lobby:leave',
        'shootout:lobby:ready',
        'shootout:lobby:list',
    ]) {
        assert.ok(client.handlers.has(evt), `expected handler for ${evt}`);
    }
});

// ── E.3 — shootout:lobby:start + shootout:joinMatch ──────────────────
//
// These tests cover the two gotcha-fixes that distinguish Shootout's
// match-start from Critter Kart's (where each had to be patched in at
// run-time). See server/socket-io/shootout.js for the inline gotcha
// comments and the brief at arcade-ops/SHOOTOUT-SESSION-BRIEF.md §7.

test('registerShootoutHandlers: shootout:lobby:start + shootout:joinMatch registered', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:lobby:start'),
        'expected handler for shootout:lobby:start');
    assert.ok(client.handlers.has('shootout:joinMatch'),
        'expected handler for shootout:joinMatch');
});

// Helper: build a Mongoose-shaped READY lobby doc that
// lobbyService.startMatch will accept and mutate. members[i].socketId
// must be preserved through toObject() because socket-io/shootout.js
// uses it to look up each member's live socket for the per-socket
// match:start emit (gotcha #5).
function readyLobbyDoc({ lobbyId, members, hostTelegramUserId, mode = '1v1' }) {
    const doc = {
        lobbyId,
        code: 'CODE00',
        mode,
        cap: members.length,
        state: 'READY',
        members: members.map(m => ({ ...m, slot: -1 })),
        hostTelegramUserId,
        matchId: null,
        lastActiveAt: new Date(),
        toObject() {
            // Deep-enough copy: shallow-clone members so slot writes
            // through during startMatch survive into the snapshot.
            return {
                lobbyId: this.lobbyId,
                code: this.code,
                mode: this.mode,
                cap: this.cap,
                state: this.state,
                members: this.members.map(m => ({ ...m })),
                hostTelegramUserId: this.hostTelegramUserId,
                matchId: this.matchId,
                lastActiveAt: this.lastActiveAt,
            };
        },
        async save() { return this; },
    };
    return doc;
}

test('shootout:lobby:start — happy path: acks { ok, matchId }, registers activeMatches entry, emits per-socket match:start', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L-happy',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'a', socketId: 'sock-a', displayName: '@a' },
            { telegramUserId: 2, telegramUsername: 'b', socketId: 'sock-b', displayName: '@b' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host  = makeFakeClient(); host.id  = 'sock-host';
        const sockA = makeFakeClient(); sockA.id = 'sock-a';
        const sockB = makeFakeClient(); sockB.id = 'sock-b';
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(host, io);
        let ackResult;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L-happy', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.ok, true);
        assert.ok(ackResult.matchId?.startsWith('match-'),
            'ack matchId is match-prefixed');
        assert.ok(_activeMatches.has(ackResult.matchId),
            'expected ShootoutRunner stored in activeMatches');

        // Each socket got its own match:start emit
        const aStart = sockA.emits.find(e => e.evt === 'shootout:match:start');
        const bStart = sockB.emits.find(e => e.evt === 'shootout:match:start');
        assert.ok(aStart);
        assert.ok(bStart);
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:lobby:start — gotcha #5: per-socket yourSlot, even for same username', async () => {
    _activeMatches.clear();
    // SAME username on both sockets — the classic CK desync case.
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L1',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'fish', socketId: 'sock-a', displayName: '@fish' },
            { telegramUserId: 2, telegramUsername: 'fish', socketId: 'sock-b', displayName: '@fish' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host  = makeFakeClient(); host.id  = 'sock-host';
        const sockA = makeFakeClient(); sockA.id = 'sock-a';
        const sockB = makeFakeClient(); sockB.id = 'sock-b';
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(host, io);
        let ackResult;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L1', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );

        const aStart = sockA.emits.find(e => e.evt === 'shootout:match:start');
        const bStart = sockB.emits.find(e => e.evt === 'shootout:match:start');
        assert.ok(aStart, 'sock-a got match:start');
        assert.ok(bStart, 'sock-b got match:start');
        assert.equal(aStart.payload.yourSlot, 0, 'sock-a yourSlot');
        assert.equal(bStart.payload.yourSlot, 1, 'sock-b yourSlot — gotcha #5');
        assert.notEqual(aStart.payload.yourSlot, bStart.payload.yourSlot,
            'gotcha #5: each socket gets its OWN yourSlot, even with identical usernames');

        // Both sockets should also receive matchId/mode/members in the payload.
        assert.equal(aStart.payload.matchId, ackResult.matchId);
        assert.equal(bStart.payload.matchId, ackResult.matchId);
        assert.equal(aStart.payload.mode, '1v1');
        assert.ok(Array.isArray(aStart.payload.members) && aStart.payload.members.length === 2);

        // gotcha #1 corollary: NEITHER socket has been added to the match room yet.
        const matchRoom = `match:${ackResult.matchId}`;
        assert.equal(sockA.joined.includes(matchRoom), false,
            'sock-a NOT in match room after :start — gotcha #1');
        assert.equal(sockB.joined.includes(matchRoom), false,
            'sock-b NOT in match room after :start — gotcha #1');
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:joinMatch — gotcha #1: socket.join(matchRoom) only happens here, after match:start', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L2',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'a', socketId: 'sock-a', displayName: '@a' },
            { telegramUserId: 2, telegramUsername: 'b', socketId: 'sock-b', displayName: '@b' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host  = makeFakeClient(); host.id  = 'sock-host';
        const sockA = makeFakeClient(); sockA.id = 'sock-a';
        const sockB = makeFakeClient(); sockB.id = 'sock-b';
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(host, io);
        registerShootoutHandlers(sockA, io);
        registerShootoutHandlers(sockB, io);

        // 1) Run :start to populate _activeMatches.
        let ackStart;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L2', telegramUserId: 1 },
            (r) => { ackStart = r; },
        );
        const matchRoom = `match:${ackStart.matchId}`;
        // Assert NEITHER socket is in the match room yet.
        assert.equal(sockA.joined.includes(matchRoom), false,
            'sock-a NOT in match room after :start — gotcha #1');
        assert.equal(sockB.joined.includes(matchRoom), false,
            'sock-b NOT in match room after :start — gotcha #1');

        // 2) Now sock-a emits joinMatch — only then does it enter the room.
        let ackA;
        await sockA.handlers.get('shootout:joinMatch')(
            { matchId: ackStart.matchId, telegramUserId: 1 },
            (r) => { ackA = r; },
        );
        assert.equal(ackA.ok, true);
        assert.equal(ackA.slot, 0);
        assert.ok(sockA.joined.includes(matchRoom),
            'sock-a IS in match room AFTER :joinMatch — gotcha #1 fix');
        assert.equal(sockB.joined.includes(matchRoom), false,
            'sock-b STILL NOT in match room (hasn\'t joined yet)');

        // 3) sock-b then joins too.
        let ackB;
        await sockB.handlers.get('shootout:joinMatch')(
            { matchId: ackStart.matchId, telegramUserId: 2 },
            (r) => { ackB = r; },
        );
        assert.equal(ackB.ok, true);
        assert.equal(ackB.slot, 1);
        assert.ok(sockB.joined.includes(matchRoom));
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:lobby:start — propagates lobbyService.startMatch errors (not_host)', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L3',
        hostTelegramUserId: 1, // host is 1
        members: [
            { telegramUserId: 1, telegramUsername: 'h', socketId: 'sh', displayName: '@h' },
            { telegramUserId: 2, telegramUsername: 'g', socketId: 'sg', displayName: '@g' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host = makeFakeClient();
        registerShootoutHandlers(host, makeFakeIo());
        let ackResult;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L3', telegramUserId: 999 }, // not the host
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'not_host');
        assert.equal(_activeMatches.size, 0, 'no runner created on error');
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:lobby:start — propagates lobbyService.startMatch errors (not_ready)', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L4',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'h', socketId: 'sh', displayName: '@h' },
            { telegramUserId: 2, telegramUsername: 'g', socketId: 'sg', displayName: '@g' },
        ],
    });
    lobbyDoc.state = 'FULL'; // not yet READY
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host = makeFakeClient();
        registerShootoutHandlers(host, makeFakeIo());
        let ackResult;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L4', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'not_ready');
        assert.equal(_activeMatches.size, 0);
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:lobby:start — service throw → ack {error:internal}', async () => {
    _activeMatches.clear();
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => {
        throw new Error('mongo dead');
    });
    try {
        const host = makeFakeClient();
        registerShootoutHandlers(host, makeFakeIo());
        let ackResult;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L5', telegramUserId: 1 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'internal');
        assert.equal(_activeMatches.size, 0);
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

test('shootout:joinMatch — match_not_found if matchId is unknown', async () => {
    _activeMatches.clear();
    const sock = makeFakeClient();
    registerShootoutHandlers(sock, makeFakeIo());
    let ackResult;
    await sock.handlers.get('shootout:joinMatch')(
        { matchId: 'no-such', telegramUserId: 1 },
        (r) => { ackResult = r; },
    );
    assert.equal(ackResult.error, 'match_not_found');
    assert.equal(sock.joined.length, 0);
});

test('shootout:joinMatch — not_a_member if telegramUserId is not on the match', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L6',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'a', socketId: 'sock-a', displayName: '@a' },
            { telegramUserId: 2, telegramUsername: 'b', socketId: 'sock-b', displayName: '@b' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host     = makeFakeClient(); host.id     = 'sock-host';
        const sockA    = makeFakeClient(); sockA.id    = 'sock-a';
        const sockB    = makeFakeClient(); sockB.id    = 'sock-b';
        const stranger = makeFakeClient(); stranger.id = 'sock-stranger';
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(host, io);
        registerShootoutHandlers(stranger, io);
        let ackStart;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L6', telegramUserId: 1 },
            (r) => { ackStart = r; },
        );

        let ackResult;
        await stranger.handlers.get('shootout:joinMatch')(
            { matchId: ackStart.matchId, telegramUserId: 9999 },
            (r) => { ackResult = r; },
        );
        assert.equal(ackResult.error, 'not_a_member');
        assert.equal(stranger.joined.includes(`match:${ackStart.matchId}`), false);
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});

// ── Day 1 / Task 4 — shootout:input ──────────────────────────────────
//
// Fire-and-forget per-frame input → runner.setInput. The handler must
// be registered, must short-circuit on unknown matchId without
// throwing, and must forward the input fields to the runner.

test('registerShootoutHandlers: shootout:input registered', () => {
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.ok(client.handlers.has('shootout:input'),
        'expected handler for shootout:input');
});

test('shootout:input — unknown matchId is a silent no-op (no throw, no side effect)', () => {
    _activeMatches.clear();
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    // Must not throw.
    assert.doesNotThrow(() => {
        client.handlers.get('shootout:input')({
            matchId: 'nope', slot: 0, seq: 1, moveZ: 1,
        });
    });
});

test('shootout:input — missing matchId/slot is a silent no-op', () => {
    _activeMatches.clear();
    const client = makeFakeClient();
    registerShootoutHandlers(client, makeFakeIo());
    assert.doesNotThrow(() => {
        client.handlers.get('shootout:input')({});
    });
    assert.doesNotThrow(() => {
        client.handlers.get('shootout:input')(null);
    });
});

test('RL_EXEMPT_EVENTS in main.js includes shootout:input (gotcha #2)', () => {
    // The exempt set lives inside a per-connection closure in main.js,
    // so we can't import it directly. The robust-enough smoke check:
    // grep the source file for the literal 'shootout:input' in the
    // RL_EXEMPT_EVENTS line. If a future refactor moves the set out of
    // the closure, swap this for a direct import.
    const here    = dirname(fileURLToPath(import.meta.url));
    const mainSrc = readFileSync(resolvePath(here, '../../socket-io/main.js'), 'utf8');
    const m = mainSrc.match(/RL_EXEMPT_EVENTS\s*=\s*new Set\(\[(.*?)\]\)/);
    assert.ok(m, 'expected RL_EXEMPT_EVENTS set literal in main.js');
    assert.ok(m[1].includes("'shootout:input'") || m[1].includes('"shootout:input"'),
        'expected RL_EXEMPT_EVENTS to include shootout:input');
});

test('shootout:input — happy path forwards to runner.setInput', async () => {
    _activeMatches.clear();
    const lobbyDoc = readyLobbyDoc({
        lobbyId: 'L-input',
        hostTelegramUserId: 1,
        members: [
            { telegramUserId: 1, telegramUsername: 'a', socketId: 'sock-a', displayName: '@a' },
            { telegramUserId: 2, telegramUsername: 'b', socketId: 'sock-b', displayName: '@b' },
        ],
    });
    const findMock = mock.method(ShootoutLobby, 'findOne', async () => lobbyDoc);
    try {
        const host  = makeFakeClient(); host.id  = 'sock-host';
        const sockA = makeFakeClient(); sockA.id = 'sock-a';
        const sockB = makeFakeClient(); sockB.id = 'sock-b';
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(host, io);
        registerShootoutHandlers(sockA, io);

        let ackStart;
        await host.handlers.get('shootout:lobby:start')(
            { lobbyId: 'L-input', telegramUserId: 1 },
            (r) => { ackStart = r; },
        );

        // Runner is now in _activeMatches. Setting input via the socket
        // handler should reach the runner's players[0].lastInput.
        const runner = _activeMatches.get(ackStart.matchId);
        assert.ok(runner, 'runner exists');
        runner.start();
        try {
            sockA.handlers.get('shootout:input')({
                matchId: ackStart.matchId,
                slot:    0,
                seq:     7,
                moveX:   0,
                moveZ:   1,
                lookYaw: 1.23,
                jump:    false,
            });
            const p = runner.players.get(0);
            assert.equal(p.lastInput.moveZ, 1);
            assert.equal(p.lastInput.lookYaw, 1.23);
            assert.equal(p.lastInputSeq, 7);
        } finally {
            runner.stop();
        }
    } finally {
        findMock.mock.restore();
        _activeMatches.clear();
    }
});
