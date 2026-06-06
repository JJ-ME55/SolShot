/**
 * Shootout socket handlers — V1 multiplayer lobby + match-room wiring.
 *
 * Mirror of critter-kart.js. main.js calls initShootoutSocket(io) once
 * at startup and registerShootoutHandlers(client, io) inside
 * io.on('connection') per client.
 *
 * Checkpoint 1 scope: lobby flow only — create / join-by-code / leave /
 * ready / list. Match-start (shootout:lobby:start), match-room join
 * (shootout:joinMatch), the input → snapshot loop, combat, and per-event
 * rate-limiting all land in Checkpoint 2/3.
 *
 * Event surface (Checkpoint 1):
 *   Client → Server:
 *     shootout:lobby:create   { mode, telegramUserId, telegramUsername?, firstName? }
 *                             ack: { ok, lobbyId, code } | { error }
 *     shootout:lobby:join     { code, telegramUserId, telegramUsername?, firstName? }
 *                             ack: { ok, lobbyId, alreadyMember? } | { error }
 *     shootout:lobby:leave    { lobbyId, telegramUserId }
 *                             ack: { ok, closed? } | { error }
 *     shootout:lobby:ready    { lobbyId, telegramUserId, ready }
 *                             ack: { ok } | { error }
 *     shootout:lobby:list     { }
 *                             ack: { ok, lobbies } | { error }
 *
 *   Server → Room (room = lobby:<lobbyId>):
 *     shootout:lobby:state    { lobby }
 *     shootout:lobby:closed   { lobbyId, reason }
 *
 * Future (Checkpoint 2/3, intentionally NOT here yet):
 *     shootout:lobby:start    { lobbyId, telegramUserId }   — Task E.3
 *     shootout:joinMatch      { matchId, telegramUserId }   — Task E.3
 *     shootout:input          InputFrame                    — Checkpoint 2
 *     shootout:match:start    { matchId, ... }              — Task E.3
 *
 * Auth: V1 trusts telegramUserId in payload (verified by the JWT layer
 * at connection time). A later phase bumps this to handshake-bound
 * identity so a client can't impersonate another.
 *
 * Reference: server/socket-io/critter-kart.js (byte-for-byte template).
 */

import logger from '../services/logger.js';
import * as lobbyService from '../services/games/shootout/lobbyService.js';

// Room naming — single source of truth so we can't drift between
// :create, :join, :leave callsites.
const lobbyRoomName = (lobbyId) => `lobby:${lobbyId}`;

export function initShootoutSocket(_io) {
    // No global setup for Checkpoint 1 — no ticker, no global
    // rate-limit configuration yet. Both arrive in Checkpoint 2 when
    // shootout:input comes online.
}

export function registerShootoutHandlers(client, io) {

    // ── shootout:lobby:create ────────────────────────────────────────
    client.on('shootout:lobby:create', async (payload, ack) => {
        try {
            const res = await lobbyService.createLobby({
                mode: payload?.mode,
                telegramUserId: payload?.telegramUserId,
                telegramUsername: payload?.telegramUsername,
                firstName: payload?.firstName,
                socketId: client.id,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            client.join(room);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            ack?.({ ok: true, lobbyId: res.lobby.lobbyId, code: res.lobby.code });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:create failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:join ──────────────────────────────────────────
    // Implemented in D.3.

    // ── shootout:lobby:leave ─────────────────────────────────────────
    // Implemented in D.4.

    // ── shootout:lobby:ready ─────────────────────────────────────────
    // Implemented in D.4.

    // ── shootout:lobby:list ──────────────────────────────────────────
    // Implemented in D.4.
}

export default { initShootoutSocket, registerShootoutHandlers };
