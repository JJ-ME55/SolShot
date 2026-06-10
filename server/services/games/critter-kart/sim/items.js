/**
 * Server-side mirror of Fish's item system. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/items.ts
 *
 * Critter Kart items are forest-themed (not Mario Kart shells):
 *   TURBO  — Turbo Berry      (speed boost)
 *   ACORN  — Acorn Cannon     (forward projectile)
 *   BEE    — Homing Bee       (homes on target)
 *   MUD    — Mud Puddle       (slow trap, drop behind)
 *   SHIELD — Leaf Shield      (blocks one hit)
 *   STORM  — Storm Cloud      (slows leader, back-half catch-up nuke)
 *
 * Distribution is position-weighted — leaders get weak items, back-
 * markers get strong/catch-up ones. Categories let players semi-choose
 * lane (ATTACK / SPEED / DEFENSE) but the exact roll is RNG-driven.
 */

export const ITEM = { TURBO: 0, ACORN: 1, BEE: 2, MUD: 3, SHIELD: 4, STORM: 5 };
export const NO_ITEM = -1;
export const ITEM_NAMES = ['Turbo Berry', 'Acorn Cannon', 'Homing Bee', 'Mud Puddle', 'Leaf Shield', 'Storm Cloud'];
export const ITEM_COLORS = [0xff4136, 0xff851b, 0xffdc00, 0x8a5a2b, 0x2ecc40, 0x0074d9];
export const CATEGORY = { ATTACK: 0, SPEED: 1, DEFENSE: 2 };

/**
 * Roll an item WITHIN a chosen category. Pure: same (category, position,
 * numKarts, r) ALWAYS returns the same item. `position` is 1-based; `r`
 * is the RNG roll 0..1.
 */
export function rollCategoryItem(category, position, numKarts, r) {
    if (category === CATEGORY.SPEED) return ITEM.TURBO;
    if (category === CATEGORY.DEFENSE) return ITEM.SHIELD;
    // ATTACK — weighted by position over [ACORN, BEE, MUD, STORM]
    const frac = numKarts > 1 ? (position - 1) / (numKarts - 1) : 0;
    const items = [ITEM.ACORN, ITEM.BEE, ITEM.MUD, ITEM.STORM];
    const w = [
        0.42 - 0.14 * frac,
        0.18 + 0.20 * frac,
        0.34 - 0.16 * frac,
        frac > 0.4 ? 0.34 * (frac - 0.4) / 0.6 : 0,
    ];
    const total = w.reduce((a, b) => a + b, 0);
    const pick = r * total;
    let acc = 0;
    for (let i = 0; i < w.length; i++) {
        acc += w[i];
        if (pick < acc) return items[i];
    }
    return ITEM.ACORN;
}

/** Legacy full-table roll. */
export function rollItem(position, numKarts, r) {
    const frac = numKarts > 1 ? (position - 1) / (numKarts - 1) : 0;
    const w = [
        0.08 + 0.42 * frac,
        0.28 - 0.10 * frac,
        0.06 + 0.24 * frac,
        0.30 - 0.22 * frac,
        0.18 - 0.04 * frac,
        frac > 0.5 ? 0.22 * (frac - 0.5) * 2 : 0,
    ];
    const total = w.reduce((a, b) => a + b, 0);
    const pick = r * total;
    let acc = 0;
    for (let i = 0; i < w.length; i++) {
        acc += w[i];
        if (pick < acc) return i;
    }
    return ITEM.ACORN;
}

/**
 * Item-box layout — byte-identical to the client (GameCanvas.tsx
 * ITEM_BOX_ROWS / ITEM_BOX_LAT / LANE_CATEGORY). Boxes sit at fixed
 * progress rows × three lateral lanes, so the server can compute the
 * EXACT same set of boxes the client renders, with no scene dependency.
 * Lane categories: left = ATTACK, centre = SPEED, right = DEFENSE.
 */
export const ITEM_BOX_ROWS = [0.12, 0.3, 0.48, 0.66, 0.84];
export const ITEM_BOX_LAT = [-8, 0, 8];
export const LANE_CATEGORY = [CATEGORY.ATTACK, CATEGORY.SPEED, CATEGORY.DEFENSE];

/**
 * Compute the deterministic item-box layout for a track. Mirrors the
 * client's `pointAndPerp(prog)` placement exactly.
 * @param {object} track  a TrackPath (needs pointAtProgress)
 * @returns {Array<{id:number,x:number,z:number,category:number}>}
 */
export function computeItemBoxes(track) {
    const boxes = [];
    let id = 0;
    for (const prog of ITEM_BOX_ROWS) {
        const a = track.pointAtProgress(prog);
        const b = track.pointAtProgress(prog + 0.01);
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        const px = tz / l;
        const pz = -tx / l;
        for (let lane = 0; lane < ITEM_BOX_LAT.length; lane++) {
            const lat = ITEM_BOX_LAT[lane];
            boxes.push({
                id: id++,
                x: a.x + px * lat,
                z: a.z + pz * lat,
                category: LANE_CATEGORY[lane],
            });
        }
    }
    return boxes;
}

/**
 * Apply a spin-out hit. Shield blocks it, i-frames ignore it, else spin out.
 * @param {object} s    KartState
 * @param {object} t    TUNING
 * @returns {object}    new KartState
 */
export function applyHit(s, t) {
    if ((s.invulnTimer ?? 0) > 0) return s;
    if (s.shield) return { ...s, shield: false, invulnTimer: t.hitInvuln };
    return {
        ...s,
        stunTimer: t.spinTime,
        stunHeading: s.velHeading,
        invulnTimer: t.spinTime + t.hitInvuln,
        speed: s.speed * t.hitSpeedKeep,
    };
}
