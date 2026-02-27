# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 27 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.4 — N-Player Escrow

## Current Position

Milestone: v1.4 — N-Player Escrow
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 27 Feb 2026 — Milestone v1.4 started

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)
- v1.3 plans completed: 10 (across 5 phases)

**Total across all milestones:** 65 plans, 24 phases

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
- players[] array replaces host/player binary structure
- BO1/BO3/BO5 with placement scoring (4th=0, 3rd=1, 2nd=2, 1st=3)
- Wager modes with 3-4 players are practice-only until escrow upgrade
- Tank colours: red #E63946, blue #4A90D9, green #52B788, yellow #FFD166

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- QA sessions (A4-A8 gameplay testing)
- Telegram bot creation (BotFather)
- Fix SHOT milestone recording for players 3/4 (tech debt from v1.3)
- Fix playAgain maxPlayers preservation (tech debt from v1.3)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy
- main.js is ~2870 lines — search by function name, not line number
- Escrow settlement still 2-player (hostId/playerId) — N-player escrow deferred

## Session Continuity

Last session: 2026-02-27
Stopped at: v1.3 milestone archived
Resume file: None
