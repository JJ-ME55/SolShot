---
phase: 18-client-phaser-and-gamebridge
plan: 01
subsystem: ui
tags: [phaser, react, gamebridge, n-player, tanks, multiplayer, socket]

# Dependency graph
requires:
  - phase: 16-room-schema-migration
    provides: room.players[] ordered array, positions[] N-player terrain spawn
  - phase: 17-server-systems
    provides: turnResult.players[], currentPlayerIndex, terrainGenerated.positions[] canonical payloads

provides:
  - MainScene tanks[] array replacing hardcoded tank1/tank2
  - myPlayerIndex for local player identity, currentPlayerIndex for turn tracking
  - terrainGenerated reads positions[] canonical array, falls back to tankPositions shim
  - applyTurnResult iterates data.players[] for N-player HP sync
  - GameBridge players[] state shape with backward-compat tank1/tank2 shims
  - ShopScreen passes players[] array (with weaponsByPlayer) to BattleScreen
  - _activateCurrentTank() method for N-player turn activation
  - setPlayerEliminated() and onEliminated callback ready for Plan 18-02

affects:
  - 18-02 (elimination, spectator, name labels — builds on tanks[] and myPlayerIndex)
  - 19-react-battlehud (when it removes backward-compat tank1/tank2 shim reads)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "N-player tanks[] array: indexed to room.players[] order, myPlayerIndex tracks local player"
    - "Backward-compat shim pattern: players[] canonical + tank1/tank2 shims in same state object"
    - "positions[] canonical with tankPositions shim fallback for terrainGenerated and turnResult"
    - "_activateCurrentTank(): deactivates all tanks, activates only myPlayerIndex when it's their turn"
    - "myPlayerIndex >= 0 guard before any this.tanks[this.myPlayerIndex] access"

key-files:
  created: []
  modified:
    - client/src/scenes/main/index.js
    - client/src/classes/Tank.js
    - client/src/classes/Turret.js
    - client/src/bridge/GameBridge.js
    - client/src/screens/ShopScreen.js

key-decisions:
  - "18-01: tanks[] indexed to room.players[] order — myPlayerIndex, not host/joiner perspective"
  - "18-01: terrainGenerated reads positions[] canonical with tankPositions shim fallback"
  - "18-01: createTanks(N) uses sceneData.players?.length || 2 (resilient fallback)"
  - "18-01: fireRejected guards myPlayerIndex >= 0 before tanks[myPlayerIndex] access"
  - "18-01: backward-compat tank1/tank2 shims in GameBridge and _pushStateToBridge until Phase 19"
  - "18-01: opponentPowerChange/StepLeft/StepRight/AngleChange listeners removed — N-player sync via turnResult.positions[]"
  - "18-01: moveLeft/moveRight guard simplified to !this.active (remote tanks never have leftSteps > 0)"
  - "18-01: handleType4 sets myPlayerIndex=0 (local player always tanks[0] in practice)"
  - "18-01: _eliminated{} object added to constructor but NOT populated (Plan 18-02 does that)"

patterns-established:
  - "myPlayerIndex >= 0 guard: always check before accessing this.tanks[this.myPlayerIndex]"
  - "players[] dual payload: canonical N-player + backward-compat shims in same state push"
  - "createTanks(N): destroy existing tanks, create N fresh Tank instances with id=1..N"

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 18 Plan 01: N-Player Phaser Migration Summary

**Replaced hardcoded tank1/tank2 with tanks[] array across MainScene, Tank.js, Turret.js, ShopScreen, and GameBridge — structural foundation for 2-4 player rendering**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T19:36:16Z
- **Completed:** 2026-02-26T19:44:57Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments
- MainScene now uses `tanks[]` array exclusively — all `tank1`/`tank2` references eliminated
- `myPlayerIndex` determines which tank is the local player (set in terrainGenerated from positions[])
- `currentPlayerIndex` tracks whose turn it is (set from firstTurn/nextTurn socketId lookup)
- Tank.js and Turret.js stripped of 2-player socket listeners (opponentStep*, opponentPowerChange, opponentAngleChange)
- ShopScreen builds and passes `players[]` array with weapons-per-player from `weaponsByPlayer`
- GameBridge state shape extended with `players[]`, `myPlayerIndex`, `currentPlayerIndex`, `isEliminated`, `eliminatedPlacement`
- All existing 2-player functionality preserved via backward-compat shims and tanks[0]/tanks[1] for type4

## Task Commits

Each task was committed atomically:

1. **Task 1: Tank.js and Turret.js N-player surgery** - `cfafa82` (feat)
2. **Task 2: MainScene N-player structural migration** - `f8f0f6f` (feat)
3. **Task 3: ShopScreen players[] data pass and GameBridge state shape** - `240a980` (feat)

## Files Created/Modified
- `client/src/scenes/main/index.js` - Full N-player rewrite: tanks[], myPlayerIndex, currentPlayerIndex, createTanks(), _activateCurrentTank(), N-player terrainGenerated/applyTurnResult/checkSwitchTurn handlers
- `client/src/classes/Tank.js` - Removed 2-player socket listeners, updated all scene.tank1/tank2 to scene.tanks[scene.myPlayerIndex], N-player autoAdjust()
- `client/src/classes/Turret.js` - Removed opponentAngleChange listener, updated emitRotation() and Q/E key guards for N-player
- `client/src/bridge/GameBridge.js` - Added players[], myPlayerIndex, currentPlayerIndex, isEliminated, eliminatedPlacement to state; added setPlayerEliminated(), onEliminated callback, notifyEliminated()
- `client/src/screens/ShopScreen.js` - shopEnd handler builds players[] from screenData.players + data.weaponsByPlayer, passes to navigate('battle')

## Decisions Made
- Used `positions.findIndex(p => p.socketId === socket.id)` for myPlayerIndex — clean O(n) lookup, consistent with server's room.players[] ordering
- Backward-compat shims (tank1/tank2 in GameBridge state, player1/player2 in ShopScreen navigate) kept until Phase 19 updates BattleHUD
- `createTanks(N)` uses `sceneData.players?.length || 2` — resilient to missing players array (practice mode, old clients)
- `_eliminated{}` object shape defined but not populated — Plan 18-02 adds the playerEliminated socket handler
- `myPlayerIndex >= 0` guard added to every `tanks[myPlayerIndex]` access to prevent crashes during pre-terrain state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. Build succeeded on first attempt with no compilation errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-02 can now register `playerEliminated` socket handler and populate `_eliminated[index]`
- `_activateCurrentTank()` already correctly skips eliminated players (they have `active = false`)
- `setPlayerEliminated()` in GameBridge is ready for Plan 18-02 to call
- `onEliminated` callback registered in GameBridge for Plan 18-02 to use for spectator/UI overlay
- 2-player matches (type3 and type4) confirmed working via backward-compat fallbacks throughout

---
*Phase: 18-client-phaser-and-gamebridge*
*Completed: 2026-02-26*
