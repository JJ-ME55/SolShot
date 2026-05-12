import {
    POINTS_SWISH, POINTS_RIM_IN, POINTS_BACKBOARD_BANK, POINTS_HEAT_CHECK_SWISH,
    HEAT_CHECK_TRIGGER_SWISHES, HEAT_CHECK_TRIGGER_WINDOW_MS, HEAT_CHECK_TIMEOUT_MS,
} from './constants.js';

/**
 * Basketball Hoops — scoring + heat check state machine
 *
 * Pure-function module. Given a sequence of shot results with
 * timestamps, compute per-shot points, whether heat check was active
 * at each shot, and whether the round has ended.
 *
 * Heat check rule (from the design spec):
 *   - 3 swishes within 10 seconds of each other → heat check activates
 *   - While active, every swish is worth +1 (POINTS_HEAT_CHECK_SWISH)
 *   - A non-swish basket (rim_in / bank_in) breaks the streak
 *   - A 10s gap with no swish also breaks it
 *   - A miss (any kind) ends the round entirely
 *
 * One subtle rule: the activating swish itself does NOT get the bonus.
 * Heat check kicks in AFTER 3 swishes, so the 4th+ swish gets the
 * bonus. The activating swish counts as the trigger, not the reward.
 */

/**
 * The state carried between shots within one attempt. Pass an instance
 * into applyShotResult and use the returned state for the next shot.
 */
export function initialHeatCheckState() {
    return {
        active: false,
        lastSwishTimestamp: null,
        // Rolling window of recent swish timestamps. Only the last few
        // matter — anything older than HEAT_CHECK_TRIGGER_WINDOW_MS
        // can't contribute to a fresh activation.
        recentSwishTimestamps: [],
    };
}

/**
 * Apply one shot result to the state, return points + updated state.
 * Treats input state as immutable — returns a fresh state object.
 *
 * @param {object} state - prior heat-check state
 * @param {string} result - 'swish' | 'rim_in' | 'bank_in' | 'rim_out' | 'bank_out' | 'airball'
 * @param {number} timestamp - ms epoch
 * @returns {{
 *   points: number,
 *   heatCheckActive: boolean,
 *   state: object,
 *   roundEnds: boolean,
 * }}
 */
export function applyShotResult(state, result, timestamp) {
    const isSwish = result === 'swish';
    const isRimIn = result === 'rim_in';
    const isBankIn = result === 'bank_in';
    const isMiss = !isSwish && !isRimIn && !isBankIn;

    if (isMiss) {
        return {
            points: 0,
            heatCheckActive: false,
            state: initialHeatCheckState(),
            roundEnds: true,
        };
    }

    // Compute whether heat check is active AT THE TIME OF THIS SHOT.
    // We deactivate if the gap since the last swish is too big — note
    // this happens BEFORE applying the current shot, so the current
    // shot doesn't keep heat check alive just by happening.
    let activeForThisShot = state.active;
    if (activeForThisShot && state.lastSwishTimestamp !== null) {
        if (timestamp - state.lastSwishTimestamp > HEAT_CHECK_TIMEOUT_MS) {
            activeForThisShot = false;
        }
    }

    // Compute the next state based on what just happened.
    let nextActive;
    let nextLastSwish = state.lastSwishTimestamp;
    let nextRecent = state.recentSwishTimestamps;

    if (isSwish) {
        nextLastSwish = timestamp;
        // Roll the trigger window forward — drop anything that's now
        // outside it, then add this swish.
        nextRecent = [...state.recentSwishTimestamps, timestamp]
            .filter(t => timestamp - t <= HEAT_CHECK_TRIGGER_WINDOW_MS);
        // If we hit the trigger count, activate (or stay active).
        nextActive = activeForThisShot || nextRecent.length >= HEAT_CHECK_TRIGGER_SWISHES;
    } else {
        // rim_in / bank_in — basket counts, but the streak breaks.
        nextActive = false;
        nextRecent = [];
    }

    // Award points
    let points;
    if (isSwish) {
        points = activeForThisShot ? POINTS_HEAT_CHECK_SWISH : POINTS_SWISH;
    } else if (isRimIn) {
        points = POINTS_RIM_IN;
    } else {
        points = POINTS_BACKBOARD_BANK;
    }

    return {
        points,
        heatCheckActive: activeForThisShot,
        state: {
            active: nextActive,
            lastSwishTimestamp: nextLastSwish,
            recentSwishTimestamps: nextRecent,
        },
        roundEnds: false,
    };
}

/**
 * Replay all shots in an attempt to compute the final score plus a
 * shot-by-shot breakdown. Useful for verifying scores against logged
 * shots and for analytics. Stops at the first miss (round end).
 *
 * @param {Array<{result: string, timestamp: number}>} shots
 * @returns {{ totalScore: number, breakdown: Array }}
 */
export function scoreAttempt(shots) {
    let state = initialHeatCheckState();
    let totalScore = 0;
    const breakdown = [];

    for (const shot of shots) {
        const r = applyShotResult(state, shot.result, shot.timestamp);
        breakdown.push({
            result: shot.result,
            timestamp: shot.timestamp,
            points: r.points,
            heatCheckActive: r.heatCheckActive,
            roundEnds: r.roundEnds,
        });
        totalScore += r.points;
        state = r.state;
        if (r.roundEnds) break;
    }

    return { totalScore, breakdown };
}
