# SolShot — Project Brief

> Comprehensive game + technical brief for Claude agents working on this codebase.
> Read this in full once at the start of any session.

---

## The game in one paragraph

SolShot is a browser-based 1v1 (eventually 3P/4P) artillery duel game
in the Pocket Tanks / Worms tradition, built on Solana. Two tanks
spawn on a destructible terrain; players take turns selecting a weapon,
adjusting angle and power, and firing. First to reduce the opponent's
HP to zero wins. Matches can be free practice or wagered for SOL or
SHOT (the project's own SPL token). Settlement is on-chain via a
purpose-built Anchor escrow program. Live demo at
[solshot.gg](https://solshot.gg).

---

## Game design

### Core loop
1. **Connect wallet** (Phantom/Solflare on web, Dynamic embedded wallet on Telegram).
2. **Find a match** — Practice (free), Quick Match (small wager),
   Duel (custom), or High Roller (large pot). Or: VS Shot Bot for
   solo practice against AI.
3. **Shop phase** — buy weapons with Gold (each match starts with
   1000G; +15G/HP dealt, +200/kill, +300/win). Weapons are unlimited
   use within the match once purchased.
4. **Battle phase** — turn-based, take shots until one player is
   eliminated. Round wins go best-of-3 or best-of-5.
5. **Settlement** — winner takes 90% of pot, treasury 7%, ops 3%.
6. **Stats persist** — match history, prestige progress, weapon stats
   recorded per wallet.

### Weapons (20 total, 6 tiers)

Tiers (with hex colours from `data/weapons.js`):

| Tier | Colour | Examples |
|---|---|---|
| FREE (`#8a9a80`) | Sage | Single Shot |
| STANDARD (`#7a9060`) | Olive | Big Shot, 3 Shot, Skipper, Magic Wall, Dirt Ball |
| TACTICAL (`#4fc0b4`) | Teal | Heatseeker, Pile Driver, Spider |
| RARE (`#c8a84a`) | Amber | Sniper Rifle, Jackhammer, Hail Storm, Ground Hog, Napalm |
| EPIC (`#9945FF`) | Sol Purple | (prestige unlocks) Cruiser |
| LEGENDARY (`#d83030`) | Red | (prestige unlocks) Tommy Gun, Pineapple |
| PRESTIGE (`#14F195`) | Sol Green | Crazy Ivan, Chain Reaction, Homing Missile |

15 base weapons available to anyone. 5 prestige-tier weapons unlock
by burning SHOT (Bronze 200 → Silver 500 → Gold 1200 → Platinum 2500
→ Diamond 4000, cumulative 8400 SHOT to Diamond).

### Physics

All physics is **server-authoritative** (`server/services/physics.js`).
The client is a renderer — it never decides outcomes.

- Gravity: 300 px/s²
- Wind: regenerated per round, range `[-60, +60]` px/s² horizontal accel
- Power range: 1–100 (consumable Overcharge raises cap to 115)
- Each weapon has a unique trajectory + damage profile in `WEAPON_DATA`
- Terrain is destructible; some weapons CREATE terrain (Magic Wall, Dirt Ball)
- Tanks fall under gravity if their footing is destroyed

### Economies (two distinct currencies)

**Gold (in-match, ephemeral):**
- Starts at 1000G per match
- Earned: +15G per HP damage dealt, +200G per kill, +300G per match win
- Spent on: weapons in pre-match shop
- Resets each match

**SHOT (persistent, on-chain SPL token):**
- 10M total supply, mint authority burned (no more can be minted)
- Devnet: `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`
- Earned: per-match SHOT drip (2 + 3 wagered, 0.5 + 0.5 practice, 25/day cap)
- Spent on:
  - Prestige tier burns (200/500/1200/2500/4000)
  - Cosmetics (camos, projectile trails, blast effects, kill effects, skins)
  - Consumables (Extra Rations, Smoke Screen, Tactical Scope, Reinforced Armor, Overcharge)

### Prestige system

Five tiers (`client/src/data/tiers.js`): Bronze, Silver, Gold, Platinum, Diamond.
Each tier requires **burning** SHOT (permanently destroying it). The
total cost from Unranked → Diamond is 8400 SHOT.

Each tier unlocks one prestige-tier weapon:

| Tier | Cost | Weapon Unlocked |
|---|---|---|
| Bronze | 200 | Homing Missile |
| Silver | 500 | Cruiser |
| Gold | 1200 | Tommy Gun |
| Platinum | 2500 | Chain Reaction |
| Diamond | 4000 | Pineapple |

Tier badges display in the lobby, post-match cards, and exported
share images. Burns are verified server-side via on-chain transaction
inspection (`server/services/shot-token.js:verifyBurnTransaction`).

### Match modes

| Mode | Wager Range | Format | Available |
|---|---|---|---|
| Practice | 0 SOL | BO1 | Live |
| Quick Match | 0.01–0.05 SOL | BO1 | Devnet |
| Duel | Custom | BO1 / BO3 | Devnet |
| High Roller | 0.1+ SOL | BO3 / BO5 | Devnet |
| VS Shot Bot | Free | BO5 (40 turns) | Live |

---

## Technical architecture

### Stack overview

```
                    ┌──────────────┐
                    │   solshot.gg │
                    │   (Vercel)   │
                    └──────┬───────┘
                           │
                ┌──────────┴──────────┐
                │   React + Phaser    │
                │   (client/)         │
                └──────────┬──────────┘
                           │ Socket.IO
                ┌──────────┴──────────┐
                │  Express + IO       │
                │  (server/)          │
                │  Render hosting     │
                └────┬──────────┬─────┘
                     │          │
              ┌──────┘          └──────┐
              │                        │
        ┌─────┴──────┐         ┌───────┴────────┐
        │ MongoDB    │         │ Solana mainnet/│
        │ (Atlas)    │         │ devnet         │
        │ stats,     │         │ Anchor escrow  │
        │ history    │         │ + SHOT mint    │
        └────────────┘         └────────────────┘
```

### Client (React + Phaser, deployed on Vercel)

- **React** for all UI screens (Lobby, Battle HUD, Win/Lose, etc.)
- **Phaser** for the actual battle scene rendering (tank sprites,
  terrain, projectile animations)
- **React + Phaser bridge**: BattleScreen mounts a Phaser instance
  inside a React component. Communication between them via a global
  bridge object on `window.bridge` (set by Phaser, consumed by React HUD).
- **Code-split**: 13 screens are lazy-loaded via `React.lazy()`. Only
  LoadingScreen + MenuScreen load eagerly. BattleScreen + AIPracticeScreen
  pull in the heavy Phaser bundle on demand.
- **Solana wallet**: `@solana/wallet-adapter-react` for Phantom/Solflare
  on web. **Dynamic SDK** for embedded wallets in Telegram (no Phantom
  install needed there).
- **Design system**: CSS tokens (`--bg-deep`, `--bone`, `--olive`,
  `--accent`) in `client/src/index.css`. Three themes — `field` (default),
  `crt` (active in production), `poster` (light variant).
- **Phaser scenes** live in `client/src/scenes/main/`. The main entry
  is `index.js` (~3000 lines).

### Server (Express + Socket.IO, deployed on Render)

- **`server/index.js`** — entry point. Sets up Express, helmet, CORS,
  rate limit, MongoDB connect, Telegram bot, Socket.IO. ~250 lines.
- **`server/socket-io/main.js`** — the workhorse. ~3700 lines of socket
  event handlers covering match lifecycle: createRoom, joinRoom, ready,
  buyWeapon, fire, processShot (calls physics), turn rotation, round
  end, match end, settlement, stats persist. **This file is huge** —
  search by function name with grep, never by line number.
- **`server/services/`** — modular services:
  - `physics.js` — all 20 weapon physics
  - `ai.js` — Shot Bot (probabilistic aim with calibration)
  - `bot.js` — Telegram bot command handlers (Telegraf)
  - `escrow.js` — Anchor program client wrapper
  - `shot-token.js` — SHOT mint + burn verification
  - `consumables.js` — per-match consumable effects
  - `gold.js` — in-match Gold accounting
  - `solana.js` — RPC connection, wallet utilities, MATCH_MODES config
  - `monitoring.js` — health check + admin stats endpoints
- **`server/middleware/telegram.js`** — HMAC-SHA256 verification of
  Telegram `initData`. Validates user, checks `auth_date` freshness,
  timing-safe comparison.
- **`server/models/User.js`** — Mongoose schema. Stats, prestige, match
  history (capped at last 50), weapon stats per ID, consumables inventory.

### Solana on-chain (Anchor program)

- **`programs/solshot-escrow/`** — Anchor program for match escrow
- **Program ID**: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` (devnet)
- **Instructions**: `create_match`, `deposit_wager`, `settle_match`,
  `cancel_match`
- **PDA seeds**: `["match", match_id.as_bytes()]` — one escrow per match
- **Settlement split**: 90/7/3 BPS (winner / treasury / ops)
- **Timeout refund**: 24h via `cancel_match`
- **Server keypair** at `SOLANA_SERVER_KEYPAIR_PATH` env — authority
  for create / settle / cancel
- **IDL** copied to `server/idl/solshot_escrow.json` after each rebuild
- **Tests** at `tests/solshot-escrow.ts` (need local validator to run)

### Telegram Mini App

- **Bot**: `@SolShotGG_bot`
- **Mini App URL**: `t.me/SolShotGG_bot/solshot`
- **Server middleware**: `server/middleware/telegram.js` validates
  `initData` HMAC on every Socket.IO connection
- **Bot commands**: `server/services/bot.js` — Telegraf, 10 commands
  (`/play`, `/challenge`, `/stats`, etc.) each replying with an inline
  button that opens the Mini App with the right `?startapp=<param>` deep link
- **Embedded wallet**: Dynamic SDK auto-creates a Solana wallet for TG
  users — no Phantom install required
- **Deep link handling**: `client/src/App.js` routes `startapp` params
  to specific screens (`play` → lobby, `stats` → barracks, etc.)
- **See `Docs/internal/TELEGRAM_PLAN.md`** for the full phased plan

---

## Branch strategy

| Branch | Purpose | Auto-deploy? |
|---|---|---|
| `main` | LIVE demo on solshot.gg | ✅ Vercel + Render |
| `launch` | Full build (3P/4P, Telegram, all features) | ❌ |
| `sandbox/fishyboy` | FishyBoy's experimentation branch | ❌ Never |

Rules:
- `main` deploys automatically on push. Test before pushing.
- `launch` is safe to push without triggering production deploy.
- Merging direction: `sandbox/fishyboy` → `launch` (review first) →
  `main` (only when ready to ship to live).
- Never force-push to any of these branches (rewrites history, breaks
  the inter-Claude comms log).

---

## Roadmap status (snapshot from `TODO.md`)

### ✅ Live on solshot.gg (`main`)
- Phases 1–6: foundational code, escrow program (devnet), SHOT token
  (devnet), deployment, art assets, friends test
- Phase 7 partial: aiming overhaul, wall decay, AI Practice (Shot Bot),
  full design system redesign, post-match TrophyShareCard, MVP weapon
  tracking, code splitting

### 🚧 On `launch` (not promoted to live yet)
- **Phase 8** — Telegram Mini App (90% complete; bot live, deep links
  routed, embedded wallet wired; needs theme sync + closing confirmation
  + challenge sharing)
- **Phase 9A** — 3P/4P core (working in localhost; needs full QA pass)
- **Phase 10C** — SHOT consumables shop (5 consumables, drip economy)

### ⏳ Not started
- 7D — Public launch announcement (trailer, tweet, press)
- 7E — Escrow hardening (integration tests, replay-protection persistence)
- 9B — Seeker / dApp Store submission (blocked on Solana Mobile policy)
- 10A — SHOT mainnet launch (Metaplex metadata, Meteora LP, Jupiter listing)
- 10B — Wagering on mainnet
- 11A — Tournament mode
- 12A — Playwright E2E + load testing

---

## Vision

> *Pocket Tanks meets Solana DeFi.*

The pitch: **skill-based PvP wagering**, instant on-chain settlement,
genuinely fun gameplay. Small stakes (matches start at 0.01 SOL practice
mode), real outcomes. The hook is gameplay-first — players come back
because they like artillery duels, not because they're farming a token.

**Long-term ambition**: SolShot becomes the default lightweight
competitive game on Solana. The kind of thing you open in a Telegram
window during your lunch break and play three matches.

**Distribution channels (in priority order):**
1. solshot.gg (web, live)
2. Telegram Mini App (90% complete)
3. Solana Mobile / Seeker dApp Store (blocked)
4. Future: native iOS/Android via PWA → TWA → signed APK

---

## Conventions you should follow

- **Server: ES modules**, not CommonJS. `import`, `export`.
- **Client: standard CRA + react-app-rewired** for webpack overrides.
- **Inline styles in React** (CSS-in-JS pattern). The design system uses
  CSS custom properties for theming — see `client/src/index.css`.
- **Colour usage**: always reference design tokens (`var(--accent)`)
  instead of raw hex codes, EXCEPT in the Trophy share card and the
  in-match share card components which use fixed export-mode constants
  for html2canvas compatibility.
- **Commit messages**: conventional commits (`feat:`, `fix:`, `docs:`,
  `perf:`, `refactor:`). Multi-line body when the change is non-trivial.
- **Co-author tag**: When Claude makes commits, always end the message with:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## Where to ask for help

In ascending order of escalation:

1. Check `Docs/internal/DECISIONS.md` — the question may already be answered.
2. Check `Docs/internal/OPEN_QUESTIONS.md` — others may have asked similar.
3. Leave a note in `Docs/internal/CLAUDE_COMMS.md` for `main-claude`.
4. Leave a note tagged `@johnk` in `Docs/internal/OPEN_QUESTIONS.md`.
5. Ask FishyBoy directly in your session.

---

_Last updated: 2026-04-28._
