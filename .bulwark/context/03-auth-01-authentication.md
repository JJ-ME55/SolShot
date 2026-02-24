<!-- CONDENSED_SUMMARY_START -->
---
task_id: AUTH-01
auditor: Dinh's Bulwark Pipeline
date: 2026-02-23
focus: Authentication Mechanisms (off-chain only)
files_reviewed:
  - server/middleware/auth.js
  - server/middleware/guards.js
  - server/middleware/telegram.js
  - server/socket-io/main.js (auth-related sections)
  - server/index.js
  - client/src/wallet/WalletContext.js
  - client/src/App.js
severity_counts: { critical: 3, high: 3, medium: 2, low: 1 }
---

## AUTH-01 Condensed Summary

### Overall Verdict
Authentication exists and is correctly implemented at the signature-verification layer, but the
authorization enforcement layer has three structural defects that collectively allow an unauthenticated
or partially-authenticated socket to participate in gameplay, receive SHOT/prestige state, and inject
turn-relay data into an active match. The JWT token generated on successful auth is never validated
anywhere -- it is generated and immediately discarded, making token issuance entirely decorative.

### Critical Findings

**C1 -- JWT Token is Issued but Never Consumed (auth.js / main.js)**
`generateToken()` is called inside `handleAuthenticate()` and the token is included in the `authResult`
response to the client. The client does not store or re-send it. The server never calls `verifyToken()`
on any subsequent request. The `verifyToken()` function is defined but has zero call sites in the
application. The JWT is generated, transmitted, and discarded every authentication cycle.
Risk: The investment in jsonwebtoken has zero security value. All session identity rests entirely on the
in-memory `client.isAuthenticated` flag, which survives only within the socket lifetime.

**C2 -- Signature Replay Window: No Nonce Consumption (auth.js)**
The auth message format is `SolShot Auth: <wallet> at <timestamp>`. Uniqueness depends solely on the
5-minute timestamp window (AUTH_TIMEOUT = 5 * 60 * 1000). There is no set, map, or database of seen
signatures. An attacker who observes a valid (walletAddress, message, signatureBase64) tuple -- for
example via a network interception or XSS -- can replay that exact tuple to authenticate as the victim
on any number of new socket connections until the 5-minute window expires. The `rejoinRoom` handler
re-verifies the signature correctly (timestamp + Ed25519), but also has no nonce consumption.

**C3 -- Six Socket Events Execute Without Authentication (main.js)**
The following events have no `requireAuth()` call and no inline `isAuthenticated` check:
- `shoot` -- relays weapon fire parameters to opponent (no auth check; state check only)
- `giveTurn` -- relays `terrainData`, `pos1`, `pos2`, `rotation1`, `rotation2` to opponent (no auth, no state check, no room membership check beyond client.roomId)
- `weaponPick` -- relays `arrayIndex` to opponent room (no auth)
- `weaponChange`, `angleChange`, `powerChange` -- relay HUD state to opponent (no auth)
- `getWeaponArray` -- reads and returns server-side weapon array (no auth)

`giveTurn` is the most severe: it blindly relays `terrainData` (arbitrary object, size-uncapped) from
any socket to the rest of the room. Any socket with client.roomId set can inject arbitrary terrain
payloads to both players mid-match.

### High Findings

**H1 -- Practice/Free Rooms Require No Authentication At All**
`createRoom`, `joinRoom`, and `joinQueue` all gate `requireAuth()` behind `wagerAmount > 0`. A socket
that never calls `authenticate` can create a room, join a room, and participate in free matches --
including earning SHOT token milestones. The `ready`, `buyWeapon`, `shopDone` etc. events do require
auth unconditionally, creating an inconsistency: a player can join a free match unauthenticated but
cannot signal ready without authenticating.

**H2 -- Telegram Auth is Implemented but Never Wired**
`telegramSocketMiddleware` in `server/middleware/telegram.js` correctly implements HMAC-SHA256
verification per the Telegram Mini App spec. However it is never registered with `io.use()`. The only
`io.use()` call in `server/index.js` is the per-IP connection limiter. Even if it were wired,
`socket.isTelegram` is never consulted during `requireAuth()` -- a Telegram user would still fail auth.

**H3 -- Telegram Hash Comparison is Not Timing-Safe**
`telegram.js` line 54: `const valid = computedHash === hash;` -- direct string equality comparison,
vulnerable to timing side-channel. Correct approach: `crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))`.

### Medium Findings

**M1 -- authenticatedWallets Entry Leaks During 30-Second Reconnect Window**
On disconnect during an active match, `authenticatedWallets[client.id]` is NOT deleted immediately.
Deletion is deferred to the 30-second cleanup timeout. During the reconnect window, a new connection
authenticating the same wallet results in two entries in `authenticatedWallets` pointing to the same
wallet address -- a state inconsistency that could affect settlement wallet resolution.

**M2 -- Re-Authentication on Same Socket Not Prevented**
The `authenticate` handler has no guard against re-authentication. A client authenticated as wallet A
can emit `authenticate` with wallet B's credentials; the last one wins, overwriting `client.walletAddress`
and `authenticatedWallets[client.id]`. SHOT emissions and prestige operations after the swap credit
wallet B while SOL settlement uses wallet A (stored at room-creation time in wagerStates).

### Low Findings

**L1 -- 5-Minute Auth Window is Wider Than Necessary**
AUTH_TIMEOUT = 300s. A WebSocket auth round-trip is typically under 500ms. A 60-second window provides
identical clock-skew tolerance while reducing the C2 replay window by 5x.

### Items Confirmed Secure
- Ed25519 signature verification via NaCl is correctly implemented in `verifyWalletSignature`
- `verifyAuthMessage` correctly validates message format and timestamp freshness
- `PublicKey.isOnCurve()` check prevents non-curve-point public key submission
- `rejoinRoom` requires a fresh Ed25519 signature before restoring auth state
- Wallet address at settlement is taken from `authenticatedWallets` (server-verified), not client payload
- atob is available in Node.js v24.13.0 -- no compatibility risk
- JWT secret falls back to random bytes in dev, exits in production
- `requireAuth` is applied to all financially consequential events: `ready`, `buyWeapon`, `shopDone`, `escrowDepositConfirm`, `createWeaponArray`, `positionUpdate`, `stepLeft`, `stepRight`, `requestTerrain`, `requestTurn`, `playAgainRequest`, `deleteRoom`
- Client-side TX validation in WalletContext verifies Anchor discriminator before signing
<!-- CONDENSED_SUMMARY_END -->

---

# AUTH-01: Full Authentication Audit

**Project:** SolShot (Solana multiplayer artillery game)
**Auditor:** Dinh's Bulwark Pipeline -- AUTH-01 slot
**Date:** 2026-02-23
**Scope:** All off-chain authentication code. Anchor programs excluded.

---

## 1. Authentication Flow Map

```
CLIENT                                SERVER
------                                ------
wallet.connect()
  -> WalletContext detects connected
  -> Auto-authenticate poll begins
  -> signMessage(encodedMessage)    <- message = "SolShot Auth: <wallet> at <timestamp>"
  -> socket.emit('authenticate', {
      walletAddress, message,
      signature (base64), timestamp
    })
                                      authenticate handler (main.js:533)
                                        -> validatePayload null-guard
                                        -> handleAuthenticate(client, data) [auth.js]
                                            -> verifyAuthMessage(): format + timestamp check
                                            -> verifyWalletSignature(): NaCl Ed25519 verify
                                            -> generateToken(): JWT issued (UNUSED)
                                            -> client.walletAddress = walletAddress
                                            -> client.isAuthenticated = true
                                        -> authenticatedWallets[client.id] = walletAddress
                                        -> loadMilestoneState(walletAddress)
  socket.on('authResult', handler)    socket.emit('authResult', { success, token, walletAddress })
  -> if success: setIsAuthenticated(true)
  [token discarded -- never stored]
```

---

## 2. Critical Finding C1: JWT Token is Decorative -- Never Validated

### Evidence

`server/middleware/auth.js` -- `generateToken()` called at auth.js line 97:

```js
export function generateToken(walletAddress) {
    return jwt.sign(
        { wallet: walletAddress },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}
```

`handleAuthenticate()` returns `{ success: true, token, walletAddress }`. The token is included in the
`authResult` event payload emitted to the client.

Searching the entire server source (excluding node_modules) for `verifyToken` callers:

```
server/middleware/auth.js:110:export function verifyToken(token) {
server/middleware/auth.js:112:        const decoded = jwt.verify(token, JWT_SECRET);
```

`verifyToken` is defined but has **zero callers** in the application. No HTTP route, no socket middleware,
no event handler ever calls it.

Searching the client source for storage or re-use of the token:

```
client/src/wallet/WalletContext.js:312: socket.on('authResult', handler);
```

The client `authResult` handler checks only `result.success` and sets `isAuthenticated`. The `result.token`
field is never accessed, stored in localStorage, or re-sent on any subsequent request.

### 5-Whys Analysis
1. **Why is the JWT useless?** `verifyToken()` has no callers -- nothing validates the token on any request.
2. **Why does no code validate it?** Session identity is maintained via `client.isAuthenticated` on the socket object, which persists only within the connection lifetime. JWT architecture implies stateless HTTP re-validation, but all game traffic is WebSocket.
3. **Why was a JWT introduced?** Likely added during a security pass to establish a pattern for future HTTP API calls (e.g., REST endpoints for stats, armory). The HTTP endpoints that exist (`/stats`, `/health`) use `requireAdminKey` (X-header), not JWT.
4. **Why does this matter if socket state works?** The JWT expiry of 24h is never enforced since verification never runs. Any developer who adds a new HTTP endpoint and reaches for `verifyToken` will find a function that was never exercised in integration and may have undetected bugs.
5. **Why is this critical?** The system spends jsonwebtoken library surface area (a dependency) for zero security benefit. The auth system's documented contract (JWT issuance) is a broken promise.

### Recommendation
Either: (a) Remove JWT generation entirely and document that session auth is socket-lifetime only, or
(b) Store the JWT client-side (sessionStorage) and validate it on every HTTP API call to `/stats` and
future REST endpoints, replacing `requireAdminKey` for player-scoped endpoints.

---

## 3. Critical Finding C2: Signature Replay -- No Nonce Consumption

### Evidence

`server/middleware/auth.js`:

```js
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function verifyAuthMessage(message, walletAddress, timestamp) {
    const expected = `SolShot Auth: ${walletAddress} at ${timestamp}`;
    if (message !== expected) {
        return { valid: false, reason: 'Invalid message format' };
    }
    const age = Date.now() - timestamp;
    if (age > AUTH_TIMEOUT || age < -60000) {
        return { valid: false, reason: 'Auth message expired' };
    }
    return { valid: true };
}
```

Searching the entire server for used-signature tracking state:

```
NONE FOUND
```

Confirmed by grep for: `usedNonce`, `seenTimestamp`, `replayProtect`, `authHistory`, `seenSig`, `nonce`.
The only nonce-like references in main.js are the turn-sequence nonce (`ms.turnSequence`), unrelated to auth.

### Attack Scenario
1. Attacker captures a valid authenticate emission: `{ walletAddress: "VictimWallet...", message: "SolShot Auth: VictimWallet... at 1740312000000", signature: "<base64>" }` via XSS or MITM on shared network.
2. Within 5 minutes of the original timestamp, attacker opens a new WebSocket connection and replays the exact same tuple to `authenticate`.
3. Both `verifyAuthMessage` (timestamp still within window) and `verifyWalletSignature` (same valid signature) pass.
4. Attacker's socket is now `isAuthenticated = true` with `authenticatedWallets[attacker.id] = "VictimWallet"`.
5. Attacker can create wager rooms, accumulate SHOT milestones, and trigger prestige burns -- all attributed to the victim wallet.

SOL wager theft is blocked by the Anchor escrow program enforcing on-chain wallet ownership.
SHOT milestone fraud and prestige tier manipulation are fully achievable via replay.

### 5-Whys Analysis
1. **Why can signatures be replayed?** No consumed-nonce store exists; uniqueness guard is only the 5-minute timestamp window.
2. **Why wasn't a nonce store added?** The embedded timestamp approximates a nonce for single-use cases. The gap is that the same timestamp value is reusable until it expires.
3. **Why does the 5-minute window exist?** To allow for clock skew between client and server. A 60-second window would suffice.
4. **Why is replay dangerous?** Primary risk is wallet impersonation for SHOT milestone farming and prestige progression. These are purely server-side state with no on-chain ownership enforcement.
5. **Why is this critical?** The 5-minute window is long enough for practical network interception exploitation (e.g., shared WiFi MITM).

### Recommendation
Maintain a `Set<string>` of recently-used signature hashes, evicted after AUTH_TIMEOUT:

```js
const usedAuthSigs = new Map(); // sha256(sig) -> expiresAt

export function verifyWalletSignature(walletAddress, message, signatureBase64) {
    // ... existing verification ...
    if (verified) {
        const sigHash = crypto.createHash('sha256').update(signatureBase64).digest('hex');
        const now = Date.now();
        if (usedAuthSigs.has(sigHash)) {
            return { valid: false, reason: 'Signature already used' };
        }
        usedAuthSigs.set(sigHash, now + AUTH_TIMEOUT);
        // Evict expired entries periodically
    }
    // ...
}
```

---

## 4. Critical Finding C3: Six Unauthenticated Game-State Events

### Evidence

Complete event inventory from `server/socket-io/main.js`, auth status:

| Event | requireAuth | Inline isAuthenticated | Notes |
|---|---|---|---|
| `authenticate` | -- | -- | Auth entry point |
| `disconnect` | -- | -- | Lifecycle |
| `leaveRoom` | -- | -- | Low risk |
| `rejoinRoom` | Ed25519 re-verify | -- | Correct |
| `deleteRoom` | YES | -- | |
| `joinRoom` | wager>0 only | -- | Gap |
| `getRooms` | -- | -- | Read-only public |
| `createRoom` | wager>0 only | -- | Gap |
| `joinQueue` | wager>0 only | -- | Gap |
| `leaveQueue` | -- | -- | Low risk |
| `ready` | YES | -- | |
| `buyWeapon` | YES | -- | |
| `shopDone` | YES | -- | |
| `getShotInfo` | -- | -- | Returns defaults if no wallet |
| `getStats` | -- | -- | Returns defaults if no wallet |
| `prestigeBurn` | wallet check | -- | Uses authenticatedWallets not isAuthenticated flag |
| `weaponPick` | **NONE** | **NONE** | Relays to room |
| `getWeaponArray` | **NONE** | **NONE** | Returns server data |
| `createWeaponArray` | YES | -- | |
| `shoot` | **NONE** | **NONE** | State check only |
| `escrowDepositConfirm` | YES | -- | |
| `fire` | **NONE** | Inline check | Uses `this.isAuthenticated` at line 1825 |
| `requestTerrain` | YES | -- | |
| `weaponChange` | **NONE** | **NONE** | Relay |
| `angleChange` | **NONE** | **NONE** | Relay |
| `powerChange` | **NONE** | **NONE** | Relay |
| `positionUpdate` | YES | -- | |
| `stepLeft` | YES | -- | |
| `stepRight` | YES | -- | |
| `giveTurn` | **NONE** | **NONE** | Relays terrainData -- highest risk |
| `requestTurn` | YES | -- | |
| `playAgainRequest` | YES | -- | |

**`giveTurn` handler** (main.js:2479):

```js
client.on('giveTurn', (data) => {
    if (!data || typeof data !== 'object') return
    const { terrainData, pos1, pos2, rotation1, rotation2 } = data
    client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
})
```

No auth check. No room membership validation beyond `client.roomId` being non-null. `terrainData` is an
arbitrary object with no size cap, relayed verbatim to all sockets in the room. Any socket that has
joined a free/practice room can inject crafted terrain data to both players.

**`shoot` handler** (main.js:1697):

```js
client.on('shoot', (data) => {
    if (!data || typeof data !== 'object') return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'shoot')) return
    // sanitizes numeric fields then relays
})
```

No auth check. The `validateAction` state guard reduces exploitability but does not authenticate the sender.

### 5-Whys Analysis (giveTurn)
1. **Why is giveTurn unauthenticated?** Legacy relay event kept for backward compatibility with pre-server-authoritative client-side physics.
2. **Why wasn't auth added during the security pass?** The security pass targeted high-value events (fire, shopDone, buyWeapon). Legacy relay events were assessed as low-value visual relays.
3. **Why is this dangerous?** `terrainData` is an unsized arbitrary object. If the client physics engine uses `terrainData` from `recieveTurn` for collision calculations, this is a physics injection vector. At minimum it causes visual desync.
4. **Why does room membership not protect this?** Any socket with `client.roomId` set can emit `giveTurn`.
5. **Why does this compound with C2?** A replayed auth token gives an attacker a legitimate-looking socket that can then perform `giveTurn` injection without being one of the two registered players in the match.

### Recommendation
Add `if (!requireAuth(client, 'giveTurn')) return` to `giveTurn`, `shoot`, `weaponPick`, `weaponChange`,
`angleChange`, and `powerChange`. Additionally validate `terrainData` against `room._terrainCache` before
relaying, and add a size cap.

---

## 5. High Finding H1: Free Match Authentication Bypass

### Evidence

The auth guard is conditional on `wagerAmount > 0` at three entry points:

`main.js:1121`:
```js
if (wagerAmount > 0 && !requireAuth(client, 'createRoom')) return
```

`main.js:972`:
```js
if (roomWager > 0) {
    if (!requireAuth(client, 'joinRoom')) return
```

`main.js:1231`:
```js
if (wagerAmount > 0 && !requireAuth(client, 'joinQueue')) return;
```

An unauthenticated socket can create a free room, join a free room, and sit in it -- occupying the
opponent slot. It then hits `requireAuth` when emitting `ready`, creating a half-locked room state.
More importantly, `getWeaponArray` and `weaponPick` have no auth guard, so an unauthenticated socket
inside a free room can interact with weapon state.

### Recommendation
Require authentication for `createRoom`, `joinRoom`, and `joinQueue` unconditionally. The distinction
between wagered and free matches should affect escrow logic, not authentication requirements.

---

## 6. High Finding H2: Telegram Middleware Never Wired

### Evidence

`server/middleware/telegram.js:84`: `telegramSocketMiddleware` is implemented correctly.

All `io.use()` registrations in `server/index.js` (line 44 only):

```js
io.use((socket, next) => {
    const ip = (socket.handshake.headers['x-forwarded-for'] || '')
                    .split(',')[0].trim()
               || socket.handshake.address;
    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }
    ipConnectionCounts.set(ip, current + 1);
    // ...
    next();
});
```

No `io.use(telegramSocketMiddleware)` exists anywhere. The middleware is not imported anywhere in
production code. `socket.isTelegram` and `socket.telegramUser` are set by code that never runs.

Even if wired, `requireAuth()` in `guards.js` checks only `client.isAuthenticated`:

```js
export function requireAuth(client, eventName) {
    if (!client.isAuthenticated) {
        client.emit(`${eventName}Error`, { reason: 'Authentication required' });
        return false;
    }
    return true;
}
```

A Telegram-validated user would have `isTelegram = true` but `isAuthenticated = false`, and would
be blocked by every `requireAuth` guard.

### Recommendation
Either register `io.use(telegramSocketMiddleware)` and update `requireAuth` to accept `client.isTelegram`
as a valid auth path, or remove the Telegram middleware entirely to eliminate dead security code.

---

## 7. High Finding H3: Telegram Hash Comparison is Timing-Unsafe

### Evidence

`server/middleware/telegram.js:52-54`:

```js
const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

const valid = computedHash === hash;
```

JavaScript string equality (`===`) is not constant-time and short-circuits on the first differing byte,
leaking information about how many leading bytes of the HMAC match the attacker-supplied value.

### Recommendation

```js
const computedBuf = Buffer.from(computedHash, 'hex');
const suppliedBuf = Buffer.from(hash.padEnd(computedHash.length, '0').slice(0, computedHash.length), 'hex');
const valid = computedBuf.length === suppliedBuf.length &&
    crypto.timingSafeEqual(computedBuf, suppliedBuf);
```

Fix H2 and H3 together since the middleware is currently dead code.

---

## 8. Medium Finding M1: authenticatedWallets Deferred Cleanup -- State Inconsistency

### Evidence

`main.js:704-764` (disconnect handler), deferred path:

```js
disconnectTimers[walletAddress] = setTimeout(async () => {
    delete pendingReconnects[walletAddress]
    delete disconnectTimers[walletAddress]
    ...
    await cleanupRoom(fakeClient, io, 'reconnect_timeout')
    delete authenticatedWallets[client.id]   // OLD socket ID
}, RECONNECT_WINDOW_MS)
```

During the 30-second window, if the same wallet authenticates on a new socket via `rejoinRoom` (main.js:836):

```js
authenticatedWallets[client.id] = walletAddress  // NEW socket ID
```

Both `authenticatedWallets[oldSocketId]` and `authenticatedWallets[newSocketId]` exist simultaneously,
both pointing to the same wallet address. The deferred timer then deletes `[oldSocketId]` regardless of
whether the reconnect succeeded.

At settlement (main.js:2216):

```js
const winnerAddr = authenticatedWallets[winnerId] || wsState?.wallets?.[winnerId]
```

`winnerId` is the socket ID stored in match state. If reconnect remapped to a new socket ID, the match
state uses the new ID. The old entry is orphaned harmlessly, but represents a state consistency gap
that could affect edge-case debugging and any future code that iterates `authenticatedWallets`.

### Recommendation
In the deferred timeout callback, check that the entry still maps to the expected wallet before deleting,
and consider using `walletAddress -> socketId` as the primary key rather than `socketId -> walletAddress`
to make the mapping unambiguous.

---

## 9. Medium Finding M2: Re-Authentication Wallet Swap on Same Socket

### Evidence

`main.js:533-552` -- the `authenticate` handler has no idempotency guard:

```js
client.on('authenticate', async (data) => {
    if (!data || typeof data !== 'object') {
        client.emit('authResult', { success: false, reason: 'Missing payload' })
        return
    }
    const result = handleAuthenticate(client, data)
    if (result.success) {
        authenticatedWallets[client.id] = result.walletAddress  // OVERWRITES
        ...
    }
    client.emit('authResult', result)
})
```

No guard of the form `if (client.isAuthenticated) { ... return }`.

### Attack Scenario
1. Player uses wallet A to join a wager room (wagerStates[roomId].wallets[socketId] = walletA).
2. After escrow deposit is confirmed, player emits `authenticate` again with wallet B credentials.
3. `authenticatedWallets[client.id]` is now walletB.
4. SHOT milestones earned during the match credit walletB.
5. SOL settlement uses wagerStates wallets (set at room creation with walletA) -- unaffected.
6. DB stats (`totalShotEarned`, prestige tier) are credited to walletB.

### Recommendation

```js
client.on('authenticate', async (data) => {
    if (client.isAuthenticated) {
        client.emit('authResult', { success: false, reason: 'Already authenticated on this session' });
        return;
    }
    // ... rest of handler
})
```

---

## 10. Low Finding L1: 5-Minute Auth Window Wider Than Necessary

`AUTH_TIMEOUT = 5 * 60 * 1000` (300,000 ms) in `server/middleware/auth.js` line 28.

A WebSocket auth round-trip is typically under 500ms. The 5-minute window was chosen to tolerate clock
skew, but a 60-second window provides identical practical tolerance while reducing the C2 replay
window from 300 seconds to 60 seconds -- a 5x improvement in exposure. This is a defense-in-depth
recommendation independent of C2 (nonce consumption).

---

## 11. Items Confirmed Secure

### Ed25519 Signature Verification (auth.js)

```js
const verified = nacl.sign.detached.verify(
    messageBytes,
    signature,
    publicKey.toBytes()
);
```

Correct NaCl API. Pre-validates with `PublicKey.isOnCurve()`. Decodes base64 via `atob()` (available
in Node.js v24.13.0 -- confirmed in use). Message format and timestamp validated before signature check.

### rejoinRoom Requires Fresh Ed25519 Signature (main.js:776-836)

```js
const msgCheck = verifyAuthMessage(message, walletAddress, timestamp)
if (!msgCheck.valid) { client.emit('rejoinError', ...); return }
const sigCheck = verifyWalletSignature(walletAddress, message, signature)
if (!sigCheck.valid) { client.emit('rejoinError', ...); return }
```

A disconnected player cannot rejoin without proving wallet ownership again with a fresh signature.
This is the correct pattern.

### Server-Authoritative Wallet at Settlement (main.js:2216)

```js
const winnerAddr = authenticatedWallets[winnerId] || wsState?.wallets?.[winnerId]
```

Primary source is `authenticatedWallets` (set only by server-verified Ed25519). Fallback to
`wsState.wallets` uses wallet stored at room creation time (also from `authenticatedWallets`), not
any client-provided field. Client cannot inject a wallet address into settlement.

### JWT Secret Handling (auth.js)

- Dev mode: random 32-byte secret via `crypto.randomBytes(32)` -- tokens don't survive restart, correct
- Production: `process.exit(1)` if `JWT_SECRET` not set
- No hardcoded fallback in production

### Per-Socket Rate Limiting (main.js:475-530)

Ring-buffer rate limiter wraps all socket events (30 events/s global, 2 fires/s, 3 room creates/60s).
Sustained abuse (3x limit for 5s) triggers forced disconnect. O(1) per check via circular buffer.

### Client-Side TX Validation (WalletContext.js)

`validateEscrowTransaction()` verifies the Anchor instruction discriminator
`[234, 73, 235, 136, 168, 103, 239, 207]` and rejects any unknown program IDs before prompting the
user to sign. This is a meaningful client-side defense against malicious server TX injection.

---

## 12. File Reference Map

| Finding | File | Lines |
|---|---|---|
| C1 (JWT generated) | server/middleware/auth.js | 97-105 |
| C1 (JWT not consumed) | server/middleware/auth.js | 110-118 |
| C1 (client discards token) | client/src/wallet/WalletContext.js | 309-316 |
| C2 (no nonce tracking) | server/middleware/auth.js | 28, 67-86 |
| C2 (authenticate handler) | server/socket-io/main.js | 533-552 |
| C3 (giveTurn no auth) | server/socket-io/main.js | 2479-2487 |
| C3 (shoot no auth) | server/socket-io/main.js | 1697-1720 |
| C3 (weaponPick no auth) | server/socket-io/main.js | 1650-1657 |
| H1 (free bypass createRoom) | server/socket-io/main.js | 1121 |
| H1 (free bypass joinRoom) | server/socket-io/main.js | 972 |
| H1 (free bypass joinQueue) | server/socket-io/main.js | 1231 |
| H2 (telegram unwired) | server/index.js | 44-70 |
| H2 (telegram impl) | server/middleware/telegram.js | 84-109 |
| H3 (timing-unsafe compare) | server/middleware/telegram.js | 52-54 |
| M1 (deferred cleanup) | server/socket-io/main.js | 737-764, 836 |
| M2 (re-auth swap) | server/socket-io/main.js | 533-552 |
| L1 (wide window) | server/middleware/auth.js | 28 |
