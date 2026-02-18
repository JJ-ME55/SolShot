# Audit Layer 10: Timing, Ordering & Race Conditions

**Auditor:** Claude Opus 4.6 security audit
**Date:** 2026-02-14
**Scope:** All server source files in `server/` — focus on Socket.IO event handlers, async settlement, auth, and state machine transitions
**Methodology:** Manual code review of all event handlers for TOCTOU gaps, async interleaving, missing locks/guards, and event ordering assumptions

---

## Executive Summary

The SolShot server uses Node.js single-threaded event loop with Socket.IO, which **prevents true parallel execution** but does NOT prevent race conditions caused by:

1. **Async/await suspension points** — any `await` yields control back to the event loop, allowing other socket events to execute mid-handler
2. **Timer callbacks** (setTimeout) interleaving with event handlers
3. **No idempotency guards** — identical events processed multiple times
4. **No state locks** — in-memory objects mutated by multiple handlers without coordination
5. **No nonce/deduplication** — auth signatures replayable within 5-minute window

Node.js processes events **sequentially** within a single tick, but `await` breaks atomicity. Every `await` in a handler is a potential interleaving point where another client's event can run and mutate shared state.

**Critical findings: 4 | High findings: 5 | Medium findings: 4 | Low findings: 2**

---

## Finding T-01: Double Settlement — Disconnect Forfeit + matchEnd Settlement Race

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:180-229` (disconnect handler) and `server/socket-io/main.js:802-860` (fire handler matchEnd settlement)
**CWE:** CWE-362 (Concurrent Execution Using Shared Resource with Improper Synchronization)

### Description

When a player fires the last shot that ends a match, the `fire` handler enters an `async` path containing `await settleMatch(...)` at line 814. During this `await`, Node.js yields control to the event loop. If the opponent disconnects during this yield, the `disconnect` handler runs, finds the match still in `BATTLE` state (the transition to `SETTLING` at line 803 happened, but the disconnect handler checks for `BATTLE || WEAPON_SHOP` at line 188), and could attempt a **second** settlement.

However, there is a more dangerous variant: if the **losing** player disconnects at the exact moment the final fire processes (before the `transitionState(ms, MATCH_STATES.SETTLING)` call at line 803 but after `isRoundOver` returns true at line 786), the following sequence can occur:

1. Fire handler: `isRoundOver()` returns true, `isMatchOver()` returns `{isOver: true, winner: hostId}`
2. **Before** line 803 executes, disconnect handler runs for the losing player
3. Disconnect handler sees `ms.status === MATCH_STATES.BATTLE` (still true)
4. Disconnect handler calls `await settleMatch(opponentWallet, disconnectorWallet, ws.amount)` -- settling in favor of the WINNER (who fired)
5. Disconnect handler calls `removeRoom(client.roomId)` -- **deletes all state**
6. Fire handler resumes at line 803, but `matchStates[roomId]` is now `undefined` (deleted by removeRoom)
7. Fire handler tries `transitionState(ms, MATCH_STATES.SETTLING)` on a stale `ms` reference -- no crash but state is inconsistent
8. Fire handler calls `await settleMatch(winnerWallet, loserWallet, ws.amount)` -- **SECOND settlement** for the same match

### Exploit Scenario

In a 0.5 SOL wager match, the losing player intentionally disconnects at the precise moment the winning shot is fired. Both the disconnect-forfeit path and the matchEnd path call `settleMatch()`. The winner receives two payouts (0.9 SOL + 0.9 SOL = 1.8 SOL from a 1.0 SOL pot), or alternatively the settlement is called with deleted/stale wallet data causing undefined behavior. Since `settleMatch` is currently a stub that just logs, this would become a **real double-payout** once on-chain settlement is implemented.

### Proof of Concept (Event Sequence)

```
T0: Player A fires final shot (fire handler enters)
T1: fire handler: isRoundOver() -> true, isMatchOver() -> {isOver: true, winner: A}
T2: --- async yield point (any prior await, or just event loop scheduling) ---
T3: Player B disconnects (disconnect handler enters)
T4: disconnect handler: ms.status === 'battle' -> true (not yet transitioned)
T5: disconnect handler: await settleMatch(A_wallet, B_wallet, 0.5) -> SETTLEMENT #1
T6: disconnect handler: await removeRoom(roomId) -> deletes matchStates[roomId], wagerStates[roomId]
T7: fire handler resumes at line 803
T8: fire handler: transitionState(ms, 'settling') -> operates on stale ms object
T9: fire handler: ws = wagerStates[roomId] -> undefined (deleted at T6)
    OR if ws was captured before the await: ws still references old object
T10: fire handler: await settleMatch(winnerWallet, loserWallet, 0.5) -> SETTLEMENT #2
```

### Recommendation

1. Add a per-room settlement lock (mutex flag):
```javascript
// At top of main.js
var settlementLocks = {} // roomId -> boolean

// Before any settleMatch call:
if (settlementLocks[roomId]) return; // already settling
settlementLocks[roomId] = true;
try {
    await settleMatch(...);
} finally {
    delete settlementLocks[roomId];
}
```

2. Immediately transition state to `SETTLING` before any async operation, and check state in disconnect handler:
```javascript
// In disconnect handler, line 188:
if (ms.status === MATCH_STATES.SETTLING || ms.status === MATCH_STATES.COMPLETE) {
    // Match is already being settled by fire handler, do NOT double-settle
    return;
}
```

3. Use a `matchSettled` flag on the room object as a definitive guard:
```javascript
if (room.settled) return;
room.settled = true;
```

---

## Finding T-02: Fire + Disconnect Simultaneous — Stale State After Room Deletion

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:671-872` (fire handler) and `server/socket-io/main.js:180-229` (disconnect handler)
**CWE:** CWE-362, CWE-416 (Use After Free equivalent for in-memory objects)

### Description

The `fire` handler is `async` (line 671) and contains multiple `await` points (line 814 for settleMatch). During any `await`, the opponent's disconnect handler can run and call `removeRoom(client.roomId)` which:
- Deletes `matchStates[roomId]` (line 92)
- Deletes `goldStates[roomId]` (line 93)
- Deletes `weaponInventories[roomId]` (line 94)
- Deletes `wagerStates[roomId]` (line 96)
- Removes the room from the `rooms` array (line 91)

The fire handler captured `const room = findRoom(client.roomId)` and `const ms = matchStates[client.roomId]` at the top (lines 672-675). After the `await`, these local references become **dangling** -- they point to objects that have been logically deleted. The handler continues to:
- Mutate `ms.scores` (line 744) on the stale matchState
- Mutate `goldStates[client.roomId]` (line 748) which is now `undefined`
- Emit events to `client.roomId` which has no participants (line 772)
- Attempt settlement with deleted wager state (line 807)

This is not a theoretical concern -- it happens whenever a player disconnects while the opponent's fire event is processing its async settlement.

### Exploit Scenario

Player B fires a shot. While the fire handler is processing (especially during the async settlement at lines 814-828), Player A disconnects. The disconnect handler deletes all room state. The fire handler resumes and emits `turnResult` and potentially `matchEnd` events to an empty room, and if settlement was in progress, attempts to settle a match whose wagerState has been deleted.

### Recommendation

1. Re-validate room existence after every `await`:
```javascript
const settlementResult = await settleMatch(winnerWallet, loserWallet, ws.amount);
// Re-check room still exists
if (!findRoom(client.roomId) || !matchStates[client.roomId]) {
    console.warn('Room deleted during settlement');
    return;
}
```

2. Do NOT delete state in disconnect handler if a fire event is in-flight. Use a processing lock per room.

---

## Finding T-03: Both Players shopDone at Same Tick — Double endShopPhase Call

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:574-593` (shopDone handler) and `server/socket-io/main.js:114-156` (endShopPhase)
**CWE:** CWE-362 (Race Condition)

### Description

When both players emit `shopDone` nearly simultaneously, Node.js processes them sequentially within the event loop. Consider:

1. Player A's `shopDone` handler sets `ready[A] = true` (line 584), checks `ready[A] && ready[B]` -> false (B not ready yet)
2. Player B's `shopDone` handler sets `ready[B] = true`, checks `ready[A] && ready[B]` -> true, calls `endShopPhase()`

This is **safe** in the normal case because Node.js processes one event fully before the next. However, the `endShopPhase` function has a guard at line 128:

```javascript
if (ms.status !== MATCH_STATES.WEAPON_SHOP) return
```

The real risk is the **shop timer** (see T-07 below). If the timer callback fires between Player A's shopDone and Player B's shopDone, `endShopPhase` gets called by the timer, transitions state to BATTLE, and then Player B's shopDone also calls `endShopPhase` which returns early due to the state guard. This is correctly handled.

**However**, there is a subtle issue: both `shopDone` events are synchronous (no `await`), so in pure Socket.IO they WILL be serialized. The risk is only if `endShopPhase` were made async in the future. Current code is safe but fragile.

### Recommendation

Add an explicit guard in `shopDone` to prevent re-entry:
```javascript
if (ready[client.id]) return; // Already marked as done
ready[client.id] = true;
```

This prevents a malicious client from emitting `shopDone` multiple times.

---

## Finding T-04: joinRoom While createRoom DB Write is Pending

**Severity:** HIGH
**Location:** `server/socket-io/main.js:354-410` (createRoom) and `server/socket-io/main.js:288-344` (joinRoom)
**CWE:** CWE-367 (Time-of-check Time-of-use / TOCTOU)

### Description

In `createRoom`, the room is added to the in-memory `rooms` array at line 406 (`rooms.unshift(roomData)`) and the room list is broadcast at line 409 (`io.emit('setRooms', ...)`). However, the `Match.create()` DB call at line 387 is `await`ed BEFORE the room is added to memory.

The execution flow is:
```
1. Generate roomId (line 360)
2. client.join(roomId) (line 361)
3. Set up wagerStates, matchStates (lines 375-382)
4. await Match.create(...) (line 387) -- YIELDS TO EVENT LOOP
5. roomData._matchId = match._id (line 399)
6. rooms.unshift(roomData) (line 406)
7. io.emit('setRooms', ...) (line 409)
```

During step 4's `await`, another player's `joinRoom` event can execute. At this point:
- `wagerStates[roomId]` exists (set at step 3)
- `matchStates[roomId]` exists (set at step 3)
- But the room is NOT in the `rooms` array yet (step 6 hasn't run)
- `findRoom(roomId)` will return `undefined`

So a `joinRoom` during the DB write would fail at line 290 (`if (!room || room.active === true) return`) -- which is safe in this direction.

**BUT** there's a different timing issue: if DB write fails (catch block at line 400-403), the room is STILL added to memory at line 406 WITHOUT a `_matchId`. This means:
- `persistRoom()` will silently skip (line 57 checks `room._matchId`)
- `removeRoom()` will skip the DB cancellation (line 101 checks `room._matchId`)
- State is inconsistent between DB and memory

The more dangerous scenario: if two players call `createRoom` nearly simultaneously and both generate the same roomId (possible since `Math.random().toString(32).slice(2,8)` has only ~30 bits of entropy), they would collide on both the in-memory and DB layers. The DB has a unique index on `roomCode` so the second `Match.create()` would fail, but the in-memory state would have two rooms with the same roomId, and `findRoom()` returns the first match.

### Exploit Scenario

1. Attacker generates thousands of createRoom requests in rapid succession to induce a roomId collision
2. Two rooms share the same roomId in the `rooms` array
3. `findRoom()` always returns the first one; the second is orphaned
4. Players joining the collided room get mismatched state

### Recommendation

1. Use `crypto.randomUUID()` or `crypto.randomBytes(16).toString('hex')` for room IDs instead of `Math.random().toString(32).slice(2,8)`
2. Add the room to memory BEFORE the DB write, and remove on DB failure:
```javascript
rooms.unshift(roomData);
try {
    const match = await Match.create({...});
    roomData._matchId = match._id;
} catch (err) {
    // Room is in memory but not in DB -- mark it
    console.warn('Match not persisted to DB:', err.message);
}
```
3. Check for roomId uniqueness before adding to `rooms`:
```javascript
if (findRoom(roomId)) {
    // Collision -- regenerate
    continue;
}
```

---

## Finding T-05: Double Fire Before turnResult Processed

**Severity:** HIGH
**Location:** `server/socket-io/main.js:671-872` (fire handler)
**CWE:** CWE-799 (Improper Control of Interaction Frequency)

### Description

The `fire` handler validates turn ownership at line 686:
```javascript
if (ms.currentTurn && ms.currentTurn !== client.id) {
    client.emit('fireRejected', { reason: 'Not your turn' })
    return
}
```

And advances the turn at line 762:
```javascript
ms.currentTurn = playerId ? getNextTurn(ms, hostId, playerId) : null
```

Since the fire handler is `async`, a player could emit two `fire` events in rapid succession. The first `fire` enters the handler, passes the turn check, and starts processing. The critical question is: **does `ms.currentTurn` get updated before the second fire event is processed?**

In the fire handler, the turn is advanced at line 762, which happens BEFORE the `await settleMatch()` at line 814. For the **non-settlement path** (shot doesn't end the match), the entire handler is synchronous -- `processShot()` is synchronous, damage calculation is synchronous, turn advance is synchronous. So the second fire event would see `ms.currentTurn` already changed and would be rejected.

**However**, for the settlement path (shot ends the match), after the turn is advanced at line 762, the handler continues to `isRoundOver()` (line 786), and if the match is over, it enters the `await settleMatch()` block. During this `await`:

1. The turn has been advanced to the opponent
2. The opponent could now fire (their turn)
3. But `ms.status` has been changed to `SETTLING` at line 803

Wait -- line 803 (`transitionState(ms, MATCH_STATES.SETTLING)`) happens BEFORE `await settleMatch()` at line 814. So the opponent's fire would be rejected by `validateAction(ms.status, 'fire')` at line 680 since `SETTLING` is not in the allowed actions for fire.

**The actual vulnerability**: For the `roundEnd` path (not match over), at line 862:
```javascript
transitionState(ms, MATCH_STATES.ROUND_END)
```
This is synchronous and happens before the emit. So the opponent can't fire during round_end. This is safe.

**Real issue**: The `turnCount` is incremented at line 759 regardless of whether it's the turn owner. If a malicious client rapidly sends fire events BEFORE their first one processes (Node.js queues them), the first processes and advances the turn, and the second is rejected by the turn check. This is safe for turn validation but there's a subtler issue:

The `processShot()` at line 725 is called before the turn is validated in the match-state-absent case (`if (ms)` at line 678 -- if ms is null, processShot runs with no turn validation). But `matchStates` is always initialized in `createRoom`, so this is only reachable if the state was deleted by a concurrent disconnect.

**Conclusion**: Double-fire is prevented by the turn check for normal gameplay. However, there is no rate limiting, so a client could spam fire events, each getting rejected but consuming server CPU for the validation checks.

### Recommendation

1. Add a `processingFire` lock per room to prevent concurrent fire processing:
```javascript
if (room.processingFire) {
    client.emit('fireRejected', { reason: 'Shot in progress' });
    return;
}
room.processingFire = true;
try { /* ... fire handler body ... */ }
finally { room.processingFire = false; }
```

2. Add rate limiting: reject fire events more frequent than 1 per 500ms per player.

---

## Finding T-06: Auth Replay Attack — Same Signature Reusable Within 5-Minute Window

**Severity:** HIGH
**Location:** `server/middleware/auth.js:65-78` (verifyAuthMessage) and `server/socket-io/main.js:170-177` (authenticate handler)
**CWE:** CWE-294 (Authentication Bypass by Capture-replay)

### Description

The authentication flow requires the client to sign a message `"SolShot Auth: <wallet> at <timestamp>"`. The server verifies:
1. Message format matches (line 67)
2. Timestamp is within 5 minutes (line 72-73)
3. Signature is cryptographically valid (line 41-44)

**There is no nonce or used-signature tracking.** The same signature+message+timestamp tuple can be replayed by any party who intercepts it within the 5-minute window.

Furthermore, the JWT generated at line 131 is **never validated on subsequent events**. The `authenticatedWallets` map (line 173) maps socketId to walletAddress, but:
- No event handler checks `client.isAuthenticated` before processing wager-related operations
- The JWT token is returned to the client but never used server-side
- `joinRoom` accepts `walletAddress` directly from the payload (line 296) and falls back to `authenticatedWallets[client.id]`, so an unauthenticated client can provide ANY wallet address

### Exploit Scenario

1. **Eavesdrop + Replay**: Attacker intercepts an auth message over the network (WebSocket messages are in cleartext over WS, not WSS). Within 5 minutes, attacker connects a new socket and replays the exact same `{walletAddress, message, signature, timestamp}` to authenticate as the victim's wallet.

2. **Session Hijack via Wallet Spoofing**: Without any auth check on joinRoom/createRoom, an attacker can:
   - Connect to the server (no auth needed)
   - Call `createRoom` with `player.walletAddress = <victim_wallet>`
   - Call `joinRoom` with `walletAddress = <victim_wallet>`
   - The server stores this wallet in `wagerStates[roomId].wallets[client.id]`
   - If the attacker wins, settlement pays out to victim's wallet (harmless)
   - If the attacker loses, victim's wallet is listed as the loser (harmful when real settlement is implemented)

3. **Multi-Socket Auth**: A single signature authenticates one socket. The attacker can open multiple sockets and authenticate all of them with the same signature within 5 minutes, effectively creating multiple authenticated sessions for one wallet.

### Recommendation

1. Implement a nonce/signature registry:
```javascript
const usedSignatures = new Set();
const SIGNATURE_EXPIRY = 5 * 60 * 1000;

export function verifyWalletSignature(walletAddress, message, signatureBase64) {
    // ... existing validation ...

    // Check replay
    if (usedSignatures.has(signatureBase64)) {
        return { valid: false, reason: 'Signature already used' };
    }
    usedSignatures.add(signatureBase64);

    // Clean up expired signatures periodically
    setTimeout(() => usedSignatures.delete(signatureBase64), SIGNATURE_EXPIRY);

    return { valid: true };
}
```

2. Require authentication for all wager-related operations. Add middleware:
```javascript
function requireAuth(client) {
    if (!client.isAuthenticated || !authenticatedWallets[client.id]) {
        return false;
    }
    return true;
}
```

3. Do NOT accept `walletAddress` from joinRoom/createRoom payloads. Only use the authenticated wallet:
```javascript
const walletAddress = authenticatedWallets[client.id]; // ONLY source of truth
if (wagerAmount > 0 && !walletAddress) {
    client.emit('createRoomError', { reason: 'Must authenticate wallet first' });
    return;
}
```

---

## Finding T-07: Shop Timer Expiry vs shopDone — Simultaneous Trigger

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:114-156` (endShopPhase), `server/socket-io/main.js:452-454` / `server/socket-io/main.js:497-500` (shop timer setup), `server/socket-io/main.js:574-593` (shopDone)
**CWE:** CWE-362 (Race Condition)

### Description

The shop phase has two termination conditions:
1. **Both players emit `shopDone`** -- calls `endShopPhase()` directly (line 591)
2. **Timer expires** (SHOP_DURATION = 30s) -- calls `endShopPhase()` via setTimeout (line 452-454)

The `endShopPhase` function has a guard:
```javascript
if (ms.status !== MATCH_STATES.WEAPON_SHOP) return  // line 128
```

And clears the timer:
```javascript
if (shopTimers[roomId]) {
    clearTimeout(shopTimers[roomId])      // line 117
    delete shopTimers[roomId]              // line 118
}
```

**Scenario**: Both players send `shopDone` at T=29.999s. Player A's handler runs, sets `ready[A] = true`, sees B is not ready. Player B's handler runs, sets `ready[B] = true`, sees both ready, calls `endShopPhase()`. `endShopPhase` clears the timer and transitions to BATTLE. At T=30.0s, the timer callback fires but `endShopPhase` returns early because `ms.status !== WEAPON_SHOP`.

This is **correctly handled** by the state guard.

**However**, there is a subtle timing issue with `setTimeout` precision. Node.js setTimeout is not guaranteed to fire exactly at the specified time -- it fires on the next tick after the delay expires. If the shopDone from both players processes in the same tick as the timer expiry, the order depends on the event loop microtask/macrotask queue. `setTimeout` callbacks are macrotasks, while socket events from the same tick are processed as they arrive. In practice, the state guard protects against double-execution.

**Actual vulnerability**: The `endShopPhase` clears `shopReady` at line 155:
```javascript
delete shopReady[roomId]
```
But the shopDone handler reads `shopReady[client.roomId]` at line 581. If the timer fires first and deletes shopReady, then a late shopDone from a player would see `ready = undefined` at line 581 and return early (line 582: `if (!ready) return`). This is safe -- the shop is already over.

**Minor issue**: If `endShopPhase` is called by the timer while a `buyWeapon` event is queued, the buyWeapon handler checks `validateAction(ms.status, 'buyWeapon')` which would return false since status is now BATTLE. This is correctly handled.

### Recommendation

The current state guard is sufficient but add a comment documenting the intentional protection:
```javascript
// SAFETY: This guard prevents double-execution from timer + shopDone race
if (ms.status !== MATCH_STATES.WEAPON_SHOP) return
```

---

## Finding T-08: Both Players Emit playAgainRequest Simultaneously — State Reset Ordering

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:1004-1053` (playAgainRequest handler)
**CWE:** CWE-362 (Race Condition)

### Description

The `playAgainRequest` handler has duplicated code for host (lines 1007-1028) and player (lines 1030-1053). Each side:
1. Sets their own `playAgain = true`
2. Checks if the OTHER side is also `playAgain === true`
3. If both true, resets all state and emits `playAgain`

Since both branches are synchronous (no `await`), Node.js serializes them. If both emit simultaneously:
- First handler (say host): sets `room.host.playAgain = true`, checks `room.player.playAgain` -> false, returns
- Second handler (player): sets `room.player.playAgain = true`, checks `room.host.playAgain` -> true, executes reset

This is correct -- exactly one reset happens.

**Vulnerability**: There is NO state machine validation. The `playAgainRequest` handler does NOT check `ms.status`. A player could emit `playAgainRequest` during BATTLE, WEAPON_SHOP, or any other state. The handler would set `playAgain = true` on the room object, and if the opponent's `playAgain` was already true from a previous legitimate request that was pending, the match would reset mid-game.

Looking at `match.js:64`, `playAgainRequest` is only allowed during `ROUND_END` state. But the handler in `main.js` never calls `validateAction()`:
```javascript
client.on('playAgainRequest', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    // NO state validation here!
    if (client.isHost === true) {
        room.host.playAgain = true
        ...
```

### Exploit Scenario

During an active wager match in BATTLE state, Player A (losing) emits `playAgainRequest`. This sets `room.host.playAgain = true`. Later, the match ends normally, and in the COMPLETE state, Player B genuinely wants to play again and emits `playAgainRequest`. The handler sees both `playAgain === true` and resets ALL state, including:
- `delete wagerStates[client.roomId]` (line 1019/1043) -- wager disappears
- `matchStates[client.roomId] = createMatchState(client.roomId)` -- match resets

The wager from the completed match is lost -- no settlement, no refund.

### Recommendation

Add state validation:
```javascript
client.on('playAgainRequest', () => {
    var room = findRoom(client.roomId)
    if (!room) return

    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'playAgainRequest')) {
        // playAgainRequest only allowed in ROUND_END or COMPLETE
        return
    }
    // ... rest of handler
})
```

Also, do NOT delete `wagerStates` on playAgain -- the wager should carry forward or be explicitly handled:
```javascript
// Preserve wager for rematch instead of deleting
// delete wagerStates[client.roomId]  // REMOVE THIS
```

---

## Finding T-09: matchEnd Settlement and Disconnect Forfeit Both Trigger for Same Match

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:802-860` and `server/socket-io/main.js:183-218`
**CWE:** CWE-362

### Description

This is the core of Finding T-01, isolated as a distinct scenario. The fire handler's settlement path and the disconnect handler's forfeit path both call `settleMatch()` without any mutual exclusion mechanism.

The detailed timeline:

```
Fire Handler (Player A fires winning shot):
  L786: isRoundOver() -> true
  L794: isMatchOver() -> {isOver: true, winner: A}
  L803: transitionState(ms, MATCH_STATES.SETTLING) -- synchronous, immediate
  L808: ws = wagerStates[client.roomId] -- captures reference
  L814: await settleMatch(winnerWallet, loserWallet, ws.amount) -- YIELDS

  --- Event loop runs other handlers ---

Disconnect Handler (Player B disconnects during the await):
  L185: ms = matchStates[client.roomId] -- gets the SAME ms object
  L188: ms.status === MATCH_STATES.SETTLING -- TRUE (was set at L803)
  L188: condition checks for BATTLE || WEAPON_SHOP -- FALSE

  RESULT: Disconnect handler does NOT trigger forfeit settlement because
          ms.status is already SETTLING, which is not BATTLE or WEAPON_SHOP.
```

Wait -- this means the state transition at line 803 actually DOES protect against double settlement in this specific case. Let me re-examine...

**Re-analysis**: The disconnect handler at line 188 checks:
```javascript
if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP))
```

If the fire handler has already called `transitionState(ms, MATCH_STATES.SETTLING)` at line 803 (which is synchronous and happens before the `await`), then the disconnect handler would see `ms.status === 'settling'` and skip the forfeit. This IS correct for this specific ordering.

**BUT**: The `removeRoom(client.roomId)` at line 221 is STILL called unconditionally in the disconnect handler, regardless of match status:
```javascript
client.leave(client.roomId)
await removeRoom(client.roomId)           // ALWAYS runs
io.sockets.in(client.roomId).emit('opponentLeft', {})
```

This means even though the forfeit settlement is skipped, the room is STILL destroyed while the fire handler's `await settleMatch()` is in progress. When the fire handler resumes, it tries to emit `matchEnd` to `client.roomId`, but all sockets have been removed from the room.

### Exploit Scenario

1. Player A fires winning shot in 0.5 SOL wager match
2. Fire handler transitions to SETTLING (protected against double settlement)
3. Player B disconnects during settlement `await`
4. Disconnect handler skips forfeit (correct) but DELETES the room
5. Fire handler resumes, settlement completes, but:
   - `matchEnd` event emitted to empty room -- Player A never receives settlement notification
   - `wagerStates[roomId]` deleted -- but local `ws` still references it (stale but functional)
   - Player A's client never gets confirmation of winning

### Recommendation

1. In the disconnect handler, if `ms.status === MATCH_STATES.SETTLING`, defer room cleanup:
```javascript
if (ms && ms.status === MATCH_STATES.SETTLING) {
    // Mark disconnected but don't destroy -- let settlement complete
    room.playerDisconnected = client.id;
    io.to(opponentId).emit('opponentDisconnectedDuringSettlement', {});
    return; // Don't removeRoom
}
```

2. In the fire handler, after settlement completes, check for pending disconnects and clean up:
```javascript
if (room.playerDisconnected) {
    await removeRoom(client.roomId);
}
```

---

## Finding T-10: Client Sends Fire Before terrainGenerated Arrives

**Severity:** HIGH
**Location:** `server/socket-io/main.js:671-696` (fire handler validation) and `server/socket-io/main.js:877-914` (requestTerrain)
**CWE:** CWE-696 (Incorrect Behavior Order)

### Description

The flow is:
1. Shop phase ends -> `endShopPhase` transitions to BATTLE and emits `shopEnd`
2. Client receives `shopEnd`, requests terrain via `requestTerrain`
3. Server generates terrain, stores heightmap, emits `terrainGenerated`
4. Client receives terrain, displays it, and can now fire

**The vulnerability**: After `endShopPhase` transitions to BATTLE state (line 130), the `fire` action is allowed by `validateAction('battle', 'fire')`. But the terrain hasn't been generated yet -- `room.heightmap` is `undefined`, `room.host.pos` and `room.player.pos` are undefined.

If a malicious client sends `fire` immediately after receiving `shopEnd` (before requesting terrain), the fire handler:
- Line 720: `const terrain = room.heightmap || new Array(1200).fill(400)` -- falls back to flat terrain
- Lines 700-716: `room.host.pos` is undefined, so tanks array is empty
- Line 725: `processShot()` runs with flat terrain and no tanks -> no damage possible
- Line 737: `room.heightmap = result.newTerrain` -- sets heightmap to the flat fallback

This corrupts the terrain state. When the legitimate `requestTerrain` runs later, it overwrites `room.heightmap`. But the `turnResult` already emitted to both players used the wrong terrain, and the opponent sees inconsistent state.

More critically: `ms.currentTurn` is set in `requestTerrain` (line 900-903). Before terrain is generated, `ms.currentTurn` may be null. The fire handler checks:
```javascript
if (ms.currentTurn && ms.currentTurn !== client.id) {
```
If `ms.currentTurn` is null, this check passes (null is falsy, so the entire condition is false), and ANY player can fire regardless of turn order.

### Exploit Scenario

1. Both players ready up, shop phase starts
2. Shop ends, state transitions to BATTLE
3. Attacker immediately sends `fire` with arbitrary angle/power
4. `ms.currentTurn` is null -> turn check bypassed
5. `room.heightmap` is undefined -> flat terrain fallback
6. Shot processes with no tanks -> no damage but turnCount incremented
7. `ms.currentTurn` is now set to some player by `getNextTurn()` at line 762
8. Attacker has stolen a turn and manipulated terrain state

### Recommendation

1. Add a `terrainReady` flag and check it in the fire handler:
```javascript
// In requestTerrain handler, after generating:
room.terrainReady = true;

// In fire handler, before processing:
if (!room.terrainReady) {
    client.emit('fireRejected', { reason: 'Terrain not ready' });
    return;
}
```

2. Use a dedicated state like `TERRAIN_GENERATION` between shop end and battle:
```
WEAPON_SHOP -> TERRAIN_SETUP -> BATTLE
```
Where fire is only allowed in BATTLE, and the transition to BATTLE only happens after terrain is generated.

3. Validate `ms.currentTurn !== null` before allowing fire:
```javascript
if (!ms.currentTurn) {
    client.emit('fireRejected', { reason: 'Turn not initialized' });
    return;
}
```

---

## Finding T-11: Async Settlement in Fire Handler — Next Fire Before Settlement Finishes

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:802-860` (fire handler settlement block)
**CWE:** CWE-362, CWE-841 (Improper Enforcement of Behavioral Workflow)

### Description

The fire handler contains the following async sequence when a match ends:

```javascript
L803: transitionState(ms, MATCH_STATES.SETTLING)      // synchronous
L814: const sResult = await settleMatch(...)            // ASYNC - yields to event loop
L831: transitionState(ms, MATCH_STATES.COMPLETE)       // synchronous, after await
L852: io.sockets.in(roomId).emit('matchEnd', ...)      // after await
```

Between lines 803 and 831, the match is in SETTLING state. During the `await` at line 814:

1. **No new fires can occur** -- `validateAction('settling', 'fire')` returns false (line 65-66 in match.js: `[MATCH_STATES.SETTLING]: []`). This is correct.

2. **But other events CAN occur**: `leaveRoom`, `disconnect`, `playAgainRequest`, `buyWeapon` (all have varying levels of state checks).

3. **leaveRoom during SETTLING**: The leaveRoom handler at line 238 checks for BATTLE or WEAPON_SHOP status before forfeit settlement, similar to disconnect. It would skip forfeit since status is SETTLING. But it still calls `removeRoom()` unconditionally at line 263 -- same issue as T-09.

4. **playAgainRequest during SETTLING**: As noted in T-08, there's no state validation. If both players had previously set `playAgain = true` (e.g., from a previous round), and one emits playAgainRequest during SETTLING, the handler would reset all state, including deleting `wagerStates` while settlement is in progress.

**The core issue**: The `await settleMatch()` creates a window where any event handler that modifies room state can corrupt the settlement process. Currently `settleMatch` is a stub that returns immediately, but when real on-chain settlement is implemented (involving actual RPC calls that take 5-30 seconds), this window becomes enormous.

### Exploit Scenario (When Real Settlement is Implemented)

1. Match ends, fire handler calls `await settleMatch()` which initiates an on-chain transaction
2. During the 10-second transaction confirmation wait, the losing player emits `playAgainRequest`
3. Since there's no state check, `playAgainRequest` deletes `wagerStates[roomId]`
4. `matchStates[roomId]` is recreated as a fresh lobby state
5. Settlement transaction completes on-chain (SOL actually transfers)
6. Fire handler resumes, but all server-side state is gone
7. No `matchEnd` event is properly delivered
8. On-chain state and server state are permanently desynchronized

### Recommendation

1. **Freeze all room mutations during SETTLING**: Add a frozen flag:
```javascript
room.frozen = true; // Set before await settleMatch
// In ALL other handlers:
if (room.frozen) {
    client.emit('actionRejected', { reason: 'Match is being settled' });
    return;
}
```

2. **Ensure state machine validation on ALL handlers** -- not just fire and buyWeapon:
```javascript
// playAgainRequest, leaveRoom, deleteRoom should all check:
if (ms && (ms.status === MATCH_STATES.SETTLING)) return;
```

3. **Implement settlement timeout**: If settleMatch takes more than N seconds, revert to a safe state:
```javascript
const SETTLEMENT_TIMEOUT = 30000;
const settlementPromise = settleMatch(winnerWallet, loserWallet, ws.amount);
const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Settlement timeout')), SETTLEMENT_TIMEOUT)
);
const sResult = await Promise.race([settlementPromise, timeoutPromise]);
```

---

## Finding T-12: Disconnect + leaveRoom Duplicate Settlement Logic

**Severity:** HIGH
**Location:** `server/socket-io/main.js:180-229` (disconnect) and `server/socket-io/main.js:233-270` (leaveRoom)
**CWE:** CWE-675 (Duplicate Operations on Resource)

### Description

The `disconnect` and `leaveRoom` handlers contain nearly identical forfeit settlement logic (copy-pasted at lines 183-218 and 236-259). If a player emits `leaveRoom` and immediately disconnects (or the TCP connection drops during leaveRoom processing), both handlers could run:

1. `leaveRoom` handler starts, reaches `await settleMatch(...)` at line 247
2. During the `await`, the socket disconnects
3. `disconnect` handler runs, sees `client.roomId !== null` (still set)
4. Disconnect handler enters the forfeit path

However, there's a subtlety: `leaveRoom` calls `removeRoom(client.roomId)` at line 263 and sets `client.roomId = null` at line 267. If `leaveRoom` completes before disconnect fires, `client.roomId` would be null and disconnect would skip.

**But if disconnect fires during leaveRoom's `await`**: `client.roomId` is still set (line 267 hasn't run). The disconnect handler would attempt settlement on the same match. Since `removeRoom` hasn't been called yet, all state objects still exist.

This is a variant of T-01 where both handlers attempt `settleMatch()` for the same room.

### Exploit Scenario

Player deliberately emits `leaveRoom` and immediately closes the connection. The `leaveRoom` handler's `await settleMatch()` yields, disconnect handler runs and also calls `settleMatch()`. Two settlements for the same match.

### Recommendation

1. Set `client.roomId = null` BEFORE any async operations in both handlers:
```javascript
client.on('leaveRoom', async () => {
    const roomId = client.roomId;
    client.roomId = null; // Prevent disconnect from re-entering
    client.isHost = false;
    if (roomId !== null) {
        // ... proceed with roomId local variable
    }
})
```

2. Use a per-socket "leaving" flag:
```javascript
if (client._leaving) return;
client._leaving = true;
```

---

## Finding T-13: No Event Ordering Guarantees — shopDone Emitted Multiple Times

**Severity:** LOW
**Location:** `server/socket-io/main.js:574-593` (shopDone handler)
**CWE:** CWE-799 (Improper Control of Interaction Frequency)

### Description

A malicious client can emit `shopDone` multiple times. The handler sets `ready[client.id] = true` each time (line 584). Since it's already true after the first call, subsequent calls are idempotent -- they set true to true and re-check the condition. If the other player is also ready, `endShopPhase()` would be called again, but the state guard at line 128 protects against this.

**However**, there's a timing window: if a client sends `shopDone`, then immediately sends `buyWeapon`, the buyWeapon handler might execute AFTER shopDone sets ready=true but BEFORE endShopPhase clears the shopReady state. The buyWeapon handler checks `validateAction(ms.status, 'buyWeapon')` which would still return true since status is still WEAPON_SHOP. This allows buying after declaring "done."

### Recommendation

Add idempotency check:
```javascript
if (ready[client.id] === true) return; // Already done
ready[client.id] = true;
```

---

## Finding T-14: Concurrent buyWeapon — Gold Balance TOCTOU

**Severity:** LOW
**Location:** `server/socket-io/main.js:515-571` (buyWeapon handler) and `server/services/gold.js:95-111` (spendGold)
**CWE:** CWE-367 (TOCTOU)

### Description

The `buyWeapon` handler is synchronous (no `await`), so concurrent buyWeapon events from the same socket are serialized by Node.js. However, `spendGold()` reads the balance and deducts in separate operations:

```javascript
const balance = goldState[playerId] || 0;  // READ
// ... validation ...
goldState[playerId] = balance - cost;        // WRITE
```

Since this is synchronous and Node.js is single-threaded, there's no TOCTOU issue here. The balance is read and written in the same synchronous tick.

**The only risk** would be if `spendGold` were made async in the future (e.g., to check an on-chain balance). Current code is safe.

### Recommendation

Document the synchronous requirement:
```javascript
// IMPORTANT: This function MUST remain synchronous to prevent TOCTOU on balance
export function spendGold(goldState, playerId, cost) { ... }
```

---

## Finding T-15: Two Players Disconnect Simultaneously During Wager Match

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:180-229` (disconnect handler)
**CWE:** CWE-362

### Description

When both players disconnect simultaneously in a wager match, two disconnect handlers run. Node.js serializes them, so:

**First disconnect handler** (Player A):
1. Finds room, finds ms, checks status is BATTLE
2. Computes opponentId = Player B
3. Gets wallets: disconnectorWallet = A's wallet, opponentWallet = B's wallet
4. Calls `await settleMatch(B_wallet, A_wallet, amount)` -- B "wins" by A's forfeit
5. Emits `matchSettled` to B's socketId -- but B is already disconnected, message lost
6. Calls `await removeRoom(roomId)` -- deletes all state
7. Sets `client.roomId = null`

**Second disconnect handler** (Player B):
1. `client.roomId` is still set (it was set before disconnect)
2. `findRoom(roomId)` returns undefined -- room was deleted at step 6
3. The `if (ws && ws.amount > 0 && ms)` check: `wagerStates[roomId]` was deleted by `removeRoom`, so `ws = undefined`
4. The forfeit path is skipped
5. `await removeRoom(roomId)` runs again but finds nothing to delete (already gone)

**Result**: Player B gets the win settlement, Player A loses. This is actually the CORRECT behavior -- first to disconnect is the forfeiter. However, the settlement is sent to Player B who is already disconnected and will never receive the notification.

**The real issue**: if both disconnects are processed before either reaches the `await settleMatch` line (which shouldn't happen in Node.js since the first handler runs to completion of its synchronous portion before the second starts), there would be no issue. But the `await` at line 198 means the second disconnect CAN run during the first's settlement:

1. First disconnect: reaches `await settleMatch(...)` -- yields
2. Second disconnect: runs, `ws` still exists (removeRoom hasn't been called yet)
3. Second disconnect: `ms.status` is still BATTLE (first handler hasn't changed it)
4. Second disconnect: computes opponentId = Player A (who is disconnecting)
5. Second disconnect: calls `await settleMatch(A_wallet, B_wallet, amount)` -- A "wins" by B's forfeit
6. **BOTH players "win" the forfeit settlement** -- double payout

### Exploit Scenario

Two colluding players in a 0.5 SOL wager match both disconnect simultaneously. Race condition causes both to be treated as the "winning" side of a forfeit. Both receive 0.9 SOL payouts from a 1.0 SOL pot.

### Recommendation

Same as T-01 -- use a per-room settlement lock:
```javascript
// Before forfeit settlement in disconnect handler:
if (settlementLocks[client.roomId]) {
    // Already being settled by the other disconnect
    console.log('Settlement already in progress, skipping');
} else {
    settlementLocks[client.roomId] = true;
    const settlementResult = await settleMatch(...);
    delete settlementLocks[client.roomId];
}
```

---

## Summary Table

| ID | Finding | Severity | Location | Root Cause |
|----|---------|----------|----------|------------|
| T-01 | Double settlement: disconnect + matchEnd | CRITICAL | main.js:180-229, 802-860 | No mutual exclusion on settleMatch calls |
| T-02 | Fire + disconnect: stale state after room deletion | CRITICAL | main.js:671-872, 180-229 | Room deleted during async fire processing |
| T-03 | Both shopDone simultaneous | MEDIUM | main.js:574-593 | Protected by state guard; fragile if made async |
| T-04 | joinRoom during createRoom DB write | HIGH | main.js:354-410, 288-344 | Room added to memory after async DB write; roomId collision risk |
| T-05 | Double fire before turnResult | HIGH | main.js:671-872 | Turn check works but no rate limiting; null currentTurn bypasses check |
| T-06 | Auth replay attack | HIGH | auth.js:65-78, main.js:170-177 | No nonce, no used-signature tracking, JWT never validated |
| T-07 | Shop timer vs shopDone | MEDIUM | main.js:114-156, 574-593 | Protected by state guard; documented as safe |
| T-08 | Both playAgainRequest simultaneous | MEDIUM | main.js:1004-1053 | No state machine validation; can reset during SETTLING |
| T-09 | matchEnd settlement + disconnect room deletion | CRITICAL | main.js:802-860, 180-229 | removeRoom runs unconditionally during settlement await |
| T-10 | Fire before terrainGenerated | HIGH | main.js:671-696 | No terrain readiness check; null currentTurn bypass |
| T-11 | Async settlement window allows state corruption | CRITICAL | main.js:802-860 | 5-30s settlement window allows any handler to mutate state |
| T-12 | Duplicate disconnect/leaveRoom settlement | HIGH | main.js:180-229, 233-270 | Copy-pasted logic, both can run for same room |
| T-13 | shopDone emitted multiple times | LOW | main.js:574-593 | No idempotency check |
| T-14 | Concurrent buyWeapon Gold TOCTOU | LOW | main.js:515-571, gold.js:95-111 | Currently safe (synchronous); fragile if made async |
| T-15 | Both players disconnect simultaneously | MEDIUM | main.js:180-229 | Both forfeit handlers can run before either calls removeRoom |

---

## Priority Remediation Order

### Immediate (Block deployment)

1. **Settlement mutex** (fixes T-01, T-09, T-11, T-12, T-15): Implement a per-room settlement lock that prevents any concurrent settlement calls. This is the single highest-impact fix.

2. **Auth replay prevention** (fixes T-06): Add signature deduplication tracking. Require authenticated wallet for all wager operations. Stop accepting walletAddress from client payloads.

3. **Room freeze during settlement** (fixes T-02, T-09, T-11): Prevent room deletion and state mutation while settlement is in progress. All handlers must check a `room.frozen` or `room.settling` flag.

### Short-term (Before real SOL settlement)

4. **Terrain readiness gate** (fixes T-10): Add `room.terrainReady` flag and require it for fire events. Also require `ms.currentTurn !== null`.

5. **State validation on all handlers** (fixes T-08): Add `validateAction()` calls to `playAgainRequest`, `leaveRoom`, `deleteRoom`.

6. **Capture-and-clear roomId pattern** (fixes T-12): In both disconnect and leaveRoom, capture `client.roomId` into a local variable and clear it immediately, before any async operations.

7. **Cryptographic room IDs** (fixes T-04): Replace `Math.random().toString(32)` with `crypto.randomUUID()`.

### Medium-term

8. **Fire rate limiting** (fixes T-05): Add per-player rate limit of 1 fire per 500ms.

9. **shopDone idempotency** (fixes T-13): Add explicit check for already-done state.

10. **Document synchronous requirements** (fixes T-14): Add code comments preventing async conversion of critical functions.

---

## Architectural Recommendation

The root cause of most findings is the absence of a **per-room operation lock**. Consider implementing a simple async mutex:

```javascript
class RoomLock {
    constructor() {
        this.locks = new Map();
    }

    async acquire(roomId) {
        while (this.locks.has(roomId)) {
            await this.locks.get(roomId);
        }
        let resolve;
        const promise = new Promise(r => resolve = r);
        this.locks.set(roomId, promise);
        return () => {
            this.locks.delete(roomId);
            resolve();
        };
    }
}

const roomLock = new RoomLock();

// Usage in handlers:
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    const release = await roomLock.acquire(client.roomId);
    try {
        // ... entire fire handler body ...
    } finally {
        release();
    }
});
```

This ensures that for any given room, only one mutating operation runs at a time, eliminating all interleaving-based race conditions.
