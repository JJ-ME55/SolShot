---
task_id: db-phase1-inj-05
provides: [inj-05-findings, inj-05-invariants]
focus_area: inj-05-prototype-pollution-deserialization
files_analyzed:
  - server/index.js
  - server/middleware/telegram.js
  - server/middleware/guards.js
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/services/groupchat/configFlow.js
  - server/services/users.js
  - server/models/User.js
  - server/models/GroupMatch.js
  - server/models/Match.js
  - server/services/keys.js
  - server/services/escrow.js
  - server/services/escrow-v2.js
finding_count: 8
severity_breakdown: {critical: 0, high: 2, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# INJ-05: Prototype Pollution & Deserialization — Condensed Summary

## Key Findings (Top 8)

- `express.urlencoded({ extended: true })` at 1mb limit enables qs nested-object parsing; `__proto__` keys in a URL-encoded body are parsed by `qs` and may set properties on `Object.prototype` in Node.js versions before qs 6.10.3 — `server/index.js:191`
- Socket.IO deserializes every event payload with its own JSON parser before the handler receives it; no custom `JSON.parse` is used for socket payloads, which is correct, but the 64KB `maxHttpBufferSize` cap is the only guard — `server/index.js:73`
- `JSON.parse(userStr)` of Telegram-supplied `user` field after HMAC validation; the resulting object is assigned directly to `socket.telegramUser` with no property filtering; a malicious Telegram server (or if HMAC check fails-open) could supply `{"__proto__":{"isAuthenticated":true}}` — `server/middleware/telegram.js:63,98`
- `client.telegramUser = { id, username, first_name }` object literal is safe because it is constructed from three explicit fields, not from a spread of the parsed user object — `server/socket-io/main.js:1299-1304`
- `configFlow.js:applyValue()` parses numeric values from `callbackData` regex captures with `parseInt(m[1], 10)`; input is constrained to digits only by the regex so prototype-pollution via numeric keys is not possible, but `partial` object is mutated directly — `server/services/groupchat/configFlow.js:333-377`
- No `Object.assign(target, userInput)` or `lodash.merge` / `deepmerge` patterns exist anywhere in the server codebase — confirmed by grep
- `express.json({ extended: true })` is passed to `express.json()` which ignores `extended` (it applies only to `urlencoded`); the option is harmless but misleading — `server/index.js:190`
- `JSON.parse` of keypair JSON (`keys.js:45,48`) and IDL JSON (`escrow.js:81`, `escrow-v2.js:74`) operate on trusted filesystem files, not user input — low risk

## Critical Mechanisms

- **qs `extended: true` body parsing**: `express.urlencoded({limit:"1mb", extended:true})` uses the `qs` library for nested objects. `qs` < 6.10.3 allows `__proto__[foo]=bar` as a URL-encoded key, setting properties on `Object.prototype`. Express bundles `qs` via the `qs` dependency of `body-parser`. All REST endpoints that accept `application/x-www-form-urlencoded` bodies are affected — `server/index.js:191`
- **Telegram user JSON parse → socket property assignment**: After HMAC validation, the `user` field (a JSON string inside `initData`) is parsed and the resulting object assigned to `socket.telegramUser`. This object is later read via `socket.telegramUser.id`, `.username`, `.first_name`. If the HMAC validation ever fails-open (e.g., `TELEGRAM_BOT_TOKEN` not set, which currently returns `{ valid: false }` and still calls `next()`), an unauthenticated payload with a crafted `user` JSON blob reaches the assignment — `server/middleware/telegram.js:18-22,62-64,97-107`
- **Socket.IO 64 KB buffer cap**: `maxHttpBufferSize: 64 * 1024` limits WebSocket payload size. Socket.IO's built-in msgpack/JSON parser runs before user code sees the payload. No custom deserializer is wired in, which is correct — `server/index.js:73`
- **CSP report body parsing**: A second `express.json({ type: 'application/csp-report' })` instance parses CSP violation reports at no explicit limit (inherits Express default 100 KB). The parsed object is accessed via `req.body['csp-report'] || req.body` and only a few known keys are logged — `server/index.js:264-272`

## Invariants & Assumptions

- INVARIANT: Socket.IO payloads are deserialized by Socket.IO's built-in parser, not custom `JSON.parse`. No user-controlled string is passed to `JSON.parse` in socket handlers — ENFORCED (confirmed by grep; only `telegram.js:63` parses user-supplied JSON, gated behind HMAC).
- INVARIANT: No deep-merge of user-controlled objects into application state. No `Object.assign(target, userInput)`, `lodash.merge`, or `deepmerge` calls found anywhere in the server codebase — ENFORCED.
- INVARIANT: Mongoose schema `strict` mode defaults to `true` for all models (`User`, `Match`, `GroupMatch`). Extra fields in a document update are silently dropped. A `__proto__` key in a `$set` update body is treated as an unknown field and stripped before the MongoDB driver sends the write — ENFORCED (Mongoose default; no model explicitly sets `strict: false`).
- ASSUMPTION: `TELEGRAM_BOT_TOKEN` is always set in production, so `validateTelegramInitData` always enforces HMAC and the `user` JSON parse is always gated. If token is absent the function returns `{ valid: false, user: null }` and `socket.telegramUser` is NOT set — VALIDATED at `server/middleware/telegram.js:17-22`.
- ASSUMPTION: `qs` library version bundled with `body-parser`/`express` is >= 6.10.3, which ships with prototype-pollution protection (`allowPrototypes: false` default). This must be verified in `server/package-lock.json` — NEED TO VERIFY.
- ASSUMPTION: No YAML, TOML, or `xml2js` parsers are used in runtime code. Confirmed absent from server `require`/`import` statements — VALIDATED by grep.

## Risk Observations (Prioritized)

1. **qs prototype pollution via URL-encoded body** (`server/index.js:191`): If the pinned `qs` version is < 6.10.3, a POST to any REST endpoint with body `__proto__[isAuthenticated]=true&__proto__[isHost]=true` (content-type `application/x-www-form-urlencoded`) would silently set those properties on `Object.prototype`. Subsequent socket handlers that do `if (!client.isAuthenticated)` would read `true` from the prototype chain instead of the own property. Express only exposes three public REST endpoints that accept bodies (`/api/challenge`, `/api/wallet/link-from-tg-token`, `/api/wallet/link-from-privy-telegram`), but the `urlencoded` middleware is global — any POST hits it.
2. **Telegram `user` JSON unparsed-and-assigned** (`server/middleware/telegram.js:63,98`): The object returned by `JSON.parse(userStr)` is assigned directly to `socket.telegramUser`. The `tgIdFor()` helper in `groupchat.js` reads `socket.telegramUser.id`. There is no explicit check that the parsed object is a plain object with a numeric `id`. If the HMAC path somehow fails-open (e.g., a future refactor removes the `valid` check), a crafted payload `{"id":999999,"__proto__":{"isAuthenticated":true}}` would still only affect `socket.telegramUser`, not `Object.prototype` (since direct assignment doesn't spread). The real concern is impersonation of a specific Telegram user ID, not prototype pollution per se.
3. **CSP report endpoint 100 KB default** (`server/index.js:264`): The `express.json({ type: 'application/csp-report' })` instance at `/api/csp-report` has no explicit `limit`, defaulting to Express's 100 KB. The parsed body is accessed via bracket notation (`req.body['csp-report']`). A crafted CSP report with a `__proto__` key `{ "__proto__": { "isAuthenticated": true } }` in a JSON body would be parsed by Express's JSON parser. `express.json` uses `body-parser` which uses the `on-finished` + streaming parser — the resulting `req.body` is a plain object. However, `JSON.parse` in Node.js does NOT allow `__proto__` as a key to set prototype properties directly (JSON.parse returns a plain object; `__proto__` becomes an enumerable own property, not a prototype assignment). This is a low-risk misconception to document.
4. **`partial` object in configFlow is mutated by regex-extracted values** (`server/services/groupchat/configFlow.js:326-380`): `applyValue(partial, callbackData)` pattern-matches `callbackData` against a fixed set of prefixes (`gc_cfg_wager_<digits>`, `gc_cfg_max_<digits>`, etc.) and writes extracted integers directly to `partial`. The `partial` object starts as `{ _stepIndex: 0 }` and accumulates config fields. Since `callbackData` is Telegram `callback_data` (button press), and the regex only captures `\d+` or `-?\d+` (for buyback cap), and results are `parseInt(..., 10)`, numeric prototype pollution is not possible. However, the `partial` object is never frozen — additional injections through unexpected patterns would silently add properties.
5. **`client.telegramUser` backfill from DB lookup** (`server/socket-io/main.js:1298-1304`): On successful wallet authentication, if no `telegramUser.id` is on the socket but one is found in the User document, the code constructs `client.telegramUser = { id: tgUserId, username: ..., first_name: null }`. This is safe because it uses an object literal with three explicit fields from the DB result. However, `username` comes from `userDoc?.username || null` — a string from MongoDB, not user-supplied input — so no pollution path exists here.
6. **`JSON.stringify(payload.data || {})` in clientDebugLog** (`server/socket-io/main.js:1364`): The `clientDebugLog` handler calls `JSON.stringify` on arbitrary user-supplied `payload.data`. `JSON.stringify` does not cause prototype pollution (it serializes). The result is sliced to 2000 chars and logged. No deserialization occurs. Low risk.
7. **`_setState` test helper in configFlow** (`server/services/groupchat/configFlow.js:439-443`): `_setState(chatId, userId, partial)` directly spreads `partial` into the state map with `{ _stepIndex: 0, ...partial }`. If this function were ever reachable from user input (it is exported as a test helper), spreading a caller-controlled object could pollute config state. In production, it is only called from test code — but its `export` means any code that imports configFlow could call it.
8. **`validatePayload` uses bracket notation on data** (`server/middleware/guards.js:61-65`): `data[field]` reads field from the payload by string key. If the schema contains a key like `__proto__`, `data['__proto__']` returns the prototype. This is a theoretical concern — the actual schemas passed to `validatePayload` are hardcoded objects with normal field names, so no pollution path exists.

## Novel Attack Surface

- **qs prototype pollution escalation to auth bypass**: If `qs` is vulnerable, a single unauthenticated POST to `/api/csp-report` (no auth required) with body `__proto__[isAuthenticated]=true` (urlencoded) could set `Object.prototype.isAuthenticated = "true"`. All subsequent `if (!client.isAuthenticated)` checks in socket handlers would read the inherited truthy string from prototype, bypassing per-socket auth entirely — without ever connecting a socket. This is a high-impact escalation chain that bypasses the entire auth model.
- **Telegram initData `user` impersonation on TELEGRAM_BOT_TOKEN absence**: In dev environments where `TELEGRAM_BOT_TOKEN` is not set, `validateTelegramInitData` returns `{ valid: false, user: null }` and the middleware calls `next()` without setting `socket.telegramUser`. This is correct. However, the comment at `telegram.js:101` says "Only warn if bot token is set (meaning validation should work)" — if the token is set but the HMAC is wrong, the middleware still calls `next()` without setting `telegramUser` (correct). The novel risk is that both paths call `next()` — a future code change that moves the auth from middleware to handler-level could accidentally trust user-supplied `telegramUserId` from the payload in production.

## Cross-Focus Handoffs

- → **AUTH-01 / AUTH-03**: If `qs` prototype pollution is exploitable, `Object.prototype.isAuthenticated = true` bypasses all `requireAuth()` and `requireAuthIfWagered()` checks in `main.js`. The auth model assumption that `client.isAuthenticated` is socket-own-property is invalidated.
- → **INJ-01 (NoSQL Injection)**: `express.urlencoded({ extended: true })` with a vulnerable `qs` version would allow `__proto__` keys to reach Mongoose queries as well. Any endpoint that passes `req.body` properties into a query object (e.g., the challenge endpoints) could have those properties shadow schema field names via prototype chain.
- → **DEP-01**: The exploitability of the `qs` prototype pollution finding depends entirely on the `qs` version pinned in `server/package-lock.json`. The DEP-01 auditor should verify the exact `qs` version and check if it is >= 6.10.3.

## Trust Boundaries

Socket.IO payloads travel over WebSocket; Socket.IO's built-in parser handles deserialization before user code. This is a trust boundary the framework enforces. However, REST HTTP payloads pass through Express middleware (`express.json`, `express.urlencoded`) whose behavior depends on the version of `qs` and `body-parser` bundled. Telegram's HMAC-signed `initData` is the only user-supplied JSON that is parsed after transport-level deserialization; the parse result is assigned to a socket property, not merged into application state. Mongoose schema strict mode forms a downstream trust boundary for any database writes — unknown fields are dropped before reaching MongoDB. The weakest trust boundary is the global `express.urlencoded` middleware: it processes all POST bodies regardless of whether the route uses them.
<!-- CONDENSED_SUMMARY_END -->

---

# INJ-05: Prototype Pollution & Deserialization — Full Analysis

## Executive Summary

The SolShot server codebase has no `Object.assign(target, userInput)` deep-merge, no lodash/deepmerge usage, and no custom `JSON.parse` in socket handlers. The primary prototype-pollution risk is the global `express.urlencoded({ extended: true })` middleware at a 1 MB limit, which uses the `qs` library. If `qs` < 6.10.3 is bundled, a `__proto__` key in a URL-encoded POST body would set properties on `Object.prototype` — a critical escalation vector because the auth model relies on socket own-properties like `client.isAuthenticated`. A secondary concern is the direct assignment of a Telegram-parsed JSON user object to `socket.telegramUser` without property filtering, though this is gated behind HMAC validation.

No YAML/TOML/XML parsers are used in runtime code. Mongoose strict mode is the default and eliminates prototype-pollution via MongoDB writes. ConfigFlow parses numeric values from Telegram button callback data using regex + parseInt, with no pollution path.

## Scope

In scope: Express HTTP body parsers, Socket.IO payload deserialization, Telegram initData parsing, Mongoose schema handling, config flow parsing.
Out of scope: Anchor/Rust on-chain programs.

## Key Mechanisms

### 1. Express Body Parsers (`server/index.js:190-191`)

```js
app.use(express.json({limit: "1mb", extended: true}))
app.use(express.urlencoded({limit: "1mb", extended: true}))
```

Two global middlewares are registered:
- `express.json`: parses `application/json` bodies. Uses `body-parser`'s JSON mode, which calls `JSON.parse`. JSON.parse in modern V8 does NOT allow `__proto__` to pollute `Object.prototype` (it becomes an own enumerable key on the result object, not a prototype assignment). Safe.
- `express.urlencoded({ extended: true })`: parses `application/x-www-form-urlencoded` bodies using the `qs` library. `qs` < 6.10.3 allows `__proto__[key]=value` to set `Object.prototype[key]`. The `extended: true` option is what enables `qs` (vs the simpler `querystring` module). If the pinned `qs` version is >= 6.10.3, this is mitigated — but this needs verification in `server/package-lock.json`.

The `extended: true` option on `express.json()` (line 190) is silently ignored — it only applies to `urlencoded`. This is a code quality issue, not a security issue.

### 2. Socket.IO Message Buffer Cap (`server/index.js:73`)

```js
maxHttpBufferSize: 64 * 1024,
```

Socket.IO caps inbound messages at 64 KB. There is no custom JSON parser or msgpack decoder configured. Socket.IO 4.x uses its own parser (`socket.io-parser`) to decode event frames — this is not directly exposed to `JSON.parse` prototype pollution because Socket.IO's parser only produces JavaScript primitives and plain objects from the decoded frames. No user-controlled string is passed to a manual `JSON.parse` in socket handlers.

### 3. Telegram initData Parsing (`server/middleware/telegram.js:63,98`)

```js
user = JSON.parse(userStr);
// ...
socket.telegramUser = user;
```

The `user` field inside Telegram's `initData` is a JSON-encoded string. After HMAC-SHA256 validation, this string is parsed with `JSON.parse` and assigned to `socket.telegramUser`.

**Why this is gated, but imperfectly:**
- HMAC validation must pass first (correct usage of `crypto.timingSafeEqual`).
- If `TELEGRAM_BOT_TOKEN` is absent, the function returns `{ valid: false }` immediately (before parsing).
- The assignment `socket.telegramUser = user` sets the parsed object as an own property on the socket object. It does NOT spread/merge into `Object.prototype`.

**The residual concern:** If the parsed `user` object contained `{ "__proto__": { "isAuthenticated": true } }`, assigning it as a property would NOT pollute the prototype (assignment of a complete object reference never does). However, if the code later did `Object.assign(socket, user)` or `Object.assign(client, user)`, that would be dangerous. Currently it does not.

**What the code does with telegramUser:**
- `tgIdFor(socket, payload)` reads `socket.telegramUser.id` — reads a single numeric field.
- `main.js:1298` checks `client.telegramUser?.id` — uses optional chaining.
- `main.js:1299-1304` backfills `client.telegramUser` from a DB User document using an explicit object literal: `{ id: tgUserId, username: ..., first_name: null }`. This is safe.

### 4. ConfigFlow Payload Parsing (`server/services/groupchat/configFlow.js:326-380`)

`applyValue(partial, callbackData)` parses Telegram button `callback_data` strings via regex. All numeric extraction uses `\d+` or `-?\d+` with radix-10 `parseInt`. The key names written to `partial` are all hardcoded string literals (`partial.type`, `partial.wagerLamports`, etc.) — never computed from user input. No user-controlled key names reach the `partial` object. The `partial` object itself is stored in `configStates` Map keyed by `${chatId}-${userId}`. States expire after 10 minutes via the GC interval.

**Potential concern:** The `_setState` test export at line 439:
```js
export function _setState(chatId, userId, partial) {
    const key = stateKey(chatId, userId);
    configStates.set(key, { _stepIndex: 0, ...partial });
```
Spreading `partial` into the state object. In production this function is only called from tests. But since it is exported from the module, any future import path that calls it with user-derived data would spread unknown keys.

### 5. Socket.IO Main — Payload Destructuring (`server/socket-io/main.js`)

The pattern used across all ~50 socket handlers is:
1. Null guard: `if (!data || typeof data !== 'object') return`
2. Explicit destructure: `const { field1, field2 } = data`

This is the correct approach — destructuring extracts only named fields from the payload. Unknown keys in the payload (including `__proto__`) are simply not accessed.

No patterns like `Object.assign(serverState, data)` or `{ ...data }` into a mutable shared object were found in main.js. The closest spread usage is in `wagerStates` construction:
```js
wagerStates[roomId] = {
    amount: wagerAmount,
    wallets: { [client.id]: walletAddress }
}
```
This constructs from literal values, not from user input.

### 6. Mongoose Schema Strict Mode (all models)

None of the Mongoose models explicitly set `strict: false`. Mongoose defaults to `strict: true`, which means:
- Fields not in the schema definition are stripped from documents before writes.
- A `__proto__` key in a `$set` operation would be treated as an unknown field and dropped.

The models use `{ _id: false }` on several sub-schemas, which disables automatic `_id` generation for subdocuments but does not affect strict mode.

**Note:** Mongoose strict mode protects write paths. It does NOT protect query paths. If user input reaches a `find()` query object (e.g., `User.find({ [userKey]: userValue })`), strict mode doesn't help. However, INJ-05 scope covers deserialization/pollution; NoSQL injection via query objects is covered by INJ-01.

### 7. JSON.parse in Service Code

Four `JSON.parse` calls exist in server code:
- `telegram.js:63` — parses Telegram-supplied user JSON after HMAC validation (discussed above)
- `keys.js:45,48` — parses keypair JSON from filesystem files (trusted, not user input)
- `escrow.js:81` — parses IDL JSON from filesystem file (trusted)
- `escrow-v2.js:74` — same (trusted)

No `JSON.parse` of user-supplied strings occurs in socket handlers or HTTP route handlers.

### 8. CSP Report Endpoint (`server/index.js:264-272`)

```js
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body['csp-report'] || req.body;
    console.error('[CSP Violation]', JSON.stringify({
        directive: report['violated-directive'],
        blocked: report['blocked-uri'],
        document: report['document-uri'],
    }));
```

A second `express.json` instance without an explicit `limit` (defaults to 100 KB). The parsed body is accessed via bracket notation. If a client sends `{ "__proto__": { "isAuthenticated": true } }` as the body, `JSON.parse` in Node.js >= 12 does NOT pollute `Object.prototype` — the `__proto__` key becomes an enumerable own property on the parsed result. This is a well-known non-issue with JSON.parse. However, the `report['violated-directive']` bracket-notation access would safely return `undefined` for any unknown key.

**The real concern here** is if `req.body['csp-report']` returns an attacker-controlled object that is then passed to `JSON.stringify` — the result is just a log message. No downstream use of the parsed data mutates application state.

## Trust Model

- **Socket.IO payloads**: deserialized by Socket.IO's internal parser; never reach manual `JSON.parse` in user code.
- **HTTP JSON bodies**: deserialized by `express.json()` via `body-parser`; `JSON.parse` in Node.js does not prototype-pollute.
- **HTTP URL-encoded bodies**: deserialized by `express.urlencoded({ extended: true })` via `qs`; vulnerable if `qs` < 6.10.3.
- **Telegram initData**: HMAC-validated before JSON parsing; result assigned to socket own property (not spread into app state).
- **Mongoose writes**: strict mode strips unknown fields including `__proto__` keys from all document writes.

## State Analysis

- `configStates` Map in configFlow: keyed by `${chatId}-${userId}`, values are plain objects mutated by hardcoded key assignments from regex-extracted integers. No user-controlled key names.
- `rooms` Map in main.js: keyed by roomId (CSPRNG hex), values are room objects with hardcoded fields. No user-controlled key names in room object construction.
- `matchStates` plain object: keyed by roomId, values created by `createMatchState()`.
- `authenticatedWallets` plain object: keyed by socketId, values are wallet address strings.

None of these in-memory stores are populated via spread of user-controlled objects.

## Dependencies

- `qs`: the critical dependency. Bundled by `body-parser` (a dependency of `express`). Version in `server/package-lock.json` needs inspection. CVE-2022-24999 affected qs < 6.2.4; Node.js-specific prototype pollution was fixed in qs 6.10.3. The current Express 4.x bundles `qs 6.11.x` which is safe, but this should be explicitly verified.
- `socket.io-parser`: Socket.IO's internal message parser. No known prototype pollution CVEs in recent versions.
- `mongoose`: strict mode default eliminates prototype-pollution via DB writes.
- `telegraf`: Telegram bot framework. Uses its own middleware chain for update handling. No custom JSON deserialization beyond the Telegram Bot API's JSON response bodies (trusted source).

## Focus-Specific Analysis

### INJ-05.1: Object.assign / Deep Merge Survey

**Result: No instances found.** The entire `server/` directory was grepped for `Object.assign`, `lodash`, `_.merge`, `deepMerge`, `defaultsDeep`. Zero matches. This is the strongest finding — the most common prototype pollution sink simply does not exist in this codebase.

### INJ-05.2: qs `extended: true` (MEDIUM)

`server/index.js:191` registers `express.urlencoded({ extended: true })` globally. This is the primary prototype-pollution risk vector. The `/api/challenge` POST endpoint and both wallet-link endpoints accept URL-encoded bodies (though they send JSON in practice). Any client that sends `Content-Type: application/x-www-form-urlencoded` with body `__proto__[isAuthenticated]=true` to any POST endpoint would hit this middleware.

**Exploitability depends on `qs` version.** Must verify in `server/package-lock.json`.

### INJ-05.3: JSON.parse of Telegram User (LOW-MEDIUM)

`server/middleware/telegram.js:63` — `user = JSON.parse(userStr)` after HMAC validation. The risk is narrow:
1. HMAC must be bypassed or TELEGRAM_BOT_TOKEN not set.
2. Even if parsed, the result is assigned to `socket.telegramUser` (own property).
3. `JSON.parse` does not mutate `Object.prototype` — `{"__proto__":...}` yields an object with an own `__proto__` property.

The meaningful risk is impersonation: a Telegram server or MITM could supply a manipulated `user.id` to impersonate another user. That is an AUTH concern more than INJ-05.

### INJ-05.4: configFlow parseInt without bounds (MEDIUM-LOW)

`configFlow.js:333` — `partial.wagerLamports = parseInt(m[1], 10)` where `m[1]` is `\d+`. This is safe for prototype pollution (numeric string, hardcoded key). However, there is no upper-bound validation on the parsed integer. A crafted Telegram button (if an attacker can inject a button into the flow) could supply `gc_cfg_wager_99999999999999999` → `wagerLamports = 99999999999999999` (safe as float in JS but may overflow when used in lamport arithmetic). This is a business logic concern, not prototype pollution.

### INJ-05.5: Mongoose Strict Mode Verification

All five Mongoose schemas (`User`, `Match`, `GroupMatch`, `Challenge`, `ServerState`) use the default constructor `new mongoose.Schema({ ... })` without explicit options overriding strict. Mongoose defaults to `strict: true`. Confirmed no `strict: false` in any model file.

## Cross-Focus Intersections

- **INJ-01 (NoSQL Injection)**: The same `urlencoded` middleware that carries the qs prototype-pollution risk would also carry NoSQL operator injection in the value field of URL-encoded form data. Separate concern but same entry point.
- **AUTH-01/AUTH-03**: The entire `requireAuth` model (`guards.js:40-46`) assumes `client.isAuthenticated` is an own property. If `Object.prototype.isAuthenticated` is ever set to a truthy value via qs pollution, all auth guards fail silently.
- **DEP-01**: The qs version determines whether INJ-05.2 is a live vulnerability or a mitigated theoretical risk.
- **ERR-01**: The `safeHandler` wrapper catches exceptions in async socket handlers but does not catch the synchronous prototype pollution — pollution from HTTP bodies would propagate silently.

## Cross-Reference Handoffs

- → **DEP-01**: Verify `qs` version in `server/package-lock.json`. If < 6.10.3, the prototype pollution via URL-encoded body is a live HIGH finding.
- → **AUTH-01**: Document that the `requireAuth` model's security assumption is that `client.isAuthenticated` is an own socket property. If qs pollution is live, this assumption is violated.
- → **INJ-01**: Check whether any of the three REST endpoints that accept bodies pass `req.body` field values into MongoDB query operators without key normalization.

## Risk Observations

1. **qs prototype pollution via URL-encoded body (MEDIUM-HIGH, exploitability TBD)**: `server/index.js:191`. If `qs` version is < 6.10.3, a single unauthenticated POST to any server endpoint with body `__proto__[isAuthenticated]=true&__proto__[isHost]=true` would set these as inherited properties on every plain object, bypassing auth guards. Chain: HTTP POST → `express.urlencoded` → `qs.parse` → `Object.prototype` contamination → socket handlers reading `client.isAuthenticated` return truthy from prototype. Severity escalates to CRITICAL if `qs` is vulnerable, because it bypasses the entire socket auth model without needing a valid WebSocket connection.

2. **Telegram user JSON assignment — impersonation surface (LOW-MEDIUM)**: `server/middleware/telegram.js:63,98`. The parsed Telegram user object is assigned directly to `socket.telegramUser`. While this doesn't pollute Object.prototype, the parsed object's `id` field becomes the identity for group-match operations. If an attacker can forge or replay a Telegram initData HMAC (separate concern), they can impersonate any Telegram user ID in group matches.

3. **CSP report endpoint no explicit size limit (LOW)**: `server/index.js:264`. Defaults to 100 KB vs the 1 MB on other endpoints. This is inconsistency, not a direct vulnerability. A resource exhaustion concern (100 KB JSON parse per CSP violation report from any IP) is the minor risk.

4. **configFlow wagerLamports no upper bound (LOW)**: `server/services/groupchat/configFlow.js:333`. Integer parsed from regex-captured digit string has no max validation. Downstream lifecycle.js and escrow-v2.js accept the lamport value. Maximum safe integer in JS is 2^53-1 ≈ 9 × 10^15, which is ~9 million SOL. This won't overflow JS integers but should be capped to a reasonable max (e.g., 10 SOL = 10_000_000_000 lamports).

5. **`_setState` test export in production bundle (LOW)**: `server/services/groupchat/configFlow.js:439`. Exported function that spreads an arbitrary object into the state map. Unused in production but reachable from any module that imports configFlow. Should be guarded by `process.env.NODE_ENV !== 'production'` or removed from the exported API.

6. **`express.json({ extended: true })` — misleading option (INFO)**: `server/index.js:190`. The `extended` option is silently ignored by `express.json()`. Misleading to reviewers who may assume JSON body parsing uses `qs`. No security impact.

7. **No YAML/TOML parsers in runtime (FINDING: NOT_VULNERABLE)**: Grep confirmed no `js-yaml`, `yaml`, `toml`, `@iarna/toml` in server runtime imports. No YAML deserialization attack surface exists.

8. **No Object.assign/deep-merge with user input (FINDING: NOT_VULNERABLE)**: Grep confirmed no `Object.assign(target, userInput)` or lodash merge patterns. The most common prototype pollution sinks are absent.

## Novel Attack Surface Observations

**qs Pollution → Auth Bypass Chain**: The most novel finding is that a single unauthenticated HTTP POST (no socket, no signature) could contaminate the Node.js prototype and bypass every socket-level auth guard in `main.js`. The chain is: no-auth HTTP POST → qs prototype pollution → `Object.prototype.isAuthenticated = "true"` → all `if (!client.isAuthenticated)` checks pass → wagered match creation, fire events, escrow operations become accessible without valid wallet signatures. This is a cross-protocol attack (HTTP layer attacks WebSocket layer). Standard security reviews that only look at WebSocket auth would miss this entirely.

## Questions for Other Focus Areas

- **DEP-01**: What exact `qs` version is in `server/package-lock.json`? Is it >= 6.10.3?
- **AUTH-01/AUTH-03**: Are there any places in socket handlers where auth state is re-read from object properties rather than the `client.isAuthenticated` socket own-property? Would prototype-level truthy value bypass all of them?
- **API-03**: Does Socket.IO 4.x's internal parser have any known prototype-pollution vectors independent of the HTTP body parsers?

## Raw Notes

- grep for `Object.assign` in server/: 0 results
- grep for `lodash`, `_.merge`, `deepMerge`: 0 results
- grep for `JSON.parse` in server/: 4 results — telegram.js:63 (user input, HMAC-gated), keys.js:45,48 (filesystem), escrow.js:81 (filesystem), escrow-v2.js:74 (filesystem)
- grep for `__proto__`, `constructor.prototype`, `hasOwnProperty` in server/: 0 results
- grep for `yaml`, `YAML`, `toml`, `xml2js`: 0 results
- `express.urlencoded({ extended: true })` is the only qs usage — all others use JSON
- Mongoose models: strict mode ON by default in all 5 models
- configFlow.js: only numeric values from regex captures, hardcoded key names
- Socket handlers: pattern is `if (!data || typeof data !== 'object') return` then `const { field } = data` — destructure-only, no spread into mutable shared state
- `socket.telegramUser` assignment is direct (not Object.assign, not spread)
- The `_setState` export is a test helper that should not be in a production bundle
