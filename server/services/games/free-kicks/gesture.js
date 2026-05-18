import {
    MIN_POWER_M_S, MAX_POWER_M_S,
    MIN_AZIMUTH_RAD, MAX_AZIMUTH_RAD,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
    MAX_SPIN_RAD_S,
} from './constants.js';

/**
 * Free-Kick Madness — gesture extractor (v0.3 — tail-of-swipe model)
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
 * GESTURE MODEL (v0.3 — copied from Flick Kick Football)
 *
 *   PikPok's developer guide: "The curve is affected by the angle
 *   of the curve AFTER you've made contact with the ball... you
 *   need to increase tightness of your swipe AFTER making contact."
 *
 *   We approximate "the contact point" as the MIDDLE sample of the
 *   gesture. Everything before that = THE KICK (direction + power).
 *   Everything after that = THE CURL (curl magnitude + direction).
 *
 *   This lets the player:
 *     - swipe straight up + hook right at the tail → driven shot
 *       with late curl (the iconic Flick Kick "tight hook" feel)
 *     - swipe in a smooth banana arc → the pre-contact direction
 *       already aims slightly off-line + the late tail continues
 *       the bend → curling shot in the same direction
 *     - swipe straight all the way → no curl
 *
 * COORDINATE CONVENTION
 *   Input samples are in screen pixels with y INCREASING DOWNWARD
 *   (standard browser / Phaser convention). The extractor flips y
 *   internally so "swipe upward" maps to positive elevation.
 *
 * MAPPING (each calibration constant marked PLAYTEST):
 *
 *   POWER       = TOTAL path length of the swipe (full gesture),
 *                 normalised against REFERENCE_PATH_LENGTH_PX,
 *                 then baseline+linear to [MIN_POWER_M_S,
 *                 MAX_POWER_M_S]. Confirmed by PikPok: "longer
 *                 the flick, the higher the ball travels."
 *
 *   AZIMUTH     = lateral angle of the PRE-CONTACT chord
 *                 (samples[0] → samples[contactIdx]), atan2-from-
 *                 straight-up, scaled by LATERAL_AIM_SENSITIVITY.
 *                 +ve = player's right.
 *
 *   ELEVATION   = upward component of the PRE-CONTACT chord,
 *                 calibrated via REFERENCE_VERTICAL_SWIPE_PX →
 *                 REFERENCE_VERTICAL_ELEVATION_RAD, clamped.
 *
 *   SPIN        = signed perpendicular deviation of the POST-CONTACT
 *                 endpoint relative to the PRE-CONTACT chord
 *                 direction, in pixels, scaled by
 *                 SPIN_SENSITIVITY_RAD_S_PER_PX.
 *                 +ve = right curl. -ve = left curl.
 *                 Sign uses 2D cross:
 *                   preDx = preEnd.x − preStart.x  (screen)
 *                   preDy = preEnd.y − preStart.y  (screen, down +)
 *                   postDx = postEnd.x − preEnd.x
 *                   postDy = postEnd.y − preEnd.y
 *                   cross = preDx·postDy − preDy·postDx
 *                 A pre-chord going UP (preDy < 0) with the post-
 *                 tail hooking RIGHT (postDx > 0) yields a POSITIVE
 *                 cross.
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

// Spin sensitivity — converts pixels of post-contact lateral
// deviation to rad/s of side spin.
// Tuning history:
//   v0.1: 0.5 — curl was barely visible at 18m
//   v0.2: 1.5 — 3× boost, with whole-swipe-midpoint model
//   v0.3: 0.75 — switched to TAIL-OF-SWIPE model; tail deviations
//                are typically larger than midpoint-of-chord
//                deviations, so the sensitivity comes back down.
//                Calibrated so a 70 px hook → ~50 rad/s (Beckham
//                spec), a 140 px sharp hook → 100 rad/s (Roberto
//                Carlos extreme, hits MAX_SPIN_RAD_S clamp).
//                PikPok's own reviewers complain the ball "curves
//                too dramatically" — that's the target arcadey
//                feel, not subtle Magnus.
export const SPIN_SENSITIVITY_RAD_S_PER_PX = 0.75;

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
 * v0.3: tail-of-swipe curl model. The gesture is split into a
 * PRE-CONTACT half (the "kick" — direction + elevation) and a
 * POST-CONTACT half (the "curl" — lateral deviation of the tail).
 *
 * @param {Array<{x:number, y:number, t:number}>} samples
 * @returns {
 *   {
 *     power, azimuth, elevation, spin,
 *     pathLengthPx, signedCurlPx, contactIdx,
 *   }
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

    // 1. Total path length — sum of segment distances.
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

    // 2. Split the gesture at the "contact" point. We approximate
    //    the ball-contact moment as the middle sample of the swipe.
    //    Clamped to leave at least 1 segment in each half.
    const contactIdx = clampInt(Math.floor(samples.length / 2), 1, samples.length - 2);

    const preStart = samples[0];
    const preEnd = samples[contactIdx];
    const postEnd = samples[samples.length - 1];

    // 3. PRE-CONTACT chord — the "kick". Screen y is DOWN; flip for
    //    "up = +y world" semantics on elevation/azimuth.
    const preDxScreen = preEnd.x - preStart.x;       // right is +
    const preDyScreenDown = preEnd.y - preStart.y;   // screen y, down is +
    const preDyUp = -preDyScreenDown;                 // flipped: up is +

    // 4. POWER — total path length (full gesture) normalised,
    //    baseline+linear to m/s.
    const pathNorm = clamp(pathLengthPx / REFERENCE_PATH_LENGTH_PX, 0, 1);
    const power = MIN_POWER_M_S + pathNorm * (MAX_POWER_M_S - MIN_POWER_M_S);

    // 5. AZIMUTH — angle of the PRE-CONTACT chord from "straight up",
    //    dampened by LATERAL_AIM_SENSITIVITY.
    const preDyUpSafe = Math.max(preDyUp, 1);
    const rawSwipeAngle = Math.atan2(preDxScreen, preDyUpSafe);
    const azimuth = clamp(
        LATERAL_AIM_SENSITIVITY * rawSwipeAngle,
        MIN_AZIMUTH_RAD,
        MAX_AZIMUTH_RAD,
    );

    // 6. ELEVATION — upward component of the PRE-CONTACT chord.
    const rawElevation = (preDyUp / REFERENCE_VERTICAL_SWIPE_PX)
                       * REFERENCE_VERTICAL_ELEVATION_RAD;
    const elevation = clamp(rawElevation, MIN_ELEVATION_RAD, MAX_ELEVATION_RAD);

    // 7. SPIN — signed lateral deviation of the POST-CONTACT segment
    //    (preEnd → postEnd) relative to the PRE-CONTACT chord direction.
    //    2D cross product gives signed area, divided by pre-chord
    //    length to get a pixel-units lateral deviation.
    //    Sign convention: pre-chord pointing UP (preDyScreenDown < 0)
    //    + post-tail hooking RIGHT (postDx > 0) → POSITIVE cross.
    const preLen = Math.hypot(preDxScreen, preDyScreenDown);
    let signedCurlPx = 0;
    if (preLen > 1e-6) {
        const postDx = postEnd.x - preEnd.x;
        const postDy = postEnd.y - preEnd.y;  // screen y
        const cross = preDxScreen * postDy - preDyScreenDown * postDx;
        signedCurlPx = cross / preLen;
    }
    const rawSpin = signedCurlPx * SPIN_SENSITIVITY_RAD_S_PER_PX;
    const spin = clamp(rawSpin, -MAX_SPIN_RAD_S, MAX_SPIN_RAD_S);

    return {
        power, azimuth, elevation, spin,
        pathLengthPx, signedCurlPx, contactIdx,
    };
}

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
