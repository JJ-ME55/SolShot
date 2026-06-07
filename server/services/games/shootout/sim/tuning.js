/**
 * Shared movement / player tuning constants.
 *
 * Port of c:\Users\jacob\fps-staking-game\visual\main.js (the standalone
 * Three.js client at JJ-ME55/BillionaireBonkClub:shootout). These are
 * the same numbers the client integrates against, lifted verbatim so
 * the server's authoritative sim stays bit-for-bit consistent with
 * what the player feels locally.
 *
 * MUST stay in sync with the client engine file. Bump SOURCE_COMMIT on
 * every re-sync from the standalone repo's master. The client `cfg`
 * object lives inline in the Player class constructor — search for
 * `groundAccel: 100.0` to find it.
 *
 * Port date: 2026-06-07.
 *
 * Source contract (visual/main.js Player ctor):
 *   this.cfg = {
 *     groundAccel: 100.0,
 *     groundFriction: 12.0,
 *     airAccel: 10.0,
 *     maxSpeed: 4.5,      // m/s (was 215 HU/s)
 *     gravity: -20.0,     // m/s^2 (CS:S uses faster-than-real for snappy feel)
 *     jumpImpulse: 5.6,   // m/s (was 270 HU/s)
 *   };
 *   this.playerHeightStanding = 1.8;
 *   this.playerHeightCrouching = 1.2;
 *
 * Notes:
 *  - Distances are meters. Time is seconds.
 *  - `gravity` is negative (downward acceleration). The client integrates
 *    `vel.y += cfg.gravity * dt`.
 *  - `crouchSpeedMultiplier` is 0.75 in the client — wishspeed is
 *    multiplied by 0.75 when the crouch input is held. Pulled out as a
 *    named constant here so server + client stay in lockstep.
 *  - `groundContactPullDown` is the small downward velocity (-0.5 m/s)
 *    the client applies on the ground when not jumping, to keep the
 *    capsule pressed against surfaces without stealing forward momentum
 *    on slopes. Preserved here for parity.
 *  - `capsuleRadius` = 0.35 m. Used for collision in the client; we
 *    expose it so the server's simplified collider matches.
 *  - Per-weapon walk speeds (WEAPON_SPEED_MS) are NOT in scope for
 *    Day 1 (no weapons yet). When weapons land server-side, port that
 *    table too.
 */

export const SOURCE_COMMIT = 'cffd80b7cf5cdfc1044fd082c5156b0780c78e22'; // bump on every Fish-sync

export const MOVEMENT_TUNING = Object.freeze({
    // ── Acceleration / friction ──────────────────────────────────────
    groundAccel:    100.0,      // m/s^2-ish, fed through CS:S accel formula
    groundFriction: 12.0,       // CS:S-style scalar
    airAccel:       10.0,       // m/s^2-ish, air control

    // ── Speeds ───────────────────────────────────────────────────────
    maxSpeed:    4.5,           // m/s, the default wishspeed (no weapon mod)
    jumpImpulse: 5.6,           // m/s, instantaneous upward vel on jump

    // ── Gravity / surface contact ────────────────────────────────────
    gravity:               -20.0, // m/s^2, downward (negative)
    groundContactPullDown: -0.5,  // m/s, applied on ground when not jumping

    // ── Modifiers ────────────────────────────────────────────────────
    crouchSpeedMultiplier: 0.75,  // wishspeed *= 0.75 while crouching

    // ── Player capsule ───────────────────────────────────────────────
    playerHeightStanding:  1.8,   // m
    playerHeightCrouching: 1.2,   // m
    capsuleRadius:         0.35,  // m, used by simplified arena collider
});

export default { SOURCE_COMMIT, MOVEMENT_TUNING };
