/**
 * The Arcade — multi-game Telegram launcher bot.
 *
 * Companion to @SolShotGG_bot. SolShot bot stays hackathon-pure (game-
 * specific commands, escrow flows, group-chat matches). Arcade bot is
 * the cross-game lobby: one Telegram surface that lists every game we
 * ship and deep-links to each one.
 *
 * Architecture:
 *   - Second Telegraf instance running in the same Express process as
 *     the existing SolShot bot.
 *   - Separate token (`ARCADE_BOT_TOKEN`) — different BotFather bot.
 *   - Separate webhook path (`/api/arcade-webhook`) so the two bots'
 *     update streams don't collide in production.
 *   - Long-polls in dev (same as SolShot bot) when no webhook URL set.
 *
 * Adding a new game: append to `GAMES` below. The bot automatically
 * registers a `/<slug>` command, surfaces the game in `/games`, and
 * includes it in slash-command autocomplete. No other edits required.
 *
 * Env vars:
 *   ARCADE_BOT_TOKEN          required — from @BotFather
 *   TELEGRAM_WEBHOOK_URL      shared with SolShot bot — server base URL
 *                              (e.g. https://solshot.onrender.com).
 *                              If unset, falls back to long polling.
 *   ARCADE_WEBHOOK_SECRET     optional — random string for webhook
 *                              header validation. Recommended in prod.
 */

import { Telegraf } from 'telegraf';

const ARCADE_WEBHOOK_PATH = '/api/arcade-webhook';

/**
 * Game registry — append entries to add new games. Order here determines
 * the order in `/games` listings and the welcome keyboard.
 *
 * Fields:
 *   slug              command slug — surfaces as `/<slug>` in TG and in
 *                       the autocomplete menu. Lowercase, no underscores
 *                       (TG limits command chars).
 *   name              display name shown on the launch button + welcome.
 *   emoji             prepended to the button label.
 *   tagline           one-line description in the `/games` listing.
 *   url               where the launch button sends the user.
 *   supportsLoginUrl  true if `url`'s host matches the bot's registered
 *                       BotFather /setdomain. Enables silent Privy auto-
 *                       sign-in via Telegram's `login_url` button (DM
 *                       only — TG rejects login_url in groups). False
 *                       falls back to plain `url:` everywhere.
 *
 * Bot's registered domain is currently `solshot.gg` (per JJ's /setdomain
 * for @TheArcadegg, 2026-05-15). SolShot lives there; Basketball is on
 * `solshot-basketball.vercel.app` (different host) so it stays plain
 * `url:` until/unless we point a subdomain at it.
 */
const GAMES = [
  {
    slug: 'solshot',
    name: 'SolShot',
    emoji: '🎯',
    tagline: '2D artillery duels on Solana. Real-money 1v1.',
    url: 'https://www.solshot.gg/',
    supportsLoginUrl: true,
  },
  {
    slug: 'basketball',
    name: 'Basketball Hoops',
    emoji: '🏀',
    tagline: 'Timed rapid-fire arcade hoops. 20s clock, hot-streak bonuses.',
    url: 'https://solshot-basketball.vercel.app/',
    supportsLoginUrl: false,
  },
];

let bot = null;

/**
 * Initialise the Telegraf bot instance and register commands.
 * Returns the bot instance, or null if ARCADE_BOT_TOKEN isn't set.
 */
export function initArcadeBot() {
  if (bot) return bot;

  const token = process.env.ARCADE_BOT_TOKEN;
  if (!token) {
    console.warn('[arcade-bot] ARCADE_BOT_TOKEN not set — arcade bot disabled');
    return null;
  }

  bot = new Telegraf(token);
  registerCommands(bot);

  bot.catch((err, ctx) => {
    console.error(`[arcade-bot] error handling ${ctx?.updateType}:`, err);
    if (String(err?.message || err).toLowerCase().includes('login_url')) {
      console.error(`[arcade-bot] LOGIN_URL ERROR: check that the launch URL host matches @BotFather /setdomain.`);
    }
  });

  return bot;
}

/**
 * Build an inline-keyboard button for a game. Uses Telegram's `login_url`
 * for silent Privy sign-in when the user is in a DM and the game's URL
 * is on the bot's registered domain; falls back to plain `url:` in groups
 * and on cross-domain games.
 */
function buildGameButton(game, ctx) {
  const isPrivate = ctx?.chat?.type === 'private';
  if (isPrivate && game.supportsLoginUrl) {
    return { text: `${game.emoji} ${game.name}`, login_url: { url: game.url } };
  }
  return { text: `${game.emoji} ${game.name}`, url: game.url };
}

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const lines = [
      '🕹️ Welcome to <b>The Arcade</b>',
      '',
      'A growing pool of skill-based games — pick one to launch.',
      '',
      'Type /games any time to see the full list, or use the shortcuts in the menu.',
    ];
    const keyboard = {
      inline_keyboard: GAMES.map(g => [buildGameButton(g, ctx)]),
    };
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.command('games', async (ctx) => {
    const lines = ['🎮 <b>The Arcade — game library</b>', ''];
    for (const g of GAMES) {
      lines.push(`<b>${g.emoji} ${g.name}</b>`);
      lines.push(g.tagline);
      lines.push(`Launch: /${g.slug}`);
      lines.push('');
    }
    const keyboard = {
      inline_keyboard: GAMES.map(g => [buildGameButton(g, ctx)]),
    };
    await ctx.reply(lines.join('\n').trimEnd(), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  // Per-game launch commands. Generated from GAMES so adding a new game
  // automatically gets its own /<slug> command with no extra wiring.
  for (const game of GAMES) {
    bot.command(game.slug, async (ctx) => {
      const keyboard = { inline_keyboard: [[buildGameButton(game, ctx)]] };
      await ctx.reply(
        `${game.emoji} <b>${game.name}</b>\n\n${game.tagline}\n\nTap below to launch.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    });
  }

  bot.command('help', async (ctx) => {
    const lines = [
      '<b>The Arcade</b> — multi-game launcher',
      '',
      '<b>Commands:</b>',
      '/games — list all games',
    ];
    for (const g of GAMES) {
      lines.push(`/${g.slug} — launch ${g.name}`);
    }
    lines.push('/help — show this');
    lines.push('');
    lines.push('Bug? Reach <b>@SolShotGG</b> on X or <b>support@solshot.gg</b>.');
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // Catch-all for any unrecognised text — surface the game picker instead
  // of letting the message disappear into the void.
  bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return next(); // let other handlers take it
    // Only respond in DM — don't be noisy in groups
    if (ctx.chat?.type !== 'private') return;
    const keyboard = {
      inline_keyboard: GAMES.map(g => [buildGameButton(g, ctx)]),
    };
    await ctx.reply(
      'Pick a game to launch, or type /games for the full library.',
      { reply_markup: keyboard }
    );
  });
}

/**
 * Push command autocomplete to Telegram. Runs on every boot — idempotent.
 * The slash menu in TG clients refreshes within a few seconds of this call.
 */
async function registerArcadeBotCommands() {
  if (!bot) return;
  try {
    const cmds = [
      { command: 'games', description: 'List all games in the arcade' },
      ...GAMES.map(g => ({ command: g.slug, description: `Launch ${g.name}` })),
      { command: 'help',  description: 'Show commands + support' },
    ];
    await bot.telegram.setMyCommands(cmds);
    console.log('[arcade-bot] slash commands registered:', cmds.map(c => '/' + c.command).join(' '));
  } catch (err) {
    console.warn('[arcade-bot] setMyCommands failed (non-fatal):', err.message);
  }
}

/**
 * Production mode: register webhook with Telegram and mount it on Express.
 * Returns true if webhook was set up, false if falling back to long polling.
 *
 * Webhook path is `/api/arcade-webhook` — distinct from the SolShot bot's
 * `/api/telegram-webhook` so both can run in the same Express app without
 * stealing each other's updates.
 */
export async function setupArcadeBotWebhook(app) {
  if (!bot) return false;

  // Push command autocomplete on every boot. Cheap, idempotent, ensures
  // the / menu always reflects the current GAMES registry.
  registerArcadeBotCommands().catch(() => {});

  // Log identity once so it's obvious in Render logs which bot this is.
  try {
    const me = await bot.telegram.getMe();
    console.log(`[arcade-bot] identity: @${me.username} (id ${me.id})`);
  } catch (err) {
    console.warn('[arcade-bot] getMe failed (non-fatal):', err.message);
  }

  const baseUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.ARCADE_WEBHOOK_SECRET || undefined;

  if (!baseUrl) {
    console.warn('[arcade-bot] TELEGRAM_WEBHOOK_URL not set — using long polling (dev)');
    bot.launch().catch((err) => console.error('[arcade-bot] launch error:', err));
    return false;
  }

  const fullUrl = `${baseUrl.replace(/\/$/, '')}${ARCADE_WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(fullUrl, secret ? { secret_token: secret } : undefined);
    app.use(bot.webhookCallback(ARCADE_WEBHOOK_PATH, secret ? { secretToken: secret } : undefined));
    console.log(`[arcade-bot] webhook registered at ${fullUrl}`);
    return true;
  } catch (err) {
    console.error('[arcade-bot] webhook setup failed:', err.message);
    return false;
  }
}

/**
 * Graceful shutdown — call on SIGTERM/SIGINT.
 */
export function stopArcadeBot() {
  if (!bot) return;
  try {
    bot.stop('SIGTERM');
  } catch { /* ignore */ }
}

/**
 * Direct access to the Telegraf instance. Mirrors getBot() in the SolShot
 * bot service — exposed for any caller that needs to send unsolicited
 * messages (e.g. cross-game leaderboard broadcasts later).
 */
export function getArcadeBot() {
  return bot;
}
