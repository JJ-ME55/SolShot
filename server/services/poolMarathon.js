/**
 * Pool Marathon Engine
 *
 * Solo high-score mode: human vs an unbroken chain of bots. Each
 * consecutive win raises the bot difficulty. Player banks the streak
 * voluntarily OR loses and the run ends.
 *
 * Two score axes per designer spec §3.5 / §6:
 *   - streak        = consecutive wins (1 → 2 → 3 → ...)
 *   - perfectTables = bots beaten without missing a single shot
 *
 * Currency:
 *   - per-round Gold (rises with bot difficulty)
 *   - milestone TKT bonuses at streak 5 / 10 / 20 / 30 / 50
 *
 * Skill-isolated: NEVER touches PvP ELO. NEVER touches PvP leaderboards.
 * Has its own per-difficulty marathon boards (daily / weekly / all-time)
 * driven by the indexes on the MarathonRun model.
 *
 * Bot ladder model:
 *   - Player picks starting difficulty (easy/medium/hard/insane)
 *   - Each win moves the ladder up; bot difficulty rises every
 *     LADDER_STEP_WINS wins (default 3)
 *   - Bot ELO scales with each step (lookupBotElo)
 *   - "Insane" is the visible cap — beyond that, the ladder still rises
 *     internally but displays as "Insane+1", "Insane+2" etc
 *
 * Persistence:
 *   - startRun creates a MarathonRun doc, status='active'
 *   - recordRoundOutcome appends to rounds[], updates streak / perfectTables,
 *     emits per-round Gold, fires milestone TKT bonuses if hit
 *   - endRun(reason) sets status (ended_loss / ended_cashout / ended_disconnect)
 */

import crypto from 'crypto';
import MarathonRun from '../models/MarathonRun.js';
import { PoolGoldBalance, PoolGoldTransaction } from '../models/PoolGoldLedger.js';
import { TicketBalance, TicketTransaction } from '../models/TicketLedger.js';

// ---------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------

const LADDER_STEP_WINS = 3;             // bot difficulty rises every 3 wins

const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'insane'];
const DIFFICULTY_BASE_ELO = Object.freeze({
    easy:   600,
    medium: 900,
    hard:   1200,
    insane: 1500
});
const ELO_PER_LADDER_STEP = 100;        // each ladder step adds 100 to bot ELO

// Per-round Gold scales with bot difficulty (uses bot ELO)
const GOLD_BASE = 5;
const GOLD_PER_100_ELO = 1;             // +1 G per 100 ELO of bot above base
const GOLD_PERFECT_BONUS = 5;           // +5 G for zero-miss table

// Milestone TKT bonuses at streak thresholds
const MILESTONES = Object.freeze([
    { streak: 5,  tickets: 5 },
    { streak: 10, tickets: 15 },
    { streak: 20, tickets: 50 },
    { streak: 30, tickets: 100 },
    { streak: 50, tickets: 250 }
]);

// ---------------------------------------------------------------------
// Pure helpers (testable without Mongo)
// ---------------------------------------------------------------------

/**
 * Compute the bot's difficulty + ELO for the next round in a marathon.
 *
 * @param {object} params
 * @param {'easy'|'medium'|'hard'|'insane'} params.startingDifficulty
 * @param {number} params.currentStreak  - wins so far in this run
 * @returns {{ difficulty: string, displayName: string, elo: number, ladderStep: number }}
 */
export function getNextBot({ startingDifficulty, currentStreak }) {
    const baseIdx = DIFFICULTY_ORDER.indexOf(startingDifficulty);
    if (baseIdx === -1) throw new Error(`getNextBot: unknown difficulty ${startingDifficulty}`);

    const ladderStep = Math.floor(currentStreak / LADDER_STEP_WINS);
    const effectiveIdx = Math.min(DIFFICULTY_ORDER.length - 1, baseIdx + ladderStep);
    const difficulty = DIFFICULTY_ORDER[effectiveIdx];

    // ELO climbs continuously even after maxing the "insane" label
    const baseElo = DIFFICULTY_BASE_ELO[difficulty];
    const overflowSteps = Math.max(0, (baseIdx + ladderStep) - (DIFFICULTY_ORDER.length - 1));
    const elo = baseElo + (overflowSteps * ELO_PER_LADDER_STEP);

    const displayName = overflowSteps > 0 ? `${difficulty}+${overflowSteps}` : difficulty;

    return { difficulty, displayName, elo, ladderStep };
}

/**
 * Gold reward for winning a specific round.
 *
 * @param {object} params
 * @param {number} params.botElo
 * @param {boolean} params.perfectTable
 * @returns {number}
 */
export function calculateRoundGold({ botElo, perfectTable }) {
    const aboveBase = Math.max(0, botElo - DIFFICULTY_BASE_ELO.easy);
    const scaled = GOLD_BASE + Math.floor((aboveBase / 100) * GOLD_PER_100_ELO);
    return scaled + (perfectTable ? GOLD_PERFECT_BONUS : 0);
}

/**
 * Return the milestone reward if this exact streak value crosses a threshold.
 *
 * @param {number} streak
 * @returns {{ streak: number, tickets: number }|null}
 */
export function getMilestoneAt(streak) {
    return MILESTONES.find(m => m.streak === streak) || null;
}

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
 * @param {object} params
 * @param {object} params.identity
 * @param {'easy'|'medium'|'hard'|'insane'} params.startingDifficulty
 * @returns {Promise<{ ok: boolean, runId?: string, run?: MarathonRun, firstBot?: object, reason?: string }>}
 */
export async function startRun({ identity, startingDifficulty }) {
    if (!identity || (!identity.telegramUserId && !identity.walletAddress)) {
        return { ok: false, reason: 'identity_required' };
    }
    if (!DIFFICULTY_BASE_ELO[startingDifficulty]) {
        return { ok: false, reason: 'invalid_difficulty' };
    }

    const runId = generateRunId();
    const firstBot = getNextBot({ startingDifficulty, currentStreak: 0 });

    const run = await MarathonRun.create({
        runId,
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        callsign:       identity.callsign || null,
        startingDifficulty,
        streak: 0,
        perfectTables: 0,
        highestDifficulty: firstBot.difficulty,
        longestRunInSingleTurn: 0,
        rounds: [],
        earnedGold: 0,
        earnedTickets: 0,
        milestoneTicketsClaimed: [],
        status: 'active',
        startedAt: new Date()
    });

    return { ok: true, runId, run, firstBot };
}

/**
 * Record the outcome of a single bot round.
 * On win: appends round, updates streak/perfectTables, credits Gold,
 *         fires milestone TKT bonus if hit.
 * On loss: appends round, sets status='ended_loss', ends run.
 *
 * @param {string} runId
 * @param {object} params
 * @param {string} params.matchId       - PoolMatch.matchId for this round
 * @param {boolean} params.won
 * @param {boolean} [params.perfectTable=false]
 * @param {number} [params.shotCount=0]
 * @param {number} [params.longestRun=0]
 * @param {number} [params.durationMs=0]
 * @param {object} [opts]
 * @param {object} [opts.logger]
 * @returns {Promise<{ ok: boolean, run?: MarathonRun, gold?: number, milestoneTickets?: number, nextBot?: object, reason?: string }>}
 */
export async function recordRoundOutcome(runId, {
    matchId,
    won,
    perfectTable = false,
    shotCount = 0,
    longestRun = 0,
    durationMs = 0
}, opts = {}) {
    const logger = opts.logger || console;
    const run = await MarathonRun.findOne({ runId });
    if (!run) return { ok: false, reason: 'run_not_found' };
    if (run.status !== 'active') return { ok: false, reason: `status_${run.status}_not_active` };

    // Determine which bot this round was against (based on streak before this round)
    const botBeforeThisRound = getNextBot({
        startingDifficulty: run.startingDifficulty,
        currentStreak: run.streak
    });

    let goldEarnedThisRound = 0;
    let milestoneTickets = 0;

    if (won) {
        goldEarnedThisRound = calculateRoundGold({
            botElo: botBeforeThisRound.elo,
            perfectTable
        });

        run.streak += 1;
        if (perfectTable) run.perfectTables += 1;
        if (longestRun > run.longestRunInSingleTurn) run.longestRunInSingleTurn = longestRun;
        run.earnedGold += goldEarnedThisRound;
        run.highestDifficulty = botBeforeThisRound.difficulty;

        // Milestone check
        const milestone = getMilestoneAt(run.streak);
        if (milestone) {
            const alreadyClaimed = run.milestoneTicketsClaimed.some(m => m.atStreak === milestone.streak);
            if (!alreadyClaimed) {
                milestoneTickets = milestone.tickets;
                run.earnedTickets += milestoneTickets;
                run.milestoneTicketsClaimed.push({
                    atStreak: milestone.streak,
                    amount: milestone.tickets,
                    claimedAt: new Date()
                });
            }
        }
    }

    run.rounds.push({
        roundNumber: run.rounds.length + 1,
        botDifficulty: botBeforeThisRound.difficulty,
        botEloEstimate: botBeforeThisRound.elo,
        matchId: matchId || null,
        won,
        perfectTable,
        shotCount,
        longestRun,
        durationMs,
        goldEarned: goldEarnedThisRound,
        completedAt: new Date()
    });

    if (!won) {
        run.status = 'ended_loss';
        run.endedAt = new Date();
        run.durationMs = run.endedAt - run.startedAt;
    }

    await run.save();

    // Credit ledgers (separate from save above so failures don't corrupt run state)
    if (won && goldEarnedThisRound > 0) {
        try {
            await creditGold(run, goldEarnedThisRound, 'marathon_round');
        } catch (e) {
            logger.error('[poolMarathon] gold credit failed', { runId, error: e.message });
        }
    }
    if (milestoneTickets > 0) {
        try {
            await creditTickets(run, milestoneTickets, 'marathon_milestone');
        } catch (e) {
            logger.error('[poolMarathon] milestone ticket credit failed', { runId, error: e.message });
        }
    }

    const nextBot = won
        ? getNextBot({ startingDifficulty: run.startingDifficulty, currentStreak: run.streak })
        : null;

    return { ok: true, run, gold: goldEarnedThisRound, milestoneTickets, nextBot };
}

/**
 * End a marathon run voluntarily (player banks the streak).
 *
 * @param {string} runId
 * @returns {Promise<{ ok: boolean, run?: MarathonRun, reason?: string }>}
 */
export async function cashOutRun(runId) {
    const run = await MarathonRun.findOne({ runId });
    if (!run) return { ok: false, reason: 'run_not_found' };
    if (run.status !== 'active') return { ok: false, reason: `status_${run.status}_not_active` };

    run.status = 'ended_cashout';
    run.endedAt = new Date();
    run.durationMs = run.endedAt - run.startedAt;
    await run.save();

    return { ok: true, run };
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
// Internal — ledger helpers (similar shape to poolRewards)
// ---------------------------------------------------------------------

async function creditGold(run, amount, type) {
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
        marathonRunId:  run._id
    });
}

async function creditTickets(run, amount, type) {
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
        marathonRunId:  run._id
    });
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_MARATHON_CONSTANTS = Object.freeze({
    LADDER_STEP_WINS,
    DIFFICULTY_ORDER,
    DIFFICULTY_BASE_ELO,
    ELO_PER_LADDER_STEP,
    GOLD_BASE,
    GOLD_PER_100_ELO,
    GOLD_PERFECT_BONUS,
    MILESTONES
});

export default {
    getNextBot,
    calculateRoundGold,
    getMilestoneAt,
    generateRunId,
    startRun,
    recordRoundOutcome,
    cashOutRun,
    abandonRun,
    POOL_MARATHON_CONSTANTS
};
