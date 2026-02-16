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
 * Prestige tiers (cumulative SHOT burned):
 *   Tier 1: 200 SHOT  → Bronze  (unlock: Tommy Gun)
 *   Tier 2: 500 SHOT  → Silver  (unlock: Scatter Shot)
 *   Tier 3: 1200 SHOT → Gold    (unlock: Spike Ball)
 *   Tier 4: 4000 SHOT → Diamond (unlock: Mega Nuke, Heatseeker)
 *
 * Future: Replace in-memory tracking with on-chain SPL token
 * when shot-token program is deployed.
 */

import { loadServerState, saveServerState } from '../models/ServerState.js';

// Token supply config
export const SHOT_TOKEN_CONFIG = {
    name: 'SHOT',
    symbol: 'SHOT',
    decimals: 6,
    totalSupply: 10_000_000,     // 10M total
    rewardPool: 7_000_000,       // 70% for rewards
    teamAllocation: 1_500_000,   // 15% team
    liquidityPool: 1_000_000,    // 10% Raydium LP
    treasury: 500_000,           // 5% treasury
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

// Prestige tiers
export const PRESTIGE_TIERS = [
    { tier: 0, name: 'Unranked', burnCost: 0,    color: 'rgba(150,150,150,1)', weapons: [] },
    { tier: 1, name: 'Bronze',   burnCost: 200,  color: 'rgba(205,127,50,1)',  weapons: [26] },       // Tommy Gun
    { tier: 2, name: 'Silver',   burnCost: 500,  color: 'rgba(192,192,192,1)', weapons: [28] },       // Scatter Shot (ID 28 placeholder)
    { tier: 3, name: 'Gold',     burnCost: 1200, color: 'rgba(255,204,0,1)',   weapons: [24] },       // Spike Ball
    { tier: 4, name: 'Diamond',  burnCost: 4000, color: 'rgba(100,200,255,1)', weapons: [21, 29] },   // Mega Nuke, Heatseeker
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
