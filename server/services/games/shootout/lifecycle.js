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
 * Slot + team source-of-truth: lobbyService.startMatch has already
 * assigned each member's `slot` (red → even, blue → odd) per the user's
 * team pick during Ready Up (Phase C, 2026-06-08). We propagate those
 * directly — no alternating-by-index rewrite. Solo lobbies fall back
 * to whatever lobbyService set (host forced to red).
 */
import { resolveMapVote } from './lobbyService.js';

export async function createMatchFromLobby({ lobby, botDifficulty } = {}) {
    const members = lobby.members.map((m) => ({
        telegramUserId: m.telegramUserId,
        displayName:    m.displayName,
        slot:           m.slot,            // already assigned in lobbyService.startMatch
        team:           m.team || 'red',   // null only possible in legacy data
    }));
    // Whitelist allowed difficulty ids — anything else (or absent)
    // falls through to the runner's default ('soldier').
    const allowedDiff = ['recruit', 'soldier', 'veteran', 'seal'];
    const safeDiff = allowedDiff.includes(botDifficulty) ? botDifficulty : undefined;
    // Resolve the lobby's map vote — winning map propagates to the
    // match payload so both clients load the same geometry.
    const mapId = resolveMapVote(lobby);
    return {
        ok: true,
        match: {
            matchId:   newMatchId(),
            lobbyId:   lobby.lobbyId,
            mode:      lobby.mode,
            mapId,
            // cap propagates through to ShootoutRunner so bot-fill can
            // honor the lobby's intended size in the < cap solo path.
            // Without this, runner._addBotsForEmptySlots falls back to
            // members.length and silently skips bot fill.
            cap:       lobby.cap,
            members,
            // Bot AI difficulty — only set when the lobby was launched
            // via the Solo flow (otherwise this is a real PvP match
            // with no bots). Read by ShootoutRunner._addBotsForEmptySlots.
            ...(safeDiff && { botDifficulty: safeDiff }),
            startedAt: Date.now(),
        },
    };
}

export default { createMatchFromLobby };
