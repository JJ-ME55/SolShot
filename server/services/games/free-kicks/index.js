/**
 * Free-Kick Madness — public API surface
 *
 * The shapes a socket handler or match-lifecycle caller needs.
 * Internal helpers stay private to their modules.
 *
 * Phase 1.x: physics + shotgen + rules + leaderboard + lifecycle +
 * resolver. Server-side core complete; Phase 2 is the client +
 * standalone playtest repo.
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

export {
    emptyBestScores,
    applyAttemptScore,
    getLeader,
    tiedTopScorers,
    leaderChanged,
} from './leaderboard.js';

export {
    STATES,
    createMatch,
    recordDeposit,
    recordAttempt,
    evaluateWindowDeadline,
    recordOTAttempt,
    evaluateOTRound,
    cancelMatch,
} from './lifecycle.js';

export {
    resolveWindow,
} from './resolver.js';

export * as Constants from './constants.js';
