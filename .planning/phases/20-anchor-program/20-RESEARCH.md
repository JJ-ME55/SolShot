# Phase 20: Anchor Program - Research

**Researched:** 2026-02-27
**Domain:** Anchor 0.32.1 on-chain program modification — N-player escrow struct, bitmap deposit tracking, remaining_accounts refund pattern, new instruction start_with_depositors
**Confidence:** HIGH

---

## Summary

Phase 20 rewrites the existing `solshot-escrow` Anchor 0.32.1 program (currently 2-player only) to support 2–4 players via a fixed `[Pubkey; 4]` array, a `deposits_mask: u8` bitmap, and `max_players: u8`. The current program is well-structured and already uses every pattern this phase extends — it just needs its data model, arithmetic, and two instructions widened from binary to N-ary.

The three sub-tasks map cleanly onto the file: **20-01** replaces the account struct and SPACE constant; **20-02** rewrites the three core instructions (create_match, deposit_wager, settle_match) to use the new struct; **20-03** rewrites the two refund instructions (cancel_match, permissionless_reclaim) and adds the new start_with_depositors instruction, both using `ctx.remaining_accounts` for the variable player list.

The `remaining_accounts` pattern is the only new Anchor technique introduced. Its type is `&[AccountInfo<'info>]`; it bypasses the normal `#[derive(Accounts)]` constraint system, so every account's pubkey must be checked manually against `escrow.players[]` before transferring lamports. This manual validation is intentional: the 2-4 player count is variable at runtime, so it cannot be encoded statically in account structs.

**Primary recommendation:** Do the three sub-tasks in order. 20-01 (struct + SPACE) unlocks 20-02 and 20-03. Never attempt 20-02 without the new SPACE constant or the escrow will be under-allocated at creation.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anchor-lang | 0.32.1 | Program framework, account constraints, PDA derivation, error macros | Already pinned in Cargo.toml; exact version in use; do not bump |
| Rust (toolchain) | 1.89.0+ | Required by Anchor 0.32.x for IDL builds | Anchor 0.32.0 release notes require this minimum; already installed |
| proptest | 1 | Property-based tests (existing dev-dep) | Already in Cargo.toml; extend for N-player invariants |
| borsh | 0.10 | Borsh serialization in space tests (existing dev-dep) | Already in Cargo.toml; extend OfflineMatchEscrow replica |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| BN (npm) | existing | Server-side bn.js for lamport math | Not changed in this phase; server changes are phase 21 |
| @coral-xyz/anchor (npm) | existing | TypeScript IDL consumer in escrow.js | IDL sync happens at end of phase after `anchor build` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fixed `[Pubkey; 4]` array | `Vec<Pubkey>` dynamic | Vec uses 4+N*32 bytes with heap allocation; fixed array uses exactly 4*32 = 128 bytes, known at compile time, required for deterministic SPACE constant and PDA rent calculation. Use fixed array. |
| `deposits_mask: u8` bitmap | `player_deposited: [bool; 4]` array | Both work. Bitmap is 1 byte vs 4 bytes; full-deposited check is `mask == (1 << max_players) - 1` vs iterating booleans. Requirements specify bitmap. Use bitmap. |
| `remaining_accounts` for refund routing | Named accounts `player_one` through `player_four` in account struct | Named accounts would require separate instruction variants per player count (cancel_2, cancel_3, cancel_4). remaining_accounts handles 2-4 uniformly. Requirements specify remaining_accounts. Use remaining_accounts. |

**No new installations needed.** All dependencies already in Cargo.toml. After `anchor build`, copy IDL:
```bash
cp target/idl/solshot_escrow.json server/idl/solshot_escrow.json
```

---

## Architecture Patterns

### Recommended Project Structure

Program remains single-file — no module split needed at expected ~750 LOC after changes:

```
programs/solshot-escrow/
  src/
    lib.rs            # Entire program — replace in place
  Cargo.toml          # Unchanged (anchor-lang = "0.32.1")
  tests/
    bok_proptest_fee.rs        # Unchanged (no arithmetic changes in N-player)
    bok_proptest_timestamp.rs  # Update TIMEOUT_SECONDS constant from 86400 to 600
    bok_proptest_space.rs      # Update MATCH_ESCROW_SPACE from 168 to ~236; update OfflineMatchEscrow replica
    bok_litesvm.rs             # Update TIMEOUT_SECONDS constant from 86400 to 600
```

### Pattern 1: N-Player MatchEscrow Struct (ESC-01, ESC-02, ESC-12)

**What:** Replace binary `player_one`/`player_two`/`player_one_deposited`/`player_two_deposited` fields with a fixed `[Pubkey; 4]` array and a `u8` bitmap.

**Why fixed array:** Deterministic SPACE constant. Borsh serializes `[Pubkey; 4]` as exactly 4 * 32 = 128 bytes regardless of how many players are active. `max_players` (a `u8`) tells instructions which slots are valid.

**New struct layout:**
```rust
#[account]
pub struct MatchEscrow {
    pub match_id: String,           // 4+32 = 36
    pub authority: Pubkey,          // 32
    pub players: [Pubkey; 4],       // 4 * 32 = 128  (replaces player_one + player_two)
    pub max_players: u8,            // 1              (new, range 2-4)
    pub wager_lamports: u64,        // 8
    pub deposits_mask: u8,          // 1              (new, replaces two bools)
    pub state: MatchState,          // 1
    pub created_at: i64,            // 8
    pub activated_at: i64,          // 8
    pub bump: u8,                   // 1
}

impl MatchEscrow {
    /// 8 (discriminator)
    /// + 4+32 (String match_id)
    /// + 32   (authority)
    /// + 128  (players [Pubkey; 4])
    /// + 1    (max_players u8)
    /// + 8    (wager_lamports u64)
    /// + 1    (deposits_mask u8)
    /// + 1    (state enum)
    /// + 8    (created_at i64)
    /// + 8    (activated_at i64)
    /// + 1    (bump u8)
    /// = 236
    pub const SPACE: usize = 8 + (4 + 32) + 32 + 128 + 1 + 8 + 1 + 1 + 8 + 8 + 1;
}
```

**Space delta:** 168 → 236 bytes (+68 bytes). This is the most important constant change — it must be done in 20-01 before any instruction touches escrow creation.

**Bitmap usage:**
```rust
// Bit N set = player N has deposited
const FULL_MASK: u8 = (1u8 << max_players) - 1;

// Test bit N
let has_deposited = (escrow.deposits_mask >> player_index) & 1 == 1;

// Set bit N
escrow.deposits_mask |= 1 << player_index;

// All deposited
let fully_deposited = escrow.deposits_mask == (1u8 << escrow.max_players) - 1;

// Count deposited
let num_deposited = escrow.deposits_mask.count_ones() as u64;
```

### Pattern 2: create_match with N Players (ESC-03)

**What:** Accept a `Vec<Pubkey>` of player wallets (2–4), validate distinctness, store in `players[0..n]`, zero-pad `players[n..4]`, set `max_players`.

**Key validations:**
```rust
pub fn create_match(
    ctx: Context<CreateMatch>,
    match_id: String,
    wager_lamports: u64,
    players: Vec<Pubkey>,   // 2-4 wallets
) -> Result<()> {
    require!(players.len() >= 2, EscrowError::TooFewPlayers);   // ESC-14
    require!(players.len() <= 4, EscrowError::TooManyPlayers);  // ESC-14
    require!(match_id.len() <= 32, EscrowError::MatchIdTooLong);
    require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall);
    require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge);

    // Authority not a player
    for p in &players {
        require!(*p != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
    }

    // All distinct
    for i in 0..players.len() {
        for j in (i+1)..players.len() {
            require!(players[i] != players[j], EscrowError::SamePlayer);
        }
    }

    // Write into fixed array
    let mut arr = [Pubkey::default(); 4];
    for (i, p) in players.iter().enumerate() {
        arr[i] = *p;
    }

    let escrow = &mut ctx.accounts.escrow;
    escrow.players = arr;
    escrow.max_players = players.len() as u8;
    escrow.deposits_mask = 0;
    // ... rest of init
}
```

**Rust note:** The `Vec<Pubkey>` parameter in the instruction function is valid in Anchor — it serializes as a length-prefixed Borsh vec in the instruction data. The `#[instruction(match_id: String, ...)]` attribute in the `CreateMatch` account struct only needs to name the parameters used for seeds (`match_id`), which does not change.

### Pattern 3: deposit_wager with Bitmap (ESC-04, ESC-05)

**What:** Identify depositor by iterating `escrow.players[0..max_players]`, find index, check bitmap bit, set bit, check if fully deposited.

```rust
pub fn deposit_wager(ctx: Context<DepositWager>) -> Result<()> {
    let depositor = ctx.accounts.player.key();
    let wager = ctx.accounts.escrow.wager_lamports;
    let match_id = ctx.accounts.escrow.match_id.clone();

    require!(ctx.accounts.escrow.state == MatchState::AwaitingDeposits, EscrowError::InvalidState);

    // Find player index
    let max = ctx.accounts.escrow.max_players as usize;
    let player_index = ctx.accounts.escrow.players[..max]
        .iter()
        .position(|p| *p == depositor)
        .ok_or(EscrowError::NotAPlayer)?;

    // Check not already deposited
    require!(
        (ctx.accounts.escrow.deposits_mask >> player_index) & 1 == 0,
        EscrowError::AlreadyDeposited
    );

    // Transfer (read-only values already extracted above — Rust borrow checker)
    system_program::transfer(/* ... */ wager)?;

    // Now take mutable borrow
    let escrow = &mut ctx.accounts.escrow;
    escrow.deposits_mask |= 1u8 << player_index;

    // Check if all deposited
    let full_mask = (1u8 << escrow.max_players) - 1;
    if escrow.deposits_mask == full_mask {
        escrow.state = MatchState::Active;
        escrow.activated_at = Clock::get()?.unix_timestamp;
        let num_deposited = escrow.deposits_mask.count_ones() as u64;
        let total_pot = wager.checked_mul(num_deposited).ok_or(EscrowError::ArithmeticOverflow)?;
        emit!(MatchActive { match_id, total_pot });
    }

    Ok(())
}
```

### Pattern 4: settle_match with N-Player Pot (ESC-06, ESC-07)

**What:** Total pot = `wager_lamports * num_deposited` (not `* 2`). Winner constraint checks all `players[]` entries.

**Pot calculation change:**
```rust
// OLD (2-player hardcoded):
let total_pot_128 = (wager_lamports as u128).checked_mul(2)...

// NEW (N-player):
let num_deposited = escrow.deposits_mask.count_ones() as u128;
let total_pot_128 = (wager_lamports as u128)
    .checked_mul(num_deposited)
    .ok_or(EscrowError::ArithmeticOverflow)?;
```

**Winner constraint in account struct (ESC-07):**
```rust
/// CHECK: Must be one of the N registered players
#[account(
    mut,
    constraint = (0..escrow.max_players as usize).any(|i| escrow.players[i] == winner.key())
        @ EscrowError::InvalidWinner
)]
pub winner: UncheckedAccount<'info>,
```

### Pattern 5: remaining_accounts Refund (ESC-08, ESC-09)

**What:** `cancel_match` and `permissionless_reclaim` refund only deposited players. Since player count is variable (2–4), player accounts are passed via `ctx.remaining_accounts` rather than named account struct fields.

**How remaining_accounts works:**
- Type is `&[AccountInfo<'info>]` — a slice of Solana account infos
- Accounts are NOT validated by Anchor's `#[derive(Accounts)]` — manual pubkey checks required
- Each `AccountInfo` has `.key()` for pubkey, `.try_borrow_mut_lamports()` for balance
- Client (server via Anchor TypeScript) passes them in the `remainingAccounts` field

**Refund implementation:**
```rust
pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    // Read all values before mutable borrows
    let wager_lamports = ctx.accounts.escrow.wager_lamports;
    let deposits_mask = ctx.accounts.escrow.deposits_mask;
    let max_players = ctx.accounts.escrow.max_players as usize;
    let players = ctx.accounts.escrow.players;
    let match_id = ctx.accounts.escrow.match_id.clone();
    // ... caller auth checks, timeout checks same as existing ...

    // Set terminal state BEFORE transfers
    ctx.accounts.escrow.state = MatchState::Cancelled;

    // Validate and refund remaining_accounts
    for (i, account) in ctx.remaining_accounts.iter().enumerate() {
        // Must be a registered deposited player
        let bit_set = (deposits_mask >> i) & 1 == 1;
        require!(bit_set, EscrowError::InvalidPlayer);          // not a deposited player
        require!(i < max_players, EscrowError::InvalidPlayer);  // index out of range
        require!(
            *account.key == players[i],
            EscrowError::InvalidPlayer                          // key mismatch
        );

        // Transfer lamports
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
        **account.try_borrow_mut_lamports()? += wager_lamports;
    }

    emit!(MatchCancelled {
        match_id,
        players: players.to_vec(),
        deposits_mask,
    });

    Ok(())
}
```

**IMPORTANT security note:** The loop iterates `ctx.remaining_accounts` in order 0..N. The caller (server) must pass accounts in player-index order. The program validates that `account.key == players[i]` — any mismatch rejects the instruction. This prevents refunds to wrong addresses.

**Account struct for cancel_match:**
```rust
#[derive(Accounts)]
pub struct CancelMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        close = caller,          // rent returned to caller after instruction
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
    // NOTE: No named player accounts — they arrive via ctx.remaining_accounts
}
```

**Client/server side (TypeScript):**
```typescript
await program.methods.cancelMatch()
  .accounts({ escrow, caller, config, systemProgram })
  .remainingAccounts(
    depositedPlayerAddresses.map(addr => ({
      pubkey: new PublicKey(addr),
      isSigner: false,
      isWritable: true,
    }))
  )
  .rpc();
```

### Pattern 6: start_with_depositors Instruction (ESC-11)

**What:** Authority can reduce `max_players` to `deposits_mask.count_ones()` (min 2), set state to Active, activate match. This handles the "some players didn't deposit in time" scenario.

```rust
pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
        EscrowError::MatchAlreadyStarted   // ESC-14: new error
    );

    let num_deposited = ctx.accounts.escrow.deposits_mask.count_ones();
    require!(num_deposited >= 2, EscrowError::TooFewPlayers);

    let escrow = &mut ctx.accounts.escrow;
    escrow.max_players = num_deposited as u8;
    escrow.state = MatchState::Active;
    escrow.activated_at = Clock::get()?.unix_timestamp;

    let total_pot = escrow.wager_lamports
        .checked_mul(num_deposited as u64)
        .ok_or(EscrowError::ArithmeticOverflow)?;

    emit!(MatchActive {
        match_id: escrow.match_id.clone(),
        total_pot,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct StartWithDepositors<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    pub authority: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,
}
```

### Pattern 7: Updated Events (ESC-13)

**What:** Replace binary `player_one`/`player_two` fields in events with `players: Vec<Pubkey>` arrays.

```rust
// OLD:
#[event]
pub struct MatchCreated {
    pub match_id: String,
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub wager_lamports: u64,
}

// NEW:
#[event]
pub struct MatchCreated {
    pub match_id: String,
    pub players: Vec<Pubkey>,   // 2-4 players
    pub max_players: u8,
    pub wager_lamports: u64,
}

// OLD:
#[event]
pub struct MatchCancelled {
    pub match_id: String,
    pub refunded_one: bool,
    pub refunded_two: bool,
}

// NEW:
#[event]
pub struct MatchCancelled {
    pub match_id: String,
    pub players: Vec<Pubkey>,   // registered player array
    pub deposits_mask: u8,      // bitmask of who actually got refunded
}
```

### Anti-Patterns to Avoid

- **Passing `Vec<Pubkey>` in account struct:** Anchor account struct fields must be fixed size. Player wallets go in the instruction parameters (create_match) or remaining_accounts (cancel/reclaim), not as account struct fields.
- **Skipping the borrow-read-before-mutable pattern:** The existing lib.rs already uses this pattern (read `wager`, `match_id` etc. before `&mut` borrow). Preserve it in all modified instructions — Rust borrow checker enforces this.
- **Forgetting `close = authority` on cancel:** The existing `cancel_match` and `permissionless_reclaim` both use `close = caller` / `close = authority` to reclaim PDA rent. This must be preserved or rent is stranded.
- **Forgetting `is_writable: true` in remainingAccounts client call:** Accounts in remaining_accounts that receive lamports must be marked writable in the transaction. Server must pass `isWritable: true` for all deposited player accounts.
- **Iterating remaining_accounts without index bounds check:** If caller passes more accounts than `max_players`, the loop could try to validate `players[i]` where `i >= max_players`, hitting `Pubkey::default()`. Add `require!(i < max_players)` guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bitmap full-deposit check | Custom loop counting bools | `deposits_mask == (1u8 << max_players) - 1` | One-instruction integer comparison; already correct pattern |
| Count of deposited players | Manual bit counter | `deposits_mask.count_ones()` | Rust built-in, zero-cost, works on `u8` |
| Player index lookup | Custom search with error handling | `.iter().position(|p| *p == depositor).ok_or(...)` | Standard iterator method, idiomatic Rust |
| N-player SPACE calculation | Guessing or runtime calculation | Explicit constant with comment showing breakdown | Anchor requires compile-time SPACE; must be exact |
| Variable player refund routing | Separate instruction variants per count | `ctx.remaining_accounts` with manual pubkey check | Single instruction handles 2–4 players uniformly |

**Key insight:** The bitmap and fixed array patterns exist precisely to avoid heap allocation in BPF programs. `Vec` in account data requires rent for dynamic size; `[Pubkey; 4]` allocates exactly 128 bytes at creation time. The only place `Vec` is used is in instruction parameters (which live in transaction data, not account storage) and events (which are ephemeral).

---

## Common Pitfalls

### Pitfall 1: SPACE Constant Not Updated Before Any Build

**What goes wrong:** `anchor build` with old SPACE=168 succeeds. `cargo test` creating escrow accounts allocates 168 bytes. After struct adds 128-byte `players` array, any `create_match` call will fail with account-too-small error at runtime — not at compile time.

**Why it happens:** Anchor validates SPACE at runtime when the account is initialized (`init`), not at compile time.

**How to avoid:** 20-01 must update `MatchEscrow::SPACE` to the new value (236) *before* any instruction work in 20-02 or 20-03. This is the strict dependency: SPACE must be correct before any test that calls `create_match`.

**Warning signs:** Test panics with "account data too small" or "not enough space" during `create_match` calls.

### Pitfall 2: Borrow Checker Violation in deposit_wager

**What goes wrong:** The existing `deposit_wager` reads `escrow.wager_lamports` and `escrow.match_id` before the CPI transfer, then takes `&mut escrow` afterward. If you move the index lookup (`players[..max].iter().position(...)`) after the mutable borrow, Rust will reject compilation.

**Why it happens:** `ctx.accounts.escrow` is borrowed immutably for the `.position()` call. Taking `&mut ctx.accounts.escrow` for the state update must come after the immutable borrow ends.

**How to avoid:** Read ALL needed values (`wager`, `match_id`, `player_index`, `deposits_mask`) into locals before the CPI transfer. Then take `&mut escrow` after CPI.

**Warning signs:** Rust compiler error "cannot borrow `ctx.accounts.escrow` as mutable because it is also borrowed as immutable."

### Pitfall 3: remaining_accounts Index Ordering

**What goes wrong:** `cancel_match` iterates `remaining_accounts` with index `i`, expecting `remaining_accounts[i].key == players[i]`. If server passes player accounts in a different order (e.g., only deposited players in deposit-order rather than player-index order), validation fails.

**Why it happens:** The program assumes positional correspondence between `remaining_accounts[i]` and `players[i]`.

**How to avoid:** Server must pass accounts in player-index order (0, 1, 2, 3), skipping non-deposited players or only passing deposited ones in order. The check `(deposits_mask >> i) & 1 == 1` gates refund on each account — non-deposited players should simply not be included in remaining_accounts. Alternative: do a scan (`find` the pubkey in `players[]`) instead of assuming positional correspondence. The positional approach is simpler and cheaper.

**Warning signs:** `EscrowError::InvalidPlayer` error code when calling cancel_match in tests with correct player accounts.

### Pitfall 4: Forgetting to Update Test TIMEOUT_SECONDS

**What goes wrong:** The three existing proptest files (`bok_proptest_timestamp.rs`, `bok_litesvm.rs`, `bok_proptest_space.rs`) hardcode `TIMEOUT_SECONDS = 86400`. After ESC-10 changes it to 600, the test constants diverge from the program. Tests will pass but will be testing wrong timeout values.

**Why it happens:** Tests mirror constants from `lib.rs` manually — there is no import mechanism since tests are standalone (no Anchor BPF dependency).

**How to avoid:** After updating `TIMEOUT_SECONDS` in `lib.rs`, update all four constant mirrors in test files. This is part of 20-01.

**Warning signs:** Tests pass with `TIMEOUT_SECONDS = 86400` after the program uses 600. No compile error — purely a logic divergence.

### Pitfall 5: SPACE Proptest Offline Replica Not Updated

**What goes wrong:** `bok_proptest_space.rs` has `MATCH_ESCROW_SPACE = 168` and an `OfflineMatchEscrow` struct that mirrors the 2-player layout. After 20-01, the test's `OfflineMatchEscrow` still uses `player_one`/`player_two` booleans and the proptest fails (or worse, still passes with the wrong constant).

**Why it happens:** `bok_proptest_space.rs` defines a Borsh-serializable replica struct that must match the on-chain layout exactly. When the on-chain struct changes, the replica must change too.

**How to avoid:** In 20-01, update `OfflineMatchEscrow` in `bok_proptest_space.rs` to match the new struct (replace `player_one`/`player_two` booleans + Pubkeys with `players: [[u8; 32]; 4]` + `max_players: u8` + `deposits_mask: u8`), and update `MATCH_ESCROW_SPACE` to 236.

**Warning signs:** `sb_inv_2a_match_escrow_space_max_id` proptest fails with space mismatch assertion.

### Pitfall 6: McAfee / Windows Antivirus Blocking `solana-test-validator`

**What goes wrong:** Tests that require local validator (`anchor test`) fail silently or with connection refused errors. This is a Windows-specific environment issue documented in project memory.

**Why it happens:** McAfee on Windows intercepts and blocks the `solana-test-validator` binary.

**How to avoid:** Add `solana-test-validator` exclusion in McAfee before running `anchor test`. The proptest and borsh space tests (`cargo test`) run without a validator and are unaffected. Only integration tests requiring a deployed program need the exclusion.

**Warning signs:** `anchor test` fails with connection errors; `cargo test` passes.

### Pitfall 7: IDL Must Sync Atomically After Build

**What goes wrong:** After `anchor build` produces a new IDL at `target/idl/solshot_escrow.json`, the server's `server/idl/solshot_escrow.json` is stale. Server calls fail with "unknown instruction" or "account layout mismatch" errors.

**Why it happens:** The IDL is a separate artifact from the program binary and must be manually copied.

**How to avoid:** After every `anchor build`, run `cp target/idl/solshot_escrow.json server/idl/solshot_escrow.json`. This is the final step of phase 20 success criteria item 1 (verified in `anchor build` success).

**Warning signs:** Server-side Anchor TypeScript client throws during instruction building with field name errors.

### Pitfall 8: Wager Guard Removed (SRV-16) — Phase Boundary

**What goes wrong:** The current server has a wager guard that blocks 3-4 player wagered matches (documented in MEMORY: "SYS-08 wager guard"). Phase 20 is on-chain only. The server guard removal is SRV-16, a Phase 22 task.

**Why it matters:** Phase 20 tests can verify the on-chain program accepts 4 players. But until Phase 22 removes the server guard, the full end-to-end flow won't allow 4-player wagers in practice.

**How to avoid:** Phase 20 success criteria tests directly against on-chain program (via `anchor test`), not via server. Server integration is Phase 21–22.

---

## Code Examples

Verified patterns from the existing codebase and official Anchor docs:

### New SPACE Calculation

```rust
// Source: programs/solshot-escrow/src/lib.rs (verified working pattern from existing code)
impl MatchEscrow {
    /// 8  (discriminator)
    /// + 4+32  (String match_id, max 32 chars)
    /// + 32    (authority Pubkey)
    /// + 128   (players [Pubkey; 4] — 4 * 32)
    /// + 1     (max_players u8)
    /// + 8     (wager_lamports u64)
    /// + 1     (deposits_mask u8)
    /// + 1     (state enum)
    /// + 8     (created_at i64)
    /// + 8     (activated_at i64)
    /// + 1     (bump u8)
    /// = 236
    pub const SPACE: usize = 8 + (4 + 32) + 32 + (4 * 32) + 1 + 8 + 1 + 1 + 8 + 8 + 1;
    // = 8 + 36 + 32 + 128 + 1 + 8 + 1 + 1 + 8 + 8 + 1 = 232... recheck: yes 232 not 236
    // Careful: 8+36=44, +32=76, +128=204, +1=205, +8=213, +1=214, +1=215, +8=223, +8=231, +1=232
    // Correct value is 232. The "~236" in requirements is an approximation. Compute exactly.
}
```

**CRITICAL NOTE:** Requirements say "~236 bytes" but the arithmetic is 232. Verify by computing explicitly:
- 8 (disc) + 36 (String) + 32 (authority) + 128 (players) + 1 (max_players) + 8 (wager) + 1 (deposits_mask) + 1 (state) + 8 (created_at) + 8 (activated_at) + 1 (bump) = **232 bytes**

This must be verified against the offline Borsh replica in `bok_proptest_space.rs`. Trust the arithmetic, not the "~236" estimate.

### Bitmap Operations

```rust
// Source: standard Rust bit manipulation (no library needed)

// N = player index (0..max_players-1)
// Check if deposited
let deposited = (escrow.deposits_mask >> n) & 1 == 1;

// Set deposited
escrow.deposits_mask |= 1u8 << n;

// Count deposited players
let num_deposited = escrow.deposits_mask.count_ones() as u64;

// Check all deposited (all max_players bits set)
let full_mask = (1u8 << escrow.max_players) - 1;
let all_deposited = escrow.deposits_mask == full_mask;
```

### remaining_accounts Iteration with Pubkey Validation

```rust
// Source: Anchor docs + ctx.remaining_accounts type is &[AccountInfo<'info>]
// The pattern below mirrors what transfer hooks and multi-account examples use

// In cancel_match instruction handler:
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    // 1. Bounds: only iterate up to max_players
    require!(i < escrow_max_players, EscrowError::InvalidPlayer);

    // 2. Verify this slot was deposited
    let bit_set = (escrow_deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);

    // 3. Verify pubkey matches registered player
    require!(*account.key == escrow_players[i], EscrowError::InvalidPlayer);

    // 4. Transfer lamports from escrow PDA to player
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

### Updated OfflineMatchEscrow for Proptest Space Tests

```rust
// Source: programs/solshot-escrow/tests/bok_proptest_space.rs (to be updated in 20-01)
// Replace the current OfflineMatchEscrow with this N-player version:

#[derive(BorshSerialize, Debug)]
struct OfflineMatchEscrow {
    match_id: String,
    authority: [u8; 32],
    players: [[u8; 32]; 4],   // replaces player_one + player_two
    max_players: u8,           // new
    wager_lamports: u64,
    deposits_mask: u8,         // replaces player_one_deposited + player_two_deposited
    state: OfflineMatchState,
    created_at: i64,
    activated_at: i64,
    bump: u8,
}
// Also update: const MATCH_ESCROW_SPACE: usize = 232;  (or compute exactly from borsh)
```

### Error Code Extensions (ESC-14)

```rust
// Source: programs/solshot-escrow/src/lib.rs (extend existing EscrowError enum)
#[error_code]
pub enum EscrowError {
    // ... existing codes unchanged ...

    // ESC-14: New error codes for N-player validation
    #[msg("Match requires at least 2 players")]
    TooFewPlayers,
    #[msg("Match supports at most 4 players")]
    TooManyPlayers,
    #[msg("Match has already started")]
    MatchAlreadyStarted,
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary `player_one`/`player_two` Pubkeys | Fixed `[Pubkey; 4]` array with `max_players: u8` | Phase 20 | Supports 2–4 without new instruction variants |
| `player_one_deposited: bool` + `player_two_deposited: bool` | `deposits_mask: u8` bitmap | Phase 20 | 1 byte instead of 2; clean full-deposit check |
| `total_pot = wager * 2` | `total_pot = wager * num_deposited` | Phase 20 | Correct pot for 3-4 player matches |
| Named `player_one`/`player_two` in CancelMatch account struct | `ctx.remaining_accounts` iteration | Phase 20 | Single instruction handles 2–4 players |
| `TIMEOUT_SECONDS = 86400` (24h) | `TIMEOUT_SECONDS = 600` (10 min) | Phase 20 | Higher no-show risk with more players; 10 min matches server-side 5-min timer with buffer |
| No `start_with_depositors` | New instruction for partial-deposit start | Phase 20 | Handles scenario where some players didn't deposit in time |

**Deprecated/outdated fields being removed:**
- `player_one: Pubkey` → slot 0 of `players: [Pubkey; 4]`
- `player_two: Pubkey` → slot 1 of `players: [Pubkey; 4]`
- `player_one_deposited: bool` → bit 0 of `deposits_mask: u8`
- `player_two_deposited: bool` → bit 1 of `deposits_mask: u8`

---

## Open Questions

1. **SPACE constant: 232 vs "~236" from requirements**
   - What we know: Explicit arithmetic gives 232 bytes. Requirements say "~236 bytes."
   - What's unclear: The "~236" in ESC-12 is an estimate; the exact value is what matters for `anchor build` to succeed.
   - Recommendation: Compute exactly (8 + 36 + 32 + 128 + 1 + 8 + 1 + 1 + 8 + 8 + 1 = 232) and confirm with `bok_proptest_space.rs` borsh serialization test. Trust the borsh test output, not the requirements estimate.

2. **remaining_accounts ordering convention for cancel/reclaim**
   - What we know: Positional indexing (`remaining_accounts[i]` maps to `players[i]`) is simpler and cheaper gas-wise than a search. Server must pass accounts in player-index order.
   - What's unclear: Should non-deposited players be omitted from remaining_accounts (cleaner) or included with a skip (safer)? The loop structure above assumes only deposited players are passed.
   - Recommendation: Require caller to pass only deposited players in index order. The `bit_set` check rejects any account whose corresponding bit is 0 — this prevents refund to non-depositors while keeping the loop simple.

3. **start_with_depositors: timeout prerequisite?**
   - What we know: ESC-11 says authority can call this to reduce max_players and activate. The requirement doesn't specify whether it requires a timeout to have elapsed.
   - What's unclear: Should authority be able to call start_with_depositors immediately (before deposit timeout)? The brief says "host chooses" on timeout fire (SRV-13, SRV-14).
   - Recommendation: No timeout prerequisite on-chain. Let authority call at any time while state is AwaitingDeposits. The server-side deposit timer (Phase 22) enforces the 5-minute window. On-chain restriction adds complexity without security benefit (authority is already trusted).

4. **Players array zeroed slots (players[n..4] = Pubkey::default())**
   - What we know: For a 3-player match, `players[3]` will be `Pubkey::default()`. The settle_match winner constraint iterates `0..max_players`, not `0..4`, so the zero-padded slot is never checked.
   - What's unclear: Could `Pubkey::default()` (system program address) ever match a real player or cause a spurious constraint hit?
   - Recommendation: The winner constraint `(0..escrow.max_players as usize).any(...)` explicitly bounds to `max_players`, skipping zero-padded slots. This is safe.

---

## Sources

### Primary (HIGH confidence)

- Existing `programs/solshot-escrow/src/lib.rs` — current 2-player program (all patterns verified working in production)
- Existing test files (`bok_proptest_fee.rs`, `bok_proptest_space.rs`, `bok_proptest_timestamp.rs`, `bok_litesvm.rs`) — current test structure and invariants
- `.planning/REQUIREMENTS.md` — authoritative ESC-01 through ESC-14 specification
- Anchor 0.32.1 changelog (WebFetch verified) — no breaking changes to account constraints or remaining_accounts in 0.30–0.32

### Secondary (MEDIUM confidence)

- Anchor docs (WebFetch: `anchor-lang.com/docs/the-program-module`) — `ctx.remaining_accounts` is `&[AccountInfo<'info>]`, bypass validation is confirmed
- OSEC blog (WebFetch: `osec.io/blog/2025-05-14-king-of-the-sol`) — lamport transfer security (writable requirement, rent-exemption trap, executable-account rejection)
- WebSearch + GitHub issues — remaining_accounts `AccountInfo` fields (`.key()`, `.try_borrow_mut_lamports()`)

### Tertiary (LOW confidence — training data, flag for validation)

- SPACE arithmetic (232 bytes) — computed from Borsh layout rules; should be confirmed by updating and running `bok_proptest_space.rs`
- `Vec<Pubkey>` in instruction parameters is valid Anchor Borsh encoding — HIGH confidence from existing code patterns but not explicitly verified against 0.32.1 docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — anchor-lang 0.32.1 already in use, no new dependencies
- Architecture: HIGH — all patterns extend verified working code; remaining_accounts type confirmed via docs
- Pitfalls: HIGH for known issues (borrow checker, SPACE, timeout constant sync); MEDIUM for remaining_accounts ordering convention (design decision)
- SPACE constant: MEDIUM — arithmetic is clear but "~236" vs computed "232" must be confirmed by running borsh test

**Research date:** 2026-02-27
**Valid until:** 2026-04-27 (Anchor 0.32.1 stable, no breaking changes expected; Rust bit manipulation is stable)
