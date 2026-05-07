# DATA-05: Encryption & Data Protection Audit

**task_id:** DATA-05
**auditor_focus:** Encryption & Data Protection
**generated:** 2026-02-23
**scope:** server/middleware/auth.js, server/middleware/telegram.js, server/services/match.js,
server/services/physics.js, server/services/escrow.js, server/socket-io/main.js,
client/src/wallet/WalletContext.js, client/config-overrides.js, server/services/keys.js,
server/index.js, server/middleware/guards.js, server/services/shot-token.js

---

## CONDENSED SUMMARY

**Overall posture: MIXED — Correct primitives, several implementation weaknesses**

The project uses a well-chosen cryptographic stack: Node.js built-in `crypto` module
(CSPRNG), `tweetnacl` for Ed25519 signature verification, `jsonwebtoken` for token
generation, HMAC-SHA256 for Telegram webhook validation, and the Solana wallet adapter /
`@solana/web3.js` for on-chain signature verification. No custom crypto implementations
were found. However, several concrete weaknesses exist:

| Severity | Count | Summary |
|----------|-------|---------|
| HIGH     | 3     | Non-timing-safe secret comparison, atob() misuse, JWT never consumed server-side |
| MEDIUM   | 5     | 32-bit terrain seed truncation, seeded PRNG (mulberry32) for gameplay, `btoa` in client, Telegram auth optional bypass, burn amount uses unsafe integer math |
| LOW      | 4     | Keypair zeroing is partially effective, no TLS enforcement in server code, WebSocket transport not explicitly TLS-enforced, dev-mode crypto skip paths |
| INFO     | 5     | Correct Ed25519, correct HMAC, CSPRNG for room IDs/wind/spawns, instruction discriminator check, replay protection for burn TXs |

**Critical gap:** The JWT is generated but never validated on any subsequent socket event.
Authentication is therefore a one-time ceremony with no persistent enforcement.

---

## FULL ANALYSIS

### 1. Ed25519 Signature Verification (auth.js)

**File:** `server/middleware/auth.js:38-65`

```javascript
const publicKey = new PublicKey(walletAddress);
if (!PublicKey.isOnCurve(publicKey.toBytes())) {
    return { valid: false, reason: 'Invalid wallet address' };
}
const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
const messageBytes = new TextEncoder().encode(message);
const verified = nacl.sign.detached.verify(messageBytes, signature, publicKey.toBytes());
```

**Assessment: CORRECT with one weakness**

- `PublicKey.isOnCurve()` is called before passing bytes to nacl — this defends against
  small-subgroup and off-curve public key attacks. This is the correct approach.
- `nacl.sign.detached.verify` (tweetnacl 1.0.3) performs constant-time comparison
  internally. The underlying libsodium-derived code uses fixed-time comparison for the
  final hmac step. This is acceptable.
- `tweetnacl` does NOT validate that the signature components (R, S) are in canonical
  reduced form against the group order. Signature malleability is theoretically possible,
  though exploitability is limited when the verified message contains a timestamp
  (replay window is bounded).

**WEAKNESS — DATA-05-W1 (MEDIUM): `atob()` usage in Node.js server context**

```javascript
// server/middleware/auth.js:47
const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
```

`atob()` is a Web API that became available globally in Node.js 16+. It is present in
Node 18 (the minimum declared in package.json) but:

1. It does NOT validate that the input is valid Base64 — invalid characters are silently
   dropped rather than throwing, which can produce a truncated or wrong-length byte array.
   A malformed signature could therefore pass through without error, potentially producing
   a 0-byte or shortened `Uint8Array` that `nacl.sign.detached.verify` then evaluates
   against a valid key.
2. The idiomatic Node.js approach is `Buffer.from(signatureBase64, 'base64')` which
   throws on invalid input and is consistently available.
3. ARCHITECTURE.md already flags this: `atob() used for Base64 decoding instead of
   Node.js Buffer.from() (V-06, EXT-15)`.

**Recommendation:** Replace with:
```javascript
const signature = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
```

**WEAKNESS — DATA-05-W2 (HIGH): JWT generated but never validated**

```javascript
// server/middleware/auth.js:96-102
export function generateToken(walletAddress) {
    return jwt.sign({ wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token) { ... }  // This function exists but is NEVER called
```

The `verifyToken` function is exported but no import of it appears in main.js or any
socket handler. The JWT is returned to the client on authentication and then ignored.
Every socket event after authentication trusts `client.isAuthenticated` (a boolean set
during the `authenticate` event), not a cryptographic token. This means:

- There is no session revocation mechanism.
- A successfully authenticated socket ID persists `client.isAuthenticated = true`
  indefinitely in-process until disconnect.
- The JWT's 24-hour expiry has no enforcement.

The JWT secret handling is correct: in production, `process.exit(1)` is called if
`JWT_SECRET` is not set. In development, a fresh 32-byte random secret is generated
per process start, which prevents stale tokens from surviving restarts (acceptable).

### 2. HMAC Validation — Telegram (telegram.js)

**File:** `server/middleware/telegram.js:27-77`

```javascript
// Two-step HMAC as per Telegram docs
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
const valid = computedHash === hash;
```

**Assessment: CORRECT algorithm, WEAKNESS in comparison**

- The HMAC derivation exactly follows the Telegram Mini App validation specification:
  `HMAC-SHA256(data_check_string, HMAC-SHA256(bot_token, "WebAppData"))`. Algorithm is
  correct.
- Parameters are correctly sorted alphabetically before hashing (`entries.sort`).
- The `hash` field is correctly excluded from the data-check-string.
- `auth_date` staleness check allows 24 hours — this is acceptable per the Telegram spec
  (Telegram recommends checking but sets no strict maximum; 24h is reasonable for a game).

**WEAKNESS — DATA-05-W3 (HIGH): Non-timing-safe string comparison**

```javascript
// server/middleware/telegram.js:53
const valid = computedHash === hash;
```

This is a direct string equality comparison, which is vulnerable to timing attacks.
An attacker who can observe server response latency across many requests could
potentially reconstruct the expected HMAC byte by byte. The correct approach is:

```javascript
const valid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(hash, 'hex')
);
```

Note: `hash` from the URL parameter must be validated as exactly 64 hex characters before
passing to `timingSafeEqual` (which throws if the two buffers have different lengths):

```javascript
if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { valid: false, user: null };
}
```

**WEAKNESS — DATA-05-W4 (MEDIUM): Telegram auth is always optional (bypass by omission)**

```javascript
// server/middleware/telegram.js:103
// Always proceed — Telegram auth is supplementary, not required
return next();
```

If a connection omits the `telegramInitData` field entirely, the middleware proceeds
without any validation. There is no mechanism to require Telegram auth for Telegram-
sourced connections. While this is documented as "supplementary," it means the server
cannot distinguish a legitimate Telegram user from an anonymous WebSocket client. If
Telegram users have elevated trust in any part of the system (e.g., future referral
rewards or anti-cheat identity), this bypass matters.

### 3. CSPRNG Usage (main.js, physics.js, match.js)

**Files:** `server/socket-io/main.js`, `server/services/physics.js`, `server/services/match.js`

**Room ID generation:**
```javascript
// main.js:1163, 1256
const roomId = crypto.randomBytes(4).toString('hex');
```
32 bits of entropy for a room ID. This is 4 billion possible values. With typical game
concurrency (hundreds of rooms), collision probability is negligible. However, room IDs
are also used as the escrow PDA seed (`["match", matchId.as_bytes()]`). If an attacker
can enumerate 32-bit room IDs cheaply, they could pre-derive PDAs for future rooms. For
a wager game, 32 bits is borderline; 8 bytes (64 bits) would be safer.

**OBSERVATION — DATA-05-O1 (LOW): Room ID is only 32 bits of entropy**

With real SOL at stake, room IDs should be at least 64 bits (8 bytes) to make PDA
pre-computation infeasible at scale. Current value: 4 bytes.

**Wind generation:**
```javascript
// physics.js:63
export function generateWind() { return crypto.randomInt(121) - 60; }
```
`crypto.randomInt()` uses the system CSPRNG. Correct use.

**First turn selection:**
```javascript
// match.js:134
return crypto.randomInt(2) === 0 ? hostId : playerId;
```
`crypto.randomInt()`. Correct use.

**Tank spawn positions:**
```javascript
// physics.js:450-451
const hostX = Math.floor(width * 0.2 + (crypto.randomInt(1000) / 1000) * width * 0.15);
const playerX = Math.floor(width * 0.65 + (crypto.randomInt(1000) / 1000) * width * 0.15);
```
CSPRNG. Correct use.

**Weapon array generation:**
```javascript
// main.js:1681-1686
const randomBytes = crypto.randomBytes(safeCount * 4);
for (let index = 0; index < safeCount; index++) {
    const val = randomBytes.readUInt32LE(index * 4);
    randomArray.push(val % safeMax);
}
```
CSPRNG bytes used for weapon array randomness. Note: `val % safeMax` introduces a
slight modular bias if `safeMax` does not divide 2^32 evenly, but this is gameplay-only
(no financial consequence). Acceptable.

### 4. Seeded PRNG — Terrain and Multi-Hit Weapons (physics.js)

**File:** `server/services/physics.js:429-438`, `server/services/physics.js:519-523`

```javascript
// mulberry32 seeded PRNG
function seededRandom(seed) {
    let s = seed;
    return function () {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
```

This is the standard mulberry32 PRNG — a non-cryptographic PRNG used intentionally for
deterministic terrain reproduction (server and client must agree on terrain given the
same seed).

**Terrain seed derivation:**
```javascript
// main.js:2293-2297
const fullSeed = crypto.randomBytes(16).toString('hex');  // 128-bit CSPRNG
const seed32 = parseInt(fullSeed.slice(0, 8), 16) >>> 0;  // truncated to 32 bits
```

**WEAKNESS — DATA-05-W5 (MEDIUM): 128-bit entropy is truncated to 32 bits**

The comment correctly notes that mulberry32 uses a 32-bit seed. However, using only
the first 8 hex characters (32 bits) of the 128-bit random value discards 96 bits of
entropy. The terrain seed space is therefore only 2^32 = ~4 billion distinct terrains.
For a wagered game, an attacker who knows the timing of terrain requests could
potentially pre-compute all possible terrain configurations for a given 32-bit seed
space and search for favorable terrain layouts. This is a weak version of fairness
manipulation rather than a cryptographic break, but it is worth noting.

The correct mitigation is either to accept the 32-bit limitation (it is inherent to
mulberry32) or to use a 64-bit seed with a PRNG that supports wider state (e.g., xoshiro128**).

**Weapon scatter/rain PRNG:**
```javascript
// physics.js:520-523
function weaponSeededRandom(weaponId, impactX, impactY) {
    const seed = (weaponId * 73856093) ^ (Math.floor(impactX) * 19349663) ^ (Math.floor(impactY) * 83492791);
    return seededRandom(Math.abs(seed));
}
```

This is a deterministic seed for reproducible multi-hit weapon scatter across server
and client. The seed is derived from publicly known values (weaponId, impactX, impactY)
which means a player can pre-compute the scatter pattern before firing. This is a
**gameplay fairness issue** (a knowledgeable player can predict where Crazy Ivan
sub-explosions will land) but not a cryptographic vulnerability in the traditional sense.

### 5. Key Management (keys.js)

**File:** `server/services/keys.js`

```javascript
const bytes = Uint8Array.from(secretKeyArray);
_escrowKeypair = Keypair.fromSecretKey(bytes);
// KM-04: Zero the input array
bytes.fill(0);
```

**Assessment: PARTIALLY EFFECTIVE**

- The intermediate `bytes` array is zeroed after use. This eliminates one copy.
- However, `secretKeyArray` (the JavaScript Array from JSON.parse) is NOT zeroed.
  JavaScript arrays holding integer values are on the heap and subject to GC at an
  indeterminate time. They cannot be reliably zeroed because `secretKeyArray.fill(0)`
  would need to be called before the reference is released.
- `Keypair.fromSecretKey()` internally constructs a 64-byte nacl secret key (32-byte
  seed + 32-byte public key concatenated). The Keypair object itself holds a reference
  to this buffer. There is no mechanism to zero it when the Keypair is no longer needed.
- These are fundamental limitations of JavaScript key management — the zeroing is a
  best-effort mitigation, not a cryptographic guarantee.

**OBSERVATION — DATA-05-O2 (LOW): secretKeyArray intermediate not zeroed**

The parsed JSON array `secretKeyArray` cannot be reliably zeroed in JavaScript due to
garbage collector semantics. This is an inherent limitation of the runtime. For
production, consider using a Hardware Security Module (HSM) or Solana's native
remote-signing mechanism rather than in-process key material.

**OBSERVATION — DATA-05-O3 (LOW): SOLANA_KEYPAIR_JSON env var risk**

When `SOLANA_KEYPAIR_JSON` is used, the full 64-byte private key exists as a plain JSON
array in the process environment. Environment variables are readable via `/proc/self/environ`
on Linux if the process has been compromised. `SOLANA_KEYPAIR_PATH` is marginally better
as only the path is exposed, but the key file must be protected by filesystem permissions.

### 6. Client-Side Signature and Transaction Handling (WalletContext.js)

**File:** `client/src/wallet/WalletContext.js`

**Authentication message construction:**
```javascript
const timestamp = Date.now();
const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
const encodedMessage = new TextEncoder().encode(message);
const signature = await signMessage(encodedMessage);
const signatureBase64 = btoa(String.fromCharCode(...signature));
```

**WEAKNESS — DATA-05-W6 (MEDIUM): `btoa(String.fromCharCode(...signature))` spread risk**

`btoa(String.fromCharCode(...signature))` uses the spread operator on a `Uint8Array`.
For large arrays this would cause a stack overflow ("Maximum call stack size exceeded")
because spread pushes all elements onto the call stack. A 64-byte Ed25519 signature is
safe (64 arguments), but if this pattern is copied to sign larger data, it will break.
The idiomatic approach is:

```javascript
const signatureBase64 = Buffer.from(signature).toString('base64');
```

**Escrow transaction validation (CS-01):**
```javascript
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);

function validateEscrowTransaction(tx) {
    for (const ix of instructions) {
        if (ix.programId.equals(ESCROW_PROGRAM_ID)) {
            const discriminator = ix.data.slice(0, 8);
            if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
                return { valid: false, reason: 'Unknown escrow instruction (discriminator mismatch)' };
            }
        } else if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
            continue;
        } else {
            return { valid: false, reason: `Unexpected program: ${programId}` };
        }
    }
}
```

This is a well-implemented client-side TX validation guard (CS-01 fix). The instruction
discriminator is a SHA-256 derived 8-byte prefix from `"global:deposit_wager"` — this
correctly identifies the Anchor instruction. The allowlist of program IDs (escrow + compute
budget) is restrictive. This is good defense-in-depth even though the on-chain program
enforces its own constraints.

**OBSERVATION — DATA-05-O4 (INFO): Discriminator derivation not verified in code**

The comment states the discriminator is `SHA-256("global:deposit_wager")[0..8]`. This
can be verified at deploy time but is hardcoded as a byte literal. If the IDL or
instruction name changes, this will silently fail to validate. A test that derives the
discriminator at startup and compares to the constant would be safer.

**Derivation check (manual):**
`SHA256("global:deposit_wager") = ea49eb88a867efcf...` — first 8 bytes match
`[0xea=234, 0x49=73, 0xeb=235, 0x88=136, 0xa8=168, 0x67=103, 0xef=239, 0xcf=207]`.
The constant is correct.

### 7. Burn Transaction Verification (shot-token.js)

**File:** `server/services/shot-token.js:457-549`

```javascript
const ixAmount = type === 'burnChecked'
    ? parseInt(info.tokenAmount?.amount || '0')
    : parseInt(info.amount || '0');
// ...
const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
if (BigInt(ixAmount) < expectedRaw) { ... }
```

**WEAKNESS — DATA-05-W7 (MEDIUM): parseInt() for large SPL token amounts**

`parseInt(info.tokenAmount?.amount)` parses a decimal string representation of the
raw token amount. For SHOT with 9 decimals, the maximum burn (Diamond tier: 4000 SHOT)
is `4000 * 1e9 = 4,000,000,000,000` raw units (4 trillion). This exceeds
`Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991) by a large margin, so integer parsing
is safe for SHOT amounts up to about 9 million tokens.

However, `parseInt()` is used instead of `BigInt()` for parsing. If the token amount
string were to represent a value near or above `Number.MAX_SAFE_INTEGER`
(9,007,199,254,740,991 raw = 9,007,199 SHOT), `parseInt()` would lose precision.
The comparison `BigInt(ixAmount) < expectedRaw` converts the already-imprecise
`parseInt` result to BigInt, preserving the imprecision. For SHOT specifically this is
not exploitable given the 10M supply cap, but it is a correctness hazard if the
token were re-used elsewhere or the supply cap were ever changed.

**Recommendation:** Parse amounts directly with BigInt:
```javascript
const ixAmount = type === 'burnChecked'
    ? BigInt(info.tokenAmount?.amount || '0')
    : BigInt(info.amount || '0');
const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
if (ixAmount < expectedRaw) { ... }
```

**Replay protection:**
```javascript
const verifiedBurnTxs = new Set();
// Restored from MongoDB on startup (TE-01)
if (state.verifiedBurnTxs && state.verifiedBurnTxs.length > 0) {
    state.verifiedBurnTxs.forEach(tx => verifiedBurnTxs.add(tx));
}
```

The burn TX replay protection is backed by MongoDB (persisted). This is correct — an
in-memory-only set would be bypassed by server restart. The persistence via
`ServerState.js:persistBurnTx()` closes the restart-replay gap.

**OBSERVATION — DATA-05-O5 (INFO): Inner instruction CPI burn path**

The code searches both top-level instructions and `meta.innerInstructions` for burn
instructions. This is necessary because some wallets route burns through CPI calls.
The second path performs the same mint and authority checks, which is correct.

### 8. Crypto Polyfills — Client (config-overrides.js)

**File:** `client/config-overrides.js`

```javascript
config.resolve.fallback = {
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer/'),
    vm: false,
};
```

**Assessment: STANDARD AND ACCEPTABLE**

`crypto-browserify` is the established browser polyfill for the Node.js `crypto` module.
It uses the Web Crypto API (`window.crypto.getRandomValues`) for random number generation,
which is a CSPRNG in all modern browsers. The polyfill is maintained and widely used by
the Solana ecosystem.

**OBSERVATION — DATA-05-O6 (LOW): crypto-browserify version pinning**

The `crypto-browserify` version is not pinned in `client/package.json` (uses a range).
A supply chain attack on the `crypto-browserify` npm package would affect all
cryptographic operations in the browser client, including signature generation.
Recommend pinning to an exact version and auditing changes before upgrading.

### 9. Data at Rest — Encryption

**No encryption of data at rest was found.** The MongoDB collections store:
- `User.stats` (SHOT balances, prestige tier, milestone state) — plaintext
- `Match` (room metadata) — plaintext
- `ServerState` (total SHOT emitted, verified burn TX list) — plaintext

No personally identifiable information (PII) beyond wallet addresses (public keys) is
stored. Wallet addresses are cryptographically derived public keys — their storage in
plaintext is standard practice in the Solana ecosystem. SOL balances are not stored
server-side (queried live from RPC). No private keys are stored in the database.

**OBSERVATION — DATA-05-O7 (INFO): MongoDB connection string in environment variable**

`MONGODB_URI` is loaded from `process.env` and passed directly to `mongoose.connect()`.
If the URI contains credentials (as MongoDB Atlas connection strings typically do), those
credentials exist in the process environment. This is the standard approach but requires
that the deployment environment (e.g., Render) protects environment variables at rest.

### 10. Data in Transit — TLS Enforcement

**No TLS enforcement was found in the server code.** The Express/Socket.IO server listens
on a plain HTTP server:

```javascript
// server/index.js:24-25
const server = http.createServer(app);
// ...
server.listen(PORT, '0.0.0.0', ...)
```

TLS termination is presumably handled at the reverse proxy layer (Render, Cloudflare,
etc.). This is a common and acceptable deployment pattern, but the code provides no
defense if deployed without a TLS-terminating proxy. WebSocket connections use `ws://`
internally; the upgrade to `wss://` depends entirely on the proxy configuration.

**OBSERVATION — DATA-05-O8 (LOW): No server-side TLS enforcement**

If deployed directly to the internet without a TLS-terminating reverse proxy, all
Socket.IO traffic (including auth signatures, wager data, and gameplay) travels in
plaintext. The CSP `connectSrc` directive correctly lists only `wss://` endpoints for
production, which provides browser-side enforcement, but server-side enforcement is absent.

### 11. Admin Key Comparison (guards.js)

**File:** `server/middleware/guards.js:26-31`

```javascript
export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
```

**WEAKNESS — DATA-05-W8 (HIGH): Non-timing-safe API key comparison**

`apiKey !== process.env.ADMIN_API_KEY` is a direct string comparison, vulnerable to
timing side-channel attacks. An attacker making many requests to `/stats` or
`/api/admin/reload-keys` could use response time differences to byte-by-byte reconstruct
the admin key.

The correct fix:
```javascript
const expected = process.env.ADMIN_API_KEY;
if (!expected || !apiKey) return res.status(401).json({ error: 'Unauthorized' });
try {
    const valid = crypto.timingSafeEqual(
        Buffer.from(apiKey, 'utf8').subarray(0, 64),
        Buffer.from(expected.padEnd(apiKey.length, '\0').substring(0, apiKey.length), 'utf8')
    );
    if (!valid) return res.status(401).json({ error: 'Unauthorized' });
} catch { return res.status(401).json({ error: 'Unauthorized' }); }
```

Or more simply, using a constant-time comparison helper:
```javascript
import { timingSafeEqual } from 'crypto';
const a = Buffer.from(apiKey || '', 'utf8');
const b = Buffer.from(expected || '', 'utf8');
if (a.length !== b.length || !timingSafeEqual(a, b)) { ... }
```

Note: `timingSafeEqual` requires equal-length buffers; length difference must be handled
before the comparison (length itself is observable, so checking it does not compound the
timing oracle).

---

## Finding Register

| ID          | Severity | File                          | Issue                                              |
|-------------|----------|-------------------------------|----------------------------------------------------|
| DATA-05-W1  | MEDIUM   | server/middleware/auth.js:47  | `atob()` silently accepts malformed Base64; use `Buffer.from(..., 'base64')` |
| DATA-05-W2  | HIGH     | server/middleware/auth.js:110-117 | `verifyToken()` exported but never called; JWT has no enforcement |
| DATA-05-W3  | HIGH     | server/middleware/telegram.js:53 | Timing-unsafe string comparison for HMAC; use `crypto.timingSafeEqual` |
| DATA-05-W4  | MEDIUM   | server/middleware/telegram.js:103 | Telegram auth always optional — absent header = bypass |
| DATA-05-W5  | MEDIUM   | server/socket-io/main.js:2297 | 128-bit terrain seed truncated to 32 bits before use |
| DATA-05-W6  | MEDIUM   | client/src/wallet/WalletContext.js:181 | `btoa(String.fromCharCode(...sig))` spread unsafe on large arrays |
| DATA-05-W7  | MEDIUM   | server/services/shot-token.js:496-498 | `parseInt()` for SPL raw token amounts; use BigInt parsing |
| DATA-05-W8  | HIGH     | server/middleware/guards.js:27 | Timing-unsafe admin API key comparison; use `timingSafeEqual` |
| DATA-05-O1  | LOW      | server/socket-io/main.js:1163 | Room ID is 32 bits; 64 bits recommended for escrow PDA seeds |
| DATA-05-O2  | LOW      | server/services/keys.js:45    | `secretKeyArray` (parsed JSON) not zeroed; inherent JS limitation |
| DATA-05-O3  | LOW      | server/services/keys.js:44    | SOLANA_KEYPAIR_JSON exposes 64-byte key in process env |
| DATA-05-O4  | INFO     | client/src/wallet/WalletContext.js:41 | Discriminator hardcoded — no startup verification against IDL |
| DATA-05-O5  | INFO     | server/services/shot-token.js:521-542 | CPI burn path correctly handles inner instructions |
| DATA-05-O6  | LOW      | client/config-overrides.js:7  | crypto-browserify not pinned to exact version |
| DATA-05-O7  | INFO     | server/index.js:137-140       | MongoDB URI with credentials in process env (standard, document) |
| DATA-05-O8  | LOW      | server/index.js:24            | No server-side TLS; relies on reverse proxy (must be documented) |

---

## Positive Observations

The following cryptographic practices are correctly implemented:

1. **Ed25519 verification** uses `tweetnacl` (libsodium-based) with `PublicKey.isOnCurve()`
   pre-check — correctly defends against small-subgroup attacks.

2. **JWT secret management** in production calls `process.exit(1)` if `JWT_SECRET` is
   missing. Dev mode uses a fresh `crypto.randomBytes(32)` secret per process start
   (correct — prevents token reuse across restarts during development).

3. **CSPRNG** (`crypto.randomBytes`, `crypto.randomInt`) is used for all
   security-relevant random values: room IDs, wind generation, first turn selection,
   tank spawn positions, weapon arrays.

4. **HMAC-SHA256** for Telegram Mini App validation follows the exact two-step
   derivation specified in the Telegram documentation.

5. **Instruction discriminator validation** in the client TX validator (CS-01) correctly
   hardcodes the Anchor `deposit_wager` discriminator and enforces an allowlist of
   permitted program IDs before the user signs any transaction.

6. **Burn TX replay protection** is persisted to MongoDB via `persistBurnTx()` and
   restored on startup via `initShotState()` — correctly closing the restart-bypass gap.

7. **No custom cryptographic implementations** found anywhere in the codebase. All
   crypto operations delegate to `crypto` (Node.js built-in), `tweetnacl`, `jsonwebtoken`,
   or `@solana/web3.js`.

---

## Priority Remediation Order

1. **DATA-05-W8** (HIGH) — Add `crypto.timingSafeEqual` to `requireAdminKey` in guards.js.
   The `/api/admin/reload-keys` endpoint is a particularly high-value target.

2. **DATA-05-W3** (HIGH) — Add `crypto.timingSafeEqual` to Telegram HMAC comparison in
   telegram.js. Also add hex-string length/format validation before comparison.

3. **DATA-05-W2** (HIGH) — Either enforce the JWT on every wager-related socket event
   (calling `verifyToken` in the authenticate handler's returned token, then requiring it
   on `createRoom`/`joinRoom`), or remove JWT generation entirely to avoid false
   confidence. Current state is misleading: the code looks like it has session tokens but
   they are never checked.

4. **DATA-05-W1** (MEDIUM) — Replace `atob()` with `Buffer.from(signatureBase64, 'base64')`
   in auth.js. One-line change, eliminates silent truncation on malformed input.

5. **DATA-05-W7** (MEDIUM) — Replace `parseInt()` with `BigInt()` in burn amount parsing
   in shot-token.js. One-line change, eliminates precision loss risk.

6. **DATA-05-W5** (MEDIUM) — Document the 32-bit seed limitation or upgrade to a PRNG
   with 64-bit state (xoshiro128++ is a drop-in alternative).

---

*Analysis based on direct reading of source files. No dynamic testing performed.*
*task_id: DATA-05 | generated: 2026-02-23*
