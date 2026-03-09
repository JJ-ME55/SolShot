---
phase: 27-practice-stats
verified: 2026-03-01T00:00:00Z
status: gaps_found
score: 2/3 must-haves verified
gaps:
  - truth: Stats are keyed by solshot_uid in localStorage
    status: failed
    reason: Stats stored under flat key solshot_stats instead of being keyed by solshot_uid
    artifacts:
      - path: client/src/utils/practiceStats.js
        issue: STORAGE_KEY is solshot_stats -- a single global key not per-uid
    missing:
      - Storage key should incorporate solshot_uid e.g. solshot_stats_{uid}
      - getPracticeStats and updatePracticeStats need to read solshot_uid from localStorage and use it as part of the storage key
---

# Phase 27: Practice Stats Verification Report

**Phase Goal:** Every match outcome is recorded locally so players accumulate a meaningful record from day one.
**Verified:** 2026-03-01
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After a practice match, matches/wins/losses/K-D data are updated in localStorage | VERIFIED | updatePracticeStats() called in both WinScreen.js (line 270) and LoseScreen.js (line 258) with outcome, kills, deaths, damageDealt. All fields increment correctly. K/D derivable from kills/deaths (not stored as ratio, which is correct for accumulation). |
| 2 | Stats are keyed by solshot_uid in localStorage | FAILED | Storage key is flat string solshot_stats (practiceStats.js line 1). No reference to solshot_uid anywhere in the utility. Two users on same browser would share stats. STATS-01 explicitly requires keying by solshot_uid. |
| 3 | Stats persist across sessions and accumulate correctly | VERIFIED | localStorage.setItem persists data. Tests confirm accumulation across 3 sequential calls (test line 58-68). Corrupt JSON falls back to empty stats (test line 32-36). All 8 unit tests pass. |
| 4 | Stats are purely local (no wallet/server) | VERIFIED | No fetch/axios/socket/emit calls in practiceStats.js. No server-side files reference practiceStats. STATS-02 fully satisfied. |
| 5 | Data structure maps cleanly to future Barracks schema | VERIFIED | Fields: matchesPlayed, wins, losses, kills, deaths, damageDealt, lastMatchAt -- server-friendly names, flat shape, no client-specific keys. STATS-03 satisfied. |

**Score:** 4/5 truths verified (the failed truth maps to requirement STATS-01)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| client/src/utils/practiceStats.js | Stats utility with get/update functions | VERIFIED (41 lines, substantive, no stubs, exported, imported by 2 screens) | Two exported functions: getPracticeStats() and updatePracticeStats(). Clean implementation with error handling for corrupt JSON. No TODO/FIXME/placeholder patterns. |
| client/src/utils/__tests__/practiceStats.test.js | Unit tests | VERIFIED (83 lines, 8 tests, all passing) | Covers: empty state, stored state, corrupt JSON, win/loss increment, accumulation, persistence, defaults. |
| client/src/screens/WinScreen.js | Calls updatePracticeStats on win | VERIFIED (wired at line 270) | updatePracticeStats with outcome win, kills, deaths, damageDealt inside useEffect on mount. |
| client/src/screens/LoseScreen.js | Calls updatePracticeStats on loss | VERIFIED (wired at line 258) | updatePracticeStats with outcome loss, kills, deaths, damageDealt inside useEffect on mount. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| WinScreen.js | practiceStats.js | import + call in useEffect | WIRED | Import at line 8, call at line 270 with real data from screenData.scores. |
| LoseScreen.js | practiceStats.js | import + call in useEffect | WIRED | Import at line 8, call at line 258 with real data from screenData.scores. |
| practiceStats.js | localStorage | getItem/setItem | WIRED | Reads and writes under key solshot_stats. Tested and confirmed. |
| practiceStats.js | solshot_uid | Should read uid to key stats | NOT WIRED | No reference to solshot_uid in practiceStats.js. Stats stored under global key. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| STATS-01: Track matches, wins, losses, K/D keyed by solshot_uid | PARTIAL | Stats tracked correctly but NOT keyed by solshot_uid -- stored under flat key solshot_stats. |
| STATS-02: Stats not connected to any wallet or server | SATISFIED | No network calls, no wallet references. Purely localStorage. |
| STATS-03: Data structure designed for easy Barracks migration | SATISFIED | Clean field names, flat structure, no client artifacts mixed in. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| WinScreen.js | 259-261 | Duplicate tracking: solshot_matches_played (legacy) alongside solshot_stats.matchesPlayed | Warning | Two localStorage entries track same value. |
| LoseScreen.js | 247-249 | Same duplicate tracking as WinScreen | Warning | Same issue. |
| practiceStats.js | 1 | STORAGE_KEY not keyed by uid | Blocker | See gaps section. |

No TODO/FIXME/placeholder patterns found in any phase 27 files.

### Human Verification Required

### 1. Stats accumulate after multiple matches

**Test:** Play two practice matches (one win, one loss). Check DevTools localStorage for solshot_stats key.
**Expected:** matchesPlayed: 2, wins: 1, losses: 1, kills/deaths/damageDealt reflect actual gameplay.
**Why human:** Cannot verify screenData.scores values without running a real match.

### 2. Deaths calculation accuracy

**Test:** Play a best-of-3 match. Check if deaths = roundsPlayed - myRoundWins.
**Expected:** Deaths count matches rounds lost.
**Why human:** Formula roundsPlayed - myRoundWins is a proxy. Needs real match verification.

### Gaps Summary

One gap prevents full goal achievement:

**Stats are not keyed by solshot_uid.** The practiceStats.js utility uses a flat localStorage key solshot_stats rather than incorporating the player solshot_uid (generated by HandleModal in Phase 24). Requirement STATS-01 explicitly requires stats keyed by solshot_uid.

The fix: read solshot_uid from localStorage inside getPracticeStats() and updatePracticeStats(), then use a storage key like solshot_stats_{uid}. This ensures:

- Multiple users on the same browser get separate stat records
- Stats data is already associated with a specific uid for future Barracks migration
- The uid acts as the natural primary key when syncing to a server database

Secondary concern (warning-level): both WinScreen and LoseScreen maintain a legacy solshot_matches_played counter alongside the new solshot_stats.matchesPlayed. Should consolidate.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_
