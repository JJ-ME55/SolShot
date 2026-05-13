---
task_id: db-phase1-sec-02
provides: [sec-02-findings, sec-02-invariants]
focus_area: SEC-02
files_analyzed:
  - server/.env (NOT tracked — live credentials present)
  - client/.env (NOT tracked — stale, contains Dynamic env ID)
  - server/.env.example (TRACKED)
  - client/.env.example (TRACKED)
  - client/.env.production (TRACKED)
  - render.yaml (TRACKED)
  - server/index.js
  - server/services/keys.js
  - server/services/privyAuth.js
  - server/services/walletLinkTokens.js
  - server/middleware/auth.js
  - server/middleware/guards.js
  - server/middleware/telegram.js
  - server/socket-io/main.js (partial — auth + debug log sections)
  - client/src/wallet/WalletContext.js
  - client/src/lib/debugLog.js
  - client/src/components/DebugAuthOverlay.js
  - server/scripts/init-config.mjs
finding_count: 12
severity_breakdown: {critical: 2, high: 4, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# SEC-02: Secret & Credential Management — Condensed Summary

## Key Findings (Top 10)

- **Live MongoDB password in untracked .env**: `server/.env` contains `MONGODB_URI=mongodb+srv://solshot-server:Soja21245%21%21%21%21%21@solshot.e86gwap.mongodb.net/…` — plaintext Atlas password on disk. Not committed, but also not encrypted. — `server/.env:9`
- **Live Telegram bot token in untracked .env**: `server/.env:32` contains `TELEGRAM_BOT_TOKEN=8048345182:AAFtG0a-o2w_mZ8iw_QnEmyrk-lx3k_ZBXg` — any process that reads the filesystem can steal this token. Not committed; leak vector is shared dev machine or Docker layer copy.
- **JWT_SECRET never verified (dead credential)**: `server/middleware/auth.js` generates JWTs and the secret is set (or randomized), but the comment at line 104 states `verifyToken removed — was dead code (never imported anywhere)`. Tokens are generated and emitted to clients but never consumed server-side. The `JWT_SECRET` env var protects a one-way function nobody checks. — `server/middleware/auth.js:96-104`
- **PRIVY_APP_SECRET graceful-fail-open on /link endpoint**: `requirePrivyAuth({ required: false })` on `POST /api/wallet/link-from-tg-token` — if `PRIVY_APP_SECRET` is absent (env not set on Render, misconfigured, or deliberately stripped), the Privy JWT layer is silently skipped. The magic-link token is the only gate, making JWT defense-in-depth opt-in rather than fail-closed. — `server/index.js:432`, `server/services/privyAuth.js:35-38`
- **render.yaml missing PRIVY_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, JUP_API_KEY**: Four production secrets are absent from the Render blueprint. They would need to be added manually after deploy, and there is no startup check that fails hard if they are absent. If Render deploys without them: Privy JWT is disabled, bot is disabled, Telegram webhook is unauthenticated, Jupiter calls fail. — `render.yaml`
- **KM-04 zeroization reverted**: `keys.js` documents that the `bytes.fill(0)` zeroization was removed (line 54-65) because `Keypair.fromSecretKey` aliases the input buffer. The keypair's internal `secretKey` bytes now persist in the same `Uint8Array` that was never zeroed — secret key material lives in process heap indefinitely until GC. — `server/services/keys.js:54-65`
- **Privy App ID hardcoded in server source**: `server/services/privyAuth.js:21` contains `PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm` as an inline comment showing the actual value. Though the ID is public per Privy's model, it means the file is also a configuration doc in source — future auditors might not distinguish what is secret vs public from scanning the file alone. — `server/services/privyAuth.js:21`
- **client/.env is stale and contains Dynamic orphan key**: `client/.env:16` has `REACT_APP_DYNAMIC_ENV_ID=1b27b890-ac01-416c-9eaa-77f5a28732ca` — this is the old Dynamic wallet infrastructure env ID, superseded by Privy. Stale credentials widen the attack surface unnecessarily (Dynamic app could remain active and accept connections under that ID). — `client/.env:16`
- **DebugAuthOverlay ships to production, activated by URL param**: `DebugAuthOverlay` is always rendered in `App.js:327`. It exposes wallet address, auth state, balance, and Privy session state to anyone who appends `?debug=1`. No environment gate prevents production activation. — `client/src/components/DebugAuthOverlay.js:29-31`, `client/src/App.js:327`
- **clientDebugLog ships wallet address + TG ID to server**: `debugLog()` tunnels user payloads via `sock.emit('clientDebugLog', ...)`. Server handler at `main.js:1368` logs `tg=${tg} w=${w}` (wallet prefix + telegram user ID) to stdout. No authentication check on this socket event — any connected client can log to server stdout arbitrarily. — `server/socket-io/main.js:1356-1369`, `client/src/lib/debugLog.js:54`
- **MongoDB connection failure logs `err.message`**: `server/index.js:584` logs `err.message` on MongoDB connect failure. If Atlas returns an error that includes the URI in the message, the password `Soja21245!!!!!` appears in logs. — `server/index.js:584`
- **Admin key comparison is non-timing-safe**: `guards.js:27` uses `apiKey !== process.env.ADMIN_API_KEY` for the `/stats` and `/api/admin/*` endpoints. String comparison is not constant-time. Timing oracle could leak key length. — `server/middleware/guards.js:27`

## Critical Mechanisms

- **Keypair loading (keys.js)**: `SOLANA_KEYPAIR_JSON` (env, cloud deploy) or `SOLANA_KEYPAIR_PATH` (file, local dev). The keypair is stored as a module-level singleton `_escrowKeypair`. No TTL, no rotation hook except SIGHUP → `initKeys()`. Authority public key is logged at startup (acceptable).
- **Privy JWT pipeline (privyAuth.js)**: Module-level `PRIVY_APP_ID`/`PRIVY_APP_SECRET` strings evaluated once at import. `getClient()` is lazy-init with once-warn guard. Both `required: true` and `required: false` modes exist — soft mode passes through on any failure (missing token, expired, or mis-configured secret), strict mode returns 401. Only the `/link-from-privy-telegram` endpoint uses strict mode.
- **Magic-link tokens (walletLinkTokens.js)**: 32-byte CSPRNG base64url, 10-min TTL, deleted on first `consumeLinkToken()` call. In-memory Map — lost on restart. No rate limit on `mintLinkToken()` calls from the bot handler.
- **JWT (auth.js)**: Secret is loaded at import time. If `NODE_ENV=production` and `JWT_SECRET` unset: `process.exit(1)`. Otherwise random per restart. Token generated on authenticate, never consumed. Dead credential path.
- **ADMIN_API_KEY (guards.js)**: Checked via non-constant-time string comparison against `process.env.ADMIN_API_KEY`. If env var not set, ALL requests are rejected (fail-closed — good), but comparison itself leaks length.

## Invariants & Assumptions

- INVARIANT: `server/.env` is never committed to git — enforced by `server/.gitignore:2` (`.env` listed) and verified by `git ls-files` returning empty for `server/.env`. ENFORCED.
- INVARIANT: `PRIVY_APP_SECRET` never appears in client bundle — confirmed by grep of `client/src/`. The `REACT_APP_PRIVY_APP_ID` (public) is the only Privy value in the client build. ENFORCED.
- INVARIANT: Escrow authority keypair is never logged (only public key is logged) — verified at `keys.js:67`. ENFORCED.
- INVARIANT: JWT tokens are verified before granting session privileges — NOT ENFORCED. `verifyToken` was deleted as dead code (`auth.js:104`). Tokens are generated but never consumed server-side. Session authority rests entirely on `client.isAuthenticated` flag set at socket time.
- ASSUMPTION: `PRIVY_APP_SECRET` is set on Render production — UNVALIDATED. `render.yaml` does not declare `PRIVY_APP_SECRET`. No startup assertion checks for it. If missing, JWT verification is silently disabled with a console.warn only.
- ASSUMPTION: `TELEGRAM_BOT_TOKEN` is rotated after any exposure — UNVALIDATED. The token `8048345182:AAFtG0a-o2w_mZ8iw_QnEmyrk-lx3k_ZBXg` is present in the local `server/.env`, is not in git history (confirmed), but is never marked for rotation reminders.
- ASSUMPTION: `ADMIN_API_KEY` is set before deploying admin endpoints — UNVALIDATED. `render.yaml` has `sync: false` for it (good), but no startup assertion. If not set on Render, the fail-closed guard in `guards.js:27` (`!process.env.ADMIN_API_KEY` → 401) means admin routes are inaccessible rather than open, which is actually safe.
- ASSUMPTION: `walletLinkTokens` in-memory store being lost on restart is acceptable — stated in source as "hackathon devnet scope" (`walletLinkTokens.js:18`). For production, outstanding magic-link URLs sent via Telegram DM would become invalid on server restart.

## Risk Observations (Prioritized)

1. **JWT dead credential (CRITICAL)**: The JWT mechanism generates tokens with `JWT_SECRET` but `verifyToken` was deleted. Any token-based auth decision is unreachable. `JWT_SECRET` is therefore a credential that guards nothing on the server. A legitimate concern here is that if someone later adds JWT verification expecting an established secret, they will find the secret was `generateValue: true` (Render auto-generates a random value per deploy), meaning tokens from the previous deploy are always invalid — silent session invalidation on every deploy. — `server/middleware/auth.js:96-104`, `render.yaml:36`

2. **PRIVY_APP_SECRET absent from render.yaml (CRITICAL/HIGH)**: Render blueprint has no declaration for `PRIVY_APP_SECRET`. If deployed fresh from the blueprint, `privyAuth.js` will operate in dev mode (graceful pass-through), weakening the `/api/wallet/link-from-tg-token` endpoint. The magic-link token remains the gate, but the second factor (Privy JWT) is silently absent. — `render.yaml`, `server/services/privyAuth.js:35-38`

3. **KM-04 zeroization failure (HIGH)**: The intended security property (zero raw key bytes after keypair construction) was found to be broken because `@solana/web3.js@1.98.4` `Keypair.fromSecretKey` aliases its input. The bytes.fill(0) was removed. The raw 64-byte secret key now lives as an unprotected Uint8Array in heap for the process lifetime. On memory dumps, heap profiling, or core dumps it is fully exposed. — `server/services/keys.js:54-65`

4. **Non-timing-safe ADMIN_API_KEY comparison (HIGH)**: `apiKey !== process.env.ADMIN_API_KEY` in `guards.js:27` is a simple JavaScript string equality. Timing attacks on string length are feasible in Node.js (microbenchmarks show ~50ns difference per character). Admin endpoints include key reload (`/api/admin/reload-keys`) and financial stats (`/stats`). Should use `crypto.timingSafeEqual`. — `server/middleware/guards.js:27`

5. **Stale REACT_APP_DYNAMIC_ENV_ID in client/.env (HIGH)**: The Dynamic wallet infrastructure credential remains in the local development `.env`. It is not committed to git. However, if the Dynamic app is still active, any request to Dynamic using that Env ID could succeed. This is orphaned access that should be revoked in the Dynamic dashboard. — `client/.env:16`

6. **clientDebugLog unauthenticated socket event (MEDIUM)**: Any connected (but possibly unauthenticated) socket can emit `clientDebugLog`. The handler logs `tg=` and `w=` (wallet address prefix) to server stdout. This means an attacker can pollute Render logs with arbitrary 200-char labels and 2KB JSON payloads. No `requireAuth` guard. — `server/socket-io/main.js:1356-1369`

7. **DebugAuthOverlay in production bundle (MEDIUM)**: The overlay is unconditionally imported and rendered in production. It discloses wallet address, auth status, Privy ready state, and SOL balance when `?debug=1` is in the URL. A malicious link sent to a user (`solshot.gg/?debug=1`) causes the overlay to render on their screen exposing their wallet state visually. — `client/src/App.js:327`, `client/src/components/DebugAuthOverlay.js:29-31`

8. **Missing TELEGRAM_BOT_TOKEN in render.yaml (MEDIUM)**: `TELEGRAM_BOT_TOKEN` not in `render.yaml`. If Render deploys without it, Telegram initData validation is silently skipped — any client can claim any `telegramUser` identity by sending `telegramInitData` in the socket handshake. — `render.yaml`, `server/middleware/telegram.js:18-20`

9. **mint_link_token — no per-user rate limit (MEDIUM)**: `walletLinkTokens.mintLinkToken()` is called from the bot `/link` command handler. Nothing prevents the same Telegram user flooding the in-memory store with uncollected tokens (e.g., 100k `/link` calls). The periodic sweeper runs every 5 minutes. Tokens accumulate in memory between sweeps. — `server/services/walletLinkTokens.js:89-105`, `server/services/bot.js:61`

10. **MongoDB URI err.message leak risk (LOW)**: `index.js:584` logs `err.message` on MongoDB connect failure. Some Atlas errors include the URI in the message body. If the password were in the log stream, it would be visible in Render's log viewer. Risk is low because `.env` is local-only and Render env vars don't echo in logs by default — but worth confirming Atlas error format. — `server/index.js:584`

11. **PRIVY_APP_ID hardcoded as comment in source (LOW)**: `privyAuth.js:21` has the literal app ID value inline in a comment. The ID is public per Privy's model, but the comment conflates public and private values in the same file ("PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm (same as client public)") which can mislead future developers. — `server/services/privyAuth.js:21`

12. **No startup assertion for PRIVY_APP_SECRET / TELEGRAM_BOT_TOKEN (LOW)**: The application starts without error if these are absent (graceful no-ops), but there is no logged warning visible in the Render dashboard until the specific code path is hit. An operator doing a fresh deploy would not know the secrets are missing until the first `/link` call. — `server/services/privyAuth.js:35-38`, `server/middleware/telegram.js:18-20`

## Novel Attack Surface

- **JWT credential is effectively public**: Since `verifyToken` is dead code, the JWT tokens emitted to clients serve only as opaque session identifiers from the client's perspective. An attacker who discovers the `JWT_SECRET` (via environment variable exfiltration, Render dashboard access, or timing attack on `ADMIN_API_KEY`) gains nothing — the tokens are never verified. However, if a future developer mistakenly adds JWT verification without understanding this context, they may implement it with a secret that changes on every deploy (`generateValue: true` in render.yaml), creating a silent bug where all sessions invalidate on deployment.

- **Magic-link token race via Telegram DM intercept**: The `/link` flow sends a magic-link URL via Telegram DM. A Telegram group admin or someone with server access to TG's DM relay who intercepts the DM within 10 minutes can use the token before the legitimate user. With `required: false` Privy JWT, no second factor prevents this. The production-hardening TODO in `walletLinkTokens.js:27` acknowledges this explicitly.

- **`clientDebugLog` as a log-injection oracle**: An authenticated attacker can use `clientDebugLog` to inject arbitrary content (up to 200-char label + 2KB JSON) into Render's log stream. This could be used to obscure security events, inject fake "auth success" lines, or exhaust log storage, masking real attack traffic in the noise.

## Cross-Focus Handoffs

- → **AUTH-01**: JWT tokens are generated (`generateToken`) but `verifyToken` was removed as dead code. Need investigation of whether `handleAuthenticate` result is verified downstream in main.js beyond setting `client.isAuthenticated`. The token in `authResult` is emitted to client — is it ever sent back by client and checked anywhere?
- → **AUTH-03**: `clientDebugLog` socket event has no `requireAuth` guard. Any connected socket (including unauthenticated ones) can write to server logs. Check if other socket events that should be auth-gated have similar gaps.
- → **DATA-04**: The `clientDebugLog` handler logs arbitrary user-supplied labels to stdout. Check whether those log lines could contain injection characters or sensitive user data (e.g., debug calls that include wallet addresses, seed phrases from user inputs, TG user objects).
- → **ERR-01**: `server/index.js:584` logs `err.message` on MongoDB connect failure. Investigate whether Atlas error messages ever include the connection string or credentials.

## Trust Boundaries

The server's secret inventory separates into three trust tiers. Tier 1 (highest sensitivity): `SOLANA_KEYPAIR_JSON` (on-chain authority — compromise means loss of all escrowed funds), `MONGODB_URI` (full Atlas database access), `PRIVY_APP_SECRET` (impersonate any authenticated Privy user). Tier 2: `TELEGRAM_BOT_TOKEN` (send bot messages, intercept magic-link DMs), `ADMIN_API_KEY` (reload keys, view financial stats), `JWT_SECRET` (currently guards nothing). Tier 3: `JUP_API_KEY` (Jupiter Lite — rate limiting only), `TELEGRAM_WEBHOOK_SECRET` (prevent webhook spoofing, not a data secret). The client side correctly holds only public values: `REACT_APP_PRIVY_APP_ID` (public by design), program IDs (on-chain public), and RPC URLs (public). The critical gap is that Tier 1 secrets are managed differently for local dev (file) vs. production (Render env vars), and the production state cannot be verified from the repository alone.
<!-- CONDENSED_SUMMARY_END -->

---

# SEC-02: Secret & Credential Management — Full Analysis

## Executive Summary

The SolShot server handles a moderately complex secret inventory for a Solana-native game with an embedded Telegram bot and Privy wallet integration. The February 2026 "Phase 4 secrets management hardening" shipped several correct patterns: centralized key loading (`keys.js`), single-env-var ingestion, SIGHUP-triggered credential reload, and a protected key-reload endpoint. However, four gaps have emerged or persisted:

1. The JWT mechanism generates tokens with `JWT_SECRET` but the verification side (`verifyToken`) was removed as dead code — the credential protects nothing.
2. `PRIVY_APP_SECRET` is absent from `render.yaml` and its absence is graceful (fail-open on the magic-link endpoint).
3. Live credentials (MongoDB URI with password, Telegram bot token) exist in the untracked `server/.env` on the developer's machine — not a direct repository leak, but an exfiltration risk on the local machine and via any process that inherits the environment.
4. The `client/.env` retains the stale Dynamic wallet Env ID (`1b27b890-ac01-416c-9eaa-77f5a28732ca`) from the superseded Dynamic infrastructure.

No secrets are committed to the git repository. The `.gitignore` at both root and `server/` level correctly blocks `.env` files.

## Scope

**In scope**: All off-chain credential handling — server environment variables, keypair loading and lifecycle, Privy authentication secret, JWT secret, MongoDB URI, Telegram bot token, admin API key, magic-link token generation/storage, client-side env vars, CI/CD (render.yaml), debug overlays that expose session state.

**Out of scope**: On-chain program authority (Anchor keypair used for escrow CPI is in scope at the loading layer, but the on-chain authority architecture is SOS/BOK territory).

## Scope of Investigation

Files read fully:
- `server/.env` — NOT tracked; live secrets confirmed present
- `client/.env` — NOT tracked; stale Dynamic ID, no new secrets
- `server/.env.example` — template; representative of expected env var set
- `client/.env.example`, `client/.env.production` — public values only
- `render.yaml` — deployment blueprint
- `server/index.js` — full read; env var loading, CORS, admin endpoints, Privy wiring
- `server/services/keys.js` — full read; keypair centralization + KM-04 revert
- `server/services/privyAuth.js` — full read; Privy JWT verification, graceful fallback
- `server/services/walletLinkTokens.js` — full read; magic-link CSPRNG tokens
- `server/middleware/auth.js` — full read; JWT generation/dead-verifyToken
- `server/middleware/guards.js` — full read; ADMIN_API_KEY gate + withLock
- `server/middleware/telegram.js` — full read; bot token HMAC-SHA256 validation
- `server/socket-io/main.js` — partial (auth section lines 1240-1370, clientDebugLog)
- `client/src/wallet/WalletContext.js` — partial (env var section, window.solWallet, signing functions)
- `client/src/lib/debugLog.js` — full read
- `client/src/components/DebugAuthOverlay.js` — full read
- `server/scripts/init-config.mjs` — full read; keypair in operational scripts

Git history searched for: committed `.env` files, MongoDB password (`Soja21245`), Telegram bot token (`8048345182`), Phase 4 hardening commits (found: `6a670bf`, `eb37365`, `f551275`, `3ed8b43`).

## Secret Inventory

### Server-side secrets (from .env.example + .env)

| Variable | Sensitivity | Where Used | Present in render.yaml? |
|---|---|---|---|
| `SOLANA_KEYPAIR_JSON` | **CRITICAL** | `keys.js:44` — Anchor authority for escrow create/settle/cancel | `sync: false` (correct) |
| `SOLANA_KEYPAIR_PATH` | HIGH | `keys.js:47` — file path for local dev | Not in render.yaml (expected — file path not applicable to cloud) |
| `MONGODB_URI` | **CRITICAL** | `index.js:544-545` — Atlas connection | `sync: false` (correct) |
| `JWT_SECRET` | **LOW** (currently dead) | `auth.js:19` — generates tokens, verifyToken removed | `generateValue: true` (Render auto-generates) |
| `TELEGRAM_BOT_TOKEN` | HIGH | `telegram.js:16`, `bot.js:61` — initData HMAC + bot polling | **ABSENT from render.yaml** |
| `TELEGRAM_WEBHOOK_SECRET` | MEDIUM | `bot.js:1151` — Telegram webhook header validation | **ABSENT from render.yaml** |
| `ADMIN_API_KEY` | HIGH | `guards.js:27` — gates `/stats`, `/api/admin/*` | `sync: false` (correct) |
| `PRIVY_APP_ID` | PUBLIC | `privyAuth.js:27` — same value as `REACT_APP_PRIVY_APP_ID` | **ABSENT from render.yaml** (public — could be hardcoded) |
| `PRIVY_APP_SECRET` | HIGH | `privyAuth.js:28,42` — Privy JWT server verification | **ABSENT from render.yaml** |
| `JUP_API_KEY` | LOW | `jupiter-price.js` — Jupiter API rate limiting | **ABSENT from render.yaml** |
| `MINI_APP_URL` | LOW | `bot.js:48` — inline keyboard links in bot | Not required |
| `TREASURY_WALLET` | MEDIUM | `escrow.js:47`, `render.yaml:29` — settlement split | Hardcoded in render.yaml (public wallet address — acceptable) |
| `OPS_WALLET` | MEDIUM | `escrow.js:48`, `render.yaml:31` | Hardcoded in render.yaml (acceptable) |
| `CORS_ORIGINS` | LOW | `index.js:63-65` | Hardcoded in render.yaml |

### Client-side env vars (REACT_APP_* prefix — all become public in bundle)

| Variable | Notes |
|---|---|
| `REACT_APP_PRIVY_APP_ID` | Public by design; same value on server. Committed in `.env.example` and `.env.production`. |
| `REACT_APP_SOLANA_NETWORK` | Non-secret. |
| `REACT_APP_ESCROW_PROGRAM_ID` | On-chain public address. |
| `REACT_APP_ESCROW_V2_PROGRAM_ID` | On-chain public address. |
| `REACT_APP_SHOT_TOKEN_MINT` | On-chain public address. |
| `REACT_APP_SERVER_URL` | Server URL — not a secret. |
| `REACT_APP_DYNAMIC_ENV_ID` | **STALE** — Dynamic wallet infrastructure, superseded by Privy. In `client/.env` (untracked). Should be revoked. |

No server-side secrets (`PRIVY_APP_SECRET`, `JWT_SECRET`, `MONGODB_URI`, `TELEGRAM_BOT_TOKEN`, etc.) appear in any `REACT_APP_*` variable, confirmed by exhaustive grep.

## Storage Map

| Secret Type | Storage Location | Encryption at Rest | Access |
|---|---|---|---|
| Escrow keypair | `SOLANA_KEYPAIR_JSON` env var OR file path on disk | None (plaintext JSON byte array in env) | Render env dashboard (encrypted at rest by Render) / file on dev machine |
| MongoDB URI+password | `MONGODB_URI` env var | None at var level; Render encrypts env vars | Render env dashboard / `server/.env` (unencrypted on dev machine) |
| Telegram bot token | `TELEGRAM_BOT_TOKEN` env var | None | `server/.env` (unencrypted on dev machine); NOT in render.yaml |
| Admin API key | `ADMIN_API_KEY` env var | None | Render env dashboard (sync: false) |
| JWT secret | `JWT_SECRET` env var / auto-generated | None | Render generates at deploy time; never logged |
| Privy App Secret | `PRIVY_APP_SECRET` env var | None | Manually set on Render; NOT in render.yaml |
| Magic-link tokens | In-memory `Map<string, TokenEntry>` | None | Process memory only; lost on restart |
| Privy session JWTs | Client localStorage (managed by Privy SDK) | None beyond browser storage | Privy SDK handles; not accessible to game code |

## Trust Model

**Secret ingestion trust boundary:** All server secrets enter the process via `process.env` (set by Render or dotenv from `server/.env`). The `.env` file is excluded from git by `server/.gitignore:2` and the root `.gitignore`. Git history shows no instance of `.env` being committed. The only historical credential-like commit was `cbef16c` (Feb 18 2026) which committed `.env.example` templates only — confirmed by inspecting `git show cbef16c -- server/.env`.

**Keypair trust boundary:** `server/services/keys.js` is the single point of ingestion (KM-03 — enforced). The keypair is stored as a module-level `Uint8Array`-aliased secret (the KM-04 zeroization was reverted at commit `f551275`). Only `getEscrowKeypair()` returns it, and callers (`escrow.js`, `escrow-v2.js`) use it only for signing. The public key is logged at startup (acceptable).

**Client trust boundary:** The React client bundle contains only public values. No secrets are passed to client via websocket beyond the JWT token (which is generated but never verified). The Privy SDK's embedded wallet manages user key material client-side; the game server does not see user private keys.

## Key Mechanisms — Detailed

### 1. Keypair Management (keys.js)

Load path: `SOLANA_KEYPAIR_JSON` (inline JSON array, used on Render) → `SOLANA_KEYPAIR_PATH` (file path, local dev). The `~` expansion at `keys.js:47` uses `process.env.HOME || process.env.USERPROFILE` — this is correct for cross-platform but means the resolved path is a pure filesystem read, subject to path traversal if an attacker can influence `SOLANA_KEYPAIR_PATH`.

KM-04 status: The `bytes.fill(0)` that was supposed to zero the raw key material was removed at commit `f551275` because `@solana/web3.js@1.98.4` `Keypair.fromSecretKey` was found to alias the input buffer (the keypair's internal `secretKey` property shares the same backing `ArrayBuffer` as the input `Uint8Array`). Zeroing the input also zeroed the keypair's internal secret, breaking signing. The fix was to remove the zeroization entirely. The practical effect: the 64-byte secret key material lives in the JavaScript heap as a `Uint8Array` referenced by `_escrowKeypair.secretKey` until the process exits or GC runs. There is no way to proactively zero it. This is an inherent limitation of the current `@solana/web3.js` version when used in this pattern.

KM-05: A SIGHUP handler at `index.js:600` triggers `initKeys()` + `initEscrow()` + `initEscrowV2()`. A protected HTTP endpoint `POST /api/admin/reload-keys` triggers the same. On Linux/Render the HTTP endpoint sends SIGHUP to itself; on Windows/dev it runs directly. This is a functional hot-reload mechanism.

### 2. Privy Authentication (privyAuth.js)

Architecture: Module-level `PRIVY_APP_ID` and `PRIVY_APP_SECRET` strings captured at import from `process.env`. `getClient()` is called lazily on first verification — returns `null` if either env var is absent, with a once-only `console.warn`.

Endpoints using Privy JWT:
- `POST /api/wallet/link-from-tg-token` — `required: false` (soft mode). Passes through without JWT check if Privy not configured.
- `POST /api/wallet/link-from-privy-telegram` — `required: true` (strict mode). Returns 503 if `!isPrivyAuthConfigured()`, returns 401 if JWT fails. This is the stronger of the two paths.

The soft-mode comment in `index.js:423-431` explains the intentional design: the magic-link token is the primary gate, Privy JWT is defense-in-depth. The risk is that if `PRIVY_APP_SECRET` is never set on Render (absent from `render.yaml`), the defense-in-depth layer is silently absent in production without any visible error.

### 3. JWT Secret (auth.js)

`JWT_SECRET` is captured at import. In production without the env var: `process.exit(1)`. In dev without it: a random 32-byte hex string is generated. On Render: `generateValue: true` creates a per-deploy random value (tokens are invalid after re-deploy — this is intentional if tokens are ephemeral).

`generateToken()` at `auth.js:96` creates a `jwt.sign({ wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' })` token. This token is emitted to the client in `authResult` from `main.js:1333`.

The comment at `auth.js:104` states `verifyToken removed — was dead code (never imported anywhere)`. Grep confirms: `generateToken` is imported in `main.js:11` via `handleAuthenticate`, but `verifyToken` was the verification counterpart. It was explicitly deleted (commit message references `E1: verifyToken removed`).

The implication: tokens are generated and emitted, but never checked server-side. Session validity rests entirely on `client.isAuthenticated = true` set by `handleAuthenticate()` at socket time, which is maintained in memory for the socket's lifetime. There is no persistent session mechanism based on JWT.

### 4. Admin API Key (guards.js)

`requireAdminKey` at `guards.js:25-31` checks `process.env.ADMIN_API_KEY` against `req.headers['x-admin-key']`. If `ADMIN_API_KEY` is not set: returns 401 (fail-closed). If the key is wrong: returns 401. The comparison `apiKey !== process.env.ADMIN_API_KEY` is plain JavaScript string equality — NOT timing-safe.

For completeness: guarded endpoints are `/stats` (financial metrics) and `POST /api/admin/reload-keys` (credential reload trigger). The reload endpoint is particularly sensitive since an attacker who can brute-force the admin key can trigger a keypair reload.

`crypto.timingSafeEqual` would require converting both strings to Buffer first but is straightforward to implement.

### 5. Magic-Link Tokens (walletLinkTokens.js)

`mintLinkToken()` generates `crypto.randomBytes(32).toString('base64url')` (32 bytes = 256 bits — well above the 128-bit minimum for token entropy). The token is stored in an in-memory `Map` with `{ telegramUserId, username, firstName, expiresAt }`.

`consumeLinkToken()` deletes the token regardless of expiry status (always delete on lookup, then check expiry). This ensures single-use even in race conditions where two concurrent consumers arrive — the first delete wins, the second gets `null`. The semantics are correct.

Periodic sweep: every 5 minutes, expired entries are removed. The `sweepTimer` is `unref()`'d to prevent keeping the process alive. If the store drains, the sweeper is stopped.

No rate limit on `mintLinkToken()`. The bot `/link` command handler calls this directly. A user flooding `/link` commands can fill the map with uncollected tokens. The TTL sweep runs every 5 minutes, so at most 5 minutes' worth of uncollected tokens per user (at whatever rate BotFather allows) can accumulate. Moderate risk for in-memory exhaustion.

### 6. Telegram Bot Token (telegram.js, bot.js)

The bot token serves two purposes:
1. `telegram.js:42-45`: HMAC-SHA256 key derivation for Telegram Mini App `initData` validation. The token itself is never logged; only the HMAC validation result. The timing-safe comparison fix (commit D7, `crypto.timingSafeEqual` at line 56) is in place.
2. `bot.js:61`: Passed to `Telegraf` constructor for bot polling/webhook.

Not in `render.yaml`. Must be manually configured on Render. If absent: bot is disabled (`console.warn` at `telegram.js:19`, `bot.js:63`) and initData validation is skipped — any client can claim any `telegramUser` identity.

### 7. MongoDB URI

Accessed only at `index.js:544`. If `MONGODB_URI` is not set: `console.warn('MONGODB_URI not set — running without database')` and server starts without DB. The connection error handler at `index.js:584` logs `err.message` — this is the potential URI leak vector if Atlas returns error messages containing the connection string.

The local `server/.env` contains:
```
MONGODB_URI=mongodb+srv://solshot-server:Soja21245%21%21%21%21%21@solshot.e86gwap.mongodb.net/solshot?appName=SolShot&retryWrites=true&w=majority
```
This is URL-encoded (5 `!` signs as `%21`). The plain password is `Soja21245!!!!!`. It is NOT in git history (confirmed via `git log --all -S "Soja21245" --oneline` returning no results matching the env file).

### 8. CSP Disclosure Endpoint

`POST /api/csp-report` logs violations to `console.error` — only `violated-directive`, `blocked-uri`, and `document-uri` are logged. Not a secret leak. The endpoint itself does not expose secrets.

### 9. Client Debug Infrastructure

`DebugAuthOverlay.js` exposes: abbreviated wallet address (`0x1234…abcd`), `isAuthenticated`, `connected`, SOL balance, Privy ready state. Activated by `?debug=1` URL param OR `localStorage.solshotDebug === '1'`. The URL param activation is the risk: a malicious link with `?debug=1` causes the overlay to appear on the victim's screen when they open the game.

`debugLog.js` ships client-generated payloads to the server via `clientDebugLog` socket event. The server handler at `main.js:1356-1370` is not guarded by `requireAuth()` — any socket can emit this event. The handler truncates label to 200 chars and data to 2KB, which limits memory abuse per message, but the attack surface for log injection remains.

## Phase 4 Secrets Hardening Verdict

**What shipped (Phase 4, Feb 2026, commits `6a670bf` → `3ed8b43`):**
1. `keys.js` centralized keypair loading (KM-03) ✓
2. `keys.js` KM-04 zeroization — ATTEMPTED, then reverted at `f551275` due to @solana/web3.js alias behavior. Current state: NO zeroization.
3. `auth.js` JWT_SECRET production assertion (`process.exit(1)` if missing in production) ✓
4. `guards.js` ADMIN_API_KEY gate on `/stats` (IM-02) ✓
5. `/api/admin/reload-keys` + SIGHUP credential reload (KM-05) ✓
6. `render.yaml` `SOLANA_KEYPAIR_JSON` and `ADMIN_API_KEY` as `sync: false` (user-prompted at deploy time) ✓

**What arrived AFTER Phase 4 (Feb → May 2026):**
- `privyAuth.js` — Privy JWT verification layer (commit `d4ab9f9`, May 2026) ✓
- `walletLinkTokens.js` — CSPRNG magic-link tokens (commit around May 2026) ✓
- Timing-safe HMAC for Telegram initData (`crypto.timingSafeEqual` — commit D7) ✓

**Gaps remaining:**
- `PRIVY_APP_SECRET` not in `render.yaml` — would need to be manually set on Render
- `TELEGRAM_BOT_TOKEN` not in `render.yaml` — same
- `JWT_SECRET` guards a dead code path — `verifyToken` was removed
- KM-04 zeroization cannot be achieved without @solana/web3.js changes
- ADMIN_API_KEY comparison is not timing-safe
- No startup assertions for Privy/Telegram token — fail is silent

**Overall verdict**: Phase 4 shipping was complete for its defined scope (keypair centralization, JWT_SECRET production guard, admin key gate, hot-reload). The post-Phase-4 Privy additions are largely sound. The gaps identified here are either emergent from new features (Privy/Telegram added after Phase 4), inherent to library constraints (KM-04 @solana/web3.js), or configuration oversights in render.yaml.

## Dependencies Relevant to Secrets

- `@privy-io/server-auth` — handles Privy JWT verification; must stay updated for security patches
- `jsonwebtoken` — generates JWTs; `verifyToken` not used but `generateToken` is
- `tweetnacl` — wallet signature verification (correct constant-time impl from NaCl)
- `@solana/web3.js@1.98.4` — `Keypair.fromSecretKey` aliasing prevents zeroization (see KM-04 note)
- `dotenv` — loads `server/.env` at startup; called at `index.js:34`
- `express-rate-limit` — rate limits HTTP endpoints globally; not per-secret endpoint

## Questions for Other Focus Areas

1. **AUTH-01**: Is the JWT token emitted in `authResult` ever sent back to the server by clients? If so, where is it consumed? If it is sent but not verified, clients can modify the token payload without detection.

2. **AUTH-03**: `clientDebugLog` has no `requireAuth` check. What other socket events in `main.js` that perform state-modifying or information-disclosing operations are similarly missing the auth guard?

3. **DATA-04**: The `clientDebugLog` handler logs arbitrary user-supplied string labels to stdout. Confirm whether Render's log aggregation is susceptible to ANSI escape injection or log-forwarding pipeline injection.

4. **CHAIN-03**: `window.solWallet` was mentioned in the architecture doc as an exposure vector. Current WalletContext does not appear to set `window.solWallet` directly — the `window.socket` global is set elsewhere in `App.js`. Confirm whether `signAndSendEscrowDeposit` is still exposed on a window global.

## Raw Notes

- `server/.env` confirmed present at `C:/Users/johnk/SolShot/server/.env` — live credentials, NOT tracked in git.
- `client/.env` confirmed present — stale Dynamic Env ID, NOT tracked.
- `client/.env.production` is tracked (committed) — contains only public values + CSP flags. Acceptable.
- `render.yaml` is tracked — no raw secrets, uses `sync: false` for sensitive vars. Missing PRIVY_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, JUP_API_KEY.
- Git history search: `Soja21245` — zero results (MongoDB password not in history). `8048345182:AAF` — zero results (bot token not in history). Good.
- Phase 4 hardening commits: `6a670bf` (centralized key module), `eb37365` (remove dead keypair code from solana.js), `f551275` (stop zeroing keypair — critical revert), `3ed8b43` (docs: complete phase). Post-Phase-4 additions: `d4ab9f9` (Privy JWT verify on link endpoint, May 2026).
- The `.gitignore` at root level lists `.env`, `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`. Root also has `*-keypair.json`, `solshot-dev.json`, `solshot-server.json`. Server `.gitignore` lists `node_modules` and `.env`. Client presumably has CRA's default `.gitignore` which blocks `.env.local`.
- `render.yaml:36` `JWT_SECRET: generateValue: true` — Render generates a random value per deploy. Since `verifyToken` is dead, this is harmless but creates a confusing state: a rotated-per-deploy secret that gates nothing.
