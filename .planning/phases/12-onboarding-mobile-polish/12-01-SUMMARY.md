---
plan: 01
phase: 12-onboarding-mobile-polish
subsystem: mobile-ux
status: complete
tags: [haptic, mobile, dapp-browser, portrait, vibration]
commits:
  - 566b497  # feat(12-01): create haptic feedback utility with global window.haptic
  - 4c3360f  # feat(12-01): integrate haptic feedback into gameplay moments
  - 2b531a1  # feat(12-01): add dApp browser detection banner and portrait dismiss button
completed: 2026-02-24
duration: ~10min
requires: []
provides:
  - haptic feedback utility (window.haptic) for Phaser + React
  - dApp browser detection banner in Layout.js
  - portrait overlay dismiss button in App.js
affects:
  - 12-02 (can reference haptic import already in App.js)
  - 12-03 (Layout.js overlays already in place)
tech-stack:
  added: []
  patterns:
    - navigator.vibrate for Android/Chrome haptics
    - iOS Taptic Engine workaround via hidden switch checkbox
    - sessionStorage for dismissal persistence (dApp banner, portrait overlay)
    - window.haptic global for Phaser scene access without module imports
key-files:
  created:
    - client/src/utils/haptic.js
  modified:
    - client/src/scenes/main/index.js
    - client/src/screens/BattleScreen.js
    - client/src/App.js
    - client/src/components/Layout.js
decisions:
  - "window.haptic assigned at module load for Phaser scene access (no module imports in Phaser scenes)"
  - "iOS Taptic via hidden checkbox with switch attribute — best-effort, no crash on failure"
  - "dApp banner detection: isMobile AND hasWalletExtension AND NOT regular Safari"
  - "Portrait dismiss stored in sessionStorage (not localStorage) — resets each browser session"
---

# Phase 12 Plan 01: Haptic Feedback + dApp Browser Detection + Portrait Warning Enhancement Summary

**One-liner:** Haptic feedback utility (light/medium/heavy) wired into shot/damage/win events, plus dApp browser detection banner and portrait overlay dismiss button.

## What was done

### Task 1: Haptic feedback utility (client/src/utils/haptic.js)

Created a pure browser-API utility with three vibration intensities:
- `light()` — 10ms, for UI taps
- `medium()` — 25ms, for shot fired
- `heavy()` — [50, 30, 50]ms double-pulse, for damage and win/lose

Includes iOS Taptic Engine workaround: creates a hidden `<input type="checkbox" switch>` element and `.click()`s it on iOS devices (Safari 17.4+ Taptic API). All methods are wrapped in try/catch and silently no-op on unsupported platforms.

Exported as named `haptic` and also assigned to `window.haptic` so Phaser scenes can access it without ES module imports.

### Task 2: Haptic integration in MainScene and BattleScreen

- **App.js**: Added bare `import './utils/haptic'` to ensure `window.haptic` is set before Phaser initializes
- **MainScene.handleFireFromReact()**: Calls `window.haptic.medium()` after emitting the fire socket event
- **MainScene.applyTurnResult()**: Calls `window.haptic.heavy()` only when the LOCAL player's tank takes damage (both `data.hp` authoritative path and `damage` fallback path), never on opponent damage
- **BattleScreen.js**: Imports `haptic` from utils, calls `haptic.heavy()` in the `matchEnd` socket handler (fires for both win and lose)

### Task 3: dApp browser detection + portrait warning dismiss

**A. DAppBrowserBanner in Layout.js:**

New component renders a fixed top banner (z-index 9999) when:
- Mobile viewport (< 768px wide OR `ontouchstart` present)
- Wallet extension injected (`window.phantom?.solana` or `window.solflare`)
- NOT regular Safari (`/safari/i` without `/chrome/i`)

Banner shows: "For the best experience, open solshot.gg in Chrome or Safari" with a "Copy Link" button (copies `window.location.href` via Clipboard API) and a "Dismiss" button (stores `solshot_dapp_banner_dismissed` in sessionStorage).

**B. PortraitWarning dismiss button in App.js:**

Enhanced the existing PortraitWarning component (was already present):
- Added `dismissed` state initialized from `sessionStorage.getItem('solshot_portrait_dismissed')`
- Added `handleDismiss()` that sets sessionStorage key and updates state
- Added "Continue in Portrait" button styled subtly (low-opacity, no-fill)
- Guard: `if (!isPortrait || dismissed) return null`

## Files modified

- `client/src/utils/haptic.js` — created
- `client/src/scenes/main/index.js` — haptic.medium() on fire, haptic.heavy() on local damage
- `client/src/screens/BattleScreen.js` — haptic import + heavy() on matchEnd
- `client/src/App.js` — haptic bare import, PortraitWarning dismiss button + sessionStorage
- `client/src/components/Layout.js` — DAppBrowserBanner component added

## Deviations from Plan

None — plan executed exactly as written.

## Build Verification

`npm run build` in client/ completed successfully with no errors.
