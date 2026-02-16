/**
 * SolShot Match State Machine
 *
 * States: LOBBY → WEAPON_SHOP → BATTLE → ROUND_END → SETTLEMENT
 *
 * Enforces that no action can happen outside its valid state.
 * E.g., can't fire during weapon_shop, can't buy during battle.
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
        [MATCH_STATES.ROUND_END]: ['playAgainRequest'],
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
 * @param {string} roomId
 * @param {string} roundType - '1', 'BO3', or 'BO5'
 * @returns {object} initial match state
 */
export function createMatchState(roomId, roundType = '1') {
    const maxRounds = roundType === 'BO5' ? 5 : roundType === 'BO3' ? 3 : 1;

    return {
        roomId,
        status: MATCH_STATES.LOBBY,
        roundType,
        maxRounds,
        currentRound: 0,
        scores: {},          // { [playerId]: totalScore }
        roundWins: {},       // { [playerId]: roundsWon }
        currentTurn: null,   // playerId whose turn it is
        turnCount: 0,
        turnSequence: 0,     // Fix 4: Nonce — increments each fire, prevents replay
        turnsPerRound: 20,   // 10 per player per round
        terrain: null,
        tankPositions: null,
        stateChangedAt: Date.now()
    };
}

/**
 * Reset turn state for a new round (H023)
 *
 * @param {object} matchState
 */
export function resetForNextRound(matchState) {
    matchState.turnCount = 0;
    matchState.turnSequence = 0;
    matchState.currentTurn = null;
}

/**
 * Determine whose turn it is next
 *
 * @param {object} matchState
 * @param {string} hostId
 * @param {string} playerId
 * @returns {string} next player's ID
 */
export function getNextTurn(matchState, hostId, playerId) {
    if (!matchState.currentTurn) {
        // First turn — random
        return Math.random() < 0.5 ? hostId : playerId;
    }
    // Alternate turns
    return matchState.currentTurn === hostId ? playerId : hostId;
}

/**
 * Check if the round is over
 *
 * @param {object} matchState
 * @returns {boolean}
 */
export function isRoundOver(matchState) {
    return matchState.turnCount >= matchState.turnsPerRound;
}

/**
 * Check if the match is over (all rounds played)
 *
 * @param {object} matchState
 * @param {string} hostId
 * @param {string} playerId
 * @returns {{isOver: boolean, winner?: string}}
 */
export function isMatchOver(matchState, hostId, playerId) {
    const hostWins = matchState.roundWins[hostId] || 0;
    const playerWins = matchState.roundWins[playerId] || 0;
    const winsNeeded = Math.ceil(matchState.maxRounds / 2);

    if (hostWins >= winsNeeded) {
        return { isOver: true, winner: hostId };
    }
    if (playerWins >= winsNeeded) {
        return { isOver: true, winner: playerId };
    }
    if (matchState.currentRound >= matchState.maxRounds) {
        // All rounds played — highest score wins
        const hostScore = matchState.scores[hostId] || 0;
        const playerScore = matchState.scores[playerId] || 0;
        if (hostScore !== playerScore) {
            return { isOver: true, winner: hostScore > playerScore ? hostId : playerId };
        }
        // Draw — could handle differently, for now host wins tiebreak
        return { isOver: true, winner: hostId };
    }

    return { isOver: false };
}

/**
 * Determine the winner of a single round
 *
 * @param {object} matchState
 * @param {string} hostId
 * @param {string} playerId
 * @returns {string} winner's ID
 */
export function getRoundWinner(matchState, hostId, playerId) {
    const hostScore = matchState.scores[hostId] || 0;
    const playerScore = matchState.scores[playerId] || 0;

    if (hostScore > playerScore) return hostId;
    if (playerScore > hostScore) return playerId;
    return hostId; // tiebreak
}
