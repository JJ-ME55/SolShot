---
phase: 06-token-economy-hardening
plan: 01
subsystem: database
tags: [mongodb, mongoose, schema, token-economy, shot-token, fail-hard, startup]

# Dependency graph
requires:
  - phase: 05-client-supply-chain-security
    provides: Phase 5 security hardening complete; clean codebase baseline
provides:
  - verifiedBurnTxs field in ServerState schema (TE-03 replay persistence)
  - claimedMatchIds field in User.stats schema (per-user match dedup persistence)
  - loadServerState() throws on DB failure (no silent fallback)
  - persistBurnTx() atomic $addToSet export
  - Fail-hard startup: process.exit(1) on MongoDB connection failure or initShotState() failure
affects:
  - 06-02 (builds on verifiedBurnTxs + claimedMatchIds schema; uses throwing loadServerState)
  - 07-infrastructure-monitoring (relies on fail-hard startup behavior)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-hard startup: server must not start with zeroed emission counter — exit(1) if DB unreachable"
    - "Throwing loadServerState: callers responsible for treating failure as fatal"
    - "$addToSet for idempotent array append (burn tx replay protection)"

key-files:
  created: []
  modified:
    - server/models/ServerState.js
    - server/models/User.js
    - server/index.js

key-decisions:
  - "loadServerState() throws on readyState !== 1 AND on Mongoose query errors — no try-catch, callers handle"
  - "loadServerState() returns { totalShotEmitted, verifiedBurnTxs } — shape extended for TE-03"
  - "persistBurnTx() uses $addToSet — idempotent, prevents duplicates atomically"
  - "Both mongoose.connect .catch() AND initShotState() error are fatal — server never starts with unknown emission state when MONGODB_URI is set"
  - "Dev mode (no MONGODB_URI) else branch unchanged — fail-hard only applies when MONGODB_URI is configured"

patterns-established:
  - "Fail-hard pattern: wrap initShotState() in try-catch with process.exit(1) — critical state must be loaded or server aborts"
  - "Schema extension pattern: add fields with default: [] for arrays, keeping backward compat"

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 6 Plan 01: Token Economy Schema Foundation Summary

**MongoDB schema extended with verifiedBurnTxs and claimedMatchIds fields; loadServerState() made throwing; fail-hard startup via process.exit(1) on DB or initShotState failure**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-23T11:04:49Z
- **Completed:** 2026-02-23T11:07:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ServerState schema gains `verifiedBurnTxs: [String]` field — burn tx replay protection survives server restarts (TE-03)
- `loadServerState()` rewritten to throw on DB unreachable or query error instead of silently returning `{ totalShotEmitted: 0 }` — eliminates silent reset of replay protection set
- `persistBurnTx(txSignature)` added as exported function using `$addToSet` for atomic, idempotent burn tx persistence
- User schema gains `stats.claimedMatchIds: [String]` — match dedup state persisted across restarts
- `index.js` now exits with code 1 on both MongoDB connection failure AND `initShotState()` failure — server never starts with unknown emission state when MONGODB_URI is set

## Task Commits

Each task was committed atomically:

1. **Task 1: Add schema fields and make loadServerState throw on failure** - `76fd472` (feat)
2. **Task 2: Wrap initShotState with fail-hard process.exit(1) in index.js** - `daa6c9e` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `server/models/ServerState.js` - Added verifiedBurnTxs schema field; rewrote loadServerState() to throw; added persistBurnTx() export
- `server/models/User.js` - Added claimedMatchIds: [String] to stats subdocument
- `server/index.js` - Wrapped initShotState() in try-catch with process.exit(1); changed .catch() to also exit(1) instead of starting without DB

## Decisions Made
- `loadServerState()` no longer has try-catch — it throws and callers are responsible. This is intentional: the only caller is `initShotState()`, which is now itself wrapped in a fatal try-catch in `index.js`.
- `persistBurnTx()` uses fire-and-forget pattern (errors logged, not thrown) — consistent with `saveServerState()`. Burn tx persistence failure should not crash the server; the in-memory Set still prevents replay within the session.
- The `else` branch in index.js (no MONGODB_URI) is unchanged — dev mode starts without DB. The fail-hard invariant only applies when MONGODB_URI is configured.
- First-ever startup (no 'global' document in DB) returns `{ totalShotEmitted: 0, verifiedBurnTxs: [] }` — this is a legitimate case, not an error.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema foundation is in place: `verifiedBurnTxs` and `claimedMatchIds` fields are schema-ready for Plan 02 to wire up persistence logic
- `loadServerState()` return shape now includes `verifiedBurnTxs` — Plan 02's `initShotState()` update can immediately use the loaded array to hydrate the in-memory Set
- Fail-hard startup is in place — production deployments will refuse to start if MongoDB is unreachable
- No blockers for Plan 02

---
*Phase: 06-token-economy-hardening*
*Completed: 2026-02-23*
