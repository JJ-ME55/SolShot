---
phase: 20-anchor-program
plan: 02
subsystem: on-chain
tags: [anchor, rust, solana, escrow, bitmask, proptest, n-player]

# Dependency graph
requires:
  - phase: 20-anchor-program/20-01
    provides: N-player MatchEscrow struct with players:[Pubkey;4], max_players, deposits_mask fields
provides:
  - create_match instruction: Vec<Pubkey> of 2-4 players, validates distinctness + authority exclusion, stores in fixed array
  - deposit_wager instruction: bitmap tracking via players[..max_players].iter().position, full mask → Active transition
  - settle_match instruction: pot = wager * deposits_mask.count_ones() with 90/7/3 BPS split, remainder to winner
  - SettleMatch account struct: winner constraint checks all players[0..max_players] via (0..max_players).any()
  - bok_proptest_fee.rs: 20 tests (10 2-player + 10 N-player variants), parameterized settle_math(wager, num_deposited)
  - bok_proptest_space.rs: 18 tests, parameterized compute_settlement(wager, num_deposited), 4p boundary test added
affects:
  - 20-anchor-program/20-03 (cancel_match and permissionless_reclaim still have todo!() stubs)
  - server/services/escrow.js (JS client must pass players array, not player_one/player_two)
  - tests/solshot-escrow.ts (TypeScript test suite needs N-player create_match calls)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rust borrow checker pattern: read immutable locals before CPI, take &mut after"
    - "Bitmap deposit tracking: deposits_mask |= 1u8 << player_index, full_mask = (1u8 << max_players) - 1"
    - "N-player pot: wager * deposits_mask.count_ones() — not hardcoded * 2"
    - "Winner constraint: (0..escrow.max_players as usize).any(|i| escrow.players[i] == winner.key())"
    - "Proptest parameterization: test helpers accept num_deposited to cover 2-4 player scenarios"

key-files:
  created:
    - programs/solshot-escrow/tests/bok_proptest_fee.rs
  modified:
    - programs/solshot-escrow/src/lib.rs
    - programs/solshot-escrow/tests/bok_proptest_space.rs

key-decisions:
  - "dust absorption: winner = pot - treasury - ops (remainder). Max dust still 2 lamports regardless of player count (only 2 division ops)"
  - "pot uses deposits_mask.count_ones() not max_players — if a player never deposited, they are not in the pot"
  - "settle_match reads deposits_mask into local before mutable borrow, consistent with Pitfall 3 pattern"
  - "4p boundary: MAX_WAGER * 4 = 400B lamports fits comfortably in u64 (u64::MAX ~18.4e18)"

patterns-established:
  - "All fee helpers accept num_deposited param for N-player generality"
  - "2-player callers pass num_deposited=2 for backward compatibility — no duplication"

# Metrics
duration: 6min
completed: 2026-02-27
---

# Phase 20 Plan 02: N-Player Instruction Rewrite Summary

**N-player create_match/deposit_wager/settle_match with bitmap deposit tracking and wager*count_ones() pot math; fee proptests expanded to 20 N-player-aware tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-27T22:32:46Z
- **Completed:** 2026-02-27T22:38:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- create_match accepts Vec<Pubkey> of 2-4 players with O(n^2) distinctness check and authority exclusion guard
- deposit_wager uses per-slot bitmap (deposits_mask |= 1u8 << player_index) with full-mask-equals-active transition
- settle_match pot = wager * deposits_mask.count_ones() (N-player correct), SettleMatch winner constraint uses (0..max_players).any()
- 20 fee invariant tests passing (10 existing 2-player + 10 new N-player variants); 18 space tests passing with 4-player boundary added

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite create_match, deposit_wager, settle_match instructions** - `8751421` (feat)
2. **Task 2: Update fee proptest and space proptest for N-player** - `641f023` (test)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified
- `programs/solshot-escrow/src/lib.rs` - Three core instructions rewritten for N-player; SettleMatch winner constraint updated
- `programs/solshot-escrow/tests/bok_proptest_fee.rs` - Created (was untracked); settle_math(wager, num_deposited), 10 N-player variants, 4p boundary tests
- `programs/solshot-escrow/tests/bok_proptest_space.rs` - compute_settlement(wager, num_deposited), all callers updated, sb_inv_3_boundary_min_wager_exact_4p added

## Decisions Made
- `dust = winner - (pot * 9000 / 10000)` is still at most 2 lamports regardless of player count — there are always exactly 2 division operations (treasury + ops), so rounding residuals cannot exceed 2
- `deposits_mask.count_ones()` used in both deposit_wager (for MatchActive event total_pot) and settle_match (for actual pot) — these must stay in sync semantically
- `#[allow(unused_imports)]` and the TODO(20-02) comment removed from lib.rs since system_program is now actively used by deposit_wager CPI

## Deviations from Plan

None - plan executed exactly as written. The SettleMatch winner constraint already used `.contains()` rather than the 2-player check described, which we replaced with the `(0..max_players).any()` pattern as specified.

## Issues Encountered
None. Both test suites compiled and passed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 20-03 can proceed: cancel_match and permissionless_reclaim still have todo!() stubs
- `anchor build` will succeed after plan 20-03 completes those stubs
- JS server code (escrow.js, main.js) will need updating to pass players array to create_match instead of player_one/player_two
- TypeScript test suite (tests/solshot-escrow.ts) will need N-player create_match call signatures

---
*Phase: 20-anchor-program*
*Completed: 2026-02-27*
