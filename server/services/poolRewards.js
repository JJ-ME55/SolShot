/**
 * Pool Match-End Rewards Service
 *
 * Emits Gold + Tickets when a PoolMatch transitions to status='completed'.
 * Server-authoritative; clients display denormalised amounts from
 * PoolMatch.rewards (populated here).
 *
 * Per POOL_DESIGN_TARGET.md + designer spec §3:
 *   - Quick match win:     +G (ELO-weighted, 10–50), +1 TKT floor (both players), 0 SOL
 *   - Wagered match win:   +G + 1 TKT floor + SOL handled by escrow service elsewhere
 *   - Vs Computer win:     +G (difficulty-weighted, 5–25), +1 TKT floor (winner only — solo path)
 *   - Tournament round:    handled by tournament service (prize emission on bracket completion)
 *   - Marathon round:      handled by marathon service (per-round payouts run independently)
 *   - Practice:            zero rewards (skill-isolated)
 *
 * NOT emitted here:
 *   - SOL settlement (escrow.js / escrow-v2.js — that's its own atomic flow)
 *   - Leaderboard placement bonus (~100 TKT) — daily-aggregated by separate cron
 *   - Tournament prize distribution — Tournament service walks bracket on finish
 *   - Marathon milestone bonuses (streak 5/10/20) — Marathon service emits per-round
 *
 * Idempotency:
 *   - PoolMatch.rewards.emittedAt is the canary
 *   - If set, this is a re-call and no-op
 *   - Sets at the end after both ledgers write successfully
 *
 * Failure model:
 *   - Sequential writes (no Mongo session in V1 — Atlas free tier limits)
 *   - If gold write succeeds but ticket write fails, support reconciliation
 *     pathway: PoolMatch.rewards has partial state, manual rerun fixes it
 *   - All writes log errors via the supplied logger but never throw to caller;
 *     return value indicates partial vs full success
 */

import PoolMatch from '../models/PoolMatch.js';
import { PoolGoldBalance, PoolGoldTransaction } from '../models/PoolGoldLedger.js';
import { TicketBalance, TicketTransaction } from '../models/TicketLedger.js';

// ---------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------

// Quick + Wagered PvP (ELO-weighted)
const PVP_GOLD_BASE = 20;
const PVP_GOLD_PER_ELO_GAP = 1 / 20;     // +1 G per 20 ELO of opponent advantage
const PVP_GOLD_MIN = 10;
const PVP_GOLD_MAX = 50;

// Vs Computer (flat per difficulty)
const VS_COMPUTER_GOLD = Object.freeze({
    easy:    5,
    medium: 10,
    hard:   15,
    insane: 25
});

// Ticket floor — 1-3 per match (designer spec §2.2); fixed at 1 for V1 simplicity
// Placement bonus (~100 TKT) is daily-aggregated elsewhere.
const TICKET_FLOOR_PVP = 1;        // both players in PvP
const TICKET_FLOOR_VS_BOT = 1;     // winner only in vs computer

// ---------------------------------------------------------------------
// Pure calculation (testable without Mongo)
// ---------------------------------------------------------------------

/**
 * Gold for winning a Quick or Wagered PvP match.
 * @param {number} winnerElo - winner's rating at match start
 * @param {number} loserElo  - loser's rating at match start
 * @returns {number} Gold amount (integer)
 */
export function calculatePvpGold(winnerElo, loserElo) {
    const eloDelta = loserElo - winnerElo;   // positive = beat a stronger opponent
    const raw = PVP_GOLD_BASE + Math.round(eloDelta * PVP_GOLD_PER_ELO_GAP);
    return Math.max(PVP_GOLD_MIN, Math.min(PVP_GOLD_MAX, raw));
}

/**
 * Gold for beating a bot.
 * @param {'easy'|'medium'|'hard'|'insane'} difficulty
 * @returns {number}
 */
export function calculateVsComputerGold(difficulty) {
    return VS_COMPUTER_GOLD[difficulty] || 0;
}

/**
 * Compute the reward bundle for a completed match — pure function.
 * Caller uses this to populate Pool Card + drive the persistence step.
 *
 * @param {object} params
 * @param {string} params.mode  - 'quick'|'wagered'|'vs_computer'|'practice'|'tournament'|'marathon'
 * @param {object} params.winner - { eloAtStart, isAiBot, aiDifficulty }
 * @param {object} params.loser  - { eloAtStart, isAiBot }
 * @returns {{ winnerGold: number, winnerTickets: number, loserGold: number, loserTickets: number }}
 */
export function calculateRewardBundle({ mode, winner, loser }) {
    const bundle = { winnerGold: 0, winnerTickets: 0, loserGold: 0, loserTickets: 0 };

    if (mode === 'practice') return bundle;
    if (mode === 'tournament' || mode === 'marathon') return bundle; // handled by their own services

    if (mode === 'vs_computer') {
        // Winner is the human (or AI vs human — same payouts apply if a bot beats a human,
        // but bots don't have ledgers so we only emit if winner is human)
        if (!winner.isAiBot) {
            bundle.winnerGold = calculateVsComputerGold(winner.aiDifficulty || loser.aiDifficulty || 'easy');
            bundle.winnerTickets = TICKET_FLOOR_VS_BOT;
        }
        return bundle;
    }

    // Quick or Wagered (PvP)
    bundle.winnerGold = calculatePvpGold(winner.eloAtStart || 1000, loser.eloAtStart || 1000);
    bundle.winnerTickets = TICKET_FLOOR_PVP;
    bundle.loserGold = 0;                   // losers do NOT earn Gold
    bundle.loserTickets = TICKET_FLOOR_PVP; // but both get the participation floor
    return bundle;
}

// ---------------------------------------------------------------------
// Persistence — atomic-per-side, with idempotency guard
// ---------------------------------------------------------------------

/**
 * Credit a player's Gold balance + write the audit transaction.
 * @param {object} identity   - { telegramUserId?, walletAddress?, callsign? }
 * @param {number} amount     - positive integer
 * @param {string} type       - PoolGoldTransaction.type enum value
 * @param {object} refs       - { matchId?, tournamentId?, marathonRunId?, shopItemSku? }
 * @returns {Promise<{ balanceAfter: number }>}
 */
async function creditGold(identity, amount, type, refs = {}) {
    if (amount <= 0) return { balanceAfter: null };
    if (!identity || (!identity.telegramUserId && !identity.walletAddress)) return { balanceAfter: null };

    const filter = identity.telegramUserId
        ? { telegramUserId: identity.telegramUserId }
        : { walletAddress: identity.walletAddress };

    const setOnInsert = {
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        callsign:       identity.callsign || null
    };

    const bal = await PoolGoldBalance.findOneAndUpdate(
        filter,
        {
            $inc:         { balance: amount, lifetimeEarned: amount },
            $set:         { lastEarnedAt: new Date() },
            $setOnInsert: setOnInsert
        },
        { new: true, upsert: true }
    );

    await PoolGoldTransaction.create({
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        delta:          amount,
        balanceAfter:   bal.balance,
        type,
        matchId:        refs.matchId || null,
        tournamentId:   refs.tournamentId || null,
        marathonRunId:  refs.marathonRunId || null,
        shopItemSku:    refs.shopItemSku || null
    });

    return { balanceAfter: bal.balance };
}

/**
 * Credit a player's Ticket balance + write the audit transaction.
 * @param {object} identity
 * @param {number} amount
 * @param {string} type     - TicketTransaction.type enum value
 * @param {string} gameSlug - 'pool' for pool-originated emissions
 * @param {object} refs
 * @returns {Promise<{ balanceAfter: number }>}
 */
async function creditTickets(identity, amount, type, gameSlug, refs = {}) {
    if (amount <= 0) return { balanceAfter: null };
    if (!identity || (!identity.telegramUserId && !identity.walletAddress)) return { balanceAfter: null };

    const filter = identity.telegramUserId
        ? { telegramUserId: identity.telegramUserId }
        : { walletAddress: identity.walletAddress };

    const setOnInsert = {
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        callsign:       identity.callsign || null
    };

    const bal = await TicketBalance.findOneAndUpdate(
        filter,
        {
            $inc:         { balance: amount, lifetimeEarned: amount },
            $set:         { lastEarnedAt: new Date() },
            $setOnInsert: setOnInsert
        },
        { new: true, upsert: true }
    );

    await TicketTransaction.create({
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        delta:          amount,
        balanceAfter:   bal.balance,
        type,
        gameSlug,
        matchId:        refs.matchId || null,
        tournamentId:   refs.tournamentId || null,
        marathonRunId:  refs.marathonRunId || null
    });

    return { balanceAfter: bal.balance };
}

/**
 * Emit match-end rewards for a completed PoolMatch.
 * Idempotent — second call no-ops if rewards already emitted.
 *
 * @param {string} matchId - PoolMatch.matchId
 * @param {object} [opts]
 * @param {object} [opts.logger] - { info, warn, error }; defaults to console
 * @returns {Promise<{ ok: boolean, emitted: boolean, reason?: string, rewards?: object }>}
 */
export async function emitMatchEndRewards(matchId, opts = {}) {
    const logger = opts.logger || console;

    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, emitted: false, reason: 'match_not_found' };
    if (match.status !== 'completed' && match.status !== 'forfeited') {
        return { ok: false, emitted: false, reason: `status_${match.status}_not_eligible` };
    }
    if (match.rewards && match.rewards.emittedAt) {
        return { ok: true, emitted: false, reason: 'already_emitted', rewards: match.rewards };
    }
    if (match.winnerIdx === null || match.winnerIdx === undefined) {
        return { ok: false, emitted: false, reason: 'no_winner_set' };
    }

    const winner = match.players[match.winnerIdx];
    const loser  = match.players[1 - match.winnerIdx];

    const bundle = calculateRewardBundle({
        mode: match.mode,
        winner: {
            eloAtStart: winner.eloAtStart,
            isAiBot:    winner.isAiBot,
            aiDifficulty: winner.aiDifficulty
        },
        loser: {
            eloAtStart: loser.eloAtStart,
            isAiBot:    loser.isAiBot,
            aiDifficulty: loser.aiDifficulty
        }
    });

    // Map mode → transaction types
    const goldType = (match.mode === 'vs_computer') ? 'match_win' : 'match_win';
    const tktType  = 'match_floor';

    const refs = { matchId: match._id };
    const gameSlug = 'pool';

    // Emit (sequential — V1 acceptable risk profile)
    try {
        if (!winner.isAiBot && bundle.winnerGold > 0) {
            await creditGold(winner, bundle.winnerGold, goldType, refs);
        }
        if (!winner.isAiBot && bundle.winnerTickets > 0) {
            await creditTickets(winner, bundle.winnerTickets, tktType, gameSlug, refs);
        }
        if (!loser.isAiBot && bundle.loserGold > 0) {
            await creditGold(loser, bundle.loserGold, goldType, refs);
        }
        if (!loser.isAiBot && bundle.loserTickets > 0) {
            await creditTickets(loser, bundle.loserTickets, tktType, gameSlug, refs);
        }
    } catch (e) {
        logger.error('[poolRewards] emit failed mid-flight', { matchId, error: e.message });
        return { ok: false, emitted: true, reason: 'partial_emission_see_logs' };
    }

    // Denormalise onto match for fast Pool Card render
    match.rewards = {
        winnerGold:     bundle.winnerGold,
        winnerTickets:  bundle.winnerTickets,
        winnerSolLamports: match.rewards?.winnerSolLamports || 0,  // wagered settlement writes this elsewhere
        loserGold:      bundle.loserGold,
        loserTickets:   bundle.loserTickets,
        treasurySolLamports: match.rewards?.treasurySolLamports || 0,
        opsSolLamports: match.rewards?.opsSolLamports || 0
    };
    // Track emission with a dedicated field — added inline since schema is permissive
    match.set('rewards.emittedAt', new Date());
    await match.save();

    return { ok: true, emitted: true, rewards: bundle };
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_REWARDS_CONSTANTS = Object.freeze({
    PVP_GOLD_BASE,
    PVP_GOLD_PER_ELO_GAP,
    PVP_GOLD_MIN,
    PVP_GOLD_MAX,
    VS_COMPUTER_GOLD,
    TICKET_FLOOR_PVP,
    TICKET_FLOOR_VS_BOT
});

export default {
    calculatePvpGold,
    calculateVsComputerGold,
    calculateRewardBundle,
    emitMatchEndRewards,
    POOL_REWARDS_CONSTANTS
};
