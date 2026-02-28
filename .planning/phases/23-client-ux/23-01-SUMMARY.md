---
phase: 23-client-ux
plan: 01
subsystem: ui
tags: [react, socket.io, escrow, lobby, deposit, n-player]

# Dependency graph
requires:
  - phase: 22-server-socket-handlers
    provides: "escrowDepositStatus, escrowPartialDeposit, escrowPartialWaiting, kickedFromRoom, escrowCancelledAll, escrowDepositTimeout server events; depositDeadlineMs timestamp"
provides:
  - "LobbyScreen deposit status badges (DEPOSITED/PENDING per player slot)"
  - "5-minute countdown timer driven by server depositDeadlineMs timestamp"
  - "Host partial-deposit decision UI (START WITH N / CANCEL AND REFUND buttons)"
  - "Non-host waiting message (WAITING FOR HOST DECISION)"
  - "Kick modal with reason text, navigate-to-menu on dismiss"
  - "formatWagerWithPayout N-player pot math (amount * players, not amount * 2)"
  - "clearDepositState helper called in all terminal event handlers"
affects: [client-battle, client-shop, client-prestige]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "clearDepositState helper pattern: extract shared cleanup into useCallback, call from every terminal event handler"
    - "Server-driven countdown: store depositDeadlineMs from server, compute remaining seconds client-side via setInterval"
    - "IIFE inside JSX map for conditional badge render: {depositStatuses.length > 0 && (() => { ... })()}"

key-files:
  created: []
  modified:
    - client/src/screens/LobbyScreen.js

key-decisions:
  - "countdownRef uses useRef (not useState) to avoid stale closure issues in setInterval tick"
  - "clearDepositState called in escrowActive, escrowCancelledAll, escrowDepositTimeout, kickedFromRoom, startPick, opponentLeft — all 6 terminal paths"
  - "formatWagerWithPayout defaults players=2 for backward compat with free/practice rooms that don't send maxPlayers"
  - "Deposit badge looks up by socketId from depositStatuses array (not index) — order-independent"

patterns-established:
  - "Terminal socket events always call clearDepositState before other state updates"
  - "Countdown timer started with server timestamp, not client Date.now() + duration (avoids clock skew)"

# Metrics
duration: 7min
completed: 2026-02-28
---

# Phase 23 Plan 01: LobbyScreen N-Player Escrow UX Summary

**Real-time deposit status badges, server-driven 5-minute countdown, host partial-deposit decision buttons, and kicked-player modal wired to Phase 22 escrow socket events in LobbyScreen**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-28T11:19:13Z
- **Completed:** 2026-02-28T11:26:19Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Per-player DEPOSITED/PENDING badges in waiting room player slots, driven by `escrowDepositStatus` events
- Countdown timer counting down from `depositDeadlineMs` server timestamp, with urgency color change at 30s and pulse animation at 10s
- Host sees "START WITH N" + "CANCEL AND REFUND" buttons on `escrowPartialDeposit`; non-host sees "WAITING FOR HOST DECISION" on `escrowPartialWaiting`
- Kicked modal with reason text (from `kickedFromRoom`) navigates back to menu on dismiss
- `formatWagerWithPayout` now calculates pot as `amount * players` — 3-player 0.1 SOL room correctly shows "0.30 SOL pot"
- `clearDepositState` helper ensures all 6 terminal event paths (escrowActive, escrowCancelledAll, escrowDepositTimeout, kickedFromRoom, startPick, opponentLeft) cleanly reset deposit UI state

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deposit state, socket handlers, and countdown timer** - `4bc396b` (feat)
2. **Task 2: Add deposit badges, countdown UI, partial decision panel, kick modal** - `d90fd34` (feat)
3. **Task 3: Fix formatWagerWithPayout for N-player pot math** - `890ae46` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/src/screens/LobbyScreen.js` - Added 8 new useSocket handlers, clearDepositState helper, deposit status badges, countdown timer JSX, partial decision panel, kicked modal, N-player pot math fix

## Decisions Made
- `countdownRef` is a `useRef` rather than state to avoid stale closure issues inside `setInterval` tick function
- `clearDepositState` extracted as a `useCallback` and called in every terminal event handler — prevents forgetting cleanup in any one path
- `formatWagerWithPayout` defaults `players = 2` for backward compatibility with rooms that don't advertise `maxPlayers`
- Deposit badge lookups use `socketId` from `depositStatuses` array (not array index) — correct when players join in different orders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build initially run with `npx react-scripts build` which bypassed `config-overrides.js` polyfills, causing a crypto module error. Used `npm run build` (react-app-rewired) instead — pre-existing project requirement, not a code issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 23-01 complete: deposit flow UX fully wired for N-player escrow lobby
- Plan 23-02 (N-player pot display fix) already has a SUMMARY — check if it overlaps or if sequential execution applies
- Remaining: BattleScreen escrow event handling (forfeit/disconnect with N players), end-of-match settlement display
