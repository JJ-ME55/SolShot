/**
 * /customgame conversational flow — host configures a group match
 * via 8 sequential prompts, each rendered as inline-keyboard buttons.
 *
 * State is held in-memory keyed by `<chatId>-<userId>`. State entries
 * expire after 10 min of inactivity (garbage-collected by interval).
 *
 * Flow shape:
 *   /customgame → step 1 (type) → ... → step 8 (buyback cap) → review → confirm
 *
 * On confirm: handler creates a `GroupMatch` doc + posts the lobby card.
 *
 * No DB writes happen during configuration — the partial config is
 * purely in memory until the host taps "Confirm". This means an
 * abandoned /customgame leaves no garbage in MongoDB.
 */

const STATE_TTL_MS = 10 * 60 * 1000;            // 10 min
const STATE_GC_INTERVAL_MS = 60 * 1000;         // 1 min

const SOL_PER_LAMPORT = 1_000_000_000;

// ─── State map ──────────────────────────────────────────────────────────

const configStates = new Map();                 // key -> partialConfig
const lastTouched = new Map();                  // key -> timestamp ms

let gcInterval = null;
function ensureGcRunning() {
    if (gcInterval) return;
    gcInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, ts] of lastTouched.entries()) {
            if (now - ts > STATE_TTL_MS) {
                configStates.delete(key);
                lastTouched.delete(key);
            }
        }
    }, STATE_GC_INTERVAL_MS);
    if (gcInterval.unref) gcInterval.unref();   // don't keep the process alive
}

export function stopGc() {
    if (gcInterval) {
        clearInterval(gcInterval);
        gcInterval = null;
    }
}

function stateKey(chatId, userId) {
    return `${chatId}-${userId}`;
}

function touch(key) {
    lastTouched.set(key, Date.now());
}

// ─── Defaults ───────────────────────────────────────────────────────────

const DEFAULTS = Object.freeze({
    type: 'wagered',
    wagerLamports: 0.05 * SOL_PER_LAMPORT,
    maxPlayers: 8,
    minPlayers: 4,
    durationMs: 3 * 24 * 60 * 60 * 1000,        // Weekend
    turnTimerMs: 12 * 60 * 60 * 1000,           // 12h
    idlePenaltyHp: 20,
    buybacksEnabled: true,
    buybackCap: 3,
});

// ─── Step definitions ───────────────────────────────────────────────────

const STEPS = ['type', 'wager', 'maxPlayers', 'duration', 'turnTimer', 'idlePenalty', 'buybacks', 'buybackCap', 'review'];

/** Returns the index of the next step from the current step.
 *  Skips `wager` when type === 'free' and `buybackCap` when buybacks disabled. */
function nextStep(currentStepIndex, partial) {
    let idx = currentStepIndex + 1;
    while (idx < STEPS.length) {
        const step = STEPS[idx];
        if (step === 'wager' && partial.type === 'free') { idx++; continue; }
        if (step === 'buybackCap' && !partial.buybacksEnabled) { idx++; continue; }
        break;
    }
    return idx;
}

// ─── Per-step prompts + keyboards ───────────────────────────────────────

/** Returns { text, keyboard } for the current step of a partial config. */
function promptForStep(step, partial) {
    const summary = renderSummary(partial);

    switch (step) {
        case 'type':
            return {
                text: `${summary}<b>Step 1 of 8 — Match type</b>\n\nFree matches don't require a wallet. Wagered matches lock SOL in escrow on each player's deposit.`,
                keyboard: kb([
                    [btn('💸 Free', 'gc_cfg_type_free'), btn('💰 Wagered', 'gc_cfg_type_wagered')],
                    [btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'wager':
            return {
                text: `${summary}<b>Step 2 of 8 — Wager amount</b>\n\nEach player deposits this. Total pot = wager × player count, distributed top-3 + survival bonus at match end.`,
                keyboard: kb([
                    [btn('0.01 SOL', 'gc_cfg_wager_10000000'), btn('0.05 SOL', 'gc_cfg_wager_50000000')],
                    [btn('0.1 SOL', 'gc_cfg_wager_100000000'), btn('0.25 SOL', 'gc_cfg_wager_250000000')],
                    [btn('0.5 SOL', 'gc_cfg_wager_500000000'), btn('1 SOL', 'gc_cfg_wager_1000000000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'maxPlayers':
            return {
                text: `${summary}<b>Step 3 of 8 — Max players</b>\n\nMatch starts when full, or when host runs /startmatch with at least 4 players.`,
                keyboard: kb([
                    [btn('4', 'gc_cfg_max_4'), btn('6', 'gc_cfg_max_6'), btn('8', 'gc_cfg_max_8'), btn('10', 'gc_cfg_max_10')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'duration':
            return {
                text: `${summary}<b>Step 4 of 8 — Match duration</b>\n\nHard cap. If no winner by then, top finishers ranked by HP.`,
                keyboard: kb([
                    [btn('Sprint (12h)', 'gc_cfg_dur_43200000'), btn('Weekend (3d)', 'gc_cfg_dur_259200000'), btn('Marathon (7d)', 'gc_cfg_dur_604800000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'turnTimer':
            return {
                text: `${summary}<b>Step 5 of 8 — Turn timer</b>\n\nHow long before idle penalty kicks in. Players are pinged in chat when it's their move.`,
                keyboard: kb([
                    [btn('4h', 'gc_cfg_turn_14400000'), btn('12h', 'gc_cfg_turn_43200000'), btn('24h', 'gc_cfg_turn_86400000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'idlePenalty':
            return {
                text: `${summary}<b>Step 6 of 8 — Idle penalty</b>\n\nHP a player loses each missed turn. After 3 consecutive missed turns, they auto-forfeit.`,
                keyboard: kb([
                    [btn('10 HP', 'gc_cfg_idle_10'), btn('20 HP', 'gc_cfg_idle_20'), btn('30 HP', 'gc_cfg_idle_30')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'buybacks':
            return {
                text: `${summary}<b>Step 7 of 8 — Buybacks</b>\n\nLet eliminated players pay an escalating cost (2/3/5/8/13× wager) to re-enter at 50% HP. Forfeits survival-pool eligibility.`,
                keyboard: kb([
                    [btn('✓ Enabled', 'gc_cfg_buybacks_on'), btn('✖ Disabled', 'gc_cfg_buybacks_off')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'buybackCap':
            return {
                text: `${summary}<b>Step 8 of 8 — Buyback cap</b>\n\nMax buybacks per player.`,
                keyboard: kb([
                    [btn('1', 'gc_cfg_bbcap_1'), btn('3', 'gc_cfg_bbcap_3'), btn('Unlimited', 'gc_cfg_bbcap_-1')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'review':
            return {
                text: `${summary}\n<b>Review and confirm</b>\n\nTap <b>Create lobby</b> to post the lobby card and open the match for joins. Lobby auto-expires in 24h if not started.`,
                keyboard: kb([
                    [btn('✅ Create lobby', 'gc_cfg_confirm')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        default:
            return null;
    }
}

// ─── Summary block ──────────────────────────────────────────────────────

/**
 * Renders the running config summary shown above the current step prompt.
 * Only includes fields that have been set so far.
 */
function renderSummary(partial) {
    const lines = [];
    if (partial.type) lines.push(`Type: <b>${partial.type === 'free' ? 'Free' : 'Wagered'}</b>`);
    if (partial.type === 'wagered' && partial.wagerLamports !== undefined) {
        const sol = partial.wagerLamports / SOL_PER_LAMPORT;
        const str = sol.toFixed(4).replace(/\.?0+$/, '');
        lines.push(`Wager: <b>${str || '0'} SOL</b>`);
    }
    if (partial.maxPlayers !== undefined) lines.push(`Max players: <b>${partial.maxPlayers}</b>`);
    if (partial.durationMs !== undefined) {
        const hours = partial.durationMs / (60 * 60 * 1000);
        const label = hours < 24 ? `${hours}h` : `${hours / 24}d`;
        lines.push(`Duration: <b>${label}</b>`);
    }
    if (partial.turnTimerMs !== undefined) {
        const hours = partial.turnTimerMs / (60 * 60 * 1000);
        lines.push(`Turn timer: <b>${hours}h</b>`);
    }
    if (partial.idlePenaltyHp !== undefined) lines.push(`Idle penalty: <b>${partial.idlePenaltyHp} HP</b>`);
    if (partial.buybacksEnabled !== undefined) {
        const buyback = partial.buybacksEnabled ? 'enabled' : 'disabled';
        lines.push(`Buybacks: <b>${buyback}</b>`);
    }
    if (partial.buybacksEnabled && partial.buybackCap !== undefined) {
        const cap = partial.buybackCap === -1 ? 'unlimited' : `max ${partial.buybackCap}`;
        lines.push(`Buyback cap: <b>${cap}</b>`);
    }
    if (lines.length === 0) return '';
    return lines.join(' • ') + '\n\n';
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Begin a new /customgame configuration session.
 * Returns the initial { text, keyboard } prompt for step 1.
 */
export function beginConfig(chatId, userId) {
    ensureGcRunning();
    const key = stateKey(chatId, userId);
    const partial = { _stepIndex: 0 };          // step 0 = 'type'
    configStates.set(key, partial);
    touch(key);
    return promptForStep(STEPS[0], partial);
}

/**
 * Advance the config in response to a callback. Returns:
 *   { kind: 'prompt', text, keyboard }  — show next step
 *   { kind: 'cancel' }                   — user hit cancel
 *   { kind: 'confirm', config }          — user confirmed; here's the final config
 *   { kind: 'expired' }                  — state was cleaned up; ask user to /customgame again
 *   { kind: 'noop' }                     — nothing to do (e.g. unknown action)
 */
export function applyAction(chatId, userId, callbackData) {
    const key = stateKey(chatId, userId);
    const partial = configStates.get(key);
    if (!partial) return { kind: 'expired' };
    touch(key);

    // Cancel
    if (callbackData === 'gc_cfg_cancel') {
        configStates.delete(key);
        lastTouched.delete(key);
        return { kind: 'cancel' };
    }

    // Confirm
    if (callbackData === 'gc_cfg_confirm') {
        if (STEPS[partial._stepIndex] !== 'review') {
            // Out of order — ignore
            return { kind: 'noop' };
        }
        const finalConfig = finalize(partial);
        configStates.delete(key);
        lastTouched.delete(key);
        return { kind: 'confirm', config: finalConfig };
    }

    // Back
    if (callbackData === 'gc_cfg_back') {
        let newIdx = partial._stepIndex - 1;
        // Skip over auto-skipped steps (wager when free, buybackCap when buybacks off)
        while (newIdx > 0) {
            const step = STEPS[newIdx];
            if (step === 'wager' && partial.type === 'free') { newIdx--; continue; }
            if (step === 'buybackCap' && !partial.buybacksEnabled) { newIdx--; continue; }
            break;
        }
        if (newIdx < 0) newIdx = 0;
        partial._stepIndex = newIdx;
        return { kind: 'prompt', ...promptForStep(STEPS[newIdx], partial) };
    }

    // Apply value to current step
    const applied = applyValue(partial, callbackData);
    if (!applied) return { kind: 'noop' };

    const nextIdx = nextStep(partial._stepIndex, partial);
    partial._stepIndex = nextIdx;
    return { kind: 'prompt', ...promptForStep(STEPS[nextIdx], partial) };
}

/** Returns true if a value was applied; false for unknown actions. */
function applyValue(partial, callbackData) {
    // gc_cfg_type_free / gc_cfg_type_wagered
    if (callbackData === 'gc_cfg_type_free') { partial.type = 'free'; partial.wagerLamports = 0; return true; }
    if (callbackData === 'gc_cfg_type_wagered') { partial.type = 'wagered'; return true; }

    // gc_cfg_wager_<lamports>
    let m = callbackData.match(/^gc_cfg_wager_(\d+)$/);
    if (m) { partial.wagerLamports = parseInt(m[1], 10); return true; }

    // gc_cfg_max_<n>
    m = callbackData.match(/^gc_cfg_max_(\d+)$/);
    if (m) { partial.maxPlayers = parseInt(m[1], 10); return true; }

    // gc_cfg_dur_<ms>
    m = callbackData.match(/^gc_cfg_dur_(\d+)$/);
    if (m) { partial.durationMs = parseInt(m[1], 10); return true; }

    // gc_cfg_turn_<ms>
    m = callbackData.match(/^gc_cfg_turn_(\d+)$/);
    if (m) { partial.turnTimerMs = parseInt(m[1], 10); return true; }

    // gc_cfg_idle_<hp>
    m = callbackData.match(/^gc_cfg_idle_(\d+)$/);
    if (m) { partial.idlePenaltyHp = parseInt(m[1], 10); return true; }

    // gc_cfg_buybacks_on / off
    if (callbackData === 'gc_cfg_buybacks_on') { partial.buybacksEnabled = true; return true; }
    if (callbackData === 'gc_cfg_buybacks_off') { partial.buybacksEnabled = false; partial.buybackCap = 0; return true; }

    // gc_cfg_bbcap_<n> (n can be -1 for unlimited, captured as string)
    m = callbackData.match(/^gc_cfg_bbcap_(-?\d+)$/);
    if (m) { partial.buybackCap = parseInt(m[1], 10); return true; }

    return false;
}

/**
 * Convert the partial state into the final config object suitable for
 * GroupMatch.config. Fills in any fields that were skipped (e.g. wagerLamports
 * is 0 for free) with defaults.
 */
function finalize(partial) {
    const config = {
        type: partial.type ?? DEFAULTS.type,
        wagerLamports: partial.wagerLamports ?? 0,
        maxPlayers: partial.maxPlayers ?? DEFAULTS.maxPlayers,
        minPlayers: 4,                          // fixed v1
        durationMs: partial.durationMs ?? DEFAULTS.durationMs,
        turnTimerMs: partial.turnTimerMs ?? DEFAULTS.turnTimerMs,
        idlePenaltyHp: partial.idlePenaltyHp ?? DEFAULTS.idlePenaltyHp,
        buybacksEnabled: partial.buybacksEnabled ?? DEFAULTS.buybacksEnabled,
        buybackCap: partial.buybacksEnabled ? (partial.buybackCap ?? DEFAULTS.buybackCap) : 0,
    };
    return config;
}

// ─── Inline keyboard helpers ────────────────────────────────────────────

function btn(text, callback_data) {
    return { text, callback_data };
}

function kb(rows) {
    return { inline_keyboard: rows };
}

// ─── Test / debug helpers ───────────────────────────────────────────────

/** For tests: how many config sessions are currently in memory. */
export function _stateSize() {
    return configStates.size;
}

/** For tests: directly seed a state. */
export function _setState(chatId, userId, partial) {
    const key = stateKey(chatId, userId);
    configStates.set(key, { _stepIndex: 0, ...partial });
    touch(key);
}
