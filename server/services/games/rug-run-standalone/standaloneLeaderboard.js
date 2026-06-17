/**
 * Standalone RUG RUN leaderboard service.
 *
 * For the free-play standalone game served from the arcade hub at
 * thearcade.gg/play/rug-run. Scores are submitted by the client over HTTP,
 * gated by a server-signed JWT that the arcade bot mints when the user taps
 * /rugrun. The JWT carries the user's Telegram identity, so every submission
 * is verifiable-tied to a TG user without requiring wallet signature.
 *
 * RUG RUN ranks on TWO metrics:
 *   - score  → bestScore (int = round(banked×100)), the DAILY board metric.
 *   - streak → bestStreakPnl, the accumulated streak multiplier / PnL, the
 *              WEEKLY / ALL-TIME board metric (ride the pump, bank before the rug).
 *
 * Mirrors server/services/games/basketball-standalone/standaloneLeaderboard.js.
 *
 * Public API:
 *   mintSession({telegramUserId, telegramUsername?, firstName?})
 *       → JWT string the arcade bot embeds in /rugrun launch URL
 *   verifySession(token)
 *       → decoded TG identity, or throws on invalid/expired
 *   submitScore({telegramUserId, telegramUsername?, firstName?, score, banked?, streak?, pnl?})
 *       → { newBest, bestScore, bestStreakPnl, newBestStreak, rank, totalPlayers }
 *   getLeaderboard({limit?, since?, metric?})
 *       → [{rank, displayName, bestScore, bestStreakPnl, bestAchievedAt, ...}, ...]
 *   getMyStanding({telegramUserId})
 *       → { rankScore, rankStreak, bestScore, bestStreakPnl, totalSubmissions } | null
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import RugRunScore from '../../../models/RugRunScore.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
// 7 days — same window as basketball-standalone (AAA hardening pass): a
// shorter session window shrinks the steal-and-replay surface without
// hurting UX (bot users get fresh JWTs each `/rugrun` tap anyway).
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:rug-run';

function getSecret() {
    const secret = process.env.RUG_RUN_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[rug-run-leaderboard] FATAL: RUG_RUN_LEADERBOARD_SECRET must be set in production');
            throw new Error('RUG_RUN_LEADERBOARD_SECRET missing');
        }
        // Dev fallback — same pattern as basketball-standalone. Tokens don't
        // survive process restart but local iteration keeps working.
        if (!process.env._RUG_RUN_DEV_SECRET_WARNED) {
            console.warn('[rug-run-leaderboard] RUG_RUN_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._RUG_RUN_DEV_SECRET_WARNED = '1';
            // NOTE: basketball-standalone uses `require('crypto')` here, which
            // throws in this ESM module — its dev-no-secret path is effectively
            // broken. We use the ESM `randomBytes` import so the rug-run dev
            // fallback actually works locally. Prod still requires the env var.
            process.env._RUG_RUN_DEV_SECRET = randomBytes(32).toString('hex');
        }
        return process.env._RUG_RUN_DEV_SECRET;
    }
    return secret;
}

/**
 * Mint a session token. Called by the arcade bot when generating the
 * /rugrun launch URL — token gets embedded as `?session=<jwt>` so the
 * standalone client can forward it on score submissions.
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

const MAX_PLAUSIBLE_SCORE = 1_000_000;  // generous upper bound; tighten after we see real data
const MAX_PLAUSIBLE_PNL = 1_000_000;    // accumulated streak multiplier ceiling

/**
 * Submit a run result. Upserts the user's leaderboard row.
 *   - `bestScore`     is the max of submitted `score` values (banked amount,
 *                     int = round(banked×100)).
 *   - `bestStreakPnl` is the max of submitted `pnl` values (accumulated
 *                     streak multiplier).
 * Each metric updates independently when its new value beats the stored best.
 * Always increments `totalSubmissions` and stamps `lastSubmittedAt`.
 *
 * @param {Object} args
 * @param {number} args.telegramUserId
 * @param {string} [args.telegramUsername]
 * @param {string} [args.firstName]
 * @param {number} args.score   banked amount (int = round(banked×100))
 * @param {number} [args.banked] raw banked amount (informational; score is authoritative)
 * @param {number} [args.streak] streak count this run (informational)
 * @param {number} [args.pnl]    accumulated streak multiplier / PnL for the streak board
 * @returns {Promise<{newBest, bestScore, bestStreakPnl, newBestStreak, rank, totalPlayers}>}
 */
export async function submitScore({ telegramUserId, telegramUsername, firstName, score, banked, streak, pnl }) {
    if (!Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        throw new Error(`score out of range (0..${MAX_PLAUSIBLE_SCORE})`);
    }
    const intScore = Math.floor(score);
    // PnL (streak multiplier) is optional — default 0 when not supplied.
    const pnlVal = Number.isFinite(pnl) ? pnl : 0;
    if (pnlVal < 0 || pnlVal > MAX_PLAUSIBLE_PNL) {
        throw new Error(`pnl out of range (0..${MAX_PLAUSIBLE_PNL})`);
    }
    const now = new Date();

    // Two-step approach: fetch existing best, decide whether to update each
    // metric, then do an atomic conditional update. The conditional filter
    // prevents a stale overwrite under concurrent writes.
    const existing = await RugRunScore.findOne({ telegramUserId }).lean();
    let newBest = false;
    let newBestStreak = false;

    if (!existing) {
        await RugRunScore.create({
            telegramUserId,
            telegramUsername: telegramUsername || null,
            firstName: firstName || null,
            bestScore: intScore,
            bestStreakPnl: pnlVal,
            totalSubmissions: 1,
            firstSubmittedAt: now,
            lastSubmittedAt: now,
            bestAchievedAt: now,
            bestStreakPnlAt: now,
        });
        newBest = true;
        newBestStreak = true;
    } else {
        const willBeatBest = intScore > existing.bestScore;
        const willBeatStreak = pnlVal > (existing.bestStreakPnl || 0);
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
        if (willBeatStreak) {
            update.$set.bestStreakPnl = pnlVal;
            update.$set.bestStreakPnlAt = now;
            newBestStreak = true;
        }
        await RugRunScore.updateOne(
            // Conditional filter prevents stale overwrite under race on either
            // metric. Only constrain a metric we intend to raise.
            {
                telegramUserId,
                ...(willBeatBest ? { bestScore: { $lt: intScore } } : {}),
                ...(willBeatStreak ? { bestStreakPnl: { $lt: pnlVal } } : {}),
            },
            update
        );
    }

    const bestScore = newBest ? intScore : existing.bestScore;
    const bestStreakPnl = newBestStreak ? pnlVal : (existing.bestStreakPnl || 0);
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId, 'score'),
        RugRunScore.countDocuments({}),
    ]);

    return { newBest, bestScore, bestStreakPnl, newBestStreak, rank, totalPlayers };
}

/**
 * Top-N leaderboard query.
 *
 * @param {Object} [args]
 * @param {number} [args.limit=10]
 * @param {Date|null} [args.since=null]  Filter to users whose best was achieved
 *   on/after this date. Lets the client drive 24h/7d/all-time windows. NOTE:
 *   the schema stores one row per user (only the all-time best). "24h window"
 *   therefore means "users who set their personal best in the last 24h".
 *   The `since` filter is applied against the timestamp matching the chosen
 *   metric (`bestAchievedAt` for score, `bestStreakPnlAt` for streak).
 * @param {'score'|'streak'} [args.metric='score']  Ranking metric. 'score'
 *   ranks by bestScore (daily board); 'streak' ranks by bestStreakPnl
 *   (weekly/all-time board).
 * @returns {Promise<Array<{rank, displayName, bestScore, bestStreakPnl, bestAchievedAt, bestStreakPnlAt, totalSubmissions}>>}
 */
export async function getLeaderboard({ limit = 10, since = null, metric = 'score' } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const useStreak = metric === 'streak';
    const sortField = useStreak ? 'bestStreakPnl' : 'bestScore';
    const tieField = useStreak ? 'bestStreakPnlAt' : 'bestAchievedAt';
    const sinceField = useStreak ? 'bestStreakPnlAt' : 'bestAchievedAt';
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { [sinceField]: { $gte: since } }
        : {};
    const rows = await RugRunScore.find(filter)
        .sort({ [sortField]: -1, [tieField]: 1 })
        .limit(clamped)
        .lean();
    // SECURITY: do NOT include telegramUserId in the public LB response (PII).
    // The display name is what the UI shows. Standing endpoints still return
    // TG id for the requesting user only.
    return rows.map((r, i) => ({
        rank: i + 1,
        displayName: formatDisplayName(r),
        bestScore: r.bestScore,
        bestStreakPnl: r.bestStreakPnl || 0,
        bestAchievedAt: r.bestAchievedAt,
        bestStreakPnlAt: r.bestStreakPnlAt,
        totalSubmissions: r.totalSubmissions,
    }));
}

/**
 * A given user's current rank + best, for BOTH metrics. Cheap queries —
 * use the per-metric compound indexes to count how many docs beat them.
 */
export async function getMyStanding({ telegramUserId }) {
    const me = await RugRunScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const [rankScore, rankStreak] = await Promise.all([
        getRank(telegramUserId, 'score'),
        getRank(telegramUserId, 'streak'),
    ]);
    return {
        rankScore,
        rankStreak,
        // `rank` / `bestScore` default to the score metric so callers that
        // expect the basketball-shaped contract (rank + bestScore) keep working.
        rank: rankScore,
        bestScore: me.bestScore,
        bestStreakPnl: me.bestStreakPnl || 0,
        totalSubmissions: me.totalSubmissions,
        bestAchievedAt: me.bestAchievedAt,
        bestStreakPnlAt: me.bestStreakPnlAt,
        displayName: formatDisplayName(me),
    };
}

/** Rank query helper — counts strictly higher values + earlier ties for the
 *  given metric ('score' or 'streak'). */
async function getRank(telegramUserId, metric = 'score') {
    const me = await RugRunScore.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const useStreak = metric === 'streak';
    const valField = useStreak ? 'bestStreakPnl' : 'bestScore';
    const tieField = useStreak ? 'bestStreakPnlAt' : 'bestAchievedAt';
    const myVal = me[valField] || 0;
    const myTie = me[tieField];
    // Strictly higher OR same value achieved earlier
    const ahead = await RugRunScore.countDocuments({
        $or: [
            { [valField]: { $gt: myVal } },
            { [valField]: myVal, [tieField]: { $lt: myTie } },
        ],
    });
    return ahead + 1;
}

function formatDisplayName(row) {
    if (row.telegramUsername) return `@${row.telegramUsername}`;
    if (row.firstName) return row.firstName;
    return `Player ${String(row.telegramUserId).slice(-4)}`;
}
