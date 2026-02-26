---
phase: 16-room-schema-battle-engine
plan: 03
subsystem: api
tags: [socket-io, physics, n-player, elimination, heatseeker, battle-engine, multiplayer]

# Dependency graph
requires:
  - phase: 16-01
    provides: room.players[] array, getPlayerSlot() helper
  - phase: 16-02
    provides: generateTankPositions N-player, room.players[i].pos assignments
  - phase: 15-server-core-services
    provides: isRoundOver, getRoundPlacement, isMatchOver, resetForNextRound, ms.alive, ms.eliminationOrder

provides:
  - Complete N-player fire handler with elimination detection and playerEliminated events
  - Homing weapon nearest-enemy targeting via Math.hypot distance sort
  - turnResult payload with players[], alive, currentPlayerIndex alongside backward-compat shims
  - matchEnd payload with survivorOrder[] ranked array
  - N-player turn timeout elimination (>2 alive eliminates player; <=2 alive ends match)
  - All binary room.host/room.player references eliminated from main.js
  - Movement handlers (positionUpdate, stepLeft, stepRight) via getPlayerSlot
  - Disconnect handler notifies all remaining players via room.players.filter
  - Reconnect handler remaps socket ID in room.players[], ms.players[], all per-player maps

affects:
  - Phase 17 (client N-player UI) — server now emits playerEliminated, survivorOrder, players[]
  - Client BattleScreen — can read players[] from turnResult for N-player HUD

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Elimination loop: iterate ms.players[] after HP update, check alive[pid] + hp[pid] <= 0"
    - "N-player timeout: aliveCount > 2 eliminates player + continues; <= 2 ends match"
    - "getPlayerSlot() for all player-specific slot lookups in movement/fire handlers"
    - "room.players.find(p => p.socketId !== client.id) for opponent lookup"
    - "rejoinSlot = room.players.find(p => p.socketId === oldSocketId) for unified remap"

key-files:
  created: []
  modified:
    - server/services/physics.js
    - server/socket-io/main.js

key-decisions:
  - "processHomingShot nearest-enemy: Math.hypot from trajectory[0] (launch point) to each tank"
  - "tanks[] array in fire handler: room.players filtered by p.pos && ms.alive[p.socketId]"
  - "Elimination loop order: iterates ms.players[] for deterministic simultaneous-kill order"
  - "awardKillBonus called per kill in fire handler elimination loop"
  - "turnResult extended with players[], alive, currentPlayerIndex (additive, shims preserved)"
  - "matchEnd survivorOrder uses ranked[] from getRoundPlacement already in scope"
  - "hostId/playerId for settlement backward compat defined from room.players[0/1] at matchResult.isOver"
  - "N-player timeout (>2): alive=false + eliminationOrder + playerEliminated emit + round-end path"
  - "N-player timeout (<=2): original forfeit-ends-match path preserved for 2-player backward compat"
  - "rejoinRoom: single unified remap block via room.players.find(oldSocketId) (no isHost branch)"
  - "rejoinRoom: ms.alive, ms.placementPoints, ms.damageDealtTotal, ms.consecutiveTimeouts all remapped"

patterns-established:
  - "Pattern: N-player elimination in fire handler — ms.players[] iteration order is canonical"
  - "Pattern: Timeout >2 alive = player elimination path; <=2 alive = match forfeit path"
  - "Pattern: opponentId = room.players.find(p => p.socketId !== client.id)?.socketId"

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 16 Plan 03: N-Player Battle Engine Summary

**Complete N-player battle engine: fire handler damages all N players with elimination events, homing weapons target nearest enemy, turn timeout eliminates (not forfeits) when >2 alive, and all binary room.host/room.player references eliminated from main.js**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26T13:37:37Z
- **Completed:** 2026-02-26T13:42:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fire handler fully N-player: tanks[] built from room.players filtered by ms.alive, elimination loop detects HP<=0 kills, emits playerEliminated, awards kill bonuses
- processHomingShot uses Math.hypot nearest-enemy from trajectory launch point (was: first non-shooter in array)
- turnResult extended with players[], alive, currentPlayerIndex alongside all existing backward-compat shims
- matchEnd includes survivorOrder[] ranked placement array
- Turn timeout N-player path: >2 alive eliminates timed-out player + full round-end path; <=2 alive preserves original forfeit-ends-match
- All binary room.host/room.player (singular) references eliminated from main.js (grep returns 0)
- positionUpdate, stepLeft, stepRight all use getPlayerSlot() for N-player slot lookup
- disconnect handler: opponentDisconnected emitted to ALL other players via room.players.filter()
- rejoinRoom: unified single remap block via room.players.find(oldSocketId) — remaps room slot + ms.players[] + all per-player maps including ms.alive, ms.placementPoints, ms.damageDealtTotal, ms.consecutiveTimeouts

## Task Commits

Each task was committed atomically:

1. **Task 1: Homing nearest-enemy, N-player fire handler, elimination loop, survivorOrder** - `2f5fccb` (feat)
2. **Task 2: Movement handlers, disconnect/reconnect, turn timeout N-player** - `89c0b74` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified
- `server/services/physics.js` - processHomingShot: Math.hypot nearest-enemy targeting
- `server/socket-io/main.js` - Complete N-player battle engine; zero binary room.host/room.player references

## Decisions Made
- `Math.hypot(tank.x - startPoint.x, tank.y - startPoint.y)` using trajectory[0] as launch point — consistent with where homing begins tracking
- `tanks[]` filters by `p.pos && ms.alive[p.socketId]` — dead players excluded from physics simulation
- Elimination loop iterates `ms.players[]` (ordered array) — deterministic simultaneous-kill order when two players die in same shot
- `awardKillBonus` called per kill even for simultaneous kills — each kill earns full bonus
- `hostId/playerId` for settlement code derived from `room.players[0/1]?.socketId` — backward compat with 2-player settlement logic; full N-player settlement deferred per project decision (escrow only supports 2-player until Phase 19)
- N-player timeout: `aliveCount > 2` triggers player elimination path (not match end) — keeps game going for 3-4 players when one afks; `<= 2` preserves original forfeit-ends-match (same as 2-player)
- rejoinRoom: replaced two separate `if (isHost && room.host) / else if (room.player)` branches with single `rejoinSlot = room.players.find(p => p.socketId === oldSocketId)` — simpler, works for N players

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate `const startPoint` declaration in processHomingShot**
- **Found during:** Task 1 (physics.js edit)
- **Issue:** Original code had `const startPoint = trajectory[0]` later in the function body for building homingTraj. Adding another `const startPoint` for nearest-enemy caused duplicate identifier syntax error.
- **Fix:** Removed the second declaration — the single `startPoint` at the top of the function serves both purposes (nearest-enemy distance calc and homingTraj starting point are identical values).
- **Files modified:** server/services/physics.js
- **Verification:** `node -c` passes
- **Committed in:** 2f5fccb (Task 1 commit)

**2. [Rule 2 - Missing Critical] Updated cleanupRoom opponentId lookup and roomSnapshot to N-player**
- **Found during:** Task 2 (disconnect handler migration)
- **Issue:** `cleanupRoom` function had 3 binary room.host/room.player references: opponentId lookup, roomSnapshot shape, and shouldRefund wallet lookup. Plan explicitly called out disconnect handler but cleanupRoom was the actual implementation.
- **Fix:** Updated opponentId to `room.players.find(p => p.socketId !== client.id)?.socketId`, roomSnapshot to `{ players: room.players, ... }`, and shouldRefund wallets to `room.players?.[0/1]?.socketId`.
- **Files modified:** server/socket-io/main.js
- **Committed in:** 89c0b74 (Task 2 commit)

**3. [Rule 2 - Missing Critical] matchEnd roomSnapshot updated to use players[] (Task 1)**
- **Found during:** Task 1 (matchEnd settlement block)
- **Issue:** Settlement snapshot passed to handleSettlementFailure still used `{ host: roomSnap.host, player: roomSnap.player, ... }` shape — would fail for N>2 player snapshots.
- **Fix:** Changed to `{ players: roomSnap.players, escrowPDA: roomSnap.escrowPDA }`.
- **Files modified:** server/socket-io/main.js
- **Committed in:** 2f5fccb (Task 1 commit)

**4. [Rule 2 - Missing Critical] formattedScores now iterates ms.players[] instead of [hostId, playerId]**
- **Found during:** Task 1 (matchEnd payload construction)
- **Issue:** matchEnd formatted scores was `for (const pid of [hostId, playerId])` — misses players 3 and 4.
- **Fix:** Changed to `for (const pid of ms.players)` — covers all N players.
- **Files modified:** server/socket-io/main.js
- **Committed in:** 2f5fccb (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing critical)
**Impact on plan:** All fixes were necessary for correctness and N-player coverage. No scope creep — all changes within main.js/physics.js and within the battle engine migration scope.

## Issues Encountered
None — all changes were straightforward migrations following established patterns from Plans 16-01 and 16-02.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 is COMPLETE: all three plans done — room schema (16-01), terrain spawn (16-02), battle engine (16-03)
- Server now supports full 4-player match lifecycle: terrain → spawn → fire → elimination → round-end → match-end
- Client BattleScreen still reads 2-player shims — Phase 17 will update client to read players[] array
- Escrow settlement still uses 2-player hostId/playerId — N-player escrow deferred to Phase 19 per project decision
- All zero `room.host`/`room.player` (singular) references confirmed in main.js

---
*Phase: 16-room-schema-battle-engine*
*Completed: 2026-02-26*
