/**
 * Lobby auto-expiry watchdog.
 *
 * Runs at a fixed interval after server boot, scans MongoDB for any
 * GroupMatch in `state: 'lobby'` whose `lobbyExpiresAt` is in the past,
 * and auto-cancels them. Posts a quiet notice to the chat so players
 * understand why the lobby card stopped working.
 *
 * Why this exists: hosts run /customgame, the lobby card sits in the
 * chat for 24h waiting for players. If they never start the match, the
 * card lingers indefinitely with confusing button state. The watchdog
 * sweeps stale lobbies so the chat reflects reality.
 *
 * The watchdog is fail-soft: any DB or Telegram error during a sweep
 * is logged and skipped — the timer keeps ticking. Singleton guard
 * prevents accidental double-start.
 *
 * Cancellation flow per stale lobby:
 *   1. Set state='cancelled', cancelReason='lobby_expired'
 *   2. Save
 *   3. Post short notice to the chat (best-effort)
 *
 * Edits to the original lobby card message are NOT done here — the
 * card just stays as it was, with the now-stale roster. Chat notice
 * is the canonical signal that the lobby is dead.
 *
 * Tunables:
 *   SWEEP_INTERVAL_MS — how often to scan. Default 15 minutes. Lobbies
 *     have a 24h TTL so 15-min granularity means the lobby card is at
 *     most ~15 min stale before being cancelled.
 */

import GroupMatch from '../../models/GroupMatch.js';
import { getBot } from '../bot.js';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let watchdogTimer = null;

async function postToChat(chatId, text) {
    const bot = getBot();
    if (!bot) return;
    try {
        await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (err) {
        console.warn('[group-chat:watchdog] sendMessage failed:', err.message);
    }
}

/**
 * One sweep pass — find + cancel any lobby past its expiry.
 * Exported for tests / manual triggering.
 */
export async function sweepStaleLobbies() {
    const now = new Date();
    let cancelled = 0;
    try {
        const stale = await GroupMatch.find({
            state: 'lobby',
            lobbyExpiresAt: { $lte: now },
        });

        for (const match of stale) {
            try {
                match.state = 'cancelled';
                match.cancelledAt = now;
                match.cancelReason = 'lobby_expired';
                await match.save();
                cancelled++;

                const playerCount = match.players?.length || 0;
                const minPlayers = match.config?.minPlayers || 4;
                const reason = playerCount < minPlayers
                    ? `lobby expired with only ${playerCount}/${minPlayers} players`
                    : 'lobby expired without /startmatch';
                await postToChat(
                    match.chatId,
                    `⏱ <b>Match #${match.matchId}</b> — ${reason}. Lobby closed.`
                );
            } catch (err) {
                console.warn(`[group-chat:watchdog] cancel ${match.matchId} failed:`, err.message);
            }
        }
        if (cancelled > 0) {
            console.log(`[group-chat:watchdog] cancelled ${cancelled} stale lobbies`);
        }
    } catch (err) {
        console.warn('[group-chat:watchdog] sweep failed:', err.message);
    }
    return cancelled;
}

/**
 * Start the watchdog. Idempotent — second call is a no-op.
 * Calls once immediately on start, then every SWEEP_INTERVAL_MS.
 */
export function startLobbyWatchdog() {
    if (watchdogTimer) return;
    // Initial sweep — catch lobbies that expired while server was down
    sweepStaleLobbies().catch((err) => console.warn('[group-chat:watchdog] initial sweep failed:', err.message));
    watchdogTimer = setInterval(() => {
        sweepStaleLobbies().catch((err) => console.warn('[group-chat:watchdog] interval sweep failed:', err.message));
    }, SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive solely for the watchdog
    if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
    console.log(`[group-chat:watchdog] started — sweeps every ${SWEEP_INTERVAL_MS / 60000} min`);
}

/**
 * Stop the watchdog. Used in tests + clean shutdown.
 */
export function stopLobbyWatchdog() {
    if (!watchdogTimer) return;
    clearInterval(watchdogTimer);
    watchdogTimer = null;
}
