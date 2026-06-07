/**
 * Tests for sim/match.js — Day 3 / Task 1.
 *
 * The FSM is a pure-function module (no timers, no IO). These tests
 * mirror the runner.test.js / lobbyService.test.js style: build a fresh
 * state with `createMatchState`, simulate a tiny players Map, and walk
 * the state through transitions with `advanceMatch(state, dt, players)`
 * + `startNextRound`.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    BUY_TIME,
    ROUND_END_TIME,
    ROUND_TIME_LIMIT,
    MAX_ROUNDS,
    WINS_NEEDED,
    Phase,
    createMatchState,
    advanceMatch,
    startNextRound,
    phaseDurationFor,
} from '../../services/games/shootout/sim/match.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makePlayers(spec) {
    // spec: [{slot, team, alive}, ...] → Map<slot, {team, alive}>
    const m = new Map();
    for (const p of spec) {
        m.set(p.slot, { team: p.team, alive: p.alive !== false });
    }
    return m;
}

function default1v1() {
    return makePlayers([
        { slot: 0, team: 'red',  alive: true },
        { slot: 1, team: 'blue', alive: true },
    ]);
}

// ── createMatchState ─────────────────────────────────────────────────

test('createMatchState: returns expected initial values', () => {
    const s = createMatchState({ mode: '1v1', members: [] });
    assert.equal(s.phase, Phase.BUY);
    assert.equal(s.round, 1);
    assert.equal(s.maxRounds, MAX_ROUNDS);
    assert.equal(s.winsNeeded, WINS_NEEDED);
    assert.equal(s.winsRed, 0);
    assert.equal(s.winsBlue, 0);
    assert.equal(s.phaseTimer, 0);
    assert.equal(s.roundWinner, null);
    assert.equal(s.matchWinner, null);
    assert.equal(s.over, false);
    assert.equal(s.mode, '1v1');
});

test('createMatchState: tolerates missing args', () => {
    const s = createMatchState();
    assert.equal(s.phase, Phase.BUY);
    assert.equal(s.round, 1);
});

// ── BUY phase ────────────────────────────────────────────────────────

test('advanceMatch BUY → stays in BUY for < BUY_TIME', () => {
    const s = createMatchState({ mode: '1v1' });
    const players = default1v1();
    const r = advanceMatch(s, BUY_TIME / 2, players);
    assert.equal(r.transitioned, false);
    assert.equal(s.phase, Phase.BUY);
    assert.equal(r.nextPhase, Phase.BUY);
});

test('advanceMatch BUY → transitions to LIVE at BUY_TIME', () => {
    const s = createMatchState({ mode: '1v1' });
    const players = default1v1();
    const r = advanceMatch(s, BUY_TIME, players);
    assert.equal(r.transitioned, true);
    assert.equal(r.prevPhase, Phase.BUY);
    assert.equal(r.nextPhase, Phase.LIVE);
    assert.equal(s.phase, Phase.LIVE);
    assert.equal(s.phaseTimer, 0);   // reset on transition
});

test('advanceMatch BUY → transitions to LIVE after multiple sub-BUY_TIME calls', () => {
    const s = createMatchState({ mode: '1v1' });
    const players = default1v1();
    // 101 ticks of 0.1s ≈ 10.1s > BUY_TIME. The extra tick covers
    // floating-point accumulation drift (100 × 0.1 sums to 9.99…, not
    // exactly 10).
    let transitions = 0;
    for (let i = 0; i < 101; i++) {
        const r = advanceMatch(s, 0.1, players);
        if (r.transitioned) transitions += 1;
    }
    assert.equal(transitions, 1);
    assert.equal(s.phase, Phase.LIVE);
});

// ── LIVE phase win-conditions ────────────────────────────────────────

test('advanceMatch LIVE: all blue dead → roundWinner=red, transition ROUND_END, winsRed=1', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.LIVE;
    const players = makePlayers([
        { slot: 0, team: 'red',  alive: true },
        { slot: 1, team: 'blue', alive: false },
    ]);
    const r = advanceMatch(s, 1 / 60, players);
    assert.equal(r.transitioned, true);
    assert.equal(r.roundJustEnded, true);
    assert.equal(s.phase, Phase.ROUND_END);
    assert.equal(s.roundWinner, 'red');
    assert.equal(s.winsRed, 1);
    assert.equal(s.winsBlue, 0);
});

test('advanceMatch LIVE: all red dead → roundWinner=blue, transition ROUND_END, winsBlue=1', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.LIVE;
    const players = makePlayers([
        { slot: 0, team: 'red',  alive: false },
        { slot: 1, team: 'blue', alive: true },
    ]);
    const r = advanceMatch(s, 1 / 60, players);
    assert.equal(r.transitioned, true);
    assert.equal(s.phase, Phase.ROUND_END);
    assert.equal(s.roundWinner, 'blue');
    assert.equal(s.winsBlue, 1);
    assert.equal(s.winsRed, 0);
});

test('advanceMatch LIVE: both teams alive → stays in LIVE', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.LIVE;
    const r = advanceMatch(s, 1 / 60, default1v1());
    assert.equal(r.transitioned, false);
    assert.equal(s.phase, Phase.LIVE);
});

test('advanceMatch LIVE: 2v2, only one red alive vs all blue dead → red wins', () => {
    const s = createMatchState({ mode: '2v2' });
    s.phase = Phase.LIVE;
    const players = makePlayers([
        { slot: 0, team: 'red',  alive: false },
        { slot: 1, team: 'blue', alive: false },
        { slot: 2, team: 'red',  alive: true  },
        { slot: 3, team: 'blue', alive: false },
    ]);
    advanceMatch(s, 1 / 60, players);
    assert.equal(s.phase, Phase.ROUND_END);
    assert.equal(s.roundWinner, 'red');
});

test('advanceMatch LIVE: round timer cap → ROUND_END with no winner', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.LIVE;
    const r = advanceMatch(s, ROUND_TIME_LIMIT + 0.01, default1v1());
    assert.equal(r.transitioned, true);
    assert.equal(r.roundJustEnded, true);
    assert.equal(s.phase, Phase.ROUND_END);
    assert.equal(s.roundWinner, null);
    assert.equal(s.winsRed, 0);
    assert.equal(s.winsBlue, 0);
});

// ── ROUND_END phase ──────────────────────────────────────────────────

test('advanceMatch ROUND_END: stays for < ROUND_END_TIME', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.winsRed = 1;
    s.roundWinner = 'red';
    const r = advanceMatch(s, ROUND_END_TIME / 2, default1v1());
    assert.equal(r.transitioned, false);
    assert.equal(s.phase, Phase.ROUND_END);
});

test('advanceMatch ROUND_END: transitions to BUY at ROUND_END_TIME (next round)', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.winsRed = 1;
    s.roundWinner = 'red';
    const startRound = s.round;
    const r = advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(r.transitioned, true);
    assert.equal(s.phase, Phase.BUY);
    assert.equal(s.round, startRound + 1);
    assert.equal(s.roundWinner, null);
    assert.equal(s.phaseTimer, 0);
});

test('advanceMatch ROUND_END → MATCH_END when winsRed >= WINS_NEEDED', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.winsRed = WINS_NEEDED;
    s.winsBlue = 0;
    s.roundWinner = 'red';
    s.round = 3;
    const r = advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(r.transitioned, true);
    assert.equal(r.matchJustEnded, true);
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.over, true);
    assert.equal(s.matchWinner, 'red');
});

test('advanceMatch ROUND_END → MATCH_END when winsBlue >= WINS_NEEDED', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.winsRed = 0;
    s.winsBlue = WINS_NEEDED;
    s.roundWinner = 'blue';
    s.round = 3;
    advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.matchWinner, 'blue');
    assert.equal(s.over, true);
});

test('advanceMatch ROUND_END → MATCH_END at MAX_ROUNDS by score (red leads)', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.round = MAX_ROUNDS;
    s.winsRed = 2;
    s.winsBlue = 1; // sub-WINS_NEEDED but round cap reached
    advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.matchWinner, 'red');
});

test('advanceMatch ROUND_END → MATCH_END at MAX_ROUNDS by score (blue leads)', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.round = MAX_ROUNDS;
    s.winsRed = 1;
    s.winsBlue = 2;
    advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.matchWinner, 'blue');
});

test('advanceMatch ROUND_END → MATCH_END at MAX_ROUNDS draw → matchWinner=null', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.ROUND_END;
    s.round = MAX_ROUNDS;
    s.winsRed = 2;
    s.winsBlue = 2;
    advanceMatch(s, ROUND_END_TIME, default1v1());
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.matchWinner, null);
    assert.equal(s.over, true);
});

// ── MATCH_END terminal ───────────────────────────────────────────────

test('advanceMatch MATCH_END: no-op (already terminal)', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase = Phase.MATCH_END;
    s.over = true;
    s.matchWinner = 'red';
    const r = advanceMatch(s, 10, default1v1());
    assert.equal(r.transitioned, false);
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.phaseTimer, 0, 'no timer advance after MATCH_END');
});

// ── startNextRound ───────────────────────────────────────────────────

test('startNextRound: resets phaseTimer + roundWinner, increments round, back to BUY', () => {
    const s = createMatchState({ mode: '1v1' });
    s.phase       = Phase.ROUND_END;
    s.phaseTimer  = ROUND_END_TIME;
    s.roundWinner = 'red';
    s.round       = 2;
    startNextRound(s);
    assert.equal(s.phase, Phase.BUY);
    assert.equal(s.phaseTimer, 0);
    assert.equal(s.roundWinner, null);
    assert.equal(s.round, 3);
});

// ── End-to-end FSM walkthrough ───────────────────────────────────────

test('advanceMatch: full match — red wins 3-0', () => {
    const s = createMatchState({ mode: '1v1' });

    for (let round = 0; round < 3; round++) {
        // BUY → LIVE (one tick of dt = BUY_TIME)
        advanceMatch(s, BUY_TIME, default1v1());
        assert.equal(s.phase, Phase.LIVE);

        // Blue dies → red wins round
        const players = makePlayers([
            { slot: 0, team: 'red',  alive: true  },
            { slot: 1, team: 'blue', alive: false },
        ]);
        advanceMatch(s, 1 / 60, players);
        assert.equal(s.phase, Phase.ROUND_END);
        assert.equal(s.winsRed, round + 1);

        // Wait out ROUND_END
        advanceMatch(s, ROUND_END_TIME, default1v1());
    }
    assert.equal(s.phase, Phase.MATCH_END);
    assert.equal(s.matchWinner, 'red');
    assert.equal(s.winsRed, 3);
    assert.equal(s.over, true);
});

// ── phaseDurationFor ─────────────────────────────────────────────────

test('phaseDurationFor: returns BUY/LIVE/ROUND_END durations', () => {
    assert.equal(phaseDurationFor(Phase.BUY), BUY_TIME);
    assert.equal(phaseDurationFor(Phase.LIVE), ROUND_TIME_LIMIT);
    assert.equal(phaseDurationFor(Phase.ROUND_END), ROUND_END_TIME);
    assert.equal(phaseDurationFor(Phase.MATCH_END), 0);
});
