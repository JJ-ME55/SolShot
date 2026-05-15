import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backboardOffsetX, backboardVelocityX, BACKBOARD_CONSTANTS } from '../backboard.js';

// v0.7: stationary for shots 0..STATIONARY_SHOTS-1, then smooth
// continuous sine motion. Seed arg is ignored. `t` is seconds since
// motion began (caller's responsibility to track that).

test('backboardOffsetX is stationary for shots 0 through STATIONARY_SHOTS-1', () => {
    for (let s = 0; s < BACKBOARD_CONSTANTS.STATIONARY_SHOTS; s++) {
        for (const t of [0, 0.1, 0.5, 1, 2, 5]) {
            assert.equal(backboardOffsetX(0, s, t), 0, `shot ${s} at t=${t}`);
            assert.equal(backboardVelocityX(0, s, t), 0, `shot ${s} velocity at t=${t}`);
        }
    }
});

test('backboardOffsetX starts moving at shot STATIONARY_SHOTS', () => {
    const firstMovingShot = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const samples = [0.25, 1.0, 1.5, 2.5].map(t =>
        backboardOffsetX(0, firstMovingShot, t)
    );
    assert.ok(
        samples.some(v => Math.abs(v) > 0.01),
        `expected non-zero offsets on first moving shot, got ${samples}`
    );
});

test('backboardOffsetX returns 0 at t=0 on the first moving shot', () => {
    // Motion is anchored so it starts at offset=0 — important so the
    // transition from stationary to moving is visually seamless.
    const firstMovingShot = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    assert.equal(backboardOffsetX(0, firstMovingShot, 0), 0);
});

test('backboardOffsetX is deterministic in t (moving phase)', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    assert.equal(backboardOffsetX(0, s, 1.234), backboardOffsetX(0, s, 1.234));
});

test('backboardOffsetX ignores seed (moving phase)', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    assert.equal(backboardOffsetX(0, s, 1.0), backboardOffsetX(42, s, 1.0));
    assert.equal(backboardOffsetX(0, s, 1.0), backboardOffsetX(9999, s, 1.0));
});

test('backboardOffsetX stays within amplitude bounds', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    for (let t = 0; t < 30; t += 0.05) {
        const v = backboardOffsetX(0, s, t);
        assert.ok(
            Math.abs(v) <= BACKBOARD_CONSTANTS.AMPLITUDE_M + 1e-9,
            `t=${t.toFixed(2)} offset ${v} exceeds amplitude`
        );
    }
});

test('backboardOffsetX reaches near-max amplitude during one period', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const period = 1 / BACKBOARD_CONSTANTS.FREQUENCY_HZ;
    let maxAbs = 0;
    for (let t = 0; t <= period; t += period / 200) {
        const v = Math.abs(backboardOffsetX(0, s, t));
        if (v > maxAbs) maxAbs = v;
    }
    assert.ok(
        maxAbs > BACKBOARD_CONSTANTS.AMPLITUDE_M * 0.99,
        `expected max abs offset near ${BACKBOARD_CONSTANTS.AMPLITUDE_M}, got ${maxAbs}`
    );
});

test('backboardOffsetX is periodic with period 1/FREQUENCY_HZ', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const period = 1 / BACKBOARD_CONSTANTS.FREQUENCY_HZ;
    for (const t of [0.3, 1.5, 4.0]) {
        const a = backboardOffsetX(0, s, t);
        const b = backboardOffsetX(0, s, t + period);
        assert.ok(Math.abs(a - b) < 1e-9, `expected periodic, got ${a} vs ${b} at t=${t}`);
    }
});

test('velocity is the derivative of offset (numerical check)', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    const dt = 0.001;
    for (const t of [0.5, 1.2, 3.0]) {
        const numerical = (backboardOffsetX(0, s, t + dt) - backboardOffsetX(0, s, t)) / dt;
        const analytic = backboardVelocityX(0, s, t);
        assert.ok(
            Math.abs(numerical - analytic) < 0.01,
            `t=${t} numerical ${numerical} vs analytic ${analytic}`
        );
    }
});

test('motion is smooth — no jumps between adjacent samples (moving phase)', () => {
    const s = BACKBOARD_CONSTANTS.STATIONARY_SHOTS;
    let prev = backboardOffsetX(0, s, 0);
    const dt = 0.01;
    for (let t = dt; t <= 30; t += dt) {
        const cur = backboardOffsetX(0, s, t);
        const jump = Math.abs(cur - prev);
        const maxJump = BACKBOARD_CONSTANTS.AMPLITUDE_M
            * 2 * Math.PI * BACKBOARD_CONSTANTS.FREQUENCY_HZ * dt * 1.5;
        assert.ok(jump < maxJump,
            `unexpected jump at t=${t.toFixed(2)}: ${jump}`);
        prev = cur;
    }
});

test('shotIndex well past STATIONARY_SHOTS still moves the same way', () => {
    // Frequency is constant across all moving shots — no ramp-up.
    const a = backboardOffsetX(0, 5, 1.5);
    const b = backboardOffsetX(0, 50, 1.5);
    assert.equal(a, b);
});
