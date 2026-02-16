/**
 * SolShot Solana Service
 *
 * Handles SOL wager management:
 *   - Verify wallet balances
 *   - Process wager deposits (direct transfer to treasury for now)
 *   - Settle matches (distribute winnings)
 *   - Refund on cancel/disconnect
 *
 * Settlement split:
 *   90% → Winner
 *    7% → Treasury (platform revenue)
 *    3% → Ops wallet (running costs)
 *
 * Future: Replace direct transfers with Anchor escrow program
 * when match-escrow program is deployed.
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET || null;
const OPS_WALLET = process.env.OPS_WALLET || null;

// Settlement percentages
const WINNER_SHARE = 0.90;
const TREASURY_SHARE = 0.07;
const OPS_SHARE = 0.03;

// Valid wager tiers in SOL
export const WAGER_TIERS = [0, 0.01, 0.05, 0.1, 0.25, 0.5];

// Solana connection (singleton)
let connection = null;

// Server keypair for signing settlement transactions
let serverKeypair = null;

/**
 * Initialize Solana connection
 */
export function initSolana() {
    connection = new Connection(SOLANA_RPC, 'confirmed');
    console.log(`[Solana] Connected to ${SOLANA_RPC}`);

    // Load server keypair if available
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    if (keypairPath) {
        try {
            const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
            const secretKey = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
            serverKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
            console.log(`[Solana] Server wallet: ${serverKeypair.publicKey.toBase58()}`);
        } catch (err) {
            console.warn('[Solana] No server keypair loaded:', err.message);
        }
    }

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
export function isValidWager(wagerSOL) {
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
 * Settle a match — distribute winnings
 * For now: log the settlement. When escrow program is deployed,
 * this will call the on-chain settle instruction.
 *
 * @param {string} winnerAddress - Winner's wallet
 * @param {string} loserAddress - Loser's wallet
 * @param {number} wagerSOL - Each player's wager
 * @returns {Promise<{success: boolean, settlement: object, txSignature?: string}>}
 */
export async function settleMatch(winnerAddress, loserAddress, wagerSOL) {
    if (wagerSOL === 0) {
        return { success: true, settlement: { winner: 0, treasury: 0, ops: 0 }, txSignature: null };
    }

    const totalPot = wagerSOL * 2;
    const settlement = calculateSettlement(totalPot);

    console.log('[Solana] Settlement:', {
        winner: winnerAddress,
        winnerSOL: settlement.winner,
        treasurySOL: settlement.treasury,
        opsSOL: settlement.ops,
        totalPot,
    });

    // O4: When escrow is deployed, use a SINGLE batched transaction:
    //
    // const tx = new Transaction();
    // tx.add(SystemProgram.transfer({ fromPubkey: escrowPDA, toPubkey: new PublicKey(winnerAddress),
    //     lamports: Math.round(settlement.winner * LAMPORTS_PER_SOL) }));
    // tx.add(SystemProgram.transfer({ fromPubkey: escrowPDA, toPubkey: new PublicKey(TREASURY_WALLET),
    //     lamports: Math.round(settlement.treasury * LAMPORTS_PER_SOL) }));
    // tx.add(SystemProgram.transfer({ fromPubkey: escrowPDA, toPubkey: new PublicKey(OPS_WALLET),
    //     lamports: Math.round(settlement.ops * LAMPORTS_PER_SOL) }));
    // const sig = await sendAndConfirmTransaction(conn, tx, [serverKeypair]);
    //
    // One TX = one signature fee, one confirmation wait (3x savings vs separate TXs)

    return {
        success: true,
        settlement,
        txSignature: null, // Will be populated when escrow is live
    };
}

/**
 * Refund a cancelled match
 *
 * @param {string} playerAddress - Player to refund
 * @param {number} wagerSOL - Amount to refund
 * @returns {Promise<{success: boolean, txSignature?: string}>}
 */
export async function refundWager(playerAddress, wagerSOL) {
    if (wagerSOL === 0) {
        return { success: true, txSignature: null };
    }

    console.log('[Solana] Refund:', {
        player: playerAddress,
        amount: wagerSOL,
    });

    // Future: Execute on-chain refund via escrow program
    return {
        success: true,
        txSignature: null,
    };
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

export { WINNER_SHARE, TREASURY_SHARE, OPS_SHARE };
