/**
 * Critter Kart socket handlers — V1 multiplayer race flow.
 *
 * Mirror of pool.js's pattern: main.js calls initCritterKartSocket(io)
 * once at startup, and registerCritterKartHandlers(client, io) inside
 * the io.on('connection') block per client.
 *
 * Session 1 scope: queue + lobby + race lifecycle wiring, fake race
 * resolution. Session 2 adds the input → snapshot loop driven by
 * server-side physics. Session 3 adds the bot UX integration.
 *
 * Event surface (all `critterkart:*` prefix to coexist with pool/SolShot):
 *
 * Client → Server:
 *   critterkart:joinQueue   { telegramUserId, telegramUsername?, firstName? }
 *                           ack: { ok, ticketId?, waitMs?, positionInQueue? } | { error }
 *   critterkart:leaveQueue  { telegramUserId }
 *                           ack: { ok }
 *   critterkart:joinRace    { raceId, telegramUserId }
 *                           ack: { ok, race?, kartId? } | { error }
 *   critterkart:ready       { raceId, telegramUserId }
 *                           ack: { ok, allReady? } | { error }
 *   critterkart:leaveRace   { raceId, telegramUserId }  (DNF)
 *                           ack: { ok }
 *   critterkart:input       InputFrame   (Session 2 — no-op in Session 1)
 *
 * Server → Client (room = race:<raceId>):
 *   critterkart:matched     { raceId, players[], launchUrl, format }
 *   critterkart:state       { state, players[], format, ... }   (on join/state change)
 *   critterkart:countdown   { seconds: 3|2|1|0 }
 *   critterkart:snapshot    RaceSnapshot   (Session 2)
 *   critterkart:final       { positions[], myResult }   (race settled)
 *   critterkart:error       { event, reason, detail? }
 *
 * Auth: V1 trusts the telegramUserId in the payload (verified by the
 * JWT layer when the player joined Telegram-side). Session 2 / wagered
 * adds handshake-bound identity so a client can't impersonate another.
 *
 * Concurrency: in-memory client-routing map keyed by tg id, mirror of
 * pool's clientByPlayerKey. Cleared on disconnect.
 */

import logger from '../services/logger.js';
import {
    configureMatchmaking,
    enqueue,
    dequeue,
    getQueueStatus,
    startMatchmakingTicker,
} from '../services/games/critter-kart/matchmaking.js';
import {
    registerReady,
    beginCountdown,
    beginRacing,
    finishRace,
    settleRace,
    markDnf,
    cancelRace,
    findActiveRaceForPlayer,
    createRace,
    fillWithBots,
} from '../services/games/critter-kart/lifecycle.js';
import { RaceRunner } from '../services/games/critter-kart/sim/runner.js';
import {
    listOpenLobbies,
    getLobby,
    createLobby,
    requestJoin,
    decideRequest,
    setReady as lobbySetReady,
    leaveLobby,
    markStarting,
    markClosed,
    toLobbyStateWire,
    toLobbySummaryWire,
} from '../services/games/critter-kart/lobbyService.js';
import CritterKartRace from '../models/CritterKartRace.js';

// ──────────────────────────────────────────────────────────────────────
// Client routing — telegramUserId → socket
// ──────────────────────────────────────────────────────────────────────

/** Map<telegramUserId(number), clientSocket>. Cleared on disconnect. */
const clientByTgId = new Map();
/** Map<socketId, telegramUserId>. For reverse lookup on disconnect. */
const tgIdBySocketId = new Map();

// ──────────────────────────────────────────────────────────────────────
// Reconnect grace — mirrors SolShot's pendingReconnects/disconnectTimers
// ──────────────────────────────────────────────────────────────────────
//
// When a socket drops mid-race, we don't immediately mark the player as
// DNF. Instead we start a 30s timer; if the player reconnects (via
// critterkart:joinRace) before it fires, the timer is cancelled and
// their kart resumes as if nothing happened (Session 2 will preserve
// the actual kart velocity/position over the gap — for now the gap is
// just "your kart didn't input for N seconds").
//
// Window calibration: SolShot uses 10min for slow turn-based artillery.
// Critter Kart races are 60-120s, so the player who drops at second 30
// of a 90s race has at most 60s left to play. 30s grace is half a race
// — long enough to recover from a transient blip, short enough that
// remaining humans aren't waiting for a ghost.
//
// Stored shape: Map<telegramUserId, { timer, raceId, scheduledAt }>.
const RECONNECT_GRACE_MS = 30_000;
const pendingReconnects = new Map();

function startReconnectGrace({ telegramUserId, raceId }) {
    // Cancel any existing pending — start fresh
    cancelReconnectGrace({ telegramUserId });
    const timer = setTimeout(async () => {
        pendingReconnects.delete(telegramUserId);

        // Session 2b — AI takeover instead of plain DNF. If the runner
        // is still alive, find this player's kart and swap it to bot
        // control. The kart keeps racing under AI, the race goes the
        // full distance, and the player's settled position reflects
        // wherever the AI took them. Cheat-resistant for wagered mode:
        // a player can't force-DC mid-race to dodge a losing finish.
        try {
            const race = await CritterKartRace.findOne({ raceId }).lean();
            const player = race?.players?.find(p => p.telegramUserId === telegramUserId);
            const runner = getRunner(raceId);
            if (runner && player) {
                runner.convertKartToBot(player.kartId);
                logger.info('[critter-kart] reconnect grace expired → AI takeover', {
                    raceId, telegramUserId, kartId: player.kartId,
                    windowMs: RECONNECT_GRACE_MS,
                });
                return;
            }
        } catch (err) {
            logger.warn('[critter-kart] grace-expiry AI-takeover failed; falling back to DNF', {
                raceId, telegramUserId, error: err.message,
            });
        }

        // Fallback: race already ended OR runner is gone — record DNF.
        markDnf({ raceId, telegramUserId }).catch(err => {
            logger.error('[critter-kart] grace-expiry markDnf failed', {
                raceId, telegramUserId, error: err.message,
            });
        });
        logger.info('[critter-kart] reconnect grace expired → DNF', {
            raceId, telegramUserId, windowMs: RECONNECT_GRACE_MS,
        });
    }, RECONNECT_GRACE_MS);
    // Don't keep Node alive on this timer if the process is shutting down
    if (typeof timer.unref === 'function') timer.unref();
    pendingReconnects.set(telegramUserId, {
        timer,
        raceId,
        scheduledAt: Date.now(),
    });
    logger.info('[critter-kart] reconnect grace started', {
        raceId, telegramUserId, windowMs: RECONNECT_GRACE_MS,
    });
}

function cancelReconnectGrace({ telegramUserId }) {
    const pending = pendingReconnects.get(telegramUserId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingReconnects.delete(telegramUserId);
    logger.info('[critter-kart] reconnect grace cancelled (player reconnected)', {
        raceId: pending.raceId,
        telegramUserId,
        elapsedMs: Date.now() - pending.scheduledAt,
    });
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Live RaceRunner registry — one per active race
// ──────────────────────────────────────────────────────────────────────
//
// Session 2b: the server-authoritative tick loop now drives racing
// (replacing Session 1's fake 15s sleep). Each in-flight race has a
// RaceRunner instance from sim/runner.js spinning at 60Hz. Lookups:
//   - race:input socket events → applyInput()
//   - reconnect grace expiry → convertKartToBot()
//   - lifecycle finish → onFinish callback drives settleRace + broadcast
const runnersByRaceId = new Map();

function getRunner(raceId) {
    return runnersByRaceId.get(raceId) || null;
}

function registerRunner(raceId, runner) {
    runnersByRaceId.set(raceId, runner);
}

function disposeRunner(raceId) {
    const r = runnersByRaceId.get(raceId);
    if (r) r.stop();
    runnersByRaceId.delete(raceId);
}

function registerClientIdentity(client, telegramUserId) {
    if (!telegramUserId) return;
    clientByTgId.set(telegramUserId, client);
    tgIdBySocketId.set(client.id, telegramUserId);
}

function unregisterClient(client) {
    const tgId = tgIdBySocketId.get(client.id);
    if (tgId && clientByTgId.get(tgId)?.id === client.id) {
        clientByTgId.delete(tgId);
    }
    tgIdBySocketId.delete(client.id);
    return tgId;
}

function findClientByTgId(tgId) {
    return clientByTgId.get(tgId) || null;
}

// ──────────────────────────────────────────────────────────────────────
// Race-room helpers — group sockets by raceId for state broadcasts
// ──────────────────────────────────────────────────────────────────────

const raceRoomName = (raceId) => `critter-kart:race:${raceId}`;

function broadcastToRace(io, raceId, event, payload) {
    io.to(raceRoomName(raceId)).emit(event, payload);
}

// ──────────────────────────────────────────────────────────────────────
// Module init — wire matchmaking callbacks + start ticker once
// ──────────────────────────────────────────────────────────────────────

let initialized = false;
let serverIo = null;   // captured for use in matchmaking callbacks

// URL the bot's "Quick Race" button (and matchmaker emit) deep-links to.
// Read from env to allow preview vs prod swap; falls back to the preview
// Vercel project that exists today.
const RACE_LAUNCH_BASE =
    process.env.CRITTER_KART_LAUNCH_BASE ||
    'https://the-arcade-critter-kart.vercel.app/play/critter-kart/launch';

function buildLaunchUrl(raceId, sessionJwt) {
    const sep = RACE_LAUNCH_BASE.includes('?') ? '&' : '?';
    const sessionParam = sessionJwt ? `&session=${encodeURIComponent(sessionJwt)}` : '';
    return `${RACE_LAUNCH_BASE}${sep}race=${encodeURIComponent(raceId)}${sessionParam}`;
}

export function initCritterKartSocket(io) {
    if (initialized) return;
    initialized = true;
    serverIo = io;

    configureMatchmaking({
        onMatchFound: (race, humanPlayers) => {
            try {
                // Emit `critterkart:matched` to each human player's socket
                // with a personalised launch URL. Bots have no socket.
                for (const player of humanPlayers) {
                    const c = findClientByTgId(player.telegramUserId);
                    if (!c) {
                        logger.warn('[critter-kart] match-found: client not found for player', {
                            raceId: race.raceId,
                            telegramUserId: player.telegramUserId,
                        });
                        continue;
                    }
                    c.emit('critterkart:matched', {
                        raceId: race.raceId,
                        launchUrl: buildLaunchUrl(race.raceId, null),
                        players: race.players.map(p => ({
                            displayName: p.displayName,
                            isBot: p.isBot,
                            kartId: p.kartId,
                        })),
                        format: race.format,
                    });
                    // Also emit match:found / race:start (Fish's UI shape)
                    const memberWire = race.players.map((p, idx) => ({
                        username: p.displayName,
                        slot: idx,
                        kartId: p.kartId,
                        isBot: p.isBot,
                    }));
                    c.emit('match:found', {
                        raceId: race.raceId,
                        roomId: race.raceId,
                        launchUrl: buildLaunchUrl(race.raceId, null),
                        members: memberWire,
                        format: race.format,
                    });
                    c.emit('race:start', {
                        roomId: race.raceId,
                        startAtMs: Date.now() + 4000,
                        members: memberWire,
                    });
                }
                logger.info('[critter-kart] match-found broadcast', {
                    raceId: race.raceId,
                    humans: humanPlayers.length,
                    bots: race.players.length - humanPlayers.length,
                });
            } catch (err) {
                logger.error('[critter-kart] match-found broadcast failed', {
                    raceId: race?.raceId,
                    error: err.message,
                });
            }
        },
        onSearchTimeout: (entry, reason) => {
            const c = findClientByTgId(entry.telegramUserId);
            if (!c) return;
            c.emit('critterkart:error', {
                event: 'queue',
                reason: 'search_timeout',
                detail: reason,
            });
        },
    });

    startMatchmakingTicker();
    logger.info('[critter-kart] socket module initialised');
}

// ──────────────────────────────────────────────────────────────────────
// Per-client handler registration
// ──────────────────────────────────────────────────────────────────────

function ackOk(ack, payload = {}) {
    if (typeof ack === 'function') ack({ ok: true, ...payload });
}
function ackError(ack, reason, detail) {
    if (typeof ack === 'function') ack({ ok: false, error: reason, detail });
}

export function registerCritterKartHandlers(client, io) {

    // ── critterkart:joinQueue ─────────────────────────────────────────
    client.on('critterkart:joinQueue', async (payload, ack) => {
        try {
            const { telegramUserId, telegramUsername, firstName } = payload || {};
            if (!telegramUserId || typeof telegramUserId !== 'number') {
                return ackError(ack, 'telegramUserId_required');
            }

            // Bind this socket to the tg id so matchmaker can find us
            // when the match fires.
            registerClientIdentity(client, telegramUserId);

            await enqueue({
                telegramUserId,
                telegramUsername,
                firstName,
                socketId: client.id,
            });

            const status = await getQueueStatus({ telegramUserId });
            ackOk(ack, {
                ticketId: status?.ticketId,
                waitMs: status?.waitMs ?? 0,
                positionInQueue: status?.positionInQueue,
                totalInQueue: status?.totalInQueue,
            });
        } catch (err) {
            logger.error('[critterkart:joinQueue]', { error: err.message });
            ackError(ack, 'enqueue_failed', err.message);
        }
    });

    // ── critterkart:leaveQueue ────────────────────────────────────────
    client.on('critterkart:leaveQueue', async (payload, ack) => {
        try {
            const { telegramUserId } = payload || {};
            if (!telegramUserId) return ackError(ack, 'telegramUserId_required');
            await dequeue({ telegramUserId });
            ackOk(ack);
        } catch (err) {
            ackError(ack, 'dequeue_failed', err.message);
        }
    });

    // ── match:enqueue / match:cancel (Fish's UI alias names) ──────────
    // Fish's screens.tsx Quick Match button emits match:enqueue {} (no
    // telegramUserId — picks it up from handshake auth). Bridge to the
    // existing matchmaking pipeline.
    client.on('match:enqueue', async (payload, ack) => {
        try {
            const auth = client.handshake?.auth || {};
            const telegramUserId = (typeof auth.telegramUserId === 'number' && auth.telegramUserId)
                || payload?.telegramUserId;
            if (!telegramUserId) return ackError(ack, 'identity_required');
            registerClientIdentity(client, telegramUserId);
            await enqueue({
                telegramUserId,
                telegramUsername: auth.telegramUsername || null,
                firstName: auth.firstName || null,
                socketId: client.id,
            });
            client.emit('match:queued', { waitMs: 0 });
            ackOk(ack);
        } catch (err) {
            logger.error('[match:enqueue]', { error: err.message });
            ackError(ack, 'enqueue_failed', err.message);
        }
    });
    client.on('match:cancel', async (_payload, ack) => {
        try {
            const auth = client.handshake?.auth || {};
            const telegramUserId = (typeof auth.telegramUserId === 'number' && auth.telegramUserId);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            await dequeue({ telegramUserId });
            ackOk(ack);
        } catch (err) {
            ackError(ack, 'cancel_failed', err.message);
        }
    });

    // ── critterkart:joinRace ──────────────────────────────────────────
    // Player loads /play/critter-kart/launch?race=<id> and the client
    // immediately sends this. Server validates membership + joins the
    // socket to the race room so broadcasts reach them.
    client.on('critterkart:joinRace', async (payload, ack) => {
        try {
            const { raceId, telegramUserId } = payload || {};
            if (!raceId || !telegramUserId) {
                return ackError(ack, 'raceId_and_telegramUserId_required');
            }
            const race = await CritterKartRace.findOne({ raceId }).lean();
            if (!race) return ackError(ack, 'race_not_found');
            const player = race.players.find(p => p.telegramUserId === telegramUserId);
            if (!player) return ackError(ack, 'not_in_race');
            if (['settled', 'cancelled'].includes(race.state)) {
                return ackError(ack, 'race_terminal', `race state: ${race.state}`);
            }

            // Update socket binding + join the race room
            registerClientIdentity(client, telegramUserId);
            client.join(raceRoomName(raceId));

            // Cancel any pending reconnect-grace timer — this socket
            // IS the reconnect. If their kart had been about to DNF,
            // it's saved.
            const wasReconnect = cancelReconnectGrace({ telegramUserId });

            // Update the player's current socketId in the race doc
            await CritterKartRace.updateOne(
                { raceId, 'players.telegramUserId': telegramUserId },
                { $set: { 'players.$.socketId': client.id } },
            );

            if (wasReconnect) {
                // Tell other racers the player is back — useful for HUD
                // (in Session 2 this'll switch their "disconnected"
                // indicator off in the HUD).
                broadcastToRace(io, raceId, 'critterkart:state', {
                    state: race.state,
                    raceId,
                    reconnected: telegramUserId,
                });
            }

            // Push current race state to the joiner — they may be a
            // late re-connect mid-race.
            client.emit('critterkart:state', {
                state: race.state,
                raceId: race.raceId,
                players: race.players.map(p => ({
                    displayName: p.displayName,
                    isBot: p.isBot,
                    kartId: p.kartId,
                    status: p.status,
                    readyAt: p.readyAt,
                })),
                format: race.format,
            });

            ackOk(ack, { kartId: player.kartId });
        } catch (err) {
            logger.error('[critterkart:joinRace]', { error: err.message });
            ackError(ack, 'join_failed', err.message);
        }
    });

    // ── critterkart:ready ─────────────────────────────────────────────
    // Client signals it has the scene loaded + is ready to race.
    // When all humans ready, we transition matched→countdown automatically.
    client.on('critterkart:ready', async (payload, ack) => {
        try {
            const { raceId, telegramUserId } = payload || {};
            if (!raceId || !telegramUserId) {
                return ackError(ack, 'raceId_and_telegramUserId_required');
            }
            const { race, allReady } = await registerReady({ raceId, telegramUserId });
            ackOk(ack, { allReady });

            // Notify everyone in the race of the readiness change
            broadcastToRace(io, raceId, 'critterkart:state', {
                state: race.state,
                raceId,
                players: race.players.map(p => ({
                    displayName: p.displayName,
                    isBot: p.isBot,
                    kartId: p.kartId,
                    status: p.status,
                    readyAt: p.readyAt,
                })),
                format: race.format,
            });

            // If everyone's ready (including bots which are auto-ready),
            // start countdown.
            if (allReady && race.state === 'matched') {
                runCountdownAndRace(io, raceId).catch(err => {
                    logger.error('[critter-kart] countdown/race driver failed', {
                        raceId, error: err.message,
                    });
                });
            }
        } catch (err) {
            logger.error('[critterkart:ready]', { error: err.message });
            ackError(ack, 'ready_failed', err.message);
        }
    });

    // ── critterkart:leaveRace ─────────────────────────────────────────
    // Voluntary DNF (e.g. user closes tab). Mark player and continue
    // race — Session 2 will swap their kart to AI control.
    client.on('critterkart:leaveRace', async (payload, ack) => {
        try {
            const { raceId, telegramUserId } = payload || {};
            if (!raceId || !telegramUserId) return ackError(ack, 'params_required');
            await markDnf({ raceId, telegramUserId });
            client.leave(raceRoomName(raceId));
            ackOk(ack);
        } catch (err) {
            ackError(ack, 'leave_failed', err.message);
        }
    });

    // ── race:input ────────────────────────────────────────────────────
    // Per-frame input from a human-controlled kart. Forwarded to the
    // RaceRunner which buffers + applies at the next physics tick.
    // Clamped + sequence-checked inside applyInput().
    //
    // Volume note: clients send at ~30Hz, RaceRunner ticks at 60Hz. We
    // accept inputs faster than tick rate (latest-wins) so client jitter
    // doesn't cause server-side input gaps.
    //
    // No ack — input is fire-and-forget. The server's snapshot stream
    // carries ackSeq so the client can reconcile.
    client.on('race:input', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const { raceId, kartId, seq, steer, throttle, brake, drift } = payload;
        if (!raceId || !kartId) return;
        const runner = getRunner(raceId);
        if (!runner) return;
        runner.applyInput({ kartId, seq, steer, throttle, brake, drift });
    });

    // ── critterkart:input (Session 1 legacy) ──────────────────────────
    // Pre-Session-2b clients may still send this. Drop silently.
    client.on('critterkart:input', () => { /* Session 1 legacy — no-op */ });

    // ════════════════════════════════════════════════════════════════════
    // LOBBY — custom-game host-controlled flow (Session 2d)
    // ════════════════════════════════════════════════════════════════════
    //
    // Identity for lobby events comes from the socket handshake auth
    // (client passed {telegramUserId, sessionJwt} on connect — see
    // net/client.ts). We also accept telegramUserId in payload as a
    // fallback for clients that haven't migrated.
    function identityFromPayload(payload) {
        const auth = client.handshake?.auth || {};
        const fromAuth = auth.telegramUserId;
        const fromPayload = payload?.telegramUserId;
        const tg = (typeof fromAuth === 'number' && fromAuth) || fromPayload;
        return {
            telegramUserId: tg,
            telegramUsername: auth.telegramUsername || payload?.telegramUsername || null,
            firstName: auth.firstName || payload?.firstName || null,
        };
    }
    const lobbyRoomName = (lobbyId) => `critter-kart:lobby:${lobbyId}`;

    // ── lobby:list ────────────────────────────────────────────────────
    client.on('lobby:list', async (_payload, ack) => {
        try {
            const lobbies = await listOpenLobbies();
            const wire = lobbies.map(toLobbySummaryWire);
            // Reply via dispatched event (mirrors Fish's stub shape) AND ack.
            client.emit('lobby:listing', { lobbies: wire });
            ackOk(ack, { lobbies: wire });
        } catch (err) {
            logger.error('[lobby:list]', { error: err.message });
            ackError(ack, 'list_failed', err.message);
        }
    });

    // ── lobby:create ──────────────────────────────────────────────────
    client.on('lobby:create', async (payload, ack) => {
        try {
            const { telegramUserId, telegramUsername, firstName } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const lobby = await createLobby({
                name: payload?.name,
                cap: payload?.cap,
                hostTelegramUserId: telegramUserId,
                hostUsername: telegramUsername,
                hostFirstName: firstName,
                socketId: client.id,
            });
            registerClientIdentity(client, telegramUserId);
            client.join(lobbyRoomName(lobby.lobbyId));
            const wire = toLobbyStateWire(lobby);
            client.emit('lobby:created', { lobby: wire });
            ackOk(ack, { lobby: wire });
        } catch (err) {
            logger.error('[lobby:create]', { error: err.message });
            ackError(ack, 'create_failed', err.message);
        }
    });

    // ── lobby:join ────────────────────────────────────────────────────
    // Sends a join request to the host (always pending — host accepts).
    client.on('lobby:join', async (payload, ack) => {
        try {
            const { telegramUserId, telegramUsername, firstName } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const { lobbyId } = payload || {};
            if (!lobbyId) return ackError(ack, 'lobbyId_required');
            const { lobby, requestId, alreadyMember } = await requestJoin({
                lobbyId,
                telegramUserId,
                telegramUsername,
                firstName,
                socketId: client.id,
            });
            registerClientIdentity(client, telegramUserId);
            // Joiner subscribes to the lobby room early so they receive
            // lobby:state broadcasts even while pending.
            client.join(lobbyRoomName(lobby.lobbyId));
            const wire = toLobbyStateWire(lobby);
            if (alreadyMember) {
                client.emit('lobby:joined', { lobby: wire });
                ackOk(ack, { lobby: wire, alreadyMember: true });
                return;
            }
            // Notify host of the pending join request
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:state', { lobby: wire });
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:joinRequest', {
                lobbyId: lobby.lobbyId,
                requestId,
                username: lobby.pendingRequests.find(p => p.requestId === requestId)?.displayName,
            });
            ackOk(ack, { requestId });
        } catch (err) {
            logger.error('[lobby:join]', { error: err.message });
            ackError(ack, 'join_failed', err.message);
        }
    });

    // ── lobby:decision ────────────────────────────────────────────────
    client.on('lobby:decision', async (payload, ack) => {
        try {
            const { telegramUserId } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const { requestId, accept, lobbyId: lobbyIdFromPayload } = payload || {};
            if (!requestId) return ackError(ack, 'requestId_required');
            // Find the lobby — payload may omit lobbyId; fall back to the
            // socket's joined rooms.
            let lobbyId = lobbyIdFromPayload;
            if (!lobbyId) {
                for (const room of client.rooms) {
                    if (room.startsWith('critter-kart:lobby:')) {
                        lobbyId = room.slice('critter-kart:lobby:'.length);
                        break;
                    }
                }
            }
            if (!lobbyId) return ackError(ack, 'lobbyId_unknown');
            const { lobby, accepted, requester } = await decideRequest({
                lobbyId,
                hostTelegramUserId: telegramUserId,
                requestId,
                accept,
            });
            const wire = toLobbyStateWire(lobby);
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:state', { lobby: wire });
            // Notify the requester of the outcome
            const reqClient = findClientByTgId(requester.telegramUserId);
            if (reqClient) {
                if (accepted) reqClient.emit('lobby:joined', { lobby: wire });
                else reqClient.emit('lobby:declined', { lobbyId: lobby.lobbyId });
            }
            ackOk(ack, { accepted });
        } catch (err) {
            logger.error('[lobby:decision]', { error: err.message });
            ackError(ack, 'decision_failed', err.message);
        }
    });

    // ── lobby:ready ───────────────────────────────────────────────────
    client.on('lobby:ready', async (payload, ack) => {
        try {
            const { telegramUserId } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const { lobbyId, ready } = payload || {};
            if (!lobbyId) return ackError(ack, 'lobbyId_required');
            const lobby = await lobbySetReady({ lobbyId, telegramUserId, ready });
            const wire = toLobbyStateWire(lobby);
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:state', { lobby: wire });
            ackOk(ack);
        } catch (err) {
            logger.error('[lobby:ready]', { error: err.message });
            ackError(ack, 'ready_failed', err.message);
        }
    });

    // ── lobby:leave ───────────────────────────────────────────────────
    client.on('lobby:leave', async (payload, ack) => {
        try {
            const { telegramUserId } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const { lobbyId } = payload || {};
            if (!lobbyId) return ackError(ack, 'lobbyId_required');
            const result = await leaveLobby({ lobbyId, telegramUserId });
            if (!result) return ackOk(ack);
            const wire = toLobbyStateWire(result.lobby);
            if (result.closed) {
                io.to(lobbyRoomName(result.lobby.lobbyId)).emit('lobby:closed', {
                    lobbyId: result.lobby.lobbyId,
                    reason: 'host_left',
                });
            } else {
                io.to(lobbyRoomName(result.lobby.lobbyId)).emit('lobby:state', { lobby: wire });
            }
            client.leave(lobbyRoomName(result.lobby.lobbyId));
            ackOk(ack);
        } catch (err) {
            logger.error('[lobby:leave]', { error: err.message });
            ackError(ack, 'leave_failed', err.message);
        }
    });

    // ── lobby:start ───────────────────────────────────────────────────
    // Host transitions lobby → race. Server calls createRace with the
    // lobby members + bot-fills to MAX_PLAYERS. Then broadcasts
    // critterkart:matched to every member with the raceId, mirroring
    // the matchmaker callback shape so MultiplayerLayer doesn't care
    // whether it got here via Quick Race or Custom Lobby.
    client.on('lobby:start', async (payload, ack) => {
        try {
            const { telegramUserId } = identityFromPayload(payload);
            if (!telegramUserId) return ackError(ack, 'identity_required');
            const { lobbyId } = payload || {};
            if (!lobbyId) return ackError(ack, 'lobbyId_required');
            const lobby = await getLobby(lobbyId);
            if (!lobby) return ackError(ack, 'lobby_not_found');
            if (lobby.hostTelegramUserId !== telegramUserId) {
                return ackError(ack, 'not_host');
            }
            if (lobby.state !== 'open') {
                return ackError(ack, 'lobby_not_open', `state: ${lobby.state}`);
            }
            const humans = lobby.members.map(m => ({
                telegramUserId: m.telegramUserId,
                displayName: m.displayName,
                socketId: m.socketId,
                isBot: false,
            }));
            // Bot-fill the remainder (lifecycle helper)
            const MAX = 6;
            const players = fillWithBots(humans, MAX);
            const { race } = await createRace({ players });
            await markStarting({
                lobbyId,
                hostTelegramUserId: telegramUserId,
                raceId: race.raceId,
            });
            // Emit critterkart:matched to every human (same shape as
            // matchmaker's onMatchFound callback). MultiplayerLayer
            // listens for this and transitions to race:join.
            const memberWire = race.players.map((p, i) => ({
                username: p.displayName,
                slot: i,
                kartId: p.kartId,
                isBot: p.isBot,
            }));
            const startAtMs = Date.now() + 4000;   // countdown ~3s after this emit
            for (const player of humans) {
                const c = findClientByTgId(player.telegramUserId);
                if (!c) continue;
                // Emit BOTH event-name shapes so Fish's lobby UI
                // (race:start listener in screens.tsx) and the new
                // MultiplayerLayer (critterkart:matched listener) both
                // hear it. Fully redundant payload.
                c.emit('critterkart:matched', {
                    raceId: race.raceId,
                    launchUrl: buildLaunchUrl(race.raceId, null),
                    players: race.players.map(p => ({
                        displayName: p.displayName,
                        isBot: p.isBot,
                        kartId: p.kartId,
                    })),
                    format: race.format,
                });
                c.emit('race:start', {
                    roomId: race.raceId,
                    startAtMs,
                    members: memberWire,
                });
                c.emit('match:found', {
                    raceId: race.raceId,
                    roomId: race.raceId,
                    launchUrl: buildLaunchUrl(race.raceId, null),
                    members: memberWire,
                    format: race.format,
                });
            }
            ackOk(ack, { raceId: race.raceId });
            // Close the lobby room since the race takes over.
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:closed', {
                lobbyId: lobby.lobbyId,
                reason: 'race_started',
                raceId: race.raceId,
            });
        } catch (err) {
            logger.error('[lobby:start]', { error: err.message });
            ackError(ack, 'start_failed', err.message);
        }
    });

    // ── disconnect ────────────────────────────────────────────────────
    //
    // Behaviour split by player state:
    //   • Queued (no active race): dequeue immediately.
    //   • In an active race (matched / loading / countdown / racing /
    //     finished): start the reconnect-grace timer. If the same player
    //     comes back on a fresh socket via critterkart:joinRace within
    //     RECONNECT_GRACE_MS, the timer is cancelled and they resume.
    //     Otherwise the timer fires and the kart is DNF'd (Session 2
    //     swaps the DNF for AI-takeover so the race keeps full kart count).
    client.on('disconnect', async () => {
        const tgId = unregisterClient(client);
        if (!tgId) return;

        // Concurrency note: if this player's socket was already replaced
        // (e.g. they opened a second tab and clientByTgId already moved
        // to the new socket), unregisterClient may return null. In that
        // case the new socket is still bound and we skip the grace.
        // Don't start a grace timer for a player who's actually still
        // online via another socket.

        try {
            const activeRace = await findActiveRaceForPlayer({ telegramUserId: tgId });
            if (activeRace) {
                startReconnectGrace({
                    telegramUserId: tgId,
                    raceId: activeRace.raceId,
                });
                // Optionally tell other racers; useful for HUD "(disconnected)"
                // overlay. In Session 2 this will be backed by the kart
                // status field rather than an ad-hoc broadcast.
                broadcastToRace(io, activeRace.raceId, 'critterkart:state', {
                    state: activeRace.state,
                    raceId: activeRace.raceId,
                    disconnected: tgId,
                    graceMs: RECONNECT_GRACE_MS,
                });
                return;   // Don't dequeue — they're in a race, not the queue
            }
        } catch (err) {
            logger.warn('[critter-kart] disconnect: findActiveRace failed', {
                telegramUserId: tgId, error: err.message,
            });
            // Fall through to dequeue — better to clean up than leak
        }

        // Not in a race → clean up the queue entry if present
        dequeue({ telegramUserId: tgId }).catch(err => {
            logger.warn('[critter-kart] disconnect dequeue failed', {
                telegramUserId: tgId, error: err.message,
            });
        });
    });
}

// ──────────────────────────────────────────────────────────────────────
// Race timing driver — Session 2b: server-authoritative physics tick
// ──────────────────────────────────────────────────────────────────────
//
// Drives the race from countdown through to settled. Session 1 used a
// 15s fake sleep here; Session 2b replaces that with a RaceRunner
// spinning at 60Hz that emits 20Hz snapshots. The race ends when all
// karts cross the finish line OR when the 5min hard timeout fires.

async function runCountdownAndRace(io, raceId) {
    try {
        await beginCountdown({ raceId });
        // Broadcast 3-2-1
        for (const sec of [3, 2, 1]) {
            broadcastToRace(io, raceId, 'critterkart:countdown', { seconds: sec });
            await sleep(1000);
        }
        broadcastToRace(io, raceId, 'critterkart:countdown', { seconds: 0 });

        await beginRacing({ raceId });
        broadcastToRace(io, raceId, 'critterkart:state', {
            state: 'racing',
            raceId,
        });

        // Hydrate the race doc to spin up a RaceRunner with the actual
        // matched players (humans + bot fill from matchmaker).
        const race = await CritterKartRace.findOne({ raceId }).lean();
        if (!race) throw new Error(`race ${raceId} not found at racing transition`);

        // RaceRunner spins up + ticks at 60Hz, emits 20Hz snapshots to
        // the race room, and fires onFinish when all karts have crossed
        // the line (or the 5min timeout hits).
        const runner = new RaceRunner({
            raceId,
            players: race.players.map(p => ({
                kartId: p.kartId,
                displayName: p.displayName,
                isBot: p.isBot,
                // weight from racer roster — left default for now; can
                // pass through from Fish's ROSTER once the wire carries
                // racer id on join
            })),
            onSnapshot: (snap) => {
                broadcastToRace(io, raceId, 'race:snapshot', snap);
            },
            onFinish: async ({ positions, reason }) => {
                try {
                    disposeRunner(raceId);
                    // Hand the runner's authoritative positions to the
                    // lifecycle finishRace → settleRace path. positions
                    // already match the shape lifecycle expects.
                    await finishRace({ raceId, positions });
                    const { results } = await settleRace({ raceId });

                    // Broadcast final to clients (mirror Session 1's
                    // critterkart:final shape so existing UI keeps
                    // working until Session 2c reshapes it).
                    const settled = await CritterKartRace.findOne({ raceId }).lean();
                    broadcastToRace(io, raceId, 'critterkart:final', {
                        raceId,
                        reason,
                        positions: settled.players
                            .slice()
                            .sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99))
                            .map(p => ({
                                kartId: p.kartId,
                                displayName: p.displayName,
                                isBot: p.isBot,
                                pos: p.finishPosition,
                                totalTimeMs: p.finishTimeMs,
                                bestLapMs: p.bestLapMs,
                                points: p.pointsAwarded,
                            })),
                        careerUpdates: results,
                    });
                    logger.info('[critter-kart] race settled', {
                        raceId, reason, finishCount: positions.length,
                    });
                } catch (settleErr) {
                    logger.error('[critter-kart] settle failed after race end', {
                        raceId, reason, error: settleErr.message,
                    });
                    broadcastToRace(io, raceId, 'critterkart:error', {
                        event: 'race',
                        reason: 'settle_failed',
                        detail: settleErr.message,
                    });
                }
            },
            onError: (err) => {
                logger.error('[critter-kart] runner errored mid-race', {
                    raceId, error: err.message,
                });
                disposeRunner(raceId);
                cancelRace({ raceId, reason: 'runner_error' }).catch(() => {});
                broadcastToRace(io, raceId, 'critterkart:error', {
                    event: 'race',
                    reason: 'runner_error',
                    detail: err.message,
                });
            },
        });

        registerRunner(raceId, runner);
        runner.start();
    } catch (err) {
        logger.error('[critter-kart] race driver failed', { raceId, error: err.message });
        disposeRunner(raceId);
        await cancelRace({ raceId, reason: 'driver_error' }).catch(() => {});
        broadcastToRace(io, raceId, 'critterkart:error', {
            event: 'race',
            reason: 'race_aborted',
            detail: err.message,
        });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default { initCritterKartSocket, registerCritterKartHandlers };
