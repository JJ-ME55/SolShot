import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyShotResult, initialHeatCheckState, scoreAttempt } from '../rules.js';
import {
    POINTS_SWISH, POINTS_RIM_IN, POINTS_BACKBOARD_BANK, POINTS_HEAT_CHECK_SWISH,
    HEAT_CHECK_TIMEOUT_MS,
} from '../constants.js';

test('initial state has no heat check active', () => {
    const s = initialHeatCheckState();
    assert.equal(s.active, false);
    assert.equal(s.lastSwishTimestamp, null);
    assert.deepEqual(s.recentSwishTimestamps, []);
});

test('single swish gives base points, heat check not yet active for THIS shot', () => {
    const r = applyShotResult(initialHeatCheckState(), 'swish', 1000);
    assert.equal(r.points, POINTS_SWISH);
    assert.equal(r.heatCheckActive, false);
    assert.equal(r.roundEnds, false);
});

test('three swishes within 10s activate heat check; bonus applies from 4th swish onward', () => {
    let state = initialHeatCheckState();
    let r;
    r = applyShotResult(state, 'swish', 1000); state = r.state;
    r = applyShotResult(state, 'swish', 4000); state = r.state;
    r = applyShotResult(state, 'swish', 7000); state = r.state;
    // The 3rd swish itself does not get the bonus — heat check activates AFTER it
    assert.equal(r.points, POINTS_SWISH);
    assert.equal(state.active, true);
    // The 4th swish (within timeout of last) gets the bonus
    r = applyShotResult(state, 'swish', 8000); state = r.state;
    assert.equal(r.points, POINTS_HEAT_CHECK_SWISH);
    assert.equal(r.heatCheckActive, true);
});

test('rim_in basket scores but breaks heat check', () => {
    let state = initialHeatCheckState();
    let r;
    r = applyShotResult(state, 'swish', 1000); state = r.state;
    r = applyShotResult(state, 'swish', 4000); state = r.state;
    r = applyShotResult(state, 'rim_in', 5000); state = r.state;
    assert.equal(r.points, POINTS_RIM_IN);
    assert.equal(state.active, false);
    assert.equal(state.recentSwishTimestamps.length, 0);
});

test('bank_in basket scores but breaks heat check', () => {
    let state = initialHeatCheckState();
    let r;
    r = applyShotResult(state, 'swish', 1000); state = r.state;
    r = applyShotResult(state, 'swish', 4000); state = r.state;
    r = applyShotResult(state, 'bank_in', 5000); state = r.state;
    assert.equal(r.points, POINTS_BACKBOARD_BANK);
    assert.equal(state.active, false);
});

test('all miss types end the round and reset state', () => {
    for (const miss of ['rim_out', 'bank_out', 'airball']) {
        const r = applyShotResult(initialHeatCheckState(), miss, 1000);
        assert.equal(r.roundEnds, true, `${miss} should end round`);
        assert.equal(r.points, 0, `${miss} should award 0 points`);
        assert.equal(r.state.active, false);
        assert.deepEqual(r.state.recentSwishTimestamps, []);
    }
});

test('heat check expires if no swish within timeout', () => {
    let state = initialHeatCheckState();
    let r;
    r = applyShotResult(state, 'swish', 1000); state = r.state;
    r = applyShotResult(state, 'swish', 2000); state = r.state;
    r = applyShotResult(state, 'swish', 3000); state = r.state;
    assert.equal(state.active, true);
    // Past the timeout — next swish should NOT get the bonus
    const tooLate = 3000 + HEAT_CHECK_TIMEOUT_MS + 100;
    r = applyShotResult(state, 'swish', tooLate); state = r.state;
    assert.equal(r.points, POINTS_SWISH, 'past-timeout swish should be base points only');
});

test('swishes outside the trigger window do NOT activate heat check', () => {
    let state = initialHeatCheckState();
    let r;
    // First swish at t=1000, second at t=5000, third at t=13000.
    // The first is 12s before the third — outside the 10s window.
    // Only two qualifying swishes by the time the third lands.
    r = applyShotResult(state, 'swish', 1000); state = r.state;
    r = applyShotResult(state, 'swish', 5000); state = r.state;
    r = applyShotResult(state, 'swish', 13000); state = r.state;
    assert.equal(state.active, false, 'oldest swish should have aged out of the trigger window');
});

test('scoreAttempt computes total + per-shot breakdown', () => {
    const shots = [
        { result: 'swish', timestamp: 1000 },
        { result: 'swish', timestamp: 2000 },
        { result: 'swish', timestamp: 3000 },   // activates heat check
        { result: 'swish', timestamp: 4000 },   // first heat-check swish
        { result: 'rim_in', timestamp: 5000 },  // breaks the streak
        { result: 'airball', timestamp: 6000 }, // ends round
        { result: 'swish', timestamp: 7000 },   // should NOT be counted
    ];
    const { totalScore, breakdown } = scoreAttempt(shots);
    // 3 base swishes (6) + 1 heat-check swish (3) + 1 rim_in (1) + 0 for airball = 10
    assert.equal(totalScore, 10);
    assert.equal(breakdown.length, 6, 'breakdown should stop at the airball');
    assert.equal(breakdown[3].points, POINTS_HEAT_CHECK_SWISH);
    assert.equal(breakdown[5].roundEnds, true);
});

test('a single non-swish basket alone gives base points without activating heat check', () => {
    let state = initialHeatCheckState();
    let r;
    r = applyShotResult(state, 'rim_in', 1000); state = r.state;
    assert.equal(r.points, POINTS_RIM_IN);
    assert.equal(state.active, false);
    r = applyShotResult(state, 'bank_in', 2000); state = r.state;
    assert.equal(r.points, POINTS_BACKBOARD_BANK);
    assert.equal(state.active, false);
});

test('input state is not mutated', () => {
    const state = initialHeatCheckState();
    const stateCopy = JSON.parse(JSON.stringify(state));
    applyShotResult(state, 'swish', 1000);
    assert.deepEqual(state, stateCopy, 'input state should be unchanged');
});
