# ERR-03: Rate Limiting & Resource Exhaustion

**task_id:** ERR-03
**auditor:** ERR-03
**focus:** Rate Limiting & Resource Exhaustion
**date:** 2026-02-23
**files_reviewed:**
- `server/socket-io/main.js` (primary)
- `server/index.js`
- `server/middleware/guards.js`
- `server/services/physics.js`

---

## CONDENSED SUMMARY

The server has meaningful rate-limiting coverage at the per-IP connection layer (100 connections/IP), the HTTP layer (100 req/15 min), and a per-socket ring-buffer system covering all events (30/s), fire events (2/s), and room creation (3/60s). The `withLock` mutex prevents concurrent settlement CPU spikes. However, seven gaps of varying severity remain.

**Critical gaps:**
1. `maxHttpBufferSize` is not set on the Socket.IO server — the default is 1 MB per message, meaning a single socket can send arbitrarily large payloads inside the WS frame (bypasses the Express body-parser limit).
2. The matchmaking queue has no per-socket depth limit. A single socket can continuously `joinQueue` (at 30 events/s) filling all queue buckets. Because `removeFromAllQueues` only removes one entry per socket (the first one it finds), a socket that abuses the wager-mismatch path can insert multiple entries into the same queue.
3. `joinQueue` is not separately throttled by the per-event ring. Only the global 30-events/sec applies, allowing a single connection to issue 30 queue-manipulation events per second.

**Medium gaps:**
4. The `ringCount` function iterates the entire ring on every call (O(n)), not just the occupied slots. For the eventRing (size 31) this is negligible, but the implementation is commented as O(1) which is inaccurate. The unused `head` parameter is never used inside the function body — confirming this is a linear scan.
5. The disconnect escalation threshold of `RL_DISCONNECT_MULT * RL_MAX_EVENTS = 90` events in 5 seconds is high. An attacker is allowed to drop 89 events before a disconnect, which means ~89 * (physics processing overhead) of CPU waste per connection window.
6. `authenticate` is not separately limited — it performs NaCl Ed25519 verification and a MongoDB lookup on every call, and is only bounded by the global 30 events/sec ring.
7. There is no global cap on the total number of in-memory rooms. At 3 room-creates per 60 seconds per socket, and 100 sockets per IP, one IP can create 300 rooms per minute with associated `matchStates`, `goldStates`, `weaponInventories`, `wagerStates`, and 1200-element `heightmap` arrays — all unbounded in aggregate.

---

## FULL ANALYSIS

### 1. HTTP Rate Limiting (`server/index.js`)

```js
// server/index.js lines 100-107
const httpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
})
app.use(httpLimiter)
```

**Assessment: ADEQUATE with minor caveats.**

- 100 requests per 15 minutes per IP is appropriate for an API that has only four HTTP endpoints (`/`, `/health`, `/stats`, `/api/admin/reload-keys`).
- `standardHeaders: true` sends `RateLimit-*` headers, `legacyHeaders: false` suppresses the older `X-RateLimit-*` set — this is current best practice with `express-rate-limit` v8.
- Body-parser is correctly limited to 1 MB: `express.json({limit: "1mb"})`.
- The rate limiter uses `req.ip` by default, which on Render (a reverse proxy) would be the proxy IP unless `app.set('trust proxy', 1)` is set. **This is not visible in the reviewed file.** If trust proxy is not configured, all requests appear to come from the same proxy IP and the limiter is bypassed for all users simultaneously.

**Finding ERR-03-F01 (MEDIUM): `trust proxy` not confirmed configured.** If `app.set('trust proxy', ...)` is absent, the HTTP rate limiter sees Render's internal proxy IP as the client address and applies a single shared bucket to all users.

---

### 2. Socket.IO `maxHttpBufferSize` (`server/index.js`)

```js
// server/index.js lines 31-36
const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    }
})
```

Socket.IO 4.x defaults to `maxHttpBufferSize: 1e6` (1 MB). This value is **not overridden** in the constructor. While 1 MB per WebSocket frame is a reasonable default, the application's actual event payloads are small (fire: angle + power + weaponId + optional position = ~50 bytes; createRoom: player name, color, wager = ~100 bytes). There is no per-payload size validation on individual socket event data beyond the `validatePayload` schema checks in guards.js, which only verify type and presence, not string length of arbitrary objects.

**Finding ERR-03-F02 (LOW-MEDIUM): `maxHttpBufferSize` not explicitly constrained.** Setting it to `1e4` (10 KB) or `1e5` (100 KB) would match actual payload requirements and reduce the blast radius of any future deserialization vulnerability. Currently defaults to 1 MB per WS message.

---

### 3. Per-Socket Ring-Buffer Rate Limiter (`server/socket-io/main.js`, lines 442–529)

```js
const RL_MAX_EVENTS = 30          // max events per second
const RL_MAX_FIRES = 2            // max fires per second
const RL_DISCONNECT_MULT = 3      // disconnect at 3x limit (90 events/sec)
const RL_DISCONNECT_WINDOW = 5000 // sustained for 5 seconds
const RL_WINDOW_MS = 1000
const RL_MAX_CREATES = 3
const RL_CREATE_WINDOW = 60000
```

**Implementation mechanism:** The `client.onevent` hook is patched on each connection. Three ring buffers (typed `Float64Array`) store timestamps of recent events. `ringCount()` counts entries newer than `now - windowMs`.

**Assessment: SOLID design with two implementation bugs.**

**Bug A — `ringCount` iterates full array, not occupied slots (ERR-03-F03 INFORMATIONAL):**

```js
// main.js line 466-473
function ringCount(ring, head, size, now, windowMs) {
    let count = 0
    const cutoff = now - windowMs
    for (let i = 0; i < size; i++) {  // iterates ALL slots
        if (ring[i] > cutoff) count++
    }
    return count
}
```

The `head` parameter is accepted but never used inside the loop. The function iterates every slot of the ring array. For new connections, `Float64Array` initializes all slots to `0.0`, and since `0 > (now - 1000)` is false for any sane timestamp, this is functionally correct. However, the comment says "O(1) per check, zero GC" — the check is O(ring.length), which is O(31) for the event ring. This is benign at current ring sizes but misleading documentation.

**Bug B — `createRoom` throttle is effective but `joinQueue` is not separately throttled (ERR-03-F04 MEDIUM):**

The ring-buffer middleware intercepts `createRoom` (max 3/60s) and `fire`/`shoot` (max 2/s). The `joinQueue` event is intercepted only by the global 30-events/sec limit. An attacker can call `joinQueue` 30 times per second, re-queuing under different wager amounts to fill all queue buckets.

```js
// main.js line 1246-1249
if (opponent.wager !== wagerAmount) {
    // Wager mismatch — do not pair, push joiner to queue instead
    queue.push({ ... });
    client.emit('queueWaiting', ...);
```

`removeFromAllQueues` finds only the **first** occurrence per socket:

```js
// main.js line 67-74
function removeFromAllQueues(socketId) {
    for (const [key, queue] of matchmakingQueues.entries()) {
        const idx = queue.findIndex(e => e.socketId === socketId);
        if (idx !== -1) {
            queue.splice(idx, 1);
```

If a socket calls `joinQueue` 30 times in one second with different `wagerAmount` values in a mode that does not need auth (practice, wager=0), each call triggers `removeFromAllQueues` (removes the most recent entry in that bucket), then appends a new entry to a different bucket. Net effect: a single socket can populate every queue bucket (`practice:1`, `practice:3`, `practice:5`, etc.) simultaneously, creating entries that will match and auto-create rooms when a real player queues. These phantom rooms then consume `matchStates`, `goldStates`, and `weaponInventories` memory indefinitely until the socket disconnects and `cleanupRoom` fires.

**Finding ERR-03-F04 (MEDIUM): `joinQueue` has no per-event throttle and `removeFromAllQueues` only removes one entry per queue per socket.** A single socket can fill multiple queue buckets and trigger unintended room creation.

---

### 4. Per-IP Connection Limiting (`server/index.js`, lines 38–66)

```js
const MAX_CONNECTIONS_PER_IP = 100;
const ipConnectionCounts = new Map();

io.use((socket, next) => {
    const ip = (socket.handshake.headers['x-forwarded-for'] || '')
                    .split(',')[0].trim()
               || socket.handshake.address;
    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }
    ipConnectionCounts.set(ip, current + 1);
    socket.on('disconnect', () => { ... ipConnectionCounts.set(ip, count - 1); });
    next();
});
```

**Assessment: GOOD implementation.**

- 100 connections per IP is reasonable and blocks naive socket-flood attacks.
- `x-forwarded-for` is split on comma and the leftmost entry taken (the original client IP). This is the correct approach for Render's proxy chain.
- Disconnect handler correctly decrements the count.
- One edge case: if the `disconnect` handler fires before `ipConnectionCounts.set` completes in a hypothetical race, the counter would go negative. In practice this cannot happen in Node.js's single-threaded event loop.

**Finding ERR-03-F05 (LOW): 100 connections per IP is high.** 100 connections from one IP is still enough to open 100 parallel sockets, each consuming ring-buffer memory (3 `Float64Array` instances + state variables per connection). At 100 sockets, 3 room-creates each = 300 rooms potentially created with full in-memory state. A value of 10–20 would be more appropriate for a 1v1 game. However, since each of those connections is also subject to per-socket rate limits, this is a containment gap rather than a direct attack path.

---

### 5. Room Creation Throttle and Unbounded `rooms` Map

```js
// main.js line 450-453
const RL_MAX_CREATES = 3
const RL_CREATE_WINDOW = 60000
const createRing = new Float64Array(RL_MAX_CREATES + 1)
```

Per socket: 3 rooms per 60 seconds. With 100 sockets per IP, that is 300 rooms/minute per IP. Each room entry allocates:
- `rooms` Map entry with `host`, `player`, `roomId`, `wager`, `matchMode`, `totalRounds`
- `matchStates[roomId]` — match state object
- `goldStates[roomId]` — gold balance object
- `weaponInventories[roomId]` — inventory object
- A 1200-element `heightmap` Float64 array is generated on `startRound` (`generateTerrain(1200, 800, seed32)`)

There is no global ceiling on `rooms.size`. Over time, a sustained campaign of 100 IPs creating rooms at maximum rate would generate 30,000 rooms per minute. Rooms are only cleaned up on `leaveRoom`, `disconnect`, or match completion.

**Finding ERR-03-F06 (MEDIUM): No global room count cap.** `rooms.size` is unbounded. A coordinated multi-IP attack can cause unbounded memory growth via `rooms`, `matchStates`, `goldStates`, `weaponInventories`. The `getOpenRooms()` function already caps the lobby broadcast to 5 rooms, but the underlying Map has no ceiling.

---

### 6. CPU Exhaustion via Physics (`server/services/physics.js`)

Each `fire` event triggers `processShot()` synchronously on the Node.js event loop. The physics constants are:

```js
// physics.js lines 54-55
const PHYSICS_DT = 1 / 60;
const MAX_TRAJECTORY_STEPS = 3000; // ~50 seconds of flight
```

Worst-case CPU cost analysis per `fire` event:

| Weapon | Type | Trajectories | Steps each | Step ops |
|--------|------|-------------|-----------|---------|
| Tommy Gun (weaponId 26) | `multi` | 12 | up to 3000 | Euler + terrain scan |
| Pineapple (weaponId 22) | `fragment` | 1 primary + 20 scatter (no trajectory per fragment, just blast calc) | 3000 | Euler |
| Chain Reaction (weaponId 21) | `chain` | 1 + 15 blasts | 3000 | Euler |
| Bouncer (Skipper, weaponId 20) | `bouncer` | 1 primary + up to 4 bounce segments | 4 × 3000 = 12000 | Euler |

The `processMultiShot` path for Tommy Gun computes 12 independent `calculateTrajectory` calls, each iterating up to 3000 physics steps. At 2 fires/second rate limit per socket (per the `fireRing`), one socket can trigger `12 × 3000 = 36,000` trajectory steps per second. With two sockets per room, this is `72,000` steps/second per room, each step doing floating-point arithmetic and a terrain array lookup.

The bounce path for Skipper (`bounceCount: 4`) re-calls `calculateTrajectory` after each bounce, rebuilding trajectory arrays of up to 3000 points and concatenating them into `fullTrajectory`. This means up to `5 × 3000 = 15,000` steps for a single Skipper shot.

**Finding ERR-03-F07 (LOW-MEDIUM): High-multiplicity weapons (Tommy Gun, Pineapple, Chain Reaction, Skipper) perform multiple full `MAX_TRAJECTORY_STEPS` loops synchronously on the event loop.** While the per-shot rate limit (2 fires/s) moderates this, the trajectory step cap of 3000 is applied per sub-projectile, not per `processShot` call. A global budget of, say, 5000 total steps per `processShot` call would bound the worst-case CPU block.

---

### 7. `authenticate` Event — No Dedicated Rate Limit

```js
// main.js line 533-553
client.on('authenticate', async (data) => {
    if (!data || typeof data !== 'object') { ... }
    const result = handleAuthenticate(client, data)   // NaCl Ed25519 verify + JWT generation
    if (result.success) {
        await loadMilestoneState(result.walletAddress)  // MongoDB query
    }
    client.emit('authResult', result)
})
```

`handleAuthenticate` calls `verifyWalletSignature()` (NaCl Ed25519) and `generateToken()` (JWT HMAC-SHA256). On success, it performs a MongoDB `findOne` via `loadMilestoneState`.

This event is only bounded by the global 30 events/second ring. That means up to 30 Ed25519 verifications + 30 MongoDB lookups per second per socket are possible. Ed25519 verify is fast (~0.1ms), but the MongoDB round-trips at 30/s per socket are a potential DB exhaustion vector if many sockets authenticate simultaneously.

**Finding ERR-03-F08 (LOW): `authenticate` lacks a dedicated per-socket throttle.** A dedicated ring (e.g., 1 authenticate per 2 seconds) would prevent DB hammering while leaving the UX unaffected since authentication is a one-time-per-connection operation.

---

### 8. Escalation Logic Correctness

```js
// main.js lines 488-494
if (dropCount >= RL_DISCONNECT_MULT * RL_MAX_EVENTS &&
    (now - firstDropAt) <= RL_DISCONNECT_WINDOW) {
    client.disconnect(true)
    return
}
```

`RL_DISCONNECT_MULT * RL_MAX_EVENTS = 3 * 30 = 90`. Disconnection fires when `dropCount >= 90` within 5 seconds. Before that, all dropped events are silently swallowed. An attacker sending 89 events/second (all drops except the first 30 allowed through) for 5 seconds never triggers disconnection because the counter resets:

```js
// main.js lines 499-501
if (dropCount > 0 && (now - firstDropAt) > RL_DISCONNECT_WINDOW) {
    dropCount = 0
}
```

The reset condition (`now - firstDropAt > 5000`) fires when the abuse pauses for 5 seconds. An attacker who sends burst-30, pause-5s, burst-30, pause-5s... never accumulates 90 drops, yet continuously bursts the allowed 30 events/second. This is the intended throttle behavior (allow 30/s, drop the rest silently), but the disconnect escalation is essentially unreachable in practice for well-timed attacks.

**Finding ERR-03-F09 (INFORMATIONAL): Disconnect escalation threshold is unreachable with timed burst attacks.** The 90-drop-in-5s threshold can be avoided by an attacker who fires in bursts of 30 with >5 second pauses. The global 30/s cap still applies (events above the cap are dropped), so this is an operational note, not a bypass.

---

## FINDING SUMMARY TABLE

| ID | Location | Severity | Description |
|----|----------|----------|-------------|
| ERR-03-F01 | `server/index.js:100` | MEDIUM | `trust proxy` not confirmed; HTTP rate limiter may key on proxy IP |
| ERR-03-F02 | `server/index.js:31` | LOW | `maxHttpBufferSize` not set; defaults to 1 MB per WS message |
| ERR-03-F03 | `server/socket-io/main.js:466` | INFO | `ringCount` iterates full array (O(n) not O(1) as documented); unused `head` param |
| ERR-03-F04 | `server/socket-io/main.js:1213` | MEDIUM | `joinQueue` not separately throttled; `removeFromAllQueues` removes only first entry per queue per socket |
| ERR-03-F05 | `server/index.js:41` | LOW | 100 connections/IP is high for a 1v1 game |
| ERR-03-F06 | `server/socket-io/main.js:24` | MEDIUM | No global room count ceiling; `rooms` Map is unbounded |
| ERR-03-F07 | `server/services/physics.js:55` | LOW | Multi-sub-projectile weapons apply `MAX_TRAJECTORY_STEPS` per sub-projectile, not per call |
| ERR-03-F08 | `server/socket-io/main.js:533` | LOW | `authenticate` has no dedicated throttle; up to 30 Ed25519 + MongoDB ops/s per socket |
| ERR-03-F09 | `server/socket-io/main.js:488` | INFO | Disconnect escalation is bypassable via timed bursts; 30/s global cap still holds |

---

## RECOMMENDATIONS

**Priority 1 — Fix `removeFromAllQueues` (ERR-03-F04):**

Change `findIndex` to `filter` to remove ALL entries for a socket from any single queue bucket before re-inserting:

```js
function removeFromAllQueues(socketId) {
    for (const [key, queue] of matchmakingQueues.entries()) {
        const before = queue.length;
        const filtered = queue.filter(e => e.socketId !== socketId);
        matchmakingQueues.set(key, filtered);
        if (filtered.length === 0) matchmakingQueues.delete(key);
    }
}
```

Also add a `joinQueue` entry to the ring-buffer middleware (max 2 per 10 seconds):

```js
if (eventName === 'joinQueue') {
    const queueCount = ringCount(queueRing, queueHead, queueRing.length, now, RL_QUEUE_WINDOW)
    if (queueCount >= RL_MAX_QUEUES) return
    queueRing[queueHead % queueRing.length] = now
    queueHead++
}
```

**Priority 2 — Add global room cap (ERR-03-F06):**

```js
const MAX_TOTAL_ROOMS = 500; // or env-configurable
if (rooms.size >= MAX_TOTAL_ROOMS) {
    client.emit('createRoomError', { reason: 'Server at capacity' });
    return;
}
```

**Priority 3 — Set `maxHttpBufferSize` (ERR-03-F02):**

```js
const io = new socket.Server(server, {
    cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e4  // 10 KB — ample for all game events
})
```

**Priority 4 — Confirm `trust proxy` (ERR-03-F01):**

Add before any middleware in `server/index.js`:

```js
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);  // Single hop: Render reverse proxy
}
```

**Priority 5 — Physics total step budget (ERR-03-F07):**

In `processShot`, pass a mutable step counter budget and share it across all sub-trajectories:

```js
const MAX_TOTAL_STEPS = 6000;
let stepBudget = { remaining: MAX_TOTAL_STEPS };
// Pass to calculateTrajectory, which decrements and stops early when exhausted
```

**Priority 6 — Authenticate throttle (ERR-03-F08):**

Add a dedicated `authenticateRing` (max 1 per 2000ms) inside the `onevent` hook, analogous to `createRing`.

---

## WHAT IS WORKING WELL

- Per-socket ring-buffer rate limiting design is correct and efficient for its intended purpose.
- Fire event throttle (2/s) prevents the most dangerous CPU exhaustion vector.
- `createRoom` per-socket throttle (3/60s) meaningfully limits room spam.
- Per-IP connection limit (100) blocks naive socket-flood DoS.
- HTTP body-parser limit (1 MB) prevents large POST payload attacks.
- Turn timer (60s) prevents indefinite open matches consuming server state.
- `withLock` per-room mutex prevents concurrent settlement CPU spikes.
- `safeHandler` wrapper prevents unhandled rejections from crashing the process.
- `process.on('uncaughtException')` and `unhandledRejection` handlers prevent process death.
