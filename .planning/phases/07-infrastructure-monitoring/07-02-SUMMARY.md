---
phase: 07-infrastructure-monitoring
plan: 02
subsystem: logging, terrain
tags: [pino, logging, redaction, csprng, terrain-seed, security]

# Dependency graph
requires:
  - phase: 07-infrastructure-monitoring/01
    provides: Base infrastructure security (IM-01, IM-02, IM-03)
provides:
  - Pino structured logger with sensitive field redaction (server/services/logger.js)
  - 9 sensitive console.log calls replaced with logger.info (wallet/address/balance removed from output)
  - 128-bit CSPRNG terrain seed replacing 20-bit randomInt
affects:
  - 08-verification-re-audit (auditors will verify IM-04, IM-05 closed)

# Tech tracking
tech-stack:
  added:
    - "pino (structured JSON logger)"
    - "pino-pretty (dev dependency — human-readable log output)"
  patterns:
    - "Pino redact paths API — wallet/address fields auto-censored in structured log objects"
    - "crypto.randomBytes(16) → parseInt(slice(0,8),16)>>>0 for 32-bit PRNG seed from 128-bit entropy"

key-files:
  created:
    - server/services/logger.js
  modified:
    - server/services/shot-token.js
    - server/services/solana.js
    - server/services/escrow.js
    - server/socket-io/main.js
    - server/package.json

key-decisions:
  - "IM-04: Pino logger with redact paths for wallet/address/balance fields — censor: '[REDACTED]'"
  - "IM-04: Sensitive values omitted from message string entirely — redact only applies to structured object arg"
  - "IM-04: 9 specific console.log calls replaced; non-sensitive logs left as console.log"
  - "IM-04: Partial wallet exposure via .slice(0,8) also classified as a leak (main.js:2237)"
  - "IM-05: crypto.randomBytes(16) for 128-bit entropy; parseInt(slice(0,8),16)>>>0 for 32-bit mulberry32 seed"
  - "IM-05: Full 128-bit hex string stored in room.terrainSeed and emitted to client (client does not use seed for terrain regeneration)"
  - "pino-pretty as devDependency — only used when NODE_ENV !== 'production'"

patterns-established:
  - "logger.info({ structuredData }, 'message') — never interpolate sensitive values into message string"
  - "128-bit CSPRNG seed → 32-bit PRNG derivation pattern for mulberry32-compatible generation"

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 7 Plan 02: Structured Logging & Terrain Seed Entropy Summary

**Added pino logger with sensitive field redaction, replaced 9 console.log calls leaking wallet/address/balance data, and upgraded terrain seed from 20-bit randomInt to 128-bit CSPRNG (IM-04, IM-05)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-23
- **Completed:** 2026-02-23
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- IM-04 closed: `server/services/logger.js` created with pino and `redact` config for wallet/address/balance field paths; 9 sensitive `console.log` calls replaced with `logger.info` across shot-token.js, solana.js, escrow.js, and main.js — wallet addresses, balances, and partial address slices no longer appear in stdout
- IM-05 closed: Terrain seed generation upgraded from `crypto.randomInt(1000000)` (~20 bits) to `crypto.randomBytes(16)` (128 bits); 32-bit unsigned integer derived via `parseInt(fullSeed.slice(0,8), 16) >>> 0` for mulberry32 PRNG compatibility; full hex string stored and emitted

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pino logger with redaction and replace sensitive log calls (IM-04)** — `7c503b4` (feat)
2. **Task 2: Increase terrain seed entropy to 128 bits (IM-05)** — `0bad1d9` (feat)

## Files Created/Modified

- `server/services/logger.js` — NEW: Pino logger singleton with redact paths for wallet/address/balance fields
- `server/services/shot-token.js` — 2 console.log calls replaced with logger.info (lines 177, 376)
- `server/services/solana.js` — 3 console.log calls replaced with logger.info (settlements + refund)
- `server/services/escrow.js` — 1 console.log call replaced with logger.info (settled match)
- `server/socket-io/main.js` — 3 console.log calls replaced with logger.info (auth, prestige, stats persistence); terrain seed upgraded to 128-bit CSPRNG
- `server/package.json` — pino added to dependencies, pino-pretty to devDependencies

## Decisions Made

- **Sensitive values omitted from message strings:** Pino's `redact` only works on structured object arguments. Wallet addresses and balances are excluded from the message string entirely, not just redacted.
- **Partial wallet exposure classified as leak:** `winnerAddr?.slice(0,8)` in stats persistence log was treated as a sensitive leak per research anti-pattern guidance.
- **Non-sensitive logs unchanged:** Console.log calls for server startup, Solana connection, escrow config, and non-wallet on-chain refund logs remain as-is.
- **pino-pretty as devDependency:** Only activates when NODE_ENV !== 'production'. Production logs are JSON for machine parsing.
- **128-bit seed → 32-bit derivation:** mulberry32 PRNG uses `s |= 0` which truncates to 32-bit signed; `>>> 0` ensures unsigned interpretation. First 4 bytes (8 hex chars) provide the 32-bit seed value.
- **Client seed type change safe:** Client receives `seed` in terrainGenerated event but only uses `path`, `heightmap`, `tankPositions`, and `wind` — changing seed from number to hex string has no functional impact.

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

- Executor context ran out after committing Task 1 but before committing Task 2. Terrain seed changes were staged but uncommitted. Orchestrator completed Task 2 commit manually.

## Next Phase Readiness

- All 5 infrastructure/monitoring findings (IM-01 through IM-05) now closed
- Phase 7 complete — ready for Phase 8: Verification & Re-Audit
- Structured logging provides foundation for future observability enhancements

---
*Phase: 07-infrastructure-monitoring*
*Completed: 2026-02-23*
