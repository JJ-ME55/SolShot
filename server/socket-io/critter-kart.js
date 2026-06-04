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
} from '../services/games/critter-kart/lifecycle.js';
import CritterKartRace from '../models/CritterKartRace.js';

// ──────────────────────────────────────────────────────────────────────
// Client routing — telegramUserId → socket
// ──────────────────────────────────────────────────────────────────────

/** Map<telegramUserId(number), clientSocket>. Cleared on disconnect. */
const clientByTgId = new Map();
/** Map<socketId, telegramUserId>. For reverse lookup on disconnect. */
const tgIdBySocketId = new Map();

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

            // Update the player's current socketId in the race doc
            await CritterKartRace.updateOne(
                { raceId, 'players.telegramUserId': telegramUserId },
                { $set: { 'players.$.socketId': client.id } },
            );

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
    client.on('disconnect', () => {
        const tgId = unregisterClient(client);
        if (!tgId) return;
        // Best-effort: remove from queue if they were waiting. Don't
        // touch active races — let the race lifecycle handle DNF when
        // the player explicitly leaves or times out.
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
