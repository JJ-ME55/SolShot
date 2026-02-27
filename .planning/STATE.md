# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 27 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.4 — Phase 20: Anchor Program

## Current Position

Milestone: v1.4 — N-Player Escrow
Phase: 20 of 23 (Anchor Program)
Plan: 01 of 3 in phase 20 (Data Model Struct Rewrite)
Status: In progress
Last activity: 27 Feb 2026 — Completed 20-01-PLAN.md (N-player struct + test sync)

Progress: [█░░░░░░░░░] 10% (1/10 plans)

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
- Three audits complete: SOS, DB, BOK — all PASS
- Re-audit risk accepted for lib.rs modifications (v1.4 requires it)
- Winner-takes-all N-player settlement (not placement split)
- Equal wagers only (simpler PDA, fairer gameplay)
- 5-10 min deposit timeout (more players = higher no-show risk)
- Partial deposit: host chooses start-with-depositors or cancel-all
- Wager guard for 3-4 players removed in v1.4
- TIMEOUT_SECONDS=600 (10 min) — confirmed in 20-01; PERMISSIONLESS_RECLAIM_TIMEOUT=1200
- MatchEscrow SPACE=232: players:[Pubkey;4]+max_players+deposits_mask replaces two Pubkeys+two bools
- TS-INV-5 v1.4: settle/cancel windows overlap — mutual exclusion is STATE-enforced (not time-enforced)
- Compile stubs (todo!) in instruction bodies allow incremental rewrite across plans 20-01/02/03

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows — tests need exclusion
- Devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program
- main.js is ~2870 lines — search by function name, not line number
- IDL must sync atomically across 3 locations after program rebuild
- lib.rs instruction bodies are todo!() stubs (plans 20-02/20-03 must complete before anchor build)

## Session Continuity

Last session: 2026-02-27T22:28:53Z
Stopped at: Completed 20-01-PLAN.md — N-player struct rewrite + test sync
Resume file: None
