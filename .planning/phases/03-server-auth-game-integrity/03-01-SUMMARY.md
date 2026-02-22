---
phase: 03-server-auth-game-integrity
plan: 01
subsystem: auth
tags: [socket.io, authentication, authorization, turn-ownership, cross-room-isolation]

# Dependency graph
requires:
  - phase: 02-server-financial-security
    provides: requireAuth, validatePayload, validateFireParams, safeHandler already imported in main.js
provides:
  - requireAuth guards on all 12 previously-unguarded game-state/financial socket handlers
  - Conditional auth for wagered joinQueue events
  - Inline isAuthenticated check on fire handler (SA-01)
  - Turn ownership enforcement on stepLeft/stepRight (SA-05)
  - Cross-room isolation on escrowDepositConfirm (SA-06)
affects:
  - 03-02 (session fixation / rejoinRoom auth)
  - 03-03 (rate limiting / further handler hardening)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireAuth(client, eventName) as first line in all state-mutating socket handlers"
    - "Conditional auth: if (wagerAmount > 0 && !requireAuth(...)) for mixed-auth handlers"
    - "Inline this.isAuthenticated check in safeHandler context (fire) where requireAuth emits wrong error event"
    - "SA-05 pattern: if (ms && ms.currentTurn && ms.currentTurn !== client.id) return — mirrors fire handler"
    - "SA-06 pattern: client.roomId !== rid guard for client-supplied roomId payloads"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "joinQueue auth is conditional (wagerAmount > 0 only) — practice matches don't require wallet auth"
  - "fire handler uses inline this.isAuthenticated check (not requireAuth) because fireRejected != fireError naming convention"
  - "SA-06 scope is escrowDepositConfirm only — all other handlers use server-set client.roomId, not client-supplied roomId"
  - "SA-05 guard placed after validateAction check so state-invalid moves are caught before turn-ownership check (correct ordering)"

patterns-established:
  - "requireAuth first: auth check is FIRST line in every state-mutating handler (before payload guards)"
  - "safeHandler inline auth: when handler uses this instead of client, check this.isAuthenticated inline and emit event-specific rejection"
  - "Cross-room isolation: any handler accepting client-supplied roomId must validate client.roomId === rid before processing"

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 3 Plan 1: Server Auth Game Integrity Summary

**requireAuth guards on 12 unguarded socket handlers + turn ownership on step handlers + cross-room escrow isolation (SA-01/SA-05/SA-06)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T09:38:08Z
- **Completed:** 2026-02-22T09:40:25Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- 12 previously-unguarded game-state handlers now require authentication before processing (SA-01)
- Fire handler gets inline `this.isAuthenticated` check matching its `fireRejected` error convention
- joinQueue requires auth only when `wagerAmount > 0` — free practice still accessible unauthenticated
- stepLeft and stepRight reject moves when `ms.currentTurn !== client.id` — opponent cannot move during your turn (SA-05)
- escrowDepositConfirm rejects events where `client.roomId !== rid` — cross-room event injection blocked (SA-06)
- main.js passes Node.js syntax check with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add requireAuth guards to all unguarded game-state handlers (SA-01)** - `21477ec` (feat)
2. **Task 2: Add turn ownership to step handlers (SA-05) and cross-room isolation (SA-06)** - `a41323d` (feat)

## Files Created/Modified

- `server/socket-io/main.js` - Added 30 lines of auth/ownership/isolation guards across 14 handlers

## Decisions Made

- **joinQueue conditional auth:** Only wagered matches require authentication (`wagerAmount > 0`). This preserves free practice/quick match access for unauthenticated players while blocking unauthenticated wager injection. Placed after `validateMatchMode` so mode is validated before auth check.
- **fire inline auth:** `safeHandler` binds `this` = socket instead of `client`. Using `requireAuth(this, 'fire')` would emit `fireError` but the fire handler protocol uses `fireRejected`. Inline `!this.isAuthenticated` check preserves correct event naming.
- **SA-06 escrowDepositConfirm only:** All other handlers read `client.roomId` (server-set on join). Only `escrowDepositConfirm` accepts `roomId` from client payload targeting its own room — the unique cross-room attack surface for H009.
- **SA-05 check ordering:** Turn ownership placed AFTER `validateAction` — state-invalid moves caught first, then turn ownership. Mirrors pattern already used in fire handler.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 14 handlers are now auth-gated (SA-01 complete)
- Turn ownership enforced on step handlers (SA-05 complete)
- Cross-room isolation on escrow handler (SA-06 complete)
- Ready for 03-02: rejoinRoom auth hardening (SA-02) and session fixation prevention
- No blockers

---
*Phase: 03-server-auth-game-integrity*
*Completed: 2026-02-22*
