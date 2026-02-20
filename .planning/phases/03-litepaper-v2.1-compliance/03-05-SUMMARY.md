---
phase: 03-litepaper-v2.1-compliance
plan: 05
subsystem: infra
tags: [solana, multisig, squads, treasury, governance, escrow]

# Dependency graph
requires:
  - phase: 03-litepaper-v2.1-compliance
    provides: escrow program with 90/7/3 BPS split routing 7% to TREASURY_WALLET
provides:
  - Treasury multisig governance documentation for LP-09
  - Actionable ops steps for Squads Protocol multisig setup before mainnet
affects: [06-mainnet-deployment, ops-team]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/03-litepaper-v2.1-compliance/TREASURY-GOVERNANCE.md
  modified: []

key-decisions:
  - "LP-09 is an ops-only task — the escrow program already routes 7% to TREASURY_WALLET; no code changes are needed"
  - "Squads Protocol recommended as the Solana multisig standard; Realms is a valid alternative"
  - "Treasury multisig deferred to Phase 6 (mainnet prep); acceptable to skip for devnet testing"

patterns-established: []

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 3 Plan 05: Treasury Multisig Governance Summary

**LP-09 treasury governance documented: Squads Protocol multisig required before mainnet; TREASURY_WALLET env var is the only configuration needed — escrow routing already implemented**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T07:56:22Z
- **Completed:** 2026-02-20T07:58:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created TREASURY-GOVERNANCE.md documenting the LP-09 requirement from Litepaper v2.1
- Confirmed that no code changes are needed — the escrow program already routes 7% to `TREASURY_WALLET`
- Provided operations team with step-by-step Squads Protocol multisig setup instructions
- Set clear timeline: multisig must be configured before Phase 6 (mainnet deployment)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create treasury governance documentation** - `f25e91d` (docs)

**Plan metadata:** included in task commit (single-task plan)

## Files Created/Modified

- `.planning/phases/03-litepaper-v2.1-compliance/TREASURY-GOVERNANCE.md` - Treasury multisig governance requirement, current state, ops action steps, and timeline

## Decisions Made

- LP-09 requires no code changes. The Anchor escrow program (`programs/solshot-escrow/src/lib.rs`) already hardcodes 90/7/3 BPS split and routes the 7% to the `TREASURY_WALLET` env var address. This is purely an operations task.
- Squads Protocol (https://squads.so/) is the recommended multisig solution — it is the Solana ecosystem standard. Realms is a valid alternative.
- Multisig setup is deferred to Phase 6 (mainnet prep). For devnet testing, `TREASURY_WALLET` can remain unset — the server handles null gracefully in dev mode.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required at this point. Configuration steps are documented in TREASURY-GOVERNANCE.md for the operations team to execute before mainnet deployment.

## Next Phase Readiness

- Phase 3 plan 05 is the final plan in Phase 3 (Litepaper v2.1 Compliance)
- Plans 03-01 through 03-04 handle the actual code changes (wager tiers, matchmaking, SHOT milestones, movement enforcement, forfeit rule)
- LP-09 documentation is complete — operations team can create the Squads multisig when ready and set `TREASURY_WALLET` in Render dashboard
- No blockers for Phase 4 (Security Audit) from this plan

---
*Phase: 03-litepaper-v2.1-compliance*
*Completed: 2026-02-20*
