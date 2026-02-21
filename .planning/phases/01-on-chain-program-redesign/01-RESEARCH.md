# Phase 1: On-Chain Program Redesign - Research

**Researched:** 2026-02-21
**Domain:** Anchor 0.32.1 Solana program security hardening — config PDA, multisig authority, account constraints, checked arithmetic
**Confidence:** HIGH

---

## Summary

This research covers how to redesign the `solshot-escrow` Anchor 0.32.1 program to resolve 17 SOS findings (S001, H008, H001, H026, H029-partial, H007, H003, H009, S004, S005, H002, H022, H028, H017, S003, H027, H024), 8 BOK gaps (GAP-001 through GAP-008), and 2 DB cross-boundary findings (H048, H053). The current program is a single 417-line Rust file with 4 instructions (`create_match`, `deposit_wager`, `settle_match`, `cancel_match`) and no on-chain validation of economic destinations or authority controls.

The standard approach for this class of Solana program hardening is: (1) introduce a global config PDA (singleton, `seeds = [b"config"]`) that stores treasury, ops, and authority pubkeys; (2) add Anchor `constraint`, `has_one`, and `address` checks to all settlement accounts; (3) apply `checked_mul`/`checked_sub`/`checked_add` and u128 widening for all arithmetic; (4) add an `is_paused` flag guarded on every instruction; and (5) restrict the authority's cancel power to `AwaitingDeposits` state only. All these patterns are native Anchor — nothing requires external libraries.

**Primary recommendation:** Write the new program as a single-file replacement of `lib.rs`, adding a `GlobalConfig` PDA account type and a new `initialize_config` instruction, then threading config account into all four existing instructions via Anchor constraint expansion. Deploy as a new program (new program ID), update IDL and server service atomically.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anchor-lang | 0.32.1 | Program framework, account constraints, PDA derivation, error macros | Already in use; version pinned in Cargo.toml; 0.32.1 is latest stable before 1.0 breaking changes |
| Rust | 1.89.0+ | Required by Anchor 0.32.0+ for IDL builds (Span::local_file stabilized) | Anchor 0.32.0 release notes mandate this minimum |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bn.js (npm) | (existing) | Server-side BN for lamport math | Already in use in escrow.js; do not replace |
| @coral-xyz/anchor (npm) | (existing) | Client/server Anchor TypeScript client | IDL consumer in escrow.js |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single-key authority in config PDA | Squads Protocol v4 multisig | Squads adds a separate program dependency and complex transaction batching; for v1.1 the config PDA with a stored authority pubkey plus off-chain 2-of-N coordination (KM phase) is sufficient. True on-chain multisig is a v1.2 concern. |
| Config PDA for treasury/ops validation | Hardcoded constants (`const TREASURY_PUBKEY`) | Constants require redeployment to rotate addresses; config PDA allows governance-controlled updates. Use config PDA. |
| `address = CONST` constraint | `constraint = account.key() == config.treasury` | Both work; `constraint` is more flexible and already supported in 0.32.1. Use `constraint` pointing at config PDA fields. |

**Installation:**
```bash
# No new dependencies needed — anchor-lang 0.32.1 already in programs/solshot-escrow/Cargo.toml
cargo build-sbf   # verify build after changes
anchor build      # generates new IDL
```

---

## Architecture Patterns

### Recommended Project Structure

The program remains a single-file program (no module split needed at 417-600 LOC). Structure the additions in-place:

```
programs/solshot-escrow/src/lib.rs   # Entire program — ~600 LOC after changes
programs/solshot-escrow/Cargo.toml   # Unchanged (anchor-lang = "0.32.1")
Cargo.toml                           # Workspace — unchanged (explicit path, not glob)
target/idl/solshot_escrow.json       # Auto-generated after anchor build
server/idl/solshot_escrow.json       # Copy of above — consumed by escrow.js
```

### Pattern 1: Global Config PDA (Singleton)

**What:** A single PDA derived from `[b"config"]` that stores treasury pubkey, ops pubkey, the settlement authority pubkey, an `is_paused` flag, and the config bump. Initialized once by the deployer. Updated by a governance instruction.

**When to use:** Any value that needs to be: (a) validated on-chain, (b) updatable without redeployment, and (c) referenced by multiple instructions. Treasury, ops, and authority are all in this category.

**Example (from verified Helius PDA article and Anchor docs):**
```rust
// Source: anchor-lang.com/docs/basics/pda + helius.dev/blog/solana-pda

#[account]
pub struct GlobalConfig {
    /// Settlement/cancel authority — the server hot wallet pubkey
    pub authority: Pubkey,
    /// Treasury fee destination (7% of pot)
    pub treasury: Pubkey,
    /// Ops fee destination (3% of pot)
    pub ops: Pubkey,
    /// Emergency pause flag — all instructions check this
    pub is_paused: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl GlobalConfig {
    // 8 (discriminator) + 32 (authority) + 32 (treasury) + 32 (ops) + 1 (bool) + 1 (u8)
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1;
    pub const SEED: &'static [u8] = b"config";
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = GlobalConfig::SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

The `initialize_config` instruction must be callable exactly once (enforced by Anchor's `init` — re-init of an existing account fails at the discriminator check). A separate `update_config` instruction can update treasury/ops/authority, protected by `has_one = authority` on the config.

### Pattern 2: Constraint-Based Account Validation in SettleMatch

**What:** Add `constraint` expressions that link the passed `winner`, `treasury`, and `ops` accounts to validated on-chain state. This directly resolves S001, H001, H002, H003, H008.

**Example:**
```rust
// Source: anchor-lang.com/docs/account-constraints (constraint, has_one patterns)

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority,
        close = authority,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub authority: Signer<'info>,

    // Winner: must be one of the registered players (resolves H008, H002, S001)
    /// CHECK: Constrained to escrow.player_one or player_two
    #[account(
        mut,
        constraint = winner.key() == escrow.player_one
            || winner.key() == escrow.player_two
            @ EscrowError::InvalidWinner
    )]
    pub winner: UncheckedAccount<'info>,

    // Treasury: validated against config PDA (resolves H001, H003, S001, GAP-003, H048)
    /// CHECK: Constrained to config.treasury
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ EscrowError::InvalidTreasury,
        constraint = treasury.key() != ops.key() @ EscrowError::DuplicateFeeAccount,
    )]
    pub treasury: UncheckedAccount<'info>,

    // Ops: validated against config PDA
    /// CHECK: Constrained to config.ops
    #[account(
        mut,
        constraint = ops.key() == config.ops @ EscrowError::InvalidOps,
    )]
    pub ops: UncheckedAccount<'info>,

    // Config PDA — singleton, provides validated treasury/ops/authority pubkeys
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}
```

### Pattern 3: Emergency Pause Guard

**What:** Add `constraint = !config.is_paused @ EscrowError::ProgramPaused` to every instruction that moves or modifies funds. A separate `pause_program` instruction (callable by authority only) sets `config.is_paused = true`.

**When to use:** On every economic instruction: `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. Also on `pause_program` itself? No — the pause instruction must work even when paused (so emergency pause can be applied multiple times safely). `unpause_program` would need the same.

**Example:**
```rust
// pause_program instruction
pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
    ctx.accounts.config.is_paused = true;
    Ok(())
}

#[derive(Accounts)]
pub struct PauseProgram<'info> {
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

### Pattern 4: Checked Arithmetic with u128 Widening

**What:** Replace raw `*`, `+` with `checked_mul`, `checked_add`, `checked_sub`. Use u128 intermediates for BPS multiplication to eliminate overflow even at u64::MAX wager values (BOK INV-006 verified).

**Example (from BOK GAP-002 fix):**
```rust
// Source: .bok/reports/2026-02-21-report.md GAP-002 recommended fix

const MIN_WAGER_LAMPORTS: u64 = 10_000;   // OC-08
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000; // OC-12: 100 SOL

// In settle_match:
let total_pot_128 = (escrow.wager_lamports as u128)
    .checked_mul(2)
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
    .checked_sub(treasury_amount)
    .ok_or(EscrowError::ArithmeticOverflow)?
    .checked_sub(ops_amount)
    .ok_or(EscrowError::ArithmeticOverflow)?;

// In cancel_match timeout check:
let is_timed_out = Clock::get()?.unix_timestamp >
    escrow.activated_at  // use activated_at not created_at (OC-07)
        .checked_add(TIMEOUT_SECONDS)
        .ok_or(EscrowError::ArithmeticOverflow)?;
```

### Pattern 5: Terminal State Before Transfers (Defense-in-Depth)

**What:** Set `escrow.state = MatchState::Settled` before any lamport transfers in `settle_match`. Set `escrow.state = MatchState::Cancelled` before refunds in `cancel_match`. This is defense-in-depth: Anchor's `close` is atomic and makes this redundant in practice, but it protects against future instruction modifications that might remove `close`.

**Example (from BOK GAP-004/GAP-005 fix):**
```rust
// In settle_match — set state BEFORE transfers
let escrow = &mut ctx.accounts.escrow;
escrow.state = MatchState::Settled;  // terminal state first

// Then proceed with lamport transfers
**ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
// ...
```

Note: Taking `&mut ctx.accounts.escrow` and then calling `to_account_info()` on `ctx.accounts.escrow` (shared borrow) in the same scope causes a Rust borrow-checker conflict. The working pattern from the existing code is: read values into local variables BEFORE the mutable borrow, then take `&mut`. Alternatively, the state write can happen on a separate scope before the lamport manipulation.

### Pattern 6: Settlement Deadline via activated_at Field

**What:** Add `activated_at: i64` to `MatchEscrow`. Set it when `state` transitions to `Active` (in `deposit_wager`). Use it as the timeout reference in `cancel_match`. Optionally enforce a settlement deadline in `settle_match` (OC-07).

**Impact on SPACE:** Adding one `i64` (8 bytes) to `MatchEscrow`. Current SPACE = 160 bytes. New SPACE = 168 bytes. This requires a new program deploy (account size is set at init). The existing devnet escrow can be abandoned.

### Anti-Patterns to Avoid

- **`UncheckedAccount` with only `/// CHECK:` comment:** This is exactly the current bug. Every `UncheckedAccount` must have a real Anchor constraint. If you write `/// CHECK:` without an actual constraint attribute, Anchor will compile but the check is only in comments — not enforced.
- **Borrow conflict in single mutable scope:** Do not take `&mut ctx.accounts.escrow` and then call `ctx.accounts.escrow.to_account_info()` in the same scope. This is the existing pattern in `deposit_wager` — it works because values are read before the mutable borrow. Maintain this discipline throughout.
- **Reusing program ID after structural changes:** The `MatchEscrow` account SPACE changes (adding `activated_at`). The existing devnet PDA layout is incompatible. A new program deploy with a new program ID is required. Do not attempt to migrate existing PDAs.
- **Forgetting to update IDL after program changes:** Every new account type, instruction, field, or error must be reflected in the IDL. Run `anchor build` to regenerate, then copy `target/idl/solshot_escrow.json` to `server/idl/`. Failure to do this causes server-side Anchor client to misparse accounts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Account address validation | Manual `require!(account.key() == expected)` inside instruction body | Anchor `constraint = ...` or `address = ...` or `has_one = ...` in `#[derive(Accounts)]` | Anchor constraints fail before instruction body executes, preventing partial state mutations. Manual checks in the body can be bypassed if the account is passed as the wrong type. |
| BPS arithmetic overflow protection | Custom overflow-aware BPS function | u128 widening per BOK GAP-002 pattern | BOK INV-006 proved u128 widening handles all valid u64 inputs with zero overflow. Do not invent new patterns. |
| Config PDA uniqueness | Separate registry contract | Anchor's `init` on PDA with constant seeds | `init` with `seeds = [b"config"]` is a singleton by construction — the same PDA address can only be initialized once. |
| Pause checking | Separate pause-check function called inside each instruction | `constraint = !config.is_paused` in account struct | Constraints run atomically at account resolution before any instruction logic. A function call inside the instruction body could be bypassed by instruction reordering or future code changes. |
| Arithmetic checked operations | try/catch wrappers on raw arithmetic | Rust `checked_mul(...).ok_or(Error::ArithmeticOverflow)?` | Idiomatic Rust. `overflow-checks = true` in Cargo.toml may not be guaranteed across all SBF toolchain versions (BOK NC-001). |

**Key insight:** Anchor's constraint system is the program's security boundary. Every economic invariant that can be expressed as a constraint MUST be expressed as a constraint, not as manual code inside instruction bodies.

---

## Common Pitfalls

### Pitfall 1: SPACE Miscalculation After Adding Fields

**What goes wrong:** Adding `activated_at: i64` to `MatchEscrow` and `GlobalConfig` account requires updating `SPACE` constants. If SPACE is too small, Anchor's `init` fails with `AccountDidNotSerialize` or corrupts adjacent memory.

**Why it happens:** Developers forget that Anchor's space allocation is fixed at `init` time. The `SPACE` constant in `impl MatchEscrow` is a pure Rust usize — no compiler catches a wrong value.

**How to avoid:** Always recalculate SPACE field-by-field and add a comment showing the breakdown (as in the existing code's `impl MatchEscrow`). For `MatchEscrow` after adding `activated_at`:
```
8  discriminator
36 String (4 + 32 max)
32 authority (Pubkey)
32 player_one (Pubkey)
32 player_two (Pubkey)
8  wager_lamports (u64)
1  player_one_deposited (bool)
1  player_two_deposited (bool)
1  state (enum, 4 variants = 1 byte)
8  created_at (i64)
8  activated_at (i64)   <-- NEW
1  bump (u8)
---
168 total
```

**Warning signs:** Anchor error `AccountDidNotSerialize` or `AccountSizeError` in tests.

### Pitfall 2: New Program ID Required — Coordinate with Server

**What goes wrong:** Changing `MatchEscrow::SPACE` requires a new program deploy. The new program gets a new program ID. The server's `escrow.js` and client's `.env` both hardcode the program ID. If they are not updated atomically with the deploy, all escrow operations fail silently (wrong program ID → transaction rejected).

**Why it happens:** The program ID is in three places: `declare_id!()` in `lib.rs`, `server/services/escrow.js:31` (PROGRAM_ID constant), and `client/.env` (REACT_APP_ESCROW_PROGRAM_ID). Only the Rust side is changed during build; the JS side requires manual updates.

**How to avoid:** OC-14 requires updating IDL and server service as the final step of Phase 1. The deploy sequence is: (1) `anchor build`, (2) `anchor deploy` (new program ID), (3) update `declare_id!()` with new ID, (4) rebuild, (5) copy IDL, (6) update `PROGRAM_ID` in `escrow.js`, (7) update `.env` files.

**Warning signs:** Server logs `[Escrow] Program ID: <old_id>` after deploy; transactions consistently fail with `ProgramAccountNotFound`.

### Pitfall 3: Borrow Checker Conflict in SettleMatch/CancelMatch After Adding State Write

**What goes wrong:** OC-10 requires setting `escrow.state = MatchState::Settled` BEFORE the lamport transfers. But lamport transfers require `ctx.accounts.escrow.to_account_info()` (shared borrow) which conflicts with the earlier `let escrow = &mut ctx.accounts.escrow` (mutable borrow).

**Why it happens:** Rust's borrow checker rejects simultaneous mutable and shared borrows of the same value. The existing code workarounds this by reading all values into locals BEFORE taking the mutable borrow.

**How to avoid:** Read all needed values into local variables first. Then do the state mutation (mutable borrow, drops at end of scope). Then do lamport transfers using fresh `to_account_info()` calls.

```rust
// CORRECT pattern:
let winner_amount = ...;   // computed from locals
let treasury_amount = ...; // computed from locals
let match_id = ctx.accounts.escrow.match_id.clone();

// Mutable borrow scope
{
    let escrow = &mut ctx.accounts.escrow;
    escrow.state = MatchState::Settled;
}  // mutable borrow dropped here

// Now safe to call to_account_info() (shared borrows)
**ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
```

**Warning signs:** Rust compile error `cannot borrow 'ctx.accounts.escrow' as immutable because it is also borrowed as mutable`.

### Pitfall 4: Anchor 0.32.1 Windows Build Issues (Known Constraint)

**What goes wrong:** The existing note in MEMORY.md records that Anchor 0.32.1 on Windows requires the workspace Cargo.toml to use explicit path (not glob `programs/*`). This is already correct (`members = ["programs/solshot-escrow"]`). Do not change this.

**Why it happens:** Windows path separator issues with glob expansion in older Cargo workspace resolvers.

**How to avoid:** Do not add glob patterns to workspace members. If a test crate is added (e.g., for BOK arithmetic), add it as an explicit path entry.

**Warning signs:** `error[E0463]: can't find crate` during `cargo build-sbf`.

### Pitfall 5: IDL Discriminator Changes Break Existing Server Code

**What goes wrong:** Adding new instructions (`initialize_config`, `pause_program`, `unpause_program`, `update_config`) generates new IDL entries. The discriminator for existing instructions does NOT change (discriminators are based on instruction name hash, not position). However, the `MatchEscrow` account discriminator will change if the account struct name changes. Do NOT rename `MatchEscrow`.

**Why it happens:** Anchor generates instruction discriminators as `sha256("global:<instruction_name>")[0..8]`. Account discriminators are `sha256("account:<AccountName>")[0..8]`. Renaming either changes the discriminator, breaking the server's Anchor client.

**How to avoid:** Keep all existing names (`MatchEscrow`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`). Add new accounts and instructions without modifying existing names.

**Warning signs:** Server error `Account discriminator did not match` when fetching escrow state.

### Pitfall 6: OC-13 — Upgrade Authority Must Be Addressed Before Mainnet, Not Now

**What goes wrong:** SOS H027 recommends transferring the upgrade authority to a multisig before mainnet. This is the correct recommendation. However, doing it on devnet now (during development) makes the program immutable and impossible to update without multisig coordination for every subsequent iteration.

**Why it happens:** Developers conflate "fix the finding" with "apply the finding's recommendation immediately".

**How to avoid:** OC-13 is explicitly a pre-mainnet action. During Phase 1 devnet work, keep the upgrade authority on the server keypair for iteration speed. Document this explicitly in deployment notes. OC-13 is the last step before mainnet.

**Warning signs:** Attempting `anchor deploy` and getting `upgrade authority mismatch`.

---

## Code Examples

Verified patterns from the three audit reports and Anchor documentation:

### initialize_config Instruction

```rust
// Source: .audit/FINAL_REPORT.md H026 fix + .bok/reports/2026-02-21-report.md GAP-003
// Pattern: singleton PDA initialized by deployer

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    authority: Pubkey,
    treasury: Pubkey,
    ops: Pubkey,
) -> Result<()> {
    require!(authority != treasury, EscrowError::InvalidConfig);
    require!(authority != ops, EscrowError::InvalidConfig);
    require!(treasury != ops, EscrowError::DuplicateFeeAccount);

    let config = &mut ctx.accounts.config;
    config.authority = authority;
    config.treasury = treasury;
    config.ops = ops;
    config.is_paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = GlobalConfig::SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

### MatchEscrow SPACE After OC-07 (activated_at field)

```rust
// Source: .bok/reports/2026-02-21-report.md INV-017 pattern
impl MatchEscrow {
    /// Account space calculation (with activated_at field added):
    /// 8 (discriminator)
    /// + 4+32 (String match_id, max 32 chars)
    /// + 32 (authority Pubkey)
    /// + 32 (player_one Pubkey)
    /// + 32 (player_two Pubkey)
    /// + 8  (wager_lamports u64)
    /// + 1  (player_one_deposited bool)
    /// + 1  (player_two_deposited bool)
    /// + 1  (state enum, 4 variants)
    /// + 8  (created_at i64)
    /// + 8  (activated_at i64)  <-- NEW for OC-07
    /// + 1  (bump u8)
    /// = 168 total
    pub const SPACE: usize = 8 + (4 + 32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 8 + 1;
}
```

### Winner Account Constraint (OC-02)

```rust
// Source: .audit/FINAL_REPORT.md H008 recommended fix
/// CHECK: Constrained to escrow.player_one or player_two
#[account(
    mut,
    constraint = winner.key() == escrow.player_one
        || winner.key() == escrow.player_two
        @ EscrowError::InvalidWinner
)]
pub winner: UncheckedAccount<'info>,
```

### Authority-Cannot-Cancel-Active Guard (OC-05)

```rust
// Source: .audit/FINAL_REPORT.md H009 recommended fix

let is_authority = caller == escrow.authority;
let is_player = caller == escrow.player_one || caller == escrow.player_two;
let is_timed_out = Clock::get()?.unix_timestamp >
    escrow.activated_at
        .checked_add(TIMEOUT_SECONDS)
        .ok_or(EscrowError::ArithmeticOverflow)?;

require!(
    // Authority can only cancel pre-active matches
    (is_authority && escrow.state == MatchState::AwaitingDeposits)
    // Players can cancel pre-active, or post-timeout
    || (is_player && (escrow.state == MatchState::AwaitingDeposits || is_timed_out)),
    EscrowError::Unauthorized
);
```

### Prevent Authority as Player (OC-06)

```rust
// Source: .audit/FINAL_REPORT.md S005 recommended fix
// In create_match:
require!(player_one != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
require!(player_two != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
```

### Minimum and Maximum Wager (OC-08, OC-12)

```rust
// Source: .bok/reports/2026-02-21-report.md GAP-001 + GAP-008 recommended fixes
const MIN_WAGER_LAMPORTS: u64 = 10_000;          // 0.00001 SOL — BOK: both fees >= 1 lamport
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000; // 100 SOL — BOK: prevents dead/unfundable escrows

// In create_match:
require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall);
require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge);
```

### MatchSettled Event with Fee Destinations (OC-11)

```rust
// Source: .audit/FINAL_REPORT.md S003 recommended fix

#[event]
pub struct MatchSettled {
    pub match_id: String,
    pub winner: Pubkey,
    pub winner_amount: u64,
    pub treasury_account: Pubkey,   // ADDED — enables on-chain monitoring
    pub treasury_amount: u64,
    pub ops_account: Pubkey,        // ADDED — enables on-chain monitoring
    pub ops_amount: u64,
}
```

### Server escrow.js Update for Config PDA (OC-14)

```javascript
// Source: derived from existing escrow.js pattern
// New function needed in escrow.js after Phase 1 deploy:

export function getConfigPDA() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID
    );
}

// settleMatchEscrow must now pass config PDA:
const [configPDA] = getConfigPDA();
const tx = await program.methods
    .settleMatch(winner)
    .accounts({
        escrow: escrowPDA,
        authority: serverKeypair.publicKey,
        winner: winner,
        treasury: new PublicKey(TREASURY_WALLET),
        ops: new PublicKey(OPS_WALLET),
        config: configPDA,
        systemProgram: PublicKey.default,
    })
    .rpc();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single authority key | Config PDA with updatable authority + pause flag | Anchor ecosystem standard since ~2022 | Authority rotation without full program redeploy |
| Hardcoded program addresses | Config PDA stores treasury/ops | Widely adopted for governance-upgradeable protocols | Treasury rotation without redeployment |
| Raw arithmetic | checked_* + u128 widening | Best practice since Solana program audit standards matured ~2023 | Eliminates overflow even at theoretical maximum inputs |
| `close = authority` only | Set terminal state before transfers | Defense-in-depth recommendation from multiple audit frameworks | Prevents double-settle if close mechanism ever changes |

**Deprecated/outdated:**
- `overflow-checks = true` in Cargo.toml release profile: present in the existing workspace Cargo.toml and partially effective on SBF targets, but BOK NC-001 notes this is not verified to work on all toolchain versions. Do not remove it, but do not rely on it as the sole protection.
- Squads Protocol v4 (for full on-chain multisig): The Bulwark H053 fix suggestion mentions Squads. This is aspirational for v1.2. For v1.1 the config PDA pattern with server-side key rotation (Phase 4) satisfies the requirement without adding an external program dependency.

---

## Open Questions

1. **Config PDA authority: use `has_one` or `constraint`?**
   - What we know: Both work. `has_one = authority` checks `config.authority == ctx.accounts.authority.key()`. `constraint = config.authority == authority.key()` is equivalent.
   - What's unclear: `has_one` on a config PDA requires that the account struct has an `authority` field matching the signer. This works cleanly.
   - Recommendation: Use `has_one = authority` on config for settlement, and `constraint = !config.is_paused` for pause. Both can be on the same `#[account(...)]` attribute.

2. **Settlement deadline duration for OC-07**
   - What we know: OC-07 requires a settlement deadline after `activated_at`. The audit doesn't specify the duration.
   - What's unclear: What is the appropriate settlement window? Too short causes false-positive expirations during network congestion; too long reduces player protection.
   - Recommendation: Use `SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600` (1 hour). Matches the typical game session length. Players can self-cancel after this window. Document in constants.

3. **`update_config` instruction — who can call it?**
   - What we know: The config PDA's `authority` field is the server hot wallet for v1.1.
   - What's unclear: Whether a separate emergency/governance key is needed for `update_config` vs. `pause_program`.
   - Recommendation: For v1.1, use the same authority for both. Add a `/// NOTE: v1.2 — separate multisig for update_config` comment. This is sufficient for devnet/initial mainnet.

4. **New program ID vs. upgrade: can we redeploy with `anchor upgrade`?**
   - What we know: `anchor upgrade` upgrades the program at the same program ID only if the upgrade authority matches the deployer. The existing devnet program ID is `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`. Since `MatchEscrow::SPACE` changes, existing PDAs are incompatible regardless.
   - What's unclear: Whether Anchor allows SPACE increases via upgrade (account reallocation). The Anchor `realloc` constraint allows changing an existing account's size but this only applies to mutable accounts that already exist — not newly-created ones.
   - Recommendation: Deploy as a new program (new program ID) rather than upgrading. This avoids any migration concern with existing devnet PDAs, which hold no real funds. Update `declare_id!()`, rebuild, re-copy IDL, update server constants. This is the safest path and the one most consistent with the "fresh start" nature of the redesign.

---

## Sources

### Primary (HIGH confidence)

- `.audit/FINAL_REPORT.md` — Complete SOS audit with code-level fix recommendations for all 37 findings; directly used for OC-01 through OC-13 fix patterns
- `.bok/reports/2026-02-21-report.md` — BOK math verification with exact Rust fix code for GAP-001 through GAP-008; directly used for OC-08 through OC-12 arithmetic patterns
- `.bulwark/FINAL_REPORT.md` — DB off-chain audit with H048/H053 cross-boundary findings; informs OC-01 and OC-03 config PDA scope
- `programs/solshot-escrow/src/lib.rs` — Current 417-LOC program; baseline for all changes
- `server/idl/solshot_escrow.json` — Current IDL; reference for OC-14 (what changes)
- `server/services/escrow.js` — Server Anchor client; reference for OC-14 (what must be updated)
- Anchor 0.32.x account constraints docs (`anchor-lang.com/docs/account-constraints`) — `constraint`, `has_one`, `address`, `seeds`, `bump`, `init` constraint syntax verified
- Anchor 0.32.1 release notes — No breaking changes to constraint system; patch only fixes CLI race condition and realloc deprecation warning
- Helius PDA article (`helius.dev/blog/solana-pda`) — Global config PDA singleton pattern with Anchor code examples

### Secondary (MEDIUM confidence)

- Anchor CHANGELOG (GitHub) — Confirmed 0.32.0 requires Rust 1.89.0+; IDL upload now default in `anchor deploy`; no breaking changes to account constraint syntax
- BOK GAP-002 u128 arithmetic pattern — Verified internally by BOK INV-006 (262,144+ Proptest inputs, all passing)

### Tertiary (LOW confidence)

- WebSearch results for Squads Protocol multisig — Referenced in H053 fix recommendation. Squads v4 is a real protocol. Classified LOW because deep integration is deferred to v1.2 and specifics were not verified.
- WebSearch results for emergency pause best practices — No specific Anchor examples found via search; all pause implementation patterns are derived from audit report recommendations and Anchor constraint documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — anchor-lang 0.32.1 is pinned in Cargo.toml; no new dependencies needed
- Architecture patterns: HIGH — config PDA, constraint validation, checked arithmetic patterns all sourced from official Anchor docs and verified audit fix code
- Pitfalls: HIGH — borrow checker conflict is from existing code; SPACE miscalculation from BOK INV-017; program ID propagation from existing codebase structure
- OC-14 (IDL/server update): HIGH — escrow.js structure fully read; patterns well-understood

**Research date:** 2026-02-21
**Valid until:** 2026-04-01 (stable; Anchor 0.32.x is not fast-moving; constraint syntax unchanged across 0.30-0.32)

---

## Requirement-to-Finding Quick Reference

| Requirement | Findings | Fix Location | Approach |
|-------------|----------|--------------|----------|
| OC-01 | SOS H026, H007; DB H053 | `lib.rs` — new GlobalConfig account + initialize_config instruction | Config PDA with authority field; all economic instructions require config account |
| OC-02 | SOS H008, H002, S001 | `lib.rs` SettleMatch struct | Add `constraint = winner.key() == escrow.player_one \|\| ...` |
| OC-03 | SOS H001, H003, S001; BOK GAP-003; DB H048 | `lib.rs` SettleMatch struct + GlobalConfig | `constraint = treasury.key() == config.treasury` + `treasury != ops` |
| OC-04 | SOS H028 | `lib.rs` — all 4 instruction account structs + new pause_program instruction | `constraint = !config.is_paused` on every instruction |
| OC-05 | SOS H009, S004 | `lib.rs` cancel_match body | Replace `is_authority` short-circuit with `is_authority && state == AwaitingDeposits` |
| OC-06 | SOS S005 | `lib.rs` create_match body | `require!(player_one != authority.key() && player_two != authority.key())` |
| OC-07 | SOS H022, H024 | `lib.rs` MatchEscrow struct + deposit_wager + cancel_match | Add `activated_at: i64`; set on Active transition; use in timeout check |
| OC-08 | SOS H017; BOK GAP-001 | `lib.rs` create_match body | `require!(wager_lamports >= MIN_WAGER_LAMPORTS)` where MIN = 10_000 |
| OC-09 | BOK GAP-002, GAP-007 | `lib.rs` settle_match + deposit_wager (event) + cancel_match (timeout) | u128 widening for BPS math; checked_add for timeout |
| OC-10 | BOK GAP-004, GAP-005 | `lib.rs` settle_match + cancel_match bodies | Set terminal state before transfers; careful borrow scope management |
| OC-11 | SOS S003 | `lib.rs` MatchSettled event struct | Add `treasury_account: Pubkey` and `ops_account: Pubkey` fields |
| OC-12 | BOK GAP-008 | `lib.rs` create_match body | `require!(wager_lamports <= MAX_WAGER_LAMPORTS)` where MAX = 100 SOL |
| OC-13 | SOS H027 | Deployment procedure (not lib.rs) | Defer to mainnet; document in deployment runbook |
| OC-14 | — (integration) | `server/idl/solshot_escrow.json` + `server/services/escrow.js` | `anchor build`, copy IDL, update PROGRAM_ID, add getConfigPDA(), update settleMatchEscrow() |

**New error codes needed:**
- `AuthorityAsPlayer` — OC-06
- `WagerTooSmall` — OC-08
- `WagerTooLarge` — OC-12
- `InvalidTreasury` — OC-03
- `InvalidOps` — OC-03
- `DuplicateFeeAccount` — OC-03
- `ProgramPaused` — OC-04
- `ArithmeticOverflow` — OC-09
- `InvalidConfig` — OC-01 (initialize_config validation)
- `SettlementExpired` — OC-07 (if settlement deadline enforced in settle_match)

**New instructions needed:**
- `initialize_config(authority, treasury, ops)` — one-time deployer call
- `update_config(authority?, treasury?, ops?)` — governance update path
- `pause_program()` — emergency pause
- `unpause_program()` — emergency unpause
