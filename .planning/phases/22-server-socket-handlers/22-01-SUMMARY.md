---
phase: 22-server-socket-handlers
plan: 01
subsystem: api
tags: [socket.io, escrow, solana, n-player, wagered-matches]

# Dependency graph
requires:
  - phase: 21-server-escrow-services
    provides: N-player escrow service API (createMatchEscrow, buildDepositTransaction, getEscrowState with depositsMask, startWithDepositorsEscrow)
provides:
  - N-player escrow orchestration in main.js socket handlers
  - escrowDepositStatus broadcast event for real-time deposit tracking
  - 5-minute deposit timeout (SRV-12)
  - depositsMask bitmask-based deposit confirmation
  - firstDepositorSocketId tracking for Phase 22-02 partial-deposit flow
affects:
  - 22-02-PLAN (partial-deposit decision flow — uses firstDepositorSocketId and escrowDepositStatus)
  - 22-03-PLAN (SHOT milestones + playAgain N-player fix)
  - client escrow integration (escrowDepositStatus event shape)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "N-player wallet collection: room.players.map(p => ws.wallets[p.socketId]).filter(Boolean)"
    - "Parallel deposit TX build: Promise.all(room.players.map(p => buildDepositTransaction(...)))"
    - "Loop emit: room.players.forEach((p, i) => sock.emit('escrowDeposit', ...))"
    - "Bitmask check: (escrowState.depositsMask & (1 << playerIndex)) !== 0"
    - "escrowDepositStatus: per-player deposit map emitted after each confirmed deposit"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "DEPOSIT_TIMEOUT_MS = 300_000 (5 minutes) per SRV-12 — gives more time for N players to sign"
  - "startWithDepositorsEscrow imported from solana.js (re-exported there from escrow.js)"
  - "escrowDepositStatus shape: {roomId, deposits:[{socketId, wallet, confirmed}], numDeposited, totalPlayers}"
  - "firstDepositorSocketId tracked in wagerStates for Phase 22-02 partial-deposit decision maker"
  - "joinQueue path uses same N-player pattern as joinRoom for consistency (queue is always 2-player but code is future-proof)"

patterns-established:
  - "N-player escrow wallet collection: always map over room.players[], never hardcode [players[0], players[1]]"
  - "depositsMask bitmask: use (mask & (1 << playerIndex)) for per-player deposit verification"
  - "N-player emit loop: forEach over room.players with index for parallel socket emits"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 22 Plan 01: N-Player Escrow Socket Handler Upgrade Summary

**N-player escrow flow in main.js: 5-min timeout, all-player wallet collection, bitmask deposit verification, and real-time escrowDepositStatus events replacing hardcoded 2-player assumptions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T09:17:24Z
- **Completed:** 2026-02-28T09:19:48Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Changed DEPOSIT_TIMEOUT_MS from 120_000 to 300_000 (5 minutes, SRV-12)
- Added startWithDepositorsEscrow to the solana.js import destructuring
- Rewrote joinRoom escrow creation block to collect all N player wallets via room.players.map(), build deposit TXs in parallel via Promise.all, and emit escrowDeposit to each player in a loop
- Rewrote joinQueue escrow creation block with the same N-player pattern using roomData.players
- Both deposit timeout blocks now collect all N player wallets for cancelMatchEscrow (allCancelWallets)
- Rewrote escrowDepositConfirm to use depositsMask bitmask with playerIndex instead of isHost ternary with playerOneDeposited/playerTwoDeposited shims (SRV-11)
- Added firstDepositorSocketId tracking in wagerStates for Phase 22-02 partial-deposit decision maker
- Added escrowDepositStatus emit to all room members after each confirmed deposit with per-player deposit map (SRV-18)
- Updated all-deposited log message: "All N deposits confirmed" instead of "Both deposits confirmed"

## Task Commits

Each task was committed atomically:

1. **Task 1: Update imports, timeout constant, and N-player escrow creation blocks** - `fdefe62` (feat)
2. **Task 2: Rewrite escrowDepositConfirm for N-player bitmask verification and escrowDepositStatus** - `fdefe62` (feat)

Note: Both tasks were committed together as one atomic commit since all changes are in the single modified file.

**Plan metadata:** _(pending)_

## Files Created/Modified
- `server/socket-io/main.js` - N-player escrow orchestration: wallet collection, deposit TX dispatch, timeout, deposit confirmation bitmask, escrowDepositStatus event, firstDepositorSocketId tracking

## Decisions Made
- Used same N-player pattern in joinQueue path even though queue rooms are always 2-player — for code consistency and future-proofing
- Committed Tasks 1 and 2 as a single commit since both modify only main.js with no logical separation point

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 22-02 (partial-deposit decision flow) is unblocked: firstDepositorSocketId is tracked in wagerStates and escrowDepositStatus provides real-time deposit state to all room members
- Phase 22-02 can implement escrowPartialDeposit emit, escrowPartialStart handler, and escrowCancelAll handler using the same wagerStates pattern
- startWithDepositorsEscrow is now imported and ready for use in Phase 22-02

---
*Phase: 22-server-socket-handlers*
*Completed: 2026-02-28*
