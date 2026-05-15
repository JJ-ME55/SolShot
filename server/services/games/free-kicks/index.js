/**
 * Free-Kick Madness — public API surface
 *
 * The shapes a socket handler or match-lifecycle caller needs.
 * Internal helpers stay private to their modules.
 *
 * Phase 1.x: physics + shotgen + rules. lifecycle / leaderboard /
 * resolver come in subsequent phases.
 */

export {
    simulateShot,
    validateShotInput,
    ballReleasePos,
    wallGeometry,
    liftCoefficient,
} from './physics.js';

export {
    generateScenario,
    tierForGoals,
} from './shotgen.js';

export {
    applyShot,
    initialRunState,
    isGoal,
    isMiss,
} from './rules.js';

export * as Constants from './constants.js';
