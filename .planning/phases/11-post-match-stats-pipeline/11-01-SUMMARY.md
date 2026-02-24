---
phase: 11-post-match-stats-pipeline
plan: 01
subsystem: database
tags: [mongodb, mongoose, socket.io, stats, milestones, prestige, shot-token]

# Dependency graph
requires:
  - phase: 06-token-economy-hardening
    provides: SHOT_MILESTONES, getPlayerShotState, recordMatchPlayed, getPrestigeInfo in shot-token.js
  - phase: 08-verification-re-audit
    provides: match state machine (match.js), fire handler with WEAPON_DATA, User.js schema

provides:
  - kills, deaths, weaponStats (Map keyed by weaponId) fields in User.js stats schema
  - per-weapon tracking (shotsFired, hits, damageDealt) in match state (weaponShotsFired/weaponHits/weaponDamage/totalDeaths)
  - enriched matchEnd payload with prestigeInfo per-player and earnedMilestones array
  - enhanced persistStats writing kills/deaths/per-weapon $inc to MongoDB
  - rate-limited getStats handler (1 req/sec per client via client._lastStatsFetch)

affects:
  - 11-02 (post-match tabbed UI needs prestigeInfo and earnedMilestones from matchEnd)
  - 11-03 (Barracks screen needs weaponStats from getStats/User.js)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Mongoose Map type for per-weapon stats (keyed by weapon ID string)
    - Milestone diff pattern: snapshot Set before recordMatchPlayed, diff after
    - buildWeaponIncs helper: iterates weaponShotsFired to build MongoDB $inc dot-notation keys
    - Per-client rate limiting via client._lastStatsFetch (Date.now() timestamp on socket object)

key-files:
  created: []
  modified:
    - server/models/User.js
    - server/services/match.js
    - server/socket-io/main.js

key-decisions:
  - "Mongoose Map type for weaponStats — enables dot-notation $inc without schema migration per weapon"
  - "Milestone snapshot pattern (Set diff) — captures ALL milestones earned in a match, not just last one"
  - "buildWeaponIncs helper is local to persistStats scope — not extracted to service (match-specific logic)"
  - "weapon hits/damage tracked only for damage dealt to opponents (playerId !== this.id guard)"
  - "totalDeaths tracked on death event (hp drops to 0), not on kill event — separate concerns"

patterns-established:
  - "client._lastStatsFetch: per-socket rate limit state attached directly to socket object"
  - "buildWeaponIncs(pid): takes playerId, returns $inc object with dot-notation keys for nested Map update"

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 11 Plan 01: Stats Pipeline Foundation Summary

**Server-side K/D and per-weapon stats tracking (shots/hits/damage) persisted to MongoDB via enhanced User schema, enriched matchEnd payload with prestigeInfo and earned milestone diff, and rate-limited getStats handler**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-24T15:02:30Z
- **Completed:** 2026-02-24T15:05:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- User.js now has `kills`, `deaths`, and `weaponStats` (Mongoose Map) in stats schema — enables lifetime K/D and per-weapon persistence
- Match state initializes `weaponShotsFired`, `weaponHits`, `weaponDamage`, `totalDeaths` tracking objects; fire handler and damage loop populate them during gameplay
- matchEnd payload enriched with `prestigeInfo` (per-player prestige tier/balance) and `earnedMilestones` (milestones earned THIS match, diff vs snapshot before recordMatchPlayed)
- persistStats now writes kills/deaths/$inc and per-weapon stats using `buildWeaponIncs()` helper with dot-notation MongoDB keys
- getStats socket handler rate-limited to 1 request/second per client via `client._lastStatsFetch`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add kills/deaths/weaponStats to User schema and track per-weapon stats in match state** - `62c5a90` (feat)
2. **Task 2: Enrich matchEnd payload with prestigeInfo and earnedMilestones, enhance persistStats, rate-limit getStats** - `ba2f4b8` (feat)

## Files Created/Modified

- `server/models/User.js` - Added kills, deaths, weaponStats (Mongoose Map of sub-schema) to stats subdocument
- `server/services/match.js` - Added weaponShotsFired, weaponHits, weaponDamage, totalDeaths to createMatchState return object
- `server/socket-io/main.js` - Import getPlayerShotState/SHOT_MILESTONES; fire handler tracks weaponShotsFired; damage loop tracks weaponHits/weaponDamage/totalDeaths; matchEnd enriched; persistStats enhanced; getStats rate-limited

## Decisions Made

- **Mongoose Map type for weaponStats**: Enables dot-notation $inc (`stats.weaponStats.1.shotsFired`) without needing a weapon sub-schema migration each time a new weapon is added. Keys are weapon ID strings.
- **Milestone snapshot diff pattern**: Taking a Set snapshot of `milestonesEarned` before `recordMatchPlayed` and diffing after gives ALL milestones earned in this match. The existing `recordMatchPlayed` return value only has the last milestone label — the diff approach is complete.
- **buildWeaponIncs helper inline**: The weapon $inc builder is defined locally inside persistStats scope rather than extracted to a service — it's tightly coupled to the match state object structure and only used in one place.
- **Deaths tracked at kill event**: `ms.totalDeaths[playerId]` incremented when `hpBefore > 0 && ms.hp[playerId] <= 0` — same location as kill tracking, clean co-location.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. `getPlayerShotState` was already exported from shot-token.js (line 125: `export function getPlayerShotState`) — no modification to shot-token.js required beyond adding the import in main.js.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- matchEnd payload now includes `prestigeInfo` and `earnedMilestones` — Plan 02 (post-match tabbed UI) can render WinScreen/LoseScreen with milestone celebrations and prestige progress
- User.js weaponStats Map and kills/deaths fields ready — Plan 03 (Barracks) can display per-weapon accuracy and lifetime K/D via getStats
- All new fields persist to MongoDB via $inc upsert — safe to add without migration (defaults to 0 for existing users)

---
*Phase: 11-post-match-stats-pipeline*
*Completed: 2026-02-24*
