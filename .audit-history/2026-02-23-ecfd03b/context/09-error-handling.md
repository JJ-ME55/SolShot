# 09 - Error Handling & Failure Modes

## Audit Scope

Analysis of all server source files for error handling deficiencies, unhandled
exceptions, silent failures, information leakage, and crash vectors.

**Files analyzed:**
- `server/socket-io/main.js` (1058 LOC)
- `server/services/solana.js` (208 LOC)
- `server/middleware/auth.js` (138 LOC)
- `server/services/physics.js` (458 LOC)
- `server/services/match.js` (177 LOC)
- `server/services/gold.js` (114 LOC)
- `server/services/shot-token.js` (216 LOC)
- `server/services/monitoring.js` (211 LOC)
- `server/services/raydium.js` (73 LOC)
- `server/models/Match.js` (60 LOC)
- `server/models/User.js` (30 LOC)
- `server/models/Weapon.js` (113 LOC)
- `server/index.js` (59 LOC)
- `server/tests/integration.test.js` (773 LOC)

---

## Finding EH-01: No Global Uncaught Exception / Unhandled Rejection Handlers

**Severity:** CRITICAL
**Location:** `server/index.js` (entire file -- handlers absent)
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

The server has zero `process.on('uncaughtException')` or
`process.on('unhandledRejection')` handlers. If any unhandled exception or
rejected promise propagates to the top of the event loop, the Node.js process
will crash with the default behavior: print a stack trace to stderr and exit
with code 1.

### Evidence

Searched all server source files for `uncaughtException`, `unhandledRejection`,
`process.on`, and `process.exit`. The only match is `process.exit()` in the test
file. There is no graceful shutdown logic of any kind.

### Exploit Scenario

1. Attacker sends a carefully malformed `authenticate` event with data that
   causes `atob()` to throw a non-ASCII error (see EH-03).
2. If Socket.IO's internal error boundary misses this (which it can in certain
   async paths), the process crashes.
3. All active matches are terminated. All in-memory state (rooms, matchStates,
   goldStates, wagerStates, weaponInventories, shopTimers, authenticatedWallets,
   SHOT token state) is permanently lost.
4. Any matches mid-settlement lose their wager data with no recovery path.

### Recommendation

```js
process.on('uncaughtException', (err, origin) => {
    console.error('[FATAL] Uncaught exception:', err.message, 'Origin:', origin);
    trackError(err, 'uncaughtException');
    // Attempt graceful shutdown: settle active wagers, persist state
    gracefulShutdown().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection:', reason);
    trackError(reason, 'unhandledRejection');
});

// SIGTERM/SIGINT for container orchestration
process.on('SIGTERM', () => gracefulShutdown().then(() => process.exit(0)));
process.on('SIGINT', () => gracefulShutdown().then(() => process.exit(0)));
```

---

## Finding EH-02: The `fire` Handler Has No Top-Level Try/Catch

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:671-872`
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

The `fire` event handler is the most complex async handler in the server
(200 lines, async, accesses multiple in-memory stores, calls processShot,
runs settlement logic). It has **no top-level try/catch**. A single thrown
exception at any point will either:

(a) Crash the server (if Socket.IO does not catch async handler rejections), or
(b) Leave the match in a broken state (mid-settlement, turn never advances,
    `matchStates[roomId]` partially mutated).

### Evidence

```js
// Line 671 -- no try/catch wrapping
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    const room = findRoom(client.roomId)
    if (!room) return
    // ... 200 lines of logic with no error boundary ...
```

The only try/catch within this handler is the settlement block at line 813-827.
Everything else -- `processShot()`, score updates, gold calculations,
`transitionState()`, SHOT token recording, the round-end broadcast -- runs
unprotected.

### Exploit Scenario

1. Attacker sends `fire` with `startX: NaN` or `startY: undefined`.
2. `processShot()` produces an object where `result.damage` is unexpected.
3. Line 743 `Object.entries(result.damage)` throws or iterates incorrectly.
4. Unhandled rejection propagates. Match is stuck: `ms.turnCount` was already
   incremented (line 759) but the turn was never broadcast to clients.
5. Both players are now frozen with no way to continue.

Alternatively:
1. `room.player` is `null` (opponent just disconnected, race condition).
2. Line 760 accesses `room.host.socketId` -- succeeds.
3. Line 761 accesses `room.player.socketId` -- TypeError: Cannot read property
   'socketId' of null.
4. Unhandled exception in async handler.

### Recommendation

Wrap the entire `fire` handler body in a try/catch:

```js
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    try {
        // ... existing logic ...
    } catch (err) {
        console.error('[Fire] Unhandled error:', err);
        trackError(err, 'fire');
        client.emit('fireRejected', { reason: 'Internal server error' });
    }
});
```

Apply the same pattern to all async handlers: `disconnect`, `leaveRoom`,
`deleteRoom`, `joinRoom`, `createRoom`.

---

## Finding EH-03: `atob()` Usage in Node.js -- Platform-Dependent, Throws on Invalid Input

**Severity:** HIGH
**Location:** `server/middleware/auth.js:37`
**CWE:** CWE-20 (Improper Input Validation), CWE-474 (Use of Function with Inconsistent Implementations)

### Description

```js
const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
```

`atob()` is a Web API. It was added to Node.js globals in v16.0.0 but behaves
differently than the browser version. More critically, it throws a
`DOMException` (not a regular `Error`) when given non-base64 input. This is
inside a try/catch, so the immediate crash is caught, but:

1. The error message leaks the actual `DOMException` details via line 53:
   `return { valid: false, reason: 'Verification error: ${err.message}' }`.
2. The error type being `DOMException` rather than `Error` could confuse
   upstream catch blocks that check `instanceof Error`.

### Exploit Scenario

1. Attacker sends `authenticate` with `signature: "not-base64!!!"`.
2. `atob()` throws `DOMException: Invalid character`.
3. Error is caught but the response includes `reason: "Verification error:
   Invalid character"` -- confirms to the attacker that the server is running
   Node.js and uses `atob()` for base64 decoding (information leak).

### Recommendation

Replace `atob()` with `Buffer.from()`:

```js
const signature = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
```

Also, return a generic error message instead of forwarding `err.message`:

```js
} catch (err) {
    return { valid: false, reason: 'Signature verification failed' };
}
```

---

## Finding EH-04: `verifyBalance()` Catch-All Returns `{sufficient: false, balance: 0}` -- Fail-Open in joinRoom

**Severity:** HIGH
**Location:** `server/services/solana.js:95-102` + `server/socket-io/main.js:305-317`
**CWE:** CWE-636 (Not Failing Securely)

### Description

When the Solana RPC throws (network error, rate limit, invalid address), `verifyBalance()` catches all errors and returns `{sufficient: false, balance: 0, required: wagerSOL + 0.01}`.

In `joinRoom` (line 306-317), this catch-all is then checked in a way that
**fails open**:

```js
try {
    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
    if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
        // Only reject if we got a real balance back and it's insufficient
        client.emit('joinRoomError', {...})
        return
    }
} catch (err) {
    console.warn('[Solana] Balance check skipped:', err.message)
    // Falls through -- player joins without any balance verification
}
```

When verifyBalance returns `balance: 0` (the error case), the condition
`balanceCheck.balance > 0` is false, so the player is NOT rejected.
Additionally, if `verifyBalance` itself throws (e.g., `getConnection()` throws),
the outer catch just warns and lets the player through.

### Exploit Scenario

1. Attacker joins a 0.5 SOL wager room with a wallet that has 0 SOL.
2. The Solana RPC is momentarily rate-limited or times out.
3. `verifyBalance` returns `{sufficient: false, balance: 0}`.
4. The condition `balance > 0 && !sufficient` is `false && true = false`.
5. Player joins the wagered match with zero balance.
6. If they win, settlement calculates a payout to them. If they lose, there is
   nothing to collect (settlement is currently a stub, but when implemented,
   the escrow would be empty).

### Recommendation

Fail-closed: if balance cannot be verified for a wagered match, reject the join:

```js
const balanceCheck = await verifyBalance(joinerWallet, roomWager);
if (!balanceCheck.sufficient) {
    if (balanceCheck.balance === 0 && balanceCheck.error) {
        client.emit('joinRoomError', { reason: 'Unable to verify balance, try again' });
    } else {
        client.emit('joinRoomError', { reason: `Insufficient SOL balance` });
    }
    return;
}
```

---

## Finding EH-05: `persistRoom()` Failure Is Silent -- Data Can Be Lost

**Severity:** HIGH
**Location:** `server/socket-io/main.js:56-86`
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

```js
async function persistRoom(room) {
    if (!room || !room._matchId || !isDbConnected()) return;  // silent skip
    try {
        await Match.findByIdAndUpdate(room._matchId, update);
    } catch (err) {
        console.error('DB persist error:', err.message);  // log and discard
    }
}
```

`persistRoom` is described as "fire-and-forget for non-critical updates" (line
55 comment), but it is called after critical mutations:

- After a player joins (line 340) -- the room's player data is persisted.
- After terrain is set (line 963) -- terrain path + positions are persisted.
- After weapon arrays are created (line 657).

If MongoDB disconnects mid-match:

1. All calls to `persistRoom` silently return (either via `isDbConnected()` check
   or caught exception).
2. The in-memory state continues to evolve.
3. If the server restarts, there is zero recovery -- all match data is lost.
4. The `console.error` is not routed to `trackError()`, so the monitoring
   dashboard does not track these failures.

### Exploit Scenario

1. MongoDB connection drops due to network partition or credentials rotation.
2. 50 active matches continue running in memory.
3. Server process restarts (OOM, deploy, crash).
4. All 50 matches are lost. Wager states are lost. No record exists of which
   wallets are owed refunds.

### Recommendation

1. Route persist failures to `trackError()` for monitoring visibility.
2. Implement a write-ahead log (WAL) or periodic state snapshot for recovery.
3. On `isDbConnected() === false`, queue writes for retry when connection
   resumes.
4. For wagered matches specifically, persist wager state before allowing play
   to begin (not fire-and-forget).

---

## Finding EH-06: `disconnect` and `leaveRoom` Handlers Have No Top-Level Try/Catch

**Severity:** HIGH
**Location:** `server/socket-io/main.js:180-229` (disconnect), `server/socket-io/main.js:233-270` (leaveRoom)
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

Both handlers are `async` and contain awaited calls (`settleMatch`,
`refundWager`, `removeRoom`), but neither has a top-level try/catch.

```js
client.on('disconnect', async () => {
    // ... no try/catch ...
    const settlementResult = await settleMatch(opponentWallet, disconnectorWallet, ws.amount)
    // ...
    await removeRoom(client.roomId)
    // ...
})
```

If `settleMatch` throws (e.g., when the currently-stubbed implementation is
replaced with real Solana transactions), the `removeRoom` call on line 221 is
never reached. The room remains in memory as a zombie -- occupying resources but
inaccessible to either player.

### Exploit Scenario

1. Wagered match is in progress. Attacker disconnects.
2. `settleMatch()` is replaced with real on-chain logic that calls Solana RPC.
3. Solana RPC throws TransactionExpiredBlockheightExceeded.
4. `disconnect` handler's unhandled rejection leaves the room in memory.
5. `removeRoom` was never called: `rooms`, `matchStates`, `goldStates`,
   `wagerStates`, `weaponInventories` entries for this room persist
   permanently until server restart.
6. Repeated exploitation creates a memory leak / resource exhaustion DoS.

### Recommendation

Wrap both `disconnect` and `leaveRoom` in try/catch:

```js
client.on('disconnect', async () => {
    try {
        // ... existing logic ...
    } catch (err) {
        console.error('[Disconnect] Error:', err);
        trackError(err, 'disconnect');
        // Ensure room cleanup always happens
        if (client.roomId) {
            await removeRoom(client.roomId).catch(() => {});
        }
    }
});
```

---

## Finding EH-07: `processShot()` Can Produce NaN/Infinity Without Validation

**Severity:** HIGH
**Location:** `server/services/physics.js:421-458` + `server/socket-io/main.js:725-734`
**CWE:** CWE-20 (Improper Input Validation)

### Description

`processShot()` receives parameters directly from the client with no numeric
bounds validation:

```js
// main.js line 671 -- no type or bounds checking on any field
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    // ...
    const result = processShot({ angle, power, weaponId, startX, startY, shooterId, terrain, tanks })
```

Inside `processShot` and `calculateTrajectory`:

```js
// physics.js line 60-64
const velocity = power * POWER_FACTOR;        // NaN if power is undefined
const rotation = angle - Math.PI / 2;         // NaN if angle is "abc"
let vx = velocity * Math.cos(rotation);       // NaN propagates
let vy = velocity * Math.sin(rotation);       // NaN propagates
```

If `angle` or `power` is `NaN`, `undefined`, `Infinity`, or a string:
- The entire trajectory is `[{x: NaN, y: NaN, ...}]`.
- `calculateImpact` iterates all 3000 steps without hitting any bounds check
  (all comparisons with NaN return false).
- Returns `{type: 'outOfBounds'}` after the full loop.
- No damage, no terrain deformation -- but the server spent CPU time computing
  3000 trajectory steps of garbage.

If `power` is `1e308` (very large number):
- `velocity = 1e308 * 8 = Infinity`
- `vx = Infinity * cos(angle) = Infinity` (or NaN if angle is PI/2)
- Trajectory immediately goes out of bounds on step 1, which is benign but
  still an abuse of the protocol.

If `power` is `-1e10` (large negative):
- Projectile flies backwards at extreme speed.
- Could hit the shooter's own tank or fly off screen.

### Exploit Scenario

1. Attacker sends `fire` with `power: 1e15` and `angle: 0`.
2. `calculateTrajectory` runs 3000 iterations with `Infinity` values.
3. All 3000 points are `{x: Infinity, y: NaN}`.
4. `calculateImpact` runs the full 3000-step loop, performing math on Infinity.
5. Result is harmless but wastes CPU. Repeated at high frequency, this becomes
   a computational DoS.

More dangerously, if `startX` or `startY` is `undefined`:
1. `processShot` starts trajectory from `undefined`.
2. All trajectory math produces `NaN`.
3. `result.impact` is `{x: NaN, y: NaN, type: 'outOfBounds'}`.
4. This is broadcast to both clients as `turnResult`, corrupting their state.

### Recommendation

Validate all numeric inputs at the top of the `fire` handler:

```js
if (typeof angle !== 'number' || !isFinite(angle)) { ... reject }
if (typeof power !== 'number' || !isFinite(power) || power < 0 || power > 100) { ... reject }
if (typeof startX !== 'number' || !isFinite(startX)) { ... reject }
if (typeof startY !== 'number' || !isFinite(startY)) { ... reject }
if (typeof weaponId !== 'number' || !Number.isInteger(weaponId)) { ... reject }
```

---

## Finding EH-08: Socket Event Destructuring Throws on Null/Undefined Payload

**Severity:** HIGH
**Location:** Multiple handlers in `server/socket-io/main.js`
**CWE:** CWE-20 (Improper Input Validation)

### Description

Several socket handlers use destructuring on the incoming data parameter:

```js
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => { ... })
client.on('createRoom', async ({player}) => { ... })
client.on('fire', async ({angle, power, weaponId, startX, startY}) => { ... })
client.on('buyWeapon', ({weaponId}) => { ... })
client.on('createWeaponArray', ({count, max}) => { ... })
client.on('terrainPath', ({path, hostPos, playerPos}) => { ... })
```

If any of these events are emitted with `null`, `undefined`, a string, or a
number as the data payload, destructuring will throw:

```
TypeError: Cannot destructure property 'roomId' of 'undefined' as it is undefined.
```

Socket.IO does not validate message payloads before delivering them to handlers.

### Exploit Scenario

1. Attacker opens a raw WebSocket connection to the Socket.IO server.
2. Sends a properly framed Socket.IO `fire` event with payload `null`.
3. Destructuring `({angle, power, weaponId, startX, startY})` from `null`
   throws `TypeError`.
4. Since `fire` is async and has no try/catch, this becomes an unhandled
   promise rejection.
5. Depending on Node.js version (>= 15), unhandled rejections crash the
   process by default.
6. One malformed WebSocket message crashes the entire server.

### Recommendation

Add defensive guards at the top of each handler:

```js
client.on('fire', async (data) => {
    if (!data || typeof data !== 'object') return;
    const { angle, power, weaponId, startX, startY } = data;
    // ...
});
```

Or use a middleware/wrapper:

```js
function safeHandler(fn) {
    return (data, ...args) => {
        if (data === null || data === undefined || typeof data !== 'object') return;
        try {
            return fn(data, ...args);
        } catch (err) {
            console.error('Handler error:', err);
            trackError(err, 'socketHandler');
        }
    };
}
```

---

## Finding EH-09: `trackError()` Is Imported But Never Called

**Severity:** HIGH
**Location:** `server/socket-io/main.js:10` (import), entire file (never invoked)
**CWE:** CWE-778 (Insufficient Logging)

### Description

The `trackError` function is imported from `monitoring.js`:

```js
import { ..., trackError } from '../services/monitoring.js';
```

However, **it is never called anywhere in main.js or any other production
file**. Every `catch` block in the codebase uses `console.error` or
`console.warn` instead of routing errors to the monitoring service.

The monitoring service's `/stats` endpoint exposes an `errors` section:

```js
errors: {
    count: stats.errorCount,
    recent: stats.errors.slice(-5),
}
```

This section will always show `count: 0` and `recent: []` because no code ever
calls `trackError()`. The monitoring dashboard gives a false impression that the
server has zero errors.

### Evidence

All catch blocks in main.js:
- Line 84: `console.error('DB persist error:', err.message)`
- Line 105: `console.error('DB cancel error:', err.message)`
- Line 316: `console.warn('[Solana] Balance check skipped:', err.message)`
- Line 402: `console.warn('Match not persisted to DB:', err.message)`
- Line 825: `console.error('[Solana] Settlement error:', err.message)`

None call `trackError()`.

### Recommendation

Replace all `console.error` / `console.warn` in catch blocks with:

```js
catch (err) {
    console.error('Context:', err.message);
    trackError(err, 'contextDescription');
}
```

---

## Finding EH-10: Settlement Error Is Caught but Match Still Transitions to COMPLETE

**Severity:** HIGH
**Location:** `server/socket-io/main.js:813-831`
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

When the match ends, settlement is attempted inside a try/catch:

```js
try {
    const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount);
    settlementInfo = { wager: ws.amount, totalPot: ws.amount * 2, ... };
} catch (err) {
    console.error('[Solana] Settlement error:', err.message);
    settlementInfo = { error: err.message, wager: ws.amount };
}

// Lines 831-835: Regardless of settlement success/failure:
transitionState(ms, MATCH_STATES.COMPLETE);
trackMatchCompleted();
```

If settlement fails (when real on-chain transactions are implemented), the match
is still marked COMPLETE. The error is stored in `settlementInfo.error` and
broadcast to clients, but:

1. There is no retry mechanism.
2. The room is subsequently cleaned up (on next disconnect/leave), destroying
   the wager state.
3. The error message from `settleMatch` is broadcast directly to clients in the
   `matchEnd` event (line 858: `settlement: settlementInfo`), leaking internal
   error details.

### Exploit Scenario

1. Real settlement implementation calls Solana RPC.
2. RPC times out mid-transaction (network issue).
3. Settlement throws. Match transitions to COMPLETE.
4. Both players receive `matchEnd` with `settlement.error: "Transaction
   simulation failed: Blockhash not found"`.
5. Wager state is deleted on room cleanup. There is no mechanism to retry
   settlement or refund players.
6. The error message reveals internal Solana RPC details.

### Recommendation

1. On settlement failure, transition to a `SETTLEMENT_FAILED` state instead
   of `COMPLETE`.
2. Persist the failed settlement to a retry queue.
3. Sanitize error messages before sending to clients:
   ```js
   settlementInfo = { error: 'Settlement pending - please contact support', wager: ws.amount };
   ```
4. Implement a settlement retry mechanism (cron job or manual admin tool).

---

## Finding EH-11: MongoDB Disconnect Mid-Operation Causes Silent State Divergence

**Severity:** HIGH
**Location:** `server/socket-io/main.js:56-86` (persistRoom), `server/socket-io/main.js:384-404` (createRoom), `server/socket-io/main.js:89-108` (removeRoom)
**CWE:** CWE-544 (Missing Standardized Error Handling Mechanism)

### Description

The server uses an `isDbConnected()` check (line 13-15) before DB operations:

```js
function isDbConnected() {
    return mongoose.connection.readyState === 1;
}
```

When MongoDB disconnects:

1. `persistRoom()` silently returns without writing (line 57).
2. `createRoom()` creates the room in memory only, with no `_matchId` (line
   385-404).
3. `removeRoom()` cannot mark the room as cancelled in DB (line 101).

The server continues operating purely in-memory with no indication to clients
or operators that persistence is down. The `/health` endpoint does not check
MongoDB status. Mongoose's `readyState` can transition through 0 (disconnected),
2 (connecting), 3 (disconnecting) -- but the server only checks for `1`.

### Evidence

`/health` endpoint (monitoring.js:148-160) returns:
```json
{ "status": "ok", "uptime": "...", "activeConnections": "..." }
```
No database health is included.

### Recommendation

1. Add MongoDB status to health endpoint:
   ```js
   dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
   ```
2. Listen for Mongoose connection events to track and alert:
   ```js
   mongoose.connection.on('disconnected', () => trackError('MongoDB disconnected', 'database'));
   mongoose.connection.on('error', (err) => trackError(err, 'database'));
   ```
3. For wagered matches, require DB connectivity -- do not allow `createRoom`
   with wager > 0 when DB is disconnected.

---

## Finding EH-12: `handleAuthenticate` Destructures Without Validation

**Severity:** MEDIUM-HIGH
**Location:** `server/middleware/auth.js:117`
**CWE:** CWE-20 (Improper Input Validation)

### Description

```js
export function handleAuthenticate(client, { walletAddress, message, signature, timestamp }) {
```

If called with `null`, `undefined`, or an object missing these keys,
destructuring produces `undefined` values. Then:

- Line 119: `verifyAuthMessage(message, walletAddress, timestamp)` -- `message`
  is `undefined`, so `message !== expected` returns true, returning "Invalid
  message format". This is safe.
- But if `data` itself is `null` or a primitive, the destructuring throws
  `TypeError`.

In `main.js:170-176`:
```js
client.on('authenticate', (data) => {
    const result = handleAuthenticate(client, data)  // data could be null
```

The `authenticate` handler is NOT async, so this TypeError is thrown
synchronously. Socket.IO's connection-level error handling may or may not
catch this depending on version.

### Recommendation

Add a guard in the handler:
```js
client.on('authenticate', (data) => {
    if (!data || typeof data !== 'object') {
        client.emit('authResult', { success: false, reason: 'Invalid request' });
        return;
    }
    const result = handleAuthenticate(client, data);
    // ...
});
```

---

## Finding EH-13: Auth Error Response Leaks Internal Error Details

**Severity:** MEDIUM
**Location:** `server/middleware/auth.js:52-53`
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

### Description

```js
} catch (err) {
    return { valid: false, reason: `Verification error: ${err.message}` };
}
```

The catch block in `verifyWalletSignature` forwards the raw error message
to the client. This can leak:

- `atob()` DOMException messages revealing Node.js internals.
- `nacl.sign.detached.verify` error messages revealing cryptographic library.
- `PublicKey` constructor messages revealing `@solana/web3.js` internals.
- Stack fragments if `err.message` includes them.

### Recommendation

Return a generic message:
```js
} catch (err) {
    console.error('[Auth] Verification error:', err);
    return { valid: false, reason: 'Signature verification failed' };
}
```

---

## Finding EH-14: `verifyToken()` Leaks JWT Error Messages

**Severity:** MEDIUM
**Location:** `server/middleware/auth.js:100-107`
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

### Description

```js
export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, wallet: decoded.wallet };
    } catch (err) {
        return { valid: false, reason: err.message };
    }
}
```

JWT verification errors from jsonwebtoken include messages like:
- `"jwt malformed"` -- confirms JWT is used
- `"jwt expired"` -- confirms expiration is checked
- `"invalid signature"` -- confirms server-side verification
- `"jwt must be provided"` -- confirms token is required

While `verifyToken()` is currently not called from any socket handler (the JWT
is generated but never validated -- a separate finding), if it is wired up in
the future, these messages would leak to clients.

### Recommendation

Return generic message:
```js
return { valid: false, reason: 'Authentication failed' };
```

---

## Finding EH-15: `getBalance()` in solana.js Returns 0 on Error -- Ambiguous

**Severity:** MEDIUM
**Location:** `server/services/solana.js:196-206`
**CWE:** CWE-636 (Not Failing Securely)

### Description

```js
export async function getBalance(walletAddress) {
    const conn = getConnection();
    try {
        const pubkey = new PublicKey(walletAddress);
        const lamports = await conn.getBalance(pubkey);
        return lamports / LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('[Solana] Balance error:', err.message);
        return 0;
    }
}
```

Returning `0` on error is indistinguishable from a wallet that actually has
0 SOL. Any caller that relies on this value cannot differentiate between "RPC
failed" and "wallet is empty". This function is not currently called from
main.js, but `verifyBalance()` (which IS called) has the same pattern at
lines 95-102.

### Recommendation

Return an object with an error flag:
```js
return { balance: 0, error: true, message: err.message };
```

Or throw the error and let the caller handle it explicitly.

---

## Finding EH-16: `terrainPath` Handler Trusts Client Data for Server State

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:937-964`
**CWE:** CWE-20 (Improper Input Validation)

### Description

The legacy `terrainPath` handler blindly copies client-provided path data into
server state and then uses spread operators:

```js
client.on('terrainPath', ({path, hostPos, playerPos}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    room.terrainPath = [...path]          // crashes if path is not iterable
    room.host.pos = {...hostPos}          // crashes if room.host is null
    room.player.pos = {...playerPos}      // crashes if room.player is null
```

If `path` is `null`, `[...null]` throws `TypeError: null is not iterable`.
If `path` is a string, `[..."abc"]` produces `["a","b","c"]` which corrupts
terrain data. If `hostPos` is `undefined`, `{...undefined}` produces `{}` --
no crash but loses position data.

If `room.player` is `null` (player hasn't joined yet or just left),
`room.player.pos = {...playerPos}` throws TypeError.

### Recommendation

Validate that `path` is an array, `hostPos` and `playerPos` are objects with
numeric `x` and `y`, and `room.player` exists:

```js
if (!Array.isArray(path) || !hostPos || !playerPos) return;
if (!room.player) return;
```

---

## Finding EH-17: `createWeaponArray` Allows Client-Controlled Loop Size

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:645-659`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

### Description

```js
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return

    var x, randomArray = []
    for (let index = 0; index < count; index++) {
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }
```

`count` and `max` come directly from the client with no bounds checking.
If `count = 1e9`, the server creates an array with one billion elements,
consuming gigabytes of memory and blocking the event loop.

If `count` is `NaN` (e.g., the client sends a string), the loop condition
`NaN < NaN` is false, so the loop never executes -- benign but still
unexpected behavior.

### Recommendation

Validate and cap the inputs:
```js
const safeCount = Math.min(Math.max(0, Math.floor(Number(count) || 0)), 100);
const safeMax = Math.min(Math.max(1, Math.floor(Number(max) || 1)), 1000);
```

---

## Finding EH-18: No Rate Limiting on Any Socket Event

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js` (entire file)
**CWE:** CWE-799 (Improper Control of Interaction Frequency)

### Description

None of the 20+ socket event handlers have any rate limiting. A client can emit
events at maximum network speed. Key concerns:

- `fire`: Each call runs `processShot()` with up to 3000 trajectory steps.
  At 1000 events/second, this creates massive CPU load.
- `createRoom`: Each call creates a Match document in MongoDB. At high
  frequency, this saturates the database.
- `authenticate`: Each call runs `nacl.sign.detached.verify`, which is
  CPU-intensive. No rate limit allows brute-force attempts.
- `requestTerrain`: Each call generates terrain + tank positions.

### Recommendation

Implement per-socket rate limiting middleware:

```js
function rateLimit(socket, eventName, maxPerSecond) {
    const key = `_rl_${eventName}`;
    if (!socket[key]) socket[key] = { count: 0, resetAt: Date.now() + 1000 };
    const rl = socket[key];
    if (Date.now() > rl.resetAt) { rl.count = 0; rl.resetAt = Date.now() + 1000; }
    rl.count++;
    return rl.count <= maxPerSecond;
}
```

---

## Finding EH-19: `/stats` Endpoint Exposes Financial Data Without Authentication

**Severity:** MEDIUM
**Location:** `server/index.js:34` + `server/services/monitoring.js:166-211`
**CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)

### Description

```js
app.get('/stats', getStats)
```

The `/stats` endpoint is publicly accessible (no authentication) and returns:

```json
{
    "sol": {
        "totalWagered": "...",
        "totalSettled": "...",
        "treasuryFees": "...",
        "opsFees": "..."
    },
    "errors": {
        "count": 0,
        "recent": [...]
    }
}
```

This exposes:
1. Total SOL wagered and settled -- financial intelligence.
2. Treasury and operations fee amounts -- reveals fee structure.
3. Recent error messages and timestamps -- operational intelligence.
4. Server uptime and start time -- useful for timing attacks after restarts.
5. Active connection count -- useful for determining attack surface.

### Recommendation

Add authentication middleware to the `/stats` endpoint:
```js
app.get('/stats', requireAdminAuth, getStats);
```

At minimum, strip financial data and error details from the public response.

---

## Finding EH-20: Monitoring Error Array Is Unbounded in Practice

**Severity:** LOW
**Location:** `server/services/monitoring.js:130-140`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

### Description

```js
export function trackError(error, context) {
    stats.errorCount++;
    stats.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message || error,
        context,
    });
    if (stats.errors.length > 100) {
        stats.errors = stats.errors.slice(-100);
    }
}
```

While the array is capped at 100 entries, the cap uses `slice(-100)` which
creates a new array each time. Under rapid error conditions (e.g., MongoDB
disconnect causing errors on every persist), this repeatedly allocates arrays.

More importantly, since `trackError` is never actually called (see EH-09),
this is moot -- but if it were wired up and errors came in bursts, the
repeated slice + array creation could cause GC pressure.

Additionally, `stats.errorCount` is an unbounded integer. In theory, after
2^53 errors it would lose precision, but this is not practically exploitable.

### Recommendation

Use a ring buffer instead of slice:
```js
const MAX_ERRORS = 100;
stats.errors[stats.errorCount % MAX_ERRORS] = { ... };
```

---

## Finding EH-21: Floating-Point Arithmetic on SOL Amounts

**Severity:** MEDIUM
**Location:** `server/services/solana.js:121-127`
**CWE:** CWE-681 (Incorrect Conversion between Numeric Types)

### Description

```js
export function calculateSettlement(totalWagerSOL) {
    return {
        winner: totalWagerSOL * WINNER_SHARE,     // 0.1 * 0.90 = 0.09000000000000001
        treasury: totalWagerSOL * TREASURY_SHARE,  // 0.1 * 0.07 = 0.007000000000000001
        ops: totalWagerSOL * OPS_SHARE,            // 0.1 * 0.03 = 0.003
    };
}
```

JavaScript floating-point arithmetic produces imprecise results. For a total
pot of 0.1 SOL:
- winner: `0.09000000000000001` instead of `0.09`
- treasury: `0.007000000000000001` instead of `0.007`

When converted to lamports for on-chain transactions, these rounding errors
could cause: (a) underpayment/overpayment by 1 lamport, or (b) assertion
failures in the on-chain program that expects exact amounts.

### Recommendation

Use lamports (integers) for all calculations:
```js
export function calculateSettlement(totalWagerLamports) {
    const winner = Math.floor(totalWagerLamports * WINNER_SHARE);
    const treasury = Math.floor(totalWagerLamports * TREASURY_SHARE);
    const ops = totalWagerLamports - winner - treasury; // remainder to ops
    return { winner, treasury, ops };
}
```

---

## Finding EH-22: `removeRoom` Races with Active Handlers

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:89-108`
**CWE:** CWE-362 (Concurrent Execution Using Shared Resource with Improper Synchronization)

### Description

`removeRoom` is called from multiple places:
- `disconnect` handler (line 221)
- `leaveRoom` handler (line 263)
- `deleteRoom` handler (line 277)
- `joinRoom` handler (line 322, for the joiner's previous room)

It deletes from all in-memory stores:
```js
rooms = rooms.filter((r) => r.roomId !== roomId);
delete matchStates[roomId];
delete goldStates[roomId];
delete weaponInventories[roomId];
delete shopReady[roomId];
delete wagerStates[roomId];
```

While a `fire` handler might be mid-execution for the same room. The `fire`
handler reads `matchStates[roomId]`, `goldStates[roomId]`, and
`wagerStates[roomId]` throughout its execution. If `removeRoom` deletes these
while `fire` is between reads, the handler accesses `undefined` objects.

Example: `fire` handler reads `ms = matchStates[client.roomId]` at line 675
(not null). Then `removeRoom` deletes `matchStates[roomId]`. Then `fire`
accesses `ms.scores` at line 744 -- this still works (ms is a local
reference). But `goldStates[client.roomId]` at line 748 is now `undefined`.

### Recommendation

Use a room-level lock or check room existence before each critical section.
Alternatively, mark rooms as "being deleted" and check the flag in handlers.

---

## Finding EH-23: `shopTimer` Callback May Execute After Room Deletion

**Severity:** LOW-MEDIUM
**Location:** `server/socket-io/main.js:452-454, 498-500`
**CWE:** CWE-672 (Operation on a Resource after Expiration or Release)

### Description

```js
shopTimers[client.roomId] = setTimeout(() => {
    endShopPhase(io, client.roomId)
}, SHOP_DURATION * 1000)
```

The `client.roomId` is captured by closure. If the client disconnects and the
room is removed before the 30-second timer fires, `endShopPhase` is called with
a stale `roomId`. Inside `endShopPhase`:

```js
function endShopPhase(io, roomId) {
    if (shopTimers[roomId]) {
        clearTimeout(shopTimers[roomId]);
        delete shopTimers[roomId];
    }
    const room = findRoom(roomId)
    if (!room) return     // <-- this guard catches it
```

The guard on line 122 (`if (!room) return`) prevents a crash, but
`removeRoom` already clears `shopTimers[roomId]` (line 97-99), so the
timer should have been cancelled. However, there is a timing window where
the timer callback is already queued in the event loop microtask queue
before `clearTimeout` is called.

### Recommendation

The existing guard is sufficient but add a defensive log:
```js
const room = findRoom(roomId)
if (!room) {
    console.warn('[Shop] Timer fired for deleted room:', roomId);
    return;
}
```

---

## Finding EH-24: `playAgainRequest` Deletes Wager State Without Settlement Check

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:1004-1053`
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)

### Description

```js
client.on('playAgainRequest', () => {
    // ...
    delete wagerStates[client.roomId]
    // ...
})
```

When both players agree to play again, the entire wager state is deleted
(line 1019, 1043). There is no check that the previous match was settled.
If a settlement error occurred (EH-10), the wager data needed for a retry
is permanently destroyed.

### Recommendation

Only delete wager state if the match was successfully settled or was a
free-play match:
```js
const ws = wagerStates[client.roomId];
const ms = matchStates[client.roomId];
if (ws && ws.amount > 0 && ms && ms.status !== MATCH_STATES.COMPLETE) {
    // Previous match wasn't settled -- cannot play again
    client.emit('error', { reason: 'Previous match settlement pending' });
    return;
}
```

---

## Finding EH-25: No Input Validation on `buyWeapon` weaponId Type

**Severity:** LOW-MEDIUM
**Location:** `server/socket-io/main.js:515`
**CWE:** CWE-20 (Improper Input Validation)

### Description

```js
client.on('buyWeapon', ({weaponId}) => {
    // ...
    const weapon = getWeapon(weaponId)
    if (!weapon) { ... return }
```

If `weaponId` is a string like `"0"`, `getWeapon("0")` accesses
`WEAPON_CATALOG["0"]` which works due to JavaScript's property access coercion.
If `weaponId` is an object, it is coerced via `toString()`, which could
produce `"[object Object]"` -- `getWeapon` returns null, so the buy is
rejected safely.

If `weaponId` is `"__proto__"` or `"constructor"`, the lookup accesses
`WEAPON_CATALOG["__proto__"]` which returns `undefined` -- safe because
`WEAPON_CATALOG` is a plain object literal.

The `inventory[client.id].includes(weaponId)` check on line 534 could behave
unexpectedly with type coercion (e.g., `[0].includes("0")` returns false),
allowing a player to "re-buy" a weapon they already own if they send the ID
as a string. However, since `getWeapon` returns the same weapon object
regardless of type coercion, the practical impact is limited to having
duplicate entries in the inventory array.

### Recommendation

Coerce to integer:
```js
const wId = Number(weaponId);
if (!Number.isInteger(wId)) {
    client.emit('buyWeaponResult', { success: false, reason: 'Invalid weapon ID' });
    return;
}
```

---

## Finding EH-26: Express JSON Body Parser Has 30MB Limit

**Severity:** LOW
**Location:** `server/index.js:23-24`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

### Description

```js
app.use(express.json({limit: "30mb", extended: true}))
app.use(express.urlencoded({limit: "30mb", extended: true}))
```

The Express JSON parser allows bodies up to 30MB. The server only has two
HTTP endpoints (`/health` and `/stats`), neither of which accepts POST data.
The 30MB limit is unnecessary and could be exploited to send large payloads
that consume memory. While these endpoints are GET-only, Express still
parses request bodies for all methods by default.

### Recommendation

Reduce the body size limit to a reasonable maximum (e.g., 1MB or 100KB):
```js
app.use(express.json({ limit: '100kb' }))
```

---

## Summary Table

| ID    | Severity      | Location                          | Description                                                |
|-------|---------------|-----------------------------------|------------------------------------------------------------|
| EH-01 | CRITICAL      | index.js (absent)                 | No uncaughtException/unhandledRejection handlers           |
| EH-02 | CRITICAL      | main.js:671-872                   | `fire` handler has no top-level try/catch                  |
| EH-03 | HIGH          | auth.js:37                        | `atob()` platform-dependent, leaks error details           |
| EH-04 | HIGH          | solana.js:95 + main.js:305-317    | Balance check fail-open allows zero-balance wager joins    |
| EH-05 | HIGH          | main.js:56-86                     | `persistRoom()` fails silently, data loss on restart       |
| EH-06 | HIGH          | main.js:180-229, 233-270          | disconnect/leaveRoom no try/catch, zombie rooms            |
| EH-07 | HIGH          | physics.js:421 + main.js:725      | NaN/Infinity inputs produce garbage trajectory + CPU DoS   |
| EH-08 | HIGH          | main.js (multiple handlers)       | Null payload destructuring crashes server                  |
| EH-09 | HIGH          | main.js:10                        | `trackError()` imported but never called                   |
| EH-10 | HIGH          | main.js:813-831                   | Settlement failure still transitions to COMPLETE           |
| EH-11 | HIGH          | main.js:56-86, 384-404            | MongoDB disconnect causes silent state divergence          |
| EH-12 | MEDIUM-HIGH   | auth.js:117                       | `handleAuthenticate` destructures without null check       |
| EH-13 | MEDIUM        | auth.js:52-53                     | Auth error response leaks internal error details           |
| EH-14 | MEDIUM        | auth.js:100-107                   | `verifyToken()` leaks JWT library error messages           |
| EH-15 | MEDIUM        | solana.js:196-206                 | `getBalance()` returns 0 on error -- ambiguous             |
| EH-16 | MEDIUM        | main.js:937-964                   | `terrainPath` handler crashes on null/non-array path       |
| EH-17 | MEDIUM        | main.js:645-659                   | `createWeaponArray` loop size controlled by client         |
| EH-18 | MEDIUM        | main.js (entire file)             | No rate limiting on any socket event                       |
| EH-19 | MEDIUM        | index.js:34 + monitoring.js:166   | `/stats` exposes financial data without auth               |
| EH-20 | LOW           | monitoring.js:130-140             | Error array cap uses repeated slice allocation             |
| EH-21 | MEDIUM        | solana.js:121-127                 | Floating-point arithmetic on SOL amounts                   |
| EH-22 | MEDIUM        | main.js:89-108                    | `removeRoom` races with active fire handlers               |
| EH-23 | LOW-MEDIUM    | main.js:452-454                   | Shop timer callback after room deletion                    |
| EH-24 | MEDIUM        | main.js:1004-1053                 | `playAgainRequest` deletes wager state without check       |
| EH-25 | LOW-MEDIUM    | main.js:515                       | No type validation on `buyWeapon` weaponId                 |
| EH-26 | LOW           | index.js:23-24                    | 30MB JSON body parser limit is excessive                   |

## Severity Distribution

- **CRITICAL:** 2
- **HIGH:** 9
- **MEDIUM-HIGH:** 1
- **MEDIUM:** 8
- **LOW-MEDIUM:** 3
- **LOW:** 3

## Top Priority Remediation

1. **Add global exception handlers** (EH-01) -- single most impactful fix.
2. **Wrap all async socket handlers in try/catch** (EH-02, EH-06, EH-08) --
   prevents any single malformed message from crashing the server.
3. **Wire up trackError()** (EH-09) -- enables monitoring to detect all
   other issues.
4. **Replace atob() with Buffer.from()** (EH-03) -- platform correctness.
5. **Fix fail-open balance check** (EH-04) -- prevents zero-balance wager joins.
6. **Add numeric input validation to fire handler** (EH-07) -- prevents NaN
   propagation and CPU abuse.
7. **Implement settlement retry on failure** (EH-10) -- critical for when
   real on-chain settlement is deployed.
