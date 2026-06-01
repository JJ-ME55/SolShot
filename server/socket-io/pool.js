/**
 * Pool socket.io handlers — V2.β match flow.
 *
 * Self-contained module to keep main.js's 5.2k lines untouched as much
 * as possible. main.js calls:
 *   - initPoolSocket(io)              once at startup
 *   - registerPoolHandlers(client, io) inside the connection block per-client
 *
 * Event surface:
 *
 * Client → Server:
 *   pool:enqueue       { identity, mode, format, stake?, callsign? }
 *   pool:cancel-search { identity }
 *   pool:shoot         { matchId, shotParams }   ← ShotParams = { power, angle, spinX, spinY }
 *   pool:forfeit       { matchId }
 *
 * Server → Client (room-based):
 *   pool:queue-update   { ticketId, mode, waitMs, currentHalf }
 *   pool:queue-timeout  { ticketId, reason }
 *   pool:match-found    { matchId, opponent, breakerIdx, currentBallState, currentTurn }
 *   pool:shot-result    { matchId, shooterIdx, simResult }
 *   pool:match-end      { matchId, winnerIdx, reason, rewards }
 *   pool:error          { event, reason, detail? }
 *
 * Auth: V2.β trusts identity from the client (verified by Privy/TG JWT
 * already present in the SolShot socket connection). Future hardening
 * binds socket → identity at handshake time.
 *
 * Concurrency: in-memory client-routing map keyed by playerKey
 * (tg:<id> or w:<addr>) so the matchmaking onMatchFound callback can
 * find both sockets to emit to. Cleared on disconnect.
 */

import logger from '../services/logger.js';
import {
    configureMatchmaking,
    enqueue,
    dequeue,
    getStatus as getQueueStatus
} from '../services/poolMatchmaking.js';
import {
    createMatchFromMatchmakingPair,
    applySimulationResultToMatch,
    finalizeMatch
} from '../services/poolMatchOrchestrator.js';
import { simulateShotForClient } from '../services/poolSimulation.js';
import { getStandardTableConfig } from '../services/pool/sim/rack.js';
import { getOrCreateEloDoc } from '../services/poolElo.js';
import PoolMatch from '../models/PoolMatch.js';

// ──────────────────────────────────────────────────────────────────────
// Client routing — playerKey → socket
// ──────────────────────────────────────────────────────────────────────

/** Map<playerKey, clientSocket>. Cleared on disconnect. */
const clientByPlayerKey = new Map();

/** Map<socketId, playerKey>. For reverse lookup on disconnect. */
const playerKeyBySocketId = new Map();

function identityKey(identity) {
    if (!identity) return null;
    if (identity.telegramUserId) return `tg:${identity.telegramUserId}`;
    if (identity.walletAddress) return `w:${identity.walletAddress}`;
    return null;
}

function registerClientIdentity(client, identity) {
    const key = identityKey(identity);
    if (!key) return null;
    clientByPlayerKey.set(key, client);
    playerKeyBySocketId.set(client.id, key);
    return key;
}

function unregisterClient(client) {
    const key = playerKeyBySocketId.get(client.id);
    if (key && clientByPlayerKey.get(key)?.id === client.id) {
        clientByPlayerKey.delete(key);
    }
    playerKeyBySocketId.delete(client.id);
    return key;
}

function findClientByIdentity(identity) {
    const key = identityKey(identity);
    if (!key) return null;
    return clientByPlayerKey.get(key) || null;
}

// ──────────────────────────────────────────────────────────────────────
// Module init — wire matchmaking callbacks once
// ──────────────────────────────────────────────────────────────────────

let initialized = false;

export function initPoolSocket(io) {
    if (initialized) return;
    initialized = true;

    configureMatchmaking({
        onMatchFound: async (entryA, entryB) => {
            try {
                const { match } = await createMatchFromMatchmakingPair(entryA, entryB);
                // Push match into 'in_progress' immediately for non-wagered modes
                // (wagered waits for deposits — V2.γ work). V2.β is quick-match
                // only, so flip status here.
                if (match.mode === 'quick') {
                    match.status = 'in_progress';
                    await match.save();
                }
                broadcastMatchFound(io, match, entryA, entryB);
            } catch (err) {
                logger.error('[pool] onMatchFound failed', {
                    error: err.message,
                    aIdent: identityKey(entryA.identity),
                    bIdent: identityKey(entryB.identity)
                });
                // Notify both clients of the failure if we can find them
                emitError(findClientByIdentity(entryA.identity), 'match-creation', 'match_creation_failed');
                emitError(findClientByIdentity(entryB.identity), 'match-creation', 'match_creation_failed');
            }
        },
        onSearchTimeout: (entry, reason) => {
            const c = findClientByIdentity(entry.identity);
            if (!c) return;
            c.emit('pool:queue-timeout', { ticketId: entry.ticketId, reason });
        }
    });

    logger.info('[pool] socket module initialised');
}

// ──────────────────────────────────────────────────────────────────────
// Per-client handler registration
// ──────────────────────────────────────────────────────────────────────

/**
 * Called from main.js's io.on('connection', client => { ... }) block.
 * Adds pool-specific event listeners alongside SolShot's existing ones.
 */
export function registerPoolHandlers(client, io) {

    client.on('pool:enqueue', async (payload, ack) => {
        try {
            const { identity, mode, format = 'BO1', stake, callsign } = payload || {};
            if (!identity) return ackError(ack, 'identity_required');
            if (!['quick', 'wagered'].includes(mode)) return ackError(ack, 'invalid_mode');

            // Bind this client to the identity for callback routing
            registerClientIdentity(client, { ...identity, callsign });

            // Resolve ELO for matchmaking band
            const eloDoc = await getOrCreateEloDoc({ ...identity, callsign });

            const entry = enqueue({
                identity: { ...identity, callsign },
                rating: eloDoc.rating,
                provisional: eloDoc.provisional,
                mode,
                stake: mode === 'wagered' ? stake : null,
                format
            });

            ackOk(ack, { ticketId: entry.ticketId, rating: entry.rating, mode: entry.mode });
            client.emit('pool:queue-update', {
                ticketId: entry.ticketId,
                mode: entry.mode,
                waitMs: 0,
                currentHalf: entry.currentHalf
            });
        } catch (err) {
            logger.error('[pool:enqueue]', { error: err.message });
            ackError(ack, 'enqueue_failed', err.message);
        }
    });

    client.on('pool:cancel-search', (payload, ack) => {
        try {
            const { identity } = payload || {};
            if (!identity) return ackError(ack, 'identity_required');
            const removed = dequeue(identity);
            ackOk(ack, { removed });
        } catch (err) {
            ackError(ack, 'cancel_failed', err.message);
        }
    });

    client.on('pool:shoot', async (payload, ack) => {
        try {
            const { matchId, shotParams } = payload || {};
            if (!matchId || !shotParams) return ackError(ack, 'matchId_and_shotParams_required');

            const match = await PoolMatch.findOne({ matchId });
            if (!match) return ackError(ack, 'match_not_found');
            if (match.status !== 'in_progress') {
                return ackError(ack, `status_${match.status}_not_in_progress`);
            }

            // Determine shooter — match the client's identity to one of the
            // two players. This is the auth boundary for cheat prevention:
            // a client can ONLY shoot for the player slot whose identity it
            // claims. V2.γ hardens this further with Privy signature verification.
            const myKey = playerKeyBySocketId.get(client.id);
            const shooterIdx = match.players.findIndex(p => identityKey(p) === myKey);
            if (shooterIdx === -1) return ackError(ack, 'not_a_match_participant');

            const expectedTurn = match.currentTurn?.activePlayerIdx;
            if (expectedTurn !== undefined && expectedTurn !== null && expectedTurn !== shooterIdx) {
                return ackError(ack, 'not_your_turn');
            }

            // Run the sim
            const simOut = simulateShotForClient({
                initialBalls: match.currentBallState,
                shotParams,
                tableConfig: getStandardTableConfig(),
                physicsConfig: undefined
            });
            if (!simOut.ok) return ackError(ack, 'invalid_shot', simOut.reason);

            // Persist the result + ball state
            const applied = await applySimulationResultToMatch(matchId, {
                shooterIdx,
                shotParams,
                simResult: simOut.result
            });
            if (!applied.ok) return ackError(ack, 'persist_failed', applied.reason);

            // Broadcast to both players
            broadcastShotResult(io, applied.match, shooterIdx, simOut.result);

            // Check for match-end conditions (8-ball potted) — simplified
            // V2.β heuristic; full referee logic comes when the Referee port
            // moves into the server (a later commit).
            const eightBallPotted = simOut.result.events.some(e => e.type === 'eight_ball_potted');
            if (eightBallPotted) {
                // Naive: shooter wins if they're the one who potted (referee
                // will refine this — they could also lose by potting it early).
                const final = await finalizeMatch(matchId, { winnerIdx: shooterIdx, winReason: 'normal' });
                if (final.ok) {
                    broadcastMatchEnd(io, final.match, final.eloResult, final.rewardsResult);
                }
            }

            ackOk(ack, { ticks: simOut.result.ticks, events: simOut.result.events.length });
        } catch (err) {
            logger.error('[pool:shoot]', { error: err.message });
            ackError(ack, 'shoot_failed', err.message);
        }
    });

    client.on('pool:forfeit', async (payload, ack) => {
        try {
            const { matchId } = payload || {};
            if (!matchId) return ackError(ack, 'matchId_required');

            const match = await PoolMatch.findOne({ matchId });
            if (!match) return ackError(ack, 'match_not_found');

            const myKey = playerKeyBySocketId.get(client.id);
            const forfeiterIdx = match.players.findIndex(p => identityKey(p) === myKey);
            if (forfeiterIdx === -1) return ackError(ack, 'not_a_match_participant');
            const winnerIdx = forfeiterIdx === 0 ? 1 : 0;

            const final = await finalizeMatch(matchId, { winnerIdx, winReason: 'forfeit' });
            if (!final.ok) return ackError(ack, 'forfeit_failed', final.reason);
            broadcastMatchEnd(io, final.match, final.eloResult, final.rewardsResult);
            ackOk(ack, { matchId, winnerIdx });
        } catch (err) {
            logger.error('[pool:forfeit]', { error: err.message });
            ackError(ack, 'forfeit_failed', err.message);
        }
    });

    client.on('disconnect', () => {
        const key = playerKeyBySocketId.get(client.id);
        if (key) {
            const [scheme, id] = key.split(':');
            const identity = scheme === 'tg' ? { telegramUserId: Number(id) } : { walletAddress: id };
            try { dequeue(identity); } catch (_) {}
        }
        unregisterClient(client);
        // In-flight match handling (opponent left) comes in V2.γ with the
        // disconnect/reconnect overlay. For V2.β: queue cleanup only.
    });
}

// ──────────────────────────────────────────────────────────────────────
// Broadcast helpers
// ──────────────────────────────────────────────────────────────────────

function broadcastMatchFound(io, match, entryA, entryB) {
    const a = findClientByIdentity(entryA.identity);
    const b = findClientByIdentity(entryB.identity);

    const basePayload = {
        matchId: match.matchId,
        mode: match.mode,
        format: match.format,
        currentBallState: match.currentBallState,
        currentTurn: match.currentTurn,
        racks: match.racks
    };

    if (a) a.emit('pool:match-found', {
        ...basePayload,
        youIdx: 0,
        opponent: publicPlayerView(match.players[1])
    });
    if (b) b.emit('pool:match-found', {
        ...basePayload,
        youIdx: 1,
        opponent: publicPlayerView(match.players[0])
    });
}

function broadcastShotResult(io, match, shooterIdx, simResult) {
    const payload = {
        matchId: match.matchId,
        shooterIdx,
        simResult,
        currentTurn: match.currentTurn,
        currentBallState: match.currentBallState
    };
    for (let i = 0; i < 2; i++) {
        const player = match.players[i];
        if (!player) continue;
        const c = findClientByIdentity({
            telegramUserId: player.telegramUserId,
            walletAddress: player.walletAddress
        });
        if (c) c.emit('pool:shot-result', payload);
    }
}

function broadcastMatchEnd(io, match, eloResult, rewardsResult) {
    const payload = {
        matchId: match.matchId,
        winnerIdx: match.winnerIdx,
        reason: match.winReason,
        eloDelta: eloResult ? { a: eloResult.deltaA, b: eloResult.deltaB } : null,
        rewards: rewardsResult?.rewards || null
    };
    for (let i = 0; i < 2; i++) {
        const player = match.players[i];
        if (!player) continue;
        const c = findClientByIdentity({
            telegramUserId: player.telegramUserId,
            walletAddress: player.walletAddress
        });
        if (c) c.emit('pool:match-end', payload);
    }
}

function publicPlayerView(player) {
    return {
        callsign: player.callsign,
        prestigeTier: player.prestigeTier,
        isAiBot: player.isAiBot,
        eloAtStart: player.eloAtStart
    };
}

// ──────────────────────────────────────────────────────────────────────
// Ack helpers — uniform success / error shape
// ──────────────────────────────────────────────────────────────────────

function ackOk(ack, data = {}) {
    if (typeof ack === 'function') ack({ ok: true, ...data });
}

function ackError(ack, reason, detail) {
    const payload = detail ? { ok: false, reason, detail } : { ok: false, reason };
    if (typeof ack === 'function') ack(payload);
}

function emitError(client, event, reason, detail) {
    if (!client) return;
    const payload = detail ? { event, reason, detail } : { event, reason };
    client.emit('pool:error', payload);
}

export default {
    initPoolSocket,
    registerPoolHandlers
};
