# SolShot — Project Document

## What This Is

Browser-based multiplayer artillery combat game (2-4 players) on Solana where players wager real SOL. Matches are settled trustlessly via on-chain escrow. The SHOT token drives a deflationary prestige economy — earn through combat, burn to unlock exclusive weapons.

## Core Value

Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## Current Milestone: v1.3 — 4-Player Multiplayer

**Goal:** Refactor SolShot from 1v1 to 2-4 player last-man-standing while preserving all existing 2-player functionality.

**Target features:**
- Server room refactor: `host`/`player` → `players[]` array (2-4 slots)
- N-player turn rotation with elimination (skip dead players)
- N-player HP tracking, elimination events, last-man-standing win condition
- Client Phaser: dynamic tank array, `myPlayerIndex` turn detection
- React HUD: N HP bars with colour-coding, elimination state, turn indicator
- Lobby: player count selector (2/3/4), N-player waiting room
- All existing systems (gold, weapons, shop, wind, terrain) working for N players
- Practice mode first — escrow N-player changes deferred

## Tech Stack
- **Client:** React 18 + Phaser 3 (CRA with react-app-rewired), @solana/wallet-adapter
- **Server:** Express + Socket.IO (ES modules), Mongoose/MongoDB
- **Blockchain:** Solana (Anchor 0.32.1), SPL Token
- **Deploy:** Vercel (client) + Render (server) + MongoDB Atlas
- **Domain:** solshot.gg

## Requirements

### Validated

- Server-authoritative physics for all 20 weapons (15 base + 5 prestige)
- HP system (250 HP per round)
- Gold economy (1000G start, +15G/HP damage, +200G kill, +300G round win)
- Match modes: Practice/Quick Match/Duel/High Roller with server-enforced constraints
- BO1/BO3/BO5 with gold+weapon carryover between rounds
- Wind physics ([-60,+60] per round)
- Destructible terrain (1D heightmap, server-authoritative deformation)
- Disconnect/reconnect (30s window, wallet-keyed rejoin, 60s turn timer)
- Escrow program (Anchor, PDA-based, 90/7/3 BPS split, 24h timeout)
- SHOT token (10M supply, 9 decimals, mint authority burned, devnet)
- Prestige burns (SPL burn → tier unlock, on-chain verification)
- Persistent stats (MongoDB User model, wallet-linked)
- Combat Card (standalone HTML — needs React integration)
- Win/Lose hero screens
- PWA icons, favicon, branding assets (54 images)
- Security: helmet, rate-limit, CSPRNG, turn validation, async mutex, CSP, TX validation
- Three security audits completed: SOS (contract), DB (server+client), BOK (math) — all PASS
- Jupiter Mobile wallet adapter (top of wallet list with Reown) — v1.2
- Jupiter Price API V3 — live SHOT/SOL price across all screens — v1.2
- Jupiter Terminal SDK — SOL→SHOT swaps with 0.5% platform fee — v1.2
- SHOT price ticker in global header — v1.2
- Landing screen (ecosystem partners, CTAs, skill-not-luck tagline) — v1.2
- Post-match UX (milestones, prestige progress, escrow explainer, X/Twitter share, Jupiter swap) — v1.2
- Stats pipeline (MongoDB persist → socket serve → BarracksScreen + CombatCard) — v1.2
- Onboarding flows (wallet help, SHOT explainer, prestige intro, FAQ) — v1.2
- Client security (source maps disabled, CSP report-uri, console.log cleanup) — v1.2
- Mobile polish (haptic feedback, Telegram share, dApp browser detection) — v1.2
- 221-item checklist re-audit with scored summary (91/195, 47%) — v1.2

### Active

- [ ] 4-player multiplayer: server room object refactor (players[] array)
- [ ] 4-player multiplayer: N-player match.js (turn rotation, elimination, isRoundOver)
- [ ] 4-player multiplayer: main.js socket handlers for N players
- [ ] 4-player multiplayer: client Phaser N-tank system
- [ ] 4-player multiplayer: React HUD N HP bars + elimination state
- [ ] 4-player multiplayer: lobby UI (player count selector, N-player waiting room)
- [ ] 4-player multiplayer: gold/shop/weapon systems for N players
- [ ] 4-player multiplayer: disconnect/reconnect for N players

### Out of Scope

- **Mainnet deployment** — separate process after code milestone, requires SOL for deploy fees
- **Meteora DAMM v2 pool** — external, requires mainnet deploy first
- **SquadsX multisig setup** — external operational task
- **Telegram bot activation** — human task (BotFather registration)
- **Social media posting/community** — human tasks (X, Reddit, Discord)
- **Demo video recording** — human task
- **Hackathon submission form** — human task at matrix.playsolana.com
- **Match replay system** — complex new feature, deferred to v1.4+
- **N-player escrow** — requires lib.rs changes, separate milestone after game logic works
- **Seeker/dApp Store** — distribution channel, deferred to after 4-player works
- **lib.rs modifications** — preserves SOS/DB/BOK audit certifications
- **Secrets manager migration** — deferred to mainnet operational readiness
- **Error monitoring (Sentry)** — external service setup
- **Horizontal scaling** — H060 deferred, single server acceptable at launch

## Context

### Previous Milestones

- **v1.0 (pre-GSD):** Core game, escrow, SHOT token, prestige burns, art assets, deployment config
- **v1.1 Security Hardening:** 8 phases, 25 plans. Three security audits (SOS, DB, BOK) all PASS.
- **v1.2 Launch Readiness:** 6 phases, 15 plans. Jupiter integration, UI polish, stats pipeline, onboarding, security, checklist re-audit.
- **v1.3 4-Player Multiplayer:** In progress. Refactor from 1v1 to 2-4 player last-man-standing.

### Master Checklist Audit (24 Feb 2026)

Full audit of 280-item Master Quality & Launch Checklist revealed ~153 PASS / ~110 FAIL / ~95 PARTIAL.
Many "failures" are design decisions (4 states, 24h timeout, PDA seeds), not bugs.

### Hackathon

Jupiter & Jupiter Mobile track. Deadline: February 25, 2026.

## Constraints

- **Security preservation:** Do NOT modify lib.rs, guards.js, or core auth handlers
- **Backward compatibility:** 2-player (`maxPlayers: 2`) must work identically to current 1v1
- **Practice mode first:** Game logic before escrow changes
- **Server-authoritative:** All HP, positions, turn state live on server
- **Tank colours:** red #E63946, blue #4A90D9, green #52B788, yellow #FFD166
- **Devnet only:** All blockchain features on devnet until mainnet deploy
- **Build tooling:** react-app-rewired + config-overrides.js for polyfills
- **Codebase location:** `C:\Users\johnk\SolShot`

## Current State

v1.3 started. Refactoring from 1v1 to 2-4 player last-man-standing. Practice mode first, escrow changes deferred. Brief at `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md` Part 2.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Server-authoritative physics | Prevent cheating | ✓ Good |
| 4-state escrow (not 8) | Simpler, covers all cases | ✓ Good — update checklist |
| 24h timeout (not 30-60min) | Generous for network issues | ✓ Good — update checklist |
| PDA from match_id (not pubkeys) | Simpler derivation | ✓ Good — update checklist |
| 2min deposit (not 3min) | Faster match start | ✓ Good — update checklist |
| Self-hosted Telegram SDK | CDN updates in-place, breaks SRI | ✓ Good — update checklist |
| Do NOT touch lib.rs in v1.2 | Preserves 3 audit certifications | ✓ Good — held |
| Jupiter Terminal for in-game swaps | Hackathon requirement + revenue | ✓ Good — 0.5% fee |
| Practice mode as default tab | Onboarding-first approach | ✓ Good |
| CHK-02 security re-check skipped | Major changes upcoming | — Deferred |
| 4-player practice first, escrow later | Escrow needs lib.rs changes (audit risk) | — Pending |
| players[] array (not host/player) | Scales to N, single code path | — Pending |

---
*Last updated: 26 Feb 2026 after v1.3 milestone started*
