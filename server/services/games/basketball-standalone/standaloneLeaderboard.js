/**
 * Standalone Basketball Hoops leaderboard service.
 *
 * For the free-play standalone game at solshot-basketball.vercel.app.
 * Scores are submitted by the client over HTTP, gated by a server-signed
 * JWT that the arcade bot mints when the user taps /basketball. The JWT
 * carries the user's Telegram identity, so every submission is
 * verifiable-tied to a TG user without requiring wallet signature.
 *
 * Separate from `server/services/games/basketball/` (Fish's branch),
 * which encodes the WAGERED match flow with on-chain escrow + state
 * machine. When Fish's Phase 4 server rewrite lands, wagered scores
 * can flow into THIS leaderboard schema too — we'd just bypass the
 * JWT path and write directly from the verified lifecycle service.
 *
 * Public API:
 *   mintSession({telegramUserId, telegramUsername?, firstName?})
 *       → JWT string the arcade bot embeds in /basketball launch URL
 *   verifySession(token)
 *       → decoded TG identity, or throws on invalid/expired
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score})
 *       → { newBest: boolean, bestScore, rank, totalPlayers }
 *   getLeaderboard({limit?})
 *       → [{rank, telegramUserId, displayName, bestScore, bestAchievedAt}, ...]
 *   getMyStanding({telegramUserId})
 *       → { rank, bestScore, totalSubmissions } | null if never submitted
 */

import jwt from 'jsonwebtoken';
import BasketballScore from '../../../models/BasketballScore.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
const SESSION_TTL = '24h';   // user can play multiple games per /basketball tap
const ISSUER = 'arcade-bot:basketball';

function getSecret() {
    const secret = process.env.BASKETBALL_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[basketball-leaderboard] FATAL: BASKETBALL_LEADERBOARD_SECRET must be set in production');
            throw new Error('BASKETBALL_LEADERBOARD_SECRET missing');
        }
        // Dev fallback — same pattern as middleware/auth.js. Tokens don't
        // survive process restart but local iteration keeps working.
        if (!process.env._BASKETBALL_DEV_SECRET_WARNED) {
            console.warn('[basketball-leaderboard] BASKETBALL_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._BASKETBALL_DEV_SECRET_WARNED = '1';
            process.env._BASKETBALL_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._BASKETBALL_DEV_SECRET;
    }
    return secret;
}

/**
 * Mint a session token. Called by the arcade bot when generating the
 * /basketball launch URL — token gets embedded as `?session=<jwt>` so
 * the standalone client can forward it on score submissions.
 *
 * @param {Object} args
 * @param {number} args.telegramUserId   - required
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
        ...(firstName ? { fn: firstName } : {}),
    };
    return jwt.sign(payload, getSecret(), {
        algorithm: ALG,
        expiresIn: SESSION_TTL,
        issuer: ISSUER,
    });
}

/**
 * Verify and decode a session token. Throws on invalid/expired/forged.
 *
 * @param {string} token
 * @returns {{telegramUserId: number, telegramUsername: string|null, firstName: string|null}}
 */
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

const MAX_PLAUSIBLE_SCORE = 999;  // generous upper bound; tighten after we see real data

/**
 * Submit a score. Upserts the user's leaderboard row. If the new score
 * beats their existing best, updates `bestScore` + `bestAchievedAt`.
 * Always increments `totalSubmissions` and stamps `lastSubmittedAt`.
 *
 * @param {Object} args
 * @param {number} args.telegramUserId
 * @param {string} [args.telegramUsername]
 * @param {string} [args.firstName]
 * @param {number} args.score
 * @returns {Promise<{newBest: boolean, bestScore: number, rank: number, totalPlayers: number}>}
 */
export async function submitScore({ telegramUserId, telegramUsername, firstName, score }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    const now = new Date();

    // Atomic upsert. The bestScore update happens only when the new
    // score is strictly higher — avoids a race between two concurrent
    // submissions silently overwriting a higher value.
    //
    // Two-step approach: fetch existing best, decide whether to update,
    // then do an atomic conditional update. Simpler than a single $expr
    // pipeline update and still safe under concurrent writes because
    // the conditional filter prevents a stale overwrite.
    const existing = await BasketballScore.findOne({ telegramUserId }).lean();
    let newBest = false;

    if (!existing) {
        await BasketballScore.create({
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
                // refresh display name on every submission so the leaderboard
                // tracks renames
                ...(telegramUsername ? { telegramUsername } : {}),
                ...(firstName ? { firstName } : {}),
            },
        };
        if (willBeatBest) {
            update.$set.bestScore = intScore;
            update.$set.bestAchievedAt = now;
            newBest = true;
        }
        await BasketballScore.updateOne(
            // Conditional filter prevents stale overwrite under race
            { telegramUserId, ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}) },
            update
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        BasketballScore.countDocuments({}),
    ]);

    return { newBest, bestScore, rank, totalPlayers };
}

/**
 * Top-N leaderboard query.
 *
 * @param {Object} [args]
 * @param {number} [args.limit=10]
 * @returns {Promise<Array<{rank, telegramUserId, displayName, bestScore, bestAchievedAt, totalSubmissions}>>}
 */
export async function getLeaderboard({ limit = 10 } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await BasketballScore.find({})
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

/**
 * A given user's current rank + best. Cheap query — uses the
 * `bestScore: -1` index to count how many docs beat their score.
 */
export async function getMyStanding({ telegramUserId }) {
    const me = await BasketballScore.findOne({ telegramUserId }).lean();
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

/** Rank query helper — counts strictly higher scores + earlier ties. */
async function getRank(telegramUserId) {
    const me = await BasketballScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    // Strictly higher OR same score achieved earlier
    const ahead = await BasketballScore.countDocuments({
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
