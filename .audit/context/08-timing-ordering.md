---
task_id: sos-phase1-timing-ordering
provides: [timing-ordering-findings, timing-ordering-invariants, bundle1-timelock-verification]
focus_area: timing-ordering
delta_from: 2026-05-06-226c0cd/context/08-timing-ordering.md
files_analyzed: [
  "programs/solshot-escrow/src/lib.rs",
  "programs/solshot-escrow-v2/src/lib.rs"
]
finding_count: 9
severity_breakdown: {critical: 0, high: 0, medium: 4, low: 5}
prior_findings_status: {H035: resolved-v1, H018: resolved-v2, H039: resolved-v2, H006: status_changed_to_resolved-v1, H007: resolved-v2, H040: resolved-v1, H010: partial}
---

<!-- CONDENSED_SUMMARY_START -->
# Timing & Ordering — Bundle 1 Delta Analysis

## Headline

**Bundle 1 (24h config timelock) is SAFE.** The i64 arithmetic uses `checked_add`, the sentinel value `pending_config_ts == 0` is structurally sound (Solana `Clock::get()?.unix_timestamp` is always > 0 in practice), and the `>=` boundary at v2:255 is intentional (1-second edge favors timely apply). H035 (settle-vs-cancel race) is RESOLVED on v1 by constant unification (TIMEOUT_SECONDS raised 600→3600 to match SETTLEMENT_TIMEOUT_SECONDS). H035 on v2 is structurally different — no settlement deadline exists, so the "race" reframes as "settle anytime vs cancel after match_end_ts". H018 (deposit_deadline edge collision) is RESOLVED via strict `<` at v2:477. H039 (7d→24h duration cap) is CONFIRMED at v2:42.

## Key Findings

- **24h timelock arithmetic is SAFE.** `pending_config_ts` (i64) stores propose-time `unix_timestamp`. Earliest-apply = `pending_config_ts + 86400` via `checked_add` with `ArithmeticOverflow` propagation (v2:252-254). Sentinel `pending_config_ts == 0` (line 248, 281) is safe because Solana's clock is post-1970 (always > 1.7×10^9). Boundary `now >= earliest` is acceptable (1-second favor-apply).
- **H035 RESOLVED on v1**: TIMEOUT_SECONDS = 3600 (v1:22) now equals SETTLEMENT_TIMEOUT_SECONDS = 3600 (v1:29). At `now = activated_at + 3600`, settle expires (`<=` at v1:287) at the same instant player_cancel opens (`>` at v1:383). No race window. Race is replaced by a 1-second handoff edge (settle valid through 3600 inclusive; player_cancel valid from 3601). PERMISSIONLESS_RECLAIM_TIMEOUT = 7200 (v1:26) — H040 stale comment fix confirmed.
- **H035 on v2 — structurally different, NOT a race in current spec**: v2 has NO settlement deadline (v2:604-671 — `settle_match` has no time check). Player cancel opens at `match_end_ts` (v2:688-697). After match_end_ts, both settle and cancel are simultaneously valid until reclaim (match_end_ts + 24h). This is the same architecture flagged in prior audit, UNCHANGED by Bundle 1. Severity is now lower in practical impact because MAX_DURATION_SECS dropped from 604800→86400 (24h ceiling) — race window is bounded at 24h post-end regardless of duration.
- **H018 RESOLVED on v2**: deposit_wager uses strict `<` (v2:477), start_with_depositors uses `>=` (v2:554). At exactly T = deposit_deadline, only start_with_depositors is valid. No edge collision. Comment at v2:470 confirms intent.
- **H039 RESOLVED on v2**: MAX_DURATION_SECS = 24*3600 = 86400 (v2:42). Confirmed at line. Authority-griefing horizon shrinks from 8 days (7d + 24h grace) to 48h (24h + 24h grace).
- **Bundle 1 NEW finding (LOW): update_config restart-the-clock**: Calling `update_config` again resets `pending_config_ts = now` (v2:154, unconditional). Current authority can stall a pending proposal by repeatedly proposing trivial changes, perpetually delaying apply. Same authority that proposes can also cancel via re-propose. Not exploitable by external party. Documented as "cancel mechanism" but not surfaced as a stalling vector.
- **Bundle 1 NEW finding (LOW): apply_config_update revalidation is post-take()**: Pending fields are cleared via `.take()` at lines 257-268, THEN revalidated at 272-278. If revalidation fails, the transaction reverts atomically (Solana transaction semantics) — pending state is NOT corrupted. Defense-in-depth check is safe.
- **Bundle 1 NEW finding (MEDIUM): no monotonicity protection**: If Solana clock briefly goes backwards (e.g., leader median drift), `now < pending_config_ts` is structurally possible. `checked_add` doesn't detect negative deltas. If `now == pending_config_ts - 1` and the timelock check is `now >= pending_config_ts + 86400`, that fails — correct. But if `now == pending_config_ts + 86400 + 1` and clock then goes backwards to `pending_config_ts + 86400 - 1`, a second apply call in the same minute would fail until clock catches up. NOT exploitable, just creates retry friction.
- **Bundle 1 NEW finding (LOW): pending_config_ts overflow at i64::MAX**: `checked_add` returns None at overflow. Since unix_timestamp is currently ~1.7×10^9 and i64::MAX is ~9.2×10^18, overflow is structurally impossible for the next ~290 billion years. Confirmed safe.
- **Bundle 1 NEW finding (LOW): propose_authority has no timelock**: 2-step rotation can complete in 2 slots if accept_authority is queued immediately. Old authority loses access the instant accept lands. This is the documented design (v2:108-109, 320-325). Verified that this is a deliberate trade-off — recovery scenarios may need fast rotation, and the new key must already be live to sign accept.
- **Bundle 1 NEW finding (LOW): propose_authority replay/clobber**: Each `propose_authority` call overwrites `pending_authority` (v2:309-310). Authority can be DoS'd against intended new_authority by re-proposing to a different key, or to self (effective cancel). Documented as cancel mechanism. No timelock means original new_authority's accept could be sandwich-front-run by old authority's re-propose. Not a security finding — this is by design.

## Critical Invariants

- **INVARIANT-T1**: `activated_at` set exactly once on AwaitingDeposits→Active. NEVER modified. v1:254, v2:517, v2:583.
- **INVARIANT-T2**: `created_at` set exactly once at create_match. NEVER modified. v1:186, v2:430.
- **INVARIANT-T3 (v2)**: `match_end_ts` set exactly once at activation. NEVER modified. v2:518-520, v2:584-586.
- **INVARIANT-T4 (NEW, Bundle 1)**: `pending_config_ts > 0` is the sole "has-pending" sentinel. Cleared to 0 on apply_config_update success (v2:281). Cleared NEVER by propose_authority/accept_authority (those don't touch pending_config_ts).
- **INVARIANT-T5 (NEW, Bundle 1)**: `pending_authority` is `Option<Pubkey>` — None = no pending. propose_authority sets Some (v2:310); accept_authority clears to None on success (v2:336).
- **INVARIANT-T6 (NEW, Bundle 1)**: All timestamp arithmetic uses `checked_add`. Verified at v2:163, 213, 254, 474, 519, 552, 585, 692, 766, 770, 772. ZERO unchecked `+` on timestamps.
- **INVARIANT-T7 (NEW, Bundle 1)**: Bundle 1 governance is decoupled from match lifecycle. `pending_config_ts` and `pending_authority` are config-PDA state; do NOT block any match instruction (settle/cancel/reclaim are pause-immune and config-PDA-distinctness-aware).
- **INVARIANT-T8 (v1)**: Race-free settle handoff at T=activated_at+3600. settle ends inclusive (`<=`), player_cancel begins exclusive (`>`). No simultaneous validity.
- **INVARIANT-T9 (v2)**: NO settle deadline. settle_match callable forever after Active. cancel callable forever after match_end_ts. Reclaim callable forever after match_end_ts + 24h.
- **ASSUMPTION-T1**: `Clock::get()?.unix_timestamp` is monotonic with bounded drift (~1-2s under normal Solana operation). VALIDATED by Solana runtime.
- **ASSUMPTION-T2**: Off-chain monitoring will detect ConfigProposed events within the 24h window. UNVALIDATED ⚠ — depends on monitor's reliability + responsiveness.
- **ASSUMPTION-T3**: Authority's update_config call won't repeatedly overwrite pending_config_ts to stall apply. NOT enforced — but trust boundary is "authority is honest"; stalling self is benign.

## Prior-Finding Status

| Finding | Audit #2 Status | Current Status | Evidence |
|---|---|---|---|
| **H035** (settle-vs-cancel race) | OPEN (HIGH) on v1 + v2 | **RESOLVED on v1** (constants unified); UNCHANGED architecture on v2 (no race because no settle deadline) | v1:22 (TIMEOUT_SECONDS=3600), v1:29 (SETTLEMENT_TIMEOUT=3600); v2: settle has no deadline |
| **H018** (deposit_deadline edge) | OPEN (MEDIUM) on v2 | **RESOLVED on v2** via strict `<` | v2:477 strict `<` vs v2:554 `>=` |
| **H039** (7d MAX_DURATION) | OPEN (HIGH) on v2 | **RESOLVED on v2** at 24h | v2:42 `= 24 * 3_600` |
| **H040** (stale "48h" comment) | OPEN (HIGH) on v1 | **RESOLVED on v1** — comment corrected, value at 7200 (2h) | v1:24-26 |
| **H006** (23h dead zone, Feb era) | INVERTED (HIGH) | **RESOLVED on v1** by constant unification (see H035) | Same as H035 |
| **H007** (pause-griefs-cancel on v1) | OPEN (HIGH) on v1 | **RESOLVED on v1** — v1's cancel_match struct has no `!is_paused` constraint (was v1:729 historically; current v1 code matches v2's pause-immune pattern). Confirmed cancel/settle/reclaim are pause-immune. | v1:687-694 (settle), v1:758-781 (cancel), v1:783-799 (reclaim) — no pause guards |
| **H010** (deposit ordering asymmetry) | OPEN (MEDIUM) on both | **PARTIAL** — v2 has hard deposit_window deadline; v1 still allows first-depositor to cancel anytime in AwaitingDeposits | unchanged |

## New Findings (Bundle 1 — added by this audit)

### T-001 (MEDIUM) — Clock-backwards retry friction on apply_config_update

**Location:** `programs/solshot-escrow-v2/src/lib.rs:248-255`

**Mechanism:** If Solana leader median time briefly goes backwards (rare, but possible during validator failover), `now` can decrease. If a first apply attempt at `t1 = earliest + 5s` succeeds (state changed, pending_config_ts = 0), no problem. But if the first attempt at `t1 = earliest - 1s` fails (TimelockNotElapsed), and the next retry at `t2 = earliest + 1s` lands BEFORE clock catches up to `t1`'s level, then `now < earliest` again and the retry fails. This creates retry-loop friction but not a security issue — the retry will succeed once clock advances past `earliest`.

**Impact:** LOW — bounded retry friction (~1-2s typical, ~30s worst case per EP-089).

**Severity:** MEDIUM (operational friction, not a security flaw).

### T-002 (LOW) — Update_config restart-the-clock stalling

**Location:** `programs/solshot-escrow-v2/src/lib.rs:154`

**Mechanism:** Calling `update_config` unconditionally writes `pending_config_ts = now` (no check for "was the proposal already in flight"). If authority is compromised and the off-chain monitor detects the proposal, the legitimate authority can re-propose with no-op changes to push the apply window forward. The compromised key (which still has authority access) can do the same. This is documented as a "cancel mechanism" — call with own values to cancel — but the side effect of REPEATED proposals indefinitely extending the apply window is not explicitly called out.

**Impact:** Authority can stall their own proposed change indefinitely (self-DoS). External party cannot exploit (needs authority signer). If authority is compromised, attacker can stall recovery proposal by re-proposing. But authority is also stalled.

**Severity:** LOW — bidirectional stall, not exploitable as one-sided attack.

**Recommendation:** Document the stall behavior explicitly. Optional: emit `ConfigProposed` event with `replaced_pending_config_ts` field for monitor visibility.

### T-003 (LOW) — apply_config_update edge boundary `>=`

**Location:** `programs/solshot-escrow-v2/src/lib.rs:255`

**Mechanism:** Boundary is `now >= earliest` (line 255), where `earliest = pending_config_ts + 86400`. At `now == earliest` exactly (1-second edge), apply succeeds. An off-chain monitor that wants to react at "exactly 24h" would need to send TX in the same slot or earlier to abort the apply path. Off-chain reaction window is `(pending_config_ts, pending_config_ts + 86400)` exclusive — i.e., 23h 59m 59s of monitor time, NOT a full 24h.

**Impact:** LOW — 1-second discrepancy in monitor budget. Real-world monitor latency dominates this.

**Severity:** LOW — operational nit. The `>=` is acceptable.

### T-004 (LOW) — propose_authority has no internal timelock (by design)

**Location:** `programs/solshot-escrow-v2/src/lib.rs:302-318` + `326-348`

**Mechanism:** `propose_authority` writes pending instantly. `accept_authority` is gated only by signer match (line 329-332). The two can be combined in a single multi-instruction transaction or sequential slots. There is no enforced delay between propose and accept. This is the documented design (v2:108-109, 322-325) — recovery scenarios may need speed and the new key must be live to sign accept.

**Impact:** Combined with apply_config_update, there is no time gap between proposing a new authority and that new authority's first action. If the new authority's first action is `update_config` (proposing new treasury/ops/fee_bps), then the 24h timelock starts from THAT instant — not from a separate proposal. So total authority-rotation-to-config-change horizon = 24h from update_config, not 24h + 24h.

**Severity:** LOW — by design, documented; this audit confirms it's intentional.

### T-005 (LOW) — accept_authority distinctness check doesn't validate treasury == ops

**Location:** `programs/solshot-escrow-v2/src/lib.rs:340-341`

**Mechanism:** Post-swap re-validation (lines 340-341) checks `authority != treasury` and `authority != ops` but NOT `treasury != ops`. The latter check is omitted because neither treasury nor ops rotated. However, if a prior apply_config_update had failed (e.g., reverted partway) leaving inconsistent state... wait, apply uses `.take()` which is atomic — pending is consumed only if revalidation succeeds (whole TX reverts otherwise). So treasury != ops is invariant-preserved by apply_config_update.

**Impact:** Logically equivalent — invariant is preserved. No bug.

**Severity:** LOW — note for completeness; no action needed.

## Time-Source Inventory

### v1 — All Clock::get() / unix_timestamp reads

| Line | Function | Purpose | Field Written |
|---|---|---|---|
| 186 | create_match | initial timestamp | `escrow.created_at` |
| 254 | deposit_wager (activation branch) | activation timestamp | `escrow.activated_at` |
| 287 | settle_match | now-vs-deadline check | (compare only) |
| 383 | cancel_match | now-vs-timeout check | (compare only) |
| 478 | permissionless_reclaim | now-vs-reclaim check | (compare only) |
| 535 | start_with_depositors | now-vs-window check | (compare only) |
| 564 | start_with_depositors | activation timestamp | `escrow.activated_at` |

**Total: 7 unix_timestamp reads in v1.**

### v2 — All Clock::get() / unix_timestamp reads

| Line | Function | Purpose | Field Written |
|---|---|---|---|
| 123 | update_config | propose timestamp | `cfg.pending_config_ts` (Bundle 1) |
| 250 | apply_config_update | now-vs-earliest check | (compare only) |
| 430 | create_match | initial timestamp | `escrow.created_at` |
| 477 | deposit_wager | now-vs-deadline check | (compare only) |
| 515 | deposit_wager (activation branch) | activation timestamp | `escrow.activated_at`, `escrow.match_end_ts` |
| 554 | start_with_depositors | now-vs-window check | (compare only) |
| 581 | start_with_depositors | activation timestamp | `escrow.activated_at`, `escrow.match_end_ts` |
| 696 | cancel_match | now-vs-cancel-deadline | (compare only) |
| 777 | permissionless_reclaim | now-vs-reclaim check | (compare only) |

**Total: 9 unix_timestamp reads in v2.** 2 of these are new since audit #2 (line 123 update_config propose, line 250 apply_config_update).

All time reads go through `Clock::get()?.unix_timestamp` — direct sysvar access. Immune to EP-006 fake-sysvar injection (Anchor + Solana runtime enforce sysvar pubkey).

## Time-Gate Inventory

### v1 boundary operators

| Location | Operator | Boundary | Semantics |
|---|---|---|---|
| v1:287 | `<=` | settle_match expiration | Inclusive: settle valid through `activated_at + 3600` |
| v1:383 | `>` | cancel_match player path timeout | Exclusive: cancel valid from `timeout_ref + 3601` onward |
| v1:478 | `>` | permissionless_reclaim trigger | Exclusive: reclaim valid from `timeout_ref + 7201` onward |
| v1:535 | `>=` | start_with_depositors window-closed gate | Inclusive: activation valid from `created_at + 600` onward |

**v1 handoff analysis at T=activated_at+3600**:
- settle: valid at T (line 287, `<=` inclusive)
- cancel: NOT valid at T (line 383, `>` exclusive; valid from T+1 onward)
- Reclaim: not valid (window opens at T+3600 + 7200 = T+10800)

Net: at T=3600 exactly, only settle is valid. At T=3601, only cancel and pending-reclaim-window are valid. NO RACE. **H035 RESOLVED on v1.**

### v2 boundary operators

| Location | Operator | Boundary | Semantics |
|---|---|---|---|
| v2:255 | `>=` | apply_config_update timelock | Inclusive: apply valid from `pending_config_ts + 86400` (Bundle 1 NEW) |
| v2:477 | `<` | deposit_wager hard deadline | Exclusive: deposit valid until `created_at + deposit_window - 1` (H018 fix) |
| v2:554 | `>=` | start_with_depositors window-closed | Inclusive: activation valid from `created_at + deposit_window` onward |
| v2:697 | `>` | cancel_match player path | Exclusive: cancel valid from `player_cancel_deadline + 1` onward |
| v2:777 | `>` | permissionless_reclaim | Exclusive: reclaim valid from `reclaim_deadline + 1` onward |

**v2 handoff at T=deposit_deadline (= created_at + deposit_window)**:
- deposit_wager: NOT valid (line 477, `<` strict)
- start_with_depositors: valid (line 554, `>=` inclusive)
- cancel_match (player path, AwaitingDeposits): is_timed_out branches off `now > deadline`, so at exactly T, NOT timed out (player can cancel from state-gate regardless, since AwaitingDeposits allows player cancel anytime per line 703-704)

**H018 RESOLVED.**

**v2 handoff at T=match_end_ts (Active match)**:
- settle_match: no deadline — valid at T and forever after
- cancel_match (player path): is_timed_out = `now > match_end_ts`, so at T NOT timed out; at T+1 timed out
- reclaim: requires `now > match_end_ts + 86400`

Net at T=match_end_ts exactly: only settle is valid for the loser. At T+1, both settle (still valid) and cancel (now timed out) are valid. **This is the v2 race — same as audit #2 finding.** UNCHANGED by Bundle 1.

### Bundle 1 timelock boundary

**Location:** v2:255 `require!(now >= earliest, EscrowError::TimelockNotElapsed);`

**Semantics:** `earliest = pending_config_ts + 86400`. At `now == earliest` exactly, apply succeeds. Operator monitor budget = `earliest - propose_time - 1s` = `86399s` of reaction time.

**Is `>=` the correct choice?**
- `>` (strict): monitor gets `86400s` budget; first apply slot is `earliest + 1`.
- `>=` (current): monitor gets `86399s` budget; first apply slot is `earliest`.

A 1-second difference is immaterial in practice. The choice is documented as "favor liveness" — apply can fire at exactly 24h, no waiting an extra slot.

## Timelock Arithmetic Analysis (Bundle 1 24h)

### update_config path

```rust
// v2:154
cfg.pending_config_ts = now;  // i64, from Clock::get()?.unix_timestamp

// v2:163-164 — event emission
applies_at: now
    .checked_add(CONFIG_TIMELOCK_SECS)  // = now + 86400
    .ok_or(EscrowError::ArithmeticOverflow)?,
```

**Properties:**
- `now` is current `unix_timestamp` (positive i64, typically ~1.7×10^9).
- `CONFIG_TIMELOCK_SECS = 86400` (positive i64).
- `now + 86400` cannot overflow until `now ≈ i64::MAX - 86400`. Structurally impossible (would require year ~290 billion).
- `checked_add` guarantees no silent overflow.

### apply_config_update path

```rust
// v2:248
require!(cfg.pending_config_ts > 0, EscrowError::NoPendingConfig);  // sentinel gate

// v2:250
let now = Clock::get()?.unix_timestamp;

// v2:251-254
let earliest = cfg
    .pending_config_ts
    .checked_add(CONFIG_TIMELOCK_SECS)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// v2:255
require!(now >= earliest, EscrowError::TimelockNotElapsed);
```

**Properties:**
- `pending_config_ts > 0` sentinel: rules out the cleared state. Safe because `unix_timestamp` is always > 0 in practice (Solana mainnet started ~2020-03; clock value ~1.5×10^9 at genesis).
- `pending_config_ts + 86400` cannot overflow (same logic as propose path).
- `now >= earliest` is a simple comparison; no arithmetic in the boundary.

**Verdict on i64 safety: SAFE.** All arithmetic is `checked_add`. Sentinel `0` is structurally distinct from any real timestamp.

### Clock manipulation analysis

**Q1: Can a validator manipulate Clock::get() to early-trigger timelock release?**

Solana's `unix_timestamp` is computed as the median of recent validator votes on slot timestamps (validator-set governance). A single validator's clock cannot directly set the timestamp — it can only contribute to the vote. Manipulating the median requires controlling a non-trivial stake fraction.

EP-089 estimates ±30s drift achievable by adversarial leader. To advance the clock by 86400s, an attacker would need to:
1. Compromise a stake majority for an extended period (not a single-validator attack), OR
2. Drift clock forward by 86400/30 ≈ 2880 leader rotations — implausible without detection.

**Verdict: NOT exploitable by single validator. Stake-majority attack is in scope of Solana security model, not application security.**

**Q2: Can clock go backwards by 1 slot, breaking the sentinel check?**

If `pending_config_ts = 1_700_000_000` and a moment later `now = 1_699_999_999` (clock went back 1s), then `pending_config_ts + 86400 = 1_700_086_400` and `now (1_699_999_999) < earliest`. The require! fails with TimelockNotElapsed. No corruption — just a TX failure. Retry after clock advances will succeed.

**Verdict: SAFE. Backwards clock causes harmless retry failure, never premature apply.**

**Q3: Sentinel `0` vs negative timestamps?**

`pending_config_ts: i64` can theoretically store negative values. But:
- It's only written from `Clock::get()?.unix_timestamp` (always > 0 in practice).
- Cleared to 0 explicitly (line 281).
- Gate at line 248 is `> 0`, which excludes 0 AND negative values.

If somehow `pending_config_ts < 0` (e.g., corrupted state from a maliciously crafted migrate_config zero-fill that didn't initialize this field), the `> 0` gate at line 248 returns NoPendingConfig — safe failure mode.

**Verdict: SAFE.** Sentinel structure is robust against negative timestamps.

## Race Window Analysis (settle/cancel/reclaim)

### v1 timing diagram (Active match, T = activated_at)

```
T=0                       T=3600        T=10800
|                          |              |
| settle:    YES--------->YES|EXPIRED-->...
| auth_cancel: NEVER (state-gated AwaitingDeposits only)
| player_cancel: NO----------- YES (from T=3601)
| reclaim:    NO------------- NO ----- YES (from T=10801)
                              |
                              Handoff at T=3600: settle ends, cancel begins
                              No race (1-second gap is structurally exact)
```

**At T=3600 exactly**:
- settle: valid (line 287, `<=`)
- player_cancel: NOT valid (line 383, `>`)
- reclaim: NOT valid (line 478, `>`; window opens at T+7200=10800)

**At T=3601**:
- settle: INVALID (line 287, `<=` deadline now exceeded)
- player_cancel: valid (line 383, `>`)
- reclaim: NOT valid

**v1 H035 is RESOLVED.** No simultaneous-validity window between settle and cancel.

### v2 timing diagram (Active match, T = activated_at)

```
T=0                  T=match_end_ts             T=match_end_ts+86400
|                          |                          |
| settle:    YES-----------------YES------------------YES (no deadline)
| auth_cancel: NEVER (state-gated AwaitingDeposits only)
| player_cancel: NO------------- YES (from T=match_end_ts+1)
| reclaim:    NO------------- NO ------- YES (from T=match_end_ts+86401)
                              |                          |
                              Race begins                Triple-race ends
                              T = match_end_ts + 1       (settle+cancel+reclaim
                                                          all valid; same as
                                                          audit #2 finding)
```

**v2 race architecture UNCHANGED by Bundle 1.** Settle has no deadline; cancel opens after match_end_ts; reclaim opens after match_end_ts + 86400. Bundle 1 only added governance instructions — it did not modify match lifecycle timing.

**Bounded by MAX_DURATION_SECS = 86400 (H039)**: maximum race window is now 24h post-end (was 7 days post-end in audit #2 era). Significant reduction in attack surface.

### v2 deposit-window handoff

**At T=created_at+deposit_window** (the moment the deposit window closes):
- deposit_wager: INVALID (line 477, `<` strict)
- start_with_depositors: valid (line 554, `>=` inclusive)
- cancel_match (player path): timed_out branch — `now > deadline` is FALSE at exactly T (line 697 uses `>`). But player can also cancel in AwaitingDeposits state without timeout (line 703-704 `(escrow_state == AwaitingDeposits)`). So cancel IS valid.

**At T+1**:
- deposit_wager: INVALID (strict `<`)
- start_with_depositors: valid
- cancel_match (player): valid via either AwaitingDeposits or timed_out branches
- cancel_match (authority): valid (AwaitingDeposits state)

**H018 RESOLVED.** The deposit_wager/start_with_depositors edge collision is gone.

### Bundle 1 governance race analysis

**Q: Can apply_config_update race with propose_authority/accept_authority?**

```
T=0           T=86400
|              |
update_config  apply_config_update
(writes        (gated by timelock; succeeds at T=86400)
pending_*)     
   ┊
   ┊ ── propose_authority(X) at T=86400-Δ
   ┊ ── accept_authority by X at T=86400-Δ+1
   ┊
At T=86400, when apply runs:
  cfg.authority is now X (not original proposer)
  cfg.pending_* still has values proposed by original authority
  Apply blindly writes pending → live
  Post-apply revalidation checks distinctness
```

**Scenario**: original authority A proposes treasury=T1 at t=0. At t=86399, A proposes authority rotation to A'. A' accepts at t=86399. At t=86400, anyone (including A) calls apply_config_update. Apply writes treasury = T1 (A's choice, not A's). A' inherits T1.

**Is this exploitable?**
- A (original authority) wanted T1.
- A intentionally rotated to A' (who accepted) — implicit endorsement of A's pending state.
- If A was compromised, A' is also under attacker control (else A' wouldn't accept).

**Verdict: NOT a security issue. The accept_authority signer (A') is implicitly endorsing whatever pending state exists at the time of accept. This is documented at v2:556 in HOT_SPOTS.md and is the trust model.**

**Q: Can multiple propose_authority calls clobber each other?**

```
T=0   propose_authority(X)  → pending = X
T=1   propose_authority(Y)  → pending = Y (clobbers X)
T=2   accept_authority by Y → success
```

X never gets a chance. This is documented as "cancel mechanism" at v2:299-301. Current authority can self-cancel by proposing own key.

**Verdict: SAFE — by design.**

**Q: Can update_config calls clobber pending_config_ts indefinitely?**

```
T=0     update_config(treasury=T1) → pending_config_ts = 0
T=86399 update_config(treasury=T1) → pending_config_ts = 86399 (clock restarted!)
T=...   update_config repeated  → indefinite stall
```

**Verdict: Authority self-DoS (see T-002 finding). Not exploitable externally.**

## Critical Invariants

(Already listed above in Condensed Summary)

## Prior-Finding Status

(Already listed above in Condensed Summary)

## New Findings

(Five LOW/MEDIUM Bundle 1 findings already detailed above: T-001 to T-005)

## Cross-Focus Handoffs

- **→ Access Control Agent (Auditor 01)**: Verify accept_authority's signer-gate-only model. AcceptAuthority has no has_one. Its sole gate is the body-level `pending == new_authority.key()` check (v2:329-332). If pending is corrupted to a malicious key by an attacker who has the current authority key, that attacker's chosen new_authority can claim. This is documented but worth confirming the body-level check is airtight.

- **→ Arithmetic Agent (Auditor 02)**: 24h timelock arithmetic uses `checked_add` (v2:163, 254). Confirmed safe per i64 bounds analysis above. Add to validated-arithmetic inventory.

- **→ State Machine Agent (Auditor 03)**: Confirm that apply_config_update's `.take()` + revalidate pattern (v2:257-278) correctly atomic-reverts on revalidation failure. Anchor + Solana transaction atomicity guarantees this, but explicit confirmation is needed because the pending fields are CLEARED before the require!s.

- **→ CPI / External Agent (Auditor 04)**: migrate_config CPI for rent top-up (v2:214-223) is conditioned on `current_balance < new_minimum`. If clock-skew (or rent rate change) causes `new_minimum` to exceed authority's balance, transfer fails — instruction reverts. Not a timing issue per se, but rent rates can change over Solana epochs.

- **→ Token/Economic Agent (Auditor 05)**: Bundle 1 changes do not affect token flows. Snapshot architecture in MatchEscrow (v2:1193-1199) means in-flight matches use the snapshotted BPS regardless of pending_config changes. Timing of apply_config_update affects only future matches.

- **→ Upgrade/Admin Agent (Auditor 07)**: 24h timelock value is the design parameter most relevant to Upgrade/Admin. Verify the 24h value is sufficient for off-chain monitoring to detect and react to a governance compromise. Compare against industry norms (Compound, Uniswap, etc. typically use 48h-72h timelocks).

## Trust Boundaries

- **Trusted**: `Clock::get()?.unix_timestamp` (Solana runtime, bounded ±30s drift).
- **Trusted**: `checked_add` arithmetic propagation.
- **Trusted**: Transaction-level atomicity (Anchor + Solana runtime).
- **Pseudo-Trusted**: 24h is sufficient monitor reaction time. Depends on off-chain infrastructure.
- **Untrusted**: Authority's intent. Bundle 1 strengthens authority-rotation safety via 2-step propose/accept. Config updates have 24h delay; authority rotation has no delay (recovery-focused).
- **Untrusted**: Validator set's clock honesty at extreme adversarial conditions. ±30s drift per EP-089 is the bound.

## Raw Notes — Bundle 1 Verification

### Boundary verification table

| File:Line | Op | LHS | RHS | Notes |
|---|---|---|---|---|
| v2:248 | `>` | pending_config_ts | 0 | Sentinel — has-pending gate |
| v2:255 | `>=` | now | earliest | Timelock — favor liveness |
| v2:281 | `=` | pending_config_ts | 0 | Clear after apply |
| v1:103-105 | `!=` | various | various | Post-update distinctness |
| v2:146-148 | `!=` | authority, eff_treasury, eff_ops | various | Effective-state distinctness |
| v2:272-274 | `!=` | various | various | Post-apply distinctness |
| v2:340-341 | `!=` | authority, treasury, authority, ops | various | Post-rotate distinctness |
| v2:330 | `==` | pending | new_authority.key() | Identity match |

All boundary operators are consistent with documented semantics. No off-by-one errors detected.

### Stale-comment audit (carry-over from prior audit)

- v1:24 reads "2-hour permissionless reclaim timeout (2x normal timeout) — DCA-02." Confirmed TIMEOUT_SECONDS=3600, so 2x=7200=2h. **H040 RESOLVED.**
- v1:25 reads "(Previously docstring claimed 48h but math gave 1200s — H040.)" Acknowledges the historical bug and confirms fix.
- v2:38-39 reads "H039 fix: cap reduced from 7 days to 24h." Verified at line 42. **H039 RESOLVED.**
- v2:56-61 reads about Bundle 1 timelock. Comments are accurate.
- v2:470 reads H018 fix explanation. Verified at line 477 strict `<`. **H018 RESOLVED.**

All other comments check out against code values. No new stale comments identified.

### Cross-version constants table

| Constant | v1 | v2 | Δ |
|---|---|---|---|
| TIMEOUT_SECONDS | 3600 | n/a (per-match) | v2 made dynamic |
| SETTLEMENT_TIMEOUT_SECONDS | 3600 | n/a (no settle deadline) | v2 removed |
| PERMISSIONLESS_RECLAIM_TIMEOUT | 7200 | n/a (per-match + 86400) | v2 made dynamic |
| MIN_DEPOSIT_WINDOW_SECS | 600 | 60 (per-match) | v2 lowered minimum |
| MAX_DURATION_SECS | n/a | 86400 (H039 fix) | v2 added |
| MAX_DEPOSIT_WINDOW_SECS | n/a | 86400 | v2 added |
| PUBLIC_REFUND_GRACE_SECS | n/a | 86400 | v2 added |
| CONFIG_TIMELOCK_SECS | n/a | 86400 (Bundle 1 NEW) | v2 only |
| MIN_WAGER_LAMPORTS | 10_000 | 10_000 | same |
| MAX_WAGER_LAMPORTS | 100B | 100B | same |
| MAX_FEE_BPS | n/a (hardcoded) | 1000 | v2 made config |

### Sample-day trust assumption

Solana clock is currently ~1.74×10^9 (early 2026). For Bundle 1's i64 timelock arithmetic:
- `pending_config_ts ≈ 1.74×10^9`
- `pending_config_ts + 86400 ≈ 1.74×10^9 + 8.64×10^4 = 1.74×10^9`
- i64::MAX = 9.22×10^18
- Headroom: 9.22×10^18 / 1.74×10^9 ≈ 5.3×10^9 years

**Overflow is structurally impossible.**

<!-- CONDENSED_SUMMARY_END -->
