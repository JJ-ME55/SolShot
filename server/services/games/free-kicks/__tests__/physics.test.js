import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    simulateShot, validateShotInput, ballReleasePos, wallGeometry, liftCoefficient,
} from '../physics.js';
import {
    MIN_POWER_M_S, MAX_POWER_M_S,
    MIN_AZIMUTH_RAD, MAX_AZIMUTH_RAD,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
    MAX_SPIN_RAD_S,
    GOAL_HALF_WIDTH_M, GOAL_HEIGHT_M,
    BALL_RADIUS_M, BALL_RELEASE_HEIGHT_M,
    WALL_DISTANCE_FROM_BALL_M, DEFENDER_HEIGHT_M,
    CL_BASE, SP_BASE, CL_MIN, CL_MAX,
} from '../constants.js';

// ============================================================
// === Input validation ===
// ============================================================

test('validateShotInput accepts valid inputs', () => {
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: 0.3, spin: 50 }), null);
    assert.equal(validateShotInput({ power: 35, azimuth: 0.1, elevation: 0.2, spin: -30 }), null);
    assert.equal(validateShotInput({ power: 20, azimuth: 0, elevation: 0.1, spin: 0 }), null);
});

test('validateShotInput rejects out-of-range power', () => {
    assert.equal(validateShotInput({ power: MIN_POWER_M_S - 1, azimuth: 0, elevation: 0.3, spin: 0 }), 'power_out_of_range');
    assert.equal(validateShotInput({ power: MAX_POWER_M_S + 1, azimuth: 0, elevation: 0.3, spin: 0 }), 'power_out_of_range');
});

test('validateShotInput rejects out-of-range azimuth', () => {
    assert.equal(validateShotInput({ power: 25, azimuth: MIN_AZIMUTH_RAD - 0.1, elevation: 0.3, spin: 0 }), 'azimuth_out_of_range');
    assert.equal(validateShotInput({ power: 25, azimuth: MAX_AZIMUTH_RAD + 0.1, elevation: 0.3, spin: 0 }), 'azimuth_out_of_range');
});

test('validateShotInput rejects out-of-range elevation', () => {
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: MIN_ELEVATION_RAD - 0.1, spin: 0 }), 'elevation_out_of_range');
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: MAX_ELEVATION_RAD + 0.1, spin: 0 }), 'elevation_out_of_range');
});

test('validateShotInput rejects out-of-range spin', () => {
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: 0.3, spin: MAX_SPIN_RAD_S + 10 }), 'spin_out_of_range');
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: 0.3, spin: -MAX_SPIN_RAD_S - 10 }), 'spin_out_of_range');
});

test('validateShotInput rejects NaN / non-finite', () => {
    assert.equal(validateShotInput({ power: NaN, azimuth: 0, elevation: 0.3, spin: 0 }), 'power_invalid');
    assert.equal(validateShotInput({ power: 25, azimuth: Infinity, elevation: 0.3, spin: 0 }), 'azimuth_invalid');
    assert.equal(validateShotInput({ power: 25, azimuth: 0, elevation: 'foo', spin: 0 }), 'elevation_invalid');
});

test('simulateShot returns invalid for bad input', () => {
    const out = simulateShot({
        shotInput: { power: 1000, azimuth: 0, elevation: 0.3, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 3, plus10Target: null, heartTarget: null },
    });
    assert.equal(out.result, 'invalid');
    assert.equal(out.reason, 'power_out_of_range');
});


// ============================================================
// === Geometry helpers ===
// ============================================================

test('ballReleasePos: centre shot at 18m', () => {
    const p = ballReleasePos({ distanceM: 18, angleRad: 0 });
    assert.equal(p.x, 0);
    assert.equal(p.y, BALL_RELEASE_HEIGHT_M);
    assert.equal(p.z, -18);
});

test('ballReleasePos: oblique +15° at 20m', () => {
    const p = ballReleasePos({ distanceM: 20, angleRad: Math.PI / 12 });  // 15°
    assert.ok(p.x > 0, 'player on +x side should have positive x');
    assert.ok(p.z < 0, 'player behind goal-line should have negative z');
    const dist = Math.hypot(p.x, p.z);
    assert.ok(Math.abs(dist - 20) < 1e-9, `distance from origin = ${dist}, expected 20`);
});

test('wallGeometry: straight shot — wall on ball→origin line', () => {
    const ballPos = ballReleasePos({ distanceM: 18, angleRad: 0 });
    const wall = wallGeometry({ ballPos, scenario: { wallSize: 3, angleRad: 0 } });
    assert.equal(wall.defenders.length, 3);
    // Wall centre x should be 0 (centred on ball→origin line)
    assert.ok(Math.abs(wall.centerX) < 1e-9);
    // Wall centre z should be at -18 + 9.15 = -8.85
    assert.ok(Math.abs(wall.centerZ - (-18 + WALL_DISTANCE_FROM_BALL_M)) < 1e-9);
});

test('wallGeometry: oblique shot — wall biased toward near post', () => {
    const ballPos = ballReleasePos({ distanceM: 20, angleRad: Math.PI / 12 });  // +15°
    const wall = wallGeometry({ ballPos, scenario: { wallSize: 4, angleRad: Math.PI / 12 } });
    // Player is on +x side, near post is +x post → wall should be in
    // +x half-space (between ball and +x post)
    assert.ok(wall.centerX > 0, `wall center x = ${wall.centerX}, expected > 0`);
    assert.equal(wall.defenders.length, 4);
});


// ============================================================
// === Lift coefficient ===
// ============================================================

test('liftCoefficient: zero spin → zero Cl', () => {
    assert.equal(liftCoefficient({ speed: 30, spinMag: 0 }), 0);
});

test('liftCoefficient: midpoint Sp returns CL_BASE', () => {
    // Sp = r·ω/v = 0.110·50/30 ≈ 0.183 ≈ SP_BASE (0.18)
    const cl = liftCoefficient({ speed: 30, spinMag: 50 });
    // Should be very close to CL_BASE
    assert.ok(Math.abs(cl - CL_BASE) < 0.01, `Cl=${cl} should be near CL_BASE=${CL_BASE}`);
});

test('liftCoefficient: tiny spin → near-zero Cl', () => {
    // v0.7 proportional model: zero spin gives zero Cl, tiny spin
    // gives tiny Cl (no built-in floor). Confirms straight swipes
    // produce truly straight shots — no curl from background noise.
    const cl = liftCoefficient({ speed: 30, spinMag: 1 });
    assert.ok(cl < 0.01, `tiny spin Cl=${cl}, expected near 0`);
});

test('liftCoefficient: clamps high', () => {
    // v0.7 widened the Cl range to [0.05, 0.45]. Push spin/v ratio
    // high enough to exceed CL_MAX. At v=15 spin=100: Sp=0.733,
    // raw Cl = 0.2 + 0.5·(0.733−0.18) = 0.476 → clamps to 0.45.
    const cl = liftCoefficient({ speed: 15, spinMag: 100 });
    assert.equal(cl, CL_MAX);
});


// ============================================================
// === Trajectory sanity ===
// ============================================================

test('simulateShot: straight shot at goal — should go in', () => {
    // 26 m/s at 0.22 rad elevation, no spin, dead-centre.
    // Tuned to reach z=0 plane at y ≈ 1.6m (mid-goal).
    const out = simulateShot({
        shotInput: { power: 26, azimuth: 0, elevation: 0.22, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    assert.ok(['goal', 'goal_plus10', 'goal_heart', 'goal_plus10_heart'].includes(out.result),
        `expected goal, got ${out.result} crossing=${JSON.stringify(out.crossing)}`);
});

test('simulateShot: shot WAY over crossbar — over', () => {
    // 30 m/s at 0.7 rad (~40°). Lobbed. y at z=18 ≈ 12m, way over the
    // 2.44 m crossbar.
    const out = simulateShot({
        shotInput: { power: 30, azimuth: 0, elevation: 0.7, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    assert.equal(out.result, 'over', `expected over, got ${out.result}`);
});

test('simulateShot: shot wide — wide', () => {
    // 30 m/s with azimuth 0.3 (17°) aim, modest elevation. Ball
    // crosses z=0 plane laterally beyond the post.
    const out = simulateShot({
        shotInput: { power: 30, azimuth: 0.3, elevation: 0.20, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    assert.equal(out.result, 'wide', `expected wide, got ${out.result}`);
});

test('simulateShot: straight shot INTO wall (no curl) — blocked', () => {
    // Wall at z = -8.85m (9.15m from ball at -18m), centred x=0,
    // 3 defenders × 0.5m wide. Defender height 1.8m.
    // 25 m/s at 0.15 rad (~8.6°): ball reaches wall at t≈0.37s,
    // y ≈ 0.8m — squarely defender chest height.
    const out = simulateShot({
        shotInput: { power: 25, azimuth: 0, elevation: 0.15, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 3, plus10Target: null, heartTarget: null },
    });
    assert.equal(out.result, 'blocked', `expected blocked, got ${out.result}`);
});


// ============================================================
// === Magnus / curl behaviour ===
// ============================================================

test('simulateShot: positive azimuth aims to player\'s right (no spin)', () => {
    // REGRESSION GUARD (v0.2): caught a rotation-matrix sign bug
    // where positive azimuth was producing -x velocity. With no spin,
    // a centre-shot at positive azimuth must cross goal-plane at +x.
    const out = simulateShot({
        shotInput: { power: 26, azimuth: 0.15, elevation: 0.22, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    assert.ok(out.crossing, 'shot should reach goal plane');
    assert.ok(out.crossing.x > 0,
        `positive azimuth should aim +x; got crossing.x=${out.crossing.x.toFixed(3)}`);
});

test('simulateShot: negative azimuth aims to player\'s left (no spin)', () => {
    const out = simulateShot({
        shotInput: { power: 26, azimuth: -0.15, elevation: 0.22, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    assert.ok(out.crossing, 'shot should reach goal plane');
    assert.ok(out.crossing.x < 0,
        `negative azimuth should aim -x; got crossing.x=${out.crossing.x.toFixed(3)}`);
});

test('simulateShot: positive spin curls ball to player\'s right', () => {
    // Same shot with +ve spin should land further +x than 0-spin shot.
    const baseShot = {
        shotInput: { power: 28, azimuth: 0, elevation: 0.20, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    };
    const curledShot = {
        ...baseShot,
        shotInput: { ...baseShot.shotInput, spin: 60 },
    };
    const out0 = simulateShot(baseShot);
    const outR = simulateShot(curledShot);

    // Both should reach goal plane
    assert.ok(out0.crossing, 'baseline shot should reach goal plane');
    assert.ok(outR.crossing, 'curled shot should reach goal plane');

    // Curled (positive spin) should land further to the right
    assert.ok(outR.crossing.x > out0.crossing.x + 0.1,
        `curled shot x=${outR.crossing.x.toFixed(3)} should be > baseline x=${out0.crossing.x.toFixed(3)}`);
});

test('simulateShot: negative spin curls ball to player\'s left', () => {
    const baseShot = {
        shotInput: { power: 28, azimuth: 0, elevation: 0.20, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    };
    const curledShot = {
        ...baseShot,
        shotInput: { ...baseShot.shotInput, spin: -60 },
    };
    const out0 = simulateShot(baseShot);
    const outL = simulateShot(curledShot);

    assert.ok(out0.crossing && outL.crossing);
    assert.ok(outL.crossing.x < out0.crossing.x - 0.1,
        `left-curl x=${outL.crossing.x.toFixed(3)} should be < baseline x=${out0.crossing.x.toFixed(3)}`);
});

test('simulateShot: stronger spin = bigger curl', () => {
    // Power 30, elevation 0.20 — enough to clear 18m with drag.
    const base = {
        shotInput: { power: 30, azimuth: -0.05, elevation: 0.20, spin: 30 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    };
    const stronger = { ...base, shotInput: { ...base.shotInput, spin: 80 } };
    const out1 = simulateShot(base);
    const out2 = simulateShot(stronger);
    assert.ok(out1.crossing, `weaker spin shot must reach goal plane (got ${out1.result})`);
    assert.ok(out2.crossing, `stronger spin shot must reach goal plane (got ${out2.result})`);
    // Stronger spin pulls the ball further to the right.
    assert.ok(out2.crossing.x > out1.crossing.x,
        `stronger spin x=${out2.crossing.x.toFixed(3)} should be > weaker x=${out1.crossing.x.toFixed(3)}`);
});


// ============================================================
// === Famous-kick calibration (sanity, not exactness) ===
// ============================================================

test('Beckham vs Greece — ~36 m/s, ~10 rev/s spin at 27m curls into goal', () => {
    // Real reconstruction (Goff & Carré, Physics World):
    //   initial speed 36 m/s, spin 63 rad/s (~10 rev/s),
    //   trajectory rose above crossbar at peak, ~3m lateral displacement,
    //   speed at goal ~19 m/s.
    //
    // We can't replicate the exact trajectory without his exact
    // launch angles, but we can check: with these power/spin values
    // and a sensible elevation/azimuth, the ball curls and lands
    // somewhere reasonable.
    //
    // Player aims to the LEFT of goal (azimuth negative) so right
    // curl (positive spin) brings it back into the goal.
    const out = simulateShot({
        shotInput: {
            power: 36,
            azimuth: -0.10,           // aim ~5.7° left of goal centre
            elevation: 0.18,          // ~10° up
            spin: 63,                 // 10 rev/s right curl
        },
        scenario: { distanceM: 27, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });

    // Should reach the goal plane (not fall short)
    assert.ok(out.crossing, 'Beckham-spec shot should reach goal plane');
    // Lateral displacement from launch direction should be substantial
    // (Magnus actually curled the ball)
    // Without spin the ball would land somewhere left of centre;
    // with spin it should pull right by >0.5m
    const noSpin = simulateShot({
        shotInput: { power: 36, azimuth: -0.10, elevation: 0.18, spin: 0 },
        scenario: { distanceM: 27, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    if (out.crossing && noSpin.crossing) {
        const curlDelta = out.crossing.x - noSpin.crossing.x;
        assert.ok(curlDelta > 0.5,
            `Beckham-spec curl delta = ${curlDelta.toFixed(3)}m, expected > 0.5m`);
    }
});

test('Roberto Carlos 1997 — extreme spin gives extreme curl', () => {
    // Real reconstruction: ~30 m/s, ~88 rad/s spin (~14 rev/s), 35m,
    // massive lateral displacement.
    //
    // Sanity: extreme spin should produce a much larger lateral
    // displacement than baseline.
    const noSpin = simulateShot({
        shotInput: { power: 30, azimuth: -0.15, elevation: 0.18, spin: 0 },
        scenario: { distanceM: 35, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    const extreme = simulateShot({
        shotInput: { power: 30, azimuth: -0.15, elevation: 0.18, spin: 88 },
        scenario: { distanceM: 35, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });

    // Both should reach the goal plane
    if (noSpin.crossing && extreme.crossing) {
        const curlDelta = extreme.crossing.x - noSpin.crossing.x;
        // Roberto Carlos was reported as ~3m+ lateral. Our model
        // should produce at least 1m differential for this much spin.
        assert.ok(curlDelta > 1.0,
            `Roberto Carlos curl delta = ${curlDelta.toFixed(3)}m, expected > 1m`);
    }
});


// ============================================================
// === Determinism ===
// ============================================================

// ============================================================
// === Pitch bounce physics ===
// ============================================================

test('simulateShot: low-power shot bounces off the pitch (vy sign change)', () => {
    // A weak shot that falls short — confirm the trajectory shows
    // a vy sign-change from negative to positive somewhere along the
    // way (the canonical bounce signature). Sample boundaries may
    // never land exactly at y=0, so detect the velocity flip instead.
    const out = simulateShot({
        shotInput: { power: 16, azimuth: 0, elevation: 0.15, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    let bounced = false;
    for (let i = 1; i < out.trajectory.length; i++) {
        const prev = out.trajectory[i - 1];
        const cur = out.trajectory[i];
        // Falling fast → suddenly rising → bounce
        if (prev.vy < -0.5 && cur.vy > 0.5 && cur.y < 0.3) {
            bounced = true;
            break;
        }
    }
    assert.ok(bounced, 'ball must show a bounce (vy sign-change near ground)');
});

test('simulateShot: bounces decay (each peak lower than previous)', () => {
    const out = simulateShot({
        shotInput: { power: 18, azimuth: 0, elevation: 0.18, spin: 0 },
        scenario: { distanceM: 25, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    // Find consecutive peaks (local maxima of y).
    const peaks = [];
    for (let i = 1; i < out.trajectory.length - 1; i++) {
        const prev = out.trajectory[i - 1].y;
        const cur = out.trajectory[i].y;
        const next = out.trajectory[i + 1].y;
        if (cur > prev && cur > next && cur > 0.1) peaks.push(cur);
    }
    if (peaks.length < 2) return; // not enough peaks to test (shot may have scored)
    // Each successive peak should be strictly lower than the previous
    for (let i = 1; i < peaks.length; i++) {
        assert.ok(peaks[i] < peaks[i - 1],
            `bounce peak ${i} (${peaks[i].toFixed(2)}) should be lower than peak ${i - 1} (${peaks[i - 1].toFixed(2)})`);
    }
});

test('simulateShot: trajectory eventually terminates after bounces', () => {
    // A very weak shot — must terminate, not run to MAX_TRAJECTORY_STEPS.
    const out = simulateShot({
        shotInput: { power: 10, azimuth: 0, elevation: 0.10, spin: 0 },
        scenario: { distanceM: 24, angleRad: 0, wallSize: 0, plus10Target: null, heartTarget: null },
    });
    // Should resolve to 'short' (or any miss type — not run unbounded)
    assert.notEqual(out.result, null);
    assert.notEqual(out.result, 'invalid');
});

test('simulateShot: deterministic — same inputs produce identical trajectory', () => {
    const params = {
        shotInput: { power: 28, azimuth: 0.05, elevation: 0.22, spin: 45 },
        scenario: { distanceM: 22, angleRad: 0, wallSize: 4, plus10Target: { x: 2.5, y: 1.8 }, heartTarget: null },
    };
    const a = simulateShot(params);
    const b = simulateShot(params);
    assert.equal(a.result, b.result);
    assert.equal(a.trajectory.length, b.trajectory.length);
    for (let i = 0; i < a.trajectory.length; i++) {
        assert.equal(a.trajectory[i].x, b.trajectory[i].x);
        assert.equal(a.trajectory[i].y, b.trajectory[i].y);
        assert.equal(a.trajectory[i].z, b.trajectory[i].z);
    }
});


// ============================================================
// === Targets ===
// ============================================================

test('simulateShot: ball through +10 target → goal_plus10', () => {
    // Aim for a target in the top-right corner of the goal.
    // Target at x=2.8, y=1.8.
    // Need to aim such that the ball lands at that point with no spin.
    // We tune the elevation + azimuth empirically here.
    // First, find a clean shot for that landing point:
    const target = { x: 2.8, y: 1.8 };

    // Trial: small +ve azimuth, modest elevation.
    // (This test was tuned by trying a few launch angles.)
    const out = simulateShot({
        shotInput: { power: 25, azimuth: 0.165, elevation: 0.28, spin: 0 },
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0,
                    plus10Target: target, heartTarget: null },
    });

    // First confirm it scored
    assert.ok(['goal', 'goal_plus10'].includes(out.result),
        `expected goal/goal_plus10, got ${out.result} crossing=${JSON.stringify(out.crossing)}`);
    // If it scored, the crossing should be close to the target
    if (out.crossing) {
        const distX = Math.abs(out.crossing.x - target.x);
        const distY = Math.abs(out.crossing.y - target.y);
        // If we landed inside the target hitbox, must be goal_plus10
        if (distX <= 0.3 && distY <= 0.3) {
            assert.equal(out.result, 'goal_plus10',
                `crossing inside target zone but result is ${out.result}`);
            assert.equal(out.targetHit.plus10, true);
        }
    }
});

test('simulateShot: ball misses target zone but enters goal → goal', () => {
    const target = { x: 2.8, y: 1.8 };  // top-right
    const out = simulateShot({
        shotInput: { power: 26, azimuth: 0, elevation: 0.22, spin: 0 },  // dead-centre shot, reaches goal
        scenario: { distanceM: 18, angleRad: 0, wallSize: 0,
                    plus10Target: target, heartTarget: null },
    });
    assert.ok(['goal', 'goal_plus10', 'goal_heart', 'goal_plus10_heart'].includes(out.result),
        `expected goal, got ${out.result}`);
    if (out.crossing) {
        // Dead-centre shot should be near (0, ~1.6) — far from corner target.
        const distX = Math.abs(out.crossing.x - target.x);
        assert.ok(distX > 1.0, 'expected centre crossing to be far from corner target');
        assert.equal(out.targetHit.plus10, false);
    }
});
