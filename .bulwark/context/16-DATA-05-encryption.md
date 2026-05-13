---
task_id: db-phase1-data-05-encryption
provides: [data-05-findings, data-05-invariants]
focus_area: DATA-05
files_analyzed:
  - server/services/walletLinkTokens.js
  - server/services/privyAuth.js
  - server/services/keys.js
  - server/index.js
  - server/middleware/auth.js
  - server/middleware/guards.js
  - server/middleware/telegram.js
  - server/models/User.js
  - server/services/shot-token.js
  - server/services/groupchat/index.js
  - client/src/wallet/WalletContext.js
  - client/src/App.js
  - client/.env.example
  - server/.env.example
finding_count: 9
severity_breakdown: {critical: 1, high: 3, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# DATA-05: Encryption & Data Protection — Condensed Summary

## Key Findings (Top 9)

- **Keypair secret never zeroed (KM-04 regression)**: `keys.js` comment at line 56 explicitly documents that the `bytes.fill(0)` zeroization was REMOVED because `Keypair.fromSecretKey` aliases the input buffer. The escrow authority secret key lives unzeroized in a `Uint8Array` that is referenced from `_escrowKeypair.secretKey` for the entire server lifetime — `server/services/keys.js:51-65`
- **`SOLANA_KEYPAIR_JSON` as env var**: The 64-byte private key is accepted as a plain JSON array in an environment variable (`server/services/keys.js:33-45`). On Render, env vars appear in the process listing, deployment logs, and are accessible to any code running in the same dyno. If this path is used in production, the full private key is exposed as a string in the environment.
- **No at-rest encryption of PII**: MongoDB Atlas free tier (assumed from connection string shape in `.env.example`) provides no automatic encryption at rest. `walletAddress`, `telegramUserId`, `handle`, and `username` are stored as plaintext fields in the `users` collection with no Mongoose field-level encryption or application-layer encryption — `server/models/User.js`
- **Magic-link token in URL query param**: The 32-byte CSPRNG token is embedded as `?linkToken=<base64url>` in a URL DMed to the user (`server/services/bot.js:605`). URLs containing this token will appear in: (a) browser URL bar, (b) browser history, (c) Telegram's link preview cache, (d) any proxies between the user and the server. The token is single-use and 10-min TTL, but the URL is recorded before the token is consumed.
- **Admin API key comparison is timing-unsafe**: `requireAdminKey` uses `!==` string equality (`server/middleware/guards.js:27`). An attacker can measure server response time to enumerate correct key prefix character by character. Applies to `/api/admin/reload-keys` and `/stats`.
- **Magic-link token stored plaintext in-memory**: The raw token is the Map key in `walletLinkTokens.js`. If the process memory is dumped (e.g., via `--inspect` attach, Node heap dump, core dump), all live tokens are recoverable. A timing-safe comparison on consumeLinkToken would not defend against memory inspection but hashing the token (store `sha256(token)`, compare `sha256(submitted)`) is the correct pattern for this class of secret.
- **Privy JWT verification soft-fail by default**: `requirePrivyAuth({ required: false })` is used on `/api/wallet/link-from-tg-token`. This means even when `PRIVY_APP_ID`+`PRIVY_APP_SECRET` are configured, an attacker with only the magic-link token (no valid Privy session) can still complete the wallet bind — `server/index.js:432`. The comment at line 421 acknowledges this is intentional, but it negates the "defense in depth" framing.
- **`Math.random()` used for group match IDs**: `server/services/groupchat/index.js:35` generates 4-character match IDs using `Math.floor(Math.random() * ID_ALPHABET.length)`. These IDs are not cryptographic but are used as room-join handles. An attacker who can predict the next `Math.random()` output (V8 XorShift128 PRNG, seeded at process start, fully predictable given enough observations) could enumerate or predict active match IDs.
- **`Math.random()` used for background/turn randomness**: `server/services/groupchat/lifecycle.js:291,317` and `server/socket-io/main.js:4380` use `Math.random()` for first-player selection and background index — not security-sensitive, but inconsistent with CSPRNG use elsewhere; worth noting for completeness.

## Critical Mechanisms

- **Escrow keypair lifecycle**: `initKeys()` parses env var or file, creates `Uint8Array`, passes to `Keypair.fromSecretKey()`, and the original bytes array stays aliased to `keypair.secretKey`. No zeroization. `_escrowKeypair` is a module-level singleton used for every `createMatch`, `settleMatch`, `cancelMatch` Anchor CPI — `server/services/keys.js:32-93`
- **Magic-link token flow**: `mintLinkToken()` → CSPRNG `randomBytes(32).toString('base64url')` → stored as Map key (plaintext) → DM'd in URL as `?linkToken=...` → client POSTs `(token, walletAddress)` → `consumeLinkToken()` deletes on first lookup regardless of TTL — `server/services/walletLinkTokens.js:56-82`
- **Privy JWT verification**: `@privy-io/server-auth` `PrivyClient.verifyAuthToken()` is called for the Authorization bearer. Verification is skipped (pass-through) if env vars are absent — `server/services/privyAuth.js:33-44`. Algorithm pinning is delegated to Privy's SDK; no explicit `alg` enforcement visible in this codebase.
- **Telegram initData HMAC**: `crypto.createHmac('sha256', secretKey)` with `crypto.timingSafeEqual()` comparison — `server/middleware/telegram.js:43-56`. This is correct and timing-safe.
- **JWT signing**: `jsonwebtoken.sign({ wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' })` — `server/middleware/auth.js:97-101`. JWT_SECRET defaults to `crypto.randomBytes(32)` in dev (ephemeral); must be set in production or server.exit(1). No algorithm pinning (defaults to HS256).
- **localStorage handle cache**: `solshot_handle` and `solshot_uid` are written to `localStorage` — `client/src/wallet/WalletContext.js:400`, `client/src/App.js:119-120`. These are display names and session UIDs, not keys or tokens.

## Invariants & Assumptions

- INVARIANT: Magic-link token is consumed on first successful lookup — `server/services/walletLinkTokens.js:79`. ✓ Enforced.
- INVARIANT: Magic-link tokens expire after 10 minutes — `server/services/walletLinkTokens.js:80`. ✓ Enforced on consume. ASSUMPTION FAILURE: the token URL in Telegram history is not invalidated by TTL expiry (URL still readable, just cannot be reused after TTL).
- INVARIANT: Telegram initData HMAC must be timing-safe — `server/middleware/telegram.js:56`. ✓ Enforced with `crypto.timingSafeEqual`.
- INVARIANT: JWT_SECRET must be set in production — `server/middleware/auth.js:19-27`. ✓ Enforced via `process.exit(1)`.
- INVARIANT: CSPRNG used for room IDs and terrain seeds — `server/socket-io/main.js:2212`. ✓ Enforced for these paths.
- ASSUMPTION: `SOLANA_KEYPAIR_JSON` value is not exposed in Render logs or dashboards — **UNVALIDATED**. Render's service logs are accessible to the user and are often forwarded to third-party log aggregators, making this a meaningful exposure path.
- ASSUMPTION: MongoDB Atlas provides sufficient at-rest encryption for PII at the free/shared tier — **UNVALIDATED**. Atlas M0 (free shared cluster) does NOT offer encryption at rest in the same way as dedicated M10+ clusters with KMS integration.
- ASSUMPTION: Privy embedded wallet key material never touches this server — **VALIDATED by design** (Privy handles key custody; server only sees `walletAddress` pubkey string, never the private key).
- ASSUMPTION: `Math.random()` use in groupchat/index.js is not security-sensitive — **PARTIALLY VALIDATED** (match IDs are room handles, not secret tokens, but predictability could enable match interference).

## Risk Observations (Prioritized)

1. **[CRITICAL] Escrow keypair unzeroized in process memory**: `keys.js:51-65` — the 64-byte private key lives in a `Uint8Array` aliased by `_escrowKeypair.secretKey` for the entire server process lifetime. Any Node.js heap dump or process memory read (via `--inspect`, OS-level, or a future `child_process` execution vulnerability) exposes the escrow authority key.
2. **[HIGH] `SOLANA_KEYPAIR_JSON` env var contains raw private key bytes**: `keys.js:33-45` — the 64-byte secret key is loaded from an environment variable as a plain JSON array. Render env vars appear in build logs and may be forwarded to log aggregators.
3. **[HIGH] No field-level encryption for PII in MongoDB**: `server/models/User.js` — `walletAddress`, `telegramUserId`, `handle`, `username`, and `matchHistory` are all stored in plaintext. A MongoDB Atlas credential compromise or Atlas UI access provides immediate cleartext PII access.
4. **[HIGH] Admin API key compared with `!==` (timing-unsafe)**: `server/middleware/guards.js:27` — string equality is not constant-time. Affects `/api/admin/reload-keys` (triggers key reload) and `/stats` (financial metrics). Should use `crypto.timingSafeEqual`.
5. **[MEDIUM] Magic-link token in URL query param**: `server/services/bot.js:605` — the full 32-byte token is in the URL. URLs are logged by browsers, proxies, and Telegram's infrastructure. Even with single-use semantics, the URL is replayed-safe only after the first consume.
6. **[MEDIUM] Privy JWT soft-fail allows magic-link-only wallet binding**: `server/index.js:432` — `requirePrivyAuth({ required: false })` means an attacker with only the TG-DM'd token (but no Privy session) can still bind a wallet. Defense-in-depth is advertised but the inner layer is not enforced.
7. **[MEDIUM] Magic-link token stored as plaintext Map key**: `server/services/walletLinkTokens.js:43,62` — the raw token is the map key. If the heap is dumped, all live tokens are recoverable. Storing `sha256(token)` as the map key and comparing `sha256(submitted)` would eliminate this exposure.
8. **[LOW] `Math.random()` for group match ID generation**: `server/services/groupchat/index.js:35` — V8 XorShift128 is seeded at startup and predictable after ~32+ observations. Match IDs are 4-character room handles; predicting one enables joining an active match uninvited.
9. **[LOW] No HSTS header configured**: `server/index.js` uses `helmet()` but the `Strict-Transport-Security` directive is not explicitly set with a long `max-age`. TLS termination is handled by Render's infrastructure, but no HSTS push from the application layer means new clients don't get HTTPS-upgrade guarantees on first visit.

## Novel Attack Surface

- **Heap-dump via Node.js inspector + keypair extraction**: If an attacker can attach `--inspect` to the running Render dyno (e.g., via a code execution vulnerability in any dependency, or a misconfigured debug endpoint), the `_escrowKeypair.secretKey` Uint8Array at `keys.js:52` is directly readable as it is the sole in-memory copy. The comment in keys.js at line 56 explicitly describes this as a known limitation — it is not a missed edge case but a residual risk documented by the developer.
- **Telegram link preview caches the `linkToken` URL**: When the bot DMs the magic-link URL, Telegram's link preview service fetches the URL before the user clicks. This pre-fetch may consume the token before the intended user does. At minimum the URL is in Telegram's server logs for the TTL window.

## Cross-Focus Handoffs

- → **SEC-01 (Private Key Security)**: The keypair zeroization regression in `keys.js:56-64` and the `SOLANA_KEYPAIR_JSON` env var path are direct concerns for that auditor. Cross-reference with the escrow signing paths in `escrow.js` and `escrow-v2.js`.
- → **AUTH-01 (Authentication)**: The JWT HS256 algorithm (`auth.js:97`) has no explicit algorithm pinning — an `alg: none` attack is theoretically possible if the `jsonwebtoken` library version has the vulnerability. The Privy JWT verification algorithm pinning (delegated to `@privy-io/server-auth`) should also be verified.
- → **DATA-06 (PII & Data Privacy)**: The absence of at-rest encryption directly intersects with data privacy obligations. `walletAddress + telegramUserId` pairing in `User.js` creates a cross-platform identity link that is especially sensitive in gambling/gaming contexts where pseudonymity matters.

## Trust Boundaries

The server trusts that Render's environment variable store and process environment are not accessible to third parties. This assumption underlies the `SOLANA_KEYPAIR_JSON` and `PRIVY_APP_SECRET` storage model. The server trusts Privy's SDK for JWT algorithm validation and JWKS key fetching; no independent algorithm-pinning layer exists in this codebase. The client trusts the server never returns PII beyond what is needed (walletAddress + handle), which appears correct given the socket event payloads reviewed. MongoDB Atlas is trusted to provide adequate access control; there is no application-layer encryption as a second line of defense. The magic-link token model trusts the Telegram DM channel as a secure delivery medium, which is reasonable for the hackathon threat model but weakened by the URL-in-history problem.
<!-- CONDENSED_SUMMARY_END -->

---

# DATA-05: Encryption & Data Protection — Full Analysis

## Executive Summary

SolShot's encryption and data protection posture is appropriate for a hackathon-grade devnet deployment but has several gaps that are material for a production launch with real funds. The most critical issue is that the escrow authority keypair — which controls $SOL settlement for all wagered matches — lives unzeroized in process memory for the server lifetime, and its private key bytes can be loaded from an environment variable (a relatively exposed credential store). At-rest encryption for MongoDB PII is absent. The magic-link token mechanism is CSPRNG-quality for generation but leaks the raw token into URLs. The one timing-safe comparison that exists (Telegram HMAC) is correct; the admin API key comparison is not. Privy JWT verification is correctly structured but configured in soft-fail mode for the primary wallet-link endpoint.

## Scope

Files analyzed: `server/services/walletLinkTokens.js`, `server/services/privyAuth.js`, `server/services/keys.js`, `server/index.js`, `server/middleware/auth.js`, `server/middleware/guards.js`, `server/middleware/telegram.js`, `server/models/User.js`, `server/services/shot-token.js`, `server/services/groupchat/index.js`, `client/src/wallet/WalletContext.js`, `client/src/App.js`, `client/.env.example`, `server/.env.example`.

## Key Mechanisms

### 1. Escrow Keypair — `server/services/keys.js`

`initKeys()` accepts the private key via either:
- `SOLANA_KEYPAIR_PATH`: reads a JSON file, parses to `Uint8Array`, passes to `Keypair.fromSecretKey(bytes)`
- `SOLANA_KEYPAIR_JSON`: parses JSON directly from env var

After keypair construction, a comment at line 56-64 explicitly documents that the original `bytes.fill(0)` zeroization call was removed because `@solana/web3.js 1.98.4` aliases the input `Uint8Array` — `keypair.secretKey` IS `bytes`. Zeroing `bytes` would zero the keypair's own secret. The developer confirmed this empirically (see log timestamp 2026-05-03 21:33Z in the comment).

**Current state**: The 64-byte secret key lives in `_escrowKeypair.secretKey` — a module-level singleton — for the entire process lifetime. There is no zeroization path. If a heap dump is possible, the key is recoverable.

**`SOLANA_KEYPAIR_JSON` env var risk**: Render environment variables are: (a) visible in the Render dashboard to any team member with access, (b) often forwarded to log aggregators (Datadog, PaperTrail, etc.) if the customer configures log draining, (c) visible in Render build logs if any startup script echoes environment. A 64-element JSON array in an env var is the complete Ed25519 private key.

### 2. Magic-Link Tokens — `server/services/walletLinkTokens.js`

Generation: `crypto.randomBytes(32).toString('base64url')` — 256 bits of entropy. This is CSPRNG quality and appropriate.

Storage: Raw token string used as Map key (`store.set(token, entry)`). The map key IS the secret. In a heap dump scenario, iterating `store.entries()` returns all live tokens in plaintext.

The hardened pattern is: store `sha256(token)`, validate by computing `sha256(submitted)` and comparing with `crypto.timingSafeEqual`. This is how OWASP recommends storing one-shot tokens (server-side session tokens, CSRF tokens, magic-link tokens).

Token delivery: The raw base64url token is appended to the DM URL as `?linkToken=<token>` (`server/services/bot.js:605`). This URL is stored in: Telegram message history (accessible by Telegram admins), browser URL bar history, browser localStorage (if visited), proxy access logs. The 10-minute TTL limits the effective window but does not make the URL ephemeral — it persists in history after expiry.

Consumption semantics: `consumeLinkToken()` deletes the map entry on any lookup (whether expired or not), then checks TTL. This means a token can only be checked once, which is correct single-use semantics. However, if the expiry check fails, the entry is already deleted and the attacker who triggered the expiry check has effectively burnt the token before the legitimate user could use it. This is a denial-of-service against the legitimate user (they'd need to re-run `/link`), not a security escalation.

### 3. Privy JWT Verification — `server/services/privyAuth.js`

`PrivyClient.verifyAuthToken(token)` uses Privy's JWKS endpoint for algorithm-agnostic verification. The SDK handles algorithm pinning. No explicit `alg` enforcement is done in this codebase.

`requirePrivyAuth({ required: false })` wraps the `/api/wallet/link-from-tg-token` endpoint. "Soft" mode means: if the token is absent or invalid, the request passes through with `req.privyAuth = null`. The downstream handler then falls back to the magic-link token as the sole auth factor. The comment at `server/index.js:421-432` acknowledges this is intentional ("we shouldn't break the magic-link path"). The result is that the Privy JWT layer adds no security to this specific endpoint when `PRIVY_APP_SECRET` is configured, because an attacker who has intercepted the magic-link token (but not the Privy session) can omit the JWT entirely and still bind the wallet.

`requirePrivyAuth({ required: true })` IS used on `/api/wallet/link-from-privy-telegram`, so the stricter endpoint is correctly gated.

### 4. Telegram initData HMAC — `server/middleware/telegram.js`

Correct implementation:
- HMAC-SHA256 of bot token with static key "WebAppData" — matches Telegram spec
- HMAC-SHA256 of data-check-string with derived key
- `crypto.timingSafeEqual()` for comparison (line 56) — timing-safe ✓
- 24-hour `auth_date` staleness check (line 68-74) — replay window bound ✓

### 5. JWT Signing — `server/middleware/auth.js`

`jwt.sign({ wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' })` — `jsonwebtoken` defaults to HS256. No explicit algorithm pinning. HS256 is a symmetric HMAC algorithm; the secret is `JWT_SECRET` (env var). In dev, a fresh 32-byte random secret is generated on each start (ephemeral, does not survive restarts). In production, `process.exit(1)` enforces that `JWT_SECRET` must be set.

Note: per `HANDOVER.md` and previous audit findings, the generated JWT is never actually consumed by any downstream middleware (dead code path — `verifyToken` was removed). The token is emitted to the client in `handleAuthenticate()` but the server socket handlers use `client.isAuthenticated` (socket flag), not JWT validation. This is a pre-existing finding (H029 from Bulwark #1).

### 6. Admin API Key Comparison — `server/middleware/guards.js`

```js
if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
```

`!==` on strings is NOT timing-safe. V8 string comparison short-circuits on the first differing character. An attacker who can make many requests and measure response times can enumerate the correct key one character at a time. The fix is:

```js
crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(process.env.ADMIN_API_KEY))
```

This affects `/api/admin/reload-keys` (forces server-side keypair reload) and `/stats` (financial metrics). The reload endpoint is particularly sensitive: triggering it from an invalid key path could cause the escrow to be disabled mid-session.

### 7. MongoDB At-Rest Encryption

`server/models/User.js` stores: `walletAddress` (Solana pubkey), `telegramUserId` (numeric TG ID), `handle` (display name), `username` (TG username), `matchHistory` (game results with opponent handles). There is no field-level encryption, no Mongoose plugin for encryption, and the connection string in `.env.example` points to MongoDB Atlas with no encryption options in the connection string.

MongoDB Atlas free tier (M0) does NOT provide customer-managed encryption at rest or Queryable Encryption. Data is physically stored without application-layer encryption. A credential compromise of the Atlas account exposes all PII in cleartext.

The pairing `(walletAddress, telegramUserId)` is particularly sensitive: it deanonymizes Telegram users to their blockchain identities. In gambling/gaming contexts this may have regulatory implications.

### 8. Client-Side Storage — `localStorage` and `sessionStorage`

Items written to `localStorage`:
- `solshot_handle` — display name (written by `WalletContext.js:400`, `App.js:119`, `HandleModal.js:144`)
- `solshot_uid` — session UID (written by `App.js:120`, `HandleModal.js:145`)
- `solshot_escrow_seen` — UI flag (boolean)
- `solshot_prestige_intro_seen` — UI flag
- `solshot_debug` — debug mode toggle
- `solshotDebug` — variant debug flag
- Various `solshot_*_intro_seen` flags

Items written to `sessionStorage`:
- `solshot_portrait_dismissed` — portrait orientation banner
- `solshot_dapp_banner_dismissed` — dApp banner flag
- Session-scoped banner flags

**Assessment**: No wallet private keys, session tokens, or PII of consequence (wallet address, TG user ID) are stored in `localStorage`. The `handle` and `uid` are considered low-sensitivity (display names / server-assigned IDs). The Privy session token is managed entirely by Privy's own SDK and stored in Privy's own storage mechanism (typically `localStorage` under a Privy-namespaced key), not by this application code. The `walletAddress` pubkey is not observed being stored to `localStorage` in any reviewed file. This area appears generally sound for the devnet scope.

### 9. RPC / In-Transit Encryption

All Solana RPC calls (`https://api.devnet.solana.com`, `wss://api.devnet.solana.com`) use HTTPS/WSS. The CSP `connectSrc` in `server/index.js` only lists `https://` and `wss://` endpoints. `NODE_TLS_REJECT_UNAUTHORIZED` is not set anywhere in the codebase. `rejectUnauthorized: false` does not appear in any reviewed file. TLS certificate validation is using Node.js defaults (enforced).

TLS termination for client-facing traffic is handled by Render's infrastructure (standard for PaaS). The server starts with `http.createServer(app)` (plain HTTP) and binds to `0.0.0.0:PORT` — Render terminates TLS at its load balancer and forwards plaintext to the dyno. This is a normal deployment pattern but means traffic between the Render load balancer and the application process is unencrypted within Render's network.

No HSTS is explicitly set in `helmet()` call at `server/index.js:138-175`. Helmet's default HSTS config (`max-age=15552000`) IS included in Helmet v7 defaults, but it should be verified as active.

### 10. Key Derivation

No KDF usage (PBKDF2, scrypt, argon2) is present in this codebase. There are no user passwords to hash (authentication is wallet signature + Privy OAuth). The JWT secret is a raw random string, not KDF-derived. This is acceptable given the authentication model.

### 11. PRNG Quality — Summary

| Use | PRNG | Appropriate? |
|---|---|---|
| Room ID (`main.js:2212`) | `crypto.randomBytes(4)` | ✓ |
| Terrain seed (`main.js:4371`) | `crypto.randomBytes(16)` | ✓ |
| Weapon spawn (`main.js:3361`) | `crypto.randomBytes(safeCount * 4)` | ✓ |
| Magic-link token (`walletLinkTokens.js:60`) | `crypto.randomBytes(32)` | ✓ |
| Challenge shortcode (`challenge.js:27`) | `crypto.randomBytes(3)` | ✓ |
| Referral code (`referrals.js:37`) | `crypto.randomBytes(3)` | ✓ |
| Group match ID (`groupchat/index.js:35`) | `Math.random()` | ✗ (predictable) |
| Background index (`main.js:4380`) | `Math.random()` | Low risk |
| First player selection (`lifecycle.js:291`) | `Math.random()` | Low risk |
| AI behavior (`ai.js`) | `Math.random()` | Acceptable |

## Trust Model

The server's highest-value secret is the escrow authority keypair. It is stored: (a) on-disk at `SOLANA_KEYPAIR_PATH` (file system protection), or (b) in `SOLANA_KEYPAIR_JSON` env var (process environment). Neither path offers hardware-backed protection. At runtime, the key lives in process memory as a `Uint8Array` referenced by `_escrowKeypair.secretKey` with no zeroization path.

PII (wallet/TG identity pairs) is stored in MongoDB Atlas free tier with no application-layer encryption. The database is the trust boundary; a credential leak exposes all user data in cleartext.

The Privy embedded wallet is the correct trust model for user key custody: the server never handles user private keys. Privy's security model is assumed correct (not audited here).

## State Analysis

- **Magic-link token store**: In-memory `Map`. Lost on server restart. State: ephemeral, max 10-minute entries.
- **Verified burn TX set**: In-memory `Set` (server/services/shot-token.js:42). Lost on restart. Replay protection window = server uptime only.
- **Escrow keypair**: Module-level singleton. Lost on restart (would be re-loaded via `initKeys()`).
- **JWT generation**: Live for 24h per token; verification is effectively dead code (H029 from Bulwark #1).

## Dependencies

- `@privy-io/server-auth` — Privy JWT verification. Trusts Privy's JWKS endpoint.
- `jsonwebtoken` — HS256 JWT signing. No `alg` pinning.
- `tweetnacl` — Ed25519 signature verification for wallet auth.
- `@solana/web3.js 1.98.4` — Keypair aliasing behavior (confirmed empirically, see `keys.js:56-64` comment).
- `crypto` (Node.js built-in) — CSPRNG, HMAC, timing-safe compare.

## Focus-Specific Analysis

### F1 — At-Rest Encryption for PII

**Present**: None. Mongoose schema (`User.js`) has no encryption plugin, no virtual encrypt/decrypt fields, no field-level encryption via MongoDB's Queryable Encryption (CSFLE). The Atlas connection string has no `tlsCAFile` or KMS options.

**Impact**: A full Atlas credential compromise exposes: wallet addresses (Solana pubkeys), telegram user IDs, display handles, match history (opponent names + wager amounts + timestamps). The `(walletAddress, telegramUserId)` pair is the most sensitive — it cross-links blockchain identity to messaging platform identity.

**Recommendation**: For mainnet, minimum: enable Atlas encryption at rest (requires M10+ dedicated cluster). Better: application-layer field-level encryption for `walletAddress` and `telegramUserId` using a server-held KMS key. This way database access alone is insufficient to recover plaintext PII.

### F2 — In-Transit Encryption

All outbound RPC connections use HTTPS. TLS certificate validation is at Node.js defaults (enforced). No `rejectUnauthorized: false` found. Socket.IO WebSocket from clients is over WSS (Render terminates TLS). The transport layer is adequate.

### F3 — Magic-Link Token Security

**Token generation**: 32-byte CSPRNG (`crypto.randomBytes(32)`) → `base64url` encoding. This is 256 bits of entropy, far beyond any brute-force risk.

**Token storage**: Plaintext as Map key. Heap-accessible.

**Token delivery**: In URL query param. Exposed in browser history, Telegram message logs, and potentially proxy logs. A hardened approach would use a short-lived token delivered via a channel that doesn't persist the token in logs (e.g., a Telegram inline button with the token in a callback_data that is never displayed as a URL, or a server-side redirect that consumes the token on the server before redirecting). For the current hackathon threat model, the existing approach is pragmatic.

**Token comparison**: Direct map lookup — O(1) hash map, not timing-sensitive for this type of lookup (the token is the lookup key, not a comparison operand).

### F4 — JWT Signing Key Strength and Algorithm

`JWT_SECRET` is loaded from env var as a raw string. The `.env.example` comment says "change-me-to-a-random-64-char-string" — this suggests a hex string of 256 bits, which is adequate for HS256.

No explicit `algorithms` option is passed to `jwt.sign()`, defaulting to HS256. `jsonwebtoken` does not have the `alg: none` vulnerability in modern versions (fixed in 4.x+, current major versions enforce algorithm validation). However, if the server were to verify JWTs (currently dead code), explicitly passing `algorithms: ['HS256']` to `jwt.verify()` would be defense-in-depth.

### F5 — Client localStorage

No sensitive crypto material in `localStorage`. Handle (display name) and `solshot_uid` (server-assigned session UID, non-secret) are stored. Privy manages its own session state. This area is low risk.

### F6 — Cookies

No cookies are set by this application's server code. Privy may set cookies for its session, but those are managed by the Privy SDK. The Privacy Policy page at `client/src/screens/PrivacyScreen.js:43` states "SolShot uses essential cookies only for session management" — this should be verified against what Privy actually sets.

### F7 — Key Derivation

Not applicable. No passwords exist in this system. All authentication is via Ed25519 wallet signatures (asymmetric) or Privy OAuth (delegated to Privy).

### F8 — Random/Nonce Quality

CSPRNG usage is consistent for all security-critical paths (room IDs, terrain seeds, tokens, challenge codes, referral codes). The two `Math.random()` gaps are in non-cryptographic paths (match ID display names, aesthetic choices) with the exception of group match IDs, which function as access handles.

### F9 — Sensitive Data in URLs

`linkToken` appears in the URL: `https://solshot.gg/?linkToken=<base64url-token>`. This is the primary URL-based sensitive data exposure. Wallet addresses and TG user IDs do not appear to be passed as URL params in any reviewed endpoint.

### F10 — Backup Encryption

No backup configuration was found. MongoDB Atlas handles its own backup (continuous backups on paid tiers, snapshot backups on free tier). Atlas free tier backups are stored in Atlas-managed infrastructure; no customer-managed encryption option is available at the free tier. This is an inherited risk from the Atlas tier choice.

## Cross-Focus Intersections

- **SEC-01** (Private Key): The keypair aliasing issue in `keys.js` is both a DATA-05 concern (encryption/key storage) and a SEC-01 concern (private key handling). The two auditors should align findings here.
- **AUTH-01** (Authentication): JWT dead-code path and Privy JWT algorithm pinning are shared concerns.
- **DATA-04** (Logging): The `[privyAuth] Initialized` and `[Keys] Escrow authority: <pubkey>` log lines are low-risk (pubkey is public) but worth cross-checking for any log lines that might include key material.
- **DATA-06** (PII Privacy): The absence of at-rest encryption for `(walletAddress, telegramUserId)` is directly a data privacy concern.
- **INFRA-03** (Cloud/Env Config): The `SOLANA_KEYPAIR_JSON` env var containing a raw private key is also an infrastructure credential management concern.

## Cross-Reference Handoffs

- → **SEC-01**: Verify whether `@solana/web3.js 1.98.4` aliasing behavior is confirmed for the current package version. If a newer version copies the array (rather than aliasing), the zeroization comment in `keys.js:56-64` may be out of date. Either way, the escrow keypair's in-memory lifetime is the core finding.
- → **AUTH-01**: Verify whether the JWT `alg: none` mitigation is in place for the installed `jsonwebtoken` version. Also: the Privy SDK's algorithm pinning — does it enforce RS256/ES256 and reject `none`?
- → **DATA-06**: The PII coupling of `walletAddress` + `telegramUserId` + `username` in a single unencrypted MongoDB document has GDPR/KYC implications that DATA-06 should assess.
- → **INFRA-03**: The `SOLANA_KEYPAIR_JSON` env var pattern on Render is an infrastructure-level credential risk. What access controls are on the Render dashboard? What happens if a team member's Render account is compromised?

## Risk Observations

See Key Findings section (priority order: CRITICAL, HIGH x3, MEDIUM x3, LOW x2).

## Novel Attack Surface Observations

1. **Heap dump via Node.js inspector targeting keypair**: The dev comment in `keys.js:56-64` inadvertently documents the precise memory location of the unzeroized private key. An attacker with code execution in a dependency (e.g., via a supply chain attack in one of the 13 high-severity server npm vulnerabilities) could locate and exfiltrate `_escrowKeypair.secretKey` — the value that controls settlement of all wagered matches.

2. **Telegram link preview pre-fetch burns magic-link token**: Telegram's link preview bot fetches URLs when a message is sent. If the bot's DM URL is rendered as a link preview, Telegram's servers may HTTP-GET `https://solshot.gg/?linkToken=<token>` before the user taps it. The client-side WalletContext effect that POSTs the token back to the server fires on page load — but only after Privy provisions a wallet. A Telegram bot preview request is just a HEAD/GET with no Privy session, so it would not trigger the bind. However, the URL is in Telegram's log infrastructure.

3. **Group match ID enumeration via `Math.random()`**: V8's `Math.random()` uses XorShift128. Given ~64 consecutive observations of `Math.random()` output (observable by making many room ID generation requests), the internal state can be recovered and future outputs predicted. An attacker could predict 4-char group match IDs and join or disrupt active matches. The impact depends on what privileged actions an uninvited joiner can take in group matches.

## Questions for Other Focus Areas

- **AUTH-01**: Is the wallet signature auth message (`SolShot Auth: <wallet> at <timestamp>`) nonce-protected? The previous audit (Bulwark #1, H030) found a 5-minute replay window. Has this been addressed?
- **SEC-01**: Does `SOLANA_KEYPAIR_JSON` appear in any Render deployment logs or is it masked as a sensitive env var?
- **API-03**: Are group match IDs used as authorization tokens (i.e., knowing the match ID is sufficient to join)? If so, the `Math.random()` generation is a higher-severity issue.

## Raw Notes

- `keys.js` comment at line 56-64 is an unusually candid documentation of a known security limitation. This is good practice for audit purposes but also serves as a roadmap for an attacker.
- The `PRIVY_APP_ID` hardcoded in both `server/services/privyAuth.js:21` (as a comment) and `client/.env.example:22` — this is the public app ID, not a secret. Confirmed correct by Privy docs (app ID is public; secret is secret).
- `dynamc.xyz` appears in the CSP `connectSrc` and `frameSrc` — this is the old wallet stack (pre-Privy migration). Dead CSP entries are a minor information disclosure (reveal previous tech stack) and expand the allowed origins unnecessarily.
- No backup-specific encryption configuration was found. This is a gap for mainnet.
