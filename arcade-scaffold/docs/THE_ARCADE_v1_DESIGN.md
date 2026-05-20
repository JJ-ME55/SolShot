# The Arcade — v1 Design

> **Status:** Design proposal, awaiting JJ review.
> **Last updated:** 2026-05-19
> **Author:** Fish (with fishyboy-claude / Opus 4.7)
> **Companion docs:** [`ROADMAP.md`](ROADMAP.md), [`ARCADE_NEW_GAME_PLAYBOOK.md`](ARCADE_NEW_GAME_PLAYBOOK.md), [`BALL_GAMES_PLAYBOOK.md`](BALL_GAMES_PLAYBOOK.md), [`build-notes/ARCADE_BOT.md`](build-notes/ARCADE_BOT.md)
> **Brand assets:** local at `C:\Users\jacob\The Arcade\Website images and branding\` (logo, cabinet mocks — to be moved into the repo when implementation starts).

---

## Vision

**The Arcade** is the parent-brand hub for a Solana-native skill-game catalog. It settles the open question in JJ's roadmap (parent-company brand TBD as of 2026-05-10) by establishing **"The Arcade" as the umbrella brand**, with SolShot, Keepie-Uppies, Basketball Free-Throw, and Football Flick Kick as titles underneath.

Tagline: **"PLAY. WAGER. WIN. ON SOLANA."**

End-state matches JJ's Phase 3 roadmap — multi-game on shared infrastructure, shared identity, with the multi-game time-windowed wager mechanic as the headline competitive surface.

---

## Prior Work — `@TheArcadeGG_Bot` (read this first)

JJ shipped [`@TheArcadeGG_Bot`](build-notes/ARCADE_BOT.md) to `main` on 2026-05-15 (commit `2f8471b`) — a Telegram bot acting as a **multi-game launcher**:
- `/games` lists every game; `/<slug>` launches each.
- Routes to each game's **existing URL** — SolShot at `solshot.gg`, Basketball at `solshot-basketball.vercel.app`.
- Adding a game = append one entry to the `GAMES` array in `server/services/arcadeBot.js`.
- BotFather `setdomain` = `solshot.gg`; only games on `solshot.gg` get silent Privy auth via `login_url`. Other-host games use plain URL buttons.

**This proposal does NOT replace the bot.** The bot is the **Telegram surface** of The Arcade brand. This design is the **web surface** — a unified hub at `thearcade.gg` that hosts the games inline.

**Two complementary distribution models:**
- TG users land in the bot, tap `/basketball`, get routed to wherever the game lives (today: `solshot-basketball.vercel.app`).
- Web users land at `thearcade.gg`, see the game grid, play inline at `thearcade.gg/play/basketball`.

Over time, the bot's `GAMES` array could be updated to route to `thearcade.gg/play/<slug>` (one consolidated host benefits from `solshot.gg`/`thearcade.gg` setdomain to enable silent Privy auth across all games). That's a **deferred decision**, not v1-blocking — the two surfaces can coexist with different per-game URLs in the short term.

### Bot-side leaderboard infrastructure (already shipping)

JJ has also shipped (2026-05-15 onward) **per-game leaderboards on the standalone Vercel deploys**:
- `server/models/BasketballScore.js`, `server/models/KeepieUppiesScore.js` — Mongo schemas, keyed on `telegramUserId`.
- `server/services/games/basketball-standalone/standaloneLeaderboard.js` and the keepie-uppies equivalent — JWT-gated score submission. The arcade bot mints a session JWT when a user taps `/basketball` or `/keepie-uppies`; the JWT carries TG identity; the standalone client submits scores via HTTP, server verifies the JWT, writes the score.

**Identity-model divergence to reconcile with @johnk:**
- Bot pathway: identity = `telegramUserId` + display-name; no wallet, no callsign.
- Web pathway (this proposal): identity = `callsign` (via Privy).

These describe the **same person** when a user has both a TG account and a Privy callsign. v1 needs an explicit reconciliation: either (a) merge on a known link (e.g. SolShot's existing TG ↔ wallet binding in the `users` collection), (b) display two separate boards (TG players vs web players) and never merge, or (c) treat the bot leaderboards as the SOURCE OF TRUTH and the website surfaces them, with callsign overlay when known. **Open item — see Open Items #11.**

---

## v1 Scope

### In v1
- Three games (Keepie-Uppies, Basketball, Free-Kicks) play **inline** at `thearcade.gg/play/<game>`. The existing per-game URLs that `@TheArcadeGG_Bot` routes to stay live in parallel — `thearcade.gg/play/<game>` is a **second home** for the games, not a replacement. Phaser scenes lift from each game's existing `client/src/games/<game>/scene.js`.
- SolShot tile is in the grid but **routes out to `solshot.gg`** — matches the arcade-bot's current routing model for SolShot. Full SolShot integration deferred until the PvP-in-hub UX is designed.
- **Sign-in via Privy required** before any play. Same Privy app as solshot.gg → one callsign across the parent brand.
- **Leaderboards**: per-game (today / week / all-time toggle) + cross-game **Arcade Champion** combined board.
- **"Wager Mode — Coming Soon"** surface with email waitlist for v2 closed-beta access.
- **Retro coin-op aesthetic** — cabinet metaphor on the landing page; standard dashboard layout post-sign-in.

### Explicitly out of v1
- Multi-game time-windowed wager mechanic + the v3 escrow it needs (v2).
- SolShot's full gameplay inside the hub (later phase).
- Mobile native app (PWA only).
- $TOKENS minting / distribution (v2 — copy-only in v1).
- Open SDK / third-party games (Phase 5).
- Bot's `GAMES` array re-pointing to `thearcade.gg/play/<slug>` (deferred decision, see Prior Work).

---

## Information Architecture

Two distinct visual modes, gated by sign-in: the **Cabinet** (pre-auth landing) and the **Dashboard** (post-auth play surface).

### Pre-auth: `/` (Cabinet)
Full-bleed arcade cabinet illustration in the style of the brand-image mocks. Marquee at top with the logo + checkerboard. Cabinet screen shows a looping attract-mode reel (game clips, score tickers, "ARCADE CHAMPION" hype) until a tap. The **"PLAY. WAGER. WIN. ON SOLANA."** banner under the buttons is the primary CTA — tap opens the Privy modal. Joystick + buttons are decorative on desktop; the screen area is the tap target on mobile. Single page, no nav, no sub-routes. Anyone hitting any deep link while signed out lands here first with a return-to redirect.

### Post-auth routes

| Route | Purpose |
|---|---|
| `/` | Dashboard — game grid front and centre, Arcade Champion board featured up top, daily-leaderboard snippets per game, welcome-back hero (callsign + streak + last-played) |
| `/play/keepie-uppies` | Game scene (Phaser, full-bleed on mobile) |
| `/play/basketball` | Game scene |
| `/play/free-kicks` | Game scene |
| `/play/solshot` | Brief interstitial card → redirect to `solshot.gg` with shared-Privy session passed through |
| `/leaderboards` | Full leaderboard surface — Arcade Champion + per-game with today / week / all-time toggles |
| `/leaderboards/<game>` | Per-game deep link (Today selected by default) |
| `/profile/<callsign>` | Public stat card — career numbers across all games, signature game, shareable URL |
| `/me` | Authenticated user's own profile + settings (sign-out, wallet, callsign — locked once chosen) |
| `/wager` | "Wager Mode — Coming Soon" page + waitlist email capture |
| `/about` | Brand / vision page (linked from footer) |

### Persistent chrome (post-auth)
- **Header**: marquee-strip logo, nav (`Home / Leaderboards / Wager`), callsign chip with avatar/menu, SOL balance + "$TOKENS coming soon" placeholder pill.
- **Footer**: socials, Privacy, Terms, Responsible Gaming notice (carries over from solshot.gg).

---

## Visual Identity

### Palette (locked from brand images)

| Token | Hex | Use |
|---|---|---|
| `arcade-black` | `#0A0606` | Page background, cabinet body |
| `arcade-yellow` | `#FFD23A` | Logo top, highlight glow, primary CTA fill |
| `arcade-orange` | `#FF8A1F` | Logo mid, hover states, secondary accents |
| `arcade-red` | `#E62E2E` | Logo base, joystick, live / active states |
| `arcade-deep-red` | `#7A0F0F` | Cabinet shadows, scanline overlay |
| `solana-purple` | `#9945FF` | Solana-mark accents only |
| `solana-teal` | `#14F195` | Solana-mark accents, on-chain badge fills |
| `paper-warm` | `#F5E6CC` | Body text on dark, ticket-stub surfaces |

The fire gradient (`yellow → orange → red`, top to bottom) is the brand's defining mark — used on the wordmark, marquee headings, and key CTAs. Solana colours stay tightly scoped to "this is on Solana" cues; never compete with the fire palette for primary attention.

### Typography
- **Display / marquee:** chunky pixel face for the logo and section headings (candidates: Press Start 2P / VT323 / custom-to-match-logo — sourcing TBD).
- **Subhead:** condensed sans (Anton / Bebas-style) for "PLAY. WAGER. WIN." banners.
- **Body / UI:** clean sans (Inter or similar) for everything functional.

### Texture and motion
- Subtle scanline overlay on dark surfaces (1px, 4% opacity).
- Neon glow on active elements (CTA buttons, current-leader rows, your-rank highlight).
- Cabinet landing: parallax / attract-mode motion. Dashboard: static, motion only on micro-interactions.

### Component patterns
- **Game tiles** styled as cabinet cards — pixel-bordered, marquee strip with game name, screen area showing game art, joystick/buttons silhouette at the bottom.
- **Leaderboard rows** styled as ticket stubs — torn-edge top/bottom, monospace numerals, callsign in display font.
- **Buttons** are bevelled arcade buttons — circular yellow/red with depth shadow, "press" animation on tap.

---

## Auth & Identity Flow

### Privy app: single instance, shared with solshot.gg

The Arcade reuses solshot.gg's existing Privy app (`client/src/wallet/`). One Privy `appId` serves both sites:
- A user with an existing SolShot callsign signs in at thearcade.gg → callsign carries over automatically, same wallet, no re-onboarding.
- A new Arcade user signs up via Privy (email / Google / Telegram OAuth), gets a Solana wallet, then goes through the callsign-lock-in flow (3–12 chars, profanity-filtered, locked forever) — same flow as solshot.gg's `HandleModal.js`, re-skinned to the cabinet aesthetic.
- That callsign is the user's identity across **all** parent-brand surfaces (web + bot).

### Sign-in flow (UX)

1. Anonymous visitor lands on `/` → sees the cabinet.
2. Tap anywhere on the cabinet screen / "PLAY. WAGER. WIN." banner → Privy modal opens.
3. User signs in (email / Google / Telegram).
4. If new: arcade-skinned `HandleModal` → callsign lock-in.
5. If returning: existing callsign loaded.
6. Drop into `/` (dashboard mode).

### Session sharing with solshot.gg

When a signed-in Arcade user taps the SolShot tile → `/play/solshot` interstitial → opens `solshot.gg` with a session token in the URL. User lands on solshot.gg already signed in.

Two implementation options:
1. **Short-lived JWT handoff** (recommended) — Arcade mints a token via `GET /api/arcade/session-handoff`, redirects to `solshot.gg/?arcade_token=...`, SolShot validates and provisions its own Privy session.
2. **Shared apex domain** — move both sites under a common eTLD+1 so Privy cookie carries. Needs JJ's call on the brand split.

### Edge cases
- Wallet disconnect mid-session → game freezes, modal: "Sign in to keep playing." No anonymous fallback.
- Privy fails to load (network, ad-blocker) → cabinet landing shows a "Connection issue" banner with retry.
- TG WebView quirks → reuse `TgWebViewBanner.js` from solshot.gg.

---

## Game Integration

### Lifting Phaser scenes from standalone deploys

Each ball game currently lives in two places: a standalone playtest repo on Vercel (Fish's iteration loop, also the URL `@TheArcadeGG_Bot` currently routes to) and a copy in `client/src/games/<game>/` in the SolShot monorepo. Per `BALL_GAMES_PLAYBOOK.md` §9.1, three-file sync is the active pattern.

For The Arcade:
- Standalone playtest repos **stay live** — they remain Fish's iteration loop AND the URL the bot routes to.
- The Arcade client's source-of-truth per game is `client-arcade/src/games/<game>/scene.js`, lifted from `client/src/games/<game>/scene.js`. Same Phaser scene, same server-side physics, new chrome.
- Each game gets a thin **GameWrapper** component: route → scene mount, signed-in identity → score posting, scene unmount on navigate-away, watchdog teardown.

### Server-authoritative scoring preserved

Every game's physics runs server-side (v2 escrow trust assumption per `ARCADE_NEW_GAME_PLAYBOOK.md`). Client emits inputs (flick angle/power/elevation, seeds), server simulates the shot, returns trajectory + result, writes the score to Mongo. The Arcade client doesn't change that contract — it consumes existing server endpoints.

### Per-game route shell

```
/play/keepie-uppies
  → mount Phaser scene full-bleed on mobile, framed in screen-area on desktop
  → top chrome: callsign chip, current session best, "X" to exit
  → bottom chrome: leaderboard quick-peek (your rank + top 3), "Share score" button
  → exit → dashboard with score-celebration toast if PB beaten
```

### SolShot tile interstitial (`/play/solshot`)

Card-sized interstitial: cabinet artwork + "SolShot lives on its own site for now — your callsign and wallet come with you. **Open SolShot →**". One-tap full-page redirect to `solshot.gg`, session token passed through. No iframe — full page redirect avoids cross-domain auth complexity. **This matches `@TheArcadeGG_Bot`'s current routing model for SolShot.**

### Asset migration

Each game's existing image / sfx assets in `client/src/games/<game>/` get duplicated into `client-arcade/src/games/<game>/` for v1. Once stable, the monorepo's two clients deduplicate via a shared `client-shared/assets/` package — punted to v2 cleanup.

---

## Leaderboards & Arcade Champion

### Per-game boards

Each playable game (KU, BB, FK) has its own board, with three time-window views:
- **Today** — last 24h, rolling, UTC midnight reset.
- **This week** — last 7 days, rolling Monday 00:00 UTC reset.
- **All-time** — career best per player, never resets.

Score model: **player's personal-best** (not last attempt). Mongo schema: `{ callsign, game, score, postedAt, attemptId }` with an index on `(game, score DESC)` per window.

### Arcade Champion — cross-game board

> ⚠️ **Reversal flag (for @johnk):** the arcade-bot commit message (2026-05-15, `2f8471b`) noted *"Cross-game leaderboard / shared points deferred per Fish's 2026-05-15 handoff."* **This proposal reverses that deferral** — Fish revisited the call in the 2026-05-19 brainstorm and chose to include cross-game leaderboards in v1. Open to discussion: keep the reversal, or honour the original deferral and ship per-game boards only in v1.

Sits above the per-game boards on `/leaderboards`, featured slot on the dashboard. Scoring:

> Arcade Champion score = sum of normalised percentile-ranks across all three games (lower = better, like golf).

For each game where you have a posted score: contribute `rank_in_that_game / total_players_in_that_game * 100` (a 0–100 percentile). Players who haven't played a game get 100 (worst-case) for that game — strong incentive to play all three. Three games → score range 0 (won all three) to 300 (didn't play any). Lowest total wins.

**Why percentile-rank**: raw points don't compare across games (basketball's 2-points-per-swish vs keepie-uppies' juggle count vs free-kicks' target multipliers). Percentile rank is the only fair cross-game unit and auto-balances as the player base grows. Recommended starting formula — open to refinement, but ship v1 with one explicit rule rather than "scoring TBD."

Same Today / Week / All-time views as per-game boards.

### Leaderboard UX
- Rows as ticket stubs (per Visual Identity). Your row highlighted in fire-gradient.
- Current rank vs your best rank shown ("#12, best #8 — climb back").
- Tap any row → `/profile/<callsign>`.
- Share button per row → Satori-rendered share card (reuse `server/services/challenge/` infra) → tweet "Currently #3 on The Arcade leaderboard 🕹️ thearcade.gg/profile/BUCKSHOT".

---

## Wager Waitlist & "Coming Soon" Surface

### Goal
The brand tagline includes "WAGER." v1 ships without wagers. The waitlist surface bridges that promise — tells the story, captures intent, gives the team an early-access list for v2.

### Where it lives
- `/wager` route — dedicated page, accessible from main nav (third nav item: `Home / Leaderboards / Wager`).
- "Wager Mode — Coming Soon" pill in the header nav, glowing fire-gradient.
- Single contextual line on the Arcade Champion section of `/leaderboards`: *"In Wager Mode, this is the board that pays out. Join the beta →"*.

### `/wager` page content

Single-screen layout, cabinet-aesthetic styling:

1. **Hero** — "Wager Mode is coming." Pixel-art animation: stack of SOL chips on a cabinet's payout tray.
2. **How it works** — three illustrated steps:
   - "**Host picks the games** — choose any combination of Arcade titles."
   - "**Set a window** — 1, 2, 4, or 7 days."
   - "**Play, post your scores, top score wins the pot.**" Smart-contract escrow, automatic on-chain payout.
3. **Beta access form** — email input + "Join the Waitlist" CTA. Stored in Mongo `wager_waitlist` with `{ email, callsign, signedUpAt, source }`. Callsign auto-filled if signed in.
4. **What you get** — bullet list: "Closed-beta access when Wager Mode opens / First crack at hosting wager events / $TOKENS bonus for early users."
5. **FAQ** — 4–5 short items: launch timing ("Q4 2026 target, see roadmap"), wager currency ("SOL"), skill-based positioning, escrow ("Direct to a Solana program account — no custodian").

### Server-side

New endpoint `POST /api/wager-waitlist`, rate-limited via existing `express-rate-limit`. Idempotent on email. No double opt-in for v1.

### What this surface explicitly does *not* do
- No price quotes or specific bonus amounts.
- No date promises beyond the roadmap link.
- No wager UI mockups (let v2 launch make its own visual statement).

---

## $TOKENS Economy

### Role
**Utility / rewards token alongside SOL wagers.** Wagers (v2) settle in SOL, matching SolShot's pattern. $TOKENS is the engagement layer — earn by playing, burn for prestige skins / cosmetics / wager-fee discounts / multi-game wager hosting. Mirrors $SHOT's role on SolShot, scoped to The Arcade.

### Important: $TOKENS is The Arcade's token, not SolShot's
- **$SHOT** belongs to SolShot.
- **$TOKENS** belongs to The Arcade.
- The two economies are explicitly separate, even though they share the same wallet (both are SPLs on Solana).
- The wallet bar surfaces both balances, clearly labelled per-product.

### v1: copy only
- Header wallet chip: SOL balance live; "**$TOKENS coming soon**" placeholder pill next to it (clickable → `/wager` waitlist surface, gains a "+ $TOKENS rewards loop" section).
- No earning logic, no mint authority, no treasury deployed.
- Avoids the audit / on-chain work of standing up a new SPL before the Arcade has a player base worth rewarding.

### v2: full launch alongside Wager Mode
- Mint deployed (separate from $SHOT mint).
- Initial distribution: early-waitlist bonus, retroactive rewards for v1 leaderboard climbers, etc.
- Full prestige / burn mechanics.
- `Docs/TOKENS_TOKEN_MODEL.md` to be written before v2 ships, modelled on `Docs/SHOT_TOKEN_MODEL.md`.

---

## Technical Architecture

### Monorepo layout (additive, doesn't disturb solshot.gg or the arcade-bot)

```
SolShot/
  client/             # existing SolShot React app — unchanged
  client-arcade/      # NEW — The Arcade React app
  server/             # existing Express + Socket.IO + Telegraf — shared
                      # already hosts arcadeBot.js for @TheArcadeGG_Bot
  programs/           # existing Anchor programs — unchanged
  Docs/
    THE_ARCADE_v1_DESIGN.md           # this doc
    build-notes/ARCADE_BOT.md         # existing — JJ's arcade-bot doc
```

### Framework choice

**Recommended: Vite + React + TypeScript** for `client-arcade/` rather than copying solshot.gg's CRA setup.
- CRA is officially deprecated by the React team.
- Vite gives 5–10× faster dev builds — matters when iterating cabinet animation and leaderboard UI.
- All SolShot dependencies (Phaser 3, Privy, Socket.IO client, Satori, html2canvas) work identically under Vite.
- Phaser scenes lift directly with no changes.
- TypeScript from day one — SolShot's growing pain has been untyped JS at scale.

Fallback: CRA + JS to match solshot.gg if JJ prefers stack continuity.

### Shared server endpoints (new)

Added to existing `server/`:
- `GET /api/arcade/leaderboard/<game>?window=today|week|all` — per-game board
- `GET /api/arcade/leaderboard/champion?window=today|week|all` — Arcade Champion
- `GET /api/arcade/profile/:callsign` — public profile across all games
- `POST /api/arcade/score` — score submission (auth-gated via existing `requirePrivyAuth`)
- `POST /api/wager-waitlist` — email capture, rate-limited
- `GET /api/arcade/session-handoff` — short-lived JWT for solshot.gg redirect

Reuses existing Mongo connection, Privy auth middleware, CSPRNG / helmet / rate-limit hardening. Coexists with `server/services/arcadeBot.js` (no shared state, separate code paths).

### Deployment

- New Vercel project `the-arcade-web`, builds `client-arcade/`, domain `thearcade.gg` (or alternative — see Open Items).
- Server stays on Render at its existing URL; CORS scope extended to include the new Arcade domain.
- `@TheArcadeGG_Bot` continues running on the same server process; no changes to its `GAMES` array in v1.
- Branch workflow: this design doc lands on a feature branch off `main` (`arcade/website-design` or similar) for JJ review. Implementation, once approved, follows the standard "feature branch → PR to main" workflow per `ARCADE_NEW_GAME_PLAYBOOK.md`. (Note: `sandbox/fishyboy` was archived 2026-04-30; tag `sandbox-fishyboy-final-2026-04-30` preserves the historical state.)

### Cross-domain auth

`thearcade.gg` ↔ `solshot.gg` are different eTLD+1, so a shared Privy cookie won't carry. Recommended: short-lived JWT handoff (see Auth section). Alternative: shared apex domain — needs JJ's call on brand split.

---

## Open Items & TODOs

To resolve before / during implementation. These don't block this design doc landing — surfaced so JJ and Fish can prioritise them on their own track.

1. **Domain shortlist** — `thearcade.gg` (most on-brand), `thearcade.fun`, `thearcade.xyz`, alternatives if first choices unavailable. Needs JJ confirmation + WHOIS check.
2. **Arcade Champion formula** — percentile-rank-sum proposed; alternatives (badges-collected, weighted-points-per-game, win-of-three) worth a one-day spike before locking. **Also: confirm the reversal of the 2026-05-15 deferral is the call.**
3. **Cross-domain auth handoff** — JWT pattern recommended; needs JJ sign-off (touches `client/src/wallet/`, on the "don't touch without separate PR first" list per `ARCADE_NEW_GAME_PLAYBOOK.md`).
4. **Framework call** — Vite + React + TS recommended; JJ's stack-continuity preference may favour CRA + JS.
5. **$TOKENS economy spec** — entire `Docs/TOKENS_TOKEN_MODEL.md` to write before v2; not v1-blocking.
6. **Wager Mode escrow design** — v3 escrow program (multi-game async time-windowed wagers) is the largest v2 build; needs its own design doc.
7. **Game launch phasing** — big-bang vs staged (KU+BB now, FK joins when complete). Decide closer to launch readiness.
8. **JJ alignment** — this proposal settles open questions in JJ's roadmap (parent-company brand/name = "The Arcade"; distribution model = web hub on new domain, complementary to the existing TG bot). Surface via `Docs/internal/CLAUDE_COMMS.md` once Fish has signed off.
9. **Pixel display font** — sourcing decision (Press Start 2P / VT323 / custom-to-match-logo). Affects every heading on the site.
10. **Arcade-bot ↔ website reconciliation** — `@TheArcadeGG_Bot` currently routes Basketball to `solshot-basketball.vercel.app`; this design adds `thearcade.gg/play/basketball` as a second home. **Deferred decision:** at what point does the bot's `GAMES` array switch to routing at `thearcade.gg/play/<slug>`? Implications for `setdomain` and silent Privy auth across all games. Not v1-blocking — worth a 30-min sync with JJ once the web hub is up.
11. **Identity model: TG vs Privy** — JJ's already-shipped `BasketballScore` / `KeepieUppiesScore` schemas key on `telegramUserId`; this design's leaderboards key on `callsign` (Privy). Same player → two identities. v1 needs an explicit policy: merge via TG ↔ wallet binding in `users` collection, OR show two boards (TG vs Web), OR treat bot leaderboards as source-of-truth and surface them in the website with callsign overlay when known. **Biggest open architectural call** in this doc — please discuss in review.

---

## Decision summary (locked through brainstorming session)

| # | Decision |
|---|---|
| 1 | Product shape: unified game hub from day one (web surface; complementary to `@TheArcadeGG_Bot` TG surface) |
| 2 | Codebase: new client in SolShot monorepo (inherits server, escrow, SHOT, Privy, bot) |
| 3 | v1 composition: free-play + sign-in gate (Privy required); wagers in v2 |
| 4 | Home page (post-auth): game grid front and centre |
| 5 | Brand: "The Arcade" — locked parent brand, new standalone domain |
| 6 | Game lineup v1: KU + BB + FK play inline at thearcade.gg/play/<game> (second home alongside existing per-game URLs); SolShot tile redirects to `solshot.gg` |
| 7 | Aesthetic: retro coin-op arcade — fire palette, cabinet motif, scanlines, pixel fonts |
| 8 | Identity: shared Privy app + shared callsign with solshot.gg |
| 9 | Leaderboards: per-game (today / week / all-time) + cross-game Arcade Champion (reverses 2026-05-15 deferral — open for @johnk to confirm) |
| 10 | Wager teaser: "Wager Mode — Coming Soon" + email waitlist |
| 11 | Visual UX: cabinet IS the landing (pre-auth); dashboard layout post-auth |
| 12 | Tagline: "PLAY. WAGER. WIN. ON SOLANA." |
| 13 | Token: $TOKENS (utility / rewards) — copy-only in v1, full launch in v2 |
| 14 | $TOKENS economy: mirrors $SHOT pattern, scoped to The Arcade (separate from $SHOT) |

---

*This design doc is a starting point for implementation, not a final spec. Sections are expected to be refined as we build. Maintainers: JJ and Fish.*
