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
import { lookupUserByTelegramId, getTopPlayers, getPlayerRank } from './users.js';
import { PRESTIGE_TIERS } from './shot-token.js';
import { getOrCreateReferralCode, buildInviteLink, REFERRAL_REWARD_SHOT } from './referrals.js';
import { getChallenge, markAccepted } from './challenge/challenge.js';
import { renderCareerCardPng } from './challenge/renderCareerCard.js';
import { buildCareerProps } from './challenge/careerCardProps.js';
import { WEAPON_DATA } from './physics.js';

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
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      if (!user || !user.stats || (user.stats.matchesPlayed || 0) === 0) {
        return ctx.reply(
          'No record yet — play your first match to start tracking stats.',
          { reply_markup: launchKeyboard('Find a Match', 'play') }
        );
      }

      // Build career card props from the User doc + leaderboard rank
      const rank = await getPlayerRank(ctx.from?.id);
      const props = buildCareerProps(user, { rank, telegramUserId: ctx.from?.id });

      // Render the image. Best-effort — fall back to text if Satori chokes.
      let png = null;
      try {
        png = await renderCareerCardPng(props);
      } catch (renderErr) {
        console.warn('[bot:/stats] career card render failed:', renderErr.message);
      }

      if (png) {
        const tierName = (PRESTIGE_TIERS[user.stats.prestigeTier || 0] || PRESTIGE_TIERS[0]).name.toUpperCase();
        const caption = `${props.callsign} · ${tierName}${rank ? ` · #${rank}` : ''}`;
        return ctx.replyWithPhoto({ source: png }, {
          caption,
          reply_markup: launchKeyboard('Full Record', 'stats'),
        });
      }

      // Fallback: text reply (same shape as before, less the formatting fluff)
      const fmtDmg = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
      const lines = [
        `${props.callsign}${rank ? ` · #${rank}` : ''}`,
        '',
        `${props.record.wins}W · ${props.record.losses}L · ${props.record.winRate}% win rate`,
        `${fmtDmg(props.totalDamage)} damage · ${props.kills} kills`,
      ];
      await ctx.reply(lines.join('\n'), {
        reply_markup: launchKeyboard('Full Record', 'stats'),
      });
    } catch (err) {
      console.warn('[bot:/stats] error, falling back:', err.message);
      await ctx.reply(
        'Your record, rank, and signature weapon.',
        { reply_markup: launchKeyboard('Open Barracks', 'stats') }
      );
    }
  });

  /**
   * Debug command — preview the career card without needing a played match.
   * Uses sample stats but the asker's real callsign + tg id so the registry
   * id and "joined" fields look plausible. Three presets via the suffix:
   *   /teststats           → strong (Platinum, 89W-22L)
   *   /teststats mid       → mid (Bronze, 14W-11L)
   *   /teststats fresh     → fresh (Unranked, [CLASSIFIED] plate)
   * Safe to leave in prod — it never reads or writes the DB.
   */
  bot.command('teststats', async (ctx) => {
    const PRESETS = {
      strong: {
        tierName: 'PLATINUM', rank: 7,
        record: { wins: 89, losses: 22, winRate: 80 },
        totalDamage: 187400, kills: 312, deaths: 178,
        streak: { current: 11, best: 14 },
        mvpWeapon: { name: 'CRAZY IVAN', damage: 38400 },
        matchesPlayed: 111, joinedLabel: 'JOINED FEB 2026',
        recentForm: ['W','W','L','W','W','W','W','L','W','W'],
      },
      mid: {
        tierName: 'BRONZE', rank: 47,
        record: { wins: 14, losses: 11, winRate: 56 },
        totalDamage: 22300, kills: 38, deaths: 41,
        streak: { current: 0, best: 5 },
        mvpWeapon: { name: 'HEATSEEKER', damage: 6800 },
        matchesPlayed: 25, joinedLabel: 'JOINED MAR 2026',
        recentForm: ['L','W','W','L','W','L','L','W','W','L'],
      },
      fresh: {
        tierName: 'NONE', rank: null,
        record: { wins: 1, losses: 2, winRate: 33 },
        totalDamage: 412, kills: 2, deaths: 4,
        streak: { current: 0, best: 1 },
        mvpWeapon: { name: 'STANDARD', damage: 412 },
        matchesPlayed: 3, joinedLabel: 'JOINED THIS WEEK',
        recentForm: ['W','L','L'],
      },
      // v2 stress tests — exercise the auto-fit ladders end-to-end
      longname: {
        tierName: 'GOLD', rank: 12,
        record: { wins: 56, losses: 31, winRate: 64 },
        totalDamage: 89200, kills: 178, deaths: 142,
        streak: { current: 3, best: 9 },
        mvpWeapon: { name: 'HOMING MISSILE', damage: 24800 }, // 14 chars — prestige reward
        matchesPlayed: 87, joinedLabel: 'JOINED FEB 2026',
        recentForm: ['W','L','W','W','W','L','W','L','W','W'],
      },
      maxlen: {
        tierName: 'DIAMOND', rank: 1,
        record: { wins: 999, losses: 999, winRate: 50 },
        totalDamage: 1234567, kills: 9999, deaths: 9999, // worst-case K/D widths
        streak: { current: 25, best: 25 },
        mvpWeapon: { name: 'CHAIN REACTION', damage: 999999 }, // 14 chars
        matchesPlayed: 1998, joinedLabel: 'JOINED JAN 2026',
        recentForm: ['W','W','W','W','W','W','W','W','W','W'],
      },
    };
    try {
      const arg = (ctx.message?.text || '').split(/\s+/)[1]?.toLowerCase();
      const preset = PRESETS[arg] || PRESETS.strong;

      const callsign = (ctx.from?.first_name || ctx.from?.username || 'OPERATIVE')
        .toUpperCase().slice(0, 14);
      const registryId = String(ctx.from?.id || '0000').slice(-4).padStart(4, '0').toUpperCase();

      const props = { callsign, registryId, ...preset };
      const png = await renderCareerCardPng(props);
      await ctx.replyWithPhoto({ source: png }, {
        caption: `[PREVIEW] ${callsign} · ${preset.tierName === 'NONE' ? 'UNRANKED' : preset.tierName}`,
      });
    } catch (err) {
      console.warn('[bot:/teststats] error:', err.message);
      await ctx.reply(`Preview failed: ${err.message}`);
    }
  });

  bot.command('leaderboard', async (ctx) => {
    try {
      const top = await getTopPlayers(10);
      if (!top.length) {
        return ctx.reply(
          'No players ranked yet — be the first.',
          { reply_markup: launchKeyboard('Find a Match', 'play') }
        );
      }

      const myRank = await getPlayerRank(ctx.from?.id);
      const lines = ['🏆 SOLSHOT LEADERBOARD', ''];
      top.forEach((p, i) => {
        const handle = (p.handle || 'OPERATIVE').toUpperCase().padEnd(12, ' ').slice(0, 12);
        const wins   = p.stats?.wins || 0;
        const losses = p.stats?.losses || 0;
        const matches = p.stats?.matchesPlayed || 0;
        const wr = matches > 0 ? Math.round((wins / matches) * 100) : 0;
        lines.push(`${String(i + 1).padStart(2, ' ')}. ${handle}  ${wins}W·${losses}L · ${wr}%`);
      });

      // If the asker isn't in the top 10, show their rank below
      if (myRank && myRank > 10) {
        const me = await lookupUserByTelegramId(ctx.from?.id);
        if (me?.stats) {
          const wins   = me.stats.wins || 0;
          const losses = me.stats.losses || 0;
          const matches = me.stats.matchesPlayed || 0;
          const wr = matches > 0 ? Math.round((wins / matches) * 100) : 0;
          lines.push('');
          lines.push(`→ You · #${myRank} · ${wins}W·${losses}L · ${wr}%`);
        }
      }

      await ctx.reply(lines.join('\n'), {
        reply_markup: launchKeyboard('Full Leaderboard', 'leaderboard'),
      });
    } catch (err) {
      console.warn('[bot:/leaderboard] error, falling back:', err.message);
      await ctx.reply(
        'Top players this season.',
        { reply_markup: launchKeyboard('Open Leaderboard', 'leaderboard') }
      );
    }
  });

  bot.command('wallet', async (ctx) => {
    // Smart reply: show wallet address + balances + prestige progress.
    // For TG users without a wallet yet, prompts them to open the Mini App
    // where Dynamic generates an embedded Solana wallet automatically — no
    // Phantom/Solflare connection step. Wording deliberately avoids "connect"
    // because that implies linking an external wallet (which we don't do for
    // TG users anymore). Once Dynamic ships on main, this same reply lights
    // up with real on-chain balances — the surface area is ready.
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      const callsign = (user?.handle || ctx.from?.first_name || 'OPERATIVE').toUpperCase();

      // Case 1: no record yet — never played
      if (!user) {
        return ctx.reply(
          `${callsign}\n\nNo wallet yet. Open the Mini App and your Solana wallet is set up automatically — required for wagered matches and SHOT.`,
          { reply_markup: launchKeyboard('Set Up Wallet', 'wallet') }
        );
      }

      // Case 2: TG-only user, wallet not yet provisioned (or provisioned but
      // not yet linked to this User doc). The Mini App auto-creates one via
      // Dynamic on first open — they don't bring an external wallet.
      if (!user.walletAddress) {
        const tierIdx = user.stats?.prestigeTier || 0;
        const tierName = (PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0]).name.toUpperCase();
        const inGameShot = user.stats?.shotBalance || 0;

        const lines = [
          `${callsign} · ${tierName}`,
          '',
          'WALLET: not yet set up',
        ];
        if (inGameShot > 0) {
          lines.push(`In-game SHOT: ${inGameShot.toLocaleString()}`);
          lines.push('Open the Mini App to set up your wallet — your SHOT and earnings will sync.');
        } else {
          lines.push('Open the Mini App to set up your Solana wallet — needed to receive SHOT and wager SOL.');
        }
        return ctx.reply(lines.join('\n'), {
          reply_markup: launchKeyboard('Set Up Wallet', 'wallet'),
        });
      }

      // Case 3: wallet connected — show full ledger
      const tierIdx = user.stats?.prestigeTier || 0;
      const current = PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0];
      const next    = PRESTIGE_TIERS[tierIdx + 1] || null;
      const tierName = current.name.toUpperCase();

      const wAddr = user.walletAddress;
      const wShort = `${wAddr.slice(0, 4)}...${wAddr.slice(-4)}`;
      const shot = user.stats?.shotBalance || 0;
      const burned = user.stats?.totalBurned || user.stats?.shotBurned || 0;
      const solWon = user.stats?.totalSolWon || 0;
      const solLost = user.stats?.totalSolLost || 0;
      const solNet = solWon - solLost;
      const solSign = solNet >= 0 ? '+' : '−';

      const lines = [
        `${callsign} · ${tierName}`,
        '',
        `WALLET: ${wShort}`,
        `SHOT: ${shot.toLocaleString()}`,
      ];
      if (solWon > 0 || solLost > 0) {
        lines.push(`SOL TRACKED: ${solSign}${Math.abs(solNet).toFixed(3)} (won ${solWon.toFixed(3)} / lost ${solLost.toFixed(3)})`);
      }
      if (burned > 0) {
        lines.push(`PRESTIGE BURNED: ${burned.toLocaleString()} SHOT`);
      }
      if (next) {
        const remaining = Math.max(0, next.burnCost - burned);
        lines.push('');
        lines.push(`Next tier: ${next.name.toUpperCase()} · ${remaining.toLocaleString()} SHOT to go`);
      }

      await ctx.reply(lines.join('\n'), {
        reply_markup: launchKeyboard('Open Wallet', 'wallet'),
      });
    } catch (err) {
      console.warn('[bot:/wallet] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Your wallet — balance, deposit, withdraw.',
        { reply_markup: launchKeyboard('Open Wallet', 'wallet') }
      );
    }
  });

  bot.command('shop', async (ctx) => {
    // Smart reply: shows user's SHOT balance + cosmetics owned + total available.
    // The full catalog (28 items) lives client-side in data/tiers.js — we don't
    // mirror it server-side to avoid drift. The 28 figure is hardcoded here as
    // the only "duplicated" knowledge — keep in sync with COSMETIC_ITEMS.length.
    const TOTAL_COSMETICS = 28;
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      if (!user) {
        return ctx.reply(
          `Cosmetics, camos, and projectile trails — paid in SHOT.\n\n${TOTAL_COSMETICS} items in the Armory. Open the Mini App to browse.`,
          { reply_markup: launchKeyboard('Open Armory', 'shop') }
        );
      }

      const callsign = (user.handle || ctx.from?.first_name || 'OPERATIVE').toUpperCase();
      const shotBalance = user.stats?.shotBalance || 0;
      const owned = Array.isArray(user.cosmetics?.owned) ? user.cosmetics.owned.length : 0;

      const lines = [`${callsign} · ARMORY`];
      lines.push('');
      lines.push(`SHOT BALANCE: ${shotBalance.toLocaleString()}`);
      lines.push(`COSMETICS OWNED: ${owned} / ${TOTAL_COSMETICS}`);
      if (shotBalance >= 50 && owned < TOTAL_COSMETICS) {
        lines.push('');
        lines.push('Patterns from 50 SHOT, trails from 75 SHOT, kill effects from 100 SHOT.');
      } else if (owned === 0) {
        lines.push('');
        lines.push('Earn SHOT in matches to unlock your first cosmetic.');
      }

      await ctx.reply(lines.join('\n'), {
        reply_markup: launchKeyboard('Open Armory', 'shop'),
      });
    } catch (err) {
      console.warn('[bot:/shop] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Cosmetics, camos, and projectile trails — paid in SHOT.',
        { reply_markup: launchKeyboard('Open Armory', 'shop') }
      );
    }
  });

  bot.command('prestige', async (ctx) => {
    // Smart reply: look up the user's current tier from DB and show
    // their position + next milestone. Falls back to generic launcher
    // if no User record exists yet (i.e. they've never played).
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      const currentTier = user?.stats?.prestigeTier ?? 0;
      const burnedTotal = user?.stats?.totalBurned ?? user?.stats?.shotBurned ?? 0;
      const callsign    = user?.handle || ctx.from?.first_name || 'OPERATIVE';
      const current     = PRESTIGE_TIERS[currentTier] || PRESTIGE_TIERS[0];
      const next        = PRESTIGE_TIERS[currentTier + 1] || null;

      let body;
      if (!user) {
        body =
          'Prestige tiers — Bronze → Diamond. Burn SHOT to climb.\n\n' +
          'Play your first match to start tracking — open the Mini App below.';
      } else if (next) {
        body =
          `${callsign} · current tier: ${current.name.toUpperCase()}\n\n` +
          `Next: ${next.name.toUpperCase()} — burn ${next.burnCost.toLocaleString()} SHOT\n` +
          `Total burned to date: ${burnedTotal.toLocaleString()} SHOT`;
      } else {
        body =
          `${callsign} · current tier: ${current.name.toUpperCase()} ✦\n\n` +
          'You have reached the maximum prestige tier. Honoured.\n' +
          `Total burned: ${burnedTotal.toLocaleString()} SHOT`;
      }
      await ctx.reply(body, { reply_markup: launchKeyboard('Open Prestige', 'prestige') });
    } catch (err) {
      console.warn('[bot:/prestige] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Climb the prestige tiers — Bronze through Diamond. Burn SHOT to advance.',
        { reply_markup: launchKeyboard('Open Prestige', 'prestige') }
      );
    }
  });

  bot.command('weapons', async (ctx) => {
    // Smart reply: shows the user's MVP weapon, total shots fired, prestige
    // weapons they've unlocked, and a teaser for the next prestige unlock.
    // Falls back to a generic launcher if no record exists yet.
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      if (!user || !user.stats || (user.stats.matchesPlayed || 0) === 0) {
        return ctx.reply(
          '20 weapons across 6 tiers — single shot to nuclear pineapple. Play your first match to start tracking.',
          { reply_markup: launchKeyboard('Open Arsenal', 'weapons') }
        );
      }

      const s = user.stats;
      const callsign = (user.handle || ctx.from?.first_name || 'OPERATIVE').toUpperCase();
      const tierIdx = s.prestigeTier || 0;
      const current = PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0];
      const next    = PRESTIGE_TIERS[tierIdx + 1] || null;

      // Compute MVP weapon from per-weapon damage map
      let mvpName = null;
      let mvpDmg = 0;
      let totalShots = 0;
      const weaponStats = s.weaponStats;
      if (weaponStats && typeof weaponStats === 'object') {
        for (const [id, st] of Object.entries(weaponStats)) {
          const dmg = Number(st?.damageDealt) || 0;
          totalShots += Number(st?.shotsFired) || 0;
          if (dmg > mvpDmg) {
            mvpDmg = dmg;
            const wep = WEAPON_DATA[Number(id)];
            mvpName = wep?.name || null;
          }
        }
      }

      // Resolve prestige weapon names from PRESTIGE_TIERS
      const unlockedPrestigeWeapons = PRESTIGE_TIERS
        .filter(t => t.tier > 0 && t.tier <= tierIdx)
        .flatMap(t => t.weapons.map(wid => WEAPON_DATA[wid]?.name).filter(Boolean));

      const lines = [`${callsign} · ${current.name.toUpperCase()}`];
      lines.push('');
      if (mvpName) {
        const fmtDmg = mvpDmg >= 1000 ? `${(mvpDmg / 1000).toFixed(1)}K` : String(mvpDmg);
        lines.push(`MVP: ${mvpName.toUpperCase()} · ${fmtDmg} HP`);
      }
      if (totalShots > 0) {
        lines.push(`Total shots fired: ${totalShots.toLocaleString()}`);
      }
      if (unlockedPrestigeWeapons.length > 0) {
        lines.push('');
        lines.push(`Prestige unlocked: ${unlockedPrestigeWeapons.join(', ').toUpperCase()}`);
      }
      if (next && next.weapons.length > 0) {
        const nextWepNames = next.weapons.map(wid => WEAPON_DATA[wid]?.name).filter(Boolean);
        lines.push('');
        lines.push(`Next unlock: ${nextWepNames.join(', ').toUpperCase()} at ${next.name.toUpperCase()}`);
      }

      await ctx.reply(lines.join('\n'), {
        reply_markup: launchKeyboard('Open Arsenal', 'weapons'),
      });
    } catch (err) {
      console.warn('[bot:/weapons] lookup failed, falling back:', err.message);
      await ctx.reply(
        '20 weapons across 6 tiers — single shot to nuclear pineapple. Browse the arsenal.',
        { reply_markup: launchKeyboard('Open Arsenal', 'weapons') }
      );
    }
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

  // /refer — get your personal invite link. Both you and the friend you
  // invite earn 25 SHOT each when they finish their first wagered match.
  bot.command('refer', async (ctx) => {
    try {
      const tgId = ctx.from?.id;
      if (!tgId) {
        return ctx.reply('Could not identify your account. Open the Mini App once and try again.');
      }
      const code = await getOrCreateReferralCode({ telegramUserId: tgId });
      if (!code) {
        return ctx.reply(
          'Open SolShot once to start tracking your account, then try /refer again.',
          { reply_markup: launchKeyboard('Open SolShot', '') }
        );
      }
      const url = buildInviteLink(code);
      const reply =
        `Your personal invite link:\n\n` +
        `${url}\n\n` +
        `When a friend taps it AND finishes their first wagered match, you both ` +
        `earn ${REFERRAL_REWARD_SHOT} SHOT.\n\n` +
        `Code: ${code}`;
      await ctx.reply(reply, {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚔ Send Invite', switch_inline_query: `rf_${code}` },
            { text: 'Open SolShot', url: `${MINI_APP_URL}` },
          ]],
        },
      });
    } catch (err) {
      console.warn('[bot:/refer] error:', err.message);
      await ctx.reply('Could not fetch your invite link right now. Try again in a moment.');
    }
  });

  // /settings — preferences (alert mute, notification cadence, etc.)
  // V1: text + Mini App launcher. Full preferences UI lands with Phase 5
  // group-chat mode where mute toggles actually matter for chat-broadcast cadence.
  bot.command('settings', async (ctx) => {
    await ctx.reply(
      'Preferences (more options coming with group-chat mode):\n\n' +
      '• Move alert mute / unmute\n' +
      '• Turn-deadline reminders\n' +
      '• Daily digest opt-in\n\n' +
      'For now, manage your callsign + wallet in the Mini App.',
      { reply_markup: launchKeyboard('Open Settings', 'settings') }
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

      // Stats share — sender's own career card. We use ctx.from.id as the
      // source of truth (NOT the query payload), so users can only share
      // their own stats, never someone else's.
      if (query.startsWith('stats')) {
        const tgId = ctx.from?.id;
        if (!tgId) return ctx.answerInlineQuery([], { cache_time: 1 });

        const user = await lookupUserByTelegramId(tgId);
        if (!user) {
          // No record yet — show a single result that pushes them to play
          return ctx.answerInlineQuery([{
            type: 'article',
            id: `stats-noop-${tgId}`,
            title: 'No stats yet',
            description: 'Play your first match to unlock your operative file.',
            input_message_content: { message_text: `Just discovered SolShot — going to play my first match. ${MINI_APP_URL}?startapp=play` },
          }], { cache_time: 1, is_personal: true });
        }

        const cardUrl = `${SERVER_BASE_URL.replace(/\/$/, '')}/api/stats/${tgId}/card.png`;
        const playDeepLink = `${MINI_APP_URL}?startapp=play`;
        const callsign = (user.handle || 'OPERATIVE').toUpperCase().slice(0, 12);
        const tierIdx  = user.stats?.prestigeTier || 0;
        const tierName = (PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0]).name.toUpperCase();
        const wins   = user.stats?.wins || 0;
        const losses = user.stats?.losses || 0;

        return ctx.answerInlineQuery([{
          type: 'photo',
          id: `stats-${tgId}`,
          photo_url: cardUrl,
          thumbnail_url: cardUrl,
          photo_width: 1080,
          photo_height: 608,
          title: `${callsign} · ${tierName}`,
          description: `${wins}W – ${losses}L · operative file`,
          caption: `${callsign} · ${tierName} · ${wins}W – ${losses}L`,
          reply_markup: {
            inline_keyboard: [[
              { text: '⚔ Challenge me', url: `${MINI_APP_URL}?startapp=challenge_new` },
              { text: 'Find a Match',   url: playDeepLink },
            ]],
          },
        }], { cache_time: 1, is_personal: true });
      }

      // Challenge share — original flow
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

/**
 * Direct access to the Telegraf instance for callers that need to send
 * unsolicited messages (e.g. post-match victory DM). Returns null if the
 * bot isn't initialised (TELEGRAM_BOT_TOKEN missing).
 */
export function getBot() {
  return bot;
}
