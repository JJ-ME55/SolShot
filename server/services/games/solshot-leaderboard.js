/**
 * SolShot leaderboard service — K/D + Win% scorecard model.
 *
 * Unlike basketball / keepie-uppies / free-kicks (single best-score per
 * user), SolShot is a wagered PvP artillery game where each player's
 * ranking surface is their match record + K/D ratio + win rate.
 *
 * This service derives those metrics from User.stats and serves the
 * Arcade leaderboard's SolShot tab via:
 *
 *   GET /api/games/solshot/leaderboard?limit=10&minMatches=10
 *   GET /api/games/solshot/standing/:telegramUserId
 *
 * Ranking sort: K/D desc → Win% desc → matchesPlayed desc (most matches
 * = most reliable signal at the same ratio). Min match threshold filters
 * out new players with tiny denominators.
 *
 * Why not on-server points: SolShot doesn't have a "score" per match —
 * it has wins/losses/kills/deaths. Cumulative kills would reward
 * grinders (Rule 2 violation in the V3 north star). Rate-based metrics
 * (K/D, W%) are bot-resistant by construction.
 */

import User from '../../models/User.js';

/**
 * Top-N SolShot players by K/D ratio.
 *
 * @param {Object} [args]
 * @param {number} [args.limit=10]
 * @param {number} [args.minMatches=1]  Filter out players with fewer
 *   than this many matches. Default 1 means anyone who has played at
 *   least once appears. Bumped down from 10 (2026-06-03) — the higher
 *   threshold was hiding 80%+ of the SolShot roster from the Arcade
 *   leaderboard surface. K/D normalisation (`max(1, deaths)`) already
 *   handles the 1-0 infinity case so 1-match players don't break the
 *   sort.
 * @returns {Promise<Array>}
 */
export async function getSolShotLeaderboard({ limit = 10, minMatches = 1 } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const minM = Math.max(1, Math.floor(minMatches));

    // Cabinet-scoped projection — keep the document size small.
    const players = await User.find({ 'stats.matchesPlayed': { $gte: minM } })
        .select('handle telegramUserId stats.matchesPlayed stats.wins stats.losses stats.kills stats.deaths stats.totalDamage stats.prestigeTier stats.consecutiveWins stats.bestWinStreak')
        .lean();

    const ranked = players
        .map((p) => buildRow(p))
        .sort((a, b) => {
            if (b.kdRatio !== a.kdRatio) return b.kdRatio - a.kdRatio;
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.matchesPlayed - a.matchesPlayed;
        });

    return ranked.slice(0, clamped).map((p, i) => ({ rank: i + 1, ...p }));
}

/**
 * A specific player's SolShot standing — same row shape as the LB
 * endpoint, with their rank computed against the full eligible pool.
 *
 * @param {Object} args
 * @param {number} args.telegramUserId
 * @param {number} [args.minMatches=10]  Same threshold as the LB query.
 * @returns {Promise<Object|null>}
 */
export async function getSolShotStanding({ telegramUserId, minMatches = 1 } = {}) {
    if (!Number.isFinite(telegramUserId)) return null;

    const me = await User.findOne({ telegramUserId })
        .select('handle telegramUserId stats.matchesPlayed stats.wins stats.losses stats.kills stats.deaths stats.totalDamage stats.prestigeTier stats.consecutiveWins stats.bestWinStreak')
        .lean();

    if (!me || (me.stats?.matchesPlayed || 0) < minMatches) {
        return null;
    }

    const myRow = buildRow(me);

    // Rank = 1 + count of players strictly above on the sort key chain.
    // Use the same chain as getSolShotLeaderboard.
    const eligible = await User.find({ 'stats.matchesPlayed': { $gte: Math.max(1, Math.floor(minMatches)) } })
        .select('handle telegramUserId stats.matchesPlayed stats.wins stats.losses stats.kills stats.deaths stats.prestigeTier')
        .lean();

    const ranked = eligible
        .map((p) => buildRow(p))
        .sort((a, b) => {
            if (b.kdRatio !== a.kdRatio) return b.kdRatio - a.kdRatio;
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.matchesPlayed - a.matchesPlayed;
        });

    const idx = ranked.findIndex((p) => p.telegramUserId === myRow.telegramUserId);
    const rank = idx >= 0 ? idx + 1 : null;

    return { rank, ...myRow };
}

/**
 * Build the wire-shape row from a lean User doc.
 * Defends against missing fields; every value falls back to a safe default.
 */
function buildRow(user) {
    const s = user?.stats || {};
    const matchesPlayed = s.matchesPlayed || 0;
    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const kills = s.kills || 0;
    const deaths = s.deaths || 0;
    const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
    // K/D = kills / max(1, deaths). If deaths == 0, denominator becomes 1
    // — a 5-0 player ranks as K/D 5, not infinity. Keeps the sort stable.
    const kdRatio = +(kills / Math.max(1, deaths)).toFixed(2);

    return {
        telegramUserId: user?.telegramUserId,
        displayName: formatDisplayName(user),
        matchesPlayed,
        wins,
        losses,
        winRate,
        kills,
        deaths,
        kdRatio,
        totalDamage: s.totalDamage || 0,
        prestigeTier: s.prestigeTier || 0,
        consecutiveWins: s.consecutiveWins || 0,
        bestWinStreak: s.bestWinStreak || 0,
        // For symmetry with the other game LB endpoints — keeps the client
        // hook's existing `bestScore`/`totalSubmissions` reads working
        // without a special case during the rollout.
        bestScore: kdRatio,
        totalSubmissions: matchesPlayed,
    };
}

function formatDisplayName(user) {
    if (user?.handle) return user.handle.toUpperCase();
    const tg = user?.telegramUserId;
    return tg ? `Player ${String(tg).slice(-4)}` : 'OPERATIVE';
}
