import { applyAttemptScore, getLeader, tiedTopScorers, leaderChanged } from './leaderboard.js';

/**
 * Basketball Hoops — match lifecycle state machine
 *
 * Pure module. Takes the current match state plus an event and
 * returns the new state plus a list of side-effect ACTIONS the caller
 * should perform (db writes, on-chain settle / cancel, TG broadcasts).
 *
 * States:
 *   lobby             — players still joining
 *   awaiting_deposits — lobby is full, waiting for SOL deposits
 *   window_active     — game is live, players are taking attempts
 *   ot                — at least one OT round in progress for ties
 *   settled           — winner determined, on-chain payout queued
 *   cancelled         — match never started OR explicit cancellation
 *
 * Why pure: same (state, event) always produces the same
 * (newState, actions). Tests exhaustively cover state machine
 * behaviour without spinning up Mongo, sockets, or Anchor RPCs.
 * Integration (Phase 4) wires the actions to real I/O.
 *
 * Action types emitted:
 *   { type: 'window_opened',  matchId, windowStart, windowEnd }
 *   { type: 'leader_changed', matchId, fromWallet, toWallet, score }
 *   { type: 'settle',         matchId, winnerWallet }
 *   { type: 'start_ot',       matchId, otRound, players }
 *   { type: 'cancel',         matchId, reason }
 */

export const STATES = Object.freeze({
    LOBBY: 'lobby',
    AWAITING_DEPOSITS: 'awaiting_deposits',
    WINDOW_ACTIVE: 'window_active',
    OT: 'ot',
    SETTLED: 'settled',
    CANCELLED: 'cancelled',
});

const TERMINAL = new Set([STATES.SETTLED, STATES.CANCELLED]);

/**
 * Fresh match-state object. Starts in LOBBY.
 *
 * @param {object} params
 * @param {string} params.matchId - "basketball:<roomId>"
 * @param {string} params.roomId
 * @param {Array<{wallet, telegramUserId}>} params.players
 * @param {number} params.wagerLamports
 * @param {number} params.windowMs - duration once deposits land
 * @param {number} params.now - ms epoch
 */
export function createMatch({ matchId, roomId, players, wagerLamports, windowMs, now }) {
    return {
        matchId,
        roomId,
        status: STATES.LOBBY,
        players: players.map(p => ({
            wallet: p.wallet,
            telegramUserId: p.telegramUserId,
            depositTxSig: null,
        })),
        wagerLamports,
        windowStart: null,
        windowEnd: null,
        windowMs,
        bestScores: {},
        otRounds: [],
        winner: null,
        settleTxSig: null,
        cancelTxSig: null,
        createdAt: now,
    };
}

/**
 * Record a player's confirmed deposit. When all are in, transition
 * to WINDOW_ACTIVE and emit a 'window_opened' action.
 */
export function recordDeposit(state, { wallet, txSig, now }) {
    if (state.status !== STATES.AWAITING_DEPOSITS && state.status !== STATES.LOBBY) {
        return { state, actions: [] };
    }
    const players = state.players.map(p =>
        p.wallet === wallet ? { ...p, depositTxSig: txSig } : p
    );
    const allDeposited = players.every(p => p.depositTxSig);

    if (allDeposited) {
        const windowStart = now;
        const windowEnd = now + state.windowMs;
        return {
            state: {
                ...state,
                players,
                status: STATES.WINDOW_ACTIVE,
                windowStart,
                windowEnd,
            },
            actions: [{
                type: 'window_opened',
                matchId: state.matchId,
                windowStart,
                windowEnd,
            }],
        };
    }
    return {
        state: { ...state, players, status: STATES.AWAITING_DEPOSITS },
        actions: [],
    };
}

/**
 * Record a completed regular-window attempt. Updates the leaderboard
 * if the new score is a personal best AND emits 'leader_changed' if
 * the top-of-leaderboard player changes.
 */
export function recordAttempt(state, { wallet, finalScore, attemptId, endedAt }) {
    if (state.status !== STATES.WINDOW_ACTIVE) {
        return { state, actions: [] };
    }
    const prevBest = state.bestScores;
    const { bestScores: nextBest, improved } = applyAttemptScore(
        prevBest, wallet, finalScore, attemptId, endedAt
    );
    if (!improved) return { state, actions: [] };

    const actions = [];
    if (leaderChanged(prevBest, nextBest)) {
        const fromLeader = getLeader(prevBest);
        const toLeader = getLeader(nextBest);
        actions.push({
            type: 'leader_changed',
            matchId: state.matchId,
            fromWallet: fromLeader ? fromLeader.wallet : null,
            toWallet: toLeader.wallet,
            score: toLeader.score,
        });
    }
    return {
        state: { ...state, bestScores: nextBest },
        actions,
    };
}

/**
 * Called at the window deadline. Three outcomes:
 *   - settle on a unique top score
 *   - start an OT round on a tie
 *   - cancel if nobody played
 */
export function evaluateWindowDeadline(state, now) {
    if (state.status !== STATES.WINDOW_ACTIVE) {
        return { state, actions: [] };
    }
    const leader = getLeader(state.bestScores);
    if (!leader) {
        return {
            state: { ...state, status: STATES.CANCELLED },
            actions: [{ type: 'cancel', matchId: state.matchId, reason: 'no_attempts' }],
        };
    }
    const tied = tiedTopScorers(state.bestScores);
    if (tied.length === 1) {
        return {
            state: { ...state, status: STATES.SETTLED, winner: tied[0] },
            actions: [{ type: 'settle', matchId: state.matchId, winnerWallet: tied[0] }],
        };
    }
    const otRound = {
        round: 1,
        players: tied,
        scores: {},
        startedAt: now,
        resolved: false,
    };
    return {
        state: { ...state, status: STATES.OT, otRounds: [otRound] },
        actions: [{
            type: 'start_ot',
            matchId: state.matchId,
            otRound: 1,
            players: tied,
        }],
    };
}

/**
 * Record one tied player's OT-round attempt. Doesn't transition state
 * yet — that happens once all (or a timeout's worth of) tied players
 * have logged their OT attempt, via evaluateOTRound.
 */
export function recordOTAttempt(state, { wallet, finalScore, attemptId, endedAt, otRoundNumber }) {
    if (state.status !== STATES.OT) return { state, actions: [] };
    const round = state.otRounds.find(r => r.round === otRoundNumber);
    if (!round || round.resolved) return { state, actions: [] };
    if (!round.players.includes(wallet)) return { state, actions: [] };

    const nextScores = {
        ...round.scores,
        [wallet]: { score: finalScore, attemptId, endedAt },
    };
    const nextRound = { ...round, scores: nextScores };
    const otRounds = state.otRounds.map(r =>
        r.round === otRoundNumber ? nextRound : r
    );
    return { state: { ...state, otRounds }, actions: [] };
}

/**
 * Evaluate an OT round. Either settles, starts another OT round
 * (if still tied), or cancels (if nobody played).
 */
export function evaluateOTRound(state, otRoundNumber, now) {
    if (state.status !== STATES.OT) return { state, actions: [] };
    const round = state.otRounds.find(r => r.round === otRoundNumber);
    if (!round || round.resolved) return { state, actions: [] };

    const entries = Object.entries(round.scores);
    if (entries.length === 0) {
        // Nobody showed up to OT — cancel the match.
        const resolved = { ...round, resolved: true };
        return {
            state: {
                ...state,
                status: STATES.CANCELLED,
                otRounds: state.otRounds.map(r =>
                    r.round === otRoundNumber ? resolved : r
                ),
            },
            actions: [{ type: 'cancel', matchId: state.matchId, reason: 'ot_no_attempts' }],
        };
    }

    // Find OT-round leader. Ties at this level → another OT round.
    let highScore = -Infinity;
    let leaders = [];
    for (const [wallet, entry] of entries) {
        if (entry.score > highScore) { highScore = entry.score; leaders = [wallet]; }
        else if (entry.score === highScore) { leaders.push(wallet); }
    }
    leaders.sort();

    if (leaders.length === 1) {
        const resolved = { ...round, resolved: true };
        return {
            state: {
                ...state,
                status: STATES.SETTLED,
                winner: leaders[0],
                otRounds: state.otRounds.map(r =>
                    r.round === otRoundNumber ? resolved : r
                ),
            },
            actions: [{
                type: 'settle',
                matchId: state.matchId,
                winnerWallet: leaders[0],
            }],
        };
    }

    // Still tied — another OT round with only the still-tied players.
    const nextRoundNumber = otRoundNumber + 1;
    const nextRound = {
        round: nextRoundNumber,
        players: leaders,
        scores: {},
        startedAt: now,
        resolved: false,
    };
    const resolved = { ...round, resolved: true };
    return {
        state: {
            ...state,
            otRounds: [
                ...state.otRounds.map(r => r.round === otRoundNumber ? resolved : r),
                nextRound,
            ],
        },
        actions: [{
            type: 'start_ot',
            matchId: state.matchId,
            otRound: nextRoundNumber,
            players: leaders,
        }],
    };
}

/**
 * Explicit cancellation. No-op from terminal states.
 */
export function cancelMatch(state, reason) {
    if (TERMINAL.has(state.status)) {
        return { state, actions: [] };
    }
    return {
        state: { ...state, status: STATES.CANCELLED },
        actions: [{ type: 'cancel', matchId: state.matchId, reason }],
    };
}
