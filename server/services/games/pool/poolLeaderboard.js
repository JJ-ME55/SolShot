/**
 * Pool Leaderboard Service.
 *
 * Public read API surface for pool's competitive boards + JWT minting
 * for arcade-bot launched sessions (same pattern as basketball-standalone).
 *
 * Boards exposed (designer spec §7.33):
 *   - elo                 — primary; rate-based; never cumulative
 *   - tickets_earned      — sum of TKT earned within optional time window
 *   - marathon_streak     — best streak per starting difficulty
 *   - marathon_perfect    — best perfectTables per starting difficulty
 *   - tournament_podiums  — count of top-3 finishes per player
 *
 * Skill-not-cumulative-volume rule honored: there is NO "most matches
 * played" board. ELO + win rate + streak + tournament podiums are all
 * skill/rate metrics.
 *
 * Identity model:
 *   - Each board returns rows by telegramUserId where available, falling
 *     back to walletAddress.
 *   - Standing queries accept either identity.
 *
 * JWT minting:
 *   - Arcade bot calls mintSession({ telegramUserId, ... }) when user
 *     taps /pool; URL embeds `?session=<jwt>`.
 *   - Future authenticated API calls (start match, place stake) verify
 *     via verifySession(token).
 *   - 30-day TTL matches the silent-401 fix from the basketball pattern.
 *
 * Note: this service is READ-ONLY for leaderboards. Score "submission"
 * happens implicitly via the orchestrator and ledger services as matches
 * complete — there is no POST /api/games/pool/score equivalent.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import PoolElo from '../../../models/PoolElo.js';
import MarathonRun from '../../../models/MarathonRun.js';
import Tournament from '../../../models/Tournament.js';
import { TicketTransaction } from '../../../models/TicketLedger.js';

// ─── JWT config ──────────────────────────────────────────────────────

const ALG = 'HS256';
const SESSION_TTL = '30d';
const ISSUER = 'arcade-bot:pool';

function getSecret() {
    const secret = process.env.POOL_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[pool-leaderboard] FATAL: POOL_LEADERBOARD_SECRET must be set in production');
            throw new Error('POOL_LEADERBOARD_SECRET missing');
        }
        if (!process.env._POOL_DEV_SECRET_WARNED) {
            console.warn('[pool-leaderboard] POOL_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._POOL_DEV_SECRET_WARNED = '1';
            process.env._POOL_DEV_SECRET = crypto.randomBytes(32).toString('hex');
        }
        return process.env._POOL_DEV_SECRET;
    }
    return secret;
}

/**
 * Mint a session JWT for a Telegram-identified player.
 *
 * @param {object} args
 * @param {number} args.telegramUserId            - required
 * @param {string} [args.telegramUsername]
 * @param {string} [args.firstName]
 * @returns {string} JWT token
 */
export function mintSession({ telegramUserId, telegramUsername, firstName }) {
    if (!telegramUserId || typeof telegramUserId !== 'number') {
        throw new Error('telegramUserId required (number)');
    }
    const payload = {
        tg: telegramUserId,
        ...(telegramUsername ? { un: telegramUsername } : {}),
        ...(firstName ? { fn: firstName } : {})
    };
    return jwt.sign(payload, getSecret(), { algorithm: ALG, issuer: ISSUER, expiresIn: SESSION_TTL });
}

/**
 * Verify a session JWT and return the decoded TG identity.
 * @param {string} token
 * @returns {{ telegramUserId: number, telegramUsername?: string, firstName?: string }}
 */
export function verifySession(token) {
    const decoded = jwt.verify(token, getSecret(), { algorithms: [ALG], issuer: ISSUER });
    return {
        telegramUserId: decoded.tg,
        ...(decoded.un ? { telegramUsername: decoded.un } : {}),
        ...(decoded.fn ? { firstName: decoded.fn } : {})
    };
}

// ─── Pure helpers ───────────────────────────────────────────────────

const VALID_BOARD_TYPES = Object.freeze([
    'elo',
    'tickets_earned',
    'marathon_streak',
    'marathon_perfect',
    'tournament_podiums'
]);

/**
 * Normalize a `since` query value to a Date (or null).
 * @param {string|Date|null} raw
 * @returns {Date|null}
 */
export function parseSinceParam(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Clamp a limit value to a safe range.
 * @param {number|string} raw
 * @returns {number}
 */
export function clampLimit(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 10;
    return Math.max(1, Math.min(100, n));
}

/**
 * Display name resolution (callsign > username > firstName > fallback).
 */
function displayNameFromEntry(e) {
    return e.callsign || e.telegramUsername || e.firstName || 'Anonymous';
}

// ─── Board queries ──────────────────────────────────────────────────

/**
 * Top-N ELO leaderboard.
 * @param {object} args
 * @param {number} [args.limit=10]
 * @returns {Promise<Array>}
 */
export async function getEloLeaderboard({ limit = 10 } = {}) {
    const docs = await PoolElo.find({ provisional: false, matchCount: { $gte: 1 } })
        .sort({ rating: -1, highestRatingAt: 1 })
        .limit(limit)
        .lean();

    return docs.map((d, i) => ({
        rank: i + 1,
        telegramUserId: d.telegramUserId || null,
        walletAddress: d.walletAddress || null,
        displayName: displayNameFromEntry(d),
        rating: d.rating,
        matchCount: d.matchCount,
        wins: d.wins,
        losses: d.losses,
        winRate: d.matchCount > 0 ? Math.round((d.wins / d.matchCount) * 100) : 0
    }));
}

/**
 * Top-N by tickets earned in optional time window.
 * @param {object} args
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]
 * @returns {Promise<Array>}
 */
export async function getTicketsEarnedLeaderboard({ limit = 10, since = null } = {}) {
    const match = { delta: { $gt: 0 } };
    if (since instanceof Date) match.createdAt = { $gte: since };

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: { telegramUserId: '$telegramUserId', walletAddress: '$walletAddress' },
                totalEarned: { $sum: '$delta' }
            }
        },
        { $sort: { totalEarned: -1 } },
        { $limit: limit }
    ];

    const agg = await TicketTransaction.aggregate(pipeline);

    // Hydrate callsigns from PoolElo (best-effort)
    return Promise.all(agg.map(async (row, i) => {
        const eloDoc = await PoolElo.findOne({
            $or: [
                ...(row._id.telegramUserId ? [{ telegramUserId: row._id.telegramUserId }] : []),
                ...(row._id.walletAddress ? [{ walletAddress: row._id.walletAddress }] : [])
            ]
        }).lean();
        return {
            rank: i + 1,
            telegramUserId: row._id.telegramUserId || null,
            walletAddress: row._id.walletAddress || null,
            displayName: eloDoc ? displayNameFromEntry(eloDoc) : 'Anonymous',
            ticketsEarned: row.totalEarned
        };
    }));
}

/**
 * Marathon streak leaderboard (per starting difficulty, time-windowed).
 * @param {object} args
 * @param {'easy'|'medium'|'hard'|'insane'} args.difficulty
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]
 * @returns {Promise<Array>}
 */
export async function getMarathonStreakLeaderboard({ difficulty, limit = 10, since = null } = {}) {
    if (!['easy', 'medium', 'hard', 'insane'].includes(difficulty)) {
        throw new Error('difficulty required: easy|medium|hard|insane');
    }
    const filter = {
        startingDifficulty: difficulty,
        status: { $in: ['ended_loss', 'ended_cashout', 'ended_disconnect'] }
    };
    if (since instanceof Date) filter.endedAt = { $gte: since };

    const runs = await MarathonRun.find(filter)
        .sort({ streak: -1, endedAt: 1 })
        .limit(limit)
        .lean();

    return runs.map((r, i) => ({
        rank: i + 1,
        runId: r.runId,
        telegramUserId: r.telegramUserId || null,
        walletAddress: r.walletAddress || null,
        displayName: displayNameFromEntry(r),
        streak: r.streak,
        perfectTables: r.perfectTables,
        endedAt: r.endedAt
    }));
}

/**
 * Marathon perfect-tables leaderboard (per starting difficulty).
 * Same shape as streak board, sorted by perfectTables.
 */
export async function getMarathonPerfectLeaderboard({ difficulty, limit = 10, since = null } = {}) {
    if (!['easy', 'medium', 'hard', 'insane'].includes(difficulty)) {
        throw new Error('difficulty required: easy|medium|hard|insane');
    }
    const filter = {
        startingDifficulty: difficulty,
        status: { $in: ['ended_loss', 'ended_cashout', 'ended_disconnect'] }
    };
    if (since instanceof Date) filter.endedAt = { $gte: since };

    const runs = await MarathonRun.find(filter)
        .sort({ perfectTables: -1, endedAt: 1 })
        .limit(limit)
        .lean();

    return runs.map((r, i) => ({
        rank: i + 1,
        runId: r.runId,
        telegramUserId: r.telegramUserId || null,
        walletAddress: r.walletAddress || null,
        displayName: displayNameFromEntry(r),
        perfectTables: r.perfectTables,
        streak: r.streak,
        endedAt: r.endedAt
    }));
}

/**
 * Tournament podiums leaderboard — count of 1st/2nd/3rd finishes per player.
 * @param {object} args
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]
 * @returns {Promise<Array>}
 */
export async function getTournamentPodiumsLeaderboard({ limit = 10, since = null } = {}) {
    const match = { status: 'finished' };
    if (since instanceof Date) match.finishedAt = { $gte: since };

    const pipeline = [
        { $match: match },
        { $unwind: '$entrants' },
        { $match: { 'entrants.finalPlacement': { $lte: 3 } } },
        {
            $group: {
                _id: {
                    telegramUserId: '$entrants.telegramUserId',
                    walletAddress: '$entrants.walletAddress'
                },
                callsign: { $first: '$entrants.callsign' },
                podiums: { $sum: 1 },
                firsts:  { $sum: { $cond: [{ $eq: ['$entrants.finalPlacement', 1] }, 1, 0] } },
                seconds: { $sum: { $cond: [{ $eq: ['$entrants.finalPlacement', 2] }, 1, 0] } },
                thirds:  { $sum: { $cond: [{ $eq: ['$entrants.finalPlacement', 3] }, 1, 0] } }
            }
        },
        { $sort: { firsts: -1, seconds: -1, thirds: -1 } },
        { $limit: limit }
    ];

    const agg = await Tournament.aggregate(pipeline);
    return agg.map((row, i) => ({
        rank: i + 1,
        telegramUserId: row._id.telegramUserId || null,
        walletAddress: row._id.walletAddress || null,
        displayName: row.callsign || 'Anonymous',
        podiums: row.podiums,
        firsts: row.firsts,
        seconds: row.seconds,
        thirds: row.thirds
    }));
}

/**
 * Dispatcher — chooses the right board by type.
 * @param {object} args
 * @param {string} args.type
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]
 * @param {string} [args.difficulty]   - required for marathon_* types
 * @returns {Promise<Array>}
 */
export async function getLeaderboard({ type, limit = 10, since = null, difficulty }) {
    if (!VALID_BOARD_TYPES.includes(type)) {
        throw new Error(`invalid board type: ${type}; valid: ${VALID_BOARD_TYPES.join(',')}`);
    }
    switch (type) {
        case 'elo':                 return getEloLeaderboard({ limit });
        case 'tickets_earned':      return getTicketsEarnedLeaderboard({ limit, since });
        case 'marathon_streak':     return getMarathonStreakLeaderboard({ difficulty, limit, since });
        case 'marathon_perfect':    return getMarathonPerfectLeaderboard({ difficulty, limit, since });
        case 'tournament_podiums':  return getTournamentPodiumsLeaderboard({ limit, since });
    }
}

// ─── Standing queries ────────────────────────────────────────────────

/**
 * Get a player's current ELO standing (rank within the ELO board).
 * @param {object} args
 * @param {number} [args.telegramUserId]
 * @param {string} [args.walletAddress]
 * @returns {Promise<object|null>}
 */
export async function getEloStanding({ telegramUserId, walletAddress }) {
    const identityFilter = telegramUserId
        ? { telegramUserId }
        : walletAddress ? { walletAddress } : null;
    if (!identityFilter) return null;

    const doc = await PoolElo.findOne(identityFilter).lean();
    if (!doc) return null;

    // Rank = 1 + number of non-provisional players with strictly higher rating
    const higherCount = await PoolElo.countDocuments({
        rating: { $gt: doc.rating },
        provisional: false,
        matchCount: { $gte: 1 }
    });

    return {
        rank: doc.provisional ? null : higherCount + 1,
        displayName: displayNameFromEntry(doc),
        rating: doc.rating,
        matchCount: doc.matchCount,
        wins: doc.wins,
        losses: doc.losses,
        winRate: doc.matchCount > 0 ? Math.round((doc.wins / doc.matchCount) * 100) : 0,
        provisional: doc.provisional,
        provisionalMatchesLeft: doc.provisional ? Math.max(0, 10 - doc.matchCount) : 0,
        longestWinStreak: doc.longestWinStreak,
        currentWinStreak: doc.currentWinStreak
    };
}

/**
 * Get a player's best marathon performance per difficulty.
 * @param {object} args
 * @param {'easy'|'medium'|'hard'|'insane'} args.difficulty
 * @param {number} [args.telegramUserId]
 * @param {string} [args.walletAddress]
 * @returns {Promise<object|null>}
 */
export async function getMarathonStanding({ difficulty, telegramUserId, walletAddress }) {
    if (!['easy', 'medium', 'hard', 'insane'].includes(difficulty)) {
        throw new Error('difficulty required: easy|medium|hard|insane');
    }
    const identityFilter = telegramUserId
        ? { telegramUserId }
        : walletAddress ? { walletAddress } : null;
    if (!identityFilter) return null;

    const best = await MarathonRun.findOne({
        ...identityFilter,
        startingDifficulty: difficulty,
        status: { $in: ['ended_loss', 'ended_cashout', 'ended_disconnect'] }
    }).sort({ streak: -1, perfectTables: -1 }).lean();

    if (!best) return null;

    const higherCount = await MarathonRun.countDocuments({
        startingDifficulty: difficulty,
        status: { $in: ['ended_loss', 'ended_cashout', 'ended_disconnect'] },
        $or: [
            { streak: { $gt: best.streak } },
            { streak: best.streak, perfectTables: { $gt: best.perfectTables } }
        ]
    });

    return {
        rank: higherCount + 1,
        runId: best.runId,
        displayName: displayNameFromEntry(best),
        streak: best.streak,
        perfectTables: best.perfectTables,
        endedAt: best.endedAt
    };
}

/**
 * Dispatcher for standings.
 * @param {object} args
 * @param {string} args.type
 * @param {number} [args.telegramUserId]
 * @param {string} [args.walletAddress]
 * @param {string} [args.difficulty]
 * @returns {Promise<object|null>}
 */
export async function getStanding({ type, telegramUserId, walletAddress, difficulty }) {
    if (!VALID_BOARD_TYPES.includes(type)) {
        throw new Error(`invalid standing type: ${type}`);
    }
    switch (type) {
        case 'elo':
            return getEloStanding({ telegramUserId, walletAddress });
        case 'marathon_streak':
        case 'marathon_perfect':
            return getMarathonStanding({ difficulty, telegramUserId, walletAddress });
        default:
            // tickets_earned and tournament_podiums don't have a per-user
            // "what's my rank" query yet — caller can derive from listing.
            return null;
    }
}

// ─── Exports ────────────────────────────────────────────────────────

export const POOL_LEADERBOARD_CONSTANTS = Object.freeze({
    VALID_BOARD_TYPES,
    SESSION_TTL
});

export default {
    mintSession,
    verifySession,
    parseSinceParam,
    clampLimit,
    getLeaderboard,
    getEloLeaderboard,
    getTicketsEarnedLeaderboard,
    getMarathonStreakLeaderboard,
    getMarathonPerfectLeaderboard,
    getTournamentPodiumsLeaderboard,
    getStanding,
    getEloStanding,
    getMarathonStanding,
    POOL_LEADERBOARD_CONSTANTS
};
