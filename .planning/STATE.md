# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 28 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** Planning next milestone

## Current Position

Milestone: v1.4 — N-Player Escrow — SHIPPED
Phase: —
Plan: —
Status: Ready for next milestone
Last activity: 28 Feb 2026 — v1.4 milestone complete and archived

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)
- v1.3 plans completed: 10 (across 5 phases)
- v1.4 plans completed: 10 (across 4 phases)

**Total across all milestones:** 75 plans, 28 phases

## Accumulated Context

### Key Decisions (carried forward)
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- Three audits complete: SOS, DB, BOK — all PASS
- N-player escrow: players[4] array, deposits_mask bitmap, 10-min on-chain timeout
- Winner-takes-all N-player settlement (not placement split)
- Equal wagers only (simpler PDA, fairer gameplay)
- Partial deposit: host chooses start-with-depositors or cancel-all
- remaining_accounts pattern for cancel/reclaim (no named player accounts)
- 5 min client deposit timeout, 10 min on-chain timeout
- pot = wager * deposits_mask.count_ones()

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows — tests need exclusion
- Devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program with v1.4 instructions
- main.js is now ~3143 lines — search by function name, not line number
- tests/solshot-escrow.ts uses old 2-player API (TS integration tests cannot run against new program)

## Session Continuity

Last session: 2026-02-28
Stopped at: v1.4 milestone archived — ready for next milestone
Resume file: None
