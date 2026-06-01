/**
 * Pool Match Orchestrator
 *
 * Glue between the matchmaking queue, the match data model, the
 * ELO service, and the rewards service. Socket-handler code calls
 * into this; everything below this layer is server-authoritative
 * persistence.
 *
 * Flow it owns:
 *
 *   matchmaking.onMatchFound(a, b) → createMatchFromMatchmakingPair(a, b)
 *      ↓ creates PoolMatch in 'pending' state, with both players + first
 *        rack seeded, breaker chosen from match seed, turn state primed
 *      ↓ returns matchId for socket handlers to broadcast
 *
 *   socket: match goes to 'in_progress' → players shoot → server adjudicates
 *      ↑ each shot appended via PoolMatch.racks[i].shots; we DO NOT own
 *        the physics or shot adjudication here — that's the server-side
 *        physics service (future work)
 *
 *   when match ends → finalizeMatch(matchId, winnerIdx, reason)
 *      ↓ sets status='completed' (or 'forfeited'), endedAt, winReason
 *      ↓ if PvP: applyMatchResult (poolElo) — updates both players' ratings
 *      ↓ emitMatchEndRewards (poolRewards) — credits G + TKT
 *      ↓ for wagered: SOL settlement is handled by escrow service
 *        independently and writes settlementTx + lamport amounts to
 *        PoolMatch.stake + PoolMatch.rewards
 *
 * Pure helpers exported for smoke-testing without Mongo:
 *   generateMatchId, generateRackSeed, chooseBreakerIdx,
 *   computeAsyncExpiry, computeWallClockExpiry
 *
 * Match ID format: 'pm_' + 8 hex chars = ~4 billion namespace
 * (collisions handled by Mongo unique index — retry on dup)
 */

import crypto from 'crypto';
import PoolMatch from '../models/PoolMatch.js';
import { applyMatchResult } from './poolElo.js';
import { emitMatchEndRewards } from './poolRewards.js';
import { getStandardRack } from './pool/sim/rack.js';

// ---------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------

const ASYNC_WINDOW_MS = 12 * 60 * 60 * 1000;     // 12h per turn
const MATCH_WALL_CLOCK_MS = 72 * 60 * 60 * 1000;  // 72h hard cap

// ---------------------------------------------------------------------
// Pure helpers (testable without Mongo)
// ---------------------------------------------------------------------

/**
 * Generate a fresh match ID. Cryptographically random; unique constraint
 * on the collection handles the (vanishingly rare) collision case via retry.
 * @returns {string} e.g. 'pm_3f9a2b1c'
 */
export function generateMatchId() {
    return 'pm_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a rack seed (32 hex chars / 128 bits). Same seed → same rack
 * layout → replayable / verifiable by spectators.
 * @returns {string}
 */
export function generateRackSeed() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Choose breaker from a seed string. Deterministic and verifiable:
 *   sha256(seed)[0] & 1 → 0 or 1
 * @param {string} seed
 * @returns {0|1}
 */
export function chooseBreakerIdx(seed) {
    const hash = crypto.createHash('sha256').update(seed).digest();
    return hash[0] & 1;
}

/**
 * Compute the async-window expiry from now.
 * @param {Date} [from=new Date()]
 * @returns {Date}
 */
export function computeAsyncExpiry(from = new Date()) {
    return new Date(from.getTime() + ASYNC_WINDOW_MS);
}

/**
 * Compute the match wall-clock expiry from now.
 * @param {Date} [from=new Date()]
 * @returns {Date}
 */
export function computeWallClockExpiry(from = new Date()) {
    return new Date(from.getTime() + MATCH_WALL_CLOCK_MS);
}

/**
 * Build the initial turn state for a new match.
 * @param {0|1} breakerIdx
 * @returns {object} turn-state seed for PoolMatch.currentTurn
 */
export function buildInitialTurnState(breakerIdx) {
    const now = new Date();
    return {
        activePlayerIdx:      breakerIdx,
        asyncWindowExpiresAt: computeAsyncExpiry(now),
        syncTimerStartedAt:   null,
        syncTimerExpiresAt:   null,
        isBallInHand:         false,
        isBreakingShot:       true
    };
}

// ---------------------------------------------------------------------
// Persistence — create match
// ---------------------------------------------------------------------

/**
 * Create a PoolMatch from a matchmaking pair.
 * @param {object} entryA - QueueEntry from poolMatchmaking
 * @param {object} entryB - QueueEntry from poolMatchmaking
 * @returns {Promise<{ matchId: string, match: PoolMatch }>}
 */
export async function createMatchFromMatchmakingPair(entryA, entryB) {
    if (!entryA || !entryB) throw new Error('createMatchFromMatchmakingPair: both entries required');
    if (entryA.mode !== entryB.mode) throw new Error('mode mismatch');

    const matchId = generateMatchId();
    const rackSeed = generateRackSeed();
    const breakerIdx = chooseBreakerIdx(matchId + rackSeed);
    const now = new Date();

    const stake = entryA.mode === 'wagered'
        ? { amount: entryA.stake.amount, currency: entryA.stake.currency, escrowPDA: null, settlementTx: null, settledAt: null }
        : { amount: 0, currency: null, escrowPDA: null, settlementTx: null, settledAt: null };

    const match = await PoolMatch.create({
        matchId,
        mode: entryA.mode,
        format: entryA.format,
        players: [
            buildPlayerStub(entryA),
            buildPlayerStub(entryB)
        ],
        racks: [{
            rackNumber: 1,
            rackSeed,
            breakerIdx,
            shots: [],
            winnerIdx: null,
            endedAt: null
        }],
        currentRackIdx: 0,
        currentTurn: buildInitialTurnState(breakerIdx),
        // Seed ball state with the standard rack at break position so
        // async resume / reconnect can render the table immediately.
        currentBallState: getStandardRack(),
        stake,
        status: 'pending',
        startedAt: now,
        expiresAt: computeWallClockExpiry(now)
    });

    return { matchId, match };
}

/**
 * Create a vs-computer match (one human + one AI bot, never queued).
 * @param {object} params
 * @param {object} params.identity         - human identity
 * @param {number} params.humanElo         - human's current ELO
 * @param {'easy'|'medium'|'hard'|'insane'} params.difficulty
 * @param {'BO1'|'BO3'|'BO5'} [params.format='BO1']
 * @returns {Promise<{ matchId: string, match: PoolMatch }>}
 */
export async function createVsComputerMatch({ identity, humanElo, difficulty, format = 'BO1' }) {
    if (!identity) throw new Error('createVsComputerMatch: identity required');

    const matchId = generateMatchId();
    const rackSeed = generateRackSeed();
    const breakerIdx = chooseBreakerIdx(matchId + rackSeed);
    const now = new Date();

    const human = {
        telegramUserId: identity.telegramUserId || null,
        walletAddress:  identity.walletAddress || null,
        callsign:       identity.callsign || null,
        prestigeTier:   identity.prestigeTier || 0,
        isAiBot:        false,
        aiDifficulty:   null,
        eloAtStart:     humanElo || 1000,
        color:          'open',
        ballsRemaining: 7,
        isWinner:       false
    };

    const bot = {
        telegramUserId: null,
        walletAddress:  null,
        callsign:       `Bot · ${difficulty}`,
        prestigeTier:   0,
        isAiBot:        true,
        aiDifficulty:   difficulty,
        eloAtStart:     null,
        color:          'open',
        ballsRemaining: 7,
        isWinner:       false
    };

    const match = await PoolMatch.create({
        matchId,
        mode: 'vs_computer',
        format,
        players: [human, bot],
        racks: [{
            rackNumber: 1,
            rackSeed,
            breakerIdx,
            shots: [],
            winnerIdx: null,
            endedAt: null
        }],
        currentRackIdx: 0,
        currentTurn: buildInitialTurnState(breakerIdx),
        currentBallState: getStandardRack(),
        stake: { amount: 0, currency: null, escrowPDA: null, settlementTx: null, settledAt: null },
        status: 'in_progress',     // vs-computer skips the pending/opponent-reveal step
        startedAt: now,
        expiresAt: computeWallClockExpiry(now)
    });

    return { matchId, match };
}

/**
 * Apply a SimulationResult to a match — replaces currentBallState with
 * the sim's finalBalls and appends the shot to the current rack.
 *
 * Called from the socket handler after simulateShotForClient runs.
 * Idempotent on the shot append (no-op if last shot's takenAt matches).
 *
 * @param {string} matchId
 * @param {object} params
 * @param {number} params.shooterIdx     - 0 or 1
 * @param {object} params.shotParams     - what the client sent
 * @param {SimulationResult} params.simResult - what the sim produced
 * @returns {Promise<{ ok: boolean, match?: PoolMatch, reason?: string }>}
 */
export async function applySimulationResultToMatch(matchId, { shooterIdx, shotParams, simResult }) {
    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, reason: 'match_not_found' };
    if (match.status !== 'in_progress') return { ok: false, reason: `status_${match.status}_not_in_progress` };
    if (shooterIdx !== 0 && shooterIdx !== 1) return { ok: false, reason: 'invalid_shooter_idx' };

    // Append shot to current rack
    const rack = match.racks[match.currentRackIdx];
    if (!rack) return { ok: false, reason: 'current_rack_missing' };

    rack.shots.push({
        shooterIdx,
        aimAngle:    shotParams.angle,
        power:       shotParams.power,
        spinX:       shotParams.spinX,
        spinY:       shotParams.spinY,
        cueBallPlacedAt: shotParams.cueBallPlacedAt || undefined,
        pocketedBalls: simResult.pocketedBallIds || [],
        firstTouchedBallColor: simResult.firstCollidedBallColor || null,
        foul:        false,  // Referee-driven foul detection comes in a later commit
        foulReason:  null,
        scratch:     simResult.events.some(e => e.type === 'cue_ball_potted'),
        isBreak:     rack.shots.length === 0,
        durationMs:  0,
        takenAt:     new Date()
    });

    // Replace ball state with sim's final positions
    match.currentBallState = simResult.finalBalls;

    // Update last-shot timestamp
    match.lastShotAt = new Date();

    await match.save();
    return { ok: true, match };
}

// ---------------------------------------------------------------------
// Persistence — finalize match
// ---------------------------------------------------------------------

/**
 * Finalize a completed match — runs ELO update (PvP only) + reward emission.
 *
 * @param {string} matchId
 * @param {object} params
 * @param {0|1} params.winnerIdx
 * @param {string} [params.winReason='normal']
 * @param {object} [params.logger]
 * @returns {Promise<{ ok: boolean, match?: PoolMatch, eloResult?: object, rewardsResult?: object, reason?: string }>}
 */
export async function finalizeMatch(matchId, { winnerIdx, winReason = 'normal', logger = console } = {}) {
    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, reason: 'match_not_found' };
    if (match.status === 'completed' || match.status === 'forfeited') {
        return { ok: false, reason: 'already_finalized', match };
    }
    if (winnerIdx !== 0 && winnerIdx !== 1) {
        return { ok: false, reason: 'invalid_winner_idx' };
    }

    // Status transition
    match.status = (winReason === 'forfeit' || winReason === 'async_timeout' || winReason === 'wall_clock_expired')
        ? 'forfeited'
        : 'completed';
    match.winnerIdx = winnerIdx;
    match.winReason = winReason;
    match.endedAt = new Date();
    match.players[winnerIdx].isWinner = true;
    await match.save();

    // ELO update for PvP modes only
    let eloResult = null;
    const isPvp = match.mode === 'quick' || match.mode === 'wagered' || match.mode === 'tournament';
    const neitherIsBot = !match.players[0].isAiBot && !match.players[1].isAiBot;
    if (isPvp && neitherIsBot) {
        try {
            eloResult = await applyMatchResult({
                playerA: identityFromPlayer(match.players[0]),
                playerB: identityFromPlayer(match.players[1]),
                winnerIdx
            });
            // Backfill ELO snapshot on match
            match.players[0].eloAtEnd = eloResult.ratingA;
            match.players[1].eloAtEnd = eloResult.ratingB;
            match.players[0].eloDelta = eloResult.deltaA;
            match.players[1].eloDelta = eloResult.deltaB;
            await match.save();
        } catch (e) {
            logger.error('[poolMatchOrchestrator] ELO update failed', { matchId, error: e.message });
            // Continue to rewards emission — ELO failure shouldn't block currency payout
        }
    }

    // Reward emission (idempotent; tournament/marathon will no-op since their services emit)
    let rewardsResult = null;
    try {
        rewardsResult = await emitMatchEndRewards(matchId, { logger });
    } catch (e) {
        logger.error('[poolMatchOrchestrator] reward emission failed', { matchId, error: e.message });
        // The match is still marked completed; support can rerun emitMatchEndRewards later
    }

    return { ok: true, match, eloResult, rewardsResult };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function buildPlayerStub(entry) {
    return {
        telegramUserId: entry.identity.telegramUserId || null,
        walletAddress:  entry.identity.walletAddress || null,
        callsign:       entry.identity.callsign || null,
        prestigeTier:   entry.identity.prestigeTier || 0,
        isAiBot:        false,
        aiDifficulty:   null,
        eloAtStart:     entry.rating || 1000,
        eloAtEnd:       null,
        eloDelta:       null,
        color:          'open',
        ballsRemaining: 7,
        depositTx:      null,
        isWinner:       false
    };
}

function identityFromPlayer(player) {
    return {
        telegramUserId: player.telegramUserId || undefined,
        walletAddress:  player.walletAddress || undefined,
        callsign:       player.callsign || undefined
    };
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_ORCHESTRATOR_CONSTANTS = Object.freeze({
    ASYNC_WINDOW_MS,
    MATCH_WALL_CLOCK_MS
});

export default {
    generateMatchId,
    generateRackSeed,
    chooseBreakerIdx,
    computeAsyncExpiry,
    computeWallClockExpiry,
    buildInitialTurnState,
    createMatchFromMatchmakingPair,
    createVsComputerMatch,
    applySimulationResultToMatch,
    finalizeMatch,
    POOL_ORCHESTRATOR_CONSTANTS
};
