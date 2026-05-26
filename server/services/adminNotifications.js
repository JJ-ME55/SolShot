/**
 * Admin Notifications — Telegram DM pings for high-signal events.
 *
 * Goal: any time a SolShot lobby is open (someone created a room and is
 * waiting, OR someone joined the matchmaking queue and is searching), ping
 * JJ and Fish on Telegram so they can jump in. Stops creators from sitting
 * alone and bouncing — retention boost.
 *
 * Scoped specifically to **solshot.gg** (the artillery flagship). Not arcade
 * standalone games (basketball, keepie-uppies, free-kicks) — those don't
 * have a multiplayer lobby that needs filling.
 *
 * Fires for ALL matches — practice, quick match, duel, high roller, custom
 * challenge, wagered or free. Per JJ's spec: "literally anytime the lobby
 * is open, ping me."
 *
 * Architecture:
 *   - Reuses the existing SolShot bot's Telegraf instance via getBot() from
 *     ./bot.js. No new bot, no new token, no new webhook.
 *   - Recipients come from ADMIN_TELEGRAM_IDS env var (comma-separated TG
 *     numeric user IDs). Same env var that gates /teststats.
 *   - In-memory throttle keyed on `throttleKey` (defaults to matchId, else
 *     a queue-event key) prevents duplicate pings. Throttle entries
 *     auto-evict after 30 min.
 *   - Fail-soft: if the bot isn't initialised, ADMIN_TELEGRAM_IDS isn't set,
 *     or the Telegram send errors out, we log to console and continue. The
 *     match flow MUST NOT be blocked by a notification failure.
 *
 * Env vars:
 *   ADMIN_TELEGRAM_IDS   — comma-separated TG numeric IDs (e.g. "12345,67890")
 *                          Get yours by DMing @userinfobot on Telegram.
 *   MINI_APP_URL         — optional. Defaults to https://www.solshot.gg/
 */

import { getBot } from './bot.js';

const LAUNCH_URL = process.env.MINI_APP_URL || 'https://www.solshot.gg/';

// throttleKey -> last-ping timestamp. Auto-pruned after 30min to bound memory.
const recentPings = new Map();
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

function getAdminIds() {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0);
}

function prune() {
  if (recentPings.size < 50) return;
  const cutoff = Date.now() - THROTTLE_MS;
  for (const [key, ts] of recentPings) {
    if (ts < cutoff) recentPings.delete(key);
  }
}

// Pretty-print "high_roller" -> "High Roller", "quick_match" -> "Quick Match"
function prettyMode(mode) {
  if (!mode) return null;
  return String(mode).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Ping admins about a newly-opened lobby.
 *
 * Two shapes:
 *   - Room created (Custom Challenge): pass `matchId`, get a deep-link
 *     `?startapp=join_<matchId>` so admins land in that exact room.
 *   - Queue waiting (Quick Match / Duel / High Roller / Practice via queue):
 *     omit `matchId`, get a generic `?startapp=play` link. Admin lands in
 *     the lobby and picks the same mode/wager to match (FIFO queue pairs them).
 *
 * @param {Object} args
 * @param {string} args.playerName  — display name of the player who opened the lobby
 * @param {string} [args.matchId]   — room ID if available; produces a deep-link if set
 * @param {number} [args.wagerSOL]  — wager amount in SOL (0 = free/practice)
 * @param {string} [args.format]    — "BO1" / "BO3" / "BO5"
 * @param {number} [args.maxPlayers]— 2, 3, or 4
 * @param {string} [args.matchMode] — "quick_match" / "duel" / "high_roller" / "custom_challenge" / "practice"
 * @param {string} [args.throttleKey] — explicit throttle key. Defaults to matchId, else a synthetic queue key from caller.
 * @returns {Promise<void>}         — never throws; always resolves
 */
export async function notifyMatchLobbyOpen(args) {
  try {
    const {
      playerName = 'Someone',
      matchId = null,
      wagerSOL = 0,
      format = null,
      maxPlayers = null,
      matchMode = null,
      throttleKey = null,
    } = args || {};

    // Throttle. Default key = matchId (rooms) or fall back to provided
    // throttleKey (queue events). If neither, skip throttling.
    const key = throttleKey || matchId;
    if (key) {
      if (recentPings.has(key)) return;
      recentPings.set(key, Date.now());
      prune();
    }

    const adminIds = getAdminIds();
    if (adminIds.length === 0) {
      console.log(`[adminNotify] ${playerName} opened lobby (mode=${matchMode || 'unknown'}, wager=${wagerSOL} SOL) — ADMIN_TELEGRAM_IDS not set, skipping ping`);
      return;
    }

    const bot = getBot();
    if (!bot || !bot.telegram) {
      console.warn('[adminNotify] bot not initialised — skipping ping');
      return;
    }

    // Build the CTA + deep link
    const joinUrl = matchId
      ? `${LAUNCH_URL.replace(/\/$/, '')}/?startapp=join_${encodeURIComponent(matchId)}`
      : `${LAUNCH_URL.replace(/\/$/, '')}/?startapp=play`;

    const headline = matchId
      ? `🎯 ${playerName} has created a game, join them now`
      : `🎯 ${playerName} is searching for a match, join them now`;

    // Detail line: wager + format + size + mode, omitting any nullish bits
    const detailBits = [];
    const mode = prettyMode(matchMode);
    if (mode) detailBits.push(mode);
    if (Number.isFinite(wagerSOL) && wagerSOL > 0) {
      detailBits.push(`${wagerSOL} SOL`);
    } else {
      detailBits.push('Free');
    }
    if (format) detailBits.push(format);
    if (Number.isFinite(maxPlayers) && maxPlayers > 0) detailBits.push(`${maxPlayers}P`);
    const detailLine = detailBits.length > 0 ? `\n${detailBits.join(' · ')}` : '';

    const message = `${headline}${detailLine}\n${joinUrl}`;

    await Promise.all(adminIds.map(async (id) => {
      try {
        await bot.telegram.sendMessage(id, message, { disable_web_page_preview: false });
      } catch (err) {
        console.warn(`[adminNotify] sendMessage to ${id} failed:`, err.message);
      }
    }));

    console.log(`[adminNotify] pinged ${adminIds.length} admin(s) — ${playerName} (${matchMode || 'unknown'}, ${wagerSOL} SOL, key=${key || 'none'})`);
  } catch (err) {
    console.warn('[adminNotify] notifyMatchLobbyOpen unexpected error:', err.message);
  }
}

/**
 * Backwards-compat shim — earlier wiring imported this name. Kept as a
 * thin alias so any straggler caller still works. New code should call
 * notifyMatchLobbyOpen directly.
 */
export const notifyWageredMatchCreated = notifyMatchLobbyOpen;

/**
 * Test helper — wipe the throttle map.
 */
export function _resetThrottleForTests() {
  recentPings.clear();
}
