---
task_id: bok-analyze-fee-calc-and-cap
provides: [invariant-proposals]
subsystem: fee-calculations
confidence: high
invariant_count: 12
verification_mode: proptest_and_litesvm_only
kani_available: false
target_programs:
  - programs/solshot-escrow/src/lib.rs (v1 — hardcoded BPS, frozen)
  - programs/solshot-escrow-v2/src/lib.rs (v2 — runtime-configurable BPS)
---

# Invariant Proposals — Fee Calculations + Cap Enforcement (v1 + v2)

## Source Math Regions

| ID | File | Lines | What |
|----|------|-------|------|
| R1 | `programs/solshot-escrow/src/lib.rs` | 258-338 | v1 `settle_match` — hardcoded 90/7/3 split |
| R2 | `programs/solshot-escrow-v2/src/lib.rs` | 387-454 | v2 `settle_match` — reads per-match snapshot BPS |
| R3 | `programs/solshot-escrow-v2/src/lib.rs` | 75-79 | v2 `initialize_config` — combined BPS cap |
| R4 | `programs/solshot-escrow-v2/src/lib.rs` | 128-131 | v2 `update_config` — combined BPS cap (post-update) |
| R5 | `programs/solshot-escrow-v2/src/lib.rs` | 201-219 | v2 `create_match` — atomic snapshot of treasury/ops/BPS |

## Constants Under Test

```rust
// v1 (hardcoded)
const TREASURY_BPS: u64 = 700;          // 7%
const OPS_BPS: u64 = 300;               // 3%
const BPS_DENOMINATOR: u64 = 10_000;
const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
// v1 max players: 4

// v2 (runtime-configurable)
const MAX_FEE_BPS: u16 = 1_000;          // 10% combined cap
const BPS_DENOMINATOR: u128 = 10_000;
const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
const MIN_PLAYERS: u8 = 2;
const MAX_PLAYERS: usize = 10;
// fee_bps_treasury, fee_bps_ops: u16 fields on GlobalConfig
```

## Cross-Skill Context Summary

- **GL spec** (`competitive-landscape.md:39, 60`, `one-pager.md:56`, `edge-case-playbook.md:386`): The 90/7/3 split is the documented economic intent. v2 makes the 7%/3% portion configurable but caps the combined fee at 10% (`MAX_FEE_BPS=1000`). Winner remainder pattern is intentional — winner absorbs dust to avoid value leak.
- **SOS H011** (HIGH/CONFIRMED): v2's `update_config` allows authority to ratchet BPS up to combined 1000 with no timelock, no propose/accept, no per-field individual cap. Per-match snapshot DOES protect in-flight matches; future matches are exposed.
- **SOS A02 (arithmetic agent)**: Identifies that individual BPS fields are never per-field bounded in v2. With ops=0, treasury can be set to 1000 (100% of fee allocation). The combined cap fires correctly, but per-field 100% is silently allowed.
- **SOS A03/A04**: `create_match` does not re-validate combined BPS post-snapshot, and `settle_match` does not re-validate at consumption. The cap check fires only at the `update_config` boundary — if the cap could be bypassed there, no downstream guard catches it.
- **Prior BOK (Feb 2026)**: 12 invariants on v1 covering 2-player and N-player (2-4 players) settlement. All pass at 10k iterations on hardcoded TREASURY_BPS=700/OPS_BPS=300. v2's configurable BPS surface and 10-player ceiling are formally unverified.

---

## Proposed Invariants

### I-FEE-1: Pot Conservation Across Configurable BPS

**What it checks:**
For every valid combination of `(wager, num_deposited, treasury_bps, ops_bps)` in v2, the three settlement payouts add back up to exactly `total_pot`. Specifically: `winner_amount + treasury_amount + ops_amount == total_pot`. Sweeps `treasury_bps ∈ [0, 1000]`, `ops_bps ∈ [0, 1000 - treasury_bps]`, `num_deposited ∈ [2, 10]`, `wager ∈ [MIN_WAGER, MAX_WAGER]`.

**Why it matters (concrete exploit):**
If conservation fails by `+k` (sum > pot), `settle_match` will attempt to debit the escrow PDA past its actual balance during the third lamport transfer at v2:454. With `overflow-checks=true`, this would either panic the runtime or hit Anchor's lamport accounting check — leaving the match permanently stuck in `Settled` state with funds half-distributed. If conservation fails by `-k` (sum < pot), `k` lamports remain stranded in the closed PDA and are swept to authority via `close = authority` after settlement, silently routing winner funds to the protocol authority. v1's Feb proptest verified this for hardcoded 700/300 only; v2's runtime BPS surface is unverified.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-011 (conservation), VP-078 (revenue split correctness), prior BOK INV-1 (extension to v2 surface)

**Formal Property:**
```
forall wager in [10_000, 100_000_000_000]:
forall num_deposited in [2, 10]:
forall treasury_bps in [0, 1000]:
forall ops_bps in [0, 1000 - treasury_bps]:
  let total_pot_128 = (wager as u128) * (num_deposited as u128)
  let treasury = (total_pot_128 * treasury_bps / 10_000) as u64
  let ops = (total_pot_128 * ops_bps / 10_000) as u64
  let total_pot = total_pot_128 as u64
  let winner = total_pot - treasury - ops
  assert: winner + treasury + ops == total_pot
```

**Proptest sketch:**
```rust
fn settle_math_v2(wager: u64, num_deposited: u32, treasury_bps: u16, ops_bps: u16) -> SettleResult {
    let total_pot_128 = (wager as u128).checked_mul(num_deposited as u128).unwrap();
    let treasury = (total_pot_128.checked_mul(treasury_bps as u128).unwrap() / 10_000) as u64;
    let ops = (total_pot_128.checked_mul(ops_bps as u128).unwrap() / 10_000) as u64;
    let total_pot = total_pot_128 as u64;
    let winner = total_pot.checked_sub(treasury).unwrap().checked_sub(ops).unwrap();
    SettleResult { total_pot, treasury, ops, winner }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    #[test]
    fn i_fee_1_pot_conservation_v2(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        bps_split in (0u16..=1000u16).prop_flat_map(|t| (Just(t), 0u16..=(1000 - t))),
    ) {
        let (treasury_bps, ops_bps) = bps_split;
        let r = settle_math_v2(wager, num_deposited, treasury_bps, ops_bps);
        prop_assert_eq!(r.winner + r.treasury + r.ops, r.total_pot,
            "Conservation violated: w={} + t={} + o={} != pot={} (wager={}, n={}, tbps={}, obps={})",
            r.winner, r.treasury, r.ops, r.total_pot, wager, num_deposited, treasury_bps, ops_bps);
    }
}
```

**LiteSVM extension (optional):**
End-to-end: deploy v2, set `(treasury_bps, ops_bps)` via `update_config`, run create+deposit+settle, assert the three recipient balance deltas sum to (wager × num_deposited) ± rent.

---

### I-FEE-2: Dust Bound (≤ 2 Lamports)

**What it checks:**
The winner's "extra" relative to a hypothetical independent calculation is bounded by exactly 2 lamports across ALL configurable BPS, all player counts, and all wager values. Two BPS divisions occur (treasury, ops), and each can lose at most 1 lamport to floor truncation, so the winner's remainder pattern absorbs at most 2 lamports of "found money."

**Why it matters (concrete exploit):**
The winner-as-remainder pattern is a deliberate design choice (documented in v1:318 comment, v2:434 comment) to prevent value leak. If dust were unbounded — e.g., due to a rounding-direction change or a refactor to "winner = total_pot × winner_bps / 10_000" — the protocol would either silently lose lamports to the void (winner stranded) or stuff arbitrary lamports into the winner account (overpayment relative to design). Feb verified ≤ 2 for hardcoded 700/300 / 2-4 players. v2's surface (any BPS within cap, up to 10 players) is unverified — and a configurable BPS like (333, 333) might theoretically push dust higher than the 2-lamport bound if the math is non-uniform.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-011, VP-014 (precision loss), prior BOK INV-5

**Formal Property:**
```
forall wager in [10_000, 100_000_000_000]:
forall num_deposited in [2, 10]:
forall (treasury_bps, ops_bps) where treasury_bps + ops_bps <= 1000:
  let total_pot_128 = wager × num_deposited (u128)
  let winner_independent = (total_pot_128 × (10_000 - treasury_bps - ops_bps) / 10_000) as u64
  let winner_remainder = total_pot - treasury_amount - ops_amount
  let dust = winner_remainder - winner_independent
  assert: dust <= 2
  assert: winner_remainder >= winner_independent (winner-favorable invariant)
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    #[test]
    fn i_fee_2_dust_bound_v2(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        bps_split in (0u16..=1000u16).prop_flat_map(|t| (Just(t), 0u16..=(1000 - t))),
    ) {
        let (treasury_bps, ops_bps) = bps_split;
        let r = settle_math_v2(wager, num_deposited, treasury_bps, ops_bps);
        let total_pot_128 = (wager as u128) * (num_deposited as u128);
        let winner_bps = 10_000u128 - (treasury_bps as u128) - (ops_bps as u128);
        let winner_independent = (total_pot_128 * winner_bps / 10_000) as u64;

        prop_assert!(r.winner >= winner_independent,
            "Winner remainder {} < independent {} (wager={}, n={}, tbps={}, obps={})",
            r.winner, winner_independent, wager, num_deposited, treasury_bps, ops_bps);

        let dust = r.winner - winner_independent;
        prop_assert!(dust <= 2,
            "Dust {} > 2 (wager={}, n={}, tbps={}, obps={})",
            dust, wager, num_deposited, treasury_bps, ops_bps);
    }
}
```

---

### I-FEE-3: No Underflow (Pot ≥ Treasury + Ops)

**What it checks:**
The two `checked_sub` operations in `settle_match` (v1:319-323, v2:435-439) never return `None` for any valid configuration. That is, `total_pot >= treasury_amount + ops_amount`. This is a structural consequence of `MAX_FEE_BPS = 1000 < BPS_DENOMINATOR = 10_000`, but must be re-verified for v2's configurable BPS surface.

**Why it matters (concrete exploit):**
If the cap were ever bypassed (or removed during a future "upgrade") and combined BPS exceeded 10_000, `treasury + ops > total_pot`, the first `checked_sub` returns `Err(ArithmeticOverflow)`, and the entire match permanently bricks in `Active` state — neither settle nor cancel paths can recover. v1 has the cap baked into constants (700+300=1000<10000). v2 has the cap enforced at update_config but NOT re-checked at settle_match (per A04). Verifying the relationship `cap → no_underflow` formally for all valid v2 BPS combinations closes the A04 gap as a regression guard.

**Tool:** Proptest
**Confidence:** high
**Based on:** VP-012 (fee never exceeds principal), prior BOK INV-11

**Formal Property:**
```
forall wager in [MIN_WAGER, MAX_WAGER]:
forall num_deposited in [2, 10]:
forall (treasury_bps, ops_bps) where treasury_bps + ops_bps <= MAX_FEE_BPS (=1000):
  let total_pot = wager × num_deposited
  let treasury = total_pot × treasury_bps / 10_000  (floor)
  let ops      = total_pot × ops_bps / 10_000       (floor)
  assert: total_pot >= treasury
  assert: total_pot - treasury >= ops
  // Equivalent: total_pot.checked_sub(treasury).and_then(|x| x.checked_sub(ops)).is_some()
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    #[test]
    fn i_fee_3_no_underflow_v2(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        bps_split in (0u16..=1000u16).prop_flat_map(|t| (Just(t), 0u16..=(1000 - t))),
    ) {
        let (treasury_bps, ops_bps) = bps_split;
        let total_pot_128 = (wager as u128) * (num_deposited as u128);
        let treasury = (total_pot_128 * treasury_bps as u128 / 10_000) as u64;
        let ops = (total_pot_128 * ops_bps as u128 / 10_000) as u64;
        let total_pot = total_pot_128 as u64;

        prop_assert!(total_pot >= treasury,
            "1st sub underflows: pot={} < treasury={}", total_pot, treasury);
        let after_t = total_pot - treasury;
        prop_assert!(after_t >= ops,
            "2nd sub underflows: after_t={} < ops={}", after_t, ops);

        // Stronger: the cap (combined ≤ 1000) implies treasury + ops ≤ pot/10,
        // i.e. fees are at most 10% — winner gets at least 90% of pot.
        prop_assert!(treasury + ops <= total_pot / 10 + 2,
            "Combined fees exceed pot/10 + dust margin");
    }
}
```

---

### I-FEE-4: u128 Widening Headroom

**What it checks:**
The intermediate u128 product `total_pot_128 × bps` never approaches `u128::MAX` for any valid `(wager, num_deposited, bps)`. Empirically: max product = `100_000_000_000 × 10 × 1_000 = 10^15`, while `u128::MAX ≈ 3.4 × 10^38`. Headroom is ~3 × 10^23 — astronomical. The narrowing back to u64 (`total_pot_128 as u64`) is also lossless because `wager × num_deposited ≤ 10^12 < u64::MAX (~1.8 × 10^19)`.

**Why it matters (concrete exploit):**
If headroom were ever consumed (e.g., MAX_WAGER raised by 6+ orders of magnitude in a future upgrade, or num_deposited surface widened), the u128 multiplication `total_pot_128.checked_mul(bps)` would overflow and fail with `ArithmeticOverflow`, bricking settle_match. The risk today is zero, but verifying empirically gives a regression guardrail against future config changes that would silently consume headroom. Solana's CU costs make verifying this once-and-for-all preferable to runtime checks.

**Tool:** Proptest
**Confidence:** medium (the property is trivially true at current constants, but worth asserting empirically as a regression bound)
**Based on:** VP-015 (BPS overflow), prior BOK INV-3

**Formal Property:**
```
forall wager in [MIN_WAGER, MAX_WAGER]:
forall num_deposited in [2, MAX_PLAYERS=10]:
forall bps in [0, MAX_FEE_BPS=1000]:
  let prod = (wager as u128) × (num_deposited as u128) × (bps as u128)
  assert: prod < u128::MAX
  assert: prod < 10^17 (concrete empirical headroom assertion)

forall wager in [MIN_WAGER, MAX_WAGER]:
forall num_deposited in [2, 10]:
  let total_pot_128 = (wager as u128) × (num_deposited as u128)
  assert: total_pot_128 <= u64::MAX as u128 (narrowing safety)
  assert: (total_pot_128 as u64) as u128 == total_pot_128 (round-trip identity)
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    #[test]
    fn i_fee_4_u128_widening_headroom(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        bps in 0u16..=1000u16,
    ) {
        let pot_128 = (wager as u128).checked_mul(num_deposited as u128);
        prop_assert!(pot_128.is_some(), "wager × n overflows u128 (impossible at current bounds)");
        let pot = pot_128.unwrap();
        prop_assert!(pot <= u64::MAX as u128,
            "narrowing to u64 truncates: pot={}, u64::MAX={}", pot, u64::MAX as u128);

        let prod = pot.checked_mul(bps as u128);
        prop_assert!(prod.is_some(), "pot × bps overflows u128 (impossible at current bounds)");
        let prod = prod.unwrap();
        // Tighter empirical bound: expected max is 10^15
        prop_assert!(prod < 10u128.pow(17),
            "headroom assertion violated: prod={} >= 10^17", prod);
    }
}
```

---

### I-CAP-1: Cap Holds at Init Entry Point (initialize_config)

**What it checks:**
At v2:75-79 (`initialize_config`), the combined-BPS check `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32` rejects any input with `treasury + ops > 1000`. The `as u32` widening prevents the u16 sum from wrapping (max u16 sum = 65_535 + 65_535 = 131_070, which fits trivially in u32). After init, `cfg.fee_bps_treasury + cfg.fee_bps_ops <= 1000` holds.

**Why it matters (concrete exploit):**
If the u32 widening were missed and the sum were computed in u16, attacker could pass `(treasury_bps=33_000, ops_bps=33_000)`, sum wraps to `(33_000 + 33_000) mod 65_536 = 464`, passes the `<= 1000` check, and now `cfg.fee_bps_treasury = 33_000` is silently 330% of pot. settle_match's u128 widening preserves this poisoned value, so `treasury_amount = pot × 33_000 / 10_000 = 3.3 × pot` — the first `checked_sub` underflows, bricking ALL future matches that snapshot this config. This invariant verifies the widening is correct as a regression guard.

**Tool:** Proptest (logic-level) + LiteSVM (program-level)
**Confidence:** high
**Based on:** VP-012, VP-015, novel (combined cap with u16 fields)

**Formal Property:**
```
forall (t_bps, o_bps) in [0, u16::MAX] × [0, u16::MAX]:
  let combined_u32 = (t_bps as u32) + (o_bps as u32)
  if combined_u32 <= 1000:
    initialize_config(authority, treasury, ops, t_bps, o_bps) -> Ok
    cfg.fee_bps_treasury == t_bps
    cfg.fee_bps_ops == o_bps
    cfg.fee_bps_treasury + cfg.fee_bps_ops <= 1000
  else:
    initialize_config(...) -> Err(FeesTooHigh)
```

**Proptest sketch (logic-level):**
```rust
fn validate_init_bps(t_bps: u16, o_bps: u16) -> Result<(), &'static str> {
    if (t_bps as u32) + (o_bps as u32) > 1000 {
        Err("FeesTooHigh")
    } else {
        Ok(())
    }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    #[test]
    fn i_cap_1_init_cap_holds(t_bps in 0u16..=u16::MAX, o_bps in 0u16..=u16::MAX) {
        let result = validate_init_bps(t_bps, o_bps);
        let combined = (t_bps as u32) + (o_bps as u32);
        if combined <= 1000 {
            prop_assert!(result.is_ok(), "Valid combined {} rejected", combined);
        } else {
            prop_assert!(result.is_err(), "Combined {} > 1000 accepted", combined);
        }
    }

    /// Specifically verify the widening doesn't wrap on max-u16 inputs
    #[test]
    fn i_cap_1_no_u16_wrap(t_bps in 30_000u16..=u16::MAX, o_bps in 30_000u16..=u16::MAX) {
        // These sums would wrap if computed in u16; widening to u32 must prevent that.
        let combined = (t_bps as u32) + (o_bps as u32);
        prop_assert!(combined > 1000, "Test inputs should always be > 1000 combined");
        prop_assert!(validate_init_bps(t_bps, o_bps).is_err());
    }
}
```

**LiteSVM sketch (program-level):**
```rust
#[test]
fn i_cap_1_init_rejects_combined_over_cap() {
    let mut svm = setup_svm();
    // (501, 500) → combined 1001 → must be rejected
    let result = call_initialize_config(&mut svm, authority, treasury, ops, 501, 500);
    assert_eq!(result.unwrap_err(), EscrowError::FeesTooHigh);
    // (500, 500) → combined 1000 → exactly at cap, accepted
    let result = call_initialize_config(&mut svm, authority, treasury, ops, 500, 500);
    assert!(result.is_ok());
    // (33_000, 33_000) → wraps in u16 to 464; widening to u32 → 66_000, rejected
    let result = call_initialize_config(&mut svm, authority, treasury, ops, 33_000, 33_000);
    assert_eq!(result.unwrap_err(), EscrowError::FeesTooHigh);
}
```

---

### I-CAP-2: Cap Holds at Update Entry Point (update_config)

**What it checks:**
At v2:128-131 (`update_config`), AFTER all five Option fields are applied, the combined-BPS check fires. The post-update validation guarantees that any state observable after a successful `update_config` call satisfies `cfg.fee_bps_treasury + cfg.fee_bps_ops <= 1000`. Multi-step rotation cannot escape the cap because each call's post-state is the next call's pre-state. (See SOS H011 Step 3 confirmation.)

**Why it matters (concrete exploit):**
If the cap were missing, a malicious authority would set `(t=10_000, o=0)` — 100% of pot to treasury — bricking settle (treasury_amount > total_pot, first `checked_sub` returns Err). If the cap were per-field instead of combined, authority would set `(t=1000, o=1000)` for combined 20%, doubling extraction. The current combined check correctly bounds total extraction at 10%. The invariant verifies the check fires correctly across all u16 input combinations and across multi-step rotation sequences.

**Tool:** Proptest (logic) + LiteSVM (program-level multi-step)
**Confidence:** high
**Based on:** VP-018 (dynamic fee update), SOS H011 Step 3

**Formal Property:**
```
For any sequence of update_config calls C1, C2, ..., Cn each individually accepted:
  forall i in [1, n]:
    state_after(Ci).fee_bps_treasury + state_after(Ci).fee_bps_ops <= 1000

i.e. the cap holds at every observable state, not just at the final state.

Per-call:
  Let pre = (cfg.fee_bps_treasury, cfg.fee_bps_ops) before call
  Let post = (cfg.fee_bps_treasury, cfg.fee_bps_ops) after applying all Some(...) updates
  Call accepted iff (post.0 as u32) + (post.1 as u32) <= 1000
```

**Proptest sketch (logic-level multi-step):**
```rust
#[derive(Clone)]
struct ConfigState { t: u16, o: u16 }

fn apply_update(s: &ConfigState, new_t: Option<u16>, new_o: Option<u16>) -> Result<ConfigState, &'static str> {
    let post = ConfigState {
        t: new_t.unwrap_or(s.t),
        o: new_o.unwrap_or(s.o),
    };
    if (post.t as u32) + (post.o as u32) > 1000 {
        Err("FeesTooHigh")
    } else {
        Ok(post)
    }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 10_000, ..Default::default() })]

    /// Multi-step rotation: any sequence of accepted updates leaves the cap intact.
    #[test]
    fn i_cap_2_multistep_cap_holds(
        initial in (0u16..=1000u16).prop_flat_map(|t| (Just(t), 0u16..=(1000 - t))),
        updates in proptest::collection::vec((proptest::option::of(0u16..=u16::MAX), proptest::option::of(0u16..=u16::MAX)), 1..20),
    ) {
        let mut state = ConfigState { t: initial.0, o: initial.1 };
        prop_assert!((state.t as u32) + (state.o as u32) <= 1000, "Initial state invalid");

        for (new_t, new_o) in updates {
            match apply_update(&state, new_t, new_o) {
                Ok(post) => {
                    prop_assert!((post.t as u32) + (post.o as u32) <= 1000,
                        "Post-update cap violated: t={}, o={}, sum={}",
                        post.t, post.o, (post.t as u32) + (post.o as u32));
                    state = post;
                }
                Err(_) => {
                    // Update rejected → state unchanged; cap still holds
                    prop_assert!((state.t as u32) + (state.o as u32) <= 1000);
                }
            }
        }
    }
}
```

**LiteSVM sketch:**
```rust
#[test]
fn i_cap_2_update_cap_holds_program_level() {
    let mut svm = setup_svm_with_init(700, 300);
    // (None, Some(301)) → 700+301=1001 > 1000 → reject
    let result = call_update_config(&mut svm, None, None, None, None, Some(301));
    assert_eq!(result.unwrap_err(), EscrowError::FeesTooHigh);
    // Verify state unchanged after rejected call
    let cfg = read_config(&svm);
    assert_eq!((cfg.fee_bps_treasury, cfg.fee_bps_ops), (700, 300));

    // Multi-step: try to ratchet via two accepted updates
    call_update_config(&mut svm, None, None, None, Some(700), Some(0)).unwrap();  // 700+0=700, ok
    let result = call_update_config(&mut svm, None, None, None, None, Some(301));  // 700+301=1001, reject
    assert!(result.is_err());
}
```

---

### I-CAP-3: Snapshot Atomicity at create_match

**What it checks:**
At v2:201-219 (`create_match`), the four snapshot fields (`treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot`) are written in the SAME instruction handler that sets `state = AwaitingDeposits`. Solana transactions are atomic — if the handler returns `Ok`, all five fields are written; if it returns `Err`, none are. There is no observable on-chain state where `state == AwaitingDeposits` but any snapshot field still has its default zero value.

**Why it matters (concrete exploit):**
If the snapshot were written in a separate instruction (e.g., a deferred "finalize_match" call), an attacker could observe the partial state — `state = AwaitingDeposits` but `fee_bps_treasury_snapshot = 0`, `treasury_snapshot = Pubkey::default()` — and either (a) deposit into the match, then race a `settle_match` call where the snapshot validation `treasury.key() == escrow.treasury_snapshot` would compare against `Pubkey::default()`, allowing any account to pass; or (b) the BPS being 0 means treasury_amount = 0, so winner gets 100% (no protocol fee). This invariant verifies the all-or-nothing semantics structurally.

**Tool:** LiteSVM (atomicity is an on-chain property — pure logic test cannot capture it)
**Confidence:** high
**Based on:** VP-018 (race conditions on dynamic fee state), SOS H011 Step 5

**Formal Property:**
```
forall match_id, valid create_match args:
  After call_create_match(match_id, args) returns Ok:
    escrow.state == AwaitingDeposits
    escrow.treasury_snapshot != Pubkey::default()  (= cfg.treasury at call time)
    escrow.ops_snapshot != Pubkey::default()        (= cfg.ops at call time)
    // BPS may legitimately be 0, but matches cfg's value at call time
    escrow.fee_bps_treasury_snapshot == cfg_at_call.fee_bps_treasury
    escrow.fee_bps_ops_snapshot == cfg_at_call.fee_bps_ops
  After call_create_match(...) returns Err:
    escrow account does not exist (init failed) OR all fields == default

Negative test:
  Run update_config concurrently mid-create — impossible (single tx is atomic),
  but assert that after the create returns, snapshots match cfg state at the
  effective tx slot, NOT at current slot.
```

**LiteSVM sketch:**
```rust
#[test]
fn i_cap_3_snapshot_atomicity() {
    let mut svm = setup_svm_with_init(700, 300);

    // Snapshot the cfg state right before create_match
    let cfg_before = read_config(&svm);

    let match_id = "test-atomicity-1".to_string();
    call_create_match(&mut svm, &match_id, /* args */).unwrap();
    let escrow = read_escrow(&svm, &match_id);

    // All four snapshot fields populated atomically with state transition
    assert_eq!(escrow.state, MatchState::AwaitingDeposits);
    assert_eq!(escrow.treasury_snapshot, cfg_before.treasury);
    assert_eq!(escrow.ops_snapshot, cfg_before.ops);
    assert_eq!(escrow.fee_bps_treasury_snapshot, cfg_before.fee_bps_treasury);
    assert_eq!(escrow.fee_bps_ops_snapshot, cfg_before.fee_bps_ops);

    // None should be defaults
    assert_ne!(escrow.treasury_snapshot, Pubkey::default());
    assert_ne!(escrow.ops_snapshot, Pubkey::default());
    // (BPS could legitimately be 0, but we set 700/300 at init)
    assert_ne!(escrow.fee_bps_treasury_snapshot, 0);
    assert_ne!(escrow.fee_bps_ops_snapshot, 0);
}

#[test]
fn i_cap_3_snapshot_immutable_after_create() {
    // Create match, then update_config — snapshot must NOT change
    let mut svm = setup_svm_with_init(700, 300);
    call_create_match(&mut svm, "match-A", /* args */).unwrap();

    let snap_before = read_escrow(&svm, "match-A");

    call_update_config(&mut svm, None, Some(new_treasury), None, Some(900), Some(100)).unwrap();

    let snap_after = read_escrow(&svm, "match-A");

    // All four snapshot fields unchanged — config rotation does NOT affect in-flight match
    assert_eq!(snap_before.treasury_snapshot, snap_after.treasury_snapshot);
    assert_eq!(snap_before.ops_snapshot, snap_after.ops_snapshot);
    assert_eq!(snap_before.fee_bps_treasury_snapshot, snap_after.fee_bps_treasury_snapshot);
    assert_eq!(snap_before.fee_bps_ops_snapshot, snap_after.fee_bps_ops_snapshot);
}
```

---

### I-CAP-4: Settle Reads Only Snapshot, Never Live Config

**What it checks:**
`settle_match` (v2:387-454) reads `wager_lamports`, `match_id`, `treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot`, `deposits_mask` exclusively from `ctx.accounts.escrow.*` — NEVER from `ctx.accounts.config.*`. Cross-instruction config rotation between `create_match` and `settle_match` cannot alter the in-flight match's settlement parameters.

**Why it matters (concrete exploit):**
If `settle_match` read live `config.fee_bps_*` instead of `escrow.fee_bps_*_snapshot`, a malicious authority could (a) create a match with low BPS to attract players, (b) wait for deposits and match activation, (c) call `update_config` to push BPS to the cap, (d) call `settle_match` which now reads the rotated BPS and extracts maximum fee. This is the H028v1 attack pattern that the snapshot architecture explicitly prevents. The invariant verifies the settle path is fully insulated from post-create config rotation.

**Tool:** LiteSVM (the property is "no read of config.fee_bps_* in settle path" — best verified by program-level behavior, since static analysis would require Rust source inspection)
**Confidence:** high
**Based on:** VP-018, SOS H011 Step 6

**Formal Property:**
```
For match M created at time t1 with snapshot S = (t_bps_1, o_bps_1, treasury_1, ops_1):
  forall config rotation R applied at t2 > t1, R ≠ S:
    After settle_match(M) at t3 > t2:
      treasury account receives fee using t_bps_1 (NOT R.t_bps)
      ops account receives fee using o_bps_1 (NOT R.o_bps)
      Constraint check: treasury.key() == treasury_1 (NOT R.treasury)
      Constraint check: ops.key() == ops_1 (NOT R.ops)
```

**LiteSVM sketch:**
```rust
#[test]
fn i_cap_4_settle_uses_snapshot_not_live_config() {
    // Setup: init with (700, 300), create match, deposit, activate
    let mut svm = setup_svm_with_init(700, 300);
    call_create_match(&mut svm, "match-snapshot-test", /* wager=1_000_000_000 */).unwrap();
    deposit_all_players(&mut svm, "match-snapshot-test");
    activate_match(&mut svm, "match-snapshot-test");

    // ROTATE config mid-flight: change BPS to (1000, 0) and treasury to attacker
    let attacker_treasury = Pubkey::new_unique();
    call_update_config(&mut svm, None, Some(attacker_treasury), None, Some(1000), Some(0)).unwrap();

    // settle_match must use the ORIGINAL (700, 300) snapshot and ORIGINAL treasury
    let original_treasury = svm.cfg_treasury_at_create;
    let total_pot = 1_000_000_000 * 2; // 2 players, 1 SOL wager each

    let treasury_balance_before = svm.get_balance(original_treasury);
    let attacker_balance_before = svm.get_balance(attacker_treasury);

    call_settle_match(&mut svm, "match-snapshot-test", winner_pubkey, original_treasury, original_ops).unwrap();

    let treasury_received = svm.get_balance(original_treasury) - treasury_balance_before;
    let attacker_received = svm.get_balance(attacker_treasury) - attacker_balance_before;

    // Original treasury receives 7% (snapshotted), NOT 10% (live config)
    assert_eq!(treasury_received, total_pot * 700 / 10_000,
        "Treasury received {} (live BPS) instead of snapshotted 7%", treasury_received);
    // Attacker receives nothing (settle constraint failed if attacker tried as treasury)
    assert_eq!(attacker_received, 0, "Attacker treasury received funds — snapshot bypass!");
}

#[test]
fn i_cap_4_settle_rejects_live_treasury_after_rotation() {
    // Verify the constraint: passing live config.treasury (rotated) instead of snapshot fails
    let mut svm = setup_svm_with_init(700, 300);
    call_create_match(&mut svm, "match-X", /* args */).unwrap();
    activate_match(&mut svm, "match-X");

    let attacker_treasury = Pubkey::new_unique();
    call_update_config(&mut svm, None, Some(attacker_treasury), None, None, None).unwrap();

    // Try to settle with the LIVE (rotated) treasury — must fail
    let result = call_settle_match(&mut svm, "match-X", winner, attacker_treasury, /* ops */);
    assert_eq!(result.unwrap_err(), EscrowError::InvalidTreasury);
}
```

---

### I-CAP-5: BPS Constants Match Spec at Init (v1) AND Defaults (v2)

**What it checks:**
v1 has hardcoded constants `TREASURY_BPS=700`, `OPS_BPS=300`, `BPS_DENOMINATOR=10_000`. These match the documented 90/7/3 split and must not drift via accidental refactor. v2 deployment intent (per `init-config.mjs`) is to bootstrap with `(700, 300)`. This invariant is a regression guard: if anyone changes the constants or the bootstrap script, the test fails. (Equivalent to Feb's INV-9, kept for parity.)

**Why it matters (concrete exploit):**
A typo in `TREASURY_BPS = 7000` (instead of 700) would set treasury fee to 70% of pot, brick settlement (treasury > pot, underflow), and lock all funds. This is a static check, but high-value as a regression sentinel. v2's bootstrap script `init-config.mjs` is off-chain Node code, also worth checking, though less critical since update_config can correct mistakes post-deploy.

**Tool:** Proptest (single-case sanity assertion)
**Confidence:** high
**Based on:** VP-018, prior BOK INV-9

**Formal Property:**
```
v1: TREASURY_BPS == 700
v1: OPS_BPS == 300
v1: BPS_DENOMINATOR == 10_000
v1: TREASURY_BPS + OPS_BPS == 1000
v1: TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR

v2: MAX_FEE_BPS == 1000
v2: BPS_DENOMINATOR == 10_000
v2 (deployment intent only — soft assertion): cfg.fee_bps_treasury == 700 at bootstrap
v2 (deployment intent only — soft assertion): cfg.fee_bps_ops == 300 at bootstrap
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 1, ..Default::default() })]

    #[test]
    fn i_cap_5_v1_bps_constants(_dummy in Just(0u8)) {
        prop_assert_eq!(TREASURY_BPS, 700);
        prop_assert_eq!(OPS_BPS, 300);
        prop_assert_eq!(BPS_DENOMINATOR, 10_000);
        prop_assert!(TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR);
    }

    #[test]
    fn i_cap_5_v2_max_fee_bps(_dummy in Just(0u8)) {
        prop_assert_eq!(MAX_FEE_BPS, 1_000);
        prop_assert_eq!(BPS_DENOMINATOR, 10_000u128);
    }
}
```

---

### I-FEE-5: Fee Minimum Guarantee Across BPS Surface (v2)

**What it checks:**
At MIN_WAGER (10_000) × MIN_PLAYERS (2) = 20_000 lamport pot, the smallest non-zero BPS that still produces a non-zero fee is `bps × 20_000 / 10_000 >= 1`, i.e. `bps >= 1` (1 lamport). If BPS is set below the threshold for fee >= 1, the fee floors to zero and the protocol earns nothing for that match. v1 verified this for hardcoded 700/300. v2's surface allows BPS in [0, 1000] — verify the runtime can produce zero-fee matches if authority sets BPS too low.

**Why it matters (concrete exploit):**
If authority sets `(t=0, o=0)` via update_config, every new match has zero protocol fee — winner gets 100%. This is silently allowed by the cap (combined 0 ≤ 1000). The protocol's economic model breaks but no on-chain check fires. The invariant flags this as a soft-warning regression: "treasury_bps=0 OR ops_bps=0 is silently valid at the cap level," confirming that operational policy must enforce this off-chain. Documents the gap rather than fixing it.

**Tool:** Proptest
**Confidence:** medium (this is more a regression documentation invariant than a hard-fail invariant — protocol may legitimately want 0% fees in the future)
**Based on:** VP-013 (zero input → zero fee), VP-014, prior BOK INV-2

**Formal Property:**
```
Soft / informational invariant:

forall (t_bps, o_bps) where t_bps + o_bps <= 1000:
forall wager in [MIN_WAGER, MAX_WAGER]:
forall num_deposited in [2, 10]:
  let pot = wager × num_deposited
  let treasury = pot × t_bps / 10_000
  let ops = pot × o_bps / 10_000
  // treasury == 0 iff t_bps == 0 OR pot < ceil(10_000 / t_bps)
  // ops == 0 iff o_bps == 0 OR pot < ceil(10_000 / o_bps)

Hard invariant (positive case):
  if t_bps >= 1 and pot >= ceil(10_000 / t_bps): treasury >= 1
  if o_bps >= 1 and pot >= ceil(10_000 / o_bps): ops >= 1

Documentation invariant (zero-fee surface):
  At MIN_WAGER * MIN_PLAYERS = 20_000:
  - treasury == 0 iff t_bps == 0 (since 1 * 20_000 / 10_000 = 2 >= 1)
  - ops == 0 iff o_bps == 0
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    /// Hard: when BPS is non-zero and pot is large enough, fee is non-zero
    #[test]
    fn i_fee_5_nonzero_bps_yields_nonzero_fee(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        t_bps in 1u16..=1000u16,
    ) {
        let pot = wager as u128 * num_deposited as u128;
        let treasury = (pot * t_bps as u128 / 10_000) as u64;
        if pot >= (10_000u128 / t_bps as u128 + 1) {
            prop_assert!(treasury >= 1,
                "Non-zero BPS should yield non-zero fee at sufficient pot: pot={}, t_bps={}",
                pot, t_bps);
        }
    }

    /// Soft documentation: zero BPS yields zero fee (no surprise)
    #[test]
    fn i_fee_5_zero_bps_yields_zero_fee(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
    ) {
        let pot_128 = (wager as u128) * (num_deposited as u128);
        let treasury = (pot_128 * 0 / 10_000) as u64;
        prop_assert_eq!(treasury, 0, "0 BPS must yield 0 fee");
    }
}
```

---

### I-FEE-6: Fee Monotonicity Across BPS and Player Count (v2)

**What it checks:**
For fixed `(treasury_bps, ops_bps)`, the treasury and ops amounts are monotonically non-decreasing in both wager and num_deposited. For fixed `(wager, num_deposited)`, treasury_amount is non-decreasing in `treasury_bps` (with ops_bps held). For fixed `(wager, num_deposited, ops_bps)`, the winner's amount is monotonically non-INCREASING in `treasury_bps` (more fee → less winner).

**Why it matters (concrete exploit):**
Non-monotonicity in the BPS dimension would create arbitrage: at certain magic BPS values, the player could pay LESS protocol fee than at lower BPS values. A specific concern: integer-truncation cliffs where `pot × bps / 10_000` crosses a boundary non-monotonically. While floor division on linearly increasing numerators is monotone in theory, it's worth verifying empirically across the v2 surface to catch any algorithm bug.

**Tool:** Proptest
**Confidence:** medium (this is a mathematical consequence of floor division, but worth empirical confirmation across the v2 surface)
**Based on:** VP-016 (tiered fee monotonicity), prior BOK INV-10

**Formal Property:**
```
forall (w, n, t_bps, o_bps), (w', n', t_bps', o_bps') where:
  w <= w' AND n <= n' AND t_bps <= t_bps' AND t_bps' + o_bps <= 1000:

  treasury_amount(w, n, t_bps, o_bps) <= treasury_amount(w', n', t_bps', o_bps)
  ops_amount(w, n, t_bps, o_bps) <= ops_amount(w', n', t_bps, o_bps')  [for o_bps' >= o_bps]

forall (w, n, o_bps), t_bps <= t_bps':
  winner_amount(w, n, t_bps', o_bps) <= winner_amount(w, n, t_bps, o_bps)
  (More treasury fee means less for winner, holding ops fee fixed.)
```

**Proptest sketch:**
```rust
proptest! {
    #![proptest_config(ProptestConfig { cases: 50_000, ..Default::default() })]

    /// Larger wager → larger fees (BPS held constant)
    #[test]
    fn i_fee_6_wager_monotonicity(
        bps_split in (0u16..=1000u16).prop_flat_map(|t| (Just(t), 0u16..=(1000 - t))),
        num_deposited in 2u32..=10u32,
        w1 in 10_000u64..=100_000_000_000u64,
        w2 in 10_000u64..=100_000_000_000u64,
    ) {
        let (t_bps, o_bps) = bps_split;
        let (lo, hi) = if w1 <= w2 { (w1, w2) } else { (w2, w1) };
        let r_lo = settle_math_v2(lo, num_deposited, t_bps, o_bps);
        let r_hi = settle_math_v2(hi, num_deposited, t_bps, o_bps);

        prop_assert!(r_hi.treasury >= r_lo.treasury);
        prop_assert!(r_hi.ops >= r_lo.ops);
        prop_assert!(r_hi.winner >= r_lo.winner);
    }

    /// Higher treasury_bps → lower winner (ops_bps fixed)
    #[test]
    fn i_fee_6_bps_monotonicity_winner(
        wager in 10_000u64..=100_000_000_000u64,
        num_deposited in 2u32..=10u32,
        o_bps in 0u16..=500u16,
        t1 in 0u16..=500u16,
        t2 in 0u16..=500u16,
    ) {
        // Both within cap (max 500+500=1000)
        let (lo_t, hi_t) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
        let r_lo = settle_math_v2(wager, num_deposited, lo_t, o_bps);
        let r_hi = settle_math_v2(wager, num_deposited, hi_t, o_bps);

        prop_assert!(r_hi.treasury >= r_lo.treasury, "Treasury non-monotone in t_bps");
        prop_assert!(r_hi.winner <= r_lo.winner, "Winner non-monotone in t_bps");
    }
}
```

---

### I-FEE-7: Conservation Across Cancel/Refund Path

**What it checks:**
In `cancel_match` and `permissionless_reclaim` (both versions), the total lamports refunded equals the total lamports deposited. Each deposited player receives exactly `wager_lamports` back; non-depositors receive nothing. The refund path uses NO BPS math — fees are not applied on cancellation. (Re-verifying the v1 INV-8 invariant for v2's u16 mask + 10-player surface, and incorporating SOS H023 awareness.)

**Why it matters (concrete exploit):**
SOS H023 (CRITICAL) flagged that the refund loop iterates over `remaining_accounts` rather than asserting all deposited bits are refunded. If a malicious caller passes fewer accounts than deposited bits, the loop refunds only those passed, leaving residual lamports in the escrow that `close = caller` then sweeps to the caller. This invariant is the "happy path" version: when ALL deposited players are passed, total refund = total deposited. The H023 attack scenario is BYPASSED by this invariant (no theft, no missing refunds) — but it does NOT prevent the H023 attack itself, which is a fix-needed bug, not a math bug. This invariant verifies the math is correct when called correctly; H023's fix requires asserting `remaining_accounts.len() == deposits_mask.count_ones()`.

**Tool:** LiteSVM (multi-account, end-to-end)
**Confidence:** high
**Based on:** VP-017 (refund conservation), prior BOK INV-8

**Formal Property:**
```
forall wager, max_players in [2, 10], deposits_mask satisfying mask & ((1<<max_players)-1) == mask:
  let num_deposited = deposits_mask.count_ones()
  let total_deposited = wager × num_deposited
  After cancel_match (or permissionless_reclaim) with remaining_accounts = ALL deposited players:
    sum_over_depositors(post_balance - pre_balance) == total_deposited
    escrow.lamports == 0 (after Anchor close = caller sweeps)
    AND for each non-depositor: post_balance == pre_balance
```

**LiteSVM sketch:**
```rust
#[test_case(MIN_WAGER, 2, 0b11)]   // 2-player both deposited
#[test_case(MAX_WAGER, 4, 0b1111)] // 4-player all deposited
#[test_case(50_000_000, 10, 0b11_1111_1111)] // 10-player all deposited (v2)
#[test_case(MIN_WAGER, 2, 0b01)]   // 2-player only first deposited
fn i_fee_7_cancel_refund_conservation(wager: u64, max_players: u8, deposits_mask: u16) {
    let mut svm = setup_svm_v2(wager);
    let players = create_players(max_players);

    call_create_match(&mut svm, "test-cancel", &players, wager);

    // Selectively deposit per mask
    for i in 0..max_players {
        if (deposits_mask >> i) & 1 == 1 {
            call_deposit_wager(&mut svm, "test-cancel", &players[i as usize]);
        }
    }

    let pre_balances: Vec<u64> = players.iter().map(|p| svm.get_balance(p.pubkey())).collect();

    // Cancel with ALL depositors in remaining_accounts
    let depositors: Vec<_> = (0..max_players).filter(|i| (deposits_mask >> i) & 1 == 1).map(|i| players[i as usize].pubkey()).collect();
    call_cancel_match(&mut svm, "test-cancel", &depositors).unwrap();

    let post_balances: Vec<u64> = players.iter().map(|p| svm.get_balance(p.pubkey())).collect();

    // Each deposited player got wager back; non-depositors unchanged
    for i in 0..max_players {
        if (deposits_mask >> i) & 1 == 1 {
            // Deposited → must receive wager back (excluding tx fees, which are 0 in LiteSVM by default)
            assert_eq!(post_balances[i as usize] - pre_balances[i as usize], wager);
        } else {
            // Not deposited → no change
            assert_eq!(post_balances[i as usize], pre_balances[i as usize]);
        }
    }
}
```

---

### I-FEE-8: Per-Match-Snapshot Drift Detection (Defense-in-Depth)

**What it checks:**
After a match is created, the four snapshot fields on the escrow PDA are NEVER modified by ANY subsequent instruction (deposit_wager, start_with_depositors, settle_match, cancel_match, permissionless_reclaim). The snapshot is write-once at create_match. This is a regression guard against future code changes that might inadvertently mutate snapshot fields.

**Why it matters (concrete exploit):**
If a future patch added a "fee_renegotiation" feature that mutated snapshots mid-match, an attacker could (a) deposit, (b) call the renegotiation to lower BPS to 0, (c) call settle and receive 100% (no protocol fee). The current code design guarantees write-once semantics by only assigning snapshot fields in create_match. This invariant is a regression guard that asserts the property programmatically — any future PR that adds a snapshot mutation breaks the test.

**Tool:** LiteSVM
**Confidence:** medium (current code is correct; this is forward-looking regression coverage)
**Based on:** VP-018, novel (write-once invariant)

**Formal Property:**
```
forall match M created at time t1 with snapshot S = (treasury_1, ops_1, t_bps_1, o_bps_1):
  forall instructions I called on M at time t2 > t1, I in {deposit_wager, start_with_depositors,
                                                            settle_match, cancel_match,
                                                            permissionless_reclaim}:
    After I returns (Ok or Err):
      escrow.treasury_snapshot == treasury_1
      escrow.ops_snapshot == ops_1
      escrow.fee_bps_treasury_snapshot == t_bps_1
      escrow.fee_bps_ops_snapshot == o_bps_1
```

**LiteSVM sketch:**
```rust
#[test]
fn i_fee_8_snapshot_immutable_through_lifecycle() {
    let mut svm = setup_svm_v2(1_000_000_000); // 1 SOL wager
    call_create_match(&mut svm, "lifecycle-test", /* args */).unwrap();

    let snap_after_create = read_escrow_snapshots(&svm, "lifecycle-test");

    // After deposit
    deposit_all_players(&mut svm, "lifecycle-test");
    let snap_after_deposit = read_escrow_snapshots(&svm, "lifecycle-test");
    assert_eq!(snap_after_create, snap_after_deposit, "deposit_wager mutated snapshot");

    // After start_with_depositors (alternative activation path)
    // ... or wait for natural activation ...

    // After (failed) settle attempts mid-deposit
    let bad_settle = call_settle_match(&mut svm, "lifecycle-test", /* invalid winner */);
    assert!(bad_settle.is_err());
    let snap_after_bad_settle = read_escrow_snapshots(&svm, "lifecycle-test");
    assert_eq!(snap_after_create, snap_after_bad_settle, "failed settle mutated snapshot");

    // After successful settle (PDA still exists if close = authority hasn't run yet)
    activate_match(&mut svm, "lifecycle-test");
    call_settle_match(&mut svm, "lifecycle-test", winner, treasury, ops).unwrap();
    // Note: After settle + close, the PDA is closed and snapshots no longer readable.
    // The invariant holds vacuously post-close — no further mutation possible.
}
```

---

## Coverage Summary

| Invariant | Tool | Confidence | Required (per assignment) |
|-----------|------|-----------|--------------------------|
| I-FEE-1 (Pot conservation v2 BPS surface) | Proptest | high | YES |
| I-FEE-2 (Dust ≤ 2 across configurable BPS) | Proptest | high | YES |
| I-FEE-3 (No underflow at all valid BPS) | Proptest | high | YES |
| I-FEE-4 (u128 widening headroom) | Proptest | medium | YES |
| I-CAP-1 (Init cap with u32 widening) | Proptest+LiteSVM | high | YES (entry point: init) |
| I-CAP-2 (Update cap multi-step) | Proptest+LiteSVM | high | YES (entry point: update) |
| I-CAP-3 (Snapshot atomicity) | LiteSVM | high | YES |
| I-CAP-4 (Settle reads only snapshot) | LiteSVM | high | YES |
| I-CAP-5 (BPS constants match spec) | Proptest | high | bonus (regression guard) |
| I-FEE-5 (Min fee guarantee, soft) | Proptest | medium | bonus |
| I-FEE-6 (Monotonicity v2 surface) | Proptest | medium | bonus |
| I-FEE-7 (Cancel/refund conservation v2 surface) | LiteSVM | high | bonus (extends INV-8 to v2) |
| I-FEE-8 (Snapshot write-once) | LiteSVM | medium | bonus (defense-in-depth) |

## Coverage Gap Analysis

**Covered by these invariants:**
- All seven required invariants from the assignment (I-FEE-1 through I-FEE-4, I-CAP-1 through I-CAP-4, where I-CAP-1+I-CAP-2 jointly cover the assignment's #5 "cap holds at all entry points").
- The Feb 2026 BOK invariants for v1 are referenced and not duplicated; v2's configurable BPS surface is exercised across all invariants where applicable.

**NOT covered by these invariants (deferred to other clusters):**
1. **H023 refund-loop length assertion** — not a fee math invariant. The bug is "remaining_accounts.len() must equal count_ones(deposits_mask)" — belongs in a state-machine or refund-correctness invariant cluster. I-FEE-7 verifies the math is correct when the loop is invoked correctly; it does NOT prove the loop is invoked correctly.
2. **Duration / timestamp arithmetic** — different cluster (timestamp-duration).
3. **Account ownership / has_one / authority checks** — access control cluster.
4. **MatchEscrow::SPACE = 232 byte sizing correctness** — space-and-bounds cluster.
5. **Off-chain Node JS settlement parity** — out of scope for on-chain BOK.
6. **MIN_WAGER policy decisions** — protocol design, not arithmetic.
7. **The "authority is benevolent" trust assumption** — H011 confirms this is the residual attack surface; mitigation is operational (multisig, timelock), not arithmetic.

**Specific v2-only gaps surfaced but NOT closed by these invariants:**
- The v2 cap is a COMBINED cap, not per-field. (t=1000, o=0) is silently valid — 100% of the 10% fee window goes to one wallet. Operationally questionable but not a bug. (Documented in I-CAP-2 and SOS H011 incidental discoveries.)
- The v2 cap defaults at deployment are exactly 700/300 — combined 1000 — already AT the 10% cap. Any future BPS rotation has zero net headroom unless ops_bps was lowered first. (Documented; see SOS H011 attack-surface table.)

---

## One-Line Summary

**12 invariants proposed (7 required + 5 bonus); all marked Proptest or LiteSVM; Kani disabled (Windows). Covers v1 frozen surface plus v2's full configurable-BPS / 10-player attack surface flagged by SOS H011/A02/A03/A04, with regression guards for snapshot atomicity, settle-reads-snapshot insulation, and cap enforcement at both init and update entry points.**
