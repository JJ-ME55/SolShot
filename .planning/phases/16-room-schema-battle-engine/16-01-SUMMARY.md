---
phase: 16-room-schema-battle-engine
plan: 01
subsystem: api
tags: [socket-io, room-schema, n-player, matchmaking, multiplayer]

# Dependency graph
requires:
  - phase: 15-server-core-services
    provides: initGold(playerIds[]), createMatchState(roomId, roundType, maxPlayers), N-player match state

provides:
  - room.players[] array schema replacing binary room.host/room.player
  - room.maxPlayers field (2/3/4) set at createRoom
  - getPlayerSlot(room, socketId) helper for all future N-player slot lookups
  - N-player join guard: blocks at players.length >= maxPlayers
  - N-player ready check: all players must ready
  - N-player shop/gold/weapon init via playerIds[] loops
  - startPick backward-compat shim: emits host, player, AND players[] fields
  - getOpenRooms: currentPlayers/maxPlayers fill counts for lobby display
  - persistRoom: DB backward-compat via players[0] as host, players[1] as player

affects:
  - 16-02-PLAN (requestTerrain compat block already updated to read room.players[])
  - 16-03-PLAN (fire handler, movement handlers, reconnect handler still read room.host/room.player)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "players[] array as ordered player roster: players[0]=host, players[n-1]=last joiner"
    - "Atomic race guard: push placeholder before async check, pop on failure"
    - "backward-compat shim: emit both legacy fields AND new canonical fields"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "getPlayerSlot(room, socketId) helper defined at module level for O(N) lookup"
  - "maxPlayers defaults to 2 if client doesn't send player.maxPlayers (UI not yet updated)"
  - "joinRoom uses push-before-async-check for atomic race guard (replaces room.active=true)"
  - "room.active=true set when players.length === maxPlayers (not at first join)"
  - "persistRoom writes players[0] as host, players[1] as player for DB backward compat"
  - "startPick emits host, player (shim) AND players[] (canonical) for client backward compat"
  - "All N players must agree to playAgain (players.every check)"
  - "shopDone guard uses getPlayerSlot to verify caller is in room"
  - "requestTerrain compat block reads room.players[] not room.host/room.player"
  - "handleSettlementFailure reads p1/p2 wallet from players[] with legacy fallback"

patterns-established:
  - "Pattern: players[0] = host (room creator), players[1..N-1] = joiners"
  - "Pattern: getPlayerSlot(room, id) for all per-player slot lookups in future handlers"
  - "Pattern: playerIds = room.players.map(p => p.socketId) for all N-player loops"

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 16 Plan 01: Room Schema Migration Summary

**Binary room.host/room.player replaced with room.players[] array and room.maxPlayers field, enabling 3-4 player rooms alongside full backward compatibility for 2-player clients**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26T13:22:49Z
- **Completed:** 2026-02-26T13:28:17Z
- **Tasks:** 2 (committed atomically as one change)
- **Files modified:** 1

## Accomplishments
- Room schema migrated: createRoom/joinQueue produce `{ players:[], maxPlayers:N, active:false }` instead of `{ host:{}, active:false }`
- Join guard now supports N-player: `players.length >= maxPlayers` replaces binary `room.active === true` check
- All non-fire, non-movement, non-reconnect handlers updated: ready, shopDone, shopPhase, getOpenRooms, persistRoom, playAgainRequest, resetForPlayAgain, endShopPhase, requestTerrain, escrowDepositConfirm, deposit timeout
- getPlayerSlot helper defined and called in 3 locations (ready, shopDone, playAgainRequest)
- 2-player backward compatibility preserved via startPick shim, persistRoom DB mapping, and all existing behavior maintained

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Room schema migration + ready/shop/getOpenRooms/persistRoom/playAgain** - `a368b7f` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified
- `server/socket-io/main.js` - Full room schema migration from binary to players[] array

## Decisions Made
- `getPlayerSlot(room, socketId)` helper defined at module level — available to all handlers including fire handler (Plan 16-03)
- `maxPlayers` defaults to 2 when client omits `player.maxPlayers` — UI doesn't expose it yet, schema supports it
- Atomic race guard: push joinerSlot before async balance check, `room.players.pop()` on any failure — preserves Node.js single-thread atomicity guarantee
- `room.active = true` only when `room.players.length === room.maxPlayers` — prevents blocking on first join for N > 2
- persistRoom writes `players[0]` as DB `host` and `players[1]` as DB `player` — Match model unchanged, DB backward compat preserved
- startPick emits both legacy `{ host, player }` fields AND new `players[]` array — clients that read `host`/`player` still work
- `handleSettlementFailure` updated to read p1/p2 socketId from `players[]` with fallback to legacy `host`/`player` fields in snapshot
- shopDone handler adds `getPlayerSlot(room, client.id)` guard to reject calls from sockets not in the room
- requestTerrain compat block now reads `room.players.map(p => p.socketId)` — replaces pre-Phase 16 `room.host`/`room.player` reads
- fire handler tank build, movement handlers (stepLeft/stepRight/positionUpdate), reconnect handler, disconnect handler, and startTurnTimer forfeit path intentionally deferred to Plans 16-02 and 16-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added shopDone guard using getPlayerSlot**
- **Found during:** Task 2 (shopDone migration)
- **Issue:** Plan specified 3 getPlayerSlot call sites but only ready + playAgainRequest were natural uses. shopDone lacked a guard verifying the caller is actually in the room.
- **Fix:** Added `if (!getPlayerSlot(room, client.id)) return` guard at top of shopDone handler — prevents a socket from outside the room from marking themselves as done.
- **Files modified:** server/socket-io/main.js
- **Verification:** getPlayerSlot now called in 3 locations (ready, shopDone, playAgainRequest)
- **Committed in:** a368b7f (main task commit)

**2. [Rule 1 - Bug] Updated handleSettlementFailure to support both players[] and legacy snapshots**
- **Found during:** Task 1 (startTurnTimer settlement snapshot migration)
- **Issue:** handleSettlementFailure receives a room snapshot. After migrating the snapshot to use `players[]`, the function still read `room.host.socketId`/`room.player.socketId` for wallet lookups.
- **Fix:** Updated to read `p1socketId = room?.players?.[0]?.socketId || room?.host?.socketId` and same for p2 — supports both new and any legacy snapshots still in-flight.
- **Files modified:** server/socket-io/main.js
- **Verification:** Fallback chain means old and new snapshot shapes both work
- **Committed in:** a368b7f (main task commit)

**3. [Rule 2 - Missing Critical] Updated escrowDepositConfirm to use players[] for deposit tracking**
- **Found during:** Task 1 (joinRoom migration)
- **Issue:** escrowDepositConfirm read `room.host?.socketId` and `room.player?.socketId` for deposit tracking — not in the plan's explicit list but directly depended on the new schema.
- **Fix:** Updated `isHost` detection to use `room.players[0]?.socketId` and `allDeposited` check to use `room.players.every(p => ws.deposits?.[p.socketId])`
- **Files modified:** server/socket-io/main.js
- **Verification:** Both checks now N-player safe
- **Committed in:** a368b7f (main task commit)

**4. [Rule 2 - Missing Critical] Updated shopDone to use N-player all-done check**
- **Found during:** Task 2 (shopDone review)
- **Issue:** shopDone handler used binary `hostId && playerId && ready[hostId] && ready[playerId]` check not in plan's explicit migration list.
- **Fix:** Replaced with `room.players.length === room.maxPlayers && room.players.every(p => ready[p.socketId])`.
- **Files modified:** server/socket-io/main.js
- **Committed in:** a368b7f (main task commit)

---

**Total deviations:** 4 auto-fixed (3 missing critical, 1 bug)
**Impact on plan:** All fixes necessary for correctness and N-player coverage. No scope creep — all changes within main.js and within the room schema migration scope.

## Issues Encountered
None — all changes were straightforward migrations. The Node.js single-thread guarantee means the push-before-async race guard pattern works correctly without additional locks.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 16-02 (N-player terrain/spawn) can proceed: `room.players[]` exists, `room.maxPlayers` is set, requestTerrain compat block updated
- Remaining `room.host`/`room.player` references are in: fire handler (~lines 1998-2176), positionUpdate/stepLeft/stepRight (~lines 2613-2692), disconnect/reconnect handlers (~lines 639-976), startTurnTimer forfeit path (~lines 361+) — all deferred to 16-03
- The `generateTankPositions()` in physics.js still returns `{host, player}` shape — Plan 16-02 will rewrite it to return array; requestTerrain already handles this via `players[0].pos = tankPositions.host`

---
*Phase: 16-room-schema-battle-engine*
*Completed: 2026-02-26*
