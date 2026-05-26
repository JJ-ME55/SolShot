# S2-T1 Scoping — Bundle 1 Anchor Changes

**Status:** Research complete. Implementation queued for Sprint 2.
**Authored:** 2026-05-26
**Companion docs:**
- [V1_LAUNCH_SPRINT.md §3 S2-T1](V1_LAUNCH_SPRINT.md)
- [mainnet-roadmap.md §3.2 Steps 1c + 1d](../mainnet-roadmap.md)
- [KEY_MANAGEMENT.md](../KEY_MANAGEMENT.md) — Squads-from-day-one approach (affects how we use the new instructions)

This doc walks through exactly what S2-T1 changes look like before any code is touched, so the implementation session has zero discovery burden.

---

## §1 Current State Map

### 1.1 GlobalConfig — what it looks like today

[programs/solshot-escrow-v2/src/lib.rs:843-858](../../programs/solshot-escrow-v2/src/lib.rs#L843):

```rust
#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,           // 32
    pub treasury: Pubkey,            // 32
    pub ops: Pubkey,                 // 32
    pub fee_bps_treasury: u16,       // 2
    pub fee_bps_ops: u16,            // 2
    pub is_paused: bool,             // 1
    pub bump: u8,                    // 1
}

impl GlobalConfig {
    pub const SPACE: usize = 8 + (32 * 3) + (2 * 2) + 1 + 1;  // 110 bytes
    pub const SEED: &'static [u8] = b"config";
}
```

### 1.2 Current authority/config rotation — SINGLE-STEP, NO TIMELOCK

[programs/solshot-escrow-v2/src/lib.rs:99-145](../../programs/solshot-escrow-v2/src/lib.rs#L99) — `update_config`:

- Signed by current `config.authority`
- Each field is `Option<T>`; `Some(x)` updates that field, `None` keeps current
- Validates: authority ≠ treasury ≠ ops, fee BPS ≤ MAX_FEE_BPS (1000)
- **Applies immediately.** No timelock, no pending state, no observation window.
- Emits `ConfigUpdated` event

### 1.3 Authority-gated instructions

These instructions verify `config.authority` matches the signer:
- `update_config` (line 99) — gated via `has_one = authority @ Unauthorized` in `UpdateConfig` ctx
- `pause_program` / `unpause_program` (lines 150-165)
- `settle_match` (line 720) — gated via config.has_one + escrow.has_one
- `start_with_depositors` (line 819) — gated via both `has_one`

All read the LIVE config.authority at instruction time. No snapshot.

### 1.4 What's missing for Bundle 1

| Required by mainnet-roadmap §3.2 | Present today? |
|---|---|
| Two-step authority rotation (`propose_authority` + `accept_authority`) | ❌ |
| 24h config-update timelock | ❌ |
| Pending state on GlobalConfig | ❌ |
| `last_config_update_ts` audit trail | ❌ |

---

## §2 New Design — Two Parallel Mechanisms

The roadmap separates **authority rotation** from **other config changes** because they have different risk profiles:

| Change | Risk Profile | Mechanism |
|---|---|---|
| Rotate `config.authority` (the highest-stakes change — controls everything) | Must verify new key works BEFORE losing access; should NOT have timelock (recovery scenarios may need fast rotation) | **Two-step**: `propose_authority` then `accept_authority` (new key signs to accept, proves it's live). No timelock. |
| Rotate treasury / ops pubkeys, fee BPS | Lower stakes; should give world visibility window for monitoring + dispute | **Timelocked**: `update_config` writes to pending state + `pending_config_ts`. `apply_config_update` callable by anyone after 24h elapses. |

### 2.1 Combined GlobalConfig struct (post-S2-T1)

```rust
#[account]
pub struct GlobalConfig {
    // ─── Live fields (unchanged in field name + semantics) ──
    pub authority: Pubkey,                                  // 32
    pub treasury: Pubkey,                                   // 32
    pub ops: Pubkey,                                        // 32
    pub fee_bps_treasury: u16,                              // 2
    pub fee_bps_ops: u16,                                   // 2
    pub is_paused: bool,                                    // 1
    pub bump: u8,                                           // 1

    // ─── NEW: Pending authority (two-step rotation, no timelock) ─
    pub pending_authority: Option<Pubkey>,                  // 1 + 32 = 33

    // ─── NEW: Pending config (timelocked update, 24h delay) ────
    pub pending_treasury: Option<Pubkey>,                   // 1 + 32 = 33
    pub pending_ops: Option<Pubkey>,                        // 1 + 32 = 33
    pub pending_fee_bps_treasury: Option<u16>,              // 1 + 2 = 3
    pub pending_fee_bps_ops: Option<u16>,                   // 1 + 2 = 3
    pub pending_config_ts: i64,                             // 8 (0 = no pending)

    // ─── NEW: Audit trail ─────────────────────────────────────
    pub last_config_update_ts: i64,                         // 8
}
```

Encoding tradeoff: I chose individual `Option<T>` fields for clarity. Alternative — wrap pending non-authority changes in a struct — saves 4 bytes but adds a layer of indirection. Going with the spread-out version for code-review readability. Worth ~5 lines of debate at implementation time but not changing the outcome.

### 2.2 SPACE recalculation

```
Current SPACE = 8 (discriminator)
              + 32 + 32 + 32 (authority/treasury/ops)
              + 2 + 2 (fee BPS)
              + 1 + 1 (is_paused, bump)
              = 110 bytes

Added bytes:
  + 33 (pending_authority Option<Pubkey>)
  + 33 (pending_treasury Option<Pubkey>)
  + 33 (pending_ops Option<Pubkey>)
  + 3  (pending_fee_bps_treasury Option<u16>)
  + 3  (pending_fee_bps_ops Option<u16>)
  + 8  (pending_config_ts i64)
  + 8  (last_config_update_ts i64)
  = 121 bytes added

New SPACE = 110 + 121 = 231 bytes
```

Rent cost at 231 bytes: ~0.0017 SOL (negligible). Existing config PDA on devnet will need re-initialization (see §5 Migration).

### 2.3 New constants

```rust
/// 24h between update_config proposal and apply_config_update
const CONFIG_TIMELOCK_SECS: i64 = 86_400;
```

---

## §3 New Instructions — Diff Sketches

### 3.1 `propose_authority` (NEW)

Authority writes `pending_authority`. Doesn't transfer yet — `authority` is unchanged.

```rust
pub fn propose_authority(
    ctx: Context<ProposeAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    require!(new_authority != Pubkey::default(), EscrowError::InvalidConfig);
    require!(new_authority != ctx.accounts.config.authority, EscrowError::SameAuthority);

    let cfg = &mut ctx.accounts.config;
    cfg.pending_authority = Some(new_authority);

    emit!(AuthorityProposed {
        current: cfg.authority,
        pending: new_authority,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}
```

### 3.2 `accept_authority` (NEW)

Signed by the **new** authority. Atomically swaps + clears pending.

```rust
pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    let pending = cfg.pending_authority.ok_or(EscrowError::NoPendingAuthority)?;
    require!(
        pending == ctx.accounts.new_authority.key(),
        EscrowError::Unauthorized
    );

    let old = cfg.authority;
    cfg.authority = pending;
    cfg.pending_authority = None;

    emit!(AuthorityAccepted {
        old,
        new: pending,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    /// Must be the same key as config.pending_authority
    pub new_authority: Signer<'info>,
}
```

**Key safety property:** `accept_authority` requires the new key to sign. If you `propose_authority(wrong_key)`, the wrong key can't accept (they'd need that key's seed to sign). The current authority can call `propose_authority(actual_authority)` to overwrite the pending state and cancel a bad proposal.

### 3.3 `update_config` (MODIFIED)

Becomes a "propose changes" instruction — writes to pending fields + sets timestamp. **No longer applies immediately.**

```rust
pub fn update_config(
    ctx: Context<UpdateConfig>,
    new_treasury: Option<Pubkey>,
    new_ops: Option<Pubkey>,
    new_fee_bps_treasury: Option<u16>,
    new_fee_bps_ops: Option<u16>,
) -> Result<()> {
    // NOTE: authority is NOT a parameter here anymore — that goes through
    // propose_authority/accept_authority (no timelock, 2-step verify).

    let cfg = &mut ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;

    // Write to pending state — does NOT touch live fields
    if let Some(t) = new_treasury {
        require!(t != Pubkey::default(), EscrowError::InvalidConfig);
        cfg.pending_treasury = Some(t);
    }
    if let Some(o) = new_ops {
        require!(o != Pubkey::default(), EscrowError::InvalidConfig);
        cfg.pending_ops = Some(o);
    }
    if let Some(t) = new_fee_bps_treasury {
        cfg.pending_fee_bps_treasury = Some(t);
    }
    if let Some(o) = new_fee_bps_ops {
        cfg.pending_fee_bps_ops = Some(o);
    }

    // Compute effective post-apply config for validation gate
    let eff_treasury = cfg.pending_treasury.unwrap_or(cfg.treasury);
    let eff_ops = cfg.pending_ops.unwrap_or(cfg.ops);
    let eff_fee_t = cfg.pending_fee_bps_treasury.unwrap_or(cfg.fee_bps_treasury);
    let eff_fee_o = cfg.pending_fee_bps_ops.unwrap_or(cfg.fee_bps_ops);

    require!(cfg.authority != eff_treasury, EscrowError::InvalidConfig);
    require!(cfg.authority != eff_ops, EscrowError::InvalidConfig);
    require!(eff_treasury != eff_ops, EscrowError::DuplicateFeeAccount);
    require!(
        (eff_fee_t as u32 + eff_fee_o as u32) <= MAX_FEE_BPS as u32,
        EscrowError::FeesTooHigh
    );

    cfg.pending_config_ts = now;

    emit!(ConfigProposed {
        pending_treasury: cfg.pending_treasury,
        pending_ops: cfg.pending_ops,
        pending_fee_bps_treasury: cfg.pending_fee_bps_treasury,
        pending_fee_bps_ops: cfg.pending_fee_bps_ops,
        propose_ts: now,
        applies_at: now + CONFIG_TIMELOCK_SECS,
    });

    Ok(())
}
```

Notice: `new_authority` is no longer a parameter. Authority changes go through the 2-step propose/accept flow only.

### 3.4 `apply_config_update` (NEW)

Anyone can call after the 24h timelock elapses. Applies pending → live, clears pending.

```rust
pub fn apply_config_update(ctx: Context<ApplyConfigUpdate>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;

    require!(cfg.pending_config_ts > 0, EscrowError::NoPendingConfig);

    let now = Clock::get()?.unix_timestamp;
    let earliest_apply = cfg.pending_config_ts
        .checked_add(CONFIG_TIMELOCK_SECS)
        .ok_or(EscrowError::ArithmeticOverflow)?;
    require!(now >= earliest_apply, EscrowError::TimelockNotElapsed);

    // Apply pending → live
    if let Some(t) = cfg.pending_treasury.take() {
        cfg.treasury = t;
    }
    if let Some(o) = cfg.pending_ops.take() {
        cfg.ops = o;
    }
    if let Some(t) = cfg.pending_fee_bps_treasury.take() {
        cfg.fee_bps_treasury = t;
    }
    if let Some(o) = cfg.pending_fee_bps_ops.take() {
        cfg.fee_bps_ops = o;
    }

    // Re-validate post-apply
    require!(cfg.authority != cfg.treasury, EscrowError::InvalidConfig);
    require!(cfg.authority != cfg.ops, EscrowError::InvalidConfig);
    require!(cfg.treasury != cfg.ops, EscrowError::DuplicateFeeAccount);
    require!(
        (cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
        EscrowError::FeesTooHigh
    );

    cfg.last_config_update_ts = now;
    cfg.pending_config_ts = 0;

    emit!(ConfigApplied {
        authority: cfg.authority,
        treasury: cfg.treasury,
        ops: cfg.ops,
        fee_bps_treasury: cfg.fee_bps_treasury,
        fee_bps_ops: cfg.fee_bps_ops,
        applied_ts: now,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ApplyConfigUpdate<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    /// Anyone can pay the fee — this is intentionally permissionless to ensure
    /// applies happen even if authority becomes unresponsive after proposing.
    #[account(mut)]
    pub payer: Signer<'info>,
}
```

**Key safety property:** `apply_config_update` is permissionless on purpose. The authority might propose a change and then their key is compromised before they can apply — but the change was already announced on-chain 24h earlier, so the community has had visibility. Letting anyone apply after the timelock ensures the announced change actually takes effect.

### 3.5 New events

```rust
#[event]
pub struct AuthorityProposed {
    pub current: Pubkey,
    pub pending: Pubkey,
}

#[event]
pub struct AuthorityAccepted {
    pub old: Pubkey,
    pub new: Pubkey,
}

#[event]
pub struct ConfigProposed {
    pub pending_treasury: Option<Pubkey>,
    pub pending_ops: Option<Pubkey>,
    pub pending_fee_bps_treasury: Option<u16>,
    pub pending_fee_bps_ops: Option<u16>,
    pub propose_ts: i64,
    pub applies_at: i64,
}

#[event]
pub struct ConfigApplied {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub ops: Pubkey,
    pub fee_bps_treasury: u16,
    pub fee_bps_ops: u16,
    pub applied_ts: i64,
}
```

The existing `ConfigUpdated` event (emitted by current `update_config`) **goes away** since the new `update_config` is just a proposal. Anything reading `ConfigUpdated` events off-chain needs to migrate to listening for `ConfigProposed` + `ConfigApplied`.

### 3.6 New errors

```rust
#[msg("No pending authority to accept")]
NoPendingAuthority,
#[msg("New authority must differ from current")]
SameAuthority,
#[msg("No pending config to apply")]
NoPendingConfig,
#[msg("Config timelock has not elapsed")]
TimelockNotElapsed,
```

---

## §4 IDL + Server Wrapper Updates

### 4.1 IDL

After `anchor build`, copy `target/idl/solshot_escrow_v2.json` → `server/idl/solshot_escrow_v2.json`. Existing IDL has ~1341 lines; post-change will add:
- `proposeAuthority` instruction
- `acceptAuthority` instruction
- `applyConfigUpdate` instruction
- Modified `updateConfig` instruction (removed `new_authority` param)
- New event types (`AuthorityProposed`, `AuthorityAccepted`, `ConfigProposed`, `ConfigApplied`)
- New account fields on `GlobalConfig`
- New error variants

### 4.2 server/services/escrow-v2.js

Current exports (per earlier audit):
- `initializeConfigV2`, `updateConfigV2`, `pauseProgramV2`, `unpauseProgramV2`
- `createMatchEscrowV2`, `settleMatchEscrowV2`, `cancelMatchEscrowV2`, etc.

Add new wrappers:
```js
export async function proposeAuthorityV2(newAuthorityPubkey) { ... }
export async function acceptAuthorityV2(newAuthorityKeypair) { ... }
export async function applyConfigUpdateV2(payerKeypair) { ... }
```

Modify `updateConfigV2` signature to drop the `newAuthority` parameter (or accept it but throw — defensive).

### 4.3 Init script

`server/scripts/init-config-v2.mjs` is the one-shot script that calls `initialize_config` after a fresh deploy. The new GlobalConfig has 7 extra fields all initialized to zero/None, but `initialize_config` doesn't need to write to them (their default values are correct). **No changes needed to init script** unless we want to defensively zero them.

---

## §5 Migration — devnet config PDA

The existing devnet GlobalConfig PDA (`6TAKdJj6f8KNJY6LicCiJ7ZTvYpL5uERX14bsgcdkBU5` per memory) was sized for the old SPACE (110 bytes). The new SPACE is 231 bytes.

Anchor does NOT auto-realloc on program upgrade. Three options:

**Option A — Close + reinit (Recommended for devnet)**
1. Drain the existing config PDA (close to authority, recover rent)
2. Deploy upgraded program with new SPACE
3. Call `initialize_config` again with the same params
4. Result: fresh config PDA at the same seeds, sized correctly

Acceptable on devnet because no real state lives in config. The pubkeys/BPS we re-init are the same as what was there.

**Option B — Add a `realloc_config` instruction**
1. Authority-only one-shot instruction that calls `realloc(231, false)` on the config account
2. Initializes new fields to defaults
3. Then upgrade the program in-place

More complex but preserves the existing PDA address. **Probably overkill for devnet.**

**Option C — Manual realloc via raw TX**
Not advisable; Anchor manages account sizing through its account macros.

**Mainnet plan:** Squads-from-day-one means the fresh deploy uses the NEW (231-byte) SPACE from the very first `initialize_config` call. No migration needed.

**Devnet plan:** Option A — close existing config, redeploy program, reinit config. The S2-T2 rotation drills then exercise the new instructions on the freshly initialized PDA.

---

## §6 Test Plan (the S2-T2 devnet drills)

Per [mainnet-roadmap §3.3](../mainnet-roadmap.md), three end-to-end rotation drills before mainnet.

### Each drill is:

1. From current authority key: call `propose_authority(new_pubkey)`
2. Verify: `pending_authority = Some(new_pubkey), authority = old`
3. Attempt `update_config` from old key → succeeds (writes pending, authority unchanged)
4. Attempt `accept_authority` from old key → fails with Unauthorized
5. From new authority key: call `accept_authority`
6. Verify: `authority = new, pending_authority = None`
7. Attempt `update_config` from old key → fails with Unauthorized
8. From new authority: call `update_config(new_treasury=X)`
9. Verify: `pending_treasury = Some(X), pending_config_ts > 0`
10. Immediately call `apply_config_update` → fails with TimelockNotElapsed
11. Wait 24h (or advance devnet clock) → call `apply_config_update`
12. Verify: `treasury = X, pending_treasury = None, last_config_update_ts > 0`
13. Run a full match (create → deposit → settle) under the new key → settles correctly

### Acceptance for S2-T2

- 3 successful drills logged with TX hashes
- BOK invariant suite re-run on post-S2-T1 v2 program — all 159 tests pass
- Test the bad-pending-authority recovery path: propose a wrong key, propose the right key (overwrite), accept with right key. Verify the wrong key was never able to accept.

---

## §7 Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `accept_authority` bug → governance locked | Low | **CATASTROPHIC** | Devnet drills (S2-T2) before mainnet; careful code review |
| Timelock bypass — `apply_config_update` succeeds before 24h | Low | High (defeats purpose of timelock) | Explicit `Clock::get()` check + drill test step 10 |
| Realloc / SPACE mismatch on devnet | Medium | Medium (just re-init pain) | Use Option A (close + reinit) — flagged in §5 |
| Pending state desync — `pending_config_ts` cleared incorrectly | Medium | Medium (might re-trigger timelock) | Test step 12 verifies clearing logic |
| Off-chain monitoring relies on `ConfigUpdated` event | High (we have to migrate it) | Low (cosmetic) | Add `ConfigProposed` + `ConfigApplied` listeners; remove `ConfigUpdated` listener |
| `update_config` no longer accepts `new_authority` — breaks server script that uses old signature | Certain (we're changing signature) | Low | Update server `updateConfigV2` wrapper; document the new flow in KEY_MANAGEMENT.md §5 |
| MatchEscrow account uses snapshot — config changes shouldn't affect in-flight matches | N/A — already correct | N/A | Existing snapshot pattern preserved; no change |

---

## §8 Implementation Order

1. **Read [programs/solshot-escrow-v2/src/lib.rs:1-99](../../programs/solshot-escrow-v2/src/lib.rs) constants section** — confirm I have full context (already done in this scoping)
2. **Add new constants** (CONFIG_TIMELOCK_SECS) to constants block
3. **Modify GlobalConfig struct + SPACE** in account definitions section
4. **Modify update_config** to write to pending fields
5. **Add propose_authority, accept_authority, apply_config_update** instructions
6. **Add Accounts contexts** for the new instructions
7. **Add events** (AuthorityProposed, AuthorityAccepted, ConfigProposed, ConfigApplied)
8. **Add errors** (NoPendingAuthority, SameAuthority, NoPendingConfig, TimelockNotElapsed)
9. **Remove ConfigUpdated event** (replaced by ConfigProposed + ConfigApplied)
10. **anchor build** — check it compiles
11. **Copy target/idl/ → server/idl/**
12. **Update server/services/escrow-v2.js wrappers**
13. **Deploy to devnet** — close existing config PDA first, then reinit
14. **Run S2-T2 drills** (this is a separate task but proves S2-T1 works)
15. **Re-run BOK invariant suite** on post-S2-T1 devnet program

**Estimated effort:** 3–5 days for the Rust + IDL + server wrapper changes. Add 1 day for devnet redeploy + initial smoke. S2-T2 drills are another 1 day on top.

---

## §9 Open Questions for Implementation Session

1. **Should `propose_authority` overwrite an existing pending proposal, or fail?**
   - Recommendation: overwrite. If a proposal was bad (wrong key), the authority needs a way to cancel without an extra "cancel_proposal" instruction. Overwriting with a different pubkey effectively cancels. Overwriting with the same pubkey is a no-op.

2. **Should there be a `cancel_pending_config` instruction?**
   - Maybe — if `update_config` proposes a change and 23h later authority realizes it was wrong, currently they have to wait the full 24h for the timelock then immediately call `update_config` again to re-pend. A `cancel_pending_config` would clear the pending state immediately.
   - Recommendation: SKIP for V1. Authority can call `update_config` with the same fields as live → effectively a no-op apply later. Adds complexity for marginal benefit.

3. **Should `apply_config_update` be callable by authority alone, or truly permissionless?**
   - Roadmap §3.2 says "anyone can call after 24h" — that's the permissionless intent. Confirms recovery path if authority becomes unreachable.
   - Recommendation: keep permissionless per roadmap. Authority-only adds no security (timelock has already passed; whoever pays the gas just executes a publicly-known state change).

4. **Should `is_paused` get the same pending+timelock treatment?**
   - The roadmap doesn't mention this. Pausing is an emergency action — adding a 24h delay defeats the point.
   - Recommendation: leave `pause_program` / `unpause_program` instant. They're separate from `update_config`.

5. **What's the migration plan if we discover a bug in S2-T1 post-deploy?**
   - Squads multisig owns upgrade authority. Bug fix = redeploy via Squads vote. Same migration path as any other program upgrade.
   - Recommendation: budget for at least one post-deploy patch. Don't deploy S2-T1 to mainnet until the devnet drills are clean.

---

## §10 What This Doc Doesn't Cover

- **S2-T2 (drills)** — separate task, builds on S2-T1
- **Bundle 1 Step 1g (key zeroization)** — server-side, not Anchor program
- **Bundle 1 Step 1i (guardian recovery)** — deferred from V1 per V1_LAUNCH_SPRINT.md
- **Server `solshot-escrow-v2.so` redeploy procedure** — deployment runbook, not scoping

When S2-T1 implementation begins, this doc is the spec. If the implementation deviates, update this doc first so the deviation is visible and reviewable before code lands.
