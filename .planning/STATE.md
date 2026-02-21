# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 21 Feb 2026)

**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.1 Security Hardening — Phase 1 Plan 01 complete, Plan 02 next

## Current Position

Milestone: v1.1 — Security Hardening
Phase: 1 of 8 — On-Chain Program Redesign (in progress)
Plan: 01 of TBD — completed 01-01 (Rewrite lib.rs)
Status: In progress
Last activity: 21 Feb 2026 — Completed 01-01-PLAN.md (escrow program rewrite)

Progress: [█░░░░░░░░░] ~5% (1/~20 plans estimated)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 1

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 1/TBD | 3min | 3min |
| 02-server-financial-security | 0/TBD | — | — |
| 03-server-auth-game-integrity | 0/TBD | — | — |
| 04-secrets-key-management | 0/TBD | — | — |
| 05-client-supply-chain-security | 0/TBD | — | — |
| 06-token-economy-hardening | 0/TBD | — | — |
| 07-infrastructure-monitoring | 0/TBD | — | — |
| 08-verification-re-audit | 0/TBD | — | — |

## Accumulated Context

### Key Decisions
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- **[v1.0] All v1.0 decisions preserved — see previous STATE.md in git history**
- **[v1.1] Three audits complete: SOS 7C/6H/6M/4L, DB 8C/17H/15M/1L, BOK 24/24 pass 8 gaps**
- **[v1.1] H029 (unverifiable winner oracle / outcome verification) deferred to v1.2 — requires protocol-level design decisions**
- **[v1.1] H060 (horizontal scaling) deferred — not exploitable on single instance**
- **[v1.1] On-chain redesign is Phase 1 because ALL off-chain code depends on the new IDL**
- **[v1.1 01-01] SETTLEMENT_TIMEOUT_SECONDS = 3600 (1 hour) — long enough to avoid false-positives, short enough to protect players**
- **[v1.1 01-01] activated_at fallback to created_at when 0 — backward compat for matches pre-OC-07**
- **[v1.1 01-01] OC-13 (upgrade authority transfer) deferred to mainnet — keeps devnet iteration speed**
- **[v1.1 01-01] declare_id! kept as old devnet ID until Plan 02 (fresh deploy + new program ID)**
- **[v1.1 01-01] GlobalConfig::SEED = b"config"; MatchEscrow::SPACE = 168 — all server code must use these**

### Pending Todos

- Plan 02: anchor build, devnet deploy, update declare_id!, copy IDL, update escrow.js (PROGRAM_ID + getConfigPDA() + all instruction .accounts() calls)

### Blockers/Concerns
- Escrow program source is complete — Plan 02 requires Anchor CLI + Solana devnet access for deploy
- Key rotation (KM-01) requires new program deploy with updated authority — coordinated with Plan 02 program redesign
- SOS finding H029 (outcome verification / dispute mechanism) is deferred — requires game theory analysis beyond code remediation
- BFG git history rewrite (KM-01) will force-push all branches — coordinate with any open PRs

## Session Continuity

Last session: 2026-02-21T18:36:21Z
Stopped at: Completed 01-01-PLAN.md — escrow program rewrite (lib.rs) with OC-01 through OC-12
Resume file: None (next: execute 01-02-PLAN.md — anchor build + IDL + server integration)
