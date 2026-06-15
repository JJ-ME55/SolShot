/**
 * Critter Kart lobby service — host-controlled custom-game lobbies.
 *
 * Stateless wrappers around CritterKartLobby Mongo operations. Called
 * from socket handlers in server/socket-io/critter-kart.js.
 *
 * Lobby state machine:
 *   open       — host created, accepting join requests; members can ready up
 *   starting   — host tapped Start Race; race created; race id stamped
 *   closed     — host left OR race ended OR TTL expired
 *
 * Auth model: every mutation requires telegramUserId from the socket
 * handshake JWT. Host-only operations (decision, start) check
 * hostTelegramUserId matches.
 */

import crypto from 'crypto';
import CritterKartLobby, {
    LOBBY_MIN_CAP,
    LOBBY_MAX_CAP,
} from '../../../models/CritterKartLobby.js';
import logger from '../../logger.js';

function newId(prefix) {
    return `${prefix}-${crypto.randomBytes(6).toString('base64url')}`;
}

function formatDisplayName({ telegramUsername, firstName, telegramUserId }) {
    if (telegramUsername) return `@${telegramUsername}`;
    if (firstName) return firstName;
    return `Player ${String(telegramUserId).slice(-4)}`;
}

// ── Read ─────────────────────────────────────────────────────────────

export async function listOpenLobbies() {
    return CritterKartLobby.openLobbies();
}

export async function getLobby(lobbyId) {
    return CritterKartLobby.findOne({ lobbyId }).lean();
}

export async function findLobbyForPlayer(telegramUserId) {
    return CritterKartLobby.findOne({
        state: { $in: ['open', 'starting'] },
        'members.telegramUserId': telegramUserId,
    }).lean();
}

// ── Create / join / decide / ready ───────────────────────────────────

// Short shareable join code for private lobbies (no ambiguous 0/O/1/I chars).
function genJoinCode() {
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return s;
}

export async function createLobby({
    name, cap, track, visibility, hostTelegramUserId, hostUsername, hostFirstName, socketId,
}) {
    const clampedCap = Math.max(LOBBY_MIN_CAP, Math.min(LOBBY_MAX_CAP, Math.floor(cap || 4)));
    const vis = visibility === 'private' ? 'private' : 'open';
    const lobbyId = newId('lobby');
    const hostDisplay = formatDisplayName({
        telegramUsername: hostUsername,
        firstName: hostFirstName,
        telegramUserId: hostTelegramUserId,
    });
    const lobby = await CritterKartLobby.create({
        lobbyId,
        name: (name || `${hostDisplay}'s race`).slice(0, 60),
        hostTelegramUserId,
        hostUsername: hostDisplay,
        cap: clampedCap,
        state: 'open',
        track: track || 'meadow',
        visibility: vis,
        code: vis === 'private' ? genJoinCode() : null,
        members: [{
            telegramUserId: hostTelegramUserId,
            telegramUsername: hostUsername || null,
            firstName: hostFirstName || null,
            displayName: hostDisplay,
            socketId,
            isHost: true,
            isReady: false,
        }],
        pendingRequests: [],
        lastActiveAt: new Date(),
    });
    logger.info('[critter-kart/lobby] created', { lobbyId, host: hostTelegramUserId, cap: clampedCap });
    return lobby.toObject();
}

/**
 * Player asks to join. Two flows depending on host policy: currently
 * always-pending (host must accept). If we add an open-join setting
 * later, this becomes a switch.
 */
/**
 * Unified join entry. OPEN lobby (found by lobbyId from the browse list) → the
 * joiner is added straight to members (no host approval). PRIVATE lobby → must
 * be reached by `code`; the joiner goes into pendingRequests for the host to
 * accept (the existing request/accept handshake). Returns { lobby, joined } for
 * an instant open join, or { lobby, requestId } for a private request.
 */
export async function joinLobby({
    lobbyId, code, telegramUserId, telegramUsername, firstName, socketId,
}) {
    // Resolve by code (private) or lobbyId (open browse).
    const query = code ? { code: String(code).toUpperCase(), state: 'open' } : { lobbyId, state: 'open' };
    const lobby = await CritterKartLobby.findOne(query);
    if (!lobby) throw new Error(code ? 'invalid_code' : `lobby ${lobbyId} not open`);

    // Already a member? (idempotent — e.g. reconnect)
    if (lobby.members.find(m => m.telegramUserId === telegramUserId)) {
        return { lobby: lobby.toObject(), joined: true, alreadyMember: true };
    }

    if (lobby.visibility === 'private') {
        // Private → request/accept handshake (reuses requestJoin against this id).
        return requestJoin({ lobbyId: lobby.lobbyId, telegramUserId, telegramUsername, firstName, socketId });
    }

    // OPEN → instant join. Capacity = members only (no pending on open lobbies).
    if (lobby.members.length >= lobby.cap) throw new Error('lobby_full');
    const displayName = formatDisplayName({ telegramUsername, firstName, telegramUserId });
    lobby.members.push({
        telegramUserId,
        telegramUsername: telegramUsername || null,
        firstName: firstName || null,
        displayName,
        socketId,
        isHost: false,
        isReady: false,
    });
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[critter-kart/lobby] open join', { lobbyId: lobby.lobbyId, joiner: telegramUserId });
    return { lobby: lobby.toObject(), joined: true };
}

export async function requestJoin({
    lobbyId, telegramUserId, telegramUsername, firstName, socketId,
}) {
    const lobby = await CritterKartLobby.findOne({ lobbyId, state: 'open' });
    if (!lobby) throw new Error(`lobby ${lobbyId} not open`);
    // Already a member?
    if (lobby.members.find(m => m.telegramUserId === telegramUserId)) {
        return { lobby: lobby.toObject(), alreadyMember: true };
    }
    // Already pending?
    const existing = lobby.pendingRequests.find(p => p.telegramUserId === telegramUserId);
    if (existing) {
        return { lobby: lobby.toObject(), requestId: existing.requestId, alreadyPending: true };
    }
    if (lobby.members.length + lobby.pendingRequests.length >= lobby.cap) {
        throw new Error('lobby_full');
    }
    const requestId = newId('req');
    const displayName = formatDisplayName({ telegramUsername, firstName, telegramUserId });
    lobby.pendingRequests.push({
        requestId,
        telegramUserId,
        telegramUsername: telegramUsername || null,
        displayName,
        socketId,
    });
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[critter-kart/lobby] join requested', {
        lobbyId, requester: telegramUserId,
    });
    return { lobby: lobby.toObject(), requestId };
}

/**
 * Host accepts or declines a pending request.
 */
export async function decideRequest({
    lobbyId, hostTelegramUserId, requestId, accept,
}) {
    const lobby = await CritterKartLobby.findOne({ lobbyId, state: 'open' });
    if (!lobby) throw new Error('lobby_not_found');
    if (lobby.hostTelegramUserId !== hostTelegramUserId) throw new Error('not_host');
    const idx = lobby.pendingRequests.findIndex(p => p.requestId === requestId);
    if (idx < 0) throw new Error('request_not_found');
    const req = lobby.pendingRequests[idx];
    lobby.pendingRequests.splice(idx, 1);
    if (accept) {
        if (lobby.members.length >= lobby.cap) throw new Error('lobby_full');
        lobby.members.push({
            telegramUserId: req.telegramUserId,
            telegramUsername: req.telegramUsername,
            firstName: null,
            displayName: req.displayName,
            socketId: req.socketId,
            isHost: false,
            isReady: false,
        });
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[critter-kart/lobby] decision', {
        lobbyId, requester: req.telegramUserId, accept,
    });
    return { lobby: lobby.toObject(), accepted: !!accept, requester: req };
}

export async function setReady({ lobbyId, telegramUserId, ready }) {
    const lobby = await CritterKartLobby.findOne({ lobbyId, state: 'open' });
    if (!lobby) throw new Error('lobby_not_found');
    const member = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (!member) throw new Error('not_member');
    // Must have picked a character before readying up (slice 3).
    if (ready && !member.racerId) throw new Error('pick_a_character_first');
    member.isReady = !!ready;
    lobby.lastActiveAt = new Date();
    await lobby.save();
    return lobby.toObject();
}

/**
 * In-lobby character pick. Sets the member's racerId, enforcing uniqueness across
 * the lobby (rejects a racer another member already holds — the client greys
 * taken ones out, this is the authoritative guard against a simultaneous pick).
 * Changing your pick clears your ready flag (you must re-ready).
 */
export async function pickRacer({ lobbyId, telegramUserId, racerId }) {
    const lobby = await CritterKartLobby.findOne({ lobbyId, state: 'open' });
    if (!lobby) throw new Error('lobby_not_found');
    const member = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (!member) throw new Error('not_member');
    if (lobby.members.some(m => m.telegramUserId !== telegramUserId && m.racerId === racerId)) {
        throw new Error('racer_taken');
    }
    member.racerId = racerId;
    member.isReady = false; // re-ready after changing character
    lobby.lastActiveAt = new Date();
    await lobby.save();
    return lobby.toObject();
}

export async function leaveLobby({ lobbyId, telegramUserId }) {
    const lobby = await CritterKartLobby.findOne({ lobbyId });
    if (!lobby) return null;
    if (lobby.hostTelegramUserId === telegramUserId) {
        // Host left → close lobby
        lobby.state = 'closed';
        lobby.closedAt = new Date();
        await lobby.save();
        logger.info('[critter-kart/lobby] closed (host left)', { lobbyId });
        return { lobby: lobby.toObject(), closed: true };
    }
    const idx = lobby.members.findIndex(m => m.telegramUserId === telegramUserId);
    if (idx >= 0) {
        lobby.members.splice(idx, 1);
        lobby.lastActiveAt = new Date();
        await lobby.save();
        return { lobby: lobby.toObject(), closed: false };
    }
    // Was a pending? Remove that too
    const pIdx = lobby.pendingRequests.findIndex(p => p.telegramUserId === telegramUserId);
    if (pIdx >= 0) {
        lobby.pendingRequests.splice(pIdx, 1);
        lobby.lastActiveAt = new Date();
        await lobby.save();
        return { lobby: lobby.toObject(), closed: false };
    }
    return { lobby: lobby.toObject(), closed: false };
}

/**
 * Host starts the race. Stamps raceId on the lobby and transitions to
 * 'starting'. Caller (socket layer) then invokes lifecycle.createRace
 * with the member list. We don't import createRace here to avoid a
 * circular dep between lobbyService and lifecycle.
 */
export async function markStarting({ lobbyId, hostTelegramUserId, raceId }) {
    const lobby = await CritterKartLobby.findOneAndUpdate(
        { lobbyId, state: 'open', hostTelegramUserId },
        {
            $set: {
                state: 'starting',
                raceId,
                lastActiveAt: new Date(),
            },
        },
        { new: true },
    );
    if (!lobby) throw new Error('lobby_not_open_or_not_host');
    return lobby.toObject();
}

export async function markClosed({ lobbyId, reason }) {
    const lobby = await CritterKartLobby.findOneAndUpdate(
        { lobbyId, state: { $ne: 'closed' } },
        { $set: { state: 'closed', closedAt: new Date() } },
        { new: true },
    );
    if (lobby) logger.info('[critter-kart/lobby] closed', { lobbyId, reason });
    return lobby ? lobby.toObject() : null;
}

// ── Shape helpers — wire-friendly lobby state for clients ─────────────

// Must stay in sync with lifecycle.js's racerIdForSlot — the lobby
// preview character has to match what the race will actually assign,
// or every player sees themselves switch character at race start.
// Random assignment lives in lifecycle.js (see ROSTER_RACER_IDS); we
// mirror it here purely for cosmetic preview in the lobby UI.
// Must mirror lifecycle.js's ROSTER_RACER_IDS exactly (all 6 chars —
// rusty, shelly, pip, bruno, jj, fish) so the lobby preview shows the
// same character the race will actually assign. JJ's "no duplicates"
// requirement 2026-06-08.
const LOBBY_PREVIEW_RACER_IDS = ['rusty', 'shelly', 'pip', 'bruno', 'jj', 'fish'];
const lobbyPreviewRacerForSlot = (i) =>
    LOBBY_PREVIEW_RACER_IDS[i % LOBBY_PREVIEW_RACER_IDS.length];

export function toLobbyStateWire(lobby) {
    if (!lobby) return null;
    return {
        id: lobby.lobbyId,
        name: lobby.name,
        cap: lobby.cap,
        hostUsername: lobby.hostUsername,
        members: lobby.members.map((m) => ({
            username: m.displayName,
            ready: m.isReady,
            host: m.isHost,
            telegramUserId: m.telegramUserId,
            // The member's CHOSEN character (slice 3). null = not yet picked →
            // the client shows the picker / "choosing…". Uniqueness enforced in
            // pickRacer; carried into the race by lobby:start → createRace.
            racerId: m.racerId || null,
        })),
        pending: lobby.pendingRequests.map(p => ({
            requestId: p.requestId,
            username: p.displayName,
        })),
        status: lobby.state === 'closed' ? 'closed' : (lobby.state === 'starting' ? 'starting' : 'open'),
        track: lobby.track || 'meadow',
        visibility: lobby.visibility || 'open',
        code: lobby.code || null, // shareable join code (private lobbies); members re-share it
        createdAt: (lobby.createdAt ? new Date(lobby.createdAt).getTime() : Date.now()), // for the 30-min expiry chip
    };
}

export function toLobbySummaryWire(lobby) {
    return {
        id: lobby.lobbyId,
        name: lobby.name,
        hostUsername: lobby.hostUsername,
        cap: lobby.cap,
        joinedCount: lobby.members.length,
        status: lobby.state === 'starting' ? 'starting' : 'open',
        track: lobby.track || 'meadow', // for the track color-chip on browser rows
    };
}
