# The Arcade Bot — `@TheArcadeGG_Bot`

**Built:** 15 May 2026
**Owner:** JJ
**Companion to:** `@SolShotGG_bot` (game-specific, hackathon entry — unchanged)

A second Telegram bot that runs alongside the existing SolShot bot. Acts as a **multi-game launcher**: `/games` lists every game we ship, `/<slug>` launches each one.

---

## What it does today

Commands (all visible in TG's `/` autocomplete):

| Command | Effect |
|---|---|
| `/start` | Welcome message + per-game launch buttons |
| `/games` | List all games with tagline + launch buttons |
| `/solshot` | Launch SolShot at `https://www.solshot.gg/` (silent Privy auth in DM) |
| `/basketball` | Launch Basketball Hoops at `https://solshot-basketball.vercel.app/` (plain URL — different domain) |
| `/help` | Show all commands + support contacts |

Plain-text messages in DM trigger the game picker (catch-all fallback) so users can't get stuck.

---

## Architecture

```
                          ┌──────────────────────────────┐
                          │  server/index.js             │
                          │  (single Express process)    │
                          └──────────┬───────────────────┘
                                     │ initBot() + initArcadeBot()
                                     │ setupBotWebhook() + setupArcadeBotWebhook()
                                     ▼
            ┌────────────────────────┴────────────────────────┐
            │                                                 │
            ▼                                                 ▼
   ┌──────────────────┐                            ┌──────────────────────┐
   │ @SolShotGG_bot   │                            │ @TheArcadeGG_Bot     │
   │ (Telegraf #1)    │                            │ (Telegraf #2)        │
   │                  │                            │                      │
   │ /play /stats ... │                            │ /games               │
   │ Group-chat match │                            │ /solshot /basketball │
   │ Challenge cards  │                            │ /help                │
   └──────────────────┘                            └──────────────────────┘
        │                                                       │
        │ token:                                                │ token:
        │ TELEGRAM_BOT_TOKEN                                    │ ARCADE_BOT_TOKEN
        │ webhook:                                              │ webhook:
        │ /api/telegram-webhook                                 │ /api/arcade-webhook
        ▼                                                       ▼
   solshot.gg gameplay                                  Each game's deployed URL
```

- **Single process, two Telegraf instances.** Both bots share Mongo (`users` collection — TG id ↔ wallet binding works across both).
- **Separate tokens.** Compromise of one bot doesn't affect the other.
- **Separate webhook paths** (`/api/telegram-webhook` vs `/api/arcade-webhook`) so they don't steal each other's updates.
- **Same long-poll fallback** in dev when `TELEGRAM_WEBHOOK_URL` isn't set.

---

## Adding a new game

One-step. Open [`server/services/arcadeBot.js`](../../server/services/arcadeBot.js), find the `GAMES` array, append:

```js
{
  slug: 'football',                                     // /football command
  name: 'Football Free Kicks',
  emoji: '⚽',
  tagline: 'Curl it over the wall. Best of 5 kicks.',
  url: 'https://solshot-football.vercel.app/',
  supportsLoginUrl: false,  // true if URL host = BotFather /setdomain
},
```

Bot will:
- Register `/football` command at next boot
- Include it in `/games` listing
- Add it to the slash-command autocomplete via `setMyCommands`
- Surface it in the `/start` welcome keyboard

No other edits required.

---

## Domain / login_url constraint

Telegram only allows **ONE domain per bot** for `login_url` buttons (silent sign-in via TG identity).

- BotFather setting (`/setdomain @TheArcadeGG_Bot`): `solshot.gg`
- Games hosted on `solshot.gg` get `supportsLoginUrl: true` → silent Privy auth in DM
- Games on other hosts (`solshot-basketball.vercel.app`, future Vercel deploys) get `supportsLoginUrl: false` → plain `url:` button, user signs in inside the game

If we later host basketball at `basketball.solshot.gg`, flip its `supportsLoginUrl` to `true` and silent auth works there too.

---

## Env vars

```
ARCADE_BOT_TOKEN          required. From @BotFather (issued 15 May 2026).
TELEGRAM_WEBHOOK_URL      shared with SolShot bot — server base URL.
                          If unset → long polling (dev mode).
ARCADE_WEBHOOK_SECRET     optional. Random string for webhook header validation.
                          Recommended for production.
```

Both webhook paths share `TELEGRAM_WEBHOOK_URL` because they live on the same server. Only the path suffix differs.

---

## Production deploy steps (for next time)

1. Add `ARCADE_BOT_TOKEN` to Render env vars (already in `server/.env` locally, NOT in render.yaml — add it as a sync:false sensitive var).
2. Optional: generate and add `ARCADE_WEBHOOK_SECRET` for header validation.
3. Push to `main`. Render auto-deploys.
4. On boot, server logs:
   ```
   [arcade-bot] identity: @TheArcadeGG_Bot (id 8738475024)
   [arcade-bot] webhook registered at https://solshot-server.onrender.com/api/arcade-webhook
   [arcade-bot] slash commands registered: /games /solshot /basketball /help
   ```
5. Test in Telegram: open a DM with `@TheArcadeGG_Bot`, send `/games`. Should see the launcher.

---

## Future considerations (not in v1)

These were discussed with Fish (per CLAUDE_COMMS.md 2026-05-15 handoff) but deferred:

1. **Shared cross-game leaderboard.** Users with wallets bound across both bots could appear on a unified "top arcade players" list. Needs a Mongo schema for arcade-wide points + a per-game points-emission convention.
2. **Migration of SolShot commands to arcade bot.** Eventually `@SolShotGG_bot` could be retired and all its functions (`/play`, `/stats`, `/wallet`, group-chat matches) move to `@TheArcadeGG_Bot`. Plan: parallel through hackathon, migrate post-submission.
3. **Game-specific deep-link payloads on launch buttons.** Today every `/basketball` launches the basketball home page. Could surface `/basketball tournament_5` deep links into specific match types. Not needed for v1; add when basketball's wagered mode (Phase 4) lands.
4. **Shared Mongo points alignment.** Per Fish — "I'll leave the points and leaderboard part then, but have the theory in there." Concrete implementation deferred until SHOT goes live and we know the points-emission rules.

---

## What got moved / created

- **NEW:** [`server/services/arcadeBot.js`](../../server/services/arcadeBot.js) — Telegraf instance + games registry + command handlers.
- **MODIFIED:** [`server/index.js`](../../server/index.js) — import + boot the new bot alongside the existing one, share shutdown handlers.
- **MODIFIED:** [`server/.env`](../../server/.env) — appended `ARCADE_BOT_TOKEN`.
- **DELETED:** `TheArcadegg token.txt` (root) — moved into `.env` (gitignored) and removed.

Nothing else changed. Existing SolShot bot, escrow, group-chat, maps, AI Practice — all untouched.

---

## Diagnostics

If the arcade bot misbehaves:

- **Bot doesn't reply at all** — check `ARCADE_BOT_TOKEN` is set and not the same as `TELEGRAM_BOT_TOKEN`. Look for `[arcade-bot]` lines in Render logs.
- **`/games` works but `/solshot` doesn't open the URL** — check the `login_url` host matches `@TheArcadeGG_Bot`'s registered domain in BotFather. Look for `LOGIN_URL ERROR` in logs.
- **Slash menu doesn't show the commands** — TG client cache can be slow. Force a refresh by sending `/help` directly (commands appear within ~10s of `setMyCommands` succeeding).
- **Both bots respond to the same command** — would indicate token confusion. Each bot only sees its own DM/group, so `/play` to `@SolShotGG_bot` ≠ `/play` to `@TheArcadeGG_Bot`. If you see crossed behaviour, the token env vars are swapped.
