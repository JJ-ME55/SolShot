/**
 * Server-side mirror of Fish's tuning constants — byte-identical to:
 *   The-Arcade/src/games/critter-kart/game/config/tuning.ts
 *
 * MUST stay in sync with that file. If a constant changes there for
 * playtest tuning, change it here too — divergence = server picks
 * different finishing positions than the client's local prediction
 * shows, which manifests as rubber-banding on reconciliation.
 *
 * Port date: 2026-06-04. Source: arcade/critter-kart branch, fishyboy
 * commit 0c8ac388b. If you're updating this file, also bump the
 * 'sourceCommit' field below and tell Fish what you changed so his
 * client tuning can re-sync.
 */

export const SOURCE_COMMIT = '0c8ac388b';   // bump on every Fish-sync

export const TUNING = {
    // longitudinal
    maxSpeed: 56,
    accel: 60,
    brakeAccel: 45,
    reverseMax: 13,
    onTrackFriction: 8,
    offTrackFriction: 24,
    offTrackSpeedMult: 0.52,

    // grip / sliding
    gripBase: 0.2,
    gripAtTopSpeed: 0.06,
    offRoadGripMult: 0.35,
    brakeGripBonus: 0.25,
    slipScrub: 0.9,

    // steering
    turnRate: 1.8,
    peakSpeedFraction: 0.38,
    highSpeedRetention: 0.55,

    // steering input smoothing
    steerRampRate: 6.0,
    steerReturnRate: 9.0,

    // drift / mini-turbo
    driftStartGate: 0.55,
    driftBreakGate: 0.5,
    driftGripMult: 0.25,
    driftTurnBonus: 1.6,
    driftInwardBias: 0.6,
    driftSteerInfluence: 0.55,
    driftScrubMult: 0.35,
    driftEntryKickDeg: 12,
    driftRecoverTime: 0.3,
    driftRecoverRate: 0.12,
    driftTier1: 0.8,
    driftTier2: 1.8,
    driftTier3: 2.7, // keep in lockstep with client tuning.ts (playtest 2026-06-12)
    driftBoostDuration: [0, 0, 0, 0.85],
    boostAccel: 130,
    driftBoostMult: 1.28,

    // items / hits
    spinTime: 1.1,
    hitInvuln: 1.3,
    hitSpeedKeep: 0.2,
    spinRate: 9,
    turboBoost: 1.1,
    stormSlow: 2.2,
    stormSlowMult: 0.55,
    acornSpeed: 75,
    beeSpeed: 80,
    beeLife: 8.0,
    projectileLife: 3.0,
    itemBoxRespawn: 3.0,
    itemPickupRadius: 7,
    hitRadius: 5,

    // barriers
    barrierRestitution: 0.12,
    barrierGlanceKeep: 0.82,

    // jumps
    gravity: 22,
    jumpLaunch: 20,
    jumpMinSpeed: 14,
    rampHeight: 4,
    respawnSpeedKeep: 0.7,

    // slipstream / rocket start / boost feel
    draftRange: 22,
    draftMinDist: 4,
    draftCone: 0.86,
    draftMult: 1.14,
    draftAccel: 40,
    rocketBoost: 1.0,
    rocketWindow: 0.85,
    fovBase: 72,
    fovBoost: 7,

    // chase camera (kept for symmetry; server doesn't use camera values
    // but the constants are part of the canonical TUNING shape that
    // future tooling — replay viewer, devtools — may reference)
    camDistance: 14,
    camHeight: 7,
    camLookAhead: 16,
    camLerp: 0.12,
};
