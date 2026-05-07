# 07 - Oracle & External Data Trust Analysis

**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2025-02-14
**Scope**: All server source files — Solana RPC oracle trust, timestamp validation, PRNG predictability, external data trust boundaries, Socket.IO event ordering
**Severity Scale**: CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Executive Summary

The SolShot server relies on three categories of external/oracle data: (1) Solana RPC for wallet balance verification, (2) system clock for auth timestamps, and (3) `Math.random()` for game-critical decisions. Every category has exploitable weaknesses. The most dangerous pattern is the **fail-open balance check** in `joinRoom`, which lets players with zero balance enter wagered matches when the RPC is unavailable. Combined with the fact that settlement is a stub (no actual SOL transfers), the economic layer has no real enforcement. The PRNG issues (terrain prediction, first-turn prediction, room ID prediction) are secondary but become exploitable by any player who understands the system.

**Finding Count**: 14 findings (3 CRITICAL, 5 HIGH, 4 MEDIUM, 2 LOW)

---

## Finding OD-01: RPC Balance Check Fails Open — Zero-Balance Bypass

| Field | Value |
|-------|-------|
| **Severity** | **CRITICAL** |
| **Location** | `server/socket-io/main.js:306-317` |
| **Category** | Oracle Trust / Fail-Open |

### Description

When a player joins a wagered room, the server calls `verifyBalance()` to check that the joiner has sufficient SOL. However, the guard condition on line 308 is:

```javascript
if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
    // Only reject if we got a real balance back and it's insufficient
    client.emit('joinRoomError', { ... })
    return
}
```

This means: if `balance === 0`, the player is **never rejected**, even if they genuinely have zero SOL. The code comment says "best-effort -- skip if RPC unavailable" but the actual logic is: **any wallet returning 0 balance passes the check**.

### Root Cause

`verifyBalance()` in `solana.js:95-102` catches ALL errors and returns `{ sufficient: false, balance: 0 }`. The `joinRoom` handler then treats `balance === 0` as "RPC was probably unavailable" rather than "wallet is empty." There is no distinction between "RPC error" and "RPC returned 0 legitimately."

### Exploit Scenario

1. Attacker creates a brand-new Solana wallet with 0 SOL.
2. Attacker connects to a wagered room (e.g., 0.5 SOL wager).
3. `verifyBalance()` calls RPC, gets `balance: 0` (correct -- wallet is empty).
4. `joinRoom` checks `balanceCheck.balance > 0` -- this is `false`, so the rejection block is **skipped**.
5. Attacker enters the match, plays for free. If settlement were implemented, the attacker loses nothing (no SOL to claim) while the opponent risks their wager.

Even without this exploit, if the Solana RPC is down, rate-limited, or returns errors, **all** joiners pass the balance check by default. An attacker could deliberately trigger RPC rate-limiting to guarantee this path.

### Recommendation

1. **Distinguish RPC error from genuine zero balance.** Return a tri-state from `verifyBalance()`:
   ```javascript
   // Return { sufficient: bool, balance: number, rpcError: bool }
   catch (err) {
       return { sufficient: false, balance: null, rpcError: true };
   }
   ```
2. **Fail closed on RPC error for wagered matches.** If `rpcError === true` and `roomWager > 0`, reject the join:
   ```javascript
   if (balanceCheck.rpcError) {
       client.emit('joinRoomError', { reason: 'Cannot verify balance. Try again.' });
       return;
   }
   ```
3. **Always reject balance === 0 for wagered matches.** A wallet with 0 SOL can never pay a wager.

---

## Finding OD-02: RPC `getBalance()` Returns 0 on Error — Silent Data Loss

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/services/solana.js:196-206` |
| **Category** | Oracle Trust / Error Masking |

### Description

The standalone `getBalance()` function catches all errors and returns `0`:

```javascript
export async function getBalance(walletAddress) {
    // ...
    try {
        const lamports = await conn.getBalance(pubkey);
        return lamports / LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('[Solana] Balance error:', err.message);
        return 0;
    }
}
```

Any caller receiving `0` cannot distinguish between "wallet has 0 SOL" and "RPC is unavailable." This is the same error-masking pattern as OD-01 but in the general-purpose balance function.

### Exploit Scenario

If this function is ever used for display or decision-making (e.g., showing a player their balance before wagering), a temporary RPC outage would show all wallets as having 0 SOL. A malicious RPC endpoint (see OD-03) could always return 0 to prevent players from wagering, or return inflated balances to trick them into over-wagering.

### Recommendation

Return `null` or throw on error instead of returning a valid-looking `0`. Force callers to explicitly handle the error case.

---

## Finding OD-03: Solana RPC Endpoint Not Pinned — Spoofing via Environment Variable

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/services/solana.js:22` |
| **Category** | Oracle Trust / Configuration |

### Description

```javascript
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
```

The RPC endpoint is configurable via environment variable with a **devnet** fallback. There are several issues:

1. **Devnet fallback in production**: If `SOLANA_RPC` is unset, all balance checks go to devnet. Devnet balances are free (airdrop) and meaningless. A player could airdrop 1000 SOL to their devnet wallet and pass any balance check.
2. **No TLS certificate pinning**: A man-in-the-middle could redirect RPC calls to a malicious endpoint that returns fabricated balances.
3. **Single RPC endpoint**: No failover, no quorum. If the single RPC node is compromised or returning stale data, the server has no way to detect it.
4. **No commitment level enforcement**: Line 44 uses `'confirmed'` commitment but this is only set at connection time. Individual `getBalance` calls do not override this, meaning cached/stale RPC responses could be returned.

### Exploit Scenario

1. Operator deploys server without setting `SOLANA_RPC`.
2. Server falls back to devnet.
3. Attacker airdrops free SOL on devnet, passes balance checks, and enters wagered matches.
4. If settlement were ever implemented on mainnet, the attacker's devnet balance would be irrelevant -- they have no mainnet funds.

### Recommendation

1. **Require `SOLANA_RPC` in production.** Throw on startup if not set.
2. **Validate the RPC URL is mainnet** by checking genesis hash or cluster identity.
3. **Use multiple RPC endpoints** with a quorum check for balance verification on wagered matches.
4. **Pin the commitment level** to `'finalized'` for balance checks that gate financial decisions.

---

## Finding OD-04: No RPC Response Staleness Detection

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/services/solana.js:80-103` |
| **Category** | Oracle Trust / Stale Data |

### Description

`verifyBalance()` calls `conn.getBalance()` which returns the balance at some recent slot. There is no check on:
- The **slot number** of the response (how recent is this data?)
- The **block time** of the slot
- Whether the response is from a **cached** RPC layer

Solana RPC nodes can lag behind the network. The `confirmed` commitment level means the balance could be 1-2 slots behind (~800ms). For rapid deposit-then-join attacks, this window matters.

### Exploit Scenario

1. Attacker has a funded wallet and creates room A with a wager.
2. Attacker initiates a withdrawal transaction from their wallet.
3. Within the same second, attacker joins room B from a second session. The RPC returns the pre-withdrawal balance (stale by 1-2 slots).
4. Attacker passes the balance check for room B despite having already committed those funds.

This is a "double-entry" attack exploiting RPC propagation delay. Because settlement is a stub, this is theoretical today but becomes critical when real SOL transfers are implemented.

### Recommendation

1. Use `'finalized'` commitment for balance checks on wagered matches.
2. Call `getSlot()` alongside `getBalance()` and reject if the slot is more than 5 behind the current tip.
3. Implement a server-side "pending wager" lock per wallet to prevent double-entry.

---

## Finding OD-05: Auth Timestamp Window Allows Client Clock Manipulation

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/middleware/auth.js:72-74` |
| **Category** | Timestamp Validation / Clock Skew |

### Description

```javascript
const age = Date.now() - timestamp;
if (age > AUTH_TIMEOUT || age < -60000) {
    return { valid: false, reason: 'Auth message expired' };
}
```

The auth message format is `"SolShot Auth: <wallet> at <timestamp>"` where `timestamp` is provided by the client. The server checks:
- `age > AUTH_TIMEOUT` (5 minutes) -- message is too old
- `age < -60000` -- message is more than 60 seconds in the future

**Issues:**
1. The **future allowance of 60 seconds** (`-60000`) means a client can set their timestamp up to 60 seconds in the future, effectively extending the auth window to 5 minutes + 60 seconds = 6 minutes.
2. **No NTP enforcement**: If the server clock drifts, the entire window shifts. A server clock 30 seconds behind real time means clients get an effective 5.5-minute window.
3. **The client controls the timestamp entirely**: The timestamp is embedded in the signed message, but the client chooses it. A sophisticated attacker signs a message with a timestamp 59 seconds in the future, gaining maximum window extension.

### Exploit Scenario

1. Attacker signs auth message with timestamp = `Date.now() + 59000` (59 seconds in future).
2. Message passes validation because `age = Date.now() - (Date.now() + 59000) = -59000`, which is `> -60000`.
3. The attacker's signed message is now valid for 5 minutes + 59 seconds total from "now."
4. Combined with the lack of nonce/replay prevention (see OD-06), this extends the replay window.

### Recommendation

1. **Tighten the future allowance** to at most 5 seconds: `age < -5000`.
2. **Use server-issued challenges**: Instead of client-chosen timestamps, have the server issue a random nonce that the client must sign. This eliminates client clock manipulation entirely.
3. **Add NTP monitoring** on the server to detect clock drift beyond acceptable bounds.

---

## Finding OD-06: No Nonce/Replay Prevention in Auth

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/middleware/auth.js:65-78`, `server/socket-io/main.js:170-177` |
| **Category** | Timestamp Validation / Replay Attack |

### Description

The auth flow has no nonce and no tracking of used signatures. The same signed message can be replayed any number of times within the 5-minute window:

```javascript
// main.js:170-177
client.on('authenticate', (data) => {
    const result = handleAuthenticate(client, data)
    if (result.success) {
        authenticatedWallets[client.id] = result.walletAddress
    }
    client.emit('authResult', result)
})
```

There is no check for:
- Whether this signature has been used before
- Whether this wallet is already authenticated on another socket
- Rate limiting on authentication attempts

### Exploit Scenario

1. Legitimate user authenticates and their auth message (with signature) is intercepted (e.g., via CORS wildcard `origin: "*"` allowing any site to connect).
2. Attacker opens a new socket connection and replays the same `{ walletAddress, message, signature, timestamp }` payload.
3. Attacker is now authenticated as the victim's wallet on a different socket.
4. Attacker can enter wagered matches, trigger forfeits, or act as the victim.

The 5-minute window provides ample time for replay. The CORS wildcard (`origin: "*"`) on both Express and Socket.IO makes interception easier.

### Recommendation

1. **Track used signatures** in a time-limited set. Reject any signature seen within the last 10 minutes.
2. **Server-issued challenge-response**: Generate a nonce server-side, send to client, client signs it. Nonce is single-use.
3. **Bind auth to socket ID**: Include the socket ID in the signed message so it cannot be replayed on a different connection.

---

## Finding OD-07: Server Clock Dependency — No NTP or Monotonic Clock

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/middleware/auth.js:72`, `server/services/match.js:48,98`, `server/services/monitoring.js:16,58` |
| **Category** | Clock Dependency |

### Description

The server relies on `Date.now()` for:
- Auth timestamp validation (`auth.js:72`)
- Match state transition timestamps (`match.js:48`)
- Monitoring uptime calculation (`monitoring.js:16`)
- Daily stats reset (`monitoring.js:58`)

`Date.now()` depends on the system clock, which can:
- **Drift** without NTP correction
- **Jump backward** during NTP sync adjustments
- **Be manipulated** if an attacker has access to the host (container, VM)

If the server clock jumps backward by even 1 minute, all recently-issued auth messages become "in the future" and would normally be rejected -- except the 60-second future allowance masks small jumps. A forward jump of 5 minutes would instantly invalidate all outstanding auth sessions.

### Exploit Scenario

In a containerized deployment (Docker, Kubernetes), NTP drift is common if the container does not have direct NTP access. If the server clock drifts forward by 3 minutes:
- All auth messages appear 3 minutes older than intended, shrinking the effective auth window to 2 minutes.
- Players experience random auth failures.
- Monitoring stats show incorrect uptime.

### Recommendation

1. **Use monotonic clocks** (`process.hrtime()` or `performance.now()`) for duration measurements (monitoring, timers).
2. **Validate NTP sync** on startup. Log a warning if clock skew exceeds 2 seconds.
3. **For auth, use server-issued nonces** instead of client timestamps (eliminates clock dependency entirely).

---

## Finding OD-08: Terrain Seed Uses Math.random() — Predictable Terrain

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/socket-io/main.js:881`, `server/services/physics.js:269-385` |
| **Category** | PRNG Predictability / Game Integrity |

### Description

Terrain generation uses `Math.random()` for the seed:

```javascript
// main.js:881
const seed = Math.floor(Math.random() * 1000000)
```

The seed is then used with a deterministic `mulberry32` PRNG to generate the terrain. Issues:

1. **Seed space is only 1,000,000 values** (0 to 999,999). An attacker can precompute all possible terrains offline and match them to seeds.
2. **The seed is sent to the client** in the `terrainGenerated` event (line 911: `seed`). After one match, the attacker knows the exact seed and can verify their terrain precomputation is correct.
3. **`Math.random()` is V8's xorshift128+**, which is deterministic given enough samples. If the attacker observes terrain seeds from multiple matches, they can potentially predict future seeds.
4. **Tank positions also use `Math.random()`** (`physics.js:397-398`) but are NOT seeded -- they use raw `Math.random()`, meaning they are part of the same V8 PRNG stream as the terrain seed.

### Exploit Scenario

1. Attacker plays several matches and records the terrain seeds from `terrainGenerated` events.
2. Attacker reverse-engineers the V8 xorshift128+ state from observed outputs (known attack, feasible with ~20 sequential outputs).
3. For subsequent matches, attacker predicts the terrain seed BEFORE `requestTerrain` is called.
4. Attacker precomputes the terrain heightmap and identifies optimal firing angles, giving them a significant aiming advantage.
5. Since tank positions also use `Math.random()`, the attacker knows where both tanks will spawn.

### Recommendation

1. **Use `crypto.randomBytes()` or `crypto.randomInt()`** for the terrain seed:
   ```javascript
   const seed = crypto.randomInt(0, 2**32);
   ```
2. **Increase seed space** to at least 2^32 (4 billion+).
3. **Do not send the seed to clients.** Send only the heightmap and path. The seed is only needed for reproducibility; since the server is authoritative, clients do not need it.
4. **Use `crypto.randomInt()` for tank positions** as well.

---

## Finding OD-09: First Turn Selection — Math.random() < 0.5

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/services/match.js:113` |
| **Category** | PRNG Predictability / Fairness |

### Description

```javascript
export function getNextTurn(matchState, hostId, playerId) {
    if (!matchState.currentTurn) {
        return Math.random() < 0.5 ? hostId : playerId;
    }
    return matchState.currentTurn === hostId ? playerId : hostId;
}
```

First turn is decided by `Math.random() < 0.5`. This call is part of the same V8 PRNG stream as terrain generation. If an attacker has predicted the PRNG state (see OD-08), they also know who gets the first turn.

Additionally, this is called in `requestTerrain` (line 900-903), meaning the terrain seed and first-turn coin flip are sequential `Math.random()` calls. An attacker observing the seed can compute the first-turn result.

### Exploit Scenario

Combined with OD-08: After predicting the PRNG state, the attacker knows:
- What the terrain will look like
- Where tanks will spawn
- Who goes first

This removes all uncertainty from the game start.

### Recommendation

Use `crypto.randomInt(0, 2)` for the coin flip. This is independent of the V8 PRNG stream.

---

## Finding OD-10: Room ID Generation — Predictable via Math.random()

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/socket-io/main.js:360` |
| **Category** | PRNG Predictability / Enumeration |

### Description

```javascript
const roomId = Math.random().toString(32).slice(2,8)
```

Room IDs are 6 characters of base-32 encoded `Math.random()`. This provides approximately 30 bits of entropy (base-32^6 = ~10^9), but since `Math.random()` is predictable (see OD-08), an attacker who has recovered the PRNG state can predict future room IDs.

Even without PRNG recovery, 6-character base-32 IDs can be brute-forced. There are only ~10^9 possible IDs, and an attacker can try `joinRoom` with guessed IDs.

### Exploit Scenario

1. Attacker enumerates room IDs by connecting and emitting `joinRoom` with sequential guesses.
2. There is no rate limiting on `joinRoom` attempts.
3. Attacker finds an open wagered room and joins it, potentially without the host's intent.

### Recommendation

1. **Use `crypto.randomBytes(16).toString('hex')`** for room IDs (128-bit entropy).
2. **Rate-limit `joinRoom` attempts** per socket.

---

## Finding OD-11: Weapon Array Generation — Client-Controlled PRNG

| Field | Value |
|-------|-------|
| **Severity** | **LOW** |
| **Location** | `server/socket-io/main.js:645-659` |
| **Category** | PRNG / Client Trust |

### Description

The legacy `createWeaponArray` event lets the **client** specify `count` and `max` parameters, and the server generates random values:

```javascript
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    var x, randomArray = []
    for (let index = 0; index < count; index++) {
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }
    room.randomArray = randomArray
    // ...
})
```

1. **`count` and `max` are not validated.** A client could send `count: 10000000` to consume server memory/CPU generating a huge array.
2. The array uses `Math.random()`, feeding the PRNG prediction attack (OD-08).
3. The client controls when this is called, so they can sample the PRNG at known points.

### Exploit Scenario

1. Attacker sends `createWeaponArray({ count: 100, max: 10 })` and observes the random array from `setWeaponArray`.
2. These 100 values are sequential `Math.random()` outputs, providing enough samples to fully recover the V8 PRNG state.
3. Attacker can now predict all future `Math.random()` calls: terrain seeds, first turns, room IDs.

### Recommendation

1. **Remove or deprecate** the `createWeaponArray` event (it is marked as legacy).
2. **Do not expose raw PRNG output to clients.** The weapon array values should never be revealed.
3. **Validate `count` and `max`**: enforce `count <= 20` and `max <= 100`.

---

## Finding OD-12: Settlement Stub Returns success:true Without On-Chain Execution

| Field | Value |
|-------|-------|
| **Severity** | **CRITICAL** |
| **Location** | `server/services/solana.js:139-163` |
| **Category** | Oracle Trust / Phantom Settlement |

### Description

`settleMatch()` is a stub:

```javascript
export async function settleMatch(winnerAddress, loserAddress, wagerSOL) {
    // ...
    // Future: Execute on-chain settlement via escrow program
    return {
        success: true,
        settlement,
        txSignature: null,
    };
}
```

It always returns `success: true` but never executes any on-chain transaction. The caller in `main.js:814` trusts this result and emits `matchSettled` with settlement details to the client. The same pattern exists in `refundWager()` (line 173-188).

This means:
1. **Players are told they "won" SOL that was never transferred.**
2. **The monitoring system tracks settlement amounts** that never moved on-chain (phantom economics).
3. **The `/stats` endpoint exposes misleading financial data** (see OD-13).

### Exploit Scenario

This is not an external attack but a **trust violation**: the system reports successful settlements that never happened. If a user relies on the `matchSettled` event or `txSignature: null` response, they might believe SOL was transferred. In a dispute, the server logs show "successful" settlements with no on-chain evidence.

### Recommendation

1. **Do not return `success: true`** until an on-chain transaction is confirmed. Return a distinct status like `{ pending: true, reason: 'Escrow not deployed' }`.
2. **Do not emit `matchSettled`** to clients until a real `txSignature` is available.
3. **Clearly mark the stub** in all data flows so monitoring and UI reflect the true state.

---

## Finding OD-13: /stats Endpoint Exposes Unauth'd Financial Data

| Field | Value |
|-------|-------|
| **Severity** | **CRITICAL** |
| **Location** | `server/index.js:34`, `server/services/monitoring.js:166-211` |
| **Category** | External Data Exposure |

### Description

```javascript
// index.js:34
app.get('/stats', getStats)
```

The `/stats` endpoint is unauthenticated and exposes:
- Total SOL wagered, settled, treasury fees, ops fees
- Error details (last 5 errors with messages and context)
- Active connection count
- Match completion rates

Combined with the phantom settlement data from OD-12, an attacker can:
1. **Monitor server health** to time attacks during high-error periods.
2. **Track wager volumes** to identify high-value targets.
3. **Read error messages** that may leak internal state or stack traces.

### Exploit Scenario

1. Attacker polls `/stats` every 10 seconds.
2. When `errors.count` increases or `activeConnections` drops, attacker knows the server is under stress.
3. Attacker initiates their attack during this window.
4. Error messages in `recent` may contain wallet addresses, internal IDs, or library error strings that reveal the tech stack.

### Recommendation

1. **Add authentication** to `/stats` (API key, basic auth, or JWT).
2. **Sanitize error messages** before exposing them. Remove stack traces and internal details.
3. **Do not expose financial data** through an unauthenticated endpoint.
4. **Rate-limit** the `/stats` endpoint.

---

## Finding OD-14: Socket.IO Event Ordering — Race Conditions in Async Handlers

| Field | Value |
|-------|-------|
| **Severity** | **LOW** |
| **Location** | `server/socket-io/main.js:180-270` (disconnect/leaveRoom), `main.js:671-872` (fire) |
| **Category** | Event Ordering / Concurrency |

### Description

Socket.IO does not guarantee event ordering when handlers are async. Several handlers use `await`:

```javascript
// disconnect handler (line 180)
client.on('disconnect', async () => {
    // ... await settleMatch() ... await refundWager() ... await removeRoom()
})

// fire handler (line 671)
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
    // ... await settleMatch() ...
})
```

While Socket.IO processes events per-socket sequentially, the async nature means:
1. **A `fire` event could be processing when `disconnect` arrives.** Both handlers access and mutate the same room/match state.
2. **Two different clients' events can interleave.** Player A fires (async settlement starts), Player B disconnects (async forfeit settlement starts). Both modify `wagerStates[roomId]` and `matchStates[roomId]`.
3. **`removeRoom()` is async** and called from both `disconnect` and `leaveRoom`. If both players disconnect simultaneously, two `removeRoom()` calls race on the same room.

### Exploit Scenario

1. Player A fires the winning shot (match settlement begins, async).
2. Player B rapidly disconnects before the `fire` handler completes settlement.
3. The `disconnect` handler sees the match is still in `BATTLE` state (settlement hasn't committed the state change yet) and initiates a **forfeit settlement** for Player B.
4. Two settlements execute for the same match: one normal, one forfeit. If settlement were real, this could result in double-pay.

### Recommendation

1. **Add a per-room mutex/lock** to prevent concurrent state mutations:
   ```javascript
   const roomLocks = {};
   async function withRoomLock(roomId, fn) {
       if (!roomLocks[roomId]) roomLocks[roomId] = Promise.resolve();
       const prev = roomLocks[roomId];
       let resolve;
       roomLocks[roomId] = new Promise(r => resolve = r);
       await prev;
       try { return await fn(); } finally { resolve(); }
   }
   ```
2. **Transition to SETTLING state atomically** before any async work in the fire handler.
3. **Check state before settlement in disconnect handler**: if state is already SETTLING or COMPLETE, skip forfeit.

---

## Summary Table

| ID | Severity | Location | Title |
|----|----------|----------|-------|
| OD-01 | CRITICAL | main.js:306-317 | RPC balance check fails open -- zero-balance bypass |
| OD-02 | HIGH | solana.js:196-206 | getBalance() returns 0 on error, masking RPC failures |
| OD-03 | HIGH | solana.js:22 | RPC endpoint not pinned, devnet fallback in production |
| OD-04 | MEDIUM | solana.js:80-103 | No RPC response staleness detection |
| OD-05 | HIGH | auth.js:72-74 | Auth timestamp allows 60s future manipulation |
| OD-06 | HIGH | auth.js:65-78 | No nonce/replay prevention in auth |
| OD-07 | MEDIUM | auth.js:72, match.js:48 | Server clock dependency with no NTP/monotonic fallback |
| OD-08 | HIGH | main.js:881, physics.js:269+ | Terrain seed uses Math.random() -- predictable terrain |
| OD-09 | MEDIUM | match.js:113 | First turn uses Math.random() -- predictable |
| OD-10 | MEDIUM | main.js:360 | Room IDs use Math.random() -- enumerable |
| OD-11 | LOW | main.js:645-659 | Legacy weaponArray leaks PRNG outputs to client |
| OD-12 | CRITICAL | solana.js:139-163 | Settlement stub returns success without on-chain execution |
| OD-13 | CRITICAL | index.js:34 | /stats exposes unauthenticated financial & error data |
| OD-14 | LOW | main.js:180-270, 671-872 | Async handler race conditions in settlement flows |

---

## Appendix A: External API Call Inventory

| Call Site | External Service | Data Returned | Trust Level |
|-----------|-----------------|---------------|-------------|
| `solana.js:84` | Solana RPC (`getBalance`) | Wallet balance in lamports | **Untrusted** -- RPC can return stale or incorrect data |
| `solana.js:44` | Solana RPC (connection init) | N/A | **Config-dependent** -- devnet fallback |
| `auth.js:41-45` | None (local nacl verify) | Signature validity | **Trusted** -- pure crypto, no external call |
| `index.js:40` | MongoDB (`mongoose.connect`) | Database handle | **Trusted** -- internal infrastructure |
| No other external HTTP/API calls found | | | |

The server makes no external HTTP calls beyond Solana RPC and MongoDB. There are no webhook endpoints, no third-party API integrations, and no external data ingestion beyond what the Solana RPC provides. This is a positive finding -- the attack surface from external APIs is limited to the Solana RPC trust boundary.

## Appendix B: PRNG Usage Map

All `Math.random()` calls in server code:

| Location | Purpose | Predictable? | Game Impact |
|----------|---------|--------------|-------------|
| `main.js:360` | Room ID generation | Yes (same PRNG stream) | Room enumeration |
| `main.js:652` | Weapon array values | Yes | Exposes PRNG state directly |
| `main.js:881` | Terrain seed | Yes | Terrain prediction |
| `physics.js:271-302` | Terrain generation (via seeded PRNG) | Deterministic from seed | N/A (seed-dependent) |
| `physics.js:397-398` | Tank position X offsets | Yes (same PRNG stream) | Spawn prediction |
| `match.js:113` | First turn selection | Yes | First-mover advantage |

**Total `Math.random()` calls per game start**: ~5-7 sequential calls. An attacker observing weapon array outputs (OD-11) gets up to 100 samples at once.

## Appendix C: Timestamp/Clock Usage Map

| Location | Clock Source | Purpose | Vulnerability |
|----------|-------------|---------|---------------|
| `auth.js:72` | `Date.now()` | Auth message age check | NTP skew, future manipulation |
| `match.js:48` | `Date.now()` | State transition timestamp | No external impact currently |
| `match.js:98` | `Date.now()` | Match creation timestamp | No external impact currently |
| `monitoring.js:16` | `Date.now()` | Server start time | Uptime miscalculation |
| `monitoring.js:58` | `new Date()` | Daily reset check | Missed/double reset on clock jump |
