/**
 * /customgame command + callback handlers for SHOOTOUT (Phase 4,
 * 2026-06-08). Mounted on the Arcade Telegram bot (@TheArcadegg)
 * via registerShootoutCustomGameCommands(bot) from arcadeBot.js.
 *
 * Pattern (mirrors SolShot's services/groupchat/index.js):
 *   1. /customgame in a group → bot posts a wizard card with mode
 *      buttons.
 *   2. Wizard steps: mode (1v1/2v2) → wager (friendly/wagered).
 *      Wagered triggers a "coming in v2" alert and stays put.
 *   3. Tap Create lobby → server creates a ShootoutLobby with
 *      visibility=open + the chosen gameType, edits the same TG
 *      message into a lobby card with Join + Cancel buttons.
 *   4. Joiners tap Join → deep-link to bot DM with sg_<code>
 *      payload → bot.start picks it up, mints a session JWT, and
 *      DMs the launch URL with ?session=<jwt>&lobbyCode=<code>
 *      so the standalone client auto-joins on mount.
 *   5. Host can tap Cancel any time before the lobby fills.
 *
 * Group-only — DMs are rejected with a clear message (matches Fish's
 * spec 2026-06-08: "group chats only").
 *
 * Callback prefix: `sg_` to avoid collision with SolShot's `gc_` if
 * both bots ever run on the same Telegraf instance.
 */

import {
    beginConfig, getConfig, updateConfig, endConfig, nextStep,
} from './configFlow.js';
import { wizardCard, lobbyCard, cancelledCard } from './lobbyCard.js';
import * as lobbyService from '../lobbyService.js';
import ShootoutLobby from '../../../../models/ShootoutLobby.js';

const log = (...args) => console.log('[shootout/customgame]', ...args);

// Track lobbyId → {chatId, messageId} so callback handlers can edit
// the card in place after every join/cancel. In-memory; survives
// process lifetime. The 30-min ShootoutLobby TTL eventually cleans
// up any orphan rows if the process restarts.
const _cardByLobby = new Map();

function _isGroup(ctx) {
    const t = ctx?.chat?.type;
    return t === 'group' || t === 'supergroup';
}

async function _editTo(ctx, { text, keyboard }) {
    try {
        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard || undefined,
            disable_web_page_preview: true,
        });
    } catch (err) {
        // 'message is not modified' — harmless, ignore.
        if (!/not modified/i.test(err?.message || '')) {
            log('editMessageText failed:', err?.message);
        }
    }
}

async function _renderLobbyCard(ctx, lobbyId, botUsername) {
    const lobby = await ShootoutLobby.findOne({ lobbyId }).lean();
    if (!lobby) return;
    const card = lobbyCard(lobby, botUsername);
    await _editTo(ctx, card);
}

export function registerShootoutCustomGameCommands(bot, opts = {}) {
    // botUsername is resolved lazily via getBotUsername() so the
    // getter wins over the destructured one-shot read — at boot the
    // bot hasn't called getMe() yet, so the value is null when this
    // file loads. By the time a user types /customgame seconds later,
    // bot.telegram.getMe() has completed and getBotUsername() returns
    // the populated value. Falls back to a static botUsername option
    // for tests.
    const getBotUsername = typeof opts.getBotUsername === 'function'
        ? opts.getBotUsername
        : () => opts.botUsername || null;
    // ── /customgame in a group → start the wizard ─────────────────
    bot.command('customgame', async (ctx) => {
        try {
            if (!_isGroup(ctx)) {
                await ctx.reply(
                    '🔫 /customgame only works in group chats. Add me to a group + try again.',
                );
                return;
            }
            const chatId = ctx.chat.id;
            const userId = ctx.from.id;
            const { state } = beginConfig(chatId, userId);
            const card = wizardCard(state);
            const sent = await ctx.reply(card.text, {
                parse_mode: 'HTML',
                reply_markup: card.keyboard,
                disable_web_page_preview: true,
            });
            // Remember the message id so subsequent callbacks can edit
            // in-place rather than spawning new bubbles.
            updateConfig(chatId, userId, { messageId: sent.message_id });
        } catch (err) {
            log('/customgame handler failed:', err?.message);
        }
    });

    // ── sg_cfg_mode_<mode> ────────────────────────────────────────
    bot.action(/^sg_cfg_mode_(1v1|2v2)$/, async (ctx) => {
        try {
            const mode = ctx.match[1];
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id;
            const state = updateConfig(chatId, userId, { mode });
            if (!state) {
                await ctx.answerCbQuery('Session expired — run /customgame again.');
                return;
            }
            await ctx.answerCbQuery();
            await _editTo(ctx, wizardCard(state));
        } catch (err) {
            log('mode action failed:', err?.message);
        }
    });

    // ── sg_cfg_wager_<friendly|wager> ─────────────────────────────
    bot.action(/^sg_cfg_wager_(friendly|wager)$/, async (ctx) => {
        try {
            const wager = ctx.match[1];
            if (wager === 'wager') {
                await ctx.answerCbQuery(
                    'Wagered matches coming in v2 — pick Friendly for now.',
                    { show_alert: true },
                );
                return;
            }
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id;
            const state = updateConfig(chatId, userId, { gameType: 'friendly' });
            if (!state) {
                await ctx.answerCbQuery('Session expired — run /customgame again.');
                return;
            }
            await ctx.answerCbQuery();
            await _editTo(ctx, wizardCard(state));
        } catch (err) {
            log('wager action failed:', err?.message);
        }
    });

    // ── sg_cfg_back ─ rewind to the previous step ────────────────
    bot.action(/^sg_cfg_back$/, async (ctx) => {
        try {
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id;
            const state = getConfig(chatId, userId);
            if (!state) {
                await ctx.answerCbQuery('Session expired — run /customgame again.');
                return;
            }
            // Compute previous step
            const cur = nextStep(state);
            const patch = (cur === 'review') ? { gameType: null }
                       : (cur === 'wager')  ? { mode:     null }
                       : {};
            const next = updateConfig(chatId, userId, patch);
            await ctx.answerCbQuery();
            await _editTo(ctx, wizardCard(next));
        } catch (err) {
            log('back action failed:', err?.message);
        }
    });

    // ── sg_create ─ wizard done, spin up the ShootoutLobby ────────
    bot.action(/^sg_create$/, async (ctx) => {
        try {
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id;
            const state  = getConfig(chatId, userId);
            if (!state || !state.mode || !state.gameType) {
                await ctx.answerCbQuery('Session expired — run /customgame again.');
                return;
            }
            const res = await lobbyService.createLobby({
                mode:             state.mode,
                telegramUserId:   userId,
                telegramUsername: ctx.from?.username,
                firstName:        ctx.from?.first_name,
                visibility:       'open',
                gameType:         state.gameType,
            });
            if (res?.error) {
                await ctx.answerCbQuery('Could not create lobby: ' + res.error);
                return;
            }
            endConfig(chatId, userId);
            _cardByLobby.set(res.lobby.lobbyId, { chatId, messageId: ctx.callbackQuery?.message?.message_id });
            await ctx.answerCbQuery('Lobby created!');
            await _renderLobbyCard(ctx, res.lobby.lobbyId, getBotUsername());
        } catch (err) {
            log('create action failed:', err?.message);
        }
    });

    // ── sg_cancel_<code> ─ host cancels the lobby ─────────────────
    bot.action(/^sg_cancel_(.+)$/, async (ctx) => {
        try {
            const code = ctx.match[1];
            const userId = ctx.from?.id;
            const lobby = await ShootoutLobby.findOne({ code }).lean();
            if (!lobby) {
                await ctx.answerCbQuery('Lobby not found.');
                return;
            }
            if (lobby.hostTelegramUserId !== userId) {
                await ctx.answerCbQuery('Only the host can cancel.', { show_alert: true });
                return;
            }
            // Mark closed via leaveLobby (host leaving with only-host
            // member closes the lobby).
            await lobbyService.leaveLobby({
                lobbyId: lobby.lobbyId,
                telegramUserId: userId,
            });
            _cardByLobby.delete(lobby.lobbyId);
            await ctx.answerCbQuery('Cancelled.');
            const card = cancelledCard(lobby);
            await ctx.editMessageText(card.text, {
                parse_mode: 'HTML',
                reply_markup: undefined,
                disable_web_page_preview: true,
            });
        } catch (err) {
            log('cancel action failed:', err?.message);
        }
    });

    // ── sg_join_<code> (fallback — used when botUsername wasn't
    //    known at card-render time and we fell back from a deep-link
    //    url: button to a callback_data button). Sends the joiner a
    //    private 'open me in DM' message + reroute. In practice this
    //    branch only fires before bot.username is resolved on cold
    //    start; most of the time the Join button is a t.me/?start=sg_…
    //    url and Telegraf never sees the callback. ────────────────
    bot.action(/^sg_join_(.+)$/, async (ctx) => {
        try {
            const code = ctx.match[1];
            await ctx.answerCbQuery(
                `Open the bot in DM with /start sg_${code} to join (the launch URL is too long for a button alert).`,
                { show_alert: true },
            );
        } catch (err) {
            log('join action failed:', err?.message);
        }
    });

    log('registered /customgame + sg_* callbacks');
}

export default { registerShootoutCustomGameCommands };
