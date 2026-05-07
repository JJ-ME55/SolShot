/**
 * SolShot Solana Service
 *
 * Handles SOL wager management:
 *   - Verify wallet balances
 *   - Process wager deposits (escrow PDA when deployed, placeholder otherwise)
 *   - Settle matches (distribute winnings via on-chain escrow)
 *   - Refund on cancel/disconnect
 *
 * Settlement split (hardcoded on-chain):
 *   90% → Winner
 *    7% → Treasury (platform revenue)
 *    3% → Ops wallet (running costs)
 *
 * When escrow program is deployed, settleMatch/refundWager delegate to
 * the on-chain program. Otherwise falls back to logging (dev mode).
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    initEscrow, isEscrowEnabled,
    createMatchEscrow, settleMatchEscrow, cancelMatchEscrow,
    buildDepositTransaction, getEscrowState, getEscrowPDA,
} from './escrow.js';
import { initEscrowV2, isEscrowV2Enabled } from './escrow-v2.js';
import logger from './logger.js';

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET || null;
const OPS_WALLET = process.env.OPS_WALLET || null;

// Settlement percentages
const WINNER_SHARE = 0.90;
const TREASURY_SHARE = 0.07;
const OPS_SHARE = 0.03;

// Valid wager tiers in SOL — Source: Litepaper v2.1 Section 05 — SOL Wagering
export const WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0];

// Match modes — Litepaper v2.1 (keep in sync with client/src/screens/LobbyScreen.js)
export const MATCH_MODES = {
    practice:         { label: 'Practice',         wagerRange: [0, 0],          formats: [1] },
    quick_match:      { label: 'Quick Match',      wagerRange: [0.1, 0.1],      formats: [1, 3] },
    duel:             { label: 'Duel',             wagerRange: [0.25, 0.5],     formats: [3, 5] },
    high_roller:      { label: 'High Roller',      wagerRange: [1.0, 1.0],      formats: [3, 5] },
    custom_challenge: { label: 'Custom Challenge', wagerRange: [0.1, Infinity], formats: [1, 3, 5] },
};

/**
 * Validate wager + matchLength against a match mode
 */
export function validateMatchMode(mode, wagerSOL, matchLength) {
    const config = MATCH_MODES[mode];
    if (!config) return { valid: false, reason: 'Unknown match mode' };
    if (wagerSOL < config.wagerRange[0] || wagerSOL > config.wagerRange[1]) {
        return { valid: false, reason: `Wager must be ${config.wagerRange[0]}+ SOL for ${config.label}` };
    }
    // Custom Challenge allows any wager >= 0.1 SOL — skip tier whitelist
    if (mode !== 'custom_challenge' && wagerSOL > 0 && !WAGER_TIERS.includes(wagerSOL)) {
        return { valid: false, reason: 'Invalid wager tier' };
    }
    if (!config.formats.includes(matchLength)) {
        return { valid: false, reason: `${config.label} only supports BO${config.formats.join('/BO')}` };
    }
    return { valid: true };
}

// Solana connection (singleton)
let connection = null;

/**
 * Initialize Solana connection
 */
export function initSolana() {
    connection = new Connection(SOLANA_RPC, 'confirmed');
    console.log(`[Solana] Connected to ${SOLANA_RPC}`);

    // Initialize escrow program (keypair loaded via keys.js)
    const escrowReady = initEscrow();
    console.log(`[Solana] Escrow v1 program: ${escrowReady ? 'ENABLED' : 'DISABLED (dev mode)'}`);

    // Initialize escrow v2 program (N-player groupchat) — same keypair as v1
    const escrowV2Ready = initEscrowV2();
    console.log(`[Solana] Escrow v2 program: ${escrowV2Ready ? 'ENABLED' : 'DISABLED (dev mode)'}`);

    return connection;
}

/**
 * Get or create Solana connection
 */
export function getConnection() {
    if (!connection) {
        return initSolana();
    }
    return connection;
}

// O3: Balance cache — avoids redundant RPC calls within a short window
const balanceCache = new Map(); // walletAddress → { lamports, expiresAt }
const BALANCE_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get cached or fresh lamport balance for a wallet.
 * Cuts RPC costs nearly in half for wagered games.
 */
async function getCachedLamports(walletAddress) {
    const now = Date.now();
    const cached = balanceCache.get(walletAddress);
    if (cached && now < cached.expiresAt) {
        return cached.lamports;
    }
    const conn = getConnection();
    const pubkey = new PublicKey(walletAddress);
    const lamports = await conn.getBalance(pubkey);
    balanceCache.set(walletAddress, { lamports, expiresAt: now + BALANCE_CACHE_TTL_MS });
    return lamports;
}

/**
 * Verify a wallet has enough SOL for a wager
 *
 * @param {string} walletAddress - Base58 public key
 * @param {number} wagerSOL - Wager amount in SOL
 * @returns {Promise<{sufficient: boolean, balance: number, required: number}>}
 */
export async function verifyBalance(walletAddress, wagerSOL) {
    try {
        const lamports = await getCachedLamports(walletAddress);
        const balance = lamports / LAMPORTS_PER_SOL;

        // Need wager + ~0.01 SOL for transaction fees
        const required = wagerSOL + 0.01;

        return {
            sufficient: balance >= required,
            balance,
            required,
        };
    } catch (err) {
        console.error('[Solana] Balance check error:', err.message);
        return {
            sufficient: false,
            balance: 0,
            required: wagerSOL + 0.01,
        };
    }
}

/**
 * Validate a wager tier
 *
 * @param {number} wagerSOL
 * @returns {boolean}
 */
export function isValidWager(wagerSOL, matchMode) {
    // Custom Challenge allows any wager >= 0.1 SOL — no tier whitelist
    if (matchMode === 'custom_challenge') return wagerSOL >= 0.1;
    return WAGER_TIERS.includes(wagerSOL);
}

/**
 * Calculate settlement distribution
 * H016: Use integer lamport math to avoid floating-point rounding errors.
 * All internal calculations use lamports (1 SOL = 1e9 lamports).
 * Winner gets remainder to prevent dust loss.
 *
 * @param {number} totalWagerSOL - Total pot (both wagers combined) in SOL
 * @returns {{winner: number, treasury: number, ops: number}} amounts in SOL
 */
export function calculateSettlement(totalWagerSOL) {
    const totalLamports = Math.round(totalWagerSOL * LAMPORTS_PER_SOL);
    const treasuryLamports = Math.floor(totalLamports * TREASURY_SHARE);
    const opsLamports = Math.floor(totalLamports * OPS_SHARE);
    // Winner gets the remainder — avoids dust loss from rounding
    const winnerLamports = totalLamports - treasuryLamports - opsLamports;

    return {
        winner: winnerLamports / LAMPORTS_PER_SOL,
        treasury: treasuryLamports / LAMPORTS_PER_SOL,
        ops: opsLamports / LAMPORTS_PER_SOL,
    };
}

/**
 * Settle a match — distribute winnings.
 * When escrow is enabled, calls on-chain settle instruction (90/7/3 split).
 * Falls back to logging in dev mode.
 *
 * @param {string} winnerAddress - Winner's wallet
 * @param {string} loserAddress - Loser's wallet
 * @param {number} wagerSOL - Each player's wager
 * @param {string} [matchId] - Room ID for escrow PDA lookup
 * @param {number} [playerCount=2] - Number of players who deposited (N-player pot = wager * playerCount)
 * @returns {Promise<{success: boolean, settlement: object, txSignature?: string}>}
 */
export async function settleMatch(winnerAddress, loserAddress, wagerSOL, matchId, playerCount = 2) {
    if (wagerSOL === 0) {
        return { success: true, settlement: { winner: 0, treasury: 0, ops: 0 }, txSignature: null };
    }

    const totalPot = wagerSOL * playerCount;
    const settlement = calculateSettlement(totalPot);

    // If escrow program is live and we have a matchId, settle on-chain
    if (isEscrowEnabled() && matchId) {
        const result = await settleMatchEscrow(matchId, winnerAddress);
        if (result.success) {
            logger.info({ matchId, txSignature: result.txSignature }, '[Solana] On-chain settlement');
            return {
                success: true,
                settlement,
                txSignature: result.txSignature,
            };
        }
        // SF-02: Propagate failure — do NOT fall through to dev-mode fallback (DB: H015)
        console.error('[Solana] On-chain settle failed:', result.error);
        return { success: false, error: result.error, settlement };
    }

    // Fallback: log settlement (dev mode / no escrow)
    logger.info({ winnerSOL: settlement.winner, treasurySOL: settlement.treasury, opsSOL: settlement.ops, totalPot }, '[Solana] Settlement (off-chain)');

    return {
        success: true,
        settlement,
        txSignature: null,
    };
}

/**
 * Refund a cancelled match — cancel escrow and return funds.
 *
 * @param {string} playerAddress - Player to refund
 * @param {number} wagerSOL - Amount to refund
 * @param {string} [matchId] - Room ID for escrow lookup
 * @param {string[]} [playerAddresses] - Array of deposited player wallet addresses (base58) for cancel_match
 * @returns {Promise<{success: boolean, txSignature?: string}>}
 */
export async function refundWager(playerAddress, wagerSOL, matchId, playerAddresses) {
    if (wagerSOL === 0) {
        return { success: true, txSignature: null };
    }

    // If escrow is live, cancel on-chain (refunds all deposited players).
    // H013 fix — propagate failure properly. Previously this fell through
    // to `return { success: true }` even after the on-chain CPI threw,
    // making callers believe the refund succeeded while SOL remained
    // locked on-chain.
    if (isEscrowEnabled() && matchId && playerAddresses && playerAddresses.length > 0) {
        try {
            const result = await cancelMatchEscrow(matchId, playerAddresses);
            if (result.success) {
                console.log('[Solana] On-chain refund:', { matchId, txSignature: result.txSignature });
                return { success: true, txSignature: result.txSignature };
            }
            // On-chain cancel returned success: false — surface that to caller.
            console.error('[Solana] On-chain cancel failed (returning failure to caller):', result.error);
            return { success: false, error: result.error || 'cancel_returned_false' };
        } catch (err) {
            // CPI threw outright — also surface to caller.
            console.error('[Solana] On-chain cancel threw (returning failure to caller):', err?.message || err);
            return { success: false, error: err?.message || 'cancel_threw' };
        }
    }

    // Fallback: only used when escrow is NOT enabled (dev mode without on-chain).
    // In production with escrow enabled, this path means matchId/playerAddresses
    // weren't passed — that's a programming error and we should warn.
    if (isEscrowEnabled()) {
        console.warn('[Solana] refundWager called without matchId/playerAddresses while escrow enabled — returning success but NO on-chain refund happened.');
    }
    logger.info({ amount: wagerSOL }, '[Solana] Refund (off-chain dev/no-escrow path)');

    return { success: true, txSignature: null };
}

/**
 * Get SOL balance for a wallet
 *
 * @param {string} walletAddress
 * @returns {Promise<number>} Balance in SOL
 */
export async function getBalance(walletAddress) {
    const conn = getConnection();
    try {
        const pubkey = new PublicKey(walletAddress);
        const lamports = await conn.getBalance(pubkey);
        return lamports / LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('[Solana] Balance error:', err.message);
        return 0;
    }
}

// Re-export escrow functions for main.js
export {
    isEscrowEnabled,
    createMatchEscrow,
    buildDepositTransaction,
    getEscrowState,
    getEscrowPDA,
    startWithDepositorsEscrow,
} from './escrow.js';

export { WINNER_SHARE, TREASURY_SHARE, OPS_SHARE };
