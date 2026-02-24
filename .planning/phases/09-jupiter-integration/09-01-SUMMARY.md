---
phase: 09-jupiter-integration
plan: 01
subsystem: infra
tags: [jupiter, csp, helmet, socket-io, price-api, cdn]

# Dependency graph
requires: []
provides:
  - Content Security Policy updated for all Jupiter domains (plugin.jup.ag, api.jup.ag, tokens.jup.ag, cache.jup.ag)
  - Jupiter Plugin CDN script tag in index.html (plugin-v1.js with defer)
  - Server-side Jupiter Price API V3 service with 30s polling and in-memory cache
  - getShotPrice socket handler returning cached SHOT price to clients
affects:
  - 09-02 (Jupiter Mobile adapter — needs CSP already updated)
  - 09-03 (Jupiter Plugin component — needs CDN loaded, price socket handler)
  - 10-ui-global-landing-lobby (SHOT price ticker consumes shotPrice socket event)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side price proxy: fetch from Jupiter API server-side, cache in memory, serve via Socket.IO (protects API key, respects rate limit)"
    - "CSP mirroring: index.html meta tag and Helmet directives updated together to maintain consistency across HTTP and HTML delivery"

key-files:
  created:
    - server/services/jupiter-price.js
    - .planning/phases/09-jupiter-integration/09-USER-SETUP.md
  modified:
    - client/public/index.html
    - server/index.js
    - server/socket-io/main.js
    - server/.env.example

key-decisions:
  - "Use api.jup.ag (V3) not deprecated lite-api.jup.ag; requires API key from portal.jup.ag"
  - "Use plugin.jup.ag CDN not deprecated terminal.jup.ag"
  - "4 CSP domains (plugin.jup.ag, api.jup.ag, tokens.jup.ag, cache.jup.ag) — no Meteora (out of scope for this plan)"
  - "frame-src changed from none to plugin.jup.ag — Plugin may use iframes internally"
  - "Price service returns null gracefully when API key missing or SHOT has no liquidity (pre-launch safe)"

patterns-established:
  - "Price proxy pattern: server polls external API on interval, caches result, clients request via socket"

# Metrics
duration: 9min
completed: 2026-02-24
---

# Phase 9 Plan 01: CSP Updates, Plugin CDN, and Jupiter Price API Service Summary

**Jupiter Plugin CDN loaded in index.html, CSP updated for 4 Jupiter domains in both meta tag and Helmet, and a server-side SHOT price service polling api.jup.ag/price/v3 every 30s with graceful null handling**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T11:48:47Z
- **Completed:** 2026-02-24T11:57:55Z
- **Tasks:** 2
- **Files modified:** 5 (+ 2 new files created)

## Accomplishments

- CSP updated in both `client/public/index.html` (meta tag) and `server/index.js` (Helmet directives) to allow all 4 current Jupiter domains: `plugin.jup.ag`, `api.jup.ag`, `tokens.jup.ag`, `cache.jup.ag`
- `frame-src` changed from `'none'` to `plugin.jup.ag` (Plugin may use iframes internally)
- Jupiter Plugin CDN script `plugin-v1.js` added with `defer` attribute — loads before use, doesn't block render
- Created `server/services/jupiter-price.js`: ES module service fetching SHOT price from Jupiter Price API V3, 30s in-memory cache, exports `getShotPrice`, `startPricePolling`, `stopPricePolling`
- Added `getShotPrice` socket handler to `main.js` — emits cached price to requesting client as `shotPrice` event
- `startPricePolling(30000)` called at server boot (inside `mainsocket` initialization)
- `server/.env.example` documents `JUP_API_KEY` entry
- Generated `09-USER-SETUP.md` for the portal.jup.ag API key setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CSP and add Jupiter Plugin CDN script** - `7f20699` (feat)
2. **Task 2: Create server-side Jupiter Price API service and socket handler** - `a07f7d3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `client/public/index.html` — CSP meta tag updated with Jupiter domains; Plugin CDN script added
- `server/index.js` — Helmet CSP directives updated to mirror index.html changes
- `server/.env.example` — Added `JUP_API_KEY` documentation
- `server/services/jupiter-price.js` — New: Jupiter Price API V3 client with caching and polling
- `server/socket-io/main.js` — Added import, `startPricePolling(30000)` call, and `getShotPrice` socket handler
- `.planning/phases/09-jupiter-integration/09-USER-SETUP.md` — New: setup guide for JUP_API_KEY

## Decisions Made

- Used current `api.jup.ag/price/v3` endpoint (not deprecated `lite-api.jup.ag/price/v2`) — requires API key but is the supported path per Jupiter migration docs
- Used `plugin.jup.ag` CDN (not deprecated `terminal.jup.ag`) — per research confirming the rename
- Did NOT include Meteora domains in CSP — out of scope for this plan, no Meteora API calls planned
- Did NOT include WalletConnect/Reown CSP domains — those belong to Plan 02 (wallet adapter)
- `frame-src` changed from `'none'` to `https://plugin.jup.ag` — research note says Plugin may use iframes; proactively allowing avoids hard-to-debug CSP violations later
- Price service returns `{ usdPrice: null, priceChange24h: null, lastUpdated: null }` when API key missing — server starts and runs without the key (dev mode safe)

## Deviations from Plan

None - plan executed exactly as written. Pre-existing build failure in `client/src/classes/Collider.js` (ESLint JSON parse error, unrelated to CSP changes) was observed but not addressed as it is outside plan scope.

## Issues Encountered

- React client build (`npx react-app-rewired build`) fails with a pre-existing ESLint error in `client/src/classes/Collider.js` (`Syntax error: Error while parsing JSON`). This is NOT caused by the CSP changes — it existed before this plan and is in Phaser game classes unrelated to Jupiter integration. The CSP meta tag itself is syntactically valid HTML (verified by visual inspection and the file reading without errors).

## User Setup Required

**External services require manual configuration.** See [09-USER-SETUP.md](./09-USER-SETUP.md) for:
- `JUP_API_KEY` — free Lite tier key from portal.jup.ag (required for live SHOT price)
- Account creation and API key generation steps
- Verification commands to confirm the key works

## Next Phase Readiness

- Ready for `09-02-PLAN.md` (Jupiter Mobile wallet adapter)
- CSP already includes space for WalletConnect domains that Plan 02 will need (note: WalletConnect CSP entries for `wss://relay.walletconnect.com` etc. are NOT in this plan — Plan 02 should add them)
- Plugin CDN script loaded — Plan 03 can call `window.Jupiter.init()` immediately
- `shotPrice` socket event available for UI consumption in Phase 10

---
*Phase: 09-jupiter-integration*
*Completed: 2026-02-24*
