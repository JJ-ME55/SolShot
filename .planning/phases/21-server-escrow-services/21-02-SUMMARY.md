---
phase: 21-server-escrow-services
plan: 02
subsystem: payments
tags: [solana, escrow, anchor, n-player, socket-io]

# Dependency graph
requires:
  - phase: 21-01
    provides: "escrow.js N-player API (createMatchEscrow takes playerAddresses[], cancelMatchEscrow takes playerAddresses[])"
  - phase: 20-anchor-program
    provides: "Anchor program with N-player instructions (cancel_match uses remainingAccounts)"
provides:
  - "solana.js settleMatch with playerCount param (N-player pot = wager * playerCount)"
  - "solana.js refundWager with playerAddresses[] array instead of two separate params"
  - "solana.js re-exports startWithDepositorsEscrow for callers"
  - "main.js: all 5 cancelMatchEscrow call sites use array form with .filter(Boolean)"
  - "main.js: both createMatchEscrow call sites use array form"
  - "main.js: refundWager call site uses playerAddresses array"
  - "main.js: totalPot display values use room?.players?.length || 2 (not hardcoded * 2)"
affects:
  - 22-client-escrow-integration
  - future N-player wager guard removal phase

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ".filter(Boolean) on wallet arrays for defense-in-depth against undefined wallet values"
    - "playerCount = 2 default param keeps settleMatch backward-compatible for existing callers"
    - "room?.players?.length || 2 for N-player-aware totalPot display"

key-files:
  created: []
  modified:
    - server/services/solana.js
    - server/socket-io/main.js

key-decisions:
  - "playerCount defaults to 2 in settleMatch so existing callers without playerCount still work"
  - ".filter(Boolean) applied at all array construction sites — guards against undefined wallet values without changing guard logic"
  - "failedSettlements store shape (p1wallet, p2wallet as separate keys) unchanged — array is constructed at call time only"
  - "totalPot display uses room?.players?.length || 2 — handles undefined room gracefully and covers N-player correctly"

patterns-established:
  - "cancelMatchEscrow pattern: always [w1, w2, ...].filter(Boolean) — never positional"
  - "createMatchEscrow pattern: always playerAddresses[] array — never separate positional params"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 21 Plan 02: Server Escrow Services — Caller Update Summary

**N-player escrow caller update: solana.js playerCount pot math + refundWager array param, main.js all 8 call sites converted to array signatures with .filter(Boolean)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T07:12:34Z
- **Completed:** 2026-02-28T07:14:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `settleMatch` now accepts `playerCount = 2` param and computes `totalPot = wagerSOL * playerCount` instead of hardcoded `* 2`
- `refundWager` now accepts `playerAddresses[]` array and passes it directly to `cancelMatchEscrow(matchId, playerAddresses)`, matching plan 21-01 signature
- `startWithDepositorsEscrow` added to solana.js re-export block for use by future callers
- All 5 `cancelMatchEscrow` call sites in main.js converted to array form with `.filter(Boolean)`
- Both `createMatchEscrow` call sites in main.js converted to array form
- The one `refundWager` call site in main.js converted to array form
- Both `totalPot: ws.amount * 2` display values in main.js updated to `ws.amount * (room?.players?.length || 2)`

## Task Commits

Each task was committed atomically:

1. **Task 1: Update solana.js settleMatch and refundWager for N-player** - `698dc31` (feat)
2. **Task 2: Update all main.js escrow call sites to use array signatures** - `8cabac2` (feat)

**Plan metadata:** committed with docs commit below

## Files Created/Modified
- `server/services/solana.js` — settleMatch playerCount param, refundWager array param, startWithDepositorsEscrow re-export
- `server/socket-io/main.js` — 8 call sites updated (5 cancelMatchEscrow, 2 createMatchEscrow, 1 refundWager) + 2 totalPot display fixes

## Decisions Made
- `playerCount = 2` as default keeps backward compatibility — existing settleMatch callers without playerCount continue to work
- `.filter(Boolean)` applied at all array wrapping sites for defense-in-depth (guards against undefined wallet values even inside existing `if (p1w && p2w)` guards)
- `failedSettlements` store shape (`p1wallet`, `p2wallet` as separate keys) kept unchanged — the retry loop wraps them into an array only at call time
- `room?.players?.length || 2` chosen for totalPot display — handles undefined room context gracefully via optional chaining

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None — all call sites matched their expected patterns exactly.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 21 complete: escrow.js N-player API (21-01) + caller updates (21-02) both done
- server/services/solana.js and server/socket-io/main.js are now consistent with the new N-player escrow.js signatures from plan 21-01
- `startWithDepositorsEscrow` is now accessible via solana.js re-export for future callers
- Phase 22 (client escrow integration) can proceed — no server-side blockers remain for escrow

---
*Phase: 21-server-escrow-services*
*Completed: 2026-02-28*
