---
phase: 29-desktop-mouse-aim-and-control-settings
plan: 01
subsystem: ui
tags: [react, hooks, localStorage, phaser, control-scheme, window-interop]

# Dependency graph
requires: []
provides:
  - useControlScheme hook with localStorage persistence and window.controlScheme sync
  - MenuScreen desktop CONTROLS toggle (MOUSE AIM / CLASSIC buttons)
  - BattleScreen passes controlScheme prop to BattleHUD
  - BattleHUD accepts controlScheme prop (foundation for Plan 03 read-only sliders)
affects:
  - 29-02 (Phaser mouse-aim reads window.controlScheme)
  - 29-03 (BattleHUD read-only sliders gated by controlScheme prop)
  - 30 (mobile tap-to-aim will also call useControlScheme)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useControlScheme(isMobile) hook: localStorage read on init, window.controlScheme sync via useEffect"
    - "window.controlScheme as React-to-Phaser interop channel (mirrors window.socket, window.gameBridge pattern)"
    - "Default: 'mouse' on desktop, 'classic' on mobile — localStorage stored under solshot_control_scheme"

key-files:
  created:
    - client/src/hooks/useControlScheme.js
  modified:
    - client/src/screens/MenuScreen.js
    - client/src/screens/BattleScreen.js
    - client/src/screens/battle/BattleHUD.js

key-decisions:
  - "localStorage key is solshot_control_scheme (matches existing project convention for preference keys)"
  - "window.controlScheme set in both updateScheme() and useEffect to handle both update and mount cases"
  - "CONTROLS selector placed in desktop section only (below HOW TO PLAY link) — mobile deferred to Phase 30"

patterns-established:
  - "Hook returns [scheme, updateScheme] tuple — updateScheme writes both localStorage and window"
  - "Control scheme selector uses inline button styles matching gold/dark menu theme (var(--am) for active state)"
  - "BattleScreen reads isMobile via useIsMobile() hook before calling useControlScheme(isMobile)"

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 29 Plan 01: Control Scheme Foundation Summary

**useControlScheme hook with localStorage persistence, MenuScreen desktop toggle, and BattleHUD prop plumbing — foundation for Phaser mouse-aim and read-only slider display**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-23T11:51:58Z
- **Completed:** 2026-03-23T11:55:00Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Created `useControlScheme(isMobile)` hook — reads `solshot_control_scheme` from localStorage, defaults to `'mouse'` on desktop / `'classic'` on mobile, syncs `window.controlScheme` on every change
- Added desktop-only CONTROLS selector to MenuScreen with MOUSE AIM / CLASSIC toggle buttons in gold/dark theme style, with persistence confirmed via localStorage
- Wired `controlScheme` from BattleScreen down to BattleHUD via prop — `window.controlScheme` is set before Phaser scene initializes, providing the interop channel Plan 02 needs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useControlScheme hook** - `ffed7b6` (feat)
2. **Task 2: Wire control scheme into MenuScreen, BattleScreen, and BattleHUD** - `0f66a4b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `client/src/hooks/useControlScheme.js` - New hook: localStorage read/write, window.controlScheme sync, [scheme, updateScheme] tuple
- `client/src/screens/MenuScreen.js` - Added useControlScheme import, hook call, styles (controlSchemeSection/Label/Picker), desktop CONTROLS toggle UI
- `client/src/screens/BattleScreen.js` - Added useIsMobile + useControlScheme imports, hook call, controlScheme prop passed to BattleHUD
- `client/src/screens/battle/BattleHUD.js` - Added controlScheme to props destructuring signature

## Decisions Made

- Used `window.controlScheme` as the React-to-Phaser interop channel, matching the existing project pattern (`window.socket`, `window.gameBridge`, `window.solWallet`)
- CONTROLS selector in MenuScreen is desktop-only (`!isMobile` branch) — mobile tab handling deferred to Phase 30
- Active button style uses `var(--am)` (amber/gold) with a subtle background tint to match the existing menu aesthetic without adding new CSS variables

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

The `npm run build` command returned a pre-existing `crypto` polyfill error from `@toruslabs/eccrypto` — confirmed to be a pre-existing issue by stashing changes and verifying the same error reproduced without any of this plan's modifications. Not caused by these changes. Brace/paren balance checks confirm all four modified files are syntactically correct.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `window.controlScheme` is set before Phaser initializes — Plan 02 can read it immediately in `_isMouseAimActive()` guard
- `controlScheme` prop flows into BattleHUD — Plan 03 can add `readOnly` prop to AngleControl/PowerControl without any additional plumbing
- The hook defaults to `'mouse'` on desktop with no prior localStorage entry — fresh users get mouse-aim by default as specified

---
*Phase: 29-desktop-mouse-aim-and-control-settings*
*Completed: 2026-03-23*
