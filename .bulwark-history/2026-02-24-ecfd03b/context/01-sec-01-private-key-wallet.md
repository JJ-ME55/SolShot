<!-- CONDENSED_SUMMARY_START -->
---
task_id: SEC-01
auditor: Private Key & Wallet Security
date: 2026-02-23
files_reviewed:
  - server/services/keys.js
  - server/services/escrow.js
  - server/services/solana.js
  - server/middleware/auth.js
  - server/middleware/guards.js
  - server/services/shot-token.js
  - server/services/logger.js
  - server/socket-io/main.js
  - server/index.js
  - client/src/wallet/WalletContext.js
severity_counts:
  critical: 0
  high: 2
  medium: 3
  low: 2
  informational: 3
---

## Condensed Findings

[HIGH] Incomplete key-material zeroing — `secretKeyArray` (the JS Array from `JSON.parse`) is never zeroed after key loading; only the intermediate `Uint8Array` copy is zeroed. The original parsed array remains in the JS heap and is GC-observable. (`server/services/keys.js:42-55`)

[HIGH] `burnAmount` not validated before reaching `BigInt()` in prestige burn verification — the `prestigeBurn` socket handler passes the raw client-supplied `burnAmount` (not type-checked) directly to `verifyBurnTransaction`. If `burnAmount` is `undefined` or a non-numeric type, `BigInt(burnAmount)` throws and the handler catches the error, but a value of `0` silently passes the `>= expectedRaw` check (`0n`), allowing any on-chain burn (even a dust burn for a different prestige tier) to satisfy the amount check — the server-side SHOT balance check remains the only guard. (`server/socket-io/main.js:1618`, `server/services/shot-token.js:509`)

[MEDIUM] JWT token generated but never verified — `auth.js` generates a JWT token on successful authentication and the `verifyToken()` function exists, but no socket or HTTP handler ever calls `verifyToken()`. Authentication state is entirely carried by the in-memory `client.isAuthenticated` flag and `authenticatedWallets[client.id]`, which is lost on reconnect and requires a full re-authentication via Ed25519 signature. The JWT is dead code. (`server/middleware/auth.js:94-148`)

[MEDIUM] `verifyToken()` error message leaks JWT library internals to callers — the `catch` block returns `{ valid: false, reason: err.message }` where `err.message` can be a jsonwebtoken-specific string (e.g., `"jwt expired"`, `"invalid signature"`) if the function were ever called. Not currently exploitable (function unused) but represents a pattern to fix before wiring up. (`server/middleware/auth.js:115`)

[MEDIUM] `verifyWalletSignature` error path returns `err.message` in the reason field back to the client — the catch block in `verifyWalletSignature` returns `{ valid: false, reason: \`Verification error: ${err.message}\` }`. This surfaces arbitrary Node.js/NaCl internal error strings to the unauthenticated client. While not exploitable for key extraction, it may disclose library version fingerprints or internal state. (`server/middleware/auth.js:63`)

[LOW] `SOLANA_KEYPAIR_JSON` env var carries the full raw private key bytes as a JSON string — if any logging framework ever captures `process.env` (e.g., crash reporter, APM agent, unhandled exception handler with env dump), the entire private key is exposed. The path-based `SOLANA_KEYPAIR_PATH` alternative does not have this risk. (`server/services/keys.js:33-45`)

[LOW] Authority public key logged at startup without structured redaction — `[Keys] Escrow authority: <base58>` and `[Escrow] Treasury: <addr>` / `[Escrow] Ops: <addr>` are emitted at `console.log` level (not via the pino logger with redaction). These are public keys, not secrets, but appear in plain text in any logging aggregator. Not a critical issue but inconsistent with the pino redaction policy. (`server/services/keys.js:57`, `server/services/escrow.js:82-86`)

[INFO] Wallet addresses correctly sourced from `authenticatedWallets[client.id]` for all financial operations — both `createRoom` and `joinRoom` explicitly ignore any wallet address in the client payload and read only from the server-side map. This is a correct and intentional design. (`server/socket-io/main.js:968, 1124` — annotated H002)

[INFO] Ed25519 signature verification is cryptographically sound — NaCl `sign.detached.verify` is used correctly; the message format includes the wallet address and timestamp; `PublicKey.isOnCurve()` guards against off-curve point attacks; replay is prevented by the 5-minute `AUTH_TIMEOUT` window. (`server/middleware/auth.js:38-65`)

[INFO] Server keypair is confined to `keys.js` / `escrow.js` — no other module reads the keypair env vars; `getEscrowKeypair()` is the sole accessor; the keypair is used only for on-chain signing via the Anchor `Wallet` wrapper and is never serialized, logged (in secret form), or emitted to clients. (`server/services/keys.js`, `server/services/escrow.js`)
<!-- CONDENSED_SUMMARY_END -->

---

# SEC-01 Full Analysis: Private Key & Wallet Security

## 1. Key Loading and Lifecycle (`server/services/keys.js`)

### Architecture
Key ingestion is centralized in a single module. Only `initKeys()` reads the keypair environment variables (`SOLANA_KEYPAIR_JSON` or `SOLANA_KEYPAIR_PATH`). The result is held in the module-scoped `_escrowKeypair` variable and returned to callers only via `getEscrowKeypair()`. This single-ingestion point (KM-03) is correctly implemented.

### FINDING: Incomplete Zeroing of Key Material (HIGH)

**Status: CONFIRMED — partial mitigation failure**

```js
// server/services/keys.js:42-55
let secretKeyArray;

if (keypairJson) {
    secretKeyArray = JSON.parse(keypairJson);        // Line 45: JS Array — never zeroed
} else {
    const resolved = keypairPath.replace('~', ...);
    secretKeyArray = JSON.parse(fs.readFileSync(resolved, 'utf-8')); // Line 48: also never zeroed
}

const bytes = Uint8Array.from(secretKeyArray);       // Line 51: separate copy
_escrowKeypair = Keypair.fromSecretKey(bytes);       // Line 52: Keypair makes its own internal copy
bytes.fill(0);                                        // Line 55: zeroes the Uint8Array, NOT secretKeyArray
```

**5-Whys Analysis:**
1. Why is the zeroing incomplete? The comment says "KM-04: Zero the input array" but only `bytes` (the `Uint8Array`) is zeroed, not `secretKeyArray` (the parsed JS `Array`).
2. Why does this matter? `Uint8Array.from(arr)` creates a new buffer — `secretKeyArray` retains all 64 bytes of private key material as a regular JS Array in the heap.
3. Why is the JS Array harder to zero? JS Arrays cannot be reliably zeroed because they are ordinary GC-managed objects; `secretKeyArray.fill(0)` would work syntactically but the GC may have already copied the array internally. However, explicitly overwriting it reduces the attack window.
4. Why is this a real risk? If a heap snapshot, crash dump, or V8 memory dump is captured (e.g., by a cloud provider, APM agent, or `--inspect` debugging session), the original key bytes remain readable until the array is GC-collected.
5. Why wasn't this caught? The comment correctly describes the intent but the implementation zeroizes the wrong variable.

**Recommendation:** Add `secretKeyArray.fill(0)` immediately after `Keypair.fromSecretKey(bytes)`, before `bytes.fill(0)`. Also note that `SOLANA_KEYPAIR_JSON` carries the entire key as a JSON string in `process.env` — if any crash reporter dumps `process.env`, the key is exposed.

---

### FINDING: `SOLANA_KEYPAIR_JSON` Key Exposed in Process Environment (LOW)

**Status: POTENTIAL — depends on deployment tooling**

```js
const keypairJson = process.env.SOLANA_KEYPAIR_JSON;  // Line 33
```

When a 64-byte keypair is passed via `SOLANA_KEYPAIR_JSON`, the full secret key bytes live in the process environment for the entire lifetime of the server. Any code that dumps `process.env` (APM agents, crash reporters, health-check endpoints, unhandled exception loggers) would expose it. The `SOLANA_KEYPAIR_PATH` alternative avoids this risk.

**Recommendation:** Prefer `SOLANA_KEYPAIR_PATH` in production. If `SOLANA_KEYPAIR_JSON` must be supported (for PaaS deployments like Render where files are harder to provision), document the risk prominently and ensure no logging layer captures `process.env`.

---

## 2. Escrow Service Keypair Usage (`server/services/escrow.js`)

### Architecture
`escrow.js` imports `getEscrowKeypair()` from `keys.js` and uses it in two ways:
1. Passed to `new Wallet(escrowKeypair)` for the Anchor `AnchorProvider` — this gives Anchor the authority to sign all server-side program calls.
2. `getEscrowKeypair().publicKey` passed as the `authority` account in Anchor method calls — the Anchor framework signs the transaction using the Wallet internally.

### Key Exposure Assessment

The keypair object is **never serialized, logged, or emitted to clients**. All uses are:
- Construction of the `Wallet` wrapper (which holds the Keypair reference internally)
- `.publicKey` field access (a public key — not sensitive)

The `console.log` at startup logs the **public key** only:
```js
console.log(`[Escrow] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}`);
```

**Status: NOT_VULNERABLE** — No private key material leaves the process memory in this path.

### Settlement Authority Pattern

Settlement is triggered server-side only after the match state machine reaches `COMPLETE`. The `settleMatch` call path:
```
fire handler → physics → matchResult → withLock('settle:roomId') → settleMatch() → settleMatchEscrow() → program.methods.settleMatch().rpc()
```

The `withLock` mutex prevents concurrent settlement attempts for the same room (fixing H020). The `SF-02` comment confirms that a failed settlement does NOT fall through to a dev-mode stub — it returns an error and the room transitions to `CANCELLED` state.

**Status: NOT_VULNERABLE** — Settlement signing is properly gated and non-bypassable by clients.

---

## 3. Authentication Mechanism (`server/middleware/auth.js`)

### Ed25519 Signature Verification

```js
// auth.js:38-65
const publicKey = new PublicKey(walletAddress);
if (!PublicKey.isOnCurve(publicKey.toBytes())) {
    return { valid: false, reason: 'Invalid wallet address' };
}

const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
const messageBytes = new TextEncoder().encode(message);

const verified = nacl.sign.detached.verify(
    messageBytes,
    signature,
    publicKey.toBytes()
);
```

**Assessment:**
- `PublicKey.isOnCurve()` is called — prevents off-curve public key attacks.
- `nacl.sign.detached.verify` is the correct NaCl API for Ed25519 detached signatures.
- The message format `"SolShot Auth: <walletAddress> at <timestamp>"` binds the signature to a specific wallet address and timestamp, preventing cross-wallet replay.
- `AUTH_TIMEOUT = 5 * 60 * 1000` (5 minutes) is a reasonable freshness window.
- `atob` is available in Node 18+ (confirmed: server runs Node 24).

**Status: NOT_VULNERABLE** — Cryptographic verification is correctly implemented.

### FINDING: JWT Token Generated But Never Verified (MEDIUM)

**Status: CONFIRMED — dead code with future risk**

```js
// auth.js:94-116 — generateToken and verifyToken are defined
export function generateToken(walletAddress) {
    return jwt.sign({ wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, wallet: decoded.wallet };
    } catch (err) {
        return { valid: false, reason: err.message };  // <-- internal JWT error exposed
    }
}

// handleAuthenticate returns { success: true, token, walletAddress }
// main.js:552: client.emit('authResult', result) — token is sent to client
```

No socket handler or HTTP middleware calls `verifyToken()`. Authentication state is tracked purely by:
- `client.isAuthenticated = true` (in-memory, per socket connection)
- `authenticatedWallets[client.id] = result.walletAddress` (module-level Map)

**5-Whys Analysis:**
1. Why is the JWT unused? The auth flow was designed for JWT-based stateless re-auth, but Socket.IO persistent connections make it unnecessary — each connection re-authenticates from scratch.
2. Why is this a medium finding, not low? The client receives a JWT token it cannot use, and the `verifyToken()` function exposes JWT library error strings. If a future developer wires up token-based auth without auditing, they may introduce vulnerabilities.
3. Why is `verifyToken`'s error exposure a concern? `err.message` from `jsonwebtoken` returns values like `"jwt expired"`, `"invalid signature"`, `"jwt malformed"` — these are library-internal strings that fingerprint the implementation to an attacker.

**Recommendation:** Either remove the JWT generation entirely (since it serves no purpose), or implement proper stateless token verification on reconnect to reduce re-auth friction.

### FINDING: Error Message Leakage in Signature Verification (MEDIUM)

**Status: POTENTIAL — low exploitability**

```js
// auth.js:63
} catch (err) {
    return { valid: false, reason: `Verification error: ${err.message}` };
}
```

The catch block in `verifyWalletSignature` returns `err.message` to the caller, which propagates back to the client via `authResult`. This could expose:
- NaCl internal error strings (e.g., if input lengths are wrong)
- Node.js error messages from `PublicKey` construction
- `atob` decoding errors

While no private key material can be leaked from this path, it provides information useful for fuzzing the auth flow.

**Recommendation:** Replace with a generic message: `return { valid: false, reason: 'Signature verification failed' }`.

---

## 4. Wallet Identity in Socket Events (`server/socket-io/main.js`)

### Trust Model for Wallet Addresses

**Status: NOT_VULNERABLE — correctly implemented**

Both `createRoom` and `joinRoom` read wallet addresses exclusively from the server-side authenticated map:

```js
// main.js:967-968 (joinRoom)
// H002: ONLY use server-verified wallet — never trust client payload
const joinerWallet = authenticatedWallets[client.id] || null

// main.js:1123-1124 (createRoom)
// H002: ONLY use server-verified wallet — never trust client payload
const walletAddress = authenticatedWallets[client.id] || null
```

Client impersonation via manipulated socket payloads is prevented. The `authenticatedWallets` map is keyed by socket ID (server-assigned) and populated only after successful Ed25519 verification.

### Reconnect Path Wallet Validation

The `rejoinRoom` handler re-verifies the Ed25519 signature before trusting the reconnecting wallet:

```js
// main.js:792-799
const msgCheck = verifyAuthMessage(message, walletAddress, timestamp)
if (!msgCheck.valid) { client.emit('rejoinError', { reason: msgCheck.reason }); return }
const sigCheck = verifyWalletSignature(walletAddress, message, signature)
if (!sigCheck.valid) { client.emit('rejoinError', { reason: sigCheck.reason }); return }
```

The reconnect state is keyed by wallet address in `pendingReconnects[walletAddress]` — an attacker cannot use someone else's socket ID to claim their in-progress match because the wallet address lookup requires a fresh signature.

**Status: NOT_VULNERABLE**

### Settlement Wallet Address Sourcing

Settlement uses a dual-source lookup with `authenticatedWallets` as the primary and `ws.wallets` as fallback:

```js
// main.js:2160-2161
const hostWallet = wsState?.wallets?.[hostId] || authenticatedWallets[hostId] || null
const playerWallet = wsState?.wallets?.[playerId] || authenticatedWallets[playerId] || null
```

`ws.wallets` is populated from `authenticatedWallets` at the time of room creation/join:
```js
// main.js:1174 (createRoom)
wallets: { [client.id]: walletAddress }

// main.js:1009 (joinRoom)
ws.wallets[client.id] = joinerWallet
```

Where `walletAddress`/`joinerWallet` come from `authenticatedWallets[client.id]`. The chain of custody is clean.

**Status: NOT_VULNERABLE**

---

## 5. Client Wallet Integration (`client/src/wallet/WalletContext.js`)

### Transaction Validation Before Signing

The `signAndSendEscrowDeposit` function validates the transaction before passing it to the user's wallet:

```js
// WalletContext.js:validateEscrowTransaction()
function validateEscrowTransaction(tx) {
    if (!ESCROW_PROGRAM_ID) {
        return { valid: true }; // Dev mode bypass — noted below
    }

    for (const ix of instructions) {
        if (ix.programId.equals(ESCROW_PROGRAM_ID)) {
            // Verify it's deposit_wager via 8-byte discriminator
            const discriminator = ix.data.slice(0, 8);
            if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
                return { valid: false, reason: `Unknown escrow instruction (discriminator mismatch)` };
            }
            hasDepositInstruction = true;
        } else if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
            continue; // Allowed
        } else {
            return { valid: false, reason: `Unexpected program: ${programId}` };
        }
    }
}
```

This is a **solid defense** against a malicious server sending an arbitrary transaction (e.g., a SOL transfer from the player's wallet) disguised as an escrow deposit. The instruction discriminator `[234, 73, 235, 136, 168, 103, 239, 207]` is hardcoded and matches the Anchor IDL.

**Status: NOT_VULNERABLE** (when `REACT_APP_ESCROW_PROGRAM_ID` is set in production)

**Note:** The dev-mode bypass (`if (!ESCROW_PROGRAM_ID) return { valid: true }`) skips all transaction validation when the program ID env var is not set. This is acceptable for local development but must never reach production without the env var set.

### `window.solWallet` Exposure

**Status: NOT_VULNERABLE — removed by CS-04**

The codebase contains comments `// CS-04: Use context hook instead of window.solWallet` across all consumer components (`App.js`, `BattleScreen.js`, `LobbyScreen.js`, `PrestigeScreen.js`, `BarracksScreen.js`, `WalletDisplay.js`). The `window.solWallet` global is no longer assigned anywhere in the codebase — all components use the `useSolShotWallet()` React hook instead. No signing functions are reachable from Phaser/global scope.

### `window.socket` Global Exposure

```js
// App.js:20
window.socket = socket;
```

The Socket.IO client is exposed globally. This allows any script (including browser extensions or XSS payloads) to emit socket events as the authenticated user without re-signing. Since authentication is tracked server-side by socket ID (not by re-verification per event), an attacker with XSS access could emit `createRoom`, `fire`, or `escrowDepositConfirm` events impersonating the authenticated player.

**Status: POTENTIAL — requires XSS as prerequisite**

This is an architecture-level risk inherent to the Phaser engine integration (Phaser cannot use React hooks and needs global access). However, if CSP and other XSS mitigations are strong, the practical risk is limited. The server's `validateEscrowTransaction` and on-chain verification are the backstops.

---

## 6. Prestige Burn Verification (`server/services/shot-token.js`)

### FINDING: `burnAmount` Not Type-Validated Before `BigInt()` Conversion (HIGH)

**Status: CONFIRMED — partial bypass available**

```js
// main.js:1618
const { txSignature, burnAmount } = data || {}
// No type validation of burnAmount

// main.js:1626
const verification = await verifyBurnTransaction(txSignature, wallet, burnAmount)

// shot-token.js:509
const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
if (BigInt(ixAmount) < expectedRaw) { ... }
```

**Attack vector:** A client sends `prestigeBurn` with `burnAmount: 0` (or omits it). `BigInt(0)` produces `0n`. The comparison `BigInt(ixAmount) >= 0n` is always true for any positive on-chain burn amount. This means a player who burned even 1 lamport worth of SHOT (for a different reason) could submit that transaction and pass the on-chain amount check.

**Impact assessment (reduced):** Despite passing `verifyBurnTransaction`, the `prestigeBurn(wallet)` function performs its own server-side SHOT balance check:

```js
// shot-token.js:369
if (state.balance < nextTier.burnCost) {
    return { success: false, reason: `Need ${nextTier.burnCost} SHOT, have ${state.balance}` };
}
```

This means the bypass does **not** allow a player to skip the SHOT balance requirement — they still need the SHOT balance in-memory. However, it does allow a player to claim a prestige tier upgrade using a transaction that burned far less SHOT than required on-chain (e.g., burning 1 SHOT on-chain but claiming 200 SHOT worth of prestige).

**5-Whys Analysis:**
1. Why is `burnAmount` not validated? The handler extracts it from `data || {}` without any type check before passing to `verifyBurnTransaction`.
2. Why is this dangerous? The on-chain verification is supposed to confirm the player burned the correct amount — if `expectedAmount` is 0, any burn transaction (even an unrelated one) passes the amount check.
3. Why doesn't the balance check fully mitigate it? The server's SHOT balance is in-memory and is decremented after verification. If a player has the SHOT balance (legitimately earned), they can use an unrelated burn TX to trigger the prestige upgrade without actually burning the expected amount. The SHOT still leaves their in-memory balance via `prestigeBurn()`, so there is no double-prestige risk, but the on-chain burn is not for the correct amount.
4. Why does this matter at mainnet? The SHOT token represents real value (burned from a finite supply). Allowing a prestige upgrade with an undersized burn (e.g., 1 SHOT instead of 200 SHOT) destroys less supply than the protocol requires, inflating the circulating supply.

**Recommendation:**

```js
// In main.js prestigeBurn handler, add before the verification call:
if (!Number.isFinite(burnAmount) || !Number.isInteger(burnAmount) || burnAmount <= 0) {
    client.emit('prestigeResult', { success: false, reason: 'Invalid burn amount' });
    return;
}
// Also verify it matches the expected next tier cost server-side:
const state = getPlayerShotState(wallet);
const nextTier = PRESTIGE_TIERS[(state?.prestigeTier || 0) + 1];
if (!nextTier || burnAmount !== nextTier.burnCost) {
    client.emit('prestigeResult', { success: false, reason: 'Burn amount does not match next tier cost' });
    return;
}
```

---

## 7. Credential and Secret Management

### JWT_SECRET Fallback

```js
// auth.js:17-25
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] FATAL: JWT_SECRET must be set in production');
        process.exit(1);
    }
    const devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] No JWT_SECRET set — using random secret (dev mode)...');
    return devSecret;
})();
```

This correctly fails hard in production (`process.exit(1)`) and uses a random ephemeral secret in development. Since the JWT is not currently used for any verification, this is not actively exploitable, but the correct production guard is in place.

**Status: NOT_VULNERABLE**

### ADMIN_API_KEY Guard

```js
// guards.js:requireAdminKey
export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
```

Used on `GET /stats` and `POST /api/admin/reload-keys`. If `ADMIN_API_KEY` is not set, the guard denies all requests (fail-closed). This is the correct behavior.

**Status: NOT_VULNERABLE**

### Pino Logger Redaction

```js
// logger.js
redact: {
    paths: ['walletAddress', 'wallet', 'winner', 'loser', 'player', 'p1wallet', 'p2wallet',
            'winnerAddress', 'loserAddress', '*.walletAddress', '*.wallet'],
    censor: '[REDACTED]',
},
```

The pino logger correctly redacts wallet addresses from structured log fields. However, several `console.log`/`console.error` calls in `keys.js` and `escrow.js` bypass pino and output directly to stdout without redaction. These log public keys (not secret keys), so the current risk is low.

**Status: LOW — public keys logged via console instead of pino**

---

## 8. Hardcoded Values Assessment

No hardcoded private keys, mnemonics, or seed phrases were found in source. The only hardcoded key-material-adjacent values are:
- `DEPOSIT_WAGER_DISCRIMINATOR` in `WalletContext.js` — this is a public Anchor instruction discriminator, not a secret.
- Program ID `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` in `escrow.js` — public, appropriate to hardcode.
- `REACT_APP_SHOT_TOKEN_MINT` and `REACT_APP_ESCROW_PROGRAM_ID` in `client/.env` — these are **committed to the repository**. They are public keys for a devnet deployment; no secret material is present. This is acceptable for devnet but must be reviewed before mainnet (the program ID will likely change on mainnet deploy).

**Status: NOT_VULNERABLE for current codebase** (no secrets in source or committed env files)

---

## Summary Table

| Finding | File | Severity | Status |
|---------|------|----------|--------|
| Incomplete zeroing — `secretKeyArray` not zeroed | `server/services/keys.js:42-55` | HIGH | CONFIRMED |
| `burnAmount=0` bypasses on-chain amount check | `server/socket-io/main.js:1618`, `server/services/shot-token.js:509` | HIGH | CONFIRMED (partially mitigated by balance check) |
| JWT token generated but never verified | `server/middleware/auth.js:94-148` | MEDIUM | CONFIRMED (dead code) |
| `verifyToken` error message exposes JWT internals | `server/middleware/auth.js:115` | MEDIUM | POTENTIAL (function unused) |
| `verifyWalletSignature` catch exposes `err.message` | `server/middleware/auth.js:63` | MEDIUM | CONFIRMED |
| `SOLANA_KEYPAIR_JSON` key in process.env | `server/services/keys.js:33` | LOW | POTENTIAL |
| Authority public key logged via `console.log` not pino | `server/services/keys.js:57`, `server/services/escrow.js:82-86` | LOW | CONFIRMED |
| `window.socket` global reachable from XSS | `client/src/App.js:20` | POTENTIAL | Architecture risk |
| Dev-mode TX validation bypass (no ESCROW_PROGRAM_ID) | `client/src/wallet/WalletContext.js` | INFO | Acceptable with env guard |
| Ed25519 verification correct | `server/middleware/auth.js:38-65` | — | NOT_VULNERABLE |
| Wallet address sourcing from server-side map | `server/socket-io/main.js:968, 1124` | — | NOT_VULNERABLE |
| Settlement signing confined to escrow.js/keys.js | `server/services/escrow.js` | — | NOT_VULNERABLE |
| `window.solWallet` removed (CS-04) | `client/src/` | — | NOT_VULNERABLE |
