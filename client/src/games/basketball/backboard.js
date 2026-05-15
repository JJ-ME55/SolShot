/**
 * Basketball Hoops — backboard motion (v0.7, client mirror)
 *
 * Mirror of server/services/games/basketball/backboard.js. See that
 * file for full rationale.
 */

const STATIONARY_SHOTS = 5;
// 1.05 m — chosen so the rim's outer edge JUST touches the cage's
// inner panels in the cabinet backdrop at peak sway. Measured: cage
// inner edges sit at canvas x ≈ 121 (L) / 677 (R) at the rim's
// screen-y; rim's rendered outer half-width is ~61 px at k=200; so
// max screen-px offset before the rim hits the cage is ~216 px, which
// at k=200 = 1.08 m world. 1.05 leaves a hair of margin.
const AMPLITUDE_M = 1.05;

// Progressive per-tier speed; mirrors server. The scene accumulates
// `_rimPhase` each frame using frequencyForShot(shotIndex) so the rim
// stays phase-continuous across tier boundaries; physics receives the
// snapshot at shot start and integrates forward.
const TIER_SIZE = 5;
const BASE_FREQUENCY_HZ = 0.05;
const TIER_FREQUENCY_INCREMENT_HZ = 0.025;

const FREQUENCY_HZ = BASE_FREQUENCY_HZ;
const TWO_PI_F = 2 * Math.PI * FREQUENCY_HZ;

export function backboardOffsetX(_seedIgnored, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    return AMPLITUDE_M * Math.sin(TWO_PI_F * t);
}

export function backboardVelocityX(_seedIgnored, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    return AMPLITUDE_M * TWO_PI_F * Math.cos(TWO_PI_F * t);
}

export function frequencyForShot(shotIndex) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    const tier = Math.floor((shotIndex - STATIONARY_SHOTS) / TIER_SIZE);
    return BASE_FREQUENCY_HZ + tier * TIER_FREQUENCY_INCREMENT_HZ;
}

export function backboardOffsetAtPhase(shotIndex, phase) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    return AMPLITUDE_M * Math.sin(phase);
}

export const BACKBOARD_CONSTANTS = Object.freeze({
    STATIONARY_SHOTS,
    AMPLITUDE_M,
    FREQUENCY_HZ,
    TIER_SIZE,
    BASE_FREQUENCY_HZ,
    TIER_FREQUENCY_INCREMENT_HZ,
});
