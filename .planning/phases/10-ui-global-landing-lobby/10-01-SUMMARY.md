---
phase: 10-ui-global-landing-lobby
plan: 01
subsystem: ui
tags: [react, socket.io, shot-token, price-ticker, topbar, wallet]

# Dependency graph
requires:
  - phase: 09-jupiter-integration
    provides: getShotPrice socket handler + shotPrice event pattern
provides:
  - ShotPriceTicker reusable component with socket subscription and ready-gate
  - TopBar three-column flex layout with live SHOT price in center column
  - WalletDisplay "What is a wallet?" help link for non-compact, non-connected state
affects:
  - All screens using TopBar (LobbyScreen, ShopScreen, ArmoryScreen, PrestigeScreen, BarracksScreen, BattleScreen)
  - MenuScreen (WalletDisplay non-compact shows help link)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ready-gate pattern: render null until first socket response (prevents N/A flash)
    - string concatenation in JSX for price text (avoids Collider.js ESLint webpack worker bug)
    - three-column flex layout with flexShrink left/right and flex:1 center

key-files:
  created:
    - client/src/components/ShotPriceTicker.js
  modified:
    - client/src/components/TopBar.js
    - client/src/components/WalletDisplay.js

key-decisions:
  - "ShotPriceTicker uses ready-gate boolean — renders null until first shotPrice socket response prevents N/A flash on initial load"
  - "TopBar uses three-column flex (not absolute positioned title) — eliminates overlap risk with ticker below title"
  - "Help link gated on !compact — appears only in non-compact WalletDisplay (MenuScreen), hidden in TopBar"
  - "String concatenation for price display — avoids pre-existing Collider.js ESLint issue that blocks builds"

patterns-established:
  - "ShotPrice socket pattern: emit getShotPrice on mount, listen to shotPrice with cleanup in return — reusable in any component"
  - "ready-gate: useState(false) + setReady(true) on first data — prevents loading flash for socket-fed data"

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 10 Plan 01: ShotPriceTicker and TopBar Layout Summary

**Live SHOT/USD price ticker with ready-gate added to TopBar via three-column flex layout, plus crypto-naive help link on MenuScreen wallet connect**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-24T13:44:02Z
- **Completed:** 2026-02-24T13:52:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Created ShotPriceTicker.js: socket-subscribed SHOT price display with ready-gate (no N/A flash), green/red change percentage, N/A fallback, and optional style prop
- Refactored TopBar from absolute-positioned title to three-column flex layout with ticker centered below title
- Added "WHAT IS A WALLET?" help link to WalletDisplay non-compact mode (MenuScreen only, hidden in TopBar)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ShotPriceTicker and refactor TopBar layout** - `b336da8` (feat)
2. **Task 2: Add "What is a wallet?" help link to WalletDisplay** - `6b88590` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `client/src/components/ShotPriceTicker.js` - Reusable SHOT price ticker with socket subscription, ready-gate, N/A fallback, and green/red change display
- `client/src/components/TopBar.js` - Three-column flex layout (left: back btn, center: title + ticker, right: wallet), absolute positioning removed
- `client/src/components/WalletDisplay.js` - Added "WHAT IS A WALLET?" anchor link below WalletMultiButton when !connected && !compact

## Decisions Made
- ShotPriceTicker uses a `ready` boolean state initialized to false; renders null until first shotPrice event fires — prevents N/A flash on screens where price data hasn't arrived yet
- TopBar flex layout uses flexShrink: 0 + minWidth: 80 on left/right columns and flex: 1 on center — keeps title and ticker visually centered regardless of back button and wallet widths
- Help link is gated on `!compact` inside the `!connected` branch — ensures it only appears in full WalletDisplay (MenuScreen), not in compact TopBar mode
- Used string concatenation ('SHOT $' + price.toFixed(4)) not template literals — avoids pre-existing Collider.js ESLint webpack worker bug that blocks builds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ShotPriceTicker is ready for use on any additional screens (WinScreen can optionally be refactored to import it instead of inline socket subscription)
- TopBar layout is stable for remaining plan work in phase 10
- No blockers

---
*Phase: 10-ui-global-landing-lobby*
*Completed: 2026-02-24*
