/**
 * SolShot SHOT Token Service
 *
 * Handles SHOT token emissions and prestige burns:
 *   - Track match milestones → earn SHOT (Litepaper v2.1)
 *   - Prestige tiers: burn SHOT to unlock weapons
 *   - Token supply: 10M, 70% reward pool
 *
 * Emission schedule — Litepaper v2.1 (8 one-time milestones per account):
 *   first_wagered_match    → 10 SHOT   (First Wagered Match)
 *   ten_wagered_wins       → 25 SHOT   (10 Wagered Wins)
 *   fifty_wagered_wins     → 75 SHOT   (50 Wagered Wins)
 *   100_wagered_matches    → 50 SHOT   (100 Wagered Matches Played)
 *   500_damage_round       → 15 SHOT   (500+ Damage in a Single Round)
 *   no_prestige_win        → 20 SHOT   (Win Without Prestige Weapons)
 *   five_win_streak        → 40 SHOT   (Win 5 Matches in a Row)
 *   100_total_matches      → 100 SHOT  (Reach 100 Total Matches)
 *
 * Practice mode: all emission rates are 25% of standard.
 *
 * Prestige tiers — Litepaper v2.0 (cumulative SHOT burned):
 *   Tier 1: 200 SHOT  → Bronze   (unlock: Homing Missile)
 *   Tier 2: 500 SHOT  → Silver   (unlock: Cruiser)
 *   Tier 3: 1200 SHOT → Gold     (unlock: Tommy Gun)
 *   Tier 4: 2500 SHOT → Platinum (unlock: Chain Reaction)
 *   Tier 5: 4000 SHOT → Diamond  (unlock: Pineapple)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { loadServerState, saveServerState, persistBurnTx } from '../models/ServerState.js';
import User from '../models/User.js';
import logger from './logger.js';

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

// Litepaper v2.1 — 8 one-time milestones per account
export const SHOT_MILESTONES = [
    { id: 'first_wagered_match',  label: 'First Wagered Match',            reward: 10,  check: (s) => s.wageredMatchesPlayed >= 1 },
    { id: 'ten_wagered_wins',     label: '10 Wagered Wins',                reward: 25,  check: (s) => s.wageredWins >= 10 },
    { id: 'fifty_wagered_wins',   label: '50 Wagered Wins',                reward: 75,  check: (s) => s.wageredWins >= 50 },
    { id: '100_wagered_matches',  label: '100 Wagered Matches Played',     reward: 50,  check: (s) => s.wageredMatchesPlayed >= 100 },
    { id: '500_damage_round',     label: '500+ Damage in a Single Round',  reward: 15,  check: (s, ctx) => ctx && ctx.maxRoundDamage >= 500 },
    { id: 'no_prestige_win',      label: 'Win Without Prestige Weapons',   reward: 20,  check: (s, ctx) => ctx && ctx.isWinner && ctx.usedNoPrestige },
    { id: 'five_win_streak',      label: 'Win 5 Matches in a Row',         reward: 40,  check: (s) => s.consecutiveWins >= 5 },
    { id: '100_total_matches',    label: 'Reach 100 Total Matches',        reward: 100, check: (s) => s.totalMatchesPlayed >= 100 },
];

// Prestige weapon IDs — used to determine usedNoPrestige flag
export const PRESTIGE_WEAPON_IDS = [24, 29, 26, 21, 22];

// Per-match SHOT drip — Litepaper v2.2
const SHOT_PER_WAGERED_MATCH = 2;
const SHOT_PER_WAGERED_WIN = 3;    // bonus on top of match drip
const SHOT_PER_PRACTICE_MATCH = 0.5;
const SHOT_PER_PRACTICE_WIN = 0.5;
const DAILY_SHOT_CAP = 25;

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
// Persisted to MongoDB — loaded on authenticate, saved after each match
const playerShotState = {};

// H034: Track total emitted SHOT across all players
// Persisted to MongoDB — loaded on startup, saved after every emission
let totalShotEmitted = 0;
let savePending = false;

/**
 * Initialize SHOT emission counter from MongoDB.
 * Call once after MongoDB connects.
 */
export async function initShotState() {
    const state = await loadServerState();
    totalShotEmitted = state.totalShotEmitted;
    // TE-01: Restore verified burn tx signatures from MongoDB
    if (state.verifiedBurnTxs && state.verifiedBurnTxs.length > 0) {
        state.verifiedBurnTxs.forEach(tx => verifiedBurnTxs.add(tx));
    }
    console.log(`[SHOT] Initialized: totalShotEmitted = ${totalShotEmitted}, verifiedBurnTxs = ${verifiedBurnTxs.size}`);
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
 * Get or create SHOT state for a player.
 * v2.1 state schema includes wagered match tracking for milestone checks.
 *
 * @param {string} walletAddress
 * @returns {object} Player shot state
 */
export function getPlayerShotState(walletAddress) {
    if (!walletAddress) return null;

    if (!playerShotState[walletAddress]) {
        playerShotState[walletAddress] = {
            balance: 0,
            totalMatchesPlayed: 0,
            wageredMatchesPlayed: 0,
            wageredWins: 0,
            consecutiveWins: 0,
            milestonesEarned: [],   // milestone IDs already claimed
            prestigeTier: 0,
            totalBurned: 0,
            lastRewardAt: null,
            claimedMatchIds: new Set(),
            // Legacy field — kept for backward compat with getPrestigeInfo
            matchesPlayed: 0,
        };
    }

    return playerShotState[walletAddress];
}

/**
 * Load persisted milestone state from MongoDB into in-memory playerShotState.
 * Call on player authenticate to restore state across server restarts.
 *
 * @param {string} walletAddress
 * @returns {Promise<void>}
 */
export async function loadMilestoneState(walletAddress) {
    if (!walletAddress) return;

    try {
        const user = await User.findOne({ walletAddress });
        if (!user) return;

        const state = getPlayerShotState(walletAddress);
        const s = user.stats;

        // Restore persisted fields (only overwrite if DB has meaningful data)
        if (s.totalMatchesPlayed > 0) state.totalMatchesPlayed = s.totalMatchesPlayed;
        if (s.wageredMatchesPlayed > 0) state.wageredMatchesPlayed = s.wageredMatchesPlayed;
        if (s.wageredWins > 0) state.wageredWins = s.wageredWins;
        if (s.consecutiveWins > 0) state.consecutiveWins = s.consecutiveWins;
        if (s.milestonesEarned && s.milestonesEarned.length > 0) state.milestonesEarned = [...s.milestonesEarned];
        if (s.shotBalance > 0) state.balance = s.shotBalance;
        if (s.totalBurned > 0) state.totalBurned = s.totalBurned;
        if (s.prestigeTier > 0) state.prestigeTier = s.prestigeTier;
        // TE-02: Restore claimed match IDs from MongoDB
        if (s.claimedMatchIds && s.claimedMatchIds.length > 0) {
            state.claimedMatchIds = new Set(s.claimedMatchIds);
        }

        // Keep legacy field in sync
        state.matchesPlayed = state.totalMatchesPlayed;

        logger.info({ tier: state.prestigeTier, wageredMatches: state.wageredMatchesPlayed }, '[SHOT] Loaded player state');
    } catch (err) {
        console.error(`[SHOT] Failed to load milestone state for ${walletAddress}:`, err.message);
    }
}

/**
 * Persist milestone state to MongoDB (fire-and-forget).
 * Called at end of recordMatchPlayed — does NOT block the function.
 *
 * @param {string} walletAddress
 * @returns {void}
 */
export function saveMilestoneState(walletAddress) {
    if (!walletAddress) return;

    const state = playerShotState[walletAddress];
    if (!state) return;

    // Fire-and-forget — errors logged but not propagated
    User.findOneAndUpdate(
        { walletAddress },
        {
            $set: {
                'stats.totalMatchesPlayed': state.totalMatchesPlayed,
                'stats.wageredMatchesPlayed': state.wageredMatchesPlayed,
                'stats.wageredWins': state.wageredWins,
                'stats.consecutiveWins': state.consecutiveWins,
                'stats.milestonesEarned': state.milestonesEarned,
                'stats.shotBalance': state.balance,
                'stats.totalBurned': state.totalBurned,
                'stats.prestigeTier': state.prestigeTier,
                'stats.claimedMatchIds': [...state.claimedMatchIds],
            },
            $max: {
                'stats.totalShotEarned': state.balance + state.totalBurned,
            },
        },
        { upsert: true }
    ).catch(err => {
        console.error(`[SHOT] Failed to save milestone state for ${walletAddress}:`, err.message);
    });
}

/**
 * Record a completed match and check for SHOT milestones (Litepaper v2.1).
 *
 * Anti-farming protection:
 *   - turnCount must be >= 4 (minimum meaningful game)
 *   - 30-second cooldown between rewards per wallet
 *   - matchId dedup prevents double-claiming
 *
 * Practice mode emits at 25% of standard rate.
 *
 * @param {string} walletAddress
 * @param {object} matchInfo - {
 *   turnCount: number,         minimum turns to qualify
 *   matchId: string,           deduplication key
 *   isWagered: boolean,        false = Practice mode (25% rate)
 *   isWinner: boolean,         player won this match
 *   maxRoundDamage: number,    highest single-round damage dealt
 *   weaponsUsed: number[],     weapon IDs used in this match
 * }
 * @returns {{ earned: number, milestone?: string, newBalance: number, matchesPlayed?: number }}
 */
export function recordMatchPlayed(walletAddress, matchInfo = {}) {
    const state = getPlayerShotState(walletAddress);
    if (!state) return { earned: 0, newBalance: 0 };

    // H033: Farming protection — minimum turns
    const {
        turnCount = 0,
        matchId = null,
        isWagered = false,
        isWinner = false,
        maxRoundDamage = 0,
        weaponsUsed = [],
    } = matchInfo;

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

    // Update match counters
    state.totalMatchesPlayed++;
    state.matchesPlayed = state.totalMatchesPlayed; // keep legacy field in sync

    if (isWagered) {
        state.wageredMatchesPlayed++;
        if (isWinner) {
            state.wageredWins++;
            state.consecutiveWins++;
        } else {
            state.consecutiveWins = 0; // reset streak on any loss
        }
    } else {
        // Practice mode: streak unaffected (neither increments nor resets)
    }

    // Determine if player used only non-prestige weapons
    const usedPrestige = weaponsUsed.some(id => PRESTIGE_WEAPON_IDS.includes(id));
    const usedNoPrestige = !usedPrestige;

    // Build context for milestone checks
    const ctx = { isWagered, isWinner, maxRoundDamage, usedNoPrestige };

    // Practice mode rate multiplier (25% of standard reward)
    const rateMultiplier = isWagered ? 1.0 : 0.25;

    let totalEarned = 0;
    let milestoneLabel = null;

    // Check all 8 v2.1 milestones — each earned at most once per account
    for (const ms of SHOT_MILESTONES) {
        if (state.milestonesEarned.includes(ms.id)) continue;
        if (!ms.check(state, ctx)) continue;

        const reward = Math.floor(ms.reward * rateMultiplier);
        state.milestonesEarned.push(ms.id);
        state.balance += reward;
        totalEarned += reward;
        milestoneLabel = ms.label;
    }

    // Per-match SHOT drip (daily capped at 25 SHOT)
    const today = new Date().toISOString().slice(0, 10);
    if (state._dailyDripDate !== today) {
        state._dailyDripDate = today;
        state._dailyDripTotal = 0;
    }
    let dripEarned = 0;
    if (state._dailyDripTotal < DAILY_SHOT_CAP) {
        if (isWagered) {
            dripEarned += SHOT_PER_WAGERED_MATCH;
            if (isWinner) dripEarned += SHOT_PER_WAGERED_WIN;
        } else {
            dripEarned += SHOT_PER_PRACTICE_MATCH;
            if (isWinner) dripEarned += SHOT_PER_PRACTICE_WIN;
        }
        dripEarned = Math.min(dripEarned, DAILY_SHOT_CAP - state._dailyDripTotal);
        state._dailyDripTotal += dripEarned;
        state.balance += dripEarned;
        state.totalShotEarned += dripEarned;
        totalEarned += dripEarned;
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

    // Persist emission counter to MongoDB (debounced)
    if (totalEarned > 0) persistEmissionCount();

    // H033: Update anti-farming state
    state.lastRewardAt = now;
    if (!state.claimedMatchIds) state.claimedMatchIds = new Set();
    if (matchId) state.claimedMatchIds.add(matchId);

    // Persist milestone state to MongoDB (fire-and-forget — does not block)
    saveMilestoneState(walletAddress);

    return {
        earned: totalEarned,
        dripEarned: dripEarned || 0,
        milestone: milestoneLabel,
        newBalance: state.balance,
        matchesPlayed: state.totalMatchesPlayed,
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

    // Persist updated state (fire-and-forget)
    saveMilestoneState(walletAddress);

    logger.info({ tier: nextTier.tier, tierName: nextTier.name, burned: nextTier.burnCost }, '[SHOT] Prestige burn');

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

    // A4: Replay protection with TOCTOU guard — claim slot before async verification
    if (verifiedBurnTxs.has(txSignature)) {
        return { valid: false, reason: 'Transaction already used for prestige' };
    }
    // Immediately mark as claimed to prevent concurrent verification of same TX
    verifiedBurnTxs.add(txSignature);

    try {
        // Fetch the confirmed transaction
        const tx = await connection.getParsedTransaction(txSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
            verifiedBurnTxs.delete(txSignature);
            return { valid: false, reason: 'Transaction not found or not confirmed' };
        }

        if (tx.meta?.err) {
            verifiedBurnTxs.delete(txSignature);
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
                        verifiedBurnTxs.delete(txSignature);
                        return { valid: false, reason: 'Burn was not signed by your wallet' };
                    }

                    // Verify amount (expectedAmount is in whole tokens, on-chain is raw with 9 decimals)
                    const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
                    if (BigInt(ixAmount) < expectedRaw) {
                        verifiedBurnTxs.delete(txSignature);
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
            // A4: Release claim — TX was not a valid burn
            verifiedBurnTxs.delete(txSignature);
            return { valid: false, reason: 'No valid SHOT burn found in transaction' };
        }

        // TX already claimed in set above — persist to MongoDB so replay protection survives restart
        persistBurnTx(txSignature);

        return { valid: true };
    } catch (err) {
        // A4: Release claim on error so user can retry
        verifiedBurnTxs.delete(txSignature);
        console.error('[SHOT] Burn verification error:', err.message);
        return { valid: false, reason: 'Failed to verify burn transaction' };
    }
}
