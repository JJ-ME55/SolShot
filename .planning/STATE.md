# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 27 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.4 — Phase 20: Anchor Program

## Current Position

Milestone: v1.4 — N-Player Escrow
Phase: 20 of 23 (Anchor Program) — COMPLETE
Plan: 03 of 3 in phase 20 (N-Player Cancel/Reclaim + start_with_depositors)
Status: Phase complete — ready for Phase 21
Last activity: 27 Feb 2026 — Completed 20-03-PLAN.md (cancel/reclaim N-player + anchor build + IDL sync)

Progress: [███░░░░░░░] 30% (3/10 plans)

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
- pot = wager * deposits_mask.count_ones() — NOT wager * num_deposited (uses actual depositors, not registered count)
- dust absorption: winner = pot - treasury - ops; max dust is always 2 lamports regardless of player count (2 division ops)
- (0..max_players).any(|i| escrow.players[i] == winner.key()) is the canonical winner constraint pattern
- cancel_match and permissionless_reclaim use ctx.remaining_accounts — no named player accounts in structs
- start_with_depositors compacts players[] array before reducing max_players — ensures contiguous depositor slots after partial-start
- Phase 20 COMPLETE: anchor build succeeds, all 69 cargo tests pass, IDL synced to server/idl/

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows — tests need exclusion
- Devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program with v1.4 instructions
- main.js is ~2870 lines — search by function name, not line number
- server/services/escrow.js still uses old player_one/player_two API — must be updated in Phase 21
- server/socket-io/main.js cancel/refund flows must be updated to pass remaining_accounts arrays
- start_with_depositors call path needs new implementation in server (partial-deposit timeout handling)

## Session Continuity

Last session: 2026-02-27T22:45:02Z
Stopped at: Completed 20-03-PLAN.md — N-player cancel/reclaim + start_with_depositors + anchor build + IDL sync
Resume file: None
