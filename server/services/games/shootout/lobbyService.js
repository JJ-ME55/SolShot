/**
 * Shootout lobby service — host-controlled 1v1 / 2v2 lobbies.
 *
 * Stateless wrappers around ShootoutLobby Mongo operations. Called
 * from socket handlers in server/socket-io/shootout.js (Phase D).
 *
 * Lobby state machine (mirrors ShootoutLobby model):
 *   OPEN      — created, accepting joins; not yet at cap
 *   FULL      — at cap; members ready up
 *   READY     — all members marked ready; host can start
 *   STARTING  — host tapped Start; matchId stamped; lifecycle takes over
 *   IN_MATCH  — match in progress (set by lifecycle layer)
 *   CLOSED    — host left empty, last member left, or TTL expired
 *
 * Auth model: every mutation requires telegramUserId from the socket
 * handshake JWT. Host-only operations (start) check
 * hostTelegramUserId matches.
 *
 * Reference: server/services/games/critter-kart/lobbyService.js. The
 * shootout state machine is richer than CK's (OPEN/FULL/READY/STARTING
 * vs CK's flat open/starting/closed) because Shootout needs an explicit
 * ready-gate before the host can pull the trigger.
 */

import crypto from 'crypto';
import ShootoutLobby, {
    LOBBY_MODES,
} from '../../../models/ShootoutLobby.js';
import logger from '../../logger.js';

// No 0/O/1/I/L (visually ambiguous in mono fonts on shared codes).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateLobbyCode() {
    const bytes = crypto.randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return s;
}
