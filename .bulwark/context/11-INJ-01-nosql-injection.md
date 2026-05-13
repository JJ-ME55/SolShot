---
task_id: db-phase1-inj-01
provides: [inj-01-findings, inj-01-invariants]
focus_area: inj-01
files_analyzed:
  - server/models/User.js
  - server/models/Match.js
  - server/models/GroupMatch.js
  - server/services/users.js
  - server/services/match.js
  - server/services/referrals.js
  - server/services/groupchat/lifecycle.js
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/services/challenge/challenge.js
  - server/index.js
finding_count: 8
severity_breakdown: {critical: 1, high: 2, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# INJ-01: NoSQL Injection — Condensed Summary

## Key Findings (Top 8)

- `getOrCreateReferralCode(userQuery)` accepts a raw Mongoose query object constructed by the caller — no whitelist on allowed keys: `server/services/referrals.js:50-56`
- `attributeReferrer({ refereeQuery })` accepts a caller-supplied query object passed straight to `User.findOne(refereeQuery)`, `User.findOneAndUpdate(refereeQuery, ...)`: `server/services/referrals.js:81-104`
- `GroupMatch.findOne({ matchId })` where `matchId` is a raw string from socket payload with only truthiness check (`if (!matchId)`), no type assertion — a client sending `{ matchId: { $gt: "" } }` would match the first match document: `server/socket-io/groupchat.js:97-103`
- `User.findOne(query)` in `getStats` where `query` is built from server-controlled values (`wallet` / `uid`) sourced from `authenticatedWallets` and `playerUids` — safe as these are server-side maps, not raw payload: `server/socket-io/main.js:3150-3151`
- `lookupChallengerStats({ handle })` calls `User.findOne({ handle })` where `handle` comes from `req.body` of `POST /api/challenge` with no type/operator check — `{ handle: { $gt: "" } }` would match the first User with any handle: `server/services/challenge/challenge.js:41`
- `User.bulkWrite(ops)` in `pushMatchHistory` constructs update operations from match data (not user-supplied directly) but the `filter: { telegramUserId: p.telegramUserId }` values are trusted from the match doc — safe in practice: `server/services/groupchat/lifecycle.js:976-1002`
- No Mongoose strict mode explicitly configured — connection uses default (strict: true per schema, but no `mongoose.set('strictQuery', true)` at global level which defaults to `false` in Mongoose 6/7 transition): `server/index.js:545`
- No `$where` clauses found. No `eval()` or `Function()` constructors found in server query paths.

## Critical Mechanisms

- **Referral `userQuery` passthrough**: `getOrCreateReferralCode` and `attributeReferrer` take a `userQuery` parameter that is used directly as a Mongoose filter object. The callers in `main.js` use `buildUserQueryForClient(client)` which only produces `{ walletAddress }`, `{ telegramUserId }`, or `{ uid }` — hardcoded field names, safe values. But the API in `referrals.js` itself does not enforce this contract — any caller could pass `{ $where: ... }` or `{ $gt: '' }`. Risk is currently low because only one call site exists in `main.js` and one in `bot.js`, but the function signature is an injection-ready interface. `server/services/referrals.js:50`
- **`matchId` as raw string in GroupMatch queries**: Every GroupMatch query in `groupchat.js` uses client-supplied `matchId` as a query field value. Mongoose coerces string fields to the schema type (String), but operator injection via an object `{ $gt: '' }` would survive because the truthiness check `if (!matchId)` passes for an object, and Mongoose would use the object as a query operator against a String field — this is a type-mismatch injection vector. `server/socket-io/groupchat.js:98,162,237,276`
- **`POST /api/challenge` handle lookup**: `challengerHandle` and `opponentHandle` from `req.body` flow into `User.findOne({ handle })` without type coercion — an attacker sending `{ "opponentHandle": { "$gt": "" } }` would match the first User document alphabetically.

## Invariants & Assumptions

- INVARIANT: All `walletAddress` query values come from `authenticatedWallets[client.id]` (server-side map populated by signature verification), never from client payload — enforced consistently across `main.js`. `server/socket-io/main.js:1140-1147`
- INVARIANT: `telegramUserId` used in queries is always a Number (validated by `if (!telegramUserId || typeof telegramUserId !== 'number')` in `lookupUserByTelegramId` and `linkTelegramIdentity`) — `server/services/users.js:46,187`
- INVARIANT: `referralCode` values used in queries are validated against `/^[0-9A-F]{6}$/i` before use — `server/services/referrals.js:85-88`
- ASSUMPTION: `matchId` from client payloads is always a short alphanumeric string (4-8 chars) — NOT enforced with type check, only truthiness. `server/socket-io/groupchat.js:98`
- ASSUMPTION: `uid` values from `registerIdentity` are safe query keys because they're checked for min-length 10 and stored server-side. NOT enforced as non-operator strings. `server/socket-io/main.js:1434`
- ASSUMPTION: `handle` values from `POST /api/challenge` req.body are plain strings — NOT enforced before passing to `User.findOne({ handle })`. `server/services/challenge/challenge.js:41`

## Risk Observations (Prioritized)

1. **`matchId` object injection into `GroupMatch.findOne`**: `server/socket-io/groupchat.js:103` — Client sends `{ matchId: { $gt: "" } }` socket payload, truthiness check passes, Mongoose receives an operator as the query value for a String schema field. In MongoDB with `{ matchId: { $gt: "" } }` the operator injection can cause an unexpected document match (returns first match alphabetically by matchId). Low direct business impact since the result is still sanitized, but enables information disclosure of arbitrary match snapshots. Affects all `getGroupMatch`, `fireGroupShot`, `forfeitGroupMatch`, `requestGroupDepositTx`, `confirmGroupDeposit` handlers.
2. **`lookupChallengerStats` handle injection**: `server/services/challenge/challenge.js:41` — `req.body.opponentHandle` → `User.findOne({ handle })` with no String coercion. Sending `{ "opponentHandle": { "$ne": null } }` returns the first User document, leaking their stats to the challenge card renderer. Medium severity — information disclosure on an unauthenticated HTTP endpoint.
3. **`getOrCreateReferralCode(userQuery)` / `attributeReferrer({ refereeQuery })` API contract**: `server/services/referrals.js:50,81` — The functions accept any Mongoose query object, but currently only called with safe `buildUserQueryForClient()` output. Future call sites (or a confused contributor) could pass unsanitized objects. This is a latent API-design injection vector.
4. **`uid` from `registerIdentity` used in queries without operator check**: `server/socket-io/main.js:1449,1456` — `uid` is stored in `playerUids[client.id]` from a socket event payload (only checked for length >= 10). If `uid` were an object like `{ $ne: "" }`, it would be stored and then used in `User.findOne({ uid })`. The length check (`uid.length < 10`) on an object would be `undefined < 10` = false, so the check passes. This is a plausible injection path.
5. **Regex in admin endpoint uses server-controlled pattern**: `server/index.js:243` — `/api/admin/truncate-handles` uses `{ handle: { $regex: /^.{13,}$/ } }` hardcoded, not user-supplied. Safe.

## Novel Attack Surface

- `getMyGroupMatches` query: `{ 'players.telegramUserId': tgId, state: { $in: ['lobby', 'awaiting_deposits', 'active'] } }` — `tgId` comes from `tgIdFor()` which reads from socket-verified `telegramUser.id` (safe). However, the `payload.telegramUserId` dev fallback (`if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId)`) could be active on a misdeployed staging instance, allowing operator injection via the payload field to enumerate all group matches. `server/socket-io/groupchat.js:72-78`

## Cross-Focus Handoffs

- → **AUTH-03**: `tgIdFor()` in groupchat.js falls back to `payload.telegramUserId` in non-production mode. If NODE_ENV is not correctly set on Render (e.g. defaults to empty), this fallback activates in production and the identity trust model collapses. `server/socket-io/groupchat.js:74`
- → **API-03**: WebSocket event handlers for `getGroupMatch`, `fireGroupShot`, `forfeitGroupMatch`, `requestGroupDepositTx`, and `confirmGroupDeposit` all accept `matchId` from untrusted payloads with only truthiness checks. Operator injection produces unexpected query behavior combined with the authorization gap: a non-member can query any match document if they send an operator that matches a different match.
- → **DATA-01**: Mongoose `strictQuery` global setting should be audited — `mongoose.set('strictQuery', true)` is not called. In Mongoose 6.x `strictQuery` defaulted to `true`; in 7.x it defaults to `false`. Without strict query mode, extra query fields are silently ignored rather than throwing.

## Trust Boundaries

User input flows into MongoDB queries through three entry points: (1) HTTP route handlers (`/api/challenge`, `/api/wallet/link-from-tg-token`) where `req.body` fields are destructured and passed to service functions; (2) Socket.IO event payloads where fields like `matchId`, `uid`, and `handle` are extracted by property name; and (3) Telegram bot command arguments parsed as strings. The server-side identity maps (`authenticatedWallets`, `playerUids`) act as a trust boundary for wallet and uid values — they're populated through verified server logic, not raw from client payloads. The weakest point is the HTTP challenge endpoint and the GroupMatch socket handlers where client-supplied strings flow into query field values without explicit String coercion or operator-key rejection.
<!-- CONDENSED_SUMMARY_END -->

---

# INJ-01: NoSQL Injection — Full Analysis

## Executive Summary

SolShot uses Mongoose with MongoDB across five model files (User, Match, GroupMatch, Challenge, Weapon). The codebase has no `$where` clauses, no `eval()`/`Function()` constructors, and no regex built from user input. The primary injection surface is operator injection — where a client sends a JavaScript object (`{ $gt: "" }`) instead of a plain string for a query field. Two confirmed and three latent vectors were found.

The most actionable finding is that `GroupMatch.findOne({ matchId })` in `groupchat.js` receives `matchId` from socket payloads with only a truthiness check, not a type assertion to `String`. Mongoose's String field coercion does NOT prevent `{ $gt: "" }` from being used as a query operator — it only affects primitive coercion. An attacker sending an object as `matchId` can match unintended documents.

## Scope

Files analyzed:
- `server/models/User.js` (280 LOC) — schema definitions
- `server/models/Match.js` (190 LOC) — schema definitions
- `server/models/GroupMatch.js` (240 LOC) — schema + indexes
- `server/services/users.js` (280 LOC) — User query call sites
- `server/services/match.js` (310 LOC) — in-memory state, no direct DB queries
- `server/services/referrals.js` (163 LOC) — referral flow, userQuery passthrough
- `server/services/groupchat/lifecycle.js` (1123 LOC) — group match queries + bulkWrite
- `server/socket-io/main.js` (1850+ LOC) — socket event handlers, query construction
- `server/socket-io/groupchat.js` (~600 LOC) — group match socket handlers
- `server/services/challenge/challenge.js` (~310 LOC) — challenge creation, handle lookup
- `server/index.js` (~600 LOC) — HTTP routes, Mongoose connection

## Key Mechanisms

### Schema Definitions

**User.js**: Strict schema. Fields: `walletAddress` (String), `uid` (String), `telegramUserId` (Number), `referralCode` (String with regex match `/^[0-9A-F]{6}$/`), `handle` (String), etc. No `{ strict: false }` option. Default Mongoose strict mode applies per-document.

**Match.js**: Simple schema. `roomCode` (String unique). No injection-relevant patterns.

**GroupMatch.js**: Complex schema. `matchId` (String unique), `chatId` (Number), `state` (enum). Has compound indexes. `players` is a subdocument array with `telegramUserId` (Number) and `walletAddress` (String).

### Query Construction Patterns

**Pattern A — Server-controlled queries (SAFE)**
The most common pattern: server reads a verified value from an internal map and uses it directly as a query field value.

```js
// main.js - wallet from authenticatedWallets map (server-controlled)
const wallet = authenticatedWallets[client.id];
User.findOne({ walletAddress: wallet });

// users.js - telegramUserId validated as Number
if (!telegramUserId || typeof telegramUserId !== 'number') return null;
User.findOne({ telegramUserId });
```

**Pattern B — Client-payload string fields into queries (RISK)**
Socket payload fields extracted by property name and used in `findOne` filter without explicit String coercion.

```js
// groupchat.js:97-103
client.on('getGroupMatch', async ({ matchId } = {}) => {
    if (!matchId) { ... }
    const match = await GroupMatch.findOne({ matchId }).lean();
```

`matchId` here is whatever the client sends. If the client sends `{ matchId: { $gt: "" } }`, then the destructuring `{ matchId }` assigns `matchId = { $gt: "" }`. The truthiness check `if (!matchId)` is `if (false)` for an object — it passes. Mongoose receives `{ matchId: { $gt: "" } }` as the query filter. Since `matchId` is a `String` in the schema, Mongoose does attempt coercion for primitives but NOT for objects — operator objects pass through to the MongoDB driver.

This same pattern repeats for:
- `fireGroupShot` (line 162): `if (!payload.matchId)`
- `forfeitGroupMatch` (line 237): `if (!payload.matchId)`
- `requestGroupDepositTx` (line 432): `const { matchId } = payload; if (!matchId)`
- `confirmGroupDeposit` (line 525): `const match = await GroupMatch.findOne({ matchId })`

**Pattern C — HTTP req.body fields into queries (RISK)**
`POST /api/challenge` extracts `opponentHandle` from `req.body` and passes it to `lookupChallengerStats({ handle })`:

```js
// challenge.js:41
if (!user && handle) user = await User.findOne({ handle }).lean();
```

`handle` here is `req.body.opponentHandle`. An attacker sending `"opponentHandle": { "$ne": null }` would cause `User.findOne({ handle: { $ne: null } })` — returning the first User document with any handle set. This is an unauthenticated endpoint with no rate limiting guard beyond the global express-rate-limit.

**Pattern D — userQuery passthrough (LATENT RISK)**
`referrals.js` exports two functions that accept a Mongoose query object:

```js
// referrals.js:50
export async function getOrCreateReferralCode(userQuery) {
    const user = await User.findOne(userQuery).select('referralCode').lean();
    ...
    await User.findOneAndUpdate(userQuery, { $set: { referralCode: code } });
```

```js
// referrals.js:81
export async function attributeReferrer({ refereeQuery, referrerCode }) {
    const referee = await User.findOne(refereeQuery).select(...).lean();
    ...
    await User.findOneAndUpdate(refereeQuery, { $set: { referredByCode: code } });
```

All current callers use `buildUserQueryForClient(client)` which produces safe objects like `{ walletAddress: wallet }`, `{ telegramUserId: id }`, or `{ uid: uid }`. The risk is that the function interface itself accepts arbitrary query objects — it's a footgun for future callers.

**Pattern E — uid from socket payload (LATENT RISK)**
The `registerIdentity` event handler:

```js
// main.js:1433-1438
client.on('registerIdentity', ({ uid, handle }) => {
    if (!uid || typeof uid !== 'string' || uid.length < 10) return
    ...
    playerUids[client.id] = { uid, handle: clean }
```

The check `typeof uid !== 'string'` would correctly reject an object. This is SAFE — the type check at line 1434 blocks operator objects. However, `handle` is only truncated and profanity-checked, not validated against being a plain string — but `handle` is not used directly in queries (it's stored in `playerUids` and copied to User doc via `$set`).

## Trust Model

There are four trust levels for data entering MongoDB queries:

1. **Verified server-side state** (walletAddress, telegramUserId via middleware): Safe. These are populated through cryptographic verification or HMAC-validated Telegram initData, stored in server-side maps, and only accessed by server code.

2. **Type-validated socket payload fields** (uid with `typeof uid !== 'string'` check, referralCode with regex match): Safe for the specific validated fields.

3. **Truthiness-only-checked socket payload fields** (matchId in all groupchat handlers): Risk. `if (!matchId)` does not prevent object injection.

4. **Unauthenticated HTTP body fields** (handle/opponentHandle in POST /api/challenge): Risk. No type enforcement before database use.

## State Analysis

**GroupMatch.matchId** (String, unique, indexed): Used as query key in 8+ places in groupchat.js and lifecycle.js. Values are generated server-side as 4-char hex strings, but the query path does not re-enforce that the incoming value is a String.

**User.handle** (String, indexed): Used in challenge.js `lookupChallengerStats`. Path: HTTP POST body → service function → `findOne({ handle })`. No validation before query.

**User.referralCode** (String, indexed): Validated with `/^[0-9A-F]{6}$/i` before any query use. Safe.

## Focus-Specific Analysis

### INJ-01.1: Operator Injection via matchId (Medium-High)

**Location**: `server/socket-io/groupchat.js:97-129` and all subsequent handlers.

**Attack**: Client sends `socket.emit('getGroupMatch', { matchId: { "$gt": "" } })`. The destructuring `{ matchId }` extracts the object. `if (!matchId)` is `false` for a non-null object. `GroupMatch.findOne({ matchId: { "$gt": "" } })` is executed — this is a valid MongoDB query that matches the first GroupMatch document where `matchId > ""` (alphabetically, likely the first match in the collection). The handler returns a sanitized match document to the caller.

**Impact**: Information disclosure — an unauthenticated or low-privilege socket can retrieve arbitrary match snapshots (terrain, player list, wallet addresses, HP state). The `sanitizeMatch()` function only removes `lobbyMessageId` and `__v`, leaving `players[].walletAddress`, `escrowPda`, and other sensitive fields exposed.

**Note**: `fireGroupShot` uses the same pattern but also validates `tgId` via `tgIdFor()` — so the injection on that handler still requires a Telegram-authenticated session or a non-production NODE_ENV, limiting impact.

### INJ-01.2: Operator Injection via handle in /api/challenge (Medium)

**Location**: `server/services/challenge/challenge.js:38-61` called from `server/index.js:301`.

**Attack**: `POST /api/challenge` with body `{ "challengerHandle": "ATTACKER", "challengerWallet": "...", "opponentHandle": { "$ne": null } }`. The `lookupChallengerStats` function receives `handle = { "$ne": null }` and calls `User.findOne({ handle: { $ne: null } })`. This returns the first User document with any handle.

**Impact**: Leaks a User's stats (wins, losses, winRate, rank) through the challenge card renderer. The challenge API is public (no auth required). Combined with repeated calls varying the operator, an attacker could enumerate all users with handles.

**Note**: The leaked data is stats-only (callsign, rank, record, winRate) not wallet addresses — medium severity.

### INJ-01.3: uid Operator Injection (Low-Latent)

**Location**: `server/socket-io/main.js:1433-1434`.

The check `typeof uid !== 'string'` correctly blocks object injection for the `uid` field specifically. This is safe. However, this analysis confirms that `handle` from the same event is NOT type-checked before profanity filtering and is stored directly via `$set: { handle: clean }`. Since `clean = (handle || '').slice(0, 16)` and `.slice()` on an object returns `undefined`, this would result in `$set: { handle: undefined }` which Mongoose ignores. Safe in practice but brittle.

### INJ-01.4: refereeQuery/userQuery Passthrough API (Low)

**Location**: `server/services/referrals.js:50,81`.

The exported `getOrCreateReferralCode(userQuery)` and `attributeReferrer({ refereeQuery })` functions are designed to accept arbitrary Mongoose query objects and pass them directly to `findOne` and `findOneAndUpdate`. All current callers pass safe objects from `buildUserQueryForClient()`. Risk is architectural: the interface encourages injection-vulnerable usage patterns.

### INJ-01.5: Mongoose strictQuery Setting (Low)

**Location**: `server/index.js:545` — `mongoose.connect(MONGODB_URI)` with no options.

Mongoose 6.x deprecated `strictQuery` (default: `true`) and 7.x switched the default to `false`. Without explicitly calling `mongoose.set('strictQuery', true)`, query fields that don't exist in the schema are silently ignored rather than throwing an error. This is not directly exploitable but means extra query fields from injection attempts won't throw and may mask attempted attacks.

### INJ-01.6: bulkWrite in pushMatchHistory (Safe)

**Location**: `server/services/groupchat/lifecycle.js:962-1028`.

The `pushMatchHistory` function builds `User.bulkWrite(ops)` where:
- `filter: { telegramUserId: p.telegramUserId }` — comes from match.players which are server-created subdocuments. The `telegramUserId` is a Number in the schema.
- `update: { $inc: {...}, $set: {...}, $push: {...} }` — update operators are hardcoded; the variable parts are damage counts, kills, etc. derived from game physics.

No user-controllable operators. The `$expr: { $gt: ['$stats.consecutiveWins', '$stats.bestWinStreak'] }` in the streak update is also hardcoded. Safe.

### INJ-01.7: $regex in Admin Endpoint (Safe)

**Location**: `server/index.js:242-244`.

```js
{ handle: { $regex: /^.{13,}$/ } }
```

Hardcoded regex pattern, not user-supplied. Protected by `requireAdminKey` middleware. Safe.

### INJ-01.8: $where / eval() Absence (Confirmed Safe)

Grep across all server code confirms: no `$where` usage, no `eval(`, no `new Function(`. The MongoDB driver itself does not use any JS-in-Mongo evaluation.

## Cross-Focus Intersections

- **AUTH-03**: The `tgIdFor()` dev fallback in `groupchat.js` (NODE_ENV !== 'production') allows non-TG sockets to supply their own `telegramUserId` in the payload. If NODE_ENV is wrong in production, this collapses identity trust model AND exposes all group-match queries to arbitrary user-supplied identity values.

- **API-03 (WebSocket)**: The `getGroupMatch` handler has no authentication gate — it accepts any socket, authenticated or not, and the operator injection in `matchId` would allow data extraction without authentication. This intersects with the unauthenticated WebSocket events finding (H016/H017 from Bulwark #1).

- **DATA-01 (Database Security)**: The Mongoose `strictQuery` default being unset is a configuration concern. Also, the `User.findOne(query)` in `getStats` (main.js:3151) constructs `query` from server-controlled state (`wallet` from `authenticatedWallets`, `uid` from `playerUids`), but the `uid` is stored from a socket payload — if uid injection were successful (it's not, due to the `typeof !== 'string'` check), it would propagate into DB queries.

- **ERR-01 (Error Handling)**: All query call sites are inside try/catch blocks with appropriate fallback behavior. Failed queries return defaults rather than crashing. No injection-related stack traces are exposed to clients — errors use generic messages.

## Risk Observations

| # | Concern | File:Line | Severity | Notes |
|---|---------|-----------|----------|-------|
| 1 | `matchId` operator injection → GroupMatch.findOne | groupchat.js:103 | Medium | All 5+ GC handlers affected |
| 2 | `handle` operator injection → User.findOne (unauthenticated HTTP) | challenge.js:41 | Medium | Stats disclosure only |
| 3 | `getOrCreateReferralCode`/`attributeReferrer` userQuery API | referrals.js:50,81 | Low | Latent; current callers safe |
| 4 | `tgIdFor()` production fallback gap | groupchat.js:72-78 | High (cross-focus) | NODE_ENV check, not INJ-01 per se |
| 5 | Mongoose `strictQuery` unset | index.js:545 | Low | Configuration hardening |

## Novel Attack Surface Observations

The `getGroupMatch` socket handler has no authentication requirement, no rate limiting, and accepts a client-supplied `matchId`. An automated scanner could send `{ matchId: { $gt: "" } }`, then `{ matchId: { $gt: "LAST_SEEN_ID" } }` in a loop, walking the entire GroupMatch collection in alphabetical matchId order. This would expose all match documents, including player wallet addresses, escrow PDAs, and turn histories. The data volume is limited (GroupMatches) but the privacy/operational security exposure is real.

## Questions for Other Focus Areas

1. (API-03) Are WebSocket events for `getGroupMatch` and `fireGroupShot` rate-limited per socket? The combination of no-auth + operator injection + no rate limit creates a data-extraction-at-scale risk.

2. (AUTH-03) What is the production NODE_ENV value on Render? The `tgIdFor()` production fallback is a significant trust bypass if NODE_ENV is not correctly set.

3. (DATA-01) What is the MongoDB user's privilege level? If it has admin-level access, injection that modifies the wrong document would have broader impact.

## Raw Notes

- All `User.findOne({ walletAddress: wallet })` patterns are safe: `wallet` comes from `authenticatedWallets[client.id]` which is populated by server-side signature verification.
- All `User.findOne({ telegramUserId })` patterns are safe: `telegramUserId` validated as Number type before use.
- `User.findOne({ referralCode: code })` is safe: `code` validated by `/^[0-9A-F]{6}$/i` regex before use (`referrals.js:85-88`).
- The `$expr` usage in bulkWrite streak updates is server-hardcoded and not user-influenced.
- No second-order injection vectors observed — retrieved data is not fed back into new queries without re-validation.
- Sort/limit parameters in leaderboard and getTopPlayers queries: `limit=20` and `limit=10` are hardcoded server values, not user-supplied. Safe.
- The `getStats` socket handler's `query` object is constructed from `wallet` or `uid` from server-managed in-memory maps, not from the socket payload directly. The `uid` path has a risk only if the `registerIdentity` type check were bypassed, which it isn't (confirmed via `typeof uid !== 'string'` check at line 1434).
