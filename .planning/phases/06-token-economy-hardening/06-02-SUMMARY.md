---
phase: 06-token-economy-hardening
plan: 02
subsystem: database
tags: [mongodb, mongoose, shot-token, replay-protection, deduplication, persistence]

# Dependency graph
requires:
  - phase: 06-01
    provides: verifiedBurnTxs schema field in ServerState; claimedMatchIds schema field in User.stats; persistBurnTx() export; throwing loadServerState()
provides:
  - verifiedBurnTxs Set loaded from MongoDB on startup (TE-01 complete)
  - persistBurnTx() called on each new verification — burn tx replay protection survives restart
  - claimedMatchIds Set restored from user.stats on player authenticate (TE-02 complete)
  - claimedMatchIds Array written to user.stats on each saveMilestoneState call
affects:
  - 07-infrastructure-monitoring (full dedup persistence in place before monitoring phase)
  - 08-verification-re-audit (TE-01 and TE-02 findings are now fully remediated)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget persist after in-memory write: persistBurnTx() called after verifiedBurnTxs.add() — same pattern as persistEmissionCount()"
    - "Set hydration from DB array: new Set(arrayFromMongo) on load; [...set] spread on save"
    - "Conditional restore: only overwrite in-memory default if DB array has entries (length > 0)"

key-files:
  created: []
  modified:
    - server/services/shot-token.js

key-decisions:
  - "persistBurnTx() is fire-and-forget (not awaited) — in-memory Set is the primary replay guard; MongoDB is the durability layer"
  - "claimedMatchIds restore uses length > 0 guard — consistent with other field restore guards in loadMilestoneState()"
  - "saveMilestoneState() spreads Set to Array with [...state.claimedMatchIds] — MongoDB cannot store Set objects"
  - "Edge-case guard (if (!state.claimedMatchIds) state.claimedMatchIds = new Set()) at line 337 retained — needed when getPlayerShotState creates fresh state before loadMilestoneState runs"

patterns-established:
  - "Round-trip dedup Set pattern: Set in memory → Array in MongoDB → new Set(array) on restore"
  - "Startup hydration pattern: loadServerState() return shape extended fields are hydrated into module-level variables in initShotState()"

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 6 Plan 02: Token Economy Set Persistence Summary

**verifiedBurnTxs and claimedMatchIds Sets wired for full round-trip MongoDB persistence — burn tx replay protection and match reward deduplication both survive server restarts**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T11:12:11Z
- **Completed:** 2026-02-23T11:13:56Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `initShotState()` now restores `verifiedBurnTxs` Set from `loadServerState()` return value — all previously verified burn tx signatures survive restart (TE-01 complete)
- `verifyBurnTransaction()` calls `persistBurnTx(txSignature)` fire-and-forget after each in-memory add — new burn txs are durably persisted to MongoDB immediately
- `loadMilestoneState()` restores `claimedMatchIds` Set from `user.stats.claimedMatchIds` — player's claimed match history survives restart + reconnect (TE-02 complete)
- `saveMilestoneState()` writes `[...state.claimedMatchIds]` to `stats.claimedMatchIds` in the `$set` update — match dedup state persisted after every match

## Task Commits

Both tasks modify the same file and were committed together:

1. **Tasks 1 & 2: Wire verifiedBurnTxs and claimedMatchIds Set persistence** - `c9b8408` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `server/services/shot-token.js` - Added persistBurnTx import; verifiedBurnTxs hydration in initShotState(); persistBurnTx call in verifyBurnTransaction(); claimedMatchIds restore in loadMilestoneState(); claimedMatchIds save in saveMilestoneState()

## Decisions Made
- `persistBurnTx()` is not awaited — fire-and-forget consistent with `persistEmissionCount()`. The in-memory Set prevents replay within the session; MongoDB ensures it survives restart. A persistence failure logs an error but does not crash the server.
- `claimedMatchIds` restore uses `length > 0` guard — consistent with the other conditional field restores in `loadMilestoneState()` (e.g., `if (s.prestigeTier > 0)`). An empty array from DB means no claimed matches, leaving the fresh empty Set in place.
- The edge-case guard `if (!state.claimedMatchIds) state.claimedMatchIds = new Set()` at line 337 was retained unchanged — it protects the path where `recordMatchPlayed()` runs before `loadMilestoneState()` completes.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TE-01 and TE-02 are fully remediated: both deduplication Sets now survive server restarts
- Phase 6 (Token Economy Hardening) is complete — both plans done
- Phase 7 (Infrastructure & Monitoring) can proceed; fail-hard startup and full state persistence are now in place
- No blockers for Phase 7

---
*Phase: 06-token-economy-hardening*
*Completed: 2026-02-23*
