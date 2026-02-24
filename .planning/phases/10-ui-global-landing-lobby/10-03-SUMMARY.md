---
phase: 10-ui-global-landing-lobby
plan: 03
subsystem: ui
tags: [react, lobby, shop, prestige, wager, jupiter, sol, shot-token]

# Dependency graph
requires:
  - phase: 09-jupiter-integration
    provides: JupiterSwap component used in ShopScreen prestige weapon section
  - phase: 10-ui-global-landing-lobby (plans 01-02)
    provides: LobbyScreen and ShopScreen base implementations

provides:
  - LobbyScreen wager badges showing pot size and winner payout (90/7/3 BPS split)
  - Practice mode "FREE" display with green onramp sublabel
  - ShopScreen prestige weapon tier name, burn cost, and tier-specific JupiterSwap label

affects:
  - future-ui-polish
  - match-ux
  - prestige-ux

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PRESTIGE_WEAPON_META: module-level map built from PRESTIGE_TIERS for weapon ID -> tier metadata lookup"
    - "formatWagerWithPayout: amount*2 for pot, pot*0.90 for winner payout (mirrors 90/7/3 BPS escrow split)"
    - "IIFE pattern in JSX for conditional multi-element prestige block with early return"

key-files:
  created: []
  modified:
    - client/src/screens/LobbyScreen.js
    - client/src/screens/ShopScreen.js

key-decisions:
  - "formatWager replaced by formatWagerWithPayout — old name removed entirely to prevent stale references"
  - "Practice sublabel placed inside the Mode section div (not a sibling div) so it renders flush under mode buttons"
  - "PRESTIGE_WEAPON_META uses weapon IDs (numbers) as keys — more precise than tier string check"
  - "IIFE (() => { ... })() used in JSX to allow prestigeMeta const + early return without extra component"

patterns-established:
  - "Pot/payout math: amount*2 = pot, pot*0.90 = winner payout — consistent with escrow 90/7/3 BPS split"
  - "String concatenation (not template literals) for all dynamic UI text — avoids Collider.js ESLint worker bug"

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 10 Plan 03: Lobby Wager Display and Shop Prestige Metadata Summary

**Lobby wager badges now show pot size and 90% winner payout; prestige weapons in ShopScreen display tier name, burn cost, and tier-specific JupiterSwap label**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T13:32:45Z
- **Completed:** 2026-02-24T13:35:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Room cards in LobbyScreen now show "X.XX SOL pot — winner takes X.XXX SOL" for all wagered matches (90% payout mirrors escrow 90/7/3 BPS split)
- Practice rooms correctly display "FREE" and practice mode selection shows green onramp sublabel: "PRACTICE FREE. EARN SHOT. WAGER WHEN READY."
- ShopScreen prestige weapons now show tier-colored heading (e.g., "BRONZE PRESTIGE"), burn cost line (e.g., "REQUIRES 200 SHOT BURN"), and tier-specific JupiterSwap button label (e.g., "BUY SHOT TO UNLOCK BRONZE")

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance lobby wager display and add practice mode framing** - `b0bed6c` (feat)
2. **Task 2: Add prestige weapon burn cost and tier display to ShopScreen** - `812ad0e` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `client/src/screens/LobbyScreen.js` - formatWagerWithPayout function, practice onramp sublabel
- `client/src/screens/ShopScreen.js` - PRESTIGE_TIERS import, PRESTIGE_WEAPON_META map, enhanced prestige weapon detail panel

## Decisions Made
- `formatWager` renamed to `formatWagerWithPayout` (old name removed entirely — no stale call sites possible)
- Practice mode sublabel placed inside the Mode section `<div>` container (not a separate sibling) so it renders directly under the mode buttons without layout gap
- Used IIFE `(() => { const prestigeMeta = ...; if (!prestigeMeta) return null; return (...); })()` in JSX to support early return + local const without extracting a sub-component
- PRESTIGE_WEAPON_META keyed by weapon ID (number) — more authoritative than `tier.toLowerCase().includes('prestige')` string check; covers IDs 21 (Platinum/Chain Reaction), 22 (Diamond/Pineapple), 24 (Bronze/Homing Missile), 26 (Gold/Tommy Gun), 29 (Silver/Cruiser)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lobby and Shop UI polish complete for plans 01-03
- LobbyScreen wager display now communicates value proposition clearly to players
- ShopScreen prestige weapons now provide actionable info (what tier, how much SHOT to burn, buy button with tier context)
- Any further UI polish (plan 04+) can build on these patterns

---
*Phase: 10-ui-global-landing-lobby*
*Completed: 2026-02-24*
