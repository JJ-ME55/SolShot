# Architecture: N-Player Escrow Integration

**Domain:** N-player escrow upgrade for SolShot artillery game on Solana
**Researched:** 2026-02-27
**Milestone:** v1.4 — N-Player Escrow
**Sources:** Direct codebase reading — `programs/solshot-escrow/src/lib.rs` (884 lines), `server/services/escrow.js` (543 lines), `server/services/solana.js` (284 lines), `server/socket-io/main.js` (~2870 lines), `client/src/wallet/WalletContext.js`, `client/src/screens/LobbyScreen.js`, `client/src/screens/BattleScreen.js`, `programs/solshot-escrow/tests/` (4 test files)

---

## Executive Summary

The current escrow is a strict 2-player binary: `player_one`/`player_two` pubkeys, two `bool` deposit flags, and `settle_match` with an inline winner constraint (`winner.key() == escrow.player_one || winner.key() == escrow.player_two`). Every layer of the stack has these binary assumptions baked in.

Upgrading to N-player (2–4) requires a **complete rewrite of lib.rs**, which invalidates the compiled IDL and forces a fresh devnet deploy with a new program ID. All downstream consumers (escrow.js, solana.js, main.js, client WalletContext) need coordinated updates. The existing proptest and LiteSVM test scaffolding must also be updated to mirror the new struct.

The good news: the server-side in-memory stores (`wagerStates`, `rooms`, `depositTimers`) are already generalized. The socket-level deposit tracking (`ws.deposits[client.id]`) and room player array (`room.players[]`) already handle N players. The server scaffolding is largely additive changes.

---

## Component Inventory

### Modified Components

| Component | File | Change Type | Scope |
|-----------|------|-------------|-------|
| Anchor program | `programs/solshot-escrow/src/lib.rs` | Full rewrite of MatchEscrow struct + all 4 match instructions | High |
| IDL | `server/idl/solshot_escrow.json` | Regenerated after `anchor build` | Derivative |
| Escrow service | `server/services/escrow.js` | All match lifecycle functions | Medium |
| Solana service | `server/services/solana.js` | `settleMatch`, `refundWager`, `calculateSettlement` | Small |
| Socket handler | `server/socket-io/main.js` | joinRoom escrow creation, `escrowDepositConfirm`, settlement, cancel/forfeit, SHOT recording, `playAgain` | Medium |
| Proptest harness | `programs/solshot-escrow/tests/bok_proptest_space.rs` | MatchEscrow struct replica | Small |
| LiteSVM stubs | `programs/solshot-escrow/tests/bok_litesvm.rs` | Update settle_math + account replicas | Small |

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `start_with_depositors` instruction | `lib.rs` | Reduce max_players to depositor count, kick non-depositors |
| `remaining_accounts` pattern | `lib.rs:cancel_match` | Dynamic player account list for N-player refunds |

### Unchanged Components

| Component | File | Why Unchanged |
|-----------|------|---------------|
| Client deposit function | `WalletContext.js:signAndSendEscrowDeposit` | Receives a serialized TX and signs it — the TX content changes, not the signing pattern |
| LobbyScreen deposit handler | `LobbyScreen.js:useSocket('escrowDeposit')` | Same event name, same handler shape |
| BattleScreen deposit handler | `BattleScreen.js:useSocket('escrowDeposit')` | Same event name, same handler shape |
| Config PDA | `lib.rs:GlobalConfig` | Not changing — authority/treasury/ops/pause unchanged |
| Config management | `escrow.js:{initializeConfig,pauseProgram,...}` | Not changing |
| Match state machine | `server/services/match.js` | Already N-player; escrow is separate concern |
| Physics, gold, weapons | `server/services/` | Not touching |
| Client HUD, Phaser scene | `client/src/` | Not touching |

---

## Account Space Calculation

### Current `MatchEscrow` (2-player, 168 bytes)

```
8   Anchor discriminator
4+32 String match_id (max 32 chars)
32  authority Pubkey
32  player_one Pubkey
32  player_two Pubkey
8   wager_lamports u64
1   player_one_deposited bool
1   player_two_deposited bool
1   state enum (1 byte, 4 variants)
8   created_at i64
8   activated_at i64
1   bump u8
= 168
```

### New `MatchEscrow` (4-player)

Replacing `player_one`/`player_two` (64 bytes) and their two bools (2 bytes) with fixed arrays:

```
players: [Pubkey; 4]      = 4 × 32 = 128 bytes
deposited: [bool; 4]      = 4 × 1  = 4 bytes
max_players: u8           = 1 byte
num_deposited: u8         = 1 byte
```

Old variable fields removed: 64 (two pubkeys) + 2 (two bools) = 66 bytes
New fields added: 128 + 4 + 1 + 1 = 134 bytes
Net addition: 134 - 66 = +68 bytes

**New total: 168 - 66 + 134 = 236 bytes**

Breakdown:
```
8   Anchor discriminator
4+32 String match_id (max 32 chars)
32  authority Pubkey
128 players [Pubkey; 4]
8   wager_lamports u64
4   deposited [bool; 4]
1   state enum
8   created_at i64
8   activated_at i64
1   max_players u8
1   num_deposited u8
1   bump u8
= 236
```

> Note: Unused player slots in a 2-player match are zeroed pubkeys (`Pubkey::default()`). This is acceptable because the program validates against `max_players` before accepting deposits. The space allocation is always 236 regardless of actual player count — this is correct Solana practice.

---

## Instruction-by-Instruction Changes

### `create_match`

**Current signature:**
```rust
pub fn create_match(ctx, match_id: String, wager_lamports: u64, player_one: Pubkey, player_two: Pubkey)
```

**New signature:**
```rust
pub fn create_match(ctx, match_id: String, wager_lamports: u64, players: Vec<Pubkey>, max_players: u8)
```

Changes:
- Validate `max_players` in [2, 3, 4]
- Validate `players.len() <= max_players as usize`
- Validate all player pubkeys are distinct
- Validate none of the players is the authority
- Fill `escrow.players[0..players.len()]` from the vec, remaining slots zeroed
- Set `escrow.max_players = max_players`, `escrow.num_deposited = 0`

`create_match` is called before all players have joined (just the host at room creation time). The initial player list is empty or just the host. Then players are added as they join. **Decision required:** Either (a) `create_match` takes the full expected player list before anyone has joined (server pre-fills from the waiting room), or (b) escrow creation is deferred until the room is full.

**Recommendation: Defer escrow creation until the room is full.** The current code already creates escrow only when the second player joins (`joinRoom` in main.js:1186). Extend this: create escrow when `room.players.length === room.maxPlayers`. This is zero-change to the trigger logic, just pass all N wallets.

### `deposit_wager`

**Current logic:**
```rust
let is_p1 = depositor == escrow.player_one;
let is_p2 = depositor == escrow.player_two;
require!(is_p1 || is_p2, EscrowError::NotAPlayer);
```

**New logic:**
```rust
let player_idx = escrow.players[..escrow.max_players as usize]
    .iter()
    .position(|p| p == &depositor)
    .ok_or(EscrowError::NotAPlayer)?;
require!(!escrow.deposited[player_idx], EscrowError::AlreadyDeposited);
// ... CPI transfer ...
escrow.deposited[player_idx] = true;
escrow.num_deposited += 1;
if escrow.num_deposited == escrow.max_players {
    escrow.state = MatchState::Active;
    escrow.activated_at = Clock::get()?.unix_timestamp;
    // emit MatchActive with total_pot = wager * max_players
}
```

The on-chain activation check changes from "both deposited" to "all max_players deposited." The partial deposit case (some but not all) is handled server-side via `start_with_depositors` — the on-chain program does not need to know about this policy.

### `settle_match`

**Current winner constraint:**
```rust
#[account(
    constraint = winner.key() == escrow.player_one
        || winner.key() == escrow.player_two
        @ EscrowError::InvalidWinner
)]
pub winner: UncheckedAccount<'info>,
```

**New constraint:**
```rust
#[account(
    constraint = escrow.players[..escrow.max_players as usize]
        .iter()
        .any(|p| p == &winner.key())
        @ EscrowError::InvalidWinner
)]
pub winner: UncheckedAccount<'info>,
```

The pot calculation changes from `wager * 2` to `wager * num_deposited` (not `max_players` — only actual depositors contributed):
```rust
let total_pot_128 = (wager_lamports as u128)
    .checked_mul(escrow.num_deposited as u128)
    .ok_or(EscrowError::ArithmeticOverflow)?;
```

Winner gets: `total_pot - treasury - ops` (same remainder pattern, no change).

### `cancel_match` — the hardest instruction

Current implementation has hardcoded `player_one` and `player_two` accounts in the `CancelMatch` struct. With N players, the account struct cannot list all players statically.

**Solution: `remaining_accounts` pattern.**

The Anchor `remaining_accounts` feature allows passing an arbitrary list of accounts not named in the account struct. The instruction iterates them to refund deposited players:

```rust
pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    // ... state and authorization checks unchanged ...

    // Set terminal state BEFORE transfers
    { escrow.state = MatchState::Cancelled; }

    // Refund all deposited players via remaining_accounts
    let remaining = ctx.remaining_accounts;
    for (i, account_info) in remaining.iter().enumerate() {
        if i >= escrow.max_players as usize { break; }
        if escrow.deposited[i] && account_info.key() == escrow.players[i] {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()?
                -= escrow.wager_lamports;
            **account_info.try_borrow_mut_lamports()? += escrow.wager_lamports;
        }
    }
    // emit MatchCancelled (update event fields for N players)
    Ok(())
}
```

The `CancelMatch` account struct drops the `player_one`/`player_two` named accounts. Caller still needs to pass all N player accounts in order matching `escrow.players[]`.

Server-side (escrow.js), `cancelMatchEscrow` must build the `remainingAccounts` list from the player wallet addresses.

### `start_with_depositors` (new instruction)

This handles the partial-deposit lobby scenario: not all N players deposited within the 2-minute window, but at least 2 did. Instead of refunding everyone, the depositors can choose to start the match.

```rust
pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
        EscrowError::InvalidState
    );
    // Must have at least 2 depositors
    require!(
        ctx.accounts.escrow.num_deposited >= 2,
        EscrowError::NotEnoughDepositors
    );
    // Caller must be authority (server keypair)
    // Compact escrow: shift deposited players to front, zero non-deposited slots
    // Update max_players = num_deposited
    // Transition to Active
    ctx.accounts.escrow.state = MatchState::Active;
    ctx.accounts.escrow.activated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
```

This requires a new error code: `EscrowError::NotEnoughDepositors`.

### `permissionless_reclaim`

Same remaining_accounts pattern as cancel_match. Refunds `num_deposited` players by iterating `escrow.players[]` and checking `escrow.deposited[]`.

---

## Server-Side Changes

### `escrow.js` — Function Signature Changes

#### `createMatchEscrow`

```js
// Current
export async function createMatchEscrow(matchId, wagerSOL, playerOneAddress, playerTwoAddress)

// New
export async function createMatchEscrow(matchId, wagerSOL, playerAddresses, maxPlayers)
```

Build the Anchor call with `players: playerAddresses.map(a => new PublicKey(a))` and `maxPlayers`. The `create_match` IDL args change to accept a Vec of pubkeys.

#### `buildDepositTransaction`

No signature change — takes `(matchId, playerAddress)`. The on-chain accounts are the same (escrow PDA, player, config, system program). This function stays identical.

#### `settleMatchEscrow`

```js
// Current
export async function settleMatchEscrow(matchId, winnerAddress)

// New — unchanged signature, but winner constraint is looser on-chain
export async function settleMatchEscrow(matchId, winnerAddress)
```

No signature change needed. The on-chain constraint now validates `winner in players[0..max_players]` instead of just player_one/player_two. The JS call does not need to change.

The `totalPot` calculation in `solana.js:calculateSettlement` currently uses `wagerSOL * 2`. This must change to `wagerSOL * numPlayers`. But `numPlayers` is not currently a parameter. **Solution:** Pass `numPlayers` to `calculateSettlement`, or look it up from room state before calling.

#### `cancelMatchEscrow`

```js
// Current
export async function cancelMatchEscrow(matchId, playerOneAddress, playerTwoAddress)

// New
export async function cancelMatchEscrow(matchId, playerAddresses)
// playerAddresses: string[] in same order as escrow.players[]
```

Must construct `remainingAccounts` from playerAddresses:
```js
const remainingAccounts = playerAddresses.map(addr => ({
    pubkey: new PublicKey(addr),
    isWritable: true,
    isSigner: false,
}));
```

#### New: `startWithDepositors`

```js
export async function startWithDepositors(matchId)
```

Called by server when depositors decide to start without all players. Server must also compact the in-memory `wagerStates[roomId].wallets` to only include deposited players, and emit `escrowActive` to those players.

#### `getEscrowState`

Currently returns `playerOne`, `playerTwo`, `playerOneDeposited`, `playerTwoDeposited`. Must return `players: string[]`, `deposited: boolean[]`, `maxPlayers: number`, `numDeposited: number`.

The `escrowDepositConfirm` handler in main.js uses `escrowState.playerOneDeposited` / `escrowState.playerTwoDeposited` for verification. This must change to `escrowState.deposited[playerIndex]`.

### `solana.js` — Changes

#### `settleMatch`

```js
// Current
export async function settleMatch(winnerAddress, loserAddress, wagerSOL, matchId)

// New — loserAddress no longer meaningful with N players (keep for backward compat or remove)
export async function settleMatch(winnerAddress, wagerSOL, matchId, numPlayers)
```

`calculateSettlement` currently takes `totalWagerSOL = wagerSOL * 2`. Must change to `wagerSOL * numPlayers`.

#### `refundWager`

```js
// Current
export async function refundWager(playerAddress, wagerSOL, matchId, playerOneAddress, playerTwoAddress)

// New
export async function refundWager(wagerSOL, matchId, playerAddresses)
```

Simplify: only matchId and the full player address list are needed. `cancelMatchEscrow(matchId, playerAddresses)` handles refunding all who deposited.

### `main.js` — Socket Handler Changes

#### `joinRoom` — Escrow Creation (line ~1186)

Current code triggers when the second player joins and room is full (2 players). Must trigger when `room.players.length === room.maxPlayers`:

```js
// Current
if (roomWager > 0 && isEscrowEnabled()) {
    const hostWallet = ws?.wallets[room.players[0]?.socketId]
    if (hostWallet && joinerWallet) {
        const escrowResult = await createMatchEscrow(roomId, roomWager, hostWallet, joinerWallet)
```

```js
// New
if (roomWager > 0 && isEscrowEnabled() && room.players.length === room.maxPlayers) {
    const playerWallets = room.players.map(p => ws?.wallets[p.socketId]).filter(Boolean)
    if (playerWallets.length === room.maxPlayers) {
        const escrowResult = await createMatchEscrow(roomId, roomWager, playerWallets, room.maxPlayers)
```

Build deposit transactions for all N players:
```js
const depositTxs = await Promise.all(
    room.players.map(p => buildDepositTransaction(roomId, ws.wallets[p.socketId]))
)
// Emit escrowDeposit to each player's socket
```

Remove the SYS-08 guard (line 1356) that blocks wagered 3-4 player rooms — this was the placeholder until v1.4.

#### Deposit timeout cancel (line ~1225)

Current: `cancelMatchEscrow(roomId, p1wallet, p2wallet)`. New:
```js
const allWallets = roomCheck.players.map(p => wsCheck.wallets[p.socketId]).filter(Boolean)
await cancelMatchEscrow(roomId, allWallets)
```

#### `escrowDepositConfirm` handler (line 1975)

The on-chain deposit verification must be generalized. Current code:
```js
const isHost = room.players[0]?.socketId === client.id
const depositConfirmed = isHost
    ? escrowState.playerOneDeposited
    : escrowState.playerTwoDeposited
```

New:
```js
const playerIndex = room.players.findIndex(p => p.socketId === client.id)
const depositConfirmed = playerIndex >= 0 && escrowState.deposited[playerIndex]
```

The `allDeposited` check:
```js
// Current
const allDeposited = room.players.every(p => ws.deposits && ws.deposits[p.socketId])
// This is already N-player correct — no change needed
```

The `escrowActive` emit is already fine:
```js
io.sockets.in(rid).emit('escrowActive', {
    roomId: rid,
    escrowPDA: room.escrowPDA,
    totalPot: ws.amount * room.players.length,  // was: ws.amount * 2
})
```

Add `room.players.length` instead of hardcoded `2` for totalPot.

#### Settlement (line ~2379)

Current:
```js
const winnerWallet = ws.wallets[matchResult.winner] || null
const loserId = matchResult.winner === hostId ? playerId : hostId
const loserWallet = ws.wallets[loserId] || null
if (winnerWallet && loserWallet) {
    const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount, roomId)
```

New:
```js
const winnerWallet = ws.wallets[matchResult.winner] || null
if (winnerWallet) {
    const numPlayers = room.players.length
    const sResult = await settleMatch(winnerWallet, ws.amount, roomId, numPlayers)
```

`loserWallet` is no longer needed — winner-takes-all settlement doesn't need the loser's address (on-chain, cancel_match is not being called).

#### Forfeit settlement (line ~460)

Same pattern change: `settleMatch(winnerWallet, loserWallet, ws.amount, roomId)` → `settleMatch(winnerWallet, ws.amount, roomId, numPlayers)`.

#### `handleSettlementFailure` (line ~136)

Currently reads `room.players[0]` and `room.players[1]` to get p1/p2 wallets. Must collect all wallets:
```js
const playerWallets = room?.players?.map(p => ws?.wallets?.[p.socketId]).filter(Boolean) || []
// Then in retry: cancelMatchEscrow(matchId, playerWallets)
```

The `failedSettlements` store shape must change from `{ p1wallet, p2wallet }` to `{ playerWallets: [] }`.

#### SHOT milestone recording (line ~2446)

Current code only records for `hostWallet` (players[0]) and `playerWallet` (players[1]). This is the known tech debt for 3-4 player support:

```js
// Current
const hostWallet = wsState?.wallets?.[hostId] || authenticatedWallets[hostId] || null
const playerWallet = wsState?.wallets?.[playerId] || authenticatedWallets[playerId] || null
// records only 2 players

// New
for (const p of room.players) {
    const wallet = wsState?.wallets?.[p.socketId] || authenticatedWallets[p.socketId] || null
    if (wallet) {
        shotResults[p.socketId] = recordMatchPlayed(wallet, {
            turnCount: ms.turnCount,
            matchId,
            isWagered,
            isWinner: matchResult.winner === p.socketId,
            maxRoundDamage: (ms.maxRoundDamage && ms.maxRoundDamage[p.socketId]) || 0,
            weaponsUsed: ms.weaponsUsed && ms.weaponsUsed[p.socketId]
                ? Array.from(ms.weaponsUsed[p.socketId]) : [],
        })
    }
}
```

This also applies to the forfeit path (line ~480) and must use `room.players` iteration.

The `matchEndPayload.prestigeInfo` (line ~2515) also only covers hostId/playerId — must iterate all players.

#### `playAgain` — maxPlayers preservation

In `resetForPlayAgain` (line ~84), `createMatchState` is called without maxPlayers:
```js
matchStates[roomId] = createMatchState(roomId, paRoundType)
```

Must be:
```js
matchStates[roomId] = createMatchState(roomId, paRoundType, room.maxPlayers)
```

The `room.maxPlayers` is preserved on the room object through `resetForPlayAgain` (the room is not removed, players just reset). This is a one-line fix.

---

## Data Flow Changes

### Current 2-Player Deposit Flow

```
joinRoom (2nd player joins)
  → createMatchEscrow(matchId, wager, p1addr, p2addr)
  → buildDepositTransaction(matchId, p1addr), buildDepositTransaction(matchId, p2addr)
  → emit escrowDeposit to p1 socket, p2 socket
  → client signs TX → sendTransaction → confirmTransaction
  → client emit escrowDepositConfirm { roomId, txSignature }
  → server verifies on-chain: escrowState.playerOneDeposited / playerTwoDeposited
  → ws.deposits[client.id] = txSignature
  → if room.players.every(p => ws.deposits[p.socketId]) → emit escrowActive
  → depositTimer runs 2 min → if not all deposited → cancelMatchEscrow(matchId, p1addr, p2addr)
```

### New N-Player Deposit Flow

```
joinRoom (Nth player joins, room.players.length === room.maxPlayers)
  → createMatchEscrow(matchId, wager, [p1addr, p2addr, ...pNaddr], maxPlayers)
  → buildDepositTransaction(matchId, pi_addr) × N (Promise.all)
  → emit escrowDeposit to each player's socket (loop over room.players)
  → each client signs TX → sendTransaction → confirmTransaction
  → each client emit escrowDepositConfirm { roomId, txSignature }
  → server verifies on-chain: escrowState.deposited[playerIndex]
  → ws.deposits[client.id] = txSignature
  → if room.players.every(p => ws.deposits[p.socketId]) → emit escrowActive { totalPot: wager * N }
  → depositTimer runs 2 min → if NOT all deposited:
      → if num deposited >= 2: emit escrowPartialDeposit to depositors (option: start or cancel)
      → if cancel: cancelMatchEscrow(matchId, [all wallets])
      → if start: startWithDepositors(matchId) → compact to depositors-only match
```

### Settlement Flow Changes

```
match ends
  → matchResult.winner = socketId
  → winnerWallet = ws.wallets[matchResult.winner]
  → numPlayers = room.players.length (or escrow numDeposited)
  → settleMatch(winnerWallet, ws.amount, roomId, numPlayers)
    → calculateSettlement(wager * numPlayers)
    → settleMatchEscrow(matchId, winnerAddress)
      → on-chain: total_pot = wager * num_deposited
      → winner gets 90%, treasury 7%, ops 3%
```

---

## Architecture Patterns

### Pattern: Fixed-Size Array for N-Player Pubkeys

Use `[Pubkey; 4]` in the Anchor struct, not `Vec<Pubkey>`. Reasons:
- Solana account space must be fixed at init time — no dynamic resizing
- Max players is bounded (4), so a 4-slot array is correct
- Unused slots are `Pubkey::default()` (32 zero bytes)
- `max_players: u8` bounds the valid slice `players[0..max_players]`

### Pattern: `remaining_accounts` for Cancel Refunds

Anchor's `remaining_accounts` allows passing an arbitrary-length list of accounts not declared in the struct. This is the standard Solana pattern when the account count is dynamic. The server passes player pubkeys in order matching `escrow.players[]`. The program validates `account_info.key() == escrow.players[i]` before each lamport transfer.

Caveat: Anchor's attribute macros cannot validate `remaining_accounts` — validation must be done manually inside the instruction body. This is the only instruction that loses Anchor's constraint-level safety.

### Pattern: Defer Escrow Creation to Room Full

Don't create the escrow PDA when the host creates the room. Wait until the room is full (`room.players.length === room.maxPlayers`). This avoids:
- Creating an escrow with missing player addresses
- The need for an "add player" instruction
- Any on-chain state that references players who haven't committed yet

This matches the current 2-player behavior exactly (escrow created in joinRoom when the 2nd player joins), just generalized to the Nth player.

### Pattern: Server-Side Partial Deposit Policy

The on-chain program does not know about the "start with depositors" policy. From the program's perspective, the match is either `AwaitingDeposits` or `Active`. The server enforces the policy:
1. Deposit timer expires
2. Not all players deposited
3. Server checks `ws.deposits` to count who deposited
4. If >= 2: emit `escrowPartialDeposit` event to depositors with options
5. If depositors choose "start": server calls `startWithDepositors` which transitions on-chain to Active and compacts `max_players`
6. If depositors choose "cancel" (or 1 minute elapses with no choice): server calls `cancelMatchEscrow`

---

## Anti-Patterns to Avoid

### Anti-Pattern: Dynamic `Vec<Pubkey>` in Account Struct

Tempting to use `Vec<Pubkey>` for the players array since the count is variable. **Do not do this.** Solana account space is allocated once and cannot grow. A Vec requires knowing the length at init time, at which point you might as well use a fixed array. Using a fixed `[Pubkey; 4]` with `max_players: u8` is the correct pattern.

### Anti-Pattern: `create_match` Called Before Room Is Full

Do not create the escrow PDA when the room is created (host alone). You don't know all player addresses yet. Wait until the room fills. If the room never fills, no escrow was created and no cleanup is needed.

### Anti-Pattern: Keeping `loserAddress` in `settleMatch`

The current `settleMatch` signature takes `loserAddress` — a 2-player artifact. The N-player settlement only needs the winner. Do not pass loser address and have the on-chain program guess who to refund. The program has the full player list; it only needs to know who won.

### Anti-Pattern: Blocking `startPick` on Escrow Active

Currently `startPick` fires immediately when the room is full (line 1257), before escrow deposits are complete. This is correct — the game starts optimistically. Escrow deposit confirmation is async and happens in parallel with the weapon shop. Do not add a blocking wait for all deposits before emitting `startPick`. The current non-blocking flow is correct for N players too.

### Anti-Pattern: `settle_match` Hardcoded `total_pot = wager * 2`

The on-chain program currently has `total_pot_128 = wager_lamports.checked_mul(2)`. Must change to `wager_lamports.checked_mul(escrow.num_deposited as u128)`. Do not use `max_players` here — if a 3-player game ran with 2 depositors via `start_with_depositors`, the pot is `wager * 2`, not `wager * 3`.

---

## Build Order (Recommended)

Phase ordering is determined by dependency: on-chain program must be deployed before server can call it; IDL must be updated before escrow.js can compile; main.js changes can be done alongside escrow.js since they're parallel concerns.

### Phase 1: Anchor Program Rewrite

Build first because everything downstream depends on the compiled IDL.

1. Update `MatchEscrow` struct in `lib.rs` (new fields, `SPACE = 236`)
2. Update `create_match` instruction — N-player Vec arg
3. Update `deposit_wager` — array iteration for player check + `num_deposited` counter
4. Update `settle_match` — new winner constraint + `wager * num_deposited` pot
5. Update `cancel_match` — `remaining_accounts` pattern, drop named player accounts
6. Update `permissionless_reclaim` — same `remaining_accounts` pattern
7. Add `start_with_depositors` instruction
8. Update events (`MatchCreated`, `MatchCancelled`, `MatchActive`) for N-player fields
9. Add `NotEnoughDepositors` error
10. `anchor build` → copy `target/idl/solshot_escrow.json` to `server/idl/`
11. Note new Program ID from fresh deploy (IDL will have new discriminators)
12. Update proptest harness (`bok_proptest_space.rs`) — new struct replica + SPACE constant
13. Update LiteSVM stub constants to mirror new program

### Phase 2: Server Escrow Service

Depends on Phase 1 (new IDL).

1. `escrow.js:createMatchEscrow` — new signature `(matchId, wagerSOL, playerAddresses[], maxPlayers)`
2. `escrow.js:cancelMatchEscrow` — new signature `(matchId, playerAddresses[])` + remainingAccounts
3. `escrow.js:getEscrowState` — return new fields (`players[]`, `deposited[]`, `maxPlayers`, `numDeposited`)
4. New `escrow.js:startWithDepositors(matchId)` function
5. `solana.js:calculateSettlement` — add `numPlayers` param
6. `solana.js:settleMatch` — remove `loserAddress`, add `numPlayers`; update call to `calculateSettlement`
7. `solana.js:refundWager` — new signature `(wagerSOL, matchId, playerAddresses[])`

### Phase 3: Socket Handler (`main.js`)

Depends on Phase 2 (updated service functions). These changes are largely mechanical.

1. Remove SYS-08 wager guard for 3-4 player rooms (line 1356)
2. `joinRoom` escrow creation — collect all N wallets, call new `createMatchEscrow`
3. `joinRoom` deposit loop — emit `escrowDeposit` to all N players
4. `joinRoom` deposit timer — `cancelMatchEscrow` with all wallets
5. `escrowDepositConfirm` — `playerIndex` lookup instead of isHost boolean
6. `escrowActive` emit — `totalPot: ws.amount * room.players.length`
7. Settlement call — remove loserAddress, add numPlayers
8. Forfeit settlement — same
9. `handleSettlementFailure` — collect all player wallets
10. `failedSettlements` store — `playerWallets[]` instead of `p1wallet`/`p2wallet`
11. SF-03 retry interval — `cancelMatchEscrow(matchId, data.playerWallets)`
12. SHOT milestone loop — iterate all `room.players` (fixes players 3/4 missing rewards)
13. `matchEndPayload.prestigeInfo` — iterate all players
14. `resetForPlayAgain` — pass `room.maxPlayers` to `createMatchState`

### Phase 4: Client (Minor Changes)

Mostly no changes needed. Two specific updates:

1. `escrowActive` handler — update totalPot display if client shows it
2. If adding partial-deposit UX: new socket event handlers for `escrowPartialDeposit` and player choice emit
3. `LobbyScreen` — remove wager guard display for 3-4 player rooms (UI currently shows "Wager modes require 2 players" error)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Account space calculation | HIGH | Derived directly from field sizes, matches existing proptest pattern |
| `deposit_wager` changes | HIGH | Array iteration replaces binary check — straightforward |
| `settle_match` changes | HIGH | Winner constraint and pot calculation are direct translations |
| `cancel_match` remaining_accounts | MEDIUM | Pattern is well-established in Solana but requires manual validation; no Anchor constraint safety |
| `start_with_depositors` | MEDIUM | New instruction with no prior art in this codebase; state compaction logic needs care |
| Server escrow.js changes | HIGH | Mechanical signature updates; patterns are clear |
| main.js SHOT milestone loop | HIGH | Known tech debt, straightforward loop change |
| main.js settlement flow | HIGH | `numPlayers` param flows clearly from room state |
| Partial deposit policy/UX | LOW | Not yet designed in detail; "start with depositors" choice flow has multiple edge cases |
| Program re-deploy | HIGH | Standard Anchor deploy process; new program ID must be updated in escrow.js, client .env |

---

## Integration Points Summary

| Integration Point | Old Interface | New Interface |
|-------------------|---------------|---------------|
| `create_match` on-chain | `(match_id, wager, player_one, player_two)` | `(match_id, wager, players: Vec<Pubkey>, max_players: u8)` |
| `settle_match` winner constraint | `winner == player_one \|\| winner == player_two` | `players[0..max_players].contains(winner)` |
| `cancel_match` accounts | Named `player_one`, `player_two` | `remaining_accounts` with all N players |
| `createMatchEscrow` (JS) | `(matchId, wager, p1addr, p2addr)` | `(matchId, wager, addrs[], maxPlayers)` |
| `cancelMatchEscrow` (JS) | `(matchId, p1addr, p2addr)` | `(matchId, addrs[])` |
| `settleMatch` (JS) | `(winnerAddr, loserAddr, wager, matchId)` | `(winnerAddr, wager, matchId, numPlayers)` |
| `calculateSettlement` (JS) | `totalWagerSOL = wager * 2` | `totalWagerSOL = wager * numPlayers` |
| deposit confirmation | `escrowState.playerOneDeposited` | `escrowState.deposited[playerIndex]` |
| `escrowActive` totalPot | `ws.amount * 2` | `ws.amount * room.players.length` |
| SHOT milestone recording | Players 0 and 1 only | All `room.players` |
| `resetForPlayAgain` | `createMatchState(roomId, roundType)` | `createMatchState(roomId, roundType, room.maxPlayers)` |

---

## Gaps to Address

- **Partial deposit UX design:** What does the client show during the 2-minute deposit window for 3-4 players? What happens when 2 of 4 deposit and time expires? The architecture supports it but the UX flow needs a phase plan.
- **`start_with_depositors` authorization:** Should only the server authority call it, or can any depositor trigger it? Recommend server-only (consistent with other instructions).
- **Program re-deploy checklist:** Fresh deploy means new program ID everywhere. The deploy checklist (referenced in lib.rs comment "OC-14") must be updated for N-player.
- **Re-audit scope:** Modifying lib.rs invalidates the SOS audit certification. The new `remaining_accounts` pattern in `cancel_match` requires particular scrutiny — it removes Anchor's constraint-level safety for those accounts.
- **Matchmaking queue for N-player wagered:** The queue logic currently dequeues 2 players for a wagered match. Enabling wagered 3-4 player via matchmaking (vs. custom room) is not part of this milestone scope.
