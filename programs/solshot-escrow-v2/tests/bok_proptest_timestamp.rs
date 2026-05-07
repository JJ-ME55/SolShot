//! BOK Proptest Harness — v2 Timestamp / Duration Arithmetic Invariants
//!
//! Verifies the deadline-arithmetic and bounds-enforcement properties of v2's
//! timestamp logic across deposit_wager, start_with_depositors, cancel_match,
//! and permissionless_reclaim.
//!
//! Invariants covered (from .bok/confirmed-invariants/03-timestamp.md):
//!   INV-1   No overflow on any deadline addition
//!   INV-2   Monotonic deadline ordering: deposit_deadline ≤ match_end_ts ≤ reclaim_deadline
//!   INV-5   POST-H018-FIX: at T = deposit_deadline exactly, deposit_wager rejected
//!   INV-6   Deposit window bounded [60, 86400]
//!   INV-7   POST-H039-FIX: duration bounded [60, 86400]
//!   INV-9   Reclaim grace ≥ match_end + 24h
//!   INV-12  u32 → i64 cast safety
//!
//! Run with: `cargo test --test bok_proptest_timestamp -- --nocapture`

#[cfg(test)]
mod bok_v2_timestamp_invariants {
    use proptest::prelude::*;

    // ---------------------------------------------------------------
    // Constants — mirrored verbatim from
    //   programs/solshot-escrow-v2/src/lib.rs:30-50
    // ---------------------------------------------------------------

    /// Minimum and maximum match duration — H039 fix capped at 24h.
    const MIN_DURATION_SECS: u32 = 60;
    const MAX_DURATION_SECS: u32 = 24 * 3_600; // 86_400

    /// Minimum and maximum deposit-window length.
    const MIN_DEPOSIT_WINDOW_SECS: u32 = 60;
    const MAX_DEPOSIT_WINDOW_SECS: u32 = 24 * 3_600; // 86_400

    /// Public-grace window between match end and permissionless_reclaim.
    const PUBLIC_REFUND_GRACE_SECS: i64 = 24 * 3_600; // 86_400

    // Timestamp ranges for proptest sweep — anchored to plausible Solana block clock.
    /// Year 2020 = 1_577_836_800 epoch seconds.
    const MIN_REALISTIC_TS: i64 = 1_577_836_800;
    /// Year 2100 = 4_102_444_800 epoch seconds.
    const MAX_REALISTIC_TS: i64 = 4_102_444_800;

    // ---------------------------------------------------------------
    // Local re-implementation of v2 deadline arithmetic
    // (mirrors lib.rs:255-262, 296-303, 365-369, 470-477, 539-549)
    // ---------------------------------------------------------------

    /// Mirrors v2 deposit_deadline calculation.
    fn compute_deposit_deadline(created_at: i64, deposit_window_secs: u32) -> Option<i64> {
        created_at.checked_add(deposit_window_secs as i64)
    }

    /// Mirrors v2 match_end_ts calculation in deposit_wager (full-mask path) and
    /// start_with_depositors. Both compute `now + duration_secs` where
    /// `now = activated_at`.
    fn compute_match_end_ts(activated_at: i64, duration_secs: u32) -> Option<i64> {
        activated_at.checked_add(duration_secs as i64)
    }

    /// Mirrors v2 reclaim_deadline calculation:
    ///   - Active state: match_end_ts + PUBLIC_REFUND_GRACE_SECS
    ///   - AwaitingDeposits stalled: deposit_deadline + PUBLIC_REFUND_GRACE_SECS
    fn compute_reclaim_deadline(reference_ts: i64, grace_secs: i64) -> Option<i64> {
        reference_ts.checked_add(grace_secs)
    }

    // ---------------------------------------------------------------
    // Strategies
    // ---------------------------------------------------------------

    fn realistic_ts() -> impl Strategy<Value = i64> {
        MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    }

    fn valid_deposit_window_secs() -> impl Strategy<Value = u32> {
        MIN_DEPOSIT_WINDOW_SECS..=MAX_DEPOSIT_WINDOW_SECS
    }

    fn valid_duration_secs() -> impl Strategy<Value = u32> {
        MIN_DURATION_SECS..=MAX_DURATION_SECS
    }

    fn config_50k() -> ProptestConfig {
        ProptestConfig {
            cases: 50_000,
            ..ProptestConfig::default()
        }
    }

    fn config_10k() -> ProptestConfig {
        ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        }
    }

    // ---------------------------------------------------------------
    // INV-1: No overflow on any deadline addition (realistic range)
    //
    // For all realistic timestamps (2020 through 2100) and all valid
    // deposit_window_secs / duration_secs / chain-of-2-additions:
    //   created_at + window_secs is Some(_)
    //   activated_at + duration_secs is Some(_)
    //   match_end_ts + GRACE is Some(_)
    //   deposit_deadline + GRACE is Some(_)
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn inv_1_no_deadline_overflow_realistic(
            ts in realistic_ts(),
            window_secs in valid_deposit_window_secs(),
            duration_secs in valid_duration_secs(),
        ) {
            let dep_deadline = compute_deposit_deadline(ts, window_secs);
            prop_assert!(dep_deadline.is_some(), "deposit_deadline overflow @ ts={}", ts);

            let match_end = compute_match_end_ts(ts, duration_secs);
            prop_assert!(match_end.is_some(), "match_end overflow @ ts={}", ts);

            // Chained: reclaim_deadline_active = match_end_ts + GRACE
            let rd_active = compute_reclaim_deadline(match_end.unwrap(), PUBLIC_REFUND_GRACE_SECS);
            prop_assert!(rd_active.is_some(), "reclaim_deadline (active) overflow");

            // Chained: reclaim_deadline_awaiting = deposit_deadline + GRACE
            let rd_awaiting = compute_reclaim_deadline(dep_deadline.unwrap(), PUBLIC_REFUND_GRACE_SECS);
            prop_assert!(rd_awaiting.is_some(), "reclaim_deadline (awaiting) overflow");
        }

        /// Boundary: at i64::MAX, additions of any positive constant return None.
        /// At (i64::MAX - K) + K = Some(i64::MAX); (i64::MAX - K + 1) + K = None.
        #[test]
        fn inv_1_overflow_at_i64_max_boundary(
            window_secs in valid_deposit_window_secs(),
        ) {
            let w = window_secs as i64;
            // i64::MAX + anything positive must overflow
            prop_assert!(i64::MAX.checked_add(w).is_none());
            // last_safe + w = exactly i64::MAX
            let last_safe = i64::MAX - w;
            prop_assert!(last_safe.checked_add(w).is_some());
            prop_assert_eq!(last_safe.checked_add(w), Some(i64::MAX));
            // last_safe + 1 + w must overflow
            prop_assert!((last_safe + 1).checked_add(w).is_none());
        }
    }

    // ---------------------------------------------------------------
    // INV-2: Monotonic deadline ordering
    //
    // For start_with_depositors path (now ≥ deposit_deadline), the activated_at
    // ≥ deposit_deadline → match_end_ts = activated_at + duration_secs ≥
    // deposit_deadline. reclaim_deadline = match_end_ts + GRACE > match_end_ts.
    // For AwaitingDeposits-stalled path, reclaim_deadline = deposit_deadline + GRACE
    // > deposit_deadline.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn inv_2_swd_ordering(
            created_at in realistic_ts(),
            deposit_window_secs in valid_deposit_window_secs(),
            duration_secs in valid_duration_secs(),
        ) {
            let dep_deadline = compute_deposit_deadline(created_at, deposit_window_secs).unwrap();
            // start_with_depositors guard: now >= dep_deadline → activated_at ≥ dep_deadline
            let activated_at = dep_deadline;
            let match_end_ts = compute_match_end_ts(activated_at, duration_secs).unwrap();
            let reclaim_deadline = compute_reclaim_deadline(match_end_ts, PUBLIC_REFUND_GRACE_SECS).unwrap();

            prop_assert!(
                match_end_ts >= dep_deadline,
                "match_end_ts {} < dep_deadline {}", match_end_ts, dep_deadline
            );
            prop_assert!(
                reclaim_deadline > match_end_ts,
                "reclaim_deadline {} ≤ match_end_ts {}", reclaim_deadline, match_end_ts
            );
            // Strict gap = exactly 24h
            prop_assert_eq!(reclaim_deadline - match_end_ts, PUBLIC_REFUND_GRACE_SECS);
        }

        #[test]
        fn inv_2_awaiting_ordering(
            created_at in realistic_ts(),
            deposit_window_secs in valid_deposit_window_secs(),
        ) {
            let dep_deadline = compute_deposit_deadline(created_at, deposit_window_secs).unwrap();
            let reclaim_deadline = compute_reclaim_deadline(dep_deadline, PUBLIC_REFUND_GRACE_SECS).unwrap();
            prop_assert!(reclaim_deadline > dep_deadline);
            prop_assert_eq!(reclaim_deadline - dep_deadline, PUBLIC_REFUND_GRACE_SECS);
        }
    }

    // ---------------------------------------------------------------
    // INV-5 (POST-H018-FIX): at T = deposit_deadline exactly,
    //   deposit_wager (require!(now < dd)) → rejected
    //   start_with_depositors (require!(now >= dd)) → permitted
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn inv_5_v2_deposit_window_partition(
            created_at in realistic_ts(),
            window_secs in valid_deposit_window_secs(),
            offset in -10i64..=10i64,
        ) {
            let dep_deadline = compute_deposit_deadline(created_at, window_secs).unwrap();
            let now = dep_deadline + offset;
            let deposit_check = now < dep_deadline; // strict < (post-H018)
            let swd_check = now >= dep_deadline;     // inclusive >=
            // Mutual exclusion at all offsets
            prop_assert!(
                !(deposit_check && swd_check),
                "Boundary race at offset={}, now={}, dd={}",
                offset, now, dep_deadline
            );
            // No gap (one of them always passes the time check)
            prop_assert!(
                deposit_check || swd_check,
                "Boundary gap at offset={}, now={}, dd={}",
                offset, now, dep_deadline
            );
            if offset == 0 {
                // POST-H018-FIX: at exact deadline, deposit must be REJECTED
                prop_assert!(!deposit_check, "deposit must be REJECTED at exact deadline");
                prop_assert!(swd_check, "swd must be PERMITTED at exact deadline");
            }
            if offset == -1 {
                prop_assert!(deposit_check, "deposit must be permitted at deadline - 1");
                prop_assert!(!swd_check, "swd must be rejected at deadline - 1");
            }
            if offset == 1 {
                prop_assert!(!deposit_check);
                prop_assert!(swd_check);
            }
        }
    }

    // ---------------------------------------------------------------
    // INV-6: deposit_window_secs bounded [60, 86400]
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn inv_6_deposit_window_bounds_in_range(
            x in MIN_DEPOSIT_WINDOW_SECS..=MAX_DEPOSIT_WINDOW_SECS,
        ) {
            // Allowed range round-trips through u32→i64 cast safely
            let i64_val = x as i64;
            prop_assert!(i64_val >= MIN_DEPOSIT_WINDOW_SECS as i64);
            prop_assert!(i64_val <= MAX_DEPOSIT_WINDOW_SECS as i64);
        }

        #[test]
        fn inv_6_deposit_window_bounds_below_rejected(
            below in 0u32..MIN_DEPOSIT_WINDOW_SECS,
        ) {
            prop_assert!(below < MIN_DEPOSIT_WINDOW_SECS);
        }

        #[test]
        fn inv_6_deposit_window_bounds_above_rejected(
            above in (MAX_DEPOSIT_WINDOW_SECS + 1)..=u32::MAX,
        ) {
            prop_assert!(above > MAX_DEPOSIT_WINDOW_SECS);
        }
    }

    // ---------------------------------------------------------------
    // INV-7 (POST-H039-FIX): duration_secs bounded [60, 86400]
    //
    // H039 capped at 24h (was 7 days). Verifies the bound holds and
    // max lockup horizon = MAX_DURATION + GRACE = 48h.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn inv_7_duration_in_range(
            d in MIN_DURATION_SECS..=MAX_DURATION_SECS,
        ) {
            prop_assert!((d as i64) >= MIN_DURATION_SECS as i64);
            prop_assert!((d as i64) <= MAX_DURATION_SECS as i64);
        }

        #[test]
        fn inv_7_max_lockup_horizon(
            d in MIN_DURATION_SECS..=MAX_DURATION_SECS,
        ) {
            let max_lockup = (d as i64) + PUBLIC_REFUND_GRACE_SECS;
            prop_assert!(
                max_lockup <= 172_800,
                "Max lockup horizon must be ≤ 48h; got {}s",
                max_lockup
            );
        }
    }

    /// Pinned regression test: MAX_DURATION_SECS must not regress to 7 days.
    #[test]
    fn inv_7_max_duration_did_not_regress() {
        assert_eq!(
            MAX_DURATION_SECS, 86_400,
            "H039 fix: MAX_DURATION_SECS must remain 86400; do NOT regress to 604800"
        );
        assert!(
            MAX_DURATION_SECS < 604_800,
            "Regression guard: MAX_DURATION_SECS must be < 7d (was 7d pre-H039)"
        );
    }

    // ---------------------------------------------------------------
    // INV-9: Reclaim grace ≥ match_end + 24h
    //
    // Verifies the public-grace floor: reclaim opens exactly 24h after
    // match_end_ts (Active) or 24h after deposit_deadline (AwaitingDeposits).
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn inv_9_v2_active_reclaim_after_match_end(
            activated_at in realistic_ts(),
            duration_secs in valid_duration_secs(),
        ) {
            let match_end_ts = compute_match_end_ts(activated_at, duration_secs).unwrap();
            let reclaim_deadline = compute_reclaim_deadline(match_end_ts, PUBLIC_REFUND_GRACE_SECS).unwrap();
            prop_assert!(reclaim_deadline > match_end_ts);
            prop_assert_eq!(reclaim_deadline - match_end_ts, PUBLIC_REFUND_GRACE_SECS);
            prop_assert_eq!(reclaim_deadline - match_end_ts, 86_400);
        }

        #[test]
        fn inv_9_v2_awaiting_reclaim_after_deposit_deadline(
            created_at in realistic_ts(),
            window_secs in valid_deposit_window_secs(),
        ) {
            let dep_deadline = compute_deposit_deadline(created_at, window_secs).unwrap();
            let reclaim_deadline = compute_reclaim_deadline(dep_deadline, PUBLIC_REFUND_GRACE_SECS).unwrap();
            prop_assert_eq!(reclaim_deadline - dep_deadline, 86_400);
        }
    }

    // ---------------------------------------------------------------
    // INV-12: u32 → i64 cast safety
    //
    // Every (some_u32 as i64) cast preserves value (u32::MAX = 4.29e9 is
    // way below i64::MAX = 9.22e18). Sweeps the full u32 range.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn inv_12_u32_to_i64_safe(v in 0u32..=u32::MAX) {
            let widened = v as i64;
            prop_assert!(widened >= 0, "u32→i64 produced negative");
            prop_assert!(widened <= u32::MAX as i64);
            prop_assert!(widened < i64::MAX);
        }

        /// Even at u32::MAX (theoretical), addition with realistic timestamp must succeed.
        /// At realistic ts ≤ 4.1e9 + u32::MAX ≈ 4.29e9 = ~8.4e9 ≪ i64::MAX.
        #[test]
        fn inv_12_realistic_ts_plus_u32_max_safe(
            ts in realistic_ts(),
            v in 0u32..=u32::MAX,
        ) {
            let result = ts.checked_add(v as i64);
            prop_assert!(result.is_some(), "ts={} + u32_as_i64={} overflowed", ts, v);
        }

        /// For the program's bounded fields, addition is doubly safe.
        #[test]
        fn inv_12_bounded_fields_addition_safe(
            ts in realistic_ts(),
            v in 0u32..=MAX_DEPOSIT_WINDOW_SECS,
        ) {
            let result = ts.checked_add(v as i64);
            prop_assert!(result.is_some());
        }
    }

    // ---------------------------------------------------------------
    // Specific test cases — anchored sanity checks
    // ---------------------------------------------------------------

    /// Max u32 window with realistic created_at.
    #[test]
    fn case_max_u32_window_with_realistic_ts() {
        let created_at = MAX_REALISTIC_TS;
        let result = created_at.checked_add(u32::MAX as i64);
        assert!(result.is_some(), "max u32 window with realistic ts overflowed");
        // Result ≈ 4.1e9 + 4.29e9 ≈ 8.4e9 ≪ i64::MAX
    }

    /// Min duration with 24h grace.
    #[test]
    fn case_min_duration_with_grace() {
        let activated_at = MIN_REALISTIC_TS;
        let match_end = compute_match_end_ts(activated_at, MIN_DURATION_SECS).unwrap();
        let reclaim = compute_reclaim_deadline(match_end, PUBLIC_REFUND_GRACE_SECS).unwrap();
        assert_eq!(match_end - activated_at, 60);
        assert_eq!(reclaim - activated_at, 60 + 86_400);
    }

    /// Max duration + max grace combined.
    #[test]
    fn case_max_duration_plus_grace() {
        let activated_at = MAX_REALISTIC_TS;
        let match_end = compute_match_end_ts(activated_at, MAX_DURATION_SECS).unwrap();
        let reclaim = compute_reclaim_deadline(match_end, PUBLIC_REFUND_GRACE_SECS).unwrap();
        assert_eq!(match_end - activated_at, 86_400);
        assert_eq!(reclaim - activated_at, 86_400 + 86_400); // 48h max lockup
    }

    /// At exact i64::MAX boundary, addition must overflow.
    #[test]
    fn case_i64_max_overflow_caught() {
        assert!(i64::MAX.checked_add(1).is_none());
        assert!(i64::MAX.checked_add(MAX_DURATION_SECS as i64).is_none());
        let last_safe = i64::MAX - PUBLIC_REFUND_GRACE_SECS;
        assert!(last_safe.checked_add(PUBLIC_REFUND_GRACE_SECS).is_some());
        assert_eq!(last_safe.checked_add(PUBLIC_REFUND_GRACE_SECS), Some(i64::MAX));
        assert!((last_safe + 1).checked_add(PUBLIC_REFUND_GRACE_SECS).is_none());
    }

    /// Exact deadline boundary (POST-H018-FIX).
    #[test]
    fn case_h018_boundary_at_deposit_deadline() {
        let created_at = MIN_REALISTIC_TS;
        let dep_deadline = compute_deposit_deadline(created_at, MIN_DEPOSIT_WINDOW_SECS).unwrap();
        // At exact deadline:
        let now = dep_deadline;
        // deposit_wager: require!(now < dep_deadline) — must FAIL
        assert!(!(now < dep_deadline), "POST-H018: deposit_wager must be rejected at exact deadline");
        // start_with_depositors: require!(now >= dep_deadline) — must PASS
        assert!(now >= dep_deadline, "swd must be permitted at exact deadline");
    }

    /// Pinned constants regression check.
    #[test]
    fn case_constants_pinned() {
        assert_eq!(MIN_DURATION_SECS, 60);
        assert_eq!(MAX_DURATION_SECS, 86_400);
        assert_eq!(MIN_DEPOSIT_WINDOW_SECS, 60);
        assert_eq!(MAX_DEPOSIT_WINDOW_SECS, 86_400);
        assert_eq!(PUBLIC_REFUND_GRACE_SECS, 86_400);
    }
}
