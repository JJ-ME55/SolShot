# SOS Phase 1 — Arithmetic Safety (Bundle 1 Delta-Focus)

**Auditor**: #02 — Arithmetic Safety
**Scope**: Bundle 1 only (S2-T1 governance hardening: 2-step authority rotation, 24h config timelock, migrate_config). New arithmetic surface in `programs/solshot-escrow-v2/src/lib.rs`. The rest of v2 arithmetic was cleared in audit `2026-05-06-226c0cd` and has not been touched by Bundle 1 — those findings (H012/H019/H020/H028 verdicts) are not re-litigated here.
**Output target**: ~15-20 KB

## Bundle 1 Arithmetic Inventory

Five new arithmetic sites added by Bundle 1, plus one prior finding to recheck.

| # | Site | Op | Type | Defense |
|---|------|----|------|---------|
| 1 | v2:255 `require!(now >= earliest)` | i64 ≥ i64 | i64 | timelock gate; `earliest = pending_config_ts + 86400` (checked_add) |
| 2a | v2:212 `new_minimum.checked_sub(current_balance)` | u64 − u64 | u64 | gated by `if current_balance < new_minimum` (so sub is provably positive) |
| 2b | v2:233 `data.iter_mut().skip(current_size)` | usize iterator | usize | gated by early-return `if current_size >= new_size` (L203) |
| 3 | v2:513 `(1u16 << escrow.max_players) - 1` | u16 shift | u16 | `max_players ≤ MAX_PLAYERS=10`; shift+sub safe up to shift=15 |
| 4 | v2:150, v2:276 `(a as u32 + b as u32) <= MAX_FEE_BPS as u32` | u32 + u32 | u32 | widening from u16 — sum at most 2×u16::MAX = 0x1FFFE ≪ u32::MAX |
| 5 | v2:163, v2:252 `now.checked_add(CONFIG_TIMELOCK_SECS)` | i64 + i64 | i64 | checked_add returns None on overflow → `ArithmeticOverflow` |
| H024 recheck | v2:329, v2:522 `deposits_mask.count_ones()` (refund/settle) | u16 → u32 | u32 | unchanged — Bundle 1 didn't touch refund loops |

## Critical Invariants

- **INV-T1**: `now >= pending_config_ts + CONFIG_TIMELOCK_SECS` ⇒ at least 24h has elapsed since propose. **Sentinel**: `pending_config_ts == 0` means "no pending proposal" and MUST be rejected by `NoPendingConfig` before the timelock check is meaningful.
- **INV-T2**: `pending_config_ts > 0` ⇒ a propose call wrote `now` (positive on mainnet); never written from arithmetic on user input.
- **INV-B1**: Live config always satisfies `fee_bps_treasury + fee_bps_ops ≤ MAX_FEE_BPS` (1000 = 10%). Enforced at `initialize_config` (L87), `update_config` post-merge effective check (L150), and `apply_config_update` post-apply check (L276). Three-layer defense.
- **INV-B2**: Effective merge in `update_config` is `pending.unwrap_or(live)` — so the validated state is exactly what `apply_config_update` will commit (modulo a race with `propose_authority` between propose-time and apply-time, which is why L272-278 re-checks).
- **INV-M1** (migrate_config): `current_size < new_size` enforced before any subtraction or zero-fill. Idempotency: if `current_size >= new_size`, return Ok immediately — no-op.
- **INV-S1** (bitmask): `escrow.max_players ≤ 10 < 16` ⇒ `1u16 << max_players` never wraps and `… − 1` never underflows.

## Per-Site Risk Analysis

### Site 1: 24h timelock check (v2:248, 250-255)

```
require!(cfg.pending_config_ts > 0, EscrowError::NoPendingConfig);
let now = Clock::get()?.unix_timestamp;
let earliest = cfg.pending_config_ts.checked_add(CONFIG_TIMELOCK_SECS).ok_or(ArithmeticOverflow)?;
require!(now >= earliest, EscrowError::TimelockNotElapsed);
```

**i64 subtraction safety**: The check is `now >= earliest`, NOT `now - pending >= 86400`, so there's no subtraction in the gate. Computing `earliest` uses `checked_add`, which is the right primitive — overflow at year ~9.2×10¹⁸ seconds past epoch is unreachable in practice but technically guarded.

**Boundary `now == pending + 86400`**: The `>=` is intentionally inclusive — the timelock "fires open" the instant the wall-clock matches the propose+86400 mark. This is the standard convention for timelock gates and is consistent with v2's other inclusive timeouts (e.g., `deposit_window_secs` uses strict `<` per the H018 fix at L477, but that's a different edge — deposit_window's purpose is to reserve the boundary slot for `start_with_depositors`. Apply config has no analog start-vs-apply race, so `>=` is appropriate). **No off-by-one.**

**`pending_config_ts == 0` semantics**: L248 short-circuits the entire path with `NoPendingConfig` before `earliest` is computed. So zero never reaches the i64 add. **SAFE**. Comment at L1142 documents `0 = no pending`. Note: a real Solana `unix_timestamp` will never be 0 (epoch 1970-01-01 is decades behind mainnet genesis), so the sentinel is collision-proof in practice.

**Clock reversal (validator clock goes backwards)**: If `now < earliest`, the `require!` fails with `TimelockNotElapsed` — no underflow, no panic, just rejection. The require is a boolean comparison on i64, which never overflows. **Note**: Solana's `Clock::unix_timestamp` is the cluster's median time and can in principle decrease slightly between slots (vote weight changes can shift the median). Per the official docs this is rare and bounded. Impact here: a small backwards step within the 24h window just delays the apply by that step. The 24h timelock has enough slack to absorb any realistic median drift. **No risk.**

**Adversarial scenario: propose_then_re-propose to reset clock**: An attacker who compromises the authority can keep stuffing `update_config` with no-op payloads (e.g., all `None` arguments) — but wait, an all-None propose still writes `pending_config_ts = now` at L154, which DOES reset the clock. **This is a denial-of-apply pattern**: a compromised authority that can keep calling `update_config` can prevent any prior pending proposal from ever applying. Confirm — yes, see N02 in New Findings.

### Site 2: Realloc size math (v2:201-236)

```
let new_size = GlobalConfig::SPACE;          // 231 (compile-time const)
let current_size = config_info.data_len();   // 110 for pre-Bundle1 config
if current_size >= new_size { return Ok(()); } // idempotent guard

let rent = Rent::get()?;
let new_minimum = rent.minimum_balance(new_size);
let current_balance = config_info.lamports();
if current_balance < new_minimum {
    let lamports_needed = new_minimum.checked_sub(current_balance).ok_or(...)?; // 2a
    system_program::transfer(... lamports_needed)?;
}
config_info.realloc(new_size, false)?;
let mut data = config_info.try_borrow_mut_data()?;
for byte in data.iter_mut().skip(current_size) { *byte = 0; } // 2b
```

**Underflow on `new_size - current_size`**: There is no explicit `new_size - current_size`. The zero-fill uses `iter_mut().skip(current_size)`, which is safe even when `current_size > data.len()` (skip just yields no items). And the idempotent guard at L203 returns Ok if `current_size >= new_size`, so by L233 we know `current_size < new_size = data.len()` (since the realloc just sized data to `new_size`). The `skip(current_size)` is then exactly the new bytes. **SAFE.**

**Rent top-up underflow (`new_minimum - current_balance`)**: Guarded by `if current_balance < new_minimum` at L211, so the subtraction is provably positive. The `checked_sub` is belt-and-suspenders and would panic via `ArithmeticOverflow` rather than wrap if guard were ever wrong. **SAFE.**

**Account already over-funded**: If `current_balance >= new_minimum`, the entire transfer block is skipped — no underflow can occur. `realloc(new_size, false)` doesn't require any additional lamports if the account is already adequately rented for the new size. **SAFE.**

**Subtle concern**: `realloc` is called BEFORE the zero-fill borrow. Between realloc and `try_borrow_mut_data`, the new bytes are uninitialized. Anchor's docs warn against relying on uninitialized data; the immediate zero-fill addresses this. No timing window where Option discriminants are read from junk bytes because: (a) the account isn't deserialized in this instruction (uses UncheckedAccount), and (b) Anchor's Account<GlobalConfig> deserialization happens on the NEXT instruction call, by which point the zero-fill has committed (atomic in-instruction). **SAFE.**

### Site 3: Bitmask sizing (v2:513)

```
let full_mask: u16 = (1u16 << escrow.max_players) - 1;
```

`escrow.max_players` is `u8`, set at L420 as `players.len() as u8`. `players.len()` is bounded `≤ MAX_PLAYERS = 10` (L387 `require!(players.len() <= MAX_PLAYERS)`). So shift amount ≤ 10, well below u16's 16-bit width.

**`1u16 << 10` = 1024**, then `−1 = 1023` = 0x3FF (10 bits set). All clean, no wrap, no underflow.

**At `max_players = 16`**: `1u16 << 16` wraps to 0 (debug: panic; release without overflow-checks: wrap; release WITH overflow-checks: panic). Then `0 − 1` underflows to `u16::MAX = 0xFFFF` (all 16 bits set). The mask would erroneously include 6 phantom slots that don't correspond to any player. `deposits_mask == full_mask` would NEVER fire because `deposits_mask` only has bits for indexes < `max_players` (set at L504 via `1u16 << player_index`). So the match would never auto-activate via the all-deposited path, only by manual `start_with_depositors`. This is the silent-breakage mode the prompt asks about.

**Current safety**: `MAX_PLAYERS = 10` (L31) and the require at L387 enforces it. The release profile in workspace `Cargo.toml` has `overflow-checks = true` (per audit-history A08), so a shift overflow would panic rather than wrap.

**Future-proof concern (CONFIRMED but LOW)**: If someone later raises `MAX_PLAYERS` to ≥ 16 without simultaneously widening `deposits_mask` from `u16` to `u32`, the bitmask sizing breaks silently in semantic mode (or noisily via panic in release with overflow-checks). The fields are decoupled:
- `MAX_PLAYERS: usize = 10` at L31
- `deposits_mask: u16` at struct definition L1187 (per HOT_SPOTS — not re-read here, trusted)
- `players: [Pubkey; MAX_PLAYERS]` already correctly uses the constant at L1182-ish

A compile-time `const_assert!(MAX_PLAYERS as u32 <= u16::BITS as u32)` or similar would harden this. Currently no such assertion. See N03.

### Site 4: BPS effective-state validation (v2:150, v2:276)

```
// update_config (L143-144 + L150):
let eff_fee_t = cfg.pending_fee_bps_treasury.unwrap_or(cfg.fee_bps_treasury);
let eff_fee_o = cfg.pending_fee_bps_ops.unwrap_or(cfg.fee_bps_ops);
require!((eff_fee_t as u32 + eff_fee_o as u32) <= MAX_FEE_BPS as u32, FeesTooHigh);

// apply_config_update (L275-278):
require!(
    (cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
    EscrowError::FeesTooHigh
);
```

**Overflow safety**: Both operands cast u16 → u32 (widening) before adding. Max sum = `2 × u16::MAX = 131_070`, fits easily in u32 (max 4.29×10⁹). The cap `MAX_FEE_BPS = 1000` is far below either operand's max, so the require triggers way before any numeric ceiling. **SAFE.**

**This is the H028 fix** — audit-history A10 noted that H028's Feb dismissal ("constants hardcoded; no runtime modification") was INVALIDATED on v2 because BPS became runtime-configurable. Bundle 1 hardens this in three layers:
1. `initialize_config` L87 — genesis cap check
2. `update_config` L150 — propose-time effective-state cap check (validates the merge result)
3. `apply_config_update` L276 — post-apply cap check (catches race with `propose_authority` per L270-271 comment)

The L276 re-check is critical: between propose and apply, `propose_authority` could rotate `cfg.authority`. If the new authority happens to equal a pending treasury/ops, the L146-148 distinctness check at propose-time would have passed against the OLD authority. L272-274 re-checks distinctness on the NEW post-apply state. The BPS cap doesn't depend on authority rotation, but checking it again is consistent defense-in-depth.

**No overflow risk in either site.** The widening pattern is correct and the cap (1000) leaves vast headroom.

### Site 5: `now.checked_add(CONFIG_TIMELOCK_SECS)` (v2:163, v2:252)

```
applies_at: now.checked_add(CONFIG_TIMELOCK_SECS).ok_or(EscrowError::ArithmeticOverflow)?
let earliest = cfg.pending_config_ts.checked_add(CONFIG_TIMELOCK_SECS).ok_or(...)?;
```

`now` and `pending_config_ts` are both `i64`. `CONFIG_TIMELOCK_SECS = 86_400`. `i64::MAX ≈ 9.2 × 10¹⁸` — unreachable until cosmic timescales (~292 billion years post-epoch). `checked_add` correctly returns `None` on overflow rather than wrapping. **SAFE** at every realistic clock value.

## Prior-Finding Status

### H024 (non-contiguous deposits_mask in refund loop)

Audit `2026-05-06-226c0cd` Mechanism 5 ("Lamport Conservation in Refund Loops") established that `deposits_mask` non-contiguity is handled correctly: refund loops at v1:393-410 and v2 refund_wager/cancel iterate over `0..max_players` and test each bit individually via `(deposits_mask >> i) & 1`, so non-contiguous bits (e.g. mask = 0b1010 from a 3rd-and-4th-but-not-1st-and-2nd partial-deposit scenario) refund only the deposited slots. With `overflow-checks = true`, any conservation error would panic rather than wrap.

**Bundle 1 changes touching this surface**: NONE. Bundle 1 added/touched only config-management instructions (`initialize_config`, `update_config`, `migrate_config`, `apply_config_update`, `propose_authority`, `accept_authority`) plus the `GlobalConfig` struct. The match lifecycle path (`deposit_wager`, `refund_wager`, `cancel_match`, `permissionless_reclaim`, `settle_match`, `start_with_depositors`) was not modified. The `deposits_mask: u16` type was widened from v1's u8 in the original v2 work (pre-Bundle 1) and that's already accounted for in the prior audit.

**H024 dismissal HOLDS.** No regressions.

## New Findings

### N01 (LOW) — `update_config` resets `pending_config_ts` on every call

**Site**: `programs/solshot-escrow-v2/src/lib.rs:154`
```
cfg.pending_config_ts = now;
```

`update_config` writes `now` unconditionally — every call (re-proposal, no-op all-None, or a partial update on top of a still-pending proposal) restarts the 24h clock. The L103-114 comment doesn't explicitly call this out.

**Impact**: A compromised authority can grief the protocol by repeatedly calling `update_config` (all-None payload — costs only fees + signature) to keep the timelock fresh and prevent `apply_config_update` from ever firing. This is *denial-of-apply*, not theft — the pending state can't actually take effect, but neither can a legitimate prior pending state.

**Severity**: LOW. (a) requires authority compromise — the attacker is already in a position to do worse via `propose_authority`. (b) Doesn't expose theft or fund risk. (c) The `propose_authority`/`accept_authority` flow (no timelock) is the recovery path against a compromised authority — admin rotation isn't blocked.

**Recommendation**: Document this behavior in the L103 comment. Optional hardening: track a `pending_config_id` counter so re-proposals don't silently coalesce, and event consumers can detect re-proposal patterns off-chain.

### N02 (LOW, future-proof) — `MAX_PLAYERS` constant and `deposits_mask: u16` are type-decoupled

**Site**: `programs/solshot-escrow-v2/src/lib.rs:31` + `:1187` (struct field) + `:513` (mask construction)

`MAX_PLAYERS: usize = 10` is the bound on `players.len()` and on the shift amount in `(1u16 << escrow.max_players) - 1`. If a future code change raises this to ≥ 16 without simultaneously widening `deposits_mask` (and `players: [Pubkey; MAX_PLAYERS]`, and the bit ops at L487/504/513) to u32, the bitmask math breaks:
- shift = 16 wraps `1u16 << 16` to 0 (or panics under overflow-checks)
- `0 - 1` underflows to `u16::MAX = 0xFFFF` (or panics)
- 6 phantom bits set in `full_mask`, auto-activation at L514 never fires

**Current safety**: SAFE — `MAX_PLAYERS = 10` and L387 enforces it. Workspace `overflow-checks = true` would surface a shift wrap as a panic in tests.

**Severity**: LOW (latent — code today is correct). Worth a comment-level guard at L31:
```rust
// SAFETY: MAX_PLAYERS must be ≤ 16 so deposits_mask (u16) bit ops don't wrap.
// Widening MAX_PLAYERS above 16 requires also widening deposits_mask to u32 + updating L487/504/513.
const MAX_PLAYERS: usize = 10;
```
Or a compile-time assertion: `const _: () = assert!(MAX_PLAYERS <= 16);`.

**Recommendation**: Add the SAFETY comment now. The compile-time assert is even better but not strictly required since 10 is far from the boundary.

### N03 (INFO) — Inclusive `>=` on timelock gate is the correct convention

**Site**: `programs/solshot-escrow-v2/src/lib.rs:255`
```
require!(now >= earliest, EscrowError::TimelockNotElapsed);
```

The prompt flagged the `>=` vs `>` boundary as a concern. Confirming this is the correct convention — at exactly `now == earliest`, the 24h has fully elapsed and the apply should be permitted. The reciprocal pattern at deposit_wager (L477 `<` strict) is intentionally different because that boundary has a competing path (`start_with_depositors`) that wants the boundary slot exclusively (H018 fix).

No issue. Documenting for completeness so the verdict isn't re-litigated.

### N04 (INFO) — `migrate_config` rent top-up uses `auth_info` as payer

**Site**: `programs/solshot-escrow-v2/src/lib.rs:218`
```
from: auth_info.to_account_info(),
to: config_info.to_account_info(),
```

The authority pays the realloc rent top-up. Since `migrate_config` is gated by `require!(stored_authority == auth_info.key())` at L197, only the current authority can call this — so they're paying for their own account's upgrade. Reasonable.

**Arithmetic concern**: None — this is a CPI invocation with a u64 `lamports_needed` value that was computed via `checked_sub` from `new_minimum` and `current_balance`. The system program enforces its own balance invariants. The authority's account can't go negative because system_program::transfer will fail with `InsufficientFunds` if `auth_info.lamports() < lamports_needed`.

No new finding — this is access-control's domain. Flagging for handoff.

## Cross-Focus Handoffs

- **→ Access Control / Authority** (Auditor #01): N01 (re-proposal clock reset) is fundamentally an access-control concern — the arithmetic is correct; the gripe is who can stall the timelock. Worth confirming the recovery story: if authority is compromised, `propose_authority` (no timelock) is the escape hatch. Verify `accept_authority` requires the NEW key's signature (per audit-history L154-155, yes it does) so an attacker who steals the live authority key can't grief AND swap themselves into the pending slot via accept.

- **→ Upgrade & Migration** (Auditor whoever): `migrate_config` correctness depends on the assumption that v1's serialized layout has `authority` at bytes [8..40]. The HOT_SPOTS row at L51 notes this assumption needs verification against the actual v1 SPACE comment / old binary. Arithmetic side is clean; layout side is theirs.

- **→ State Machine** (Auditor whoever): `pending_config_ts = 0` as a sentinel works because Solana `unix_timestamp` is post-1970 (never 0 in practice). If someone ever introduces a clock primitive that can return 0 (e.g., reading a slot-derived value pre-genesis), this sentinel collides. Document the assumption.

- **→ Token & Economic** (Auditor whoever): Audit-history A02 ("0..u16::MAX BPS attack surface — authority sets fees to 9999, drains pot via fee redirect") is now gated by the 24h timelock + `(eff_fee_t + eff_fee_o) as u32 <= 1000` check at L150. So a compromised authority can no longer set BPS to 9999 — the propose-time check rejects with `FeesTooHigh`. Bundle 1 substantially mitigates A02. Re-verify their A02/A03/A04 chain analysis against Bundle 1.

## Summary for Caller

**Timelock i64 semantics (Site 1)**: SAFE.
- `>=` is the correct boundary (inclusive at exactly 24h elapsed, consistent with timelock convention).
- `pending_config_ts == 0` sentinel is rejected at L248 (`NoPendingConfig`) before any arithmetic.
- Clock reversal: the boolean comparison `now >= earliest` simply rejects; no underflow, no panic. Solana median-time drift is bounded and well within the 24h slack.
- All time math uses `checked_add` correctly.

**Realloc underflow status (Site 2)**: SAFE.
- `new_size - current_size` is not explicit; zero-fill uses `iter_mut().skip(current_size)` which is iterator-safe.
- Idempotent guard at L203 short-circuits if `current_size >= new_size`.
- Rent top-up `new_minimum - current_balance` is gated by `if current_balance < new_minimum` AND uses `checked_sub` as belt-and-suspenders.
- Account-already-over-funded path skips the transfer entirely — no underflow possible.

**Bitmask future-proof concern (Site 3)**: CONFIRMED LOW.
- Today's code is SAFE: `MAX_PLAYERS = 10`, shift amount ≤ 10, well below u16's 16-bit width.
- Latent risk: `MAX_PLAYERS` (`usize` constant) and `deposits_mask` (`u16` field) are type-decoupled. Raising `MAX_PLAYERS` to ≥ 16 without widening the mask to u32 silently breaks auto-activation (or panics under overflow-checks). Recommend a SAFETY comment + optional `const_assert!(MAX_PLAYERS <= 16)`. Filed as N02.

**Net new findings**: 1 LOW (N01 re-propose clock reset, denial-of-apply by compromised authority), 1 LOW-latent (N02 type-decoupled MAX_PLAYERS/u16 mask), 2 INFO (N03, N04).

**Prior dismissals**: H024 HOLDS — refund/settle loops untouched by Bundle 1.
