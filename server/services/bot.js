/**
 * SolShot Telegram Bot Service
 *
 * Handles bot commands like /play, /challenge, /stats, etc.
 * Each command replies with an inline button that opens the Mini App
 * with the appropriate `?startapp=<param>` deep link.
 *
 * In production: webhook mode (Telegram POSTs to /api/telegram-webhook)
 * In dev: long-polling mode (bot pulls updates from Telegram API)
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN        — required. From @BotFather.
 *   TELEGRAM_WEBHOOK_URL      — optional. Server's public URL (e.g.
 *                               https://solshot-server.onrender.com).
 *                               If unset, falls back to long polling.
 *   TELEGRAM_WEBHOOK_SECRET   — optional. Random string for webhook
 *                               header validation. Recommended in prod.
 *   MINI_APP_URL              — optional. Defaults to
 *                               https://t.me/SolShotGG_bot/solshot.
 */

import { Telegraf } from 'telegraf';
import { getChallenge, markAccepted } from './challenge/challenge.js';

// The path segment after the bot username is the Mini App `short_name` registered
// in BotFather. Our Mini App is registered as `play` (not `solshot`). Set
// MINI_APP_URL env to override if the short_name ever changes.
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://t.me/SolShotGG_bot/play';
const WEBHOOK_PATH = '/api/telegram-webhook';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || process.env.TELEGRAM_WEBHOOK_URL || '';

let bot = null;

/**
 * Initialise the Telegraf bot instance and register commands.
 * Returns the bot instance, or null if TELEGRAM_BOT_TOKEN isn't set.
 */
export function initBot() {
  if (bot) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  bot = new Telegraf(token);
  registerCommands(bot);

  bot.catch((err, ctx) => {
    console.error(`[bot] error handling ${ctx?.updateType}:`, err);
  });

  return bot;
}

/**
 * Build an inline keyboard with a single "Open Mini App" button.
 * Uses a Telegram-native t.me link so the preview renders the Mini App card,
 * not a generic web link.
 */
function launchKeyboard(label, startapp = '') {
  const url = startapp
    ? `${MINI_APP_URL}?startapp=${encodeURIComponent(startapp)}`
    : MINI_APP_URL;
  return {
    inline_keyboard: [[{ text: label, url }]],
  };
}

function registerCommands(bot) {
  // /start — fires on first interaction or when user opens via t.me link.
  // The payload (e.g. "/start join_xyz") arrives in ctx.startPayload.
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';
    await ctx.reply(
      'Welcome to SolShot — artillery duels on Solana.\n\n' +
      'Real money 1v1 matches. 20 weapons. Skill-based wagering.\n\n' +
      'Tap below to launch.',
      { reply_markup: launchKeyboard('🎯 Launch SolShot', payload) }
    );
  });

  bot.command('play', async (ctx) => {
    await ctx.reply(
      'Find a match in the lobby — practice mode is free.',
      { reply_markup: launchKeyboard('Find Match', 'play') }
    );
  });

  bot.command('challenge', async (ctx) => {
    await ctx.reply(
      'Create a 1v1 challenge — get a shareable link to send your opponent.',
      { reply_markup: launchKeyboard('Create Challenge', 'challenge_new') }
    );
  });

  bot.command('stats', async (ctx) => {
    await ctx.reply(
      'Your record, rank, and signature weapon.',
      { reply_markup: launchKeyboard('Open Barracks', 'stats') }
    );
  });

  bot.command('leaderboard', async (ctx) => {
    await ctx.reply(
      'Top players this season.',
      { reply_markup: launchKeyboard('Open Leaderboard', 'leaderboard') }
    );
  });

  bot.command('wallet', async (ctx) => {
    await ctx.reply(
      'Your wallet — balance, deposit, withdraw.',
      { reply_markup: launchKeyboard('Open Wallet', 'wallet') }
    );
  });

  bot.command('shop', async (ctx) => {
    await ctx.reply(
      'Cosmetics, camos, and projectile trails — paid in SHOT.',
      { reply_markup: launchKeyboard('Open Armory', 'shop') }
    );
  });

  bot.command('prestige', async (ctx) => {
    await ctx.reply(
      'Climb the prestige tiers — Bronze through Diamond. Burn SHOT to advance.',
      { reply_markup: launchKeyboard('Open Prestige', 'prestige') }
    );
  });

  bot.command('weapons', async (ctx) => {
    await ctx.reply(
      '20 weapons across 6 tiers — single shot to nuclear pineapple. Browse the arsenal.',
      { reply_markup: launchKeyboard('Open Arsenal', 'weapons') }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.replyWithMarkdownV2(
      '*SolShot* — artillery duels on Solana\\.\n\n' +
      '*Quick start:*\n' +
      '1\\. Tap Play to find a match\n' +
      '2\\. Pick weapons in the shop\n' +
      '3\\. Take turns shooting — winner takes the pot\n\n' +
      '*Practice mode is free*\\. Wagered modes pay out in SOL\\.\n' +
      '*Prestige* unlocks tiers from Bronze → Diamond\\.\n' +
      '*SHOT token* powers cosmetics and prestige burns\\.\n\n' +
      'Web: solshot\\.gg \\| X: @SolShotGG',
      { reply_markup: launchKeyboard('🎯 Launch SolShot') }
    );
  });

  bot.command('support', async (ctx) => {
    await ctx.reply(
      'Need help? Reach the team:\n\n' +
      '• Twitter: @SolShotGG\n' +
      '• Discord: discord.gg/solshot\n' +
      '• Email: support@solshot.gg'
    );
  });

  // ─── Inline mode — `switchInlineQuery` from Mini App posts challenge cards ───
  //
  // When a user inside the Mini App taps "Challenge a friend" we call
  // `Telegram.WebApp.switchInlineQuery('ch_<shortCode>', ['users'])`. Telegram
  // opens the chat picker; once the user picks a chat, Telegram fires an
  // `inline_query` event to this bot with `query = "ch_<shortCode>"`. We
  // reply with a single InlineQueryResultPhoto pointing at our server-rendered
  // card PNG (the public /api/challenge/:code/card.png endpoint).
  bot.on('inline_query', async (ctx) => {
    try {
      const query = (ctx.inlineQuery?.query || '').trim();
      if (!query.startsWith('ch_')) {
        return ctx.answerInlineQuery([], { cache_time: 1 });
      }
      const shortCode = query.slice(3).toUpperCase();
      const challenge = await getChallenge(shortCode);
      if (!challenge) {
        return ctx.answerInlineQuery([], { cache_time: 1 });
      }

      if (!SERVER_BASE_URL) {
        console.warn('[bot] SERVER_BASE_URL not set — inline card url will be relative');
      }
      const cardUrl = `${SERVER_BASE_URL.replace(/\/$/, '')}/api/challenge/${shortCode}/card.png`;
      const acceptDeepLink = `${MINI_APP_URL}?startapp=ch_${shortCode}`;

      const challenger = challenge.challengerHandle || 'OPERATIVE';
      const opp = challenge.opponentHandle || 'anyone brave enough';
      const wagerStr = challenge.wager?.amount > 0
        ? `${challenge.wager.amount} ${challenge.wager.token}`
        : 'PRACTICE';

      await ctx.answerInlineQuery([
        {
          type: 'photo',
          id: shortCode,
          photo_url: cardUrl,
          thumbnail_url: cardUrl,
          photo_width: 1080,
          photo_height: 1080,
          title: `${challenger} vs ${opp}`,
          description: `${wagerStr} · ${challenge.format || 'BO1'}`,
          caption: `${challenger} challenges ${opp} — ${wagerStr} · ${challenge.format || 'BO1'}`,
          reply_markup: {
            inline_keyboard: [[
              { text: '⚔ ACCEPT', url: acceptDeepLink },
            ]],
          },
        },
      ], {
        cache_time: 1,
        is_personal: true,
      });
    } catch (err) {
      console.error('[bot] inline_query error:', err);
      try { await ctx.answerInlineQuery([], { cache_time: 1 }); } catch { /* ignore */ }
    }
  });

  // ─── Callback queries — accept/decline buttons on inline cards ───
  // Reserved for future callback_data buttons. Inline mode currently uses
  // `url` buttons (deep link to Mini App) so this handler is a no-op fallback.
  bot.on('callback_query', async (ctx) => {
    try {
      const data = ctx.callbackQuery?.data || '';
      if (data.startsWith('decline:')) {
        const shortCode = data.slice('decline:'.length);
        await ctx.answerCbQuery('Challenge declined.');
        // (could mark the challenge as cancelled — for v1 we just dismiss the prompt)
        return;
      }
      if (data.startsWith('accept:')) {
        const shortCode = data.slice('accept:'.length);
        const tgId = ctx.from?.id;
        const result = await markAccepted(shortCode, { acceptorTgUserId: tgId });
        if (result.error) {
          return ctx.answerCbQuery(`Couldn't accept: ${result.error}`, { show_alert: true });
        }
        await ctx.answerCbQuery('Challenge accepted — opening match...');
        return;
      }
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('[bot] callback_query error:', err);
      try { await ctx.answerCbQuery('Something went wrong.', { show_alert: true }); } catch { /* */ }
    }
  });
}

/**
 * Production mode: register webhook with Telegram and mount it on Express.
 * Returns true if webhook was set up, false if falling back to long polling.
 */
export async function setupBotWebhook(app) {
  if (!bot) return false;

  const baseUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;

  if (!baseUrl) {
    console.warn('[bot] TELEGRAM_WEBHOOK_URL not set — using long polling (dev)');
    bot.launch().catch((err) => console.error('[bot] launch error:', err));
    return false;
  }

  const fullUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(fullUrl, secret ? { secret_token: secret } : undefined);
    app.use(bot.webhookCallback(WEBHOOK_PATH, secret ? { secretToken: secret } : undefined));
    console.log(`[bot] webhook registered at ${fullUrl}`);
    return true;
  } catch (err) {
    console.error('[bot] webhook setup failed:', err.message);
    return false;
  }
}

/**
 * Graceful shutdown — call on SIGTERM/SIGINT.
 */
export function stopBot() {
  if (!bot) return;
  try {
    bot.stop('SIGTERM');
  } catch { /* ignore */ }
}
