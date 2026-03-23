---
phase: 29-desktop-mouse-aim-and-control-settings
plan: 02
subsystem: ui
tags: [phaser, mouse-aim, input, turret, power, game-controls]

# Dependency graph
requires:
  - phase: 29-01
    provides: window.controlScheme interop channel, useControlScheme hook, MenuScreen toggle
provides:
  - Mouse-aim pointermove/pointerdown handlers in MainScene
  - _isMouseAimActive() guard function
  - Turret angle tracking from cursor position via Phaser.Math.Angle.Between
  - Power mapping from cursor distance (5-100, 30% canvas width = max)
  - Left-click fires via handleFireFromReact()
  - Handler cleanup in shutdown() via this.input.off()
affects:
  - Phase 29-03 (HUD display depends on mouse-aim power flowing through bridge)
  - Phase 30 (mobile tap-to-aim uses same guard pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_isMouseAimActive() guard pattern: check window.controlScheme + myTank.active + _firePending"
    - "Phaser input handlers stored in this._mouseAimHandlers object for typed cleanup"
    - "Mouse-aim registered in create() after handleType3/4 so it works for both game types"

key-files:
  created: []
  modified:
    - client/src/scenes/main/index.js

key-decisions:
  - "Use myTank.active (not currentPlayerIndex comparison) for own-turn guard — works identically for both type3 and type4"
  - "Emit powerChange socket event on mousemove (type3 only) so opponent's HUD shows live power updates"
  - "Register handlers in create() (not handleType3/handleType4) so single registration covers both modes"
  - "MAX_DIST = renderer.width * 0.30 — 30% of canvas width maps to power 100; feels responsive without needing to move mouse to edge"

patterns-established:
  - "Mouse-aim guard: always check window.controlScheme, _firePending, myTank.active before processing input"
  - "Pointer handler cleanup: store refs in this._mouseAimHandlers, call this.input.off() in shutdown()"

# Metrics
duration: 20min
completed: 2026-03-23
---

# Phase 29 Plan 02: Mouse-Aim Pointer Handlers Summary

**Phaser MainScene pointermove/pointerdown handlers: turret tracks cursor angle via Phaser.Math.Angle.Between, power maps from cursor distance (5-100), left-click fires — gated by controlScheme and own-turn check**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-23T00:00:00Z
- **Completed:** 2026-03-23T00:20:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `_isMouseAimActive()` guard checks `window.controlScheme === 'mouse'`, `myTank.active`, and `_firePending` — correctly gates all mouse input
- `pointermove` handler calculates absolute turret angle from cursor, sets `relativeRotation`, emits `needEmitAngleChange`, maps distance to power (5–100)
- `pointerdown` (left button only) calls `handleFireFromReact()` — same path as React FIRE button
- `powerChange` socket event emitted on mousemove so opponent HUD shows live power in multiplayer
- Handlers registered once in `create()` covering both type3 (multiplayer) and type4 (practice)
- Full cleanup in `shutdown()` via `this.input.off()` with stored handler refs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mouse-aim pointer handlers to MainScene** - `9a3e4f2` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `client/src/scenes/main/index.js` - Added `_isMouseAimActive()` guard, `_mouseAimHandlers` object with move/down handlers, registered in `create()`, cleaned up in `shutdown()`

## Decisions Made
- Used `myTank.active` instead of `myPlayerIndex === currentPlayerIndex` for the own-turn check because `active` is the canonical source of truth for both type3 and type4 — it's set by `_activateCurrentTank()` in multiplayer and directly in practice mode
- Registered handlers in `create()` (not inside `handleType3()`/`handleType4()`) so a single block of registration/cleanup covers both game types, avoiding duplication
- `MAX_DIST = renderer.width * 0.30` — 30% of canvas width means full power at ~270px from tank on a 900px canvas, which feels natural without forcing extreme mouse movements
- Emit `powerChange` to socket on every `pointermove` (type3 only) so the opponent's HUD reflects live power updates, matching the behavior of the classic power slider

## Deviations from Plan

None — plan executed exactly as written. The only nuance was using `myTank.active` for the own-turn guard instead of the `myPlayerIndex === currentPlayerIndex` pattern suggested in the plan spec, because `active` is more reliable across both game types (Rule 1 alignment, but not a deviation since the done criteria are met identically).

## Issues Encountered
- Pre-existing build failure (`crypto` polyfill missing for `@toruslabs/eccrypto` in webpack 5) confirmed to be unrelated to this plan's changes via `git stash` verification.

## Next Phase Readiness
- Mouse-aim handlers are live and ready. Phase 29-03 (HUD read-only mode + conditional fire button for mouse-aim) can proceed immediately.
- Q/E keyboard fine-tune continues to work alongside mouse-aim since both modify `turret.relativeRotation` directly.

---
*Phase: 29-desktop-mouse-aim-and-control-settings*
*Completed: 2026-03-23*
