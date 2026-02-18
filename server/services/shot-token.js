/**
 * SolShot SHOT Token Service
 *
 * Handles SHOT token emissions and prestige burns:
 *   - Track match milestones → earn SHOT
 *   - Prestige tiers: burn SHOT to unlock weapons
 *   - Token supply: 10M, 70% reward pool
 *
 * Emission schedule (matches played → SHOT earned):
 *   1 match  → 50 SHOT   (welcome bonus)
 *   5 matches → 100 SHOT
 *   10 matches → 200 SHOT
 *   25 matches → 500 SHOT
 *   50 matches → 1000 SHOT
 *   100 matches → 2000 SHOT
 *   Every 50 after → 500 SHOT
 *
 * Prestige tiers — Litepaper v2.0 (cumulative SHOT burned):
 *   Tier 1: 200 SHOT  → Bronze   (unlock: Homing Missile)
 *   Tier 2: 500 SHOT  → Silver   (unlock: Cruiser)
 *   Tier 3: 1200 SHOT → Gold     (unlock: Tommy Gun)
 *   Tier 4: 2500 SHOT → Platinum (unlock: Chain Reaction)
 *   Tier 5: 4000 SHOT → Diamond  (unlock: Pineapple)
 *
 * Future: Replace in-memory tracking with on-chain SPL token
 * when shot-token program is deployed.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { loadServerState, saveServerState } from '../models/ServerState.js';

// Solana connection for burn verification
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');

// SHOT token mint — set via .env after deploy
const SHOT_MINT = process.env.SHOT_TOKEN_MINT || null;

// Track verified burn tx signatures to prevent replay
const verifiedBurnTxs = new Set();

// Token supply config — Litepaper v2.0
export const SHOT_TOKEN_CONFIG = {
    name: 'SHOT',
    symbol: 'SHOT',
    decimals: 9,                 // SPL token standard
    totalSupply: 10_000_000,     // 10M total
    rewardPool: 7_000_000,       // 70% for rewards
    treasury: 1_500_000,         // 15% treasury (multisig)
    teamAllocation: 1_000_000,   // 10% team (12mo cliff, 24mo linear)
    liquidityPool: 500_000,      // 5% Raydium LP (locked)
    mint: process.env.SHOT_TOKEN_MINT || null, // Set after deploy
};

// Milestone → SHOT earned
export const SHOT_MILESTONES = [
    { matches: 1,   reward: 50,   label: 'First Blood' },
    { matches: 5,   reward: 100,  label: 'Getting Started' },
    { matches: 10,  reward: 200,  label: 'Regular' },
    { matches: 25,  reward: 500,  label: 'Veteran' },
    { matches: 50,  reward: 1000, label: 'Expert' },
    { matches: 100, reward: 2000, label: 'Legend' },
];

// Recurring milestone: every 50 matches after 100
const RECURRING_MILESTONE_INTERVAL = 50;
const RECURRING_MILESTONE_REWARD = 500;

// Prestige tiers — Litepaper v2.0
// Each tier burns SHOT permanently. Cumulative: 200+500+1200+2500+4000 = 8400 SHOT to Diamond
export const PRESTIGE_TIERS = [
    { tier: 0, name: 'Unranked',  burnCost: 0,    color: 'rgba(150,150,150,1)', weapons: [] },
    { tier: 1, name: 'Bronze',    burnCost: 200,  color: 'rgba(205,127,50,1)',  weapons: [24] },       // Homing Missile (60dmg, guided)
    { tier: 2, name: 'Silver',    burnCost: 500,  color: 'rgba(192,192,192,1)', weapons: [29] },       // Cruiser (80dmg, rolling terrain bomb)
    { tier: 3, name: 'Gold',      burnCost: 1200, color: 'rgba(255,204,0,1)',   weapons: [26] },       // Tommy Gun (12x20=240 max, rapid-fire)
    { tier: 4, name: 'Platinum',  burnCost: 2500, color: 'rgba(180,160,255,1)', weapons: [21] },       // Chain Reaction (15x20=300 max, carpet-bomb)
    { tier: 5, name: 'Diamond',   burnCost: 4000, color: 'rgba(100,200,255,1)', weapons: [22] },       // Pineapple (20 fragments, 640 max)
];

// In-memory player SHOT state (keyed by walletAddress)
// H035: WARNING — this is in-memory only. Balances are lost on server restart.
// Full fix requires SPL token or database persistence (follow-up task).
const playerShotState = {};

// H034: Track total emitted SHOT across all players
// Fix 6: Persisted to MongoDB — loaded on startup, saved after every emission
let totalShotEmitted = 0;
let savePending = false;

/**
 * Initialize SHOT emission counter from MongoDB.
 * Call once after MongoDB connects.
 */
export async function initShotState() {
    const state = await loadServerState();
    totalShotEmitted = state.totalShotEmitted;
    console.log(`[SHOT] Initialized: totalShotEmitted = ${totalShotEmitted}`);
}

/**
 * Persist current totalShotEmitted to MongoDB (debounced — max 1 save/sec)
 */
function persistEmissionCount() {
    if (savePending) return;
    savePending = true;
    setTimeout(async () => {
        savePending = false;
        await saveServerState(totalShotEmitted);
    }, 1000);
}

/**
 * Get or create SHOT state for a player
 *
 * @param {string} walletAddress
 * @returns {object} { balance, matchesPlayed, milestonesEarned, prestigeTier, totalBurned }
 */
export function getPlayerShotState(walletAddress) {
    if (!walletAddress) return null;

    if (!playerShotState[walletAddress]) {
        playerShotState[walletAddress] = {
            balance: 0,
            matchesPlayed: 0,
            milestonesEarned: [],   // milestone match counts already claimed
            prestigeTier: 0,
            totalBurned: 0,
        };
    }

    return playerShotState[walletAddress];
}

/**
 * Record a completed match and check for SHOT milestones
 *
 * H033: Requires matchInfo for farming protection:
 *   - turnCount must be >= 4 (minimum meaningful game)
 *   - 30-second cooldown between rewards per wallet
 *   - matchId dedup prevents double-claiming
 *
 * H034: Enforces global supply cap — no emissions beyond rewardPool
 *
 * @param {string} walletAddress
 * @param {object} matchInfo - { turnCount, matchId }
 * @returns {{ earned: number, milestone?: string, newBalance: number }}
 */
export function recordMatchPlayed(walletAddress, matchInfo = {}) {
    const state = getPlayerShotState(walletAddress);
    if (!state) return { earned: 0, newBalance: 0 };

    // H033: Farming protection — minimum turns
    const { turnCount = 0, matchId = null } = matchInfo;
    if (turnCount < 4) {
        return { earned: 0, newBalance: state.balance, reason: 'Match too short for rewards' };
    }

    // H033: Farming protection — 30-second cooldown
    const now = Date.now();
    if (state.lastRewardAt && (now - state.lastRewardAt) < 30_000) {
        return { earned: 0, newBalance: state.balance, reason: 'Reward cooldown active' };
    }

    // H033: Farming protection — match ID dedup
    if (matchId && state.claimedMatchIds && state.claimedMatchIds.has(matchId)) {
        return { earned: 0, newBalance: state.balance, reason: 'Match already claimed' };
    }

    // H034: Check global supply cap before emitting
    if (totalShotEmitted >= SHOT_TOKEN_CONFIG.rewardPool) {
        return { earned: 0, newBalance: state.balance, reason: 'Reward pool exhausted' };
    }

    state.matchesPlayed++;
    let totalEarned = 0;
    let milestoneLabel = null;

    // Check standard milestones
    for (const ms of SHOT_MILESTONES) {
        if (state.matchesPlayed >= ms.matches && !state.milestonesEarned.includes(ms.matches)) {
            state.milestonesEarned.push(ms.matches);
            state.balance += ms.reward;
            totalEarned += ms.reward;
            milestoneLabel = ms.label;
        }
    }

    // Check recurring milestones (every 50 after 100)
    if (state.matchesPlayed > 100 && state.matchesPlayed % RECURRING_MILESTONE_INTERVAL === 0) {
        if (!state.milestonesEarned.includes(state.matchesPlayed)) {
            state.milestonesEarned.push(state.matchesPlayed);
            state.balance += RECURRING_MILESTONE_REWARD;
            totalEarned += RECURRING_MILESTONE_REWARD;
            milestoneLabel = `${state.matchesPlayed} Matches`;
        }
    }

    // H034: Clamp earned to remaining supply
    if (totalShotEmitted + totalEarned > SHOT_TOKEN_CONFIG.rewardPool) {
        const allowed = SHOT_TOKEN_CONFIG.rewardPool - totalShotEmitted;
        const excess = totalEarned - allowed;
        state.balance -= excess;  // Remove excess that was added above
        totalEarned = allowed;
    }

    // H034: Track global emissions
    totalShotEmitted += totalEarned;

    // Fix 6: Persist emission counter to MongoDB (debounced)
    if (totalEarned > 0) persistEmissionCount();

    // H033: Update anti-farming state
    state.lastRewardAt = now;
    if (!state.claimedMatchIds) state.claimedMatchIds = new Set();
    if (matchId) state.claimedMatchIds.add(matchId);

    return {
        earned: totalEarned,
        milestone: milestoneLabel,
        newBalance: state.balance,
        matchesPlayed: state.matchesPlayed,
    };
}

/**
 * Attempt to prestige (burn SHOT for next tier)
 *
 * @param {string} walletAddress
 * @returns {{ success: boolean, tier?: number, tierName?: string, reason?: string, balance?: number }}
 */
export function prestigeBurn(walletAddress) {
    const state = getPlayerShotState(walletAddress);
    if (!state) return { success: false, reason: 'No player state' };

    const currentTier = state.prestigeTier;
    const nextTier = PRESTIGE_TIERS[currentTier + 1];

    if (!nextTier) {
        return { success: false, reason: 'Already at max prestige', balance: state.balance };
    }

    if (state.balance < nextTier.burnCost) {
        return {
            success: false,
            reason: `Need ${nextTier.burnCost} SHOT, have ${state.balance}`,
            balance: state.balance,
            needed: nextTier.burnCost,
        };
    }

    // Burn SHOT
    state.balance -= nextTier.burnCost;
    state.totalBurned += nextTier.burnCost;
    state.prestigeTier = nextTier.tier;

    console.log(`[SHOT] Prestige burn: ${walletAddress} → Tier ${nextTier.tier} (${nextTier.name}), burned ${nextTier.burnCost} SHOT`);

    return {
        success: true,
        tier: nextTier.tier,
        tierName: nextTier.name,
        color: nextTier.color,
        unlockedWeapons: nextTier.weapons,
        balance: state.balance,
        totalBurned: state.totalBurned,
    };
}

/**
 * Get prestige info for display
 *
 * @param {string} walletAddress
 * @returns {object}
 */
export function getPrestigeInfo(walletAddress) {
    const state = getPlayerShotState(walletAddress);
    if (!state) return { tier: 0, tierName: 'Unranked', balance: 0 };

    const current = PRESTIGE_TIERS[state.prestigeTier];
    const next = PRESTIGE_TIERS[state.prestigeTier + 1] || null;

    return {
        tier: state.prestigeTier,
        tierName: current.name,
        tierColor: current.color,
        balance: state.balance,
        totalBurned: state.totalBurned,
        matchesPlayed: state.matchesPlayed,
        nextTier: next ? {
            tier: next.tier,
            name: next.name,
            burnCost: next.burnCost,
            canAfford: state.balance >= next.burnCost,
        } : null,
        unlockedWeapons: PRESTIGE_TIERS
            .filter(t => t.tier <= state.prestigeTier)
            .flatMap(t => t.weapons),
    };
}

/**
 * Get SHOT balance for a player
 *
 * @param {string} walletAddress
 * @returns {number}
 */
export function getShotBalance(walletAddress) {
    const state = getPlayerShotState(walletAddress);
    return state ? state.balance : 0;
}

/**
 * Verify an on-chain SHOT burn transaction before unlocking prestige.
 *
 * Checks:
 *   1. Transaction exists and is confirmed
 *   2. Transaction has not been used for a previous prestige burn (replay protection)
 *   3. Transaction contains a Burn instruction for the SHOT token mint
 *   4. Burn was signed by the claimed wallet address
 *   5. Burn amount matches the expected prestige tier cost
 *
 * @param {string} txSignature — Solana transaction signature
 * @param {string} walletAddress — Player's wallet address (must match signer)
 * @param {number} expectedAmount — Expected burn amount in whole SHOT tokens
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
export async function verifyBurnTransaction(txSignature, walletAddress, expectedAmount) {
    // If no SHOT mint is configured, skip on-chain verification (dev mode)
    if (!SHOT_MINT) {
        console.log('[SHOT] No SHOT_TOKEN_MINT configured — skipping on-chain burn verification (dev mode)');
        return { valid: true };
    }

    // Replay protection — each tx can only unlock one prestige
    if (verifiedBurnTxs.has(txSignature)) {
        return { valid: false, reason: 'Transaction already used for prestige' };
    }

    try {
        // Fetch the confirmed transaction
        const tx = await connection.getParsedTransaction(txSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
            return { valid: false, reason: 'Transaction not found or not confirmed' };
        }

        if (tx.meta?.err) {
            return { valid: false, reason: 'Transaction failed on-chain' };
        }

        // Look for a Burn instruction targeting the SHOT mint
        const instructions = tx.transaction.message.instructions;
        let burnFound = false;

        for (const ix of instructions) {
            // Check parsed token instructions (SPL Token program)
            if (ix.program === 'spl-token' && ix.parsed) {
                const { type, info } = ix.parsed;

                if (type === 'burn' || type === 'burnChecked') {
                    const ixMint = info.mint;
                    const ixAuthority = info.authority;
                    const ixAmount = type === 'burnChecked'
                        ? parseInt(info.tokenAmount?.amount || '0')
                        : parseInt(info.amount || '0');

                    // Verify mint matches SHOT token
                    if (ixMint !== SHOT_MINT) continue;

                    // Verify signer matches the player's wallet
                    if (ixAuthority !== walletAddress) {
                        return { valid: false, reason: 'Burn was not signed by your wallet' };
                    }

                    // Verify amount (expectedAmount is in whole tokens, on-chain is raw with 9 decimals)
                    const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
                    if (BigInt(ixAmount) < expectedRaw) {
                        return { valid: false, reason: `Burned ${ixAmount} raw but need ${expectedRaw} for prestige` };
                    }

                    burnFound = true;
                    break;
                }
            }
        }

        // Also check innerInstructions for burn (some wallets wrap in CPI)
        if (!burnFound && tx.meta?.innerInstructions) {
            for (const inner of tx.meta.innerInstructions) {
                for (const ix of inner.instructions) {
                    if (ix.program === 'spl-token' && ix.parsed) {
                        const { type, info } = ix.parsed;
                        if (type === 'burn' || type === 'burnChecked') {
                            if (info.mint === SHOT_MINT && info.authority === walletAddress) {
                                const ixAmount = type === 'burnChecked'
                                    ? parseInt(info.tokenAmount?.amount || '0')
                                    : parseInt(info.amount || '0');
                                const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
                                if (BigInt(ixAmount) >= expectedRaw) {
                                    burnFound = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (burnFound) break;
            }
        }

        if (!burnFound) {
            return { valid: false, reason: 'No valid SHOT burn found in transaction' };
        }

        // Mark tx as used (replay protection)
        verifiedBurnTxs.add(txSignature);

        return { valid: true };
    } catch (err) {
        console.error('[SHOT] Burn verification error:', err.message);
        return { valid: false, reason: 'Failed to verify burn transaction' };
    }
}
