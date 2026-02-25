---
plan: 02
phase: 12
status: complete
commits:
  - 7ff53d4: feat(12-02): default LobbyScreen to practice mode
  - 408c180: feat(12-02): add FAQ component and global help button
duration: ~2.5 minutes
completed: 2026-02-25
---

## What was done

### Task 1: Default LobbyScreen to practice mode
Changed the `matchMode` useState initial value in `LobbyScreen.js` from `'quick_match'` to `'practice'`. New players now land directly on the Practice tab when they open the lobby, removing the friction of needing to select a mode before their first game.

### Task 2: FAQ component and global access button
Created a new `FAQ.js` component — a full-screen modal overlay (z-index 9500) with 7 collapsible accordion sections covering the most common player questions:
- How to play
- How weapons work
- What SHOT is
- What prestige tiers are
- How wagering works
- Which wallets work
- Best mobile experience

The accordion uses a single `openSection` state so only one answer is visible at a time. The modal closes on Escape keypress or backdrop click (stopPropagation on content). Unicode escape sequences used for em-dashes in answers to avoid encoding issues.

Wired into `App.js`: import added after the haptic import, `faqOpen` state added to AppInner, a fixed circular "?" button (bottom: 12px, right: 12px, z-index 9000, 40px circle) triggers the modal from any screen in the app.

### Build verification
`npm run build` passed with "Compiled successfully." — no errors or warnings beyond the pre-existing bundle size advisory.

## Files modified

- `client/src/screens/LobbyScreen.js` — one-line change: default mode 'quick_match' -> 'practice'
- `client/src/components/FAQ.js` — new file (FAQ modal component, 7 sections, accordion)
- `client/src/App.js` — import FAQ, add faqOpen state, render "?" button + FAQ modal

## Deviations from Plan

None - plan executed exactly as written.
