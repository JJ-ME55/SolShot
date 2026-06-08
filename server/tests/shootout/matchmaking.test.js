/**
 * Tests for Shootout Quick Play matchmaking queue (Phase MP-expansion,
 * 2026-06-08). Pure in-memory module — no Mongo, no socket.io.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    joinQueue, cancelQueue, scrubBySocket, tryMatch, _peek, _clearAll,
} from '../../services/games/shootout/matchmaking.js';

function fresh() { _clearAll(); }

test('joinQueue: first 1v1 entry is queued, position 1', () => {
    fresh();
    const res = joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 'a' });
    assert.equal(res.queued, true);
    assert.equal(res.position, 1);
    assert.equal(res.cap, 2);
});

test('joinQueue: 1v1 cap=2 → second entry matches, both returned', () => {
    fresh();
    joinQueue({ mode: '1v1', telegramUserId: 1, telegramUsername: 'a', socketId: 's1' });
    const res = joinQueue({ mode: '1v1', telegramUserId: 2, telegramUsername: 'b', socketId: 's2' });
    assert.equal(res.matched, true);
    assert.equal(res.members.length, 2);
    assert.equal(res.members[0].telegramUserId, 1);
    assert.equal(res.members[1].telegramUserId, 2);
    // Queue is now empty
    assert.equal(_peek('1v1').length, 0);
});

test('joinQueue: 2v2 needs 4 entries before matching', () => {
    fresh();
    for (let i = 1; i <= 3; i += 1) {
        const r = joinQueue({ mode: '2v2', telegramUserId: i, socketId: 's' + i });
        assert.equal(r.queued, true);
        assert.equal(r.position, i);
    }
    const r4 = joinQueue({ mode: '2v2', telegramUserId: 4, socketId: 's4' });
    assert.equal(r4.matched, true);
    assert.equal(r4.members.length, 4);
});

test('joinQueue: rejoining same mode is idempotent (still queued, no dup)', () => {
    fresh();
    joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 's1' });
    const r = joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 's1' });
    assert.equal(r.queued, true);
    assert.equal(r.position, 1, 'still position 1 — re-add moved them to tail of 1-len queue');
    assert.equal(_peek('1v1').length, 1, 'no duplicate');
});

test('joinQueue: switching mode removes from old queue', () => {
    fresh();
    joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 's' });
    joinQueue({ mode: '2v2', telegramUserId: 1, socketId: 's' });
    assert.equal(_peek('1v1').length, 0);
    assert.equal(_peek('2v2').length, 1);
});

test('cancelQueue: removes user', () => {
    fresh();
    joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 's' });
    const r = cancelQueue({ telegramUserId: 1 });
    assert.equal(r.removed, true);
    assert.equal(_peek('1v1').length, 0);
});

test('cancelQueue: non-queued user returns removed:false (no throw)', () => {
    fresh();
    const r = cancelQueue({ telegramUserId: 999 });
    assert.equal(r.removed, false);
});

test('scrubBySocket: drops any user with that socketId across all queues', () => {
    fresh();
    joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 'shared' });
    joinQueue({ mode: '2v2', telegramUserId: 2, socketId: 'other' });
    joinQueue({ mode: '2v2', telegramUserId: 3, socketId: 'shared' });
    const r = scrubBySocket({ socketId: 'shared' });
    assert.deepEqual(r.removed.sort(), [1, 3]);
    assert.equal(_peek('1v1').length, 0);
    assert.equal(_peek('2v2').length, 1, 'user 2 with other socket is unaffected');
});

test('tryMatch: returns null when queue < cap, group when >= cap', () => {
    fresh();
    assert.equal(tryMatch('1v1'), null);
    joinQueue({ mode: '1v1', telegramUserId: 1, socketId: 's1' });
    // tryMatch above ran on a fresh queue; the joinQueue here is fresh
    // and only adds 1 — still < cap
    assert.equal(tryMatch('1v1'), null);
    joinQueue({ mode: '1v1', telegramUserId: 2, socketId: 's2' });
    // joinQueue auto-matched and drained — so tryMatch finds nothing
    assert.equal(tryMatch('1v1'), null);
});

test('joinQueue: invalid mode errors invalid_mode', () => {
    fresh();
    const r = joinQueue({ mode: '5v5', telegramUserId: 1 });
    assert.equal(r.error, 'invalid_mode');
});

test('joinQueue: missing telegramUserId errors no_user', () => {
    fresh();
    const r = joinQueue({ mode: '1v1' });
    assert.equal(r.error, 'no_user');
});
