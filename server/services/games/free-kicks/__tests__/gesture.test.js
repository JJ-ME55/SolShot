import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractInputs,
    REFERENCE_PATH_LENGTH_PX,
    REFERENCE_VERTICAL_SWIPE_PX,
    REFERENCE_VERTICAL_ELEVATION_RAD,
    LATERAL_AIM_SENSITIVITY,
    SPIN_SENSITIVITY_RAD_S_PER_PX,
    MIN_GESTURE_SAMPLES,
    MIN_PATH_LENGTH_PX,
} from '../gesture.js';
import { simulateShot } from '../physics.js';
import {
    MIN_POWER_M_S, MAX_POWER_M_S,
    MIN_AZIMUTH_RAD, MAX_AZIMUTH_RAD,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
} from '../constants.js';


// ============================================================
// === Helpers — synthesise gesture paths in screen coords ===
// (screen y increases DOWNWARD; bottom of screen is y=600)
// ============================================================

// Default to ODD sample count so contactIdx = floor(n/2) lands exactly
// on the path midpoint — makes pre/post split symmetric and tests
// against the reference calibration values cleanly.
function straightSwipe({ fromX, fromY, toX, toY, samples = 11, startT = 0, dt = 16 }) {
    const out = [];
    for (let i = 0; i < samples; i++) {
        const u = i / (samples - 1);
        out.push({
            x: fromX + u * (toX - fromX),
            y: fromY + u * (toY - fromY),
            t: startT + i * dt,
        });
    }
    return out;
}

// A bowed path: arcs out perpendicular to chord by `bowPx` at the midpoint.
// Positive bowPx in our convention => bows TOWARD player's right in screen coords.
// (Kept for the simulateShot integration test — the OVERALL bow does still
// produce a curling shot via the pre-contact direction biasing slightly
// off-line + the post-contact continuing to bend.)
function bowedSwipe({ fromX, fromY, toX, toY, bowPx, samples = 11 }) {
    const out = [];
    for (let i = 0; i < samples; i++) {
        const u = i / (samples - 1);
        const bowAmt = 4 * u * (1 - u);
        out.push({
            x: fromX + u * (toX - fromX) + bowAmt * bowPx,
            y: fromY + u * (toY - fromY),
            t: i * 16,
        });
    }
    return out;
}

// "Hook" swipe — straight from start to mid, then hooks off to `hookEnd`.
// This is the canonical Flick Kick gesture: straight-then-hook. The tail
// of the swipe encodes the curl. Positive `hookOffsetPx` = right hook.
function hookSwipe({ fromX, fromY, midX, midY, hookOffsetPx, samplesPerHalf = 6 }) {
    const out = [];
    // First half: straight from (fromX, fromY) to (midX, midY)
    for (let i = 0; i < samplesPerHalf; i++) {
        const u = i / (samplesPerHalf - 1);
        out.push({
            x: fromX + u * (midX - fromX),
            y: fromY + u * (midY - fromY),
            t: i * 16,
        });
    }
    // Second half: extends in the same direction as the pre-segment but
    // offset laterally by hookOffsetPx. Compute the unit perpendicular
    // to (midX-fromX, midY-fromY), in screen coords.
    const preDx = midX - fromX;
    const preDy = midY - fromY;
    const preLen = Math.hypot(preDx, preDy);
    // Perp (right-of-direction in screen coords): rotating 90° CW from
    // (preDx, preDy) gives (-preDy, preDx). With y increasing DOWNWARD,
    // for an upward swipe (preDy < 0) this gives positive x — i.e. the
    // PLAYER's right. So +hookOffsetPx along this perp = right hook.
    const perpX = -preDy / preLen;
    const perpY = preDx / preLen;
    // Tail endpoint: continue forward by half a pre-length AND offset by hookOffsetPx
    const tailEndX = midX + (preDx / preLen) * preLen * 0.5 + perpX * hookOffsetPx;
    const tailEndY = midY + (preDy / preLen) * preLen * 0.5 + perpY * hookOffsetPx;
    for (let i = 1; i < samplesPerHalf; i++) {
        const u = i / (samplesPerHalf - 1);
        out.push({
            x: midX + u * (tailEndX - midX),
            y: midY + u * (tailEndY - midY),
            t: (samplesPerHalf + i - 1) * 16,
        });
    }
    return out;
}


// ============================================================
// === Input validation ===
// ============================================================

test('extractInputs: non-array → invalid', () => {
    assert.equal(extractInputs(null).invalid, true);
    assert.equal(extractInputs('foo').invalid, true);
    assert.equal(extractInputs({ length: 5 }).invalid, true);
});

test('extractInputs: too few samples → invalid', () => {
    const out = extractInputs([{ x: 0, y: 0, t: 0 }]);
    assert.equal(out.invalid, true);
    assert.equal(out.reason, 'too_few_samples');
});

test('extractInputs: NaN sample → invalid', () => {
    const out = extractInputs([
        { x: 0, y: 600, t: 0 },
        { x: NaN, y: 500, t: 16 },
        { x: 0, y: 400, t: 32 },
    ]);
    assert.equal(out.invalid, true);
});

test('extractInputs: gesture too short → invalid', () => {
    // 10 samples all near each other → path length < threshold
    const samples = [];
    for (let i = 0; i < 10; i++) samples.push({ x: i, y: 600 - i * 0.5, t: i * 16 });
    const out = extractInputs(samples);
    assert.equal(out.invalid, true);
    assert.equal(out.reason, 'gesture_too_short');
});


// ============================================================
// === Power mapping ===
// ============================================================

test('extractInputs: power scales with path length', () => {
    const short = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 400 });   // 200px
    const long = straightSwipe({ fromX: 0, fromY: 1000, toX: 0, toY: 0 });     // 1000px
    const a = extractInputs(short);
    const b = extractInputs(long);
    assert.ok(b.power > a.power, `long swipe power=${b.power} should be > short swipe power=${a.power}`);
});

test('extractInputs: maximum-length swipe maps to MAX_POWER', () => {
    // 1200px swipe (longer than REFERENCE_PATH_LENGTH_PX=1000) clamps to MAX.
    const samples = straightSwipe({ fromX: 0, fromY: 1200, toX: 0, toY: 0 });
    const out = extractInputs(samples);
    assert.equal(out.power, MAX_POWER_M_S);
});

test('extractInputs: minimum-length swipe maps to MIN_POWER', () => {
    // ~MIN_PATH_LENGTH_PX swipe (just above the validity threshold) maps near MIN_POWER.
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 600 - MIN_PATH_LENGTH_PX - 1 });
    const out = extractInputs(samples);
    // Path length / REFERENCE = small number → power near MIN.
    assert.ok(out.power < MIN_POWER_M_S + 2,
        `min-length swipe power=${out.power}, expected near ${MIN_POWER_M_S}`);
});


// ============================================================
// === Azimuth ===
// ============================================================

test('extractInputs: straight upward swipe → azimuth = 0', () => {
    const samples = straightSwipe({ fromX: 100, fromY: 600, toX: 100, toY: 200 });
    const out = extractInputs(samples);
    assert.ok(Math.abs(out.azimuth) < 1e-9, `azimuth=${out.azimuth}, expected 0`);
});

test('extractInputs: upward-right swipe → positive azimuth', () => {
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 150, toY: 200 });
    const out = extractInputs(samples);
    assert.ok(out.azimuth > 0, `azimuth=${out.azimuth}, expected > 0`);
});

test('extractInputs: upward-left swipe → negative azimuth', () => {
    const samples = straightSwipe({ fromX: 200, fromY: 600, toX: 50, toY: 200 });
    const out = extractInputs(samples);
    assert.ok(out.azimuth < 0, `azimuth=${out.azimuth}, expected < 0`);
});

test('extractInputs: azimuth clamps to MIN/MAX', () => {
    // A swipe nearly all-horizontal: dx >> dy.
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 600, toY: 590 });
    const out = extractInputs(samples);
    assert.ok(out.azimuth <= MAX_AZIMUTH_RAD, `azimuth=${out.azimuth}, must clamp`);
});


// ============================================================
// === Elevation ===
// ============================================================

test('extractInputs: vertical reference swipe → reference elevation', () => {
    // v1.0: REFERENCE_VERTICAL_SWIPE_PX dropped 400 → 200 for raw
    // Three.js canvas. Pre-contact chord must equal 200 px → total
    // upward swipe = 400 px (with odd sample count, contact = mid).
    const samples = straightSwipe({ fromX: 0, fromY: 400, toX: 0, toY: 0 });
    const out = extractInputs(samples);
    assert.ok(
        Math.abs(out.elevation - REFERENCE_VERTICAL_ELEVATION_RAD) < 0.01,
        `elevation=${out.elevation}, expected near ${REFERENCE_VERTICAL_ELEVATION_RAD}`,
    );
});

test('extractInputs: longer upward swipe → higher elevation', () => {
    const short = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 500 });   // 100px up
    const long = straightSwipe({ fromX: 0, fromY: 800, toX: 0, toY: 200 });    // 600px up
    assert.ok(extractInputs(long).elevation > extractInputs(short).elevation);
});

test('extractInputs: elevation clamps to MAX', () => {
    // v0.3: elevation reads from PRE-CONTACT chord. To exceed
    // MAX_ELEVATION_RAD (π/4 ≈ 0.785) at 0.25 rad per 400px, need
    // pre-chord > 1257px upward. 3000px total swipe → 1500px pre-chord
    // → raw elevation 0.94 rad → clamps.
    const samples = straightSwipe({ fromX: 0, fromY: 3000, toX: 0, toY: 0 });
    const out = extractInputs(samples);
    assert.equal(out.elevation, MAX_ELEVATION_RAD);
});

test('extractInputs: backwards swipe (downward) → elevation clamps to MIN', () => {
    // v0.3: with pre-contact elevation, need a big enough downward
    // swipe that the pre-chord (~half) goes below MIN_ELEVATION_RAD.
    const samples = straightSwipe({ fromX: 0, fromY: 0, toX: 0, toY: 800 });
    const out = extractInputs(samples);
    assert.equal(out.elevation, MIN_ELEVATION_RAD);
});


// ============================================================
// === Spin / curl ===
// ============================================================

test('extractInputs: straight swipe → zero spin', () => {
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200 });
    const out = extractInputs(samples);
    assert.ok(Math.abs(out.spin) < 1e-6, `spin=${out.spin}, expected 0`);
});

test('extractInputs: hook-right tail → positive spin (right curl)', () => {
    // Straight up, then hook right at the end (the canonical Flick Kick gesture).
    const samples = hookSwipe({ fromX: 0, fromY: 700, midX: 0, midY: 350, hookOffsetPx: 80 });
    const out = extractInputs(samples);
    assert.ok(out.spin > 0, `right-hook swipe spin=${out.spin}, expected > 0`);
});

test('extractInputs: hook-left tail → negative spin (left curl)', () => {
    const samples = hookSwipe({ fromX: 0, fromY: 700, midX: 0, midY: 350, hookOffsetPx: -80 });
    const out = extractInputs(samples);
    assert.ok(out.spin < 0, `left-hook swipe spin=${out.spin}, expected < 0`);
});

test('extractInputs: tighter hook → larger |spin|', () => {
    const mild = hookSwipe({ fromX: 0, fromY: 700, midX: 0, midY: 350, hookOffsetPx: 30 });
    const tight = hookSwipe({ fromX: 0, fromY: 700, midX: 0, midY: 350, hookOffsetPx: 110 });
    const a = extractInputs(mild);
    const b = extractInputs(tight);
    assert.ok(Math.abs(b.spin) > Math.abs(a.spin),
        `tight |spin|=${Math.abs(b.spin)} should exceed mild |spin|=${Math.abs(a.spin)}`);
});

test('extractInputs: smooth banana arc → also produces curl (not zero)', () => {
    // A smooth parabolic bow has a non-trivial pre-direction bias AND
    // continues to bend post-contact. Net curl should be non-zero.
    // (Direction may be skewed because the pre-contact half of the
    // bow itself angles off-axis — that's the trade-off of choosing
    // a banana over a straight-then-hook.)
    const samples = bowedSwipe({ fromX: 0, fromY: 700, toX: 0, toY: 100, bowPx: 100 });
    const out = extractInputs(samples);
    assert.ok(Math.abs(out.spin) > 0.5,
        `banana arc should produce some curl, got spin=${out.spin}`);
});


// ============================================================
// === Integration with simulateShot ===
// ============================================================

test('extractInputs + simulateShot: a hook-tail gesture results in a curled trajectory', () => {
    // v0.3: use the canonical Flick Kick "straight up + hook tail" gesture.
    // Pre-contact: straight upward 350px (gives ~22 m/s power, ~12° elev,
    // 0 azimuth). Post-contact: hook right 80px (gives right curl).
    const gesture = hookSwipe({
        fromX: 0, fromY: 800, midX: 0, midY: 450,
        hookOffsetPx: 80,
    });
    const derived = extractInputs(gesture);

    assert.ok(derived.power > MIN_POWER_M_S && derived.power <= MAX_POWER_M_S);
    assert.ok(Math.abs(derived.azimuth) < 0.01,
        `straight pre-chord should give ~0 azimuth, got ${derived.azimuth}`);
    assert.ok(derived.spin > 0, `right-hook tail should produce positive spin, got ${derived.spin}`);

    const scenario = { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null };
    const curled = simulateShot({ shotInput: derived, scenario });
    const straight = simulateShot({
        shotInput: { ...derived, spin: 0 },
        scenario,
    });

    if (curled.crossing && straight.crossing) {
        assert.ok(curled.crossing.x > straight.crossing.x,
            `curled x=${curled.crossing.x.toFixed(3)} should exceed straight x=${straight.crossing.x.toFixed(3)}`);
    } else {
        assert.ok(curled.crossing || straight.crossing,
            'at least one shot should reach the goal plane');
    }
});


// ============================================================
// === Determinism + purity ===
// ============================================================

test('extractInputs: deterministic — same samples produce identical output', () => {
    const samples = bowedSwipe({ fromX: 10, fromY: 600, toX: 50, toY: 100, bowPx: 30 });
    const a = extractInputs(samples);
    const b = extractInputs(samples);
    assert.deepEqual(a, b);
});

test('extractInputs: does not mutate input array', () => {
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 100, toY: 200 });
    const snapshot = JSON.parse(JSON.stringify(samples));
    extractInputs(samples);
    assert.deepEqual(samples, snapshot);
});


// ============================================================
// === Calibration constants exposed ===
// ============================================================

test('calibration constants are accessible for client-side preview', () => {
    assert.ok(typeof REFERENCE_PATH_LENGTH_PX === 'number');
    assert.ok(typeof REFERENCE_VERTICAL_SWIPE_PX === 'number');
    assert.ok(typeof REFERENCE_VERTICAL_ELEVATION_RAD === 'number');
    assert.ok(typeof LATERAL_AIM_SENSITIVITY === 'number');
    assert.ok(typeof SPIN_SENSITIVITY_RAD_S_PER_PX === 'number');
    assert.ok(typeof MIN_GESTURE_SAMPLES === 'number');
    assert.ok(typeof MIN_PATH_LENGTH_PX === 'number');
});
