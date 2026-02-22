# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 21 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.1 Security Hardening — Phase 3 in progress (Server Auth & Game Integrity)

## Current Position

Milestone: v1.1 — Security Hardening
Phase: 3 of 8 — Server Auth & Game Integrity (**In progress**)
Plans: 1/3 complete (03-01 auth guards SA-01 + turn ownership SA-05 + cross-room isolation SA-06)
Status: In progress — 03-01 complete, 03-02 and 03-03 next
Last activity: 22 Feb 2026 — Completed 03-01-PLAN.md

Progress: [████░░░░░░] ~28% (Phases 1-2 complete; Phase 3 in progress 1/3)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 5

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 3/3 | ~10min | ~3min |
| 02-server-financial-security | 2/2 | ~21min | ~10.5min |
| 03-server-auth-game-integrity | 1/3 | ~2min | ~2min |
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
- **[v1.1 Phase 2 / 02-01] Float64Array for ring buffers — Date.now() ~1.77T overflows Int32Array max 2.1B in 2026**
- **[v1.1 Phase 2 / 02-01] getEscrowState() PDA booleans over getParsedTransaction() — PDA is ground truth after on-chain deposit settles**
- **[v1.1 Phase 2 / 02-01] isEscrowEnabled() guard pattern: wrap all escrow RPC in conditional — dev mode skips verification gracefully**
- **[v1.1 Phase 2 / 02-01] Peek-then-consume queue pattern: queue[0] to validate wager, queue.shift() only after equality confirmed**
- **[v1.1 Phase 2 / 02-02] settleMatch() returns { success: false } on escrow failure — no silent fallthrough to dev-mode (SF-02/H015)**
- **[v1.1 Phase 2 / 02-02] cancelMatchEscrow imported directly from escrow.js in main.js — not re-exported via solana.js**
- **[v1.1 Phase 2 / 02-02] handleSettlementFailure() pattern: immediate cancel attempt + failedSettlements Map retry (60s, max 5 attempts)**
- **[v1.1 Phase 2 / 02-02] Capture room/ws snapshots BEFORE settlement call — removeRoom() destroys live state**
- **[v1.1 Phase 3 / 03-01] joinQueue auth is conditional (wagerAmount > 0) — practice matches stay accessible unauthenticated**
- **[v1.1 Phase 3 / 03-01] fire handler uses inline this.isAuthenticated (not requireAuth) — fireRejected != fireError naming convention**
- **[v1.1 Phase 3 / 03-01] SA-06 scope is escrowDepositConfirm only — only handler with client-supplied roomId targeting own room**
- **[v1.1 Phase 3 / 03-01] SA-05 guard ordering: validateAction then turn ownership — mirrors fire handler pattern**

### Pending Todos

- Run 25-test suite when McAfee exclusion is configured (`anchor test --provider.cluster localnet`)
- Fresh devnet deploy with new program ID + initializeConfig() call

### Blockers/Concerns
- McAfee LiveSafe blocks solana-test-validator on Windows — need folder exclusion or temp disable to run tests
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy (airdrop rate-limited)
- Key rotation (KM-01) requires new program deploy with updated authority — coordinated with Phase 4
- SOS finding H029 (outcome verification / dispute mechanism) is deferred — requires game theory analysis beyond code remediation

## Session Continuity

Last session: 2026-02-22T09:40:25Z
Stopped at: Completed 03-01-PLAN.md — SA-01/SA-05/SA-06 implemented (2/2 tasks, 2 commits)
Resume file: None (next: 03-02-PLAN.md for rejoinRoom auth hardening / session fixation)
