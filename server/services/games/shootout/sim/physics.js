/**
 * Server-side player physics — kinematic capsule + simplified arena AABBs.
 *
 * Day 1 / Task 2 of the Shootout multiplayer build. Pure functions over
 * plain `{x,y,z,vx,vy,vz,yaw,pitch,onGround,crouching}` state — no THREE,
 * no DOM, no Three.js Octree. Testable in node --test in milliseconds.
 *
 * Movement model is a simplified CS:S/Quake source-style:
 *   - On ground: friction drop, then accelerate toward wishDir up to wishspeed
 *   - In air:    bounded air acceleration only
 *   - Gravity:   integrated when off ground
 *   - Jump:      instantaneous upward impulse when on ground
 *
 * Mirrors visual/main.js _runPhysics + _resolveCollision but simplified:
 *   - Collision is against axis-aligned arena bounds (clamp inside outer
 *     rectangle) + a tiny set of AABB cover boxes. The full Three.js
 *     Octree over the GLB is far too heavy to run per-tick on the server
 *     and isn't needed for V1 — bots only need rough cover, humans get
 *     the precise collider client-side via client-side prediction.
 *   - Ground plane at y=0. No ramps, no step-up (Day 1 scope; can refine
 *     later if it feels off).
 *   - No weapon-speed modifier (Day 2 / combat lands weapons; for now
 *     use the table default `maxSpeed`).
 *
 * Spawn positions: `SPAWN_POSITIONS_BY_SLOT[mode][slot]` returns
 * `{x,y,z,yaw}`. Placed in opposite corners of the arena to give each
 * team line-of-sight breathing room. Sourced from the arena memory note
 * (main body X:-20..+20, Y:-25..+30; NE extension X:+20..+30, Y:+10..+30).
 */

import { MOVEMENT_TUNING } from './tuning.js';

// ── Arena bounds (rough world-space AABBs) ───────────────────────────
//
// The "arena map" lives at visual/arena_map.blend (see project memory).
// Numbers below are coarse boxes around the major structures. Goal isn't
// pixel-perfect cover — it's enough to keep the server-authoritative
// player out of obviously-walkable-into-walls states. Refinement comes
// later if telemetry shows desync.

// Outer arena footprint (upside-down L). Day 1 uses the conservative
// inner rectangle that covers the main body; the NE extension is added
// as an explicit allowed-extension. Clamp = clamp inside the union.
export const ARENA_BOUNDS = Object.freeze({
    floorY: 0,
    ceilingY: 30,           // arbitrary — bullets aren't a Day 1 concern
    // Main body of the L
    mainMinX: -25, mainMaxX: 30,
    mainMinZ: -25, mainMaxZ: 30,
});

// AABB cover boxes (axis-aligned). Each has {minX,maxX,minZ,maxZ,maxY}.
// minY is implicitly the floor (0). Coordinates are world-space meters.
// Drawn from project memory's arena layout note + a generous radius so
// the player never tunnels through corners at 4.5 m/s. Day 1: only the 4
// big structures. The center-cube and watchtower clutter is small enough
// to skip for now.
export const COVER_BOXES = Object.freeze([
    // SE Building: X:3-20, Y:-25 to -15 (2 story)
    Object.freeze({ minX: 3,   maxX: 20,  minZ: -25, maxZ: -15, maxY: 8 }),
    // NE Building: X:11-20, Y:0-10 (2 story)
    Object.freeze({ minX: 11,  maxX: 20,  minZ: 0,   maxZ: 10,  maxY: 8 }),
    // Hollow Square: center ~(-2, 19), 11x7 → X:-7.5..3.5, Z:15.5..22.5
    Object.freeze({ minX: -7.5, maxX: 3.5, minZ: 15.5, maxZ: 22.5, maxY: 4 }),
    // Rect Structure: X:15-25, Z:17-23
    Object.freeze({ minX: 15,  maxX: 25,  minZ: 17,  maxZ: 23, maxY: 5 }),
]);

// Spawn positions per mode/slot. Slot 0/2 = red team, slot 1/3 = blue
// team — matches lifecycle.createMatchFromLobby's assignment scheme.
//
// MUST match the client's MP_SPAWN_POSITIONS in visual/main.js — if they
// diverge, the client renders the remote player at the server-tracked
// coords (far away) while the local camera sits at the client-picked
// coords (close), so players literally never see each other on screen.
//
// Close spawns in the SP red-spawn corridor at (15, _, 22) which is
// known-safe walkable ground on this arena.
export const SPAWN_POSITIONS_BY_SLOT = Object.freeze({
    '1v1': Object.freeze([
        Object.freeze({ x: 12, y: 0, z: 22, yaw:  Math.PI / 2 }), // red, facing +X (toward blue)
        Object.freeze({ x: 18, y: 0, z: 22, yaw: -Math.PI / 2 }), // blue, facing -X (toward red)
    ]),
    '2v2': Object.freeze([
        Object.freeze({ x: 12, y: 0, z: 22, yaw:  Math.PI / 2 }), // red 1
        Object.freeze({ x: 18, y: 0, z: 22, yaw: -Math.PI / 2 }), // blue 1
        Object.freeze({ x: 12, y: 0, z: 18, yaw:  Math.PI / 2 }), // red 2
        Object.freeze({ x: 18, y: 0, z: 18, yaw: -Math.PI / 2 }), // blue 2
    ]),
});

/**
 * Initial state for a player at the given mode+slot.
 * Returns a fresh mutable object — runner mutates it in place per tick.
 */
export function spawnStateForSlot(mode, slot) {
    const table = SPAWN_POSITIONS_BY_SLOT[mode];
    if (!table) throw new Error(`spawnStateForSlot: unknown mode "${mode}"`);
    const p = table[slot];
    if (!p) throw new Error(`spawnStateForSlot: no spawn for slot ${slot} in ${mode}`);
    return {
        x: p.x, y: p.y, z: p.z,
        vx: 0, vy: 0, vz: 0,
        yaw: p.yaw, pitch: 0,
        onGround: true,
        crouching: false,
    };
}

/**
 * Neutral input frame — no move, no look-delta, no buttons.
 * Used as the default lastInput before the client's first frame lands.
 */
export function neutralInput() {
    return {
        seq: 0,
        moveX: 0, moveZ: 0,
        lookYaw: 0, lookPitch: 0,
        jump: false, crouch: false,
    };
}

/**
 * Integrate one physics step.
 *
 * @param {object} state    {x,y,z,vx,vy,vz,yaw,pitch,onGround,crouching}
 * @param {object} input    {moveX,moveZ,lookYaw,lookPitch,jump,crouch}
 * @param {number} dt       step size in seconds (e.g. 1/60)
 * @param {object} [tuning] override tuning constants (defaults to MOVEMENT_TUNING)
 * @returns {object} the same `state` object, mutated in place
 */
export function integrateMovement(state, input, dt, tuning = MOVEMENT_TUNING) {
    // Apply look. lookYaw/lookPitch are ABSOLUTE in our protocol — the
    // client sends its current camera angles each frame rather than
    // deltas. That keeps server-side rewind dead-simple for lag-comp
    // (Day 2) and means a dropped input packet doesn't permanently
    // miscalibrate the server's view of the player.
    state.yaw   = Number.isFinite(input.lookYaw)   ? input.lookYaw   : state.yaw;
    state.pitch = Number.isFinite(input.lookPitch) ? input.lookPitch : state.pitch;

    state.crouching = !!input.crouch;

    // Build wishDir in the XZ plane from moveX/moveZ + current yaw.
    // moveZ: +1 = forward (camera direction). moveX: +1 = right.
    // Camera "forward" with yaw=0 points at -Z, matching three.js
    // convention used by visual/main.js (forward = (0,0,-1) rotated by yaw).
    const sinY = Math.sin(state.yaw);
    const cosY = Math.cos(state.yaw);
    const fX = -sinY, fZ = -cosY;  // forward
    const rX =  cosY, rZ = -sinY;  // right (forward rotated -90°)

    let wishX = fX * (input.moveZ || 0) + rX * (input.moveX || 0);
    let wishZ = fZ * (input.moveZ || 0) + rZ * (input.moveX || 0);
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
        wishX /= wishLen;
        wishZ /= wishLen;
    }

    let wishspeed = wishLen > 0 ? tuning.maxSpeed : 0;
    if (state.crouching) wishspeed *= tuning.crouchSpeedMultiplier;

    if (state.onGround) {
        // Friction
        const speed = Math.hypot(state.vx, state.vz);
        if (speed > 0) {
            const drop = Math.max(speed, tuning.groundFriction) * tuning.groundFriction * dt;
            const newSpeed = Math.max(0, speed - drop);
            const scale = newSpeed / speed;
            state.vx *= scale;
            state.vz *= scale;
        }

        // Ground acceleration
        if (wishspeed > 0) {
            const currentSpeed = state.vx * wishX + state.vz * wishZ;
            const addSpeed = wishspeed - currentSpeed;
            if (addSpeed > 0) {
                let accelSpeed = tuning.groundAccel * wishspeed * dt;
                if (accelSpeed > addSpeed) accelSpeed = addSpeed;
                state.vx += wishX * accelSpeed;
                state.vz += wishZ * accelSpeed;
            }
        }

        // Jump
        if (input.jump) {
            state.vy = tuning.jumpImpulse;
            state.onGround = false;
        } else {
            state.vy = tuning.groundContactPullDown;
        }
    } else {
        // Air acceleration
        if (wishspeed > 0) {
            const currentSpeed = state.vx * wishX + state.vz * wishZ;
            const addSpeed = wishspeed - currentSpeed;
            if (addSpeed > 0) {
                let accelSpeed = tuning.airAccel * wishspeed * dt;
                if (accelSpeed > addSpeed) accelSpeed = addSpeed;
                state.vx += wishX * accelSpeed;
                state.vz += wishZ * accelSpeed;
            }
        }
        // Gravity
        state.vy += tuning.gravity * dt;
    }

    // Integrate position
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;

    // Resolve collision (mutates state.x/y/z + flips onGround as needed)
    resolveCollision(state, tuning);

    return state;
}

/**
 * Resolve simplified arena collision in place.
 *
 * - Clamp horizontally inside outer arena rectangle (NE extension
 *   omitted Day 1; can refine later).
 * - Clamp Y >= floorY (kills downward velocity on contact, flags onGround).
 * - Push player out of any cover-box AABB along the shortest axis.
 */
export function resolveCollision(state, tuning = MOVEMENT_TUNING) {
    const r = tuning.capsuleRadius;

    // Horizontal arena clamp
    const minX = ARENA_BOUNDS.mainMinX + r;
    const maxX = ARENA_BOUNDS.mainMaxX - r;
    const minZ = ARENA_BOUNDS.mainMinZ + r;
    const maxZ = ARENA_BOUNDS.mainMaxZ - r;
    if (state.x < minX) { state.x = minX; if (state.vx < 0) state.vx = 0; }
    if (state.x > maxX) { state.x = maxX; if (state.vx > 0) state.vx = 0; }
    if (state.z < minZ) { state.z = minZ; if (state.vz < 0) state.vz = 0; }
    if (state.z > maxZ) { state.z = maxZ; if (state.vz > 0) state.vz = 0; }

    // Floor clamp
    if (state.y <= ARENA_BOUNDS.floorY) {
        state.y = ARENA_BOUNDS.floorY;
        if (state.vy < 0) state.vy = 0;
        state.onGround = true;
    } else {
        state.onGround = false;
    }

    // Cover boxes: push out along the shortest-penetration axis. We treat
    // each box as a vertical pillar — if the capsule's XZ disk overlaps
    // its XZ footprint AND the player's feet are below `maxY`, push the
    // player out along whichever wall is closest.
    for (const box of COVER_BOXES) {
        if (state.y >= box.maxY) continue; // we're on top / above; ignore
        const inX = (state.x + r) > box.minX && (state.x - r) < box.maxX;
        const inZ = (state.z + r) > box.minZ && (state.z - r) < box.maxZ;
        if (!inX || !inZ) continue;

        // Penetration depths on all four walls. Push along the smallest.
        const dEast  = (box.maxX + r) - state.x; // push +X
        const dWest  = state.x - (box.minX - r); // push -X
        const dNorth = (box.maxZ + r) - state.z; // push +Z
        const dSouth = state.z - (box.minZ - r); // push -Z
        const minD = Math.min(dEast, dWest, dNorth, dSouth);
        if (minD === dEast)       { state.x = box.maxX + r; if (state.vx < 0) state.vx = 0; }
        else if (minD === dWest)  { state.x = box.minX - r; if (state.vx > 0) state.vx = 0; }
        else if (minD === dNorth) { state.z = box.maxZ + r; if (state.vz < 0) state.vz = 0; }
        else                      { state.z = box.minZ - r; if (state.vz > 0) state.vz = 0; }
    }
}

export default {
    ARENA_BOUNDS,
    COVER_BOXES,
    SPAWN_POSITIONS_BY_SLOT,
    spawnStateForSlot,
    neutralInput,
    integrateMovement,
    resolveCollision,
};
