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
} from '../services/games/critter-kart/lifecycle.js';
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
    const timer = setTimeout(() => {
        pendingReconnects.delete(telegramUserId);
        markDnf({ raceId, telegramUserId }).catch(err => {
            logger.error('[critter-kart] grace-expiry markDnf failed', {
                raceId, telegramUserId, error: err.message,
            });
        });
        logger.info('[critter-kart] reconnect grace expired → DNF', {
            raceId, telegramUserId, windowMs: RECONNECT_GRACE_MS,
        });
        // Session 2: swap kart to bot AI control here, then broadcast
        // critterkart:state so other racers see the AI takeover.
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

    // ── critterkart:input ─────────────────────────────────────────────
    // Session 2 wires this to the physics tick. Session 1: drop on the
    // floor — no warning so the client doesn't spam logs when it's
    // testing the connection.
    client.on('critterkart:input', () => { /* Session 2 */ });

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
// Race timing driver — runs the countdown + (Session 1: fake) race
// ──────────────────────────────────────────────────────────────────────
//
// Session 1: counts down 3 seconds, transitions to racing, waits a
// fake "race-time" (15 seconds for now so it's testable), then resolves
// with random positions and settles.
//
// Session 2: this is replaced/extended — countdown still mechanical,
// then the physics tick loop runs at 20Hz, snapshots emit at 15Hz,
// race ends when all karts finish or hard timeout.
const FAKE_RACE_DURATION_MS = 15_000;

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

        // SESSION 1 PLACEHOLDER: wait + resolve random.
        // Session 2 swaps this for the real physics tick loop.
        await sleep(FAKE_RACE_DURATION_MS);

        const race = await finishRace({ raceId, resolveStub: true });

        // Run settlement (writes career updates)
        const { results } = await settleRace({ raceId });

        // Broadcast final
        const settled = await CritterKartRace.findOne({ raceId }).lean();
        broadcastToRace(io, raceId, 'critterkart:final', {
            raceId,
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
    } catch (err) {
        logger.error('[critter-kart] race driver failed', { raceId, error: err.message });
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
