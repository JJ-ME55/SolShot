---
task_id: sos-phase1-token-economic-bundle1
provides: [token-economic-findings-bundle1, token-economic-invariants-bundle1]
focus_area: token-economic
delta_focus: bundle-1 (pending-state config + 2-step authority + per-match snapshot interaction)
files_analyzed:
  - programs/solshot-escrow-v2/src/lib.rs (v2, 1423 LOC) — only file in scope (v1 = devnet-only per V1 scope)
prior_audit_ref: .audit-history/2026-05-06-226c0cd/context/05-token-economic.md
prior_h023_status: RESOLVED (accepted per CPI auditor #04; IncompleteRefund gate present at v2:721-724 and v2:789-792)
finding_count: 7 (delta only; non-delta prior findings re-statused below)
severity_breakdown: {critical: 0, high: 1 (re-state), medium: 3, low: 3}
---

# Token & Economic — Bundle 1 Delta Audit

## Scope and Method

This is a DELTA audit focused on Bundle 1's economic surfaces and the
re-status of prior token/economic findings in light of:

1. The 24h `CONFIG_TIMELOCK_SECS` between `update_config` (propose) and
   `apply_config_update` (apply).
2. The 2-step `propose_authority` / `accept_authority` flow (no timelock).
3. The per-match snapshot mechanism (already present in v2 pre-Bundle 1, but
   now interacts with pending config state).
4. The new `pending_*` fields on `GlobalConfig` (new SPACE = 231 bytes).

H023 is accepted as RESOLVED per CPI auditor #04. v1 is out of scope (devnet
only per V1 mainnet scope). All references below are to v2.

## Value Flow Map

```
┌──────────────────────────────────────────────────────────────────────┐
│ CONFIG STATE MACHINE (Bundle 1)                                       │
│                                                                        │
│   live: {authority, treasury, ops, fee_bps_t, fee_bps_o, is_paused}   │
│   pending: same shape, all Option<T>, gated by pending_config_ts      │
│                                                                        │
│   update_config         → pending_* := Some(..) + pending_ts := now   │
│   apply_config_update   → pending_*.take() → live.* (after 24h)       │
│   propose_authority     → pending_authority := Some(new) (instant)    │
│   accept_authority      → live.authority := pending (signed by new)   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PER-MATCH SNAPSHOT (create_match) — Bundle 1 invariant                │
│                                                                        │
│   escrow.treasury_snapshot          := cfg.treasury    (LIVE at create)│
│   escrow.ops_snapshot               := cfg.ops         (LIVE at create)│
│   escrow.fee_bps_treasury_snapshot  := cfg.fee_bps_treasury           │
│   escrow.fee_bps_ops_snapshot       := cfg.fee_bps_ops                │
│   escrow.authority                  := ctx.accounts.authority.key()   │
│                                                                        │
│   CRITICAL: snapshots read LIVE config (not pending). A pending        │
│   proposal in flight at create_match time has zero effect on the new   │
│   match's economics. Only matches created AFTER apply_config_update    │
│   see the new values.                                                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ DEPOSIT → POT                                                         │
│                                                                        │
│   each player ──[system_program::transfer(wager_lamports)]──> escrow  │
│   pot = wager × deposits_mask.count_ones()  [u128 widening]           │
│   ceiling: 100 SOL × 10 = 10^12 lamports (well under u64::MAX ≈ 1.8e19)│
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ SETTLE — reads SNAPSHOT, not live config                              │
│   v2:611-617 reads treasury_snapshot, ops_snapshot, fee_bps_*_snapshot│
│   v2:1021-1036 constraints validate vs escrow.treasury_snapshot,      │
│                                  escrow.ops_snapshot (NOT cfg.*)      │
│                                                                        │
│   pot              = wager × num_deposited                            │
│   treasury_amount  = pot × treasury_bps  / 10_000     (u128 → u64)    │
│   ops_amount       = pot × ops_bps       / 10_000     (u128 → u64)    │
│   winner_amount    = pot - treasury_amount - ops_amount  (gets dust)  │
│                                                                        │
│   ┌──→ winner          (≈90%+ + dust ≤ 2 lamports)                    │
│   ┌──→ treasury        (0..10% per snapshot bps, capped at create)    │
│   ┌──→ ops             (0..10% per snapshot bps, capped at create)    │
│   close = authority    → rent reserve to authority (v2:1000)          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CANCEL / RECLAIM — reads escrow.players, refunds to players            │
│   no fee paths; pure refund                                            │
│   v2:721-724, v2:789-792: H023 IncompleteRefund gate (count check)    │
│   close = caller       → rent reserve to caller (v2:1056, v2:1081)    │
└──────────────────────────────────────────────────────────────────────┘
```

## Economic Invariants

### Invariant 1 — Pot conservation (snapshot-fee variant)

For every settle_match call:

```
winner_amount + treasury_amount + ops_amount == total_pot
```

Where `total_pot = wager_lamports × deposits_mask.count_ones()`.

**Holds by construction** — winner_amount is computed as the residual:
`pot - treasury_amount - ops_amount`. Both fee amounts are non-negative
(BPS in `[0, MAX_FEE_BPS]`), and `treasury_amount + ops_amount ≤
pot × (treasury_bps + ops_bps) / BPS_DENOMINATOR ≤ pot × 1000 / 10_000 =
pot × 0.1` (cap-enforced at snapshot creation). The two `checked_sub`s
at v2:638-642 ensure no underflow.

### Invariant 2 — Pot ceiling (Bundle 1 unaffected)

```
total_pot ≤ MAX_WAGER_LAMPORTS × MAX_PLAYERS = 10^11 × 10 = 10^12 lamports
```

Far below `u64::MAX` (~1.8 × 10^19). u128 widening at v2:621 prevents
overflow during BPS multiplication. Max intermediate: `10^12 × 1000 = 10^15`,
well within u128.

### Invariant 3 — Fee cap is enforced on EFFECTIVE post-apply state

Bundle 1 introduces the merge validation at v2:141-152:

```rust
let eff_fee_t = cfg.pending_fee_bps_treasury.unwrap_or(cfg.fee_bps_treasury);
let eff_fee_o = cfg.pending_fee_bps_ops.unwrap_or(cfg.fee_bps_ops);
require!((eff_fee_t as u32 + eff_fee_o as u32) <= MAX_FEE_BPS as u32, ...);
```

This means a caller cannot propose only `treasury_bps = 600` if live `ops_bps = 500`
(because the effective merge = 1100 > 1000 cap). The `unwrap_or` correctly merges
the proposal with un-changed live values.

**Effective state cap holds at propose-time AND apply-time.** Apply-time
re-validation at v2:270-278 is defense-in-depth against `propose_authority`
racing with `update_config` between propose and apply. Confirmed.

### Invariant 4 — Per-match snapshot semantics (Bundle 1 critical)

**For any match `M` created at config-version `v`:**
- `M.treasury_snapshot == cfg.treasury_at_v` (LIVE, not pending)
- `M.fee_bps_*_snapshot == cfg.fee_bps_*_at_v`
- `M.authority == ctx.accounts.authority.key() == cfg.authority_at_v` (via `has_one`)

**Critical:** snapshots are taken from the LIVE config at create_match
(v2:415-428), not from `pending_*`. A pending proposal in flight at
create_match has zero effect on the new match. Only matches created AFTER
`apply_config_update` see the new economics.

**In-flight match immunity:** once a match exists, the four economic snapshot
fields and the authority field are immutable. No instruction reads or writes
them post-create. `apply_config_update` cannot retroactively touch a settled
or in-flight escrow PDA. Confirmed.

### Invariant 5 — Settle reads SNAPSHOT, not live config

v2:611-617 reads `escrow.treasury_snapshot`, `escrow.ops_snapshot`,
`escrow.fee_bps_treasury_snapshot`, `escrow.fee_bps_ops_snapshot`. v2:1021-1036
constraints validate `treasury.key() == escrow.treasury_snapshot` (NOT
`config.treasury`). No `cfg.*` fee or destination field is read inside
settle_match's body.

**Result:** post-apply config changes have ZERO effect on already-created matches.

### Invariant 6 — Dust bound

Only two division operations on the fee path (v2:625-633), each producing at
most 1 lamport of integer-division floor truncation. Winner absorbs the dust
via the residual subtraction. **Max dust per settlement: 2 lamports.** Holds
for all BPS pairs in `[0..MAX_FEE_BPS]² constrained sum ≤ MAX_FEE_BPS`.

### Invariant 7 — Authority cannot be a fee account (effective state)

Even after Bundle 1's pending-state rotation, the apply path re-validates:
```
require!(cfg.authority != cfg.treasury, ...);
require!(cfg.authority != cfg.ops, ...);
require!(cfg.treasury != cfg.ops, ...);
```
v2:270-278. This holds even if `propose_authority` raced with a pending
`update_config` proposal. (See Bundle 1 risk #2 below for the race scenario.)

## Bundle 1 Economic Risk Assessment

### Bundle 1 Risk #1 — Effective-state cap holds, but propose-time accepts arbitrary individual values

**Setup:**
- Live config: `fee_bps_treasury = 700`, `fee_bps_ops = 300`. Sum = 1000 (at cap).
- Authority calls `update_config(new_fee_bps_treasury = Some(0))`.
- Merge: `eff_fee_t = 0`, `eff_fee_o = 300`. Sum = 300. Cap OK. ✓ Pending recorded.
- After 24h, anyone calls `apply_config_update`. Live becomes `(0, 300)`.

**Then:**
- Live: `(0, 300)`. Authority calls `update_config(new_fee_bps_ops = Some(700))`.
- Merge: `eff_fee_t = 0`, `eff_fee_o = 700`. Sum = 700. Cap OK. ✓ Pending recorded.
- After 24h, apply. Live becomes `(0, 700)`.

**Then:**
- Live: `(0, 700)`. Authority calls `update_config(new_fee_bps_treasury = Some(300))`.
- Merge: `(300, 700)`. Sum = 1000. Cap OK. ✓

**No multi-cycle escape:** No single proposal can ever break the cap, and the
merge-validate approach ensures pending-treasury + pending-ops (or vice versa)
can't combine to exceed `MAX_FEE_BPS`. The 24h timelock between each cycle
makes 3-step rotation take 72h minimum. **Cap holds across all rotation paths.**

**Verdict:** Bundle 1's effective-state validation correctly closes the
"propose A then B separately to exceed cap" attack. Confirmed safe.

### Bundle 1 Risk #2 — Authority rotation racing with config apply

**Scenario:**
1. T=0:    `update_config(new_treasury = X)` (legitimate authority A).
2. T=1:    `propose_authority(B)` (authority A, B is attacker).
3. T=2:    `accept_authority` (signed by B). Now `authority = B`.
4. T=86400: ANYONE calls `apply_config_update`.
5. Apply re-validates at v2:270-278: `require!(cfg.authority != cfg.treasury)`.
6. If `B == X`, the apply fails (B is now both authority and treasury).
7. If `B != X`, the apply succeeds → `cfg.treasury = X` (the original proposal).

**Implication:** If attacker accepts the authority during a pending fee-destination
proposal, two outcomes are possible:
- The pending fields are consistent with the new authority → apply succeeds,
  attacker inherits the change.
- The pending fields conflict with the new authority → apply ALWAYS reverts
  forever (`pending_config_ts` stays non-zero, but `apply_config_update`
  always errors with `InvalidConfig`).

**Stuck pending state is the worst case:** the only way out is for the NEW
authority (attacker) to call `update_config` again to overwrite pending. Per
v2:127-138, this only writes the fields that the caller provided, leaving
old pending values intact otherwise. The new authority would need to clear
each conflicting field individually.

**Severity:** LOW (recovery exists, but state can be stuck until new authority
intervenes). No economic loss — in-flight matches unaffected (snapshot
immunity), no new matches can be created without `cfg` being valid (init/
update_config errors first).

### Bundle 1 Risk #3 — `pending_config_ts` reset by repeated proposals (DoS surface)

v2:154 unconditionally sets `pending_config_ts = now` on every `update_config`
call. A legitimate authority calling `update_config` once at T=0 starts the
24h clock. If they call it AGAIN at T=86399 (just before apply), the clock
resets — apply must wait another 24h.

**Attacker scenario (requires authority key compromise):**
1. Legitimate authority A proposes `new_treasury = X` at T=0.
2. Attacker (also signing as A) calls `update_config(new_treasury = X)` at T=86399.
3. Clock resets. Off-chain monitoring may not detect (same value proposed).
4. Repeated indefinitely → DoS on legitimate proposal application.

**Severity:** MEDIUM. Requires authority compromise to execute, but the
authority compromise itself is the bigger problem. The attacker has full
control anyway — this just prevents the legitimate operator from racing
through their own apply. Net effect: timelock becomes "elastic" upward.

**Mitigation already in design:** propose_authority + accept_authority gives
an emergency rotation path BYPASSING the timelock (no timelock on authority
rotation). So if A is compromised but the off-chain ops team detects, they
can rotate authority via `propose_authority` AND THEN call
`apply_config_update` with the post-rotation re-validation, which would now
fail with a conflicting `cfg.authority` — actually, that's risk #2 above.

**The correct mitigation is monitoring:** off-chain should alert on EVERY
`update_config` call AND on any reset of `pending_config_ts`. Not a code-fix
finding, but document.

### Bundle 1 Risk #4 — Pause does NOT block settle, cancel, or reclaim

Bundle 1 did not change pause semantics. Per v2:1040-1045 (SettleMatch) and
v2:1052-1073 (CancelMatch) and v2:1075-1090 (PermissionlessReclaim), the
config account is not gated by `!is_paused`. Only `create_match` (v2:964),
`deposit_wager` (v2:986), and `start_with_depositors` (v2:1108) have the
pause gate.

**H016 risk:** authority pauses program → no new matches/deposits → in-flight
matches still settle/cancel/reclaim → funds escape. **CORRECT BEHAVIOR for
safety.** Bundle 1 did not change this. H016 was about "pause-as-griefing
blocking exits" — that was always wrong direction; pause is exit-tolerant by
design.

**Verdict:** Pause + Bundle 1 = no new economic surface. Pause is a halt on
INFLOW only; settle/cancel always work.

### Bundle 1 Risk #5 — `propose_authority` does NOT validate against pending fee accounts

v2:302-318 only checks `new_authority != Pubkey::default()`. It does NOT
check `new_authority != pending_treasury` or `new_authority != pending_ops`
if those are set. This is intentional (the design philosophy is "validate at
accept time"), but creates a footgun:

**Scenario:**
1. T=0: Authority A proposes `new_treasury = X`. Pending: `(X, _)`.
2. T=1: Authority A proposes `new_authority = X` (same X).
3. T=2: X calls `accept_authority`. v2:340-341 check `cfg.authority != cfg.treasury`.
   - `cfg.authority = X`, `cfg.treasury = old_treasury (not X)`. Check passes.
4. T=86400: anyone calls `apply_config_update`.
5. v2:270-278: `cfg.authority = X`, `cfg.treasury = X` (after apply). FAILS.
   `cfg.pending_treasury` is now `None` (consumed by `take()`).
6. Live state: `treasury = old_treasury`, `pending_treasury = None`.
   Re-validation at v2:272 fails → transaction reverts → no state change.

**Wait:** v2:257-268 uses `take()` BEFORE the re-validation. The reverted
transaction undoes the `take()` (Solana TX atomicity). So pending_treasury
is preserved across the failed apply.

**Net effect:** Apply is permanently stuck. NEW authority X must intervene
manually by calling `update_config` to overwrite `pending_treasury` to
something non-X. This is recovery, but it's a 24h delay PLUS the new
authority must understand the state.

**Severity:** LOW (no economic loss; recovery available). Documentation gap.

### Bundle 1 Risk #6 — Snapshot timing: create_match races with apply

**Scenario:**
1. Apply just landed at T=0. Live config now has new BPS `(900, 100)`.
2. At T=0+epsilon, a high-value match is created. Snapshot = `(900, 100)`.
3. Players deposit. Match goes Active.
4. Authority changes BPS back at T=86400.
5. Match still settles at `(900, 100)` snapshot. Players experience the change.

**This is by design** (snapshot freezes economics at create time). But it
means a malicious authority can:
- Propose new BPS at T=0.
- Wait 24h.
- Apply BPS at T=86400.
- Create new high-value matches at T=86400+epsilon.
- Snapshot freezes the elevated BPS.
- Subsequently revert BPS via another propose+apply cycle.

**Severity:** LOW (this is the design intent and the 24h window provides
detection time). MONITORING required: alert on every apply, and pause new
match creation if alerts come in mid-window.

### Bundle 1 Risk #7 — `pending_authority` can be set to current authority (cancel mechanism)

v2:302-318 has no check `new_authority != cfg.authority`. Per the comments,
this is an intentional "cancel mechanism" — calling `propose_authority` with
the current authority's pubkey clears prior pending by overwriting.

**Risk:** authority compromise scenario. Attacker (signing as A) calls
`propose_authority(A)`. This overwrites any legitimate pending B that the
real authority A had proposed earlier. The legitimate rotation is silently
cancelled.

**Mitigation:** off-chain monitoring on `AuthorityProposed` events (v2:312-316)
exposes `replaced_pending: previous` field — legitimate ops can detect the
cancel.

**Severity:** LOW. Not exploitable without authority compromise, which is
the bigger event.

## Prior-Finding Status

### H011 — BPS / treasury self-redirect (HIGH)

**Pre-Bundle 1 status:** Authority could set `treasury = authority_alt` via
`update_config` (single-shot, immediate effect). For in-flight matches, the
snapshot mitigated this. For new matches, attacker farmed 7%.

**Post-Bundle 1 status:** **MITIGATED (but not eliminated).** The 24h
timelock now requires:
1. Authority compromise.
2. `update_config(new_treasury = attacker_wallet)` — broadcasts pending state.
3. Wait 24h.
4. `apply_config_update` — now anyone can apply (including legitimate
   responders racing to roll back).

**Detection window:** 24h. Off-chain ops can:
- Detect the `ConfigProposed` event.
- Use `propose_authority` to start authority rotation (no timelock).
- Have the new authority accept within seconds.
- Then call `update_config` to overwrite pending treasury before apply.

**Residual risk:** if monitoring fails for >24h, attacker captures all
NEW matches' fees up to 10%. In-flight matches still protected by snapshot.

**Verdict:** Bundle 1's 24h timelock + monitoring window effectively closes
the attack chain at the cost of operational vigilance. **STATUS: MITIGATED
(MEDIUM residual — operational, not code).**

### H030 — Fee destination hijack (HIGH)

**Pre-Bundle 1:** Same root mechanism as H011 — authority changes
`config.treasury` or `config.ops` to an attacker-controlled wallet.

**Post-Bundle 1:** **MITIGATED via same chain as H011.** 24h timelock applies
to BOTH `pending_treasury` and `pending_ops`. The merge-validation at v2:141-148
ensures the effective state is always valid (no `eff_authority == eff_treasury`).
The post-apply re-validation at v2:270-278 catches any race.

**Verdict:** STATUS: MITIGATED via 24h timelock. Same residual as H011
(operational monitoring).

### H002 — Treasury self-redirect (HIGH)

**Pre-Bundle 1:** Authority sets `config.treasury = attacker_wallet`. v1
read live config at settle (immediate exploit); v2 snapshotted at create
(only new matches affected).

**Post-Bundle 1:** **MITIGATED for v2.** The 24h pending-state requirement
applies. Even if attacker proposes, they must wait 24h before the change
becomes live and gets snapshotted into new matches. Same operational
monitoring story as H011.

**Verdict:** STATUS: MITIGATED via 24h timelock.

### H032 — BPS ratcheting (HIGH)

**Pre-Bundle 1:** Authority could ratchet BPS up to 10% pre-tournament,
settle high-value matches at elevated fees, then ratchet down to 0%
post-tournament — extracting +3% over the legitimate 7%.

**Post-Bundle 1:** **PARTIALLY MITIGATED.** Each ratchet step now requires
24h. The attack chain becomes:
1. T=-86400: Propose `(900, 100)`.
2. T=0:      Apply.
3. T=0:      Create big match. Snapshot = `(900, 100)`.
4. T=match_end: Settle at 10% extraction.
5. T=match_end: Propose `(700, 300)` rollback.
6. T=match_end+86400: Apply rollback.

**Still feasible? YES, if:**
- Off-chain monitoring fails to detect step 1's `ConfigProposed` event.
- OR monitoring detects but takes >24h to respond.
- OR the elevated BPS is plausibly within the cap and looks like a legitimate
  pricing change (e.g., (900, 100) vs. (700, 300) — only 3% difference).

**Real mitigation depends on:**
- Public visibility of `ConfigProposed` events.
- Off-chain alerting on any non-baseline BPS proposal.
- A "blow the whistle" mechanism (community pause? upgrade authority? neither
  exists at present).

**Verdict:** STATUS: PARTIALLY MITIGATED. The 24h window makes ratcheting
detectable but does not block it. Monitoring is the load-bearing defense.
**HIGH severity downgrade to MEDIUM** if monitoring infrastructure is in
production; **remains HIGH** if not.

### H023 — Partial-refund theft via close=caller (CRITICAL, CVSS 9.3)

**Status: RESOLVED** per CPI auditor #04. Verified at v2:721-724 (cancel_match)
and v2:789-792 (permissionless_reclaim) — exact `count_ones()` length match
enforced. Same pattern in v1 at L411 and L490 for parity. **Accepted as
resolved.** No further analysis.

## New Findings

### NEW-EC-01 — `pending_config_ts` reset by repeated `update_config` calls (MEDIUM)

**Location:** v2:154

**Description:** `cfg.pending_config_ts = now` is unconditional on every
`update_config` call. A compromised-authority adversary can stall a
legitimate pending application by calling `update_config` with no-op
changes (or any changes) before the 24h elapses.

**Impact:** DoS on legitimate `apply_config_update`. No economic loss, but
denies the operator their announced change.

**Mitigation:**
1. Off-chain monitor on `ConfigProposed` events with `propose_ts` field
   — alert on any RESET (new propose_ts < old + CONFIG_TIMELOCK_SECS).
2. Code fix (defense-in-depth): only update `pending_config_ts` if the
   PROPOSED FIELD VALUES changed from current pending. Skip the reset if
   the new params are no-ops or identical.

**Severity:** MEDIUM. Exploitable only post-authority-compromise.

### NEW-EC-02 — Authority rotation during pending config creates apply-deadlock (LOW)

**Location:** v2:270-278, v2:340-341

**Description:** If `propose_authority(new = X)` is accepted while
`pending_treasury = Some(X)` is in flight (or vice versa for any
authority↔fee-account conflict), the future `apply_config_update` will
permanently revert at v2:272 distinctness check. The new authority must
manually clear the conflicting pending field via another `update_config`
call to recover.

**Impact:** Stuck pending state. No economic loss, but operational confusion
and 24h delay per recovery cycle.

**Mitigation:**
1. `propose_authority` should reject if `pending_treasury == Some(new)` OR
   `pending_ops == Some(new)`.
2. `accept_authority` should fail if the post-swap effective state (live +
   pending merged) would fail distinctness.
3. OR clear pending_treasury/ops if they conflict with the new authority on
   accept (most user-friendly but changes semantics).

**Severity:** LOW. Requires racy ops; recovery available.

### NEW-EC-03 — `pending_authority` overwrite has no rate-limit (LOW)

**Location:** v2:309-310

**Description:** Authority can `propose_authority(B)`, then immediately
`propose_authority(A)` to cancel. No cooldown. Combined with authority
compromise, attacker can cancel a legitimate rotation that the real
authority initiated. The `AuthorityProposed.replaced_pending` field at
v2:315 exposes this in event stream but does not block it.

**Impact:** Recovery action by legitimate authority can be silently cancelled
during compromise window.

**Mitigation:** No code fix recommended (the cancel mechanism is intentional
per spec). Operational monitoring on `AuthorityProposed.replaced_pending`
non-None events is the answer.

**Severity:** LOW. Not exploitable without authority compromise.

### NEW-EC-04 — Snapshot races mid-apply window allow elevated-fee match creation (LOW)

**Location:** v2:415-428, v2:241-293

**Description:** When `apply_config_update` lands at slot S, any
`create_match` call in the SAME block (or subsequent block before
operators react) snapshots the new BPS. Attacker can:
1. Propose elevated BPS at T=0.
2. Wait 24h.
3. Submit `apply_config_update` AND `create_match` for a high-value match in
   the same transaction batch.
4. Snapshot freezes elevated BPS into the new match.

**Impact:** Up to 10% fee extraction on the next-created match. Bounded by
`MAX_FEE_BPS` cap and the fact that authority must convince players to
deposit (deposit is voluntary).

**Mitigation:**
1. Code fix: introduce a `last_config_update_ts` gate at `create_match` —
   reject if `now < cfg.last_config_update_ts + EPSILON` (e.g., 60s) for
   "settle dust" matches with high wager.
2. Off-chain: pause client UI on every `ConfigApplied` event for a cooldown
   window.
3. Players have a "do not deposit" choice — voluntary participation IS the
   ultimate gate.

**Severity:** LOW. Mitigated by player choice + 24h monitoring window.

### NEW-EC-05 — Effective-state validation correct, no multi-step cap escape (CONFIRMATION, no severity)

**Location:** v2:141-148, v2:272-278

**Description:** Verified that the merge `eff_t = pending_t.unwrap_or(live_t)`
correctly captures the post-apply state at propose-time AND apply-time.
A caller cannot propose `treasury_bps = 1000` while `ops_bps = 1000` lives
— the merge sum is 2000, exceeds cap, fails at v2:150. Confirmed safe.

**No severity. Documentation of correct behavior.**

### NEW-EC-06 — Apply re-validation succeeds even if pending fields are stale-but-consistent (LOW)

**Location:** v2:270-278

**Description:** The re-validation at apply-time only checks the FINAL live
state, not whether the original pending values made sense with the original
live values. If `propose_authority` rotates `cfg.authority` to a new key
between propose and apply, the apply still uses the original pending fields.

**Concrete:**
1. T=0:  Authority A proposes `pending_treasury = X`, `pending_ops = Y`.
2. T=1:  A proposes `B` as new authority (instant pending_authority).
3. T=2:  B accepts. Now `cfg.authority = B`.
4. T=86400: Anyone calls `apply_config_update`.
5. v2:257-268 takes pending → live: `cfg.treasury = X`, `cfg.ops = Y`.
6. v2:272: `cfg.authority (B) != cfg.treasury (X)` — passes IF B != X.
7. Live state: `(B, X, Y, ...)` — new authority inherits A's pending
   proposal.

**Impact:** New authority inherits a pending config they did not author. If
A pre-staged "evil" treasury/ops + then "voluntarily" rotated to B (or B
became authority via a legitimate transition), B is silently bound to A's
choices unless they call `update_config` to overwrite first.

**Severity:** LOW. Documentation/UX issue. Real-world recovery: new authority
should immediately call `update_config` to overwrite pending fields if they
exist (pending_authority excepted; that's separate flow).

### NEW-EC-07 — No on-chain proof that apply_config_update was monitored (operational, not code)

**Location:** v2:283-290 (ConfigApplied event)

**Description:** Bundle 1 emits `ConfigApplied` on every successful apply.
This is the load-bearing mitigation for H011/H030/H002/H032 — operators
MUST subscribe to this event AND `ConfigProposed` to detect malicious
proposals within the 24h window.

**Risk:** If event subscription fails, monitoring fails, and the entire
Bundle 1 timelock defense collapses silently. There is no on-chain
heartbeat that proves the ops team is watching.

**Impact:** Bundle 1's security is operational, not algorithmic. A code
defense that requires monitoring is weaker than an algorithmic one (e.g.,
multisig + timelock).

**Severity:** Not a code finding. Documentation: production deployment MUST
include event monitoring infrastructure with alerting + runbook for
within-24h response.

**Recommendation:** treat Bundle 1 as a defense layer that assumes monitoring
is in place; do NOT count it as a hard guarantee of fee/authority safety.

## Cross-Focus Handoffs

- → **Access Control Agent (#01):** NEW-EC-02 (authority rotation deadlock)
  and NEW-EC-03 (rotation cancel during compromise) both touch authority
  rotation semantics. Confirm `propose_authority` should validate against
  pending_treasury / pending_ops.

- → **Arithmetic Agent (#02):** Effective-state cap validation uses
  `(a as u32 + b as u32) <= MAX_FEE_BPS as u32` at three sites (v2:87, 150, 276).
  Confirm widening is consistent and no signed-overflow surface exists.

- → **State Machine Agent (#03):** Pending-state machine has two reset
  paths: explicit `update_config` AND implicit `take()` in `apply_config_update`.
  Verify that no instruction can leave `pending_config_ts > 0` with all
  `pending_*` = None (sentinel inconsistency).

- → **CPI Agent (#04):** H023 accepted as resolved. NEW-EC-04's
  recommendation for `last_config_update_ts` gate at create_match would be
  a small CPI surface to verify.

- → **Upgrade & Admin Agent (#07):** Bundle 1 fundamentally an admin/upgrade
  concern. NEW-EC-01 (timelock reset DoS) and NEW-EC-07 (monitoring as
  load-bearing) should be primary focuses for that auditor. Also: the
  `migrate_config` instruction has `realloc(_, false)` with manual zero-fill
  at v2:226-235 — verify the layout assumption against the v1 GlobalConfig
  bytes 8..40 = authority.

- → **Timing & Ordering Agent (#08):** Bundle 1's `CONFIG_TIMELOCK_SECS`
  uses `>=` at v2:255 for the apply gate. 1-second edge: confirm if a
  same-block propose+apply via two transactions is reachable. Not exploitable
  for economic loss (cap still applies) but interesting for race-window
  analysis.

---

## Summary

The 24h `CONFIG_TIMELOCK_SECS` introduced by Bundle 1 transforms H011, H030,
H002, and H032 from immediate-exploit primitives into operationally-detectable
ratchets that require monitoring infrastructure to remain defended. The
effective-state validation at propose-time (v2:141-152) and apply-time
(v2:270-278) correctly prevents multi-step proposals from escaping the 10%
combined fee cap. The per-match snapshot mechanism (v2:415-428) renders
in-flight matches immune to all post-create config changes.

Three NEW low-severity findings surface around pending-state interaction with
authority rotation (NEW-EC-02, NEW-EC-03, NEW-EC-06) — all recoverable, no
economic loss, but operational footguns. NEW-EC-01 (timelock reset DoS) is
the only finding above LOW severity, and it requires authority compromise to
execute.

**Bottom-line economic verdict:** Bundle 1 is a meaningful hardening with
correctly-shaped code. Its real-world security level depends on monitoring
infrastructure (NEW-EC-07). With production-grade alerts on `ConfigProposed`
and `ConfigApplied` events plus a runbook for within-24h response, the fee-
rotation attack chain is effectively closed against opportunistic attacks
and detectable against patient attackers.
