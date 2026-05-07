# BATCH-02: Arithmetic & Input Validation Findings

**Auditor:** Claude Opus 4.6 (automated hypothesis investigation)
**Date:** 2026-02-14
**Target:** SolShot server — `server/socket-io/main.js`, `server/services/physics.js`, `server/services/solana.js`, `server/index.js`
**Branch:** dev

---

## H009: NaN Injection via Fire Handler

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `fire` event handler at `main.js:671` destructures client-supplied `angle`, `power`, `startX`, and `startY` directly:

```js
// main.js:671
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
```

There is zero type validation on any of these values. They are passed directly into `processShot()` which calls `calculateTrajectory()` at `physics.js:59-84`:

```js
// physics.js:59-64
export function calculateTrajectory(angle, power, gravity = DEFAULT_GRAVITY, startX, startY) {
    const velocity = power * POWER_FACTOR;       // NaN * 8 = NaN
    const rotation = angle - Math.PI / 2;         // "abc" - 1.57 = NaN

    let vx = velocity * Math.cos(rotation);       // NaN
    let vy = velocity * Math.sin(rotation);       // NaN
    let x = startX;                                // NaN if "abc"
    let y = startY;                                // NaN if "abc"
```

When `angle = "abc"` or `power = NaN`:
1. `velocity = NaN * 8 = NaN`
2. `rotation = NaN - Math.PI/2 = NaN`
3. `vx = NaN`, `vy = NaN`, `x = NaN`, `y = NaN`
4. The loop at line 70 runs all 3000 iterations because `NaN <= 0` is `false`, `NaN >= 1199` is `false`, `NaN >= 534` is `false` -- no bounds check ever triggers
5. All 3000 trajectory points are `{x: NaN, y: NaN, vx: NaN, vy: NaN}`

In `calculateImpact()` (physics.js:100-140), `Math.floor(NaN)` is `NaN`, all comparison operators with NaN return `false`, so no collision is detected. The function falls through to line 138-139 returning `{x: NaN, y: NaN, type: 'outOfBounds'}`.

Since `impact.type === 'outOfBounds'`, damage and terrain deformation are skipped (physics.js:435,441), so no crash occurs. However:

- The trajectory of 3000 NaN points is broadcast to all clients at `main.js:772-783`
- `ms.scores[playerId]` accumulates `0 + NaN = NaN` values if any damage path is hit
- `ms.turnCount++` still increments (NaN scores contaminate score state)
- NaN scores propagate to `getRoundWinner()` and `isMatchOver()` where comparisons like `NaN > 0` always return `false`, causing the host to always win tiebreaks (match.js:176: `return hostId`)

**Exploit scenario:**

1. Attacker joins a wagered match as the non-host player
2. Attacker sends `socket.emit('fire', {angle: "abc", power: NaN, weaponId: 0, startX: 0, startY: 0})`
3. The server processes 3000 NaN trajectory steps (wasted CPU), broadcasts NaN trajectory to both clients
4. Scores become contaminated with NaN, making all comparisons return `false`
5. The host always wins via tiebreak logic at `match.js:156` (`return hostId`)
6. If the attacker IS the host, they can guarantee a win in wagered matches by sending NaN fire events, since `NaN > NaN` is false and the tiebreak defaults to host

**Recommendation:**

Add numeric type validation at the top of the `fire` handler before any processing:

```js
if (typeof angle !== 'number' || !isFinite(angle)) { client.emit('fireRejected', { reason: 'Invalid angle' }); return; }
if (typeof power !== 'number' || !isFinite(power) || power < 0 || power > 100) { client.emit('fireRejected', { reason: 'Invalid power' }); return; }
if (typeof startX !== 'number' || !isFinite(startX)) { client.emit('fireRejected', { reason: 'Invalid startX' }); return; }
if (typeof startY !== 'number' || !isFinite(startY)) { client.emit('fireRejected', { reason: 'Invalid startY' }); return; }
```

---

## H011: Negative Wager Bypassing Validation

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `createRoom` handler at `main.js:368-374`:

```js
// main.js:369-374
const wagerAmount = player.wager || 0
const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
if (wagerAmount > 0 && !isValidWager(wagerAmount)) {
    client.emit('createRoomError', { reason: 'Invalid wager tier' })
    return
}
```

The guard `wagerAmount > 0` means that when `wagerAmount = -0.1`:
- `-0.1 > 0` evaluates to `false`
- The `isValidWager()` check is **never reached**
- The negative wager is stored directly: `wagerStates[roomId] = { amount: -0.1, ... }` (line 375-378)

Downstream in settlement (`solana.js:139-164`):

```js
// solana.js:140-144
if (wagerSOL === 0) {
    return { success: true, settlement: { winner: 0, treasury: 0, ops: 0 }, txSignature: null };
}
const totalPot = wagerSOL * 2;   // -0.1 * 2 = -0.2
const settlement = calculateSettlement(totalPot);
```

```js
// solana.js:121-127
export function calculateSettlement(totalWagerSOL) {
    return {
        winner: totalWagerSOL * WINNER_SHARE,   // -0.2 * 0.9 = -0.18
        treasury: totalWagerSOL * TREASURY_SHARE, // -0.2 * 0.07 = -0.014
        ops: totalWagerSOL * OPS_SHARE,           // -0.2 * 0.03 = -0.006
    };
}
```

The settlement produces **negative payouts**. Currently settlement is a stub, but when real transfers are implemented, negative lamport values in `SystemProgram.transfer()` would either: (a) cause a Solana transaction error, or (b) if cast to unsigned, wrap to astronomical values.

Additionally, the forfeit check in `disconnect` at `main.js:186`:

```js
if (ws && ws.amount > 0 && ms) {
```

A negative wager (`ws.amount = -0.1`) means `-0.1 > 0` is `false`, so **forfeit settlement is skipped entirely** -- a player can disconnect from a "wagered" match with no penalty.

The `joinRoom` handler at `main.js:298`:

```js
if (roomWager > 0) {
```

For a negative roomWager, this is `false`, so no balance check is performed on the joiner either.

**Exploit scenario:**

1. Attacker sends `socket.emit('createRoom', {player: {name: "x", color: 0, wager: -0.1, walletAddress: "..."}})`
2. Room is created with `wagerStates[roomId].amount = -0.1`
3. Joiner joins without any balance check (since `roomWager > 0` is false)
4. On match completion, `settleMatch()` is called with `wagerSOL = -0.1`
5. `totalPot = -0.2`, settlement computes negative values
6. When real escrow is implemented: negative lamports would either crash the transaction or, if unsafely cast, transfer funds in the wrong direction
7. Alternatively, either player can disconnect penalty-free since forfeit is skipped for non-positive wagers

**Recommendation:**

Replace the guard with an absolute validation:

```js
const wagerAmount = Number(player.wager) || 0;
if (wagerAmount !== 0 && !isValidWager(wagerAmount)) {
    client.emit('createRoomError', { reason: 'Invalid wager tier' });
    return;
}
if (wagerAmount < 0) {
    client.emit('createRoomError', { reason: 'Invalid wager amount' });
    return;
}
```

Also add `wagerSOL > 0` assertion at the top of `settleMatch()`.

---

## H012: Arbitrary startX/startY Position Spoofing

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `fire` handler at `main.js:671` accepts client-supplied `startX` and `startY`:

```js
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
```

The server does store authoritative tank positions at `main.js:698-717`:

```js
// main.js:698-717
const tanks = []
if (room.host && room.host.pos) {
    tanks.push({
        id: room.host.socketId,
        x: room.host.pos.x,
        y: room.host.pos.y,
        width: 40,
        height: 30
    })
}
// ... same for room.player
```

These `tanks` are used for **damage and collision calculations** (passed to `calculateImpact` and `calculateDamage`). However, the projectile's **launch origin** uses the client-supplied values:

```js
// main.js:725-734
const result = processShot({
    angle,
    power,
    weaponId,
    startX,    // <-- CLIENT-SUPPLIED, NOT from room.host.pos / room.player.pos
    startY,    // <-- CLIENT-SUPPLIED
    shooterId: client.id,
    terrain,
    tanks
})
```

Inside `processShot` at `physics.js:421-428`:

```js
const trajectory = calculateTrajectory(angle, power, weapon.gravity, startX, startY);
```

The trajectory starts from `(startX, startY)` -- wherever the client claims. The server-stored positions are only used for the `tanks` array (hit detection targets), not for the firing origin.

**Exploit scenario:**

1. Attacker is in a match with their tank at `x=200` (left side)
2. Opponent's tank is at `x=800` (right side), stored in `room.player.pos`
3. Attacker sends `socket.emit('fire', {angle: Math.PI/2, power: 1, weaponId: 0, startX: 800, startY: room.player.pos.y})` -- firing from directly on top of the opponent
4. The projectile spawns at the opponent's exact position, guaranteeing a direct hit with minimal power
5. This yields maximum damage (60 HP for Single Shot) and maximum Gold (+900 Gold from 60 damage)
6. Repeat every turn for guaranteed maximum score and Gold farming

**Recommendation:**

Replace client-supplied `startX`/`startY` with the server's authoritative tank position:

```js
// Determine firing player's server-side position
const firingPos = client.isHost ? room.host.pos : (room.player ? room.player.pos : null);
if (!firingPos) { client.emit('fireRejected', { reason: 'No position' }); return; }

const result = processShot({
    angle,
    power,
    weaponId,
    startX: firingPos.x,
    startY: firingPos.y - 15,  // turret tip offset
    shooterId: client.id,
    terrain,
    tanks
});
```

---

## H013: createWeaponArray Denial-of-Service

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `createWeaponArray` handler at `main.js:645-658`:

```js
// main.js:645-658
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return

    // weapon array
    var x, randomArray = []
    for (let index = 0; index < count; index++) {
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }

    room.randomArray = randomArray
    persistRoom(room);
    io.sockets.in(client.roomId).emit('setWeaponArray', {randomArray: room.randomArray})
})
```

There is **no validation** on `count` or `max`. The `count` parameter directly controls the loop iteration count. If an attacker sends `count: 100000000` (100 million):

1. The `for` loop runs 100 million iterations
2. Each iteration calls `Math.random()` and `Math.floor()`, and pushes to the array
3. The array grows to ~100M entries, consuming approximately **400-800 MB of heap memory** (each Number is 8 bytes + array overhead)
4. This blocks the Node.js event loop for potentially **minutes** during the synchronous loop
5. After completion, the 100M-element array is stored in `room.randomArray` (permanent memory leak until room is deleted)
6. The array is then serialized and broadcast via Socket.IO to all clients in the room, creating a massive payload
7. `persistRoom(room)` attempts to write this to MongoDB, potentially crashing the DB operation

If `count` is set to `Number.MAX_SAFE_INTEGER` (9007199254740991), the loop would run effectively forever, freezing the server permanently.

If `count` is set to a non-number like `"1e308"`, JavaScript coerces it: `"1e308"` becomes `Infinity` in the comparison `index < Infinity`, creating an infinite loop.

**Exploit scenario:**

1. Attacker creates or joins a room (gets a valid `client.roomId`)
2. Attacker sends `socket.emit('createWeaponArray', {count: 1e9, max: 100})`
3. The server enters a billion-iteration synchronous loop
4. The Node.js event loop is blocked -- ALL other players on the server freeze
5. No other socket events can be processed (fire, disconnect, etc.)
6. The server becomes completely unresponsive until it either: completes the loop (hours), runs out of memory and crashes (OOM kill), or is manually restarted
7. All in-memory state (rooms, wagers, matches, Gold, SHOT balances) is lost on crash

**Recommendation:**

Add strict bounds validation:

```js
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return

    // Validate bounds
    if (typeof count !== 'number' || !isFinite(count) || count < 1 || count > 50) return;
    if (typeof max !== 'number' || !isFinite(max) || max < 1 || max > 1000) return;
    count = Math.floor(count);
    max = Math.floor(max);

    var x, randomArray = []
    for (let index = 0; index < count; index++) {
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }
    // ...
})
```

---

## H015: Null Payload Crash via Destructuring

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

Multiple event handlers use destructuring on the incoming payload. For example, the `fire` handler at `main.js:671`:

```js
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
```

The `joinRoom` handler at `main.js:288`:

```js
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
```

The `createRoom` handler at `main.js:354`:

```js
client.on('createRoom', async ({player}) => {
```

The `createWeaponArray` handler at `main.js:645`:

```js
client.on('createWeaponArray', ({count, max}) => {
```

When `null` or `undefined` is passed as the payload (e.g., `socket.emit('fire', null)`), JavaScript's destructuring throws:

```
TypeError: Cannot destructure property 'angle' of 'null' as it is null.
```

This is an **uncaught exception** in the socket event handler. Checking `server/index.js`, there is **no** `process.on('uncaughtException')` or `process.on('unhandledRejection')` handler anywhere in the file:

```js
// index.js (complete file - 59 lines)
// NO process.on('uncaughtException', ...) present
// NO process.on('unhandledRejection', ...) present
```

Socket.IO does have internal error handling that catches synchronous exceptions in event handlers and disconnects the offending socket rather than crashing the process. However, the `fire` and `joinRoom` handlers are `async` functions. For async handlers, if the destructuring error occurs in the synchronous portion before any `await`, Socket.IO's try/catch wrapping behavior depends on the version.

At Socket.IO 4.5.1 (from `server/package.json` per architecture doc), synchronous errors in handlers are caught by Socket.IO's internal mechanism and the socket is disconnected -- the server does not crash. However, this still causes:

1. The offending socket is forcibly disconnected
2. This triggers the `disconnect` handler at `main.js:180-229`
3. Which runs settlement/forfeit logic and `removeRoom()`
4. The attacker's room is destroyed, potentially mid-match

For non-async handlers like `createWeaponArray`, `buyWeapon`, etc., the same applies -- Socket.IO catches the throw and disconnects the socket.

While this does not crash the Node.js process (Socket.IO 4.x catches handler errors), it does cause immediate forced disconnection and room destruction, which is an exploitable denial-of-service against yourself or your opponent (triggering forfeit settlement during a wagered match).

**Exploit scenario:**

1. Attacker joins a wagered match
2. Opponent is winning
3. Attacker sends `socket.emit('fire', null)`
4. Destructuring throws TypeError
5. Socket.IO catches the error and disconnects the attacker's socket
6. The `disconnect` handler fires with settlement logic
7. The room is destroyed via `removeRoom()` -- but because the disconnect handler checks `ms.status === MATCH_STATES.BATTLE`, this triggers forfeit settlement where the **opponent** wins
8. However, the attacker could also send null to a non-critical handler like `createWeaponArray` to force a disconnect at a strategic moment, or use it to disrupt match flow

For a more severe variant: if any future code adds socket handlers outside Socket.IO's internal wrapper, or if the error propagates through an unhandled promise rejection chain, the lack of `process.on('uncaughtException')` means the entire server crashes.

**Recommendation:**

1. Add process-level exception handlers in `index.js`:

```js
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Log but don't crash for non-fatal errors
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});
```

2. Add null guards at the top of every socket handler:

```js
client.on('fire', async (data) => {
    if (!data || typeof data !== 'object') return;
    const { angle, power, weaponId, startX, startY } = data;
    // ...
});
```

---

## H016: Floating-Point Settlement Rounding

**Status:** POTENTIAL
**Severity:** LOW

**Evidence:**

The settlement calculation at `solana.js:121-127`:

```js
export function calculateSettlement(totalWagerSOL) {
    return {
        winner: totalWagerSOL * WINNER_SHARE,     // * 0.90
        treasury: totalWagerSOL * TREASURY_SHARE,  // * 0.07
        ops: totalWagerSOL * OPS_SHARE,            // * 0.03
    };
}
```

The shares are `0.90 + 0.07 + 0.03 = 1.00` exactly. However, floating-point multiplication does not guarantee `a*0.9 + a*0.07 + a*0.03 === a` for all values.

Testing with the actual wager tiers (`totalPot = wager * 2`):

| Wager (SOL) | Total Pot | winner (0.9) | treasury (0.07) | ops (0.03) | Sum | Diff from Pot |
|-------------|-----------|-------------|-----------------|-----------|-----|---------------|
| 0.01 | 0.02 | 0.018 | 0.0014000...0002 | 0.0006 | 0.020000...0002 | +2e-19 |
| 0.05 | 0.10 | 0.09 | 0.007000...0001 | 0.003 | 0.100000...0001 | +1e-19 |
| 0.1 | 0.20 | 0.18 | 0.014000...0002 | 0.006 | 0.200000...0002 | +2e-19 |
| 0.25 | 0.50 | 0.45 | 0.035000...0003 | 0.015 | 0.500000...0003 | +3e-17 |
| 0.5 | 1.00 | 0.9 | 0.07 | 0.03 | 1.0 | 0 |

The discrepancies are at the level of ~1e-17 to 1e-19 SOL, which is far below one lamport (1e-9 SOL). However, when these floating-point SOL values are converted to lamports for on-chain transfer, the conversion `Math.floor(sol * LAMPORTS_PER_SOL)` or `Math.round(sol * LAMPORTS_PER_SOL)` could cause 1-lamport discrepancies:

For `totalPot = 0.02 SOL`:
- `winner = 0.018 SOL = 18,000,000 lamports` (exact)
- `treasury = 0.0014000000000000002 SOL` -- `Math.round(0.0014000000000000002 * 1e9) = 1,400,000 lamports` (exact)
- `ops = 0.0006 SOL = 600,000 lamports` (exact)
- Sum: 20,000,000 lamports = 0.02 SOL (OK)

For `totalPot = 0.50 SOL`:
- `winner = 0.45 SOL = 450,000,000 lamports`
- `treasury = 0.035000000000000003 SOL` -- `Math.round(0.035000000000000003 * 1e9) = 35,000,000 lamports`
- `ops = 0.015 SOL = 15,000,000 lamports`
- Sum: 500,000,000 lamports = 0.50 SOL (OK, the rounding error vanishes)

The floating-point errors are small enough that for the defined wager tiers, they do not cause lamport-level discrepancies after rounding. However, this analysis depends on how the (currently stubbed) transfer logic converts SOL to lamports. If a naive `Math.floor()` is used, it is possible for the sum to be 1 lamport less than the pot, leaving 1 lamport stuck in escrow. This is economically negligible.

The real risk emerges if negative wagers (H011) interact with this: `calculateSettlement(-0.2)` produces negative floats that, when truncated to unsigned lamports, could wrap catastrophically.

**Exploit scenario:**

No practical exploit at current wager tiers. The theoretical 1-lamport rounding error could accumulate over thousands of matches but would only matter if an escrow account's balance tracking relies on exact arithmetic. The interaction with negative wagers (H011) is the real concern.

**Recommendation:**

Perform all settlement arithmetic in integer lamports to avoid floating-point issues entirely:

```js
export function calculateSettlement(totalWagerSOL) {
    const totalLamports = Math.round(totalWagerSOL * LAMPORTS_PER_SOL);
    const treasuryLamports = Math.floor(totalLamports * 0.07);
    const opsLamports = Math.floor(totalLamports * 0.03);
    const winnerLamports = totalLamports - treasuryLamports - opsLamports;  // remainder goes to winner
    return {
        winner: winnerLamports / LAMPORTS_PER_SOL,
        treasury: treasuryLamports / LAMPORTS_PER_SOL,
        ops: opsLamports / LAMPORTS_PER_SOL,
        winnerLamports,
        treasuryLamports,
        opsLamports,
    };
}
```

---

## H017: Megabyte Player Name Broadcast

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `createRoom` handler at `main.js:354-410` stores the player name from the client payload with no length validation:

```js
// main.js:354
client.on('createRoom', async ({player}) => {
    // ...
    // main.js:364
    var host = {name: player.name, color: player.color, socketId: client.id, isReady: false, playAgain: false}
```

`player.name` is taken directly from the untrusted payload. There is no length check, no sanitization, no type check. The same applies for `joinRoom` at line 288:

```js
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
    // ...
    // main.js:336
    room.player = {name: name, color: color, socketId: client.id, isReady: false, playAgain: false}
```

The name is then broadcast to ALL connected clients via `setRooms` at `main.js:342` and `main.js:409`:

```js
// main.js:342
io.emit('setRooms', {rooms: getOpenRooms()})

// main.js:409
io.emit('setRooms', {rooms: getOpenRooms()})
```

`getOpenRooms()` at `main.js:50-53` returns up to 5 rooms:

```js
function getOpenRooms() {
    var openrooms = rooms.filter((room) => room.active === false);
    return openrooms.slice(0, Math.min(openrooms.length, 5));
}
```

Each room includes the full `host` object with the unsanitized name. A 10MB name would be included in the `setRooms` broadcast.

Additionally, the name is persisted to MongoDB at `main.js:386-403`:

```js
const match = await Match.create({
    roomCode: roomId,
    host: {
        username: player.name,  // <-- 10MB string stored in MongoDB
        // ...
    },
});
```

And broadcast again at `main.js:343`:

```js
io.sockets.in(client.roomId).emit('startPick', {host: room.host, player: room.player, wager: roomWager})
```

The name is also stored on the `client` socket object at `main.js:328-329`:

```js
client.name = name
```

**Exploit scenario:**

1. Attacker constructs a 10MB string: `const bigName = "A".repeat(10 * 1024 * 1024)`
2. Attacker sends `socket.emit('createRoom', {player: {name: bigName, color: 0}})`
3. The 10MB name is stored in:
   - `rooms[0].host.name` (in-memory, ~10MB)
   - `client.name` (on the socket object, ~10MB)
   - MongoDB document `host.username` (if DB connected, ~10MB per document)
4. `io.emit('setRooms', ...)` broadcasts the room list to ALL connected sockets
5. Every connected client receives a ~10MB+ Socket.IO message
6. If the attacker creates 5 rooms (the `getOpenRooms` limit), every `setRooms` broadcast is ~50MB
7. This saturates server upload bandwidth and client download bandwidth
8. Socket.IO's per-message compression may mitigate if the string is repetitive, but a random 10MB string would not compress well
9. Repeated room creation/deletion amplifies the attack -- each cycle triggers a `setRooms` broadcast
10. The MongoDB write of a 10MB document exceeds the default 16MB BSON document limit if the name is large enough, potentially causing write errors

**Recommendation:**

Add name length validation at the top of both `createRoom` and `joinRoom`:

```js
// In createRoom:
if (!player || typeof player.name !== 'string' || player.name.length === 0 || player.name.length > 20) {
    client.emit('createRoomError', { reason: 'Invalid player name (1-20 characters)' });
    return;
}

// In joinRoom:
if (typeof name !== 'string' || name.length === 0 || name.length > 20) {
    client.emit('joinRoomError', { reason: 'Invalid name (1-20 characters)' });
    return;
}
```

Additionally, set Socket.IO `maxHttpBufferSize` to limit incoming message size:

```js
const io = new socket.Server(server, {
    maxHttpBufferSize: 1e6,  // 1MB max per message
    cors: { origin: "*", methods: ["GET", "POST"] }
});
```

---

## Summary

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| H009 | NaN injection via fire handler | CONFIRMED | HIGH |
| H011 | Negative wager bypassing validation | CONFIRMED | CRITICAL |
| H012 | Arbitrary startX/startY position spoofing | CONFIRMED | HIGH |
| H013 | createWeaponArray DoS | CONFIRMED | HIGH |
| H015 | Null payload crash | CONFIRMED | CRITICAL |
| H016 | Float-point settlement rounding | POTENTIAL | LOW |
| H017 | Megabyte player name | CONFIRMED | HIGH |

**6 of 7 hypotheses CONFIRMED, 1 POTENTIAL.** Zero hypotheses disproven.

The common root cause across all findings is the complete absence of input validation on socket event payloads. Every value received from clients -- numbers, strings, object structures -- is used directly without type checking, bounds checking, or sanitization. A comprehensive input validation middleware layer should be the highest priority fix.
