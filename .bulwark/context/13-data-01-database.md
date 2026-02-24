# DATA-01: Database & Query Security
**Task ID:** DATA-01
**Auditor:** Database & Query Security
**Date:** 2026-02-23
**Files Reviewed:**
- `server/models/Match.js`
- `server/models/User.js`
- `server/models/ServerState.js`
- `server/models/Weapon.js` (config file, not Mongoose model)
- `server/index.js` (MongoDB connection)
- `server/socket-io/main.js` (DB operations)
- `server/services/shot-token.js` (milestone persistence)
- `server/.env.example`

---

## CONDENSED SUMMARY

The database layer is reasonably well structured for a game server in active development. MongoDB Atlas is used via Mongoose with TLS-in-transit by default (Atlas SRV URI). The three Mongoose models (Match, User, ServerState) are correctly indexed on their primary query keys. **Critical economic state — gold, weapon inventories, wager amounts, and active match state — is entirely in-memory and is lost on server restart.** This is a known design decision documented in `.audit/ARCHITECTURE.md` and acceptable during the current development phase. The more serious issues are:

1. **Match records are never updated with final game outcome** (winner, settlementTx, settledAt, status→complete). The Match document is written on create and cancelled on teardown; no code writes the match result back to the DB. The `settlementTx` and `winner` fields in the schema are permanently null in practice.

2. **Dual-write inconsistency between `User.stats` and `User.stats.totalShotEarned`**: `recordMatchPlayed()` writes `shotBalance`/`milestonesEarned` via `saveMilestoneState`, while `persistStats()` in `main.js` writes `matchesPlayed`/`wins`/`losses`/`totalSolWon`/`totalSolLost`/`totalShotEarned` independently. Both are fire-and-forget with no ordering guarantee. A server crash between the two writes leaves the user record in a partially-updated state.

3. **MongoDB connection lacks explicit options** (no `serverSelectionTimeoutMS`, no `maxPoolSize`). Defaults are used, which may be poorly suited to a transient Render deployment.

4. **`ADMIN_API_KEY` is not defined in `.env.example`**, meaning operators who bootstrap from the example file will silently leave the `/stats` and `/api/admin/reload-keys` endpoints open to anyone (the guard blocks when the env var is absent).

5. **`verifiedBurnTxs` unbounded growth**: the MongoDB array and the in-memory Set accumulate one entry per prestige burn forever. No TTL, compaction, or upper-bound exists.

6. **`claimedMatchIds` grows indefinitely** per user — persisted as an array in MongoDB with no pruning logic. For heavy users this grows without bound.

7. **No schema-level validation on `walletAddress`** — any string is accepted. A malformed or injected wallet address can be upserted into `User` and used as a query key.

No raw string concatenation was found in any query. All queries use Mongoose operator objects, so direct NoSQL injection via operator keys (e.g., `{ $gt: '' }`) is the realistic attack vector — and the wallet address used as the primary key is pulled exclusively from the server-side `authenticatedWallets` map (which is populated only after NaCl signature verification), not from client-supplied socket event data. This significantly reduces NoSQL injection risk.

---

## FULL ANALYSIS

### 1. MongoDB Connection Security

**File:** `server/index.js` lines 137–156

```js
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(...)
        .catch((err) => {
            console.error('[FATAL] MongoDB connection failed ...');
            process.exit(1);
        });
} else {
    console.warn('MONGODB_URI not set — running without database');
    server.listen(...); // starts WITHOUT DB
}
```

**Observations:**

- The URI is never logged, which is correct.
- `mongoose.connect()` is called with no options object. Mongoose 7+ has sensible defaults, but production deployments benefit from explicit `serverSelectionTimeoutMS`, `socketTimeoutMS`, and `maxPoolSize` to prevent connection pool exhaustion on a single-dyno Render container.
- The example URI in `.env.example` is `mongodb+srv://...` which forces TLS via the Atlas SRV scheme. TLS in transit is therefore on by default. No explicit `tls: true` flag is required.
- **No `authSource` or `authMechanism` is hardcoded.** The credentials are entirely within the connection string, which is the correct Atlas pattern.
- Graceful degradation (runs without DB) is appropriate for devnet testing but means that in production, a MongoDB outage silently loses all persistent state without alerting operators beyond the initial startup log.
- **Finding DB-1:** No connection health monitoring. `isDbConnected()` checks `readyState` per-operation but there is no reconnect event handler or alerting when the connection drops mid-operation. Mongoose auto-reconnects internally, but if reconnect fails, writes silently no-op (the `if (isDbConnected()) return;` guards in `ServerState.js` lines 49 and 68 swallow errors).

---

### 2. Schema Validation Gaps

**Files:** `server/models/User.js`, `server/models/Match.js`, `server/models/ServerState.js`

**User schema:**
```js
walletAddress: { type: String, required: true, unique: true, index: true }
```

- `walletAddress` has `required` and `unique` but no format validation. Any string passes. A Solana base58 pubkey is 32–44 characters. No `match` regexp or `validate` function enforces this.
- **Finding DB-2:** A socket event that somehow passes a non-pubkey string as a wallet address (e.g., a Mongoose operator string like `{ "$gt": "" }`) would be accepted by the schema. In practice this is mitigated because `walletAddress` values written to the DB come from `authenticatedWallets[client.id]`, which is only set after NaCl Ed25519 signature verification in `server/middleware/auth.js`. However, this is a defense-in-depth gap: if auth middleware is ever bypassed or if a future code path writes wallet addresses from untrusted input, the schema provides no backstop.
- The `stats` sub-document has no `min`/`max` constraints on counters. A logic bug in `$inc` operations cannot be detected at the schema level.
- `Match` schema fields `escrowPDA`, `settlementTx`, `depositTx`, and `winner` are plain `String` with no validation.

**Match schema:**
```js
status: { type: String, default: 'lobby', enum: ['lobby', 'weapon_shop', 'battle', 'settling', 'complete', 'cancelled'] }
roundType: { type: String, default: '1', enum: ['1', 'BO3', 'BO5'] }
```
- `enum` constraints on `status` and `roundType` are good.
- Schemas use `{ _id: false }` on sub-documents, which is appropriate.
- `{ timestamps: true }` on Match and User provides `createdAt`/`updatedAt` automatically.

**ServerState schema:**
```js
verifiedBurnTxs: { type: [String], default: [] }
```
- **Finding DB-3:** No max-length constraint on the `verifiedBurnTxs` array. A Solana signature is 88 characters (base58). With 5 prestige tiers per user and potentially thousands of users, this array grows unboundedly. MongoDB documents have a 16MB limit. At 88 bytes per entry this limit is not reached until ~180,000 entries, but there is no periodic compaction or TTL. This is a maintenance risk that degrades over time.

---

### 3. Index Coverage

**Explicit indexes declared:**
- `User.walletAddress`: `{ unique: true, index: true }` — correct, covers `findOne({ walletAddress })`.
- `Match.roomCode`: `{ unique: true, index: true }` — correct for room lookups.

**Missing indexes:**
- `Match.status`: no index. `status: 'lobby'` is never queried in the current codebase (room listing is entirely in-memory). However, future admin tooling or analytics queries against Match by status would perform a full collection scan.
- `Match.createdAt`: no explicit TTL index. Completed/cancelled matches accumulate indefinitely.
- `User.lastActive`: not indexed. If a future cron job prunes inactive users, it would require a full scan.
- **Finding DB-4:** `ServerState` has a single document with `key: 'global'`. The `key` field is `unique: true` which creates an index. This is fine.

---

### 4. Data Persistence vs. In-Memory State

This is the most significant architectural concern for financial integrity.

**What IS persisted to MongoDB:**

| Data | Where | When |
|---|---|---|
| User stats (wins/losses/SOL) | `User.stats` via `$inc` | Fire-and-forget after matchEnd |
| SHOT milestones/balance | `User.stats` via `saveMilestoneState` | Fire-and-forget after `recordMatchPlayed` |
| Total SHOT emitted | `ServerState.totalShotEmitted` | Debounced 1s after emission |
| Verified burn tx signatures | `ServerState.verifiedBurnTxs` | Immediately on burn verification |
| Match lobby record | `Match` (create on createRoom) | Synchronous await |
| Match cancellation | `Match.status = 'cancelled'` | On removeRoom |

**What is NOT persisted (lost on restart):**

| Data | Risk on Restart |
|---|---|
| Active gold balances (`goldStates`) | All in-match gold is lost — players who reconnect see reset gold |
| Weapon inventories (`weaponInventories`) | All purchased weapons are lost on restart |
| Wager amounts/wallets (`wagerStates`) | Wallet-to-socketId mapping lost — escrow settlement becomes impossible |
| Match state machine (`matchStates`) | Active match progress is lost — game cannot resume |
| Player SHOT state (`playerShotState`) | Loaded from DB on auth, but mid-match accrual before `saveMilestoneState` fires is lost |
| Failed settlement retry queue (`failedSettlements`) | All pending escrow cancel retries are lost |

**Finding DB-5 (HIGH):** The `failedSettlements` Map is stored purely in memory. If the server restarts while a settlement-failure retry is in-flight, the pending cancel is never retried. This means player funds remain locked in the on-chain escrow PDA with no programmatic path to cancel them (other than the 24-hour on-chain timeout in the Anchor program). This is a financial availability risk.

**Finding DB-6 (HIGH):** Match result is never written back to the Match document. The `winner`, `settlementTx`, `settledAt`, `status→complete`, and `rounds` (turn-by-turn history) are defined in the schema but the code only writes `status: 'cancelled'` on teardown. The `persistStats()` function writes to `User` and `recordMatchPlayed` fires independently, but the Match document itself never becomes auditable. Post-match disputes have no on-server source of truth for what happened in the game.

**Finding DB-7 (MEDIUM):** Dual-write inconsistency on `User`. Two independent fire-and-forget writes update different portions of `User.stats` after a match:
1. `persistStats()` (main.js ~line 2220): writes `matchesPlayed`, `wins`, `losses`, `totalSolWon`, `totalSolLost`, `totalShotEarned`.
2. `saveMilestoneState()` (shot-token.js): writes `totalMatchesPlayed`, `wageredMatchesPlayed`, `wageredWins`, `consecutiveWins`, `milestonesEarned`, `shotBalance`, `totalBurned`, `prestigeTier`, `claimedMatchIds`.

Both use `findOneAndUpdate` with `upsert: true`. They operate on different field paths so they will not overwrite each other, but they are not atomic. A server crash between the two writes produces a split state. More critically, `stats.totalShotEarned` is written by both paths (`$inc` in `persistStats`, `$max` in `saveMilestoneState`) with no single source of truth.

---

### 5. NoSQL Injection Analysis

All Mongoose queries use structured operator objects. No raw string concatenation or string interpolation is present in query filters.

The primary wallet address query pattern:
```js
User.findOne({ walletAddress: wallet })         // shot-token.js:159
User.findOneAndUpdate({ walletAddress: winnerAddr }, ...) // main.js:2224
```

In all cases, `wallet` / `winnerAddr` / `loserAddr` derive from `authenticatedWallets[client.id]`, which is populated only after successful NaCl Ed25519 verification. This is a strong server-side control.

**Residual risk:** Mongoose does not sanitize object-type values by default in older configurations. If `walletAddress` were ever sourced from client input without passing through auth verification first, an attacker could inject `{ "$gt": "" }` to match any user. The current code paths do not have this exposure, but the lack of schema-level format validation (see Finding DB-2) means future developers lack a safety net.

No `$where` clause usage was found. No raw aggregation pipelines with user-supplied strings were found.

---

### 6. Match Result Tamperability

**Finding DB-8 (MEDIUM):** Because match results (winner, settlement TX) are never written to the DB, there is no on-database record of who won or how much was transferred. An attacker who gains MongoDB write access could:
- Not alter settlement outcome (that is on-chain and protected by the Anchor program).
- Alter `User.stats.wins`, `totalSolWon`, and `totalShotEarned` — inflating leaderboard standing and potentially triggering additional SHOT milestone emissions if the milestone state is re-evaluated (it is not re-evaluated from DB, but the data is visible).

The on-chain escrow is the authoritative record for financial settlements. MongoDB stats are soft metrics. The risk is limited to leaderboard manipulation, not fund theft.

---

### 7. `ADMIN_API_KEY` Not in `.env.example`

**File:** `server/.env.example` and `server/middleware/guards.js` line 27

```js
export function requireAdminKey(req, res, next) {
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
```

The guard correctly blocks when `ADMIN_API_KEY` is not set (`!process.env.ADMIN_API_KEY` returns true). However, the `.env.example` file does not include a placeholder for `ADMIN_API_KEY`. An operator bootstrapping from `.env.example` will omit this variable, causing the guard to always return 401 (correct — endpoints are locked), but they will not know the endpoints exist or how to access them. This is a UX/ops concern rather than a security vulnerability, but it could cause confusion and lead operators to disable the guard rather than configure the key.

---

### 8. `claimedMatchIds` and `verifiedBurnTxs` Unbounded Growth

**File:** `server/services/shot-token.js` line 139, `server/models/ServerState.js` line 16

```js
claimedMatchIds: new Set(),          // in-memory, persisted as array
verifiedBurnTxs: { type: [String] }  // MongoDB array
```

`claimedMatchIds` is per-user, stored as an array in `User.stats.claimedMatchIds`. Each claimed match ID is a string of the form `${roomId}:${round}:${timestamp}` (~35 characters). With 100 matches played per user, this is ~3.5 KB of the user document — manageable. At 10,000 matches it becomes 350 KB per user document, approaching the 16 MB MongoDB document limit much earlier than expected for power users.

`verifiedBurnTxs` is global (one array in the singleton ServerState document). With 5 tiers and N users, this grows as 5N entries of 88 bytes each. At 36,000 users this reaches ~15.8 MB, approaching the document limit.

**Finding DB-3 (restated):** Both arrays need size management. Recommendations: TTL-index old claimedMatchIds (matches older than 90 days cannot be re-claimed anyway), and migrate `verifiedBurnTxs` to a separate collection with an index on the signature string.

---

### 9. Backup and Recovery

No backup mechanism exists in the codebase. There is no `mongodump` invocation, no Atlas PITR configuration in code, and no documented recovery procedure. The `.env.example` uses a MongoDB Atlas SRV URI; Atlas free and paid tiers offer cloud backups by default when configured, but this requires deliberate setup in the Atlas console and is not documented in the project. A failed migration or accidental collection drop would lose all user stats, match history, and the `verifiedBurnTxs` replay-protection set — the latter being financially consequential (a user could re-submit an already-used burn TX and re-unlock a prestige tier).

---

## Finding Register

| ID | Severity | Title | File |
|----|----------|-------|------|
| DB-1 | LOW | No MongoDB reconnect alerting — silent write failures | `server/index.js`, `server/models/ServerState.js` |
| DB-2 | MEDIUM | No walletAddress format validation on User schema | `server/models/User.js` |
| DB-3 | MEDIUM | Unbounded growth of `verifiedBurnTxs` array (16MB doc limit risk) | `server/models/ServerState.js` |
| DB-4 | LOW | No index on `Match.status` or TTL on old Match documents | `server/models/Match.js` |
| DB-5 | HIGH | `failedSettlements` retry queue is in-memory — lost on restart, funds lock in escrow | `server/socket-io/main.js` lines 78–137 |
| DB-6 | HIGH | Match result (winner, settlementTx, settledAt) never written to Match document | `server/socket-io/main.js`, `server/models/Match.js` |
| DB-7 | MEDIUM | Dual fire-and-forget writes to User.stats with no ordering guarantee | `server/socket-io/main.js` ~2220, `server/services/shot-token.js` ~202 |
| DB-8 | MEDIUM | Match winner/stats in DB are mutable without on-chain anchor — leaderboard integrity | `server/models/User.js`, `server/socket-io/main.js` |
| DB-9 | LOW | `ADMIN_API_KEY` absent from `.env.example` — ops confusion risk | `server/.env.example`, `server/middleware/guards.js` |
| DB-10 | LOW | `claimedMatchIds` per-user array grows unboundedly — potential document size issue | `server/models/User.js`, `server/services/shot-token.js` |
| DB-11 | INFO | No backup/recovery mechanism documented or in-code | All DB files |

---

## Recommendations

**DB-5 (failed settlements):** Persist `failedSettlements` to a MongoDB collection on insert/update. On startup, load any `status: 'pending_cancel'` entries and re-queue them. This prevents fund lockup after a crash.

**DB-6 (match result):** After `settleMatch()` succeeds, write `{ status: 'complete', winner: winnerWallet, settlementTx: sResult.txSignature, settledAt: new Date() }` to the Match document via `Match.findByIdAndUpdate`. After `settleMatch()` fails, write `{ status: 'cancelled' }`.

**DB-7 (dual write):** Merge both write paths into a single `findOneAndUpdate` call per player after match end. Pass all fields — `$inc` for counters, `$set` for state, `$max` for peak values — in one atomic operation.

**DB-3/DB-10 (unbounded arrays):** Move `verifiedBurnTxs` to a dedicated `BurnTx` collection with an indexed `signature` field and a `createdAt` field with a 365-day TTL. Prune `claimedMatchIds` to the most recent 1,000 entries per user (matches older than any realistic replay window).

**DB-2 (wallet address validation):** Add a Mongoose validator to `User.walletAddress`:
```js
validate: { validator: (v) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v), message: 'Invalid wallet address' }
```

**DB-9 (env example):** Add `ADMIN_API_KEY=change-me-to-a-random-32-char-string` to `.env.example` with a comment explaining its purpose.

**MongoDB connection options:** Add explicit options to `mongoose.connect()`:
```js
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
})
```
