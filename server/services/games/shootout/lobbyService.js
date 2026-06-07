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

// ── Ready ────────────────────────────────────────────────────────────

export async function setReady({ lobbyId, telegramUserId, ready }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    const member = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (!member) return { error: 'not_member' };

    member.isReady = !!ready;

    // FULL → READY when everyone's ready. READY → FULL the moment
    // anyone un-readies. Pre-FULL states (OPEN) don't transition — you
    // can flip the flag but the gate doesn't open until at cap.
    if (lobby.state === 'FULL' && lobby.members.every(m => m.isReady)) {
        lobby.state = 'READY';
    } else if (lobby.state === 'READY' && !lobby.members.every(m => m.isReady)) {
        lobby.state = 'FULL';
    }

    lobby.lastActiveAt = new Date();
    await lobby.save();
    return { ok: true, lobby: lobby.toObject() };
}

// ── Start match ──────────────────────────────────────────────────────

/**
 * Host pulls the trigger. Stamps matchId on the lobby, assigns slots
 * 0..n-1 in join order, and transitions to 'STARTING'. The lifecycle
 * layer reads back members + slots + teams from the returned doc to
 * create the ShootoutMatch and seed the sim. We don't import lifecycle
 * here to avoid a circular dep.
 *
 * Options:
 *   allowSolo (default false) — when true, the normal "state === READY"
 *   gate is relaxed: any OPEN/FULL/READY lobby can start, and the
 *   ready-flag on the host is implicitly forced on. The runner's
 *   bot-fill step then fills the empty slots with SimBots. Used by the
 *   "play vs bots through the MP server" entry point on the client so
 *   the same socket path is exercised in solo and full lobbies.
 */
export async function startMatch({ lobbyId, telegramUserId, allowSolo = false }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    if (lobby.hostTelegramUserId !== telegramUserId) return { error: 'not_host' };
    if (!allowSolo) {
        if (lobby.state !== 'READY') return { error: 'not_ready' };
    } else {
        // Solo path: must at least be a startable lobby state (not
        // already STARTING / IN_MATCH / CLOSED). Stamp readiness on the
        // host so down-stream consumers see a coherent record.
        if (!['OPEN', 'FULL', 'READY'].includes(lobby.state)) {
            return { error: 'not_startable' };
        }
        const host = lobby.members.find(m => m.telegramUserId === telegramUserId);
        if (host) host.isReady = true;
    }

    const matchId = newId('match');
    lobby.matchId = matchId;
    lobby.state = 'STARTING';
    for (let i = 0; i < lobby.members.length; i += 1) {
        lobby.members[i].slot = i;
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] starting', {
        lobbyId, matchId, host: telegramUserId, count: lobby.members.length,
        solo: !!allowSolo,
    });
    return { ok: true, matchId, lobby: lobby.toObject() };
}
