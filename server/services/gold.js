/**
 * SolShot Gold Economy Service
 *
 * Server-authoritative Gold management.
 * Client displays Gold but NEVER computes it.
 *
 * Earn rates:
 *   +15 Gold per HP damage dealt
 *   +200 Gold kill bonus (reduce enemy to 0 HP)
 *   +300 Gold placement gold (1st/2nd/3rd/4th: 300/150/75/0)
 *
 * Starting balance: 1,000 Gold
 */

const STARTING_GOLD = 1000;
const GOLD_PER_DAMAGE = 15;     // per HP of damage dealt
const KILL_BONUS = 200;          // when enemy HP reaches 0
const ROUND_WIN_BONUS = 300;     // kept for backward compat (use awardPlacementGold for N-player)
const PLACEMENT_GOLD = [300, 150, 75, 0]; // [1st, 2nd, 3rd, 4th] — index = placement rank

/**
 * Create initial Gold state for a match
 * @param {string[]} playerIds - Array of socket IDs (2-4 players)
 * @returns {object} Gold balances keyed by playerId
 */
export function initGold(playerIds) {
    const state = {};
    for (const id of playerIds) {
        state[id] = STARTING_GOLD;
    }
    return state;
}

/**
 * Get a player's current Gold balance
 * @param {object} goldState - Gold balances object
 * @param {string} playerId
 * @returns {number}
 */
export function getBalance(goldState, playerId) {
    return goldState[playerId] || 0;
}

/**
 * Calculate Gold earned from damage dealt
 * @param {number} damageDealt - Positive damage dealt to opponent
 * @returns {number} Gold earned
 */
export function goldFromDamage(damageDealt) {
    if (damageDealt <= 0) return 0;
    return Math.floor(damageDealt * GOLD_PER_DAMAGE);
}

/**
 * Award Gold for damage dealt in a turn
 * @param {object} goldState - Gold balances object (mutated)
 * @param {string} shooterId - Player who fired
 * @param {number} damageDealt - Positive damage dealt to opponent
 * @returns {number} Gold earned this turn
 */
export function earnGold(goldState, shooterId, damageDealt) {
    const earned = goldFromDamage(damageDealt);
    goldState[shooterId] = (goldState[shooterId] || 0) + earned;
    return earned;
}

/**
 * Award kill bonus
 * @param {object} goldState - Gold balances object (mutated)
 * @param {string} killerId
 * @returns {number} Bonus awarded
 */
export function awardKillBonus(goldState, killerId) {
    goldState[killerId] = (goldState[killerId] || 0) + KILL_BONUS;
    return KILL_BONUS;
}

/**
 * Award round win bonus
 * @param {object} goldState - Gold balances object (mutated)
 * @param {string} winnerId
 * @returns {number} Bonus awarded
 */
export function awardRoundWinBonus(goldState, winnerId) {
    goldState[winnerId] = (goldState[winnerId] || 0) + ROUND_WIN_BONUS;
    return ROUND_WIN_BONUS;
}

/**
 * Award Gold based on round placement (N-player)
 * 1st: 300G, 2nd: 150G, 3rd: 75G, 4th: 0G
 * @param {object} goldState - Gold balances object (mutated)
 * @param {string[]} rankedPlayerIds - Player IDs in placement order [1st, 2nd, 3rd, 4th]
 * @returns {object} Gold awarded per player { [playerId]: amount }
 */
export function awardPlacementGold(goldState, rankedPlayerIds) {
    const awarded = {};
    rankedPlayerIds.forEach((pid, i) => {
        const amount = PLACEMENT_GOLD[i] ?? 0;
        if (amount > 0) {
            goldState[pid] = (goldState[pid] || 0) + amount;
        }
        awarded[pid] = amount;
    });
    return awarded;
}

/**
 * Attempt to spend Gold on a weapon purchase
 * @param {object} goldState - Gold balances object (mutated)
 * @param {string} playerId
 * @param {number} cost - Weapon cost
 * @returns {{success: boolean, balance: number, reason?: string}}
 */
export function spendGold(goldState, playerId, cost) {
    const balance = goldState[playerId] || 0;

    if (cost < 0) {
        return { success: false, balance, reason: 'Invalid cost' };
    }
    if (cost === 0) {
        // Free weapons always succeed
        return { success: true, balance };
    }
    if (balance < cost) {
        return { success: false, balance, reason: 'Insufficient Gold' };
    }

    goldState[playerId] = balance - cost;
    return { success: true, balance: goldState[playerId] };
}

// Export constants for testing
export { STARTING_GOLD, GOLD_PER_DAMAGE, KILL_BONUS, ROUND_WIN_BONUS, PLACEMENT_GOLD };
