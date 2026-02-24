# Confirmed Invariants: Account Space Sizing & Wager Bounds

**Status:** CONFIRMED (6 invariants approved for code generation)
**Source:** `.bok/invariants/space-and-bounds.md`
**Confirmed:** 2026-02-23

---

## P1 — High

### SB-INV-3: MIN_WAGER Fee Guarantee
- **Property:** For all wagers in [MIN, MAX], treasury >= 1 AND ops >= 1
- **Tool:** Proptest
- **Analytical proof:** Ops binding constraint: w >= 17 for ops >= 1; MIN_WAGER = 10,000 (588x margin)
- **Edge cases:** Exact boundary at MIN_WAGER, negative test at wager=16

### SB-INV-4: MAX_WAGER Overflow Safety
- **Property:** (a) wager*2 fits u64, (b) u128 intermediates fit u128, (c) narrowing casts are lossless
- **Tool:** Proptest
- **Concrete proof:** MAX_WAGER*2 = 200B vs u64::MAX = 18.4E18 (92M safety factor)

### SB-INV-5: Settlement Conservation of Value
- **Property:** `winner + treasury + ops == total_pot` and `treasury + ops <= total_pot`
- **Tool:** Proptest
- **Note:** Overlaps with FEE-INV-1 but independently derived from space/bounds analysis

---

## P2 — Medium

### SB-INV-1: GlobalConfig::SPACE Matches Borsh Size
- **Property:** `8 (discriminator) + borsh_serialize(GlobalConfig).len() == 106`
- **Tool:** Proptest (parametric over field values)
- **Layout:** 8 + 32 + 32 + 32 + 1 + 1 = 106

### SB-INV-2: MatchEscrow::SPACE Matches Borsh Size at Max match_id
- **Property:** `8 + borsh_serialize(MatchEscrow{match_id.len()==32}).len() == 168`
- **Tool:** Proptest
- **Sub-invariant (2b):** For all match_id.len() in 0..=32, serialized size <= SPACE

### SB-INV-6: BPS Constants Yield Intended Fee Split
- **Property:** Treasury=7%, Ops=3%, Winner=90%, and TREASURY+OPS < BPS_DENOMINATOR
- **Tool:** Proptest (deterministic assertions)
