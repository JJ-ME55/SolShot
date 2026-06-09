/**
 * Tests for shootout lobby map voting (Phase MP-maps, 2026-06-09).
 *
 * Pure tests on resolveMapVote (which counts votes + applies tie-
 * break order) — the voteMap mutator is exercised by integration
 * tests via the existing lobbyService mock harness.
 */

import { test, mock } from 'node:test';
import { strict as assert } from 'node:assert';

import { resolveMapVote, voteMap } from '../../services/games/shootout/lobbyService.js';
import ShootoutLobby from '../../models/ShootoutLobby.js';

test('resolveMapVote: empty votes → "arena" default', () => {
    assert.equal(resolveMapVote({ mapVotes: new Map() }), 'arena');
    assert.equal(resolveMapVote({ mapVotes: {} }), 'arena');
    assert.equal(resolveMapVote({}), 'arena');
});

test('resolveMapVote: single voter → their map', () => {
    const lobby = { mapVotes: new Map([['1', 'fun-house']]) };
    assert.equal(resolveMapVote(lobby), 'fun-house');
});

test('resolveMapVote: majority wins', () => {
    const lobby = {
        mapVotes: new Map([
            ['1', 'fun-house'],
            ['2', 'arena'],
            ['3', 'arena'],
        ]),
    };
    assert.equal(resolveMapVote(lobby), 'arena');
});

test('resolveMapVote: tie → VALID_MAPS order (arena before shipping-yard before fun-house)', () => {
    // arena & shipping-yard tied at 1
    const lobby = {
        mapVotes: new Map([
            ['1', 'arena'],
            ['2', 'shipping-yard'],
        ]),
    };
    assert.equal(resolveMapVote(lobby), 'arena');
    // shipping-yard & fun-house tied at 1
    const lobby2 = {
        mapVotes: new Map([
            ['1', 'shipping-yard'],
            ['2', 'fun-house'],
        ]),
    };
    assert.equal(resolveMapVote(lobby2), 'shipping-yard');
});

test('resolveMapVote: plain object (lean() result) → same as Map', () => {
    const lobby = {
        mapVotes: { '1': 'fun-house', '2': 'fun-house', '3': 'arena' },
    };
    assert.equal(resolveMapVote(lobby), 'fun-house');
});

test('voteMap: invalid mapId rejected', async () => {
    const res = await voteMap({ lobbyId: 'L1', telegramUserId: 1, mapId: 'bogus' });
    assert.equal(res.error, 'invalid_map');
});

test('voteMap: lobby not found → lobby_not_found', async () => {
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => null);
    try {
        const res = await voteMap({ lobbyId: 'gone', telegramUserId: 1, mapId: 'arena' });
        assert.equal(res.error, 'lobby_not_found');
    } finally {
        findOne.mock.restore();
    }
});

test('voteMap: not in lobby → not_in_lobby', async () => {
    const fakeLobby = {
        lobbyId: 'L1', state: 'OPEN',
        members: [{ telegramUserId: 5 }],
        mapVotes: new Map(),
        save: async () => {},
    };
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => fakeLobby);
    try {
        const res = await voteMap({ lobbyId: 'L1', telegramUserId: 99, mapId: 'arena' });
        assert.equal(res.error, 'not_in_lobby');
    } finally {
        findOne.mock.restore();
    }
});

test('voteMap: valid vote stored', async () => {
    const fakeLobby = {
        lobbyId: 'L1', state: 'OPEN',
        members: [{ telegramUserId: 5 }],
        mapVotes: new Map(),
        save: async () => {},
        toObject() { return { ...this, mapVotes: Object.fromEntries(this.mapVotes) }; },
    };
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => fakeLobby);
    try {
        const res = await voteMap({ lobbyId: 'L1', telegramUserId: 5, mapId: 'fun-house' });
        assert.equal(res.ok, true);
        assert.equal(fakeLobby.mapVotes.get('5'), 'fun-house');
    } finally {
        findOne.mock.restore();
    }
});

test('voteMap: null mapId clears vote', async () => {
    const fakeLobby = {
        lobbyId: 'L1', state: 'OPEN',
        members: [{ telegramUserId: 5 }],
        mapVotes: new Map([['5', 'arena']]),
        save: async () => {},
        toObject() { return { ...this, mapVotes: Object.fromEntries(this.mapVotes) }; },
    };
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => fakeLobby);
    try {
        const res = await voteMap({ lobbyId: 'L1', telegramUserId: 5, mapId: null });
        assert.equal(res.ok, true);
        assert.equal(fakeLobby.mapVotes.has('5'), false);
    } finally {
        findOne.mock.restore();
    }
});

test('voteMap: switching vote overwrites previous', async () => {
    const fakeLobby = {
        lobbyId: 'L1', state: 'OPEN',
        members: [{ telegramUserId: 5 }],
        mapVotes: new Map([['5', 'arena']]),
        save: async () => {},
        toObject() { return { ...this, mapVotes: Object.fromEntries(this.mapVotes) }; },
    };
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => fakeLobby);
    try {
        const res = await voteMap({ lobbyId: 'L1', telegramUserId: 5, mapId: 'fun-house' });
        assert.equal(res.ok, true);
        assert.equal(fakeLobby.mapVotes.get('5'), 'fun-house');
        assert.equal(fakeLobby.mapVotes.size, 1);
    } finally {
        findOne.mock.restore();
    }
});

test('voteMap: rejects vote when lobby state past READY (e.g. IN_MATCH)', async () => {
    const fakeLobby = {
        lobbyId: 'L1', state: 'IN_MATCH',
        members: [{ telegramUserId: 5 }],
        mapVotes: new Map(),
        save: async () => {},
    };
    const findOne = mock.method(ShootoutLobby, 'findOne', async () => fakeLobby);
    try {
        const res = await voteMap({ lobbyId: 'L1', telegramUserId: 5, mapId: 'arena' });
        assert.equal(res.error, 'lobby_not_voting');
    } finally {
        findOne.mock.restore();
    }
});
