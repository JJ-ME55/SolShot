# 01 - Access Control Audit

**Auditor**: Claude Opus 4.6 (automated static analysis)
**Date**: 2026-02-14
**Scope**: All server-side source files in `server/`
**Focus**: Authentication enforcement, authorization checks, role-based access, privilege escalation

---

## Executive Summary

The SolShot server has **no enforced authentication on any socket event** and **no authorization middleware on HTTP endpoints**. Authentication exists as an optional client-initiated ceremony (`authenticate` event) but is never required before executing privileged actions such as creating wagered matches, joining rooms, firing weapons, or deleting rooms. Every socket event handler operates on a trust-the-client model. The `/stats` HTTP endpoint exposes financial and operational telemetry to the public internet without any authentication.

**Total findings**: 14
- CRITICAL: 5
- HIGH: 5
- MEDIUM: 3
- LOW: 1

---

## Inventory: All Endpoints and Socket Events

### HTTP Endpoints (server/index.js)

| Endpoint | Auth Required? | Auth Enforced? | Notes |
|---|---|---|---|
| `GET /` | No | N/A | Status page, harmless |
| `GET /health` | No | No | Health check, low risk |
| `GET /stats` | **Should be** | **No** | Exposes SOL financial data, error logs |

### Socket Events (server/socket-io/main.js)

| Event | Auth Required? | Auth Enforced? | Host-Only? | Host Check? | State Check? |
|---|---|---|---|---|---|
| `authenticate` | N/A | N/A | No | N/A | No |
| `createRoom` | For wagers | **No** | N/A | N/A | No |
| `joinRoom` | For wagers | **No** | No | N/A | No |
| `deleteRoom` | Yes | **No** | **Yes** | **No** | No |
| `leaveRoom` | No | N/A | No | N/A | No |
| `getRooms` | No | N/A | No | N/A | No |
| `ready` | No | No | No | Partial | No |
| `buyWeapon` | No | No | No | N/A | Yes |
| `shopDone` | No | No | No | N/A | Yes |
| `fire` | No | No | No | N/A | Yes (turn) |
| `requestTerrain` | No | No | No | No | No |
| `createWeaponArray` | No | No | No | No | No |
| `terrainPath` | No | No | No | No | No |
| `playAgainRequest` | No | No | No | Partial | No |
| `getShotInfo` | Optional | No | No | N/A | No |
| `prestigeBurn` | Yes | Partial | No | N/A | No |
| `shoot` (legacy) | No | No | No | No | No |
| `weaponPick` | No | No | No | No | No |
| `weaponChange` | No | No | No | No | No |
| `angleChange` | No | No | No | No | No |
| `powerChange` | No | No | No | No | No |
| `stepLeft` | No | No | No | No | No |
| `stepRight` | No | No | No | No | No |
| `giveTurn` | No | No | No | No | No |
| `requestTurn` | No | No | No | No | No |
| `getWeaponArray` | No | No | No | No | No |
| `getTerrainPath` | No | No | No | No | No |

---

## Findings

---

### AC-01: JWT Generated But Never Validated on Subsequent Events

**Severity**: CRITICAL
**Location**: `server/middleware/auth.js:86-92`, `server/socket-io/main.js:170-177`
**CWE**: CWE-306 (Missing Authentication for Critical Function)

**Description**:
The `handleAuthenticate` function generates a JWT token (line 131 of auth.js) and returns it to the client, but no socket event handler ever calls `verifyToken()` to validate the JWT on subsequent requests. The `verifyToken` function exists (auth.js:100-107) but is exported and never imported or used anywhere in the codebase. Authentication is purely ceremonial -- the server marks `client.isAuthenticated = true` and `client.walletAddress` on the socket object, but no event handler checks `client.isAuthenticated` before executing.

**Evidence**:
```
// auth.js:131 - Token generated
const token = generateToken(walletAddress);

// main.js:170-176 - authenticate event stores state but nothing checks it
client.on('authenticate', (data) => {
    const result = handleAuthenticate(client, data)
    if (result.success) {
        authenticatedWallets[client.id] = result.walletAddress
    }
    client.emit('authResult', result)
})
```

No event handler contains `if (!client.isAuthenticated)` or calls `verifyToken()`.

**Exploit Scenario**:
An attacker connects a raw WebSocket client, skips the `authenticate` event entirely, and immediately emits `createRoom` with `player.wager: 0.5` and a fabricated `player.walletAddress`. The server creates a wagered room associated with an unverified wallet address.

**Recommendation**:
Add authentication middleware to Socket.IO that intercepts all events requiring a wallet. Validate the JWT on the `connection` handshake or implement a per-event guard:
```js
function requireAuth(client) {
    if (!client.isAuthenticated || !authenticatedWallets[client.id]) {
        client.emit('error', { reason: 'Authentication required' });
        return false;
    }
    return true;
}
```
Apply this guard to: `createRoom`, `joinRoom`, `deleteRoom`, `fire`, `buyWeapon`, `shopDone`, `requestTerrain`, `playAgainRequest`, `prestigeBurn`.

---

### AC-02: deleteRoom Has No Host-Only Check

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:274-284`
**CWE**: CWE-285 (Improper Authorization)

**Description**:
The `deleteRoom` event handler checks only `if (client.roomId !== null)` before destroying the room. It does not check `client.isHost`. Any player in the room -- the joiner (non-host) -- can emit `deleteRoom` and the server will destroy the room, remove all associated state (match state, gold, wagers, inventories), and notify all players with `opponentLeft`.

**Evidence**:
```js
// main.js:274-284
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {         // <-- Only checks room membership, not host role
        client.leave(client.roomId)
        await removeRoom(client.roomId)   // <-- Destroys ALL room state
        io.sockets.in(client.roomId).emit('opponentLeft', {})
        io.emit('setRooms', {rooms: getOpenRooms()})
        io.socketsLeave(client.roomId);
        client.roomId = null
        client.isHost = false
    }
})
```

Compare with `ready` event (line 414-508) which does check `client.isHost`.

**Exploit Scenario**:
During an active wagered match, the losing player emits `deleteRoom`. The room is immediately destroyed. Because `removeRoom()` is called instead of the forfeit logic in `leaveRoom`, the wager settlement is bypassed entirely -- no forfeit settlement occurs, and the opponent loses their wager with no recourse.

**Recommendation**:
Add a host check:
```js
client.on('deleteRoom', async () => {
    if (client.roomId !== null && client.isHost === true) {
```
Additionally, `deleteRoom` during an active wagered match should trigger the same forfeit settlement logic as `leaveRoom`/`disconnect`.

---

### AC-03: No Authentication Required for Wager Room Creation

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:354-410`
**CWE**: CWE-306 (Missing Authentication for Critical Function)

**Description**:
The `createRoom` handler accepts a `player.wager` amount and `player.walletAddress` directly from the client payload without verifying that the socket has been authenticated or that the wallet address belongs to the connected user. An unauthenticated client can create a room with any wallet address and any wager tier.

**Evidence**:
```js
// main.js:354 - No auth check at entry
client.on('createRoom', async ({player}) => {
    // ...
    const wagerAmount = player.wager || 0          // Client-supplied
    const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null  // Falls back, but client-supplied takes priority
    if (wagerAmount > 0 && !isValidWager(wagerAmount)) {
        // Only validates tier, not auth
    }
    wagerStates[roomId] = {
        amount: wagerAmount,
        wallets: { [client.id]: walletAddress }     // Unverified wallet stored
    }
```

The `walletAddress` from the payload takes priority over the authenticated wallet via the `||` chain. This means even if the socket IS authenticated with wallet A, the client can pass wallet B in the payload.

**Exploit Scenario**:
1. Attacker connects without authenticating.
2. Emits `createRoom` with `{ player: { name: "attacker", wager: 0.5, walletAddress: "<victim_wallet>" } }`.
3. Server creates a wagered room with the victim's wallet address as the host's wallet.
4. If settlement occurs, funds would be directed based on the forged wallet address.

**Recommendation**:
1. Require authentication before `createRoom` with any wager > 0.
2. Always use the authenticated wallet address, never trust client-supplied wallet:
```js
const walletAddress = authenticatedWallets[client.id] || null;
if (wagerAmount > 0 && !walletAddress) {
    client.emit('createRoomError', { reason: 'Wallet authentication required for wagers' });
    return;
}
```

---

### AC-04: joinRoom Accepts Unverified Wallet Address

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:288-344`
**CWE**: CWE-285 (Improper Authorization), CWE-345 (Insufficient Verification of Data Authenticity)

**Description**:
The `joinRoom` handler accepts `walletAddress` directly from the client payload and stores it in the wager state without verifying ownership. Similar to AC-03, the client-supplied wallet takes priority over the authenticated wallet.

**Evidence**:
```js
// main.js:288
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
    // ...
    const joinerWallet = walletAddress || authenticatedWallets[client.id] || null
    // ...
    // main.js:332-334
    if (ws) {
        ws.wallets[client.id] = joinerWallet   // Unverified wallet stored for settlement
    }
```

**Exploit Scenario**:
1. Player A creates a wagered room (0.5 SOL) with legitimate wallet.
2. Attacker joins with `walletAddress: "<someone_else_wallet>"`.
3. Attacker intentionally loses. Settlement sends funds to the forged wallet address as the "loser" -- but since settlement is a stub (returns success without actual transfer), the attacker risks nothing while the system records the wrong wallet for future settlement.
4. When actual on-chain settlement is implemented, this becomes a direct fund theft vector.

**Recommendation**:
Same as AC-03. Never trust client-supplied wallet addresses. Always derive from authenticated session:
```js
const joinerWallet = authenticatedWallets[client.id] || null;
if (roomWager > 0 && !joinerWallet) {
    client.emit('joinRoomError', { reason: 'Wallet authentication required' });
    return;
}
```

---

### AC-05: /stats Endpoint Exposes Financial Data Without Authentication

**Severity**: CRITICAL
**Location**: `server/index.js:34`, `server/services/monitoring.js:166-211`
**CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)

**Description**:
The `GET /stats` endpoint is publicly accessible with no authentication, rate limiting, or IP restriction. It exposes:
- Total SOL wagered across all matches
- Total SOL settled to winners
- Treasury and ops fee totals
- Number of forfeits
- SHOT token emission/burn totals
- Last 5 server errors (which may contain stack traces, wallet addresses, or internal state)
- Active connection count
- Peak connection count

**Evidence**:
```js
// index.js:34
app.get('/stats', getStats)    // No middleware

// monitoring.js:189-194 - Financial data exposed
sol: {
    totalWagered: stats.totalWagered.toFixed(4),
    totalSettled: stats.totalSettled.toFixed(4),
    treasuryFees: stats.totalTreasuryFees.toFixed(4),
    opsFees: stats.totalOpsFees.toFixed(4),
    forfeits: stats.totalForfeits,
},

// monitoring.js:207-209 - Error details exposed
errors: {
    count: stats.errorCount,
    recent: stats.errors.slice(-5),   // May contain wallet addresses, internal errors
},
```

**Exploit Scenario**:
1. An attacker hits `GET /stats` to learn the platform's financial volume, error patterns, and active user count.
2. Error messages may leak wallet addresses, internal state, or exploitable information.
3. Connection counts reveal peak usage times for timing attacks.
4. Financial totals reveal platform revenue for competitive intelligence.

**Recommendation**:
1. Add authentication middleware (API key, JWT, or IP whitelist) to `/stats`.
2. Separate the public-safe metrics (uptime, match count) from sensitive data (SOL totals, errors).
3. Strip wallet addresses and internal details from error objects before exposing:
```js
app.get('/stats', requireAdminAuth, getStats);
```

---

### AC-06: No Room-Membership Validation on Relay Events

**Severity**: HIGH
**Location**: `server/socket-io/main.js:631-666`, `918-1000`
**CWE**: CWE-284 (Improper Access Control)

**Description**:
Numerous relay events (`weaponPick`, `shoot`, `weaponChange`, `angleChange`, `powerChange`, `stepLeft`, `stepRight`, `giveTurn`, `requestTurn`) blindly relay to `client.roomId` without verifying:
1. That the client is actually in a room (`client.roomId` could be stale)
2. That the client is a legitimate participant in that room (not an observer or stale connection)
3. That it is the client's turn (for action events)

**Evidence**:
```js
// main.js:664 - Legacy shoot relay: no validation at all
client.on('shoot', ({selectedWeapon, power, rotation, ...}) => {
    client.to(client.roomId).emit('opponentShoot', {...})
})

// main.js:924 - angleChange: no room or turn check
client.on('angleChange', ({rotation}) => {
    client.to(client.roomId).emit('opponentAngleChange', {rotation})
})
```

**Exploit Scenario**:
A client that has been disconnected from a room (but whose socket is still alive) could send relay events that get broadcast to the room they were previously in, causing state confusion. Alternatively, a malicious client could manipulate `client.roomId` by calling `joinRoom` with a target room, then send `shoot` events to interfere with another match.

**Recommendation**:
Add a helper that validates room membership:
```js
function isInRoom(client, roomId) {
    const room = findRoom(roomId);
    if (!room) return false;
    return room.host?.socketId === client.id || room.player?.socketId === client.id;
}
```
Apply this check to all relay events.

---

### AC-07: createWeaponArray Can Be Called By Any Room Member

**Severity**: HIGH
**Location**: `server/socket-io/main.js:645-659`
**CWE**: CWE-285 (Improper Authorization)

**Description**:
The `createWeaponArray` event generates a random weapon array and broadcasts it to all room members. There is no check that the caller is the host. Either player can overwrite the weapon array at any time, and there is no state machine validation (no match state check).

**Evidence**:
```js
// main.js:645
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    // No host check, no state check
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

**Exploit Scenario**:
A non-host player emits `createWeaponArray` with `{count: 100, max: 1}` to force all weapons to index 0 (the weakest weapon), manipulating the game state in their favor.

**Recommendation**:
1. Add a host check: `if (!client.isHost) return;`
2. Add match state validation (only valid during lobby/weapon_shop)
3. Validate `count` and `max` parameters for reasonable bounds.

---

### AC-08: terrainPath Can Be Overwritten By Any Room Member

**Severity**: HIGH
**Location**: `server/socket-io/main.js:937-964`
**CWE**: CWE-285 (Improper Authorization)

**Description**:
The `terrainPath` event allows any room member to set the terrain path, host positions, and heightmap for the room. There is no host check and no state validation. This is a state mutation that affects the server-authoritative physics engine.

**Evidence**:
```js
// main.js:937
client.on('terrainPath', ({path, hostPos, playerPos}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    // No host check, no state check
    room.terrainPath = [...path]
    room.host.pos = {...hostPos}       // Client controls host position
    room.player.pos = {...playerPos}   // Client controls player position
    room.heightmap = heightmap         // Client controls physics terrain
```

**Exploit Scenario**:
1. A malicious joiner emits `terrainPath` with `hostPos` placed off-screen or inside terrain.
2. The server updates `room.host.pos`, so subsequent `fire` events use the manipulated positions for damage calculations.
3. The attacker sets `playerPos` to a position that is unreachable by projectiles (e.g., `{x: 0, y: 0}`).

**Recommendation**:
1. Add a host check: only the host should be able to set terrain.
2. Better: use `requestTerrain` (server-generated terrain) exclusively and remove the legacy `terrainPath` event.
3. If legacy support is needed, validate that positions are within terrain bounds.

---

### AC-09: requestTerrain Has No Role or State Checks

**Severity**: HIGH
**Location**: `server/socket-io/main.js:877-914`
**CWE**: CWE-285 (Improper Authorization)

**Description**:
The `requestTerrain` event generates new terrain and transitions the match state to `BATTLE`. There is no check on who called it or whether the match is in the correct state for terrain generation. Either player can call this at any time, repeatedly regenerating terrain mid-battle.

**Evidence**:
```js
// main.js:877
client.on('requestTerrain', () => {
    const room = findRoom(client.roomId)
    if (!room) return
    // No host check, no state check
    const seed = Math.floor(Math.random() * 1000000)
    const { path, heightmap } = generateTerrain(1200, 534, seed)
    // ...
    if (ms.status !== MATCH_STATES.BATTLE) {
        transitionState(ms, MATCH_STATES.BATTLE)   // Forces state transition
    }
    ms.currentTurn = getNextTurn(...)               // Resets turn order
```

**Exploit Scenario**:
1. Mid-battle, the losing player emits `requestTerrain`.
2. Server regenerates the entire terrain, resets tank positions, and resets the turn order.
3. This effectively nullifies any progress the opponent made.

**Recommendation**:
1. Only allow `requestTerrain` when match state is `WEAPON_SHOP` or `LOBBY` (post-ready, pre-battle).
2. Add a host-only or once-per-round guard.
3. Validate state transitions:
```js
if (ms && ms.status !== MATCH_STATES.WEAPON_SHOP && ms.status !== MATCH_STATES.LOBBY) {
    return; // Terrain already generated for this round
}
```

---

### AC-10: Player Can Act On Opponent's Behalf via Legacy Relay Events

**Severity**: HIGH
**Location**: `server/socket-io/main.js:664-666`, `991-993`
**CWE**: CWE-284 (Improper Access Control)

**Description**:
Legacy relay events like `shoot` and `giveTurn` are direct relays that broadcast to the opponent without any identity or turn validation. The `shoot` event in particular allows a client to emit an `opponentShoot` event to the other player at any time, potentially triggering client-side damage calculations that bypass the server-authoritative `fire` system.

**Evidence**:
```js
// main.js:664 - Shoot relay: no identity check, no turn check
client.on('shoot', ({selectedWeapon, power, rotation, rotation1, rotation2, position1, position2}) => {
    client.to(client.roomId).emit('opponentShoot', {selectedWeapon, power, rotation, rotation1, rotation2, position1, position2})
})

// main.js:991 - Turn relay: opponent can force a turn transfer
client.on('giveTurn', ({terrainData, pos1, pos2, rotation1, rotation2}) => {
    client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
})
```

**Exploit Scenario**:
1. If the client still uses the legacy `shoot` event (for backward compatibility), a player can emit `shoot` out of turn, causing the opponent's client to process an extra shot that was never validated server-side.
2. A player emits `giveTurn` to transfer the turn to their opponent at an arbitrary time, disrupting the turn order on the opponent's client while the server's `matchStates` still thinks it is the attacker's turn.

**Recommendation**:
Remove legacy relay events (`shoot`, `giveTurn`, `requestTurn`) or gate them behind the same turn and state validation as the `fire` event. If backward compatibility is required, add:
```js
client.on('shoot', (...) => {
    if (ms && ms.currentTurn !== client.id) return; // Turn check
    // ... relay
})
```

---

### AC-11: playAgainRequest Wipes Wager State Without Settlement Check

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:1004-1053`
**CWE**: CWE-285 (Improper Authorization)

**Description**:
The `playAgainRequest` handler deletes `wagerStates[client.roomId]` when both players agree. However, there is no check that the match has been properly settled before wiping wager data. If the match state is `SETTLING` or `BATTLE` (due to a race condition or state confusion), the wager is silently destroyed.

**Evidence**:
```js
// main.js:1014-1019 - Wager state wiped without settlement verification
matchStates[client.roomId] = createMatchState(client.roomId)
delete goldStates[client.roomId]
delete weaponInventories[client.roomId]
delete shopReady[client.roomId]
delete wagerStates[client.roomId]     // <-- Wager gone, no settlement check
```

**Exploit Scenario**:
1. Match completes, settlement is attempted but fails (e.g., RPC error in future implementation).
2. Both players immediately click "play again" before checking settlement status.
3. Wager state is deleted, making it impossible to retry settlement.

**Recommendation**:
Only allow `playAgainRequest` when match state is `COMPLETE`:
```js
const ms = matchStates[client.roomId];
if (ms && ms.status !== MATCH_STATES.COMPLETE) return;
```

---

### AC-12: No Nonce/Replay Prevention in Authentication

**Severity**: MEDIUM
**Location**: `server/middleware/auth.js:72-73`
**CWE**: CWE-294 (Authentication Bypass by Capture-replay)

**Description**:
The authentication message uses a timestamp with a 5-minute window but no nonce or replay tracking. A captured authentication payload can be replayed within the 5-minute window to authenticate as the same wallet on a different socket.

**Evidence**:
```js
// auth.js:72-73
const age = Date.now() - timestamp;
if (age > AUTH_TIMEOUT || age < -60000) {    // 5 minute window
    return { valid: false, reason: 'Auth message expired' };
}
// No nonce, no used-signature tracking
```

**Exploit Scenario**:
1. Attacker intercepts a legitimate authentication message (via MITM on the wildcard CORS WebSocket, network sniffing, etc.).
2. Within 5 minutes, attacker replays the exact same `{ walletAddress, message, signature, timestamp }` on their own socket.
3. Server accepts the replayed authentication and marks the attacker's socket as the legitimate wallet.

**Recommendation**:
1. Include a nonce in the auth message: `"SolShot Auth: <wallet> at <timestamp> nonce <random>"`.
2. Track used nonces/signatures in a time-bounded set:
```js
const usedNonces = new Map(); // nonce -> expiry timestamp
// Reject if nonce already used
```

---

### AC-13: CORS Wildcard Allows Any Origin

**Severity**: MEDIUM
**Location**: `server/index.js:16-19`, `server/index.js:22`
**CWE**: CWE-346 (Origin Validation Error)

**Description**:
Both the Socket.IO server and the Express app use `origin: "*"` CORS configuration, allowing connections from any domain. This enables cross-site WebSocket hijacking and cross-origin API access.

**Evidence**:
```js
// index.js:15-19 - Socket.IO wildcard CORS
const io = new socket.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

// index.js:22 - Express wildcard CORS
app.use(cors())
```

**Exploit Scenario**:
1. Attacker hosts a malicious website at `evil.com` with JavaScript that connects to the SolShot WebSocket server.
2. If a SolShot user visits `evil.com` while their wallet is connected, the malicious page can emit socket events as the user (since origin is unrestricted).
3. The attacker's page can create rooms, join matches, and interact with the server on the user's behalf.

**Recommendation**:
Restrict CORS origins to the actual client domain(s):
```js
const ALLOWED_ORIGINS = [
    'https://solshot.gg',
    'http://localhost:3000',  // dev only
];
const io = new socket.Server(server, {
    cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] }
});
app.use(cors({ origin: ALLOWED_ORIGINS }));
```

---

### AC-14: Hardcoded JWT Secret in Source Code

**Severity**: LOW
**Location**: `server/middleware/auth.js:17`
**CWE**: CWE-798 (Use of Hard-coded Credentials)

**Description**:
The JWT secret has a hardcoded fallback value `'solshot-dev-secret-change-me'`. If the `JWT_SECRET` environment variable is not set (which is common in development and may accidentally occur in production), all JWTs are signed with a publicly known secret.

**Evidence**:
```js
// auth.js:17
const JWT_SECRET = process.env.JWT_SECRET || 'solshot-dev-secret-change-me';
```

**Exploit Scenario**:
If deployed without setting `JWT_SECRET`, an attacker can forge valid JWT tokens for any wallet address using the known default secret, then use those tokens to impersonate any wallet.

**Note**: Since JWTs are currently never validated (see AC-01), this is LOW severity today but becomes CRITICAL when JWT validation is implemented.

**Recommendation**:
1. Fail fast if `JWT_SECRET` is not set in production:
```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
}
```
2. Use a cryptographically random secret of at least 256 bits.

---

## Summary Matrix

| ID | Severity | Location | Title |
|---|---|---|---|
| AC-01 | CRITICAL | auth.js:86-92, main.js:170-177 | JWT generated but never validated on any event |
| AC-02 | CRITICAL | main.js:274-284 | deleteRoom has no host-only check |
| AC-03 | CRITICAL | main.js:354-410 | No authentication required for wager room creation |
| AC-04 | CRITICAL | main.js:288-344 | joinRoom accepts unverified wallet address |
| AC-05 | CRITICAL | index.js:34, monitoring.js:166-211 | /stats exposes financial data without auth |
| AC-06 | HIGH | main.js:631-666, 918-1000 | No room-membership validation on relay events |
| AC-07 | HIGH | main.js:645-659 | createWeaponArray callable by any room member |
| AC-08 | HIGH | main.js:937-964 | terrainPath overwrites physics state without auth |
| AC-09 | HIGH | main.js:877-914 | requestTerrain has no role or state checks |
| AC-10 | HIGH | main.js:664-666, 991-993 | Legacy relay events enable acting on opponent's behalf |
| AC-11 | MEDIUM | main.js:1004-1053 | playAgainRequest wipes wager without settlement check |
| AC-12 | MEDIUM | auth.js:72-73 | No nonce/replay prevention in authentication |
| AC-13 | MEDIUM | index.js:16-19, 22 | CORS wildcard allows any origin |
| AC-14 | LOW | auth.js:17 | Hardcoded JWT secret fallback |

---

## Systemic Root Cause

The fundamental issue is **architectural**: authentication and authorization are implemented as an optional client-initiated ceremony rather than as server-enforced middleware. The `authenticate` socket event exists, but:

1. No socket middleware intercepts events to verify authentication.
2. No per-handler guard checks `client.isAuthenticated`.
3. The JWT is generated but never consumed.
4. Client-supplied wallet addresses override authenticated wallets.
5. The `isHost` flag on the socket is set by the server but never checked for host-only operations (except `ready` and `playAgainRequest`, which have partial checks).

**Recommended Architecture**:
1. **Socket.IO middleware**: Add `io.use()` middleware that validates authentication on connection or first event.
2. **Per-event guards**: Create `requireAuth()` and `requireHost()` helper functions applied consistently to all state-mutating events.
3. **Wallet binding**: After authentication, always use `authenticatedWallets[client.id]` for wallet operations. Never accept client-supplied wallet addresses in event payloads.
4. **HTTP middleware**: Add admin authentication to `/stats` and any future API endpoints.
5. **Remove legacy relay events**: The coexistence of server-authoritative (`fire`) and client-relay (`shoot`) events creates a dual-path vulnerability where attackers can bypass server validation by using the legacy path.
