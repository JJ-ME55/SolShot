/**
 * SimBot — server-side AI to fill empty match slots.
 *
 * Day 1 / Task 5. Simple wander AI: pick a random reachable point on
 * the arena floor, walk toward it, when within ARRIVE_RADIUS pick
 * another. Just enough behavior so a solo human in a 1v1 has someone
 * to look at while we're testing the snapshot loop end-to-end. Combat
 * AI (chase, fire) is Day 2.
 *
 * The runner constructs one SimBot per empty slot and calls
 * `bot.computeInput(state, dt)` each tick. The returned input frame is
 * fed into the same integrateMovement pipeline humans use — physics
 * parity, so behavior on the wire matches what a human would produce.
 *
 * Implementation notes:
 *  - Target XZ stays inside a conservative inner rectangle so bots
 *    don't trivially wedge against the outer arena clamp at slow speed.
 *  - We aim the bot via `lookYaw` set to atan2(dirX, -dirZ) so the
 *    integrateMovement forward axis lines up with our intended dir,
 *    then push moveZ=1 forward. This means the bot drives entirely
 *    through the human input channel — no shortcuts.
 *  - PRNG is injectable for deterministic tests; defaults to Math.random.
 */

import { ARENA_BOUNDS } from './physics.js';

// Conservative wander rectangle — well inside the outer arena rect so
// bots never camp the wall.
const WANDER_MIN_X = ARENA_BOUNDS.mainMinX + 3;
const WANDER_MAX_X = ARENA_BOUNDS.mainMaxX - 3;
const WANDER_MIN_Z = ARENA_BOUNDS.mainMinZ + 3;
const WANDER_MAX_Z = ARENA_BOUNDS.mainMaxZ - 3;

const ARRIVE_RADIUS = 1.0;   // m — pick a new target when this close

export class SimBot {
    constructor({ slot, mode, rng } = {}) {
        this.slot = slot;
        this.mode = mode;
        this.rng = typeof rng === 'function' ? rng : Math.random;
        this.target = null; // {x, z} or null (forces pick on first tick)
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
     * @param {object} state  player state {x,y,z,vx,vy,vz,yaw,pitch,onGround}
     * @param {number} dt     seconds since last tick (unused for Day 1; kept
     *                        in the signature so combat AI can use it)
     * @returns {object}      input frame for integrateMovement
     */
    // eslint-disable-next-line no-unused-vars
    computeInput(state, dt) {
        if (!this.target) this.pickTarget();

        const dx = this.target.x - state.x;
        const dz = this.target.z - state.z;
        const dist = Math.hypot(dx, dz);

        // Arrival → pick a new target. Return a coasting frame this tick
        // (no move) so the bot doesn't immediately spike off in the new
        // direction without acquiring it first.
        if (dist < ARRIVE_RADIUS) {
            this.pickTarget();
            return {
                seq: 0,
                moveX: 0, moveZ: 0,
                lookYaw: state.yaw, lookPitch: 0,
                jump: false, crouch: false,
            };
        }

        // Aim. integrateMovement's forward axis is (-sin(yaw), -cos(yaw)),
        // so to point at (dx, dz) we want
        //   -sin(yaw) = dx/dist   ⇒  sin(yaw) = -dx/dist
        //   -cos(yaw) = dz/dist   ⇒  cos(yaw) = -dz/dist
        //   yaw = atan2(-dx, -dz)
        const yaw = Math.atan2(-dx, -dz);

        return {
            seq: 0,
            moveX: 0, moveZ: 1,        // full forward thrust
            lookYaw: yaw, lookPitch: 0,
            jump: false, crouch: false,
        };
    }
}

export default { SimBot };
