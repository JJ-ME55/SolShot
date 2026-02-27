# Technology Stack — N-Player Escrow Upgrade

**Project:** SolShot — 2-Player Escrow → 2-4 Player Escrow
**Researched:** 2026-02-27
**Scope:** Anchor/Solana patterns only. Game engine and server stack not re-researched (see existing STACK.md for those dimensions).

---

## Research Approach

This document answers seven specific questions about upgrading the existing 2-player escrow PDA to support 2-4 players. Each section states findings with confidence levels and cites the source that verified the claim. Training data was treated as hypothesis and verified against official documentation where possible.

---

## Question 1: Fixed-Size Array vs Vec for Player Pubkeys

**Recommendation: Use `[Pubkey; 4]` (fixed-size array), not `Vec<Pubkey>`.**

### Why Fixed Array

**Space is constant and statically provable.** Anchor's `space` constraint is set at account creation time and never changes. A fixed array `[Pubkey; 4]` occupies exactly `32 * 4 = 128 bytes` always. A `Vec<Pubkey>` with max 4 entries occupies `4 + (32 * 4) = 132 bytes` — only 4 bytes larger — but introduces a Rust heap allocation and requires you to trust that the runtime never writes more than `max_capacity` entries.

**No realloc needed.** The existing escrow program is initialized once per match and then read-only for its player registry. There is no scenario where you discover mid-match that you need more player slots than you allocated. Fixed arrays eliminate the need for an `#[account(realloc = ...)]` instruction.

**Vec has no on-chain size enforcement.** Anchor does not prevent you from pushing a 5th element into a `Vec<Pubkey>` that was allocated for 4. Overflow corrupts account data. With `[Pubkey; 4]` the Rust compiler enforces the bound at compile time.

**Deserialization cost.** Anchor's `Account<T>` eagerly deserializes the entire account on every instruction. For a small struct like MatchEscrow, eager deserialization is fast. There is no justification for zero-copy (`AccountLoader`) at this scale.

### The Trade-off

A `[Pubkey; 4]` array wastes 32-64 bytes for 2-3 player matches (unused slots contain `Pubkey::default()`). This is not a meaningful cost — Solana's rent exemption for the escrow account is already dominated by the 168-byte 2-player version, and the 4-player version adds roughly 0.0002 SOL more in rent.

### Slot Convention

Unused player slots are `Pubkey::default()` (all-zero). The `player_count: u8` field (added alongside the array) is the authoritative count. All program logic iterates up to `player_count`, not the full array length.

**Confidence: HIGH** — Anchor space reference table verified via official docs. Array vs Vec trade-off verified via Anchor documentation on eager deserialization.

---

## Question 2: Deposit Tracking — Bool Array vs Bitmap vs Separate Accounts

**Recommendation: Use `deposits_mask: u8` (8-bit bitmap).**

### Options Analysis

**Option A: `[bool; 4]` array**
- 4 bytes (one per bool)
- Readable but wastes space relative to a bitmap
- No compile-time enforcement that index < player_count

**Option B: `deposits_mask: u8` (bitmap)**
- 1 byte
- Bit N set means player at slot N has deposited
- `all_deposited = deposits_mask == (1u8 << player_count) - 1`
- `player_deposited = (deposits_mask >> slot) & 1 == 1`
- Compact, efficient, and the "all deposited" check is a single comparison
- Refund iteration: loop `slot in 0..player_count`, check bit, refund if set

**Option C: Separate deposit receipt accounts per player**
- One PDA per player keyed on `["deposit", match_id, player_pubkey]`
- Scales beyond 8 players (not needed here)
- Adds 3-4 extra PDAs per match, complicates settle/cancel account lists dramatically
- Zero benefit for max 4 players

**Recommendation:** Use `deposits_mask: u8`. It saves 3 bytes over the bool array and makes the "all deposited" check unambiguous. The existing codebase already uses direct borrow-mut lamport manipulation, which means the deposit-tracking logic is isolated in `deposit_wager` — a bitmap is easy to introduce there.

### Bitmap Mechanics

```rust
// In deposit_wager:
let slot = escrow.players[..escrow.player_count as usize]
    .iter()
    .position(|&pk| pk == depositor)
    .ok_or(EscrowError::NotAPlayer)?;

require!((escrow.deposits_mask >> slot) & 1 == 0, EscrowError::AlreadyDeposited);
escrow.deposits_mask |= 1u8 << slot;

let all_deposited = escrow.deposits_mask == (1u8 << escrow.player_count) - 1;
if all_deposited {
    escrow.state = MatchState::Active;
    escrow.activated_at = Clock::get()?.unix_timestamp;
}
```

**Confidence: HIGH** — Bitmap pattern is standard Rust bit manipulation. Byte sizes verified from Anchor space reference table.

---

## Question 3: Account Space Calculation for 2-4 Players

### Type Size Reference (Anchor Official Docs)

| Type | Bytes |
|------|-------|
| Discriminator (always) | 8 |
| `bool` | 1 |
| `u8` | 1 |
| `u64` | 8 |
| `i64` | 8 |
| `Pubkey` | 32 |
| `[Pubkey; N]` | `32 * N` |
| `Vec<T>` | `4 + (size(T) * capacity)` |
| `String` (max N chars) | `4 + N` |
| Enum (4 variants) | 1 |

### Current MatchEscrow (2-player): 168 bytes

```
8   discriminator
36  match_id (4 + 32 max chars)
32  authority
32  player_one
32  player_two
8   wager_lamports
1   player_one_deposited
1   player_two_deposited
1   state (enum)
8   created_at
8   activated_at
1   bump
= 168 bytes
```

### Proposed N-Player MatchEscrow

```
8   discriminator
36  match_id (4 + 32 max chars)
32  authority
128 players: [Pubkey; 4]       (32 * 4)
1   player_count: u8
8   wager_lamports
1   deposits_mask: u8
1   state: MatchState (enum)
8   created_at
8   activated_at
1   bump
= 232 bytes
```

### Comparison

| Players | Old SPACE | New SPACE | Rent Increase |
|---------|-----------|-----------|---------------|
| 2 | 168 bytes | 232 bytes | ~0.00014 SOL |
| 3 | N/A | 232 bytes | same |
| 4 | N/A | 232 bytes | same |

The new account is 64 bytes larger regardless of player count. Unused player slots hold `Pubkey::default()`. The rent difference is negligible — roughly 0.00014 SOL more rent-exempt deposit, recovered when the account closes.

### SPACE Constant

```rust
impl MatchEscrow {
    /// 8 (discriminator)
    /// + 4+32 (match_id String, max 32 chars)
    /// + 32   (authority)
    /// + 128  (players [Pubkey; 4])
    /// + 1    (player_count u8)
    /// + 8    (wager_lamports u64)
    /// + 1    (deposits_mask u8)
    /// + 1    (state enum)
    /// + 8    (created_at i64)
    /// + 8    (activated_at i64)
    /// + 1    (bump u8)
    /// = 232
    pub const SPACE: usize = 8 + (4 + 32) + 32 + (32 * 4) + 1 + 8 + 1 + 1 + 8 + 8 + 1;
}
```

**Confidence: HIGH** — Byte sizes from Anchor official space reference. Calculation verified manually.

---

## Question 4: Partial Deposit Handling — Start vs Cancel

**Recommendation: Implement the "vote to start" pattern with server-enforced authority cancel.**

The target spec says "depositors choose start or cancel" — this means: if not all players deposit within the timeout, the deposited players must be able to vote to either start the match without the missing player(s) or cancel and recover their funds.

### Pattern A: Authority-Initiated Start (Recommended)

The server authority has full visibility into who has joined and deposited. Rather than an on-chain vote, the server makes the decision: after the deposit timeout, if at least 2 players have deposited, the server calls `force_start(match_id)` with the `deposits_mask` to activate the match with only the deposited players. Non-deposited slots are zeroed out.

This is not trustless (it requires trusting the server authority), but the existing program is already trust-gated on authority for settle and cancel. The security model does not regress.

**Why this is correct for SolShot:** Players already trust the server to call `settle_match` honestly. Adding `force_start` maintains the same trust boundary. The alternative (on-chain voting) requires an additional instruction, a per-player vote PDA, and coordination logic that adds 3-4x the complexity for no meaningful trust improvement given the existing model.

### Pattern B: Per-Player Cancel (Always Available)

Any player who has deposited can call `cancel_match` during `AwaitingDeposits` state to trigger a full refund to all depositors. This is already in the existing program. For N players, the cancel instruction iterates `deposits_mask` bits and refunds each deposited player.

The restriction in OC-05 (authority can only cancel AwaitingDeposits) and the player cancel rules carry over unchanged.

### Timeout Behaviour for Partial Deposits

The existing `TIMEOUT_SECONDS = 86400` (24h) and `PERMISSIONLESS_RECLAIM_TIMEOUT = 172800` (48h) cover the partial deposit case adequately:

- 5-10 minute game timeout: handled at the server/socket layer, not on-chain. The on-chain escrow is for financial custody only. The server can detect the deposit timeout and call `cancel_match` (authority cancelling AwaitingDeposits state) within seconds.
- The 24h on-chain timeout is a backstop for the case where the server dies before calling cancel. For a live game, the server handles the 5-10 minute window.

**No new on-chain instruction is needed for partial deposit handling** if the server authority cancels on timeout. Add `force_start` only if you want the server to be able to start a 3-player match when the 4th player never deposits. This is a product decision, not a technical one.

**Confidence: MEDIUM** — Pattern derived from existing program structure and Anchor documentation. No authoritative reference for "N-player partial deposit" specifically — this is a design synthesis.

---

## Question 5: Anchor Account Validation for Variable Player Accounts

**Recommendation: Use `remaining_accounts` for player refund destinations in cancel/settle; keep fixed typed accounts for authority, config, and escrow.**

### The Problem

In `cancel_match` and `settle_match`, the program must transfer lamports to player wallets. For 2 players, these are typed accounts in the `#[derive(Accounts)]` struct. For up to 4 players, you could add `player_three` and `player_four` as optional typed accounts — but Anchor has no native "optional account" concept in the derive macro. Every account in the struct is required.

### Solution: `ctx.remaining_accounts`

Accounts passed to an instruction after the typed accounts in the struct are accessible via `ctx.remaining_accounts` as a slice of `&AccountInfo`. This is the idiomatic Anchor pattern for variable-count accounts.

```rust
// In CancelMatch accounts struct: remove typed player accounts
// Pass player refund destinations as remaining_accounts instead

// In cancel_match instruction handler:
let escrow = &ctx.accounts.escrow;
let player_count = escrow.player_count as usize;

require!(
    ctx.remaining_accounts.len() == player_count,
    EscrowError::InvalidPlayerCount
);

// Validate each account matches the stored pubkey before touching lamports
for (slot, account_info) in ctx.remaining_accounts.iter().enumerate() {
    require!(
        account_info.key() == escrow.players[slot],
        EscrowError::InvalidPlayer
    );
    require!(account_info.is_writable, EscrowError::AccountNotWritable);

    // Refund if this slot deposited
    if (escrow.deposits_mask >> slot) & 1 == 1 {
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()?
            -= escrow.wager_lamports;
        **account_info.try_borrow_mut_lamports()? += escrow.wager_lamports;
    }
}
```

### Key Security Point

The `account_info.key() == escrow.players[slot]` check is the validation that Anchor's typed account constraints would normally provide. This must be explicit. Without it, a caller could pass arbitrary writable accounts and drain the escrow. This is verified Solana program security practice.

### Settle Match with remaining_accounts

For `settle_match`, the winner is still a single account. The pattern is:
1. Winner account: typed `UncheckedAccount` constrained to `escrow.players[slot]` for some slot (server passes the correct winner pubkey, and the constraint validates it against the stored array)
2. Treasury and ops: typed `UncheckedAccount` constrained to config.treasury / config.ops (unchanged from current)

The winner constraint changes from:
```rust
// Old:
constraint = winner.key() == escrow.player_one || winner.key() == escrow.player_two
```
to:
```rust
// New:
constraint = escrow.players[..escrow.player_count as usize]
    .iter()
    .any(|&pk| pk == winner.key())
    @ EscrowError::InvalidWinner
```

Anchor constraint expressions support method calls, so this works inside the `#[account(...)]` macro.

**Confidence: HIGH** — `remaining_accounts` pattern from official Anchor docs. Direct lamport manipulation pattern from Solana developer guides. Key validation requirement from Solana security documentation.

---

## Question 6: Transaction Size Analysis for 4-Player Settle/Cancel

**Solana legacy transaction limit: 1,232 bytes.**

### Transaction Byte Budget

| Component | Size |
|-----------|------|
| Signature count byte | 1 |
| Signatures (1 signer minimum) | 64 bytes each |
| Message header | 3 bytes |
| Account list (32 bytes each) | variable |
| Recent blockhash | 32 bytes |
| Instruction count byte | 1 |
| Instruction (program ID index + account indices + data) | variable |

For a `settle_match` instruction with 4-player match (authority signs):

| Account | Purpose |
|---------|---------|
| Escrow PDA | match state (writable) |
| Authority | signer (writable) |
| Winner | receives lamports (writable) |
| Treasury | receives fees (writable) |
| Ops | receives fees (writable) |
| Config PDA | read-only validation |
| System program | required for close |

**7 unique accounts × 32 bytes = 224 bytes** for the account list.

Adding header (3), blockhash (32), 1 signature (64), instruction overhead (~50 bytes for program ID index, account indices, instruction data), and compact-array encoding overhead: approximately **420 bytes total**.

The 1,232-byte transaction limit is **not a concern for settle_match or cancel_match** even with 4 players. A transaction using `remaining_accounts` for all 4 player refund destinations would have:
- Fixed accounts: escrow, authority/caller, config, system_program = 4 accounts
- Remaining accounts: 4 player pubkeys = 4 accounts
- Total: 8 accounts × 32 bytes = 256 bytes

Still well under the 1,232-byte limit.

### Versioned Transactions (v0 with Address Lookup Tables)

Not needed. The concern about transaction size limits applies primarily to programs that reference dozens of accounts (DeFi protocols, games with 16+ players, etc.). For 2-4 player SolShot matches, legacy transactions are sufficient.

The SIMD-0296 proposal to raise the limit to 4,096 bytes is in draft as of February 2026 and not yet live on mainnet. Do not depend on it.

**Confidence: HIGH** — Transaction size limit (1,232 bytes) from official Solana documentation. Account count limit (64 max) from official Solana documentation. Byte arithmetic verified manually.

---

## Question 7: Timeout Patterns for N-Player Deposits

**Recommendation: Handle 5-10 minute deposit timeout at the server layer; keep on-chain timeout as backstop only.**

### Two-Tier Timeout Architecture

**Tier 1 (Server, 5-10 minutes):** The Node.js server starts a `setTimeout` when `createRoom` is called with a wager. If not all players have confirmed their deposits via the `escrowDepositConfirm` socket event within the window, the server calls `cancel_match` (authority cancelling `AwaitingDeposits` state). The escrow is already deployed with this capability.

**Tier 2 (On-chain, 24 hours):** The existing `TIMEOUT_SECONDS = 86400` is the backstop for server failure. Any player or the authority can call `cancel_match` after 24 hours if the server died before handling the deposit timeout. The existing `permissionless_reclaim` covers 48h.

This architecture requires zero changes to the on-chain program for the timeout dimension. The 5-10 minute window is a server configuration constant.

### What Changes for N Players

In the 2-player program, `cancel_match` refunds exactly 2 players. In the N-player program, it must refund up to 4 players using the `deposits_mask` iteration pattern described in Question 5. The timeout logic itself (who can cancel when) does not change.

### Per-Player Deposit Timeout (Alternative, Not Recommended)

Some N-player programs use a per-player deposit deadline: player 1 deposits within 5 minutes of room creation, player 2 within 5 minutes of player 1's deposit, etc. This is more complex and provides no real-world benefit for a game lobby where the server orchestrates the flow. The server knows who joined the room before presenting the deposit UI. All deposit windows are effectively simultaneous.

**Confidence: MEDIUM** — Derived from analysis of existing server architecture and escrow program capabilities. No authoritative reference specifically for "game lobby deposit timeout" pattern.

---

## Migration Strategy: 2-Player → N-Player Escrow

### What Changes in the Program

| Element | Old | New |
|---------|-----|-----|
| `player_one: Pubkey` | explicit field | removed |
| `player_two: Pubkey` | explicit field | removed |
| `players: [Pubkey; 4]` | does not exist | added |
| `player_count: u8` | does not exist | added |
| `player_one_deposited: bool` | field | removed |
| `player_two_deposited: bool` | field | removed |
| `deposits_mask: u8` | does not exist | added |
| `MatchEscrow::SPACE` | 168 | 232 |
| `create_match` signature | `player_one, player_two` | `players: Vec<Pubkey>` (instruction param, stored into fixed array) |
| `deposit_wager` logic | if is_p1 / if is_p2 | position scan on `players[]`, bitmap set |
| `settle_match` winner constraint | `== player_one || == player_two` | `players[..count].iter().any(...)` |
| `cancel_match` player accounts | typed `player_one`, `player_two` | `remaining_accounts` loop |
| `permissionless_reclaim` player accounts | typed `player_one`, `player_two` | `remaining_accounts` loop |
| `MatchEscrow::SPACE` constant | 168 | 232 |

### What Does NOT Change

- PDA seeds: `["match", match_id.as_bytes()]` — unchanged
- Program ID: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` — unchanged (program is upgraded, not redeployed)
- `GlobalConfig` PDA and all config instructions — unchanged
- Settlement math: 90/7/3 BPS split on `wager * player_count` total pot — only the `total_pot` calculation changes (`wager * player_count` instead of `wager * 2`)
- Emergency pause, authority model, all error codes — unchanged
- `MatchState` enum — unchanged (AwaitingDeposits, Active, Settled, Cancelled)

### Realloc: Not Needed

The new account struct is 232 bytes. Existing deployed escrow accounts are 168 bytes. Because existing accounts on devnet are dev-only throwaway data, there is no migration concern. The program upgrade changes `SPACE` in the init constraint; existing accounts (if any) are closed before the upgrade.

On mainnet, a size change from 168 → 232 bytes would require either: (a) closing and recreating all existing escrow accounts, or (b) using `#[account(realloc = 232, realloc::payer = authority, realloc::zero = false)]` on a migration instruction. For devnet, neither is needed — just bump the program and redeploy.

**Confidence: HIGH** — Realloc constraint verified from Anchor documentation. Upgrade vs redeploy distinction from Anchor upgrade documentation.

---

## Server-Side Changes (escrow.js)

### `createMatch` Call

```js
// Old:
await program.methods.createMatch(matchId, wagerBN, player1Pk, player2Pk)

// New:
await program.methods.createMatch(matchId, wagerBN, [p1Pk, p2Pk, p3Pk, ...].slice(0, playerCount))
// instruction takes Vec<Pubkey> (max 4), stored into [Pubkey; 4] with Pubkey::default() padding
```

### `cancelMatch` Call

Cancel must pass all registered players as remaining accounts. The server knows all player pubkeys from `room.players[]`.

```js
const remainingAccounts = room.players.slice(0, room.playerCount).map(p => ({
    pubkey: new PublicKey(p.wallet),
    isWritable: true,
    isSigner: false,
}));

await program.methods.cancelMatch()
    .accounts({ escrow, caller, config, systemProgram })
    .remainingAccounts(remainingAccounts)
    .rpc();
```

### `settleMatch` Call

Winner is passed by pubkey; the constraint validates it against the stored players array.

```js
await program.methods.settleMatch(new PublicKey(winnerWallet))
    .accounts({ escrow, authority, winner: winnerPk, treasury, ops, config, systemProgram })
    .rpc();
```

**Confidence: HIGH** — Anchor client `.remainingAccounts()` method from Anchor JS documentation. Pattern consistent with existing `escrow.js` structure.

---

## Client-Side Changes (WalletContext.js)

The `signAndSendEscrowDeposit` function is unchanged. The server still serializes the transaction, sends it via `escrowDeposit` socket event, and the client signs and sends it. The only difference is the escrow PDA now has a different account structure on-chain — transparent to the client.

No client changes are needed for the deposit flow.

**Confidence: HIGH** — Derived from existing architecture in MEMORY.md.

---

## Anchor Version Consideration

Current installed: **Anchor 0.32.1**.

The 0.32.1 release was a patch fixing a CLI race condition in IDL deployment and removing a spurious realloc deprecation warning. No breaking changes to escrow-relevant APIs.

The `BN` import from `bn.js` directly (not from `@coral-xyz/anchor`) — already fixed in the existing `escrow.js` per MEMORY.md — remains correct for 0.32.1.

There is no reason to upgrade Anchor version as part of this milestone. The features needed (fixed arrays, remaining_accounts, bitmap fields, realloc) are all available in 0.32.1.

**Confidence: HIGH** — Anchor 0.32.1 release notes verified via official docs.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| Per-player deposit receipt PDAs | Adds 3-4 extra accounts per match to settle/cancel; unnecessary for max 4 players |
| On-chain voting for partial deposit start | Requires vote PDA, additional instruction, quorum logic; server authority cancel is simpler and equivalent trust |
| Versioned transactions / Address Lookup Tables | Transaction fits comfortably in 1,232 bytes with 8 accounts |
| `Vec<Pubkey>` for players field | Loses compile-time size enforcement; adds heap allocation; saves 4 bytes vs fixed array |
| Separate escrow per player | Each player's wager in its own PDA; massive settle complexity; no benefit |
| Zero-copy / `AccountLoader` | Justified for accounts > 10KB; MatchEscrow is 232 bytes |

---

## Summary Recommendation

The N-player escrow upgrade is a contained structural change to the `MatchEscrow` account layout. The algorithm changes are confined to the four match lifecycle instructions. No new instructions are needed. No new PDAs are needed. No new libraries are needed.

The pattern is:
1. Replace `player_one` / `player_two` Pubkeys with `players: [Pubkey; 4]` + `player_count: u8`
2. Replace `player_one_deposited` / `player_two_deposited` bools with `deposits_mask: u8`
3. Use `remaining_accounts` for the per-player refund destinations in cancel/reclaim
4. Validate all remaining_accounts keys against `escrow.players[]` before transferring lamports
5. Update total_pot math from `wager * 2` to `wager * player_count`
6. Handle 5-10 minute deposit timeout in the server (already capable of calling authority cancel)

Account size goes from 168 → 232 bytes. Transaction size remains well within the 1,232-byte limit.

---

## Sources

- Anchor Space Reference Table (official): [anchor-lang.com/docs/references/space](https://www.anchor-lang.com/docs/references/space) — HIGH confidence
- Anchor 0.32.1 Release Notes: [anchor-lang.com/docs/updates/release-notes/0-32-1](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1) — HIGH confidence
- Solana Transaction Size Limits: [solana.com/docs/core/transactions](https://solana.com/docs/core/transactions) — HIGH confidence (1,232 bytes, 64 account max)
- Direct Lamport Transfer from PDA (game pattern): [solana.com/developers/guides/games/store-sol-in-pda](https://solana.com/developers/guides/games/store-sol-in-pda) — HIGH confidence
- Anchor Account Constraints (realloc): [anchor-lang.com/docs/references/account-constraints](https://www.anchor-lang.com/docs/references/account-constraints) — HIGH confidence
- remaining_accounts pattern: [solana.com/docs/programs/anchor](https://solana.com/docs/programs/anchor) — HIGH confidence (usage confirmed via multiple sources)
- Solana transaction v0 / Address Lookup Tables: [solana.com/docs/advanced/lookup-tables](https://solana.com/docs/advanced/lookup-tables) — HIGH confidence (not needed for this use case)
- SIMD-0296 larger transaction proposal: [github.com/solana-foundation/solana-improvement-documents/pull/296](https://github.com/solana-foundation/solana-improvement-documents/pull/296) — MEDIUM confidence (draft, not live)
