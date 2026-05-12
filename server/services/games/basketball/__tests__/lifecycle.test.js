import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    STATES, createMatch, recordDeposit, recordAttempt,
    evaluateWindowDeadline, recordOTAttempt, evaluateOTRound,
    cancelMatch,
} from '../lifecycle.js';

function freshMatch(opts = {}) {
    return createMatch({
        matchId: 'basketball:m1',
        roomId: 'm1',
        players: opts.players || [
            { wallet: 'A', telegramUserId: 'tg1' },
            { wallet: 'B', telegramUserId: 'tg2' },
            { wallet: 'C', telegramUserId: 'tg3' },
        ],
        wagerLamports: 50_000_000,
        windowMs: 86_400_000,
        now: 1000,
    });
}

function depositAll(m, wallets) {
    for (const w of wallets) {
        m = recordDeposit(m, { wallet: w, txSig: `tx_${w}`, now: 1000 }).state;
    }
    return m;
}

test('createMatch starts in LOBBY with no deposits', () => {
    const m = freshMatch();
    assert.equal(m.status, STATES.LOBBY);
    assert.equal(m.players.length, 3);
    assert.equal(m.windowStart, null);
    assert.equal(m.windowEnd, null);
    assert.deepEqual(m.bestScores, {});
});

test('recordDeposit progresses LOBBY → AWAITING_DEPOSITS → WINDOW_ACTIVE', () => {
    let m = freshMatch();
    let r;
    r = recordDeposit(m, { wallet: 'A', txSig: 'tx1', now: 2000 }); m = r.state;
    assert.equal(m.status, STATES.AWAITING_DEPOSITS);
    assert.equal(r.actions.length, 0);

    r = recordDeposit(m, { wallet: 'B', txSig: 'tx2', now: 3000 }); m = r.state;
    assert.equal(m.status, STATES.AWAITING_DEPOSITS);

    r = recordDeposit(m, { wallet: 'C', txSig: 'tx3', now: 4000 }); m = r.state;
    assert.equal(m.status, STATES.WINDOW_ACTIVE);
    assert.equal(m.windowStart, 4000);
    assert.equal(m.windowEnd, 4000 + 86_400_000);
    assert.equal(r.actions[0].type, 'window_opened');
});

test('recordDeposit in non-deposit-accepting state is a no-op', () => {
    let m = freshMatch();
    m = depositAll(m, ['A', 'B', 'C']);
    // Now WINDOW_ACTIVE — another deposit should be ignored
    const r = recordDeposit(m, { wallet: 'A', txSig: 'tx_dup', now: 5000 });
    assert.equal(r.state.status, STATES.WINDOW_ACTIVE);
    assert.equal(r.actions.length, 0);
});

test('recordAttempt updates best score + emits leader_changed', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);

    let r = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 4000 });
    m = r.state;
    assert.equal(r.actions[0].type, 'leader_changed');
    assert.equal(r.actions[0].fromWallet, null);
    assert.equal(r.actions[0].toWallet, 'A');
    assert.equal(r.actions[0].score, 10);

    r = recordAttempt(m, { wallet: 'B', finalScore: 15, attemptId: 'b1', endedAt: 5000 });
    m = r.state;
    assert.equal(r.actions[0].type, 'leader_changed');
    assert.equal(r.actions[0].fromWallet, 'A');
    assert.equal(r.actions[0].toWallet, 'B');
});

test('recordAttempt: improvement that does NOT change leader emits no action', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 20, attemptId: 'a1', endedAt: 4000 }).state;
    // B improves but is still below A
    const r = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 5000 });
    assert.equal(r.state.bestScores.B.score, 10);
    assert.equal(r.actions.length, 0);
});

test('recordAttempt: same-or-worse score is a no-op', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 4000 }).state;
    const r = recordAttempt(m, { wallet: 'A', finalScore: 5, attemptId: 'a2', endedAt: 5000 });
    assert.equal(r.state.bestScores.A.score, 10);
    assert.equal(r.actions.length, 0);
});

test('recordAttempt outside WINDOW_ACTIVE is a no-op', () => {
    const m = freshMatch(); // LOBBY
    const r = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 });
    assert.deepEqual(r.state.bestScores, {});
    assert.equal(r.actions.length, 0);
});

test('evaluateWindowDeadline: unique leader → SETTLED + settle action', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 15, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 8, attemptId: 'b1', endedAt: 3000 }).state;
    const r = evaluateWindowDeadline(m, m.windowEnd + 1);
    assert.equal(r.state.status, STATES.SETTLED);
    assert.equal(r.state.winner, 'A');
    assert.equal(r.actions[0].type, 'settle');
    assert.equal(r.actions[0].winnerWallet, 'A');
});

test('evaluateWindowDeadline: tie → OT', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    const r = evaluateWindowDeadline(m, m.windowEnd + 1);
    assert.equal(r.state.status, STATES.OT);
    assert.equal(r.state.otRounds.length, 1);
    assert.deepEqual(r.state.otRounds[0].players, ['A', 'B']);
    assert.equal(r.actions[0].type, 'start_ot');
    assert.equal(r.actions[0].otRound, 1);
});

test('evaluateWindowDeadline: no attempts → CANCELLED', () => {
    const m = depositAll(freshMatch(), ['A', 'B', 'C']);
    const r = evaluateWindowDeadline(m, m.windowEnd + 1);
    assert.equal(r.state.status, STATES.CANCELLED);
    assert.equal(r.actions[0].type, 'cancel');
    assert.equal(r.actions[0].reason, 'no_attempts');
});

test('evaluateOTRound: one wallet scored higher → SETTLED', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    m = evaluateWindowDeadline(m, m.windowEnd + 1).state;

    m = recordOTAttempt(m, { wallet: 'A', finalScore: 5, attemptId: 'a_ot1', endedAt: m.windowEnd + 1000, otRoundNumber: 1 }).state;
    m = recordOTAttempt(m, { wallet: 'B', finalScore: 8, attemptId: 'b_ot1', endedAt: m.windowEnd + 2000, otRoundNumber: 1 }).state;
    const r = evaluateOTRound(m, 1, m.windowEnd + 3000);
    assert.equal(r.state.status, STATES.SETTLED);
    assert.equal(r.state.winner, 'B');
    assert.equal(r.actions[0].type, 'settle');
    assert.equal(r.actions[0].winnerWallet, 'B');
});

test('evaluateOTRound: tie again → another OT round', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    m = evaluateWindowDeadline(m, m.windowEnd + 1).state;

    m = recordOTAttempt(m, { wallet: 'A', finalScore: 5, attemptId: 'a_ot1', endedAt: m.windowEnd + 1000, otRoundNumber: 1 }).state;
    m = recordOTAttempt(m, { wallet: 'B', finalScore: 5, attemptId: 'b_ot1', endedAt: m.windowEnd + 2000, otRoundNumber: 1 }).state;
    const r = evaluateOTRound(m, 1, m.windowEnd + 3000);
    assert.equal(r.state.status, STATES.OT);
    assert.equal(r.state.otRounds.length, 2);
    assert.equal(r.state.otRounds[1].round, 2);
    assert.deepEqual(r.state.otRounds[1].players, ['A', 'B']);
    assert.equal(r.actions[0].type, 'start_ot');
    assert.equal(r.actions[0].otRound, 2);
});

test('evaluateOTRound: nobody scored → CANCELLED', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    m = evaluateWindowDeadline(m, m.windowEnd + 1).state;
    // No OT attempts recorded
    const r = evaluateOTRound(m, 1, m.windowEnd + 99999);
    assert.equal(r.state.status, STATES.CANCELLED);
    assert.equal(r.actions[0].reason, 'ot_no_attempts');
});

test('evaluateOTRound: only one player showed → that player wins', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    m = evaluateWindowDeadline(m, m.windowEnd + 1).state;

    m = recordOTAttempt(m, { wallet: 'A', finalScore: 7, attemptId: 'a_ot1', endedAt: m.windowEnd + 1000, otRoundNumber: 1 }).state;
    // B never plays OT
    const r = evaluateOTRound(m, 1, m.windowEnd + 99999);
    assert.equal(r.state.status, STATES.SETTLED);
    assert.equal(r.state.winner, 'A');
});

test('cancelMatch from non-terminal state → CANCELLED + cancel action', () => {
    const m = freshMatch();
    const r = cancelMatch(m, 'host_left');
    assert.equal(r.state.status, STATES.CANCELLED);
    assert.equal(r.actions[0].type, 'cancel');
    assert.equal(r.actions[0].reason, 'host_left');
});

test('cancelMatch from terminal state is a no-op', () => {
    const m = { ...freshMatch(), status: STATES.SETTLED };
    const r = cancelMatch(m, 'whatever');
    assert.equal(r.state.status, STATES.SETTLED);
    assert.equal(r.actions.length, 0);
});

test('recordOTAttempt: only accepts attempts from tied players', () => {
    let m = depositAll(freshMatch(), ['A', 'B', 'C']);
    m = recordAttempt(m, { wallet: 'A', finalScore: 10, attemptId: 'a1', endedAt: 2000 }).state;
    m = recordAttempt(m, { wallet: 'B', finalScore: 10, attemptId: 'b1', endedAt: 3000 }).state;
    m = recordAttempt(m, { wallet: 'C', finalScore: 5, attemptId: 'c1', endedAt: 4000 }).state;
    m = evaluateWindowDeadline(m, m.windowEnd + 1).state;
    // C is not in the OT round
    const r = recordOTAttempt(m, { wallet: 'C', finalScore: 100, attemptId: 'c_ot1', endedAt: m.windowEnd + 1000, otRoundNumber: 1 });
    // C's OT attempt is ignored
    assert.deepEqual(r.state.otRounds[0].scores, {});
});

test('createMatch is deterministic — same inputs yield same shape', () => {
    const a = createMatch({
        matchId: 'b:m1', roomId: 'm1',
        players: [{ wallet: 'A', telegramUserId: 't1' }],
        wagerLamports: 100, windowMs: 60000, now: 5000,
    });
    const b = createMatch({
        matchId: 'b:m1', roomId: 'm1',
        players: [{ wallet: 'A', telegramUserId: 't1' }],
        wagerLamports: 100, windowMs: 60000, now: 5000,
    });
    assert.deepEqual(a, b);
});
