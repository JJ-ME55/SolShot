/**
 * RaceRunner — server-authoritative race orchestrator.
 *
 * Composes all of sim/*.js into a tickable race object. Holds N karts,
 * applies per-kart inputs at 60Hz, runs collisions, tracks lap progress,
 * detects finish-line crossings, and emits 20Hz snapshots to the socket
 * layer for broadcast to clients.
 *
 * Created by the socket-layer race driver (replaces Session 1's
 * runCountdownAndRace fake-sleep stub) and consumed by:
 *   runner.applyInput({ kartId, ... })     ← from race:input socket events
 *   runner.start()                          ← post-countdown
 *   runner.stop()                           ← race ended / cancelled
 *
 * Callbacks (set in constructor):
 *   onSnapshot(snapshot)   — 20Hz wire-shape state (broadcast to race room)
 *   onFinish({positions, reason}) — race ended; caller settles + broadcasts final
 *   onError(err)           — tick threw; race aborts
 */

import { TUNING } from './tuning.js';
import { stepKart } from './kartPhysics.js';
import { rampSteer } from './steering.js';
import { TrackPath } from './trackPath.js';
import { initLap, updateLap, isFinished } from './lap.js';
import { rankRacers } from './standings.js';
import { resolveKartCollision } from './collision.js';
import { botInput, makeBotFleet } from './ai.js';
import { SUNNY_MEADOW } from './sunnyMeadow.js';
import { computeItemBoxes, rollCategoryItem, ITEM, NO_ITEM } from './items.js';

const PHYSICS_HZ = 60;
const PHYSICS_DT = 1 / PHYSICS_HZ;
// 30Hz snapshot rate — smaller interpolation distance for the client
// than 20Hz (33ms gap instead of 50ms), so lerped motion stays close to
// truth even when the server's physics make sharp moves (drift snap,
// item hit). PHYSICS_HZ=60 → SNAPSHOT_EVERY_N_TICKS=2. Bandwidth cost is
// trivial (~500B per snapshot × 30 × 6 karts = 90KB/s per match).
const SNAPSHOT_HZ = 30;
const SNAPSHOT_EVERY_N_TICKS = PHYSICS_HZ / SNAPSHOT_HZ;   // 2
const PHYSICS_INTERVAL_MS = 1000 / PHYSICS_HZ;             // ~16.67ms
const MAX_RACE_DURATION_MS = 5 * 60 * 1000;                // 5min hard timeout
const DEFAULT_KART_WEIGHT = 1.0;

export class RaceRunner {
    /**
     * @param {object} opts
     * @param {string} opts.raceId
     * @param {Array} opts.players  — [{kartId, isBot, displayName, weight?, botParamsOverride?}]
     * @param {object} [opts.trackDef=SUNNY_MEADOW]
     * @param {(snapshot: object) => void} [opts.onSnapshot]
     * @param {(result: {positions, reason}) => void} [opts.onFinish]
     * @param {(err: Error) => void} [opts.onError]
     */
    constructor({ raceId, players, trackDef = SUNNY_MEADOW, onSnapshot, onFinish, onError }) {
        this.raceId = raceId;
        this.track = new TrackPath(trackDef);
        this.totalLaps = trackDef.laps;
        this.onSnapshot = onSnapshot ?? null;
        this.onFinish = onFinish ?? null;
        this.onError = onError ?? null;

        // Bot fleet — assign distinct lineOffsets so AI karts don't dogpile
        const botCount = players.filter(p => p.isBot).length;
        const fleet = makeBotFleet(botCount);
        let botIdx = 0;

        // Spawn karts on the staggered start grid (back from start line in
        // 3 rows of 2 — see trackPath.startGrid)
        const grid = this.track.startGrid(players.length);

        this.karts = players.map((p, i) => {
            const startProgress = this.track.nearest(grid[i].x, grid[i].z).progress;
            return {
                kartId: p.kartId,
                displayName: p.displayName,
                isBot: !!p.isBot,
                weight: p.weight ?? DEFAULT_KART_WEIGHT,
                botParams: p.isBot ? (p.botParamsOverride ?? fleet[botIdx++]) : null,

                // Physics state (initialised stationary on the grid)
                state: {
                    x: grid[i].x,
                    z: grid[i].z,
                    heading: grid[i].heading,
                    velHeading: grid[i].heading,
                    speed: 0,
                    driftDir: 0,
                    driftCharge: 0,
                    boostTimer: 0,
                    recoverTimer: 0,
                },

                // Latest input from client (humans) — replaced each race:input,
                // applied at next tick. Bots compute their own.
                input: { throttle: 0, steer: 0, brake: 0, drift: false },
                inputSeq: 0,        // monotonic seq from client for ack
                lastInputAt: 0,     // ms; informational only

                // Smoothed steer (post-ramp) — carried between ticks
                smoothedSteer: 0,

                // Item state (server-authoritative). heldItem = ITEM enum / NO_ITEM;
                // heldCount = shots remaining (Acorn = triple, others = 1).
                heldItem: NO_ITEM,
                heldCount: 0,

                // Lap state + per-lap times
                lap: initLap(startProgress),
                lapTimes: [],
                lapStartTickMs: 0,

                // Finish state
                finished: false,
                finishPosition: null,
                finishTimeMs: null,
            };
        });

        // Item boxes — deterministic layout shared with the client (same
        // ITEM_BOX_ROWS/LAT constants). Each box is "active" (pickable) when
        // now >= boxRespawnAtMs[id]; picking it sets a respawn timer.
        this.boxes = computeItemBoxes(this.track);
        this.boxRespawnAtMs = new Array(this.boxes.length).fill(0);

        // Seeded RNG for item rolls — reproducible per race (future replay/anti-cheat)
        this._rng = mulberry32(hashStr(raceId));

        // Tick bookkeeping
        this.tickNum = 0;
        this.startedAt = null;
        this.tickHandle = null;
        this.timeoutHandle = null;
        this.stopped = false;
    }

    /** Begin the 60Hz tick loop. Resolves when stop() is called. */
    start() {
        if (this.tickHandle) return;
        this.startedAt = Date.now();
        for (const k of this.karts) k.lapStartTickMs = 0;

        // setInterval at 60Hz. Real-world drift between ticks is fine —
        // we use the SCHEDULED dt (PHYSICS_DT) not the wall-clock delta,
        // so the sim is deterministic regardless of jitter. The client's
        // local prediction uses the same fixed dt for matching results.
        this.tickHandle = setInterval(() => this._tickGuarded(), PHYSICS_INTERVAL_MS);
        if (typeof this.tickHandle.unref === 'function') this.tickHandle.unref();

        this.timeoutHandle = setTimeout(() => this._endRace('timeout'), MAX_RACE_DURATION_MS);
        if (typeof this.timeoutHandle.unref === 'function') this.timeoutHandle.unref();
    }

    /** Halt the tick loop. Safe to call multiple times. */
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        if (this.tickHandle) { clearInterval(this.tickHandle); this.tickHandle = null; }
        if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
    }

    /**
     * Apply an input frame from a client (race:input socket event).
     * Clamped + range-checked so a misbehaving client can't fake values
     * outside the sim's expected ranges.
     *
     * @param {object} args
     * @param {string} args.kartId
     * @param {number} [args.seq]
     * @param {number} [args.steer]      -1..1
     * @param {number} [args.throttle]   0..1
     * @param {number} [args.brake]      0..1
     * @param {boolean} [args.drift]
     */
    applyInput({ kartId, seq, steer, throttle, brake, drift }) {
        if (this.stopped) return;
        const kart = this.karts.find(k => k.kartId === kartId);
        if (!kart) return;
        if (kart.isBot) return;   // bots ignore wire input
        if (kart.finished) return; // no further input from finished karts

        // Reject stale inputs (seq going backwards)
        if (typeof seq === 'number' && seq < kart.inputSeq) return;

        kart.input = {
            throttle: clamp01(throttle ?? 0),
            steer: clampNeg1Pos1(steer ?? 0),
            brake: clamp01(brake ?? 0),
            drift: !!drift,
        };
        if (typeof seq === 'number') kart.inputSeq = seq;
        kart.lastInputAt = Date.now();
    }

    /** Convert a kart in-race to bot control (e.g. after disconnect grace). */
    convertKartToBot(kartId) {
        const kart = this.karts.find(k => k.kartId === kartId);
        if (!kart) return;
        if (kart.isBot) return;
        kart.isBot = true;
        kart.botParams = makeBotFleet(1)[0];
    }

    // ── Per-tick orchestration ────────────────────────────────────────

    _tickGuarded() {
        try {
            this._tick();
        } catch (err) {
            this.stop();
            console.warn('[critter-kart] tick threw — aborting race', {
                raceId: this.raceId,
                tick: this.tickNum,
                error: err?.message || err,
            });
            if (this.onError) {
                try { this.onError(err); } catch { /* swallow */ }
            }
        }
    }

    _tick() {
        if (this.stopped) return;
        this.tickNum++;
        const dt = PHYSICS_DT;

        // Phase 1 — per-kart input + physics step
        for (const kart of this.karts) {
            if (kart.finished) continue;

            // On-track + off-road severity (one nearest-call per kart, reused below)
            const near = this.track.nearest(kart.state.x, kart.state.z);
            const halfW = this.track.halfWidth;
            const distOff = Math.max(0, near.distance - halfW);
            const onTrack = distOff === 0;
            // offRoad severity 0..1: 0 at edge, 1 a full half-width past the edge.
            const offRoad = Math.min(1, distOff / halfW);

            // Pick input source: client (humans) or AI (bots)
            let rawInput;
            if (kart.isBot) {
                rawInput = botInput(kart.state, this.track, TUNING, kart.botParams);
            } else {
                rawInput = kart.input;
            }

            // Smooth steer (digital inputs ramp instead of snap)
            kart.smoothedSteer = rampSteer(
                kart.smoothedSteer,
                rawInput.steer ?? 0,
                TUNING.steerRampRate,
                TUNING.steerReturnRate,
                dt,
            );

            const stepInput = {
                throttle: rawInput.throttle ?? 0,
                steer: kart.smoothedSteer,
                brake: rawInput.brake ?? 0,
                drift: rawInput.drift ?? false,
                onTrack,
                offRoad,
            };

            kart.state = stepKart(kart.state, stepInput, TUNING, dt);
        }

        // Phase 2 — kart-kart collisions (O(N²/2), N ≤ 6 → 15 pairs max)
        for (let i = 0; i < this.karts.length; i++) {
            const a = this.karts[i];
            if (a.finished) continue;
            for (let j = i + 1; j < this.karts.length; j++) {
                const b = this.karts[j];
                if (b.finished) continue;
                const result = resolveKartCollision(a.state, b.state, a.weight, b.weight);
                if (result) {
                    a.state = { ...a.state, ...result.a };
                    b.state = { ...b.state, ...result.b };
                }
            }
        }

        // Phase 3 — lap progress + finish detection
        let anyUnfinished = false;
        for (const kart of this.karts) {
            if (kart.finished) continue;
            const near = this.track.nearest(kart.state.x, kart.state.z);
            const prevLap = kart.lap.lap;
            kart.lap = updateLap(kart.lap, near.progress);

            // Lap completed this tick → record lap time
            if (kart.lap.lap > prevLap) {
                const raceElapsedMs = this._elapsedMs();
                const lapTimeMs = raceElapsedMs - kart.lapStartTickMs;
                kart.lapTimes.push(lapTimeMs);
                kart.lapStartTickMs = raceElapsedMs;
            }

            if (isFinished(kart.lap, this.totalLaps)) {
                kart.finished = true;
                kart.finishTimeMs = this._elapsedMs();
            } else {
                anyUnfinished = true;
            }
        }

        // Phase 3.5 — item box pickups (server-authoritative)
        this._applyPickups();

        // Phase 4 — snapshot emit at 20Hz
        if (this.tickNum % SNAPSHOT_EVERY_N_TICKS === 0 && this.onSnapshot) {
            try {
                this.onSnapshot(this._buildSnapshot());
            } catch (err) {
                console.warn('[critter-kart] onSnapshot threw (non-fatal)', {
                    raceId: this.raceId, error: err?.message,
                });
            }
        }

        // Phase 5 — end detection
        if (!anyUnfinished) {
            this._endRace('all_finished');
        }
    }

    // ── Item box pickups ──────────────────────────────────────────────

    /**
     * Server-authoritative pickup: any non-finished kart with no held item
     * that's within itemPickupRadius of an ACTIVE box rolls an item (weighted
     * by current standings position) and arms the box's respawn timer.
     * Mirrors the client pickup loop in GameCanvas exactly.
     */
    _applyPickups() {
        const now = this._elapsedMs();
        const N = this.karts.length;
        // Current standings (best → worst) for position-weighted rolls
        const ranking = rankRacers(this.karts.map(k => ({
            id: k.kartId, lap: k.lap.lap, progress: k.lap.lastProgress,
        })));
        for (const kart of this.karts) {
            if (kart.finished) continue;
            if (kart.heldItem !== NO_ITEM) continue;
            for (let id = 0; id < this.boxes.length; id++) {
                if (now < this.boxRespawnAtMs[id]) continue;
                const box = this.boxes[id];
                if (Math.hypot(kart.state.x - box.x, kart.state.z - box.z) < TUNING.itemPickupRadius) {
                    const pos = ranking.indexOf(kart.kartId) + 1;
                    const rolled = rollCategoryItem(box.category, pos, N, this._rng());
                    kart.heldItem = rolled;
                    kart.heldCount = rolled === ITEM.ACORN ? 3 : 1; // Acorn = triple
                    this.boxRespawnAtMs[id] = now + TUNING.itemBoxRespawn * 1000;
                    break;
                }
            }
        }
    }

    // ── Snapshot generation ───────────────────────────────────────────

    _buildSnapshot() {
        const now = this._elapsedMs();
        const inactiveBoxes = [];
        for (let id = 0; id < this.boxRespawnAtMs.length; id++) {
            if (now < this.boxRespawnAtMs[id]) inactiveBoxes.push(id);
        }
        return {
            raceId: this.raceId,
            tick: this.tickNum,
            tMs: now,
            // Boxes currently respawning — client hides these + renders the rest
            // from the shared layout (so no per-box position needs sending).
            inactiveBoxes,
            karts: this.karts.map(k => ({
                kartId: k.kartId,
                ackSeq: k.inputSeq,
                heldItem: k.heldItem,
                heldCount: k.heldCount,
                // Position + facing — what the client renders
                x: k.state.x,
                z: k.state.z,
                y: k.state.y ?? 0,
                vy: k.state.vy ?? 0,
                heading: k.state.heading,
                velHeading: k.state.velHeading,
                speed: k.state.speed,
                // FX-relevant state
                driftDir: k.state.driftDir,
                boostTimer: k.state.boostTimer,
                stunTimer: k.state.stunTimer ?? 0,
                slowTimer: k.state.slowTimer ?? 0,
                shield: !!k.state.shield,
                // Race standing
                lap: k.lap.lap,
                progress: k.lap.lastProgress,
                finished: k.finished,
            })),
        };
    }

    // ── Race end + final-position computation ─────────────────────────

    _endRace(reason) {
        if (this.stopped) return;
        this.stop();

        // Finishers ranked by finishTimeMs ascending (faster = better position)
        const finishers = this.karts
            .filter(k => k.finished)
            .slice()
            .sort((a, b) => a.finishTimeMs - b.finishTimeMs);

        // Non-finishers (race timed out before they crossed) ranked by
        // (laps, progress) descending — uses the existing standings module
        const nonFinishers = this.karts.filter(k => !k.finished);
        const nonFinisherRanking = rankRacers(nonFinishers.map(k => ({
            id: k.kartId,
            lap: k.lap.lap,
            progress: k.lap.lastProgress,
        })));

        const positions = [];
        for (let i = 0; i < finishers.length; i++) {
            const k = finishers[i];
            positions.push({
                kartId: k.kartId,
                finishPosition: i + 1,
                finishTimeMs: k.finishTimeMs,
                bestLapMs: k.lapTimes.length > 0 ? Math.min(...k.lapTimes) : null,
                lapTimes: k.lapTimes.slice(),
            });
        }
        for (let i = 0; i < nonFinisherRanking.length; i++) {
            const kartId = nonFinisherRanking[i];
            const k = nonFinishers.find(kk => kk.kartId === kartId);
            positions.push({
                kartId,
                finishPosition: finishers.length + i + 1,
                // DNF: stamp the timeout elapsed so downstream career stats
                // can still record a "race played" entry with reasonable
                // bestLap if they got at least one lap in.
                finishTimeMs: this._elapsedMs(),
                bestLapMs: k.lapTimes.length > 0 ? Math.min(...k.lapTimes) : null,
                lapTimes: k.lapTimes.slice(),
            });
        }

        if (this.onFinish) {
            try {
                this.onFinish({ positions, reason });
            } catch (err) {
                console.warn('[critter-kart] onFinish threw', {
                    raceId: this.raceId, error: err?.message,
                });
            }
        }
    }

    _elapsedMs() {
        return this.startedAt ? Date.now() - this.startedAt : 0;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp01(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampNeg1Pos1(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < -1 ? -1 : v > 1 ? 1 : v;
}

// Seeded RNG (mulberry32) + string hash — deterministic item rolls per race.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < String(str).length; i++) {
        h ^= String(str).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Re-exports for the socket layer
export { PHYSICS_HZ, SNAPSHOT_HZ, MAX_RACE_DURATION_MS };
