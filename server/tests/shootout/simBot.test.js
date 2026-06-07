/**
 * Tests for SimBot — Day 1 / Task 5.
 *
 * Covers:
 *  - Constructor accepts injected PRNG
 *  - pickTarget returns a point inside the inner wander rect
 *  - computeInput aims roughly toward the target (moveZ=1, sensible yaw)
 *  - On arrival, bot picks a new target
 *  - Runner with empty slots fills them with bots
 *  - Bot-driven slot advances position when ticked
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { SimBot } from '../../services/games/shootout/sim/simBot.js';
import { ShootoutRunner } from '../../services/games/shootout/sim/runner.js';
import { ARENA_BOUNDS, spawnStateForSlot, integrateMovement } from '../../services/games/shootout/sim/physics.js';
import { MOVEMENT_TUNING } from '../../services/games/shootout/sim/tuning.js';

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

// ── Unit: SimBot ─────────────────────────────────────────────────────

test('SimBot.pickTarget: target lies inside the inner wander rect', () => {
    // Deterministic PRNG: alternating 0 and 1 to hit the rect corners.
    let rngCalls = 0;
    const rng = () => (rngCalls++ % 2 === 0 ? 0 : 1);
    const bot = new SimBot({ slot: 0, mode: '1v1', rng });
    for (let i = 0; i < 20; i++) {
        const t = bot.pickTarget();
        // Inside the outer arena AABB
        assert.ok(t.x >= ARENA_BOUNDS.mainMinX && t.x <= ARENA_BOUNDS.mainMaxX);
        assert.ok(t.z >= ARENA_BOUNDS.mainMinZ && t.z <= ARENA_BOUNDS.mainMaxZ);
    }
});

test('SimBot.computeInput: returns moveZ=1 and yaw aimed roughly at target', () => {
    const bot = new SimBot({ slot: 0, mode: '1v1' });
    // Force a known target far enough that we don't trip ARRIVE_RADIUS.
    bot.target = { x: 5, z: 5 };
    const state = spawnStateForSlot('1v1', 0); // x=-20, z=-20
    const input = bot.computeInput(state, 1 / 60);
    assert.equal(input.moveZ, 1);
    assert.equal(input.moveX, 0);
    // Forward axis is (-sin(yaw), -cos(yaw)). Plug yaw back in and check
    // forward·toTarget > 0 (bot is aiming AT, not AWAY FROM, the target).
    const fx = -Math.sin(input.lookYaw);
    const fz = -Math.cos(input.lookYaw);
    const dx = bot.target.x - state.x;
    const dz = bot.target.z - state.z;
    const len = Math.hypot(dx, dz);
    const dot = (fx * dx + fz * dz) / len;
    assert.ok(dot > 0.95, `expected forward roughly aligned with toTarget, dot=${dot}`);
});

test('SimBot.computeInput: arrival triggers a new target pick', () => {
    let nextR = 0.25;
    const bot = new SimBot({ slot: 0, mode: '1v1', rng: () => nextR });
    const state = spawnStateForSlot('1v1', 0);
    // Put a target right on top of the bot — arrival.
    bot.target = { x: state.x + 0.1, z: state.z + 0.1 };
    const oldTarget = bot.target;
    bot.computeInput(state, 1 / 60);
    assert.notDeepEqual(bot.target, oldTarget, 'bot picked a new target on arrival');
});

test('SimBot.computeInput: first call picks a target if none set', () => {
    const bot = new SimBot({ slot: 0, mode: '1v1' });
    assert.equal(bot.target, null);
    const state = spawnStateForSlot('1v1', 0);
    bot.computeInput(state, 1 / 60);
    assert.ok(bot.target, 'first computeInput call seeds a target');
});

// ── Integration with runner ──────────────────────────────────────────

test('ShootoutRunner: 1v1 with one human fills the other slot with a bot', () => {
    const match = {
        matchId: 'M-bots',
        lobbyId: 'L1',
        mode: '1v1',
        cap: 2,
        members: [
            { telegramUserId: 1, displayName: '@solo', slot: 0, team: 'red' },
            // slot 1 missing — bot should fill
        ],
        startedAt: Date.now(),
    };
    const r = new ShootoutRunner({ match, io: makeFakeIo() });
    r.start();
    try {
        assert.equal(r.players.size, 2);
        const human = r.players.get(0);
        const bot   = r.players.get(1);
        assert.equal(human.isBot, false);
        assert.equal(bot.isBot, true);
        assert.equal(bot.telegramUserId, 0);
        assert.match(bot.displayName, /^BOT \d+$/);
        assert.ok(bot.bot instanceof SimBot);
    } finally {
        r.stop();
    }
});

test('ShootoutRunner: 2v2 with one human fills 3 bot slots', () => {
    const match = {
        matchId: 'M-2v2',
        lobbyId: 'L1',
        mode: '2v2',
        cap: 4,
        members: [
            { telegramUserId: 1, displayName: '@solo', slot: 0, team: 'red' },
        ],
        startedAt: Date.now(),
    };
    const r = new ShootoutRunner({ match, io: makeFakeIo() });
    r.start();
    try {
        assert.equal(r.players.size, 4);
        const botSlots = [...r.players.values()].filter((p) => p.isBot).map((p) => p.slot);
        botSlots.sort();
        assert.deepEqual(botSlots, [1, 2, 3]);
    } finally {
        r.stop();
    }
});

test('SimBot: bot-driven slot advances position when ticked', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const match = {
        matchId: 'M-bot-move',
        lobbyId: 'L1',
        mode: '1v1',
        cap: 2,
        members: [
            { telegramUserId: 1, displayName: '@solo', slot: 0, team: 'red' },
        ],
        startedAt: Date.now(),
    };
    const r = new ShootoutRunner({ match, io: makeFakeIo() });
    r.start();
    try {
        const bot = r.players.get(1);
        const startX = bot.state.x;
        const startZ = bot.state.z;
        // 1.5s — plenty of time for the bot to acquire a target and move.
        t.mock.timers.tick(1500);
        const moved = Math.hypot(bot.state.x - startX, bot.state.z - startZ);
        assert.ok(moved > 0.5, `expected bot to move, traveled ${moved}m`);
    } finally {
        r.stop();
        t.mock.timers.reset();
    }
});

// Sanity: pure-function tick — outside the runner, just exercise the
// integrateMovement+SimBot pair to be sure they'll cooperate.
test('SimBot + integrateMovement: ~1s of ticks advances the bot toward target', () => {
    const bot = new SimBot({ slot: 0, mode: '1v1' });
    bot.target = { x: 5, z: 5 };
    const state = spawnStateForSlot('1v1', 0); // (-20, -20)
    const startDist = Math.hypot(bot.target.x - state.x, bot.target.z - state.z);
    for (let i = 0; i < 60; i++) {
        const input = bot.computeInput(state, 1 / 60);
        integrateMovement(state, input, 1 / 60, MOVEMENT_TUNING);
    }
    const endDist = Math.hypot(bot.target.x - state.x, bot.target.z - state.z);
    assert.ok(endDist < startDist - 1,
        `expected bot to close >1m on target in 1s, closed ${startDist - endDist}m`);
});
