/**
 * Shootout match lifecycle — lobby → match descriptor transition.
 *
 * Checkpoint 1 scope: one function — createMatchFromLobby — which takes
 * a STARTING-state lobby (produced by lobbyService.startMatch) and
 * returns a match descriptor suitable for handing to ShootoutRunner
 * (sim/runner.js) and emitting in the per-socket shootout:match:start
 * payload.
 *
 * Slot/team contract:
 *   - Slot is the member's index in the lobby join order (0..n-1).
 *   - Team alternates by slot: even = red, odd = blue. So:
 *       1v1   → slot 0 (red)   vs slot 1 (blue)
 *       2v2   → slots 0,2 red  vs slots 1,3 blue
 *   - This MUST match lobbyService.joinLobbyByCode's same alternating
 *     pattern. The lobby layer already pre-assigns team for client UI
 *     hints; lifecycle re-derives slot+team here as the authoritative
 *     source of truth used by the sim.
 *
 * Anti-corruption rule: only socket-io/shootout.js calls into this
 * module. The runner doesn't import lifecycle (and vice versa) —
 * everything flows top-down: handler → lifecycle → runner.
 *
 * Reference: server/services/games/critter-kart/lifecycle.js. CK has a
 * richer FSM (matched → loading → countdown → racing → finished →
 * settled); Shootout V1 is simpler — descriptor in, runner out, the
 * runner owns its own lifecycle from there. Settlement (E.4+) lives in
 * a separate function added later.
 */

import crypto from 'crypto';

// 8-byte base64url id — short, URL/log-safe, collision risk negligible
// at our concurrency.
function newMatchId() {
    return 'match-' + crypto.randomBytes(6).toString('base64url');
}

/**
 * Build a match descriptor from a lobby. The runner (E.2) stores it; the
 * socket layer (E.3) emits match:start using its fields.
 *
 * Team assignment is by slot index (alternating red/blue), so 1v1 has
 * slot 0 red vs slot 1 blue, and 2v2 has slots 0,2 red vs slots 1,3 blue.
 * Slot order is the lobby's member join order — keep it stable.
 */
export async function createMatchFromLobby({ lobby }) {
    const members = lobby.members.map((m, i) => ({
        telegramUserId: m.telegramUserId,
        displayName:    m.displayName,
        slot:           i,
        team:           i % 2 === 0 ? 'red' : 'blue',
    }));
    return {
        ok: true,
        match: {
            matchId:   newMatchId(),
            lobbyId:   lobby.lobbyId,
            mode:      lobby.mode,
            members,
            startedAt: Date.now(),
        },
    };
}

export default { createMatchFromLobby };
