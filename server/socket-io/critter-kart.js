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
const RECONNECT_GRACE_MS = 60_000; // 60s (was 30s) — give a dropped client more
// time to reconnect + auto-rejoin before the (currently erratic) AI takeover.
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
    runnerEmptyStartAt.delete(raceId);
}

// Per-race "first empty at" timestamps — when roomSize transitions to 0,
// we record the wall-clock. After RUNNER_EMPTY_TIMEOUT_MS of continuous
// emptiness, the runner is disposed even if Mongo state never finalised.
// Prevents the leak observed 2026-06-05: races where every player DNF'd
// kept ticking at 60Hz forever (e.g. raceId 75c0-dURgnU still emitting
// snapshots 90+ minutes after all sockets disconnected). RaceRunner
// CPU/memory grows linearly with leaked races; on Pro tier (1 CPU) ~5
// concurrent abandoned runners would max out the box.
const RUNNER_EMPTY_TIMEOUT_MS = 60_000;
const RUNNER_CLEANUP_INTERVAL_MS = 15_000;
const runnerEmptyStartAt = new Map();

function startRunnerCleanupTicker(io) {
    setInterval(() => {
        const now = Date.now();
        for (const raceId of Array.from(runnersByRaceId.keys())) {
            const room = io.sockets.adapter.rooms.get(raceRoomName(raceId));
            const roomSize = room?.size || 0;
            if (roomSize > 0) {
                runnerEmptyStartAt.delete(raceId);
                continue;
            }
            // roomSize === 0: track how long it's been empty
            if (!runnerEmptyStartAt.has(raceId)) {
                runnerEmptyStartAt.set(raceId, now);
                continue;
            }
            const emptyFor = now - runnerEmptyStartAt.get(raceId);
            if (emptyFor >= RUNNER_EMPTY_TIMEOUT_MS) {
                logger.warn(
                    { raceId, emptyMs: emptyFor },
                    '[critter-kart] disposing abandoned runner (no sockets in race room)',
                );
                disposeRunner(raceId);
            }
        }
    }, RUNNER_CLEANUP_INTERVAL_MS);
    logger.info(
        { emptyTimeoutMs: RUNNER_EMPTY_TIMEOUT_MS, intervalMs: RUNNER_CLEANUP_INTERVAL_MS },
        '[critter-kart] runner cleanup ticker started',
    );
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

    startRunnerCleanupTicker(io);

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
                        telegramUserId: p.telegramUserId ?? null,
                        slot: idx,
                        kartId: p.kartId,
                        racerId: p.racerId || 'rusty',
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
                        selfKartId: player.kartId,   // AUTHORITATIVE: this socket's kart
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
        // PINO: object first, message second.
        logger.info({ socketId: client.id, payload }, '[VERBOSE joinRace] received');
        try {
            const { raceId, telegramUserId } = payload || {};
            if (!raceId || !telegramUserId) {
                logger.warn({ raceId, telegramUserId }, '[VERBOSE joinRace] REJECT — missing fields');
                return ackError(ack, 'raceId_and_telegramUserId_required');
            }
            const race = await CritterKartRace.findOne({ raceId }).lean();
            if (!race) {
                logger.warn({ raceId }, '[VERBOSE joinRace] REJECT — race not found');
                return ackError(ack, 'race_not_found');
            }
            const player = race.players.find(p => p.telegramUserId === telegramUserId);
            if (!player) {
                logger.warn(
                    { raceId, telegramUserId, racePlayerIds: race.players.map(p => p.telegramUserId) },
                    '[VERBOSE joinRace] REJECT — player not in race',
                );
                return ackError(ack, 'not_in_race');
            }
            if (['settled', 'cancelled'].includes(race.state)) {
                logger.warn({ raceId, state: race.state }, '[VERBOSE joinRace] REJECT — race terminal');
                return ackError(ack, 'race_terminal', `race state: ${race.state}`);
            }

            // Update socket binding + join the race room
            registerClientIdentity(client, telegramUserId);
            client.join(raceRoomName(raceId));
            logger.info(
                { socketId: client.id, raceId, telegramUserId, kartId: player.kartId, room: raceRoomName(raceId) },
                '[VERBOSE joinRace] OK — joined room',
            );

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

            // REPLAY the locked race-start anchor. The runCountdownAndRace
            // broadcast of race:countdownLocked is fire-and-forget to
            // whoever was in the room at the time — a socket that joins
            // afterwards (or reconnects mid-race) misses it and falls
            // back to the stale provisional anchor, running its OWN
            // private countdown out of sync with the racing peers.
            // If the lock has been computed, emit it directly to this
            // socket so its anchor matches everyone else's.
            if (typeof race.lockedStartAtMs === 'number' && race.lockedStartAtMs > 0) {
                client.emit('race:countdownLocked', {
                    raceId: race.raceId,
                    startAtMs: race.lockedStartAtMs,
                });
                logger.info(
                    { socketId: client.id, raceId, startAtMs: race.lockedStartAtMs },
                    '[VERBOSE joinRace] replayed lockedStartAtMs to late joiner',
                );
            }

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
    // Per-socket race:input traffic counter — used by the per-second
    // heartbeat below to detect "client stopped sending input" which is
    // the symptom of asset-loading freeze, rAF death, or client tab
    // backgrounded. If a socket's input stream goes silent for ~30s,
    // Render's load balancer will tear down the otherwise-idle WS.
    let raceInputCount = 0;
    let lastRaceInputAt = 0;
    let lastRaceInputKartId = null;
    client.on('race:input', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const { raceId, kartId, seq, steer, throttle, brake, drift } = payload;
        if (!raceId || !kartId) return;
        raceInputCount++;
        lastRaceInputAt = Date.now();
        lastRaceInputKartId = kartId;
        const runner = getRunner(raceId);
        if (!runner) return;
        runner.applyInput({ kartId, seq, steer, throttle, brake, drift });
    });

    // race:useItem — a human fires their held item. Server resolves the use
    // (projectile/trap spawn or immediate effect) + any hits authoritatively;
    // effects propagate to all clients via the snapshot. Low-frequency, so it
    // stays under the normal rate limit (not in RL_EXEMPT_EVENTS).
    // NOTE: trusts payload.kartId (same as race:input). The runner no-ops if
    // the kart holds nothing. Binding socket→kartId is a wager-hardening item.
    client.on('race:useItem', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const { raceId, kartId } = payload;
        if (!raceId || !kartId) return;
        const runner = getRunner(raceId);
        if (!runner) return;
        runner.useItem({ kartId });
    });
    // Once-per-second heartbeat: how many race:input events did this
    // socket emit in the last second? If ZERO during an active race
    // ↘ client side rAF isn't running or socket isn't sending → WS
    // will idle-disconnect.
    const inputHeartbeat = setInterval(() => {
        const count = raceInputCount;
        raceInputCount = 0;
        if (count > 0) {
            // PINO API: object FIRST then message
            logger.info(
                { socketId: client.id, count, kartId: lastRaceInputKartId, msSinceLast: Date.now() - lastRaceInputAt },
                '[VERBOSE race:input] heartbeat',
            );
        }
    }, 1000);
    client.on('disconnect', () => clearInterval(inputHeartbeat));

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
            logger.info('[VERBOSE lobby:create] received', {
                socketId: client.id,
                identityFromPayload: { telegramUserId, telegramUsername, firstName },
                handshakeAuth: client.handshake?.auth,
                payload,
            });
            if (!telegramUserId) {
                logger.warn('[VERBOSE lobby:create] REJECT: no identity', { socketId: client.id });
                return ackError(ack, 'identity_required');
            }
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
            logger.info('[VERBOSE lobby:create] OK', {
                lobbyId: lobby.lobbyId,
                wire,
            });
            ackOk(ack, { lobby: wire });
        } catch (err) {
            logger.error('[lobby:create]', { error: err.message, stack: err.stack });
            ackError(ack, 'create_failed', err.message);
        }
    });

    // ── lobby:join ────────────────────────────────────────────────────
    // Sends a join request to the host (always pending — host accepts).
    client.on('lobby:join', async (payload, ack) => {
        try {
            const { telegramUserId, telegramUsername, firstName } = identityFromPayload(payload);
            logger.info('[VERBOSE lobby:join] received', {
                socketId: client.id,
                identityFromPayload: { telegramUserId, telegramUsername, firstName },
                handshakeAuth: client.handshake?.auth,
                payload,
            });
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
            logger.info('[VERBOSE lobby:ready] received', {
                socketId: client.id,
                tgFromIdentity: telegramUserId,
                handshakeAuth: client.handshake?.auth,
                payload,
            });
            if (!telegramUserId) {
                logger.warn('[VERBOSE lobby:ready] REJECT: no identity', { socketId: client.id });
                return ackError(ack, 'identity_required');
            }
            const { lobbyId, ready } = payload || {};
            if (!lobbyId) {
                logger.warn('[VERBOSE lobby:ready] REJECT: no lobbyId', { socketId: client.id, payload });
                return ackError(ack, 'lobbyId_required');
            }
            const lobby = await lobbySetReady({ lobbyId, telegramUserId, ready });
            const wire = toLobbyStateWire(lobby);
            const roomMembers = await io.in(lobbyRoomName(lobby.lobbyId)).fetchSockets();
            logger.info('[VERBOSE lobby:ready] OK + broadcasting', {
                lobbyId, telegramUserId, ready,
                roomName: lobbyRoomName(lobby.lobbyId),
                socketsInRoom: roomMembers.map(s => s.id),
                wire,
            });
            io.to(lobbyRoomName(lobby.lobbyId)).emit('lobby:state', { lobby: wire });
            ackOk(ack);
        } catch (err) {
            logger.error('[VERBOSE lobby:ready] THREW', {
                socketId: client.id,
                error: err.message,
                stack: err.stack,
                payload,
            });
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
            // If the lobby is already 'starting', the race was created
            // but the client transition failed for SOME reason (network
            // hiccup, race condition with first emit, browser tab not
            // foreground). Don't reject — re-emit race:start for the
            // existing race so the retry catches.
            if (lobby.state === 'starting' && lobby.raceId) {
                const existing = await CritterKartRace.findOne({ raceId: lobby.raceId }).lean();
                if (existing) {
                    logger.info('[critter-kart/lobby] re-emit race:start (lobby already starting)', {
                        lobbyId, raceId: lobby.raceId,
                    });
                    const memberWire = existing.players.map((p, i) => ({
                        username: p.displayName,
                        telegramUserId: p.telegramUserId ?? null,
                        slot: i,
                        kartId: p.kartId,
                        racerId: p.racerId || 'rusty',
                        isBot: p.isBot,
                    }));
                    // Per-socket (not broadcast) so each human gets an
                    // AUTHORITATIVE selfKartId — fixes both clients defaulting
                    // to slot 0 on the re-emit path.
                    const reAt = Date.now();
                    for (const p of existing.players) {
                        if (p.isBot || p.telegramUserId == null) continue;
                        const pc = findClientByTgId(p.telegramUserId);
                        if (!pc) continue;
                        pc.emit('race:start', {
                            roomId: existing.raceId,
                            startAtMs: reAt,
                            members: memberWire,
                            selfKartId: p.kartId,
                        });
                    }
                    return ackOk(ack, { raceId: existing.raceId, retry: true });
                }
                // Lobby says starting but no race doc found — fall through
                // to create one fresh (rare edge case, probably TTL)
            }
            if (lobby.state !== 'open' && lobby.state !== 'starting') {
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
                telegramUserId: p.telegramUserId ?? null,
                slot: i,
                kartId: p.kartId,
                racerId: p.racerId || 'rusty',
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
                    selfKartId: player.kartId,   // AUTHORITATIVE: this socket's kart
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

            // CRITICAL: kick off the countdown + race runner.
            //
            // The old matchmaking flow relied on each client emitting
            // `critterkart:ready` after the scene loaded, which would
            // trigger runCountdownAndRace when `allReady === true`.
            // The lobby-based flow added in this session bypassed
            // critterkart:ready entirely (lobby:ready already proved
            // readiness before race creation), so the race was being
            // STUCK in 'matched' state forever — no countdown, no
            // RaceRunner, no snapshots. Each client mounted the race
            // screen, sat idle, and ~30s later the WebSocket
            // timed out → reconnect grace → DNF.
            //
            // Diagnosed 2026-06-05 evening: server logs showed
            // joinRace OK x2 followed by zero snapshot heartbeats
            // (heartbeat logs would fire every 100 ticks = ~5s).
            //
            // Fix: schedule runCountdownAndRace 1.5s after race
            // creation. The delay gives clients time to receive
            // race:start, run startMpRace, emit critterkart:joinRace,
            // and have the server-side handler call client.join() to
            // bind the socket to the race broadcast room. Without this
            // delay, the 3-2-1 countdown broadcast would fire into an
            // empty room.
            // READY HANDSHAKE (2026-06-08): the prior 1.5s blanket delay
            // worked but caused desync — joiners with slow asset loads
            // landed in a race already-in-progress. JJ's report:
            // "races started again at slightly different times, they
            // are running on their own tracks."
            //
            // New flow: race countdown is held until EVERY human has
            // emitted `critterkart:ready` (sent by the client when its
            // LoadingManager finishes loading every GLB). The existing
            // critterkart:ready handler at line ~530 already triggers
            // runCountdownAndRace when allReady → so this handler just
            // needs to NOT pre-empt that.
            //
            // Fallback: if a human never sends ready (asset corrupt,
            // browser crash, etc) we don't want to hang the lobby
            // forever. Schedule a 15-second force-start. The lifecycle
            // beginCountdown is idempotent via state filter
            // (matched/loading only), so the late critterkart:ready
            // would no-op if it arrives after force-start.
            setTimeout(() => {
                runCountdownAndRace(io, race.raceId).catch(err => {
                    // beginCountdown will throw if race already past
                    // matched/loading — that's the success case (a
                    // critterkart:ready already triggered countdown).
                    // Anything else is a real error.
                    if (!String(err.message || '').includes('not in countdown-eligible state')) {
                        logger.error('[critter-kart] countdown/race driver failed (fallback timer)', {
                            raceId: race.raceId, error: err.message,
                        });
                    }
                });
            }, 15_000);
            logger.info(
                { raceId: race.raceId, fallbackMs: 15_000 },
                '[VERBOSE lobby:start] awaiting critterkart:ready from all humans (15s fallback)',
            );
            // DELIBERATELY do NOT emit lobby:closed here. Fish's
            // LobbyScreen (screens.tsx:292) handles lobby:closed by
            // calling onLeave() which routes back to menu — that would
            // immediately undo the race:start transition because both
            // events arrive in the same socket batch and React commits
            // both state updates together (race:start sets mpRace and
            // go('race'); lobby:closed then calls go('menu')).
            // The lobby is marked 'starting' in Mongo via markStarting
            // above; it'll auto-expire via TTL.
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
    client.on('disconnect', async (reason) => {
        // socket.io reasons: 'transport close', 'ping timeout', 'server
        // disconnect', 'client disconnect', 'transport error', etc.
        const rooms = Array.from(client.rooms || []);
        // CORRECT PINO SYNTAX — object FIRST, message SECOND.
        // The old `.warn('msg', {data})` order silently DROPPED the data
        // object across this entire file's logs. Fixed 2026-06-05.
        logger.warn(
            {
                socketId: client.id,
                reason: reason || 'unknown',
                rooms,
                tgUserId: client.handshake?.auth?.telegramUserId,
                game: client.handshake?.auth?.game,
            },
            '[VERBOSE disconnect] socket closed',
        );
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

        // LOCK + BROADCAST the canonical race-start wall-clock.
        //
        // At lobby:start the server emitted a placeholder startAtMs
        // (= NOW + 4000), but that's stale by the time all clients
        // have actually loaded. Re-anchor here: GO happens at this
        // function call + 3 seconds (the 3-2-1 sleeps below). Emit
        // the locked value so every client can align its `elapsed`
        // computation to the same wall-clock anchor regardless of
        // when each finished loading assets.
        //
        // Client reads this via NetClient.getRaceStartAtMs() which
        // overrides the stale mp.startAtMs from race:start.
        const lockedStartAtMs = Date.now() + 3000;
        // Persist the locked anchor on the race doc so the joinRace
        // handler can REPLAY it to late-joining or reconnecting sockets.
        // Without persistence, anyone who joins the race room AFTER this
        // broadcast misses the lock entirely and falls back to the
        // provisional race:start anchor → private out-of-sync countdown.
        // JJ's "rusty started way before shelly" 2026-06-10.
        await CritterKartRace.updateOne(
            { raceId },
            { $set: { lockedStartAtMs } },
        ).catch(err => {
            logger.warn({ raceId, error: err.message }, '[critter-kart] failed to persist lockedStartAtMs (non-fatal)');
        });
        broadcastToRace(io, raceId, 'race:countdownLocked', {
            raceId,
            startAtMs: lockedStartAtMs,
        });
        logger.info(
            { raceId, startAtMs: lockedStartAtMs },
            '[VERBOSE countdown] locked startAtMs broadcast',
        );

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
                if (snap.tick % 100 === 0) {
                    const roomSize = io.sockets.adapter.rooms.get(raceRoomName(raceId))?.size || 0;
                    // PINO: object first, message second.
                    logger.info(
                        { raceId, tick: snap.tick, kartsInSnap: snap.karts?.length || 0, roomSize },
                        '[VERBOSE snapshot] heartbeat',
                    );
                }
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
        // IDEMPOTENCY GUARD (2026-06-09): the 15s lobby:start fallback
        // can fire runCountdownAndRace a SECOND time while the real
        // handshake-triggered run is mid-race. The second call's
        // `await beginCountdown(...)` throws "not in countdown-eligible
        // state (was: racing|countdown|loading)". Without this guard,
        // the catch below ran cancelRace() and killed the legitimate
        // race — snapshots stopped, both clients saw bots freeze ~8s
        // in. JJ's race 4Wm_QobMo8Q on 2026-06-09.
        //
        // The matching .catch at the fallback-timer caller site (line
        // ~1037) already silences this, but that catch never sees the
        // error because THIS catch swallows it first. So we have to
        // detect the idempotency case here.
        if (String(err?.message || '').includes('not in countdown-eligible state')) {
            logger.info(
                { raceId, detail: err.message },
                '[critter-kart] runCountdownAndRace called against non-eligible state — idempotent no-op',
            );
            return;
        }
        // Pino arg-order: object first, message second (otherwise the
        // extras get dropped — we couldn't see err.message in the
        // logs before the JJ 2026-06-09 diagnosis).
        logger.error(
            { raceId, error: err?.message, stack: err?.stack },
            '[critter-kart] race driver failed',
        );
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
