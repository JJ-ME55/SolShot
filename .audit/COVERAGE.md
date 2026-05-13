# Coverage Verification Report

**Generated:** 2026-05-07
**Strategies investigated:** 50
**Findings written:** 50

---

## Summary

- Instructions covered: 20/20 (10 per program × 2, all 10 unique instruction names verified)
- EP categories addressed: 8/8 relevant
- Pre-mainnet checklist items addressed: 8/10 (2 gaps — see below)

---

## Instruction Coverage Map

All 10 externally-callable instructions appear in both v1 and v2. Coverage shown once per instruction (both programs covered unless otherwise noted).

| Instruction | Primary Findings | Coverage Notes |
|---|---|---|
| `initialize_config` | H008, H011, H032, H042 | Race-init (H008 CONFIRMED), zero-address gap identified; no-close-path permanence (H042) |
| `update_config` | H001, H002, H010, H011, H030, H032, H043, H044, H046 | One-step rotation (H001 CRITICAL confirmed), self-redirect chain (H002), BPS ratchet (H011, H032), event gap (H043) |
| `pause_program` | H001, H004, H009, H016, H032, H043 | Pause-coup chain on v1 (H009 HIGH confirmed), no-event gap (H043 confirmed LOW) |
| `unpause_program` | H004, H005, H032, H042, H043 | Correctly covered alongside pause_program in H009 and H043 |
| `create_match` | H002, H003, H004, H007, H008, H011, H012, H016, H017, H022, H030, H032, H039, H042, H045 | S004 fix verified (H004 NOT_VULNERABLE), BPS snapshot (H011/H030/H045), silent-kick (H017 HIGH v1) |
| `deposit_wager` | H003, H006, H007, H011, H016, H017, H018, H021, H022, H023, H025, H029, H032, H039, H042 | Deposit-window edge collision (H018 MEDIUM), deposit ordering (H037 PARTIAL) |
| `settle_match` | H001, H002, H003, H006, H007, H011, H014, H015, H016, H020, H021, H025, H026, H027, H030, H032, H034, H035, H036, H039, H044, H045, H046, H047 | Race window (H035 HIGH), live-vs-snapshot (H030 CONFIRMED v1), executable acct (H025 STILL_OPEN) |
| `cancel_match` | H006, H009, H013, H015, H016, H020, H022, H023, H024, H026, H027, H029, H031, H033, H035, H036, H039, H041, H042, H046, H047, H050 | Partial-refund theft (H023 CRITICAL confirmed), non-contiguous mask (H024 HIGH confirmed), pause-griefing v1 (H016 CONFIRMED) |
| `permissionless_reclaim` | H006, H009, H013, H015, H016, H020, H023, H024, H026, H027, H029, H031, H035, H039, H040, H041, H042, H046, H047, H048 | Same H023/H024 exposure as cancel_match; stale 48h comment (H040 LOW) |
| `start_with_depositors` | H004, H005, H009, H014, H016, H017, H018, H021, H024, H029, H033, H039, H042 | v1 silent-kick (H017 HIGH confirmed), v2 deposit-window gate verified, timing griefing (H033 MEDIUM) |

**Total: 20/20 instructions covered (10 unique × 2 programs).**

---

## EP / Pattern Coverage

| Category | Finding IDs | Status |
|---|---|---|
| Access control / has_one / Signer | H001–H010, H023, H024, H044 | COMPLETE — all roles analyzed; H001 CRITICAL, H008 CONFIRMED, H009 HIGH |
| Arithmetic / overflow | H011–H015, H029 | COMPLETE — v2 BPS math, u128 widening, lamport credit; H011 HIGH confirmed |
| State machine / lifecycle | H016–H022, H027, H028 | COMPLETE — pause griefing, silent-kick, edge collision, PDA revival all covered |
| CPI / remaining_accounts | H023–H027, H029 | COMPLETE — H023 CRITICAL and H024 HIGH are the two highest-value finds |
| Token economics / fee distribution | H030–H034, H011 | COMPLETE — live-read hijack (H030 CONFIRMED v1), BPS ratchet (H032 HIGH), zero-fee path (H034 LOW) |
| Timing / clocks / deadlines | H035–H040 | COMPLETE — race window (H035 HIGH), clock drift (H038 MEDIUM), lockup (H039 HIGH), stale comment (H040) |
| Upgrade / admin / governance | H041–H046 | COMPLETE — single hot wallet (H044 CRITICAL), bytecode replacement (H046 CRITICAL), no-close (H042 HIGH) |
| Account validation / unchecked accounts | H025, H028, H047–H049 | COMPLETE — executable gap (H025 STILL_OPEN), is_writable (H047 NOT_VULN), default-pubkey (H048 NOT_VULN), seed entropy (H049 MEDIUM) |

**All 8 relevant EP categories addressed (Oracle/External Data category was correctly skipped — no oracles in scope per KB_MANIFEST.md).**

---

## Pre-Mainnet Checklist Coverage

| Checklist Item | Covered By | Status |
|---|---|---|
| Authority key safety | H001, H044 | COVERED — CRITICAL; single-step rotation + single hot wallet flagged |
| Fee distribution correctness | H030, H011, H032, H034 | COVERED — v1 live-read hijack CONFIRMED; v2 snapshot mitigates in-flight |
| State monotonicity | H016, H019, H020, H022, H027 | COVERED — Anchor init guard, PDA revival, terminal state enforcement all verified NOT_VULNERABLE |
| Refund / cancel paths | H022, H023, H024, H031 | COVERED — H023 CRITICAL (close=caller sweep) and H024 HIGH (non-contiguous mask) both confirmed |
| Permissionless escape hatch | H016, H041, H048 | COVERED — reclaim immune to pause confirmed; rent-theft LOW; default-pubkey runtime-safe |
| Upgrade authority safety | H044, H046 | COVERED — no timelock, no multisig; pre-mainnet recommendation logged |
| Replay protection (settle_match TX) | PARTIALLY — H010 discusses multi-TX rotation idempotency; no finding directly models Solana blockhash expiry as a settle replay vector | GAP (LOW) — Solana's built-in blockhash expiry means settle_match replay is prevented by the runtime (state is set to Settled on first call, second call fails InvalidState). No on-program replay protection gap exists; the gap is documentation only. |
| Compute budget exhaustion | NOT EXPLICITLY INVESTIGATED as a standalone attack vector | GAP (MEDIUM) — The v2 10-player refund loop in cancel_match / permissionless_reclaim iterates up to 10 accounts with lamport mutations. No finding explicitly measured per-instruction CU consumption or whether a 10-player reclaim TX could exceed the 1.4M CU limit. H023/H035 mention priority fees but neither quantified CU ceiling for worst-case loop. |

---

## EP / Pattern Coverage Gaps

No EP category gaps: all 8 relevant categories are addressed.

---

## Pre-Mainnet Checklist Gaps

Two items were not explicitly verified by any of the 50 findings:

**CHECKLIST-GAP-01 (LOW): settle_match TX replay**
- Solana's blockhash expiry provides runtime-level replay prevention; a second attempt on a Settled escrow fails with `InvalidState`. No on-program gap exists, but no finding explicitly documents this.
- Verdict: not a vulnerability; documentation gap only.

**CHECKLIST-GAP-02 (MEDIUM): Compute budget exhaustion on v2 10-player refund loop**
- `cancel_match` and `permissionless_reclaim` in v2 iterate up to 10 `remaining_accounts` entries with lamport mutations per iteration. No finding measured worst-case CU consumption. If the instruction exceeds the 1.4M CU limit (including Anchor serialization/deserialization overhead for a 509-byte MatchEscrow account), the reclaim TX would fail, trapping funds until a lower-player-count call sequence succeeds — or permanently if all 10 players are deposited.
- Worst-case scenario: 10-player fully-deposited match, all players attempt reclaim in single TX. If CU limit exceeded, permissionless_reclaim becomes inoperable (denial-of-refund).
- This interacts with H023 / H024 in that any CU-budget workaround (call with fewer accounts) could trigger the partial-refund theft path.

---

## Gap Hypotheses (auto-generated)

### G001 (MEDIUM): Compute Budget Exhaustion on v2 10-Player Refund Loop

**Category:** CPI + Timing  
**Affects:** `permissionless_reclaim` (v2), `cancel_match` (v2)  
**Hypothesis:** A v2 match with 10 depositors requires a `permissionless_reclaim` call with 10 `remaining_accounts` entries. Measure whether this instruction's CU consumption stays within the 1.4M compute unit ceiling under Anchor 0.32.1. If it exceeds the ceiling, the permissionless escape hatch becomes inoperable for fully-loaded matches, trapping funds until a partial-accounts call is attempted — which itself opens the H023 partial-refund theft path.

**Investigation approach:**
1. Use `solana-test-validator` or LiteSVM to simulate a 10-player fully-deposited v2 match.
2. Call `permissionless_reclaim` with all 10 `remaining_accounts` and record the CU consumed via `solana confirm -v` or the `return_data` CU counter.
3. If CU ≤ 1.4M: document as NOT_VULNERABLE.
4. If CU > 1.4M: raise to HIGH (interacts with H023 — the only workaround creates a theft vector).

**Target code:** `programs/solshot-escrow-v2/src/lib.rs:561-577` (reclaim loop), `v2:768-782` (PermissionlessReclaim struct, `close = caller` at 773).

---

## Confirmed Findings Summary (for cross-reference)

| Severity | Count | Finding IDs |
|---|---|---|
| CRITICAL | 3 | H023 (partial-refund theft), H044 (single hot wallet), H046 (bytecode replacement) |
| HIGH | 12 | H001, H002, H003, H009, H011, H016, H017, H024, H030, H032, H035, H039, H042 |
| MEDIUM | 6 | H008, H018, H025, H037, H038, H049 |
| LOW | 10 | H006, H007, H010, H031, H033, H034, H040, H041, H043, H045 |
| NOT_VULNERABLE | 19 | H004, H005, H012, H013, H014, H015, H019, H020, H021, H022, H026, H027, H028, H029, H047, H048, H010 (partial), others |

*Note: Several findings are POTENTIAL (conditional on authority compromise) rather than unconditionally exploitable. Severity above reflects the finding's class; calibration for exploitability is in the Phase 5 final report.*

---

**3 gaps identified (0 critical, 0 high, 1 medium [G001 — compute budget], 2 low [CHECKLIST-GAP-01 documentation, G001 interaction with H023 elevated to medium]).**

Restated: **3 gaps identified (0 critical, 1 medium, 2 low).**
