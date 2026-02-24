# Confirmed Invariants: Fee Calculations & Pot Distribution

**Status:** CONFIRMED (all 12 invariants approved for code generation)
**Source:** `.bok/invariants/fee-calculations.md`
**Confirmed:** 2026-02-23

---

## P0 — Critical

### FEE-INV-1: Conservation of Value (Pot Partition)
- **Property:** `winner_amount + treasury_amount + ops_amount == total_pot` for all valid wagers
- **Tool:** Proptest
- **Range:** `wager in [10_000, 100_000_000_000]`

### FEE-INV-7: Escrow Drain Completeness
- **Property:** After settlement, escrow balance == rent_exempt_minimum
- **Tool:** LiteSVM
- **Test cases:** MIN_WAGER, MAX_WAGER, 50_000, 1_000_000_000, 33_333

### FEE-INV-8: Cancel/Refund Conservation
- **Property:** Each refund transfers exactly `wager_lamports` per deposited player
- **Tool:** LiteSVM
- **Test cases:** (both deposited), (only p1), (only p2), at MIN and MAX wager

---

## P1 — High

### FEE-INV-2: Fee Minimum Guarantee
- **Property:** `treasury_amount >= 1 AND ops_amount >= 1` for all wagers in [MIN, MAX]
- **Tool:** Proptest
- **Boundary proof:** At MIN_WAGER=10,000: treasury=1,400, ops=600 (588x safety margin)

### FEE-INV-3: u128-to-u64 Narrowing Safety
- **Property:** `(wager as u128) * 2 <= u64::MAX` and all intermediate BPS products fit u128
- **Tool:** Proptest

### FEE-INV-11: Settlement Subtractions Never Underflow
- **Property:** `total_pot >= treasury` and `total_pot - treasury >= ops`
- **Tool:** Proptest

---

## P2 — Medium

### FEE-INV-4: Pot Overflow Safety
- **Property:** `wager.checked_mul(2).is_some()` for all wagers in [MIN, MAX]
- **Tool:** Proptest

### FEE-INV-5: Winner Gets the Remainder
- **Property:** `winner_remainder >= winner_independent` and dust <= 1 lamport
- **Tool:** Proptest

### FEE-INV-6: Fee Percentage Bounds
- **Property:** Treasury ~700 BPS, Ops ~300 BPS, Winner ~9000 BPS (within 1 BPS tolerance)
- **Tool:** Proptest

### FEE-INV-9: BPS Constant Integrity
- **Property:** `TREASURY_BPS + OPS_BPS < BPS_DENOMINATOR` and winner share == 9000 BPS
- **Tool:** Proptest (deterministic)

---

## P3 — Completeness

### FEE-INV-10: Fee Monotonicity
- **Property:** For w1 < w2, fees(w2) >= fees(w1) for all fee components
- **Tool:** Proptest
