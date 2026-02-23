---
phase: 07-infrastructure-monitoring
plan: 01
subsystem: infra
tags: [render, express, socket-io, middleware, security, npm-ci, ip-limiting]

# Dependency graph
requires:
  - phase: 04-secrets-key-management
    provides: ADMIN_API_KEY env var and KM-05 inline auth check on /api/admin/reload-keys
provides:
  - Secure build pipeline (npm ci --ignore-scripts in render.yaml)
  - requireAdminKey Express middleware in guards.js
  - Auth-guarded /stats endpoint (x-admin-key header required)
  - Per-IP Socket.IO connection limiter (MAX_CONNECTIONS_PER_IP = 100)
affects:
  - 07-02 (next plan in this phase — further monitoring work)
  - 08-verification-re-audit (auditors will verify IM-01, IM-02, IM-03 closed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireAdminKey Express middleware in guards.js — reusable across any admin HTTP route"
    - "io.use() Map-based per-IP counter — x-forwarded-for extraction for Render reverse proxy"
    - "npm ci --ignore-scripts in Render buildCommand — supply-chain safe build"

key-files:
  created: []
  modified:
    - render.yaml
    - server/middleware/guards.js
    - server/index.js

key-decisions:
  - "IM-01: npm ci --ignore-scripts — deterministic lock-file install, lifecycle scripts suppressed"
  - "IM-02: requireAdminKey as middleware in guards.js (not inline in monitoring.js) — DRY, consistent with existing guards pattern"
  - "IM-02: /api/admin/reload-keys refactored to use requireAdminKey middleware — inline auth check removed"
  - "IM-03: MAX_CONNECTIONS_PER_IP = 100 (audit success criterion threshold)"
  - "IM-03: x-forwarded-for first, socket.handshake.address fallback — Render is a reverse proxy"
  - "IM-03: io.use() placed after socket.Server init, before mainsocket(io) — middleware must precede connection handler"
  - "/health intentionally left unauthenticated — Render healthCheckPath requires public access"

patterns-established:
  - "requireAdminKey: Express middleware pattern for x-admin-key auth — same safe-default logic (missing ADMIN_API_KEY → 401)"
  - "Per-IP Socket.IO limiting: Map counter incremented on connect, decremented on disconnect, entry deleted when count reaches 0"

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 7 Plan 01: Infrastructure Security Hardening Summary

**Secured Render build pipeline with npm ci --ignore-scripts, auth-guarded /stats via reusable requireAdminKey middleware, and added per-IP Socket.IO connection limiter at 100 connections (IM-01, IM-02, IM-03)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T13:12:05Z
- **Completed:** 2026-02-23T13:14:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- IM-01 closed: `render.yaml` buildCommand changed from `npm install` to `npm ci --ignore-scripts` — deterministic lock-file install, lifecycle scripts suppressed (supply-chain attack vector eliminated)
- IM-02 closed: `requireAdminKey` Express middleware added to `server/middleware/guards.js`; applied to `/stats` route; `/api/admin/reload-keys` refactored from inline check to middleware (DRY); `/health` remains public for Render health checker
- IM-03 closed: `io.use()` middleware with `Map`-based per-IP counter added after `socket.Server` init and before `mainsocket(io)`; uses `x-forwarded-for` for proxy-aware IP extraction; connections >= 100 from same IP receive `Error('connection limit exceeded')`

## Task Commits

Each task was committed atomically:

1. **Task 1: Secure build command and authenticate /stats endpoint (IM-01, IM-02)** - `eb7bd22` (feat)
2. **Task 2: Add per-IP Socket.IO connection limiting (IM-03)** - `24b2d7c` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `render.yaml` - buildCommand: npm install → npm ci --ignore-scripts
- `server/middleware/guards.js` - Added `requireAdminKey` Express middleware with section header; updated module JSDoc
- `server/index.js` - Imported `requireAdminKey`; applied to `/stats` and `/api/admin/reload-keys`; added IM-03 `io.use()` connection limiter block

## Decisions Made

- **requireAdminKey in guards.js (not monitoring.js or standalone file):** guards.js is the established location for reusable server security middleware. Adding here keeps all auth guards co-located and consistent with the existing pattern.
- **Refactored /api/admin/reload-keys to use middleware:** The inline auth check (3 lines) was identical to the new middleware. DRY principle applied — one auth implementation, two routes.
- **MAX_CONNECTIONS_PER_IP = 100:** Matches the plan's stated success criterion ("more than 100 connections from a single IP are rejected"). Connection 101+ is rejected; connection 100 is accepted.
- **x-forwarded-for over socket.handshake.address:** Render is a reverse proxy; `socket.handshake.address` returns Render's internal load balancer IP, making all clients appear as the same IP. `x-forwarded-for` carries the real client IP.
- **split(',')[0].trim():** Standard pattern for extracting leftmost (original client) IP from a forwarded chain that may contain intermediate proxy IPs.
- **io.use() placement:** Registered immediately after `new socket.Server(...)`, before `mainsocket(io)`. Socket.IO middleware must be registered before `io.on('connection')` handler to intercept connections.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. `ADMIN_API_KEY` env var was already configured in Render via Phase 4 (`sync: false` in `render.yaml`).

## Next Phase Readiness

- IM-01, IM-02, IM-03 are fully closed — ready for audit verification in Phase 8
- Phase 7 Plan 02 (IM-04 structured logging + IM-05 terrain seed entropy) is unblocked and independent
- `/stats` now requires `x-admin-key` header — any tooling or scripts that poll `/stats` must include the header

---
*Phase: 07-infrastructure-monitoring*
*Completed: 2026-02-23*
