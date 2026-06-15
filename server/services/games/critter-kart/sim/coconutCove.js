/**
 * Coconut Cove — server-side track definition. BYTE-IDENTICAL geometry to the
 * client (`src/games/critter-kart/game/tracks/coconutCove.ts`): control points +
 * zone progress ranges MUST match or karts diverge from frame one.
 *
 * Phase rollout (docs/plans/2026-06-15-coconut-port-implementation.md): B1 races
 * the base road + arch bridge + upper deck (widthProfile inert until B2; crabs
 * Phase C; tide/skywalk/boardwalk Phase D). No `trainCrossings` → NO train.
 */
export const COCONUT_COVE = {
    name: 'Coconut Cove',
    halfWidth: 18,
    laps: 3,
    samplesPerSegment: 22,
    speedScale: 1.07, // applied in a later tuning pass; both sides use base TUNING until then (parity-safe)
    widthProfile: [
        { startProgress: 0.55, endProgress: 0.59, halfWidthMult: 0.6 },
        { startProgress: 0.82, endProgress: 0.86, halfWidthMult: 0.62 },
    ],
    archBridgeZone: { startProgress: 0.305, endProgress: 0.35, height: 15 },
    upperDeckZone: {
        startProgress: 0.724, rampUpEnd: 0.740, rampDownStart: 0.762, endProgress: 0.778,
        boostStart: 0.742, boostEnd: 0.756, height: 11, side: 1,
    },
    skywalk: {
        jumpProgress: 0.18, startProgress: 0.195, endProgress: 0.252,
        height: 16, launch: 18, boostStart: 0.235, boostEnd: 0.248,
    },
    crabs: [
        { progress: 0.47, lane: 16, period: 3.2, phase: 0 },
        { progress: 0.68, lane: 17, period: 3.8, phase: 0.4 },
        { progress: 0.91, lane: 16, period: 2.9, phase: 0.7 },
    ],
    tide: { period: 13, floodFrac: 0.5, beachStart: 0.20, beachEnd: 0.227, side: 1 },
    boardwalkZone: { startProgress: 0.545, endProgress: 0.595 },
    control: [
        { x: 536, z: 12 },
        { x: 368, z: 185 },
        { x: 337, z: 256 },
        { x: 294, z: 355 },
        { x: 222, z: 404 },
        { x: 150, z: 390 },
        { x: -72, z: 500 },
        { x: -250, z: 352 },
        { x: -323, z: 376 },
        { x: -383, z: 234 },
        { x: -455, z: 189 },
        { x: -414, z: 68 },
        { x: -575, z: -110 },
        { x: -326, z: -249 },
        { x: -326, z: -364 },
        { x: -176, z: -385 },
        { x: -69, z: -369 },
        { x: 24, z: -441 },
        { x: 172, z: -535 },
        { x: 295, z: -302 },
        { x: 458, z: -239 },
        { x: 509, z: -129 },
    ],
};
