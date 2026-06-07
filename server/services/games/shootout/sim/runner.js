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
import { createHitboxSet, updateHitboxPositions, testHitscan } from './combat.js';
import { DamageSystem } from './damage.js';
import { weaponConfig, WeaponType } from './weapons.js';

const TICK_HZ        = 60;
const SNAPSHOT_HZ    = 20;
const TICK_MS        = 1000 / TICK_HZ;
const SNAPSHOT_MS    = 1000 / SNAPSHOT_HZ;
const TICK_DT        = 1 / TICK_HZ;
const RING_CAPACITY  = 60; // 1s of history @ 60Hz — Day 2 lag-comp scratch

// Day 2 lag-comp: maximum rewind in ticks. 15 ticks @ 60Hz = 250ms,
// matching the brief's cap. Older fire frames are rejected as 'expired'.
const MAX_REWIND_TICKS = 15;
// Day 2 interp delay: 100ms / 6 ticks. Both client and server agree
// to render/resolve 6 ticks behind realtime so snapshots can interpolate.
const INTERP_DELAY_TICKS = 6;

// Approximate Mixamo-skeleton bone heights (meters) relative to feet at
// y=0. Synthesized from the client's PlayerModel proportions — these
// only need to be close enough for chest/head hitboxes to land where
// the visible character is. Crouching scales the standing heights to
// CROUCH_BONE_SCALE.
const BONE_HEIGHTS_STANDING = Object.freeze({
    Head:       1.65,
    Chest:      1.40,
    Spine:      1.15,
    'UpperArm.L': 1.42, 'Hand.L': 0.90,
    'UpperArm.R': 1.42, 'Hand.R': 0.90,
    'Thigh.L':   0.95,  'Foot.L': 0.05,
    'Thigh.R':   0.95,  'Foot.R': 0.05,
});
const CROUCH_BONE_SCALE = 0.7;
// Sideways offset for arms/legs (in meters, applied along the
// yaw-rotated right axis).
const BONE_SIDE_OFFSET = Object.freeze({
    Head: 0, Chest: 0, Spine: 0,
    'UpperArm.L': -0.22, 'Hand.L': -0.30,
    'UpperArm.R':  0.22, 'Hand.R':  0.30,
    'Thigh.L': -0.12, 'Foot.L': -0.12,
    'Thigh.R':  0.12, 'Foot.R':  0.12,
});

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

        // Day 2: per-runner DamageSystem. Slots register on start().
        // Identifier is the slot number coerced to string so the
        // shared client/server damage code can lookup 'local' or any
        // slot consistently.
        this.damageSystem = new DamageSystem();
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
        // Day 2: register each slot in the per-runner DamageSystem so
        // resolveFire can apply HP loss. ID is the slot-as-string to
        // match the shape testHitscan expects in its targets array.
        this.damageSystem.registerPlayer(String(slot));
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
            // Day 2: include HP from the DamageSystem so clients can
            // render victim HP bars + death state.
            const health = this.damageSystem.getHealth(String(p.slot));
            players.push({
                slot:  p.slot,
                x:     p.state.x,
                y:     p.state.y,
                z:     p.state.z,
                yaw:   p.state.yaw,
                pitch: p.state.pitch,
                alive: p.alive && (health ? health.alive : true),
                hp:    health ? health.hp : 100,
                armor: health ? health.armor : 100,
            });
        }
        const snap = {
            tick: this.tick,
            tMs:  Date.now() - this.startMs,
            players,
        };
        this.io.to(this.roomName).emit('shootout:match:snapshot', snap);
    }

    // ── Day 2: lag-comp hitscan ──────────────────────────────────────
    //
    // Look up a player's historical state at a given tick from the
    // ring buffer. Returns null if the tick is outside the available
    // window. The ring is a fixed-size circular buffer keyed by tick
    // count, so the lookup is O(RING_CAPACITY) — fine.
    _historicalStateAtTick(player, tick) {
        if (!player || !Array.isArray(player.ring)) return null;
        for (let i = 0; i < player.ring.length; i++) {
            const entry = player.ring[i];
            if (entry && entry.tick === tick) return entry;
        }
        return null;
    }

    // Synthesize Mixamo-style bone world positions from {x,y,z,yaw,crouching}
    // for the purpose of ray-vs-hitbox testing. Y is feet level (matches
    // physics.js spawn states where y=0 at floor).
    _buildBonePositions(state) {
        const yaw   = state.yaw || 0;
        const sinY  = Math.sin(yaw);
        const cosY  = Math.cos(yaw);
        // Right-vector (perpendicular to yaw forward, in XZ plane)
        // matching physics.js's wishDir math: rX=cosY, rZ=-sinY
        const rX = cosY, rZ = -sinY;
        const heightScale = state.crouching ? CROUCH_BONE_SCALE : 1;

        const out = {};
        for (const bone of Object.keys(BONE_HEIGHTS_STANDING)) {
            const yOffset = BONE_HEIGHTS_STANDING[bone] * heightScale;
            const sOffset = BONE_SIDE_OFFSET[bone] || 0;
            out[bone] = {
                x: state.x + rX * sOffset,
                y: state.y + yOffset,
                z: state.z + rZ * sOffset,
            };
        }
        return out;
    }

    /**
     * Day 2: server-authoritative lag-comp hitscan.
     *
     * Resolves a fire event by rewinding to the shooter's perceived
     * tick (INTERP_DELAY_TICKS behind their fire frame), then
     * intersecting their ray against every OTHER player's historical
     * hitboxes at that tick. On a hit, apply damage via the runner's
     * DamageSystem and return the verdict.
     *
     * @param {number} shooterSlot
     * @param {object} fire
     *   { seq, fromX, fromY, fromZ, dirX, dirY, dirZ, clientTickFired, weaponType }
     * @returns {{ ok: boolean, victim?: number, zone?: string,
     *             damageDealt?: number, killed?: boolean,
     *             isHeadshot?: boolean, reason?: string }}
     */
    resolveFire(shooterSlot, fire) {
        const shooter = this.players.get(shooterSlot);
        if (!shooter) return { ok: false, reason: 'no_shooter' };
        if (!shooter.alive) return { ok: false, reason: 'shooter_dead' };

        const wc = weaponConfig(fire?.weaponType) || weaponConfig(WeaponType.AK47);
        if (!wc) return { ok: false, reason: 'bad_weapon' };

        // ── Determine target tick (lag-comp rewind) ──────────────
        // Clamp the client's reported tick to current — clients can't
        // claim hits in the future. Then step back by INTERP_DELAY_TICKS
        // so the historical state we look at is what the shooter
        // actually saw when they pulled the trigger.
        const clientTick = Number.isFinite(fire?.clientTickFired)
            ? Math.min(fire.clientTickFired, this.tick)
            : this.tick;
        const targetTick = clientTick - INTERP_DELAY_TICKS;
        const rewindAge  = this.tick - targetTick;
        if (rewindAge > MAX_REWIND_TICKS) {
            return { ok: false, reason: 'rewind_expired' };
        }
        if (targetTick < 0) {
            return { ok: false, reason: 'pre_match' };
        }

        // ── Build ray ────────────────────────────────────────────
        // dir must be normalized; defensive normalize even though the
        // client should send a unit vector.
        // Coerce numeric defensively — `Number(undefined) || 0` lets 0
        // pass through cleanly (which `|| 0` would also do; using
        // Number.isFinite guards against NaN from non-numeric junk).
        const dx = Number.isFinite(fire?.dirX) ? fire.dirX : 0;
        const dy = Number.isFinite(fire?.dirY) ? fire.dirY : 0;
        const dz = Number.isFinite(fire?.dirZ) ? fire.dirZ : 0;
        const dirLen = Math.hypot(dx, dy, dz);
        if (dirLen < 1e-6) return { ok: false, reason: 'bad_dir' };
        const ray = {
            origin: {
                x: Number.isFinite(fire?.fromX) ? fire.fromX : 0,
                y: Number.isFinite(fire?.fromY) ? fire.fromY : 0,
                z: Number.isFinite(fire?.fromZ) ? fire.fromZ : 0,
            },
            dir: {
                x: dx / dirLen,
                y: dy / dirLen,
                z: dz / dirLen,
            },
        };

        // ── Build temporary target hitbox sets at historical tick ─
        const targets = [];
        for (const p of this.players.values()) {
            if (p.slot === shooterSlot) continue;
            if (!p.alive) continue;
            const histState = this._historicalStateAtTick(p, targetTick)
                // Fallback to current state if no entry for this tick
                // exists yet (e.g. first 6 ticks of the match).
                || { x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.state.yaw };
            const stateForBones = { ...histState, crouching: p.state.crouching };
            const bones = this._buildBonePositions(stateForBones);
            const hitboxes = createHitboxSet(String(p.slot));
            updateHitboxPositions(hitboxes, bones);
            targets.push({ id: String(p.slot), hitboxes });
        }

        if (targets.length === 0) return { ok: false, reason: 'no_targets' };

        // ── Run hitscan ──────────────────────────────────────────
        const hit = testHitscan(ray.origin, ray.dir, targets, String(shooterSlot));
        if (!hit) return { ok: false, reason: 'miss' };

        // ── Apply damage ─────────────────────────────────────────
        const dmg = this.damageSystem.applyDamage(String(shooterSlot), hit, wc);
        if (!dmg) return { ok: false, reason: 'apply_failed' };

        // Mark player dead in the runner record so snapshots + future
        // hits see the correct alive flag without waiting for the
        // damage system to re-tick.
        const victimSlot = Number(hit.targetId);
        if (dmg.killed) {
            const victim = this.players.get(victimSlot);
            if (victim) victim.alive = false;
        }

        return {
            ok:           true,
            victim:       victimSlot,
            zone:         hit.zone,
            damageDealt:  dmg.damageDealt,
            killed:       !!dmg.killed,
            isHeadshot:   !!dmg.isHeadshot,
            remainingHp:  dmg.remainingHp,
            remainingArmor: dmg.remainingArmor,
        };
    }
}

export default { ShootoutRunner };
