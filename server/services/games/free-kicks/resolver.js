import { STATES, evaluateWindowDeadline, evaluateOTRound } from './lifecycle.js';

/**
 * Free-Kick Madness — window-deadline resolver
 *
 * Pure function called by the scheduled job that polls for matches
 * needing resolution (the cron / worker scheduled at window deadlines
 * and OT-round timeouts). Inspects state, returns a Decision:
 *
 *   { kind: 'settle',   matchId, winnerWallet }
 *   { kind: 'start_ot', matchId, otRound, players }
 *   { kind: 'cancel',   matchId, reason }
 *   { kind: 'skip',     matchId, reason }    — not ready / already done
 *
 * The actual on-chain settle / cancel and OT broadcasting happens in
 * the integration layer — this just decides what to do.
 *
 * NOTE: Same shape as basketball's resolver. The arcade match-format
 * pattern is identical across games; the resolver is essentially a
 * thin wrapper around lifecycle.evaluateWindowDeadline /
 * evaluateOTRound that's safe to call at any time. See
 * lifecycle.js header for the duplication note.
 */

/**
 * @param {object} state - the match state
 * @param {number} now - ms epoch when the resolver fired
 * @returns {{ kind: string, matchId: string }}
 */
export function resolveWindow(state, now) {
    if (state.status === STATES.SETTLED || state.status === STATES.CANCELLED) {
        return { kind: 'skip', matchId: state.matchId, reason: 'already_terminal' };
    }
    if (state.status === STATES.LOBBY || state.status === STATES.AWAITING_DEPOSITS) {
        return { kind: 'cancel', matchId: state.matchId, reason: 'never_started' };
    }
    if (state.status === STATES.WINDOW_ACTIVE) {
        if (now < state.windowEnd) {
            return { kind: 'skip', matchId: state.matchId, reason: 'window_not_closed' };
        }
        const { actions } = evaluateWindowDeadline(state, now);
        return decisionFromActions(state.matchId, actions);
    }
    if (state.status === STATES.OT) {
        // The caller's scheduling logic decides WHEN to call us on OT —
        // we just inspect the latest unresolved round and decide.
        const unresolved = state.otRounds.filter(r => !r.resolved);
        if (unresolved.length === 0) {
            return { kind: 'skip', matchId: state.matchId, reason: 'no_unresolved_ot' };
        }
        const latest = unresolved[unresolved.length - 1];
        const { actions } = evaluateOTRound(state, latest.round, now);
        return decisionFromActions(state.matchId, actions);
    }
    return { kind: 'skip', matchId: state.matchId, reason: 'unknown_state' };
}

function decisionFromActions(matchId, actions) {
    for (const a of actions) {
        if (a.type === 'settle') {
            return { kind: 'settle', matchId, winnerWallet: a.winnerWallet };
        }
        if (a.type === 'cancel') {
            return { kind: 'cancel', matchId, reason: a.reason };
        }
        if (a.type === 'start_ot') {
            return { kind: 'start_ot', matchId, otRound: a.otRound, players: a.players };
        }
    }
    return { kind: 'skip', matchId, reason: 'no_action' };
}
