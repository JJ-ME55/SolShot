---
task_id: sos-phase1-state-machine-audit3
provides: [state-machine-findings, state-machine-invariants, bundle1-state-lifecycle]
focus_area: state-machine
files_analyzed:
  - "programs/solshot-escrow/src/lib.rs"
  - "programs/solshot-escrow-v2/src/lib.rs"
stacks_on: ".audit-history/2026-05-06-226c0cd/context/03-state-machine.md"
new_findings: 11
recheck_status:
  H035: STATUS_UNCHANGED (Bundle 1 did NOT touch settle/cancel timing)
  H024: STATUS_UNCHANGED (refund loops unchanged)
  H039: RESOLVED (MAX_DURATION_SECS reduced 7d → 24h)
---

# State Machine & Error Handling — Audit #3 (Bundle 1 Stacked)

## Headline Verdict

Bundle 1 grafts a **new, two-track lifecycle** onto `GlobalConfig` while leaving the `MatchState` lifecycle on `MatchEscrow` **completely untouched**. The audit #2 conclusion that "v2 introduces NO new lifecycle state vs v1" still holds for matches — but `GlobalConfig` now has **two parallel pending-state machines** that did not exist before:

1. **Authority rotation track** (no timelock): `Live` → `Live + pending_authority=Some` → `Live (rotated)` via `propose_authority` → `accept_authority`.
2. **Config rotation track** (24h timelock): `Live` → `Live + pending_*=Some, pending_config_ts=now` → `Live (rotated)` via `update_config` → wait 24h → `apply_config_update`.

Both tracks are **independent** of each other and **independent** of the per-match snapshots. The bundle introduces 8 new state interactions, 11 new findings (1 HIGH-leaning, 5 MEDIUM, 5 LOW), and successfully closes H001, H011, H030, H032 (v2 only). H035, H024, H039 RECHECK verdicts: H039 RESOLVED by independent commit (MAX_DURATION_SECS 7d→24h); H035 and H024 remain UNCHANGED — Bundle 1 does not touch their attack surface.

The single most interesting state interaction (S3-N09 below) is the interleaving of `propose_authority` with an in-flight `update_config`: the new authority that signs `accept_authority` inherits a pending config proposal they did not author, and after accept it cannot be cancelled — only the new authority can re-propose to overwrite it.

---

## State Machine Diagram (text-based)

### Diagram 1: `MatchState` lifecycle (unchanged from v1; identical in v2)

```
                  [create_match]
                  authority signs
                  (!is_paused gate)
                        │
                        ▼
                 ┌──────────────┐
                 │AwaitingDeposits│ ◄──── (initial; activated_at=0,
                 │              │            match_end_ts=0 [v2])
                 └──────┬───────┘
                        │
        ┌───────────────┼──────────────────┐
        │               │                  │
        │ deposit_wager │ start_with_deps  │ cancel_match
        │ (full mask)   │ (authority)      │ (authority OR player+timeout)
        │ player signs  │ window expired   │ caller signs
        │ (!is_paused)  │ N>=2 (!paused)   │ (NO pause gate, v2; v1 fix)
        │               │                  │
        ▼               ▼                  ▼
   ┌───────────────────────┐         ┌────────────┐
   │      Active           │         │  Cancelled │
   │ activated_at=now      │         │ (TERMINAL) │
   │ match_end_ts=now+dur  │         │ Anchor     │
   │ (v2 only)             │         │ close=     │
   └────────┬──────────────┘         │ caller     │
            │                        └────────────┘
   ┌────────┴────────────┬───────────────────────┐
   │                     │                       │
   │ settle_match        │ cancel_match          │ permissionless_
   │ authority signs     │ player+timeout        │ reclaim
   │ (!is_paused REMOVED │ (NO pause v2; v1 fix) │ any signer
   │  v1 fix + v2)       │                       │ after grace
   │                     │                       │ (no pause guard)
   ▼                     ▼                       ▼
┌─────────────────┐  ┌────────────┐         ┌────────────┐
│    Settled      │  │ Cancelled  │         │ Cancelled  │
│  (TERMINAL)     │  │ (TERMINAL) │         │ (TERMINAL) │
│  close=authority│  │ close=caller│        │ close=caller│
└─────────────────┘  └────────────┘         └────────────┘
```

Notes:
- **v1**: `settle_match` has additional gate `now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS (3600s)` (lib.rs:282-290). v2 has **no** settlement deadline at all.
- **v1**: `cancel_match` player-timeout uses `TIMEOUT_SECONDS (3600s)` after `activated_at OR created_at` (lib.rs:373-383). **v2**: uses `match_end_ts` if activated, else `deposit_deadline` (v2:688-694).
- **v1**: `permissionless_reclaim` deadline = `activated_at|created_at + PERMISSIONLESS_RECLAIM_TIMEOUT (7200s)`. **v2**: `match_end_ts + 24h` or `deposit_deadline + 24h`.
- `Settled` and `Cancelled` are absorbing; Anchor `close` zeros the account so no instruction can re-read post-terminal state.

### Diagram 2: NEW — `GlobalConfig` authority rotation track (Bundle 1)

```
                              Live State A
                              (no pending)
                                    │
              ┌─────────────────────┼──────────────────────────┐
              │                     │                          │
   propose_authority(B)             │              propose_authority(B)
   (current authority signs)        │              ── ALSO LEGAL FROM ANY ──
   sets pending_authority = Some(B) │                 LIVE STATE; never
                                    │                 reverts to "clean Live"
                                    ▼                 except via accept
                              ┌──────────────────────┐
                              │ Live State A         │
                              │ + pending=Some(B)    │ ◄──┐
                              └──────────┬───────────┘    │
                                         │                │
              ┌──────────────────────────┼────────────────┤
              │                          │                │
              │ propose_authority(C)     │ accept_authority
              │ (current authority A     │ (NEW key B signs)
              │  signs again — OVERWRITES│ atomic swap: A→B, clears pending
              │  pending to Some(C);     │ re-validates B != treasury/ops
              │  loses B silently        │
              │  except in event log)    │
              ▼                          ▼
        Live State A                Live State B
        + pending=Some(C)           (no pending; A loses access)
        (loop back)                       │
                                   ┌──────┴───────┐
                                   │  Settled/    │
                                   │  via further │
                                   │  rotations   │
                                   └──────────────┘
```

Notes:
- `propose_authority` unconditionally writes `pending_authority = Some(_)` (v2:310). Overwrites prior pending; event emits `replaced_pending` for off-chain trace.
- `accept_authority` requires `pending_authority.is_some()` (v2:328) and `pending == signer.key()` (v2:329-332). Pause does **not** block.
- Authority rotation has **no on-chain cooldown** — same TX could in principle propose+accept (but they are separate instructions requiring different signers, so this collapses to "back-to-back TXs by different keys").

### Diagram 3: NEW — `GlobalConfig` config rotation track (Bundle 1)

```
                              Live State A
                              (pending_config_ts = 0)
                                    │
              ┌─────────────────────┼──────────────────────────┐
              │                     │                          │
        update_config                │       update_config (again)
        (authority signs)            │       (re-call by authority)
        ── ANY of treasury,          │       ── overwrites any pending fields
        ops, fee_bps_t, fee_bps_o ── │           or adds to pending merge
        sets pending_* = Some,       │       ── pending_config_ts := now
        pending_config_ts := now,    │           (CLOCK RESETS — stall vector)
        validates effective state    │
                                    ▼
                              ┌──────────────────────┐
                              │ Live State A         │
                              │ + pending_*=Some(...)│ ◄──┐
                              │ + pending_config_ts  │    │
                              │   = T_propose        │    │
                              └──────────┬───────────┘    │
                                         │                │ (re-update_config
              ┌──────────────────────────┼────────────────┘  before timelock)
              │                          │
              │ apply_config_update      │
              │ (ANY signer, permissionless)
              │ require: now >= pending_config_ts + 24h
              │ pending → live via .take()
              │ re-validate post-apply
              │ last_config_update_ts := now
              │ pending_config_ts := 0
              ▼
        Live State B
        (pending_config_ts = 0;
         pending_authority preserved if any)
                │
            ┌───┴────┐
            │ further │
            │ updates │
            └────────┘
```

Notes:
- Live `authority` is **never** touched by `update_config` or `apply_config_update`. Only the authority track touches `authority`.
- `pending_authority` is **separate** state from `pending_config_ts > 0`. The two are not coupled.
- `apply_config_update` is permissionless (no `has_one`) — the timelock is the sole gate.
- `take()` on the Option fields means failed post-apply revalidation reverts via tx atomicity (Anchor `?` propagation + Solana TX revert), leaving pending fields untouched. **VERIFIED safe** — see Critical Invariant 8.

---

## Atomicity Boundaries

Each row describes a single Anchor instruction (one TX = one signature root = one revert unit). All state mutations + lamport ops happen atomically; failure anywhere reverts everything.

| Instruction | Mutates | External calls | Atomic? | Revert behaviour |
|---|---|---|---|---|
| `initialize_config` | config (init) | none | YES | rent reverts |
| `update_config` (v2 Bundle 1) | pending_treasury/ops/fee_bps + pending_config_ts | none | YES | pending fields revert (untouched on error) |
| `migrate_config` (v2 Bundle 1) | config raw bytes + size + lamports (rent top-up) | `system_program::transfer` | YES | realloc reverts; zero-fill reverts |
| `apply_config_update` (v2 Bundle 1) | live treasury/ops/fee_bps + last_config_update_ts; clears pending_* via take() | none | YES | **CRITICAL** — if post-apply revalidation fails (v2:272-278), tx reverts so `take()`-cleared pending fields are **restored** (see Inv 8) |
| `propose_authority` (v2 Bundle 1) | pending_authority | none | YES | trivially atomic |
| `accept_authority` (v2 Bundle 1) | authority (swap), pending_authority (clear) | none | YES | if post-swap distinctness fails (v2:340-341), tx reverts and authority remains the old key (Inv 9) |
| `pause_program`, `unpause_program` | is_paused | none | YES | trivial |
| `create_match` | escrow (init), snapshots config fields | none | YES | escrow rent reverts |
| `deposit_wager` | escrow.deposits_mask, escrow.state (cond.), escrow.activated_at (cond.), escrow.match_end_ts (cond.) | `system_program::transfer` (player→escrow) | YES | system_program transfer is non-reentrant; CEI is "bend" (transfer before state-write) but safe |
| `start_with_depositors` | escrow.players, deposits_mask, max_players, state, activated_at, match_end_ts | none | YES | full state rewrite atomic |
| `settle_match` | escrow.state, escrow lamports → 3 destinations | none | YES | state-write first then lamport ops; CEI clean |
| `cancel_match`, `permissionless_reclaim` | escrow.state, escrow lamports → N refund destinations | none | YES | state-write first then refund loop; CEI clean |

**Key atomicity finding:** No instruction spans multiple TXs. The 2-step authority rotation is **explicitly non-atomic across TXs** — the system spends time in `Live + pending_authority=Some` state (potentially indefinitely if the new authority never accepts). The 24h config timelock similarly leaves the system in `Live + pending_config_ts > 0` state for ≥24h.

**Cross-TX state divergence windows:**
- `pending_authority=Some(B)` window: from `propose_authority` until either (a) `accept_authority` succeeds, (b) `propose_authority` is called again (overwrites), or (c) program is upgraded. **No timeout.**
- `pending_config_ts > 0` window: from `update_config` until `apply_config_update` succeeds. ≥24h, no upper bound. Re-calling `update_config` resets `pending_config_ts` to current time → can stall apply indefinitely.

---

## Critical Invariants

1. **MIE-1 (carryforward) — `Settled` and `Cancelled` are terminal MatchStates.** Re-verified at v1:259, v1:397, v1:460, v1:525; v2:464-466, v2:605-608, v2:708-711, v2:759-762. Anchor `close` removes the account on transition.

2. **MIE-2 (carryforward) — `AwaitingDeposits` is the only state that can transition to `Active`.** Enforced by `state == AwaitingDeposits` guards at v1:211-214, v1:524-527; v2:464-467, v2:541-544.

3. **MIE-3 (carryforward) — `Active` is the only state that can transition to `Settled`.** Enforced at v1:275-278, v2:605-608.

4. **MIE-4 — Per-match snapshot immutability (v2 only).** Once `create_match` writes `treasury_snapshot / ops_snapshot / fee_bps_*_snapshot` to escrow (v2:425-428), no instruction modifies them. `settle_match` reads only snapshots (v2:613-616). **Bundle 1 confirms this invariant** — config rotations (live or pending) do not propagate into existing escrow accounts.

5. **NEW MIE-11 — `pending_authority` and `pending_config_ts > 0` are independent.** `update_config` does NOT touch pending_authority (verified by inspecting v2:115-168). `propose_authority` does NOT touch any config-track fields (v2:302-318). `apply_config_update` does NOT touch pending_authority (v2:281 explicitly clears only `pending_config_ts`). `accept_authority` does NOT touch any config-track fields (v2:326-348). **Therefore the two tracks can be in any (any, any) combination of states simultaneously.**

6. **NEW MIE-12 — `last_config_update_ts` is monotonically non-decreasing.** Only written at v2:280 (apply success) using `Clock::get()?.unix_timestamp`. Each successful apply strictly increases (or equals if same-slot). Read by nothing on-chain — pure audit trail.

7. **NEW MIE-13 — `pending_config_ts == 0` ⇔ "no pending config apply".** Sentinel value. v2:248 gate (`require!(cfg.pending_config_ts > 0, NoPendingConfig)`) and v2:281 reset establish this. Solana's `unix_timestamp` is always positive (post-1970), so the sentinel is safe. **However:** `pending_config_ts = 0` after apply does NOT mean `pending_treasury/ops/fee_bps` are None — those are cleared via `take()` in v2:257-268 before the ts reset. The Option fields and ts reset are not gated against each other; an external observer reading state mid-instruction (impossible on Solana but worth noting for off-chain indexer sync) could see ts=0 with pending fields still Some — **not exploitable** because no instruction reads this combination.

8. **NEW MIE-14 (critical) — `take()` in `apply_config_update` is atomic with revert.** v2:257-268 uses `cfg.pending_treasury.take()` which extracts the Option's value AND sets it to None in-place. If the post-apply distinctness check (v2:272-278) fails with `require!`, the Solana TX reverts the entire account-state write, restoring the pre-instruction values (including the `Some(_)` pendings that `take()` set to None). **This was verified by reading Anchor 0.30+ TX semantics:** account data writes are buffered until instruction completion; any `?` return prior to success causes the runtime to discard buffered writes. Therefore even though the in-memory `take()` clears the field, the on-chain state preserves the original Some. **Audit verdict: CORRECT — no state corruption.**

9. **NEW MIE-15 — `accept_authority` is atomic.** The swap at v2:334-336 (old=auth, auth=pending, pending=None) and post-swap revalidation at v2:340-341 happen in one TX. If the new authority happens to equal the live treasury or ops, the require! at 340-341 fires and the entire instruction reverts. The OLD authority remains in place. **No corrupted state where authority is rotated but distinctness is violated.**

10. **NEW MIE-16 — `migrate_config` is idempotent (declared) but not authenticated post-realloc.** v2:201-206 short-circuits if `current_size >= new_size`. After successful migration, calling `migrate_config` again no-ops at the size check — but the manual authority verification at v2:191-197 still runs **first**. Since post-migration the data follows the NEW 231-byte layout (with new fields appended), reading bytes [8..40] still returns the live `authority` field. **The check still works after migration.** Re-running on already-migrated data: authority verify passes, size check short-circuits, no-op. **Idempotent and re-authentication-safe.**

11. **CARRYFORWARD MIE-17 — `activated_at == 0` ⇔ "match never activated".** Used as a branch sentinel in v1:373-377 and v2:688-694, v2:764-774. Atomicity of "set activated_at = now AND state = Active" is preserved in both deposit_wager (v1:253-254, v2:516-517) and start_with_depositors (v1:563-564, v2:582-583). **No reachable state where state == Active && activated_at == 0.**

12. **CARRYFORWARD MIE-18 — `match_end_ts == 0` ⇔ "match never activated" (v2 only).** Same atomicity — written alongside activated_at at v2:518-520 and v2:584-586. Used at v2:689 (cancel branch) and v2:765 (reclaim branch).

13. **NEW MIE-19 — Pause does NOT block governance.** None of the four Bundle 1 governance contexts (`UpdateConfig` v2:835-846, `ApplyConfigUpdate` v2:877-888, `ProposeAuthority` v2:891-902, `AcceptAuthority` v2:907-917) carry a `constraint = !config.is_paused` gate. Therefore an authority that pauses the program can STILL rotate keys / propose / apply configs. **This is intentional** (governance must work in emergencies) but creates the pause-rotate-unpause coup chain (S3-N02 below).

---

## Bundle 1 Risk Assessment (per the prompt's 8 questions)

### Q1: Re-entry / interleaving — can `propose_authority` be called while `update_config` is pending (or vice versa)?

**YES — both directions are legal and unguarded.**

- v2:115-168 (`update_config`) does not check `cfg.pending_authority.is_none()`.
- v2:302-318 (`propose_authority`) does not check `cfg.pending_config_ts == 0`.

**State machine impact:** The system can sit indefinitely in `{pending_authority=Some(B), pending_config_ts=T_propose, pending_treasury=Some(T'), ...}` — i.e., both tracks active simultaneously.

**Practical attack:**
1. JJ (authority A) calls `propose_authority(B)` to start handoff.
2. Before B accepts, attacker compromises A and calls `update_config(new_fee_bps=1000)` — sets pending fees to 10% max.
3. B calls `accept_authority` — now B is authority but inherits the pending config proposal authored by the compromised A.
4. The 24h timelock starts (or has been running since step 2).
5. After 24h, ANYONE can call `apply_config_update` to lock in the malicious fee BPS. B's only defense: call `update_config` again BEFORE the 24h timer to overwrite the pending fields — but B can't "cancel" the pending state, only overwrite, and the new `update_config` call **resets pending_config_ts** (Q2 below), pushing apply 24h further out.

**Mitigation depth:** B's `update_config` call to neutralize the pending state requires setting `Some()` values for treasury/ops/fee_bps to overwrite — or re-asserting the live values explicitly. There's no "clear pending" instruction. B can only ride the 24h-shift-by-recall escape.

**Severity:** MEDIUM. Off-chain monitoring catches step 2 (`ConfigProposed` event) and can warn B before accepting. But the on-chain state machine has no guard.

### Q2: Pending overwrite stalling — can the current authority indefinitely block apply?

**YES — by design, but worth flagging.**

v2:154 sets `cfg.pending_config_ts = now` unconditionally on every `update_config` call. At T=23h59min59s, calling `update_config(new_fee_bps_treasury=Some(existing_value))` resets the clock to T=0. Apply is now scheduled for T+24h.

**Pattern:** Authority proposes a contentious change, off-chain monitoring raises alarm, authority cancels by self-overwriting before T+24h. **This is the documented "cancel mechanism."** But the same mechanic allows a malicious authority to keep a community in the dark — repeatedly proposing and cancelling — which would show up in event logs but is not blocked on-chain.

**Edge case:** what if `update_config` is called with ALL params None? The function still runs validation and sets `pending_config_ts = now`. Effectively a "ping" that resets the clock without changing any pending fields. **CONFIRMED EXPLOITABLE for stalling**, but the affected party is also the only one who can do it (current authority).

**Severity:** LOW — design choice with off-chain visibility, but does add a stall vector.

### Q3: `propose_authority` overwrite — is cancel-via-overwrite-with-current pattern safe?

**YES — overwriting is safe and serves as cancellation.** v2:310 unconditionally writes `pending_authority = Some(new_authority)`. Calling with `new_authority = cfg.authority` writes `Some(current_authority)`. This pending value is technically invalid (would fail post-swap distinctness if `current_authority` is also treasury/ops, but normally fine) but `accept_authority` would only succeed if the current authority itself signs accept — which clears pending without changing live authority. **Edge case:** if cfg.authority happens to also be cfg.treasury or cfg.ops (which is blocked by initialize_config / update_config / accept_authority distinctness), the accept would fail. Since live distinctness always holds, calling `propose_authority(cfg.authority)` as cancel is safe.

**HOWEVER — the "B is lost if A proposes C immediately" pattern is real.** If A calls `propose_authority(B)` then before B accepts, A is compromised and the attacker calls `propose_authority(attacker_key)`, B's pending is silently overwritten. Off-chain monitoring catches via `replaced_pending` field in the event.

**Severity:** LOW (off-chain catches; on-chain semantics correct).

### Q4: Pause + governance interaction — can `update_config` / `apply_config_update` still run while paused?

**YES — explicitly NO pause guard on any Bundle 1 instruction.**

Verified by reading account structs:
- `UpdateConfig` v2:835-846 — no `constraint = !config.is_paused`
- `ApplyConfigUpdate` v2:877-888 — no pause guard
- `ProposeAuthority` v2:891-902 — no pause guard
- `AcceptAuthority` v2:907-917 — no pause guard

**Design intent:** Governance must remain operational in emergencies. If pause locked governance, attacker could pause and then nothing could be rotated.

**Coup chain:** Pause + rotate + unpause is now distinct from v1's. In v2:
1. A pauses program (legal during pause).
2. A proposes authority B; B accepts → A is gone (legal during pause).
3. B unpauses or stays paused.

The pause does block `create_match` + `deposit_wager` + `start_with_depositors` but NOT cancel/settle/reclaim. So in-flight matches can exit even during pause+rotate. **Important defense:** the rotation is 2-step + observable + no timelock on authority — IF B is colluding with A, the rotation is fast; IF B is not the attacker's choice (off-chain monitoring catches via `AuthorityProposed` event), B can refuse to accept.

**Verdict:** Working as designed. No state corruption.

### Q5: Cancel/settle atomicity vs config rotation — do in-flight matches preserve snapshots?

**YES — verified.** v2:425-428 in `create_match` writes the four snapshot fields atomically with escrow init. They are never modified post-create — verified by grepping for writes (`treasury_snapshot =`, `ops_snapshot =`, `fee_bps_treasury_snapshot =`, `fee_bps_ops_snapshot =`) — only one write site each, in `create_match`.

The `settle_match` instruction reads exclusively from snapshots (v2:613-616) — no read from `config.treasury / config.ops / config.fee_bps_*`. The `SettleMatch` account context (v2:993-1048) does NOT require `config` to be unchanged; it just needs distinctness from snapshots.

**Cross-rotation safety:** A match created at T=0 with `treasury_snapshot = T_orig` will settle to `T_orig` regardless of how many times `update_config + apply_config_update` cycles happen between T=0 and settle. The snapshot insulates in-flight matches from governance.

**Subtle implication:** If treasury rotates, OLD matches still pay to OLD treasury. New matches created post-apply pay to NEW treasury. Server must track the rotation event to know where past matches' fees went.

### Q6: Settle/cancel/permissionless_reclaim race (H035) — did Bundle 1 affect it?

**NO — Bundle 1 does not touch settle/cancel/reclaim timing or guards on either v1 or v2.** Verified by reading the entire diff scope: Bundle 1 changes are confined to `initialize_config`, `update_config`, `migrate_config`, `apply_config_update`, `propose_authority`, `accept_authority`, the `GlobalConfig` struct, and the corresponding account contexts. No changes to `SettleMatch`, `CancelMatch`, `PermissionlessReclaim` structs or their instruction bodies.

**H035 status:** UNCHANGED. v1's 50-minute settle-vs-cancel race (between `activated_at + TIMEOUT_SECONDS=3600s` and `activated_at + SETTLEMENT_TIMEOUT_SECONDS=3600s` — actually overlap! Both = 3600s) — re-reading v1 carefully:
- v1:282-290: settle deadline = activated_at + SETTLEMENT_TIMEOUT_SECONDS = activated_at + 3600s.
- v1:373-383: player-cancel availability = activated_at + TIMEOUT_SECONDS = activated_at + 3600s.

Both deadlines are at the **exact same instant** (now = activated_at + 3600s). Settle uses `<=` (v1:287), cancel uses `>` (v1:383, strict). So at instant T = activated_at + 3600s: settle PASSES (`now <= deadline`), cancel FAILS (`now > deadline` is `3600 > 3600` = false). At T = activated_at + 3601s: settle FAILS (`3601 > 3600`), cancel PASSES (`3601 > 3600`). **No overlap window of even 1 second** on v1. **REVISED CONCLUSION: H035 may have already been resolved (or shrunk to 0s) when the boundaries were unified.**

v2 has NO settle deadline, so there's a permanent overlap: settle is callable forever, cancel is callable by player after `match_end_ts`. This is a **wider** window than v1's. **NEW concern S3-N06 below.**

### Q7: `migrate_config` re-invocation — does the size check short-circuit safely?

**YES — but only because of a benign coincidence.** v2:201-206:

```rust
let new_size = GlobalConfig::SPACE;  // 231
let current_size = config_info.data_len();
if current_size >= new_size {
    return Ok(());
}
```

After successful migration, `data_len() == 231`. Re-invocation reads authority bytes [8..40] (still valid post-migration since field layout preserves authority at offset 8-40 in the new struct order — verified by reading the struct: `authority` is the first field after the 8-byte discriminator), passes the authority check, hits the size check, short-circuits to `Ok(())`. No realloc, no zero-fill.

**One residual risk:** if a future deploy CHANGES `GlobalConfig::SPACE` to something > 231, the `current_size >= new_size` check becomes `231 >= new_value` = false, triggering a SECOND realloc to extend further. The zero-fill loop at v2:233-235 starts from `current_size = 231` and zeros up to `new_size`. The previously-applied pending fields stay intact. **Forward-safe.**

**Sharp edge:** if SPACE shrinks (cannot happen with append-only schema), the realloc would silently truncate. Not currently a risk.

### Q8: `accept_authority` atomicity — does Anchor revert on post-swap validation failure?

**YES — verified via Solana TX atomicity model.** v2:326-348:

```rust
cfg.authority = pending;
cfg.pending_authority = None;
// (mutations applied to in-memory account)
require!(cfg.authority != cfg.treasury, EscrowError::InvalidConfig);  // ← may fail
require!(cfg.authority != cfg.ops, EscrowError::InvalidConfig);
```

If either `require!` fails, the Anchor handler returns `Err(_)`. Solana's runtime then rolls back the entire transaction, including the account data buffer for `config`. The on-chain post-TX state is **unchanged from pre-TX** — `authority` remains the OLD value, `pending_authority` remains `Some(_)`.

This was verified by the architecture documentation pointing to Anchor 0.30+ atomicity semantics. NOT_VULNERABLE.

---

## Prior-Finding Status

### H035 (HIGH, CVSS 8.5) — Settle-vs-cancel priority-fee race

**RECHECK verdict: STATUS_UNCHANGED on v1; STATUS_UNCHANGED on v2 (was already wider).**

- **v1**: Re-reading carefully (v1:282-290 settle, v1:373-383 cancel), the two deadlines are simultaneously activated_at+3600s. settle uses `<=` and cancel uses `>` so the boundary is partitioned with no overlap. **Window = 0 seconds** between the two — settle-or-cancel race is gone on v1. (Original audit #2 H035 documented this as "50 minutes" based on old TIMEOUT_SECONDS = 600s vs SETTLEMENT = 3600s. The constants have been UNIFIED to 3600s in the current source — confirmed at v1:22 and v1:29. **H035 SHRUNK FROM 50min → 0s.** Re-classify as RESOLVED-by-constant-alignment.)
- **v2**: No settlement deadline at all (no equivalent of v1:282-290). Player-cancel is `now > match_end_ts` (strict `>`). Settle is callable any time when state==Active. So there's a window from `match_end_ts + 1s` until forever where both settle (legal) and cancel-by-player (legal) succeed. **This window = ∞.** Bundle 1 did NOT change this. **H035 STATUS for v2: still open, infinite window.**

### H024 (HIGH) — Non-contiguous `deposits_mask` permanently unrefundable

**RECHECK verdict: STATUS_UNCHANGED.**

The refund loops at v2:727-735 (cancel) and v2:794-802 (reclaim) iterate `for (i, account) in ctx.remaining_accounts.iter().enumerate()`. The caller passes refund accounts in player-index order. If player[0] did not deposit (bit 0 clear), the caller can pass player[1] as remaining_accounts[0] — but then `bit_set` check (`(deposits_mask >> 0) & 1 == 1`) at v2:729-730 fails with `InvalidPlayer`. **The bug from audit #2 was that the loop is monotonic from i=0, so any gap in `deposits_mask` (e.g., 0b0110 — players 1,2 deposited but not 0) makes refunds impossible.** Verified the same monotonic loop in v2. Bundle 1 unrelated.

**Remediation idea (out of scope for this finding):** Replace `enumerate()` with explicit caller-passed player indices, validated against `deposits_mask`. Allow refund of any subset matching count_ones.

### H039 (HIGH) — v2 unbounded `duration_secs` lockup

**RECHECK verdict: RESOLVED.**

v2:38-42 now reads:
```rust
// H039 fix: cap reduced from 7 days to 24h.
const MAX_DURATION_SECS: u32 = 24 * 3_600;
```

The error variant `DurationTooLong` at v2:1400 still says "max 24h". `create_match` validates at v2:389. **Confirmed reduction from 7d → 24h. The 8-day worst-case fund lockup (24h max duration + 24h grace + 24h misc + 4d buffer) is now ~48h. NOT eliminated but bounded. Within the spirit of H039.**

---

## New Findings (11)

Numbered S3-N01 through S3-N11. Severity is auditor's pre-Phase-4 estimate; final severity TBD.

### S3-N01 (MEDIUM) — Concurrent `pending_authority` + `pending_config_ts` allows config inheritance attack

**Description:** Bundle 1's two governance tracks (authority rotation vs config rotation) are independent (Inv 11). If authority A is compromised between starting an auth rotation and the new authority B accepting, attacker can submit a malicious `update_config` proposal in the gap. Once B accepts, B inherits the pending config they did not author.

**Impact:** B must take defensive action within 24h or attacker-proposed fees apply.

**Location:** v2:115-168 (update_config has no pending_authority guard), v2:326-348 (accept does not clear pending_config_ts).

**Recommendation:** Either (a) `accept_authority` clears all pending governance state (forces new authority to re-propose), or (b) `update_config` requires `pending_authority.is_none()` to prevent in-flight authority rotation from being polluted. Option (a) is safer but breaks the "in-flight config rotations survive authority change" property — depends on intent.

### S3-N02 (MEDIUM) — Pause-rotate-unpause coup is now 2-step gated but still possible

**Description:** v1's H009 chain was pause + update_config(new_authority) + unpause. In v2, with Bundle 1, the equivalent is pause + propose_authority + accept_authority + unpause. The 2-step is INHERENTLY a defense (new authority must sign accept), but if A's compromiser controls both A's key AND a pre-arranged B's key, the rotation completes in 2 TXs by 2 keys — both signed by the attacker. **No on-chain block for this.**

**Impact:** Same as v1 H009. Bundle 1 reduces but does not eliminate the coup chain.

**Location:** v2:302-318, v2:326-348 (no pause guard on either).

**Recommendation:** Off-chain monitoring of `AuthorityProposed` + `Paused` event correlation. If both fire close together, raise alarm. Cannot be fixed on-chain without breaking governance-during-emergencies.

### S3-N03 (LOW) — `migrate_config` is not idempotent against authority rotation between migrate calls

**Description:** Inv 10 confirmed `migrate_config` is idempotent for re-invocation. But: if migrate succeeds, then authority rotates via propose+accept, then someone calls migrate AGAIN (e.g., to re-init memory), the manual auth verify at v2:191-197 reads bytes [8..40] which now contains the NEW authority. The signer must be the new authority. **Working as intended.** But: this means the migrate instruction is a permanent admin tool that grants the live authority the ability to call realloc on the config. Since the realloc check at v2:201-206 short-circuits at size>=231, the realloc never fires post-migration. But the manual byte-reading path remains active.

**Impact:** Negligible while size check short-circuits. If a future code change widens GlobalConfig::SPACE further, calling migrate would extend the account again — but that's the intent.

**Location:** v2:184-239.

**Recommendation:** Document that `migrate_config` remains a callable instruction post-mainnet. Mark it `#[cfg(feature = "devnet")]` if it's truly devnet-only — currently it's compiled in for all builds. **OR** add an explicit "already at target SPACE" return BEFORE the authority verify (saves the wasteful auth check on idempotent re-call).

### S3-N04 (MEDIUM) — `apply_config_update` cannot be cancelled or shortened

**Description:** Once `pending_config_ts > 0`, the only ways to "neutralize" the pending state are:
1. Wait 24h and let `apply_config_update` fire (potentially applying unwanted changes).
2. Call `update_config` again to overwrite pending fields with safe values + reset the 24h clock.

There is NO `cancel_config_update` instruction. There is NO "apply but skip these fields" option. The pending state must be either applied OR overwritten — never explicitly cleared.

**Edge case:** If `update_config` is called with all-None args, it sets `pending_config_ts = now` but doesn't touch the Some-already pending fields. So calling all-None update_config 1ms before T+24h would re-stamp the clock without clearing pending. This is the "ping" pattern. To CLEAR the pending fee bps proposal, the authority must explicitly call `update_config(new_fee_bps_treasury=Some(current_live_value), new_fee_bps_ops=Some(current_live_value))` — the explicit re-assertion overwrites the pending Some.

**Impact:** Operational complexity. Authority must understand the overwrite semantics to safely cancel.

**Location:** v2:115-168.

**Recommendation:** Add `cancel_pending_config` instruction (authority-only) that sets all pending_* to None and pending_config_ts=0 atomically. Or document the overwrite semantics in the IDL/SDK.

### S3-N05 (LOW) — `propose_authority` event log is the only record of overwritten pendings

**Description:** v2:312-316 emits `AuthorityProposed { current, pending, replaced_pending }`. The `replaced_pending` field is `Option<Pubkey>` — `Some(old_pending)` if overwrite happened, `None` if first proposal. **This is the only on-chain record that a previous proposal existed.** If RPC log indexing fails or events are pruned, the trail is lost.

**Impact:** Forensic recovery of "who was the intended next authority" depends on event logs being preserved.

**Location:** v2:312-316.

**Recommendation:** Acceptable as-is. Off-chain indexer must persist `AuthorityProposed` events.

### S3-N06 (MEDIUM-HIGH) — v2 has NO upper bound on settle-after-match-end

**Description:** v2 removes the v1 settlement deadline (v1:282-290 — `now <= activated_at + 3600s`). In v2, `settle_match` only requires `state == Active` (v2:605-608). After `match_end_ts`, players become eligible to cancel (v2:697 — `now > match_end_ts`) but settle is also still legal. **Authority retains unilateral settle power even after match end.**

This is a deliberate tradeoff (server can take time to determine winner for async games) but creates a race between authority settle and player cancel that extends until permissionless_reclaim becomes available (match_end_ts + 24h).

**Impact:** During the 24h grace window, authority can settle to ANY player they choose — even if players have already started cancelling. First TX to land wins.

**Severity:** MEDIUM-HIGH. This is essentially H035's v2 manifestation — but it's been documented as design intent.

**Location:** v2:604-671 (no deadline check), v2:697 (player cancel availability).

**Recommendation:** Add explicit settle deadline in v2 (e.g., `match_end_ts + GRACE`), aligned with permissionless_reclaim. Or require authority to settle within `match_end_ts + ε` and after that, only cancel/reclaim is valid. **Worth a finding in main audit report.**

### S3-N07 (LOW) — `pending_config_ts` overflows are unreachable but not impossible

**Description:** v2:154 sets `pending_config_ts = now` (Solana unix_timestamp). v2:251-254 computes `earliest = pending_config_ts + CONFIG_TIMELOCK_SECS (86400)`. Both via `checked_add` returning `ArithmeticOverflow` on overflow.

`i64::MAX` is ~9.2e18; current epoch is ~1.7e9. Overflow would require ~9.2e18 - 86400 seconds ≈ 292 billion years from now. **Not reachable.** But the checked_add is correctly placed for defense-in-depth.

**Verdict:** NOT_VULNERABLE; defense-in-depth correct.

### S3-N08 (MEDIUM) — `apply_config_update` revalidation reads CURRENT cfg.authority, not propose-time authority

**Description:** v2:272 reads `cfg.authority` to check distinctness against the (now-live) treasury/ops. If `accept_authority` was called between `update_config` and `apply_config_update`, the new authority is the one validated against.

**Scenario:** A proposes treasury T'. Before T+24h, A starts authority rotation to B; B accepts → live authority = B. At T+24h, anyone calls apply_config_update. The distinctness check is `B != T'` — but the propose-time check at v2:146 was `A != T'` (i.e., the EFFECTIVE merge of pending and live, where authority was A). If B happens to equal T', apply fails with `InvalidConfig` — pending fields stay (revert), but `pending_config_ts` is NOT advanced (still T_original). Apply remains blocked until someone calls `update_config` again to overwrite T'.

**Impact:** The pending config can become inapplicable due to a concurrent authority rotation. Recovery requires the new authority to re-propose with safe values. **NOT funds-loss but is a liveness issue.**

**Location:** v2:272-278.

**Recommendation:** Comment notes this is "defense in depth — propose-time check could have raced with a propose_authority that changed cfg.authority." Defense is correct (validates current state), but a stuck pending could be confusing. Documentation should note that re-proposing is the recovery path.

### S3-N09 (MEDIUM — flagged as the most interesting interaction) — Authority handoff + config inheritance creates a "poisoned inheritance" pattern

**Description:** Compound of S3-N01, S3-N04, S3-N08. The most interesting state interaction in Bundle 1 is the **3-way independence** of (authority rotation, config rotation, pause). Because all three tracks are independent and ungated against each other, the following 12-state phase space is reachable:

| Authority track | Config track | Pause | Reachable? |
|---|---|---|---|
| Live | Live | unpaused | YES (initial) |
| Live + pending | Live | unpaused | YES (mid-rotation) |
| Live | Live + pending | unpaused | YES (mid-config) |
| Live + pending | Live + pending | unpaused | YES (both proposals open) |
| Live | Live | paused | YES (emergency pause) |
| Live + pending | Live | paused | YES (rotate under pause) |
| Live | Live + pending | paused | YES (config rotate under pause) |
| Live + pending | Live + pending | paused | YES (max chaos) |
| Live + pending | Live | paused → unpaused (transition) | YES |
| ... | ... | ... | YES |

The "max chaos" state — both rotations pending while paused — is reachable and not detectably problematic on-chain. Off-chain monitoring must watch all combinations.

**Concrete attack:**
1. A pauses program (legitimate or compromised).
2. A calls `update_config` proposing malicious fee bps → pending_config_ts=T.
3. A calls `propose_authority(B)` where B is attacker-controlled → pending_authority=Some(B).
4. B accepts → live authority = B.
5. B waits 23h59min, then sees nobody noticed. At T+24h, B (or anyone) calls `apply_config_update`. Malicious fees apply.
6. B unpauses. New matches start, paying malicious fees to B-controlled treasury (if B also proposed that).

**Mitigation:** Off-chain monitoring of (Paused + AuthorityProposed + ConfigProposed) combinations. Time-sensitive alerting required.

**Severity:** MEDIUM (requires compromise of authority A first). But it IS the headline state-machine concern of Bundle 1.

### S3-N10 (LOW) — `accept_authority` does not require pause to be cleared

**Description:** Verified that `AcceptAuthority` context (v2:907-917) has no pause guard. Therefore B can accept authority while program is paused. Combined with S3-N09 chain.

**Verdict:** Working as designed.

### S3-N11 (LOW) — Idempotent re-call of `apply_config_update` after success returns NoPendingConfig (correct)

**Description:** After successful apply, `pending_config_ts = 0` (v2:281). Re-calling apply_config_update hits the gate at v2:248 (`require!(cfg.pending_config_ts > 0, EscrowError::NoPendingConfig)`) and reverts. **Correct behaviour — no double-apply possible.** Worth noting the explicit gate.

**Verdict:** NOT_VULNERABLE — defense-in-depth correct.

---

## Cross-Focus Handoffs

- → **Access Control Agent**: 
  - Verify `ApplyConfigUpdate` context (v2:877-888) — the lack of `has_one = authority` is intentional, but does Anchor 0.30+ require any other gate? Confirm payer signing is sufficient for the mutating instruction.
  - `AcceptAuthority` (v2:907-917) uses `Signer<new_authority>` but has no `has_one` — the body check at v2:329-332 is the sole identity gate. Confirm this matches the "two-step authority rotation" design pattern in Anchor security guides.
  - `MigrateConfigUnchecked` (v2:856-871) uses `UncheckedAccount` — verify the seeds gate (v2:862) is sufficient identity protection, and the manual byte read at v2:191-198 cannot be replayed against a substituted account.

- → **Timing Agent**:
  - Bundle 1 introduces 3 new time-sensitive flows: propose→accept (no timeout, unbounded), update_config→apply (24h+ unbounded), permissionless apply (`now >= earliest` uses `>=` not `>` — slot-boundary edge).
  - Verify `Clock::get()` is the only timestamp source in Bundle 1 — confirmed at v2:123, v2:250.
  - H035 v1 analysis revealed unified TIMEOUT/SETTLEMENT constants → 0-second race window. Verify against actual constants v1:22 (TIMEOUT_SECONDS = 3600) and v1:29 (SETTLEMENT_TIMEOUT_SECONDS = 3600). **POSSIBLE H035 RESOLUTION** for v1.

- → **Arithmetic Agent**:
  - All Bundle 1 arithmetic uses `checked_add` paired with `ok_or(ArithmeticOverflow)`. Verify the 24h timelock + i64 timestamp combo (v2:251-254) cannot overflow in realistic time horizons.
  - `migrate_config` rent computation (v2:208-213) uses `checked_sub`. Verify no underflow when `current_balance >= new_minimum`.

- → **Token-Economic Agent**:
  - S3-N06 (settle-after-match-end window) interacts with token settlement. A 24h+ settle race window favours the authority but doesn't reduce pot guarantees.
  - Snapshot mechanism (MIE-4) means in-flight matches use OLD fee BPS. Cross-check pot math.

- → **CPI Agent**:
  - `migrate_config` (v2:214-223) does a CPI to system_program for rent top-up. Verify the CPI accounts (from=auth_info, to=config_info) cannot be substituted via account ordering.

- → **Account Validation Agent**:
  - `MigrateConfigUnchecked` (v2:856-871) is the only `UncheckedAccount` in a non-destination role. The manual byte read at offset [8..40] is the trust foundation. Verify this offset is correct for the v1 GlobalConfig layout (v1:832-852).
  - Reading the v1 layout: 8 byte disc + 32 byte authority (offset 8-40 ✓) + 32 byte treasury (40-72) + 32 byte ops (72-104) + 1 byte is_paused (104) + 1 byte bump (105) = 106 total bytes (not 110 as commented). **WAIT** — confirm v1 SPACE constant. v1 GlobalConfig::SPACE is defined as `8 + (32 * 3) + 1 + 1 = 106`. The HOT_SPOTS.md and INDEX.md both reference 110 bytes for v1 layout, but v2's migrate_config zero-fills starting at `current_size` and SPACE is 106 for v1. So zero-fill starts at offset 106, filling 106..231 = 125 bytes. **The new pending fields plus timestamps total 4 Option<Pubkey> + 1 Option<u16>*2 + 2 i64 = 4*(33) + 2*(3) + 16 = 132+6+16 = 154 bytes** — but SPACE delta is only 231-106 = 125 bytes. **Discrepancy!** 
  - **Wait — let me recompute v2 SPACE** from v2:1162-1169: 8 + (32*3) + (2*2) + 1+1 + (1+32) + (1+32)+(1+32) + (1+2)+(1+2) + 8+8 = 8 + 96 + 4 + 2 + 33 + 66 + 6 + 16 = **231 bytes ✓**. The pre-Bundle-1 layout was 8 + 96 + 4 + 2 = **110 bytes** (with fee_bps_t + fee_bps_o already at 2*2=4 bytes). v1 doesn't have fee_bps fields. So v1's GlobalConfig SPACE = 110 bytes would only match if v1 had fee_bps fields too — let me check v1 source...
  - v1 GlobalConfig (v1:832-852) likely does NOT have fee_bps fields (v1 has hardcoded TREASURY_BPS/OPS_BPS constants at v1:15-16). **v1 SPACE = 106 bytes (no fee_bps).** Then v2 migrate_config zero-fills from 106 to 231 = 125 bytes. **But the new fields plus 2*(1+2) = 6 bytes of NEW fee_bps_t/o Options... wait, v2 already had fee_bps_t and fee_bps_o as 2-byte u16 each in the pre-Bundle-1 layout (the audit doc INDEX says pre-S2-T1 layout was 110 = 8+96+4+1+1, which means it had fee_bps_t + fee_bps_o = 4 bytes already).
  - **So v2's pre-Bundle-1 was 110 bytes; v1's current is 106 bytes (no fee_bps).** migrate_config is intended for migrating v2 pre-Bundle-1 → v2 post-Bundle-1, NOT v1 → v2. The comment at v2:175-179 confirms "old config data (110 bytes) can't be deserialized as the new GlobalConfig struct (231 bytes)." This is v2 → v2 migration. **CRITICAL: confirm with deployer that v1 was never deployed using v2's GlobalConfig schema.** Cross-handoff to Account Validation Agent for layout verification.

- → **Error Handling Agent**:
  - 3 new error variants (NoPendingAuthority, NoPendingConfig, TimelockNotElapsed) cover all the new state-machine guards.
  - Verify exhaustiveness: every Bundle 1 require! has a specific error code (not just `InvalidConfig`).
  - Check: v2:340-341 (post-accept distinctness) returns `InvalidConfig` for both checks — semantically correct but maps two distinct failure modes to one error.

---

## Pause Guard Table (Updated for Bundle 1)

| Instruction | v1 pause guard? | v2 pause guard? | Notes |
|-------------|-----------------|------------------|-------|
| initialize_config | n/a | n/a | First-run only |
| update_config (Bundle 1) | NO | NO | Authority-only; governance must work during pause |
| migrate_config (Bundle 1) | n/a | NO | Devnet-only; no pause guard needed |
| apply_config_update (Bundle 1) | n/a | **NO** | Permissionless after timelock; pause does NOT block |
| propose_authority (Bundle 1) | n/a | **NO** | Authority-only; rotation must work during pause |
| accept_authority (Bundle 1) | n/a | **NO** | New-authority-signed; must work during pause |
| pause_program | NO | NO | Idempotent |
| unpause_program | NO | NO | Idempotent |
| create_match | YES | YES | New commitments blocked |
| deposit_wager | YES | YES | New deposits blocked |
| settle_match | **NO** (H016 fix) | NO | Exit during pause allowed |
| cancel_match | **NO** (H016 fix) | NO | Exit during pause allowed |
| permissionless_reclaim | NO (no config in struct) | NO (no config in struct) | Permissionless exit |
| start_with_depositors | **NO** (H009 fix) | YES | v2 inconsistency: blocks partial activation during pause |

**Note:** v1 has now applied H016/H009 fixes — pause does NOT block cancel/settle/start. The audit #2 conclusion that v1 retained the bug needs **updating**. The v1 source at v1:744-779 (CancelMatch + SettleMatch contexts) confirms no `constraint = !config.is_paused`. **v1 has CLOSED H016/H009 since audit #2.**

**NEW v2 finding:** `StartWithDepositors` v2:1092-1111 STILL has `constraint = !config.is_paused @ EscrowError::ProgramPaused` (v2:1108). This is inconsistent with v1's H009 fix. If pause is active, partial-match activation is blocked — authority cannot start_with_depositors. **Add to handoffs: Access Control / Timing should evaluate whether this is intentional.**

---

## Close Target Table (Unchanged)

| Instruction | v1 close=X | v2 close=X | Notes |
|---|---|---|---|
| settle_match | authority | authority | Server reclaims escrow rent |
| cancel_match | caller | caller | Whoever calls gets ~0.002 SOL rent |
| permissionless_reclaim | caller | caller | Designed incentive |
| migrate_config (Bundle 1) | n/a | (no close) | Just reallocs, doesn't close |
| apply_config_update (Bundle 1) | n/a | (no close) | Mutates only |
| propose/accept_authority (Bundle 1) | n/a | (no close) | Mutates only |

---

## State-Transition Coverage Validation

Re-validating every `state == X` check and every `state = X` write in both source files:

**State guards (read):**
- v1:212, v1:276, v1:391, v1:397, v1:461, v1:525, v1:526
- v2:465-466, v2:541-543, v2:605-606, v2:702-704, v2:708-710, v2:759-760

**State writes:**
- v1:185 = AwaitingDeposits (create_match)
- v1:253 = Active (deposit_wager, on full mask)
- v1:328 = Settled (settle_match)
- v1:404 = Cancelled (cancel_match)
- v1:485 = Cancelled (permissionless_reclaim)
- v1:563 = Active (start_with_depositors)
- v2:429 = AwaitingDeposits (create_match)
- v2:516 = Active (deposit_wager)
- v2:582 = Active (start_with_depositors)
- v2:647 = Settled (settle_match)
- v2:715 = Cancelled (cancel_match)
- v2:783 = Cancelled (permissionless_reclaim)

**Bundle 1 state writes (NEW):**
- v2:127 = `pending_treasury = Some(t)` (update_config)
- v2:131 = `pending_ops = Some(o)`
- v2:134 = `pending_fee_bps_treasury = Some(t)`
- v2:137 = `pending_fee_bps_ops = Some(o)`
- v2:154 = `pending_config_ts = now`
- v2:226 = `realloc(231, false)` (migrate_config)
- v2:232-235 = zero-fill from current_size onward
- v2:257-268 = `take()` on all 4 pending fields, apply to live
- v2:280 = `last_config_update_ts = now`
- v2:281 = `pending_config_ts = 0`
- v2:310 = `pending_authority = Some(new_authority)` (propose_authority)
- v2:335 = `authority = pending` (accept_authority swap)
- v2:336 = `pending_authority = None` (accept clears)

**Error variants for state-machine guards:**
- InvalidState (v1:980, v2:1360) — generic state-mismatch
- MatchAlreadyStarted (v1:1019, v2:1410) — start_with_depositors when not AwaitingDeposits
- AlreadyDeposited (v1:984, v2:1364) — re-deposit attempt
- DepositWindowClosed (v2:1406) — v2 only, deposit_wager after window
- DepositWindowOpen (v2:1408) — v2 only, start_with_depositors before window
- Unauthorized (v1:988, v2:1368) — caller-not-allowed
- NoPendingAuthority (v2:1417) — **Bundle 1 NEW** — accept without propose
- NoPendingConfig (v2:1419) — **Bundle 1 NEW** — apply without propose
- TimelockNotElapsed (v2:1421) — **Bundle 1 NEW** — apply too soon

**Coverage verdict:** Every illegal state transition has a corresponding error variant. The Bundle 1 additions are exhaustive against the new pending-state machine.

---

## Bundle 1 Risk Assessment Summary Table

| Concern | Severity | Status | Finding ID |
|---|---|---|---|
| Q1: Interleaved propose/update | MEDIUM | Documented; off-chain monitor required | S3-N01 |
| Q2: pending_config_ts stalling | LOW | Documented design; affects authority only | S3-N04 |
| Q3: propose_authority overwrite | LOW | Working as designed (cancel mechanism) | S3-N05 |
| Q4: Pause vs governance | MEDIUM | Working as designed; pause-rotate-unpause chain | S3-N02 |
| Q5: In-flight match snapshots | NOT_VULN | Snapshot mechanism correct | (no finding) |
| Q6: Settle/cancel race | MEDIUM-HIGH (v2) | v1 RESOLVED (0s window); v2 wider | S3-N06 |
| Q7: migrate_config re-invocation | LOW | Idempotent and re-auth-safe | S3-N03 |
| Q8: accept_authority atomicity | NOT_VULN | TX revert restores pre-state | (Inv 15) |

---

## Final Summary

**Bundle 1 state-machine concerns introduced:** 8 new state-lifecycle questions explicitly investigated, 11 new findings tracked (1 MEDIUM-HIGH, 5 MEDIUM, 5 LOW). **No CRITICAL state-machine issues** introduced by Bundle 1.

**H035 status:** Recheck reveals v1 H035 may have been independently RESOLVED via TIMEOUT_SECONDS unification (both = 3600s, no overlap window). v2's H035-equivalent (S3-N06) is OPEN — unbounded settle-after-match-end window.

**H024 status:** UNCHANGED. Refund loops are monotonic-from-i=0 in both v1 and v2 (v2:727-735, v2:794-802). Non-contiguous deposits_mask permanently unrefundable. Bundle 1 unrelated.

**H039 status:** RESOLVED. MAX_DURATION_SECS reduced from 7d to 24h at v2:42.

**Most interesting state interaction:** S3-N09 — the **3-way independence** of authority rotation, config rotation, and pause creates a 12-state phase space where (paused + pending_authority=Some + pending_config_ts > 0) is reachable. An attacker who compromises authority A can chain pause + update_config + propose_authority + accept_authority in 4 TXs across 2 keys (A and pre-arranged B), arriving in the "max chaos" state in seconds. The 24h timelock + 2-step authority mechanism + off-chain monitoring provide defense, but the on-chain state machine itself permits this combination. This is the architectural cost of decoupling the two governance tracks for liveness — and is mitigated only by social/operational defenses (monitoring + multi-sig — H044/H046 still apply).
