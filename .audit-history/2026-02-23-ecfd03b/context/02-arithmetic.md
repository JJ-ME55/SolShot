# Arithmetic & Math Safety Analysis

<!-- CONDENSED_SUMMARY_START -->

## Condensed Summary

### Key Findings

1. **Checked arithmetic coverage is comprehensive.** Every runtime arithmetic operation in the program uses `checked_mul`, `checked_add`, or `checked_sub` with proper error propagation via `ok_or(EscrowError::ArithmeticOverflow)?`. Zero uses of `.unwrap()` anywhere in the program. Zero unchecked arithmetic operators (`+`, `-`, `*`, `/`) on runtime financial values.

2. **u128 widening pattern is correct for BPS math.** The settlement fee calculation widens `wager_lamports` (u64) to u128 before multiplying by BPS constants, preventing overflow at the max wager of 100 SOL (100,000,000,000 lamports). The intermediate product `200_000_000_000 * 700 = 140_000_000_000_000` fits within u64 under current bounds, but u128 provides defensive margin.

3. **Two unchecked divisions exist (lines 260, 265)** — `/ BPS_DENOMINATOR as u128`. These are safe because: (a) BPS_DENOMINATOR is a non-zero constant (10,000), (b) the dividend is always non-negative in u128, and (c) division by a non-zero constant cannot panic. However, these divisions are not using `checked_div`, creating an inconsistency in the defensive coding style.

4. **Lamport transfer arithmetic uses unchecked `-=` and `+=` operators (lines 284-291, 359-366, 421-428).** These are Rust's built-in operators on `u64` values obtained from `try_borrow_mut_lamports()`. In release builds, overflow wraps silently (EP-015). The program relies on the invariant that the escrow PDA holds sufficient lamports, but this is not explicitly verified before each subtraction.

5. **One compile-time unchecked multiplication at line 23:** `TIMEOUT_SECONDS * 2`. This is evaluated at compile time by the Rust compiler for `const` expressions. The result (172,800) is well within i64 range. Safe.

6. **Rounding direction consistently favors the protocol.** BPS division truncates (rounds down), meaning treasury and ops receive slightly less. Winner receives the remainder (`total_pot - treasury - ops`), which absorbs any rounding dust. This is the correct pattern — the protocol never overpays.

### Critical Invariants

- **INV-ARITH-01:** `winner_amount + treasury_amount + ops_amount == total_pot` — enforced by remainder strategy (line 270-274). Winner gets `total_pot - treasury - ops`, so the sum is exact by construction.
- **INV-ARITH-02:** `total_pot == wager_lamports * 2` — enforced by checked_mul on both line 213 (event) and line 253-255 (settlement).
- **INV-ARITH-03:** `treasury_amount >= 1 lamport AND ops_amount >= 1 lamport` — enforced by MIN_WAGER_LAMPORTS (10,000). At minimum: `20,000 * 700 / 10,000 = 1,400` (treasury), `20,000 * 300 / 10,000 = 600` (ops). Both above 1.
- **INV-ARITH-04:** `escrow.lamports >= winner_amount + treasury_amount + ops_amount` — NOT explicitly verified. Relies on the deposit mechanics ensuring 2x wager is in the PDA.

### Risk Assessment

- **Overall arithmetic risk: LOW.** The program demonstrates strong defensive arithmetic patterns.
- **Residual risk 1 (LOW):** Unchecked lamport `-=` operators could wrap if the escrow PDA were somehow drained of lamports by an external mechanism (e.g., rent collection, although rent-exempt accounts should not be affected). The Solana runtime would reject the transaction if the resulting lamport balance is negative, so this is a defense-in-depth concern rather than an exploitable vulnerability.
- **Residual risk 2 (INFORMATIONAL):** The `as u64` narrowing casts on lines 260, 265, 267 are safe given the bounded inputs, but lack explicit bounds assertions. A future change to MAX_WAGER_LAMPORTS could break these safety guarantees silently.

### Cross-Focus Handoffs

- **To Token/Economic Agent:** The fee split calculation (lines 253-274) produces the amounts for all three lamport transfers. Verify that `winner_amount + treasury_amount + ops_amount <= escrow.lamports()` always holds, accounting for Anchor's `close` rent reclamation.
- **To State Machine Agent:** The `activated_at == 0` sentinel value (line 141, 236, 322, 397) is used in both arithmetic (deadline calculations) and state logic (backward compat guard). The State Machine agent should verify that `activated_at` can never be set to 0 for a legitimately activated match.
- **To Error Handling Agent:** All `checked_*` operations propagate errors via `?`. Verify that `EscrowError::ArithmeticOverflow` causes a clean transaction revert with no partial state changes.
- **To Timing Agent:** Deadline arithmetic uses `i64` checked_add with timestamp values. Verify that `Clock::get()?.unix_timestamp` values from the Solana validator cannot be manipulated (EP-089) to create adversarial deadline comparisons.

<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

The SolShot escrow program demonstrates strong arithmetic safety practices throughout its 855 lines of Rust/Anchor code. Every runtime financial calculation uses checked arithmetic methods (`checked_mul`, `checked_add`, `checked_sub`) with proper error propagation. The critical BPS fee calculation widens to u128 before multiplication, preventing overflow at the maximum wager of 100 SOL. The winner-gets-remainder pattern eliminates dust loss from integer division rounding. There are no `.unwrap()` calls, no `expect()` calls, and no unchecked arithmetic operators on runtime financial values.

The analysis identified two areas of residual concern: (1) unchecked `+=` and `-=` operators on lamport balances from `try_borrow_mut_lamports()`, which rely on an implicit invariant that the PDA holds sufficient funds; and (2) `as u64` narrowing casts after u128 BPS calculations that are currently safe but could silently break if MAX_WAGER_LAMPORTS were increased. Neither represents an exploitable vulnerability under current parameters.

The program uses no floating-point arithmetic, no bit-shift operations, and no third-party math libraries — eliminating entire categories of arithmetic risk (EP-018, EP-091).

## Scope

- **Files analyzed:** `programs/solshot-escrow/src/lib.rs` (855 LOC — the entire program)
- **Functions analyzed:** `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim`, plus constant definitions, state structs, and space calculations
- **Estimated coverage:** 100% of arithmetic operations in the program

## Key Mechanisms

### 1. BPS Fee Calculation (Settlement)

**Location:** `lib.rs:252-274`

**Purpose:** Calculate the three-way split of the total pot (2x wager) into winner, treasury (7%), and ops (3%) amounts.

**How it works:**
1. **Line 253-255:** Widen `wager_lamports` (u64) to u128, then `checked_mul(2)` to get `total_pot_128`.
2. **Line 257-260:** `total_pot_128.checked_mul(TREASURY_BPS as u128)` then unchecked `/ BPS_DENOMINATOR as u128`, then `as u64` to get `treasury_amount`.
3. **Line 262-265:** Same pattern for `ops_amount` with `OPS_BPS`.
4. **Line 267:** `total_pot_128 as u64` narrowing cast to get `total_pot`.
5. **Line 270-274:** `total_pot.checked_sub(treasury_amount)?.checked_sub(ops_amount)?` to get `winner_amount`.

**Assumptions:**
- `wager_lamports` is bounded by `MAX_WAGER_LAMPORTS` (100,000,000,000 = 100 SOL). Enforced at `create_match` (line 123).
- `TREASURY_BPS` (700) + `OPS_BPS` (300) < `BPS_DENOMINATOR` (10,000). This is a compile-time invariant from constants.
- `BPS_DENOMINATOR` is non-zero (compile-time constant = 10,000).
- The escrow PDA holds exactly `2 * wager_lamports` in deposited lamports (from two deposit operations), plus rent-exempt lamports.

**Invariants:**
- `winner_amount + treasury_amount + ops_amount == total_pot` (by remainder construction)
- `treasury_amount <= total_pot` (because 700/10000 < 1)
- `ops_amount <= total_pot` (because 300/10000 < 1)
- `winner_amount >= 0` (because treasury + ops < total_pot, since 700+300 < 10000)

**Concerns:**
- **Line 260, 265: Unchecked division.** The `/` operator is used instead of `checked_div`. This is safe because the divisor is a non-zero constant, but it breaks the defensive coding convention used everywhere else.
- **Line 260, 265, 267: `as u64` narrowing cast.** These are safe under current bounds: max `total_pot_128 = 200_000_000_000` (200 SOL in lamports), max `treasury_amount_128 = 200_000_000_000 * 700 / 10_000 = 14_000_000_000`, max `ops_amount_128 = 200_000_000_000 * 300 / 10_000 = 6_000_000_000`. All fit in u64 (max ~18.4e18). However, if `MAX_WAGER_LAMPORTS` were increased above `~9.2e18 / 2 = ~4.6e18` (about 4,611,686 SOL), the `total_pot_128 as u64` cast on line 267 would truncate. This is a future-proofing concern, not a current vulnerability.

### 2. Total Pot Calculation (Deposit Event)

**Location:** `lib.rs:211-214`

**Purpose:** Calculate total pot for the `MatchActive` event emission when both players have deposited.

**How it works:**
1. **Line 212-214:** `wager.checked_mul(2).ok_or(EscrowError::ArithmeticOverflow)?`
2. This operates in u64 (no widening).

**Assumptions:**
- `wager` (read from `escrow.wager_lamports`) is bounded by `MAX_WAGER_LAMPORTS` (100,000,000,000). At max: `100_000_000_000 * 2 = 200_000_000_000`, well within u64 range.

**Invariants:**
- `total_pot == wager * 2` (checked)

**Concerns:**
- None. This is only used for event emission, not for financial calculations. Even if it errored, the match would still function correctly (the transaction would revert, preventing the Active state transition, which would be a denial-of-service rather than a financial issue).

### 3. Settlement Deadline Calculation

**Location:** `lib.rs:237-239`

**Purpose:** Compute the settlement deadline as `activated_at + SETTLEMENT_TIMEOUT_SECONDS` (3,600 seconds = 1 hour).

**How it works:**
1. **Line 237-239:** `ctx.accounts.escrow.activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS).ok_or(EscrowError::ArithmeticOverflow)?`
2. Result compared to `Clock::get()?.unix_timestamp` on line 241.

**Assumptions:**
- `activated_at` is a valid Unix timestamp (set from `Clock::get()?.unix_timestamp` on line 209).
- `SETTLEMENT_TIMEOUT_SECONDS` is 3,600 (i64).
- Adding 3,600 to a valid Unix timestamp does not overflow i64. Current Unix timestamps are ~1.7e9; i64 max is ~9.2e18. Safe for billions of years.

**Invariants:**
- `deadline > activated_at` (because SETTLEMENT_TIMEOUT_SECONDS > 0)

**Concerns:**
- **Line 236: `activated_at > 0` guard.** This is a sentinel check — `activated_at` is initialized to 0 at match creation (line 141). If a match somehow reached `Active` state without `activated_at` being set, the settlement deadline check would be skipped entirely. The State Machine agent should verify this cannot happen.

### 4. Cancellation Timeout Calculation

**Location:** `lib.rs:329-331`

**Purpose:** Compute the cancellation timeout deadline as `timeout_reference + TIMEOUT_SECONDS` (86,400 seconds = 24 hours).

**How it works:**
1. **Line 322-326:** Select timeout reference: `activated_at` if > 0, else `created_at`.
2. **Line 329-331:** `timeout_reference.checked_add(TIMEOUT_SECONDS).ok_or(EscrowError::ArithmeticOverflow)?`
3. Result compared to `Clock::get()?.unix_timestamp` on line 333.

**Assumptions:**
- `timeout_reference` is a valid Unix timestamp (from Clock sysvar).
- Adding 86,400 to a current timestamp does not overflow i64. Safe.

**Invariants:**
- `timeout_deadline > timeout_reference`

**Concerns:**
- None identified. Pattern is correct and defensive.

### 5. Permissionless Reclaim Timeout Calculation

**Location:** `lib.rs:404-406`

**Purpose:** Compute the permissionless reclaim deadline as `timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT` (172,800 seconds = 48 hours).

**How it works:**
1. **Line 397-401:** Select timeout reference (same pattern as cancel_match).
2. **Line 404-406:** `timeout_reference.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT).ok_or(EscrowError::ArithmeticOverflow)?`

**Assumptions:**
- Same as cancellation timeout. 172,800 seconds added to Unix timestamp — safe for i64.

**Invariants:**
- `reclaim_deadline > timeout_reference`
- `PERMISSIONLESS_RECLAIM_TIMEOUT == 2 * TIMEOUT_SECONDS` (compile-time constant, line 23)

**Concerns:**
- None identified.

### 6. Compile-Time Constant Arithmetic

**Location:** `lib.rs:23`

**Purpose:** Define the permissionless reclaim timeout as 2x the normal timeout.

**How it works:**
`const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2;` — computed at compile time.

**Assumptions:**
- `86_400 * 2 = 172_800` fits in i64. Trivially safe.

**Concerns:**
- None. Compile-time constants in Rust are evaluated by the compiler with overflow checks in all build modes.

### 7. Space Calculations

**Location:** `lib.rs:706, 753`

**Purpose:** Compute account space for rent allocation.

**How it works:**
- `GlobalConfig::SPACE = 8 + 32 + 32 + 32 + 1 + 1` = 106 bytes
- `MatchEscrow::SPACE = 8 + (4 + 32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 8 + 1` = 168 bytes

**Assumptions:**
- These are compile-time `usize` additions. All safe.
- The `String` field `match_id` uses `4 + 32` (4 bytes for Borsh string length prefix + 32 max characters). This is correct for Borsh serialization of a String capped at 32 bytes.

**Concerns:**
- If `match_id` is shorter than 32 characters, the actual serialized size is less than 168 bytes, but SPACE allocates for the maximum. This is the standard Anchor pattern — safe.

### 8. Lamport Transfer Operations

**Location:** `lib.rs:284-291` (settle), `lib.rs:359-366` (cancel), `lib.rs:421-428` (reclaim)

**Purpose:** Move lamports from escrow PDA to recipients.

**How it works:**
- Uses `**account.try_borrow_mut_lamports()? -= amount` and `+= amount` patterns.
- These are unchecked Rust arithmetic operators on `u64` values.

**Assumptions:**
- The escrow PDA holds sufficient lamports to cover all subtractions.
- For settlement: `escrow.lamports >= winner_amount + treasury_amount + ops_amount`. This holds because `winner_amount + treasury_amount + ops_amount == total_pot == 2 * wager_lamports`, and both deposits have occurred.
- For cancel/reclaim: `escrow.lamports >= wager_lamports` (per deposited player). If one player deposited, escrow has >= `wager_lamports`. If both, escrow has >= `2 * wager_lamports`.
- Anchor's `close = authority` (or `close = caller`) reclaims remaining rent lamports AFTER the instruction body completes.

**Invariants:**
- `escrow.lamports()` before settlement >= `total_pot` (must hold for the subtractions to not underflow)
- `escrow.lamports()` before cancel >= sum of refunds for deposited players

**Concerns:**
- **These `-=` and `+=` are unchecked.** In Rust release builds, if `escrow.lamports() < amount`, the subtraction wraps to a huge u64 value. The Solana runtime WOULD reject this because the account's lamports cannot go below 0 (the runtime enforces lamport conservation). So this is not exploitable — but it is a defense-in-depth gap. A `checked_sub` followed by `ok_or(Error)?` would be more robust.
- **No explicit `escrow.lamports() >= total_pot` assertion before settlement transfers.** The program relies on the implicit invariant from deposits. If any external mechanism could drain lamports from the PDA (e.g., rent collection on a non-rent-exempt account, or a hypothetical program bug allowing double-deposit refund), the settlement transfers would fail at the runtime level. This is safe in practice because Anchor-initialized accounts are rent-exempt.

## Trust Model

**Trusted inputs for arithmetic:**
- `wager_lamports` — validated at `create_match` (lines 120-123: MIN <= wager <= MAX). Once stored, read-only.
- `TREASURY_BPS`, `OPS_BPS`, `BPS_DENOMINATOR` — hardcoded compile-time constants. Immutable.
- `TIMEOUT_SECONDS`, `SETTLEMENT_TIMEOUT_SECONDS`, `PERMISSIONLESS_RECLAIM_TIMEOUT` — hardcoded. Immutable.
- `Clock::get()?.unix_timestamp` — obtained from the Solana Clock sysvar via the safe `Clock::get()` accessor (not from an account parameter). Cannot be faked (EP-006 mitigated).

**Untrusted inputs that enter arithmetic:**
- None directly. All arithmetic operands are either constants or values read from program-owned PDA accounts that were validated at write time.

## State Analysis

**State read by arithmetic:**
- `escrow.wager_lamports` (u64) — read in `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim`
- `escrow.activated_at` (i64) — read in `settle_match`, `cancel_match`, `permissionless_reclaim`
- `escrow.created_at` (i64) — read in `cancel_match`, `permissionless_reclaim`
- `escrow.player_one_deposited`, `escrow.player_two_deposited` (bool) — read in `cancel_match`, `permissionless_reclaim` to determine refund amounts

**State written by arithmetic:**
- None. Arithmetic results are used for lamport transfers and event emissions, not for updating account fields.

## Dependencies

- `anchor_lang::prelude::*` — provides `Clock::get()`, `Result`, error macros
- `anchor_lang::system_program` — provides `system_program::transfer` CPI for deposit
- No external math libraries
- No `spl-math`, `uint`, `integer-mate`, or similar crates
- No floating-point arithmetic (`f32`/`f64`)
- No bit-shift operations

## Focus-Specific Analysis

### Arithmetic Operations Inventory

| # | Location | Operation | Operand Types | Checked? | Intermediate Width | Risk |
|---|----------|-----------|---------------|----------|-------------------|------|
| 1 | L23 | `TIMEOUT_SECONDS * 2` | i64 * i64 | Compile-time | i64 | NONE |
| 2 | L212-214 | `wager.checked_mul(2)` | u64.checked_mul(u64) | Yes | u64 | LOW |
| 3 | L237-239 | `activated_at.checked_add(3600)` | i64.checked_add(i64) | Yes | i64 | LOW |
| 4 | L253-255 | `(wager as u128).checked_mul(2)` | u128.checked_mul(u128) | Yes | u128 | LOW |
| 5 | L257-259 | `total_pot_128.checked_mul(700)` | u128.checked_mul(u128) | Yes | u128 | LOW |
| 6 | L260 | `result / 10000` | u128 / u128 | **Unchecked div** | u128 | LOW (const divisor) |
| 7 | L260 | `result as u64` | u128 -> u64 | **Unchecked cast** | u64 | LOW (bounded) |
| 8 | L262-264 | `total_pot_128.checked_mul(300)` | u128.checked_mul(u128) | Yes | u128 | LOW |
| 9 | L265 | `result / 10000` | u128 / u128 | **Unchecked div** | u128 | LOW (const divisor) |
| 10 | L265 | `result as u64` | u128 -> u64 | **Unchecked cast** | u64 | LOW (bounded) |
| 11 | L267 | `total_pot_128 as u64` | u128 -> u64 | **Unchecked cast** | u64 | LOW (bounded) |
| 12 | L270-272 | `total_pot.checked_sub(treasury)` | u64.checked_sub(u64) | Yes | u64 | LOW |
| 13 | L273-274 | `result.checked_sub(ops)` | u64.checked_sub(u64) | Yes | u64 | LOW |
| 14 | L284 | `escrow.lamports -= winner_amount` | u64 -= u64 | **No** | u64 | LOW* |
| 15 | L285 | `winner.lamports += winner_amount` | u64 += u64 | **No** | u64 | LOW* |
| 16 | L287 | `escrow.lamports -= treasury_amount` | u64 -= u64 | **No** | u64 | LOW* |
| 17 | L288 | `treasury.lamports += treasury_amount` | u64 += u64 | **No** | u64 | LOW* |
| 18 | L290 | `escrow.lamports -= ops_amount` | u64 -= u64 | **No** | u64 | LOW* |
| 19 | L291 | `ops.lamports += ops_amount` | u64 += u64 | **No** | u64 | LOW* |
| 20 | L329-331 | `timeout_ref.checked_add(86400)` | i64.checked_add(i64) | Yes | i64 | LOW |
| 21 | L359 | `escrow.lamports -= wager` | u64 -= u64 | **No** | u64 | LOW* |
| 22 | L360 | `player_one.lamports += wager` | u64 += u64 | **No** | u64 | LOW* |
| 23 | L365 | `escrow.lamports -= wager` | u64 -= u64 | **No** | u64 | LOW* |
| 24 | L366 | `player_two.lamports += wager` | u64 += u64 | **No** | u64 | LOW* |
| 25 | L404-406 | `timeout_ref.checked_add(172800)` | i64.checked_add(i64) | Yes | i64 | LOW |
| 26 | L421-428 | (same pattern as L359-366) | u64 -= / += | **No** | u64 | LOW* |

\* Lamport `-=`/`+=` operations are unchecked at the Rust level but protected by the Solana runtime's lamport conservation invariant. If a subtraction caused a wrap (producing a huge value), the conservation check would fail and the transaction would be rejected.

**Summary:** 13 checked operations, 2 unchecked divisions (safe: const divisor), 3 unchecked narrowing casts (safe: bounded), 14 unchecked lamport mutations (safe: runtime-protected), 1 compile-time constant multiplication (safe).

### Cast Analysis

| # | Location | Source Type | Target Type | Can Truncate? | Max Source Value | Safe? |
|---|----------|------------|-------------|---------------|-----------------|-------|
| 1 | L253 | u64 -> u128 | Widening | No | N/A | Yes (always safe) |
| 2 | L258 | u64 -> u128 | Widening (`TREASURY_BPS as u128`) | No | 700 | Yes |
| 3 | L260 (inner) | u64 -> u128 | Widening (`BPS_DENOMINATOR as u128`) | No | 10,000 | Yes |
| 4 | L260 (outer) | u128 -> u64 | **Narrowing** | **Potentially** | 14,000,000,000 | Yes (bounded) |
| 5 | L263 | u64 -> u128 | Widening (`OPS_BPS as u128`) | No | 300 | Yes |
| 6 | L265 (inner) | u64 -> u128 | Widening | No | 10,000 | Yes |
| 7 | L265 (outer) | u128 -> u64 | **Narrowing** | **Potentially** | 6,000,000,000 | Yes (bounded) |
| 8 | L267 | u128 -> u64 | **Narrowing** | **Potentially** | 200,000,000,000 | Yes (bounded) |

**Bound verification for narrowing casts:**
- MAX_WAGER_LAMPORTS = 100,000,000,000 (100 SOL)
- Max total_pot_128 = 100,000,000,000 * 2 = 200,000,000,000
- Max treasury_amount_128 = 200,000,000,000 * 700 / 10,000 = 14,000,000,000
- Max ops_amount_128 = 200,000,000,000 * 300 / 10,000 = 6,000,000,000
- All three values are far below u64::MAX (~1.84e19). Safe by a factor of ~92x for the largest value.

**Breakpoint analysis:** The `total_pot_128 as u64` cast would truncate if `wager_lamports > u64::MAX / 2 = 9,223,372,036,854,775,807`. The MAX_WAGER_LAMPORTS constraint of 100,000,000,000 provides a safety margin of approximately 92 million times. No risk under current constants.

### Precision Model

**Value types and their precision:**
- **Lamports (u64):** Atomic unit of SOL. 1 SOL = 1,000,000,000 lamports. No sub-lamport precision exists. All calculations operate at lamport granularity.
- **BPS (u64):** Basis points. 1 BPS = 0.01%. The fee constants are 700 (7%) and 300 (3%). No fractional BPS is possible.

**Precision loss paths:**
1. **BPS division (lines 260, 265):** `(total_pot * BPS) / 10000` truncates. Maximum precision loss per division: 0.9999... lamports, rounded down to 0 lamports. This means each fee can be up to 0.9999 lamports less than the "true" value.
2. **Winner remainder (line 270-274):** Winner gets `total_pot - treasury - ops`. Since both treasury and ops are rounded down, the winner absorbs any fractional lamports — winner receives 0-1 extra lamport compared to a "perfect" 90% split.

**No other precision loss paths exist.** The program does not use floating point, does not normalize between different token decimals (SOL-only), and does not accumulate rounding errors across multiple operations (each match is independent).

### Rounding Direction Analysis

**Context:** This is a pure escrow program (no deposit/withdraw/swap cycles). The rounding analysis applies to a single settlement operation.

| Calculation | Direction | Beneficiary | Can Be Exploited? |
|------------|-----------|-------------|-------------------|
| Treasury fee (line 260) | Truncation (round down) | Protocol loses, winner gains | No — winner absorbs dust |
| Ops fee (line 265) | Truncation (round down) | Protocol loses, winner gains | No — winner absorbs dust |
| Winner amount (line 270-274) | Gets remainder | Winner may gain up to 1 lamport | No — 1 lamport is economically insignificant |

**Assessment:** Rounding always favors the winner (by at most 1 lamport per fee component, so at most 2 lamports total). This is the correct design — protocol fees are rounded down, and the winner's share is the exact remainder. There is no scenario where repeated rounding across matches accumulates a meaningful advantage, because each match is independent and settled once.

**Minimum fee verification:** At MIN_WAGER_LAMPORTS (10,000):
- total_pot = 20,000
- treasury = 20,000 * 700 / 10,000 = 1,400 lamports
- ops = 20,000 * 300 / 10,000 = 600 lamports
- winner = 20,000 - 1,400 - 600 = 18,000 lamports

All values are well above 0. The MIN_WAGER_LAMPORTS constraint (OC-08) effectively prevents zero-fee scenarios.

## Cross-Focus Intersections

| This Focus (Arithmetic) | Intersects With | Details |
|------------------------|-----------------|---------|
| BPS fee calculation | Token/Economic | Fee amounts drive lamport transfers; economic correctness depends on arithmetic correctness |
| Deadline arithmetic | Timing/Ordering | Timestamp overflow prevention; deadline comparison logic |
| `activated_at == 0` sentinel | State Machine | Sentinel value affects both arithmetic paths and state transition guards |
| `checked_*` error paths | Error Handling | `ArithmeticOverflow` error causes transaction revert; must not leave partial state |
| Lamport `-=`/`+=` | CPI/External | These use Solana runtime lamport manipulation, not CPI; but runtime conservation laws apply |
| `wager_lamports` bounds | Access Control | MIN/MAX enforced in `create_match` by authority signer; arithmetic safety depends on these bounds |

## Cross-Reference Handoffs

- **--> Token/Economic Agent:** Verify that `winner_amount + treasury_amount + ops_amount` never exceeds the actual lamport balance of the escrow PDA at the time of settlement. The arithmetic guarantees the sum equals `2 * wager_lamports`, but the actual PDA balance includes rent-exempt lamports beyond the deposits. Anchor's `close = authority` reclaims rent after the instruction body — verify this ordering does not create a lamport deficit during transfer execution.
- **--> State Machine Agent:** The `activated_at > 0` check on line 236 gates the settlement deadline enforcement. If there is any code path where a match reaches `Active` state without `activated_at` being set to a positive timestamp, the deadline check is skipped entirely. Verify that line 209 (`escrow.activated_at = Clock::get()?.unix_timestamp`) always executes before the state transition on line 207.
- **--> Error Handling Agent:** There are 13 `checked_*` operations that propagate `EscrowError::ArithmeticOverflow` via `?`. Verify that (a) this causes a full transaction revert with no partial state modifications surviving, and (b) this cannot be intentionally triggered by an attacker to cause denial-of-service. For example, could an attacker craft a scenario that causes a deadline `checked_add` to overflow?
- **--> Timing Agent:** The deadline calculations on lines 237-239, 329-331, and 404-406 add constant seconds to `i64` timestamps. Verify that `Clock::get()?.unix_timestamp` is always positive and cannot produce adversarial deadline values via validator timestamp manipulation (EP-089). The 1-2 second variance documented in the runtime is insufficient to meaningfully affect 1-hour, 24-hour, or 48-hour deadlines.

## Risk Observations

- **Observation 1 (LOW): Unchecked lamport arithmetic.** The 14 lamport `-=`/`+=` operations at lines 284-291, 359-366, and 421-428 are the only unchecked runtime arithmetic in the program. They are protected by the Solana runtime's conservation invariant (accounts cannot have negative lamports), but adding explicit `checked_sub` + `ok_or` would improve defense-in-depth. An attacker cannot exploit this because the runtime rejects the transaction on underflow, but a future refactor that changes the lamport source could introduce risk.

- **Observation 2 (INFORMATIONAL): Narrowing cast safety depends on MAX_WAGER_LAMPORTS.** The `as u64` casts on lines 260, 265, and 267 are safe because `MAX_WAGER_LAMPORTS = 100,000,000,000`. If this constant were changed to a value > ~9.2e18 (unrealistic for SOL, but worth documenting), the casts would silently truncate. An explicit `u64::try_from(value).ok_or(EscrowError::ArithmeticOverflow)?` would be more future-proof.

- **Observation 3 (INFORMATIONAL): Division consistency.** Lines 260 and 265 use unchecked `/` while every other operation uses `checked_*`. The divisor is a compile-time non-zero constant, so this is safe, but it breaks the consistent defensive coding pattern and could lead to copy-paste errors in future modifications.

- **Observation 4 (LOW): Implicit lamport sufficiency invariant.** The settlement transfer logic (lines 284-291) subtracts `winner_amount`, then `treasury_amount`, then `ops_amount` sequentially from the escrow. If the escrow PDA's lamport balance is exactly `2 * wager_lamports` (deposits only), this works correctly because `winner + treasury + ops == 2 * wager`. However, the escrow PDA also holds rent-exempt lamports beyond the deposits. The program does not explicitly assert `escrow.lamports() >= winner_amount + treasury_amount + ops_amount` before starting transfers. Anchor's `close` directive handles the remaining (rent) lamports after the instruction body.

- **Observation 5 (INFORMATIONAL): No overflow possible in u128 BPS math.** The maximum intermediate value is `200,000,000,000 * 700 = 140,000,000,000,000` (u128). This is far below u128::MAX (~3.4e38). The `checked_mul` calls are technically unnecessary for correctness under current bounds, but they are good defensive practice and should be kept.

## Novel Attack Surface Observations

- **Novel observation 1: Rent lamport arithmetic interaction.** The escrow PDA holds `2 * wager_lamports` from deposits PLUS rent-exempt lamports from `init`. The settlement code subtracts exactly `2 * wager_lamports` total (winner + treasury + ops = total_pot = 2 * wager). The remaining rent-exempt lamports are reclaimed by Anchor's `close = authority`. This creates a coupling between rent economics and escrow arithmetic: the settlement transfers must complete before Anchor's `close` reclaims the remaining lamports. If Anchor's `close` executed mid-instruction-body (it does not — `close` runs after the handler returns), the lamport subtractions could underflow. This is safe by Anchor's design, but it is a non-obvious dependency between the arithmetic layer and the framework's account lifecycle.

- **Novel observation 2: `activated_at = 0` as arithmetic sentinel.** The program uses `activated_at = 0` as a sentinel meaning "not yet activated" (line 141). This value is an i64 Unix timestamp. The value 0 corresponds to January 1, 1970. If `Clock::get()?.unix_timestamp` ever returned 0 or a negative value (which should never happen on Solana mainnet), the deadline calculations would produce unexpected results. For example, `0 + 86400 = 86400`, which is in 1970 — any current timestamp would exceed this, making every match appear timed out immediately. This is a theoretical edge case, not a practical concern, because Solana clock timestamps are always current (2024+).

- **Novel observation 3: Wager bounds create an arithmetic safety envelope.** The combination of `MIN_WAGER_LAMPORTS` (10,000) and `MAX_WAGER_LAMPORTS` (100,000,000,000) creates a closed arithmetic envelope where all intermediate values are provably bounded. This is an unusual and effective pattern — rather than relying solely on checked arithmetic (which catches errors at runtime), the wager bounds guarantee that no overflow can occur in the first place. The `checked_*` calls serve as a second line of defense. If either bound were removed or significantly widened, the arithmetic safety guarantees would need re-verification. This is documented here so that any future modification to these constants triggers an arithmetic review.

## Questions for Other Focus Areas

- **For State Machine focus:** Can a match reach `Active` state (line 207) without `activated_at` being set to a positive timestamp (line 209)? The code sets state first (line 207), then timestamp (line 209) — if `Clock::get()` fails between lines 207 and 209, what state is the match left in? (Note: Solana transaction atomicity should revert the entire instruction on error, but this deserves explicit verification.)
- **For CPI focus:** The `system_program::transfer` CPI on lines 179-188 transfers `wager` lamports. Is the CPI's error properly propagated (via `?`)? If the player has insufficient lamports, does the entire transaction revert cleanly?
- **For Token/Economic focus:** The fee percentages (7% treasury, 3% ops) are hardcoded constants. Is there a governance path to change these without a program upgrade? (Answer from code: No — constants are immutable. Only a program upgrade could change them.)
- **For Access Control focus:** The `wager_lamports` value is set in `create_match` by the authority. Could a malicious authority set a wager of 0 (bypassing MIN_WAGER_LAMPORTS somehow) or MAX+1 to affect arithmetic? The `require!` checks on lines 120-123 should prevent this, but worth verifying no bypass exists.
- **For Timing focus:** The `checked_add` on deadline calculations (lines 237-239, 329-331, 404-406) uses `i64`. Could an adversarial validator set `unix_timestamp` to `i64::MAX` or near it, causing the `checked_add` to return `None` and triggering `ArithmeticOverflow`? This would be a denial-of-service on settlement/cancellation. Verify the practical bounds of `Clock::get()?.unix_timestamp`.

## Raw Notes

### Verified Arithmetic Bounds (at MAX_WAGER = 100 SOL)

```
wager_lamports = 100_000_000_000 (u64)
total_pot = 200_000_000_000 (u64) — fits, max u64 = 18_446_744_073_709_551_615
total_pot_128 = 200_000_000_000 (u128) — trivially fits

treasury_calc = 200_000_000_000 * 700 = 140_000_000_000_000 (u128, 1.4e14)
treasury_amount = 140_000_000_000_000 / 10_000 = 14_000_000_000 (u64, fits)

ops_calc = 200_000_000_000 * 300 = 60_000_000_000_000 (u128, 6e13)
ops_amount = 60_000_000_000_000 / 10_000 = 6_000_000_000 (u64, fits)

winner_amount = 200_000_000_000 - 14_000_000_000 - 6_000_000_000 = 180_000_000_000 (u64, fits)

Verification: 180e9 + 14e9 + 6e9 = 200e9 (exact match)
```

### Verified Arithmetic Bounds (at MIN_WAGER = 0.00001 SOL)

```
wager_lamports = 10_000 (u64)
total_pot = 20_000 (u64)

treasury_amount = 20_000 * 700 / 10_000 = 1_400 (u64)
ops_amount = 20_000 * 300 / 10_000 = 600 (u64)
winner_amount = 20_000 - 1_400 - 600 = 18_000 (u64)

Verification: 18_000 + 1_400 + 600 = 20_000 (exact match)
All fees > 0 (verified)
```

### Is u128 widening actually necessary?

At MAX_WAGER = 100 SOL:
- `total_pot * TREASURY_BPS = 200_000_000_000 * 700 = 140_000_000_000_000`
- u64::MAX = 18_446_744_073_709_551_615
- 140_000_000_000_000 < 18_446_744_073_709_551_615 by a factor of ~131,762

**Finding:** At the current MAX_WAGER_LAMPORTS (100 SOL), the intermediate BPS multiplication does NOT overflow u64. The u128 widening is unnecessary for current parameters. However, it is good defensive practice because:
1. It provides safety margin if MAX_WAGER_LAMPORTS is increased in a future program version.
2. The u64 breakpoint for BPS overflow: `u64::MAX / 700 / 2 = ~13,176,245,766,935,394` lamports = ~13,176,245 SOL. This is far above any reasonable wager.
3. The overhead is minimal (u128 operations are cheap in BPF).

### Pattern: No `.unwrap()` in entire codebase

Confirmed via grep: zero instances of `.unwrap()` in `lib.rs`. All fallible operations use `?` or `.ok_or(Error)?`. This is exemplary error handling.

### Pattern: Zero floating-point usage

Confirmed: no `f32` or `f64` anywhere in the program. All calculations use integer arithmetic with BPS for percentage calculations. This eliminates EP-018 (Float Arithmetic in Financial Logic) entirely.

### Lamport Transfer Note

The `-=` and `+=` operators on dereferenced `RefMut<u64>` values (from `try_borrow_mut_lamports()`) behave as standard Rust arithmetic. In release mode, these wrap on overflow/underflow. However, the Solana runtime performs a post-instruction check verifying that the sum of all account lamports is unchanged (conservation law). If a subtraction caused a wrap (producing a huge value), the conservation check would fail and the transaction would be rejected. This is a secondary safety net, not a primary defense.

### EP Pattern Coverage

| Exploit Pattern | Applies? | Status |
|----------------|----------|--------|
| EP-015: Integer Overflow/Underflow | Yes | Mitigated — all checked_* |
| EP-016: Precision Loss in Division | Yes | Mitigated — remainder strategy |
| EP-017: Decimal Normalization | No | SOL-only, no multi-token math |
| EP-018: Float Arithmetic | No | Zero float usage |
| EP-019: Rounding Direction | Yes | Protocol-favorable (fees round down) |
| EP-020: Unsafe Type Casting | Yes | 3 narrowing casts, all bounded — LOW risk |
| EP-091: Custom Overflow Guard | No | No custom math libraries |
| EP-109: Rounding Direction Manipulation | No | No repeated deposit/withdraw cycles |
