/**
 * Quiet hours — pause turn timer overnight so async multi-day matches
 * don't punish players for sleeping.
 *
 * v1 scope: UTC reference timezone, host picks one of three preset
 * windows. Future v2 could add per-chat timezone + custom window picker.
 *
 * Window semantics:
 *   - Hours are 0–23 UTC.
 *   - Window can wrap midnight (e.g. start=23, end=7 means 11pm–7am).
 *   - "Inside the window" = clock hour is in [start, end), with wraparound.
 *
 * Public API:
 *   - isQuietHour(hour, config) → bool
 *   - wakingMsElapsed(start, end, config) → ms of non-quiet time between two Dates
 *   - nextResumeTime(now, config) → Date when current quiet window ends
 */

const HOUR_MS = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/**
 * Is a given hour (0–23) inside the quiet window?
 * Handles midnight-wraparound: start=23, end=7 means 23, 0, 1, 2, 3, 4, 5, 6 are quiet.
 */
export function isQuietHour(hour, config) {
    if (!config?.quietHoursEnabled) return false;
    const { quietHoursStart: s, quietHoursEnd: e } = config;
    if (s === e) return false;                      // empty window
    if (s < e) {
        return hour >= s && hour < e;
    }
    // Wraparound
    return hour >= s || hour < e;
}

/**
 * Returns the ms of "waking" (non-quiet) time elapsed between `start` and `end`.
 * If quiet hours disabled, returns the full elapsed ms.
 *
 * Implementation: walk the interval minute-by-minute. Precise to 1 minute.
 * For multi-day intervals this is up to 7d × 24h × 60min ≈ 10k iterations,
 * fine for the cadence we run this at (per-turn idle check).
 */
export function wakingMsElapsed(start, end, config) {
    const startMs = start instanceof Date ? start.getTime() : start;
    const endMs = end instanceof Date ? end.getTime() : end;
    if (endMs <= startMs) return 0;
    if (!config?.quietHoursEnabled) return endMs - startMs;

    let waking = 0;
    let cursor = startMs;
    while (cursor < endMs) {
        const stepEnd = Math.min(cursor + MS_PER_MINUTE, endMs);
        const hour = new Date(cursor).getUTCHours();
        if (!isQuietHour(hour, config)) {
            waking += stepEnd - cursor;
        }
        cursor = stepEnd;
    }
    return waking;
}

/**
 * If we're currently inside the quiet window, returns the Date when
 * the window ends. Returns null if not in a quiet window or quiet hours disabled.
 *
 * Used by the bot to post "match resumes at X" messages.
 */
export function nextResumeTime(now, config) {
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!config?.quietHoursEnabled) return null;
    const hour = nowDate.getUTCHours();
    if (!isQuietHour(hour, config)) return null;

    // Find the next hour boundary where !isQuietHour. Cap iterations at 24
    // to prevent infinite loops in edge cases.
    let probe = new Date(nowDate);
    probe.setUTCMinutes(0, 0, 0);
    for (let i = 0; i <= 24; i++) {
        probe = new Date(probe.getTime() + HOUR_MS);
        if (!isQuietHour(probe.getUTCHours(), config)) return probe;
    }
    return null;
}

/**
 * Compute the deadline (Date) for a turn to time out, accounting for
 * quiet-hours pauses.
 *
 * Strategy: walk forward from turnStartedAt until we've accumulated
 * `turnTimerMs` of waking time. Returns that Date.
 */
export function computeTurnDeadline(turnStartedAt, turnTimerMs, config) {
    const startMs = turnStartedAt instanceof Date ? turnStartedAt.getTime() : turnStartedAt;
    if (!config?.quietHoursEnabled) return new Date(startMs + turnTimerMs);

    let waking = 0;
    let cursor = startMs;
    // Cap walk at 14 days to prevent infinite loops on misconfigured input
    const maxCursor = startMs + 14 * 24 * HOUR_MS;
    while (waking < turnTimerMs && cursor < maxCursor) {
        const hour = new Date(cursor).getUTCHours();
        if (!isQuietHour(hour, config)) {
            const remainingNeeded = turnTimerMs - waking;
            const stepSize = Math.min(MS_PER_MINUTE, remainingNeeded);
            waking += stepSize;
            cursor += stepSize;
        } else {
            cursor += MS_PER_MINUTE;
        }
    }
    return new Date(cursor);
}

/** Human-readable label for the configured window. */
export function describeWindow(config) {
    if (!config?.quietHoursEnabled) return 'No pause (24/7)';
    const fmt = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
    return `${fmt(config.quietHoursStart)}–${fmt(config.quietHoursEnd)} UTC`;
}
