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
import {
    mintSession as mintBasketballSession,
    getLeaderboard as getBasketballLeaderboard,
    getMyStanding as getBasketballStanding,
} from './games/basketball-standalone/standaloneLeaderboard.js';
import {
    mintSession as mintKeepieUppiesSession,
    getLeaderboard as getKeepieUppiesLeaderboard,
    getMyStanding as getKeepieUppiesStanding,
} from './games/keepie-uppies-standalone/standaloneLeaderboard.js';

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
    // Hosted on JJ's `sol-shot-basketball` Vercel project (tracks
    // arcade/basketball branch of JJ-ME55/SolShot). Replaces the earlier
    // `solshot-basketball.vercel.app` which lived on Fish's separate
    // Vercel account — we couldn't update that one without his credentials.
    // See Docs/internal/CLAUDE_COMMS.md 2026-05-15 entry for the migration.
    url: 'https://sol-shot-basketball.vercel.app/',
    supportsLoginUrl: false,
    // Leaderboard binding — when present, we append a signed JWT to the
    // launch URL so the standalone client can submit scores tied to this
    // TG user. The client reads `?session=<jwt>`, stashes in sessionStorage,
    // and forwards it on POST /api/games/basketball/score.
    sessionMinter: (ctx) => mintBasketballSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
  {
    // TG slash commands can't contain hyphens, so the URL slug uses
    // `sol-shot-keepie-uppies` but the bot slug stays `keepieuppies`.
    slug: 'keepieuppies',
    name: 'Keepie Uppies',
    emoji: '⚽',
    tagline: 'Tap the ball, keep it off the ground. How long can you go?',
    url: 'https://sol-shot-keepie-uppies.vercel.app/',
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintKeepieUppiesSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
];

// Per-game leaderboard config. Maps slug → { rendering metadata, lib }.
// Used by `/leaderboard` chooser + per-game `/leaderboard<slug>` commands.
const LEADERBOARDS = {
  basketball: {
    emoji: '🏀',
    title: 'BASKETBALL HOOPS',
    getLeaderboard: getBasketballLeaderboard,
    getMyStanding: getBasketballStanding,
    launchCmd: '/basketball',
  },
  keepieuppies: {
    emoji: '⚽',
    title: 'KEEPIE UPPIES',
    getLeaderboard: getKeepieUppiesLeaderboard,
    getMyStanding: getKeepieUppiesStanding,
    launchCmd: '/keepieuppies',
  },
};

let bot = null;
// Resolved at boot from `bot.telegram.getMe()` in setupArcadeBotWebhook.
// Used by `buildGameButton` to construct the group-chat deep-link
// (https://t.me/<botUsername>?start=<slug>) that routes back into the
// DM so each tapper gets their own session-minted card.
let botUsername = null;

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
 * Render and send one game's leaderboard to the caller. Used by both the
 * `/leaderboard` chooser (via callback_query) and the per-game direct
 * commands (e.g. `/leaderboardbasketball`).
 */
async function sendLeaderboard(ctx, slug) {
  const cfg = LEADERBOARDS[slug];
  if (!cfg) {
    return ctx.reply('Unknown game. Use /leaderboard to see the list.');
  }
  try {
    const top = await cfg.getLeaderboard({ limit: 10 });
    const myTgId = ctx.from?.id;
    const myStanding = myTgId ? await cfg.getMyStanding({ telegramUserId: myTgId }) : null;

    if (!top || top.length === 0) {
      return ctx.reply(
        `${cfg.emoji} <b>${cfg.title} — LEADERBOARD</b>\n\nNo scores yet. Play ${cfg.launchCmd} to be the first.`,
        { parse_mode: 'HTML' }
      );
    }

    const HANDLE_W = 16;
    const fmtHandle = (name) => {
      const s = String(name || '???');
      if (s.length <= HANDLE_W) return s.padEnd(HANDLE_W, ' ');
      return s.slice(0, HANDLE_W - 1) + '…';
    };
    const fmtRank = (i) => {
      if (i === 0) return '🥇';
      if (i === 1) return '🥈';
      if (i === 2) return '🥉';
      return String(i + 1).padStart(2, ' ') + '.';
    };

    const lines = [];
    lines.push(`${cfg.emoji} <b>${cfg.title} · TOP 10</b>`);
    lines.push('<pre>');
    top.forEach((row, i) => {
      lines.push(`${fmtRank(i)} ${fmtHandle(row.displayName)} ${String(row.bestScore).padStart(4, ' ')}`);
    });
    if (myStanding && myStanding.rank > 10) {
      lines.push('');
      lines.push(`#${String(myStanding.rank).padStart(2, ' ')} ${fmtHandle(myStanding.displayName)} ${String(myStanding.bestScore).padStart(4, ' ')}`);
    }
    lines.push('</pre>');
    if (myStanding) {
      lines.push('');
      lines.push(`Your best: <b>${myStanding.bestScore}</b> (rank <b>#${myStanding.rank}</b>, ${myStanding.totalSubmissions} game${myStanding.totalSubmissions === 1 ? '' : 's'} submitted)`);
    } else {
      lines.push('');
      lines.push(`Play ${cfg.launchCmd} to put a score on the board.`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    console.warn(`[arcade-bot:leaderboard:${slug}] error:`, err.message);
    await ctx.reply('Could not fetch the leaderboard right now. Try again in a moment.');
  }
}

/**
 * Build an inline-keyboard button for a game.
 *   - In DM with a TG-identified user, if the game has a `sessionMinter`,
 *     append a signed JWT as `?session=<jwt>` so the destination client
 *     can submit scores tied to this user. The minter is called with the
 *     full `ctx` so it can read `ctx.from.id`/.username/.first_name.
 *   - In DM on a game whose `url` host matches the bot's registered domain
 *     (`supportsLoginUrl: true`), use Telegram's `login_url` for the
 *     TG-native confirmation dialog.
 *   - In groups, the button is a TG deep-link back to the bot DM with
 *     a `start=<slug>` payload. One group message is seen by many users
 *     and a single JWT can only carry one identity — so we can't
 *     pre-mint here. The /start handler picks up the payload and DMs
 *     each tapper their own fresh sessioned card.
 */
function buildGameButton(game, ctx) {
  const isPrivate = ctx?.chat?.type === 'private';

  if (!isPrivate) {
    // Group/supergroup: deep-link to the bot DM so each user gets their
    // own session-minted card. Falls back to the raw URL if we haven't
    // resolved the bot's @username yet (bot booting / getMe failed).
    if (botUsername && game.sessionMinter) {
      const deepLink = `https://t.me/${botUsername}?start=${encodeURIComponent(game.slug)}`;
      return { text: `${game.emoji} ${game.name}`, url: deepLink };
    }
    return { text: `${game.emoji} ${game.name}`, url: game.url };
  }

  // Private chat: mint per-user session and use login_url where allowed.
  let url = game.url;
  if (game.sessionMinter && ctx?.from?.id) {
    try {
      const session = game.sessionMinter(ctx);
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}session=${encodeURIComponent(session)}`;
    } catch (err) {
      console.warn(`[arcade-bot] sessionMinter failed for ${game.slug}:`, err.message);
      // fall through with un-sessioned URL — game still plays, just no leaderboard submission
    }
  }
  if (game.supportsLoginUrl) {
    return { text: `${game.emoji} ${game.name}`, login_url: { url } };
  }
  return { text: `${game.emoji} ${game.name}`, url };
}

function registerCommands(bot) {
  bot.start(async (ctx) => {
    // Deep-link payload from group-chat handoff: /start <slug> means
    // the user tapped a group launch button which routed back here so
    // we could mint a per-user session. Skip the welcome and go
    // straight to the game's launch card with their session attached.
    const payload = (ctx.startPayload || '').trim();
    const requested = payload ? GAMES.find(g => g.slug === payload) : null;
    if (requested) {
      const keyboard = { inline_keyboard: [[buildGameButton(requested, ctx)]] };
      await ctx.reply(
        `${requested.emoji} <b>${requested.name}</b>\n\n${requested.tagline}\n\nTap below to launch.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

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

  // `/leaderboard` — chooser. Lists the games and uses inline buttons to
  // jump into each game's board. Direct entry via `/leaderboard<slug>`
  // (e.g. /leaderboardbasketball) is also registered below.
  bot.command('leaderboard', async (ctx) => {
    const lines = [
      '🏆 <b>The Arcade — leaderboards</b>',
      '',
      'Pick a game:',
    ];
    const buttons = Object.entries(LEADERBOARDS).map(([slug, cfg]) => ([
      { text: `${cfg.emoji} ${cfg.title}`, callback_data: `lb:${slug}` },
    ]));
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  });

  // Per-game direct entry commands: /leaderboardbasketball, /leaderboardkeepieuppies, ...
  for (const slug of Object.keys(LEADERBOARDS)) {
    bot.command(`leaderboard${slug}`, async (ctx) => {
      await sendLeaderboard(ctx, slug);
    });
  }

  // Callback handler for chooser inline buttons.
  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (typeof data !== 'string' || !data.startsWith('lb:')) return next?.();
    const slug = data.slice(3);
    await ctx.answerCbQuery().catch(() => {});
    await sendLeaderboard(ctx, slug);
  });

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
    lines.push('/leaderboard — pick a game leaderboard');
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
      { command: 'games',       description: 'List all games in the arcade' },
      ...GAMES.map(g => ({ command: g.slug, description: `Launch ${g.name}` })),
      { command: 'leaderboard', description: 'Pick a game leaderboard' },
      ...Object.entries(LEADERBOARDS).map(([slug, cfg]) => ({
        command: `leaderboard${slug}`,
        description: `${cfg.title} top 10`,
      })),
      { command: 'help',        description: 'Show commands + support' },
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
  // Also cache the @username so group-chat deep-links can include it.
  try {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
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
