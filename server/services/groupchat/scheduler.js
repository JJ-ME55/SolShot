/**
 * Group-chat match turn scheduler.
 *
 * Tracks `setTimeout` handles per active match. When a turn timer expires,
 * fires a registered callback (typically lifecycle.handleIdleTimeout).
 *
 * Restart-resilient: on server boot, scan MongoDB for matches in 'active'
 * state, compute each one's quiet-hours-aware deadline, and:
 *   - if deadline is in the past → fire callback immediately (server was
 *     down longer than the turn timer; treat as idle)
 *   - if deadline is in the future → schedule a setTimeout for the
 *     remaining ms
 *
 * State: in-memory map keyed by matchId. NOT persisted (the DB is the
 * source of truth; timers are just an in-memory optimisation that gets
 * rebuilt on boot).
 */

import GroupMatch from '../../models/GroupMatch.js';
import { computeTurnDeadline } from './quietHours.js';

const timers = new Map();                       // matchId → NodeJS.Timeout
let onTimeoutCallback = null;                   // (matchId) => void | Promise<void>

const MAX_SETTIMEOUT_MS = 2_147_483_647;        // ~24.8 days, Node's setTimeout cap

// ─── Callback registration ──────────────────────────────────────────────

/**
 * Register the callback to fire when a turn timer expires.
 * Called from lifecycle.js on module init. Decoupled to avoid an
 * import cycle between scheduler and lifecycle.
 */
export function setOnTimeout(callback) {
    onTimeoutCallback = callback;
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
 * already scheduled for this match, clears it first.
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
        // Fire immediately on next tick.
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
}

/** Clear any scheduled timer for a match. Safe to call when no timer exists. */
export function clearMatchTimer(matchId) {
    const handle = timers.get(matchId);
    if (handle) {
        clearTimeout(handle);
        timers.delete(matchId);
    }
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

// ─── Test / debug helpers ───────────────────────────────────────────────

/** For tests: clear all timers (e.g. between test runs). */
export function _clearAll() {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
}
