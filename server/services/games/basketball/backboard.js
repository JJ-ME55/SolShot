/**
 * Basketball Hoops — backboard motion (v0.7)
 *
 * Stationary for the first STATIONARY_SHOTS shots, then smooth
 * sinusoidal sway from shot STATIONARY_SHOTS onwards. Once motion
 * starts it is CONTINUOUS — same constant amplitude + frequency for
 * every shot after that, computed from `t` (seconds since motion
 * began). No per-shot reset.
 *
 * The caller is responsible for tracking when motion started and
 * passing the appropriate `t = wallClockNow - motionStartTime`. The
 * physics + scene both do this so the rim's collision and on-screen
 * positions agree.
 *
 * Function signature keeps a leading unused seed arg for backwards
 * compatibility.
 */

// Shots 0..STATIONARY_SHOTS-1 are stationary (offset = 0). The Nth
// shot (0-indexed = STATIONARY_SHOTS) is the first moving shot.
// v0.7: 5 means the 6th shot is the first to move.
const STATIONARY_SHOTS = 5;

// 1.05 m — chosen so the rim's outer edge JUST touches the cage's
// inner panels in the cabinet backdrop at peak sway. Measured: cage
// inner edges sit at canvas x ≈ 121 (L) / 677 (R) at the rim's
// screen-y; rim's rendered outer half-width is ~61 px at k=200; so
// max screen-px offset before the rim hits the cage is ~216 px, which
// at k=200 = 1.08 m world. 1.05 leaves a hair of margin.
const AMPLITUDE_M = 1.05;

// Progressive speed: rim moves slowly when it first activates (shot 5)
// and speeds up gradually every TIER_SIZE shots. To preserve phase
// continuity across tier boundaries the caller maintains a cumulative
// `phase` value and increments it by `2π · freq(shotIndex) · dt` each
// frame — see scene.js. Frequency table grounded against play feel,
// not a research constant.
const TIER_SIZE = 5;
const BASE_FREQUENCY_HZ = 0.05;          // shots 5–9: period 20 s
const TIER_FREQUENCY_INCREMENT_HZ = 0.025; // each subsequent tier adds this

// Legacy single-frequency value, kept only because the older
// backboardOffsetX(seed, shotIndex, t) signature uses it (and some
// tests still call that path). New code should use frequencyForShot
// + backboardOffsetAtPhase below.
const FREQUENCY_HZ = BASE_FREQUENCY_HZ;
const TWO_PI_F = 2 * Math.PI * FREQUENCY_HZ;

/**
 * Backboard x-offset.
 *
 * @param {*} _seedIgnored - kept for signature compatibility
 * @param {number} shotIndex - 0-indexed shot number; stationary if < STATIONARY_SHOTS
 * @param {number} t - seconds since motion began
 * @returns {number} x offset in metres
 */
export function backboardOffsetX(_seedIgnored, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    return AMPLITUDE_M * Math.sin(TWO_PI_F * t);
}

export function backboardVelocityX(_seedIgnored, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    return AMPLITUDE_M * TWO_PI_F * Math.cos(TWO_PI_F * t);
}

/**
 * Frequency (Hz) for a given shot. 0 while still stationary; then
 * BASE + TIER_INCREMENT · floor((shotIndex − STATIONARY_SHOTS) /
 * TIER_SIZE). Used by both the scene's phase accumulator (each
 * frame) and physics (within a single shot's simulation).
 */
export function frequencyForShot(shotIndex) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    const tier = Math.floor((shotIndex - STATIONARY_SHOTS) / TIER_SIZE);
    return BASE_FREQUENCY_HZ + tier * TIER_FREQUENCY_INCREMENT_HZ;
}

/**
 * Backboard x-offset given a cumulative phase value (radians). The
 * caller is responsible for integrating phase across tiers so the
 * sinusoid stays continuous when frequency changes at shot boundaries.
 */
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
