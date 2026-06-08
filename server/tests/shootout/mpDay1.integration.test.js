/**
 * Day 1 multiplayer integration — end-to-end socket flow.
 *
 * Two fake sockets connect, host creates a 1v1 lobby, second joins by
 * code, both ready up, host starts the match. Each socket joins the
 * match room, sends a few `shootout:input` frames, and we tick the
 * server enough that snapshot emits land. We assert:
 *   - both sockets ack-received their own match:start with their own
 *     yourSlot (gotcha #5)
 *   - both sockets entered the match room only AFTER joinMatch
 *     (gotcha #1)
 *   - the runner in _activeMatches has the expected matchId
 *   - shootout:input forwards to the runner's per-slot lastInput
 *   - 1s of fake time produces ~20 snapshots and positions advance
 *
 * Mongo is stubbed with the same node:test mock.method pattern used
 * elsewhere in the shootout suite — we never touch a real DB.
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';

import ShootoutLobby from '../../models/ShootoutLobby.js';
import {
    registerShootoutHandlers,
    _activeMatches,
} from '../../socket-io/shootout.js';
import { Phase } from '../../services/games/shootout/sim/match.js';

// ── Fakes ────────────────────────────────────────────────────────────

function makeFakeClient(id) {
    const handlers = new Map();
    return {
        id,
        handlers,
        emits: [],
        joined: [],
        left: [],
        on(evt, fn) { handlers.set(evt, fn); },
        emit(evt, payload) { this.emits.push({ evt, payload }); },
        join(room) { this.joined.push(room); },
        leave(room) { this.left.push(room); },
    };
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

/**
 * Build a stateful fake-Mongoose ShootoutLobby that grows with create()
 * and is returned on findOne() so subsequent service calls (join,
 * ready, start) keep walking the same doc through OPEN → FULL → READY
 * → STARTING. Mirrors the real Mongoose toObject() shape just deeply
 * enough for the service code.
 */
function makeLobbyStore() {
    const store = { docs: [] };

    function wrap(data) {
        const doc = {
            ...data,
            toObject() {
                return {
                    lobbyId: this.lobbyId,
                    code:    this.code,
                    mode:    this.mode,
                    cap:     this.cap,
                    state:   this.state,
                    members: this.members.map((m) => ({ ...m })),
                    hostTelegramUserId: this.hostTelegramUserId,
                    matchId: this.matchId,
                    lastActiveAt: this.lastActiveAt,
                };
            },
            async save() { return this; },
        };
        return doc;
    }

    const createMock = mock.method(ShootoutLobby, 'create', async (data) => {
        const doc = wrap({ ...data });
        store.docs.push(doc);
        return doc;
    });

    const findMock = mock.method(ShootoutLobby, 'findOne', async (query) => {
        if (query?.lobbyId) {
            return store.docs.find((d) => d.lobbyId === query.lobbyId) || null;
        }
        if (query?.code) {
            return store.docs.find((d) => d.code === query.code) || null;
        }
        return null;
    });

    return {
        store,
        restore() {
            createMock.mock.restore();
            findMock.mock.restore();
        },
    };
}

// ── The end-to-end test ─────────────────────────────────────────────

test('Day 1 integration: two-client lobby → match-start → input → snapshots advance positions', async (t) => {
    _activeMatches.clear();
    const lobby = makeLobbyStore();
    t.mock.timers.enable({ apis: ['setInterval'] });

    try {
        // Two clients + a shared io recorder
        const sockA = makeFakeClient('sock-a');
        const sockB = makeFakeClient('sock-b');
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-a', sockA);
        io.sockets.sockets.set('sock-b', sockB);

        registerShootoutHandlers(sockA, io);
        registerShootoutHandlers(sockB, io);

        // 1) Host A creates the 1v1 lobby
        let ackCreate;
        await sockA.handlers.get('shootout:lobby:create')(
            { mode: '1v1', telegramUserId: 101, telegramUsername: 'host' },
            (r) => { ackCreate = r; },
        );
        assert.equal(ackCreate.ok, true);
        const lobbyId = ackCreate.lobbyId;
        const code    = ackCreate.code;

        // 2) Client B joins by code
        let ackJoin;
        await sockB.handlers.get('shootout:lobby:join')(
            { code, telegramUserId: 202, telegramUsername: 'guest' },
            (r) => { ackJoin = r; },
        );
        assert.equal(ackJoin.ok, true);
        assert.equal(ackJoin.lobbyId, lobbyId);

        // 3a) Both pick teams (Phase C, 2026-06-08: members now start
        //     team=null and must explicitly pick before ready-up).
        let ackPickA, ackPickB;
        await sockA.handlers.get('shootout:lobby:pickTeam')(
            { lobbyId, telegramUserId: 101, team: 'red' },
            (r) => { ackPickA = r; },
        );
        await sockB.handlers.get('shootout:lobby:pickTeam')(
            { lobbyId, telegramUserId: 202, team: 'blue' },
            (r) => { ackPickB = r; },
        );
        assert.equal(ackPickA.ok, true);
        assert.equal(ackPickB.ok, true);

        // 3b) Both ready up
        let ackReadyA, ackReadyB;
        await sockA.handlers.get('shootout:lobby:ready')(
            { lobbyId, telegramUserId: 101, ready: true },
            (r) => { ackReadyA = r; },
        );
        await sockB.handlers.get('shootout:lobby:ready')(
            { lobbyId, telegramUserId: 202, ready: true },
            (r) => { ackReadyB = r; },
        );
        assert.equal(ackReadyA.ok, true);
        assert.equal(ackReadyB.ok, true);

        // 4) Host starts the match
        let ackStart;
        await sockA.handlers.get('shootout:lobby:start')(
            { lobbyId, telegramUserId: 101 },
            (r) => { ackStart = r; },
        );
        assert.equal(ackStart.ok, true);
        const matchId = ackStart.matchId;
        assert.ok(matchId.startsWith('match-'));
        assert.ok(_activeMatches.has(matchId), 'runner registered in _activeMatches');

        // Both sockets got their own match:start with their own yourSlot
        // (gotcha #5).
        const aStart = sockA.emits.find((e) => e.evt === 'shootout:match:start');
        const bStart = sockB.emits.find((e) => e.evt === 'shootout:match:start');
        assert.ok(aStart && bStart);
        assert.notEqual(aStart.payload.yourSlot, bStart.payload.yourSlot,
            'each socket sees its own yourSlot');

        // Gotcha #1: NEITHER socket is in the match room until joinMatch.
        const matchRoom = `match:${matchId}`;
        assert.equal(sockA.joined.includes(matchRoom), false);
        assert.equal(sockB.joined.includes(matchRoom), false);

        // 5) Both join the match room (this is where the runner's
        //    snapshot emits would actually reach a real client).
        let ackJoinMatchA, ackJoinMatchB;
        await sockA.handlers.get('shootout:joinMatch')(
            { matchId, telegramUserId: 101 },
            (r) => { ackJoinMatchA = r; },
        );
        await sockB.handlers.get('shootout:joinMatch')(
            { matchId, telegramUserId: 202 },
            (r) => { ackJoinMatchB = r; },
        );
        assert.equal(ackJoinMatchA.ok, true);
        assert.equal(ackJoinMatchB.ok, true);
        assert.ok(sockA.joined.includes(matchRoom));
        assert.ok(sockB.joined.includes(matchRoom));

        // 6) Now we need a live runner. The socket handler creates the
        //    runner but Day 1 brief doesn't auto-start it from the
        //    handler. Start it directly here to drive the sim — Day 2
        //    will wire start() into the match-start flow once we add
        //    countdowns.
        const runner = _activeMatches.get(matchId);
        runner.start();
        // Day 3: force LIVE so input integration is honored. The Day 1
        // integration test predates the FSM and asserts movement
        // immediately; the FSM would otherwise hold us in BUY for 10s.
        runner.matchState.phase = Phase.LIVE;
        // Move both players off the spawn corners — the SP-matched
        // spawn (15, _, 22) clips the Rect Structure cover AABB so
        // a +X motion test wedges against the wall and fails.
        for (const p of runner.players.values()) {
            p.state.x = 0; p.state.z = 0; p.state.y = 1.0;
        }

        try {
            // 7) Each client sends a few input frames. Aim at +X
            //    (yaw=-π/2) so movement is unambiguously rightward.
            const yaw = -Math.PI / 2;
            sockA.handlers.get('shootout:input')({
                matchId, slot: aStart.payload.yourSlot,
                seq: 1, moveX: 0, moveZ: 1, lookYaw: yaw, lookPitch: 0,
            });
            sockB.handlers.get('shootout:input')({
                matchId, slot: bStart.payload.yourSlot,
                seq: 1, moveX: 0, moveZ: 1, lookYaw: yaw, lookPitch: 0,
            });

            // Snapshot start positions for both players from the runner.
            const startA = { ...runner.players.get(aStart.payload.yourSlot).state };
            const startB = { ...runner.players.get(bStart.payload.yourSlot).state };

            // 8) Advance 1 second of fake time → ~60 ticks, ~20 snapshots.
            t.mock.timers.tick(1000);

            // Snapshots emitted to the match room.
            const snaps = io.emitted.filter(
                (e) => e.evt === 'shootout:match:snapshot' && e.room === matchRoom,
            );
            assert.ok(snaps.length >= 18 && snaps.length <= 22,
                `expected ~20 snapshots in 1s, got ${snaps.length}`);

            // Snapshot payload shape
            const snap = snaps[snaps.length - 1].payload;
            assert.ok(Number.isFinite(snap.tick));
            assert.ok(Array.isArray(snap.players));
            assert.equal(snap.players.length, 2);
            const slots = snap.players.map((p) => p.slot).sort();
            assert.deepEqual(slots, [0, 1]);
            for (const p of snap.players) {
                for (const k of ['slot','x','y','z','yaw','pitch','alive']) {
                    assert.ok(k in p, `snapshot player missing ${k}`);
                }
            }

            // Positions actually advanced for both players.
            const endA = runner.players.get(aStart.payload.yourSlot).state;
            const endB = runner.players.get(bStart.payload.yourSlot).state;
            const movedA = Math.hypot(endA.x - startA.x, endA.z - startA.z);
            const movedB = Math.hypot(endB.x - startB.x, endB.z - startB.z);
            assert.ok(movedA > 1, `slot A moved ${movedA}m`);
            assert.ok(movedB > 1, `slot B moved ${movedB}m`);

            // Ring buffers populated.
            const ringA = runner.players.get(aStart.payload.yourSlot).ring;
            assert.ok(ringA[0] !== null, 'slot A ring populated');
        } finally {
            runner.stop();
        }
    } finally {
        lobby.restore();
        _activeMatches.clear();
        t.mock.timers.reset();
    }
});

test('Day 1 integration: 1v1 with one human auto-fills the other slot with a bot', async (t) => {
    _activeMatches.clear();
    const lobby = makeLobbyStore();
    t.mock.timers.enable({ apis: ['setInterval'] });

    try {
        const sockA = makeFakeClient('sock-solo');
        const io = makeFakeIo();
        io.sockets.sockets.set('sock-solo', sockA);
        registerShootoutHandlers(sockA, io);

        // Create + ready + start with only one member — the underlying
        // service requires the lobby to be at-cap (FULL) before transitioning
        // to READY, so we can't drive this through the lobby flow with one
        // human in Day 1. Instead: simulate the runner side directly with a
        // partial match descriptor. Day 2's UI will surface a "play solo
        // against a bot" button that bypasses the lobby cap requirement.
        const { ShootoutRunner } = await import('../../services/games/shootout/sim/runner.js');
        const runner = new ShootoutRunner({
            match: {
                matchId: 'M-solo',
                lobbyId: 'L-solo',
                mode: '1v1',
                cap: 2,
                members: [
                    { telegramUserId: 101, displayName: '@solo', slot: 0, team: 'red' },
                ],
                startedAt: Date.now(),
            },
            io,
        });
        runner.start();
        // Force LIVE — runner starts in BUY which gates bot input.
        runner.matchState.phase = Phase.LIVE;
        try {
            assert.equal(runner.players.size, 2);
            const slots = [...runner.players.values()].map((p) => p.slot).sort();
            assert.deepEqual(slots, [0, 1]);

            const human = [...runner.players.values()].find((p) => !p.isBot);
            const bot   = [...runner.players.values()].find((p) =>  p.isBot);
            assert.ok(human && bot);
            assert.equal(human.telegramUserId, 101);
            assert.equal(bot.telegramUserId, 0);

            const startBot = { ...bot.state };
            t.mock.timers.tick(1500);
            const moved = Math.hypot(bot.state.x - startBot.x, bot.state.z - startBot.z);
            assert.ok(moved > 0.5,
                `expected bot to advance toward its target, traveled ${moved}m`);
        } finally {
            runner.stop();
        }
    } finally {
        lobby.restore();
        _activeMatches.clear();
        t.mock.timers.reset();
    }
});
