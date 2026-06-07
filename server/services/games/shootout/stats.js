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
            const rawKD     = totalKills / Math.max(totalDeaths, 1);
            // rankScore: rawKD for now. Phase D will fold in win-rate +
            // activity + DC penalty.
            const rankScore = rawKD;
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

export default { persistMatchStats };
