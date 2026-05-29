/**
 * Pool Matchmaking Service
 *
 * Skill-based opponent search for 1v1 pool matches.
 * Honors the locked design contracts:
 *   - Matchmaking by ELO, NEVER by coin balance (Miniclip antipattern)
 *   - Rate-based — no smurfing exploit because new accounts are
 *     provisional and gated from high-stake play
 *   - Server-authoritative — server owns the queue, picks the pair,
 *     creates the PoolMatch
 *
 * Algorithm:
 *   1. Player joins queue → stored with rating + initial spread (±100, or
 *      ±200 if provisional)
 *   2. Background loop scans every SCAN_INTERVAL_MS for compatible pairs:
 *        - Both ratings within combined search window
 *        - Both in same mode (quick, or same wagered tier)
 *        - Neither already matched (still in queue at scan time)
 *   3. Search window widens every WINDOW_EXPAND_INTERVAL_MS by +50 per side
 *   4. Player times out at MAX_SEARCH_MS — caller is notified
 *
 * V1: in-memory queue. Single Node process. Acceptable for early traffic.
 * V2 (scale): port to Redis ZSET keyed by rating; multi-instance worker pool.
 *
 * Integration points (caller wires these):
 *   - onMatchFound(playerA, playerB, mode, stake) — caller creates PoolMatch
 *     + notifies sockets + escrows stakes if wagered.
 *   - onSearchTimeout(playerId, reason) — caller surfaces empty-state UI
 *
 * Concurrency safety: a player can only be queued once at a time. Joining
 * while already queued returns the existing ticket.
 */

import { provisionalSearchBoost } from './poolElo.js';

// ---------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------

const INITIAL_WINDOW_HALF = 100;        // ±100 around the searcher's rating
const WINDOW_EXPAND_BY = 50;            // grow ±50 per interval
const WINDOW_EXPAND_INTERVAL_MS = 10000;
const MAX_WINDOW_HALF = 400;            // ±400 cap
const MAX_SEARCH_MS = 60000;            // 60s then timeout
const SCAN_INTERVAL_MS = 2000;          // background sweep cadence

// Tighter band for wagered matches (skill matters more when SOL on the line)
const WAGERED_INITIAL_WINDOW_HALF = 50;
const WAGERED_MAX_WINDOW_HALF = 250;

// ---------------------------------------------------------------------
// Queue state (in-memory; per-process)
// ---------------------------------------------------------------------

/**
 * @typedef {object} QueueEntry
 * @property {string} ticketId
 * @property {string} playerKey            stable identity key
 * @property {object} identity             { telegramUserId?, walletAddress?, callsign? }
 * @property {number} rating
 * @property {boolean} provisional
 * @property {'quick'|'wagered'} mode
 * @property {{ amount: number, currency: 'SOL' }|null} stake
 * @property {string} format               'BO1'|'BO3'|'BO5'
 * @property {number} joinedAt             epoch ms
 * @property {number} timeoutAt            epoch ms
 * @property {number} currentHalf          current window half-width
 * @property {number} lastExpandedAt       epoch ms
 */

/** @type {Map<string, QueueEntry>} */
const queue = new Map();

let scanTimer = null;
let nextTicketId = 1;

// Event hooks — wired by the host process
let onMatchFound = null;   // (entryA, entryB) => void
let onSearchTimeout = null; // (entry, reason) => void

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Configure the matchmaking event hooks. Call once at server boot.
 * @param {object} hooks
 * @param {(a: QueueEntry, b: QueueEntry) => void} hooks.onMatchFound
 * @param {(e: QueueEntry, reason: string) => void} hooks.onSearchTimeout
 */
export function configureMatchmaking(hooks) {
    onMatchFound = hooks.onMatchFound || null;
    onSearchTimeout = hooks.onSearchTimeout || null;
    if (!scanTimer) {
        scanTimer = setInterval(runScan, SCAN_INTERVAL_MS);
        if (scanTimer.unref) scanTimer.unref(); // don't keep Node alive on idle
    }
}

/**
 * Stop the matchmaking loop. Used by tests + graceful shutdown.
 */
export function stopMatchmaking() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    queue.clear();
}

/**
 * Enqueue a player for matchmaking.
 * Idempotent: same player joining twice returns the existing ticket.
 *
 * @param {object} params
 * @param {object} params.identity         { telegramUserId?, walletAddress?, callsign? }
 * @param {number} params.rating
 * @param {boolean} [params.provisional=false]
 * @param {'quick'|'wagered'} params.mode
 * @param {{ amount: number, currency: 'SOL' }|null} [params.stake=null]
 * @param {'BO1'|'BO3'|'BO5'} [params.format='BO1']
 * @returns {QueueEntry}
 */
export function enqueue({ identity, rating, provisional = false, mode, stake = null, format = 'BO1' }) {
    const playerKey = identityKey(identity);
    if (!playerKey) throw new Error('enqueue: identity must include telegramUserId or walletAddress');

    const existing = queue.get(playerKey);
    if (existing) return existing;

    const isWagered = mode === 'wagered';
    const initialHalf = (isWagered ? WAGERED_INITIAL_WINDOW_HALF : INITIAL_WINDOW_HALF)
                      + (provisional ? provisionalSearchBoost({ provisional: true }) : 0);

    const now = Date.now();
    const entry = {
        ticketId: `tkt_${nextTicketId++}`,
        playerKey,
        identity: { ...identity },
        rating,
        provisional,
        mode,
        stake: isWagered && stake ? { ...stake } : null,
        format,
        joinedAt: now,
        timeoutAt: now + MAX_SEARCH_MS,
        currentHalf: initialHalf,
        lastExpandedAt: now
    };

    queue.set(playerKey, entry);
    return entry;
}

/**
 * Remove a player from the queue (cancelled search, disconnect, etc).
 * @param {object|string} identityOrKey
 * @returns {boolean} true if removed
 */
export function dequeue(identityOrKey) {
    const key = typeof identityOrKey === 'string' ? identityOrKey : identityKey(identityOrKey);
    return queue.delete(key);
}

/**
 * Get the current queue entry for a player (for UI status polling).
 * @param {object} identity
 * @returns {QueueEntry|null}
 */
export function getStatus(identity) {
    return queue.get(identityKey(identity)) || null;
}

/**
 * Snapshot for telemetry / monitoring.
 * @returns {{ size: number, byMode: Record<string, number>, oldestWaitMs: number }}
 */
export function queueStats() {
    const byMode = {};
    let oldest = 0;
    const now = Date.now();
    for (const entry of queue.values()) {
        byMode[entry.mode] = (byMode[entry.mode] || 0) + 1;
        const wait = now - entry.joinedAt;
        if (wait > oldest) oldest = wait;
    }
    return { size: queue.size, byMode, oldestWaitMs: oldest };
}

// ---------------------------------------------------------------------
// Internal: scan loop
// ---------------------------------------------------------------------

function runScan() {
    const now = Date.now();
    const entries = Array.from(queue.values());

    // Step 1: time out expired searches
    for (const entry of entries) {
        if (now >= entry.timeoutAt) {
            queue.delete(entry.playerKey);
            if (onSearchTimeout) {
                try { onSearchTimeout(entry, 'no_opponent_in_range'); }
                catch (e) { /* swallow — don't break the loop */ }
            }
        }
    }

    // Step 2: expand windows for surviving entries
    for (const entry of queue.values()) {
        if (now - entry.lastExpandedAt >= WINDOW_EXPAND_INTERVAL_MS) {
            const cap = entry.mode === 'wagered' ? WAGERED_MAX_WINDOW_HALF : MAX_WINDOW_HALF;
            entry.currentHalf = Math.min(cap, entry.currentHalf + WINDOW_EXPAND_BY);
            entry.lastExpandedAt = now;
        }
    }

    // Step 3: pair compatible entries
    // Naive O(n^2); fine for n in the dozens. Replace with sorted-band sweep when scale demands.
    const remaining = Array.from(queue.values());
    for (let i = 0; i < remaining.length; i++) {
        const a = remaining[i];
        if (!queue.has(a.playerKey)) continue; // already paired this tick
        for (let j = i + 1; j < remaining.length; j++) {
            const b = remaining[j];
            if (!queue.has(b.playerKey)) continue;
            if (!compatible(a, b)) continue;

            // Pair them — remove from queue and notify
            queue.delete(a.playerKey);
            queue.delete(b.playerKey);
            if (onMatchFound) {
                try { onMatchFound(a, b); }
                catch (e) { /* swallow */ }
            }
            break; // a is paired, move on
        }
    }
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

function compatible(a, b) {
    // Same mode
    if (a.mode !== b.mode) return false;

    // Same stake (wagered must match amount + currency)
    if (a.mode === 'wagered') {
        if (!a.stake || !b.stake) return false;
        if (a.stake.amount !== b.stake.amount) return false;
        if (a.stake.currency !== b.stake.currency) return false;
    }

    // Same format
    if (a.format !== b.format) return false;

    // Rating windows overlap
    const aLow = a.rating - a.currentHalf;
    const aHigh = a.rating + a.currentHalf;
    const bLow = b.rating - b.currentHalf;
    const bHigh = b.rating + b.currentHalf;
    if (aHigh < bLow || bHigh < aLow) return false;

    // Anti-self-match
    if (a.playerKey === b.playerKey) return false;

    return true;
}

function identityKey(identity) {
    if (!identity) return null;
    if (identity.telegramUserId) return `tg:${identity.telegramUserId}`;
    if (identity.walletAddress) return `w:${identity.walletAddress}`;
    return null;
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_MATCHMAKING_CONSTANTS = Object.freeze({
    INITIAL_WINDOW_HALF,
    WINDOW_EXPAND_BY,
    WINDOW_EXPAND_INTERVAL_MS,
    MAX_WINDOW_HALF,
    MAX_SEARCH_MS,
    SCAN_INTERVAL_MS,
    WAGERED_INITIAL_WINDOW_HALF,
    WAGERED_MAX_WINDOW_HALF
});

export default {
    configureMatchmaking,
    stopMatchmaking,
    enqueue,
    dequeue,
    getStatus,
    queueStats,
    POOL_MATCHMAKING_CONSTANTS
};
