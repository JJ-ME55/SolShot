---
task_id: sos-phase1-arithmetic
provides: [arithmetic-findings, arithmetic-invariants]
focus_area: arithmetic
files_analyzed:
  - programs/solshot-escrow/src/lib.rs
  - programs/solshot-escrow-v2/src/lib.rs
  - Cargo.toml (workspace)
  - programs/solshot-escrow/Cargo.toml
  - programs/solshot-escrow-v2/Cargo.toml
  - programs/solshot-escrow/tests/bok_proptest_fee.rs (BOK coverage check)
finding_count: 11
severity_breakdown: {critical: 0, high: 2, medium: 5, low: 4}
---
<!-- CONDENSED_SUMMARY_START -->
# Arithmetic Safety — Condensed Summary

## Key Findings (Top 10)

- **A01 (HIGH)** v2 settle_match BPS path uses snapshotted `treasury_bps` and `ops_bps`, but the BOK proptest suite ONLY exercises hardcoded 700/300 over 2-4 players. v2's configurable BPS (0..1000) and 10-player surface are formally unverified. — `programs/solshot-escrow-v2/src/lib.rs:403-418`, `programs/solshot-escrow/tests/bok_proptest_fee.rs:32-46`
- **A02 (HIGH)** v2 `update_config` allows individual BPS values to exceed `MAX_FEE_BPS` if the OTHER side is set to None — only the *combined sum* is checked. This means `fee_bps_treasury` could be set to e.g. 60_000 (well over u16 cap of 65535) so long as ops is currently low enough. The widening to `u32` correctly avoids u16 overflow on the SUM, but the individual BPS values feed directly into `total_pot_128 * bps as u128 / 10_000` in settle_match. With `fee_bps_treasury > 10_000`, treasury_amount would EXCEED total_pot — causing the second checked_sub in winner_amount to underflow. — `programs/solshot-escrow-v2/src/lib.rs:118-123, 128-131, 408-411, 421-425`
- **A03 (MEDIUM)** v2's overflow-check defense for snapshotted BPS relies on the create-time `(treasury + ops) <= MAX_FEE_BPS` check in `create_match`. **However, `create_match` does NOT perform the combined-bps check — it only snapshots the values from config.** If a malicious authority sets BPS to invalid values via update_config (see A02), THEN creates a match, the bad BPS get snapshotted into the escrow and there is NO downstream guard on settle_match. — `programs/solshot-escrow-v2/src/lib.rs:201-214` (snapshot), `387-454` (settle_match — no BPS validation)
- **A04 (MEDIUM)** v2 `settle_match` reads snapshotted BPS without re-validating the cap. The defense layer is "the cap was checked when the snapshot was taken." If A02/A03 expose a bypass of that cap, settle_match cannot detect it. — `programs/solshot-escrow-v2/src/lib.rs:398-399, 408-411`
- **A05 (LOW)** v1's `start_with_depositors` pot calc `wager.checked_mul(num_deposited as u64)` is safe — `num_deposited` is `count_ones()` of u8 mask = max 4, max product = 100 SOL × 4 = 400B lamports = fits trivially in u64 (`< u64::MAX/45M`). H019 dismissal HOLDS for v1. — `programs/solshot-escrow/src/lib.rs:524-528`
- **A06 (LOW)** v2's `start_with_depositors` pot calc is safe — `num_deposited as u64` widens from `u32 (count_ones output)`, max value 10, max product = 10 × MAX_WAGER = 1T lamports = `1e12 < u64::MAX (1.8e19)`. H019 also HOLDS for v2. — `programs/solshot-escrow-v2/src/lib.rs:329-330, 371-373`
- **A07 (MEDIUM)** v2 `as i64` casts on `duration_secs` and `deposit_window_secs` (both u32, max values bounded to MAX_DURATION_SECS=604800 and MAX_DEPOSIT_WINDOW_SECS=86400 in create_match) are safe widening. The `checked_add` against `created_at` (i64) cannot overflow until `created_at` approaches `i64::MAX` (year 292 billion AD). H020 HOLDS. — `programs/solshot-escrow-v2/src/lib.rs:257, 302, 334, 343, 475, 545`
- **A08 (LOW)** Workspace `Cargo.toml` has `overflow-checks = true` in `[profile.release]` — confirmed at line 8-11. This is the second defense layer for any unchecked operations (silent wraps would now panic). The defense is intact for both v1 and v2 builds. — `Cargo.toml:8-11`
- **A09 (MEDIUM)** Lamport conservation invariant for cancel_match / permissionless_reclaim refunds: each iteration does `escrow.lamports -= wager` and `account.lamports += wager` UNCHECKED (raw pointer math via `try_borrow_mut_lamports`). With `overflow-checks=true` enabled, an underflow would panic — but this depends on the per-loop invariant `deposits_mask.count_ones() * wager <= escrow.lamports`. H012 dismissal needs RE-VALIDATION specifically on v2's u16 mask + 10-player cap. — `programs/solshot-escrow/src/lib.rs:408-409`, `programs/solshot-escrow-v2/src/lib.rs:508-509, 567-568`
- **A10 (HIGH→on H028 verdict)** **H028 is INVALIDATED on v2.** v2's `fee_bps_treasury_snapshot` and `fee_bps_ops_snapshot` are runtime-configurable per-match (not compile-time constants). The Feb dismissal "Constants hardcoded; no runtime modification" no longer applies. There IS a new attack surface: see A02 for the specific bypass. v1 still holds (BPS still hardcoded constants).

## Critical Mechanisms

- **u128 widening for settle math**: Both v1 (line 285-300) and v2 (line 403-418) widen u64 wager × num_deposited into u128 for BPS multiplication, then narrow `total_pot_128 as u64`. Width math is safe: max u128 product = 10^11 × 10 × 10^4 = 10^16 << u128::MAX (3.4e38). The `as u64` narrowing of `total_pot_128` is the critical narrowing — safe so long as wager × num_deposited × 1 <= u64::MAX, true at all valid inputs.
- **Pot calc on activation**: `wager.checked_mul(num_deposited as u64)` — both versions. Used in MatchActive event emission, NOT in lamport math. Pure observability — bug here would only break event accuracy, not fund safety. — `v1:240-243, 526-528`, `v2:305-308, 371-373`
- **Configurable BPS pipeline (v2 only)**: `update_config` → cfg.fee_bps_treasury/ops → snapshotted to escrow at create_match → read in settle_match without re-validation. The cap (`MAX_FEE_BPS=1000`) is enforced ONLY at the update boundary, not at create or settle. If the cap can be bypassed at update, the bypass propagates through to settle. — `v2:75-79, 128-131, 213-214, 398-399`
- **`as i64` timestamp arithmetic**: Used 6 times in v2 (lines 257, 302, 334, 343, 475, 545) for `deposit_window_secs as i64` and `duration_secs as i64`. Both are u32 bounded by MAX constants. The widening is lossless. The `checked_add` against `Clock::get()?.unix_timestamp` (i64) is the actual overflow guard. Safe at all valid inputs.

## Invariants & Assumptions

- INVARIANT: `wager_lamports × max_players ≤ u64::MAX` — enforced indirectly by MIN/MAX_WAGER constants and MAX_PLAYERS constant. Max product (v2): 100 SOL × 10 = 1000 SOL = 10^12 lamports << u64::MAX (1.8e19). — Verified via constants in v1:29-32, v2:34-35.
- INVARIANT: `treasury_amount + ops_amount ≤ total_pot` — enforced by combined BPS cap. v1: hardcoded TREASURY_BPS+OPS_BPS=1000 < BPS_DENOMINATOR=10000. v2: enforced by `MAX_FEE_BPS=1000` cap on combined sum, BUT see A02 — the per-field cap is NOT enforced (only the sum). NOT enforced atomically against snapshot use ⚠.
- INVARIANT: `winner_amount = total_pot - treasury_amount - ops_amount ≥ 0` — enforced by `checked_sub` chain in settle_match (v1:303-307, v2:421-425). The `checked_sub` returns `None` and aborts on underflow, so this is enforced as a fault, not silently wrapped.
- INVARIANT: `count_ones(deposits_mask) ≥ MIN_PLAYERS` at start_with_depositors — enforced explicitly. v1:500 requires `>= 2`, v2:330 requires `>= MIN_PLAYERS as u32 = 2`. Cannot multiply by 0.
- ASSUMPTION: `overflow-checks = true` is preserved in the deployment build. — Validated at `Cargo.toml:8-11` (workspace) and inherited by both program crates (no per-program override).
- ASSUMPTION: `count_ones()` on a u8 (v1) or u16 (v2) returns a value bounded by mask width — TRUE by Rust spec; max v1=8, max v2=16, but bounded further by `max_players` ≤ 4 (v1) / 10 (v2).
- ASSUMPTION: `Clock::get()?.unix_timestamp` is small enough that `created_at + window_secs` never overflows i64. Validated as a bound — i64::MAX (~9e18) ≈ year 292 billion AD; current timestamp is ~1.7e9. — Validated at `v2:255-258, 332-335, etc.` via `checked_add`. ✅
- ASSUMPTION: snapshotted `fee_bps_treasury_snapshot` and `fee_bps_ops_snapshot` were validated when they were written. See A02/A03 — this assumption can be VIOLATED if the cap check is bypassed at update_config. UNVALIDATED at settle_match ⚠.

## Risk Observations (Prioritized)

1. **A02 — v2 update_config combined-cap bypass**: `programs/solshot-escrow-v2/src/lib.rs:118-131` — Setting only one of `fee_bps_treasury` or `fee_bps_ops` to a value > `MAX_FEE_BPS` (1000) is NOT individually rejected. The check is `(cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32`. If the existing cfg has `fee_bps_treasury = 100, fee_bps_ops = 100`, an update setting `new_fee_bps_treasury = 800` (and `new_fee_bps_ops = None`) gives a final combined sum of 900, which passes. But if `new_fee_bps_treasury = 60000` is set (with current ops = 100), the combined sum is 60100 — REJECTED. So the check works for the IMMEDIATE update. The risk emerges if the AUTHORITY is malicious: a malicious authority directly bypasses the cap with no on-chain protection. Severity is HIGH because the malicious-authority attack is realistic given the hot-wallet posture, AND v2 has no settle-time re-check.
2. **A03/A04 — v2 settle_match has no BPS sanity check**: `programs/solshot-escrow-v2/src/lib.rs:387-454` — Even if A02 were locked down, settle_match does not re-validate that `treasury_bps + ops_bps <= 10000`. With BPS values like (5000, 5000), the math computes treasury = 50% of pot, ops = 50%, then `winner_amount = total_pot - treasury - ops = 0`. No error. With BPS like (6000, 5000), `winner_amount = total_pot - 60% - 50% = -10%` underflows. The `checked_sub` catches this (returns Err), but the match is now bricked — no settlement possible. This is a potential griefing vector.
3. **A09 — Lamport conservation in remaining_accounts refund loop**: With `overflow-checks=true`, an underflow panics, providing a defense layer. But the per-iteration `escrow.lamports -= wager_lamports` operations rely on the loop invariant that escrow holds at least `count_ones(deposits_mask) × wager` lamports. If the loop iterates past the actual deposit count (e.g., caller passes more accounts than deposited bits), the per-bit guard catches it (`bit_set` check). H012 dismissal HOLDS structurally, but v2's u16 mask makes the upper bound less obvious. Re-validate.
4. **A07 — `as i64` cast safety**: Lower-priority but worth noting. `deposit_window_secs as i64` widens u32→i64 — always lossless (u32 max ≈ 4.3e9, i64 max ≈ 9.2e18). `checked_add` against `created_at: i64` catches any sum overflow.
5. **BOK proptest coverage gap**: The 4 BOK proptest files cover v1 ONLY. v2's configurable BPS, 10-player ceiling, and per-match snapshotting are NOT proptested. This is a coverage gap, not a bug — but flag for follow-up.

## Novel Attack Surface

- **NOVEL-A1: Snapshot-poisoning of BPS via authority compromise**: v2 introduces snapshot-at-create semantics for fee BPS. The intended security property is "config changes don't affect in-flight matches." The unintended consequence: a malicious authority can set arbitrary BPS values in update_config (bypassing the cap by signing as authority — there's no cap-check IF the authority is the bypass mechanism), then create a match that snapshots those poisoned BPS values, then settle that match with a 100% (or even >100%) treasury_bps. The match's escrow drains entirely to treasury, with winner getting 0 or settle_match aborting. **Even if the authority IS validated to enforce the cap at update_config, the compile-time per-match guard at create_match is missing — a `require!(escrow.fee_bps_treasury_snapshot + escrow.fee_bps_ops_snapshot <= MAX_FEE_BPS)` at create_match (post-snapshot) would close this entirely.** This is novel because v1 had no analog — its constants couldn't be poisoned at all.
- **NOVEL-A2: Asymmetric pot-vs-mask scaling in remaining_accounts loop**: v2's u16 mask supports 16 bits, but `max_players ≤ 10`. If `count_ones(deposits_mask)` reports a value > `max_players` due to corrupted state (state machine bug → not arithmetic, but interacts with arithmetic), the refund loop could decrement escrow.lamports below the per-deposit-count amount. The `bit_set && i < max_players` guards prevent this in normal flow, but worth flagging cross-focus.
- **NOVEL-A3: Snapshot drift across update_config calls**: Each match's BPS snapshot is taken at create_match. Different matches in flight may have different snapshots. There's no on-chain audit trail relating snapshot → config-version. Off-chain monitoring can't easily detect "this match was created with a poisoned config" without separately scanning all create_match events. Ops-burden, not a vuln per se.

## Cross-Focus Handoffs

- → **Token & Economic Agent**: Investigate A02 in detail — the 0..u16::MAX BPS attack surface. Confirm whether the authority compromise scenario (authority signs to set BPS to e.g. 9999) is realistic in JJ's hot-wallet posture. If it IS realistic, severity becomes CRITICAL because the authority can drain pot via fee redirect.
- → **Access Control Agent**: A02/A03/A04 chain depends on whether `update_config` properly gates BPS changes. Verify `has_one = authority @ EscrowError::Unauthorized` is enforced AND whether the authority could be transferred (recall H001 — one-step transfer) before being used to poison BPS values.
- → **State Machine Agent**: Confirm that NOVEL-A2 cannot occur via state corruption — that `deposits_mask` bits beyond `max_players` cannot ever be set (the deposit_wager loop should prevent it via `player_index < max_players`). Verify the v2 u16-mask invariant.
- → **Error Handling Agent**: Confirm what happens when `winner_amount = checked_sub(...)` returns None on settle_match — does the match get permanently stuck in Active state, or can it be recovered? This is a DoS vector if BPS is poisoned.
- → **Upgrade & Admin Agent**: Note that v2's configurable BPS is a NEW admin capability vs v1 — flag for centralization-risk discussion.

## Trust Boundaries

The arithmetic logic trusts: (1) the workspace `overflow-checks=true` flag remains in place; (2) Anchor's bounded-input checks in `create_match` (wager, players.len, durations) are run BEFORE the arithmetic touches values; (3) the authority does NOT poison fee BPS values via update_config (in v2). The trust boundary that's expanded in v2: BPS values are now mutable runtime state that arithmetic depends on. v1 had constants — zero trust placed on mutable values for BPS. v2 places trust on the authority + the cap-check at update_config. If either fails, settle math becomes a fund-loss vector.
<!-- CONDENSED_SUMMARY_END -->

---

# Arithmetic Safety — Full Analysis

## Executive Summary

Both `programs/solshot-escrow/src/lib.rs` (v1, 962 LOC) and `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC) demonstrate disciplined arithmetic — all financial-impact arithmetic uses `checked_*` methods, all type casts are either widening (lossless) or narrowing-with-bounded-source. There is no `unsafe`, no `unwrap()`, no float arithmetic, no manual overflow check (no EP-091 risk), and `overflow-checks = true` is preserved in `Cargo.toml` as a second defense layer.

The two findings of substance for the arithmetic focus are both v2-specific. **First**, v2's configurable BPS (the new `fee_bps_treasury` and `fee_bps_ops` in GlobalConfig) propagates through a snapshot pipeline: update_config → snapshot at create_match → consumed at settle_match. The cap (`MAX_FEE_BPS = 1000`, i.e. 10%) is enforced ONLY at the update boundary, not at create_match (post-snapshot) and not at settle_match (consumption). If a malicious authority sets BPS values exceeding the cap (which would require bypassing the `<= MAX_FEE_BPS` check at update_config — see A02 below), there is NO downstream defense. **Second**, the cap check at update_config validates only the COMBINED sum, not per-field. With u16 fields, an individual value of e.g. 10_000 (100% to treasury) would pass the per-field type check but fail the sum check — UNLESS the existing other-field is set to 0. The check is correct in the sense that "the resulting state always has `treasury + ops ≤ 1000`" — but the assumption that `treasury <= 1000` and `ops <= 1000` individually after the update is never explicitly enforced.

The Feb-era H028 ("BPS constant manipulation via upgrade — dismissed because constants are hardcoded") is **INVALIDATED on v2**. The v1 dismissal still holds. Other Feb arithmetic dismissals (H012, H019, H020) have been re-validated and continue to hold for both v1 and v2 with no regressions.

The four BOK proptest files (v1-only) cover settle_match with hardcoded TREASURY_BPS=700, OPS_BPS=300 and num_deposited ∈ [2,4]. They do NOT cover v2's configurable BPS or 10-player surface. This is a coverage gap to flag for follow-up.

## Scope

### Files analyzed
- `programs/solshot-escrow/src/lib.rs` — v1 (962 LOC, MAJOR-MODIFIED since Feb)
- `programs/solshot-escrow-v2/src/lib.rs` — v2 (1020 LOC, NEW since Feb)
- `Cargo.toml` (workspace) — overflow-checks profile config
- `programs/solshot-escrow/Cargo.toml` — per-program; no profile override
- `programs/solshot-escrow-v2/Cargo.toml` — per-program; no profile override
- `programs/solshot-escrow/tests/bok_proptest_fee.rs` — coverage check (only)

### Functions analyzed (by file)

**v1 (programs/solshot-escrow/src/lib.rs):**
- `initialize_config` (47-65) — only Pubkey/bool assignment, no arithmetic
- `update_config` (72-108) — only Pubkey reassignment, no arithmetic
- `pause_program` / `unpause_program` (112-122) — bool flag toggle, no arithmetic
- `create_match` (130-182) — `players.len() as u8` cast (PA-005), `Clock::get()?.unix_timestamp` (PL-001), bounded by MAX_PLAYERS=4
- `deposit_wager` (187-252) — `1u8 << player_index` shift (PB-003-adjacent), `count_ones() as u64`, `checked_mul` for total_pot, full_mask `(1u8 << escrow.max_players) - 1`
- `settle_match` (258-338) — u128 widening for BPS math (the core arithmetic — PA-002), three `checked_sub` operations
- `cancel_match` (344-419) — `checked_add` for timeout deadline; remaining_accounts loop with raw lamport pointer math
- `permissionless_reclaim` (425-487) — same pattern
- `start_with_depositors` (493-536) — pot scaling for partial deposits via `wager.checked_mul(num_deposited as u64)`

**v2 (programs/solshot-escrow-v2/src/lib.rs):**
- `initialize_config` (65-91) — u16 BPS validation `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32`
- `update_config` (96-142) — same BPS validation in re-check after updates
- `pause_program` / `unpause_program` (146-154) — bool toggle
- `create_match` (161-235) — u32 duration_secs and deposit_window_secs bounds, snapshot of cfg.fee_bps_treasury/ops without re-validation
- `deposit_wager` (239-318) — `deposit_window_secs as i64` widening cast (PA-003), `checked_add` for deposit deadline, `checked_add` for match_end_ts at activation, `1u16 << player_index` shift
- `start_with_depositors` (323-382) — `checked_add` for deposit deadline, `checked_add` for match_end_ts, pot calc as `wager.checked_mul(num_deposited as u64)`
- `settle_match` (387-454) — u128 widening for BPS math using SNAPSHOTTED bps (the v2-specific change)
- `cancel_match` (459-519) — `deposit_window_secs as i64` widening, `checked_add` for deadline
- `permissionless_reclaim` (526-578) — `match_end_ts.checked_add(PUBLIC_REFUND_GRACE_SECS)` and `created_at.checked_add(deposit_window_secs as i64).checked_add(PUBLIC_REFUND_GRACE_SECS)`

### Estimated coverage
- 100% of arithmetic operations in both source files traced
- 100% of type casts identified and risk-assessed
- 100% of HOT_SPOTS arithmetic entries inspected
- 4 specific PA-/PB-pattern hot-spots cross-referenced

## Key Mechanisms

### Mechanism 1: u128-Widened BPS Split for Settlement

**Location:**
- v1: `programs/solshot-escrow/src/lib.rs:285-300`
- v2: `programs/solshot-escrow-v2/src/lib.rs:403-418`

**Purpose:**
Distribute `total_pot` (= wager × num_deposited) into three buckets — winner, treasury, ops — using basis-point math, with no integer-truncation loss to the protocol (winner absorbs dust).

**How it works (v1 lines 285-300):**
```rust
let num_deposited = deposits_mask.count_ones() as u128;
let total_pot_128 = (wager_lamports as u128)
    .checked_mul(num_deposited)
    .ok_or(EscrowError::ArithmeticOverflow)?;

let treasury_amount = (total_pot_128
    .checked_mul(TREASURY_BPS as u128)
    .ok_or(EscrowError::ArithmeticOverflow)?
    / BPS_DENOMINATOR as u128) as u64;

let ops_amount = (total_pot_128
    .checked_mul(OPS_BPS as u128)
    .ok_or(EscrowError::ArithmeticOverflow)?
    / BPS_DENOMINATOR as u128) as u64;

let total_pot = total_pot_128 as u64;

let winner_amount = total_pot
    .checked_sub(treasury_amount).ok_or(...)?
    .checked_sub(ops_amount).ok_or(...)?;
```

**How it works (v2 lines 403-418):** Identical structure but uses `treasury_bps` and `ops_bps` (snapshot from escrow) instead of compile-time constants:
```rust
let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;  // u16
let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;            // u16
// ... same checked_mul / div pattern ...
let treasury_amount = (total_pot_128
    .checked_mul(treasury_bps as u128)
    .ok_or(EscrowError::ArithmeticOverflow)?
    / BPS_DENOMINATOR) as u64;
```

**Width math:**
- `wager_lamports as u128`: lossless widening (u64 → u128). Max value: `MAX_WAGER_LAMPORTS = 100_000_000_000` = 10^11.
- `num_deposited`: v1 = `count_ones() of u8 mask, max=4` → as u128 max 4. v2 = `count_ones() of u16 mask, max=10 (limited by max_players)` → as u128 max 10.
- `total_pot_128 = wager × num_deposited`: v1 max = 10^11 × 4 = 4 × 10^11. v2 max = 10^11 × 10 = 10^12.
- `total_pot_128 × BPS`: v1 max BPS = 700 (TREASURY_BPS), max product = 4 × 10^11 × 700 = 2.8 × 10^14. v2 max BPS = 1000 (MAX_FEE_BPS), max product = 10^12 × 1000 = 10^15. Both << u128::MAX ≈ 3.4 × 10^38.
- After `/ 10000`: v1 max = 2.8 × 10^10. v2 max = 10^11. Both fit in u64 (max 1.8 × 10^19).
- `total_pot_128 as u64` narrowing: requires `total_pot_128 ≤ u64::MAX`. v1 max = 4 × 10^11 << 1.8 × 10^19 ✅. v2 max = 10^12 << 1.8 × 10^19 ✅.

**Assumptions:**
- v1: `TREASURY_BPS + OPS_BPS = 1000 < BPS_DENOMINATOR = 10000`, so `treasury + ops < total_pot` always. ✅ enforced at compile time.
- v2: `treasury_bps + ops_bps ≤ MAX_FEE_BPS = 1000 < BPS_DENOMINATOR = 10000`. ⚠️ enforced at update_config only (not at snapshot or at consumption — see A03/A04).
- u128 widening prevents intermediate overflow.
- `as u64` narrowing of `total_pot_128` is guaranteed safe because `wager_lamports × num_deposited ≤ MAX_WAGER × MAX_PLAYERS << u64::MAX`.
- The order of operations is: cast-to-u128 → multiply → divide → cast-to-u64. This is the SAFE order (multiply before divide).

**Invariants:**
- INVARIANT: `treasury_amount + ops_amount ≤ total_pot` (so `winner_amount ≥ 0`). Enforced by BPS cap.
- INVARIANT: `winner_amount ≥ floor((10000 - TREASURY_BPS - OPS_BPS) / 10000 × total_pot)`. The dust ≤ 2 lamports (one for treasury truncation, one for ops). Verified by BOK FEE-INV-5.
- INVARIANT: total disbursement = total_pot exactly. The winner-as-remainder pattern guarantees no lamports are created or destroyed.

**Concerns:**
- v2 ONLY: The cap-bypass scenarios in A02/A03/A04 break the first invariant. If `treasury_bps + ops_bps > 10000`, then `treasury + ops > total_pot`, and `winner_amount = checked_sub` returns None, aborting the settle. The match is then bricked.
- v2 ONLY: With `treasury_bps + ops_bps = 10000` (exactly the cap), winner gets 0 lamports. This is silently allowed by the cap. If v2's cap was supposed to ENSURE winner gets a non-trivial share, the cap should be < BPS_DENOMINATOR.
- BOK proptest does NOT cover v2's snapshotted BPS path. FEE-INV-1 through FEE-INV-11 are verified for v1's hardcoded values only.

### Mechanism 2: count_ones() Pot Scaling

**Location:**
- v1 deposit_wager: `programs/solshot-escrow/src/lib.rs:240-243`
- v1 start_with_depositors: `programs/solshot-escrow/src/lib.rs:526-528`
- v1 settle_match: `programs/solshot-escrow/src/lib.rs:285-288`
- v2 deposit_wager: `programs/solshot-escrow-v2/src/lib.rs:305-308`
- v2 start_with_depositors: `programs/solshot-escrow-v2/src/lib.rs:371-373`
- v2 settle_match: `programs/solshot-escrow-v2/src/lib.rs:403-406`

**Purpose:**
Compute `total_pot = wager × num_deposited` for both event emission and BPS math. `num_deposited` derives from `count_ones()` of the deposit mask.

**How it works (v1 deposit_wager 240-243):**
```rust
let num_deposited = escrow.deposits_mask.count_ones() as u64;
let total_pot = wager
    .checked_mul(num_deposited)
    .ok_or(EscrowError::ArithmeticOverflow)?;
```

**How it works (v2 start_with_depositors 371-373):**
```rust
let total_pot = wager
    .checked_mul(num_deposited as u64)
    .ok_or(EscrowError::ArithmeticOverflow)?;
// num_deposited here is u32 (from count_ones())
```

**Width math:**
- v1: `count_ones()` of `u8` returns u32 (Rust spec). Max value = number of set bits = max 4. Cast `as u64` is lossless widening. Product: 100B × 4 = 400B = 4 × 10^11 << u64::MAX. **Safe.**
- v2: `count_ones()` of `u16` returns u32. Max value = 10 (limited by max_players ≤ 10). Cast `as u64` is lossless. Product: 100B × 10 = 1T = 10^12 << u64::MAX. **Safe.**

**Assumptions:**
- `max_players` is bounded (v1: ≤ 4, v2: ≤ 10) at create_match.
- `deposits_mask` cannot have bits set beyond `max_players`. This is enforced by the `player_index < max_players` check in deposit_wager (lines 264-267 v2, 201-204 v1) — the index is derived from `position()` over `players[..max_players]`.
- `count_ones()` semantics never exceed mask width.

**Invariants:**
- INVARIANT: `1 ≤ count_ones(deposits_mask) ≤ max_players` (after at least one deposit). Enforced by deposit_wager bit-set logic.
- INVARIANT: `wager × count_ones(deposits_mask) ≤ MAX_WAGER × MAX_PLAYERS = 10^12`, far below u64::MAX.

**Concerns:**
None directly. H019 (narrowing cast overflow — Feb dismissed) HOLDS for both v1 and v2 because the upper bound is well below u64::MAX.

### Mechanism 3: Bit Shift for Deposit Mask Tracking

**Location:**
- v1: `programs/solshot-escrow/src/lib.rs:226 (deposit set)`, `235 (full_mask check)`, `516 (compaction)`
- v2: `programs/solshot-escrow-v2/src/lib.rs:287 (deposit set)`, `296 (full_mask check)`, `356 (compaction)`

**Purpose:**
Track per-player deposit state via bitmap; check completion; reorganize on partial fill.

**How it works (v1 226-237):**
```rust
escrow.deposits_mask |= 1u8 << player_index;  // line 226
// ...
let full_mask = (1u8 << escrow.max_players) - 1;  // line 235
if escrow.deposits_mask == full_mask {
    // activate
}
```

**How it works (v2 287-296):**
```rust
escrow.deposits_mask |= 1u16 << player_index;  // line 287
// ...
let full_mask: u16 = (1u16 << escrow.max_players) - 1;  // line 296
```

**Width math:**
- v1: `1u8 << player_index` where `player_index ∈ [0, max_players)` and `max_players ≤ 4`. Max shift = 3. `1u8 << 3 = 8`. Safe.
- v1 `full_mask`: `(1u8 << max_players) - 1`. With max_players = 4, = 16 - 1 = 15. Safe within u8 (max 255). With max_players = 8 (the u8 width), = 256 — this WOULD overflow u8. **BUT max_players is bounded to ≤ 4 in v1's create_match, so this can't trigger.** With overflow-checks=true, an invalid max_players=8 would panic on this shift, which is the correct fail-fast behavior.
- v2: `1u16 << player_index` where `player_index ∈ [0, max_players)` and `max_players ≤ 10`. Max shift = 9. `1u16 << 9 = 512`. Safe.
- v2 `full_mask`: `(1u16 << max_players) - 1`. With max_players = 10, = 1024 - 1 = 1023. Safe within u16 (max 65535). Hypothetical max_players = 16: `1u16 << 16` overflows u16 — panics under overflow-checks=true. **max_players is bounded to ≤ 10 in v2's create_match (constant MAX_PLAYERS = 10).**

**Concerns:**
- v1's `1u8 << max_players` would silently shift to 0 if max_players ≥ 8 (Rust runtime behavior — shift overflow panics in debug, wraps in release UNLESS overflow-checks). With overflow-checks=true, it panics — correct fail-fast.
- This is a defense-in-depth concern: as long as `max_players` is correctly bounded at create_match, the shift cannot overflow. The TooManyPlayers check is the primary defense.

### Mechanism 4: Timestamp Arithmetic with `as i64` Widening (v2-specific)

**Location:**
- v2 `programs/solshot-escrow-v2/src/lib.rs:257, 302, 334, 343, 475, 545`

**Purpose:**
Compute deadlines (deposit deadline, match_end_ts, public reclaim deadline) by adding seconds to `Clock::get()?.unix_timestamp`.

**How it works:**
```rust
// Line 256-258: deposit_deadline = created_at + deposit_window_secs
let deposit_deadline = created_at
    .checked_add(deposit_window_secs as i64)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// Line 301-303: match_end_ts = now + duration_secs
escrow.match_end_ts = now
    .checked_add(duration_secs as i64)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// Line 540-548: reclaim_deadline = match_end_ts + 24h or created_at + window + 24h
let reclaim_deadline = if ctx.accounts.escrow.activated_at > 0 {
    ctx.accounts.escrow.match_end_ts
        .checked_add(PUBLIC_REFUND_GRACE_SECS)
        .ok_or(EscrowError::ArithmeticOverflow)?
} else {
    ctx.accounts.escrow.created_at
        .checked_add(ctx.accounts.escrow.deposit_window_secs as i64)
        .ok_or(EscrowError::ArithmeticOverflow)?
        .checked_add(PUBLIC_REFUND_GRACE_SECS)
        .ok_or(EscrowError::ArithmeticOverflow)?
};
```

**Width math:**
- `deposit_window_secs` and `duration_secs` are u32. Max values bounded by MAX_DEPOSIT_WINDOW_SECS = 86_400 (24h) and MAX_DURATION_SECS = 604_800 (7 days).
- `as i64` from u32: lossless widening (u32 max ≈ 4.3e9, i64 max ≈ 9.2e18).
- `Clock::get()?.unix_timestamp`: i64. Current value ~1.7e9. Max: i64::MAX ≈ 9.22e18 (year 292 billion AD).
- Sum: 1.7e9 + 6.05e5 (7d) ≈ 1.7e9 + small const. Safe.
- Even at extreme: 1.7e9 + 8.64e4 (24h, deposit window) + 8.64e4 (24h, reclaim grace) ≈ 1.7e9 + 1.7e5. **No realistic overflow.**

**Assumptions:**
- `created_at` is small (current Unix timestamp). Cannot overflow when added to bounded duration.
- `Clock::get()?.unix_timestamp` returns a non-negative i64 in normal operation.

**Invariants:**
- INVARIANT: `created_at < deposit_deadline < match_end_ts < reclaim_deadline` for activated matches (assuming deposit_window_secs > 0 — enforced by MIN_DEPOSIT_WINDOW_SECS = 60).
- INVARIANT: `checked_add` ensures any sum overflow aborts the instruction.

**Concerns:**
None. H020 (clock drift at settlement deadline — Feb dismissed) HOLDS. The v2 model uses `match_end_ts` instead of v1's `activated_at + SETTLEMENT_TIMEOUT_SECONDS`, but the math is structurally identical.

### Mechanism 5: Lamport Conservation in Refund Loops

**Location:**
- v1 cancel_match: `programs/solshot-escrow/src/lib.rs:393-410`
- v1 permissionless_reclaim: `programs/solshot-escrow/src/lib.rs:465-478`
- v2 cancel_match: `programs/solshot-escrow-v2/src/lib.rs:502-510`
- v2 permissionless_reclaim: `programs/solshot-escrow-v2/src/lib.rs:561-569`

**Purpose:**
Refund each deposited player by directly mutating lamports on the PDA (no CPI).

**How it works (v1 393-410):**
```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);
    let bit_set = (deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);
    require!(*account.key == players[i], EscrowError::InvalidPlayer);

    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

**Width math:**
- `wager_lamports`: u64.
- `escrow.lamports`: u64 (held in `try_borrow_mut_lamports`).
- `account.lamports`: u64.
- Per-iteration: `escrow.lamports -= wager` (UNCHECKED — would silently wrap on underflow without overflow-checks).
- With overflow-checks=true: panics on underflow → defense layer #2 (the per-bit check is defense layer #1).

**Assumptions:**
- The total deposits accumulated in escrow.lamports equals `count_ones(deposits_mask) × wager_lamports` plus rent reserve.
- The loop iterates AT MOST `max_players` times (bounded by `i < max_players` check).
- Each iteration only fires for `bit_set` slots (i.e., at most `count_ones(deposits_mask)` times).

**Invariants:**
- INVARIANT: `escrow.lamports >= count_ones(deposits_mask) × wager_lamports` at loop entry. Verified by deposit_wager (each deposit adds wager via system_program::transfer).
- INVARIANT: After loop, `escrow.lamports = (initial - count_ones(deposits_mask) × wager) = rent_reserve` (which is then transferred to caller via close = caller).

**Concerns:**
- H012 (lamport underflow) is structurally prevented by the `bit_set` guard — only deposited slots are debited. With overflow-checks=true, any accounting error would panic instead of silently wrapping.
- Re-validation on v2: identical structure. The u16 mask doesn't change anything (bit-shift logic is the same; bounds are bounded by max_players ≤ 10 → mask bits 0..9).
- See A09 in summary — H012 dismissal HOLDS.

### Mechanism 6: BPS Cap Validation (v2-specific)

**Location:**
- v2 `programs/solshot-escrow-v2/src/lib.rs:76-79 (initialize)`, `128-131 (update)`

**Purpose:**
Enforce that `fee_bps_treasury + fee_bps_ops ≤ MAX_FEE_BPS = 1000` (i.e., total fee ≤ 10%).

**How it works:**
```rust
require!(
    (fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
    EscrowError::FeesTooHigh
);
```

**Width math:**
- `fee_bps_treasury` and `fee_bps_ops` are u16. Max values = 65_535 each.
- `as u32` widening: lossless. Max value = 65_535.
- `u32 + u32`: max = 131_070 << u32::MAX (4.29 × 10^9). The widening prevents u16 overflow that `u16 + u16` would silently wrap to.
- Comparison `<= MAX_FEE_BPS as u32 = 1_000`. Safe.

**Assumptions:**
- The widening to u32 prevents the addition overflow. ✅ Verified.
- The check is the ONLY defense between user-supplied BPS and the snapshot/settle pipeline. ⚠️ See A02/A03/A04.

**Invariants:**
- INVARIANT: AFTER initialize_config or update_config, `cfg.fee_bps_treasury + cfg.fee_bps_ops ≤ 1000`. Enforced.
- ASSUMPTION: This invariant is preserved through the entire lifecycle of a config record. Yes — only update_config and initialize_config can mutate these fields, and both validate.

**Concerns:**
- The cap is on the SUM, not on individual values. Individually, `fee_bps_treasury` could be 999 (out of 1000 cap) and `fee_bps_ops` could be 1, and the sum is 1000 — passes. Treasury would receive 9.99% of pot, ops 0.01% — semantically odd but mathematically valid. Not a vuln, just an observation.
- The check is missing at create_match (post-snapshot) and at settle_match (consumption). If any path snapshot-poisons the values (e.g., direct write via authority compromise + raw account write), there is no downstream validation. This is theoretical (no such path exists — only the program's own update_config can write), but worth flagging as defense-in-depth gap.
- The MAX_FEE_BPS = 1000 means the maximum total fee is 10% — but the maximum individual treasury_bps is also 1000 (if ops=0). With treasury_bps=1000, `treasury_amount = 10% of pot`. Winner gets 90%. No invariant violation.
- Actually the more interesting concern: what's the MINIMUM fee? It's 0 (if both fields are 0). With `fee_bps_treasury = 0` and `fee_bps_ops = 0`, treasury and ops both receive 0 lamports, and winner gets the entire pot. This bypasses the protocol fee revenue. The cap doesn't have a floor. **Likely a deliberate design flexibility (testing, promotional matches)**, not a vuln, but flag for token & economic agent.

## Trust Model

### Trusted (input must be honest)
- The workspace `Cargo.toml` profile setting `overflow-checks = true`. If this is removed during deployment or overridden in CI, all unchecked arithmetic in the lamport-manipulation code (e.g., `**escrow.lamports.borrow_mut() -= wager`) would silently wrap, breaking conservation guarantees.
- The Anchor compiler honors `#[derive(AnchorSerialize, AnchorDeserialize)]` and `#[account]` correctly to layout u128/u64/u16 fields.
- The Solana runtime returns valid `Clock::get()?.unix_timestamp` values (non-negative, monotonic-ish).
- The authority key (in v2) does not poison `fee_bps_treasury` or `fee_bps_ops` via update_config beyond the MAX_FEE_BPS cap. **This trust assumption is wider in v2 than in v1 — v1 placed zero trust on the authority for arithmetic correctness (BPS were constants); v2 places trust on the authority + the cap-check at update_config.**

### Untrusted (input must be validated)
- `players: Vec<Pubkey>` — bounded length checked at create_match.
- `wager_lamports: u64` — bounded between MIN_WAGER and MAX_WAGER.
- `deposit_window_secs: u32`, `duration_secs: u32` — bounded by MIN/MAX constants.
- `winner: Pubkey` — validated against escrow.players in SettleMatch struct.
- `fee_bps_treasury: u16`, `fee_bps_ops: u16` (initialize_config and update_config inputs) — bounded by MAX_FEE_BPS combined cap. **Per-field bounds NOT explicitly checked, only the sum.**
- `match_id: String` — length capped at 32.
- `remaining_accounts: &[AccountInfo]` — each account validated by index, bit, and pubkey match in cancel/reclaim loops.

### Trust boundary expansion v2 vs v1
- v1: BPS were `const TREASURY_BPS: u64 = 700` and `const OPS_BPS: u64 = 300`. Zero runtime mutation surface.
- v2: BPS are runtime state in `GlobalConfig` (mutable by authority via update_config). New trust placed on:
  1. `update_config` cap-check correctness (line 128-131).
  2. The authority not abusing BPS update privileges.
  3. The snapshot-at-create semantics (preventing mid-flight rotation from affecting active matches).

## State Analysis

### State read by arithmetic operations
- `wager_lamports: u64` — read at deposit_wager, settle_match, cancel_match, reclaim, start_with_depositors.
- `deposits_mask: u8 (v1) / u16 (v2)` — read for bit checks, count_ones, full_mask comparison.
- `max_players: u8` — read for bounding loop iterations and for full_mask shift.
- `created_at: i64` — read for timeout calculations.
- `activated_at: i64` — read for deadline calculations.
- `match_end_ts: i64` (v2 only) — read for reclaim deadline.
- `duration_secs: u32` (v2 only) — read at activation to compute match_end_ts.
- `deposit_window_secs: u32` (v2 only) — read for deposit deadline and player-cancel deadline.
- `fee_bps_treasury_snapshot: u16` (v2 only) — read at settle_match.
- `fee_bps_ops_snapshot: u16` (v2 only) — read at settle_match.

### State written by arithmetic operations
- `deposits_mask`: bit set at deposit_wager.
- `match_end_ts`: written at activation (deposit_wager full mask, start_with_depositors).
- `state`: enum transitions — not arithmetic per se but in the same code blocks.
- Lamports on escrow PDA: directly mutated via `try_borrow_mut_lamports` in settle_match, cancel_match, reclaim_match.
- Lamports on winner/treasury/ops/player accounts: same.

## Dependencies

- `anchor_lang::prelude::*` — provides `Clock::get()?`, `Result<()>`, `require!`, etc.
- `anchor_lang::system_program` — provides `system_program::transfer` (the only CPI in either program).
- Workspace `overflow-checks = true` in `Cargo.toml` profile.release.
- Rust standard arithmetic semantics: `checked_add`, `checked_sub`, `checked_mul`, `count_ones`, `<<` shift.

## Focus-Specific Analysis

### Arithmetic Operations Inventory

| Location | Operation | Operand Types | Checked? | Intermediate Width | Risk |
|----------|-----------|---------------|----------|-------------------|------|
| v1:226 | `1u8 << player_index` | u8 \| usize | overflow-checks panics on shift > 7 | u8 | LOW (max_players ≤ 4) |
| v1:235 | `(1u8 << escrow.max_players) - 1` | u8 \| u8 | overflow-checks panics on shift > 7 | u8 | LOW (max_players ≤ 4) |
| v1:240 | `escrow.deposits_mask.count_ones() as u64` | u32 → u64 | widening | u64 | LOW |
| v1:241-243 | `wager.checked_mul(num_deposited)` | u64 × u64 | YES (checked) | u64 | LOW |
| v1:267-269 | `activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS)` | i64 + i64 | YES (checked) | i64 | LOW |
| v1:285-288 | `(wager_lamports as u128).checked_mul(num_deposited)` | u64 → u128 × u128 | YES (checked) | u128 | LOW (bounded) |
| v1:290-293 | `total_pot_128.checked_mul(TREASURY_BPS as u128) / BPS_DENOMINATOR as u128` | u128 × u128 / u128 | mul checked, div safe | u128 → u64 | LOW |
| v1:295-298 | Same for OPS_BPS | u128 × u128 / u128 | mul checked, div safe | u128 → u64 | LOW |
| v1:300 | `total_pot_128 as u64` (narrowing) | u128 → u64 | unchecked narrow | u64 | LOW (provably safe via bounds) |
| v1:303-307 | `total_pot.checked_sub(treasury_amount).checked_sub(ops_amount)` | u64 - u64 - u64 | YES (checked) | u64 | LOW |
| v1:317-323 | `**escrow.lamports.borrow_mut() -= winner/treasury/ops_amount` | u64 -= u64 | overflow-checks panics on underflow | u64 | LOW (conservation guard) |
| v1:363-365 | `timeout_reference.checked_add(TIMEOUT_SECONDS)` | i64 + i64 | YES (checked) | i64 | LOW |
| v1:393-410 | refund loop `escrow.lamports -= wager_lamports`, `account.lamports += wager_lamports` | u64 -=, u64 += | overflow-checks panics | u64 | LOW (per-bit guard) |
| v1:449-451 | `timeout_reference.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)` | i64 + i64 | YES (checked) | i64 | LOW |
| v1:499 | `escrow.deposits_mask.count_ones()` | u8 → u32 | widening | u32 | LOW |
| v1:516 | `1u8 << j` | u8 \| usize | overflow-checks panics on shift > 7 | u8 | LOW (j ≤ max_players ≤ 4) |
| v1:524 | `Clock::get()?.unix_timestamp` | (no arithmetic) | n/a | i64 | LOW |
| v1:526-528 | `wager.checked_mul(num_deposited as u64)` | u64 × u64 | YES (checked) | u64 | LOW |
| v1:802 | `8 + 32 + 32 + 32 + 1 + 1 = 106` (constexpr) | usize const | compile-time | usize | LOW |
| v1:846 | SPACE constexpr | usize const | compile-time | usize | LOW |
| **v2:77-79** | `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32` | u16 → u32 + u32 | widening prevents u16 wrap | u32 | LOW |
| **v2:128-131** | Same in update_config | u16 → u32 + u32 | widening prevents u16 wrap | u32 | LOW |
| v2:206 | `players.len() as u8` | usize → u8 | narrowing | u8 | LOW (bounded by MAX_PLAYERS = 10 ≤ 255) |
| v2:256-258 | `created_at.checked_add(deposit_window_secs as i64)` | i64 + (u32→i64) | YES (checked) | i64 | LOW |
| v2:287 | `1u16 << player_index` | u16 \| usize | overflow-checks panics on shift > 15 | u16 | LOW (max_players ≤ 10) |
| v2:296 | `(1u16 << escrow.max_players) - 1` | u16 - u8 | overflow-checks panics on shift > 15 | u16 | LOW |
| v2:301-303 | `now.checked_add(duration_secs as i64)` | i64 + (u32→i64) | YES (checked) | i64 | LOW |
| v2:305-308 | `wager.checked_mul(num_deposited as u64)` | u64 × (u32→u64) | YES (checked) | u64 | LOW |
| v2:329 | `escrow.deposits_mask.count_ones()` | u16 → u32 | widening | u32 | LOW |
| v2:333-335 | `created_at.checked_add(deposit_window_secs as i64)` | i64 + (u32→i64) | YES (checked) | i64 | LOW |
| v2:343 | `escrow.duration_secs as i64` | u32 → i64 | widening | i64 | LOW |
| v2:356 | `1u16 << j` | u16 \| usize | overflow-checks panics on shift > 15 | u16 | LOW (j ≤ max_players ≤ 10) |
| v2:362 | `j as u8` | usize → u8 | narrowing | u8 | LOW (j ≤ 10 ≤ 255) |
| v2:367-369 | `now.checked_add(duration_secs)` | i64 + i64 | YES (checked) | i64 | LOW |
| v2:371-373 | `wager.checked_mul(num_deposited as u64)` | u64 × (u32→u64) | YES (checked) | u64 | LOW |
| **v2:403-406** | `(wager_lamports as u128).checked_mul(num_deposited)` | u64 → u128 × u128 | YES (checked) | u128 | LOW (bounded by MAX_PLAYERS = 10) |
| **v2:408-411** | `total_pot_128.checked_mul(treasury_bps as u128) / BPS_DENOMINATOR` | u128 × (u16→u128) / u128 | mul checked | u128 → u64 | **MEDIUM (snapshotted bps trusted) → see A03/A04** |
| **v2:413-416** | Same for ops_bps | u128 × (u16→u128) / u128 | mul checked | u128 → u64 | **MEDIUM (same)** |
| v2:418 | `total_pot_128 as u64` | u128 → u64 | unchecked narrow | u64 | LOW (bounded) |
| v2:421-425 | `total_pot.checked_sub(treasury_amount).checked_sub(ops_amount)` | u64 - u64 - u64 | YES (checked) | u64 | LOW (with valid BPS) |
| v2:434-441 | Lamport mutations | u64 -=, u64 += | overflow-checks panics | u64 | LOW (conservation guard) |
| v2:475-476 | `created_at.checked_add(deposit_window_secs as i64)` | i64 + (u32→i64) | YES (checked) | i64 | LOW |
| v2:502-510 | refund loop `escrow.lamports -= wager`, `account.lamports += wager` | u64 -=, u64 += | overflow-checks panics | u64 | LOW (per-bit guard) |
| v2:540-548 | reclaim deadline checked_adds | i64 + i64 | YES (checked) | i64 | LOW |
| v2:561-569 | reclaim refund loop | u64 -=, u64 += | overflow-checks panics | u64 | LOW (per-bit guard) |
| v2:822 | SPACE constexpr `8 + (32 * 3) + (2 * 2) + 1 + 1` | usize const | compile-time | usize | LOW |
| v2:888 | SPACE constexpr | usize const | compile-time | usize | LOW |

### Cast Analysis

| File:Line | Source Type | Target Type | Direction | Source Bound | Target Bound | Safe? |
|-----------|-------------|-------------|-----------|--------------|--------------|-------|
| v1:166 | usize (Vec.len()) | u8 | Narrowing | ≤ 4 | 255 | ✅ SAFE |
| v1:206 | u8 (max_players) | usize | Widening | n/a | n/a | ✅ SAFE |
| v1:240 | u32 (count_ones output) | u64 | Widening | ≤ 4 | u64::MAX | ✅ SAFE |
| v1:285 | u8 (deposits_mask count_ones) | u128 | Widening | ≤ 4 | u128::MAX | ✅ SAFE |
| v1:286 | u64 (wager_lamports) | u128 | Widening | ≤ 100B lamports | u128::MAX | ✅ SAFE |
| v1:291, 296 | u64 (BPS const) | u128 | Widening | 700/300 | u128::MAX | ✅ SAFE |
| v1:293, 298 | u128 (BPS calc output) | u64 | Narrowing | ≤ 2.8e10 | u64::MAX | ✅ SAFE (bounded) |
| v1:300 | u128 (total_pot_128) | u64 | Narrowing | ≤ 4e11 | u64::MAX | ✅ SAFE (bounded) |
| v1:347 | usize | usize | n/a | n/a | n/a | n/a |
| v1:351 | u8 (max_players) | usize | Widening | ≤ 4 | usize::MAX | ✅ SAFE |
| v1:428 | u8 → usize (max_players) | usize | Widening | ≤ 4 | usize::MAX | ✅ SAFE |
| v1:499 | u8 → u32 (count_ones output) | u32 | Widening (intrinsic) | ≤ 4 | u32::MAX | ✅ SAFE |
| v1:522 | usize (j) | u8 | Narrowing | ≤ 4 | 255 | ✅ SAFE |
| v1:527 | u32 (count_ones) | u64 | Widening | ≤ 4 | u64::MAX | ✅ SAFE |
| v2:77 | u16 | u32 | Widening | ≤ 65535 | u32::MAX (4.3e9) | ✅ SAFE |
| v2:129 | u16 | u32 | Widening | ≤ 65535 | u32::MAX | ✅ SAFE |
| v2:172 | u8 (MIN_PLAYERS const) | usize | Widening | 2 | usize::MAX | ✅ SAFE |
| v2:206 | usize | u8 | Narrowing | ≤ 10 | 255 | ✅ SAFE |
| v2:245 | u8 | usize | Widening | ≤ 10 | usize::MAX | ✅ SAFE |
| v2:257 | u32 (deposit_window_secs) | i64 | Widening | ≤ 86400 | i64::MAX | ✅ SAFE |
| v2:302 | u32 (duration_secs) | i64 | Widening | ≤ 604800 | i64::MAX | ✅ SAFE |
| v2:305 | u32 (count_ones) | u64 | Widening | ≤ 10 | u64::MAX | ✅ SAFE |
| v2:330 | u32 (count_ones) | u32 | n/a | ≤ 10 | n/a | n/a |
| v2:330 | u8 (MIN_PLAYERS) | u32 | Widening | 2 | u32::MAX | ✅ SAFE |
| v2:334 | u32 | i64 | Widening | ≤ 86400 | i64::MAX | ✅ SAFE |
| v2:343 | u32 (duration_secs) | i64 | Widening | ≤ 604800 | i64::MAX | ✅ SAFE |
| v2:349 | u8 (max_players) | usize | Widening | ≤ 10 | usize::MAX | ✅ SAFE |
| v2:362 | usize (j) | u8 | Narrowing | ≤ 10 | 255 | ✅ SAFE |
| v2:372 | u32 (count_ones) | u64 | Widening | ≤ 10 | u64::MAX | ✅ SAFE |
| v2:403 | u16 (count_ones output of u16 mask) | u128 | Widening | ≤ 10 | u128::MAX | ✅ SAFE |
| v2:404 | u64 (wager_lamports) | u128 | Widening | ≤ 100B | u128::MAX | ✅ SAFE |
| v2:409 | u16 (treasury_bps_snapshot) | u128 | Widening | **trust-bounded** | u128::MAX | ⚠️ SAFE width-wise; semantic risk via cap bypass (A02-A04) |
| v2:414 | u16 (ops_bps_snapshot) | u128 | Widening | **trust-bounded** | u128::MAX | ⚠️ Same |
| v2:418 | u128 (total_pot_128) | u64 | Narrowing | ≤ 1e12 | u64::MAX | ✅ SAFE |
| v2:475 | u32 (deposit_window_secs) | i64 | Widening | ≤ 86400 | i64::MAX | ✅ SAFE |
| v2:528 | u8 → usize (max_players) | usize | Widening | ≤ 10 | usize::MAX | ✅ SAFE |
| v2:545 | u32 (deposit_window_secs) | i64 | Widening | ≤ 86400 | i64::MAX | ✅ SAFE |

**Net assessment:** Every cast is either lossless widening or narrowing-from-bounded-source. No silent truncation possible. No reinterpretation hazards (no signed↔unsigned at risky widths). H019 (narrowing cast overflow) HOLDS for both v1 and v2.

### Precision Model

The protocol uses lamports (1 SOL = 10^9 lamports) as the only fungible unit. No multi-decimal token math. No oracle prices. No floating-point arithmetic.

- **BPS denominator**: 10_000 = 100% (standard).
- **Rounding direction**: Floor-rounding via integer division for treasury and ops. Winner gets the remainder, so dust accumulates with the winner. Per BOK FEE-INV-5, max dust is 2 lamports (one per division).
- **Precision loss**: Only at the `total_pot × BPS / 10000` step. Loss bound: < 1 lamport per division × 2 divisions = ≤ 2 lamports total.
- **Smallest representable share**: 1 lamport. With MIN_WAGER = 10_000 lamports and MIN bps_treasury_snapshot = 1 bps, treasury would receive `floor(wager × 1 / 10_000)` = `floor(10_000 × 1 / 10_000) = 1`. Safe; FEE-INV-2 holds.
- **v1 specific**: TREASURY_BPS = 700 always, OPS_BPS = 300 always. With MIN_WAGER = 10_000 × 2 = 20_000 pot, treasury = 20_000 × 700 / 10_000 = 1_400. Always ≥ 1. ✅
- **v2 specific**: BPS values can be 0 (no minimum). With `fee_bps_treasury = 0`, treasury receives 0 lamports. This bypasses fee revenue. **Cross-handoff to Token & Economic.**

### Rounding Direction Analysis

The protocol's rounding is intentionally favorable to the winner (the user of the dust pool), not to the protocol. Specifically:
- Treasury receives `floor(pot × treasury_bps / 10000)` — rounded DOWN.
- Ops receives `floor(pot × ops_bps / 10000)` — rounded DOWN.
- Winner gets `pot - treasury - ops` — absorbs the dust UP.

For a single match, dust is ≤ 2 lamports — economically immaterial. For repeated extraction (e.g., 10000 matches per day at MIN_WAGER), maximum extractable dust = 2 × 10000 = 20_000 lamports/day = 0.00002 SOL/day. **Not a concrete attack vector.**

This pattern is the OPPOSITE of EP-019 (rounding direction favoring user as exploit). EP-019 fires when the protocol is shorted across many small operations. Here, the user (winner) gets the dust — but the user is the same as the depositors collectively (via the pot), so this is just dust absorption, not a value extraction.

## Cross-Focus Intersections

- **Token & Economic**: All three pot calculations (settlement, deposit-time event, start_with_depositors event) feed into token-flow correctness. Configurable BPS introduces a new economic variable.
- **State Machine**: BPS snapshot is captured at the AwaitingDeposits state transition (create_match). Mid-flight changes to config don't affect snapshotted matches. State transitions for activate (Active) and settle (Settled) are arithmetic-adjacent.
- **Access Control**: Update_config gates BPS changes via `has_one = authority`. If H001 (one-step authority transfer) is exploited, BPS becomes attacker-controlled.
- **CPI**: The lamport mutations in settle/cancel/reclaim are NOT CPIs — they're direct AccountInfo mutations. This bypasses any CPI-based defense (e.g., Token program's invariant checks). The arithmetic is the only line of defense.
- **Error Handling**: `checked_*` returns `Err(ArithmeticOverflow)` propagated via `?`. The instruction reverts entirely (Solana TX atomicity). For most paths, this is a clean revert. For settle_match with poisoned BPS (A03), the revert leaves the match in Active state — bricked. Cross-handoff: Error Handling agent should investigate recovery paths.
- **Timing**: All `checked_add` operations on i64 timestamps interact with timing. The timestamp arithmetic itself is sound — the timing risk is in the duration values themselves (bounded), not in the arithmetic.

## Cross-Reference Handoffs

- → **Token & Economic Agent**: Investigate A02 — the v2 update_config "individual BPS not capped" semantic. Is there ANY way (via update_config or a direct authority signature path) for `fee_bps_treasury_snapshot` to exceed 10_000? If so, settle_match becomes a fund-loss vector. Also investigate the BPS=0 scenario — is "zero fee match" intended?
- → **Access Control Agent**: Confirm whether v2 `update_config` is gated solely by `has_one = authority`. Trace the authority transfer mechanism (recall H001). If a malicious authority can be installed via one-step transfer, BPS poisoning becomes part of the attack chain.
- → **State Machine Agent**: Verify the deposits_mask invariant — that `count_ones(deposits_mask) ≤ max_players` holds at every state transition. If not, the pot calculation could wildly overshoot.
- → **Error Handling Agent**: Map what happens when `winner_amount = checked_sub(...)` returns None on settle_match in v2. Currently: instruction reverts, match stays Active. Is there any recovery path (besides cancel_match, which requires AwaitingDeposits state)? If not, the match is bricked → DoS.
- → **Upgrade & Admin Agent**: BPS configurability is a NEW admin capability. The Phase 2/3 architecture review should weigh this against the centralization risk.

## Risk Observations

1. **A01: BOK proptest covers v1 only**. The 4 BOK proptest files (`bok_proptest_fee.rs`, `bok_proptest_space.rs`, `bok_proptest_timestamp.rs`, `bok_litesvm.rs`) all use hardcoded TREASURY_BPS=700, OPS_BPS=300, num_deposited∈[2,4], MIN_WAGER=10_000, MAX_WAGER=100_000_000_000. None of v2's ranges (BPS ∈ [0, 1000], num_deposited ∈ [2, 10]) are covered. **Coverage gap, not a vuln**. Recommend adding v2-specific proptests covering the full BPS/player matrix.

2. **A02: v2 update_config combined-cap-only check**. The cap `(treasury + ops) <= MAX_FEE_BPS` is the SUM, not per-field. With u16 fields (max 65_535 each), the per-field upper bound is HUGE compared to MAX_FEE_BPS. The widening to u32 prevents the SUM from wrapping (65_535 + 65_535 = 131_070, fits in u32). But the underlying per-field value of 65_535 has no individual cap. The current check rejects any total > 1000, so single-field max is also implicitly ≤ 1000 (when the other side is 0). **Not a vuln in normal flow** — but adds defense-in-depth importance to the cap-check correctness.

3. **A03: Snapshot-time validation gap**. After update_config writes valid BPS, create_match snapshots them into `escrow.fee_bps_treasury_snapshot` and `escrow.fee_bps_ops_snapshot` WITHOUT re-validation. If any write to GlobalConfig somehow bypassed the cap (theoretical — would require Anchor account-validation bypass), the bad values would propagate to escrows. **Theoretical only**, but defense-in-depth.

4. **A04: Settle-time validation gap**. `settle_match` at v2:387-454 reads the snapshotted BPS and computes treasury/ops/winner amounts WITHOUT re-validating cap. If the snapshot was somehow poisoned, this is the consumption path. The `checked_sub` chain at 421-425 is the LAST defense — if `treasury + ops > pot`, the second `checked_sub` returns None and aborts.

5. **A05: H028 verdict on v2 — INVALIDATED**. The Feb dismissal of H028 ("BPS constants hardcoded; no runtime modification") does NOT apply to v2. v2's BPS are runtime-configurable via update_config. **However**, the v1 dismissal STILL HOLDS (constants in v1 unchanged). For v2, see A02-A04 for the new attack surface.

6. **A06: H019 verdict on v2 — HOLDS**. Narrowing cast overflow was dismissed in Feb because ~131T SOL would be needed. v2's pot scales with N-players (now up to 10), increasing the max pot to 1T lamports = 1000 SOL. Still well below the threshold. Verified.

7. **A07: H020 verdict on v2 — HOLDS**. Clock-drift at settlement deadline is a non-issue because v2 uses `match_end_ts` directly, not a calculated `activated_at + window`. The window is set ONCE at activation (locked in). Per-match windows (60s minimum) provide adequate margin.

8. **A08: H012 verdict on v2 — RE-VALIDATED, HOLDS**. Lamport underflow on cancel/reclaim is prevented by:
   - Per-bit guard: only `bit_set` slots get decremented.
   - Loop bound guard: `i < max_players`.
   - `overflow-checks=true` profile setting (Cargo.toml:8-11) — silent wraps panic.
   - Conservation invariant: `escrow.lamports >= count_ones(deposits_mask) × wager_lamports + rent`.
   v2's u16 mask doesn't change any of these guarantees. The maximum loop iterations = 10 (max_players), and the maximum lamport debit = 10 × 100B = 1T lamports, still ≪ u64::MAX.

9. **A09: Lamport conservation defense layer is overflow-checks=true**. Verified that `Cargo.toml:8-11` sets `overflow-checks = true` in `[profile.release]`. This is inherited by both program crates (no per-program override). If this flag were ever removed, the unchecked `**escrow.lamports.borrow_mut() -= wager` operations would silently wrap on underflow, breaking conservation. **Defense layer is intact.**

10. **A10: BPS = 0 is allowed**. `fee_bps_treasury = 0` is a valid configuration. With this, treasury receives 0 lamports at settle. This bypasses protocol fee revenue. **Likely intentional for testing/promotional matches**, but worth flagging.

11. **A11: SPACE arithmetic**. Both v1 (`8 + (4 + 32) + 32 + (4 * 32) + 1 + 8 + 1 + 1 + 8 + 8 + 1 = 232`) and v2 (`8 + (4 + 32) + 32 + (32 * MAX_PLAYERS) + 1 + 8 + 2 + 4 + 4 + 32 + 32 + 2 + 2 + 1 + 8 + 8 + 8 + 1 = 509`) use compile-time const expressions for SPACE. No runtime arithmetic, no overflow risk.

## Novel Attack Surface Observations

### NOVEL-A1: Snapshot-Poisoning of BPS via Authority Compromise (v2-specific)

The v2 design explicitly chose snapshot-at-create semantics to PROTECT in-flight matches from mid-flight config rotation. But the design ALSO chose to skip re-validation at create-time. This means:

1. Authority sets `fee_bps_treasury` via update_config to a value ≤ MAX_FEE_BPS (legal).
2. Authority calls update_config again. **What if this 2nd call somehow bypasses the cap?** It currently doesn't — the cap check is at line 128-131. But hypothetically, a buggy update_config (or a reverse-engineered bug) could set `fee_bps_treasury = 9999, fee_bps_ops = 0` somehow.
3. Authority calls create_match. The escrow snapshots `treasury_bps_snapshot = 9999, ops_bps_snapshot = 0`. **No validation.**
4. Players deposit. Match becomes Active.
5. Authority calls settle_match. Treasury gets `total_pot × 9999 / 10_000` = 99.99% of pot. Winner gets ~0.

The KEY observation: **even if update_config's cap-check is bulletproof today, a future modification could weaken it. There is no defensive layer at create_match or settle_match. This is the kind of TOFU (trust on first use) that breaks easily.**

A simple fix: add `require!(escrow.fee_bps_treasury_snapshot + escrow.fee_bps_ops_snapshot <= MAX_FEE_BPS as u16, EscrowError::FeesTooHigh)` post-snapshot in create_match (line ~214), AND duplicate the check at settle_match (line ~399). Defense in depth.

This is novel to v2 — v1 had no analog because BPS were constants.

### NOVEL-A2: Cross-Mask-Width Asymmetry in v2

v1 mask is u8 (max 8 bits). v1 max_players is 4. The mask has 4 unused bits ALWAYS. The full_mask is `(1u8 << 4) - 1 = 15` (bits 0-3 set).

v2 mask is u16 (max 16 bits). v2 max_players is 10. The mask has 6 unused bits potentially (if max_players = 10). The full_mask is `(1u16 << 10) - 1 = 1023`.

This is fine in normal operation. But here's a novel concern: if someone could somehow set bits in the mask BEYOND `max_players` (say, bit 11 or 12), the `count_ones()` result would be inflated. The pot calculation `wager × count_ones()` would overshoot. The settle_match would compute `total_pot = wager × 11` (instead of × 10), then attempt `escrow.lamports -= 11 × wager × 0.9 ≈ 9.9 × wager`, but escrow only holds 10 × wager total. The `winner_amount = total_pot - treasury - ops` would still satisfy `≤ pot`, but the LAMPORT MUTATION at line 434-441 would attempt to debit MORE than escrow holds.

The protection is the deposit_wager bit-set logic — bit indexes are derived from `players[..max_players]` `position()`. So bits beyond max_players cannot be set in normal flow.

But here's the potential gap: if there's any path where escrow.deposits_mask could be directly written (e.g., a misbehaving start_with_depositors that recomputes `new_mask` with off-by-one), the count_ones could overshoot. Worth a state-machine cross-check.

### NOVEL-A3: BPS=0 is a Silent Configuration

There is no MINIMUM bps. With `fee_bps_treasury = 0` and `fee_bps_ops = 0`, the protocol receives no fees. Is this intended?

If this is for promotional/testing matches, the semantic is fine. But there's no on-chain audit trail that DIFFERENTIATES "this was a promo match" from "this was a regular match with bug-poisoned BPS." The MatchSettled event includes the amounts, but not the snapshotted BPS. **Recommend adding `fee_bps_treasury_snapshot` and `fee_bps_ops_snapshot` to the MatchSettled event for audit clarity.**

## Questions for Other Focus Areas

- **For Access Control focus**: Is `update_config` called only by trusted authority? With H001 (one-step authority transfer) still open, can a malicious authority be installed and then immediately call update_config with poisoned BPS? Walk the attack chain end-to-end.
- **For State Machine focus**: Verify the deposits_mask invariant — that bits beyond max_players cannot be set in any code path. Specifically check start_with_depositors compaction logic at v2:347-359.
- **For CPI focus**: settle_match's lamport mutations are NOT via CPI (`try_borrow_mut_lamports` direct mutation). Is the recipient validation (winner/treasury/ops constraints) sufficient to prevent mis-routing? What if winner is an executable account?
- **For Token & Economic focus**: Is `fee_bps = 0` a valid use case (promotional match)? If yes, the on-chain audit trail is incomplete (BPS not in event). If no, add a MIN_FEE_BPS floor.
- **For Error Handling focus**: When settle_match aborts due to checked_sub returning None (e.g., poisoned BPS sums > 10000), the match is stuck in Active. cancel_match cannot be called (state must be AwaitingDeposits). Only permissionless_reclaim can recover funds — but ONLY after match_end_ts + 24h. Is this acceptable? It's a 24h+ DoS window if BPS gets poisoned mid-match.
- **For Timing focus**: How does match_end_ts interact with BPS-poisoning recovery? With duration_secs up to 7 days + 24h grace = 8-day fund lockup if settle_match is bricked.

## Raw Notes

### Cargo.toml profile inheritance

```
$ cat Cargo.toml | grep -A 5 'profile.release'
[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
```

Workspace members:
- `programs/solshot-escrow` — no profile override in its Cargo.toml ✅
- `programs/solshot-escrow-v2` — no profile override in its Cargo.toml ✅

Both inherit `overflow-checks = true` from workspace.

### BOK proptest constants (v1 only)

```rust
// bok_proptest_fee.rs:32-46
const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10_000;
const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;
```

Strategies:
- `valid_wager_strategy() = MIN_WAGER..=MAX_WAGER`
- `valid_num_deposited() = 2u64..=4u64`

**Coverage gap**: v2 BPS ∈ [0, 1000] AND num_deposited ∈ [2, 10] are NOT exercised. v2 needs its own bok_proptest_v2_fee.rs.

### Specific arithmetic flow in v2 settle_match (annotated)

```rust
// Line 393: Read snapshot values BEFORE mutable borrow
let wager_lamports = ctx.accounts.escrow.wager_lamports;     // u64
let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;  // u16, snapshotted at create_match
let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;            // u16, snapshotted at create_match
let deposits_mask = ctx.accounts.escrow.deposits_mask;       // u16

// Line 403: count_ones returns u32, cast to u128 (lossless)
let num_deposited = deposits_mask.count_ones() as u128;      // u128, max 10

// Line 404-406: Pot in u128
let total_pot_128 = (wager_lamports as u128)
    .checked_mul(num_deposited)
    .ok_or(EscrowError::ArithmeticOverflow)?;
// Max value: 100B * 10 = 10^12 < u64::MAX

// Line 408-411: Treasury split
let treasury_amount = (total_pot_128
    .checked_mul(treasury_bps as u128)         // u16 -> u128 widening
    .ok_or(EscrowError::ArithmeticOverflow)?
    / BPS_DENOMINATOR) as u64;
// IF treasury_bps = 1000 (max valid), max treasury_amount = 10^12 * 1000 / 10000 = 10^11
// IF treasury_bps = 9999 (BYPASS scenario), max treasury_amount = 10^12 * 9999 / 10000 ≈ 10^12 (~entire pot)

// Line 413-416: Ops split
let ops_amount = (total_pot_128
    .checked_mul(ops_bps as u128)
    .ok_or(EscrowError::ArithmeticOverflow)?
    / BPS_DENOMINATOR) as u64;

// Line 418: Narrow total_pot
let total_pot = total_pot_128 as u64;

// Line 421-425: Winner gets remainder
let winner_amount = total_pot
    .checked_sub(treasury_amount)
    .ok_or(EscrowError::ArithmeticOverflow)?
    .checked_sub(ops_amount)
    .ok_or(EscrowError::ArithmeticOverflow)?;
// IF treasury + ops > total_pot (cap bypass), this returns None and aborts.
// Match stays in Active state, cancel_match cannot recover (state mismatch).
// Funds locked until permissionless_reclaim fires (match_end_ts + 24h).
```

### Specific arithmetic flow in v2 update_config (annotated)

```rust
// Line 96-103: Function signature - all params Optional
pub fn update_config(
    ctx: Context<UpdateConfig>,
    new_authority: Option<Pubkey>,
    new_treasury: Option<Pubkey>,
    new_ops: Option<Pubkey>,
    new_fee_bps_treasury: Option<u16>,
    new_fee_bps_ops: Option<u16>,
) -> Result<()> {

// Line 104: mutable cfg
let cfg = &mut ctx.accounts.config;

// Line 118-123: BPS update logic - INDIVIDUAL FIELDS ARE NOT BOUND-CHECKED HERE
if let Some(t) = new_fee_bps_treasury {
    cfg.fee_bps_treasury = t;  // <-- t can be 0..=u16::MAX, no validation here
}
if let Some(o) = new_fee_bps_ops {
    cfg.fee_bps_ops = o;
}

// Line 128-131: Combined cap check - THIS IS THE ONLY DEFENSE
require!(
    (cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
    EscrowError::FeesTooHigh
);
```

**Observation**: The check is correct — it ensures the FINAL state has `treasury + ops ≤ 1000`. But the intermediate state during the function execution can have `cfg.fee_bps_treasury = 9999` for a few microseconds (until line 128 fires). This is fine because:
- Solana TX is atomic — if line 128's require! fires, ALL state changes revert.
- No external observer can see the intermediate state.

So the check is structurally sound. **The risk is purely if the check is REMOVED or WEAKENED in a future modification.**

### What `overflow-checks=true` actually buys us

With `overflow-checks=true`:
- `a + b` panics on overflow (instead of wrapping).
- `a - b` panics on underflow (instead of wrapping).
- `a * b` panics on overflow.
- `a << n` panics if `n >= bit_width(a)`.

In our codebase, this guards:
- The lamport mutations at v1:317-323, 408-409, 476-477 (and v2:434-441, 508-509, 567-568).
- The shift operations at v1:226, 235, 516 (and v2:287, 296, 356).

A panic in a Solana program causes the transaction to revert — which is the correct fail-safe behavior.

**If `overflow-checks=true` were ever removed**, the silent wrapping of `escrow.lamports -= wager` could allow accounting drift. This is the second-tier defense for H012.

### Dust accumulation across many matches (theoretical)

Single-match dust: ≤ 2 lamports → winner.

If a single attacker plays 1000 matches at MIN_WAGER (10_000 lamports):
- Total dust collected: 1000 × 2 = 2000 lamports = 0.000002 SOL.
- Cost to play (gas + escrow rent): far higher than 0.000002 SOL.
- Negative-EV attack — ECONOMICALLY IRRATIONAL (similar to H026 dismissal logic).

### v2 specific: zero-fee match scenario

If `fee_bps_treasury = 0` and `fee_bps_ops = 0`:
- treasury_amount = 0
- ops_amount = 0
- winner_amount = total_pot
- Settle math is fully valid. No errors.
- Treasury and ops PDAs receive 0 lamports each (the `**treasury.lamports += 0` is a no-op, but legal).

Is this exploitable? Only if a PLAYER can cause this configuration. Players cannot — only authority can call update_config. So this is a "trusted authority can disable fees" feature, not a vuln.
