# Audit Handover

**Generated:** 2026-05-28
**Current Audit:** #3 (Stronghold of Security)
**Previous Audit:** #2 — 2026-05-07 @ `226c0cda826b095fac737dee0961e5c3c3749d37`
**Audit Before That:** #1 — 2026-02-23 @ `ecfd03ba15f64bd17606ce16ab2a29dcbd0d7361`
**Current Ref:** `fabb8e1b6e516c69a507c3aac979fbc41efc8574` (tag `v1-mainnet-rc1`)

---

## Stacking Notes

This audit STACKS on Audit #2. Audit #2 produced a complete fresh sweep of both v1 and v2 (50 strategies, 22 confirmed). Carry-forward policy here:

- **v1 (`solshot-escrow`):** modest delta (+97 lines). Most v1 findings should re-verify against the new code; the deltas are mostly defense-in-depth fixes (H016/H043 family). **v1 did NOT receive Bundle 1** — H001 remains structurally open in v1.
- **v2 (`solshot-escrow-v2`):** massive delta (+449 lines, Bundle 1 governance rewrite). Verification agents SHOULD NOT be skipped; Phase 1 should re-derive context for the new instructions, but the unmodified instruction bodies (settle, cancel, reclaim, deposit, create) can use prior findings as seeded priors.
- Operational findings (H044/H046) do NOT depend on source changes — re-verify against current devnet/mainnet config.

---

## Delta Summary

| File | Status | Magnitude | Notes |
|------|--------|-----------|-------|
| `programs/solshot-escrow/src/lib.rs` | MODIFIED | minor-moderate (+97 lines) | v1: +`ConfigUpdated` event, +`Paused`/`Unpaused` events, +zero-address guards on update_config, H016/H043 fixes. **Bundle 1 NOT applied.** Now 1027 LOC. |
| `programs/solshot-escrow-v2/src/lib.rs` | MODIFIED | MAJOR (+449 lines) | v2: **Bundle 1** — added `pending_*` fields on GlobalConfig (auth/treasury/ops/fee_bps), new instructions `propose_authority`, `accept_authority`, `apply_config_update` (24h timelock via `CONFIG_TIMELOCK_SECS`), one-shot devnet `migrate_config` (UncheckedAccount + manual realloc). `update_config` rewritten to write `pending_*` only. SPACE grew from 110→231. Now 1423 LOC. |
| `programs/solshot-escrow/tests/bok_proptest_*.rs` | NEW | 5 files | BOK regression tests — NOT audit targets. |
| All other source files | UNCHANGED | — | No deletions, no other modified .rs files. |

### Bundle 1 = S2-T1 + S2-T2

Bundle 1 was designed to address H001 (and its compound chains). The new v2 governance surface:
- `propose_authority(new_authority)` — current authority writes `pending_authority: Some(_)` (cancellable by re-proposing self).
- `accept_authority()` — **signed by the new key**; atomic transfer + re-validates distinctness vs treasury/ops.
- `update_config(...)` — now writes ONLY to `pending_treasury / pending_ops / pending_fee_bps_*` + `pending_config_ts`. Emits `ConfigProposed { applies_at }`.
- `apply_config_update()` — permissionless; requires `now >= pending_config_ts + CONFIG_TIMELOCK_SECS` (86400s = 24h). Re-validates all invariants. Emits `ConfigApplied`.
- `migrate_config()` — devnet-only, uses `UncheckedAccount` + manual authority verify at byte offset [8..40] + realloc 110→231.

### Massive-Rewrite Detection

v2: 449/1423 lines new (~32% delta) — qualifies as substantial rewrite. v1: ~9% delta — incremental.
**Decision:** Phase 1 runs FULL on v2; v1 may use prior context but should re-grep for the small deltas.

---

## Previous Findings Digest

**Source:** Audit #2 archive at `.audit-history/2026-05-06-226c0cd/`. 22 CONFIRMED (4 CRIT + 14 HIGH + 4 MED) + 6 LOW + 18 NOT_VULN re-validated + 4 STATUS_CHANGED.

### Relevance Tag Legend

- **CHECK_RESOLVED** — Bundle 1 (or other delta) explicitly targets this finding. Phase 1 must verify the fix is correct and complete; previously open finding may now close.
- **RECHECK** — Finding's file was modified; not directly targeted by Bundle 1. Re-investigate.
- **VERIFY** — Operational/off-chain finding (no source file). Re-check current state pre-mainnet.
- **RESOLVED_BY_REMOVAL** — File deleted (none in this delta).

### CRITICAL Findings (4)

| ID | Title | File:Line (v2 prev) | Tag | Description |
|----|-------|---------------------|-----|-------------|
| **H023** | Partial-refund theft via `close = caller` sweep | v1:393-410,465-484,718,745; v2:502-518,561-577,748,773 | **RECHECK** | Caller-controlled `remaining_accounts.len()` shorter than `count_ones(mask)` → loop refunds subset → `close=caller` sweeps un-refunded wagers to caller. 900 SOL max v2. Bundle 1 does NOT touch refund loops — likely still open. Verify line numbers shifted in v2. |
| **H044** | Single hot wallet for L1 (upgrade) + L2 (config.authority) | Operational | **VERIFY** | Both `4kzr…nH1` and `BVKX…G7N` upgrade auth + GlobalConfig.authority all resolve to `HPyV…nokv`. Bundle 1 enables 2-step rotation but doesn't separate the keys yet. |
| **H046** | Layer-1 bytecode replacement risk (no timelock/multisig on upgrade auth) | Operational (BPF Loader Upgradeable) | **VERIFY** | Compromised key → replace bytecode → new `drain_all`. Bundle 1 timelock applies to L2 config only, NOT to L1 program upgrade. **Independent fix still required.** |
| **H001** | One-step authority transfer (no propose/accept) | v1:72-108, v2:96-142 | **CHECK_RESOLVED (v2) / RECHECK (v1)** | v2: Bundle 1 adds full propose/accept (lines 302-348). Verify atomicity, replay resistance, distinctness re-check at accept. **v1 STILL one-step at v1:79-115.** v1 fix not in this delta. |

### HIGH Findings (14)

| ID | Title | File:Line (v2 prev) | Tag | Description |
|----|-------|---------------------|-----|-------------|
| **H024** | Non-contiguous `deposits_mask` permanently unrefundable | v1:393-410,465-484; v2:502-518,561-577 | **RECHECK** | Loop is monotonic from `i=0`; stranded if first slot empty. Compounds with H023. Bundle 1 unrelated. |
| **H030** | Fee destination hijack via update_config (v1 live read) | v1:684-697; v2:715-728 | **CHECK_RESOLVED (v2) / RECHECK (v1)** | v2: `update_config` writes to `pending_treasury/ops` + 24h timelock via `apply_config_update`. Verify settle reads SNAPSHOT (was protected) AND new matches see delayed config. v1: still live read; no Bundle 1. |
| **H035** | Settle-vs-cancel priority-fee race (50min v1 / 24h v2 window) | v1:264-272,357-378; v2:387-391,459-519 | **RECHECK** | v1: TIMEOUT_SECONDS=600 < SETTLEMENT_TIMEOUT_SECONDS=3600. v2: no settle deadline at all. Bundle 1 does NOT touch settle/cancel timing. |
| **H011** | v2 BPS poisoning via Layer-2 (REGRESSION of Feb H028) | v2:96-142,211-219,396-425 | **CHECK_RESOLVED (v2)** | Bundle 1 routes BPS updates through pending + 24h timelock. Verify: 10% cap re-enforced at apply, no individual-field bypass, ratcheting (H032) now requires 24h per step. |
| **H039** | v2 unbounded `duration_secs` lockup (8-day fund lock) | v2:38-39,161-184,298-303 | **RECHECK** | Authority griefing. `MAX_DURATION_SECS = 7d` unchanged. Bundle 1 unrelated. |
| **H042** | GlobalConfig has no close path (key-loss permanence) | No close_config in either program | **RECHECK** | Bundle 1 adds 2-step rotation, which partially mitigates key-loss IF old key still signs `propose_authority`. Lost-key case still has no recovery path. Verify guardian / recovery path still absent. |
| **H009** | Pause-rotate-unpause coup chain (v1 only) | v1:704,729,768,774 | **RECHECK** | v1's `cancel_match`/`settle_match` still have `!is_paused` constraint? Verify against +97-line v1 delta — H016 comment ("v1:117-119") suggests pause guards removed from cancel. |
| **H016** | Pause-griefing on v1 cancel | v1:729 | **CHECK_RESOLVED (v1)** | v1 source now has comment "H016 fix" — pause guard likely removed. Verify constraint is GONE from CancelMatch struct AND SettleMatch (H009 dependency). |
| **H017** | v1 silent-kick via `start_with_depositors` (no timing gate) | v1:493-536 | **RECHECK** | v2 fixes via `deposit_deadline` gate. v1 fix not part of Bundle 1 delta. Verify v1:523+ unchanged. |
| **H002** | Treasury self-redirect via multi-TX rotation | v1:96-98; v2:125-127 | **CHECK_RESOLVED (v2) / RECHECK (v1)** | v2: now timelock-gated (Bundle 1). v1: still one-step. Note: secondary-wallet attack (operationally controlled) still works on both via legitimate rotation. |
| **H003** | Authority winner selection fraud (POTENTIAL) | v1:674-679; v2:707-710 | **RECHECK** | Design limitation — membership check only. No on-chain fix possible. Re-verify scope/wager caps unchanged. |
| **H006** | Authority collusion via controlled wallet | OC-06 guards at v1:146 / v2:187 | **RECHECK** | Design limitation. Authority lists secondary wallet as player. Re-verify exclusion scope hasn't widened. |
| **H007** | Authority self-play (alias of H006) | Same as H006 | **RECHECK** | Functionally identical to H006. Track as one finding. |
| **H032** | BPS ratcheting across matches (timing dim) | v2:96-142,810-818 | **CHECK_RESOLVED (v2)** | Bundle 1's 24h timelock between propose→apply directly addresses this. Verify `last_config_update_ts` is set on apply (line 280) and there's no path to apply twice within window. |

### MEDIUM Findings (4)

| ID | Title | File:Line (v2 prev) | Tag | Description |
|----|-------|---------------------|-----|-------------|
| **H018** | v2 deposit_deadline edge collision (`<=` vs `>=`) | v2:255-262,333-339 | **RECHECK** | Both inclusive at deadline instant. One-line fix not applied. |
| **H025** | Executable-account fee destination (no `!executable` check) | v1:684-697; v2:715-728 | **RECHECK** | RECURRENT from Feb H009. One-line constraint still not landed. Bundle 1 unrelated. |
| **H033** | `start_with_depositors` griefing via authority-chosen timing | v2:336-339 | **RECHECK** | Deadline `>=` has no upper bound. v2-specific. Bundle 1 unrelated. |
| **H049** | match_id PDA seed entropy (server-side `randomBytes(4)`) | `server/socket-io/main.js:2212+` | **VERIFY** | Off-chain. May be addressed in DB audit; verify if server changed. |

### LOW Findings (6)

| ID | Title | File:Line (v2 prev) | Tag | Description |
|----|-------|---------------------|-----|-------------|
| **H008** | initialize_config race-init (theoretical for new deploys) | v1:42-69; v2:65-91 | **RECHECK** | Devnet already initialized → immune. Mainnet deploy still must bundle init atomically. Bundle 1 unrelated. |
| **H034** | Zero-BPS waiver (intentional feature) | v2:78,128-131 | **RECHECK** | Differential-extraction enabler combined with H011. Now timelocked via Bundle 1 — verify zero-BPS still possible but with 24h notice. |
| **H040** | Stale 48-hour comment misleads operators | v1:22-23 | **RECHECK** | Doc-only bug; comment claims "48-hour" but actual is `TIMEOUT_SECONDS*2 = 1200s = 20min`. Verify comment still present (v1 had +97 lines). |
| **H041** | close=caller rent theft (~0.002 SOL/match) | v1:718,745; v2:748,773 | **RECHECK** | Superseded by H023 but standalone valid. Bundle 1 unrelated. |
| **H043** | Idempotent pause emits no event | v1:112-122; v2:146-156 | **CHECK_RESOLVED** | v1 and v2 both now emit `Paused`/`Unpaused` events (confirmed in delta). Verify event payloads correct. |
| **H045** | Snapshot drift across update_config calls (audit-trail gap) | v2:201-219,96-142 | **CHECK_RESOLVED (partial)** | Bundle 1 adds `ConfigProposed` + `ConfigApplied` events with applies_at, enabling cross-correlation. Verify `actor` field present for full mitigation. |

### STATUS_CHANGED / PARTIAL (4)

| ID | Title | Tag | Description |
|----|-------|-----|-------------|
| H036 | Original Feb H006 dead zone | RESOLVED (carry-forward only) | Replaced by H035 race window. Documentation only. |
| H037 | Deposit ordering asymmetry | **RECHECK** | RECURRENT from Feb H010. v2 partial improvement via deposit_deadline. |
| H038 | Validator clock drift v2 short-duration | **RECHECK** | LOW→MED on v2 short windows. Bundle 1 unrelated. |
| H050 | S001/S002 chain status | **RECHECK** | Meta-finding tracking compound chains. Re-evaluate after Bundle 1. |

### Finding Counts by Tag

| Tag | Count |
|-----|-------|
| CHECK_RESOLVED (full or partial) | 9 (H001-v2, H030-v2, H011, H016, H002-v2, H032, H043, H045, plus possible H009) |
| RECHECK | 18 |
| VERIFY | 3 |
| RESOLVED_BY_REMOVAL | 0 |

**Total carried-forward findings: 28** (22 CONFIRMED + 6 LOW; STATUS_CHANGED meta-entries excluded from count).

---

## Previous False Positive Log

All 18 NOT_VULNERABLE hypotheses from Audit #2. **Because both source files were modified (v2 substantially), most dismissals require re-validation.** Listed in one-line form for context.

| ID | One-Line Dismissal | Re-Validate? |
|----|-------------------|--------------|
| H004 | S004 RECHECK: `has_one = authority` on CreateMatch.config at v1:625, v2:659 — fix landed. | YES — re-grep CreateMatch in modified v2. |
| H005 | PDA occupancy DoS — subsumed by S004 fix; unauthorized callers blocked. | YES — verify still subsumed. |
| H010 | Distinctness bypass via update_config — re-validated post-update at v1:96-98, v2:125-127. | **YES — Bundle 1 changes update_config substantially**; new check is at lines 146-152 + apply_config_update 272-278. |
| H012 | v1 BPS const immutability — `const u64` at compile-time. | LIKELY HOLDS (v1 unchanged here). |
| H013 | Lamport underflow on v2 N-player refund — per-iteration bit-set gating + overflow-checks=true. | YES — refund loops unchanged but verify. |
| H014 | u128→u64 narrowing at v2 settle — 100 SOL × 10 ≪ u64::MAX. | LIKELY HOLDS. |
| H015 | Lamport credit overflow on destinations — realistic max well below u64::MAX. | LIKELY HOLDS. |
| H019 | GlobalConfig re-init — Anchor `init` constraint at v1:547, v2:575. | **CAUTION — `migrate_config` is a new realloc path on v2; not technically re-init but bypasses Account<GlobalConfig> validation.** Investigate. |
| H020 | PDA close-and-revive — OC-10 drains funds before close; revival yields fresh state. | YES. |
| H021 | Permissionless reclaim during pause — intentional; v1 PermissionlessReclaim has no config in struct. | YES (Bundle 1 unrelated to reclaim). |
| H022 | Settlement deadline bypass via activated_at — always set in same block as state=Active. | YES. |
| H026 | Donation attack (lamport inflation) — attacker loses money. | HOLDS. |
| H027 | Atomic-TX rollback under Anchor 0.32.1 — all `?` propagation. | HOLDS. |
| H028 | Pubkey::default() in zero-padded slots — all loops bounded by max_players. | HOLDS. |
| H029 | Asymmetric pot-vs-mask scaling — all loops use max_players bound. | HOLDS. |
| H031 | Rent extraction at low wagers — rent cycle economically neutral. | YES. |
| H047 | is_writable enforcement on refund accounts — Anchor + Solana runtime enforce. | HOLDS. |
| H048 | Default-pubkey bypass in permissionless_reclaim — Pubkey::default() cannot sign. | HOLDS. |

**Action for Phase 1:** Pay special attention to **H010, H019** — Bundle 1 introduces new code paths that touch the same invariants these dismissals rely on.

---

## Architecture Snapshot

Condensed from `.audit-history/2026-05-06-226c0cd/ARCHITECTURE.md` + Bundle 1 deltas.

### Core Components

| Component | Location | Role |
|-----------|----------|------|
| `solshot_escrow` (v1) | `programs/solshot-escrow/src/lib.rs` (1027 LOC) | 1v1→4-player real-time escrow. Hardcoded 90/7/3 BPS. **No Bundle 1.** |
| `solshot_escrow_v2` (v2) | `programs/solshot-escrow-v2/src/lib.rs` (1423 LOC) | 2-10 player async escrow. Configurable BPS. **Bundle 1 governance.** |
| `GlobalConfig` PDA | both, seeds `[b"config"]` | Singleton admin. v2 SPACE=231 (Bundle 1 grew from 110 for pending_* fields). |
| `MatchEscrow` PDA | both, seeds `[b"match", match_id]` | Per-match holding account; closes on settle (`close=authority`) or cancel/reclaim (`close=caller`). |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│ LAYER 1 — Solana Upgrade Authority (HPyV…nokv)          │
│   No timelock, no multisig                              │
├─────────────────────────────────────────────────────────┤
│ LAYER 2 — Application authority (config.authority)      │
│   v1: ONE-STEP rotation (H001 still open)               │
│   v2: TWO-STEP propose/accept + 24h timelock on         │
│        treasury/ops/BPS (Bundle 1 — verify completeness)│
├─────────────────────────────────────────────────────────┤
│ PLAYER ZONE (allowlisted via escrow.players[])          │
├─────────────────────────────────────────────────────────┤
│ PERMISSIONLESS ZONE (reclaim after grace)               │
└─────────────────────────────────────────────────────────┘
```

Both layers still resolve to the same hot wallet `HPyV…nokv` — H044/H046 unchanged.

### Top Invariants

1. **Pot conservation:** `winner + treasury + ops == total_pot` (BOK Feb verified v1; v2 needs re-BOK).
2. **Refund conservation:** `Σ refund == wager × count_ones(deposits_mask)` — **holds only if `remaining_accounts` is a contiguous prefix of deposited players** (H023/H024 surface).
3. **BPS sum ≤ MAX_FEE_BPS (1000 = 10%)** — checked at update + (Bundle 1) re-checked at apply.
4. **Per-match snapshot immutability (v2):** `escrow.treasury_snapshot / ops_snapshot / fee_bps_*_snapshot` written at create_match; never modified. Settle reads SNAPSHOT not live config.
5. **State monotonicity:** AwaitingDeposits → Active → Settled|Cancelled; terminal states never re-enter.
6. **Distinctness:** `authority != treasury`, `authority != ops`, `treasury != ops` — re-validated post-update AND (Bundle 1) post-apply.
7. **Dust bound:** ≤ 2 lamports per settle (two floor divisions).
8. **No CPI to arbitrary programs** — only `system_program::transfer` for deposits.
9. **Pot ceiling:** `wager × max_players ≤ 100 SOL × 10 = 10^12 lamports` ≪ u64::MAX.
10. **Authority is the ONLY mutator of fee destinations** (config-mutating ix). v2 mutation now requires 24h notice (Bundle 1).

### Data Flow Assertions

- **Create:** `create_match(authority)` → init MatchEscrow → state=AwaitingDeposits. v2: atomic snapshot of cfg.{treasury, ops, fee_bps_*} into escrow.
- **Deposit:** `deposit_wager(player)` → `system_program::transfer(player → escrow)` → set bit in deposits_mask → on full mask: state=Active, activated_at=now, (v2) match_end_ts=now+duration_secs.
- **Settle:** `settle_match(authority, winner)` → state=Settled FIRST → BPS calc on u128 → three direct lamport writes (escrow→winner/treasury/ops) → `close=authority`.
- **Cancel/Reclaim:** loop `remaining_accounts.iter().enumerate()` refunds deposited slots → state=Cancelled → `close=caller` (the H023/H041 mechanism).

### Bundle 1 Architectural Deltas (NEW)

Bundle 1 introduces a **two-phase governance pattern** on v2 only:

1. **Propose phase:** `propose_authority(new_authority)` and `update_config(...)` write to `pending_*` fields on GlobalConfig. The live `authority/treasury/ops/fee_bps_*` are untouched. `pending_config_ts` is stamped to `Clock::get()` at propose time.
2. **Accept/apply phase:**
   - `accept_authority()` — signed by the new key — atomic rotation `authority ← pending_authority` plus distinctness re-check vs treasury/ops. NO timelock on authority rotation (intentional: 2-step exchange already prevents the "compromised key locks out old key" case).
   - `apply_config_update()` — PERMISSIONLESS — requires `now >= pending_config_ts + CONFIG_TIMELOCK_SECS (86400s)`. Applies pending_treasury / pending_ops / pending_fee_bps_*. Re-validates all invariants. Sets `last_config_update_ts`.
3. **New invariants:**
   - **Authority-rotation invariant:** new authority must SIGN accept (prevents one-step push to attacker-controlled bricked key).
   - **24h treasury/ops/BPS notice invariant:** in-flight matches AND new matches see no change until 24h after propose. Snapshot mechanism (v2 pre-existing) further protects in-flight; Bundle 1 extends protection to new-matches-during-grace-period.
   - **No-overlap invariant:** `pending_config_ts == 0` after apply (re-set to 0 at line 281) — prevents stale apply.
   - **Atomic distinctness:** apply re-checks `authority != treasury`, etc., post-mutation (defense vs race with propose_authority).
4. **`migrate_config` caveat (devnet-only):** Uses `UncheckedAccount` and reads authority pubkey at raw offset [8..40] before realloc. **Bypasses Anchor's Account<GlobalConfig> deserialization** — Phase 1 must investigate whether this is a new attack surface (H019 dismissal may need re-evaluation). Marked devnet-only in docstring but still deployed.
5. **Pause events:** v1 + v2 now emit `Paused`/`Unpaused` (H043 fix).
6. **What Bundle 1 does NOT do:**
   - Does NOT change v1.
   - Does NOT touch refund loops (H023, H024, H041 still apply).
   - Does NOT touch settle/cancel timing (H035 still applies).
   - Does NOT touch `duration_secs` cap (H039 still applies).
   - Does NOT add `!executable` constraints (H025 still applies).
   - Does NOT separate L1 from L2 keys (H044/H046 still apply).
   - Does NOT add a guardian / recovery path (H042 still applies in lost-key case).

---

## Audit Lineage

| # | Date | Git Ref | Confirmed | Potential | Files Scanned | Top Severity |
|---|------|---------|-----------|-----------|---------------|--------------|
| 1 | 2026-02-23 | `ecfd03b` | 12 | 5 | 1 (v1 only, 855 LOC) | CRITICAL (S004 PDA squat) |
| 2 | 2026-05-07 | `226c0cd` | 22 (4C/14H/4M) + 6 LOW | 6 | 2 (v1+v2, 1982 LOC) | CRITICAL (H023 close-sweep) |
| 3 | 2026-05-28 | `fabb8e1` | — | — | 2 (v1+v2, 2450 LOC) | — (in progress) |

### Recurring Findings (≥2 audits)

| ID | Title | Audits | Status |
|----|-------|--------|--------|
| H001 | One-step authority transfer | 2 (#1, #2) | v2 likely RESOLVED by Bundle 1; v1 STILL OPEN |
| H002/H030 family | Fee destination hijack | 2 (#1, #2) | v2 likely RESOLVED by Bundle 1; v1 STILL OPEN |
| H003/H005 | Authority winner fraud | 2 (#1, #2) | Design limitation — no fix possible on-chain |
| H011/H002 | Treasury self-redirect | 2 (#1, #2) | Same root; Bundle 1 partially mitigates v2 |
| H016/H041 | close=caller rent theft | 2 (#1, #2) | Superseded by H023; standalone valid |
| H009/H025 | Executable-account fee destination | 2 (#1, #2) | One-line fix STILL not landed |

**Critical attention:** H001 has now persisted across 2 audits in v1. If v1 ships to mainnet without Bundle 1 backport, this is the headline blocker. Per JJ memory: V1 mainnet scope is "v2 escrow only" — v1 will NOT be deployed to mainnet. Confirm with code-owner before Phase 1.

---

**End of Handover**
