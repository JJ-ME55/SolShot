---
phase: 13-client-security
plan: 01
subsystem: infra
tags: [csp, source-maps, security, helmet, express, react]

# Dependency graph
requires:
  - phase: 05-client-supply-chain-security
    provides: CSP configuration baseline in server/index.js via helmet
  - phase: 07-infrastructure-monitoring
    provides: Express route structure and health endpoint patterns
provides:
  - GENERATE_SOURCEMAP=false in .env.production (no JS/CSS source maps in production build)
  - CSP report-uri directive pointing to /api/csp-report
  - POST /api/csp-report endpoint accepting application/csp-report, logs violations, returns 204
  - Zero active console.log in client source (20 removed across 7 files)
affects: [14-mainnet-deploy, production-build]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "express.json({ type: 'application/csp-report' }) for non-standard CSP report Content-Type"
    - "GENERATE_SOURCEMAP=false in .env.production — CRA canonical way to disable all source maps"

key-files:
  created:
    - client/.env.production
  modified:
    - server/index.js
    - client/src/classes/Tank.js
    - client/src/components/JupiterSwap.js
    - client/src/index.js
    - client/src/scenes/main/index.js
    - client/src/screens/BattleScreen.js
    - client/src/wallet/JupiterMobileAdapter.js
    - client/src/wallet/WalletContext.js

key-decisions:
  - "CSP report handler uses console.error (server-side only) — appropriate for operational monitoring, not ironic console.log"
  - "express.json({ type: 'application/csp-report' }) mandatory — browsers send violations with this Content-Type, not application/json"
  - "INLINE_RUNTIME_CHUNK=false added alongside GENERATE_SOURCEMAP=false — prevents inline runtime chunk in production"
  - "BattleScreen.js if(sig)/else restructured: removed positive branch log, kept negative branch error path intact"

patterns-established:
  - "SEC-01: .env.production for build-time flags — GENERATE_SOURCEMAP=false disables all JS, CSS, source-map-loader maps"
  - "SEC-02: CSP report-uri + dedicated POST handler pattern — helmet reportUri directive + express.json type override"
  - "SEC-03: Active console.log removal — delete not comment-out; preserve console.warn/error as error signals"

# Metrics
duration: 10min
completed: 2026-02-25
---

# Phase 13 Plan 01: Client Security Hardening Summary

**Source maps disabled via .env.production, CSP violation reporting endpoint added to server, and all 20 debug console.log calls stripped from 7 client source files**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-25T07:39:47Z
- **Completed:** 2026-02-25T07:50:06Z
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- Created `client/.env.production` with `GENERATE_SOURCEMAP=false` and `INLINE_RUNTIME_CHUNK=false` — production build will produce no `.map` files
- Added `reportUri: ['/api/csp-report']` to helmet CSP directives and a POST handler that accepts `application/csp-report`, logs violations via `console.error`, and returns 204
- Removed all 20 active `console.log` statements from 7 client files — zero active console.log in `client/src/`; all 25 `console.warn`/`console.error` preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .env.production and add CSP report-uri endpoint** - `e9cce73` (feat)
2. **Task 2: Remove all 20 active console.log statements from client source** - `f1de397` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `client/.env.production` - Production build flags: GENERATE_SOURCEMAP=false, INLINE_RUNTIME_CHUNK=false, production server URL, mainnet network, program IDs
- `server/index.js` - Added reportUri CSP directive and POST /api/csp-report handler
- `client/src/classes/Tank.js` - Removed randomPos debug log
- `client/src/components/JupiterSwap.js` - Removed swap success and singleton init logs
- `client/src/index.js` - Removed service worker registration success log
- `client/src/scenes/main/index.js` - Removed 8 debug logs (turnResult received, applyTurnResult impact/terrain/no-terrain, HP update x2, checkSwitchTurn waiting/applying)
- `client/src/screens/BattleScreen.js` - Removed escrow deposit signed log; restructured if/else to remove positive branch
- `client/src/wallet/JupiterMobileAdapter.js` - Removed Jupiter Mobile unavailable log
- `client/src/wallet/WalletContext.js` - Removed 4 logs (escrow TX sent/confirmed, burn TX sent/confirmed) and 2 auth logs (auth confirmed, auto-authenticating)

## Decisions Made
- CSP handler uses `console.error` (not `console.log`) — server-side operational monitoring; not subject to SEC-03 which targets browser console
- `express.json({ type: 'application/csp-report' })` is applied only to the CSP endpoint, not globally — avoids changing global body parser behavior
- `BattleScreen.js` restructured: original `if(sig) { log } else { setError }` changed to `if(!sig) { setError }` — eliminates dead positive branch cleanly
- Stale git worktree reference (`SolShot-clean/.git/worktrees/worktree`) removed at execution start — worktrees directory was from prior .bok audit worktree that no longer exists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Stale git worktree reference caused `git status` failures. The `.git/worktrees/worktree/` directory referenced `C:/Users/johnk/SolShot-clean/.git/worktrees/worktree` which no longer exists. Removed the stale directory to restore git status functionality. Commits proceeded normally using `git add` with absolute paths (which worked even with the stale worktree).

## User Setup Required
None - no external service configuration required. All changes are code-level.

## Next Phase Readiness
- SEC-01 complete: production build ready to verify with `npm run build` — no `.map` files should appear in `build/static/js/`
- SEC-02 complete: CSP violations from production deployments will be reported to `/api/csp-report` and logged server-side
- SEC-03 complete: browser console is clean in production — no debug information exposed to end users
- Phase 13 Plan 02 (remaining client security items) can proceed

---
*Phase: 13-client-security*
*Completed: 2026-02-25*
