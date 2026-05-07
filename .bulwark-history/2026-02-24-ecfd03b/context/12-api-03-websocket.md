# API-03: WebSocket & Real-Time Security Audit

**task_id:** API-03
**auditor:** API-03
**date:** 2026-02-23
**primary_file:** `server/socket-io/main.js` (2565 lines)
**scope_files:**
- `server/socket-io/main.js`
- `server/index.js`
- `server/middleware/guards.js`
- `server/middleware/auth.js`
- `client/src/socket/index.js`
- `client/src/hooks/useSocket.js`
- `client/src/App.js`

---

## CONDENSED SUMMARY

The Socket.IO layer has received substantial hardening since initial development. A per-socket ring-buffer rate limiter (H074), per-event auth guards (`requireAuth`), server-authoritative physics, turn ownership checks, and a settlement mutex (`withLock`) are all present. The architecture is materially stronger than a naive relay server.

**However, five meaningful weaknesses remain:**

1. **No Socket.IO-level message size cap** (`maxHttpBufferSize` not configured in `server/index.js`). The `giveTurn` relay blindly forwards a `terrainData` field—which can be an arbitrary-size object from the client—to the opponent with zero size validation. Default Socket.IO buffer is 1 MB. Combined with the `turnResult` broadcast that includes full `terrainUpdate` (1200-element array), a single socket can force the server to allocate and broadcast large payloads.

2. **`giveTurn` legacy relay: unauthenticated, no state guard, relays arbitrary `terrainData`**. Any socket (including unauthenticated ones) can emit `giveTurn` with a giant `terrainData` payload and it will be forwarded to whatever room the socket is currently in. There is no `requireAuth` call, no state check, and no size limit on the relayed fields.

3. **`weaponPick`, `weaponChange`, `angleChange`, `powerChange` relays: no authentication check, no state validation, no room membership verification beyond `client.roomId` being set**. An unauthenticated socket that somehow ends up with a `roomId` (e.g., it called `joinRoom` without a wager) can spam these relay events indefinitely.

4. **`rejoinRoom` session-hijack window**: The handler verifies the wallet signature before restoring the session, which is good. But the `pendingReconnects` map is keyed by **wallet address**, not by the old socket ID. If an attacker knows a victim's wallet address (public information on-chain), they can race the 30-second reconnect window by emitting `rejoinRoom` with a freshly signed message and the victim's wallet address. They cannot forge the signature, but if they independently control the wallet (e.g., shared wallet, key compromise), they can hijack the room slot.

5. **`broadcastRooms` emits to ALL connected sockets** (`io.emit`), not just lobby clients. Every room state change triggers a global broadcast. While the payload is deliberately minimal (`getOpenRooms()` returns at most 5 rooms with safe fields), the global broadcast pattern means every in-game client receives lobby updates. This is an amplification vector: rapidly creating/deleting rooms causes repeated `io.emit` calls hitting every connected socket.

---

## FULL ANALYSIS

### 1. Transport & Server Configuration

**File:** `server/index.js`, lines 31-36

```js
const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    }
})
```

CORS is correctly restricted to `CORS_ORIGINS` (env-configured, defaulting to `localhost:3000`). There is no wildcard.

**Missing: `maxHttpBufferSize`**. Socket.IO's default is 1 MB per message. The `giveTurn` handler relays `terrainData` (client-supplied object) and `turnResult` broadcasts a full 1200-element `heightmap` array. Without an explicit cap, the server accepts payloads up to the default 1 MB limit, which is enough to saturate broadcast buffers at scale. Recommended: set `maxHttpBufferSize: 64 * 1024` (64 KB) since the largest legitimate payload is `terrainGenerated` (~12 KB for the heightmap).

Per-IP connection limiting is implemented (100 connections/IP, `server/index.js` lines 41-67) via a middleware-level `Map`. This is adequate for DDoS mitigation at the connection level.

---

### 2. Per-Socket Rate Limiting

**File:** `server/socket-io/main.js`, lines 444-528

A per-socket ring-buffer rate limiter overrides `client.onevent` before any event handler runs. Key parameters:

- Global: **30 events/second** (drop at limit, disconnect at 90 events sustained for 5 seconds)
- Fire-specific: **2 fires/second**
- Room creation: **3 creates per 60 seconds**

This is O(1) per check via `Float64Array` ring buffers with no heap allocation. The escalation to disconnect (`client.disconnect(true)`) at 3x the limit sustained over 5 seconds is an appropriate defense-in-depth measure.

**Gap**: The `createRoom` rate limit fires on `eventName === 'createRoom'` only. It does not apply to `joinQueue`, which also triggers room creation server-side (lines 1256-1300). A client could flood `joinQueue` at 30 events/second (limited only by the global cap, not a queue-specific cap) causing repeated matchmaking pair attempts and room creation. The `joinQueue` handler does call `validateMatchMode` and `requireAuth` for wagered matches, but there is no per-event queue throttle separate from the global 30 events/second.

---

### 3. Authentication Architecture

**Authentication flow:**

1. Client calls `authenticate` with `{ walletAddress, message, signature, timestamp }`
2. `handleAuthenticate` (auth.js) verifies Ed25519 signature via `nacl.sign.detached.verify`
3. Message format `"SolShot Auth: <wallet> at <timestamp>"` checked; timestamp must be within 5 minutes
4. `client.isAuthenticated = true`, `client.walletAddress = walletAddress` set on socket object
5. `authenticatedWallets[client.id] = walletAddress` maintained in module-level Map

This is sound. The timestamp check (line 83, `auth.js`) prevents replay attacks. The message format check prevents cross-application signature reuse. NaCl verify is constant-time.

**JWT issued but not enforced on WebSocket**: `generateToken()` returns a JWT on auth success (token in `authResult`), but subsequent socket events check `client.isAuthenticated` (a boolean on the socket object), not the JWT. The JWT is effectively unused for WebSocket authorization. This is not a vulnerability per se (the socket object flag is server-controlled), but the JWT infrastructure adds confusion—it suggests a stateless auth model that is not actually implemented. If the JWT were to be used for HTTP REST calls in the future, its 24h expiry and the fact that it can be extracted from the `authResult` event (client-side storage) would need review.

**`rejoinRoom` re-verification**: Lines 784-803 correctly re-verify a fresh Ed25519 signature for rejoin. This prevents session hijacking by knowledge of the wallet address alone.

---

### 4. Complete Event Security Matrix

The following table covers all `client.on(...)` handlers registered in `main.js` (enumerated in source order).

| Event | Auth Required | Rate Limited | Payload Validated | State Guard | Room Isolation | Notes |
|---|---|---|---|---|---|---|
| `authenticate` | No (establishes auth) | Global 30/s | Null check + type | None | N/A | Sound. Timestamp replay protection. |
| `disconnect` | No | N/A | N/A | Yes (SETTLING guard) | client.roomId | Correct deferred cleanup. |
| `leaveRoom` | No | Global 30/s | None | None | client.roomId | No `requireAuth`. Low risk—only harms self. |
| `rejoinRoom` | Yes (re-verifies Ed25519) | Global 30/s | walletAddress, message, signature, timestamp | Checks pendingReconnects | client.roomId migrated | Sound. Full signature re-verification. |
| `deleteRoom` | **Yes** (`requireAuth`) | Global 30/s | None | SETTLING guard | isHost check | Correct. Host-only enforced. |
| `joinRoom` | Conditional (wagered rooms only) | Global 30/s | Null/object check | room.active check | roomId from payload | **FINDING**: Unauthenticated join allowed for free rooms. `client.roomId` set without auth. |
| `getRooms` | No | Global 30/s | None | None | N/A | Acceptable — read-only public list. |
| `createRoom` | Conditional (wagered only) | **3/60s + global** | Null + wager range | None | N/A | Free-room creation unrestricted beyond global cap. |
| `joinQueue` | Conditional (wagered only) | **Global 30/s only** | matchMode + wager validation | None | N/A | **FINDING**: No queue-specific rate limit. |
| `leaveQueue` | No | Global 30/s | None | None | N/A | Read-write to matchmakingQueues, safe. |
| `ready` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` state check | client.roomId | Sound. |
| `buyWeapon` | **Yes** (`requireAuth`) | Global 30/s | Null check, weaponId catalog lookup | `validateAction` (WEAPON_SHOP only) | client.roomId | Sound. Inventory dedup prevents double-buy. |
| `shopDone` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` | client.roomId | Sound. |
| `getShotInfo` | No (falls back to 0 balance) | Global 30/s | None | None | wallet lookup | Acceptable — read-only. |
| `getStats` | No (falls back to defaults) | Global 30/s | None | None | wallet lookup | Acceptable — read-only. |
| `prestigeBurn` | Implicit (wallet required) | Global 30/s | txSignature, burnAmount | None | wallet from authenticatedWallets | Sound. On-chain burn verification. |
| `weaponPick` | **No** | Global 30/s | Null check | **None** | client.roomId | **FINDING**: No auth, no state guard. Legacy relay. |
| `getWeaponArray` | **No** | Global 30/s | None | None | client.roomId | Legacy. Low risk (read-only from room). |
| `createWeaponArray` | **Yes** (`requireAuth`) | Global 30/s | count/max type check + capped | None (no state guard) | client.roomId | CSPRNG used. count capped at 100. |
| `shoot` (legacy relay) | **No** | **Fire ring 2/s + global** | power/rotation isFinite | `validateAction` | client.roomId | No auth. Fire rate limited. Sanitized before relay. |
| `escrowDepositConfirm` | **Yes** (`requireAuth`) | Global 30/s | rid + txSignature type check | On-chain deposit verification | `client.roomId !== rid` check | Sound. Cross-room check (SA-06). |
| `fire` | **Yes** (inline check) | **Fire ring 2/s + global** | `validateFireParams` (range + finite) | Turn ownership, inventory, sequence nonce | client.roomId | Sound. Server-authoritative physics. |
| `requestTerrain` | **Yes** (`requireAuth`) | Global 30/s | None | None | client.roomId | Terrain cached; second call re-sends without re-generating. |
| `weaponChange` | **No** | Global 30/s | Null check | **None** | client.roomId | **FINDING**: No auth, no state guard. Relay. |
| `angleChange` | **No** | Global 30/s | Null check | **None** | client.roomId | **FINDING**: No auth, no state guard. Relay. |
| `powerChange` | **No** | Global 30/s | Null check | **None** | client.roomId | **FINDING**: No auth, no state guard. Relay. |
| `positionUpdate` | **Yes** (`requireAuth`) | Global 30/s | isFinite x/y, clamped | Distance validation (400px dx, 200py dy) | client.roomId | Sound. Anti-teleport check present. |
| `stepLeft` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` + turn ownership | client.roomId | 4-step limit enforced. |
| `stepRight` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` + turn ownership | client.roomId | 4-step limit enforced. |
| `giveTurn` (legacy relay) | **No** | Global 30/s | Null check only | **None** | client.roomId | **FINDING**: No auth, no state guard, `terrainData` unbounded. |
| `requestTurn` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` | client.roomId | Sound. |
| `playAgainRequest` | **Yes** (`requireAuth`) | Global 30/s | None | `validateAction` (COMPLETE or ROUND_END only) | client.roomId | Sound. |

---

### 5. Detailed Findings

#### FINDING WS-01: `giveTurn` Relay — Unauthenticated, Unbounded `terrainData`
**Severity: Medium**
**File:** `server/socket-io/main.js`, lines 2479-2483

```js
client.on('giveTurn', (data) => {
    if (!data || typeof data !== 'object') return
    const { terrainData, pos1, pos2, rotation1, rotation2 } = data
    client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
})
```

This legacy relay has no `requireAuth` check, no match-state guard, and relays `terrainData` wholesale — it can be any object of any size the client sends, up to the 1 MB Socket.IO default. An adversarial client can send `{ terrainData: "<64KB string>" }` to their opponent continuously at 30 events/second. Since `giveTurn` is in the legacy relay category and `terrainData` is no longer functionally used (terrain is server-generated via `requestTerrain`), the fix is either deletion or a strict allowlist of numeric-only fields with an explicit size cap. The `recieveTurn` event name has a typo ("recieve") that also appears in client code.

**Recommendation:** Delete `giveTurn`/`recieveTurn` entirely since `requestTerrain` supersedes them. If backward compatibility is required, add `requireAuth`, state guard, and replace `terrainData` relay with a server-generated lookup.

---

#### FINDING WS-02: Unauthenticated Relay Events (`weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `shoot`)
**Severity: Low-Medium**
**File:** `server/socket-io/main.js`, lines 1650-1654, 2348-2368, 1697-1717

```js
client.on('weaponPick', (data) => {
    if (!data || typeof data !== 'object') return
    const { arrayIndex } = data
    client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
})
```

Five relay events process and forward data without verifying `client.isAuthenticated`. An unauthenticated socket that is in a room (possible for free/unranked rooms where `joinRoom` does not call `requireAuth`) can spam these relays to disrupt the opponent's UI state. The `shoot` event is partially mitigated by the fire-specific rate limit (2/s), but `weaponPick`, `weaponChange`, `angleChange`, and `powerChange` have no sub-rate limit beyond the global 30/s.

**Recommendation:** Add `if (!requireAuth(client, '<eventName>')) return` to all five relay handlers. Since the relay game was designed for authenticated play, this is a correctness fix as well as a security fix.

---

#### FINDING WS-03: `joinRoom` Allows Unauthenticated Join for Free Rooms
**Severity: Low**
**File:** `server/socket-io/main.js`, lines 955-1093

```js
client.on('joinRoom', async (data) => {
    // ...
    if (roomWager > 0) {
        if (!requireAuth(client, 'joinRoom')) return  // Auth only for wager > 0
        // ...
    }
    // No auth check for roomWager === 0
```

An unauthenticated client can join a practice/free room. Once `client.roomId` is set, the client can emit `weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `giveTurn`, and `shoot` (all unauthenticated relays) at the opponent. This is by design for guest/practice play, but the absence of documentation and the fact that these relay events are also sent during real matches means the attack surface for unintended relay-spam against a wagered player's opponent is non-zero (e.g., if a separate free-room socket ends up in the same room ID space — extremely unlikely with 4-byte hex IDs, 16 million combinations).

**Recommendation:** Document the intentional guest-play allowance explicitly. The combinatorial room ID space (16M) makes cross-room collision negligible. Primary fix is WS-02 (auth on relays).

---

#### FINDING WS-04: `joinQueue` Has No Queue-Specific Rate Limit
**Severity: Low**
**File:** `server/socket-io/main.js`, lines 1213-1389

The `createRoom` event has a dedicated ring-buffer limit (3 creates per 60 seconds). `joinQueue` has no equivalent. Both can trigger room creation: `joinQueue` creates a room when it finds a match. While the global 30 events/second cap constrains the rate, a client sending `joinQueue` 30 times per second for 60 seconds could trigger up to 30 room pairs if enough opponents are in the queue. `removeFromAllQueues(client.id)` is called at the start of `joinQueue`, preventing queue duplication per socket, but the global cap alone is a weaker control.

**Recommendation:** Add a `joinQueue`-specific rate limit analogous to `createRoom` (e.g., 5 per 60 seconds) using a dedicated ring buffer.

---

#### FINDING WS-05: Global `io.emit('setRooms')` Broadcast to All Sockets
**Severity: Low**
**File:** `server/socket-io/main.js`, lines 145-151

```js
function broadcastRooms(io) {
    if (broadcastTimer) return; // already scheduled
    broadcastTimer = setTimeout(() => {
        broadcastTimer = null;
        io.emit('setRooms', { rooms: getOpenRooms() });
    }, 100);
}
```

`io.emit` sends to every connected socket, including sockets inside active matches. The debounce (`broadcastTimer`) prevents more than one broadcast per 100ms, but a sustained burst of room creates/joins from multiple clients will cause a 10/s broadcast storm hitting all sockets. At scale (100+ concurrent connections), this is a CPU and network amplification vector.

The lobby data is minimal (5 rooms, safe fields only), so the information disclosure surface is low. The impact is primarily performance.

**Recommendation:** Segregate lobby sockets into a Socket.IO namespace or room (`io.to('lobby').emit(...)`) and have clients join/leave the `'lobby'` channel when entering/leaving the lobby screen. This limits the broadcast to clients that actually need it.

---

#### FINDING WS-06: Missing `maxHttpBufferSize` Configuration
**Severity: Low**
**File:** `server/index.js`, lines 31-36

The `socket.Server` constructor does not set `maxHttpBufferSize`. Socket.IO's default is `1e6` (1 MB). The largest legitimate payload types are:

- `terrainGenerated`: ~12 KB (1200-element integer array + metadata)
- `turnResult.terrainUpdate`: ~12 KB
- `rejoinSuccess.terrain.heightmap`: ~12 KB

Setting `maxHttpBufferSize` to 64 KB would cover all legitimate payloads while preventing a single frame from consuming 1 MB of server buffer memory.

**Recommendation:**
```js
const io = new socket.Server(server, {
    cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
    maxHttpBufferSize: 64 * 1024,  // 64 KB — covers all legitimate payloads
})
```

---

### 6. Reconnect Flow Security Assessment

**File:** `server/socket-io/main.js`, lines 776-923

The reconnect/rejoin flow is the most security-sensitive Socket.IO logic because it maps a new socket to an existing session with in-progress financial state.

**What is implemented:**
- Fresh Ed25519 signature required (lines 785-803): the attacker must sign a fresh auth message with the victim's private key.
- `pendingReconnects` keyed by wallet address: prevents two different wallets from claiming the same session.
- Reconnect window: 30 seconds (RECONNECT_WINDOW_MS).
- All session state migrated atomically: wager wallets, gold state, weapon inventory, match state, HP, scores, room slot.
- `disconnectTimers[walletAddress]` cancelled correctly on successful rejoin.

**Assessment:** The signature verification requirement means session hijacking requires cryptographic key compromise, not just knowledge of the wallet address. The flow is sound for the threat model.

**Minor observation:** The `pendingReconnects` object and `disconnectTimers` object use the wallet address as key (a public string). There is no collision risk since each wallet address is unique, but the objects are module-level and never GC'd except via explicit `delete`. In a high-churn scenario (many disconnects, no reconnects), stale entries would accumulate. The 30-second timer cleanup handles this for the reconnect case, but disconnects without a wallet (`walletAddress` undefined) go directly to `cleanupRoom` without ever being stored, so there is no leak path for unauthenticated disconnects.

---

### 7. Turn Sequence Nonce / Replay Protection

**File:** `server/socket-io/main.js`, lines 1849-1858

```js
const clientSeq = data.seq
if (clientSeq !== undefined) {
    if (clientSeq !== ms.turnSequence) {
        this.emit('fireRejected', { reason: 'Turn sequence mismatch (possible replay)' })
        return
    }
}
ms.turnSequence++
```

The sequence check is **optional** (`if (clientSeq !== undefined)`). If a client omits `seq`, the nonce check is bypassed entirely. This means the replay protection is an opt-in client behavior, not a server enforcement. A modified client can omit `seq` and fire without sequence validation.

The turn ownership check (`ms.currentTurn !== this.id`) still prevents out-of-turn fires. But replayed `fire` events from the current-turn player within the same turn (Socket.IO transport retries) could cause duplicate physics runs. The `safeHandler` catch prevents crashes, but the duplicate physics effect would be erroneous.

**Recommendation:** Make the sequence check mandatory:
```js
if (clientSeq === undefined || clientSeq !== ms.turnSequence) {
    this.emit('fireRejected', { reason: 'Turn sequence required and must match' })
    return
}
```

---

### 8. Room Isolation Assessment

Room isolation relies on `client.roomId` being set only by server-controlled `createRoom`, `joinRoom`, `joinQueue`, and `rejoinRoom` handlers. Clients cannot self-assign `client.roomId`. The room join pattern in Socket.IO (`client.join(roomId)`) is server-side only.

`escrowDepositConfirm` adds an explicit cross-room check (SA-06, line 1728):
```js
if (client.roomId !== rid) {
    client.emit('escrowError', { reason: 'Room ID mismatch' })
    return
}
```

Other handlers that take a `roomId` from the payload (e.g., `createRoom`, `joinRoom`) use the payload `roomId` only to look up room state; they set `client.roomId` themselves rather than trusting the payload. This is correct.

The `getOpenRooms()` helper (lines 160-178) caps the lobby list at 5 entries and serializes only `roomId`, `host.name`, `host.color`, `wager`, `matchMode`, `totalRounds`—no socket IDs, wallet addresses, or match state. This is appropriate.

---

### 9. Sensitive Data in Broadcasts

**`rejoinSuccess` broadcast** (lines 900-923): Contains `goldBalance`, `weapons`, `terrain.heightmap`, `tankPositions`, `matchState` (scores, HP, roundWins, currentTurn). This is sent only to the rejoining socket directly (`client.emit`), not room-broadcast. Acceptable.

**`turnResult` broadcast** (lines 2026-2049): `io.sockets.in(this.roomId).emit(...)` sends to both players in the room. Contains `damage`, `hp`, `scores`, `goldBalance` for both players. Both players are legitimately entitled to this information. Acceptable.

**`shopPhase` broadcast** (lines 1456-1469): `io.sockets.in(client.roomId).emit(...)` — contains both players' `goldBalance` and `inventory`. Both players receive each other's gold balances and starting inventories. This may be unintended: a player can see their opponent's shop purchases in real-time via the balance delta. This is a game-design choice rather than a security issue, but it could enable gold-based meta-gaming (deduce opponent's weapon from gold spent).

**`setRooms` global broadcast**: Contains only safe lobby-facing fields. No wallet addresses, socket IDs, or financial details. Acceptable.

---

### 10. Client Socket Setup

**File:** `client/src/socket/index.js`

```js
export const socket = io(serverUrl, {
  auth: tgInitData ? { telegramInitData: tgInitData } : {},
})
```

The socket is created as a module-level singleton and attached to `window.socket` in `App.js` line 20. This is the standard React-Phaser bridge pattern but means:
- Any JavaScript on the page can call `window.socket.emit(...)` with arbitrary events.
- If a third-party script is injected (XSS), it can emit socket events as the authenticated user.
- The CSP in `server/index.js` restricts `scriptSrc: ["'self'"]` which mitigates XSS injection of external scripts, but inline XSS (e.g., via unsanitized Phaser game object text) would still have access.

**`useSocket` hook** (`client/src/hooks/useSocket.js`): Uses a ref pattern to avoid stale closures. Correctly cleans up listeners on unmount via `socket.off`. No security concerns.

---

### 11. Summary of Security Controls Present (Positive Findings)

| Control | Location | Assessment |
|---|---|---|
| Per-socket ring-buffer rate limiter | main.js:444-528 | Strong. O(1), escalating disconnect. |
| Per-IP connection limit (100/IP) | index.js:41-67 | Adequate. |
| HTTP rate limit (100 req/15min) | index.js:99-107 | Standard. |
| Ed25519 wallet signature auth | auth.js | Sound. NaCl constant-time. |
| Timestamp replay protection (5 min) | auth.js:82-85 | Sound. |
| Rejoin re-verification | main.js:784-803 | Sound. Full signature re-check. |
| Settlement mutex (`withLock`) | guards.js:120-148 | Sound. Auto-release prevents deadlock. |
| Server-authoritative physics | main.js:1933-1943 | Critical security property maintained. |
| Turn ownership enforcement | main.js:1843-1847 | Sound. |
| Weapon inventory ownership check | main.js:1867-1873 | Sound. |
| `validateFireParams` range checks | guards.js:79-90 | Sound. NaN/Infinity rejected. |
| `sanitizeName` 20-char cap + regex | guards.js:98-106 | Sound. |
| CSPRNG room IDs (4 random bytes) | main.js:1163 | Sound. 16M ID space. |
| CSPRNG terrain seeds (16 bytes) | main.js:2293 | Strong. 128-bit entropy. |
| Cross-room isolation check (SA-06) | main.js:1728 | Good. Only on escrow event. |
| Anti-teleport position validation | main.js:2381-2393 | Sound. 400px dx / 200px dy limit. |
| 3-consecutive-timeout forfeit | main.js:309-311 | Prevents indefinite stalling. |
| `safeHandler` exception wrapper | guards.js:157-166 | Prevents unhandled rejection. |
| `validateAction` state machine | main.js, match.js | Prevents cross-state event abuse. |
| CORS restricted to known origins | index.js:27-29 | Correct. No wildcard. |

---

## Findings Summary Table

| ID | Severity | Event(s) Affected | Description |
|---|---|---|---|
| WS-01 | Medium | `giveTurn` | Unauthenticated relay, unbounded `terrainData` payload forwarded to opponent |
| WS-02 | Low-Med | `weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `shoot` | No auth check on relay events; unauthenticated sockets in free rooms can spam opponent UI |
| WS-03 | Low | `joinRoom` | Free-room joins allowed without authentication; sets `client.roomId`, enabling relay spam |
| WS-04 | Low | `joinQueue` | No queue-specific rate limit (only global 30/s applies); `createRoom` equivalent limit missing |
| WS-05 | Low | `broadcastRooms` → `io.emit` | Global broadcast to all sockets on every room change; performance amplification at scale |
| WS-06 | Low | Server-level | `maxHttpBufferSize` not configured; 1 MB default allows oversized frame allocation |
| WS-07 | Low | `fire` | Turn sequence nonce check is optional (`seq` field); replay protection can be bypassed by omitting the field |

---

## Recommended Fixes (Priority Order)

**P1 — WS-01**: Delete `giveTurn`/`recieveTurn` handlers (terrain is server-generated). If legacy support needed, add `requireAuth`, state guard, and drop `terrainData` entirely.

**P2 — WS-06**: Add `maxHttpBufferSize: 64 * 1024` to `socket.Server` constructor in `server/index.js`.

**P3 — WS-07**: Make `fire` sequence nonce mandatory (change `if (clientSeq !== undefined)` to always enforce).

**P4 — WS-02**: Add `if (!requireAuth(client, '<event>')) return` to `weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `shoot`.

**P5 — WS-04**: Add `joinQueue`-specific ring-buffer rate limit (5 per 60 seconds) mirroring `createRoom` pattern.

**P6 — WS-05**: Introduce a Socket.IO `'lobby'` room; clients join on entering `LobbyScreen` and leave on navigating away. Change `io.emit` to `io.to('lobby').emit` in `broadcastRooms`.
