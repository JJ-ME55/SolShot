/**
 * Standalone DEEPER leaderboard service.
 *
 * For the standalone game at deeper-red.vercel.app (Phaser 3 + TS, deployed
 * from JJ-ME55/deeper `main`). Mirror of
 * `free-kicks-standalone/standaloneLeaderboard.js` — same JWT-gated
 * submission pattern, separate Mongo collection (`deeperscores`), separate
 * JWT issuer (`arcade-bot:deeper`) and signing secret
 * (`DEEPER_LEADERBOARD_SECRET`).
 *
 * The ranked metric is NET WORTH (total cash earned) — the canonical
 * Motherload high-score. depthFt + treasures are stored as secondary columns
 * from whichever run set the best net worth.
 *
 * Public API: same shape as free-kicks / basketball.
 *   mintSession({telegramUserId, telegramUsername?, firstName?}) → JWT
 *   verifySession(token) → { telegramUserId, telegramUsername, firstName }
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score, depthFt?, treasures?})
 *       → { newBest, bestScore, rank, totalPlayers }
 *   getLeaderboard({limit?, since?}) → [{rank, displayName, bestScore, bestDepthFt, ...}]
 *   getMyStanding({telegramUserId}) → {rank, bestScore, ...} | null
 */

import jwt from 'jsonwebtoken';
import DeeperScore from '../../../models/DeeperScore.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:deeper';

function getSecret() {
    const secret = process.env.DEEPER_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[deeper-leaderboard] FATAL: DEEPER_LEADERBOARD_SECRET must be set in production');
            throw new Error('DEEPER_LEADERBOARD_SECRET missing');
        }
        if (!process.env._DEEPER_DEV_SECRET_WARNED) {
            console.warn('[deeper-leaderboard] DEEPER_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._DEEPER_DEV_SECRET_WARNED = '1';
            process.env._DEEPER_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._DEEPER_DEV_SECRET;
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

// Net worth (total cash earned). Generous ceiling — the run economy tops out
// in the low millions; 1e9 leaves runway and rejects obvious garbage.
const MAX_PLAUSIBLE_SCORE = 1_000_000_000;
const MAX_DEPTH_FT = 100_000;
const MAX_TREASURES = 100_000;

const clampInt = (v, max) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

export async function submitScore({ telegramUserId, telegramUsername, firstName, score, depthFt, treasures }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    const intDepth = clampInt(depthFt, MAX_DEPTH_FT);
    const intTreasures = clampInt(treasures, MAX_TREASURES);
    const now = new Date();

    const existing = await DeeperScore.findOne({ telegramUserId }).lean();
    let newBest = false;

    if (!existing) {
        await DeeperScore.create({
            telegramUserId,
            telegramUsername: telegramUsername || null,
            firstName: firstName || null,
            bestScore: intScore,
            bestDepthFt: intDepth,
            bestTreasures: intTreasures,
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
            update.$set.bestDepthFt = intDepth;
            update.$set.bestTreasures = intTreasures;
            update.$set.bestAchievedAt = now;
            newBest = true;
        }
        await DeeperScore.updateOne(
            { telegramUserId, ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}) },
            update
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        DeeperScore.countDocuments({}),
    ]);

    return { newBest, bestScore, rank, totalPlayers };
}

export async function getLeaderboard({ limit = 10, since = null } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { bestAchievedAt: { $gte: since } }
        : {};
    const rows = await DeeperScore.find(filter)
        .sort({ bestScore: -1, bestAchievedAt: 1 })
        .limit(clamped)
        .lean();
    // SECURITY: telegramUserId stripped from public LB response (PII).
    return rows.map((r, i) => ({
        rank: i + 1,
        displayName: formatDisplayName(r),
        bestScore: r.bestScore,
        bestDepthFt: r.bestDepthFt || 0,
        bestTreasures: r.bestTreasures || 0,
        bestAchievedAt: r.bestAchievedAt,
        totalSubmissions: r.totalSubmissions,
    }));
}

export async function getMyStanding({ telegramUserId }) {
    const me = await DeeperScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const rank = await getRank(telegramUserId);
    return {
        rank,
        bestScore: me.bestScore,
        bestDepthFt: me.bestDepthFt || 0,
        bestTreasures: me.bestTreasures || 0,
        totalSubmissions: me.totalSubmissions,
        bestAchievedAt: me.bestAchievedAt,
        displayName: formatDisplayName(me),
    };
}

async function getRank(telegramUserId) {
    const me = await DeeperScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const ahead = await DeeperScore.countDocuments({
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
