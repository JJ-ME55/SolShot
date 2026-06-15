/**
 * Server-authoritative rolling tide — a scheduled flood of one beach stretch
 * (deterministic from the anchored race clock, like the train/crabs). While the
 * water is high, a kart caught on the sea side of the flooded band eats a heavy
 * slow + (at peak) a spin-out. The server owns the effect (slowTimer/stun via
 * the snapshot); the client renders the water sheet from the broadcast level.
 *
 * Shared maths with the client (game/logic/tide.ts) — keep byte-identical.
 */

/** Water level 0..1: out (0) at t=0, peak (1) at half-period. Smooth cosine. */
export function tideLevel(elapsed, cfg) {
    return (1 - Math.cos((2 * Math.PI * elapsed) / cfg.period)) / 2;
}

/** True when the kart at (x,z,y) is in the flooded water this instant. Same
 *  geometry the client uses: in the beach band, not raised, and on the sea side
 *  of the advancing edge (reachW * (1 - 2*level)). */
export function tideFloods(track, cfg, level, x, z, y) {
    const pp = track.nearest(x, z).progress;
    if (pp < cfg.beachStart || pp > cfg.beachEnd) return false;
    if ((y ?? 0) >= 3) return false; // on a raised ledge → above the water
    const a = track.pointAtProgress(pp);
    const b = track.pointAtProgress(Math.min(1, pp + 0.002));
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const side = cfg.side ?? 1;
    const klatS = ((x - a.x) * tz + (z - a.z) * -tx) * side; // signed distance toward the sea side
    const reachW = track.halfWidthAt(pp) + 50;               // matches REACH_PAST in proceduralTide
    return klatS > reachW * (1 - 2 * level);
}
