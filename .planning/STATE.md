# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 26 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.3 — 4-Player Multiplayer, Phase 15: Server Core Services

## Current Position

Milestone: v1.3 — 4-Player Multiplayer
Phase: 15 of 19 (Server Core Services)
Plan: 1 of 2 in Phase 15
Status: In progress
Last activity: 26 Feb 2026 — Completed 15-01-PLAN.md (match.js N-player rewrite)

Progress: [█░░░░░░░░░] ~2% (1/56 v1.3 plans)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)

**Total across all milestones:** 55 plans, 22 phases

## Accumulated Context

### Key Decisions (carried forward)
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- Three audits complete: SOS, DB, BOK — all PASS
- Do NOT modify lib.rs — preserves audit certifications
- Jupiter Mobile via Reown, Price API V3, Terminal SDK with 0.5% platform fee
- Practice mode as default landing tab
- Self-hosted Telegram SDK (supply chain security)
- 4-player: practice mode first, escrow N-player changes deferred
- 4-player: players[] array replaces host/player binary structure
- 4-player: BO1/BO3/BO5 all supported with placement scoring (4th=0, 3rd=1, 2nd=2, 1st=3)
- 4-player: all slots must fill before start (no AI bots, no empty slots)
- 4-player: color CHOICE with duplicate prevention (red/blue/green/yellow)
- 4-player: wager modes with 3-4 players are practice-only until escrow upgrade
- Tank colours: red #E63946, blue #4A90D9, green #52B788, yellow #FFD166
- 15-01: players[] intentionally empty at createMatchState; populated at requestTerrain (Plan 15-02)
- 15-01: isMatchOver has no early exit — all rounds always played; winner by cumulative placementPoints
- 15-01: getRoundWinner removed; getRoundPlacement returns ranked[] with PLACEMENT_POINTS[3,2,1,0]
- 15-01: roundWins[1st] side-effect kept in getRoundPlacement for backward compat with disconnect chain
- 15-01: isRoundOver uses alive map with HP fallback until Phase 16 updates fire handler

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- QA sessions (A4-A8 gameplay testing)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy
- main.js is ~1800+ lines — search by function name, not line number
- Phase 15 critical RESOLVED: isRoundOver now uses alive map (was ending on first kill) — done in 15-01
- Phase 16 critical: fix room.active flag (blocks players 3+ from joining) simultaneously with schema migration
- Plan 15-02: main.js must update imports (getRoundPlacement not getRoundWinner), drop hostId/playerId params from getNextTurn and isMatchOver call sites

## Session Continuity

Last session: 2026-02-26 12:17 UTC
Stopped at: Completed 15-01-PLAN.md — match.js N-player rewrite committed (2dbdd37)
Resume file: None
