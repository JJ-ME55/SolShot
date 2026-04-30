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
import { registerGroupChatCommands } from './groupchat/index.js';

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://t.me/SolShotGG_bot/solshot';
const WEBHOOK_PATH = '/api/telegram-webhook';


let bot = null;

/**
 * Returns the initialised Telegraf bot instance, or null if not yet
 * initialised. Used by services that need to send messages from
 * outside a request context (e.g. the group-chat scheduler firing
 * idle-penalty announcements).
 */
export function getBot() {
  return bot;
}

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
      'Challenge a friend to a 1v1 duel.',
      { reply_markup: launchKeyboard('Open Challenge Builder', 'challenge') }
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

  // Group-chat mode commands (/customgame, /startmatch, /cancelmatch + callbacks)
  registerGroupChatCommands(bot);
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
