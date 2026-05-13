---
task_id: db-phase1-data-01
provides: [data-01-findings, data-01-invariants]
focus_area: data-01
files_analyzed: [
  "server/models/User.js",
  "server/models/Match.js",
  "server/models/GroupMatch.js",
  "server/models/Challenge.js",
  "server/models/ServerState.js",
  "server/models/Weapon.js",
  "server/services/groupchat/lifecycle.js",
  "server/services/match.js",
  "server/services/users.js",
  "server/services/referrals.js",
  "server/index.js",
  "server/.env.example"
]
finding_count: 9
severity_breakdown: {critical: 1, high: 3, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# DATA-01: Database & Query Security — Condensed Summary

## Key Findings (Top 5-10)

- **No schema strict-mode / no runValidators on updates**: Mongoose default strict mode IS on (good), but ALL `findOneAndUpdate`/`updateOne`/`bulkWrite` calls omit `{ runValidators: true }` — schema-defined enums, regex matches, min/max, and required constraints are silently bypassed on updates — `server/models/User.js`, `server/models/Match.js`, `server/models/GroupMatch.js`
- **Wallet rotation gap confirmed**: `users.js:91` — `if (walletAddress && !existingByTg.walletAddress)` — once a wallet is linked, it can never be updated through `linkTelegramIdentity`, even if the Privy-issued wallet is rotated by Privy's key management. A stale wallet address stays on the User doc permanently unless manually intervened — `server/services/users.js:91`
- **bulkWrite partial failure silent**: `lifecycle.js:1002` and `:1024` — `User.bulkWrite(ops, { ordered: false })` — with `ordered: false`, individual op failures are silently swallowed inside the catch-level `console.warn`. If 3 of 8 players' stat updates fail (write conflict, document size limit, validation error), callers get no indication and stats diverge without alert — `server/services/groupchat/lifecycle.js:1002`
- **PII linkage without encryption at rest**: `telegramUserId + walletAddress` pair is stored in plaintext in MongoDB. This is a persistent, deanonymizing PII linkage. MongoDB Atlas encryption-at-rest depends solely on Atlas configuration — no application-level field encryption — `server/models/User.js:3-24`
- **GroupMatch.playerSchema identity constraint unenforced by schema**: Comment says "at least one of telegramUserId OR walletAddress is required" but neither field has `required: true` — both are nullable. A player document with neither identity field can be persisted — `server/models/GroupMatch.js:31-33`
- **Race condition on referral code generation**: `referrals.js:36-42` uses a check-then-insert loop (`User.exists(code)` → use it). Between the existence check and the `findOneAndUpdate`, a concurrent request can claim the same code. No unique index is defined on `referralCode` at code level (it IS `unique: true` in schema), but the retry loop handles it poorly — on collision Mongoose throws `E11000 duplicate key`, not caught gracefully — `server/services/referrals.js:36`
- **match.save() on in-memory doc after setImmediate**: `lifecycle.js:858-861` — `settleMatch()` saves match state in `setImmediate`, then calls `settleMatchEscrowV2` on the already-saved doc. If the server restarts between `match.save()` and `settleMatchEscrowV2`, the DB shows `state=settled` but no `settlementTx` — subsequent recovery can't distinguish "settled on-chain" from "DB-only settled" — `server/services/groupchat/lifecycle.js:825-873`
- **MongoDB connection string TLS not explicitly enforced in code**: Connection is `mongoose.connect(MONGODB_URI)` with no explicit TLS options. TLS is embedded in the Atlas URI query string (`tls=true` or via SRV), but if the env var is replaced with a non-Atlas URI, TLS silently drops — `server/index.js:545`
- **Duplicate-key error not handled on upsert paths**: Multiple `findOneAndUpdate` calls use `{ upsert: true }` (e.g., `ServerState.js:50`) — under high concurrency two processes can both pass the "document not found" check and both attempt insert, causing `E11000 duplicate key`. Only `ServerState` and `referrals` upserts have this exposure; callers do not catch `E11000` specifically — `server/models/ServerState.js:50`, `server/services/referrals.js:50-55`

## Critical Mechanisms

- **bulkWrite(ordered:false) for stat history**: `pushMatchHistory()` sends a single `User.bulkWrite` call for all players at match settlement. `ordered: false` means Mongo executes all ops independently, partial failures don't abort the batch, and the only error surface is the top-level catch that logs a warning. No op-level result inspection (`result.writeErrors`) — `server/services/groupchat/lifecycle.js:1001-1028`
- **findOneAndUpdate atomic updates**: `$inc`, `$set`, `$addToSet` used throughout — these are atomic at document level. However, absence of `runValidators: true` means schema enum/regex validators silently skip on update paths — `server/services/referrals.js:133`, `server/services/users.js:123`
- **upsert + unique index TOCTOU**: `ServerState.findOneAndUpdate(key:'global', ..., upsert:true)` — first-ever call on a fresh DB performs two operations (find→insert). Concurrent server startup could produce duplicate-key error that is swallowed in a generic catch — `server/models/ServerState.js:49-57`
- **wallet rotation gap**: `users.js:91` only attaches a wallet if `!existingByTg.walletAddress`. No path in the codebase ever updates an existing wallet to a new address. Privy can silently re-key wallets for embedded wallet users — `server/services/users.js:91`

## Invariants & Assumptions

- INVARIANT: `walletAddress` unique per User document — enforced via `unique:true, sparse:true` at `server/models/User.js:5-8`. Enforced by Mongo index. ✓
- INVARIANT: `referralCode` matches `/^[0-9A-F]{6}$/` — enforced at schema level via `match:` validator — BUT ONLY on insert/save. `findOneAndUpdate` bypasses this unless `runValidators:true` is passed — `server/models/User.js:34`. PARTIALLY ENFORCED ⚠
- INVARIANT: `referralRewardedAt` guards one-shot referral reward — enforced by atomic `findOneAndUpdate({referralRewardedAt: null}, ...)` at `server/services/referrals.js:133`. Enforced ✓
- INVARIANT: Each GroupMatch `matchId` is unique — enforced by `unique:true` index — `server/models/GroupMatch.js:143`. Enforced ✓
- INVARIANT: `verifiedBurnTxs` prevents burn TX replay — persisted via `$addToSet` in `ServerState.persistBurnTx()` — `server/models/ServerState.js:66-77`. Enforced ✓ (but delayed: in-memory Set is the fast path; DB write is async fire-and-forget)
- ASSUMPTION: `telegramUserId` is a permanently stable identifier for a Telegram user — validated at `server/services/users.js:46`. UNVALIDATED ⚠ — Telegram deleted accounts can recycle user IDs; a new user inheriting a recycled TG ID would merge into the previous owner's account
- ASSUMPTION: MongoDB Atlas provides encryption at rest for PII (walletAddress + telegramUserId pairs) — UNVALIDATED ⚠ — this is an infrastructure/Atlas config assumption, not verified in application code
- ASSUMPTION: `bulkWrite` partial failures are non-critical for stat consistency — UNVALIDATED ⚠ — partial stat failure can create leaderboard skew; no reconciliation mechanism exists

## Risk Observations (Prioritized)

1. **bulkWrite silent partial failure** (`lifecycle.js:1002`): If stat-history updates fail for a subset of players, callers receive no signal. Stat divergence on the leaderboard silently accumulates. Could affect wagered-match result history. — HIGH
2. **No `runValidators` on any update path**: Schema-defined enums (e.g., `result: {enum:['win','loss','draw']}`), regex patterns (`referralCode`), min/max values are all bypassable via `findOneAndUpdate`. An operator script or race condition can write invalid state — HIGH
3. **Wallet rotation gap** (`users.js:91`): Privy embedded wallets can be re-keyed. The locked `if (!existingByTg.walletAddress)` guard means the new wallet is never persisted. The user's Match/GroupMatch records will reference the stale wallet for settlement — HIGH (financial impact on wagered path)
4. **GroupMatch.playerSchema identity constraint unenforced**: Neither `telegramUserId` nor `walletAddress` is `required: true` in the embedded playerSchema, contrary to the comment. Server-side join logic enforces this, but direct DB writes or future bug could insert zero-identity player slots — MEDIUM
5. **Upsert + unique index race** (`ServerState.js:50`, `referrals.js:36`): On concurrent startup or concurrent referral code generation, a duplicate-key error (`E11000`) is caught only generically (not by error code). `persistBurnTx` silently returns — burn TX not persisted, replay protection gap — MEDIUM
6. **No application-level encryption for PII linkage**: `telegramUserId + walletAddress` pair enables deanonymization of crypto transactions to real-world Telegram identities. Stored unencrypted in MongoDB — MEDIUM
7. **MongoDB connection TLS implicit**: TLS enforced by Atlas SRV URI convention, not code. A dev accidentally using a non-Atlas URI gets plaintext transport — LOW
8. **Telegram user ID recycling not considered**: `telegramUserId` treated as a permanent stable key. Recycled TG user IDs (deleted accounts) could inherit prior user records including SHOT balance and match history — LOW
9. **bestWinStreak second bulkWrite fire-and-forget**: `lifecycle.js:1011-1028` — `streakOps` bulkWrite runs in a separate try/catch with no dependency on first bulkWrite success. If first bulkWrite failed for all winners, the streak update runs against docs that weren't stat-updated, producing skewed bestWinStreak values — LOW

## Novel Attack Surface

- **Privy wallet re-keying + wallet rotation gap**: If Privy silently re-keys an embedded wallet (e.g., social recovery rotation) and a player has an active wagered match, the `winnerPlayer.walletAddress` used at settlement time refers to the old Privy wallet. Settlement succeeds on-chain but deposits go to an address the user may no longer control. This is a silent financial loss vector that does NOT surface any error in server logs.
- **TG user ID recycling attack**: An attacker who creates a new Telegram account on a recycled TG user ID (of a deleted account that had SHOT balance or wagered matches) would inherit those assets. This cannot be prevented at the application layer without a second identifier (e.g., `uid` or cryptographic proof).

## Cross-Focus Handoffs

- → **ERR-02 (Race Conditions)**: `upsert` race on `ServerState` and `referralCode` generation need TOCTOU analysis; the `findOneAndUpdate(filter:{referralRewardedAt:null})` atomic guard in `referrals.js` should be verified as truly atomic under concurrent writes.
- → **LOGIC-02 (Financial Logic)**: The wallet rotation gap directly impacts wagered-match settlement — if `winnerPlayer.walletAddress` is stale, funds land on-chain at a wallet the winner doesn't control. Cross-check with escrow settlement path in `escrow.js` and `lifecycle.js`.
- → **AUTH-03 (Authorization)**: The identity merge logic in `users.js:linkTelegramIdentity` is the trust boundary for wallet binding. Confirm it cannot be exploited to hijack another user's stats by supplying a known wallet address during TG link flow.

## Trust Boundaries

MongoDB is treated as Zone 3 (trusted) by the application — data read from Mongo is not re-validated against schema before use. Write paths use `findOneAndUpdate` without `runValidators: true`, meaning the DB can contain values that would fail schema validation on insert. The `telegramUserId → walletAddress` mapping is the critical PII linkage that the entire identity and financial system depends on. This mapping is stored without application-level encryption, relying entirely on MongoDB Atlas at-rest encryption for protection. Bulk writes at settlement time use `ordered: false`, meaning individual op failures are invisible to callers — stats can diverge silently. There are no schema migrations or versioning mechanisms — schema changes require careful backward-compatible coding.
<!-- CONDENSED_SUMMARY_END -->

---

# DATA-01: Database & Query Security — Full Analysis

## Executive Summary

SolShot uses MongoDB via Mongoose for persistent game state: six model schemas cover Users, 1v1 Matches, GroupMatches, Challenges, server-global state (ServerState), and a static config file (Weapon). The schema definitions are generally well-structured with appropriate unique indexes and sparse constraints. However, the write paths have a systemic gap: no `findOneAndUpdate`, `updateOne`, `updateMany`, or `bulkWrite` call passes `{ runValidators: true }`, bypassing all schema-level validators on update operations. Additional concerns include: a wallet rotation gap that can permanently lock a stale wallet address to a user's identity, silent partial failure handling in bulk stat writes, absence of application-level encryption for the `telegramUserId + walletAddress` PII linkage pair, and an identity edge case with Telegram user ID recycling.

## Scope

**In scope:** All six Mongoose models, update/write service paths in `users.js`, `referrals.js`, `match.js`, `lifecycle.js` (groupchat), and `ServerState`. MongoDB connection configuration and Atlas assumptions. Migration and backup posture.

**Out of scope:** Anchor/Rust on-chain programs. NoSQL injection (covered by INJ-01).

## Key Mechanisms

### 1. Schema Definitions

**User.js** (280 LOC): Core identity document. Fields:
- `walletAddress`: `unique:true`, `sparse:true`, `index:true` — correct for optional wallet
- `uid`: `unique:true`, `sparse:true` — anonymous browser session
- `telegramUserId`: `unique:true`, `sparse:true`, `index:true` — TG numeric ID
- `referralCode`: `unique:true`, `sparse:true`, `match:/^[0-9A-F]{6}$/` — validated on insert only
- `stats.*`: all numeric fields with `default:0`, no min/max bounds enforced at DB level
- No `required` on walletAddress, uid, telegramUserId — all optional; identity merge is application-side
- **No pre-save or post-save hooks defined** — all validation relies on Mongoose schema validators at insert time
- `matchHistory` is a subdocument array (capped at last 50 via `$slice` in push operations — but only when that specific `$push.$slice` pattern is used; raw `$push` without `$slice` could exceed this)

**Match.js** (190 LOC): 1v1 match record.
- `roomCode`: `required:true`, `unique:true`, `index:true` — correct
- `status`: `enum` with 6 valid states — only enforced on `save()`, NOT on `findOneAndUpdate`
- `host`/`player`: embedded `playerSchema` — neither has `required:true` at the match level; a match with no players can be saved

**GroupMatch.js** (240 LOC): Multi-day group match.
- `matchId`: `required:true`, `unique:true`, `index:true` — correct
- `chatId`: `required:true`, `index:true` — correct
- `state`: enum `['lobby','awaiting_deposits','active','settled','cancelled']` — enforced on save only
- `players[].telegramUserId`: `default:null`, NOT `required` — comment says "at least one of telegramUserId OR walletAddress is required" but schema doesn't enforce this; it's comment-only
- `players[].walletAddress`: `default:null`, NOT `required`
- `config`: `required:true` embedded sub-schema — correct
- Good compound indexes: `{chatId,state}`, `{players.telegramUserId,state}`, `{players.telegramUserId,state,updatedAt:-1}` — these support the most common query patterns without full-collection scans

**Challenge.js** (110 LOC):
- `shortCode`: `required:true`, `unique:true`, regex `/^[0-9A-F]{5}$/` — enforced on insert
- `expiresAt`: `required:true` — good
- `status`: enum — bypassed on `findOneAndUpdate`
- Uses `mongoose.models.Challenge || mongoose.model('Challenge', ...)` pattern — safe against hot-reload model registration conflicts

**ServerState.js** (60 LOC):
- Single-document singleton pattern keyed on `key:'global'`
- `verifiedBurnTxs`: `[String]` array — persisted via `$addToSet`, correct for idempotent append
- `upsert:true` on both `saveServerState` and `persistBurnTx` — race on first startup (see Observation 5)

**Weapon.js** (85 LOC): Not a Mongoose model — a pure JS config object. No DB concerns.

### 2. Write Paths

**`findOneAndUpdate` without `runValidators: true`** — present on EVERY write path:

```javascript
// users.js:123
return await User.findOneAndUpdate(
    { telegramUserId },
    { $set: update },
    { returnDocument: 'after' }  // ← no runValidators: true
).lean();

// referrals.js:133
const refereeUpdate = await User.findOneAndUpdate(
    { ...refereeQuery, referralRewardedAt: null },
    {
        $set: { referralRewardedAt: new Date() },
        $inc: { 'stats.shotBalance': REFERRAL_REWARD_SHOT, ... },
    },
    { returnDocument: 'after' }  // ← no runValidators: true
).lean();

// ServerState.js:50
await ServerState.findOneAndUpdate(
    { key: 'global' },
    { totalShotEmitted, updatedAt: new Date() },
    { upsert: true }  // ← no runValidators: true
);
```

Mongoose's validators (type coercion, enum checks, regex patterns, required fields on sub-documents) only run on `save()` and `create()`. Any `findOneAndUpdate`/`updateOne`/`bulkWrite` bypasses them unless `runValidators: true` is explicitly set. In this codebase, this means:
- `status` enums on `Match` and `GroupMatch` can be set to arbitrary strings via direct DB updates or operator scripts
- `referralCode` regex `match` constraint only applies at creation time; an update could write a malformed code
- `stats.shotBalance` has no min/max — negative balances are schema-permissible on the update path

### 3. Wallet Rotation Gap

`users.js:91`:
```javascript
if (walletAddress && !existingByTg.walletAddress) {
    // ... only links wallet if doc has none
```

Once a `walletAddress` is set on a User document, it is **never updated** by `linkTelegramIdentity`. There is no other path in the codebase that updates an existing wallet to a new address. Privy (the current wallet provider) uses embedded wallets that are tied to social login. If Privy re-provisions a wallet (e.g., social recovery, account recovery flow), the new wallet address is silently ignored.

**Impact on wagered matches**: At settlement time in `lifecycle.js:851`:
```javascript
const winnerPlayer = match.players.find(p => p.telegramUserId === winnerTgId);
if (!winnerPlayer?.walletAddress) { /* error */ }
const result = await settleMatchEscrowV2(match.matchId, winnerPlayer.walletAddress);
```

If `winnerPlayer.walletAddress` is the stale pre-rotation address, the on-chain settlement deposits funds into that stale address. The user cannot access them.

### 4. bulkWrite Partial Failure

`lifecycle.js:996-1028` — `pushMatchHistory()` at group match settlement:

```javascript
const ops = validPlayers.map(p => ({
    updateOne: {
        filter: { telegramUserId: p.telegramUserId },
        update: { $inc: { ... }, $set: { ... }, $push: { matchHistory: ... } },
        // upsert: false (intentional — settlement only updates existing Users)
    },
}));

try {
    await User.bulkWrite(ops, { ordered: false });
} catch (err) {
    console.warn('[group-chat] matchHistory bulkWrite failed:', err.message);
    return;  // ← EARLY RETURN — streak updates never run if bulk throws
}
```

`{ ordered: false }` means Mongo executes all operations independently, collects individual write errors, and only throws if ALL operations fail or for system-level errors. A `MongoBulkWriteError` thrown here means at least one operation failed, but the `err.message` log does not expose which players' updates failed. `result.writeErrors` from the resolved value (not the thrown error) would contain the individual failure details — but the code catches and returns on the first thrown error, losing all individual error details.

Additionally, the bestWinStreak follow-up `bulkWrite` at line 1024 runs in a separate `try/catch` block regardless of whether the first `bulkWrite` succeeded. If the first bulk fails for all winners but doesn't throw (some ops succeeded), the streak update runs against partially-updated docs.

### 5. Race Conditions on Upsert

**ServerState (line 50)**: `ServerState.findOneAndUpdate({key:'global'}, ..., {upsert:true})` — on first server boot with an empty database, two near-simultaneous calls (e.g., `saveServerState` and `persistBurnTx` both called shortly after `initShotState`) can both find no existing document and both attempt to insert. Mongo's `upsert` with a unique index raises `E11000 duplicate key` on the second insert. The catch block at line 55:
```javascript
} catch (err) {
    console.error('[ServerState] Save error:', err.message);
}
```
This generic catch does NOT distinguish `E11000` (benign race, doc was just created by the other call) from a real error (network partition, auth failure). The net effect is that one of the two updates is silently lost.

**Referral code generation (line 36-42)**:
```javascript
for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const existing = await User.exists({ referralCode: code });
    if (!existing) return code;
}
throw new Error('Failed to generate unique referral code');
```

Between `User.exists(code)` and the subsequent `User.findOneAndUpdate({$set:{referralCode:code}})` in `getOrCreateReferralCode`, another concurrent call can claim the same code. Since `referralCode` is `unique:true`, Mongoose will throw `E11000`. The caller (`getOrCreateReferralCode`) has no explicit `E11000` handling — the error propagates as an unhandled rejection through the bot handler chain.

### 6. PII Linkage Storage

The User document stores `telegramUserId` (Number) and `walletAddress` (String) together in the same document. This creates a persistent, deanonymizing linkage:
- Telegram user ID → real-world identity (name, username, profile photo, contacts)
- Wallet address → full on-chain transaction history, SHOT/SOL balances

MongoDB Atlas provides encryption at rest by default for M10+ clusters. Free/shared tier Atlas (M0/M2/M5) does NOT provide encryption at rest. The `.env.example` references a standard Atlas URI; there is no code-level field encryption and no documentation of which Atlas tier is required.

No data retention or deletion policy is implemented. The `matchHistory` array is capped at the last 50 via `$push.$slice` in `lifecycle.js:991` but only when using that specific push pattern. Other match history writes could grow the array unboundedly if the `$slice` is missed.

### 7. Schema Migrations

There is no schema migration system (no `migrate-mongoose`, `migrate-mongo`, or custom migration scripts). Schema changes are applied by deploying new code — Mongoose creates any missing collections on first use. Old fields are left in existing documents (forward-compatible), new fields with `default` are read correctly from old docs. Structural incompatibilities (renamed required fields, type changes) would produce runtime errors on document access with no warning at startup.

### 8. MongoDB Connection Posture

`server/index.js:545`:
```javascript
mongoose.connect(MONGODB_URI)
```

No connection options are set explicitly (no `tls:true`, no `tlsAllowInvalidCertificates`, no `serverSelectionTimeoutMS`, no `maxPoolSize`). Mongoose defaults are used:
- `serverSelectionTimeoutMS`: 30000ms — stalls on server startup if Atlas is unreachable
- `maxPoolSize`: 5 (Mongoose default) — can exhaust under high concurrency with many Socket.IO connections
- TLS: embedded in the Atlas SRV URI (`mongodb+srv://...` automatically uses TLS) but only if the URI is an SRV URI. A non-SRV URI without `tls=true` would connect in plaintext

No `autoIndex:false` in production — Mongoose attempts to create indexes on startup. For a busy Atlas cluster, this can cause temporary performance degradation.

### 9. Mongoose Hooks

No pre-save or post-save hooks are defined in any model. All validation is schema-based and declarative. This means:
- No automatic field normalization (e.g., walletAddress lowercased on save)
- No automatic audit trails
- No composite validation (e.g., "at least one of walletAddress or telegramUserId is required")

The absence of hooks is generally a positive — no hidden side effects to consider. However, the composite identity constraint on `GroupMatch.players` (comment: "at least one of telegramUserId OR walletAddress is required") is comment-only with no enforcement mechanism.

## Trust Model

MongoDB is treated as a trusted store. Data is read from Mongo and used directly in business logic without re-validation (e.g., `walletAddress` from User doc is passed directly to on-chain settlement calls without re-verifying ownership). Schema validators protect inserts (`save()`/`create()`) but not updates. The only validated update path is the referral reward (atomic filter `{referralRewardedAt: null}`). The application assumes that:
1. Data written to Mongo is always well-formed (not true — update paths bypass validators)
2. `telegramUserId` is immutable and permanent (not guaranteed by Telegram for recycled accounts)
3. `walletAddress` on User doc reflects the wallet the user currently controls (not true after Privy key rotation)
4. MongoDB Atlas provides encryption at rest (not true on free/shared tier)

## State Analysis

- **In-flight match state** (1v1): primarily in-memory (`matchStates[roomId]` Map in `main.js`). Persisted to `Match` collection at settlement time. Loss of in-memory state (server restart) drops all active 1v1 matches.
- **Group match state**: fully persisted to `GroupMatch` collection on every state change. Server restart is safe — `restoreActiveTimers()` re-hydrates scheduler on boot.
- **Burn TX replay set**: persisted to `ServerState.verifiedBurnTxs` via `$addToSet`. In-memory `Set` is the fast path; async fire-and-forget write to DB. Brief window (< 1s normally) where an in-memory entry exists but DB write hasn't committed — restart in this window loses replay protection for that TX.

## Dependencies

- **mongoose 6.x/7.x** (version in package.json not checked here) — `findOneAndUpdate` does NOT run validators by default (this is a known Mongoose design decision, not a bug)
- **MongoDB Atlas** — TLS and at-rest encryption assumed; tier not documented
- No Redis, Memcached, or other cache layer — all state is MongoDB or Node.js in-memory Maps

## Focus-Specific Analysis

### Unique Constraints Summary

| Field | Model | Unique? | Sparse? | Index? |
|-------|-------|---------|---------|--------|
| walletAddress | User | ✓ | ✓ | ✓ |
| uid | User | ✓ | ✓ | — |
| telegramUserId | User | ✓ | ✓ | ✓ |
| referralCode | User | ✓ | ✓ | ✓ |
| roomCode | Match | ✓ | — | ✓ |
| matchId | GroupMatch | ✓ | — | ✓ |
| shortCode | Challenge | ✓ | — | ✓ |
| key | ServerState | ✓ | — | — |

All critical identifier fields have unique constraints. `telegramUserId` on `GroupMatch.players` is NOT unique — a player can appear in multiple matches, and also the embedded subdocument array is not a top-level unique field (correctly handled via compound index `{players.telegramUserId, state}`).

### Validator Bypass Matrix

| Schema Field | Validator | Enforced on insert? | Enforced on update? |
|---|---|---|---|
| `Match.status` | enum | ✓ | ✗ (no runValidators) |
| `GroupMatch.state` | enum | ✓ | ✗ |
| `Challenge.status` | enum | ✓ | ✗ |
| `User.referralCode` | regex | ✓ | ✗ |
| `Challenge.wager.amount` | min:0 | ✓ | ✗ |
| `User.matchHistory[].result` | enum | ✓ | ✗ |

### Atomic Operation Coverage

Good atomic patterns:
- `referrals.js:133` — `findOneAndUpdate({referralRewardedAt:null}, ...)` as compare-and-set ✓
- `lifecycle.js:962-1002` — `bulkWrite` with `$inc`/`$set`/`$push` in single op ✓
- `ServerState.js:69-76` — `$addToSet` for idempotent burn TX append ✓
- `challenge.js:246` — `findOneAndUpdate({status:'open'}, ...)` as CAS ✓

Non-atomic patterns:
- `referrals.js:36-55` — `exists` check → separate `findOneAndUpdate` (TOCTOU on code generation)
- `users.js:74-128` — multi-step find → conditional update (wallet attach is a 2-step read-then-write, not atomic)
- `lifecycle.js:962-998` — the WINNER detection (`winners = validPlayers.filter(p => p.telegramUserId === winnerTgId)`) runs on the in-memory match object, then the bulkWrite updates DB — if match doc is stale (e.g., updated by another process), the winner determination could be wrong

## Cross-Focus Intersections

- **ERR-02 (Race Conditions)**: `upsert` races on `ServerState` and referral code generation
- **LOGIC-02 (Financial)**: wallet rotation gap affects on-chain settlement recipient address
- **AUTH-03 (Authorization)**: `linkTelegramIdentity` is the wallet binding trust boundary
- **DATA-04 (Logging)**: `walletAddress` and `telegramUserId` appear in `console.log` and `console.warn` calls throughout `users.js` — PII in logs
- **SEC-02 (Secrets)**: MongoDB URI contains credentials — exposure via env var or log would compromise the database

## Risk Observations

1. **HIGH — bulkWrite silent partial failure** (`lifecycle.js:1002`): Settlement stat updates for a subset of players can fail silently. Leaderboard diverges. No alerting. `{ ordered: false }` means partial success is normal — code should inspect `result.writeErrors` not just catch throws.

2. **HIGH — No `runValidators` on any update path**: All schema validators bypassed on update operations. `status` enums, `referralCode` regex, `wager.amount min:0`, `matchHistory.result` enum — all can be violated via update. An operator script bug or race condition can write invalid state.

3. **HIGH — Wallet rotation gap** (`users.js:91`): Stale wallet address permanently locked to User doc after Privy re-keys. Settlement to stale address = silent fund loss. No detection, no remediation path in code.

4. **MEDIUM — GroupMatch.playerSchema unenforced identity constraint**: Comment-only constraint "at least one of telegramUserId OR walletAddress required". Neither field has `required:true`. Zero-identity player slots can be persisted. Settlement code at `lifecycle.js:851` has defensive check (`if (!winnerPlayer?.walletAddress)`) but doesn't check `telegramUserId` presence either.

5. **MEDIUM — Upsert race + E11000 not caught specifically** (`ServerState.js:50`, `referrals.js:36`): Generic catch blocks swallow `E11000 duplicate key` errors. For `persistBurnTx`, this means the burn TX signature may not be persisted — replay protection gap for the brief race window.

6. **MEDIUM — PII linkage without field-level encryption**: `telegramUserId + walletAddress` pair deanonymizes crypto transactions to Telegram identities. Atlas free tier provides no encryption at rest. No code-level protection.

7. **LOW — MongoDB TLS implicit**: TLS derives from Atlas SRV URI convention, not explicit connection options. Non-Atlas URI replacement silently drops TLS.

8. **LOW — Telegram user ID recycling**: Deleted TG accounts can have IDs recycled. New user inheriting recycled ID inherits prior account's SHOT balance, match history, referral code.

9. **LOW — No schema migration system**: Schema changes are forward-compatible by convention only. No tooling to validate DB state against current schema at startup.

## Novel Attack Surface Observations

**Privy embedded wallet re-keying × settlement path**: Privy's embedded wallet system can rotate wallet keys for social recovery. The `linkTelegramIdentity` guard at `users.js:91` prevents the new wallet from being registered. If the player wins a wagered match after key rotation, `lifecycle.js:851` reads the stale wallet from their User doc and settles on-chain to the old address. This creates a scenario where the player's Privy session shows the new wallet, the settlement succeeds on-chain, but the funds land at an address Privy no longer has the key for. There is no log alert for this condition (the `if (!winnerPlayer?.walletAddress)` check would pass because a walletAddress exists — it's just stale). The only detection would be the player reporting missing funds.

## Questions for Other Focus Areas

- **ERR-02**: Is `linkTelegramIdentity`'s multi-step find→conditional-update at `users.js:74-128` protected against concurrent calls from the same TG user (e.g., two simultaneous Mini App opens)?
- **LOGIC-02**: What is the expected behavior when `settleMatchEscrowV2` receives a stale wallet address from the User doc? Does the on-chain program validate recipient ownership?
- **AUTH-03**: Can `link-from-privy-telegram` endpoint be called with an arbitrary `telegramUserId` to overwrite an existing User doc's TG identity? (JWT verifies Privy auth but trusts client-supplied `telegramUserId`)

## Raw Notes

- `Weapon.js` is not a Mongoose model — static config. No DB security concerns.
- `match.js` (services) is entirely in-memory state machine logic — no DB operations. DB persistence of 1v1 match results lives in `main.js`.
- `GroupMatch.js` compound index `{players.telegramUserId, state, updatedAt:-1}` is excellent for the `/mygames` query pattern — avoids in-memory sort.
- `Challenge.expireStale()` static method uses `updateMany` without `runValidators` — `status` could theoretically be set to a non-enum value if called with wrong data, though this particular path uses hardcoded `'expired'` string which is valid.
- `saveServerState` is fire-and-forget (errors logged, not thrown) — in a crash after shot emission but before DB write, `totalShotEmitted` could be slightly understated on restart. Low impact given SHOT supply is token-level not DB-level.
- The `find-user.mjs` and `get-wallet.mjs` scripts use `new RegExp(needle, 'i')` with user-supplied input — potential ReDoS on the admin CLI, but only accessible to admins with direct server access.
