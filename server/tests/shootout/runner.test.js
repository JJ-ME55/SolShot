/**
 * Tests for ShootoutRunner — Day 1 / Task 3.
 *
 * Covers the existing Checkpoint-1 contract (construction, room naming,
 * idempotent start/stop) PLUS the Day-1 tick + snapshot extensions:
 *   - start() seeds a player per match member with a spawn state
 *   - setInput updates the latest input for the slot
 *   - 60Hz tick advances player position when moveZ=1
 *   - 20Hz snapshot is emitted to the match room
 *   - ring buffer is populated each tick
 *   - stop() clears intervals
 */

import { test, mock } from 'node:test';
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
        cap: 2,
        members: [
            { telegramUserId: 1, displayName: '@a', slot: 0, team: 'red' },
            { telegramUserId: 2, displayName: '@b', slot: 1, team: 'blue' },
        ],
        startedAt: Date.now(),
        ...overrides,
    };
}

// ── C1 contract (preserved) ──────────────────────────────────────────

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
    r.start();
    assert.equal(r.started, true);
    r.start(); // idempotent
    assert.equal(r.started, true);
    r.stop();
});

test('ShootoutRunner.stop: clears started flag, no-op when never started', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.stop(); // no-op
    assert.equal(r.started, false);
    r.start();
    r.stop();
    assert.equal(r.started, false);
});

// ── Day 1: player seeding ────────────────────────────────────────────

test('ShootoutRunner.start: seeds one player record per match member', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        assert.equal(r.players.size, 2);
        const p0 = r.players.get(0);
        const p1 = r.players.get(1);
        assert.ok(p0);
        assert.ok(p1);
        assert.equal(p0.telegramUserId, 1);
        assert.equal(p1.telegramUserId, 2);
        assert.equal(p0.alive, true);
        assert.equal(p0.isBot, false);
        assert.ok(Number.isFinite(p0.state.x));
        assert.equal(p0.ring.length, 60);
        assert.equal(p0.ringHead, 0);
    } finally {
        r.stop();
    }
});

// ── Day 1: setInput ──────────────────────────────────────────────────

test('ShootoutRunner.setInput: updates lastInput for the matching slot', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const ok = r.setInput(0, { seq: 1, moveZ: 1, moveX: 0, lookYaw: 0.5, jump: false });
        assert.equal(ok, true);
        const p = r.players.get(0);
        assert.equal(p.lastInput.moveZ, 1);
        assert.equal(p.lastInput.lookYaw, 0.5);
        assert.equal(p.lastInputSeq, 1);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner.setInput: returns false for unknown slot', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        assert.equal(r.setInput(99, { seq: 1, moveZ: 1 }), false);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner.setInput: drops out-of-order seq', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        r.setInput(0, { seq: 10, moveZ: 1 });
        const ok = r.setInput(0, { seq: 5, moveZ: -1 });
        assert.equal(ok, false);
        assert.equal(r.players.get(0).lastInput.moveZ, 1, 'newer seq survives');
    } finally {
        r.stop();
    }
});

// ── Day 1: tick loop ─────────────────────────────────────────────────

test('ShootoutRunner: 60 ticks of forward input advances position', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const p = r.players.get(0);
        const startX = p.state.x;
        const startZ = p.state.z;
        // Aim toward +X (yaw=-π/2 → forward=(1,0)); see physics.js.
        r.setInput(0, { seq: 1, moveZ: 1, moveX: 0, lookYaw: -Math.PI / 2 });
        // Advance 60 ticks at 60Hz = 1 second.
        t.mock.timers.tick(1000);
        // Movement should have happened.
        const dx = p.state.x - startX;
        const dz = p.state.z - startZ;
        assert.ok(Math.hypot(dx, dz) > 1, `expected meaningful motion, got dx=${dx} dz=${dz}`);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: ring buffer fills as ticks run', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        t.mock.timers.tick(200); // ~12 ticks @ 60Hz
        const p = r.players.get(0);
        // First few entries should now be populated.
        assert.ok(p.ring[0] !== null, 'ring[0] should be populated after ticks');
        assert.ok(Number.isFinite(p.ring[0].tick));
        assert.ok(Number.isFinite(p.ring[0].x));
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

// ── Day 1: snapshot broadcast ────────────────────────────────────────

test('ShootoutRunner: emits shootout:match:snapshot at ~20Hz', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match: makeMatch(), io });
    r.start();
    try {
        // 1 second should yield ~20 snapshot emits.
        t.mock.timers.tick(1000);
        const snaps = io.emitted.filter((e) => e.evt === 'shootout:match:snapshot');
        assert.ok(snaps.length >= 18 && snaps.length <= 22,
            `expected ~20 snapshots in 1s, got ${snaps.length}`);
        const snap = snaps[snaps.length - 1].payload;
        assert.ok(Array.isArray(snap.players));
        assert.equal(snap.players.length, 2);
        assert.ok(Number.isFinite(snap.tick));
        assert.ok(Number.isFinite(snap.tMs));
        assert.ok(snaps[0].room.startsWith('match:'));
        assert.equal(snap.players[0].alive, true);
        for (const p of snap.players) {
            for (const k of ['slot','x','y','z','yaw','pitch','alive']) {
                assert.ok(k in p, `snapshot player missing ${k}`);
            }
        }
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: stop() halts emits + ticks', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match: makeMatch(), io });
    r.start();
    t.mock.timers.tick(500);
    const beforeStopEmits = io.emitted.length;
    r.stop();
    t.mock.timers.tick(2000);
    assert.equal(io.emitted.length, beforeStopEmits,
        'no further emits after stop()');
    t.mock.timers.reset();
});

// ── Day 2: resolveFire — lag-comp hitscan ────────────────────────────

// Helper: place a target player at a fixed world-space position by
// directly mutating state + ring buffer entries so we can craft rays
// with known geometric intersections regardless of physics integration.
function _pinTarget(runner, slot, x, z, ticks = [0]) {
    const p = runner.players.get(slot);
    p.state.x = x; p.state.y = 0; p.state.z = z;
    p.state.yaw = 0; p.state.pitch = 0; p.state.crouching = false;
    // Pre-populate ring with the same fixed pose across the desired ticks.
    for (let i = 0; i < ticks.length && i < p.ring.length; i++) {
        p.ring[i] = {
            tick: ticks[i],
            x, y: 0, z,
            yaw: 0, pitch: 0,
        };
    }
}

test('resolveFire: ray that hits target chest returns ok + damage applied', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        // Pin slot 1 at (0,0,5), pre-populate history at the tick we'll claim
        // we fired at (tick 6, which after INTERP_DELAY_TICKS=6 lookback
        // resolves to tick 0).
        _pinTarget(r, 1, 0, 5, [0]);
        // Shooter at slot 0 — physical position irrelevant; we pass ray.
        r.tick = 6; // matches client tick fired
        // Ray origin shooter eye-height pointing along +Z to target's chest.
        const fire = {
            seq: 1,
            fromX: 0, fromY: 1.6, fromZ: 0,
            // Aim at target chest y~1.4 from origin y=1.6 at distance z=5:
            // dir = normalize((0, -0.2, 5))
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 6,
            weaponType: 'AK47',
        };
        const res = r.resolveFire(0, fire);
        assert.equal(res.ok, true, `expected hit; got: ${JSON.stringify(res)}`);
        assert.equal(res.victim, 1);
        // Chest base AK47 damage = 36, armor halves to 18.
        assert.ok(res.damageDealt > 0 && res.damageDealt <= 40,
            `unexpected damageDealt: ${res.damageDealt}`);
        assert.equal(res.killed, false);
        // Victim's HP dropped
        const vh = r.damageSystem.getHealth('1');
        assert.ok(vh.hp < 100, `hp should drop; got ${vh.hp}`);
    } finally {
        r.stop();
    }
});

test('resolveFire: shooter cannot hit themselves', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        // Pin slot 0 at origin and pre-populate ring so even if iteration
        // crosses through it, the self-hit filter still wins.
        _pinTarget(r, 0, 0, 0, [0]);
        _pinTarget(r, 1, 99, 99, [0]); // far away
        r.tick = 6;
        const fire = {
            seq: 1,
            fromX: 0, fromY: 1.4, fromZ: 0,
            dirX: 0, dirY: 0, dirZ: 1,
            clientTickFired: 6,
            weaponType: 'AK47',
        };
        const res = r.resolveFire(0, fire);
        // Ray points along +Z away from origin — no hit on slot 1 (far),
        // and slot 0 is the shooter so excluded. Expected miss.
        assert.equal(res.ok, false);
        assert.ok(['miss', 'no_targets'].includes(res.reason));
    } finally {
        r.stop();
    }
});

test('resolveFire: clientTickFired > 250ms in past returns rewind_expired', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        _pinTarget(r, 1, 0, 5, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        // Server is at tick 100; client claims tick 50.
        // rewindAge = 100 - (50 - 6) = 56 ticks > MAX_REWIND_TICKS (15)
        r.tick = 100;
        const fire = {
            seq: 1,
            fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 50,
            weaponType: 'AK47',
        };
        const res = r.resolveFire(0, fire);
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'rewind_expired');
    } finally {
        r.stop();
    }
});

test('resolveFire: clientTickFired clamped to current tick — future claims do not let client cheat', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        _pinTarget(r, 1, 0, 5, [0]);
        // Server at tick 6, client claims tick 9999 — should clamp to 6,
        // not error.
        r.tick = 6;
        const fire = {
            seq: 1,
            fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 9999,
            weaponType: 'AK47',
        };
        const res = r.resolveFire(0, fire);
        // Clamp → targetTick = 0 → finds the pinned ring entry → hit
        assert.equal(res.ok, true, `expected hit after clamp; got ${JSON.stringify(res)}`);
        assert.equal(res.victim, 1);
    } finally {
        r.stop();
    }
});

test('resolveFire: unknown shooter slot returns no_shooter', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const res = r.resolveFire(99, {
            seq: 1, fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: 0, dirZ: 1,
            clientTickFired: 6, weaponType: 'AK47',
        });
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'no_shooter');
    } finally {
        r.stop();
    }
});

test('resolveFire: damageSystem registers slots on start (HP starts at 100)', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const h0 = r.damageSystem.getHealth('0');
        const h1 = r.damageSystem.getHealth('1');
        assert.ok(h0); assert.ok(h1);
        assert.equal(h0.hp, 100);
        assert.equal(h1.hp, 100);
    } finally {
        r.stop();
    }
});

test('resolveFire: lethal damage flips victim alive=false', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        _pinTarget(r, 1, 0, 5, [0]);
        // Drop victim to 1 HP so a single chest shot kills.
        const vh = r.damageSystem.getHealth('1');
        vh.hp = 1;
        r.tick = 6;
        const res = r.resolveFire(0, {
            seq: 1,
            fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 6,
            weaponType: 'AK47',
        });
        assert.equal(res.ok, true);
        assert.equal(res.killed, true);
        assert.equal(r.players.get(1).alive, false, 'runner record flips dead');
    } finally {
        r.stop();
    }
});
