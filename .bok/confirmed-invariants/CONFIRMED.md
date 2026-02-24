# BOK Confirmed Invariants — Priority-Ordered Master List

**Confirmed:** 2026-02-23
**Total invariants:** 25 (confirmed: 25, skipped: 0, custom added: 0)
**Tool allocation:** Proptest: 20, LiteSVM: 5, Kani: 0 (unavailable on Windows)

---

## Priority P0 — Critical (Economic Safety)

| # | ID | Invariant | Tool | Source File |
|---|-----|-----------|------|-------------|
| 1 | FEE-INV-1 | Conservation of Value (pot partition) | Proptest | `01-fee-calculations.md` |
| 2 | FEE-INV-7 | Escrow Drain Completeness (settlement drains all non-rent lamports) | LiteSVM | `01-fee-calculations.md` |
| 3 | FEE-INV-8 | Cancel/Refund Conservation (refund == deposited) | LiteSVM | `01-fee-calculations.md` |

## Priority P1 — High (Overflow & Bounds Safety)

| # | ID | Invariant | Tool | Source File |
|---|-----|-----------|------|-------------|
| 4 | FEE-INV-2 | Fee Minimum Guarantee (MIN_WAGER produces fees >= 1) | Proptest | `01-fee-calculations.md` |
| 5 | FEE-INV-3 | u128-to-u64 Narrowing Safety | Proptest | `01-fee-calculations.md` |
| 6 | FEE-INV-11 | Settlement Subtractions Never Underflow | Proptest | `01-fee-calculations.md` |
| 7 | SB-INV-3 | MIN_WAGER fee guarantee (analytical + proptest) | Proptest | `03-space-and-bounds.md` |
| 8 | SB-INV-4 | MAX_WAGER overflow safety (u64 pot, u128 intermediates) | Proptest | `03-space-and-bounds.md` |
| 9 | SB-INV-5 | Settlement conservation of value | Proptest | `03-space-and-bounds.md` |
| 10 | TS-INV-5 | Settlement/Cancel Window Mutual Exclusion | Proptest | `02-timestamp-duration.md` |
| 11 | TS-INV-2 | Deadline Ordering (settle < cancel < reclaim) | Proptest | `02-timestamp-duration.md` |

## Priority P2 — Medium (Design Validation)

| # | ID | Invariant | Tool | Source File |
|---|-----|-----------|------|-------------|
| 12 | FEE-INV-4 | Pot Overflow Safety (wager*2 fits u64) | Proptest | `01-fee-calculations.md` |
| 13 | FEE-INV-5 | Winner Gets Remainder (no dust loss) | Proptest | `01-fee-calculations.md` |
| 14 | FEE-INV-6 | Fee Percentage Bounds (~7%, ~3%, ~90%) | Proptest | `01-fee-calculations.md` |
| 15 | FEE-INV-9 | BPS Constant Integrity (fees < 100%) | Proptest | `01-fee-calculations.md` |
| 16 | SB-INV-1 | GlobalConfig::SPACE matches Borsh size | Proptest | `03-space-and-bounds.md` |
| 17 | SB-INV-2 | MatchEscrow::SPACE matches Borsh size at max match_id | Proptest | `03-space-and-bounds.md` |
| 18 | SB-INV-6 | BPS constants yield intended fee split | Proptest | `03-space-and-bounds.md` |
| 19 | TS-INV-1a | Settlement Deadline Overflow Safety | Proptest | `02-timestamp-duration.md` |
| 20 | TS-INV-1b | Cancel Timeout Overflow Safety | Proptest | `02-timestamp-duration.md` |
| 21 | TS-INV-1c | Permissionless Reclaim Overflow Safety | Proptest | `02-timestamp-duration.md` |
| 22 | TS-INV-3 | Constant Relationship (RECLAIM == 2 * TIMEOUT) | Proptest | `02-timestamp-duration.md` |
| 23 | TS-INV-4 | Timeout Reference Fallback (activated_at==0 -> created_at) | Proptest+LiteSVM | `02-timestamp-duration.md` |
| 24 | TS-INV-6 | Reclaim Window Subsumes Cancel Window | Proptest | `02-timestamp-duration.md` |

## Priority P3 — Completeness (Regression Guards)

| # | ID | Invariant | Tool | Source File |
|---|-----|-----------|------|-------------|
| 25 | FEE-INV-10 | Fee Monotonicity (larger wager -> larger fees) | Proptest | `01-fee-calculations.md` |

---

## Deferred Invariants (not confirmed — out of scope)

| ID | Reason |
|----|--------|
| FEE-INV-12 | Reclaim Mirrors Cancel — code is identical today, low regression risk. Covered implicitly by FEE-INV-8 LiteSVM tests. |
| TS-INV-7 | Active state implies activated_at > 0 — state machine invariant, not arithmetic. Recommended for separate state-machine verification file. |

**Note:** FEE-INV-12 and TS-INV-7 were proposed but are being folded into their parent LiteSVM tests (FEE-INV-8 and TS-INV-4 respectively) rather than generating separate test functions. The 25 confirmed invariants above will each produce independent verification code.

---

## Generation Targets

| Tool | Count | Estimated Tests |
|------|-------|----------------|
| Proptest | 20 | ~20 property-based test functions |
| LiteSVM | 5 | ~8 integration test functions (some invariants produce multiple test_case variants) |
| Kani | 0 | N/A (unavailable on Windows) |

## Cross-Skill Context

- **SOS H016** (off-chain float rounding): Confirmed non-issue on-chain. FEE-INV-1 through INV-6 prove integer BPS math is sound.
- **SOS H011** (negative wager): Confirmed non-issue on-chain. Solana u64 type prevents negative values. SB-INV-3/4 prove bounds are safe.
- **GL docs**: Not available. Invariants derived from code analysis + SOS findings only.
