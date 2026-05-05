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
    quietHoursEnabled: true,
    quietHoursStart: 23,                         // 11pm UTC
    quietHoursEnd: 7,                            // 7am UTC
});

// ─── Step definitions ───────────────────────────────────────────────────

const STEPS = ['type', 'wager', 'maxPlayers', 'duration', 'turnTimer', 'quietHours', 'idlePenalty', 'buybacks', 'buybackCap', 'review'];

/** Returns true if the given step should be skipped for the partial config. */
function shouldSkip(step, partial) {
    // Free matches: no wager, no buybacks (escalating cost on 0 makes no sense)
    if (step === 'wager' && partial.type === 'free') return true;
    if (step === 'buybacks' && partial.type === 'free') return true;
    if (step === 'buybackCap' && partial.type === 'free') return true;
    // Wagered v2: buyback requires on-chain top-up the escrow doesn't support
    // until v2.1. Hide both buyback steps and force buybacksEnabled=false in
    // finalize(). Re-enable when v2.1 ships buyback CPI.
    if (step === 'buybacks' && partial.type === 'wagered') return true;
    if (step === 'buybackCap' && partial.type === 'wagered') return true;
    // Wagered with buybacks off: no cap step (vestigial; covered above for now)
    if (step === 'buybackCap' && !partial.buybacksEnabled) return true;
    return false;
}

/** Returns the index of the next step from the current step. */
function nextStep(currentStepIndex, partial) {
    let idx = currentStepIndex + 1;
    while (idx < STEPS.length && shouldSkip(STEPS[idx], partial)) {
        idx++;
    }
    return idx;
}

/** {current, total} for the "Step X of Y" header.
 *  Total counts non-review, non-skipped steps; current is 1-indexed. */
function stepInfo(step, partial) {
    const visible = STEPS.filter(s => s !== 'review' && !shouldSkip(s, partial));
    const idx = visible.indexOf(step);
    return { current: idx + 1, total: visible.length };
}

// ─── Per-step prompts + keyboards ───────────────────────────────────────

/** Returns { text, keyboard } for the current step of a partial config. */
function promptForStep(step, partial) {
    const summary = renderSummary(partial);
    const { current, total } = stepInfo(step, partial);
    const stepHeader = (label) => `<b>Step ${current} of ${total} — ${label}</b>`;

    switch (step) {
        case 'type':
            return {
                text: `${summary}${stepHeader('Match type')}\n\n<b>FREE</b> matches are gold-only — no SOL changes hands.\n<b>WAGERED</b> matches deposit SOL into on-chain escrow (v2) and pay 90% of pot to the winner, 7% treasury, 3% ops. Buybacks not yet supported in wagered v2 — coming in v2.1.`,
                keyboard: kb([
                    [btn('🎮 FREE (no SOL)', 'gc_cfg_type_free'), btn('💰 WAGERED (SOL)', 'gc_cfg_type_wagered')],
                    [btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'wager':
            return {
                text: `${summary}${stepHeader('Wager amount')}\n\nEach player deposits this. Total pot = wager × player count, distributed top-3 + survival bonus at match end.`,
                keyboard: kb([
                    [btn('0.01 SOL', 'gc_cfg_wager_10000000'), btn('0.05 SOL', 'gc_cfg_wager_50000000')],
                    [btn('0.1 SOL', 'gc_cfg_wager_100000000'), btn('0.25 SOL', 'gc_cfg_wager_250000000')],
                    [btn('0.5 SOL', 'gc_cfg_wager_500000000'), btn('1 SOL', 'gc_cfg_wager_1000000000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'maxPlayers':
            return {
                text: `${summary}${stepHeader('Max players')}\n\nMatch starts when full, or when host runs /startmatch with the minimum joined.\n\n<i>2-player matches are async duels (great for testing or 1v1 with a friend across multiple days).</i>`,
                keyboard: kb([
                    [btn('2 (duel)', 'gc_cfg_max_2'), btn('3', 'gc_cfg_max_3'), btn('4', 'gc_cfg_max_4')],
                    [btn('6', 'gc_cfg_max_6'), btn('8', 'gc_cfg_max_8'), btn('10', 'gc_cfg_max_10')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'duration':
            return {
                text: `${summary}${stepHeader('Match duration')}\n\nHard cap. If no winner by then, top finishers ranked by HP.`,
                keyboard: kb([
                    [btn('Sprint (12h)', 'gc_cfg_dur_43200000'), btn('Weekend (3d)', 'gc_cfg_dur_259200000'), btn('Marathon (7d)', 'gc_cfg_dur_604800000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'turnTimer':
            return {
                text: `${summary}${stepHeader('Turn timer')}\n\nHow long (waking time) before idle penalty kicks in. Players are pinged in chat when it's their move.`,
                keyboard: kb([
                    [btn('4h', 'gc_cfg_turn_14400000'), btn('12h', 'gc_cfg_turn_43200000'), btn('24h', 'gc_cfg_turn_86400000')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'quietHours':
            return {
                text: `${summary}${stepHeader('Quiet hours')}\n\nPause the turn timer overnight so async matches don't punish sleepers. Reference timezone is UTC. Civilised window (11pm–7am) is default — works well for UK / European groups; US groups may prefer the lighter window or 24/7.`,
                keyboard: kb([
                    [btn('🌙 Civilised (11pm–7am UTC)', 'gc_cfg_quiet_civilised')],
                    [btn('🌙 Light (1am–6am UTC)', 'gc_cfg_quiet_light')],
                    [btn('⚡ No pause (24/7)', 'gc_cfg_quiet_off')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'idlePenalty':
            return {
                text: `${summary}${stepHeader('Idle penalty')}\n\nHP a player loses each missed turn. After 3 consecutive missed turns, they auto-forfeit.`,
                keyboard: kb([
                    [btn('10 HP', 'gc_cfg_idle_10'), btn('20 HP', 'gc_cfg_idle_20'), btn('30 HP', 'gc_cfg_idle_30')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'buybacks':
            return {
                text: `${summary}${stepHeader('Buybacks')}\n\nLet eliminated players pay an escalating cost (2/3/5/8/13× wager) to re-enter at 50% HP. Forfeits survival-pool eligibility.`,
                keyboard: kb([
                    [btn('✓ Enabled', 'gc_cfg_buybacks_on'), btn('✖ Disabled', 'gc_cfg_buybacks_off')],
                    [btn('« Back', 'gc_cfg_back'), btn('✖ Cancel', 'gc_cfg_cancel')],
                ]),
            };
        case 'buybackCap':
            return {
                text: `${summary}${stepHeader('Buyback cap')}\n\nMax buybacks per player.`,
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
    // Make 'FREE' visually loud in the summary so a host can't miss that
    // they're configuring a free match when they meant wagered (the type-pick
    // buttons used to be `💸 Free` vs `💰 Wagered` which were easy to confuse;
    // Markdown emphasis here doubles up as a confirmation safeguard).
    if (partial.type) lines.push(`Type: <b>${partial.type === 'free' ? '🎮 FREE (no SOL)' : '💰 WAGERED (SOL)'}</b>`);
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
    if (partial.quietHoursEnabled !== undefined) {
        const label = !partial.quietHoursEnabled ? '24/7'
            : `${formatHourLabel(partial.quietHoursStart)}–${formatHourLabel(partial.quietHoursEnd)} UTC`;
        lines.push(`Quiet hours: <b>${label}</b>`);
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
        while (newIdx > 0 && shouldSkip(STEPS[newIdx], partial)) {
            newIdx--;
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

    // gc_cfg_quiet_<preset>
    if (callbackData === 'gc_cfg_quiet_civilised') {
        partial.quietHoursEnabled = true;
        partial.quietHoursStart = 23;            // 11pm UTC
        partial.quietHoursEnd = 7;               // 7am UTC
        return true;
    }
    if (callbackData === 'gc_cfg_quiet_light') {
        partial.quietHoursEnabled = true;
        partial.quietHoursStart = 1;             // 1am UTC
        partial.quietHoursEnd = 6;               // 6am UTC
        return true;
    }
    if (callbackData === 'gc_cfg_quiet_off') {
        partial.quietHoursEnabled = false;
        partial.quietHoursStart = 23;
        partial.quietHoursEnd = 7;
        return true;
    }

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
    const isFree = partial.type === 'free';
    const isWagered = partial.type === 'wagered';
    // Free matches: no wager, buybacks force-off (escalating cost on 0 wager makes no sense)
    // Wagered v2: buybacks force-off until v2.1 escrow ships buyback CPI
    const buybacksEnabled = (isFree || isWagered) ? false : (partial.buybacksEnabled ?? DEFAULTS.buybacksEnabled);
    const maxPlayers = partial.maxPlayers ?? DEFAULTS.maxPlayers;
    // minPlayers scales with maxPlayers — small matches (2/3) need full attendance,
    // bigger matches (4+) keep the original 4-player floor for a real group feel.
    const minPlayers = maxPlayers <= 3 ? maxPlayers : 4;
    return {
        type: partial.type ?? DEFAULTS.type,
        wagerLamports: isFree ? 0 : (partial.wagerLamports ?? 0),
        maxPlayers,
        minPlayers,
        durationMs: partial.durationMs ?? DEFAULTS.durationMs,
        turnTimerMs: partial.turnTimerMs ?? DEFAULTS.turnTimerMs,
        idlePenaltyHp: partial.idlePenaltyHp ?? DEFAULTS.idlePenaltyHp,
        buybacksEnabled,
        buybackCap: buybacksEnabled ? (partial.buybackCap ?? DEFAULTS.buybackCap) : 0,
        quietHoursEnabled: partial.quietHoursEnabled ?? DEFAULTS.quietHoursEnabled,
        quietHoursStart: partial.quietHoursStart ?? DEFAULTS.quietHoursStart,
        quietHoursEnd: partial.quietHoursEnd ?? DEFAULTS.quietHoursEnd,
    };
}

/** "11pm" / "7am" / "1am" — pretty hour label. */
function formatHourLabel(h) {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    if (h < 12) return `${h}am`;
    return `${h - 12}pm`;
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
