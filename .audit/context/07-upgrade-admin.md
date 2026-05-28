---
task_id: sos-phase1-upgrade-admin-bundle1
provides: [bundle1-governance-findings, governance-invariants, l1-l2-separation-status]
focus_area: upgrade-admin
files_analyzed:
  - programs/solshot-escrow-v2/src/lib.rs (lines 56-348, 818-917, 1117-1170, 1296-1337, 1416-1422)
  - programs/solshot-escrow/src/lib.rs (lines 834-852 for v1 GlobalConfig layout reference)
delta_focus: Bundle 1 (S2-T1 + S2-T2 governance instructions)
prior_baseline: .audit-history/2026-05-06-226c0cd/context/07-upgrade-admin.md
finding_count: 11
severity_breakdown: {critical: 0, high: 4, medium: 5, low: 2}
---

# Upgrade & Admin Audit (Bundle 1 Delta) — Phase 1

This report is delta-focused: prior audit (commit 226c0cd) flagged H001 (CRITICAL: one-step authority transfer) as the dominant unresolved governance issue. Bundle 1 (S2-T1 + S2-T2) is the implementation response. This audit assesses whether the implementation discharges H001 and what new attack surface it introduces.

---

## Governance Layer Inventory

### Bundle 1 instructions added to v2

| Instruction | Lines | Authority gate | Atomicity | Timelock | Permissionless? | New attack surface |
|---|---|---|---|---|---|---|
| `update_config` (rewrite) | 115-168 | `has_one = authority` | Writes pending_*; effective post-apply validation | None at propose; 24h at apply | No | Resets `pending_config_ts` on every call (DoS reset, see F-N1) |
| `migrate_config` | 184-239 | Manual raw-data check at offset [8..40] | Single ix: realloc + zero-fill + rent top-up | None | No | UncheckedAccount; relies on v2 pre-Bundle-1 layout, NOT v1 layout (see F-N2 nomenclature confusion) |
| `apply_config_update` | 245-293 | None at context; sole gate is `now >= pending_config_ts + 24h` in body | Atomic apply of all pending fields; post-apply re-validation | Yes (24h) | YES — anyone can fire after timelock | Liveness preserved if proposer goes dark; griefing window during apply |
| `propose_authority` | 302-318 | `has_one = authority` | Single write to `pending_authority`; OVERWRITES prior pending | None (intentional for recovery) | No | Old authority can stall rotations by repeated self-propose |
| `accept_authority` | 326-348 | No has_one; new_authority signer must match `pending_authority` | Atomic 3-line swap; pre-checked, post-validated distinctness | None | No | If pending_treasury is set when accept fires, race possible |

### State fields added to GlobalConfig (1128-1146)

| Field | Bytes | Purpose | Sentinel |
|---|---|---|---|
| `pending_authority: Option<Pubkey>` | 1+32 | Holds proposed new authority until accepted | `None` = no pending |
| `pending_treasury: Option<Pubkey>` | 1+32 | Holds proposed new treasury until applied | `None` = no pending |
| `pending_ops: Option<Pubkey>` | 1+32 | Holds proposed new ops until applied | `None` = no pending |
| `pending_fee_bps_treasury: Option<u16>` | 1+2 | Proposed new treasury BPS | `None` = no pending |
| `pending_fee_bps_ops: Option<u16>` | 1+2 | Proposed new ops BPS | `None` = no pending |
| `pending_config_ts: i64` | 8 | Propose timestamp; `0` = no pending config | `0` = none |
| `last_config_update_ts: i64` | 8 | Audit trail; written but never gated on | `0` = never updated |

Total new state: 121 bytes (110 → 231). Matches `GlobalConfig::SPACE` declaration at lines 1162-1169.

### Roles

- **L1 (Solana upgrade authority)**: unchanged. Hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` per prior audit. Bundle 1 does NOT touch this layer.
- **L2 (config.authority)**: unchanged hot wallet, but rotation semantics rewritten.
- **L2 pending_authority** (NEW): ephemeral; holds the proposed new key during the propose→accept handoff window.
- **Permissionless callers**: NEW role surface, used only by `apply_config_update`. Any signer can pay to apply pending changes after timelock. Cannot rotate authority directly.

---

## Authority Rotation Flow (propose → accept atomicity)

### Happy path

1. Current authority calls `propose_authority(new_key)`.
   - L306: zero-key guard `new_authority != Pubkey::default()`.
   - L309-310: writes `pending_authority = Some(new_key)`; previous value (if any) saved for event.
   - L312-316: emits `AuthorityProposed { current, pending, replaced_pending }`.
   - No timelock, no distinctness check vs treasury/ops.
2. New key (`new_key`) calls `accept_authority`.
   - L328: gates on `pending_authority.is_some()` → returns `NoPendingAuthority` if not.
   - L329-332: requires `pending == new_authority.signer.key()` → returns `Unauthorized` otherwise.
   - L334-336: atomic 3-line swap:
     - `let old = cfg.authority;`
     - `cfg.authority = pending;`
     - `cfg.pending_authority = None;`
   - L340-341: post-swap distinctness check (`authority != treasury`, `authority != ops`). NOT a check against `pending_treasury`/`pending_ops`.
   - L343-346: emits `AuthorityAccepted { old, new }`.

### Atomicity verdict

`accept_authority` is correctly atomic at the transaction level: all four steps (gate, swap, validate, emit) happen in one instruction body. If the post-swap distinctness check at L340-341 fails, the entire TX reverts (Anchor's `require!` returns an error which causes Solana to revert all state changes). The `cfg.authority = pending` write is reverted along with `cfg.pending_authority = None`. **Confirmed safe.**

### Distinctness ordering (pre vs post swap)

The distinctness check happens **post-swap** (L340-341 sees `cfg.authority = pending`). This is the correct ordering because:

- The check verifies the **new** authority pubkey is distinct from current treasury/ops.
- If checked pre-swap, the comparison would compare the OLD authority — useless because old is being discarded.

This is correct as-implemented. The only subtlety: if a `pending_config_ts > 0` exists, `cfg.treasury` and `cfg.ops` may still be the OLD values (not yet applied). So a `propose_authority(K) → propose_config(treasury=K) → accept_authority(K)` flow:

- Step 1: `pending_authority = Some(K)`
- Step 2: `pending_treasury = Some(K)`, `pending_config_ts = now`
- Step 3: accept fires. Post-swap: `cfg.authority = K`, `cfg.treasury` = OLD value (still). Distinctness check passes IF old treasury != K.

So `accept_authority` does NOT detect a conflict between the new authority and a pending treasury. **The conflict surfaces only when `apply_config_update` runs the post-apply distinctness check at L272-274.** This is correctly defended-in-depth — the apply will revert.

### Cancel mechanism

To cancel a pending authority proposal: call `propose_authority(current_authority_key)`. This overwrites `pending_authority = Some(current)` — even though "swapping in" the current key would be a no-op if accepted, it serves as a clear cancellation signal in the event log via `replaced_pending`. To make the cancel truly irreversible, the authority would need to call again with their own key OR wait for someone else to call accept — but accept will only succeed if the signer matches pending (i.e., only the current authority could complete this self-accept, which is a no-op).

**The cancel mechanism is functional but counterintuitive.** Cleaner alternative would be a dedicated `cancel_proposal` instruction that sets `pending_authority = None`. Filed as F-N4 below.

### Reentrancy

Solana has no reentrancy primitive (no CPI back into the same program with mutable state). The propose and accept instructions hold `&mut ctx.accounts.config` for the entire body. No CPI inside either body — both are pure account mutations. **Reentrancy not applicable.**

### Stalling attack

**An old authority can repeatedly call `propose_authority(old_authority)` to clear any pending proposal in 1 TX.** This is documented as intentional (cancel mechanism). However it has two implications:

1. If an attacker compromises the authority key and proposes a new attacker-controlled key, the legitimate authority (still in `cfg.authority` until accept) can immediately self-propose to overwrite. This is **defensive** — useful for revocation.
2. If the legitimate authority gradually plans to rotate to a multisig, an attacker who compromises the key could repeatedly self-propose to STALL the rotation. The legitimate operator would need access to the key to re-propose toward the multisig. But: if both attacker and legitimate operator have the key (live compromise), the legitimate operator is already in a losing race.

**Verdict:** stalling is a degenerate case of compromise, not a new attack vector. The propose-only-by-authority gate at the context (L897) is correctly restrictive — only the current authority can propose. The cancel-via-self-propose is the documented mechanism.

---

## Config Update Timelock Flow (propose → 24h → apply)

### Happy path

1. Authority calls `update_config(new_treasury?, new_ops?, new_fee_bps_treasury?, new_fee_bps_ops?)`.
   - L122: mutable borrow on config.
   - L123: reads `now`.
   - L125-138: per-field `if let Some` writes — only changes provided fields. Per-write zero-key guard for pubkey fields.
   - L141-144: computes effective post-apply state via `unwrap_or(live)`.
   - L146-148: distinctness check on effective state.
   - L149-152: fee cap check `(eff_t + eff_o) as u32 <= MAX_FEE_BPS as u32` (widening to defeat u16 wrap).
   - L154: **UNCONDITIONAL write `cfg.pending_config_ts = now`** ← critical, see F-N1.
   - L156-165: emits `ConfigProposed` with `applies_at = now + CONFIG_TIMELOCK_SECS`.
2. 24 hours pass.
3. Any signer calls `apply_config_update`.
   - L248: gate `pending_config_ts > 0`.
   - L250: reads `now`.
   - L251-254: computes `earliest = pending_config_ts + CONFIG_TIMELOCK_SECS` with `checked_add`.
   - L255: gate `now >= earliest`.
   - L257-268: `if let Some(t) = cfg.pending_treasury.take()` apply pattern — `take()` simultaneously reads and clears the pending field.
   - L270-278: post-apply re-validation (distinctness + fee cap).
   - L280: writes `last_config_update_ts = now`.
   - L281: writes `pending_config_ts = 0` (sentinel reset).
   - L283-290: emits `ConfigApplied`.

### F-N1: Pending timestamp reset attack (HIGH)

**The "F7" finding from auditor 01.** Confirmed in this audit.

At L154, `cfg.pending_config_ts = now` is written **unconditionally on every call to update_config**. There is no check whether a prior proposal existed.

#### Attack scenarios

**Scenario A — Honest authority indecision DoS**:
- Day 0, 09:00: Authority calls `update_config(new_treasury = T1)`. pending_config_ts = 09:00.
- Day 0, 20:00: Authority realizes T1 was wrong; calls `update_config(new_treasury = T2)`. pending_config_ts = 20:00.
- Day 1, 09:00: `apply_config_update` reverts (`now=Day 1 09:00`, `earliest = Day 0 20:00 + 24h = Day 1 20:00`).
- Off-chain monitor that was tracking the original T1 proposal was already 11 hours into its 24h window — its visibility was effectively reset.

This is a legitimate use case (changing mind during the window), but it shows that **the timelock is restarted on every update_config call**.

**Scenario B — Stalling-as-griefing**:
- A compromised authority key proposes legitimate-looking fee changes, then calls `update_config` again every 23h to perpetually defer apply. Pending changes are visible in events but never apply. This is a form of "monkey-in-the-middle" griefing where the chain is forever in a proposed state.
- However, the permissionless `apply_config_update` does not need authority signature — so if the authority stops calling update_config for 24h, any third party can apply. The stall only works if the attacker continuously calls.

**Scenario C — Hide-the-change attack**:
- Attacker proposes `new_treasury = attacker_pubkey` at T0. Monitors detect, raise alarm.
- At T0 + 23h59m, attacker calls `update_config(new_fee_bps_treasury = 700)` (a no-op or trivial value). pending_config_ts reset to T0 + 23h59m.
- Now treasury attack-proposal is **still pending** AND timelock has been pushed forward another 24h.
- Effectively: attacker can keep the malicious treasury proposal "alive" indefinitely, requiring CONTINUOUS monitoring rather than a single 24h window of attention.

**Verdict: HIGH**. The unconditional reset is a real DoS vector against the timelock's defensive intent. Mitigations to consider:
- Only write `pending_config_ts = now` if it was previously 0 (first proposal starts the clock).
- OR: add a separate timelock per field (more state, but more granular).
- OR: allow update_config but require an explicit `cancel_pending` instruction to reset.

The current code path makes the 24h window a **soft** boundary, not a hard one. Off-chain monitors must continuously poll for re-proposals.

### Concurrent propose race vs apply

A subtler race: imagine apply fires at T0 + 24h and reverts (e.g., the supplied accounts don't deserialize). In the SAME slot, authority calls `update_config(new_treasury=T2)`. After the slot:

- If apply landed first AND succeeded: pending_config_ts = 0, ConfigApplied emitted, pending_treasury cleared. Then update_config writes new pending_treasury and pending_config_ts = new now.
- If update_config landed first: pending_treasury overwritten before apply. apply runs against the new pending_treasury and (if 24h has elapsed since the original propose) succeeds — but it applies the *new* T2, not the originally-proposed T1.

**Race verdict**: this is a real race but it only matters if the authority is malicious AND somehow times their update_config call to land in the same slot as apply. The blast radius is "the wrong T is applied" — but both Ts went through the authority's signature, so the attacker would just be choosing between two attacker-controlled values. Not a new attack vector — the authority controls both proposals.

### Effective-state validation timing

The propose-time validation at L141-152 uses an **effective post-apply state** computed via `unwrap_or(live)`. This is correct for catching invalid future states at propose time. But:

**The apply-time re-validation at L272-278 is the canonical check.** Between propose and apply, the live `cfg.authority` could rotate via accept_authority. The propose-time check verified against the authority at propose time; the apply-time check verifies against the (possibly different) authority at apply time. **This is the correct defense-in-depth.** Documented as such in the code comment at L270-271.

However, **the post-apply re-validation runs AFTER `take()` has already cleared the pending fields**. If revalidation fails, the entire transaction reverts (atomic), so the take operations are reverted too. **Confirmed safe** — Anchor's Solana revert semantics restore all account state on `require!` failure.

### apply_config_update permissionless surface

Anyone can pay the fee to apply pending changes after 24h. Implications:

- **Liveness preservation**: if the proposing authority becomes unreachable (key lost, hardware failure, monitoring outage), any third party can apply announced changes. This is **strictly better** than a propose-only-by-authority apply (which would lock the chain in a proposed state).
- **Griefing surface**: a hostile party could attempt to apply at exactly `T0 + 24h` to maximize the time the original authority has to react. But: the original authority would have had 24h to either revoke (via re-propose, but that resets the clock — F-N1 hits again) or accept the consequences. There is no "cancel pending config" instruction; the only way to clear pending is via apply OR via a fresh update_config (which only modifies, not clears).
- **F-N5 below**: there is no way to fully cancel a pending config change without applying it. This combined with F-N1 means the authority can DELAY but never CANCEL once proposed.

---

## migrate_config Risk Analysis

### Documented purpose

Per docstring at L170-183: one-shot devnet PDA realloc from pre-Bundle-1 v2 SPACE (110 bytes) to post-Bundle-1 SPACE (231 bytes). The docstring says "Remove this instruction in a follow-up program upgrade after drilling is complete."

### IMPORTANT NOMENCLATURE CLARIFICATION

The HOT_SPOTS.md and prompt suggest migrate_config might be intended for the v1 → v2 layout. **It is not.** The 110-byte layout it expects to find is the **v2 pre-Bundle 1 layout** (confirmed by inspecting commit `2cd5eb2:programs/solshot-escrow-v2/src/lib.rs` lines 821-823: `8 + (32*3) + (2*2) + 1 + 1 = 110`). The v1 layout is 106 bytes (no fee BPS fields).

So migrate_config:
- Migrates **v2 pre-Bundle 1 (110B)** → **v2 Bundle 1 (231B)**.
- Cannot be run against the **v1 program** at `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` — that's a different program ID with a different config PDA seed.

The byte offset `[8..40]` for authority is correct for both v1 AND v2 pre-Bundle-1 layouts (both have authority as the first non-discriminator field). The size assumption matters only for the idempotency check at L203 (`current_size >= new_size`). Since v2 pre-Bundle-1 was 110 and Bundle-1 is 231, the check correctly skips if already migrated.

### Authority verification (L191-198)

```rust
let data = config_info.try_borrow_data()?;
require!(data.len() >= 40, EscrowError::InvalidConfig);
let stored_authority_bytes: [u8; 32] = data[8..40]
    .try_into()
    .map_err(|_| EscrowError::InvalidConfig)?;
let stored_authority = Pubkey::from(stored_authority_bytes);
require!(stored_authority == auth_info.key(), EscrowError::Unauthorized);
```

**Correctness**: offset [8..40] is the v2 pre-Bundle 1 authority field position (8-byte discriminator + 32-byte authority). The try_into is the safe pattern (returns Err if size mismatched; mapped to InvalidConfig).

**Subtle concern**: the data borrow is held in a scope `{ ... }` to L198. After this scope exits, the borrow is released. The realloc at L226 then re-borrows. **Confirmed safe** — the explicit `{}` block at L190 properly scopes the borrow.

### Realloc + zero-fill (L226-236)

```rust
config_info.realloc(new_size, false)?;
{
    let mut data = config_info.try_borrow_mut_data()?;
    for byte in data.iter_mut().skip(current_size) {
        *byte = 0;
    }
}
```

**Concerns checked:**

1. **`realloc(new_size, false)` — second arg is `zero_init`.** Setting it `false` defers zero-init to the manual loop below. Correct pattern.
2. **Manual zero-fill skips `current_size` bytes, fills the rest.** For pre-Bundle 1 → Bundle 1, this means bytes [110..231] are zeroed. Bytes [0..110] preserve the old serialized state (discriminator + authority + treasury + ops + fee_bps + is_paused + bump).
3. **Borsh `Option<T>` deserialization on zero bytes**: `0` discriminant byte = `None`. **Verified correct** for `Option<Pubkey>` and `Option<u16>`.
4. **`i64` zero**: deserializes to `0i64`. **Verified correct** for `pending_config_ts` and `last_config_update_ts`.

The zero-fill correctness relies on the pre-Bundle-1 v2 layout having exactly 110 bytes serialized, with no padding. **Borsh has no implicit padding** for `#[account]` structs, so the assumption holds. (Solana's BPF target has no struct alignment requirements that would add padding.)

### Rent top-up (L208-224)

```rust
let rent = Rent::get()?;
let new_minimum = rent.minimum_balance(new_size);
let current_balance = config_info.lamports();
if current_balance < new_minimum {
    let lamports_needed = new_minimum.checked_sub(current_balance)
        .ok_or(EscrowError::ArithmeticOverflow)?;
    anchor_lang::system_program::transfer(...);
}
```

**Concerns checked:**

1. **`checked_sub`**: cannot underflow because the `if` branch guarantees `current_balance < new_minimum`.
2. **CPI transfer**: from `auth_info` (authority pays). Authority must have lamports. If not, transfer fails and entire ix reverts. Correct.
3. **No overpayment**: only transfers the delta. Correct.

### Idempotency (L201-206)

```rust
let new_size = GlobalConfig::SPACE;
let current_size = config_info.data_len();
if current_size >= new_size {
    return Ok(());
}
```

If config is already 231 bytes, the ix returns immediately. **Correct** — prevents accidentally re-zeroing the live pending fields.

**Subtle concern**: the authority check at L197 runs BEFORE the idempotency check at L203. So even if the migration is already complete, the call still requires the authority signature. **Correct** — prevents random callers from poking the contract.

### F-N2: migrate_config will be in mainnet bytecode (HIGH)

Per prompt: "Per V1 mainnet scope, v2 is the mainnet target. So migrate_config WILL be on mainnet."

The docstring at L181-183 says: "Devnet-only. Remove this instruction in a follow-up program upgrade after drilling is complete. Mainnet deploys with new SPACE from initialize_config genesis — no migration path needed there."

**The intent is to remove migrate_config before mainnet deploy.** If the V1 mainnet plan is to deploy v2 as-is, migrate_config will ship to mainnet UNLESS a separate pre-mainnet rebuild + redeploy is performed.

#### Mainnet-with-migrate_config risk

If migrate_config IS deployed to mainnet:

1. **Reduced size assumption at L192** (`data.len() >= 40`): on mainnet, the config PDA will be initialized via `initialize_config` at 231 bytes (the new SPACE). The migrate_config idempotency at L203 will trigger return Ok(()) immediately — but only AFTER the authority signature check. So an attacker cannot force-realloc, but can force the authority to pay TX fees (low-impact griefing only if authority is forced to sign).

2. **Genuine risk only if the PDA size differs from genesis SPACE.** If something causes the live config to be smaller than 231 (e.g., a Solana-bug-induced data length corruption — virtually impossible), migrate_config could be called to "fix" it. But this is post-hoc remediation, not an attack vector.

3. **No-op for properly-initialized config**: in normal mainnet operation, migrate_config is a no-op (returns Ok at L205). Carries small CU cost but no semantic effect.

#### Recommendation

**Before mainnet deploy, rebuild v2 with `#[cfg(feature = "devnet")]` gating around migrate_config OR remove it entirely.** This is operationally cleaner than relying on the idempotency guard. If migrate_config is to be retained, document that the only legitimate mainnet use is post-Solana-runtime-corruption recovery (essentially never).

**As-is severity**: HIGH risk **only** if it ships to mainnet without rebuild. The instruction is gated by authority signature; an attacker without authority can never invoke it usefully. The risk is one of dead-code on mainnet (more bytecode = larger attack surface = more inspector work).

### F-N3: migrate_config has no event emit (LOW)

Unlike every other governance instruction in Bundle 1 (which emits ConfigProposed/ConfigApplied/AuthorityProposed/AuthorityAccepted), `migrate_config` emits no event. A successful migration is invisible to off-chain monitors except via the implicit "config account data length changed" signal.

**Severity**: LOW. The instruction is intended as one-shot devnet plumbing — no observability is needed for production. But for completeness, an `emit!(ConfigMigrated { authority, ... })` would aid forensic reconstruction.

---

## L1 vs L2 Separation (carry-forward H044/H046)

### Prior audit (H044, H046)

H044 (carry-forward): Layer-1 program upgrade authority and Layer-2 config.authority are the same hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`. Compromise of either = total protocol loss.

H046 (carry-forward): No multisig wired up; OC-13 marker at v1:1 documents intent but no implementation.

### Bundle 1 impact on L1

**Bundle 1 introduces zero new L1 surface.** All Bundle 1 instructions operate at the application (L2) layer. The Solana BPF loader upgrade authority is unchanged. None of `propose_authority`, `accept_authority`, `update_config`, `apply_config_update`, or `migrate_config` interact with the `BPFLoaderUpgradeab1e...` program.

**Confirmed**: Bundle 1 is L2-only. **H044/H046 are not regressed.**

### Bundle 1 impact on L2

The L2 surface is now richer:

- **Before Bundle 1**: single-step `update_config` for everything (authority, treasury, ops, BPS). One compromised key TX = full takeover.
- **After Bundle 1**: 
  - Authority rotation: 2-step (propose + accept by new key). Attacker must control BOTH the current authority key AND the proposed new key to drive a rotation.
  - Treasury/Ops/BPS rotation: 2-step (propose + 24h timelock + permissionless apply). Off-chain monitors get a window to detect and react.

**Squads multisig integration**: still pending. If Squads is wired up to `config.authority`, then:
- `propose_authority(squads_pubkey)` — single TX from current hot wallet.
- `accept_authority` — multisig TX signed by Squads.
- Once accepted, hot wallet is no longer authority. All future propose/accept/pause/etc. require multisig.

This Squads integration is straightforward with the propose/accept primitives. **The Bundle 1 implementation supports the planned Squads migration.**

### Compounding L1 + L2

Even with Bundle 1 + Squads on L2, **L1 remains a hot wallet single point of failure**. A malicious L1 upgrade can deploy bytecode that ignores all Bundle 1 governance — drains escrows, mints new instructions, etc. **Bundle 1 does NOT close H044/H046.** The Squads-from-day-one plan must include L1 transfer to Squads or similar multisig for true defense-in-depth.

---

## Pause + Governance Interaction

### Question 1: Can apply_config_update fire while paused?

**Yes.** `ApplyConfigUpdate` context (L877-888) does NOT have a `constraint = !config.is_paused`. The only gate is the timelock check in the body.

**Is this correct?** Per the v2 design philosophy (carried over from prior audit context): pause halts NEW commitments (create_match, deposit_wager, start_with_depositors) but does NOT block in-flight or governance exits.

A governance change (e.g., treasury rotation) being applied during a pause is arguably fine — the change doesn't affect in-flight matches (they use snapshots). However, if the authority pauses BECAUSE they suspect a compromise, having apply_config_update still callable means an attacker who already proposed malicious changes 24h ago can have them applied even after the pause.

**Severity: MEDIUM** (F-N6 below). The pause-doesn't-block-apply combined with permissionless-apply + propose-stall (F-N1) creates a scenario where:
1. Attacker compromises authority at T0. Proposes malicious treasury.
2. Legitimate operator detects at T0 + 12h. Cannot rotate authority back (attacker can re-propose). 
3. Legitimate operator pauses program at T0 + 13h.
4. At T0 + 24h, attacker (or attacker's bot) calls apply_config_update. Pause does not block it. Malicious treasury is now live.
5. Attacker calls `propose_authority(attacker_2)` from compromised key. accept_authority by attacker_2. Authority is now attacker-controlled.
6. Operator unpauses (or attacker waits for pause to lift). Next created_match snapshots attacker treasury.

**Mitigation**: gate apply_config_update on `!config.is_paused`. This adds a 1-line constraint to the ApplyConfigUpdate context.

### Question 2: Can propose/accept_authority fire while paused?

**Yes.** Neither `ProposeAuthority` (L892-902) nor `AcceptAuthority` (L907-917) has a pause constraint.

**Is this correct?** Recovery from authority compromise may require pausing the program first (block new business while you sort the rotation). If propose/accept were pause-gated, an authority who has paused themselves out (e.g., as a defensive measure after detecting compromise) could not rotate to a new key without unpausing first — which would require authority signature, which the attacker controls.

**Verdict**: propose/accept being unblocked during pause is **operationally correct** for recovery scenarios. Same as the v2 cancel_match design.

### Question 3: Does pause itself need a timelock or 2-step?

**No.** Pause is intended as an emergency lever. A timelock on pause would defeat the purpose (delay the kill switch). A 2-step pause would add operational complexity without clear security benefit.

However, **unpause might warrant a small timelock or visibility window** (so off-chain monitors can verify the unpause is intentional, not an attacker-resume-after-pause situation). Not implemented in Bundle 1. **Severity: LOW**, filed as F-N9.

---

## Critical Invariants

### INV-B1-1: Atomic authority swap

The 3-line block at L334-336 (read old, write new, clear pending) constitutes the authority rotation. Either all three writes commit OR all three revert (Anchor transactional atomicity). **Verified by inspection.**

### INV-B1-2: Pending fields cleared only via take() or explicit reset

`pending_authority` is cleared at L336 in accept_authority. `pending_treasury/ops/fee_bps_*` are cleared via `take()` at L257-268 in apply_config_update. `pending_config_ts` is reset to 0 at L281.

**No other write paths exist** for pending fields. (Verified via grep across v2/lib.rs.) The `take()` pattern is correct — atomically reads-and-clears.

### INV-B1-3: Distinctness invariant always restored post-apply

Both apply_config_update (L272-278) and accept_authority (L340-341) re-validate that `authority`, `treasury`, `ops` are pairwise distinct. If the invariant would be broken, the TX reverts. **The on-chain state can never be in an invariant-broken state visible to subsequent instructions.**

### INV-B1-4: Fee cap never exceeded post-apply

Post-apply check at apply_config_update L276 uses widening to u32: `(cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32`. Since both fields are u16 ≤ 65535, sum is at most 131,070 — well within u32::MAX. The cap of 1000 is the binding constraint. **Verified safe.**

### INV-B1-5: pending_config_ts sentinel = 0 means "no pending"

L281 writes 0 after apply. L248 gates on `pending_config_ts > 0`. Solana's `Clock::unix_timestamp` returns a positive i64 (post-1970), so `0` is a safe sentinel. **No legitimate timestamp could be 0.**

### INV-B1-6: GlobalConfig SPACE matches struct serialization

SPACE constant = 231 bytes. Computed at L1162-1169 as: 8 + 96 + 4 + 2 + 33 + 66 + 6 + 16 = 231. Cross-checked against field byte sizes in the struct at L1118-1146. **Verified correct.**

### INV-B1-7: migrate_config preserves live data

The zero-fill at L233-235 only touches bytes ≥ `current_size`. Bytes [0..current_size] retain their pre-migration values (discriminator, authority, treasury, ops, fee_bps, is_paused, bump). **Verified by inspection** — the `skip(current_size)` is the load-bearing call.

---

## Bundle 1 Risk Assessment

### What Bundle 1 fixes

| Prior finding | Resolution status |
|---|---|
| H001 (one-step authority transfer) | **RESOLVED**: propose_authority + accept_authority is 2-step. New key MUST sign to claim. Single-key compromise no longer = instant takeover. |
| H028 (BPS rotation surface on v2) | **PARTIALLY MITIGATED**: 24h timelock + ConfigProposed event gives off-chain monitors a defensive window. Per-match snapshot still protects in-flight. |
| Off-chain visibility into governance changes | **RESOLVED**: 4 new events (ConfigProposed, ConfigApplied, AuthorityProposed, AuthorityAccepted) cover the full governance lifecycle. |
| Liveness concern (proposer goes dark) | **RESOLVED**: apply_config_update is permissionless after timelock. |

### What Bundle 1 does NOT fix

| Carry-forward issue | Status |
|---|---|
| H044 (L1 + L2 same hot wallet) | UNCHANGED. Bundle 1 is L2-only. |
| H046 (no multisig wired up) | UNCHANGED. Bundle 1 *supports* multisig migration but does not perform it. |
| Permanent key loss = brick | UNCHANGED. No `close_config` or `recover_authority` instruction. |
| Settle/winner-selection trust | UNCHANGED. Authority still picks winners. |
| Layer-1 upgrade has no governance | UNCHANGED. Out of scope for Bundle 1. |

### New attack surface introduced

| Finding | Severity | Description |
|---|---|---|
| F-N1: Timelock reset DoS | HIGH | Repeated update_config calls reset pending_config_ts; defeats 24h visibility window |
| F-N2: migrate_config on mainnet | HIGH | Devnet-intended ix may ship to mainnet; risk depends on deploy procedure |
| F-N3: migrate_config no event | LOW | Forensic visibility gap |
| F-N4: No explicit cancel_proposal | MEDIUM | Cancel must be done via re-propose (counterintuitive); F-N5 below |
| F-N5: No cancel for pending config | MEDIUM | Once proposed, only apply or another propose; cannot withdraw without applying *something* |
| F-N6: apply_config_update not pause-gated | MEDIUM | Attacker can race a pre-pause proposal through apply post-pause |
| F-N7: accept_authority doesn't check pending_treasury | MEDIUM | If treasury rotation is also pending, new authority may collide; surfaces at apply |
| F-N8: propose_authority no distinctness check at propose | LOW | New key may equal treasury/ops; surfaces at accept |
| F-N9: Unpause has no visibility timelock | LOW | Recovery from pause is instant; defender has no window |

### Production-readiness verdict

**Bundle 1 is a meaningful security improvement over the pre-Bundle-1 v2 (and over v1).** The propose/accept rotation for authority closes H001 with the standard two-step pattern. The 24h timelock + permissionless apply for config changes is the correct primitive for off-chain monitoring + liveness.

**However, Bundle 1 has unresolved governance gaps that should be addressed before mainnet:**

1. **F-N1 (HIGH)**: The pending_config_ts unconditional reset undermines the 24h timelock's defensive intent. **Fix recommended pre-mainnet.**
2. **F-N2 (HIGH)**: migrate_config must be removed or feature-gated for mainnet. **Operational concern.**
3. **F-N6 (MEDIUM)**: apply_config_update should respect pause. **Easy fix: one constraint added.**

These are not blocking for the V1 mainnet scope per project documentation (no external audit, Bundle 1 hardening required) — but **at minimum, F-N1 and F-N2 should be resolved before live SOL wagering at mainnet scale.**

If Squads is wired up to `config.authority` from day one (per the planned migration), several of these concerns become operational rather than security-critical. Squads' own multisig logic adds a defense-in-depth layer that the Bundle 1 primitives alone do not.

---

## Prior-Finding Status

| ID | Prior Severity | Status in Bundle 1 | Notes |
|---|---|---|---|
| **H001** (one-step authority transfer) | CRITICAL | **RESOLVED** | propose_authority + accept_authority delivers the 2-step pattern. New key must sign to claim. Single-key compromise no longer enables instant takeover (attacker must also control the new key). **Confirmed RESOLVED.** |
| **H028** (BPS rotation on v2) | HIGH | **PARTIALLY MITIGATED** | 24h timelock + ConfigProposed event provides off-chain detection window. Per-match snapshot continues to protect in-flight. Still requires off-chain monitor to detect + react. Mitigation strength is bounded by F-N1 (timelock reset). |
| **H044** (L1 + L2 same hot wallet) | HIGH | **CARRY-FORWARD** | Bundle 1 does not modify L1. Squads-from-day-one plan addresses this at mainnet deploy. **Status unchanged.** |
| **H046** (no multisig wired up) | HIGH | **CARRY-FORWARD** | Bundle 1 *supports* multisig migration via propose/accept primitives. Squads itself not yet deployed. **Status unchanged.** |
| **H042** (no close_config path) | MEDIUM | **CARRY-FORWARD** | Bundle 1 does not add a close path. GlobalConfig remains immortal. Permanent key loss + no recovery instruction means the config is forever pegged to its last authority. Bundle 1 does not regress; does not improve. **Status unchanged.** |
| **H022** (GlobalConfig re-init) | NOT_VULNERABLE | **STILL NOT VULNERABLE** | Anchor `init` constraint at L820-826 prevents re-init. Bundle 1 doesn't change this. Confirmed. |
| **H007** (v1 cancel-when-paused) | HIGH (v1 only) | **N/A** for v2 | v2 pause does not block cancel by design. Bundle 1 inherits the v2 design. Confirmed. |

---

## New Findings

### F-N1 — Pending timestamp reset DoS (HIGH)

**Location**: programs/solshot-escrow-v2/src/lib.rs:154

**Issue**: `cfg.pending_config_ts = now` is written unconditionally at the end of every `update_config` call. There is no check whether a prior proposal is pending. A compromised authority (or even a confused honest authority) can repeatedly call `update_config` to perpetually defer the 24h timelock from elapsing.

**Attack path**:
1. T0: Attacker proposes malicious treasury via update_config. pending_config_ts = T0. ConfigProposed emitted.
2. Off-chain monitor detects, alerts operator. Operator begins 24h response.
3. T0 + 23h59m: Attacker calls update_config(new_fee_bps_treasury = 500) (irrelevant value). pending_config_ts = T0 + 23h59m. New ConfigProposed emitted with updated applies_at.
4. apply_config_update would now require waiting until T0 + 47h59m. Operator's response window has been silently doubled.
5. Repeat indefinitely. The malicious treasury proposal is **still pending** and the timelock is **always 24h away**.

**Mitigation options**:
- (A) Only reset `pending_config_ts` if it was 0 (first proposal starts the clock; subsequent edits do not):
  ```rust
  if cfg.pending_config_ts == 0 {
      cfg.pending_config_ts = now;
  }
  ```
- (B) Add a dedicated `cancel_pending_config` instruction that resets pending_* fields and pending_config_ts = 0. Apply-eligible only by authority signature.
- (C) Per-field timelocks (more state, more complex; not recommended).

**Recommendation**: (A) is the minimal fix and aligns with the documented intent of the 24h window.

**Severity**: HIGH. The 24h timelock is the core defensive primitive Bundle 1 added; this finding undermines its intent for malicious-authority scenarios.

---

### F-N2 — migrate_config will ship to mainnet bytecode (HIGH)

**Location**: programs/solshot-escrow-v2/src/lib.rs:184-239, 856-871

**Issue**: The migrate_config instruction is documented as devnet-only (L181-183) and intended for removal before mainnet. However, per V1 mainnet scope (project_v1_mainnet_scope.md), v2 is the mainnet target. Without a separate pre-mainnet rebuild that excludes migrate_config, the instruction will be in mainnet bytecode.

**Risk**:
- On a properly-initialized mainnet config (231 bytes from genesis), migrate_config returns Ok at the idempotency check L205. No semantic effect.
- BUT: the authority signature check at L197 runs first. An attacker without authority cannot exploit this.
- The instruction is in bytecode, which increases attack surface for inspector-grade analysis. Future bytecode upgrades that change the GlobalConfig struct shape (e.g., add more pending fields) would need to consider interaction with this migration path.

**Mitigation**:
- (A) Add `#[cfg(feature = "devnet")]` gates around the instruction handler AND the context struct. Build with `--features devnet` for devnet; omit for mainnet.
- (B) Remove migrate_config + MigrateConfigUnchecked entirely; ship a separate mainnet-only build.

**Recommendation**: (A) is operationally cleaner. (B) is a clean cut.

**Severity**: HIGH if not addressed before mainnet deploy. The actual exploit value of an on-mainnet migrate_config is low (only authority can invoke; no-op if already migrated), but it's still dead code in production bytecode. The mainnet deploy procedure MUST include a step that confirms migrate_config is gated out.

---

### F-N3 — migrate_config emits no event (LOW)

**Location**: programs/solshot-escrow-v2/src/lib.rs:184-239

**Issue**: Unlike every other governance instruction in Bundle 1, migrate_config has no `emit!()` call. A successful migration is observable only via implicit signals (account data length change).

**Mitigation**: Add `emit!(ConfigMigrated { authority, old_size, new_size })` at the end of the instruction body.

**Severity**: LOW. Operationally a forensic gap, not a security issue.

---

### F-N4 — No explicit cancel_authority_proposal instruction (MEDIUM)

**Location**: programs/solshot-escrow-v2/src/lib.rs:302-318

**Issue**: To cancel a pending authority proposal, the current authority must call `propose_authority(current_authority_key)` — effectively a self-proposal. This works (the overwrite is documented), but:

1. It's counterintuitive: cancellation is achieved by proposing the no-op identity.
2. The pending_authority field is left as `Some(current)` after the cancel, not `None`. A monitor seeing `pending_authority = Some(X)` would need to compare against `cfg.authority` to determine whether this represents an "active" proposal or a cancellation marker.
3. The emit log shows AuthorityProposed with `pending: current, replaced_pending: Some(prior)` — the cancel is visible but requires inference.

**Mitigation**: Add an explicit `cancel_authority_proposal` instruction:
```rust
pub fn cancel_authority_proposal(ctx: Context<CancelAuthorityProposal>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    let prior = cfg.pending_authority.take();
    emit!(AuthorityProposalCancelled { current: cfg.authority, cancelled_pending: prior });
    Ok(())
}
```
With `has_one = authority` gate.

**Severity**: MEDIUM. Operational clarity issue; current mechanism works but is fragile under audit.

---

### F-N5 — No cancel for pending config (MEDIUM)

**Location**: programs/solshot-escrow-v2/src/lib.rs:115-168

**Issue**: Once `update_config` proposes pending fields, the only way to clear them is:
- Wait 24h + permissionless apply (applies the changes).
- Call update_config again to modify pending values (but cannot clear individual fields; can only set new values).

**There is no way to fully RETRACT a proposed change.** Combined with F-N1 (timelock reset), a malicious authority can keep a malicious proposal "live but never applied" indefinitely.

**Subtler scenario**: an honest authority proposes a change, then realizes the proposal contains a typo (e.g., wrong treasury pubkey). They cannot retract the proposal — they can only call update_config(new_treasury = different_value) to override.

But: what if they don't want to apply ANY change? They proposed treasury, now want to leave treasury alone. There's no way to set `cfg.pending_treasury = None` without applying.

**Workaround**: Call `update_config(new_treasury = Some(cfg.treasury))` — proposing the current value as the new value. After 24h, apply makes treasury equal to itself (no-op). But this still applies, runs through the validation, etc.

**Mitigation**: Add a `cancel_pending_config` instruction that clears all pending_* fields and sets pending_config_ts = 0. Gated by `has_one = authority`.

**Severity**: MEDIUM. Operationally clunky; not a direct security hole but compounds with F-N1.

---

### F-N6 — apply_config_update not pause-gated (MEDIUM)

**Location**: programs/solshot-escrow-v2/src/lib.rs:877-888 (ApplyConfigUpdate context)

**Issue**: The ApplyConfigUpdate context does NOT have a `constraint = !config.is_paused`. A pending config change can be applied even while the program is paused.

**Attack path** (combined with F-N1):
1. T0: Attacker compromises authority. Proposes malicious treasury. pending_config_ts = T0.
2. T0 + 12h: Detector raises alarm. Operator pauses program (compromised key is still active for the pause itself, or operator has key access too).
3. T0 + 24h: Attacker's bot calls apply_config_update. Pause does not block. Malicious treasury is now live.
4. Pause prevents new matches, but settle/cancel/reclaim are also pause-bypassed by v2 design. Any in-flight match can settle to the new (attacker-controlled) treasury... except: per-match snapshot protects in-flight from this. So the malicious treasury only hits NEW matches AFTER unpause.
5. So pause + this attack means: pause stops new business, but malicious treasury rotation completes. When unpause happens, all new matches use the attacker treasury.

**Mitigation**: Add `constraint = !config.is_paused @ EscrowError::ProgramPaused` to the ApplyConfigUpdate context's `config` account.

**Severity**: MEDIUM. The attack assumes the operator is racing against the attacker's bot. With Squads multisig, this race is moot. But for the V1 mainnet posture (single-key authority pre-Squads), this is a real gap.

---

### F-N7 — accept_authority does not validate against pending_treasury/ops (MEDIUM)

**Location**: programs/solshot-escrow-v2/src/lib.rs:340-341

**Issue**: The post-swap distinctness check at accept_authority L340-341 only compares the new authority against the LIVE `cfg.treasury` and `cfg.ops`. It does NOT compare against `cfg.pending_treasury` or `cfg.pending_ops`.

**Scenario**:
1. Current authority proposes a NEW authority K via propose_authority(K).
2. Same authority proposes treasury rotation: update_config(new_treasury = K). pending_treasury = Some(K), pending_config_ts = now.
3. K calls accept_authority. Post-swap: cfg.authority = K, cfg.treasury = OLD (still). L340 checks `K != cfg.treasury (OLD)` — passes if K != old treasury.
4. 24h later, apply_config_update fires. Post-apply: cfg.treasury = K. cfg.authority = K (from step 3). Post-apply distinctness check at L272 fires: `cfg.authority != cfg.treasury` → K != K → FALSE → revert.

So the apply REVERTS, preserving the invariant. **Good — defense in depth works.**

However: the pending_treasury proposal is now STUCK. apply_config_update keeps reverting. The only way out is:
- Authority (now K) rotates back via propose_authority + accept_authority (back to a non-K key).
- OR: update_config(new_treasury = something_else) to overwrite the pending value.
- OR: another rotation cancels first.

This is recoverable but ugly. **A cleaner fix** is to have accept_authority check against pending values too:

```rust
let eff_treasury = cfg.pending_treasury.unwrap_or(cfg.treasury);
let eff_ops = cfg.pending_ops.unwrap_or(cfg.ops);
require!(cfg.authority != eff_treasury, EscrowError::InvalidConfig);
require!(cfg.authority != eff_ops, EscrowError::InvalidConfig);
```

This would prevent the accept from succeeding if it would create a future apply collision.

**Severity**: MEDIUM. The on-chain invariant is preserved (apply reverts), but the operational state is awkward and not immediately obvious to off-chain monitors.

---

### F-N8 — propose_authority skips distinctness check (LOW)

**Location**: programs/solshot-escrow-v2/src/lib.rs:302-318

**Issue**: `propose_authority(K)` only checks `K != Pubkey::default()`. It does NOT check that K is distinct from treasury, ops, or even the current authority.

This is **intentional** per the comments — the actual identity check happens at accept_authority (L340-341). However, a malicious authority could propose treasury or ops as the new authority, deferring the failure to accept time.

**Verdict**: not exploitable on its own (the proposal is just data; accept is the binding step). Filed for completeness.

**Severity**: LOW. Self-corrects at accept.

---

### F-N9 — Unpause has no observability delay (LOW)

**Location**: programs/solshot-escrow-v2/src/lib.rs:362-368

**Issue**: After pausing for emergency response, the operator can immediately unpause. No timelock, no event-delay. An attacker who somehow got the pause to flip could immediately unpause too.

In practice, both pause and unpause require authority signature, so an attacker controlling the authority key can do whatever they want. The observability gap is more about giving the operator's monitoring infrastructure time to react to a state change.

**Severity**: LOW. Pause emits a Paused event (L355-357) and unpause emits Unpaused (L364-366), so off-chain monitors CAN detect both. The "delay" recommendation is more about UX for incident response than a security gap.

---

## Cross-Focus Handoffs

### → Access Control auditor (01)

- **H001 status**: This audit confirms H001 is RESOLVED via Bundle 1's propose_authority + accept_authority. **Please cross-validate** that no other instruction in v2 grants authority-equivalent privileges that bypass the 2-step flow.
- **AcceptAuthority context** (L907-917) is the only mutating context in the program WITHOUT `has_one = authority`. The identity check is entirely in the body (L329-332). **Please confirm there is no path to bypass the body check via account substitution.** Per my analysis, the seeds + bump on config bind it to the singleton PDA, so no fake config can be passed.
- **ApplyConfigUpdate context** (L877-888) is also `has_one`-less but uses Anchor's `Account<GlobalConfig>` deserialization — full borsh validation. If migrate_config produced malformed bytes, this would surface here. **Please confirm.**

### → Arithmetic auditor (02)

- **Fee cap widening**: confirmed safe per inv-B1-4. `(u16 + u16) as u32` cannot wrap; bounded by MAX_FEE_BPS = 1000.
- **checked_add timelock**: L163 (propose-time event) and L252-253 (apply-time gate). Both correctly use `checked_add(...).ok_or(ArithmeticOverflow)?`. At max `now = i64::MAX`, the add overflows and reverts. Solana clock is post-1970, so this is never hit in practice. **Confirmed safe.**
- **migrate_config rent math**: L212 `checked_sub` cannot underflow because the if-branch at L211 guarantees `current_balance < new_minimum`. **Confirmed safe.**

### → State Machine auditor (03)

- **Pause coverage map for Bundle 1 instructions**: 
  - update_config: NO pause gate (correct — admin must remain callable during pause)
  - migrate_config: NO pause gate (correct — one-shot recovery)
  - apply_config_update: NO pause gate (**F-N6 — should gate**)
  - propose_authority: NO pause gate (correct — recovery scenarios)
  - accept_authority: NO pause gate (correct — recovery scenarios)
  - pause_program / unpause_program: NO pause gate on themselves (correct — idempotent)
- The pending state machine has no state enum — it's purely "pending fields populated or not." No transitions to model beyond `pending_config_ts > 0` vs `= 0`.

### → CPI / External auditor (04)

- migrate_config makes ONE CPI call: `system_program::transfer` for rent top-up at L214-223. `from: auth_info` (authority pays). `to: config_info` (the PDA being grown). Standard pattern; no PDA signer needed because the authority is signing as a regular wallet.
- No other Bundle 1 instruction makes any CPI.

### → Token / Economic auditor (05)

- **Fee BPS rotation flow now has 24h visibility window** via the propose/apply pattern. The economic surface from prior audit (BPS ratchet to 10%) is unchanged in magnitude (still capped at 1000 BPS), but the attack now requires either:
  - 24h of attacker control + permissionless apply working in their favor
  - OR: F-N1 reset attack to keep proposal stale-but-active
- **Per-match snapshot still protects in-flight**. Bundle 1 does NOT change the snapshot mechanism. Confirmed unchanged at L425-428.
- **No new economic surface**: Bundle 1 instructions move no lamports except the migrate_config rent top-up (which is the authority paying for their own config account).

### → Timing & Ordering auditor (06)

- **CONFIG_TIMELOCK_SECS = 24h** is the only new timing primitive.
- **Edge case at apply boundary**: L255 uses `>=` (not `>`). If `now == earliest`, apply succeeds. This is a 1-second edge that the propose-time off-chain monitor must respect.
- **F-N1 reset attack** undermines this timelock when authority is malicious. **Please cross-validate** the math: `now + CONFIG_TIMELOCK_SECS` at L163 and `pending_ts + CONFIG_TIMELOCK_SECS` at L253. Both checked_add. Safe.
- **No interaction with match-lifecycle deadlines**. Bundle 1 instructions read only `Clock::get()?.unix_timestamp` for governance purposes.

---

## Production-Readiness Paragraph

**Bundle 1 delivers the structural primitives needed to close H001 and provide a 24h defensive window against malicious config changes.** The propose/accept authority rotation is correctly atomic. The propose/apply config flow with permissionless apply is well-architected for both monitor-and-react defense AND liveness preservation. The migrate_config instruction correctly handles the v2 pre-Bundle-1 → Bundle 1 size growth with idempotency, authority verification via raw bytes, and proper zero-fill of new Option/i64 fields.

**However, Bundle 1 is not yet mainnet-ready as a complete governance layer.** Three issues need attention before high-stakes mainnet operation: (1) **F-N1 (timelock reset DoS)** is the most concerning — it undermines the 24h timelock's defensive intent and is easily exploited by a malicious authority. Fix is one-liner. (2) **F-N2 (migrate_config on mainnet)** requires an operational gate or feature-flag before deploy. (3) **F-N6 (pause not blocking apply)** is a defense-in-depth gap that should be a single-constraint fix. With these three addressed and the Squads-from-day-one plan executed, Bundle 1 combined with multisig governance would be a robust mainnet posture. As-is, it is **significantly better than v1 + pre-Bundle-1 v2**, suitable for the V1 mainnet scope's "Bundle 1 hardening required" bar, but warrants the three fixes before scaling.
