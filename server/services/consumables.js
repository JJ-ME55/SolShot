/**
 * SHOT Consumables Service
 *
 * Temporary power-ups purchased by burning SHOT tokens.
 * Each consumable lasts 5 matches then expires.
 * All SHOT spent is burned permanently (supply sink).
 */

export const CONSUMABLES = {
    extra_rations:    { id: 'extra_rations',    name: 'Extra Rations',    cost: 5,  duration: 5, desc: '+200G starting gold' },
    smoke_screen:     { id: 'smoke_screen',     name: 'Smoke Screen',     cost: 8,  duration: 5, desc: 'Blocks opponent Tactical Scope' },
    tactical_scope:   { id: 'tactical_scope',   name: 'Tactical Scope',   cost: 12, duration: 5, desc: 'Trajectory preview (1/3 arc)' },
    reinforced_armor: { id: 'reinforced_armor', name: 'Reinforced Armor', cost: 18, duration: 5, desc: '+25 HP per match (275 total)' },
    overcharge:       { id: 'overcharge',       name: 'Overcharge',       cost: 25, duration: 5, desc: 'Power max 115 (15% extra range)' },
};

/**
 * Purchase a consumable. Deducts SHOT from player balance (burned).
 * @param {object} playerShotState - In-memory SHOT state for the player
 * @param {string} consumableId - Key from CONSUMABLES
 * @returns {{ success: boolean, error?: string, remaining?: number }}
 */
export function purchaseConsumable(playerShotState, consumableId) {
    const consumable = CONSUMABLES[consumableId];
    if (!consumable) return { success: false, error: 'Unknown consumable' };
    if (!playerShotState) return { success: false, error: 'No player state' };

    if (playerShotState.balance < consumable.cost) {
        return { success: false, error: 'Insufficient SHOT' };
    }

    // Deduct SHOT (burned permanently)
    playerShotState.balance -= consumable.cost;
    playerShotState.shotBurned = (playerShotState.shotBurned || 0) + consumable.cost;

    // Add to active consumables (or refresh duration if already active)
    if (!playerShotState.consumables) playerShotState.consumables = {};
    playerShotState.consumables[consumableId] = consumable.duration;

    return { success: true, remaining: playerShotState.consumables[consumableId] };
}

/**
 * Decrement consumable match counters after a match completes.
 * Removes expired consumables (remaining <= 0).
 * @param {object} playerShotState
 */
export function decrementConsumables(playerShotState) {
    if (!playerShotState?.consumables) return;
    for (const [id, remaining] of Object.entries(playerShotState.consumables)) {
        if (remaining <= 1) {
            delete playerShotState.consumables[id];
        } else {
            playerShotState.consumables[id] = remaining - 1;
        }
    }
}

/**
 * Get active consumable IDs for a player.
 * @param {object} playerShotState
 * @returns {string[]} Array of active consumable IDs
 */
export function getActiveConsumables(playerShotState) {
    if (!playerShotState?.consumables) return [];
    return Object.keys(playerShotState.consumables);
}

/**
 * Check if a specific consumable is active.
 * @param {object} playerShotState
 * @param {string} consumableId
 * @returns {boolean}
 */
export function hasConsumable(playerShotState, consumableId) {
    return playerShotState?.consumables?.[consumableId] > 0;
}
