/**
 * SimBot — server-side AI to fill empty match slots.
 *
 * Phase B+C-MP (2026-06-08): expanded from a wander-only placeholder
 * into a real combat AI so MP solo lobbies have something that actually
 * hunts. Mirrors the client-side Bot class (src/bot.js) in spirit but
 * runs inside the server tick loop with simpler primitives (no Three.js,
 * AABB cover-box LOS instead of octree raycasts).
 *
 * State machine:
 *   PATROL — wander toward a random reachable point. Default.
 *   ATTACK — visible player; walk toward them + open fire after
 *            reactionTime has elapsed.
 *   SEARCH — lost LOS to the player; walk toward last-known position;
 *            timeout after huntPersistSec → back to PATROL.
 *   DEAD   — bot.alive=false; computeInput returns neutral.
 *
 * Difficulty scales 3 axes (matches client BOT_DIFFICULTY in
 * BillionaireBonkClub/shootout:visual/main.js):
 *   aimSkill        — close-range base hit chance, falls off with dist
 *   reactionTime    — seconds of continuous sight before first shot
 *   huntPersistSec  — how long SEARCH stays active after losing LOS
 *
 * The runner calls these methods each tick:
 *   bot.tick(state, ctx, dt)          updates state machine + perception
 *   bot.computeInput(state, dt)       returns the input frame (movement)
 *   bot.maybeFire(state)              returns a fire intent or null
 *
 * Where `ctx` carries the world view the bot needs (other players, LOS
 * tester). The runner owns the global picture; the bot owns its
 * decisions. Movement still flows through the same integrateMovement
 * pipeline humans use — physics parity.
 */

import { ARENA_BOUNDS, COVER_BOXES } from './physics.js';

// Wander rectangle — well inside the outer arena rect so bots never camp
// the wall while picking targets.
const WANDER_MIN_X = ARENA_BOUNDS.mainMinX + 3;
const WANDER_MAX_X = ARENA_BOUNDS.mainMaxX - 3;
const WANDER_MIN_Z = ARENA_BOUNDS.mainMinZ + 3;
const WANDER_MAX_Z = ARENA_BOUNDS.mainMaxZ - 3;

const ARRIVE_RADIUS = 1.0;            // m — pick a new wander target when this close
const VIEW_RANGE    = 38;             // m — max distance bot can spot a player
const FOV_DEG       = 130;            // degrees — full FOV (so half-FOV is 65)
const FOV_COS       = Math.cos((FOV_DEG / 2) * Math.PI / 180);
const EYE_HEIGHT    = 1.5;            // m — muzzle / eye origin offset from feet
const FIRE_INTERVAL = 0.16;           // seconds between shots within a burst
const BURST_MIN     = 2;              // shots per burst (lower bound)
const BURST_MAX     = 5;              // shots per burst (upper bound)
const BURST_PAUSE   = 0.55;           // seconds between bursts

// Difficulty table — keep in sync with the client's BOT_DIFFICULTY
// in BillionaireBonkClub/shootout:visual/main.js. Bump both together.
//
// strafeFactor: 4th axis (added 2026-06-08). When ATTACKING, the bot
// adds a perpendicular movement component that scales with this value.
//   0   = pure rush (recruit-style; runs straight at the player)
//   1   = strong side-step (SEAL-style; hard to hit head-on)
// Strafe direction flips every ~1.5s creating a "tactical peek" feel
// without needing a real cover-graph + path planner.
const DIFFICULTY = Object.freeze({
    recruit: { aimSkill: 0.05, reactionTime: 0.90, huntPersistSec: 1.5,  strafeFactor: 0.00 },
    soldier: { aimSkill: 0.15, reactionTime: 0.50, huntPersistSec: 5.0,  strafeFactor: 0.30 },
    veteran: { aimSkill: 0.28, reactionTime: 0.25, huntPersistSec: 10.0, strafeFactor: 0.65 },
    seal:    { aimSkill: 0.42, reactionTime: 0.10, huntPersistSec: 30.0, strafeFactor: 1.00 },
});
export function getDifficultyConfig(id) {
    return DIFFICULTY[id] || DIFFICULTY.soldier;
}

export const BotState = Object.freeze({
    PATROL: 'PATROL', ATTACK: 'ATTACK', SEARCH: 'SEARCH', DEAD: 'DEAD',
});

/**
 * AABB segment intersection — does the segment (a,b) intersect any
 * cover box at the given height plane? Treats each cover box as a
 * volume from y=0 to box.maxY; if the line skims above maxY, returns
 * false (the bot can shoot over low cover).
 *
 * Pure XZ slab test parameterised on t in [0,1]. y handled separately.
 */
function _losBlocked(ax, ay, az, bx, by, bz) {
    for (const c of COVER_BOXES) {
        // Y guard — if both endpoints clear the top, the segment passes
        // over without intersecting (cheap rejection).
        if (ay > c.maxY && by > c.maxY) continue;
        const dx = bx - ax, dz = bz - az;
        let tMin = 0, tMax = 1;
        // X slab
        if (Math.abs(dx) < 1e-9) {
            if (ax < c.minX || ax > c.maxX) continue; // parallel + outside
        } else {
            const t1 = (c.minX - ax) / dx;
            const t2 = (c.maxX - ax) / dx;
            const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
            if (lo > tMin) tMin = lo;
            if (hi < tMax) tMax = hi;
            if (tMin > tMax) continue;
        }
        // Z slab
        if (Math.abs(dz) < 1e-9) {
            if (az < c.minZ || az > c.maxZ) continue;
        } else {
            const t1 = (c.minZ - az) / dz;
            const t2 = (c.maxZ - az) / dz;
            const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
            if (lo > tMin) tMin = lo;
            if (hi < tMax) tMax = hi;
            if (tMin > tMax) continue;
        }
        // We intersected the XZ slab between tMin..tMax. Check that at
        // least one of those points is below the box's maxY.
        const y1 = ay + (by - ay) * tMin;
        const y2 = ay + (by - ay) * tMax;
        if (Math.min(y1, y2) <= c.maxY) return true;
    }
    return false;
}

export class SimBot {
    constructor({ slot, mode, difficulty = 'soldier', rng } = {}) {
        this.slot = slot;
        this.mode = mode;
        this.rng = typeof rng === 'function' ? rng : Math.random;

        // Difficulty config (lookup at construction so a runtime mutation
        // of the table doesn't change live bots mid-match).
        this.difficulty = difficulty;
        const cfg = getDifficultyConfig(difficulty);
        // Per-bot jitter so 3 same-difficulty bots feel non-identical.
        const jitter = (base, span) => base * (1 - span + this.rng() * span * 2);
        this.aimSkill       = jitter(cfg.aimSkill,       0.20);
        this.reactionTime   = jitter(cfg.reactionTime,   0.20);
        this.huntPersistSec = cfg.huntPersistSec;
        this.strafeFactor   = cfg.strafeFactor || 0;
        this.strafeDir      = this.rng() < 0.5 ? -1 : 1; // initial side
        this.strafePhaseSec = 0; // counts up; flips strafeDir at 1.5s

        this.state = BotState.PATROL;
        this.target = null;                // {x, z} for wander/search
        this.lastKnownPlayerPos = null;    // {x, y, z} for SEARCH
        this.searchTimer = 0;

        // Combat timing.
        this.sightTimer  = 0;              // time the current target has been visible
        this.fireCooldown = 0;             // seconds until next shot allowed
        this.burstShotsLeft = 0;           // remaining rounds in current burst
        this.burstPause = 0;               // pause-between-bursts countdown
    }

    /**
     * Pick a fresh wander target uniformly inside the inner rect.
     * Exposed so tests can force a known target without coupling to
     * the PRNG.
     */
    pickTarget() {
        const x = WANDER_MIN_X + this.rng() * (WANDER_MAX_X - WANDER_MIN_X);
        const z = WANDER_MIN_Z + this.rng() * (WANDER_MAX_Z - WANDER_MIN_Z);
        this.target = { x, z };
        return this.target;
    }

    /**
     * Update perception + state machine. Called by the runner BEFORE
     * computeInput each tick.
     *
     * @param {object} state     this bot's player state
     * @param {object} ctx       { targetPlayer: {x,y,z,alive}|null }
     *                           — the runner's pick of "the player this
     *                           bot is hunting". For 1v1 it's just the
     *                           human; for 2v2 the runner can pick the
     *                           nearest live human.
     * @param {number} dt        seconds since last tick
     */
    tick(state, ctx, dt) {
        if (this.state === BotState.DEAD) return;
        if (!ctx || !ctx.targetPlayer) {
            // Nobody to hunt → patrol.
            if (this.state !== BotState.PATROL) {
                this.state = BotState.PATROL;
                this.target = null;
                this.sightTimer = 0;
            }
            this._tickFireTimers(dt);
            return;
        }

        const t = ctx.targetPlayer;
        const visible = t.alive && this._canSee(state, t);

        if (visible) {
            // First sight or sustained sight — bump sightTimer for the
            // reaction-time gate before firing.
            this.sightTimer += dt;
            this.lastKnownPlayerPos = { x: t.x, y: t.y, z: t.z };
            if (this.state !== BotState.ATTACK) {
                this.state = BotState.ATTACK;
                this.target = null;       // discard any wander target
                // Initial burst pacing — small random delay so the bot
                // doesn't shoot the same tick as another bot in sight.
                this.burstShotsLeft = 0;
                this.burstPause = 0;
            }
        } else {
            // Lost sight — start SEARCH timer if we were attacking.
            if (this.state === BotState.ATTACK) {
                this.state = BotState.SEARCH;
                this.searchTimer = this.huntPersistSec;
                this.target = this.lastKnownPlayerPos
                    ? { x: this.lastKnownPlayerPos.x, z: this.lastKnownPlayerPos.z }
                    : null;
                this.sightTimer = 0;
            } else if (this.state === BotState.SEARCH) {
                this.searchTimer -= dt;
                if (this.searchTimer <= 0) {
                    this.state = BotState.PATROL;
                    this.target = null;
                    this.lastKnownPlayerPos = null;
                }
            } else {
                // PATROL with no visible player — reset any stale sight.
                this.sightTimer = 0;
            }
        }
        this._tickFireTimers(dt);
    }

    _tickFireTimers(dt) {
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (this.burstPause   > 0) this.burstPause   -= dt;
        // Strafe-direction phase: flip every 1.5s while in ATTACK so the
        // bot rocks side-to-side instead of charging in a straight line.
        if (this.state === BotState.ATTACK && this.strafeFactor > 0) {
            this.strafePhaseSec += dt;
            if (this.strafePhaseSec >= 1.5) {
                this.strafePhaseSec = 0;
                this.strafeDir = -this.strafeDir;
            }
        } else {
            this.strafePhaseSec = 0;
        }
    }

    /**
     * Visibility check — range + FOV + cover-box LOS.
     */
    _canSee(state, target) {
        const dx = target.x - state.x;
        const dz = target.z - state.z;
        const dist = Math.hypot(dx, dz);
        if (dist > VIEW_RANGE || dist < 1e-3) return dist < 1e-3; // adjacent counts
        // FOV — bot's forward is (-sin yaw, -cos yaw).
        const fx = -Math.sin(state.yaw);
        const fz = -Math.cos(state.yaw);
        const dot = (dx * fx + dz * fz) / dist;
        if (dot < FOV_COS) return false;
        // LOS — cover-box raycast at eye/torso level.
        const eyeY    = state.y + EYE_HEIGHT;
        const torsoY  = target.y + 1.2;
        return !_losBlocked(state.x, eyeY, state.z, target.x, torsoY, target.z);
    }

    /**
     * Movement input for this tick. Same return shape as before so the
     * runner's integrateMovement code stays unchanged. Decision tree
     * branches on this.state.
     */
    computeInput(state, dt) {
        if (this.state === BotState.DEAD) return _neutralInput(state.yaw);

        // Default: face whatever target we have + walk toward it.
        const aimAt = this._currentAimPoint(state);
        const lookYaw = aimAt
            ? Math.atan2(-(aimAt.x - state.x), -(aimAt.z - state.z))
            : state.yaw;
        const walkAt = this._currentWalkPoint(state);

        // No walk target → pick one (PATROL/SEARCH refill).
        if (!walkAt) {
            this.pickTarget();
            return _input(0, 0, lookYaw, false, false);
        }

        const dx = walkAt.x - state.x;
        const dz = walkAt.z - state.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ARRIVE_RADIUS) {
            // Arrived — wander state picks a new target, SEARCH gives up,
            // ATTACK just stops while keeping sight.
            if (this.state === BotState.PATROL) this.pickTarget();
            else if (this.state === BotState.SEARCH && this.searchTimer > 0) {
                // We reached the last-known spot. Keep searching the
                // area until the timer expires.
                this.searchTimer = Math.min(this.searchTimer, 1.0);
                this.pickTarget();
            }
            return _input(0, 0, lookYaw, false, false);
        }
        // ── Tactical strafe (4th difficulty axis) ────────────────────
        // When attacking, blend in a perpendicular side-step component
        // so harder bots are less predictable than a straight-line rush.
        // moveX/moveZ are in the player's LOCAL frame (right/forward),
        // so we just set moveZ=1 forward and moveX=±strafeFactor for the
        // lateral push. integrateMovement combines + normalises them.
        const strafe = this.state === BotState.ATTACK
            ? this.strafeDir * this.strafeFactor
            : 0;
        return _input(strafe, 1, lookYaw, false, false);
    }

    /** Decide where the bot LOOKS (aims). Aim at the live target when
     *  attacking; otherwise just face the walk target. */
    _currentAimPoint(state) {
        if (this.state === BotState.ATTACK && this.lastKnownPlayerPos) {
            return this.lastKnownPlayerPos;
        }
        return this._currentWalkPoint(state);
    }

    /** Where the bot WALKS to this tick — depends on state. */
    _currentWalkPoint(state) {
        if (this.state === BotState.ATTACK) return this.lastKnownPlayerPos;
        if (this.state === BotState.SEARCH) return this.target || this.lastKnownPlayerPos;
        return this.target;
    }

    /**
     * Fire-decision called by the runner each tick. Returns
     *   { fromX,fromY,fromZ, dirX,dirY,dirZ, hitChance }   on fire
     *   null                                              on hold-fire
     *
     * Hit chance scales with aimSkill + distance, mirroring the client.
     * Returning a non-null result deducts the burst shot + sets cooldown.
     */
    maybeFire(state) {
        if (this.state !== BotState.ATTACK || !this.lastKnownPlayerPos) return null;
        if (this.sightTimer < this.reactionTime) return null;
        if (this.fireCooldown > 0) return null;
        if (this.burstShotsLeft <= 0) {
            if (this.burstPause > 0) return null;
            // Start a fresh burst.
            this.burstShotsLeft = BURST_MIN + Math.floor(this.rng() * (BURST_MAX - BURST_MIN + 1));
        }
        const t = this.lastKnownPlayerPos;
        const dx = t.x - state.x;
        const dy = (t.y + 1.4) - (state.y + EYE_HEIGHT);
        const dz = t.z - state.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-3) return null;
        const dirX = dx / dist, dirY = dy / dist, dirZ = dz / dist;
        const upperCap = Math.max(0.28, this.aimSkill * 1.05);
        const hitChance = Math.max(
            0.03,
            Math.min(upperCap, this.aimSkill - dist * 0.005),
        );
        // Consume the shot.
        this.burstShotsLeft -= 1;
        this.fireCooldown = FIRE_INTERVAL;
        if (this.burstShotsLeft <= 0) this.burstPause = BURST_PAUSE;
        return {
            fromX: state.x, fromY: state.y + EYE_HEIGHT, fromZ: state.z,
            dirX, dirY, dirZ,
            hitChance,
        };
    }

    /** Mark this bot dead — stops perception, movement, and fire. */
    markDead() {
        this.state = BotState.DEAD;
        this.target = null;
        this.lastKnownPlayerPos = null;
        this.burstShotsLeft = 0;
        this.fireCooldown = 0;
    }
}

function _input(moveX, moveZ, lookYaw, jump, crouch) {
    return { seq: 0, moveX, moveZ, lookYaw, lookPitch: 0, jump, crouch };
}
function _neutralInput(yaw) { return _input(0, 0, yaw, false, false); }

export default { SimBot, getDifficultyConfig, BotState };
