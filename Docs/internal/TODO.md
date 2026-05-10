# SOLSHOT — MASTER TODO
## Updated: 23 Mar 2026

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

Practice mode goes live. The game needs to feel tight and intuitive before anyone outside our circle touches it. This phase is about controls, game feel, community presence, and escrow confidence.

### 7A: Aiming Overhaul — Desktop

**Current state:** Turret aim is controlled by Q/E keys (rotate in Phaser) or a React slider (AngleControl.js). Power is a separate slider. Fire is a button click via GameBridge → `handleFireFromReact()`. This works but feels clunky — two separate sliders for what should be one fluid gesture.

**Target:** Mouse-aim + click-to-fire.
- Hover cursor over the game canvas to aim the turret — turret barrel tracks mouse position relative to the tank
- Mouse position maps to both **angle** (direction from tank to cursor) AND **power** (distance from tank to cursor, clamped to [5, 100] range)
- Left-click to fire
- The existing React sliders stay visible as **readouts** (showing current angle/power values) but are no longer the primary input — mouse position drives them
- Implementation touches: `MainScene` needs a `pointermove` listener that calculates angle + power from cursor position relative to the active tank, then calls `bridge.setAngle()` and `bridge.setPower()` to keep React HUD in sync. `pointerdown` calls `bridge.fire()`
- Q/E keyboard aim should still work as a fallback/fine-tune on top of mouse aim
- Key constraint: only tracks when it's your turn (check `myPlayerIndex === currentPlayerIndex`)

### 7B: Aiming Overhaul — Mobile

**Current state:** Vertical sliders on screen edges (left = angle, right = power) plus FIRE button. Functional but fiddly on small screens — hard to dial in precise angles with a fat thumb on a thin slider.

**Target:** Touch-drag aim (Angry Birds style).
- Touch and drag from your tank to set angle + power in one gesture
- Drag direction = aim direction (inverted — drag left to shoot right, like pulling back a slingshot)
- Drag distance = power (further pull = more power)
- Release to fire (or tap a confirm button — TBD based on feel)
- Show a dotted guide line from tank in the aim direction while dragging (client-only, not a trajectory preview — just direction + power indicator)
- Existing sliders become read-only indicators during drag, or hide entirely on mobile
- Must work in landscape orientation
- Touch target: entire game canvas area, not a small button

### 7C: Terrain Walls — Decay After X Rounds

**Current state:** Magic Wall (weapon ID 12) creates an 8px wide, 140px tall permanent terrain barrier via `processWallShot()` in physics.js. Once placed, walls never degrade — they accumulate and can gridlock the map in longer matches.

**Target:** Walls persist for N rounds (suggest 3-5, tuneable), then crumble.
- Server tracks wall placements: `{ x, width, height, roundPlaced }` per room
- Each round start, check wall age → if expired, revert that section of heightmap
- Visual: walls could visually crack/fade on their final round as a warning
- Balances the meta — walls become tactical tempo plays, not permanent map control

### 7D: Go Public

- [ ] Launch announcement tweet/thread from @SolShotGG
- [ ] Gameplay trailer (30-60 sec)
- [ ] Share to Discord, Solana communities, CT
- [ ] Leaderboard live and competitive
- [ ] Players sharing stat cards organically
- [ ] Ongoing tweets teasing upcoming features

### 7E: Escrow Hardening (Claude + John, during public practice)

Run in parallel with public practice — players are on practice mode, we're stress-testing escrow behind the scenes.

- [ ] Integration test: full match flow with devnet wallets (create → deposit → play → settle)
- [ ] Stress test: multiple concurrent escrow matches
- [ ] Audit edge cases: timeout refund, cancel mid-match, double-settle attempt, player disconnect during deposit
- [ ] Verify `verifiedBurnTxs` replay protection survives server restart (currently in-memory Set — may need Redis or DB)

---

## PHASE 8: TELEGRAM MINI APP

Get SolShot into Telegram as a distribution channel. Embedded wallets mean zero friction — no Phantom required.

### 8A: Bot & Mini App Setup
- [ ] Create bot via BotFather
- [ ] Wire Telegram middleware (code exists in codebase, just enable)
- [ ] Deploy and test Mini App loads inside Telegram
- [ ] Landscape orientation + viewport handling inside TG WebApp

### 8B: Embedded Wallets (Privy or Dynamic)
- [ ] Evaluate Privy vs Dynamic for embedded wallet UX
- [ ] Integrate chosen provider — auto-create wallet on first play, no seed phrase
- [ ] Bridge embedded wallet to existing `WalletContext` so game code doesn't change
- [ ] Test: user opens TG → plays match → wallet created silently → ready for future wagering

### 8C: Telegram-Specific UX
- [ ] Share match results to Telegram chat (stat card or text summary)
- [ ] Invite friend via TG deep link → opens Mini App → joins lobby
- [ ] TG username as callsign option (or auto-populate)

---

## PHASE 9: MULTI-PLAYER EXPANSION (3P/4P)

Expand beyond 1v1. Full brief with code-level implementation details in `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md`.

### 9A: 3-4 Player Mode
- [ ] Server: `players[]` array replaces `host`/`player`, add `maxPlayers`, `currentPlayerIndex`
- [ ] Server: N-player `getNextTurn()`, `isRoundOver()`, elimination logic
- [ ] Server: expand room creation, join, ready, terrain generation for N players
- [ ] Server: N-player fire handler with `playerEliminated` event
- [ ] Client: tank array replaces `createTank1()`/`createTank2()` in MainScene
- [ ] Client: `myPlayerIndex === currentPlayerIndex` turn detection
- [ ] Client: N HP bars, elimination visuals, turn indicator in React HUD
- [ ] Client: player count selector in lobby, N-player waiting room

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

SHOT token goes live. Wagering enabled. Runs alongside or after Phase 9 — token + LP can launch while 3P/4P is in dev, wagering flips on when ready.

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

### 10C: SHOT Consumables Shop

New shop section where players spend SHOT tokens on temporary power-ups. Each consumable lasts **5 matches** then expires. SHOT is **burned on purchase** — permanent supply sink that creates real token demand without being pay-to-win.

**Consumables:**

1. **Tactical Scope** — Shows a 2-3 dot trajectory preview line from the barrel tip, giving a rough indication of shot arc. Not a full trajectory — just enough to reduce guesswork for new players.

2. **Reinforced Armor** — +25 bonus HP per match (start at 275 instead of 250). Doesn't stack. Visible to opponent via a small shield icon on the HP bar.

3. **Overcharge** — Power slider max increases from 100 to 115, giving ~15% extra range on all weapons. Subtle but meaningful for long-range shots across big terrain gaps.

4. **Extra Rations** — Start each match with 1200G instead of 1000G in the weapon shop. One extra mid-tier weapon or two cheap ones. Advantage fades as rounds progress and gold accumulates naturally.

5. **Smoke Screen** — Blocks the opponent's Tactical Scope if they have one active. Their preview dots disappear for the duration of your Smoke Screen. Counter-play item — only useful if the opponent bought Scope.

**Implementation:**
- [ ] Server: consumable state per player (type, matchesRemaining) stored in MongoDB User model
- [ ] Server: apply effects at match start (bonus HP, gold, power cap) and decrement counter
- [ ] Server: SHOT burn verification on purchase (reuse prestige burn flow)
- [ ] Client: consumables tab in weapon shop or dedicated pre-match shop screen
- [ ] Client: active consumable indicators on HUD (small icons)
- [ ] Client: Tactical Scope renderer — 2-3 dots along local trajectory calculation
- [ ] Client: Smoke Screen — suppress Scope rendering when opponent has it active
- [ ] Pricing TBD — ballpark 25-100 SHOT per consumable depending on power level

---

## PHASE 11: TOURNAMENT MODE

Players enter and compete in a series of matches for a prize pool.

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

### 12B: Production Hardening
- [ ] Cloudflare DDoS protection
- [ ] Cloudflare caching rules (assets cached, API/WebSocket bypassed)
- [ ] Remove localhost from production CORS
- [ ] `www.solshot.gg` redirect

---

_This file is the single source of truth for SolShot project status. Update as tasks complete._
