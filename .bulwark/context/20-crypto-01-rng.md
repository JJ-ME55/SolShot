# CRYPTO-01: Random Number Generation & Nonces

**task_id:** CRYPTO-01
**auditor:** CRYPTO-01
**generated:** 2026-02-23
**focus:** All randomness sources, PRNG seeding, nonces, replay protection
**files_analyzed:**
- `server/socket-io/main.js`
- `server/services/match.js`
- `server/services/physics.js`
- `server/middleware/auth.js`
- `client/src/scenes/main/index.js`
- `client/src/graphics/terrain.js`
- `client/src/classes/Weapon.js`
- `client/src/classes/Blast.js`
- `client/src/classes/Terrain.js`

---

## CONDENSED SUMMARY

### What is CSPRNG and secure

| Source | Generator | CSPRNG? | Notes |
|--------|-----------|---------|-------|
| Room ID | `crypto.randomBytes(4)` | YES | 32 bits — marginal for wagered matches |
| Terrain seed (128-bit) | `crypto.randomBytes(16)` | YES | Strong; only first 32 bits used |
| Tank spawn X positions | `crypto.randomInt(1000)` | YES | Per-round, server-side |
| Wind | `crypto.randomInt(121)` | YES | Per-round, server-side |
| First turn order | `crypto.randomInt(2)` | YES | Per-round, server-side |
| Weapon shop array | `crypto.randomBytes(safeCount * 4)` | YES | CSPRNG, but no host-only guard |
| Dev JWT secret fallback | `crypto.randomBytes(32)` | YES | Dev mode only |

### What is Math.random or deterministic

| Source | Generator | Critical? | Risk |
|--------|-----------|-----------|------|
| Client terrain (gameType4) | `Math.random` | LOW | Practice mode only; never used in wagered matches |
| Client visual particle effects | `Math.random` | NONE | Cosmetic only; not server-verified |
| Multi-hit weapon sub-spread | `weaponSeededRandom()` — mulberry32 seeded by weaponId ^ impactX ^ impactY | MEDIUM | Deterministic from public inputs; seed is predictable |
| Blast texture ID | `Math.random().toString(32)` | NONE | UI key only |
| Auth challenge | `Date.now()` timestamp | LOW | Timestamp-based, not random; replay window is 5 minutes |

### Identified issues

| ID | Severity | Issue |
|----|----------|-------|
| RNG-01 | MEDIUM | Room IDs are only 32 bits (4 hex bytes = 8 hex chars) — ~4 billion space. Brute-force by an active attacker polling `joinRoom` is feasible for high-value rooms |
| RNG-02 | MEDIUM | `createWeaponArray` has no host-only guard — the non-host player can call it mid-shop, overwrite the weapon array, and broadcast a new array to both clients |
| RNG-03 | LOW | `weaponSeededRandom` derives its seed deterministically from public, manipulable inputs (`weaponId`, `impactX`, `impactY`). A client that chooses impact coordinates can predict and bias sub-projectile spread. However, the server runs this independently and physics outcome is server-authoritative, so game outcome is not affected unless the UI visualization diverges from server physics |
| RNG-04 | LOW | Auth challenge uses `Date.now()` (not a random nonce). The 5-minute replay window is enforced server-side but an identical timestamp signature from a prior session within that window can be replayed. There is no server-side single-use nonce registry |
| RNG-05 | INFO | Full 128-bit terrain seed is stored and broadcast to clients (`seed: fullSeed`) but the PRNG only uses the first 32 bits. The remaining 96 bits are unused entropy. This is cosmetic waste, not a vulnerability |
| RNG-06 | INFO | `handleType4` (solo practice mode) uses `Math.random()` for first-turn order. This is isolated to a non-multiplayer, non-wagered code path and has no security impact |

---

## FULL ANALYSIS

### 1. Room ID Generation

**File:** `server/socket-io/main.js` lines 1163, 1256

```js
const roomId = crypto.randomBytes(4).toString('hex')
```

Both `createRoom` and the matchmaking queue auto-create path use `crypto.randomBytes(4)`, producing a 4-byte (32-bit) hex string (8 hex characters). This is CSPRNG — no timing or PRNG attacks apply.

**Issue RNG-01:** The keyspace is 2^32 (~4.29 billion). For a standard practice game this is acceptable. For High Roller matches with real SOL wagers, a determined attacker running automated `joinRoom` attempts could enumerate room IDs. With no join-rate limiting per room target and no room-membership proof required before a peek, the attacker can observe the `joinRoom` error/success response to infer room existence. At 100 join attempts/second a full brute-force would take ~500 days, but targeted attacks on known active rooms (derived from monitoring the public `broadcastRooms` event which exposes the full room list) reduce the problem to pure eavesdropping rather than brute force.

Recommendation: Increase to `crypto.randomBytes(16)` (128-bit). Also consider whether `broadcastRooms` should omit wagered private rooms.

---

### 2. Terrain Seed Generation

**File:** `server/socket-io/main.js` lines 2292–2297; `server/services/physics.js` lines 322–360, 429–437

```js
// main.js
const fullSeed = crypto.randomBytes(16).toString('hex');  // 128 bits
const seed32 = parseInt(fullSeed.slice(0, 8), 16) >>> 0;  // First 32 bits
const { path, heightmap } = generateTerrain(1200, 800, seed32)

// physics.js — mulberry32 PRNG
function seededRandom(seed) {
    let s = seed;
    return function () {
        s |= 0;
        s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
```

The server generates a 128-bit CSPRNG value, derives a 32-bit seed from it, and uses the mulberry32 PRNG to deterministically generate terrain. The full 128-bit seed is stored (`room.terrainSeed = fullSeed`) and broadcast to both clients (`seed: fullSeed` in `terrainGenerated`). The client calls `terrain.setPath(path)` — it receives the server-generated path directly, not just the seed, so clients do not independently re-run the PRNG. This is the correct pattern.

**Issue RNG-05 (INFO):** The 128-bit seed is stored and sent to clients, but only 32 bits are consumed. This wastes 96 bits of entropy. While not a vulnerability, it is misleading: the comment "128-bit CSPRNG entropy" implies the full entropy is used. True terrain uniqueness is bounded by the 32-bit seed (~4 billion distinct terrains). This is fine for a game but should be noted.

---

### 3. Tank Spawn Positions

**File:** `server/services/physics.js` lines 448–456

```js
export function generateTankPositions(heightmap, width = TERRAIN_WIDTH) {
    const hostX = Math.floor(width * 0.2 + (crypto.randomInt(1000) / 1000) * width * 0.15);
    const playerX = Math.floor(width * 0.65 + (crypto.randomInt(1000) / 1000) * width * 0.15);
    ...
}
```

Spawn X positions use `crypto.randomInt(1000)` — proper CSPRNG. Each player spawns in a fixed horizontal zone (host: 20–35% of width; player: 65–80% of width), so positions are predictable to within 180 pixels but the exact pixel is CSPRNG-derived. Server-generated and transmitted to clients via `terrainGenerated.tankPositions`. The client does not independently compute spawn positions for gameType3 (multiplayer).

No issues.

---

### 4. Wind Generation

**File:** `server/services/physics.js` lines 62–64; called from `server/socket-io/main.js` line 2301

```js
export function generateWind() {
    return crypto.randomInt(121) - 60;
}
```

Integer in [-60, 60], CSPRNG, server-side. Wind is generated once per round at terrain request time and sent to both clients in `terrainGenerated`. The client stores it (`this.wind = wind || 0`) and uses it for visual projectile trajectory only — the authoritative physics run on the server using `room.wind`.

No issues.

---

### 5. First Turn Order

**File:** `server/services/match.js` lines 131–137

```js
export function getNextTurn(matchState, hostId, playerId) {
    if (!matchState.currentTurn) {
        // First turn — random
        return crypto.randomInt(2) === 0 ? hostId : playerId;
    }
    // Alternate turns
    return matchState.currentTurn === hostId ? playerId : hostId;
}
```

First turn is CSPRNG. Subsequent turns strictly alternate (no randomness). The result is sent to clients in `terrainGenerated.firstTurn` and enforced server-side — a client claiming it is their turn when it isn't is rejected at the `fire` handler: `if (ms.currentTurn && ms.currentTurn !== this.id)`.

No issues.

---

### 6. Weapon Shop Array (createWeaponArray)

**File:** `server/socket-io/main.js` lines 1666–1691

```js
client.on('createWeaponArray', (data) => {
    if (!requireAuth(client, 'createWeaponArray')) return
    if (!data || typeof data !== 'object') return
    const { count, max } = data
    var room = findRoom(client.roomId)
    if (!room) return
    const safeCount = Math.min(Math.max(0, Math.floor(count)), 100)
    const safeMax = Math.max(1, Math.floor(max))
    const randomBytes = crypto.randomBytes(safeCount * 4)
    var randomArray = []
    for (let index = 0; index < safeCount; index++) {
        const val = randomBytes.readUInt32LE(index * 4)
        randomArray.push(val % safeMax)
    }
    room.randomArray = randomArray
    persistRoom(room);
    io.sockets.in(client.roomId).emit('setWeaponArray', {randomArray: room.randomArray})
})
```

The random generation itself is CSPRNG (`crypto.randomBytes`). However:

**Issue RNG-02 (MEDIUM):** There is no check that `client.id === room.host.socketId` (host-only guard). Any authenticated player in the room can call `createWeaponArray` at any time, overwriting the current weapon array for both players and broadcasting it. The non-host (joiner) can:
1. Call `createWeaponArray` repeatedly to fish for a favorable weapon distribution.
2. Generate the array themselves rather than letting the host trigger it.
3. Call it during mid-shop after the host has already chosen weapons, altering the joiner's own or the host's available weapon pool display.

The guard present (`requireAuth`) only checks authentication, not role. The shop state (`WEAPON_SHOP`) check for other shop events is absent here. During a wagered match this gives the non-host an informational advantage in weapon selection.

Recommendation: Add `if (room.host.socketId !== client.id) return` before generating the array. Alternatively move array generation entirely to the server on `requestTerrain` or shop start, removing the client-triggered event entirely.

---

### 7. Multi-Hit Weapon Sub-Spread (weaponSeededRandom)

**File:** `server/services/physics.js` lines 520–522

```js
function weaponSeededRandom(weaponId, impactX, impactY) {
    const seed = (weaponId * 73856093) ^ (Math.floor(impactX) * 19349663) ^ (Math.floor(impactY) * 83492791);
    return seededRandom(Math.abs(seed));
}
```

This is a deterministic PRNG seeded from `weaponId ^ impactX ^ impactY`. Used for multi-hit weapon sub-projectile spread (cluster bombs, fragmentation). The intent is that server and client will generate the same spread pattern for visual consistency.

**Issue RNG-03 (LOW):** The seed is derived entirely from values that are either fixed (`weaponId`) or influenced by the shooter's aim (`impactX`, `impactY`). A player who carefully controls their aim angle and power can predict the exact sub-projectile landing pattern before firing. This is only relevant for multi-hit weapons (e.g., cluster, frag). Since the server computes damage independently, an attacker cannot change *whether* damage is dealt, but they can predict the exact damage distribution (which sub-fragments hit the opponent vs. miss) before the shot is committed.

The practical exploit path: precompute spread patterns for all integer `impactX`/`impactY` values to find firing angles that maximize expected damage against a known opponent position. This is a superplay optimization rather than a direct financial attack, but it does break the fairness intent of spread randomness in wagered matches.

Recommendation: Replace `weaponSeededRandom` with CSPRNG for spread angle selection on the server, returning the pre-computed spread to the client alongside the `turnResult` trajectory (already returned as part of the authoritative physics response). This removes the need for client-side PRNG determinism for this case.

---

### 8. Auth Challenge Nonce

**File:** `server/middleware/auth.js` lines 75–87; `client/src/wallet/WalletContext.js` lines 174–175

```js
// Client
const timestamp = Date.now();
const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;

// Server verification
export function verifyAuthMessage(message, walletAddress, timestamp) {
    const expected = `SolShot Auth: ${walletAddress} at ${timestamp}`;
    if (message !== expected) { ... }
    const age = Date.now() - timestamp;
    if (age > AUTH_TIMEOUT || age < -60000) { ... }  // AUTH_TIMEOUT = 5 minutes
    return { valid: true };
}
```

The auth challenge is a timestamp-based message rather than a server-issued cryptographic nonce. The implications:

**Issue RNG-04 (LOW):** There is no server-side nonce registry. Any valid `(walletAddress, timestamp, signature)` tuple from within the past 5 minutes can be replayed to authenticate a new socket connection. In the standard flow this is only exploitable if an attacker intercepts or observes a signature (e.g., via network interception or a compromised client). For a WebSocket game where authentication is per-connection and sessions are short-lived this is low-severity, but for wagered matches it represents a potential session hijack vector if traffic is observable.

No server-issued challenge nonce is generated — the server never sends a `nonce` or `challenge` event that the client must sign. The timestamp is entirely client-chosen.

Recommendation: Issue a server-generated CSPRNG nonce per socket on connect (`crypto.randomBytes(16).toString('hex')`), send it to the client as a `challenge` event, and require the signed message to include it: `SolShot Auth: ${wallet} nonce:${serverNonce}`. Store used nonces for the auth window duration (5 minutes × expected concurrent connections = minimal memory).

---

### 9. Client-Side Math.random Usage

**Files:** `client/src/graphics/terrain.js`, `client/src/scenes/main/index.js` (handleType4), `client/src/classes/Blast.js`, `client/src/weapons/packs/Standard/Standard.js`

#### terrain.js — drawTerrain / makePath

```js
y = height * 0.65 + height * 0.3 * (1 - Math.random() * Math.random())
factor = Math.floor(Math.random() * 1)
radius = Math.floor(Math.random() * 30 + 10)
angle = Math.random() * Math.PI - Math.PI/2
```

This `Math.random`-based path generation is called by `terrain.create()`, which is called from `handleType4` (solo/practice mode). In multiplayer (gameType3), `terrain.setPath(path)` is called with the server-supplied path instead. The client never generates terrain independently for a wagered match.

No security impact.

#### Main scene handleType4 — first turn order

```js
if (Math.random() > 0.5) {
    this.tank1.active = true;
    this.activeTank = 1;
} else { ...
```

Solo practice mode only (gameType4). Not connected to Socket.IO, no server interaction, no wager. No security impact.

**Issue RNG-06 (INFO):** Document that `handleType4` is the only code path that uses client-side `Math.random` for turn order. If gameType4 ever receives multiplayer capability, this must be replaced.

#### Blast.js — texture ID

```js
this.textureId = Math.random().toString(32).slice(2, 7)
```

Used as a unique key for a Phaser canvas texture. Purely cosmetic/UI. Collision chance is negligible at 5 base-32 characters (~1 in 33 million). No security impact.

#### Standard.js — particle effects

All `Math.random()` calls in Standard.js are visual-only: particle spread vectors, animation durations, color selection, jitter offsets. None of these affect game state or server-authoritative outcomes. No security impact.

#### Weapon.js — spread calculation

```js
var angle = Math.random() * Math.PI * 2
var dist = Math.random() * spread
```

Client-side visual spread for "shotgun" style weapons. The server computes damage from the authoritative trajectory; the client visual is decorative. No security impact.

---

### 10. Turn Sequence Nonce (Replay Protection)

**File:** `server/socket-io/main.js` lines 1849–1858; `server/services/match.js` line 100; `client/src/scenes/main/index.js` lines 422, 491–492

```js
// match.js — initial nonce
turnSequence: 0,

// main.js fire handler — validation
const clientSeq = data.seq
if (clientSeq !== undefined) {
    if (clientSeq !== ms.turnSequence) {
        this.emit('fireRejected', { reason: 'Turn sequence mismatch (possible replay)' })
        return
    }
}
ms.turnSequence++

// Client sends seq with fire
socket.emit('fire', {
    angle, power, weaponId,
    seq: this._turnSeq,
    position: { x: tank.x, y: tank.y },
});
// Client updates seq from turnResult
this._turnSeq = data.seq;
```

A monotonically incrementing integer nonce (`turnSequence`) is used to prevent `fire` event replay. The server starts at 0, increments on each valid fire, and the client must always send the current expected value. The nonce is reset to 0 at round start (`resetForNextRound`).

The nonce check is conditional: `if (clientSeq !== undefined)`. A client that omits `seq` entirely (sends `{ angle, power, weaponId }` without `seq`) bypasses the replay check entirely.

This is a significant gap: the check only fires when the client provides a `seq` field. A malicious or buggy client can omit the field and fire without nonce validation. The `validateFireParams` function should enforce that `seq` is a required field (present and a non-negative integer).

---

### 11. JWT Secret

**File:** `server/middleware/auth.js` lines 19–27

```js
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] FATAL: JWT_SECRET must be set in production');
        process.exit(1);
    }
    const devSecret = crypto.randomBytes(32).toString('hex');
    ...
    return devSecret;
})();
```

In development, the secret is CSPRNG-generated per process start, which is correct (no hardcoded value). In production, `JWT_SECRET` must be set or the process exits. No issues with the generation itself.

---

## Complete Randomness Source Map

| # | Source | File | Line | Generator | CSPRNG? | Server? | Predictable? | Game-critical? |
|---|--------|------|------|-----------|---------|---------|--------------|----------------|
| 1 | Room ID | main.js | 1163, 1256 | `crypto.randomBytes(4)` | YES | YES | NO | YES |
| 2 | Terrain seed (128-bit) | main.js | 2293 | `crypto.randomBytes(16)` | YES | YES | NO | YES |
| 3 | Terrain PRNG (mulberry32) | physics.js | 429 | seededRandom(seed32) | NO (PRNG) | YES | YES (from seed) | YES (seed is secret) |
| 4 | Tank spawn X (host) | physics.js | 450 | `crypto.randomInt(1000)` | YES | YES | NO | YES |
| 5 | Tank spawn X (player) | physics.js | 451 | `crypto.randomInt(1000)` | YES | YES | NO | YES |
| 6 | Wind | physics.js | 63 | `crypto.randomInt(121)` | YES | YES | NO | YES |
| 7 | First turn order | match.js | 134 | `crypto.randomInt(2)` | YES | YES | NO | YES |
| 8 | Weapon shop array | main.js | 1681 | `crypto.randomBytes(safeCount*4)` | YES | YES | NO | YES (biasable) |
| 9 | Multi-hit spread angles | physics.js | 521 | weaponSeededRandom (mulberry32) | NO (PRNG) | YES | YES (public seed) | MEDIUM |
| 10 | Auth challenge | auth.js / WalletContext.js | — | `Date.now()` | NO | CLIENT | YES (timestamp) | LOW |
| 11 | Client terrain (practice) | terrain.js | 64+ | `Math.random` | NO | NO (client) | NO | NO (practice only) |
| 12 | Client first-turn (practice) | scene/index.js | 954 | `Math.random` | NO | NO (client) | NO | NO (practice only) |
| 13 | Blast texture ID | Blast.js | 30 | `Math.random` | NO | NO (client) | NO | NO (cosmetic) |
| 14 | Particle effects | Standard.js | many | `Math.random` | NO | NO (client) | NO | NO (cosmetic) |
| 15 | Dev JWT secret | auth.js | 24 | `crypto.randomBytes(32)` | YES | YES | NO | YES (dev only) |

---

## Issue Register

### RNG-01 — Room ID keyspace too small for wagered matches
- **Severity:** MEDIUM
- **File:** `server/socket-io/main.js` lines 1163, 1256
- **Detail:** `crypto.randomBytes(4)` = 32-bit = ~4.29 billion possible IDs. All active rooms are exposed via `broadcastRooms`. An attacker can enumerate active room IDs by polling `joinRoom` and observing error responses. For high-value wagered matches this creates a room hijacking risk.
- **Fix:** Increase to `crypto.randomBytes(16)`. Optionally suppress wagered/private rooms from `broadcastRooms`.

### RNG-02 — Non-host can overwrite weapon shop array
- **Severity:** MEDIUM
- **File:** `server/socket-io/main.js` lines 1666–1691
- **Detail:** `createWeaponArray` lacks a host-only check. Any authenticated socket in a room can emit this event, overwrite `room.randomArray`, and broadcast a new array. The non-host can repeatedly call it during the shop phase to fish for favorable weapon options. This is a fairness violation in wagered matches.
- **Fix:** Add `if (!room.host || room.host.socketId !== client.id) return` before the CSPRNG block.

### RNG-03 — weaponSeededRandom seed is derived from public, manipulable inputs
- **Severity:** LOW
- **File:** `server/services/physics.js` lines 520–522
- **Detail:** Seed = `weaponId ^ impactX ^ impactY`. Since `weaponId` is fixed and impact coordinates are controlled by the shooter's aim, a sophisticated player can precompute spread patterns for all practical aim angles and select the one with optimal sub-fragment distribution.
- **Fix:** Use `crypto.randomInt` or CSPRNG-derived spread angles on the server and include them in the `turnResult` response to the client.

### RNG-04 — Auth challenge is timestamp, not a server-issued nonce; 5-minute replay window
- **Severity:** LOW
- **File:** `server/middleware/auth.js` lines 75–87; `client/src/wallet/WalletContext.js` line 174
- **Detail:** The signed message contains only `walletAddress + timestamp`. No server-generated random nonce. An intercepted signature from within the past 5 minutes can be replayed by an attacker to authenticate a new socket as the victim. The timestamp is fully client-chosen.
- **Fix:** Issue a CSPRNG challenge nonce per socket on connect, require it in the signed message, and invalidate after first use.

### RNG-05 — 128-bit seed generated but only 32 bits consumed (INFO)
- **Severity:** INFO
- **File:** `server/socket-io/main.js` lines 2293–2297
- **Detail:** `crypto.randomBytes(16)` generates 128 bits but only `fullSeed.slice(0, 8)` (first 32 bits) is used as the mulberry32 seed. The comment implies 128-bit entropy but actual terrain diversity is bounded by 2^32.
- **Fix:** Either use `crypto.randomBytes(4)` for the seed (honest about what is consumed) or switch to a 128-bit PRNG (e.g., xoshiro256**).

### RNG-06 — Fire sequence nonce check is optional (seq field not required)
- **Severity:** LOW (related to replay protection, not pure RNG)
- **File:** `server/socket-io/main.js` lines 1849–1856
- **Detail:** `if (clientSeq !== undefined)` — a client omitting the `seq` field bypasses the monotonic nonce check entirely. A malicious client can omit `seq` and fire without nonce validation, enabling a limited replay window.
- **Fix:** In `validateFireParams`, require that `seq` is present and is a non-negative integer. Reject fires that omit it.

---

## Key Positive Findings

1. All five primary game-state randomness sources (room ID, terrain, spawn, wind, turn order) use Node.js `crypto` module — CSPRNG throughout.
2. The terrain generation model is correct: server generates path from seeded PRNG and sends the computed path to both clients. Clients do not independently run the PRNG for game-state terrain.
3. The turn sequence nonce (`turnSequence`) exists and is enforced, preventing the most direct fire-replay attack — the bypass via omitted `seq` is a hardening gap, not a complete absence.
4. Wind is server-authoritative: even if a client tampers with `this.wind` locally, the server recomputes trajectory using `room.wind`.
5. Spawn positions are not sent as trusted client inputs — the server stores and uses `room.host.pos` / `room.player.pos` from `generateTankPositions`, and the fire handler uses server positions with only a bounded tolerance for movement (`dx <= 400 && dy <= 200`).
