---
task_id: INJ-01
auditor: INJ-01
focus: SQL & NoSQL Injection
date: 2026-02-23
status: complete
---

<!-- CONDENSED_SUMMARY_START -->
# INJ-01 Condensed Summary — NoSQL Injection

**task_id:** INJ-01
**verdict:** LOW OVERALL RISK — No exploitable NoSQL injection found. All Mongoose queries use server-controlled values as filter keys. User-supplied data is NOT passed as query filter objects.

## Key Findings

| ID | Severity | Title |
|----|----------|-------|
| INJ-01-F1 | INFO | Queries use server-controlled `walletAddress` from `authenticatedWallets` map — not raw client input |
| INJ-01-F2 | INFO | `Match.findByIdAndUpdate` / `Match.create` use internal MongoDB `_id` or server-generated values — no client touch |
| INJ-01-F3 | LOW | `User.findOne({ walletAddress: wallet })` and `User.findOneAndUpdate({ walletAddress: ... })` pass a string derived from server-side auth state — operator injection not possible if the value is a string, but the wallet address is never validated as a plain string before use |
| INJ-01-F4 | LOW | `ServerState.findOne({ key: 'global' })` uses a hardcoded literal — zero injection surface |
| INJ-01-F5 | MEDIUM | `txSignature` field in `persistBurnTx` and the `verifiedBurnTxs` `$addToSet` operation receives a Solana signature string directly from client payload in `prestigeBurn` handler. No length/format check before DB write. |
| INJ-01-F6 | INFO | No raw `mongodb` driver calls — all queries go through Mongoose, which provides type coercion and schema enforcement |
| INJ-01-F7 | INFO | No string concatenation in any query — all queries use object literal syntax |

## Attack Surface Assessment

The primary injection concern for Mongoose/MongoDB is an attacker sending `{ "$ne": "" }` or similar operator objects instead of a scalar string for a query field. In this codebase:

1. The `walletAddress` used in all `User.*` queries comes exclusively from `authenticatedWallets[client.id]`, which is set only after Ed25519 signature verification in `handleAuthenticate`. The value is a Solana base58 public key string extracted from `walletAddress` in the auth payload AFTER `PublicKey.isOnCurve()` validation — making it structurally a string, not an object.

2. Mongoose schema-level enforcement: `walletAddress` is typed `String` in `userSchema`. Mongoose will cast an incoming object `{ $ne: "" }` to `[object Object]` string, not execute it as a MongoDB operator. This is a secondary defense layer.

3. The one soft concern (F5) is that `txSignature` arrives from the client socket payload and is written to MongoDB via `$addToSet` without format validation (expected: base58, 87-88 chars). An attacker could write arbitrarily long strings to the `verifiedBurnTxs` array. This is a storage-bloat / DoS vector more than a true injection issue because Mongoose schema types the array as `[String]`, and MongoDB operators in that string position cannot alter query logic.

## Recommended Actions

1. **F5 (MEDIUM):** Add a length + format check on `txSignature` before calling `persistBurnTx`. Solana signatures are 87-88 base58 characters. Reject anything that doesn't match `/^[1-9A-HJ-NP-Za-km-z]{87,88}$/`.
2. **F3 (LOW):** Consider an explicit `typeof walletAddress === 'string'` guard before any `User.*` call in `shot-token.js:saveMilestoneState` and `loadMilestoneState`. Currently guarded only by auth flow, but defense-in-depth at the DB boundary is cheap.
3. No other injection remediation needed.
<!-- CONDENSED_SUMMARY_END -->

---

# INJ-01 Full Analysis — NoSQL Injection

## 1. Scope and Methodology

**Files read in full:**
- `server/models/User.js`
- `server/models/Match.js`
- `server/models/ServerState.js`
- `server/index.js`
- `server/socket-io/main.js` (all ~2400 lines)
- `server/services/shot-token.js` (all ~560 lines)
- `server/middleware/auth.js` (all ~150 lines)
- `server/middleware/guards.js` (all ~168 lines)
- `.bulwark/INDEX.md` and `.bulwark/HOT_SPOTS.md` (for context)

**Methodology:**
1. Enumerated all Mongoose model fields and understood schema types.
2. Located every call to `findOne`, `findOneAndUpdate`, `findByIdAndUpdate`, `create`, and `$addToSet` across all server files.
3. For each query, traced the filter/update values back to their source: is this server-generated, or does it derive from a client socket payload?
4. Assessed whether Mongoose schema typing, auth gating, or other controls would block NoSQL operator injection if a client sent `{ $gt: 0 }` or `{ $ne: "" }` as a field value.

---

## 2. Schema Review

### 2.1 User Schema (`server/models/User.js`)

```js
walletAddress: { type: String, required: true, unique: true, index: true }
username: { type: String, default: '' }
stats: {
    matchesPlayed: Number, wins: Number, losses: Number,
    totalSolWon: Number, totalSolLost: Number,
    totalShotEarned: Number, shotBurned: Number,
    prestigeTier: Number,
    totalMatchesPlayed: Number, wageredMatchesPlayed: Number,
    wageredWins: Number, consecutiveWins: Number,
    milestonesEarned: [String], shotBalance: Number,
    totalBurned: Number, claimedMatchIds: [String],
},
lastActive: Date
```

All fields are typed. `walletAddress` is `String` — Mongoose will cast an object `{ $ne: "" }` to the string `"[object Object]"` before executing the query, which means a NoSQL operator injection through this path would fail silently (no records match) rather than leak data.

### 2.2 Match Schema (`server/models/Match.js`)

```js
roomCode: { type: String, required: true, unique: true, index: true }
status: { type: String, enum: ['lobby','weapon_shop','battle','settling','complete','cancelled'] }
```

`roomCode` is indexed and typed String with enum validation on `status`. There are no untyped free-form object fields that could be exploited.

### 2.3 ServerState Schema (`server/models/ServerState.js`)

```js
key: { type: String, unique: true, required: true, default: 'global' }
totalShotEmitted: { type: Number, default: 0 }
verifiedBurnTxs: { type: [String], default: [] }
```

The `verifiedBurnTxs` array stores transaction signatures. Elements are typed `String`. See F5 below.

---

## 3. Query Inventory and Data Flow Analysis

### 3.1 `ServerState.findOne({ key: 'global' })` — SAFE

**Location:** `server/models/ServerState.js:33`

```js
const state = await ServerState.findOne({ key: 'global' });
```

The filter key `'global'` is a hardcoded string literal. There is zero user input in this query. No injection surface.

### 3.2 `ServerState.findOneAndUpdate({ key: 'global' }, ...)` — SAFE

**Location:** `server/models/ServerState.js:50-54` and `server/models/ServerState.js:69-73`

```js
await ServerState.findOneAndUpdate(
    { key: 'global' },
    { totalShotEmitted, updatedAt: new Date() },
    { upsert: true }
);

await ServerState.findOneAndUpdate(
    { key: 'global' },
    { $addToSet: { verifiedBurnTxs: txSignature }, updatedAt: new Date() },
    { upsert: true }
);
```

Filter key is hardcoded. The `txSignature` value goes into an `$addToSet` update on a typed `[String]` array. Mongo operators in the update position of `$addToSet` with a string type are safe — the string value is stored as-is, not interpreted as a query operator. However, see F5 for the content validation concern.

### 3.3 `User.findOne({ walletAddress: wallet })` — SAFE WITH CAVEAT

**Location:** `server/socket-io/main.js:1602` (getStats handler)

```js
client.on('getStats', async () => {
    const wallet = authenticatedWallets[client.id] || null
    ...
    const user = await User.findOne({ walletAddress: wallet })
```

**Data flow trace:**
```
client emits 'authenticate' with { walletAddress, message, signature }
  -> handleAuthenticate() in auth.js
     -> verifyAuthMessage() checks message format and timestamp
     -> verifyWalletSignature() does Ed25519 nacl verify
        -> new PublicKey(walletAddress) — throws if not valid base58
        -> PublicKey.isOnCurve() — throws if not on curve
  -> on success: authenticatedWallets[client.id] = result.walletAddress
                 (walletAddress is the same string from the payload)
client emits 'getStats'
  -> wallet = authenticatedWallets[client.id]  <- SERVER-SIDE MAP
  -> User.findOne({ walletAddress: wallet })
```

`wallet` at query time is sourced from `authenticatedWallets`, a server-side `{}` plain object keyed by socket ID. It was placed there only after Ed25519 cryptographic verification. The value is the wallet address string from the original auth payload — and `PublicKey(walletAddress)` in auth.js has already validated it is a valid base58 Solana public key string, ensuring it cannot be `{ $ne: "" }` (that would throw in the PublicKey constructor).

**Residual risk:** Mongoose also types `walletAddress` as `String` in the schema, providing a second-layer coercion. Even if somehow a non-string value reached this query, Mongoose would stringify it. No operator injection is achievable through this path.

### 3.4 `User.findOneAndUpdate({ walletAddress }, ...)` — SAFE WITH CAVEAT

**Locations:**
- `server/services/shot-token.js:202-223` (`saveMilestoneState`)
- `server/socket-io/main.js:2224-2237` (match-end stat persistence)

```js
// saveMilestoneState (shot-token.js:202)
User.findOneAndUpdate(
    { walletAddress },
    { $set: { 'stats.totalMatchesPlayed': state.totalMatchesPlayed, ... } },
    { upsert: true }
)

// match-end stats (main.js:2224)
await User.findOneAndUpdate(
    { walletAddress: winnerAddr },
    { $inc: { 'stats.matchesPlayed': 1, 'stats.wins': 1, ... }, $set: { lastActive: new Date() } },
    { upsert: true }
)
```

`walletAddress` in `saveMilestoneState` is called with the wallet key from `playerShotState`, which is keyed by wallet addresses obtained through auth. `winnerAddr` in match-end is obtained from `authenticatedWallets[winnerId]` — same auth-gated map.

`update` documents using `$set` and `$inc` are all server-computed values (numeric counters, arrays of server-controlled strings). No client-supplied data appears in update values.

**Residual risk:** In `saveMilestoneState`, the function accepts `walletAddress` as a parameter. The call site in `recordMatchPlayed` receives it from `getPlayerShotState(walletAddress)`, where `walletAddress` was originally passed in from the match-end handler — again from `authenticatedWallets`. Guarding only by the auth pipeline rather than by an explicit `typeof === 'string'` check at the DB boundary is a minor defense-in-depth gap. See F3.

### 3.5 `Match.create({ ... })` — SAFE

**Location:** `server/socket-io/main.js:1185-1196`

```js
const match = await Match.create({
    roomCode: roomId,                // crypto.randomBytes(4).toString('hex') — server-generated
    host: {
        username: player.name,       // client-supplied BUT goes to non-queried field
        socketId: client.id,         // server-generated socket ID
        color: player.color,         // client-supplied number
        isReady: false,
        playAgain: false
    },
    status: 'lobby',
    active: false
});
```

`roomCode` is `crypto.randomBytes(4).toString('hex')` — not user-supplied. `player.name` is client-supplied and used in the `username` non-indexed field. Mongoose casts it to String per schema. `player.color` is a Number field. Neither appears in a query filter, only in insert data. No injection vector.

### 3.6 `Match.findByIdAndUpdate(room._matchId, update)` — SAFE

**Location:** `server/socket-io/main.js:206`

```js
await Match.findByIdAndUpdate(room._matchId, update);
```

`room._matchId` is the MongoDB ObjectId returned by `Match.create()` and stored server-side. Clients never supply this value. The `update` object is built from `room.active`, `room.randomArray`, and socket metadata — all server-controlled values.

### 3.7 `User.findOne({ walletAddress })` in `loadMilestoneState` — SAFE WITH CAVEAT

**Location:** `server/services/shot-token.js:159`

```js
const user = await User.findOne({ walletAddress });
```

Called from `authenticate` handler in `main.js:546`:

```js
await loadMilestoneState(result.walletAddress)
```

`result.walletAddress` is the return value of `handleAuthenticate` which already performed Ed25519 verification. Same auth-gated source as 3.3. Safe.

---

## 4. Finding Details

### F1 — All DB Queries Use Server-Controlled Filter Keys (INFO)

**Files:** All querying files
**Severity:** INFO (no action needed)

Every `findOne` and `findOneAndUpdate` filter key (`walletAddress`, `_id`, `key: 'global'`) is either a hardcoded literal or sourced from a server-side data structure populated exclusively after cryptographic verification. There is no code path where a client can supply a raw object that becomes a query filter value.

### F2 — Match Model Queries Use Internal IDs (INFO)

**Files:** `server/socket-io/main.js`
**Severity:** INFO (no action needed)

`Match.findByIdAndUpdate(room._matchId, ...)` and `Match.findByIdAndUpdate(room._matchId, { status: 'cancelled' })` both use `room._matchId`, a MongoDB ObjectId stored server-side at room creation time. Clients cannot influence this value.

### F3 — Missing Explicit String Guard Before User.* Calls (LOW)

**Files:** `server/services/shot-token.js:155-186`, `server/services/shot-token.js:195-224`
**Severity:** LOW

`loadMilestoneState(walletAddress)` and `saveMilestoneState(walletAddress)` receive `walletAddress` as a parameter and pass it directly to Mongoose without an explicit `typeof walletAddress === 'string'` check:

```js
// shot-token.js:159
const user = await User.findOne({ walletAddress });

// shot-token.js:202
User.findOneAndUpdate({ walletAddress }, { $set: { ... } }, { upsert: true })
```

Currently protected by:
- Ed25519 cryptographic auth upstream
- Mongoose `String` type coercion on the schema field

However, these functions are not private — they are exported and could theoretically be called from a future code path that bypasses auth. Adding an explicit guard is cheap and follows defense-in-depth.

**Recommended fix:**
```js
export async function loadMilestoneState(walletAddress) {
    if (typeof walletAddress !== 'string' || walletAddress.length === 0) return;
    // ...
}

export function saveMilestoneState(walletAddress) {
    if (typeof walletAddress !== 'string' || walletAddress.length === 0) return;
    // ...
}
```

### F4 — ServerState Queries Use Hardcoded Literal (INFO)

**Files:** `server/models/ServerState.js`
**Severity:** INFO (no action needed)

All `ServerState` queries filter on `{ key: 'global' }` — a hardcoded string constant. Zero injection surface. The only variable input is `txSignature` in the update body (see F5).

### F5 — txSignature Written to DB Without Format Validation (MEDIUM)

**Files:** `server/socket-io/main.js:1611-1645` (prestigeBurn handler), `server/models/ServerState.js:66-77` (persistBurnTx), `server/services/shot-token.js:457-558` (verifyBurnTransaction)

**Severity:** MEDIUM — storage bloat / DoS, not query injection

**Data flow:**

```
Client sends: socket.emit('prestigeBurn', { txSignature, burnAmount })

main.js:1618:
    const { txSignature, burnAmount } = data || {}
    if (!txSignature) { ... return }
    const verification = await verifyBurnTransaction(txSignature, wallet, burnAmount)
    // On success:
    // -> shot-token.js:549: verifiedBurnTxs.add(txSignature)
    // -> shot-token.js:551: persistBurnTx(txSignature)

persistBurnTx (ServerState.js:66-77):
    await ServerState.findOneAndUpdate(
        { key: 'global' },
        { $addToSet: { verifiedBurnTxs: txSignature }, updatedAt: new Date() },
        { upsert: true }
    );
```

**Positive controls present:**
- `verifyBurnTransaction` calls `connection.getParsedTransaction(txSignature, ...)` — if `txSignature` is malformed, `getParsedTransaction` returns `null` and the function returns `{ valid: false }`. The `persistBurnTx` path is only reached if verification succeeds.
- In dev mode (no `SHOT_MINT` configured), verification is skipped entirely — but in that mode, no real DB write risk exists since the environment is not production.
- The `verifiedBurnTxs` `$addToSet` operator prevents duplicate writes.

**Residual concern:**
In production, `getParsedTransaction` with a sufficiently crafted but syntactically valid base58 string that happens to resolve to a real (unrelated) transaction on devnet/mainnet could in principle pass the null-check. The actual burn-content checks (`type === 'burn'`, `info.mint === SHOT_MINT`, `info.authority === walletAddress`, amount check) would then reject it. So the stored value would only be something that passes ALL those checks — a valid real SHOT burn by that wallet.

However, there is no length limit on `txSignature` before the `getParsedTransaction` call. A very long string would be sent to the RPC endpoint. More practically, if there's a bug in the `getParsedTransaction` return path, an arbitrary string could reach `persistBurnTx`. A format guard before the RPC call costs nothing and eliminates this surface:

```js
// In verifyBurnTransaction, at the top:
const SIG_REGEX = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
if (!SIG_REGEX.test(txSignature)) {
    return { valid: false, reason: 'Invalid transaction signature format' };
}
```

**Why not a critical injection issue:** `verifiedBurnTxs` is a `[String]` typed field. The value of `txSignature` is stored as the element of `$addToSet`, not as a query filter key or a MongoDB operator path. An attacker cannot use a crafted string to alter query logic — MongoDB does not evaluate `$`-prefixed operators in array element values.

### F6 — No Raw MongoDB Driver Usage (INFO)

**Severity:** INFO

All database access goes through Mongoose models. There are no `db.collection('users').find()` or similar raw driver calls anywhere in the server codebase. This eliminates the attack surface present in raw driver code where object-valued inputs could be interpreted as query operators without schema coercion.

### F7 — No String Concatenation in Queries (INFO)

**Severity:** INFO

No query in any server file constructs a filter or update using string concatenation. All queries use object literal syntax. SQL-style string injection is not applicable (MongoDB) and the Mongoose object API does not have an equivalent vulnerability.

---

## 5. Mongoose Schema Type Coercion as Defense Layer

For completeness: Mongoose's behavior when a query filter receives an object where a String is expected:

```js
// If attacker could supply: { walletAddress: { $ne: "" } }
User.findOne({ walletAddress: { $ne: "" } })
// Mongoose Schema has walletAddress: { type: String }
// Mongoose casts { $ne: "" } to "[object Object]"
// Query becomes: find documents where walletAddress === "[object Object]"
// Result: no documents (since no real wallet is "[object Object]")
```

This is a secondary defense. It prevents data leakage even if the primary auth control were bypassed. However, this coercion behavior is Mongoose-version-dependent and should not be relied upon as the primary control.

---

## 6. Summary Table

| Query Location | Filter Value Source | User Input Reaches Filter? | Risk |
|---|---|---|---|
| `ServerState.findOne({ key: 'global' })` | Hardcoded literal | No | None |
| `ServerState.findOneAndUpdate({ key: 'global' }, ...)` | Hardcoded literal | No | None |
| `User.findOne({ walletAddress: wallet })` (getStats) | `authenticatedWallets[client.id]` post-auth | Indirectly, post-crypto-verify | Negligible |
| `User.findOne({ walletAddress })` (loadMilestoneState) | Auth result | Indirectly, post-crypto-verify | Negligible |
| `User.findOneAndUpdate({ walletAddress }, ...)` (saveMilestoneState) | Auth result | Indirectly, post-crypto-verify | Negligible (F3) |
| `User.findOneAndUpdate({ walletAddress: winnerAddr }, ...)` (match-end) | `authenticatedWallets[winnerId]` post-auth | Indirectly, post-crypto-verify | Negligible |
| `Match.create({ roomCode: roomId, ... })` | `crypto.randomBytes()` | No | None |
| `Match.findByIdAndUpdate(room._matchId, ...)` | Internal MongoDB ObjectId | No | None |
| `persistBurnTx(txSignature)` → `$addToSet` | Client socket payload, post-RPC-verify | Yes (in update body, not filter) | Low/Medium (F5) |

---

## 7. Conclusion

The SolShot server has no exploitable NoSQL injection vulnerabilities. The consistent use of `authenticatedWallets` as the DB query key source — populated only after Ed25519 signature verification — effectively prevents query-level injection. Mongoose schema type enforcement provides a secondary barrier.

The two actionable findings are both minor:

- **F3 (LOW):** Add `typeof` guards at the DB function boundary in `shot-token.js` for defense-in-depth.
- **F5 (MEDIUM):** Add a regex format check on `txSignature` before calling `getParsedTransaction` and before `persistBurnTx`. This eliminates RPC abuse with malformed inputs and ensures only valid Solana signatures reach storage.

Neither finding represents a live exploit under current code. Both are preventative hardening measures.
