---
phase: 18-client-phaser-and-gamebridge
plan: 02
subsystem: ui
tags: [phaser, gamebridge, elimination, spectator, n-player, multiplayer, canvas]

# Dependency graph
requires:
  - phase: 18-01
    provides: tanks[] array, myPlayerIndex, currentPlayerIndex, _eliminated{} shape, GameBridge setPlayerEliminated/notifyEliminated

provides:
  - playerEliminated socket handler in handleType3() with wreckage + kill text
  - _playEliminationEffect: explosion burst, charred wreckage graphics, fading kill text overlay
  - _enterSpectatorMode: camera zoom to 0.85, placement banner text, bridge.notifyEliminated()
  - _drawSpectatorAimLine / _clearSpectatorAimLine: dotted aim trajectory for spectators only
  - _createNameLabels: Phaser text objects above each tank in player color
  - _youMarker: green YOU label above local player's tank
  - _updateNameLabels: per-frame position tracking, fades eliminated labels
  - _flashYourTurn: scale-up YOUR TURN! animation on local player's turn start
  - showTurnPointer positioned at y-58 (above name labels and YOU marker)

affects:
  - 19-react-battlehud (notifyEliminated hook for Leave Match button — Phase 19 adds React overlay)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Elimination effect: explosion + wreckage graphics + kill text tween, all in one _playEliminationEffect method"
    - "Spectator mode: _isSpectating flag gates aim line rendering + _flashYourTurn + tank.active"
    - "_lastPositions[myPlayerIndex].socketId for local player identity check (never window.socket?.id)"
    - "Name labels: created on terrainGenerated/handleType4, updated per-frame in update(), destroyed in shutdown()"
    - "YOUR TURN flash: skips first turn (hasHadFirstTurn guard), scale-up then fade-out tween"

key-files:
  created: []
  modified:
    - client/src/scenes/main/index.js

key-decisions:
  - "18-02: playerEliminated handler uses _lastPositions[myPlayerIndex].socketId (not window.socket?.id) for encapsulated local player check"
  - "18-02: wreckage is graphics() drawn at tank's last position, setDepth(-1) — above terrain, below blast layer"
  - "18-02: spectator camera zooms to 0.85 via zoomTo() + pans to center — no follow-cam, passive spectate"
  - "18-02: Leave Match button deferred to Phase 19 — notifyEliminated({placement}) provides the React hook"
  - "18-02: _flashYourTurn skips first turn (hasHadFirstTurn guard) to avoid spurious flash on game start"
  - "18-02: showTurnPointer y offset bumped from -45 to -58 to clear name labels and YOU marker"
  - "18-02: spectator aim line recreated each frame (destroy + recreate) to track turret rotation"

patterns-established:
  - "_isSpectating guard: check before _flashYourTurn and before drawing spectator aim line"
  - "Name label lifecycle: create in terrainGenerated handler, update in update(), destroy in shutdown()"
  - "Elimination flow: _eliminated[idx]=true -> _playEliminationEffect -> bridge.setPlayerEliminated -> _enterSpectatorMode (if local)"

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 18 Plan 02: Elimination Visuals, Spectator Mode, and Name Labels Summary

**Phaser visual layer for N-player matches: tank wreckage on elimination, spectator camera zoom, dotted aim trajectory, floating name labels, YOU marker, and YOUR TURN flash overlay**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T19:49:21Z
- **Completed:** 2026-02-26T19:52:37Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments
- `playerEliminated` socket handler wired in `handleType3()` — triggers wreckage, kill text, and spectator mode
- Tank elimination shows explosion burst, persistent charred wreckage hull, and fading "X eliminated by Y" kill text
- Local player elimination enters spectator mode: camera pans/zooms to 0.85, placement banner ("YOU PLACED 3rd"), bridge.notifyEliminated() fires for Phase 19 React overlay
- Spectators see dotted aim trajectory from active turret — recreated per-frame to track rotation
- Name labels float above all tanks in player color, track position each frame, fade on elimination
- Green "YOU" marker above local player's tank for self-identification in 4-player chaos
- Turn pointer repositioned at y-58 to sit above name labels
- "YOUR TURN!" text flash with scale-up animation when local player's turn starts (skips first turn)

## Task Commits

Both tasks were committed atomically in a single combined commit (both tasks modify the same file and are interdependent — name labels referenced from elimination effects):

1. **Task 1 + Task 2: Elimination visuals, spectator mode, name labels, turn flash** - `57432d6` (feat)

## Files Created/Modified
- `client/src/scenes/main/index.js` - Added: `playerEliminated` handler, `_playEliminationEffect`, `_enterSpectatorMode`, `_drawSpectatorAimLine`, `_clearSpectatorAimLine`, `_createNameLabels`, `_updateNameLabels`, `_flashYourTurn`; updated `_activateCurrentTank` and `showTurnPointer`; cleanup in `shutdown()`

## Decisions Made
- Local player identity in `playerEliminated` uses `this._lastPositions?.[this.myPlayerIndex]?.socketId` — consistent with all other handlers, never `window.socket?.id`
- Wreckage uses `this.add.graphics()` at `setDepth(-1)` — drawn above terrain, below blast layer, non-interactive
- Spectator camera uses `zoomTo(0.85)` + `pan(center)` — passive view, no follow-cam between players
- Leave Match button explicitly deferred to Phase 19 — `bridge.notifyEliminated({ placement })` provides the React callback hook
- `_flashYourTurn` skips the very first activation (hasHadFirstTurn guard) to avoid a spurious flash when the match starts
- Spectator aim line is destroyed and recreated each frame to follow the active turret's live rotation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Build succeeded on first attempt with no compilation errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 (React BattleHUD) can now use `bridge.onEliminated` to show Leave Match button and placement overlay
- `bridge.notifyEliminated({ placement })` fires when local player is eliminated
- `bridge.state.isEliminated` and `bridge.state.eliminatedPlacement` are updated via `setPlayerEliminated()`
- All 2-player backward-compat paths still functional (type3 and type4 both confirmed building)
- Phase 18 is now COMPLETE: N-player Phaser visual layer fully implemented

---
*Phase: 18-client-phaser-and-gamebridge*
*Completed: 2026-02-26*
