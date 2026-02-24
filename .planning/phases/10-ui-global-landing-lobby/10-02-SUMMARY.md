---
phase: 10-ui-global-landing-lobby
plan: 02
subsystem: ui
tags: [react, menuscreen, landing-page, ecosystem-partners, cta, jupiter-mobile]

# Dependency graph
requires:
  - phase: 09-jupiter-integration
    provides: Jupiter Mobile wallet adapter integration — referenced in callout messaging
provides:
  - Ecosystem partner badges row (Solana, Jupiter, Meteora, Claude) with brand-color CSS text badges
  - "SKILL, NOT LUCK" tagline with wager range and no-download sub-tagline
  - "PLAY FREE" primary CTA (renamed from DEPLOY, same lobby navigation)
  - Jupiter Mobile callout below wallet section
  - "LEARN MORE" placeholder anchor link
affects: [10-03-landing-lobby, visual QA, marketing review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PARTNERS module-level constant array — iterates to render CSS text badges, no external images"
    - "partnerBadge(color) function style — dynamic style factory returning inline style object keyed on brand color"

key-files:
  created: []
  modified:
    - client/src/screens/MenuScreen.js

key-decisions:
  - "CSS text badges only — no external image fetches, no CSP changes required"
  - "LEARN MORE uses href='#' placeholder — litepaper URL to be updated when published"
  - "Tasks 1 and 2 combined into one commit — both modify the same file sequentially with no intermediate state worth preserving"
  - "DEPLOY button renamed to PLAY FREE — same navigate('lobby') target, no routing changes"

patterns-established:
  - "String concatenation (not template literals) for dynamic CSS values in inline styles — consistent with 10-03 ESLint pattern"

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 10 Plan 02: MenuScreen Landing Page Overhaul Summary

**Ecosystem partner badges (Solana/Jupiter/Meteora/Claude), 'SKILL, NOT LUCK' tagline, wager range, PLAY FREE CTA, and Jupiter Mobile callout added to landing page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T13:38:55Z
- **Completed:** 2026-02-24T13:42:02Z
- **Tasks:** 2 (combined into 1 commit — same file)
- **Files modified:** 1

## Accomplishments
- Replaced single "POWERED BY SOLANA" badge with 4-partner ecosystem row using CSS-only text badges (no external images, no CSP changes)
- Updated tagline to "SKILL, NOT LUCK" with wager range sub-tagline showing "0.1 — 1.0 SOL | NO DOWNLOAD REQUIRED"
- Renamed primary CTA from "DEPLOY" to "PLAY FREE" — preserves existing lobby navigation
- Added Jupiter Mobile callout ("NEW TO CRYPTO? USE JUPITER MOBILE") below wallet section in Jupiter green (#C7F284)
- Added "LEARN MORE" placeholder anchor link for future litepaper URL

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: MenuScreen landing page overhaul** - `0fdca65` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `client/src/screens/MenuScreen.js` - Ecosystem partners row, updated tagline/sub-tagline, PLAY FREE CTA, Jupiter Mobile callout, Learn More link

## Decisions Made
- CSS text badges (no external images) — avoids CSP changes and network fetches
- LEARN MORE href="#" placeholder — litepaper URL to be wired when SolShot litepaper is published online
- Tasks 1 and 2 combined into one commit — both modified the same file with no meaningful intermediate state
- String concatenation used for dynamic CSS border/background values (consistent with project ESLint constraint from 10-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Landing page conversion elements complete — PLAY FREE, CONNECT WALLET (via WalletDisplay), LEARN MORE all visible
- Jupiter Mobile "NEW TO CRYPTO?" callout live — reinforces 09-02 Jupiter Mobile wallet integration
- LEARN MORE link is a placeholder — update href when litepaper URL is available
- Plan 03 (10-03) already complete per STATE.md — this plan was executed out of order

---
*Phase: 10-ui-global-landing-lobby*
*Completed: 2026-02-24*
