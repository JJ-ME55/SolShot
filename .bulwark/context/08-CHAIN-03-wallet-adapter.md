---
task_id: db-phase1-chain-03
provides: [chain-03-findings, chain-03-invariants]
focus_area: chain-03
files_analyzed:
  - client/src/wallet/WalletContext.js
  - client/src/App.js
  - client/public/index.html
  - client/vercel.json
  - server/services/walletLinkTokens.js
  - server/services/privyAuth.js
  - server/services/users.js
  - server/middleware/auth.js
  - server/socket-io/main.js (auth + identity sections)
  - server/index.js (wallet link route handlers)
  - server/models/User.js
finding_count: 12
severity_breakdown: {critical: 2, high: 4, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# CHAIN-03: Wallet Integration & Adapter Security — Condensed Summary

## Key Findings (Top 10)

- **Client-supplied `telegramUserId` trusted on `/api/wallet/link-from-privy-telegram`**: the server accepts `telegramUserId` from the request body without cross-checking it against the Privy-verified JWT claims, allowing any authenticated Privy user to bind an arbitrary TG user ID to their wallet — `server/index.js:502-519`
- **Wallet rotation root cause — `walletAddress` is never updated once set**: `users.js:91` only attaches a wallet when `!existingByTg.walletAddress`; if Privy re-provisions the embedded wallet (SDK upgrade, explicit wallet reset), the User doc retains the old pubkey permanently with no update path — `server/services/users.js:91`
- **`requirePrivyAuth({ required: false })` on magic-link bind endpoint**: the primary wallet-bind endpoint (`/api/wallet/link-from-tg-token`) passes through even when a Privy JWT is present but fails verification — attacker can still bind with a valid magic-link token alone — `server/index.js:432`
- **CSP on server (`helmet`) still references `app.dynamic.xyz` / `api.dynamic.xyz`** which are the old Dynamic wallet provider, not the current Privy stack — both `connectSrc` and `frameSrc` include these dead origins, widening the attack surface for framing and data exfiltration — `server/index.js:163-168`
- **Vercel deployment has no `X-Frame-Options` or CSP headers**: `client/vercel.json` only sets cache-control; the server-side helmet CSP is served from the API server, not from Vercel — the client HTML is served without any CSP from Vercel's CDN — `client/vercel.json`
- **`window.solWallet` global no longer set (CS-04 fix applied)** — previous exposure removed; `BattleScreen.js:120` and `LobbyScreen.js:321` both comment "Use context hook instead of window.solWallet". However, `window.socket` is still set (non-enumerable) — `client/src/App.js:57-62`
- **`signMessageUnified` suppresses Privy's signing modal (`showWalletUIs: false`)** for authentication — the user never sees a confirmation for the wallet ownership proof that gates wagered match entry — `client/src/wallet/WalletContext.js:499-505`
- **`PRIVY_APP_ID` is hardcoded in a source-code comment** in `privyAuth.js:21` — while not a secret, this leaks the App ID from the server bundle, reducing one step in targeting Privy API endpoints — `server/services/privyAuth.js:21`
- **Signature challenge message includes no nonce** — `"SolShot Auth: <wallet> at <timestamp>"` — timestamp window is 5 minutes; a captured auth socket payload can be replayed against a fresh socket connection within that window — `server/middleware/auth.js:28,76-88`
- **`autoBindAttempted` ref is never reset on wallet change** — if the Privy wallet address changes mid-session (wallet rotation), the auto-bind effect skips re-binding because `autoBindAttempted` is already `true` — `client/src/wallet/WalletContext.js:422`
- **`confirmTransaction(signature, 'confirmed')` used for escrow deposit confirmation** — `confirmed` commitment on devnet is typically 2 confirmations; financial settlement decisions (match start gating) should use `finalized` — `client/src/wallet/WalletContext.js:584`
- **`frame-src` in client CSP (`index.html`) allows `https://*.privy.io` wildcard** — permits framing from any Privy subdomain; a compromised or attacker-registered subdomain under `privy.io` could render a phishing iframe — `client/public/index.html:7`

## Critical Mechanisms

- **Privy embedded wallet**: Privy provisions a Solana keypair in an iframe-isolated key store per user. Sign operations go through `useSignTransaction`; the app broadcasts via its own `Connection(clusterApiUrl(NETWORK), 'confirmed')`. This bypasses Privy's hosted RPC (documented as unreliable) but means transaction confirmation semantics are dictated by the app, not Privy's hardened path — `WalletContext.js:512-526`
- **Wallet → TG identity bind (two paths)**: (1) magic-link token from bot DM, consumed at `/api/wallet/link-from-tg-token`; (2) Privy-direct via `/api/wallet/link-from-privy-telegram` with JWT. Path 2 trusts the client-supplied `telegramUserId` body param — `server/index.js:494-536`
- **Socket auth handshake**: client signs `"SolShot Auth: <wallet> at <timestamp>"`, server verifies via `nacl.sign.detached.verify`, marks `client.isAuthenticated = true`. No nonce; 5-minute replay window. JWT generated but not used as a bearer token anywhere — `server/middleware/auth.js:38-134`
- **`validateEscrowTransaction()`**: client-side guard before signing — checks program ID against allowed list and verifies instruction discriminator matches `deposit_wager`. Skipped entirely when `ALLOWED_ESCROW_PROGRAM_IDS.length === 0` (i.e., no env vars set) — `WalletContext.js:79-110`

## Invariants & Assumptions

- INVARIANT: A User document's `walletAddress` is never overwritten once set — enforced at `server/services/users.js:91` (`if (walletAddress && !existingByTg.walletAddress)`) — **Partially enforced**: prevents write, but does NOT handle the case where the wallet address legitimately rotates (Privy re-provision), leaving the DB permanently stale ⚠
- INVARIANT: Magic-link tokens are single-use — enforced at `walletLinkTokens.js:79` (`store.delete(token)` before TTL check) — Enforced
- INVARIANT: Magic-link tokens expire after 10 minutes — enforced at `walletLinkTokens.js:81` (`entry.expiresAt < Date.now()`) — Enforced
- ASSUMPTION: `telegramUserId` in the `link-from-privy-telegram` request body matches the TG account actually linked to the Privy session — UNVALIDATED ⚠ (server does not call Privy's `getUser()` to verify; trusts client-supplied value — `server/index.js:512-519`)
- ASSUMPTION: Privy JWT `verified.userId` (Privy DID) correlates to a unique human identity with one canonical Solana wallet — UNVALIDATED: a Privy user can have multiple linked wallets, and the server only reads `walletAddress` from the request body, not from the JWT claims — `server/services/privyAuth.js:86-87`
- ASSUMPTION: `window.socket` non-enumerable property assignment prevents XSS access — INVALID: `non-enumerable` only hides from `for...in`; `window.socket` is still directly accessible as `window.socket` from any injected script — `client/src/App.js:57-62`
- ASSUMPTION: Privy's embedded wallet SDK prevents key export by default — PARTIALLY VALID: key export requires explicit `openPrivyAccount()` call, but the `exportWallet` hook is unconditionally initialized and exposed in the context value — `WalletContext.js:795-805`

## Risk Observations (Prioritized)

1. **CRITICAL — Client-supplied `telegramUserId` on `/api/wallet/link-from-privy-telegram`**: `server/index.js:502-519` — An attacker with a valid Privy JWT (i.e., any authenticated user) can POST any numeric `telegramUserId` to bind their wallet to a victim's TG account. This mis-routes settlement funds to the attacker's wallet when the victim wins a group-chat wagered match, because `settleMatchEscrowV2` uses `winnerPlayer.walletAddress` from the User doc.

2. **CRITICAL — Wallet rotation produces permanent DB/on-chain address mismatch**: `server/services/users.js:91` — If Privy re-provisions the embedded wallet (key rotation, SDK migration, or user's explicit wallet reset), the `User.walletAddress` stays bound to the old pubkey. The new wallet cannot be authenticated as the same user. Settlement of wagered matches would attempt to send funds to the old (potentially unreachable) address. No migration path exists.

3. **HIGH — Signature replay within 5-minute window**: `server/middleware/auth.js:28` — No nonce on the auth challenge. A MITM or network observer can capture the `authenticate` socket payload and replay it against a fresh socket connection within the 5-minute window to impersonate the wallet owner. Particularly relevant in TG WebView contexts where WebSocket traffic may be observable.

4. **HIGH — `requirePrivyAuth({ required: false })` on the magic-link bind endpoint degrades to token-only security**: `server/index.js:432` — The comment says "soft mode" allows the JWT verification to fail silently. This means a valid magic-link token alone is sufficient to bind any wallet to the TG user — the JWT layer is advisory, not enforced. When `PRIVY_APP_SECRET` is not set on Render (the current stated state), this is guaranteed soft.

5. **HIGH — Server CSP still references `app.dynamic.xyz` in `frameSrc`**: `server/index.js:168` — Dynamic was the previous wallet provider; it is no longer used. Keeping `https://app.dynamic.xyz` in `frameSrc` means a compromised Dynamic origin could iframe-inject content into the SolShot app context. Should be removed.

6. **HIGH — Vercel client deployment has no security headers**: `client/vercel.json` — No `X-Frame-Options`, no `Content-Security-Policy`, no `X-Content-Type-Options`, no `Strict-Transport-Security`. The server's `helmet()` CSP applies to the Express server (`solshot-server.onrender.com`), not the Vercel client (`solshot.gg`). The client's only CSP is the `<meta>` tag in `index.html`, which cannot set `frame-ancestors` and does not apply to subresources from the CDN layer.

7. **MEDIUM — `autoBindAttempted` never resets on Privy wallet address change**: `WalletContext.js:422` — The auto-bind of TG identity fires once per page load. If the Privy wallet address changes during a session (theoretically possible; practically rare today), the new wallet will not be bound to the TG user ID. Contributing factor to the "DB wallet ≠ on-chain wallet" issue.

8. **MEDIUM — `confirmTransaction('confirmed')` for wagered match deposit**: `WalletContext.js:584` — The client confirms deposit with `'confirmed'` commitment (2 slots on devnet, not finalized). The server's `escrowDepositConfirm` handler trusts the client's claim that the transaction confirmed. If the transaction is rolled back after 2 confirmations but before finalization, the server believes the deposit is in but the escrow PDA has no funds. Should use `'finalized'` for financial paths.

9. **MEDIUM — `signAndBurnShot` bypasses `validateEscrowTransaction()`**: `WalletContext.js:638-660` — The burn instruction goes through `sendTransactionUnified` directly without any instruction-level pre-signing validation (no discriminator check, no program ID allowlist). A malicious server-side manipulation could substitute a different SPL instruction. The Privy signing modal IS shown (`showWalletUIs` defaults to true for transactions, suppressed only for signMessage).

10. **MEDIUM — `window.socket` non-enumerable but fully accessible**: `App.js:57-62` — Setting `enumerable: false` on a window property does not protect it from direct access (`window.socket.emit(...)`). Any XSS payload can call socket events directly. The prior `window.solWallet` exposure was the higher-risk one; that is now removed (CS-04 fix). But `window.socket` remains accessible.

11. **LOW — `PRIVY_APP_ID` value exposed in server-side comment**: `server/services/privyAuth.js:21` — The App ID (`cmorbf1nk00z10cidg6jitsgm`) is hardcoded in a comment. While Privy App IDs are considered semi-public (they appear in client-side JS bundles), their presence in server source code means it will appear in any future source code leak or repository exposure.

12. **LOW — `isFreshSignIn` flag and `clearFreshSignIn` exposed on context value**: `WalletContext.js:920-921` — This is consumed by menu/lobby screens to prompt "Welcome — add SOL?". If an attacker can call `clearFreshSignIn()` before the legitimate screen renders it, the funding prompt is suppressed. Low impact but leaked internal state.

## Novel Attack Surface

- **TG identity hijacking via `/api/wallet/link-from-privy-telegram`**: This endpoint was designed for the "auto-bind" fast path where a user authenticates Telegram in Privy. However, it takes the `telegramUserId` from the request body and only validates the Privy JWT (proving the caller is an authenticated Privy user) — it does NOT validate that the `telegramUserId` in the body matches the Telegram account actually linked in the Privy user object. Any authenticated Privy user can POST `telegramUserId: <victim_tg_id>` to redirect settlement funds from a victim's future wagered wins to their own wallet. The server even has a comment acknowledging this: "We trust client-supplied telegramUserId here" — `server/index.js:512`.

- **Privy wallet re-provision creates an orphaned on-chain settlement target**: Privy embedded wallets are MPC keys; Privy can technically rotate the underlying key material without changing the user's Privy DID. When this happens, the new Solana pubkey is different from the old one. The `linkTelegramIdentity` function only attaches a wallet when `!existingByTg.walletAddress` — so the new pubkey is silently ignored. Settlement continues to the old pubkey indefinitely, which may no longer be controllable by the user.

## Cross-Focus Handoffs

- → **CHAIN-01 (Transaction Construction & Signing)**: The `validateEscrowTransaction()` client-side guard is the only pre-signing check on the escrow deposit TX. Server-side (`escrowDepositConfirm` handler in `main.js`) does not re-verify the TX instructions — it trusts the client's report of a successful broadcast. Investigate whether the server verifies the TX on-chain before gating match start.
- → **AUTH-01 (Authentication)**: The 5-minute timestamp window with no nonce (`auth.js:28`) is a replay surface. The JWT generated by `generateToken()` is returned in `authResult` but never stored or validated on subsequent socket events (it was dead code per H029). Investigate whether this has been remediated or if the JWT is still dead.
- → **ERR-02 (Race Conditions)**: The `autoBindAttempted` state variable and the TG auto-bind effect in `WalletContext.js` have no mutex. Two concurrent renders could theoretically trigger two bind requests before the flag is set. Investigate whether React StrictMode double-invocation could cause duplicate binds.
- → **DATA-04 (Logging)**: `privyAuth.js:21` has the Privy App ID in a comment. Check whether any server log statements emit Privy JWT claims (userId, sessionId) which are sensitive.

## Trust Boundaries

The client fully trusts Privy's embedded wallet SDK for key custody. The server trusts the wallet address delivered in the `authenticate` socket event only after verifying a signature (nacl.sign.detached.verify). However, the 5-minute auth window with no nonce means the "trust established by a signature" can be inherited by a replay attacker within that window. The TG identity bind layer trusts Privy JWTs for authentication but does NOT verify that the claimed `telegramUserId` matches the authenticated Privy session's linked Telegram account — this is a server-side trust gap that enables identity re-binding. The client-side `validateEscrowTransaction()` is a defense-in-depth check before signing, but it is entirely skipped in dev/no-env mode and does not protect against a compromised server that sends a valid-discriminator TX with a wrong wager amount or recipient account.
<!-- CONDENSED_SUMMARY_END -->

---

# CHAIN-03: Wallet Integration & Adapter Security — Full Analysis

## Executive Summary

SolShot migrated from Dynamic → wallet-adapter → Privy between the Feb 2026 and May 2026 audits. The current stack is Privy-only: users authenticate with email or Telegram via Privy, which provisions an embedded Solana wallet in an iframe-isolated MPC key store. The app signs transactions by calling `useSignTransaction` from `@privy-io/react-auth/solana` and broadcasts via its own `Connection` to devnet (Privy's hosted RPC was too unreliable). Two identity-bind paths exist: a magic-link token path (bot `/link` DM) and a Privy-direct bind path (users who sign in with Telegram via Privy's OAuth flow).

The most significant finding is that the Privy-direct bind endpoint (`/api/wallet/link-from-privy-telegram`) accepts the `telegramUserId` from the request body without verifying it against the Privy JWT's linked Telegram account. This allows any authenticated Privy user to bind any Telegram user ID to their wallet, enabling settlement fund redirection in group-chat wagered matches. The second critical finding is the wallet rotation issue from the project memory: the User model never updates `walletAddress` once set, so a Privy wallet re-provision permanently mis-routes funds.

---

## Scope

**In scope (analyzed):**
- `client/src/wallet/WalletContext.js` — full (580 LOC)
- `client/src/App.js` — full (452 LOC)
- `client/public/index.html` — full (91 LOC)
- `client/vercel.json` — full (28 LOC)
- `server/services/walletLinkTokens.js` — full (114 LOC)
- `server/services/privyAuth.js` — full (127 LOC)
- `server/services/users.js` — full (251 LOC)
- `server/middleware/auth.js` — full (136 LOC)
- `server/socket-io/main.js` — auth + identity sections (lines 1260-1500)
- `server/index.js` — wallet link route handlers (lines 399-536)
- `server/models/User.js` — schema review (lines 1-121)

**Out of scope:** `programs/` (Anchor/on-chain), other server services not in the wallet adapter flow.

---

## Key Mechanisms

### 1. Privy Embedded Wallet Integration

`WalletContext.js` wraps `@privy-io/react-auth` (v3.23.1). Key hooks:
- `useWallets` (as `usePrivySolanaWallets`) — returns the array of the user's Solana wallets
- `useSignTransaction` (as `usePrivySignTransaction`) — signs without broadcasting; the app broadcasts via its own `new Connection(RPC_URL, 'confirmed')`
- `useSignMessage` (as `usePrivySignMessageFn`) — used for the auth challenge

The active wallet is selected via: `privySolanaWallets.find(w => w?.standardWallet?.name === 'Privy')` with a fallback to `[0]`. This is documented as correct per Privy's canonical pattern, but the fallback `privySolanaWallets[0]` could pick an external wallet (Phantom, etc.) if the user links one — silently changing which key signs.

Wallet provisioning is handled manually via `privyCreateSolanaWallet()` triggered by a `useEffect` when `privySolanaWallets.length === 0`. This was necessitated by a bug in `createOnLogin: 'users-without-wallets'` in an older SDK version; the config now re-enables `createOnLogin` while keeping the effect as a fallback, meaning wallet creation can be triggered twice in edge cases (the second call is caught by `already has an embedded wallet` error handling).

### 2. Authentication Handshake

Flow:
1. Client calls `authenticate()` → signs `"SolShot Auth: <walletAddress> at <timestamp>"` via `signMessageUnified` with `showWalletUIs: false` (no user-visible confirmation)
2. Client emits `authenticate` socket event with `{ walletAddress, message, signature, timestamp }`
3. Server calls `handleAuthenticate()` in `auth.js` → verifies format, timestamp (5-min window), signature via `nacl.sign.detached.verify`
4. On success: `client.walletAddress = walletAddress`, `client.isAuthenticated = true`, JWT generated and returned in `authResult`
5. Client sets `isAuthenticated = true` on `authResult.success`

No nonce. The 5-minute window (`AUTH_TIMEOUT = 5 * 60 * 1000`) means any captured auth payload is replayable against any fresh socket connection for 5 minutes. This was previously flagged as C-6 (Signature Replay 5-Min Window / H030) in the Feb audit and is tagged RECHECK.

The JWT generated at step 4 is NOT used as a bearer token on subsequent socket events. `verifyToken` was removed (`auth.js:104` comment: "E1: verifyToken removed — was dead code"). JWT is returned to the client but the client doesn't store or use it. This confirms the Feb finding H029 (JWT Dead Code) is not yet remediated.

### 3. TG → Wallet Identity Bind (Magic-Link Path)

Flow:
1. User runs `/link` in the Telegram bot
2. Bot calls `mintLinkToken({ telegramUserId, username, firstName })` → `crypto.randomBytes(32).toString('base64url')`, 10-min TTL, stored in `Map<string, TokenEntry>`
3. Bot DMs the URL `https://solshot.gg/?linkToken=<token>` to user
4. Client opens URL → `useEffect` in `WalletContext.js:294-345` detects `?linkToken=` in URL
5. If not authenticated, auto-opens Privy login modal (`privyLogin()`)
6. After wallet ready, POSTs `{ token, walletAddress }` to `/api/wallet/link-from-tg-token` with `Authorization: Bearer <privyAccessToken>` (optional)
7. Server: `requirePrivyAuth({ required: false })` → soft JWT check → `consumeLinkToken(token)` → `linkTelegramIdentity({ telegramUserId, walletAddress, ... })`
8. Token deleted from map regardless of outcome (single-use)
9. Client strips `linkToken` from URL via `history.replaceState`

**Key observation**: The `requirePrivyAuth({ required: false })` means JWT failure is non-fatal. The magic-link token alone is sufficient to bind. In dev mode (no `PRIVY_APP_SECRET`), the JWT check is entirely skipped.

### 4. TG → Wallet Identity Bind (Privy-Direct Path)

Flow:
1. User authenticates with Telegram via Privy's OAuth (or links Telegram to existing Privy account)
2. `WalletContext.js:422-469` `useEffect` fires when `privyUser?.telegram?.telegramUserId` is set and `walletHandle.telegramUserId` is null
3. POSTs `{ telegramUserId: Number(privyTgId), telegramUsername, walletAddress }` to `/api/wallet/link-from-privy-telegram` with `Authorization: Bearer <privyAccessToken>` (REQUIRED)
4. Server: `requirePrivyAuth({ required: true })` → JWT verified → `linkTelegramIdentity({ telegramUserId, walletAddress, ... })`

**KEY VULNERABILITY**: At step 3, `telegramUserId` comes from `privyUser?.telegram?.telegramUserId` which is the Privy user object's linked Telegram ID. This IS the correct value for the legitimate user. However, the server at step 4 takes `telegramUserId` from `req.body` and only validates that the Privy JWT is valid — it does NOT verify that the body's `telegramUserId` matches the TG account in the Privy JWT claims. `verified.userId` is Privy's internal DID, not the Telegram user ID. Privy does not include `telegramUserId` in the JWT claims; it would require a separate `privy.getUser(userId)` API call to retrieve the linked Telegram account from Privy's records.

Comment in source confirms this: `"We trust client-supplied telegramUserId here; Privy's SDK only exposes user.telegram to its owner so the worst-case impersonation requires compromising the Privy session itself."` — `server/index.js:512`

This is accurate for the legitimate client flow, but it assumes the client's code is unmodified. A custom HTTP client with a valid Privy JWT can supply any `telegramUserId`.

### 5. DB-Level Wallet Binding (`users.js`)

`linkTelegramIdentity` uses a priority-chain upsert:
1. Find by `telegramUserId` — if found, augment with wallet (only if `!existingByTg.walletAddress`)
2. Find by `walletAddress` — if found, stamp `telegramUserId`
3. Find by `uid` (browser session) — if found, augment
4. Create new User

The critical rule is `if (walletAddress && !existingByTg.walletAddress)` at line 91. Once a `walletAddress` is attached to a `telegramUserId`-keyed document, it is **never updated**. There is no code path to replace `walletAddress` on an existing bound document. If Privy re-provisions the user's embedded wallet (which generates a new Solana keypair), the new pubkey:
- Will find the existing TG-keyed doc
- Will fail the `!existingByTg.walletAddress` check
- Will be silently discarded with no error
- Settlement will target the old (now-inaccessible) address

This is the root cause of the project memory note: "Privy wallet rotation issue surfaced today (DB wallet ≠ on-chain wallet on some accounts)."

### 6. Client-Side Transaction Validation (`validateEscrowTransaction`)

`WalletContext.js:79-110` implements a pre-signing guard:
- Checks instruction `programId` against `ALLOWED_ESCROW_PROGRAM_IDS` (v1 + v2 IDs)
- Verifies first 8 bytes of instruction data match `DEPOSIT_WAGER_DISCRIMINATOR`
- Allows `ComputeBudget111...` program through
- Returns `{ valid: false, reason }` on any unknown program

**Bypass**: `ALLOWED_ESCROW_PROGRAM_IDS = [ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID].filter(Boolean)`. If both env vars are unset, this array is empty, and the guard returns `{ valid: true }` without any checks (line 80-82). This is explicitly documented as "Dev mode — no program ID configured."

This guard does NOT validate: wager amount, match ID, or recipient accounts within the valid instruction. A correct-discriminator TX with wrong lamport amount would pass.

### 7. Auth-Reset-on-Reconnect (iOS Safari Fix)

`WalletContext.js:724-772` — Added in commit `8eefcca` (referenced in project memory). On `socket.disconnect`, `setIsAuthenticated(false)` and `authAttemptedRef.current = false`. On `socket.connect`, resets `authAttemptedRef`. This triggers re-auth on reconnect, addressing the session-killing race on iOS Safari tab-backgrounding.

The `authAttemptedRef` is reset in a `useEffect` with deps `[connected, publicKey]` (line 703-707). This means if the Privy wallet address changes (new `publicKey` value), a new auth attempt is triggered. However, `autoBindAttempted` (the TG re-bind flag, line 422) is NOT reset on wallet change — so the TG identity bind does not re-fire after wallet rotation.

---

## Trust Model

The system has three layers of trust for wallet ownership:
1. **Privy session** (strongest): user authenticated via email OTP or Telegram OAuth; Privy manages the embedded wallet key
2. **Wallet signature** (strong for on-chain identity): `nacl.sign.detached.verify` on the auth challenge proves ownership of the private key
3. **Socket state** (`client.isAuthenticated = true`): set after signature verification; gates all wagered match participation

The TG identity bind adds a fourth layer:
4. **TG user identity**: established either via (a) HMAC-verified Telegram initData in the TG Mini App path, or (b) magic-link token DM'd to the TG account, or (c) Privy JWT with client-supplied TG ID (weakest — not independently verified against Privy's records)

Path (c) is the current vulnerability: the Privy JWT proves "this is an authenticated Privy user" but does NOT prove "the `telegramUserId` in this request belongs to this Privy user." The attacker's capability requirement is only: (1) have a valid Privy account, (2) know the victim's Telegram user ID (publicly discoverable or enumerable).

---

## State Analysis

### Client-Side State
- `isAuthenticated` (boolean): set after successful `authResult`; reset on socket disconnect
- `walletAddress` (string|null): derived from Privy wallet pubkey; source of truth
- `walletHandle` (object): `{ handle, locked, telegramUserId }` — server-canonical
- `autoBindAttempted` (boolean): prevents TG re-bind; NOT reset on wallet change
- `linkTokenAttempted` (boolean): prevents magic-link replay; reset per page load
- `isFreshSignIn` (boolean): triggers "welcome" UI on first login

### Server-Side State (socket)
- `client.walletAddress`: set by `handleAuthenticate` after signature verification
- `client.isAuthenticated`: boolean, set after signature verification
- `client.telegramUser`: set by `telegramSocketMiddleware` (from initData) OR backfilled from wallet→User→telegramUserId lookup

### Database State (MongoDB `User` collection)
- `walletAddress`: sparse unique, set once, never updated
- `telegramUserId`: sparse unique, used as primary TG-keyed lookup
- `handle`: canonical display name; overwritten by `linkTelegramIdentity` when TG username present
- No `privyUserId` field: Privy DIDs are not persisted; there is no way to correlate a Privy DID to a User document server-side

---

## Dependencies (External APIs, Packages, Services)

- **`@privy-io/react-auth@3.23.1`** — Privy React SDK; client bundle; version pinned in package.json (need to verify if `^` or exact)
- **`@privy-io/server-auth`** — Server-side JWT verification; `PrivyClient.verifyAuthToken()`
- **`@solana/web3.js`** — Connection, Transaction, PublicKey used client-side for broadcast and key parsing
- **`@solana/spl-token`** — `createBurnInstruction`, `getAssociatedTokenAddress` used in `signAndBurnShot`
- **`tweetnacl`** — Server-side signature verification (nacl.sign.detached.verify)
- **`jsonwebtoken`** — Server-side JWT generation (currently dead — token generated but never consumed)
- **Privy infrastructure**: `auth.privy.io`, `*.privy.io`, `*.privy.systems` — iframe storage, signing channel, OAuth endpoints

---

## Focus-Specific Analysis

### wallet_rotation_root_cause

The "DB wallet ≠ on-chain wallet on some accounts" issue from project memory has a clear root cause:

`users.js:91`: `if (walletAddress && !existingByTg.walletAddress)` — the wallet attachment is guarded by "only if the document has no wallet yet." This is correct for preventing overwrite of a legitimate binding, but makes it impossible for a wallet address to ever change once set.

When Privy re-provisions an embedded wallet (reasons include: user explicitly requests key rotation, Privy SDK upgrade changes key derivation, or a server-side provisioning event), the new Solana pubkey is a completely different base58 string. From `linkTelegramIdentity`'s perspective, the new address is a "conflict" that cannot be resolved — the existing doc has `walletAddress: <old_pubkey>`, and the new pubkey would be set on a different doc (or not set at all if the conflict check rejects it).

The system comment at `users.js:68-73` says "Wallet addresses can rotate (Dynamic can re-provision)" — acknowledging this was a known issue from the Dynamic era. The Privy equivalent rotation scenario is now equally possible.

**Impact on settlement**: `lifecycle.js:855` calls `settleMatchEscrowV2(match.matchId, winnerPlayer.walletAddress)` using the wallet address from the User doc. If the User doc has the old (rotated) wallet address, the settlement instruction specifies the old address as the recipient. The funds may go to an address the user no longer controls.

### window_solwallet_removal

The prior high-risk finding H031/H088 (`window.solWallet` exposing `signAndSendEscrowDeposit` to Phaser) appears to have been remediated:
- `BattleScreen.js:120` comment: "CS-04: Use context hook instead of window.solWallet"
- `LobbyScreen.js:321` comment: "CS-04: Use context hook instead of window.solWallet"
- No `window.solWallet` assignment found in `client/src/` files

`window.socket` remains (non-enumerable), but the higher-risk signing path is no longer globally accessible. This is a positive change.

### privy_iframe_security_csp

The client CSP in `index.html:7` includes `frame-src https://*.privy.io` — this wildcard allows any subdomain of `privy.io` to render in a frame. Privy's legitimate signing/OAuth flows use subdomains like `auth.privy.io`, `embedded.privy.io`, etc. The wildcard is necessary for the SDK to function but does extend the attack surface.

`connect-src` includes `https://*.privy.io wss://*.privy.io https://*.privy.systems wss://*.privy.systems https://*.rpc.privy.systems` — Privy's RPC substrate domains.

The server-side CSP in `server/index.js:138-175` does NOT include any Privy-related origins. This is correct — the server-side CSP is for the API server, not the client SPA. However, the server CSP still has:
- `connectSrc: "https://app.dynamic.xyz", "https://api.dynamic.xyz"` (lines 163-164) — dead code from the Dynamic era
- `frameSrc: "https://app.dynamic.xyz"` (line 168) — dead code

The Vercel-deployed client has NO security headers beyond cache-control (`vercel.json` analyzed). The `<meta http-equiv="Content-Security-Policy">` in `index.html` is delivered by Vercel's CDN but:
1. Cannot include `frame-ancestors` (CSP in `<meta>` tags cannot use `frame-ancestors` — this directive requires an HTTP header per spec)
2. Uses `'unsafe-inline'` in `script-src` — weakens XSS protection significantly

### debug_auth_overlay_exposure

`DebugAuthOverlay.js` is activated by `?debug=1` in the URL or `localStorage.solshot_debug=1`. It renders `walletAddress`, `isAuthenticated`, `connected`, `balance`, and `source`. This is a debug-only component but:
- The activation flag is persisted to localStorage (index.html inline script, line 56-58)
- Any user who navigates to `solshot.gg?debug=1` will have the overlay enabled on all subsequent page loads
- The overlay shows a truncated wallet address (first 6 + last 4 chars) — this is low-risk but worth noting

### telegram_webview_context

The `telegram-web-app.js` global shim was removed (per comment in `index.html:13-20`). The codebase now uses `window.Telegram?.WebApp` with optional chaining everywhere. `TelegramContext.js` is not analyzed in full here but is listed as a MEDIUM risk file. The project memory notes: "Privy auth in TG WebView reportedly different from standalone Safari" — the optional-chain fallbacks should handle this, but the reconnect reset logic in `WalletContext.js` was specifically added to address a TG WebView iPad session issue, suggesting this surface still has active edge cases.

### auth_nonce_gap

`verifyAuthMessage` at `auth.js:75-88`:
```
expected = `SolShot Auth: ${walletAddress} at ${timestamp}`
age = Date.now() - timestamp
if (age > AUTH_TIMEOUT || age < -60000) reject
```

No nonce. The message format is deterministic given (walletAddress, timestamp). Two attack vectors:
1. **Replay**: capture the `authenticate` socket event (e.g., via network observer in TG WebView, or compromised WebSocket proxy), replay within 5 minutes to a fresh socket → instant authentication as that wallet
2. **MITM construction**: if an attacker knows the wallet address (public info) and the target's current timestamp, they can construct the exact message without capturing it — but they still need the signature, which requires the private key. So replay is the realistic vector, not forgery.

---

## Cross-Focus Intersections

- **CHAIN-01 (TX Construction)**: `validateEscrowTransaction()` is a client-side guard. The server-side `escrowDepositConfirm` handler in `main.js` does not verify TX instructions server-side before marking the deposit as confirmed. This is documented in the INDEX as `main.js:5 — Risk: Stale TX replay, missing signature validation, wrong amount claim.`
- **AUTH-01 (Authentication)**: The dead JWT (H029) and the 5-minute replay window (C-6/H030) are both in `auth.js` which is tagged RECHECK. This CHAIN-03 analysis confirms neither has been remediated.
- **ERR-02 (Race Conditions)**: The `autoBindAttempted` state reset is a concurrency concern — React StrictMode in dev double-invokes effects; the flag prevents the second invocation but it's state not a ref, so both effects could read `false` before the first sets it to `true`.
- **DATA-04 (Logging)**: `privyAuth.js:43` logs `'[privyAuth] Initialized — JWT verification enabled'` at module load. No sensitive data logged, but the log confirms Privy config status to anyone with server log access.

---

## Risk Observations (Full)

### C-01: Client-Supplied `telegramUserId` on Privy-Direct Bind Endpoint (CRITICAL)
- **File**: `server/index.js:502-519`
- **Detail**: `/api/wallet/link-from-privy-telegram` accepts `{ telegramUserId, telegramUsername, walletAddress }` from `req.body`. `requirePrivyAuth({ required: true })` verifies the Privy JWT and sets `req.privyUserId` (Privy DID). But `telegramUserId` from the body is passed directly to `linkTelegramIdentity` without any cross-check against the Privy user's actual linked Telegram account. The server code comment confirms: "We trust client-supplied telegramUserId here."
- **Attack**: Attacker creates a Privy account (requires email or Telegram), obtains a Privy access token, then POSTs `{ telegramUserId: <victim_tg_id>, walletAddress: <attacker_wallet> }`. If the victim has no wallet binding yet, this stamps the attacker's wallet onto the victim's TG identity. Future group-chat wagered match wins by the victim are settled to the attacker's wallet.
- **Preconditions**: Attacker needs (1) valid Privy session, (2) victim's Telegram user ID (numeric, publicly derivable from @username via Telegram API)
- **Mitigation path**: Server should call `privy.getUser(req.privyUserId)` and read the linked Telegram account from Privy's records, then compare against the client-supplied `telegramUserId`

### C-02: Wallet Rotation Produces Permanent DB/On-Chain Mismatch (CRITICAL)
- **File**: `server/services/users.js:91`
- **Detail**: `if (walletAddress && !existingByTg.walletAddress)` prevents the wallet from ever being updated once set. Privy embedded wallet provisioning can result in a new Solana pubkey.
- **Impact**: Settlement (`lifecycle.js:855` via `settleMatchEscrowV2`) sends funds to the stale wallet address. User loses wagered funds they won.
- **Mitigation path**: Add an explicit wallet rotation mechanism: if the existing wallet address fails a signature check (or is presented as "old address" alongside a "new address" signed by both), allow the update. Alternatively, accept and store multiple wallet addresses per User document, using the most recently authenticated one for settlement.

### H-01: Signature Replay — 5-Minute Window, No Nonce (HIGH)
- **File**: `server/middleware/auth.js:28,76-88`
- **Detail**: Auth message is deterministic (no nonce). Captured socket payload replayable for 5 minutes.
- **Unchanged from Feb audit finding C-6 / H030. Status: RECHECK (file modified).**

### H-02: Privy JWT Not Enforced on Magic-Link Bind (HIGH)
- **File**: `server/index.js:432`
- **Detail**: `requirePrivyAuth({ required: false })` — JWT failure is advisory. Magic-link token alone is sufficient.
- **Implication**: If `PRIVY_APP_SECRET` is not set on Render (dev mode or misconfigured production), JWT verification is entirely disabled, leaving only the 32-byte CSPRNG token as protection.

### H-03: Server CSP References Dead Dynamic Origins in `frameSrc` and `connectSrc` (HIGH)
- **File**: `server/index.js:163-168`
- **Detail**: `https://app.dynamic.xyz` and `https://api.dynamic.xyz` remain in helmet's `connectSrc` and `frameSrc`. Dynamic is no longer used; these origins should be removed to reduce attack surface.

### H-04: Vercel Client Deployment Has No Security Headers (HIGH)
- **File**: `client/vercel.json`
- **Detail**: No `X-Frame-Options`, no HTTP-header CSP, no `X-Content-Type-Options`, no `Strict-Transport-Security`. The only CSP is the `<meta>` tag in `index.html`, which does not support `frame-ancestors` and uses `'unsafe-inline'` in `script-src`.

### M-01: `autoBindAttempted` Never Resets on Wallet Change (MEDIUM)
- **File**: `client/src/wallet/WalletContext.js:422`
- **Detail**: If wallet address changes mid-session (rotation), TG re-bind does not fire.

### M-02: `confirmTransaction('confirmed')` for Financial Paths (MEDIUM)
- **File**: `client/src/wallet/WalletContext.js:584,624,654`
- **Detail**: Used for escrow deposits and SHOT burns. `'confirmed'` is not finalized. For devnet this is low-risk, but the pattern will cause issues on mainnet.

### M-03: `signAndBurnShot` Has No Pre-Signing Instruction Validation (MEDIUM)
- **File**: `client/src/wallet/WalletContext.js:638-660`
- **Detail**: Burn TX bypasses `validateEscrowTransaction`. No guard on the SPL instruction before signing.

### M-04: `window.socket` Accessible Despite Non-Enumerable Flag (MEDIUM)
- **File**: `client/src/App.js:57-62`
- **Detail**: `enumerable: false` does not block `window.socket.emit(...)` from XSS payloads.

### L-01: PRIVY_APP_ID Hardcoded in Server Source Comment (LOW)
- **File**: `server/services/privyAuth.js:21`

### L-02: Privy `showWalletUIs: false` on Auth Signing (LOW)
- **File**: `client/src/wallet/WalletContext.js:499-505`
- **Detail**: User never sees a confirmation for the wallet ownership proof. Acceptable UX trade-off but technically signs silently.

---

## Novel Attack Surface Observations

1. **TG ID Enumeration → Wallet Takeover**: Telegram user IDs for users with public @usernames can be resolved via `https://t.me/@username` or bot `getChatMember` API calls. Combined with C-01 above, an attacker who enumerates a victim's Telegram user ID can redirect that user's future wagered match winnings.

2. **Privy Re-Provision as DoS**: If Privy re-provisions a user's embedded wallet (which the user may not control and may not notice), the user's `walletAddress` in the DB becomes permanently invalid. Any future escrow settlement silently sends funds to an address the user no longer controls. This could be triggered by a Privy SDK upgrade or Privy's backend key management operations, with no in-app warning to the user.

3. **Dead JWT Generator in Auth Flow**: `generateToken(walletAddress)` in `auth.js:96-102` generates a JWT and returns it in `authResult`. The client receives this token but does nothing with it (there's no mechanism to use it). This means the JWT infrastructure exists in the codebase, is tested during auth, but provides zero security benefit. If a future developer assumes the JWT is being used as a bearer token and routes around the socket-state check, they'd be trusting an unforgeable but also unvalidated token.

---

## Questions for Other Focus Areas

1. **For AUTH-01**: Is `verifyToken` still dead code (removed per `auth.js:104` comment)? If so, the JWT in `authResult` is pure dead weight. If not, where is it consumed?
2. **For CHAIN-01**: Does `escrowDepositConfirm` handler in `main.js` verify the TX on-chain (fetch PDA state, check deposit recorded) or does it trust the client's claim that the signature confirmed?
3. **For ERR-02**: Are there concurrent `linkTelegramIdentity` calls possible? The function does multiple `findOne` / `findOneAndUpdate` operations without a transaction. If two requests arrive simultaneously for the same `telegramUserId`, is there a race on the `walletAddress` attachment logic?
4. **For DATA-04**: Does any log statement in `privyAuth.js`, `users.js`, or `main.js` emit full Privy JWT claims (userId, sessionId) which could appear in Render's log stream?

---

## Raw Notes

- `WalletContext.js` comment at line 8-18 documents the "Privy RPC unreliable" rationale clearly — this is the reason the app broadcasts via its own Connection rather than `useSignAndSendTransaction`. This is not a vulnerability per se but means Privy's hosted RPC cannot act as an additional security layer (e.g., checking account state before broadcasting).
- `PRIVY_SOLANA_CHAIN` constant at line 49 — important detail that Privy defaults to mainnet signing if `chain` is not explicitly passed. The code correctly passes `PRIVY_SOLANA_CHAIN` in `sendTransactionUnified`. If a developer removes this argument in a future refactor, transactions would be signed for the wrong chain.
- `recoveryStatus` at `WalletContext.js:825-836` — a thoughtful feature that detects single-recovery-method users and prompts them to add a backup. This is good UX for key safety.
- `walletHandle.telegramUserId` in the context value — this is the TG ID as resolved by the server from the User doc. This is the authoritative source for TG-keyed operations in group-match flows, replacing the now-removed `window.Telegram.WebApp.initDataUnsafe.user.id` path. The server backfills `client.telegramUser` from the User doc lookup after wallet auth (`main.js:1298-1303`) — this is the critical linkage for group-chat fire validation.
- The `consumeLinkToken` function deletes the token BEFORE checking expiry (`store.delete(token)` at line 79, then `if (entry.expiresAt < Date.now()) return null` at line 81). This is intentional single-use semantics — even an expired token attempt burns the token, preventing timing attacks. This is correct design.

---

**One-line summary**: The Privy direct-bind endpoint trusts client-supplied `telegramUserId` without cross-checking Privy's records, enabling any authenticated user to redirect victim settlement funds; the `User.walletAddress` never-update policy is the confirmed root cause of the wallet rotation issue from project memory.
