/**
 * Standalone Keepie Uppies leaderboard service.
 *
 * For the free-play standalone game at sol-shot-keepie-uppies.vercel.app.
 * Mirror of `basketball-standalone/standaloneLeaderboard.js` — same JWT-gated
 * submission pattern, separate Mongo collection (`keepieuppiesscores`),
 * separate JWT issuer (`arcade-bot:keepieuppies`) and signing secret
 * (`KEEPIE_UPPIES_LEADERBOARD_SECRET`).
 *
 * Why a full mirror instead of a generic ArcadeScore module:
 *   - Per-game JWT issuer = per-game replay protection (a basketball
 *     session token cannot be repurposed for keepie-uppies and vice versa).
 *   - Per-game secret = compromise isolation.
 *   - Per-game collection = cheap, fast top-N (no `{game: $eq}` filter on
 *     every query, no risk of one game's traffic starving another's
 *     index).
 * When the third game lands, refactor toward a small shared core.
 *
 * Public API: same shape as basketball.
 *   mintSession({telegramUserId, telegramUsername?, firstName?}) → JWT
 *   verifySession(token) → { telegramUserId, telegramUsername, firstName }
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score})
 *       → { newBest, bestScore, rank, totalPlayers }
 *   getLeaderboard({limit?}) → [{rank, telegramUserId, displayName, ...}]
 *   getMyStanding({telegramUserId}) → {rank, bestScore, totalSubmissions} | null
 */

import jwt from 'jsonwebtoken';
import KeepieUppiesScore from '../../../models/KeepieUppiesScore.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
// Tightened 30d → 7d on 2026-06-03 (see basketball-leaderboard.js — AAA
// hardening pass: shrinks steal-and-replay surface; bot taps refresh).
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:keepieuppies';

function getSecret() {
    const secret = process.env.KEEPIE_UPPIES_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[keepieuppies-leaderboard] FATAL: KEEPIE_UPPIES_LEADERBOARD_SECRET must be set in production');
            throw new Error('KEEPIE_UPPIES_LEADERBOARD_SECRET missing');
        }
        if (!process.env._KEEPIEUPPIES_DEV_SECRET_WARNED) {
            console.warn('[keepieuppies-leaderboard] KEEPIE_UPPIES_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._KEEPIEUPPIES_DEV_SECRET_WARNED = '1';
            process.env._KEEPIEUPPIES_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._KEEPIEUPPIES_DEV_SECRET;
    }
    return secret;
}

export function mintSession({ telegramUserId, telegramUsername, firstName }) {
    if (!telegramUserId || typeof telegramUserId !== 'number') {
        throw new Error('telegramUserId required (number)');
    }
    const payload = {
        tg: telegramUserId,
        ...(telegramUsername ? { un: telegramUsername } : {}),
        ...(firstName ? { fn: firstName } : {}),
    };
    return jwt.sign(payload, getSecret(), {
        algorithm: ALG,
        expiresIn: SESSION_TTL,
        issuer: ISSUER,
    });
}

export function verifySession(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('session token required');
    }
    const decoded = jwt.verify(token, getSecret(), {
        algorithms: [ALG],
        issuer: ISSUER,
    });
    if (!decoded.tg || typeof decoded.tg !== 'number') {
        throw new Error('invalid session payload');
    }
    return {
        telegramUserId: decoded.tg,
        telegramUsername: decoded.un || null,
        firstName: decoded.fn || null,
    };
}

// ─── Score operations ───────────────────────────────────────────────────

// Keepie uppies is endurance-style: scores can in theory be unbounded.
// 9999 is loose enough that no legit run hits it in v1 and tight enough
// to reject obvious garbage.
const MAX_PLAUSIBLE_SCORE = 9999;

export async function submitScore({ telegramUserId, telegramUsername, firstName, score }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    const now = new Date();

    const existing = await KeepieUppiesScore.findOne({ telegramUserId }).lean();
    let newBest = false;

    if (!existing) {
        await KeepieUppiesScore.create({
            telegramUserId,
            telegramUsername: telegramUsername || null,
            firstName: firstName || null,
            bestScore: intScore,
            totalSubmissions: 1,
            firstSubmittedAt: now,
            lastSubmittedAt: now,
            bestAchievedAt: now,
        });
        newBest = true;
    } else {
        const willBeatBest = intScore > existing.bestScore;
        const update = {
            $inc: { totalSubmissions: 1 },
            $set: {
                lastSubmittedAt: now,
                ...(telegramUsername ? { telegramUsername } : {}),
                ...(firstName ? { firstName } : {}),
            },
        };
        if (willBeatBest) {
            update.$set.bestScore = intScore;
            update.$set.bestAchievedAt = now;
            newBest = true;
        }
        await KeepieUppiesScore.updateOne(
            { telegramUserId, ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}) },
            update
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        KeepieUppiesScore.countDocuments({}),
    ]);

    return { newBest, bestScore, rank, totalPlayers };
}

/**
 * @param {Object} [args]
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]  Filters to users whose best was set
 *   on/after this date (basketball-leaderboard.js documents the semantic).
 */
export async function getLeaderboard({ limit = 10, since = null } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { bestAchievedAt: { $gte: since } }
        : {};
    const rows = await KeepieUppiesScore.find(filter)
        .sort({ bestScore: -1, bestAchievedAt: 1 })
        .limit(clamped)
        .lean();
    // SECURITY: telegramUserId stripped from public LB response — PII leak.
    // See basketball-leaderboard.js for context. Standing endpoints still
    // return TG id for the requesting user only.
    return rows.map((r, i) => ({
        rank: i + 1,
        displayName: formatDisplayName(r),
        bestScore: r.bestScore,
        bestAchievedAt: r.bestAchievedAt,
        totalSubmissions: r.totalSubmissions,
    }));
}

export async function getMyStanding({ telegramUserId }) {
    const me = await KeepieUppiesScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const rank = await getRank(telegramUserId);
    return {
        rank,
        bestScore: me.bestScore,
        totalSubmissions: me.totalSubmissions,
        bestAchievedAt: me.bestAchievedAt,
        displayName: formatDisplayName(me),
    };
}

async function getRank(telegramUserId) {
    const me = await KeepieUppiesScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const ahead = await KeepieUppiesScore.countDocuments({
        $or: [
            { bestScore: { $gt: me.bestScore } },
            { bestScore: me.bestScore, bestAchievedAt: { $lt: me.bestAchievedAt } },
        ],
    });
    return ahead + 1;
}

function formatDisplayName(row) {
    if (row.telegramUsername) return `@${row.telegramUsername}`;
    if (row.firstName) return row.firstName;
    return `Player ${String(row.telegramUserId).slice(-4)}`;
}
