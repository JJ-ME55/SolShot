---
task_id: db-phase1-web-02
provides: [web-02-findings, web-02-invariants]
focus_area: WEB-02
files_analyzed:
  - server/index.js
  - client/vercel.json
  - client/public/index.html
  - render.yaml
  - server/services/bot.js
  - server/node_modules/helmet/index.cjs
finding_count: 9
severity_breakdown: {critical: 0, high: 3, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# WEB-02: CORS, CSP & Security Headers — Condensed Summary

## Key Findings (Top 5-10)

- **Vercel client has zero HTTP security headers**: `client/vercel.json` only sets Cache-Control; no X-Frame-Options, no CSP, no HSTS, no X-Content-Type-Options served over HTTP for `solshot.gg` — the primary user-facing surface — `client/vercel.json:1-28`
- **Client `<meta>` CSP cannot enforce `frame-ancestors`**: the only CSP present for the Vercel-served client is a `<meta http-equiv>` tag, which browsers explicitly ignore for `frame-ancestors`; `solshot.gg` has no clickjacking protection — `client/public/index.html:7`
- **Server CSP references dead Dynamic origins**: `connectSrc` and `frameSrc` still include `https://app.dynamic.xyz` and `https://api.dynamic.xyz` (old wallet provider, replaced by Privy since May 2026); these widen attack surface without any operational need — `server/index.js:163-168`
- **Server CSP missing Privy origins in `connectSrc` / `frameSrc`**: the server's helmet CSP is populated for the API server (not the Vercel client), but it omits all Privy domains (`auth.privy.io`, `*.privy.io`, `*.privy.systems`) that are needed if the API server ever serves HTML directly or is used in a redirect flow — `server/index.js:138-175`
- **`unsafe-inline` in client `script-src`**: the client meta CSP includes `'unsafe-inline'` in `script-src`, primarily to support the inline Eruda debug loader (`client/public/index.html:50-71`); this nullifies much of the XSS protection CSP provides — `client/public/index.html:7`
- **Localhost origins hardcoded unconditionally in client meta CSP**: `connect-src` in the client `<meta>` CSP always includes `http://localhost:5001`, `ws://localhost:5001`, `wss://localhost:5001` regardless of environment; the server conditionally excludes these in production (lines 131-136) but the client `index.html` is a static asset with no environment substitution — `client/public/index.html:7`
- **HSTS not explicitly configured; no `preload` flag**: helmet defaults provide HSTS with `max-age=31536000` (365 days) and `includeSubDomains`, but `preload` is not set; without `preload` the domain cannot be submitted to browser preload lists, leaving first-time visitors unprotected until they receive the header once — `server/index.js:138-175` (absent)
- **No `Permissions-Policy` header anywhere**: neither the server `helmet()` config nor the Vercel `vercel.json` sets a `Permissions-Policy` header; browser features (camera, microphone, geolocation, payment, USB) are unrestricted by policy — `server/index.js:138-175`, `client/vercel.json:1-28`
- **`report-uri` directive used instead of `report-to`**: the server CSP uses the deprecated `report-uri` directive (`/api/csp-report`) rather than the modern `report-to` / `Reporting-API` mechanism; `report-uri` is deprecated in CSP Level 3 and not supported in all modern browsers — `server/index.js:171`

## Critical Mechanisms

- **CORS allowlist (server)**: `CORS_ORIGINS` env var parsed from comma-separated string, defaulting to `['http://localhost:3000']` in dev; set in `render.yaml` to `https://solshot.gg,https://www.solshot.gg,https://sol-shot.vercel.app`; applied to both Socket.IO and Express cors middleware — `server/index.js:63-69, 177`
- **Server helmet CSP**: applied via `app.use(helmet({contentSecurityPolicy:{directives:{...}}}))` at line 138; uses helmet defaults (frame-ancestors: 'self', X-Frame-Options: SAMEORIGIN, HSTS 365d, X-Content-Type-Options, Referrer-Policy: no-referrer) PLUS explicit CSP directives; but applies to `solshot-server.onrender.com`, NOT to `solshot.gg` (Vercel) — `server/index.js:138-175`
- **Client meta CSP**: single `<meta http-equiv="Content-Security-Policy">` tag in `index.html`; this is the ONLY CSP for the Vercel-hosted client; it includes `'unsafe-inline'` in `script-src`, cannot set `frame-ancestors`, and hardcodes localhost origins — `client/public/index.html:7`
- **Vercel headers config**: only Cache-Control headers for static assets and HTML; no security headers of any kind — `client/vercel.json:8-27`
- **Eruda debug loader**: inline script dynamically appending `<script src="https://cdn.jsdelivr.net/npm/eruda">` when `?debug=1` is set or `solshot_debug=1` in localStorage; `cdn.jsdelivr.net` is whitelisted in `script-src`; this is the primary reason `'unsafe-inline'` exists in the client CSP — `client/public/index.html:50-71`
- **Bot architecture (as of 2026-05-04)**: Telegram bot no longer uses Mini App iframe; links open solshot.gg in Telegram's in-app browser as top-level context; `frame-ancestors` for `telegram.org` is NOT required — `server/services/bot.js:33-44`

## Invariants & Assumptions

- INVARIANT: CORS is restricted to allowlisted origins — ENFORCED on server at `server/index.js:63-69, 177`; NOT ENFORCED on client (Vercel doesn't add CORS restrictions to static assets)
- INVARIANT: Clickjacking protection (frame-ancestors) is set for the UI — NOT ENFORCED ⚠: `solshot.gg` (Vercel) has no X-Frame-Options or CSP frame-ancestors header; meta CSP cannot enforce this; only the API server (`*.onrender.com`) has helmet's default `frame-ancestors: 'self'`
- INVARIANT: No unauthorized cross-origin connections from the game client — PARTIALLY ENFORCED ⚠: server CSP connectSrc is allowlisted, but meta CSP connectSrc includes `localhost:5001` in production builds, and references dead Dynamic origins in the server CSP
- ASSUMPTION: The server's helmet CSP applies to the user-facing application — UNVALIDATED ⚠: the server is `solshot-server.onrender.com` (API only); the user-facing game at `solshot.gg` is served by Vercel and has no server-set security headers
- ASSUMPTION: Dynamic wallet provider domains in CSP are stale and unused — VALIDATED: bot.js comment at line 96 confirms Dynamic caused a CSP block in Telegram; project MEMORY confirms migration to Privy by May 2026
- ASSUMPTION: The `<meta>` CSP `unsafe-inline` in `script-src` is required by the React app — PARTIALLY VALIDATED: the inline Eruda debug script requires it; however Create React App bundles typically don't need `unsafe-inline` themselves; the React build injects its own script tags via the HTML template, which require `nonce` or `hash`-based CSP if `unsafe-inline` is removed
- ASSUMPTION: Telegram WebView requires `frame-ancestors` allowlisting for Telegram domains — INVALIDATED: architecture note in `bot.js:33-44` confirms the app switched to in-app browser (top-level context), not Mini App iframe; `frame-ancestors` for Telegram is not needed

## Risk Observations (Prioritized)

1. **No security headers on Vercel client (`solshot.gg`)**: `client/vercel.json` — The user-facing PWA at `solshot.gg` lacks X-Frame-Options, CSP, HSTS, X-Content-Type-Options, and Referrer-Policy HTTP headers. Vercel can serve these via `headers` config. The server's `helmet()` configuration is irrelevant here — it only runs on `solshot-server.onrender.com`. This means the main attack surface (the game UI) has no clickjacking protection, no CSP enforcement via HTTP header (meta-CSP is weaker), and no HSTS.
2. **`frame-ancestors` not enforced on client**: `client/public/index.html` — `frame-ancestors` cannot be set via `<meta>` CSP; only HTTP response headers work. Without this, `solshot.gg` can be framed by any origin, enabling UI redress attacks (clickjacking) against Privy wallet signing flows or match wagering buttons.
3. **Dead Dynamic origins in server CSP widen exfiltration surface**: `server/index.js:163-168` — `app.dynamic.xyz` appears in both `connectSrc` and `frameSrc`; if the Dynamic infrastructure were compromised or a subdomain taken over, it could receive cross-origin requests or load framing content from within the SolShot server context.
4. **`'unsafe-inline'` in client script-src neutralizes XSS protection**: `client/public/index.html:7` — Any injected inline script (via XSS in a React render path or a compromised third-party script) can execute. The `unsafe-inline` exception primarily serves the Eruda debug loader. Moving Eruda to a `nonce`-based approach or a dedicated debug endpoint would allow `unsafe-inline` removal.
5. **Localhost origins in production client CSP**: `client/public/index.html:7` — `connect-src` always includes `http://localhost:5001` and WebSocket variants. This allows in-browser scripts to connect to any local server on port 5001, potentially leaking game state to a locally running attacker process or enabling data exfiltration via a CSRF-like vector if the local port is occupied.
6. **`cdn.jsdelivr.net` in script-src is a CDN-hijack vector**: `client/public/index.html:7` — Any script on all of jsdelivr is allowlisted. A supply chain compromise of the `eruda` npm package (or any other package on jsdelivr) could load arbitrary JavaScript. No SRI (Subresource Integrity) hash is used on the eruda `<script>` tag.
7. **HSTS missing `preload` flag**: `server/index.js:138-175` (absent) — The API server sends HSTS with 365-day max-age but not `preload`. First-time visitors to `solshot.gg` via HTTP are not protected by browser preloading; however, Vercel likely enforces HTTPS automatically via redirect.
8. **`report-uri` deprecated CSP reporting**: `server/index.js:171` — Modern browsers deprioritize `report-uri`; moving to `report-to` + `Report-To` header would improve CSP violation detection.
9. **No `Permissions-Policy` header**: `server/index.js:138-175`, `client/vercel.json` — Camera, microphone, geolocation, payment APIs are unrestricted. A game app has no legitimate need for these; explicit denial reduces attack surface from any XSS or framing exploit.

## Novel Attack Surface

- **Split CSP architecture creates a policy vacuum**: the server's helmet CSP (correctly configured minus dead Dynamic entries) protects the API server, while the client `<meta>` CSP (weaker, can't set frame-ancestors, includes `unsafe-inline`) protects the SPA. An attacker targeting the game UI (`solshot.gg`) faces only the meta CSP. Since Vercel `vercel.json` can trivially add HTTP security headers that would override/complement the meta CSP, the gap appears to be an oversight rather than a design decision.
- **Privy iframe + missing frame-ancestors = UI redress risk on wallet-signing flows**: Privy renders a sandboxed iframe for wallet operations. If `solshot.gg` can be embedded in an attacker's page (no frame-ancestors protection), the attacker can overlay transparent elements over Privy's signing UI, tricking users into signing unintended transactions during wagered match deposits.
- **`localhost:5001` in production CSP as a covert exfil channel**: An XSS payload or compromised script could POST match data or wallet addresses to `http://localhost:5001` if an attacker controls that port on the victim's machine (e.g., via a locally installed malicious app or browser extension serving on that port). The connect-src allowlist makes this possible.

## Cross-Focus Handoffs

- → **WEB-01 (XSS)**: `'unsafe-inline'` in client `script-src` means CSP does NOT mitigate XSS; any XSS found by WEB-01 has full script execution with no CSP fallback.
- → **CHAIN-03 (Wallet Adapter)**: Privy iframe signing flows can be targeted by UI redress attacks because `solshot.gg` has no `frame-ancestors` header; CHAIN-03 should note that clickjacking of the Privy signing modal is feasible.
- → **FE-02 (Third-Party Scripts)**: `cdn.jsdelivr.net` is in `script-src` without SRI; this is the Eruda supply chain risk; also `https://plugin.jup.ag/plugin-v1.js` has no SRI hash — a Jupiter CDN compromise would execute arbitrary code in the game.
- → **INFRA-03 (Cloud Config)**: Vercel deployment configuration (`client/vercel.json`) needs security headers added; this is an infrastructure fix, not a code fix.

## Trust Boundaries

The server (`solshot-server.onrender.com`) is protected by helmet's full security header suite: CORS allowlist, CSP, X-Frame-Options (SAMEORIGIN), HSTS (365d), X-Content-Type-Options, Referrer-Policy (no-referrer). The client (`solshot.gg`, served by Vercel) has NONE of these HTTP headers — it relies only on a `<meta>` CSP tag that cannot enforce `frame-ancestors`, cannot be verified by subresource requests, and contains `'unsafe-inline'` in script-src. The fundamental trust boundary gap is that helmet protects the wrong endpoint (the API server, not the game UI). Any content served at `solshot.gg` — including Privy wallet-signing flows — is exposed to clickjacking and weakened CSP enforcement.
<!-- CONDENSED_SUMMARY_END -->

---

# WEB-02: CORS, CSP & Security Headers — Full Analysis

## Executive Summary

SolShot's security header posture has a structural split: the Express API server (`solshot-server.onrender.com`) is protected by `helmet` v8.1.0 with an explicit CSP, CORS allowlist, and standard security headers, but the user-facing React SPA (`solshot.gg`) is hosted on Vercel and served with only Cache-Control headers. The primary attack surface — the game UI where users sign wallet transactions — lacks `X-Frame-Options`, `frame-ancestors` CSP, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` at the HTTP level. The only CSP covering the game UI is a `<meta http-equiv="Content-Security-Policy">` tag in `index.html`, which is weaker (cannot set `frame-ancestors`, does not apply to `Link` headers, is not verified by preflight requests) and includes `'unsafe-inline'` in `script-src`.

Additionally, a prior wallet provider migration left dead origins (`app.dynamic.xyz`, `api.dynamic.xyz`) in the server-side helmet CSP, and the Eruda debug console loader creates an ongoing supply-chain risk via `cdn.jsdelivr.net` without SRI.

## Scope

Analyzed files:
- `server/index.js` — Express bootstrap, helmet config, CORS config (lines 62-177)
- `client/vercel.json` — Vercel deployment config (complete, 28 lines)
- `client/public/index.html` — SPA entry point with meta CSP (complete, 91 lines)
- `render.yaml` — Render deployment config (44 lines)
- `server/services/bot.js` — Telegram bot architecture note re: frame-ancestors (lines 33-100)
- `server/node_modules/helmet/index.cjs` — Helmet 8.1.0 defaults verification

## Key Mechanisms

### 1. CORS Configuration (Server)

```javascript
// server/index.js:63-69
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    },
    ...
});

// server/index.js:177
app.use(cors({ origin: CORS_ORIGINS }))
```

**What it does:** Reads a comma-delimited env var and splits it into an array of allowed origins. Both Socket.IO and the Express `cors()` middleware use the same list. No `credentials: true` is set, so `Access-Control-Allow-Credentials` is not sent.

**Production values (render.yaml:33-35):**
```yaml
- key: CORS_ORIGINS
  value: https://solshot.gg,https://www.solshot.gg,https://sol-shot.vercel.app
```

**Dev fallback:** `['http://localhost:3000']` — this is safe, not a wildcard.

**Assessment:** CORS is correctly scoped. No wildcard origin, no credentials flag, proper allowlist. The fallback to `localhost:3000` in dev does not ship to production because `render.yaml` sets `CORS_ORIGINS` explicitly.

**Edge case:** If the `CORS_ORIGINS` env var were accidentally unset in production (e.g., a bad Render config update), the server falls back to `localhost:3000` only, which would break the production client. This is fail-closed (breaks functionality, not security), which is acceptable.

### 2. Server Helmet CSP Configuration

```javascript
// server/index.js:131-175
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const devConnectSrc = IS_PRODUCTION ? [] : [
    "http://localhost:5001",
    "ws://localhost:5001",
    "wss://localhost:5001",
];

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://plugin.jup.ag"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://plugin.jup.ag"],
            imgSrc: ["'self'", "data:", "blob:", "https://api.web3modal.org"],
            connectSrc: [
                "'self'",
                "https://api.devnet.solana.com",
                "wss://api.devnet.solana.com",
                "https://api.mainnet-beta.solana.com",
                "wss://api.mainnet-beta.solana.com",
                "https://solshot.onrender.com",
                "wss://solshot.onrender.com",
                "https://solshot-server.onrender.com",
                "wss://solshot-server.onrender.com",
                "https://api.jup.ag",
                "https://plugin.jup.ag",
                "https://tokens.jup.ag",
                "https://cache.jup.ag",
                "https://api.web3modal.org",
                "https://pulse.walletconnect.org",
                "https://explorer-api.walletconnect.com",
                // Dynamic embedded wallet SDK  <-- STALE, Dynamic replaced by Privy
                "https://app.dynamic.xyz",
                "https://api.dynamic.xyz",
                ...devConnectSrc,
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            frameSrc: ["https://plugin.jup.ag", "https://app.dynamic.xyz"],  // <-- STALE
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            reportUri: ['/api/csp-report'],
        },
    },
    crossOriginEmbedderPolicy: false,
}))
```

**Helmet defaults active (because useDefaults = true by default):**
- `frame-ancestors: 'self'` — prevents framing the API server
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (365 days, no preload)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 0` (disabled; modern browsers don't need it)
- `X-DNS-Prefetch-Control: off`
- `Origin-Agent-Cluster: ?1`

**Critical gap:** This entire configuration applies to `solshot-server.onrender.com` (the Express API). It does NOT apply to `solshot.gg` (the Vercel-hosted React SPA). The CSP at the API server provides no protection for the game UI.

**Dead Dynamic origins:** Lines 163-168 — `https://app.dynamic.xyz` in `connectSrc` and `frameSrc`, `https://api.dynamic.xyz` in `connectSrc`. The project migrated from Dynamic to Privy in May 2026 (per MEMORY.md). These are now orphaned entries. The comment on line 162 even says "Dynamic embedded wallet SDK" — it was left behind during the wallet stack migration. The `frameSrc` entry is particularly concerning: if Dynamic's `app.dynamic.xyz` is compromised or a subdomain is registered by an attacker, it could be framed into the SolShot API context.

**Missing Privy origins in server CSP:** The server CSP has no `auth.privy.io`, `*.privy.io`, or `*.privy.systems` entries. This is acceptable because the server doesn't serve the game UI (where Privy iframes render), but it would matter if the server ever needed to serve redirects or inline content that loads Privy.

**`report-uri` deprecation:** Line 171 uses `reportUri: ['/api/csp-report']`. The `report-uri` directive is deprecated in CSP Level 3 in favor of the `report-to` endpoint mechanism combined with a `Report-To` HTTP header. Modern browsers (especially Chrome 125+) have started deprioritizing `report-uri`. The reporting endpoint (`/api/csp-report`) exists at `server/index.js:264-272` and logs violations server-side.

### 3. Vercel Client Deployment Headers

```json
// client/vercel.json
{
  "framework": "create-react-app",
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)\\.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    },
    {
      "source": "/",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

**What is missing:** Every security header. Vercel can serve arbitrary HTTP response headers via the `headers` array in `vercel.json`. The current configuration only specifies Cache-Control policies. Missing:

| Header | Value Needed | Impact of Absence |
|--------|-------------|-------------------|
| `X-Frame-Options` | `SAMEORIGIN` | `solshot.gg` can be framed by any origin |
| `Content-Security-Policy` | Full policy with `frame-ancestors` | Meta CSP is the only CSP; cannot set frame-ancestors via meta |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | No HSTS preload; Vercel may add HTTPS redirect but not HSTS header |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing attacks possible |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URL (with wallet addresses in query params) leaked in Referer header |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Browser APIs unrestricted |

Vercel by default adds some security headers via their infrastructure layer (they add `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` for some plan tiers), but these should not be relied upon — they should be explicitly configured in `vercel.json`.

### 4. Client Meta CSP

```html
<!-- client/public/index.html:7 — full content of the meta tag -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://plugin.jup.ag https://auth.privy.io
    https://*.privy.io https://oauth.telegram.org https://telegram.org
    https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://plugin.jup.ag;
  font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com
    https://privy.io https://*.privy.io https://*.privy.systems https://auth.privy.io data:;
  img-src 'self' data: blob: https://privy.io https://*.privy.io https://*.privy.systems
    https://auth.privy.io https://t.me https://telegram.org https://*.telegram.org
    https://explorer-api.walletconnect.com;
  connect-src 'self' https://api.devnet.solana.com wss://api.devnet.solana.com
    https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com
    https://solshot.onrender.com wss://solshot.onrender.com
    http://localhost:5001 ws://localhost:5001 wss://localhost:5001      <-- HARDCODED DEV
    https://api.jup.ag https://plugin.jup.ag https://tokens.jup.ag https://cache.jup.ag
    https://auth.privy.io https://*.privy.io wss://*.privy.io
    https://*.privy.systems wss://*.privy.systems https://*.rpc.privy.systems
    https://oauth.telegram.org https://telegram.org
    https://explorer-api.walletconnect.com https://api.web3modal.org
    https://pulse.walletconnect.org https://relay.walletconnect.com
    wss://relay.walletconnect.com https://registry.walletconnect.com;
  frame-src https://plugin.jup.ag https://auth.privy.io https://*.privy.io
    https://oauth.telegram.org https://telegram.org;
  object-src 'none';
  base-uri 'self';
" />
```

**Positive aspects:**
- `object-src 'none'` — correct, no Flash or plugins
- `base-uri 'self'` — prevents base tag injection
- `frame-src` correctly includes all Privy domains for the wallet iframe
- Privy domains properly covered in `connect-src`

**Concerns:**

1. **`frame-ancestors` cannot be set via `<meta>`**: This is a browser security specification. The `frame-ancestors` directive is explicitly excluded from meta-tag CSP by the [CSP Level 2 spec](https://www.w3.org/TR/CSP2/#frame-ancestors-and-frame-options). Browsers will ignore `frame-ancestors` if set in a `<meta>` tag. To prevent clickjacking of `solshot.gg`, a `Content-Security-Policy: frame-ancestors 'self'` HTTP header must be served via Vercel's `headers` config in `vercel.json`.

2. **`'unsafe-inline'` in `script-src`**: The client meta CSP allows `'unsafe-inline'` scripts. This is caused by the Eruda debug loader at lines 50-71 of `index.html`, which is an inline `<script>` block that conditionally loads eruda from `cdn.jsdelivr.net`. React's build output (CRA) also injects some inline scripts in the HTML template. With `'unsafe-inline'`, any injected inline script (from XSS or a compromised third-party) executes freely.

3. **Localhost origins in production CSP**: The `connect-src` contains `http://localhost:5001`, `ws://localhost:5001`, and `wss://localhost:5001` with no environment guard. The server's `devConnectSrc` is correctly guarded by `IS_PRODUCTION` (line 132-136), but the client's meta CSP is a static file and does not go through a build-time env substitution for these entries. In production, users' browsers will have a CSP that permits connections to `localhost:5001`. An XSS exploit could exfiltrate wallet addresses or match data to a locally running process on port 5001.

4. **`cdn.jsdelivr.net` in `script-src` without SRI**: The eruda loader loads from `https://cdn.jsdelivr.net/npm/eruda` — this resolves to the latest version of the eruda npm package. No SRI (`integrity=`) attribute is set. A malicious version of `eruda` published to npm, or a CDN-layer attack, could serve arbitrary JavaScript to anyone triggering the debug mode.

5. **`https://cdn.jsdelivr.net` scope**: This CDN hosts thousands of npm packages. Allowlisting the entire CDN origin (not a specific version URL with SRI) means any package on jsdelivr is effectively allowable, massively widening the supply chain attack surface.

6. **`*.privy.io` wildcard in `frame-src`**: Allows framing from any Privy subdomain. If Privy ever registers new subdomains or if an attacker registers a subdomain under `privy.io` (unlikely but possible in edge cases), this could load attacker-controlled content in a frame within the SolShot context.

### 5. Telegram WebApp / frame-ancestors Analysis

The concern from the task spec (item 4) about Telegram WebView requiring `frame-ancestors` was partially superseded by an architecture change. From `server/services/bot.js:33-44`:

```javascript
// 2026-05-04: switched off Mini App architecture. URL now points at the
// solshot.gg PWA instead of `t.me/SolShotGG_bot/play`. URL buttons in
// Telegram inline keyboards open external URLs in the in-app browser
// (TG iOS) / default browser (TG Desktop) / new tab (TG Web) — a
// top-level browsing context, NOT a nested Mini App iframe.
```

**Conclusion:** `frame-ancestors` allowing `telegram.org` is NOT required for the current architecture. The game opens as a top-level browsing context, not inside a Telegram iframe. However, the lack of `frame-ancestors` protection means `solshot.gg` can still be framed by any other origin (an attacker site), enabling clickjacking of wallet-signing flows.

### 6. HSTS Analysis

- **Server (API):** Helmet defaults provide `Strict-Transport-Security: max-age=31536000; includeSubDomains`. This applies to `solshot-server.onrender.com`. No `preload` flag.
- **Client (Vercel):** No HSTS header in `vercel.json`. Vercel may apply its own HTTPS redirect, but the `Strict-Transport-Security` header is not explicitly set.

Helmet 8 default max-age (365 days) is below the HSTS preload list minimum requirement of 365 days (exactly 31536000 seconds), so it qualifies for preload submission if `preload` were added.

### 7. Cookies and Sessions

SolShot does not use traditional session cookies. Authentication is wallet-signature based (JWTs stored client-side). No `express-session` or cookie-based session management is used on the server. This means cookie flags (Secure, HttpOnly, SameSite) are not a concern for session management.

However, any third-party scripts (Privy, Jupiter, WalletConnect) may set their own cookies. The `Permissions-Policy` header cannot control cookies, but `SameSite` attributes on Privy-set cookies are Privy's responsibility.

## Trust Model

The server API endpoint (`solshot-server.onrender.com`) operates with a well-configured security header stack via helmet. CORS is allowlisted, CSP is set, X-Frame-Options prevents framing, HSTS enforces HTTPS, and Referrer-Policy prevents URL leakage.

The client deployment (`solshot.gg` on Vercel) has a completely different trust posture: no HTTP security headers, only a `<meta>` CSP that cannot enforce clickjacking protection. This is the actual attack surface — the game UI where wallet transactions are signed. The split is caused by the architectural separation: the Express server's middleware stack protects the API, but Vercel's CDN layer serves the SPA without a middleware stack.

## State Analysis

No persistent security header state. CORS origins are loaded at server startup from env var (`CORS_ORIGINS`). The client CSP is static HTML. No caching or dynamic generation of CSP.

## Dependencies

- `helmet@^8.1.0` (server) — provides all server-side security headers; defaults well-configured
- `cors@^2.8.6` (server) — provides CORS middleware; correctly configured
- Vercel deployment (client) — CDN; `vercel.json` controls headers; currently unconfigured for security

## Focus-Specific Analysis

### Concern 1: Vercel Zero Security Headers (HIGH)

**File:** `client/vercel.json`
**Issue:** The entire `headers` array only sets Cache-Control. Zero security headers.
**Impact:** `solshot.gg` (the game UI) has no HTTP-level clickjacking protection, no HSTS, no MIME sniffing protection. The meta CSP in `index.html` partially compensates but cannot set `frame-ancestors`.
**Fix:** Add a `headers` rule in `vercel.json` for `source: "/(.*)"` setting:
- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy` (with `frame-ancestors 'self'`)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Concern 2: Dead Dynamic Origins in Server CSP (HIGH)

**File:** `server/index.js:163-168`
**Issue:** `https://app.dynamic.xyz` and `https://api.dynamic.xyz` remain in `connectSrc` (line 163-164) and `https://app.dynamic.xyz` in `frameSrc` (line 168). The project migrated from Dynamic to Privy before May 2026.
**Impact:**
- `frameSrc` entry: if `app.dynamic.xyz` were compromised, it could render content in a frame within the SolShot API context.
- `connectSrc` entries: in-browser scripts could send requests to Dynamic's API endpoints (potentially exfiltrating data if combined with XSS).
**Fix:** Remove both `dynamic.xyz` entries from the server helmet CSP.

### Concern 3: `unsafe-inline` and Eruda Supply Chain (MEDIUM)

**File:** `client/public/index.html:7, 50-71`
**Issue:** An inline script block dynamically loads eruda from `cdn.jsdelivr.net/npm/eruda` without SRI. This forces `'unsafe-inline'` and `'cdn.jsdelivr.net'` in `script-src`.
**Impact:** `'unsafe-inline'` disables most XSS protection from CSP. The eruda npm package is a supply chain dependency without version pinning or integrity verification.
**Fix:** Move the debug loader to a standalone `debug-loader.js` file (not inline), add an SRI hash for the specific eruda version used, and pin the version in the URL.

### Concern 4: Hardcoded Localhost in Client CSP (MEDIUM)

**File:** `client/public/index.html:7`
**Issue:** `connect-src` includes `http://localhost:5001`, `ws://localhost:5001`, `wss://localhost:5001` unconditionally. The server guards these with `IS_PRODUCTION` (line 132), but `index.html` is static and not processed for env substitution.
**Impact:** An XSS payload in production can connect to `localhost:5001` if a process is listening there.
**Fix:** Remove localhost entries from the `<meta>` CSP. Use the Vercel `vercel.json` headers to set a production-appropriate CSP (which can be environment-specific via Vercel's env var system). Alternatively, use CRA's environment variable substitution via `%REACT_APP_*%` in `index.html` if the build process supports it.

### Concern 5: `report-uri` Deprecation (LOW)

**File:** `server/index.js:171`
**Issue:** CSP uses the deprecated `report-uri /api/csp-report` directive.
**Fix:** Add a `Report-To` header to the helmet configuration and use `report-to` directive with a named endpoint group.

### Concern 6: `Permissions-Policy` Absent (LOW)

**File:** `server/index.js`, `client/vercel.json`
**Issue:** No `Permissions-Policy` header is set anywhere.
**Fix:** Add to both the server helmet config and `vercel.json`.

## Cross-Focus Intersections

- **WEB-01 (XSS)**: `'unsafe-inline'` means CSP provides zero XSS mitigation. Any XSS finding from WEB-01 will have unmitigated impact.
- **CHAIN-03 (Wallet Adapter)**: Privy wallet-signing iframe is embedded in `solshot.gg`. Missing `frame-ancestors` on `solshot.gg` enables UI redress attacks against the signing flow.
- **FE-02 (Third-Party Scripts)**: `cdn.jsdelivr.net` without SRI is a supply chain risk. `plugin.jup.ag/plugin-v1.js` is also loaded without SRI.
- **DATA-04 (Logging)**: The `Referrer-Policy` on `solshot.gg` is unset; if users navigate from game pages that include wallet addresses in URLs, full URLs leak via Referer headers to external services in `connect-src`.

## Risk Observations

**Priority order:**

1. **HIGH — No security headers on Vercel client**: `client/vercel.json` — solshot.gg serves the game UI to all players with zero HTTP security headers. Clickjacking, MIME sniffing, and URL leakage are all unmitigated at the HTTP layer.

2. **HIGH — `frame-ancestors` not enforced on client**: `client/public/index.html:7` + absence in `client/vercel.json` — The Privy wallet signing modal runs inside an iframe in `solshot.gg`. Framing `solshot.gg` in an attacker page allows overlaying invisible elements over the signing confirmation button, tricking users into approving malicious transactions.

3. **HIGH — Dead Dynamic origins in server CSP**: `server/index.js:163-168` — `app.dynamic.xyz` in `frameSrc` and `connectSrc` are operational CSP entries for a dead integration. Unnecessary attack surface.

4. **MEDIUM — `unsafe-inline` in client script-src**: `client/public/index.html:7` — Defeats CSP XSS protection. Caused by inline Eruda debug loader.

5. **MEDIUM — Localhost in production client CSP**: `client/public/index.html:7` — Allows in-browser scripts to connect to `localhost:5001` in production.

6. **MEDIUM — `cdn.jsdelivr.net` without SRI**: `client/public/index.html:7,65` — Broad CDN origin, eruda loaded without version pinning or integrity hash.

7. **MEDIUM — No Permissions-Policy**: Both surfaces — No explicit restrictions on browser feature APIs.

8. **LOW — HSTS missing `preload`**: Server side — Functional HSTS present (365d) but not submitted for browser preload list.

9. **LOW — `report-uri` deprecated**: `server/index.js:171` — Functional but deprecated CSP reporting mechanism.

## Novel Attack Surface Observations

**UI Redress via Privy Wallet Signing + Missing `frame-ancestors`:**
An attacker builds a page that embeds `solshot.gg` in a transparent iframe. They overlay styled elements (buttons, text) that align visually with the Privy "Sign" confirmation button. When a user visits the attacker's page and clicks the fake UI, they are actually clicking the Privy signing modal inside the embedded `solshot.gg` iframe, potentially authorizing a malicious transaction (e.g., a large escrow deposit to an attacker's match ID). This attack is feasible because: (a) `solshot.gg` has no `frame-ancestors` header, and (b) Privy's signing UI appears predictably during match deposit flows. The attack requires social engineering the user to visit the attacker's page, but the consequences (signing a SOL deposit) are financially significant.

**Localhost Port Squatting via Production CSP:**
If an attacker can deliver a malicious browser extension or have a malicious local app running on the victim's machine at `localhost:5001`, an XSS payload on `solshot.gg` can exfiltrate data to that local server. The `connect-src` allowlist in the meta CSP explicitly permits this connection, making it policy-compliant from the browser's perspective.

## Questions for Other Focus Areas

- **WEB-01**: What specific XSS vectors exist in the React component tree? Given `unsafe-inline` in `script-src`, any XSS would have unmitigated execution.
- **CHAIN-03**: Does the Privy wallet signing modal have its own `frame-ancestors` protection? Would Privy's iframe itself prevent clickjacking of the signing UI even if the outer page doesn't?
- **FE-02**: Is the `plugin.jup.ag/plugin-v1.js` script loaded with any SRI verification? The inline script tag at line 21 of `index.html` has no `integrity` attribute.

## Raw Notes

- Helmet 8.1.0 defaults verified by reading `index.cjs` directly. Default Referrer-Policy: `no-referrer`. Default HSTS: `max-age=31536000; includeSubDomains` (no `preload`). Default `frame-ancestors`: `'self'`.
- The `crossOriginEmbedderPolicy: false` in `server/index.js:174` is intentional — enabling COEP would block cross-origin resources that don't send CORP headers (most Solana RPC endpoints), breaking the app.
- No express-session or cookie-based sessions anywhere in the server. JWT is used and stored client-side. Cookie security flags are therefore out of scope for server-managed state.
- The `www.` → non-`www.` redirect at `server/index.js:119-128` is production-only and applies to the API server domain, not to `solshot.gg` (which is handled by Vercel's own routing).
- Telegram WebApp concern (task item 4) is moot: architecture switched from Mini App (iframe) to top-level browser URL as of 2026-05-04 per `bot.js:33-44`. No `frame-ancestors` allowlisting for `telegram.org` is required.
- The `sol-shot.vercel.app` preview URL is included in `CORS_ORIGINS`; this is intentional for preview deployments but means any Vercel preview URL matching `sol-shot.vercel.app` is in the CORS allowlist. Vercel preview URLs are typically randomized (e.g., `sol-shot-git-branch-abc.vercel.app`), so the exact `sol-shot.vercel.app` should only resolve to the stable preview URL — acceptable.
