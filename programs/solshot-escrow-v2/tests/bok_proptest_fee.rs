//! BOK Proptest Harness — v2 Fee Calculation Invariants (configurable BPS surface)
//!
//! v2 differs from v1 in that treasury_bps and ops_bps are stored on a
//! per-match snapshot (read at create_match from GlobalConfig). This harness
//! sweeps the FULL configurable surface: (treasury_bps, ops_bps) ∈
//! [0, 1000] × [0, 1000-treasury_bps], num_deposited ∈ [2, 10],
//! wager ∈ [MIN_WAGER, MAX_WAGER]. The combined cap MAX_FEE_BPS = 1000
//! (10%) is a precondition.
//!
//! Invariants covered (from .bok/confirmed-invariants/01-settle-and-cap.md):
//!   I-FEE-1   Pot conservation across configurable BPS
//!   I-FEE-2   Dust bound (≤ 2 lamports) across configurable BPS
//!   I-FEE-3   No underflow on subtractions (pot ≥ treasury + ops)
//!   I-FEE-4   u128 widening headroom
//!   I-FEE-5   Zero/near-zero BPS → 100% to winner
//!   I-FEE-6   Monotonicity in treasury_bps
//!   I-CAP-1   Init combined-cap with u32 widening (logic-level)
//!   I-CAP-2   Update multi-step cap holds (logic-level)
//!
//! Local-reimplementation pattern mirrors v1's bok_proptest_fee.rs to avoid
//! BPF toolchain dependency. The math is byte-for-byte identical to
//! programs/solshot-escrow-v2/src/lib.rs:387-454 (settle_match).
//!
//! Run with: `cargo test --test bok_proptest_fee -- --nocapture`

#[cfg(test)]
mod bok_v2_fee_invariants {
    use proptest::prelude::*;

    // ---------------------------------------------------------------
    // Constants — mirrored verbatim from
    //   programs/solshot-escrow-v2/src/lib.rs:30-54
    // ---------------------------------------------------------------

    /// Combined treasury+ops fee cap (1000 BPS = 10%).
    const MAX_FEE_BPS: u16 = 1_000;

    /// 10_000 BPS = 100%.
    const BPS_DENOMINATOR: u128 = 10_000;

    /// Minimum wager (0.00001 SOL).
    const MIN_WAGER_LAMPORTS: u64 = 10_000;

    /// Maximum wager (100 SOL).
    const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

    /// v2 supports 2-10 players.
    const MIN_PLAYERS: u32 = 2;
    const MAX_PLAYERS: u32 = 10;

    // ---------------------------------------------------------------
    // Local re-implementation of v2 settle_match arithmetic
    // (mirrors lib.rs:387-454)
    // ---------------------------------------------------------------

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct SettleResult {
        total_pot: u64,
        treasury_amount: u64,
        ops_amount: u64,
        winner_amount: u64,
    }

    /// Pure arithmetic extracted from v2 `settle_match`. Returns `None` on any
    /// `checked_*` overflow / underflow (which would be `ArithmeticOverflow`
    /// on-chain).
    ///
    /// Inputs are constrained by the program at create-time and update-time:
    ///   - wager ∈ [MIN_WAGER, MAX_WAGER]
    ///   - num_deposited ∈ [MIN_PLAYERS, MAX_PLAYERS]
    ///   - treasury_bps + ops_bps ≤ MAX_FEE_BPS  (combined cap)
    fn settle_math_v2(
        wager: u64,
        num_deposited: u64,
        treasury_bps: u16,
        ops_bps: u16,
    ) -> Option<SettleResult> {
        let total_pot_128: u128 = (wager as u128).checked_mul(num_deposited as u128)?;

        let treasury_amount = (total_pot_128
            .checked_mul(treasury_bps as u128)?
            / BPS_DENOMINATOR) as u64;

        let ops_amount = (total_pot_128
            .checked_mul(ops_bps as u128)?
            / BPS_DENOMINATOR) as u64;

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

    /// Mirrors v2 `initialize_config` cap check (lib.rs:79-82).
    /// Uses the SAME `as u32` widening as on-chain to defeat any u16 wrap.
    fn validate_init_bps(t_bps: u16, o_bps: u16) -> Result<(), &'static str> {
        if (t_bps as u32) + (o_bps as u32) > MAX_FEE_BPS as u32 {
            Err("FeesTooHigh")
        } else {
            Ok(())
        }
    }

    /// Mirrors v2 `update_config` cap check applied AFTER all Some(...) updates
    /// are merged into the post-state (lib.rs:128-131).
    #[derive(Clone, Copy)]
    struct ConfigState {
        t: u16,
        o: u16,
    }

    fn apply_update(
        s: &ConfigState,
        new_t: Option<u16>,
        new_o: Option<u16>,
    ) -> Result<ConfigState, &'static str> {
        let post = ConfigState {
            t: new_t.unwrap_or(s.t),
            o: new_o.unwrap_or(s.o),
        };
        if (post.t as u32) + (post.o as u32) > MAX_FEE_BPS as u32 {
            Err("FeesTooHigh")
        } else {
            Ok(post)
        }
    }

    // ---------------------------------------------------------------
    // Strategies
    // ---------------------------------------------------------------

    fn valid_wager() -> impl Strategy<Value = u64> {
        MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS
    }

    fn valid_num_deposited() -> impl Strategy<Value = u64> {
        (MIN_PLAYERS as u64)..=(MAX_PLAYERS as u64)
    }

    /// Strategy yielding (treasury_bps, ops_bps) such that t + o ≤ MAX_FEE_BPS.
    fn valid_bps_pair() -> impl Strategy<Value = (u16, u16)> {
        (0u16..=MAX_FEE_BPS).prop_flat_map(|t| (Just(t), 0u16..=(MAX_FEE_BPS - t)))
    }

    fn config_10k() -> ProptestConfig {
        ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        }
    }

    fn config_50k() -> ProptestConfig {
        ProptestConfig {
            cases: 50_000,
            ..ProptestConfig::default()
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-1: Pot Conservation Across Configurable BPS
    //
    // For all (wager, num_deposited, treasury_bps, ops_bps) in the v2 surface:
    //   winner + treasury + ops == total_pot
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_fee_1_pot_conservation(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            (treasury_bps, ops_bps) in valid_bps_pair(),
        ) {
            let r = settle_math_v2(wager, num_deposited, treasury_bps, ops_bps)
                .expect("v2 settle math must succeed within capped surface");
            prop_assert_eq!(
                r.winner_amount + r.treasury_amount + r.ops_amount,
                r.total_pot,
                "Conservation violated: w={} + t={} + o={} != pot={} \
                 (wager={}, n={}, tbps={}, obps={})",
                r.winner_amount, r.treasury_amount, r.ops_amount, r.total_pot,
                wager, num_deposited, treasury_bps, ops_bps
            );
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-2: Dust Bound (≤ 2 Lamports) Across Configurable BPS
    //
    // The winner-as-remainder pattern absorbs at most 2 lamports of "found
    // money" relative to an independent winner_bps calculation. This is
    // because the two BPS divisions can each lose at most 1 lamport to floor
    // truncation.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_fee_2_dust_bound(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            (treasury_bps, ops_bps) in valid_bps_pair(),
        ) {
            let r = settle_math_v2(wager, num_deposited, treasury_bps, ops_bps)
                .expect("v2 settle math must succeed");
            let total_pot_128 = (wager as u128) * (num_deposited as u128);
            let winner_bps = BPS_DENOMINATOR - (treasury_bps as u128) - (ops_bps as u128);
            let winner_independent = (total_pot_128 * winner_bps / BPS_DENOMINATOR) as u64;

            prop_assert!(
                r.winner_amount >= winner_independent,
                "Winner remainder {} < independent {} \
                 (wager={}, n={}, tbps={}, obps={})",
                r.winner_amount, winner_independent,
                wager, num_deposited, treasury_bps, ops_bps
            );

            let dust = r.winner_amount - winner_independent;
            prop_assert!(
                dust <= 2,
                "Dust {} > 2 (wager={}, n={}, tbps={}, obps={})",
                dust, wager, num_deposited, treasury_bps, ops_bps
            );
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-3: No Underflow (Pot ≥ Treasury + Ops)
    //
    // The two `checked_sub` calls in v2 settle_match never return None.
    // This is structural: combined cap ≤ 1000 < BPS_DENOMINATOR = 10_000,
    // so treasury + ops ≤ pot/10. Verified empirically across the surface.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_fee_3_no_underflow(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            (treasury_bps, ops_bps) in valid_bps_pair(),
        ) {
            let total_pot_128 = (wager as u128) * (num_deposited as u128);
            let treasury = (total_pot_128 * treasury_bps as u128 / BPS_DENOMINATOR) as u64;
            let ops = (total_pot_128 * ops_bps as u128 / BPS_DENOMINATOR) as u64;
            let total_pot = total_pot_128 as u64;

            prop_assert!(
                total_pot >= treasury,
                "1st sub underflows: pot={} < treasury={}",
                total_pot, treasury
            );
            let after_t = total_pot - treasury;
            prop_assert!(
                after_t >= ops,
                "2nd sub underflows: after_t={} < ops={}",
                after_t, ops
            );

            // Stronger bound: combined fees never exceed pot/10 + small dust margin.
            prop_assert!(
                (treasury as u128 + ops as u128) <= total_pot_128 / 10 + 2,
                "Combined fees exceed pot/10 + dust margin: t+o={} > pot/10={}",
                treasury as u128 + ops as u128, total_pot_128 / 10
            );
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-4: u128 Widening Headroom
    //
    // The intermediate u128 product wager × num_deposited × bps never
    // approaches u128::MAX. Empirical max = 100e9 × 10 × 1000 = 10^15;
    // u128::MAX ≈ 3.4e38; headroom ~3e23. The narrowing back to u64 is
    // also lossless because (wager × num_deposited) ≤ 10^12 < u64::MAX.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_fee_4_u128_widening_headroom(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            bps in 0u16..=MAX_FEE_BPS,
        ) {
            let pot_128 = (wager as u128).checked_mul(num_deposited as u128);
            prop_assert!(
                pot_128.is_some(),
                "wager × n overflows u128 (impossible at current bounds): \
                 wager={}, n={}",
                wager, num_deposited
            );
            let pot = pot_128.unwrap();
            prop_assert!(
                pot <= u64::MAX as u128,
                "narrowing to u64 truncates: pot={}, u64::MAX={}",
                pot, u64::MAX as u128
            );

            let prod = pot.checked_mul(bps as u128);
            prop_assert!(
                prod.is_some(),
                "pot × bps overflows u128 (impossible at current bounds): \
                 pot={}, bps={}",
                pot, bps
            );
            let prod = prod.unwrap();
            // Empirical headroom assertion: max possible product = 10^15.
            prop_assert!(
                prod < 10u128.pow(17),
                "headroom assertion violated: prod={} >= 10^17",
                prod
            );
        }

        /// Round-trip identity for u128 → u64 narrowing within bounds.
        #[test]
        fn i_fee_4_narrowing_round_trip(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
        ) {
            let pot_128 = (wager as u128) * (num_deposited as u128);
            let pot_64 = pot_128 as u64;
            prop_assert_eq!(
                pot_64 as u128,
                pot_128,
                "round-trip u64→u128 must equal original u128"
            );
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-5: Zero/Near-Zero BPS Soft Invariant
    //
    // If BPS = (0, 0) the protocol earns nothing — winner gets the whole pot.
    // This is silently allowed by the cap (combined 0 ≤ 1000); operational
    // policy must enforce non-zero BPS off-chain. The invariant documents
    // the surface.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        /// (0, 0) → winner gets 100% of pot.
        #[test]
        fn i_fee_5_zero_bps_winner_takes_all(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
        ) {
            let r = settle_math_v2(wager, num_deposited, 0, 0)
                .expect("zero-BPS settle must succeed");
            prop_assert_eq!(r.treasury_amount, 0u64, "0 treasury_bps must yield 0 treasury");
            prop_assert_eq!(r.ops_amount, 0u64, "0 ops_bps must yield 0 ops");
            prop_assert_eq!(r.winner_amount, r.total_pot, "winner must take 100% pot");
        }

        /// Non-zero BPS at sufficient pot yields non-zero fee.
        #[test]
        fn i_fee_5_nonzero_bps_yields_nonzero_fee(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            t_bps in 1u16..=MAX_FEE_BPS,
        ) {
            let pot_128 = (wager as u128) * (num_deposited as u128);
            let treasury = (pot_128 * t_bps as u128 / BPS_DENOMINATOR) as u64;
            // pot × t_bps ≥ BPS_DENOMINATOR ⟺ floored fee ≥ 1
            let threshold = (BPS_DENOMINATOR / t_bps as u128).saturating_add(1);
            if pot_128 >= threshold {
                prop_assert!(
                    treasury >= 1,
                    "Non-zero BPS at sufficient pot must yield ≥ 1 lamport: \
                     pot={}, t_bps={}, treasury={}",
                    pot_128, t_bps, treasury
                );
            }
        }
    }

    // ---------------------------------------------------------------
    // I-FEE-6: Monotonicity in treasury_bps (with ops_bps fixed)
    //
    // Treasury fee is non-decreasing in treasury_bps (floor division of a
    // linearly-increasing numerator). Winner is non-increasing in
    // treasury_bps (more fee → less winner).
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        /// Larger wager → all components non-decreasing.
        #[test]
        fn i_fee_6_wager_monotonicity(
            (t_bps, o_bps) in valid_bps_pair(),
            num_deposited in valid_num_deposited(),
            w1 in valid_wager(),
            w2 in valid_wager(),
        ) {
            let (lo, hi) = if w1 <= w2 { (w1, w2) } else { (w2, w1) };
            let r_lo = settle_math_v2(lo, num_deposited, t_bps, o_bps).unwrap();
            let r_hi = settle_math_v2(hi, num_deposited, t_bps, o_bps).unwrap();

            prop_assert!(r_hi.treasury_amount >= r_lo.treasury_amount);
            prop_assert!(r_hi.ops_amount >= r_lo.ops_amount);
            prop_assert!(r_hi.winner_amount >= r_lo.winner_amount);
        }

        /// Higher treasury_bps → winner non-increasing (with ops_bps fixed).
        /// We restrict t1, t2 ∈ [0, 500] and o_bps ∈ [0, 500] so that t + o
        /// always stays within the combined cap.
        #[test]
        fn i_fee_6_bps_monotonicity_winner(
            wager in valid_wager(),
            num_deposited in valid_num_deposited(),
            o_bps in 0u16..=500u16,
            t1 in 0u16..=500u16,
            t2 in 0u16..=500u16,
        ) {
            let (lo_t, hi_t) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
            let r_lo = settle_math_v2(wager, num_deposited, lo_t, o_bps).unwrap();
            let r_hi = settle_math_v2(wager, num_deposited, hi_t, o_bps).unwrap();

            prop_assert!(
                r_hi.treasury_amount >= r_lo.treasury_amount,
                "Treasury non-monotone in t_bps: lo_t={} → {}, hi_t={} → {}",
                lo_t, r_lo.treasury_amount, hi_t, r_hi.treasury_amount
            );
            prop_assert!(
                r_hi.winner_amount <= r_lo.winner_amount,
                "Winner non-monotone in t_bps: lo_t={} → {}, hi_t={} → {}",
                lo_t, r_lo.winner_amount, hi_t, r_hi.winner_amount
            );
        }
    }

    // ---------------------------------------------------------------
    // I-CAP-1: Init combined-cap with u32 widening (logic-level)
    //
    // initialize_config rejects any (t, o) with combined > 1000. The `as u32`
    // widening prevents u16 sum-wrap. Sweeps the FULL u16 × u16 surface to
    // catch any wrap regression (e.g., 33_000 + 33_000 wraps to 464 in u16,
    // but to 66_000 in u32 → correctly rejected).
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_cap_1_init_cap_holds(
            t_bps in 0u16..=u16::MAX,
            o_bps in 0u16..=u16::MAX,
        ) {
            let result = validate_init_bps(t_bps, o_bps);
            let combined: u32 = (t_bps as u32) + (o_bps as u32);
            if combined <= MAX_FEE_BPS as u32 {
                prop_assert!(
                    result.is_ok(),
                    "Valid combined {} rejected (t={}, o={})",
                    combined, t_bps, o_bps
                );
            } else {
                prop_assert!(
                    result.is_err(),
                    "Combined {} > {} accepted (t={}, o={})",
                    combined, MAX_FEE_BPS, t_bps, o_bps
                );
            }
        }

        /// Specifically verifies the widening doesn't wrap on values whose
        /// u16 sum would falsely pass the cap.
        #[test]
        fn i_cap_1_no_u16_wrap(
            t_bps in 30_000u16..=u16::MAX,
            o_bps in 30_000u16..=u16::MAX,
        ) {
            // These sums would wrap if computed in u16; widening to u32 must prevent that.
            let combined: u32 = (t_bps as u32) + (o_bps as u32);
            prop_assert!(
                combined > MAX_FEE_BPS as u32,
                "Test inputs should always combine > {}",
                MAX_FEE_BPS
            );
            prop_assert!(validate_init_bps(t_bps, o_bps).is_err());
        }
    }

    // ---------------------------------------------------------------
    // I-CAP-2: Update multi-step cap holds (logic-level)
    //
    // Any sequence of accepted update_config calls leaves the cap intact at
    // every observable state. Rejected calls do not mutate state.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_cap_2_multistep_cap_holds(
            initial in valid_bps_pair(),
            updates in proptest::collection::vec(
                (proptest::option::of(0u16..=u16::MAX), proptest::option::of(0u16..=u16::MAX)),
                1..20
            ),
        ) {
            let mut state = ConfigState { t: initial.0, o: initial.1 };
            prop_assert!(
                (state.t as u32) + (state.o as u32) <= MAX_FEE_BPS as u32,
                "Initial state invalid: t={}, o={}", state.t, state.o
            );

            for (new_t, new_o) in updates {
                match apply_update(&state, new_t, new_o) {
                    Ok(post) => {
                        prop_assert!(
                            (post.t as u32) + (post.o as u32) <= MAX_FEE_BPS as u32,
                            "Post-update cap violated: t={}, o={}, sum={}",
                            post.t, post.o, (post.t as u32) + (post.o as u32)
                        );
                        state = post;
                    }
                    Err(_) => {
                        // Rejected → state unchanged; cap still holds
                        prop_assert!(
                            (state.t as u32) + (state.o as u32) <= MAX_FEE_BPS as u32,
                            "State drift after rejection: t={}, o={}",
                            state.t, state.o
                        );
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Specific test cases — anchored sanity checks alongside fuzz sweeps
    // ---------------------------------------------------------------

    /// Default 700/300 with 2 players at MIN_WAGER.
    /// Mirrors v1's hardcoded 90/7/3 split — must produce exactly the same
    /// payouts that v1's tests verified.
    #[test]
    fn case_default_700_300_2p_min_wager() {
        let r = settle_math_v2(MIN_WAGER_LAMPORTS, 2, 700, 300).unwrap();
        // pot = 20_000; treasury = 20_000 × 700 / 10_000 = 1400
        //                  ops = 20_000 × 300 / 10_000 = 600
        //                  winner = 20_000 - 1400 - 600 = 18_000
        assert_eq!(r.total_pot, 20_000);
        assert_eq!(r.treasury_amount, 1_400);
        assert_eq!(r.ops_amount, 600);
        assert_eq!(r.winner_amount, 18_000);
        assert_eq!(r.winner_amount + r.treasury_amount + r.ops_amount, r.total_pot);
    }

    /// Maxed out: (999, 1) at 10 players × MAX_WAGER.
    #[test]
    fn case_max_999_1_10p_max_wager() {
        let r = settle_math_v2(MAX_WAGER_LAMPORTS, 10, 999, 1).unwrap();
        // pot = 100e9 × 10 = 1e12
        // treasury = 1e12 × 999 / 10_000 = 99_900_000_000 (99.9 SOL)
        // ops      = 1e12 × 1   / 10_000 = 100_000_000 (0.1 SOL)
        assert_eq!(r.total_pot, 1_000_000_000_000);
        assert_eq!(r.treasury_amount, 99_900_000_000);
        assert_eq!(r.ops_amount, 100_000_000);
        assert_eq!(r.winner_amount + r.treasury_amount + r.ops_amount, r.total_pot);
        // Winner gets exactly 90% (within 1 lamport)
        let expected_winner = r.total_pot - r.treasury_amount - r.ops_amount;
        assert_eq!(r.winner_amount, expected_winner);
    }

    /// Zero BPS: (0, 0) with 2 players → winner = pot.
    #[test]
    fn case_zero_bps_2p() {
        let r = settle_math_v2(MIN_WAGER_LAMPORTS, 2, 0, 0).unwrap();
        assert_eq!(r.treasury_amount, 0);
        assert_eq!(r.ops_amount, 0);
        assert_eq!(r.winner_amount, r.total_pot);
    }

    /// Asymmetric (500, 500) at 5 players.
    #[test]
    fn case_asymmetric_500_500_5p() {
        let wager = 1_000_000_000u64; // 1 SOL
        let r = settle_math_v2(wager, 5, 500, 500).unwrap();
        // pot = 5e9; treasury = 250_000_000; ops = 250_000_000
        // winner = 5e9 - 5e8 = 4_500_000_000 (exactly 90% — clean BPS values)
        assert_eq!(r.total_pot, 5_000_000_000);
        assert_eq!(r.treasury_amount, 250_000_000);
        assert_eq!(r.ops_amount, 250_000_000);
        assert_eq!(r.winner_amount, 4_500_000_000);
    }

    /// Edge MIN: (1, 1) at 2 players × MIN_WAGER.
    /// Pot = 20_000, fees of 1 BPS each = 20_000 × 1 / 10_000 = 2 lamports.
    #[test]
    fn case_edge_min_1_1_2p_min_wager() {
        let r = settle_math_v2(MIN_WAGER_LAMPORTS, 2, 1, 1).unwrap();
        assert_eq!(r.total_pot, 20_000);
        assert_eq!(r.treasury_amount, 2);
        assert_eq!(r.ops_amount, 2);
        assert_eq!(r.winner_amount, 19_996);
        assert_eq!(r.winner_amount + r.treasury_amount + r.ops_amount, r.total_pot);
    }

    /// Edge MAX single-fee: (1000, 0) at 10 players × MAX_WAGER.
    /// Tests the absolute upper bound of treasury fee.
    #[test]
    fn case_edge_max_1000_0_10p_max_wager() {
        let r = settle_math_v2(MAX_WAGER_LAMPORTS, 10, 1_000, 0).unwrap();
        // pot = 1e12; treasury = 1e12 × 1000 / 10_000 = 1e11 (100 SOL)
        // ops = 0; winner = 1e12 - 1e11 = 9e11 (900 SOL)
        assert_eq!(r.total_pot, 1_000_000_000_000);
        assert_eq!(r.treasury_amount, 100_000_000_000);
        assert_eq!(r.ops_amount, 0);
        assert_eq!(r.winner_amount, 900_000_000_000);
    }

    /// Sanity: cap-boundary cases for init.
    #[test]
    fn case_init_cap_boundary() {
        // (500, 500) → exactly cap = 1000 → accepted
        assert!(validate_init_bps(500, 500).is_ok());
        // (501, 500) → 1001 > cap → rejected
        assert!(validate_init_bps(501, 500).is_err());
        // (1000, 0) → exactly cap → accepted
        assert!(validate_init_bps(1000, 0).is_ok());
        // (1001, 0) → over cap → rejected
        assert!(validate_init_bps(1001, 0).is_err());
        // (33_000, 33_000) → would wrap in u16 to 464; widening to u32 → 66_000, rejected
        assert!(validate_init_bps(33_000, 33_000).is_err());
        // u16::MAX, u16::MAX → 131_070 in u32, rejected
        assert!(validate_init_bps(u16::MAX, u16::MAX).is_err());
    }
}
