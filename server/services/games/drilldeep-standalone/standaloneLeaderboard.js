/**
 * Standalone DRILLDEEP leaderboard service.
 *
 * Mirror of keepie-uppies-standalone/standaloneLeaderboard.js — same JWT-gated submission
 * pattern, separate Mongo collection (`drilldeepscores`), separate JWT issuer
 * (`arcade-bot:drilldeep`) and signing secret (`DRILLDEEP_LEADERBOARD_SECRET`).
 * Additionally records depth + cash of the best run.
 *
 * Public API (same shape as keepie-uppies, plus depth/cash on submit):
 *   mintSession({telegramUserId, telegramUsername?, firstName?}) → JWT
 *   verifySession(token) → { telegramUserId, telegramUsername, firstName }
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score, depth?, cash?})
 *       → { newBest, bestScore, bestDepth, rank, totalPlayers }
 *   getLeaderboard({limit?, since?}) → [{rank, displayName, bestScore, depth, cash, ...}]
 *   getMyStanding({telegramUserId}) → {rank, bestScore, ...} | null
 */

import jwt from 'jsonwebtoken';
import DrillDeepScore from '../../../models/DrillDeepScore.js';

const ALG = 'HS256';
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:drilldeep';

function getSecret() {
    const secret = process.env.DRILLDEEP_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[drilldeep-leaderboard] FATAL: DRILLDEEP_LEADERBOARD_SECRET must be set in production');
            throw new Error('DRILLDEEP_LEADERBOARD_SECRET missing');
        }
        if (!process.env._DRILLDEEP_DEV_SECRET) {
            console.warn('[drilldeep-leaderboard] DRILLDEEP_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._DRILLDEEP_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._DRILLDEEP_DEV_SECRET;
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
    return jwt.sign(payload, getSecret(), { algorithm: ALG, expiresIn: SESSION_TTL, issuer: ISSUER });
}

export function verifySession(token) {
    if (!token || typeof token !== 'string') throw new Error('session token required');
    const decoded = jwt.verify(token, getSecret(), { algorithms: [ALG], issuer: ISSUER });
    if (!decoded.tg || typeof decoded.tg !== 'number') throw new Error('invalid session payload');
    return {
        telegramUserId: decoded.tg,
        telegramUsername: decoded.un || null,
        firstName: decoded.fn || null,
    };
}

// DEEPER scores combine banked cash + depth bonus + core bonus; a deep Core run can reach
// a few million. Generous ceiling that still rejects obvious garbage.
const MAX_PLAUSIBLE_SCORE = 50_000_000;

export async function submitScore({ telegramUserId, telegramUsername, firstName, score, depth = 0, cash = 0 }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    const intDepth = Math.max(0, Math.floor(Number(depth) || 0));
    const intCash = Math.max(0, Math.floor(Number(cash) || 0));
    const now = new Date();

    const existing = await DrillDeepScore.findOne({ telegramUserId }).lean();
    let newBest = false;

    if (!existing) {
        await DrillDeepScore.create({
            telegramUserId,
            telegramUsername: telegramUsername || null,
            firstName: firstName || null,
            bestScore: intScore, bestDepth: intDepth, bestCash: intCash,
            totalSubmissions: 1,
            firstSubmittedAt: now, lastSubmittedAt: now, bestAchievedAt: now,
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
            update.$set.bestDepth = intDepth;
            update.$set.bestCash = intCash;
            update.$set.bestAchievedAt = now;
            newBest = true;
        }
        await DrillDeepScore.updateOne(
            { telegramUserId, ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}) },
            update,
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const bestDepth = newBest ? intDepth : existing.bestDepth;
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        DrillDeepScore.countDocuments({}),
    ]);
    return { newBest, bestScore, bestDepth, rank, totalPlayers };
}

export async function getLeaderboard({ limit = 10, since = null } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { bestAchievedAt: { $gte: since } }
        : {};
    const rows = await DrillDeepScore.find(filter)
        .sort({ bestScore: -1, bestAchievedAt: 1 })
        .limit(clamped)
        .lean();
    return rows.map((r, i) => ({
        rank: i + 1,
        displayName: formatDisplayName(r),
        bestScore: r.bestScore,
        depth: r.bestDepth || 0,
        cash: r.bestCash || 0,
        bestAchievedAt: r.bestAchievedAt,
        totalSubmissions: r.totalSubmissions,
    }));
}

export async function getMyStanding({ telegramUserId }) {
    const me = await DrillDeepScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const rank = await getRank(telegramUserId);
    return {
        rank,
        bestScore: me.bestScore,
        depth: me.bestDepth || 0,
        cash: me.bestCash || 0,
        totalSubmissions: me.totalSubmissions,
        bestAchievedAt: me.bestAchievedAt,
        displayName: formatDisplayName(me),
    };
}

async function getRank(telegramUserId) {
    const me = await DrillDeepScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const ahead = await DrillDeepScore.countDocuments({
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
