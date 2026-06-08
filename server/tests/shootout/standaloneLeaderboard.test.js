/**
 * Tests for the Shootout session-auth minter.
 *
 * Auth-only — the standalone Shootout client receives a JWT via
 * ?session= in the launch URL (minted either by arcadeBot.js's
 * /shootout command or by the /api/arcade/mint-session endpoint for
 * web Privy users), reads the `tg` claim client-side for display,
 * and the existing shootout:lobby:* / shootout:input wire trusts
 * the telegramUserId from the payload. The server-side verifySession
 * is currently only exercised by these tests; future wagering-related
 * endpoints will pull it in.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import jwt from 'jsonwebtoken';
import { mintSession, verifySession } from '../../services/games/shootout-standalone/standaloneLeaderboard.js';

test('mintSession + verifySession round-trip preserves payload', () => {
    const token = mintSession({
        telegramUserId: 12345,
        telegramUsername: 'fish',
        firstName: 'Jacob',
    });
    assert.equal(typeof token, 'string');
    assert.ok(token.split('.').length === 3, 'JWT has 3 segments');
    const decoded = verifySession(token);
    assert.deepEqual(decoded, {
        telegramUserId: 12345,
        telegramUsername: 'fish',
        firstName: 'Jacob',
    });
});

test('mintSession with only telegramUserId still verifies', () => {
    const token = mintSession({ telegramUserId: 9999 });
    const decoded = verifySession(token);
    assert.deepEqual(decoded, {
        telegramUserId: 9999,
        telegramUsername: null,
        firstName: null,
    });
});

test('mintSession requires numeric telegramUserId', () => {
    assert.throws(() => mintSession({}), /telegramUserId required/);
    assert.throws(() => mintSession({ telegramUserId: 'abc' }), /telegramUserId required/);
    assert.throws(() => mintSession({ telegramUserId: null }), /telegramUserId required/);
});

test('verifySession rejects garbage tokens', () => {
    assert.throws(() => verifySession(null), /session token required/);
    assert.throws(() => verifySession(''), /session token required/);
    assert.throws(() => verifySession('not.a.jwt'), /invalid token|jwt malformed/);
});

test('verifySession rejects a token signed by a different issuer', () => {
    // Touch the public mintSession once so the dev secret is initialised
    // on process.env (used to forge a wrong-issuer JWT with the same key).
    mintSession({ telegramUserId: 1 });
    const forged = jwt.sign(
        { tg: 1 },
        process.env._SHOOTOUT_DEV_SECRET,
        { algorithm: 'HS256', issuer: 'arcade-bot:basketball', expiresIn: '7d' },
    );
    assert.throws(() => verifySession(forged), /jwt issuer invalid/);
});

test('verifySession rejects an expired token', () => {
    mintSession({ telegramUserId: 1 });
    const expired = jwt.sign(
        { tg: 42 },
        process.env._SHOOTOUT_DEV_SECRET,
        { algorithm: 'HS256', issuer: 'arcade-bot:shootout', expiresIn: -1 },
    );
    assert.throws(() => verifySession(expired), /jwt expired/);
});
