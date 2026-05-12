import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    emptyBestScores, applyAttemptScore, getLeader, tiedTopScorers, leaderChanged,
} from '../leaderboard.js';

test('empty leaderboard has no leader', () => {
    assert.equal(getLeader(emptyBestScores()), null);
    assert.deepEqual(tiedTopScorers(emptyBestScores()), []);
});

test('applyAttemptScore on empty leaderboard: improves', () => {
    const { bestScores, improved } = applyAttemptScore(emptyBestScores(), 'A', 10, 'a1', 1000);
    assert.equal(improved, true);
    assert.equal(bestScores.A.score, 10);
    assert.equal(bestScores.A.attemptId, 'a1');
    assert.equal(bestScores.A.reachedAt, 1000);
});

test('applyAttemptScore does not improve same score', () => {
    const start = { A: { score: 10, attemptId: 'a1', reachedAt: 1000 } };
    const { bestScores, improved } = applyAttemptScore(start, 'A', 10, 'a2', 2000);
    assert.equal(improved, false);
    // Same reference returned — no copy made when no improvement
    assert.equal(bestScores, start);
});

test('applyAttemptScore improves on strictly higher score', () => {
    const start = { A: { score: 10, attemptId: 'a1', reachedAt: 1000 } };
    const { bestScores, improved } = applyAttemptScore(start, 'A', 15, 'a2', 2000);
    assert.equal(improved, true);
    assert.equal(bestScores.A.score, 15);
    // Input not mutated
    assert.equal(start.A.score, 10);
});

test('applyAttemptScore: lower score does not overwrite', () => {
    const start = { A: { score: 10, attemptId: 'a1', reachedAt: 1000 } };
    const { bestScores, improved } = applyAttemptScore(start, 'A', 5, 'a2', 2000);
    assert.equal(improved, false);
    assert.equal(bestScores.A.score, 10);
});

test('getLeader picks highest score', () => {
    const bs = {
        A: { score: 10, attemptId: 'a', reachedAt: 1000 },
        B: { score: 15, attemptId: 'b', reachedAt: 2000 },
        C: { score: 8, attemptId: 'c', reachedAt: 1500 },
    };
    const leader = getLeader(bs);
    assert.equal(leader.wallet, 'B');
    assert.equal(leader.score, 15);
});

test('getLeader tiebreak: earlier reachedAt wins', () => {
    const bs = {
        A: { score: 10, attemptId: 'a', reachedAt: 2000 },
        B: { score: 10, attemptId: 'b', reachedAt: 1000 },
    };
    const leader = getLeader(bs);
    assert.equal(leader.wallet, 'B');
});

test('tiedTopScorers returns all wallets at top score (sorted)', () => {
    const bs = {
        A: { score: 10, attemptId: 'a', reachedAt: 1000 },
        B: { score: 10, attemptId: 'b', reachedAt: 1000 },
        C: { score: 8, attemptId: 'c', reachedAt: 1500 },
    };
    assert.deepEqual(tiedTopScorers(bs), ['A', 'B']);
});

test('tiedTopScorers returns single for unique leader', () => {
    const bs = {
        A: { score: 15, attemptId: 'a', reachedAt: 1000 },
        B: { score: 10, attemptId: 'b', reachedAt: 1000 },
    };
    assert.deepEqual(tiedTopScorers(bs), ['A']);
});

test('leaderChanged true on first leader', () => {
    const next = { A: { score: 10, attemptId: 'a', reachedAt: 1000 } };
    assert.equal(leaderChanged(emptyBestScores(), next), true);
});

test('leaderChanged true on overtake', () => {
    const prev = { A: { score: 10, attemptId: 'a', reachedAt: 1000 } };
    const next = {
        A: { score: 10, attemptId: 'a', reachedAt: 1000 },
        B: { score: 15, attemptId: 'b', reachedAt: 2000 },
    };
    assert.equal(leaderChanged(prev, next), true);
});

test('leaderChanged false when leader unchanged', () => {
    const prev = {
        A: { score: 15, attemptId: 'a', reachedAt: 1000 },
        B: { score: 8, attemptId: 'b', reachedAt: 2000 },
    };
    const next = {
        A: { score: 15, attemptId: 'a', reachedAt: 1000 },
        B: { score: 12, attemptId: 'b', reachedAt: 3000 },
    };
    assert.equal(leaderChanged(prev, next), false);
});

test('leaderChanged false on both empty', () => {
    assert.equal(leaderChanged(emptyBestScores(), emptyBestScores()), false);
});
