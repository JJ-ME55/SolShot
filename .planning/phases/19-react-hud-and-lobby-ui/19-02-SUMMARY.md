---
phase: 19-react-hud-and-lobby-ui
plan: 02
subsystem: ui
tags: [react, socket.io, lobby, multiplayer, waiting-room]

# Dependency graph
requires:
  - phase: 16-room-schema-migration
    provides: room.players[] array and maxPlayers field on room
  - phase: 19-react-hud-and-lobby-ui/19-01
    provides: Phase 19 context and React HUD foundation
provides:
  - startPick guarded behind room-full check (players.length === maxPlayers)
  - roomUpdate socket event for waiting room state broadcast
  - LobbyScreen player count selector (2P/3P/4P)
  - N-slot waiting room overlay with filled/empty slot indicators
  - Color duplicate prevention in waiting room
  - Room list player count badges (currentPlayers/maxPlayers)
affects:
  - future N-player lobby enhancements
  - escrow N-player support (when added, waiting room already UI-ready)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "roomUpdate event pattern: server broadcasts partial room state during pre-match fill"
    - "Waiting room aware disconnect: cleanupRoom removes player from non-active room instead of destroying it"
    - "claimedColors derivation: filter waitingRoomPlayers by socketId !== self, map to phaserHex"

key-files:
  created: []
  modified:
    - server/socket-io/main.js
    - client/src/screens/LobbyScreen.js

key-decisions:
  - "19-02: startPick guarded at joinRoom end — fires only when room.players.length === room.maxPlayers"
  - "19-02: createRoom emits roomUpdate to creator immediately (before any joiner)"
  - "19-02: cleanupRoom2 pattern — waiting room disconnect removes player + emits roomUpdate; skips removeRoom when room.active=false and players.length > 1"
  - "19-02: host promotion on waiting room disconnect — players[0].isHost = true if no current host after removal"
  - "19-02: claimedColors compared by phaserHex (integer) not hex string — matches TANK_COLORS.phaserHex field"

patterns-established:
  - "Pattern: roomUpdate emitted from server on createRoom, partial joinRoom, and waiting-room disconnect"
  - "Pattern: waitingRoomPlayers[] state in LobbyScreen reset on startPick, opponentLeft, and cancelRoom"

# Metrics
duration: 25min
completed: 2026-02-27
---

# Phase 19 Plan 02: N-Player Waiting Room and Lobby Player Count Selector Summary

**Server room-full guard on startPick + roomUpdate waiting-room event + LobbyScreen 2/3/4-player selector, N-slot overlay with color de-dup, and room list player count badges**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-27T00:00:00Z
- **Completed:** 2026-02-27T00:25:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Server: startPick no longer fires unconditionally — guarded behind `room.players.length === room.maxPlayers`; partial fills emit `roomUpdate` instead
- Server: createRoom emits initial `roomUpdate` to creator so they see themselves in the waiting room immediately
- Server: cleanupRoom handles waiting-room disconnects by removing only the leaving player and emitting `roomUpdate` to remaining players (with host promotion), avoiding premature room destruction
- Client: PLAYERS section with 2P/3P/4P buttons added to left panel; createRoom sends `maxPlayers: numPlayers`
- Client: N-slot waiting room overlay replaces simple "WAITING FOR OPPONENT" message — shows filled player slots (color dot + name + HOST/YOU) and empty slots (dashed border + "-- WAITING --")
- Client: Color picker greys out (opacity 0.25, not-allowed cursor) colors claimed by other waiting room players
- Client: Room list cards show `currentPlayers/maxPlayers` badge (e.g. 1/3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Server startPick guard and roomUpdate event** - `d93919c` (feat)
2. **Task 2: LobbyScreen player count selector, N-slot waiting room, color de-dup, room list badges** - `7121acb` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/socket-io/main.js` - Three surgical edits: startPick conditional, createRoom roomUpdate emit, cleanupRoom2 waiting-room path
- `client/src/screens/LobbyScreen.js` - numPlayers state, roomUpdate listener, PLAYERS selector section, N-slot waiting overlay, claimedColors de-dup, room list badge

## Decisions Made
- startPick guard is at the END of joinRoom handler (after escrow logic), checking `room.players.length === room.maxPlayers` — same position where unconditional emit was
- `cleanupRoom2` variable name used to avoid shadowing `cleanupRoom` function name in the same scope
- Host promotion in cleanupRoom2: if no player has `isHost: true` after removing the leaver, `players[0].isHost = true` — simple deterministic promotion
- `claimedColors` compared against `c.phaserHex` (integer) not `c.hex` (string) — matches how color is stored in `TANK_COLORS`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 3/4-player waiting rooms are now fully functional: creator sets player count, joiners see slots fill, game starts when full
- Color duplicate prevention active during waiting room phase
- Room list shows player count for all open lobbies
- Ready for Phase 19 Plan 03 (React BattleHUD N-player components: HP bars, placement overlay, Leave Match button)

---
*Phase: 19-react-hud-and-lobby-ui*
*Completed: 2026-02-27*
