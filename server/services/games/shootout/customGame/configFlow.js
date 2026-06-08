/**
 * Shootout /customgame in-chat wizard state (Phase 4, 2026-06-08).
 *
 * In-memory state for the multi-step inline-keyboard wizard the
 * /customgame handler runs in group chats. v1 has 2 steps:
 *
 *   mode    — 1v1 / 2v2
 *   wager   — Friendly (creates lobby) / Wagered (alert: coming soon)
 *
 * No Mongo write happens during the wizard — the ShootoutLobby doc
 * isn't created until the user taps 'Create lobby' on the review
 * step. Wizards live for 10 minutes after last touch + then garbage
 * collect themselves; a user who walks away never leaves orphan rows.
 *
 * Storage:
 *   Map keyed by `<chatId>-<userId>` so the same Telegram user can
 *   simultaneously configure a /customgame in two different group
 *   chats without state collision. (SolShot precedent.)
 *
 * Public API:
 *   beginConfig(chatId, userId, messageId?)
 *     -> { state }
 *   getConfig(chatId, userId)  -> state | null
 *   updateConfig(chatId, userId, patch) -> state | null
 *   endConfig(chatId, userId)  -> void (caller does this once the
 *     lobby has been created and the message is now showing the
 *     lobby card instead of a wizard prompt).
 *   _clearAll() — tests only.
 */

const TTL_MS = 10 * 60 * 1000;       // 10 minutes
const GC_INTERVAL_MS = 60 * 1000;    // 1 minute

const _wizards = new Map();
let _gcStarted = false;

function _key(chatId, userId) { return `${chatId}-${userId}`; }

function _startGc() {
    if (_gcStarted) return;
    _gcStarted = true;
    const handle = setInterval(() => {
        const cutoff = Date.now() - TTL_MS;
        for (const [k, w] of _wizards.entries()) {
            if (w.lastTouchedAt < cutoff) _wizards.delete(k);
        }
    }, GC_INTERVAL_MS);
    // node:test mock timers want the handle to be unref'd so tests don't hang.
    if (handle?.unref) handle.unref();
}

export function beginConfig(chatId, userId, messageId = null) {
    _startGc();
    const state = {
        chatId, userId, messageId,
        step: 'mode',
        mode: null,
        gameType: null, // 'friendly' | 'wager'  (wager triggers alert)
        lastTouchedAt: Date.now(),
    };
    _wizards.set(_key(chatId, userId), state);
    return { state };
}

export function getConfig(chatId, userId) {
    const w = _wizards.get(_key(chatId, userId));
    if (!w) return null;
    if (w.lastTouchedAt < Date.now() - TTL_MS) {
        _wizards.delete(_key(chatId, userId));
        return null;
    }
    return w;
}

export function updateConfig(chatId, userId, patch) {
    const w = getConfig(chatId, userId);
    if (!w) return null;
    Object.assign(w, patch);
    w.lastTouchedAt = Date.now();
    return w;
}

export function endConfig(chatId, userId) {
    _wizards.delete(_key(chatId, userId));
}

/**
 * Compute the next step given the current state. v1 sequence:
 *   mode → wager → review → (create)
 *
 * Exposed so the index handler can build prompts based on current
 * progress without re-implementing the step machine.
 */
export function nextStep(state) {
    if (!state.mode)     return 'mode';
    if (!state.gameType) return 'wager';
    return 'review';
}

// Test-only
export function _clearAll() { _wizards.clear(); }
export function _peek() { return [..._wizards.values()]; }
