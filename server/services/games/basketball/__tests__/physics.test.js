import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, validateShotInput } from '../physics.js';
import {
    BALL_RELEASE_HEIGHT_M, BALL_RELEASE_FORWARD_M, BALL_RELEASE_LATERAL_M,
    MIN_ANGLE_RAD, MAX_ANGLE_RAD,
} from '../constants.js';

test('validateShotInput accepts valid inputs', () => {
    assert.equal(validateShotInput({ angle: 0, power: 0.5 }), null);
    assert.equal(validateShotInput({ angle: 0.1, power: 0.8 }), null);
    assert.equal(validateShotInput({ angle: MIN_ANGLE_RAD, power: 0.1 }), null);
    assert.equal(validateShotInput({ angle: MAX_ANGLE_RAD, power: 1.0 }), null);
});

test('validateShotInput rejects out-of-range angle', () => {
    assert.equal(validateShotInput({ angle: Math.PI, power: 0.5 }), 'angle_out_of_range');
    assert.equal(validateShotInput({ angle: -Math.PI, power: 0.5 }), 'angle_out_of_range');
    assert.equal(validateShotInput({ angle: MAX_ANGLE_RAD + 0.01, power: 0.5 }), 'angle_out_of_range');
});

test('validateShotInput rejects out-of-range power', () => {
    assert.equal(validateShotInput({ angle: 0, power: 0 }), 'power_out_of_range');
    assert.equal(validateShotInput({ angle: 0, power: 2 }), 'power_out_of_range');
    assert.equal(validateShotInput({ angle: 0, power: -0.1 }), 'power_out_of_range');
});

test('validateShotInput rejects non-numeric inputs', () => {
    assert.equal(validateShotInput({ angle: 'foo', power: 0.5 }), 'angle_invalid');
    assert.equal(validateShotInput({ angle: 0, power: NaN }), 'power_invalid');
    assert.equal(validateShotInput({ angle: 0, power: Infinity }), 'power_invalid');
    assert.equal(validateShotInput({ angle: undefined, power: 0.5 }), 'angle_invalid');
});

test('simulateShot returns invalid for bad inputs', () => {
    const r = simulateShot({ angle: 10, power: 0.5, attemptSeed: 42, shotIndex: 0 });
    assert.equal(r.result, 'invalid');
    assert.equal(r.reason, 'angle_out_of_range');
});

test('simulateShot is deterministic — same inputs produce same output', () => {
    const a = simulateShot({ angle: 0.05, power: 0.7, attemptSeed: 42, shotIndex: 0 });
    const b = simulateShot({ angle: 0.05, power: 0.7, attemptSeed: 42, shotIndex: 0 });
    assert.deepEqual(a, b);
});

test('trajectory starts at the ball release point (in 3D)', () => {
    const r = simulateShot({ angle: 0, power: 0.5, attemptSeed: 42, shotIndex: 0 });
    assert.equal(r.trajectory.length > 0, true);
    const p0 = r.trajectory[0];
    assert.equal(p0.x, Math.round(BALL_RELEASE_LATERAL_M * 1000) / 1000);
    assert.equal(p0.y, Math.round(BALL_RELEASE_HEIGHT_M * 1000) / 1000);
    assert.equal(p0.z, Math.round(BALL_RELEASE_FORWARD_M * 1000) / 1000);
});

test('trajectory has at least 2 points for valid shots', () => {
    const r = simulateShot({ angle: 0, power: 0.5, attemptSeed: 42, shotIndex: 0 });
    assert.ok(r.trajectory.length >= 2);
});

test('minimum-power shot does not score', () => {
    // With VELOCITY_BASELINE raised to 5.6 m/s, even MIN_POWER carries
    // far enough to reach the rim's z-area, so the outcome is no longer
    // strictly 'short' — but a min-power shot must still never SCORE
    // (it falls below rim height: 'wide' / 'short' / 'rim_out').
    const r = simulateShot({ angle: 0, power: 0.10, attemptSeed: 42, shotIndex: 0 });
    assert.ok(
        !['swish', 'rim_in', 'bank_in'].includes(r.result),
        `expected a non-scoring outcome for minimum-power shot, got ${r.result}`,
    );
});

test('full-power shot overshoots into backboard or beyond', () => {
    const r = simulateShot({ angle: 0, power: 1.0, attemptSeed: 42, shotIndex: 0 });
    assert.ok(
        ['bank_in', 'bank_out', 'long', 'rim_in', 'rim_out', 'swish'].includes(r.result),
        `expected backboard hit or rim interaction at full power, got ${r.result}`
    );
});

test('valid shot result has hitBackboard and hitRim booleans', () => {
    const r = simulateShot({ angle: 0, power: 0.5, attemptSeed: 42, shotIndex: 0 });
    assert.equal(typeof r.hitBackboard, 'boolean');
    assert.equal(typeof r.hitRim, 'boolean');
});

test('every trajectory point has 3D coordinates (x, y, z)', () => {
    const r = simulateShot({ angle: 0, power: 0.5, attemptSeed: 42, shotIndex: 0 });
    for (const p of r.trajectory) {
        assert.equal(typeof p.x, 'number');
        assert.equal(typeof p.y, 'number');
        assert.equal(typeof p.z, 'number');
        assert.equal(typeof p.vx, 'number');
        assert.equal(typeof p.vy, 'number');
        assert.equal(typeof p.vz, 'number');
    }
});

test('attemptSeed is ignored — same other-inputs are deterministic', () => {
    // attemptSeed is accepted for API compatibility but has no effect
    // on the trajectory. (shotIndex DOES matter — it gates whether the
    // backboard is moving — so both calls here use the same shotIndex.)
    const a = simulateShot({ angle: 0.05, power: 0.55, attemptSeed: 1, shotIndex: 0, shotStartT: 1.0 });
    const b = simulateShot({ angle: 0.05, power: 0.55, attemptSeed: 9999, shotIndex: 0, shotStartT: 1.0 });
    assert.deepEqual(a, b, 'seed should not affect the trajectory');
});

test('extreme lateral angle eventually misses to the side', () => {
    // Maximum lateral angle with mid power — should miss wide or short
    // but not score.
    const r = simulateShot({ angle: MAX_ANGLE_RAD, power: 0.85, attemptSeed: 42, shotIndex: 0 });
    assert.ok(
        !['swish', 'rim_in', 'bank_in'].includes(r.result),
        `expected miss for max lateral angle, got ${r.result}`
    );
});

test('a mid-power straight shot reaches the rim area', () => {
    // With the baseline+linear velocity mapping (5.6 → 9.5 m/s across
    // the power range), power ≈ 0.6 puts the shot in the swish/rim
    // band — it must reach the rim in some recognisable way, not
    // "short", "long", or "wide". Protects against gross physics
    // regression.
    const r = simulateShot({ angle: 0, power: 0.6, attemptSeed: 42, shotIndex: 0 });
    assert.ok(
        ['swish', 'rim_in', 'rim_out', 'bank_in', 'bank_out'].includes(r.result),
        `expected rim-area outcome for mid-power centred shot, got ${r.result}`
    );
});
