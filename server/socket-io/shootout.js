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
 *     shootout:lobby:start    { lobbyId, telegramUserId }
 *                             ack: { ok, matchId } | { error }
 *     shootout:joinMatch      { matchId, telegramUserId }
 *                             ack: { ok, slot } | { error }
 *
 *   Server → Room (room = lobby:<lobbyId>):
 *     shootout:lobby:state    { lobby }
 *     shootout:lobby:closed   { lobbyId, reason }
 *
 *   Server → individual socket (NEVER a broadcast — see gotcha #5):
 *     shootout:match:start    { matchId, lobbyId, mode, startAtMs,
 *                               members, yourSlot }
 *
 * Future (Checkpoint 2/3, intentionally NOT here yet):
 *     shootout:input          InputFrame                    — Checkpoint 2
 *     shootout:snapshot       SnapshotFrame                 — Checkpoint 2
 *
 * Auth: V1 trusts telegramUserId in payload (verified by the JWT layer
 * at connection time). A later phase bumps this to handshake-bound
 * identity so a client can't impersonate another.
 *
 * Reference: server/socket-io/critter-kart.js (byte-for-byte template).
 */

import logger from '../services/logger.js';
import * as lobbyService from '../services/games/shootout/lobbyService.js';
import * as lifecycle from '../services/games/shootout/lifecycle.js';
import { ShootoutRunner } from '../services/games/shootout/sim/runner.js';

// ── Module-level state ───────────────────────────────────────────────
// One ShootoutRunner per in-flight match, keyed by matchId. Populated by
// shootout:lobby:start, drained by Checkpoint 3's settle/cleanup path.
//
// Exported with a leading underscore as a TEST-ONLY hook so unit tests
// can seed and inspect. Production code never touches this directly —
// the handlers below are the only writers.
export const _activeMatches = new Map(); // matchId → ShootoutRunner

// Room name for match broadcasts. Single source of truth so the start
// handler (which DOES NOT join) and the joinMatch handler (which DOES)
// can't drift.
const matchRoomName = (matchId) => `match:${matchId}`;

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

    // ── shootout:lobby:start ─────────────────────────────────────────
    //
    // Host pulls the trigger. lobbyService.startMatch stamps matchId on
    // the lobby (READY → STARTING). lifecycle.createMatchFromLobby
    // builds the descriptor. ShootoutRunner is parked in _activeMatches
    // so the per-socket shootout:joinMatch can find it.
    //
    // TWO GOTCHA FIXES baked in here that Critter Kart had to patch at
    // run-time — every reviewer should re-read both before touching
    // this handler:
    //
    // GOTCHA #1 — DO NOT socket.join(matchRoom) on this handler.
    //   Snapshots will start firing once Checkpoint 2 lands; if we join
    //   the broadcast room here and the client's screen-mount is async,
    //   the client misses the early ticks and silently runs its own
    //   local sim → desync. The fix: the client emits shootout:joinMatch
    //   AFTER its screen mounts; only then does the server bind the
    //   socket to the match room. See the :joinMatch handler below.
    //
    // GOTCHA #5 — DO NOT broadcast match:start to the lobby room.
    //   A single io.to(lobbyRoom).emit('shootout:match:start', payload)
    //   would deliver the same payload to every member-socket. Each
    //   client then does an Array.find by username to figure out its
    //   own slot. Two devices logged into the same TG account → same
    //   username → both find slot 0 first → both think they're slot 0
    //   → match desync. The fix: emit to EACH member-socket
    //   INDIVIDUALLY with that socket's own yourSlot value baked in.
    // Shared core: stamp match descriptor, spin up runner, broadcast
    // match:start per-socket. Used by both :start (full lobby) and
    // :startSolo (host alone with bot-fill).
    async function _startCommon({ lobbyId, telegramUserId, allowSolo, ack }) {
        const startRes = await lobbyService.startMatch({
            lobbyId, telegramUserId, allowSolo: !!allowSolo,
        });
        if (startRes?.error) return ack?.({ error: startRes.error });

        const matchRes = await lifecycle.createMatchFromLobby({ lobby: startRes.lobby });
        if (matchRes?.error) return ack?.({ error: matchRes.error });

        const runner = new ShootoutRunner({ match: matchRes.match, io });
        _activeMatches.set(matchRes.match.matchId, runner);

        // Day 2 (1.3): auto-start the runner so snapshots fire as soon
        // as a client emits shootout:joinMatch. Wrap so a runner-init
        // failure doesn't crash the lobby:start handler — the start
        // ack still fires; the runner failure logs upstream.
        try {
            runner.start();
        } catch (err) {
            logger.error({ err, matchId: matchRes.match.matchId }, 'runner.start() failed');
        }

        // GOTCHA #5: per-socket emit with each socket's own yourSlot.
        // GOTCHA #1: NO socket.join(matchRoomName(...)) here.
        for (const m of matchRes.match.members) {
            const lobbyMember = startRes.lobby.members.find(
                (lm) => lm.telegramUserId === m.telegramUserId,
            );
            if (!lobbyMember?.socketId) continue;
            const memberSock = io.sockets.sockets.get(lobbyMember.socketId);
            if (!memberSock) continue;
            memberSock.emit('shootout:match:start', {
                matchId:   matchRes.match.matchId,
                lobbyId:   matchRes.match.lobbyId,
                mode:      matchRes.match.mode,
                startAtMs: matchRes.match.startedAt,
                members:   matchRes.match.members,
                yourSlot:  m.slot,
            });
        }

        logger.info('[shootout] match starting', {
            matchId: matchRes.match.matchId,
            lobbyId: matchRes.match.lobbyId,
            members: matchRes.match.members.length,
            solo:    !!allowSolo,
        });
        ack?.({ ok: true, matchId: matchRes.match.matchId });
    }

    client.on('shootout:lobby:start', async (payload, ack) => {
        try {
            await _startCommon({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
                allowSolo: false,
                ack,
            });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:start failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:startSolo ─────────────────────────────────────
    //
    // Host can start with sub-cap members; the runner's bot-fill
    // populates empty slots. Used by the standalone client's
    // "Solo vs Bot" entry on the lobby panel. Same downstream contract
    // as :start (match:start emitted per-socket, runner spun up, room
    // bind deferred to :joinMatch per gotcha #1).
    client.on('shootout:lobby:startSolo', async (payload, ack) => {
        try {
            await _startCommon({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
                allowSolo: true,
                ack,
            });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:startSolo failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:input ───────────────────────────────────────────────
    //
    // Per-frame movement / look input from a connected match client.
    // 30Hz sustained — must be in RL_EXEMPT_EVENTS (see
    // server/socket-io/main.js, gotcha #2 from the multiplayer brief).
    //
    // No ack — input is fire-and-forget. The runner is authoritative; a
    // dropped frame is no worse than 33ms of stale input, and the next
    // frame supersedes it. Out-of-order seq is dropped inside
    // runner.setInput.
    //
    // No payload validation beyond shape checking — runner.setInput
    // coerces numerics and clamps booleans defensively.
    client.on('shootout:input', (payload) => {
        const matchId = payload?.matchId;
        const slot    = payload?.slot;
        if (matchId == null || slot == null) return;
        const runner = _activeMatches.get(matchId);
        if (!runner) return;
        runner.setInput(slot, {
            seq:       payload.seq,
            moveX:     payload.moveX,
            moveZ:     payload.moveZ,
            lookYaw:   payload.lookYaw,
            lookPitch: payload.lookPitch,
            jump:      payload.jump,
            crouch:    payload.crouch,
        });
    });

    // ── shootout:fire ────────────────────────────────────────────────
    //
    // Server-authoritative hitscan. Client sends ray origin/dir + a
    // clientTickFired so the runner can lag-comp rewind. On a hit, we
    // broadcast shootout:match:hit to the room so every client renders
    // the blood VFX / hit-marker / kill feed; on a miss we ack quietly
    // (the shooter still gets predictive local feedback either way).
    //
    // Rate-limit lives at the main.js level via RL_EXEMPT_EVENTS — fire
    // is NOT exempted, so the global per-event RL applies as a coarse
    // anti-spam (the runner's per-weapon fireRate enforcement lands in
    // a later checkpoint).
    client.on('shootout:fire', (payload, ack) => {
        try {
            const matchId = payload?.matchId;
            const slot    = payload?.slot;
            if (matchId == null || slot == null) {
                return ack?.({ error: 'bad_payload' });
            }
            const runner = _activeMatches.get(matchId);
            if (!runner) return ack?.({ error: 'no_match' });

            const res = runner.resolveFire(slot, {
                seq:             payload.seq,
                fromX:           payload.fromX,
                fromY:           payload.fromY,
                fromZ:           payload.fromZ,
                dirX:            payload.dirX,
                dirY:            payload.dirY,
                dirZ:            payload.dirZ,
                clientTickFired: payload.clientTickFired,
                weaponType:      payload.weaponType,
            });
            if (!res?.ok) return ack?.({ error: res?.reason || 'miss' });

            io.to(runner.roomName).emit('shootout:match:hit', {
                shooterSlot: slot,
                victimSlot:  res.victim,
                zone:        res.zone,
                damageDealt: res.damageDealt,
                killed:      res.killed,
                isHeadshot:  res.isHeadshot,
                weaponType:  payload.weaponType,
                remainingHp: res.remainingHp,
            });
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:fire failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:joinMatch ───────────────────────────────────────────
    //
    // The client emits this AFTER receiving shootout:match:start AND
    // mounting its in-match screen. Only at that point is the socket
    // safe to bind to the broadcast room — see gotcha #1 above.
    //
    // The ack carries the authoritative slot for this socket. Clients
    // already received yourSlot in match:start; re-acking it here is
    // belt-and-braces for the read-after-mount flow.
    client.on('shootout:joinMatch', (payload, ack) => {
        const matchId        = payload?.matchId;
        const telegramUserId = payload?.telegramUserId;
        const runner = _activeMatches.get(matchId);
        if (!runner) return ack?.({ error: 'match_not_found' });
        const member = runner.match.members.find(
            (m) => m.telegramUserId === telegramUserId,
        );
        if (!member) return ack?.({ error: 'not_a_member' });

        // GOTCHA #1: this is the ONLY place the socket enters the match
        // room. Snapshots emitted by the runner (Checkpoint 2) will
        // reach this socket from here on.
        client.join(runner.roomName);
        ack?.({ ok: true, slot: member.slot });
    });
}

export default { initShootoutSocket, registerShootoutHandlers };
