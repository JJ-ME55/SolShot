/**
 * Server-side mirror of Fish's bot AI. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/ai.ts (80 lines)
 *
 * Rule-based: aims at a point ahead on the racing line, brakes for sharp
 * corners. NO DRIFTING — Fish noted rule-based bots can't catch a slide
 * like a human can, so they're prone to wash off into the grass. Instead
 * they slow-in / hold the line / rubber-band their speed cap (catch-up).
 *
 * Outputs a KartInput. Server feeds it into the same stepKart that
 * humans use, so bot karts and human karts share one physics path.
 */

export const DEFAULT_BOT = {
    lookahead: 0.04,
    cornerLook: 0.1,
    steerGain: 3.0,
    speedCap: 1.0,
    cornerSlow: 0.65,
    minCornerFrac: 0.54,
    lineOffset: 0,
};

function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

/**
 * @param {object} s        KartState
 * @param {object} track    TrackPath
 * @param {object} t        TUNING
 * @param {object} p        BotParams
 * @param {object} [seek]   Optional pickup target {x, z} — bot diverts toward it
 * @returns {object}        KartInput
 */
export function botInput(s, track, t, p, seek) {
    const here = track.nearest(s.x, s.z);

    // steer toward a point ahead on THIS bot's line (centreline + its own lateral offset)
    const lookP = here.progress + p.lookahead;
    const c0 = track.pointAtProgress(lookP);
    const c1 = track.pointAtProgress(lookP + 0.012);
    let tx = c1.x - c0.x;
    let tz = c1.z - c0.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const target = { x: c0.x + tz * p.lineOffset, z: c0.z - tx * p.lineOffset };
    const aim = seek ?? target;
    const desired = Math.atan2(aim.x - s.x, aim.z - s.z);
    const steer = Math.max(-1, Math.min(1, angleDiff(s.heading, desired) * p.steerGain));

    // sharpest bend over the next stretch
    const a = track.pointAtProgress(here.progress + p.cornerLook);
    const b = track.pointAtProgress(here.progress + p.cornerLook * 2);
    const corner = Math.abs(angleDiff(Math.atan2(a.x - s.x, a.z - s.z), Math.atan2(b.x - a.x, b.z - a.z)));

    const targetFrac = Math.min(p.speedCap, Math.max(p.minCornerFrac, 1 - corner * p.cornerSlow));
    const targetSpeed = targetFrac * t.maxSpeed;

    let throttle = 1;
    let brake = 0;
    if (s.speed > targetSpeed * 1.03) {
        throttle = 0;
        brake = 1;
    } else if (s.speed > targetSpeed) {
        throttle = 0;
    }

    return { throttle, steer, brake, drift: false, onTrack: here.distance < track.halfWidth };
}

/**
 * Per-bot params for a race. Returns a small array of bot configs with
 * varied lineOffset and speedCap so the AI field doesn't bunch up.
 * Used when matchmaking bot-fills a 2-5 human race up to 6.
 */
export function makeBotFleet(count) {
    // Offsets spread across the road's width (half-width = 18; bots stagger ±6)
    const offsets = [-6, 0, 6, -3, 3, -9];
    const speedCaps = [1.0, 0.98, 0.96, 0.94, 0.92, 0.90];   // slight skill spread
    const fleet = [];
    for (let i = 0; i < count; i++) {
        fleet.push({
            ...DEFAULT_BOT,
            lineOffset: offsets[i % offsets.length],
            speedCap: speedCaps[i % speedCaps.length],
        });
    }
    return fleet;
}
