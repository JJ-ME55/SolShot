---
task_id: bok-analyze-timestamp-duration
provides: [invariant-proposals]
subsystem: timestamp-duration
confidence: high
invariant_count: 12
---

# Invariant Proposals — Timestamp / Duration Arithmetic

## Source

Cluster of 8 math regions across both escrow versions:

- **v2 deposit-deadline calc** — `programs/solshot-escrow-v2/src/lib.rs:255-262` (post-H018-fix: strict `<`)
- **v2 match-end calc** — `programs/solshot-escrow-v2/src/lib.rs:296-303, 365-369`
- **v2 cancel deadline branches** — `programs/solshot-escrow-v2/src/lib.rs:470-477`
- **v2 reclaim deadline branches** — `programs/solshot-escrow-v2/src/lib.rs:539-549`
- **v1 settlement deadline** — `programs/solshot-escrow/src/lib.rs:264-272`
- **v1 cancel timeout** — `programs/solshot-escrow/src/lib.rs:357-378` (post-H035-fix: `TIMEOUT_SECONDS = 3600`)
- **v1 reclaim 2x timeout** — `programs/solshot-escrow/src/lib.rs:442-456` (post-fix: `PERMISSIONLESS_RECLAIM_TIMEOUT = 7200`)
- **v1 NEW MIN_DEPOSIT_WINDOW gate** — `programs/solshot-escrow/src/lib.rs:493-501` (post-H017-fix)

**Verification mode:** Kani UNAVAILABLE. All invariants assigned to LiteSVM and/or Proptest.

**Constants context (post-fix-bundle):**

| Program | Constant | Value | Notes |
|---------|----------|-------|-------|
| v1 | `TIMEOUT_SECONDS` | 3600s (1h) | was 600s; H035 fix |
| v1 | `PERMISSIONLESS_RECLAIM_TIMEOUT` | 7200s (2h) | = `TIMEOUT_SECONDS * 2`; was 1200s |
| v1 | `SETTLEMENT_TIMEOUT_SECONDS` | 3600s (1h) | unchanged |
| v1 | `MIN_DEPOSIT_WINDOW_SECS` | 600s (10m) | NEW — H017 fix |
| v2 | `MIN_DURATION_SECS` | 60s | per-match minimum match duration |
| v2 | `MAX_DURATION_SECS` | 86400s (24h) | was 604800s; H039 fix |
| v2 | `MIN_DEPOSIT_WINDOW_SECS` | 60s | per-match `deposit_window_secs` floor |
| v2 | `MAX_DEPOSIT_WINDOW_SECS` | 86400s (24h) | per-match ceiling |
| v2 | `PUBLIC_REFUND_GRACE_SECS` | 86400s (24h) | reclaim grace after match-end / deposit-deadline |

---

## Proposed Invariants

### INV-1 (I-TIME-1): No Overflow on Any Deadline Addition

**What it checks:**
Every `checked_add` against a `Clock::get()?.unix_timestamp` (or a stored `created_at`/`activated_at`/`match_end_ts` field) cannot overflow `i64` for any plausible Solana timestamp. The sum `created_at + window_secs`, `activated_at + duration_secs`, `match_end_ts + PUBLIC_REFUND_GRACE_SECS`, etc. always returns `Some(_)` for realistic inputs (year 2020 through year 9000+), and the `?` propagates `ArithmeticOverflow` only at truly absurd values (year 292 billion AD).

**Why it matters:**
If a deadline addition silently wrapped, a pre-2020-style negative deadline (e.g. `i64::MAX + 1` wraps to `i64::MIN`) would be interpreted as "already expired" by every `now > deadline` / `now <= deadline` comparison. Every settle, cancel, and reclaim guard would simultaneously pass at activation, collapsing the entire timeout architecture in a single block. Concretely: if `created_at + deposit_window_secs` wrapped negative, `start_with_depositors` (`now >= deposit_deadline`) would succeed in the same slot as deposit, giving the authority an immediate silent-kick path with no minimum-window enforcement. Conversely, a deadline that wraps below `now` makes `permissionless_reclaim` callable instantly — anyone can reclaim before any player has had a chance to play.

**Tool:** Proptest (boundary tests + realistic-range sweep), LiteSVM (smoke check on representative paths)
**Confidence:** high
**Based on:** VP-089 (Timestamp Overflow at Large Values)

**Formal Property:**
```
For all plausible timestamps ts ∈ [1_577_836_800, 4_102_444_800] (2020 through 2100):
  ts.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_some()              [v1]
  ts.checked_add(TIMEOUT_SECONDS).is_some()                          [v1]
  ts.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_some()           [v1]
  ts.checked_add(MIN_DEPOSIT_WINDOW_SECS).is_some()                  [v1]
  ts.checked_add(deposit_window_secs as i64).is_some()               [v2, ≤ 86400]
  ts.checked_add(duration_secs as i64).is_some()                     [v2, ≤ 86400]
  ts.checked_add(PUBLIC_REFUND_GRACE_SECS).is_some()                 [v2]
  (ts + window_secs).checked_add(PUBLIC_REFUND_GRACE_SECS).is_some() [v2 chained]

For boundary at i64::MAX:
  i64::MAX.checked_add(_) is None for all positive constants
  (i64::MAX - K).checked_add(K) = Some(i64::MAX) for all K ≥ 0
  (i64::MAX - K + 1).checked_add(K) is None
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_1_all_v1_deadlines_no_overflow_realistic(
        ts in MIN_REALISTIC_TS..=MAX_REALISTIC_TS
    ) {
        prop_assert!(ts.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_some());
        prop_assert!(ts.checked_add(TIMEOUT_SECONDS).is_some());
        prop_assert!(ts.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_some());
        prop_assert!(ts.checked_add(MIN_DEPOSIT_WINDOW_SECS).is_some());
    }

    #[test]
    fn ts_inv_1_all_v2_deadlines_no_overflow_realistic(
        ts in MIN_REALISTIC_TS..=MAX_REALISTIC_TS,
        window_secs in (V2_MIN_DEPOSIT_WINDOW_SECS as i64)..=(V2_MAX_DEPOSIT_WINDOW_SECS as i64),
        duration_secs in (V2_MIN_DURATION_SECS as i64)..=(V2_MAX_DURATION_SECS as i64),
    ) {
        // deposit_deadline
        let dep = ts.checked_add(window_secs);
        prop_assert!(dep.is_some());
        // match_end_ts
        let me = ts.checked_add(duration_secs);
        prop_assert!(me.is_some());
        // reclaim_deadline (Active)
        let rd_active = me.unwrap().checked_add(V2_PUBLIC_REFUND_GRACE_SECS);
        prop_assert!(rd_active.is_some());
        // reclaim_deadline (AwaitingDeposits — chained)
        let rd_awaiting = dep.unwrap().checked_add(V2_PUBLIC_REFUND_GRACE_SECS);
        prop_assert!(rd_awaiting.is_some());
    }
}

// Boundary tests (one-shot)
#[test]
fn ts_inv_1_boundary_overflow_caught() {
    assert!(i64::MAX.checked_add(SETTLEMENT_TIMEOUT_SECONDS).is_none());
    assert!(i64::MAX.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_none());
    let last_safe = i64::MAX - PERMISSIONLESS_RECLAIM_TIMEOUT;
    assert!(last_safe.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_some());
    assert!((last_safe + 1).checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).is_none());
}
```

**LiteSVM sketch:**
```rust
// Smoke test: deploy program, create_match with MAX windows, advance clock by 24h+,
// assert no instruction returns ArithmeticOverflow at realistic timestamps.
// Optional: assert ArithmeticOverflow IS returned if forced via mocked huge-clock scenario.
```

---

### INV-2 (I-TIME-2): Monotonic Deadline Ordering Per Match

**What it checks:**
For any single in-flight match, the deadlines stay in non-decreasing order along the lifecycle: `deposit_deadline ≤ match_end_ts ≤ reclaim_deadline`. Specifically:

- (v2 AwaitingDeposits) `deposit_deadline = created_at + deposit_window_secs`
- (v2 Active) `match_end_ts = activated_at + duration_secs` and `activated_at ≥ deposit_deadline` if activated via `start_with_depositors` (so `match_end_ts ≥ deposit_deadline`)
- (v2 Active) `reclaim_deadline = match_end_ts + PUBLIC_REFUND_GRACE_SECS ≥ match_end_ts`
- (v2 AwaitingDeposits stalled) `reclaim_deadline = deposit_deadline + PUBLIC_REFUND_GRACE_SECS > deposit_deadline`

**Why it matters:**
The lifecycle relies on each phase strictly succeeding the previous one — players need a chance to deposit before the match starts, the match needs to reach its expected end before players can cancel, and the public-grace window needs to extend beyond match-end before strangers can reclaim. If ordering inverts (e.g. `reclaim_deadline ≤ match_end_ts`), the permissionless reclaim becomes valid before the match has officially ended, letting any rent-sniping bot drain the escrow while the legitimate authority is still trying to settle. Inversions are typically caused by sign errors, swapped arguments, or comments-vs-code drift.

**Tool:** Proptest (sweep over all valid `(deposit_window_secs, duration_secs)` pairs), LiteSVM (end-to-end timeline assertion)
**Confidence:** high
**Based on:** VP-090 (Time Window Boundary Precision) + VP-088 (Epoch Boundary Off-by-One)

**Formal Property:**
```
For all valid v2 inputs:
  MIN_DEPOSIT_WINDOW_SECS ≤ deposit_window_secs ≤ MAX_DEPOSIT_WINDOW_SECS
  MIN_DURATION_SECS ≤ duration_secs ≤ MAX_DURATION_SECS
  created_at ≥ MIN_REALISTIC_TS

Let:
  deposit_deadline = created_at + deposit_window_secs
  // v2:351 require!(now >= deposit_deadline) for start_with_depositors
  // → activated_at ≥ deposit_deadline (in start_with_depositors path)
  // For full-mask deposit path, activated_at can be < deposit_deadline,
  //   but match_end_ts may be < deposit_deadline (acceptable: full deposits
  //   ended early and game starts immediately).
  match_end_ts_full = activated_at_full + duration_secs       (full deposit path)
  match_end_ts_swd  = activated_at_swd + duration_secs ≥ deposit_deadline + duration_secs
  reclaim_deadline_active    = match_end_ts + PUBLIC_REFUND_GRACE_SECS
  reclaim_deadline_awaiting  = deposit_deadline + PUBLIC_REFUND_GRACE_SECS

Then:
  reclaim_deadline_active   > match_end_ts                              [strict]
  reclaim_deadline_awaiting > deposit_deadline                          [strict]
  match_end_ts_swd          ≥ deposit_deadline                          [≥, equality at edge]
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_2_v2_swd_ordering(
        created_at in V2_REALISTIC_TS_RANGE,
        deposit_window_secs in (V2_MIN_DEPOSIT_WINDOW_SECS as i64)..=(V2_MAX_DEPOSIT_WINDOW_SECS as i64),
        duration_secs in (V2_MIN_DURATION_SECS as i64)..=(V2_MAX_DURATION_SECS as i64),
    ) {
        let dep_deadline = created_at + deposit_window_secs;
        // start_with_depositors requires now >= deposit_deadline → choose activated_at = dep_deadline
        let activated_at = dep_deadline;
        let match_end_ts = activated_at + duration_secs;
        let reclaim_deadline = match_end_ts + V2_PUBLIC_REFUND_GRACE_SECS;

        prop_assert!(match_end_ts >= dep_deadline,
            "match_end_ts {} < dep_deadline {}", match_end_ts, dep_deadline);
        prop_assert!(reclaim_deadline > match_end_ts,
            "reclaim_deadline {} ≤ match_end_ts {}", reclaim_deadline, match_end_ts);
    }

    #[test]
    fn ts_inv_2_v2_awaiting_ordering(
        created_at in V2_REALISTIC_TS_RANGE,
        deposit_window_secs in (V2_MIN_DEPOSIT_WINDOW_SECS as i64)..=(V2_MAX_DEPOSIT_WINDOW_SECS as i64),
    ) {
        let dep_deadline = created_at + deposit_window_secs;
        let reclaim_deadline = dep_deadline + V2_PUBLIC_REFUND_GRACE_SECS;
        prop_assert!(reclaim_deadline > dep_deadline);
        // Grace must be at least 24h
        prop_assert_eq!(reclaim_deadline - dep_deadline, V2_PUBLIC_REFUND_GRACE_SECS);
    }
}
```

**LiteSVM sketch:**
```rust
// 1. create_match with deposit_window_secs=W, duration_secs=D.
// 2. Have all players deposit immediately (full-mask path). Read match_end_ts.
//    Assert match_end_ts == created_at_observed + (something close to D within slot drift).
// 3. Advance clock to match_end_ts. Assert reclaim returns TooEarlyToReclaim.
// 4. Advance clock to match_end_ts + PUBLIC_REFUND_GRACE_SECS - 1. Still TooEarlyToReclaim.
// 5. Advance clock to match_end_ts + PUBLIC_REFUND_GRACE_SECS + 1. Reclaim succeeds.
// Repeat for the start_with_depositors path with partial deposits.
```

---

### INV-3 (I-TIME-3): v1 Settle/Cancel Race Window Eliminated (Post-H035-Fix)

**What it checks:**
With `TIMEOUT_SECONDS = 3600` and `SETTLEMENT_TIMEOUT_SECONDS = 3600`, the simultaneous-validity overlap between `settle_match` and player `cancel_match` is reduced to at most a single slot. Concretely:

- `settle_match` is valid for `now ≤ activated_at + SETTLEMENT_TIMEOUT_SECONDS` (≤, inclusive)
- player `cancel_match` (timeout path) is valid for `now > activated_at + TIMEOUT_SECONDS` (>, strict)
- With both constants = 3600, the overlap is `now > activated_at + 3600 ∧ now ≤ activated_at + 3600` = empty

The 50-minute race window from the pre-fix configuration (TIMEOUT_SECONDS=600 < SETTLEMENT_TIMEOUT_SECONDS=3600) is closed.

**Why it matters:**
H035 documented that the 50-minute simultaneous-validity zone gave any losing player a settlement-denial primitive: observe the authority's `settle_match` TX in mempool, broadcast a higher-priority-fee `cancel_match`, win the priority-fee race, and recover their full wager (refunding all depositors, including the winner who was denied 0.8×W). With both constants at 3600, the overlap collapses — when the cancel becomes valid, the settle has already expired. Mutual exclusion is now effectively time-enforced rather than only state-enforced. The invariant fails if either constant changes without the other, or if either comparison's strictness changes (e.g. cancel switches to `≥` or settle switches to `<`). This invariant must guard against such drift.

**Tool:** Proptest (constant-relationship + boundary tests), LiteSVM (race scenario at exact boundary)
**Confidence:** high
**Based on:** VP-090 (Time Window Boundary Precision) — directly applicable to two-window mutual-exclusion case

**Formal Property:**
```
TIMEOUT_SECONDS = SETTLEMENT_TIMEOUT_SECONDS = 3600

For any activated_at and any now:
  let cancel_open_at  = activated_at + TIMEOUT_SECONDS       // strict > boundary
  let settle_close_at = activated_at + SETTLEMENT_TIMEOUT_SECONDS  // ≤ boundary
  let can_cancel  = now > cancel_open_at
  let can_settle  = now ≤ settle_close_at
  // Race window: can_cancel ∧ can_settle should be impossible
  ¬(can_cancel ∧ can_settle)

Equivalent: cancel_open_at ≥ settle_close_at ∧ no slot satisfies both bounds.
With both = 3600: at now = activated_at + 3600, can_settle = true, can_cancel = false.
                   at now = activated_at + 3601, can_settle = false, can_cancel = true.
                   Race window = ∅.
```

**Proptest sketch:**
```rust
#[test]
fn ts_inv_3_v1_constants_eliminate_race() {
    assert_eq!(TIMEOUT_SECONDS, SETTLEMENT_TIMEOUT_SECONDS,
        "H035 fix: TIMEOUT_SECONDS must equal SETTLEMENT_TIMEOUT_SECONDS to close race");
    assert_eq!(TIMEOUT_SECONDS, 3600);
}

proptest! {
    #[test]
    fn ts_inv_3_v1_no_settle_cancel_overlap(
        activated_at in REALISTIC_TS_RANGE,
        offset in -7200i64..=7200i64,
    ) {
        let now = activated_at + offset;
        let cancel_open_at = activated_at + TIMEOUT_SECONDS;
        let settle_close_at = activated_at + SETTLEMENT_TIMEOUT_SECONDS;
        let can_cancel = now > cancel_open_at;
        let can_settle = now <= settle_close_at;
        prop_assert!(!(can_cancel && can_settle),
            "Race at activated_at={}, offset={}, now={}", activated_at, offset, now);
    }
}
```

**LiteSVM sketch:**
```rust
// 1. create_match v1, both players deposit, match goes Active. Record activated_at.
// 2. Advance clock to activated_at + 3600 exactly.
// 3. Submit BOTH settle_match (authority) and cancel_match (player) in same slot.
//    Assert exactly ONE succeeds. The other fails on either deadline OR state-check.
// 4. Repeat at activated_at + 3601: settle must fail (SettlementExpired),
//    cancel must succeed.
// 5. Repeat at activated_at + 3599: settle must succeed,
//    cancel must fail (Unauthorized — is_timed_out=false).
```

---

### INV-4 (I-TIME-4): v1 Constant-Doc Integrity (Post-H040-Fix)

**What it checks:**
The runtime value of `PERMISSIONLESS_RECLAIM_TIMEOUT` matches its doc-comment description. Specifically:

- Pre-fix: comment claimed "48-hour" / `// 172800 seconds`, actual value was `TIMEOUT_SECONDS * 2 = 600 * 2 = 1200s = 20 min`. Comment was 144× wrong.
- Post-fix: comment must now describe `TIMEOUT_SECONDS * 2 = 3600 * 2 = 7200s = 2 hours`. The numeric claim and the computed value must agree.

This invariant is enforced via a `const _: () = assert!(...)` static assertion plus a runtime test that verifies the computed value matches the documented value.

**Why it matters:**
H040 documented that operators reading the stale "48-hour" comment to plan incident-response SLAs would miss the actual 20-minute reclaim window — third-party rent-sniping bots can drain PDA rent reserves while the operator waits a day. While not a fund-loss bug per se, comment drift undermines audit confidence and operational planning. A static assertion at the constant site catches future drift at compile time. This is a documentation invariant that, if violated, means the codebase has a "trojan-horse comment" that lies about its constant.

**Tool:** Proptest (compile-time static assertion via `const fn` check) + Rust unit test
**Confidence:** high
**Based on:** novel — H040 finding directly motivates this invariant

**Formal Property:**
```
PERMISSIONLESS_RECLAIM_TIMEOUT == TIMEOUT_SECONDS * 2
PERMISSIONLESS_RECLAIM_TIMEOUT == 7200
TIMEOUT_SECONDS == 3600

If a doc-comment near the constant says "N-hour" or "N seconds":
  N must equal the computed value at that location.
```

**Proptest sketch (unit-test form):**
```rust
#[test]
fn ts_inv_4_v1_reclaim_constant_matches_documented_value() {
    assert_eq!(TIMEOUT_SECONDS, 3600, "TIMEOUT_SECONDS must be 1 hour");
    assert_eq!(
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        TIMEOUT_SECONDS * 2,
        "PERMISSIONLESS_RECLAIM_TIMEOUT must equal 2 * TIMEOUT_SECONDS"
    );
    assert_eq!(
        PERMISSIONLESS_RECLAIM_TIMEOUT,
        7200,
        "Doc-comment must read '2-hour' / '7200 seconds' to match runtime value"
    );
    // Defense against future drift
    let checked = TIMEOUT_SECONDS.checked_mul(2);
    assert_eq!(checked, Some(PERMISSIONLESS_RECLAIM_TIMEOUT));
}

// Compile-time guard (drop into lib.rs when adding fix)
const _: () = assert!(
    PERMISSIONLESS_RECLAIM_TIMEOUT == 7200,
    "PERMISSIONLESS_RECLAIM_TIMEOUT must be 7200s; update doc-comment if changing"
);
```

---

### INV-5 (I-TIME-5): v2 Strict Deposit Deadline (Post-H018-Fix)

**What it checks:**
At exactly `now = deposit_deadline`, `deposit_wager` is REJECTED while `start_with_depositors` is PERMITTED. The two windows partition the timeline at the boundary instead of overlapping.

- v2:274 `deposit_wager`: `require!(now < deposit_deadline)` — strict `<` after H018 fix
- v2:350 `start_with_depositors`: `require!(now >= deposit_deadline)` — inclusive `≥`

At `now = deposit_deadline`, the first check fails (`now < deposit_deadline` is false) and the second passes (`now >= deposit_deadline` is true). No simultaneous validity.

**Why it matters:**
H018 documented that pre-fix, both `deposit_wager` (was `≤`) and `start_with_depositors` (`≥`) accepted `now = deposit_deadline`. A slow-network last-second depositor would race the authority's compaction TX in the same slot. If start-with-depositors landed first, the depositor's TX failed on `state == Active` and they were silently kicked despite acting in good faith within their advertised window. The strict-`<` fix makes the deposit window a half-open interval `[created_at, created_at + window)` — clean, matches VP-090's recommended convention, and removes the boundary race. Inversion or relaxation of either check (e.g. cancel switching to `≤`) re-opens the race; this invariant must guard against that drift.

**Tool:** LiteSVM (boundary instruction at exact deposit_deadline), Proptest (strategy-driven sweep of `(now, deposit_deadline)` pairs near the boundary)
**Confidence:** high
**Based on:** VP-090 (Time Window Boundary Precision)

**Formal Property:**
```
For all v2 matches and all now, deposit_deadline:
  Let deposit_valid = (state == AwaitingDeposits) ∧ (now < deposit_deadline)
  Let swd_valid     = (state == AwaitingDeposits) ∧ (now >= deposit_deadline) ∧ ...

  ¬(deposit_valid ∧ swd_valid)        // mutual exclusion
  At now = deposit_deadline:
    deposit_valid = false
    swd_valid     = true (subject to other guards)
  At now = deposit_deadline - 1:
    deposit_valid = true
    swd_valid     = false
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_5_v2_deposit_window_partition(
        created_at in V2_REALISTIC_TS_RANGE,
        window_secs in (V2_MIN_DEPOSIT_WINDOW_SECS as i64)..=(V2_MAX_DEPOSIT_WINDOW_SECS as i64),
        offset in -10i64..=10i64,
    ) {
        let deposit_deadline = created_at + window_secs;
        let now = deposit_deadline + offset;
        let deposit_check = now < deposit_deadline;
        let swd_check     = now >= deposit_deadline;
        prop_assert!(!(deposit_check && swd_check),
            "Boundary race at offset={}, now={}, dd={}", offset, now, deposit_deadline);
        prop_assert!(deposit_check || swd_check,
            "Boundary gap at offset={}, now={}, dd={}", offset, now, deposit_deadline);
        if offset == 0 {
            prop_assert!(!deposit_check, "deposit must be REJECTED at exact deadline");
            prop_assert!(swd_check, "swd must be PERMITTED at exact deadline");
        }
    }
}
```

**LiteSVM sketch:**
```rust
// 1. create_match v2 with deposit_window_secs = 60s.
// 2. Advance clock to created_at + 59. Both players try deposit_wager.
//    Player A succeeds. Player B's deposit also succeeds (or fails on different reason).
// 3. Reset; advance clock to created_at + 60 exactly. Try deposit_wager → must fail
//    with DepositWindowClosed.
// 4. Same slot, try start_with_depositors → must succeed (with at least 2 deposits).
// 5. Reset; advance to created_at + 59. Try start_with_depositors → must fail with
//    DepositWindowOpen.
```

---

### INV-6 (I-TIME-6): v2 Per-Match Deposit Window Bounded

**What it checks:**
At every `create_match` invocation, `MIN_DEPOSIT_WINDOW_SECS ≤ deposit_window_secs ≤ MAX_DEPOSIT_WINDOW_SECS` is enforced. Storage of the field on the escrow account preserves the bound (no off-by-one or u32→i64 cast surprises).

- v2 `MIN_DEPOSIT_WINDOW_SECS = 60`
- v2 `MAX_DEPOSIT_WINDOW_SECS = 86400` (24h)
- Stored as `u32` on `MatchEscrow.deposit_window_secs`; widened to `i64` at every read site (safe: `u32::MAX = 4.29e9 << i64::MAX`).

**Why it matters:**
The deposit window is a parameter the authority sets per-match. An out-of-range value would either trap the first depositor in a multi-day idle window (extreme upper) or auto-fail every player on slow-network conditions (extreme lower). The bounds gate ensures players' funds are not held longer than the documented protocol horizon (24h max + 24h grace = 48h worst case for AwaitingDeposits-stuck escrows). If the lower bound regressed to 0, the deposit window collapses to `created_at == deposit_deadline` and every deposit_wager fails immediately. If the upper bound regressed (e.g. to 7-days like v2's old `MAX_DURATION_SECS`), the maximum lockup horizon for a stalled match doubles or worse.

**Tool:** Proptest (sweep over valid bounds), LiteSVM (boundary failure test)
**Confidence:** high
**Based on:** novel — bounds-enforcement category, common audit finding

**Formal Property:**
```
At create_match:
  require!(deposit_window_secs >= MIN_DEPOSIT_WINDOW_SECS, DepositWindowTooShort)
  require!(deposit_window_secs <= MAX_DEPOSIT_WINDOW_SECS, DepositWindowTooLong)
  After write: escrow.deposit_window_secs == deposit_window_secs (round-trip preserves)

For all valid x ∈ [MIN_DEPOSIT_WINDOW_SECS, MAX_DEPOSIT_WINDOW_SECS]:
  (x as i64) ≤ MAX_DEPOSIT_WINDOW_SECS as i64        [no widening corruption]
  (x as i64) ≥ MIN_DEPOSIT_WINDOW_SECS as i64
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_6_deposit_window_bounds_in_range(
        x in (V2_MIN_DEPOSIT_WINDOW_SECS as u32)..=(V2_MAX_DEPOSIT_WINDOW_SECS as u32),
    ) {
        // Allowed range round-trips through u32→i64 cast safely
        let i64_val = x as i64;
        prop_assert!(i64_val >= V2_MIN_DEPOSIT_WINDOW_SECS as i64);
        prop_assert!(i64_val <= V2_MAX_DEPOSIT_WINDOW_SECS as i64);
    }

    #[test]
    fn ts_inv_6_deposit_window_bounds_reject_out_of_range(
        below in 0u32..(V2_MIN_DEPOSIT_WINDOW_SECS as u32),
        above in ((V2_MAX_DEPOSIT_WINDOW_SECS as u32) + 1)..=u32::MAX,
    ) {
        // Below MIN must be rejected (DepositWindowTooShort)
        prop_assert!(below < V2_MIN_DEPOSIT_WINDOW_SECS as u32);
        // Above MAX must be rejected (DepositWindowTooLong)
        prop_assert!(above > V2_MAX_DEPOSIT_WINDOW_SECS as u32);
    }
}
```

**LiteSVM sketch:**
```rust
// 1. create_match with deposit_window_secs = 59 → must fail DepositWindowTooShort.
// 2. create_match with deposit_window_secs = 60 → succeeds.
// 3. create_match with deposit_window_secs = 86400 → succeeds.
// 4. create_match with deposit_window_secs = 86401 → must fail DepositWindowTooLong.
// 5. create_match with deposit_window_secs = u32::MAX → must fail DepositWindowTooLong.
// 6. After successful create, read escrow.deposit_window_secs and assert it equals input.
```

---

### INV-7 (I-TIME-7): v2 Match Duration Bounded (Post-H039-Fix)

**What it checks:**
At every `create_match` invocation, `MIN_DURATION_SECS ≤ duration_secs ≤ MAX_DURATION_SECS` is enforced. Post-H039-fix: `MAX_DURATION_SECS = 86400` (24h), down from the old 604800 (7 days). This bounds the maximum fund-lockup horizon to 24h + 24h grace = 48h.

**Why it matters:**
H039 documented that pre-fix, an authority could set `duration_secs = 604800` (7 days) to lock all deposited player funds for 8 days (7-day match + 24-hour grace before permissionless reclaim). The authority gained no lamports from this — pure griefing surface. With MAX_DURATION_SECS = 86400, the worst-case lockup is 48h, which is acceptable for an async-multi-day gaming product. The lower bound (`MIN_DURATION_SECS = 60`) prevents 0-duration matches that would auto-end at activation. If the upper bound regresses (e.g. someone re-introduces 604800 thinking the cap was design intent rather than a temporary fix), the H039 attack surface re-opens. This invariant pins the ceiling.

**Tool:** Proptest, LiteSVM (boundary failures)
**Confidence:** high
**Based on:** novel — H039 finding directly motivates this; relates to bounds-enforcement category

**Formal Property:**
```
At create_match:
  require!(duration_secs >= MIN_DURATION_SECS, DurationTooShort)
  require!(duration_secs <= MAX_DURATION_SECS, DurationTooLong)

MIN_DURATION_SECS = 60
MAX_DURATION_SECS = 86400  (NOT 604800)

For all valid d ∈ [60, 86400]:
  (d as i64) ≤ 86400
  Stored escrow.duration_secs == input duration_secs

Maximum fund-lockup horizon for any v2 match:
  total_lockup ≤ MAX_DURATION_SECS + PUBLIC_REFUND_GRACE_SECS = 172800s = 48h
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_7_duration_in_range(
        d in (V2_MIN_DURATION_SECS as u32)..=(V2_MAX_DURATION_SECS as u32),
    ) {
        prop_assert!((d as i64) >= V2_MIN_DURATION_SECS as i64);
        prop_assert!((d as i64) <= V2_MAX_DURATION_SECS as i64);
    }

    #[test]
    fn ts_inv_7_max_lockup_horizon(
        d in (V2_MIN_DURATION_SECS as u32)..=(V2_MAX_DURATION_SECS as u32),
    ) {
        let max_lockup = (d as i64) + V2_PUBLIC_REFUND_GRACE_SECS;
        prop_assert!(max_lockup <= 172_800,
            "Max lockup horizon must be ≤ 48h; got {}s", max_lockup);
    }
}

#[test]
fn ts_inv_7_max_duration_did_not_regress() {
    assert_eq!(MAX_DURATION_SECS, 86400,
        "H039 fix: MAX_DURATION_SECS must remain 86400; do NOT regress to 604800");
    assert!(MAX_DURATION_SECS < 604800,
        "Regression guard: MAX_DURATION_SECS must be < 7d");
}
```

**LiteSVM sketch:**
```rust
// 1. create_match with duration_secs = 86400 → succeeds.
// 2. create_match with duration_secs = 86401 → must fail DurationTooLong.
// 3. create_match with duration_secs = 604800 → must fail DurationTooLong.
// 4. create_match with duration_secs = 59 → must fail DurationTooShort.
// 5. End-to-end: full 24h match, advance clock, assert lockup ≤ 48h before reclaim.
```

---

### INV-8 (I-TIME-8): `activated_at` Set-Once Invariants

**What it checks:**
The `activated_at` field on every escrow account satisfies:

1. Pre-activation: `activated_at == 0` (initialized at create_match)
2. At-activation: set to `Clock::get()?.unix_timestamp` in the same atomic instruction as `state = MatchState::Active`
3. Post-activation: never modified again — neither `cancel_match`, `permissionless_reclaim`, nor `settle_match` write to it
4. `match_end_ts == 0` before activation; `match_end_ts == activated_at + duration_secs` after activation (v2 only); both fields written together at activation

This is INVARIANT-T1, T3, and T4 from the SOS timing audit consolidated.

**Why it matters:**
The timeout-reference branching at v1:373-377 (cancel) and v1:466-470 (reclaim) and v2:471-477 (cancel) and v2:561-571 (reclaim) all branch on `activated_at > 0` to choose between the AwaitingDeposits and Active deadline formulas. If `activated_at` could be reset to 0 mid-lifecycle, an Active match would suddenly use the AwaitingDeposits formula (`created_at + deposit_window_secs`), which would either be way in the past (instant reclaim available) or way in the future (no escape hatch). If `activated_at` could be modified upward, the authority could effectively extend the match indefinitely — re-creating the H039 lockup attack with extra steps. The set-once-and-only-at-Active-transition guarantee is load-bearing for every timeout decision.

**Tool:** LiteSVM (multi-step lifecycle state assertions; observe `activated_at` through every instruction), Proptest (model the state machine and assert atomic activation)
**Confidence:** high
**Based on:** SOS INVARIANT-T1, T3, T4 (timing-ordering audit context)

**Formal Property:**
```
Initial state (post-create_match):
  escrow.state == AwaitingDeposits
  escrow.activated_at == 0
  escrow.match_end_ts == 0

Activation transitions (deposit_wager full-mask path OR start_with_depositors):
  Pre:  state == AwaitingDeposits ∧ activated_at == 0
  Post: state == Active ∧ activated_at == clock_now ∧ match_end_ts == clock_now + duration_secs
  All three writes occur in the same instruction (atomic from observer perspective)

Post-activation invariants for any subsequent settle/cancel/reclaim:
  escrow.activated_at unchanged (immutable post-Active)
  escrow.match_end_ts unchanged (immutable post-Active)
  escrow.state ∈ {Active, Settled, Cancelled} (cannot return to AwaitingDeposits)
```

**LiteSVM sketch:**
```rust
// 1. create_match → assert activated_at == 0, match_end_ts == 0, state == AwaitingDeposits.
// 2. Single deposit (not full mask) → assert all three fields unchanged.
// 3. Final deposit completing full mask → assert activated_at != 0,
//    match_end_ts == activated_at + duration_secs, state == Active.
// 4. Read activated_at value, save as A.
// 5. Submit cancel_match (player path) — should fail or succeed depending on time.
//    After: assert escrow.activated_at == A (unchanged, even on cancel success).
// 6. Reset; full lifecycle through start_with_depositors path. Same assertions.
// 7. After settle_match: assert activated_at unchanged.
// 8. Negative test: ensure NO instruction provides a path to reset activated_at to 0.
```

**Proptest sketch:**
```rust
// Model-based test: simulate the state machine in Rust, randomly fire valid instructions,
// after every instruction assert:
//   1. activated_at is monotonic (only goes 0 → positive, never back)
//   2. match_end_ts is monotonic (only goes 0 → positive, never back)
//   3. state transitions follow the allowed graph
proptest! {
    #[test]
    fn ts_inv_8_activated_at_monotonic(actions in prop::collection::vec(any_action(), 0..50)) {
        let mut escrow = create_initial_escrow();
        let mut last_activated_at = 0i64;
        let mut last_match_end_ts = 0i64;
        for action in actions {
            apply_action(&mut escrow, action);
            prop_assert!(
                escrow.activated_at == last_activated_at
                    || (last_activated_at == 0 && escrow.activated_at > 0),
                "activated_at non-monotonic: was {} now {}", last_activated_at, escrow.activated_at);
            prop_assert!(escrow.match_end_ts == last_match_end_ts
                || (last_match_end_ts == 0 && escrow.match_end_ts > 0));
            last_activated_at = escrow.activated_at;
            last_match_end_ts = escrow.match_end_ts;
        }
    }
}
```

---

### INV-9 (I-TIME-9): Reclaim Grace Minimum

**What it checks:**
The permissionless reclaim deadline is strictly greater than the latest player-action deadline by at least the documented grace period:

- v2 (Active match): `reclaim_deadline ≥ match_end_ts + 24h` (PUBLIC_REFUND_GRACE_SECS)
- v2 (AwaitingDeposits stalled): `reclaim_deadline ≥ deposit_deadline + 24h`
- v1 (Active match): `reclaim_deadline ≥ activated_at + 7200s` (PERMISSIONLESS_RECLAIM_TIMEOUT)
- v1 (AwaitingDeposits stalled): `reclaim_deadline ≥ created_at + 7200s`

The strict `>` comparison in v1:478 / v2:574 (`require!(now > reclaim_deadline, ...)`) ensures no one can reclaim AT exactly the deadline; reclaim opens the slot AFTER it.

**Why it matters:**
Permissionless reclaim is the last-resort escape hatch for stalled funds. The grace period exists to give legitimate participants (winner, authority) a window to settle without rent-sniping bots front-running them for 0.002 SOL. If the grace shrinks below the documented horizon, a bot can claim PDA rent the moment the match ends. Players still get refunded (refund loop runs unconditionally), but the rent that was set aside for the protocol's operational expenses leaks to whichever monitor watches the chain. If the grace inverts (i.e. `reclaim_deadline < match_end_ts`), reclaim becomes available BEFORE the match has officially ended — a far worse failure mode where players lose their match-in-progress to a bot. This invariant pins the floor.

**Tool:** Proptest (sweep), LiteSVM (boundary instruction at exact reclaim_deadline)
**Confidence:** high
**Based on:** VP-090 (Time Window Boundary Precision)

**Formal Property:**
```
v2:
  At reclaim time, with state ∈ {AwaitingDeposits, Active}, activated_at > 0:
    reclaim_deadline = match_end_ts + PUBLIC_REFUND_GRACE_SECS
    require!(now > reclaim_deadline)
  With activated_at == 0:
    reclaim_deadline = (created_at + deposit_window_secs) + PUBLIC_REFUND_GRACE_SECS
    require!(now > reclaim_deadline)

  In all paths: reclaim_deadline > player_cancel_deadline
  Specifically: reclaim_deadline - player_cancel_deadline == PUBLIC_REFUND_GRACE_SECS
                                                          == 86400 (24h)

v1:
  reclaim_deadline = timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT
  reclaim_deadline - cancel_deadline == PERMISSIONLESS_RECLAIM_TIMEOUT - TIMEOUT_SECONDS
                                      == 7200 - 3600 == 3600 (1h gap)
  Note: post-fix v1 has cancel_deadline == settle_deadline == activated_at + 3600,
        so reclaim opens 1h after settle expires.
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_9_v2_active_reclaim_after_match_end(
        activated_at in V2_REALISTIC_TS_RANGE,
        duration_secs in (V2_MIN_DURATION_SECS as i64)..=(V2_MAX_DURATION_SECS as i64),
    ) {
        let match_end_ts = activated_at + duration_secs;
        let reclaim_deadline = match_end_ts + V2_PUBLIC_REFUND_GRACE_SECS;
        prop_assert!(reclaim_deadline > match_end_ts);
        prop_assert_eq!(reclaim_deadline - match_end_ts, V2_PUBLIC_REFUND_GRACE_SECS);
        prop_assert_eq!(reclaim_deadline - match_end_ts, 86400);
    }

    #[test]
    fn ts_inv_9_v2_awaiting_reclaim_after_deposit_deadline(
        created_at in V2_REALISTIC_TS_RANGE,
        deposit_window_secs in (V2_MIN_DEPOSIT_WINDOW_SECS as i64)..=(V2_MAX_DEPOSIT_WINDOW_SECS as i64),
    ) {
        let deposit_deadline = created_at + deposit_window_secs;
        let reclaim_deadline = deposit_deadline + V2_PUBLIC_REFUND_GRACE_SECS;
        prop_assert_eq!(reclaim_deadline - deposit_deadline, 86400);
    }

    #[test]
    fn ts_inv_9_v1_reclaim_gap_one_hour(
        timeout_ref in REALISTIC_TS_RANGE,
    ) {
        let cancel_deadline = timeout_ref + V1_TIMEOUT_SECONDS;        // 3600
        let reclaim_deadline = timeout_ref + V1_PERMISSIONLESS_RECLAIM_TIMEOUT;  // 7200
        prop_assert_eq!(reclaim_deadline - cancel_deadline, 3600);
    }
}
```

**LiteSVM sketch:**
```rust
// v2: full lifecycle:
// 1. create + deposits + activation. Record match_end_ts.
// 2. Advance clock to match_end_ts + 86400 exactly. Try permissionless_reclaim → must fail
//    TooEarlyToReclaim (strict > boundary).
// 3. Advance to match_end_ts + 86401. Try permissionless_reclaim → must succeed.
// 4. Repeat for AwaitingDeposits-stuck case (one player deposited, one didn't, deadline passed).
```

---

### INV-10 (I-TIME-10): v1 MIN_DEPOSIT_WINDOW Gate (Post-H017-Fix)

**What it checks:**
v1's `start_with_depositors` (`programs/solshot-escrow/src/lib.rs:529-537`, post-H017-fix) requires `now >= created_at + MIN_DEPOSIT_WINDOW_SECS` (600s = 10 minutes) before authority can compact and activate the match. Pre-fix, there was no timing gate — the authority could front-run an in-flight depositor's TX and silently kick them.

**Why it matters:**
H017 documented that without this gate, the authority could:
1. Observe Player A and B deposit, while Player C's deposit TX is still propagating (~400ms).
2. Front-run with `start_with_depositors`, compacting the players array to [A, B] and zeroing C's slot.
3. C's deposit_wager arrives, fails on `state == Active`, C loses TX fees plus their match slot.

The fix mirrors v2's `deposit_window_secs` enforcement: the authority must wait at least 10 minutes after match creation before starting with whatever players have deposited. This guarantees C's TX has time to confirm before compaction can run. If MIN_DEPOSIT_WINDOW_SECS regresses (e.g. someone reduces it to 60s for "faster matches"), C has less time to confirm; if it regresses to 0, the H017 attack returns.

**Tool:** LiteSVM (timing-precise instruction submission), Proptest (constant-relationship)
**Confidence:** high
**Based on:** novel — H017 finding directly motivates this

**Formal Property:**
```
v1 start_with_depositors precondition (post-H017-fix):
  let deposit_deadline = created_at + MIN_DEPOSIT_WINDOW_SECS
  require!(now >= deposit_deadline, DepositWindowOpen)

MIN_DEPOSIT_WINDOW_SECS == 600  (NOT < 600)

For all valid created_at and now < created_at + 600:
  start_with_depositors must fail with DepositWindowOpen

For all valid created_at and now >= created_at + 600:
  start_with_depositors may proceed (subject to other guards: state, num_deposited)
```

**Proptest sketch:**
```rust
#[test]
fn ts_inv_10_v1_min_deposit_window_did_not_regress() {
    assert_eq!(MIN_DEPOSIT_WINDOW_SECS, 600,
        "H017 fix: MIN_DEPOSIT_WINDOW_SECS must remain 600s; do NOT regress");
    assert!(MIN_DEPOSIT_WINDOW_SECS > 0,
        "Regression guard: H017 attack returns at MIN_DEPOSIT_WINDOW_SECS == 0");
}

proptest! {
    #[test]
    fn ts_inv_10_v1_swd_gate_partition(
        created_at in REALISTIC_TS_RANGE,
        offset in -700i64..=700i64,
    ) {
        let now = created_at + offset;
        let deposit_deadline = created_at + MIN_DEPOSIT_WINDOW_SECS;
        let gate_open = now >= deposit_deadline;
        prop_assert_eq!(gate_open, offset >= MIN_DEPOSIT_WINDOW_SECS);
    }
}
```

**LiteSVM sketch:**
```rust
// 1. v1 create_match. Record created_at.
// 2. 2 of 4 players deposit. Authority tries start_with_depositors at created_at + 599
//    → must fail DepositWindowOpen.
// 3. Same scenario at created_at + 600 → may succeed (and does, since num_deposited >= 2).
// 4. Negative case: at created_at + 0 (immediately after creation) → must fail.
```

---

### INV-11 (Novel): Clock Sysvar Read Correctness

**What it checks:**
Every time-comparing instruction reads `Clock::get()?.unix_timestamp` directly via the sysvar, not via account passed by the caller. This protects against EP-006-style fake-sysvar injection. The sysvar must be a syscall-derived value, not a deserialized account.

**Why it matters:**
Solana programs that accept the Clock as a regular account (via `&AccountInfo`) can be fooled by a caller passing a different account with crafted timestamp data. This is a known attack vector documented in EP-006 and several historical incidents. The escrow program must never trust caller-provided "Clock" data — only the sysvar syscall provides the authoritative validator-current timestamp. Inspection of the v1/v2 source confirms `Clock::get()?` is used at every site (no `Sysvar<Clock>` account input). This invariant pins that pattern.

**Tool:** Code-grep + LiteSVM (negative test: verify a malicious caller passing a fake clock account cannot affect timing decisions)
**Confidence:** medium (mostly a static-analysis assertion; LiteSVM coverage limited)
**Based on:** novel — EP-006 family; SOS Mechanism 4 (Clock::get sysvar usage)

**Formal Property:**
```
Every instruction handler in v1 and v2 reads time via:
  Clock::get()?.unix_timestamp

NOT via:
  ctx.accounts.clock.unix_timestamp  (account-derived, attacker-controlled)
  Sysvar::from_account_info(...)     (account-derived, attacker-controlled)

Static check: no `Sysvar<Clock>` field in any account struct definition.
Static check: no `clock: AccountInfo` field in any account struct.
```

**Proptest sketch (static):**
```rust
// Test source-grep at compile time via build.rs or external linter.
// Or runtime check: serialize each Accounts struct discriminator and ensure
// Clock is not a field name.
#[test]
fn ts_inv_11_no_account_clock_in_v1() {
    // Read v1/lib.rs source, assert no "clock: " field in any Accounts struct
    let src = include_str!("../../programs/solshot-escrow/src/lib.rs");
    assert!(!src.contains("clock: Sysvar<"),
        "v1 must use Clock::get(), not Sysvar<Clock> account");
    assert!(!src.contains("Sysvar<Clock>"),
        "v1 must not import Sysvar<Clock>");
}

#[test]
fn ts_inv_11_no_account_clock_in_v2() {
    let src = include_str!("../../programs/solshot-escrow-v2/src/lib.rs");
    assert!(!src.contains("clock: Sysvar<"));
    assert!(!src.contains("Sysvar<Clock>"));
}
```

---

### INV-12 (Novel): u32 → i64 Cast Safety for `as i64` Widening

**What it checks:**
Every `(some_u32_field as i64)` cast (e.g. `deposit_window_secs as i64`, `duration_secs as i64`) is safe — `u32::MAX = 4_294_967_295` is well within `i64` range (`9.22e18`). The cast can never silently change sign or wrap. Combined with `MAX_DEPOSIT_WINDOW_SECS = 86400` and `MAX_DURATION_SECS = 86400`, the cast values are tiny.

**Why it matters:**
Rust's `as` casts on integers wrap silently. If a future change introduces a `usize` or `u64` field cast to `i64`, the safety must be re-verified. For the current code, `u32 as i64` is provably safe and cannot produce a negative value. This invariant is mostly a "future-drift guard" — it pins the assumption so future audits/proptests can flag any new casts that break it.

**Tool:** Proptest (sweep over u32 range)
**Confidence:** high
**Based on:** novel — VP-089 corollary on widening casts

**Formal Property:**
```
For all v ∈ u32:
  (v as i64) >= 0
  (v as i64) <= u32::MAX as i64
  (v as i64) < i64::MAX

For the bounded fields specifically:
  MAX_DEPOSIT_WINDOW_SECS as i64 == 86400 (positive, well below i64::MAX)
  MAX_DURATION_SECS as i64 == 86400
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn ts_inv_12_u32_to_i64_safe(v in 0u32..=u32::MAX) {
        let widened = v as i64;
        prop_assert!(widened >= 0);
        prop_assert!(widened <= u32::MAX as i64);
        prop_assert!(widened < i64::MAX);
    }

    #[test]
    fn ts_inv_12_bounded_fields_addition_safe(
        ts in REALISTIC_TS_RANGE,
        v in 0u32..=(V2_MAX_DEPOSIT_WINDOW_SECS as u32),
    ) {
        // Even at u32::MAX (theoretical), addition must be safe at realistic timestamps.
        // For the program's bounded values, doubly safe.
        let result = ts.checked_add(v as i64);
        prop_assert!(result.is_some());
    }
}
```

---

## Coverage Gap Analysis

The 12 invariants above cover all 8 named math regions and all 9 invariants requested in the assignment. Additional gaps to note:

### Gaps NOT covered by these invariants

1. **Slot drift sensitivity at MIN bounds** (SOS Risk Observation #7): At `MIN_DURATION_SECS = 60`, validator clock drift of 1-2s = 1.6-3.3% of window. Proptest cannot easily model adversarial validator clock drift; LiteSVM has `set_sysvar` but realistic drift modeling requires explicit timing-fuzz tests. Not added as an invariant because the SOS audit deemed it "not exploitable in current bounds." Could add as a probe test if the team wants belt-and-suspenders.

2. **Authority's no-deadline settlement (v2 ASSUMPTION-T3)**: The SOS audit flagged that v2 has no on-chain deadline forcing the authority to call `settle_match` promptly. This is an architectural gap, not a math-arithmetic invariant — it would need a new instruction (e.g. `signal_settle` lock) rather than a property test. Out of scope for timestamp-arithmetic verification.

3. **Settle vs cancel race in v2 (post-fix-bundle status unclear)**: The fix bundle context says H035 was fixed in v1 but doesn't claim v2's race was eliminated. v2's `settle_match` still has no time deadline (v2:401-405), and player `cancel_match` opens at `match_end_ts`. The race window is `[match_end_ts, match_end_ts + 86400]`. State-machine mutual exclusion (Settled vs Cancelled terminal states) is the only protection. Not a timestamp-arithmetic invariant per se; covered by state-machine invariants in another cluster.

4. **Race between deposit_wager full-mask activation and start_with_depositors** (SOS Risk Observation #8, post-H018-fix should be eliminated): Verified by INV-5 above for the boundary case but a separate end-to-end LiteSVM scenario would be more direct.

5. **`created_at` set-once** (SOS INVARIANT-T2): Implicit in the standard Solana account model (account is `init`'d once at create_match). No write site post-creation reads or modifies `created_at`. This is enforced by the absence of a field-write rather than by an explicit assertion — could be added as a static-analysis grep, but low value compared to verifying the more-complex `activated_at` invariant in INV-8.

### Confidence Summary

| Invariant | Confidence | Pattern Match |
|-----------|------------|---------------|
| INV-1 (overflow) | high | VP-089 direct |
| INV-2 (ordering) | high | VP-090 + VP-088 direct |
| INV-3 (race eliminated) | high | VP-090 direct |
| INV-4 (doc integrity) | high | novel |
| INV-5 (strict deposit deadline) | high | VP-090 direct |
| INV-6 (window bounded) | high | novel (bounds enforcement) |
| INV-7 (duration bounded) | high | novel (bounds enforcement) |
| INV-8 (activated_at monotone) | high | SOS INVARIANT-T1 |
| INV-9 (reclaim grace floor) | high | VP-090 direct |
| INV-10 (v1 H017 gate) | high | novel |
| INV-11 (Clock::get sysvar) | medium | EP-006 family |
| INV-12 (u32→i64 cast) | high | VP-089 corollary |

**Verification mode:** All invariants assigned to **Proptest** (primary) and/or **LiteSVM** (integration). Kani is unavailable in this audit run — tests run in degraded "high-confidence probabilistic" tier rather than "proven for all inputs" tier.
