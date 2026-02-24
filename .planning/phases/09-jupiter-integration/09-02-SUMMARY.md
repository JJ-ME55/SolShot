---
phase: 09-jupiter-integration
plan: 02
subsystem: ui
tags: [jupiter, reown, walletconnect, wallet-adapter, webpack, polyfills, cra]

# Dependency graph
requires:
  - phase: 09-01
    provides: CSP updates allowing Reown/WalletConnect WebSocket connections
provides:
  - Jupiter Mobile wallet adapter integrated as first wallet in list with RECOMMENDED badge
  - Fallback JupiterMobileAdapter class for safety net when package unavailable
  - Webpack polyfills for Reown/WalletConnect (assert, http, https, os, url)
affects: [09-03-jupiter-plugin, 10-ui-global, 14-checklist-audit]

# Tech tracking
tech-stack:
  added:
    - "@jup-ag/jup-mobile-adapter@0.0.2 — Jupiter Mobile wallet adapter via Reown"
    - "@reown/appkit — WalletConnect v2 app toolkit"
    - "@reown/appkit-adapter-solana — Solana adapter for Reown"
    - "@reown/appkit-wallet-button — Reown wallet button UI"
    - "assert, stream-http, https-browserify, os-browserify, url — webpack polyfills"
  patterns:
    - "Unconditional hook call with conditional wallets list (React rules of hooks compliance)"
    - "useEffect-injected style tags for wallet modal customization without CSS file changes"
    - "Graceful degradation via env var guard — feature hidden not crashed when unconfigured"

key-files:
  created:
    - "client/src/wallet/JupiterMobileAdapter.js — fallback adapter extending BaseWalletAdapter"
  modified:
    - "client/src/wallet/WalletContext.js — Jupiter Mobile adapter + RECOMMENDED highlight CSS"
    - "client/config-overrides.js — added assert/http/https/os/url polyfills"
    - "client/package.json — new Reown/WalletConnect dependencies"

key-decisions:
  - "Used useWrappedReownAdapter unconditionally (React hooks rules), gated wallets list with REOWN_PROJECT_ID check"
  - "DISABLE_ESLINT_PLUGIN=true added to client/.env to fix pre-existing ESLint webpack worker JSON parse error"
  - "JupiterMobileAdapter.js created as fallback safety net even though package installed successfully"
  - "Visual highlight via injected <style> tag rather than modifying CSS files (self-cleaning on unmount)"

patterns-established:
  - "Pattern: useEffect style injection with data-attribute selector for safe cleanup"
  - "Pattern: REACT_APP_REOWN_PROJECT_ID guard gates Jupiter Mobile without crashing when absent"

# Metrics
duration: 40min
completed: 2026-02-24
---

# Phase 9 Plan 02: Jupiter Mobile Wallet Adapter Summary

**Jupiter Mobile adapter via Reown/WalletConnect added as first wallet in list with purple RECOMMENDED badge, with graceful fallback when REACT_APP_REOWN_PROJECT_ID is not set**

## Performance

- **Duration:** 40 min
- **Started:** 2026-02-24T11:48:10Z
- **Completed:** 2026-02-24T12:27:56Z
- **Tasks:** 2/2
- **Files modified:** 4 (+ 1 created)

## Accomplishments

- Installed `@jup-ag/jup-mobile-adapter` and full Reown/WalletConnect peer dependency stack
- Added webpack polyfills (assert, http, https, os, url) required by Reown for CRA compatibility
- Created fallback `JupiterMobileAdapter.js` extending `BaseWalletAdapter` as a safety net
- Integrated `useWrappedReownAdapter` hook into `SolShotWalletProvider` — Jupiter Mobile appears at position 0 in the wallet list
- Added `RECOMMENDED` badge and purple border highlight for first wallet via `useEffect` style injection in `SolShotWalletInner`
- Graceful degradation: when `REACT_APP_REOWN_PROJECT_ID` not set, Jupiter Mobile excluded from list with `console.warn` (no crash)
- Updated `09-USER-SETUP.md` to include Reown project ID setup instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Jupiter Mobile adapter, Reown deps, and polyfills** - `042d20c` (feat)
2. **Task 2: Integrate Jupiter Mobile adapter into WalletContext with visual highlight** - `d878822` (feat)

**Plan metadata:** `[see docs commit below]` (docs: complete plan)

## Files Created/Modified

- `client/src/wallet/JupiterMobileAdapter.js` — Fallback adapter: extends BaseWalletAdapter, name='Jupiter', url='https://jup.ag/mobile', connect() opens jup.ag/mobile in new tab, sendTransaction() throws WalletNotConnectedError
- `client/src/wallet/WalletContext.js` — Added: useWrappedReownAdapter import, REOWN_PROJECT_ID constant, hook call in SolShotWalletProvider, conditional wallets list (Jupiter first), useEffect style injection with RECOMMENDED badge CSS
- `client/config-overrides.js` — Added assert, http, https, os, url to `config.resolve.fallback`
- `client/package.json` — Added 4 Reown packages + 5 polyfill devDependencies

## Decisions Made

- **useWrappedReownAdapter called unconditionally** (React hooks rules require hooks to always be called in the same order). The adapter's presence in the wallets list is gated by `REOWN_PROJECT_ID` check, not the hook call itself.
- **jupiterAdapter placed at index 0** — `wallet-adapter-react-ui` renders wallets in array order, so first = top of modal.
- **Style injection via useEffect** rather than a static CSS file — allows clean removal on unmount, avoids adding a new CSS import, and scopes to the active provider lifecycle.
- **DISABLE_ESLINT_PLUGIN=true** in client `.env` (gitignored) — addresses pre-existing ESLint webpack worker JSON parse error. The error was present before this plan (confirmed by testing against HEAD commit). ESLint still runs normally via `npx eslint`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing ESLint webpack plugin error blocking build verification**

- **Found during:** Task 1 verification (`npx react-app-rewired build`)
- **Issue:** `src\classes\Collider.js` and `src\classes\Tween.js` fail with `Syntax error: Error while parsing JSON - Unexpected end of JSON input (0:undefined)` in the `eslint-webpack-plugin`. This error exists BEFORE this plan's changes (confirmed by building against the HEAD commit before npm installs). The 09-01 SUMMARY also documented this pre-existing issue.
- **Root cause:** `@babel/eslint-parser` webpack worker threads can't find valid babel config in worker context (Windows-specific path resolution issue).
- **Fix:** Added `DISABLE_ESLINT_PLUGIN=true` to `client/.env` (gitignored, local-only). ESLint still works when run directly (`npx eslint src/...`). Build now succeeds.
- **Files modified:** `client/.env` (gitignored — not committed)
- **Verification:** `npx react-app-rewired build` completes with "The build folder is ready to be deployed."
- **Impact:** Suppresses ESLint during webpack build only. Does not affect code quality checks via CLI.

**2. [Rule 2 - Missing Critical] Plan pseudocode had wrong destructuring for useWrappedReownAdapter**

- **Found during:** Task 2 — inspecting actual package TypeScript declarations
- **Issue:** Plan showed `const jupiterAdapter = useWrappedReownAdapter(...)` but the actual API returns `{ reownAdapter, jupiterAdapter }` (verified from `adapters.d.mts`).
- **Fix:** Used correct destructuring `const { jupiterAdapter } = useWrappedReownAdapter(...)`.
- **Impact:** Functional — without this fix, code would have assigned the options object to `jupiterAdapter` instead of the adapter instance.

**3. [Rule 2 - Missing Critical] Hook must always be called (React rules of hooks)**

- **Found during:** Task 2 — planning implementation
- **Issue:** Plan suggested conditional hook call (`if (REOWN_PROJECT_ID) { useWrappedReownAdapter(...) }`), which violates React's rules of hooks (hooks cannot be conditional).
- **Fix:** Hook is always called. The wallets list construction is gated by `if (!REOWN_PROJECT_ID)` instead — when no project ID, Jupiter Mobile is excluded from the wallets array.

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** All necessary for correct operation. The pre-existing ESLint issue was a blocker; the API fixes were required for correctness.

## Issues Encountered

- Pre-existing ESLint webpack plugin crash on Collider.js and Tween.js (documented by 09-01 SUMMARY as well). Fixed by adding `DISABLE_ESLINT_PLUGIN=true` to gitignored `.env`.

## User Setup Required

**External services require manual configuration.** See [09-USER-SETUP.md](./09-USER-SETUP.md) for:
- `REACT_APP_REOWN_PROJECT_ID` — free project ID from dashboard.reown.com (required for Jupiter Mobile to appear in wallet list)
- `JUP_API_KEY` — free Lite tier key from portal.jup.ag (for SHOT price service from 09-01)

## Next Phase Readiness

- Jupiter Mobile adapter is first in the wallet list and will display with RECOMMENDED badge when opened
- Missing `REACT_APP_REOWN_PROJECT_ID` gracefully hides Jupiter Mobile — Phantom and Solflare still work
- 09-03 (Jupiter Plugin component) can proceed independently
- Runtime WalletConnect connection requires CSP from 09-01 to be applied first (to allow `wss://relay.walletconnect.com`)
- `REACT_APP_REOWN_PROJECT_ID` must be configured before end-to-end testing of Jupiter Mobile connection

---
*Phase: 09-jupiter-integration*
*Completed: 2026-02-24*
