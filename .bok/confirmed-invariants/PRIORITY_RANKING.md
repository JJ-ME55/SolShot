# Confirmed Invariants — Priority Ranking

**Total: 41 invariants** (39 agent-proposed + 2 custom)
**Generated:** 2026-05-07
**Verification mode:** Degraded (Kani unavailable on Windows). All invariants assigned to LiteSVM, Proptest, or both.

---

## Priority Tiers

Critical-path functions and SOS-flagged regions are tested first. Regression guards on fix-bundle changes are also high-priority since they confirm the recent fixes haven't broken anything.

### Tier 1 — CRITICAL (test first)

These cover the audit-bundle fixes and the highest-stakes economic paths.

| ID | Title | Tool | Source File |
|---|---|---|---|
| **I-REF-1** | Refund len == count_ones (POST-H023-FIX) | LiteSVM | `02-pot-and-refund.md` |
| **I-REF-5** | Non-contiguous mask correctly REJECTED (POST-H023-FIX) | LiteSVM | `02-pot-and-refund.md` |
| **I-REF-2** | Refund conservation Σ = wager × count_ones | Both | `02-pot-and-refund.md` |
| **I-FEE-1** | Pot conservation across configurable BPS (v2) | Proptest | `01-settle-and-cap.md` |
| **I-FEE-2** | Dust ≤ 2 lamports for all valid BPS pairs (v2) | Proptest | `01-settle-and-cap.md` |
| **I-CAP-1** | Cap holds at initialize_config (v2) | Both | `01-settle-and-cap.md` |
| **I-CAP-2** | Cap holds at update_config (v2) | Both | `01-settle-and-cap.md` |
| **I-CAP-3** | Per-match snapshot atomic at create_match (v2) | LiteSVM | `01-settle-and-cap.md` |
| **I-CAP-4** | Settle reads only snapshot, never live config (v2) | LiteSVM | `01-settle-and-cap.md` |
| **I-POT-4** | v1 timing gate post-H017-fix | LiteSVM | `02-pot-and-refund.md` |
| **INV-3** | v1 cancel-deadline == settle-deadline (POST-H035-FIX) | LiteSVM | `03-timestamp.md` |
| **INV-5** | v2 strict `<` deposit-deadline (POST-H018-FIX) | LiteSVM | `03-timestamp.md` |
| **I-CUSTOM-1** | Per-match zero-leakage (refund == deposit) | LiteSVM | `04-custom.md` |

**13 Tier 1 invariants.**

### Tier 2 — HIGH (test second)

| ID | Title | Tool | Source File |
|---|---|---|---|
| **I-FEE-3** | No underflow via cap (v2) | Proptest | `01-settle-and-cap.md` |
| **I-FEE-4** | u128 widening headroom | Proptest | `01-settle-and-cap.md` |
| **I-FEE-7** | Cancel/refund conservation cross-checked with REF cluster | LiteSVM | `01-settle-and-cap.md` |
| **I-CAP-5** | Default BPS matches 90/7/3 spec | LiteSVM regression | `01-settle-and-cap.md` |
| **I-POT-1** | Pot = wager × count_ones post-compaction | Both | `02-pot-and-refund.md` |
| **I-POT-2** | Compaction preserves depositor set | Both | `02-pot-and-refund.md` |
| **I-POT-3** | MIN_PLAYERS=2 enforced | Proptest | `02-pot-and-refund.md` |
| **I-REF-3** | escrow.lamports never goes negative | Both | `02-pot-and-refund.md` |
| **I-REF-4** | Each refund == wager (no fee on refunds) | Proptest | `02-pot-and-refund.md` |
| **I-REF-6** | Per-iteration pubkey match enforced | LiteSVM | `02-pot-and-refund.md` |
| **I-BIT-1** | Bit count ≤ max_players | Both | `02-pot-and-refund.md` |
| **I-BIT-2** | No bit collision (no double-deposit) | LiteSVM | `02-pot-and-refund.md` |
| **I-BIT-3** | Compaction mask = (1<<j)−1 | Proptest | `02-pot-and-refund.md` |
| **INV-1** | No deadline-addition overflow | Proptest | `03-timestamp.md` |
| **INV-2** | Monotonic deadline ordering | Proptest | `03-timestamp.md` |
| **INV-7** | v2 duration bounded [60, 86400] (POST-H039-FIX) | Proptest | `03-timestamp.md` |
| **INV-8** | activated_at set-once atomic with state=Active | LiteSVM | `03-timestamp.md` |
| **INV-10** | v1 MIN_DEPOSIT_WINDOW=600 gate (POST-H017-FIX) | LiteSVM | `03-timestamp.md` |
| **I-CUSTOM-2** | CPI surface lockdown | LiteSVM + static | `04-custom.md` |

**19 Tier 2 invariants.**

### Tier 3 — MEDIUM-LOW (test last)

| ID | Title | Tool | Source File |
|---|---|---|---|
| **I-FEE-5** | Zero/near-zero BPS waiver path valid | Proptest | `01-settle-and-cap.md` |
| **I-FEE-6** | Fee monotonicity across BPS and player count | Proptest | `01-settle-and-cap.md` |
| **I-FEE-8** | Snapshot fields write-once | LiteSVM | `01-settle-and-cap.md` |
| **I-BIT-4** | Shift amount within type width | Proptest | `02-pot-and-refund.md` |
| **I-BIT-5** | Bit-set/bit-test round-trip | Proptest | `02-pot-and-refund.md` |
| **INV-4** | v1 PERMISSIONLESS_RECLAIM doc-comment matches value (POST-H040-FIX) | Static const_assert + LiteSVM | `03-timestamp.md` |
| **INV-6** | v2 deposit_window bounded [60, 86400] | Proptest | `03-timestamp.md` |
| **INV-9** | Reclaim grace minimum | Proptest | `03-timestamp.md` |
| **INV-11** | Clock sysvar read correctness | Static analysis | `03-timestamp.md` |
| **INV-12** | u32→i64 cast safety | Proptest | `03-timestamp.md` |

**10 Tier 3 invariants.**

---

## Tool Distribution

- **LiteSVM (runtime test):** 24 invariants (some shared with Proptest)
- **Proptest (property test):** 29 invariants (some shared with LiteSVM)
- **Static analysis (const_assert / source-grep):** 3 invariants (INV-4, INV-11, I-CUSTOM-2 partial)

Note: counts overlap because some invariants are tested by both LiteSVM and Proptest. Total distinct invariants: 41.

---

## Generation Plan

The next phase (`/BOK:generate`) will create:

1. **Per-version test directories:**
   - `programs/solshot-escrow/tests/bok_*.rs` — UPDATE existing files with new constants + add Tier-1 regression tests
   - `programs/solshot-escrow-v2/tests/bok_*.rs` — NEW directory + files (v2 was untested by Feb run)

2. **Test file structure (target):**
   - `bok_litesvm.rs` — runtime simulation tests (LiteSVM-flagged invariants)
   - `bok_proptest_fee.rs` — fee/pot calculation property tests
   - `bok_proptest_timestamp.rs` — timing property tests
   - `bok_proptest_space.rs` — account space allocation tests (kept from Feb, unchanged)
   - `bok_proptest_refund.rs` — NEW — refund-loop conservation property tests (covers H023 regression)
   - `bok_proptest_bitfield.rs` — NEW — deposits_mask invariants
   - `bok_static_lockdown.rs` — NEW — static-grep + const_assert checks (CPI lockdown, doc-integrity)

3. **Worktree isolation:** All generated test code goes in a temporary git worktree; main working tree is untouched until you review.
