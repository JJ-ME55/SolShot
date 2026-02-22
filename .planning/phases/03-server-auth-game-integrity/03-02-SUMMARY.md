---
phase: 03-server-auth-game-integrity
plan: 02
subsystem: auth
tags: [socket-io, game-integrity, server-auth, position-validation, terrain]

# Dependency graph
requires:
  - phase: 03-01
    provides: requireAuth guards on 14 handlers, SA-05 turn ownership, SA-06 cross-room isolation
provides:
  - terrainPath and getTerrainPath handlers deleted — terrain is server-generated only
  - fire handler uses client position for trajectory only, never persists back to server state
  - positionUpdate rejects teleportation jumps during BATTLE state
affects:
  - 03-03
  - 08-verification-re-audit

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server position is authoritative — client position data used for THIS shot only, never persisted"
    - "Distance validation gated on MATCH_STATES.BATTLE — loose during setup, strict during play"
    - "Handler deletion is the safest fix — legacy client-side terrain override path fully closed"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "SA-03: deleted terrainPath + getTerrainPath handlers entirely — React client never emits these, only old Phaser codebase did"
  - "SA-04: fire handler reads client position within tolerance for trajectory, but NEVER writes back to serverPos"
  - "SA-04: positionUpdate distance thresholds (400px H, 200px V) match fire handler tolerance — accounts for max knockback and 4-step movement"
  - "Distance validation is BATTLE-state-only — setup/lobby positions may jump legitimately during terrain generation"

patterns-established:
  - "Server position (room.host.pos / room.player.pos) is ground truth — clients report positions for UX sync only"
  - "Delete vestigial handlers rather than guard them — no client emits terrainPath, so the safest change is removal"
  - "MATCH_STATES enum used as gating condition for validation strictness"

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 3 Plan 2: Server Auth & Game Integrity — SA-03/SA-04 Summary

**Vestigial terrainPath handler deleted and server position authority enforced: fire handler no longer persists client positions, positionUpdate rejects battle-state teleportation jumps**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-22T09:42:46Z
- **Completed:** 2026-02-22T09:44:33Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments
- Deleted the `terrainPath` and `getTerrainPath` handlers — 63 lines of legacy Phaser-era code that allowed any client to override the server's terrain data and tank positions wholesale
- Removed `terrainPath: room.terrainPath` from `persistRoom()` update object — field is no longer set by any handler
- Removed `serverPos.x = startX` / `serverPos.y = startY` writeback from fire handler — client position now used for THIS shot's trajectory only, not persisted to server state
- Added distance validation to `positionUpdate`: rejects jumps > 400px horizontal or > 200px vertical during BATTLE state, preventing teleportation exploitation

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete terrainPath handler and fix fire handler position writeback** - `6293657` (feat)
2. **Task 2: Add distance validation to positionUpdate handler** - `4cddd80` (feat)

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified
- `server/socket-io/main.js` - Removed terrainPath/getTerrainPath handlers, fire handler writeback, and added positionUpdate distance validation

## Decisions Made
- Deleted the handlers outright rather than adding a guard — the React client never emits `terrainPath` (confirmed by grep), so the handler is pure attack surface with no legitimate callers
- Fire handler keeps the tolerance check for trajectory calculation (client pixel-walks terrain surface which may differ from server heightmap snap), but the two writeback lines are gone — the distinction is "use for this shot" vs "adopt as server truth"
- Distance thresholds (400px H / 200px V) are BATTLE-state-only because terrain generation during setup legitimately places tanks at arbitrary positions

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- SA-03 and SA-04 complete; terrain and position attack surfaces closed
- 03-03 (remaining auth hardening items, if any) can proceed
- main.js now has: requireAuth guards (SA-01), turn ownership (SA-05), cross-room isolation (SA-06), terrain handler deletion (SA-03), fire position writeback removed (SA-04), positionUpdate distance validation (SA-04)

---
*Phase: 03-server-auth-game-integrity*
*Completed: 2026-02-22*
