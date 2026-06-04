/**
 * Server-side mirror of Fish's steering smoothing. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/steering.ts (25 lines)
 *
 * Smooths digital input toward a target instead of snapping. Used by the
 * server to apply received input deltas without producing jagged kart
 * trajectories. (Client does the same locally, deterministically.)
 */

export function rampSteer(current, target, rampRate, returnRate, dt) {
    const towardCenter =
        Math.abs(target) < Math.abs(current) ||
        (current !== 0 && Math.sign(target) !== Math.sign(current));
    const rate = towardCenter ? returnRate : rampRate;
    return moveTowards(current, target, rate * dt);
}

function moveTowards(a, b, maxDelta) {
    const d = b - a;
    if (Math.abs(d) <= maxDelta) return b;
    return a + Math.sign(d) * maxDelta;
}
