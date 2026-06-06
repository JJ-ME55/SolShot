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
