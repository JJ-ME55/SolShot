/**
 * Group-chat match turn scheduler.
 *
 * Tracks `setTimeout` handles per active match. When a turn timer expires,
 * fires a registered callback (typically lifecycle.handleIdleTimeout).
 *
 * Also schedules in-turn "chaser" pings at 25% / 50% / 75% of the
 * waking-time deadline so a player who's gone quiet gets a gentle
 * nudge before they actually time out. (Fish + JJ async chat
 * 2026-05-08: a 4-hour turn gets pings at 1h, 2h, 3h then forfeit at
 * 4h.) Chasers honour quiet hours via the same `computeTurnDeadline`
 * walk used for the final deadline — a fraction of the *waking* time
 * rather than wall-clock time, so we don't ping at 3am when the
 * player would never see it anyway.
 *
 * Restart-resilient: on server boot, scan MongoDB for matches in 'active'
 * state, compute each one's quiet-hours-aware deadline, and:
 *   - if deadline is in the past → fire callback immediately (server was
 *     down longer than the turn timer; treat as idle)
 *   - if deadline is in the future → schedule a setTimeout for the
 *     remaining ms
 * Chasers are restored on the same pass, naturally skipping any whose
 * fraction-deadline already lapsed during the downtime.
 *
 * State: in-memory maps keyed by matchId. NOT persisted (the DB is the
 * source of truth; timers are just an in-memory optimisation that gets
 * rebuilt on boot).
 */

import GroupMatch from '../../models/GroupMatch.js';
import { computeTurnDeadline } from './quietHours.js';

const timers = new Map();                       // matchId → NodeJS.Timeout (final deadline)
const chaserTimers = new Map();                 // matchId → Array<NodeJS.Timeout> (in-turn pings)
let onTimeoutCallback = null;                   // (matchId) => void | Promise<void>
let onChaserCallback = null;                    // (matchId, fraction) => void | Promise<void>

const MAX_SETTIMEOUT_MS = 2_147_483_647;        // ~24.8 days, Node's setTimeout cap

// Chaser fractions of `turnTimerMs`. Trio gives "gentle nudge / halfway
// reminder / last call" cadence. Fish's spec was first ping at 50%
// then "every 25% after"; restated as: pings at 25%, 50%, 75% of the
// waking-time budget. Symmetric and predictable.
const CHASER_FRACTIONS = [0.25, 0.50, 0.75];

// Don't chase short timers — keeps fast-paced or test configs from
// becoming a notification spam pipe. 1h floor was JJ's "really gentle"
// brief: if the host configured a 30-minute turn, a 7.5-min chaser
// would feel naggy, not helpful. Default config is 12h so this only
// affects custom-tuned short matches.
const MIN_TIMER_MS_FOR_CHASERS = 60 * 60 * 1000;

// ─── Callback registration ──────────────────────────────────────────────

/**
 * Register the callback to fire when a turn timer expires.
 * Called from lifecycle.js on module init. Decoupled to avoid an
 * import cycle between scheduler and lifecycle.
 */
export function setOnTimeout(callback) {
    onTimeoutCallback = callback;
}

/**
 * Register the callback to fire for in-turn chaser pings.
 * Signature: (matchId, fraction) where fraction is one of the values in
 * CHASER_FRACTIONS (0.25, 0.50, 0.75). Decoupled from lifecycle to
 * avoid the same import cycle as setOnTimeout.
 */
export function setOnChaser(callback) {
    onChaserCallback = callback;
}

// ─── Schedule / clear ───────────────────────────────────────────────────

/**
 * Compute the turn deadline (Date) for a match's current turn, accounting
 * for quiet hours. Returns null if the match isn't in a state with an
 * active turn (e.g. lobby, settled).
 */
export function deadlineFor(match) {
    if (match.state !== 'active' || !match.turnStartedAt) return null;
    return computeTurnDeadline(match.turnStartedAt, match.config.turnTimerMs, match.config);
}

/**
 * Schedule the turn deadline timer for an active match. If a timer is
 * already scheduled for this match, clears it first. Also schedules
 * the in-turn chaser pings at 25/50/75% of the waking-time deadline.
 *
 * If the deadline is in the past, fires the callback immediately.
 */
export function scheduleTurnDeadline(match) {
    if (!match || !match.matchId) return;
    if (match.state !== 'active') return;

    clearMatchTimer(match.matchId);

    const deadline = deadlineFor(match);
    if (!deadline) return;

    const delayMs = deadline.getTime() - Date.now();

    if (delayMs <= 0) {
        // Deadline already passed (server was down longer than the timer).
        // Fire immediately on next tick. Skip chasers — pointless to ping
        // a player whose forfeit is about to land.
        setImmediate(() => fireCallback(match.matchId));
        return;
    }

    if (delayMs > MAX_SETTIMEOUT_MS) {
        // Shouldn't happen for our match durations (max ~7 days + 8h pause
        // per night = ~10 days max), but defend against edge cases by
        // re-scheduling closer to the actual deadline.
        const handle = setTimeout(() => scheduleTurnDeadline(match), MAX_SETTIMEOUT_MS - 1000);
        timers.set(match.matchId, handle);
        return;
    }

    const handle = setTimeout(() => fireCallback(match.matchId), delayMs);
    timers.set(match.matchId, handle);

    // Schedule chaser pings alongside the final deadline. Their fire
    // times are computed via the same quiet-hours walk as the deadline
    // so a 25% chaser on a 4h timer fires at 1h of WAKING time, not 1h
    // of wall-clock (avoids a 3am-during-quiet-hours ping).
    scheduleChasers(match);
}

/**
 * Schedule the per-turn chaser pings (25/50/75% of waking time).
 * Called from scheduleTurnDeadline; also exposed for testing.
 *
 * Skips matches with turnTimerMs below the chaser floor (default 1h)
 * so fast-paced or test configs don't get a chaser every few minutes.
 */
export function scheduleChasers(match) {
    if (!match || !match.matchId) return;
    if (match.state !== 'active') return;
    if (!match.turnStartedAt) return;

    clearChaserTimers(match.matchId);

    const turnTimerMs = match.config?.turnTimerMs;
    if (!turnTimerMs || turnTimerMs < MIN_TIMER_MS_FOR_CHASERS) return;

    const handles = [];
    for (const fraction of CHASER_FRACTIONS) {
        const fractionDeadline = computeTurnDeadline(
            match.turnStartedAt,
            Math.floor(turnTimerMs * fraction),
            match.config,
        );
        const delayMs = fractionDeadline.getTime() - Date.now();

        // Past chasers are skipped (server downtime, late chaser
        // setup, or this fraction already elapsed before we got here).
        // Don't fire stale nudges retroactively — the player either
        // already moved or the next chaser/deadline will catch them.
        if (delayMs <= 0) continue;

        // Defensive: an absurdly long turn (>24 days) could overflow
        // setTimeout. Skip rather than let Node coerce to 1ms.
        if (delayMs > MAX_SETTIMEOUT_MS) continue;

        const handle = setTimeout(() => fireChaser(match.matchId, fraction), delayMs);
        if (typeof handle.unref === 'function') handle.unref();
        handles.push(handle);
    }

    if (handles.length > 0) {
        chaserTimers.set(match.matchId, handles);
    }
}

/** Clear any scheduled chaser timers for a match. Safe to call repeatedly. */
export function clearChaserTimers(matchId) {
    const handles = chaserTimers.get(matchId);
    if (handles) {
        for (const h of handles) clearTimeout(h);
        chaserTimers.delete(matchId);
    }
}

/**
 * Clear any scheduled deadline + chaser timers for a match. Safe to
 * call when no timers exist. Used on turn change (stale timers from
 * the previous turn must die before the new turn's get scheduled),
 * settle, cancel, and forfeit.
 */
export function clearMatchTimer(matchId) {
    const handle = timers.get(matchId);
    if (handle) {
        clearTimeout(handle);
        timers.delete(matchId);
    }
    clearChaserTimers(matchId);
}

/** How many active timers we're currently tracking. For health checks. */
export function activeTimerCount() {
    return timers.size;
}

// ─── Boot recovery ──────────────────────────────────────────────────────

/**
 * Called once on server boot, after Mongoose connects.
 * Loads all matches in 'active' state and re-instantiates their turn
 * timers. Matches whose deadlines have already passed will fire their
 * callback on the next tick (handled inside scheduleTurnDeadline).
 */
export async function restoreActiveTimers() {
    try {
        const active = await GroupMatch.find({ state: 'active' });
        let restored = 0;
        for (const match of active) {
            scheduleTurnDeadline(match);
            restored++;
        }
        if (restored > 0) {
            console.log(`[group-chat] restored ${restored} active match timer${restored === 1 ? '' : 's'}`);
        }
    } catch (err) {
        console.error('[group-chat] restoreActiveTimers failed:', err);
    }
}

// ─── Internal ───────────────────────────────────────────────────────────

async function fireCallback(matchId) {
    timers.delete(matchId);
    // Final deadline reached — kill any straggler chasers from the same
    // turn so the timeout post and a chaser don't land back-to-back.
    clearChaserTimers(matchId);
    if (!onTimeoutCallback) {
        console.warn(`[group-chat] timer fired for ${matchId} but no callback registered`);
        return;
    }
    try {
        await onTimeoutCallback(matchId);
    } catch (err) {
        console.error(`[group-chat] timeout callback for ${matchId} threw:`, err);
    }
}

async function fireChaser(matchId, fraction) {
    if (!onChaserCallback) {
        // No registered handler — silently no-op rather than warn,
        // because chasers are optional and lifecycle may legitimately
        // run without them in tests.
        return;
    }
    try {
        await onChaserCallback(matchId, fraction);
    } catch (err) {
        console.error(`[group-chat] chaser callback for ${matchId} (${Math.round(fraction * 100)}%) threw:`, err);
    }
}

// ─── Test / debug helpers ───────────────────────────────────────────────

/** For tests: clear all timers (e.g. between test runs). */
export function _clearAll() {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
    for (const handles of chaserTimers.values()) {
        for (const h of handles) clearTimeout(h);
    }
    chaserTimers.clear();
}

/** For tests / health checks: how many chaser timers are active across all matches. */
export function activeChaserCount() {
    let total = 0;
    for (const handles of chaserTimers.values()) total += handles.length;
    return total;
}
