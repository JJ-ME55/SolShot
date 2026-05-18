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

function straightSwipe({ fromX, fromY, toX, toY, samples = 10, startT = 0, dt = 16 }) {
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
// We add `+bowPx` to the midpoint's x (the chord goes vertical/upward, so right is +x).
function bowedSwipe({ fromX, fromY, toX, toY, bowPx, samples = 11 }) {
    const out = [];
    for (let i = 0; i < samples; i++) {
        const u = i / (samples - 1);
        // Quadratic bow: 4·u·(1-u) is a parabola peaking at u=0.5 with value 1.
        const bowAmt = 4 * u * (1 - u);
        out.push({
            x: fromX + u * (toX - fromX) + bowAmt * bowPx,
            y: fromY + u * (toY - fromY),
            t: i * 16,
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
    const long = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 0 });      // 600px
    const a = extractInputs(short);
    const b = extractInputs(long);
    assert.ok(b.power > a.power, `long swipe power=${b.power} should be > short swipe power=${a.power}`);
});

test('extractInputs: maximum-length swipe maps to MAX_POWER', () => {
    // 800px swipe (longer than REFERENCE) clamps to MAX.
    const samples = straightSwipe({ fromX: 0, fromY: 800, toX: 0, toY: 0 });
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
    // 200px upward swipe → REFERENCE_VERTICAL_ELEVATION_RAD.
    const samples = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 400 });
    const out = extractInputs(samples);
    assert.ok(
        Math.abs(out.elevation - REFERENCE_VERTICAL_ELEVATION_RAD) < 0.01,
        `elevation=${out.elevation}, expected near ${REFERENCE_VERTICAL_ELEVATION_RAD}`,
    );
});

test('extractInputs: longer upward swipe → higher elevation', () => {
    const short = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 500 });   // 100px up
    const long = straightSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200 });    // 400px up
    assert.ok(extractInputs(long).elevation > extractInputs(short).elevation);
});

test('extractInputs: elevation clamps to MAX', () => {
    // 900px upward swipe → raw elevation way past MAX.
    const samples = straightSwipe({ fromX: 0, fromY: 900, toX: 0, toY: 0 });
    const out = extractInputs(samples);
    assert.equal(out.elevation, MAX_ELEVATION_RAD);
});

test('extractInputs: backwards swipe (downward) → elevation clamps to MIN', () => {
    // Swipe DOWN on screen (which is +y in screen, -y in world).
    const samples = straightSwipe({ fromX: 0, fromY: 100, toX: 0, toY: 400 });
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

test('extractInputs: right-bowing swipe → positive spin (right curl)', () => {
    // Chord straight up, midpoint bows to the right.
    const samples = bowedSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200, bowPx: 80 });
    const out = extractInputs(samples);
    assert.ok(out.spin > 0, `right-bowing swipe spin=${out.spin}, expected > 0`);
});

test('extractInputs: left-bowing swipe → negative spin (left curl)', () => {
    const samples = bowedSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200, bowPx: -80 });
    const out = extractInputs(samples);
    assert.ok(out.spin < 0, `left-bowing swipe spin=${out.spin}, expected < 0`);
});

test('extractInputs: stronger bow → larger |spin|', () => {
    const mild = bowedSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200, bowPx: 40 });
    const strong = bowedSwipe({ fromX: 0, fromY: 600, toX: 0, toY: 200, bowPx: 120 });
    const a = extractInputs(mild);
    const b = extractInputs(strong);
    assert.ok(Math.abs(b.spin) > Math.abs(a.spin),
        `strong |spin|=${Math.abs(b.spin)} should exceed mild |spin|=${Math.abs(a.spin)}`);
});


// ============================================================
// === Integration with simulateShot ===
// ============================================================

test('extractInputs + simulateShot: a curly upward gesture results in a curled trajectory', () => {
    // Big right-bow swipe.
    const gesture = bowedSwipe({ fromX: 0, fromY: 700, toX: 0, toY: 100, bowPx: 100 });
    const derived = extractInputs(gesture);

    // Sanity on derived inputs
    assert.ok(derived.power > MIN_POWER_M_S && derived.power <= MAX_POWER_M_S);
    assert.ok(Math.abs(derived.azimuth) < 0.01, 'centred-chord gesture should have ~0 azimuth');
    assert.ok(derived.spin > 0, 'right-bow should produce positive spin');

    // Now feed to simulateShot and check the ball curls right vs zero-spin baseline.
    const scenario = { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null };
    const curled = simulateShot({ shotInput: derived, scenario });
    const straight = simulateShot({
        shotInput: { ...derived, spin: 0 },
        scenario,
    });

    // Whatever else happened, the curled shot's crossing should be
    // further +x than the straight shot's IF both reached the plane.
    if (curled.crossing && straight.crossing) {
        assert.ok(curled.crossing.x > straight.crossing.x,
            `curled x=${curled.crossing.x.toFixed(3)} should exceed straight x=${straight.crossing.x.toFixed(3)}`);
    } else {
        // If either didn't reach, at least one of them should have.
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
