---
phase: 15-server-core-services
plan: 02
subsystem: api
tags: [gold-economy, match-state, n-player, socket-io, placement-scoring]

# Dependency graph
requires:
  - phase: 15-01
    provides: getRoundPlacement, PLACEMENT_POINTS, isMatchOver(ms), getNextTurn(ms) — N-player match.js functions
provides:
  - N-player gold initialization via initGold(playerIds[])
  - Placement-based gold awards via awardPlacementGold(goldState, rankedPlayerIds)
  - All main.js call sites updated for new match.js and gold.js signatures
  - All per-player maps (scores, kills, roundWins, hp, placementPoints, damageDealtTotal) initialized at requestTerrain for all N socket IDs
  - placementPoints included in roundEnd emit payload (SCORE-06 server-side)
affects: [16-room-schema, 19-match-results-ui, Phase 16 requestTerrain player init will replace pre-Phase 16 compat block]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "initGold(playerIds[]) — array-first N-player gold initialization"
    - "awardPlacementGold(goldState, ranked[]) — tiered 300/150/75/0G by placement rank"
    - "ms.players[] populated at requestTerrain time (pre-Phase 16 compat block)"
    - "getRoundPlacement(ms) returns ranked[] — roundWinner is ranked[0]"

key-files:
  created: []
  modified:
    - server/services/gold.js
    - server/socket-io/main.js

key-decisions:
  - "initGold now accepts playerIds[] — backward compat preserved: initGold([A,B]) produces {A:1000, B:1000}"
  - "PLACEMENT_GOLD [300,150,75,0] replaces flat ROUND_WIN_BONUS (300) — 2nd-4th now receive tiered gold"
  - "awardRoundWinBonus kept in gold.js for backward compat; main.js round-end switches to awardPlacementGold"
  - "ms.players[] populated at requestTerrain from room.host/room.player; Phase 16 will replace this block"
  - "All per-player maps initialized in requestTerrain compat block — satisfies CORE-06"
  - "ms.players.length > 1 replaces playerId ? check for post-fire getNextTurn guard"

patterns-established:
  - "Pattern: All N-player function signatures are now consistent — no hostId/playerId params in match.js calls"
  - "Pattern: roundEnd payload always includes placementPoints for client scoreboard use"

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 15 Plan 02: Gold N-Player + main.js Call Sites Summary

**N-player gold economy (initGold array, awardPlacementGold 300/150/75/0G) wired into main.js with all 8 call-site edits and CORE-06 per-player map initialization at requestTerrain**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T12:21:07Z
- **Completed:** 2026-02-26T12:23:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote `initGold` to accept `playerIds[]` array (2-4 players), preserving 2-player backward compat
- Added `PLACEMENT_GOLD [300,150,75,0]` constant and `awardPlacementGold(goldState, rankedPlayerIds)` function
- Applied all 8 surgical edits to main.js: 2 import lines, 5 call sites, 1 roundEnd emit payload field
- CORE-06 fully satisfied: all per-player maps (scores, kills, roundWins, hp, placementPoints, damageDealtTotal) initialized for all N socket IDs at requestTerrain time
- SCORE-06 server-side satisfied: `placementPoints` included in roundEnd emit payload

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite gold.js — initGold signature + awardPlacementGold** - `b1d4bdc` (feat)
2. **Task 2: Update main.js call sites for new match.js + gold.js signatures** - `ac36fce` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `server/services/gold.js` - initGold(playerIds[]), PLACEMENT_GOLD constant, awardPlacementGold(goldState, rankedPlayerIds[]), PLACEMENT_GOLD exported
- `server/socket-io/main.js` - 8 call-site edits: imports, round-end block, initGold wrap, requestTerrain compat block, turnTimeout getNextTurn, post-fire getNextTurn, roundEnd emit payload

## Decisions Made
- `awardRoundWinBonus` preserved in gold.js for backward compat; round-end in main.js switches to `awardPlacementGold`
- Pre-Phase 16 compat block at requestTerrain populates `ms.players[]` and all per-player maps from `room.host`/`room.player`; Phase 16 will replace this when room schema migrates to `players[]`
- `ms.players.length > 1` replaces old `playerId ?` guard for post-fire `getNextTurn` — semantically identical for 2-player, correct for N-player

## Deviations from Plan

None — plan executed exactly as written. All 8 edits applied cleanly.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Phase 15 complete: match.js N-player rewrite (Plan 01) + gold.js/main.js wiring (Plan 02)
- Phase 16 (Room Schema Migration) can proceed: `ms.players[]` is populated at requestTerrain in compat block; Phase 16 will replace this block with a proper `players[]` array from room schema
- 2-player gameplay is unbroken: ms.players populated from room.host/room.player, all functions produce identical output for 2-player arrays
- Critical note for Phase 16: fix `room.active` flag simultaneously with schema migration (blocks players 3+ from joining)

---
*Phase: 15-server-core-services*
*Completed: 2026-02-26*
