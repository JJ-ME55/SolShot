---
phase: 16-room-schema-battle-engine
plan: 02
subsystem: api
tags: [socket-io, physics, n-player, terrain, tank-positions, multiplayer]

# Dependency graph
requires:
  - phase: 16-01
    provides: room.players[] array, room.maxPlayers, getPlayerSlot helper
  - phase: 15-server-core-services
    provides: createMatchState with ms.players[], ms.hp, ms.alive maps

provides:
  - generateTankPositions(heightmap, N, width) returning Array<{x,y}> of length N
  - 2-player backward compat: preserves original left (20-35%) / right (65-80%) zones
  - N>2 player zone distribution: [10%-90%] usable terrain divided into N equal zones
  - requestTerrain assigns room.players[i].pos from positions[i]
  - terrainGenerated payload: positions[] canonical + tankPositions shim
  - turnResult payload: positions[] canonical + tankPositions shim
  - rejoinSuccess payload: positions[] canonical + tankPositions shim
  - Terrain Y-update loops over room.players[] after terrain deformation

affects:
  - 16-03-PLAN (fire handler serverPos lookup, tanks array build, movement handlers still use room.host/room.player)
  - client BattleScreen (reads tankPositions shim for 2-player; will eventually read positions[])

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "N-player terrain: generateTankPositions(heightmap, N, width) → [{x,y},...] array"
    - "Dual-payload pattern: emit both canonical positions[] AND backward-compat tankPositions shim"
    - "N-player Y-update: loop over room.players[] instead of binary if(room.host)/if(room.player)"

key-files:
  created: []
  modified:
    - server/services/physics.js
    - server/socket-io/main.js

key-decisions:
  - "generateTankPositions N=2 path preserves exact original ranges — 20%+rand(15%) left, 65%+rand(15%) right"
  - "N>2 uses zoneWidth = floor(usableWidth/N); inner spawn in 20%-80% of zone; clamps to width-1"
  - "ms.tankPositions now stores positions[] array (was {host,player} object)"
  - "turnResult also updated with positions[]/tankPositions dual payload (bonus: not in original plan)"
  - "fire handler serverPos lookup and tanks array build deferred to 16-03 (still use room.host/room.player)"

patterns-established:
  - "Pattern: dual payload — positions[] canonical + tankPositions shim — for all terrain-related emits"
  - "Pattern: room.players.forEach((p,i) => p.pos = positions[i]) for batch position assignment"

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 16 Plan 02: N-Player Terrain Spawn Summary

**generateTankPositions rewritten as Array-returning N-player function; requestTerrain, terrainGenerated, turnResult, and rejoinSuccess payloads updated with canonical positions[] plus 2-player backward-compat tankPositions shim**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T13:31:41Z
- **Completed:** 2026-02-26T13:33:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `generateTankPositions` in physics.js now accepts `(heightmap, N=2, width)` and returns `[{x,y},...]` — N=2 path preserves original left/right zones exactly, N>2 distributes across equal zones in [10%-90%] usable terrain
- requestTerrain handler generates positions for all N players and assigns to `room.players[i].pos` via forEach; completely removed old `{host,player}` result handling
- All four terrain-related emits (terrainGenerated, turnResult, rejoinSuccess, _terrainCache) updated to dual-payload pattern: `positions[]` canonical array plus `tankPositions` backward-compat shim

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite generateTankPositions for N players** - `0518c9b` (feat)
2. **Task 2: Update requestTerrain handler and terrain payloads** - `16e76c1` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified
- `server/services/physics.js` - generateTankPositions rewritten: new signature (heightmap, N=2, width), returns Array<{x,y}>, 2-player compat + N-zone algorithm
- `server/socket-io/main.js` - requestTerrain, terrainGenerated payload, turnResult payload, rejoinSuccess payload, terrain Y-update all updated for N-player

## Decisions Made
- `generateTankPositions` N=2 branch preserves the exact original random ranges — `0.2 + rand * 0.15` left, `0.65 + rand * 0.15` right — ensuring 2-player game behavior is unchanged
- N>2 algorithm: divide `[10%, 90%]` usable width into N equal zones; spawn within inner 60% of each zone (20%-80% of zone); clamp to width-1
- `ms.tankPositions` stores the positions array directly (not `{host, player}`) — match state is now N-player native
- `turnResult` also updated with dual payload (bonus fix not explicitly in plan; needed for consistency since clients read tankPositions from turnResult for post-fire position sync)
- Fire handler `serverPos` lookup and `tanks` array build still read `room.host`/`room.player` — deferred to 16-03 as planned

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated turnResult payload to include positions[] and updated tankPositions shim**
- **Found during:** Task 2 (turnResult emit review)
- **Issue:** Plan specified terrainGenerated and rejoinSuccess dual payloads but omitted turnResult, which also sends `tankPositions` to clients for post-fire position sync. Leaving it on old `room.host`/`room.player` would cause inconsistency between N-player position array and the shim sent after each fire.
- **Fix:** Updated turnResult `tankPositions` to read from `room.players[0]`/`room.players[1]` and added `positions[]` field alongside it.
- **Files modified:** server/socket-io/main.js
- **Verification:** Grep confirms no `room.host.pos` / `room.player.pos` in the turnResult emit block
- **Committed in:** `16e76c1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for payload consistency — all terrain-related emits now send the same dual-payload format. No scope creep.

## Issues Encountered
None — the 16-01 migration had already updated the requestTerrain `ms.players` compat block to read from `room.players[]`, so that portion required no changes. Plan 16-02 picked up exactly where 16-01 left off.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 16-03 (fire handler + movement handler migration) can proceed: tank positions are now stored on `room.players[i].pos` and emitted via `positions[]` in all terrain payloads
- Remaining `room.host`/`room.player` references: fire handler `isHost` / `serverPos` detection (~lines 2005-2006), `tanks` array build (~lines 2027-2044), gold/win settlement (~lines 2148-2149), movement handlers positionUpdate/stepLeft/stepRight (~lines 2629-2708), disconnect/reconnect handlers (~lines 639-976)
- Client BattleScreen still reads `tankPositions.host`/`tankPositions.player` shim — shim preserved in all payloads, no client changes needed until Phase 17

---
*Phase: 16-room-schema-battle-engine*
*Completed: 2026-02-26*
