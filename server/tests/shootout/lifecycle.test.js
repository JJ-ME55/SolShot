/**
 * Tests for Shootout lifecycle.createMatchFromLobby — Task E.1.
 *
 * The lifecycle layer turns a STARTING-state lobby (produced by
 * lobbyService.startMatch) into a match descriptor. The socket layer
 * (E.3) feeds that descriptor into ShootoutRunner and emits match:start
 * to each member-socket individually.
 *
 * These are pure-function tests — no Mongo, no socket.io.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createMatchFromLobby } from '../../services/games/shootout/lifecycle.js';

// Minimal lobby shape — only the fields lifecycle reads.
//
// Phase C (2026-06-08): lifecycle.createMatchFromLobby no longer
// assigns slot or team itself; it reads m.slot + m.team that
// lobbyService.startMatch has already set. Tests that don't go
// through startMatch must pre-populate those fields, so this helper
// applies a sensible default (red→even slots, blue→odd) when the
// caller doesn't override.
function makeLobby(overrides = {}) {
    const base = {
        lobbyId: 'lobby-L1',
        mode: '1v1',
        cap: 2,
        members: [
            { telegramUserId: 1, displayName: '@host' },
            { telegramUserId: 2, displayName: '@guest' },
        ],
        ...overrides,
    };
    base.members = base.members.map((m, i) => ({
        slot: m.slot !== undefined ? m.slot : i,
        team: m.team !== undefined ? m.team : (i % 2 === 0 ? 'red' : 'blue'),
        ...m,
    }));
    return base;
}

test('createMatchFromLobby — returns { ok, match } shape', async () => {
    const res = await createMatchFromLobby({ lobby: makeLobby() });
    assert.equal(res.ok, true);
    assert.ok(res.match, 'expected match descriptor');
    assert.ok(res.match.matchId);
    assert.equal(res.match.lobbyId, 'lobby-L1');
    assert.equal(res.match.mode, '1v1');
    assert.ok(Array.isArray(res.match.members));
    assert.ok(Number.isFinite(res.match.startedAt));
});

test('createMatchFromLobby — matchId has match- prefix and is fresh per call', async () => {
    const a = await createMatchFromLobby({ lobby: makeLobby() });
    const b = await createMatchFromLobby({ lobby: makeLobby() });
    assert.match(a.match.matchId, /^match-/);
    assert.match(b.match.matchId, /^match-/);
    assert.notEqual(a.match.matchId, b.match.matchId, 'each call mints a new id');
});

test('createMatchFromLobby — slot 0..n-1 by lobby join order (1v1)', async () => {
    const res = await createMatchFromLobby({ lobby: makeLobby() });
    assert.equal(res.match.members.length, 2);
    assert.equal(res.match.members[0].slot, 0);
    assert.equal(res.match.members[1].slot, 1);
    // Slots are unique
    const slots = res.match.members.map(m => m.slot);
    assert.equal(new Set(slots).size, slots.length, 'slots must be unique');
});

test('createMatchFromLobby — slot 0..n-1 by lobby join order (2v2)', async () => {
    const lobby = makeLobby({
        mode: '2v2',
        cap: 4,
        members: [
            { telegramUserId: 1, displayName: '@a' },
            { telegramUserId: 2, displayName: '@b' },
            { telegramUserId: 3, displayName: '@c' },
            { telegramUserId: 4, displayName: '@d' },
        ],
    });
    const res = await createMatchFromLobby({ lobby });
    assert.deepEqual(res.match.members.map(m => m.slot), [0, 1, 2, 3]);
});

test('createMatchFromLobby — cap propagates from lobby (1v1=2)', async () => {
    const res = await createMatchFromLobby({ lobby: makeLobby({ cap: 2 }) });
    assert.equal(res.match.cap, 2, 'match.cap must mirror lobby.cap for bot-fill');
});

test('createMatchFromLobby — cap propagates from lobby (2v2=4)', async () => {
    const lobby = makeLobby({
        mode: '2v2',
        cap: 4,
        members: [
            { telegramUserId: 1, displayName: '@a' },
            { telegramUserId: 2, displayName: '@b' },
        ],
    });
    const res = await createMatchFromLobby({ lobby });
    assert.equal(res.match.cap, 4, 'cap reflects mode-cap, not members.length');
});

test('createMatchFromLobby — teams alternate red/blue starting from slot 0', async () => {
    const lobby = makeLobby({
        mode: '2v2',
        members: [
            { telegramUserId: 1, displayName: '@a' },
            { telegramUserId: 2, displayName: '@b' },
            { telegramUserId: 3, displayName: '@c' },
            { telegramUserId: 4, displayName: '@d' },
        ],
    });
    const res = await createMatchFromLobby({ lobby });
    assert.deepEqual(
        res.match.members.map(m => m.team),
        ['red', 'blue', 'red', 'blue'],
    );
});

test('createMatchFromLobby — 1v1 has red vs blue (slot 0 red, slot 1 blue)', async () => {
    const res = await createMatchFromLobby({ lobby: makeLobby() });
    assert.equal(res.match.members[0].team, 'red');
    assert.equal(res.match.members[1].team, 'blue');
});

test('createMatchFromLobby — telegramUserId and displayName carry through from lobby', async () => {
    const lobby = makeLobby({
        members: [
            { telegramUserId: 11, displayName: '@alpha' },
            { telegramUserId: 22, displayName: '@beta' },
        ],
    });
    const res = await createMatchFromLobby({ lobby });
    assert.equal(res.match.members[0].telegramUserId, 11);
    assert.equal(res.match.members[0].displayName, '@alpha');
    assert.equal(res.match.members[1].telegramUserId, 22);
    assert.equal(res.match.members[1].displayName, '@beta');
});
