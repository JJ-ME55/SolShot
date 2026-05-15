import { test } from 'node:test';
// Non-strict assert: we want -0 == 0 for trig-derived velocity components.
import assert from 'node:assert';
import {
    simulateRound,
    validateRoundInput,
    applyTap,
    isTapInsideHitbox,
} from '../physics.js';
import {
    BALL_RADIUS_M,
    HITBOX_RADIUS_M,
    BASE_UP_M_S,
    LATERAL_GAIN,
    SPIN_GAIN,
    GRAVITY_M_S2,
    PHYSICS_DT_S,
    DEFAULT_WORLD_WIDTH_M,
    BALL_START_X_FRAC,
    BALL_START_Y_M,
    FLOOR_Y_M,
} from '../constants.js';

const ballStartX = DEFAULT_WORLD_WIDTH_M * BALL_START_X_FRAC;

// ─── validateRoundInput ─────────────────────────────────────────────

test('validateRoundInput accepts well-formed input', () => {
    assert.equal(validateRoundInput({ seed: 1, tapEvents: [] }), null);
    assert.equal(validateRoundInput({
        seed: 0,
        tapEvents: [{ tapX: 4, tapY: 1, timestamp: 0.5 }],
    }), null);
});

test('validateRoundInput rejects null / non-object input', () => {
    assert.equal(validateRoundInput(null), 'input_invalid');
    assert.equal(validateRoundInput(undefined), 'input_invalid');
    assert.equal(validateRoundInput(42), 'input_invalid');
});

test('validateRoundInput rejects non-finite seed', () => {
    assert.equal(validateRoundInput({ seed: NaN, tapEvents: [] }), 'seed_invalid');
    assert.equal(validateRoundInput({ seed: Infinity, tapEvents: [] }), 'seed_invalid');
    assert.equal(validateRoundInput({ seed: 'foo', tapEvents: [] }), 'seed_invalid');
});

test('validateRoundInput rejects non-array tapEvents', () => {
    assert.equal(validateRoundInput({ seed: 1, tapEvents: null }), 'tap_events_invalid');
    assert.equal(validateRoundInput({ seed: 1, tapEvents: 'foo' }), 'tap_events_invalid');
});

test('validateRoundInput rejects non-monotonic timestamps', () => {
    assert.equal(validateRoundInput({
        seed: 1,
        tapEvents: [
            { tapX: 4, tapY: 1, timestamp: 1.0 },
            { tapX: 4, tapY: 1, timestamp: 0.5 },
        ],
    }), 'tap_timestamps_non_monotonic');
});

test('validateRoundInput accepts equal-timestamp consecutive taps', () => {
    // Multiple taps at exact same time = legal (last one wins per simulateRound).
    assert.equal(validateRoundInput({
        seed: 1,
        tapEvents: [
            { tapX: 4, tapY: 1, timestamp: 1.0 },
            { tapX: 4, tapY: 1, timestamp: 1.0 },
        ],
    }), null);
});

test('validateRoundInput rejects negative timestamps', () => {
    assert.equal(validateRoundInput({
        seed: 1,
        tapEvents: [{ tapX: 4, tapY: 1, timestamp: -0.1 }],
    }), 'tap_timestamp_negative');
});

test('validateRoundInput rejects non-finite tap coords', () => {
    assert.equal(validateRoundInput({
        seed: 1,
        tapEvents: [{ tapX: NaN, tapY: 1, timestamp: 0 }],
    }), 'tap_x_invalid');
    assert.equal(validateRoundInput({
        seed: 1,
        tapEvents: [{ tapX: 4, tapY: Infinity, timestamp: 0 }],
    }), 'tap_y_invalid');
});

test('validateRoundInput rejects too-small worldWidth', () => {
    assert.equal(validateRoundInput({
        seed: 1, tapEvents: [], worldWidth: BALL_RADIUS_M,
    }), 'world_width_too_small');
});

// ─── applyTap (pure function) ───────────────────────────────────────

test('applyTap dead-centre → straight up at BASE_UP, zero spin', () => {
    const r = applyTap(4, 1, 4, 1);
    assert.equal(r.vx, 0);
    assert.equal(r.vy, BASE_UP_M_S);
    assert.equal(r.spin, 0);
});

test('applyTap left edge → ball goes up and to the right with negative spin', () => {
    // Tap at (ballX - R, ballY) — left edge of ball.
    // Tolerance for IEEE-754 drift: 0.11/0.11 isn't exactly 1.0 in float.
    const r = applyTap(4, 1, 4 - BALL_RADIUS_M, 1);
    assert.ok(Math.abs(r.vx - LATERAL_GAIN) < 1e-6, `vx ${r.vx} ≉ ${LATERAL_GAIN}`);
    assert.equal(r.vy, BASE_UP_M_S);
    assert.ok(Math.abs(r.spin - (-SPIN_GAIN)) < 1e-6, `spin ${r.spin} ≉ ${-SPIN_GAIN}`);
});

test('applyTap right edge → ball goes up and to the left with positive spin', () => {
    const r = applyTap(4, 1, 4 + BALL_RADIUS_M, 1);
    assert.ok(Math.abs(r.vx - (-LATERAL_GAIN)) < 1e-6, `vx ${r.vx} ≉ ${-LATERAL_GAIN}`);
    assert.equal(r.vy, BASE_UP_M_S);
    assert.ok(Math.abs(r.spin - SPIN_GAIN) < 1e-6, `spin ${r.spin} ≉ ${SPIN_GAIN}`);
});

test('applyTap below ball → adds extra upward velocity', () => {
    // Tap at (ballX, ballY - R) — bottom of ball.
    const r = applyTap(4, 1, 4, 1 - BALL_RADIUS_M);
    // offsetY_norm = -1, so vy = BASE_UP - (-1)*VERTICAL_GAIN = BASE_UP + VERTICAL_GAIN.
    assert.ok(r.vy > BASE_UP_M_S, `expected vy > BASE_UP, got ${r.vy}`);
    assert.equal(r.vx, 0);
    assert.equal(r.spin, 0);
});

// ─── isTapInsideHitbox ──────────────────────────────────────────────

test('isTapInsideHitbox dead-centre tap is inside', () => {
    assert.equal(isTapInsideHitbox(4, 1, 4, 1), true);
});

test('isTapInsideHitbox tap just inside hitbox edge is inside', () => {
    // 1e-6 inset to dodge IEEE-754 boundary precision (which depends on
    // the exact value of HITBOX_RADIUS_M).
    assert.equal(isTapInsideHitbox(4, 1, 4 + HITBOX_RADIUS_M - 1e-6, 1), true);
});

test('isTapInsideHitbox tap just outside hitbox is outside', () => {
    assert.equal(isTapInsideHitbox(4, 1, 4 + HITBOX_RADIUS_M + 0.001, 1), false);
});

test('isTapInsideHitbox forgiveness — taps past visual radius but inside hitbox count', () => {
    // Inflated hitbox is 20% larger than visual — a tap past visual radius
    // but within hitbox should still register.
    const justPastVisual = BALL_RADIUS_M + 0.005;
    assert.equal(isTapInsideHitbox(4, 1, 4 + justPastVisual, 1), true);
});

// ─── simulateRound ──────────────────────────────────────────────────

test('simulateRound: empty tap events → ball falls to floor', () => {
    const r = simulateRound({ seed: 1, tapEvents: [] });
    assert.equal(r.score, 0);
    assert.equal(r.terminationReason, 'floor');
    assert.equal(r.missedTapCount, 0);
    // Ball starts at BALL_START_Y_M = 1.0m, no initial vy.
    // Time to fall (1m - BALL_RADIUS_M) under gravity 9.81: t = sqrt(2*0.89/9.81) ≈ 0.426 s
    // → step ≈ 0.426 / PHYSICS_DT_S ≈ 51 steps. Allow generous window.
    assert.ok(r.terminationStep > 30 && r.terminationStep < 80,
        `expected terminationStep ~51, got ${r.terminationStep}`);
});

test('simulateRound: invalid input surfaces as terminationReason invalid', () => {
    const r = simulateRound({ seed: NaN, tapEvents: [] });
    assert.equal(r.terminationReason, 'invalid');
    assert.equal(r.reason, 'seed_invalid');
    assert.equal(r.score, 0);
});

test('simulateRound: one well-timed dead-centre tap scores 1', () => {
    // Ball starts at (4, 1) at rest. Falls under gravity.
    // At t=0.1s ball has fallen ~0.05m to (4, 0.95). Tap there.
    const r = simulateRound({
        seed: 1,
        tapEvents: [{ tapX: ballStartX, tapY: 0.95, timestamp: 0.1 }],
    });
    assert.equal(r.score, 1);
    assert.equal(r.missedTapCount, 0);
    assert.equal(r.terminationReason, 'floor');
});

test('simulateRound: tap miles away from ball → missedTapCount but no score', () => {
    const r = simulateRound({
        seed: 1,
        tapEvents: [{ tapX: 0.5, tapY: 5, timestamp: 0.1 }],
    });
    assert.equal(r.score, 0);
    assert.equal(r.missedTapCount, 1);
});

test('simulateRound: dead-centre tap launches ball straight up — vy > 0 right after', () => {
    const r = simulateRound({
        seed: 1,
        tapEvents: [{ tapX: ballStartX, tapY: 0.95, timestamp: 0.1 }],
    });
    // Find the tap-marked sample
    const tapSample = r.ballPath.find(s => s.tap === 'hit');
    assert.ok(tapSample, 'expected a tap sample in ballPath');
    assert.ok(tapSample.vy > 0, `expected positive vy after tap, got ${tapSample.vy}`);
    assert.equal(tapSample.vx, 0);
    assert.equal(tapSample.spin, 0);
});

test('simulateRound: ball never leaves [BALL_RADIUS, worldWidth-BALL_RADIUS] x range', () => {
    // Edge tap to push ball sideways aggressively.
    const tapX = ballStartX - BALL_RADIUS_M;  // tap at left edge → goes right
    const r = simulateRound({
        seed: 1,
        tapEvents: [{ tapX, tapY: 0.95, timestamp: 0.1 }],
    });
    for (const sample of r.ballPath) {
        assert.ok(sample.x >= BALL_RADIUS_M - 1e-9,
            `ball x = ${sample.x} below left wall`);
        assert.ok(sample.x <= DEFAULT_WORLD_WIDTH_M - BALL_RADIUS_M + 1e-9,
            `ball x = ${sample.x} past right wall`);
    }
});

test('simulateRound: Magnus curve — spinning ball trajectory bends', () => {
    // Tap at right edge → ball goes left with positive spin (ccw in our convention).
    // Magnus force on ball moving left (vx<0) with positive spin:
    //   F.y = C_M * spin * vx → negative (downward push). So ball drops faster.
    // Compare horizontal-only travel against a no-spin reference.
    const ev = (offsetX) => ({
        seed: 1,
        tapEvents: [{ tapX: ballStartX + offsetX, tapY: 0.95, timestamp: 0.1 }],
    });
    const withSpin = simulateRound(ev(BALL_RADIUS_M));   // edge tap, max spin
    const noSpin = simulateRound(ev(0));                 // dead centre, no spin

    // Spinning ball ends earlier — Magnus force pushes it down faster.
    assert.ok(withSpin.terminationStep <= noSpin.terminationStep + 5,
        `expected spin to shorten flight; spinStep=${withSpin.terminationStep}, noSpinStep=${noSpin.terminationStep}`);
});

test('simulateRound: tap outside hitbox at the apex does NOT score', () => {
    // Ball at (4, ~1.4) at apex after dead-centre tap. Tap far away.
    const r = simulateRound({
        seed: 1,
        tapEvents: [
            { tapX: ballStartX, tapY: 0.95, timestamp: 0.1 },     // scores
            { tapX: 0, tapY: 5, timestamp: 0.5 },                 // misses
        ],
    });
    assert.equal(r.score, 1);
    assert.equal(r.missedTapCount, 1);
});

test('simulateRound: determinism — same inputs produce identical results', () => {
    const input = {
        seed: 42,
        tapEvents: [
            { tapX: ballStartX, tapY: 0.95, timestamp: 0.1 },
            { tapX: ballStartX + 0.05, tapY: 1.5, timestamp: 0.7 },
            { tapX: ballStartX - 0.05, tapY: 1.4, timestamp: 1.3 },
        ],
    };
    const a = simulateRound(input);
    const b = simulateRound(input);
    assert.equal(a.score, b.score);
    assert.equal(a.terminationReason, b.terminationReason);
    assert.equal(a.terminationStep, b.terminationStep);
    assert.equal(a.missedTapCount, b.missedTapCount);
    assert.equal(a.ballPath.length, b.ballPath.length);
    // Spot-check a sample
    assert.equal(a.ballPath[0].x, b.ballPath[0].x);
    assert.equal(a.ballPath[a.ballPath.length - 1].y, b.ballPath[a.ballPath.length - 1].y);
});

test('simulateRound: consecutive equal-timestamp taps — last one wins (velocity replaced)', () => {
    // Two taps at the same timestamp: first dead-centre, second at right edge.
    // At t=0.1 ball is at y ≈ 1 - 0.5*9.81*(0.1)² ≈ 0.951 (free-fall from y=1).
    // Tap at the ball's actual position so both fire.
    const tapTime = 0.1;
    const ballYAtTap = BALL_START_Y_M - 0.5 * GRAVITY_M_S2 * tapTime * tapTime;
    const input = {
        seed: 1,
        tapEvents: [
            { tapX: ballStartX, tapY: ballYAtTap, timestamp: tapTime },                       // dead centre
            { tapX: ballStartX + BALL_RADIUS_M, tapY: ballYAtTap, timestamp: tapTime },       // right edge
        ],
    };
    const r = simulateRound(input);
    assert.equal(r.score, 2);  // both fire (each inside hitbox at the time)
    const hitSamples = r.ballPath.filter(s => s.tap === 'hit');
    assert.equal(hitSamples.length, 2);
    // Second hit: from edge tap → vx should be -LATERAL_GAIN (leftward).
    // Tolerance for float drift from 0.11/0.11 ≠ 1.0 exactly.
    const secondHit = hitSamples[1];
    assert.ok(Math.abs(secondHit.vx - (-LATERAL_GAIN)) < 1e-6,
        `expected vx ≈ ${-LATERAL_GAIN}, got ${secondHit.vx}`);
});

test('simulateRound: floor termination position is at floor + ball radius', () => {
    const r = simulateRound({ seed: 1, tapEvents: [] });
    assert.equal(r.terminationReason, 'floor');
    const lastSample = r.ballPath[r.ballPath.length - 1];
    assert.ok(Math.abs(lastSample.y - (FLOOR_Y_M + BALL_RADIUS_M)) < 0.01,
        `expected floor-contact y ≈ ${FLOOR_Y_M + BALL_RADIUS_M}, got ${lastSample.y}`);
});

test('simulateRound: ball with no taps falls under gravity at expected acceleration', () => {
    // Sanity check: ball starts at rest at y=1, should reach floor at correct time.
    // Drop distance: (BALL_START_Y_M - BALL_RADIUS_M) = 0.89m
    // Time: t = sqrt(2*0.89/9.81) = 0.426s
    // Steps at 120Hz: ≈ 51
    const r = simulateRound({ seed: 1, tapEvents: [] });
    const expectedTime = Math.sqrt(2 * (BALL_START_Y_M - BALL_RADIUS_M) / GRAVITY_M_S2);
    const actualTime = r.terminationStep * PHYSICS_DT_S;
    assert.ok(Math.abs(actualTime - expectedTime) < 0.02,
        `expected fall time ${expectedTime.toFixed(3)}s, got ${actualTime.toFixed(3)}s`);
});

test('simulateRound: tapEvents past floor termination are ignored (game already over)', () => {
    // Ball with no inputs falls in ~0.43s. A tap at t=2s should never fire.
    const r = simulateRound({
        seed: 1,
        tapEvents: [{ tapX: ballStartX, tapY: 0.95, timestamp: 2.0 }],
    });
    assert.equal(r.score, 0);
    assert.equal(r.missedTapCount, 0);
    assert.equal(r.terminationReason, 'floor');
});

test('simulateRound: long survival — multi-tap input meaningfully extends flight', () => {
    // Compare flight length with vs without taps. Free-fall from y=1 ends at ~step 51.
    // First tap at t=0.1 (ball ≈ 0.951m) launches it back up; flight should
    // extend well past the no-tap baseline even if subsequent taps miss.
    const tapTime = 0.1;
    const ballYAtTap = BALL_START_Y_M - 0.5 * GRAVITY_M_S2 * tapTime * tapTime;
    const tapEvents = [
        { tapX: ballStartX, tapY: ballYAtTap, timestamp: tapTime },
    ];
    const withTap = simulateRound({ seed: 1, tapEvents });
    const noTap = simulateRound({ seed: 1, tapEvents: [] });

    assert.equal(withTap.score, 1);
    assert.ok(withTap.terminationStep > noTap.terminationStep + 50,
        `expected tap to extend flight by 50+ steps; withTap=${withTap.terminationStep}, noTap=${noTap.terminationStep}`);
});
