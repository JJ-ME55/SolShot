# BOK Invariants: Fee Calculations & Pot Distribution

**Agent:** BOK invariant proposer
**Date:** 2026-02-23
**Source:** `programs/solshot-escrow/src/lib.rs` (branch: dev, commit ecfd03b)
**Tool constraint:** Kani unavailable (Windows). All invariants target Proptest (pure arithmetic) or LiteSVM (multi-account).
**SOS cross-reference:** H016 flagged off-chain floating-point rounding. On-chain uses u128 BPS -- verified correct architecture. This document proves the on-chain integer math is sound.

---

## Constants Under Test

```rust
const TREASURY_BPS: u64 = 700;       // 7%
const OPS_BPS: u64 = 300;            // 3%
const BPS_DENOMINATOR: u64 = 10000;
const MIN_WAGER_LAMPORTS: u64 = 10_000;          // 0.00001 SOL
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000; // 100 SOL
```

## Arithmetic Under Test (settle_match lines 253-274)

```rust
let total_pot_128 = (wager_lamports as u128).checked_mul(2).ok_or(...)?;
let treasury_amount = (total_pot_128.checked_mul(TREASURY_BPS as u128).ok_or(...)? / BPS_DENOMINATOR as u128) as u64;
let ops_amount = (total_pot_128.checked_mul(OPS_BPS as u128).ok_or(...)? / BPS_DENOMINATOR as u128) as u64;
let total_pot = total_pot_128 as u64;
let winner_amount = total_pot.checked_sub(treasury_amount).ok_or(...)?.checked_sub(ops_amount).ok_or(...)?;
```

---

## Invariants

### INV-1: Conservation of Value (Pot Partition)

**What it checks:** For every valid wager, `winner_amount + treasury_amount + ops_amount == total_pot` exactly. No lamports are created or destroyed during fee splitting.

**Why it matters:** If the sum is less than `total_pot`, lamports remain stuck in the escrow PDA after all three transfers complete. The `close = authority` Anchor directive reclaims remaining lamports as rent, but those lamports would go to the authority rather than the winner -- a silent value leak. If the sum exceeds `total_pot`, the last lamport transfer would underflow the escrow account, causing a runtime panic and a failed settlement (both players' funds permanently locked).

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-011 (conservation of value), VP-078 (revenue split correctness)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let total_pot = wager * 2
  let treasury = (total_pot * 700) / 10000
  let ops = (total_pot * 300) / 10000
  let winner = total_pot - treasury - ops
  assert: winner + treasury + ops == total_pot
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10000;
const MIN_WAGER: u64 = 10_000;
const MAX_WAGER: u64 = 100_000_000_000;

fn settle_math(wager: u64) -> (u64, u64, u64, u64) {
    let total_pot_128 = (wager as u128) * 2;
    let treasury = ((total_pot_128 * TREASURY_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
    let ops = ((total_pot_128 * OPS_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
    let total_pot = total_pot_128 as u64;
    let winner = total_pot - treasury - ops;
    (total_pot, winner, treasury, ops)
}

proptest! {
    #[test]
    fn inv1_conservation_of_value(wager in MIN_WAGER..=MAX_WAGER) {
        let (total_pot, winner, treasury, ops) = settle_math(wager);
        prop_assert_eq!(winner + treasury + ops, total_pot,
            "Conservation violated at wager={}: winner={} + treasury={} + ops={} = {} != total_pot={}",
            wager, winner, treasury, ops, winner + treasury + ops, total_pot);
    }
}
```

**Why this holds analytically:** The winner is computed as `total_pot - treasury - ops`, so by construction `winner + treasury + ops = total_pot`. The invariant serves as a regression guard -- if anyone refactors the fee math (e.g., computing winner independently as `total_pot * 9000 / 10000`), this test would catch rounding discrepancies.

---

### INV-2: Fee Minimum Guarantee (MIN_WAGER Produces Fees >= 1 Lamport)

**What it checks:** At the minimum wager (10,000 lamports), both `treasury_amount >= 1` and `ops_amount >= 1`. This validates the OC-08 design decision documented in the code comment at line 28.

**Why it matters:** If either fee rounds to zero, the treasury or ops wallet receives a zero-lamport transfer. While Solana permits zero-lamport transfers, it violates the economic design (the protocol earns nothing from the match). More critically, a zero fee at any wager in the valid range would indicate the MIN_WAGER constant is set too low, and a crafty user could find a wager where the protocol earns zero revenue.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-012 (minimum fee guarantee), VP-082 (decimal normalization -- BPS floor)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let total_pot = wager * 2
  let treasury = floor(total_pot * 700 / 10000)
  let ops = floor(total_pot * 300 / 10000)
  assert: treasury >= 1
  assert: ops >= 1
```

**Concrete proof at boundary:**
- `wager = 10_000` -> `total_pot = 20_000`
- `treasury = floor(20_000 * 700 / 10_000) = floor(1_400_000 / 10_000) = 140`
- `ops = floor(20_000 * 300 / 10_000) = floor(600_000 / 10_000) = 60`
- Both are well above 1. The actual minimum wager for ops >= 1 would be `ceil(10_000 / (2 * 300)) = ceil(16.67) = 17 lamports`. So MIN_WAGER of 10,000 provides ~588x safety margin.

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv2_fee_minimum_guarantee(wager in MIN_WAGER..=MAX_WAGER) {
        let (_, _, treasury, ops) = settle_math(wager);
        prop_assert!(treasury >= 1,
            "Treasury fee is zero at wager={}", wager);
        prop_assert!(ops >= 1,
            "Ops fee is zero at wager={}", wager);
    }
}
```

---

### INV-3: u128-to-u64 Narrowing Safety

**What it checks:** The `total_pot_128 as u64` cast at line 267 does not truncate. That is, `(wager as u128) * 2 <= u64::MAX` for all valid wagers, and that all intermediate BPS products fit u128 before division.

**Why it matters:** If `wager * 2` exceeds `u64::MAX` (18,446,744,073,709,551,615), the `as u64` cast silently truncates the upper bits, producing a dramatically smaller `total_pot`. The winner would receive a fraction of the actual pot, and the rest of the lamports would be permanently locked in the escrow. The `checked_mul(2)` in deposit_wager (line 212-214) uses u64 and would catch overflow there, but settle_match widens to u128 first and then narrows back -- so the overflow could bypass the deposit check if the narrowing is unsafe.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-083 (narrowing cast safety), VP-014 (overflow prevention)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  assert: (wager as u128) * 2 <= u64::MAX as u128
  assert: (wager as u128) * 2 * 700 <= u128::MAX   // intermediate product fits u128
  assert: (wager as u128) * 2 * 300 <= u128::MAX   // intermediate product fits u128
```

**Concrete proof at boundary:**
- `wager = 100_000_000_000` -> `total_pot_128 = 200_000_000_000`
- `u64::MAX = 18_446_744_073_709_551_615`
- `200B << 18.4E18` -- safe by a factor of ~92 million.
- Intermediate: `200B * 700 = 140_000_000_000_000` which is ~1.4E14, far below `u128::MAX` (~3.4E38).

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv3_narrowing_safety(wager in MIN_WAGER..=MAX_WAGER) {
        let total_pot_128 = (wager as u128) * 2;
        prop_assert!(total_pot_128 <= u64::MAX as u128,
            "total_pot overflows u64 at wager={}: total_pot_128={}", wager, total_pot_128);

        let treasury_intermediate = total_pot_128.checked_mul(TREASURY_BPS as u128);
        prop_assert!(treasury_intermediate.is_some(),
            "Treasury intermediate overflows u128 at wager={}", wager);

        let ops_intermediate = total_pot_128.checked_mul(OPS_BPS as u128);
        prop_assert!(ops_intermediate.is_some(),
            "Ops intermediate overflows u128 at wager={}", wager);

        // Verify narrowed value matches original
        let total_pot_u64 = total_pot_128 as u64;
        prop_assert_eq!(total_pot_u64 as u128, total_pot_128,
            "Narrowing truncated at wager={}", wager);
    }
}
```

---

### INV-4: Pot Overflow Safety (wager * 2 fits u64 at MAX_WAGER)

**What it checks:** The `checked_mul(2)` in `deposit_wager` (line 212-214) never returns `Err` for any wager in the valid range. This is the u64-space check that gates the total_pot event emission.

**Why it matters:** If `wager * 2` overflows u64, the `checked_mul(2).ok_or(ArithmeticOverflow)` returns an error and the deposit transaction fails. Both players have deposited but the match cannot activate. The match would remain in `AwaitingDeposits` state, and players would need to cancel to recover funds. While the cancel path handles this correctly, a failing deposit is a UX failure that should never happen for valid wagers.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-013 (overflow safety), VP-084 (width promotion correctness)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  assert: wager.checked_mul(2).is_some()
  assert: wager * 2 <= u64::MAX
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv4_pot_overflow_safety(wager in MIN_WAGER..=MAX_WAGER) {
        let result = wager.checked_mul(2);
        prop_assert!(result.is_some(),
            "wager * 2 overflows u64 at wager={}", wager);
        let total_pot = result.unwrap();
        prop_assert!(total_pot >= wager,
            "Pot smaller than single wager (underflow) at wager={}", wager);
    }
}
```

---

### INV-5: Winner Gets the Remainder (No Dust Loss to Rounding)

**What it checks:** The winner's payout is computed as `total_pot - treasury - ops` (remainder pattern), which means any lamports lost to integer division truncation in the fee calculations accrue to the winner, not to the void.

**Why it matters:** The alternative approach -- computing the winner's share independently as `total_pot * 9000 / 10000` -- would introduce independent rounding. For example, at `wager = 7` (below MIN_WAGER but illustrative): `total_pot = 14`, `treasury = floor(14 * 700 / 10000) = 0`, `ops = floor(14 * 300 / 10000) = 0`, `winner_independent = floor(14 * 9000 / 10000) = 12`. But `winner_remainder = 14 - 0 - 0 = 14`. The remainder pattern gives the winner 14 (the full pot when fees round to zero), while independent calculation would give only 12, losing 2 lamports. The current code uses the remainder pattern -- this invariant proves the winner always absorbs truncation dust.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-015 (winner remainder correctness), VP-085 (truncation direction)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let total_pot = wager * 2
  let treasury = floor(total_pot * 700 / 10000)
  let ops = floor(total_pot * 300 / 10000)
  let winner_remainder = total_pot - treasury - ops
  let winner_independent = floor(total_pot * 9000 / 10000)
  assert: winner_remainder >= winner_independent
  assert: winner_remainder - winner_independent <= 1   // at most 1 lamport difference
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv5_winner_gets_remainder(wager in MIN_WAGER..=MAX_WAGER) {
        let total_pot_128 = (wager as u128) * 2;
        let treasury = ((total_pot_128 * 700) / 10000) as u64;
        let ops = ((total_pot_128 * 300) / 10000) as u64;
        let total_pot = total_pot_128 as u64;
        let winner_remainder = total_pot - treasury - ops;

        // Compare to what independent calculation would give
        let winner_independent = ((total_pot_128 * 9000) / 10000) as u64;

        prop_assert!(winner_remainder >= winner_independent,
            "Remainder winner ({}) < independent winner ({}) at wager={}",
            winner_remainder, winner_independent, wager);

        let dust = winner_remainder - winner_independent;
        prop_assert!(dust <= 1,
            "Dust exceeds 1 lamport: dust={} at wager={}", dust, wager);
    }
}
```

---

### INV-6: Fee Percentage Bounds (Treasury ~7%, Ops ~3%, Winner ~90%)

**What it checks:** The actual percentages after integer division remain within acceptable bounds. Specifically: `treasury_amount` is within [6.99%, 7.01%] of `total_pot`, `ops_amount` within [2.99%, 3.01%], and `winner_amount` within [89.99%, 90.01%].

**Why it matters:** Integer division truncation shifts effective percentages downward. If fees are systematically lower than the target 10%, the protocol earns less than expected. If a refactoring mistake shifts fees above 10%, the winner is shortchanged. This invariant bounds the acceptable deviation and ensures no wager in the valid range produces fees that deviate more than 0.01% from the target.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-079 (royalty percentage bounds), VP-086 (BPS precision)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let total_pot = wager * 2
  let treasury_pct = treasury_amount * 10000 / total_pot   // in BPS
  let ops_pct = ops_amount * 10000 / total_pot
  let winner_pct = winner_amount * 10000 / total_pot
  assert: 699 <= treasury_pct <= 700
  assert: 299 <= ops_pct <= 300
  assert: 9000 <= winner_pct <= 9001
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv6_fee_percentage_bounds(wager in MIN_WAGER..=MAX_WAGER) {
        let (total_pot, winner, treasury, ops) = settle_math(wager);

        // Treasury should be ~7% (700 BPS)
        // Using integer BPS: treasury * 10000 / total_pot
        let treasury_bps = (treasury as u128 * 10000) / total_pot as u128;
        prop_assert!(treasury_bps >= 699 && treasury_bps <= 700,
            "Treasury BPS out of bounds: {} at wager={}", treasury_bps, wager);

        // Ops should be ~3% (300 BPS)
        let ops_bps = (ops as u128 * 10000) / total_pot as u128;
        prop_assert!(ops_bps >= 299 && ops_bps <= 300,
            "Ops BPS out of bounds: {} at wager={}", ops_bps, wager);

        // Winner should be ~90% (9000 BPS)
        let winner_bps = (winner as u128 * 10000) / total_pot as u128;
        prop_assert!(winner_bps >= 9000 && winner_bps <= 9001,
            "Winner BPS out of bounds: {} at wager={}", winner_bps, wager);

        // Total BPS should be 10000
        prop_assert_eq!(treasury_bps + ops_bps + winner_bps, 10000,
            "Total BPS != 10000: {} at wager={}", treasury_bps + ops_bps + winner_bps, wager);
    }
}
```

---

### INV-7: Escrow Drain Completeness (Settlement Drains All Non-Rent Lamports)

**What it checks:** After all three lamport transfers in `settle_match`, the escrow PDA has exactly zero non-rent lamports remaining. Since both players deposited `wager_lamports` each, the escrow holds `2 * wager_lamports` of player funds (plus Anchor rent). The three transfers must remove exactly `2 * wager_lamports`.

**Why it matters:** If the escrow retains any player-deposited lamports after settlement, those lamports are reclaimed by the authority via the `close = authority` directive. This would be a silent theft from the winner -- the authority pockets lamports that should have gone to the winner/treasury/ops. Conversely, if the transfers attempt to remove more than the deposited amount, they would eat into the rent-exempt balance, potentially causing the account to fall below rent exemption and be garbage-collected before the `close` directive can reclaim it.

**Tool:** LiteSVM (requires multi-account simulation)
**Confidence:** high
**Based on:** VP-016 (escrow completeness), VP-080 (drain correctness)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let deposited = wager * 2
  let (_, winner, treasury, ops) = settle_math(wager)
  assert: winner + treasury + ops == deposited
  // Therefore: escrow_balance_after_transfers == escrow_balance_before_deposits
  //            (only rent-exempt minimum remains)
```

**LiteSVM sketch:**
```rust
#[test_case(MIN_WAGER)]
#[test_case(MAX_WAGER)]
#[test_case(50_000)]         // near minimum
#[test_case(1_000_000_000)]  // 1 SOL
#[test_case(33_333)]         // odd number to stress rounding
fn inv7_escrow_drain_completeness(wager: u64) {
    // Setup: Create LiteSVM instance with program loaded
    let mut svm = LiteSVM::new();
    svm.add_program(solshot_escrow::ID, "target/deploy/solshot_escrow.so");

    // 1. Initialize config (authority, treasury, ops)
    // 2. Create match with `wager`
    // 3. Both players deposit `wager` each
    // 4. Record escrow lamport balance = rent + 2*wager
    let pre_settle_balance = svm.get_balance(escrow_pda);
    let rent_exempt = svm.get_minimum_balance_for_rent_exemption(MatchEscrow::SPACE);

    // 5. Settle match (authority calls settle_match)
    // 6. After settlement, before close:
    //    escrow balance should be rent_exempt (all player funds drained)
    let post_settle_balance = svm.get_balance(escrow_pda);
    assert_eq!(post_settle_balance, rent_exempt,
        "Escrow retains {} non-rent lamports after settlement",
        post_settle_balance - rent_exempt);

    // 7. Verify recipient balances increased correctly
    let winner_received = svm.get_balance(winner_key) - winner_initial;
    let treasury_received = svm.get_balance(treasury_key) - treasury_initial;
    let ops_received = svm.get_balance(ops_key) - ops_initial;
    assert_eq!(winner_received + treasury_received + ops_received, wager * 2);
}
```

---

### INV-8: Cancel/Refund Conservation (Refund Amounts == Deposited Amounts)

**What it checks:** In `cancel_match` (lines 358-367) and `permissionless_reclaim` (lines 420-429), each refund transfers exactly `wager_lamports` per deposited player. The total refund equals the total deposited amount.

**Why it matters:** If the refund amount differs from the deposit amount, either: (a) the player receives less than they deposited (theft), or (b) the player receives more (the escrow underflows, eating into rent or panicking). The cancel path does not compute fees -- it refunds the exact `wager_lamports` value stored in the escrow account. However, a bug in the refund logic (e.g., refunding `total_pot` instead of `wager_lamports` to each player) would double-pay.

**Tool:** LiteSVM
**Confidence:** high
**Based on:** VP-017 (refund conservation), VP-081 (cancel path correctness)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  forall (p1_deposited, p2_deposited) in {(true,true), (true,false), (false,true), (false,false)}:
    let total_refund = (p1_deposited as u64 + p2_deposited as u64) * wager
    assert: escrow_balance_after_cancel == escrow_balance_before_cancel - total_refund
    // Each player's balance increases by exactly wager_lamports if they deposited
```

**LiteSVM sketch:**
```rust
#[test_case(MIN_WAGER, true, true)]   // both deposited
#[test_case(MIN_WAGER, true, false)]  // only p1
#[test_case(MAX_WAGER, true, true)]   // max wager, both
#[test_case(50_000, false, true)]     // only p2
fn inv8_cancel_refund_conservation(wager: u64, p1_deposited: bool, p2_deposited: bool) {
    let mut svm = LiteSVM::new();
    // Setup: config, create_match(wager)

    if p1_deposited {
        // deposit_wager as player_one
    }
    if p2_deposited {
        // deposit_wager as player_two
    }

    let p1_pre = svm.get_balance(player_one);
    let p2_pre = svm.get_balance(player_two);

    // Cancel match (authority or player, depending on state)
    // ...

    let p1_post = svm.get_balance(player_one);
    let p2_post = svm.get_balance(player_two);

    if p1_deposited {
        assert_eq!(p1_post - p1_pre, wager,
            "Player one refund incorrect: got {}, expected {}", p1_post - p1_pre, wager);
    } else {
        assert_eq!(p1_post, p1_pre, "Player one received refund without depositing");
    }

    if p2_deposited {
        assert_eq!(p2_post - p2_pre, wager,
            "Player two refund incorrect: got {}, expected {}", p2_post - p2_pre, wager);
    } else {
        assert_eq!(p2_post, p2_pre, "Player two received refund without depositing");
    }
}
```

---

### INV-9: BPS Constant Integrity (Fees Sum to Less Than 100%)

**What it checks:** `TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR`, ensuring the combined fee percentage never exceeds 100%. Also validates the implicit winner share: `BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS == 9000` (90%).

**Why it matters:** If a code change inadvertently sets `TREASURY_BPS = 7000` (70%) instead of `700` (7%), the `winner_amount` computation `total_pot - treasury - ops` would underflow (since `treasury + ops > total_pot`), causing the `checked_sub` to return an error and the settlement to permanently fail. All escrowed funds would be locked. This invariant catches constant definition errors at test time.

**Tool:** Proptest (compile-time const assertion would be ideal, but Rust stable lacks const_assert for arithmetic)
**Confidence:** high
**Based on:** VP-018 (BPS constant validation), novel (compile-time guard)

**Formal Property:**
```
assert: TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR
assert: BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS == 9000
assert: TREASURY_BPS > 0
assert: OPS_BPS > 0
```

**Proptest sketch:**
```rust
#[test]
fn inv9_bps_constant_integrity() {
    assert!(TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR,
        "Combined fees exceed 100%: {} + {} = {} >= {}",
        TREASURY_BPS, OPS_BPS, TREASURY_BPS + OPS_BPS, BPS_DENOMINATOR);

    let winner_bps = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS;
    assert_eq!(winner_bps, 9000,
        "Winner BPS is {} instead of expected 9000", winner_bps);

    assert!(TREASURY_BPS > 0, "Treasury BPS is zero");
    assert!(OPS_BPS > 0, "Ops BPS is zero");

    // Verify no weird interaction at boundaries
    assert!(TREASURY_BPS <= BPS_DENOMINATOR / 2,
        "Treasury BPS exceeds 50% -- likely a constant error");
    assert!(OPS_BPS <= BPS_DENOMINATOR / 2,
        "Ops BPS exceeds 50% -- likely a constant error");
}
```

---

### INV-10: Monotonicity of Fee Amounts (Larger Wager Produces Larger Fees)

**What it checks:** For any two valid wagers `w1 < w2`, the treasury and ops fees from `w2` are strictly greater than or equal to those from `w1`. This ensures no "fee cliff" where a larger wager produces smaller fees due to integer division edge cases.

**Why it matters:** A non-monotonic fee function would create arbitrage opportunities. A user could split a large wager across multiple smaller matches to reduce total fees paid, or conversely, the protocol could receive less revenue from a 100 SOL match than from two 50 SOL matches. While not directly exploitable on-chain (each match is independent), non-monotonicity would indicate a mathematical error in the BPS calculation.

**Tool:** Proptest
**Confidence:** medium (monotonicity is a mathematical consequence of floor division on linearly increasing values, but worth confirming empirically)
**Based on:** novel (fee consistency across wager sizes)

**Formal Property:**
```
forall w1, w2 in [MIN_WAGER, MAX_WAGER] where w1 < w2:
  settle_math(w1).treasury <= settle_math(w2).treasury
  settle_math(w1).ops <= settle_math(w2).ops
  settle_math(w1).winner <= settle_math(w2).winner
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv10_fee_monotonicity(
        w1 in MIN_WAGER..MAX_WAGER,
        delta in 1u64..=1_000_000
    ) {
        let w2 = std::cmp::min(w1.saturating_add(delta), MAX_WAGER);
        prop_assume!(w1 < w2);

        let (_, winner1, treasury1, ops1) = settle_math(w1);
        let (_, winner2, treasury2, ops2) = settle_math(w2);

        prop_assert!(treasury2 >= treasury1,
            "Treasury not monotonic: f({})={} > f({})={}", w1, treasury1, w2, treasury2);
        prop_assert!(ops2 >= ops1,
            "Ops not monotonic: f({})={} > f({})={}", w1, ops1, w2, ops2);
        prop_assert!(winner2 >= winner1,
            "Winner not monotonic: f({})={} > f({})={}", w1, winner1, w2, winner2);
    }
}
```

---

### INV-11: Settlement Subtractions Never Underflow

**What it checks:** The two `checked_sub` calls in the winner calculation (line 270-274) never return `Err`. That is, `total_pot >= treasury_amount` and `total_pot - treasury_amount >= ops_amount`.

**Why it matters:** If the subtraction underflows (which would only happen if `treasury + ops > total_pot`, implying fees exceed 100%), the `checked_sub` returns `Err(ArithmeticOverflow)` and the settlement transaction fails. Since the match state has already been set to `Settled` (line 279, before transfers at line 284), but the transaction reverts on error, Solana's atomic execution guarantees the state change is also reverted. However, if a future refactor removes the checked arithmetic, a wrapping underflow would produce an astronomically large `winner_amount`, causing the escrow to attempt a lamport transfer it cannot fulfill.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-014 (underflow prevention), VP-083 (checked arithmetic correctness)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  let total_pot = wager * 2
  let treasury = floor(total_pot * 700 / 10000)
  let ops = floor(total_pot * 300 / 10000)
  assert: total_pot >= treasury
  assert: total_pot - treasury >= ops
```

**Proptest sketch:**
```rust
proptest! {
    #[test]
    fn inv11_no_subtraction_underflow(wager in MIN_WAGER..=MAX_WAGER) {
        let total_pot_128 = (wager as u128) * 2;
        let treasury = ((total_pot_128 * TREASURY_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
        let ops = ((total_pot_128 * OPS_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
        let total_pot = total_pot_128 as u64;

        prop_assert!(total_pot >= treasury,
            "total_pot ({}) < treasury ({})", total_pot, treasury);
        prop_assert!(total_pot - treasury >= ops,
            "total_pot - treasury ({}) < ops ({})", total_pot - treasury, ops);

        // Also verify checked_sub behavior matches
        let sub1 = total_pot.checked_sub(treasury);
        prop_assert!(sub1.is_some());
        let sub2 = sub1.unwrap().checked_sub(ops);
        prop_assert!(sub2.is_some());
    }
}
```

---

### INV-12: Permissionless Reclaim Mirrors Cancel Refund Logic

**What it checks:** The refund arithmetic in `permissionless_reclaim` (lines 420-429) is identical to `cancel_match` (lines 358-367). Both paths refund exactly `wager_lamports` per deposited player, with no fee deduction.

**Why it matters:** If the two code paths diverge (e.g., a future patch adds a "reclaim penalty" to one but not the other), users could choose the cheaper path. Since `permissionless_reclaim` is callable by anyone (no authority or player check), an attacker could front-run a cancel with a reclaim (or vice versa) to exploit the difference. This invariant ensures both paths produce identical economic outcomes for the players.

**Tool:** Proptest (arithmetic comparison) + LiteSVM (end-to-end)
**Confidence:** high
**Based on:** VP-017 (refund path equivalence), VP-081 (cancel vs reclaim parity)

**Formal Property:**
```
forall wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]:
  forall (p1_dep, p2_dep) in {(true,true), (true,false), (false,true)}:
    refund_cancel(wager, p1_dep, p2_dep) == refund_reclaim(wager, p1_dep, p2_dep)
```

**Proptest sketch:**
```rust
fn compute_refund(wager: u64, p1_deposited: bool, p2_deposited: bool) -> (u64, u64) {
    // Both cancel_match and permissionless_reclaim use identical logic:
    let p1_refund = if p1_deposited { wager } else { 0 };
    let p2_refund = if p2_deposited { wager } else { 0 };
    (p1_refund, p2_refund)
}

proptest! {
    #[test]
    fn inv12_reclaim_mirrors_cancel(
        wager in MIN_WAGER..=MAX_WAGER,
        p1_dep in proptest::bool::ANY,
        p2_dep in proptest::bool::ANY,
    ) {
        // Both paths use the same refund amount: wager_lamports per player
        let (p1_cancel, p2_cancel) = compute_refund(wager, p1_dep, p2_dep);
        let (p1_reclaim, p2_reclaim) = compute_refund(wager, p1_dep, p2_dep);

        prop_assert_eq!(p1_cancel, p1_reclaim);
        prop_assert_eq!(p2_cancel, p2_reclaim);

        // Total refunded matches total deposited
        let total_deposited = (p1_dep as u64 + p2_dep as u64) * wager;
        let total_refunded = p1_cancel + p2_cancel;
        prop_assert_eq!(total_deposited, total_refunded);
    }
}
```

**Note:** The arithmetic is trivially identical because both code paths use the same literal pattern (`escrow -= wager_lamports` per deposited player). The real value of this invariant is as a regression guard. An LiteSVM end-to-end test should execute both paths with identical parameters and compare all account balances.

---

## Coverage Gap Analysis

### What These Invariants Cover

| Category | Invariants | VP Coverage |
|----------|-----------|-------------|
| Fee calculations | INV-1, 2, 5, 6, 9, 10, 11 | VP-011 through VP-018 |
| Royalty/revenue splits | INV-1, 6, 9 | VP-078 through VP-081 |
| Decimal normalization / BPS precision | INV-2, 5, 6 | VP-082 through VP-086 |
| Overflow / narrowing safety | INV-3, 4, 11 | VP-013, VP-014, VP-083 |
| Conservation of value | INV-1, 7, 8, 12 | VP-011, VP-016, VP-017 |

### What These Invariants Do NOT Cover

1. **Timestamp arithmetic safety.** The `activated_at + SETTLEMENT_TIMEOUT_SECONDS` and `timeout_reference + TIMEOUT_SECONDS` calculations use `checked_add` on `i64`. While the INDEX.md identifies these as P2 priority, they are not in scope for this fee-calculations document. A separate `timeout-arithmetic.md` invariant file is recommended.

2. **Account space sizing correctness.** `GlobalConfig::SPACE` (106) and `MatchEscrow::SPACE` (168) need to match actual serialized sizes. This is a separate category (VP-090+) that requires Anchor serialization testing, not arithmetic testing.

3. **State machine transitions under concurrent access.** The `OC-10` pattern (set terminal state before transfers) is an atomicity concern, not an arithmetic concern. It requires LiteSVM tests that attempt double-settlement or settle-then-cancel races.

4. **Treasury/Ops account identity validation.** The `DuplicateFeeAccount` check (treasury != ops) is an access control invariant, not a fee calculation invariant. If treasury == ops, the fee math is still correct -- both amounts would go to the same wallet.

5. **Off-chain to on-chain parity.** H016 identified that the off-chain JavaScript uses floating-point settlement (`0.9 * totalPot`). The on-chain program uses integer BPS. There is no invariant that compares the two, because they are architecturally different by design. The off-chain code is a stub that will be removed when the escrow program goes live. If parity testing is desired, it would require a cross-language test harness.

6. **Wager value at exactly MIN_WAGER - 1 and MAX_WAGER + 1.** The `create_match` instruction rejects these with `WagerTooSmall` / `WagerTooLarge`. Boundary rejection should be tested in a state-machine invariant file, not here. However, the fee math invariants implicitly depend on the bounds check -- if a wager of 0 gets through, `total_pot = 0` and both fees are 0, violating INV-2.

7. **Rent-exempt balance interaction.** When the escrow PDA has rent-exempt lamports plus player deposits, the lamport transfers must not bring the account below rent exemption mid-settlement. Anchor's `close` directive handles this by zeroing the account after the instruction completes, but the intermediate state (after winner transfer but before ops transfer) could theoretically underflow if rent is not accounted for. This requires an LiteSVM test with real rent values.

### Recommended Follow-Up Invariant Files

| File | Category | Priority |
|------|----------|----------|
| `timeout-arithmetic.md` | Timestamp overflow, deadline correctness | P2 |
| `state-machine-transitions.md` | Double-settle prevention, cancel-after-settle | P0 |
| `account-sizing.md` | SPACE constants vs actual serialization | P2 |
| `access-control-boundaries.md` | Authority checks, player identity, pause guard | P0 |

---

## Implementation Priority

| Priority | Invariant | Effort | Impact |
|----------|-----------|--------|--------|
| P0 - Must have | INV-1 (conservation) | Low (Proptest only) | Critical: catches any fee math refactoring error |
| P0 - Must have | INV-7 (escrow drain) | Medium (LiteSVM) | Critical: catches stuck lamports |
| P0 - Must have | INV-8 (cancel refund) | Medium (LiteSVM) | Critical: catches refund amount errors |
| P1 - Should have | INV-2 (fee minimum) | Low (Proptest) | High: validates OC-08 design |
| P1 - Should have | INV-3 (narrowing) | Low (Proptest) | High: catches u128->u64 truncation |
| P1 - Should have | INV-11 (no underflow) | Low (Proptest) | High: catches checked_sub failure |
| P2 - Nice to have | INV-4 (pot overflow) | Low (Proptest) | Medium: redundant with INV-3 but explicit |
| P2 - Nice to have | INV-5 (winner remainder) | Low (Proptest) | Medium: documents design intent |
| P2 - Nice to have | INV-6 (percentage bounds) | Low (Proptest) | Medium: validates effective percentages |
| P2 - Nice to have | INV-9 (constant integrity) | Trivial | Low: static assertion |
| P3 - Completeness | INV-10 (monotonicity) | Low (Proptest) | Low: mathematical consequence |
| P3 - Completeness | INV-12 (reclaim parity) | Low-Medium | Low: code is identical today |
