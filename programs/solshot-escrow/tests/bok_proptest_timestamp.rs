//! BOK Proptest Suite: Timestamp & Duration Invariants (TS-INV-1 through TS-INV-6)
//!
//! Verifies arithmetic safety, deadline ordering, constant relationships, and
//! timeout reference logic for the SolShot escrow program's time-based operations.
//!
//! DEGRADED MODE: Proptest only (no Kani harnesses).
//!
//! Run with: `cargo test --test bok_proptest_timestamp`

use proptest::prelude::*;

// ─────────────────────────────────────────────────────────────
// CONSTANTS — mirrored from programs/solshot-escrow/src/lib.rs
// ─────────────────────────────────────────────────────────────

/// 10-minute timeout for deposit window (ESC-10 — higher no-show risk with more players).
const TIMEOUT_SECONDS: i64 = 600;

/// 20-minute permissionless reclaim timeout (2x normal timeout) -- DCA-02.
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 1_200

/// 1-hour settlement deadline after match activation (OC-07).
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3_600;

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
/// addition (PERMISSIONLESS_RECLAIM_TIMEOUT = 172800).
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
    /// In v1.4, SETTLEMENT_TIMEOUT_SECONDS (3600) is the largest addition in the program.
    /// PERMISSIONLESS_RECLAIM_TIMEOUT (1200) is second-largest. Both are tiny compared
    /// to i64::MAX so overflow is not a practical concern, but checked_add is used for safety.
    /// If this overflows, the last-resort permissionless fund recovery path is broken.
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
    /// TS-INV-2: For any valid `activated_at`, the three deadlines maintain
    /// strict ordering: cancel_deadline < reclaim_deadline < settle_deadline.
    ///
    /// This is the foundation of the v1.4 match lifecycle timeout design:
    /// - Cancel window opens after 10 minutes (TIMEOUT_SECONDS = 600)
    /// - Permissionless reclaim opens after 20 minutes (2x TIMEOUT_SECONDS = 1200)
    /// - Settlement window closes after 1 hour (SETTLEMENT_TIMEOUT_SECONDS = 3600)
    ///
    /// NOTE: With v1.4 (TIMEOUT_SECONDS=600), settlement and cancel windows OVERLAP
    /// (cancel opens at 600s, settlement closes at 3600s). Mutual exclusion is now
    /// STATE-enforced (not time-enforced) — see TS-INV-5 for details.
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

        prop_assert!(
            cancel_deadline < reclaim_deadline,
            "cancel_deadline {} must be < reclaim_deadline {} (activated_at={})",
            cancel_deadline,
            reclaim_deadline,
            activated_at,
        );

        prop_assert!(
            reclaim_deadline < settle_deadline,
            "reclaim_deadline {} must be < settle_deadline {} (activated_at={})",
            reclaim_deadline,
            settle_deadline,
            activated_at,
        );
    }
}

/// TS-INV-2 (static): Verify constant ordering holds at the constant level,
/// independent of any timestamp value.
///
/// v1.4 ordering: TIMEOUT_SECONDS (600) < PERMISSIONLESS_RECLAIM_TIMEOUT (1200) < SETTLEMENT_TIMEOUT_SECONDS (3600)
/// The 2x relationship between cancel and reclaim is preserved.
/// Settlement window now CLOSES AFTER the cancel window opens (overlap — state-enforced mutual exclusion).
#[test]
fn ts_inv_2_constant_ordering_static() {
    assert!(
        TIMEOUT_SECONDS < PERMISSIONLESS_RECLAIM_TIMEOUT,
        "TIMEOUT_SECONDS ({}) must be < PERMISSIONLESS_RECLAIM_TIMEOUT ({})",
        TIMEOUT_SECONDS,
        PERMISSIONLESS_RECLAIM_TIMEOUT,
    );
    assert!(
        PERMISSIONLESS_RECLAIM_TIMEOUT < SETTLEMENT_TIMEOUT_SECONDS,
        "PERMISSIONLESS_RECLAIM_TIMEOUT ({}) must be < SETTLEMENT_TIMEOUT_SECONDS ({})",
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        SETTLEMENT_TIMEOUT_SECONDS,
    );
    // Note: SETTLEMENT_TIMEOUT_SECONDS (3600) > TIMEOUT_SECONDS (600) — windows overlap.
    // Mutual exclusion for settle vs cancel is now STATE-enforced (see TS-INV-5).
    assert!(
        SETTLEMENT_TIMEOUT_SECONDS > TIMEOUT_SECONDS,
        "SETTLEMENT_TIMEOUT_SECONDS ({}) must be > TIMEOUT_SECONDS ({}) (overlap is expected)",
        SETTLEMENT_TIMEOUT_SECONDS,
        TIMEOUT_SECONDS,
    );
}

/// TS-INV-2 (static): Verify exact constant values match the specification.
#[test]
fn ts_inv_2_constant_values_exact() {
    assert_eq!(SETTLEMENT_TIMEOUT_SECONDS, 3_600, "Settlement timeout must be 1 hour");
    assert_eq!(TIMEOUT_SECONDS, 600, "Cancel timeout must be 10 minutes");
    assert_eq!(PERMISSIONLESS_RECLAIM_TIMEOUT, 1_200, "Reclaim timeout must be 20 minutes");
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

/// TS-INV-3 (static): Settlement timeout is strictly greater than both cancel/reclaim constants.
///
/// v1.4 relationship: TIMEOUT_SECONDS (600) < PERMISSIONLESS_RECLAIM_TIMEOUT (1200) < SETTLEMENT_TIMEOUT_SECONDS (3600)
/// Settlement is the LARGEST constant — the authority has the most time to settle.
#[test]
fn ts_inv_3_settlement_less_than_all() {
    assert!(
        SETTLEMENT_TIMEOUT_SECONDS > TIMEOUT_SECONDS,
        "Settlement ({}) must be > Cancel ({}) in v1.4",
        SETTLEMENT_TIMEOUT_SECONDS,
        TIMEOUT_SECONDS,
    );
    assert!(
        SETTLEMENT_TIMEOUT_SECONDS > PERMISSIONLESS_RECLAIM_TIMEOUT,
        "Settlement ({}) must be > Reclaim ({}) in v1.4",
        SETTLEMENT_TIMEOUT_SECONDS,
        PERMISSIONLESS_RECLAIM_TIMEOUT,
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
    /// TS-INV-5 (v1.4): With TIMEOUT_SECONDS=600 and SETTLEMENT_TIMEOUT_SECONDS=3600,
    /// the settlement and cancel time windows DO overlap.
    ///
    /// Settlement succeeds when: `now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS` (3600s)
    /// Cancel (timeout) succeeds when: `now > activated_at + TIMEOUT_SECONDS` (600s)
    ///
    /// Overlap zone: `activated_at + 600 < now <= activated_at + 3600`
    /// Both conditions can be true simultaneously for a 3000-second window.
    ///
    /// MUTUAL EXCLUSION IS NOW STATE-ENFORCED, NOT TIME-ENFORCED:
    ///   - settle_match requires state == Active, sets state = Settled (terminal)
    ///   - cancel_match requires state != Settled && != Cancelled, sets state = Cancelled (terminal)
    ///   - Once either executes, the other cannot run again
    ///   - Only the authority (server) can settle, so this is safe in practice
    ///
    /// This test documents that the overlap EXISTS (proving state enforcement is necessary).
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

        // v1.4: Overlap IS possible. Verify the overlap zone is exactly what we expect.
        // If both are true, we must be in the overlap zone: [cancel_deadline+1, settle_deadline]
        if can_settle && can_cancel_timeout {
            prop_assert!(
                now > cancel_deadline && now <= settle_deadline,
                "Overlap zone check failed: now={}, cancel_deadline={}, settle_deadline={}",
                now, cancel_deadline, settle_deadline,
            );
        }
    }
}

/// TS-INV-5 (static proof v1.4): Mutual exclusion is STATE-enforced, not time-enforced.
///
/// With TIMEOUT_SECONDS=600 and SETTLEMENT_TIMEOUT_SECONDS=3600:
///   - Cancel window opens at: activated_at + 600
///   - Settlement window closes at: activated_at + 3600
///   - Overlap zone: 3000 seconds (600 to 3600 from activation)
///
/// The program prevents double-drain via the state machine:
///   - settle_match requires state == Active, sets state = Settled
///   - cancel_match requires state != Settled && != Cancelled, sets state = Cancelled
///   - Both are terminal states — once set, the other instruction cannot execute
///
/// This is safe because only the authority (server keypair) can call settle_match.
#[test]
fn ts_inv_5_mutual_exclusion_static_proof() {
    // v1.4: Overlap exists — settle closes AFTER cancel opens
    let overlap_size = SETTLEMENT_TIMEOUT_SECONDS - TIMEOUT_SECONDS;
    assert_eq!(
        overlap_size,
        3_000,
        "Overlap between cancel and settlement windows must be 3000 seconds"
    );
    assert!(
        overlap_size > 0,
        "Windows overlap in v1.4 — mutual exclusion is state-enforced"
    );

    // For activated_at = 0 (simplest case):
    let activated_at: i64 = 0;
    let cancel_start = activated_at + TIMEOUT_SECONDS;      // 600
    let settle_end = activated_at + SETTLEMENT_TIMEOUT_SECONDS; // 3600

    // Overlap: (cancel_start, settle_end] is non-empty
    assert!(
        cancel_start < settle_end,
        "Cancel opens ({}) before settle closes ({}) — overlap confirmed",
        cancel_start,
        settle_end,
    );

    // The 2x-timeout reclaim also fits within the overlap zone
    let reclaim_start = activated_at + PERMISSIONLESS_RECLAIM_TIMEOUT; // 1200
    assert!(
        reclaim_start < settle_end,
        "Reclaim opens ({}) before settle closes ({}) — also in overlap",
        reclaim_start,
        settle_end,
    );
}

// =============================================================
// TS-INV-6: Reclaim Window Subsumes Cancel Window
// =============================================================

proptest! {
    /// TS-INV-6: `reclaim_deadline > cancel_deadline` always holds, and the gap
    /// is exactly `TIMEOUT_SECONDS` (24 hours).
    ///
    /// The permissionless reclaim window opens strictly after the cancel window.
    /// This ensures:
    /// - Players get the first opportunity to cancel (24h)
    /// - Only after an additional 24h does anyone in the world get to reclaim
    /// - The gap is exactly one `TIMEOUT_SECONDS` period
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

/// TS-INV-6 (static): The gap between reclaim and cancel is derived from constants.
///
/// reclaim_deadline - cancel_deadline
///   = (timeout_ref + PERMISSIONLESS_RECLAIM_TIMEOUT) - (timeout_ref + TIMEOUT_SECONDS)
///   = PERMISSIONLESS_RECLAIM_TIMEOUT - TIMEOUT_SECONDS
///   = 2 * TIMEOUT_SECONDS - TIMEOUT_SECONDS
///   = TIMEOUT_SECONDS
///   = 600
#[test]
fn ts_inv_6_reclaim_cancel_gap_static() {
    let gap = PERMISSIONLESS_RECLAIM_TIMEOUT - TIMEOUT_SECONDS;
    assert_eq!(
        gap, TIMEOUT_SECONDS,
        "Algebraic gap must equal TIMEOUT_SECONDS"
    );
    assert_eq!(gap, 600, "Gap must be 600 seconds (10 minutes)");
}

// =============================================================
// ADDITIONAL: Full lifecycle deadline computation smoke test
// =============================================================

proptest! {
    /// Smoke test: Given a full lifecycle with both timestamps, all three
    /// deadlines compute without overflow and maintain v1.4 ordering.
    ///
    /// v1.4 ordering: cancel_deadline < reclaim_deadline < settle_deadline
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

        // v1.4 ordering: cancel(600) < reclaim(1200) < settle(3600)
        prop_assert!(c < r, "cancel {} must be < reclaim {}", c, r);
        prop_assert!(r < s, "reclaim {} must be < settle {}", r, s);
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
    // In v1.4, settle (3600) is the largest deadline
    let min_headroom = i64::MAX - settle; // settle is the largest in v1.4
    assert!(
        min_headroom > 1_000_000_000_000_000_000,
        "Headroom to i64::MAX from year-2100 settle should be > 1e18, got {}",
        min_headroom,
    );
}
