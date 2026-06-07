/**
 * Round / match phase FSM for the Shootout multiplayer build.
 *
 * Day 3 / Task 1. Pure data + functions over a plain `state` object — no
 * timers, no broadcasts, no side effects. The ShootoutRunner owns the
 * timer (60Hz tick) and calls `advanceMatch(state, dt, players)` each
 * tick; transitions surface in the return value so the runner can emit
 * `shootout:match:roundState` / `shootout:match:final` to the room.
 *
 * Phases:
 *   BUY        — buy menu open, players frozen, fire disabled.
 *                  Counts up `phaseTimer` to BUY_TIME, then → LIVE.
 *   LIVE       — round in progress. On every call we check:
 *                  - all blue dead → red wins round
 *                  - all red  dead → blue wins round
 *                  - phaseTimer >= ROUND_TIME_LIMIT → time-up, no
 *                    winner (neither score bumps).
 *                On a winner determination, transition to ROUND_END and
 *                increment the team's win count.
 *   ROUND_END  — winner displayed; counts up to ROUND_END_TIME. On
 *                expiry, check match-end conditions:
 *                  - winsRed >= WINS_NEEDED → red wins match
 *                  - winsBlue >= WINS_NEEDED → blue wins match
 *                  - round >= maxRounds → team with more wins (or null
 *                    on tie) wins match
 *                Otherwise call `startNextRound(state)` and re-enter BUY.
 *   MATCH_END  — terminal. `over=true`. advanceMatch is a no-op from
 *                here.
 *
 * Win condition note on the round-timer cap:
 *   When ROUND_TIME_LIMIT elapses with both teams still alive we treat
 *   it as a "no contest" — neither team gets a win, phase still
 *   transitions to ROUND_END so the runner can run its round-end
 *   broadcast and economy update. Picked over "blue defaults" because
 *   neither team has the canonical defender role in this V1 design and
 *   awarding a free round on a time-up is more frustrating than helpful.
 *
 * `players` parameter shape:
 *   Map<slot, { team: 'red'|'blue', alive: bool }>
 *   The runner passes its `this.players` Map; we only read team + alive.
 */

export const BUY_TIME           = 10;   // seconds
export const ROUND_END_TIME     = 5;
export const ROUND_TIME_LIMIT   = 90;
export const MAX_ROUNDS         = 5;
export const WINS_NEEDED        = 3;

export const Phase = Object.freeze({
    BUY:       'BUY',
    LIVE:      'LIVE',
    ROUND_END: 'ROUND_END',
    MATCH_END: 'MATCH_END',
});

/**
 * Build a freshly-initialised match-state object.
 *
 * `mode` and `members` are accepted but only used for sanity — the FSM
 * itself doesn't branch on mode. Stored for downstream callers that
 * want to walk a single state object.
 */
export function createMatchState({ mode, members } = {}) {
    return {
        mode:        mode || null,
        members:     members || [],
        phase:       Phase.BUY,
        round:       1,
        maxRounds:   MAX_ROUNDS,
        winsNeeded:  WINS_NEEDED,
        winsRed:     0,
        winsBlue:    0,
        phaseTimer:  0,
        roundWinner: null,    // 'red' | 'blue' | null
        matchWinner: null,    // 'red' | 'blue' | null (null = draw on MAX_ROUNDS tie)
        over:        false,
    };
}

/**
 * Count alive players per team. Returns {redAlive, blueAlive,
 * redTotal, blueTotal}. A team with zero total members is treated as
 * having zero alive — this keeps the FSM stable in dev scenarios where
 * one side is empty without inducing immediate MATCH_END (the runner's
 * bot-fill should make that impossible in production).
 */
function _countTeams(players) {
    let redAlive = 0, blueAlive = 0, redTotal = 0, blueTotal = 0;
    if (!players) return { redAlive, blueAlive, redTotal, blueTotal };
    for (const p of players.values()) {
        if (p?.team === 'red')  { redTotal += 1;  if (p.alive) redAlive += 1; }
        if (p?.team === 'blue') { blueTotal += 1; if (p.alive) blueAlive += 1; }
    }
    return { redAlive, blueAlive, redTotal, blueTotal };
}

/**
 * Reset per-round state so the FSM can re-enter BUY for a new round.
 *
 * Does NOT mutate the players Map — the runner is responsible for
 * re-spawning / re-aliving players. The FSM only owns the
 * round/phase/winner counters.
 */
export function startNextRound(state) {
    state.round       += 1;
    state.phase        = Phase.BUY;
    state.phaseTimer   = 0;
    state.roundWinner  = null;
    return state;
}

/**
 * Advance the FSM by `dt` seconds.
 *
 * Returns a small transition descriptor:
 *   {
 *     transitioned:    bool — true if `phase` changed this call
 *     prevPhase:       Phase value before the call
 *     nextPhase:       Phase value after the call (== prevPhase if !transitioned)
 *     roundJustEnded:  bool — true if we just entered ROUND_END
 *     matchJustEnded:  bool — true if we just entered MATCH_END
 *   }
 */
export function advanceMatch(state, dt, players) {
    const prevPhase = state.phase;

    // Terminal phase: no-op.
    if (state.phase === Phase.MATCH_END) {
        return {
            transitioned:   false,
            prevPhase,
            nextPhase:      state.phase,
            roundJustEnded: false,
            matchJustEnded: false,
        };
    }

    state.phaseTimer += dt;

    let transitioned   = false;
    let roundJustEnded = false;
    let matchJustEnded = false;

    if (state.phase === Phase.BUY) {
        if (state.phaseTimer >= BUY_TIME) {
            state.phase       = Phase.LIVE;
            state.phaseTimer  = 0;
            transitioned      = true;
        }
    } else if (state.phase === Phase.LIVE) {
        // Win-condition check
        const { redAlive, blueAlive, redTotal, blueTotal } = _countTeams(players);

        // A team can only LOSE if it had members to begin with. If both
        // teams have members, all-dead on one side ends the round.
        let winner = null;
        if (redTotal > 0 && blueTotal > 0) {
            if (blueAlive === 0)      winner = 'red';
            else if (redAlive === 0)  winner = 'blue';
        }

        if (winner) {
            state.roundWinner = winner;
            if (winner === 'red')  state.winsRed  += 1;
            if (winner === 'blue') state.winsBlue += 1;
            state.phase       = Phase.ROUND_END;
            state.phaseTimer  = 0;
            transitioned      = true;
            roundJustEnded    = true;
        } else if (state.phaseTimer >= ROUND_TIME_LIMIT) {
            // Time-up with both teams alive: no winner, transition anyway.
            state.roundWinner = null;
            state.phase       = Phase.ROUND_END;
            state.phaseTimer  = 0;
            transitioned      = true;
            roundJustEnded    = true;
        }
    } else if (state.phase === Phase.ROUND_END) {
        if (state.phaseTimer >= ROUND_END_TIME) {
            // Match-end checks
            let matchEnded   = false;
            let matchWinner  = null;

            if (state.winsRed >= state.winsNeeded) {
                matchEnded  = true;
                matchWinner = 'red';
            } else if (state.winsBlue >= state.winsNeeded) {
                matchEnded  = true;
                matchWinner = 'blue';
            } else if (state.round >= state.maxRounds) {
                // Round cap reached; whoever has more wins takes it.
                matchEnded = true;
                if (state.winsRed > state.winsBlue)      matchWinner = 'red';
                else if (state.winsBlue > state.winsRed) matchWinner = 'blue';
                else                                     matchWinner = null; // draw
            }

            if (matchEnded) {
                state.phase        = Phase.MATCH_END;
                state.phaseTimer   = 0;
                state.matchWinner  = matchWinner;
                state.over         = true;
                transitioned       = true;
                matchJustEnded     = true;
            } else {
                startNextRound(state);
                transitioned       = true;
            }
        }
    }

    return {
        transitioned,
        prevPhase,
        nextPhase: state.phase,
        roundJustEnded,
        matchJustEnded,
    };
}

/**
 * Duration of the current phase in seconds — used by the runner to put
 * a usable countdown on the wire (`phaseDuration - phaseTimer`).
 */
export function phaseDurationFor(phase) {
    if (phase === Phase.BUY)        return BUY_TIME;
    if (phase === Phase.LIVE)       return ROUND_TIME_LIMIT;
    if (phase === Phase.ROUND_END)  return ROUND_END_TIME;
    return 0;
}

export default {
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
};
