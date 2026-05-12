/**
 * Basketball Hoops — public API surface
 *
 * The shapes a socket handler or match-lifecycle caller needs.
 * Internal helpers stay private to their modules.
 */

export { simulateShot, validateShotInput } from './physics.js';
export { applyShotResult, initialHeatCheckState, scoreAttempt } from './rules.js';
export { backboardOffsetX, backboardVelocityX, BACKBOARD_CONSTANTS } from './backboard.js';
export * as Constants from './constants.js';
