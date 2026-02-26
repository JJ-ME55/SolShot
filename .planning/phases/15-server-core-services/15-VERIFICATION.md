---
phase: 15-server-core-services
verified: 2026-02-26T12:28:01Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "A 4-player match state initializes with HP, scores, kills, and roundWins for all 4 socket IDs, currentPlayerIndex: 0, and turnsPerRound: 40 (N * 10)"
    status: partial
    reason: "createMatchState correctly defines turnsPerRound = maxPlayers * 10, but all 3 call sites in main.js pass only 2 arguments (roomId, roundType), so maxPlayers always defaults to 2 and turnsPerRound initializes to 20. The requestTerrain compat block overrides turnsPerRound to pIds.length * 10, but pIds is built from room.host and room.player only (2-player room schema). No code path initializes HP, scores, kills, or roundWins for 3 or 4 distinct socket IDs. The function is capable of N-player initialization but is never invoked that way. This is a documented Phase 16 dependency."
    artifacts:
      - path: "server/services/match.js"
        issue: "createMatchState(roomId, roundType, maxPlayers) is correct but maxPlayers param is never passed from any call site"
      - path: "server/socket-io/main.js"
        issue: "All 3 createMatchState calls use 2 args only. requestTerrain compat block builds pIds from room.host + room.player only. No room.players[] array exists until Phase 16."
    missing:
      - "Pass maxPlayers as third arg to createMatchState at all 3 call sites (Phase 16 will do this when it adds maxPlayers to room schema)"
      - "Extend requestTerrain compat block to read from room.players[] when available (Phase 16 responsibility)"
---

# Phase 15: Server Core Services Verification Report

**Phase Goal:** The server isolated match state functions correctly model N-player turn rotation, elimination-aware round detection, and placement-based scoring so that all downstream handlers build on a correct foundation.
**Verified:** 2026-02-26T12:28:01Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A 4-player match state initializes with HP, scores, kills, and roundWins for all 4 socket IDs, currentPlayerIndex: 0, and turnsPerRound: 40 (N * 10) | PARTIAL | createMatchState sets currentPlayerIndex: 0 and turnsPerRound = maxPlayers * 10 correctly in the function body. But all 3 call sites pass only 2 args, so maxPlayers defaults to 2 and turnsPerRound starts at 20. The requestTerrain compat block overrides turnsPerRound at runtime and initializes all per-player maps, but pIds is built from room.host and room.player only (2-player schema). No code path reaches 4 socket IDs. Documented Phase 16 dependency. |
| 2 | getNextTurn() cycles through all alive players in order -- eliminated players permanently skipped, 2-player mode produces identical output | VERIFIED | getNextTurn(matchState) uses players[] + alive{} map, loops forward skipping dead players, uses crypto.randomInt for first-turn random selection. No hostId/playerId params remain in any call site (grep confirms 0 matches for old signature patterns). |
| 3 | isRoundOver() returns false when 2 of 4 players remain alive, returns true only when 1 or fewer alive or turns exhausted | VERIFIED | isRoundOver checks turnCount >= turnsPerRound first, then Object.values(alive).filter(Boolean).length <= 1. HP fallback preserved for pre-Phase-16 compatibility. Logic is correct for any N. |
| 4 | isMatchOver() correctly identifies the leader using placement point totals (4th=0, 3rd=1, 2nd=2, 1st=3 per round) and resolves ties by total damage dealt | VERIFIED | isMatchOver(matchState) checks currentRound < maxRounds (no early exit), finds max placementPoints, handles ties via damageDealtTotal sort. PLACEMENT_POINTS = [3, 2, 1, 0] exported. Called as isMatchOver(ms) -- 0 old-style 3-arg calls confirmed by grep. |
| 5 | resetForNextRound() restores all N players to 250 HP and alive status, including players never hit | VERIFIED | Loops over matchState.players (falls back to Object.keys(matchState.hp)), sets hp[id] = 250 and alive[id] = true for each. Clears eliminationOrder and resets currentPlayerIndex = 0. |

**Score:** 4/5 truths verified (Truth 1 is partial -- function capability is correct, integration wiring cannot reach 4 players until Phase 16 provides room.players[])

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server/services/match.js | N-player match state machine, 10 exports, all 6 functions rewritten | VERIFIED | 331 lines. Exports: MATCH_STATES, transitionState, validateAction, createMatchState, resetForNextRound, PLACEMENT_POINTS, getNextTurn, isRoundOver, getRoundPlacement, isMatchOver. No getRoundWinner export (only in comments). |
| server/services/gold.js | initGold(playerIds[]), awardPlacementGold, PLACEMENT_GOLD [300,150,75,0] | VERIFIED | 134 lines. initGold accepts playerIds[] array. PLACEMENT_GOLD = [300, 150, 75, 0]. awardPlacementGold(goldState, rankedPlayerIds) awards tiered gold. All existing functions preserved. |
| server/socket-io/main.js | All old signatures replaced; getRoundPlacement, isMatchOver(ms), initGold([...]) wired | VERIFIED | 2746 lines. Imports getRoundPlacement, PLACEMENT_POINTS, awardPlacementGold. Zero occurrences of getRoundWinner, isMatchOver(ms,), initGold(hostId), getNextTurn(ms,) confirmed by grep returning 0. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| main.js | match.js | import getRoundPlacement, PLACEMENT_POINTS | WIRED | Line 8 import confirmed |
| main.js | gold.js | import awardPlacementGold | WIRED | Line 9 import confirmed |
| main.js | match.js | getRoundPlacement(ms) in round-end block | WIRED | Line ~2165, returns ranked[], ranked[0] used as roundWinner |
| main.js | match.js | isMatchOver(ms) -- no extra args | WIRED | Line ~2171, single-arg call confirmed, 0 old-style matches |
| main.js | gold.js | awardPlacementGold(gold, ranked) in round-end block | WIRED | Line ~2176, replaces old awardRoundWinBonus |
| main.js | gold.js | initGold([hostId, playerId]) -- array-wrapped | WIRED | Line ~1510 confirmed |
| main.js | match.js | getNextTurn(ms) -- no extra args, 3 call sites | WIRED | turnTimeout (~443), post-fire (~2117), requestTerrain (~2519) -- all single-arg |
| main.js | match.js | resetForNextRound(ms) in between-round block | WIRED | Line ~2433 confirmed |
| main.js | roundEnd emit | placementPoints: ms.placementPoints in payload | WIRED | Line 2439 confirmed |
| createMatchState | call sites | maxPlayers third arg | NOT WIRED | All 3 call sites: createMatchState(roomId, roundType) only. maxPlayers never passed; always defaults to 2. turnsPerRound overridden at requestTerrain as compat measure. |

---

### Requirements Coverage

| Requirement | Phase Assignment | Status | Blocking Issue |
|-------------|-----------------|--------|---------------|
| CORE-01 | Phase 16 | NOT THIS PHASE | -- |
| CORE-02 | Phase 16 | NOT THIS PHASE | -- |
| CORE-03 | Phase 15 | SATISFIED | getNextTurn rotates through alive players, skipping eliminated |
| CORE-04 | Phase 15 | SATISFIED | isRoundOver returns true when <=1 player alive |
| CORE-05 | Phase 15 | SATISFIED | isMatchOver uses placement scoring, no early exit |
| CORE-06 | Phase 15 | PARTIAL | Functions support N-player init; requestTerrain compat block initializes all maps but only for 2 players (room.host + room.player). Full 4-player init blocked by Phase 16 room schema. |
| CORE-07 | Phase 15 | SATISFIED | currentPlayerIndex tracks position in players[], mutated by getNextTurn |
| CORE-08 | Phase 15 | SATISFIED | 2-player backward compat confirmed: players=[A,B], both alive, alternating turns |
| SCORE-01 | Phase 15 | SATISFIED | Last-alive survivor wins round via isRoundOver + getRoundPlacement |
| SCORE-02 | Phase 15 | SATISFIED | PLACEMENT_POINTS = [3,2,1,0] awarded per round via getRoundPlacement |
| SCORE-03 | Phase 15 | SATISFIED | Match winner = highest cumulative placementPoints after maxRounds |
| SCORE-04 | Phase 15 | SATISFIED | Tiebreaker: damageDealtTotal sort in isMatchOver |
| SCORE-05 | Phase 15 | SATISFIED | resetForNextRound restores all players to 250 HP and alive=true |
| SCORE-06 | Phase 15 | SATISFIED (server-side) | placementPoints: ms.placementPoints in roundEnd emit payload. Client rendering is Phase 19. |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| server/socket-io/main.js (~line 2496) | room.host / room.player used to build pIds in compat block | Info | By design -- pre-Phase-16 bridge. Documented in SUMMARY decisions section. |
| server/socket-io/main.js (lines 85, 1229, 1357) | createMatchState(roomId, roundType) -- no maxPlayers arg | Warning | turnsPerRound starts at 20 (not 40 for 4-player); overridden at requestTerrain. Harmless for current 2-player games. 4-player requires Phase 16. |

No placeholder content, empty handlers, or TODO/FIXME in any of the rewritten functions.

---

### Human Verification Required

None required. All critical behavior is verifiable from code structure and grep patterns.

---

### Gaps Summary

One partial gap affects Truth 1. The root cause: createMatchState supports N-player initialization via the maxPlayers parameter, but all 3 call sites in main.js pass only 2 arguments, so maxPlayers always defaults to 2. The requestTerrain compat block overrides turnsPerRound at runtime and initializes per-player maps, but reads only from room.host and room.player (2-player room schema). There is no code path that supplies 3 or 4 socket IDs to the initialization logic.

This gap is expected and documented. The PLAN frontmatter states: players[] is intentionally empty at createMatchState; populated at requestTerrain (Plan 15-02). Phase 16 will replace this block when room schema migrates to players[]. The functions are structurally correct for N players when provided the correct input. The room schema that supplies N socket IDs is Phase 16 scope (CORE-01, CORE-02).

For 2-player games (the current and only operational scope), all 5 truths are met. The partial status on Truth 1 reflects that the ROADMAP success criterion is written for 4-player -- which requires Phase 16 to become testable end-to-end.

The gap does not block Phase 16 work. Phase 16 must: (1) add maxPlayers to room schema, (2) pass maxPlayers as the third arg to createMatchState at all 3 call sites, and (3) replace the requestTerrain compat block with one that reads from room.players[].

---

*Verified: 2026-02-26T12:28:01Z*
*Verifier: Claude (gsd-verifier)*
