import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateScenario, tierForGoals } from '../shotgen.js';
import {
    ESCALATION_TIERS,
    GOAL_HALF_WIDTH_M, GOAL_HEIGHT_M,
    TARGET_HALF_WIDTH_M, TARGET_HALF_HEIGHT_M,
    HEART_SPAWN_PROBABILITY,
} from '../constants.js';


// ============================================================
// === Tier resolution ===
// ============================================================

test('tierForGoals: 0 goals → first tier', () => {
    const t = tierForGoals(0);
    assert.equal(t.distanceM, 18);
    assert.equal(t.wallSize, 3);
    assert.deepEqual(t.anglePoolDeg, [0]);
});

test('tierForGoals: 3 goals → tier 2', () => {
    const t = tierForGoals(3);
    assert.equal(t.distanceM, 20);
    assert.equal(t.wallSize, 4);
});

test('tierForGoals: 6 goals → tier 3', () => {
    const t = tierForGoals(6);
    assert.equal(t.distanceM, 22);
    assert.equal(t.wallSize, 5);
});

test('tierForGoals: 10 goals → tier 4', () => {
    const t = tierForGoals(10);
    assert.equal(t.distanceM, 24);
    assert.equal(t.wallSize, 6);
});

test('tierForGoals: 100 goals → still highest tier', () => {
    const t = tierForGoals(100);
    assert.equal(t.distanceM, 24);
    assert.equal(t.wallSize, 6);
});

test('tierForGoals: boundary — 2 goals (tier 1)', () => {
    const t = tierForGoals(2);
    assert.equal(t.distanceM, 18);
});

test('tierForGoals: boundary — 9 goals (tier 3)', () => {
    const t = tierForGoals(9);
    assert.equal(t.distanceM, 22);
});


// ============================================================
// === generateScenario — determinism ===
// ============================================================

test('generateScenario: same inputs produce identical output', () => {
    const a = generateScenario({ attemptSeed: 42, shotIndex: 0, goalCount: 0 });
    const b = generateScenario({ attemptSeed: 42, shotIndex: 0, goalCount: 0 });
    assert.deepEqual(a, b);
});

test('generateScenario: different shotIndex → different scenarios (high probability)', () => {
    // Heart spawn is 20% per shot, +10 is always present. Across
    // 20 shots, the +10 positions should differ for at least some.
    const positions = new Set();
    for (let i = 0; i < 20; i++) {
        const s = generateScenario({ attemptSeed: 1, shotIndex: i, goalCount: 0 });
        positions.add(`${s.plus10Target.x.toFixed(4)}|${s.plus10Target.y.toFixed(4)}`);
    }
    assert.ok(positions.size > 5, `got ${positions.size} distinct +10 positions across 20 shots, expected > 5`);
});

test('generateScenario: different attemptSeed → different scenarios', () => {
    const a = generateScenario({ attemptSeed: 1, shotIndex: 0, goalCount: 0 });
    const b = generateScenario({ attemptSeed: 2, shotIndex: 0, goalCount: 0 });
    // Different seeds → at least the +10 position should differ
    const sameTarget = a.plus10Target.x === b.plus10Target.x && a.plus10Target.y === b.plus10Target.y;
    assert.equal(sameTarget, false);
});


// ============================================================
// === generateScenario — target placement ===
// ============================================================

test('generateScenario: +10 target always inside goal frame', () => {
    for (let i = 0; i < 100; i++) {
        const s = generateScenario({ attemptSeed: 7, shotIndex: i, goalCount: 0 });
        const t = s.plus10Target;
        assert.ok(
            t.x >= -GOAL_HALF_WIDTH_M + TARGET_HALF_WIDTH_M - 1e-9 &&
            t.x <= +GOAL_HALF_WIDTH_M - TARGET_HALF_WIDTH_M + 1e-9,
            `shot ${i}: +10 x=${t.x} out of range`);
        assert.ok(
            t.y >= TARGET_HALF_HEIGHT_M - 1e-9 &&
            t.y <= GOAL_HEIGHT_M - TARGET_HALF_HEIGHT_M + 1e-9,
            `shot ${i}: +10 y=${t.y} out of range`);
    }
});

test('generateScenario: heart appears at ~20% rate over many shots', () => {
    let heartCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
        const s = generateScenario({ attemptSeed: 999, shotIndex: i, goalCount: 0 });
        if (s.heartTarget) heartCount++;
    }
    const rate = heartCount / N;
    // Expected 0.20; with N=1000, std deviation ≈ 0.013, so 0.16–0.24 is reasonable.
    assert.ok(rate >= 0.15 && rate <= 0.25,
        `heart spawn rate = ${rate.toFixed(3)}, expected ~${HEART_SPAWN_PROBABILITY}`);
});

test('generateScenario: heart never overlaps +10 when both present', () => {
    let bothCount = 0;
    for (let i = 0; i < 500; i++) {
        const s = generateScenario({ attemptSeed: 31415, shotIndex: i, goalCount: 0 });
        if (s.heartTarget) {
            bothCount++;
            const dx = Math.abs(s.heartTarget.x - s.plus10Target.x);
            const dy = Math.abs(s.heartTarget.y - s.plus10Target.y);
            const overlap = dx < 2 * TARGET_HALF_WIDTH_M && dy < 2 * TARGET_HALF_HEIGHT_M;
            assert.equal(overlap, false,
                `shot ${i}: heart overlaps +10. ` +
                `+10 at (${s.plus10Target.x.toFixed(2)},${s.plus10Target.y.toFixed(2)}), ` +
                `heart at (${s.heartTarget.x.toFixed(2)},${s.heartTarget.y.toFixed(2)})`);
        }
    }
    assert.ok(bothCount > 50, 'need enough samples to be meaningful');
});

test('generateScenario: +10 corner bias is dominant (~85-95%)', () => {
    // Define "in corner" as x in outer 75% (|x| > 0.25·HALF_WIDTH) AND
    // y in outer 45% (in top half or bottom half).
    //
    // CORNER_BIAS_PROBABILITY is 0.70 — bias roll places in a corner
    // 70% directly. The other 30% ("anywhere") still land in corners
    // ~55% of the time because corner regions cover ~55% of the goal
    // mouth area. So observed rate ≈ 0.70 + 0.30·0.55 ≈ 0.87.
    let cornerCount = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
        const s = generateScenario({ attemptSeed: 271828, shotIndex: i, goalCount: 0 });
        const t = s.plus10Target;
        const inCornerX = Math.abs(t.x) > 0.25 * GOAL_HALF_WIDTH_M;
        const inCornerY = t.y < 0.45 * GOAL_HEIGHT_M || t.y > 0.55 * GOAL_HEIGHT_M;
        if (inCornerX && inCornerY) cornerCount++;
    }
    const rate = cornerCount / N;
    assert.ok(rate >= 0.82 && rate <= 0.95,
        `corner placement rate = ${rate.toFixed(3)}, expected ~0.87 (0.82-0.95 window)`);
});


// ============================================================
// === generateScenario — tier-driven escalation ===
// ============================================================

test('generateScenario: tier respects goalCount', () => {
    const s0 = generateScenario({ attemptSeed: 1, shotIndex: 0, goalCount: 0 });
    assert.equal(s0.distanceM, 18);
    assert.equal(s0.wallSize, 3);
    assert.equal(s0.angleRad, 0);  // tier 1 angle pool = [0]

    const s3 = generateScenario({ attemptSeed: 1, shotIndex: 0, goalCount: 3 });
    assert.equal(s3.distanceM, 20);
    assert.equal(s3.wallSize, 4);

    const s10 = generateScenario({ attemptSeed: 1, shotIndex: 0, goalCount: 10 });
    assert.equal(s10.distanceM, 24);
    assert.equal(s10.wallSize, 6);
});

test('generateScenario: tier 1 always produces centre angle', () => {
    for (let i = 0; i < 50; i++) {
        const s = generateScenario({ attemptSeed: 42, shotIndex: i, goalCount: 0 });
        assert.equal(s.angleRad, 0, `tier 1 should only produce angle=0, shot ${i} produced ${s.angleRad}`);
    }
});

test('generateScenario: tier 3 produces variety of angles', () => {
    const anglesSeen = new Set();
    for (let i = 0; i < 50; i++) {
        const s = generateScenario({ attemptSeed: 42, shotIndex: i, goalCount: 6 });
        anglesSeen.add(s.angleRad);
    }
    // Tier 3 pool = [0, -15, +15, -25, +25] in degrees (5 values)
    assert.ok(anglesSeen.size >= 3,
        `tier 3 should produce at least 3 distinct angles in 50 shots, got ${anglesSeen.size}`);
});


// ============================================================
// === Input validation ===
// ============================================================

test('generateScenario: rejects non-integer shotIndex', () => {
    assert.throws(
        () => generateScenario({ attemptSeed: 1, shotIndex: 0.5, goalCount: 0 }),
        /shotIndex/);
});

test('generateScenario: rejects negative shotIndex', () => {
    assert.throws(
        () => generateScenario({ attemptSeed: 1, shotIndex: -1, goalCount: 0 }),
        /shotIndex/);
});

test('generateScenario: rejects negative goalCount', () => {
    assert.throws(
        () => generateScenario({ attemptSeed: 1, shotIndex: 0, goalCount: -1 }),
        /goalCount/);
});

test('generateScenario: rejects non-finite attemptSeed', () => {
    assert.throws(
        () => generateScenario({ attemptSeed: NaN, shotIndex: 0, goalCount: 0 }),
        /attemptSeed/);
});
