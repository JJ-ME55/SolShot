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
const playerShotState = {};

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
 * @param {string} walletAddress
 * @returns {{ earned: number, milestone?: string, newBalance: number }}
 */
export function recordMatchPlayed(walletAddress) {
    const state = getPlayerShotState(walletAddress);
    if (!state) return { earned: 0, newBalance: 0 };

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
