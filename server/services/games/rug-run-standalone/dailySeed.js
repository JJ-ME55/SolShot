/**
 * RUG RUN — canonical deterministic daily seed.
 *
 * This is the SERVER-SIDE mirror of the client engine's seed logic
 * (The-Arcade/src/games/rug-run/game.js + public/Rug Run/rug-run.html).
 * Client and server MUST derive rugs the SAME way so a submitted score can be
 * validated server-side and can't be faked.
 *
 * The chart + the three daily attempts are fully determined by the UTC date
 * string ('YYYY-MM-DD'). The rug for an attempt is the FIRST draw of that
 * attempt's seeded RNG (FNV-1a hash → mulberry32 → Box-Muller gaussian), so
 * reproducing it server-side requires nothing but the date and attempt index.
 *
 * Verification targets (2-dp):
 *   dailyRugs('2026-06-17') ≈ [43,    5.11,  5]
 *   dailyRugs('2026-06-18') ≈ [6.13,  22.6,  19.28]
 *   dailyRugs('2026-06-19') ≈ [15.73, 5,     21.45]
 */

function xfnv1a(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const MU = 2.833;
const SIGMA = 0.90;

const DAY_TYPES = [
    { name: 'RUGFEST', p: 0.12, muBias: -0.55 },
    { name: 'BULL RUN', p: 0.10, muBias: 0.50 },
    { name: 'HIGH VOLATILITY', p: 0.15, muBias: 0 },
    { name: 'CHOP CITY', p: 0.15, muBias: 0 },
    { name: 'NEUTRAL', p: 0.48, muBias: 0 },
];

export function dayTypeForDate(ds) {
    const r = mulberry32(xfnv1a(ds + ':daytype'))();
    let a = 0;
    for (const d of DAY_TYPES) {
        a += d.p;
        if (r <= a) return d;
    }
    return DAY_TYPES[DAY_TYPES.length - 1];
}

function rugFor(ds, i) {
    const rng = mulberry32(xfnv1a(ds + ':' + i));
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(280, Math.max(5, Math.exp(MU + dayTypeForDate(ds).muBias + SIGMA * g)));
}

/** The three daily attempt rugs (attempt 1..3) for the given UTC date string. */
export function dailyRugs(ds) {
    return [1, 2, 3].map((i) => rugFor(ds, i));
}
