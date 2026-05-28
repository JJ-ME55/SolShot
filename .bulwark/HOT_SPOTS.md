# Hot-Spots Map — SolShot Off-Chain

Generated 2026-05-28 (DB audit #3).

## Summary
- Files scanned: `server/` + `client/src/` only (excluded `node_modules/`, `target/`, `dist/`, `build/`, `.bulwark*/`, `.audit*/`, `_archive/`, `programs/`, `pool/`).
- Total HIGH-priority categories with matches: SEC, AUTH, CHAIN, API, BOT, ERR, LOGIC.
- Total MEDIUM-priority categories with matches: WEB, DATA, FE, INFRA, DEP, CRYPTO.
- INJ category came back largely empty — no `eval`, no `new Function`, no `child_process`, no Mongo `$where`, no `__proto__` reads. Only `new RegExp` exists, all on validated/sanitized inputs.
- Stand-out files: `server/socket-io/main.js` (5,198 lines, dominates almost every category), `server/index.js` (1,407 lines, Express routes + helmet/cors config), `server/services/bot.js` (1,202 lines), `server/services/escrow-v2.js` (640 lines), `server/services/escrow.js` (603 lines).

---

## Per-Category Hot Files

### SEC — Secrets & Credentials

#### `process.env.*` reads (sorted by hotness)

| File | Count | Notable env vars read |
|---|---|---|
| `server/scripts/init-config-mainnet.mjs` | 9 | `ESCROW_PROGRAM_ID_V2`, `SOLANA_RPC`, `SOLANA_KEYPAIR_PATH`, `SQUADS_AUTHORITY_PDA`, `SQUADS_TREASURY_PDA`, `SQUADS_OPS_PDA`, `FEE_BPS_TREASURY`, `FEE_BPS_OPS`, `INIT_MAINNET_CONFIRM` |
| `server/index.js` | 10 | `PORT`, `CORS_ORIGINS`, `NODE_ENV`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `MONGODB_URI`, `DISABLE_KEEPALIVE`, `SERVER_BASE_URL` |
| `server/services/bot.js` | 7 | `MINI_APP_URL`, `SERVER_BASE_URL`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `NODE_ENV`, `ADMIN_TELEGRAM_IDS`, `TELEGRAM_WEBHOOK_SECRET` |
| `server/services/escrow-v2.js` | 2 | `ESCROW_PROGRAM_ID_V2`, `SOLANA_RPC` |
| `server/services/escrow.js` | 3 | `SOLANA_RPC`, `TREASURY_WALLET`, `OPS_WALLET` |
| `server/services/keys.js` | 4 | `SOLANA_KEYPAIR_JSON`, `SOLANA_KEYPAIR_PATH`, `HOME`, `USERPROFILE` |
| `server/services/privyAuth.js` | 3 | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NODE_ENV` |
| `server/middleware/auth.js` | 2 | `JWT_SECRET`, `NODE_ENV` |
| `server/middleware/guards.js` | 1 | `ADMIN_API_KEY` |
| `server/services/arcadeBot.js` | 3 | `ARCADE_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, `ARCADE_WEBHOOK_SECRET` |
| `server/services/arcadeSession.js` | 2 | `ARCADE_SESSION_SECRET`, `NODE_ENV` |
| `server/services/games/basketball-standalone/standaloneLeaderboard.js` | 4 | `BASKETBALL_LEADERBOARD_SECRET`, `NODE_ENV`, `_BASKETBALL_DEV_SECRET_WARNED`, `_BASKETBALL_DEV_SECRET` |
| `server/services/games/keepie-uppies-standalone/standaloneLeaderboard.js` | 4 | `KEEPIE_UPPIES_LEADERBOARD_SECRET`, `NODE_ENV`, `_KEEPIEUPPIES_DEV_SECRET_WARNED`, `_KEEPIEUPPIES_DEV_SECRET` |
| `server/services/games/free-kicks-standalone/standaloneLeaderboard.js` | 4 | `FREE_KICKS_LEADERBOARD_SECRET`, `NODE_ENV`, `_FREEKICKS_DEV_SECRET_WARNED`, `_FREEKICKS_DEV_SECRET` |
| `server/services/solana.js` | 3 | `SOLANA_RPC`, `TREASURY_WALLET`, `OPS_WALLET` |
| `client/src/wallet/WalletContext.js` | 6 | `REACT_APP_SOLANA_NETWORK`, `REACT_APP_SOLANA_RPC`, `REACT_APP_PRIVY_APP_ID`, `REACT_APP_ESCROW_PROGRAM_ID`, `REACT_APP_ESCROW_V2_PROGRAM_ID`, `REACT_APP_SERVER_URL` |
| `server/scripts/reconcile-wallets.mjs` | 3 | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `MONGODB_URI` |
| `server/scripts/accept-authority-v2.mjs` | 3 | `NEW_AUTHORITY_KEYPAIR`, `HOME`, `USERPROFILE`, `SOLANA_RPC` |

Sample line (highest-stakes):
- `server/services/keys.js:33-34` — `const keypairJson = process.env.SOLANA_KEYPAIR_JSON; ... const keypairPath = process.env.SOLANA_KEYPAIR_PATH;` (server authority secret-key resolution)
- `server/middleware/auth.js:19-27` — `const JWT_SECRET = process.env.JWT_SECRET || (() => { if (NODE_ENV==='production') process.exit(1); ... crypto.randomBytes(32) })` — H007 hardened, fails closed in prod, dev random fallback.

#### `Bearer ` hardcoded tokens (should be zero)

| File | Line | Context |
|---|---|---|
| `client/src/wallet/WalletContext.js` | 454 | `// POSTs to /api/wallet/link-from-privy-telegram with Bearer JWT.` — comment only, no hardcoded token.

**Verdict: zero hardcoded bearer tokens. Clean.**

#### Sensitive `console.log` patterns

Searched for `console\.log.*\b(token|secret|key|password|wallet)\b` (case-insensitive). Most matches are partial-truncation logs that slice 8 chars; a few full-wallet logs in admin/dev-only scripts.

| File | Line | Severity |
|---|---|---|
| `server/services/users.js` | 93, 95, 187, 193, 254 | LOW — truncated `wallet.slice(0, 8)` only |
| `server/scripts/get-wallet.mjs` | 34 | LOW — admin script prints full wallet |
| `server/scripts/list-wallet-links.mjs` | 46, 57 | LOW — admin script prints full wallet |
| `server/scripts/find-user.mjs` | 38 | LOW — admin script prints full wallet |
| `server/scripts/find-privy-owner.mjs` | 103, 119 | LOW — admin script truncates with slice |
| `server/scripts/wipe-user.mjs` | 53 | LOW — dry-run preview, prints full wallet |
| `server/scripts/check-playtest-balances.mjs` | 56 | LOW — dev-only, no secret |
| `client/src/wallet/WalletContext.js` | 347 | LOW — logs `body.telegramUserId` only, no token |

**Verdict: no token/secret/private-key/password values appear in `console.log`. Wallet addresses are public on-chain so logging them is acceptable.**

#### Browser secret storage

- `localStorage` / `sessionStorage` searches for keys named `token|secret|key|signature|jwt|auth` returned **zero matches**.
- Browser storage is only used for non-secret UX state: `solshot_handle`, `solshot_uid`, `solshot_escrow_seen`, `solshot_prestige_intro_seen`, etc. No JWT or signature is stored client-side. Privy SDK handles its own session storage internally.
- One callout: `client/src/hooks/useArcadeTokenReceiver.js:47` writes a localStorage entry as part of the arcade handoff — needs follow-up check to confirm it isn't persisting the JWT itself.

---

### AUTH — Authentication

#### Privy / JWT verification sites

| File | Lines | Notes |
|---|---|---|
| `server/services/privyAuth.js` | 84 (`requirePrivyAuth`), 124 (`client.verifyAuthToken`), 173 (`verifyPrivyToken`), 198 (`isPrivyAuthConfigured`) | Single source of truth. H002 fix at line 89-104: refuses requests with 503 in prod if Privy is not configured; dev passes through with warn. Bug 4 diagnostic dump at line 134-150 — logs token aud/iss/exp on verify failure. |
| `server/index.js` | 36 (import), 582, 651, 738, 868, 923 (uses) | All wallet-link, arcade-session, and wager-waitlist endpoints gated via `requirePrivyAuth({ required: true })`; magic-link uses `required: false`. |
| `server/middleware/auth.js` | 15 (`import jwt`), 97 (`jwt.sign`), 19 (`JWT_SECRET`) | Wallet-signature path. H007 fix removes hardcoded JWT secret fallback. |
| `server/services/arcadeSession.js` | 36, 81 (`jwt.sign`), 100 (`jwt.verify`) | 10-min TTL HS256 handoff JWT. Algorithm pinned via `algorithms: [ALG]` on verify — `none`-alg attack mitigated. |
| `server/services/games/basketball-standalone/standaloneLeaderboard.js` | 81 (sign), 98 (verify) | Per-game JWT issuer. |
| `server/services/games/keepie-uppies-standalone/standaloneLeaderboard.js` | 64 (sign), 75 (verify) | Per-game JWT issuer. |
| `server/services/games/free-kicks-standalone/standaloneLeaderboard.js` | 56 (sign), 67 (verify) | Per-game JWT issuer. |

#### `requireAuth` (socket-gate) call sites

| File | Line | Event being gated |
|---|---|---|
| `server/middleware/guards.js` | 50 | `requireAuth` definition |
| `server/socket-io/main.js` | 789 | wrapper helper |
| `server/socket-io/main.js` | 2329 | `joinRoom` |
| `server/socket-io/main.js` | 2585 | `createChallengeRoom` (if wager>0) |
| `server/socket-io/main.js` | 2741 | `createRoom` (if wager>0) |
| `server/socket-io/main.js` | 3001 | `joinQueue` (if wager>0) |
| `server/socket-io/main.js` | 3723 | `acceptChallenge` |
| `server/socket-io/main.js` | 3740 | `declineChallenge` |
| `server/socket-io/main.js` | 3842 | `shoot` |
| `server/socket-io/main.js` | 3874 | `escrowDepositConfirm` |
| `server/socket-io/main.js` | 3999 | `escrowPartialStart` |
| `server/socket-io/main.js` | 4079 | `escrowCancelAll` |

**Gap candidates** (handlers below NOT gated — verify each is intentional):
- `setWalletHandle`, `registerIdentity`, `attributeReferrer`, `getInviteLink`, `disconnect`, `leaveRoom`, `rejoinRoom` (currently disabled), `deleteRoom`, `getRooms`, `joinRoom` (gated only for wager>0 path), `joinChallenge`, `createAIMatch`, `leaveQueue`, `ready`, `buyWeapon`, `buyConsumable`, `shopDone`, `getShotInfo`, `buyCosmetic`, `equipCosmetic`, `getCosmetics`, `getStats`, `getLeaderboard`, `challengeCallsign`, `prestigeBurn`, `weaponPick`, `getWeaponArray`, `createWeaponArray`, `fire` (wraps in safeHandler not requireAuth), `requestTerrain`, `weaponChange`, `angleChange`, `powerChange`, `positionUpdate`, `stepLeft`, `stepRight`, `giveTurn`, `requestTurn`, `playAgainRequest`, `getShotPrice`, `clientDebugLog`, `authenticate`.
- Most of these read `authenticatedWallets[client.id]` and gracefully fall back to `null` for non-authed sockets — verify each gracefully refuses wager-touching operations.
- `prestigeBurn` is the highest-stakes ungated socket event: it must reach the on-chain SHOT burn verifier before granting prestige.

#### Express route inventory (server/index.js)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | none | root |
| GET | `/health` | none | health check |
| GET | `/stats` | `requireAdminKey` | financial metrics — IM-02 fix |
| POST | `/api/admin/reload-keys` | `requireAdminKey` | hot-reload keypairs |
| POST | `/api/admin/truncate-handles` | `requireAdminKey` | DB mutation |
| GET | `/api/admin/funnel` | `requireAdminKey` | aggregate read |
| POST | `/api/csp-report` | none | csp report receiver |
| POST | `/api/feedback` | `feedbackLimiter` | rate-limited only |
| POST | `/api/challenge` | none | creates challenge code |
| GET | `/api/challenge/:code` | none | challenge details |
| GET | `/api/challenge/:code/card.png` | none | image render |
| GET | `/api/stats/:tgUserId/card.png` | none | image render |
| POST | `/api/challenge/:code/cancel` | none | cancels challenge |
| POST | `/api/wallet/link-from-tg-token` | `requirePrivyAuth({ required: false })` | magic-link wallet bind |
| POST | (line 649) | `requirePrivyAuth({ required: true })` | wallet-link Privy |
| POST | (line 736) | `requirePrivyAuth({ required: true })` | arcade-session handoff mint |
| POST | `/api/arcade/session-validate` | none | reads + verifies handoff JWT; no Privy gate (token is the auth) |
| POST | `/api/wager-waitlist` | none | waitlist signup |
| POST | (line 866) | `requirePrivyAuth({ required: true })` | additional Privy-gated |
| POST | (line 921) | `requirePrivyAuth({ required: true })` | additional Privy-gated |
| POST | `/api/games/basketball/score` | inline JWT verify | per-game leaderboard secret |
| GET | `/api/games/basketball/leaderboard` | none | public read |
| GET | `/api/games/basketball/standing/:telegramUserId` | none | public read |
| POST | `/api/games/keepieuppies/score` | inline JWT verify | per-game secret |
| GET | `/api/games/keepieuppies/leaderboard` | none | public read |
| GET | `/api/games/keepieuppies/standing/:telegramUserId` | none | public read |
| POST | `/api/games/freekicks/score` | inline JWT verify | per-game secret |
| GET | `/api/games/freekicks/leaderboard` | none | public read |
| GET | `/api/games/freekicks/standing/:telegramUserId` | none | public read |
| GET | `/api/games/leaderboard` | none | cross-game aggregator |
| GET | `/api/games/standing/:telegramUserId` | none | aggregate read |

**Verdict: write paths to admin & wallet-link are guarded. Challenge endpoints (challenge create/cancel + image render) and feedback are public — needs verification that abuse vectors are bounded (rate-limit, cost-per-call, etc.).**

---

### INJ — Injection (HIGH)

#### `new RegExp(…)` from user-controlled input

| File | Line | Source of pattern | Risk |
|---|---|---|---|
| `server/socket-io/main.js` | 123 | hardcoded `PROFANITY_WORDS.join(...)` | LOW — static list |
| `server/middleware/guards.js` | 144 | hardcoded `_PROF.join(...)` | LOW — static list |
| `client/src/utils/profanity.js` | 77 | hardcoded | LOW — static list |
| `server/scripts/find-privy-owner.mjs` | 131 | `process.argv[2]` value | LOW — admin script, sysadmin-only |
| `server/scripts/get-wallet.mjs` | 22 | `process.argv[2]` value | LOW — admin script |
| `server/scripts/find-user.mjs` | 21 | `process.argv[2]` value | LOW — admin script |
| `server/scripts/wipe-user.mjs` | 35, 36 | `process.argv[2]` value | LOW — admin script, BUT ReDoS possible if invoked by someone supplying `(.+?)` patterns (admin-only) |

**Verdict: no user-input regex compilation in the request path. Admin script regex compilation is acceptable but a malformed pattern would cause ReDoS or pattern syntax errors — admin-only blast radius.**

#### `eval`, `new Function`, `child_process`, `$where`, `__proto__`

**ZERO matches** across the codebase for any of these. Clean.

---

### WEB — Headers, CORS, CSRF

| File | Line | Pattern |
|---|---|---|
| `server/index.js` | 9, 196 | `import helmet` + `app.use(helmet({...}))` |
| `server/index.js` | 121, 235 | `CORS_ORIGINS` env split into allowlist + `app.use(cors({ origin: CORS_ORIGINS }))` |
| `server/index.js` | 238 | `httpLimiter = rateLimit(...)` (global rate limiter) |
| `server/index.js` | 366 | `feedbackLimiter = rateLimit(...)` (feedback-specific) |
| `server/socket-io/main.js` | 1433 | `H074: Per-socket rate limiter using ring buffers` |

- No `Access-Control-Allow-Origin: *` overrides anywhere — CORS allowlist is canonical.
- No `.cookie(...)` calls anywhere — server is stateless (JWT only, no session cookies).
- No `frameguard`/`noSniff`/`hsts` separate invocations — relying on helmet defaults.

---

### CHAIN — Solana / blockchain

#### Keypair handling

| File | Line | Pattern |
|---|---|---|
| `server/services/keys.js` | 27, 52 | `Keypair.fromSecretKey(bytes)` — escrow service authority |
| `server/scripts/accept-authority-v2.mjs` | 36 | `Keypair.fromSecretKey(Uint8Array.from(raw))` — Squads multisig acceptance flow |
| **NO** `Keypair.generate()` calls — server never generates ephemeral keypairs. |

#### Signing / TX dispatch

| File | Line | Pattern |
|---|---|---|
| `client/src/wallet/WalletContext.js` | 193-194 | `usePrivySignMessage`, `usePrivySignTransaction` |
| `client/src/wallet/WalletContext.js` | 553 | `signMessageUnified` (auth message signing) |
| `client/src/wallet/WalletContext.js` | 574 | `tx.serialize({ requireAllSignatures: false, verifySignatures: false })` — client sends partial-signed TX, server adds remaining signatures |
| `client/src/wallet/WalletContext.js` | 581 | `conn.sendRawTransaction(signResult.signedTransaction, ...)` |
| `server/socket-io/main.js` | 1577 | comment only (`signMessage` discussion) |
| `server/services/escrow.js` | 352 | `connection.getLatestBlockhash()` |
| `server/services/escrow.js` | 364 | `tx.serialize({ requireAllSignatures: false, verifySignatures: false })` — server builds + partial-signs |
| `server/services/escrow-v2.js` | 399 | `connection.getLatestBlockhash()` |
| `server/services/escrow-v2.js` | 406 | `tx.serialize({ requireAllSignatures: false, verifySignatures: false })` — server builds + partial-signs |

#### RPC client creation

| File | Line | RPC URL source |
|---|---|---|
| `client/src/wallet/WalletContext.js` | 212 | `new Connection(RPC_URL, 'confirmed')` — uses `REACT_APP_SOLANA_RPC` or `clusterApiUrl(NETWORK)` |
| `server/scripts/dump-escrow-state.mjs` | 32 | uses `SOLANA_RPC` env or devnet default |
| `server/scripts/check-playtest-balances.mjs` | 68 | uses `RPC` arg |
| `server/services/solana.js` | 104 | uses `SOLANA_RPC` |
| `server/scripts/accept-authority-v2.mjs` | 47 | uses `SOLANA_RPC` |
| `server/services/escrow-v2.js` | 74 | uses `SOLANA_RPC` |
| `server/services/escrow.js` | 73 | uses `SOLANA_RPC` |

#### Lamport math sites

13 sites across `server/socket-io/main.js`, `server/services/escrow.js`, `server/services/escrow-v2.js`, `server/services/solana.js`, `client/src/wallet/WalletContext.js`, `server/scripts/*`. All multiplications/divisions by `LAMPORTS_PER_SOL` use `Math.round(wagerSOL * LAMPORTS_PER_SOL)` for SOL→lamport conversion — correct integer-rounding pattern. Reverse direction uses `lamports / LAMPORTS_PER_SOL` for display.

**Notable conversion site:** `server/socket-io/main.js:3934-3935` — `const LAMPORTS_PER_SOL = 1_000_000_000; const expectedLamports = Math.round(ws.amount * LAMPORTS_PER_SOL)` inside the escrow-deposit confirmation handler. This redeclares the constant locally rather than importing from `@solana/web3.js`. Functionally identical but a small drift risk if the constant ever changes (it won't, but worth flagging).

#### `sendRawTransaction` / `sendAndConfirmTransaction`

- Only one site: `client/src/wallet/WalletContext.js:581` — `conn.sendRawTransaction(signResult.signedTransaction, ...)`.
- Server never calls `sendRawTransaction` directly. Escrow service uses Anchor's `program.methods.X().rpc()` which Anchor manages internally.

---

### API — Routing / WebSocket

#### Socket event handler inventory

**server/socket-io/main.js** (51 handlers identified):
- Lifecycle: `disconnect` (x2 - one inside auth scope, one above), `authenticate`, `clientDebugLog`, `setWalletHandle`, `registerIdentity`, `attributeReferrer`, `getInviteLink`
- Room: `leaveRoom`, `rejoinRoom` (disabled), `deleteRoom`, `joinRoom`, `getRooms`, `createChallengeRoom`, `joinChallenge`, `createRoom`, `createAIMatch`, `joinQueue`, `leaveQueue`, `ready`
- Shop: `buyWeapon`, `buyConsumable`, `shopDone`, `getShotInfo`, `buyCosmetic`, `equipCosmetic`, `getCosmetics`
- Stats: `getStats`, `getLeaderboard`
- Challenge: `challengeCallsign`, `acceptChallenge`, `declineChallenge`
- Economy: `prestigeBurn`
- Game state: `weaponPick`, `getWeaponArray`, `createWeaponArray`, `shoot`, `fire`, `requestTerrain`, `weaponChange`, `angleChange`, `powerChange`, `positionUpdate`, `stepLeft`, `stepRight`, `giveTurn`, `requestTurn`, `playAgainRequest`, `getShotPrice`
- Escrow: `escrowDepositConfirm`, `escrowPartialStart`, `escrowCancelAll`

**server/socket-io/groupchat.js** (9 handlers):
- `getGroupMatch`, `fireGroupShot`, `forfeitGroupMatch`, `purchaseGroupWeapon`, `groupShopComplete`, `getMyGroupMatches`, `requestGroupDepositTx`, `confirmGroupDeposit`

#### Broadcast surfaces (counts)

| File | `client.emit` | `io.emit` | `io.sockets.in(...).emit` |
|---|---|---|---|
| `server/middleware/guards.js` | 1 | 0 | 0 |
| `server/socket-io/main.js` | 115 | 2 | ~88 (combined with `io.to(...)` via head line 155 sample) |
| `server/socket-io/groupchat.js` | 49 | 0 | 0 |

`io.emit` only fires on `queueSnapshot` (line 446) + `setRooms` (line 655) — global state broadcasts.

Per-room broadcasts use `io.sockets.in(roomId).emit(...)` — auditor should verify no broadcasts include other players' wager amounts, wallet addresses, or signatures.

---

### DATA — Database & Logging

#### Mongo write-path operations (counts by file)

| File | Total `findOne/update/aggregate/delete` |
|---|---|
| `server/socket-io/main.js` | ~15 |
| `server/socket-io/groupchat.js` | ~10 |
| `server/services/groupchat/lifecycle.js` | ~9 |
| `server/services/groupchat/index.js` | ~6 |
| `server/services/users.js` | ~12 |
| `server/services/referrals.js` | ~7 |
| `server/services/challenge/challenge.js` | ~7 |
| `server/services/games/*-standalone/standaloneLeaderboard.js` | ~4 each |
| `server/index.js` | ~6 |

#### Mongo update operators

`$set`, `$push`, `$pull`, `$inc`, `$addToSet` used throughout — none constructed from user-supplied keys. `$where` (RCE risk) has **zero usages**.

#### Logging volume

`console.error(...)` matches across 30 files (163 occurrences). `logger.(error|warn|info)(...)` only in `server/socket-io/main.js` (4x), `server/services/solana.js` (4x), `server/services/escrow.js` (1x), `server/services/escrow-v2.js` (1x), `server/services/shot-token.js` (2x).

**Inconsistency**: most server-side logging uses raw `console.*` rather than the pino-based `logger`. Some sensitive paths (Privy auth failure) deliberately use `console.warn` to make diagnostic dumps visible (see `server/services/privyAuth.js:139-150`).

---

### FE — Frontend (MEDIUM)

| Pattern | Result |
|---|---|
| `dangerouslySetInnerHTML` | **ZERO matches** |
| `window.location.href = ...` | **ZERO matches** (only navigation via `window.location.replace` or React Router) |
| `fetch(...${...})` with URL interpolation | 3 sites: `server/index.js:1362` (keep-alive `${keepAliveUrl}/health`), `client/src/hooks/useArcadeTokenReceiver.js:35` (`${apiBase}/api/arcade/session-validate`), `client/src/components/FeedbackButton.js:110` (`${SERVER_URL}/api/feedback`) — all use env-controlled base URLs, not user input. |
| `localStorage`/`sessionStorage`/`document.cookie` | 45+ matches across client. Keys are all UX state (`solshot_handle`, `solshot_uid`, `solshot_escrow_seen`, `solshot_prestige_intro_seen`, `solshot_dapp_banner_dismissed`, `solshot_debug`, `solshotDebug`). **No JWT, no signature, no private key stored.** Privy SDK manages its own session storage. |

---

### INFRA — Configuration

#### `.env.example` files

- `server/.env.example` — documents PORT, NODE_ENV, CORS_ORIGINS, MONGODB_URI, SOLANA_RPC, SOLANA_KEYPAIR_PATH, SOLANA_KEYPAIR_JSON, MATCH_ESCROW_PROGRAM_ID (devnet only), TREASURY_WALLET, OPS_WALLET, JWT_SECRET (with placeholder `change-me-to-a-random-64-char-string`), JUP_API_KEY (with placeholder `your-jupiter-api-key-here`), TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET, MINI_APP_URL. Comment at line 24-27 notes `SHOT_TOKEN_MINT` is DEPRECATED.
- `client/.env.example` — REACT_APP_SERVER_URL, REACT_APP_SOLANA_NETWORK, REACT_APP_ESCROW_PROGRAM_ID, REACT_APP_ESCROW_V2_PROGRAM_ID, REACT_APP_PRIVY_APP_ID (commits the public devnet value `cmorbf1nk00z10cidg6jitsgm`), INLINE_RUNTIME_CHUNK=false.
- **No `.env.production` was found at repo root via the maxdepth-3 search** (the gitignore excludes `.env*` but `client/.env.production` actually exists — verify it isn't accidentally committed).

#### `.gitignore` audit

Comprehensive list at `.gitignore`:
- `.env` and `.env.{local,development.local,test.local,production.local}` excluded.
- `*-keypair.json` excluded (catches Anchor's `target/deploy/*-keypair.json`).
- Explicit operational keypairs excluded: `solshot-dev.json`, `solshot-server.json`, `solshot-server-authority.json`, `solshot-upgrade-authority.json`, `solshot-app-authority.json`, `solshot-treasury.json`, `solshot-ops.json`, `id.json`.
- Local agent / planning state excluded: `.agents/`, `.claude/`, `.planning/`, `.mcp.json`.

**Gap**: `.env.production` doesn't appear explicitly in gitignore (only `.env.production.local`). If `client/.env.production` exists on disk as a deployable artifact, verify it doesn't contain secrets, OR add `**/.env.production` to gitignore.

#### `render.yaml`

- 14 plain-text env vars (NODE_ENV, PORT, SOLANA_RPC, MATCH_ESCROW_PROGRAM_ID, SHOT_TOKEN_MINT, TREASURY_WALLET, OPS_WALLET, CORS_ORIGINS, PRIVY_APP_ID, MINI_APP_URL).
- 7 secrets `sync: false` (require manual Render dashboard input): SOLANA_KEYPAIR_JSON, ADMIN_API_KEY, MONGODB_URI, PRIVY_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
- 2 secrets `generateValue: true` (Render auto-generates): JWT_SECRET, ARCADE_SESSION_SECRET.
- **Possible drift**: `MATCH_ESCROW_PROGRAM_ID` value is the devnet program ID (`4kzrDpV9JxjE...`) — verify mainnet deployment needs a different value or `ESCROW_PROGRAM_ID_V2` override.
- **Missing**: per-game leaderboard secrets (`BASKETBALL_LEADERBOARD_SECRET`, `KEEPIE_UPPIES_LEADERBOARD_SECRET`, `FREE_KICKS_LEADERBOARD_SECRET`) are not in render.yaml — verify they exist in the Render dashboard manually.

#### Docker

- No Dockerfile present. Render builds via `npm ci --ignore-scripts` + `node index.js`.

---

### DEP — Dependencies

`server/package.json`:

| Dep | Pinning | Notes |
|---|---|---|
| `@coral-xyz/anchor` | `^0.32.1` | Anchor SDK |
| `@privy-io/server-auth` | `^1.32.5` | Privy server SDK |
| `@solana/web3.js` | `^1.98.4` | Solana RPC client |
| `cors` | `^2.8.6` | CVE-2024 historically — verify version is post-patch |
| `dotenv` | `^16.0.0` | env loader |
| `express` | `^4.17.3` | Express 4 — Express 5 LTS released; consider upgrade |
| `express-rate-limit` | `^8.5.1` | rate limiter |
| `helmet` | `^8.1.0` | helmet v8 |
| `jsonwebtoken` | `^9.0.3` | latest major |
| `mongoose` | `^9.2.1` | Mongoose 9 |
| `nodemon` | `^1.3.3` | dev-tool — should be in devDeps |
| `pino` | `^10.3.1` | logger |
| `react` | `^19.2.5` | unusual for a server dep — investigate (likely for satori SSR rendering of career cards) |
| `satori` | `^0.26.0` | SVG-to-PNG card rendering |
| `socket.io` | `^4.4.1` | WebSocket |
| `telegraf` | `^4.16.3` | Telegram bot |
| `tweetnacl` | `^1.0.3` | wallet signature verify |

- **All major-pinned with `^`** — minor/patch updates pulled in.
- **No `github:user/repo` direct deps** anywhere.
- **`nodemon` in prod deps** is sloppy but not a vulnerability — should be devDep.
- **`react` in server deps** is unusual — verify intent (probably needed by `satori`).

`package.json` (root):
- `repository.url`: `git+https://github.com/JJ-ME55/SolShot.git` (only line matching the github: pattern).

---

### BOT — Automation (HIGH for SolShot)

#### Telegraf handler registration

| File | Lines | Bot |
|---|---|---|
| `server/services/bot.js` | 210 `play`, 285 `challenge`, 292 `stats`, 352 `teststats`, 434 `leaderboard`, 500 `wallet`, 603 `link`, 639 `shop`, 682 `prestige`, 720 `weapons`, 792 `help`, 884 `support`, 895 `refer`, 938 `settings`, 952 `mygames`, 967 `inline_query`, 1075 `callback_query` | `@SolShotGG_bot` |
| `server/services/arcadeBot.js` | 337 `games`, 357 dynamic per-game (`<slug>`), 369 `leaderboard`, 386 dynamic per-game leaderboard, 392 `callback_query`, 400 `help`, 419 `text` | `@TheArcadeGG_Bot` |
| `server/services/groupchat/index.js` | 60 `customgame`, 61 `startmatch`, 62 `cancelmatch` | groupchat subset |

#### Outgoing bot messages

| File | Line | Pattern |
|---|---|---|
| `server/services/groupchat/lobbyWatchdog.js` | 44 | `bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })` |
| `server/services/adminNotifications.js` | 146, 222 | admin-pings, ad-hoc messages |
| `server/services/groupchat/index.js` | 393 | `ctx.telegram.sendMessage(...)` |
| `server/services/groupchat/lifecycle.js` | 1182, 1192 | `bot.telegram.sendMessage(chatId, text, ...)` helper |

#### Webhook config

| File | Line | Pattern |
|---|---|---|
| `server/services/bot.js` | 1175, 1176 | `bot.telegram.setWebhook(fullUrl, secret ? { secret_token: secret } : undefined)` + `app.use(bot.webhookCallback(WEBHOOK_PATH, secret ? { secretToken: secret } : undefined))` |
| `server/services/arcadeBot.js` | 494, 495 | identical pattern for arcade bot |

**Verdict**: Both bots use `secret_token` if provided, but the secret comes from `TELEGRAM_WEBHOOK_SECRET` / `ARCADE_WEBHOOK_SECRET` env vars which are optional. If absent in prod, the webhook is unauthenticated — anyone with the URL can POST arbitrary updates. **VERIFY** these secrets are set in Render dashboard.

---

### ERR — Error Handling

#### Empty catches (silenced errors)

100+ matches. Most are intentional cleanup catches in Phaser scenes:
- `client/src/scenes/main/index.js` — 30+ instances of `try { obj.destroy(); } catch (_) {}` and `try { this.sound.play(...); } catch (_) {}` patterns. These are safe — Phaser objects may be already-destroyed and we don't care.
- `client/src/utils/haptic.js:21,33`, `client/src/telegram/haptic.js:1` — fire-and-forget haptic feedback.
- `client/src/lib/debugLog.js:47` — debug log swallow, dev-only.
- `client/src/components/MovementHint.js:49,86`, `IosInstallBanner.js:73`, `TgWebViewBanner.js:42`, `TutorialOverlay.js:74` — localStorage write swallows (Safari private mode throws).

#### `.catch(() => {})` silenced promises

13 matches:
- `client/src/screens/BarracksScreen.js:194,196,211,215,475` — share/clipboard fallbacks, intentional.
- `client/src/screens/LobbyScreen.js:1292,1307,2016,2031` — share/clipboard fallbacks, intentional.
- `client/src/bridge/PhaserBootstrap.js:158` — AudioContext.close fallback, intentional.
- `client/src/components/design/AAR.js:149` — intentional swallow.
- `server/services/arcadeBot.js:396,471` — `ctx.answerCbQuery().catch(() => {})` + `registerArcadeBotCommands().catch(() => {})`. **The second one is a startup error swallow** — if arcade bot setup fails, the process keeps running with no bot. Investigate.
- `server/services/bot.js:1162` — same pattern: `registerBotCommands().catch(() => {})`. Same critique applies for main bot.

#### `.catch(() => null)` silent-failure patterns

| File | Line | Context |
|---|---|---|
| `server/index.js` | 748, 938 | `User.findOne({uid}).lean().catch(() => null)` — soft DB-failure handling on Privy-gated endpoints; downstream code must handle null. |
| `client/src/wallet/WalletContext.js` | 337, 476 | `privyGetAccessToken().catch(() => null)` — guarded by following null check + throw. |
| `server/tests/integration.test.js` | 5 sites | test-only |

#### `throw new Error(...)` sites

40+ matches across services and standalone leaderboards. All are precondition validators (telegramUserId required, session token required, etc.) or fatal config errors (`ARCADE_SESSION_SECRET missing`, etc.). No throws inside callbacks that would unhandled-reject.

---

### CRYPTO — Random / nonces

#### `Math.random()` — insecure RNG sites in server (security-relevant context only)

| File | Line | Security relevance |
|---|---|---|
| `server/services/ai.js` | 106-321 (16 sites) | LOW — AI bot aiming + wager-amount jitter. Game fairness only, no escrow impact. |
| `server/socket-io/main.js` | 1167 | LOW — disconnect-grace random delay (anti-pattern but not security) |
| `server/socket-io/main.js` | 4889 | LOW — `Math.floor(Math.random() * 5)` selects backdrop theme, cosmetic only |
| `server/services/stealthBot.js` | 41, 64 | LOW — stealth-bot AI choices |

**Security-relevant RNG paths all use `crypto.randomBytes`** — see below.

#### `crypto.randomBytes()` / `randomUUID()` — secure RNG sites

| File | Line | Use |
|---|---|---|
| `server/middleware/auth.js` | 24 | JWT_SECRET fallback (dev only — 32 bytes) |
| `server/socket-io/main.js` | 315, 2608, 2789, 2887, 3061 | Room ID generation (`randomBytes(4).toString('hex')` = 8 hex chars) |
| `server/socket-io/main.js` | 3821 | `randomBytes(safeCount * 4)` — terrain RNG seed |
| `server/socket-io/main.js` | 4871 | `randomBytes(16)` — full random match seed |
| `server/services/arcadeSession.js` | 54 | Dev secret fallback (48 bytes) |
| `server/services/walletLinkTokens.js` | 60 | Magic-link token (`TOKEN_BYTES` bytes) |
| `server/services/challenge/challenge.js` | 27 | Challenge code (`SHORTCODE_BYTES` bytes) |
| `server/services/referrals.js` | 37 | Referral code (3 bytes = 6 hex chars) |
| `client/src/components/HandleModal.js` | 154 | `crypto.randomUUID()` — UID fallback |

**Verdict**: all sensitive paths use CSPRNG. Room IDs are 4 bytes (32-bit space) — sufficient for collision-avoidance with the rate-limiter capping create-room calls, but technically only ~65k unique IDs before birthday collisions become likely (~50% at 65k rooms). Acceptable for current scale; revisit if room creation rate increases.

**Possible concern — referral code**: 3 bytes = 16.7M values. Collision detection in `referrals.js:38-41` retries on collision — fine.

---

### LOGIC — Business state mutations

#### Reconnect state machine

| File | Line | State |
|---|---|---|
| `server/socket-io/main.js` | 185 | `var disconnectTimers = {}` |
| `server/socket-io/main.js` | 187 | `var pendingReconnects = {}` |
| `server/socket-io/main.js` | 2148, 2159, 2165-2169 | reads + cleanup (currently within dead-code rejoin path, since "Reconnect is disabled for P1 launch" — line 2106) |

**Note**: Reconnect is disabled at the top of `rejoinRoom` (early-return). All downstream rejoin logic is dead. The `disconnectTimers`/`pendingReconnects` maps may still be written/never-cleared in some paths — verify in audit.

#### `authenticatedWallets` map (identity routing)

30+ reads/writes across `server/socket-io/main.js`. Initialised line 179 (`var authenticatedWallets = {}`), set on `authenticate` success (line 1532), deleted on disconnect (line 2095). Used to gate wager-related actions and resolve wallet for settle/refund/escrow.

**Critical pattern**: `wsState?.wallets?.[p.socketId] || authenticatedWallets[p.socketId] || null` — wallet snapshot taken at match start preserved in `wsState.wallets`, with fallback to live map. Auditor should verify the snapshot path is always preferred for settlement to defend against socket-ID reuse across reconnects.

#### Financial-state mutation hotspot files

| File | Count of {wager|pot|deposit|settle|refund} matches |
|---|---|
| `server/socket-io/main.js` | 504 |
| `server/index.js` | 21 |
| `server/socket-io/groupchat.js` | 61 |
| `server/services/escrow-v2.js` | high (entire file) |
| `server/services/escrow.js` | high (entire file) |
| `server/services/solana.js` | high (entire file) |

`main.js` dominance is expected — it owns lobby, queue, deposit confirm, partial-start, cancel-all, and forfeit settlement.

---

## Global Hot Files (Top 20 by total match count across all categories)

| Rank | File | Approx hit density | Auditor interest |
|---|---|---|---|
| 1 | `server/socket-io/main.js` | ~5,200 LoC, 500+ wager-path matches, all 51 socket handlers, 115 emits, escrow + deposit + settle + refund | **API, AUTH, LOGIC, ERR, CHAIN, BOT (admin paths)** |
| 2 | `server/index.js` | ~1,400 LoC, 30 Express routes, helmet + cors + rate-limiter, Privy auth init | **API, AUTH, WEB, SEC, INFRA** |
| 3 | `server/services/bot.js` | ~1,200 LoC, 17 Telegraf commands + webhook | **BOT, AUTH, SEC** |
| 4 | `server/services/escrow-v2.js` | ~640 LoC, all v2 program calls (createMatchV2, depositV2, settleV2, refundV2, applyConfig) | **CHAIN, LOGIC, ERR** |
| 5 | `server/socket-io/groupchat.js` | ~600 LoC, 9 socket handlers + 49 emits | **API, LOGIC, ERR** |
| 6 | `server/services/escrow.js` | ~600 LoC, v1 program calls | **CHAIN, LOGIC, ERR** |
| 7 | `server/services/arcadeBot.js` | ~520 LoC, second Telegraf bot, dynamic per-game commands | **BOT, AUTH** |
| 8 | `server/services/solana.js` | ~350 LoC, dispatches to v1/v2 escrow services | **CHAIN, LOGIC** |
| 9 | `server/services/users.js` | ~380 LoC, wallet-rotation + identity link + S2-T6 hardening | **LOGIC, DATA, SEC** |
| 10 | `server/services/privyAuth.js` | ~200 LoC, JWT verify + middleware + Bug 4 diagnostic dump | **AUTH, SEC** |
| 11 | `server/services/funnel.js` | ~150 LoC, S1-T2 instrumentation, atomic upsert dedupe | **DATA, LOGIC** |
| 12 | `server/services/games/*-standalone/standaloneLeaderboard.js` (×3) | ~200 LoC each, JWT score submission | **AUTH, DATA** |
| 13 | `server/services/arcadeSession.js` | ~113 LoC, 10-min handoff JWT | **AUTH, SEC** |
| 14 | `client/src/wallet/WalletContext.js` | client-side Privy + signing | **AUTH, CHAIN, FE** |
| 15 | `server/middleware/auth.js` | wallet signature + JWT mint | **AUTH, SEC** |
| 16 | `server/middleware/guards.js` | requireAdminKey, requireAuth, withLock, safeHandler, sanitizeName | **AUTH, ERR, LOGIC** |
| 17 | `server/services/groupchat/lifecycle.js` | match lifecycle, bulk stats writes | **DATA, LOGIC** |
| 18 | `server/services/challenge/challenge.js` | challenge create/expire/cancel | **DATA, LOGIC** |
| 19 | `server/services/referrals.js` | referral attribution | **DATA, LOGIC** |
| 20 | `server/services/keys.js` | server keypair load (single source) | **SEC, CHAIN** |

---

## Special Callouts

### Files with effectively-silent startup-error swallows

- `server/services/bot.js:1162` — `registerBotCommands().catch(() => {})` — if SolShot bot startup fails, server keeps running.
- `server/services/arcadeBot.js:471` — `registerArcadeBotCommands().catch(() => {})` — if arcade bot startup fails, server keeps running.

Both are intentional (don't crash the web service if Telegram is misconfigured), but worth verifying the parent logs the error first. Quick scan of `bot.js:1160-1175` shows the function does log internally — acceptable.

### Files that read `.env` in unusual ways

- `server/services/games/*-standalone/standaloneLeaderboard.js` — all three games write to `process.env._XXX_DEV_SECRET_WARNED` and `process.env._XXX_DEV_SECRET` to memoize a dev-fallback secret across the process. Functionally equivalent to module-level state but uses process.env as a side-channel. Not a vulnerability — just non-idiomatic.
- `server/scripts/init-config-mainnet.mjs:77` — guard that refuses to initialize mainnet config against a non-mainnet RPC URL (`!/mainnet/i.test(RPC)`). Good safety net.

### Files emitting `io.emit` unguarded (broadcast to ALL sockets)

- `server/socket-io/main.js:446` — `io.emit('queueSnapshot', buildQueueSnapshot())`
- `server/socket-io/main.js:655` — `io.emit('setRooms', { rooms: getOpenRooms() })`

Both broadcast global lobby/queue state. Verify `buildQueueSnapshot()` and `getOpenRooms()` don't leak wager amounts above the public minimum (e.g. private-room wagers should be redacted), or wallet addresses of high-roller queues.

### Files with regex compiled from runtime input

All `new RegExp(...)` matches use either compile-time static strings (profanity lists) or CLI script arguments (admin-only). Zero matches in the request path. Clean.

### Files where wallet appears in `console.log`

- `server/services/users.js:93,95,187,193,254` — uses `.slice(0, 8) + '…'` truncation. Wallet addresses are public on-chain so even full logs are not secrets, but truncated logs reduce log-volume PII.
- `server/scripts/*.mjs` (get-wallet, list-wallet-links, find-user, wipe-user, etc.) — print full wallet in admin operator output. Acceptable given admin-only invocation.

### Anchor TX-build pattern (`verifySignatures: false`)

3 sites: `server/services/escrow.js:364`, `server/services/escrow-v2.js:406`, `client/src/wallet/WalletContext.js:574`. All are server-side partial-sign followed by client-side counter-sign (or vice versa) — `verifySignatures: false` on serialize is correct because the TX is intentionally only partially signed at that point. **Verify** the receiving end never trusts the unsigned TX without final signature verification on submit.

---

## Audit #3 Focus Callouts (post-#2 changes)

### `server/services/users.js` (S2-T6 wallet rotation)

- `updateWalletForTgUser` at line 41-102 performs:
  1. Type-check (lines 42-50)
  2. Find existing user (line 53)
  3. Idempotency early-return on same wallet (line 59)
  4. Conflict check — wallet must not already belong to a different user (lines 64-71)
  5. **Atomic update with `findOneAndUpdate` + `$set + $push`** (lines 76-90).
- **TOCTOU window remains**: between the conflict check (line 64) and the atomic update (line 86), a concurrent `updateWalletForTgUser` could write the same `newWalletAddress` to a different user. Mitigated only by the `User.walletAddress` unique index (verify in `server/models/User.js`).
- **Verification needed**: that User schema has `walletAddress: { unique: true, sparse: true }` to prevent the race winning.

### `server/socket-io/main.js cleanupRoom branch` (Bug 6)

- Function definition: line 1863.
- Wrapper `cleanupRoom2` callsite: lines 2053-2086 — handles disconnect-from-lobby vs disconnect-from-active-match. The `cleanupRoom2.players && cleanupRoom2.players.length > 1` guard at line 2054 is the post-Bug-6 fix — only rebroadcasts player list if 2+ remain, doesn't fire cancel-escrow.
- Forfeit settlement chain at lines 1991-2037 is N=2 only (uses `winnerWallet` and `loserWallet`). For N>2 the disconnect path is `transitionState(currentMs, MATCH_STATES.CANCELLED)` at line 2039 (else branch). Auditor must verify N>2 disconnect doesn't strand escrow funds.

### `server/services/privyAuth.js` (Bug 4 diagnostic logging)

- Lines 129-150: on token verification failure, logs `endpoint`, `tokenAudience` (Privy `aud` claim), `ourAppId` (`PRIVY_APP_ID` env), `audMatchesEnv` (bool), `issuer`, `privyDid` (`sub`), `ageSinceIssueSecs`, `secsUntilExpiry`, `expired`.
- The `privyDid` (`sub`) is the user's Privy DID — public identifier, not a secret.
- The `aud` and `iss` are app-level identifiers — not user secrets.
- Token itself is never logged. **No token leak.**

### `server/scripts/init-config-mainnet.mjs`

- Reads 9 env vars at lines 64-72.
- Validates each: 75-83 (presence), 77 (`!/mainnet/i.test(RPC)` — refuses non-mainnet RPC), 81 (keypair path required), 82-83 (Squads PDAs required), 90-92 (base58 parse), 96-98 (PDAs must be distinct on-chain), 100-108 (BPS bounds).
- Confirmation gate at line 149: requires `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE`. Any other value dry-runs.
- Idempotency check at line 139-146: aborts if config already exists.
- **Solid env-validation guards.** One minor: line 78 message says "must point at mainnet" — accepts any URL with "mainnet" substring (could be tricked by `mainnet-test.example.com` but operator-only).

### `server/scripts/wipe-user.mjs`

- Confirmation guard: `WIPE_CONFIRM=YES` env required, else dry-run (line 56-61).
- Regex needle from `process.argv[2]` (line 22) — admin-only.
- Will delete ALL matching users (no preview limit). On a typo, can wipe many records.

### `server/services/funnel.js` (sparse-unique indexes)

- `oneShotInsert` at line 60-78 uses `findOneAndUpdate` + `$setOnInsert` + `upsert: true, new: false` — atomic insert-if-not-exists.
- Dedupe key prioritization (lines 63-66): wallet > telegramUserId > uid.
- Catch at line 55: `err.code === 11000 && ONE_SHOT_STAGES.has(stage)` — silently swallows duplicate-key errors for one-shot stages (the expected race-collision outcome). Non-one-shot stages get logged.
- Aggregation at line 100-138: groups by stage + unique identities — defensively uses `$ifNull` chain.
- **Verification needed**: the `walletAddress`, `telegramUserId`, `uid` fields in the FunnelEvent model must have sparse-unique compound indexes per stage, else the atomic upsert still has a TOCTOU race.

---

## Patterns That Returned Suspiciously High Counts

| Pattern | Count | False-positive review |
|---|---|---|
| `wager\|pot\|deposit\|settle\|refund` (literal grep) | 786 matches across 30 files | Real — `main.js` alone is 504 hits. These words are unavoidable in this codebase; severity comes from the operations done WITH them, not the keyword. |
| `walletAddress\|playerAddress\|wallets\[` | 332 matches | Real — identity routing is pervasive. `main.js` alone is 504 hits. Auditor focus: lifecycle of the `wsState.wallets` snapshot vs live `authenticatedWallets` map. |
| `localStorage\.\|sessionStorage\.` | 60+ matches | False-positive noise — all UX state, no secrets. Listed for completeness, not a hot spot. |
| Empty `catch (_) {}` | 100+ matches | Mostly false-positive — Phaser cleanup pattern. Real concern only at startup-error swallows in `bot.js:1162` and `arcadeBot.js:471`. |
| `Math.random()` | 80+ matches | Mostly false-positive — game-physics RNG (terrain, particle effects, AI aiming). No security-sensitive call uses Math.random. |
| `process.env.*` | 100+ matches | Real — high-signal inventory. Documented above. |

---

## Top 3 Hottest Files (final ranking for auditor prioritization)

1. **`server/socket-io/main.js`** — 5,198 LoC. Dominates 9 of 12 HIGH/MEDIUM categories: API (51 handlers, 88+ broadcast surfaces), AUTH (`requireAuth` at 11 callsites), LOGIC (wager paths, reconnect map, `authenticatedWallets`), ERR (4 `safeHandler` wraps, ad-hoc try/catch elsewhere), CHAIN (escrow callbacks, lamport math). Single biggest review target.
2. **`server/index.js`** — 1,407 LoC. Owns all Express routing, helmet+cors+rate-limiter config, Privy middleware mount, 30 routes including admin endpoints, and arcade-session mint. Second biggest review target.
3. **`server/services/bot.js`** — 1,202 LoC. Telegraf bot handlers, webhook secret config, admin-DM paths, Telegram-message-injection vectors. Third biggest, especially given the BOT category has its own attack surface (TG webhook accepts external POSTs).

Honorable mentions: `server/services/escrow-v2.js` + `server/services/escrow.js` (both critical for CHAIN audit) and `server/services/groupchat/lifecycle.js` (DATA + LOGIC for group-chat match lifecycle, including bulk stats writes).
