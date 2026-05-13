---
task_id: db-phase1-auth-01
provides: [auth-01-findings, auth-01-invariants]
focus_area: auth-01
files_analyzed:
  - server/middleware/auth.js
  - server/middleware/telegram.js
  - server/middleware/guards.js
  - server/services/privyAuth.js
  - server/services/walletLinkTokens.js
  - server/services/bot.js
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/index.js
  - client/src/App.js
  - client/src/wallet/WalletContext.js
finding_count: 12
severity_breakdown: {critical: 2, high: 5, medium: 4, low: 1}
---
<!-- CONDENSED_SUMMARY_START -->
# Authentication Mechanisms (AUTH-01) — Condensed Summary

## Key Findings (Top 10)

1. **JWT generated, still never consumed (H029 — PARTIALLY resolved)**: `generateToken()` in `auth.js:96` runs inside `handleAuthenticate()` and its return value is emitted in `authResult` to the client. However, `jwt.verify()` is **never called anywhere on the server**. The JWT is purely decorative — the server's auth model is `client.isAuthenticated = true` (a socket flag set at auth time). No token verification occurs on reconnect, subsequent events, or HTTP routes. The JWT 24-hour lifetime is meaningless because the server never checks it. — `server/middleware/auth.js:96-134`, `server/socket-io/main.js:1246-1334`

2. **`shoot` event has NO auth guard (unauthenticated relay)**: The legacy `shoot` handler (line 3377) relays shot animation data to opponents without any `requireAuth` or `requireAuthIfWagered` check. A non-authenticated socket in a wagered match can emit `shoot` and it will be relayed. This is distinct from the `fire` event (which has a wager-conditional auth guard). The `shoot` handler is the animation-relay path; it carries `selectedWeapon`, `power`, `rotation` — spoofing this in a wagered match can desync opponent visuals. — `server/socket-io/main.js:3377-3397`

3. **`getGroupMatch` is unauthenticated — any socket can join a broadcast room**: Any unauthenticated socket that knows a `matchId` can call `getGroupMatch`, receive the full match snapshot (including all player positions, HP, terrain), and join the `groupmatch:<matchId>` room to receive real-time `shotResult` broadcasts. The membership check (`isMember = tgId != null && ...`) only gates the `join` call, not the read. — `server/socket-io/groupchat.js:97-130`

4. **`link-from-privy-telegram` trusts client-supplied `telegramUserId`**: The endpoint at `server/index.js:494` verifies the Privy JWT (proves the caller is authenticated) but then blindly accepts `telegramUserId` from `req.body`. The server never cross-checks that the Privy user's linked telegram matches the claimed `telegramUserId`. An attacker with a valid Privy session could POST any `telegramUserId` to bind a victim's Telegram identity to their own wallet. — `server/index.js:502-518`

5. **`link-from-tg-token` Privy JWT in soft-required mode even when Privy is configured**: The comment at `server/index.js:421-431` explains the JWT check is `required: false` intentionally, but this means a malicious actor who intercepts a magic-link token (exfiltrated from Telegram DM) can redeem it with no Privy session at all — the magic-link token alone is sufficient. The defense-in-depth JWT layer is essentially optional and can be skipped. — `server/index.js:432`

6. **Privy JWT verification fallback to silent pass-through**: When `PRIVY_APP_ID` or `PRIVY_APP_SECRET` are not set, `requirePrivyAuth()` silently passes all requests through (`server/services/privyAuth.js:64-67`). If these env vars are missing on Render (accidentally unset), the entire Privy JWT verification layer is disabled in production with no hard failure. A startup check/assertion is absent. — `server/services/privyAuth.js:33-45`

7. **`telegramUser` backfilled from DB on wallet auth — trust chain erosion**: In the `authenticate` handler (`main.js:1298-1304`), after wallet signature verification succeeds, the server backfills `client.telegramUser.id` from `User.telegramUserId` in MongoDB if the socket didn't present Telegram initData. This means the `tgIdFor()` security comment in `groupchat.js:65-77` is no longer strictly true: `socket.telegramUser.id` may be set via the DB lookup path (not just HMAC-validated initData). The DB path is trusted because it relies on wallet auth, but the comment's claim "only trusts HMAC-validated initData" is now factually incorrect and could mislead future reviewers. — `server/socket-io/main.js:1283-1304`

8. **Telegram initData replay window is 24 hours**: `telegram.js:68-73` checks `auth_date` with a 24-hour allowance. An intercepted or replayed `initData` (e.g., logged from a TLS-terminated proxy) can authenticate against the server up to 24 hours after capture. The Feb audit flagged a 5-minute replay window; this 24-hour window on the TG initData path (which gates group-match auth) is broader. — `server/middleware/telegram.js:68-73`

9. **Auth-reset-on-reconnect (`8eefcca`) introduces no new attack surface but has a gap**: The fix in `WalletContext.js:724-755` correctly resets `isAuthenticated` and `authAttemptedRef` on disconnect, triggering re-auth on reconnect. However, between disconnect and re-auth, the client's `isAuthenticated` is false but the server's `client.isAuthenticated` flag on the OLD socket is never explicitly reset — it simply disappears with the dead socket. If a reconnect reuses the same `socketId` (very edge case in Socket.IO), the old auth state might survive. In practice Socket.IO generates new IDs, so this is theoretical. The bigger concern: during the re-auth window on the new socket, any events that use `requireAuthIfWagered` will be rejected silently — the client has no feedback mechanism beyond re-fire. — `client/src/wallet/WalletContext.js:724-755`

10. **`/api/challenge` endpoint has no authentication**: `POST /api/challenge` (index.js:282) creates a challenge with caller-supplied `challengerWallet` and `challengerTgUserId` but no signature verification, no Privy JWT, and no Telegram initData. Anyone can create challenges impersonating any wallet or TG user. — `server/index.js:282-320`

11. **`window.solWallet` exposure unchanged (H032 review)**: `WalletContext.js` exposes `signAndSendEscrowDeposit` and `signAndBurnShot` via context value; `App.js:57-62` sets `window.socket` as non-enumerable. The `window.solWallet` global previously flagged is not present in the current codebase as a global — these methods are only on the React context. However `window.socket` (non-enumerable) remains accessible to any injected script via `window.socket.emit(...)`. The non-enumerable trick reduces discoverability but does not prevent access if the property name is known. — `client/src/App.js:57-62`

12. **CSP `connectSrc` still lists Dynamic SDK origins**: `server/index.js:163-164` contains `https://app.dynamic.xyz` and `https://api.dynamic.xyz` in `connectSrc`. Dynamic was removed as the wallet stack (replaced by Privy). These origins are dead references but expand the allowed connection surface unnecessarily. — `server/index.js:163-164`

## Critical Mechanisms

- **Wallet signature auth (primary WS auth)**: Client signs `"SolShot Auth: <wallet> at <timestamp>"` with Privy embedded wallet. Server verifies via `nacl.sign.detached.verify()`, sets `client.isAuthenticated = true` and `authenticatedWallets[client.id] = wallet`. Auth state lives in socket memory only. No nonce; replay possible within 5-minute `AUTH_TIMEOUT` window. — `server/middleware/auth.js:38-135`
- **`requireAuth` / `requireAuthIfWagered`**: Socket-flag check `client.isAuthenticated`. `requireAuthIfWagered` additionally checks `room.wager > 0` — practice matches bypass auth entirely. Both emit an error event and return false on failure; callers guard with `if (!...) return`. — `server/middleware/guards.js:40-46, 507-513`
- **Telegram initData validation**: HMAC-SHA256 with `WebAppData` + bot token. Timing-safe compare (`crypto.timingSafeEqual`). 24-hour replay window on `auth_date`. If no `initData` on handshake, middleware passes through (not required). Sets `socket.telegramUser`. — `server/middleware/telegram.js:15-113`
- **Privy JWT verification**: `@privy-io/server-auth` `PrivyClient.verifyAuthToken()`. Issuer/audience/expiry all handled by the SDK. Algorithm pinning is SDK-internal. Used only on 2 HTTP endpoints (`link-from-tg-token` soft, `link-from-privy-telegram` required). NOT used on WebSocket events. — `server/services/privyAuth.js:84-102`
- **Magic-link bind tokens**: 32-byte CSPRNG (`crypto.randomBytes(32).toString('base64url')`), 10-minute TTL, single-use, in-memory Map with periodic sweep. — `server/services/walletLinkTokens.js:56-105`
- **Auth-reset-on-reconnect**: Client resets `isAuthenticated=false` and `authAttemptedRef=false` on socket disconnect, triggering re-auth cycle on next connection. Fixes the iOS tab-backgrounding ghost-auth race. — `client/src/wallet/WalletContext.js:724-755`

## Invariants & Assumptions

- INVARIANT: A socket with `client.isAuthenticated === true` has previously completed a wallet signature challenge in the current socket session. — enforced at `server/middleware/auth.js:131` and checked via `requireAuth()` at `server/middleware/guards.js:40-44`
- INVARIANT: The JWT returned in `authResult` is never used for server-side authorization. Auth state is purely in-memory socket flags. — verified: `generateToken` called but never `jwt.verify` anywhere in server code
- INVARIANT: Telegram initData is validated before `socket.telegramUser` is set by the middleware. — enforced at `server/middleware/telegram.js:95-107` / NOT enforced for the DB-backfill path at `server/socket-io/main.js:1298-1304` ⚠
- INVARIANT: `tgIdFor()` in `groupchat.js` only trusts `socket.telegramUser.id` (not payload). — enforced at `server/socket-io/groupchat.js:72-77` / **circumvented** by the `authenticate` handler's DB backfill which sets `client.telegramUser` without HMAC validation ⚠
- ASSUMPTION: Privy env vars (`PRIVY_APP_ID`, `PRIVY_APP_SECRET`) are set in production. — UNVALIDATED ⚠ — no startup assertion, silently degrades to pass-through
- ASSUMPTION: The `telegramUserId` in `link-from-privy-telegram` request body matches the Privy user's actual linked Telegram account. — UNVALIDATED ⚠ — server trusts client-supplied value without cross-checking Privy's user record
- ASSUMPTION: Wallet signature proves ownership of the claimed wallet at the time of auth. — validated at `server/middleware/auth.js:51-64` but with 5-min replay window (no nonce) ⚠

## Risk Observations (Prioritized)

1. **CRITICAL — `telegramUserId` account takeover via `/api/wallet/link-from-privy-telegram`**: `server/index.js:502-518` — Attacker with valid Privy session can POST any victim `telegramUserId`. Server sets `User.telegramUserId = attacker's wallet + victim's TG id`. All group-match identity flows now identify attacker as victim.
2. **CRITICAL — JWT generated and sent to client, never verified server-side**: `server/middleware/auth.js:96-134` — Auth model is entirely in socket flags. JWT is decorative. Any plan to add stateless HTTP auth routes will fail silently if developers assume JWT is already being verified.
3. **HIGH — `shoot` event unauthenticated relay in wagered matches**: `server/socket-io/main.js:3377` — No auth guard. In a wagered match, a non-authenticated attacker in the room can relay spoofed `opponentShoot` to cause visual desync.
4. **HIGH — Telegram initData replay window is 24 hours**: `server/middleware/telegram.js:68-73` — Much broader than the 5-minute web-auth window. An intercepted session can authenticate as the victim for 24 hours.
5. **HIGH — `/api/challenge` unauthenticated**: `server/index.js:282` — No auth. Anyone can forge challenges impersonating any wallet/TG user. Could be used to disrupt matchmaking or social-engineer targets.
6. **HIGH — `getGroupMatch` gives full match snapshot + room join to unauthenticated sockets**: `server/socket-io/groupchat.js:97-130` — No auth required to receive real-time game state of any match.
7. **HIGH — Privy env silently disables JWT verification**: `server/services/privyAuth.js:33-45` — If accidentally unset on Render, both link endpoints lose their JWT defense layer with no alert.
8. **MEDIUM — `telegramUser` DB-backfill erodes security comment guarantee**: `server/socket-io/main.js:1298-1304` — The backfill is defensible (wallet auth is good) but undermines the documented security model in groupchat.js.
9. **MEDIUM — `link-from-tg-token` Privy JWT is soft-skip even when Privy is configured**: `server/index.js:432` — JWT is advertised as "defense in depth" but is skippable unconditionally. Token-only auth is sufficient to link any wallet to any TG account that has an un-consumed magic-link token.
10. **MEDIUM — Auth-reset window between disconnect and re-auth**: `client/src/wallet/WalletContext.js:757-772` — 1-second polling interval before re-auth fires. Events during this window are rejected by server. No user feedback, no auto-replay.
11. **LOW — Dead Dynamic.xyz CSP origins**: `server/index.js:163-164` — Expands connection allowlist unnecessarily after Dynamic removal.

## Novel Attack Surface

- **Wallet→TG identity injection via DB backfill**: The `authenticate` handler backfills `client.telegramUser` from MongoDB. If an attacker can manipulate `User.telegramUserId` in the database (via the `/api/wallet/link-from-privy-telegram` exploit above), then when any socket authenticates with the victim's wallet, the server will set `client.telegramUser.id = attacker's_tg_id`. This creates a chain: link-endpoint exploit → DB write → next authenticate event → telegramUser backfill → attacker controls tgIdFor() identity for that wallet's socket.
- **Soft-mode JWT + magic-link token bruteforce**: Magic-link tokens are 32 bytes (`base64url`), rate limiting on the endpoint is the global HTTP limiter (100 req/15min per IP). At 100/15min, bruteforce of a 32-byte space is impossible. But an attacker with a leaked token (TG DM notification, screenshot, forwarded message) can redeem it without a Privy session because the JWT check is `required: false`.

## Cross-Focus Handoffs

- → **AUTH-03 (Authorization)**: The `getGroupMatch` unauthenticated read issue should be traced to see what match state can be harvested — does it expose opponent wallet addresses, wager amounts, or other PII?
- → **LOGIC-01 (Business Logic)**: The unauthenticated `shoot` relay event: trace whether `opponentShoot` relay can trigger any server-side state changes (it appears relay-only, but verify no handler on `opponentShoot`).
- → **ERR-02 (Race Conditions)**: The auth-reset-on-reconnect cycle: what happens to in-flight `escrowDepositConfirm` or `fire` events that were queued during the disconnect? Could they replay after reconnect with stale socket state?
- → **SEC-02 (Secrets)**: `PRIVY_APP_ID` is exposed client-side (REACT_APP_PRIVY_APP_ID). This is by design (Privy app IDs are public), but `PRIVY_APP_SECRET` must never appear in client config. Verify `.env.example` and client bundle.

## Trust Boundaries

The system has three main trust zones relevant to authentication. Zone 1 (client/browser) is fully untrusted: all socket payloads, wallet addresses, and JWT tokens received from clients are treated as untrusted inputs. Zone 2 (server socket memory) is conditionally trusted: once `handleAuthenticate()` verifies a wallet signature, `client.isAuthenticated` and `authenticatedWallets[client.id]` are the runtime source of truth for that socket's identity — but this trust is lost on disconnect and must be re-established on reconnect. Zone 3 (Telegram initData + Privy JWT) forms a secondary trust channel: TG initData is HMAC-validated at handshake, Privy JWTs are verified on two HTTP endpoints. These two channels are merged at the `authenticate` handler via the DB backfill, which means a compromised Telegram→wallet link (via the `link-from-privy-telegram` endpoint) can poison the socket-level TG identity for any subsequent auth by that wallet.
<!-- CONDENSED_SUMMARY_END -->

---

# Authentication Mechanisms (AUTH-01) — Full Analysis

## Executive Summary

The authentication architecture has undergone significant positive changes since the Feb 2026 audit: timing-safe Telegram HMAC comparison was added, `verifyToken` dead code was removed with an explanatory comment, Privy JWT verification was added for link endpoints, the magic-link token mechanism is sound (CSPRNG, single-use, TTL), and the auth-reset-on-reconnect fix resolves a real iOS Safari ghost-auth race condition.

However, two critical concerns persist or are newly introduced:

1. The **JWT is still never verified server-side** (H029 is partially resolved — the JWT is no longer dead letter code because it's returned to the client and used to authenticate link endpoints, but the core issue that the server never calls `jwt.verify()` to gate any socket events remains).
2. A **new identity takeover vector** exists via `/api/wallet/link-from-privy-telegram` which trusts client-supplied `telegramUserId` without verifying it against Privy's user record server-side.

The auth model is fundamentally a socket-flag system (`client.isAuthenticated`), which is reasonable for a real-time game but creates vulnerabilities when that session model intersects with HTTP endpoints that need stateless proof of identity.

## Scope

Off-chain authentication only. Files analyzed:
- `server/middleware/auth.js` (185 LOC) — wallet signature verify, JWT generate, handleAuthenticate
- `server/middleware/telegram.js` (114 LOC) — initData HMAC validation, socket middleware
- `server/middleware/guards.js` (218 LOC) — requireAuth, requireAuthIfWagered, withLock, safeHandler
- `server/services/privyAuth.js` (127 LOC) — Privy JWT verify middleware
- `server/services/walletLinkTokens.js` (114 LOC) — magic-link token issue/consume
- `server/services/bot.js` (420 LOC, first 250 read) — Telegram commands, mintLinkTokenIfNeeded
- `server/socket-io/main.js` (1850+ LOC, key sections read) — authenticate handler, event auth guards
- `server/socket-io/groupchat.js` (420 LOC) — tgIdFor(), fireGroupShot, forfeitGroupMatch, purchaseGroupWeapon, getGroupMatch
- `server/index.js` (600+ LOC) — HTTP route auth, link endpoints, CORS, helmet
- `client/src/App.js` (452 LOC) — socket global, auth-reset entry point
- `client/src/wallet/WalletContext.js` (1044 LOC) — Privy SDK, authenticate(), auth-reset-on-reconnect

## Key Mechanisms

### 1. Wallet Signature Authentication (Primary WebSocket Auth)

**Flow:**
1. Client calls `authenticate()` in `WalletContext.js:530-562`
2. Client signs `"SolShot Auth: <walletAddress> at <timestamp>"` via `privySignMessageFn` (Privy embedded wallet)
3. Client emits `authenticate` event with `{ walletAddress, message, signature (base64), timestamp }`
4. Server `main.js:1240` calls `handleAuthenticate(client, data)` from `auth.js:114`
5. `verifyAuthMessage()` checks timestamp freshness (5-min window, -60s future tolerance)
6. `verifyWalletSignature()` runs `nacl.sign.detached.verify()` with the claimed public key
7. On success: `client.isAuthenticated = true`, `authenticatedWallets[client.id] = walletAddress`
8. A JWT is generated via `generateToken()` and returned in `authResult.token`
9. Server emits `authResult` — client sets `isAuthenticated = true` in React state

**What the JWT is used for:** The JWT is returned in `authResult` and received by the client (`WalletContext.js:667-675`). The client stores it implicitly (in the socket event payload). On the **client side**, `privyGetAccessToken()` is used (a different Privy-issued JWT) for HTTP link endpoints, not the server-generated JWT. The server-generated JWT is sent to the client and then... never used. No server code calls `jwt.verify()`. The auth.js comment at line 104 says "verifyToken removed — was dead code" but `generateToken` still runs and the token is still emitted. The token is useless.

**Replay window:** `AUTH_TIMEOUT = 5 * 60 * 1000` (5 minutes). No nonce. An attacker who captures a signed auth message (e.g., via MITM or log exposure) can replay it within 5 minutes to authenticate as that wallet on any socket.

### 2. Privy JWT Verification (HTTP Link Endpoints)

`server/services/privyAuth.js` wraps `@privy-io/server-auth`'s `PrivyClient.verifyAuthToken()`. The Privy SDK handles: issuer check, audience check (App ID), expiry check, algorithm verification. The `requirePrivyAuth` middleware extracts the Bearer token from `Authorization` header and calls `client.verifyAuthToken(token)`.

**Configuration:** Requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET` env vars. If either is missing: returns `null` from `getClient()`, logs a warning, and passes ALL requests through. This is explicitly the "graceful dev mode" but if Render has these unset accidentally, production has no JWT gate.

**Usage:**
- `POST /api/wallet/link-from-tg-token` — `required: false` (soft). JWT presence and validity are nice-to-have; magic-link token alone is sufficient.
- `POST /api/wallet/link-from-privy-telegram` — `required: true`. JWT is mandatory. This is the correct approach.

### 3. Telegram initData Validation (Group Match Auth)

`telegramSocketMiddleware` runs on every socket connection (`server/index.js:116`). If `socket.handshake.auth.telegramInitData` is present, it runs `validateTelegramInitData()`:
1. Parse as URLSearchParams
2. Extract and remove `hash` parameter
3. Sort remaining params alphabetically → `dataCheckString`
4. `secretKey = HMAC-SHA256("WebAppData", botToken)`
5. `computedHash = HMAC-SHA256(secretKey, dataCheckString)`
6. `timingSafeEqual(computedHash, hash)` — correct, fixes H041

**Auth date check:** `now - authDate > 86400` (24 hours). This is the replay window. Feb's finding was a 5-minute window; this 24-hour window for TG auth is intentionally more lenient (Telegram's own recommendation is up to 24 hours) but creates a wider replay opportunity.

**Non-TG connections:** If no `telegramInitData`, middleware calls `next()` without error. This is the correct behavior for browser-only connections.

### 4. Magic-Link Token Mechanism

`walletLinkTokens.js`:
- `mintLinkToken()`: `crypto.randomBytes(32).toString('base64url')` → 43-character URL-safe token. Entropy: 256 bits. Single-use: deleted immediately on `consumeLinkToken()` call, even before expiry check. TTL: 10 minutes.
- `consumeLinkToken()`: Deletes on first lookup regardless of expiry, then checks expiry. This means a token gets consumed even if expired — but returns `null` so the endpoint rejects the claim. This is correct behavior (prevents timing oracle on expiry check).
- Sweep timer uses `setInterval` with `unref()` — will not keep the process alive.
- Store is in-memory. Server restart loses all pending tokens. Users who have opened the link URL but not completed the flow before a server restart will get `token_invalid_or_expired`.

**Bot integration (`bot.js:153-168`):** `mintLinkTokenIfNeeded` only mints in private DM (`ctx.chat.type === 'private'`), only for users without existing wallet binding. Correct — prevents link tokens from appearing in group chat messages where multiple users could see them.

### 5. Auth-Reset-on-Reconnect (Commit 8eefcca)

`WalletContext.js:724-755` — Two socket listeners:
- `disconnect`: Sets `isAuthenticated = false`, `authAttemptedRef.current = false`
- `connect`: Sets `authAttemptedRef.current = false`

Combined with the existing auto-auth effect (`WalletContext.js:756-772`), which watches `[connected, publicKey, isAuthenticated]`: when `isAuthenticated` becomes false after disconnect + reconnect with same wallet, the effect re-fires and calls `authenticate()`.

**What this fixes:** The iOS Safari tab-backgrounding race: old socket disconnects → new socket has no auth state → client's `isAuthenticated` was still `true` → auto-auth skipped → `fireGroupShot` rejected by server as `no_identity`.

**What survives the reset:** Privy wallet key remains in Privy's iframe-isolated signing channel (not affected). `walletAddress` computed from `publicKey` persists (wallet didn't disconnect). `walletHandle` (server-emitted handle) is re-fetched by the server on the next successful auth. The React context value `connected` remains true (wallet is still provisioned).

**New surface:** During the ~1-second polling window between disconnect and re-auth completion, events that need auth are rejected silently. The client has no mechanism to queue events and replay them after re-auth. For `fire` events this could cause a lost shot in a wagered match. However, since `requireAuth` emits `${eventName}Error` (e.g., `fireError`), a client listening for `fireError` could potentially retry. It's unclear whether `BattleScreen.js` handles `fireError` gracefully.

### 6. `tgIdFor()` and Identity in Group Matches

`groupchat.js:72-78`:
```javascript
function tgIdFor(socket, payload) {
    if (socket?.telegramUser?.id) return socket.telegramUser.id;
    if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) {
        return payload.telegramUserId;
    }
    return null;
}
```

The comment says this only trusts `socket.telegramUser.id` set by HMAC-validated initData. This was true in Feb. Now it is **not fully true**.

The `authenticate` handler at `main.js:1298-1304` backfills `client.telegramUser` when:
- Wallet auth succeeds AND
- `User.telegramUserId` exists in MongoDB AND
- `client.telegramUser?.id` is not already set

This means a Privy browser user (no TG initData) who has completed the wallet-link flow will have `client.telegramUser.id` set to their DB-stored TG user ID. `tgIdFor()` will trust this as if it came from HMAC-validated initData. The trust is indirect: wallet auth (nacl verify) → User doc lookup → telegramUserId value. The link between the wallet and the TG user ID was established via `linkTelegramIdentity`, which is called by the link endpoints.

**The risk:** If the `/api/wallet/link-from-privy-telegram` endpoint is exploited to link an attacker's wallet to a victim's TG ID, then when the attacker authenticates their wallet, `client.telegramUser.id` will be set to the victim's TG ID. From this point, every `tgIdFor()` call will return the victim's TG ID for the attacker's socket — they can fire shots, forfeit, purchase weapons, etc. as the victim in group matches.

## Trust Model

```
Untrusted:
  - All socket event payloads
  - walletAddress, message, signature fields in `authenticate`
  - HTTP request bodies on /api/* endpoints
  - Telegram initData (before HMAC validation)
  - Privy JWT tokens (before SDK verification)
  - telegramUserId in /api/wallet/link-from-privy-telegram body

Conditionally Trusted (after verification):
  - client.isAuthenticated (after nacl.sign.detached.verify)
  - client.walletAddress (after auth)
  - client.telegramUser (after telegramSocketMiddleware HMAC, OR after DB backfill)
  - req.privyUserId (after Privy SDK verify)
  - magic-link token claims (after consumeLinkToken, single-use)

Trusted:
  - MongoDB User documents (modulo the link endpoint attack vector)
  - server keypair operations (separate from auth)
```

## Auth Surface Map

| Entry Point | Auth Mechanism | Guards |
|-------------|---------------|--------|
| WebSocket connect | Optional TG initData HMAC | telegramSocketMiddleware (pass-through if absent) |
| `authenticate` event | Wallet nacl signature | verifyWalletSignature, timestamp check |
| `fireGroupShot`, `forfeitGroupMatch`, `purchaseGroupWeapon`, `groupShopComplete`, `getMyGroupMatches` | tgIdFor() → socket.telegramUser.id | Returns null → rejects with no_identity |
| `getGroupMatch` | None | Match data visible to anyone; room join gated by tgId only |
| `fire`, `escrowDepositConfirm`, `escrowPartialStart`, `escrowCancelAll` | requireAuth (isAuthenticated flag) | Hard reject |
| `createRoom`, `joinRoom` (wagered) | requireAuth | Hard reject |
| `shoot`, `getWeaponArray` | None | No auth guard |
| `weaponPick`, `createWeaponArray`, `buyWeapon`, `shopDone`, `requestTerrain`, `stepLeft`, `stepRight`, `positionUpdate`, `giveTurn`, `requestTurn`, `playAgainRequest`, `weaponChange`, `angleChange`, `powerChange` | requireAuthIfWagered | Pass-through for non-wagered |
| `POST /api/wallet/link-from-tg-token` | Magic-link token (primary) + Privy JWT (soft, optional) | requirePrivyAuth({required:false}) |
| `POST /api/wallet/link-from-privy-telegram` | Privy JWT (required) | requirePrivyAuth({required:true}) |
| `POST /api/challenge` | None | No auth at all |
| `GET /api/challenge/:code` | None | Read-only, no auth |
| `GET /stats` | Admin API key | requireAdminKey |
| `POST /api/admin/reload-keys` | Admin API key | requireAdminKey |
| Telegram webhook | HMAC-SHA256 (Telegraf handles) | Bot framework validation |

## Auth State Transitions

```
Anonymous Socket
  ↓ (telegramSocketMiddleware)
socket.telegramUser set (if TG initData valid) OR socket remains anonymous
  ↓ (authenticate event)
client.isAuthenticated = true
client.walletAddress = verified wallet
authenticatedWallets[socket.id] = wallet
  ↓ (User lookup)
client.telegramUser.id backfilled (if DB has TG link for this wallet)
  ↓ (socket.disconnect)
client.isAuthenticated = false (socket dead)
authenticatedWallets[socket.id] deleted
  ↓ (socket reconnect with same Privy wallet)
New socket, isAuthenticated = false
  ↓ (auth-reset-on-reconnect in WalletContext)
authenticate() called → cycle repeats
```

## State Analysis

- **`authenticatedWallets`** (server/socket-io/main.js): Map<socketId → walletAddress>. Cleared on disconnect. Used in `prestigeBurn` and `buildUserQueryForClient`. Source of truth for "which wallet is this socket?"
- **`client.isAuthenticated`** (socket property): Boolean flag. The primary auth gate for `requireAuth`.
- **`client.telegramUser`** (socket property): TG user object. Set by telegramSocketMiddleware (HMAC) or by authenticate handler (DB backfill). Used by `tgIdFor()`.
- **Privy session** (client-side only): `privyAuthed` React state, access tokens via `privyGetAccessToken()`. Server never has direct access to Privy session state — only via token verification.
- **walletLinkTokens store**: In-memory Map<token → { telegramUserId, username, firstName, expiresAt }>. Lost on server restart.
- **`verifiedBurnTxs`** (shot-token.js, not read here): In-memory replay protection for burn TXs. Lost on restart.

## Dependencies

- `@solana/web3.js` (PublicKey.isOnCurve validation)
- `tweetnacl` (nacl.sign.detached.verify)
- `jsonwebtoken` (JWT generate only — verify never called)
- `@privy-io/server-auth` (PrivyClient.verifyAuthToken)
- `@privy-io/react-auth` and `/solana` (client-side Privy SDK)
- Node.js `crypto` (HMAC for Telegram, randomBytes for link tokens)
- Telegram Bot API (initData, HMAC-SHA256 validation spec)

## Focus-Specific Analysis

### Feb Finding H029: JWT Never Consumed — Verdict: PARTIALLY RESOLVED

**What changed:** `verifyToken()` was removed from `auth.js` (line 104 comment confirms). `generateToken()` still runs and is returned to the client. The comment says it was dead code. The token is now returned to the client, who uses Privy's `getAccessToken()` (a different JWT) for HTTP link endpoints.

**What remains:** `generateToken()` in `auth.js:96-102` creates a JWT with `{ wallet: walletAddress }` signed with `JWT_SECRET` and 24-hour expiry. This token is emitted to the client in `authResult.token`. The client receives it in `WalletContext.js:667-675` via the `authResult` handler, but the handler only reads `result.success` — it never stores or uses `result.token`. The token is silently dropped on the client side too.

**Conclusion:** H029 is **largely unresolved** as a conceptual issue. The JWT is generated (wasting CPU + leaking the JWT library dependency), emitted to the client (wasting bandwidth), and then discarded by both sides. The server has never used it to verify anything. The practical security risk is low (the JWT_SECRET isn't doing anything useful), but the misleading architecture remains: a developer reading the code might assume JWTs are the auth mechanism and build new HTTP endpoints expecting `jwt.verify()` to exist somewhere.

### Feb Finding H041: Timing-Unsafe HMAC — Verdict: RESOLVED

`telegram.js:54-56` uses `crypto.timingSafeEqual()` with proper Buffer length equality check first. The Feb finding is fixed.

### Feb Finding H029 + C-6: Signature Replay 5-Min Window — Verdict: UNCHANGED

The 5-minute `AUTH_TIMEOUT` window in `auth.js:28` is unchanged. No nonce was added. For the wallet auth path, replay within 5 minutes remains possible. For the Telegram initData path, the window is 24 hours (broader).

### Feb Finding C-7: Six Unauthenticated Socket Events — Verdict: PARTIALLY RESOLVED

The six previously flagged events were `fireGroupShot`, `forfeitGroupMatch`, `confirmGroupDeposit`, `getGroupMatch`, `purchaseGroupWeapon`, etc. Current state:
- `fireGroupShot` → `tgIdFor()` check (no_identity rejection) ✓
- `forfeitGroupMatch` → `tgIdFor()` check ✓
- `purchaseGroupWeapon` → `tgIdFor()` check ✓
- `groupShopComplete` → `tgIdFor()` check ✓
- `getMyGroupMatches` → `tgIdFor()` check ✓
- `getGroupMatch` → **NO AUTH** — match data + room join ✗
- `shoot` (legacy relay) → **NO AUTH** ✗
- `getWeaponArray` → **NO AUTH** (not wagered-gated) ✗

### Feb Finding H032: window.socket XSS — Verdict: PARTIALLY MITIGATED

`App.js:57-62`: `window.socket` is set as non-enumerable (`enumerable: false`), non-writable, non-configurable. This reduces discoverability in `for...in` loops and `Object.keys()` but `window.socket` is still accessible by name. An injected script that knows the property name can call `window.socket.emit('fire', {...})`. The Phaser bootstrap (`PhaserBootstrap.js`) likely accesses `window.socket` by name. Non-enumerable is a reduction, not an elimination of the attack surface.

### Today's 8eefcca Commit Assessment

The auth-reset-on-reconnect change is **architecturally sound and does not introduce new attack surfaces**. Key observations:
- The reset happens on `disconnect` (server closed the old socket) and `connect` (new socket established). Both are reliable Socket.IO lifecycle events.
- `authAttemptedRef` prevents repeated sign prompts on rejection (user said no → don't ask again until wallet state changes).
- The 1-second polling interval is pragmatic; a more elegant solution would be socket.once('connect', authenticate) but the polling achieves the same result.
- There is no state that survives the reset that could be exploited: `isAuthenticated` resets to false, `authAttemptedRef` resets to false, wallet address remains (derived from Privy's immutable embedded wallet).
- The only concern is the window between disconnect and re-auth where authenticated events are rejected. This is unavoidable in stateless socket design.

## Cross-Focus Intersections

- **AUTH-03 (Authorization)**: The `getGroupMatch` unauthenticated read is also an authorization concern — non-players can access match state.
- **LOGIC-01 (Business Logic)**: The `shoot` unauthenticated relay: need to verify whether any server-side game state depends on `opponentShoot` relay (it appears to be purely client-to-client relay, but groupchat.js `fireGroupShot` is the authoritative fire path).
- **ERR-02 (Race Conditions)**: The auth-reset race: what state exists in `depositTimers`, `wagerStates`, etc. keyed by the old socket ID? These are keyed by `roomId` not `socketId`, so they survive reconnect, but the auth state on the new socket doesn't reference them until auth completes.
- **SEC-02 (Secrets)**: The `PRIVY_APP_ID` appears in `REACT_APP_PRIVY_APP_ID` (client-side). Per Privy docs, App IDs are public. Verify `PRIVY_APP_SECRET` is not in client env.
- **DATA-04 (Logging)**: `clientDebugLog` handler at `main.js:1356-1369` accepts arbitrary payloads from any connected socket (not gated by auth). It does cap payload to 2KB and is wrapped in try/catch. But unauthenticated sockets can pollute server logs.

## Cross-Reference Handoffs

- → **AUTH-03**: Audit every socket event for horizontal access control — can player A trigger actions that affect player B's match state? Start with `giveTurn`, `requestTurn`, which relay turn state to the room.
- → **LOGIC-01**: Verify `shoot` event (unauthenticated relay) cannot affect any match state on the server. It emits `opponentShoot` to the room — trace whether this triggers any server-side handlers.
- → **ERR-02**: Trace the auth-reset-reconnect cycle for wagered matches: is there a path where a player disconnects after `escrowDepositConfirm` but before `requestTerrain`, and then reconnects but re-auth fails (user rejects Privy sign prompt), leaving the match in a partially-funded state?
- → **SEC-02**: Confirm `PRIVY_APP_SECRET` is not in any client config file, `.env.example`, or git history.

## Risk Observations

### Critical

1. **`link-from-privy-telegram` trusts client-supplied telegramUserId** (`server/index.js:502-518`): A valid Privy JWT proves the caller has an authenticated Privy session, but it does NOT prove the `telegramUserId` in the body is the caller's actual linked Telegram account. Mitigation: call `privy.getUser(req.privyUserId)` server-side to read the linked Telegram from Privy's records, and reject if `user.telegram.telegramUserId !== body.telegramUserId`.

2. **JWT generated and never verified** (`server/middleware/auth.js:96-134`): The JWT architecture is vestigial. It creates technical debt (developers may expect JWT-based HTTP auth to "just work") and wastes resources. Recommendation: either remove `generateToken()` and the `jsonwebtoken` dependency entirely, or implement `jwt.verify()` on at least one route (e.g., a `/api/auth/me` endpoint) to make the JWT meaningful.

### High

3. **`shoot` event no auth guard** (`main.js:3377`): Add `requireAuthIfWagered` before the relay. This is a low-effort fix.

4. **Telegram initData 24-hour replay window** (`telegram.js:68-73`): Consider reducing to 1 hour. Telegram's own recommendation is "you should check this value more carefully" rather than prescribing 24 hours. Lower to 3600 seconds for group-match auth.

5. **`/api/challenge` unauthenticated** (`index.js:282`): Challenge creation should require at minimum a wallet signature or Privy JWT to prevent impersonation.

6. **`getGroupMatch` unauthenticated read** (`groupchat.js:97-130`): Match snapshots contain player wallet addresses, HP values, wager amounts. Require TG initData or wallet auth to read match state.

7. **Privy env silent fail** (`privyAuth.js:33-45`): Add a startup assertion or at minimum emit a `console.error` (not just `warn`) if in production and `PRIVY_APP_ID`/`PRIVY_APP_SECRET` are unset. Currently only logs as `warn`.

### Medium

8. **`telegramUser` DB backfill erodes security comment** (`main.js:1298-1304`): The comment in `groupchat.js:65-77` claims "only trusts socket.telegramUser.id" but this is no longer accurate. Update the comment and consider whether the backfill should be explicitly labeled as "DB-derived, not HMAC-derived" on the socket property.

9. **`link-from-tg-token` soft JWT** (`index.js:432`): The magic-link token is delivered via Telegram DM. If the DM is forwarded, screenshotted, or accessed by a third party, they can redeem the token without a Privy session. Upgrading to `required: true` when `isPrivyAuthConfigured()` returns true would eliminate this.

10. **Dead Dynamic.xyz CSP origins** (`index.js:163-164`): Remove `https://app.dynamic.xyz` and `https://api.dynamic.xyz` from `connectSrc`.

### Low

11. **`clientDebugLog` unauthenticated** (`main.js:1356-1369`): Add `if (!authenticatedWallets[client.id]) return;` guard to prevent log pollution from unauthenticated sockets.

## Novel Attack Surface Observations

1. **DB-backfill identity chain attack**: The path `link-endpoint-exploit → User.telegramUserId poisoning → authenticate backfill → tgIdFor() returns victim TG ID` creates a compound attack that is not apparent from reading any single file. It requires understanding: (a) the `/link-from-privy-telegram` unvalidated `telegramUserId`, (b) the `authenticate` handler's DB lookup, (c) the `tgIdFor()` trust model. None of these three components looks individually problematic; the attack only exists in their composition.

2. **Soft-mode JWT + 24h TG replay = double grace**: In the theoretical case where an attacker exfiltrates both a TG initData and the magic-link token delivered in the same Telegram DM session, they have a 24-hour window to use the initData for socket auth AND can skip the Privy JWT on the link endpoint. Both protections have fallback/graceful modes that can be combined by an attacker operating within standard constraints.

3. **`clientDebugLog` as an ambient-noise injection vector**: An unauthenticated socket can emit arbitrary `clientDebugLog` payloads, polluting server logs with fake traces. This could be used to confuse incident response ("the logs show player X fired but they didn't") rather than to attack the game directly.

## Raw Notes

- `auth.js` comment at line 104: "E1: verifyToken removed — was dead code (never imported anywhere)". This is accurate. But `generateToken` is still called and returned.
- The `JWT_SECRET` in dev mode uses `crypto.randomBytes(32).toString('hex')` — ephemeral, correct for dev. In production the `process.exit(1)` guard is good.
- `handleAuthenticate` in `auth.js:114` sets `client.walletAddress` AND `client.isAuthenticated = true`. But in `main.js:1248` only `authenticatedWallets[client.id] = result.walletAddress` is set externally — `client.isAuthenticated` and `client.walletAddress` are set inside `handleAuthenticate`. These three state updates are consistent.
- The `requireAuth` function checks `client.isAuthenticated` (the socket property set by `handleAuthenticate`), not `authenticatedWallets[client.id]`. These should be equivalent but `authenticatedWallets` is the more explicit record.
- `socketsByTgId` tracking at `main.js:1120-1135`: logs multi-device TG sessions, cleans up on disconnect. Good observability, no security issue.
- `setWalletHandle` handler at `main.js:1382` does not require auth. A socket can set a wallet handle without authenticating. The server writes to MongoDB via `User.updateOne`. This is low-risk (handle is display name only, first-set-wins) but worth noting.
- No rate limiting on the `authenticate` event specifically. The global per-socket rate limiter (30 events/second, escalating to disconnect at 3x) applies, but targeted brute-force of the auth message timestamp (within 5-minute window, 1ms granularity = 300,000 attempts max) is bounded by that rate limit. Math: 30/sec max = 1800/min = 9000/5min vs 300,000 theoretical space → feasible? No: timestamp is millisecond-level (must also match content), and nacl.sign.detached.verify on invalid signature is fast. The attacker would need to obtain a validly-signed message for a target wallet and replay it; they can't brute-force the signature itself.
- The `consumeLinkToken` function deletes the token before checking expiry. This prevents a timing oracle on whether the token is expired vs not-found. However, it also means a token that was expired is deleted silently — the user would need to go back to the bot and /link again. Minor UX annoyance but correct security behavior.
