/**
 * SolShot Weapon Definitions
 *
 * Static weapon data: costs, tiers, and metadata.
 * This is a config file, not a Mongoose model — weapon data is fixed.
 *
 * 13 launch weapons + 5 prestige weapons (locked until Phase 6)
 */

export const WEAPON_TIERS = {
    FREE: 'free',
    STANDARD: 'standard',
    TACTICAL: 'tactical',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary',
    PRESTIGE: 'prestige'
};

/**
 * All 15 launch weapons with Gold costs — Litepaper v2.0
 * ID matches the index in client's weaponArray
 */
export const WEAPON_CATALOG = {
    0:  { id: 0,  name: 'Single Shot',   tier: WEAPON_TIERS.FREE,      goldCost: 0,     blastRadius: 46,  damageFactor: 1.30 },
    25: { id: 25, name: 'Dirt Ball',      tier: WEAPON_TIERS.STANDARD,  goldCost: 150,   blastRadius: 0,   damageFactor: 0 },
    12: { id: 12, name: 'Magic Wall',     tier: WEAPON_TIERS.STANDARD,  goldCost: 200,   blastRadius: 0,   damageFactor: 0 },
    20: { id: 20, name: 'Skipper',        tier: WEAPON_TIERS.TACTICAL,  goldCost: 350,   blastRadius: 52,  damageFactor: 0.77 },
    2:  { id: 2,  name: '3 Shot',         tier: WEAPON_TIERS.TACTICAL,  goldCost: 400,   blastRadius: 46,  damageFactor: 0.43 },
    10: { id: 10, name: 'Spider',         tier: WEAPON_TIERS.TACTICAL,  goldCost: 400,   blastRadius: 28,  damageFactor: 0.71 },
    5:  { id: 5,  name: 'Heatseeker',     tier: WEAPON_TIERS.TACTICAL,  goldCost: 500,   blastRadius: 80,  damageFactor: 0.50 },
    15: { id: 15, name: 'Napalm',         tier: WEAPON_TIERS.RARE,      goldCost: 600,   blastRadius: 60,  damageFactor: 0.33 },
    7:  { id: 7,  name: 'Pile Driver',    tier: WEAPON_TIERS.RARE,      goldCost: 600,   blastRadius: 46,  damageFactor: 0.43 },
    11: { id: 11, name: 'Sniper Rifle',   tier: WEAPON_TIERS.RARE,      goldCost: 700,   blastRadius: 1,   damageFactor: 100 },
    1:  { id: 1,  name: 'Big Shot',       tier: WEAPON_TIERS.RARE,      goldCost: 700,   blastRadius: 90,  damageFactor: 0.33 },
    17: { id: 17, name: 'Ground Hog',     tier: WEAPON_TIERS.EPIC,      goldCost: 900,   blastRadius: 70,  damageFactor: 0.71 },
    4:  { id: 4,  name: 'Jackhammer',     tier: WEAPON_TIERS.EPIC,      goldCost: 1000,  blastRadius: 36,  damageFactor: 0.28 },
    16: { id: 16, name: 'Hail Storm',     tier: WEAPON_TIERS.EPIC,      goldCost: 1200,  blastRadius: 36,  damageFactor: 0.28 },
    9:  { id: 9,  name: 'Crazy Ivan',     tier: WEAPON_TIERS.LEGENDARY, goldCost: 2500,  blastRadius: 36,  damageFactor: 0.56 },
};

/**
 * Prestige-only weapons — Litepaper v2.0
 * Unlocked by burning SHOT tokens (free to use once unlocked)
 * Bronze=Homing Missile, Silver=Cruiser, Gold=Tommy Gun, Platinum=Chain Reaction, Diamond=Pineapple
 */
export const PRESTIGE_WEAPONS = {
    24: { id: 24, name: 'Homing Missile',  tier: WEAPON_TIERS.PRESTIGE, goldCost: 0, blastRadius: 80,  damageFactor: 0.75 },
    29: { id: 29, name: 'Cruiser',         tier: WEAPON_TIERS.PRESTIGE, goldCost: 0, blastRadius: 80,  damageFactor: 1.00 },
    26: { id: 26, name: 'Tommy Gun',       tier: WEAPON_TIERS.PRESTIGE, goldCost: 0, blastRadius: 16,  damageFactor: 1.25 },
    21: { id: 21, name: 'Chain Reaction',  tier: WEAPON_TIERS.PRESTIGE, goldCost: 0, blastRadius: 46,  damageFactor: 0.43 },
    22: { id: 22, name: 'Pineapple',       tier: WEAPON_TIERS.PRESTIGE, goldCost: 0, blastRadius: 80,  damageFactor: 0.50 },
};

/**
 * Get weapon data by ID
 * @param {number} weaponId
 * @returns {object|null} Weapon data or null if not found
 */
export function getWeapon(weaponId) {
    return WEAPON_CATALOG[weaponId] || null;
}

/**
 * Get weapon cost by ID
 * @param {number} weaponId
 * @returns {number} Gold cost (0 if free or not found)
 */
export function getWeaponCost(weaponId) {
    const weapon = WEAPON_CATALOG[weaponId];
    return weapon ? weapon.goldCost : 0;
}

/**
 * Check if a weapon is a launch weapon (available now)
 * @param {number} weaponId
 * @returns {boolean}
 */
export function isLaunchWeapon(weaponId) {
    return weaponId in WEAPON_CATALOG;
}

/**
 * Check if a weapon is prestige-only
 * @param {number} weaponId
 * @returns {boolean}
 */
export function isPrestigeWeapon(weaponId) {
    return weaponId in PRESTIGE_WEAPONS;
}

/**
 * Get all launch weapons as array (for sending to client)
 * @returns {object[]} Array of weapon data objects
 */
export function getAllLaunchWeapons() {
    return Object.values(WEAPON_CATALOG);
}

/**
 * Get tier color for UI display
 * @param {string} tier
 * @returns {number} Color as integer
 */
export function getTierColor(tier) {
    const colors = {
        [WEAPON_TIERS.FREE]:      0xcccccc,  // Grey
        [WEAPON_TIERS.STANDARD]:  0xffffff,  // White
        [WEAPON_TIERS.TACTICAL]:  0x00ccff,  // Cyan
        [WEAPON_TIERS.RARE]:      0x9966ff,  // Purple
        [WEAPON_TIERS.EPIC]:      0xff9900,  // Orange
        [WEAPON_TIERS.LEGENDARY]: 0xffcc00,  // Gold
        [WEAPON_TIERS.PRESTIGE]:  0xff3366,  // Pink
    };
    return colors[tier] || 0xffffff;
}
