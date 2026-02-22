# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 21 Feb 2026)

**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.1 Security Hardening — Phase 1 complete, Phase 2 next (Server Financial Security)

## Current Position

Milestone: v1.1 — Security Hardening
Phase: 1 of 8 — On-Chain Program Redesign (**COMPLETE**)
Plans: 3/3 complete (01-01 lib.rs, 01-02 IDL+escrow.js, 01-03 tests)
Status: Phase 1 complete — test execution deferred (McAfee blocks local validator)
Last activity: 21 Feb 2026 — Phase 1 verified (14/14 requirements, VERIFICATION.md written)

Progress: [██░░░░░░░░] ~12.5% (1/8 phases complete)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 3

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 3/3 | ~10min | ~3min |
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
- **[v1.1 Phase 1] GlobalConfig PDA singleton (seeds=[b"config"]) with authority/treasury/ops/is_paused — all instructions validate against config**
- **[v1.1 Phase 1] MatchEscrow SPACE = 168 (added activated_at i64); settlement deadline 1hr; timeout uses activated_at**
- **[v1.1 Phase 1] PROGRAM_ID unchanged at CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD — fresh deploy requires new ID + initializeConfig()**
- **[v1.1 Phase 1] anchor build works on Windows; IDL at server/idl/ matches program; escrow.js passes config PDA to all instructions**
- **[v1.1 Phase 1] Test execution deferred — McAfee LiveSafe blocks solana-test-validator genesis archive extraction (os error 5)**

### Pending Todos

- Run 25-test suite when McAfee exclusion is configured (`anchor test --provider.cluster localnet`)
- Fresh devnet deploy with new program ID + initializeConfig() call
- Phase 2: Server Financial Security — verify deposits on-chain, propagate settlement failures, fix rate limiter

### Blockers/Concerns
- McAfee LiveSafe blocks solana-test-validator on Windows — need folder exclusion or temp disable to run tests
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy (airdrop rate-limited)
- Key rotation (KM-01) requires new program deploy with updated authority — coordinated with Phase 4
- SOS finding H029 (outcome verification / dispute mechanism) is deferred — requires game theory analysis beyond code remediation

## Session Continuity

Last session: 2026-02-21
Stopped at: Phase 1 complete (all 3 plans executed, verified 14/14 OC requirements)
Resume file: None (next: /gsd:plan-phase for Phase 2)
