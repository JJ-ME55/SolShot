/**
 * Basketball Hoops — backboard movement (CLIENT MIRROR)
 *
 * Exact copy of server/services/games/basketball/backboard.js. Both
 * files MUST stay in sync — the server uses this to compute collision
 * timing, the client uses it to render where the backboard is at any
 * moment.
 *
 * Pure function. No I/O.
 */

const STATIONARY_SHOTS = 5;
const SPEED_RAMP_INTERVAL = 5;
const BASE_FREQUENCY = 0.5;
const FREQUENCY_INCREMENT = 0.15;
const AMPLITUDE_PX = 80;

export function backboardOffsetX(attemptSeed, shotIndex, t) {
    if (shotIndex < STATIONARY_SHOTS) return 0;
    const frequency = frequencyForShot(shotIndex);
    const phase = phaseFromSeed(attemptSeed);
    return AMPLITUDE_PX * Math.sin(2 * Math.PI * frequency * t + phase);
}

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
