/**
 * Tests for Shootout lobbyService.
 *
 * Phase C Checkpoint 1 — Tasks C.1 through C.6. Stateless wrappers
 * around ShootoutLobby Mongo ops. Mongo ops are mocked via node:test's
 * built-in `mock.method` — no live DB is required.
 *
 * Reference: server/services/games/critter-kart/lobbyService.js for
 * conventions (formatDisplayName, newId pattern, structured logger
 * calls). State-machine strings differ — Shootout uses
 * OPEN/FULL/READY/STARTING/IN_MATCH/CLOSED.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import ShootoutLobby from '../../models/ShootoutLobby.js';
import {
    generateLobbyCode,
} from '../../services/games/shootout/lobbyService.js';

// ── C.1 generateLobbyCode ────────────────────────────────────────────

test('generateLobbyCode: 6 chars, uppercase alphanumeric, no ambiguous (0/O/1/I/L)', () => {
    const codes = new Set();
    for (let i = 0; i < 500; i++) codes.add(generateLobbyCode());
    for (const c of codes) {
        assert.equal(c.length, 6);
        assert.match(c, /^[A-HJ-NP-Z2-9]+$/);  // no 0,O,1,I,L
        for (const ch of '01OIL') assert.equal(c.includes(ch), false);
    }
    assert.ok(codes.size > 400, 'codes should be reasonably unique (>400/500)');
});
