import {
    LIVES_START, LIVES_MAX,
    POINTS_PER_GOAL, POINTS_PER_PLUS10_BONUS, HEART_LIFE_BONUS,
} from './constants.js';

/**
 * Free-Kick Madness — scoring + life accounting (v0.1)
 *
 * Pure rules layer. Takes a shot result + current run state and
 * returns the deltas + the new state.
 *
 * Run state shape: { score, lives, goalCount, shotsTaken, runEnded }
 *
 * Pure — same inputs always produce the same output.
 */


// ============================================================
// === Result classification ===
// ============================================================

const GOAL_RESULTS = new Set([
    'goal',
    'goal_plus10',
    'goal_heart',
    'goal_plus10_heart',
]);

const MISS_RESULTS = new Set([
    'blocked',
    'over',
    'wide',
    'short',
    'post',
]);

export function isGoal(result) {
    return GOAL_RESULTS.has(result);
}

export function isMiss(result) {
    return MISS_RESULTS.has(result);
}


// ============================================================
// === Initial state ===
// ============================================================

export function initialRunState() {
    return {
        score: 0,
        lives: LIVES_START,
        goalCount: 0,
        shotsTaken: 0,
        runEnded: false,
    };
}


// ============================================================
// === Per-shot resolution ===
// ============================================================

/**
 * Apply a shot result to the current run state.
 *
 * @param {object} state    — current run state (NOT mutated)
 * @param {string} result   — result code from simulateShot()
 * @returns {{
 *   state: object,          — new run state (immutable update)
 *   scoreDelta: number,
 *   livesDelta: number,
 *   runEndedNow: boolean,   — true iff this shot just ended the run
 * }}
 */
export function applyShot(state, result) {
    if (state.runEnded) {
        // No state change after run ends; return zeros.
        return { state, scoreDelta: 0, livesDelta: 0, runEndedNow: false };
    }

    let scoreDelta = 0;
    let livesDelta = 0;
    let goalDelta = 0;

    switch (result) {
        case 'goal':
            scoreDelta = POINTS_PER_GOAL;
            goalDelta = 1;
            break;
        case 'goal_plus10':
            scoreDelta = POINTS_PER_GOAL + POINTS_PER_PLUS10_BONUS;
            goalDelta = 1;
            break;
        case 'goal_heart':
            scoreDelta = POINTS_PER_GOAL;
            goalDelta = 1;
            // Cap life gain at LIVES_MAX.
            livesDelta = (state.lives < LIVES_MAX) ? HEART_LIFE_BONUS : 0;
            break;
        case 'goal_plus10_heart':
            scoreDelta = POINTS_PER_GOAL + POINTS_PER_PLUS10_BONUS;
            goalDelta = 1;
            livesDelta = (state.lives < LIVES_MAX) ? HEART_LIFE_BONUS : 0;
            break;
        case 'blocked':
        case 'over':
        case 'wide':
        case 'short':
        case 'post':
            livesDelta = -1;
            break;
        case 'invalid':
            // Invalid client input — no penalty. Server should still
            // log + alert; gameplay-wise this is a no-op.
            break;
        default:
            // Unknown result code — treat as invalid (no-op) so we
            // don't accidentally end runs from typos. Caller should
            // log this.
            break;
    }

    const livesAfter = Math.max(0, Math.min(LIVES_MAX, state.lives + livesDelta));
    const actualLivesDelta = livesAfter - state.lives;
    const goalCountAfter = state.goalCount + goalDelta;
    const runEnded = livesAfter <= 0;
    const runEndedNow = runEnded && !state.runEnded;

    return {
        state: {
            score: state.score + scoreDelta,
            lives: livesAfter,
            goalCount: goalCountAfter,
            shotsTaken: state.shotsTaken + 1,
            runEnded,
        },
        scoreDelta,
        livesDelta: actualLivesDelta,
        runEndedNow,
    };
}
