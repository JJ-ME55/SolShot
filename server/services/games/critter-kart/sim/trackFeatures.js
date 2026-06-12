/**
 * Server-side track furniture — Phase 1 of the sim-parity plan
 * (The-Arcade docs/CRITTER_KART_SIM_PARITY_PLAN.md).
 *
 * Byte-faithful ports of the client's:
 *   - game/logic/barrier.ts          (buildBarriers / resolveBarriers + constants)
 *   - GameCanvas extra walls         (upper-deck outer wall, flat-bridge right rail)
 *   - GameCanvas jumpZone block      (ramp ride → launch → fly → land/water respawn)
 *   - render/proceduralBridge.ts     (archHeightAt — arched bridge Y)
 *   - GameCanvas upperDeckZone block (side-commit, deck Y profile, boost strip)
 *   - render/boostPads.ts            (seeded deterministic pad layout + padContains)
 *
 * ONE documented approximation: the client's ramp height profile is baked from the
 * Ramp-jump GLB (30 raycast samples). The server can't load GLBs, so it uses a LINEAR
 * rise to RAMP_HEIGHT_WORLD with the peak at the ramp end (the GLB's peak is at/near the
 * end — wedge shape). x/z trajectories are identical (slope doesn't affect stepKart's
 * planar motion); only mid-ramp y differs slightly, and launch height/velocity match.
 */

import { KART_RADIUS } from './collision.js';

// ── Barriers (port of game/logic/barrier.ts) ───────────────────────────────

export const BARRIER_SCALE = 22;
export const BARRIER_LEN = 0.25 * BARRIER_SCALE;                 // 5.5
export const BARRIER_HALF_DEPTH = (0.123 * BARRIER_SCALE) / 2;   // ~1.35
export const BARRIER_OFFSET = 32;
export const BARRIER_SPACING = BARRIER_LEN;

export function buildBarriers(track, offset = BARRIER_OFFSET, spacing = BARRIER_SPACING) {
    const out = [];
    const total = track.totalLength;
    const hw = track.halfWidth;
    const minClear = hw + KART_RADIUS + BARRIER_HALF_DEPTH;
    const jz = track.jumpZone;
    for (let d = 0; d < total; d += spacing) {
        const progress = d / total;
        if (jz && progress >= jz.startProgress && progress <= jz.endProgress) continue;
        const a = track.pointAtProgress(progress);
        const b = track.pointAtProgress((d + 1) / total);
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        const px = tz;
        const pz = -tx;
        for (const side of [1, -1]) {
            const x = a.x + px * side * offset;
            const z = a.z + pz * side * offset;
            if (track.nearest(x, z).distance < minClear) continue;
            out.push({ x, z, tx, tz });
        }
    }
    return out;
}

/** GameCanvas extras: upper-deck OUTER wall + flat-bridge RIGHT rail (same maths). */
export function buildExtraWalls(track) {
    const barriers = [];
    if (track.upperDeckZone) {
        const ud = track.upperDeckZone;
        const STEP = 5;
        const wallEnd = ud.rampDownStart;
        const segs = Math.max(2, Math.round(((wallEnd - ud.startProgress) * track.totalLength) / STEP));
        for (let s = 0; s <= segs; s++) {
            const p = ud.startProgress + (s / segs) * (wallEnd - ud.startProgress);
            const a = track.pointAtProgress(p);
            const b = track.pointAtProgress(Math.min(1, p + 0.002));
            let tx = b.x - a.x, tz = b.z - a.z;
            const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
            const nx = tz, nz = -tx;
            barriers.push({ x: a.x + nx * ud.side * track.halfWidth, z: a.z + nz * ud.side * track.halfWidth, tx, tz });
        }
    }
    const BRIDGE_EDGE = track.halfWidth + 3.5;
    if (track.bridgeZone) {
        const bz = track.bridgeZone;
        const segs = Math.max(2, Math.round(((bz.endProgress - bz.startProgress) * track.totalLength) / 5));
        for (let s = 0; s <= segs; s++) {
            const p = bz.startProgress + (s / segs) * (bz.endProgress - bz.startProgress);
            const a = track.pointAtProgress(p);
            const b = track.pointAtProgress(Math.min(1, p + 0.002));
            let tx = b.x - a.x, tz = b.z - a.z;
            const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
            const nx = tz, nz = -tx;
            barriers.push({ x: a.x + nx * BRIDGE_EDGE, z: a.z + nz * BRIDGE_EDGE, tx, tz });
        }
    }
    return barriers;
}

export function resolveBarriers(s, barriers, kartRadius, t) {
    const reach = kartRadius + BARRIER_HALF_DEPTH;
    const half = BARRIER_LEN / 2;
    const far = (reach + half + 2) ** 2;
    let nx = 0, nz = 0, depth = 0;
    let found = false;
    for (const bar of barriers) {
        const dx = s.x - bar.x;
        const dz = s.z - bar.z;
        if (dx * dx + dz * dz > far) continue;
        const along = Math.max(-half, Math.min(half, dx * bar.tx + dz * bar.tz));
        const cx = bar.x + bar.tx * along;
        const cz = bar.z + bar.tz * along;
        const ox = s.x - cx;
        const oz = s.z - cz;
        const dist = Math.hypot(ox, oz) || 1e-6;
        if (dist < reach) {
            const pen = reach - dist;
            if (pen > depth) {
                depth = pen;
                nx = ox / dist;
                nz = oz / dist;
                found = true;
            }
        }
    }
    if (!found) return null;
    const x = s.x + nx * depth;
    const z = s.z + nz * depth;
    let vx = Math.sin(s.velHeading) * s.speed;
    let vz = Math.cos(s.velHeading) * s.speed;
    const vn = vx * nx + vz * nz;
    if (vn < 0) {
        const tanx = vx - vn * nx;
        const tanz = vz - vn * nz;
        vx = tanx * t.barrierGlanceKeep - nx * vn * t.barrierRestitution;
        vz = tanz * t.barrierGlanceKeep - nz * vn * t.barrierRestitution;
    }
    const speed = Math.hypot(vx, vz);
    const velHeading = speed > 1e-4 ? Math.atan2(vx, vz) : s.velHeading;
    return { x, z, velHeading, speed };
}

// ── Arched bridge (port of proceduralBridge.archHeightAt) ──────────────────

export const ARCH_PEAK = 9;
export function archHeightAt(t) {
    const c = Math.max(0, Math.min(1, t));
    return ARCH_PEAK * 4 * c * (1 - c);
}

// ── Ramp profile (linear approximation of the GLB bake — see header) ───────

const RAMP_LEN_WORLD = 30;
const RAMP_HEIGHT_WORLD = 5;

export function buildRampProfile(track) {
    const jz = track.jumpZone;
    if (!jz) return { rampStartProgress: 0, rampEndProgress: 0, rampPeakProgress: 0, rampSurfaceY: () => null };
    const rampLenProgress = RAMP_LEN_WORLD / track.totalLength;
    const rampEndProgress = jz.startProgress;
    const rampStartProgress = jz.startProgress - rampLenProgress;
    return {
        rampStartProgress,
        rampEndProgress,
        // Peak slightly BEFORE the end (like the GLB bake, whose max sample sits
        // ~1 sample shy of the edge). With peak == end the launch branch
        // (p >= peak while still ON the ramp) never fires — the kart steps off
        // the edge un-launched and drops straight into the water.
        rampPeakProgress: rampStartProgress + 0.95 * (rampEndProgress - rampStartProgress),
        rampSurfaceY(progress) {
            if (progress < rampStartProgress || progress > rampEndProgress) return null;
            const t = (progress - rampStartProgress) / (rampEndProgress - rampStartProgress || 1);
            return RAMP_HEIGHT_WORLD * t;
        },
    };
}

// ── Boost pads (logic port of render/boostPads.ts — seeded, deterministic) ─

export function buildBoostPadsLogic(track, numKarts, seed = 1, count = 3) {
    const pads = [];
    const PAD_LEN = 9;
    const PAD_WIDTH = 7;
    const half = PAD_WIDTH / 2;
    const jz = track.jumpZone;
    const positions = [];
    let s = (seed * 0.6180339887) % 1;
    while (positions.length < count) {
        s = (s + 0.6180339887) % 1;
        if (jz && s >= jz.startProgress - 0.04 && s <= jz.endProgress + 0.04) continue;
        positions.push(s);
    }
    for (const p of positions) {
        const a = track.pointAtProgress(p);
        const b = track.pointAtProgress((p + 0.005) % 1);
        let tx = b.x - a.x;
        let tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        pads.push({ x: a.x, z: a.z, halfLen: PAD_LEN / 2, halfWidth: half, tx, tz, triggered: new Array(numKarts).fill(false) });
    }
    return pads;
}

export function padContains(pad, x, z) {
    const dx = x - pad.x;
    const dz = z - pad.z;
    const along = dx * pad.tx + dz * pad.tz;
    const across = dx * pad.tz - dz * pad.tx;
    return Math.abs(along) <= pad.halfLen && Math.abs(across) <= pad.halfWidth;
}

// ── Per-tick zone application (GameCanvas substep blocks, same order) ───────

export const UPPER_DECK_INNER = 5;
export const WATER_Y = 0;

/**
 * Apply boost pads + arch bridge + upper deck + jump/water zones to one kart.
 * Mutation-free: returns the (possibly replaced) state. `ctx` is the per-runner
 * feature context built by createFeatureContext(); `slot` indexes per-kart flags.
 * `elapsedSec` drives the respawn timer (client uses race `elapsed`).
 */
/** Boost pads alone — the only zone effect RAIL bots consume (stepRailBots,
 *  the final word, overwrites their position/Y; scanning walls/ramp for them
 *  was pure waste on the 60Hz tick). */
export function applyBoostPads(state, slot, ctx, tuning) {
    let s = state;
    for (const pad of ctx.boostPads) {
        const inside = padContains(pad, s.x, s.z);
        if (inside && !pad.triggered[slot]) {
            s = { ...s, boostTimer: Math.max(s.boostTimer ?? 0, tuning.turboBoost * 1.6) };
            pad.triggered[slot] = true;
        } else if (!inside && pad.triggered[slot]) {
            pad.triggered[slot] = false;
        }
    }
    return s;
}

export function applyZones(state, slot, track, ctx, tuning, elapsedSec) {
    let s = state;

    // Boost pads (client GameCanvas ~877)
    s = applyBoostPads(s, slot, ctx, tuning);

    // ONE nearest scan — x/z don't change between the zone blocks below
    // (arch/deck mutate only y/vy/falling; the respawn returns immediately).
    const zoneProgress = track.nearest(s.x, s.z).progress;

    // Arched bridge Y pin (client ~891)
    if (track.archBridgeZone) {
        const az = track.archBridgeZone;
        const p = zoneProgress;
        if (p >= az.startProgress && p <= az.endProgress) {
            const t = (p - az.startProgress) / (az.endProgress - az.startProgress || 1);
            s = { ...s, y: archHeightAt(t), vy: 0, falling: false };
        }
    }

    // Upper deck (client ~905)
    if (track.upperDeckZone) {
        const ud = track.upperDeckZone;
        const deckH = (p) => {
            if (p < ud.rampUpEnd) return ud.height * (p - ud.startProgress) / (ud.rampUpEnd - ud.startProgress);
            if (p > ud.rampDownStart) return ud.height * (ud.endProgress - p) / (ud.endProgress - ud.rampDownStart);
            return ud.height;
        };
        const p = zoneProgress;
        if (p < ud.startProgress || p > ud.endProgress) {
            ctx.onUpperDeck[slot] = false;
        } else {
            const a = track.pointAtProgress(p);
            const b = track.pointAtProgress(Math.min(1, p + 0.002));
            let tx = b.x - a.x, tz = b.z - a.z;
            const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
            const lat = (s.x - a.x) * tz + (s.z - a.z) * -tx;
            if (!ctx.onUpperDeck[slot] && p < ud.rampUpEnd && Math.sign(lat) === ud.side && Math.abs(lat) >= UPPER_DECK_INNER && Math.abs(lat) <= track.halfWidth) { // outer bound: grass beyond the channel never lifts
                ctx.onUpperDeck[slot] = true;
            }
            if (ctx.onUpperDeck[slot]) {
                if ((Math.abs(lat) < UPPER_DECK_INNER - 0.5 || Math.abs(lat) > track.halfWidth + 1) && p < ud.rampDownStart) {
                    ctx.onUpperDeck[slot] = false;
                    s = { ...s, falling: true, vy: -1 };
                } else {
                    s = { ...s, y: deckH(p), vy: 0, falling: false };
                    if (p >= ud.boostStart && p <= ud.boostEnd) {
                        s = { ...s, boostTimer: Math.max(s.boostTimer ?? 0, tuning.turboBoost * 1.4) };
                    }
                }
            }
        }
    }

    // Ramp + water hole (client ~948). lastSafe respawn point + 3-phase jump.
    if (track.jumpZone) {
        const sp = track.jumpZone.startProgress;
        const ep = track.jumpZone.endProgress;
        const SAFE_BUFFER = 0.015;
        const p = zoneProgress;
        const inZone = p >= sp && p <= ep;
        const safelyOutside = p < sp - SAFE_BUFFER || p > ep + SAFE_BUFFER;
        const grounded = (s.y ?? 0) === 0 && (s.vy ?? 0) === 0 && !s.falling;

        if (grounded && safelyOutside) {
            ctx.lastSafe[slot] = { x: s.x, z: s.z, heading: s.heading, speed: s.speed };
        }

        const rampY = ctx.ramp.rampSurfaceY(p);
        const onRamp = rampY !== null && !s.respawnAt;
        if (onRamp && !s.falling) {
            if (p >= ctx.ramp.rampPeakProgress) {
                return { ...s, y: rampY, vy: tuning.jumpLaunch, falling: true };
            }
            return { ...s, y: rampY, vy: 0, falling: false };
        }

        if (inZone && !s.falling && (s.y ?? 0) === 0) {
            return { ...s, falling: true, vy: -2 };
        }

        if (s.falling && !inZone && p > ep && (s.y ?? 0) <= 0 && !s.respawnAt) {
            return { ...s, y: 0, vy: 0, falling: false };
        }

        if (s.falling && inZone && (s.y ?? 0) <= WATER_Y && !s.respawnAt) {
            return { ...s, respawnAt: elapsedSec + 0.45 };
        }

        if (s.respawnAt !== undefined && elapsedSec >= s.respawnAt && ctx.lastSafe[slot]) {
            const safe = ctx.lastSafe[slot];
            return {
                ...s,
                x: safe.x, z: safe.z,
                heading: safe.heading, velHeading: safe.heading,
                speed: safe.speed * tuning.respawnSpeedKeep,
                y: 0, vy: 0, falling: false, respawnAt: undefined,
            };
        }
    }

    return s;
}

/**
 * CLIENT-MATCHING start grid — byte port of GameCanvas's grid (two staggered
 * rows of three; lat −7/0/+7 across the road, fwd 6/0 from the line). The
 * server previously used its own 3-rows-of-2 layout, so every kart began
 * several units from where each client rendered it — a seed divergence that
 * compounded into "balloons don't pop / we're not racing each other".
 */
export function clientStartGrid(track, n) {
    const pose = track.startPose();
    const fx = Math.sin(pose.heading);
    const fz = Math.cos(pose.heading);
    const ppx = Math.cos(pose.heading);
    const ppz = -Math.sin(pose.heading);
    // REAL-RACE formation (Fish 2026-06-12): two columns, three rows, right
    // column staggered half a row back, all behind the line. MUST equal the
    // client grid in GameCanvas.tsx exactly or karts diverge from frame one.
    const layout = [
        { lat: -5, fwd: 0 },   { lat: 5, fwd: -3.5 },
        { lat: -5, fwd: -7 },  { lat: 5, fwd: -10.5 },
        { lat: -5, fwd: -14 }, { lat: 5, fwd: -17.5 },
    ];
    const grid = [];
    for (let i = 0; i < n; i++) {
        const { lat, fwd } = layout[i % layout.length];
        grid.push({
            x: pose.x + fx * fwd + ppx * lat,
            z: pose.z + fz * fwd + ppz * lat,
            heading: pose.heading,
        });
    }
    return grid;
}

/** Build the per-race feature context the runner holds. */
export function createFeatureContext(track, numKarts) {
    return {
        barriers: [...buildBarriers(track), ...buildExtraWalls(track)],
        boostPads: buildBoostPadsLogic(track, numKarts, 1, 3),
        ramp: buildRampProfile(track),
        onUpperDeck: new Array(numKarts).fill(false),
        lastSafe: new Array(numKarts).fill(null),
    };
}
