---
phase: 03-litepaper-v2.1-compliance
plan: 01
subsystem: ui
tags: [wager-tiers, match-modes, custom-challenge, lobby, litepaper-v2.1, solana]

# Dependency graph
requires:
  - phase: 02-todo-completion
    provides: server infrastructure (escrow, SHOT token, DNS live)
provides:
  - Litepaper v2.1 wager tiers (0.1/0.25/0.5/1.0 SOL) on server and client
  - Custom Challenge match mode with arbitrary wager >= 0.1 SOL and all formats
  - isValidWager now accepts matchMode param to bypass tier whitelist for custom_challenge
  - validateMatchMode correctly skips tier whitelist for custom_challenge
  - Client numeric wager input UI for custom challenge creation
affects:
  - 03-02 (matchmaking queue — uses same MATCH_MODES constants)
  - 03-04 (movement enforcement — references match modes)
  - 05-01 (E2E test for Custom Challenge mode)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isValidWager accepts optional matchMode parameter — custom_challenge bypasses tier whitelist"
    - "effectiveWager pattern in LobbyScreen separates custom vs tier-based wager state"

key-files:
  created: []
  modified:
    - server/services/solana.js
    - server/socket-io/main.js
    - client/src/screens/LobbyScreen.js

key-decisions:
  - "WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0] — dropped 0.01 and 0.05 per Litepaper v2.1"
  - "custom_challenge uses Infinity upper bound in wagerRange to accept any wager >= 0.1"
  - "matchMode extracted before isValidWager call in main.js createRoom handler (order swap was necessary)"
  - "client customWager state is separate from wager state — avoids contaminating tier buttons when switching modes"

patterns-established:
  - "Keep server MATCH_MODES and client MATCH_MODES in sync manually — no shared module between Express and CRA"
  - "isValidWager(amount, mode) signature — always pass matchMode from createRoom context"

# Metrics
duration: 7min
completed: 2026-02-20
---

# Phase 3 Plan 01: Update Wager Tiers and Custom Challenge Mode Summary

**Litepaper v2.1 wager tiers (0.1/0.25/0.5/1.0 SOL) enforced on both server and client, with Custom Challenge mode allowing arbitrary wagers >= 0.1 SOL across all formats**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-20T07:55:37Z
- **Completed:** 2026-02-20T08:02:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced v2.0 wager tiers [0, 0.01, 0.05, 0.1, 0.25, 0.5] with v2.1 tiers [0, 0.1, 0.25, 0.5, 1.0] on server
- Added `custom_challenge` to server `MATCH_MODES` with `wagerRange: [0.1, Infinity]` and all formats [1, 3, 5]
- Updated `validateMatchMode` to skip tier whitelist for `custom_challenge` mode
- Updated `isValidWager` to accept optional `matchMode` parameter — returns true for any wager >= 0.1 when mode is `custom_challenge`
- Moved `matchMode` extraction before `isValidWager` call in `createRoom` handler so custom wagers are not wrongly rejected
- Updated client `MATCH_MODES` and `ALL_WAGER_TIERS` to match server exactly
- Added Custom Challenge tab (orange #ff6600) to lobby mode selector
- Added numeric input field (min 0.1, step 0.1) for custom wager in custom_challenge mode
- Custom Challenge shows CREATE CHALLENGE button instead of FIND/CREATE pair
- Client build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Update server wager tiers, MATCH_MODES, and validateMatchMode** - `746a4ea` (feat)
2. **Task 2: Update client MATCH_MODES, wager tiers, and add Custom Challenge UI** - `62f5d7f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/services/solana.js` - WAGER_TIERS, MATCH_MODES, validateMatchMode, isValidWager all updated to v2.1
- `server/socket-io/main.js` - createRoom handler now passes matchMode to isValidWager; matchMode extraction moved before wager validation
- `client/src/screens/LobbyScreen.js` - MATCH_MODES + ALL_WAGER_TIERS updated; custom_challenge tab + numeric wager input added

## Decisions Made

- `matchMode` extraction in `main.js` createRoom handler was moved before the `isValidWager` call — this was required because `isValidWager` now needs `matchMode` to decide whether to apply the tier whitelist. The original ordering had `matchMode` derived later in the function.
- Client uses a separate `customWager` state variable (distinct from `wager`) to avoid contaminating the tier-button state when the user switches between modes.
- `Infinity` used as the upper bound of `wagerRange` for `custom_challenge` — server still validates `wagerSOL >= 0.1` via the lower bound check; the upper bound `Infinity` correctly passes the `wagerSOL > config.wagerRange[1]` guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] matchMode declaration order in createRoom handler**

- **Found during:** Task 1 (updating isValidWager callsite in main.js)
- **Issue:** The plan specified changing `if (wagerAmount > 0 && !isValidWager(wagerAmount))` to pass `matchMode`, but `matchMode` was declared *after* this check in the original code (it was declared inside the `if (matchMode)` block further down). Passing an undeclared variable would cause a ReferenceError.
- **Fix:** Moved the `matchMode` and `rounds` declarations to *before* the `isValidWager` call, and removed the duplicate `// Match mode validation` comment that previously wrapped only the `if (matchMode)` block.
- **Files modified:** `server/socket-io/main.js`
- **Verification:** Server module loads without errors; all validation checks pass
- **Committed in:** `746a4ea` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — declaration order fix)
**Impact on plan:** Essential for correctness. Without this fix the createRoom handler would throw a ReferenceError when processing any wagered room. No scope creep.

## Issues Encountered

None - build passed cleanly, all verifications passed on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server MATCH_MODES and WAGER_TIERS are now v2.1 compliant; 03-02 (matchmaking queue) can proceed immediately as it builds on the same MATCH_MODES constants
- Old values (0.01, 0.05 SOL) now rejected by server validation — existing devnet test rooms using old tiers will receive `Invalid wager tier` error
- Custom Challenge is functional for manual room creation; dedicated join flow (by room code) is not yet implemented — that is out of scope for this plan

---
*Phase: 03-litepaper-v2.1-compliance*
*Completed: 2026-02-20*
