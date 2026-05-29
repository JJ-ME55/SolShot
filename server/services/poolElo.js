/**
 * Pool ELO Service
 *
 * Server-authoritative ELO calculation + persistence for 8-ball pool
 * PvP matches. Honors the locked design contracts:
 *   - Skill-based matchmaking (this is the rating that drives it)
 *   - Rate-based leaderboards (ELO is the primary metric)
 *   - Anti-smurf gates (provisional flag, wager/tourney unlock thresholds)
 *   - Floor at 200 (prevents intentional tanking)
 *
 * NOT updated by: vs Computer, Marathon, Practice. Those are skill-isolated
 * solo modes per POOL_DESIGN_TARGET.md §7.3.
 *
 * Identity: caller passes either a `telegramUserId` (bot users) or a
 * `walletAddress` (web/Privy users). The merge resolver picks the
 * canonical doc — if both are present and they map to different docs,
 * the older (lower matchCount) one is treated as a duplicate and ignored.
 *
 * Persistence: PoolElo Mongoose model. All mutations atomic via $inc/$set.
 */

import PoolElo from '../models/PoolElo.js';

// ---------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------

const DEFAULT_RATING = 1000;
const DEFAULT_K_FACTOR = 32;
const PROVISIONAL_K_FACTOR = 64;        // wider movement first 10 matches
const PROVISIONAL_MATCH_THRESHOLD = 10;
const RATING_FLOOR = 200;

// Anti-smurf gate thresholds (designer spec §4)
const WAGER_UNLOCK_MATCH_COUNT = 25;
const PAID_TOURNEY_UNLOCK_MATCH_COUNT = 10;

// Weekly inactivity decay (caller decides when to invoke — usually a cron job)
const DECAY_PER_WEEK = 5;
const DECAY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------

/**
 * Expected score for player A vs player B.
 * Standard ELO: 1 / (1 + 10^((B - A) / 400))
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number} 0..1
 */
export function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Compute new ratings after a match result.
 * @param {number} ratingA
 * @param {number} ratingB
 * @param {number} actualA - 1 if A won, 0 if A lost, 0.5 if draw
 * @param {number} kA - K-factor for A
 * @param {number} kB - K-factor for B
 * @returns {{ ratingA: number, ratingB: number, deltaA: number, deltaB: number }}
 */
export function calculateNewRatings(ratingA, ratingB, actualA, kA = DEFAULT_K_FACTOR, kB = DEFAULT_K_FACTOR) {
    const actualB = 1 - actualA;
    const expA = expectedScore(ratingA, ratingB);
    const expB = expectedScore(ratingB, ratingA);

    const deltaA = Math.round(kA * (actualA - expA));
    const deltaB = Math.round(kB * (actualB - expB));

    return {
        ratingA: Math.max(RATING_FLOOR, ratingA + deltaA),
        ratingB: Math.max(RATING_FLOOR, ratingB + deltaB),
        deltaA,
        deltaB
    };
}

// ---------------------------------------------------------------------
// Identity resolution + persistence
// ---------------------------------------------------------------------

/**
 * Find or create the PoolElo document for a player.
 * Either identity is accepted; both is preferred so cross-platform
 * play converges on one doc.
 *
 * @param {{ telegramUserId?: number, walletAddress?: string, callsign?: string }} identity
 * @returns {Promise<PoolElo>}
 */
export async function getOrCreateEloDoc(identity) {
    if (!identity || (!identity.telegramUserId && !identity.walletAddress)) {
        throw new Error('getOrCreateEloDoc: identity must include telegramUserId or walletAddress');
    }

    // Build the OR query — match on either identity if present.
    const orClauses = [];
    if (identity.telegramUserId) orClauses.push({ telegramUserId: identity.telegramUserId });
    if (identity.walletAddress) orClauses.push({ walletAddress: identity.walletAddress });

    let doc = await PoolElo.findOne({ $or: orClauses });

    if (!doc) {
        doc = await PoolElo.create({
            telegramUserId: identity.telegramUserId || null,
            walletAddress: identity.walletAddress || null,
            callsign: identity.callsign || null,
            rating: DEFAULT_RATING,
            kFactor: DEFAULT_K_FACTOR,
            provisional: true,
            highestRating: DEFAULT_RATING
        });
    } else {
        // Backfill identity fields if caller now has more info
        let dirty = false;
        if (!doc.telegramUserId && identity.telegramUserId) { doc.telegramUserId = identity.telegramUserId; dirty = true; }
        if (!doc.walletAddress && identity.walletAddress) { doc.walletAddress = identity.walletAddress; dirty = true; }
        if (identity.callsign && doc.callsign !== identity.callsign) { doc.callsign = identity.callsign; dirty = true; }
        if (dirty) await doc.save();
    }

    return doc;
}

/**
 * Apply a completed match result — updates both players' ELO docs.
 * Caller responsibility: only call for PvP modes (quick / wagered /
 * tournament round). Never for vs_computer / marathon / practice.
 *
 * @param {object} params
 * @param {object} params.playerA - identity of player A
 * @param {object} params.playerB - identity of player B
 * @param {0|1} params.winnerIdx - 0 = A won, 1 = B won
 * @returns {Promise<{ aDoc, bDoc, deltaA, deltaB, ratingA, ratingB }>}
 */
export async function applyMatchResult({ playerA, playerB, winnerIdx }) {
    if (winnerIdx !== 0 && winnerIdx !== 1) {
        throw new Error(`applyMatchResult: winnerIdx must be 0 or 1, got ${winnerIdx}`);
    }

    const [aDoc, bDoc] = await Promise.all([
        getOrCreateEloDoc(playerA),
        getOrCreateEloDoc(playerB)
    ]);

    const aWon = winnerIdx === 0 ? 1 : 0;
    const { ratingA, ratingB, deltaA, deltaB } = calculateNewRatings(
        aDoc.rating,
        bDoc.rating,
        aWon,
        aDoc.kFactor,
        bDoc.kFactor
    );

    // Update A
    aDoc.rating = ratingA;
    aDoc.matchCount += 1;
    aDoc.lastActiveAt = new Date();
    if (aWon === 1) {
        aDoc.wins += 1;
        aDoc.currentWinStreak += 1;
        if (aDoc.currentWinStreak > aDoc.longestWinStreak) aDoc.longestWinStreak = aDoc.currentWinStreak;
    } else {
        aDoc.losses += 1;
        aDoc.currentWinStreak = 0;
    }
    if (aDoc.rating > aDoc.highestRating) {
        aDoc.highestRating = aDoc.rating;
        aDoc.highestRatingAt = new Date();
    }
    if (aDoc.provisional && aDoc.matchCount >= PROVISIONAL_MATCH_THRESHOLD) {
        aDoc.provisional = false;
        aDoc.kFactor = DEFAULT_K_FACTOR;
    }
    if (aDoc.matchCount >= WAGER_UNLOCK_MATCH_COUNT) aDoc.canWagerAboveLowStake = true;
    if (aDoc.matchCount >= PAID_TOURNEY_UNLOCK_MATCH_COUNT) aDoc.canEnterPaidTourney = true;

    // Update B (mirror)
    bDoc.rating = ratingB;
    bDoc.matchCount += 1;
    bDoc.lastActiveAt = new Date();
    if (aWon === 0) {
        bDoc.wins += 1;
        bDoc.currentWinStreak += 1;
        if (bDoc.currentWinStreak > bDoc.longestWinStreak) bDoc.longestWinStreak = bDoc.currentWinStreak;
    } else {
        bDoc.losses += 1;
        bDoc.currentWinStreak = 0;
    }
    if (bDoc.rating > bDoc.highestRating) {
        bDoc.highestRating = bDoc.rating;
        bDoc.highestRatingAt = new Date();
    }
    if (bDoc.provisional && bDoc.matchCount >= PROVISIONAL_MATCH_THRESHOLD) {
        bDoc.provisional = false;
        bDoc.kFactor = DEFAULT_K_FACTOR;
    }
    if (bDoc.matchCount >= WAGER_UNLOCK_MATCH_COUNT) bDoc.canWagerAboveLowStake = true;
    if (bDoc.matchCount >= PAID_TOURNEY_UNLOCK_MATCH_COUNT) bDoc.canEnterPaidTourney = true;

    await Promise.all([aDoc.save(), bDoc.save()]);

    return { aDoc, bDoc, deltaA, deltaB, ratingA, ratingB };
}

/**
 * Apply inactivity decay to a single player. Idempotent — won't double-decay.
 * Typically called by a weekly cron sweeping the PoolElo collection sorted
 * by lastActiveAt asc.
 *
 * @param {PoolElo} doc - the loaded ELO doc
 * @param {Date} [now=new Date()]
 * @returns {Promise<{ decayed: boolean, weeksLapsed: number }>}
 */
export async function applyInactivityDecay(doc, now = new Date()) {
    const elapsed = now - new Date(doc.lastDecayAt);
    if (elapsed < DECAY_INTERVAL_MS) return { decayed: false, weeksLapsed: 0 };

    const weeksLapsed = Math.floor(elapsed / DECAY_INTERVAL_MS);
    const totalDecay = weeksLapsed * DECAY_PER_WEEK;
    const newRating = Math.max(RATING_FLOOR, doc.rating - totalDecay);

    if (newRating === doc.rating) {
        // Already at floor — just bump the cursor so we don't re-check next week
        doc.lastDecayAt = now;
        await doc.save();
        return { decayed: false, weeksLapsed };
    }

    doc.rating = newRating;
    doc.lastDecayAt = now;
    await doc.save();
    return { decayed: true, weeksLapsed };
}

/**
 * Provisional rating ladder match-up gate.
 * Provisional players (< 10 matches) get a wider matchmaking spread.
 * @param {PoolElo} doc
 * @returns {number} pixels to widen the search band by (combined ±)
 */
export function provisionalSearchBoost(doc) {
    return doc.provisional ? 100 : 0;
}

// ---------------------------------------------------------------------
// Exports (constants for callers that want them)
// ---------------------------------------------------------------------

export const POOL_ELO_CONSTANTS = Object.freeze({
    DEFAULT_RATING,
    DEFAULT_K_FACTOR,
    PROVISIONAL_K_FACTOR,
    PROVISIONAL_MATCH_THRESHOLD,
    RATING_FLOOR,
    WAGER_UNLOCK_MATCH_COUNT,
    PAID_TOURNEY_UNLOCK_MATCH_COUNT,
    DECAY_PER_WEEK,
    DECAY_INTERVAL_MS
});

export default {
    expectedScore,
    calculateNewRatings,
    getOrCreateEloDoc,
    applyMatchResult,
    applyInactivityDecay,
    provisionalSearchBoost,
    POOL_ELO_CONSTANTS
};
