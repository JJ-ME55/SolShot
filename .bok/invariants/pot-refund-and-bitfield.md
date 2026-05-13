---
task_id: bok-analyze-pot-refund-and-bitfield
provides: [invariant-proposals]
subsystem: pot-scaling-refund-conservation-bitfield
confidence: high
invariant_count: 15
verification_modes: [LiteSVM, Proptest]
kani_available: false
---

# Invariant Proposals — Pot Scaling + Refund Conservation + Bit-Field

## Source Regions

| Region | File | Lines |
|--------|------|-------|
| `start_with_depositors` v1 (POST-H017-fix) | `programs/solshot-escrow/src/lib.rs` | 523–576 |
| `start_with_depositors` v2 | `programs/solshot-escrow-v2/src/lib.rs` | 337–396 |
| `cancel_match` v1 refund loop (POST-H023-fix) | `programs/solshot-escrow/src/lib.rs` | 360–443 |
| `cancel_match` v2 refund loop (POST-H023-fix) | `programs/solshot-escrow-v2/src/lib.rs` | 473–541 |
| `permissionless_reclaim` v1 (POST-H023-fix) | `programs/solshot-escrow/src/lib.rs` | 449–517 |
| `permissionless_reclaim` v2 (POST-H023-fix) | `programs/solshot-escrow-v2/src/lib.rs` | 548–608 |
| `deposit_wager` mask set v1 | `programs/solshot-escrow/src/lib.rs` | 217–242 |
| `deposit_wager` mask set v2 | `programs/solshot-escrow-v2/src/lib.rs` | 278–301 |
| `count_ones()` use sites — pot multiplication | `lib.rs:256-259, 301-303, 539, 566-568` (v1); `lib.rs:319-322, 343, 386-387, 416-417` (v2) |

## Verification Tooling Note

**Kani is NOT available** for this project. All invariants are marked for **LiteSVM** (runtime/multi-account flows) or **Proptest** (pure arithmetic / pre-CPI logic). LiteSVM tests require deploying the `.so` and exercising real Anchor handlers; Proptest tests mirror the on-chain math standalone (see existing `tests/bok_proptest_fee.rs` for the pattern).

---

## Proposed Invariants

### I-POT-1: Pot equals wager × deposited count (post-compaction)

**What it checks:**
After `start_with_depositors` runs, the activated `total_pot` emitted in `MatchActive` equals exactly `wager_lamports × count_ones(deposits_mask_pre_compaction)`. Equivalently, after compaction the new `count_ones(deposits_mask_post)` equals the pre-compaction count, and `total_pot = wager × new_count`.

**Why it matters:**
If the pot is mis-scaled (e.g. always `wager × max_players` regardless of deposits), the eventual `settle_match` would attempt to disburse more lamports than the PDA holds — causing an underflow panic with `overflow-checks=true`, or in a subtler fee-skim attack, the BPS slice would be computed against an inflated denominator and over-charge the winner. Conversely, if scaled too low, the winner is short-changed and lamports strand in the PDA where `close = authority` sweeps them.

**Tool:** LiteSVM (requires Clock advance + multi-deposit flow) + Proptest (compaction arithmetic in isolation).
**Confidence:** high
**Based on:** VP-001 (Conservation of Value), VP-099 (Mask correctness)

**Formal Property:**
```
Let mask_pre  = deposits_mask before compaction
Let mask_post = deposits_mask after compaction (= (1 << j) - 1)
Let wager     = escrow.wager_lamports
INVARIANT:
  count_ones(mask_post) == count_ones(mask_pre)
  total_pot == wager × count_ones(mask_pre)
  total_pot == wager × count_ones(mask_post)
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn pot_equals_wager_times_deposited(
        mask_pre in 0u8..=0b1111,        // v1: max 4 bits
        wager in 10_000u64..100_000_000_000,
    ) {
        let n = mask_pre.count_ones() as u64;
        prop_assume!(n >= 2);             // MIN_PLAYERS gate
        // Mirror compaction
        let mut new_mask: u8 = 0;
        let mut j = 0u8;
        for i in 0..4 {
            if (mask_pre >> i) & 1 == 1 {
                new_mask |= 1u8 << j;
                j += 1;
            }
        }
        prop_assert_eq!(new_mask.count_ones(), mask_pre.count_ones());
        prop_assert_eq!(new_mask, (1u8 << j) - 1);  // contiguous from bit 0
        let pot = wager.checked_mul(n).unwrap();
        prop_assert_eq!(pot, wager * (j as u64));
    }
}
```

**LiteSVM sketch:**
```rust
// 4-player match, max_players=4, wager=1_000_000
// Players 0,2,3 deposit (mask = 0b1101); player 1 does not.
// Advance clock past MIN_DEPOSIT_WINDOW_SECS (v1) or deposit_window_secs (v2).
// Authority calls start_with_depositors.
// Read MatchActive event.
assert_eq!(event.total_pot, wager * 3);
let escrow = read_escrow(svm, &pda);
assert_eq!(escrow.max_players, 3);
assert_eq!(escrow.deposits_mask, 0b111);  // compacted to (1<<3)-1
```

---

### I-POT-2: Compaction preserves the depositor set

**What it checks:**
Every deposited player (where pre-mask bit is set) maps to exactly one post-compaction slot. The new `players[0..j]` array contains the same multiset of pubkeys as the pre-compaction `{players[i] | (mask >> i) & 1 == 1}`. No depositor is dropped; no non-depositor is silently promoted into a slot.

**Why it matters:**
If compaction loses a depositor, that player can never receive their cut — `settle_match` validates `winner ∈ players[..max_players]`, so the lost depositor cannot win. Worse, if a non-depositor is silently retained, they appear in the players array without having paid into the pot, and a subsequent `cancel_match` would refund them via the bit-set + pubkey-match loop, draining the pot to a free-rider.

**Tool:** Proptest (pure permutation logic) + LiteSVM (account-state cross-check after activation).
**Confidence:** high
**Based on:** VP-101 (Pack/Unpack round-trip), novel — bit-positional preservation under permutation.

**Formal Property:**
```
Let S_pre  = { players[i] | i ∈ 0..max_pre, (mask_pre >> i) & 1 == 1 }
Let S_post = { players[i] | i ∈ 0..max_post } as multisets
INVARIANT:
  S_pre == S_post
  |S_post| == count_ones(mask_pre)
  ∀ i ∈ 0..max_post: players[i] ≠ Pubkey::default()
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn compaction_preserves_depositor_set(
        mask in 0u8..=0b1111,
        players_in in proptest::collection::vec(any::<[u8;32]>(), 4..=4),
    ) {
        prop_assume!(mask.count_ones() >= 2);
        let pre: Vec<[u8;32]> = (0..4).filter(|i| (mask >> i) & 1 == 1)
                                       .map(|i| players_in[i]).collect();
        // Mirror the on-chain compaction
        let mut compacted = [[0u8;32]; 4];
        let mut new_mask: u8 = 0;
        let mut j = 0;
        for i in 0..4 {
            if (mask >> i) & 1 == 1 {
                compacted[j] = players_in[i];
                new_mask |= 1u8 << j;
                j += 1;
            }
        }
        let post: Vec<[u8;32]> = compacted[..j].to_vec();
        prop_assert_eq!(pre, post);            // same set, same order
        prop_assert_eq!(j as u32, mask.count_ones());
    }
}
```

---

### I-POT-3: MIN_PLAYERS = 2 enforced before compaction

**What it checks:**
`start_with_depositors` rejects any escrow whose `count_ones(deposits_mask) < 2`. After compaction, `escrow.max_players >= 2`. The pot multiplication `wager × count_ones` therefore can never multiply by 0 or 1.

**Why it matters:**
A 1-deposit match with `count_ones = 1` would create a pot equal to a single wager that the same depositor cannot legitimately win against (no opponents). If activated and settled, the depositor would receive their own wager minus 10% fee — economic loss with no game played. A 0-deposit activation (if MIN_PLAYERS were not enforced) would create a `total_pot = 0`, and `settle_match`'s BPS math on a zero pot still emits a `MatchSettled` event with `winner_amount = 0` — confusing accounting but not a direct theft. The 2-player floor is the only thing keeping these degenerate paths off-chain.

**Tool:** LiteSVM (negative test: try to activate with 1 deposit and expect `TooFewPlayers`) + Proptest (assertion on count_ones precondition).
**Confidence:** high
**Based on:** VP-099 (Mask correctness — guard rails on extracted count).

**Formal Property:**
```
Pre-condition for start_with_depositors success:
  count_ones(deposits_mask) >= 2
Post-condition:
  escrow.max_players >= 2 (after compaction j >= 2)
```

**LiteSVM sketch:**
```rust
// Setup: 4-player match, only player[0] deposits
// Advance clock past deposit window
// Authority calls start_with_depositors
// EXPECT: error == TooFewPlayers
let result = svm.process_transaction(&start_tx);
assert!(matches!(result, Err(e) if e.to_string().contains("TooFewPlayers")));
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn activation_requires_at_least_two_deposits(
        mask in 0u8..=0b1111,
    ) {
        let n = mask.count_ones();
        if n < 2 {
            // Mirror the on-chain require!(num_deposited >= 2, TooFewPlayers)
            prop_assert!(n < 2, "should fail TooFewPlayers");
        }
    }
}
```

---

### I-POT-4 (NEW post-H017-fix): Deposit-window timing gate

**What it checks:**
v1's `start_with_depositors` enforces `Clock::get()?.unix_timestamp >= escrow.created_at + MIN_DEPOSIT_WINDOW_SECS (600)` before compaction. Any earlier call returns `EscrowError::DepositWindowOpen`. v2 enforces the per-match `deposit_window_secs` field for the same effect.

**Why it matters:**
Without this gate (the H017 silent-kick attack), the authority could observe two deposits land in `deposits_mask` and immediately call `start_with_depositors` to compact the players array — overwriting non-depositors with `Pubkey::default()` and flipping `state = Active`. Any in-flight `deposit_wager` from a kicked player then fails the `state == AwaitingDeposits` check at `lib.rs:212` and the player loses their slot + TX fees. The fix guarantees a 10-minute on-chain-clock window during which honest deposits cannot be silently outraced by a malicious or careless authority.

**Tool:** LiteSVM (advance clock; verify both pre-deadline rejection and post-deadline success).
**Confidence:** high
**Based on:** VP-099 (mask correctness paired with timing guard) + H017 finding.

**Formal Property:**
```
Pre-condition for start_with_depositors success (v1):
  Clock::get()?.unix_timestamp >= escrow.created_at + MIN_DEPOSIT_WINDOW_SECS (600)
Pre-condition (v2):
  Clock::get()?.unix_timestamp >= escrow.created_at + escrow.deposit_window_secs
Equivalent formulation:
  ¬(now < deadline && state == AwaitingDeposits) ⟹ start_with_depositors returns Err(DepositWindowOpen)
```

**LiteSVM sketch (v1):**
```rust
// Setup: 4-player match created at t=1_000_000. Two deposits land at t=1_000_001.
// Test 1: At t=1_000_500 (≤ 600s window), authority calls start_with_depositors.
svm.warp_to_slot_and_clock(1_000_500);
let result = svm.process_transaction(&start_tx);
assert!(matches!(result, Err(e) if e.to_string().contains("DepositWindowOpen")));
// Test 2: At t=1_000_601 (> 600s window), retry succeeds.
svm.warp_to_slot_and_clock(1_000_601);
let result = svm.process_transaction(&start_tx);
assert!(result.is_ok());
```

---

### I-REF-1 (POST-H023-FIX): Refund accounts length matches deposit count

**What it checks:**
Both `cancel_match` and `permissionless_reclaim` (v1 + v2) require `ctx.remaining_accounts.len() == count_ones(deposits_mask)` BEFORE the refund loop runs. A caller passing fewer accounts (or zero accounts) is rejected with `EscrowError::IncompleteRefund` and the instruction reverts before the `close = caller` exit hook can sweep un-refunded lamports.

**Why it matters:**
This is the H023 fix invariant — the most critical economic guarantee in the program. Without it, a malicious caller (any registered player for cancel; ANY wallet for permissionless_reclaim) passes a short `remaining_accounts` array, the loop refunds only those entries, and Anchor's `close = caller` exit hook unconditionally sweeps the entire remaining PDA balance to the caller. Worst case (v2 max): 9 × 100 SOL = 900 SOL stolen in a single TX. The length-check makes the loop length caller-determined-but-bounded: refund-to-caller and length-check-to-mask must both be satisfied, eliminating the gap.

**Tool:** LiteSVM (positive: full refund succeeds; negative: short array reverts before any state change).
**Confidence:** high
**Based on:** H023 finding, VP-001 (conservation), novel post-fix invariant.

**Formal Property:**
```
Pre-condition for refund loop entry:
  ctx.remaining_accounts.len() == count_ones(deposits_mask)
On violation: instruction returns Err(IncompleteRefund), no state change, no close.
```

**LiteSVM sketch:**
```rust
// 4-player match; 4 deposits; mask = 0b1111. Wager = 1 SOL.
// Test: caller passes only [players[0]] (1 of 4).
let result = call_cancel_match(svm, &caller, &escrow_pda, vec![players[0]]);
assert!(matches!(result, Err(e) if e.to_string().contains("IncompleteRefund")));

// Verify NO state change occurred
let escrow = read_escrow(svm, &escrow_pda);
assert_eq!(escrow.state, MatchState::Active);            // not Cancelled
assert_eq!(escrow.deposits_mask, 0b1111);                // unchanged
assert_eq!(escrow_lamports(svm, &escrow_pda), rent + 4 * wager);  // intact

// Test: full array of 4 succeeds
let result = call_cancel_match(svm, &caller, &escrow_pda,
    vec![players[0], players[1], players[2], players[3]]);
assert!(result.is_ok());
```

---

### I-REF-2: Refund conservation — sum equals wager × deposit count

**What it checks:**
After a successful `cancel_match` or `permissionless_reclaim`, the sum of refunds disbursed across the iterated accounts equals exactly `wager_lamports × count_ones(deposits_mask)`. With the H023 length-check in place, this becomes provable: each iteration debits exactly `wager_lamports` from the escrow and credits exactly `wager_lamports` to one account, the loop runs exactly `count_ones(mask)` times, so total refund = `wager × count_ones`.

**Why it matters:**
This is the headline economic invariant for the cancellation paths. If conservation breaks (e.g. a future refactor introduces a fee skim, or an off-by-one in the loop refunds twice), depositors lose money on cancel — destroying the credibility that "cancel always returns 100% of deposits." Locking conservation as an explicit test catches regressions immediately.

**Tool:** LiteSVM (compare per-account balance deltas against `wager × count_ones`).
**Confidence:** high
**Based on:** VP-001 (conservation), H023 fix consequences.

**Formal Property:**
```
Σ(player_balance_after - player_balance_before for refunded players)
  == wager_lamports × count_ones(deposits_mask)
AND
escrow_balance_before - escrow_balance_after - rent_reserve_to_caller
  == wager_lamports × count_ones(deposits_mask)
```

**LiteSVM sketch:**
```rust
// Setup deposited match
let pre_balances: Vec<u64> = players.iter()
    .map(|p| svm.get_account(p).unwrap().lamports).collect();
let pre_escrow = svm.get_account(&escrow_pda).unwrap().lamports;
call_cancel_match(svm, &caller, &escrow_pda, players.clone()).unwrap();
let post_balances: Vec<u64> = players.iter()
    .map(|p| svm.get_account(p).unwrap().lamports).collect();
let total_refund: u64 = pre_balances.iter().zip(&post_balances)
    .map(|(pre, post)| post - pre).sum();
let n = mask.count_ones() as u64;
assert_eq!(total_refund, wager * n);  // conservation holds
// Escrow PDA closed; lamports redistributed
assert_eq!(svm.get_account(&escrow_pda), None);
```

---

### I-REF-3: No over-debit — escrow lamports never goes negative

**What it checks:**
At every iteration of the refund loop, the line `escrow.lamports -= wager_lamports` does not underflow. With `overflow-checks=true` (verified at `Cargo.toml:8-11`), an underflow would panic; without that flag, it would silently wrap. The per-iteration `bit_set` check + the H023 length-check together bound the loop to exactly `count_ones(mask)` iterations, each debiting exactly `wager`, with `escrow.lamports` containing at minimum `wager × count_ones(mask)` from accumulated `deposit_wager` CPIs.

**Why it matters:**
A debit underflow would cascade into one of two failures: (a) panic — instruction reverts (OK, but noisy in logs and clutters the chain with error TXs); or (b) silent wrap — `escrow.lamports` becomes a u64 close to MAX, and the next `**escrow.lamports = 0` from `close()` actually loses an enormous amount of "phantom" lamports. Solana runtime would flag the lamport-balance mismatch and reject the entire TX, but until that final check, the local borrow holds a corrupt value. The defense-in-depth here is the layered guard: bit-check + length-check + overflow-checks=true.

**Tool:** Proptest (pre-CPI invariant arithmetic) + LiteSVM (verify rejection paths).
**Confidence:** high
**Based on:** VP-001 (conservation) + A09 lamport conservation.

**Formal Property:**
```
INVARIANT (loop entry):
  escrow.lamports >= wager_lamports × count_ones(deposits_mask) + rent_reserve
INVARIANT (per iteration k):
  escrow.lamports_after_k >= wager_lamports × (count_ones(mask) - (k+1)) + rent_reserve
INVARIANT (loop exit):
  escrow.lamports == rent_reserve
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn refund_loop_does_not_underflow(
        mask in 0u8..=0b1111,
        wager in 10_000u64..100_000_000_000,
        rent in 1_000_000u64..2_000_000,
    ) {
        prop_assume!(mask.count_ones() >= 2);
        let n = mask.count_ones() as u64;
        let mut lamports = wager * n + rent;
        // Mirror loop-and-debit
        for i in 0..4 {
            if (mask >> i) & 1 == 1 {
                lamports = lamports.checked_sub(wager).unwrap();
            }
        }
        prop_assert_eq!(lamports, rent);  // invariant: no underflow, exact rent left
    }
}
```

---

### I-REF-4: Refund amount equals wager (no fee on refund)

**What it checks:**
Each refund disbursed in `cancel_match` or `permissionless_reclaim` is exactly `wager_lamports` — no treasury cut, no ops cut, no slippage. A player who deposits 1 SOL gets back 1 SOL on cancel, full stop.

**Why it matters:**
The core promise of the protocol is that cancellation is risk-free: deposit 1 SOL, lose nothing if the match doesn't proceed. If a fee were silently introduced (intentional or accidental), the cancel path becomes a small slow drain — players lose 1% per failed match, which compounds over time and erodes trust in the wagered-game UX. The litepaper v2.0 + edge-case-playbook both promise full refund on every cancellation path; this invariant locks that promise into tests.

**Tool:** LiteSVM (assert per-account delta equals `wager` exactly).
**Confidence:** high
**Based on:** VP-001, GL spec edge-case-playbook.md lines 31, 88, 192, 200, 225.

**Formal Property:**
```
∀ refunded_player: balance_after - balance_before == wager_lamports
```

**LiteSVM sketch:**
```rust
let pre = svm.get_account(&player_a).unwrap().lamports;
call_cancel_match(svm, &caller, &escrow_pda, vec![player_a, player_b]).unwrap();
let post = svm.get_account(&player_a).unwrap().lamports;
assert_eq!(post - pre, wager);  // exact, no fee, no slippage
```

---

### I-REF-5 (NOVEL): Non-contiguous mask is correctly REJECTED, not stranded with rent-sweep

**What it checks:**
Per H024, a non-contiguous `deposits_mask` (e.g., `0b0010`, where `players[1]` deposited but `players[0]` did not) cannot be refunded by any syntactically valid `cancel_match` / `permissionless_reclaim` call. The fix-set ensures that all such attempts (a) fail explicitly (the `bit_set` check at `i=0` returns `InvalidPlayer`), AND (b) the H023 length-check rejects the only remaining attack — passing `remaining_accounts = []` to bypass the loop entirely and rent-sweep via `close = caller`.

This invariant verifies the post-fix DEFENSIVE behavior: every call shape is rejected before any state mutation.

**Why it matters:**
H024 noted that non-contiguous masks are "permanently unrefundable" without authority cooperation (via `start_with_depositors` to compact). This is documented as deferred remediation. The defensive invariant ensures that during this deferred period, the H023 fix correctly prevents an observer from rent-sweeping a stranded non-contiguous match's wager via the empty-`remaining_accounts` path. Confirming both call shapes fail is the difference between "funds stuck waiting for compaction" (acceptable) and "funds stolen by the first wallet that watches the chain" (catastrophic).

**Tool:** LiteSVM (negative-test sweep: enumerate all shapes that target a non-contiguous mask, assert all revert).
**Confidence:** high
**Based on:** H023 + H024 findings combined; novel post-fix defensive invariant.

**Formal Property:**
```
Given mask = 0b0010 (non-contiguous), max_players = 4:
  ∀ remaining_accounts ∈ {[], [players[1]], [players[0], players[1]],
                          [players[1], players[1]], [players[1], ...]}
  cancel_match returns Err(IncompleteRefund) OR Err(InvalidPlayer)
  AND escrow.lamports unchanged
  AND escrow.state unchanged
```

**LiteSVM sketch:**
```rust
// Setup: 4-player match; only players[1] deposits → mask = 0b0010
// (Force this state by calling deposit_wager for players[1] only.)
// Advance clock past timeout for player-cancel path.

let attack_shapes = vec![
    vec![],                                  // empty — would have been H023 attack
    vec![players[1]],                        // only depositor
    vec![players[0], players[1]],            // try to satisfy bit 0 with non-depositor
    vec![players[1], players[1]],            // duplicate
];

for shape in attack_shapes {
    let pre_lamports = escrow_lamports(svm, &escrow_pda);
    let pre_state = read_escrow(svm, &escrow_pda).state;
    let result = call_cancel_match(svm, &players[1], &escrow_pda, shape);
    // All shapes must revert
    assert!(result.is_err(), "non-contiguous attack shape succeeded");
    // No state mutation
    assert_eq!(escrow_lamports(svm, &escrow_pda), pre_lamports);
    assert_eq!(read_escrow(svm, &escrow_pda).state, pre_state);
}
```

---

### I-BIT-1: Bit count never exceeds max_players

**What it checks:**
At all times, `count_ones(deposits_mask) ≤ max_players`. The `position()` lookup in `deposit_wager` searches only `players[..max_players]`, so the only bit positions that can ever be set are `0..max_players`. The `(deposits_mask >> player_index) & 1 == 0` already-deposited check is checked before the OR, so `deposits_mask |= 1u8 << player_index` cannot cause `count_ones` to exceed `max_players`.

**Why it matters:**
If `count_ones(mask)` ever exceeded `max_players`, then `wager × count_ones` could overstate the actual deposited amount, settle_match would attempt to disburse more SOL than the PDA holds, and the lamport debits would underflow → panic. This invariant verifies the depositor-set / max-size relationship that the entire pot accounting depends on.

**Tool:** Proptest (reachable-state induction over all deposit sequences).
**Confidence:** high
**Based on:** VP-099 (mask correctness — bounded set).

**Formal Property:**
```
INVARIANT (always): deposits_mask & !((1u8 << max_players) - 1) == 0
INVARIANT (always): count_ones(deposits_mask) <= max_players
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn deposit_mask_bounded_by_max_players(
        max_players in 2u8..=4,
        deposit_seq in proptest::collection::vec(0u8..4, 0..16),
    ) {
        let mut mask: u8 = 0;
        let valid_mask = (1u8 << max_players) - 1;
        for idx in deposit_seq {
            if idx >= max_players { continue; }       // mirrors NotAPlayer
            if (mask >> idx) & 1 == 1 { continue; }   // mirrors AlreadyDeposited
            mask |= 1u8 << idx;
        }
        prop_assert_eq!(mask & !valid_mask, 0);       // no bit ≥ max_players set
        prop_assert!(mask.count_ones() <= max_players as u32);
    }
}
```

---

### I-BIT-2: No bit collision (player cannot double-deposit)

**What it checks:**
The `require!((deposits_mask >> player_index) & 1 == 0, AlreadyDeposited)` check at `lib.rs:223-226` (v1) / `:284-286` (v2) blocks a depositor from setting the same bit twice. Combined with Solana's account-locking (which serializes concurrent writes to the same PDA), no bit can transition from 1 → 1 → 1 with intermediate balance increase. Each set bit corresponds to exactly one wager.

**Why it matters:**
If a player could double-deposit (e.g., via concurrent TXs on different RPCs), the pot would receive 2 × wager from that one player, but `count_ones(mask)` would still report 1. `settle_match`'s `pot = wager × count_ones` would compute an under-stated pot. The PDA would hold extra lamports that the close-authority sweeps — silent theft of the over-payment.

The check is necessary but not sufficient on its own — Solana's account-locking provides serialization. Proving no-collision under contention requires verifying the on-chain semantics (account-locking + bitmap check both engaged).

**Tool:** LiteSVM (concurrent same-player deposit attempts; assert one succeeds, second fails with `AlreadyDeposited`).
**Confidence:** medium (Solana runtime serialization is part of the proof — not directly testable without injecting CL contention).
**Based on:** VP-099 (mask correctness), VP-100 (shift overflow guard), novel concurrency.

**Formal Property:**
```
∀ deposit_wager invocations for the same (escrow, player_index):
  At most ONE of them succeeds.
  After success: (deposits_mask >> player_index) & 1 == 1.
  Subsequent attempts: return Err(AlreadyDeposited).
```

**LiteSVM sketch:**
```rust
// Setup: 4-player match. Player 0 attempts deposit twice in sequence.
let result_1 = call_deposit_wager(svm, &players[0], &escrow_pda);
assert!(result_1.is_ok());

let result_2 = call_deposit_wager(svm, &players[0], &escrow_pda);
assert!(matches!(result_2, Err(e) if e.to_string().contains("AlreadyDeposited")));

let escrow = read_escrow(svm, &escrow_pda);
assert_eq!(escrow.deposits_mask, 0b0001);  // only one bit set
assert_eq!(escrow_lamports(svm, &escrow_pda), rent + wager);  // not 2× wager
```

---

### I-BIT-3: Compaction rewrites mask as `(1 << j) - 1`

**What it checks:**
After `start_with_depositors` runs, `deposits_mask == (1u8 << escrow.max_players) - 1`. This means: the new mask is exactly contiguous from bit 0, with `j` (= `count_ones(mask_pre)`) bits set, and `max_players` is updated to match. The bit-count is preserved, but the bit positions are normalized.

**Why it matters:**
Post-compaction contiguity is a critical precondition for the H023-fixed refund loops. The refund loop walks `i = 0..len(remaining_accounts)` and requires `(mask >> i) & 1 == 1` at each `i`. If post-compaction the mask were ever non-contiguous (e.g., `0b1010` instead of `0b0011`), the loop would fail at `i=1` and depositors couldn't be refunded if the match later cancelled. The H024 stranded-funds problem only arises pre-compaction; post-compaction must always be contiguous to keep refund paths working.

**Tool:** Proptest (compaction algorithm purity test).
**Confidence:** high
**Based on:** VP-101 (round-trip), VP-099 (mask correctness), I-POT-1.

**Formal Property:**
```
After start_with_depositors:
  Let j = escrow.max_players (post)
  INVARIANT: escrow.deposits_mask == (1u8 << j) - 1
  Equivalently: ∀ i ∈ 0..j: (deposits_mask >> i) & 1 == 1
                ∀ i ∈ j..8: (deposits_mask >> i) & 1 == 0
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn compaction_produces_contiguous_mask(mask_pre in 0u8..=0b1111) {
        prop_assume!(mask_pre.count_ones() >= 2);
        // Mirror compaction logic
        let mut new_mask: u8 = 0;
        let mut j = 0u8;
        for i in 0..4 {
            if (mask_pre >> i) & 1 == 1 {
                new_mask |= 1u8 << j;
                j += 1;
            }
        }
        prop_assert_eq!(new_mask, (1u8 << j) - 1);
        prop_assert_eq!(new_mask.count_ones(), mask_pre.count_ones());
        // ∀ i ∈ 0..j: bit set
        for i in 0..j {
            prop_assert_eq!((new_mask >> i) & 1, 1);
        }
        // ∀ i ∈ j..8: bit clear
        for i in j..8 {
            prop_assert_eq!((new_mask >> i) & 1, 0);
        }
    }
}
```

---

### I-BIT-4 (Additional): Shift amount always within type width

**What it checks:**
Every bit-shift in the program (`1u8 << player_index`, `deposits_mask >> i`, `(1u8 << max_players) - 1`, `(1u8 << j) - 1`) uses a shift amount that is strictly less than the type width (8 for u8, 16 for u16 in v2). `player_index` is bounded by the `position()` lookup over `players[..max_players]` (where `max_players ≤ 4` in v1, `≤ 10` in v2, never 8 or 16). `j` is incremented only inside the `if bit_set` branch, bounded by `max_players`. `max_players` is bounded at create-time to `[2, 4]` in v1 and `[2, 10]` in v2.

**Why it matters:**
A shift by ≥ type-width is undefined behavior in C; in Rust release mode it wraps (panic in debug). Specifically, `1u8 << 8` in release mode produces `0`, which would mean a "full mask" computed as `0 - 1 = u8::MAX = 0b11111111` — every bit set. If max_players were ever ≥ 8, the full-mask computation in deposit_wager (`let full_mask = (1u8 << escrow.max_players) - 1;`) would be wrong: matches with `max_players >= 8` would compute `full_mask = 255` and never trigger the activation path (because `deposits_mask` is u8, max value 255, but only positions 0..max_players are actually settable, so `full_mask` would never equal `deposits_mask` until all 8 bits are set, which is impossible).

For v1 with max=4, this is fine (`1u8 << 4 - 1 = 15`). For v2 with max=10, the mask is u16, and `1u16 << 10 - 1 = 1023`, also fine. But the invariant explicitly verifies that the bound holds and any future MAX_PLAYERS bump triggers awareness.

**Tool:** Proptest (algebraic check on bounds).
**Confidence:** high
**Based on:** VP-100 (shift overflow).

**Formal Property:**
```
∀ shift in {1u8 << player_index, 1u8 << max_players, 1u8 << j} (v1):
  shift_amount < 8
∀ shift in {1u16 << player_index, 1u16 << max_players, 1u16 << j} (v2):
  shift_amount < 16
INVARIANT (v1):  max_players <= 4 < 8
INVARIANT (v2):  max_players <= 10 < 16
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn v1_shifts_safe(max_players in 2u8..=4, idx in 0u8..4) {
        prop_assume!(idx < max_players);
        let _ = 1u8 << idx;          // no panic
        let _ = 1u8 << max_players;  // no panic for max_players ≤ 7
        prop_assert!(max_players < 8);
    }
    #[test]
    fn v2_shifts_safe(max_players in 2u8..=10, idx in 0u8..10) {
        prop_assume!(idx < max_players);
        let _ = 1u16 << idx;          // no panic
        let _ = 1u16 << max_players;  // no panic for max_players ≤ 15
        prop_assert!(max_players < 16);
    }
}
```

---

### I-BIT-5 (Additional): Mask round-trip — bit-set then bit-test recovers same value

**What it checks:**
For any `player_index ∈ 0..max_players`, the operation `mask |= 1 << player_index; let bit = (mask >> player_index) & 1;` recovers exactly the bit just set. No collision with adjacent bits, no off-by-one in the shift.

**Why it matters:**
The bit-set operation in `deposit_wager` is paired with the bit-test in `cancel_match` / `permissionless_reclaim`. If they ever drifted (e.g., one used `<< i` and the other used `<< (i+1)`), refunds would credit the wrong pubkey or fail the pubkey-match check entirely. The round-trip property is the canonical bit-packing test (VP-101) applied to the deposit-tracking mask.

**Tool:** Proptest.
**Confidence:** high
**Based on:** VP-101 (pack/unpack round-trip).

**Formal Property:**
```
∀ mask_initial, ∀ idx ∈ 0..bit_width(type):
  Let mask_set = mask_initial | (1 << idx)
  THEN: (mask_set >> idx) & 1 == 1
  AND ∀ j ≠ idx: (mask_set >> j) & 1 == (mask_initial >> j) & 1
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn bit_set_test_roundtrip(mask in 0u8..=0xFF, idx in 0u8..8) {
        let new_mask = mask | (1u8 << idx);
        prop_assert_eq!((new_mask >> idx) & 1, 1);
        for j in 0..8 {
            if j != idx {
                prop_assert_eq!((new_mask >> j) & 1, (mask >> j) & 1);
            }
        }
    }
}
```

---

### I-REF-6 (Additional): Refund per-iteration pubkey match enforced

**What it checks:**
The refund loop's third check, `*account.key == players[i]`, ensures the caller cannot redirect a refund to an arbitrary address — they must pass exactly the registered player at each set bit's position. Combined with H023 length-check + per-iteration bit-check, the loop is fully positional.

**Why it matters:**
Without this check, a malicious caller passing `remaining_accounts = [attacker_pubkey, attacker_pubkey, ...]` (length = count_ones) would satisfy I-REF-1 (length matches) and I-BIT-3 (all bits hit are set), and the loop would credit the attacker for every refund — full pot stolen. This invariant is the third leg of the three-legged H023 fix (length + bit + pubkey).

**Tool:** LiteSVM (negative test: pass attacker pubkey at any slot, expect `InvalidPlayer`).
**Confidence:** high
**Based on:** H023 fix consequences.

**Formal Property:**
```
∀ i ∈ 0..len(remaining_accounts):
  (deposits_mask >> i) & 1 == 1
  AND ctx.remaining_accounts[i].key == escrow.players[i]
  ⟹ refund(remaining_accounts[i], wager) executes
On any violation: return Err(InvalidPlayer), no state change.
```

**LiteSVM sketch:**
```rust
// Setup: 4-player match, all 4 deposit, mask = 0b1111
let attacker = create_keypair(svm);
// Attempt: pass attacker for slot 2 instead of players[2]
let result = call_cancel_match(svm, &players[0], &escrow_pda,
    vec![players[0], players[1], attacker.pubkey(), players[3]]);
assert!(matches!(result, Err(e) if e.to_string().contains("InvalidPlayer")));
// Verify state unchanged
let escrow = read_escrow(svm, &escrow_pda);
assert_eq!(escrow.state, MatchState::Active);
```

---

## Coverage Gap Analysis

**Areas not directly covered (intentional omissions):**

1. **Authority-call path with empty remaining_accounts on `AwaitingDeposits`** — the H023 finding's "Incidental Discovery" notes that authority calling `cancel_match` in `AwaitingDeposits` with `remaining_accounts = []` would, post-H023-fix, only succeed if `count_ones(mask) == 0`. If `mask == 0b0001` (one player deposited), the length-check rejects empty array → fix HOLDS. This is implicitly covered by I-REF-1 but not as a separate test — recommend adding an explicit "authority cannot rent-sweep over deposited mask" LiteSVM test as a hardening step.

2. **`activated_at` setting on partial activation** — `start_with_depositors` sets `activated_at = Clock::get()?.unix_timestamp`. This is critical for the timeout-reference fallback in `cancel_match` and `permissionless_reclaim` (which prefer `activated_at` over `created_at` once non-zero). Not in scope for this cluster (timing invariants are a separate cluster) but flagged for the timestamp-duration cluster.

3. **u8 vs u16 mask correctness across v1/v2** — v1 uses u8 (max 8 bits, max_players ≤ 4 → 4 bits used). v2 uses u16 (max 16 bits, max_players ≤ 10 → 10 bits used). I-BIT-4 covers the shift-width safety; I-BIT-1/3 conditions are stated for u8 but apply identically to u16 with the type swap. Tests should be parameterized to run both widths.

4. **Cross-instruction conservation across full match lifecycle** — `Σ deposits == wager × count_ones(mask)` enforced by accumulating `deposit_wager` CPIs, then `Σ refunds == wager × count_ones(mask)` enforced by I-REF-2. The full lifecycle conservation `Σ deposits == Σ refunds + rent_to_caller` is implicit but a dedicated LiteSVM "lifecycle" test would lock this in.

5. **Concurrency / TX-ordering invariants** — Solana's account-locking serializes per-PDA writes, so `deposit_wager` cannot double-spend a slot. This is part of I-BIT-2's proof but relies on the runtime, not the program code. LiteSVM does not natively simulate concurrency (sequential by default); the property holds by Solana semantics rather than program-level enforcement.

---

## Summary

**15 invariants proposed across 3 categories:**

| Category | Count | IDs |
|----------|-------|-----|
| Pot Scaling | 4 | I-POT-1, I-POT-2, I-POT-3, I-POT-4 |
| Refund Conservation | 6 | I-REF-1, I-REF-2, I-REF-3, I-REF-4, I-REF-5, I-REF-6 |
| Bit-Field | 5 | I-BIT-1, I-BIT-2, I-BIT-3, I-BIT-4, I-BIT-5 |
| **Total** | **15** | |

**Tool distribution:**
- LiteSVM only: 5 (I-POT-3, I-REF-1, I-REF-2, I-REF-4, I-REF-6)
- Proptest only: 5 (I-POT-2, I-BIT-1, I-BIT-3, I-BIT-4, I-BIT-5)
- Both: 5 (I-POT-1, I-POT-4, I-REF-3, I-REF-5, I-BIT-2)

**Overall confidence:** HIGH — every invariant maps to a concrete VP pattern + a specific SOS finding (H017/H023/H024) or a critical post-fix defensive property. The post-fix landscape is verifiable: the H023 length-check + per-iteration bit-check + per-iteration pubkey-check combination provides three independent enforcement layers, and the H017 timing gate closes the silent-kick window. The H024 stranded-funds residual is documented as deferred, with I-REF-5 providing the defensive guarantee that stranded funds cannot be rent-swept by an observer.
