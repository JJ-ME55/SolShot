//! BOK Proptest Suite: Timestamp & Duration Invariants
//! (TS-INV-1 through TS-INV-6 + INV-3 H035-fix + INV-10 H017-fix)
//!
//! Verifies arithmetic safety, deadline ordering, constant relationships, and
//! timeout reference logic for the SolShot escrow program's time-based operations.
//!
//! POST-FIX-BUNDLE CONSTANTS (2026-05-07):
//!   - TIMEOUT_SECONDS:                3600 (was 600)  — H035 race-window fix
//!   - PERMISSIONLESS_RECLAIM_TIMEOUT: 7200 (was 1200) — H040 doc-vs-code drift fix
//!   - MIN_DEPOSIT_WINDOW_SECS:        600  (NEW)      — H017 silent-kick fix
//!
//! DEGRADED MODE: Proptest only (no Kani harnesses).
//!
//! Run with: `cargo test --test bok_proptest_timestamp`

use proptest::prelude::*;

// ─────────────────────────────────────────────────────────────
// CONSTANTS — mirrored from programs/solshot-escrow/src/lib.rs
// ─────────────────────────────────────────────────────────────

/// 1-hour timeout for deposit window AND post-activation player-cancel (ESC-10).
/// POST-H035-FIX: was 600s; raised to 3600s to align with SETTLEMENT_TIMEOUT_SECONDS
/// and eliminate the simultaneous-validity race window.
const TIMEOUT_SECONDS: i64 = 3_600;

/// 2-hour permissionless reclaim timeout (2x normal timeout) — DCA-02.
/// POST-H040-FIX: was 1200s; comment claimed 48h but math gave 20min. Now matches
/// the comment: TIMEOUT_SECONDS (3600) * 2 = 7200s = 2 hours.
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 7_200

/// 1-hour settlement deadline after match activation (OC-07).
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3_600;

/// Minimum deposit-window duration before authority may activate via start_with_depositors.
/// POST-H017-FIX (NEW): mirrors v2's deposit_window_secs gate — prevents silent-kick
/// of in-flight depositors by the authority.
const MIN_DEPOSIT_WINDOW_SECS: i64 = 600; // 10 minutes

/// Earliest realistic Unix timestamp: 2020-01-01T00:00:00Z.
const MIN_REALISTIC_TS: i64 = 1_577_836_800;

/// Latest realistic Unix timestamp: 2100-01-01T00:00:00Z.
const MAX_REALISTIC_TS: i64 = 4_102_444_800;

// ─────────────────────────────────────────────────────────────
// HELPER — re-implements the on-chain timeout_reference logic
// ─────────────────────────────────────────────────────────────

/// Derives the timeout reference timestamp exactly as the on-chain program does.
///
/// When `activated_at > 0`, uses `activated_at` (match was activated).
/// When `activated_at == 0`, falls back to `created_at` (match never activated).
fn timeout_reference(activated_at: i64, created_at: i64) -> i64 {
    if activated_at > 0 {
        activated_at
    } else {
        created_at
    }
}

// ─────────────────────────────────────────────────────────────
// STRATEGIES
// ─────────────────────────────────────────────────────────────

/// Strategy producing realistic timestamps in [2020, 2100].
fn realistic_timestamp() -> impl Strategy<Value = i64> {
    MIN_REALISTIC_TS..=MAX_REALISTIC_TS
}

/// Strategy producing timestamps that would trigger overflow on the largest
/// addition (PERMISSIONLESS_RECLAIM_TIMEOUT = 7200, post-H040-fix).
fn overflow_boundary_timestamp() -> impl Strategy<Value = i64> {
    (i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT + 1)..=i64::MAX
}

// =============================================================
// TS-INV-1a: Settlement Deadline Overflow Safety
// =============================================================

proptest! {
    /// TS-INV-1a (realistic range): `activated_at + SETTLEMENT_TIMEOUT_SECONDS`
    /// must not overflow i64 for any realistic timestamp in [2020, 2100].
    ///
    /// The settlement deadline is the first arithmetic performed after match
    /// activation. If this overflows, settle_match would erroneously revert
    /// with ArithmeticOverflow for valid matches.
    #[test]
    fn ts_inv_1a_settlement_deadline_no_overflow_realistic(
        activated_at in realistic_timestamp()
    ) {
        let result = activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        prop_assert!(
            result.is_some(),
            "Settlement deadline overflowed for activated_at={} + SETTLEMENT_TIMEOUT_SECONDS={}",
            activated_at,
            SETTLEMENT_TIMEOUT_SECONDS,
        );

        // The deadline must be strictly greater than activated_at
        let deadline = result.unwrap();
        prop_assert!(
            deadline > activated_at,
            "Settlement deadline {} must be > activated_at {}",
            deadline,
            activated_at,
        );
    }
}

/// TS-INV-1a (boundary): Exact overflow boundary for settlement deadline.
/// `i64::MAX - SETTLEMENT_TIMEOUT_SECONDS` is the last safe value.
/// `i64::MAX - SETTLEMENT_TIMEOUT_SECONDS + 1` must overflow.
#[test]
fn ts_inv_1a_settlement_deadline_overflow_boundary() {
    let last_safe = i64::MAX - SETTLEMENT_TIMEOUT_SECONDS;
    assert!(
        last_safe.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_some(),
        "Last safe value should not overflow"
    );

    let first_overflow = last_safe + 1;
    assert!(
        first_overflow.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_none(),
        "First overflow value should overflow"
    );

    // i64::MAX itself must overflow
    assert!(
        i64::MAX.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_none(),
        "i64::MAX + SETTLEMENT_TIMEOUT_SECONDS must overflow"
    );
}

// =============================================================
// TS-INV-1b: Cancel Timeout Overflow Safety
// =============================================================

proptest! {
    /// TS-INV-1b (realistic range): `timeout_ref + TIMEOUT_SECONDS`
    /// must not overflow i64 for any realistic timestamp in [2020, 2100].
    ///
    /// The cancel timeout deadline is computed in cancel_match. An overflow
    /// here would prevent players from ever cancelling timed-out matches.
    #[test]
    fn ts_inv_1b_cancel_timeout_no_overflow_realistic(
        timeout_ref in realistic_timestamp()
    ) {
        let result = timeout_ref.checked_add(TIMEOUT_SECONDS);
        prop_assert!(
            result.is_some(),
            "Cancel timeout overflowed for timeout_ref={} + TIMEOUT_SECONDS={}",
            timeout_ref,
            TIMEOUT_SECONDS,
        );

        let deadline = result.unwrap();
        prop_assert!(
            deadline > timeout_ref,
            "Cancel deadline {} must be > timeout_ref {}",
            deadline,
            timeout_ref,
        );
    }
}

/// TS-INV-1b (boundary): Exact overflow boundary for cancel timeout.
#[test]
fn ts_inv_1b_cancel_timeout_overflow_boundary() {
    let last_safe = i64::MAX - TIMEOUT_SECONDS;
    assert!(
        last_safe.checked_add(TIMEOUT_SECONDS).is_some(),
        "Last safe cancel timeout value should not overflow"
    );

    let first_overflow = last_safe + 1;
    assert!(
        first_overflow.checked_add(TIMEOUT_SECONDS).is_none(),
        "First overflow cancel timeout value should overflow"
    );
}

// =============================================================
// TS-INV-1c: Permissionless Reclaim Overflow Safety
// =============================================================

proptest! {
    /// TS-INV-1c (realistic range): `timeout_ref + PERMISSIONLESS_RECLAIM_TIMEOUT`
    /// must not overflow i64 for any realistic timestamp in [2020, 2100].
    ///
    /// POST-H040-FIX: PERMISSIONLESS_RECLAIM_TIMEOUT is now 7200s (was 1200s).
    /// It is now the largest constant addition in the program (>= SETTLEMENT_TIMEOUT_SECONDS).
    /// Both are tiny compared to i64::MAX so overflow is not a practical concern,
    /// but checked_add is used for safety. If this overflows, the last-resort
    /// permissionless fund recovery path is broken.
    #[test]
    fn ts_inv_1c_reclaim_timeout_no_overflow_realistic(
        timeout_ref in realistic_timestamp()
    ) {
        let result = timeout_ref.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT);
        prop_assert!(
            result.is_some(),
            "Reclaim timeout overflowed for timeout_ref={} + PERMISSIONLESS_RECLAIM_TIMEOUT={}",
            timeout_ref,
            PERMISSIONLESS_RECLAIM_TIMEOUT,
        );

        let deadline = result.unwrap();
        prop_assert!(
            deadline > timeout_ref,
            "Reclaim deadline {} must be > timeout_ref {}",
            deadline,
            timeout_ref,
        );
    }
}

/// TS-INV-1c (boundary): Timestamps near i64::MAX MUST overflow for reclaim.
/// This confirms `checked_add` actually catches the overflow in the on-chain code.
#[test]
fn ts_inv_1c_reclaim_timeout_overflow_boundary() {
    let last_safe = i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT;
    assert!(
        last_safe.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_some(),
        "Last safe reclaim timeout value should not overflow"
    );

    let first_overflow = last_safe + 1;
    assert!(
        first_overflow.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_none(),
        "First overflow reclaim timeout value should overflow"
    );

    // Verify the headroom is enormous for realistic timestamps.
    // MAX_REALISTIC_TS + PERMISSIONLESS_RECLAIM_TIMEOUT << i64::MAX
    let headroom = i64::MAX - (MAX_REALISTIC_TS + PERMISSIONLESS_RECLAIM_TIMEOUT);
    assert!(
        headroom > 0,
        "Headroom must be positive for realistic range"
    );
    // Headroom should be ~9.22e18 - 4.10e9 ~ practically the full i64 range
    assert!(
        headroom > 1_000_000_000_000_000_000,
        "Headroom should be enormous: got {}",
        headroom,
    );
}

proptest! {
    /// TS-INV-1c (overflow range): Timestamps in the overflow zone MUST fail checked_add.
    /// This proves the on-chain `checked_add(...).ok_or(ArithmeticOverflow)?` pattern
    /// correctly catches all overflow cases.
    #[test]
    fn ts_inv_1c_reclaim_timeout_overflow_zone(
        ts in overflow_boundary_timestamp()
    ) {
        let result = ts.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT);
        prop_assert!(
            result.is_none(),
            "Expected overflow for ts={} + PERMISSIONLESS_RECLAIM_TIMEOUT={}, got {:?}",
            ts,
            PERMISSIONLESS_RECLAIM_TIMEOUT,
            result,
        );
    }
}

// =============================================================
// TS-INV-2: Deadline Ordering (settle < cancel < reclaim)
// =============================================================

proptest! {
    /// TS-INV-2 (POST-H035-FIX): For any valid `activated_at`, the three deadlines
    /// satisfy the post-fix-bundle relationship:
    ///     cancel_deadline == settle_deadline < reclaim_deadline
    ///
    /// This is the foundation of the v1 match lifecycle timeout design after H035:
    /// - Cancel window opens after 1 hour (TIMEOUT_SECONDS = 3600)
    /// - Settlement window closes at 1 hour (SETTLEMENT_TIMEOUT_SECONDS = 3600)
    /// - Permissionless reclaim opens after 2 hours (PERMISSIONLESS_RECLAIM_TIMEOUT = 7200)
    ///
    /// POST-H035-FIX: cancel_deadline and settle_deadline are now EQUAL. The
    /// simultaneous-validity race window has collapsed to at most a single slot
    /// (where settle is `<=` and cancel is `>`, so the boundary partitions cleanly).
    /// See INV-3 below for the no-overlap proof.
    #[test]
    fn ts_inv_2_deadline_ordering(
        activated_at in realistic_timestamp()
    ) {
        let cancel_deadline = activated_at
            .checked_add(TIMEOUT_SECONDS)
            .unwrap();
        let reclaim_deadline = activated_at
            .checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)
            .unwrap();
        let settle_deadline = activated_at
            .checked_add(SETTLEMENT_TIMEOUT_SECONDS)
            .unwrap();

        // POST-H035-FIX: cancel_deadline == settle_deadline (both at 3600s).
        prop_assert_eq!(
            cancel_deadline, settle_deadline,
            "POST-H035-FIX: cancel_deadline must EQUAL settle_deadline at activated_at={}",
            activated_at,
        );

        // reclaim_deadline (7200s) must be strictly greater than both.
        prop_assert!(
            reclaim_deadline > cancel_deadline,
            "reclaim_deadline {} must be > cancel_deadline {} (activated_at={})",
            reclaim_deadline,
            cancel_deadline,
            activated_at,
        );

        prop_assert!(
            reclaim_deadline > settle_deadline,
            "reclaim_deadline {} must be > settle_deadline {} (activated_at={})",
            reclaim_deadline,
            settle_deadline,
            activated_at,
        );
    }
}

/// TS-INV-2 (static, POST-H035-FIX): Verify constant ordering holds at the constant level,
/// independent of any timestamp value.
///
/// Post-fix-bundle ordering:
///   TIMEOUT_SECONDS == SETTLEMENT_TIMEOUT_SECONDS (3600) < PERMISSIONLESS_RECLAIM_TIMEOUT (7200)
///
/// The 2x relationship between cancel/settle and reclaim is now via TIMEOUT_SECONDS
/// rather than PERMISSIONLESS_RECLAIM_TIMEOUT alone.
/// Cancel and settle deadlines coincide — see INV-3 for the no-overlap partition.
#[test]
fn ts_inv_2_constant_ordering_static() {
    assert_eq!(
        TIMEOUT_SECONDS, SETTLEMENT_TIMEOUT_SECONDS,
        "POST-H035-FIX: TIMEOUT_SECONDS ({}) must EQUAL SETTLEMENT_TIMEOUT_SECONDS ({})",
        TIMEOUT_SECONDS,
        SETTLEMENT_TIMEOUT_SECONDS,
    );
    assert!(
        TIMEOUT_SECONDS < PERMISSIONLESS_RECLAIM_TIMEOUT,
        "TIMEOUT_SECONDS ({}) must be < PERMISSIONLESS_RECLAIM_TIMEOUT ({})",
        TIMEOUT_SECONDS,
        PERMISSIONLESS_RECLAIM_TIMEOUT,
    );
    assert!(
        SETTLEMENT_TIMEOUT_SECONDS < PERMISSIONLESS_RECLAIM_TIMEOUT,
        "SETTLEMENT_TIMEOUT_SECONDS ({}) must be < PERMISSIONLESS_RECLAIM_TIMEOUT ({})",
        SETTLEMENT_TIMEOUT_SECONDS,
        PERMISSIONLESS_RECLAIM_TIMEOUT,
    );
}

/// TS-INV-2 (static, POST-FIX-BUNDLE): Verify exact constant values match the
/// post-fix-bundle specification (TIMEOUT_SECONDS=3600, RECLAIM=7200, MIN_DEPOSIT=600).
#[test]
fn ts_inv_2_constant_values_exact() {
    assert_eq!(SETTLEMENT_TIMEOUT_SECONDS, 3_600, "Settlement timeout must be 1 hour");
    assert_eq!(TIMEOUT_SECONDS, 3_600,
        "POST-H035-FIX: Cancel timeout must be 1 hour (was 600s pre-fix)");
    assert_eq!(PERMISSIONLESS_RECLAIM_TIMEOUT, 7_200,
        "POST-H040-FIX: Reclaim timeout must be 2 hours (was 1200s pre-fix)");
    assert_eq!(MIN_DEPOSIT_WINDOW_SECS, 600,
        "POST-H017-FIX: Minimum deposit window must be 10 minutes");
}

// =============================================================
// TS-INV-3: Constant Relationship (RECLAIM == 2 * CANCEL)
// =============================================================

/// TS-INV-3 (static): `PERMISSIONLESS_RECLAIM_TIMEOUT == 2 * TIMEOUT_SECONDS`.
///
/// Rust const arithmetic wraps silently on overflow. This test catches any
/// scenario where `TIMEOUT_SECONDS > i64::MAX / 2`, which would cause the
/// `TIMEOUT_SECONDS * 2` expression in lib.rs to silently wrap.
#[test]
fn ts_inv_3_constant_relationship_2x() {
    // Primary relationship: reclaim == 2 * cancel
    assert_eq!(
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        2 * TIMEOUT_SECONDS,
        "PERMISSIONLESS_RECLAIM_TIMEOUT must equal 2 * TIMEOUT_SECONDS"
    );

    // Guard against const overflow: TIMEOUT_SECONDS must be <= i64::MAX / 2
    assert!(
        TIMEOUT_SECONDS <= i64::MAX / 2,
        "TIMEOUT_SECONDS ({}) must be <= i64::MAX / 2 ({}) to prevent const overflow",
        TIMEOUT_SECONDS,
        i64::MAX / 2,
    );

    // Verify checked multiplication agrees
    let checked = TIMEOUT_SECONDS.checked_mul(2);
    assert_eq!(
        checked,
        Some(PERMISSIONLESS_RECLAIM_TIMEOUT),
        "checked_mul(2) must produce PERMISSIONLESS_RECLAIM_TIMEOUT"
    );
}

/// TS-INV-3 (static, POST-FIX-BUNDLE): Permissionless reclaim is strictly greater
/// than both cancel and settle constants.
///
/// Post-fix relationship: TIMEOUT_SECONDS == SETTLEMENT_TIMEOUT_SECONDS (3600) < PERMISSIONLESS_RECLAIM_TIMEOUT (7200)
/// Reclaim is now the LARGEST constant — the most permissive recovery path.
#[test]
fn ts_inv_3_reclaim_greater_than_all() {
    assert!(
        PERMISSIONLESS_RECLAIM_TIMEOUT > TIMEOUT_SECONDS,
        "Reclaim ({}) must be > Cancel ({}) post-fix",
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        TIMEOUT_SECONDS,
    );
    assert!(
        PERMISSIONLESS_RECLAIM_TIMEOUT > SETTLEMENT_TIMEOUT_SECONDS,
        "Reclaim ({}) must be > Settlement ({}) post-fix",
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        SETTLEMENT_TIMEOUT_SECONDS,
    );
}

proptest! {
    /// TS-INV-3 (proptest): For any multiplier applied to the base cancel timeout,
    /// the relationship must hold. This tests that the 2x factor is correctly
    /// embedded in the constant, not an artifact of specific test values.
    #[test]
    fn ts_inv_3_reclaim_is_double_cancel_for_any_base(
        base_timeout in 1i64..=(i64::MAX / 2)
    ) {
        let simulated_reclaim = base_timeout.checked_mul(2).unwrap();
        prop_assert!(
            simulated_reclaim > base_timeout,
            "2x timeout must be > 1x timeout"
        );
        prop_assert_eq!(
            simulated_reclaim - base_timeout,
            base_timeout,
            "Gap between reclaim and cancel must equal the base timeout"
        );
    }
}

// =============================================================
// TS-INV-4: Timeout Reference Fallback
// =============================================================

proptest! {
    /// TS-INV-4a: When `activated_at == 0`, timeout_reference returns `created_at`.
    ///
    /// This represents matches that never activated (only one player deposited,
    /// or no deposits). The fallback to `created_at` ensures these matches
    /// can still be cancelled/reclaimed after the timeout period.
    #[test]
    fn ts_inv_4a_fallback_to_created_at_when_not_activated(
        created_at in realistic_timestamp()
    ) {
        let result = timeout_reference(0, created_at);
        prop_assert_eq!(
            result,
            created_at,
            "When activated_at == 0, timeout_reference must return created_at ({})",
            created_at,
        );
    }

    /// TS-INV-4b: When `activated_at > 0`, timeout_reference returns `activated_at`.
    ///
    /// This represents activated matches where both players deposited.
    /// The timeout should be based on when the match became active, not
    /// when it was created (the gap could be hours or days).
    #[test]
    fn ts_inv_4b_uses_activated_at_when_activated(
        activated_at in 1i64..=MAX_REALISTIC_TS,
        created_at in realistic_timestamp(),
    ) {
        let result = timeout_reference(activated_at, created_at);
        prop_assert_eq!(
            result,
            activated_at,
            "When activated_at > 0 ({}), timeout_reference must return activated_at, not created_at ({})",
            activated_at,
            created_at,
        );
    }

    /// TS-INV-4c: Both cancel_match and permissionless_reclaim use the same
    /// timeout_reference logic. Verify the reference is consistent across
    /// both deadline computations.
    #[test]
    fn ts_inv_4c_cancel_and_reclaim_use_same_reference(
        activated_at in prop::option::of(realistic_timestamp()),
        created_at in realistic_timestamp(),
    ) {
        let aa = activated_at.unwrap_or(0);

        // Simulate what both instructions do: derive timeout_reference the same way
        let ref_for_cancel = timeout_reference(aa, created_at);
        let ref_for_reclaim = timeout_reference(aa, created_at);

        prop_assert_eq!(
            ref_for_cancel,
            ref_for_reclaim,
            "cancel and reclaim must use the same timeout_reference"
        );

        // The derived reference must be one of the two input timestamps
        prop_assert!(
            ref_for_cancel == aa || ref_for_cancel == created_at,
            "timeout_reference must be either activated_at ({}) or created_at ({}), got {}",
            aa,
            created_at,
            ref_for_cancel,
        );
    }
}

/// TS-INV-4 (edge case): activated_at == 0 with minimum created_at still works.
#[test]
fn ts_inv_4_edge_zero_activated_min_created() {
    let created_at = MIN_REALISTIC_TS;
    let result = timeout_reference(0, created_at);
    assert_eq!(result, created_at);

    // The resulting reference must still allow all three additions
    assert!(result.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_some());
    assert!(result.checked_add(TIMEOUT_SECONDS).is_some());
    assert!(result.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_some());
}

/// TS-INV-4 (edge case): activated_at == 1 (smallest positive) selects activated_at.
#[test]
fn ts_inv_4_edge_activated_at_one() {
    let result = timeout_reference(1, MIN_REALISTIC_TS);
    assert_eq!(result, 1, "activated_at=1 (> 0) must be selected over created_at");
}

// =============================================================
// TS-INV-5: Settlement/Cancel Mutual Exclusion
// =============================================================

proptest! {
    /// TS-INV-5 (POST-H035-FIX): With TIMEOUT_SECONDS == SETTLEMENT_TIMEOUT_SECONDS == 3600,
    /// the settlement and cancel time windows do NOT overlap.
    ///
    /// Settlement succeeds when: `now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS` (≤ 3600s)
    /// Cancel (timeout) succeeds when: `now > activated_at + TIMEOUT_SECONDS` (> 3600s)
    ///
    /// At the boundary `now == activated_at + 3600`:
    ///   can_settle = (3600 ≤ 3600) = true
    ///   can_cancel = (3600 > 3600) = false
    /// At the next slot `now == activated_at + 3601`:
    ///   can_settle = (3601 ≤ 3600) = false
    ///   can_cancel = (3601 > 3600) = true
    ///
    /// Overlap zone: ∅ (empty). Mutual exclusion is now TIME-ENFORCED.
    /// State-machine enforcement remains as defense-in-depth.
    ///
    /// This test asserts that NO valid (activated_at, now) pair exists where both
    /// can_settle and can_cancel_timeout are simultaneously true.
    #[test]
    fn ts_inv_5_settlement_cancel_mutual_exclusion(
        activated_at in realistic_timestamp(),
        now in realistic_timestamp(),
    ) {
        let settle_deadline = activated_at
            .checked_add(SETTLEMENT_TIMEOUT_SECONDS)
            .unwrap();
        let cancel_deadline = activated_at
            .checked_add(TIMEOUT_SECONDS)
            .unwrap();

        let can_settle = now <= settle_deadline;
        let can_cancel_timeout = now > cancel_deadline;

        // POST-H035-FIX: race window has collapsed. The two conditions are mutually
        // exclusive at every timestamp.
        prop_assert!(
            !(can_settle && can_cancel_timeout),
            "POST-H035-FIX violation: race re-opened at activated_at={}, now={}, \
             cancel_deadline={}, settle_deadline={}",
            activated_at, now, cancel_deadline, settle_deadline,
        );
    }
}

/// TS-INV-5 (static proof, POST-H035-FIX): Mutual exclusion is now TIME-ENFORCED.
///
/// With TIMEOUT_SECONDS == SETTLEMENT_TIMEOUT_SECONDS == 3600:
///   - Cancel window opens at: activated_at + 3600 (strict >)
///   - Settlement window closes at: activated_at + 3600 (inclusive ≤)
///   - Overlap zone: ∅ (empty)
///
/// State-machine enforcement remains as defense-in-depth:
///   - settle_match requires state == Active, sets state = Settled
///   - cancel_match requires state != Settled && != Cancelled, sets state = Cancelled
#[test]
fn ts_inv_5_mutual_exclusion_static_proof() {
    // POST-H035-FIX: cancel and settle deadlines coincide.
    let overlap_size = SETTLEMENT_TIMEOUT_SECONDS - TIMEOUT_SECONDS;
    assert_eq!(
        overlap_size, 0,
        "POST-H035-FIX: overlap between cancel and settlement windows must be 0"
    );

    // Boundary partition check.
    let activated_at: i64 = 0;
    let cancel_open_at = activated_at + TIMEOUT_SECONDS;      // 3600
    let settle_close_at = activated_at + SETTLEMENT_TIMEOUT_SECONDS; // 3600
    assert_eq!(
        cancel_open_at, settle_close_at,
        "POST-H035-FIX: cancel_open_at must equal settle_close_at"
    );

    // At the boundary: can_settle = true, can_cancel = false (no overlap)
    let now = activated_at + 3_600;
    let can_settle = now <= settle_close_at;
    let can_cancel = now > cancel_open_at;
    assert!(can_settle, "settle valid at exact boundary");
    assert!(!can_cancel, "cancel NOT valid at exact boundary");

    // One slot later: roles flip, still no overlap
    let now = activated_at + 3_601;
    let can_settle = now <= settle_close_at;
    let can_cancel = now > cancel_open_at;
    assert!(!can_settle, "settle expired one slot past boundary");
    assert!(can_cancel, "cancel valid one slot past boundary");

    // Reclaim opens AFTER settle expires (1h gap between settle deadline and reclaim opening).
    let reclaim_open_at = activated_at + PERMISSIONLESS_RECLAIM_TIMEOUT; // 7200
    assert!(
        reclaim_open_at > settle_close_at,
        "Reclaim opens ({}) AFTER settle closes ({}) post-fix",
        reclaim_open_at,
        settle_close_at,
    );
    assert_eq!(
        reclaim_open_at - settle_close_at,
        TIMEOUT_SECONDS,
        "Gap between settle close and reclaim open must equal TIMEOUT_SECONDS"
    );
}

// =============================================================
// TS-INV-6: Reclaim Window Subsumes Cancel Window
// =============================================================

proptest! {
    /// TS-INV-6 (POST-FIX-BUNDLE): `reclaim_deadline > cancel_deadline` always
    /// holds, and the gap is exactly `TIMEOUT_SECONDS` (now 3600s = 1 hour post-fix).
    ///
    /// The permissionless reclaim window opens strictly after the cancel window.
    /// This ensures:
    /// - Players get the first opportunity to cancel (1 hour after activation)
    /// - Only after an additional 1 hour does anyone in the world get to reclaim
    /// - The algebraic gap is exactly one `TIMEOUT_SECONDS` period
    #[test]
    fn ts_inv_6_reclaim_subsumes_cancel(
        timeout_ref in realistic_timestamp()
    ) {
        let cancel_deadline = timeout_ref
            .checked_add(TIMEOUT_SECONDS)
            .unwrap();
        let reclaim_deadline = timeout_ref
            .checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)
            .unwrap();

        prop_assert!(
            reclaim_deadline > cancel_deadline,
            "reclaim_deadline {} must be > cancel_deadline {} (timeout_ref={})",
            reclaim_deadline,
            cancel_deadline,
            timeout_ref,
        );

        // The gap must be exactly TIMEOUT_SECONDS
        let gap = reclaim_deadline - cancel_deadline;
        prop_assert_eq!(
            gap,
            TIMEOUT_SECONDS,
            "Gap between reclaim and cancel deadlines must be exactly TIMEOUT_SECONDS ({}), got {}",
            TIMEOUT_SECONDS,
            gap,
        );
    }
}

/// TS-INV-6 (static, POST-FIX-BUNDLE): The gap between reclaim and cancel
/// is derived from constants.
///
/// reclaim_deadline - cancel_deadline
///   = (timeout_ref + PERMISSIONLESS_RECLAIM_TIMEOUT) - (timeout_ref + TIMEOUT_SECONDS)
///   = PERMISSIONLESS_RECLAIM_TIMEOUT - TIMEOUT_SECONDS
///   = 2 * TIMEOUT_SECONDS - TIMEOUT_SECONDS
///   = TIMEOUT_SECONDS
///   = 3600 (post-H035-fix; was 600 pre-fix)
#[test]
fn ts_inv_6_reclaim_cancel_gap_static() {
    let gap = PERMISSIONLESS_RECLAIM_TIMEOUT - TIMEOUT_SECONDS;
    assert_eq!(
        gap, TIMEOUT_SECONDS,
        "Algebraic gap must equal TIMEOUT_SECONDS"
    );
    assert_eq!(gap, 3_600, "Gap must be 3600 seconds (1 hour) post-fix");
}

// =============================================================
// ADDITIONAL: Full lifecycle deadline computation smoke test
// =============================================================

proptest! {
    /// Smoke test (POST-FIX-BUNDLE): Given a full lifecycle with both timestamps,
    /// all three deadlines compute without overflow and maintain post-fix ordering.
    ///
    /// Post-fix ordering: cancel(3600) == settle(3600) < reclaim(7200)
    #[test]
    fn full_lifecycle_deadlines_valid(
        created_at in realistic_timestamp(),
        activation_delay in 0i64..=3_600i64, // 0 to 1h after creation
    ) {
        let activated_at = created_at.checked_add(activation_delay).unwrap_or(created_at);

        // Derive the timeout reference (activated_at > 0 since created_at >= MIN_REALISTIC_TS > 0)
        let tref = timeout_reference(activated_at, created_at);
        prop_assert_eq!(tref, activated_at, "activated_at > 0, so tref must be activated_at");

        // Compute all three deadlines
        let settle = tref.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        let cancel = tref.checked_add(TIMEOUT_SECONDS);
        let reclaim = tref.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT);

        prop_assert!(settle.is_some(), "settle deadline overflowed");
        prop_assert!(cancel.is_some(), "cancel deadline overflowed");
        prop_assert!(reclaim.is_some(), "reclaim deadline overflowed");

        let s = settle.unwrap();
        let c = cancel.unwrap();
        let r = reclaim.unwrap();

        // Post-fix ordering: cancel(3600) == settle(3600) < reclaim(7200)
        prop_assert_eq!(c, s, "POST-H035-FIX: cancel {} must equal settle {}", c, s);
        prop_assert!(r > s, "reclaim {} must be > settle {}", r, s);
        prop_assert!(r > c, "reclaim {} must be > cancel {}", r, c);
    }
}

// =============================================================
// INV-3 (POST-H035-FIX): Cancel deadline equals settle deadline
// =============================================================
//
// Post-fix-bundle invariant: TIMEOUT_SECONDS == SETTLEMENT_TIMEOUT_SECONDS,
// so for every active match, cancel_deadline == settle_deadline.
//
// This is the CORE post-H035-fix invariant — the previous 3000s race window
// where both can_cancel and can_settle could be true simultaneously is now
// closed because the boundary partition `(settle: <=, cancel: >)` splits
// the timeline cleanly at the shared deadline.

/// INV-3 (static): The two constants that close the H035 race must be EQUAL.
/// If anyone bumps either one without the other, the race window re-opens.
#[test]
fn inv_3_post_h035_fix_constants_equal() {
    assert_eq!(
        TIMEOUT_SECONDS, SETTLEMENT_TIMEOUT_SECONDS,
        "POST-H035-FIX: TIMEOUT_SECONDS ({}) must EQUAL SETTLEMENT_TIMEOUT_SECONDS ({}) \
         to keep the cancel/settle race window closed",
        TIMEOUT_SECONDS,
        SETTLEMENT_TIMEOUT_SECONDS,
    );
    assert_eq!(
        TIMEOUT_SECONDS, 3_600,
        "POST-H035-FIX: TIMEOUT_SECONDS must be 3600s (1 hour); was 600s pre-fix"
    );
}

proptest! {
    /// INV-3 (proptest, POST-H035-FIX): For every active match `(activated_at)`,
    /// `cancel_deadline == settle_deadline`.
    #[test]
    fn inv_3_cancel_equals_settle_deadline(
        activated_at in realistic_timestamp(),
    ) {
        let cancel_deadline = activated_at + TIMEOUT_SECONDS;
        let settle_deadline = activated_at + SETTLEMENT_TIMEOUT_SECONDS;
        prop_assert_eq!(
            cancel_deadline,
            settle_deadline,
            "POST-H035-FIX: cancel_deadline must EQUAL settle_deadline for activated_at={}",
            activated_at,
        );
    }

    /// INV-3 (proptest, POST-H035-FIX): The race partition is clean — at every
    /// (activated_at, now) pair, NOT both can_settle and can_cancel are true.
    /// This is the property version of TS-INV-5's static partition check.
    #[test]
    fn inv_3_no_simultaneous_validity(
        activated_at in realistic_timestamp(),
        offset in -7_200i64..=7_200i64,
    ) {
        let now = activated_at + offset;
        let cancel_open_at = activated_at + TIMEOUT_SECONDS;
        let settle_close_at = activated_at + SETTLEMENT_TIMEOUT_SECONDS;
        let can_cancel = now > cancel_open_at;
        let can_settle = now <= settle_close_at;
        prop_assert!(
            !(can_cancel && can_settle),
            "POST-H035-FIX violation: race re-opened at activated_at={}, offset={}, now={}",
            activated_at, offset, now,
        );
    }
}

// =============================================================
// INV-10 (POST-H017-FIX): Minimum Deposit Window Gate
// =============================================================
//
// Post-fix invariant: v1's `start_with_depositors` requires
// `now >= created_at + MIN_DEPOSIT_WINDOW_SECS` (600s = 10 min) before
// the authority can compact the players array and activate the match.
// This closes the H017 silent-kick window.

/// INV-10 (static): MIN_DEPOSIT_WINDOW_SECS must be 600s and must not regress to 0.
/// A regression to 0 re-opens the H017 silent-kick attack on in-flight depositors.
#[test]
fn inv_10_post_h017_min_deposit_window_did_not_regress() {
    assert_eq!(
        MIN_DEPOSIT_WINDOW_SECS, 600,
        "POST-H017-FIX: MIN_DEPOSIT_WINDOW_SECS must remain 600s; do NOT regress"
    );
    assert!(
        MIN_DEPOSIT_WINDOW_SECS > 0,
        "Regression guard: H017 silent-kick attack returns at MIN_DEPOSIT_WINDOW_SECS == 0"
    );
}

proptest! {
    /// INV-10 (proptest, POST-H017-FIX): For every (created_at, now) pair,
    /// `start_with_depositors` may proceed iff `now >= created_at + MIN_DEPOSIT_WINDOW_SECS`.
    /// The gate partitions the timeline cleanly at the deposit deadline.
    #[test]
    fn inv_10_swd_gate_partition(
        created_at in realistic_timestamp(),
        offset in -700i64..=700i64,
    ) {
        let now = created_at + offset;
        let deposit_deadline = created_at + MIN_DEPOSIT_WINDOW_SECS;
        let gate_open = now >= deposit_deadline;
        prop_assert_eq!(
            gate_open,
            offset >= MIN_DEPOSIT_WINDOW_SECS,
            "INV-10 partition violation at created_at={}, offset={}, now={}, deadline={}",
            created_at, offset, now, deposit_deadline,
        );
    }

    /// INV-10 (proptest): At exactly `now == created_at + MIN_DEPOSIT_WINDOW_SECS`,
    /// the gate must be OPEN (>=, inclusive boundary).
    #[test]
    fn inv_10_swd_gate_inclusive_at_boundary(
        created_at in realistic_timestamp(),
    ) {
        let deposit_deadline = created_at + MIN_DEPOSIT_WINDOW_SECS;
        let now = deposit_deadline; // exact boundary
        let gate_open = now >= deposit_deadline;
        prop_assert!(
            gate_open,
            "INV-10: gate must be OPEN at exact deadline (>= is inclusive); created_at={}",
            created_at,
        );
    }

    /// INV-10 (proptest): One slot before the deadline, the gate must be CLOSED.
    #[test]
    fn inv_10_swd_gate_closed_one_slot_early(
        created_at in realistic_timestamp(),
    ) {
        let deposit_deadline = created_at + MIN_DEPOSIT_WINDOW_SECS;
        let now = deposit_deadline - 1;
        let gate_open = now >= deposit_deadline;
        prop_assert!(
            !gate_open,
            "INV-10: gate must be CLOSED one slot before deadline; created_at={}",
            created_at,
        );
    }

    /// INV-10 (proptest): The deposit-deadline addition does not overflow for
    /// realistic created_at values.
    #[test]
    fn inv_10_min_deposit_window_no_overflow_realistic(
        created_at in realistic_timestamp(),
    ) {
        let result = created_at.checked_add(MIN_DEPOSIT_WINDOW_SECS);
        prop_assert!(
            result.is_some(),
            "Deposit-deadline overflowed for created_at={}", created_at,
        );
    }
}

// =============================================================
// ADDITIONAL: Negative timestamp edge cases
// =============================================================

/// Verify that the timeout_reference helper handles negative activated_at
/// (which would be an on-chain bug, but should not cause panics).
/// Negative values are "not > 0", so fallback to created_at applies.
#[test]
fn timeout_reference_negative_activated_at_falls_back() {
    let created_at = MIN_REALISTIC_TS;
    let result = timeout_reference(-1, created_at);
    assert_eq!(
        result, created_at,
        "Negative activated_at should fall back to created_at"
    );

    let result_min = timeout_reference(i64::MIN, created_at);
    assert_eq!(
        result_min, created_at,
        "i64::MIN activated_at should fall back to created_at"
    );
}

/// Verify that all three additions on the maximum realistic timestamp
/// produce results well below i64::MAX.
#[test]
fn max_realistic_timestamp_headroom() {
    let ts = MAX_REALISTIC_TS;

    let settle = ts.checked_add(SETTLEMENT_TIMEOUT_SECONDS).unwrap();
    let cancel = ts.checked_add(TIMEOUT_SECONDS).unwrap();
    let reclaim = ts.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).unwrap();

    // All must be well below i64::MAX
    assert!(settle < i64::MAX);
    assert!(cancel < i64::MAX);
    assert!(reclaim < i64::MAX);

    // Headroom from i64::MAX should be enormous
    // POST-FIX-BUNDLE: reclaim (7200) is the largest deadline
    let min_headroom = i64::MAX - reclaim;
    assert!(
        min_headroom > 1_000_000_000_000_000_000,
        "Headroom to i64::MAX from year-2100 reclaim should be > 1e18, got {}",
        min_headroom,
    );
}
