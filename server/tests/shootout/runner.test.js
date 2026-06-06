/**
 * Tests for ShootoutRunner skeleton — Task E.2.
 *
 * Checkpoint 1 just covers construction, room naming, and idempotent
 * start/stop. The tick loop (60Hz), snapshot emit (20Hz), lag-comp ring
 * buffer, and combat eval all land in Checkpoint 2/3 with their own
 * tests.
 *
 * No real socket.io / Mongo — uses the fake io recorder pattern from
 * socketLobby.test.js.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { ShootoutRunner } from '../../services/games/shootout/sim/runner.js';

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

function makeMatch(overrides = {}) {
    return {
        matchId: 'M1',
        lobbyId: 'L1',
        mode: '1v1',
        members: [
            { telegramUserId: 1, displayName: '@a', slot: 0, team: 'red' },
            { telegramUserId: 2, displayName: '@b', slot: 1, team: 'blue' },
        ],
        startedAt: Date.now(),
        ...overrides,
    };
}

test('ShootoutRunner: constructor stores match + io', () => {
    const match = makeMatch();
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match, io });
    assert.equal(r.match, match);
    assert.equal(r.io, io);
});

test('ShootoutRunner.roomName: returns match:<matchId>', () => {
    const r = new ShootoutRunner({ match: makeMatch({ matchId: 'M-xyz' }), io: makeFakeIo() });
    assert.equal(r.roomName, 'match:M-xyz');
});

test('ShootoutRunner.start: marks started, no-op the second time', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    assert.equal(r.started, false);
    assert.doesNotThrow(() => r.start());
    assert.equal(r.started, true);
    // Idempotent — second call must not throw.
    assert.doesNotThrow(() => r.start());
    assert.equal(r.started, true);
});

test('ShootoutRunner.stop: clears started flag, no-op when never started', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    // No-op before start
    assert.doesNotThrow(() => r.stop());
    assert.equal(r.started, false);
    r.start();
    assert.equal(r.started, true);
    r.stop();
    assert.equal(r.started, false);
});

test('ShootoutRunner: start does NOT emit anything in Checkpoint 1', () => {
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match: makeMatch(), io });
    r.start();
    // Tick loop + snapshot emit deferred to Checkpoint 2.
    assert.equal(io.emitted.length, 0);
});
