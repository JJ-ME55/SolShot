# BATCH-05: Error Handling & Timing Vulnerabilities

**Auditor:** Automated Security Analysis
**Date:** 2026-02-14
**Scope:** `server/index.js`, `server/socket-io/main.js`, `server/services/match.js`, `server/services/solana.js`
**Branch:** dev

---

## H061: No uncaughtException Handler

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

`server/index.js` (60 lines total) contains zero process-level error handlers. A full search of the file reveals:
- No `process.on('uncaughtException', ...)` handler
- No `process.on('unhandledRejection', ...)` handler
- No `process.on('SIGTERM', ...)` handler
- No `process.on('SIGINT', ...)` handler
- No graceful shutdown logic of any kind

```javascript
// server/index.js — complete file, 60 lines
// Contains: express setup, cors, mongoose.connect, server.listen
// Contains NO: process.on(), uncaughtException, unhandledRejection, graceful shutdown
```

The `monitoring.js` service exports `trackError()` (imported in `main.js:10`) but it is **never called anywhere** in the codebase.

When an async socket handler throws (which is easy to trigger -- see H062), Node.js 15+ treats unhandled promise rejections as uncaught exceptions and **terminates the process by default**. This kills the server, wiping all 8 in-memory state stores (`rooms`, `matchStates`, `goldStates`, `wagerStates`, `weaponInventories`, `shopTimers`, `shopReady`, `authenticatedWallets`).

**Exploit scenario:**

1. Attacker connects to Socket.IO.
2. Attacker sends a crafted event payload that triggers an uncaught exception in any async handler (e.g., `fire` with a payload that causes a property access on `undefined`).
3. Node.js terminates the process.
4. All active matches, in-progress settlements, wager states, and Gold balances are permanently lost.
5. If real SOL settlement were live, any in-flight settlements would be interrupted mid-transaction.

**Recommendation:**

Add process-level error handlers to `server/index.js`:

```javascript
process.on('uncaughtException', (err, origin) => {
    console.error('[FATAL] Uncaught exception:', err, 'Origin:', origin);
    trackError(err, 'uncaughtException');
    // Attempt graceful shutdown
    gracefulShutdown().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection:', reason);
    trackError(reason, 'unhandledRejection');
});

process.on('SIGTERM', () => gracefulShutdown().then(() => process.exit(0)));
process.on('SIGINT', () => gracefulShutdown().then(() => process.exit(0)));
```

Additionally, persist critical state (wagerStates, matchStates) to MongoDB so it survives restarts.

---

## H062: Fire Handler Unhandled Rejection

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `fire` event handler at `main.js:671-872` is a 200-line `async` function with **no top-level try/catch**:

```javascript
// main.js:671 — async handler with no try/catch
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    const room = findRoom(client.roomId)
    if (!room) return
    // ... 200 lines of code, no try/catch wrapper ...
```

The only try/catch in the entire handler is a narrow one around `settleMatch()` at lines 813-827:

```javascript
// main.js:813-827 — the ONLY try/catch in the fire handler
try {
    const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount)
    settlementInfo = { /* ... */ }
} catch (err) {
    console.error('[Solana] Settlement error:', err.message)
    settlementInfo = { error: err.message, wager: ws.amount }
}
```

Everything outside this narrow block is unprotected. Examples of lines that can throw:

- **Line 743-744:** `for (const [playerId, dmg] of Object.entries(result.damage))` -- throws if `result.damage` is `undefined` (e.g., if `processShot` returns an unexpected shape).
- **Line 760:** `room.host.socketId` -- throws if `room.host` is `null` (which happens after `removeRoom()` runs concurrently).
- **Line 789:** `getRoundWinner(ms, hostId, playerId)` -- throws if `ms` was deleted by concurrent `playAgainRequest` or `disconnect`.
- **Line 791:** `ms.roundWins[roundWinner]` -- throws if `ms` is `undefined`.
- **Line 818:** `sResult.settlement.winner` -- throws if `settleMatch` returns an unexpected shape (the try/catch prevents this specific case).

Any throw outside lines 813-827 produces an unhandled promise rejection, which on Node.js 15+ terminates the process (see H061).

**Exploit scenario:**

1. Player A and Player B are in a match with a SOL wager.
2. Player B disconnects, triggering `removeRoom()` which deletes `matchStates[roomId]`.
3. Simultaneously, Player A's `fire` event is still processing and reaches line 786: `if (ms && isRoundOver(ms))`.
4. Due to race condition, `ms` references the deleted object, or `room.player` is already null.
5. Line 760 throws: `Cannot read properties of null (reading 'socketId')`.
6. Unhandled rejection kills the server process.
7. All other active matches and wager states are destroyed.

**Recommendation:**

Wrap the entire fire handler body in a try/catch:

```javascript
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    try {
        // ... entire handler body ...
    } catch (err) {
        console.error('[Fire] Unhandled error:', err);
        trackError(err, 'fire-handler');
        client.emit('fireRejected', { reason: 'Server error' });
    }
});
```

Apply the same pattern to all async handlers (`disconnect`, `leaveRoom`, `joinRoom`, `createRoom`, `deleteRoom`).

---

## H064: Settlement Error Still Transitions to COMPLETE

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

In `main.js:802-835`, the settlement and state transition logic is structured as follows:

```javascript
// main.js:803 — first transition: BATTLE -> SETTLING
transitionState(ms, MATCH_STATES.SETTLING)

// main.js:806-829 — settlement block
let settlementInfo = null
const ws = wagerStates[client.roomId]
if (ws && ws.amount > 0) {
    // ... wallet lookups ...
    if (winnerWallet && loserWallet) {
        try {
            const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount)
            settlementInfo = { /* success data */ }
        } catch (err) {
            console.error('[Solana] Settlement error:', err.message)
            settlementInfo = { error: err.message, wager: ws.amount }  // error recorded
        }
    }
}

// main.js:831 — UNCONDITIONAL transition to COMPLETE
transitionState(ms, MATCH_STATES.COMPLETE)  // runs regardless of settlement outcome
trackMatchCompleted()

// main.js:852-860 — matchEnd emitted with potentially errored settlementInfo
io.sockets.in(client.roomId).emit('matchEnd', {
    winner: matchResult.winner,
    settlement: settlementInfo,  // may contain { error: "..." }
    // ...
})
```

Critical observations:

1. Line 831 `transitionState(ms, MATCH_STATES.COMPLETE)` executes **unconditionally** -- it runs whether settlement succeeded, failed, or was skipped entirely.
2. When `settleMatch()` throws, the catch block sets `settlementInfo = { error: err.message, wager: ws.amount }` but does NOT prevent the COMPLETE transition.
3. The `matchEnd` event is emitted with the error in `settlement`, but the match is permanently marked COMPLETE.
4. There is no retry mechanism, no compensation, and no way to re-trigger settlement.
5. Note also: the `BATTLE -> SETTLING` transition at line 803 is **invalid** according to the state machine in `match.js:24`: `BATTLE` can only transition to `[ROUND_END, CANCELLED]`. The `transitionState()` function returns `false` and logs a warning, but the caller ignores the return value. The status is NOT updated to SETTLING -- it stays as BATTLE. Then line 831 attempts `BATTLE -> COMPLETE` which is also invalid.

**Exploit scenario:**

1. Two players play a wagered match to completion.
2. Settlement fails (Solana RPC down, wallet address invalid, network timeout).
3. Match transitions to COMPLETE anyway.
4. `matchEnd` is emitted, signaling the match is done.
5. The winner never receives their SOL payout.
6. The wager state is available for cleanup by `playAgainRequest` or `removeRoom`, permanently losing the settlement data.
7. No retry is possible because the match is COMPLETE.

**Recommendation:**

1. Check settlement result before transitioning to COMPLETE:
```javascript
if (settlementInfo && settlementInfo.error) {
    // Stay in SETTLING state, schedule retry
    console.error('[Solana] Settlement failed, scheduling retry');
    scheduleSettlementRetry(client.roomId, matchResult.winner, ws);
    return;
}
transitionState(ms, MATCH_STATES.COMPLETE);
```

2. Fix the transition table: add `MATCH_STATES.SETTLING` to the valid transitions from `BATTLE`:
```javascript
[MATCH_STATES.BATTLE]: [MATCH_STATES.ROUND_END, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED],
```

3. Check `transitionState()` return values and abort on invalid transitions.

---

## H068: Concurrent Fire Events During Settlement

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `fire` handler at `main.js:671-872` is `async` and contains an `await settleMatch()` call at line 814. During the time this `await` yields, the Node.js event loop is free to process other socket events -- including another `fire` event from the same or other player.

There is no lock, mutex, semaphore, or `settlingRooms` Set anywhere in the codebase:

```javascript
// main.js:671 — async handler, no locking mechanism
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    // ... validation ...
    // Line 803: transitionState to SETTLING (but this transition is invalid, see H064)
    // Line 814: await settleMatch(...)  <-- yields control here
    // ... SHOT tokens, matchEnd emission ...
```

The turn check at lines 686-689 provides partial protection:

```javascript
// main.js:686-689
if (ms.currentTurn && ms.currentTurn !== client.id) {
    client.emit('fireRejected', { reason: 'Not your turn' })
    return
}
```

However, this check has two gaps:

1. **`ms.currentTurn` can be `null`**: If `ms.currentTurn` is `null` (initial state or after deletion), the condition `ms.currentTurn && ms.currentTurn !== client.id` is `false` (short-circuits), so the fire proceeds.

2. **State check is non-atomic**: Between checking `validateAction(ms.status, 'fire')` at line 680 and the `await` at line 814, the state machine offers no protection against interleaving. The `BATTLE -> SETTLING` transition attempt fails (invalid transition, see H064), so `ms.status` stays `BATTLE`, meaning `validateAction(ms.status, 'fire')` continues to return `true` for other `fire` events arriving during settlement.

3. **No settlement-in-progress guard**: There is no flag like `if (room.settling) return` to prevent processing fire events during async settlement.

**Exploit scenario:**

1. Player A fires the winning shot.
2. `isRoundOver()` returns true, `isMatchOver()` returns true.
3. Settlement begins: `await settleMatch(...)` at line 814.
4. During the `await`, Player B (or Player A, since turn just advanced) sends another `fire` event.
5. The second `fire` enters the handler. `ms.status` is still `BATTLE` (the SETTLING transition failed). `validateAction('battle', 'fire')` returns `true`.
6. The second `fire` processes physics, updates scores, and may trigger another `isMatchOver()` check.
7. A second `settleMatch()` call executes -- double settlement, double SHOT token emissions.

**Recommendation:**

Add a settlement lock (Set or per-room flag):

```javascript
const settlingRooms = new Set();

client.on('fire', async (...) => {
    if (settlingRooms.has(client.roomId)) {
        client.emit('fireRejected', { reason: 'Match is settling' });
        return;
    }
    // ... existing logic ...
    if (matchResult.isOver) {
        settlingRooms.add(client.roomId);
        try {
            // ... settlement logic ...
        } finally {
            settlingRooms.delete(client.roomId);
        }
    }
});
```

---

## H069: Disconnect During SETTLING Destroys State

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `disconnect` handler at `main.js:180-228` calls `removeRoom()` **unconditionally** when `client.roomId !== null`:

```javascript
// main.js:180-228
client.on('disconnect', async () => {
    trackDisconnection()
    if (client.roomId !== null) {
        // Handle wager forfeit on disconnect during active match
        const ws = wagerStates[client.roomId]
        const ms = matchStates[client.roomId]
        if (ws && ws.amount > 0 && ms) {
            const room = findRoom(client.roomId)
            if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
                // ... forfeit settlement ...
            } else if (ms.status === MATCH_STATES.LOBBY) {
                // ... refund ...
            }
            // NOTE: No check for ms.status === MATCH_STATES.SETTLING
            // NOTE: No check for ms.status === MATCH_STATES.COMPLETE
        }

        client.leave(client.roomId)
        await removeRoom(client.roomId)  // <-- ALWAYS called, line 221
        // ...
    }
```

Critical problems:

1. **No SETTLING check**: The disconnect handler checks for `BATTLE` and `WEAPON_SHOP` (to do forfeit settlement) and `LOBBY` (to do refund), but there is **no check for SETTLING**. If a player disconnects while settlement is in-flight from the `fire` handler, the disconnect handler falls through to line 221 and calls `removeRoom()`.

2. **`removeRoom()` destroys all state** (lines 89-108):

```javascript
// main.js:89-108
async function removeRoom(roomId) {
    rooms = rooms.filter((r) => r.roomId !== roomId);
    delete matchStates[roomId];      // destroys match state
    delete goldStates[roomId];       // destroys gold state
    delete weaponInventories[roomId]; // destroys inventories
    delete shopReady[roomId];
    delete wagerStates[roomId];       // DESTROYS WAGER STATE
    // ...
}
```

3. **Race with fire handler**: The `fire` handler's settlement code at lines 807-829 reads `wagerStates[client.roomId]` and `matchStates[client.roomId]`. If `removeRoom()` runs during the `await settleMatch()`, these references become stale or deleted, causing the post-settlement code (lines 831-860) to operate on deleted state.

4. **Double settlement**: The disconnect handler at line 198 calls `settleMatch()` for forfeit. If the fire handler is already mid-settlement, this produces two concurrent `settleMatch()` calls for the same match -- one for "normal win" and one for "forfeit".

**Exploit scenario:**

1. Player A fires the winning shot. Settlement begins (`await settleMatch()` at line 814).
2. Player B disconnects during the `await`.
3. Disconnect handler: `ms.status` is `BATTLE` (SETTLING transition was invalid), so the condition on line 188 is true.
4. Disconnect handler calls `settleMatch()` at line 198 -- **second settlement for the same match**.
5. Disconnect handler calls `removeRoom()` at line 221 -- deletes `wagerStates`, `matchStates`, `goldStates`.
6. Fire handler's `await settleMatch()` returns. It tries to read `wagerStates[roomId]` at line 839 -- now `undefined`.
7. Fire handler tries `transitionState(ms, MATCH_STATES.COMPLETE)` -- `ms` reference may still exist (JavaScript GC hasn't collected it), but the canonical store is deleted.
8. `matchEnd` is emitted to a room that has been cleaned up.
9. Result: double settlement with real SOL, plus server state corruption.

**Recommendation:**

1. Add a settlement-in-progress guard checked by the disconnect handler:
```javascript
if (settlingRooms.has(client.roomId)) {
    // Don't do forfeit settlement or cleanup; let the fire handler finish
    console.log('[Disconnect] Player disconnected during settlement, deferring cleanup');
    return;
}
```

2. Add explicit handling for SETTLING and COMPLETE states in the disconnect handler.

3. Never call `removeRoom()` while async settlement is in progress.

---

## H070: Room Deletion During Active Settlement

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `deleteRoom` handler at `main.js:274-284` performs unconditional cleanup with **no state checks**:

```javascript
// main.js:274-284
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        client.leave(client.roomId)
        await removeRoom(client.roomId)  // Deletes ALL state including wagerStates
        io.sockets.in(client.roomId).emit('opponentLeft', {})
        io.emit('setRooms', {rooms: getOpenRooms()})
        io.socketsLeave(client.roomId);
        client.roomId = null
        client.isHost = false
    }
})
```

Problems:

1. **No match state check**: There is no check for `ms.status` -- the handler runs regardless of whether the match is in LOBBY, BATTLE, SETTLING, or COMPLETE.

2. **No host-only check**: Any player can call `deleteRoom`, not just the host. The handler only checks `client.roomId !== null`.

3. **No settlement check**: There is no check for whether async settlement is in progress.

4. **`removeRoom()` deletes wagerStates**: At `main.js:96`, `delete wagerStates[roomId]` runs immediately:

```javascript
// main.js:96
delete wagerStates[roomId];  // wager data destroyed
```

5. **No settlement attempt**: Unlike `disconnect` and `leaveRoom` handlers, `deleteRoom` does **not** attempt forfeit settlement before cleanup. The wager is simply deleted -- funds vanish (or will vanish when real settlement is implemented).

**Exploit scenario:**

1. Player A and Player B are in a wagered match. Player A is losing.
2. Player A emits `deleteRoom`.
3. `removeRoom()` deletes `wagerStates[roomId]` -- no settlement occurs.
4. Player B's wager is effectively stolen (when real SOL transfers are live).
5. Alternatively: Player A fires the winning shot, triggering async settlement. While `await settleMatch()` is pending, Player B (the loser) emits `deleteRoom`. `removeRoom()` deletes `wagerStates` mid-settlement.

**Recommendation:**

1. Add authorization: only the host should be able to delete a room.
2. Add match state checks: prevent deletion during BATTLE, SETTLING.
3. Add settlement-in-progress guard.
4. Trigger forfeit settlement before deletion if the match is active:

```javascript
client.on('deleteRoom', async () => {
    if (client.roomId === null) return;
    if (!client.isHost) {
        client.emit('error', { reason: 'Only the host can delete the room' });
        return;
    }
    const ms = matchStates[client.roomId];
    if (ms && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.SETTLING)) {
        client.emit('error', { reason: 'Cannot delete room during active match' });
        return;
    }
    // ... existing cleanup ...
});
```

---

## H073: playAgainRequest During Async Settlement

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `playAgainRequest` handler at `main.js:1004-1054` deletes all match and wager state when both players agree:

```javascript
// main.js:1004-1054
client.on('playAgainRequest', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    if (client.isHost === true) {
        room.host.playAgain = true
        if (room.player && room.player.playAgain === true) {
            delete room.randomArray
            delete room.terrainPath
            delete room.heightmap

            // Reset match state, Gold, inventories, and wager for new game
            matchStates[client.roomId] = createMatchState(client.roomId)  // OVERWRITES match state
            delete goldStates[client.roomId]
            delete weaponInventories[client.roomId]
            delete shopReady[client.roomId]
            delete wagerStates[client.roomId]      // DELETES wager state
            // ...
        }
    }
    // ... mirror logic for player ...
})
```

Critical observations:

1. **No state check**: The handler does not check `ms.status`. It executes during ANY match phase, including during async settlement.

2. **`validateAction` not consulted**: The match state machine's `validateAction()` function maps `SETTLING` and `COMPLETE` states to `[]` (no allowed actions). But `playAgainRequest` does not call `validateAction()` at all.

3. **`wagerStates` deleted**: Line 1019/1043 `delete wagerStates[client.roomId]` destroys the wager data that an in-flight `settleMatch()` call needs for post-settlement logic.

4. **`matchStates` overwritten**: Line 1015/1039 `matchStates[client.roomId] = createMatchState(client.roomId)` replaces the match state with a fresh LOBBY state. If the fire handler still holds a reference to the old `ms` object, it will continue using stale data -- but `wagerStates` is accessed by key lookup (`wagerStates[client.roomId]`), which will now return `undefined`.

5. **Timing window**: The match has just ended (`matchEnd` emitted). Both players click "Play Again" rapidly. If the `matchEnd` event processing and `playAgainRequest` overlap with the tail end of settlement processing (SHOT token emissions at lines 838-850), the SHOT state writes reference a wallet lookup via `wagerStates` which is now deleted.

**Exploit scenario:**

1. Match ends. `await settleMatch()` is in progress at line 814.
2. Both players click "Play Again" before settlement completes.
3. `playAgainRequest` fires: `delete wagerStates[client.roomId]` at line 1019.
4. Settlement `await` resolves. Post-settlement code at line 839 reads `wagerStates[client.roomId]` -- returns `undefined`.
5. SHOT token wallet lookup at line 841: `wsState?.wallets?.[hostId]` -- `wsState` is `undefined`, so no SHOT tokens awarded (players cheated out of earned tokens).
6. The new match starts with `wagerStates` deleted -- the rematch is always free, even if the original match was wagered.
7. With real SOL: the settlement may have transferred SOL, but the wager state for the new match is gone, so the losing player effectively gets a free rematch without re-depositing.

**Recommendation:**

1. Add state validation to `playAgainRequest`:
```javascript
client.on('playAgainRequest', () => {
    const ms = matchStates[client.roomId];
    if (ms && ms.status !== MATCH_STATES.COMPLETE) {
        client.emit('playAgainRejected', { reason: 'Match not complete' });
        return;
    }
    // ... existing logic ...
});
```

2. Add a settlement-in-progress guard.
3. Preserve wager amount for rematch instead of deleting it.

---

## H074: Event Flooding DoS

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

A comprehensive search of `server/index.js` and `server/socket-io/main.js` reveals:

- **No `express-rate-limit`** or any rate-limiting middleware on HTTP routes.
- **No socket.io rate-limiting middleware** (no `socket.io-ratelimiter` or equivalent).
- **No per-socket event throttling** -- no counter, no timestamp tracking, no cooldown.
- **No `maxListeners` configuration** on the Socket.IO server.
- **No `maxPayload` override** -- uses Socket.IO default (1MB).

```javascript
// server/index.js:15-20 — Socket.IO server with no rate limiting config
const io = new socket.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})
// No maxHttpBufferSize, no rate limiting middleware

// server/index.js:22-24 — Express with generous body limits, no rate limiter
app.use(express.json({limit: "30mb", extended: true}))
app.use(express.urlencoded({limit: "30mb", extended: true}))
```

The Socket.IO connection handler at `main.js:158-1055` registers 23 event listeners on each socket with no throttling:

```javascript
// main.js:158 — every connection gets 23 unthrottled event handlers
const mainsocket = (io) => {
    return io.on("connection", (client) => {
        client.on('authenticate', ...)     // CPU-intensive (nacl.sign.verify)
        client.on('fire', ...)             // CPU-intensive (physics simulation)
        client.on('createWeaponArray', ...) // Unbounded loop (count param)
        client.on('joinRoom', ...)         // Makes Solana RPC call
        // ... 19 more handlers, all unthrottled
    })
}
```

High-impact flooding targets:

| Event | Per-call cost | DoS mechanism |
|-------|--------------|---------------|
| `authenticate` | ed25519 signature verify | CPU exhaustion |
| `fire` | 3000-step physics sim + array allocation | CPU + memory exhaustion |
| `createWeaponArray` | `count`-iteration loop (client-controlled) | Event loop blocking |
| `joinRoom` | Solana RPC call | RPC rate limit exhaustion + blocking I/O |
| `createRoom` | MongoDB write + in-memory array unshift | Memory + DB exhaustion |

**Exploit scenario:**

1. Attacker opens a single WebSocket connection (no auth needed, CORS is `*`).
2. Attacker sends 10,000 `fire` events per second with valid-looking payloads.
3. Each `fire` invokes `processShot()` which allocates an array of up to 3000 trajectory points.
4. At 10K events/sec: ~30M trajectory points/sec * ~32 bytes each = ~960MB/sec memory churn.
5. The Node.js event loop saturates; all other players experience timeouts.
6. Server becomes unresponsive within seconds.

Alternative: Send `createWeaponArray` with `{count: 100000000, max: 10}` -- a single event blocks the event loop for several seconds generating a 100M-element array.

**Recommendation:**

1. Add per-socket rate limiting middleware:
```javascript
const rateLimits = {
    fire: { max: 2, windowMs: 1000 },
    authenticate: { max: 3, windowMs: 60000 },
    createRoom: { max: 5, windowMs: 60000 },
    joinRoom: { max: 5, windowMs: 10000 },
    createWeaponArray: { max: 1, windowMs: 5000 },
};
```

2. Validate `createWeaponArray` parameters: cap `count` at a reasonable maximum (e.g., 20).

3. Reduce Express body parser limit from 30MB to 1MB or less.

4. Set Socket.IO `maxHttpBufferSize` to a reasonable limit (e.g., 64KB).

5. Add connection rate limiting (max new connections per IP per minute).

---

## Summary Table

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| H061 | No uncaughtException handler | CONFIRMED | CRITICAL |
| H062 | Fire handler unhandled rejection | CONFIRMED | CRITICAL |
| H064 | Settlement error still transitions to COMPLETE | CONFIRMED | HIGH |
| H068 | Concurrent fire events during settlement | CONFIRMED | HIGH |
| H069 | Disconnect during SETTLING destroys state | CONFIRMED | CRITICAL |
| H070 | Room deletion during active settlement | CONFIRMED | HIGH |
| H073 | playAgainRequest during async settlement | CONFIRMED | HIGH |
| H074 | Event flooding DoS | CONFIRMED | HIGH |

**All 8 hypotheses are CONFIRMED.**

### Cross-Cutting Root Causes

1. **No process-level error handling** (H061, H062): The server has zero resilience to unhandled errors. Any exception kills the process and destroys all in-memory state.

2. **No concurrency control** (H068, H069, H070, H073): All 8 in-memory state stores are mutated by multiple async handlers without any locking. The `await settleMatch()` call creates a time window where concurrent events can corrupt or destroy state.

3. **State machine transition return values ignored** (H064): `transitionState()` returns `false` on invalid transitions, but every call site ignores the return value. The `BATTLE -> SETTLING` transition is not even in the transition table.

4. **Unconditional cleanup** (H069, H070, H073): `removeRoom()`, `deleteRoom`, and `playAgainRequest` all destroy state without checking whether async operations are in flight.

5. **No rate limiting** (H074): Complete absence of event throttling makes all other vulnerabilities easier to exploit at scale.
