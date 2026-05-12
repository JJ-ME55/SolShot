import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backboardOffsetX, backboardVelocityX, BACKBOARD_CONSTANTS } from '../backboard.js';

test('backboard is stationary for shots 0 through STATIONARY_SHOTS-1', () => {
    for (let s = 0; s < BACKBOARD_CONSTANTS.STATIONARY_SHOTS; s++) {
        for (const t of [0, 0.1, 0.5, 1, 2, 5]) {
            assert.equal(backboardOffsetX(42, s, t), 0, `shot ${s} at t=${t} should be still`);
            assert.equal(backboardVelocityX(42, s, t), 0, `shot ${s} at t=${t} should have zero velocity`);
        }
    }
});

test('backboard starts moving at shot STATIONARY_SHOTS', () => {
    const firstMovingShot = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const offsets = [0, 0.25, 0.5, 0.75, 1, 1.5, 2].map(t =>
        backboardOffsetX(42, firstMovingShot, t)
    );
    assert.ok(
        offsets.some(o => Math.abs(o) > 0.001),
        `expected some non-zero offset on first moving shot, got ${offsets}`
    );
});

test('backboard offset never exceeds amplitude', () => {
    const seed = 999;
    for (let shot = 0; shot < 50; shot++) {
        for (let t = 0; t < 5; t += 0.05) {
            const off = backboardOffsetX(seed, shot, t);
            assert.ok(
                Math.abs(off) <= BACKBOARD_CONSTANTS.AMPLITUDE_PX + 0.001,
                `shot ${shot} t=${t.toFixed(2)} offset ${off} exceeds amplitude ${BACKBOARD_CONSTANTS.AMPLITUDE_PX}`
            );
        }
    }
});

test('backboard is deterministic — same inputs produce same outputs', () => {
    const a = backboardOffsetX(12345, 17, 1.234);
    const b = backboardOffsetX(12345, 17, 1.234);
    assert.equal(a, b);
});

test('different seeds produce different starting positions on the first moving shot', () => {
    const firstMovingShot = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const seeds = [1, 100, 999, 7777, 12345];
    const t0Offsets = seeds.map(s => backboardOffsetX(s, firstMovingShot, 0));
    const uniqueRounded = new Set(t0Offsets.map(v => v.toFixed(3)));
    assert.ok(
        uniqueRounded.size > 1,
        `expected variation across seeds at t=0, got ${[...uniqueRounded]}`
    );
});

test('frequency increases as shotIndex grows', () => {
    // Count zero crossings of the offset wave over a fixed window. More
    // crossings = higher frequency = harder difficulty.
    function countZeroCrossings(seed, shotIndex, duration, step = 0.005) {
        let prev = backboardOffsetX(seed, shotIndex, 0);
        let count = 0;
        for (let t = step; t <= duration; t += step) {
            const cur = backboardOffsetX(seed, shotIndex, t);
            if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) count++;
            prev = cur;
        }
        return count;
    }
    const firstMoving = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const muchLater = firstMoving + BACKBOARD_CONSTANTS.SPEED_RAMP_INTERVAL * 3;
    const earlyCrossings = countZeroCrossings(42, firstMoving, 4);
    const lateCrossings = countZeroCrossings(42, muchLater, 4);
    assert.ok(
        lateCrossings > earlyCrossings,
        `expected more crossings at shot ${muchLater} (${lateCrossings}) than shot ${firstMoving} (${earlyCrossings})`
    );
});

test('velocity is the derivative of offset (sign agreement)', () => {
    // The velocity sign should match the direction of offset change.
    // Sample two near-adjacent times and check that
    // (offset(t2) - offset(t1)) / (t2 - t1) has the same sign as velocity(t1).
    const seed = 42;
    const shotIndex = BACKBOARD_CONSTANTS.STATIONARY_SHOTS + 1;
    const t1 = 0.5;
    const dt = 0.001;
    const t2 = t1 + dt;
    const dOffset = backboardOffsetX(seed, shotIndex, t2) - backboardOffsetX(seed, shotIndex, t1);
    const v = backboardVelocityX(seed, shotIndex, t1);
    if (Math.abs(v) > 1) {
        // Only check when velocity is meaningfully non-zero
        assert.ok(
            Math.sign(dOffset) === Math.sign(v),
            `numerical derivative ${dOffset / dt} and analytic velocity ${v} should have same sign`
        );
    }
});

test('negative seeds work without errors', () => {
    const firstMoving = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const off = backboardOffsetX(-12345, firstMoving, 1);
    assert.ok(Number.isFinite(off), `expected finite offset, got ${off}`);
    assert.ok(Math.abs(off) <= BACKBOARD_CONSTANTS.AMPLITUDE_PX + 0.001);
});
