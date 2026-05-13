---
task_id: db-phase1-data-04
provides: [data-04-findings, data-04-invariants]
focus_area: DATA-04
files_analyzed:
  - server/index.js
  - server/services/logger.js
  - server/services/monitoring.js
  - server/services/privyAuth.js
  - server/services/bot.js
  - server/services/keys.js
  - server/services/walletLinkTokens.js
  - server/services/escrow.js
  - server/services/shot-token.js
  - server/socket-io/main.js
  - server/middleware/auth.js
  - client/src/lib/debugLog.js
  - client/src/components/DebugAuthOverlay.js
  - client/src/wallet/WalletContext.js
  - client/.env.production
finding_count: 11
severity_breakdown: {critical: 1, high: 4, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# DATA-04: Logging & Information Disclosure — Condensed Summary

## Key Findings (Top 10)

- **Unauthenticated `clientDebugLog` socket event**: Any connected socket can inject arbitrary structured data into server logs — no auth check before logging — `server/socket-io/main.js:1356-1370`
- **`debugLog.js` always calls `console.log` unconditionally**: Even with the debug flag OFF, every `debugLog(label, data)` call emits to the browser console, potentially capturing sensitive payloads visible in DevTools — `client/src/lib/debugLog.js:47`
- **`DebugAuthOverlay` ships in the production bundle, activated by `?debug=1`**: The overlay exposes wallet address (truncated), `isAuthenticated` status, SOL balance, and internal auth flags to any user who appends `?debug=1` to the URL — `client/src/components/DebugAuthOverlay.js` + `client/src/App.js:327`
- **`err.message` returned to client in HTTP response at `/api/admin/truncate-handles`**: Stack-trace-free but potentially reveals DB/ORM error details to authenticated admin callers — `server/index.js:259`
- **`equipCosmeticResult` socket event returns `err.message` directly to client**: DB or validation error text propagated verbatim to the browser — `server/socket-io/main.js:3105`
- **Pino `logger` only used at ~6 call sites; all other logging is raw `console.log/warn/error`**: No redaction, no structured format, no level filtering on the ~200+ `console.*` calls across server code — `server/socket-io/main.js`, `server/services/*`
- **`clientDebugLog` logs TG user ID + wallet prefix in plaintext**: The log format `[client tg=<tgId> w=<wallet6>]` links a numeric Telegram user ID to a wallet prefix in Render's persistent log stream — `server/socket-io/main.js:1368`
- **Multi-socket audit log emits raw TG user ID**: `[multi-socket] TG user <tgId> now has N concurrent sockets` — logs numeric Telegram ID in plaintext — `server/socket-io/main.js:1124`
- **Escrow init logs public wallet addresses for TREASURY and OPS**: On boot, both wallet addresses are written to logs — `server/services/escrow.js:89-90`
- **`/teststats` Telegram bot command ships in production with no auth gate**: Discloses that the bot supports a debug preview command; reveals server rendering capabilities to any Telegram user — `server/services/bot.js:352`
- **`/health` endpoint exposes `activeConnections` count unauthenticated**: Minor operational disclosure to unauthenticated callers — `server/services/monitoring.js:152-160`

## Critical Mechanisms

- **Pino logger (`server/services/logger.js`)**: `level: process.env.LOG_LEVEL || 'info'`. Redact list covers wallet address variants. `pino-pretty` in dev, raw JSON in prod. Only imported in ~6 places. All other logging uses raw `console.*`.
- **`clientDebugLog` handler (`server/socket-io/main.js:1356`)**: Receives `{ label, data }` from any connected socket (no `requireAuth` guard). Truncates label to 200 chars and JSON.stringify `data` to 2000 chars. Logs with format `[client tg=<id> w=<prefix>] <label> <data>`.
- **`debugLog.js` (`client/src/lib/debugLog.js`)**: `isDebugEnabled()` checks `?debug=1` URL param OR `localStorage.solshot_debug=1`. Always `console.log`s regardless. Only emits socket event when debug flag is on AND `window.socket` is connected.
- **`DebugAuthOverlay` (`client/src/components/DebugAuthOverlay.js`)**: Always included in production bundle (unconditional import in `App.js`). Activated by `?debug=1` URL or `localStorage.solshotDebug=1`. Shows wallet address (6 char prefix + 4 char suffix), `isAuthenticated`, `connected`, SOL balance, and internal debug object.
- **`/stats` endpoint (`server/services/monitoring.js:166`)**: Returns aggregate SOL amounts, error counts, and the last 5 error objects (message + context). Gated by `requireAdminKey` middleware.
- **`/health` endpoint (`server/services/monitoring.js:148`)**: Returns status, uptime, `activeConnections` count, timestamp. Unauthenticated.

## Invariants & Assumptions

- INVARIANT: `clientDebugLog` payloads are capped at `label.slice(0,200)` + `JSON.stringify(data).slice(0,2000)` — enforced at `server/socket-io/main.js:1361-1364` ⚠ PARTIALLY ENFORCED — size is capped but content is unfiltered; attacker can inject ANSI escape sequences or structured noise into Render logs
- INVARIANT: Pino redacts wallet address fields — enforced at `server/services/logger.js:5-19` / NOT ENFORCED for `console.*` call sites (the vast majority of logging)
- INVARIANT: Source maps not served in production — enforced via `client/.env.production:2` (`GENERATE_SOURCEMAP=false`) ENFORCED at build time; not enforced at runtime (requires build-process discipline)
- ASSUMPTION: `?debug=1` is only used by developers, not real users — UNVALIDATED: the URL parameter is publicly documentable and no rate-limiting or authentication prevents its use in production
- ASSUMPTION: `DebugAuthOverlay` does not expose secrets — PARTIALLY VALIDATED: wallet address is truncated, no private key shown; however SOL balance, auth state, and `privyWalletsReady` flag are live data
- ASSUMPTION: `debugLog` client→server forwarding does not forward sensitive data — UNVALIDATED: callers pass arbitrary `data` objects; no allowlist of safe fields exists; a caller could inadvertently pass a token or private key through the data param

## Risk Observations (Prioritized)

1. **`clientDebugLog` unauthenticated log injection**: `server/socket-io/main.js:1356` — Any socket (pre-auth) can flood Render logs with attacker-controlled content (ANSI injection, noise, structured fake entries). Correlates TG ID with wallet prefix in server logs, which if forwarded to a log aggregator constitutes PII linkage across identity systems.
2. **`DebugAuthOverlay` always bundled + live-data exposure**: `client/src/App.js:327`, `client/src/components/DebugAuthOverlay.js` — Activated by any user via URL param in production. Shows real-time SOL balance, auth state, and wallet address fragment. The `debug` object passed from WalletContext includes `privyWalletsReady` and `privyHasWallet` flags revealing internal state.
3. **Inconsistent logging policy — `console.*` vs Pino**: ~200 raw `console.*` calls in `server/socket-io/main.js` + services bypass Pino's redaction rules entirely. If Render forwards stdout to a third-party log aggregator, wallet-linked data in unredacted `console.*` calls would be exposed without consent.
4. **`err.message` leaked to client via socket events**: `server/socket-io/main.js:3105` (`equipCosmeticResult`) sends internal error messages to clients. If the DB throws a mongoose validation error, the message may contain field names or document details.
5. **TG user ID + wallet prefix linkage in logs**: `server/socket-io/main.js:1124` and `:1368` — Logs numeric TG user ID in plaintext. Combined with the wallet prefix in `clientDebugLog`, this creates a linkable identity record in Render's log stream.
6. **`/teststats` Telegram command unprotected in prod**: `server/services/bot.js:352` — No `NODE_ENV` guard, no admin check. Minor operational disclosure; confirms debug infrastructure is present.
7. **Escrow authority public key logged on every boot**: `server/services/keys.js:67` — Logs the full `HPy...` base58 pubkey on every boot; acceptable since this is a public on-chain authority, but confirms the server keypair identity to log-stream readers.
8. **`/health` unauthenticated with `activeConnections`**: `server/services/monitoring.js:152-160` — Reveals real-time connection count without authentication. Minor business intelligence disclosure.

## Novel Attack Surface

- **Log injection via `clientDebugLog`**: Since this handler accepts unauthenticated input and writes to a potentially indexed log stream, an attacker could inject crafted entries mimicking legitimate `[Auth]`, `[Escrow]`, or `[Settlement]` log lines. This could confuse incident response, cause false-positive alerts, or inject ANSI escape sequences that corrupt terminal rendering.
- **`debugLog.js` unconditional `console.log` as data exfiltration path**: The `debugLog` helper always console.logs regardless of the debug flag. If a developer inadvertently passes a private key, JWT, or Privy session token as the `data` argument, it appears in DevTools even in production sessions without any debug flag.

## Cross-Focus Handoffs

- → **SEC-02 (Secret & Credential Management)**: The `privyAuth.js` comment hardcodes `PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm` as a code comment (line 21) — verify whether this is intentional documentation or an accidental disclosure of an app-level identifier. Also verify whether `PRIVY_APP_SECRET` ever appears in logs.
- → **AUTH-03 (Authorization)**: The `clientDebugLog` handler at `main.js:1356` has no `requireAuth` guard. Confirm whether requiring auth on this handler would break existing debug workflows, or whether it should be auth-gated to prevent unauthenticated log injection.
- → **API-03 (WebSocket)**: The `clientDebugLog` event is an unauthenticated socket vector for log injection and PII correlation. Cross-reference with unauthenticated event audit from API-03.

## Trust Boundaries

The server logging stack is split across two paradigms: Pino (structured, with redaction) imported in `server/services/logger.js` and used at approximately 6 call sites, and raw `console.*` used at approximately 200+ call sites throughout `main.js` and all service files. This means Pino's wallet-address redaction rules are effectively inoperative for the vast majority of server logs. The client `debugLog` utility unconditionally emits to the browser console regardless of debug flag, and conditionally forwards structured payloads to the server via an unauthenticated socket event. The `DebugAuthOverlay` component ships in the production React bundle and is activated by a URL parameter that any user can append. These three mechanisms together create a logging architecture where sensitive operational data (TG IDs, wallet prefixes, SOL balances, auth state) is observable by determined users and logged in ways that bypass declared redaction policies.
<!-- CONDENSED_SUMMARY_END -->

---

# DATA-04: Logging & Information Disclosure — Full Analysis

## Executive Summary

The SolShot server has a Pino structured logger defined in `server/services/logger.js` with a redact list for wallet address fields. However, this logger is imported and used at only ~6 call sites across the entire server. The remaining ~200+ log statements throughout `server/socket-io/main.js` and all service files use raw `console.log`, `console.warn`, and `console.error` calls that bypass Pino's redaction policy entirely.

The client-side `debugLog.js` helper unconditionally calls `console.log` on every invocation regardless of the debug flag. When the debug flag is active (`?debug=1` URL param or `localStorage.solshot_debug=1`), it additionally forwards structured payloads to the server via a `clientDebugLog` socket event. That server handler is registered on every socket connection **without an authentication check**, meaning any connected socket — including unauthenticated clients — can inject attacker-controlled log entries into Render's persistent log stream.

The `DebugAuthOverlay` React component is unconditionally imported into `App.js` (line 327) and ships in the production bundle. Activated by `?debug=1`, it renders live wallet address fragments, SOL balance, `isAuthenticated` status, and internal Privy wallet state flags. This is available to any user who appends the URL parameter in production.

Production source maps are correctly disabled via `GENERATE_SOURCEMAP=false` in `client/.env.production`. The `/stats` endpoint is properly admin-gated. The `/health` endpoint exposes `activeConnections` count without authentication.

## Scope

- Server logger configuration and usage patterns
- All `console.*` call sites across server code
- `clientDebugLog` socket event handler
- Client-side `debugLog.js` utility and `DebugAuthOverlay` component
- Monitoring endpoints (`/health`, `/stats`)
- Error message propagation to client responses
- Telegram bot debug commands
- Source map configuration
- PII linkage in log entries (TG ID + wallet address co-occurrence)

## Key Mechanisms

### 1. Pino Logger (`server/services/logger.js`)

```js
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: ['walletAddress', 'wallet', 'winner', 'loser', 'player', 'p1wallet', 'p2wallet',
                'winnerAddress', 'loserAddress', '*.walletAddress', '*.wallet'],
        censor: '[REDACTED]',
    },
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});
```

- Redaction list covers 10 field patterns. Correct for structured log objects.
- Only used at ~6 call sites: `main.js` auth (line 1249), prestige burn (line 3315), stats persist (lines 4268, 4279); `escrow.js` settle (line 417); `escrow-v2.js` settle (line 324); `shot-token.js` player state load (line 189) and prestige burn (line 416); `solana.js` settlement (lines 209, 222, 256).
- Not used in: ALL error handling in `index.js`, the entire `main.js` match lifecycle (fire, join, queue, forfeit, cosmetics, identity), `bot.js`, `keys.js`, `privyAuth.js`, `monitoring.js`.

### 2. `clientDebugLog` Socket Handler (`server/socket-io/main.js:1356`)

```js
client.on('clientDebugLog', (payload = {}) => {
    try {
        const tg = client.telegramUser?.id || 'anon';
        const wallet = authenticatedWallets[client.id];
        const w = wallet ? wallet.slice(0, 6) : '?';
        const label = String(payload.label || '').slice(0, 200);
        let dataStr = '';
        try {
            dataStr = JSON.stringify(payload.data || {}).slice(0, 2000);
        } catch (_) {
            dataStr = '<unstringifiable>';
        }
        console.log(`[client tg=${tg} w=${w}] ${label} ${dataStr}`);
    } catch (_) { /* never let a debug log crash the connection */ }
});
```

**No authentication check precedes this handler.** It is registered inside the socket `connection` callback but outside any auth gate. Any socket that connects — before calling `authenticate` — can emit `clientDebugLog` events. Consequences:

1. **Log injection**: Attacker-controlled `label` and `data` are written directly to Render's stdout. With the format `[client tg=anon w=?]`, the log entry looks legitimate. An attacker could craft entries mimicking `[Auth]`, `[Escrow]`, or `[Settlement]` formats (the format is `[client ...]`, not those, so mimicry is limited to the client tag, but the DATA portion is fully attacker-controlled).
2. **PII linkage**: For authenticated sockets, the handler logs TG user ID and wallet prefix on the same line. Even for attacker-injected payloads, the tag includes the socket's actual TG id and wallet prefix, so the attacker's send is associated with their own identity — not particularly useful for an attacker, but confirms PII is being logged.
3. **Throughput**: No rate limit on `clientDebugLog`. An attacker can flood the handler with 2KB payloads at socket message rate, degrading log readability and potentially causing log sink rate-limit issues.

### 3. `debugLog.js` Client Utility (`client/src/lib/debugLog.js:45-62`)

```js
export function debugLog(label, data) {
    // Always log to console — useful even outside debug mode
    try { console.log(label, data); } catch (_) {}

    // Ship to server only when debug enabled
    if (!isDebugEnabled()) return;
    ...
}
```

The comment says "always log to console — useful even outside debug mode." This means that every `debugLog(label, data)` call in the codebase emits to the browser console **even in production sessions without debug mode**. If a caller passes sensitive data (e.g., an auth token, Privy session details, burn transaction details), it appears in browser DevTools for any user inspecting the console.

The server forwarding only happens when debug-enabled AND `window.socket.connected`, which is a correct gate for the server side. But the console emission is unconditional.

### 4. `DebugAuthOverlay` Component (`client/src/components/DebugAuthOverlay.js`)

**Activated by**: `?debug=1` URL param OR `localStorage.setItem('solshotDebug','1')`.

**Always included**: `App.js:327` unconditionally renders `<DebugAuthOverlay />`. The component tree-shakes into the production bundle regardless.

**Data exposed**:
- `wallet?.walletAddress` — truncated to `[0:6]…[last 4]` (e.g., `HPyVPj…ovk`)
- `wallet?.isAuthenticated` — live boolean
- `wallet?.connected` — live boolean
- `wallet?.balance` — live SOL balance to 4 decimal places
- `debug.hasPublicKey` — boolean
- `debug.lastError` — last wallet error string

The `debug` object is constructed from WalletContext context value (`client/src/wallet/WalletContext.js:927-937`) and includes `privyReady`, `privyAuthed`, `privyWalletsReady`, and `privyHasWallet` — internal Privy SDK state flags.

Severity: Any user who navigates to `https://solshot.gg/?debug=1` after logging in will see their own live auth state. This is not a cross-user exposure — it shows the requesting user's own data. However, the exposure of SOL balance, authentication state, and Privy readiness flags in a publicly-activatable UI element is a non-trivial information disclosure in a financial application.

Note: `DebugAuthOverlay` uses its own localStorage key `'solshotDebug'` while `debugLog.js` uses `'solshot_debug'` — these are different keys with different naming conventions (camelCase vs snake_case). A developer setting one will not activate the other.

### 5. Error Message Propagation to Clients

**HTTP endpoint — `server/index.js:259`**:
```js
res.status(500).json({ ok: false, error: err.message });
```
On the `POST /api/admin/truncate-handles` endpoint (admin-only), the raw `err.message` from Mongoose or any thrown error is returned in the 500 response body. For admin users this is intentional diagnostic tooling, but if the error message includes internal schema details or connection strings, it could leak information.

**Socket event — `server/socket-io/main.js:3105`**:
```js
client.emit('equipCosmeticResult', { success: false, error: err.message });
```
The `equipCosmetic` handler (which any authenticated user can invoke) returns `err.message` to the client on failure. Mongoose validation errors, CastErrors, or network errors from a MongoDB operation would include field names and schema structure.

Most other error responses in `main.js` return generic strings (e.g., `'Burn verification error'`) rather than `err.message`, so the cosmetic endpoint is the primary client-facing leakage path.

### 6. Monitoring Endpoints

**`GET /health`** (unauthenticated):
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
Exposes: server version string (`'1.0.0'`), uptime, real-time connection count. These reveal operational state to unauthenticated callers. The `activeConnections` count is competitive intelligence (how many players online) and could inform timing of attacks.

**`GET /stats`** (admin-gated via `requireAdminKey`):
Returns the last 5 errors including `message` and `context` fields. Admin-gated, appropriate.

### 7. Telegram Bot — `/teststats` Command

`server/services/bot.js:352` registers a `/teststats` command that renders sample career card PNGs. The comment says "Safe to leave in prod — it never reads or writes the DB." It has no `NODE_ENV` check, no admin check, and is accessible to any Telegram user who knows the command.

While the command only renders canned data, it:
1. Discloses that a debug rendering capability exists
2. Reveals the server can render PNG cards (useful for attack surface mapping)
3. Exposes the caller's `ctx.from.first_name` and `ctx.from.id` in the generated card (minor PII mirror)
4. Returns `err.message` to the Telegram chat on failure: `await ctx.reply(\`Preview failed: ${err.message}\`)` (line 416) — leaks internal error messages to Telegram users

### 8. PII Linkage in Server Logs

Two specific log patterns create a linkage between Telegram user ID and socket/wallet identity:

**Pattern 1** (`main.js:1124`):
```
[multi-socket] TG user 12345678 now has 2 concurrent sockets (existing: abc123,def456; new: ghi789)
```
Logs the full numeric TG user ID with their socket IDs. Socket IDs are ephemeral but the TG ID is persistent.

**Pattern 2** (`main.js:1368`):
```
[client tg=12345678 w=HPyVPj] GC shotResult {...}
```
Logs TG user ID and 6-character wallet prefix on the same line. Combined with the full wallet address logged elsewhere (e.g., escrow creation logs), this creates a TG ID → wallet address mapping in Render's log stream.

This PII linkage is likely unintentional but constitutes a GDPR/privacy concern for EU players where TG ID + blockchain wallet is considered combined personal data.

### 9. Pino Redaction Gap — `console.*` Dominance

The Pino redact list at `logger.js:5-19` covers field names like `walletAddress`, `wallet`, `winner`, etc. But because ~95% of server logging uses `console.*`, this redaction is effectively inoperative for normal server operation. Examples of wallet addresses that bypass redaction:

- `server/services/escrow.js:86`: `console.log('[Escrow] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}')`
- `server/services/escrow.js:89-90`: `console.log('[Escrow] Treasury: ${TREASURY_WALLET}')` and `[Escrow] Ops: ${OPS_WALLET}`
- `server/socket-io/main.js:1368`: `[client tg=${tg} w=${w}]` — wallet prefix

None of these go through Pino's redact filter.

### 10. Source Maps in Production

Correctly suppressed. `client/.env.production` contains:
```
GENERATE_SOURCEMAP=false
INLINE_RUNTIME_CHUNK=false
```
CRA reads this at build time. No `.map` files should be emitted in production builds. This was verified as part of Phase 13 (commit artifacts present). This concern is RESOLVED.

## Trust Model

Client-side logging (`debugLog.js`, `DebugAuthOverlay`) is visible to the user running the client — they are reading their own data. The information disclosure risk is: (1) any user can activate it by appending `?debug=1`, (2) the unconditional `console.log` in `debugLog.js` means production logs in DevTools include diagnostic data for all users, and (3) sensitive data passed to `debugLog` as the `data` argument would be visible.

Server-side logging writes to Render's stdout stream, which is retained in their log management. Sensitive data in server logs is accessible to: (1) Render's infrastructure, (2) any third-party log aggregator configured, (3) anyone with Render account access. The PII linkage pattern (TG ID + wallet prefix) and the inconsistent Pino/console split mean the de facto logging policy is "log everything to stdout without systematic redaction."

## State Analysis

- **In-memory error tracking**: `monitoring.js` keeps a rolling buffer of the last 100 errors (message + context). This is in-memory and reset on server restart. The `/stats` endpoint (admin-gated) exposes the last 5. No persistent error log storage.
- **No log aggregator detected**: No Datadog, New Relic, Sentry, or similar integration found. Logs go to Render's built-in stdout capture only.
- **No request-level correlation IDs**: Log entries are tagged with socket IDs or TG IDs but not with request-level UUIDs, making multi-step flow tracing difficult.

## Dependencies

- `pino@^8.x` — structured logging library with redaction. Used sparingly.
- `pino-pretty` — dev-mode transport for human-readable output.
- No dedicated error tracking SDK (Sentry, Rollbar, etc.).

## Focus-Specific Analysis

### DATA-04 Concern Matrix

| Concern | Status | Evidence |
|---------|--------|----------|
| Sensitive fields in logs | PARTIAL — Pino redacts wallets but `console.*` does not | `logger.js:5-19`; `escrow.js:89-90`; `main.js:1368` |
| PII linkage (wallet + TG ID) | PRESENT | `main.js:1124, 1368` |
| Stack traces to client | NOT PRESENT — error messages only | `index.js:259`, `main.js:3105` |
| `debugLog.js` remote forwarding | GATED — requires `?debug=1` AND connected socket | `debugLog.js:50-58` |
| `DebugAuthOverlay` in prod | CONFIRMED — activated by `?debug=1` | `App.js:327`, `DebugAuthOverlay.js` |
| `clientDebugLog` unauthenticated | CONFIRMED | `main.js:1356` (no auth check) |
| Debug logs suppressed in prod | PARTIALLY — Pino `info` level suppresses `debug`; `console.*` not suppressed | `logger.js:4` |
| Pino vs `console.log` consistency | INCONSISTENT — ~6 Pino uses vs ~200 `console.*` | across server |
| `err.message` to client | PRESENT at `main.js:3105`; ADMIN-GATED at `index.js:259` | |
| Telegram bot logs | NO sensitive content (message bodies not logged) | `bot.js` |
| Source maps | DISABLED in production | `client/.env.production:2` |

## Cross-Focus Intersections

- **SEC-02**: `privyAuth.js` line 21 has a code comment containing `PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm`. This is the public client app ID (also in `client/.env.production:18` and `.env.example:22`), so the exposure is intentional and acceptable. However, `PRIVY_APP_SECRET` is never logged — confirm this holds after full audit.
- **API-03**: The `clientDebugLog` event is an unauthenticated socket entry point — same class as other unauthenticated event concerns. The comment in `main.js` at line 1354 justifies the lack of auth check as acceptable because "malicious payloads can't exceed the cap and can't crash a try/catch'd handler." This justification ignores log injection and PII correlation concerns.
- **AUTH-03**: Auth state is exposed in `DebugAuthOverlay` to the authenticated user themselves, not to other users — no cross-user authorization issue. But the mechanism of activating it via URL param in production is worth noting.
- **ERR-01**: `equipCosmeticResult` returning `err.message` is also an error handling concern — the catch block fails-open (emits error to client) rather than returning a generic message.

## Cross-Reference Handoffs

- → **AUTH-03**: Verify whether `clientDebugLog` event handler at `main.js:1356` should require authentication before writing to server logs. Current code explicitly skips auth check.
- → **API-03**: Confirm whether `clientDebugLog` is the only unauthenticated event handler that writes to persistent logs. If other unauthenticated events also log user-controlled data, the attack surface is broader.
- → **SEC-02**: Verify `PRIVY_APP_SECRET` never appears in any log call site across the entire server. Confirm that the Privy client initialization at `privyAuth.js:42` does not log the secret.
- → **INFRA-05**: Confirm whether Render's log stream is forwarded to any third-party aggregator. If so, the PII linkage in server logs (TG ID + wallet prefix) has broader disclosure scope.

## Risk Observations

1. **CRITICAL — `clientDebugLog` unauthenticated log injection + PII linkage**: `main.js:1356`. Any socket can write attacker-controlled content to Render logs. For authenticated sockets, each log entry pairs TG user ID with wallet address prefix — persistent cross-identity linkage in the log stream.

2. **HIGH — `DebugAuthOverlay` ships in production bundle, URL-activated**: `App.js:327`. A production user appending `?debug=1` sees their live SOL balance, auth state, and internal Privy wallet flags. While showing only the requesting user's own data, this is information that should not be freely surfaced in production via a URL parameter.

3. **HIGH — Pino redaction policy is effectively dead code**: `logger.js:5-19`. The redact list exists, but ~95% of server logging bypasses it via `console.*`. Wallet addresses, wallet prefixes, and TG IDs appear in plaintext in server logs routinely.

4. **HIGH — `debugLog.js` unconditional `console.log`**: `debugLog.js:47`. Every `debugLog` call emits to browser console in production, regardless of debug flag. Any caller that passes a sensitive object as `data` (e.g., a Privy access token, a keypair, a transaction detail) would expose it in DevTools.

5. **HIGH — `equipCosmeticResult` returns raw `err.message`**: `main.js:3105`. DB error messages propagated verbatim to authenticated users. Mongoose errors can reveal schema field names, index names, and collection structure.

6. **MEDIUM — TG ID + wallet prefix co-logged in two patterns**: `main.js:1124` and `1368`. Creates a persistent TG identity → wallet address mapping in Render's log stream. GDPR concern for EU players.

7. **MEDIUM — `/teststats` bot command in production without guard**: `bot.js:352`. Returns `err.message` to Telegram users on failure. Minor but confirms debug infrastructure to external users.

8. **MEDIUM — `/health` discloses `activeConnections` unauthenticated**: `monitoring.js:152-160`. Real-time connection count visible to unauthenticated callers.

9. **MEDIUM — `err.message` in admin HTTP response**: `index.js:259`. Admin-only (`requireAdminKey` gated), so exposure is limited to authenticated admin callers. Still propagates raw DB error text.

10. **LOW — Escrow and monitoring boot logs expose public wallet addresses**: `escrow.js:89-90`, `monitoring.js` settlement tracking. Treasury and ops wallet addresses logged on boot. These are public on-chain addresses, so disclosure is limited.

11. **LOW — `version: '1.0.0'` in `/health` response**: `monitoring.js:157`. Static version string — minor but contributes to fingerprinting.

## Novel Attack Surface Observations

**Log poisoning for incident response confusion**: The `clientDebugLog` handler, combined with the rich `[client tg=X w=Y]` prefix format, allows an authenticated user to craft log entries that look like legitimate internal operational messages. During an incident investigation, a developer grepping for `[Auth]` or `[Escrow]` patterns in Render logs would not directly see the attacker's injected entries (the format starts with `[client ...]`), but the attacker could craft `label` values that resemble internal log tags, or inject data structures that mimic settlement objects. This is a low-sophistication but novel confusion vector specific to the architecture of this log system.

**`debugLog.js` as inadvertent secret exfiltration**: The `debugLog` helper is designed as a diagnostic utility, but its unconditional `console.log` means that if any developer adds `debugLog('auth state', privyAccessToken)` during debugging and forgets to remove it, the Privy access token is permanently visible in the browser console for every production user of that code path. This is a developer discipline risk, not a current confirmed exposure, but the architecture (always-log + no compile-time stripping) makes it a latent risk.

## Questions for Other Focus Areas

- **For AUTH-01/AUTH-03**: Are there other socket event handlers registered before authentication that write user-controlled data to server logs?
- **For SEC-02**: Does `privyAuth.js:verifyAuthToken` log the token being verified? (Checked: only logs `err.message` on failure — not the token itself. Acceptable.)
- **For INFRA-03**: Is Render's log stream forwarded to any external aggregator? The PII linkage concern escalates significantly if logs are forwarded to a third-party with their own retention and access policies.

## Raw Notes

- `PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm` appears in `privyAuth.js` as a code comment (line 21) and in `.env.production` and `.env.example` — this is the public client app ID, not a secret. Acceptable.
- The `walletLinkTokens.js` module has no logging whatsoever — no token values logged, no TG IDs logged on mint. This is correct security practice.
- The Pino logger in `logger.js` has `pino-pretty` in dev mode controlled by `NODE_ENV !== 'production'`. In production, raw NDJSON goes to stdout. No custom stream configured — output goes to Render's stdout capture.
- Bot commands (`/stats`, `/wallet`, etc.) log `err.message` to console on error, but do not log message contents, user TG IDs (only catch-all log is `[bot] error handling <updateType>:`), or other PII. Bot logging is generally appropriate.
- `server/socket-io/main.js:1368` format string: `` `[client tg=${tg} w=${w}] ${label} ${dataStr}` `` — the `tg` and `w` variables are set from the *socket's* TG identity, not from the payload. An attacker cannot spoof those values by crafting the `clientDebugLog` payload, but they are still logged for every valid sender.
