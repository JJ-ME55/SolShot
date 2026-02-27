# Feature Landscape: N-Player Escrow

**Domain:** Wagered competitive game with on-chain escrow — N-player extension
**Project:** SolShot — extending 2-player escrow to 3-4 players
**Researched:** 2026-02-27
**Research mode:** Features dimension — scope-bounded to escrow mechanics only

---

## Research Notes on Sources

This document covers the N-player escrow dimension specifically. The prior FEATURES.md (2026-02-26)
covered N-player game engine features (turn order, HUD, elimination, etc.) and remains valid for
that scope. This document answers the questions:

1. How do N-player wager/escrow mechanics work in competitive games?
2. What are the expected deposit flows, partial deposit behaviors, anti-grief measures?
3. What must be built vs. what to deliberately avoid?

**Evidence gathered from:**
- SolShot codebase: `programs/solshot-escrow/src/lib.rs`, `server/services/escrow.js`,
  `server/socket-io/main.js` lines 61-64, 1197-1247, 1566-1589, 1973-2055
- Existing 2-player deposit flow observed in code (parallel emit, server-side `ws.deposits` map,
  `allDeposited` check, `escrowActive` broadcast)
- Anchor account space documentation: `anchor-lang.com/docs/references/space`
  (Pubkey=32B, bool=1B, Vec<T>=4+n*size(T), u64=8B, String=4+len, discriminator=8B)
- GamerWager.com: 1v1 wager platform — requires both players to confirm result before payout
- Poker tournament payout structure (industry standard for N-player pot splits)
- Solana account realloc documentation: max 10,240 bytes per instruction, max 10 MB total
- CS2/Rocket League competitive: abandonment = cooldown, not refund — inapplicable model
- EVE Online escrow discussion: third-party trust escrow patterns

**Confidence levels:**
- Deposit flow (parallel vs sequential): HIGH — directly visible in existing server code
- Anchor account space math: HIGH — official docs
- Anti-grief mechanics: MEDIUM — extrapolated from existing 2-player timeout pattern + poker tournament norms
- Match mode unlock decisions: HIGH — user decision explicitly stated in context
- Settlement math: HIGH — existing BPS code is directly extensible
- Partial deposit UX patterns: MEDIUM — no direct industry equivalent found; derived from first principles
  and existing 2-minute timeout pattern

---

## Table Stakes

Features that must exist for N-player escrow to be functional. Absence blocks wagered N-player matches.

| Feature | Why Expected | Complexity | Existing Code Dependency |
|---------|--------------|------------|--------------------------|
| Parallel deposit emission | Server must send deposit TX to all N players simultaneously. Sequential deposits would mean P2 waits for P1 signature, etc. — adds 10-30s latency per player. | Low | Existing: `Promise.all([buildDepositTransaction(...)])` for 2 players. Extend to `Promise.all(room.players.map(p => buildDepositTransaction(...)))` |
| Per-player deposit status tracking (server) | Server tracks which of N players have deposited. `ws.deposits[socketId]` map already used. Must check all N, not just 2. | Low | Existing: `ws.deposits[client.id] = txSignature` + `room.players.every(p => ws.deposits[p.socketId])`. Works unchanged for N players — no code change needed, the `.every()` call is already N-generic. |
| Deposit status broadcast (all players see who deposited) | Players waiting in lobby need to know P2 deposited, waiting for P3. Without this, the lobby appears frozen. | Low | New: server emits `escrowDepositStatus` after each confirmed deposit. Client lobby shows checkmarks per player. |
| `escrowActive` emitted when all N deposit | Match cannot start until all players have funds on-chain. Triggering on "all N deposited" prevents starting with partial pot. | Low | Existing: `allDeposited` check uses `.every()` — already N-generic. `io.sockets.in(rid).emit('escrowActive', ...)` already broadcasts to all. |
| 5-10 minute deposit timeout (not 2 minutes) | Current timeout is 2 minutes (DCA-01). N players need more time — each additional player adds wallet interaction latency. With 4 players on mobile wallets, 2 minutes is borderline. 5 minutes is the industry norm for tournament lobby escrow. | Low | `DEPOSIT_TIMEOUT_MS = 120_000` → `300_000` (5 min). One constant change. |
| Cancel and refund ALL deposited players on timeout | If P1 and P2 deposited but P3 did not, P1 and P2 must be fully refunded. No partial forfeit for the non-depositor. | Medium | Anchor program: `cancel_match` currently accepts exactly `player_one` and `player_two` accounts. For N players, must accept N accounts. Requires program rewrite. |
| Wager guard removed for 3-4 players | Currently `SYS-08` blocks wager for maxPlayers > 2. User decision: unlock all modes. Remove this guard once Anchor program supports N players. | Low | `server/socket-io/main.js` line 1356: `if (wagerAmount > 0 && maxPlayers > 2)` — delete this block. |
| `create_match` with N player wallets | Anchor program `create_match` currently takes exactly `player_one: Pubkey, player_two: Pubkey`. Must be extended to take N players (2-4). | Medium-High | Anchor program rewrite: see Architecture section below |
| `settle_match` pays winner from N-player pot | Total pot = N × wager. 90% to winner, 7% treasury, 3% ops. Math is identical — just multiply by N instead of 2. | Low | BPS math already uses `wager * 2` in u128 widening. Change to `wager * player_count`. |
| Winner constraint validates against N players | `settle_match` currently constrains `winner.key() == escrow.player_one OR escrow.player_two`. For N players, must check against the stored players vec. | Medium | Anchor constraint rewrite: iterate stored `players: Vec<Pubkey>` |
| On-chain deposit status verification | Server's `escrowDepositConfirm` handler verifies on-chain before accepting. For N players, must check the correct slot in the `deposits: Vec<bool>` array, not a named field. | Low | `getEscrowState()` in escrow.js needs updated field mapping |

---

## Differentiators

Features that set SolShot apart from the handful of crypto games attempting N-player wagering.
Not universally expected but add trust and UX quality.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Deposit countdown visible to all players | Real-time countdown overlay showing "5:00 remaining to deposit" with per-player status. Makes the 5-minute window feel fair and transparent rather than opaque. | Low | Client: countdown from `depositDeadlineMs` (already sent by server in `escrowDeposit` event). Add per-player status dots. |
| "Start with who's here" partial deposit choice | If P1/P2 deposited but P3 did not by timeout, host sees: "Start 2-player match with deposited players?" or "Cancel and refund all?" Depositors do not lose their funds either way. | Medium | Server: new socket event `escrowPartialDeposit`. Host choice emitted as `escrowPartialStart` or `escrowCancelAll`. Requires server logic to refund non-depositors and continue with subset. |
| Non-depositor kick with no penalty | If a player refuses to deposit (or wallet fails), they are removed from the room. No in-game penalty. They simply don't play. Deposited players have options. | Low | Server: add to timeout handler — identify non-deposited players, emit `kickedForNoDeposit` to their socket before cancelling/adjusting |
| Escrow PDA state readable by anyone | All players (and observers) can query on-chain state independently. "Don't trust the server, verify the chain" is a crypto-native expectation. | None | Inherent to Anchor PDA design — already true |
| Total pot displayed in lobby + battle HUD | "Pot: 1.2 SOL" shown during match. Motivates players and communicates stakes clearly. | Low | `escrowActive` payload already includes `totalPot`. Pass to BattleHUD. |
| `escrowDepositStatus` socket event after each deposit | Real-time feedback: "Player 2 has deposited (2/3 confirmed)". Eliminates the dead-air period between escrow emit and escrow active. | Low | New server emit in `escrowDepositConfirm` handler after `ws.deposits` update |
| Permissionless reclaim safety net remains | Existing DCA-02 (48h permissionless reclaim) should remain. N-player matches could hang if server crashes post-match before settling. Players can always recover funds on-chain without server. | None | Already exists; extend event fields for N-player (`players: Vec<Pubkey>`) |

---

## Anti-Features

Features to deliberately NOT build for this milestone. Each is a real temptation that should be
resisted.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Sequential deposit flow (P1 signs, then P2, then P3) | Adds per-player latency. With 4 players, sequential means the 4th player might wait 45+ seconds just for prior confirmations. Creates confusion ("is P2 done yet?"). | Parallel emit: all N players receive their deposit TX simultaneously and sign independently. Server waits for all N confirmations in any order. |
| Placement-based pot split for launch (60/25/15) | Requires separate Anchor instructions, complex fee math per placement, and new client settlement UI. Winner-takes-all is economically clear and simpler to verify. | Winner-takes-all for this milestone. Add placement split as a future upgrade when it's independently tested. |
| Deposit requirement before room is created | Requiring deposits before the lobby is full means early depositors wait with locked funds while the room fills. This is hostile UX — funds should only be requested once the room is full and match is imminent. | Current pattern is correct: `create_match` on room-full, deposit TX sent immediately after. |
| Forcing all modes for N players with complex wager tiers | Duel (0.25-0.5 SOL) and High Roller (1.0 SOL) for 4 players means pot sizes of 1-4 SOL. These are meaningful amounts. No need to restrict modes, but no need to create N-player-specific tiers either. | Use the same mode table. Equal wagers apply uniformly regardless of player count. |
| Server-held SOL as escrow | Requires custodial trust in the server keypair for user funds. The existing on-chain PDA approach is correct — funds go directly to the Anchor program PDA, not the server wallet. | Continue using Anchor PDA. Server only has authority to settle and cancel, not to withdraw. |
| Timeout extension requests (player asks for more time) | A player with wallet issues can hold up N-1 other players indefinitely if timeout can be extended. | Fixed timeout, no extensions. 5 minutes is generous. If wallet fails, that player gets kicked, depositors get options. |
| Per-player different wager amounts | "Player 1 wagers 0.5, Player 2 wagers 0.25" creates unfair pot math and complex settlement. User decision already: equal wagers only. | Equal wagers enforced. `wager_lamports` is a single field in the escrow PDA, uniform for all. |
| Dispute mechanism for N-player "someone cheated" claims | For 4 wagered players, a dispute mechanism requires human moderation or oracle resolution. This is a full product scope. | Server-authoritative game physics prevent cheating without disputes. If the server settles, settlement is correct by construction. |
| 24-hour deposit timeout on N-player rooms | Current 24h timeout on `cancel_match` is designed for the case where a match is created but never activated. For the 5-minute lobby timeout, the server cancels on timeout. The 24h on-chain timeout is a backstop, not the primary mechanic. Do not present it to users as "you have 24 hours to deposit." | Present the 5-minute server countdown. The 24h on-chain timeout is silent infrastructure. |

---

## Feature Dependencies

What must exist before what. Dependencies are ordered — items lower in a chain cannot start
until items above are complete.

```
[Anchor Program: N-player PDA]
  create_match(match_id, wager, players: Vec<Pubkey>)
  deposit_wager(player: Signer) → matches against stored Vec
  settle_match(winner: Pubkey) → validates against stored Vec
  cancel_match(players: Vec<UncheckedAccount>) → refunds all deposited
    |
    v
[Server: escrow.js updates]
  createMatchEscrow(matchId, wager, players[]) → passes Vec<Pubkey>
  buildDepositTransaction(matchId, playerAddress) → unchanged API
  cancelMatchEscrow(matchId, players[]) → passes all N addresses
  settleMatchEscrow(matchId, winner, players[]) → passes all N addresses
  getEscrowState(matchId) → maps Vec<bool> deposits to player addresses
    |
    v
[Server: main.js wager guard removal]
  Remove SYS-08: `if (wagerAmount > 0 && maxPlayers > 2)` block
    |
    v
[Server: main.js N-player deposit emit]
  Promise.all(room.players.map(p => buildDepositTransaction(roomId, p.wallet)))
  room.players.forEach(p => io.sockets.sockets.get(p.socketId).emit('escrowDeposit', ...))
    |
    v
[Server: main.js N-player deposit tracking + status broadcast]
  escrowDepositConfirm handler: ws.deposits[client.id] = sig (already N-generic)
  After each confirmation: emit escrowDepositStatus { deposited: N, total: M }
  allDeposited = room.players.every(p => ws.deposits[p.socketId]) (already N-generic)
    |
    v
[Server: main.js deposit timeout N-player cancel]
  On timeout: identify non-deposited players, call cancelMatchEscrow(matchId, allPlayers[])
  Emit escrowPartialDeposit to host if some deposited (partial deposit decision)
    |
    v
[Client: LobbyScreen deposit status UI]
  Per-player deposit status dots (confirmed / pending)
  Countdown from depositDeadlineMs
  Partial deposit choice modal (host only)
    |
    v
[Client: BattleHUD total pot display]
  totalPot from escrowActive payload
```

---

## Anchor Program Account Space (N-Player)

The existing `MatchEscrow` account is hardcoded for exactly 2 players. Extending to N players
requires restructuring the account fields.

**Current account (2-player, 168 bytes total):**
```
8   discriminator
4+32 match_id (String, max 32 chars)
32  authority
32  player_one
32  player_two
8   wager_lamports
1   player_one_deposited
1   player_two_deposited
1   state enum
8   created_at
8   activated_at
1   bump
= 168 bytes
```

**N-player account design (max 4 players, fixed allocation preferred):**

Option A — Fixed slots (recommended): Pre-allocate 4 player slots, use `player_count: u8` to
know how many are active. Simpler than Vec; no realloc needed.

```
8    discriminator
4+32 match_id (String, max 32 chars)
32   authority
1    player_count (u8, 2-4)
4    players: [Pubkey; 4] prefix bytes not needed — fixed array
     4 × 32 = 128 bytes for players
4    deposited: [bool; 4] — fixed array, 4 bytes
8    wager_lamports
1    state enum
8    created_at
8    activated_at
1    bump
= 8 + 36 + 32 + 1 + 128 + 4 + 8 + 1 + 8 + 8 + 1 = 235 bytes
```

Option B — Vec<Pubkey> + Vec<bool> (dynamic): Allows 2-4 without wasted bytes.
`Vec<Pubkey>`: 4 + (4 × 32) = 132 bytes max.
`Vec<bool>`: 4 + 4 = 8 bytes max.
Space at init must be allocated for max (can't grow dynamically without realloc).
Total is similar to Option A but more complex code.

**Recommendation: Option A (fixed 4-slot arrays).** Fixed allocation avoids Anchor's
realloc complexity and the 10,240-byte-per-instruction realloc limit (not a concern at this
size, but fixed is simpler and well within 10,240-byte init limit). The 67-byte increase
over the current 168-byte account is negligible in rent cost.

**Rust struct for Option A:**
```rust
#[account]
pub struct MatchEscrow {
    pub match_id: String,          // 4 + 32 = 36
    pub authority: Pubkey,         // 32
    pub player_count: u8,          // 1
    pub players: [Pubkey; 4],      // 128
    pub deposited: [bool; 4],      // 4
    pub wager_lamports: u64,       // 8
    pub state: MatchState,         // 1
    pub created_at: i64,           // 8
    pub activated_at: i64,         // 8
    pub bump: u8,                  // 1
}
// SPACE = 8 + 36 + 32 + 1 + 128 + 4 + 8 + 1 + 8 + 8 + 1 = 235
```

The `cancel_match` and `settle_match` instructions currently take named `player_one` and
`player_two` as `UncheckedAccount` with explicit constraints. For N players, these become
`remaining_accounts` (Anchor's escape hatch for variable account lists) with server-side
validation that remaining_accounts keys match stored `players[0..player_count]`.

**HIGH confidence — Anchor space documentation is authoritative. Fixed-array approach is a
well-established pattern in Anchor programs.**

---

## Partial Deposit Decision Tree

When the deposit timeout fires and not all players have deposited:

```
Timeout fires
  │
  ├─ All deposited?
  │    YES → (already cleared by escrowActive, timer deleted) — no-op
  │
  └─ Some deposited, some not
       │
       ├─ Zero deposited → cancel_match (AwaitingDeposits, no refunds needed) → removeRoom
       │
       └─ 1+ deposited, at least 1 did not
            │
            ├─ Only 1 deposited (regardless of total player count):
            │    cancel_match (refund the 1 depositor) → removeRoom
            │    Non-depositors get kicked (escrowKicked event)
            │
            └─ 2+ deposited (player_count was 3 or 4):
                 Emit escrowPartialDeposit to HOST:
                   { roomId, deposited: [{ socketId, name }], notDeposited: [...], deadline: 60s }
                 HOST has 60 seconds to choose:
                   "START WITH DEPOSITED PLAYERS" → escrowPartialStart
                     Server: kick non-depositors (no refund needed — never deposited)
                     Server: update room.maxPlayers = deposited.length
                     Server: match continues as N-player reduced match (min 2)
                   "CANCEL AND REFUND ALL" → escrowCancelAll
                     Server: cancel_match with all N accounts (refunds deposited, no-op for others)
                     Server: removeRoom
                 HOST timeout (no response in 60s):
                   Default: cancel and refund all (safer default — no forced reduced match)
```

Note: The "start with subset" path requires the server to adjust match state for the reduced
player count. Weapon positions, turn order, and HP bars adjust naturally since they are driven
by `room.players`. The Anchor PDA already tracks which players deposited — non-depositors
never had funds on-chain, so no on-chain cancel is needed for them (just server-side removal).

---

## Match Mode Availability for N Players

User decision: all modes unlocked for 3-4 players. Removing SYS-08.

| Mode | Wager | Formats | 3-4 Player? | Notes |
|------|-------|---------|-------------|-------|
| Practice | 0 SOL | BO1 | YES | Already works (wager=0, no escrow) |
| Quick Match | 0.1 SOL | BO1/BO3 | YES (unlock) | Pot: 0.3-0.4 SOL for 3-4 players |
| Duel | 0.25-0.5 SOL | BO3/BO5 | YES (unlock) | Pot: 0.75-2.0 SOL for 3-4 players |
| High Roller | 1.0 SOL | BO3/BO5 | YES (unlock) | Pot: 3-4 SOL for 3-4 players — meaningful stakes |
| Custom Challenge | 0.1+ SOL | BO1/BO3/BO5 | YES (unlock) | Host sets wager |

For BO3/BO5 with N>2 players: placement scoring across rounds is deferred (see prior FEATURES.md).
The existing round-win counter (`isMatchOver`) works for N players — last alive each round gets
the round win point. First to ceil(maxRounds/2) round wins ends the match. This is functionally
correct though not nuanced (eliminated early players cannot catch up). Acceptable for launch.

**Settlement for multi-round N-player:** Escrow is settled once at match end, not per round. The
`escrowActive` state persists through all rounds. `settle_match` is called once when
`isMatchOver` returns true. This is identical to the 2-player flow — no change needed.

---

## Anti-Grief Measure Catalog

Mechanisms to prevent a player from intentionally disrupting a wagered N-player lobby.

| Grief Vector | Mechanism | Implementation |
|--------------|-----------|----------------|
| Player refuses to deposit (wallet stays closed) | Deposit timeout (5 min) auto-kicks non-depositors. Deposited players get choice to continue. | `DEPOSIT_TIMEOUT_MS = 300_000`. Timeout handler identifies non-deposited sockets. |
| Player deposits then disconnects immediately | 30s reconnect window already exists. After 30s, if still disconnected, elimination logic applies (LP-08: 3 consecutive timeouts → eliminated). Deposited funds remain in escrow — settled at match end. | Existing reconnect + forfeit mechanics handle this. |
| Player deposits then intentionally throws (gives turns, suicide shots) | Server cannot prevent intentional bad play. This is a game design limitation inherent to wagered games. Insufficient ground for dispute. | No mechanism — accepted limitation. Same in 2-player. |
| Room creator sets maxPlayers=4, enters wager, waits to be matched, then refuses deposit | Same as any non-depositor. Kicked after timeout. Deposited players get refund option. | Covered by timeout mechanic. |
| Wallet griefing: player signs deposit but submits wrong amount | Anchor program validates `wager_lamports` — the instruction carries the PDA's stored amount, not a client-supplied amount. Client cannot change the amount in the deposit TX (the IX is server-built). | Inherent to existing architecture. Server builds the TX; client only signs. |
| Replay attack: player re-submits an old deposit signature | `escrowDepositConfirm` checks `ws.deposits[socketId]` for existing entry. Duplicate confirmations are silently ignored (no second deposit can happen on-chain — `AlreadyDeposited` error). | Already handled. |
| Player joins room with no wallet connected, blocking a slot | Room join requires authentication (wallet signature). Unauthenticated sockets cannot join wagered rooms. | `requireAuth` middleware exists. |
| Matchmaking: player enters queue, gets matched, then disconnects before deposit | If socket disconnects during deposit window, existing disconnect handler fires. After 30s, `pendingReconnects` expires. Deposit timer continues. If timer fires and player never reconnected + deposited, treated as non-depositor. | Existing disconnect handling + timeout mechanic covers this. |

---

## Settlement Math for N Players

Current 2-player settlement:
```
total_pot = wager × 2
treasury = total_pot × 700 / 10000   // 7%
ops = total_pot × 300 / 10000        // 3%
winner = total_pot - treasury - ops  // 90%
```

N-player settlement (winner-takes-all):
```
total_pot = wager × player_count     // e.g., 0.1 SOL × 4 = 0.4 SOL
treasury = total_pot × 700 / 10000   // 7%
ops = total_pot × 300 / 10000        // 3%
winner = total_pot - treasury - ops  // 90%
```

The BPS math is identical. Only `wager * 2` becomes `wager * player_count`. The `player_count`
is stored in the escrow account. The Anchor `settle_match` instruction reads it and computes
`total_pot = wager * player_count` using `checked_mul` with u128 widening (already in place).

Maximum pot at max wager (4 players × 100 SOL = 400 SOL = 400,000,000,000 lamports).
`u128` widening handles this safely (max u64 is ~18.4 × 10^18 lamports — no overflow risk).

**HIGH confidence — math is directly derived from existing verified code.**

---

## Client UX for N-Player Deposit Status

The current client flow for 2 players:
1. `escrowDeposit` socket event arrives → `signAndSendEscrowDeposit` called → signature sent to server
2. No intermediate feedback — lobby just shows "waiting" until `escrowActive`

For N players, the dead-air period (waiting for all N deposits) needs status feedback.

**Required new events (server → client):**

`escrowDepositStatus`:
```json
{
  "roomId": "abc123",
  "confirmed": 2,
  "total": 4,
  "players": [
    { "name": "Alice", "deposited": true },
    { "name": "Bob", "deposited": true },
    { "name": "Charlie", "deposited": false },
    { "name": "Dave", "deposited": false }
  ]
}
```

`escrowPartialDeposit` (to host only, on timeout with 2+ deposited):
```json
{
  "roomId": "abc123",
  "deposited": [{ "socketId": "...", "name": "Alice" }, { "socketId": "...", "name": "Bob" }],
  "notDeposited": [{ "socketId": "...", "name": "Charlie" }],
  "choiceDeadlineMs": 1710000000000
}
```

**Required client state in LobbyScreen:**
- `depositStatus`: `{ confirmed: number, total: number, players: { name, deposited }[] }`
- `showPartialDepositModal`: `boolean` (host only)
- Countdown from `depositDeadlineMs` (already received in `escrowDeposit` event)

**Lobby UI during deposit window:**
- Per-player row: avatar color + name + checkmark (deposited) or spinner (pending)
- Countdown timer: "4:32 remaining to deposit"
- Your own deposit button (if not yet deposited): "DEPOSIT 0.1 SOL"

---

## MVP Recommendation

For this milestone (N-player escrow), ship in this order:

**Must ship (blocks wagered N-player matches):**
1. Anchor program N-player PDA (fixed 4-slot arrays, `player_count: u8`)
2. `cancel_match` extended to N accounts via `remaining_accounts`
3. `settle_match` extended to validate winner against N-player list and compute `wager × player_count`
4. Server: `createMatchEscrow`, `cancelMatchEscrow`, `settleMatchEscrow` updated for N players
5. Server: Remove SYS-08 wager guard
6. Server: N-player deposit emit (`Promise.all` for N buildDepositTransaction calls)
7. Server: `escrowDepositStatus` broadcast after each confirmation
8. Client: Per-player deposit status UI (checkmarks + countdown)

**Should ship (material UX improvement, medium complexity):**
9. Partial deposit decision flow (`escrowPartialDeposit` event + host modal)
10. Total pot display in BattleHUD
11. Deposit countdown visible to all N players

**Defer to follow-on:**
- Placement-based pot split (60/25/15 for 3-4 players) — High complexity, requires new Anchor instructions
- Matchmaking queue for N-player wagered (queue currently pairs 2 players only — extending to "fill a 4-player room" requires lobby matchmaking rewrite)
- BO3/BO5 placement scoring across rounds for N players (deferred per prior FEATURES.md)

---

## Feature Dependencies on Prior Milestone

This N-player escrow milestone must be built ON TOP of the completed N-player game engine
milestone. Specifically, these must exist before N-player escrow:

- `room.players[]` array model with N entries (not binary host/player)
- `matchStates[roomId]` supporting N players (`alive[]`, `placementPoints`, etc.)
- 3-4 player match can run end-to-end in Practice mode
- `isMatchOver()` returns a winner for N-player matches

**Do not attempt N-player escrow before Practice mode N-player is stable.**
The wager guard (`SYS-08`) is the correct short-term control — it ensures N-player game logic
can be validated without real money at risk.

---

## Sources

- SolShot codebase: `programs/solshot-escrow/src/lib.rs` — existing 2-player Anchor program, PDA space, BPS math
- SolShot codebase: `server/services/escrow.js` — server-side Anchor wrappers
- SolShot codebase: `server/socket-io/main.js` lines 61-64 (DEPOSIT_TIMEOUT_MS), 1197-1247 (createRoom escrow), 1566-1589 (joinQueue escrow), 1973-2055 (escrowDepositConfirm handler)
- SolShot codebase: `client/src/screens/LobbyScreen.js` — client escrow event handling
- SolShot codebase: `client/src/wallet/WalletContext.js` — `signAndSendEscrowDeposit` flow
- [Anchor Account Space Reference](https://www.anchor-lang.com/docs/references/space) — type byte sizes (Pubkey=32, bool=1, Vec prefix=4, String prefix=4, discriminator=8)
- [Solana Account Realloc — DEV Community](https://dev.to/jacobcreech/how-to-change-account-size-on-solana-55b4) — max 10,240 bytes per realloc
- [Simple Escrow Bet — GitHub](https://github.com/eltontay/Simple-Escrow-Bet) — N-player (up to 20) escrow: one-deposit-per-address, winning group splits pool
- [GamerWager.com](https://gamerwager.com/) — 1v1 wager pattern: both players confirm result before payout
- [Solana Escrow Gambling — GitHub](https://github.com/dariusjvc/solana-escrow-gambling) — 2-player escrow: no withdrawal after both deposit, winner calls closeGame
- SolShot MEMORY.md — escrow architecture, known gotchas, existing constraints
