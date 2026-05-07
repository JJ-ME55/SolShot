# 08 -- Admin Functions & Upgrade Security Audit

**Auditor:** Claude Opus 4.6 (automated)
**Date:** 2026-02-14
**Scope:** All server source files -- admin/privileged operations, configuration exposure, endpoint auth, secrets management, error information leakage, dependency hygiene.
**Branch:** `dev`
**Risk model:** A malicious or curious external actor who can connect via socket.io or HTTP to the server.

---

## Executive Summary

The SolShot server has **no admin interface, no privileged socket events, no upgrade mechanism, and no runtime configuration mutation** -- which is good from a minimal-attack-surface perspective. However, this absence is offset by several **critical and high-severity issues**: unauthenticated financial data endpoints, a hardcoded JWT secret fallback, internal error detail leakage to clients, and a production dependency on a dev tool. The server also lacks every standard HTTP hardening middleware (rate limiting, Helmet, CSRF). Taken together, these create reconnaissance vectors that simplify targeted attacks and a credential weakness that could allow JWT forgery.

**Finding Count by Severity:**
- CRITICAL: 2
- HIGH: 5
- MEDIUM: 4
- LOW: 2
- INFORMATIONAL: 2

---

## Finding UA-01: `/stats` Endpoint Exposes Financial Data Without Authentication

| Field | Value |
|-------|-------|
| **Severity** | **CRITICAL** |
| **Location** | `server/index.js:34`, `server/services/monitoring.js:166-211` |
| **CWE** | CWE-306 (Missing Authentication for Critical Function) |

### Description

The `/stats` HTTP endpoint returns a comprehensive JSON payload containing:
- Total SOL wagered and settled (exact amounts to 4 decimal places)
- Treasury and operations fee totals
- Active connection count and peak connections
- Match completion rates
- Error count and the **last 5 error objects** (timestamp, message, context)
- SHOT token emission and burn totals
- Server start time and uptime

No authentication, no API key, no IP allowlist -- any HTTP client can `GET /stats`.

### Code

```js
// server/index.js:34
app.get('/stats', getStats)

// server/services/monitoring.js:166-211
export function getStats(req, res) {
    checkDayReset();
    const uptimeMs = Date.now() - startTime;
    res.json({
        server: { uptime: ..., startedAt: ... },
        connections: { total: ..., active: ..., peak: ... },
        matches: { created: ..., completed: ..., cancelled: ..., today: ..., completionRate: ... },
        sol: { totalWagered: ..., totalSettled: ..., treasuryFees: ..., opsFees: ..., forfeits: ... },
        // ...
        errors: { count: stats.errorCount, recent: stats.errors.slice(-5) },
    });
}
```

### Exploit Scenario

1. Attacker discovers `/stats` via simple path enumeration.
2. Attacker monitors SOL flow in real-time to estimate platform treasury size.
3. Error messages in `errors.recent` may contain stack traces, MongoDB query details, or RPC endpoint URLs that aid further attacks.
4. Active connection counts help time DDoS attacks for maximum disruption.
5. Financial data can be used in social engineering ("I see your treasury has collected X SOL...").

### Recommendation

1. **Immediate:** Add authentication middleware. Options (choose one):
   - Bearer token from env: `STATS_API_KEY`
   - Basic auth with env-configured credentials
   - IP allowlist for internal dashboards only
2. **Short-term:** Split into two endpoints:
   - `/health` -- public, minimal (status: ok, uptime)
   - `/stats` -- authenticated, full metrics
3. **Remove error details** from the stats response entirely. Errors should go to a logging backend (Datadog, Sentry), never to an HTTP endpoint.

---

## Finding UA-02: Hardcoded JWT Secret Fallback Enables Token Forgery

| Field | Value |
|-------|-------|
| **Severity** | **CRITICAL** |
| **Location** | `server/middleware/auth.js:17` |
| **CWE** | CWE-798 (Use of Hard-coded Credentials) |

### Description

The JWT secret has a hardcoded fallback value:

```js
const JWT_SECRET = process.env.JWT_SECRET || 'solshot-dev-secret-change-me';
```

If the `JWT_SECRET` environment variable is not set (which is the case in development, and potentially in a misconfigured production deploy), the server uses the literal string `'solshot-dev-secret-change-me'` as its signing key. This string is visible in the source code (which is in a public or team-accessible git repository).

### Exploit Scenario

1. Attacker reads the source code and finds the fallback secret.
2. Attacker crafts a valid JWT: `jwt.sign({ wallet: 'AttackerWalletAddress' }, 'solshot-dev-secret-change-me', { expiresIn: '24h' })`.
3. Attacker uses this JWT to authenticate as any wallet address.
4. Combined with the fact that JWTs are generated but **never validated on subsequent socket events** (Finding UA-03), the impact is amplified -- but if JWT validation is ever added, this secret fallback would be the bypass.

### Recommendation

1. **Immediate:** Remove the fallback entirely. The server should **refuse to start** if `JWT_SECRET` is not set:
   ```js
   const JWT_SECRET = process.env.JWT_SECRET;
   if (!JWT_SECRET) {
       console.error('FATAL: JWT_SECRET environment variable is required');
       process.exit(1);
   }
   ```
2. **Short-term:** Add a startup validation function that checks all required env vars before the server binds to a port.
3. **Operational:** Use a secrets manager (AWS Secrets Manager, Doppler, etc.) rather than `.env` files in production.

---

## Finding UA-03: JWT Generated But Never Validated on Subsequent Events

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/middleware/auth.js:86-92` (generation), `server/socket-io/main.js:170-177` (usage) |
| **CWE** | CWE-287 (Improper Authentication) |

### Description

The authentication flow generates a JWT and returns it to the client:

```js
// auth.js:131
const token = generateToken(walletAddress);
return { success: true, token, walletAddress };
```

However, **no subsequent socket event checks this token**. The `verifyToken()` function exists (auth.js:100-107) but is never called from `main.js`. Authentication state is stored only as `client.isAuthenticated = true` and `authenticatedWallets[client.id] = walletAddress` -- both set during the initial `authenticate` event and never re-verified.

This means:
- The JWT serves no actual security purpose.
- A client could skip the `authenticate` event entirely and still interact with most socket events.
- The socket events (`createRoom`, `joinRoom`, `fire`, etc.) do not check `client.isAuthenticated` as a precondition.

### Exploit Scenario

1. Attacker connects a raw socket.io client without authenticating.
2. Attacker creates rooms, joins matches, and fires shots with no wallet verification.
3. For wagered matches, the attacker can provide any string as `walletAddress` in the `createRoom` or `joinRoom` payload since there is no check that the wallet matches an authenticated session.

### Recommendation

1. Add middleware or a guard at the top of every financially-sensitive event (`createRoom` with wager, `joinRoom` with wager) that checks `client.isAuthenticated === true`.
2. Validate the JWT on reconnection to maintain session integrity.
3. Ensure that the `walletAddress` used in wager operations matches the authenticated wallet (`authenticatedWallets[client.id]`), not a user-supplied payload value.

---

## Finding UA-04: `/health` Endpoint Information Exposure

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/services/monitoring.js:148-160` |
| **CWE** | CWE-200 (Exposure of Sensitive Information) |

### Description

The `/health` endpoint returns:

```js
res.json({
    status: 'ok',
    uptime: `${uptimeHours}h`,
    uptimeMs,
    activeConnections: stats.activeConnections,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
});
```

While less severe than `/stats`, this still exposes:
- **Exact server uptime in milliseconds** -- reveals when the server was last restarted, useful for timing attacks after a known vulnerability disclosure.
- **Active connection count** -- aids capacity estimation and DDoS targeting.
- **Version number** -- enables targeted exploit searches.

### Recommendation

1. Health checks for load balancers should return only `{ status: 'ok' }` with a 200 status code.
2. Move detailed metrics behind the authenticated `/stats` endpoint.

---

## Finding UA-05: Settlement Error Messages Leak Internal Details to Clients

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/socket-io/main.js:825-826` |
| **CWE** | CWE-209 (Information Exposure Through Error Messages) |

### Description

When SOL settlement fails, the raw error message is sent to the client:

```js
} catch (err) {
    console.error('[Solana] Settlement error:', err.message)
    settlementInfo = { error: err.message, wager: ws.amount }
}
```

This `settlementInfo` object (including `err.message`) is then emitted to the room via `matchEnd`:

```js
io.sockets.in(client.roomId).emit('matchEnd', {
    // ...
    settlement: settlementInfo,
    // ...
})
```

Error messages from `@solana/web3.js` can contain:
- RPC endpoint URLs (revealing infrastructure)
- Transaction details and program IDs
- Internal account addresses
- Node.js stack trace fragments

### Exploit Scenario

1. Attacker deliberately triggers settlement failures (e.g., by providing malformed wallet addresses).
2. Error messages reveal the Solana RPC endpoint being used.
3. Attacker targets the RPC endpoint with rate limiting attacks or uses the information to identify the hosting provider.

### Recommendation

1. Replace raw error messages with generic client-facing codes:
   ```js
   settlementInfo = { error: 'SETTLEMENT_FAILED', code: 'E_SETTLE', wager: ws.amount }
   ```
2. Log the full error server-side for debugging.
3. Apply the same pattern to all other error responses sent to clients.

---

## Finding UA-06: Auth Error Messages Leak Verification Details

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/middleware/auth.js:53`, `server/middleware/auth.js:105` |
| **CWE** | CWE-209 (Information Exposure Through Error Messages) |

### Description

Two locations return raw error messages to the client:

```js
// auth.js:53 -- signature verification
return { valid: false, reason: `Verification error: ${err.message}` };

// auth.js:105 -- JWT verification
return { valid: false, reason: err.message };
```

The `err.message` from `tweetnacl` or `jsonwebtoken` can reveal:
- Whether the error was a decoding failure vs. a signature mismatch (allows probing valid vs. invalid formats)
- JWT-specific errors like `"jwt malformed"`, `"jwt expired"`, `"invalid signature"` which confirm the auth mechanism in use
- Stack trace information in certain edge cases

### Recommendation

1. Return generic error messages: `{ valid: false, reason: 'Authentication failed' }`.
2. Log detailed errors server-side with the client's socket ID for correlation.

---

## Finding UA-07: No Admin Socket Events -- But Also No Admin Controls At All

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** (operational risk) |
| **Location** | `server/socket-io/main.js` (entire file) |
| **CWE** | CWE-778 (Insufficient Logging) |

### Description

The server has **zero admin/privileged socket events**. There is:
- No way to kick a player
- No way to ban a wallet
- No way to pause matching or disable wagers
- No way to force-settle a stuck match
- No way to clear rooms or reset state
- No way to adjust wager tiers without redeploying
- No way to view or manage active rooms from an admin panel

While the absence of admin events eliminates an attack vector, it creates a critical operational gap. If a player exploits a bug to lock up funds or stall matches, the only recourse is to restart the server (losing all in-memory state including active wagers).

### Assessment

This is rated HIGH because:
1. All game state is in-memory (`rooms`, `matchStates`, `goldStates`, `wagerStates`, `weaponInventories`, `shopTimers`, `shopReady`, `authenticatedWallets` -- 8 separate in-memory stores at `main.js:19-40`).
2. A server restart wipes all active match and wager state.
3. There is no reconciliation mechanism to recover in-flight wagers after a restart.

### Recommendation

1. **Phase 1:** Add admin endpoints behind strong auth (API key + IP allowlist):
   - `POST /admin/kick` -- disconnect a socket
   - `POST /admin/pause-wagers` -- disable new wagered matches
   - `POST /admin/force-settle/:roomId` -- manually settle a stuck match
   - `GET /admin/rooms` -- list active rooms with state
2. **Phase 2:** Persist wager state to the database so it survives restarts.
3. **Phase 3:** Add a reconciliation job that checks for orphaned wagers on startup.

---

## Finding UA-08: `nodemon` in Production Dependencies

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/package.json:22` |
| **CWE** | CWE-1104 (Use of Unmaintained Third-Party Components) |

### Description

```json
"dependencies": {
    // ...
    "nodemon": "^1.3.3",
    // ...
}
```

Issues:
1. **nodemon is a development tool** that watches files and restarts the process. It should never be in production dependencies.
2. **Version `^1.3.3` is ancient** (released circa 2015). The current version is 3.x. This old version pulls in a long dependency tree with known vulnerabilities.
3. nodemon watches the filesystem and can trigger restarts on file changes. If an attacker can write files to the server directory (e.g., via a path traversal elsewhere), they could cause repeated server restarts.
4. In production (Heroku via `Procfile: web: npm start`), nodemon is installed but not used -- `npm start` runs `node index.js` directly. This means it only wastes disk space and increases the attack surface of the dependency tree.

### Recommendation

1. Move nodemon to `devDependencies`:
   ```json
   "devDependencies": {
       "nodemon": "^3.1.0",
       "socket.io-client": "^4.8.3"
   }
   ```
2. Remove it from `dependencies`.
3. Update to version 3.x if keeping it at all.

---

## Finding UA-09: No Runtime Configuration Mutation -- Confirmed Safe

| Field | Value |
|-------|-------|
| **Severity** | **INFORMATIONAL** |
| **Location** | All server source files |

### Description

Grep for `process.env.X = `, `fs.writeFile`, `config =`, and dynamic `require`/`import` patterns returned zero results across all server source files. Configuration is loaded once at startup via `dotenv.config()` and environment variable reads, and is never mutated thereafter.

The following configuration values are read at startup and remain constant:
- `PORT` (index.js:11)
- `MONGODB_URI` (index.js:37)
- `SOLANA_RPC` (solana.js:22)
- `TREASURY_WALLET` (solana.js:23)
- `OPS_WALLET` (solana.js:24)
- `SOLANA_KEYPAIR_PATH` (solana.js:48)
- `JWT_SECRET` (auth.js:17)
- `SHOT_TOKEN_MINT` (shot-token.js:38, raydium.js:23)

**This is positive.** No socket event or HTTP endpoint can modify server configuration at runtime.

### Assessment

No action needed. This is a finding of correct behavior.

---

## Finding UA-10: MongoDB Connection String Exposure Vectors

| Field | Value |
|-------|-------|
| **Severity** | **MEDIUM** |
| **Location** | `server/.env.example:6`, `server/index.js:37-53` |
| **CWE** | CWE-522 (Insufficiently Protected Credentials) |

### Description

The `.env.example` file contains a template MongoDB URI with username/password placeholders:

```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/solshot?retryWrites=true&w=majority
```

While `.env` is properly gitignored (both `server/.gitignore` and root `.gitignore` exclude it), there are exposure vectors:

1. **Error logging at startup:** If MongoDB connection fails, `err.message` is logged to `console.error`. Depending on the error type, this could contain the connection string (including credentials) in plain text:
   ```js
   // index.js:47-48
   .catch((err) => {
       console.error('MongoDB connection error:', err.message);
   ```
   In cloud deployments (Heroku, Railway), `console.error` output goes to log aggregation services that may have broader access controls than the server itself.

2. **No validation of URI format:** If `MONGODB_URI` is set to a malformed value, the error message from `mongoose.connect()` may echo back the full URI.

3. **The Solana keypair path** (`SOLANA_KEYPAIR_PATH`) points to a local file containing a private key. If this path is misconfigured, the error message (`'No server keypair loaded: <err.message>'`) could reveal the filesystem path structure.

### Recommendation

1. Wrap MongoDB connection errors to strip credentials:
   ```js
   .catch((err) => {
       console.error('MongoDB connection failed. Check MONGODB_URI.');
       // Log sanitized error without connection string
   });
   ```
2. Add startup validation that checks `MONGODB_URI` format before attempting connection.
3. Use MongoDB connection options that disable URI echoing in errors.

---

## Finding UA-11: `deleteRoom` Has No Host-Only Check

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/socket-io/main.js:274-284` |
| **CWE** | CWE-862 (Missing Authorization) |

### Description

The `deleteRoom` event allows any player in a room to delete it:

```js
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        client.leave(client.roomId)
        await removeRoom(client.roomId)
        io.sockets.in(client.roomId).emit('opponentLeft', {})
        io.emit('setRooms', {rooms: getOpenRooms()})
        io.socketsLeave(client.roomId);
        client.roomId = null
        client.isHost = false
    }
})
```

The only check is `client.roomId !== null`. There is no verification that `client.isHost === true`. A non-host player can delete a room they joined, and `removeRoom()` will:
1. Wipe all in-memory state for that room
2. Mark the match as "cancelled" in the database
3. **Delete the wager state** without triggering any refund

### Exploit Scenario

1. Player A creates a wagered room (0.5 SOL).
2. Player B joins the room.
3. Player B immediately emits `deleteRoom`.
4. Room is destroyed, wager state is deleted, no settlement or refund occurs.
5. Player A loses their wager commitment with no recourse.

### Recommendation

1. Add host-only check: `if (client.roomId !== null && client.isHost === true)`.
2. Alternatively, remove the `deleteRoom` event entirely and use `leaveRoom` for both host and guest (which already handles forfeit logic).
3. If `deleteRoom` is kept, it should trigger refund logic for any active wagers.

---

## Finding UA-12: No Server Management/Restart Capabilities Exposed -- Confirmed Safe

| Field | Value |
|-------|-------|
| **Severity** | **INFORMATIONAL** |
| **Location** | All server source files |

### Description

Grep for `process.exit`, `child_process`, `exec`, `eval`, `restart`, `shutdown`, `reboot`, and `kill` across all server source files returned only:
- `process.exit` in `tests/integration.test.js:770` (test file, not production code)

There are no:
- Socket events that can restart/stop the server
- HTTP endpoints that trigger process management
- Signal handlers that respond to external commands
- Dynamic code evaluation (`eval`, `Function()`, `vm.runInContext`)
- Child process spawning

**This is positive.** No external actor can restart, stop, or execute arbitrary code on the server through the application layer.

---

## Finding UA-13: CORS Wildcard on Both Express and Socket.IO

| Field | Value |
|-------|-------|
| **Severity** | **HIGH** |
| **Location** | `server/index.js:17`, `server/index.js:22` |
| **CWE** | CWE-942 (Overly Permissive Cross-Origin Resource Sharing) |

### Description

Both the Socket.IO server and Express app use wildcard CORS:

```js
// Socket.IO
const io = new socket.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

// Express
app.use(cors())  // defaults to origin: "*"
```

This means:
- Any website on the internet can make requests to `/stats` and `/health` and read the responses.
- Any website can establish a Socket.IO connection and interact with the game server.
- A malicious site could embed a script that connects to SolShot and performs actions using the visitor's network context.

### Recommendation

1. Set CORS to the actual frontend origin(s):
   ```js
   const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
   ```
2. Apply the same origin list to both Express and Socket.IO.

---

## Finding UA-14: No HTTP Security Headers (Helmet)

| Field | Value |
|-------|-------|
| **Severity** | **LOW** |
| **Location** | `server/index.js` (absent) |
| **CWE** | CWE-693 (Protection Mechanism Failure) |

### Description

The server does not use `helmet` or any equivalent middleware for security headers. The Express responses lack:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`
- `X-XSS-Protection`

While this is less critical for an API/WebSocket server than for a site serving HTML, the `/stats` and `/health` endpoints do serve JSON that could be rendered in a browser context.

### Recommendation

```js
import helmet from 'helmet';
app.use(helmet());
```

---

## Finding UA-15: No Rate Limiting on HTTP Endpoints or Socket Events

| Field | Value |
|-------|-------|
| **Severity** | **LOW** |
| **Location** | `server/index.js` (absent), `server/socket-io/main.js` (absent) |
| **CWE** | CWE-770 (Allocation of Resources Without Limits) |

### Description

There is no rate limiting on:
- HTTP endpoints (`/`, `/health`, `/stats`) -- can be hit thousands of times per second
- Socket.IO connection rate -- unlimited connections per IP
- Socket events (`createRoom`, `fire`, `authenticate`, etc.) -- no per-socket or per-IP throttling

The `authenticate` event is particularly concerning as it invokes `nacl.sign.detached.verify()` which is CPU-intensive. An attacker could flood the server with `authenticate` events to cause CPU exhaustion.

### Recommendation

1. Add `express-rate-limit` for HTTP endpoints.
2. Add socket.io-level rate limiting (e.g., `socket.io-ratelimiter` or custom middleware).
3. Prioritize rate limiting on `authenticate` and `createRoom` events.

---

## Summary Table

| ID | Severity | Location | Finding |
|----|----------|----------|---------|
| UA-01 | CRITICAL | index.js:34, monitoring.js:166-211 | `/stats` exposes financial data, errors, and server metrics with no auth |
| UA-02 | CRITICAL | auth.js:17 | JWT secret has hardcoded fallback `'solshot-dev-secret-change-me'` |
| UA-03 | HIGH | auth.js:86-92, main.js:170-177 | JWT generated but never validated on subsequent socket events |
| UA-04 | MEDIUM | monitoring.js:148-160 | `/health` leaks uptime, connection count, and version |
| UA-05 | HIGH | main.js:825-826 | Settlement errors send raw `err.message` to clients |
| UA-06 | MEDIUM | auth.js:53, auth.js:105 | Auth errors leak verification internals to clients |
| UA-07 | HIGH | main.js:19-40 (8 in-memory stores) | No admin controls exist; no way to manage state, kick players, or pause wagers |
| UA-08 | MEDIUM | package.json:22 | `nodemon@^1.3.3` in production dependencies (should be devDep) |
| UA-09 | INFO | All files | No runtime config mutation -- confirmed safe |
| UA-10 | MEDIUM | index.js:47-48, .env.example:6 | MongoDB connection errors may log credentials; keypair path leaks filesystem |
| UA-11 | HIGH | main.js:274-284 | `deleteRoom` has no host-only check; any player can delete room and wipe wager state |
| UA-12 | INFO | All files | No server restart/management capabilities exposed -- confirmed safe |
| UA-13 | HIGH | index.js:17, index.js:22 | CORS wildcard `*` on both Express and Socket.IO |
| UA-14 | LOW | index.js (absent) | No security headers (Helmet not installed) |
| UA-15 | LOW | index.js, main.js (absent) | No rate limiting on HTTP endpoints or socket events |

---

## Recommended Priority Actions

### Immediate (before any production deploy with real SOL)

1. **UA-02:** Remove JWT secret fallback; require `JWT_SECRET` env var at startup
2. **UA-01:** Add authentication to `/stats`; remove error details from response
3. **UA-11:** Add `client.isHost` check to `deleteRoom` or remove the event
4. **UA-05:** Replace raw error messages with generic codes in all client-facing emissions

### Short-term (next sprint)

5. **UA-03:** Add JWT/auth validation to wagered socket events
6. **UA-13:** Configure CORS with explicit allowed origins
7. **UA-08:** Move `nodemon` to `devDependencies`, update to v3.x
8. **UA-07:** Design and implement basic admin endpoints behind strong auth

### Medium-term (before mainnet wagers)

9. **UA-15:** Add rate limiting to HTTP and socket.io layers
10. **UA-14:** Install and configure Helmet
11. **UA-10:** Sanitize MongoDB connection error logging
12. **UA-07 Phase 2:** Persist wager state to database for crash recovery
