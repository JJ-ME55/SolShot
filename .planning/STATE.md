# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 24 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.2 Launch Readiness — Closing checklist gaps, Jupiter integration first

## Current Position

Milestone: v1.2 — Launch Readiness
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 24 Feb 2026 — Milestone v1.2 started

Progress: [░░░░░░░░░░] 0%


## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (21 prior + 4 Phase 8)

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 3/3 | ~10min | ~3min |
| 02-server-financial-security | 2/2 | ~21min | ~10.5min |
| 03-server-auth-game-integrity | 3/3 | ~5min | ~1.7min |
| 04-secrets-key-management | 3/3 | ~15min | ~5min |
| 04.1-doc-code-alignment | 2/2 | ~8min | ~4min |
| 05-client-supply-chain-security | 2/2 | ~22min | ~11min |
| 06-token-economy-hardening | 2/2 | ~5min | ~2.5min |
| 07-infrastructure-monitoring | 2/2 | ~8min | ~4min |
| 08-verification-re-audit | 4/4 | ~30min | ~7.5min |

## Accumulated Context

### Key Decisions
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- **[v1.0] All v1.0 decisions preserved — see previous STATE.md in git history**
- **[v1.1] Three audits complete: SOS 3C/9H/4M/1L (re-audit), DB 12C/34H/18M/6L (re-audit), BOK 25/25 pass 0 failures**
- **[v1.1] All CRITICAL and HIGH findings resolved or documented as Accepted Risk — SECURITY_SUMMARY.md at .planning/SECURITY_SUMMARY.md**
- **[v1.1] H029 (unverifiable winner oracle / outcome verification) deferred to v1.2 — requires protocol-level design decisions**
- **[v1.1] H060 (horizontal scaling) deferred — not exploitable on single instance**
- **[v1.2] Do NOT modify lib.rs — preserves SOS/DB/BOK audit certifications**
- **[v1.2] Many checklist "failures" are design decisions, not bugs — update checklist text instead of code**
- **[v1.2] Jupiter integration is hackathon-critical — Feb 25 deadline**
- **[v1.2] Combat Card plan exists at .claude/plans/ — integrate into stats phase**
- **[v1.2] Security re-check only needed for CSP changes and new socket endpoints — not full re-audit**

### Pending Todos

- Run 25-test suite when McAfee exclusion is configured (`anchor test --provider.cluster localnet`)
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Rename SolShot-clean → SolShot (swap directories)
- Update server/.env with SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server.json

### Blockers/Concerns
- McAfee LiveSafe blocks solana-test-validator on Windows — need folder exclusion or temp disable to run tests
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy (airdrop rate-limited)
- SOS finding H029 (outcome verification / dispute mechanism) is deferred — requires game theory analysis beyond code remediation
- Working directory is now SolShot-clean (not SolShot) — needs directory swap

## Session Continuity

Last session: 2026-02-24
Stopped at: Milestone v1.2 initialization — requirements and roadmap being defined
Resume file: None (starting fresh)
