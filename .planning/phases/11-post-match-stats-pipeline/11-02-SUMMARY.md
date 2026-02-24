---
phase: 11-post-match-stats-pipeline
plan: 02
subsystem: ui
tags: [react, tabs, milestones, prestige, escrow, localStorage, shot-token, post-match]

# Dependency graph
requires:
  - phase: 11-post-match-stats-pipeline
    plan: 01
    provides: enriched matchEnd payload with prestigeInfo and earnedMilestones per-player

provides:
  - Tabbed WinScreen (Result/Progress/Action) with milestone and prestige display
  - Tabbed LoseScreen matching WinScreen structure (Result/Progress/Action)
  - LobbyScreen one-time escrow explainer modal gated by localStorage key

affects:
  - 11-03 (Barracks screen — same screen pattern, Progress tab established)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Three-tab post-match UI: Result (rewards/stats), Progress (milestones/prestige), Action (swap/navigate)
    - localStorage one-time modal gate: check key before showing, setItem on dismiss
    - Prestige progress bar: (balance / nextTier.burnCost) * 100 clamped to 100%

key-files:
  created: []
  modified:
    - client/src/screens/WinScreen.js
    - client/src/screens/LoseScreen.js
    - client/src/screens/LobbyScreen.js

key-decisions:
  - "Tab state (activeTab) is local per-screen — no persistence needed, resets to 'result' on each visit"
  - "opponentLeft Modal kept outside tab conditionals — must show regardless of active tab"
  - "Escrow modal is informational-only — wager is still set before check; no blocking of UX flow"
  - "localStorage 'solshot_escrow_seen' persists across sessions — one-time education, never re-shown"

patterns-established:
  - "Post-match tab structure: Result (immediate rewards) / Progress (long-term SHOT/prestige) / Action (rematch/swap)"
  - "earnedMilestones[myId] access pattern: guard on screenData existence AND myId before array access"
  - "prestigeInfo[myId] access pattern: same double-guard, then check myPrestige.nextTier for max-tier branch"

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 11 Plan 02: Post-Match Tabbed UI Summary

**Tabbed WinScreen/LoseScreen with SHOT milestone celebration and prestige progress bar, plus one-time escrow explainer modal on first wager selection in LobbyScreen**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-24T15:12:41Z
- **Completed:** 2026-02-24T15:18:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- WinScreen refactored to three tabs (Result / Progress / Action): Result shows existing reward cards + stats + settlement TX; Progress shows earnedMilestones list per player and prestige tier progress bar toward next burn threshold; Action shows rematch/lobby/menu buttons and JupiterSwap CTA
- LoseScreen given identical three-tab structure: Result shows loss card + stats; Progress shows same milestone/prestige display (losers earn SHOT milestones too); Action shows RUN IT BACK + JupiterSwap GET SHOT CTA
- LobbyScreen: on first click of any wager tier > 0, checks `localStorage.getItem('solshot_escrow_seen')` — if absent, shows "HOW WAGERING WORKS" Modal explaining 90% payout, escrow custody, and disconnect refund policy; dismissal via GOT IT sets `solshot_escrow_seen` permanently

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tabbed layout to WinScreen with Result/Progress/Action tabs and milestone/prestige display** - `d44c3c4` (feat)
2. **Task 2: Mirror tabbed layout on LoseScreen and add escrow explainer to LobbyScreen** - `89065b9` (feat)

## Files Created/Modified

- `client/src/screens/WinScreen.js` - Refactored to three tabs; Result tab has existing content; Progress tab renders earnedMilestones array and prestige tier progress bar with burnCost tracking; Action tab has buttons + JupiterSwap
- `client/src/screens/LoseScreen.js` - Same three-tab structure as WinScreen; loss-appropriate labels (SOL WAGERED, RUN IT BACK, GET SHOT FOR PRESTIGE UPGRADES)
- `client/src/screens/LobbyScreen.js` - Added showEscrow state; wager button onClick now checks localStorage before showing explainer; escrow Modal rendered with GOT IT button that persists localStorage key

## Decisions Made

- **Tab state is local**: `useState('result')` in each screen — no need for URL params or global state, resets to Result tab on each post-match visit which is the most immediately relevant content
- **opponentLeft Modal is outside tab conditionals**: The disconnect notification is critical UX regardless of which tab the player is viewing; kept as always-rendered conditional
- **Escrow modal is non-blocking**: Wager is set before the localStorage check — player's choice is respected immediately; modal is informational, not a confirmation gate
- **localStorage key `solshot_escrow_seen`**: Permanent suppression after first dismiss — escrow mechanics don't change, no need to re-educate; string value 'true' (simple truthy check with getItem)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Build initially attempted with `npx react-scripts build` (bypasses `config-overrides.js`). Switched to `npm run build` (uses `react-app-rewired build`) which applies polyfills — build succeeded cleanly. This is a pre-existing project setup characteristic, not a code issue.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- WinScreen and LoseScreen now consume `earnedMilestones` and `prestigeInfo` from matchEnd payload delivered by Plan 01 — full pipeline is connected
- LobbyScreen escrow explainer is live — new players waging for the first time will see the education modal
- Plan 03 (Barracks/stats screen) can follow the same tab pattern established here; getStats socket handler (rate-limited in Plan 01) is ready to be called

---
*Phase: 11-post-match-stats-pipeline*
*Completed: 2026-02-24*
