# Phase 22: Server Socket Handlers - Research

**Researched:** 2026-02-28
**Domain:** Node.js/Socket.IO server orchestration, N-player escrow flow, wager state management
**Confidence:** HIGH (all findings derived from direct codebase inspection)

## Summary

Phase 22 modifies `server/socket-io/main.js` (~2923 lines) to upgrade the existing 2-player escrow flow to N-player (2–4). The file already handles 2-player deposit tracking in `escrowDepositConfirm`, has a working `DEPOSIT_TIMEOUT_MS` timer, and emits `escrowActive` when all players confirm. The work is surgical: replace hardcoded 2-player assumptions with loop-based N-player logic, extend the timeout path to present a partial-deposit decision to the first depositor, wire up two new client event handlers (`escrowPartialStart`, `escrowCancelAll`), remove the wager guard for 3-4 player rooms, and fix SHOT milestone + playAgain to cover all N players.

The escrow service API (`escrow.js`) is already fully N-player capable — `createMatchEscrow(matchId, wagerSOL, playerAddresses[])`, `cancelMatchEscrow(matchId, playerAddresses[])`, `startWithDepositorsEscrow(matchId)`, and `getEscrowState(matchId)` (returns `depositsMask` bitmask). `startWithDepositorsEscrow` is re-exported from `solana.js` and available for direct import in `main.js`.

**Primary recommendation:** All changes are confined to `main.js` (and its import line). No new services needed. Work in named function segments — the file is too large to navigate by line number.

## Standard Stack

### Core (no new packages needed)

| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| Socket.IO server | existing | Event dispatch, room broadcast | `io.sockets.in(roomId).emit()` for all-room, `io.to(socketId).emit()` for targeted |
| `escrow.js` | existing | N-player Anchor program wrappers | All functions already N-player capable |
| `solana.js` | existing | Re-exports `startWithDepositorsEscrow` | Already in exports list at line 281 |
| `shot-token.js` | existing | `recordMatchPlayed()` per wallet | Called once per player wallet — loop pattern needed |

### Imports to Add to main.js

```js
import { startWithDepositorsEscrow } from '../services/solana.js';
```

`startWithDepositorsEscrow` is already re-exported from `solana.js` at line 281 but **not yet imported** in the `main.js` import line (line 12). It needs to be added to the destructuring import.

## Architecture Patterns

### Pattern 1: N-Player Escrow Creation (joinRoom path — lines 1186–1254)

**Current code** calls `createMatchEscrow(roomId, roomWager, [hostWallet, joinerWallet])` — hardcoded 2-player array. Must change to collect **all player wallets** from `wagerStates[roomId].wallets`:

```js
// Collect all player wallets in players[] order
const allWallets = room.players.map(p => ws.wallets[p.socketId]).filter(Boolean);

const escrowResult = await createMatchEscrow(roomId, roomWager, allWallets);
```

Then `buildDepositTransaction` and `emit('escrowDeposit')` must loop over all players using `Promise.all`:

```js
const depositTxs = await Promise.all(
    room.players.map(p => buildDepositTransaction(roomId, ws.wallets[p.socketId]))
);

const depositDeadline = Date.now() + DEPOSIT_TIMEOUT_MS;

room.players.forEach((p, i) => {
    const sock = io.sockets.sockets.get(p.socketId);
    if (sock && depositTxs[i]?.success) {
        sock.emit('escrowDeposit', {
            roomId,
            transaction: depositTxs[i].transaction,
            escrowPDA: escrowResult.escrowPDA,
            wager: roomWager,
            depositDeadlineMs: depositDeadline,
        });
    }
});
```

**Same pattern** applies to the `joinQueue` path (lines 1549–1595), which also calls `createMatchEscrow` with 2-player hardcoded array.

### Pattern 2: Deposit Confirmation Tracking (escrowDepositConfirm — lines 1975–2056)

**Current:** checks `playerOneDeposited`/`playerTwoDeposited` backward-compat shims from `getEscrowState()`. For N-player, use `depositsMask` bitmask.

```js
// getEscrowState() returns: { depositsMask, numDeposited, players[], maxPlayers, ... }
const playerIndex = room.players.findIndex(p => p.socketId === client.id);
const deposited = (escrowState.depositsMask & (1 << playerIndex)) !== 0;
```

**After confirming**, emit `escrowDepositStatus` to all room members (SRV-18 — real-time progress):

```js
const numDeposited = Object.keys(ws.deposits).length;
io.sockets.in(rid).emit('escrowDepositStatus', {
    roomId: rid,
    numDeposited,
    totalPlayers: room.players.length,
    depositorWallets: room.players
        .filter(p => ws.deposits?.[p.socketId])
        .map(p => ws.wallets[p.socketId]),
});
```

**All-deposited check:** `room.players.every(p => ws.deposits?.[p.socketId])` — already correct, works for N players.

**First depositor tracking** (needed for partial-deposit decision-maker): track in `ws.firstDepositorSocketId` on the first confirmed deposit:

```js
if (!ws.firstDepositorSocketId) {
    ws.firstDepositorSocketId = client.id;
}
```

### Pattern 3: Deposit Timeout — Partial Deposit Flow (lines 1224–1247)

**Current:** timeout immediately cancels escrow and destroys room via `removeRoom()`. Must change to:

1. Check if any deposits have been made
2. If zero deposits: cancel escrow outright (same as before)
3. If ≥1 deposit but <N: emit `escrowPartialDeposit` to decision-maker, start 30s decision timer
4. If all deposited: this case never fires (timer cleared on all-deposited)

**Decision-maker:** `ws.firstDepositorSocketId` (first depositor), fallback to `room.players[0].socketId` (host) if none deposited.

**Minimum to start:** at least 2 depositors required. If only 1 deposited, only cancel option is valid (send in the `escrowPartialDeposit` event payload as `canStart: false`).

```js
// DEPOSIT_TIMEOUT_MS fires:
depositTimers[roomId] = setTimeout(async () => {
    delete depositTimers[roomId];
    const wsCheck = wagerStates[roomId];
    const roomCheck = findRoom(roomId);
    if (!roomCheck || !wsCheck) return;

    const numDeposited = Object.keys(wsCheck.deposits || {}).length;
    const totalPlayers = roomCheck.players.length;

    if (numDeposited === totalPlayers) return; // all deposited, already cleared

    if (numDeposited === 0) {
        // No deposits — cancel escrow and destroy room
        const allWallets = roomCheck.players.map(p => wsCheck.wallets[p.socketId]).filter(Boolean);
        if (isEscrowEnabled()) await cancelMatchEscrow(roomId, allWallets).catch(console.error);
        io.sockets.in(roomId).emit('escrowDepositTimeout', { roomId });
        await removeRoom(roomId);
        broadcastRooms(io);
        io.socketsLeave(roomId);
        return;
    }

    // Partial deposits — emit to decision-maker, 30s window
    const depositorSocketIds = Object.keys(wsCheck.deposits || {});
    const decisionMakerSocketId = wsCheck.firstDepositorSocketId || roomCheck.players[0].socketId;
    const canStart = numDeposited >= 2;

    const depositorWallets = depositorSocketIds.map(sid => wsCheck.wallets[sid]).filter(Boolean);
    const nonDepositorSocketIds = roomCheck.players
        .map(p => p.socketId)
        .filter(sid => !wsCheck.deposits?.[sid]);

    io.to(decisionMakerSocketId).emit('escrowPartialDeposit', {
        roomId,
        numDeposited,
        totalPlayers,
        depositorWallets,
        canStart,
        decisionWindowMs: 30_000,
    });

    // Store partial state for decision handlers
    wsCheck.partialDecisionMaker = decisionMakerSocketId;
    wsCheck.nonDepositorSocketIds = nonDepositorSocketIds;
    wsCheck.depositorSocketIds = depositorSocketIds;

    // 30-second auto-cancel if no decision
    depositTimers[roomId] = setTimeout(async () => {
        delete depositTimers[roomId];
        const ws2 = wagerStates[roomId];
        const room2 = findRoom(roomId);
        if (!ws2 || !room2 || !ws2.partialDecisionMaker) return;
        // Auto-cancel all — refund depositors
        const depositorWals = (ws2.depositorSocketIds || [])
            .map(sid => ws2.wallets[sid]).filter(Boolean);
        if (isEscrowEnabled() && depositorWals.length > 0) {
            await cancelMatchEscrow(roomId, depositorWals).catch(console.error);
        }
        io.sockets.in(roomId).emit('escrowCancelledAll', { roomId, reason: 'decision_timeout' });
        await removeRoom(roomId);
        broadcastRooms(io);
        io.socketsLeave(roomId);
    }, 30_000);
}, DEPOSIT_TIMEOUT_MS);
```

### Pattern 4: escrowPartialStart Handler (SRV-14)

New `client.on('escrowPartialStart', ...)` handler. Only accepted from decision-maker socket. Requires ≥2 depositors.

```js
client.on('escrowPartialStart', async () => {
    if (!requireAuth(client, 'escrowPartialStart')) return;
    const room = findRoom(client.roomId);
    const ws = wagerStates[client.roomId];
    if (!room || !ws) return;

    // Only decision-maker can choose
    if (ws.partialDecisionMaker !== client.id) {
        client.emit('escrowError', { reason: 'Only the decision-maker can choose' });
        return;
    }
    if (!ws.depositorSocketIds || ws.depositorSocketIds.length < 2) {
        client.emit('escrowError', { reason: 'Need at least 2 depositors to start' });
        return;
    }

    // Clear decision timer
    if (depositTimers[client.roomId]) {
        clearTimeout(depositTimers[client.roomId]);
        delete depositTimers[client.roomId];
    }

    // Call on-chain startWithDepositors
    if (isEscrowEnabled()) {
        const result = await startWithDepositorsEscrow(client.roomId);
        if (!result.success) {
            client.emit('escrowError', { reason: result.error });
            return;
        }
    }

    // Kick non-depositors — notify with reason, send to lobby list
    for (const sid of ws.nonDepositorSocketIds || []) {
        const kickedSocket = io.sockets.sockets.get(sid);
        if (kickedSocket) {
            kickedSocket.emit('kickedFromRoom', {
                reason: 'You did not deposit in time. The match is starting without you.',
                destination: 'lobby',
            });
            kickedSocket.leave(client.roomId);
            kickedSocket.roomId = null;
            kickedSocket.isHost = false;
        }
    }

    // Compact room.players to depositors only
    room.players = room.players.filter(p => ws.depositorSocketIds.includes(p.socketId));
    room.maxPlayers = room.players.length;

    // Promote first player to host if needed
    if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
        room.players[0].isHost = true;
    }

    // Notify remaining players
    io.sockets.in(client.roomId).emit('escrowActive', {
        roomId: client.roomId,
        escrowPDA: room.escrowPDA,
        totalPot: ws.amount * room.players.length,
    });

    // Cleanup partial state
    delete ws.partialDecisionMaker;
    delete ws.nonDepositorSocketIds;
    delete ws.depositorSocketIds;

    broadcastRooms(io);
});
```

### Pattern 5: escrowCancelAll Handler (SRV-15)

```js
client.on('escrowCancelAll', async () => {
    if (!requireAuth(client, 'escrowCancelAll')) return;
    const room = findRoom(client.roomId);
    const ws = wagerStates[client.roomId];
    if (!room || !ws) return;

    if (ws.partialDecisionMaker !== client.id) {
        client.emit('escrowError', { reason: 'Only the decision-maker can choose' });
        return;
    }

    if (depositTimers[client.roomId]) {
        clearTimeout(depositTimers[client.roomId]);
        delete depositTimers[client.roomId];
    }

    // Refund depositors on-chain
    const depositorWallets = (ws.depositorSocketIds || [])
        .map(sid => ws.wallets[sid]).filter(Boolean);
    if (isEscrowEnabled() && depositorWallets.length > 0) {
        await cancelMatchEscrow(client.roomId, depositorWallets).catch(console.error);
    }

    // Return ALL players to the same room (room preserved, not destroyed)
    room.active = false;
    room.escrowPDA = null;
    room.players.forEach(p => { p.isReady = false; });
    delete wagerStates[client.roomId].deposits;
    delete wagerStates[client.roomId].firstDepositorSocketId;
    delete wagerStates[client.roomId].partialDecisionMaker;
    delete wagerStates[client.roomId].nonDepositorSocketIds;
    delete wagerStates[client.roomId].depositorSocketIds;

    io.sockets.in(client.roomId).emit('escrowCancelledAll', {
        roomId: client.roomId,
        reason: 'host_cancelled',
    });

    broadcastRooms(io);
});
```

### Pattern 6: SHOT Milestone N-Player (DEBT-01)

**Current code** (lines 2446–2479) assigns:
```js
const hostWallet = wsState?.wallets?.[hostId] || authenticatedWallets[hostId] || null
const playerWallet = wsState?.wallets?.[playerId] || authenticatedWallets[playerId] || null
```
And calls `recordMatchPlayed` twice. Must loop over all `room.players`:

```js
for (const p of room.players) {
    const pid = p.socketId;
    const wallet = wsState?.wallets?.[pid] || authenticatedWallets[pid] || null;
    if (!wallet) continue;
    shotResults[pid] = recordMatchPlayed(wallet, {
        turnCount: ms.turnCount,
        matchId,
        isWagered,
        isWinner: matchResult.winner === pid,
        maxRoundDamage: ms.maxRoundDamage?.[pid] || 0,
        weaponsUsed: ms.weaponsUsed?.[pid] ? Array.from(ms.weaponsUsed[pid]) : [],
    });
    if (shotResults[pid].earned > 0) trackShotEmission(shotResults[pid].earned);
}
```

**Same fix needed in forfeit path** (lines 482–508) — currently hardcoded `hostWalletF`/`playerWalletF`.

**DB persist loop** (lines 2552–2598) — also 2-player hardcoded. Must loop over all `room.players`. The `stats.wins` / `stats.losses` distinction remains valid: winner increments wins, all others increment losses.

**matchEndPayload prestige/milestones** (lines 2515–2523) also hardcoded to `hostId`/`playerId`. Must loop to build the `{ [socketId]: info }` maps dynamically.

### Pattern 7: playAgain maxPlayers Preservation (DEBT-02)

**Current** `resetForPlayAgain` (line 84–104):
```js
matchStates[roomId] = createMatchState(roomId, paRoundType)  // no maxPlayers arg
```

`createMatchState` accepts `maxPlayers` as 3rd arg (already used at line 1382 and 1525). Fix:
```js
matchStates[roomId] = createMatchState(roomId, paRoundType, room.players.length)
```

Also, the `playAgainRequest` handler (line 2909–2911) triggers `resetForPlayAgain` after all players vote. The context decision says: "if players leave after match, reduce maxPlayers to match remaining count." The existing disconnect handler already removes players from `room.players` when `!cleanupRoom2.active` (line 822–844). So at the time `playAgainRequest` fires, `room.players.length` will naturally reflect remaining players — no special case needed. Just pass `room.players.length` as maxPlayers.

For the playAgain + new escrow flow: after `resetForPlayAgain`, the room is reset and active=false. Since escrow is now wager-based and playAgain reuses the room, a fresh escrow should be created. The context decision says "Reuse room, new deposit round." This means `resetForPlayAgain` must also reset escrow state (`room.escrowPDA`, `delete wagerStates[roomId].deposits`, etc.) and the room needs to emit a new `escrowDeposit` to all players. This can be triggered by `resetForPlayAgain` calling the same escrow creation block used in joinRoom.

### Pattern 8: Wager Guard Removal (SRV-16)

Remove 3 lines at line 1355–1358 from `createRoom`:
```js
// SYS-08: Block wager modes for 3-4 player rooms (escrow only supports 2-player)
if (wagerAmount > 0 && maxPlayers > 2) {
    client.emit('createRoomError', { reason: 'Wager modes require 2 players. Use Practice mode for 3-4 player matches.' })
    return
}
```

No other wager guards for player count exist (queue-matched rooms are always 2-player and don't need changes).

Also update `trackWager(wagerAmount * 2)` (line 1409) to `trackWager(wagerAmount * maxPlayers)` for accurate telemetry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N-player escrow creation | Custom PDA logic | `createMatchEscrow(matchId, wager, wallets[])` | Already N-player capable |
| Deposit bitmap check | Manual index math | `getEscrowState()` returns `depositsMask` | Bitmask already computed |
| Start-with-depositors | Custom on-chain IX | `startWithDepositorsEscrow(matchId)` | Already implemented in Phase 21 |
| Cancel with refunds | Custom lamport logic | `cancelMatchEscrow(matchId, wallets[])` | Handles remainingAccounts |
| Decision timer | Nested setTimeout | Reuse `depositTimers[roomId]` slot | Consistent with existing timer pattern |

## Common Pitfalls

### Pitfall 1: Deposit Timer Slot Reuse

**What goes wrong:** The deposit timer (5 min) fires, then you start a 30s decision timer. Both must share the `depositTimers[roomId]` slot — if you store the decision timer in a new variable, you lose the ability to `clearTimeout` it from `escrowCancelAll` and `escrowPartialStart` handlers.

**How to avoid:** After the 5-min timer fires, immediately assign the new 30s timer to `depositTimers[roomId] = setTimeout(...)`. Both handlers (`escrowPartialStart`, `escrowCancelAll`) already check `depositTimers[client.roomId]` — they'll clear the decision timer correctly.

### Pitfall 2: cancelMatchEscrow Player Address Order

**What goes wrong:** `cancelMatchEscrow` takes deposited-player addresses in **player-index order** (matching the on-chain `players[]` array). Passing them in socket confirmation order will misroute refunds.

**How to avoid:** Build the array from `room.players` order, filtering to only deposited:
```js
const depositorWallets = room.players
    .filter(p => ws.deposits?.[p.socketId])
    .map(p => ws.wallets[p.socketId])
    .filter(Boolean);
```

### Pitfall 3: Ejected Players Still in Socket.IO Room

**What goes wrong:** When kicking non-depositors in `escrowPartialStart`, the server removes them from `room.players` but Socket.IO still has them in the room channel. They'll receive subsequent `io.sockets.in(roomId).emit(...)` events.

**How to avoid:** Call `kickedSocket.leave(client.roomId)` before compacting `room.players`. Also set `kickedSocket.roomId = null`.

### Pitfall 4: failedSettlements Store is 2-Player Only

**What goes wrong:** `handleSettlementFailure` at line 136 reads `p1wallet = ws?.wallets?.[p1socketId]` and `p2wallet = ws?.wallets?.[p2socketId]` using only players[0] and players[1]. The retry loop at line 120 only passes `[data.p1wallet, data.p2wallet]` to `cancelMatchEscrow`.

**Phase scope decision:** DEBT-01/DEBT-02 are in scope, but `handleSettlementFailure` N-player fix is **not listed in requirements**. However, the forfeit path (line 120) is the recovery mechanism and will break for N-player matches. Recommend flagging this as a known limitation or adding it as part of DEBT-01.

**How to mitigate in-scope:** Store `allWallets` instead of `p1wallet`/`p2wallet` in the `failedSettlements` entry. But this requires modifying `handleSettlementFailure` — a small change worth making to avoid silent settlement failures.

### Pitfall 5: SHOT Milestone Forfeit Path is Also 2-Player

**What goes wrong:** Lines 482–508 (forfeit path inside `startTurnTimer`) calls `recordMatchPlayed` for only `hostWalletF`/`playerWalletF`. For 3-4 player games this misses players[2] and players[3].

**How to avoid:** Apply the same N-player loop fix to the forfeit path as to the main match-end path.

### Pitfall 6: playAgain + Escrow — Room Not Reset Cleanly

**What goes wrong:** `resetForPlayAgain` clears `wagerStates[roomId]` entirely (`delete wagerStates[roomId]`). But playAgain should preserve the wager amount for the new escrow round. The wager amount and wallets need to be re-established.

**Context decision says:** "Reuse room, new deposit round." So the room keeps its `wager` field and `room.players` wallets are already in `authenticatedWallets`. But `wagerStates[roomId]` is deleted, so wallet lookup fails in the new escrow creation.

**How to avoid:** In `resetForPlayAgain`, instead of `delete wagerStates[roomId]`, preserve the wager amount and wallets while clearing deposit state:
```js
if (wagerStates[roomId]) {
    wagerStates[roomId].deposits = {};
    delete wagerStates[roomId].firstDepositorSocketId;
    // Retain: amount, wallets
} else {
    wagerStates[roomId] = { amount: room.wager || 0, wallets: {} };
}
```

Then trigger a new escrow creation cycle (create PDA, build deposit TXs, emit `escrowDeposit`) from within or immediately after `resetForPlayAgain`.

### Pitfall 7: DEPOSIT_TIMEOUT_MS is 2 Minutes, Not 5 Minutes

**What goes wrong:** Current constant is `DEPOSIT_TIMEOUT_MS = 120_000` (2 min). SRV-12 requires **5 minutes (300,000ms)**.

**How to avoid:** Change to `const DEPOSIT_TIMEOUT_MS = 300_000`.

### Pitfall 8: escrowDepositStatus — First Depositor Identity Exposure

**What goes wrong:** Emitting wallet addresses in `escrowDepositStatus` to all room members leaks wallet identities that clients may not know yet.

**How to avoid:** Emit wallet addresses only if they are already disclosed (all players in a wagered room already know each others' wallet from the lobby). This is acceptable given the existing wager flow. No special handling needed.

### Pitfall 9: joinQueue Path Also Has 2-Player Escrow Code

**What goes wrong:** The `joinQueue` handler (lines 1549–1595) has its own copy of the escrow creation block, also hardcoded to 2 players. Queue-matched rooms are always 2-player (`queueMaxPlayers = 2`), so functionally this is still correct — but the deposit timeout block at lines 1576–1577 hardcodes `wsCheck.wallets[roomCheck.players[0]?.socketId]` and `players[1]`. This is safe for 2-player but inconsistent.

**Recommendation:** Update joinQueue's timeout block to use the same N-player wallet array pattern for consistency and future-proofing. Low priority since queue is always 2-player.

### Pitfall 10: escrowDepositConfirm — On-Chain Verification Uses Bitmask Index

**What goes wrong:** Current code checks `escrowState.playerOneDeposited` (backward-compat shim for bit 0) and `escrowState.playerTwoDeposited` (bit 1). For players[2] (bit 2) and players[3] (bit 3), there are no backward-compat shims — must use `depositsMask` directly.

**How to avoid:**
```js
const playerIndex = room.players.findIndex(p => p.socketId === client.id);
const deposited = playerIndex >= 0 && (escrowState.depositsMask & (1 << playerIndex)) !== 0;
```

## Code Examples

### escrowDepositStatus Event Shape

Simplest structure for the client (wallet+status map), as the context says "Claude's discretion":

```js
// Emitted after each confirmed deposit
io.sockets.in(rid).emit('escrowDepositStatus', {
    roomId: rid,
    deposits: room.players.map(p => ({
        socketId: p.socketId,
        wallet: ws.wallets[p.socketId] || null,
        confirmed: !!(ws.deposits?.[p.socketId]),
    })),
    numDeposited: Object.keys(ws.deposits || {}).length,
    totalPlayers: room.players.length,
});
```

This gives clients everything needed to render a "2/4 confirmed" UI with per-player checkmarks.

### Deposit Failure Handling (Claude's Discretion)

Context allows either notify-to-retry or auto-retry-once. **Recommendation:** Notify to retry. Rationale: auto-retry requires storing the player's serialized TX, which was already consumed. The client must re-sign anyway. Emit a targeted error with retry guidance:

```js
client.emit('escrowDepositFailed', {
    roomId: rid,
    reason: 'Deposit not confirmed on-chain — please try again',
    canRetry: true,
});
```

The client's existing `escrowError` handler likely displays an error message. A separate `escrowDepositFailed` event gives the client distinct semantics (retry vs fatal error).

### Timer Start (Claude's Discretion)

**Recommendation:** Start the 5-minute deposit timer **on room-full** (same moment as escrow creation), not after escrow TX confirms. Rationale:
1. Escrow TX confirmation is fast (1–2 seconds on devnet) — the difference is negligible
2. Starting after confirm introduces complexity (where to store the timer setup continuation)
3. The current code already starts the timer immediately after the `createMatchEscrow` call completes — this is the correct pattern to preserve

### Disconnect During Deposit Window (Claude's Discretion)

**Recommendation:** Treat disconnected player as non-depositor. Rationale:
- The 30s reconnect window exists only for active BATTLE/WEAPON_SHOP states
- During deposit phase `ms.status` is LOBBY, so reconnect window does NOT apply
- A disconnected player during deposit simply doesn't get to sign the TX
- When the 5-min timer fires, their slot is empty in `ws.deposits`
- They count as a non-depositor in the partial-deposit flow

No special handling needed. The existing disconnect path (`cleanupRoom` at line 918) runs for LOBBY state, removing the player from `room.players` and broadcasting `opponentLeft`. This naturally reduces the depositor count. The timeout handler should recheck `findRoom(roomId)` freshly to get the current player list.

## State of the Art

| Old Approach (current Phase 22 target) | New Approach (this phase) | Impact |
|----------------------------------------|--------------------------|--------|
| `DEPOSIT_TIMEOUT_MS = 120_000` (2 min) | 300_000 (5 min) per SRV-12 | Gives players more time |
| Hardcoded 2-player wallet array | Loop over `room.players` | Supports 3-4 player escrow |
| Timeout → immediate cancel+destroy room | Timeout → partial decision flow | Host can rescue partial match |
| `createMatchState(roomId, paRoundType)` | `createMatchState(roomId, paRoundType, room.players.length)` | Preserves N-player match format on rematch |
| SHOT milestone: only hostId + playerId | Loop over `room.players` | All N players earn milestones |
| Wager guard blocks 3-4 player wagered rooms | Guard removed | 3-4 player wagered matches enabled |

## Open Questions

1. **playAgain + new escrow round sequencing**
   - What we know: `resetForPlayAgain` emits `playAgain` event to clients; clients return to lobby UI
   - What's unclear: Should the new escrow creation happen immediately after reset, or wait for an explicit client event?
   - Recommendation: Trigger immediately after reset inside `resetForPlayAgain` (or right after the call). Clients transition to deposit flow without re-selecting mode. The room's wager amount is already set. This mirrors how the initial joinRoom flow works — escrow created as soon as room fills.

2. **N-player matchEnd payload — prestige/milestones for players[2] and players[3]**
   - What we know: lines 2515–2523 build `prestigeInfo` and `earnedMilestones` keyed by `hostId`/`playerId` only
   - What's unclear: Does the client currently read these by socket ID, or by role (host/player)?
   - Finding: `matchEndPayload.prestigeInfo[hostId]` — keyed by socketId (not role). Client reads by own socket ID, so extending to all N players is backward-compatible.
   - Recommendation: Loop over all `room.players` to build both maps.

3. **failedSettlements — N-player wallets**
   - What we know: `failedSettlements` stores only `p1wallet` + `p2wallet`; retry passes those 2 only
   - What's unclear: Whether fixing this is in Phase 22 scope (not listed in SRV/DEBT requirements)
   - Recommendation: Fix it opportunistically — change store shape to `allWallets: []` and update the retry loop. Small change, prevents silent settlement failures for N-player matches.

## Sources

### Primary (HIGH confidence)
- Direct inspection: `server/socket-io/main.js` lines 1–2923 — all current patterns verified
- Direct inspection: `server/services/escrow.js` — all N-player service API signatures verified
- Direct inspection: `server/services/solana.js` — re-exports and helper signatures verified
- Direct inspection: `server/services/shot-token.js` — `recordMatchPlayed` signature and fields verified
- Direct inspection: `22-CONTEXT.md` — all implementation decisions locked

### Secondary (MEDIUM confidence)
- Socket.IO broadcast patterns (`io.sockets.in(room).emit`, `io.to(socketId).emit`) — consistent throughout main.js, HIGH confidence in practice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing patterns verified from source
- Architecture: HIGH — all change sites identified with exact line numbers and current logic
- Pitfalls: HIGH — all identified from direct code inspection, not speculation
- Discretionary decisions: MEDIUM — based on context decisions + code patterns, but untested

**Research date:** 2026-02-28
**Valid until:** Until main.js is edited — line numbers will shift, search by function/comment anchor
