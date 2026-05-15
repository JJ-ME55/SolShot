import {
    ESCALATION_TIERS,
    GOAL_HALF_WIDTH_M, GOAL_HEIGHT_M,
    TARGET_HALF_WIDTH_M, TARGET_HALF_HEIGHT_M,
    HEART_SPAWN_PROBABILITY,
} from './constants.js';

/**
 * Free-Kick Madness — deterministic per-shot scenario generator (v0.1)
 *
 * Given (attemptSeed, shotIndex, goalCount), returns the scenario
 * the player faces on this shot:
 *
 *   {
 *     distanceM, angleRad, wallSize,
 *     plus10Target: { x, y },     // ALWAYS present
 *     heartTarget: { x, y } | null,  // present on ~20% of shots
 *   }
 *
 * The function is pure — same inputs always produce the same scenario.
 * This is the integrity invariant for fair wagered matches: two
 * players with the same attemptSeed see the same scenario sequence.
 *
 * Difficulty escalation comes from ESCALATION_TIERS, gated on
 * goalCount (NOT shotIndex — playbook §7.2 lesson: difficulty
 * triggers on successful play, not attempts).
 */


// ============================================================
// === Seeded RNG — mulberry32 ===
// ============================================================
//
// Tiny, fast, deterministic. Output is a 32-bit unsigned int.
// We seed each shot by mixing attemptSeed + shotIndex via splitmix32
// so consecutive shots have decorrelated RNG streams.

function splitmix32(seed) {
    let z = (seed | 0) + 0x9e3779b9;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
}

function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}

/**
 * Build a deterministic RNG for a given (attemptSeed, shotIndex)
 * pair. Mixes the two through splitmix32 so adjacent shotIndex
 * values produce different streams.
 */
function rngFor(attemptSeed, shotIndex) {
    const mixed = splitmix32((attemptSeed >>> 0) ^ (splitmix32(shotIndex) >>> 0));
    return mulberry32(mixed);
}


// ============================================================
// === Tier resolution ===
// ============================================================

/**
 * Pick the difficulty tier given the current goal count.
 * Returns the tier with the highest minGoals that is <= goalCount.
 */
export function tierForGoals(goalCount) {
    let chosen = ESCALATION_TIERS[0];
    for (const tier of ESCALATION_TIERS) {
        if (goalCount >= tier.minGoals) chosen = tier;
        else break;
    }
    return chosen;
}


// ============================================================
// === Target placement ===
// ============================================================

// Goal frame coordinates: x ∈ [-GOAL_HALF_WIDTH, +GOAL_HALF_WIDTH],
// y ∈ [0, GOAL_HEIGHT_M].
//
// Targets must fit fully inside the frame, so their CENTRE is at
// least TARGET_HALF_WIDTH from the side and TARGET_HALF_HEIGHT from
// the top/bottom.

const MIN_TARGET_X = -GOAL_HALF_WIDTH_M + TARGET_HALF_WIDTH_M;
const MAX_TARGET_X = +GOAL_HALF_WIDTH_M - TARGET_HALF_WIDTH_M;
const MIN_TARGET_Y = TARGET_HALF_HEIGHT_M;
const MAX_TARGET_Y = GOAL_HEIGHT_M - TARGET_HALF_HEIGHT_M;

// Corner zones are the 4 outer quarters of the goal mouth. Each
// corner gets a target-centre region.
const CORNER_REGIONS = [
    // top-left
    { xLo: MIN_TARGET_X,             xHi: -GOAL_HALF_WIDTH_M * 0.25,
      yLo: GOAL_HEIGHT_M * 0.55,     yHi: MAX_TARGET_Y },
    // top-right
    { xLo: +GOAL_HALF_WIDTH_M * 0.25, xHi: MAX_TARGET_X,
      yLo: GOAL_HEIGHT_M * 0.55,     yHi: MAX_TARGET_Y },
    // bottom-left
    { xLo: MIN_TARGET_X,             xHi: -GOAL_HALF_WIDTH_M * 0.25,
      yLo: MIN_TARGET_Y,             yHi: GOAL_HEIGHT_M * 0.45 },
    // bottom-right
    { xLo: +GOAL_HALF_WIDTH_M * 0.25, xHi: MAX_TARGET_X,
      yLo: MIN_TARGET_Y,             yHi: GOAL_HEIGHT_M * 0.45 },
];

const CORNER_BIAS_PROBABILITY = 0.70;

function pickTargetInCorner(rng) {
    const region = CORNER_REGIONS[Math.floor(rng() * CORNER_REGIONS.length)];
    return {
        x: region.xLo + rng() * (region.xHi - region.xLo),
        y: region.yLo + rng() * (region.yHi - region.yLo),
    };
}

function pickTargetAnywhere(rng) {
    return {
        x: MIN_TARGET_X + rng() * (MAX_TARGET_X - MIN_TARGET_X),
        y: MIN_TARGET_Y + rng() * (MAX_TARGET_Y - MIN_TARGET_Y),
    };
}

function pickTarget(rng) {
    if (rng() < CORNER_BIAS_PROBABILITY) return pickTargetInCorner(rng);
    return pickTargetAnywhere(rng);
}

function targetsOverlap(a, b) {
    return Math.abs(a.x - b.x) < 2 * TARGET_HALF_WIDTH_M
        && Math.abs(a.y - b.y) < 2 * TARGET_HALF_HEIGHT_M;
}

// Pick a heart target that doesn't overlap the +10 target. If a few
// attempts fail, place it in the corner furthest from +10 — guarantees
// non-overlap.
function pickHeartNotOverlapping(rng, plus10) {
    for (let i = 0; i < 8; i++) {
        const candidate = pickTarget(rng);
        if (!targetsOverlap(candidate, plus10)) return candidate;
    }
    // Fallback: pick the corner whose centre is furthest from +10.
    let best = null;
    let bestDist = -1;
    for (const region of CORNER_REGIONS) {
        const cx = (region.xLo + region.xHi) / 2;
        const cy = (region.yLo + region.yHi) / 2;
        const d = Math.hypot(cx - plus10.x, cy - plus10.y);
        if (d > bestDist) {
            bestDist = d;
            best = { x: cx, y: cy };
        }
    }
    return best;
}


// ============================================================
// === Public API ===
// ============================================================

/**
 * Generate a deterministic per-shot scenario.
 *
 * @param {object} params
 * @param {number} params.attemptSeed   — drives RNG (per-attempt)
 * @param {number} params.shotIndex     — 0-indexed shot within attempt
 * @param {number} params.goalCount     — goals scored so far this attempt
 * @returns {{
 *   distanceM: number,
 *   angleRad: number,
 *   wallSize: number,
 *   plus10Target: { x: number, y: number },
 *   heartTarget: { x: number, y: number } | null,
 * }}
 */
export function generateScenario({ attemptSeed, shotIndex, goalCount }) {
    if (!Number.isFinite(attemptSeed)) throw new Error('attemptSeed must be a finite number');
    if (!Number.isInteger(shotIndex) || shotIndex < 0) throw new Error('shotIndex must be a non-negative integer');
    if (!Number.isInteger(goalCount) || goalCount < 0) throw new Error('goalCount must be a non-negative integer');

    const rng = rngFor(attemptSeed, shotIndex);
    const tier = tierForGoals(goalCount);

    // Pick angle from the tier's pool.
    const angleDeg = tier.anglePoolDeg[Math.floor(rng() * tier.anglePoolDeg.length)];
    const angleRad = angleDeg * Math.PI / 180;

    // +10 target (always present).
    const plus10Target = pickTarget(rng);

    // Heart target (20% of shots).
    const heartRoll = rng();
    const heartTarget = heartRoll < HEART_SPAWN_PROBABILITY
        ? pickHeartNotOverlapping(rng, plus10Target)
        : null;

    return {
        distanceM: tier.distanceM,
        angleRad,
        wallSize: tier.wallSize,
        plus10Target,
        heartTarget,
    };
}
