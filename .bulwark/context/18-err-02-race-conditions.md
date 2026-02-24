# ERR-02: Race Conditions & Concurrency

**task_id:** ERR-02
**auditor:** Dinh's Bulwark — ERR-02
**date:** 2026-02-23
**scope:** `server/socket-io/main.js`, `server/middleware/guards.js`, `server/services/escrow.js`, `server/services/solana.js`, `server/services/shot-token.js`
**severity_range:** CRITICAL → LOW

---

## CONDENSED SUMMARY

JavaScript's single-threaded event loop provides _within-tick_ atomicity, but all async handlers in this codebase yield to the event loop on every `await`. Eight in-memory state stores (`rooms`, `matchStates`, `goldStates`, `weaponInventories`, `shopReady`, `wagerStates`, `authenticatedWallets`, `matchmakingQueues`) are shared across all socket event handlers and are mutated freely without synchronization between their reads and writes. The `withLock()` mutex in `guards.js` is the only concurrency protection present, and it is applied to _settlement only_ — leaving at least 14 distinct async mutation sequences unprotected.

**Three exploitable financial races are present:**

1. **Double-settlement (partially mitigated):** `withLock` on `settle:<roomId>` prevents a second `fire` handler from calling `settleMatch()` while the first is awaiting the RPC. However, a concurrent `disconnect` event fired before the lock is acquired can bypass the state check and attempt a second settlement path — the TOCTOU window between `transitionState(ms, MATCH_STATES.SETTLING)` and `await withLock(...)` is real.

2. **Deposit-confirmation double-escrowActive:** Two concurrent `escrowDepositConfirm` events from the same or different players share a single `ws.deposits` object with no lock. Both handlers can read `!ws.deposits` as falsy simultaneously, write their entry, and both find `hostDeposited && playerDeposited` true — emitting `escrowActive` twice. Each emission is harmless in itself, but the `depositTimers` cancel-path is also exposed to the same race (both can find the timer exists and clear it, or neither clears it).

3. **Prestige-burn double-unlock:** `verifyBurnTransaction()` and `prestigeBurn()` are called sequentially without a per-wallet lock. Two concurrent `prestigeBurn` socket events for the same wallet will both pass the `verifiedBurnTxs.has(txSignature)` check (because neither has added the signature yet), both return `valid: true`, and both call `prestigeBurn(wallet)`, deducting the burn cost twice and advancing the tier twice in a single call chain.

**Additional unprotected races** exist in room join (capacity overflow), matchmaking self-pairing, reconnect state migration, terrain generation, turn-timer lifecycle, SHOT milestone emission, and the `failedSettlements` recovery loop.

---

## FULL ANALYSIS

### 1. Concurrency Model

Node.js is single-threaded but not single-concurrent. The event loop processes one microtask/callback at a time. Every `await` is a suspension point — another socket event handler can run between `await` statements within the same logical operation. Because Socket.IO fires registered handlers as regular callbacks, two handlers for the same event from different sockets (or even the same socket via rapid fire) can be interleaved at any `await` boundary.

The codebase has 8 module-level mutable state stores:

| Store | Type | Purpose |
|-------|------|---------|
| `rooms` | `Map<roomId, room>` | Room objects — host/player/pos/terrain/escrowPDA |
| `matchStates` | `{}` | Per-room game state machine |
| `goldStates` | `{}` | Per-room gold balances |
| `weaponInventories` | `{}` | Per-room weapon inventories |
| `shopReady` | `{}` | Per-room shop-done flags |
| `wagerStates` | `{}` | Per-room wager amount + wallet map |
| `authenticatedWallets` | `{}` | socketId → walletAddress |
| `matchmakingQueues` | `Map` | Active queue entries per mode/format |
| `disconnectTimers` | `{}` | Pending reconnect timers |
| `pendingReconnects` | `{}` | Pending reconnect info by wallet |
| `turnTimers` | `{}` | Per-room turn countdown timers |
| `depositTimers` | `{}` | Per-room deposit countdown timers |
| `failedSettlements` | `Map` | Failed settlement retry queue |
| `verifiedBurnTxs` | `Set` | Replay protection for burn signatures |

---

### 2. withLock Implementation Analysis

`withLock` in `guards.js` (lines 120–148) is a correct async mutex:

```js
while (locks.has(key)) {
    await locks.get(key);   // suspend until lock released
}
let resolve;
const promise = new Promise((r) => { resolve = r; });
locks.set(key, promise);
// ... run fn() ... finally { locks.delete(key); resolve(); }
```

**Correctness:** The `while` loop (not `if`) correctly handles the case where multiple waiters are queued — each waiter re-checks after waking to ensure the lock is free before taking it. The 30-second auto-release prevents permanent deadlock on RPC timeouts.

**Limitation:** The lock is keyed by an arbitrary string. Callers must use the same key for the same resource. Currently only two call sites exist:

- `cleanupRoom()` (disconnect/leave): `withLock('settle:${roomId}', ...)`
- `fire` handler (match end): `withLock('settle:${this.roomId}', ...)`

**Missing lock sites (see matrix below).**

---

### 3. Concurrency Protection Matrix

| Operation | Location | Lock Used | Protected? | Exploit Scenario |
|-----------|----------|-----------|------------|-----------------|
| Settlement on match end (fire) | `main.js:2085` | `withLock('settle:${roomId}')` | PARTIAL | TOCTOU: `transitionState→SETTLING` at line 2081 happens OUTSIDE lock; see RC-01 |
| Settlement on disconnect/leave | `main.js:579` | `withLock('settle:${roomId}')` | PARTIAL | Same TOCTOU as above; also race vs. turn-timer forfeit; see RC-01 |
| Settlement on turn-timer forfeit | `main.js:341` | NONE | NO | `startTurnTimer` callback is module-level, bypasses cleanupRoom lock; see RC-02 |
| Deposit confirmation (escrowDepositConfirm) | `main.js:1782` | NONE | NO | Two concurrent confirms race on `ws.deposits`; see RC-03 |
| Deposit timeout (depositTimers callback) | `main.js:1059` | NONE | NO | Races with successful deposit confirmation; see RC-04 |
| Room join capacity check | `main.js:962` | NONE | NO | `room.active` read+write not atomic across two concurrent joins; see RC-05 |
| Matchmaking queue pairing | `main.js:1242` | NONE | NO | `queue.length > 0` check then `queue.shift()` not atomic; see RC-06 |
| Reconnect state migration | `main.js:839` | NONE | NO | Two rapid reconnects from same wallet can duplicate state; see RC-07 |
| Terrain generation (requestTerrain) | `main.js:2286` | NONE | NO | Two concurrent requests before cache set both generate terrain; see RC-08 |
| Shop phase start (ready handler) | `main.js:1420` | NONE | NO | Two ready events processed concurrently both trigger endShopPhase; see RC-09 |
| SHOT milestone claim (recordMatchPlayed) | `shot-token.js:272` | NONE | NO | Concurrent calls for same wallet both pass `claimedMatchIds.has(matchId)` check; see RC-10 |
| Prestige burn (prestigeBurn) | `shot-token.js:358` | NONE | NO | Concurrent burns both pass `verifiedBurnTxs.has()` check; see RC-11 |
| failedSettlements recovery loop | `main.js:82` | NONE | NO | 60s interval races with active settlement for same matchId; see RC-12 |
| Gold earn/spend (buyWeapon) | `main.js:1525` | NONE | SAFE* | Single-threaded within event; but see RC-09 |
| authenticatedWallets write (authenticate) | `main.js:541` | NONE | SAFE* | No await before write; safe within single tick |

*SAFE* = no `await` between read and write; race window does not exist in single-threaded JS.

---

### 4. Detailed Race Condition Analysis

#### RC-01: Settlement TOCTOU — fire handler vs. disconnect (CRITICAL)

**Location:** `main.js:2079–2085` (fire handler) and `main.js:566–685` (cleanupRoom)

The fire handler does:
```js
// Line 2081 — OUTSIDE lock
const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
if (!transitioned) return

// Line 2085 — INSIDE lock
await withLock(`settle:${this.roomId}`, async () => {
    if (ms.status !== MATCH_STATES.SETTLING) return   // re-check
    // ... settleMatch() ...
})
```

The `cleanupRoom` function (called on disconnect) does:
```js
// Line 579 — INSIDE lock, but checks SETTLING AFTER entering
await withLock(`settle:${roomId}`, async () => {
    const currentMs = matchStates[roomId]
    if (!currentMs || currentMs.status === MATCH_STATES.SETTLING || currentMs.status === MATCH_STATES.COMPLETE) return
    transitionState(currentMs, MATCH_STATES.SETTLING)
    // ... settleMatch() ...
})
```

**Race window:** Between line 2081 (`transitionState→SETTLING`) and line 2085 (`withLock` acquisition), the event loop can yield to a disconnect event. The disconnect handler calls `cleanupRoom`, which acquires the lock, checks `ms.status === MATCH_STATES.SETTLING`, returns early (correct behavior), and exits. But if the order is reversed — disconnect fires and transitions to SETTLING first (inside its lock), and then the fire handler checks `!transitioned` at line 2082 and returns — no settlement happens at all for a match that ended legitimately.

**More dangerous scenario:** The turn-timer forfeit at `startTurnTimer` (lines 289–423) calls `settleMatch()` directly WITHOUT `withLock()`. If a `fire` event arrives at the exact moment the turn timer fires (both are in the event queue), both can proceed to `settleMatch()` independently.

**Impact:** Double-settlement of on-chain escrow is mitigated by the Anchor program (the second call will fail on-chain since escrow state is already settled). However, the off-chain match state and DB records will be corrupted. In dev mode (no escrow), double-settlement would result in logged double-payouts.

**Severity:** HIGH (mitigated by on-chain atomicity in production, exploitable in dev/test)

---

#### RC-02: Turn-Timer Forfeit Has No Settlement Lock (HIGH)

**Location:** `main.js:341` (`startTurnTimer` callback, module-level)

The turn timer fires asynchronously outside the socket handler closure. When it triggers a match-ending forfeit:

```js
// Line 341 — no lock
const result = await settleMatch(winnerWallet, loserWallet, wsState.amount, roomId)
```

This path does not use `withLock`. If a `fire` event is processed at the same time (e.g., both players' events queued simultaneously), the fire handler uses `withLock('settle:${roomId}')` but the timer callback does not. The two settlement calls will be concurrent at the `await settleMatch()` level.

**Additional issue:** The timer callback reads `ms.currentTurn` and `room` from closed-over variables captured at timer creation. If `rejoinRoom` has executed in the interim and remapped socket IDs, `ms.currentTurn` may point to the old socket ID. The timer will forfeit the wrong player.

**Severity:** HIGH

---

#### RC-03: Deposit Confirmation Race — Double `escrowActive` Emit (MEDIUM)

**Location:** `main.js:1782–1803` (`escrowDepositConfirm` handler)

```js
if (!ws.deposits) ws.deposits = {}
ws.deposits[client.id] = txSignature          // Line 1783

const hostDeposited = ws.deposits[room.host?.socketId]    // Line 1785
const playerDeposited = ws.deposits[room.player?.socketId] // Line 1786

if (hostDeposited && playerDeposited) {
    // Clear timer, emit escrowActive
}
```

Two concurrent `escrowDepositConfirm` events (host and player confirming within the same event loop cycle after their respective `getEscrowState()` awaits complete) will both enter this block at approximately the same time. If both complete their `getEscrowState()` RPC calls within the same Node.js tick window, both will:
1. Write their own signature to `ws.deposits`
2. Both find the other's signature already present
3. Both emit `escrowActive`
4. Both attempt to `clearTimeout(depositTimers[rid])` — the second call deletes an already-deleted key (benign)

**Impact:** `escrowActive` is emitted twice. The client room handler likely handles this idempotently, but any state machine that listens for this event and transitions on it will double-transition. If the client has a one-shot state transition on `escrowActive`, the second emission is a no-op; but if it triggers UI state or financial logic, this is a bug.

**Severity:** MEDIUM

---

#### RC-04: Deposit Timeout vs. Late Confirmation Race (MEDIUM)

**Location:** `main.js:1059–1082` (deposit timer callback)

The deposit timer fires and calls `removeRoom()` if not both players have confirmed. The check is:

```js
const hostDep = wsCheck.deposits && wsCheck.deposits[roomCheck.host?.socketId]
const playerDep = wsCheck.deposits && wsCheck.deposits[roomCheck.player?.socketId]
if (hostDep && playerDep) return  // Both confirmed — bail out
```

Race: If the second player's `escrowDepositConfirm` handler is mid-execution (past the `getEscrowState()` await but not yet written to `ws.deposits`) exactly when the timer fires, the timer will see only one deposit, cancel the escrow, and call `removeRoom()`. The second player's handler will then write to `ws.deposits` of a now-deleted room object (the object reference is stale; `wagerStates[rid]` is already deleted). The `escrowActive` emit will then reference a dead room.

**Impact:** Valid wagered match gets cancelled; on-chain escrow gets cancelled while a player has already deposited. The player who confirmed second loses their deposit window with no recourse (unless the Anchor `permissionlessReclaim` path covers this, which it does after 48h).

**Severity:** MEDIUM

---

#### RC-05: Room Join Capacity Overflow (MEDIUM)

**Location:** `main.js:962–1012` (`joinRoom` handler)

```js
var room = findRoom(roomId)
if (!room || room.active === true) return   // Line 962 — read active

// ... await verifyBalance() ...            // Line 982 — YIELD POINT

room.player = { ... }
room.active = true                          // Line 1013 — write active
```

Two players can join the same room concurrently. Both read `room.active === false` before either sets it to `true`. Both pass the check, both await `verifyBalance()`, and both proceed to set `room.player`. The second write overwrites the first. The first player is silently dropped from the room object (their socket has `client.roomId = roomId` set, but `room.player` now points to the second player).

**Impact:** Room ends up with two sockets both believing they are `room.player` for the same room, but only one is in `room.player`. The overwritten player receives game events but their socket ID is not in the room object — they cannot fire, their damage will not be tracked, and disconnecting them will leave the opponent in a broken match.

**Severity:** MEDIUM

---

#### RC-06: Matchmaking Queue Self-Pairing / Double-Consume (MEDIUM)

**Location:** `main.js:1242–1389` (`joinQueue` handler)

```js
const queue = matchmakingQueues.get(queueKey);

if (queue.length > 0) {
    const opponent = queue[0];                   // peek
    if (opponent.wager !== wagerAmount) {
        queue.push({ ... });                     // push joiner to queue
        return;
    }
    queue.shift();                               // consume opponent
```

Two players with matching wagers can send `joinQueue` simultaneously. Both arrive at `queue.length > 0` check — but the queue has exactly one entry (the first player who queued). Both see `queue.length === 1`, both peek `queue[0]` (same entry), both validate the wager, and both call `queue.shift()`. The first shift removes the entry; the second shift returns `undefined`. But at this point, both handlers proceed to create a room and pair:

- Handler A pairs itself with the queued player (correct)
- Handler B tries to pair itself with `undefined` opponent — `opponentSocket` lookup returns undefined, `opponent.socketId` is undefined

This leads to a corrupted room creation (host entry with `undefined.socketId`). No crash occurs because the `if (opponentSocket)` guards swallow the undefined, but the room is created with a broken host entry and a valid player entry — a 1-player room in `room.active = true` state that will never complete.

**Additional issue:** A player cannot match themselves only because both socket events arrive from different socket IDs. However, if a player sends two rapid `joinQueue` events for the same mode before the first is processed (e.g., due to client retry), they can pair with themselves: both events arrive, the first adds the player to the queue, the second finds the first entry (itself), validates the wager, shifts it, and creates a room with both sides pointing to the same socket. The `removeFromAllQueues(client.id)` at line 1234 prevents one instance of this by removing existing queue entries, but within a single event loop tick where two events from the same socket are queued, both handlers run before either `removeFromAllQueues` executes.

**Severity:** MEDIUM

---

#### RC-07: Disconnect/Reconnect State Migration Race (MEDIUM)

**Location:** `main.js:776–924` (`rejoinRoom` handler)

The reconnect flow migrates state from `oldSocketId` to `client.id` (new socket) across 6 separate state stores: `wagerStates`, `goldStates`, `weaponInventories`, `matchStates.scores`, `.kills`, `.roundWins`, `.hp`, `.currentTurn`, and `room.host.socketId` / `room.player.socketId`.

This migration is not atomic. If the same wallet triggers a second reconnect before the first migration completes (rapid disconnect + reconnect + reconnect), the sequence is:

1. First rejoin: reads `pending = pendingReconnects[wallet]`, clears timer, deletes pending entry
2. Starts migrating — e.g., migrates `wagerStates` (oldSocketId → socket1.id)
3. Second rejoin (different new socket) arrives: `pendingReconnects[wallet]` is already deleted → returns `rejoinError`

This is safe in the normal case. However, if the server is under load and the first reconnect handler yields mid-migration (e.g., on a `client.join(roomId)` I/O operation), and the old socket's cleanup timer fires concurrently (because the disconnect timer was not cleared fast enough), `cleanupRoom` will destroy the room state that the reconnect is in the middle of migrating.

**Specific window:** `disconnectTimers[walletAddress]` is cleared at line 822 AFTER `pendingReconnects[walletAddress]` is read at line 805. Between these two lines, if the timer fires (30s has elapsed since disconnect), it will call `cleanupRoom(fakeClient, io, 'reconnect_timeout')`, which calls `removeRoom()`, deleting all state stores for the room. The reconnect handler continues and writes to deleted objects (the JS object references are stale but still accessible), and emits `rejoinSuccess` to a client that has a room that no longer exists on the server.

**Severity:** MEDIUM

---

#### RC-08: Terrain Generation Double-Generate (LOW)

**Location:** `main.js:2278–2344` (`requestTerrain` handler)

```js
if (room._terrainCache) {
    client.emit('terrainGenerated', room._terrainCache)
    return
}
// ... generate terrain ...        // synchronous
room._terrainCache = terrainPayload  // Line 2340
io.sockets.in(client.roomId).emit('terrainGenerated', terrainPayload)
```

The terrain generation itself is synchronous (`generateTerrain()`, `generateTankPositions()`, `generateWind()` — no awaits). However, `requestTerrain` does call `startTurnTimer(io, client.roomId)` which sets `turnTimers[roomId]`. If both players emit `requestTerrain` simultaneously, both handlers execute. Both find `room._terrainCache` as falsy (it is not set until after generation). Both generate new terrain with independent seeds. The first to complete sets `room._terrainCache`; the second overwrites it. Both broadcasts emit their respective (different) terrain to both clients.

The two clients receive two different `terrainGenerated` events. The second one wins (overwrites the first in client state). But the server has applied the second player's terrain to `room.heightmap`, `room.host.pos`, and `room.player.pos` — consistent with what the second-to-execute broadcast emits. However, the first broadcast has already updated the clients to terrain version 1. Clients will be desynchronized from the server on `room.host.pos` and `room.player.pos`.

**Impact:** Tank positions are mismatched between server and clients. Fire trajectory calculations will be wrong. **This is a gameplay integrity issue** (the server's physics uses different tank positions than the client displays). In wagered matches, this can affect settlement correctness.

**Severity:** MEDIUM (gameplay integrity)

---

#### RC-09: Shop Phase Double-Start Race (LOW)

**Location:** `main.js:1420–1481` (`ready` handler)

```js
if (room.host.isReady && room.player && room.player.isReady) {
    // ... start shop phase ...
    if (shopTimers[client.roomId]) clearTimeout(shopTimers[client.roomId])
    shopTimers[client.roomId] = setTimeout(() => endShopPhase(...), SHOP_DURATION * 1000)
```

Both `ready` events from host and player arrive nearly simultaneously. Both handlers set the `isReady` flag for their respective player and then check the combined condition. There is no `await` between setting `isReady` and reading both flags, so this is actually safe within a single event loop tick — JS atomicity guarantees that the first handler to run will set one flag, check both, find only one true, and return. The second handler sets the other flag, checks both, finds both true, and starts the shop.

**Edge case:** If the match state is `ROUND_END` and both players send `ready` concurrently, both handlers can pass `validateAction(msReady.status, 'ready')` (which is valid in ROUND_END). Both will reach the combined check. Due to JS atomicity of the flag read+write within a single tick, only one handler will actually see both flags true. However, if `endShopPhase` is in progress from a previous timer firing (the SHOP_DURATION timer fires while both ready events are pending), the transition check inside `endShopPhase`:

```js
if (ms.status !== MATCH_STATES.WEAPON_SHOP) return
```

...prevents double-execution. **This race is largely safe** due to the state machine guard.

**Severity:** LOW

---

#### RC-10: SHOT Milestone Double-Claim (HIGH)

**Location:** `shot-token.js:272–340` (`recordMatchPlayed`)

```js
if (matchId && state.claimedMatchIds && state.claimedMatchIds.has(matchId)) {
    return { earned: 0, ... };   // dedup check
}
// ... check milestones ...
state.claimedMatchIds.add(matchId);   // add AFTER milestones checked
```

`recordMatchPlayed` is synchronous (no `await`). Within a single call, it is safe. However, it is called twice per match end (once for each player's wallet):

```js
// main.js:2163–2186 — called sequentially, safe
if (hostWallet) {
    shotResults[hostId] = recordMatchPlayed(hostWallet, { matchId, ... })
}
if (playerWallet) {
    shotResults[playerId] = recordMatchPlayed(playerWallet, { matchId, ... })
}
```

The same `matchId` is used for both calls (`const matchId = '${this.roomId}:${ms.currentRound}:${Date.now()}'`). Since the two calls use DIFFERENT wallet addresses, they operate on different `playerShotState[wallet]` entries. Each player's `claimedMatchIds` is independent. This is safe.

**However**, a separate race exists: if `settleMatch()` fails and `handleSettlementFailure()` is called, the code continues to `recordMatchPlayed` for both players. If the 60-second retry interval in `failedSettlements` then triggers a cancel (refund) for the same match, the match has already been recorded as played and milestones already claimed — but the players will be refunded rather than having their wager settled as a win/loss. The milestone `first_wagered_match` may be incorrectly claimed for a match that was subsequently cancelled.

**Additional concern:** The `matchId` is generated as `${roomId}:${ms.currentRound}:${Date.now()}`. `Date.now()` at millisecond resolution is not guaranteed to be unique under load. If two match-end events for the same room (impossible in normal play, but possible via the RC-01 double-settlement race) occur within the same millisecond, they share a `matchId`, and the second `recordMatchPlayed` call for any wallet will be deduplicated (correct behavior, but it means one player's milestones are not recorded).

**Severity:** MEDIUM

---

#### RC-11: Prestige Burn Concurrent Double-Unlock (CRITICAL)

**Location:** `main.js:1611–1645` (`prestigeBurn` handler) and `shot-token.js:457–558` (`verifyBurnTransaction`)

The `prestigeBurn` socket handler:

```js
client.on('prestigeBurn', async (data) => {
    // ...
    const verification = await verifyBurnTransaction(txSignature, wallet, burnAmount)
    //                          ^^^ ASYNC — yields here for RPC call (100-2000ms)

    if (!verification.valid) { ... return }

    const result = prestigeBurn(wallet)     // synchronous state mutation
```

Two concurrent `prestigeBurn` events for the same wallet (or a single event processed twice due to client retry) will both reach `await verifyBurnTransaction()`. Both suspend. Both RPC calls return. Both receive `valid: true` (neither has added the signature to `verifiedBurnTxs` yet). Both proceed to `prestigeBurn(wallet)`, which:

1. Reads `state.balance` — both see the original balance
2. Deducts `nextTier.burnCost` from `state.balance` — first write: balance - cost; second write: (balance - cost) - cost
3. Increments `state.prestigeTier` — first: tier+1; second: tier+2 (skips a tier)

**If the same `txSignature` is used for both (client retry scenario):** The replay protection `verifiedBurnTxs.add(txSignature)` is called inside `verifyBurnTransaction()` AFTER the RPC fetch and BEFORE returning — but only the first call adds it (the second call reaches `verifiedBurnTxs.has()` before the first call's `add()` executes, because both are interleaved at the `await` boundary). Both return valid.

**Verification of the exploit:** The `verifiedBurnTxs.add(txSignature)` call is at `shot-token.js:549`. The check `verifiedBurnTxs.has(txSignature)` is at line 465. Between line 465 (check) and line 549 (add), there is an `await connection.getParsedTransaction(...)` at line 471. Two concurrent calls for the same signature both pass the check at 465, both await the RPC, and both reach 549 — the first to complete adds the signature; the second also adds it (Set.add is idempotent, no error). Both return `{ valid: true }`. Both proceed to `prestigeBurn()`.

**Impact:** Player burns enough SHOT for one tier upgrade but unlocks two tiers. If `state.balance` drops below zero: `state.balance = originalBalance - cost - cost`. If `originalBalance < 2*cost`, balance goes negative. Negative balance is never validated in `prestigeBurn()` (it only checks `state.balance < nextTier.burnCost` for the NEXT tier, not that balance would go negative after deduction). Subsequent checks would fail legitimately, but the player has an extra prestige tier with potentially negative SHOT balance.

**Severity:** CRITICAL

---

#### RC-12: failedSettlements Recovery Races Active Settlement (MEDIUM)

**Location:** `main.js:82–104` (60s interval) and `main.js:2085` (settlement lock path)

The recovery interval:
```js
setInterval(async () => {
    for (const [matchId, data] of failedSettlements.entries()) {
        // ...
        await cancelMatchEscrow(matchId, data.p1wallet, data.p2wallet)
        failedSettlements.delete(matchId)
    }
}, 60_000);
```

This interval runs regardless of whether an active game is in progress for the same `matchId`. If `handleSettlementFailure()` stores a `roomId` in `failedSettlements` during an active `withLock` block (e.g., the RPC timed out but the on-chain TX was broadcast), the 60-second timer may fire while the original settlement is still being retried by the application layer.

More critically: `failedSettlements` uses `matchId` as the key (which is `roomId`), but `rooms.get(roomId)` may still return a live room for a different match (if a new match was created with the same room code — a 4-hex room code has only 65536 possibilities). A recovery cancel for old match data could cancel an in-progress escrow for a live new match.

**Also:** The `cancelMatchEscrow` call in the recovery loop is not protected by `withLock`. If the primary settlement retry (via the socket handler's `withLock` block) and the interval recovery attempt run concurrently for the same match, both call `cancelMatchEscrow` simultaneously. The Anchor program will fail the second call (already cancelled), but both handlers will log/track independently.

**Severity:** MEDIUM

---

#### RC-13: `deleteRoom` During Settlement (LOW — partially mitigated)

**Location:** `main.js:927–951` (`deleteRoom` handler)

```js
const ms = matchStates[client.roomId]
if (ms && ms.status === MATCH_STATES.SETTLING) {
    client.emit('deleteRoomError', { reason: 'Cannot delete room during settlement' })
    return
}
```

The guard checks `MATCH_STATES.SETTLING`. However, between this read and the subsequent `await removeRoom()`, a settlement could transition the state. The `deleteRoom` handler does not use `withLock`. A host can:

1. Trigger match end (settlement starts, transitions to SETTLING)
2. Immediately send `deleteRoom`
3. `deleteRoom` reads state (still BATTLE due to tick timing), proceeds to `removeRoom()`
4. `removeRoom()` deletes `wagerStates[roomId]` while settlement is awaiting RPC

`removeRoom()` deletes `wagerStates[roomId]` at line 220. The settlement lock block re-reads `wagerStates[this.roomId]` at line 2091 — it will be `undefined`. No settlement is executed. Funds remain locked in escrow (rescued by 48h timeout).

**Severity:** LOW (on-chain escrow prevents permanent loss; 48h reclaim available)

---

### 5. Additional Observations

#### Balance Cache Race (LOW)

`balanceCache` in `solana.js` (line 95) is a module-level `Map` with 30-second TTL. Concurrent balance checks for the same wallet will both miss the cache, both call `getBalance()` RPC, and both write to the cache. The second write overwrites the first (both have the same TTL, possibly slightly different lamport values if the chain state changed between the two calls). This is a minor correctness issue — one balance read is wasted, and a briefly stale value may be cached. Not a security issue.

#### `saveMilestoneState` fire-and-forget (LOW)

`saveMilestoneState` at `shot-token.js:195` fires a MongoDB `findOneAndUpdate` without awaiting. If the server process exits immediately after (crash, SIGTERM), milestone state updates are lost. Combined with `initShotState()` at server startup restoring state from MongoDB, this creates a window where earned milestones are not persisted — they would be reclaimed on restart if `claimedMatchIds` is not saved. The `loadMilestoneState()` function does restore `claimedMatchIds`, so this is largely mitigated for restarts. But on crash, up to 1 second of milestone state (the debounce window for `persistEmissionCount`) is lost.

#### `turnSequence` not reset on reconnect (LOW)

`ms.turnSequence` is incremented on each `fire` event. On `rejoinRoom`, the sequence is sent to the client in the state snapshot. If the reconnect handler sends the current `ms.turnSequence` value but the pending `fire` event from the disconnected client's last turn is still in the event queue (Socket.IO may buffer events), that event will arrive with the old sequence value and be rejected as a replay. This is correct security behavior, but it means the reconnecting player may lose their last turn silently.

---

### 6. Recommendations

#### P0 — Immediate (Financial Risk)

1. **RC-11 (Prestige burn double-unlock):** Add a per-wallet async lock around the `verifyBurnTransaction` + `prestigeBurn` call sequence in the `prestigeBurn` socket handler:
   ```js
   await withLock(`prestige:${wallet}`, async () => {
       const verification = await verifyBurnTransaction(txSignature, wallet, burnAmount)
       if (!verification.valid) { ... }
       const result = prestigeBurn(wallet)
       client.emit('prestigeResult', result)
   })
   ```

2. **RC-02 (Turn-timer forfeit no lock):** The `startTurnTimer` callback settlement path must acquire `withLock('settle:${roomId}', ...)` before calling `settleMatch()`. The callback is module-level, so it needs access to `withLock` (already imported at module scope — available).

3. **RC-01 (TOCTOU on settlement transition):** Move `transitionState(ms, MATCH_STATES.SETTLING)` INSIDE the `withLock` block in the fire handler. The current pattern transitions state outside the lock and re-checks inside, creating a window:
   ```js
   await withLock(`settle:${this.roomId}`, async () => {
       if (ms.status !== MATCH_STATES.BATTLE && ms.status !== MATCH_STATES.ROUND_END) return
       const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
       if (!transitioned) return
       // ... settle ...
   })
   ```

#### P1 — High Priority (Gameplay Integrity)

4. **RC-05 (Room join capacity):** Move `room.active = true` BEFORE the `await verifyBalance()` call:
   ```js
   if (!room || room.active === true) return
   room.active = true   // claim the slot immediately
   // ... then verify balance, roll back on failure ...
   ```

5. **RC-08 (Terrain double-generate):** Use a per-room generation lock or move terrain generation inside an idempotency check that sets a sentinel value synchronously before yielding:
   ```js
   if (room._terrainCache || room._terrainGenerating) { ... return }
   room._terrainGenerating = true  // synchronous sentinel
   // ... generate ...
   room._terrainCache = payload
   room._terrainGenerating = false
   ```

6. **RC-06 (Matchmaking self-pair):** Guard `joinQueue` with a per-socket lock or validate that `opponent.socketId !== client.id` before pairing.

#### P2 — Medium Priority

7. **RC-03 (Double escrowActive):** Add a `ws.escrowActiveSent` flag set synchronously before the emit to prevent double-emission.

8. **RC-04 (Deposit timeout vs. late confirmation):** Clear `depositTimers[roomId]` synchronously at the top of the `escrowDepositConfirm` handler (before the `await getEscrowState()` call), not after both-confirmed check.

9. **RC-07 (Reconnect state migration):** Clear `disconnectTimers[walletAddress]` at line 822 BEFORE reading `pendingReconnects[walletAddress]` at line 805, to close the timer-fires-during-migration window.

10. **RC-12 (Recovery loop vs. active settlement):** Before calling `cancelMatchEscrow` in the recovery loop, check if the room still exists in `rooms` (live match) and skip if so. Use `withLock` in the recovery loop as well.

---

## Summary Table

| ID | Description | Severity | Locked? | Financial Risk |
|----|-------------|----------|---------|---------------|
| RC-01 | Settlement TOCTOU (fire vs disconnect) | HIGH | PARTIAL | On-chain safe; off-chain state corrupt |
| RC-02 | Turn-timer forfeit bypasses settlement lock | HIGH | NO | Double-settle attempt possible |
| RC-03 | Deposit confirm double-escrowActive emit | MEDIUM | NO | Double emit; idempotent but fragile |
| RC-04 | Deposit timeout races late confirmation | MEDIUM | NO | Valid match cancelled; escrow stuck 48h |
| RC-05 | Room join capacity overflow | MEDIUM | NO | Broken match state; stuck players |
| RC-06 | Matchmaking queue double-consume / self-pair | MEDIUM | NO | Corrupted room; stuck wagered match |
| RC-07 | Reconnect migration races disconnect timer | MEDIUM | NO | Room destroyed mid-migration |
| RC-08 | Terrain double-generate | MEDIUM | NO | Desync between server/client physics |
| RC-09 | Shop phase double-start | LOW | NO | State machine mitigates; low risk |
| RC-10 | SHOT milestone double-claim (cancelled match) | MEDIUM | NO | Milestone claimed for cancelled wager |
| RC-11 | Prestige burn concurrent double-unlock | CRITICAL | NO | Tier skip; negative SHOT balance |
| RC-12 | Recovery loop vs. active settlement | MEDIUM | NO | Cancel of live escrow possible |
| RC-13 | deleteRoom during settlement | LOW | NO | On-chain safe; 48h reclaim available |
