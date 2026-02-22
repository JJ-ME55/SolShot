---
phase: 05
plan: 02
subsystem: client-security
tags: [csp, helmet, telegram-sdk, supply-chain, content-security-policy, cra]

dependency-graph:
  requires:
    - "05-01: dependency pinning and audit"
  provides:
    - "Self-hosted Telegram Web App SDK at /js/telegram-web-app.js"
    - "Content Security Policy enforced via meta tag (client) and Helmet (server)"
    - "CRA inline runtime script eliminated via INLINE_RUNTIME_CHUNK=false"
  affects:
    - "05-03 and beyond: CSP baseline established — future features must respect script-src 'self'"

tech-stack:
  added: []
  patterns:
    - "Defense-in-depth CSP: meta tag (SPA) + Helmet header (API responses)"
    - "Self-hosting third-party SDKs to eliminate external CDN dependency"
    - "INLINE_RUNTIME_CHUNK=false to achieve CSP compliance in CRA builds"

key-files:
  created:
    - "client/public/js/telegram-web-app.js — self-hosted Telegram Web App SDK (113KB)"
    - "client/.env — local dev env with INLINE_RUNTIME_CHUNK=false (gitignored)"
  modified:
    - "client/public/index.html — self-hosted SDK script tag + CSP meta tag"
    - "client/.env.example — INLINE_RUNTIME_CHUNK=false documented"
    - "server/index.js — Helmet contentSecurityPolicy enabled with strict directives"

decisions:
  - id: CS-02-self-host
    choice: "Self-host Telegram SDK at same origin instead of SRI hash on telegram.org CDN"
    rationale: "Telegram updates telegram-web-app.js in-place without versioned URLs — SRI would break unpredictably on Telegram's next deploy. Self-hosting pins SDK to a known version and eliminates the external CDN dependency entirely, providing stronger protection."
    alternatives: ["SRI hash on external CDN URL (rejected: breaks on Telegram updates)", "Remove SDK entirely (rejected: needed for Telegram Mini App context detection)"]
  - id: CSP-unsafe-eval-excluded
    choice: "No 'unsafe-eval' in script-src even though Phaser is in use"
    rationale: "Phaser 3.55.2 does not require eval — modern Phaser versions use no eval/Function constructor. Excluding 'unsafe-eval' maintains strict CSP without breaking gameplay."
  - id: CSP-unsafe-inline-styles
    choice: "'unsafe-inline' included in style-src"
    rationale: "React and Phaser apply inline styles extensively at runtime. Removing 'unsafe-inline' from style-src would require nonces or hashes on every dynamic style, which is out of scope for this plan."
  - id: CSP-meta-plus-header
    choice: "Both CSP meta tag (index.html) and Helmet CSP header (server)"
    rationale: "Defense in depth — the server primarily serves the Socket.IO API, not the React SPA. The meta tag protects the SPA regardless of CDN/reverse proxy header forwarding behavior. The Helmet header protects API responses directly."

metrics:
  duration: "12m"
  completed: "2026-02-22"
---

# Phase 05 Plan 02: Self-host Telegram SDK + Content Security Policy Summary

**One-liner:** Self-hosted Telegram SDK at same origin + strict CSP meta/header blocks script injection and eliminates external CDN dependency.

## What Was Built

### Task 1: Self-host Telegram SDK and add CSP meta tag (CS-02, CS-03 client-side)
- Downloaded `https://telegram.org/js/telegram-web-app.js` → `client/public/js/telegram-web-app.js` (113KB)
- Updated `client/public/index.html` to load SDK from `%PUBLIC_URL%/js/telegram-web-app.js` (same origin, no external CDN)
- Added `Content-Security-Policy` meta tag to `index.html`:
  - `script-src 'self'` — only same-origin scripts, no inline, no eval, no external CDN
  - `style-src 'self' 'unsafe-inline'` — React/Phaser inline styles permitted
  - `img-src 'self' data: blob:` — canvas/Phaser data URIs and blob URLs permitted
  - `connect-src` — explicit allowlist: Solana RPC (devnet + mainnet), Render server, localhost dev
  - `frame-src 'none'`, `object-src 'none'` — clickjacking and plugin defense
  - `base-uri 'self'` — prevents base tag injection
- Set `INLINE_RUNTIME_CHUNK=false` in `client/.env` and `client/.env.example` — prevents CRA from injecting inline runtime script (which would violate `script-src 'self'`)

### Task 2: Enable Helmet CSP on server (CS-03 server-side)
- Replaced `contentSecurityPolicy: false` in `server/index.js` with explicit directive configuration
- Same directive set as the meta tag, applied to all HTTP responses from the Express server
- No `unsafe-eval`, no `unsafe-inline` for scripts — strict by default

## Verification Results

| Check | Result |
|-------|--------|
| `client/public/js/telegram-web-app.js` exists and non-empty | PASS (113990 bytes) |
| No `telegram.org` CDN reference in `index.html` | PASS |
| `Content-Security-Policy` meta tag in `index.html` | PASS (1 result) |
| `contentSecurityPolicy: false` gone from `server/index.js` | PASS |
| `scriptSrc: ["'self'"]` present in `server/index.js` | PASS |
| `INLINE_RUNTIME_CHUNK=false` in `.env.example` | PASS |
| `node -c server/index.js` syntax check | PASS |
| `npm run build` succeeds | PASS |
| Build output has no inline `<script>` blocks | PASS (only `<script src=` references) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Client node_modules not installed in SolShot-clean**

- **Found during:** Task 1 build verification
- **Issue:** `client/node_modules/` contained only `.cache/` directory — dependencies never installed after BFG repo reclone
- **Fix:** Ran `npm install` in `client/` directory before build
- **Files modified:** `client/node_modules/` (gitignored)
- **Commit:** N/A (not committed — gitignored)

**2. [Rule 3 - Blocking] Build command was `react-scripts build` (wrong) — plan verification step used wrong command**

- **Found during:** Task 1 build verification
- **Issue:** Plan specified `npx react-scripts build` but `package.json` scripts use `react-app-rewired build` (required for webpack polyfills via config-overrides.js). Using `react-scripts` directly bypasses config-overrides.js and fails with missing crypto polyfill.
- **Fix:** Used `npm run build` (which calls `react-app-rewired build`) for verification
- **Files modified:** None
- **Commit:** N/A (execution correction only)

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `3ac70c3` | feat(05-02) | Self-host Telegram SDK and add CSP meta tag (CS-02, CS-03) |
| `a1ef821` | feat(05-02) | Enable Helmet CSP with strict script-src 'self' (CS-03) |

## Next Phase Readiness

- CSP baseline established — `script-src 'self'` is now the enforced policy
- Future features that load third-party scripts must self-host or use nonces (out of scope v1.1)
- The `client/.env` file with `INLINE_RUNTIME_CHUNK=false` is gitignored — must be set in any new dev environment manually (documented in `.env.example`)
- Render production deploy: no changes needed to `render.yaml` — Helmet CSP is applied at the Node.js level, not via static file serving
