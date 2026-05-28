---
task_id: sos-phase1-access-control-bundle1-delta
provides: [access-control-findings-bundle1, access-control-invariants-bundle1]
focus_area: access-control
scope: bundle-1-delta-only
files_analyzed:
  - programs/solshot-escrow-v2/src/lib.rs (lines 103-348, 856-917, 1117-1170 only)
prior_audit: .audit-history/2026-05-06-226c0cd/context/01-access-control.md
finding_count: 9
severity_breakdown: {critical: 0, high: 3, medium: 4, low: 2}
---

<!-- CONDENSED_SUMMARY_START -->
# Access Control — Bundle 1 Delta Summary

## Trust Model — Bundle 1 Deltas Only

The prior audit established **one** authority key as single root of trust. Bundle 1 introduces three architectural changes:

1. **Authority rotation is now 2-step** (`propose_authority` → `accept_authority`), no timelock. The new key signs to claim. The proposing path overwrites unconditionally, acting as a cancel mechanism. This is intended to address prior-audit H001 ("one-step authority transfer").

2. **Config rotation (treasury, ops, fee_bps_*) is now 2-step with 24h timelock** (`update_config` → wait 24h → `apply_config_update`). Apply is PERMISSIONLESS — any signer can call it once timelock elapses, including third parties. This addresses prior-audit EP-074 ("no timelock on config changes").

3. **New trust surface — `migrate_config`** — accepts `UncheckedAccount` for the config PDA (because old 110-byte data fails Anchor deser against new 231-byte struct). Authority verification is done manually by reading raw bytes at offset [8..40]. Devnet-only; will be removed in follow-up upgrade. **This is the single highest-risk new code path in Bundle 1.**

**Net effect on root-of-trust:** Still one authority key, but the rotation path now has a one-block window where the old authority is "locked in" (cannot be reverted without proposing/accepting twice). The proposing-then-cancel cycle has zero cost — authority can spam `propose_authority` with random keys without affecting the live state.

## Account Validation Coverage Map — 6 New Bundle 1 Contexts

| Context | Lines | Signer | `has_one` | Body-level auth check | Pause guard | Notes |
|---|---|---|---|---|---|---|
| `UpdateConfig` (rewritten) | 835-846 | `authority` | YES (`config.has_one = authority`) | n/a (Anchor gates entry) | No | unchanged Anchor gate; semantics changed in body |
| **`MigrateConfigUnchecked`** | 856-871 | `authority` | NO | YES — manual `data[8..40] == auth.key()` | No | Only `seeds = [b"config"]` enforced by Anchor; everything else manual. `UncheckedAccount` config. |
| **`ApplyConfigUpdate`** | 877-888 | `payer` (any signer) | NO (intentional) | NO authority check; timelock check only | No | Permissionless by design. `pending_config_ts > 0` + `now >= earliest` is the sole gate. |
| **`ProposeAuthority`** | 890-902 | `authority` | YES (`config.has_one = authority`) | n/a (Anchor gates entry) | No | Standard authority-gated structure |
| **`AcceptAuthority`** | 904-917 | `new_authority` | NO (intentional — matches pending_authority field, not authority field) | YES — `pending == new_authority.key()` | No | Single-point-of-failure for the entire rotation flow |

`CreateMatch`, `DepositWager`, `SettleMatch`, `CancelMatch`, `PermissionlessReclaim`, `StartWithDepositors` — **unchanged from prior audit**, not re-analyzed here.

## Critical Invariants — New from Bundle 1

1. **Pending config sentinel:** `pending_config_ts == 0` ⇔ no pending config proposal. Verified at `apply_config_update:248` (require `> 0`). Sentinel works because Solana `unix_timestamp` is always positive post-1970.
2. **Pending authority sentinel:** `pending_authority == None` ⇔ no pending authority. `take()` semantics in `accept_authority:336` atomically clear.
3. **Timelock atomicity:** Pending fields cleared via `take()` BEFORE post-apply re-validation (`apply_config_update:257-268, 270-278`). Atomicity relies on Solana transaction-level revert if any `require!` after `take()` fails. **Confirmed safe** — Anchor `require!` returns `Err(...)` which causes the transaction to revert all state changes.
4. **Distinctness invariant survives all paths:** `authority ≠ treasury`, `authority ≠ ops`, `treasury ≠ ops`. Validated at:
   - `update_config:146-148` (effective post-apply state, propose time)
   - `apply_config_update:272-274` (after take(), defense in depth)
   - `accept_authority:340-341` (post-swap; treasury≠ops NOT re-checked here, correct because neither rotated)
5. **Fee cap invariant:** `eff_fee_t + eff_fee_o ≤ MAX_FEE_BPS (1000)`. Checked at both `update_config:149-152` and `apply_config_update:275-278` using `u32` widening to prevent `u16` wrap.
6. **Atomic rotation:** `accept_authority:334-336` does old→pending→None in 3 lines under one mut borrow. Cannot leave a partial state.
7. **Migrate idempotency:** `migrate_config:202-206` returns Ok if `current_size >= new_size`. Calling on an already-migrated config is a no-op.

## Bundle 1 Per-Instruction Risk

### `migrate_config` (v2:184-239)

- **UncheckedAccount + manual data parsing** — only the seeds gate (`[b"config"]`) is enforced by Anchor. Body must do everything else right.
- Authority check at line 197: reads `data[8..40]` as Pubkey and requires it equals signer. This **trusts the v1 GlobalConfig layout has authority at offset 0** (post-discriminator). Confirmed against `v1:832-852`: `authority: Pubkey` is the first field, so byte offset is correct ([8..40] = 8-byte disc + 32-byte authority).
- Realloc with `false` flag (no zero-init), then manual zero-fill at lines 232-235. The skip count uses `current_size` (the live data_len, NOT the constant 110). **This is correct** — if config is at any state between 110 and 231 bytes, only the new bytes are zeroed.
- Idempotency guard at line 203 returns Ok if `current_size >= new_size`. **Concern (F1):** if a malicious actor somehow grows the account by 1 byte past 231 (e.g., via a future buggy realloc), the next legitimate migrate call exits as no-op. Since only the authority can call migrate_config and only via this program, the attack surface is the authority itself — not exploitable by third parties.
- Rent top-up CPI: `from = authority` so authority pays. No path for authority to be DoS-griefed if they have sufficient SOL.
- Borrow lifetime: line 191-198 takes a read borrow on `data`, drops it at the `}` on line 198, then line 226 calls `realloc` which needs no outstanding borrow. **Correct ordering.**

**Devnet-only removal:** comment at line 181-183 says "Remove this instruction in a follow-up program upgrade." If left in mainnet code, an authority could grow the GlobalConfig PDA forever (each migrate succeeds idempotently with no growth, so this is effectively a no-op). Even if forgotten, exploitability is minimal — but document for the cleanup task.

### `ApplyConfigUpdate` context (v2:877-888) + handler (v2:245-293)

- **NO `has_one`** — by design. Comment at lines 873-876 documents this. `payer` is any signer, not authority.
- Sole authority gate is in body: `pending_config_ts > 0` (line 248) + `now >= earliest` (line 255).
- Re-validation block at lines 270-278 (post-take) is defense-in-depth. If propose-time validation was correct, this is redundant; if `authority` rotated via accept_authority during the timelock window, the new authority may collide with proposed treasury/ops. The comment at line 270-271 explicitly notes this race.
- **Concern (F2):** the re-validation occurs AFTER `take()` (lines 257-268). If the `require!` at 272-274 or 275-278 fails, the transaction reverts (Anchor semantic), so `take()` is undone. **Confirmed safe** by Solana transaction atomicity.
- **Concern (F3 — MEDIUM):** Permissionless apply creates a griefing window. If authority proposes a fee change at T=0, decides at T=23h they want to cancel, but a third party calls `apply_config_update` at T=24h+1s, the third party applies the change before authority can cancel it. To cancel a pending config update, authority must call `update_config` again to overwrite — but there's no way to clear pending without writing something. Calling `update_config(None, None, None, None)` re-runs line 154 (`pending_config_ts = now`) which RESETS the clock to a new 24h, but does NOT clear any pending values. So cancellation requires re-proposing with all four pending values explicitly set to the live values to "no-op" them. This is awkward. See F3 detail in New Findings.

### `AcceptAuthority` context (v2:904-917) + handler (v2:326-348)

- **NO `has_one`** — by necessity. The matching field is `pending_authority`, not `authority`. Anchor's `has_one` only checks one named field.
- Single point of failure: line 329-332 `require!(pending == new_authority.key(), Unauthorized)`. If this require is bypassable, the rotation is broken.
- **Confidence: HIGH that line 329-332 is correct.** `cfg.pending_authority.ok_or(NoPendingAuthority)?` at line 328 unwraps `Some(pk)` to `pk`. Comparison is `pk == ctx.accounts.new_authority.key()`. `new_authority: Signer<'info>` ensures Anchor verified signing. No way to spoof.
- **Concern (F4 — MEDIUM):** Post-swap re-validation at lines 340-341 checks `authority != treasury` and `authority != ops`, but does NOT check `treasury != ops`. Correct — neither treasury nor ops rotated in this instruction. But if a pending config update ALSO has `pending_authority` proposed (different flow), the new authority could collide with a pending_treasury that will be applied later. Validated at `apply_config_update:272-274` so safe in practice — but the temporal ordering is brittle. Document.
- **Concern (F5 — LOW):** The proposed new_authority may equal `pending_treasury` (in the pending config flow). Then `accept_authority` succeeds (treasury hasn't rotated yet, distinctness passes against LIVE treasury). Then later `apply_config_update` runs distinctness against the NEW authority and the pending treasury → fails. Result: pending config stuck until authority makes a new proposal. Not a security issue, but a UX/operational footgun.

### `propose_authority` (v2:302-318)

- **Unconditional overwrite** at line 310 — documented as cancel mechanism. To cancel pending_authority, authority calls `propose_authority(authority_self)` to overwrite. Then accept_authority by self would re-affirm the current authority (no-op).
- Zero-key guard at line 306 prevents `new_authority == Pubkey::default()`.
- **No distinctness check at propose time** against treasury/ops. Allowed by design — final check is at accept. Concern (F4) above.
- **No timelock by design** — explicitly chosen for recovery speed. Documented in code comment at lines 295-301.

**Concern (F6 — LOW):** Proposing then never accepting leaves `pending_authority = Some(...)` forever. This burns no permissions, but provides a stale signal in `AuthorityProposed` events. Off-chain monitors should treat re-proposals as fresh state, not net-new compromise signals.

### `update_config` rewrite (v2:115-168)

- Per-field `if let Some` writes at lines 125-138 — selective updates, leaves other pending_* untouched.
- **Concern (F7 — HIGH):** Pending fields PERSIST across `update_config` calls. If at T=0 authority proposes `new_treasury = Alice`, then at T=12h authority proposes `new_fee_bps_treasury = 500`, the treasury proposal is still pending (it was never cleared). Combined, the call at T=12h resets the clock to T=12h+24h, so the original treasury proposal is delayed. **Net effect:** authority can indefinitely delay a treasury-rotation apply by repeatedly calling `update_config` with unrelated fields. This is a partial DoS surface for off-chain monitoring (the announced 24h grace can be silently extended).
- Effective-state validation at lines 141-152 uses `unwrap_or(live)` to merge pending with live values, then checks distinctness + fee cap. **Correct logic.**
- Line 154 unconditionally writes `pending_config_ts = now`. Every call resets the clock. **This is the F7 mechanism.** Combined with the persisting pending_* fields, it's a stalling tactic available only to the current authority.
- Emit at line 156-165 includes `applies_at` computed via `checked_add(CONFIG_TIMELOCK_SECS)`. Off-chain monitors can detect resets by tracking changing `applies_at` values.

### New GlobalConfig fields (v2:1117-1170)

- `pending_authority: Option<Pubkey>` — discriminant byte 0 = None (matches migrate_config zero-fill expectation).
- `pending_treasury`, `pending_ops`, `pending_fee_bps_treasury`, `pending_fee_bps_ops` — same Option pattern.
- `pending_config_ts: i64` — sentinel 0 = no pending. **Safe** because Solana `unix_timestamp` is always > 0 post-1970.
- `last_config_update_ts: i64` — audit trail only. Never read for gating. **Confirmed via grep** of v2 lib.rs (only written in apply_config_update line 280).
- SPACE = 231 bytes, computed at lines 1162-1170. Matches `migrate_config` target. **Verified arithmetic:** 8 + 96 + 4 + 2 + 33 + 33 + 33 + 3 + 3 + 8 + 8 = 231. Correct.

## Prior-Finding Status

| ID | Prior Status | Bundle 1 Status | Justification |
|---|---|---|---|
| **H001** (One-step authority transfer) | STILL_OPEN | **RESOLVED** (with caveats) | `propose_authority` (v2:302-318) + `accept_authority` (v2:326-348) implement the 2-step rotation. New key must sign step 2 to claim. Old key cannot lose access until new key proves liveness. **Caveat 1**: rotation is INSTANT once accepted — no timelock allows off-chain monitors to detect. **Caveat 2**: the proposal step is overwritable by current authority, so an attacker who briefly controls the authority key can propose+accept in a single off-chain coordinated sequence (2 TXs from compromised authority + new attacker key). **Recommendation:** combine with a multisig on the authority key for true defense. |
| **H010** (was NOT_VULN — Anchor account discriminator integrity) | NOT_VULN | **STILL NOT_VULN — but new surface** | `migrate_config` adds an `UncheckedAccount` path that bypasses Anchor's discriminator check via `try_borrow_data`. The check is replaced by manual reading at `data[8..40]` (skipping the 8-byte discriminator). **The discriminator itself is never validated** by migrate_config. If someone manages to create a non-config account at the `[b"config"]` PDA address (impossible because Anchor `init` enforces seeds + bump derivation), migrate would happily realloc and zero-fill. Realistic exploitability: **none** — PDA address is deterministic and Anchor's `init` is the only way to create the account. |
| **H019** (was NOT_VULN — Account closure rent reclamation) | NOT_VULN | **STILL NOT_VULN** | `migrate_config` performs `realloc` (growth) NOT `close`. Bundle 1 does not introduce new close paths. The `close = caller` patterns on `CancelMatch` and `PermissionlessReclaim` are unchanged. No new rent-sweep surface. |

## New Findings

### F1 (LOW): `migrate_config` lacks discriminator validation
**Location:** v2:184-239
**Issue:** The 8-byte Anchor discriminator at `data[0..8]` is never validated by migrate_config. Manual reading starts at offset 8 (assuming it's the authority pubkey).
**Realistic risk:** None today (PDA address is deterministic, only one account exists). But if Anchor ever changes discriminator handling, this code would silently accept malformed data.
**Recommendation:** Add `require!(data[0..8] == GlobalConfig::DISCRIMINATOR, InvalidConfig);` defense-in-depth. Trivial to add.

### F3 (MEDIUM): Cancelling a pending config update is awkward and error-prone
**Location:** v2:115-168 + 245-293
**Issue:** No explicit "cancel pending config" instruction. To cancel, authority must call `update_config` again. But `update_config(None, None, None, None)` does NOT clear pending fields — it only resets `pending_config_ts = now`, extending the timelock by another 24h. To truly cancel, authority must call `update_config(Some(live_treasury), Some(live_ops), Some(live_fee_t), Some(live_fee_o))` to overwrite each pending field with the live value, effectively making the apply a no-op.
**Realistic risk:** Operational footgun. An authority who panics and wants to reverse a fee proposal mid-window has no obvious path. If a malicious permissionless caller front-runs at T=24h+1s, the proposal applies.
**Recommendation:** Add a `cancel_pending_config` instruction that clears all pending_* fields and resets `pending_config_ts = 0`. Authority-only. No timelock.

### F4 (MEDIUM): Bundled rotation flows can leave new authority colliding with pending treasury/ops
**Location:** v2:326-348 (accept_authority) + 245-293 (apply_config_update)
**Issue:** `accept_authority` validates `cfg.authority != cfg.treasury/ops` against LIVE treasury/ops (lines 340-341). If a pending config update is in flight (pending_treasury = X), the new authority may equal X. After accept_authority, the live authority = X. Then `apply_config_update` runs lines 272-273 distinctness against authority == X == new_treasury == X → fails. Pending config is stuck.
**Realistic risk:** UX/operational. The new authority must call `update_config` to clear the colliding pending field. Adds 24h delay to any pending config proposal that happened to overlap rotation.
**Recommendation:** Either (a) at `accept_authority`, ALSO check `cfg.authority != cfg.pending_treasury.unwrap_or(cfg.treasury)` and `cfg.authority != cfg.pending_ops.unwrap_or(cfg.ops)` and `cfg.authority != cfg.pending_authority.unwrap_or(cfg.authority)` (defensive); or (b) document the procedure to clear pending config before rotating authority.

### F7 (HIGH): Authority can indefinitely delay config-update apply via clock reset
**Location:** v2:115-168, specifically line 154 (`pending_config_ts = now`)
**Issue:** Every `update_config` call writes `pending_config_ts = now`, resetting the 24h timelock to a new propose time. The pending_* fields PERSIST across calls (per-field if-let-Some writes). So:
1. T=0: `update_config(Some(new_treasury_A))` → `pending_treasury = Some(A)`, `pending_config_ts = 0`, applies_at = 24h.
2. T=23h: `update_config(Some(new_fee_bps_treasury=500))` → `pending_fee_bps_treasury = Some(500)`, `pending_treasury STILL = Some(A)`, `pending_config_ts = 23h`, new applies_at = 47h.
3. T=46h: `update_config(Some(new_fee_bps_ops=300))` → `pending_config_ts = 46h`, applies_at = 70h.
4. ... repeat indefinitely.

The announced treasury rotation to A is delayed forever. Off-chain monitors see fresh `ConfigProposed` events but no apply.
**Realistic risk:** A compromised authority can use this to mask intent — announce treasury rotation, then keep stalling via unrelated field updates, while off-chain monitoring loses track of what's "really" pending. Permissionless apply is the mitigation (any third party can apply once 24h elapses if authority STOPS updating), but the authority has unilateral control during their entire compromise window.
**Recommendation:** Either (a) require any new `update_config` call to clear previous pending fields it doesn't explicitly set (replace if-let-Some with unconditional overwrite from a single struct); or (b) only reset `pending_config_ts` if the pending set materially changes; or (c) emit a separate event when an existing pending is "extended."

### F8 (LOW): No bound on how many times `propose_authority` can be called
**Location:** v2:302-318
**Issue:** Each call emits an event (AuthorityProposed) including `replaced_pending`. An attacker who compromises the authority key could spam thousands of propose_authority calls with random new_authority values, polluting the event log and exhausting RPC observability.
**Realistic risk:** Low. Each call costs the authority's signature fee (and TX rent). Not free spam. The authority must already be compromised for this to happen.
**Recommendation:** None required. Off-chain monitors should already handle event spam from compromised authorities.

### F9 (MEDIUM): `apply_config_update` cannot be called for a stale propose_authority
**Location:** v2:245-293 vs 326-348
**Issue:** The two pending flows are independent. `apply_config_update` clears `pending_config_ts` and the four pending_* config fields, but NEVER touches `pending_authority`. So if `propose_authority` was called T-1h, then `update_config` was called T (any field), then `apply_config_update` is called T+24h, the pending_authority is still Some(X) but no apply was performed for it. Correct semantics (different flows), but an off-chain monitor must distinguish.
**Realistic risk:** Operational complexity. Two independent governance state machines.
**Recommendation:** Document the orthogonality. Possibly emit an event when pending_authority is overwritten by propose_authority on existing pending.

## Cross-Focus Handoffs

→ **Arithmetic agent**: Verify `now.checked_add(CONFIG_TIMELOCK_SECS)` at v2:163, 252-254 cannot overflow. `i64::MAX = ~9.2 × 10^18`, current unix_timestamp is ~1.8 × 10^9. Adding 86400 is microscopic relative to i64::MAX. Safe in any realistic timeframe.

→ **State Machine agent**: The pending_config flow has 3 states (none, pending-timer-not-elapsed, pending-timer-elapsed). The pending_authority flow has 2 states (none, pending). Verify all transitions are reversible by authority (cancel/propose-overwrite mechanisms).

→ **Token & Economic agent**: F7 (clock reset) directly affects fee change announcements. Confirm whether 24h grace is contractual or just announced — if off-chain SLA says "users have 24h to react to fee changes," F7 breaks that SLA.

→ **Upgrade & Admin agent**: F3 (no cancel-pending-config) is operational not security. Add to follow-up program upgrade alongside `migrate_config` removal. → Verify intent on permissionless apply: is this a DoS protection mechanism or a feature? Comment at 873-876 frames it as the former.

→ **CPI agent**: The only new CPI in Bundle 1 is `system_program::transfer` inside `migrate_config` at lines 214-223 (rent top-up). Standard pattern, signer = authority (`from: auth_info`). No external program interaction. Safe.

→ **Account Validation agent**: `MigrateConfigUnchecked.config` is the only `UncheckedAccount` for a non-destination role in the entire v2 program. All body-level validation:
  - seeds verified by Anchor (line 862-863)
  - bump derived (no stored bump in this context)
  - authority verified manually (line 197)
  - data length verified before slicing (line 192)
  - discriminator NOT verified (F1 — defense in depth recommendation)

→ **Token & Economic agent**: Snapshotted treasury/ops/fees at create_match are unchanged in Bundle 1 — pre-existing audit covers this.

## Trust Boundaries — Bundle 1 Update

Bundle 1 adds a new trust tier: **permissionless apply callers**. Any signer can call `apply_config_update` after CONFIG_TIMELOCK_SECS. This is intentional liveness protection — if authority becomes unreachable, third parties can ensure announced changes take effect. But it also means the authority loses unilateral control over when changes apply, only over what changes are proposed. The proposing authority is the gatekeeper for content; permissionless callers are the gatekeepers for timing.

Combined with F7 (clock reset), the authority CAN delay apply but cannot prevent it forever — eventually they must stop proposing, at which point a permissionless caller can apply.

The accept_authority pattern is the second new boundary: **the new authority is trusted to come online and claim** within whatever operational SLA the team sets. If the new key is lost/compromised between propose and accept, the old key remains in control (no state change).

<!-- CONDENSED_SUMMARY_END -->

---

# Bundle 1 Per-Surface Brief Analysis

## migrate_config (Devnet-only)

**Mechanism:** Reads raw bytes [8..40] from UncheckedAccount config as authority pubkey, requires signer match. Computes rent delta, tops up via CPI, calls `realloc(231, false)`, zero-fills new bytes manually.

**Why UncheckedAccount:** old config is 110 bytes — Anchor's `Account<GlobalConfig>` would fail to deserialize the new 231-byte struct against it. UncheckedAccount lets the body parse manually.

**Verification:**
- Authority offset [8..40]: confirmed correct against v1 GlobalConfig layout (`authority: Pubkey` is first field, lines v1:832-852).
- Borrow lifetime: read borrow (line 191) dropped at scope end (line 198) before realloc (line 226). Correct.
- Zero-fill skip count uses `current_size` (live data_len), not constant. Correct for partial migrations.
- Idempotency: line 203-206 returns Ok if already at 231 bytes.

**Concerns:**
- Discriminator never validated (F1 — defense-in-depth recommendation).
- Devnet-only — must be removed before mainnet permanence.

## ApplyConfigUpdate

**Mechanism:** Anyone signs as payer. Reads `pending_config_ts`, requires > 0. Reads now, computes `earliest = pending_config_ts + TIMELOCK`, requires `now >= earliest`. Takes each `Option` pending field into live. Re-validates distinctness + fee cap. Sets `last_config_update_ts = now`, clears `pending_config_ts = 0`.

**Verification:**
- `>=` boundary at line 255 — if `now == earliest`, apply succeeds. 1-second precision matches Solana's slot clock. Acceptable.
- Take pattern (lines 257-268) followed by require! (lines 272-278). If revalidation fails, transaction reverts ALL state via Solana atomicity. **Safe.**
- No pause guard — by design (apply can succeed during pause).
- No has_one — by design (permissionless apply).

**Concerns:**
- F3 (no cancel mechanism).
- F4 (potential collision with new authority).

## AcceptAuthority

**Mechanism:** new_authority signs. Body reads `pending_authority`, returns NoPendingAuthority if None. Requires `pending == new_authority.key()`. Atomic: `old = authority; authority = pending; pending_authority = None`. Re-validates `authority != treasury/ops`. Emits.

**Verification:**
- No has_one (matches pending_authority not authority field). Correct.
- Sole identity gate: line 329-332. Anchor's Signer<'info> ensures new_authority signed; Pubkey comparison is exact.
- Atomic swap correctly inverts: cannot leave state where authority == pending. The 3-line sequence is under one mut borrow.

**Concerns:**
- F4 (collision with pending treasury/ops not checked).
- F5 (pending config collision footgun).

## propose_authority

**Mechanism:** Authority signs (has_one). Validates new_authority != Pubkey::default(). Unconditionally overwrites pending_authority with new value. Emits with `replaced_pending` showing prior value (if any).

**Verification:**
- Zero-key guard at line 306.
- Overwrite as cancel mechanism documented at lines 299-301.
- No distinctness against treasury/ops at propose-time — deferred to accept.

**Concerns:**
- F6 (stale pending forever if never accepted).
- F8 (event spam from compromised authority).

## update_config rewrite

**Mechanism:** Authority signs (has_one). Per-field if-let-Some writes to pending. Computes effective state via unwrap_or(live). Validates effective distinctness + fee cap. Unconditionally writes pending_config_ts = now. Emits with applies_at.

**Verification:**
- Effective-state validation at lines 141-152 correctly merges pending + live before checking.
- Fee cap uses u32 widening (line 150) — safe against u16 overflow.
- pending_config_ts overwrite (line 154) is unconditional.

**Concerns:**
- F7 (HIGH — clock reset extends timelock arbitrarily).
- F9 (orthogonal flows — pending_authority not touched).

## Bundle 1 Risk Stack-Ranked

1. **F7 (HIGH)** — authority can indefinitely delay config apply via repeated update_config calls. Defeats announced 24h grace SLA.
2. **F3 (MEDIUM)** — no clean way to cancel a pending config update. Operational footgun.
3. **F4 (MEDIUM)** — authority rotation can collide with pending treasury/ops, blocking config apply.
4. **F9 (MEDIUM)** — orthogonal authority/config pending flows complicate off-chain monitoring.
5. **F1 (LOW)** — migrate_config doesn't validate discriminator. Trivial defense-in-depth fix.
6. **F5 (LOW)** — new_authority can equal pending_treasury (transient collision).
7. **F6 (LOW)** — stale pending_authority forever if never accepted.
8. **F8 (LOW)** — event spam surface from compromised authority.

No CRITICAL findings in Bundle 1. The biggest concern is F7, which weakens the headline 24h timelock guarantee under a malicious-authority scenario.
