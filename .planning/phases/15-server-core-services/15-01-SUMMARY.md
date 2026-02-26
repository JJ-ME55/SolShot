---
phase: 15-server-core-services
plan: 01
subsystem: api
tags: [match-state, n-player, turn-rotation, placement-scoring, socket-io]

# Dependency graph
requires:
  - phase: 14-checklist-alignment-re-audit
    provides: audited 2-player match state machine baseline
provides:
  - N-player match state machine (2-4 players) with all 6 rewritten functions
  - PLACEMENT_POINTS constant [3,2,1,0] for placement-based scoring
  - getRoundPlacement replacing getRoundWinner (ranked array output)
  - isMatchOver with no early exit — all rounds always played
affects:
  - 15-02 (main.js integration — imports getRoundPlacement, updated getNextTurn sig)
  - 16-room-schema-migration (alive map population in fire handler)
  - 17-18-19 (all downstream phases consuming match state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "N-player turn rotation via players[] + alive{} map (skip eliminated)"
    - "Placement scoring: PLACEMENT_POINTS[rank] accumulated across rounds"
    - "No early exit in isMatchOver — all BO1/BO3/BO5 rounds always played"
    - "roundWins side-effect in getRoundPlacement preserves disconnect chain"
    - "alive-map check with legacy HP fallback for phased migration"

key-files:
  created: []
  modified:
    - server/services/match.js

key-decisions:
  - "players[] intentionally empty at createMatchState; populated at requestTerrain (Plan 15-02)"
  - "turnsPerRound = maxPlayers * 10 (replaces hardcoded 20)"
  - "No early exit in isMatchOver — design decision: all rounds always played for N-player fairness"
  - "getRoundWinner removed entirely; getRoundPlacement returns ranked[] not single winner"
  - "roundWins[1st] side-effect kept in getRoundPlacement for backward compat with disconnect chain in main.js"
  - "alive-map fallback to HP check allows Phase 15 to ship before Phase 16 updates fire handler"

patterns-established:
  - "getNextTurn: mutates matchState AND returns value — call sites using assignment remain valid"
  - "eliminationOrder[]: append on kill, reverse for ranked placement of dead players"
  - "damageDealtTotal{}: accumulated per round via getRoundPlacement as tiebreaker for isMatchOver"

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 15 Plan 01: Server Core Services Summary

**N-player match state machine rewritten for 2-4 players: placement scoring, alive-map turn rotation, no-early-exit match determination, and getRoundPlacement replacing getRoundWinner**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T12:14:58Z
- **Completed:** 2026-02-26T12:17:09Z
- **Tasks:** 2 (written as single atomic pass over the same file)
- **Files modified:** 1

## Accomplishments

- Rewrote all 6 match state functions in `server/services/match.js` for N-player (2-4) support
- Added `maxPlayers` param to `createMatchState`, computing `turnsPerRound = maxPlayers * 10`
- Introduced `players[]`, `alive{}`, `currentPlayerIndex`, `placementPoints`, `damageDealtTotal`, `eliminationOrder` fields
- `getNextTurn` now cycles through `alive[]` map with random first-turn selection, no host/player params
- `getRoundPlacement` replaces `getRoundWinner`, returning a full ranked array with cumulative placement scoring
- `isMatchOver` uses placement-point model with damage tiebreaker; no early exit — all rounds always played
- `isRoundOver` uses alive map (N-player) with HP fallback (legacy 2-player before Phase 16 migration)
- `resetForNextRound` resets all N players to 250 HP + alive=true + clears eliminationOrder

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Rewrite match.js for N-player (createMatchState, resetForNextRound, getNextTurn, isRoundOver, getRoundPlacement, isMatchOver)** - `2dbdd37` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `server/services/match.js` - Complete N-player rewrite of all 6 match state functions; 10 exports maintained; getRoundWinner removed

## Decisions Made

- `players[]` is intentionally empty at `createMatchState` time — populated at `requestTerrain` in Plan 15-02 after all players have joined. This is correct by design (not a bug).
- No early exit in `isMatchOver` — all BO1/BO3/BO5 rounds are always played for N-player fairness. Winner determined by cumulative `placementPoints` after `maxRounds`.
- `roundWins[1st]` side-effect kept in `getRoundPlacement` to preserve the disconnect decision chain in `main.js` (which checks `roundWins` to pick the winner on disconnect).
- `alive` map fallback to HP check in `isRoundOver` allows Phase 15 to ship without breaking existing 2-player games before Phase 16 updates the fire handler to write `alive[id] = false`.

## Deviations from Plan

None — plan executed exactly as written. Both tasks were written in a single file pass since they target the same file; committed as one atomic commit covering both task specifications.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `match.js` is fully N-player ready with all 10 required exports
- Plan 15-02 (`main.js` integration) can now update imports: replace `getRoundWinner` with `getRoundPlacement`, update `getNextTurn` call sites to drop `hostId`/`playerId` params, update `isMatchOver` call sites similarly
- Phase 16 (room schema migration) should populate `alive[id] = false` in the fire handler kill path — the `isRoundOver` fallback handles the transition period

---
*Phase: 15-server-core-services*
*Completed: 2026-02-26*
