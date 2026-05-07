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
import { mintLinkToken } from './walletLinkTokens.js';
import { PRESTIGE_TIERS } from './shot-token.js';
import { getOrCreateReferralCode, buildInviteLink, REFERRAL_REWARD_SHOT } from './referrals.js';
import { getChallenge, markAccepted } from './challenge/challenge.js';
import { renderCareerCardPng } from './challenge/renderCareerCard.js';
import { buildCareerProps } from './challenge/careerCardProps.js';
import { WEAPON_DATA } from './physics.js';
import { registerGroupChatCommands } from './groupchat/index.js';

// 2026-05-04: switched off Mini App architecture. URL now points at the
// solshot.gg PWA instead of `t.me/SolShotGG_bot/play`. URL buttons in
// Telegram inline keyboards open external URLs in the in-app browser
// (TG iOS) / default browser (TG Desktop) / new tab (TG Web) — a
// top-level browsing context, NOT a nested Mini App iframe. This
// eliminates the storage-partition class of bugs that broke Dynamic /
// Para / Privy on TG Web. Variable name kept as `MINI_APP_URL` to
// minimise mechanical churn; semantic is now "the URL the bot links to."
// Override via the same `MINI_APP_URL` env var on Render if needed.
// Default uses `www.solshot.gg` (with subdomain), matching the canonical
// Vercel serves AND the @BotFather /setdomain. Telegram's login_url
// button silently rejects messages where the URL host doesn't match the
// registered bot domain — `solshot.gg` vs `www.solshot.gg` are
// considered different. If you ever change the BotFather domain, update
// this default OR the MINI_APP_URL env var on Render to match.
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://www.solshot.gg/';
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

  // Log the launch URL once at boot so a domain-mismatch bug (login_url
  // silently rejected by Telegram) is obvious in Render logs.
  console.log(`[bot] launch URL: ${MINI_APP_URL}`);
  console.log(`[bot] login_url: requires this host to match @BotFather /setdomain exactly`);

  bot.catch((err, ctx) => {
    console.error(`[bot] error handling ${ctx?.updateType}:`, err);
    // Surface login_url-specific errors loudly — these silently drop the
    // user-facing reply, making debugging painful without this log.
    if (String(err?.message || err).toLowerCase().includes('login_url')) {
      console.error(`[bot] LOGIN_URL ERROR: check that MINI_APP_URL host matches @BotFather /setdomain. Current: ${MINI_APP_URL}`);
    }
  });

  return bot;
}

/**
 * Build an inline keyboard with a single "Open Mini App" button.
 *
 * Uses a Telegram-native t.me link so the preview renders the Mini App
 * card (not a generic web link). Same shape across DM and group chats.
 *
 * Previously this also minted a Dynamic auth-token JWT and emitted
 * `web_app:` buttons with `?telegramAuthToken=` in the URL — the
 * Dynamic silent-auth flow. That's been removed because Dynamic's
 * embedded wallet broke on TG Web (frame-ancestors CSP block on
 * nested iframe). Until SolShot picks a wallet path that works
 * cross-surface, the launcher stays simple.
 */
/**
 * Build a launch URL with optional startapp + linkToken query params.
 * Used by both launchKeyboard (single button) and the inline-keyboard
 * builders (multi-button menus like /play).
 */
function buildLaunchUrl(startapp = '', linkToken = null) {
  const params = new URLSearchParams();
  if (startapp) params.set('startapp', startapp);
  if (linkToken) params.set('linkToken', linkToken);
  const qs = params.toString();
  return MINI_APP_URL + (qs ? '?' + qs : '');
}

/**
 * Build a launch button. In private DM context we use Telegram's
 * `login_url` button — the bot signs an auth payload with the user's
 * TG identity into the URL, and Privy detects + auto-signs them in
 * with zero clicks (just a one-tap "Allow @SolShotGG_bot to log you
 * in?" confirmation that's part of TG's native flow). No phone-number
 * entry, no Login Widget popup, no manual email step.
 *
 * In groups (or when ctx isn't available), Telegram rejects login_url
 * — fall back to plain url:. Group users picking 1v1-from-group still
 * get the standard email/Login-Widget flow.
 *
 * Bot domain must be registered with @BotFather /setdomain for
 * login_url to issue auth payloads (already done — solshot.gg).
 */
function launchKeyboard(label, startapp = '', linkToken = null, ctx = null) {
  const url = buildLaunchUrl(startapp, linkToken);
  const isPrivate = ctx?.chat?.type === 'private';
  const button = isPrivate
    ? { text: label, login_url: { url } }
    : { text: label, url };
  return { inline_keyboard: [[button]] };
}

/**
 * Mint a one-shot wallet-link token IF the calling TG user has no wallet
 * binding yet, AND the call is happening in a private DM (never in a
 * group, where the URL would be visible to everyone).
 *
 * Embedded as `?linkToken=` in launch URLs so that when the user opens
 * solshot.gg, the WalletContext useEffect POSTs the token + the wallet
 * Privy provisions back to the server, silently binding the TG id to
 * the wallet. No /link step required.
 *
 * Returns null if:
 *   - No ctx.from.id (shouldn't happen for command handlers but defensive)
 *   - Chat is not private DM (group launch URLs are public)
 *   - User already has walletAddress (binding done; no token needed)
 *   - Lookup fails (fail-soft — never block the launch)
 */
async function mintLinkTokenIfNeeded(ctx) {
  if (!ctx?.from?.id) return null;
  if (ctx?.chat?.type !== 'private') return null;
  try {
    const user = await lookupUserByTelegramId(ctx.from.id);
    if (user?.walletAddress) return null;
    const { token } = mintLinkToken({
      telegramUserId: ctx.from.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
    });
    return token;
  } catch (err) {
    console.warn('[bot] mintLinkTokenIfNeeded failed:', err.message);
    return null;
  }
}

function registerCommands(bot) {
  // /start — fires on first interaction or when user opens via t.me link.
  // The payload (e.g. "/start join_xyz", "/start link") arrives in
  // ctx.startPayload.
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';

    // Deep-link payload "link" — invoked from the orphan-account banner
    // on solshot.gg. Skip the welcome copy, mint a token, send the
    // bind button. Two-tap recovery from anywhere in the app.
    if (payload === 'link') {
      const linkToken = await mintLinkTokenIfNeeded(ctx);
      if (!linkToken) {
        // Already bound — confirm + open menu so the user knows nothing
        // more is needed.
        return ctx.reply(
          '✓ Your wallet is already linked to this Telegram account.\n\nReturn to the match — you should now see your turn.',
          { reply_markup: launchKeyboard('Open SolShot', 'menu', null, ctx) }
        );
      }
      return ctx.reply(
        'Tap below to link your wallet — one tap, signs you in via your existing Privy account, then return to the match.',
        { reply_markup: launchKeyboard('🔗 Link Wallet', '', linkToken, ctx) }
      );
    }

    const linkToken = await mintLinkTokenIfNeeded(ctx);
    await ctx.reply(
      'Welcome to SolShot — artillery duels on Solana.\n\n' +
      'Real money 1v1 matches. 20 weapons. Skill-based wagering.\n\n' +
      'Tap below to launch.',
      { reply_markup: launchKeyboard('🎯 Launch SolShot', payload, linkToken, ctx) }
    );
  });

  // Unified /play mode-picker — surfaces all match types in one place,
  // honoring the "same game, different pacing" principle. Each option is
  // the SAME core game (same Phaser scene, same physics, same career
  // stats) — players just pick the pacing that fits their moment.
  bot.command('play', async (ctx) => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (isGroup) {
      // In a group chat → pitch group-chat mode + show the standalone options
      await ctx.reply(
        '🎯 SolShot — pick your pacing:\n\n' +
        '• Group chat (this group): /customgame to set up an async multi-day match. Up to 10 players, single life, fire one shot per turn.\n' +
        '• 1v1 fast (DM the bot): tap below to open the Mini App lobby — practice or wagered.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🤝 Set up group match', callback_data: 'play_pick_group' },
              { text: '🎯 1v1 fast', url: `${MINI_APP_URL}?startapp=play` },
            ]],
          },
        }
      );
      return;
    }

    // DM context → full mode picker. Same buttons regardless of user state.
    // We mint ONE link token for unbound users and embed it on every launch
    // button. The first tap consumes the token; subsequent taps land at the
    // PWA after binding completes and silently no-op on the bind step.
    const linkToken = await mintLinkTokenIfNeeded(ctx);
    await ctx.reply(
      '🎯 SolShot — pick your pacing:\n\n' +
      '• 1v1 Quick: real-time match in the lobby (practice or wagered).\n' +
      '• vs Shot Bot: solo offline practice — no opponent needed.\n' +
      '• Challenge a friend: create a shareable 1v1 link with your terms.\n' +
      '• Group chat: async multi-day match in any TG group with @SolShotGG_bot — up to 10 players.',
      {
        reply_markup: {
          inline_keyboard: [
            // login_url: → silent Privy auto-sign-in for DM users (Phase 2).
            // This branch only runs when ctx.chat.type === 'private', so
            // login_url is always valid here.
            [{ text: '⚡ 1v1 Quick',          login_url: { url: buildLaunchUrl('play', linkToken) } }],
            [{ text: '🤖 vs Shot Bot',        login_url: { url: buildLaunchUrl('ai-practice', linkToken) } }],
            [{ text: '⚔ Challenge a Friend', login_url: { url: buildLaunchUrl('challenge_new', linkToken) } }],
            [{ text: '👥 Group chat (info)',  callback_data: 'play_pick_group' }],
          ],
        },
      }
    );
  });

  // Callback for when a user taps "Group chat" in the /play mode picker.
  // Show a short explainer; group-chat is set up via /customgame in a TG
  // group, so we can't directly start one from a DM.
  bot.action('play_pick_group', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
      if (isGroup) {
        await ctx.reply(
          '👥 Group chat mode — type /customgame here. Host configures match (free or wagered, 2-10 players, duration), card posts to chat, players join, host starts. Take turns over the next 12h–7d depending on settings.',
          { parse_mode: undefined }
        );
      } else {
        await ctx.reply(
          '👥 Group chat mode runs inside a Telegram group, not in DMs:\n\n' +
          '1. Add @SolShotGG_bot to a group with friends\n' +
          '2. In the group, type /customgame\n' +
          '3. Host configures match settings, friends tap Join\n' +
          '4. Take turns over 12h to 7 days — fire from the Mini App\n\n' +
          'Same game as 1v1, just a longer-form pacing.'
        );
      }
    } catch (err) {
      console.warn('[bot:/play group picker] error:', err.message);
    }
  });

  bot.command('challenge', async (ctx) => {
    await ctx.reply(
      'Create a 1v1 challenge — get a shareable link to send your opponent.',
      { reply_markup: launchKeyboard('Create Challenge', 'challenge_new', null, ctx) }
    );
  });

  bot.command('stats', async (ctx) => {
    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      if (!user || !user.stats || (user.stats.matchesPlayed || 0) === 0) {
        return ctx.reply(
          'No record yet — play your first match to start tracking stats.',
          { reply_markup: launchKeyboard('Find a Match', 'play', null, ctx) }
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
          reply_markup: launchKeyboard('Full Record', 'stats', null, ctx),
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
        reply_markup: launchKeyboard('Full Record', 'stats', null, ctx),
      });
    } catch (err) {
      console.warn('[bot:/stats] error, falling back:', err.message);
      await ctx.reply(
        'Your record, rank, and signature weapon.',
        { reply_markup: launchKeyboard('Open Barracks', 'stats', null, ctx) }
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
    // H055 fix — gate to admin TG IDs only in production.
    // ADMIN_TELEGRAM_IDS env: comma-separated list of allowed numeric TG IDs.
    // In non-production, allow all (dev convenience).
    if (process.env.NODE_ENV === 'production') {
      const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number);
      const callerId = ctx.from?.id;
      if (!callerId || !adminIds.includes(Number(callerId))) {
        return; // Silently ignore non-admin in prod
      }
    }
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
          { reply_markup: launchKeyboard('Find a Match', 'play', null, ctx) }
        );
      }

      const myRank = await getPlayerRank(ctx.from?.id);

      // Format a row inside an HTML <pre> block so Telegram renders it
      // monospace and columns line up. Width budget targets a phone
      // screen comfortably:
      //   rank(3) + handle(14) + W(3) + L(3) + WR(4) ≈ 27 chars.
      // Long handles are softly truncated with an ellipsis ("…") so the
      // column never wraps mid-name. Top 3 get medals in place of the
      // numeric rank for a bit of celebration.
      const HANDLE_W = 14;
      const fmtHandle = (h) => {
        const upper = (h || 'OPERATIVE').toUpperCase();
        if (upper.length <= HANDLE_W) return upper.padEnd(HANDLE_W, ' ');
        return upper.slice(0, HANDLE_W - 1) + '…';
      };
      const fmtRank = (i) => {
        if (i === 0) return '🥇';
        if (i === 1) return '🥈';
        if (i === 2) return '🥉';
        return String(i + 1).padStart(2, ' ') + '.';
      };
      const fmtRow = (rank, p) => {
        const wins = p.stats?.wins || 0;
        const losses = p.stats?.losses || 0;
        const matches = p.stats?.matchesPlayed || 0;
        const wr = matches > 0 ? Math.round((wins / matches) * 100) : 0;
        return `${rank} ${fmtHandle(p.handle)} ${String(wins).padStart(2, ' ')}W ${String(losses).padStart(2, ' ')}L  ${String(wr).padStart(3, ' ')}%`;
      };

      const lines = [];
      lines.push('🏆 <b>SOLSHOT LEADERBOARD</b>');
      lines.push('<pre>');
      top.forEach((p, i) => lines.push(fmtRow(fmtRank(i), p)));
      // If the asker isn't in the top 10, show their rank below
      if (myRank && myRank > 10) {
        const me = await lookupUserByTelegramId(ctx.from?.id);
        if (me?.stats) {
          lines.push(''); // visual gutter inside the pre
          lines.push(fmtRow(`#${String(myRank).padStart(2, ' ')}`, me));
        }
      }
      lines.push('</pre>');

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: launchKeyboard('Full Leaderboard', 'leaderboard', null, ctx),
      });
    } catch (err) {
      console.warn('[bot:/leaderboard] error, falling back:', err.message);
      await ctx.reply(
        'Top players this season.',
        { reply_markup: launchKeyboard('Open Leaderboard', 'leaderboard', null, ctx) }
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

      // Case 1: no record yet — never played. The "Set Up Wallet" button
      // embeds a fresh link token so opening it silently binds the TG id
      // to whatever wallet Privy provisions.
      if (!user) {
        const linkToken = await mintLinkTokenIfNeeded(ctx);
        return ctx.reply(
          `${callsign}\n\nNo wallet yet. Tap below to set up your Solana wallet — required for wagered matches and SHOT.`,
          { reply_markup: launchKeyboard('Set Up Wallet', 'wallet', linkToken, ctx) }
        );
      }

      // Case 2: TG-only user, wallet not yet provisioned (or provisioned but
      // not yet linked to this User doc). The Mini App auto-creates one via
      // Privy on first open — they don't bring an external wallet. Same
      // silent-bind flow via the embedded token.
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
          lines.push('Tap below to set up your Solana wallet — your SHOT and earnings will sync.');
        } else {
          lines.push('Tap below to set up your Solana wallet — needed to receive SHOT and wager SOL.');
        }
        const linkToken = await mintLinkTokenIfNeeded(ctx);
        return ctx.reply(lines.join('\n'), {
          reply_markup: launchKeyboard('Set Up Wallet', 'wallet', linkToken, ctx),
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
        reply_markup: launchKeyboard('Open Wallet', 'wallet', null, ctx),
      });
    } catch (err) {
      console.warn('[bot:/wallet] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Your wallet — balance, deposit, withdraw.',
        { reply_markup: launchKeyboard('Open Wallet', 'wallet', null, ctx) }
      );
    }
  });

  // /link — mint a one-shot magic link that binds this Telegram user to
  // whatever wallet they sign in with on solshot.gg. After Privy provisions
  // their embedded Solana wallet, the PWA POSTs the token + wallet back to
  // the server, which calls linkTelegramIdentity and writes the wallet to
  // their User doc. Required for Privy users to join wagered groupchat
  // matches (handleJoinCallback gates on User.walletAddress).
  //
  // DM-only: a token in a group reply would be visible to everyone. We
  // refuse and instruct the user to DM instead.
  bot.command('link', async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      return ctx.reply(
        'For security, link your wallet in DM with me — not in a group chat.\n\nDM @SolShotGG_bot and run /link there.'
      );
    }
    try {
      const tgId = ctx.from?.id;
      if (!tgId) {
        return ctx.reply('Could not read your Telegram id. Try again.');
      }
      const { token, expiresAt } = mintLinkToken({
        telegramUserId: tgId,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
      });
      const url = `${MINI_APP_URL}?linkToken=${encodeURIComponent(token)}`;
      const minutes = Math.max(1, Math.round((expiresAt - Date.now()) / 60000));
      await ctx.reply(
        `Tap the button below to link your wallet.\n\n` +
        `1. Sign in (or stay signed in) with your email\n` +
        `2. Your Solana wallet auto-connects to your Telegram account\n` +
        `3. You can now join wagered group matches\n\n` +
        `Link expires in ~${minutes} min. Single use.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔗 Link Wallet', url }]],
          },
        }
      );
    } catch (err) {
      console.warn('[bot:/link] failed:', err.message);
      await ctx.reply('Could not generate a link token right now. Try again in a moment.');
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
          { reply_markup: launchKeyboard('Open Armory', 'shop', null, ctx) }
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
        reply_markup: launchKeyboard('Open Armory', 'shop', null, ctx),
      });
    } catch (err) {
      console.warn('[bot:/shop] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Cosmetics, camos, and projectile trails — paid in SHOT.',
        { reply_markup: launchKeyboard('Open Armory', 'shop', null, ctx) }
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
      await ctx.reply(body, { reply_markup: launchKeyboard('Open Prestige', 'prestige', null, ctx) });
    } catch (err) {
      console.warn('[bot:/prestige] lookup failed, falling back:', err.message);
      await ctx.reply(
        'Climb the prestige tiers — Bronze through Diamond. Burn SHOT to advance.',
        { reply_markup: launchKeyboard('Open Prestige', 'prestige', null, ctx) }
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
          { reply_markup: launchKeyboard('Open Arsenal', 'weapons', null, ctx) }
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
        reply_markup: launchKeyboard('Open Arsenal', 'weapons', null, ctx),
      });
    } catch (err) {
      console.warn('[bot:/weapons] lookup failed, falling back:', err.message);
      await ctx.reply(
        '20 weapons across 6 tiers — single shot to nuclear pineapple. Browse the arsenal.',
        { reply_markup: launchKeyboard('Open Arsenal', 'weapons', null, ctx) }
      );
    }
  });

  bot.command('help', async (ctx) => {
    // Smart reply: stitches the user's current state onto the canned help
    // text — current tier + suggested next action. New users see the full
    // intro; returning users get a personalised next-step nudge.
    let next = null;
    let tierLine = null;
    let cta = '🎯 Launch SolShot';
    let ctaParam = '';

    // MarkdownV2 escape: any of `_*[]()~`>#+-=|{}.!\\` in user-controlled
    // text (callsigns, dynamic next-step strings, etc.) MUST be escaped or
    // Telegram returns 400. Specifically a `_` inside a `*bold*` group
    // breaks bold-pair matching and crashes parse with "Can't find end
    // of Bold entity" — which is what JJ saw with callsign `JJ_ME`.
    const mdv2Escape = (s) => String(s ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');

    try {
      const user = await lookupUserByTelegramId(ctx.from?.id);
      if (user) {
        const tierIdx = user.stats?.prestigeTier || 0;
        const tier = (PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0]).name.toUpperCase();
        const callsign = (user.handle || ctx.from?.first_name || 'OPERATIVE').toUpperCase();
        const matches = user.stats?.matchesPlayed || 0;
        const wins = user.stats?.wins || 0;
        // Escape callsign + tier — both come from user data and may
        // contain MarkdownV2 specials. Static text around them is
        // hand-escaped below.
        tierLine = `You: *${mdv2Escape(callsign)}* · ${mdv2Escape(tier)} · ${wins}W / ${matches}M`;

        // Suggest a next action based on state. The `next` string is
        // mdv2-escaped at render time below — no need to escape here.
        if (matches === 0) {
          next = 'Tap Play below to start your first match';
          cta = '▶ Play first match';
          ctaParam = 'play';
        } else if ((user.stats?.shotBalance || 0) >= 200 && tierIdx === 0) {
          next = 'You have enough SHOT to unlock BRONZE. Open Prestige to burn';
          cta = '🏆 Open Prestige';
          ctaParam = 'prestige';
        } else if (matches > 0 && wins === 0) {
          next = "Try /weapons to see your loadout — pick a weapon you haven't used yet";
          cta = '▶ Find a Match';
          ctaParam = 'play';
        } else if (matches >= 5 && (user.referralsMade || 0) === 0) {
          next = 'Try /refer — both you and your friend earn 25 SHOT on their first wagered match';
          cta = '🤝 Get invite link';
          ctaParam = 'refer';
        } else {
          next = 'Try /stats for your career card or /leaderboard for the top 10';
          cta = '🎯 Launch SolShot';
        }
      }
    } catch (err) {
      console.warn('[bot:/help] state lookup failed, falling back to generic:', err.message);
    }

    // Build with mdv2Escape on user text. Static markdown (`*…*`,
    // numbered list, etc.) keeps its bold/italic/escape-chars by hand.
    const lines = ['*SolShot* — artillery duels on Solana\\.', ''];
    if (tierLine) lines.push(tierLine, '');
    lines.push('*Quick start:*');
    lines.push('1\\. Tap Play to find a match');
    lines.push('2\\. Pick weapons in the shop');
    lines.push('3\\. Take turns shooting — winner takes the pot');
    lines.push('');
    if (next) {
      lines.push('*Next:* ' + mdv2Escape(next), '');
    }
    lines.push('*Practice mode is free*\\. Wagered modes pay out in SOL\\.');
    lines.push('*Prestige* unlocks tiers from Bronze → Diamond\\.');
    lines.push('*SHOT token* powers cosmetics and prestige burns\\.');
    lines.push('');
    lines.push('Commands: /play /stats /wallet /weapons /shop /prestige /leaderboard /refer /challenge /customgame');
    lines.push('');
    lines.push('Web: solshot\\.gg \\| X: @SolShotGG');

    try {
      await ctx.replyWithMarkdownV2(lines.join('\n'), {
        reply_markup: launchKeyboard(cta, ctaParam, null, ctx),
      });
    } catch (err) {
      // MarkdownV2 escaping bug? Fall back to plain.
      console.warn('[bot:/help] markdown send failed, plain fallback:', err.message);
      await ctx.reply(
        'SolShot — artillery duels on Solana.\n\n' +
        'Practice mode is free. Wagered modes pay out in SOL.\n' +
        'Web: solshot.gg | X: @SolShotGG',
        { reply_markup: launchKeyboard('Launch SolShot', '', null, ctx) }
      );
    }
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
          { reply_markup: launchKeyboard('Open SolShot', '', null, ctx) }
        );
      }
      const url = buildInviteLink(code);
      const reply =
        `Your personal invite link:\n\n` +
        `${url}\n\n` +
        `When a friend taps it AND finishes their first wagered match, you both ` +
        `earn ${REFERRAL_REWARD_SHOT} SHOT.\n\n` +
        `Code: ${code}`;
      // /refer launcher button — login_url: in DM for silent Privy auto
      // sign-in, fall back to url: in groups (TG rejects login_url there).
      const isPrivate = ctx?.chat?.type === 'private';
      const launchBtn = isPrivate
        ? { text: 'Open SolShot', login_url: { url: MINI_APP_URL } }
        : { text: 'Open SolShot', url: MINI_APP_URL };
      await ctx.reply(reply, {
        reply_markup: {
          inline_keyboard: [[
            { text: '⚔ Send Invite', switch_inline_query: `rf_${code}` },
            launchBtn,
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
      { reply_markup: launchKeyboard('Open Settings', 'settings', null, ctx) }
    );
  });

  // /mygames — open the multi-match home screen showing every group-chat
  // match the user is currently in across all chats. Useful when a user
  // is in 3+ groups and wants a single place to check who's waiting on them.
  bot.command('mygames', async (ctx) => {
    await ctx.reply(
      'See every group match you\'re in — across every chat. Tap below to open.',
      { reply_markup: launchKeyboard('Open My Games', 'mygames', null, ctx) }
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
  // Inline mode currently uses `url` buttons (deep link to Mini App) so
  // accept/decline are placeholder for future callback_data buttons.
  //
  // CRITICAL: only handles accept:/decline: prefixes. Anything else falls
  // through to `next()` so downstream `bot.action(/^gc_/)` handlers
  // registered by registerGroupChatCommands() can fire. Without this,
  // every group-chat callback (Free/Wagered, Join/Leave, Start/Cancel,
  // wizard step buttons) gets swallowed silently.
  bot.on('callback_query', async (ctx, next) => {
    try {
      const data = ctx.callbackQuery?.data || '';
      if (data.startsWith('decline:')) {
        const shortCode = data.slice('decline:'.length);
        await ctx.answerCbQuery('Challenge declined.');
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
      // Not ours — pass to next middleware (group-chat actions etc.)
      return next();
    } catch (err) {
      console.error('[bot] callback_query error:', err);
      try { await ctx.answerCbQuery('Something went wrong.', { show_alert: true }); } catch { /* */ }
    }
  });

  // Group-chat mode commands (/customgame, /startmatch, /cancelmatch + their callbacks).
  // Registers commands + callback_query handlers on the same bot instance.
  registerGroupChatCommands(bot);
}

/**
 * Production mode: register webhook with Telegram and mount it on Express.
 * Returns true if webhook was set up, false if falling back to long polling.
 */
/**
 * Register slash-command autocomplete with Telegram. Different command
 * sets per scope so DM users see DM-relevant commands and group admins
 * see group-management commands. Telegram clients show these in the
 * "/" autocomplete menu.
 *
 * Idempotent — safe to call on every server boot. Commands appear in
 * Telegram clients within seconds of this call.
 */
async function registerBotCommands() {
  if (!bot) return;
  try {
    // Default scope — visible in 1:1 DMs and any chat without a more
    // specific scope set.
    await bot.telegram.setMyCommands([
      { command: 'play',        description: 'Pick a game mode (1v1, AI, challenge)' },
      { command: 'stats',       description: 'View your career card' },
      { command: 'wallet',      description: 'View your wallet + balance' },
      { command: 'weapons',     description: 'Browse the weapon arsenal' },
      { command: 'shop',        description: 'Open the cosmetic shop' },
      { command: 'prestige',    description: 'Prestige + tier progression' },
      { command: 'leaderboard', description: 'Top 10 players' },
      { command: 'refer',       description: 'Get your invite link' },
      { command: 'challenge',   description: 'Challenge a specific player' },
      { command: 'mygames',     description: 'List your active group matches' },
      { command: 'help',        description: 'Show help + commands' },
    ], { scope: { type: 'default' } });

    // Group-chat scope — overrides the default in groups. Surfaces the
    // group-specific commands (customgame/cancelmatch/startmatch) so
    // hosts can tap them from the / menu instead of typing manually.
    await bot.telegram.setMyCommands([
      { command: 'customgame',  description: 'Set up a group match (host)' },
      { command: 'startmatch',  description: 'Start a full group match (host)' },
      { command: 'cancelmatch', description: 'Cancel the current group match (host)' },
      { command: 'play',        description: 'Quick info — 1v1 from any chat' },
      { command: 'mygames',     description: 'List your active group matches' },
      { command: 'help',        description: 'Show help + commands' },
    ], { scope: { type: 'all_group_chats' } });

    console.log('[bot] slash commands registered (default + all_group_chats scopes)');
  } catch (err) {
    console.warn('[bot] setMyCommands failed (non-fatal):', err.message);
  }
}

export async function setupBotWebhook(app) {
  if (!bot) return false;

  // Push command autocomplete to Telegram on every boot. Cheap (1-2
  // API calls) and ensures the slash menu always reflects current
  // command set. Don't await failures — non-fatal.
  registerBotCommands().catch(() => {});

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
