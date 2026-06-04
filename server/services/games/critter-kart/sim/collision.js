/**
 * Server-side mirror of Fish's kart/obstacle collisions. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/collision.ts (149 lines)
 *
 * Kart-kart: circle-circle, weight-scaled shove (NOT a spin-out — spin-outs
 * are reserved for item hits). Pure. Returns null when not touching.
 *
 * Obstacles: solid scenery props the kart bumps into.
 */

export const KART_RADIUS = 2;
const RESTITUTION = 0.25;

function toXZ(s) {
    return { vx: Math.sin(s.velHeading) * s.speed, vz: Math.cos(s.velHeading) * s.speed };
}

function toVel(vx, vz, fallbackHeading) {
    const speed = Math.hypot(vx, vz);
    return { speed, velHeading: speed > 1e-4 ? Math.atan2(vx, vz) : fallbackHeading };
}

/** Returns separated/bumped {a,b} states, or null if the karts aren't touching. */
export function resolveKartCollision(a, b, weightA, weightB) {
    const minDist = KART_RADIUS * 2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    let dist = Math.hypot(dx, dz);
    if (dist >= minDist) return null;

    let nx, nz;
    if (dist < 1e-6) {
        nx = 1;
        nz = 0;
        dist = 0;
    } else {
        nx = dx / dist;
        nz = dz / dist;
    }

    const invA = 1 / weightA;
    const invB = 1 / weightB;
    const invSum = invA + invB;

    const overlap = minDist - dist;
    const ax = a.x - nx * overlap * (invA / invSum);
    const az = a.z - nz * overlap * (invA / invSum);
    const bx = b.x + nx * overlap * (invB / invSum);
    const bz = b.z + nz * overlap * (invB / invSum);

    const va = toXZ(a);
    const vb = toXZ(b);
    let aVx = va.vx;
    let aVz = va.vz;
    let bVx = vb.vx;
    let bVz = vb.vz;
    const relN = (vb.vx - va.vx) * nx + (vb.vz - va.vz) * nz;
    if (relN < 0) {
        const j = (-(1 + RESTITUTION) * relN) / invSum;
        aVx -= j * invA * nx;
        aVz -= j * invA * nz;
        bVx += j * invB * nx;
        bVz += j * invB * nz;
    }

    const na = toVel(aVx, aVz, a.velHeading);
    const nb = toVel(bVx, bVz, b.velHeading);
    return {
        a: { x: ax, z: az, speed: na.speed, velHeading: na.velHeading },
        b: { x: bx, z: bz, speed: nb.speed, velHeading: nb.velHeading },
    };
}

/**
 * Resolve the kart (circle of radius `kartRadius`) against solid scenery props.
 * Pushes the kart out of the deepest overlap and bounces using the same
 * glance/restitution feel as the barriers. Returns null if not touching anything.
 */
export function resolveObstacles(s, obstacles, kartRadius, t) {
    let nx = 0, nz = 0, depth = 0;
    let found = false;
    for (const o of obstacles) {
        const reach = kartRadius + o.r;
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const dist = Math.sqrt(d2) || 1e-6;
        const pen = reach - dist;
        if (pen > depth) {
            depth = pen;
            nx = dx / dist;
            nz = dz / dist;
            found = true;
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
