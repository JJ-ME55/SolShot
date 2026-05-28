/**
 * Standalone Free-Kicks leaderboard service.
 *
 * For the free-play standalone game at solshot-free-kicks-iota.vercel.app
 * (Vite + Three.js, deployed from JJ-ME55/solshot-free-kicks `main`).
 * Mirror of `keepie-uppies-standalone/standaloneLeaderboard.js` — same
 * JWT-gated submission pattern, separate Mongo collection
 * (`freekicksscores`), separate JWT issuer (`arcade-bot:freekicks`) and
 * signing secret (`FREE_KICKS_LEADERBOARD_SECRET`).
 *
 * Public API: same shape as keepie-uppies / basketball.
 *   mintSession({telegramUserId, telegramUsername?, firstName?}) → JWT
 *   verifySession(token) → { telegramUserId, telegramUsername, firstName }
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score})
 *       → { newBest, bestScore, rank, totalPlayers }
 *   getLeaderboard({limit?}) → [{rank, telegramUserId, displayName, ...}]
 *   getMyStanding({telegramUserId}) → {rank, bestScore, totalSubmissions} | null
 */

import jwt from 'jsonwebtoken';
import FreeKicksScore from '../../../models/FreeKicksScore.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
const SESSION_TTL = '24h';
const ISSUER = 'arcade-bot:freekicks';

function getSecret() {
    const secret = process.env.FREE_KICKS_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[freekicks-leaderboard] FATAL: FREE_KICKS_LEADERBOARD_SECRET must be set in production');
            throw new Error('FREE_KICKS_LEADERBOARD_SECRET missing');
        }
        if (!process.env._FREEKICKS_DEV_SECRET_WARNED) {
            console.warn('[freekicks-leaderboard] FREE_KICKS_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._FREEKICKS_DEV_SECRET_WARNED = '1';
            process.env._FREEKICKS_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._FREEKICKS_DEV_SECRET;
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

// Free-kicks is lives-based with mixed scoring: POINTS_PER_GOAL=1,
// POINTS_PER_PLUS10_BONUS=10, hat-trick → fire-ball. Conservative cap at
// 9999 — leaves runway, rejects obvious garbage.
const MAX_PLAUSIBLE_SCORE = 9999;

export async function submitScore({ telegramUserId, telegramUsername, firstName, score }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    const now = new Date();

    const existing = await FreeKicksScore.findOne({ telegramUserId }).lean();
    let newBest = false;

    if (!existing) {
        await FreeKicksScore.create({
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
        await FreeKicksScore.updateOne(
            { telegramUserId, ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}) },
            update
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        FreeKicksScore.countDocuments({}),
    ]);

    return { newBest, bestScore, rank, totalPlayers };
}

/**
 * @param {Object} [args]
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]  See basketball-leaderboard.js for the
 *   semantic note on time-window filtering against `bestAchievedAt`.
 */
export async function getLeaderboard({ limit = 10, since = null } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { bestAchievedAt: { $gte: since } }
        : {};
    const rows = await FreeKicksScore.find(filter)
        .sort({ bestScore: -1, bestAchievedAt: 1 })
        .limit(clamped)
        .lean();
    return rows.map((r, i) => ({
        rank: i + 1,
        telegramUserId: r.telegramUserId,
        displayName: formatDisplayName(r),
        bestScore: r.bestScore,
        bestAchievedAt: r.bestAchievedAt,
        totalSubmissions: r.totalSubmissions,
    }));
}

export async function getMyStanding({ telegramUserId }) {
    const me = await FreeKicksScore.findOne({ telegramUserId }).lean();
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
    const me = await FreeKicksScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const ahead = await FreeKicksScore.countDocuments({
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
