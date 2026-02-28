---
phase: 23-client-ux
plan: 02
subsystem: ui
tags: [react, battle-hud, pot-display, n-player, solana, wagering]

# Dependency graph
requires:
  - phase: 22-server-socket-handlers
    provides: N-player match support, room.players array, maxPlayers on screenData
  - phase: 23-client-ux (plan 01)
    provides: BattleScreen escrow deposit handling, screenData shape with players array
provides:
  - BattleScreen potDisplay uses N-player multiplier (wager * numPlayersInMatch)
  - Defensive fallback chain: players.length → maxPlayers → 2
  - 2-player backward compat preserved
affects: [battle-hud, pot-display, n-player-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defensive optional-chain fallback for N-player count: screenData?.players?.length || screenData?.maxPlayers || 2"

key-files:
  created: []
  modified:
    - client/src/screens/BattleScreen.js

key-decisions:
  - "Use players.length as primary source (actual players in room), maxPlayers as secondary (room config), 2 as safe default"
  - "No changes to BattleHUD.js or PotDisplay.js — they already read potDisplay from gameState correctly"

patterns-established:
  - "N-player count pattern: screenData?.players?.length || screenData?.maxPlayers || 2"

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 23 Plan 02: N-Player Pot Display Fix Summary

**BattleScreen potDisplay fixed to use `wager * numPlayersInMatch` so a 4-player 0.1 SOL match shows "Pot: 0.40" instead of hardcoded "Pot: 0.20"**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-28T11:19:34Z
- **Completed:** 2026-02-28T11:22:44Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced hardcoded `wager * 2` with `wager * numPlayersInMatch` in BattleScreen initialization
- Added defensive fallback chain: `screenData?.players?.length || screenData?.maxPlayers || 2`
- 2-player backward compat preserved — fallback 2 ensures existing matches unaffected
- Build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix potDisplay N-player calculation in BattleScreen** - `4bc396b` (feat) — committed as part of 23-01 execution

**Note:** The fix was already committed in `4bc396b feat(23-01)` which bundled BattleScreen changes from both plan 01 and plan 02. The implementation is complete and verified.

## Files Created/Modified
- `client/src/screens/BattleScreen.js` — replaced `wager * 2` with `wager * numPlayersInMatch` using defensive fallback chain

## Decisions Made
- Use `screenData?.players?.length` as primary source since it reflects the actual player count in the room
- Fall back to `screenData?.maxPlayers` (room config) if players array not populated yet
- Final fallback of `2` preserves backward compatibility for 2-player matches
- No changes to BattleHUD.js or PotDisplay.js — they already correctly pass `potDisplay` from gameState

## Deviations from Plan

None - plan executed exactly as written. The fix was found to be already implemented in commit `4bc396b` (part of 23-01 execution), confirming the change is correct and the build passes.

## Issues Encountered
- `npx react-scripts build` fails due to project using `react-app-rewired` — correct command is `npm run build`. This is pre-existing project configuration, not a new issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLT-06 satisfied: pot display uses wager * numPlayers for all N-player matches
- 2-player backward compat preserved via fallback chain
- Phase 23 plan 02 complete — ready for plan 03 (remaining client UX tasks)

---
*Phase: 23-client-ux*
*Completed: 2026-02-28*
