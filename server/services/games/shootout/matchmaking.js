/**
 * Shootout Quick Play matchmaking queue (Phase MP-expansion, 2026-06-08).
 *
 * In-memory FIFO queue per mode. Players hit shootout:quickplay:join,
 * land in the queue, and the moment N=cap players are queued the
 * matcher atomically pops them + spins up a lobby with all members
 * pre-joined, teams alternating (red→even, blue→odd), AND pre-ready.
 *
 * Why pre-ready? Quick Play skips the team-pick UI (per Fish's spec —
 * "they don't get to choose here, auto assign the teams"). Creating
 * the lobby in FULL state with everyone already ready + balanced
 * triggers the FULL→READY transition naturally → the existing 5s
 * auto-countdown fires → match starts. Zero new start-pipeline
 * code; quick play just feeds the existing flow.
 *
 * Storage:
 *   Map<mode, Array<{telegramUserId, telegramUsername, firstName,
 *                    socketId, joinedAt}>>
 *   Lives in-process. On server restart, queued players' socket
 *   reconnect → they re-tap Quick Play. Tolerable for a feature
 *   where the median wait is going to be 10-30s.
 *
 * Public API:
 *   joinQueue({mode, telegramUserId, telegramUsername, firstName, socketId})
 *     -> { queued: true, position }  or  { matched: true, members }
 *     Idempotent on telegramUserId: re-joining is a no-op if already
 *     queued in the same mode; moves you to the new mode otherwise.
 *
 *   cancelQueue({telegramUserId})
 *     -> { ok: true, removed: boolean }
 *     Removes the user from whatever queue they're in.
 *
 *   scrubBySocket({socketId})
 *     -> { removed: Array<telegramUserId> }
 *     Called from socket-io disconnect handler. Drops the user from
 *     any queue they're in.
 *
 *   _peek({mode})  -> Array (snapshot)
 *   _clearAll()    -> tests only
 */

import { MODE_CAP } from './lobbyService.js';

const _queues = new Map(); // mode -> Array<entry>

function _getQueue(mode) {
    if (!_queues.has(mode)) _queues.set(mode, []);
    return _queues.get(mode);
}

function _removeUser(telegramUserId) {
    let removed = false;
    for (const arr of _queues.values()) {
        for (let i = arr.length - 1; i >= 0; i -= 1) {
            if (arr[i].telegramUserId === telegramUserId) {
                arr.splice(i, 1);
                removed = true;
            }
        }
    }
    return removed;
}

/**
 * Try to match the head of `mode`'s queue. If queue length ≥ cap,
 * atomically pop the first `cap` entries and return them so the
 * caller can spin up the lobby. Otherwise return null.
 *
 * Exposed so a test can drive matchmaking deterministically without
 * relying on the implicit pop inside joinQueue.
 */
export function tryMatch(mode) {
    const cap = MODE_CAP[mode];
    if (!cap) return null;
    const q = _getQueue(mode);
    if (q.length < cap) return null;
    return q.splice(0, cap);
}

/**
 * Add a user to the queue for `mode`. Returns either a "queued"
 * result with their queue position (1-indexed) or a "matched" result
 * with the full N-member group when their entry completes the cap.
 *
 * The matched group includes the CALLER themselves; the caller is
 * NOT yet popped at the time of return — the matched group is from
 * the queue scoop done atomically inside this function.
 */
export function joinQueue({ mode, telegramUserId, telegramUsername, firstName, socketId }) {
    const cap = MODE_CAP[mode];
    if (!cap) return { error: 'invalid_mode' };
    if (!telegramUserId) return { error: 'no_user' };

    // Idempotent: if already in this mode's queue, no-op; if in a
    // different mode, move them.
    _removeUser(telegramUserId);

    const entry = {
        telegramUserId,
        telegramUsername: telegramUsername || null,
        firstName:        firstName || null,
        socketId:         socketId || null,
        joinedAt:         Date.now(),
    };
    const q = _getQueue(mode);
    q.push(entry);

    if (q.length >= cap) {
        const members = q.splice(0, cap);
        return { matched: true, members, mode };
    }
    return { queued: true, position: q.length, cap };
}

/**
 * Remove the user from any queue they're in. Returns whether they
 * were actually removed (false = they weren't queued).
 */
export function cancelQueue({ telegramUserId }) {
    if (!telegramUserId) return { ok: false, removed: false };
    const removed = _removeUser(telegramUserId);
    return { ok: true, removed };
}

/**
 * Disconnect cleanup — drop everyone with this socketId from every
 * queue. Returns the list of telegramUserIds that were removed.
 */
export function scrubBySocket({ socketId }) {
    if (!socketId) return { removed: [] };
    const removed = [];
    for (const arr of _queues.values()) {
        for (let i = arr.length - 1; i >= 0; i -= 1) {
            if (arr[i].socketId === socketId) {
                removed.push(arr[i].telegramUserId);
                arr.splice(i, 1);
            }
        }
    }
    return { removed };
}

// Diagnostics / tests
export function _peek(mode) {
    return [..._getQueue(mode)];
}
export function _clearAll() {
    _queues.clear();
}
