import {
    MIN_POWER_M_S, MAX_POWER_M_S,
    MIN_AZIMUTH_RAD, MAX_AZIMUTH_RAD,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
    MAX_SPIN_RAD_S,
} from './constants.js';

/**
 * Free-Kick Madness — gesture extractor (v0.1)
 *
 * Pure function that turns a swipe path (array of {x, y, t}) into
 * the derived shot inputs that simulateShot() consumes:
 *   { power, azimuth, elevation, spin }
 *
 * Lives server-side because the server must be able to verify the
 * client's derived inputs by re-running the extractor on the
 * gestureSamples payload. Same function will be imported client-side
 * for live trail / preview — guarantees client and server agree on
 * what a given gesture means.
 *
 * COORDINATE CONVENTION
 *   Input samples are in screen pixels with y INCREASING DOWNWARD
 *   (standard browser / Phaser convention). The extractor flips y
 *   internally so "swipe upward" maps to positive elevation.
 *
 * MAPPING (each calibration constant marked PLAYTEST):
 *
 *   POWER       = path length of the swipe, normalised against
 *                 REFERENCE_PATH_LENGTH_PX, then baseline+linear
 *                 to [MIN_POWER_M_S, MAX_POWER_M_S].
 *
 *   AZIMUTH     = atan2(dx, max(dy, 1)) — the angle of the swipe's
 *                 end-vs-start vector from "straight up" — then
 *                 scaled by LATERAL_AIM_SENSITIVITY (~0.65) for
 *                 forgiveness, then clamped to the valid range.
 *                 +ve = player's right.
 *
 *   ELEVATION   = upward component of start→end vector, mapped via
 *                 REFERENCE_VERTICAL_SWIPE_PX → REFERENCE_VERTICAL
 *                 _ELEVATION_RAD then linearly extrapolated and
 *                 clamped.
 *
 *   SPIN        = signed perpendicular deviation of the path's
 *                 MIDPOINT from the chord (start→end), expressed
 *                 in pixels and scaled by SPIN_SENSITIVITY_RAD_S
 *                 _PER_PX.
 *                 +ve = right curl (banana shot bending right).
 *                 -ve = left curl.
 *                 Sign uses cross-product of (chord, mid-from-start):
 *                   cross = chordDx*midDy − chordDy*midDx
 *                 with y kept in SCREEN coords (downward +). A
 *                 right-bowing swipe to an upward chord yields a
 *                 POSITIVE cross.
 *
 * Pure — same input always produces the same output. Returns
 * { invalid: true, reason } on bad input rather than throwing, so
 * the server can log the gesture and not crash on malformed payloads.
 *
 * Calibration is exposed via the exported constants so client-side
 * preview can stay in sync.
 */

// ============================================================
// === Calibration constants (PLAYTEST tunables) ===
// ============================================================

// A swipe of this many pixels = full power (mapped to MAX_POWER_M_S).
// Phaser's FIT scale mode amplifies physical swipes into large virtual-
// pixel paths on a phone (an 800x1200 virtual canvas on a ~400x600
// device-px screen means every physical pixel maps to ~2 virtual px).
// 1000 px ≈ 83% of the 1200 virtual canvas height — requires a long
// deliberate swipe to hit full power.
// Tuned during v0.2 playtest.
export const REFERENCE_PATH_LENGTH_PX = 1000;

// A purely-upward swipe of this length (in screen pixels) maps to
// REFERENCE_VERTICAL_ELEVATION_RAD elevation. Linearly extrapolated
// beyond + clamped.
// Tuned during v0.2 playtest — was 200 px, sending the ball over the
// crossbar on every small swipe.
export const REFERENCE_VERTICAL_SWIPE_PX = 400;
export const REFERENCE_VERTICAL_ELEVATION_RAD = 0.25;  // ~14.3°

// Lateral aim sensitivity — same value the playbook (§6.3) settled on
// for basketball after playtest. Treats raw swipe lateral angle and
// damps it for forgiveness.
export const LATERAL_AIM_SENSITIVITY = 0.65;

// Spin sensitivity — converts pixels of midpoint deviation to rad/s
// of side spin. Calibrated so that ~33 px of midpoint deviation gives
// 50 rad/s spin — Beckham-spec (~8 rev/s) at a typical swipe length.
// Tuned during v0.2 playtest — was 0.5, but the curl was barely
// visible at 18m. 3× boost makes the curl mirror the swipe shape.
export const SPIN_SENSITIVITY_RAD_S_PER_PX = 1.5;

// Minimum samples to consider a gesture valid. Path length and
// curvature need at least three points to be meaningful.
export const MIN_GESTURE_SAMPLES = 3;

// Minimum path length to consider a gesture valid. Below this we
// treat it as a tap or accidental graze.
export const MIN_PATH_LENGTH_PX = 30;


// ============================================================
// === Helpers ===
// ============================================================

function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

function isFiniteSample(s) {
    return s
        && typeof s.x === 'number' && Number.isFinite(s.x)
        && typeof s.y === 'number' && Number.isFinite(s.y)
        && typeof s.t === 'number' && Number.isFinite(s.t);
}


// ============================================================
// === Public API ===
// ============================================================

/**
 * Extract derived shot inputs from a gesture path.
 *
 * @param {Array<{x:number, y:number, t:number}>} samples
 * @returns {
 *   { power, azimuth, elevation, spin, pathLengthPx, signedCurlPx }
 *   | { invalid: true, reason: string }
 * }
 */
export function extractInputs(samples) {
    if (!Array.isArray(samples)) return { invalid: true, reason: 'samples_not_array' };
    if (samples.length < MIN_GESTURE_SAMPLES) {
        return { invalid: true, reason: 'too_few_samples' };
    }
    for (let i = 0; i < samples.length; i++) {
        if (!isFiniteSample(samples[i])) {
            return { invalid: true, reason: `sample_${i}_invalid` };
        }
    }

    // 1. Path length — sum of segment distances.
    let pathLengthPx = 0;
    for (let i = 1; i < samples.length; i++) {
        pathLengthPx += Math.hypot(
            samples[i].x - samples[i - 1].x,
            samples[i].y - samples[i - 1].y,
        );
    }
    if (pathLengthPx < MIN_PATH_LENGTH_PX) {
        return { invalid: true, reason: 'gesture_too_short' };
    }

    // 2. Start → end vector. Screen y is DOWN, so flip for "up = +y world".
    const start = samples[0];
    const end = samples[samples.length - 1];
    const dxScreen = end.x - start.x;       // right is +
    const dyScreenDown = end.y - start.y;   // screen y, down is +
    const dyUp = -dyScreenDown;              // flipped: up is +

    // 3. POWER — path length normalised, baseline+linear to m/s.
    const pathNorm = clamp(pathLengthPx / REFERENCE_PATH_LENGTH_PX, 0, 1);
    const power = MIN_POWER_M_S + pathNorm * (MAX_POWER_M_S - MIN_POWER_M_S);

    // 4. AZIMUTH — angle of the (dx, dyUp) vector from "straight up",
    // dampened.
    // For a purely upward swipe: dxScreen=0, dyUp>0 → atan2 = 0 → azimuth=0.
    // For an upward-right swipe: dxScreen>0, dyUp>0 → positive azimuth.
    // Guard against dyUp<=0 (sideways or downward swipe) — clamp to a
    // tiny positive value so atan2 doesn't flip sign weirdly.
    const dyUpSafe = Math.max(dyUp, 1);
    const rawSwipeAngle = Math.atan2(dxScreen, dyUpSafe);
    const azimuth = clamp(
        LATERAL_AIM_SENSITIVITY * rawSwipeAngle,
        MIN_AZIMUTH_RAD,
        MAX_AZIMUTH_RAD,
    );

    // 5. ELEVATION — verticality of swipe.
    const rawElevation = (dyUp / REFERENCE_VERTICAL_SWIPE_PX)
                       * REFERENCE_VERTICAL_ELEVATION_RAD;
    const elevation = clamp(rawElevation, MIN_ELEVATION_RAD, MAX_ELEVATION_RAD);

    // 6. SPIN — signed perpendicular deviation of midpoint from chord.
    // Use the actual midpoint of the path (sample at index ⌊n/2⌋).
    // y kept in SCREEN coords for the cross product; the sign
    // convention below has been verified by example (right-bowing
    // upward swipe → positive spin → ball curves right).
    const mid = samples[Math.floor(samples.length / 2)];
    const chordDx = end.x - start.x;
    const chordDy = end.y - start.y;  // screen y
    const chordLen = Math.hypot(chordDx, chordDy);
    let signedCurlPx = 0;
    if (chordLen > 1e-6) {
        const midDx = mid.x - start.x;
        const midDy = mid.y - start.y;  // screen y
        // Cross product (2D) — gives signed area of the triangle.
        // For an UPWARD chord (chordDy < 0 in screen coords) and a
        // RIGHT-bowing mid (midDx > 0), the result is POSITIVE.
        const cross = chordDx * midDy - chordDy * midDx;
        signedCurlPx = cross / chordLen;
    }
    const rawSpin = signedCurlPx * SPIN_SENSITIVITY_RAD_S_PER_PX;
    const spin = clamp(rawSpin, -MAX_SPIN_RAD_S, MAX_SPIN_RAD_S);

    return {
        power, azimuth, elevation, spin,
        pathLengthPx, signedCurlPx,
    };
}
