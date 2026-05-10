# SolShot — Telegram Mini App Plan

> Source of truth for SolShot's Telegram integration. Written when the
> code surface is ~90% built, awaiting activation + polish + growth wiring.

---

## TL;DR

The Telegram code is mostly already there:
- HMAC `initData` verification on the server
- Dynamic SDK embedded wallet (auto-login, no Phantom needed)
- React `TelegramContext`, native back button hook, viewport handling
- `?startapp=join_<roomId>` deep-link parsing → auto-join lobby
- Post-match share to TG

What's left is **activation** (BotFather setup, env vars), **polish** (theme
sync, closing confirmation, MainButton, haptics) and **growth wiring**
(challenge sharing via `switchInlineQuery`, two-sided referrals, rematch loop).

---

## Phase plan

### Phase 1 — Activate (1 day)

1. **BotFather** — `/newbot` → `@SolShotGG_bot`. Save token to server `.env` as `TELEGRAM_BOT_TOKEN`.
2. **Dynamic dashboard** — register project, copy env ID to client `.env` as `REACT_APP_DYNAMIC_ENV_ID`. Without this, the embedded-wallet path is dormant and Phantom fallback shows up.
3. **BotFather setup, in this exact order:**
   1. `/setdescription` → 512-char marketing copy (shown above START button on cold contact)
   2. `/setabouttext` → 120-char short blurb (shown when bot shared as contact)
   3. `/setuserpic` → 512×512 PNG (auto-cropped to circle — keep glyph centered)
   4. `/setdescription` photo → 640×360 image (single biggest first-impression asset)
   5. `/newapp` → register the Mini App. Set `short_name` to `solshot` — **this is permanent, can't be reused, pick once.**
   6. `/mybots` → bot → Bot Settings → Configure Mini App → Configure Splash Screen → upload icon + light/dark background hex codes
   7. `/setmenubutton` → label "Play" → Mini App URL
   8. `/setcommands` → paste the block below
   9. `/setjoingroups` → **Disable** (no group play)
   10. `/setprivacy` → **Enable** (recommended even with groups disabled)

4. **Set REACT_APP_DYNAMIC_ENV_ID and TELEGRAM_BOT_TOKEN in production** (Vercel + Render env panels).

5. **Test** the deep link flow: open `t.me/SolShotGG_bot/solshot` from another TG account, verify Mini App loads, embedded wallet auto-creates, can find a match.

### Phase 2 — Polish (half day)

Two cheap wins that prevent user-side breakage:

1. **Theme sync.** Currently the design is hardcoded dark (`--bg-deep` etc.). Bind those CSS vars to `Telegram.WebApp.themeParams` on mount and listen for `themeChanged`. White-app-on-dark-TG (or vice versa) is the #1 "this feels broken" complaint.
2. **`enableClosingConfirmation()` during active matches.** Otherwise an accidental swipe-down kills the wager and triggers the 30s reconnect window. Toggle on when entering BattleScreen, toggle off on exit.

### Phase 3 — Challenge sharing (1-2 days, killer feature)

The single highest-ROI work for a wagering PvP game on TG. Pattern: `Telegram.WebApp.switchInlineQuery(query, ['users', 'groups'])` — pops the chat picker, pre-fills your bot's inline result, sender doesn't leave the app.

**Components:**

1. **Server endpoint** `POST /api/challenge` — creates `{id, challengerWallet, wager, terrain, expires}`, returns `t.me/SolShotGG_bot/solshot?startapp=ch_<id>`
2. **Server endpoint** `GET /og/challenge/:id.png` — server-rendered 640×360 image with both callsigns + wager. Use `@vercel/og` or node-canvas. **Static images get 3-5× lower click-through** than dynamic — must be per-challenge.
3. **Bot inline mode handler** — when user types `@SolShotGG_bot ch_<id>`, returns an `InlineQueryResultPhoto` with the dynamic image and an "Accept Challenge" inline button. Add to bot via `/setinline` in BotFather.
4. **Client `?startapp=ch_<id>` parsing** in App.js — extends existing `join_` handling. Routes to a new ChallengeAccept screen showing wager + Accept button.
5. **"CHALLENGE FRIEND" button** — wire to `switchInlineQuery` on Lobby and post-match (rematch loop).

### Phase 4 — Growth loops (1 day)

Three mechanics, all small in scope:

1. **Two-sided referral.** `?startapp=rf_<wallet>` — both inviter and invitee get reward when invitee plays first wagered match. Track in `referrals` table on the server.
2. **Rematch share.** Post-match loser sees REMATCH button → `switchInlineQuery` pre-fills challenge back to winner. Highest-converting flow in any PvP TG game.
3. **Weekly leaderboard share card.** Top 10 get a 1080×1920 portrait PNG showing rank + W/L + earnings + "Challenge Me" QR code. Manual at first, automate Sunday post later.

### Phase 5 — Persistent group-chat match mode 🐟 **(FishyBoy owns this)**

**Strategic feature, est. 1-2 weeks.** A match that lives in a Telegram group chat over hours/days. Async turns, server-persistent state, every move posted back to the source chat. Targets trench/whale chats specifically — the ones already wagering SOL on bullshit.

This is the big differentiator on TG. No competitor has it. Tap-to-earns are dead, real-time PvP doesn't fit chat UX. Async PvP that lives in the chat does.

**Full design spec:** `Docs/internal/GROUP_CHAT_MODE.md` (sandbox/fishyboy branch)

Top-level scope:
1. **`Match` Mongoose model + persistence** — the hard architectural change (current matches are in-memory; persistent state needs MongoDB)
2. **Group-chat bot commands** — `/start solshot`, `/join`, `/start_match`, `/abandon` (requires BotFather group permission tweaks)
3. **Server-side turn scheduler** — node-cron or Redis-backed; survive server restart
4. **Bot posts move summaries** to source chat ("`JJ — direct hit on FISH, 75 HP. FISH's turn.`")
5. **Mini App "MY MATCHES" screen** — list of active group games, tap to play your turn
6. **Match end → escrow settle to winner**

Reuses existing physics, weapons, escrow program. Mostly new persistence + bot orchestration code.

Fish to scope out a v1 cut, ship in small commits, end-to-end on `sandbox/fishyboy`. Merge to `launch` only when QA-clean.

---

## /setcommands payload

Paste verbatim into BotFather. Top 3 are most-visible on mobile.

```
play - Launch SolShot and find a match
challenge - Challenge a friend to a 1v1
stats - Your record, rank, and earnings
leaderboard - Top players this season
wallet - Deposit, withdraw, balance
shop - Buy cosmetics with SHOT
prestige - Burn SHOT to climb tiers
weapons - Browse the arsenal
help - How SolShot works
support - Contact the team
```

Notes:
- `/start` is reserved (handled implicitly for `t.me/<bot>?start=` links — different from `?startapp=`).
- BotFather does **not** support icons per command. Don't waste time looking for that setting.
- Commands are lowercase, max 32 chars, descriptions max 256 (keep <60 for mobile UX).

---

## Asset inventory — what we have vs. need

### Already in `Assets/` ✅

| Asset | Existing file | Use for |
|---|---|---|
| Logo (high-res) | `SOLSHOT_Logo.png` | Source for bot profile pic (resize to 512×512) |
| Logo transparent | `solshot-logo-transparent.png` | Source for splash icon |
| Banner 640×360 | `Solshot_Banner_640x360.png` | **Bot description image** — exactly right size |
| Open Graph | `Solshot_OpenGraph.png` | Web link preview when `solshot.gg` pasted outside TG |
| PWA icons | `logo192.png`, `logo512.png`, `favicon.ico` | Already wired into client |
| Prestige badges | `badge-bronze/silver/gold/platinum/diamond.png` (+ PSDs) | In-app + leaderboard share card |
| Weapon icons | All 20 (`Big_Shot.png`, `Crazy_Ivan.png`, etc.) | Already in shop UI |
| Tank | `tank-tinted.png`, `tank-turret-tinted.png`, `destroyed-tank.png` | Match scene + share cards |
| Backgrounds | `ArcticBG`, `DesertBG`, `JungleBG`, `MoonBG`, `VolcanicBG` | Match terrain backdrops |
| Currency | `GoldIcon`, `ShotCoin`, `SolDiamon`, `GreenSolIcon` | HUD + economy |

### Still to commission ❌

| Asset | Spec | How to produce |
|---|---|---|
| **Demo GIF** | 640×360, ≤1MB, 3-5 sec loop | Screen-record gameplay (fire → arc → hit → win banner). Tools: ScreenToGif (Windows), Kap (mac). |
| **3× store screenshots** | 1080×1920 portrait PNG | Take phone-emulator screenshots in Chrome DevTools at iPhone 14 Pro size. Show: (1) match HUD with weapon selected, (2) trophy share card after win, (3) leaderboard tab in Barracks |
| **Mini App splash icon** | 512×512 PNG, transparent | Re-export `solshot-logo-transparent.png` clean at 512×512, or commission a square-cropped variant of the logo |
| **Splash colors** | hex codes light + dark | Already defined in `client/src/index.css` — light: `#d8c88a` (poster), dark: `#0e1209` (field). Pick the dark one as primary. |
| **Challenge card template** | Dynamic 640×360 server-side | Code, not art. Use `@vercel/og` — write a JSX template with player names + wager + bg. |

### Optional growth assets

| Asset | Spec | Why |
|---|---|---|
| **Sticker pack** | 5-20 × 512×512 WebP transparent | Free distribution channel — every send shows "via @SolShotGG_bot" attribution. Marketing only, not revenue. Can ship later. |
| **Bot description video** | 640×360 MP4 instead of GIF | Auto-loops. Higher quality than GIF for same size budget. Optional alternative to demo GIF. |

---

## TG-specific UX status

| API | Status | Note |
|---|---|---|
| `themeParams` sync | ❌ Missing | Bind CSS vars to `bg_color`, `text_color`, `button_color`. Listen for `themeChanged`. |
| `expand()` + `viewportStableHeight` | ✅ Done | `TelegramContext.js` calls expand on mount. Phaser canvas should use `viewportStableHeight` not `window.innerHeight`. |
| `MainButton` for primary CTAs | ❌ Missing | Use for "Find Match", "Confirm Wager", "Claim Win" — sticky bottom button users expect. |
| `BackButton` per screen | ✅ Done | `useTelegramBackButton.js` |
| `HapticFeedback` | ❌ Missing | Cheap perceived-quality win. `impactOccurred('light')` on shot fire, `notificationOccurred('success')` on hit, `notificationOccurred('error')` on wager-fail, `selectionChanged()` on weapon swap. |
| `enableClosingConfirmation()` | ❌ Missing | **Critical** during active matches — prevents wager-time loss from accidental swipe-down. |
| `requestFullscreen()` | ✅ Done | `TelegramContext.js`. |
| `CloudStorage` | ⏸ Skip for v1 | Only for client preferences (last-used weapon, tutorial flag). Never put match state here — server is source of truth. |
| `BiometricManager` | ⏸ Skip | Not relevant; Dynamic SDK handles keys. |
| Full-screen mode (TMA 2.0) | ⏸ Defer | Worth enabling for BattleScreen specifically; not needed elsewhere. |
| `addToHomeScreen()` | ⏸ Defer | Prompt after 3rd win (intent signal). |

---

## Wallet UX in TG (Dynamic SDK)

We use Dynamic for embedded wallets in TG (no Phantom needed). The user experience should feel like the wallet doesn't exist until they want to deposit.

**Already working:**
- Auto-login on Mini App open via Dynamic + Telegram OAuth
- SOL balance fetch
- Escrow deposit signing (for wagered matches)
- SHOT token burn (for prestige tier ups)

**Friction points to address:**
1. **Deposit funnel.** New users land with a freshly-created wallet that has 0 SOL. Three patterns ranked by conversion:
   - **MoonPay/Transak iframe** inside the Mini App (credit card → SOL on Solana, in-flow). Highest cost (~3-5%), highest conversion. Consider subsidizing first deposit.
   - **TG Wallet cross-chain bridge** (TON → SOL via MoonPay's recently-launched flow). Useful for TG-native crowd that already has TON.
   - **External wallet send to copy-paste address.** Free for us, awful UX. Fallback only.

2. **Withdraw must be one-tap.** Show balance prominently; `MainButton: "Withdraw"` → modal with amount + destination + QR scan via TG's built-in scanner. Don't make user confirm gas — abstract it.

3. **Fiat-alongside-crypto display.** Wagers in "0.05 SOL (~$8)" convert better than just "0.05 SOL" with TG's mainstream-skewing audience.

---

## Monetization considerations specific to TG

**Telegram Stars compliance hammer.** On iOS/Android TG clients, any **digital goods** purchase inside the Mini App must go through Stars or risk App Store / Play Store delisting. What this means:

- **Wagers are fine.** Crypto-to-crypto via signed transaction is treated as a financial flow, not digital goods. Same as how DEX trades work in TG.
- **Buying SHOT *inside* the Mini App on mobile is a problem.** Workaround: keep SHOT acquisition as (a) earned in-game, (b) bought on a DEX in a separate tab, or (c) bridge from deposited SOL via swap.
- **Cosmetics paid in SHOT** is fine (SHOT is earned). Cosmetics paid in **Stars** opens a fiat funnel without compliance risk — consider a Stars-priced "starter cosmetic bundle" as a non-tokenomic monetization layer.
- **Stars subscriptions** could power "SolShot Pro" (private rooms, advanced stats, replay storage). App-Store compliant; Telegram handles billing/refunds.

**Not worth chasing for v1:** sticker pack revenue, channel sponsorships, Telegram Affiliate Programs (need volume first).

---

## Pitfalls to avoid

1. **`?start=` vs `?startapp=` are different.** `start=` opens chat with bot and runs `/start <param>`. `startapp=` opens the Mini App with `start_param`. Mixing them breaks share links.
2. **Privacy policy + ToS link inside the app.** #1 store rejection cause. We have `TermsScreen` and `PrivacyScreen` — make sure they're linked from inside the Mini App (footer or settings).
3. **First load over 3s on mid-tier Android.** TG's biggest user regions are CIS/SEA, often slower devices. Code-splitting helps; keep watching the bundle as features land.
4. **Token utility post-launch.** Notcoin/Hamster Kombat lost 200k subs/day after airdrop because tokens had nothing to do in-app. Prestige burns + cosmetics + tournament-entry burns are the right shape for SHOT.
5. **Putting game state in `CloudStorage` or `localStorage`.** Server-authoritative is the only correct pattern (we already are). CloudStorage is for client preferences only.
6. **Permission prompts on first open.** Users will bounce. Defer geolocation/camera/etc. until needed.
7. **Forgetting to test on real Android TG and iOS TG.** They render differently, especially viewport + back-button behavior. Desktop TG is its own third surface.

---

## Reference: where the code lives

| Area | File |
|---|---|
| Server initData verification | `server/middleware/telegram.js` |
| Socket auth wiring | `server/index.js` (line 76, `telegramSocketMiddleware`) |
| Client TG context | `client/src/telegram/TelegramContext.js` |
| Native back button hook | `client/src/telegram/useTelegramBackButton.js` |
| Embedded wallet (Dynamic) | `client/src/wallet/DynamicTelegramWallet.js` |
| Wallet provider router | `client/src/wallet/WalletContext.js` (lines 403-459) |
| Deep link parsing | `client/src/App.js` (lines 109-123) |
| Post-match share | `client/src/components/TelegramShare.js` |
| Viewport handling | `client/src/components/Layout.js` |
| Auto-handle from TG | `client/src/App.js` (lines 74-86) |
| CSP whitelist | `server/index.js` (lines 122-124) |
| Env vars | `.env.example` (TELEGRAM_BOT_TOKEN, REACT_APP_DYNAMIC_ENV_ID) |

---

## Open questions for the team

1. **Wagering jurisdiction.** Confirm legal stance on TG-mobile wagering (App Store ambiguity) before flipping wagered modes on for TG users.
2. **Solana Mobile policy** for Seeker / dApp Store (blocker on Phase 9B). Ask in Solana Mobile `#dapp-store` Discord.
3. **Stars vs SHOT for cosmetics.** Decision: pure SHOT (preserves tokenomics, narrower audience) vs Stars-and-SHOT dual-currency (broader funnel, dilutes utility).
4. **Referral reward economics.** What's the per-invite cost we're willing to absorb? Suggested: ~1× practice match wager (small enough to scale, big enough to motivate).
5. **Sticker pack decision.** Worth the design effort? Cheap to ship in v2 once we know audience size.

---

_Last updated: 2026-04-28. Update as work lands._
