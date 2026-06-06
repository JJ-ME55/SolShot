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

// ── Join ─────────────────────────────────────────────────────────────

export async function joinLobbyByCode({
    code, telegramUserId, telegramUsername, firstName, socketId,
}) {
    const lobby = await ShootoutLobby.findOne({ code });
    if (!lobby) return { error: 'lobby_not_found' };

    // Idempotent re-join: same telegramUserId already a member → update
    // socketId and return the existing lobby (no dup, no state change).
    const existing = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (existing) {
        if (socketId !== undefined) existing.socketId = socketId || null;
        lobby.lastActiveAt = new Date();
        await lobby.save();
        return { ok: true, lobby: lobby.toObject(), alreadyMember: true };
    }

    // Capacity: respect either an already-FULL state or a stale-state
    // doc whose members array is already at cap (defensive against
    // race between findOne and prior save).
    if (lobby.state === 'FULL' || lobby.members.length >= lobby.cap) {
        return { error: 'lobby_full' };
    }

    const displayName = formatDisplayName({ telegramUsername, firstName, telegramUserId });
    const slotIndex = lobby.members.length;
    lobby.members.push({
        telegramUserId,
        telegramUsername: telegramUsername || null,
        firstName: firstName || null,
        displayName,
        socketId: socketId || null,
        isHost: false,
        isReady: false,
        // Alternating red/blue by join order: 0=red, 1=blue, 2=red, 3=blue.
        // Final slots are assigned at startMatch (member.slot).
        team: slotIndex % 2 === 0 ? 'red' : 'blue',
        slot: -1,
    });

    if (lobby.members.length >= lobby.cap) lobby.state = 'FULL';
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] joined', {
        lobbyId: lobby.lobbyId, code, joiner: telegramUserId, state: lobby.state,
    });
    return { ok: true, lobby: lobby.toObject() };
}

// ── Leave ────────────────────────────────────────────────────────────

export async function leaveLobby({ lobbyId, telegramUserId }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };

    const idx = lobby.members.findIndex(m => m.telegramUserId === telegramUserId);
    if (idx < 0) {
        // Non-member — defensively no-op. Don't bump activity.
        return { ok: true, lobby: lobby.toObject() };
    }

    const wasHost = lobby.members[idx].isHost
        || lobby.hostTelegramUserId === telegramUserId;
    lobby.members.splice(idx, 1);

    if (lobby.members.length === 0) {
        // Last out closes the lobby.
        lobby.state = 'CLOSED';
        lobby.closedAt = new Date();
        await lobby.save();
        logger.info('[shootout/lobby] closed (last member left)', { lobbyId });
        return { ok: true, closed: true, lobby: lobby.toObject() };
    }

    if (wasHost) {
        // Transfer host token to next-joined (now first) member.
        lobby.members[0].isHost = true;
        lobby.hostTelegramUserId = lobby.members[0].telegramUserId;
    }
    if (lobby.state === 'FULL' && lobby.members.length < lobby.cap) {
        lobby.state = 'OPEN';
    }
    // Leaving while READY drops the ready-state — caller's invariant is
    // "READY = all-ready AND at-cap"; with fewer members we're no longer
    // at cap.
    if (lobby.state === 'READY' && lobby.members.length < lobby.cap) {
        lobby.state = 'OPEN';
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] left', {
        lobbyId, leaver: telegramUserId, wasHost, state: lobby.state,
    });
    return { ok: true, lobby: lobby.toObject() };
}
