---
phase: 11-post-match-stats-pipeline
plan: 03
subsystem: ui
tags: [react, html2canvas, twitter, share, barracks, combat-card, k/d, stats]

# Dependency graph
requires:
  - phase: 11-post-match-stats-pipeline
    plan: 01
    provides: kills/deaths/weaponStats in User schema, getStats rate-limited handler returning kills/deaths
  - phase: 11-post-match-stats-pipeline
    plan: 02
    provides: tabbed WinScreen/LoseScreen with Action tab structure for share button placement

provides:
  - ShareCard component: offscreen match result card with html2canvas clipboard export via forwardRef/useImperativeHandle
  - X/Twitter share buttons on WinScreen and LoseScreen Action tabs (no emojis, professional tone)
  - BarracksScreen K/D ratio and total kills stats with empty-state CTA for new players
  - CombatCard 4-column combat record grid with K/D ratio stat

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - forwardRef + useImperativeHandle for html2canvas capture: parent calls exportToClipboard() on ref, child owns cardRef internally
    - Offscreen html2canvas: position:absolute left:-9999px (NOT display:none — html2canvas cannot capture hidden elements)
    - X/Twitter share flow: clipboard copy first, then window.open tweet URL in sequence (await order matters)
    - Empty-state CTA pattern: ternary on matches === 0 after null check — three states (loading/empty/populated)

key-files:
  created:
    - client/src/components/ShareCard.js
  modified:
    - client/src/screens/WinScreen.js
    - client/src/screens/LoseScreen.js
    - client/src/screens/BarracksScreen.js
    - client/src/components/CombatCard.js

key-decisions:
  - "ShareCard renders offscreen (position:absolute left:-9999) not display:none — html2canvas requirement"
  - "forwardRef + useImperativeHandle: parent screens call shareCardRef.current.exportToClipboard() without knowing card internals"
  - "Tweet text uses string concatenation (not template literals) — avoids Collider.js ESLint webpack worker bug"
  - "Empty-state CTA replaces stats grid entirely when matches === 0 — cleaner UX than dim stats with zeros"
  - "K/D second row is a separate 2-column grid div below main 3x2 grid — avoids breaking the existing 6-stat layout"
  - "CombatCard 4-column grid: Losses cell changes from statLast to stat (adds right border), new K/D cell uses statLast"

patterns-established:
  - "ShareCard forwardRef pattern: exportToClipboard() method on ref, offscreen absolute positioning for html2canvas"
  - "BarracksScreen three-state render: null=loading / matches===0=CTA / matches>0=stats"

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 11 Plan 03: Social Share, K/D Stats, and Barracks CTA Summary

**X/Twitter share buttons on post-match screens via offscreen ShareCard with html2canvas clipboard export, K/D ratio in BarracksScreen and CombatCard, and empty-state CTA for new players**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-24T15:22:46Z
- **Completed:** 2026-02-24T15:27:28Z
- **Tasks:** 2
- **Files modified:** 4 modified, 1 created

## Accomplishments

- ShareCard.js renders an offscreen (position:absolute left:-9999) 320x180 match result card; exposes `exportToClipboard()` via forwardRef/useImperativeHandle using html2canvas at scale:2 to clipboard via ClipboardItem API
- WinScreen and LoseScreen Action tabs each have a "SHARE ON X" button that awaits clipboard copy then opens a pre-filled tweet with professional text, no emojis, @SolShotGG mention, and solshot.gg URL
- BarracksScreen derives kills/deaths from getStats response, computes K/D, adds a second 2-column grid row (K/D RATIO + TOTAL KILLS) below the main 6-stat grid; also shows an empty-state CTA ("PLAY YOUR FIRST MATCH TO SEE STATS HERE" + FIND A MATCH button) when stats loaded but matches === 0
- CombatCard widened combat record grid from 3 to 4 columns; Losses cell gains right border (stat style), new K/D cell added as the 4th (statLast style)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ShareCard component and add X/Twitter share to WinScreen and LoseScreen** - `4a1d414` (feat)
2. **Task 2: Augment BarracksScreen with K/D, empty state CTA, and add K/D to CombatCard** - `6808e68` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `client/src/components/ShareCard.js` - Offscreen match result card (VICTORY/DEFEAT header, SOL/SHOT earned, SOLSHOT.GG footer) with html2canvas clipboard export via forwardRef
- `client/src/screens/WinScreen.js` - Added shareCardRef + ShareCard offscreen render; SHARE ON X button in Action tab
- `client/src/screens/LoseScreen.js` - Added shareCardRef + ShareCard offscreen render; SHARE ON X button with loss-appropriate text in Action tab
- `client/src/screens/BarracksScreen.js` - Derives kills/deaths/K/D; adds K/D RATIO + TOTAL KILLS second row; adds empty-state CTA when matches === 0; passes kills/deaths to CombatCard
- `client/src/components/CombatCard.js` - Destructures kills/deaths, computes K/D; 4-column combat record grid with K/D as 4th stat

## Decisions Made

- **Offscreen positioning (not display:none)**: html2canvas cannot capture elements with display:none. Using position:absolute with left:-9999px keeps the element in the render tree but invisible. This is the canonical approach for html2canvas off-screen capture.
- **forwardRef + useImperativeHandle**: Parent screens (WinScreen, LoseScreen) call `shareCardRef.current.exportToClipboard()` without knowing the card's internal cardRef. This keeps the capture logic co-located with the card component.
- **Tweet text is string concatenation**: Follows the established [10-03] constraint — template literals cause the Collider.js ESLint webpack worker bug. All JSX strings use concatenation.
- **Empty-state CTA replaces entire stats block**: When matches === 0, showing a grid of dashes/zeros is noise. The CTA ("PLAY YOUR FIRST MATCH") is more actionable and clean. The three-state render (null/zero/positive) is explicit and easy to reason about.
- **K/D second row as a separate div**: Adding a 4th and 5th card to the existing 3-column grid would misalign (5 items, 3 cols = 2+3 layout). A dedicated 2-column second row is visually clean and intentional.
- **CombatCard Losses border fix**: With 4 columns, the old Losses `statLast` (no right border) becomes the 3rd item, so it needs `stat` style (with right border). The new K/D 4th item becomes `statLast`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build succeeded cleanly on first attempt with `npm run build` (react-app-rewired).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 11 complete: stats pipeline foundation (11-01), post-match tabbed UI (11-02), and social share + K/D + Barracks CTA (11-03) all done
- WinScreen/LoseScreen now provide a complete post-match experience: Result (rewards), Progress (milestones/prestige), Action (rematch/share/swap)
- BarracksScreen shows meaningful live stats with K/D and graceful empty state for new players
- CombatCard ready for sharing with K/D in the 4-column combat record

---
*Phase: 11-post-match-stats-pipeline*
*Completed: 2026-02-24*
