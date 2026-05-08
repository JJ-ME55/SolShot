import crypto from 'crypto';

/**
 * SolShot Match State Machine
 *
 * States: LOBBY → WEAPON_SHOP → BATTLE → ROUND_END → SETTLEMENT
 *
 * Enforces that no action can happen outside its valid state.
 * E.g., can't fire during weapon_shop, can't buy during battle.
 *
 * Phase 15: Rewritten for N-player (2-4) support.
 * - createMatchState accepts maxPlayers param (default 2)
 * - players[] is intentionally empty at creation; populated at requestTerrain time (Plan 15-02)
 * - getNextTurn cycles through alive[] map, random first turn
 * - isRoundOver uses alive map with HP fallback for backward compat
 * - getRoundPlacement (replaces getRoundWinner) returns ranked array with placement scoring
 * - isMatchOver uses cumulative placementPoints with damageDealtTotal tiebreaker, no early exit
 * - resetForNextRound resets all N players to 250 HP and alive=true
 */

export const MATCH_STATES = {
    LOBBY: 'lobby',
    WEAPON_SHOP: 'weapon_shop',
    BATTLE: 'battle',
    ROUND_END: 'round_end',
    SETTLING: 'settling',
    COMPLETE: 'complete',
    CANCELLED: 'cancelled'
};

// Valid state transitions
const TRANSITIONS = {
    [MATCH_STATES.LOBBY]:       [MATCH_STATES.WEAPON_SHOP, MATCH_STATES.BATTLE, MATCH_STATES.CANCELLED],
    [MATCH_STATES.WEAPON_SHOP]: [MATCH_STATES.BATTLE, MATCH_STATES.CANCELLED],
    // H022: Added SETTLING — fire handler needs BATTLE→SETTLING when match ends
    [MATCH_STATES.BATTLE]:      [MATCH_STATES.ROUND_END, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED],
    [MATCH_STATES.ROUND_END]:   [MATCH_STATES.WEAPON_SHOP, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED],
    [MATCH_STATES.SETTLING]:    [MATCH_STATES.COMPLETE, MATCH_STATES.CANCELLED],
    [MATCH_STATES.COMPLETE]:    [],
    [MATCH_STATES.CANCELLED]:   []
};

/**
 * Validate and execute a state transition
 *
 * @param {object} matchState - Current match state object
 * @param {string} newState - Target state
 * @returns {boolean} true if transition was valid and applied
 */
export function transitionState(matchState, newState) {
    const currentState = matchState.status;
    const validTransitions = TRANSITIONS[currentState];

    if (!validTransitions || !validTransitions.includes(newState)) {
        console.warn(`Invalid state transition: ${currentState} → ${newState}`);
        return false;
    }

    matchState.status = newState;
    matchState.stateChangedAt = Date.now();
    return true;
}

/**
 * Validate an action against the current match state
 *
 * @param {string} currentState - Current match status
 * @param {string} action - Action being attempted
 * @returns {boolean} true if action is allowed in current state
 */
export function validateAction(currentState, action) {
    const allowedActions = {
        [MATCH_STATES.LOBBY]: ['join', 'leave', 'ready'],
        [MATCH_STATES.WEAPON_SHOP]: ['buyWeapon', 'shopDone'],
        [MATCH_STATES.BATTLE]: ['fire', 'move', 'angleChange', 'powerChange', 'weaponChange', 'stepLeft', 'stepRight', 'giveTurn', 'requestTurn', 'shoot'],
        [MATCH_STATES.ROUND_END]: ['ready', 'playAgainRequest'],
        [MATCH_STATES.SETTLING]: [],
        [MATCH_STATES.COMPLETE]: ['playAgainRequest'],
        [MATCH_STATES.CANCELLED]: []
    };

    const allowed = allowedActions[currentState];
    if (!allowed) return false;
    return allowed.includes(action);
}

/**
 * Initialize match state for a new game
 *
 * Phase 15: Added maxPlayers param (default 2) for N-player support.
 * players[] is intentionally empty at creation time — it is populated
 * at requestTerrain time in Plan 15-02 Edit 4, after all players have joined.
 * Per-player maps (scores, kills, roundWins, hp, placementPoints,
 * damageDealtTotal) start as {} here and are fully populated with all N
 * socket IDs in the requestTerrain block.
 *
 * @param {string} roomId
 * @param {string} roundType - '1', 'BO3', or 'BO5'
 * @param {number} maxPlayers - 2, 3, or 4 (default 2)
 * @returns {object} initial match state
 */
export function createMatchState(roomId, roundType = '1', maxPlayers = 2) {
    const maxRounds = roundType === 'BO5' ? 5 : roundType === 'BO3' ? 3 : 1;

    return {
        roomId,
        status: MATCH_STATES.LOBBY,
        roundType,
        maxRounds,
        currentRound: 0,
        scores: {},          // { [playerId]: totalDamageDealt }
        kills: {},           // { [playerId]: totalKills }
        roundWins: {},       // { [playerId]: roundsWon } — backward compat, also updated by getRoundPlacement
        hp: {},              // { [playerId]: currentHP } — 250 per player per round
        currentTurn: null,   // playerId whose turn it is
        turnCount: 0,
        turnSequence: 0,     // Fix 4: Nonce — increments each fire, prevents replay
        terrain: null,
        tankPositions: null,
        stateChangedAt: Date.now(),
        matchStartedAt: Date.now(),  // wall-clock match-create time — used for share-card duration
        // Phase 11: Per-weapon stats tracking
        weaponShotsFired: {}, // { [playerId]: { [weaponId]: count } }
        weaponHits: {},       // { [playerId]: { [weaponId]: count } }
        weaponDamage: {},     // { [playerId]: { [weaponId]: totalDmg } }
        totalDeaths: {},      // { [playerId]: deathCount }
        // Phase 15: N-player fields
        maxPlayers,
        players: [],         // [socketId, ...] — populated at requestTerrain time (Plan 15-02)
        alive: {},           // { [socketId]: boolean } — populated when players[] is set
        currentPlayerIndex: 0,
        turnsPerRound: maxPlayers * 10,  // 10 turns per player per round (was hardcoded 20)
        placementPoints: {},  // { [socketId]: cumulativePlacementPoints }
        damageDealtTotal: {}, // { [socketId]: cumulativeDamageDealt } — tiebreaker
        eliminationOrder: [], // [socketId, ...] — order of elimination (first eliminated = index 0)
    };
}

/**
 * Reset turn state and player vitals for a new round (H023)
 *
 * Phase 15: Also resets alive map and currentPlayerIndex for all N players.
 * Uses players[] when populated, falls back to hp keys for safety.
 *
 * @param {object} matchState
 */
export function resetForNextRound(matchState) {
    matchState.turnCount = 0;
    matchState.turnSequence = 0;
    matchState.currentTurn = null;
    matchState.currentPlayerIndex = 0;
    matchState.eliminationOrder = [];
    // Reset HP and alive for ALL players (use players[] if available, fallback to hp keys)
    for (const playerId of (matchState.players.length > 0 ? matchState.players : Object.keys(matchState.hp))) {
        matchState.hp[playerId] = 250;
        if (matchState.alive) matchState.alive[playerId] = true;
    }
}

/**
 * Placement points awarded per finish position
 * Index 0 = 1st place, index 1 = 2nd, index 2 = 3rd, index 3 = 4th
 */
export const PLACEMENT_POINTS = [3, 2, 1, 0];

/**
 * Determine whose turn it is next
 *
 * Phase 15: Rewritten for N-player support.
 * - Accepts only matchState (no hostId/playerId params)
 * - First turn of a round: random selection among alive players
 * - Subsequent turns: cycle through players[] in order, skipping eliminated
 * - Mutates matchState.currentPlayerIndex and matchState.currentTurn
 * - Returns the socketId of the player whose turn it now is
 *
 * Call sites that do `ms.currentTurn = getNextTurn(ms)` continue to work —
 * the assignment is redundant (function mutates state) but harmless.
 *
 * @param {object} matchState
 * @returns {string|null} next player's socketId, or null if no alive players
 */
export function getNextTurn(matchState) {
    const { players, alive } = matchState;
    if (!players || players.length === 0) return null;

    // First turn of a round — random start among alive players
    if (matchState.currentTurn === null) {
        const alivePlayers = players.filter(id => alive[id]);
        if (alivePlayers.length === 0) return null;
        const startIdx = crypto.randomInt(alivePlayers.length);
        matchState.currentPlayerIndex = players.indexOf(alivePlayers[startIdx]);
        matchState.currentTurn = players[matchState.currentPlayerIndex];
        return matchState.currentTurn;
    }

    // Advance from current position, skip eliminated players
    let idx = matchState.currentPlayerIndex;
    for (let i = 0; i < players.length; i++) {
        idx = (idx + 1) % players.length;
        if (alive[players[idx]]) {
            matchState.currentPlayerIndex = idx;
            matchState.currentTurn = players[idx];
            return matchState.currentTurn;
        }
    }
    return null; // all dead — should not happen in valid game flow
}

/**
 * Check if the round is over
 *
 * Phase 15: Uses alive map when populated (N-player mode).
 * Falls back to legacy HP check for backward compat before Phase 16
 * updates the fire handler to set alive[id] = false on kill.
 *
 * Round ends when:
 * - All turns exhausted (turnCount >= turnsPerRound), OR
 * - Only 1 (or 0) players remain alive
 *
 * @param {object} matchState
 * @returns {boolean}
 */
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    // N-player: use alive map when populated
    if (matchState.alive && Object.keys(matchState.alive).length > 0) {
        return Object.values(matchState.alive).filter(Boolean).length <= 1;
    }
    // 2-player fallback: legacy HP check (before Phase 16 populates alive map)
    for (const hp of Object.values(matchState.hp || {})) {
        if (hp <= 0) return true;
    }
    return false;
}

/**
 * Determine the placement ranking for a round and award placement points
 *
 * Phase 15: Replaces getRoundWinner. Returns full ranked array instead of
 * a single winner ID, supporting N-player placement scoring.
 *
 * Ranking logic:
 * - Survivors (alive=true): ranked by HP descending, then damage dealt descending
 * - Eliminated: reverse eliminationOrder (last eliminated = highest among dead)
 *
 * Side effects:
 * - Accumulates placementPoints per player (PLACEMENT_POINTS[rank])
 * - Accumulates damageDealtTotal per player (for tiebreaker in isMatchOver)
 * - Updates roundWins[1st] for backward compat (disconnect chain in main.js)
 *
 * @param {object} matchState
 * @returns {string[]} ranked array of socketIds [1st, 2nd, 3rd, 4th]
 */
export function getRoundPlacement(matchState) {
    const players = matchState.players || [];
    const alive = matchState.alive || {};
    const hp = matchState.hp || {};
    const scores = matchState.scores || {};

    // Survivors ranked by HP desc, then damage dealt desc
    const survivors = players.filter(id => alive[id]);
    survivors.sort((a, b) => {
        const hpDiff = (hp[b] || 0) - (hp[a] || 0);
        if (hpDiff !== 0) return hpDiff;
        return (scores[b] || 0) - (scores[a] || 0);
    });

    // Eliminated: reverse eliminationOrder (first killed = last place)
    const eliminated = [...(matchState.eliminationOrder || [])].reverse();

    const ranked = [...survivors, ...eliminated];

    // Award placement points and accumulate damage totals
    if (!matchState.placementPoints) matchState.placementPoints = {};
    if (!matchState.damageDealtTotal) matchState.damageDealtTotal = {};

    ranked.forEach((pid, i) => {
        const pts = PLACEMENT_POINTS[i] ?? 0;
        matchState.placementPoints[pid] = (matchState.placementPoints[pid] || 0) + pts;
        matchState.damageDealtTotal[pid] = (matchState.damageDealtTotal[pid] || 0) + (scores[pid] || 0);
    });

    // Backward compat: update roundWins for 1st place (preserves disconnect
    // logic in main.js).
    //
    // Idempotency guard added in the May 8 QA pass — getRoundPlacement is
    // called from THREE different code paths in main.js (turn-timeout
    // forfeit, AI fire flow, regular fire flow). For most matches only one
    // path fires, but a tightly-timed sequence (e.g. fire kills opponent
    // AND turn timeout fires concurrently) could call it twice for the
    // same round end. The bug surfaced as JJ's BO1 match showing
    // "won 2 rounds" when only 1 round was actually won. The
    // _lastRoundWinsApplied marker tracks the highest currentRound value
    // we've already incremented for, so re-entry within the same round is
    // a no-op. placementPoints / damageDealtTotal above are accumulators —
    // they're allowed to re-add — but roundWins is a counter that should
    // increment exactly once per round resolution.
    if (ranked[0]) {
        if (!matchState.roundWins) matchState.roundWins = {};
        const currentRound = matchState.currentRound ?? 0;
        const lastApplied = matchState._lastRoundWinsApplied ?? -1;
        if (currentRound > lastApplied) {
            matchState.roundWins[ranked[0]] = (matchState.roundWins[ranked[0]] || 0) + 1;
            matchState._lastRoundWinsApplied = currentRound;
        }
    }

    return ranked; // [1st, 2nd, 3rd, 4th]
}

/**
 * Check if the match is over (all rounds played) and determine the winner
 *
 * Phase 15: Rewritten for N-player placement-point model.
 * - Accepts only matchState (no hostId/playerId params)
 * - No early exit — all rounds are always played (key design decision)
 * - Winner = highest cumulative placementPoints after maxRounds
 * - Tiebreaker = total damage dealt across all rounds (damageDealtTotal)
 *
 * @param {object} matchState
 * @returns {{isOver: boolean, winner?: string}}
 */
export function isMatchOver(matchState) {
    if (matchState.currentRound < matchState.maxRounds) {
        return { isOver: false };
    }

    const players = matchState.players || [];
    const pts = matchState.placementPoints || {};

    if (players.length === 0) return { isOver: false };

    // Find max points
    let maxPts = -1;
    for (const pid of players) {
        const p = pts[pid] || 0;
        if (p > maxPts) maxPts = p;
    }

    const tied = players.filter(pid => (pts[pid] || 0) === maxPts);

    if (tied.length === 1) {
        return { isOver: true, winner: tied[0] };
    }

    // Tiebreaker: total damage dealt across all rounds
    const dmg = matchState.damageDealtTotal || {};
    tied.sort((a, b) => (dmg[b] || 0) - (dmg[a] || 0));

    return { isOver: true, winner: tied[0] };
}
