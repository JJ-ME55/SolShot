---
phase: 20-anchor-program
plan: 03
subsystem: blockchain
tags: [solana, anchor, rust, escrow, n-player, idl]

# Dependency graph
requires:
  - phase: 20-01
    provides: N-player account structs (MatchEscrow with players/max_players/deposits_mask) and cancel_match/permissionless_reclaim todo!() stubs
  - phase: 20-02
    provides: create_match/deposit_wager/settle_match N-player rewrites (complete instruction bodies)
provides:
  - cancel_match using remaining_accounts for N-player refund routing (no hardcoded player_one/player_two)
  - permissionless_reclaim using same remaining_accounts pattern
  - start_with_depositors instruction — partial deposit handling, player array compaction, state activation
  - Fully compiling Anchor program (anchor build succeeds, zero errors)
  - Synced IDL at server/idl/solshot_escrow.json
  - All 69 cargo tests passing (proptest + litesvm stubs)
affects:
  - phase 21 (server integration — escrow.js must be updated to use remaining_accounts for cancel/reclaim calls)
  - phase 22 (client integration — new start_with_depositors instruction available in IDL)
  - devnet deployment (program is now ready for fresh deploy with new program ID)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "remaining_accounts iteration: remaining_accounts.iter().enumerate() for N-player refund routing"
    - "Borrow checker safety: read all values into locals before &mut borrow, drop borrow before lamport transfers"
    - "Player array compaction: move deposited players to front before reducing max_players"
    - "Defense-in-depth: set terminal state (Cancelled/Settled) BEFORE lamport transfers"

key-files:
  created: []
  modified:
    - programs/solshot-escrow/src/lib.rs
    - programs/solshot-escrow/tests/bok_litesvm.rs
    - server/idl/solshot_escrow.json

key-decisions:
  - "cancel_match and permissionless_reclaim use ctx.remaining_accounts for player refunds — no named player accounts in account structs"
  - "start_with_depositors compacts players[] array before reducing max_players — ensures contiguous depositor slots"
  - "start_with_depositors rebuilds deposits_mask after compaction — bit positions match new player indices"

patterns-established:
  - "ESC-08/09 pattern: read all escrow fields into locals → set terminal state → iterate remaining_accounts with pubkey+mask validation → transfer lamports"
  - "ESC-11 pattern: count_ones() for num_deposited check → compact array → set max_players = j → activate"

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 20 Plan 03: N-Player Cancel/Reclaim Rewrite + start_with_depositors Summary

**N-player cancel_match and permissionless_reclaim rewritten with remaining_accounts iteration; start_with_depositors instruction added with player array compaction; anchor build succeeds and all 69 cargo tests pass**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T22:41:36Z
- **Completed:** 2026-02-27T22:45:02Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced todo!() stubs in cancel_match and permissionless_reclaim with full N-player remaining_accounts refund routing
- Removed player_one/player_two named accounts from CancelMatch and PermissionlessReclaim account structs
- Added start_with_depositors instruction (ESC-11) with player array compaction logic
- anchor build succeeds with zero errors (only pre-existing Anchor macro cfg warnings)
- All 69 tests pass: 1 unit + 5 litesvm stubs + 20 proptest fee + 18 proptest space + 25 proptest timestamp
- IDL synced to server/idl/solshot_escrow.json — identical to target/idl/solshot_escrow.json
- Updated fee_inv_8 litesvm stub to use N-player bitmap test cases (7 scenarios including 3p and 4p)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite cancel_match/permissionless_reclaim + add start_with_depositors** - `dd5ad52` (feat)
2. **Task 2: Build program, run all tests, sync IDL, update litesvm stubs** - `ee0337d` (feat)

## Files Created/Modified
- `programs/solshot-escrow/src/lib.rs` - cancel_match and permissionless_reclaim bodies replaced with remaining_accounts N-player iteration; CancelMatch/PermissionlessReclaim structs cleaned of player_one/player_two; StartWithDepositors struct and start_with_depositors instruction added
- `programs/solshot-escrow/tests/bok_litesvm.rs` - fee_inv_8 updated to N-player bitmap test cases (7 scenarios)
- `server/idl/solshot_escrow.json` - synced from target/idl after anchor build; contains start_with_depositors, players array, deposits_mask, TooFewPlayers error

## Decisions Made
- cancel_match and permissionless_reclaim use ctx.remaining_accounts for player refunds — no named player accounts in account structs. Callers must pass deposited player accounts in player-index order.
- start_with_depositors compacts the players[] array before reducing max_players. This ensures settle_match winner constraint (0..max_players iteration) only checks actual depositors after partial-start.
- start_with_depositors rebuilds deposits_mask after compaction so bit positions match new compacted player indices (all bits set for 0..j after compaction).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None — anchor build succeeded on first attempt. All 69 tests passed without modification beyond the planned fee_inv_8 N-player update.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Anchor program is complete with all 9 instructions: initialize_config, update_config, pause_program, unpause_program, create_match, deposit_wager, settle_match, cancel_match, permissionless_reclaim, start_with_depositors
- Program is ready for devnet deployment (separate process — requires ~2.12 SOL)
- server/services/escrow.js still uses old player_one/player_two API from the v1.3 program — must be updated in phase 21 before deployment
- server/socket-io/main.js cancel/refund flows must pass remaining_accounts arrays to new cancel_match instruction
- New start_with_depositors call path needs implementation in server (for partial-deposit timeout handling)
- Blockers: devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program with new instructions

---
*Phase: 20-anchor-program*
*Completed: 2026-02-27*
