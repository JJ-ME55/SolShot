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

// Mode → cap. Single source of truth, mirrors the model enum.
const MODE_CAP = { '1v1': 2, '2v2': 4 };
const CREATE_CODE_RETRIES = 5;

export function generateLobbyCode() {
    const bytes = crypto.randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return s;
}

function newId(prefix) {
    return `${prefix}-${crypto.randomBytes(6).toString('base64url')}`;
}

function formatDisplayName({ telegramUsername, firstName, telegramUserId }) {
    if (telegramUsername) return `@${telegramUsername}`;
    if (firstName) return firstName;
    return `Player ${String(telegramUserId).slice(-4)}`;
}

function isDuplicateCodeError(err) {
    return err && err.code === 11000 && err.keyPattern && err.keyPattern.code;
}

// ── Read ─────────────────────────────────────────────────────────────

export async function listOpenLobbies() {
    return ShootoutLobby.openLobbies();
}

// ── Create ───────────────────────────────────────────────────────────

export async function createLobby({
    mode, telegramUserId, telegramUsername, firstName, socketId,
}) {
    if (!LOBBY_MODES.includes(mode)) return { error: 'invalid_mode' };
    const cap = MODE_CAP[mode];
    const hostDisplay = formatDisplayName({ telegramUsername, firstName, telegramUserId });

    let lastErr = null;
    for (let attempt = 0; attempt < CREATE_CODE_RETRIES; attempt += 1) {
        const lobbyId = newId('lobby');
        const code = generateLobbyCode();
        try {
            // eslint-disable-next-line no-await-in-loop
            const lobby = await ShootoutLobby.create({
                lobbyId,
                code,
                mode,
                cap,
                state: 'OPEN',
                hostTelegramUserId: telegramUserId,
                members: [{
                    telegramUserId,
                    telegramUsername: telegramUsername || null,
                    firstName: firstName || null,
                    displayName: hostDisplay,
                    socketId: socketId || null,
                    isHost: true,
                    isReady: false,
                    team: 'red', // host takes red slot 0; opponent gets blue
                    slot: -1,
                }],
                matchId: null,
                lastActiveAt: new Date(),
            });
            logger.info('[shootout/lobby] created', {
                lobbyId, code, mode, host: telegramUserId,
            });
            return { ok: true, lobby: lobby.toObject() };
        } catch (err) {
            lastErr = err;
            if (isDuplicateCodeError(err)) {
                logger.warn('[shootout/lobby] code collision, regenerating', { code, attempt });
                continue;
            }
            throw err;
        }
    }
    logger.error('[shootout/lobby] create exhausted retries', { err: lastErr?.message });
    throw lastErr || new Error('create_failed');
}
