---
phase: 09-jupiter-integration
plan: 03
subsystem: ui
tags: [jupiter, jupiter-plugin, swap, prestige, platform-fee, referral, shot-price, wallet-passthrough]

# Dependency graph
requires:
  - phase: 09-01
    provides: CDN Plugin script loaded in index.html; getShotPrice socket handler; CSP updated for plugin.jup.ag
  - phase: 09-02
    provides: Wallet adapter with Jupiter Mobile passthrough

provides:
  - Reusable JupiterSwap React component wrapping Jupiter Plugin singleton with wallet passthrough and platform fee
  - JupiterSwap integrated into PrestigeScreen (BUY SHOT for burns)
  - JupiterSwap integrated into ShopScreen (CTA for prestige-locked weapons)
  - JupiterSwap integrated into WinScreen (SWAP SOL -> SHOT with live SHOT price)
  - JupiterSwap integrated into LoseScreen (GET SHOT with live SHOT price)
  - 09-USER-SETUP.md updated with REACT_APP_JUPITER_REFERRAL_ACCOUNT setup steps

affects:
  - 10-ui-global-landing-lobby (JupiterSwap component reusable across all screens)
  - 11-post-match-stats-pipeline (post-match swap CTA already in place)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Jupiter Plugin singleton: module-level jupiterInitialized flag prevents re-initialization across React component instances and screen navigations"
    - "CDN readiness polling: setInterval every 200ms, 10s timeout with graceful error fallback — handles defer-loaded CDN scripts"
    - "Wallet passthrough via syncProps: called on every wallet state change and immediately after Jupiter.init()"
    - "Platform fee via formProps.referralAccount + referralFee: env-driven, gracefully absent when env var not set"

key-files:
  created:
    - client/src/components/JupiterSwap.js
  modified:
    - client/src/screens/PrestigeScreen.js
    - client/src/screens/ShopScreen.js
    - client/src/screens/WinScreen.js
    - client/src/screens/LoseScreen.js
    - .planning/phases/09-jupiter-integration/09-USER-SETUP.md

key-decisions:
  - "referralFee set to 50 bps (0.5%) — competitive platform fee for a game, not punitive"
  - "Prestige weapon detection via tier.toLowerCase().includes('prestige') — tier string is reliable; IDs 16-20 heuristic kept as comment fallback"
  - "shotPrice display uses string interpolation (not JSX template) to avoid Collider.js ESLint parse issue that blocks builds"
  - "JupiterSwap button is visually subtle (small font, purple-muted) to not compete with primary actions"

patterns-established:
  - "JupiterSwap: import from ../components/JupiterSwap, use mode='modal' for all screen integrations"
  - "getShotPrice pattern: socket.on('shotPrice', handler) + socket.emit('getShotPrice') in useEffect with cleanup"

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 9 Plan 03: Jupiter Plugin Component and Screen Integrations Summary

**JupiterSwap singleton component with SOL-to-SHOT pre-config, wallet passthrough, and 0.5% platform fee integrated into PrestigeScreen, ShopScreen, WinScreen, and LoseScreen; post-match screens fetch and display live SHOT price via getShotPrice socket**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T12:30:37Z
- **Completed:** 2026-02-24T12:35:08Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 4 modified, 1 updated)

## Accomplishments

- Created `client/src/components/JupiterSwap.js` — reusable React wrapper for Jupiter Plugin with singleton guard, modal/integrated modes, CDN readiness polling, wallet passthrough via syncProps, and referral fee configuration
- Platform fee configured: `referralAccount` from `REACT_APP_JUPITER_REFERRAL_ACCOUNT` env var + `referralFee: 50` (0.5% bps) — routes to SolShot treasury on every swap
- SHOT mint pre-configured as fixed output (`initialOutputMint: SHOT_MINT`, `fixedMint: SHOT_MINT`) — always SOL-to-SHOT
- PrestigeScreen: "BUY SHOT" modal button below burn button — lets players buy SHOT when they see they don't have enough for next tier
- ShopScreen: "BUY SHOT TO UNLOCK" CTA appears when a prestige-tier weapon is selected (detected via `tier.toLowerCase().includes('prestige')`)
- WinScreen: "SWAP SOL -> SHOT" button with live SHOT price (USD + 24h% change) fetched via `getShotPrice` socket on mount; gracefully hidden when price unavailable
- LoseScreen: Same price-context swap CTA with "GET SHOT FOR PRESTIGE UPGRADES" messaging
- Build succeeds: `npx react-app-rewired build` completes with no errors
- 09-USER-SETUP.md updated with Jupiter Referral Account setup steps and `REACT_APP_JUPITER_REFERRAL_ACCOUNT` env var

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reusable JupiterSwap component with platform fee** - `99b246c` (feat)
2. **Task 2: Integrate JupiterSwap into PrestigeScreen, ShopScreen, WinScreen, and LoseScreen** - `335f846` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `client/src/components/JupiterSwap.js` — New: Jupiter Plugin singleton wrapper; modal/integrated modes; CDN polling; wallet passthrough; referral fee; graceful error fallback
- `client/src/screens/PrestigeScreen.js` — Added JupiterSwap import and "BUY SHOT" button in left panel after burn result
- `client/src/screens/ShopScreen.js` — Added JupiterSwap import and "BUY SHOT TO UNLOCK" CTA in weapon detail panel for prestige weapons
- `client/src/screens/WinScreen.js` — Added JupiterSwap import, useEffect, shotPrice state, and swap CTA with price display after button row
- `client/src/screens/LoseScreen.js` — Added JupiterSwap import, useEffect, shotPrice state, and swap CTA with price display after button row
- `.planning/phases/09-jupiter-integration/09-USER-SETUP.md` — Added REACT_APP_JUPITER_REFERRAL_ACCOUNT env var, referral account creation steps, and token account setup for SOL and SHOT

## Decisions Made

- Used `referralFee: 50` (0.5% in basis points) — reasonable platform fee for a game; not punitive, still meaningful revenue at scale
- Prestige weapon detection via `tier.toLowerCase().includes('prestige')` — relies on tier string content, which is authoritative from `tiers.js`; IDs 16-20 heuristic noted as fallback
- Placed swap CTAs as visually subtle elements (small font, purple-muted palette, secondary position) — intentionally not competing with primary actions (REMATCH, LOBBY, BURN)
- `shotPrice` price display uses string concatenation (not JSX template literals) to avoid triggering the pre-existing Collider.js ESLint issue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The pre-existing ESLint/Collider.js build issue from Plan 01 was not encountered (DISABLE_ESLINT_PLUGIN=true in client/.env handled it). Build completed cleanly.

## User Setup Required

**External services require manual configuration.** See [09-USER-SETUP.md](./09-USER-SETUP.md) for:
- `REACT_APP_JUPITER_REFERRAL_ACCOUNT` — referral.jup.ag → connect treasury wallet → create referral account → add SOL + SHOT token accounts → copy public key
- All previously documented env vars (JUP_API_KEY, REACT_APP_REOWN_PROJECT_ID) still needed

Without `REACT_APP_JUPITER_REFERRAL_ACCOUNT`, swaps work but platform fees are not collected (no crash, graceful degradation).

## Next Phase Readiness

- Phase 9 (Jupiter Integration) is NOW COMPLETE — all 3 plans executed
- JupiterSwap component is reusable and can be added to additional screens in Phase 10/11 with a single import
- `shotPrice` socket event pattern established and ready for Phase 10 price ticker in TopBar
- Platform fee infrastructure complete — pending only the one-time referral.jup.ag dashboard setup (user action)
- Ready for Phase 10: UI — Global, Landing & Lobby

---
*Phase: 09-jupiter-integration*
*Completed: 2026-02-24*
