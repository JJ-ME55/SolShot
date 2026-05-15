/**
 * Free-Kick Madness — public API surface
 *
 * The shapes a socket handler or match-lifecycle caller needs.
 * Internal helpers stay private to their modules.
 *
 * Phase 1: physics module only. shotgen, rules, lifecycle, leaderboard,
 * resolver come in subsequent phases.
 */

export {
    simulateShot,
    validateShotInput,
    ballReleasePos,
    wallGeometry,
    liftCoefficient,
} from './physics.js';

export * as Constants from './constants.js';
