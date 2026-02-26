---
phase: 17-server-systems
plan: 01
subsystem: server-multiplayer
tags: [socket-io, n-player, disconnect, reconnect, wager, shop, debug]

requires:
  - phase: 16-room-schema-battle-engine
    provides: room.players[] array, rejoinRoom unified remap, all per-player map migrations

provides:
  - Wager guard blocking 3-4 player rooms from escrow-dependent modes
  - reconnectExpired broadcasts to all remaining players (N-player)
  - pendingReconnects with playerIndex field for correct position restoration
  - shopReady remap on reconnect to prevent orphaned keys
  - N-player between-round debug log for all player gold balances

affects:
  - Phase 18 (client updates reading players[] — disconnect/reconnect client side)
  - Phase 19 (N-player escrow — wager guard will need removal when escrow supports 3-4 players)

tech-stack:
  added: []
  patterns:
    - "room.players.filter(p => p.socketId !== client.id).forEach() for N-player broadcast"
    - "playerIds.map((pid, i) => ...).join() for N-player debug summaries"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "17-01: wager guard placed after matchMode validation, before roomId generation — maxPlayers declaration moved up to avoid duplicate"
  - "17-01: reconnectExpired uses currentRoom (re-read inside setTimeout) not opponentId captured at disconnect time"
  - "17-01: pendingReconnects keeps isHost for backward compat AND adds playerIndex for N-player correctness"
  - "17-01: shopReady remap inserted at the end of the rejoinRoom per-player remap block (after consecutiveTimeouts, before ms.players[])"

patterns-established:
  - "All N-player broadcasts use room.players.filter(p => p.socketId !== client.id).forEach() pattern"
  - "All N-player debug logs use .map((pid, i) => `pN=value`).join(', ') pattern"

duration: 2min
completed: 2026-02-26
---

# Plan 17-01: N-Player Server Gap Fixes Summary

**5 surgical fixes to main.js closing the final 2-player assumptions in wager, disconnect, reconnect, shop, and debug logging systems.**

## Performance
- Start: 2026-02-26T14:45:33Z
- End: 2026-02-26T14:47:33Z
- Duration: ~2 minutes
- Tasks: 2/2
- Files modified: 1 (server/socket-io/main.js)

## Accomplishments
- Wager guard: 3-4 player rooms with wagerAmount > 0 now emit `createRoomError` with clear message
- reconnectExpired: Now broadcasts to ALL remaining players via room.players.filter, not just a single opponentId
- pendingReconnects: Now stores `playerIndex` (findIndex in room.players[]) alongside `isHost` for N-player position restore
- shopReady remap: rejoinRoom now remaps shopReady[roomId][oldSocketId] to new socketId to prevent orphaned keys during shop phase reconnect
- Debug log: Between-round gold log now prints p1=..., p2=..., p3=..., p4=... for any number of players

## Task Commits
1. Task 1 (4 fixes: wager guard, reconnectExpired, playerIndex, shopReady) - 0aeadcf
2. Task 2 (between-round debug log N-player) - 254be4f

## Files Created/Modified
- `server/socket-io/main.js` — 21+2 lines changed across 5 targeted edits

## Decisions Made
- Moved `const maxPlayers` declaration to before the wager guard to avoid a duplicate `const` — the original declaration at line 1307 was removed, only one declaration remains
- `reconnectExpired` fix uses `currentRoom` (re-read inside the setTimeout) rather than `opponentId` captured at disconnect time — this is correct because room state can change during the 30s window
- `isHost` kept in `pendingReconnects` for backward compatibility; `playerIndex` added alongside it
- shopReady remap inserted after `consecutiveTimeouts` remap and before `ms.players[]` remap — maintains logical grouping with other per-player map migrations

## Deviations from Plan
None — plan executed exactly as written. All 5 fixes applied at the specified locations with the specified patterns.

## Issues Encountered
None. All edits were clean surgical replacements. No surrounding code touched.

## Next Phase Readiness
- Phase 17 Plan 02 (client updates): Server now correctly handles N-player for all identified gaps. Client can safely read players[] canonical field without server-side 2-player assumptions causing incorrect behavior.
- Phase 19 (N-player escrow): The wager guard at `wagerAmount > 0 && maxPlayers > 2` will need removal or modification when escrow is upgraded to support 3-4 players. This is noted in key-decisions and should be flagged in Phase 19 research.
