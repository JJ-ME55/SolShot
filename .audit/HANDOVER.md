# Audit Handover

**Generated:** 2026-05-06
**Current Audit:** #2
**Previous Audit:** #1 — 2026-02-23 @ `ecfd03ba15f64bd17606ce16ab2a29dcbd0d7361`

---

<!-- DELTA_SUMMARY_START -->
## Delta Summary

**Previous ref:** `ecfd03ba15f64bd17606ce16ab2a29dcbd0d7361`
**Current ref:** `226c0cda826b095fac737dee0961e5c3c3749d37`
**Files changed:** 1 modified, 1 new, 0 deleted, 0 unchanged (excluding test files)

| File | Status | Magnitude | Notes |
|------|--------|-----------|-------|
| `programs/solshot-escrow/src/lib.rs` | MODIFIED | major | +247 / -140 lines. v1 evolved from 1v1-only to N-player (2-4) with `start_with_depositors`, `permissionless_reclaim`, expanded state machine. Feb S004 fix landed. |
| `programs/solshot-escrow-v2/src/lib.rs` | NEW | — | First appearance. 1020 LOC. N-player (2-10) with per-match snapshots, configurable fees, explicit duration model. Never audited. |
| `programs/solshot-escrow/tests/bok_litesvm.rs` | NEW | — | Test file — not an audit target (BOK Feb verification tests, kept for regression coverage). |
| `programs/solshot-escrow/tests/bok_proptest_fee.rs` | NEW | — | Test file — not an audit target. |
| `programs/solshot-escrow/tests/bok_proptest_space.rs` | NEW | — | Test file — not an audit target. |
| `programs/solshot-escrow/tests/bok_proptest_timestamp.rs` | NEW | — | Test file — not an audit target. |

### Massive Rewrite Detection

⚠ **Effective massive rewrite.** v1 changed by ~40% (387 of ~995 lines = ~39%) AND v2 is a brand-new 1020-LOC program. Of the 2 source files in scope: 100% are either NEW or MAJOR-MODIFIED.

**Decision:** Verification agents are SKIPPED for this audit. All previous findings are carried forward in this handover for evolution-tracking and Phase 4 hypothesis seeding only — they do not auto-translate to new findings. Phase 1 agents will analyze both files fresh, with the previous findings (especially the still-open H001 family and the H007 / H006 / H011 chain) as priors.

The companion document `Docs/PRIOR_AUDIT_DELTA.md` provides additional spot-checked context on which Feb findings have been addressed in code.
<!-- DELTA_SUMMARY_END -->

---

<!-- FINDINGS_DIGEST_START -->
## Previous Findings Digest

**Source:** `.audit-history/2026-02-23-ecfd03b/FINAL_REPORT.md`

### CONFIRMED Findings

| ID | Title | Severity | File | Relevance |
|----|-------|----------|------|-----------|
| S004 | PDA Namespace Pre-Squatting DoS | CRITICAL (CVSS 9.3) | `programs/solshot-escrow/src/lib.rs` | RECHECK — fix landed at v1:625 (`has_one = authority` on CreateMatch); confirm no regression and verify v2 has equivalent gating |
| S001 | Chain: authority takeover + fee redirect + winner fraud | CRITICAL (CVSS 8.7) | v1 update_config + settle_match | RECHECK — entry point H001 still open; chain partially mitigated by S004 fix |
| H001 | One-step authority transfer takeover | CRITICAL (CVSS 8.7) | v1 update_config | RECHECK — STILL OPEN per `PRIOR_AUDIT_DELTA.md`; v2 inherited the same gap (no pending_authority field) |
| H002 | Fee destination hijack via update_config | HIGH (CVSS 8.7*) | v1 update_config | RECHECK — STILL OPEN; v2 mitigates with per-match snapshots but root authority gap remains |
| H003 | update_config distinctness bypass → settlement DoS | HIGH (CVSS 8.7) | v1 update_config | RECHECK — needs re-validation on update path in both v1 + v2 |
| H005 | Authority winner selection fraud (POTENTIAL) | HIGH (CVSS 8.7) | v1 settle_match | RECHECK on v2 — N-player makes this more impactful (90% of larger pots) |
| H006 | 23-hour dead zone fund lockup | HIGH (CVSS 8.7) | v1 timeout constants | RECHECK — verify v1's TIMEOUT_SECONDS=600 + SETTLEMENT_TIMEOUT_SECONDS=3600 still create the gap; v2 uses different model (per-match deposit_window + match_end_ts + 24h grace) |
| H007 | Pause-as-griefing on active matches | HIGH (CVSS 8.7) | v1 cancel_match | RECHECK — STILL OPEN; cancel still has `constraint = !config.is_paused` at v1:729, v2:800 |
| H008 | CreateMatch PDA occupancy DoS | HIGH (CVSS 8.2) | v1 CreateMatch | RESOLVED_BY_FIX — `has_one = authority` at v1:625 closes this; verify v2 has equivalent |
| H011 | Config treasury self-redirect | HIGH (CVSS 8.7) | v1 update_config | RECHECK — STILL OPEN in v1 (live config read); v2 mitigates via snapshot but underlying authority gap remains |
| H014 | Authority collusion: settle to controlled winner (POTENTIAL) | HIGH (CVSS 8.7) | v1 create_match + settle_match | RECHECK — partially mitigated by S004 fix on v1; verify on v2 |
| S002 | Distinctness poison + pause double lock | HIGH (CVSS 8.7) | v1 update_config + cancel | RECHECK — both component findings (H003, H007) still relevant |
| H010 | Deposit ordering asymmetry | MEDIUM (CVSS ~5.5) | v1 deposit_wager / cancel | RECHECK — v2 has explicit deposit_window so first-depositor exposure differs |
| H016 | AwaitingDeposits cancel without depositing (rent theft) | LOW (CVSS ~2.5) | v1 CancelMatch (`close = caller`) | RECHECK — same `close = caller` pattern persists at v1:718, 745 and v2:748, 773 |
| H027 | Authority self-play bypass via secondary wallet (POTENTIAL) | MEDIUM (~5.0) | v1 OC-06 checks | RECHECK on v2 — same authority/player exclusion pattern |

### POTENTIAL Findings (carried forward)

H005, H009, H014, H017, H027 — all flagged with PR:H or design-limitation status in Feb. Each should be re-evaluated on v2's expanded surface (configurable BPS, per-match snapshot, partial-deposit settlement).

### Relevance Tags

- **RECHECK** — Finding is in a MODIFIED or NEW file. Fix may have landed, may have made it worse, or may have been parallelized to v2. High-priority investigation target.
- **RESOLVED_BY_FIX** — Finding was addressed in current code (verified via spot-check in `Docs/PRIOR_AUDIT_DELTA.md`).
- **RESOLVED_BY_REMOVAL** — Finding was in a deleted file. (None in this delta.)
<!-- FINDINGS_DIGEST_END -->

---

<!-- FALSE_POSITIVE_LOG_START -->
## Previous False Positive Log

Hypotheses from the Feb audit that were investigated and classified NOT_VULNERABLE on v1. Because v1 was MAJOR-MODIFIED and v2 is NEW, **every dismissal must be re-validated** — none of these can be auto-dropped.

| Hypothesis ID | File | One-Line Description | Feb Dismissal Reason | Status for #2 |
|---------------|------|---------------------|---------------------|---------------|
| H004 | v1 (MOD) | PDA close-and-revive | OC-10 drains funds before close | RE-VALIDATE on v1 + v2 |
| H012 | v1 (MOD) | Lamport underflow on cancel/reclaim | 3 layers: invariant + overflow-checks + runtime conservation | RE-VALIDATE — v2 has new refund-all flow |
| H013 | v1 (MOD) | PDA rent extraction at low wagers | Rent cycle economically neutral | RE-VALIDATE — v2's `close = caller` model differs |
| H015 | v1 (MOD) | Concurrent double-deposit by same player | Solana account locking + AlreadyDeposited flag | RE-VALIDATE on v2 deposit flow |
| H018 | v1 (MOD) | Zero-wager dead code | MIN_WAGER=10_000 enforced | LIKELY HOLDS — same constant in both v1 and v2 |
| H019 | v1 (MOD) | Narrowing cast overflow | u64 casts safe; ~131T SOL needed | LIKELY HOLDS but verify v2 introduced no new narrowing casts (pot scales with N-players) |
| H020 | v1 (MOD) | Clock drift at settlement deadline | 1-2s drift immaterial | RE-VALIDATE — v2 uses per-match deadlines; smaller windows possible? |
| H021 | v1 (MOD) | Permissionless reclaim during active pause | Intentional design (DCA-02 escape hatch) | RE-VALIDATE — v2's reclaim is on different timing model |
| H022 | v1 (MOD) | GlobalConfig re-initialization | Anchor `init` constraint prevents | LIKELY HOLDS in both |
| H023 | v1 (MOD) | PDA account revival after close | Re-created PDA fresh state | RE-VALIDATE on v2 |
| H024 | v1 (MOD) | Settlement deadline bypass via activated_at | activated_at always set on Active transition | RE-VALIDATE — v2 has different state set |
| H025 | v1 (MOD) | Match ID collision for PDA hijack | Server CSPRNG + Anchor init uniqueness | RE-VALIDATE — server-side off-chain, may be DB scope |
| H026 | v1 (MOD) | Escrow PDA lamport inflation (donation) | Attacker loses money — economically irrational | LIKELY HOLDS in both |
| H028 | v1 (MOD) | BPS constant manipulation via upgrade | Constants hardcoded; no runtime modification | **PARTIALLY INVALIDATED** in v2 — fee_bps_treasury / fee_bps_ops are now runtime-configurable. Must re-investigate. |
| H029 | v1 (MOD) | Error propagation in try_borrow_mut_lamports | TX atomicity ensures all-or-nothing | LIKELY HOLDS in both |
| H030 | v1 (MOD) | Cancel from AwaitingDeposits refund logic | Independent deposit flags checked correctly | RE-VALIDATE on v2 — `cancel_match` refund-all flow is new |
| S003 | v1 (MOD) | Authority == Treasury economic consolidation | Duplicate of H011 | DROP — merged with H011 |

**Token budget:** 17 entries (~3K tokens including header).

**Critical note on H028:** This dismissal is partially invalidated by v2 — the BPS values are no longer compile-time constants. Phase 4 must investigate "BPS update bypass" as a fresh hypothesis on v2.
<!-- FALSE_POSITIVE_LOG_END -->

---

<!-- ARCHITECTURE_SNAPSHOT_START -->
## Architecture Snapshot

Condensed from `.audit-history/2026-02-23-ecfd03b/ARCHITECTURE.md`. Phase 2 will rebuild this fresh against current code.

### Key Trust Boundaries (as of Feb)

- **Authority key** is the single root of trust for: winner selection, treasury/ops destinations, program pause/unpause. Hot-wallet model on devnet. Pre-mainnet decision: multisig or accept the risk. (Per JJ — intentional posture.)
- **Player wallets** sign their own deposits via `deposit_wager`. No custodial step.
- **Server** acts as the authority but ONLY for create/settle/cancel and pause/unpause. Server has no power to mint, mutate other matches, or extract funds outside the snapshotted destinations.
- **Permissionless reclaim** is an escape hatch — anyone can trigger refunds after timeout grace. Designed as a server-down failsafe.
- **Public roomId broadcast** (server side, off-chain): roomId is broadcast via WebSocket BEFORE escrow is created on-chain. Combined with ungated `create_match` (Feb), this enabled S004. After S004 fix (`has_one = authority`), only the server can create the escrow PDA.

### Critical Invariants (Feb-validated; status as of 2026-05-06)

1. **Pot conservation:** sum of refunds (cancel/reclaim) == sum of deposits, no leakage. ✅ Verified Feb in BOK; needs re-verification in v2 (N-player refund-all flow is new).
2. **90/7/3 split sums to ≤ pot:** integer-division floor never exceeds the pot. ✅ Feb BOK verified for v1; v2 has CONFIGURABLE BPS so range must be re-verified.
3. **State monotonicity:** Settled / Cancelled are terminal; no Settled → Active or Cancelled → Settled. ✅ Feb verified; v2 adds Pending state, expand check.
4. **Deposit deduplication:** mask bit set means player can't double-deposit. ✅ Feb verified for v1 u8 mask; v2 u16 mask same logic.
5. **Activation atomicity:** match transitions to Active only when all required deposits land OR (in v2) `start_with_depositors` is invoked by authority on partial fill. NEW v2 surface — verify.
6. **Authority is the only mutator of fee destinations** (config-mutating instructions). ✅ Feb verified; v2 introduces per-match snapshot which means runtime fee changes affect only NEW matches, not in-flight ones.
7. **No CPI to arbitrary programs** — only `system_program::transfer` for deposits, no other CPI. ✅ Feb verified; v2 same.
8. **Reclaim grace strictly after match end** — players cannot reclaim while match is still actionable. ✅ Feb verified for v1's 2x timeout; v2 uses different model (match_end_ts + 24h).

### Data Flow Assertions

- **Deposit path:** `deposit_wager` → `system_program::transfer(player → escrow_PDA)` → bit set in `deposits_mask` → on full mask, transition to `Active` and set `activated_at`. v2 also writes `match_end_ts = activated_at + duration_secs`.
- **Settle path:** `settle_match(authority, winner_pubkey)` → `winner ∈ escrow.players` constraint → 90/7/3 calc → `try_borrow_mut_lamports` direct lamport mutation → `close = authority` recovers PDA rent.
- **Cancel path:** caller can be authority (any time during AwaitingDeposits) OR any player (after timeout) → refund deposited players via `remaining_accounts` iteration → `close = caller` recovers PDA rent.
- **Reclaim path:** anyone calls after grace deadline → same refund + close-to-caller pattern as cancel.
<!-- ARCHITECTURE_SNAPSHOT_END -->

---

<!-- AUDIT_LINEAGE_START -->
## Audit Lineage

| # | Date | Git Ref | Confirmed | Potential | Files Scanned |
|---|------|---------|-----------|-----------|---------------|
| 1 | 2026-02-23 | `ecfd03b` | 12 | 5 | 1 (v1 only, 855 LOC) |
| 2 | 2026-05-06 | `226c0cd` | — | — | 2 (v1+v2, 1982 LOC) |
<!-- AUDIT_LINEAGE_END -->

---

**End of Handover**
