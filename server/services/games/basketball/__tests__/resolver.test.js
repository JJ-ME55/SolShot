import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWindow } from '../resolver.js';
import {
    STATES, createMatch, recordDeposit, recordAttempt,
} from '../lifecycle.js';

function readyMatch({ scores = [], windowMs = 86_400_000, players } = {}) {
    let m = createMatch({
        matchId: 'basketball:m1',
        roomId: 'm1',
        players: players || [
            { wallet: 'A', telegramUserId: 'tg1' },
            { wallet: 'B', telegramUserId: 'tg2' },
        ],
        wagerLamports: 50_000_000,
        windowMs,
        now: 1000,
    });
    const wallets = (players || [{ wallet: 'A' }, { wallet: 'B' }]).map(p => p.wallet);
    for (const w of wallets) {
        m = recordDeposit(m, { wallet: w, txSig: `tx_${w}`, now: 1000 }).state;
    }
    for (const s of scores) {
        m = recordAttempt(m, s).state;
    }
    return m;
}

test('resolveWindow skips a still-open window', () => {
    const m = readyMatch();
    const r = resolveWindow(m, m.windowEnd - 1000);
    assert.equal(r.kind, 'skip');
    assert.equal(r.reason, 'window_not_closed');
});

test('resolveWindow settles unique leader', () => {
    const m = readyMatch({
        scores: [
            { wallet: 'A', finalScore: 15, attemptId: 'a1', endedAt: 2000 },
            { wallet: 'B', finalScore: 8, attemptId: 'b1', endedAt: 3000 },
        ],
    });
    const r = resolveWindow(m, m.windowEnd + 1);
    assert.equal(r.kind, 'settle');
    assert.equal(r.winnerWallet, 'A');
});

test('resolveWindow starts OT on tie', () => {
    const m = readyMatch({
        scores: [
            { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 },
            { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 },
        ],
    });
    const r = resolveWindow(m, m.windowEnd + 1);
    assert.equal(r.kind, 'start_ot');
    assert.equal(r.otRound, 1);
    assert.deepEqual(r.players, ['A', 'B']);
});

test('resolveWindow cancels match with no attempts', () => {
    const m = readyMatch();
    const r = resolveWindow(m, m.windowEnd + 1);
    assert.equal(r.kind, 'cancel');
    assert.equal(r.reason, 'no_attempts');
});

test('resolveWindow cancels a lobby that never reached window_active', () => {
    let m = createMatch({
        matchId: 'basketball:m2',
        roomId: 'm2',
        players: [
            { wallet: 'A', telegramUserId: 'tg1' },
            { wallet: 'B', telegramUserId: 'tg2' },
        ],
        wagerLamports: 50_000_000,
        windowMs: 86_400_000,
        now: 1000,
    });
    m = recordDeposit(m, { wallet: 'A', txSig: 'tx_A', now: 1000 }).state;
    // B never deposited
    const r = resolveWindow(m, 9_999_999);
    assert.equal(r.kind, 'cancel');
    assert.equal(r.reason, 'never_started');
});

test('resolveWindow skips a SETTLED match', () => {
    const m = {
        matchId: 'basketball:done',
        status: STATES.SETTLED,
        otRounds: [],
        windowEnd: 0,
    };
    const r = resolveWindow(m, 9_999_999);
    assert.equal(r.kind, 'skip');
    assert.equal(r.reason, 'already_terminal');
});

test('resolveWindow skips a CANCELLED match', () => {
    const m = {
        matchId: 'basketball:dead',
        status: STATES.CANCELLED,
        otRounds: [],
        windowEnd: 0,
    };
    const r = resolveWindow(m, 9_999_999);
    assert.equal(r.kind, 'skip');
    assert.equal(r.reason, 'already_terminal');
});
