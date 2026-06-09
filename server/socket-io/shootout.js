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
import { armCountdown, cancelCountdown } from '../services/games/shootout/lobbyCountdown.js';
import {
    joinQueue       as mmJoinQueue,
    cancelQueue     as mmCancelQueue,
    scrubBySocket   as mmScrubBySocket,
} from '../services/games/shootout/matchmaking.js';
import ShootoutLobby from '../models/ShootoutLobby.js';

// ── Module-level state ───────────────────────────────────────────────
// One ShootoutRunner per in-flight match, keyed by matchId. Populated by
// shootout:lobby:start, drained by Checkpoint 3's settle/cleanup path.
//
// Exported with a leading underscore as a TEST-ONLY hook so unit tests
// can seed and inspect. Production code never touches this directly —
// the handlers below are the only writers.
export const _activeMatches = new Map(); // matchId → ShootoutRunner

// Phase 3 (2026-06-08): module-scoped room name for the live Open
// Lobbies browser. Subscribers join via shootout:openLobbies:subscribe
// and receive shootout:openLobbies:update on every state change that
// could affect the open-lobby set.
const OPEN_LOBBIES_ROOM = 'shootout:openLobbies';

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
                // Phase 3 (2026-06-08): Custom Game options.
                // Defaults preserve back-compat with the existing
                // Create Lobby flow (private + friendly).
                visibility: payload?.visibility,
                gameType:   payload?.gameType,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            client.join(room);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            _broadcastOpenLobbies();
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
            _broadcastOpenLobbies();
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
                // Lobby gone — cancel any in-flight countdown.
                cancelCountdown(res.lobby.lobbyId);
            } else {
                io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
                _syncCountdown(res.lobby);
            }
            _broadcastOpenLobbies();
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
            _syncCountdown(res.lobby);
            _broadcastOpenLobbies();
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:ready failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:voteMap (Phase MP-maps, 2026-06-09) ──────────
    // Live map voting in the lobby. Members pass {lobbyId, mapId}
    // to vote, or {lobbyId, mapId: null} to cancel. The winning map
    // is computed at match-start via lobbyService.resolveMapVote.
    client.on('shootout:lobby:voteMap', async (payload, ack) => {
        try {
            const res = await lobbyService.voteMap({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
                mapId: payload?.mapId == null ? null : String(payload.mapId),
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            _broadcastOpenLobbies();
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:voteMap failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:match:forfeit (Phase MP-maps, 2026-06-09) ──────────
    // Player gives up mid-match. We end the runner and broadcast a
    // synthetic match:final to all clients in the match room so they
    // all return to landing together. Opposing team wins.
    client.on('shootout:match:forfeit', (payload, ack) => {
        try {
            const matchId = payload?.matchId;
            const telegramUserId = payload?.telegramUserId;
            const runner = _activeMatches.get(matchId);
            if (!runner) return ack?.({ error: 'match_not_found' });
            // Identify forfeiting player + winning team.
            const forfeitPlayer = runner.players?.find?.(
                (p) => p.telegramUserId === telegramUserId,
            );
            const forfeitTeam = forfeitPlayer?.team;
            const winningTeam = forfeitTeam === 'red' ? 'blue' : 'red';
            // Synth match:final payload (opposing team wins by
            // default; deaths/kills snapshot whatever's accumulated).
            const players = (runner.players || []).map((p) => ({
                slot:           p.slot,
                telegramUserId: p.telegramUserId,
                displayName:    p.displayName,
                team:           p.team,
                isBot:          p.isBot,
                kills:          p.kills || 0,
                deaths:         p.deaths || 0,
                won:            p.team === winningTeam,
            }));
            io.to(runner.roomName).emit('shootout:match:final', {
                matchId,
                matchWinner: winningTeam,
                winsRed:     runner.matchState?.winsRed  || 0,
                winsBlue:    runner.matchState?.winsBlue || 0,
                players,
                forfeit:     true,
                forfeitedBy: forfeitTeam,
            });
            runner.stop?.();
            _activeMatches.delete(matchId);
            logger.info('[shootout] match forfeited', {
                matchId, by: telegramUserId, team: forfeitTeam,
            });
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:match:forfeit failed');
            ack?.({ error: 'internal' });
        }
    });

    // ── shootout:lobby:pickTeam (Phase C, 2026-06-08) ───────────────
    // Member picks Red or Blue during Ready Up. Strict balance gate
    // (1v1: 1-1, 2v2: 2-2) is enforced in lobbyService.pickTeam +
    // re-checked in setReady's READY transition + double-checked in
    // startMatch as belt-and-braces.
    client.on('shootout:lobby:pickTeam', async (payload, ack) => {
        try {
            const res = await lobbyService.pickTeam({
                lobbyId: payload?.lobbyId,
                telegramUserId: payload?.telegramUserId,
                team: payload?.team,
            });
            if (res?.error) return ack?.({ error: res.error });
            const room = lobbyRoomName(res.lobby.lobbyId);
            io.to(room).emit('shootout:lobby:state', { lobby: res.lobby });
            _syncCountdown(res.lobby);
            _broadcastOpenLobbies();
            ack?.({ ok: true });
        } catch (err) {
            logger.error({ err }, 'shootout:lobby:pickTeam failed');
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

    // ── shootout:openLobbies:* (Phase 3, 2026-06-08) ────────────────
    //
    // Live-updating Open Lobbies browser. Client subscribes once when
    // the Open Lobbies panel mounts, server adds the socket to the
    // OPEN_LOBBIES_ROOM, then any time the open-lobby set changes
    // (create with visibility=open, join, leave, ready transition,
    // match start, etc.) the server pushes a fresh full list to that
    // room. Client unsubscribes on panel unmount.
    //
    // OPEN_LOBBIES_ROOM is module-scoped (see top of file).
    client.on('shootout:openLobbies:subscribe', async (_payload, ack) => {
        try {
            client.join(OPEN_LOBBIES_ROOM);
            const lobbies = await lobbyService.listOpenLobbies();
            ack?.({ ok: true, lobbies });
        } catch (err) {
            logger.error({ err }, 'shootout:openLobbies:subscribe failed');
            ack?.({ error: 'internal' });
        }
    });

    client.on('shootout:openLobbies:unsubscribe', (_payload, ack) => {
        client.leave(OPEN_LOBBIES_ROOM);
        ack?.({ ok: true });
    });

    // ── shootout:quickplay:* (Phase MP-expansion, 2026-06-08) ───────
    //
    // FIFO matchmaking queue per mode. Client taps Quick Play →
    // shootout:quickplay:join {mode, telegramUserId, ...}. When the
    // queue hits cap, server creates a pre-populated lobby
    // (teams alternating, all members isReady=true) in READY state,
    // sockets join the lobby room, and the existing 5s auto-countdown
    // (Phase 1) fires → match starts. Quick play deliberately skips
    // the team-pick UI — teams are auto-assigned (Fish's spec).
    //
    // Cancel via shootout:quickplay:cancel; disconnect auto-scrubs.
    client.on('shootout:quickplay:join', async (payload, ack) => {
        try {
            const mode = payload?.mode;
            const tgId = payload?.telegramUserId;
            const res = mmJoinQueue({
                mode,
                telegramUserId:   tgId,
                telegramUsername: payload?.telegramUsername,
                firstName:        payload?.firstName,
                socketId:         client.id,
            });
            if (res?.error) return ack?.({ error: res.error });

            // Still waiting for opponents
            if (res.queued) {
                return ack?.({ ok: true, queued: true, position: res.position, cap: res.cap });
            }

            // Matched — create the pre-ready lobby
            const lobbyRes = await lobbyService.createQuickPlayLobby({
                mode: res.mode,
                members: res.members,
            });
            if (lobbyRes?.error) {
                logger.error({ err: lobbyRes.error }, 'quickplay createQuickPlayLobby failed');
                return ack?.({ error: lobbyRes.error });
            }
            const lobby = lobbyRes.lobby;
            const room  = lobbyRoomName(lobby.lobbyId);

            // Every matched member's socket joins the lobby room +
            // gets a direct 'matched' notification so their client
            // can flip the UI off the Quick Play overlay.
            for (const m of res.members) {
                const sock = m.socketId && io.sockets.sockets.get(m.socketId);
                if (!sock) continue;
                sock.join(room);
                sock.emit('shootout:quickplay:matched', {
                    lobbyId: lobby.lobbyId,
                    code:    lobby.code,
                    mode:    lobby.mode,
                });
            }
            // Broadcast lobby state + arm the 5s auto-countdown
            // (lobby is already READY since all members are pre-ready
            //  and teams are balanced by construction).
            io.to(room).emit('shootout:lobby:state', { lobby });
            _syncCountdown(lobby);
            ack?.({ ok: true, matched: true, lobbyId: lobby.lobbyId });
        } catch (err) {
            logger.error({ err }, 'shootout:quickplay:join failed');
            ack?.({ error: 'internal' });
        }
    });

    client.on('shootout:quickplay:cancel', async (payload, ack) => {
        try {
            const res = mmCancelQueue({ telegramUserId: payload?.telegramUserId });
            ack?.(res);
        } catch (err) {
            logger.error({ err }, 'shootout:quickplay:cancel failed');
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
    // Core start-and-broadcast — returns {ok, matchId} | {error}.
    // Used by both the manual :start handler (with ack) AND the
    // auto-countdown's onComplete (which has no ack and runs out-of-band
    // 5s after the last ready). Side-effect-only function: spins the
    // runner + emits match:start per-socket; logs internal failures
    // but never throws.
    async function _startMatch({ lobbyId, telegramUserId, allowSolo, botDifficulty }) {
        const startRes = await lobbyService.startMatch({
            lobbyId, telegramUserId, allowSolo: !!allowSolo,
        });
        if (startRes?.error) return { error: startRes.error };

        const matchRes = await lifecycle.createMatchFromLobby({
            lobby: startRes.lobby,
            botDifficulty,
        });
        if (matchRes?.error) return { error: matchRes.error };

        const runner = new ShootoutRunner({ match: matchRes.match, io });
        _activeMatches.set(matchRes.match.matchId, runner);

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
                mapId:     matchRes.match.mapId,
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
        // Phase 3 (2026-06-08): lobby state moved to STARTING → falls
        // out of the open-lobbies list. Live-subscribers need to know.
        _broadcastOpenLobbies();
        return { ok: true, matchId: matchRes.match.matchId };
    }

    // Thin ack-wrapping wrapper for the manual :start / :startSolo
    // handlers — preserves the existing wire API.
    async function _startCommon({ lobbyId, telegramUserId, allowSolo, botDifficulty, ack }) {
        const res = await _startMatch({ lobbyId, telegramUserId, allowSolo, botDifficulty });
        if (res?.error) return ack?.({ error: res.error });
        ack?.({ ok: true, matchId: res.matchId });
    }

    // Phase 3 (2026-06-08): re-emit the full open-lobbies list to the
    // OPEN_LOBBIES_ROOM. Called after every state-mutating lobby
    // handler so the browser stays live. Cheap: one Mongo .lean()
    // read + one room emit per change; the room is empty when nobody
    // is on the Open Lobbies tab.
    async function _broadcastOpenLobbies() {
        try {
            const lobbies = await lobbyService.listOpenLobbies();
            io.to(OPEN_LOBBIES_ROOM).emit('shootout:openLobbies:update', { lobbies });
        } catch (err) {
            logger.error({ err }, '_broadcastOpenLobbies failed');
        }
    }

    // After every state-mutating lobby handler (setReady, pickTeam,
    // leave), call this with the resulting lobby. It either:
    //   - arms the 5-second auto-countdown (state just became READY)
    //   - cancels any in-flight countdown (state moved AWAY from READY)
    // Armed countdowns are idempotent so calling armCountdown on every
    // READY-state broadcast is safe; cancel is also a no-op when no
    // timer is running.
    function _syncCountdown(lobby) {
        if (!lobby?.lobbyId) return;
        if (lobby.state === 'READY') {
            armCountdown({
                lobbyId: lobby.lobbyId,
                io,
                onComplete: async () => {
                    // Re-fetch the lobby on completion (state could've
                    // changed between the timer firing and the
                    // setTimeout's microtask) and start the match using
                    // the host's telegramUserId.
                    const fresh = await ShootoutLobby.findOne({ lobbyId: lobby.lobbyId }).lean();
                    if (!fresh || fresh.state !== 'READY') return;
                    await _startMatch({
                        lobbyId:        fresh.lobbyId,
                        telegramUserId: fresh.hostTelegramUserId,
                        allowSolo:      false,
                    });
                },
            });
        } else {
            cancelCountdown(lobby.lobbyId);
        }
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
                // Difficulty for the bot fill (recruit/soldier/veteran/seal).
                // Falls back to soldier inside SimBot if unknown.
                botDifficulty: payload?.difficulty,
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
            // Client-authoritative position fields (2026-06-08).
            // Optional — runner.setInput coerces missing/non-finite
            // to null and falls back to integrateMovement.
            clientX:        payload.clientX,
            clientY:        payload.clientY,
            clientZ:        payload.clientZ,
            clientOnGround: payload.clientOnGround,
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

            // Broadcast the shot BEFORE doing hitscan so every client in
            // the room (including the shooter) plays the gunfire SFX —
            // attenuated by distance on the client side. Without this,
            // only hits make a sound.
            io.to(runner.roomName).emit('shootout:match:shot', {
                shooterSlot: slot,
                fromX:       payload.fromX,
                fromY:       payload.fromY,
                fromZ:       payload.fromZ,
                weaponType:  payload.weaponType,
            });

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

    // ── shootout:buy ─────────────────────────────────────────────────
    //
    // Day 3. Players purchase weapons during the BUY phase. The runner
    // is authoritative — it owns money + matchState.phase — so we just
    // forward to runner.buyWeapon and broadcast loadout to the match
    // room on success so every client can update its model + HUD for
    // the buying player.
    //
    // Error cases surface as ack({error:'reason'}):
    //   no_match | not_buy_phase | bad_weapon | no_money | no_player
    client.on('shootout:buy', (payload, ack) => {
        try {
            const matchId    = payload?.matchId;
            const slot       = payload?.slot;
            const weaponType = payload?.weaponType;
            if (matchId == null || slot == null) {
                return ack?.({ error: 'bad_payload' });
            }
            const runner = _activeMatches.get(matchId);
            if (!runner) return ack?.({ error: 'no_match' });

            const res = runner.buyWeapon(slot, weaponType);
            if (!res.ok) return ack?.({ error: res.reason });

            io.to(runner.roomName).emit('shootout:match:loadout', {
                slot,
                weaponType: res.weaponType,
                money:      res.money,
            });
            ack?.({ ok: true, money: res.money });
        } catch (err) {
            logger.error({ err }, 'shootout:buy failed');
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

    // ── disconnect cleanup ───────────────────────────────────────────
    // Scrub the user from any Quick Play queue they were waiting in.
    // Lobby member cleanup is handled by the existing
    // shootout:lobby:leave path; this hook is queue-only since
    // matchmaking state is in-memory and doesn't survive without
    // active sockets.
    client.on('disconnect', () => {
        try {
            const { removed } = mmScrubBySocket({ socketId: client.id });
            if (removed.length) {
                logger.info('[shootout/quickplay] scrubbed disconnected users', { removed });
            }
        } catch (err) {
            logger.error({ err }, 'shootout disconnect scrub failed');
        }
    });
}

export default { initShootoutSocket, registerShootoutHandlers };
