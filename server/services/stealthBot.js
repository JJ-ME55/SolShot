/**
 * Stealth Bot — Plan B retention fallback for empty lobbies.
 *
 * If someone opens a lobby and no real opponent (or admin) joins within
 * a short window, drop a server AI into the lobby with a plausible TG-style
 * handle so the player can actually play instead of bouncing. The AI shares
 * gameplay logic with /createAIMatch (services/ai.js) — only the name and
 * trigger pathway differ.
 *
 * Scope rules (deliberate):
 *   - **Free matches only.** If the lobby has a wager > 0, do NOT fill with
 *     a stealth bot. The AI can't actually lose SOL on-chain, so faking an
 *     opponent for a real money match is fraud-adjacent. Wagered matches
 *     fall back to the admin ping (services/adminNotifications.js) only.
 *   - **SolShot artillery only.** Arcade games (basketball, keepie-uppies,
 *     free-kicks) are solo-leaderboard and don't have lobbies.
 *
 * This module owns the timer state + name pool. The actual room-mutation
 * logic lives in main.js (where it has natural access to room/match/gold
 * state maps), invoked via the spawn function passed to schedule().
 */

// Pool of plausible TG-style handles. Mix of first-name + number,
// shortened nicks, and game-y handles so the same name doesn't keep
// appearing. NOT meant to deceive — if a player suspects and looks them
// up, that's fine; the goal is just "feels like a person on the other
// end" so they play through instead of bouncing.
const NAME_POOL = [
  'mike_88', 'alex_99', 'kaitlyn_7', 'ryan_v', 'leo_22', 'max_p',
  'j_pivot', 'ben_07', 'tom_b', 'kyle_42', 'jake_q', 'sam_w',
  'tankk', 'blitz_07', 'arti_v6', 'neon_42', 'crackshot', 'fuse_9',
  'recoil', 'slugger', 'mortarboy', 'pivot7', 'gravity_22', 'roundhouse',
  'm_blackwell', 'r_kowalski', 'd_park', 't_morris', 'c_walsh', 'n_huxley',
];

/**
 * Pick a plausible handle. Random per spawn; we don't persist mapping
 * across sessions because that'd just be a public list of "AI" accounts.
 */
export function pickStealthName() {
  const idx = Math.floor(Math.random() * NAME_POOL.length);
  return NAME_POOL[idx];
}

/**
 * Pick a starting AI skill (errorFactor seed) for a stealth bot.
 *
 * Range [0.5, 1.2] uniform — covers a believable spread:
 *   0.5–0.7 = shark. Lands shot 1 or 2; feels veteran.
 *   0.7–1.0 = normal. The default Shot Bot zone.
 *   1.0–1.2 = noob. Wild early shots, takes 4+ tries to dial in.
 *
 * Uniform random rather than tiered-by-name because real-world player
 * skill doesn't correlate with handle. A `crackshot` who whiffs and a
 * `kaitlyn_7` who lands shot one both happen on real ladders — that's
 * what keeps it feeling like a person, not a difficulty selector.
 *
 * Floor (0.15) and recalibration ceiling (1.0 during in-match bumps)
 * are enforced by ai.js — we only seed the starting point.
 */
export function pickStealthSkill() {
  const min = 0.5;
  const max = 1.2;
  return +(min + Math.random() * (max - min)).toFixed(2);
}

/**
 * Human-readable label for the skill level — for logging only, never
 * surfaced to the player or in admin pings.
 */
export function describeSkill(errorFactor) {
  if (errorFactor < 0.7) return 'sharp';
  if (errorFactor < 1.0) return 'normal';
  return 'wild';
}

/**
 * Generate a synthetic socket-id-shaped string for the AI player slot.
 * Mirrors the pattern used by /createAIMatch (`ai-bot-<roomId>`) so any
 * downstream `socketId.startsWith('ai-bot-')` checks still fire.
 */
export function makeStealthSocketId(roomId) {
  return `ai-bot-${roomId}`;
}

// Timer map. Keys take two shapes:
//   `room:<roomId>`        — for createRoom-path lobbies
//   `queue:<socketId>`     — for joinQueue waiters with no room yet
const stealthTimers = new Map();

// Default fill window. Long enough for a real opponent or admin to join
// first (admin ping fires at lobby-open time, gives them ~90s to react),
// short enough that the creator doesn't give up and bounce.
export const STEALTH_FILL_DELAY_MS = 90 * 1000;

/**
 * Schedule a stealth bot to fill this lobby after delay.
 *
 * @param {string} key       — `room:<id>` or `queue:<socketId>`
 * @param {Function} spawnFn — async () => void; runs in setTimeout to spawn the bot
 * @param {number} [delayMs] — defaults to STEALTH_FILL_DELAY_MS
 */
export function scheduleStealthBot(key, spawnFn, delayMs = STEALTH_FILL_DELAY_MS) {
  if (!key || typeof spawnFn !== 'function') return;
  // Cancel any existing timer for this key first
  cancelStealthBot(key);
  const handle = setTimeout(async () => {
    stealthTimers.delete(key);
    try {
      await spawnFn();
    } catch (err) {
      console.warn(`[stealthBot] spawn for ${key} failed:`, err.message);
    }
  }, delayMs);
  stealthTimers.set(key, handle);
}

/**
 * Cancel a pending stealth-bot timer. No-op if none scheduled.
 * Called when a real opponent joins, the creator leaves, or the queue
 * waiter is FIFO-matched against another real player.
 */
export function cancelStealthBot(key) {
  const handle = stealthTimers.get(key);
  if (handle) {
    clearTimeout(handle);
    stealthTimers.delete(key);
  }
}

/**
 * Bulk cancel any stealth timers tied to a given socketId. Used on
 * disconnect / leaveQueue. Walks both key shapes.
 */
export function cancelStealthBotsForSocket(socketId) {
  if (!socketId) return;
  cancelStealthBot(`queue:${socketId}`);
  // No-op for room: keys here because rooms are addressed by roomId
  // and creator socket may differ. Cancellation by room is handled at
  // the removeRoom call site.
}

/**
 * Test/debug helper — wipe all timers. Don't call in prod paths.
 */
export function _clearAllStealthTimers() {
  for (const handle of stealthTimers.values()) clearTimeout(handle);
  stealthTimers.clear();
}
