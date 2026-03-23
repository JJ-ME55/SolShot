# SolShot — Project Document

## What This Is

Browser-based multiplayer artillery combat game (2-4 players) on Solana where players wager real SOL. Matches are settled trustlessly via on-chain escrow. The SHOT token drives a deflationary prestige economy — earn through combat, burn to unlock exclusive weapons.

## Core Value

Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

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
- N-player server room: players[] array (2-4 slots), maxPlayers field, getPlayerSlot helper — v1.3
- N-player match engine: turn rotation, elimination-skip, placement scoring (4th=0..1st=3) — v1.3
- N-player battle: fire handler damages all N, playerEliminated events, homing nearest-enemy — v1.3
- N-player terrain: generateTankPositions(heightmap, N) with zone distribution — v1.3
- N-player gold: initGold(playerIds[]), awardPlacementGold with tiered 300/150/75/0G — v1.3
- N-player systems: shop waits for all N done, reconnect preserves playerIndex, wager guard — v1.3
- Client Phaser: tanks[] array, myPlayerIndex turn detection, elimination wreckage, spectator mode — v1.3
- React HUD: N HP bars (PlayerHPBar), turn arrow, elimination overlay, Leave Match, FINAL STANDINGS — v1.3
- Lobby UI: player count selector (2/3/4), N-slot waiting room, color de-dup, room badges — v1.3
- 2-player backward compatibility preserved across all N-player changes — v1.3
- N-player Anchor escrow: players[4] array, deposits_mask bitmap, 10-min timeout, start_with_depositors — v1.4
- N-player settlement: wager * deposits_mask.count_ones(), 90/7/3 BPS split, winner-takes-all — v1.4
- Cancel/reclaim via remaining_accounts pattern (no hardcoded player accounts) — v1.4
- Server escrow services: N-player createMatchEscrow, cancelMatchEscrow, settleMatch, refundWager — v1.4
- Socket handlers: 5-min deposit timeout, 3-branch partial flow (all/zero/partial), host decision — v1.4
- Client deposit UX: per-player badges, countdown timer, partial decision UI, kick notification — v1.4
- BattleScreen N-player pot display with defensive fallback chain — v1.4
- Wager guard removed — 3-4 player wagered matches allowed — v1.4
- SHOT milestone recording for all N players (not just first 2) — v1.4
- playAgain preserves maxPlayers for N-player rematches — v1.4

### Active

#### Current Milestone: v3.0 — Public Practice Launch

**Goal:** Overhaul aiming controls for intuitive game feel on desktop and mobile, add terrain wall decay for balance, harden escrow for mainnet readiness, and go public with community launch.

**Target features:**
- Desktop mouse-aim: cursor position relative to tank sets angle + power, left-click fires
- Mobile tap-to-aim: tap canvas to rotate turret to that angle, power via slider, FIRE button to shoot
- Control scheme toggle in settings/menu (classic sliders vs new aiming)
- Terrain wall decay: Magic Walls expire after N rounds instead of permanent
- Go public: launch tweets, gameplay trailer, leaderboard, community building
- Escrow hardening: integration test, stress test, edge case audit (parallel with practice)

### Out of Scope

- **Mainnet deployment** — separate process after code milestone, requires SOL for deploy fees
- **Meteora DAMM v2 pool** — external, requires mainnet deploy first
- **SquadsX multisig setup** — external operational task
- **Telegram bot activation** — human task (BotFather registration)
- **Social media posting/community** — human tasks (X, Reddit, Discord)
- **Demo video recording** — human task
- **Match replay system** — complex new feature, deferred to v1.4+
- **Seeker/dApp Store** — distribution channel, deferred to after escrow upgrade
- **Secrets manager migration** — deferred to mainnet operational readiness
- **Error monitoring (Sentry)** — external service setup
- **Horizontal scaling** — H060 deferred, single server acceptable at launch

## Context

### Previous Milestones

- **v1.0 (pre-GSD):** Core game, escrow, SHOT token, prestige burns, art assets, deployment config
- **v1.1 Security Hardening:** 8 phases, 25 plans. Three security audits (SOS, DB, BOK) all PASS.
- **v1.2 Launch Readiness:** 6 phases, 15 plans. Jupiter integration, UI polish, stats pipeline, onboarding, security, checklist re-audit.
- **v1.3 4-Player Multiplayer:** 5 phases, 10 plans. Full N-player refactor (server + client), 56/56 requirements met.
- **v1.4 N-Player Escrow:** 4 phases, 10 plans. Full-stack escrow upgrade for 2-4 player wagered matches, 42/42 requirements met.
- **v2.0 Practice Mode Public Launch:** 5 phases. Handle system, token masking, lobby lockdown, practice stats, How To Play. Demo live at solshot.gg.

### Master Checklist Audit (24 Feb 2026)

Full audit of 280-item Master Quality & Launch Checklist revealed ~153 PASS / ~110 FAIL / ~95 PARTIAL.
Many "failures" are design decisions (4 states, 24h timeout, PDA seeds), not bugs.

### Known Tech Debt (from v1.4 audit)

- tests/solshot-escrow.ts uses old 2-player API — TS integration tests cannot run against new program
- Stale comment on PERMISSIONLESS_RECLAIM_TIMEOUT says '172800 seconds' (actual: 1200)
- Stale comment 'Both players deposited' in main.js (code correctly uses N-player logic)
- bridge.onEliminated callback dead wire (no functional impact)
- tank1/tank2 shims in GameBridge state (no active readers)
- Color de-dup is client-only (cosmetic race condition)

## Constraints

- **Security preservation:** Do NOT modify guards.js or core auth handlers (lib.rs modifications now in scope for v1.4)
- **Backward compatibility:** 2-player (`maxPlayers: 2`) must work identically to current 1v1
- **Server-authoritative:** All HP, positions, turn state live on server
- **Tank colours:** red #E63946, blue #4A90D9, green #52B788, yellow #FFD166
- **Devnet only:** All blockchain features on devnet until mainnet deploy
- **Build tooling:** react-app-rewired + config-overrides.js for polyfills
- **Codebase location:** `C:\Users\johnk\SolShot`

## Current State

v2.0 shipped. Demo live at solshot.gg with practice mode. Starting v3.0: overhaul aiming controls (mouse-aim desktop, tap-to-aim mobile), add terrain wall decay, harden escrow, and go public. Working on `launch` branch — `main` stays stable for the live demo.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Server-authoritative physics | Prevent cheating | ✓ Good |
| 4-state escrow (not 8) | Simpler, covers all cases | ✓ Good |
| 24h timeout (not 30-60min) | Generous for network issues | ✓ Good |
| PDA from match_id (not pubkeys) | Simpler derivation | ✓ Good |
| 2min deposit (not 3min) | Faster match start | ✓ Good |
| Self-hosted Telegram SDK | CDN updates in-place, breaks SRI | ✓ Good |
| Do NOT touch lib.rs | Preserves 3 audit certifications | ⚠️ Revisit — relaxed for v1.4, re-audit planned |
| Jupiter Terminal for in-game swaps | Hackathon requirement + revenue | ✓ Good — 0.5% fee |
| Practice mode as default tab | Onboarding-first approach | ✓ Good |
| 4-player practice first, escrow later | Escrow needs lib.rs changes (audit risk) | ✓ Good — shipped v1.3 cleanly |
| players[] array (not host/player) | Scales to N, single code path | ✓ Good — zero legacy refs remain |
| Placement scoring (4th=0..1st=3) | Fair N-player scoring for BO3/BO5 | ✓ Good |
| No early exit in isMatchOver | All rounds always played for fairness | ✓ Good |
| Wager guard for 3-4 players | Practice-only until escrow supports N | ✓ Good — will be removed in v1.4 |
| Accept re-audit risk for lib.rs | N-player escrow needed for real gameplay | ✓ Good — 69 cargo tests, audit passed |
| Winner-takes-all N-player | Same model as 2-player, simpler than placement split | ✓ Good — clean implementation |
| Equal wagers only | Simpler PDA, fairer gameplay | ✓ Good — one wager field per match |
| 5-10 min deposit timeout (not 24h) | More players = higher chance of no-show | ✓ Good — 5 min client, 10 min on-chain |
| Partial deposit: start or cancel choice | Depositors decide, not auto-cancel | ✓ Good — host UI with clear options |
| deposits_mask bitmap (not bool array) | Single u8 tracks 4 players, efficient | ✓ Good — count_ones() for pot math |
| remaining_accounts for cancel/reclaim | No named player accounts in structs | ✓ Good — scales to any N |
| Dual-payload pattern (positions[] + tankPositions) | Backward compat during migration | ✓ Good — clean transition |
| Quick Match hardcoded to 2-player | 3-4p uses Custom Challenge | ✓ Good — simplifies matchmaking |
| Timeout >2 alive = elimination, <=2 = forfeit | Different behavior appropriate for each | ✓ Good |

| 2-player only for public launch | Ship clean, get feedback, then expand to 4p | ✓ Good — demo live |
| Handle system (not wallet) for identity | Zero friction onboarding, no wallet required | ✓ Good — shipped v2.0 |
| Token masking for practice launch | Hide SHOT/Jupiter until wagering goes live | ✓ Good — shipped v2.0 |
| Mouse-aim desktop, tap-to-aim mobile | Intuitive game feel, lower friction than sliders | — Pending |
| Control scheme toggle in settings | Let players choose classic vs new controls | — Pending |
| Terrain wall decay (N rounds) | Prevent permanent map gridlock in long matches | — Pending |
| `launch` branch for dev, `main` for live demo | Protect live demo while building new features | ✓ Good — branches created |

---
*Last updated: 28 Feb 2026 after v2.0 milestone started*
