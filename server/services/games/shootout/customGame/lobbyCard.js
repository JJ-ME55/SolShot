/**
 * Telegram lobby card formatters for /customgame (Phase 4, 2026-06-08).
 *
 * Pure functions returning {text, keyboard} so the index handler can
 * call ctx.reply() / ctx.editMessageText() with them. Mirrors
 * SolShot's services/groupchat/lobbyCard.js pattern, slimmed down
 * for the Shootout MP flow (no buyback / wager fields v1).
 *
 * Callback prefix: `sg_` (shootout-game) — distinct from SolShot's
 * `gc_` to avoid Telegraf `bot.action(regex)` collisions on the same
 * bot instance. Sub-prefix conventions:
 *   sg_cfg_mode_<1v1|2v2>
 *   sg_cfg_wager_<friendly|wager>
 *   sg_cfg_back
 *   sg_create
 *   sg_join_<code>
 *   sg_cancel_<code>
 *
 * Public API:
 *   wizardCard(state) -> { text, keyboard }
 *      During the multi-step config wizard (mode → wager → review).
 *   lobbyCard(lobby, botUsername) -> { text, keyboard }
 *      Once the user taps Create lobby. Shows roster + Join/Cancel.
 *   cancelledCard(lobby) -> { text, keyboard: null }
 *      Terminal card after the host taps Cancel.
 */

function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ── Wizard ───────────────────────────────────────────────────────────

export function wizardCard(state) {
    const step = !state.mode ? 'mode' : !state.gameType ? 'wager' : 'review';

    if (step === 'mode') {
        return {
            text: [
                '🔫 <b>SHOOTOUT — Custom Game</b>',
                '',
                'Pick a mode:',
            ].join('\n'),
            keyboard: {
                inline_keyboard: [
                    [
                        { text: '1 v 1', callback_data: 'sg_cfg_mode_1v1' },
                        { text: '2 v 2', callback_data: 'sg_cfg_mode_2v2' },
                    ],
                ],
            },
        };
    }

    if (step === 'wager') {
        return {
            text: [
                '🔫 <b>SHOOTOUT — Custom Game</b>',
                '',
                `Mode: <b>${_esc(state.mode)}</b>`,
                '',
                'Wager or friendly?',
            ].join('\n'),
            keyboard: {
                inline_keyboard: [
                    [
                        { text: '🤝 Friendly',         callback_data: 'sg_cfg_wager_friendly' },
                        { text: '💰 Wager (coming v2)', callback_data: 'sg_cfg_wager_wager' },
                    ],
                    [
                        { text: '← Back', callback_data: 'sg_cfg_back' },
                    ],
                ],
            },
        };
    }

    // Review step
    return {
        text: [
            '🔫 <b>SHOOTOUT — Custom Game</b>',
            '',
            `Mode: <b>${_esc(state.mode)}</b>`,
            `Type: <b>${state.gameType === 'wager' ? 'Wagered (v2)' : 'Friendly'}</b>`,
            '',
            'Ready to create the lobby?',
        ].join('\n'),
        keyboard: {
            inline_keyboard: [
                [
                    { text: '← Back',        callback_data: 'sg_cfg_back' },
                    { text: '✅ Create lobby', callback_data: 'sg_create' },
                ],
            ],
        },
    };
}

// ── Live lobby card (after creation) ─────────────────────────────────

export function lobbyCard(lobby, botUsername) {
    const memberLines = (lobby.members || []).map((m, i) =>
        `  ${i + 1}. ${_esc(m.displayName || ('#' + m.telegramUserId))}${m.isHost ? ' · host' : ''}`
    );
    const slots = (lobby.members || []).length;
    const cap = lobby.cap;
    const text = [
        `🔫 <b>SHOOTOUT lobby · <code>${_esc(lobby.code)}</code></b>`,
        '',
        `Mode: <b>${_esc(lobby.mode)}</b>  ·  Type: <b>${lobby.gameType === 'wager' ? 'Wagered (v2)' : 'Friendly'}</b>`,
        `Slots: <b>${slots}/${cap}</b>`,
        '',
        '<b>Members</b>',
        ...(memberLines.length ? memberLines : ['  <i>(empty — waiting for joiners)</i>']),
        '',
        '<i>Match auto-starts when the lobby is full + everyone readies up in-game.</i>',
    ].join('\n');

    // Deep-link join — bot.start handler picks up sg_<code> payload
    // and DMs the user with a session-minted launch URL that includes
    // ?lobbyCode=<code> so the standalone client auto-joins on mount.
    const joinUrl = botUsername
        ? `https://t.me/${botUsername}?start=sg_${encodeURIComponent(lobby.code)}`
        : null;

    const keyboard = {
        inline_keyboard: [
            [
                joinUrl
                    ? { text: '🎮 Join match', url: joinUrl }
                    : { text: '🎮 Join match', callback_data: `sg_join_${lobby.code}` },
            ],
            [
                { text: '✖ Cancel lobby', callback_data: `sg_cancel_${lobby.code}` },
            ],
        ],
    };

    return { text, keyboard };
}

export function cancelledCard(lobby) {
    return {
        text: [
            `🔫 <b>SHOOTOUT lobby · <code>${_esc(lobby.code)}</code></b>`,
            '',
            '<i>Cancelled by host.</i>',
        ].join('\n'),
        keyboard: null,
    };
}
