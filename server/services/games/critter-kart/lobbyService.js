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

export async function createLobby({
    name, cap, hostTelegramUserId, hostUsername, hostFirstName, socketId,
}) {
    const clampedCap = Math.max(LOBBY_MIN_CAP, Math.min(LOBBY_MAX_CAP, Math.floor(cap || 4)));
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
    member.isReady = !!ready;
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

export function toLobbyStateWire(lobby) {
    if (!lobby) return null;
    return {
        id: lobby.lobbyId,
        name: lobby.name,
        cap: lobby.cap,
        hostUsername: lobby.hostUsername,
        members: lobby.members.map(m => ({
            username: m.displayName,
            ready: m.isReady,
            host: m.isHost,
            telegramUserId: m.telegramUserId,
        })),
        pending: lobby.pendingRequests.map(p => ({
            requestId: p.requestId,
            username: p.displayName,
        })),
        status: lobby.state === 'closed' ? 'closed' : (lobby.state === 'starting' ? 'starting' : 'open'),
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
    };
}
