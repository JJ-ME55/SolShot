# Stronghold of Security — Final Audit Report

**Project:** SolShot Escrow (programs v1 + v2)
**Audit Date:** 2026-05-07
**Auditor:** Stronghold of Security v1.0
**Scope:** Adversarial security analysis of `programs/solshot-escrow/src/lib.rs` (v1, 962 LOC) and `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC)
**Audit Number:** #2 (stacked on Audit #1, 2026-02-23 @ `ecfd03b`)
**Current Ref:** `226c0cd`

---

## 1. Executive Summary

### Overall Security Posture

SolShot Escrow comprises two parallel Anchor programs holding native SOL for wagered tank-battle matches: v1 (deployed `4kzr…nH1`, real-time 1v1 to 4-player) and v2 (deployed `BVKX…G7N`, async N-player to 10). v1 has been live-fire tested on devnet (first wagered settlement 2026-05-04) and was previously audited; v2 has had a single 3-player auto-settlement on devnet and **has had no prior audit coverage**. This audit treats both as fresh subjects given the magnitude of the v1 rewrite (~40% modified) and v2's first-time appearance.

The audit produced **50 confirmed/categorized findings** spanning 8 EP categories, with **4 CRITICAL** items dominating the risk surface. The headline finding — **H023 partial-refund theft via `close = caller` sweep** — is a structural fund-theft path verified against the Anchor 0.32.1 `close()` runtime source (`anchor-lang-0.32.1/src/common.rs:6-15`). It allows any registered player (or, in `permissionless_reclaim`, any wallet) to call cancel/reclaim with a partial `remaining_accounts` array and have Anchor's exit hook sweep all un-refunded co-depositor wagers to the caller. **Worst case: 900 SOL stolen per v2 max match.** This finding affects all four refund-loop sites in both programs and was independently flagged by the CPI agent (NOVEL-CPI-02) and the Token/Economic agent (NOVEL-TE-01).

The other three CRITICAL findings reflect SolShot's pre-mainnet hot-wallet posture (acknowledged by JJ in `Docs/PRIOR_AUDIT_DELTA.md` and `OC-13` at `v1:1`): **H001** (one-step authority rotation with no propose/accept), **H044** (single hot wallet `HPyV…nokv` holds both Layer-1 upgrade authority AND Layer-2 application authority — verified live via `solana program show` 2026-05-06), and **H046** (Layer-1 bytecode replacement risk with no timelock or multisig). All three collapse to a single-key dependency: any compromise of `HPyV…nokv` enables total protocol drainage by either layer, with no on-chain recovery path. JJ's stated position: "introduce propose/accept + timelock, or accept the risk" before mainnet.

The audit also identified meaningful **architectural improvements in v2**: per-match snapshot of treasury/ops/BPS at `create_match` (atomic, immutable post-create) genuinely protects in-flight matches from mid-match config rotation — the H001→H002 fee-redirect chain is closed for v2 in-flight matches. Pause guards have been removed from v2's `cancel_match` and `settle_match`, closing the v1 H007 pause-griefing window. The `start_with_depositors` instruction now has a deposit-deadline gate, eliminating the v1 silent-kick attack (H017). However, v2 introduces three new attack surfaces: configurable BPS opens H011 (Layer-2-only fee poisoning, REGRESSION of Feb H028 dismissal), unbounded `duration_secs` enables H039 (8-day fund lockup), and the absence of a settlement deadline expands H035's settle-vs-cancel race window from v1's 50 minutes to v2's 24 hours.

### Comparison to Audit #1 (Feb 2026)

| Dimension | Audit #1 (Feb 2026) | Audit #2 (May 2026) |
|-----------|--------------------|--------------------|
| Files in scope | 1 (v1 only, 855 LOC) | 2 (v1+v2, 1982 LOC) |
| Confirmed findings | 12 | 22 (4 CRITICAL + 14 HIGH + 4 MEDIUM) |
| POTENTIAL findings | 5 | 6 |
| NOT_VULNERABLE | 17 | 18 |
| Top severity | CRITICAL (S004 PDA squat, CVSS 9.3) | CRITICAL (H023 partial-refund theft, CVSS 9.3) |
| v2 coverage | None | Full (first audit) |

Net: The Feb CRITICAL (S004) is **RESOLVED** via `has_one = authority` on `CreateMatch.config` (verified at v1:625, v2:659). H023 takes its place as the new CRITICAL but is structurally distinct.

### Key Statistics

| Metric | Count |
|--------|-------|
| Total Attack Hypotheses Investigated | 50 |
| CONFIRMED Vulnerabilities | 22 |
| POTENTIAL / Conditional | 6 |
| NOT_VULNERABLE (re-validated) | 18 |
| STATUS_CHANGED / PARTIAL | 4 |

### Severity Distribution

| Severity | Count | CVSS Range | Action Required |
|----------|-------|------------|-----------------|
| **CRITICAL** | 4 | 8.0 – 9.3 | **BLOCK MAINNET DEPLOYMENT** |
| **HIGH** | 14 | 6.0 – 8.7 | **FIX BEFORE MAINNET** |
| **MEDIUM** | 4 | 4.0 – 5.9 | Recommended before mainnet |
| **LOW** | 6 | 0.1 – 3.9 | Address when convenient |
| NOT_VULNERABLE | 18 | N/A | No action |
| STATUS_CHANGED | 4 | N/A | Documentation only |

### Top 3 Critical Findings (Headline)

| # | ID | Title | Severity | Why It Matters |
|---|-----|-------|----------|----------------|
| 1 | **H023** | Partial-refund theft via `close = caller` sweep | CRITICAL (CVSS 9.3) | Up to **900 SOL stealable per v2 max match** in a single TX. No special equipment, single signature. Affects ALL four refund-loop sites. |
| 2 | **H044 + H046** | Single hot wallet for Layer 1 + Layer 2 + bytecode replacement | CRITICAL (operational) | One key compromise = total protocol drainage. Both layers resolve to `HPyV…nokv`, verified live. |
| 3 | **H001** | One-step authority transfer (no propose/accept) | CRITICAL (CVSS 8.7) | Single TX rotates governance permanently. Historical analogues: Step Finance $30-40M, Garden $11M, Raydium $4.4M. |

### CVSS Score Summary (Confirmed Findings)

| ID | Finding | CVSS | Vector |
|----|---------|------|--------|
| H023 | Partial-refund theft (cancel_match) | 9.3 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:N` |
| H023* | Partial-refund theft (permissionless_reclaim) | 9.3 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:N` |
| H001 | One-step authority rotation | 8.7 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H030 | Fee destination hijack (v1 live read) | 8.7 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:N` |
| H035 | Settle-vs-cancel race | 8.5 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:L` |
| H044 | Single hot wallet L1+L2 | 8.2 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H046 | Layer-1 bytecode replacement | 8.0 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H042 | GlobalConfig has no close path | 7.7 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H039 | v2 unbounded duration_secs lockup | 7.0 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:N/I:L/A:H` |
| H002 / H011 / H032 | Treasury / BPS rotation chains | 6.8 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:N` |
| H003 / H006 / H007 | Authority winner fraud / collusion / self-play | 6.8 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:N` |
| H017 | v1 silent-kick via start_with_depositors | 6.0 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:L/A:H` |
| H024 | Non-contiguous deposits_mask | 6.5 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H` |
| H016 | Pause-griefing on v1 cancel | 4.9 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:L/A:L` |
| H009 | Pause-rotate-unpause coup chain (v1) | 6.8 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:N` |
| H018 | v2 deposit_deadline edge collision | 4.5 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L` |
| H025 | Executable account fee destination | 3.9 | `CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:L` |
| H033 | start_with_depositors griefing (v2) | 4.5 | `CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:U/C:N/I:L/A:L` |
| H049 | match_id PDA seed entropy | 4.0 | (off-chain) |

**Average CVSS (CRITICAL+HIGH):** 7.6
**Highest CVSS:** H023 at 9.3

### Top 5 Priority Items

| Priority | ID | Finding | Severity | Location |
|----------|-----|---------|----------|----------|
| 1 | H023 | Partial-refund theft via close=caller | CRITICAL | `programs/solshot-escrow/src/lib.rs:393-410, 465-484`; `programs/solshot-escrow-v2/src/lib.rs:502-518, 561-577` |
| 2 | H044 | Single hot wallet L1+L2 | CRITICAL | Operational (Anchor.toml + on-chain config) |
| 3 | H046 | Layer-1 bytecode replacement | CRITICAL | Operational (BPF Loader Upgradeable) |
| 4 | H001 | One-step authority transfer | CRITICAL | `v1:72-108`, `v2:96-142` |
| 5 | H024 | Non-contiguous deposits_mask unrefundable | HIGH | `v1:393-410, 465-484`; `v2:502-518, 561-577` |

---

## 2. Scope and Methodology

### Files Audited

| File | LOC | Status (vs Feb) |
|------|-----|-----------------|
| `programs/solshot-escrow/src/lib.rs` | 962 | MAJOR-MODIFIED (~40% rewrite — N-player support, `permissionless_reclaim`, `start_with_depositors`) |
| `programs/solshot-escrow-v2/src/lib.rs` | 1020 | NEW (first-time audit; per-match snapshot, configurable BPS, async timing) |
| Test files (`bok_*.rs`) | — | Excluded (regression test coverage) |

### Tier and Methodology

This audit ran the full SOS pipeline at **Tier 2 depth** (50 strategies, 7 parallel context auditors, full coverage verification). Verification agents were **skipped** because both audited files qualify as massive rewrites (per `.audit/HANDOVER.md`); previous findings were carried forward as priors only.

**Audit Phases:**
1. **Phase 0+0.5** — Codebase indexing + static pre-scan (12 risk categories)
2. **Phase 1+1.5** — 7 parallel context auditors (Access Control, Arithmetic, State Machine, CPI, Token/Economic, Upgrade/Admin, Timing). Oracle category skipped (no oracles in scope).
3. **Phase 2+3** — Architectural synthesis → 50 attack hypotheses (23 NOVEL, 20 RECHECK, 7 KB-derived)
4. **Phase 4+4.5** — Priority-ordered investigation in 5 batches; coverage verification
5. **Phase 5** — Final synthesis (this report)

### Knowledge Base Used

- `severity-calibration.md` — CVSS scoring + qualitative severity floors for fund-theft on Solana
- `common-false-positives.md` — Cross-referenced for Anchor `init`, has_one, close semantics, atomicity assumptions
- `PATTERNS_INDEX.md` — ~128 EP patterns, of which OC, EP-083 (upgrade authority), EP-106 (executable accounts), EP-118 (close=caller) directly informed findings

### Coverage Achieved

- Instructions covered: **20/20** (10 unique × 2 programs)
- EP categories addressed: **8/8 relevant** (Oracle category correctly excluded)
- Pre-mainnet checklist items: **8/10** (2 minor gaps documented in COVERAGE.md — CHECKLIST-GAP-01 documentation only, CHECKLIST-GAP-02 compute-budget exhaustion at v2 10-player reclaim)

---

## 3. Severity Breakdown

### All Findings by Severity

| ID | Title | Severity | Status | Affects | CVSS | Origin |
|----|-------|----------|--------|---------|------|--------|
| H023 | Partial-refund theft via close=caller | CRITICAL | CONFIRMED | v1+v2 | 9.3 | NEW (NOVEL) |
| H044 | Single hot wallet L1+L2 | CRITICAL | CONFIRMED | v1+v2 | 8.2 | NEW (NOVEL) |
| H046 | Layer-1 bytecode replacement | CRITICAL | CONFIRMED | v1+v2 | 8.0 | NEW (NOVEL) |
| H001 | One-step authority transfer | CRITICAL | CONFIRMED | v1+v2 | 8.7 | RECURRENT |
| H002 | Treasury self-redirect chain | HIGH | POTENTIAL | v1+v2 | 6.8 | RECURRENT |
| H003 | Authority winner selection fraud | HIGH | POTENTIAL | v1+v2 | 6.8 | RECURRENT |
| H006 | Authority collusion (controlled wallet) | HIGH | POTENTIAL | v1+v2 | 6.8 | RECURRENT |
| H007 | Authority self-play (alias of H006) | HIGH | POTENTIAL | v1+v2 | 6.8 | RECURRENT |
| H009 | Pause-rotate-unpause coup chain | HIGH | CONFIRMED | v1 only | 6.8 | NEW |
| H011 | v2 BPS poisoning via Layer-2 | HIGH | CONFIRMED | v2 only | 6.8 | REGRESSION (+1) |
| H016 | Pause-griefing on v1 cancel_match | HIGH→MED | CONFIRMED | v1 only | 4.9 | RECURRENT |
| H017 | v1 silent-kick via start_with_depositors | HIGH | CONFIRMED | v1 only | 6.0 | NEW (NOVEL) |
| H024 | Non-contiguous deposits_mask unrefundable | HIGH | CONFIRMED | v1+v2 | 6.5 | NEW (NOVEL) |
| H030 | Fee destination hijack (v1 live read) | HIGH/MED | CONFIRMED | v1 HIGH; v2 MED | 8.7/5.8 | RECURRENT (evolved) |
| H032 | BPS rotation ratcheting | HIGH | CONFIRMED | v2 only | 6.8 | NEW (NOVEL) |
| H035 | Settle-vs-cancel priority-fee race | HIGH | CONFIRMED | v1+v2 | 8.5 | NEW (NOVEL — H006 inverted) |
| H039 | v2 unbounded duration_secs lockup | HIGH | POTENTIAL | v2 only | 7.0 | NEW (NOVEL) |
| H042 | GlobalConfig has no close path | HIGH | CONFIRMED | v1+v2 | 7.7 | NEW (NOVEL) |
| H018 | v2 deposit_deadline edge collision | MEDIUM | CONFIRMED | v2 only | 4.5 | NEW (NOVEL) |
| H025 | Executable account fee destination | MEDIUM | POTENTIAL | v1+v2 | 3.9 | RECURRENT (Feb H009) |
| H033 | start_with_depositors griefing (v2) | MEDIUM | CONFIRMED | v2 only | 4.5 | NEW (NOVEL) |
| H049 | match_id PDA seed entropy | MEDIUM | PARTIAL | server-side | 4.0 | NEW (NOVEL) |
| H008 | initialize_config race-init (theoretical) | LOW | CONFIRMED | v1+v2 | 3.0 | NEW (NOVEL) |
| H034 | Zero-BPS waiver (intentional) | LOW | CONFIRMED | v2 only | 2.0 | NEW (NOVEL) |
| H040 | Stale 48h comment misleads operators | LOW | CONFIRMED | v1 | N/A (doc) | NEW (NOVEL) |
| H041 | close=caller rent theft (~0.002 SOL) | LOW | CONFIRMED | v1+v2 | 2.5 | RECURRENT (Feb H016) |
| H043 | Idempotent pause emits no event | LOW | CONFIRMED | v1+v2 | N/A (operational) | NEW |
| H045 | Snapshot drift across update_config calls | LOW | CONFIRMED | v2 only | N/A (operational) | NEW |
| H036 | Original H006 dead zone (Feb) | RESOLVED | STATUS_CHANGED | v1 | N/A | RESOLVED→H035 |
| H037 | Deposit ordering asymmetry | PARTIAL | CONFIRMED (v2 improved) | v1+v2 | 4.0 | RECURRENT (Feb H010) |
| H038 | Validator clock drift v2 short-duration | MEDIUM | PARTIAL (LOW→MED) | v2 only | 3.5 | RECURRENT (Feb H020) |
| H050 | S001/S002 chain status | PARTIAL | CONFIRMED | both | N/A (meta) | RECURRENT (Feb S001/S002) |

### NOT_VULNERABLE (re-validated, 18 total)

H004, H005, H010, H012, H013, H014, H015, H019, H020, H021, H022, H026, H027, H028, H029, H031, H047, H048

See section **13. NOT VULNERABLE Summary** for one-line "why safe" for each.

---

## 4. Audit Evolution (Stacked Audit Context)

### Feb 2026 → May 2026 Transition Map

This section explicitly classifies each Feb audit finding's status in the May code. This is the load-bearing artifact for the stacked audit.

| Feb ID | Feb Severity | May Status | May ID | Notes |
|--------|--------------|------------|--------|-------|
| **S004** | CRITICAL (CVSS 9.3) | **RESOLVED** | H004 | Fix landed at `v1:625` and `v2:659` (`has_one = authority` on `CreateMatch.config`). Re-validated this audit. |
| **H001** | CRITICAL (CVSS 8.7) | **RECURRENT** | H001 | Still open by design. JJ acknowledged in `Docs/PRIOR_AUDIT_DELTA.md`. |
| **H002** | HIGH (CVSS 8.7) | **RECURRENT v1, EVOLVED v2** | H030 | v1 still vulnerable (live config read at `v1:686, 695`). v2 mitigates in-flight via per-match snapshot at `v2:211-214`. |
| **H003** | HIGH (CVSS 8.7) | **RESOLVED** | H010 | Distinctness re-validated post-update at `v1:96-98` and `v2:125-127`. Verified clean. |
| **H005** | HIGH | **RECURRENT** | H003 | Authority winner-pick fraud — design limitation; v2 raises blast radius to 900 SOL/match (2.5× v1). |
| **H006** | HIGH (23h dead zone) | **STATUS_CHANGED** | H035, H036 | Original dead zone RESOLVED; replaced by H035 settle-vs-cancel race (50min v1 / 24h v2). |
| **H007** | HIGH (pause-griefing) | **RECURRENT v1, RESOLVED v2** | H016 | v1 still has pause guard at `v1:729`. v2 explicitly removed it (`v2:755-761`, comment: "Pause does NOT block cancel"). |
| **H008** | HIGH (PDA squat) | **RESOLVED** | H005 | Subsumed by S004 fix. |
| **H011** | HIGH (treasury self-redirect) | **RECURRENT** | H002 | Same gap (distinctness check is pubkey-only, not operator-independence). v2 protects in-flight; new matches still exposed. |
| **H014** | HIGH (POTENTIAL collusion) | **RECURRENT** | H006/H014 | Authority can list secondary wallet as player. Design limitation, not fixable on-chain without identity binding. |
| **H016** | LOW (rent theft via cancel) | **RECURRENT (and superseded)** | H041 | Rent theft (~0.002 SOL) confirmed both versions. **Superseded by H023** which steals the entire un-refunded pot via the same `close = caller` mechanism. |
| **H028** | NOT_VULNERABLE (v1 BPS const) | **INVALIDATED on v2 (REGRESSION +1)** | H011 | Feb dismissal "BPS hardcoded, only Layer-1 upgrade" is logically correct for v1 (still safe — see H012). v2 makes BPS a runtime field, opening a Layer-2-only attack. **+1 severity escalation applied** because v2 introduces a NEW attack surface that the Feb dismissal explicitly excluded. |
| H022, H023, H024, H026, H029 | NOT_VULN (Feb) | **NOT_VULN (re-validated)** | various | All re-validated against current code. Holds. |

### Classification Counts

| Classification | Count | Description |
|----------------|-------|-------------|
| **NEW** (NOVEL — surfaced first time in May) | 13 | H008, H017, H023, H024, H035, H039, H042, H018, H033, H040, H043, H045, H049 |
| **RECURRENT** (same root cause, still active) | 9 | H001, H002, H003, H006, H007, H016, H024 (Feb H016 root), H025, H038 |
| **REGRESSION** (Feb dismissal invalidated) | 1 | H011 (was Feb H028 NOT_VULN; v2 invalidates) |
| **RESOLVED** (Feb finding fixed) | 4 | S004 (→H004), H003 (→H010), H006 dead zone (→H036/H035), H008 (→H005) |

### Specifically Tracked Transitions

**S004 (Feb CRITICAL) → RESOLVED:** Confirmed via `has_one = authority` at `programs/solshot-escrow/src/lib.rs:625` (v1 CreateMatch struct) and `programs/solshot-escrow-v2/src/lib.rs:659` (v2 CreateMatch struct). Authoritarian on-chain check is now enforced. (See H004 finding.)

**H001 (Feb CRITICAL) → RECURRENT:** Code structurally unchanged. v1: `lib.rs:72-108` still applies authority directly with no pending field. v2: `lib.rs:96-142` identical pattern. JJ's posture per `Docs/PRIOR_AUDIT_DELTA.md`: intentional pre-mainnet hot-wallet model.

**H002 (Feb HIGH) → RECURRENT v1, EVOLVED v2:** v1 settle still reads live config (verified at `v1:686`); per-match snapshot in v2 (`v2:211-214`) mitigates in-flight matches; new matches created post-compromise still inherit poisoned config. Severity downgrades to MEDIUM for v2-new-matches, HIGH for v1-all-matches.

**H003 (Feb HIGH) → RESOLVED:** Distinctness re-validated post-update at `v1:96-98` and `v2:125-127`. Each `update_config` call now correctly verifies `authority != treasury`, `authority != ops`, `treasury != ops` after applying the update. Holds as a structural invariant.

**H006 (Feb HIGH dead zone) → STATUS_CHANGED:** Constants `TIMEOUT_SECONDS = 600` (v1:20) and `SETTLEMENT_TIMEOUT_SECONDS = 3600` (v1:26) eliminate the dead zone. Replaced by **H035 settle-vs-cancel race window** (50 minutes in v1, 24 hours in v2 — see Detailed HIGH section).

**H007 (Feb HIGH) → RECURRENT v1, RESOLVED v2:** v1 retains `constraint = !config.is_paused` at `v1:729`; v2 removes it (`v2:755-761`). v2 docstring explicitly: "Pause does NOT block cancel so in-flight funds can always exit."

**H008 (Feb HIGH PDA squat) → RESOLVED via S004 fix:** No standalone exploit path remains.

**H010 (Feb MEDIUM) → PARTIAL improvement in v2:** v2's hard `deposit_deadline` bounds first-depositor exposure to 48h max (deposit window + 24h grace). v1 first-depositor can cancel anytime in AwaitingDeposits.

**H011 (Feb HIGH) → RECURRENT:** Multi-TX rotation chain still possible. Distinctness check fires on pubkey identity only, not operator-independence. Single-TX path (set treasury directly to operator-controlled secondary wallet) also works.

**H014 (Feb POTENTIAL) → PARTIAL:** Partially mitigated by S004 fix (no third-party can pre-create matches). However, the fundamental design — authority builds players[] array, only `authority.key()` excluded — remains as documented in H006/H014 of this audit.

**H016 (Feb LOW) → RECURRENT both:** Same `close = caller` rent theft pattern at four sites. Superseded in severity by H023.

**H017 (Feb POTENTIAL) → RECURRENT:** Multi-TX same-block update_config concerns; v2 mitigated for in-flight via snapshot atomicity. Distinct from this audit's H017 (silent-kick), which is a NOVEL finding.

**H028 (Feb NOT_VULN) → INVALIDATED on v2 — H011 (REGRESSION +1):** Feb dismissed because BPS were `const u64`. v2 makes them runtime-mutable `cfg.fee_bps_*` fields. Layer-2 authority can now ratchet within the 10% combined cap with no timelock. Combined with H001 + H002, this enables fee redirect on every NEW match. Apply +1 severity escalation per stacked-audit policy.

---

## 5. Detailed Findings — CRITICAL

### CRITICAL-001: H023 — Partial-Refund Theft via `close = caller` Sweep

**ID:** H023
**Severity:** CRITICAL
**CVSS Score:** 9.3 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:N`) for `cancel_match`; 9.3 with PR:None for `permissionless_reclaim`
**Status:** CONFIRMED
**Confidence:** 10/10
**Affects:** v1 + v2 — all four refund-loop sites
**Location:**
- v1 cancel_match: `programs/solshot-escrow/src/lib.rs:393-410` (loop), `lib.rs:718` (close=caller)
- v1 permissionless_reclaim: `lib.rs:465-484` (loop), `lib.rs:745` (close=caller)
- v2 cancel_match: `programs/solshot-escrow-v2/src/lib.rs:502-518` (loop), `lib.rs:748` (close=caller)
- v2 permissionless_reclaim: `lib.rs:561-577` (loop), `lib.rs:773` (close=caller)

#### Description

A malicious player (or in `permissionless_reclaim`, any wallet) calls `cancel_match` or `permissionless_reclaim` with a `remaining_accounts` array shorter than the number of deposited players. The refund loop iterates only over the supplied accounts, refunding only those players. There is **no post-loop assertion** verifying that all deposited slots were refunded. After the instruction body returns `Ok(())`, Anchor's `close = caller` exit hook runs unconditionally and transfers ALL remaining lamports in the escrow PDA — including every un-refunded wager — to the caller.

The vulnerability was confirmed by reading the Anchor 0.32.1 `close()` runtime source directly:

**Source: `~/.cargo/registry/src/.../anchor-lang-0.32.1/src/common.rs:6-15`**
```rust
pub fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
    let dest_starting_lamports = sol_destination.lamports();
    **sol_destination.lamports.borrow_mut() =
        dest_starting_lamports.checked_add(info.lamports()).unwrap();
    **info.lamports.borrow_mut() = 0;
    info.assign(&system_program::ID);
    info.resize(0).map_err(Into::into)
}
```

Key facts confirmed from source: `close()` reads the CURRENT balance of the PDA (whatever remains after the instruction body), adds it ALL to the destination unconditionally, and zeros the PDA. **There is no rejection path** — `close()` never returns `Err` based on lamport amount. The exit hook runs ONLY after the instruction body returns `Ok(())` (per `anchor-syn-0.32.1/src/codegen/program/handlers.rs:147-162`).

#### Attack Scenario

**v2 max-impact attack (cancel_match):**

1. Authority creates 10-player match with 100 SOL wager. All 10 players deposit. Total escrow: 1,000 SOL + rent.
2. Match has passed `match_end_ts`.
3. Attacker (players[0]) calls `cancel_match` with `remaining_accounts = [players[0]_AccountInfo]` only.
4. Loop iterates once: refunds 100 SOL to players[0]. Loop exits (no more remaining_accounts).
5. Instruction body returns `Ok(())`. Escrow holds 900 SOL + rent.
6. Anchor's exit hook calls `close(escrow_account, caller_account)`. 900 SOL + rent flows to attacker.
7. **Net theft: 900 SOL from 9 victims in a single transaction.** No oracle, no flash loan, no special equipment.

**permissionless_reclaim variant (zero prerequisites):**

After `match_end_ts + PUBLIC_REFUND_GRACE_SECS` (24h v2; 1200s v1), **any wallet** on the network can call `permissionless_reclaim` with `remaining_accounts = []` (empty). The loop never runs. `close = caller` sweeps the entire pot (1,000 SOL at v2 max) to the attacker. The attacker did not deposit anything.

#### Impact

- **Direct fund theft:** Up to 900 SOL per v2 match (max wager × max_players − 1); up to 360 SOL per v1 match.
- **Likelihood:** HIGH. Trivially scriptable. Single TX. Only requires being a registered player (cancel_match) or any wallet (permissionless_reclaim).
- **Detection:** Difficult — TX appears as a successful cancellation. Forensic identification requires off-chain reconciliation of `wager × count_ones(deposits_mask)` against actual refund amounts.
- **Affects all four sites identically.** The fix must be applied at all four sites.

#### Evidence

**Refund loop (identical pattern at all four sites):**
```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);
    require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer);
    require!(*account.key == players[i], EscrowError::InvalidPlayer);
    **escrow.try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
// NO post-loop assertion that remaining_accounts.len() == count_ones(deposits_mask)
// `close = caller` then sweeps whatever lamports remain
```

The loop validates each entry correctly (bounds, bit set, pubkey match) but does NOT validate `remaining_accounts.len()`.

#### Recommended Fix

Add a single `require!` assertion before the loop at all four sites:

```rust
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    // ... loop body unchanged
}
```

Add the error variant to both programs' `EscrowError` enum:
```rust
#[msg("Not all deposited players were included in the refund accounts")]
IncompleteRefund,
```

After the fix, if the loop completes successfully, the PDA holds exactly `rent_reserve` lamports. `close = caller` then transfers only the rent reserve, which is the intended behavior.

**Defense-in-depth (secondary):** After the loop, assert `escrow.lamports == rent_reserve_amount`. Requires knowing the exact rent reserve value; the `len` check is simpler and sufficient.

#### Verification

After fix:
- [ ] Test: Call `cancel_match` with full `remaining_accounts` (count = count_ones(mask)). Should succeed. Verify all depositors refunded; PDA closed.
- [ ] Test: Call `cancel_match` with `remaining_accounts = []`. Should fail with `IncompleteRefund` (when mask != 0).
- [ ] Test: Call `cancel_match` with shorter `remaining_accounts`. Should fail with `IncompleteRefund`.
- [ ] Same three tests against `permissionless_reclaim` in both v1 and v2.
- [ ] Test: Empty mask (0) + empty remaining_accounts. Should succeed (no refunds needed; rent goes to caller).

---

### CRITICAL-002: H044 — Single Hot Wallet for Layer 1 + Layer 2

**ID:** H044
**Severity:** CRITICAL (operational, by design)
**CVSS Score:** 8.2 (`CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:H`)
**Status:** CONFIRMED (acknowledged pre-mainnet posture)
**Confidence:** 10/10
**Affects:** v1 + v2 (operational/deployment)
**Location:** `Anchor.toml:7-12, 19`; on-chain `solana program show` results (verified live 2026-05-06)

#### Description

The single hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` holds:
- **Layer 1**: Solana-level upgrade authority for both `4kzr…nH1` (v1) and `BVKX…G7N` (v2)
- **Layer 2**: Application-level `GlobalConfig.authority` for both programs

A single private-key compromise unlocks **both** layers simultaneously. There is NO on-chain instruction that separates or cross-validates the two authorities — by design, per JJ's pre-mainnet posture (documented in `OC-13` at `v1:1` and `Docs/PRIOR_AUDIT_DELTA.md`).

#### Attack Scenario

A compromised key enables in parallel:
- **Layer 2 path** (faster, less stealthy): `update_config` rotates treasury/ops to attacker wallets; `settle_match` repeatedly drains all Active matches. End-to-end: <5 TX, single block.
- **Layer 1 path** (slower, stealthier): Deploy replacement bytecode that adds a `drain_all` instruction. Bypass all `has_one` checks. Drain all in-flight escrows AND maintain plausible normal-operation appearance for monitoring tools that don't perform forensic bytecode comparison.

The two paths are additive, not redundant: Layer 2 alone is potentially recoverable via re-deployment; Layer 1 ensures recovery itself requires the same compromised key.

#### Impact

- All in-flight wagers across both programs drain simultaneously
- No on-chain recovery path (Layer 1 upgrade requires the same compromised key)
- Forensic invisibility (Layer 1 path) until bytecode comparison
- No timelock = loss is immediate and irreversible

Industry precedent (same pattern):
- **Step Finance** (Jan 2026): hot wallet key exfiltration → $30-40M
- **Garden Finance** (Oct 2025): admin key, settlement manipulation → $11M
- **Raydium** (Dec 2022): hot wallet admin key compromise → $4.4M
- **Pump.fun** (May 2024): admin key via insider → $1.9M

#### Evidence

- `Anchor.toml:7-12`: Both program IDs registered for devnet under same `wallet = "~/.config/solana/solshot-dev.json"` (line 19) → resolves to `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`.
- Live `solana program show` (2026-05-06): both programs report `Upgrade Authority = HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`.
- `programs/solshot-escrow/src/lib.rs:1`: TODO marker `OC-13 — transfer upgrade authority to multisig before mainnet deploy` — explicit team acknowledgement.
- `GlobalConfig.authority` for both programs initialized to the same wallet (per project memory and on-chain inspection).

#### Recommended Fix

**Pre-mainnet (BLOCKING):**

1. **Transfer Layer 1 upgrade authority to a Squads multisig** (M-of-N, e.g. 3-of-5):
   ```bash
   solana program set-upgrade-authority 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 \
     --new-upgrade-authority <SQUADS_MULTISIG_PUBKEY>
   solana program set-upgrade-authority BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
     --new-upgrade-authority <SQUADS_MULTISIG_PUBKEY>
   ```

2. **Rotate `GlobalConfig.authority` to a separate Squads multisig** (different key set OR same multisig with different threshold). Ensures Layer 1 and Layer 2 require independent compromise.

3. **Add `pending_authority` propose/accept to `update_config`** (addresses H001, which this finding amplifies).

**Interim (immediate):** At minimum, separate the keys. Even if both remain hot wallets, a single key loss should not collapse both layers.

---

### CRITICAL-003: H046 — Layer-1 Bytecode Replacement Risk

**ID:** H046
**Severity:** CRITICAL (operational)
**CVSS Score:** 8.0 (`CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:H/A:H`)
**Status:** CONFIRMED
**Confidence:** 10/10
**Affects:** v1 + v2 (deployment-level)
**Location:** Both programs deployed under `BPFLoaderUpgradeab1e11111111111111111111111` with mutable upgrade authority

#### Description

Both programs are deployed under Solana's standard BPF Loader Upgradeable. The upgrade authority can deploy arbitrary replacement bytecode in a single transaction with no timelock, no multisig, no notice period, and no on-chain governance check. A replacement program retains the same program ID and is implicitly trusted by all existing `MatchEscrow` PDAs (which are owned by those program IDs).

This is the canonical EP-083 pattern (upgrade authority risk). The vulnerability compounds with H044: the same hot wallet holds both Layer 1 (upgrade) and Layer 2 (`config.authority`).

#### Attack Scenario

1. Attacker compromises `HPyV…nokv` private key.
2. **TX 1**: `BpfLoaderUpgradeable::Write(buffer, malicious_bytecode)` — attacker funds buffer account; loads drain bytecode.
3. **TX 2**: `BpfLoaderUpgradeable::Upgrade(program=4kzr…nH1, buffer)` — replaces v1 program in place. Same program ID, new logic.
4. **TX 3**: Call new `drain_all` instruction (added in replacement bytecode) targeting all live `MatchEscrow` PDAs via `remaining_accounts`. Single TX (CU permitting); multiple TXs in the same block possible.
5. **TX 4** (optional): Repeat for v2.
6. Optional cleanup: deploy a third bytecode that mimics original behavior, hiding the attack from monitoring that doesn't do bytecode hashing.

#### Impact

- All in-flight wager pots on both programs simultaneously stolen
- v2 per-match snapshot mechanism is **irrelevant** — replacement bytecode is not constrained by original logic; it can read snapshots, ignore them, or rewrite them
- v1 hardcoded BPS constants (`TREASURY_BPS = 700`, etc.) are equally **irrelevant**
- No on-chain recovery path — `permissionless_reclaim` is also under new bytecode
- Forensically invisible until off-chain bytecode comparison

#### Recommended Fix

**Pre-mainnet (BLOCKING):**

```bash
# Option 1 (recommended): transfer to Squads multisig
solana program set-upgrade-authority 4kzr... --new-upgrade-authority <SQUADS_MULTISIG_PUBKEY>
solana program set-upgrade-authority BVKX... --new-upgrade-authority <SQUADS_MULTISIG_PUBKEY>

# Option 2 (post-stabilization): permanently freeze upgrade authority
solana program set-upgrade-authority 4kzr... --final
```

A multisig with at least 3-of-5 threshold (or higher) prevents single-key attacks. Final freezing eliminates upgrade risk entirely but precludes future fixes — appropriate only after extensive battle-testing.

---

### CRITICAL-004: H001 — One-Step Authority Transfer (No Propose/Accept)

**ID:** H001
**Severity:** CRITICAL
**CVSS Score:** 8.7 (`CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H`)
**Status:** CONFIRMED — STILL_OPEN by design (RECURRENT from Feb)
**Confidence:** 10/10
**Affects:** v1 + v2
**Location:** `programs/solshot-escrow/src/lib.rs:72-108`; `programs/solshot-escrow-v2/src/lib.rs:96-142`

#### Description

`update_config` rotates `config.authority` (and treasury, ops, plus v2 BPS fields) in a single transaction. No `pending_authority` field. No two-step propose/accept. No timelock. The only validation is a zero-address guard:
```rust
if let Some(a) = new_authority {
    require!(a != Pubkey::default(), EscrowError::InvalidConfig);
    config.authority = a;  // IMMEDIATE, ONE-STEP, IRREVERSIBLE
}
```

A single compromised TX permanently rotates governance. The post-update distinctness check (`v1:96-98`, `v2:125-127`) prevents degenerate collisions but provides no observation window.

#### Attack Scenario

1. Attacker holds `HPyV…nokv` private key (phishing, malware, leaked `.env`, insider).
2. `settle_match` for all Active escrows passing attacker-controlled wallet as `winner` — 90% of each pot drained.
3. `update_config(new_authority = attacker_pubkey2, new_treasury = attacker_wallet, new_ops = attacker_wallet)` — original team locked out of both programs.
4. Optional: `pause_program` on both programs to block player cancellations (v1 only — v2 cancel is pause-immune).
5. All future match settlement fees route to attacker until Layer-1 program upgrade — which itself requires the same hot wallet (H044 + H046 compound).

#### Impact

Direct: Up to `wager × max_players × 0.9` per match × number of active matches. At 10 × 100 SOL concurrent v2 matches: up to 900 SOL stealable per settlement pass.

Permanent: Recovery requires Layer-1 upgrade (which is also under the same key — see H044/H046).

#### Recommended Fix

Two-step propose/accept pattern:

```rust
// Add to GlobalConfig (both v1 and v2):
pub pending_authority: Option<Pubkey>,
pub pending_authority_at: i64,

pub fn propose_authority(ctx: Context<UpdateConfig>, proposed: Pubkey) -> Result<()> {
    require!(proposed != Pubkey::default(), EscrowError::InvalidConfig);
    ctx.accounts.config.pending_authority = Some(proposed);
    ctx.accounts.config.pending_authority_at = Clock::get()?.unix_timestamp;
    Ok(())
}

pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    // signed by the PROPOSED key — proves key control
    let cfg = &mut ctx.accounts.config;
    require!(
        cfg.pending_authority == Some(ctx.accounts.new_authority.key()),
        EscrowError::Unauthorized
    );
    cfg.authority = ctx.accounts.new_authority.key();
    cfg.pending_authority = None;
    emit!(AuthorityTransferred { new_authority: cfg.authority });
    Ok(())
}
```

**Additional priority mitigations:**
1. 24h timelock on `update_config` changes to `treasury`, `ops`, and (v2) `fee_bps_*` (with `pending_treasury` + `treasury_valid_after`)
2. Separate settlement authority (hot, higher exposure) from config-update authority (cold/multisig, lower exposure)
3. Add `actor: Pubkey` field to `ConfigUpdated` event for indexer-friendly monitoring

---

## 6. Detailed Findings — HIGH

The 14 HIGH findings are presented in priority order based on severity, blast radius, and prerequisite cost.

### HIGH-001: H024 — Non-Contiguous `deposits_mask` is Permanently Unrefundable

**ID:** H024 | **CVSS:** 6.5 | **Status:** CONFIRMED | **Affects:** v1 + v2 all 4 refund-loop sites
**Location:** `v1:393-410, 465-484`; `v2:502-518, 561-577`

If `deposits_mask = 0b0010` (only `players[1]` deposited; `players[0]` did not), no syntactically valid call sequence refunds player 1. The loop is monotonic from `i = 0` and requires `(deposits_mask >> i) & 1 == 1` AND `account.key == players[i]`. With a non-contiguous mask, every call attempt fails at `i = 0`. Server explicitly tags such matches as `UNRECOVERABLE` (`server/socket-io/main.js:484-489`).

**Production likelihood:** Realistic. Network latency variation, failed deposits, RPC failures, or adversarial deposit ordering can produce non-contiguous masks. In a 2-player match, ~50% chance the "later-listed" player deposits first.

**Combination danger:** If a stranded match is left to expire, **H023 + H024 compound**: the empty-`remaining_accounts` reclaim path (which is the only valid call shape for a non-contiguous mask) becomes a fund-theft path via `close = caller`. The stranded wager flows to whoever calls reclaim, not the original depositor.

**Recommended fix:** Rewrite the refund loop with caller-supplied indices:
```rust
pub fn cancel_match(
    ctx: Context<CancelMatch>,
    refund_indices: Vec<u8>,  // positions of set bits in mask, in order
) -> Result<()> {
    require!(
        refund_indices.len() == deposits_mask.count_ones() as usize,
        EscrowError::IncompleteRefund
    );
    for (j, idx) in refund_indices.iter().enumerate() {
        let i = *idx as usize;
        require!(i < max_players, EscrowError::InvalidPlayer);
        require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer);
        let account = &ctx.remaining_accounts[j];
        require!(*account.key == players[i], EscrowError::InvalidPlayer);
        // ... refund
    }
}
```

This decouples loop progression from `i` monotonicity, allowing any subset of deposited slots to be refunded.

---

### HIGH-002: H030 — Fee Destination Hijack via update_config (v1 live read)

**ID:** H030 | **CVSS:** 8.7 v1 / 5.8 v2 | **Status:** CONFIRMED v1 / EVOLVED v2 | **Affects:** v1+v2
**Location:** `v1:684-697`, `v2:715-728`

v1 `settle_match` reads `config.treasury` and `config.ops` LIVE at execution time. A single `update_config` call rotates both fee destinations instantly. Any in-flight match settled after the rotation silently pays the 7%/3% fee split to attacker-controlled wallets. Players receive their 90% and may not notice.

v2 mitigates via per-match snapshot at `v2:211-214` (atomic with `create_match`). In-flight v2 matches are immune. **However**, all NEW matches created post-compromise inherit poisoned destinations via the snapshot mechanism — narrowing the attack surface from "all settlements" to "all new matches."

**Recommended fix:** Add timelock to treasury/ops rotation in both versions. Two-step propose/apply with 24h delay. (Same fix applies to H001 and H032.)

---

### HIGH-003: H035 — Settle-vs-Cancel Priority-Fee Race (H006 Inverted)

**ID:** H035 | **CVSS:** 8.5 | **Status:** CONFIRMED | **Affects:** v1 (50min window), v2 (24h window)
**Location:** `v1:264-272, 357-378`; `v2:387-391, 459-519`

v1's constants (`TIMEOUT_SECONDS=600`, `SETTLEMENT_TIMEOUT_SECONDS=3600`) create a 50-minute window where `settle_match` (authority) and `cancel_match` (player) are simultaneously valid. A losing player observes the authority's `settle_match` TX in the mempool and submits a competing `cancel_match` TX with higher priority fee. If cancel lands first, settle fails with `InvalidState`. The losing player saves up to 100 SOL wager loss for ~$0.10–$0.30 in priority fees. **ROI ≈ 50,000:1 at MAX_WAGER.**

v2 has no settlement deadline — race window is the entire 24-hour reclaim grace.

**The Feb H006 finding had a 23-hour DEAD ZONE; the fix overcorrected, creating a RACE WINDOW.** Same architectural root cause.

**Recommended fix (v1):** Set `TIMEOUT_SECONDS >= SETTLEMENT_TIMEOUT_SECONDS` (e.g., 3600 or 4200). Eliminates the overlap.

**Recommended fix (v2):** Add a `pending_settle: bool` flag to MatchEscrow. Authority sets it in a preliminary TX; `cancel_match` and `permissionless_reclaim` check `!pending_settle`. Lock must time out to prevent authority grief.

---

### HIGH-004: H011 — v2 BPS Poisoning via Layer-2 Compromise (REGRESSION of Feb H028)

**ID:** H011 | **CVSS:** 6.8 | **Status:** CONFIRMED REGRESSION | **Affects:** v2 only
**Location:** `v2:96-142, 211-219, 396-425`

The Feb H028 dismissal ("BPS constants are hardcoded; only Layer-1 upgrade can change them") is **inapplicable to v2**, where `fee_bps_treasury` and `fee_bps_ops` are runtime-mutable on `GlobalConfig`. A compromised Layer-2 authority can ratchet the combined fee from 7%/3% up to 10% combined (MAX_FEE_BPS=1000) on every NEW match with NO program upgrade and NO timelock.

The 10% cap holds structurally — multi-step rotation cannot exceed it. The attack surface is operating WITHIN the cap to the authority's advantage.

**Combined with H011's documented self-redirect** (rotate `treasury` to attacker wallet via the same `update_config` path): attacker captures the full 10% per new match silently. This is the most realistic compound attack on v2.

**Recommended fix:**
1. Add per-BPS-field individual cap (defense-in-depth):
   ```rust
   if let Some(t) = new_fee_bps_treasury {
       require!(t <= MAX_FEE_BPS, EscrowError::FeesTooHigh);
       cfg.fee_bps_treasury = t;
   }
   ```
2. Add timelock on BPS changes (24h pending; same pattern as H030 fix).
3. Re-validate BPS at create_match (post-snapshot defense-in-depth).
4. Emit `ConfigUpdated` with `actor` and old-value diff for monitoring.

---

### HIGH-005: H039 — v2 Unbounded duration_secs Lockup (8-Day Fund Lock)

**ID:** H039 | **CVSS:** 7.0 | **Status:** POTENTIAL | **Affects:** v2 only
**Location:** `v2:38-39, 161-184, 298-303, 470-487, 539-549`

v2's `MAX_DURATION_SECS = 7 * 24 * 3600 = 604800` (7 days). Plus `PUBLIC_REFUND_GRACE_SECS = 86400` (24h). **Maximum lockup horizon: 8 days.** During this window, players cannot cancel (`v2:471-487`), authority can refuse to settle (no on-chain settlement deadline in v2), and permissionless_reclaim is gated until `match_end_ts + 24h`.

Authority gains nothing economically — pure griefing vector. Setup: 10-player match × 100 SOL wager = 1000 SOL locked for 8 days, returnable but unusable.

**Recommended fix:** Reduce `MAX_DURATION_SECS` to 86400 (24h). For genuinely longer matches, introduce per-match-type duration caps. Consider adding an on-chain settlement deadline mirroring v1's `SETTLEMENT_TIMEOUT_SECONDS`, so passive authority cannot stall indefinitely.

---

### HIGH-006: H042 — GlobalConfig Has No Close Path (Key-Loss Permanence)

**ID:** H042 | **CVSS:** 7.7 | **Status:** CONFIRMED | **Affects:** v1+v2 operational
**Location:** No `close_config` instruction exists in either program. Verified via exhaustive `pub fn` enumeration and `close = ` grep (6 matches, all on MatchEscrow).

If the authority key is lost (hardware failure, seed loss, key rotation error), GlobalConfig is permanently unrecoverable. `update_config` requires the old authority's signature; no guardian, no social recovery, no emergency bypass. Recovery requires Layer-1 program upgrade introducing a `recover_config` instruction — which itself requires the upgrade authority key, currently the same hot wallet (H044). **Single-key dependency closes both recovery paths simultaneously.**

This compounds with H001: H001 is "compromised key seizes everything," H042 is "lost key locks everything." Two faces of the same gap.

**Player funds are NOT permanently frozen** in the lost-key scenario — `cancel_match` and `permissionless_reclaim` do not require `config.authority`. But all new business stops indefinitely.

**Recommended fix:** Add `guardian: Pubkey` field + `initiate_recovery` (guardian-callable, no authority sig) + `finalize_recovery` (anyone-callable after delay). Combined with multisig upgrade authority (H044/H046 fix), no single key loss disables both recovery paths.

---

### HIGH-007: H009 — Pause-Then-Rotate-Then-Unpause Coup Chain (v1 only)

**ID:** H009 | **CVSS:** 6.8 | **Status:** CONFIRMED v1 only (FIXED v2) | **Affects:** v1 only
**Location:** `v1:704, 729, 768, 774` (pause guards on settle/cancel/start_with_depositors)

Three-step v1 attack: (1) pause program → blocks `cancel_match` (v1:729) and `settle_match` (v1:704) and `start_with_depositors` (v1:774); (2) `update_config(new_treasury = attacker_wallet)` → no pause guard on `update_config`; (3) unpause → settle in attacker's favor. Players locked out of cancellation during the rotation.

v2 fixes this: cancel/settle/reclaim are pause-immune (`v2:755-761, 730-737`). The v2 `pause_program` docstring at `v2:144-145` documents the intent: "Settle / cancel / permissionless_reclaim remain callable so in-flight funds can exit."

**Recommended fix for v1:** Mirror the v2 fix — remove `constraint = !config.is_paused` from `CancelMatch.config` (v1:729) and `SettleMatch.config` (v1:704).

---

### HIGH-008: H016 — Pause-as-Griefing on v1 cancel_match

**ID:** H016 | **CVSS:** 4.9 (down from Feb 6.6 due to tighter 20-min window) | **Status:** CONFIRMED v1, FIXED v2
**Location:** `v1:729` (constraint `!config.is_paused`)

Compounds with H009. Standalone variant: a compromised authority calls `pause_program`. Players cannot `cancel_match` or `settle_match`. Funds locked until permissionless_reclaim opens at `activated_at + 1200s` (20 minutes — tighter than Feb's 48h, but still HIGH qualitatively because any window where a compromised key can lock player funds is significant). v2 removes both pause guards.

**Recommended fix:** Same as H009 — remove pause constraint from `v1:729` (and ideally `v1:704`).

---

### HIGH-009: H017 — v1 Silent-Kick Attack via start_with_depositors (NOVEL)

**ID:** H017 | **CVSS:** 6.0 | **Status:** CONFIRMED | **Affects:** v1 only
**Location:** `v1:493-536` (handler with no timing gate); v2 fix at `v2:332-339`

v1's `start_with_depositors` has only two guards: `state == AwaitingDeposits` and `deposits_mask.count_ones() >= 2`. **No timing gate.** Authority can call it the instant 2 deposits land — even if other players have deposit TXs in flight. Compaction overwrites non-depositor pubkeys with `Pubkey::default()`. In-flight `deposit_wager` TXs from players whose slot was just zeroed fail at the `state == AwaitingDeposits` check — players lose their slot and TX fees.

v2 fixes this exactly: `Clock::get >= deposit_deadline` gate at `v2:336-339`. Players have their full advertised window guaranteed.

**Recommended fix for v1:**

Option A (minimal, no struct change):
```rust
const MIN_DEPOSIT_WINDOW_SECS: i64 = 30;
let earliest_start = ctx.accounts.escrow.created_at
    .checked_add(MIN_DEPOSIT_WINDOW_SECS)
    .ok_or(EscrowError::ArithmeticOverflow)?;
require!(
    Clock::get()?.unix_timestamp >= earliest_start,
    EscrowError::DepositWindowOpen
);
```

Option B (full v2 backport): Add `deposit_window_secs` field to v1 `MatchEscrow` (struct change + SPACE update + migration consideration).

---

### HIGH-010: H002 — Treasury Self-Redirect via Multi-TX Rotation Chain

**ID:** H002 | **CVSS:** 6.8 | **Status:** POTENTIAL (recurrent from Feb H011) | **Affects:** v1+v2
**Location:** `v1:96-98`, `v2:125-127` (distinctness checks fire post-update only)

The distinctness checks (`authority != treasury`, `authority != ops`, `treasury != ops`) verify pubkey identity at the END of an `update_config` call. They do NOT detect that the new treasury value is a wallet operationally controlled by the authority operator.

**Simplest path (no rotation needed):** Authority calls `update_config(new_treasury = operator_secondary_wallet)`. Distinctness check passes (all three keys distinct). Now 7% of every settlement flows to operator-controlled treasury. Bypass requires no chain.

**Multi-step variant (obscures intent):** Cycle authority → secondary, set treasury = original-authority, cycle authority back. Each step satisfies distinctness independently.

v1 fully exposed (live config read). v2 in-flight matches protected by snapshot; all new matches inherit the redirect.

**Recommended fix:** Same as H001/H030/H032 — timelock on treasury/ops rotation. Plus add `actor` field to `ConfigUpdated` event for monitoring.

---

### HIGH-011: H003 — Authority Winner Selection Fraud

**ID:** H003 | **CVSS:** 6.8 | **Status:** POTENTIAL (design limitation) | **Affects:** v1+v2
**Location:** `v1:674-679`, `v2:707-710` (winner constraint = membership in `escrow.players[]` only)

The on-chain winner constraint is a simple membership check: `(0..max_players).any(|i| escrow.players[i] == winner.key())`. No game-state proof, no commit-reveal, no VRF, no loser cosign. The authority freely picks any registered player as winner.

v2 amplifies the blast radius: `MAX_PLAYERS = 10`, `MAX_WAGER = 100 SOL` → max single-match extraction at 90% = **900 SOL** (2.5× v1's 360 SOL).

This is a structural property of the server-as-authority model, not a code bug. There is no practical on-chain fix without major architectural change (commit-reveal, loser cosign, VRF/oracle).

**Recommended (operational):** Multisig the authority key. Statistical monitoring (anomalous win-rates per wallet). Pre-mainnet, reduce blast radius by capping `MAX_WAGER` or `MAX_PLAYERS`.

---

### HIGH-012: H006 — Authority Collusion to Settle in Favor of Controlled Wallet

**ID:** H006 | **CVSS:** 6.8 | **Status:** POTENTIAL (design limitation) | **Affects:** v1+v2

Authority operator generates a secondary wallet `W_evil` (not the authority signing key), lists it as one of the players in `create_match`, has it deposit normally, then calls `settle_match(winner = W_evil)`. The OC-06 guard at `v1:146`/`v2:187` only excludes `ctx.accounts.authority.key()` — any other operator-held wallet passes.

H006 is the deliberate-malice variant; H003 is the same surface from the compromised-key angle. Both compound. The on-chain program cannot distinguish a wallet held by an independent player from one held by the operator.

**Recommended:** Same as H003 — off-chain identity binding (Privy or equivalent), statistical monitoring, commit-reveal architecture. No clean on-chain fix.

---

### HIGH-013: H007 — Authority Self-Play Bypass via Secondary Wallet (alias of H006)

**ID:** H007 | **CVSS:** 6.8 | **Status:** POTENTIAL | **Affects:** v1+v2
H007 is functionally identical to H006 — same root cause (OC-06 guard scope), same attack path, same impact. Recorded separately because the access-control agent flagged it under a distinct heading. In remediation tracking, treat as one finding under H006.

---

### HIGH-014: H032 — BPS Rotation Ratcheting Across Matches (timing dimension)

**ID:** H032 | **CVSS:** 6.8 | **Status:** CONFIRMED | **Affects:** v2 only
**Location:** `v2:96-142, 810-818` (no `last_bps_update_ts` field; no rate-limit; no minimum notice)

Distinct from H011 (which establishes the ATTACK SURFACE for BPS poisoning). H032 specifically targets the TIMING dimension: no rate-limit, no minimum window between rotations, no advance notice. Authority can call `update_config` once per block (~400ms), ratchet BPS up to 10%, snapshot into a tournament's first `create_match`, then revert.

`MatchCreated` event omits BPS snapshot values, so players have no on-chain signal showing elevated fees before depositing.

**Recommended fix:**
1. Add `last_bps_update_ts: i64` field to `GlobalConfig`.
2. Enforce minimum delay (e.g., 24h) between BPS changes:
   ```rust
   if new_fee_bps_treasury.is_some() || new_fee_bps_ops.is_some() {
       require!(
           Clock::get()?.unix_timestamp >= cfg.last_bps_update_ts + BPS_CHANGE_DELAY_SECS,
           EscrowError::BpsTimelockActive
       );
       // ... apply
       cfg.last_bps_update_ts = Clock::get()?.unix_timestamp;
   }
   ```
3. Expose `fee_bps_*_snapshot` in `MatchCreated` event for player visibility.

---

## 7. Detailed Findings — MEDIUM

### MEDIUM-001: H018 — v2 Deposit-Window Edge Collision at deposit_deadline

**ID:** H018 | **CVSS:** 4.5 | **Status:** CONFIRMED edge case | **Affects:** v2 only
**Location:** `v2:255-262` (`deposit_wager`), `v2:333-339` (`start_with_depositors`)

Both `deposit_wager` (`<= deposit_deadline`) and `start_with_depositors` (`>= deposit_deadline`) are inclusive at the deadline instant. Race condition at `T == deposit_deadline`: outcome (deposit succeeds vs deposit rejected + match starts) depends on Solana leader ordering.

**Recommended fix:** Tighten `deposit_wager` to `<` (exclusive):
```rust
require!(
    Clock::get()?.unix_timestamp < deposit_deadline,
    EscrowError::DepositWindowClosed
);
```

One-line change at `v2:257`. Eliminates overlap; no struct changes.

---

### MEDIUM-002: H025 — Executable-Account Fee Destination

**ID:** H025 | **CVSS:** 3.9 | **Status:** STILL_OPEN POTENTIAL (RECURRENT from Feb H009) | **Affects:** v1+v2
**Location:** `v1:684-697`, `v2:715-728` (no `!executable` constraint)

Treasury / ops / winner are `UncheckedAccount<'info>` with no `!executable` constraint. A hostile authority can set `config.treasury` to an executable program account (e.g., System Program). On settlement, `try_borrow_mut_lamports() += amount` succeeds in-memory but the credit is silently discarded by the runtime at TX commit (per EP-106 write-demotion behavior). Escrow debit is committed; treasury credit is burned. Single-line fix existed in Feb; still has not landed.

**Recommended fix (one line per account):**
```rust
constraint = !treasury.executable @ EscrowError::InvalidTreasury,
constraint = !ops.executable @ EscrowError::InvalidOps,
```

Apply at `v1:684-697`, `v2:715-728`. Optional defense-in-depth: same check on `winner` (in practice safe — winner must be a deposit signer, and signers can't be programs).

---

### MEDIUM-003: H033 — start_with_depositors Griefing via Authority-Chosen Activation Timing (v2)

**ID:** H033 | **CVSS:** 4.5 | **Status:** CONFIRMED | **Affects:** v2 only
**Location:** `v2:336-339` (deadline check is `>=` only — no upper bound)

v2's deposit-deadline gate (`Clock::get >= deposit_deadline`) prevents premature compaction (closes H017). However, it has no upper bound. Authority can wait minutes/hours after deadline before calling `start_with_depositors`, ensuring fewer players have deposited by activation moment, reducing pot size.

10-player match with `deposit_window_secs = 60`: authority waits until 60.5s (deadline expired), only 2 deposits confirmed on-chain. Compaction reduces `max_players` to 2; the 8 pending deposit TXs fail. Authority's chosen winner takes the smaller pot.

This is design-limitation territory — authority is trusted, this is self-dealing. Detection via off-chain monitoring is feasible.

**Recommended:** Add `max_activation_delay_secs` parameter to `start_with_depositors`. Emit `MatchActive` event with `actual_player_count` for off-chain monitoring.

---

### MEDIUM-004: H049 — match_id PDA Seed Entropy

**ID:** H049 | **CVSS:** 4.0 | **Status:** PARTIAL (server-side concern) | **Affects:** server
**Location:** `server/socket-io/main.js:2212, 2393, 2471, 2639` — `crypto.randomBytes(4)` (32 bits)

Server generates 4-byte (8-hex-char) match IDs. Birthday paradox at ~65M matches (50% collision threshold). On-chain `init` rejects collisions, but server-side match creation fails silently when this happens.

This is primarily an off-chain concern (will be addressed in the DB audit) but documented here for completeness given on-chain interaction.

**Recommended:** Increase to `randomBytes(8)` (64 bits) — raises threshold to ~4 billion matches. Add server-side DB uniqueness constraint with collision logging.

---

## 8. Detailed Findings — LOW

| ID | Title | Location | One-Line Recommendation |
|----|-------|----------|------------------------|
| **H008** | initialize_config race-init (theoretical for new deploys) | `v1:42-69`, `v2:65-91` | For future redeploys, bundle `initialize_config` into the same atomic operator session as `solana program deploy`. |
| **H034** | Zero-BPS waiver (intentional feature) | `v2:78`, `v2:128-131` | Within authority discretion. Document operationally. Combined with H011 enables differential-extraction patterns for monitoring to detect. |
| **H040** | Stale 48-hour comment misleads operators | `v1:22-23` | One-line doc fix: comment claims "48-hour permissionless reclaim timeout" / "172800 seconds" but actual is `TIMEOUT_SECONDS * 2 = 1200s = 20 min`. Update comment to match code. |
| **H041** | close=caller rent theft (~0.002 SOL per match) | `v1:718, 745`; `v2:748, 773` | Superseded by H023 in severity (H023 steals the entire un-refunded pot via the same mechanism). Fix for H023 also addresses H041 by ensuring PDA holds only rent reserve when close fires. |
| **H043** | Idempotent pause emits no event | `v1:112-122`, `v2:146-156` | Add `emit!(ProgramPaused)` and `emit!(ProgramUnpaused)` for off-chain state-change tracking. |
| **H045** | Snapshot drift across update_config calls | `v2:201-219, 96-142` | `MatchCreated` already emits snapshot values (audit trail OK). Optional: emit current `config.*` state alongside for cross-correlation in monitoring. |

---

## 9. Combination Attack Analysis

### N×N Combination Matrix (CONFIRMED + POTENTIAL findings)

The following matrix shows pairwise interactions — `→` indicates "enables/amplifies", `+` indicates "shared root cause / shared fix".

| | H001 | H002 | H003 | H006 | H009 | H011 | H016 | H017 | H023 | H024 | H025 | H030 | H032 | H035 | H039 | H042 | H044 | H046 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **H001** | — | → | → | → | → | → | → | — | — | — | → | → | → | — | → | + | + | + |
| **H002** | + | — | + | + | + | + | — | — | — | — | + | + | + | — | — | — | + | — |
| **H003** | + | — | — | + | — | — | — | — | — | — | — | — | — | + | — | — | + | — |
| **H006** | + | + | + | — | — | — | — | — | — | — | — | — | — | + | — | — | + | — |
| **H009** | + | + | — | — | — | + | + | — | — | — | — | + | — | — | — | — | + | — |
| **H011** | + | + | — | — | + | — | — | — | — | — | + | + | + | — | — | — | + | — |
| **H016** | + | — | — | — | + | — | — | — | — | — | — | — | — | + | — | — | + | — |
| **H017** | + | — | + | + | — | — | — | — | — | — | — | — | — | — | — | — | + | — |
| **H023** | — | — | — | — | — | — | — | — | — | → | — | — | — | + | + | — | — | — |
| **H024** | — | — | — | — | — | — | — | — | + | — | — | — | — | — | + | — | — | — |
| **H025** | + | + | — | — | — | + | — | — | — | — | — | + | — | — | — | — | + | — |
| **H030** | + | + | — | — | + | + | — | — | — | — | + | — | + | — | — | — | + | — |
| **H032** | + | + | — | — | — | + | — | — | — | — | — | + | — | — | — | — | + | — |
| **H035** | — | — | + | + | — | — | + | — | + | — | — | — | — | — | — | — | — | — |
| **H039** | — | — | — | — | — | — | — | — | + | + | — | — | — | — | — | — | + | — |
| **H042** | + | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | + | + |
| **H044** | + | + | + | + | + | + | + | + | — | — | + | + | + | — | + | + | — | + |
| **H046** | + | — | — | — | — | — | — | — | — | — | — | — | — | — | — | + | + | — |

### Key Attack Chains

#### Chain 1: S001 — Authority Compromise Kill Chain (v1 full / v2 partial)

**Combined Severity:** CRITICAL (v1) / HIGH (v2)

**Component Findings:**
| ID | Severity | Role |
|----|----------|------|
| H044 / H001 | CRITICAL | Single-key root: one compromise unlocks Layer 1 + Layer 2 |
| H030 / H002 | HIGH (v1) / MED (v2) | Treasury redirect via update_config |
| H003 / H006 | HIGH | Winner-pick fraud via authority-chosen player |
| H011 (v2 only) | HIGH | BPS ratcheting within 10% cap |

**Combined Attack (v1):** Single key compromise → 1 TX rotates treasury + ops to attacker wallets → settle every Active match with attacker as winner → 90% pot to attacker + 10% fees to attacker = **100% protocol drainage of all in-flight matches**.

**Combined Attack (v2):** Single key compromise → in-flight matches protected by snapshot (architectural mitigation works) → BUT authority creates new matches with poisoned snapshots → drainage continues until detected.

**Why Worse than Sum:** Each finding alone is HIGH/CRITICAL; combined they constitute total protocol kill. v2's snapshot mechanism downgrades the v2 chain to "drains future matches only" — meaningful but partial.

**Mitigation (single highest-ROI fix):** Multisig the authority key (H044). This single change breaks H001, H002, H003, H006, H011, H030, H032, H039 simultaneously — **8 of the audit's HIGH+CRITICAL findings.**

#### Chain 2: H023 + H024 Stranding-and-Theft

**Combined Severity:** CRITICAL

**Components:**
| ID | Severity | Role |
|----|----------|------|
| H024 | HIGH | Non-contiguous mask makes funds unrefundable via standard call |
| H023 | CRITICAL | Empty `remaining_accounts` reclaim path triggers `close = caller` sweep |

**Combined Attack:** Player exploits ordering (or natural network jitter causes it) → match has non-contiguous `deposits_mask = 0b0010` → no syntactically valid refund call works → ONLY remaining call shape is `cancel_match(remaining_accounts = [])` → loop never runs → `close = caller` sweeps stranded depositor's wager to caller → caller is attacker, original depositor lost wager.

**Why Worse than Sum:** H024 alone strands funds (no theft). H023 alone steals from co-depositors. **Combined, H024 forces victims onto the H023 path** — the only "valid" call shape produces theft.

**Mitigation:** Fix H023 first (single `require!(remaining_accounts.len() == count_ones(mask))`). This converts the H024 stranding into a clear-error state instead of a fund-theft state. H024 still requires its own fix (caller-supplied indices) for full resolution, but H023 fix breaks the most damaging interaction.

#### Chain 3: H001 + H030 + H035 Settlement-Denial Race + Hijack

**Combined Severity:** HIGH

**Components:**
| ID | Severity | Role |
|----|----------|------|
| H001 | CRITICAL | Authority compromise precondition |
| H030 | HIGH (v1) | Live config read at settle |
| H035 | HIGH | Settle-vs-cancel race window (50min v1) |

**Combined Attack:** Authority key compromised → attacker rotates treasury → wants to settle matches before victims notice → losing players observe TX in mempool → submit competing cancel_match with higher priority fee → some settle TXs land first (attack succeeds), some are cancelled (attacker just loses TX fees). Attacker has at most 50 minutes to clear all in-flight matches.

**Mitigation:** Tightening `TIMEOUT_SECONDS >= SETTLEMENT_TIMEOUT_SECONDS` in v1 closes H035; H001 fix (propose/accept) prevents the rotation; either alone partially mitigates. Both together fully eliminate.

#### Chain 4: H001 + H042 Permanent-Lock Compound

**Combined Severity:** CRITICAL (operational)

**Components:**
- H001: One-step authority rotation (compromise = instant takeover)
- H042: GlobalConfig has no close path (key loss = permanent lock)

**Combined State Space:**
| Authority Key Status | Without H001/H042 fixes | With H001 fix only | With H042 fix only | With both fixes |
|--------------------|------------------------|--------------------|--------------------|------------------|
| Compromised | Instant total takeover | Mitigated (propose/accept) | Still takeable | Mitigated |
| Lost | Permanent lock | Still lost | Recoverable via guardian | Recoverable |
| Both events | Catastrophic + irrecoverable | Lost | Compromised | Mitigated by guardian + delay window |

H001 and H042 must be fixed **together** for completeness. The propose/accept fix for H001 partially addresses H042 if the pending-authority mechanism allows a guardian to complete rotation.

### Critical Fix Nodes (Highest-ROI)

| Finding | Attack Paths Broken if Fixed | Recommendation Priority |
|---------|------------------------------|-------------------------|
| **H023 fix (`require!` on len)** | All H023 paths, neutralizes H024+H023 chain, eliminates worst-case loop sweep | **Fix FIRST** (1-line fix per site, 4 sites, blocks 900 SOL/match theft) |
| **H044 fix (multisig L1 + separate L2 multisig)** | H001 compound chains, H002, H003, H006, H011, H030, H032, H039 (8 of audit's HIGH+CRITICAL) | **Fix SECOND** (highest blast radius — single change blocks 8 findings) |
| **H001 fix (propose/accept + timelock)** | H001 root, dampens H002, H030, H032, partially mitigates H042 | **Fix THIRD** (closes root cause; on-chain change) |
| **H035 fix (`TIMEOUT_SECONDS >= SETTLEMENT_TIMEOUT_SECONDS` in v1; pending_settle in v2)** | H035 race window + interaction with H001/H030 chain | **Fix FOURTH** (1-line constant change in v1; on-chain logic in v2) |
| **H024 fix (caller-supplied indices)** | H024 stranding pattern, completes H023 fix coverage | Fix FIFTH (architectural change to refund loop) |

---

## 10. Attack Trees

### Attack Tree 1: H023 Partial-Refund Theft

```
GOAL: Steal co-depositors' wagers from a SolShot match
│
├── PATH A: cancel_match variant (registered player, after timeout) [CRITICAL]
│   ├── PRECONDITION: Be a registered player; match passed timeout
│   │   ├── v1: TIMEOUT_SECONDS = 600 (10 min)
│   │   └── v2: match_end_ts (≥ 60 sec from activation)
│   │
│   ├── STEP 1: Call cancel_match with remaining_accounts = [own_account] [CONFIRMED]
│   │   └── Loop refunds own deposit (100 SOL); exits
│   │
│   └── STEP 2: Anchor exit hook calls close(escrow, caller) [CONFIRMED]
│       └── 900 SOL (un-refunded co-depositors' wagers) → caller
│
├── PATH B: permissionless_reclaim variant (any wallet, after grace) [CRITICAL]
│   ├── PRECONDITION: Match passed permissionless grace window
│   │   ├── v1: max(created_at, activated_at) + 1200s
│   │   └── v2: match_end_ts + 86400s (24h)
│   │
│   ├── STEP 1: Call permissionless_reclaim with remaining_accounts = [] [CONFIRMED]
│   │   └── Loop never runs (empty); state set to Cancelled
│   │
│   └── STEP 2: Anchor exit hook calls close(escrow, caller) [CONFIRMED]
│       └── 1,000 SOL (entire pot, never deposited by attacker) → caller
│
└── PATH C: H024 + H023 forced compound (any non-contiguous mask victim)
    ├── PRECONDITION: deposits_mask is non-contiguous (e.g., 0b0010)
    │   └── Created by network latency, failed deposits, intentional ordering
    │
    ├── STEP 1: No syntactically valid full-refund call exists [H024]
    │   └── Loop fails at i=0 because (mask >> 0) & 1 == 0
    │
    └── STEP 2: Attacker calls cancel_match with remaining_accounts = []
        └── close = caller sweeps stranded wager (= legitimate depositor's wager) [H023]

CRITICAL NODE: H023 fix (require!(remaining_accounts.len() == count_ones(mask)))
   — Breaks PATH A (loop now requires full accounts)
   — Breaks PATH B (empty array fails the assertion)
   — Converts PATH C from theft to clean error (depositor still stranded but H024 fix is separate)

  Fixing this single node breaks 3/3 of the H023 attack paths.
```

### Attack Tree 2: H001-Family Authority Takeover

```
GOAL: Achieve total protocol drainage via authority compromise
│
├── PATH A: Direct Layer-2 takeover (H001 + H030/H011)
│   ├── STEP 1: Compromise HPyV...nokv hot wallet [PRECONDITION]
│   │   ├── Phishing
│   │   ├── Server breach
│   │   ├── .env leak
│   │   └── Insider
│   │
│   ├── STEP 2 (parallel):
│   │   ├── settle_match for all Active escrows → 90% pot to attacker [H003/H006]
│   │   ├── update_config(new_treasury = attacker) [H001/H030] → 7%
│   │   └── update_config(new_ops = attacker) → 3%
│   │
│   └── STEP 3: Total: 100% of all in-flight pots
│       └── v2 in-flight matches partially protected (snapshot)
│
├── PATH B: Layer-1 bytecode replacement (H001 + H046)
│   ├── STEP 1: Compromise upgrade authority (same key) [H044]
│   ├── STEP 2: Deploy malicious bytecode replacement [H046]
│   └── STEP 3: Single drain_all instruction targets all MatchEscrow PDAs
│       └── Forensically invisible (looks like normal program)
│
└── PATH C: Pause + Rotate + Unpause (v1 only) [H009]
    ├── STEP 1: pause_program → blocks player exits in v1 [H016]
    ├── STEP 2: update_config(new_treasury = attacker) [H001]
    ├── STEP 3: unpause_program
    ├── STEP 4: settle_match (now to attacker) [H030]
    └── (v2 immune — cancel/settle pause-bypass)

CRITICAL NODE: H044 fix (multisig L1 + separate multisig L2)
   — Breaks PATH A (no single key for L2 attacks)
   — Breaks PATH B (no single key for L1 bytecode replacement)
   — Breaks PATH C (no single key for L2 attacks during pause)
   — Cascades: also breaks H001, H002, H011, H030, H032, H039 standalone

  Fixing this single node breaks 3/3 of the H001-family attack paths AND
  blocks 8 of the audit's HIGH+CRITICAL findings.
```

### Attack Tree 3: H035 Settlement-Denial Race

```
GOAL: Deny winner their winnings via priority-fee bidding
│
├── PRECONDITION: Be a losing player in an Active match
│
├── STEP 1: Wait for race window to open
│   ├── v1: T + 601s (TIMEOUT_SECONDS = 600)
│   └── v2: match_end_ts (per-match configurable, MIN 60s)
│
├── STEP 2: Monitor mempool for authority's settle_match TX [TRIVIAL]
│   └── Public RPC subscription
│
├── STEP 3: Submit competing cancel_match with higher priority fee
│   ├── Cost: ~$0.10–$0.30 priority fee
│   ├── Payoff: save own wager (up to 100 SOL = ~$15,000)
│   └── ROI: ~50,000:1
│
├── STEP 4 (probabilistic): cancel TX lands first
│   ├── State → Cancelled; settle_match fails (InvalidState)
│   └── Loser keeps wager; winner loses 0.8×W
│
└── STEP 5 (combination with H023 if mask non-contiguous):
    └── Loser passes empty remaining_accounts → also steals co-depositors' wagers

CRITICAL NODE: H035 fix
   v1: TIMEOUT_SECONDS = SETTLEMENT_TIMEOUT_SECONDS (3600)
       — 1-line constant change; eliminates overlap window
   v2: pending_settle: bool flag on MatchEscrow
       — Authority pre-locks settle path; cancel respects lock

CASCADE: H001 fix (propose/accept) doesn't fix H035 alone but reduces likelihood
         of compromised-authority entering the race scenario.
```

---

## 11. Severity Re-Calibration

After full holistic review, the following severity calibrations are documented. Most findings retain their investigator-assigned severity; deltas are explained.

| Finding | Investigator Severity | Final Severity | Reason |
|---------|----------------------|----------------|--------|
| H023 | CRITICAL (CVSS 9.3) | **CRITICAL** | Confirmed. Highest finding in audit. |
| H001 | CRITICAL (CVSS 8.7) | **CRITICAL** | Retained. Acknowledged design choice but blast radius matches CRITICAL — historical analogues at $30M+. |
| H044 | HIGH (CVSS 8.2) | **CRITICAL (operational)** | Upgraded qualitative tag. CVSS reflects PR:H precondition; consequence (total drainage + irrecoverable) matches CRITICAL on consequence-only basis. |
| H046 | HIGH (CVSS 8.0) | **CRITICAL (operational)** | Same reasoning as H044 — consequence-only severity. |
| H011 | MEDIUM (standalone CVSS 6.8) | **HIGH (REGRESSION +1)** | Stacked-audit policy: Feb dismissed H028 as NOT_VULN; v2 invalidates the dismissal by introducing runtime BPS mutation. Apply +1 severity escalation. |
| H024 | HIGH | **HIGH** | Retained. Combined with H023 the impact is catastrophic; standalone is fund-stranding (HIGH but not CRITICAL). |
| H030 (v1) | HIGH (CVSS 8.7) | **HIGH** | Retained. v1 live config read enables in-flight hijack. |
| H030 (v2) | MEDIUM (CVSS 5.8) | **MEDIUM** | Retained. v2 snapshot architecture meaningfully reduces blast radius. |
| H035 | HIGH (CVSS 8.5) | **HIGH** | Retained. Confirmed CVSS-supported; ROI for attacker is ~50,000:1. |
| H039 | HIGH (CVSS 7.0) | **HIGH** | Retained. POTENTIAL classification reflects authority-precondition; if precondition met, severity is HIGH. |
| H016 | HIGH qualitative (CVSS 4.9) | **HIGH (qualitative)** | Retained. CVSS reduced from Feb's 6.6 due to tighter 20-min window, but trust violation justifies HIGH qualitative severity. |
| H017 | HIGH qualitative (CVSS 6.0) | **HIGH (qualitative)** | Retained. CVSS suppressed by AC:H/PR:H but fairness implications in wagered context warrant HIGH. |
| H041 | LOW (~0.002 SOL rent theft) | **LOW** | Retained. Superseded in severity by H023 but documented standalone. |

**Net re-calibration changes:** 4 findings adjusted (H011 +1 for REGRESSION; H044/H046 qualitative tag upgrade; documentation of H030 v1/v2 split). All other severities are internally consistent.

---

## 12. Strategic Recommendations

### Priority 1 — BLOCK MAINNET DEPLOYMENT

**These MUST land before mainnet. Refusing to deploy is the correct posture if any item is open.**

1. **[ ] Fix H023 partial-refund theft** at all 4 sites:
   - `programs/solshot-escrow/src/lib.rs:393-410` (cancel_match)
   - `programs/solshot-escrow/src/lib.rs:465-484` (permissionless_reclaim)
   - `programs/solshot-escrow-v2/src/lib.rs:502-518` (cancel_match)
   - `programs/solshot-escrow-v2/src/lib.rs:561-577` (permissionless_reclaim)
   
   Add: `require!(ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize, EscrowError::IncompleteRefund);` before each loop.

2. **[ ] Fix H044/H046 — Layer-1 + Layer-2 key separation:**
   - Transfer Layer-1 upgrade authority to a Squads multisig (3-of-5 minimum)
   - Rotate Layer-2 `GlobalConfig.authority` to a separate multisig
   - Document the upgrade path

3. **[ ] Fix H001 — Two-step authority transfer** in both programs:
   - Add `pending_authority` field to `GlobalConfig` 
   - Add `propose_authority` and `accept_authority` instructions
   - 24h timelock on `treasury` / `ops` / (v2) `fee_bps_*` rotation

### Priority 2 — Pre-Mainnet Requirements

**Should land before mainnet. Not blocking but high-impact.**

1. **[ ] Fix H024 — non-contiguous mask refund** (architectural):
   - Refactor refund loops to accept caller-supplied `refund_indices: Vec<u8>`
   - Apply at all 4 refund sites
   
2. **[ ] Fix H035 settle-vs-cancel race:**
   - v1: change `TIMEOUT_SECONDS` to 3600 (eliminates 50-min overlap)
   - v2: add `pending_settle: bool` flag on MatchEscrow with timeout

3. **[ ] Fix H030 timelock:** Add `pending_treasury` / `pending_ops` with 24h delay

4. **[ ] Fix H011 BPS individual cap + timelock** (v2):
   - Add per-field cap check before assignment
   - Add `last_bps_update_ts` and minimum delay between rotations
   - Expose BPS snapshot in `MatchCreated` event

5. **[ ] Fix H039 unbounded duration:** Reduce `MAX_DURATION_SECS` to 86400 (24h)

6. **[ ] Fix H042 — add guardian recovery:**
   - Add `guardian: Pubkey` field
   - Add `initiate_recovery` (guardian-callable) and `finalize_recovery` (anyone-callable after delay) instructions

7. **[ ] Fix H016/H009 v1 pause griefing:**
   - Remove `constraint = !config.is_paused` from `v1:704` (settle) and `v1:729` (cancel)
   
8. **[ ] Fix H017 v1 silent-kick:** Add `MIN_DEPOSIT_WINDOW_SECS = 30s` floor in `start_with_depositors`

9. **[ ] Fix H025 executable account check:** One-line constraints at v1:684-697, v2:715-728:
   - `constraint = !treasury.executable @ EscrowError::InvalidTreasury`
   - `constraint = !ops.executable @ EscrowError::InvalidOps`

10. **[ ] Fix H018 v2 deposit-deadline edge:** Change `<=` to `<` at `v2:257`

### Priority 3 — Post-Launch Improvements

1. [ ] H040 — Update stale 48-hour comment at `v1:22-23`
2. [ ] H043 — Emit `ProgramPaused`/`ProgramUnpaused` events
3. [ ] H045 — Add `actor` field to `ConfigUpdated` event
4. [ ] H049 — Increase `randomBytes(4)` to `randomBytes(8)` server-side
5. [ ] H033 — Add `max_activation_delay_secs` to `start_with_depositors`
6. [ ] H038 — Consider raising `MIN_DURATION_SECS` from 60s to 120s+ to widen drift tolerance margin

### Critical Fix Nodes (Highest ROI, Ranked)

| Rank | Finding | Effort | Attack Paths Broken |
|------|---------|--------|---------------------|
| 1 | **H023** (require!(len)) | 1 line × 4 sites + 1 error variant | All H023 + H024+H023 + part of H035 chain |
| 2 | **H044** (multisig L1 + L2) | Operational (pre-mainnet checklist) | 8 findings: H001, H002, H003, H006, H011, H030, H032, H039 |
| 3 | **H001** (propose/accept + timelock) | Significant on-chain change | H001 root + dampens H002, H030, H032; partially mitigates H042 |
| 4 | **H035** (constant change v1) | 1-line constant change | H035 race + interaction chains |
| 5 | **H024** (refund_indices) | Architectural change to refund loops | H024 + completes H023 fix coverage |

---

## 13. NOT VULNERABLE Summary

These 18 hypotheses were investigated and confirmed safe on the current code.

| ID | Hypothesis | Why Safe |
|----|------------|----------|
| H004 | S004 RECHECK — PDA pre-squat DoS | Fix landed: `has_one = authority` at v1:625, v2:659 |
| H005 | H008 RECHECK — PDA occupancy DoS | Subsumed by S004 fix; unauthorized callers blocked |
| H010 | Distinctness bypass via update_config | Re-validated post-update at v1:96-98, v2:125-127 |
| H012 | v1 BPS const immutability | `const u64` at compile-time; only Layer-1 upgrade can change |
| H013 | Lamport underflow on v2 N-player refund | Per-iteration bit-set gating + overflow-checks=true |
| H014 | u128→u64 narrowing at v2 settle | 100 SOL × 10 = 10^12 lamports ≪ u64::MAX |
| H015 | Lamport credit overflow on destinations | Realistic max well below u64::MAX; defense-in-depth gap only |
| H019 | GlobalConfig re-init | Anchor `init` constraint at v1:547, v2:575 prevents |
| H020 | PDA close-and-revive | OC-10 drains funds before close; revival yields fresh state |
| H021 | Permissionless reclaim during pause | Intentional design (escape hatch); v1 PermissionlessReclaim has no config in struct |
| H022 | Settlement deadline bypass via activated_at | activated_at always set in same block as state=Active |
| H026 | Donation attack (lamport inflation) | Attacker loses money — economically irrational |
| H027 | Atomic-TX rollback under Anchor 0.32.1 | All `?` propagation; transaction atomicity guaranteed |
| H028 | Pubkey::default() in zero-padded slots | All loops bounded by `max_players`; default slots never iterated |
| H029 | Asymmetric pot-vs-mask scaling | All loops use `max_players` bound; mask bits past max never checked |
| H031 | Rent extraction at low wagers | Rent cycle economically neutral; close=caller balance with create rent |
| H047 | is_writable enforcement on refund accounts | Anchor + Solana runtime enforce writable flag at TX construction |
| H048 | Default-pubkey bypass in permissionless_reclaim | Pubkey::default() cannot sign Solana TXs; runtime-prevented |

---

## 14. Coverage Verification

Per `.audit/COVERAGE.md`:

- **20/20 instructions covered** (10 unique × 2 programs — initialize_config, update_config, pause_program, unpause_program, create_match, deposit_wager, settle_match, cancel_match, permissionless_reclaim, start_with_depositors)
- **8/8 relevant EP categories** (Oracle correctly skipped — no oracles in scope per KB_MANIFEST.md)
- **8/10 pre-mainnet checklist items** explicitly addressed by findings
- **3 minor gaps identified** (0 critical, 1 medium, 2 low):
  - **G001 (MEDIUM)**: Compute budget exhaustion on v2 10-player refund loop — not directly investigated. Recommend LiteSVM measurement of CU consumption.
  - **CHECKLIST-GAP-01 (LOW)**: Solana blockhash expiry as settle-replay defense — runtime-handled, no on-program gap; documentation only.
  - **CHECKLIST-GAP-02 (MEDIUM)**: Same as G001 (compute budget) interacting with H023 partial-refund path.

**No CRITICAL or HIGH coverage gaps were identified.**

The compute-budget concern (G001) interacts directly with H023 — if a 10-player reclaim TX exceeds 1.4M CU, callers must use partial accounts, which triggers H023's theft path. **The H023 fix (`require!` len assertion) makes the partial-account path fail cleanly with an error rather than silently stealing funds**, which substantially mitigates the G001 worst-case interaction. After H023 is fixed, G001 reduces to a denial-of-refund concern (still relevant but no longer compounds with theft).

---

## 15. Audit Lineage

| # | Date | Git Ref | Confirmed | Potential | Files Scanned | Top Severity |
|---|------|---------|-----------|-----------|---------------|--------------|
| 1 | 2026-02-23 | `ecfd03b` | 12 | 5 | 1 (v1 only, 855 LOC) | CRITICAL (S004) |
| 2 | 2026-05-07 | `226c0cd` | 22 | 6 | 2 (v1+v2, 1982 LOC) | CRITICAL (H023) |

### Delta from Audit #1

- Scope grew: 1 file → 2 files (+1020 LOC v2 net new, +247 LOC v1 modifications)
- v1 evolved from 1v1-only to N-player (2-4) with `start_with_depositors`, `permissionless_reclaim`, expanded state machine, S004 fix
- v2 introduced: configurable BPS, per-match snapshot, async timing, hard deposit window, expanded MAX_PLAYERS to 10
- 4 Feb findings RESOLVED (S004, H003, H006-deadzone, H008)
- 9 Feb findings RECURRENT (H001 family + design limitations)
- 1 REGRESSION (H028 dismissal invalidated on v2 → H011)
- 13 NOVEL findings discovered (8 on v2-specific surfaces, 5 on shared/v1-specific)

### Recurring Findings (Persisting Across 2+ Audits)

> **Attention**: H001 has persisted across both audits. Per JJ this is intentional pre-mainnet posture; should be resolved before mainnet.

| ID | Title | Severity | Audits Present | Notes |
|----|-------|----------|----------------|-------|
| H001 | One-step authority transfer | CRITICAL | 2 (Feb + May) | JJ-acknowledged pre-mainnet; mainnet-blocking |
| H002 (Feb) → H030 (May) | Fee destination hijack | HIGH (v1) / MED (v2) | 2 | v2 partial mitigation via snapshot |
| H005 (Feb) → H003 (May) | Authority winner fraud | HIGH | 2 | Design limitation; needs identity binding |
| H011 (Feb) → H002 (May) | Treasury self-redirect | HIGH | 2 | Same root cause; same fix (timelock) |
| H016 (Feb) → H041 (May) | close=caller rent theft | LOW | 2 | Superseded by H023 in May |
| H009 (Feb) → H025 (May) | Executable-account fee destination | MEDIUM | 2 | One-line fix still not landed |

---

## 16. Appendix

### A. Methodology References

- `C:/Users/johnk/SolShot/.claude/skills/stronghold-of-security/agents/final-synthesizer.md` — Synthesis methodology
- `C:/Users/johnk/SolShot/.claude/skills/stronghold-of-security/knowledge-base/core/severity-calibration.md` — Severity standards
- `C:/Users/johnk/SolShot/.claude/skills/stronghold-of-security/knowledge-base/core/common-false-positives.md` — False-positive patterns
- `C:/Users/johnk/SolShot/.claude/skills/stronghold-of-security/knowledge-base/PATTERNS_INDEX.md` — ~128 EP catalogue
- `C:/Users/johnk/SolShot/.claude/skills/stronghold-of-security/templates/FINAL_REPORT.md` — Report template

### B. Files Analyzed

| File | Focus Areas | Findings |
|------|-------------|----------|
| `programs/solshot-escrow/src/lib.rs` (962 LOC) | All 7 (Access Control, Arithmetic, State Machine, CPI, Token/Economic, Upgrade/Admin, Timing) | All findings except H011 (v2 only), H039 (v2 only), H033 (v2 only), H018 (v2 only), H038 (v2 only) |
| `programs/solshot-escrow-v2/src/lib.rs` (1020 LOC) | All 7 | All findings except H012 (v1-only verification), H016/H017/H009 (v1-only attacks) |
| `Anchor.toml` | Upgrade/Admin | H044, H046 |
| `Cargo.toml` (workspace) | Arithmetic | overflow-checks=true verification |
| `server/socket-io/main.js` | Off-chain (will be DB audit scope) | H049 (cross-domain) |
| Anchor 0.32.1 source (`anchor-lang`, `anchor-syn`) | CPI | H023 (close runtime semantics + exit timing) |

### C. Coverage Matrix (Findings × Instruction)

| Instruction | v1 Findings | v2 Findings |
|-------------|------------|-------------|
| `initialize_config` | H008, H011, H032, H042 | H008, H011, H032, H042 |
| `update_config` | H001, H002, H010, H030, H043 | H001, H002, H010, H011, H030, H032, H043 |
| `pause_program` | H001, H009, H016, H043 | H001, H043 |
| `unpause_program` | H009, H043 | H043 |
| `create_match` | H002, H004, H011, H016 | H002, H011, H030, H032, H039, H045 |
| `deposit_wager` | H016, H037 | H018, H037 |
| `settle_match` | H001, H003, H030, H035 | H001, H003, H011, H030, H032, H035 |
| `cancel_match` | H016, H023, H024, H035, H041 | H023, H024, H035, H039, H041 |
| `permissionless_reclaim` | H023, H024, H040, H041 | H023, H024, H039, H041 |
| `start_with_depositors` | H016, H017 | H033, H039 |

### D. Finding Cross-Reference Table

| Finding | Origin Audit | Status | Combination Refs |
|---------|--------------|--------|------------------|
| H001 | Feb (RECURRENT) | CONFIRMED | H002, H011, H030, H035, H039, H042, H044, H046 |
| H023 | May (NEW) | CONFIRMED | H024 (compound), H035 (compound) |
| H024 | May (NEW) | CONFIRMED | H023 (compound) |
| H044 | May (NEW NOVEL) | CONFIRMED | All H001-family findings |
| H046 | May (NEW NOVEL) | CONFIRMED | H044, H001, H042 |
| H011 | May (REGRESSION of Feb H028) | CONFIRMED | H001, H002, H030, H032 |

### E. Historical Precedents (Cost-of-Getting-This-Wrong)

| Incident | Date | Pattern | Loss | SolShot Analog |
|----------|------|---------|------|----------------|
| Step Finance | Jan 2026 | Hot-wallet key exfiltration | $30-40M | H001 + H044 |
| Garden Finance | Oct 2025 | Admin key, settlement manipulation | $11M | H001 + H030 + H003 |
| Pump.fun | May 2024 | Admin key via insider | $1.9M | H001 + H006 |
| Raydium | Dec 2022 | Hot-wallet admin key compromise | $4.4M | H001 + H030 |

---

## Disclaimer

This automated security audit represents a comprehensive starting point for security hardening but does not guarantee the absence of vulnerabilities.

**This audit does NOT replace:**
- Manual expert security review
- Formal verification (recommended for the math invariants — see BOK audit)
- Comprehensive test coverage (note: BOK Feb verified pot conservation and dust bounds for v1; v2's configurable BPS requires re-BOK)
- Bug bounty programs
- Ongoing security monitoring

**Limitations:**
- Off-chain code (server, client, Privy migration) is OUT OF SCOPE for this audit. A separate **DB (off-chain) audit** will address those concerns.
- Math invariants (pot conservation, dust bounds, configurable BPS math) require runtime verification via Kani/LiteSVM. A separate **BOK audit** will run these proofs.
- Compute-budget exhaustion (G001) requires LiteSVM measurement on actual deployment; the synthesis judges it MEDIUM but not critical-path.
- Live devnet PoC for H023 was NOT executed during this audit. The vulnerability is confirmed by static analysis of Anchor 0.32.1 source code (deterministic, no ambiguity), but a live PoC would provide additional confidence and is recommended pre-fix verification.
- Behavioral question on H025 (whether `try_borrow_mut_lamports` returns `Err` on executable accounts vs silently discarding the credit) is unresolved without devnet test. CVSS reflects worst-case (silent burn).

**Recommendation:** Engage a professional Solana security firm (e.g., Halborn, Hacken, OtterSec) for a manual audit before mainnet deployment, especially given the SOL TVL exposure profile of a wagered gaming protocol at scale.

Security is a continuous process, not a one-time event.

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report Generated | 2026-05-07 |
| Stronghold of Security Version | 1.0.0 |
| Audit Number | #2 |
| Previous Audits | 1 (Feb 2026) |
| Strategies Investigated | 50 |
| CRITICAL Findings | 4 |
| HIGH Findings | 14 |
| MEDIUM Findings | 4 |
| LOW Findings | 6 |
| NOT_VULNERABLE Re-Validated | 18 |
| Verification Agents | 0 (skipped due to massive rewrite per HANDOVER.md) |

---

**End of Report**
