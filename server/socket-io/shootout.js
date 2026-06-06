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
    client.on('shootout:lobby:join', async (payload, ack) => {
        try {
            const res = await lobbyService.joinLobbyByCode({
                code: payload?.code,
                telegramUserId: payload?.telegramUserId,
                telegramUsername: payload?.telegramUsername,
                firstName: payload?.firstName,
                socketId: client.id,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            client.join(room);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            ack?.({
                ok: true,
                lobbyId: res.lobby.lobbyId,
                ...(res.alreadyMember ? { alreadyMember: true } : {}),
            });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:join failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:leave ─────────────────────────────────────────
    // When the last member leaves, lobbyService.leaveLobby returns
    // { ok, closed: true, lobby } — we surface that as a
    // shootout:lobby:closed broadcast (reason='empty') instead of the
    // usual state broadcast, so any straggling sockets in the room
    // (e.g. a slow re-render) can react.
    client.on('shootout:lobby:leave', async (payload, ack) => {
        try {
            const res = await lobbyService.leaveLobby({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            if (res.closed) {
                io.to(room).emit('shootout:lobby:closed', {
                    lobbyId: res.lobby.lobbyId,
                    reason: 'empty',
                });
            } else {
                io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            }
            client.leave(room);
            ack?.({ ok: true, ...(res.closed ? { closed: true } : {}) });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:leave failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:ready ─────────────────────────────────────────
    client.on('shootout:lobby:ready', async (payload, ack) => {
        try {
            const res = await lobbyService.setReady({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
                ready: payload?.ready,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:ready failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:list ──────────────────────────────────────────
    // Read-only — no room broadcast, answer goes back in the ack.
    client.on('shootout:lobby:list', async (_payload, ack) => {
        try {
            const lobbies = await lobbyService.listOpenLobbies();
            ack?.({ ok: true, lobbies });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:list failed');
            ack?.({ error: 'internal' });
        }
    });
}

export default { initShootoutSocket, registerShootoutHandlers };
