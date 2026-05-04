/**
 * Group-chat mode bot integration.
 *
 * Registers `/customgame`, `/startmatch`, `/cancelmatch` slash commands
 * plus all inline-button callback handlers (`gc_cfg_*`, `gc_join_*`,
 * `gc_leave_*`, `gc_start_*`, `gc_cancel_*`).
 *
 * Wired into the main bot via `registerGroupChatCommands(bot)`,
 * called from `server/services/bot.js`.
 *
 * Phase 1b scope:
 *   ✓ /customgame conversational config flow (8 host knobs)
 *   ✓ Lobby card posting + edit-in-place on join/leave
 *   ✓ Free-mode 1-tap join (TG username as callsign)
 *   stub /startmatch — Phase 1d ships the real game-start
 *
 * Wagered-mode join currently mirrors free join (Phase 2 will redirect
 * to Mini App for the on-chain deposit).
 */

import GroupMatch from '../../models/GroupMatch.js';
import * as configFlow from './configFlow.js';
import * as lobbyCard from './lobbyCard.js';
import * as lifecycle from './lifecycle.js';
import { lookupUserByTelegramId } from '../users.js';

// ─── Match ID generation ────────────────────────────────────────────────

const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // no 0 / O / 1 / I / L for human-readability
const ID_LENGTH = 4;

function randomMatchId() {
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return id;
}

/**
 * Returns a matchId that's unique among non-terminal GroupMatch docs.
 * Retries on collision (extremely rare at 32^4 ≈ 1M IDs).
 */
async function generateUniqueMatchId() {
    for (let attempt = 0; attempt < 8; attempt++) {
        const id = randomMatchId();
        const existing = await GroupMatch.findOne({
            matchId: id,
            state: { $in: ['lobby', 'active'] },
        }).lean();
        if (!existing) return id;
    }
    // Fallback: extend length
    return randomMatchId() + randomMatchId();
}

// ─── Registration entry ─────────────────────────────────────────────────

export function registerGroupChatCommands(bot) {
    bot.command('customgame', handleCustomGame);
    bot.command('startmatch', handleStartMatch);
    bot.command('cancelmatch', handleCancelMatch);

    // Configuration flow callbacks (8-step wizard)
    bot.action(/^gc_cfg_/, handleConfigCallback);

    // Lobby actions (after match is created)
    bot.action(/^gc_join_(.+)$/, handleJoinCallback);
    bot.action(/^gc_leave_(.+)$/, handleLeaveCallback);
    bot.action(/^gc_start_(.+)$/, handleStartCallback);
    bot.action(/^gc_cancel_(.+)$/, handleCancelCallback);
}

// ─── Slash command handlers ─────────────────────────────────────────────

async function handleCustomGame(ctx) {
    if (!isGroupChat(ctx)) {
        return ctx.reply('🎮 /customgame only works in group chats. Add me to a group and try again.');
    }

    // One configuration session per (chat, host) at a time.
    // If the host already has one in progress, beginConfig overwrites.
    const { text, keyboard } = configFlow.beginConfig(ctx.chat.id, ctx.from.id);
    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
    });
}

async function handleStartMatch(ctx) {
    if (!isGroupChat(ctx)) {
        return ctx.reply('/startmatch only works in group chats.');
    }

    const match = await findOpenLobby(ctx.chat.id);
    if (!match) return ctx.reply('No open match in this chat. Run /customgame to create one.');
    if (match.hostTelegramId !== ctx.from.id) {
        return ctx.reply('Only the host who ran /customgame can start the match.');
    }
    if (match.players.length < match.config.minPlayers) {
        return ctx.reply(`Need at least ${match.config.minPlayers} players to start. Currently ${match.players.length}/${match.config.maxPlayers}.`);
    }

    const updated = await lifecycle.startMatch(match.matchId);
    // Edit the lobby card to show "match started" state — prevents stale joins.
    if (match.lobbyMessageId) {
        const cardText = updated?.state === 'awaiting_deposits'
            ? `💰 <b>Match #${match.matchId}</b> — awaiting deposits. See chat for the deposit button.`
            : `🎯 <b>Match #${match.matchId}</b> — match active. See chat for turn pings.`;
        await safeEdit(ctx, match.lobbyMessageId, cardText, { parse_mode: 'HTML' });
    }
}

async function handleCancelMatch(ctx) {
    if (!isGroupChat(ctx)) return;
    // Find any open (lobby / awaiting_deposits / active) match — host should be able to
    // abandon a running match without waiting for it to settle naturally.
    const match = await GroupMatch.findOne({
        chatId: ctx.chat.id,
        state: { $in: ['lobby', 'awaiting_deposits', 'active'] },
    });
    if (!match) return ctx.reply('No open or active match in this chat.');
    if (match.hostTelegramId !== ctx.from.id) {
        return ctx.reply('Only the host can cancel the match.');
    }

    const wasActive = match.state === 'active';
    const wasWageredWithEscrow = match.config?.type === 'wagered' && match.escrowPda;

    // If it was active, clear its scheduled turn timer so the scheduler
    // doesn't try to fire idle penalties on a cancelled match.
    if (wasActive) {
        const { clearMatchTimer } = await import('./scheduler.js');
        const { clearResumeTimer } = await import('./lifecycle.js');
        clearMatchTimer(match.matchId);
        clearResumeTimer(match.matchId);
    }

    match.state = 'cancelled';
    match.cancelledAt = new Date();
    match.cancelReason = wasActive ? 'host_cancel_active' : 'host_cancel';
    await match.save();

    // Wagered matches with an on-chain escrow: refund deposited players.
    // Best-effort — if the chain call fails, permissionless_reclaim sweeps
    // the pot 24h after match_end_ts so funds are never permanently stuck.
    if (wasWageredWithEscrow) {
        const result = await lifecycle.cancelWageredEscrow(match);
        if (result.success && result.txSignature) {
            await ctx.reply(`💸 On-chain refund settled — TX: <code>${result.txSignature}</code>`, { parse_mode: 'HTML' });
        } else if (!result.success) {
            await ctx.reply(`⚠️ On-chain refund failed (${result.error}). Players can self-reclaim 24h after match end via the PWA.`);
        }
    }

    await ctx.reply(`🚫 Match #${match.matchId} cancelled by host${wasActive ? ' (was in progress)' : ''}.`);
    if (match.lobbyMessageId) {
        await safeEdit(ctx, match.lobbyMessageId,
            `🚫 <b>Match #${match.matchId}</b> — cancelled by host.`,
            { parse_mode: 'HTML' });
    }
}

// ─── Configuration callback handler ─────────────────────────────────────

async function handleConfigCallback(ctx) {
    // Wagered group-chat is gated until Escrow v2 (Phase 2). Surface this
    // intent as a feature peek rather than a broken flow.
    if (ctx.callbackQuery.data === 'gc_cfg_type_wagered_soon') {
        return ctx.answerCbQuery(
            'Wagered group matches are coming in Phase 2 (Escrow v2). Free matches are live now — pick Free to continue.',
            { show_alert: true },
        );
    }

    const result = configFlow.applyAction(ctx.chat.id, ctx.from.id, ctx.callbackQuery.data);

    try {
        switch (result.kind) {
            case 'prompt':
                await ctx.editMessageText(result.text, {
                    parse_mode: 'HTML',
                    reply_markup: result.keyboard,
                });
                await ctx.answerCbQuery();
                break;

            case 'confirm':
                await onConfigConfirmed(ctx, result.config);
                break;

            case 'cancel':
                await ctx.editMessageText('🚫 Configuration cancelled.', { parse_mode: 'HTML' });
                await ctx.answerCbQuery('Cancelled');
                break;

            case 'expired':
                await ctx.answerCbQuery('Configuration expired. Run /customgame again.', { show_alert: true });
                break;

            case 'noop':
            default:
                await ctx.answerCbQuery();
                break;
        }
    } catch (err) {
        console.error('[groupchat] config callback error:', err);
        await ctx.answerCbQuery('Something broke. Try /customgame again.');
    }
}

/** Called when the host taps "Create lobby" on the review screen. */
async function onConfigConfirmed(ctx, config) {
    const matchId = await generateUniqueMatchId();
    const now = new Date();
    const lobbyExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const match = new GroupMatch({
        matchId,
        chatId: ctx.chat.id,
        chatTitle: ctx.chat.title || null,
        hostTelegramId: ctx.from.id,
        hostWallet: null,                                 // populated when wallet links (Phase 2 wagered)
        state: 'lobby',
        config,
        players: [
            // Host auto-joins their own match. First color from the palette
            // (Red) — pickAvailableTankColor would return the same since
            // the player array is empty at this point, but we hard-pick to
            // make the contract explicit.
            buildPlayerSlot(ctx.from, /*tankColor*/ TANK_PHASER_COLORS[0]),
        ],
        createdAt: now,
        lobbyExpiresAt,
    });
    await match.save();

    // Replace the configuration message with the lobby card.
    const cardText = lobbyCard.lobbyCardText(match);
    const cardKeyboard = lobbyCard.lobbyCardKeyboard(match);

    await ctx.editMessageText(cardText, {
        parse_mode: 'HTML',
        reply_markup: cardKeyboard,
    });

    // Capture the lobby message ID so subsequent join/leave can edit it.
    match.lobbyMessageId = ctx.callbackQuery.message.message_id;
    await match.save();

    await ctx.answerCbQuery(`Match #${matchId} created`);
}

// ─── Lobby action callbacks ─────────────────────────────────────────────

async function handleJoinCallback(ctx) {
    const matchId = ctx.match[1];
    const match = await GroupMatch.findOne({ matchId, state: 'lobby' });

    if (!match) {
        return ctx.answerCbQuery('That match is no longer open.', { show_alert: true });
    }
    if (match.players.length >= match.config.maxPlayers) {
        return ctx.answerCbQuery('Match is full.', { show_alert: true });
    }
    if (match.players.some(p => p.telegramUserId === ctx.from.id)) {
        return ctx.answerCbQuery(
            "You're already in this match — open the Mini App to play your turn.",
            { show_alert: true }
        );
    }

    // One match per (player, chat). Defense in depth — UI shouldn't expose
    // this case (a player who's in won't see Join), but we re-check at the
    // server boundary anyway.
    const conflict = await GroupMatch.findOne({
        chatId: ctx.chat.id,
        state: { $in: ['lobby', 'awaiting_deposits'] },
        'players.telegramUserId': ctx.from.id,
        matchId: { $ne: matchId },
    }).lean();
    if (conflict) {
        return ctx.answerCbQuery(`You're already in match #${conflict.matchId} in this chat.`, { show_alert: true });
    }

    // Wagered: require a linked wallet BEFORE adding to the lobby. Without
    // this, the lobby could fill with un-walletted players and beginWagered-
    // DepositPhase would fail on chain (or refuse to call createMatchEscrow).
    let walletAddress = null;
    if (match.config?.type === 'wagered') {
        const user = await lookupUserByTelegramId(ctx.from.id);
        if (!user?.walletAddress) {
            return ctx.answerCbQuery(
                'Wagered match — link your wallet at solshot.gg first, then come back and tap Join.',
                { show_alert: true }
            );
        }
        walletAddress = user.walletAddress;
    }

    const tankColor = pickAvailableTankColor(match.players);
    const slot = buildPlayerSlot(ctx.from, tankColor);
    if (walletAddress) slot.walletAddress = walletAddress;
    match.players.push(slot);
    await match.save();

    await refreshLobbyCard(ctx, match);
    await ctx.answerCbQuery(match.config?.type === 'wagered' ? "You're in! Deposit prompt arrives when lobby fills." : "You're in!");

    // Auto-start when lobby is full. For wagered, this transitions to
    // awaiting_deposits + posts the deposit prompt to the chat (lifecycle
    // handles the message). For free, it goes straight to active.
    if (match.players.length >= match.config.maxPlayers) {
        const updated = await lifecycle.startMatch(match.matchId);
        if (match.lobbyMessageId) {
            const cardText = updated?.state === 'awaiting_deposits'
                ? `💰 <b>Match #${match.matchId}</b> — lobby full, awaiting deposits. See chat for the deposit button.`
                : `🎯 <b>Match #${match.matchId}</b> — match active. See chat for turn pings.`;
            await safeEdit(ctx, match.lobbyMessageId, cardText, { parse_mode: 'HTML' });
        }
    }
}

async function handleLeaveCallback(ctx) {
    const matchId = ctx.match[1];
    const match = await GroupMatch.findOne({ matchId, state: 'lobby' });

    if (!match) {
        return ctx.answerCbQuery('That match is no longer open.', { show_alert: true });
    }
    const idx = match.players.findIndex(p => p.telegramUserId === ctx.from.id);
    if (idx === -1) {
        return ctx.answerCbQuery("You're not in this match.");
    }
    if (match.players[idx].telegramUserId === match.hostTelegramId) {
        return ctx.answerCbQuery('Host can\'t leave their own match. Use /cancelmatch to close it.', { show_alert: true });
    }

    match.players.splice(idx, 1);
    await match.save();

    await refreshLobbyCard(ctx, match);
    await ctx.answerCbQuery('Left the match.');
}

async function handleStartCallback(ctx) {
    const matchId = ctx.match[1];
    const match = await GroupMatch.findOne({ matchId, state: 'lobby' });
    if (!match) return ctx.answerCbQuery('That match is no longer open.', { show_alert: true });
    if (match.hostTelegramId !== ctx.from.id) {
        return ctx.answerCbQuery('Only the host can start the match.', { show_alert: true });
    }
    if (match.players.length < match.config.minPlayers) {
        return ctx.answerCbQuery(
            `Need ${match.config.minPlayers} players to start (currently ${match.players.length}).`,
            { show_alert: true }
        );
    }

    await ctx.answerCbQuery('Starting match…');
    const updated = await lifecycle.startMatch(matchId);
    if (match.lobbyMessageId) {
        const cardText = updated?.state === 'awaiting_deposits'
            ? `💰 <b>Match #${match.matchId}</b> — awaiting deposits. See chat for the deposit button.`
            : `🎯 <b>Match #${match.matchId}</b> — match active. See chat for turn pings.`;
        await safeEdit(ctx, match.lobbyMessageId, cardText, { parse_mode: 'HTML' });
    }
}

async function handleCancelCallback(ctx) {
    const matchId = ctx.match[1];
    // Inline-button cancel sits on the lobby card; reachable in 'lobby' and
    // 'awaiting_deposits' (for wagered, before everyone has deposited).
    const match = await GroupMatch.findOne({ matchId, state: { $in: ['lobby', 'awaiting_deposits'] } });
    if (!match) return ctx.answerCbQuery('That match is no longer open.', { show_alert: true });
    if (match.hostTelegramId !== ctx.from.id) {
        return ctx.answerCbQuery('Only the host can cancel.', { show_alert: true });
    }

    const wasWageredWithEscrow = match.config?.type === 'wagered' && match.escrowPda;

    match.state = 'cancelled';
    match.cancelledAt = new Date();
    match.cancelReason = 'host_cancel_inline';
    await match.save();

    // Wagered with deposits collected: refund on-chain.
    if (wasWageredWithEscrow) {
        const result = await lifecycle.cancelWageredEscrow(match);
        if (!result.success) {
            console.warn(`[groupchat] inline cancel of ${matchId} — chain refund failed:`, result.error);
        }
    }

    await ctx.editMessageText(
        `🚫 <b>Match #${match.matchId}</b> — cancelled by host.`,
        { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('Cancelled.');
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isGroupChat(ctx) {
    return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

function buildPlayerSlot(tgUser, tankColor) {
    return {
        telegramUserId: tgUser.id,
        walletAddress: null,
        tgUsername: tgUser.username || null,
        callsign: tgUser.username || tgUser.first_name || `User${tgUser.id}`,
        tankColor,
    };
}

// Mirrors client/src/data/colors.js TANK_COLORS phaserHex values. Group-chat
// stores phaserHex (e.g. 0xFF0000) on each player so the same Phaser scene
// rendering path used in 1v1 (tank.create(int2rgba(player.color), ...))
// works without mode-specific transformation.
const TANK_PHASER_COLORS = [
    0xFF0000, // RED
    0xFF9900, // ORANGE
    0xFFFF00, // YELLOW
    0x00FF00, // GREEN
    0x00FFFF, // CYAN
    0x0066FF, // BLUE
    0x9900FF, // PURPLE
    0xFF00FF, // PINK
    0xFFFFFF, // WHITE
    0x666666, // GREY (10th slot for max-player matches)
];

/**
 * Pick the first phaserHex color value not yet claimed by another player
 * in this match. Returns a number suitable for `int2rgba()` in the Phaser
 * scene — same convention 1v1 uses.
 */
function pickAvailableTankColor(players) {
    const taken = new Set(players.map(p => p.tankColor));
    for (const hex of TANK_PHASER_COLORS) {
        if (!taken.has(hex)) return hex;
    }
    return TANK_PHASER_COLORS[0]; // fallback — should never hit with maxPlayers ≤ 10
}

async function findOpenLobby(chatId) {
    return GroupMatch.findOne({ chatId, state: 'lobby' });
}

/**
 * Re-render the lobby card after a join/leave.
 * Edits the original lobby message in-place so the chat scroll doesn't fill up.
 */
async function refreshLobbyCard(ctx, match) {
    if (!match.lobbyMessageId) return;
    const text = lobbyCard.lobbyCardText(match);
    const keyboard = lobbyCard.lobbyCardKeyboard(match);
    await safeEdit(ctx, match.lobbyMessageId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
    });
}

/** editMessageText that swallows "message is not modified" errors (these
 *  fire when the new text exactly matches the old — no harm done). */
async function safeEdit(ctx, messageId, text, extra) {
    try {
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, undefined, text, extra);
    } catch (err) {
        if (err?.description?.includes('message is not modified')) return;
        console.error('[groupchat] edit error:', err.description || err.message);
    }
}
