/**
 * Server-side RAIL BOTS — Phase 3 of the sim-parity plan. Byte-faithful port of
 * the client's "RAIL BOTS" block (GameCanvas ~1027): bots advance kinematically
 * along the racing line — glued to the track, never stuck, never out-dragged —
 * with an eased rubber-band, per-bot jockeying, train-wait, and the arch/jump
 * Y arcs. Replaces the weak physics-steering botInput() for bots entirely.
 *
 * MP adaptation (the one deliberate change, flagged in the plan): the client
 * pins bot pace to THE player; with multiple humans the server pins to the
 * LEADING human (same catchup constants — tune by playtest, never invent).
 */

import { TUNING } from './tuning.js';
import { archHeightAt, UPPER_DECK_INNER } from './trackFeatures.js';


// Per-bot rail personas (client BOT_PERSONAS — catchup is what the rail uses).
export const RAIL_CATCHUP = [1.7, 1.9, 2.3, 2.0, 2.3];
// Distinct racing lines so bots don't stack (client BOT_LINES).
export const BOT_LINES = [-4, 1, 6, 10, 13];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RAMP_TOP_Y = 5; // matches trackFeatures RAMP_HEIGHT_WORLD (jump-arc apex)

/** Per-race rail state. Bots are identified by kart index; humans get null slots. */
export function createRailState(track, karts, grid) {
    const n = karts.length;
    const st = {
        prog: new Array(n).fill(0),    // continuous progress (laps + fraction)
        lat: new Array(n).fill(0),     // lateral racing-line offset
        speed: new Array(n).fill(0),
        active: new Array(n).fill(false),
    };
    let botOrdinal = 0;
    for (let i = 0; i < n; i++) {
        if (!karts[i].isBot) continue;
        st.active[i] = true;
        // Seed from the grid slot; just-behind-the-line reads as negative progress
        // (client: `if (np > 0.5) np -= 1`) so it's BEHIND, not a lap ahead.
        let np = track.nearest(karts[i].state.x, karts[i].state.z).progress;
        if (np > 0.5) np -= 1;
        st.prog[i] = np;
        st.lat[i] = BOT_LINES[botOrdinal % BOT_LINES.length];
        st.speed[i] = 0;
        karts[i].railCatchup = RAIL_CATCHUP[botOrdinal % RAIL_CATCHUP.length];
        botOrdinal++;
    }
    return st;
}

/** Activate the rail for a kart mid-race (AI takeover after a disconnect). */
export function seedRailKart(st, track, karts, i) {
    st.active[i] = true;
    st.prog[i] = (karts[i].lap?.lap ?? 0) + track.nearest(karts[i].state.x, karts[i].state.z).progress;
    st.lat[i] = BOT_LINES[i % BOT_LINES.length];
    st.speed[i] = Math.max(0, karts[i].state.speed);
    if (karts[i].railCatchup == null) karts[i].railCatchup = RAIL_CATCHUP[i % RAIL_CATCHUP.length];
}

/** Deactivate (player reconnected and took back control). */
export function releaseRailKart(st, i) {
    st.active[i] = false;
}

/**
 * Advance every active rail kart one fixed step. Runs LAST in the tick (the
 * final word on bot state, like the client). `elapsedSec` is the anchored race
 * clock (drives jockeying + the train-wait check).
 */
export function stepRailBots({ karts, st, track, trainPieces, dt, elapsedSec }) {
    // Reference = the MIDPOINT of the humans (was: the leading human, which
    // pinned the bot-train to the leader's pace — a human knocked back early
    // could never catch up: JJ 2026-06-12). Midpoint keeps bots raceable for
    // the trailing human while still pressuring the leader.
    let ref = null, refCont = -Infinity;
    const humanConts = []; let humanSpeedSum = 0;
    for (const k of karts) {
        if (k.isBot || k.finished) continue;
        const cont = (k.lap?.lap ?? 0) + track.nearest(k.state.x, k.state.z).progress;
        humanConts.push(cont); humanSpeedSum += Math.max(0, k.state.speed);
        if (cont > refCont) { refCont = cont; ref = k; }
    }
    if (humanConts.length > 0) {
        refCont = humanConts.reduce((a, b) => a + b, 0) / humanConts.length;
    }
    if (!ref) {
        for (const k of karts) {
            if (k.finished) continue;
            const cont = (k.lap?.lap ?? 0) + track.nearest(k.state.x, k.state.z).progress;
            if (cont > refCont) { refCont = cont; ref = k; }
        }
    }
    if (!ref) return;
    const refSpeed = humanConts.length > 0 ? humanSpeedSum / humanConts.length : Math.max(0, ref.state.speed);
    const FLOOR = TUNING.maxSpeed * 0.72;

    trainPieces = trainPieces || [];
    // crossings hoisted into the rail state (2 linear track walks per tick saved)
    if (!st.crossings) {
        st.crossings = [
            [0.395, track.pointAtProgress(0.395)],
            [0.769, track.pointAtProgress(0.769)],
        ];
    }
    const crossings = st.crossings;

    for (let i = 0; i < karts.length; i++) {
        if (!st.active[i]) continue;
        const kart = karts[i];
        if (kart.finished) { continue; }
        const catchup = kart.railCatchup ?? 2.0;
        const s = kart.state;
        const pNow = ((st.prog[i] % 1) + 1) % 1;
        const behind = refCont - st.prog[i];
        const gap = behind - 0.03; // dead-zone: small leads are left alone
        const rel = gap > 0
            ? clamp(1 + gap * catchup, 1.0, 1.3)
            : clamp(1 + behind * catchup * 0.5, 0.78, 1.0);
        const osc = 1 + 0.14 * Math.sin(elapsedSec * 0.55 + i * 1.9);
        let target = Math.max(refSpeed, FLOOR) * rel * osc;
        if ((s.stunTimer ?? 0) > 0) target *= 0.25;
        if ((s.boostTimer ?? 0) > 0) target = Math.max(target, TUNING.maxSpeed * 1.25);
        // wait for a train sitting on a crossing just ahead
        for (const [cp, cpt] of crossings) {
            if (((cp - pNow) % 1 + 1) % 1 >= 0.05) continue;
            for (const m of trainPieces) {
                if (Math.hypot(m.x - cpt.x, m.z - cpt.z) < 12) target = 0;
            }
        }
        const dv = target - st.speed[i];
        st.speed[i] += Math.max(-90 * dt, Math.min(TUNING.accel * dt, dv));
        st.prog[i] += (st.speed[i] * dt) / track.totalLength;
        const pp = ((st.prog[i] % 1) + 1) % 1;
        const c0 = track.pointAtProgress(pp);
        const cN = track.pointAtProgress((pp + 0.004) % 1);
        let tx = cN.x - c0.x, tz = cN.z - c0.z;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const heading = Math.atan2(tx, tz);
        // Lateral line + Y. Bots RIDE the raised features (skywalk / upper-deck shortcut / arch /
        // jump) so they go OVER them instead of clipping through (matches the client rail bots).
        let lat = st.lat[i];
        let y = 0;
        const az = track.archBridgeZone;
        const ud = track.upperDeckZone;
        const sw = track.skywalk;
        const swUp = sw ? sw.jumpProgress - 0.007 : 0;
        if (sw && Math.abs(st.lat[i]) < track.halfWidth * 0.55 && pp >= swUp && pp <= sw.endProgress) {
            y = pp < sw.startProgress ? sw.height * Math.max(0, pp - swUp) / (sw.startProgress - swUp || 1) : sw.height;
        } else if (ud && pp >= ud.startProgress && pp <= ud.endProgress) {
            lat = ud.side * (UPPER_DECK_INNER + track.halfWidthAt(pp)) / 2;
            y = pp < ud.rampUpEnd ? ud.height * (pp - ud.startProgress) / (ud.rampUpEnd - ud.startProgress || 1)
                : pp > ud.rampDownStart ? ud.height * (ud.endProgress - pp) / (ud.endProgress - ud.rampDownStart || 1)
                : ud.height;
        } else if (az && pp >= az.startProgress && pp <= az.endProgress) {
            y = archHeightAt((pp - az.startProgress) / (az.endProgress - az.startProgress || 1));
        } else if (track.jumpZone) {
            const rs = track.jumpZone.startProgress - 30 / track.totalLength; // ramp start (RAMP_LEN_WORLD)
            const re = track.jumpZone.endProgress;
            if (pp >= rs && pp <= re) y = RAMP_TOP_Y * Math.sin(Math.PI * ((pp - rs) / ((re - rs) || 1)));
        }
        const x = c0.x + tz * lat;
        const z = c0.z - tx * lat;
        kart.state = {
            ...s, x, z, y, heading, velHeading: heading, speed: st.speed[i],
            boostTimer: Math.max(0, (s.boostTimer ?? 0) - dt),
            driftDir: 0, driftCharge: 0, recoverTimer: 0, vy: 0, falling: false, respawnAt: undefined,
            stunTimer: Math.max(0, (s.stunTimer ?? 0) - dt),
            invulnTimer: Math.max(0, (s.invulnTimer ?? 0) - dt),
            slowTimer: Math.max(0, (s.slowTimer ?? 0) - dt),
        };
    }
}
