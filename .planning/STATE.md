# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 25 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.2 complete. Planning next milestone.

## Current Position

Milestone: v1.2 — Launch Readiness (SHIPPED 2026-02-25)
Phase: All 14 phases complete
Plan: Not started
Status: Milestone archived. Ready for next milestone.
Last activity: 25 Feb 2026 — v1.2 milestone complete

Progress: [██████████] 100%

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
- Launch checklist at 47% — gap is QA + deployment, not code

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Rename SolShot-clean to SolShot (swap directories)
- Production deployment (Render + Vercel)
- QA sessions (A4-A8 gameplay testing)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy
- Working directory is SolShot-clean (not SolShot) — needs directory swap

## Session Continuity

Last session: 2026-02-25T11:10:00Z
Stopped at: v1.2 milestone archived. Ready for /gsd:new-milestone.
Resume file: None
