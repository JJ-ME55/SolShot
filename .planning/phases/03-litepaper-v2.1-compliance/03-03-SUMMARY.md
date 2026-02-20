---
phase: 03-litepaper-v2.1-compliance
plan: 03
subsystem: token-economy
tags: [shot-token, milestones, mongodb, user-model, practice-mode, emission]

# Dependency graph
requires:
  - phase: 02-todo-completion
    provides: User model, shot-token service, prestige burn system already scaffolded
provides:
  - 8 v2.1 one-time milestones replacing old ladder system
  - Practice mode 25% emission rate
  - Milestone state persistence via MongoDB User model
  - loadMilestoneState / saveMilestoneState for server restart durability
affects:
  - 03-04 (main.js integration — recordMatchPlayed call sites need enriched context)
  - 03-05 (client prestige screen may surface new milestone labels)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget DB writes: saveMilestoneState called without await, errors only logged"
    - "Milestone dedup by ID string (not match count) — future-safe for reordering"
    - "rateMultiplier pattern: isWagered ? 1.0 : 0.25 applied to all milestone rewards"

key-files:
  created: []
  modified:
    - server/services/shot-token.js
    - server/models/User.js

key-decisions:
  - "Practice mode earns 25% — Math.floor applied so fractional SHOT is truncated (not rounded)"
  - "Consecutive win streak resets on any loss in wagered mode; practice matches do not affect streak"
  - "saveMilestoneState also called from prestigeBurn to keep DB in sync after burns"
  - "milestonesEarned stored as String[] in MongoDB (milestone IDs) to match in-memory representation"
  - "Legacy matchesPlayed field kept in playerShotState and synced to totalMatchesPlayed for getPrestigeInfo backward compat"

patterns-established:
  - "Milestone check functions: (s, ctx) => bool — state-only milestones use single arg, context-dependent use both"
  - "PRESTIGE_WEAPON_IDS export enables caller (main.js) to derive usedNoPrestige from match weapon list"

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 3 Plan 03: SHOT Milestone v2.1 Rewrite Summary

**8 v2.1 one-time milestones replace old match-count ladder; Practice mode emits at 25% rate; milestone state persisted to MongoDB User schema**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T07:55:57Z
- **Completed:** 2026-02-20T08:00:55Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Replaced 6-entry match-count ladder + recurring interval with exactly 8 named v2.1 milestones (each earnable once per account, deduped by ID string)
- Added Practice mode 25% rate multiplier via `rateMultiplier = isWagered ? 1.0 : 0.25` applied to all milestone rewards
- Enriched `recordMatchPlayed` signature: now accepts `isWagered`, `isWinner`, `maxRoundDamage`, `weaponsUsed` from match context
- Added `loadMilestoneState` and `saveMilestoneState` to persist state to MongoDB across server restarts
- Added `PRESTIGE_WEAPON_IDS` export so callers can compute `usedNoPrestige` flag
- Extended `User.stats` schema with 7 new fields: `totalMatchesPlayed`, `wageredMatchesPlayed`, `wageredWins`, `consecutiveWins`, `milestonesEarned`, `shotBalance`, `totalBurned`

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: Replace SHOT_MILESTONES and verify Practice mode** - `f37e28d` (feat)
2. **Task 3: Persist milestone state to MongoDB User model** - `8f16ef7` (feat)

## Files Created/Modified

- `server/services/shot-token.js` — Complete rewrite of SHOT_MILESTONES, playerShotState schema, recordMatchPlayed, plus new loadMilestoneState/saveMilestoneState exports; User model import added
- `server/models/User.js` — Added 7 milestone state fields to stats subdocument

## Decisions Made

- `Math.floor` applied to fractional Practice-mode rewards (truncate, not round) — consistent with integer token semantics
- Consecutive win streak only modified in wagered matches — Practice games are neutral (neither increment nor reset)
- `saveMilestoneState` also called from `prestigeBurn` so prestige tier changes survive restarts
- Legacy `matchesPlayed` field retained in in-memory state and kept in sync with `totalMatchesPlayed` to avoid breaking `getPrestigeInfo` display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] saveMilestoneState not called from prestigeBurn**

- **Found during:** Task 3 review
- **Issue:** Plan specified saveMilestoneState called at end of recordMatchPlayed, but prestigeBurn also mutates balance and tier — without a save there, prestige would be lost on restart
- **Fix:** Added `saveMilestoneState(walletAddress)` call (fire-and-forget) inside prestigeBurn after the burn is applied
- **Files modified:** server/services/shot-token.js
- **Verification:** Call site confirmed in prestigeBurn function body
- **Committed in:** f37e28d (Tasks 1+2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — missing critical persistence call)
**Impact on plan:** Essential for correct behavior; no scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- shot-token.js exports are complete and backward-compatible
- `recordMatchPlayed` call sites in `main.js` must be updated to pass enriched context (isWagered, isWinner, maxRoundDamage, weaponsUsed) — this is the work of plan 03-04
- `loadMilestoneState` must be called from the authenticate handler in main.js to populate state on login — also 03-04
- No blockers for 03-04

---
*Phase: 03-litepaper-v2.1-compliance*
*Completed: 2026-02-20*
