---
phase: 01-on-chain-program-redesign
plan: 02
subsystem: payments
tags: [anchor, solana, escrow, idl, rust, solana-program, pda, config]

# Dependency graph
requires:
  - phase: 01-on-chain-program-redesign/01-01
    provides: "Rewritten lib.rs with GlobalConfig PDA, 8 instructions, activated_at field, 10 new error codes"
provides:
  - "Updated server/idl/solshot_escrow.json generated from anchor build — 8 instructions, GlobalConfig type, activated_at, new errors"
  - "Updated server/services/escrow.js passing config PDA to all 4 economic instruction calls"
  - "getConfigPDA() function deriving [b'config'] PDA in server service"
  - "initializeConfig(), pauseProgram(), unpauseProgram(), updateConfig(), getConfigState() admin wrappers"
  - "getEscrowState() now returns activatedAt field for OC-07 settlement timeout"
affects:
  - 02-server-financial-security
  - 04-secrets-key-management
  - integration testing (Plan 03+)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config PDA pattern: getConfigPDA() derives [b'config'] singleton, passed to all program instructions"
    - "IDL-first: anchor build generates authoritative IDL; server/idl is always a copy of target/idl"
    - "Admin wrapper pattern: all config management operations have server-side wrapper functions with consistent try/catch/{success,error} returns"

key-files:
  created: []
  modified:
    - server/idl/solshot_escrow.json
    - server/services/escrow.js
    - Anchor.toml

key-decisions:
  - "anchor build succeeded on Windows — IDL generated from actual compilation, not hand-edited"
  - "PROGRAM_ID kept at old devnet ID (CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD) until actual redeploy in future plan"
  - "Trailing re-export of getConfigPDA removed (duplicate export error) — function is already a named export"

patterns-established:
  - "getConfigPDA(): always call this to get config PDA, never derive manually in callers"
  - "All instruction .accounts() calls now include config: configPDA — mandatory for pause guard"
  - "initializeConfig() must be called once immediately after fresh program deploy (OC-01)"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 01 Plan 02: Build + IDL + escrow.js Summary

**anchor build generated updated 8-instruction IDL with GlobalConfig PDA; escrow.js now passes config PDA to all create/deposit/settle/cancel calls with full admin wrapper suite (OC-14)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-21T18:39:46Z
- **Completed:** 2026-02-21T18:43:14Z
- **Tasks:** 2
- **Files modified:** 3 (server/idl/solshot_escrow.json, server/services/escrow.js, Anchor.toml)

## Accomplishments

- `anchor build` succeeded on Windows, compiling the rewritten lib.rs and generating the IDL at `target/idl/solshot_escrow.json`
- IDL copied to `server/idl/solshot_escrow.json` — contains 8 instructions (was 4), GlobalConfig account type, activated_at field in MatchEscrow, MatchSettled event with treasury_account/ops_account, and 19 total error codes (10 new)
- `server/services/escrow.js` fully updated: getConfigPDA(), initializeConfig(), updateConfig(), pauseProgram(), unpauseProgram(), getConfigState() added; all 4 economic instructions now pass config PDA; getEscrowState() returns activatedAt

## Task Commits

Each task was committed atomically:

1. **Task 1: Build program and generate updated IDL** - `92933d4` (chore)
2. **Task 2: Update escrow.js for config PDA integration** - `55b3ebd` (feat)

**Plan metadata:** (committed below)

## Files Created/Modified

- `server/idl/solshot_escrow.json` — Updated IDL from anchor build: 8 instructions (initialize_config, update_config, pause_program, unpause_program added), GlobalConfig account type, activated_at in MatchEscrow, treasury_account/ops_account in MatchSettled event, 10 new error codes
- `server/services/escrow.js` — Config PDA integration: getConfigPDA(), admin wrappers (initializeConfig/updateConfig/pauseProgram/unpauseProgram/getConfigState), all 4 economic instructions pass config PDA, getEscrowState returns activatedAt
- `Anchor.toml` — Added OC-14 deploy checklist comment above [programs.localnet]

## Decisions Made

- **anchor build used (not manual IDL):** The build succeeded on Windows with only warnings (expected cfg conditions from macro expansion). IDL is generated from actual compilation — authoritative and correct.
- **PROGRAM_ID unchanged:** Kept at `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` per plan instructions. Fresh deploy with new program ID is a future step (OC-14 deploy checklist).
- **Duplicate export fixed:** The plan template showed `export { PROGRAM_ID, getConfigPDA }` at the end, but `getConfigPDA` was already declared as `export function getConfigPDA()`. Removed the duplicate from the trailing re-export to fix the syntax error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate export of getConfigPDA**
- **Found during:** Task 2 verification (`node --check`)
- **Issue:** Plan template showed `export { PROGRAM_ID, getConfigPDA }` at bottom of file, but `getConfigPDA` is already exported inline as `export function getConfigPDA()`. Node.js threw `SyntaxError: Duplicate export of 'getConfigPDA'`.
- **Fix:** Changed trailing export to `export { PROGRAM_ID }` only — getConfigPDA remains accessible via its inline export declaration.
- **Files modified:** server/services/escrow.js
- **Verification:** `node --input-type=module --check` prints "Syntax OK"
- **Committed in:** 55b3ebd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan template)
**Impact on plan:** Single-line fix. No scope change.

## Issues Encountered

None — anchor build succeeded with warnings only (all warnings are expected false positives from Anchor 0.32.1 macro expansion on Windows; they don't affect compilation or IDL generation).

## User Setup Required

None — no external service configuration required for this plan.

## Next Phase Readiness

- **Integration layer complete:** server/idl/solshot_escrow.json and server/services/escrow.js are fully updated and compatible with the rewritten program
- **Ready for Plan 03:** End-to-end integration testing (create → deposit → settle flow) can now proceed
- **Deploy blocker:** The actual deploy to a new program ID (and calling initializeConfig() after) is required before any live escrow instructions will work. This is tracked as OC-14 deploy checklist.
- **Config not yet initialized:** After a fresh program deploy, `initializeConfig()` must be called once with authority/treasury/ops addresses before any match can be created

---
*Phase: 01-on-chain-program-redesign*
*Completed: 2026-02-21*
