# WEB-02: CORS, CSP & Security Headers Audit

**task_id:** WEB-02
**auditor:** WEB-02 (CORS / CSP / Security Headers)
**date:** 2026-02-23
**project:** SolShot — Solana multiplayer artillery game with SOL wagers
**scope:** `server/index.js`, `server/middleware/guards.js`, `server/socket-io/main.js`, `client/config-overrides.js`, `client/vercel.json`, `render.yaml`

---

## CONDENSED SUMMARY

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| W1 | CORS default falls back to `localhost:3000` with no `CORS_ORIGINS` env set — any deployment missing this var silently accepts only localhost, breaking production, but more critically there is no validation that the runtime value does not include a wildcard | MEDIUM | `server/index.js:27-29` |
| W2 | `render.yaml` CORS_ORIGINS includes `https://sol-shot.vercel.app` — a predictable Vercel preview domain, not just the canonical `solshot.gg`. Any Vercel fork of the repo gets a subdomain that satisfies this exact string | LOW-MEDIUM | `render.yaml:CORS_ORIGINS` |
| W3 | Socket.IO CORS and Express CORS share the same `CORS_ORIGINS` array but diverge on configuration: Socket.IO restricts methods to `GET, POST`; Express CORS does not set `methods` at all, defaulting to all HTTP methods | LOW | `server/index.js:32-35, 97` |
| W4 | Express CORS is applied **after** helmet but there is no `credentials: true` setting — this is correct for a public API, but CORS `allowedHeaders` is unset, meaning all request headers are reflected. Combined with the `x-admin-key` header scheme, a reflected-headers CORS policy leaks that the admin header name is accepted | INFO | `server/index.js:97` |
| W5 | `helmet` is version ^8.1.0 and `crossOriginEmbedderPolicy` is explicitly disabled (`false`) — this removes the `Cross-Origin-Embedder-Policy: require-corp` header, weakening the Spectre/COEP isolation that helmet v7+ enables by default | LOW | `server/index.js:94` |
| W6 | CSP `styleSrc` contains `'unsafe-inline'` — this allows injected inline styles, a useful XSS pivot for DOM-based attacks (e.g., CSS exfiltration). The server serves only JSON API responses, making this CSP largely decorative; the actual client HTML is served by Vercel, which sets no CSP at all | MEDIUM | `server/index.js:75` |
| W7 | **Client has NO Content-Security-Policy.** `client/vercel.json` sets only `Cache-Control` on `/static/*`. The Phaser.js/React client — which handles wallet interactions, wager UI, and SHOT burns — is served to users with zero browser-enforced CSP, XSS protection, or frame-busting | HIGH | `client/vercel.json` |
| W8 | `X-Powered-By: Express` is not explicitly suppressed. Helmet v8 does suppress it by default via `hidePoweredBy()`, but this is implicit and not visible in the config. Should be documented or made explicit | INFO | `server/index.js:70` |
| W9 | No `app.set('trust proxy', 1)` is configured for the Express app even though the server runs behind Render's reverse proxy. The IP connection-limit middleware reads `x-forwarded-for` on the Socket.IO layer (correct), but Express's `req.ip` will return the proxy's internal IP for HTTP rate limiting, defeating per-user rate limiting on HTTP endpoints | MEDIUM | `server/index.js` |
| W10 | `HTTPS` is not enforced at the application layer — there is no HTTPS redirect middleware and no HSTS preload configuration. Helmet sets `Strict-Transport-Security` by default (1 year, includeSubDomains), but this only takes effect after the first HTTPS visit. Render enforces TLS at the edge, so mixed-content risk is low, but the CSP `connectSrc` includes `ws://localhost:5001` (unencrypted WebSocket) in the production helmet config | LOW | `server/index.js:85` |
| W11 | `config-overrides.js` introduces no security weakening — it adds Node polyfills for Solana wallet-adapter libraries and disables source-map warnings. No webpack security headers, devServer proxy, or CORS bypass are introduced | INFO | `client/config-overrides.js` |
| W12 | `ADMIN_API_KEY` is listed as `sync: false` in `render.yaml` (correctly requiring manual secret injection), but is absent from `server/.env.example`. Any developer cloning the repo and running without `ADMIN_API_KEY` set will have `requireAdminKey` reject all admin requests (correct fail-closed behavior), but the missing documentation means it will silently stay unset in dev | LOW | `server/.env.example`, `server/middleware/guards.js:27` |

---

## FULL ANALYSIS

### 1. CORS Configuration

**Source:** `server/index.js:26-36, 97`

```js
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    }
})
// ...
app.use(cors({ origin: CORS_ORIGINS }))
```

**Assessment — PASS with caveats:**

The CORS policy is not a wildcard. The code correctly reads `CORS_ORIGINS` from the environment and splits on comma. The `render.yaml` production deployment sets this to:

```
https://solshot.gg,https://www.solshot.gg,https://sol-shot.vercel.app
```

This is a closed list of exact-match origins, which `cors` npm package handles correctly (it compares origin header string against the array).

**Finding W1 — Fallback is not a security risk but a correctness risk.** If `CORS_ORIGINS` is unset (e.g., a misconfigured staging environment), the server silently falls back to `['http://localhost:3000']`. This is fail-closed from an attacker's perspective (it won't open CORS to everyone), but it will silently break any production-like environment that forgets the env var. A more defensive pattern would be to refuse to start if `NODE_ENV=production` and `CORS_ORIGINS` is unset.

**Finding W2 — `sol-shot.vercel.app` in CORS_ORIGINS.** The Vercel subdomain `sol-shot.vercel.app` is a permanent entry in the CORS allowlist in `render.yaml`. If the Vercel project is ever transferred, deleted, or the subdomain is re-used by another party, that origin would have authorized CORS access to the SolShot server. Furthermore, any Vercel deployment of a fork of the repo under the account would receive a `sol-shot-<hash>.vercel.app` domain (not `sol-shot.vercel.app` exactly), but the canonical `sol-shot.vercel.app` itself is a stable attack surface. This is a low-medium concern — the canonical `solshot.gg` should be the sole production origin once the domain is live.

**Finding W3 — Socket.IO and Express CORS policy mismatch.** Socket.IO CORS limits `methods` to `GET, POST`. Express CORS has no `methods` restriction, so it allows all HTTP verbs (GET, POST, PUT, DELETE, PATCH, OPTIONS, etc.) from the CORS perspective. Since Socket.IO upgrades from HTTP to WebSocket, the Socket.IO restriction is more relevant for the upgrade handshake, but an OPTIONS preflight for a PUT request to `/api/admin/reload-keys` would be permitted by Express CORS. The admin endpoint is POST-only by its `app.post()` registration, so this is low severity, but the inconsistency should be resolved by adding `methods: ['GET', 'POST']` to the Express `cors()` call as well.

**No wildcard origin found.** The architecture doc's earlier finding `CORS wildcard on Express + Socket.IO` (AC-14, UA-13, EXT-20) was present in the original codebase but has been remediated in this version. Both Express and Socket.IO CORS are now origin-restricted.

---

### 2. Helmet Configuration

**Source:** `server/index.js:70-95`

```js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: [
                "'self'",
                "https://api.devnet.solana.com",
                "wss://api.devnet.solana.com",
                "https://api.mainnet-beta.solana.com",
                "wss://api.mainnet-beta.solana.com",
                "https://solshot-server.onrender.com",
                "wss://solshot-server.onrender.com",
                "ws://localhost:5001",
                "wss://localhost:5001",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}))
```

**Version:** helmet ^8.1.0

**Assessment — PARTIALLY EFFECTIVE, with two issues:**

Helmet v8 enables the following headers by default (all active unless overridden):
- `Content-Security-Policy` — custom configured, see below
- `X-DNS-Prefetch-Control: off`
- `X-Download-Options: noopen`
- `X-Frame-Options: SAMEORIGIN`
- `X-Permitted-Cross-Domain-Policies: none`
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security: max-age=15552000; includeSubDomains` (6 months)
- `X-Content-Type-Options: nosniff`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-Powered-By: Express` suppressed via `hidePoweredBy()`
- `X-XSS-Protection` removed (deprecated, helmet v5+ omits it)

The following is explicitly disabled:
- `Cross-Origin-Embedder-Policy: require-corp` — disabled via `crossOriginEmbedderPolicy: false`

**Finding W5 — COEP disabled.** The comment in the original code indicates this was done to allow wallet adapter iframes or cross-origin resources needed by the Solana wallet ecosystem. This is a recognized trade-off when using wallet adapters that load cross-origin content. However, it should be documented that this is intentional (not an oversight), and `Cross-Origin-Opener-Policy: same-origin` from helmet still provides meaningful Spectre mitigation.

**Finding W6 — `'unsafe-inline'` in `styleSrc`.** This is present to support inline styles used by Phaser.js or React UI components. However, the CSP is being set on an **Express API server** (`/`, `/health`, `/stats`, `/api/admin/reload-keys`). This server does not serve HTML or the React application — it serves only JSON API responses. The CSP applied here protects the handful of HTML-ish responses (the root `/` sends a plain text string, not HTML). The CSP is effectively decorative for this server and does not protect the actual client application. The inclusion of `'unsafe-inline'` is therefore harmless in practice for this server, but misleading.

**Finding W7 — Client has no CSP (HIGH).** The actual attack surface for CSP is the React/Phaser client served by Vercel. `client/vercel.json` sets only `Cache-Control` headers on static assets:

```json
{
  "headers": [
    {
      "source": "/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

There is no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`, and no `Permissions-Policy` set for the client. The Phaser.js client:
- Handles Solana wallet adapter interactions (signs transactions)
- Renders the wager UI (SOL amounts)
- Triggers SHOT burns
- Reads and displays player balances

A missing CSP on the client means any XSS vulnerability in the React or Phaser layer runs without browser-level containment. Frame embedding is also unrestricted, allowing clickjacking of the wallet authorization UI.

**Recommended additions to `client/vercel.json`:**
```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; connect-src 'self' https://api.devnet.solana.com wss://api.devnet.solana.com https://solshot-server.onrender.com wss://solshot-server.onrender.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; frame-src 'none'; object-src 'none';" }
  ]
}
```

Note: `'unsafe-inline'` in `style-src` may be necessary for Phaser.js canvas styling and React inline styles. `'unsafe-eval'` is NOT present and should NOT be added.

---

### 3. X-Frame-Options / Clickjacking

**Server:** Helmet sets `X-Frame-Options: SAMEORIGIN` on the Express API server. Since the server does not serve the game UI, this is correct but irrelevant.

**Client:** No `X-Frame-Options` header is set on the Vercel-served client. This allows the game UI — including the wallet connection modal and wager confirmation screen — to be embedded in a cross-origin iframe. This is a clickjacking risk for wallet authorization flows (Finding W7 covers this).

---

### 4. WebSocket Upgrade CORS Bypass Analysis

Socket.IO performs the WebSocket upgrade via an HTTP GET with `Upgrade: websocket`. The CORS check on the HTTP upgrade request is handled by Socket.IO's built-in CORS middleware (configured in `server/index.js:31-36`). Express CORS middleware does NOT run on WebSocket upgrade requests — those are handled at the http.Server level before Express routing.

**Assessment:** There is no CORS bypass vector via WebSocket upgrade in this configuration. The Socket.IO CORS config restricts `origin` to `CORS_ORIGINS` and limits `methods` to `GET, POST`. An upgrade request from an origin not in `CORS_ORIGINS` will be rejected by Socket.IO before the connection is established.

The IP connection-limit middleware (`io.use()` at `server/index.js:44-67`) correctly reads `x-forwarded-for` on the Socket.IO handshake object, not from Express's `req.ip`. This is the correct approach for Render's proxy architecture.

---

### 5. Reverse Proxy / Trust Proxy

**Finding W9 — No `app.set('trust proxy', 1)` for Express.**

The server is deployed on Render behind a reverse proxy. Express's rate-limiting middleware (`httpLimiter`) uses `req.ip` by default to identify the client IP. Without `app.set('trust proxy', 1)`, Express does not read `x-forwarded-for` and `req.ip` returns the Render internal load balancer IP (e.g., `10.x.x.x`). This means all HTTP requests appear to come from the same IP, and the HTTP rate limiter (100 req/15min) is effectively per-server rather than per-user.

The Socket.IO connection limiter correctly parses `x-forwarded-for` manually and is not affected by this issue. Only the HTTP endpoints (`/health`, `/stats`, `/api/admin/reload-keys`) are affected.

Fix:
```js
// Add after app = express() initialization
app.set('trust proxy', 1);
```

Note: With `trust proxy` set, `express-rate-limit` will also need to be configured with `trustProxy: true` or its IP extraction will use `req.ip` (which, once proxy trust is set, correctly returns the forwarded IP). The current `express-rate-limit ^8.x` documentation recommends using the `standardHeaders: true, legacyHeaders: false` config (already set) along with `app.set('trust proxy', 1)`.

---

### 6. HTTPS / Mixed Content

Render enforces HTTPS at the edge for all web services (TLS termination occurs at the Render load balancer). The application-layer code does not need to enforce HTTPS redirects. Helmet's HSTS header (`Strict-Transport-Security: max-age=15552000; includeSubDomains`) is sent by default, which will instruct browsers to enforce HTTPS after the first visit.

**Finding W10 — `ws://localhost:5001` in production CSP `connectSrc`.** The server's CSP `connectSrc` directive includes:
```
ws://localhost:5001
```
This is an unencrypted WebSocket (`ws://`) endpoint in what is meant to be the server's CSP policy. While this CSP is on the API server (not the client), it signals that the development connection string has leaked into a header that will be sent on production responses. If a browser renders the API server root page, it would receive a CSP permitting connections to `ws://localhost:5001`. This is a minor information disclosure and configuration hygiene issue, not an exploitable vulnerability. Remove it from the production server config or make it conditional on `NODE_ENV`.

---

### 7. Information Disclosure via Response Headers

With helmet v8 active:
- `X-Powered-By: Express` is suppressed by default (implicit)
- `Server` header: Not set by Express/Node; none is sent
- `ETag` header: Express sends ETags for static content; only the `/` route sends non-JSON (plain text), which will generate an ETag. This is a minor information disclosure (reveals response content fingerprint) but has no security impact for an API server

**ADMIN_API_KEY absence from `.env.example` (Finding W12):** The `requireAdminKey` middleware (guards.js:27) correctly fails closed when `ADMIN_API_KEY` is not set:
```js
if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```
If `ADMIN_API_KEY` is undefined, the condition is always true and all admin requests are rejected. This is correct behavior. However, the `.env.example` file does not document `ADMIN_API_KEY`, meaning developers will run with admin endpoints permanently locked without understanding why. It should be added to `.env.example` with a placeholder value and documented.

---

### 8. `config-overrides.js` Security Assessment

**Finding W11 — No security weakening in config-overrides.js.** The webpack override:
- Adds `crypto-browserify`, `stream-browserify`, `buffer` as Node.js polyfills (required by `@solana/web3.js` and wallet adapter)
- Disables `fullySpecified` for ESM module resolution
- Provides `Buffer` and `process` globals via `ProvidePlugin`
- Ignores source-map parse warnings from `node_modules`
- Does NOT configure a `devServer` proxy, does NOT disable content security, does NOT add `unsafe-eval` to webpack, does NOT expose source maps in production

The polyfills (`crypto-browserify`) do not weaken cryptographic security — they are the standard browser polyfill for the `crypto` module used by Solana's web3.js library. The actual cryptographic operations (transaction signing, key derivation) are performed by the browser's native `SubtleCrypto` API via the wallet adapter, not through these polyfills.

---

### 9. Middleware Order Audit

The Express middleware chain in `server/index.js` is:
```
1. helmet()          — security headers (line 70)
2. cors()            — CORS policy (line 97)
3. httpLimiter       — rate limiting (line 107)
4. express.json()    — body parsing (line 110)
5. express.urlencoded() — body parsing (line 111)
```

**Assessment:** The order is correct. Helmet and CORS are applied before rate limiting and body parsing. This means malformed CORS requests are rejected before consuming parsing resources. Body size limit of `1mb` (reduced from original `30mb`) is appropriate.

---

## Severity Summary

| Severity | Count | Findings |
|----------|-------|----------|
| HIGH     | 1     | W7 (no CSP/X-Frame on Vercel client) |
| MEDIUM   | 3     | W1 (no env guard), W6 (unsafe-inline in server CSP), W9 (trust proxy missing) |
| LOW      | 4     | W2 (Vercel subdomain in CORS), W3 (method mismatch), W5 (COEP disabled), W10 (ws:// in CSP) |
| INFO     | 4     | W4 (allowedHeaders), W8 (implicit hidePoweredBy), W11 (config-overrides clean), W12 (ADMIN_API_KEY undocumented) |

---

## Remediation Priority

**Immediate (before mainnet):**
1. **W7** — Add security headers to `client/vercel.json`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a client-appropriate CSP. This is the only finding that materially increases attack surface by leaving the wallet-interaction UI unprotected.

**Short-term:**
2. **W9** — Add `app.set('trust proxy', 1)` to Express so HTTP rate limiting operates per-client IP, not per-server.
3. **W10** — Remove `ws://localhost:5001` from the server's CSP `connectSrc` or gate it behind `NODE_ENV !== 'production'`.
4. **W12** — Add `ADMIN_API_KEY=change-me-in-production` to `server/.env.example`.

**Low priority:**
5. **W2** — After `solshot.gg` is the primary production origin, remove `https://sol-shot.vercel.app` from `render.yaml` CORS_ORIGINS (or restrict to the exact canonical Vercel URL if still needed).
6. **W3** — Add `methods: ['GET', 'POST']` to the Express `cors()` call to match Socket.IO CORS config.
7. **W1** — Add a startup guard: if `NODE_ENV === 'production'` and `CORS_ORIGINS` is not set, log a fatal error and exit.

---

## Cross-Reference

| Finding | Related Architecture Doc Issue |
|---------|-------------------------------|
| W7 (no client CSP) | XSS risk for wallet UI (AC-14 context) |
| W9 (no trust proxy) | HTTP rate-limit ineffective per user (ERR-03 context) |
| W2 (Vercel subdomain) | N/A — new finding |
| W10 (ws:// in CSP) | Information disclosure (DATA-04 context) |
| W6 (unsafe-inline) | CSP decorative on API server — complements W7 |

The CORS wildcard (`origin: "*"`) finding from the original architecture doc (AC-14, UA-13, EXT-20) has been **remediated** in this version. Socket.IO and Express CORS are both locked to the `CORS_ORIGINS` env var with a safe `localhost:3000` dev fallback.
