/**
 * Basketball Hoops — backboard movement
 *
 * Deterministic side-to-side oscillation of the backboard (and the
 * hoop rigidly attached to it). Given (attemptSeed, shotIndex, t),
 * returns the backboard's x-offset from its rest position at that
 * exact moment.
 *
 * Why deterministic: same seed + shot index + time produces the same
 * offset for every player. Two players in a wagered match who both
 * reach shot 25 face exactly the same backboard motion at that moment.
 * Pure function, no I/O, no state.
 *
 * Movement model:
 *   - Shots 0-4: stationary (offset = 0)
 *   - Shot 5+:   sinusoidal motion
 *   - Frequency steps up every 5 shots after that
 *   - Amplitude stays fixed; speed grows over time
 *   - attemptSeed shifts the phase so each attempt starts in a slightly
 *     different position (otherwise every attempt would feel identical)
 */

// Shots 0..N-1 are stationary. Shot at index N (the Nth+1 shot) starts
// the motion. Default 5 = first 5 shots stationary, motion begins on
// the 6th.
const STATIONARY_SHOTS = 5;

// Every N shots after motion starts, frequency increases by
// FREQUENCY_INCREMENT. Tuned to feel like a difficulty ramp without
// becoming unplayable until very deep into a run.
const SPEED_RAMP_INTERVAL = 5;
const BASE_FREQUENCY = 0.5;       // Hz at shot STATIONARY_SHOTS
const FREQUENCY_INCREMENT = 0.15; // Hz added per ramp step

const AMPLITUDE_PX = 80;          // max horizontal travel from rest, in px

/**
 * Compute the backboard's x-offset at time t within shot `shotIndex`.
 * Pure function.
 *
 * @param {number} attemptSeed - per-attempt seed (any integer)
 * @param {number} shotIndex - 0-indexed shot number within the attempt
 * @param {number} t - seconds since the shot was released
 * @returns {number} x-offset in pixels (negative = left, positive = right)
 */
export function backboardOffsetX(attemptSeed, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;

    const frequency = frequencyForShot(shotIndex);
    const phase = phaseFromSeed(attemptSeed);

    return AMPLITUDE_PX * Math.sin(2 * Math.PI * frequency * t + phase);
}

/**
 * Instantaneous horizontal velocity of the backboard at the same moment.
 * Useful if we ever want ball-vs-backboard collision to transfer some
 * impulse from the moving target — not used in v1 but included so
 * future tuning has access to it without a refactor.
 *
 * @param {number} attemptSeed
 * @param {number} shotIndex
 * @param {number} t
 * @returns {number} px/s
 */
export function backboardVelocityX(attemptSeed, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;

    const frequency = frequencyForShot(shotIndex);
    const phase = phaseFromSeed(attemptSeed);

    return AMPLITUDE_PX * 2 * Math.PI * frequency
        * Math.cos(2 * Math.PI * frequency * t + phase);
}

function frequencyForShot(shotIndex) {
    const ramps = Math.floor((shotIndex - STATIONARY_SHOTS) / SPEED_RAMP_INTERVAL);
    return BASE_FREQUENCY + ramps * FREQUENCY_INCREMENT;
}

function phaseFromSeed(attemptSeed) {
    // Take a stable fraction of the seed and map it to [0, 2π). We use
    // Math.abs to handle negative seeds and a modulus to keep the
    // numeric range bounded.
    const seed = Math.abs(Math.floor(attemptSeed));
    return (seed % 1000) / 1000 * (2 * Math.PI);
}

export const BACKBOARD_CONSTANTS = Object.freeze({
    STATIONARY_SHOTS,
    SPEED_RAMP_INTERVAL,
    BASE_FREQUENCY,
    FREQUENCY_INCREMENT,
    AMPLITUDE_PX,
});
