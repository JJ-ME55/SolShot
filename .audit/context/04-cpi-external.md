# 04 -- External Calls & Dependencies Audit

**Auditor:** Claude Opus 4.6 (automated)
**Date:** 2026-02-14
**Scope:** All server source files -- external API calls, third-party library usage, dependency vulnerabilities, error handling at integration boundaries.
**Node version:** v24.13.0
**Branch:** dev

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Dependency Inventory & Known Vulnerabilities](#dependency-inventory)
3. [Solana RPC External Calls](#solana-rpc)
4. [MongoDB Operations](#mongodb-operations)
5. [Authentication External Dependencies](#authentication)
6. [Socket.IO Layer](#socketio)
7. [Express / HTTP Layer](#express-http)
8. [Unexpected Data Types from External Sources](#unexpected-data)
9. [Findings Summary Table](#findings-table)
10. [Recommendations Priority Matrix](#recommendations)

---

## Executive Summary <a id="executive-summary"></a>

The SolShot server makes external calls to three systems: Solana RPC (devnet), MongoDB Atlas, and relies on cryptographic libraries (tweetnacl, jsonwebtoken) for authentication. The audit reveals **28 npm vulnerabilities** (17 high severity) from outdated transitive dependencies, a **fail-open authentication pattern** on Solana RPC errors that lets players join wagered matches without balance verification, an **excessively large body parser limit** (30MB) creating a trivial DoS vector, and **no rate limiting** on any endpoint or socket event. The settlement system is a stub that logs but never moves SOL, meaning the wager flow is a complete trust-the-server model with no on-chain enforcement.

**Critical count:** 3
**High count:** 8
**Medium count:** 7
**Low count:** 4
**Total findings:** 22

---

## Dependency Inventory & Known Vulnerabilities <a id="dependency-inventory"></a>

### Installed Versions (from `npm ls --depth=0`)

| Package | Declared | Installed | Role |
|---------|----------|-----------|------|
| @solana/web3.js | ^1.98.4 | 1.98.4 | Solana RPC, PublicKey, Keypair |
| cors | ^2.8.6 | 2.8.6 | CORS middleware |
| dotenv | ^16.0.0 | 16.0.1 | Env loading |
| express | ^4.17.3 | 4.18.1 | HTTP server |
| jsonwebtoken | ^9.0.3 | 9.0.3 | JWT sign/verify |
| mongoose | ^9.2.1 | 9.2.1 | MongoDB ODM |
| nodemon | ^1.3.3 | 1.19.4 | Dev auto-reload |
| socket.io | ^4.4.1 | 4.5.1 | WebSocket layer |
| tweetnacl | ^1.0.3 | 1.0.3 | Ed25519 signature verification |

### npm audit Results: 28 vulnerabilities (17 high, 7 moderate, 4 low)

---

### Finding EXT-01: Express 4.18.1 Has Multiple High-Severity Vulnerabilities

- **Severity:** HIGH
- **Location:** `server/package.json:18` (express ^4.17.3, installed 4.18.1)
- **Description:** The installed Express 4.18.1 has cascading vulnerabilities through its dependency tree:
  - **body-parser <= 1.20.3**: DoS via URL encoding (GHSA-qwcr-r2fm-qrc7)
  - **qs <= 6.14.1**: arrayLimit bypass causes memory exhaustion DoS (GHSA-6rw7-vpxm-498p, GHSA-w7fw-mjwx-w883)
  - **path-to-regexp <= 0.1.11**: ReDoS via backtracking regexes (GHSA-9wv6-86v2-598j)
  - **send < 0.19.0**: Template injection leading to XSS (GHSA-m6fv-jmcg-4jfg)
  - **cookie < 0.7.0**: Out-of-bounds character acceptance (GHSA-pxg6-pf52-xh8x)
- **Exploit scenario:** An attacker sends a crafted query string with deeply nested array parameters to `/health` or `/stats`, triggering the `qs` memory exhaustion bug and crashing the Node.js process. Since there is no process manager or clustering, this takes the entire server offline.
- **Recommendation:** Upgrade Express to >= 4.21.3 or 5.x. Run `npm audit fix` as a first step. Pin exact versions in production.

---

### Finding EXT-02: Socket.IO 4.5.1 Has Known Parsing and DoS Vulnerabilities

- **Severity:** HIGH
- **Location:** `server/package.json:22` (socket.io ^4.4.1, installed 4.5.1)
- **Description:** Socket.IO 4.5.1 depends on vulnerable versions of:
  - **socket.io-parser 4.0.4-4.2.2**: Insufficient validation when decoding packets (GHSA-cqmj-92xf-r6r9). Malformed packets can bypass parsing validation.
  - **engine.io (via cookie < 0.7.0)**: Cookie header parsing with out-of-bounds characters.
  - **ws 8.0.0-8.17.0**: DoS when handling requests with many HTTP headers (GHSA-3h5v-q93c-6h6q). A single malicious WebSocket upgrade request with thousands of headers can consume excessive memory.
- **Exploit scenario:** An attacker sends a WebSocket upgrade request with 10,000+ HTTP headers, exploiting the `ws` vulnerability to exhaust server memory. Alternatively, a crafted Socket.IO packet exploits the parser vulnerability to crash the connection handler.
- **Recommendation:** Upgrade socket.io to >= 4.7.5. This pulls in patched versions of ws, engine.io, and socket.io-parser.

---

### Finding EXT-03: nodemon 1.19.4 in Production Dependencies

- **Severity:** LOW
- **Location:** `server/package.json:21` (nodemon ^1.3.3, installed 1.19.4)
- **Description:** nodemon is a development tool listed in `dependencies` rather than `devDependencies`. Version 1.19.4 depends on vulnerable versions of chokidar (braces ReDoS GHSA-grv7-fg5c-xmjg), update-notifier (got redirect to UNIX socket GHSA-pfrx-2q88-qq97), and semver (ReDoS GHSA-c2qf-rxjj-qqgw). While nodemon is not used in production `node index.js` start script, its presence inflates the attack surface.
- **Exploit scenario:** If the server is accidentally started with `npm run dev` in production, the vulnerable transitive dependencies become active. The chokidar braces vulnerability allows ReDoS if file-watching patterns are influenced by user input (unlikely but unnecessary risk).
- **Recommendation:** Move nodemon to `devDependencies`. Upgrade to nodemon 3.x which uses fixed dependencies.

---

## Solana RPC External Calls <a id="solana-rpc"></a>

### Finding EXT-04: Fail-Open Balance Verification Allows Wagered Matches Without Funds

- **Severity:** CRITICAL
- **Location:** `server/services/solana.js:80-102` (verifyBalance), `server/socket-io/main.js:306-317` (joinRoom balance check)
- **Description:** The `verifyBalance()` function catches ALL errors and returns `{sufficient: false, balance: 0}`. However, the `joinRoom` handler at main.js:308 only rejects if `balanceCheck.balance > 0 && !balanceCheck.sufficient`. When the RPC is down/rate-limited, the function returns `balance: 0`, and the condition `balanceCheck.balance > 0` is false, so the join proceeds without rejection.

  ```javascript
  // solana.js:95-102 -- returns balance: 0 on ANY error
  catch (err) {
      return { sufficient: false, balance: 0, required: wagerSOL + 0.01 };
  }

  // main.js:308 -- only blocks if balance > 0 but insufficient
  if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
      client.emit('joinRoomError', { ... })
      return
  }
  ```

  This is a **fail-open** pattern: any RPC failure (network timeout, rate limiting, bad endpoint) silently allows the join.

- **Exploit scenario:** An attacker with zero SOL balance creates a wagered match. The opponent joins and the match plays out. When settlement occurs, the stub `settleMatch()` logs success but never moves SOL. If real settlement is ever implemented, the attacker entered a wagered match with no balance. Even simpler: an attacker can DDoS the Solana RPC endpoint (devnet is rate-limited to ~40 req/s) to force all balance checks to fail, then join wagered matches freely.
- **Recommendation:** Implement fail-closed behavior. When `verifyBalance` returns balance 0, explicitly check if it was an error vs. actual zero balance. Return a distinct error signal: `{ sufficient: false, balance: 0, error: true }`. In joinRoom, reject on error: `if (balanceCheck.error) { emit('joinRoomError', { reason: 'Balance check failed, try again' }); return; }`.

---

### Finding EXT-05: Solana RPC Connection Has No Retry, Timeout, or Circuit Breaker

- **Severity:** HIGH
- **Location:** `server/services/solana.js:34-70` (connection init), `server/services/solana.js:84` (getBalance call)
- **Description:** The Solana `Connection` object is created once as a singleton with no configuration beyond the commitment level ('confirmed'). There is:
  - No connection timeout configuration
  - No retry logic for transient RPC failures
  - No circuit breaker to stop hammering a dead RPC
  - No fallback RPC endpoint
  - No health checking of the RPC connection
  - The default devnet RPC (`https://api.devnet.solana.com`) is rate-limited and unreliable

  The `@solana/web3.js` Connection class uses fetch internally with default timeouts. If the RPC endpoint is unresponsive, every `getBalance()` call will hang for the default HTTP timeout (typically 30+ seconds), blocking the async event handler.

- **Exploit scenario:** If the RPC becomes unresponsive, every `joinRoom` for a wagered match will block for 30+ seconds before timing out and falling through to the fail-open path (EXT-04). With enough concurrent joinRoom requests, the Node.js event loop becomes saturated with pending promises waiting on dead RPC calls.
- **Recommendation:**
  1. Configure the Connection with explicit `{ httpAgent }` that has a 5-second timeout.
  2. Implement a circuit breaker: after 3 consecutive RPC failures, stop making RPC calls for 60 seconds and fail-closed immediately.
  3. Configure a fallback RPC endpoint.
  4. For production, use a dedicated RPC provider (Helius, QuickNode) with higher rate limits.

---

### Finding EXT-06: No Input Validation on Wallet Address Before RPC Call

- **Severity:** MEDIUM
- **Location:** `server/services/solana.js:83` (new PublicKey(walletAddress))
- **Description:** The `verifyBalance()` function passes `walletAddress` directly to `new PublicKey(walletAddress)`. While this constructor does validate base58 encoding, if called with a non-string type (number, object, array), it can throw unexpected errors or exhibit undefined behavior. The caller in main.js:307 takes `walletAddress` directly from the client socket event payload (`{roomId, name, color, walletAddress, wager}`) with no type checking.

  Additionally, `new PublicKey()` accepts both base58 strings AND byte arrays, meaning a crafted input like a 32-element number array would pass the constructor but may not be a legitimate user-controlled wallet.

- **Exploit scenario:** A client sends `walletAddress` as a 32-byte array instead of a base58 string. `new PublicKey()` accepts it, `getBalance()` succeeds, but it references a system account or program-derived address. While the catch block handles exceptions, the lack of type validation means the wallet address stored in `wagerStates` is an array, which could cause downstream issues in settlement.
- **Recommendation:** Add explicit type checking: `if (typeof walletAddress !== 'string' || walletAddress.length < 32 || walletAddress.length > 44) return error`. Validate base58 format before constructing PublicKey.

---

### Finding EXT-07: Settlement Stub Returns success:true Without Moving SOL

- **Severity:** CRITICAL
- **Location:** `server/services/solana.js:139-163` (settleMatch), `server/services/solana.js:173-188` (refundWager)
- **Description:** Both `settleMatch()` and `refundWager()` are stubs that log the operation and return `{ success: true }` without executing any on-chain transaction. The calling code in main.js treats these as successful settlements, emitting `matchSettled` events to clients with settlement amounts.

  The entire wager system gives users the impression that SOL is being moved when it is not. The server tracks financial data (monitoring.js tracks totalWagered, totalSettled, treasuryFees) that has no on-chain backing.

- **Exploit scenario:** Users play wagered matches believing SOL is at stake. Winners are told they won SOL. But no SOL ever moves. If the platform takes deposits without implementing payouts, this constitutes financial misrepresentation. Even in dev mode, the `wager` field is presented in the UI with no disclaimer that it is simulated.
- **Recommendation:**
  1. Either implement actual on-chain settlement via an escrow program, or
  2. Clearly mark all wager functionality as "simulated" in the UI and API responses, or
  3. Disable wager creation entirely until settlement is implemented.
  4. Add a `txSignature: null` check in the client -- if null, display "Settlement pending" rather than "You won X SOL."

---

### Finding EXT-08: Floating-Point Arithmetic for SOL Amounts

- **Severity:** MEDIUM
- **Location:** `server/services/solana.js:121-127` (calculateSettlement)
- **Description:** Settlement amounts are calculated using JavaScript floating-point multiplication:
  ```javascript
  winner: totalWagerSOL * WINNER_SHARE,    // 0.1 * 0.90 = 0.09000000000000001
  treasury: totalWagerSOL * TREASURY_SHARE, // 0.1 * 0.07 = 0.007000000000000001
  ops: totalWagerSOL * OPS_SHARE,          // 0.1 * 0.03 = 0.030000000000000002
  ```
  IEEE 754 floating-point cannot represent these fractions exactly. The sum of splits may not equal the total pot: `0.09000000000000001 + 0.007000000000000001 + 0.030000000000000002 = 0.12700000000000003` vs expected `0.1 * 2 * (0.90 + 0.07 + 0.03) = 0.2`.

  When real settlement is implemented, converting these to lamports (integer multiplication) will produce rounding errors that accumulate over thousands of matches.

- **Exploit scenario:** Over time, dust amounts accumulate in the system. More critically, if lamport conversion rounds down for all three splits, 1-2 lamports are orphaned per settlement. At scale (100K matches), this could mean noticeable fund discrepancies in the treasury. On individual settlements, a winner could receive 1 lamport less than expected.
- **Recommendation:** Perform all arithmetic in lamports (integers). Convert SOL to lamports first: `const totalLamports = Math.round(totalWagerSOL * LAMPORTS_PER_SOL)`. Then split: `winnerLamports = Math.floor(totalLamports * 90 / 100)`, `treasuryLamports = Math.floor(totalLamports * 7 / 100)`, `opsLamports = totalLamports - winnerLamports - treasuryLamports`. This guarantees the splits sum to the total.

---

### Finding EXT-09: Server Keypair Loaded from Filesystem with Tilde Expansion

- **Severity:** MEDIUM
- **Location:** `server/services/solana.js:48-57` (keypair loading)
- **Description:** The server keypair is loaded from `SOLANA_KEYPAIR_PATH` with manual tilde expansion: `keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '')`. This has issues:
  1. Only replaces the first `~` occurrence
  2. On Windows, `USERPROFILE` may contain spaces (e.g., `C:\Users\John Doe`)
  3. The `fs.readFileSync` of a JSON keypair file is done synchronously at startup with no file permission checks
  4. The raw private key bytes are held in memory as a `Keypair` object for the entire server lifetime
  5. If the env var contains a path traversal (`../../etc/passwd`), it will attempt to read that file and parse it as JSON (will fail but reveals file existence through error messages)

- **Exploit scenario:** If `SOLANA_KEYPAIR_PATH` is set via user-controllable config (e.g., admin dashboard), an attacker could set it to a path that reveals file existence. In production, the private key in memory is accessible to any code running in the same process, including compromised dependencies.
- **Recommendation:** Use `path.resolve()` for proper path normalization. Validate the resolved path is within an expected directory. Consider loading the keypair only when needed for signing, not at startup. Use HSM or KMS for production private keys.

---

## MongoDB Operations <a id="mongodb-operations"></a>

### Finding EXT-10: MongoDB Connection Failure Silently Degrades to In-Memory Mode

- **Severity:** HIGH
- **Location:** `server/index.js:39-59` (MongoDB connection), `server/socket-io/main.js:13-15` (isDbConnected)
- **Description:** If MongoDB connection fails, the server starts anyway in pure in-memory mode. The `isDbConnected()` function gates all DB operations, and when false, all match persistence is silently skipped. There is:
  - No reconnection logic (mongoose handles this internally, but the catch-and-continue at index.js:47 means the initial failure is absorbed)
  - No alerting when DB is down
  - No indication to users that their match data will not be persisted
  - If the server restarts while in no-DB mode, ALL match state (including active wager matches) is lost

- **Exploit scenario:** An attacker causes a brief MongoDB connection issue (e.g., DNS hijacking of the Atlas hostname). The server continues in memory-only mode. Players create wagered matches that are not persisted. If the server crashes or restarts, there is zero audit trail of financial activity. The monitoring stats are also in-memory (monitoring.js), so all SOL flow tracking is lost.
- **Recommendation:**
  1. In production, refuse to start if MongoDB is unavailable.
  2. Implement health checks that detect DB disconnection and pause wagered match creation.
  3. Add reconnection event logging: `mongoose.connection.on('disconnected', ...)`.
  4. Consider requiring DB connectivity for any financial operations.

---

### Finding EXT-11: No MongoDB Query Injection Protection on User-Supplied Room Codes

- **Severity:** LOW
- **Location:** `server/socket-io/main.js:387` (Match.create with roomCode from Math.random)
- **Description:** The roomCode used in `Match.create()` is generated server-side via `Math.random().toString(32).slice(2,8)`, so it is not directly user-controlled for creation. However, the `findRoom()` function at main.js:45-47 does a linear scan of the in-memory `rooms` array, and the `roomId` parameter in `joinRoom` events comes directly from the client.

  Mongoose schema validation (roomCode is type String with `required: true`) provides some protection. The `Match.findByIdAndUpdate()` calls at main.js:82 and main.js:103 use ObjectId (`room._matchId`), which is internally generated and safe from injection.

  **However**, if `roomId` from the client payload were ever used directly in a MongoDB query (it is not currently), the lack of sanitization would be a problem. Current risk is low because DB queries only use server-generated IDs.

- **Exploit scenario:** Currently minimal risk. If future code adds a `Match.findOne({ roomCode: roomId })` using the client-supplied `roomId`, a NoSQL injection like `{ "$gt": "" }` could match unintended documents. Current code is safe because in-memory lookup and ObjectId-based DB queries are used.
- **Recommendation:** Add type validation on the `roomId` parameter in joinRoom: `if (typeof roomId !== 'string' || roomId.length > 10) return`. This is defensive against future code changes.

---

### Finding EXT-12: MongoDB persistRoom is Fire-and-Forget with Silent Failure

- **Severity:** MEDIUM
- **Location:** `server/socket-io/main.js:56-86` (persistRoom)
- **Description:** The `persistRoom()` function is called after room state changes but its result is never awaited or checked by the caller. The function catches all errors and only logs them. If DB writes consistently fail (e.g., network partition, write concern timeout), the in-memory state diverges from the DB state with no detection.

  ```javascript
  persistRoom(room);  // Called at main.js:340, 657, 963 -- never awaited
  ```

  The `removeRoom()` function at main.js:89-108 also swallows DB errors when marking matches as cancelled.

- **Exploit scenario:** During a MongoDB outage, match state changes are lost. If the server restarts, it reads from the stale DB state. Matches that were in progress appear as "lobby" status. Any wager settlements that were tracked in-memory are gone, with no way to reconstruct what happened.
- **Recommendation:** For financial operations (wager matches), await the persistRoom call and reject the action if persistence fails. Implement a write-ahead log for critical state changes that can be replayed on restart.

---

## Authentication External Dependencies <a id="authentication"></a>

### Finding EXT-13: atob() Usage Is Now Node.js-Compatible but Has Encoding Risks

- **Severity:** LOW
- **Location:** `server/middleware/auth.js:37`
- **Description:** The code uses `atob(signatureBase64)` to decode the base64 signature:
  ```javascript
  const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
  ```
  `atob()` was added to Node.js global scope in v16.0.0 (stable). Since the server runs Node v24.13.0, this works. However:

  1. `atob()` only handles Latin1 encoding. If the base64 input decodes to bytes > 0xFF, `charCodeAt()` will return multi-byte values that are then truncated when stored in a Uint8Array element (which is 0-255).
  2. Ed25519 signatures are 64 bytes, all in 0-255 range, so this is technically safe for valid signatures.
  3. `atob()` throws `DOMException` for invalid base64 input (characters outside the base64 alphabet). This is caught by the try-catch.
  4. The `Buffer.from(signatureBase64, 'base64')` approach would be more idiomatic Node.js.

- **Exploit scenario:** A client sends non-base64 characters in the signature field. `atob()` throws a `DOMException`. The catch block at line 52 returns `{ valid: false, reason: 'Verification error: ...' }`, leaking the internal error message to the caller. The error message includes the DOMException details which could aid in fingerprinting the server environment.
- **Recommendation:** Replace with `Buffer.from(signatureBase64, 'base64')` for idiomatic Node.js. Add explicit input validation: `if (typeof signatureBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(signatureBase64)) return { valid: false, reason: 'Invalid signature format' }`.

---

### Finding EXT-14: tweetnacl sign.detached.verify Can Throw on Malformed Input

- **Severity:** MEDIUM
- **Location:** `server/middleware/auth.js:41-45`
- **Description:** The `nacl.sign.detached.verify()` function expects:
  - `message`: Uint8Array
  - `signature`: Uint8Array of exactly 64 bytes
  - `publicKey`: Uint8Array of exactly 32 bytes

  If the decoded signature is not exactly 64 bytes (e.g., client sends a truncated base64 string), `nacl.sign.detached.verify()` will throw a `TypeError` or return false depending on the internal implementation. tweetnacl 1.0.3 performs length checks and throws if the signature length is not 64:

  ```javascript
  // tweetnacl internals: if sig.length !== 64, behavior is undefined
  ```

  The outer try-catch at line 52 catches this, but the error message is forwarded to the client in the reason field, potentially leaking implementation details.

  Additionally, if `signatureBase64` is a very long string (e.g., 10MB of base64), `atob()` will attempt to decode the entire thing into memory before the 64-byte check happens. This is a memory amplification vector.

- **Exploit scenario:** An attacker sends an `authenticate` event with `signature` set to a 10MB base64 string. `atob()` decodes it to ~7.5MB of binary data, then `Uint8Array.from()` creates another 7.5MB array. The resulting 64-byte mismatch causes `nacl.sign.detached.verify()` to throw, but 15MB of memory has already been allocated. At 1000 concurrent auth attempts, this consumes ~15GB.
- **Recommendation:** Validate signature length before decoding: `if (typeof signatureBase64 !== 'string' || signatureBase64.length > 200) return { valid: false, reason: 'Invalid signature' }`. Ed25519 signatures are 64 bytes = ~88 base64 characters, so 200 is generous.

---

### Finding EXT-15: JWT Secret Has Insecure Default Value

- **Severity:** HIGH
- **Location:** `server/middleware/auth.js:17`
- **Description:** The JWT secret defaults to the hardcoded string `'solshot-dev-secret-change-me'` when `JWT_SECRET` env var is not set:
  ```javascript
  const JWT_SECRET = process.env.JWT_SECRET || 'solshot-dev-secret-change-me';
  ```
  The .env.example file contains `JWT_SECRET=change-me-to-a-random-64-char-string`, but there is no validation that the default was changed. If the server runs without a .env file (which it does in no-DB mode), this default is active.

  With the default secret, any attacker can forge valid JWTs for any wallet address.

- **Exploit scenario:** An attacker crafts a JWT with `{ wallet: "victimWalletAddress" }` signed with `'solshot-dev-secret-change-me'`. If the server ever validates JWTs (it currently does not for socket events -- see EXT-16), this would grant full impersonation. Even without JWT validation, the `verifyToken()` function at auth.js:100-107 would return `{ valid: true }` for forged tokens.
- **Recommendation:** Refuse to start the server if `JWT_SECRET` equals the default or is shorter than 32 characters. Add a startup check: `if (JWT_SECRET.includes('change-me') || JWT_SECRET.length < 32) { throw new Error('JWT_SECRET must be configured'); }`.

---

### Finding EXT-16: JWT Is Generated But Never Validated on Subsequent Requests

- **Severity:** HIGH
- **Location:** `server/middleware/auth.js:86-92` (generateToken), `server/socket-io/main.js:170-177` (authenticate handler)
- **Description:** The authentication flow generates a JWT token and returns it to the client:
  ```javascript
  const token = generateToken(walletAddress);
  return { success: true, token, walletAddress };
  ```
  However, no subsequent socket event handler ever validates this token. The `verifyToken()` function exists at auth.js:100-107 but is never imported or called in main.js. Socket authentication is tracked via `client.walletAddress` and `client.isAuthenticated` properties set on the socket object, but these are never checked before processing events.

  Any socket can emit `createRoom` with a wager without ever authenticating. The `authenticatedWallets` map is populated on authenticate but only consulted as a fallback for wallet address lookup, not as a gate.

- **Exploit scenario:** An attacker connects a raw socket, never sends an `authenticate` event, and directly emits `createRoom` with `{player: {name: "attacker", color: 1, wager: 0.5, walletAddress: "any_address"}}`. The room is created with a 0.5 SOL wager and the arbitrary wallet address is stored in wagerStates. No signature verification occurs. The attacker can claim to be any wallet.
- **Recommendation:** Add authentication middleware to Socket.IO:
  ```javascript
  io.use((socket, next) => {
      // Require auth token on connection
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const result = verifyToken(token);
      if (!result.valid) return next(new Error('Invalid token'));
      socket.walletAddress = result.wallet;
      next();
  });
  ```
  For wagered events specifically, add a guard: `if (wagerAmount > 0 && !client.isAuthenticated)`.

---

### Finding EXT-17: No Replay Protection on Authentication Signatures

- **Severity:** MEDIUM
- **Location:** `server/middleware/auth.js:65-78` (verifyAuthMessage)
- **Description:** The auth message format is `"SolShot Auth: <wallet> at <timestamp>"` with a 5-minute validity window. There is no nonce or used-signature tracking. The same signature can be replayed unlimited times within the 5-minute window.

  The timestamp check at line 73 uses `age < -60000` to reject future timestamps, but allows up to 1 minute of clock skew in the future direction.

- **Exploit scenario:** An attacker intercepts a valid authentication signature (e.g., via XSS on the client, MITM on a non-HTTPS connection, or browser extension). They replay this signature from a different socket connection within 5 minutes to authenticate as the victim's wallet. Since the CORS is `origin: "*"` and there is no HTTPS enforcement, interception is feasible.
- **Recommendation:** Implement nonce tracking. Have the server issue a random nonce per authentication attempt, include it in the signed message, and track used nonces in a time-windowed set. Alternatively, use the socket.id as part of the signed message to bind the signature to a specific connection.

---

### Finding EXT-18: jsonwebtoken 9.0.3 -- No Known Critical CVEs, but Audit Considerations

- **Severity:** LOW
- **Location:** `server/package.json:19` (jsonwebtoken ^9.0.3)
- **Description:** jsonwebtoken 9.0.3 does not have published CVEs as of the audit date. Previous versions had CVE-2022-23529 (prototype pollution in key handling, fixed in 9.0.0) and CVE-2022-23539/23540/23541 (insecure key type validation, fixed in 9.0.0).

  However, the library configuration in this codebase uses only HS256 (default algorithm when no `algorithm` option is specified), which is appropriate. The `jwt.verify()` call at auth.js:102 does not restrict algorithms, meaning it would accept any algorithm the library supports if the token header specifies one:

  ```javascript
  const decoded = jwt.verify(token, JWT_SECRET);  // No algorithms restriction
  ```

  In jsonwebtoken 9.x, the `none` algorithm attack is mitigated by default, but best practice is to always specify `{ algorithms: ['HS256'] }`.

- **Exploit scenario:** Low risk with current jsonwebtoken 9.x. However, if a future library regression re-enables `none` algorithm acceptance, tokens could be forged without any secret. Additionally, if an RSA public key were ever used, the algorithm confusion attack (using HMAC with the RSA public key as secret) would apply since algorithms are not restricted.
- **Recommendation:** Specify algorithms explicitly: `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`. This is defense-in-depth.

---

## Socket.IO Layer <a id="socketio"></a>

### Finding EXT-19: No Rate Limiting on Socket Events -- Event Flooding DoS

- **Severity:** CRITICAL
- **Location:** `server/socket-io/main.js:158-1055` (all event handlers)
- **Description:** There is zero rate limiting on any socket event. A single client can emit thousands of events per second. Critical examples:
  - `authenticate`: Each call runs `nacl.sign.detached.verify()` (CPU-intensive Ed25519 verification). 10K/sec would saturate a CPU core.
  - `fire`: Each call runs full physics simulation (trajectory calculation with up to 3000 steps). 100/sec would consume significant CPU.
  - `createRoom`: Each call creates in-memory room objects and potentially a MongoDB document. 10K rooms would exhaust memory.
  - `joinRoom`: Each call makes an RPC call to Solana. At >40/sec, this would hit devnet rate limits.
  - `getRooms`: Each call sends the room list to the requester. 10K/sec = 10K JSON serializations/sec.
  - `buyWeapon`: Unlimited weapon purchases per frame.

  Socket.IO does not have built-in rate limiting.

- **Exploit scenario:** An attacker opens a single WebSocket connection and sends 10,000 `fire` events per second. Each triggers `processShot()` which allocates arrays of up to 3000 trajectory points. At 10K/sec, this creates ~10K * 3000 * 32 bytes = ~960MB of trajectory data per second, plus CPU saturation from physics calculations. The server becomes unresponsive within seconds.
- **Recommendation:** Implement per-socket rate limiting middleware:
  ```javascript
  const rateLimits = { fire: { max: 2, window: 1000 }, authenticate: { max: 3, window: 60000 }, createRoom: { max: 5, window: 60000 } };
  ```
  Use a token bucket or sliding window per socket.id per event type. Disconnect sockets that exceed limits.

---

### Finding EXT-20: CORS Wildcard on Socket.IO and Express Allows Any Origin

- **Severity:** HIGH
- **Location:** `server/index.js:16-19` (Socket.IO CORS), `server/index.js:22` (Express CORS)
- **Description:** Both the Socket.IO server and Express app use `origin: "*"` CORS configuration:
  ```javascript
  const io = new socket.Server(server, { cors: { origin: "*" } });
  app.use(cors());  // defaults to origin: "*"
  ```
  This allows any website to:
  1. Make XHR/fetch requests to the Express endpoints (/health, /stats)
  2. Open WebSocket connections to the Socket.IO server
  3. Read response data from the server

  Combined with the lack of authentication on socket events, any website can create rooms, join matches, and interact with the game server.

- **Exploit scenario:** An attacker creates a malicious website that silently connects to the SolShot server via Socket.IO. When a victim visits the page, JavaScript runs that authenticates with the victim's wallet (if the victim has a SolShot wallet extension), creates wagered matches, or joins existing matches on behalf of the victim. This is a form of Cross-Site WebSocket Hijacking (CSWSH).
- **Recommendation:** Restrict CORS to the actual client domain: `origin: ['https://solshot.gg', 'http://localhost:3000']`. For Socket.IO, also validate the Origin header in a middleware. In production, never use wildcard CORS.

---

## Express / HTTP Layer <a id="express-http"></a>

### Finding EXT-21: 30MB Body Parser Limit Enables Trivial DoS

- **Severity:** HIGH
- **Location:** `server/index.js:23-24`
- **Description:** The Express body parser is configured with a 30MB limit:
  ```javascript
  app.use(express.json({limit: "30mb", extended: true}))
  app.use(express.urlencoded({limit: "30mb", extended: true}))
  ```
  The server only has two HTTP routes (`/health` and `/stats`), neither of which accept POST requests with bodies. There are no API endpoints that need large payloads. The 30MB limit is likely a copy-paste from a different project.

  At 30MB per request, an attacker can consume significant memory. Express body-parser buffers the entire body in memory before parsing.

- **Exploit scenario:** An attacker sends 100 concurrent POST requests to any Express route, each with a 30MB JSON body. This forces the server to allocate 3GB of memory for buffering alone, plus memory for JSON parsing overhead. On a 1GB VPS, this immediately causes an out-of-memory crash. Even with larger servers, this is a trivial resource exhaustion attack requiring only a single machine.
- **Recommendation:** Reduce the body parser limit to 1MB or less (the server has no routes that need large bodies). Better yet, remove the body parser entirely since no routes accept POST data: `app.use(express.json({limit: "1kb"}))`. Add express-rate-limit middleware to cap requests per IP.

---

### Finding EXT-22: /stats Endpoint Exposes Financial Data Without Authentication

- **Severity:** MEDIUM
- **Location:** `server/index.js:34`, `server/services/monitoring.js:166-211`
- **Description:** The `/stats` endpoint returns detailed operational data including:
  - Total SOL wagered, settled, treasury fees, ops fees
  - Active connection count
  - Error messages (including recent 5 errors with timestamps and context)
  - Match completion rate
  - SHOT token emission/burn totals

  This endpoint has no authentication, no IP restriction, and is accessible from any origin due to the wildcard CORS.

- **Exploit scenario:** A competitor or attacker monitors `/stats` to track the platform's financial activity, user count, and error patterns. Error messages may contain internal paths, database errors, or other information useful for further attacks. The connection count reveals traffic patterns useful for timing DoS attacks.
- **Recommendation:** Add authentication to the `/stats` endpoint (API key, basic auth, or JWT). At minimum, add IP whitelisting. Remove or redact error messages from the public-facing response. Consider splitting into public health check and private admin stats.

---

## Unexpected Data Types from External Sources <a id="unexpected-data"></a>

Multiple socket event handlers destructure client payloads without type checking. When external services (RPC, MongoDB) return unexpected types, or when client payloads contain unexpected types, the following failures can occur:

| Source | Expected | Possible Actual | Impact |
|--------|----------|----------------|--------|
| `conn.getBalance()` (Solana RPC) | number (lamports) | null, undefined, NaN if RPC returns malformed JSON | Division by LAMPORTS_PER_SOL returns NaN, comparison `>= required` is false, fail-open |
| `Match.findByIdAndUpdate()` (MongoDB) | Document or null | Rejection if `_matchId` is corrupted | Error caught, logged, no state rollback |
| `joinRoom` payload `wager` | number | string "0.5", object, undefined | `isValidWager("0.5")` returns false (strict array includes), blocking join; but `undefined` gives `wagerAmount = 0`, bypassing wager for a wagered room |
| `fire` payload `angle/power` | number | string, NaN, Infinity | `calculateTrajectory()` computes with `NaN * Math.cos(NaN)` = NaN. The trajectory array contains `{x: NaN, y: NaN}`. Impact detection returns outOfBounds. No crash, but wrong behavior. |
| `fire` payload `weaponId` | number | string "0", object | `WEAPON_DATA["0"]` is undefined (keys are numbers). Returns early with no trajectory. |
| `createRoom` payload `player.wager` | number | negative number | `isValidWager(-1)` returns false, correctly blocked. But `player.wager = NaN` passes because `NaN > 0` is false, so `isValidWager` is never called, and `wagerStates[roomId].amount = NaN`. |
| `atob()` input | base64 string | non-string type | `atob(123)` converts to `atob("123")` implicitly. `atob({})` converts to `atob("[object Object]")` which is valid base64 but decodes to garbage bytes. nacl.verify then fails gracefully. |

---

## Findings Summary Table <a id="findings-table"></a>

| ID | Severity | Location | Title |
|----|----------|----------|-------|
| EXT-01 | HIGH | package.json:18 | Express 4.18.1 multiple high-severity CVEs (body-parser, qs, path-to-regexp) |
| EXT-02 | HIGH | package.json:22 | Socket.IO 4.5.1 parser and ws DoS vulnerabilities |
| EXT-03 | LOW | package.json:21 | nodemon in production dependencies |
| EXT-04 | **CRITICAL** | solana.js:80-102, main.js:306-317 | Fail-open balance verification on RPC error |
| EXT-05 | HIGH | solana.js:34-70, 84 | No retry/timeout/circuit breaker on Solana RPC |
| EXT-06 | MEDIUM | solana.js:83 | No type validation on wallet address before RPC call |
| EXT-07 | **CRITICAL** | solana.js:139-163 | Settlement stub returns success without moving SOL |
| EXT-08 | MEDIUM | solana.js:121-127 | Floating-point arithmetic for SOL amounts |
| EXT-09 | MEDIUM | solana.js:48-57 | Server keypair tilde expansion and memory persistence |
| EXT-10 | HIGH | index.js:39-59, main.js:13-15 | MongoDB failure silently degrades to in-memory mode |
| EXT-11 | LOW | main.js:387 | Potential NoSQL injection surface (currently mitigated) |
| EXT-12 | MEDIUM | main.js:56-86 | Fire-and-forget DB writes with silent failure |
| EXT-13 | LOW | auth.js:37 | atob() works but is non-idiomatic, minor encoding risk |
| EXT-14 | MEDIUM | auth.js:41-45 | tweetnacl verify memory amplification via large signature input |
| EXT-15 | HIGH | auth.js:17 | JWT secret has hardcoded insecure default |
| EXT-16 | HIGH | auth.js:86-92, main.js:170-177 | JWT generated but never validated; socket events unauthenticated |
| EXT-17 | MEDIUM | auth.js:65-78 | No nonce/replay protection on auth signatures |
| EXT-18 | LOW | package.json:19 | jsonwebtoken 9.0.3 missing algorithm restriction |
| EXT-19 | **CRITICAL** | main.js:158-1055 | No rate limiting on socket events; event flooding DoS |
| EXT-20 | HIGH | index.js:16-22 | CORS wildcard allows any origin |
| EXT-21 | HIGH | index.js:23-24 | 30MB body parser limit enables memory exhaustion DoS |
| EXT-22 | MEDIUM | index.js:34, monitoring.js:166-211 | /stats exposes financial data without auth |

---

## Recommendations Priority Matrix <a id="recommendations"></a>

### Immediate (Block deployment)

| Priority | Finding | Action |
|----------|---------|--------|
| P0 | EXT-19 | Implement socket event rate limiting |
| P0 | EXT-04 | Change balance check to fail-closed |
| P0 | EXT-07 | Disable wager creation until settlement is implemented, or label as simulated |
| P0 | EXT-16 | Add authentication checks before wagered match operations |
| P0 | EXT-15 | Enforce strong JWT_SECRET at startup |

### Before launch (Required for production)

| Priority | Finding | Action |
|----------|---------|--------|
| P1 | EXT-01 | Upgrade Express to >= 4.21.3 |
| P1 | EXT-02 | Upgrade Socket.IO to >= 4.7.5 |
| P1 | EXT-20 | Restrict CORS to actual client domain |
| P1 | EXT-21 | Reduce body parser limit to 1KB |
| P1 | EXT-10 | Require MongoDB for wagered match operations |
| P1 | EXT-05 | Add RPC timeout, retry, and circuit breaker |

### Before wagered matches go live

| Priority | Finding | Action |
|----------|---------|--------|
| P2 | EXT-08 | Use lamport integer arithmetic for settlement |
| P2 | EXT-12 | Await DB persistence for financial operations |
| P2 | EXT-17 | Add nonce-based replay protection |
| P2 | EXT-22 | Add auth to /stats endpoint |
| P2 | EXT-14 | Add input length validation before signature decoding |

### Technical debt (Improve quality)

| Priority | Finding | Action |
|----------|---------|--------|
| P3 | EXT-03 | Move nodemon to devDependencies |
| P3 | EXT-06 | Add type validation on wallet addresses |
| P3 | EXT-09 | Use path.resolve for keypair loading |
| P3 | EXT-11 | Add type checks on roomId |
| P3 | EXT-13 | Replace atob() with Buffer.from() |
| P3 | EXT-18 | Specify JWT algorithms explicitly |

---

## Appendix: npm audit Full Output

```
28 vulnerabilities (4 low, 7 moderate, 17 high)

High severity:
- body-parser <= 1.20.3 (GHSA-qwcr-r2fm-qrc7)
- qs <= 6.14.1 (GHSA-6rw7-vpxm-498p, GHSA-w7fw-mjwx-w883)
- path-to-regexp <= 0.1.11 (GHSA-9wv6-86v2-598j, GHSA-rhx6-c78j-4q9w)
- braces < 3.0.3 (GHSA-grv7-fg5c-xmjg)
- semver 2.0.0-5.7.1 (GHSA-c2qf-rxjj-qqgw)
- ws 8.0.0-8.17.0 (GHSA-3h5v-q93c-6h6q)

Moderate severity:
- socket.io-parser 4.0.4-4.2.2 (GHSA-cqmj-92xf-r6r9)
- got < 11.8.5 (GHSA-pfrx-2q88-qq97)
- cookie < 0.7.0 (GHSA-pxg6-pf52-xh8x)
- send < 0.19.0 (GHSA-m6fv-jmcg-4jfg)

Fix available: npm audit fix
```
