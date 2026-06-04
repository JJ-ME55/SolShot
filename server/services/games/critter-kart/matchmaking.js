/**
 * Critter Kart matchmaking — quick-match queue.
 *
 * Session 1 scope: FIFO queue + ticker that starts races as soon as
 * MIN_PLAYERS humans waiting, with bot-fill if the queue thins out
 * for too long. No ELO/rating-band matching in v1 — that comes when
 * wagered races land (rating-based to keep games competitive).
 *
 * Algorithm (runs on each tick OR on each new enqueue):
 *   1. Pull oldest N entries from CritterKartQueue (N = min(MAX_PLAYERS, queue size))
 *   2. If N >= MAX_PLAYERS → start race with N humans, no bots
 *   3. Else if N >= MIN_PLAYERS AND oldest entry waited >= QUICK_START_AFTER_MS
 *      → start race with N humans + (MAX_PLAYERS - N) bots
 *   4. Else if N >= 1 AND oldest entry waited >= SOLO_AFTER_MS
 *      → start race with N humans + bots (lonely-player path)
 *   5. Else → wait
 *
 * Lifecycle integration: matchmaker calls createRace() from lifecycle.js
 * which writes the Mongo doc. Then invokes onMatchFound() callback so
 * socket layer can emit `critterkart:matched` to each queued player.
 */

import logger from '../../logger.js';
import CritterKartQueue from '../../../models/CritterKartQueue.js';
import { createRace, fillWithBots } from './lifecycle.js';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../../models/CritterKartRace.js';

// ── Tunable timings ────────────────────────────────────────────────────
// QUICK_START_AFTER_MS: when ≥2 humans queued, how long to wait before
//   bot-filling rather than holding out for more humans.
const QUICK_START_AFTER_MS = 30_000;
// SOLO_AFTER_MS: solo player + 5 bots if no other humans show up.
//   Generous because a 1-human lonely race is the worst UX; better to
//   wait a bit more for a second human.
const SOLO_AFTER_MS = 60_000;
// TICKER_INTERVAL_MS: how often the matchmaker re-evaluates the queue.
//   Fast enough to feel responsive, slow enough to not churn Mongo.
const TICKER_INTERVAL_MS = 5_000;

// ── Callbacks (set via configureMatchmaking) ───────────────────────────
let onMatchFound = null;   // (race, players[]) → void  (socket emits launch URLs)
let onSearchTimeout = null; // (entry, reason) → void   (queue-cancel notification)

export function configureMatchmaking({ onMatchFound: matchCb, onSearchTimeout: timeoutCb } = {}) {
    onMatchFound = matchCb || null;
    onSearchTimeout = timeoutCb || null;
}

// ── enqueue ────────────────────────────────────────────────────────────
// Adds a player to the queue. Idempotent — if already queued, just
// refreshes socketId for reconnect. Caller passes the existing socket
// so we can find this player on match.
//
// Returns the queue entry. Triggers an immediate tick — if there are
// already MIN_PLAYERS waiting, the race starts before this function
// resolves (caller learns via onMatchFound callback, not return value).
export async function enqueue({
    telegramUserId, telegramUsername, firstName, socketId,
}) {
    if (!telegramUserId || typeof telegramUserId !== 'number') {
        throw new Error('enqueue: telegramUserId required (number)');
    }
    if (!socketId) {
        throw new Error('enqueue: socketId required');
    }

    const existing = await CritterKartQueue.findOneAndUpdate(
        { telegramUserId },
        {
            $set: { socketId, telegramUsername: telegramUsername ?? null, firstName: firstName ?? null },
            $setOnInsert: { joinedAt: new Date() },
        },
        { upsert: true, new: true },
    );

    logger.info('[critter-kart] enqueued', {
        telegramUserId,
        queueSize: await CritterKartQueue.estimatedDocumentCount(),
    });

    // Immediate tick — if this join brings the queue to a startable
    // size, start the race now rather than waiting for the next tick.
    setImmediate(() => tickQueue().catch(err => {
        logger.error('[critter-kart] immediate tick failed', { error: err.message });
    }));

    return existing;
}

// ── dequeue ────────────────────────────────────────────────────────────
// Player leaves the queue (cancel button or disconnect). No-op if not
// in queue.
export async function dequeue({ telegramUserId }) {
    if (!telegramUserId) return;
    const result = await CritterKartQueue.deleteOne({ telegramUserId });
    if (result.deletedCount > 0) {
        logger.info('[critter-kart] dequeued', { telegramUserId });
    }
}

// ── queue status ───────────────────────────────────────────────────────
// "Am I in the queue and how long have I been waiting?" — useful for
// the bot to render "queued, ETA ~30s" updates.
export async function getQueueStatus({ telegramUserId }) {
    if (!telegramUserId) return null;
    const entry = await CritterKartQueue.findOne({ telegramUserId }).lean();
    if (!entry) return null;
    const waitMs = Date.now() - new Date(entry.joinedAt).getTime();
    const totalInQueue = await CritterKartQueue.estimatedDocumentCount();
    return {
        ticketId: String(entry._id),
        waitMs,
        positionInQueue: await CritterKartQueue.countDocuments({
            joinedAt: { $lte: entry.joinedAt },
        }),
        totalInQueue,
    };
}

// ── tickQueue ──────────────────────────────────────────────────────────
// The matchmaker's core loop. Called every TICKER_INTERVAL_MS by the
// startMatchmakingTicker, and also after every enqueue.
//
// Atomicity note: deleting queue entries + creating the race must be
// done in a way that we don't double-match the same player. We do this
// by:
//   1. Reading the candidate set (find + sort + limit)
//   2. Atomically deleting them by _id (deleteMany with $in)
//   3. Checking the deletion count == candidate count
//   4. If less (race condition with concurrent tick), abort & retry
//      next tick
// This isn't a transaction but it's good enough for our scale.
async function tickQueue() {
    const candidates = await CritterKartQueue.find({})
        .sort({ joinedAt: 1 })
        .limit(MAX_PLAYERS)
        .lean();

    if (candidates.length === 0) return;

    const oldest = candidates[0];
    const oldestWaitMs = Date.now() - new Date(oldest.joinedAt).getTime();

    // Decide whether to start a race
    let shouldStart = false;
    let willBotFill = false;
    if (candidates.length >= MAX_PLAYERS) {
        shouldStart = true;
    } else if (candidates.length >= MIN_PLAYERS && oldestWaitMs >= QUICK_START_AFTER_MS) {
        shouldStart = true;
        willBotFill = true;
    } else if (candidates.length === 1 && oldestWaitMs >= SOLO_AFTER_MS) {
        shouldStart = true;
        willBotFill = true;
    }
    if (!shouldStart) return;

    // Atomic dequeue — only proceed if we got the exact set we read
    const ids = candidates.map(c => c._id);
    const delResult = await CritterKartQueue.deleteMany({ _id: { $in: ids } });
    if (delResult.deletedCount !== candidates.length) {
        logger.warn('[critter-kart] tick race condition — partial dequeue', {
            wanted: candidates.length,
            deleted: delResult.deletedCount,
        });
        return;   // Try again next tick
    }

    // Build players list
    const humans = candidates.map(c => ({
        telegramUserId: c.telegramUserId,
        displayName: c.telegramUsername ? `@${c.telegramUsername}` : (c.firstName || `Player ${String(c.telegramUserId).slice(-4)}`),
        socketId: c.socketId,
        isBot: false,
    }));
    const players = willBotFill ? fillWithBots(humans, MAX_PLAYERS) : humans;

    try {
        const { race, raceId } = await createRace({ players });

        // Notify the socket layer so it can emit `critterkart:matched`
        // with launch URLs to each human. Bots have no socket.
        if (onMatchFound) {
            try {
                onMatchFound(race, humans);
            } catch (err) {
                logger.error('[critter-kart] onMatchFound callback failed', {
                    raceId, error: err.message,
                });
            }
        }
    } catch (err) {
        logger.error('[critter-kart] race creation failed mid-tick — players lost', {
            error: err.message,
            playerIds: humans.map(h => h.telegramUserId),
        });
        // Players are already dequeued at this point; nothing to do
        // except notify them. onSearchTimeout is the wrong channel
        // (they were matched, not timed out), so just log for now.
        // Session 2 can add an emitError callback here.
    }
}

// ── startMatchmakingTicker ─────────────────────────────────────────────
// Boots the recurring ticker. Call once at server startup. Safe to
// call multiple times (idempotent — guarded by a module-level flag).
let tickerHandle = null;
export function startMatchmakingTicker() {
    if (tickerHandle) return;
    tickerHandle = setInterval(() => {
        tickQueue().catch(err => {
            logger.error('[critter-kart] tick failed', { error: err.message });
        });
    }, TICKER_INTERVAL_MS);
    // Allow Node to exit cleanly during tests (unref so this interval
    // doesn't keep the event loop alive on its own).
    if (typeof tickerHandle.unref === 'function') tickerHandle.unref();
    logger.info('[critter-kart] matchmaking ticker started', {
        intervalMs: TICKER_INTERVAL_MS,
    });
}

export function stopMatchmakingTicker() {
    if (tickerHandle) {
        clearInterval(tickerHandle);
        tickerHandle = null;
    }
}

// Exposed for tests / manual reconciliation:
export { tickQueue };
