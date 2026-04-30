/**
 * Group-chat lobby card formatters.
 *
 * Pure functions — no side effects, no DB, no bot calls. Used by the
 * `/customgame` flow and join/leave handlers to render the self-updating
 * lobby card.
 *
 * Telegram parse_mode: 'HTML'. Use HTML entities for user content to
 * dodge MarkdownV2 escape gymnastics.
 */

const SOL_PER_LAMPORT = 1_000_000_000;

// ─── Escape helpers ─────────────────────────────────────────────────────

/** Escape user-supplied text for Telegram HTML. Required for any TG username,
 *  callsign, or chat title we render in markup. */
export function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ─── Field formatters ───────────────────────────────────────────────────

const DURATION_PRESETS = [
    { ms: 12 * 60 * 60 * 1000, label: 'Sprint', display: '12h' },
    { ms: 3 * 24 * 60 * 60 * 1000, label: 'Weekend', display: '3d' },
    { ms: 7 * 24 * 60 * 60 * 1000, label: 'Marathon', display: '7d' },
];

/** "Weekend (3d)" / "Sprint (12h)" / "Marathon (7d)" — falls back to raw hours
 *  if the duration doesn't match a known preset. */
export function formatDuration(ms) {
    const preset = DURATION_PRESETS.find(p => p.ms === ms);
    if (preset) return `${preset.label} (${preset.display})`;
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

/** "12h" / "4h" / "24h" — turn timer display. */
export function formatTurnTimer(ms) {
    const hours = Math.round(ms / (60 * 60 * 1000));
    return `${hours}h`;
}

/** "FREE" or "0.05 SOL" or "1 SOL" — strips trailing zeros. */
export function formatWager(config) {
    if (config.type === 'free' || !config.wagerLamports) return 'FREE';
    const sol = config.wagerLamports / SOL_PER_LAMPORT;
    // Strip trailing zeros: 0.05 → "0.05", 1.0 → "1", 0.10 → "0.1"
    const str = sol.toFixed(4).replace(/\.?0+$/, '');
    return `${str || '0'} SOL`;
}

/** "disabled" / "enabled (max 3)" / "enabled (unlimited)" */
export function formatBuybacks(config) {
    if (!config.buybacksEnabled) return 'disabled';
    if (config.buybackCap === -1) return 'enabled (unlimited)';
    return `enabled (max ${config.buybackCap})`;
}

/** "11pm–7am UTC" / "1am–6am UTC" / "24/7" */
export function formatQuietHours(config) {
    if (!config.quietHoursEnabled) return '24/7';
    const fmt = (h) => {
        if (h === 0) return '12am';
        if (h === 12) return '12pm';
        if (h < 12) return `${h}am`;
        return `${h - 12}pm`;
    };
    return `${fmt(config.quietHoursStart)}–${fmt(config.quietHoursEnd)} UTC`;
}

/** "23h 47m" / "8m" / "1h 0m" — countdown to a future Date. Returns "expired"
 *  if the date is in the past. */
export function formatTimeLeft(futureDate) {
    if (!futureDate) return 'unknown';
    const ms = futureDate.getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

/** Render the player roster line: "@alice, @bob, @charlie". Falls back to
 *  player.callsign when tgUsername is null (rare — happens for users who
 *  haven't set a TG @username on their account). */
export function formatPlayerList(players) {
    if (!players || players.length === 0) return '<i>none yet</i>';
    return players
        .map(p => p.tgUsername ? `@${escapeHtml(p.tgUsername)}` : escapeHtml(p.callsign || 'unknown'))
        .join(', ');
}

// ─── Lobby card text ────────────────────────────────────────────────────

/**
 * Render the self-updating lobby card body for a match in the 'lobby' state.
 * Returns an HTML string suitable for `parse_mode: 'HTML'` send / edit.
 *
 * Layout (flex within Telegram constraints):
 *   🎮 Match #5G7K — open
 *   Wager: 0.05 SOL  |  Max: 8 players  |  Weekend (3d)
 *   Turn timer: 12h  |  Idle penalty: 20 HP  |  Buybacks: enabled (max 3)
 *
 *   Players (1/8): @alice
 *
 *   ⏱ Lobby closes in 23h 47m
 */
export function lobbyCardText(match) {
    const { matchId, config, players, lobbyExpiresAt } = match;

    const headLine = `🎮 <b>Match #${escapeHtml(matchId)}</b> — open`;
    const ruleLine1 = [
        `Wager: <b>${formatWager(config)}</b>`,
        `Max: <b>${config.maxPlayers} players</b>`,
        `<b>${formatDuration(config.durationMs)}</b>`,
    ].join('  |  ');
    const ruleLine2 = [
        `Turn timer: <b>${formatTurnTimer(config.turnTimerMs)}</b>`,
        `Idle penalty: <b>${config.idlePenaltyHp} HP</b>`,
        `Buybacks: <b>${formatBuybacks(config)}</b>`,
    ].join('  |  ');
    const ruleLine3 = `Quiet hours: <b>${formatQuietHours(config)}</b>`;

    const rosterLine = `Players (${players.length}/${config.maxPlayers}): ${formatPlayerList(players)}`;
    const expiresLine = lobbyExpiresAt
        ? `⏱ Lobby closes in <b>${formatTimeLeft(lobbyExpiresAt)}</b>`
        : '';

    return [
        headLine,
        ruleLine1,
        ruleLine2,
        ruleLine3,
        '',
        rosterLine,
        '',
        expiresLine,
    ].filter(Boolean).join('\n');
}

/**
 * Render the post-start "match active" card.
 * This replaces the lobby card after /startmatch fires.
 */
export function activeMatchCardText(match) {
    const { matchId, config, players, currentPlayerIndex, turnNumber, endsAt } = match;
    const alive = players.filter(p => !p.eliminated);
    const current = players[currentPlayerIndex];

    const headLine = `🎯 <b>Match #${escapeHtml(matchId)}</b> — turn ${turnNumber + 1}`;
    const standingLine = `Alive: <b>${alive.length}/${players.length}</b>`
        + `  |  Pot: <b>${formatWager(config)} × ${players.length}</b>`
        + (endsAt ? `  |  Ends in <b>${formatTimeLeft(endsAt)}</b>` : '');
    const turnLine = current
        ? `Up next: ${current.tgUsername ? `@${escapeHtml(current.tgUsername)}` : escapeHtml(current.callsign || 'unknown')}`
        : '';

    return [headLine, standingLine, '', turnLine].filter(Boolean).join('\n');
}

// ─── Inline keyboards ───────────────────────────────────────────────────

/**
 * Build the inline keyboard shown beneath the lobby card.
 * Free-mode lobbies get a [Join] button that adds the player directly.
 * Wagered-mode lobbies get a [Join] button that opens the Mini App for
 * the deposit flow (Phase 2 — for now wagered carries the same shape).
 *
 * The host always sees a [Cancel] button (only renders for host-targeted
 * messages; we currently render it always since per-user button visibility
 * isn't trivial in TG).
 */
export function lobbyCardKeyboard(match) {
    const { matchId } = match;
    return {
        inline_keyboard: [
            [
                { text: '🎮 Join', callback_data: `gc_join_${matchId}` },
                { text: '🚪 Leave', callback_data: `gc_leave_${matchId}` },
            ],
            [
                { text: '▶ Start match', callback_data: `gc_start_${matchId}` },
                { text: '✖ Cancel', callback_data: `gc_cancel_${matchId}` },
            ],
        ],
    };
}
