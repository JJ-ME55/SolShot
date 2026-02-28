---
phase: 21-server-escrow-services
plan: 01
subsystem: payments
tags: [solana, anchor, escrow, n-player, remaining-accounts, bitmask]

# Dependency graph
requires:
  - phase: 20-anchor-program
    provides: "N-player Anchor program with remainingAccounts cancel/reclaim, Vec<Pubkey> createMatch, start_with_depositors instruction, IDL synced to server/idl/"
provides:
  - "escrow.js createMatchEscrow(matchId, wagerSOL, playerAddresses[]) — Vec<Pubkey> N-player signature"
  - "escrow.js cancelMatchEscrow(matchId, playerAddresses[]) — remainingAccounts pattern"
  - "escrow.js permissionlessReclaimEscrow(matchId, playerAddresses[]) — remainingAccounts, no config account"
  - "escrow.js getEscrowState() — N-player fields (players[], depositsMask, maxPlayers, numDeposited) + backward-compat shims"
  - "escrow.js startWithDepositorsEscrow(matchId) — new wrapper for partial-deposit timeout handling"
affects:
  - 21-02-server-escrow-services (main.js call sites must be updated to pass arrays to cancelMatchEscrow)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anchor remainingAccounts pattern: pass deposited player accounts via .remainingAccounts([{pubkey, isWritable, isSigner}]) in player-index order"
    - "depositsMask bitmask: bit N set = player N deposited; popcount via countBits() helper"
    - "Backward-compat shim: derive playerOneDeposited/playerTwoDeposited from depositsMask for main.js line 2011-2012"

key-files:
  created: []
  modified:
    - server/services/escrow.js

key-decisions:
  - "N-player createMatchEscrow uses playerAddresses string[] not two positional params — matches IDL Vec<Pubkey> third arg"
  - "cancelMatchEscrow and permissionlessReclaimEscrow use .remainingAccounts() builder — no named player accounts in Anchor struct"
  - "PermissionlessReclaim accounts struct has NO config account (unlike CancelMatch which does) — confirmed against IDL"
  - "getEscrowState adds backward-compat shims (playerOneDeposited, playerTwoDeposited) to avoid main.js breakage until plan 21-02"
  - "countBits() popcount helper added inline — simple bitwise loop, no library needed"
  - "startWithDepositorsEscrow has NO args — only accounts (escrow, authority, config) per IDL"

patterns-established:
  - "remainingAccounts pattern: playerAddresses.map(addr => ({ pubkey: new PublicKey(addr), isWritable: true, isSigner: false }))"
  - "N-player getEscrowState returns both new fields and backward-compat shims simultaneously"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 21 Plan 01: Server Escrow Services — N-Player API Update Summary

**escrow.js rewritten to match Phase 20 N-player IDL: Vec<Pubkey> createMatch, remainingAccounts cancel/reclaim, N-player getEscrowState with backward-compat shims, new startWithDepositorsEscrow wrapper**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T07:06:36Z
- **Completed:** 2026-02-28T07:08:47Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Updated `createMatchEscrow` to accept `playerAddresses string[]` and pass `Vec<Pubkey>` as third arg to `program.methods.createMatch()`
- Updated `cancelMatchEscrow` to use `.remainingAccounts()` builder — removed named `playerOne`/`playerTwo` accounts (CancelMatch struct only has escrow, caller, config, systemProgram)
- Updated `permissionlessReclaimEscrow` to use `.remainingAccounts()` builder with 3-account struct (no config account), DRY via `getEscrowPDA()` helper
- Rewrote `getEscrowState` to return N-player fields (`players[]`, `maxPlayers`, `depositsMask`, `numDeposited`) plus backward-compat shims (`playerOneDeposited`, `playerTwoDeposited`) so main.js lines 2011-2012 keep working without changes
- Added `countBits()` popcount helper for `depositsMask` population count
- Added new `startWithDepositorsEscrow(matchId)` export for partial-deposit timeout handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Update createMatchEscrow to accept players array** - `c012059` (feat)
2. **Task 2: Update cancelMatchEscrow to use remainingAccounts** - `0c7ccb5` (feat)
3. **Task 3: Update permissionlessReclaim + getEscrowState + add startWithDepositors** - `67d680c` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `server/services/escrow.js` — All N-player wrappers updated; countBits helper added; startWithDepositorsEscrow added

## Decisions Made
- Used backward-compat shims in `getEscrowState` (Option A from research) to keep main.js unchanged in this plan — main.js call site updates are deferred to plan 21-02
- `permissionlessReclaimEscrow` uses `getEscrowPDA()` helper instead of inline `PublicKey.findProgramAddressSync` for DRY consistency with rest of file
- `settleMatchEscrow` was confirmed no-change-needed (SRV-03): on-chain program validates winner against `players[]` array; JS only passes winner pubkey — already correct

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `escrow.js` is now fully aligned with the Phase 20 N-player IDL
- `solana.js` and `main.js` still use old 2-player call patterns for `cancelMatchEscrow` (5 call sites passing two positional addresses) — must be updated in plan 21-02
- `settleMatch` in `solana.js` still uses `wager * 2` hardcode for server-side pot display — must be fixed in plan 21-02
- IDL confirmed identical between `server/idl/solshot_escrow.json` and `target/idl/solshot_escrow.json` (SRV-17 — no drift)

---
*Phase: 21-server-escrow-services*
*Completed: 2026-02-28*
