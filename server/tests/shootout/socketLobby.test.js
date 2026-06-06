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

import ShootoutLobby from '../../models/ShootoutLobby.js';
import {
    initShootoutSocket,
    registerShootoutHandlers,
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
