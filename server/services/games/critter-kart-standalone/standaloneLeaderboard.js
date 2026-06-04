/**
 * Critter Kart leaderboard service — career-aggregate (Grand Prix) shape.
 *
 * Distinct from the skill-game leaderboard services (free-kicks /
 * keepie-uppies / basketball) which track a single `bestScore`. Critter
 * Kart is a racer — players accrue points across many races. Schema
 * is `CritterKartCareer`, sorted by `totalPoints` DESC.
 *
 * JWT pattern (mint/verify) is identical to the skill services:
 *   - HS256, 30d TTL
 *   - issuer 'arcade-bot:critterkart'
 *   - signing secret CRITTER_KART_LEADERBOARD_SECRET (Render env)
 *
 * Public API:
 *   mintSession({telegramUserId, telegramUsername?, firstName?}) → JWT
 *   verifySession(token) → { telegramUserId, telegramUsername, firstName }
 *   submitRace({telegramUserId, telegramUsername?, firstName?, points, pos, bestLapMs, raceTimeMs})
 *       → { newRecord, totalPoints, races, wins, podiums, rank, totalPlayers, bestLapTimeMs }
 *   getLeaderboard({limit?, since?}) → [{rank, telegramUserId, displayName, totalPoints, ...}]
 *   getMyStanding({telegramUserId}) → {rank, totalPoints, races, ...} | null
 */

import jwt from 'jsonwebtoken';
import CritterKartCareer from '../../../models/CritterKartCareer.js';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
// 7d — matches the 2026-06-03 AAA hardening pass on basketball /
// keepie-uppies / free-kicks leaderboards. Bumped down from the 30d
// initial value to shrink the steal-and-replay window. Re-launching
// the bot mints a fresh JWT, so no UX impact for active players.
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:critterkart';

function getSecret() {
    const secret = process.env.CRITTER_KART_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[critterkart-leaderboard] FATAL: CRITTER_KART_LEADERBOARD_SECRET must be set in production');
            throw new Error('CRITTER_KART_LEADERBOARD_SECRET missing');
        }
        if (!process.env._CRITTERKART_DEV_SECRET_WARNED) {
            console.warn('[critterkart-leaderboard] CRITTER_KART_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._CRITTERKART_DEV_SECRET_WARNED = '1';
            process.env._CRITTERKART_DEV_SECRET = require('crypto').randomBytes(32).toString('hex');
        }
        return process.env._CRITTERKART_DEV_SECRET;
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

// ─── Race-submit + leaderboard ──────────────────────────────────────────

// Reasonable per-race ceilings — reject obvious garbage but leave runway
// for legit play. Position points: cap at 50 (Mario Kart F-tier rewards
// 15 for 1st of 6; a 50-cap is generous). Best lap: cap at 10 min (most
// laps complete in under 90s).
const MAX_POINTS_PER_RACE   = 50;
const MAX_LAP_TIME_MS       = 10 * 60 * 1000;   // 10 minutes
const MAX_RACE_TIME_MS      = 30 * 60 * 1000;   // 30 minutes
const MIN_POSITION          = 1;
const MAX_POSITION          = 16;               // Mario Kart 8: 12-player; budget 16 for headroom

/**
 * Apply a single race finish to the player's career aggregate. Idempotency
 * is by best-effort — duplicate submissions WILL double-count because we
 * don't have a per-race ID. The client retry layer (localStorage stash)
 * is designed not to re-submit successful POSTs, so the practical risk is
 * low. If we add per-race IDs later, this is where the de-dup goes.
 */
export async function submitRace({
    telegramUserId, telegramUsername, firstName,
    points, pos, bestLapMs, raceTimeMs,
}) {
    if (!Number.isFinite(points) || points < 0 || points > MAX_POINTS_PER_RACE) {
        throw new Error(`points out of range (0..${MAX_POINTS_PER_RACE})`);
    }
    if (!Number.isInteger(pos) || pos < MIN_POSITION || pos > MAX_POSITION) {
        throw new Error(`pos out of range (${MIN_POSITION}..${MAX_POSITION})`);
    }
    if (bestLapMs != null && (!Number.isFinite(bestLapMs) || bestLapMs <= 0 || bestLapMs > MAX_LAP_TIME_MS)) {
        throw new Error(`bestLapMs out of range (0..${MAX_LAP_TIME_MS})`);
    }
    if (raceTimeMs != null && (!Number.isFinite(raceTimeMs) || raceTimeMs <= 0 || raceTimeMs > MAX_RACE_TIME_MS)) {
        throw new Error(`raceTimeMs out of range (0..${MAX_RACE_TIME_MS})`);
    }

    const now = new Date();
    const isWin = pos === 1;
    const isPodium = pos <= 3;
    const intPoints = Math.floor(points);
    const intBestLap = bestLapMs != null ? Math.floor(bestLapMs) : null;

    const existing = await CritterKartCareer.findOne({ telegramUserId }).lean();

    if (!existing) {
        await CritterKartCareer.create({
            telegramUserId,
            telegramUsername: telegramUsername || null,
            firstName: firstName || null,
            totalPoints: intPoints,
            races: 1,
            wins: isWin ? 1 : 0,
            podiums: isPodium ? 1 : 0,
            bestLapTimeMs: intBestLap,
            bestLapAchievedAt: intBestLap != null ? now : null,
            firstRaceAt: now,
            lastRaceAt: now,
        });
        const rank = await getRank(telegramUserId);
        const totalPlayers = await CritterKartCareer.countDocuments({});
        return {
            newRecord: true,
            totalPoints: intPoints,
            races: 1,
            wins: isWin ? 1 : 0,
            podiums: isPodium ? 1 : 0,
            bestLapTimeMs: intBestLap,
            rank,
            totalPlayers,
        };
    }

    // Build atomic update. bestLap only updates if the new lap beats the
    // existing best (or no existing best is set).
    const willBeatLap = intBestLap != null && (
        existing.bestLapTimeMs == null || intBestLap < existing.bestLapTimeMs
    );
    const update = {
        $inc: {
            totalPoints: intPoints,
            races: 1,
            wins: isWin ? 1 : 0,
            podiums: isPodium ? 1 : 0,
        },
        $set: {
            lastRaceAt: now,
            ...(telegramUsername ? { telegramUsername } : {}),
            ...(firstName ? { firstName } : {}),
            ...(willBeatLap ? { bestLapTimeMs: intBestLap, bestLapAchievedAt: now } : {}),
        },
    };
    await CritterKartCareer.updateOne({ telegramUserId }, update);

    const after = await CritterKartCareer.findOne({ telegramUserId }).lean();
    const [rank, totalPlayers] = await Promise.all([
        getRank(telegramUserId),
        CritterKartCareer.countDocuments({}),
    ]);

    return {
        newRecord: willBeatLap,   // surfaced for "🏁 NEW BEST LAP" UI cue
        totalPoints: after.totalPoints,
        races: after.races,
        wins: after.wins,
        podiums: after.podiums,
        bestLapTimeMs: after.bestLapTimeMs,
        rank,
        totalPlayers,
    };
}

/**
 * Optional time-window filter via `since` (matches free-kicks /
 * basketball pattern from the 2026-05-28 windowing work). For aggregate
 * career stats, `since` filters by lastRaceAt — "leaderboard of players
 * who have raced in the last 7d".
 */
export async function getLeaderboard({ limit = 10, since = null } = {}) {
    const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
    const filter = since instanceof Date && !isNaN(since.getTime())
        ? { lastRaceAt: { $gte: since } }
        : {};
    const rows = await CritterKartCareer.find(filter)
        .sort({ totalPoints: -1, lastRaceAt: 1 })
        .limit(clamped)
        .lean();
    // SECURITY: telegramUserId stripped from public LB response — PII leak.
    // See basketball-leaderboard.js for context (2026-06-03 AAA hardening).
    // Standing endpoint still returns TG id for the requesting user only.
    return rows.map((r, i) => ({
        rank: i + 1,
        displayName: formatDisplayName(r),
        // Shape-compatible: skill games expose `bestScore`, racer exposes
        // `totalPoints`. The hub's useLeaderboardData adapter knows the
        // game type and renders accordingly.
        bestScore: r.totalPoints,
        totalPoints: r.totalPoints,
        races: r.races,
        wins: r.wins,
        podiums: r.podiums,
        winRate: r.races > 0 ? r.wins / r.races : 0,
        podiumRate: r.races > 0 ? r.podiums / r.races : 0,
        bestLapTimeMs: r.bestLapTimeMs,
        lastRaceAt: r.lastRaceAt,
    }));
}

export async function getMyStanding({ telegramUserId }) {
    const me = await CritterKartCareer.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const rank = await getRank(telegramUserId);
    return {
        rank,
        // Compatibility alias for the bot's generic LEADERBOARDS shape
        // which expects `bestScore` + `totalSubmissions`.
        bestScore: me.totalPoints,
        totalSubmissions: me.races,
        totalPoints: me.totalPoints,
        races: me.races,
        wins: me.wins,
        podiums: me.podiums,
        bestLapTimeMs: me.bestLapTimeMs,
        bestAchievedAt: me.bestLapAchievedAt,
        lastRaceAt: me.lastRaceAt,
        displayName: formatDisplayName(me),
    };
}

async function getRank(telegramUserId) {
    const me = await CritterKartCareer.findOne({ telegramUserId }).lean();
    if (!me) return null;
    const ahead = await CritterKartCareer.countDocuments({
        $or: [
            { totalPoints: { $gt: me.totalPoints } },
            { totalPoints: me.totalPoints, lastRaceAt: { $lt: me.lastRaceAt } },
        ],
    });
    return ahead + 1;
}

function formatDisplayName(row) {
    if (row.telegramUsername) return `@${row.telegramUsername}`;
    if (row.firstName) return row.firstName;
    return `Player ${String(row.telegramUserId).slice(-4)}`;
}
