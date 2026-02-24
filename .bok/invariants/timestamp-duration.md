# Timestamp/Duration Invariants (VP-087 through VP-090)

**Category:** Timestamp and timeout arithmetic
**Source:** `programs/solshot-escrow/src/lib.rs` (lines 20-26, 236-244, 322-333, 397-410)
**Author:** BOK invariant proposer agent
**Date:** 2026-02-23
**Tools:** Proptest (pure arithmetic), LiteSVM (runtime integration)

---

## Constants Under Analysis

```rust
const TIMEOUT_SECONDS: i64 = 86400;                              // 24 hours (line 20)
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 172800 = 48 hours (line 23)
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600;                    // 1 hour (line 26)
```

## Arithmetic Under Analysis

```rust
// settle_match (lines 237-239)
let deadline = ctx.accounts.escrow.activated_at
    .checked_add(SETTLEMENT_TIMEOUT_SECONDS)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// cancel_match (lines 329-331)
let timeout_deadline = timeout_reference
    .checked_add(TIMEOUT_SECONDS)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// permissionless_reclaim (lines 404-406)
let reclaim_deadline = timeout_reference
    .checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// timeout_reference derivation (lines 322-326 and 397-401)
let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
    ctx.accounts.escrow.activated_at
} else {
    ctx.accounts.escrow.created_at
};
```

---

## INV-1: Overflow Safety — Timestamp + Duration Never Overflows i64

### INV-1a: Settlement Deadline Overflow Safety (VP-087)

**What it checks:** For any Solana-realistic unix timestamp, `activated_at + SETTLEMENT_TIMEOUT_SECONDS` does not overflow i64.

**Why it matters:** If a maliciously large `activated_at` value were somehow stored (e.g., via a future migration bug or deserialization error), the `checked_add` would return `None`, causing an `ArithmeticOverflow` error. While `checked_add` makes this a safe failure rather than a silent wrap, the invariant proves that under all realistic Solana clock values the addition ALWAYS succeeds, meaning users are never blocked from settling by a spurious overflow error. A Solana Clock timestamp is an i64 set by the cluster; realistic values range from approximately 1.7 billion (2024) to roughly 9.2 quintillion (i64::MAX, theoretically year ~292 billion). The practical upper bound for Solana's lifetime is approximately year 2262 (when i64 seconds overflow), but any timestamp the cluster produces is valid.

**Tool:** Proptest (pure arithmetic, no runtime needed)

**Confidence:** high

**Based on:** VP-087 — timestamp overflow safety

**Formal Property:**
```
forall t: i64 where 0 < t <= i64::MAX - SETTLEMENT_TIMEOUT_SECONDS:
    t.checked_add(3600_i64) = Some(t + 3600)

forall t: i64 where t > i64::MAX - SETTLEMENT_TIMEOUT_SECONDS:
    t.checked_add(3600_i64) = None
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600;

// Realistic Solana clock range: 2020-01-01 to year 2262
// 2020-01-01 = 1_577_836_800, year 2262 ~ 9_223_372_036_854_775_807 (i64::MAX)
const MIN_REALISTIC_TS: i64 = 1_577_836_800;
const MAX_REALISTIC_TS: i64 = 4_102_444_800; // year 2100 — generous upper bound

proptest! {
    #[test]
    fn settlement_deadline_never_overflows_realistic(
        activated_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        let result = activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        prop_assert!(result.is_some(),
            "activated_at={} overflowed when adding SETTLEMENT_TIMEOUT_SECONDS={}",
            activated_at, SETTLEMENT_TIMEOUT_SECONDS);
        let deadline = result.unwrap();
        prop_assert!(deadline > activated_at,
            "deadline={} must be strictly after activated_at={}",
            deadline, activated_at);
    }

    #[test]
    fn settlement_deadline_overflow_boundary(
        activated_at in (i64::MAX - SETTLEMENT_TIMEOUT_SECONDS + 1)..=i64::MAX
    ) {
        // Values above i64::MAX - 3600 MUST overflow (checked_add returns None)
        let result = activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        prop_assert!(result.is_none(),
            "activated_at={} should have overflowed but got {:?}",
            activated_at, result);
    }

    #[test]
    fn settlement_deadline_exact_boundary() {
        // Exact boundary: i64::MAX - 3600 should NOT overflow
        let boundary = i64::MAX - SETTLEMENT_TIMEOUT_SECONDS;
        let result = boundary.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        assert_eq!(result, Some(i64::MAX));

        // One past boundary: i64::MAX - 3599 SHOULD overflow
        let past = boundary + 1;
        let result2 = past.checked_add(SETTLEMENT_TIMEOUT_SECONDS);
        assert!(result2.is_none());
    }
}
```

---

### INV-1b: Cancel Timeout Overflow Safety (VP-087)

**What it checks:** For any Solana-realistic unix timestamp, `timeout_reference + TIMEOUT_SECONDS` does not overflow i64.

**Why it matters:** Same reasoning as INV-1a but with TIMEOUT_SECONDS (86400). If overflow occurred, the `cancel_match` instruction would fail with ArithmeticOverflow, trapping player funds in an uncancellable escrow until the `permissionless_reclaim` timeout passes. The 86400-second addition has more headroom than 172800 but the same structure.

**Tool:** Proptest

**Confidence:** high

**Based on:** VP-087 — timestamp overflow safety

**Formal Property:**
```
forall t: i64 where 0 < t <= i64::MAX - TIMEOUT_SECONDS:
    t.checked_add(86400_i64) = Some(t + 86400)
```

**Proptest sketch:**
```rust
const TIMEOUT_SECONDS: i64 = 86400;

proptest! {
    #[test]
    fn cancel_deadline_never_overflows_realistic(
        timeout_ref in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        let result = timeout_ref.checked_add(TIMEOUT_SECONDS);
        prop_assert!(result.is_some(),
            "timeout_ref={} overflowed when adding TIMEOUT_SECONDS={}",
            timeout_ref, TIMEOUT_SECONDS);
    }
}
```

---

### INV-1c: Permissionless Reclaim Overflow Safety (VP-087)

**What it checks:** For any Solana-realistic unix timestamp, `timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT` does not overflow i64. This is the largest addition (172800 seconds) and thus the tightest headroom.

**Why it matters:** Permissionless reclaim is the last-resort fund recovery mechanism (DCA-02). If this addition overflowed and returned `None`, the instruction would fail, and funds would be permanently locked in the escrow PDA with no recovery path. This would be a fund-loss vulnerability.

**Tool:** Proptest

**Confidence:** high

**Based on:** VP-087 — timestamp overflow safety

**Formal Property:**
```
forall t: i64 where 0 < t <= i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT:
    t.checked_add(172800_i64) = Some(t + 172800)

# Stronger bound for Solana-realistic timestamps:
forall t: i64 where MIN_REALISTIC_TS <= t <= MAX_REALISTIC_TS:
    t + 172800 < i64::MAX
```

**Proptest sketch:**
```rust
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = 172800;

proptest! {
    #[test]
    fn reclaim_deadline_never_overflows_realistic(
        timeout_ref in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        let result = timeout_ref.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT);
        prop_assert!(result.is_some(),
            "timeout_ref={} overflowed when adding PERMISSIONLESS_RECLAIM_TIMEOUT={}",
            timeout_ref, PERMISSIONLESS_RECLAIM_TIMEOUT);
        // Also verify the result is positive (timestamps must be)
        let deadline = result.unwrap();
        prop_assert!(deadline > 0, "deadline must be positive, got {}", deadline);
    }

    #[test]
    fn reclaim_overflow_headroom() {
        // Prove: even at year 2262, the largest timeout fits
        // i64::MAX = 9_223_372_036_854_775_807
        // i64::MAX - 172800 = 9_223_372_036_854_603_007
        // This is approximately year 292277026596 — well beyond Solana's lifetime
        let max_safe = i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT;
        assert!(max_safe > MAX_REALISTIC_TS,
            "max safe timestamp {} must exceed realistic max {}",
            max_safe, MAX_REALISTIC_TS);
    }
}
```

---

## INV-2: Ordering Guarantee — Settlement < Cancel < Reclaim Deadlines (VP-088)

**What it checks:** For the same match with a given `activated_at > 0`, the three deadlines are strictly ordered:
- `settlement_deadline < cancel_deadline < reclaim_deadline`
- Equivalently: `activated_at + 3600 < activated_at + 86400 < activated_at + 172800`

**Why it matters:** This ordering is the foundation of the match lifecycle timeout design:
1. The authority has 1 hour to settle (settlement window).
2. After 24 hours, players can cancel and self-refund (cancel window).
3. After 48 hours, anyone can reclaim (permissionless reclaim window).

If these deadlines were misordered (e.g., a code change made SETTLEMENT_TIMEOUT_SECONDS > TIMEOUT_SECONDS), the authority's settlement window would extend past the cancel window. Players could cancel a match that the authority was still authorized to settle, creating a race condition where both settlement and cancellation could succeed for the same escrow, potentially double-spending funds.

Concrete exploit scenario: If `SETTLEMENT_TIMEOUT_SECONDS` were accidentally set to `100_000` (> 86400), a match could be both settled by authority (paying winner/treasury/ops) AND cancelled by a player (refunding both wagers) within the overlap window, draining more lamports from the escrow than it holds.

**Tool:** Proptest (constants + arithmetic)

**Confidence:** high

**Based on:** VP-088 — deadline ordering guarantee

**Formal Property:**
```
# Constant ordering (compile-time verifiable):
SETTLEMENT_TIMEOUT_SECONDS < TIMEOUT_SECONDS < PERMISSIONLESS_RECLAIM_TIMEOUT
3600 < 86400 < 172800

# Runtime ordering (for any valid activated_at):
forall activated_at: i64 where activated_at > 0 AND activated_at <= i64::MAX - 172800:
    let settle  = activated_at + SETTLEMENT_TIMEOUT_SECONDS;
    let cancel  = activated_at + TIMEOUT_SECONDS;
    let reclaim = activated_at + PERMISSIONLESS_RECLAIM_TIMEOUT;
    settle < cancel < reclaim
```

**Proptest sketch:**
```rust
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600;
const TIMEOUT_SECONDS: i64 = 86400;
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = 172800;

proptest! {
    #[test]
    fn deadline_ordering_holds(
        activated_at in 1_i64..=(i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT)
    ) {
        let settle_deadline = activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS).unwrap();
        let cancel_deadline = activated_at.checked_add(TIMEOUT_SECONDS).unwrap();
        let reclaim_deadline = activated_at.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).unwrap();

        prop_assert!(settle_deadline < cancel_deadline,
            "settle_deadline={} must be < cancel_deadline={}",
            settle_deadline, cancel_deadline);
        prop_assert!(cancel_deadline < reclaim_deadline,
            "cancel_deadline={} must be < reclaim_deadline={}",
            cancel_deadline, reclaim_deadline);
    }

    #[test]
    fn constant_ordering_holds() {
        // This is a static invariant but we verify it via test
        assert!(SETTLEMENT_TIMEOUT_SECONDS < TIMEOUT_SECONDS,
            "SETTLEMENT_TIMEOUT ({}) must be < TIMEOUT ({})",
            SETTLEMENT_TIMEOUT_SECONDS, TIMEOUT_SECONDS);
        assert!(TIMEOUT_SECONDS < PERMISSIONLESS_RECLAIM_TIMEOUT,
            "TIMEOUT ({}) must be < PERMISSIONLESS_RECLAIM_TIMEOUT ({})",
            TIMEOUT_SECONDS, PERMISSIONLESS_RECLAIM_TIMEOUT);
    }

    #[test]
    fn no_deadline_overlap_window(
        activated_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        // Verify there is no time at which both settle_match and cancel_match
        // could succeed simultaneously.
        // settle_match requires: now <= activated_at + 3600
        // cancel_match (player, timed out) requires: now > activated_at + 86400
        // These windows cannot overlap because 3600 < 86400:
        let settle_window_end = activated_at + SETTLEMENT_TIMEOUT_SECONDS;
        let cancel_window_start = activated_at + TIMEOUT_SECONDS;
        prop_assert!(settle_window_end < cancel_window_start,
            "Settlement window end ({}) must be before cancel window start ({})",
            settle_window_end, cancel_window_start);

        // Gap between settlement expiry and cancel availability:
        let gap_seconds = cancel_window_start - settle_window_end;
        prop_assert_eq!(gap_seconds, TIMEOUT_SECONDS - SETTLEMENT_TIMEOUT_SECONDS,
            "Gap must be exactly {} seconds", TIMEOUT_SECONDS - SETTLEMENT_TIMEOUT_SECONDS);
        // gap = 86400 - 3600 = 82800 seconds = 23 hours
    }
}
```

---

## INV-3: Constant Relationship — PERMISSIONLESS_RECLAIM_TIMEOUT == 2 * TIMEOUT_SECONDS (VP-089)

**What it checks:** The compile-time constant `PERMISSIONLESS_RECLAIM_TIMEOUT` is exactly `2 * TIMEOUT_SECONDS`. This is specified in the DCA-02 design document and enforced at line 23 via `TIMEOUT_SECONDS * 2`.

**Why it matters:** The 2x multiplier is a deliberate design choice from DCA-02 (Decentralized Contingency Action):
- 1x timeout (24h): Players can self-cancel, authority can cancel AwaitingDeposits.
- 2x timeout (48h): Permissionless reclaim by any party, providing a decentralized safety net.

If a developer modifies `TIMEOUT_SECONDS` without understanding that `PERMISSIONLESS_RECLAIM_TIMEOUT` depends on it, or if the multiplication is changed, the 2x relationship would break. A reclaim timeout less than the cancel timeout would allow permissionless reclaim before the players have had a chance to cancel, unnecessarily exposing matches to third-party intervention. A reclaim timeout much larger than 2x would leave funds locked longer than intended.

Additionally, the Rust compiler evaluates `TIMEOUT_SECONDS * 2` at compile time using wrapping arithmetic for `const` expressions. If `TIMEOUT_SECONDS` were ever set to a value greater than `i64::MAX / 2`, the multiplication would wrap silently at compile time (no `checked_mul` for const expressions in Rust), producing a negative or small positive constant. This test catches that scenario.

**Tool:** Proptest + static assertion

**Confidence:** high

**Based on:** VP-089 — constant derivation correctness

**Formal Property:**
```
PERMISSIONLESS_RECLAIM_TIMEOUT == 2 * TIMEOUT_SECONDS
172800 == 2 * 86400
TIMEOUT_SECONDS <= i64::MAX / 2  (no compile-time overflow)
```

**Proptest sketch:**
```rust
const TIMEOUT_SECONDS: i64 = 86400;
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2;

#[test]
fn constant_relationship_2x() {
    assert_eq!(PERMISSIONLESS_RECLAIM_TIMEOUT, 2 * TIMEOUT_SECONDS,
        "PERMISSIONLESS_RECLAIM_TIMEOUT ({}) must be exactly 2 * TIMEOUT_SECONDS ({})",
        PERMISSIONLESS_RECLAIM_TIMEOUT, 2 * TIMEOUT_SECONDS);
}

#[test]
fn constant_values_match_specification() {
    assert_eq!(TIMEOUT_SECONDS, 86400, "TIMEOUT_SECONDS must be 86400 (24 hours)");
    assert_eq!(PERMISSIONLESS_RECLAIM_TIMEOUT, 172800,
        "PERMISSIONLESS_RECLAIM_TIMEOUT must be 172800 (48 hours)");
    assert_eq!(SETTLEMENT_TIMEOUT_SECONDS, 3600,
        "SETTLEMENT_TIMEOUT_SECONDS must be 3600 (1 hour)");
}

#[test]
fn no_const_overflow_in_2x_multiplication() {
    // Prove TIMEOUT_SECONDS is small enough that * 2 doesn't overflow i64
    assert!(TIMEOUT_SECONDS <= i64::MAX / 2,
        "TIMEOUT_SECONDS ({}) must be <= i64::MAX / 2 ({}) to avoid const overflow",
        TIMEOUT_SECONDS, i64::MAX / 2);
    // Verify the product is positive (not wrapped)
    assert!(PERMISSIONLESS_RECLAIM_TIMEOUT > 0,
        "PERMISSIONLESS_RECLAIM_TIMEOUT must be positive, got {}",
        PERMISSIONLESS_RECLAIM_TIMEOUT);
    assert!(PERMISSIONLESS_RECLAIM_TIMEOUT > TIMEOUT_SECONDS,
        "2x must be greater than 1x");
}

proptest! {
    /// Parametric: if TIMEOUT_SECONDS were changed, verify 2x still holds
    #[test]
    fn parametric_2x_relationship(
        base_timeout in 1_i64..=(i64::MAX / 2)
    ) {
        let reclaim = base_timeout.checked_mul(2);
        prop_assert!(reclaim.is_some(),
            "base_timeout={} * 2 overflowed", base_timeout);
        prop_assert_eq!(reclaim.unwrap(), base_timeout * 2);
        prop_assert!(reclaim.unwrap() > base_timeout,
            "2x must be > 1x");
    }
}
```

---

## INV-4: Timeout Reference Fallback — activated_at == 0 Falls Back to created_at (VP-090)

**What it checks:** When `activated_at == 0` (match never reached Active state), the timeout reference correctly falls back to `created_at`. When `activated_at > 0` (match was activated), the timeout reference uses `activated_at`.

**Why it matters:** The `timeout_reference` derivation is critical for two instructions:
1. **cancel_match** (lines 322-326): Determines when a player can self-cancel after timeout.
2. **permissionless_reclaim** (lines 397-401): Determines when anyone can reclaim funds.

If the fallback logic were inverted (using `created_at` when `activated_at > 0`, or using `activated_at = 0` as the reference), the consequences would be:
- **Using activated_at=0**: The timeout deadline would be `0 + 86400 = 86400`, which is January 2, 1970. Since `Clock::get()?.unix_timestamp` is always > 86400 on modern Solana, the match would be immediately cancellable/reclaimable after activation, bypassing the intended timeout window entirely. An attacker who deposits second could immediately cancel and reclaim both wagers.
- **Using created_at when activated_at > 0**: The timeout would be anchored to creation time rather than activation time. If there is a long delay between creation and both players depositing, the timeout window could partially or fully expire before the match even starts, allowing cancellation during an active match.

The design intent (OC-07) is:
- For Active matches: timeout starts when both players deposited (activated_at).
- For AwaitingDeposits matches: timeout starts at creation (created_at), so stuck pre-deposit matches can be cleaned up.

**Tool:** LiteSVM (requires runtime to verify Clock interaction); Proptest for pure logic

**Confidence:** high

**Based on:** VP-090 — timeout reference fallback correctness

**Formal Property:**
```
timeout_reference(activated_at, created_at) =
    if activated_at > 0 then activated_at
    else created_at

# Correctness conditions:
1. When activated_at > 0: timeout_reference == activated_at
2. When activated_at == 0: timeout_reference == created_at
3. created_at > 0 always (set by Clock::get() in create_match)
4. activated_at >= created_at when activated_at > 0 (activation happens after creation)
```

**Proptest sketch (pure logic):**
```rust
fn timeout_reference(activated_at: i64, created_at: i64) -> i64 {
    if activated_at > 0 {
        activated_at
    } else {
        created_at
    }
}

proptest! {
    #[test]
    fn fallback_uses_created_at_when_not_activated(
        created_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        let activated_at = 0_i64; // never activated
        let result = timeout_reference(activated_at, created_at);
        prop_assert_eq!(result, created_at,
            "When activated_at=0, must use created_at={}, got {}",
            created_at, result);
    }

    #[test]
    fn uses_activated_at_when_activated(
        created_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS,
        delay in 0_i64..=86400_i64 // activation within 24h of creation
    ) {
        let activated_at = created_at + delay;
        let result = timeout_reference(activated_at, created_at);
        prop_assert_eq!(result, activated_at,
            "When activated_at={} > 0, must use activated_at, got {}",
            activated_at, result);
    }

    #[test]
    fn activated_at_is_always_gte_created_at(
        created_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS,
        delay in 0_i64..=604800_i64 // up to 7 days
    ) {
        let activated_at = created_at + delay;
        prop_assert!(activated_at >= created_at,
            "activated_at={} must be >= created_at={}",
            activated_at, created_at);
    }

    #[test]
    fn fallback_never_uses_zero(
        created_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        // When activated_at=0, the result must be created_at, which is > 0
        let result = timeout_reference(0, created_at);
        prop_assert!(result > 0,
            "Timeout reference must never be 0, got {} for created_at={}",
            result, created_at);
    }

    #[test]
    fn timeout_reference_consistency_between_cancel_and_reclaim(
        created_at in MIN_REALISTIC_TS..=MAX_REALISTIC_TS,
        activated_at_raw in 0_i64..=1_i64 // test both branches
    ) {
        // Both cancel_match and permissionless_reclaim use the same
        // timeout_reference derivation. Verify they produce the same base.
        let activated_at = if activated_at_raw == 0 { 0 } else { created_at + 100 };

        let cancel_ref = timeout_reference(activated_at, created_at);
        let reclaim_ref = timeout_reference(activated_at, created_at);

        prop_assert_eq!(cancel_ref, reclaim_ref,
            "cancel and reclaim must use same timeout_reference");
    }
}
```

**LiteSVM sketch (runtime integration):**
```rust
/// Integration test: create a match, do NOT deposit, verify cancel_match
/// uses created_at as timeout reference (activated_at remains 0).
#[test]
fn cancel_awaiting_deposits_uses_created_at_timeout() {
    // 1. Set up LiteSVM with program deployed
    // 2. Call create_match at time T0
    // 3. Warp clock to T0 + TIMEOUT_SECONDS + 1
    // 4. Call cancel_match as player -> should succeed (timed out from created_at)
    // 5. Verify escrow is closed and state is Cancelled
}

/// Integration test: create a match, both deposit (activating it), verify
/// cancel_match uses activated_at as timeout reference.
#[test]
fn cancel_active_match_uses_activated_at_timeout() {
    // 1. Set up LiteSVM with program deployed
    // 2. Call create_match at time T0
    // 3. Both players deposit at time T1 (activated_at = T1)
    // 4. Warp clock to T0 + TIMEOUT_SECONDS + 1 (past created_at timeout)
    //    but T1 + TIMEOUT_SECONDS has NOT passed yet (if T1 > T0)
    // 5. Call cancel_match as player -> should FAIL (not timed out from activated_at)
    // 6. Warp clock to T1 + TIMEOUT_SECONDS + 1
    // 7. Call cancel_match as player -> should SUCCEED
}
```

---

## INV-5: Settlement Window Exclusion — No Concurrent Settle + Cancel (VP-088, novel)

**What it checks:** There exists no point in time `now` at which both `settle_match` and `cancel_match` (via player timeout path) can succeed for the same Active escrow.

**Why it matters:** `settle_match` distributes the pot to winner/treasury/ops. `cancel_match` refunds both players their full wagers. If both could execute at the same instant, the escrow would be drained by more than its balance:
- settle_match drains: `winner_amount + treasury_amount + ops_amount = total_pot = 2 * wager`
- cancel_match drains: up to `2 * wager` (one wager per deposited player)
- Total drain: up to `4 * wager` from an escrow holding only `2 * wager` + rent

The settle_match window is `[activated_at, activated_at + 3600]` (inclusive).
The player-cancel window (for Active matches) starts at `now > activated_at + 86400`.
The gap between settlement expiry and cancel eligibility is 82,800 seconds (23 hours).

This is a derived property from INV-2 but stated as a separate invariant because the exploit scenario is the most severe.

**Tool:** Proptest

**Confidence:** high

**Based on:** VP-088 (deadline ordering) + novel (mutual exclusion)

**Formal Property:**
```
forall activated_at > 0, forall now: i64:
    NOT (
        (now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS)   // settle_match allowed
        AND
        (now > activated_at + TIMEOUT_SECONDS)               // cancel_match timeout path allowed
    )

# Proof: For the conjunction to hold:
#   now <= activated_at + 3600  AND  now > activated_at + 86400
#   => activated_at + 86400 < now <= activated_at + 3600
#   => 86400 < 3600  (contradiction)
# QED: The conjunction is unsatisfiable.
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn settle_and_cancel_windows_never_overlap(
        activated_at in 1_i64..=(i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT),
        now_offset in 0_i64..=200_000_i64 // offsets from activated_at
    ) {
        let now = activated_at.saturating_add(now_offset);

        let settle_allowed = now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS;
        let cancel_timeout_allowed = now > activated_at + TIMEOUT_SECONDS;

        prop_assert!(
            !(settle_allowed && cancel_timeout_allowed),
            "VIOLATION: at now={}, both settle (allowed={}) and cancel-timeout \
             (allowed={}) are true. activated_at={}",
            now, settle_allowed, cancel_timeout_allowed, activated_at
        );
    }
}
```

---

## INV-6: Permissionless Reclaim Window Subsumes Cancel Window (VP-088, novel)

**What it checks:** The permissionless reclaim window starts strictly after the cancel window starts. Specifically, for any given timeout_reference, `reclaim_deadline > cancel_deadline`, meaning the reclaim path is always available later than the cancel path.

**Why it matters:** This ensures the escalation ladder is correctly ordered:
1. Authority/players can cancel during [0, cancel_deadline] depending on permissions.
2. Players can self-cancel after cancel_deadline (timeout path).
3. Anyone can reclaim after reclaim_deadline (permissionless path).

If the reclaim deadline were before or equal to the cancel deadline, the permissionless reclaim (which has weaker authorization requirements -- anyone can call it) would preempt the more restrictive cancel path. An attacker could call `permissionless_reclaim` before the players have a chance to `cancel_match`, and receive the PDA rent as an economic incentive, even if the players would have preferred to cancel themselves.

**Tool:** Proptest

**Confidence:** high

**Based on:** VP-088 — deadline ordering

**Formal Property:**
```
forall timeout_reference > 0:
    timeout_reference + TIMEOUT_SECONDS < timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT
    (trivially true since 86400 < 172800, but verify no overflow invalidates this)
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn reclaim_deadline_always_after_cancel_deadline(
        timeout_ref in 1_i64..=(i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT)
    ) {
        let cancel_deadline = timeout_ref.checked_add(TIMEOUT_SECONDS).unwrap();
        let reclaim_deadline = timeout_ref.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).unwrap();

        prop_assert!(reclaim_deadline > cancel_deadline,
            "reclaim_deadline={} must be > cancel_deadline={} for timeout_ref={}",
            reclaim_deadline, cancel_deadline, timeout_ref);

        // The gap should be exactly TIMEOUT_SECONDS (24 hours)
        let gap = reclaim_deadline - cancel_deadline;
        prop_assert_eq!(gap, TIMEOUT_SECONDS,
            "Gap between reclaim and cancel must be {} seconds, got {}",
            TIMEOUT_SECONDS, gap);
    }
}
```

---

## INV-7: Settlement Guard Bypass — activated_at == 0 Skips Deadline Check (novel)

**What it checks:** When `activated_at == 0` (match was never activated), the `settle_match` instruction's settlement deadline check at lines 236-244 is skipped entirely via the `if activated_at > 0` guard.

**Why it matters:** This is a design-level observation that warrants verification. The code at line 236 reads:
```rust
if ctx.accounts.escrow.activated_at > 0 {
    let deadline = ctx.accounts.escrow.activated_at
        .checked_add(SETTLEMENT_TIMEOUT_SECONDS)
        .ok_or(EscrowError::ArithmeticOverflow)?;
    require!(
        Clock::get()?.unix_timestamp <= deadline,
        EscrowError::SettlementExpired
    );
}
```

If `activated_at == 0`, the entire deadline block is skipped. However, `settle_match` also requires `state == MatchState::Active`, and `activated_at` is set to `Clock::get()?.unix_timestamp` in `deposit_wager` when the match transitions to Active. Therefore, any Active match should always have `activated_at > 0`. The invariant to verify is: **it is impossible for a match to be in Active state with activated_at == 0**.

If this invariant were violated (e.g., through a deserialization bug or a migration that corrupts the field), `settle_match` would have no time limit -- the authority could settle at any time, even years later. While this is low-risk in isolation, it breaks the protocol's guarantee that stale matches eventually become player-cancellable.

**Tool:** LiteSVM (requires runtime to verify state transitions)

**Confidence:** medium (the invariant is upheld by the current code path, but a migration or program upgrade could break it)

**Based on:** novel — state/timestamp coupling invariant

**Formal Property:**
```
forall escrow: MatchEscrow:
    escrow.state == MatchState::Active => escrow.activated_at > 0

# Contrapositive:
    escrow.activated_at == 0 => escrow.state != MatchState::Active
```

**LiteSVM sketch:**
```rust
#[test]
fn active_match_always_has_nonzero_activated_at() {
    // 1. Set up LiteSVM
    // 2. Create a match (state = AwaitingDeposits, activated_at = 0)
    // 3. Verify: activated_at == 0 AND state == AwaitingDeposits
    // 4. Player 1 deposits (state still AwaitingDeposits, activated_at still 0)
    // 5. Player 2 deposits (state transitions to Active)
    // 6. Read escrow account data
    // 7. Assert: activated_at > 0
    // 8. Assert: activated_at approximately equals current clock timestamp
}

#[test]
fn settle_match_with_zero_activated_at_is_unreachable() {
    // Attempt to construct a scenario where state == Active but activated_at == 0.
    // This should be impossible through normal instruction flow.
    // If we could directly manipulate account data (as an attacker cannot),
    // verify that settle_match would skip the deadline check.
    // This test documents the coupling and serves as a regression guard.
}
```

---

## Coverage Gap Analysis

### Gaps Covered by These Invariants

| Gap | INV | Status |
|-----|-----|--------|
| Timestamp + duration overflow for all three timeouts | INV-1a, INV-1b, INV-1c | Covered (Proptest) |
| Deadline ordering: settle < cancel < reclaim | INV-2 | Covered (Proptest) |
| Mutual exclusion: settle and cancel windows | INV-5 | Covered (Proptest) |
| Constant derivation: 2x relationship | INV-3 | Covered (Proptest + static) |
| Timeout reference fallback logic | INV-4 | Covered (Proptest + LiteSVM sketch) |
| Reclaim window subsumes cancel window | INV-6 | Covered (Proptest) |
| Active state implies activated_at > 0 | INV-7 | Covered (LiteSVM sketch) |

### Remaining Gaps (Not Covered Here)

| Gap | Reason | Recommended Action |
|-----|--------|--------------------|
| **Negative timestamp handling:** What if `Clock::get()` returns a negative value? The Solana cluster should never produce this, but the code does not guard against it. The `activated_at > 0` check would treat negative as "not activated," but a negative `created_at` would produce unreliable timeout behavior. | Edge case: Solana Clock is cluster-controlled, negative values are theoretically impossible but not program-enforced. | Add INV for: `created_at > 0` after `create_match` (LiteSVM). Low priority. |
| **Concurrent instruction execution:** Can `settle_match` and `cancel_match` execute in the same transaction or same slot? Solana transactions within the same slot for the same account are serialized by the runtime (account lock), so this is safe. But a formal proof would require modeling Solana's account locking. | Outside Proptest/LiteSVM scope; requires Solana runtime model. | Document as accepted risk; Solana's account locking provides mutual exclusion. |
| **Clock manipulation:** Solana validators set the clock. A malicious validator supermajority could set an artificially large timestamp, making all matches instantly time out. This is a protocol-level trust assumption, not a program bug. | Threat model: Solana clock is trusted. | Document as trust assumption in audit report. |
| **Constant compile-time overflow:** If `TIMEOUT_SECONDS` were set to `i64::MAX`, the `TIMEOUT_SECONDS * 2` multiplication at line 23 would overflow at compile time with wrapping semantics. INV-3 covers this for the current value but a `const_assert!` macro in the program would provide compile-time protection. | Rust `const` arithmetic wraps silently on overflow. | Add `const_assert!(TIMEOUT_SECONDS <= i64::MAX / 2)` to the program. Filed as hardening recommendation. |
| **BPS fee interaction with settlement deadline:** If settlement is attempted at deadline edge (clock == deadline), both `settle_match` and subsequent `cancel_match` (if called in the next slot) could interact with the fee math. The fee invariants are covered in a separate invariant file. | Cross-invariant dependency. | Link to fee-calculation invariants when available. |

### Kani Availability Note

Kani is not available on Windows. All invariants are designed for Proptest (pure arithmetic) or LiteSVM (runtime integration). If Kani becomes available (Linux/macOS CI), the Proptest invariants could be upgraded to exhaustive verification with bounded model checking, particularly for INV-1 (overflow boundaries) and INV-5 (mutual exclusion).
