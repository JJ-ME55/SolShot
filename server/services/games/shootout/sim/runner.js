/**
 * Shootout per-match sim runner.
 *
 * Day 1 / Task 3: tick + snapshot loop landed.
 *
 * - One runner per active match. Constructor takes {match, io}.
 * - start() spins up two intervals:
 *     • TICK_HZ    = 60Hz physics tick. Reads each player's lastInput,
 *       calls integrateMovement, writes back. Pushes the post-step state
 *       into a per-player ring buffer (60 entries) so Day 2 lag-comp can
 *       rewind without re-running the sim.
 *     • SNAPSHOT_HZ = 20Hz broadcast. Builds a snapshot
 *       {tick, tMs, players:[{slot,x,y,z,yaw,pitch,alive}]} and emits to
 *       the match room `match:<matchId>`.
 * - stop() clears both intervals. Idempotent start/stop.
 * - setInput(slot, input) is the hook the socket layer calls when a
 *   shootout:input event lands. Latest-frame-wins per slot — we don't
 *   queue inputs (CK pattern; cheap; server is authoritative).
 *
 * Bots: Task 5 adds SimBot. The runner exposes _addBotsForEmptySlots()
 * which start() calls — if SimBot is available, empty slots get filled.
 *
 * Combat / fire / damage are Day 2. The runner has no concept of HP yet
 * — `alive: true` is hard-coded in the snapshot for now.
 *
 * Room contract: every snapshot/event broadcast goes to `match:<matchId>`.
 * Sockets only enter that room from shootout:joinMatch (gotcha #1 —
 * see socket-io/shootout.js). The runner never calls socket.join itself.
 */

import { integrateMovement, spawnStateForSlot, neutralInput } from './physics.js';
import { MOVEMENT_TUNING } from './tuning.js';
import { SimBot } from './simBot.js';

const TICK_HZ        = 60;
const SNAPSHOT_HZ    = 20;
const TICK_MS        = 1000 / TICK_HZ;
const SNAPSHOT_MS    = 1000 / SNAPSHOT_HZ;
const TICK_DT        = 1 / TICK_HZ;
const RING_CAPACITY  = 60; // 1s of history @ 60Hz — Day 2 lag-comp scratch

export class ShootoutRunner {
    constructor({ match, io }) {
        this.match    = match;
        this.io       = io;
        this.roomName = `match:${match.matchId}`;
        this.started  = false;

        // Per-slot player records. Populated by start(). Keyed by slot
        // (integer 0..cap-1) so we don't have to pair up by telegramUserId
        // on every tick.
        //
        // Shape:
        //   {
        //     slot, telegramUserId, isBot, bot?,
        //     state:      <physics state object, mutated each tick>
        //     lastInput:  <neutral until first shootout:input arrives>
        //     lastInputSeq: number
        //     alive:      boolean (always true for Day 1)
        //     ring:       Array<state-snapshot> length=RING_CAPACITY
        //     ringHead:   number — next write index in ring
        //   }
        this.players = new Map();

        this.tick    = 0;
        this.startMs = 0;
        this._tickInterval     = null;
        this._snapshotInterval = null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    start() {
        if (this.started) return;
        this.started = true;
        this.tick    = 0;
        this.startMs = Date.now();

        // Seed humans
        for (const member of this.match.members) {
            this._addPlayer({
                slot: member.slot,
                telegramUserId: member.telegramUserId,
                isBot: false,
            });
        }

        // Seed bots into empty slots so 1v1 with one human is still a
        // 1v1, not a free roam.
        this._addBotsForEmptySlots();

        // Tick loop — physics step at 60Hz. We use setInterval rather
        // than a self-rescheduling setTimeout because per-match jitter
        // smoothing is cheap and the host server runs ~5 matches max in
        // practice (per CK precedent). Re-evaluate if we ever push past
        // ~50 concurrent matches.
        this._tickInterval = setInterval(() => this._runTick(), TICK_MS);
        // Snapshot broadcast — 20Hz. Separate interval so a slow tick
        // never starves snapshots and vice versa.
        this._snapshotInterval = setInterval(() => this._emitSnapshot(), SNAPSHOT_MS);
    }

    stop() {
        if (this._tickInterval)     { clearInterval(this._tickInterval);     this._tickInterval = null; }
        if (this._snapshotInterval) { clearInterval(this._snapshotInterval); this._snapshotInterval = null; }
        this.started = false;
    }

    // ── Player setup helpers ─────────────────────────────────────────

    _addPlayer({ slot, telegramUserId, isBot, bot, displayName }) {
        const state = spawnStateForSlot(this.match.mode, slot);
        const ring = new Array(RING_CAPACITY).fill(null);
        this.players.set(slot, {
            slot,
            telegramUserId,
            isBot:        !!isBot,
            bot:          bot || null,
            displayName:  displayName || null,
            state,
            lastInput:    neutralInput(),
            lastInputSeq: 0,
            alive:        true,
            ring,
            ringHead:     0,
        });
    }

    _addBotsForEmptySlots() {
        const cap = this.match.cap || this.match.members.length;
        const filled = new Set(this.match.members.map((m) => m.slot));
        let botIndex = 1;
        for (let slot = 0; slot < cap; slot++) {
            if (filled.has(slot)) continue;
            const bot = new SimBot({ slot, mode: this.match.mode });
            this._addPlayer({
                slot,
                telegramUserId: 0,
                isBot: true,
                bot,
                displayName: `BOT ${botIndex++}`,
            });
        }
    }

    // ── Input ────────────────────────────────────────────────────────

    /**
     * Update the latest input for a slot. Called by the socket layer
     * when a shootout:input event arrives. Out-of-order packets (seq <
     * lastInputSeq) are dropped so a late retransmit can't rewind the
     * player's input state.
     */
    setInput(slot, input) {
        const p = this.players.get(slot);
        if (!p) return false;
        const seq = Number.isFinite(input?.seq) ? input.seq : 0;
        if (seq && seq < p.lastInputSeq) return false;
        p.lastInput = {
            seq,
            moveX:     input?.moveX     || 0,
            moveZ:     input?.moveZ     || 0,
            lookYaw:   Number.isFinite(input?.lookYaw)   ? input.lookYaw   : p.lastInput.lookYaw,
            lookPitch: Number.isFinite(input?.lookPitch) ? input.lookPitch : p.lastInput.lookPitch,
            jump:      !!input?.jump,
            crouch:    !!input?.crouch,
        };
        p.lastInputSeq = seq;
        return true;
    }

    // ── Tick loop ────────────────────────────────────────────────────

    _runTick() {
        this.tick += 1;

        for (const p of this.players.values()) {
            // Bots synthesize their own input each tick.
            if (p.isBot && p.bot) {
                p.lastInput = p.bot.computeInput(p.state, TICK_DT);
            }
            integrateMovement(p.state, p.lastInput, TICK_DT, MOVEMENT_TUNING);

            // Push a snapshot into the ring buffer so Day 2 lag-comp
            // can rewind. We store {tick, x, y, z, yaw, pitch} — the
            // bare minimum for hitscan rewind.
            p.ring[p.ringHead] = {
                tick: this.tick,
                x: p.state.x, y: p.state.y, z: p.state.z,
                yaw: p.state.yaw, pitch: p.state.pitch,
            };
            p.ringHead = (p.ringHead + 1) % RING_CAPACITY;
        }
    }

    // ── Snapshot broadcast ───────────────────────────────────────────

    _emitSnapshot() {
        const players = [];
        for (const p of this.players.values()) {
            players.push({
                slot:  p.slot,
                x:     p.state.x,
                y:     p.state.y,
                z:     p.state.z,
                yaw:   p.state.yaw,
                pitch: p.state.pitch,
                alive: p.alive,
            });
        }
        const snap = {
            tick: this.tick,
            tMs:  Date.now() - this.startMs,
            players,
        };
        this.io.to(this.roomName).emit('shootout:match:snapshot', snap);
    }
}

export default { ShootoutRunner };
