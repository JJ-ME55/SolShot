/**
 * Tests for lobbyCountdown — the 5-second auto-start timer (Phase MP-
 * expansion, 2026-06-08). Uses node:test's mock timers to fast-forward
 * the setInterval / setTimeout without real-clock flakiness.
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    armCountdown,
    cancelCountdown,
    isArmed,
    _clearAll,
} from '../../services/games/shootout/lobbyCountdown.js';

function makeFakeIo() {
    const emits = [];
    return {
        emits,
        to(room) {
            return {
                emit: (evt, payload) => emits.push({ room, evt, payload }),
            };
        },
    };
}

test('armCountdown: immediate tick + 1s interval ticks until 0', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
        const io = makeFakeIo();
        let completedCalls = 0;
        armCountdown({
            lobbyId: 'lobby-A',
            io,
            secondsTotal: 5,
            onComplete: () => { completedCalls += 1; },
        });
        // Initial tick fires synchronously.
        const ticks0 = io.emits.filter((e) => e.evt === 'shootout:lobby:countdown');
        assert.equal(ticks0.length, 1);
        assert.equal(ticks0[0].payload.secondsLeft, 5);

        // Advance 1s — secondsLeft=4 ticks
        t.mock.timers.tick(1000);
        assert.equal(io.emits.filter((e) => e.evt === 'shootout:lobby:countdown').length, 2);
        assert.equal(io.emits[1].payload.secondsLeft, 4);

        // Advance to 4s total — 4 ticks fired in addition to the immediate (= 5)
        t.mock.timers.tick(3000);
        const counts = io.emits.filter((e) => e.evt === 'shootout:lobby:countdown').map((e) => e.payload.secondsLeft);
        assert.deepEqual(counts, [5, 4, 3, 2, 1]);

        // onComplete hasn't fired yet
        assert.equal(completedCalls, 0);

        // Advance to 5s total — final 0 tick + onComplete
        t.mock.timers.tick(1000);
        assert.equal(completedCalls, 1);
        const finalTicks = io.emits.filter((e) => e.evt === 'shootout:lobby:countdown').map((e) => e.payload.secondsLeft);
        assert.deepEqual(finalTicks, [5, 4, 3, 2, 1, 0]);
        assert.equal(isArmed('lobby-A'), false, 'unarmed after complete');
    } finally {
        _clearAll();
        t.mock.timers.reset();
    }
});

test('cancelCountdown: stops ticks + prevents onComplete', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
        const io = makeFakeIo();
        let completedCalls = 0;
        armCountdown({
            lobbyId: 'lobby-B',
            io,
            secondsTotal: 5,
            onComplete: () => { completedCalls += 1; },
        });
        // Advance 2s, then cancel
        t.mock.timers.tick(2000);
        assert.equal(isArmed('lobby-B'), true);
        cancelCountdown('lobby-B');
        assert.equal(isArmed('lobby-B'), false);
        // Advance well past the original 5s — no further ticks, no complete
        const ticksBeforeCancel = io.emits.length;
        t.mock.timers.tick(10000);
        assert.equal(io.emits.length, ticksBeforeCancel, 'no ticks after cancel');
        assert.equal(completedCalls, 0, 'onComplete suppressed');
    } finally {
        _clearAll();
        t.mock.timers.reset();
    }
});

test('cancelCountdown on a non-armed lobby is a no-op (idempotent)', () => {
    assert.doesNotThrow(() => cancelCountdown('never-armed'));
});

test('armCountdown is idempotent — second call while running does not restart', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
        const io = makeFakeIo();
        armCountdown({ lobbyId: 'lobby-C', io, secondsTotal: 5, onComplete: () => {} });
        t.mock.timers.tick(2000);
        // Second arm — should be ignored
        armCountdown({ lobbyId: 'lobby-C', io, secondsTotal: 5, onComplete: () => {} });
        // Counter should still be at secondsLeft=3 trajectory
        t.mock.timers.tick(3000);
        const ticks = io.emits.filter((e) => e.evt === 'shootout:lobby:countdown').map((e) => e.payload.secondsLeft);
        // First arm: 5 (immediate) + 4 (1s) + 3 (2s) + 2 (3s) + 1 (4s) + 0 (5s done)
        assert.deepEqual(ticks, [5, 4, 3, 2, 1, 0]);
    } finally {
        _clearAll();
        t.mock.timers.reset();
    }
});

test('multiple lobbies count down independently', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
        const io = makeFakeIo();
        armCountdown({ lobbyId: 'L1', io, secondsTotal: 5, onComplete: () => {} });
        t.mock.timers.tick(2000);
        armCountdown({ lobbyId: 'L2', io, secondsTotal: 5, onComplete: () => {} });
        // L1 is at 3s left; L2 is at 5s.
        t.mock.timers.tick(3000);
        // L1 just completed; L2 has 2s left.
        assert.equal(isArmed('L1'), false);
        assert.equal(isArmed('L2'), true);
    } finally {
        _clearAll();
        t.mock.timers.reset();
    }
});
