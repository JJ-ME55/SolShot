/**
 * Tests for shootout stats persistence — Day 3 / Task 4.
 *
 * Covers:
 *   - persistMatchStats upserts each human player with correct $inc
 *   - winning team gets wins+=1, losing team gets losses+=1
 *   - bots and telegramUserId===0 are skipped
 *   - rawKD + rankScore recomputed after the increment
 *   - draw (matchWinner=null) → wins=0, losses=0 for everyone
 *
 * Mocking pattern: same node:test mock.method approach used elsewhere
 * in the shootout suite — ShootoutStats.findOneAndUpdate is a mutable
 * Mongoose static, swap it out for a recorder.
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';

import ShootoutStats from '../../models/ShootoutStats.js';
import { persistMatchStats } from '../../services/games/shootout/stats.js';

// Recorder for findOneAndUpdate calls. Index 0 = first ($inc), index 1
// = recompute ($set rawKD/rankScore). The recorder also returns a
// fake doc the SUT reads to compute rawKD.
function setupMock({ docByUser = {}, defaultTotals = { totalKills: 0, totalDeaths: 0 } } = {}) {
    const calls = [];
    const fauMock = mock.method(ShootoutStats, 'findOneAndUpdate', async (query, update, opts) => {
        calls.push({ query, update, opts });
        const uid = query?.telegramUserId;
        // On the first call (update has $inc), build the post-increment doc
        // — the SUT calls this once with $inc, then again with $set
        // rawKD/rankScore. We always return a plausible doc so the second
        // pass works too.
        if (update?.$inc) {
            const prev = docByUser[uid] || { ...defaultTotals };
            const next = {
                telegramUserId: uid,
                totalKills:   (prev.totalKills   || 0) + (update.$inc.totalKills   || 0),
                totalDeaths:  (prev.totalDeaths  || 0) + (update.$inc.totalDeaths  || 0),
                totalMatches: (prev.totalMatches || 0) + (update.$inc.totalMatches || 0),
                wins:         (prev.wins         || 0) + (update.$inc.wins         || 0),
                losses:       (prev.losses       || 0) + (update.$inc.losses       || 0),
            };
            docByUser[uid] = next;
            return next;
        }
        // $set-only call (rawKD/rankScore recompute) — return whatever
        // we have or empty.
        return docByUser[uid] || null;
    });
    return { calls, fauMock, docByUser };
}

// ── Happy path ───────────────────────────────────────────────────────

test('persistMatchStats: upserts each human player with $inc kills/deaths/matches', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 101, displayName: '@a', team: 'red',  isBot: false, kills: 5, deaths: 2 },
                { telegramUserId: 202, displayName: '@b', team: 'blue', isBot: false, kills: 1, deaths: 5 },
            ],
        });
        // Expect 2 inc-upserts + 2 set-upserts = 4 total
        assert.equal(calls.length, 4);

        const incCalls = calls.filter(c => c.update?.$inc);
        assert.equal(incCalls.length, 2);

        const callA = incCalls.find(c => c.query.telegramUserId === 101);
        const callB = incCalls.find(c => c.query.telegramUserId === 202);
        assert.ok(callA && callB);
        assert.equal(callA.update.$inc.totalKills, 5);
        assert.equal(callA.update.$inc.totalDeaths, 2);
        assert.equal(callA.update.$inc.totalMatches, 1);
        assert.equal(callB.update.$inc.totalMatches, 1);

        // Upsert options
        assert.equal(callA.opts?.upsert, true);
    } finally {
        fauMock.mock.restore();
    }
});

test('persistMatchStats: winners get wins+=1, losers get losses+=1', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red',  isBot: false, kills: 3, deaths: 1 },
                { telegramUserId: 2, team: 'blue', isBot: false, kills: 1, deaths: 3 },
            ],
        });
        const incA = calls.find(c => c.query.telegramUserId === 1 && c.update?.$inc);
        const incB = calls.find(c => c.query.telegramUserId === 2 && c.update?.$inc);
        assert.equal(incA.update.$inc.wins, 1);
        assert.equal(incA.update.$inc.losses, 0);
        assert.equal(incB.update.$inc.wins, 0);
        assert.equal(incB.update.$inc.losses, 1);
    } finally {
        fauMock.mock.restore();
    }
});

test('persistMatchStats: draw (matchWinner=null) → wins=0, losses=0 for all', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: null,
            players: [
                { telegramUserId: 1, team: 'red',  isBot: false, kills: 2, deaths: 2 },
                { telegramUserId: 2, team: 'blue', isBot: false, kills: 2, deaths: 2 },
            ],
        });
        const incs = calls.filter(c => c.update?.$inc);
        for (const c of incs) {
            assert.equal(c.update.$inc.wins, 0);
            assert.equal(c.update.$inc.losses, 0);
            assert.equal(c.update.$inc.totalMatches, 1);
        }
    } finally {
        fauMock.mock.restore();
    }
});

// ── Bot / dummy filtering ────────────────────────────────────────────

test('persistMatchStats: skips bots', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red', isBot: false, kills: 4, deaths: 1 },
                { telegramUserId: 0, team: 'blue', isBot: true,  kills: 1, deaths: 4 },
            ],
        });
        // Only 1 human → 2 calls (inc + recompute)
        assert.equal(calls.length, 2);
        const incCalls = calls.filter(c => c.update?.$inc);
        assert.equal(incCalls.length, 1);
        assert.equal(incCalls[0].query.telegramUserId, 1);
    } finally {
        fauMock.mock.restore();
    }
});

test('persistMatchStats: skips telegramUserId=0 (placeholder bot id)', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 0, team: 'red',  isBot: false, kills: 1, deaths: 1 },
            ],
        });
        assert.equal(calls.length, 0);
    } finally {
        fauMock.mock.restore();
    }
});

// ── rawKD / rankScore ────────────────────────────────────────────────

test('persistMatchStats: recomputes rawKD = kills / max(deaths, 1) after upsert', async () => {
    const { calls, fauMock } = setupMock({
        docByUser: {
            // PRE-upsert state. setupMock applies the test's $inc on
            // top before returning the post-upsert doc. So the
            // post-upsert state used to compute rawKD/rankScore is
            // 5+3=8 kills, 2+1=3 deaths, 1+1=2 wins (won the round).
            1: { totalKills: 5, totalDeaths: 2, wins: 1 },
        },
    });
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red', isBot: false, kills: 3, deaths: 1 },
            ],
        });
        const setCall = calls.find(c => c.update?.$set?.rawKD != null);
        assert.ok(setCall, 'expected a $set rawKD call');
        // rawKD = 8 / max(3,1) = 2.666...
        assert.equal(setCall.update.$set.rawKD, 8 / 3);
        // Wins-weighted KDR (Fish's formula, 2026-06-08):
        //   rankScore = totalKills - 0.5*totalDeaths + 100*wins
        //             = 8 - 0.5*3 + 100*2  =  206.5
        assert.equal(setCall.update.$set.rankScore, 8 - 0.5 * 3 + 100 * 2);
    } finally {
        fauMock.mock.restore();
    }
});

test('persistMatchStats: rankScore = kills - 0.5*deaths + 100*wins (wins-weighted KDR)', async () => {
    // Verify the wins-weighted formula isolated from rawKD. Two
    // scenarios that read the same K/D but differ in wins should
    // produce wildly different rankScores — the whole point of
    // weighting wins heavily.
    const { calls, fauMock } = setupMock({
        docByUser: {
            // PRE-upsert. After this match's 1K/0D/+1W (red wins),
            // player 1 ends at 11K/10D/10W; player 2 (blue) ends at
            // 11K/10D/1W.
            1: { telegramUserId: 1, totalKills: 10, totalDeaths: 10, wins:  9 },
            2: { telegramUserId: 2, totalKills: 10, totalDeaths: 10, wins:  1 },
        },
    });
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red',  isBot: false, kills: 1, deaths: 0 },
                { telegramUserId: 2, team: 'blue', isBot: false, kills: 1, deaths: 0 },
            ],
        });
        const setCalls = calls.filter(c => c.update?.$set?.rankScore != null);
        const byUser = Object.fromEntries(setCalls.map(c => [c.query.telegramUserId, c.update.$set.rankScore]));
        // Player 1: 11K - 5D + 100*10W = 1006
        assert.equal(byUser[1], 11 - 0.5 * 10 + 100 * 10);
        // Player 2: 11K - 5D + 100*1W  =  106
        assert.equal(byUser[2], 11 - 0.5 * 10 + 100 * 1);
        assert.ok(byUser[1] > byUser[2] * 5, 'wins dominate the score');
    } finally {
        fauMock.mock.restore();
    }
});

test('persistMatchStats: rawKD uses max(deaths, 1) so 0-death is finite', async () => {
    const { calls, fauMock } = setupMock();
    try {
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red', isBot: false, kills: 4, deaths: 0 },
            ],
        });
        const setCall = calls.find(c => c.update?.$set?.rawKD != null);
        // 4 / max(0, 1) = 4
        assert.equal(setCall.update.$set.rawKD, 4);
    } finally {
        fauMock.mock.restore();
    }
});

// ── Robustness ───────────────────────────────────────────────────────

test('persistMatchStats: returns empty + does not throw on missing players array', async () => {
    const res = await persistMatchStats({ matchWinner: 'red' });
    assert.deepEqual(res, []);
});

test('persistMatchStats: swallows Mongo errors per-player (does not throw)', async () => {
    const fauMock = mock.method(ShootoutStats, 'findOneAndUpdate', async () => {
        throw new Error('mongo dead');
    });
    try {
        // Must not reject — the runner shutdown depends on it.
        await persistMatchStats({
            matchWinner: 'red',
            players: [
                { telegramUserId: 1, team: 'red', isBot: false, kills: 1, deaths: 1 },
            ],
        });
    } finally {
        fauMock.mock.restore();
    }
});
