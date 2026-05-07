# INJ-05: Prototype Pollution & Deserialization Audit

**task_id:** INJ-05
**auditor:** INJ-05
**focus:** Prototype Pollution & Deserialization
**date:** 2026-02-23
**scope:** All off-chain code — `server/`, `client/src/` (Anchor programs excluded)

---

<!-- CONDENSED_SUMMARY_START -->
## Condensed Summary

**Overall Verdict:** LOW actual prototype pollution risk; MEDIUM deserialization concern on one path; one CONFIRMED dead-but-dangerous relay handler.

### Findings at a Glance

| ID | Location | Description | Verdict | Severity |
|----|----------|-------------|---------|----------|
| PP-01 | `GameBridge.js:46` | `Object.assign(this.state, partial)` called with server-derived data — not directly client-controlled | NOT_VULNERABLE | N/A |
| PP-02 | `main.js:2478-2483` | `giveTurn` legacy relay emits unsanitized `terrainData` from one client to another | POTENTIAL | LOW |
| PP-03 | `guards.js` | `validatePayload` is imported in `main.js` but **never called** — schema-based validation is dead code | CONFIRMED | MEDIUM |
| PP-04 | `telegram.js:60` | `JSON.parse(userStr)` of Telegram-provided user blob assigned to `socket.telegramUser` | POTENTIAL | LOW |
| PP-05 | `escrow.js:77` | `JSON.parse(fs.readFileSync(IDL_PATH))` — trusted filesystem path, not user-controlled | NOT_VULNERABLE | N/A |
| PP-06 | `keys.js:45,48` | `JSON.parse` of env var / file for keypair bytes — trusted configuration path | NOT_VULNERABLE | N/A |
| PP-07 | `WalletContext.js:211-212` | `Transaction.from(Buffer.from(base64, 'base64'))` — server-built TX deserialized client-side | NOT_VULNERABLE (mitigated) | N/A |
| PP-08 | `main.js` (global) | No deep-merge or recursive `Object.assign` over untrusted data anywhere in server code | NOT_VULNERABLE | N/A |
| PP-09 | `main.js` (global) | No `eval()`, `Function()`, or dynamic code execution paths found in any handler | NOT_VULNERABLE | N/A |
| PP-10 | Wallet address as dict key | `pendingReconnects[walletAddress]` — wallet comes from verified Ed25519 auth, `new PublicKey()` rejects `__proto__` | NOT_VULNERABLE | N/A |

**Key finding:** The most significant issue is PP-03 — `validatePayload` was written to defend against prototype-key injection via schema enforcement, but is imported and never called. Every handler uses ad-hoc inline guards instead. While none of the existing inline guards allow actual prototype pollution given the shallow merge patterns and Node.js runtime protections, `validatePayload` represents an undeployed defence layer that future handlers might expect to be in place. This also leaves no defence against future `__proto__` or `constructor` key injection if any handler is changed to do a recursive merge.
<!-- CONDENSED_SUMMARY_END -->

---

## Full Analysis

### Methodology

1. Read `.bulwark/INDEX.md` and `HOT_SPOTS.md` — INJ-05 section identified 191 pattern hits; highest-priority files are `physics.js`, `main.js`, `Standard.js`.
2. Read `guards.js` `validatePayload` implementation in full.
3. Read `main.js` — traced every place client data is spread/merged/assigned into server objects.
4. Read `.audit/ARCHITECTURE.md` for cross-skill context (`terrainPath` event named as prototype pollution risk).
5. Read `telegram.js`, `escrow.js`, `keys.js`, `WalletContext.js`, `GameBridge.js`, `Terrain.js`, `Tank.js`, `scenes/main/index.js`.
6. Verified Node.js v24 + Socket.IO 4.5.1 behavior: `JSON.parse` does NOT pollute `Object.prototype` via `__proto__` in modern V8; `Object.assign` is similarly safe for shallow copies; deep recursive merges can still pollute via `constructor.prototype`.
7. Confirmed no deep-merge utilities are present in application code (lodash entries in `package-lock.json` are transitive deps of `jsonwebtoken`, type-check-only).

---

### Finding PP-01: `GameBridge.updateState` — `Object.assign` with server-controlled partial

**File:** `client/src/bridge/GameBridge.js:46`

```js
updateState(partial) {
    Object.assign(this.state, partial);
    this.dirty = true;
}
```

**Context:** `this.state` is a fixed-schema object (x, y, hp, angle, etc.). All callers pass literals with named fields extracted from server socket events or from Phaser game state — never a raw socket payload object directly. Example callers:

```js
// client/src/scenes/main/index.js:599
this._bridge.updateState({ gold: myGold });

// client/src/scenes/main/index.js:1070
this._bridge.updateState({
    tank1: { x: this.tank1.x, y: this.tank1.y, hp: ..., ... },
    ...
});
```

`partial` is never the raw `data` object from a socket event; it is always a literal built in the scene from extracted and typed values.

**Verdict: NOT_VULNERABLE.** `Object.assign` is shallow and does not walk prototype chains on assignment in V8/Node.js. No raw socket data is spread in. The `this.state` object has no sensitive prototype properties. Even if an attacker could craft a partial with `__proto__`, the shallow `Object.assign` semantics in modern Node (confirmed via runtime test) would not pollute `Object.prototype`.

---

### Finding PP-02: `giveTurn` Legacy Relay — Unsanitized `terrainData` Forwarded

**File:** `server/socket-io/main.js:2478-2483`

```js
// LEGACY: turn relay (still works)
client.on('giveTurn', (data) => {
    if (!data || typeof data !== 'object') return
    const { terrainData, pos1, pos2, rotation1, rotation2 } = data
    client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
})
```

**Context:** This is a direct server-side relay. `terrainData` is extracted from client-supplied `data` and forwarded without type checking or sanitization. The architecture document flagged `terrainPath` events as a prototype pollution risk. This handler is the surviving legacy turn relay.

**Attack vector:** A malicious client sends:
```json
{
  "terrainData": {"__proto__": {"polluted": true}},
  "pos1": 0, "pos2": 0, "rotation1": 0, "rotation2": 0
}
```
The server destructures `terrainData` and emits it to the opponent. The opponent's client receives `{terrainData: {"__proto__": {...}}, ...}` and must deserialize/process it.

**Client-side impact assessment:** The current client (`client/src/scenes/main/index.js:143`) explicitly comments that `recieveTurn` handler is **removed**:
```
// Legacy turn relay handlers (recieveTurn, opponentRequestTurn) REMOVED.
// Turns are now managed server-side via turnResult.nextTurn.
```
No current client code processes `recieveTurn`. However:
1. The server still emits this event.
2. Legacy or third-party clients connecting to this server that do listen to `recieveTurn` would receive the unsanitized `terrainData`.
3. If any client code (past or future) does `socket.on('recieveTurn', (data) => { someDeepMerge(state, data) })`, this becomes a client-side prototype pollution vector.

**Server-side impact:** On the server, `terrainData` is only passed to `emit()` — it is not merged into any server state object. No server-side prototype pollution occurs from this handler.

**Additional concern:** `pos1`, `pos2`, `rotation1`, `rotation2` are relayed with no numeric validation. A client could relay non-numeric values or objects to confuse the opponent's physics rendering.

**Verdict: POTENTIAL** (LOW — server-side prototype pollution not achievable; client-side risk exists for any current/future listener). The handler should be removed entirely since the client no longer listens to it, or hardened with type enforcement on each relayed field.

---

### Finding PP-03: `validatePayload` Imported But Never Called (CONFIRMED)

**File:** `server/middleware/guards.js:55-70` (definition), `server/socket-io/main.js:15` (import)

```js
// guards.js — the function exists and is correct
export function validatePayload(data, schema) {
    if (data === null || data === undefined || typeof data !== 'object') {
        return { valid: false, reason: 'Missing or invalid payload' };
    }
    for (const [field, expectedType] of Object.entries(schema)) {
        if (data[field] === undefined || data[field] === null) {
            return { valid: false, reason: `Missing field: ${field}` };
        }
        if (typeof data[field] !== expectedType) {
            return { valid: false, reason: `Invalid type for ${field}: expected ${expectedType}` };
        }
    }
    return { valid: true };
}
```

```js
// main.js:15 — imported but search confirms zero call sites
import { requireAuth, validatePayload, validateFireParams, sanitizeName, withLock, safeHandler } from '../middleware/guards.js';
```

A grep of `validatePayload(` in `main.js` returns **zero results**. Every handler instead uses ad-hoc inline guards:
```js
if (!data || typeof data !== 'object') return
const { field1, field2 } = data
```

**Impact on prototype pollution posture:** `validatePayload` was designed to enforce field types via a schema. Its schema check (`typeof data[field] !== expectedType`) would not by itself block `__proto__` or `constructor` keys since it only checks declared schema fields. However:

1. It establishes a whitelist discipline: only declared schema fields are expected, making it easier to audit and reason about.
2. More critically, it prevents unexpected object properties from passing into downstream logic, which is a soft defence against injection of malformed objects.
3. Future maintainers adding handlers might assume `validatePayload` is the standard gate and expect it to be in place.

**The real risk:** No handler calls `validatePayload`, meaning the schema-enforced type layer does not exist at all. If any future handler adds recursive object merging (e.g., `Object.assign(serverState, data.someField)` where `someField` is user-controlled and deeply nested), there is no prior whitelist gate to stop polluted keys from flowing through.

**Verdict: CONFIRMED** (MEDIUM severity — the intended defence layer is completely absent, even though no current exploitation path exists for prototype pollution given the shallow patterns in use).

---

### Finding PP-04: Telegram `JSON.parse(userStr)` Assigned to Socket Property

**File:** `server/middleware/telegram.js:57-62`

```js
const userStr = params.get('user');
if (userStr) {
    try {
        user = JSON.parse(userStr);
    } catch (_) { /* ignore */ }
}
// ...
if (valid && user) {
    socket.telegramUser = user;
    socket.isTelegram = true;
}
```

**Context:** `userStr` is a URL-encoded parameter from the Telegram Mini App `initData` string. The HMAC-SHA256 verification occurs **before** this parse:
```js
const valid = computedHash === hash;
// ...
if (valid && user) { socket.telegramUser = user; }
```

Only if the HMAC validates does `telegramUser` get assigned. The HMAC depends on `TELEGRAM_BOT_TOKEN` and covers the entire `dataCheckString` including the `user` parameter.

**Prototype pollution assessment:** `JSON.parse` in modern V8 will parse `{"__proto__": {"polluted": true}}` into an object with `__proto__` as an own property (verified via runtime test), but:
- `socket.telegramUser = user` is a simple property assignment; it does not merge into any prototype chain.
- The `socket` object is a Socket.IO socket instance — assigning a custom property to it does not affect `Object.prototype`.
- Even if `user.__proto__` contained arbitrary data, reading `socket.telegramUser.someField` later would only look up properties on that specific object.

**Remaining concern:** If downstream code later does `Object.assign(someServerState, socket.telegramUser)` or a deep merge, the parsed object's own `__proto__` property could be used in a pollution gadget. No such use currently exists. The object is stored on the socket and never merged into shared server state.

**Verdict: POTENTIAL** (LOW — HMAC verification gates the parse; no current downstream merge exists; but `JSON.parse` result should be sanitized with `Object.create(null)` or key filtering before assigning to socket property to future-proof against gadget chaining).

---

### Finding PP-05: `JSON.parse` of IDL File in `escrow.js`

**File:** `server/services/escrow.js:77`

```js
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
program = new Program(idl, provider);
```

`IDL_PATH` is resolved from `__dirname` (a server-controlled constant), not from any user input. This is a trusted-path file load at service initialization time. An attacker cannot influence the file content through any socket event path.

**Verdict: NOT_VULNERABLE.**

---

### Finding PP-06: `JSON.parse` of Keypair in `keys.js`

**File:** `server/services/keys.js:45,48`

```js
secretKeyArray = JSON.parse(keypairJson);              // env var
secretKeyArray = JSON.parse(fs.readFileSync(resolved, 'utf-8')); // file path
```

Both sources are server-controlled environment variables or filesystem paths. No client socket data influences these paths. The parsed value is immediately converted to `Uint8Array.from(secretKeyArray)` and used to construct a `Keypair`.

**Verdict: NOT_VULNERABLE.**

---

### Finding PP-07: Base64 TX Deserialization in `WalletContext.js`

**File:** `client/src/wallet/WalletContext.js:202-250`

```js
const signAndSendEscrowDeposit = useCallback(async (serializedTxBase64, roomId) => {
    // ...
    const txBuffer = Buffer.from(serializedTxBase64, 'base64');
    const tx = Transaction.from(txBuffer);

    // CS-01: Validate transaction instructions before signing
    const validation = validateEscrowTransaction(tx);
    if (!validation.valid) {
        console.warn('[SolShot] Escrow TX rejected:', validation.reason);
        return null;
    }
```

**Context:** `serializedTxBase64` comes from the server via the `escrowDeposit` socket event. The client deserializes it using `@solana/web3.js Transaction.from()` and then validates it with `validateEscrowTransaction()` before signing.

**`validateEscrowTransaction` does:**
1. Iterates all transaction instructions.
2. Requires at least one instruction targeting `ESCROW_PROGRAM_ID`.
3. Checks that any escrow instruction's discriminator matches the known `deposit_wager` discriminator (`[234, 73, 235, 136, 168, 103, 239, 207]`).
4. Allows `ComputeBudget` program instructions.
5. Rejects any instruction from an unknown program ID.

If `REACT_APP_ESCROW_PROGRAM_ID` is not set (dev mode), validation is bypassed entirely (`return { valid: true }`).

**Deserialization risk:** `Transaction.from()` can throw on malformed input, but this is caught by the outer try-catch. The deserialized TX is a structured Solana transaction object — not a raw JavaScript object merge. There is no prototype pollution path through Solana transaction deserialization.

**Remaining concern:** In dev mode (no `REACT_APP_ESCROW_PROGRAM_ID`), a compromised server could send a TX containing arbitrary instructions (e.g., SOL transfer to attacker) and the client would sign it without validation. This is a key-security concern (covered by SEC-01) rather than prototype pollution.

**Verdict: NOT_VULNERABLE** for prototype pollution. The dev-mode bypass is a separate key-security issue.

---

### Finding PP-08: No Deep-Merge Patterns in Server Code

A comprehensive grep across all server JavaScript files (`server/**/*.js` excluding `node_modules`) found:

- **`Object.assign`**: Zero instances in server application code.
- **Deep merge utilities (deepmerge, lodash.merge, _.extend)**: Only `lodash.*` type-check helpers in `package-lock.json` as transitive deps of `jsonwebtoken`. Not imported or used in any server source file.
- **Custom recursive merge functions**: None found.
- **Spread operator over user-controlled objects**: Zero instances where a raw socket `data` object is spread directly into a server state object. All spread uses are for snapshot copying of server-controlled state (e.g., `{ ...wsState.wallets }`, `{ ...weapon, weaponId, wind }`).

The only `Object.assign` in the entire codebase is `GameBridge.js:46` (client-side, covered by PP-01).

**Verdict: NOT_VULNERABLE.**

---

### Finding PP-09: No `eval()` or Dynamic Code Execution

A comprehensive grep found zero instances of `eval(`, `Function(`, `new Function(`, `setTimeout(string`, `setInterval(string`, or `vm.runInNewContext` in any server or client source file.

**Verdict: NOT_VULNERABLE.**

---

### Finding PP-10: Wallet Address as Dictionary Key — `pendingReconnects` and `disconnectTimers`

**File:** `server/socket-io/main.js:718,737`

```js
pendingReconnects[walletAddress] = { roomId, isHost, oldSocketId, name, color }
disconnectTimers[walletAddress] = setTimeout(async () => { ... }, RECONNECT_WINDOW_MS)
```

`walletAddress` comes exclusively from `authenticatedWallets[client.id]`, which is set only after `handleAuthenticate` succeeds:

```js
// auth.js:127,135,141
export function handleAuthenticate(client, { walletAddress, message, signature, timestamp }) {
    const msgCheck = verifyAuthMessage(message, walletAddress, timestamp);
    // ...
    const sigCheck = verifyWalletSignature(walletAddress, message, signature);
    // verifyWalletSignature calls: new PublicKey(walletAddress) and PublicKey.isOnCurve(...)
```

`new PublicKey('__proto__')` in `@solana/web3.js` throws a `TypeError` (not a valid base58 public key), so `__proto__` can never be stored as a wallet address key. The same applies to `constructor` — not a valid base58 Ed25519 point.

**Verdict: NOT_VULNERABLE.** The cryptographic constraint on valid wallet addresses is an effective blocker.

---

### Summary: `validatePayload` Defence Gap Analysis

`validatePayload` has the following schema enforcement:

```js
// Schema: { fieldName: 'number' | 'string' | 'object' | 'boolean' }
for (const [field, expectedType] of Object.entries(schema)) {
    if (data[field] === undefined || data[field] === null) {
        return { valid: false, reason: `Missing field: ${field}` };
    }
    if (typeof data[field] !== expectedType) { ... }
}
```

**What it does NOT do:**
1. It does not check for `__proto__` or `constructor` keys in `data` beyond schema fields.
2. It does not sanitize the `data` object itself — extra keys beyond the schema are silently allowed through.
3. It does not deep-validate nested object fields.

**What it does do (if called):**
- Type-enforces all declared schema fields.
- Rejects payloads with missing required fields.
- Prevents string injection into numeric fields.

**Recommendation:** Add explicit key filtering to `validatePayload` to strip `__proto__` and `constructor` keys, and **actually call it** in all socket handlers as a first gate. Example hardening:

```js
// Proposed addition to validatePayload
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
for (const key of Object.keys(data)) {
    if (DANGEROUS_KEYS.has(key)) {
        return { valid: false, reason: `Forbidden key: ${key}` };
    }
}
```

---

### Cross-Skill Notes

- **AUTH-01** (authentication): Wallet address validation via `new PublicKey()` inadvertently protects against `__proto__` key injection in `pendingReconnects`/`disconnectTimers`.
- **API-03** (WebSocket): The `giveTurn` legacy relay (PP-02) is the surviving unsanitized relay that the architecture doc flagged. The original `terrainPath` handler mentioned in the architecture doc has been deleted (confirmed: `// SA-03: terrainPath + getTerrainPath handlers deleted`).
- **INJ-01** (NoSQL): No overlap — Mongoose schema typing blocks injection at the DB layer; socket-to-DB path is not exploitable via prototype pollution since the DB operations use explicit model field assignments.
- **CHAIN-01** (TX construction): Client-side TX deserialization has a partial defence (discriminator check) but dev-mode bypass is a separate concern flagged for SEC-01.

---

### Remediation Recommendations

| Priority | Action | Fixes |
|----------|--------|-------|
| MEDIUM | Actually call `validatePayload(data, schema)` at the top of every socket handler in `main.js` instead of ad-hoc inline guards. Add dangerous-key strip (`__proto__`, `constructor`, `prototype`) to `validatePayload`. | PP-03 |
| LOW | Remove the `giveTurn` legacy handler entirely (client no longer listens to `recieveTurn`). If keeping for compatibility, add numeric type enforcement on `pos1`, `pos2`, `rotation1`, `rotation2` and `terrainData` type guard. | PP-02 |
| LOW | In `telegram.js`, after `JSON.parse(userStr)`, strip dangerous keys or create the object via `Object.create(null)` before assigning to `socket.telegramUser`. | PP-04 |
| LOW | In `WalletContext.js`, assert that `REACT_APP_ESCROW_PROGRAM_ID` is always set before allowing TX signing in any non-test environment. | PP-07 (dev bypass) |

---

**Files Reviewed:**
- `server/socket-io/main.js` (2565 lines)
- `server/middleware/guards.js` (168 lines)
- `server/middleware/auth.js` (149 lines)
- `server/middleware/telegram.js` (111 lines)
- `server/services/escrow.js` (first 100 lines + grep)
- `server/services/keys.js` (84 lines)
- `server/services/physics.js` (grep for patterns + lines 1320-1411)
- `client/src/bridge/GameBridge.js` (166 lines)
- `client/src/scenes/main/index.js` (targeted grep)
- `client/src/classes/Tank.js` (first 50 lines)
- `client/src/classes/Terrain.js` (first 80 lines)
- `client/src/wallet/WalletContext.js` (first 130 lines + grep)
- `.bulwark/INDEX.md`, `.bulwark/HOT_SPOTS.md`
- `.audit/ARCHITECTURE.md`

**Runtime verification:**
- Node.js v24.13.0: `JSON.parse` with `__proto__` does NOT pollute `Object.prototype` via shallow `Object.assign` or spread.
- Deep recursive merge DOES pollute `Object.prototype` via `constructor.prototype` — confirms that the absence of deep-merge utilities in application code is the primary protection.
