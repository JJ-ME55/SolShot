/**
 * Tests for Shootout Mongoose models.
 *
 * Phase C Checkpoint 1 — Tasks B.1, B.2, B.3.
 * Validates model exports, schema enums, defaults, and indexes.
 *
 * Reference: server/models/CritterKartLobby.js for sub-schema +
 * TTL-index conventions; tests cover the Phase C/D contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import ShootoutLobby, {
  LOBBY_MIN_CAP, LOBBY_MAX_CAP, LOBBY_MODES,
} from '../../models/ShootoutLobby.js';
import ShootoutMatch from '../../models/ShootoutMatch.js';

test('ShootoutLobby model loads + exports caps + modes', () => {
  assert.equal(LOBBY_MIN_CAP, 2);
  assert.equal(LOBBY_MAX_CAP, 4);
  assert.deepEqual(LOBBY_MODES, ['1v1', '2v2']);
  assert.equal(ShootoutLobby.modelName, 'ShootoutLobby');
});

test('ShootoutLobby schema has required state enum (OPEN/FULL/READY/STARTING/IN_MATCH/CLOSED)', () => {
  const statePath = ShootoutLobby.schema.path('state');
  assert.ok(statePath);
  const allowed = statePath.enumValues.sort();
  assert.deepEqual(allowed, ['CLOSED', 'FULL', 'IN_MATCH', 'OPEN', 'READY', 'STARTING']);
});

test('ShootoutLobby schema enforces mode enum (1v1, 2v2)', () => {
  const modePath = ShootoutLobby.schema.path('mode');
  assert.deepEqual(modePath.enumValues.sort(), ['1v1', '2v2']);
});

test('ShootoutLobby members default to empty array', () => {
  const lobby = new ShootoutLobby({
    lobbyId: 'lobby-test1', code: 'TEST01', mode: '1v1', cap: 2,
    hostTelegramUserId: 1,
  });
  assert.deepEqual(lobby.members, []);
  assert.equal(lobby.state, 'OPEN');
});

// -------- ShootoutMatch (Task B.2) --------

test('ShootoutMatch model loads', () => {
  assert.equal(ShootoutMatch.modelName, 'ShootoutMatch');
});

test('ShootoutMatch enforces mode enum (1v1, 2v2)', () => {
  const modePath = ShootoutMatch.schema.path('mode');
  assert.deepEqual(modePath.enumValues.sort(), ['1v1', '2v2']);
});

test('ShootoutMatch has players array + dcDuringMatch tracker', () => {
  const m = new ShootoutMatch({
    matchId: 'match-1', lobbyId: 'lobby-1', mode: '1v1',
  });
  assert.ok(Array.isArray(m.players));
  assert.deepEqual(m.dcDuringMatch, []);
  assert.equal(m.winnerTeam, null);
});
