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
import { Phase } from '../../services/games/shootout/sim/match.js';
import ShootoutStats from '../../models/ShootoutStats.js';

// Day 3 / Task 4: tests that drive the runner through MATCH_END trigger
// the stats persistence path (persistMatchStats → ShootoutStats.
// findOneAndUpdate). Without a Mongo connection, Mongoose buffers the
// op and times out at 10s, slowing the suite to ~20s. This helper
// stubs the model with a no-op so MATCH_END flows complete fast.
function _stubStats() {
    return mock.method(ShootoutStats, 'findOneAndUpdate', async () => null);
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
    r.matchState.phase = Phase.LIVE; // Day 3: input is zeroed during BUY
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
    r.matchState.phase = Phase.LIVE; // Day 3: resolveFire blocks unless LIVE
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
    r.matchState.phase = Phase.LIVE;
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
    r.matchState.phase = Phase.LIVE;
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
    r.matchState.phase = Phase.LIVE;
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
    r.matchState.phase = Phase.LIVE;
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
    r.matchState.phase = Phase.LIVE;
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

// ── Day 3: round / match FSM wiring ──────────────────────────────────

import {
    BUY_TIME,
    ROUND_END_TIME,
    WINS_NEEDED,
} from '../../services/games/shootout/sim/match.js';

test('ShootoutRunner: matchState exists after construction (BUY phase, round 1)', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    assert.ok(r.matchState);
    assert.equal(r.matchState.phase, Phase.BUY);
    assert.equal(r.matchState.round, 1);
    assert.equal(r.matchState.winsRed, 0);
    assert.equal(r.matchState.winsBlue, 0);
});

test('ShootoutRunner: player records carry team, money, kills, deaths after start()', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const p0 = r.players.get(0);
        const p1 = r.players.get(1);
        assert.equal(p0.team, 'red');
        assert.equal(p1.team, 'blue');
        assert.equal(p0.money, 2000);
        assert.equal(p0.kills, 0);
        assert.equal(p0.deaths, 0);
        assert.equal(p0.loadout, null);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: after BUY_TIME of ticks, phase transitions to LIVE + emits roundState', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match: makeMatch(), io });
    r.start();
    try {
        // Drive enough ticks to exceed BUY_TIME with margin for fp drift
        t.mock.timers.tick((BUY_TIME + 0.2) * 1000);
        assert.equal(r.matchState.phase, Phase.LIVE);
        const rs = io.emitted.filter(e => e.evt === 'shootout:match:roundState');
        assert.ok(rs.length >= 1, `expected at least 1 roundState emit, got ${rs.length}`);
        // The most recent emit should be in LIVE phase.
        const latest = rs[rs.length - 1].payload;
        assert.equal(latest.phase, Phase.LIVE);
        assert.equal(latest.round, 1);
        assert.equal(latest.winsRed, 0);
        assert.equal(latest.winsBlue, 0);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: during BUY, input is zeroed — player does not move', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const p = r.players.get(0);
        const startX = p.state.x, startZ = p.state.z;
        r.setInput(0, { seq: 1, moveZ: 1, moveX: 0, lookYaw: -Math.PI / 2 });
        // 30 ticks @ 60Hz = 0.5s — well inside BUY phase.
        t.mock.timers.tick(500);
        const moved = Math.hypot(p.state.x - startX, p.state.z - startZ);
        // Some friction/snap can drift the position by sub-meter; allow
        // tiny noise but it should NOT be a meaningful movement.
        assert.ok(moved < 0.5, `expected near-zero movement during BUY, got ${moved}`);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: during BUY, resolveFire returns {ok:false, reason:not_live}', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        _pinTarget(r, 1, 0, 5, [0]);
        r.tick = 6;
        const res = r.resolveFire(0, {
            seq: 1, fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 6, weaponType: 'AK47',
        });
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'not_live');
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: kill increments shooter kills + victim deaths', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        _pinTarget(r, 1, 0, 5, [0]);
        const vh = r.damageSystem.getHealth('1');
        vh.hp = 1; // one shot to kill
        r.tick = 6;
        r.resolveFire(0, {
            seq: 1, fromX: 0, fromY: 1.6, fromZ: 0,
            dirX: 0, dirY: -0.04, dirZ: 1,
            clientTickFired: 6, weaponType: 'AK47',
        });
        assert.equal(r.players.get(0).kills, 1);
        assert.equal(r.players.get(1).deaths, 1);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: when all blue dead, next tick transitions to ROUND_END + emits + awards money', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        const red  = r.players.get(0);
        const blue = r.players.get(1);
        const redMoneyBefore  = red.money;
        const blueMoneyBefore = blue.money;
        blue.alive = false;
        // Manually call _runTick by simulating one. The constructor's
        // setInterval is real but we don't use it here — call directly.
        r._runTick();
        assert.equal(r.matchState.phase, Phase.ROUND_END);
        assert.equal(r.matchState.roundWinner, 'red');
        assert.equal(r.matchState.winsRed, 1);
        // Red won — got WIN_AWARD, blue got LOSS_AWARD
        assert.ok(red.money > redMoneyBefore);
        assert.ok(blue.money > blueMoneyBefore);
        assert.ok(red.money - redMoneyBefore > blue.money - blueMoneyBefore,
            'winners get more money than losers');
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: 3 round wins for red → emits match:final + stops runner', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const statsStub = _stubStats();
    const io = makeFakeIo();
    const r = new ShootoutRunner({ match: makeMatch(), io });
    r.start();
    try {
        // Force the FSM to one tick away from MATCH_END.
        r.matchState.phase    = Phase.ROUND_END;
        r.matchState.winsRed  = WINS_NEEDED;
        r.matchState.winsBlue = 0;
        r.matchState.round    = WINS_NEEDED;
        r.matchState.roundWinner = 'red';
        r.matchState.phaseTimer  = 0;
        // Drive enough fake time for ROUND_END to elapse.
        t.mock.timers.tick((ROUND_END_TIME + 0.2) * 1000);
        assert.equal(r.matchState.phase, Phase.MATCH_END);
        assert.equal(r.matchState.matchWinner, 'red');
        const finalEmit = io.emitted.find(e => e.evt === 'shootout:match:final');
        assert.ok(finalEmit, 'expected match:final emit');
        assert.equal(finalEmit.payload.matchWinner, 'red');
        assert.equal(finalEmit.payload.winsRed, WINS_NEEDED);
        assert.ok(Array.isArray(finalEmit.payload.players));
        assert.equal(finalEmit.payload.players.length, 2);
        const redPlayer  = finalEmit.payload.players.find(p => p.team === 'red');
        const bluePlayer = finalEmit.payload.players.find(p => p.team === 'blue');
        assert.equal(redPlayer.won, true);
        assert.equal(bluePlayer.won, false);
        // Runner should have stopped after final.
        assert.equal(r.started, false);
        // Drain the stats-persist promise so the restore() below
        // happens AFTER the mocked findOneAndUpdate calls land —
        // otherwise the unawaited promise resolves against the real
        // Mongoose model and triggers a 10s buffering timeout.
        await r._statsPromise;
    } finally {
        r.stop();
        t.mock.timers.reset();
        statsStub.mock.restore();
    }
});

test('ShootoutRunner: ROUND_END → next BUY resets player alive=true and HP', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        // Kill blue, drop HP, set up a ROUND_END that's about to elapse.
        const blue = r.players.get(1);
        blue.alive = false;
        const bh = r.damageSystem.getHealth('1');
        bh.hp = 0;
        bh.alive = false;
        r.matchState.phase       = Phase.ROUND_END;
        r.matchState.phaseTimer  = ROUND_END_TIME - 0.01;
        r.matchState.round       = 1;
        r.matchState.winsRed     = 1;
        r.matchState.winsBlue    = 0;
        r.matchState.roundWinner = 'red';

        // Call _runTick directly to step over the threshold.
        r._runTick();
        assert.equal(r.matchState.phase, Phase.BUY);
        assert.equal(r.matchState.round, 2);
        // Players re-alive + HP refilled.
        assert.equal(blue.alive, true);
        const bhAfter = r.damageSystem.getHealth('1');
        assert.equal(bhAfter.hp, 100);
        assert.equal(bhAfter.alive, true);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: round-end with no winner (time-up) gives LOSS_AWARD to both teams', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const red  = r.players.get(0);
        const blue = r.players.get(1);
        const before = { red: red.money, blue: blue.money };
        // Trigger time-up: in LIVE with phaseTimer at the cap.
        r.matchState.phase = Phase.LIVE;
        r.matchState.phaseTimer = 90 - 0.0001;
        r._runTick();
        assert.equal(r.matchState.phase, Phase.ROUND_END);
        assert.equal(r.matchState.roundWinner, null);
        // Both teams get LOSS_AWARD on a time-up (winner == null).
        assert.equal(red.money,  before.red  + 1900);
        assert.equal(blue.money, before.blue + 1900);
    } finally {
        r.stop();
    }
});

// ── Day 3 / Task 3: runner.buyWeapon — unit tests ────────────────────

test('runner.buyWeapon: success during BUY deducts money + stamps loadout', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const p = r.players.get(0);
        const moneyBefore = p.money;
        const res = r.buyWeapon(0, 'REVOLVER');
        assert.equal(res.ok, true);
        assert.equal(res.weaponType, 'REVOLVER');
        assert.equal(res.money, moneyBefore - 600);
        assert.equal(p.money, moneyBefore - 600);
        assert.equal(p.loadout, 'REVOLVER');
    } finally {
        r.stop();
    }
});

test('runner.buyWeapon: not_buy_phase during LIVE', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        const moneyBefore = r.players.get(0).money;
        const res = r.buyWeapon(0, 'REVOLVER');
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'not_buy_phase');
        assert.equal(r.players.get(0).money, moneyBefore);
    } finally {
        r.stop();
    }
});

test('runner.buyWeapon: bad_weapon for unknown type', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const res = r.buyWeapon(0, 'CHEESE_GUN');
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'bad_weapon');
    } finally {
        r.stop();
    }
});

test('runner.buyWeapon: no_money when player cannot afford', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const p = r.players.get(0);
        p.money = 50; // can't afford anything serious
        const res = r.buyWeapon(0, 'AK47'); // price 2500
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'no_money');
        assert.equal(p.money, 50);  // money unchanged
        assert.equal(p.loadout, null);
    } finally {
        r.stop();
    }
});

test('runner.buyWeapon: no_player for unknown slot', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        const res = r.buyWeapon(99, 'REVOLVER');
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'no_player');
    } finally {
        r.stop();
    }
});

test('runner: WIN_AWARD + LOSS_AWARD applied to teams on round end (winners get more)', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        const red  = r.players.get(0);
        const blue = r.players.get(1);
        const redBefore  = red.money;
        const blueBefore = blue.money;
        blue.alive = false;
        r._runTick(); // triggers ROUND_END transition
        // Red won → WIN_AWARD (3000), blue → LOSS_AWARD (1900)
        assert.equal(red.money  - redBefore,  3000);
        assert.equal(blue.money - blueBefore, 1900);
    } finally {
        r.stop();
    }
});

// ── Day 3 / Task 4: ShootoutStats upsert on match:final ──────────────

import { WINS_NEEDED as _WN_RUNNER } from '../../services/games/shootout/sim/match.js';

test('ShootoutRunner: match:final triggers ShootoutStats upsert per human player', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const calls = [];
    const fauMock = mock.method(ShootoutStats, 'findOneAndUpdate', async (query, update) => {
        calls.push({ query, update });
        return { telegramUserId: query?.telegramUserId, totalKills: 5, totalDeaths: 2 };
    });
    try {
        const io = makeFakeIo();
        const r = new ShootoutRunner({ match: makeMatch(), io });
        r.start();
        // Force the FSM to a tick away from MATCH_END (red wins).
        r.matchState.phase    = Phase.ROUND_END;
        r.matchState.winsRed  = _WN_RUNNER;
        r.matchState.winsBlue = 0;
        r.matchState.round    = _WN_RUNNER;
        r.matchState.roundWinner = 'red';
        r.matchState.phaseTimer  = 0;
        // Drive enough fake time for ROUND_END to elapse.
        t.mock.timers.tick(6000);
        // The runner's _emitMatchFinal kicks off persistMatchStats; await
        // the exposed promise so the assertions can read its callbacks.
        await r._statsPromise;
        // Two humans (slot 0 + 1) → 2 inc upserts + 2 recompute upserts = 4
        assert.equal(calls.length, 4);

        const incCalls = calls.filter(c => c.update?.$inc);
        assert.equal(incCalls.length, 2);
        const incForRed  = incCalls.find(c => c.query.telegramUserId === 1);
        const incForBlue = incCalls.find(c => c.query.telegramUserId === 2);
        assert.ok(incForRed && incForBlue);
        // Red won → wins+=1; blue lost → losses+=1
        assert.equal(incForRed.update.$inc.wins, 1);
        assert.equal(incForRed.update.$inc.losses, 0);
        assert.equal(incForBlue.update.$inc.wins, 0);
        assert.equal(incForBlue.update.$inc.losses, 1);
        assert.equal(incForRed.update.$inc.totalMatches, 1);
    } finally {
        fauMock.mock.restore();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: match:final skips bots when persisting stats', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const calls = [];
    const fauMock = mock.method(ShootoutStats, 'findOneAndUpdate', async (query, update) => {
        calls.push({ query, update });
        return { telegramUserId: query?.telegramUserId, totalKills: 0, totalDeaths: 0 };
    });
    try {
        const io = makeFakeIo();
        // One human + auto-bot fill (slot 1 = bot)
        const match = makeMatch({
            members: [
                { telegramUserId: 101, displayName: '@solo', slot: 0, team: 'red' },
            ],
        });
        const r = new ShootoutRunner({ match, io });
        r.start();
        r.matchState.phase    = Phase.ROUND_END;
        r.matchState.winsRed  = _WN_RUNNER;
        r.matchState.winsBlue = 0;
        r.matchState.round    = _WN_RUNNER;
        r.matchState.roundWinner = 'red';
        r.matchState.phaseTimer  = 0;
        t.mock.timers.tick(6000);
        await r._statsPromise;
        // 1 human (the bot is skipped) → 2 calls total (inc + recompute)
        assert.equal(calls.length, 2);
        const incCalls = calls.filter(c => c.update?.$inc);
        assert.equal(incCalls.length, 1);
        assert.equal(incCalls[0].query.telegramUserId, 101);
    } finally {
        fauMock.mock.restore();
        t.mock.timers.reset();
    }
});

// ── 2026-06-08: client-authoritative position ────────────────────────
//
// The server adopts the client's position when (a) the player is human,
// (b) phase is LIVE, and (c) the input frame carries finite clientX/Y/Z.
// Falls back to integrateMovement otherwise — bots and old clients keep
// the previous behaviour byte-for-byte.

test('ShootoutRunner.setInput: clientX/Y/Z fields are stored on lastInput', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        r.setInput(0, {
            seq: 1, moveX: 0, moveZ: 0,
            lookYaw: 1.5, lookPitch: 0.2,
            jump: false, crouch: false,
            clientX: 7.5, clientY: 2.0, clientZ: -3.25,
            clientOnGround: true,
        });
        const p = r.players.get(0);
        assert.equal(p.lastInput.clientX, 7.5);
        assert.equal(p.lastInput.clientY, 2.0);
        assert.equal(p.lastInput.clientZ, -3.25);
        assert.equal(p.lastInput.clientOnGround, true);
    } finally { r.stop(); }
});

test('ShootoutRunner.setInput: missing/NaN clientX coerces to null (fall-back path)', () => {
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    try {
        // No client fields at all
        r.setInput(0, { seq: 1, moveX: 0, moveZ: 0, lookYaw: 0, lookPitch: 0 });
        assert.equal(r.players.get(0).lastInput.clientX, null);
        // NaN partial set — still null, all-or-nothing
        r.setInput(0, { seq: 2, moveX: 0, moveZ: 0, lookYaw: 0, lookPitch: 0,
            clientX: NaN, clientY: 1, clientZ: 1 });
        assert.equal(r.players.get(0).lastInput.clientX, null);
    } finally { r.stop(); }
});

test('ShootoutRunner: tick with valid clientX/Y/Z snaps state to client coords during LIVE', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        // Snap to (12.5, 1.3, 22.0) with yaw=1.4 + crouching
        r.setInput(0, {
            seq: 1, moveX: 0, moveZ: 0,
            lookYaw: 1.4, lookPitch: -0.1,
            jump: false, crouch: true,
            clientX: 12.5, clientY: 1.3, clientZ: 22.0,
            clientOnGround: true,
        });
        t.mock.timers.tick(50);  // a few ticks @ 60Hz
        const s = r.players.get(0).state;
        assert.equal(s.x, 12.5, `expected x=12.5, got ${s.x}`);
        assert.equal(s.y, 1.3,  `expected y=1.3, got ${s.y}`);
        assert.equal(s.z, 22.0, `expected z=22.0, got ${s.z}`);
        assert.equal(s.yaw, 1.4);
        assert.equal(s.pitch, -0.1);
        assert.equal(s.crouching, true);
        assert.equal(s.onGround, true);
        assert.equal(s.vx, 0); assert.equal(s.vy, 0); assert.equal(s.vz, 0);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: tick without clientX falls back to integrateMovement', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        const p = r.players.get(0);
        const startX = p.state.x;
        // No clientX → server integrates with moveZ=1
        r.setInput(0, { seq: 1, moveX: 0, moveZ: 1, lookYaw: -Math.PI / 2 });
        t.mock.timers.tick(1000);
        const dx = p.state.x - startX;
        assert.ok(Math.hypot(dx) > 1, `expected server-integrated motion, got dx=${dx}`);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: clientX is IGNORED during BUY phase (frozen)', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const r = new ShootoutRunner({ match: makeMatch(), io: makeFakeIo() });
    r.start();
    r.matchState.phase = Phase.BUY;
    try {
        const p = r.players.get(0);
        const spawnX = p.state.x;
        const spawnZ = p.state.z;
        r.setInput(0, {
            seq: 1, moveX: 0, moveZ: 0, lookYaw: 0, lookPitch: 0,
            clientX: 99, clientY: 99, clientZ: 99,  // would teleport if honoured
        });
        t.mock.timers.tick(100);
        assert.equal(p.state.x, spawnX, 'must NOT teleport during BUY');
        assert.equal(p.state.z, spawnZ, 'must NOT teleport during BUY');
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

test('ShootoutRunner: bots NEVER use client-auth path (clientX on bot.lastInput is ignored)', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    // 1v1 with only ONE human member — _addBotsForEmptySlots fills slot 1
    // with a real bot.
    const r = new ShootoutRunner({
        match: makeMatch({
            members: [{ telegramUserId: 1, displayName: '@a', slot: 0, team: 'red' }],
        }),
        io: makeFakeIo(),
    });
    r.start();
    r.matchState.phase = Phase.LIVE;
    try {
        const bot = r.players.get(1);
        assert.equal(bot.isBot, true, 'slot 1 should be a bot');
        // Even if a clientX is jammed onto the bot's lastInput, the tick
        // loop must ignore it (bot.bot.computeInput overwrites lastInput
        // before the client-auth branch is checked, and the branch
        // additionally guards on !p.isBot).
        bot.lastInput.clientX = 99; bot.lastInput.clientY = 99; bot.lastInput.clientZ = 99;
        t.mock.timers.tick(100);
        assert.notEqual(bot.state.x, 99, 'bot must not snap to a planted clientX');
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});
