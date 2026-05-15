import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyShot, initialRunState, isGoal, isMiss } from '../rules.js';
import { LIVES_START, LIVES_MAX } from '../constants.js';


// ============================================================
// === Result classification ===
// ============================================================

test('isGoal: recognises all four goal outcomes', () => {
    assert.equal(isGoal('goal'), true);
    assert.equal(isGoal('goal_plus10'), true);
    assert.equal(isGoal('goal_heart'), true);
    assert.equal(isGoal('goal_plus10_heart'), true);
});

test('isGoal: rejects misses', () => {
    assert.equal(isGoal('blocked'), false);
    assert.equal(isGoal('over'), false);
    assert.equal(isGoal('wide'), false);
    assert.equal(isGoal('short'), false);
    assert.equal(isGoal('post'), false);
    assert.equal(isGoal('invalid'), false);
});

test('isMiss: recognises all miss outcomes', () => {
    assert.equal(isMiss('blocked'), true);
    assert.equal(isMiss('over'), true);
    assert.equal(isMiss('wide'), true);
    assert.equal(isMiss('short'), true);
    assert.equal(isMiss('post'), true);
});

test('isMiss: rejects goals and invalid', () => {
    assert.equal(isMiss('goal'), false);
    assert.equal(isMiss('goal_plus10'), false);
    assert.equal(isMiss('invalid'), false);
});


// ============================================================
// === Initial state ===
// ============================================================

test('initialRunState: starts with full lives, zero score', () => {
    const s = initialRunState();
    assert.equal(s.score, 0);
    assert.equal(s.lives, LIVES_START);
    assert.equal(s.goalCount, 0);
    assert.equal(s.shotsTaken, 0);
    assert.equal(s.runEnded, false);
});


// ============================================================
// === Goal scoring ===
// ============================================================

test('applyShot: plain goal → +1 score, +1 goal, lives unchanged', () => {
    const start = initialRunState();
    const r = applyShot(start, 'goal');
    assert.equal(r.scoreDelta, 1);
    assert.equal(r.livesDelta, 0);
    assert.equal(r.state.score, 1);
    assert.equal(r.state.lives, LIVES_START);
    assert.equal(r.state.goalCount, 1);
    assert.equal(r.state.shotsTaken, 1);
    assert.equal(r.state.runEnded, false);
});

test('applyShot: goal_plus10 → +11 score, +1 goal', () => {
    const r = applyShot(initialRunState(), 'goal_plus10');
    assert.equal(r.scoreDelta, 11);
    assert.equal(r.state.score, 11);
    assert.equal(r.state.goalCount, 1);
});

test('applyShot: goal_heart at full lives → +1 score, lives stays at max', () => {
    // initialRunState gives lives = LIVES_START which IS LIVES_MAX.
    const start = initialRunState();
    assert.equal(start.lives, LIVES_MAX);
    const r = applyShot(start, 'goal_heart');
    assert.equal(r.scoreDelta, 1);
    assert.equal(r.livesDelta, 0, 'heart at max should not exceed cap');
    assert.equal(r.state.lives, LIVES_MAX);
});

test('applyShot: goal_heart when not at max → +1 life', () => {
    const start = { ...initialRunState(), lives: 3 };
    const r = applyShot(start, 'goal_heart');
    assert.equal(r.scoreDelta, 1);
    assert.equal(r.livesDelta, 1);
    assert.equal(r.state.lives, 4);
});

test('applyShot: goal_plus10_heart → +11 score AND +1 life (if not at max)', () => {
    const start = { ...initialRunState(), lives: 2 };
    const r = applyShot(start, 'goal_plus10_heart');
    assert.equal(r.scoreDelta, 11);
    assert.equal(r.livesDelta, 1);
    assert.equal(r.state.lives, 3);
    assert.equal(r.state.goalCount, 1);
});

test('applyShot: heart never raises lives above LIVES_MAX', () => {
    // Even from one below max, gain exactly 1.
    const start = { ...initialRunState(), lives: LIVES_MAX - 1 };
    const r = applyShot(start, 'goal_heart');
    assert.equal(r.state.lives, LIVES_MAX);
});


// ============================================================
// === Miss handling ===
// ============================================================

test('applyShot: blocked → -1 life, 0 score', () => {
    const r = applyShot(initialRunState(), 'blocked');
    assert.equal(r.scoreDelta, 0);
    assert.equal(r.livesDelta, -1);
    assert.equal(r.state.lives, LIVES_START - 1);
    assert.equal(r.state.goalCount, 0);
    assert.equal(r.state.shotsTaken, 1);
    assert.equal(r.state.runEnded, false);
});

test('applyShot: over → -1 life', () => {
    const r = applyShot(initialRunState(), 'over');
    assert.equal(r.livesDelta, -1);
});

test('applyShot: wide → -1 life', () => {
    const r = applyShot(initialRunState(), 'wide');
    assert.equal(r.livesDelta, -1);
});

test('applyShot: short → -1 life', () => {
    const r = applyShot(initialRunState(), 'short');
    assert.equal(r.livesDelta, -1);
});

test('applyShot: post → -1 life (per resolved design)', () => {
    // Per DESIGN.md "Resolved decisions" #2 — POST costs a life.
    const r = applyShot(initialRunState(), 'post');
    assert.equal(r.livesDelta, -1);
});


// ============================================================
// === Run end ===
// ============================================================

test('applyShot: run ends when lives reach 0', () => {
    let state = { ...initialRunState(), lives: 1 };
    const r = applyShot(state, 'blocked');
    assert.equal(r.state.lives, 0);
    assert.equal(r.state.runEnded, true);
    assert.equal(r.runEndedNow, true);
});

test('applyShot: no further deltas after run ends', () => {
    const ended = { ...initialRunState(), lives: 0, runEnded: true };
    const r = applyShot(ended, 'goal_plus10');
    assert.equal(r.scoreDelta, 0);
    assert.equal(r.livesDelta, 0);
    assert.equal(r.state, ended, 'state should be returned unchanged');
});

test('applyShot: lives never go negative', () => {
    const state = { ...initialRunState(), lives: 1 };
    const r = applyShot(state, 'blocked');
    assert.equal(r.state.lives, 0);
});


// ============================================================
// === Invalid result ===
// ============================================================

test('applyShot: invalid result is a no-op (no penalty)', () => {
    // The shotsTaken counter still increments since the player did
    // submit a shot, but score and lives are untouched.
    const r = applyShot(initialRunState(), 'invalid');
    assert.equal(r.scoreDelta, 0);
    assert.equal(r.livesDelta, 0);
    assert.equal(r.state.score, 0);
    assert.equal(r.state.lives, LIVES_START);
    assert.equal(r.state.shotsTaken, 1);
});


// ============================================================
// === Accumulation across multiple shots ===
// ============================================================

test('applyShot: accumulates score and goal count across shots', () => {
    let state = initialRunState();
    state = applyShot(state, 'goal').state;
    state = applyShot(state, 'goal_plus10').state;
    state = applyShot(state, 'blocked').state;
    state = applyShot(state, 'goal').state;

    assert.equal(state.score, 1 + 11 + 0 + 1);
    assert.equal(state.lives, LIVES_START - 1);  // one miss
    assert.equal(state.goalCount, 3);             // three goals
    assert.equal(state.shotsTaken, 4);
});

test('applyShot: realistic 10-shot run with heart refill — does NOT end', () => {
    let state = initialRunState();
    const results = ['goal', 'goal_plus10', 'blocked', 'goal_heart', 'wide',
                     'goal', 'blocked', 'goal_plus10', 'over', 'post'];
    let runEndedAt = -1;
    for (let i = 0; i < results.length; i++) {
        const r = applyShot(state, results[i]);
        state = r.state;
        if (r.runEndedNow && runEndedAt === -1) runEndedAt = i;
    }
    // 5 misses (blocked, wide, blocked, over, post) drain 5 lives,
    // but the heart shot refilled 1, so net -4. Lives 5→1, run NOT ended.
    assert.equal(runEndedAt, -1, 'run should not have ended yet');
    assert.equal(state.lives, 1);
    assert.equal(state.runEnded, false);
    // Score: 1 + 11 + 0 + 1 + 0 + 1 + 0 + 11 + 0 + 0 = 25.
    assert.equal(state.score, 25);
    // 4 goals (goal, goal_plus10, goal_heart, goal, goal_plus10 — that's 5).
    assert.equal(state.goalCount, 5);
    assert.equal(state.shotsTaken, 10);
});

test('applyShot: realistic miss-only run terminates on 5th miss', () => {
    let state = initialRunState();
    const results = ['blocked', 'over', 'wide', 'short', 'post'];
    let runEndedAt = -1;
    for (let i = 0; i < results.length; i++) {
        const r = applyShot(state, results[i]);
        state = r.state;
        if (r.runEndedNow && runEndedAt === -1) runEndedAt = i;
    }
    assert.equal(runEndedAt, 4, 'run ends on the 5th miss (post)');
    assert.equal(state.runEnded, true);
    assert.equal(state.lives, 0);
    assert.equal(state.score, 0);
    assert.equal(state.goalCount, 0);
});


// ============================================================
// === Purity ===
// ============================================================

test('applyShot: does not mutate input state', () => {
    const original = initialRunState();
    const snapshot = JSON.parse(JSON.stringify(original));
    applyShot(original, 'goal_plus10');
    assert.deepEqual(original, snapshot, 'input state must not be mutated');
});
