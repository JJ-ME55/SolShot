# SOLSHOT — MASTER TODO
## Updated: 30 Mar 2026

---

## STATUS KEY
- [ ] Not started
- [~] In progress
- [x] Complete

---

## COMPLETED (Phases 1–6)

All foundational code, on-chain programs, deployment, art assets, and friends testing are complete.
Collapsed for brevity — see git history for details.

<details>
<summary>Phase 1: Code Fixes & Polish (DONE)</summary>

- [x] 1A: Graphics issues (logo fallback, prestige badges, armory expansion)
- [x] 1B: Weapon logo audit (30→20, DRY refactor, missing PNGs resolved)
- [x] 1C: Wind physics (server + client, [-60,+60] px/s²)
- [x] 1D: Security hardening (helmet, rate-limit, CSPRNG, validation)
- [x] 1E: Disconnect/reconnect (30s window, turn timer, forfeit)
- [x] 1F: Match modes (Practice/Quick/Duel/High Roller, server-enforced)
- [x] E2E bug sweeps #1-3: mobile responsive, profanity filter, tank sinking, HUD fade, vertical sliders, shop overflow, stat card readability + export
</details>

<details>
<summary>Phase 2: Escrow & On-Chain (DONE — code complete)</summary>

- [x] 2A: Match escrow program (Anchor, devnet `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`)
- [x] 2B: SHOT token (devnet `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`, 10M supply, mint burned)
- [x] 2C: Prestige burns (SPL burn → server verification → tier unlock)
</details>

<details>
<summary>Phase 3: Deployment (DONE)</summary>

- [x] 3A: Deployment config (render.yaml, vercel.json, env examples)
- [x] 3B: Server deployed on Render
- [x] 3C: Client deployed on Vercel
- [x] 3D: solshot.gg domain registered + pointed
- [x] 3E: DNS, SSL, CORS all working — game playable on solshot.gg
</details>

<details>
<summary>Phase 4: Art & Assets (DONE)</summary>

- [x] 4A: All 20 weapon icon PNGs
- [x] 4B: Victory/defeat screen splash art
- [x] 4C: Sound effects (all mapped to existing files)
- [x] 4D: PWA icons (favicon, 192/512, maskable, apple-touch)
- [x] 4E: Stat card (persistent stats, html2canvas export)
</details>

<details>
<summary>Phase 5: Social & Legal (DONE)</summary>

- [x] 5A: Twitter/X @SolShotGG + Discord server
- [x] 5C: Terms of Service, Privacy Policy, ResponsibleGaming component, 18+ age requirement
</details>

<details>
<summary>Phase 6: Friends Test (DONE)</summary>

- [x] 6A: Smoke test (desktop + mobile, wallet connect, full match, stat card, profanity filter)
- [x] 6B: Bug fixes from friends testing
- [x] 6C: Teaser content (screen recordings, tweets, screenshots)
</details>

---

## PHASE 7: PUBLIC PRACTICE LAUNCH (Current)

Practice mode is LIVE on solshot.gg (main branch). New features on `launch` branch.

### 7A: Aiming Overhaul — Desktop [x]
- [x] Mouse-aim pointer handlers in MainScene (pointermove → angle + power, pointerdown → fire)
- [x] readOnly slider mode for AngleControl + PowerControl when mouse-aim active
- [x] Conditional FireButton (hidden on desktop when mouse-aim active)
- [x] useControlScheme hook (mouse vs classic, localStorage persistence)
- [x] Q/E keyboard aim still works as fallback

### 7C: Terrain Walls — Decay After 6 Turns [x]

- [x] `processWallShot` returns `wallPlacement` with original heights
- [x] Room tracks `walls[]` with `turnPlaced` timestamp
- [x] `decayWalls()` reverts terrain after 6 turns (tuneable constant)
- [x] `wallDecay` socket event updates client terrain
- [ ] Visual: walls could visually crack/fade on their final turn as a warning (nice-to-have)

### 7D: Go Public [~]
- [x] Leaderboard live and competitive
- [x] Demo practice mode live on solshot.gg
- [ ] Launch announcement tweet/thread from @SolShotGG
- [ ] Gameplay trailer (30-60 sec)
- [ ] Share to Discord, Solana communities, CT
- [ ] Players sharing stat cards organically
- [ ] Ongoing tweets teasing upcoming features

### 7E: Escrow Hardening [ ]

Run in parallel with public practice — stress-testing escrow behind the scenes.

- [ ] Integration test: full match flow with devnet wallets (create → deposit → play → settle)
- [ ] Stress test: multiple concurrent escrow matches
- [ ] Audit edge cases: timeout refund, cancel mid-match, double-settle attempt, player disconnect during deposit
- [ ] Verify `verifiedBurnTxs` replay protection survives server restart (currently in-memory Set — may need Redis or DB)

### 7F: AI Practice Mode (Shot Bot) [x] — `launch` branch

- [x] Server-side AI service (`server/services/ai.js`) — probabilistic aiming, weapon-aware selection, calibration
- [x] `createAIMatch` socket handler — creates room, injects Shot Bot, starts shop
- [x] `scheduleAITurn`/`executeAITurn` — server fires on AI's turn with 2.5-3.5s delay
- [x] "VS SHOT BOT" menu button + AIPracticeScreen (color picker, START)
- [x] White tank color (id: 8) reserved for Shot Bot
- [x] `isAIMatch` flag flows through shop → battle → win/lose
- [x] "PRACTICE VS AI — STATS NOT RECORDED" banner on results
- [x] Stats/milestones/settlement skipped for AI matches
- [x] AI rooms hidden from lobby, cleanup on disconnect
- [x] 40-turn matches (20 each) for practice

---

## PHASE 8: TELEGRAM MINI APP

Get SolShot into Telegram as a distribution channel. Embedded wallets mean zero friction — no Phantom required.

### 8A: Bot & Mini App Setup [x]
- [x] Create bot via BotFather (@SolShotGG_bot)
- [x] Wire Telegram middleware (telegramSocketMiddleware in server/index.js)
- [x] Register Mini App URL (t.me/SolShotGG_bot/solshot)
- [x] Landscape orientation + viewport handling (TelegramContext + Layout.js)

### 8B: Embedded Wallets (Dynamic) [x]
- [x] Chose Dynamic (cost-effective, free up to 10K users)
- [x] DynamicTelegramWallet.js — auto-create wallet on first play
- [x] Bridged to WalletContext (conditional: TG uses Dynamic, browser uses Phantom)
- [x] REACT_APP_DYNAMIC_ENV_ID configured

### 8C: Telegram-Specific UX [x]
- [x] TelegramShare button on Win/Lose screens (TG only)
- [x] Deep link invite: t.me/SolShotGG_bot/solshot?startapp=join_{roomId}
- [x] TG username auto-populated as callsign (skips HandleModal)

---

## PHASE 9: MULTI-PLAYER EXPANSION (3P/4P)

Expand beyond 1v1. Full brief in `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md`.

### 9A: 3-4 Player Mode — Core [x]
- [x] Server: `players[]` array replaces `host`/`player`, add `maxPlayers`, `currentPlayerIndex`
- [x] Server: N-player `getNextTurn()`, `isRoundOver()`, elimination logic, `getRoundPlacement()`
- [x] Server: expand room creation, join, ready, terrain generation for N players
- [x] Server: N-player fire handler with `playerEliminated` event
- [x] Client: `this.tanks[]` array replaces `createTank1()`/`createTank2()` in MainScene
- [x] Client: `myPlayerIndex === currentPlayerIndex` turn detection
- [x] Client: N HP bars, elimination visuals, turn indicator in React HUD
- [x] Client: player count selector in lobby, N-player waiting room
- [x] Escrow: N-player deposit/settle support

### 9A-QA: 3-4 Player QA & Polish [~]
- [x] Fix timeout handler: N-player forfeit (was hardcoded to players[0]/[1])
- [x] Fix ShopScreen pot display: wager * N (was hardcoded * 2)
- [x] Unhide player count selector (2P/3P/4P) in LobbyScreen
- [x] Spectator overlay for eliminated players (was already implemented)
- [ ] 3-player match: full flow test (create → join → shop → battle → elimination → results)
- [ ] 4-player match: same flow test
- [ ] Edge cases: mid-match disconnect with 3+ players, all-but-one eliminated
- [ ] HUD spacing for 3-4 HP bars on mobile
- [ ] Rematch flow with N players

### 9B: Seeker / dApp Store
- [ ] MWA integration (`@solana-mobile/wallet-standard-mobile`)
- [ ] PWA → TWA → signed APK via Bubblewrap CLI
- [ ] `assetlinks.json` hosted at `solshot.gg/.well-known/`
- [ ] Genesis Token badge detection in lobby
- [ ] `.skr` domain display for Seeker wallets
- [ ] **BLOCKER:** Confirm wagering policy with Solana Mobile (`#dapp-store` Discord)
- [ ] dApp Store submission (assets, legal, signed APK)

### 9C: Hull Upgrades / Tank Customization
- [ ] Persistent hull upgrades (increase hull strength over time)
- [ ] Visual tank customization (skins already planned, extend to hull/body mods)
- [ ] Upgrade progression system (earn through matches or spend SHOT)

---

## PHASE 10: TOKEN LAUNCH + WAGERING

SHOT token goes live. Wagering enabled.

### 10A: Token
- [ ] SHOT token metadata (Metaplex — name, symbol, image)
- [ ] SHOT token on mainnet
- [ ] Meteora single-sided LP
- [ ] Jupiter listing

### 10B: Wagering (1v1 first, then N-player)
- [ ] Enable wagered match modes (Quick Match, Duel, High Roller)
- [ ] Escrow live on mainnet
- [ ] N-player escrow extension (if 3P/4P is ready)
- [ ] Team takes initial funds from LP to support development

### 10C: SHOT Consumables Shop [x]

- [x] Per-match SHOT drip (2+3 wagered, 0.5+0.5 practice, 25/day cap)
- [x] 5 consumables: Extra Rations (5), Smoke Screen (8), Tactical Scope (12), Reinforced Armor (18), Overcharge (25)
- [x] Server: consumables.js service, buyConsumable handler, match-start effects, decrement after match
- [x] Client: LoadoutScreen with purchase flow, LOADOUT menu button
- [x] Client: consumable icons on PlayerHPBar (visible to all)
- [x] Client: Tactical Scope renders first 1/3 of physics trajectory (blocked by Smoke Screen)
- [x] Client: Overcharge raises power cap to 115 (Tank.js, PowerControl, mouse-aim, server validation)

---

## PHASE 11: TOURNAMENT MODE

### 11A: Tournament System
- [ ] Tournament creation (entry fee, player cap, prize structure)
- [ ] Bracket/series match flow
- [ ] Prize pool escrow + payout

---

## PHASE 12: PRODUCTION HARDENING & TEST INFRA

### 12A: Test Infrastructure
- [ ] Playwright E2E for two-player flow
- [ ] Server integration tests passing
- [ ] Load testing (50+ concurrent matches)

### 12B: Production Hardening [~]
- [x] Remove localhost from production CORS/CSP (env-aware)
- [x] `www.solshot.gg` → `solshot.gg` 301 redirect (server + Vercel)
- [x] Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- [x] Dynamic SDK domains added to CSP
- [ ] Cloudflare DDoS protection (needs DNS setup)
- [ ] Cloudflare caching rules (assets cached, API/WebSocket bypassed)

---

_This file is the single source of truth for SolShot project status. Update as tasks complete._
