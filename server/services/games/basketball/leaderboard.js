/**
 * Basketball Hoops — leaderboard state + lead-change detection
 *
 * Pure functions over a `bestScores` map keyed by player wallet.
 * Each entry's shape:
 *   { score: number, attemptId: string, reachedAt: number }
 *
 * "Best score" semantics:
 *   - Update only if the new score is strictly higher. Same-score-
 *     later doesn't overwrite — first to reach a given score holds
 *     the timestamp, which is also the tiebreak rule.
 *
 * Lead-change detection drives the TG group-chat broadcast — we
 * only post when the top-of-leaderboard player actually changes,
 * not on every score update.
 */

export function emptyBestScores() {
    return {};
}

/**
 * Apply an attempt's final score to the leaderboard. Returns a
 * non-mutated copy.
 *
 * @param {object} bestScores
 * @param {string} wallet
 * @param {number} score
 * @param {string} attemptId
 * @param {number} reachedAt - ms epoch when the score was reached
 * @returns {{ bestScores: object, improved: boolean }}
 */
export function applyAttemptScore(bestScores, wallet, score, attemptId, reachedAt) {
    const current = bestScores[wallet];
    if (current && score <= current.score) {
        return { bestScores, improved: false };
    }
    const next = { ...bestScores, [wallet]: { score, attemptId, reachedAt } };
    return { bestScores: next, improved: true };
}

/**
 * Get the current leader. Returns null on an empty leaderboard.
 *
 * Tiebreak: lowest reachedAt wins (first to reach the top score).
 *
 * @param {object} bestScores
 * @returns {{ wallet: string, score: number, attemptId: string, reachedAt: number } | null}
 */
export function getLeader(bestScores) {
    let best = null;
    for (const [wallet, entry] of Object.entries(bestScores)) {
        if (best === null) { best = { wallet, ...entry }; continue; }
        if (entry.score > best.score) {
            best = { wallet, ...entry };
        } else if (entry.score === best.score && entry.reachedAt < best.reachedAt) {
            best = { wallet, ...entry };
        }
    }
    return best;
}

/**
 * Return all wallets tied at the current top score. Sorted for
 * determinism so test assertions don't depend on object iteration
 * order.
 *
 * @param {object} bestScores
 * @returns {string[]}
 */
export function tiedTopScorers(bestScores) {
    const leader = getLeader(bestScores);
    if (!leader) return [];
    return Object.entries(bestScores)
        .filter(([, entry]) => entry.score === leader.score)
        .map(([wallet]) => wallet)
        .sort();
}

/**
 * Did the leader (the single wallet at the top, broken by reachedAt)
 * change between two snapshots?
 *
 * @param {object} prev
 * @param {object} next
 * @returns {boolean}
 */
export function leaderChanged(prev, next) {
    const prevLeader = getLeader(prev);
    const nextLeader = getLeader(next);
    if (prevLeader === null && nextLeader === null) return false;
    if (prevLeader === null || nextLeader === null) return true;
    return prevLeader.wallet !== nextLeader.wallet;
}
