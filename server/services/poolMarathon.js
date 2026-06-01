/**
 * Pool Marathon Engine — trick-shot lives mode.
 *
 * Per Side Pocket DECISIONS_2026-06-01 §5: marathon is a trick-shot
 * lives mode (REPLACES the bot-ladder shape that previously lived in
 * this file).
 *
 *   - 3 lives total across the whole run (no per-setup reset)
 *   - Curated trick-shot setups from the server-held catalogue
 *     (services/pool/marathon-catalogue.js)
 *   - Player attempts a setup → either:
 *       'completed' (success: streak++, +gold, milestone TKT possible)
 *       'lives_exhausted' (final miss: -1 life landed on 0, run ends)
 *       'skipped' (voluntary: streak resets, no score, perfectRun→false)
 *   - Voluntary BANK STREAK at any point → status='ended_cashout' +
 *     applies perfect-run bonus if applicable
 *   - NO difficulty floor / NO Easy-Hard picker (one entry, one leaderboard)
 *
 * Skill-isolated: NEVER touches PvP ELO. NEVER touches PvP leaderboards.
 * Has its own single leaderboard (daily / weekly / all-time scopes).
 */

import crypto from 'crypto';
import MarathonRun from '../models/MarathonRun.js';
import { PoolGoldBalance, PoolGoldTransaction } from '../models/PoolGoldLedger.js';
import { TicketBalance, TicketTransaction } from '../models/TicketLedger.js';
import {
    pickNextSetup,
    scoreCompletedSetup,
    perfectRunBonus,
    MARATHON_CATALOGUE_STATS
} from './pool/marathon-catalogue.js';

// ---------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------

const DEFAULT_LIVES = 3;
const MAX_LIVES = 5;     // reserved for future "first attempt of the day gets +1 life" perks

// ---------------------------------------------------------------------
// Pure helpers (testable without Mongo)
// ---------------------------------------------------------------------

/**
 * Generate a fresh run ID.
 * @returns {string} 'mr_<8hex>'
 */
export function generateRunId() {
    return 'mr_' + crypto.randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------
// Persistence — run lifecycle
// ---------------------------------------------------------------------

/**
 * Start a new marathon run.
 *
 * NO difficulty parameter — per design, marathon is a single entry mode
 * with auto-ladder difficulty progression.
 *
 * @param {object} params
 * @param {object} params.identity - { telegramUserId?, walletAddress?, callsign? }
 * @returns {Promise<{ ok: boolean, runId?: string, run?: MarathonRun, firstSetup?: object, reason?: string }>}
 */
export async function startRun({ identity }) {
    if (!identity || (!identity.telegramUserId && !identity.walletAddress)) {
        return { ok: false, reason: 'identity_required' };
    }

    const runId = generateRunId();
    const firstSetup = pickNextSetup({ setupsAttempted: 0 });
    if (!firstSetup) {
        return { ok: false, reason: 'catalogue_empty' };
    }

    const run = await MarathonRun.create({
        runId,
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        callsign:       identity.callsign || null,

        livesAtStart:   DEFAULT_LIVES,
        livesRemaining: DEFAULT_LIVES,

        setupsCompleted: 0,
        setupsAttempted: 0,
        currentStreak:   0,
        longestStreak:   0,
        perfectRun:      true,
        totalScore:      0,
        highestTierReached: firstSetup.tier,

        rounds: [],
        earnedGold: 0,
        earnedTickets: 0,
        milestoneTicketsClaimed: [],

        status: 'active',
        startedAt: new Date()
    });

    return { ok: true, runId, run, firstSetup };
}

/**
 * Record the outcome of a single trick-shot setup attempt.
 *
 * @param {string} runId
 * @param {object} params
 * @param {string} params.setupId         - the setup the player just attempted (id from catalogue)
 * @param {'completed'|'lives_exhausted'|'skipped'} params.outcome
 * @param {number} [params.livesUsedThisRound=0]  - lives spent on this setup (0 = first-attempt completion)
 * @param {string|null} [params.matchId]  - PoolMatch ObjectId for the underlying physics attempt
 * @param {number} [params.shotCount=0]
 * @param {number} [params.durationMs=0]
 * @param {object} [opts]
 * @param {object} [opts.logger]
 * @returns {Promise<{ ok: boolean, run?: MarathonRun, nextSetup?: object, runEnded?: boolean, gold?: number, milestoneTickets?: number, reason?: string }>}
 */
export async function recordSetupOutcome(runId, {
    setupId,
    outcome,
    livesUsedThisRound = 0,
    matchId = null,
    shotCount = 0,
    durationMs = 0
}, opts = {}) {
    const logger = opts.logger || console;
    const run = await MarathonRun.findOne({ runId });
    if (!run) return { ok: false, reason: 'run_not_found' };
    if (run.status !== 'active') return { ok: false, reason: `status_${run.status}_not_active` };

    if (!['completed', 'lives_exhausted', 'skipped'].includes(outcome)) {
        return { ok: false, reason: `invalid_outcome_${outcome}` };
    }

    // Resolve the setup from the catalogue (need its tier + base reward)
    const { getSetupById } = await import('./pool/marathon-catalogue.js');
    const setup = getSetupById(setupId);
    if (!setup) return { ok: false, reason: `setup_${setupId}_not_in_catalogue` };

    // Apply lives spent
    if (livesUsedThisRound > 0) {
        run.livesRemaining = Math.max(0, run.livesRemaining - livesUsedThisRound);
    }

    let goldThisSetup = 0;
    let ticketsThisSetup = 0;
    let milestone = null;

    switch (outcome) {
        case 'completed': {
            // Streak advances; score by tier + bonus
            run.setupsCompleted += 1;
            run.currentStreak += 1;
            if (run.currentStreak > run.longestStreak) run.longestStreak = run.currentStreak;
            if (setup.tier > run.highestTierReached) run.highestTierReached = setup.tier;

            const score = scoreCompletedSetup(setup, { currentStreak: run.currentStreak });
            goldThisSetup = score.gold;
            ticketsThisSetup = score.tickets;
            milestone = score.milestone;

            run.totalScore += goldThisSetup;  // score == G total for simplicity (1:1 mapping)
            run.earnedGold += goldThisSetup;
            if (ticketsThisSetup > 0) {
                run.earnedTickets += ticketsThisSetup;
                run.milestoneTicketsClaimed.push({
                    atStreak: milestone.atStreak,
                    amount: milestone.tickets,
                    claimedAt: new Date()
                });
            }
            break;
        }
        case 'skipped':
            // Skip → reset streak, kill perfect-run flag, no score
            run.currentStreak = 0;
            run.perfectRun = false;
            break;
        case 'lives_exhausted':
            // Final miss; run ends below
            run.currentStreak = 0;
            run.perfectRun = false;
            break;
    }

    // Append round to history
    run.rounds.push({
        roundNumber: run.rounds.length + 1,
        setupId: setup.id,
        setupTier: setup.tier,
        setupName: setup.name,
        winCondition: setup.winCondition ? JSON.stringify(setup.winCondition) : null,
        matchId,
        outcome,
        attemptsThisSetup: Math.max(1, livesUsedThisRound + (outcome === 'completed' ? 1 : 0)),
        livesUsedThisRound,
        shotCount,
        durationMs,
        goldEarned: goldThisSetup,
        completedAt: new Date()
    });

    run.setupsAttempted += 1;

    // Determine if run ends
    const runEnded = outcome === 'lives_exhausted' || run.livesRemaining === 0;
    if (runEnded) {
        run.status = 'ended_lives_exhausted';
        run.endedAt = new Date();
        run.durationMs = run.endedAt - run.startedAt;
    }

    await run.save();

    // Credit ledgers (separate so failures don't corrupt run state)
    if (goldThisSetup > 0) {
        try {
            await creditGold(run, goldThisSetup, 'marathon_round');
        } catch (e) {
            logger.error('[poolMarathon] gold credit failed', { runId, error: e.message });
        }
    }
    if (ticketsThisSetup > 0) {
        try {
            await creditTickets(run, ticketsThisSetup, 'marathon_milestone');
        } catch (e) {
            logger.error('[poolMarathon] milestone ticket credit failed', { runId, error: e.message });
        }
    }

    // Pick next setup if run continues
    const nextSetup = !runEnded ? pickNextSetup({ setupsAttempted: run.setupsAttempted }) : null;

    return {
        ok: true,
        run,
        nextSetup,
        runEnded,
        gold: goldThisSetup,
        milestoneTickets: ticketsThisSetup
    };
}

/**
 * Voluntary Bank Streak — lock in the score and end the run.
 * Applies perfect-run bonus if run was perfect (zero misses/skips).
 *
 * @param {string} runId
 * @param {object} [opts]
 * @returns {Promise<{ ok: boolean, run?: MarathonRun, perfectBonusApplied?: boolean, reason?: string }>}
 */
export async function cashOutRun(runId, opts = {}) {
    const logger = opts.logger || console;
    const run = await MarathonRun.findOne({ runId });
    if (!run) return { ok: false, reason: 'run_not_found' };
    if (run.status !== 'active') return { ok: false, reason: `status_${run.status}_not_active` };

    let perfectBonusApplied = false;
    if (run.perfectRun && run.setupsCompleted > 0) {
        const bonus = perfectRunBonus();
        run.earnedGold += bonus.gold;
        run.earnedTickets += bonus.tickets;
        run.totalScore += bonus.gold;
        perfectBonusApplied = true;

        try {
            await creditGold(run, bonus.gold, 'marathon_round', { reason: 'perfect_run_bonus' });
            await creditTickets(run, bonus.tickets, 'marathon_milestone', { reason: 'perfect_run_bonus' });
        } catch (e) {
            logger.error('[poolMarathon] perfect-run bonus credit failed', { runId, error: e.message });
        }
    }

    run.status = 'ended_cashout';
    run.endedAt = new Date();
    run.durationMs = run.endedAt - run.startedAt;
    await run.save();

    return { ok: true, run, perfectBonusApplied };
}

/**
 * End a run due to disconnect / abandonment.
 *
 * @param {string} runId
 * @returns {Promise<{ ok: boolean, run?: MarathonRun, reason?: string }>}
 */
export async function abandonRun(runId) {
    const run = await MarathonRun.findOne({ runId });
    if (!run) return { ok: false, reason: 'run_not_found' };
    if (run.status !== 'active') return { ok: false, reason: `status_${run.status}_not_active` };

    run.status = 'ended_disconnect';
    run.endedAt = new Date();
    run.durationMs = run.endedAt - run.startedAt;
    await run.save();

    return { ok: true, run };
}

// ---------------------------------------------------------------------
// Internal — ledger helpers (unchanged from previous shape)
// ---------------------------------------------------------------------

async function creditGold(run, amount, type, extra = {}) {
    const filter = run.telegramUserId
        ? { telegramUserId: run.telegramUserId }
        : { walletAddress: run.walletAddress };
    const setOnInsert = {
        telegramUserId: run.telegramUserId || null,
        walletAddress:  run.walletAddress || null,
        callsign:       run.callsign || null
    };

    const bal = await PoolGoldBalance.findOneAndUpdate(
        filter,
        {
            $inc: { balance: amount, lifetimeEarned: amount },
            $set: { lastEarnedAt: new Date() },
            $setOnInsert: setOnInsert
        },
        { new: true, upsert: true }
    );

    await PoolGoldTransaction.create({
        telegramUserId: run.telegramUserId || null,
        walletAddress:  run.walletAddress || null,
        delta:          amount,
        balanceAfter:   bal.balance,
        type,
        marathonRunId:  run._id,
        ...extra
    });
}

async function creditTickets(run, amount, type, extra = {}) {
    const filter = run.telegramUserId
        ? { telegramUserId: run.telegramUserId }
        : { walletAddress: run.walletAddress };
    const setOnInsert = {
        telegramUserId: run.telegramUserId || null,
        walletAddress:  run.walletAddress || null,
        callsign:       run.callsign || null
    };

    const bal = await TicketBalance.findOneAndUpdate(
        filter,
        {
            $inc: { balance: amount, lifetimeEarned: amount },
            $set: { lastEarnedAt: new Date() },
            $setOnInsert: setOnInsert
        },
        { new: true, upsert: true }
    );

    await TicketTransaction.create({
        telegramUserId: run.telegramUserId || null,
        walletAddress:  run.walletAddress || null,
        delta:          amount,
        balanceAfter:   bal.balance,
        type,
        gameSlug:       'pool',
        marathonRunId:  run._id,
        ...extra
    });
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_MARATHON_CONSTANTS = Object.freeze({
    DEFAULT_LIVES,
    MAX_LIVES,
    CATALOGUE_STATS: MARATHON_CATALOGUE_STATS
});

export default {
    generateRunId,
    startRun,
    recordSetupOutcome,
    cashOutRun,
    abandonRun,
    POOL_MARATHON_CONSTANTS
};
