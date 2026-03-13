# SOLSHOT — MASTER TODO
## Updated: 10 Mar 2026

---

## STATUS KEY
- [ ] Not started
- [~] In progress
- [x] Complete

---

## COMPLETED (Phases 1–4)

All foundational code, on-chain programs, deployment, and art assets are complete.
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

---

## PHASE 6: FRIENDS TEST (Current — ~few days)

Private testing with close circle before going public.

### 6A: Smoke Test
- [ ] `https://solshot.gg` loads on desktop + mobile
- [ ] Wallet connect works (Phantom/Solflare)
- [ ] Two players: create practice match → join via OPEN LOBBIES → full game plays through
- [ ] Stat card export works (desktop + mobile)
- [ ] Mobile: vertical sliders, HUD fade, menu logo, shop READY button
- [ ] Profanity filter blocks test words (e.g. "j3w")
- [ ] No red console errors (CORS, mixed content, CSP)

### 6B: Bug Fixes from Friends Testing
- [ ] Collect feedback, fix issues as they come up

### 6C: Teaser Content (during friends test)
- [ ] Screen recordings of gameplay
- [ ] Teaser tweets from @SolShotGG
- [ ] 5-10 gameplay screenshots

---

## PHASE 7: PUBLIC PRACTICE LAUNCH

Practice mode goes live. Build community and hype.

### 7A: UX Improvements (from friends testing)
- [ ] Mouse-aim + click-to-fire on desktop (hover to aim turret, click to shoot)
- [ ] Touch-drag aim on mobile (Angry Birds style — finger drag to rotate cannon)
- [ ] Terrain walls persist for X rounds instead of permanent (balance tweak)

### 7B: Go Public
- [ ] Launch announcement tweet/thread
- [ ] Gameplay trailer (30-60 sec)
- [ ] Share to Discord, Solana communities

### 7C: Community Building
- [ ] Leaderboard live and competitive
- [ ] Players sharing stat cards
- [ ] Ongoing tweets teasing upcoming wagering + token launch

### 7D: Escrow Hardening (Claude + John, during public practice)
- [ ] Integration test: full match flow with devnet wallets
- [ ] Stress test escrow (multiple concurrent matches)
- [ ] Audit escrow edge cases (timeout, cancel, double-settle)

---

## PHASE 8: TOKEN LAUNCH + WAGERING (1v1)

SHOT token goes live. Wagering enabled for 1v1.

### 8A: Token
- [ ] SHOT token metadata (Metaplex — name, symbol, image)
- [ ] SHOT token on mainnet
- [ ] Meteora single-sided LP
- [ ] Jupiter listing

### 8B: Wagering 1v1
- [ ] Enable wagered match modes (Quick Match, Duel, High Roller)
- [ ] Escrow live on mainnet
- [ ] Team takes initial funds from LP to support development

### 8C: SHOT Consumables Shop

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

## PHASE 9: MULTI-PLAYER EXPANSION (3P/4P)

Expand beyond 1v1.

### 9A: 3-4 Player Mode
- [ ] Server: expand room/match logic for 3-4 players
- [ ] Client: HUD, turn order, HP bars for 3-4 tanks
- [ ] Wagered 3P/4P matches
- [ ] Seeker/mobile optimization pass

### 9B: Hull Upgrades / Tank Customization
- [ ] Persistent hull upgrades (increase hull strength over time)
- [ ] Visual tank customization (skins already planned, extend to hull/body mods)
- [ ] Upgrade progression system (earn through matches or spend SHOT)

### 9C: Seeker Focus
- [ ] Optimize for Seeker device
- [ ] Saga/Seeker dApp store submission

---

## PHASE 10: TOURNAMENT MODE

Players enter and compete in a series of matches for a prize pool.

### 10A: Tournament System
- [ ] Tournament creation (entry fee, player cap, prize structure)
- [ ] Bracket/series match flow
- [ ] Prize pool escrow + payout

---

## PHASE 11: PLATFORM EXPANSION

### 11A: Telegram Mini App
- [ ] Create bot via BotFather
- [ ] Wire middleware (code exists, just enable)
- [ ] Test Mini App after deploy
- [ ] Wallet solution (Privy/Dynamic for embedded wallets)

### 11B: Test Infrastructure
- [ ] Playwright E2E for two-player flow
- [ ] Server integration tests passing
- [ ] Load testing (50+ concurrent matches)

### 11C: Production Hardening
- [ ] Cloudflare DDoS protection
- [ ] Cloudflare caching rules (assets cached, API/WebSocket bypassed)
- [ ] Remove localhost from production CORS
- [ ] `www.solshot.gg` redirect

---

_This file is the single source of truth for SolShot project status. Update as tasks complete._
