---
phase: 22-server-socket-handlers
plan: 02
subsystem: api
tags: [socket.io, escrow, solana, n-player, partial-deposit, wagered-matches]

# Dependency graph
requires:
  - phase: 22-01
    provides: N-player escrow socket handler upgrade (DEPOSIT_TIMEOUT_MS, firstDepositorSocketId tracking, startWithDepositorsEscrow import)
provides:
  - Partial deposit decision flow in joinRoom deposit timeout (SRV-13)
  - escrowPartialStart handler — kicks non-depositors, compacts room, emits escrowActive (SRV-14)
  - escrowCancelAll handler — refunds depositors, preserves room, emits escrowCancelledAll (SRV-15)
  - Wager guard removed — 3-4 player wagered matches now allowed (SRV-16)
  - N-player trackWager multiplier in createRoom and joinQueue
affects:
  - 22-03-PLAN (SHOT milestones + playAgain N-player fix — uses same wagerStates patterns)
  - client escrow integration (escrowPartialDeposit, escrowPartialWaiting, kickedFromRoom, escrowCancelledAll events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-branch deposit timeout: all-deposited (noop), zero-deposits (cancel+destroy), partial (decision flow)"
    - "30s decision timer reuses depositTimers[roomId] slot — no new timer variables"
    - "cancelMatchEscrow wallet order: always room.players.filter(deposited).map(wallet) for on-chain ordering"
    - "Kick before compact: kickedSocket.leave(roomId) called BEFORE room.players.filter() to compact"
    - "escrowCancelAll preserves room: resets deposits/escrow state, keeps players in room"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "30s decision timer reuses depositTimers[roomId] — avoids separate timer slot that could leak (Pitfall 1)"
  - "cancelMatchEscrow called with room.players order (not Object.keys(ws.deposits)) for on-chain account ordering (Pitfall 2)"
  - "kickedSocket.leave() called before room.players compact — ensures Socket.IO membership is consistent (Pitfall 3)"
  - "escrowCancelAll preserves room so players can restart or reconfigure without reconnecting"
  - "canStart flag is true only when numDeposited >= 2 — prevents 1-player 'match'"

patterns-established:
  - "Partial deposit flow: escrowPartialDeposit to decision-maker + escrowPartialWaiting to others + 30s auto-cancel"
  - "N-player wager tracking: wagerAmount * maxPlayers (not hardcoded * 2)"
  - "escrowPartialStart: validate decision-maker identity → on-chain → kick → compact → promote host → escrowActive"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 22 Plan 02: Partial Deposit Decision Flow Summary

**3-branch deposit timeout (zero/partial/all), escrowPartialStart + escrowCancelAll handlers, and wager guard removal enabling 3-4 player wagered matches**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T09:23:32Z
- **Completed:** 2026-02-28T09:26:14Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Rewrote joinRoom deposit timeout from a simple all-or-nothing cancel into a 3-branch flow: all-deposited (noop), zero-deposits (cancel+destroy), partial-deposits (escrowPartialDeposit + 30s decision window)
- Added escrowPartialStart handler (SRV-14): validates decision-maker, calls startWithDepositorsEscrow on-chain, kicks non-depositors with kickedFromRoom event, compacts room.players, promotes host if needed, emits escrowActive
- Added escrowCancelAll handler (SRV-15): validates decision-maker, refunds depositors via cancelMatchEscrow in room.players order, preserves room, emits escrowCancelledAll
- Removed SYS-08 wager guard — 3-4 player wagered matches are now allowed (SRV-16)
- Updated trackWager in createRoom to use `wagerAmount * maxPlayers` and in joinQueue to use `wagerAmount * roomData.maxPlayers`

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite deposit timeout for partial deposit flow and remove wager guard** - `6b19398` (feat)
2. **Task 2: Add escrowPartialStart and escrowCancelAll socket handlers** - `3deec28` (feat)

**Plan metadata:** _(pending)_

## Files Created/Modified
- `server/socket-io/main.js` - Partial deposit decision flow, escrowPartialStart handler, escrowCancelAll handler, wager guard removal, N-player trackWager multiplier

## Decisions Made
- 30-second decision timer reuses `depositTimers[roomId]` slot — prevents timer leaks if handlers fire late
- `cancelMatchEscrow` wallet array always built from `room.players.filter().map()` to maintain on-chain account ordering consistency
- `kickedSocket.leave(roomId)` called before `room.players.filter()` compact — keeps Socket.IO room membership in sync with data model
- `escrowCancelAll` preserves the room (does not destroy it) so players can reconfigure and retry without reconnecting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 22-03 (SHOT milestones + playAgain N-player fix) is unblocked: wagerStates patterns are established, room compaction logic is in place
- Client needs to handle: `escrowPartialDeposit`, `escrowPartialWaiting`, `kickedFromRoom`, `escrowCancelledAll` events (client integration is a separate phase)
- All 4 SRV requirements for this plan are satisfied (SRV-13, SRV-14, SRV-15, SRV-16)

---
*Phase: 22-server-socket-handlers*
*Completed: 2026-02-28*
