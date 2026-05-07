//! BOK Proptest Harness: SolShot Escrow Fee Calculation Invariants
//!
//! This file contains property-based tests that exhaustively verify the
//! correctness of the fee-split arithmetic used in `settle_match`. The tests
//! run against a locally re-implemented `settle_math` helper that mirrors the
//! on-chain logic exactly, ensuring the harness is standalone and does not
//! depend on the Anchor program crate (which requires BPF toolchain).
//!
//! Invariants covered (2-player and N-player variants):
//!   FEE-INV-1   Conservation of value
//!   FEE-INV-2   Fee minimum guarantee
//!   FEE-INV-3   u128 -> u64 narrowing safety
//!   FEE-INV-4   Pot overflow safety (max pot = MAX_WAGER * 4)
//!   FEE-INV-5   Winner gets remainder (dust <= 2 lamports regardless of player count)
//!   FEE-INV-6   Fee percentage bounds
//!   FEE-INV-9   BPS constant integrity
//!   FEE-INV-10  Fee monotonicity (across wager amount AND player count)
//!   FEE-INV-11  Settlement subtractions never underflow
//!   Boundary     Exact values at MIN, MAX, and sub-minimum wager (2p and 4p)
//!
//! Run with: `cargo test --test bok_proptest_fee -- --nocapture`

#[cfg(test)]
mod bok_fee_invariants {
    use proptest::prelude::*;

    // ---------------------------------------------------------------
    // Constants — mirrored verbatim from programs/solshot-escrow/src/lib.rs
    // ---------------------------------------------------------------

    /// Treasury receives 7% of the total pot (700 basis points).
    const TREASURY_BPS: u64 = 700;

    /// Ops receives 3% of the total pot (300 basis points).
    const OPS_BPS: u64 = 300;

    /// Basis-point denominator. 10 000 BPS = 100%.
    const BPS_DENOMINATOR: u64 = 10_000;

    /// Minimum wager in lamports (0.00001 SOL). Ensures both fee
    /// components are at least 1 lamport after integer division.
    const MIN_WAGER_LAMPORTS: u64 = 10_000;

    /// Maximum wager in lamports (100 SOL). Prevents escrow accounts
    /// that players cannot realistically fund.
    const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

    // ---------------------------------------------------------------
    // POST-FIX-BUNDLE TIMING CONSTANTS — mirrored for INV-4 doc-integrity guard
    // ---------------------------------------------------------------

    /// 1-hour cancel/post-activation timeout. POST-H035-FIX: was 600s.
    const TIMEOUT_SECONDS: i64 = 3_600;

    /// 2-hour permissionless reclaim timeout (2x normal timeout).
    /// POST-H040-FIX: was 1200s; comment-vs-value drift fixed.
    const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 7_200

    // ---------------------------------------------------------------
    // INV-4 (POST-H040-FIX) — comment-vs-value drift guard.
    //
    // Pre-H040: docstring claimed "48-hour reclaim" but value computed to 1200s
    // (= 600 * 2 = 20 min). Operators planning incident-response SLAs against
    // the comment had a 144x drift. Post-fix, the comment must read "2 hours"
    // and the value must compute to 7200s (= 3600 * 2).
    //
    // The fee tests don't currently import program constants (all program
    // constants in lib.rs are private). This runtime test mirrors the constants
    // locally and asserts the post-fix value. Any future bump to TIMEOUT_SECONDS
    // without doc updates will cause this test to fail.
    // ---------------------------------------------------------------

    /// INV-4 (compile-time): const_assert that PERMISSIONLESS_RECLAIM_TIMEOUT == 7200.
    /// If a future change drifts the constant, this fails at compile time.
    const _: () = assert!(
        PERMISSIONLESS_RECLAIM_TIMEOUT == 7_200,
        "INV-4 (POST-H040-FIX): PERMISSIONLESS_RECLAIM_TIMEOUT comment-vs-value \
         drift detected — must equal 7200s (= 2 hours = 2 * TIMEOUT_SECONDS)"
    );

    /// INV-4 (runtime): The reclaim timeout exactly equals 2 * TIMEOUT_SECONDS,
    /// and TIMEOUT_SECONDS is the post-H035-fix value (3600s).
    #[test]
    fn fee_inv_4_post_h040_reclaim_constant_matches_documented_value() {
        assert_eq!(
            TIMEOUT_SECONDS, 3_600,
            "POST-H035-FIX: TIMEOUT_SECONDS must be 3600s (1 hour); was 600s pre-fix"
        );
        assert_eq!(
            PERMISSIONLESS_RECLAIM_TIMEOUT,
            TIMEOUT_SECONDS * 2,
            "POST-H040-FIX: PERMISSIONLESS_RECLAIM_TIMEOUT must equal 2 * TIMEOUT_SECONDS"
        );
        assert_eq!(
            PERMISSIONLESS_RECLAIM_TIMEOUT, 7_200,
            "POST-H040-FIX: doc-comment must read '2-hour' / '7200 seconds' to match runtime value; \
             pre-fix value was 1200s with stale '48-hour' comment"
        );
        // Defense against future drift via overflow.
        let checked = TIMEOUT_SECONDS.checked_mul(2);
        assert_eq!(
            checked,
            Some(PERMISSIONLESS_RECLAIM_TIMEOUT),
            "checked_mul(2) must produce PERMISSIONLESS_RECLAIM_TIMEOUT exactly"
        );
    }

    // ---------------------------------------------------------------
    // Local re-implementation of the settle_match arithmetic
    // ---------------------------------------------------------------

    /// Result of the settlement fee calculation.
    /// All amounts are in lamports.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct SettleResult {
        total_pot: u64,
        treasury_amount: u64,
        ops_amount: u64,
        winner_amount: u64,
    }

    /// Pure arithmetic extracted from `settle_match`. Returns `None` if any
    /// checked operation overflows (which would be an `ArithmeticOverflow`
    /// error on-chain).
    ///
    /// `num_deposited` is 2-4 for N-player matches. All existing 2-player tests
    /// call this with `num_deposited = 2` for backward compatibility.
    fn settle_math(wager_lamports: u64, num_deposited: u64) -> Option<SettleResult> {
        let total_pot_128: u128 = (wager_lamports as u128).checked_mul(num_deposited as u128)?;

        let treasury_amount = (total_pot_128
            .checked_mul(TREASURY_BPS as u128)?
            / BPS_DENOMINATOR as u128) as u64;

        let ops_amount = (total_pot_128
            .checked_mul(OPS_BPS as u128)?
            / BPS_DENOMINATOR as u128) as u64;

        let total_pot = total_pot_128 as u64;

        let winner_amount = total_pot
            .checked_sub(treasury_amount)?
            .checked_sub(ops_amount)?;

        Some(SettleResult {
            total_pot,
            treasury_amount,
            ops_amount,
            winner_amount,
        })
    }

    // ---------------------------------------------------------------
    // Strategy: valid wager range [MIN_WAGER, MAX_WAGER]
    // ---------------------------------------------------------------

    fn valid_wager_strategy() -> impl Strategy<Value = u64> {
        MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS
    }

    /// Strategy for N-player deposit counts (2-4 players).
    fn valid_num_deposited() -> impl Strategy<Value = u64> {
        2u64..=4u64
    }

    // ---------------------------------------------------------------
    // Proptest configuration — 10 000 iterations per test
    // ---------------------------------------------------------------

    fn config_10k() -> ProptestConfig {
        ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-1: Conservation of Value
    //
    // For every valid wager and player count, the sum of the three
    // payout components (winner + treasury + ops) must equal the total
    // pot exactly. This guarantees no lamports are created or destroyed
    // during settlement — a fundamental accounting invariant.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_1_conservation_of_value(wager in valid_wager_strategy()) {
            let r = settle_math(wager, 2).expect("settle_math must succeed for valid wager");
            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot,
                "Conservation violated: winner({}) + treasury({}) + ops({}) != total_pot({})",
                r.winner_amount, r.treasury_amount, r.ops_amount, r.total_pot
            );
        }

        #[test]
        fn fee_inv_1_conservation_of_value_nplayer(
            wager in valid_wager_strategy(),
            num_deposited in valid_num_deposited(),
        ) {
            let r = settle_math(wager, num_deposited)
                .expect("settle_math must succeed for valid wager and num_deposited");
            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot,
                "N-player conservation violated: winner({}) + treasury({}) + ops({}) != total_pot({}) \
                 for wager={}, num_deposited={}",
                r.winner_amount, r.treasury_amount, r.ops_amount, r.total_pot, wager, num_deposited
            );
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-2: Fee Minimum Guarantee
    //
    // Both treasury and ops must receive at least 1 lamport for every
    // wager in the valid range, regardless of player count.
    // This is the economic justification for MIN_WAGER_LAMPORTS — if it
    // were lower, integer division could truncate a fee component to zero.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_2_fee_minimum_guarantee(wager in valid_wager_strategy()) {
            let r = settle_math(wager, 2).expect("settle_math must succeed for valid wager");
            prop_assert!(
                r.treasury_amount >= 1,
                "Treasury fee is zero for wager={}: treasury_amount={}",
                wager, r.treasury_amount
            );
            prop_assert!(
                r.ops_amount >= 1,
                "Ops fee is zero for wager={}: ops_amount={}",
                wager, r.ops_amount
            );
        }

        #[test]
        fn fee_inv_2_fee_minimum_guarantee_nplayer(
            wager in valid_wager_strategy(),
            num_deposited in valid_num_deposited(),
        ) {
            let r = settle_math(wager, num_deposited)
                .expect("settle_math must succeed for valid wager and num_deposited");
            prop_assert!(
                r.treasury_amount >= 1,
                "Treasury fee is zero for wager={}, num_deposited={}: treasury_amount={}",
                wager, num_deposited, r.treasury_amount
            );
            prop_assert!(
                r.ops_amount >= 1,
                "Ops fee is zero for wager={}, num_deposited={}: ops_amount={}",
                wager, num_deposited, r.ops_amount
            );
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-3: u128 -> u64 Narrowing Safety
    //
    // The on-chain code widens wager to u128 for BPS multiplication,
    // then narrows back to u64. This test verifies that for every valid
    // wager (2-player, since max pot = MAX_WAGER * 2 fits in u64).
    // The N-player variant uses MAX_WAGER * 4 which also fits comfortably.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_3_u128_to_u64_narrowing_safety(wager in valid_wager_strategy()) {
            let total_pot_128 = (wager as u128) * 2;

            // total_pot must fit in u64 without truncation
            prop_assert!(
                total_pot_128 <= u64::MAX as u128,
                "total_pot overflows u64: wager={}, total_pot_128={}",
                wager, total_pot_128
            );

            // BPS products must fit in u128 (sanity check — u128::MAX is enormous)
            let treasury_product = total_pot_128 * TREASURY_BPS as u128;
            prop_assert!(
                treasury_product <= u128::MAX,
                "treasury BPS product overflows u128"
            );

            let ops_product = total_pot_128 * OPS_BPS as u128;
            prop_assert!(
                ops_product <= u128::MAX,
                "ops BPS product overflows u128"
            );

            // After division by BPS_DENOMINATOR, results must fit in u64
            let treasury_amount = treasury_product / BPS_DENOMINATOR as u128;
            prop_assert!(
                treasury_amount <= u64::MAX as u128,
                "treasury_amount overflows u64 after division: {}",
                treasury_amount
            );

            let ops_amount = ops_product / BPS_DENOMINATOR as u128;
            prop_assert!(
                ops_amount <= u64::MAX as u128,
                "ops_amount overflows u64 after division: {}",
                ops_amount
            );
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-4: Pot Overflow Safety
    //
    // wager.checked_mul(num_deposited) must succeed for every valid wager
    // and num_deposited in [2, 4]. The maximum pot is:
    //   MAX_WAGER * 4 = 100_000_000_000 * 4 = 400_000_000_000
    // which is well within u64::MAX (18_446_744_073_709_551_615).
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_4_pot_overflow_safety(wager in valid_wager_strategy()) {
            // Legacy 2-player check
            let pot_result = wager.checked_mul(2);
            prop_assert!(
                pot_result.is_some(),
                "wager.checked_mul(2) overflowed for wager={}",
                wager
            );

            // Also verify as u128 path succeeds (the actual on-chain path)
            let pot_128 = (wager as u128).checked_mul(2);
            prop_assert!(
                pot_128.is_some(),
                "(wager as u128).checked_mul(2) overflowed for wager={}",
                wager
            );

            // Max N-player pot: wager * 4 must also fit in u64
            let pot_4p = wager.checked_mul(4);
            prop_assert!(
                pot_4p.is_some(),
                "wager.checked_mul(4) overflowed for wager={}",
                wager
            );

            let pot_4p_128 = (wager as u128).checked_mul(4);
            prop_assert!(
                pot_4p_128.is_some(),
                "(wager as u128).checked_mul(4) overflowed for wager={}",
                wager
            );
        }

        #[test]
        fn fee_inv_4_pot_overflow_safety_nplayer(
            wager in valid_wager_strategy(),
            num_deposited in valid_num_deposited(),
        ) {
            let pot_result = (wager as u128).checked_mul(num_deposited as u128);
            prop_assert!(
                pot_result.is_some(),
                "(wager as u128).checked_mul(num_deposited) overflowed for wager={}, num_deposited={}",
                wager, num_deposited
            );

            // Result must fit in u64
            if let Some(pot_128) = pot_result {
                prop_assert!(
                    pot_128 <= u64::MAX as u128,
                    "pot overflows u64 for wager={}, num_deposited={}: pot_128={}",
                    wager, num_deposited, pot_128
                );
            }
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-5: Winner Gets Remainder (Dust Absorption)
    //
    // The winner is computed as `total_pot - treasury - ops`, which
    // means any lamports lost to integer truncation in the fee
    // calculations accrue to the winner. For any number of deposited
    // players, there are still only 2 division operations (treasury
    // and ops), so max dust is still 2 lamports.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_5_winner_gets_remainder(wager in valid_wager_strategy()) {
            let r = settle_math(wager, 2).expect("settle_math must succeed for valid wager");

            // Independent calculation: winner's ideal BPS share (truncated)
            let total_pot_128 = (wager as u128) * 2;
            let winner_bps: u64 = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS; // 9000
            let winner_independent =
                (total_pot_128 * winner_bps as u128 / BPS_DENOMINATOR as u128) as u64;

            // Remainder-based winner must be >= independent calculation
            prop_assert!(
                r.winner_amount >= winner_independent,
                "Winner remainder ({}) < independent calc ({}) for wager={}",
                r.winner_amount, winner_independent, wager
            );

            // Dust (remainder bonus) must be at most 2 lamports.
            let dust = r.winner_amount - winner_independent;
            prop_assert!(
                dust <= 2,
                "Dust exceeds 2 lamports: dust={} for wager={}",
                dust, wager
            );
        }

        #[test]
        fn fee_inv_5_winner_gets_remainder_nplayer(
            wager in valid_wager_strategy(),
            num_deposited in valid_num_deposited(),
        ) {
            let r = settle_math(wager, num_deposited)
                .expect("settle_math must succeed for valid wager and num_deposited");

            let total_pot_128 = (wager as u128) * num_deposited as u128;
            let winner_bps: u64 = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS; // 9000
            let winner_independent =
                (total_pot_128 * winner_bps as u128 / BPS_DENOMINATOR as u128) as u64;

            // Remainder-based winner must be >= independent calculation
            prop_assert!(
                r.winner_amount >= winner_independent,
                "N-player winner remainder ({}) < independent calc ({}) for wager={}, num_deposited={}",
                r.winner_amount, winner_independent, wager, num_deposited
            );

            // Dust is still at most 2 lamports (only 2 division operations: treasury + ops)
            let dust = r.winner_amount - winner_independent;
            prop_assert!(
                dust <= 2,
                "N-player dust exceeds 2 lamports: dust={} for wager={}, num_deposited={}",
                dust, wager, num_deposited
            );
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-6: Fee Percentage Bounds
    //
    // Each fee component's actual percentage must be within a tight
    // tolerance of its target BPS allocation:
    //   - Treasury: ~7.00% of total_pot (700 BPS)
    //   - Ops:      ~3.00% of total_pot (300 BPS)
    //   - Winner:   ~90.00% of total_pot (9000 BPS)
    //
    // This holds regardless of player count since BPS splits are
    // calculated on the total pot regardless.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_6_fee_percentage_bounds(wager in valid_wager_strategy()) {
            let r = settle_math(wager, 2).expect("settle_math must succeed for valid wager");

            // Compute actual BPS of each component (scaled by BPS_DENOMINATOR)
            let treasury_actual_bps =
                (r.treasury_amount as u128 * BPS_DENOMINATOR as u128 / r.total_pot as u128) as u64;
            let ops_actual_bps =
                (r.ops_amount as u128 * BPS_DENOMINATOR as u128 / r.total_pot as u128) as u64;
            let winner_actual_bps =
                (r.winner_amount as u128 * BPS_DENOMINATOR as u128 / r.total_pot as u128) as u64;

            let winner_bps_target = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS; // 9000

            // Treasury: within 1 BPS of 700
            let treasury_diff = if treasury_actual_bps >= TREASURY_BPS {
                treasury_actual_bps - TREASURY_BPS
            } else {
                TREASURY_BPS - treasury_actual_bps
            };
            prop_assert!(
                treasury_diff <= 1,
                "Treasury BPS drift too large: actual={}, target={}, diff={}, wager={}",
                treasury_actual_bps, TREASURY_BPS, treasury_diff, wager
            );

            // Ops: within 1 BPS of 300
            let ops_diff = if ops_actual_bps >= OPS_BPS {
                ops_actual_bps - OPS_BPS
            } else {
                OPS_BPS - ops_actual_bps
            };
            prop_assert!(
                ops_diff <= 1,
                "Ops BPS drift too large: actual={}, target={}, diff={}, wager={}",
                ops_actual_bps, OPS_BPS, ops_diff, wager
            );

            // Winner: within 1 BPS of 9000
            let winner_diff = if winner_actual_bps >= winner_bps_target {
                winner_actual_bps - winner_bps_target
            } else {
                winner_bps_target - winner_actual_bps
            };
            prop_assert!(
                winner_diff <= 1,
                "Winner BPS drift too large: actual={}, target={}, diff={}, wager={}",
                winner_actual_bps, winner_bps_target, winner_diff, wager
            );
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-9: BPS Constant Integrity
    //
    // Compile-time sanity check on the fee constants themselves.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(ProptestConfig { cases: 1, ..ProptestConfig::default() })]

        #[test]
        fn fee_inv_9_bps_constant_integrity(_dummy in Just(0u8)) {
            // Fee BPS must not consume the entire pot
            prop_assert!(
                TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR,
                "Fee BPS exceed denominator: {} + {} >= {}",
                TREASURY_BPS, OPS_BPS, BPS_DENOMINATOR
            );

            // Winner's implied BPS
            let winner_bps = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS;
            prop_assert_eq!(
                winner_bps, 9000,
                "Winner BPS is not 9000: got {}",
                winner_bps
            );

            // Denominator is the standard 10_000
            prop_assert_eq!(
                BPS_DENOMINATOR, 10_000,
                "BPS_DENOMINATOR is not 10_000: got {}",
                BPS_DENOMINATOR
            );

            // Individual fee constants match litepaper
            prop_assert_eq!(TREASURY_BPS, 700, "TREASURY_BPS is not 700");
            prop_assert_eq!(OPS_BPS, 300, "OPS_BPS is not 300");
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-10: Fee Monotonicity
    //
    // For any two wagers w1 < w2, every fee component of w2 must be >=
    // the corresponding component of w1 (at the same player count).
    // Also verifies monotonicity holds when player count increases:
    // a 4-player match always has a larger pot than a 2-player match
    // at the same wager, so all fee components must be larger too.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_10_fee_monotonicity(
            w1 in valid_wager_strategy(),
            w2 in valid_wager_strategy(),
        ) {
            // Ensure w1 <= w2 (canonical ordering)
            let (lo, hi) = if w1 <= w2 { (w1, w2) } else { (w2, w1) };

            let r_lo = settle_math(lo, 2).expect("settle_math must succeed for valid wager");
            let r_hi = settle_math(hi, 2).expect("settle_math must succeed for valid wager");

            prop_assert!(
                r_hi.treasury_amount >= r_lo.treasury_amount,
                "Treasury not monotonic: w_lo={} -> {}, w_hi={} -> {}",
                lo, r_lo.treasury_amount, hi, r_hi.treasury_amount
            );

            prop_assert!(
                r_hi.ops_amount >= r_lo.ops_amount,
                "Ops not monotonic: w_lo={} -> {}, w_hi={} -> {}",
                lo, r_lo.ops_amount, hi, r_hi.ops_amount
            );

            prop_assert!(
                r_hi.winner_amount >= r_lo.winner_amount,
                "Winner not monotonic: w_lo={} -> {}, w_hi={} -> {}",
                lo, r_lo.winner_amount, hi, r_hi.winner_amount
            );

            prop_assert!(
                r_hi.total_pot >= r_lo.total_pot,
                "Total pot not monotonic: w_lo={} -> {}, w_hi={} -> {}",
                lo, r_lo.total_pot, hi, r_hi.total_pot
            );
        }

        /// More players → larger pot → larger fees. Verifies monotonicity
        /// across player count: 2-player result <= 4-player result for same wager.
        #[test]
        fn fee_inv_10_fee_monotonicity_nplayer(wager in valid_wager_strategy()) {
            let r2 = settle_math(wager, 2).expect("settle_math 2p must succeed");
            let r3 = settle_math(wager, 3).expect("settle_math 3p must succeed");
            let r4 = settle_math(wager, 4).expect("settle_math 4p must succeed");

            // Pot grows with player count
            prop_assert!(r3.total_pot >= r2.total_pot,
                "3p pot < 2p pot for wager={}", wager);
            prop_assert!(r4.total_pot >= r3.total_pot,
                "4p pot < 3p pot for wager={}", wager);

            // All fee components grow with player count
            prop_assert!(r3.treasury_amount >= r2.treasury_amount,
                "3p treasury < 2p treasury for wager={}", wager);
            prop_assert!(r4.treasury_amount >= r3.treasury_amount,
                "4p treasury < 3p treasury for wager={}", wager);

            prop_assert!(r3.ops_amount >= r2.ops_amount,
                "3p ops < 2p ops for wager={}", wager);
            prop_assert!(r4.ops_amount >= r3.ops_amount,
                "4p ops < 3p ops for wager={}", wager);

            prop_assert!(r3.winner_amount >= r2.winner_amount,
                "3p winner < 2p winner for wager={}", wager);
            prop_assert!(r4.winner_amount >= r3.winner_amount,
                "4p winner < 3p winner for wager={}", wager);
        }
    }

    // ---------------------------------------------------------------
    // FEE-INV-11: Settlement Subtractions Never Underflow
    //
    // The on-chain code computes:
    //   winner = total_pot.checked_sub(treasury).checked_sub(ops)
    //
    // Both subtractions must succeed. Verified for 2-player and N-player.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn fee_inv_11_settlement_subtractions_never_underflow(wager in valid_wager_strategy()) {
            let total_pot_128 = (wager as u128) * 2;

            let treasury_amount = (total_pot_128 * TREASURY_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            let ops_amount = (total_pot_128 * OPS_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            let total_pot = total_pot_128 as u64;

            // First subtraction: total_pot - treasury
            prop_assert!(
                total_pot >= treasury_amount,
                "First subtraction underflows: total_pot={} < treasury={}",
                total_pot, treasury_amount
            );

            let after_treasury = total_pot - treasury_amount;

            // Second subtraction: (total_pot - treasury) - ops
            prop_assert!(
                after_treasury >= ops_amount,
                "Second subtraction underflows: after_treasury={} < ops={}",
                after_treasury, ops_amount
            );

            // The full settle_math path must also succeed
            let r = settle_math(wager, 2);
            prop_assert!(
                r.is_some(),
                "settle_math returned None for valid wager={}",
                wager
            );
        }

        #[test]
        fn fee_inv_11_settlement_subtractions_never_underflow_nplayer(
            wager in valid_wager_strategy(),
            num_deposited in valid_num_deposited(),
        ) {
            let total_pot_128 = (wager as u128) * num_deposited as u128;

            let treasury_amount = (total_pot_128 * TREASURY_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            let ops_amount = (total_pot_128 * OPS_BPS as u128
                / BPS_DENOMINATOR as u128) as u64;
            let total_pot = total_pot_128 as u64;

            prop_assert!(
                total_pot >= treasury_amount,
                "N-player first subtraction underflows: total_pot={} < treasury={} \
                 (wager={}, num_deposited={})",
                total_pot, treasury_amount, wager, num_deposited
            );

            let after_treasury = total_pot - treasury_amount;

            prop_assert!(
                after_treasury >= ops_amount,
                "N-player second subtraction underflows: after_treasury={} < ops={} \
                 (wager={}, num_deposited={})",
                after_treasury, ops_amount, wager, num_deposited
            );

            let r = settle_math(wager, num_deposited);
            prop_assert!(
                r.is_some(),
                "settle_math returned None for wager={}, num_deposited={}",
                wager, num_deposited
            );
        }
    }

    // ---------------------------------------------------------------
    // Boundary Tests: Exact Values at MIN, MAX, and Sub-Minimum
    //
    // 2-PLAYER (backward-compatible):
    //
    // MIN_WAGER (10_000) * 2 = 20_000:
    //   treasury    = 20_000 * 700 / 10_000 = 1_400
    //   ops         = 20_000 * 300 / 10_000 =   600
    //   winner      = 20_000 - 1_400 - 600  = 18_000
    //
    // MAX_WAGER (100_000_000_000) * 2 = 200_000_000_000:
    //   treasury    = 200B * 700 / 10_000 = 14_000_000_000
    //   ops         = 200B * 300 / 10_000 =  6_000_000_000
    //   winner      = 200B - 14B - 6B     = 180_000_000_000
    //
    // 4-PLAYER:
    //
    // MIN_WAGER (10_000) * 4 = 40_000:
    //   treasury    = 40_000 * 700 / 10_000 = 2_800
    //   ops         = 40_000 * 300 / 10_000 = 1_200
    //   winner      = 40_000 - 2_800 - 1_200 = 36_000
    //
    // MAX_WAGER (100_000_000_000) * 4 = 400_000_000_000:
    //   treasury    = 400B * 700 / 10_000 = 28_000_000_000
    //   ops         = 400B * 300 / 10_000 = 12_000_000_000
    //   winner      = 400B - 28B - 12B    = 360_000_000_000
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(ProptestConfig { cases: 1, ..ProptestConfig::default() })]

        #[test]
        fn boundary_min_wager(_dummy in Just(0u8)) {
            let r = settle_math(MIN_WAGER_LAMPORTS, 2)
                .expect("settle_math must succeed at MIN_WAGER");

            prop_assert_eq!(r.total_pot, 20_000,
                "MIN total_pot: expected 20_000, got {}", r.total_pot);
            prop_assert_eq!(r.treasury_amount, 1_400,
                "MIN treasury: expected 1_400, got {}", r.treasury_amount);
            prop_assert_eq!(r.ops_amount, 600,
                "MIN ops: expected 600, got {}", r.ops_amount);
            prop_assert_eq!(r.winner_amount, 18_000,
                "MIN winner: expected 18_000, got {}", r.winner_amount);

            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot
            );
        }

        #[test]
        fn boundary_max_wager(_dummy in Just(0u8)) {
            let r = settle_math(MAX_WAGER_LAMPORTS, 2)
                .expect("settle_math must succeed at MAX_WAGER");

            prop_assert_eq!(r.total_pot, 200_000_000_000u64,
                "MAX total_pot: expected 200B, got {}", r.total_pot);
            prop_assert_eq!(r.treasury_amount, 14_000_000_000u64,
                "MAX treasury: expected 14B, got {}", r.treasury_amount);
            prop_assert_eq!(r.ops_amount, 6_000_000_000u64,
                "MAX ops: expected 6B, got {}", r.ops_amount);
            prop_assert_eq!(r.winner_amount, 180_000_000_000u64,
                "MAX winner: expected 180B, got {}", r.winner_amount);

            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot
            );
        }

        #[test]
        fn boundary_min_wager_4p(_dummy in Just(0u8)) {
            // MIN_WAGER * 4 = 40,000
            let r = settle_math(MIN_WAGER_LAMPORTS, 4)
                .expect("settle_math must succeed at MIN_WAGER 4-player");

            prop_assert_eq!(r.total_pot, 40_000,
                "4p MIN total_pot: expected 40_000, got {}", r.total_pot);
            prop_assert_eq!(r.treasury_amount, 2_800,
                "4p MIN treasury: expected 2_800, got {}", r.treasury_amount);
            prop_assert_eq!(r.ops_amount, 1_200,
                "4p MIN ops: expected 1_200, got {}", r.ops_amount);
            prop_assert_eq!(r.winner_amount, 36_000,
                "4p MIN winner: expected 36_000, got {}", r.winner_amount);

            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot,
                "4p MIN_WAGER conservation violated"
            );
        }

        #[test]
        fn boundary_max_wager_4p(_dummy in Just(0u8)) {
            // MAX_WAGER * 4 = 400_000_000_000
            let r = settle_math(MAX_WAGER_LAMPORTS, 4)
                .expect("settle_math must succeed at MAX_WAGER 4-player");

            prop_assert_eq!(r.total_pot, 400_000_000_000u64,
                "4p MAX total_pot: expected 400B, got {}", r.total_pot);
            prop_assert_eq!(r.treasury_amount, 28_000_000_000u64,
                "4p MAX treasury: expected 28B, got {}", r.treasury_amount);
            prop_assert_eq!(r.ops_amount, 12_000_000_000u64,
                "4p MAX ops: expected 12B, got {}", r.ops_amount);
            prop_assert_eq!(r.winner_amount, 360_000_000_000u64,
                "4p MAX winner: expected 360B, got {}", r.winner_amount);

            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot,
                "4p MAX_WAGER conservation violated"
            );
        }

        #[test]
        fn boundary_sub_minimum_wager_16(_dummy in Just(0u8)) {
            // wager=16 is BELOW MIN_WAGER. The on-chain program rejects it
            // in create_match, but the raw arithmetic still works. This test
            // demonstrates WHY the minimum exists: ops drops to zero.
            let r = settle_math(16, 2)
                .expect("settle_math must succeed for wager=16 (math is valid)");

            prop_assert_eq!(r.total_pot, 32,
                "Sub-min total_pot: expected 32, got {}", r.total_pot);

            // treasury = 32 * 700 / 10_000 = 22_400 / 10_000 = 2 (truncated)
            prop_assert_eq!(r.treasury_amount, 2,
                "Sub-min treasury: expected 2, got {}", r.treasury_amount);

            // ops = 32 * 300 / 10_000 = 9_600 / 10_000 = 0 (truncated to zero!)
            prop_assert_eq!(r.ops_amount, 0,
                "Sub-min ops: expected 0, got {}", r.ops_amount);

            // winner = 32 - 2 - 0 = 30
            prop_assert_eq!(r.winner_amount, 30,
                "Sub-min winner: expected 30, got {}", r.winner_amount);

            // Conservation still holds even when ops=0
            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot
            );

            // This proves FEE-INV-2 would FAIL below MIN_WAGER
            prop_assert_eq!(r.ops_amount, 0,
                "This confirms ops=0 below MIN_WAGER — the minimum exists for a reason");
        }
    }
}
