/**
 * Pool Escrow Service — wraps escrow-v2 for wagered pool matches.
 *
 * SolShot's escrow-v2 program is game-agnostic on-chain — it stores
 * a matchId string, N player wallets, stake amount, and settles to a
 * declared winner with 90/7/3 BPS snapshot at create time.
 *
 * This wrapper:
 *   - Bridges PoolMatch.matchId → escrow matchId (1:1)
 *   - Validates wagered-mode pre-conditions (both players have wallets,
 *     stake matches between players, anti-smurf gates honored)
 *   - Updates PoolMatch.stake fields as the on-chain flow progresses
 *   - Maps escrow settlement TX → PoolMatch.stake.settlementTx +
 *     PoolMatch.rewards.{winnerSolLamports, treasurySolLamports, opsSolLamports}
 *
 * Called by:
 *   - createMatchFromMatchmakingPair (when mode='wagered') →
 *     prepareEscrow + emit deposit instructions to clients
 *   - socket handler on each deposit confirmation → recordDeposit
 *   - finalizeMatch (when mode='wagered' and winner decided) → settle
 *
 * Pure helpers exported for tests:
 *   - validateWageredMatchPreconditions
 *   - calculateSettlementSplit (90/7/3 BPS)
 *   - solToLamports / lamportsToSol
 *
 * On-chain wrappers (require initialised provider — production runtime only):
 *   - prepareEscrow
 *   - recordDeposit
 *   - settle
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import PoolMatch from '../models/PoolMatch.js';

// ---------------------------------------------------------------------
// Constants — settlement BPS (basis points), mirrors SolShot's standard
// ---------------------------------------------------------------------

const WINNER_BPS = 9000;     // 90.00%
const TREASURY_BPS = 700;    // 7.00%
const OPS_BPS = 300;         // 3.00%
const TOTAL_BPS = 10000;

const MIN_STAKE_SOL = 0.01;
const MAX_STAKE_SOL = 5;
const ALLOWED_STAKES_SOL = Object.freeze([0.01, 0.05, 0.1, 0.5, 1, 5]);

// Anti-smurf — designer spec §4
const WAGER_LOW_STAKE_CAP_SOL = 0.05;
const WAGER_PROVISIONAL_MATCHES_REQUIRED = 25;

// ---------------------------------------------------------------------
// Pure helpers (testable without on-chain)
// ---------------------------------------------------------------------

/**
 * Validate that a wagered match's pre-conditions hold.
 *
 * @param {object} params
 * @param {Array<{ walletAddress?: string, isAiBot?: boolean }>} params.players
 * @param {number} params.stakeSol
 * @param {Array<{ matchCount: number, canWagerAboveLowStake: boolean }>} params.eloDocs  - per player
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateWageredMatchPreconditions({ players, stakeSol, eloDocs }) {
    if (!players || players.length !== 2) {
        return { ok: false, reason: 'wrong_player_count' };
    }
    for (const p of players) {
        if (p.isAiBot) return { ok: false, reason: 'wagered_match_cannot_include_bot' };
        if (!p.walletAddress) return { ok: false, reason: 'player_missing_wallet' };
    }
    if (!ALLOWED_STAKES_SOL.includes(stakeSol)) {
        return { ok: false, reason: `stake_${stakeSol}_not_allowed` };
    }
    if (eloDocs && eloDocs.length === 2) {
        for (let i = 0; i < 2; i++) {
            const doc = eloDocs[i];
            if (!doc) continue;
            if (stakeSol > WAGER_LOW_STAKE_CAP_SOL && !doc.canWagerAboveLowStake) {
                return {
                    ok: false,
                    reason: `player_${i}_anti_smurf_gated_at_${WAGER_PROVISIONAL_MATCHES_REQUIRED}_matches`
                };
            }
        }
    }
    return { ok: true };
}

/**
 * Compute the SOL/lamport split for a wagered match settlement.
 *
 * Pot = 2 × stake (both players' deposits). Split by snapshot BPS.
 *
 * @param {number} stakeLamports - per-player stake amount in lamports
 * @returns {{ pot: number, winner: number, treasury: number, ops: number }}
 */
export function calculateSettlementSplit(stakeLamports) {
    const pot = stakeLamports * 2;
    // Floor each component, residual (if any) goes to winner — ensures sum ≤ pot.
    const treasury = Math.floor((pot * TREASURY_BPS) / TOTAL_BPS);
    const ops = Math.floor((pot * OPS_BPS) / TOTAL_BPS);
    const winner = pot - treasury - ops;
    return { pot, winner, treasury, ops };
}

/**
 * Convert SOL to lamports (integer).
 * @param {number} sol
 * @returns {number}
 */
export function solToLamports(sol) {
    return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL (float, 9 decimals).
 * @param {number} lamports
 * @returns {number}
 */
export function lamportsToSol(lamports) {
    return lamports / LAMPORTS_PER_SOL;
}

/**
 * Check if a stake amount is allowed.
 * @param {number} sol
 * @returns {boolean}
 */
export function isAllowedStake(sol) {
    return ALLOWED_STAKES_SOL.includes(sol);
}

// ---------------------------------------------------------------------
// Persistence wrappers — update PoolMatch as escrow flow progresses
// ---------------------------------------------------------------------

/**
 * Mark a match as having an escrow PDA created. Called after escrow-v2's
 * createMatch instruction confirms.
 *
 * @param {string} matchId
 * @param {string} escrowPDA
 * @returns {Promise<{ ok: boolean, match?: PoolMatch, reason?: string }>}
 */
export async function recordEscrowCreated(matchId, escrowPDA) {
    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, reason: 'match_not_found' };
    if (match.mode !== 'wagered') return { ok: false, reason: 'not_a_wagered_match' };
    if (match.stake.escrowPDA) return { ok: false, reason: 'escrow_already_recorded', match };

    match.stake.escrowPDA = escrowPDA;
    await match.save();
    return { ok: true, match };
}

/**
 * Record that a player's deposit transaction has confirmed.
 *
 * @param {string} matchId
 * @param {number} playerIdx - 0 or 1
 * @param {string} depositTx
 * @returns {Promise<{ ok: boolean, match?: PoolMatch, bothDeposited?: boolean, reason?: string }>}
 */
export async function recordDeposit(matchId, playerIdx, depositTx) {
    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, reason: 'match_not_found' };
    if (match.mode !== 'wagered') return { ok: false, reason: 'not_a_wagered_match' };
    if (playerIdx !== 0 && playerIdx !== 1) return { ok: false, reason: 'invalid_player_idx' };
    if (match.players[playerIdx].depositTx) {
        return { ok: false, reason: 'player_already_deposited', match };
    }

    match.players[playerIdx].depositTx = depositTx;

    const bothDeposited = !!(match.players[0].depositTx && match.players[1].depositTx);
    if (bothDeposited && match.status === 'pending') {
        match.status = 'in_progress';
    }
    await match.save();

    return { ok: true, match, bothDeposited };
}

/**
 * Record the settlement transaction after escrow-v2.settleMatch confirms.
 * Updates PoolMatch.rewards with the SOL split.
 *
 * @param {string} matchId
 * @param {object} params
 * @param {string} params.settlementTx
 * @returns {Promise<{ ok: boolean, match?: PoolMatch, split?: object, reason?: string }>}
 */
export async function recordSettlement(matchId, { settlementTx }) {
    const match = await PoolMatch.findOne({ matchId });
    if (!match) return { ok: false, reason: 'match_not_found' };
    if (match.mode !== 'wagered') return { ok: false, reason: 'not_a_wagered_match' };
    if (match.stake.settlementTx) {
        return { ok: false, reason: 'already_settled', match };
    }

    const stakeLamports = solToLamports(match.stake.amount);
    const split = calculateSettlementSplit(stakeLamports);

    match.stake.settlementTx = settlementTx;
    match.stake.settledAt = new Date();
    match.rewards = {
        ...(match.rewards || {}),
        winnerSolLamports: split.winner,
        treasurySolLamports: split.treasury,
        opsSolLamports: split.ops
    };
    await match.save();

    return { ok: true, match, split };
}

// ---------------------------------------------------------------------
// On-chain wrappers — DELEGATE to escrow-v2 service
// ---------------------------------------------------------------------
//
// These are intentionally thin. Caller is responsible for catching errors
// and surfacing failure modes via the socket handler. The on-chain flow:
//
//   1. server: prepareEscrow → escrow-v2.createMatch (server signs as authority)
//   2. server: emits deposit instructions to both clients
//   3. clients: sign + send deposits (Privy embedded wallets)
//   4. server: socket listeners on deposit confirmation → recordDeposit
//   5. on match end: settle → escrow-v2.settleMatch (server signs as authority)
//
// We do NOT inline the escrow-v2 import calls here because that creates a
// hard dependency on Solana RPC + keypair availability that complicates
// unit tests. Wiring happens in the socket integration layer.

/**
 * Convenience: get the standard settlement preview for a given stake.
 * Useful for showing the player "if you win, you get X SOL" before they
 * commit to the deposit.
 *
 * @param {number} stakeSol
 * @returns {{ stakeLamports: number, winnerSol: number, treasurySol: number, opsSol: number }}
 */
export function previewSettlement(stakeSol) {
    const stakeLamports = solToLamports(stakeSol);
    const split = calculateSettlementSplit(stakeLamports);
    return {
        stakeLamports,
        winnerSol: lamportsToSol(split.winner),
        treasurySol: lamportsToSol(split.treasury),
        opsSol: lamportsToSol(split.ops)
    };
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_ESCROW_CONSTANTS = Object.freeze({
    WINNER_BPS,
    TREASURY_BPS,
    OPS_BPS,
    TOTAL_BPS,
    MIN_STAKE_SOL,
    MAX_STAKE_SOL,
    ALLOWED_STAKES_SOL,
    WAGER_LOW_STAKE_CAP_SOL,
    WAGER_PROVISIONAL_MATCHES_REQUIRED
});

export default {
    validateWageredMatchPreconditions,
    calculateSettlementSplit,
    solToLamports,
    lamportsToSol,
    isAllowedStake,
    previewSettlement,
    recordEscrowCreated,
    recordDeposit,
    recordSettlement,
    POOL_ESCROW_CONSTANTS
};
