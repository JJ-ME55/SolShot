# BOK Proptest Results — SolShot Escrow

**Executed:** 2026-02-23
**Mode:** Degraded (Kani unavailable — Windows)
**Tool:** Proptest 1.x with 10,000 iterations per property
**Workspace:** `.bok/worktree` (branch `bok/verify-1771880711`)

---

## Suite 1: Fee Calculations (`bok_proptest_fee.rs`)

| # | Test | Invariant | Result | Notes |
|---|------|-----------|--------|-------|
| 1 | `fee_inv_1_conservation_of_value` | FEE-INV-1 | **PASS** | winner + treasury + ops == total_pot |
| 2 | `fee_inv_2_winner_floor_guarantee` | FEE-INV-2 | **PASS** | winner >= 90% of total_pot |
| 3 | `fee_inv_3_treasury_ops_ratio` | FEE-INV-3 | **PASS** | treasury:ops == 7:3 (within rounding) |
| 4 | `fee_inv_4_no_negative_winner` | FEE-INV-4 | **PASS** | fees < total_pot always |
| 5 | `fee_inv_5_dust_bound` | FEE-INV-5 | **PASS** | dust <= 2 lamports (corrected from 1) |
| 6 | `fee_inv_6_u128_path_equivalence` | FEE-INV-6 | **PASS** | u128 intermediate matches expected |
| 7 | `fee_inv_9_bps_addition` | FEE-INV-9 | **PASS** | TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR |
| 8 | `fee_inv_10_monotonic_fees` | FEE-INV-10 | **PASS** | higher wager => higher fees (monotonic) |
| 9 | `fee_inv_11_deterministic` | FEE-INV-11 | **PASS** | same input => same output |
| 10 | `fee_boundary_min_wager` | FEE-boundary | **PASS** | MIN_WAGER produces treasury >= 1, ops >= 1 |
| 11 | `fee_boundary_max_wager` | FEE-boundary | **PASS** | MAX_WAGER: no overflow in u128 path |
| 12 | `fee_inv_5_dust_bound_targeted` | FEE-INV-5 | **PASS** | targeted dust at known worst-case wagers |

**Subtotal: 12 passed, 0 failed**
**Runtime: ~0.46s**

### Notable Finding
FEE-INV-5 dust bound is **2 lamports**, not 1. Proptest found a counterexample at `wager = 35,035,927,876` where two independent floor divisions each truncate 1 lamport. This is correct economic behavior (always favors the winner via the remainder pattern), not a bug.

---

## Suite 2: Timestamp & Duration (`bok_proptest_timestamp.rs`)

| # | Test | Invariant | Result | Notes |
|---|------|-----------|--------|-------|
| 1 | `ts_inv_1a_timeout_no_overflow` | TS-INV-1a | **PASS** | created_at + TIMEOUT no overflow |
| 2 | `ts_inv_1b_settlement_no_overflow` | TS-INV-1b | **PASS** | activated_at + SETTLEMENT no overflow |
| 3 | `ts_inv_1c_reclaim_no_overflow` | TS-INV-1c | **PASS** | created_at + 2*TIMEOUT no overflow |
| 4 | `ts_inv_2a_timeout_ordering` | TS-INV-2a | **PASS** | SETTLEMENT < TIMEOUT < RECLAIM |
| 5 | `ts_inv_2b_timeout_mutual_exclusion` | TS-INV-2b | **PASS** | no instant satisfies both settlement and timeout |
| 6 | `ts_inv_3_activated_at_bounds` | TS-INV-3 | **PASS** | activated_at in [created_at, created_at + TIMEOUT] |
| 7 | `ts_inv_4_timeout_reference_fallback` | TS-INV-4 | **PASS** | uses created_at when activated_at == 0 |
| 8 | `ts_inv_5_settlement_window_positive` | TS-INV-5 | **PASS** | settlement window > 0 |
| 9 | `ts_inv_6_reclaim_after_settlement` | TS-INV-6 | **PASS** | reclaim deadline > settlement deadline |
| 10 | `ts_overflow_boundary_max_i64` | TS-boundary | **PASS** | extreme i64 values handled |
| 11 | `ts_inv_1a_overflow_explicit` | TS-INV-1a | **PASS** | checked_add returns None at boundary |
| 12 | `ts_inv_1b_overflow_explicit` | TS-INV-1b | **PASS** | checked_add returns None at boundary |
| 13 | `ts_inv_1c_overflow_explicit` | TS-INV-1c | **PASS** | checked_add returns None at boundary |
| 14 | `ts_inv_2a_constant_ordering` | TS-INV-2a | **PASS** | constant relationship proof |
| 15 | `ts_inv_2b_mutual_exclusion_proof` | TS-INV-2b | **PASS** | formal mutual exclusion |
| 16 | `ts_inv_3_activated_lifecycle` | TS-INV-3 | **PASS** | lifecycle simulation |
| 17 | `ts_inv_4_fallback_both_paths` | TS-INV-4 | **PASS** | both code paths tested |
| 18 | `ts_inv_5_window_concrete` | TS-INV-5 | **PASS** | concrete settlement window |
| 19 | `ts_inv_6_concrete_ordering` | TS-INV-6 | **PASS** | concrete deadline ordering |
| 20 | `ts_cancel_window_awaiting` | TS-lifecycle | **PASS** | cancel from AwaitingDeposits |
| 21 | `ts_cancel_window_active` | TS-lifecycle | **PASS** | cancel from Active state |
| 22 | `ts_settlement_window_lifecycle` | TS-lifecycle | **PASS** | settlement window lifecycle |
| 23 | `ts_reclaim_window_lifecycle` | TS-lifecycle | **PASS** | reclaim window lifecycle |
| 24 | `ts_no_negative_durations` | TS-boundary | **PASS** | all durations non-negative |
| 25 | `ts_realistic_timestamp_range` | TS-boundary | **PASS** | realistic 2020-2040 range |

**Subtotal: 25 passed, 0 failed**
**Runtime: ~0.02s**

---

## Suite 3: Account Space & Wager Bounds (`bok_proptest_space.rs`)

| # | Test | Invariant | Result | Notes |
|---|------|-----------|--------|-------|
| 1 | `sb_inv_1_global_config_space` | SB-INV-1 | **PASS** | 8 + borsh(GlobalConfig) == 106 |
| 2 | `sb_inv_2_match_escrow_space_max` | SB-INV-2 | **PASS** | 8 + borsh(MatchEscrow{32}) == 168 |
| 3 | `sb_inv_2b_match_escrow_any_id` | SB-INV-2b | **PASS** | serialized size <= SPACE for all id lengths |
| 4 | `sb_inv_3_min_wager_fee_guarantee` | SB-INV-3 | **PASS** | treasury >= 1 AND ops >= 1 at MIN_WAGER |
| 5 | `sb_inv_3_analytical_bound` | SB-INV-3 | **PASS** | ops >= 1 requires wager >= 17 |
| 6 | `sb_inv_4_max_wager_u64_safety` | SB-INV-4a | **PASS** | wager * 2 fits u64 |
| 7 | `sb_inv_4_u128_intermediate_safety` | SB-INV-4b | **PASS** | u128 intermediates safe |
| 8 | `sb_inv_4_narrowing_cast_safety` | SB-INV-4c | **PASS** | narrowing casts lossless |
| 9 | `sb_inv_5_settlement_conservation` | SB-INV-5 | **PASS** | winner + treasury + ops == total_pot |
| 10 | `sb_inv_5_fee_leq_total` | SB-INV-5 | **PASS** | fees never exceed total_pot |
| 11 | `sb_inv_6_bps_constants` | SB-INV-6 | **PASS** | 700+300 < 10000, yields 7%/3%/90% |
| 12 | `sb_inv_1_parametric` | SB-INV-1 | **PASS** | parametric over field values |
| 13 | `sb_inv_2_parametric` | SB-INV-2 | **PASS** | parametric over field values |
| 14 | `sb_inv_3_proptest_range` | SB-INV-3 | **PASS** | full [MIN, MAX] range |
| 15 | `sb_inv_4_proptest_range` | SB-INV-4 | **PASS** | full [MIN, MAX] range |
| 16 | `sb_inv_5_proptest_range` | SB-INV-5 | **PASS** | full [MIN, MAX] range |
| 17 | `sb_match_id_empty` | SB-boundary | **PASS** | empty match_id fits SPACE |

**Subtotal: 17 passed, 0 failed**
**Runtime: ~0.03s**

---

## Aggregate

| Suite | Passed | Failed | Inconclusive |
|-------|--------|--------|--------------|
| Fee Calculations | 12 | 0 | 0 |
| Timestamp & Duration | 25 | 0 | 0 |
| Space & Bounds | 17 | 0 | 0 |
| **Total** | **54** | **0** | **0** |
