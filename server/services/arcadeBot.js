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
import {
    mintSession as mintFreeKicksSession,
    getLeaderboard as getFreeKicksLeaderboard,
    getMyStanding as getFreeKicksStanding,
} from './games/free-kicks-standalone/standaloneLeaderboard.js';
// Pool imports parked 2026-06-05 — pool entry removed from GAMES +
// LEADERBOARDS while the canvas lift is outstanding. poolLeaderboard.js
// module + Mongo data are untouched; uncomment to restore the bot
// surface alongside re-adding the GAMES/LEADERBOARDS entries below.
// import {
//     mintSession as mintPoolSession,
//     getEloLeaderboard as getPoolEloLeaderboard,
//     getEloStanding as getPoolEloStanding,
// } from './games/pool/poolLeaderboard.js';
import {
    mintSession as mintCritterKartSession,
    getLeaderboard as getCritterKartLeaderboard,
    getMyStanding as getCritterKartStanding,
} from './games/critter-kart-standalone/standaloneLeaderboard.js';
import {
    mintSession as mintShootoutSession,
} from './games/shootout-standalone/standaloneLeaderboard.js';
import { registerShootoutCustomGameCommands } from './games/shootout/customGame/index.js';

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
 * Bot's registered domain is currently `thearcade.gg` (per JJ's /setdomain
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
    // FALSE since 2026-06-04 — bot's /setdomain swapped to `thearcade.gg`
    // (commit a880f64). With true, this button emitted `login_url:
    // solshot.gg`, which TG rejects against the new registered domain,
    // breaking ALL replies that contained it (/solshot direct AND /games
    // which iterates GAMES). DM-specific (groups skip the login_url
    // branch). Tradeoff: SolShot launches without TG's auto-handshake
    // — users Privy-log-in inside solshot.gg as before.
    supportsLoginUrl: false,
  },
  {
    slug: 'basketball',
    name: 'Basketball Hoops',
    emoji: '🏀',
    tagline: 'Timed rapid-fire arcade hoops. 20s clock, hot-streak bonuses.',
    // Now served from the unified arcade hub (JJ-ME55/The-Arcade repo,
    // deployed at thearcade.gg, route /play/basketball/launch).
    // Phase 2 IA flip (2026-05-28) split /play/<slug> into a game-detail
    // page (editorial / wager slip / how-to-play) and /play/<slug>/launch
    // which mounts the Phaser scene. Bot users skip the detail page and
    // land directly on the launch URL — same one-tap UX as before.
    // Previous standalone Vercel `sol-shot-basketball.vercel.app` stays
    // live as a fallback for ~30 days post-cutover (see playbook §Cleanup).
    url: 'https://thearcade.gg/play/basketball/launch',
    supportsLoginUrl: false,
    // Leaderboard binding — append a signed JWT to the launch URL so the
    // game client can submit scores tied to this TG user. Client reads
    // `?session=<jwt>`, stashes in sessionStorage, POSTs on game-over to
    // `/api/games/basketball/score`. Same endpoint as the standalone era;
    // scores land in the same BasketballScore Mongo collection.
    sessionMinter: (ctx) => mintBasketballSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
  {
    // TG slash commands can't contain hyphens, so the bot slug is
    // `keepieuppies` while the arcade URL is `/play/keepie-uppies`.
    slug: 'keepieuppies',
    name: 'Keepie Uppies',
    emoji: '⚽',
    tagline: 'Tap the ball, keep it off the ground. How long can you go?',
    url: 'https://thearcade.gg/play/keepie-uppies/launch',
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintKeepieUppiesSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
  {
    // Vite + Three.js, lifted from JJ-ME55/solshot-free-kicks into the
    // arcade hub at /play/free-kicks. Previous standalone
    // solshot-free-kicks-iota.vercel.app stays live as a fallback.
    slug: 'freekicks',
    name: 'Free-Kick Madness',
    emoji: '🥅',
    tagline: 'Bend it past the wall. Targets, bonus boards, fire-ball hat-tricks.',
    url: 'https://thearcade.gg/play/free-kicks/launch',
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintFreeKicksSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
  // 8-Ball Pool removed from the public bot catalogue 2026-06-05.
  // The canvas lift from arcade/8-ball-pool isn't done; visiting
  // /play/pool/launch on thearcade.gg 404s and the /pool slash command
  // was a dead-end. Removing the entry here drops it from /games + from
  // the registered slash commands so the bot reflects what users can
  // actually play (5 live cabinets: SolShot, Basketball, Keepie Uppies,
  // Free Kicks, Critter Kart). LEADERBOARDS.pool is intentionally KEPT
  // below — the ELO board has real historical data and `/leaderboardpool`
  // is still useful for archive queries even with no live entry surface.
  // Restore this entry when /play/pool/launch lands in The-Arcade repo.
  {
    // React + Three.js kart racer, lifted from BillionaireBonkClub/critter-kart
    // by fishyboy-claude (commit 0c8ac388 on arcade/critter-kart, 2026-06-04).
    // Career-aggregate scoring (Mario Kart Grand Prix style): position points
    // accumulate, server tracks totalPoints / races / wins / podiums /
    // bestLapTime — see services/games/critter-kart-standalone/.
    //
    // Promoted from preview to the main hub 2026-06-04: code merged from
    // arcade/critter-kart into main (see The-Arcade @ critter-kart wire-up
    // commit). URL now points at the production thearcade.gg domain;
    // preview deploy stays live for Fish's iteration loop.
    slug: 'critterkart',
    name: 'Critter Kart',
    emoji: '🏎️',
    tagline: '6-player kart racing. Grand Prix scoring — points add up across races.',
    // TEMPORARY: point at preview (the-arcade-critter-kart.vercel.app)
    // while multiplayer testing is in progress on arcade/critter-kart
    // branch. thearcade.gg = main branch, doesn't have multiplayer
    // (Session 1/2 work) yet — that lives on arcade/critter-kart.
    // Promote arcade/critter-kart → main when ready, then flip this
    // back to https://thearcade.gg/play/critter-kart/launch.
    url: 'https://the-arcade-critter-kart.vercel.app/play/critter-kart/launch',
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintCritterKartSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
  },
  {
    // Browser FPS (Three.js + socket.io), lifted from
    // BillionaireBonkClub/shootout. Red vs Blue rounds, server-authoritative
    // MP (1v1 + 2v2). Lobby state machine already lives in SolShot's
    // services/games/shootout/ (so this bot entry just hands over a JWT
    // with the TG identity — the standalone client + the existing
    // shootout:lobby:* socket events do the rest).
    //
    // URL targets the Vercel standalone for now. When the Arcade hub
    // wraps Shootout at /play/shootout/launch (mirroring Basketball /
    // Keepie-Uppies pattern), flip this URL to thearcade.gg the same
    // way the others were promoted.
    slug: 'shootout',
    name: 'SHOOTOUT',
    // Squirt-gun glyph because SolShot already owns the bullseye/dart
    // (target practice game) — Shootout needs its own visual mark.
    emoji: '🔫',
    tagline: 'Browser FPS. Red vs Blue · winner takes the pot.',
    url: 'https://fps-staking-game.vercel.app/?via=arcade',
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintShootoutSession({
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
  freekicks: {
    emoji: '🥅',
    title: 'FREE-KICK MADNESS',
    getLeaderboard: getFreeKicksLeaderboard,
    getMyStanding: getFreeKicksStanding,
    launchCmd: '/freekicks',
  },
  // Pool leaderboard entry removed from the bot 2026-06-05 — pool is
  // off the floor entirely (see GAMES note above). PoolEloLeaderboard /
  // PoolEloStanding services + their Mongo data are untouched; restoring
  // the bot surface is a 3-line re-paste from git history. The pool
  // ELO adapter that lived here used `getPoolEloLeaderboard` /
  // `getPoolEloStanding` from ./games/pool/poolLeaderboard.js to map
  // ELO rating → bestScore for the shared leaderboard contract.
  critterkart: {
    // Career-aggregate (Mario Kart Grand Prix) — bestScore is totalPoints,
    // totalSubmissions is races. The leaderboard service emits a row
    // matching the per-game contract directly, so no adapter needed.
    emoji: '🏎️',
    title: 'CRITTER KART · GRAND PRIX',
    getLeaderboard: getCritterKartLeaderboard,
    getMyStanding: getCritterKartStanding,
    launchCmd: '/critterkart',
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

    // Shootout /customgame join deep-link (Phase 4, 2026-06-08).
    // Pattern: /start sg_<code>. Mint a Shootout JWT for this user
    // and DM the launch URL with both ?session=<jwt> and
    // &lobbyCode=<code> so the standalone client auto-joins the
    // lobby on mount.
    if (payload.startsWith('sg_')) {
      const code = payload.slice(3).toUpperCase();
      const shootoutGame = GAMES.find(g => g.slug === 'shootout');
      if (shootoutGame && code) {
        let url = shootoutGame.url;
        try {
          const session = shootoutGame.sessionMinter(ctx);
          const sep1 = url.includes('?') ? '&' : '?';
          url = `${url}${sep1}session=${encodeURIComponent(session)}&lobbyCode=${encodeURIComponent(code)}`;
        } catch (err) {
          console.warn('[arcade-bot] shootout sg_ mint failed:', err?.message);
          const sep1 = url.includes('?') ? '&' : '?';
          url = `${url}${sep1}lobbyCode=${encodeURIComponent(code)}`;
        }
        const keyboard = {
          inline_keyboard: [[{ text: `${shootoutGame.emoji} Join lobby ${code}`, url }]],
        };
        await ctx.reply(
          `${shootoutGame.emoji} <b>SHOOTOUT — joining lobby</b>\n\nCode: <code>${code}</code>\n\nTap below to drop in.`,
          { parse_mode: 'HTML', reply_markup: keyboard }
        );
        return;
      }
    }

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
      // Special-case critterkart: 2-button menu (Quick Race multiplayer
      // + Solo vs Bots). The Quick Race button appends ?queue=1 to the
      // launch URL so the hub auto-enqueues; Solo is the bare URL.
      // Other games get the standard 1-button keyboard.
      let inline_keyboard;
      if (game.slug === 'critterkart') {
        const soloBtn = buildGameButton(game, ctx);
        // Clone the button + append ?queue=1 — buildGameButton already
        // appended ?session=<jwt> if a sessionMinter is wired. We just
        // need to add the queue param to whichever URL it produced.
        const queueBtn = (() => {
          const b = { ...soloBtn };
          const u = (b.url || b.login_url?.url) ?? game.url;
          const sep = u.includes('?') ? '&' : '?';
          const queueUrl = `${u}${sep}queue=1`;
          if (b.login_url) b.login_url = { url: queueUrl };
          else b.url = queueUrl;
          b.text = '🏁 Quick Race';
          return b;
        })();
        soloBtn.text = '🤖 Solo vs Bots';
        inline_keyboard = [[queueBtn], [soloBtn]];
      } else {
        inline_keyboard = [[buildGameButton(game, ctx)]];
      }
      await ctx.reply(
        `${game.emoji} <b>${game.name}</b>\n\n${game.tagline}\n\nTap below to launch.`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard } }
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

  // Phase 4 (2026-06-08): SHOOTOUT /customgame group-only flow.
  // Spawns the wizard message + handles all sg_* callback actions.
  // botUsername is set asynchronously when bot.telegram.getMe()
  // resolves at startup — by the time a real user types /customgame
  // it's populated and the lobby card's Join button can build a
  // proper t.me/?start= deep-link.
  registerShootoutCustomGameCommands(bot, { getBotUsername: () => botUsername });
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
      // Phase 4 (2026-06-08): /customgame spawns a SHOOTOUT lobby
      // wizard in the group chat. Group-only — see customGame/index.js.
      { command: 'customgame',  description: 'Start a SHOOTOUT lobby in this group' },
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
