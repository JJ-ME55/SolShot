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

### Active

(No active requirements — next milestone not yet defined)

### Out of Scope

- **Mainnet deployment** — separate process after code milestone, requires SOL for deploy fees
- **Meteora DAMM v2 pool** — external, requires mainnet deploy first
- **SquadsX multisig setup** — external operational task
- **Telegram bot activation** — human task (BotFather registration)
- **Social media posting/community** — human tasks (X, Reddit, Discord)
- **Demo video recording** — human task
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
- **v1.3 4-Player Multiplayer:** 5 phases, 10 plans. Full N-player refactor (server + client), 56/56 requirements met.

### Master Checklist Audit (24 Feb 2026)

Full audit of 280-item Master Quality & Launch Checklist revealed ~153 PASS / ~110 FAIL / ~95 PARTIAL.
Many "failures" are design decisions (4 states, 24h timeout, PDA seeds), not bugs.

### Known Tech Debt (from v1.3 audit)

- SHOT milestone recording only covers players[0] and players[1] — players 3/4 miss rewards
- playAgain resetForPlayAgain doesn't pass maxPlayers to createMatchState
- bridge.onEliminated callback dead wire (no functional impact)
- tank1/tank2 shims in GameBridge state (no active readers)
- Color de-dup is client-only (cosmetic race condition)

## Constraints

- **Security preservation:** Do NOT modify lib.rs, guards.js, or core auth handlers
- **Backward compatibility:** 2-player (`maxPlayers: 2`) must work identically to current 1v1
- **Server-authoritative:** All HP, positions, turn state live on server
- **Tank colours:** red #E63946, blue #4A90D9, green #52B788, yellow #FFD166
- **Devnet only:** All blockchain features on devnet until mainnet deploy
- **Build tooling:** react-app-rewired + config-overrides.js for polyfills
- **Codebase location:** `C:\Users\johnk\SolShot`

## Current State

v1.3 shipped. Full 2-4 player multiplayer working in practice mode. 15 source files changed, 2067 insertions, 682 deletions across 5 phases and 10 plans. N-player escrow deferred (requires lib.rs changes). 8 tech debt items tracked, none critical.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Server-authoritative physics | Prevent cheating | ✓ Good |
| 4-state escrow (not 8) | Simpler, covers all cases | ✓ Good |
| 24h timeout (not 30-60min) | Generous for network issues | ✓ Good |
| PDA from match_id (not pubkeys) | Simpler derivation | ✓ Good |
| 2min deposit (not 3min) | Faster match start | ✓ Good |
| Self-hosted Telegram SDK | CDN updates in-place, breaks SRI | ✓ Good |
| Do NOT touch lib.rs | Preserves 3 audit certifications | ✓ Good — held across v1.1-v1.3 |
| Jupiter Terminal for in-game swaps | Hackathon requirement + revenue | ✓ Good — 0.5% fee |
| Practice mode as default tab | Onboarding-first approach | ✓ Good |
| 4-player practice first, escrow later | Escrow needs lib.rs changes (audit risk) | ✓ Good — shipped v1.3 cleanly |
| players[] array (not host/player) | Scales to N, single code path | ✓ Good — zero legacy refs remain |
| Placement scoring (4th=0..1st=3) | Fair N-player scoring for BO3/BO5 | ✓ Good |
| No early exit in isMatchOver | All rounds always played for fairness | ✓ Good |
| Wager guard for 3-4 players | Practice-only until escrow supports N | ✓ Good — clear error message |
| Dual-payload pattern (positions[] + tankPositions) | Backward compat during migration | ✓ Good — clean transition |
| Quick Match hardcoded to 2-player | 3-4p uses Custom Challenge | ✓ Good — simplifies matchmaking |
| Timeout >2 alive = elimination, <=2 = forfeit | Different behavior appropriate for each | ✓ Good |

---
*Last updated: 27 Feb 2026 after v1.3 milestone*
