/**
 * Marathon trick-shot setup catalogue (server-held).
 *
 * Source of truth in markdown: Docs/arcade/pool/design/TRICK_SHOT_LIBRARY_v0.md.
 * This file is the executable mirror — keep in sync when the markdown
 * library changes.
 *
 * Catalogue API:
 *   getSetupById(id) — returns the setup object or null
 *   getSetupsByTier(tier) — all setups at tier 1-4
 *   pickNextSetup(runState) — auto-ladder: picks the next setup for
 *     a given run based on progress (setupsCompleted)
 *   listSetupIds() — all known IDs (debug / leaderboard)
 *
 * Auto-ladder algorithm (per TRICK_SHOT_LIBRARY_v0.md §"Server-held catalogue shape"):
 *   - setupsCompleted 0-2  → 100% Tier 1
 *   - setupsCompleted 3-5  → 50% T1, 50% T2
 *   - setupsCompleted 6-8  → 50% T2, 50% T3
 *   - setupsCompleted 9-11 → 50% T3, 50% T4
 *   - setupsCompleted 12+  → 100% T4 (recycled)
 *
 * The ladder uses deterministic selection (round-robin within tier) so
 * a player's first run and tenth run see the same setup at the same
 * position — keeps the difficulty curve predictable. We could go random
 * later but determinism makes leaderboard comparisons fairer.
 */

// ──────────────────────────────────────────────────────────────────────
// Tier 1 — Basic (8 setups)
// ──────────────────────────────────────────────────────────────────────

const TIER_1_SETUPS = [
    {
        id: 'T1-01',
        name: 'Open the Door',
        tier: 1,
        goldReward: 8,
        timeLimitMs: 30000,
        hint: 'Pot the 8 in the top-right corner. Straight line, no funny business.',
        balls: [
            { id: 0, color: 'white',  x: 413,  y: 413 },
            { id: 8, color: 'black',  x: 1000, y: 413 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 8, pocketIdx: 2 }
    },
    {
        id: 'T1-02',
        name: 'Two-Ball Train',
        tier: 1,
        goldReward: 10,
        timeLimitMs: 30000,
        hint: 'Combo. Cue → 3 → 5 → corner pocket.',
        balls: [
            { id: 0,  color: 'white',  x: 300,  y: 413 },
            { id: 3,  color: 'yellow', x: 700,  y: 413 },
            { id: 5,  color: 'yellow', x: 1100, y: 413 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 5, pocketIdx: 5 }
    },
    {
        id: 'T1-03',
        name: 'Long Rail',
        tier: 1,
        goldReward: 10,
        timeLimitMs: 30000,
        hint: 'Long rail shot — pot the 4 in the top-left.',
        balls: [
            { id: 0, color: 'white',  x: 200, y: 600 },
            { id: 4, color: 'yellow', x: 200, y: 100 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 4, pocketIdx: 0 }
    },
    {
        id: 'T1-04',
        name: 'Side Pocket Drop',
        tier: 1,
        goldReward: 8,
        timeLimitMs: 30000,
        hint: 'Drop the 7 into the side pocket.',
        balls: [
            { id: 0, color: 'white', x: 300, y: 413 },
            { id: 7, color: 'yellow', x: 700, y: 200 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 7, pocketIdx: 1 }
    },
    {
        id: 'T1-05',
        name: 'Stop Shot',
        tier: 1,
        goldReward: 10,
        timeLimitMs: 30000,
        hint: 'Use backspin to stop the cue ball after potting the 1.',
        balls: [
            { id: 0, color: 'white', x: 700, y: 413 },
            { id: 1, color: 'yellow', x: 1100, y: 413 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 1, pocketIdx: 5 }
        // Note: this setup teaches the spin widget. UI nudges player to set spinY = -1.
    },
    {
        id: 'T1-06',
        name: 'Cut to the Corner',
        tier: 1,
        goldReward: 10,
        timeLimitMs: 30000,
        hint: 'Cut the 2 into the top-right corner.',
        balls: [
            { id: 0, color: 'white', x: 400, y: 600 },
            { id: 2, color: 'yellow', x: 800, y: 400 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 2, pocketIdx: 2 }
    },
    {
        id: 'T1-07',
        name: 'Clean Break',
        tier: 1,
        goldReward: 12,
        timeLimitMs: 30000,
        hint: 'Break the rack and pot at least one ball.',
        useStandardRack: true,                                        // sim builds the rack
        winCondition: { type: 'pot_multiple', minCount: 1 }
    },
    {
        id: 'T1-08',
        name: 'Frozen Pair',
        tier: 1,
        goldReward: 12,
        timeLimitMs: 30000,
        hint: 'Hit the 6 squarely. The 9 should kick into the corner.',
        balls: [
            { id: 0, color: 'white', x: 400, y: 413 },
            { id: 6, color: 'yellow', x: 700, y: 400 },
            { id: 9, color: 'red', x: 732, y: 400 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 9, pocketIdx: 2 }
    }
];

// ──────────────────────────────────────────────────────────────────────
// Tier 2 — Intermediate (8 setups; pending full catalogue migration
// from TRICK_SHOT_LIBRARY_v0.md — Tier 1 verified first to ship
// playable mode end-to-end)
// ──────────────────────────────────────────────────────────────────────

const TIER_2_SETUPS = [
    {
        id: 'T2-01',
        name: 'One-Rail Bank',
        tier: 2,
        goldReward: 18,
        timeLimitMs: 35000,
        hint: 'Bank the 4 off the top rail into the bottom-right pocket.',
        balls: [
            { id: 0, color: 'white', x: 700, y: 413 },
            { id: 4, color: 'yellow', x: 1100, y: 200 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 4, pocketIdx: 5, bankMinimum: 1 }
    },
    {
        id: 'T2-02',
        name: 'Three-Ball Combo',
        tier: 2,
        goldReward: 22,
        timeLimitMs: 40000,
        hint: 'Chain combo: cue → 1 → 3 → 5 → corner.',
        balls: [
            { id: 0, color: 'white',  x: 300,  y: 413 },
            { id: 1, color: 'yellow', x: 600,  y: 413 },
            { id: 3, color: 'yellow', x: 900,  y: 413 },
            { id: 5, color: 'yellow', x: 1100, y: 413 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 5, pocketIdx: 5 }
    }
    // TODO: T2-03 through T2-08 — see TRICK_SHOT_LIBRARY_v0.md §"Tier 2"
    // Migrating in stages so the mode ships playable with the early subset.
];

// ──────────────────────────────────────────────────────────────────────
// Tier 3 — Hard (placeholder, see markdown library)
// ──────────────────────────────────────────────────────────────────────

const TIER_3_SETUPS = [
    {
        id: 'T3-01',
        name: 'Two-Rail Bank',
        tier: 3,
        goldReward: 32,
        timeLimitMs: 45000,
        hint: 'Bank the 8 off two rails into the bottom-right.',
        balls: [
            { id: 0, color: 'white', x: 400, y: 600 },
            { id: 8, color: 'black', x: 400, y: 200 }
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 8, pocketIdx: 5, bankMinimum: 2 }
    }
    // TODO: T3-02 through T3-08
];

// ──────────────────────────────────────────────────────────────────────
// Tier 4 — Expert (placeholder; flagship shots — Massé, Cradle, etc.)
// ──────────────────────────────────────────────────────────────────────

const TIER_4_SETUPS = [
    {
        id: 'T4-01',
        name: 'The Z',
        tier: 4,
        goldReward: 60,
        timeLimitMs: 60000,
        hint: 'Z-pattern. Two rails, over the obstacle, into the corner.',
        balls: [
            { id: 0, color: 'white', x: 300, y: 700 },
            { id: 5, color: 'yellow', x: 1100, y: 100 },
            { id: 6, color: 'yellow', x: 700, y: 413 }                  // obstacle
        ],
        winCondition: { type: 'pot_in_pocket', ballId: 5, pocketIdx: 2, bankMinimum: 2 }
    }
    // TODO: T4-02 through T4-06 (Massé, Jump, Machine Gun, Cradle, Mirror Shot)
];

// ──────────────────────────────────────────────────────────────────────
// Catalogue access
// ──────────────────────────────────────────────────────────────────────

const ALL_SETUPS = [
    ...TIER_1_SETUPS,
    ...TIER_2_SETUPS,
    ...TIER_3_SETUPS,
    ...TIER_4_SETUPS
];

const SETUPS_BY_ID = new Map(ALL_SETUPS.map(s => [s.id, s]));
const SETUPS_BY_TIER = {
    1: TIER_1_SETUPS,
    2: TIER_2_SETUPS,
    3: TIER_3_SETUPS,
    4: TIER_4_SETUPS
};

export function getSetupById(id) {
    return SETUPS_BY_ID.get(id) || null;
}

export function getSetupsByTier(tier) {
    return SETUPS_BY_TIER[tier] || [];
}

export function listSetupIds() {
    return ALL_SETUPS.map(s => s.id);
}

/**
 * Auto-ladder pick: given run state (setupsCompleted + tier history),
 * return the next setup to attempt. Deterministic — same input always
 * gives same output, so leaderboard runs are comparable.
 *
 * Algorithm:
 *   setupsCompleted < 3   → Tier 1 round-robin
 *   setupsCompleted < 6   → alternate Tier 1 / Tier 2
 *   setupsCompleted < 9   → alternate Tier 2 / Tier 3
 *   setupsCompleted < 12  → alternate Tier 3 / Tier 4
 *   setupsCompleted ≥ 12  → Tier 4 round-robin
 *
 * @param {object} runState
 * @param {number} runState.setupsAttempted - total attempted (including skipped)
 * @returns {object|null} next setup, or null if catalogue exhausted (shouldn't happen)
 */
export function pickNextSetup({ setupsAttempted = 0 } = {}) {
    let tier;
    if (setupsAttempted < 3)       tier = 1;
    else if (setupsAttempted < 6)  tier = (setupsAttempted % 2 === 0) ? 1 : 2;
    else if (setupsAttempted < 9)  tier = (setupsAttempted % 2 === 0) ? 2 : 3;
    else if (setupsAttempted < 12) tier = (setupsAttempted % 2 === 0) ? 3 : 4;
    else                           tier = 4;

    const pool = SETUPS_BY_TIER[tier];
    if (!pool || pool.length === 0) {
        // Fallback if a tier is empty (e.g. catalogue still being populated):
        // try adjacent tiers below first, then any non-empty.
        for (let t = tier; t >= 1; t--) {
            if (SETUPS_BY_TIER[t]?.length > 0) {
                return SETUPS_BY_TIER[t][setupsAttempted % SETUPS_BY_TIER[t].length];
            }
        }
        return null;
    }

    return pool[setupsAttempted % pool.length];
}

/**
 * Compute setup score with streak + run-state bonuses applied on top of
 * the base goldReward.
 *
 * @param {object} setup
 * @param {object} runState
 * @returns {{ gold: number, tickets: number, streakBonusApplied: boolean, milestone?: { atStreak, tickets } }}
 */
export function scoreCompletedSetup(setup, { currentStreak }) {
    const base = setup.goldReward;
    let streakBonus = 0;
    if (currentStreak >= 20) streakBonus = 60;
    else if (currentStreak >= 10) streakBonus = 30;
    else if (currentStreak >= 5)  streakBonus = 15;
    else if (currentStreak >= 3)  streakBonus = 5;

    let milestone = null;
    if (currentStreak === 5)  milestone = { atStreak: 5,  tickets: 5 };
    else if (currentStreak === 10) milestone = { atStreak: 10, tickets: 15 };
    else if (currentStreak === 20) milestone = { atStreak: 20, tickets: 50 };

    return {
        gold: base + streakBonus,
        tickets: milestone?.tickets || 0,
        streakBonusApplied: streakBonus > 0,
        milestone
    };
}

/**
 * Perfect-run bonus — applied at run-end if perfectRun === true.
 * @returns {{ gold: 50, tickets: 25 }}
 */
export function perfectRunBonus() {
    return { gold: 50, tickets: 25 };
}

export const MARATHON_CATALOGUE_STATS = Object.freeze({
    totalSetups: ALL_SETUPS.length,
    perTier: {
        1: TIER_1_SETUPS.length,
        2: TIER_2_SETUPS.length,
        3: TIER_3_SETUPS.length,
        4: TIER_4_SETUPS.length
    }
});

export default {
    getSetupById,
    getSetupsByTier,
    listSetupIds,
    pickNextSetup,
    scoreCompletedSetup,
    perfectRunBonus,
    MARATHON_CATALOGUE_STATS
};
