---
phase: 03-server-auth-game-integrity
plan: 03
subsystem: auth
tags: [ed25519, nacl, signature-verification, reconnect, socket-io, solana-wallet]

# Dependency graph
requires:
  - phase: 03-01
    provides: auth middleware (handleAuthenticate, verifyWalletSignature, verifyAuthMessage) and isAuthenticated pattern on socket clients
  - phase: 03-02
    provides: server-authoritative position and terrain hardening (SA-03/SA-04)
provides:
  - Ed25519 signature re-verification in rejoinRoom handler before restoring isAuthenticated (SA-02)
  - Client attemptRejoin that signs a fresh message before emitting rejoinRoom
affects:
  - 04-secrets-key-management
  - 08-verification-re-audit

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SA-02 rejoin auth: same nacl/verifyWalletSignature path used in initial authenticate — zero new crypto primitives"
    - "Retry-once pattern: attemptRejoin._retried flag prevents infinite retry loops when wallet adapter initializes slowly"
    - "verifyAuthMessage before verifyWalletSignature: cheap format/timestamp check first, expensive crypto second"

key-files:
  created: []
  modified:
    - server/socket-io/main.js
    - client/src/App.js

key-decisions:
  - "SA-02: Import verifyAuthMessage + verifyWalletSignature directly in rejoinRoom — reuse existing auth primitives, no new crypto"
  - "SA-02: Emit rejoinError on verification failure but do NOT clear disconnectTimers — legitimate player may retry within 30s window"
  - "SA-02: Client retry-once after 2s on missing signMessage — covers async wallet adapter init on cold page load"
  - "SA-02: Message format matches WalletContext.authenticate() exactly (SolShot Auth: <wallet> at <timestamp>) — server verifyAuthMessage reused as-is"

patterns-established:
  - "Re-authentication on reconnect: same Ed25519 proof-of-ownership as initial login — walletAddress alone never trusted"
  - "Signature-first guard: verify before any state lookup — avoids leaking pendingReconnects membership to unauthenticated callers"

# Metrics
duration: 1min
completed: 2026-02-22
---

# Phase 3 Plan 03: Server Auth & Game Integrity (03-03) Summary

**Ed25519 re-verification gates the rejoinRoom handler so wallet address alone no longer restores isAuthenticated — session hijack of disconnected players (H006) closed.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-22T09:46:59Z
- **Completed:** 2026-02-22T09:48:05Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Server rejoinRoom handler now requires signed Ed25519 proof before restoring any session state
- Disconnect timer is preserved on failed verification — legitimate player retains their 30s rejoın window
- Client attemptRejoin signs a fresh message (matching WalletContext.authenticate() format) and sends `{ walletAddress, message, signature, timestamp }` to server
- Wallet-not-ready edge case handled: single delayed retry (2s) with `_retried` flag prevents infinite loops

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Ed25519 verification to server rejoinRoom handler** - `f6900cf` (feat)
2. **Task 2: Update client attemptRejoin to sign message before emitting** - `d7cee19` (feat)

**Plan metadata:** see docs commit below

## Files Created/Modified
- `server/socket-io/main.js` - Added `verifyAuthMessage` + `verifyWalletSignature` imports; rewrote rejoinRoom to verify signature before pendingReconnects lookup; changed handler to `async`
- `client/src/App.js` - Replaced sync `attemptRejoin` with async version that signs a message via `window.solWallet.signMessage` before emitting `rejoinRoom`

## Decisions Made
- **Don't clear disconnect timer on failed verification** — an attacker submitting a forged payload should not cancel the legitimate player's 30s rejoin window. Timer cleanup happens only after successful verification + pending lookup.
- **Signature-first guard ordering** — verify before any pendingReconnects lookup to avoid leaking membership (whether a wallet has an active pending rejoin) to unauthenticated callers.
- **Retry-once pattern** — `attemptRejoin._retried` boolean flag allows a single 2-second retry if `window.solWallet.signMessage` is not yet available (wallet adapter initializes async on cold page load).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (03-server-auth-game-integrity) is now fully complete: SA-01/SA-05/SA-06 (03-01), SA-03/SA-04 (03-02), SA-02 (03-03)
- All three socket auth attack surfaces closed: initial auth guard, terrain/position authority, and rejoin session hijack
- Phase 4 (secrets/key management) can proceed — no blockers from Phase 3

---
*Phase: 03-server-auth-game-integrity*
*Completed: 2026-02-22*
