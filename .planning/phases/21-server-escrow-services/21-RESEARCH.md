# Phase 21: Server Escrow Services - Research

**Researched:** 2026-02-28
**Domain:** Node.js Anchor client service layer — N-player escrow API update
**Confidence:** HIGH

## Summary

This phase updates two server-side JavaScript files (`server/services/escrow.js` and `server/services/solana.js`) to call the N-player Anchor program that Phase 20 delivered. The program is already complete and the IDL is synced. This is a pure JavaScript refactor — no Rust or Anchor changes required.

The core challenge is changing function signatures and call sites that were built for exactly two named players (`playerOneAddress`, `playerTwoAddress`) to instead work with an array of 2-4 player addresses. The `createMatch` instruction now accepts `Vec<Pubkey>` instead of two positional pubkeys. The `cancel_match` instruction now uses `ctx.remaining_accounts` instead of named `player_one` / `player_two` accounts — meaning the JS client must pass `remainingAccounts` on the Anchor method builder. The `settle_match` instruction now validates the winner against `players[0..max_players]` on-chain, so the JS only needs to pass the winner pubkey (same as before).

The main.js socket handler also has hardcoded 2-player assumptions that are downstream consumers of these service functions. They are NOT in scope for Phase 21, but they must not break — the service layer changes must remain backward-compatible with main.js's current 2-player call pattern wherever possible, or the gaps must be clearly identified for a downstream phase.

**Primary recommendation:** Update `escrow.js` and `solana.js` directly without adding abstraction layers. All changes are localized to specific function bodies; signatures change for `createMatchEscrow` and `cancelMatchEscrow`, while `settleMatchEscrow` gains no new required params.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@coral-xyz/anchor` | ^0.32.1 | Anchor program client — builds transactions, deserializes accounts | Already installed, matches program build |
| `@solana/web3.js` | ^1.98.4 | Solana primitives — PublicKey, Connection, Transaction | Already installed |
| `bn.js` | (direct import) | BN for u64 lamport amounts | Import directly, NOT from anchor — breaking change in 0.32.1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fs` / `path` | Node built-in | Load IDL JSON | Already used in escrow.js |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct BN import | `@coral-xyz/anchor` BN re-export | Anchor 0.32.1 broke the re-export — MUST use `bn.js` directly |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
server/services/
├── escrow.js        # Anchor program wrappers — createMatch, settle, cancel, getState
└── solana.js        # Higher-level match lifecycle — delegates to escrow.js
```

### Pattern 1: Anchor `remainingAccounts` for N-player cancel

**What:** The N-player `cancel_match` instruction uses `ctx.remaining_accounts` in Rust instead of named account fields. The JS client must pass deposited player accounts via `.remainingAccounts([...])` on the method builder.

**When to use:** Any time you call `cancel_match` or `permissionless_reclaim` — these instructions route refunds through `remaining_accounts`.

**Example:**
```javascript
// Source: IDL analysis + Anchor 0.32.1 docs pattern
const tx = await program.methods
    .cancelMatch()
    .accounts({
        escrow: escrowPDA,
        caller: getEscrowKeypair().publicKey,
        config: configPDA,
        systemProgram: PublicKey.default,
    })
    .remainingAccounts(
        depositedPlayerAddresses.map(addr => ({
            pubkey: new PublicKey(addr),
            isWritable: true,
            isSigner: false,
        }))
    )
    .rpc();
```

**Critical constraint from the Rust program:**
- Accounts must be passed in **player-index order** (matching `players[]` array position)
- Only **deposited** players should be passed (bit set in `deposits_mask`)
- If no deposits exist, pass an empty array — the loop does nothing

**How to determine which players are deposited:** Either call `getEscrowState` first to read `depositsMask`, OR always pass all N player addresses in order (the program validates `bit_set` and will error on non-deposited accounts). The safest approach: always pass all players the server registered, regardless of deposit status — BUT this will fail on-chain if a player isn't deposited because the program checks `(deposits_mask >> i) & 1 == 1`. So we must either call `getEscrowState` first, or the server must track which players have deposited via `wagerStates.deposits`.

**Server already tracks deposits in `wagerStates.deposits`** (set on `escrowDepositConfirm`). Use this to filter.

### Pattern 2: `create_match` with `Vec<Pubkey>` players array

**What:** The new `create_match` instruction takes `players: Vec<Pubkey>` as the third argument instead of `playerOne: Pubkey, playerTwo: Pubkey`.

**Example:**
```javascript
// Source: IDL create_match args: [{name: "match_id", type: "string"}, {name: "wager_lamports", type: "u64"}, {name: "players", type: {vec: "pubkey"}}]
const playerPubkeys = playerAddresses.map(a => new PublicKey(a));

const tx = await program.methods
    .createMatch(matchId, new BN(wagerLamports), playerPubkeys)
    .accounts({
        escrow: escrowPDA,
        authority: getEscrowKeypair().publicKey,
        config: configPDA,
        systemProgram: PublicKey.default,
    })
    .rpc();
```

**Constraint:** 2-4 players, all distinct, none equal to authority pubkey. Program enforces this on-chain.

### Pattern 3: `getEscrowState` returning N-player fields

**What:** The on-chain `MatchEscrow` account now has `players: [Pubkey; 4]`, `maxPlayers: u8`, `depositsMask: u8` instead of `playerOne`, `playerTwo`, `playerOneDeposited`, `playerTwoDeposited`.

**New `getEscrowState` return shape:**
```javascript
{
    matchId: string,
    authority: string,
    players: string[],       // Array of base58 addresses, length = maxPlayers
    maxPlayers: number,      // 2-4
    wagerLamports: number,
    wagerSOL: number,
    depositsMask: number,    // Bitmask: bit N set = player N deposited
    numDeposited: number,    // Convenience: depositsMask.toString(2).split('1').length - 1 equivalent
    state: string,
    createdAt: number,
    activatedAt: number,
}
```

**main.js uses `escrowState.playerOneDeposited` and `escrowState.playerTwoDeposited`** on lines 2011-2012. These must be replaced in main.js (or getEscrowState can shim them — see Open Questions).

### Pattern 4: `calculateSettlement` N-player pot

**What:** `solana.js:calculateSettlement` currently receives `totalWagerSOL` (= `wagerSOL * 2`). The `settleMatch` caller computes `totalPot = wagerSOL * 2`. For N players, this becomes `wagerSOL * playerCount`.

**Current code (solana.js line 196-197):**
```javascript
const totalPot = wagerSOL * 2;
const settlement = calculateSettlement(totalPot);
```

**N-player fix:**
```javascript
const playerCount = Object.values(wsState.wallets).filter(Boolean).length;
const totalPot = wagerSOL * playerCount;
const settlement = calculateSettlement(totalPot);
```

BUT `calculateSettlement` is also called standalone for display purposes. Its signature `calculateSettlement(totalWagerSOL)` is still correct — the caller just needs to pass the right total. No change to `calculateSettlement` internals needed.

**SRV-08 says:** "uses `wager * playerCount` for total pot (not `wager * 2`)". This fix is in `solana.js:settleMatch`, not in `calculateSettlement` itself.

### Anti-Patterns to Avoid

- **Passing `playerOne/playerTwo` as named accounts to `cancelMatch`:** The new `CancelMatch` struct has no named player fields. Passing them as named accounts will cause Anchor to throw "unused accounts" or wrong-account errors.
- **Importing BN from `@coral-xyz/anchor`:** Anchor 0.32.1 broke this re-export. Use `import BN from 'bn.js'` directly.
- **Calling `getEscrowState` and reading `.playerOneDeposited`:** This field no longer exists. The field is now `depositsMask` (bitmask u8).
- **Hardcoding `wager * 2` for pot calculation in `settleMatch`:** Phase 21 removes this; use `wager * numDeposited` or `wager * playerCount`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `remainingAccounts` ordering | Custom account sorting | Program-defined order: player index in `players[]` array | On-chain validation checks `players[i]` vs `remaining_accounts[i]` — must match exactly |
| Deposit mask arithmetic | Custom bitmask library | JS bitwise operators: `(mask >> i) & 1` | Already used in server; single-line operation |
| Pubkey serialization | Manual base58 encoding | `new PublicKey(addr).toBase58()` | Already used throughout escrow.js |

**Key insight:** The hardest part of N-player cancel is knowing which players deposited (to pass the right remaining_accounts). Don't fetch `getEscrowState` before every cancel — the server tracks deposits in `wagerStates.deposits`. Use that.

## Common Pitfalls

### Pitfall 1: `remainingAccounts` order mismatch
**What goes wrong:** Passing deposited players in wrong order (e.g., alphabetical by pubkey instead of player-index order). The program rejects with `InvalidPlayer` (error code 6008).
**Why it happens:** The program validates `*account.key == players[i]` where `i` is the loop index. If account 0 is player 1's wallet, it fails.
**How to avoid:** Always build `remainingAccounts` by iterating `wagerStates.wallets` in the order players joined (players[0] = host, players[1] = joiner, etc.).
**Warning signs:** `InvalidPlayer` error on cancel transactions.

### Pitfall 2: `cancelMatchEscrow` called with two address strings but N players exist
**What goes wrong:** Current `cancelMatchEscrow(matchId, p1addr, p2addr)` only handles 2 players. All call sites in main.js pass exactly two addresses.
**Why it happens:** main.js currently enforces 2-player-only wager matches (`SYS-08` guard at line 1355-1358). This guard will be removed in a future phase when N-player wager support is added.
**How to avoid:** New `cancelMatchEscrow(matchId, playerAddresses[])` accepts an array. Existing 2-player call sites in main.js work by passing `[p1w, p2w]`. No main.js changes needed for Phase 21.
**Warning signs:** TypeScript-style errors if the old signature is still exported.

### Pitfall 3: `getEscrowState` field renaming breaks main.js
**What goes wrong:** `main.js` line 2011 reads `escrowState.playerOneDeposited` and line 2012 reads `escrowState.playerTwoDeposited`. After the `getEscrowState` update these fields don't exist.
**Why it happens:** The new MatchEscrow struct uses `depositsMask: u8` instead of two booleans.
**How to avoid two options:**
  - Option A: Add backward-compat shim in `getEscrowState` — derive `playerOneDeposited = (depositsMask & 1) !== 0` and `playerTwoDeposited = (depositsMask & 2) !== 0` alongside the new fields.
  - Option B: Update main.js `escrowDepositConfirm` handler to use `depositsMask` directly.
  - **Recommendation: Option A** (shim) keeps main.js unchanged and Phase 21 self-contained. Phase 21 is service-layer only.

### Pitfall 4: `totalPot = wagerSOL * 2` hardcode in `settleMatch`
**What goes wrong:** Settlement correctly calls the on-chain program (which uses `wager * count_ones(deposits_mask)`), but the server-side `settlement` object returned to callers is still computed with `wager * 2` for display/logging. This creates inconsistency if a 3-player match settles.
**Why it happens:** `solana.js:settleMatch` calls `calculateSettlement(wagerSOL * 2)` with a hardcoded `* 2`.
**How to avoid:** Change line 196 in solana.js to compute total pot from actual player count. The wallet count in `wagerStates` reflects deposited players.
**Warning signs:** Settlement log showing wrong total pot for N-player matches.

### Pitfall 5: `permissionlessReclaimEscrow` still uses named accounts
**What goes wrong:** The existing `permissionlessReclaimEscrow` passes `playerOne` and `playerTwo` as named Anchor accounts. The new program uses `remaining_accounts` here too.
**Why it happens:** The function was not updated in Phase 20 (only the Rust program changed).
**How to avoid:** Apply the same `remainingAccounts` pattern as `cancelMatchEscrow`.
**Warning signs:** On-chain `permissionless_reclaim` calls failing with wrong account structure.

### Pitfall 6: `failedSettlements` store records `p1wallet` and `p2wallet` separately
**What goes wrong:** The SF-03 retry loop in main.js at line 120 calls `cancelMatchEscrow(matchId, data.p1wallet, data.p2wallet)`. If `cancelMatchEscrow` signature changes to accept array, this will fail.
**Why it happens:** `failedSettlements` was built for 2-player only.
**How to avoid:** Keep the 2-player `[p1wallet, p2wallet]` call pattern working by accepting both array and spread arguments, OR update the failedSettlements store shape. The simplest fix: `cancelMatchEscrow(matchId, [data.p1wallet, data.p2wallet])` with the new array signature. **main.js must be updated** at lines 120, 146, 760, 1238, 1580.

## Code Examples

Verified patterns from IDL and program source:

### create_match (N-player)
```javascript
// Source: server/idl/solshot_escrow.json create_match args + programs/solshot-escrow/src/lib.rs
import BN from 'bn.js';  // NOT from @coral-xyz/anchor

export async function createMatchEscrow(matchId, wagerSOL, playerAddresses) {
    // playerAddresses: string[] of base58 addresses, length 2-4
    const wagerLamports = Math.round(wagerSOL * LAMPORTS_PER_SOL);
    const players = playerAddresses.map(a => new PublicKey(a));
    const [escrowPDA] = getEscrowPDA(matchId);
    const [configPDA] = getConfigPDA();

    const tx = await program.methods
        .createMatch(matchId, new BN(wagerLamports), players)
        .accounts({
            escrow: escrowPDA,
            authority: getEscrowKeypair().publicKey,
            config: configPDA,
            systemProgram: PublicKey.default,
        })
        .rpc();

    return { success: true, txSignature: tx, escrowPDA: escrowPDA.toBase58() };
}
```

### cancel_match (N-player via remainingAccounts)
```javascript
// Source: programs/solshot-escrow/src/lib.rs cancel_match + CancelMatch struct
// CancelMatch struct has NO named player accounts — players via remaining_accounts
export async function cancelMatchEscrow(matchId, playerAddresses) {
    // playerAddresses: string[] in player-index order, only deposited players
    const [escrowPDA] = getEscrowPDA(matchId);
    const [configPDA] = getConfigPDA();

    const remaining = playerAddresses.map(addr => ({
        pubkey: new PublicKey(addr),
        isWritable: true,
        isSigner: false,
    }));

    const tx = await program.methods
        .cancelMatch()
        .accounts({
            escrow: escrowPDA,
            caller: getEscrowKeypair().publicKey,
            config: configPDA,
            systemProgram: PublicKey.default,
        })
        .remainingAccounts(remaining)
        .rpc();

    return { success: true, txSignature: tx };
}
```

### getEscrowState (N-player fields + backward-compat shim)
```javascript
// Source: IDL MatchEscrow type fields
export async function getEscrowState(matchId) {
    const [escrowPDA] = getEscrowPDA(matchId);
    const escrow = await program.account.matchEscrow.fetch(escrowPDA);

    const maxPlayers = escrow.maxPlayers;
    const depositsMask = escrow.depositsMask;
    const numDeposited = countBits(depositsMask);  // popcount

    return {
        matchId: escrow.matchId,
        authority: escrow.authority.toBase58(),
        players: escrow.players.slice(0, maxPlayers).map(p => p.toBase58()),
        maxPlayers,
        wagerLamports: escrow.wagerLamports.toNumber(),
        wagerSOL: escrow.wagerLamports.toNumber() / LAMPORTS_PER_SOL,
        depositsMask,
        numDeposited,
        state: Object.keys(escrow.state)[0],
        createdAt: escrow.createdAt.toNumber(),
        activatedAt: escrow.activatedAt?.toNumber() || 0,
        // Backward-compat shims for main.js lines 2011-2012
        playerOneDeposited: (depositsMask & 1) !== 0,
        playerTwoDeposited: (depositsMask & 2) !== 0,
    };
}

function countBits(n) {
    let count = 0;
    while (n) { count += n & 1; n >>= 1; }
    return count;
}
```

### settle_match (N-player — no API change, but totalPot fix in solana.js)
```javascript
// Source: solana.js settleMatch — fix wager * 2 hardcode
// The on-chain program handles N-player pot internally via deposits_mask.count_ones()
// Server-side calculation for display/logging needs fixing:
export async function settleMatch(winnerAddress, loserAddress, wagerSOL, matchId) {
    // For N-player: determine player count from wagerStates or escrow state
    // Current code hardcodes wagerSOL * 2 — change to pass numDeposited
    const numDeposited = /* from wagerStates or getEscrowState */ 2; // example
    const totalPot = wagerSOL * numDeposited;
    const settlement = calculateSettlement(totalPot);
    // ... rest unchanged
}
```

### permissionless_reclaim (N-player via remainingAccounts)
```javascript
// Source: programs/solshot-escrow/src/lib.rs PermissionlessReclaim struct (no config account)
export async function permissionlessReclaimEscrow(matchId, playerAddresses) {
    const [escrowPDA] = getEscrowPDA(matchId);

    const remaining = playerAddresses.map(addr => ({
        pubkey: new PublicKey(addr),
        isWritable: true,
        isSigner: false,
    }));

    const tx = await program.methods
        .permissionlessReclaim()
        .accounts({
            escrow: escrowPDA,
            caller: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remaining)
        .rpc();

    return { success: true, txSignature: tx };
}
```

**Note:** `PermissionlessReclaim` struct does NOT have a `config` account (unlike `CancelMatch`). Do not add one.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createMatch(id, wager, p1, p2)` | `createMatch(id, wager, players[])` | Phase 20 | createMatchEscrow signature changes |
| `cancelMatch` with named `playerOne`/`playerTwo` accounts | `cancelMatch` + `remainingAccounts` | Phase 20 | cancelMatchEscrow must use `.remainingAccounts()` builder |
| `escrow.playerOneDeposited` / `escrow.playerTwoDeposited` | `escrow.depositsMask` bitmask | Phase 20 | getEscrowState field mapping changes |
| `wager * 2` pot | `wager * numDeposited` pot | Phase 20 (on-chain) | Server-side calculation must match |
| `permissionlessReclaim` with named player accounts | `permissionlessReclaim` + `remainingAccounts` | Phase 20 | Same pattern as cancelMatch |

**Deprecated:**
- `playerOneAddress` / `playerTwoAddress` params in `createMatchEscrow` — replaced by `playerAddresses: string[]`
- `playerOneAddress` / `playerTwoAddress` params in `cancelMatchEscrow` — replaced by `playerAddresses: string[]`
- `escrow.playerOne` / `escrow.playerTwo` fields — replaced by `escrow.players[]`
- `escrow.playerOneDeposited` / `escrow.playerTwoDeposited` — replaced by `escrow.depositsMask`

## Open Questions

1. **How does `settleMatch` in solana.js get the player count?**
   - What we know: `wagerStates[roomId].wallets` has wallet addresses keyed by socketId. The number of wallets = number of players. But at settlement time, the wallet count might be reduced by disconnects.
   - What's unclear: Whether the player count should come from `wagerStates.wallets` length (might be wrong after disconnect), `getEscrowState().numDeposited` (authoritative but costs an RPC call), or a parameter passed by the caller.
   - **Recommendation:** For Phase 21, derive `numDeposited` from `Object.values(wagerStates.wallets).filter(Boolean).length` at the call site in main.js when calling `settleMatch`. OR accept `numDeposited` as an optional parameter. Simplest path: change `settleMatch` to accept a `playerCount` param defaulting to 2 for backward compat.

2. **`cancelMatchEscrow` call sites in main.js pass individual addresses, not arrays**
   - What we know: main.js has at least 5 call sites (lines 120, 146, 760, 1238, 1580) all using `cancelMatchEscrow(matchId, p1wallet, p2wallet)`.
   - What's unclear: Phase 21 scope is "service layer only." Should main.js be updated in Phase 21 or a later phase?
   - **Recommendation:** Update the `cancelMatchEscrow` signature to accept `(matchId, playerAddresses[])` AND update main.js call sites in the same phase. The call sites are trivial (wrap in array: `[p1wallet, p2wallet]`). Not updating them would leave main.js broken.

3. **`failedSettlements` store shape**
   - What we know: Stores `p1wallet` and `p2wallet` separately for retry. The SF-03 retry calls `cancelMatchEscrow(matchId, data.p1wallet, data.p2wallet)`.
   - What's unclear: Should the store be updated to `playerWallets: []` or keep the old shape and adapt the call?
   - **Recommendation:** Keep store shape, change call to `cancelMatchEscrow(matchId, [data.p1wallet, data.p2wallet])`.

4. **What `depositedPlayerAddresses` to pass to `cancelMatch` remaining_accounts?**
   - What we know: `wagerStates.deposits` tracks which socketIds have confirmed deposits. `wagerStates.wallets` maps socketId to wallet address. Players are ordered by `room.players` array (index = player position).
   - **Recommendation:** Build remaining accounts from `room.players` in order, filter to those with `wagerStates.deposits[socketId]` set, map to wallet address. Pass in-order.

## Sources

### Primary (HIGH confidence)
- `server/idl/solshot_escrow.json` — Current IDL, post-Phase-20, confirmed byte-identical with `target/idl/`
- `programs/solshot-escrow/src/lib.rs` — Anchor program source, all instructions verified
- `.planning/phases/20-anchor-program/20-VERIFICATION.md` — Phase 20 verification, 4/5 truths verified, N-player program complete

### Secondary (MEDIUM confidence)
- `server/services/escrow.js` — Current implementation, fully read
- `server/services/solana.js` — Current implementation, fully read
- `server/socket-io/main.js` — Call sites identified, impact on main.js assessed

### Tertiary (LOW confidence)
- Anchor 0.32.1 `remainingAccounts` API pattern — Inferred from IDL structure and program source; pattern is standard Anchor practice but not explicitly re-verified against Anchor 0.32.1 changelog

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — same libraries already installed and working
- Architecture: HIGH — IDL and Rust program source are ground truth; JS patterns derived directly from them
- Pitfalls: HIGH — sourced from existing code analysis + 20-VERIFICATION.md findings

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable — no new dependencies, no external APIs)

---

## Appendix: Full Call Site Inventory

### `createMatchEscrow` callers in main.js
| Line | Pattern | N-player impact |
|------|---------|----------------|
| 1191 | `createMatchEscrow(roomId, roomWager, hostWallet, joinerWallet)` | Change to `[hostWallet, joinerWallet]` |
| 1551 | `createMatchEscrow(roomId, wagerAmount, opponent.wallet, matchJoinerWallet)` | Change to `[opponent.wallet, matchJoinerWallet]` |

### `cancelMatchEscrow` callers in main.js
| Line | Context | Pattern |
|------|---------|---------|
| 120 | SF-03 retry | `cancelMatchEscrow(matchId, data.p1wallet, data.p2wallet)` |
| 146 | SF-03 immediate | `cancelMatchEscrow(roomId, p1wallet, p2wallet)` |
| 760 | Even disconnect | `cancelMatchEscrow(roomId, p1w, p2w)` |
| 1238 | Deposit timeout (joinRoom) | `cancelMatchEscrow(roomId, p1wallet, p2wallet)` |
| 1580 | Deposit timeout (queue) | `cancelMatchEscrow(roomId, p1wallet, p2wallet)` |

All five call sites currently pass two positional addresses. All must change to array form.

### `getEscrowState` callers in main.js
| Line | Field accessed | Impact |
|------|---------------|--------|
| 1996 / 2000 | `escrowState.playerOneDeposited` (line 2011), `escrowState.playerTwoDeposited` (line 2012) | Add compat shim in getEscrowState OR update main.js |

### `settleMatch` callers in main.js
| Line | Pot calc | Impact |
|------|---------|--------|
| 460 | Implicit: caller passes `wsState.amount`, settleMatch internally does `wager * 2` | Fix pot calc in settleMatch |
| 776 | Same pattern | Same fix |
| 2388 | Same pattern | Same fix |
