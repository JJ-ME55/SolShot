---
phase: 03-litepaper-v2.1-compliance
plan: 04
subsystem: game-server
tags: [socket-io, match-state, shot-milestones, movement, timeout-forfeit, lp-07, lp-08]

# Dependency graph
requires:
  - phase: 03-03
    provides: recordMatchPlayed with enriched context API, PRESTIGE_WEAPON_IDS, loadMilestoneState, saveMilestoneState
  - phase: 03-02
    provides: matchmakingQueues, wagerStates per room

provides:
  - Server-side 4-step movement limit enforcement (LP-07)
  - 3-consecutive-timeout forfeit rule with wager settlement (LP-08)
  - Enriched recordMatchPlayed callsite with isWagered/isWinner/maxRoundDamage/weaponsUsed
  - loadMilestoneState wired into authenticate handler
  - Per-round damage tracking via result.damage iteration (roundDamage/maxRoundDamage)
  - weaponsUsed Set tracking per player per match

affects: [lp-07-movement, lp-08-forfeit, 500-damage-round-milestone, no-prestige-win-milestone, all-v2.1-milestones]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-init pattern: if (!ms.field) ms.field = {} before using"
    - "Module-level function room teardown: removeRoom + io.socketsLeave instead of cleanupRoom (closure issue)"
    - "result.damage map iteration: for (const [recipientId, dmg] of Object.entries(result.damage)) to accumulate shooter damage"
    - "Set for weaponsUsed dedup: new Set(), add(weaponId), Array.from() at callsite"
    - "maxRoundDamage finalized at both match-over AND round-end paths for BO3/BO5 correctness"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "Room teardown in startTurnTimer (module-level) uses removeRoom + io.socketsLeave directly — cleanupRoom not in scope (defined inside connection closure)"
  - "maxRoundDamage finalized in BOTH match-over path (direct) and round-end path (BO3/BO5) to cover single-round matches"
  - "Forfeit emits standard matchEnd event with forfeitReason field — no new forfeitMatchEnd event type"
  - "consecutiveTimeouts lazy-initialized on first timeout (not in createMatchState) — same lazy pattern as moveCounts"

patterns-established:
  - "LP-07: moveCounts[clientId] checked >= 4 in stepLeft/stepRight; reset to 0 on turn-advance (fire and timeout) and to {} on round-end"
  - "LP-08: consecutiveTimeouts[currentTurnId] incremented on timeout, checked >= 3, reset to 0 on fire"
  - "LP-04: roundDamage accumulates during fire; maxRoundDamage updated at round-end and match-over; passed as maxRoundDamage to recordMatchPlayed"

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 3 Plan 04: Movement Enforcement, Timeout Forfeit, SHOT Milestone Enrichment Summary

**Server-side 4-step movement cap (LP-07), 3-consecutive-timeout forfeit (LP-08), and enriched SHOT milestone recordMatchPlayed callsite with per-round damage tracking and loadMilestoneState wired into authenticate**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T08:14:46Z
- **Completed:** 2026-02-20T08:22:13Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- LP-07: stepLeft/stepRight now silently drop moves when moveCounts[client.id] >= 4; resets on turn-advance (fire + timeout) and round-end
- LP-08: startTurnTimer tracks consecutiveTimeouts per player; at >= 3 triggers forfeit: matchEnd event + wager settlement + room teardown
- Fire handler resets consecutiveTimeouts[this.id] = 0 on each successful fire (no false forfeits for active players)
- Forfeit path uses wallet addresses from wagerStates (not socketIds) for settleMatch
- Forfeit path performs room teardown via removeRoom/io.socketsLeave (cleanupRoom not in scope from module-level function)
- recordMatchPlayed enriched: isWagered, isWinner, maxRoundDamage, weaponsUsed in both normal and forfeit settlement paths
- Per-round damage tracked via result.damage iteration; maxRoundDamage finalized at match-over (single-round) and round-end (BO3/BO5)
- weaponsUsed tracked as Set per player, converted to Array at recordMatchPlayed callsite
- loadMilestoneState called in authenticate handler (async, try/catch for graceful degradation)
- PRESTIGE_WEAPON_IDS, loadMilestoneState, saveMilestoneState added to shot-token.js import

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side 4-step movement enforcement (LP-07)** - `77ed538` (feat)
2. **Task 2: 3-consecutive timeout forfeit rule (LP-08)** - `310f04e` (feat)
3. **Task 3: Update recordMatchPlayed callsite with enriched context** - `bff8af1` (feat)

## Files Created/Modified

- `server/socket-io/main.js` — moveCounts enforcement in stepLeft/stepRight; consecutiveTimeouts in startTurnTimer; enriched recordMatchPlayed; loadMilestoneState in authenticate; roundDamage/maxRoundDamage tracking; weaponsUsed tracking

## Decisions Made

- **cleanupRoom not callable from startTurnTimer:** `cleanupRoom` is defined inside the `io.on("connection", ...)` closure so it's not accessible from the module-level `startTurnTimer` function. Performed teardown directly using `removeRoom` + `io.sockets.in(roomId).emit('opponentLeft')` + `io.socketsLeave` — all module-level helpers. Wager already settled before teardown.
- **maxRoundDamage finalized in two paths:** Single-round matches go straight to the match-over path without hitting the round-end path. Added maxRoundDamage finalization in BOTH paths to cover BO1 (direct) and BO3/BO5 (via round-end + match-over).
- **No forfeitMatchEnd event:** Forfeit emits standard `matchEnd` with `forfeitReason` field for client compatibility. No new event type needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cleanupRoom not in scope from startTurnTimer**
- **Found during:** Task 2 (forfeit room teardown)
- **Issue:** The plan specified using `cleanupRoom(fakeClient, io, 'forfeit_timeout')` but `cleanupRoom` is defined INSIDE the `io.on("connection", ...)` closure, not at module level. `startTurnTimer` is a module-level function and cannot access closure-scoped `cleanupRoom`.
- **Fix:** Used equivalent module-level teardown: `io.sockets.in(roomId).emit('opponentLeft', {})` + `await removeRoom(roomId)` + `broadcastRooms(io)` + `io.socketsLeave(roomId)`. This covers all the same teardown steps without needing the wager-forfeit path (already handled above).
- **Files modified:** server/socket-io/main.js
- **Verification:** All teardown steps covered: room removed, sockets evicted, lobby broadcast updated

**2. [Rule 2 - Missing Critical] maxRoundDamage finalization for single-round matches**
- **Found during:** Task 3 (maxRoundDamage tracking)
- **Issue:** The plan only specified updating maxRoundDamage at round-end (before resetForNextRound). But single-round (BO1) matches go directly to the match-over path without triggering the round-end path. This would leave maxRoundDamage at 0 for all BO1 matches, making the 500_damage_round milestone unachievable in the most common game mode.
- **Fix:** Added maxRoundDamage finalization in the match-over path (before the recordMatchPlayed calls) in addition to the round-end path.
- **Files modified:** server/socket-io/main.js
- **Verification:** Both BO1 (match-over path) and BO3/BO5 (round-end path) now correctly preserve maxRoundDamage

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes required for correct operation. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 3 is now complete (03-01 through 03-05 all done). All Litepaper v2.1 compliance requirements are implemented server-side. Ready for phase transition review.

Key items for next phase:
- Movement enforcement closes LP-07 client exploit
- Forfeit rule closes LP-08 idle-player abuse vector
- SHOT milestone system now has complete data flow for all 8 v2.1 milestones
- loadMilestoneState ensures milestone progress survives server restarts

---
*Phase: 03-litepaper-v2.1-compliance*
*Completed: 2026-02-20*
