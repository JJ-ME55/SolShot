---
phase: 19-react-hud-and-lobby-ui
plan: 01
subsystem: ui
tags: [react, phaser, game-hud, n-player, hp-bar, elimination]

# Dependency graph
requires:
  - phase: 18-client-phaser-and-gamebridge
    provides: GameBridge players[] canonical state, myPlayerIndex, currentPlayerIndex, isEliminated, eliminatedPlacement; notifyEliminated({placement}) hook
affects: [19-02, future-phases]

provides:
  - N-player HP bar strip in BattleHUD using players.map() — replaces tank1/tank2 shims
  - PlayerHPBar component with color dot, YOU label, damage trail, turn arrow, OUT+placement eliminated state
  - Elimination overlay in BattleHUD: placement ordinal + SPECTATING + LEAVE MATCH button
  - BattleScreen handleLeaveMatch with leftMatchRef race guard
  - WinScreen/LoseScreen FINAL STANDINGS leaderboard (survivorOrder, 3+ players)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PlayerHPBar wraps React.memo for performance in N-player strip (updated per frame via GameBridge)
    - leftMatchRef pattern: useRef(false) guards socket event handler to prevent double-navigate race
    - survivorOrder.length > 2 guard: leaderboard only for 3+ players, preserving 2-player UX

key-files:
  created:
    - client/src/screens/battle/PlayerHPBar.js
  modified:
    - client/src/bridge/GameBridge.js
    - client/src/screens/battle/BattleHUD.js
    - client/src/screens/BattleScreen.js
    - client/src/screens/WinScreen.js
    - client/src/screens/LoseScreen.js

key-decisions:
  - "19-01: PlayerHPBar is standalone, does not import ScoreBoard — shares visual pattern but independent component"
  - "19-01: players[myPlayerIndex]?.angle (not isPlayerTurn ternary) for AngleControl/PowerControl reads"
  - "19-01: survivorOrder.length > 2 guard — 2-player win/lose screens unchanged (no leaderboard added)"
  - "19-01: leftMatchRef is useRef not useState — avoids re-render on mutation, correct for race guard pattern"

patterns-established:
  - "N-player HP strip: players.map() with PlayerHPBar key={p.socketId || i} — consistent key for stable re-renders"
  - "Elimination overlay: absolute centered, pointerEvents auto (overrides parent none), zIndex 20"

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 19 Plan 01: N-Player BattleHUD + Win/Lose Leaderboards Summary

**N-player HP strip with PlayerHPBar (color dot, YOU label, damage trail, turn arrow, OUT+placement), elimination overlay with LEAVE MATCH, and FINAL STANDINGS leaderboard on Win/Lose screens for 3+ player matches**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T17:35:08Z
- **Completed:** 2026-02-27T17:39:12Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments
- GameBridge.setPlayerEliminated now stores `placement` on `players[index]` — enables HP bar to show OUT 3rd etc. for all eliminated players, not just local
- New PlayerHPBar component replaces ScoreBoard for N-player strip: scales to 2/3/4 players, turn arrow, damage trail with red ghost, eliminated state with ordinal placement, React.memo for performance
- BattleHUD fully migrated to players.map() — zero tank1/tank2 references, ScoreBoard import removed, turn label shows specific player name in 3-4p matches, elimination overlay wired
- BattleScreen handleLeaveMatch with leftMatchRef race guard prevents double-navigate when Leave Match and matchEnd socket event fire simultaneously
- WinScreen/LoseScreen FINAL STANDINGS leaderboard from survivorOrder, rendered only for 3+ players with color-coded rows

## Task Commits

Each task was committed atomically:

1. **Task 1: GameBridge placement fix + PlayerHPBar component + BattleHUD N-player strip** - `cf231f0` (feat)
2. **Task 2: BattleScreen Leave Match wiring + Win/Lose placement leaderboards** - `2ad4321` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `client/src/screens/battle/PlayerHPBar.js` - New N-player HP bar component (created)
- `client/src/bridge/GameBridge.js` - One-line fix: stores placement on players[index] in setPlayerEliminated
- `client/src/screens/battle/BattleHUD.js` - Full refactor to N-player strip; ScoreBoard removed; elimination overlay added
- `client/src/screens/BattleScreen.js` - handleLeaveMatch + leftMatchRef race guard + onLeaveMatch prop
- `client/src/screens/WinScreen.js` - FINAL STANDINGS leaderboard from survivorOrder
- `client/src/screens/LoseScreen.js` - FINAL STANDINGS leaderboard (red tones for loss)

## Decisions Made
- PlayerHPBar is standalone — does not import ScoreBoard. Shares visual design language but independent component lifecycle for clean elimination of 2-player shims
- AngleControl/PowerControl now read `players[myPlayerIndex]?.angle` directly — no more isPlayerTurn ternary between tank1/tank2
- FINAL STANDINGS guarded by `survivorOrder.length > 2` — 2-player matches keep existing win/lose card UX unchanged
- `leftMatchRef` is `useRef(false)` not `useState` — avoids triggering re-render on mutation, correct for race-guard pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- React HUD is fully N-player: HP strip, turn indicator, elimination overlay, Leave Match, Win/Lose leaderboards
- Phase 19 Plan 02 can proceed (lobby UI, match mode tabs, player count selector)
- tank1/tank2 shims remain in GameBridge.state and reset() for backward compat — can be cleaned up in a future phase once all consumers migrated

---
*Phase: 19-react-hud-and-lobby-ui*
*Completed: 2026-02-27*
