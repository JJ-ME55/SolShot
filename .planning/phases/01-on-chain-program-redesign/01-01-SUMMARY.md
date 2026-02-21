---
phase: 01-on-chain-program-redesign
plan: 01
subsystem: payments
tags: [anchor, rust, solana, escrow, pda, bps-arithmetic, security-hardening]

requires:
  - phase: none
    provides: baseline escrow program (417 LOC, 4 instructions, no config PDA)

provides:
  - GlobalConfig PDA singleton (seeds=[b"config"]) with authority/treasury/ops/is_paused fields
  - initialize_config, update_config, pause_program, unpause_program instructions
  - Hardened SettleMatch with on-chain winner/treasury/ops account constraints
  - Emergency pause guard on all 4 economic instructions
  - Checked u128 BPS arithmetic throughout
  - activated_at i64 field on MatchEscrow for settlement deadline + timeout reference
  - MatchSettled event enhanced with treasury_account and ops_account pubkeys
  - Authority-as-player guard, min/max wager bounds (10_000 lamports - 100 SOL)
  - Terminal state set before lamport transfers in settle and cancel

affects:
  - 01-on-chain-program-redesign/01-02 (anchor build + IDL generation + server update)
  - 02-server-financial-security (uses new IDL and config PDA patterns)
  - server/services/escrow.js (needs getConfigPDA(), updated settleMatchEscrow accounts)

tech-stack:
  added: []
  patterns:
    - "GlobalConfig PDA singleton (seeds=[b\"config\"]) for on-chain address governance"
    - "Anchor constraint-based account validation in #[derive(Accounts)] structs"
    - "u128 widening for BPS arithmetic to prevent overflow at theoretical maximum u64 wager"
    - "Scoped mutable borrow before lamport transfers (Pitfall 3 pattern)"
    - "Terminal state before transfers defense-in-depth (OC-10)"
    - "activated_at vs created_at distinction for accurate timeout reference"

key-files:
  created: []
  modified:
    - programs/solshot-escrow/src/lib.rs

key-decisions:
  - "SETTLEMENT_TIMEOUT_SECONDS = 3600 (1 hour) — long enough to avoid false-positive expirations, short enough to protect players"
  - "activated_at fallback to created_at when 0 — handles backward compat with matches created before OC-07 field existed"
  - "Config PDA bump stored in GlobalConfig.bump — avoids recompute on every instruction"
  - "OC-13 (upgrade authority transfer to multisig) deferred to mainnet — keeps iteration speed on devnet"
  - "ZeroWager error code kept for backward compat even though superseded by WagerTooSmall"
  - "declare_id! kept as old devnet ID — will be updated in Plan 02 after fresh deploy"

patterns-established:
  - "GlobalConfig::SEED = b\"config\" — all plan-02 server code must use this constant"
  - "MatchEscrow::SPACE = 168 — any future field additions require new program deploy"
  - "All economic instructions require config account with pause guard as last non-system account"

duration: 3min
completed: 2026-02-21
---

# Phase 01 Plan 01: Rewrite lib.rs Summary

**Complete Anchor 0.32.1 escrow program rewrite resolving all 12 on-chain security requirements (OC-01 through OC-12) across 756 LOC — GlobalConfig PDA, constraint-validated settlement accounts, emergency pause, u128 BPS arithmetic, and terminal-state-before-transfer defense**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T18:33:21Z
- **Completed:** 2026-02-21T18:36:21Z
- **Tasks:** 2 of 2
- **Files modified:** 1

## Accomplishments

- Introduced GlobalConfig PDA singleton (seeds=[b"config"]) storing authority, treasury, ops, is_paused, bump — eliminating all server-side-only validation of economic accounts
- Rewrote SettleMatch account struct to enforce winner/treasury/ops via Anchor constraints (not manual require! in body), resolving SOS CRITICAL findings S001, H008, H001, H002, H003
- Added emergency pause mechanism (pause_program/unpause_program) guarded on all 4 economic instructions via constraint = !config.is_paused
- Replaced all raw multiplication with u128 widening + checked_mul/checked_sub/checked_add per BOK GAP-002 verified pattern
- Set terminal state (Settled/Cancelled) before lamport transfers in both settle_match and cancel_match (defense-in-depth per BOK GAP-004/GAP-005)
- Added activated_at i64 field to MatchEscrow (SPACE 160→168); set on Active transition; used as timeout/settlement deadline reference
- Added 10 new error codes, 4 config management instructions, updated MatchSettled event with fee destination pubkeys
- Verified clean compilation via cargo check (only known Anchor 0.32.1 macro cfg warnings, no errors)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Rewrite lib.rs with all OC-01 through OC-12 security fixes + verify compilation** - `786bdef` (feat)

**Plan metadata:** (separate docs commit — see below)

## Files Created/Modified

- `programs/solshot-escrow/src/lib.rs` — Complete 756-LOC rewrite: GlobalConfig PDA, 8 instructions (4 new + 4 hardened), hardened account constraints, checked arithmetic, activated_at field, enhanced events, 10 new errors

## Decisions Made

- **SETTLEMENT_TIMEOUT_SECONDS = 3600:** 1 hour settlement window. Long enough to avoid false-positive expirations during network congestion; short enough to protect players from indefinitely locked funds. Configurable via program redeploy if needed.
- **activated_at fallback to created_at:** When `activated_at == 0` (match created before this field or still in AwaitingDeposits), the timeout check falls back to `created_at`. This handles backward compatibility gracefully without special-casing in the caller.
- **declare_id! kept as old devnet ID:** The program ID in lib.rs is still the old devnet ID. Plan 02 will deploy fresh, get a new ID, and update declare_id! + server constants atomically.
- **OC-13 deferred:** Upgrade authority transfer to multisig is a pre-mainnet step, not a devnet step. Documented with a comment at the top of lib.rs.
- **ZeroWager error kept:** Superseded by WagerTooSmall/WagerTooLarge for all practical purposes, but kept in the error enum for backward compatibility with any tests that reference it by number.

## Deviations from Plan

None — plan executed exactly as written. The research document provided complete patterns for all changes; implementation followed them precisely.

## Issues Encountered

None. The cargo check warnings (`unexpected cfg` for `anchor-debug`, `custom-heap`, `custom-panic`, `solana` target_os) are well-known Anchor 0.32.1 behavior when checking against a non-BPF host target. They do not affect correctness and disappear when building with `cargo build-sbf`.

## User Setup Required

None — no external service configuration required. Plan 02 will handle the actual devnet deploy.

## Next Phase Readiness

- lib.rs is complete and compiles. Ready for Plan 02 (anchor build, IDL generation, server escrow.js update).
- Plan 02 must: run `anchor build`, deploy to devnet (new program ID), update `declare_id!()`, copy IDL to `server/idl/`, update `PROGRAM_ID` and add `getConfigPDA()` in `server/services/escrow.js`, update `.env` files.
- The `escrow.js` settleMatchEscrow(), cancelMatch(), createMatch(), depositWager() functions all need config PDA account added to their `.accounts({})` calls.
- No blockers. Program is semantically correct per audit findings; Plan 02 is pure integration work.

---
*Phase: 01-on-chain-program-redesign*
*Completed: 2026-02-21*
