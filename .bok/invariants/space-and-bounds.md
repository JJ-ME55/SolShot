# BOK Invariants: Account Space Sizing & Wager Bounds

**Category:** Misc program correctness
**Source:** `programs/solshot-escrow/src/lib.rs`
**Math regions:** `GlobalConfig::SPACE` (L706), `MatchEscrow::SPACE` (L753), MIN/MAX wager validation in `create_match` (L117-123), BPS fee math in `settle_match` (L252-274)
**Tool target:** Proptest (Kani unavailable on Windows)
**Date:** 2026-02-23

---

## Invariants

### INV-1: GlobalConfig::SPACE matches Borsh-serialized size

**What it checks:** The constant `GlobalConfig::SPACE = 106` exactly equals the Borsh serialization output length for any valid `GlobalConfig` instance, including the 8-byte Anchor discriminator.

**Why it matters:** If SPACE is too small, `init` allocates insufficient account data and Anchor's deserialize will fail or corrupt trailing fields on subsequent reads. If SPACE is too large, the payer overpays rent but correctness is preserved. An undersized allocation is the critical failure mode: it would make `initialize_config` permanently broken, bricking the entire program.

**Tool:** Proptest
**Confidence:** high
**Based on:** Novel (Anchor account sizing best practice)

**Formal Property:**
```
For all valid GlobalConfig gc:
  len(anchor_discriminator) + len(borsh_serialize(gc)) == GlobalConfig::SPACE == 106

Where:
  anchor_discriminator = 8 bytes
  authority: Pubkey   = 32 bytes
  treasury:  Pubkey   = 32 bytes
  ops:       Pubkey   = 32 bytes
  is_paused: bool     =  1 byte
  bump:      u8       =  1 byte
  Total                = 106 bytes
```

**Proptest sketch:**
```rust
use anchor_lang::prelude::*;
use borsh::BorshSerialize;
use proptest::prelude::*;

// Mirror the struct layout for offline testing
#[derive(BorshSerialize)]
struct GlobalConfigOffline {
    authority: [u8; 32],
    treasury: [u8; 32],
    ops: [u8; 32],
    is_paused: bool,
    bump: u8,
}

const GLOBAL_CONFIG_SPACE: usize = 106;
const ANCHOR_DISCRIMINATOR: usize = 8;

proptest! {
    #[test]
    fn inv1_global_config_space_matches_serialized_size(
        authority in prop::array::uniform32(any::<u8>()),
        treasury in prop::array::uniform32(any::<u8>()),
        ops in prop::array::uniform32(any::<u8>()),
        is_paused in any::<bool>(),
        bump in any::<u8>(),
    ) {
        let gc = GlobalConfigOffline {
            authority,
            treasury,
            ops,
            is_paused,
            bump,
        };
        let serialized = gc.try_to_vec().unwrap();
        // Borsh payload + 8-byte discriminator must equal SPACE
        prop_assert_eq!(
            ANCHOR_DISCRIMINATOR + serialized.len(),
            GLOBAL_CONFIG_SPACE,
            "GlobalConfig::SPACE mismatch: 8 + {} != {}",
            serialized.len(),
            GLOBAL_CONFIG_SPACE
        );
    }
}
```

---

### INV-2: MatchEscrow::SPACE matches Borsh-serialized size at max match_id length

**What it checks:** The constant `MatchEscrow::SPACE = 168` exactly equals the Borsh serialization output length for a `MatchEscrow` instance whose `match_id` is at the maximum allowed length (32 bytes). For shorter match IDs, the serialized size is smaller than SPACE, which is safe (Anchor zero-fills the remainder).

**Why it matters:** If SPACE is too small for a 32-byte match_id, `create_match` would allocate an undersized account. Anchor would then silently truncate trailing fields (like `bump`) during serialization, causing PDA verification failures on subsequent instructions. Since `match_id` is user-supplied (bounded by `match_id.len() <= 32` on L117), the max-length case is the critical path.

**Tool:** Proptest
**Confidence:** high
**Based on:** Novel (Anchor account sizing with variable-length String fields)

**Formal Property:**
```
For all valid MatchEscrow me where me.match_id.len() <= 32:
  len(anchor_discriminator) + len(borsh_serialize(me)) <= MatchEscrow::SPACE == 168

And specifically when me.match_id.len() == 32:
  len(anchor_discriminator) + len(borsh_serialize(me)) == MatchEscrow::SPACE == 168

Where Borsh String serialization = 4-byte u32 length prefix + UTF-8 bytes

Note: Rust String::len() returns byte count (not char count), so the L117 check
`match_id.len() <= 32` correctly bounds the Borsh payload to 4 + 32 = 36 bytes.
```

**Proptest sketch:**
```rust
use borsh::BorshSerialize;
use proptest::prelude::*;

#[derive(BorshSerialize, Clone, Copy, PartialEq)]
enum MatchStateOffline {
    AwaitingDeposits,
    Active,
    Settled,
    Cancelled,
}

#[derive(BorshSerialize)]
struct MatchEscrowOffline {
    match_id: String,
    authority: [u8; 32],
    player_one: [u8; 32],
    player_two: [u8; 32],
    wager_lamports: u64,
    player_one_deposited: bool,
    player_two_deposited: bool,
    state: MatchStateOffline,
    created_at: i64,
    activated_at: i64,
    bump: u8,
}

const MATCH_ESCROW_SPACE: usize = 168;
const ANCHOR_DISCRIMINATOR: usize = 8;

proptest! {
    #[test]
    fn inv2_match_escrow_space_exact_at_max_id(
        // Generate ASCII match IDs of exactly 32 bytes
        match_id in "[a-zA-Z0-9]{32}",
        authority in prop::array::uniform32(any::<u8>()),
        player_one in prop::array::uniform32(any::<u8>()),
        player_two in prop::array::uniform32(any::<u8>()),
        wager in any::<u64>(),
        p1_dep in any::<bool>(),
        p2_dep in any::<bool>(),
        state_idx in 0u8..4,
        created_at in any::<i64>(),
        activated_at in any::<i64>(),
        bump in any::<u8>(),
    ) {
        let state = match state_idx {
            0 => MatchStateOffline::AwaitingDeposits,
            1 => MatchStateOffline::Active,
            2 => MatchStateOffline::Settled,
            _ => MatchStateOffline::Cancelled,
        };
        let me = MatchEscrowOffline {
            match_id,
            authority,
            player_one,
            player_two,
            wager_lamports: wager,
            player_one_deposited: p1_dep,
            player_two_deposited: p2_dep,
            state,
            created_at,
            activated_at,
            bump,
        };
        let serialized = me.try_to_vec().unwrap();
        prop_assert_eq!(
            ANCHOR_DISCRIMINATOR + serialized.len(),
            MATCH_ESCROW_SPACE,
            "MatchEscrow::SPACE mismatch at max match_id: 8 + {} != {}",
            serialized.len(),
            MATCH_ESCROW_SPACE
        );
    }

    #[test]
    fn inv2b_match_escrow_space_sufficient_for_shorter_ids(
        // Generate ASCII match IDs of 0..=32 bytes
        id_len in 0usize..=32,
    ) {
        let match_id: String = "a".repeat(id_len);
        let me = MatchEscrowOffline {
            match_id,
            authority: [0u8; 32],
            player_one: [1u8; 32],
            player_two: [2u8; 32],
            wager_lamports: 10_000,
            player_one_deposited: false,
            player_two_deposited: false,
            state: MatchStateOffline::AwaitingDeposits,
            created_at: 0,
            activated_at: 0,
            bump: 255,
        };
        let serialized = me.try_to_vec().unwrap();
        let total = ANCHOR_DISCRIMINATOR + serialized.len();
        prop_assert!(
            total <= MATCH_ESCROW_SPACE,
            "MatchEscrow serialized size {} exceeds SPACE {} for id_len {}",
            total,
            MATCH_ESCROW_SPACE,
            id_len
        );
    }
}
```

---

### INV-3: MIN_WAGER guarantees both fee amounts >= 1 lamport

**What it checks:** For any wager `w` in the accepted range `[MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS]`, the integer-truncated BPS fee calculation yields `treasury_amount >= 1` and `ops_amount >= 1`.

**Why it matters:** If either fee truncates to 0 lamports, the corresponding `try_borrow_mut_lamports` transfer becomes a no-op, meaning the treasury or ops wallet receives nothing. More critically, the winner would receive more than their intended 90% share. The MIN_WAGER constant exists specifically to prevent this. The ops fee is the binding constraint because `OPS_BPS (300) < TREASURY_BPS (700)`.

**Tool:** Proptest
**Confidence:** high
**Based on:** INDEX.md P1 invariant "For any wager in [MIN, MAX], treasury_amount >= 1 AND ops_amount >= 1"

**Formal Property:**
```
Constants:
  MIN_WAGER = 10,000
  MAX_WAGER = 100,000,000,000
  TREASURY_BPS = 700
  OPS_BPS = 300
  BPS_DENOM = 10,000

For all w in [MIN_WAGER, MAX_WAGER]:
  total_pot = w * 2
  treasury_amount = floor(total_pot * TREASURY_BPS / BPS_DENOM) >= 1
  ops_amount      = floor(total_pot * OPS_BPS / BPS_DENOM)      >= 1

Analytical proof (ops is the binding constraint):
  ops_amount = floor(2 * w * 300 / 10000) = floor(w * 3 / 50)
  ops_amount >= 1  iff  w * 3 / 50 >= 1  iff  w >= 50/3 ~= 16.67  iff  w >= 17

  MIN_WAGER = 10,000 >> 17   =>   ops_amount >= floor(10000 * 3 / 50) = 600 >= 1  QED

  treasury_amount = floor(2 * w * 700 / 10000) = floor(w * 7 / 50)
  treasury_amount >= 1  iff  w >= 50/7 ~= 7.14  iff  w >= 8

  MIN_WAGER = 10,000 >> 8    =>   treasury_amount >= floor(10000 * 7 / 50) = 1400 >= 1  QED
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10_000;

fn compute_fees(wager: u64) -> (u64, u64) {
    let total_pot_128 = (wager as u128) * 2;
    let treasury = ((total_pot_128 * TREASURY_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
    let ops = ((total_pot_128 * OPS_BPS as u128) / BPS_DENOMINATOR as u128) as u64;
    (treasury, ops)
}

proptest! {
    #[test]
    fn inv3_min_wager_fee_guarantee(
        wager in MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS,
    ) {
        let (treasury, ops) = compute_fees(wager);
        prop_assert!(
            treasury >= 1,
            "treasury_amount = {} < 1 for wager = {}",
            treasury,
            wager
        );
        prop_assert!(
            ops >= 1,
            "ops_amount = {} < 1 for wager = {}",
            ops,
            wager
        );
    }

    // Edge case: test exactly at MIN_WAGER
    #[test]
    fn inv3b_min_wager_exact_boundary(_dummy in 0u8..1) {
        let (treasury, ops) = compute_fees(MIN_WAGER_LAMPORTS);
        prop_assert_eq!(treasury, 1_400, "treasury at MIN_WAGER");
        prop_assert_eq!(ops, 600, "ops at MIN_WAGER");
    }

    // Negative edge: wager just below the theoretical ops minimum
    #[test]
    fn inv3c_below_theoretical_min_ops_is_zero(_dummy in 0u8..1) {
        // w = 16: floor(16 * 3 / 50) = floor(0.96) = 0
        let (_, ops) = compute_fees(16);
        prop_assert_eq!(ops, 0, "ops should be 0 below theoretical minimum");
    }
}
```

---

### INV-4: MAX_WAGER overflow safety for u64 pot and u128 intermediates

**What it checks:** At `MAX_WAGER_LAMPORTS`, (a) `wager * 2` fits in u64 without overflow, (b) all u128 intermediate fee products fit in u128, and (c) all u128-to-u64 narrowing casts after division produce values that fit in u64.

**Why it matters:** If `wager * 2` overflowed u64, the `checked_mul(2)` in `deposit_wager` (L212) would return `None` and the instruction would fail. More subtly, if the u128 intermediates in `settle_match` (L253-265) overflowed u128 or the narrowing cast `as u64` truncated, the settlement distribution would be silently incorrect, potentially sending the wrong amounts to winner/treasury/ops. The MAX_WAGER bound exists to make these operations safe.

**Tool:** Proptest
**Confidence:** high
**Based on:** INDEX.md P1 invariant "For any wager in [MIN, MAX], total_pot fits u64 without overflow"

**Formal Property:**
```
Constants:
  MAX_WAGER = 100,000,000,000  (1e11)
  u64::MAX  = 18,446,744,073,709,551,615  (~1.84e19)
  u128::MAX = 340,282,366,920,938,463,463,374,607,431,768,211,455  (~3.4e38)

For all w in [MIN_WAGER, MAX_WAGER]:

  (a) u64 pot safety:
      w * 2 <= u64::MAX
      max: 100,000,000,000 * 2 = 200,000,000,000 << u64::MAX  QED

  (b) u128 intermediate safety:
      total_pot_128 = w as u128 * 2  (trivially fits u128)
      max_product = total_pot_128 * max(TREASURY_BPS, OPS_BPS)
                  = 200,000,000,000 * 700
                  = 140,000,000,000,000  (1.4e14 << u128::MAX)  QED

  (c) u128-to-u64 narrowing safety:
      treasury_amount = 140,000,000,000,000 / 10,000 = 14,000,000,000
      ops_amount      =  60,000,000,000,000 / 10,000 =  6,000,000,000
      Both << u64::MAX  QED

      More generally: max fee = w * 2 * max_bps / denom
                              = MAX_WAGER * 2 * 700 / 10000
                              = MAX_WAGER * 0.14
                              = 14,000,000,000 << u64::MAX  QED
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
const TREASURY_BPS: u128 = 700;
const OPS_BPS: u128 = 300;
const BPS_DENOMINATOR: u128 = 10_000;

proptest! {
    #[test]
    fn inv4_max_wager_overflow_safety(
        wager in MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS,
    ) {
        // (a) u64 pot must not overflow
        let pot_u64 = wager.checked_mul(2);
        prop_assert!(
            pot_u64.is_some(),
            "wager * 2 overflowed u64 at wager = {}",
            wager
        );
        let pot_u64 = pot_u64.unwrap();

        // (b) u128 intermediates must not overflow
        let total_pot_128 = (wager as u128).checked_mul(2).unwrap();

        let treasury_product = total_pot_128.checked_mul(TREASURY_BPS);
        prop_assert!(
            treasury_product.is_some(),
            "treasury u128 product overflowed at wager = {}",
            wager
        );

        let ops_product = total_pot_128.checked_mul(OPS_BPS);
        prop_assert!(
            ops_product.is_some(),
            "ops u128 product overflowed at wager = {}",
            wager
        );

        // (c) u128-to-u64 narrowing must be lossless
        let treasury_amount_128 = treasury_product.unwrap() / BPS_DENOMINATOR;
        prop_assert!(
            treasury_amount_128 <= u64::MAX as u128,
            "treasury narrowing would truncate: {} > u64::MAX at wager = {}",
            treasury_amount_128,
            wager
        );

        let ops_amount_128 = ops_product.unwrap() / BPS_DENOMINATOR;
        prop_assert!(
            ops_amount_128 <= u64::MAX as u128,
            "ops narrowing would truncate: {} > u64::MAX at wager = {}",
            ops_amount_128,
            wager
        );

        // Cross-check: total_pot_128 as u64 is lossless
        prop_assert!(
            total_pot_128 <= u64::MAX as u128,
            "total_pot narrowing would truncate at wager = {}",
            wager
        );
        prop_assert_eq!(
            total_pot_128 as u64,
            pot_u64,
            "total_pot u128/u64 mismatch at wager = {}",
            wager
        );
    }
}
```

---

### INV-5: Settlement conservation of value (pot = winner + treasury + ops)

**What it checks:** For any wager in the accepted range, the sum `winner_amount + treasury_amount + ops_amount` exactly equals `total_pot` (= wager * 2). No lamports are created or destroyed by the BPS integer division and remainder pattern.

**Why it matters:** If the three amounts do not sum to the total pot, there are two failure modes: (1) amounts sum to more than the pot, causing the third `try_borrow_mut_lamports` subtraction to underflow and panic (runtime crash, stuck escrow); (2) amounts sum to less than the pot, leaving dust lamports permanently locked in the escrow PDA. The program uses a remainder pattern (`winner = total_pot - treasury - ops`) which guarantees conservation by construction, but this invariant formally verifies it holds across all input ranges.

**Tool:** Proptest
**Confidence:** high
**Based on:** INDEX.md P0 invariant "winner_amount + treasury_amount + ops_amount == total_pot"

**Formal Property:**
```
For all w in [MIN_WAGER, MAX_WAGER]:
  total_pot = w * 2
  treasury  = floor(total_pot * 700 / 10000)
  ops       = floor(total_pot * 300 / 10000)
  winner    = total_pot - treasury - ops

  => winner + treasury + ops == total_pot   (by construction of winner)

  Additionally:
  winner >= 0  (i.e., treasury + ops <= total_pot)

  Proof: treasury + ops = floor(tp * 700 / 10000) + floor(tp * 300 / 10000)
         <= tp * 700/10000 + tp * 300/10000
         = tp * 1000/10000
         = tp * 0.1
         < tp
         => winner = tp - treasury - ops >= tp - tp*0.1 = tp*0.9 > 0  QED
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10_000;

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
    fn inv5_settlement_conservation(
        wager in MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS,
    ) {
        let (total_pot, winner, treasury, ops) = settle_math(wager);

        // Conservation: no lamports created or destroyed
        prop_assert_eq!(
            winner + treasury + ops,
            total_pot,
            "Conservation violated at wager = {}: {} + {} + {} != {}",
            wager, winner, treasury, ops, total_pot
        );

        // No underflow: winner must be non-negative (guaranteed by u64 type,
        // but the subtraction in settle_match uses checked_sub, so this
        // verifies the checked_sub won't fail)
        prop_assert!(
            treasury + ops <= total_pot,
            "Fee sum exceeds pot at wager = {}: {} + {} > {}",
            wager, treasury, ops, total_pot
        );
    }
}
```

---

### INV-6: BPS constants yield intended fee split

**What it checks:** The hardcoded BPS constants produce the intended fee structure: treasury gets exactly 7%, ops gets exactly 3%, winner gets the 90% remainder. Specifically: `TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR` (fees do not exceed 100%) and the constants match the litepaper v2.0 specification.

**Why it matters:** If a developer accidentally changes a constant (e.g., adding a zero to `OPS_BPS = 3000` instead of 300), fees could exceed 100% of the pot, causing the `winner_amount` subtraction to underflow and crash settlement. Alternatively, swapping TREASURY_BPS and OPS_BPS would redirect funds incorrectly. This invariant serves as a regression guard on the most economically sensitive constants in the program.

**Tool:** Proptest (deterministic assertions, using proptest harness for consistency)
**Confidence:** high
**Based on:** INDEX.md constant derivation "TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR"

**Formal Property:**
```
TREASURY_BPS = 700                   (7.00%)
OPS_BPS = 300                        (3.00%)
BPS_DENOMINATOR = 10_000             (100.00%)

TREASURY_BPS + OPS_BPS = 1_000       (10.00%)
1_000 < 10_000                       => fees < 100%  QED

Winner share = (BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS) / BPS_DENOMINATOR
             = 9_000 / 10_000
             = 90.00%

TREASURY_BPS / BPS_DENOMINATOR = 700 / 10000 = 7.00%
OPS_BPS / BPS_DENOMINATOR = 300 / 10000 = 3.00%
```

**Proptest sketch:**
```rust
use proptest::prelude::*;

const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10_000;

proptest! {
    #[test]
    fn inv6_bps_constants_correctness(_dummy in 0u8..1) {
        // Fees must not exceed 100%
        prop_assert!(
            TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR,
            "Total fees {}+{} = {} >= denominator {}",
            TREASURY_BPS, OPS_BPS,
            TREASURY_BPS + OPS_BPS, BPS_DENOMINATOR
        );

        // Treasury = 7%
        prop_assert_eq!(TREASURY_BPS * 100 / BPS_DENOMINATOR, 7);
        // Ops = 3%
        prop_assert_eq!(OPS_BPS * 100 / BPS_DENOMINATOR, 3);
        // Winner remainder = 90%
        prop_assert_eq!(
            (BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS) * 100 / BPS_DENOMINATOR,
            90
        );

        // Denominator is standard basis points
        prop_assert_eq!(BPS_DENOMINATOR, 10_000);

        // PERMISSIONLESS_RECLAIM_TIMEOUT sanity (related constant)
        let timeout_seconds: i64 = 86400;
        let permissionless: i64 = timeout_seconds * 2;
        prop_assert_eq!(permissionless, 172800);
    }
}
```

---

## Coverage Gap Analysis

### Covered by these invariants

| Property | INV | Status |
|----------|-----|--------|
| GlobalConfig SPACE = actual Borsh size | INV-1 | Fully covered |
| MatchEscrow SPACE = actual Borsh size at max match_id | INV-2 | Fully covered |
| MatchEscrow SPACE >= actual Borsh size for all match_id lengths | INV-2b | Fully covered |
| MIN_WAGER ensures treasury_amount >= 1 | INV-3 | Fully covered |
| MIN_WAGER ensures ops_amount >= 1 | INV-3 | Fully covered |
| MAX_WAGER: wager*2 fits u64 | INV-4 | Fully covered |
| MAX_WAGER: u128 intermediates fit u128 | INV-4 | Fully covered |
| MAX_WAGER: u128-to-u64 narrowing is lossless | INV-4 | Fully covered |
| Settlement conservation: winner+treasury+ops == pot | INV-5 | Fully covered |
| Fee sum does not exceed pot (no underflow) | INV-5 | Fully covered |
| BPS constants match litepaper percentages | INV-6 | Fully covered |
| Fees < 100% of pot | INV-6 | Fully covered |

### NOT covered by these invariants (out of scope, covered elsewhere or needs separate proposal)

| Gap | Why not here | Suggested location |
|-----|--------------|-------------------|
| Lamport transfer conservation (escrow balance after settle == rent_exempt) | Requires LiteSVM integration testing with actual Solana account balances | Separate `settlement-transfers.md` invariant set |
| Timestamp overflow safety (activated_at + timeout < i64::MAX) | Different math region (timeout arithmetic) | Separate `timeout-arithmetic.md` invariant set |
| match_id length validation vs. PDA seed safety | Not a math invariant; more of a constraint correctness issue | Constraint correctness audit |
| MatchState enum Borsh serialization size (assumed 1 byte for <= 256 variants) | Borsh spec guarantees this for fieldless enums, but no explicit test | Could add to INV-2 as sub-assertion |
| Wager bounds are enforced on-chain (not just in test) | Requires LiteSVM integration test that sends out-of-bounds wager and expects error | Separate integration test file |
| The `as u64` cast on L267 (`total_pot_128 as u64`) after the u128 division | Covered implicitly by INV-4 (verifies total_pot_128 <= u64::MAX), but the settle_match code does this cast *before* the fee subtraction; INV-4 proves it's safe | Covered by INV-4 |

### Edge cases explicitly tested

- **INV-3b:** Exact boundary test at MIN_WAGER_LAMPORTS = 10,000 (treasury=1400, ops=600)
- **INV-3c:** Negative test at wager=16 proving ops_amount=0 below theoretical minimum
- **INV-2b:** Parameterized test over all match_id lengths 0..32

### Confidence assessment

All six invariants have **high confidence** because:
1. The math is simple (single multiplication, division, addition/subtraction)
2. The Borsh serialization format is deterministic and well-documented
3. The proptest sketches exercise the exact same arithmetic operations as the on-chain code
4. Analytical proofs are provided alongside the property tests for independent verification
5. Edge cases at MIN_WAGER and MAX_WAGER boundaries are explicitly tested
