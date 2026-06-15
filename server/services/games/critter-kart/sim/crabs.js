/**
 * Server-authoritative crab hazard — the train pattern (deterministic from the
 * anchored race clock). Each crab sits at a fixed track progress and scuttles
 * side-to-side across the road; contact spins a kart out (applyHit). Because it's
 * a pure function of race-elapsed time, every client renders the crabs where the
 * server has them, and the server owns the spin-out (sent via the snapshot stun).
 *
 * Shared maths with the client (game/logic/crabs.ts) — keep byte-identical.
 */
export const CRAB_RADIUS = 5;

/** Signed perpendicular offset (world units) of a crab from the centre-line. */
export function crabOffsetAt(elapsed, def) {
    return def.lane * Math.sin(2 * Math.PI * (elapsed / def.period + def.phase));
}

/** Circle hit test: kart (kx,kz) within `radius` of a crab at (cx,cz). */
export function crabHit(kx, kz, cx, cz, radius) {
    const dx = kx - cx, dz = kz - cz;
    return dx * dx + dz * dz < radius * radius;
}

/** World positions of every crab at a race time (same perp convention as the
 *  client: tangent → px=tz, pz=-tx, across the road). */
export function crabPositions(track, crabDefs, elapsedSec) {
    const out = [];
    for (const def of crabDefs) {
        const a = track.pointAtProgress(def.progress);
        const b = track.pointAtProgress((def.progress + 0.003) % 1);
        let tx = b.x - a.x, tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const px = tz, pz = -tx;
        const off = crabOffsetAt(elapsedSec, def);
        out.push({ x: a.x + px * off, z: a.z + pz * off });
    }
    return out;
}
