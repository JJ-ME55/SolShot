/**
 * Shootout per-user career stats persistence.
 *
 * Day 3 / Task 4. Called from ShootoutRunner._emitMatchFinal once per
 * match. Bumps lifetime kills/deaths/matches/wins/losses and
 * recomputes rawKD + rankScore. Bots (telegramUserId === 0 or isBot)
 * are skipped — only real players accumulate career stats.
 *
 * The runner imports this module directly. Returns an array of the
 * updated documents (mostly for tests; production callers ignore it).
 *
 * Anti-corruption rule: this file is the only place in the shootout
 * server that writes to the ShootoutStats collection. Read-side
 * leaderboard lookups can live alongside.
 */

import ShootoutStats from '../../../models/ShootoutStats.js';
import logger from '../../logger.js';

/**
 * Persist per-player career stats for a finished match.
 *
 * @param {object} args
 *   matchWinner: 'red' | 'blue' | null
 *   players: Array<{
 *     telegramUserId, displayName, team, isBot, kills, deaths
 *   }>
 * @returns {Promise<Array>} the upsert results (one per non-bot player)
 *   — failures are logged but not thrown so a Mongo blip doesn't
 *   take down the runner mid-finalisation.
 */
export async function persistMatchStats({ matchWinner, players }) {
    if (!Array.isArray(players)) return [];
    const results = [];
    for (const p of players) {
        // Skip bots — they accumulate nothing.
        if (p?.isBot) continue;
        if (!Number.isFinite(p?.telegramUserId) || p.telegramUserId === 0) continue;
        const won  = matchWinner != null && p.team === matchWinner;
        const lost = matchWinner != null && p.team !== matchWinner;
        const inc = {
            totalKills:   p.kills  || 0,
            totalDeaths:  p.deaths || 0,
            totalMatches: 1,
            wins:         won  ? 1 : 0,
            losses:       lost ? 1 : 0,
        };
        try {
            // Upsert first to bump counters, then read-back to recompute
            // rawKD / rankScore — Mongoose doesn't let us reference
            // post-$inc values in the same write.
            const doc = await ShootoutStats.findOneAndUpdate(
                { telegramUserId: p.telegramUserId },
                {
                    $inc: inc,
                    $set: {
                        displayName:  p.displayName || `tg-${p.telegramUserId}`,
                        lastPlayedAt: new Date(),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            // Recompute display metrics. rawKD uses max(deaths, 1) so a
            // brand-new player with 1 kill and 0 deaths reads as 1.0
            // rather than +Inf.
            const totalKills  = doc?.totalKills  ?? 0;
            const totalDeaths = doc?.totalDeaths ?? 0;
            const totalWins   = doc?.wins        ?? 0;
            const rawKD     = totalKills / Math.max(totalDeaths, 1);
            // Wins-weighted KDR — Fish's scoring formula, 2026-06-08.
            //   rankScore = totalKills - 0.5*totalDeaths + 100*wins
            // Wins are the heavy lever (you can't fake winning a round
            // in PvP), kills are secondary, deaths a small penalty.
            // Plays well across 1v1 + 2v2 on the same board.
            // Doesn't divide by 0; doesn't reward single lucky games
            // (KDR-as-rank does); doesn't depend on opponent skill
            // (no ELO surface yet — that's a wagering-time upgrade).
            const rankScore = totalKills - 0.5 * totalDeaths + 100 * totalWins;
            await ShootoutStats.findOneAndUpdate(
                { telegramUserId: p.telegramUserId },
                { $set: { rawKD, rankScore } },
            );
            results.push({ telegramUserId: p.telegramUserId, rawKD, rankScore });
        } catch (err) {
            logger.error({ err, telegramUserId: p.telegramUserId },
                'shootout stats upsert failed');
        }
    }
    return results;
}

// ─── Read-side adapters for the arcade bot's LEADERBOARDS registry ──
//
// Contract (see arcadeBot.js::sendLeaderboard): getLeaderboard returns
// rows with { displayName, bestScore }; getStanding returns
// { rank, displayName, bestScore, totalSubmissions } or null.
// We sort by rankScore (wins-dominated — see formula above) and show
// WINS as the number, so the board reads naturally while the ordering
// can keep evolving server-side.

export async function getShootoutLeaderboard({ limit = 10 } = {}) {
    const docs = await ShootoutStats.find({})
        .sort({ rankScore: -1, totalKills: -1, lastPlayedAt: -1 })
        .limit(Math.max(1, Math.min(100, limit)))
        .lean();
    return docs.map((d) => ({
        telegramUserId: d.telegramUserId,
        displayName:    d.displayName,
        bestScore:      d.wins | 0,
    }));
}

export async function getShootoutStanding({ telegramUserId } = {}) {
    if (!Number.isFinite(telegramUserId)) return null;
    const doc = await ShootoutStats.findOne({ telegramUserId }).lean();
    if (!doc) return null;
    const ahead = await ShootoutStats.countDocuments({
        rankScore: { $gt: doc.rankScore || 0 },
    });
    return {
        rank:             ahead + 1,
        displayName:      doc.displayName,
        bestScore:        doc.wins | 0,
        totalSubmissions: doc.totalMatches | 0,
    };
}

export default { persistMatchStats, getShootoutLeaderboard, getShootoutStanding };
