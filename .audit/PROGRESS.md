# Stronghold of Security — Audit Progress

**Audit ID:** sos-solshot-v1-mainnet-rc1-2026-05-28
**Audit #:** 3 (stacked on #2)
**Started:** 2026-05-28
**Tier:** standard
**Codebase:** SolShot Escrow (programs/solshot-escrow/src/lib.rs + programs/solshot-escrow-v2/src/lib.rs)
**Git ref:** `fabb8e1` (tag `v1-mainnet-rc1`)

## Phase Progress

| Phase | Command | Status | Output |
|-------|---------|--------|--------|
| Scan | `/SOS:scan` | ✅ Completed | KB_MANIFEST.md, HOT_SPOTS.md, INDEX.md, HANDOVER.md |
| Analyze | `/SOS:analyze` | ✅ Completed | context/01-08 (7 files, 285 KB) |
| Strategize | `/SOS:strategize` | ✅ Folded into Phase 1 | — |
| Investigate | `/SOS:investigate` | ✅ Folded into Phase 1 | — |
| Report | `/SOS:report` | ✅ Completed | FINAL_REPORT.md (917 lines, 64 KB) |

## Headline Verdict

**CONDITIONAL GO for mainnet flip** — with 3 must-fix items + Squads-from-day-one multisig.

### What changed from audit #2 (BLOCK MAINNET) to audit #3 (CONDITIONAL GO):

**Prior CRITICALs:**
- H023 (CVSS 9.3 partial-refund theft) → ✅ RESOLVED (IncompleteRefund gate at all 4 sites + proptest regression)
- H001 (CVSS 8.7 one-step authority) → ✅ RESOLVED (propose/accept implementation)
- H044/H046 (single hot wallet operational) → ⏳ CARRY-FORWARD (Squads mitigation planned)

**Prior HIGHs:**
- 6 RESOLVED (H011, H030, H032 by timelock; H016, H009 by pause-guard removal; H025 by !executable; H039 by 24h cap; H035 v1 by constant unification)
- H024 STILL OPEN (non-contiguous deposits_mask)
- v1-specific findings (H017) now irrelevant since v1 doesn't ship to mainnet
- Design-limit findings (H002 H003 H006 H007) remain operationally bounded by trust in authority key

### Top 3 pre-mainnet must-fixes (in order):
1. **N001 one-liner** at `programs/solshot-escrow-v2/src/lib.rs:154` — wrap `cfg.pending_config_ts = now` in `if cfg.pending_config_ts == 0` guard. Without this, a compromised authority can defer the 24h timelock indefinitely.
2. **N002 migrate_config** — feature-gate or delete before mainnet build. Devnet migration is done; this code is unnecessary surface on mainnet.
3. **Squads multisig at deploy** — Layer-1 upgrade auth + GlobalConfig.authority both go to Squads PDA(s) from genesis.



## Audit #3 Focus (Bundle 1 deltas since audit #2)

Bundle 1 was specifically designed to address audit #2's CRITICAL #4 (H001 one-step authority transfer) and several HIGH findings (H002/H011/H030/H032 — fee/treasury rotation chains). The new code adds:
- `propose_authority` / `accept_authority` — two-step rotation
- `update_config` rewrite — writes to pending_* fields
- `apply_config_update` — permissionless apply after 24h timelock
- `migrate_config` — devnet PDA realloc 110 → 231 bytes (UncheckedAccount + manual realloc)
- 7 new GlobalConfig fields (pending_*, last_config_update_ts)

**Phase 1 must answer:**
1. Does the new propose/accept mechanism fully resolve H001? Any new takeover paths?
2. Does the timelock close H002/H011/H030/H032? Edge cases (clock_skew, near-boundary)?
3. Is the migrate_config UncheckedAccount + manual realloc safe? Re-entry / race / corrupt state?
4. Does ApplyConfigUpdate's lack of `has_one` open any DoS or griefing vectors?
5. Does AcceptAuthority's reliance on `pending == new_authority.key()` (no `has_one`) work correctly under concurrent propose_authority races?

**Audit #2 findings still active (carried forward):**
- H023 (CRITICAL, CVSS 9.3) — partial-refund theft via close=caller sweep. Bundle 1 does NOT touch refund loops. **PRIMARY PRE-MAINNET BLOCKER.**
- H044 (CRITICAL) — single hot wallet L1+L2. Mitigation deferred to Squads multisig at mainnet deploy.
- H046 (CRITICAL) — Layer-1 bytecode replacement. Same Squads mitigation.

## Last Updated
2026-05-28T17:30:00Z
