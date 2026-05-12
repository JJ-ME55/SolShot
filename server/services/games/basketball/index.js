/**
 * Basketball Hoops — public API surface
 *
 * The shapes a socket handler or match-lifecycle caller needs.
 * Internal helpers stay private to their modules.
 */

export { simulateShot, validateShotInput } from './physics.js';
export { applyShotResult, initialHeatCheckState, scoreAttempt } from './rules.js';
export { backboardOffsetX, backboardVelocityX, BACKBOARD_CONSTANTS } from './backboard.js';
export {
    emptyBestScores, applyAttemptScore, getLeader, tiedTopScorers, leaderChanged,
} from './leaderboard.js';
export {
    STATES, createMatch, recordDeposit, recordAttempt,
    evaluateWindowDeadline, recordOTAttempt, evaluateOTRound, cancelMatch,
} from './lifecycle.js';
export { resolveWindow } from './resolver.js';
export * as Constants from './constants.js';
