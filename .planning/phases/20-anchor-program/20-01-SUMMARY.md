---
phase: 20-anchor-program
plan: 01
subsystem: on-chain-program
tags: [anchor, rust, solana, escrow, proptest, borsh, n-player]

# Dependency graph
requires:
  - phase: 20-RESEARCH
    provides: N-player data model design decisions (players array, deposits_mask bitmap, 600s timeout)
provides:
  - MatchEscrow struct with players:[Pubkey;4], max_players:u8, deposits_mask:u8 (SPACE=232)
  - TIMEOUT_SECONDS=600 across lib.rs and all test files
  - TooFewPlayers, TooManyPlayers, MatchAlreadyStarted error codes
  - Updated MatchCreated/MatchCancelled events using Vec<Pubkey> arrays
  - Compile stubs (todo! markers) in instruction bodies for plans 20-02/20-03
  - All 4 proptest/litesvm test suites passing (59 tests total)
affects:
  - 20-02-PLAN (create_match, deposit_wager rewrite depends on new struct fields)
  - 20-03-PLAN (cancel_match, permissionless_reclaim, settle_match rewrite depends on new struct)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deposits_mask: u8 bitmap — bit N set = player N deposited (replaces bool pair)"
    - "players: [Pubkey; 4] fixed array — zero-padded for < 4 players (replaces two Pubkeys)"
    - "todo!() compile stubs in instruction bodies — mark locations for incremental rewrites"
    - "TS-INV-5 updated: v1.4 timeout overlap documented — mutual exclusion is STATE-enforced not time-enforced"

key-files:
  created: []
  modified:
    - programs/solshot-escrow/src/lib.rs
    - programs/solshot-escrow/tests/bok_proptest_space.rs
    - programs/solshot-escrow/tests/bok_proptest_timestamp.rs
    - programs/solshot-escrow/tests/bok_litesvm.rs

key-decisions:
  - "todo!() stubs in instruction bodies allow lib to compile for test verification without implementing premature N-player logic"
  - "TS-INV-5 semantics changed: with TIMEOUT_SECONDS=600, settle(3600) and cancel(600) windows overlap — mutual exclusion documented as state-machine enforced"
  - "Deadline ordering changed: cancel(600) < reclaim(1200) < settle(3600) — reclaim is no longer the largest constant"

patterns-established:
  - "deposits_mask: Bitmap for N-player deposit tracking — check bit with (mask >> i) & 1"
  - "players: Fixed [Pubkey;4] array — iterate up to max_players to avoid processing zero-padded slots"

# Metrics
duration: 7min
completed: 2026-02-27
---

# Phase 20 Plan 01: N-Player Data Model Struct Rewrite Summary

**MatchEscrow struct upgraded from 2-player binary fields to N-player array+bitmap layout (SPACE 168→232), TIMEOUT_SECONDS changed from 86400 to 600, 3 new error codes, updated events — all 59 proptest/litesvm tests passing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-27T22:21:44Z
- **Completed:** 2026-02-27T22:28:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced `player_one: Pubkey` + `player_two: Pubkey` with `players: [Pubkey; 4]` fixed array
- Replaced `player_one_deposited: bool` + `player_two_deposited: bool` with `deposits_mask: u8` bitmap
- Added `max_players: u8` field for 2-4 player support
- Updated `MatchEscrow::SPACE` from 168 to 232 bytes (confirmed by borsh proptest)
- Changed `TIMEOUT_SECONDS` from 86400 (24h) to 600 (10 min) across lib.rs and all test files
- Added `TooFewPlayers`, `TooManyPlayers`, `MatchAlreadyStarted` error variants
- Updated `MatchCreated` and `MatchCancelled` events to use `Vec<Pubkey>` player arrays
- All 59 tests passing: bok_litesvm(5), bok_proptest_fee(12), bok_proptest_space(17), bok_proptest_timestamp(25)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite MatchEscrow struct, SPACE, constants, errors, and events** - `fdac49e` (feat)
2. **Task 2: Update proptest and litesvm test files + compile stubs** - `1976631` (feat)

**Plan metadata:** (committed with docs commit below)

## Files Created/Modified
- `programs/solshot-escrow/src/lib.rs` - N-player struct, updated events/errors, compile stubs for instruction bodies
- `programs/solshot-escrow/tests/bok_proptest_space.rs` - MATCH_ESCROW_SPACE=232, updated OfflineMatchEscrow replica
- `programs/solshot-escrow/tests/bok_proptest_timestamp.rs` - TIMEOUT_SECONDS=600, updated deadline ordering and TS-INV-5
- `programs/solshot-escrow/tests/bok_litesvm.rs` - TIMEOUT_SECONDS=600

## Decisions Made
- **Compile stubs instead of broken references**: Since Cargo always compiles the lib when running integration tests, leaving instruction bodies referencing deleted fields would prevent test verification. Used `todo!()` stubs and removed broken account constraints to allow the lib to compile while clearly marking locations for plans 20-02/20-03.
- **TS-INV-5 semantics redefined**: With TIMEOUT_SECONDS=600 and SETTLEMENT_TIMEOUT_SECONDS=3600, settle and cancel windows overlap (cancel opens at 600s, settlement closes at 3600s). Updated TS-INV-5 to document that mutual exclusion is now STATE-enforced (not time-enforced) via terminal state machine transitions.
- **Deadline ordering updated**: v1.4 ordering is `cancel(600) < reclaim(1200) < settle(3600)` — SETTLEMENT_TIMEOUT_SECONDS is now the LARGEST constant. Updated `ts_inv_2_constant_ordering_static`, `ts_inv_2_deadline_ordering`, `ts_inv_3_settlement_less_than_all`, `full_lifecycle_deadlines_valid` accordingly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added compile stubs to instruction bodies and account structs**
- **Found during:** Task 2 (running `cargo test` for test verification)
- **Issue:** Cargo always compiles the lib as part of linking integration test binaries. After Task 1 replaced the MatchEscrow struct fields (`player_one`, `player_two`, `*_deposited`), the instruction bodies and account struct constraints referencing those deleted fields caused 30 compile errors, preventing any test from running. The plan said "file will not compile" but also required `cargo test` to pass — these requirements conflicted.
- **Fix:** Replaced all four broken instruction bodies (`create_match`, `deposit_wager`, `cancel_match`, `permissionless_reclaim`) with `todo!()` stubs. Replaced broken account constraints in `SettleMatch` (winner constraint), `CancelMatch`, and `PermissionlessReclaim` with stub `#[account(mut)]` declarations. Used `players.contains(&winner.key())` for the SettleMatch winner constraint (a valid N-player check). Added `#[allow(unused_imports)]` for `system_program` since all CPI calls are in stubs.
- **Files modified:** `programs/solshot-escrow/src/lib.rs`
- **Verification:** `cargo check` produces no errors; all 59 tests pass.
- **Committed in:** `1976631` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Necessary to satisfy plan's test verification requirement. Stubs are clearly marked with `TODO(20-02)` and `TODO(20-03)` comments. No functional logic was implemented prematurely — all instruction logic is deferred to plans 20-02 and 20-03 as intended.

## Issues Encountered
- Timestamp test suite (`bok_proptest_timestamp.rs`) had multiple tests asserting the old `SETTLEMENT_TIMEOUT_SECONDS < TIMEOUT_SECONDS` ordering, which is now inverted (3600 > 600). Required careful updates to `ts_inv_2_deadline_ordering`, `ts_inv_2_constant_ordering_static`, `ts_inv_3_settlement_less_than_all`, `ts_inv_5_*`, `ts_inv_6_reclaim_cancel_gap_static`, and `full_lifecycle_deadlines_valid`. All 25 timestamp tests now pass with correct v1.4 semantics.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- N-player MatchEscrow struct is in place with correct SPACE=232 and all tests green
- Plan 20-02 can now implement `create_match` (N-player params, players array fill, deposits_mask init) and `deposit_wager` (bitmap check, all-deposited detection)
- Plan 20-03 can then implement `cancel_match`, `permissionless_reclaim`, and `settle_match` N-player refunds
- The `SettleMatch` winner constraint is already updated to `escrow.players.contains(&winner.key())`
- `CancelMatch` and `PermissionlessReclaim` account structs need replacement with `remaining_accounts` iteration (documented in TODO comments)

---
*Phase: 20-anchor-program*
*Completed: 2026-02-27*
