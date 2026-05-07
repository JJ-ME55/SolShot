# DB Hot Spots Map

**Generated:** 2026-05-07 by `/DB:scan` Phase 0.5
**Auditor selection:** 22 auditors (same as Feb #1 — same components + Privy/v2/groupchat covered by same auditor IDs)

## Per-Auditor Hot Files

### SEC-01: Private Key & Wallet Security

| File | Notes |
|------|-------|
| `server/services/keys.js` | Server keypair handling — escrow authority |
| `server/services/escrow.js` / `escrow-v2.js` | TX signing with server keypair |
| `client/src/wallet/WalletContext.js` | Privy embedded-wallet integration; `signAndSendEscrowDeposit`, `signAndBurnShot` |
| `server/scripts/init-config.mjs` | Bootstraps GlobalConfig with authority |
| `.env.example` files | Reference config |

### SEC-02 (always-select): Secret & Credential Management

| File | Notes |
|------|-------|
| `server/.env*` | Server config — must NOT be tracked |
| `client/.env*` | Client config — REACT_APP_* prefixed only |
| `server/index.js` | Loads env vars |
| `server/services/privyAuth.js` | NEW — Privy app secret usage |
| `server/services/walletLinkTokens.js` | NEW — magic-link bind tokens |
| Various scripts in `server/scripts/` | Some load keypairs from disk |

### AUTH-01: Authentication Mechanisms

| File | Notes |
|------|-------|
| `server/middleware/auth.js` | JWT auth middleware |
| `server/middleware/telegram.js` | Telegram webhook signature validation |
| `server/services/privyAuth.js` | NEW — Privy JWT verification |
| `server/socket-io/main.js` | Socket auth-on-handshake; today's `8eefcca` reset-on-reconnect fix |
| `client/src/App.js` | Auth-reset-on-reconnect client side |
| `client/src/wallet/WalletContext.js` | Wallet → JWT exchange |
| `server/services/bot.js` | Telegram bot auth flow |

### AUTH-03: Authorization & Access Control

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | Per-event authz checks (tgIdFor + caller validation) |
| `server/services/match.js` | Player allowlist enforcement |
| `server/services/groupchat/lifecycle.js` | NEW — async match authz |
| `server/middleware/guards.js` | Per-route guards |
| `server/socket-io/groupchat.js` | NEW — group-chat event guards |

### INJ-01: SQL & NoSQL Injection

| File | Notes |
|------|-------|
| `server/models/User.js`, `Match.js`, `GroupMatch.js` | Mongoose schemas — query constructions |
| `server/services/users.js` | User lookup queries |
| `server/services/match.js` | Match lookup queries |
| `server/services/groupchat/lifecycle.js` | NEW — group match queries |

### INJ-05: Prototype Pollution & Deserialization

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | Socket event payload deserialization (~50+ events) |
| `server/services/groupchat/configFlow.js` | NEW — group config payload parsing |
| `server/middleware/*` | Body parsers + JSON parsing |

### WEB-02: CORS, CSP & Security Headers

| File | Notes |
|------|-------|
| `server/index.js` | helmet + CORS config |
| `server/middleware/cors.js` (if separate) | CORS allow-list |
| `client/vercel.json` | Vercel headers (CSP, frame-options) |
| `client/public/index.html` | meta CSP if any |

### CHAIN-01: Transaction Construction & Signing

| File | Notes |
|------|-------|
| `server/services/escrow.js` | Anchor program TX builder for v1 |
| `server/services/escrow-v2.js` | NEW — v2 TX builder |
| `server/services/solana.js` | RPC + TX submission |
| `client/src/wallet/WalletContext.js` | Client-side TX signing |

### CHAIN-02: RPC Client & Node Trust

| File | Notes |
|------|-------|
| `server/services/solana.js` | RPC connection (devnet + future mainnet) |
| `server/services/escrow.js`, `escrow-v2.js` | RPC calls embedded |
| `server/services/jupiter-price.js` | NEW — Jupiter price RPC |

### CHAIN-03: Wallet Integration & Adapter Security

| File | Notes |
|------|-------|
| `client/src/wallet/WalletContext.js` | Privy adapter |
| `client/src/App.js` | Wallet provider tree + auth-reset |
| `server/services/walletLinkTokens.js` | NEW — server-side magic-link binding |
| `server/services/privyAuth.js` | NEW — Privy JWT verify |

### CHAIN-06: Program Account & PDA Interaction

| File | Notes |
|------|-------|
| `server/services/escrow.js`, `escrow-v2.js` | PDA derivation + account fetching |
| `server/scripts/init-config.mjs` | Config PDA init |

### API-03: WebSocket & Real-Time Security

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | **Mega-file**, ~1850 LOC — all socket events |
| `server/socket-io/groupchat.js` | NEW — group-chat events (`fireGroupShot`, `forfeitGroupMatch`, `confirmGroupDeposit`, `purchaseGroupWeapon`, etc.) |
| `client/src/socket/index.js` | Client socket setup + reconnect logic |
| `server/index.js` | Socket.IO server config |

### DATA-01: Database & Query Security

| File | Notes |
|------|-------|
| `server/models/*` | All Mongoose schemas — schema validation |
| `server/services/match.js` | Match read/write |
| `server/services/users.js` | User read/write |
| `server/services/groupchat/lifecycle.js` | NEW — bulkwrite stat-history pipeline |

### DATA-04 (always-select): Logging & Information Disclosure

| File | Notes |
|------|-------|
| `server/index.js` | Pino logger setup |
| `server/services/*` | All log call sites |
| `server/socket-io/main.js` | Today's `[GC ...]` group-chat observability tags |
| `client/src/lib/debugLog.js` | NEW — client debug log + remote forwarding |
| `client/src/components/DebugAuthOverlay.js` | NEW — exposes auth state in UI |

### DATA-05: Encryption & Data Protection

| File | Notes |
|------|-------|
| `server/services/walletLinkTokens.js` | NEW — token storage |
| `server/services/privyAuth.js` | NEW — Privy JWT handling |
| `server/index.js` | TLS termination assumed at infra layer |

### DEP-01 (always-select): Package & Dependency Security

| File | Notes |
|------|-------|
| `server/package.json` + lock | 20 vulns (7 moderate, 13 high) — was 30 in Feb |
| `client/package.json` + lock | 47 vulns (13 low, 8 moderate, 25 high, 1 critical) — was 131 in Feb |
| Root `package.json` | Workspace deps |

### ERR-01 (always-select): Error Handling & Fail Modes

| File | Notes |
|------|-------|
| `server/services/escrow.js`, `escrow-v2.js` | Try/catch around CPI calls |
| `server/socket-io/main.js` | Error handling per event handler |
| `server/services/groupchat/scheduler.js` | NEW — scheduled tasks error handling |
| `client/src/App.js` | Boundary errors + retry logic |

### ERR-02: Race Conditions & Concurrency

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | Match state mutations under concurrent socket events |
| `server/services/match.js` | TOCTOU on match state |
| `server/services/groupchat/lifecycle.js` | NEW — async multi-day state transitions |
| `server/services/groupchat/lobbyWatchdog.js` | NEW — concurrent timeout handlers |

### ERR-03: Rate Limiting & Resource Exhaustion

| File | Notes |
|------|-------|
| `server/index.js` | express-rate-limit setup |
| `server/socket-io/main.js` | Per-event throttles (create-room) |
| `server/services/groupchat/idleTimeout.js` | NEW — HP-penalty timeout |

### CRYPTO-01: Random Number Generation & Nonces

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | Room ID generation (4-byte CSPRNG per memory) |
| `server/services/match.js` | Match ID generation |
| `server/services/groupchat/lifecycle.js` | NEW — group match ID gen |
| `server/services/walletLinkTokens.js` | NEW — bind-token nonce gen |

### LOGIC-01: Business Logic & Workflow Security

| File | Notes |
|------|-------|
| `server/socket-io/main.js` | Match state machine logic |
| `server/services/physics.js` | Server-authoritative trajectory + damage |
| `server/services/match.js` | Match lifecycle |
| `server/services/groupchat/lifecycle.js` | NEW — async match logic |
| `server/services/gold.js` | Gold economy |

### LOGIC-02 (always-select): Financial & Economic Logic

| File | Notes |
|------|-------|
| `server/services/escrow.js`, `escrow-v2.js` | TX construction for wagered matches |
| `server/services/gold.js` | In-game gold economy |
| `server/services/shot-token.js` | SHOT token + prestige burns |
| `server/services/match.js` | Wager → settle flow |
| `server/services/groupchat/lifecycle.js` | NEW — group wager flow |
| `server/services/consumables.js` | NEW(?) — purchase flow |
| `server/services/jupiter-price.js` | NEW — price oracle (display only?) |

## Global Hot Files (Cross-Auditor)

Files ranked by total auditor interest:

| Rank | File | Auditors |
|------|------|----------|
| 1 | `server/socket-io/main.js` | 11 (AUTH-01, AUTH-03, INJ-05, API-03, DATA-04, ERR-01, ERR-02, ERR-03, CRYPTO-01, LOGIC-01, LOGIC-02) |
| 2 | `server/services/escrow.js` + `escrow-v2.js` | 7 (CHAIN-01, CHAIN-02, CHAIN-06, ERR-01, LOGIC-02, SEC-01, AUTH-03) |
| 3 | `server/services/privyAuth.js` (NEW) | 6 (SEC-02, AUTH-01, CHAIN-03, DATA-04, DATA-05, ERR-01) |
| 4 | `server/services/groupchat/lifecycle.js` (NEW) | 6 (AUTH-03, INJ-01, DATA-01, ERR-02, LOGIC-01, LOGIC-02) |
| 5 | `client/src/wallet/WalletContext.js` | 5 (SEC-01, AUTH-01, CHAIN-01, CHAIN-03, DATA-04) |
| 6 | `server/services/walletLinkTokens.js` (NEW) | 5 (SEC-01, SEC-02, AUTH-01, CRYPTO-01, DATA-05) |
| 7 | `server/index.js` | 5 (SEC-02, WEB-02, ERR-01, ERR-03, DATA-04) |
| 8 | `server/socket-io/groupchat.js` (NEW) | 4 (AUTH-03, API-03, ERR-02, LOGIC-02) |
| 9 | `server/services/match.js` | 4 (AUTH-03, INJ-01, DATA-01, LOGIC-02) |
| 10 | `client/src/App.js` | 3 (AUTH-01, CHAIN-03, DATA-04) |

## Deltas vs Feb

- New hot file: `server/services/privyAuth.js` (entirely new auth layer)
- New hot file: `server/services/walletLinkTokens.js` (entirely new token mechanism)
- New hot file: `server/services/groupchat/lifecycle.js` (entirely new state machine)
- New hot file: `server/socket-io/groupchat.js` (5+ new socket events)
- Modified hot file: `server/socket-io/main.js` (was already #1; now ~1850 LOC vs ~1300 in Feb)
- Modified hot file: `client/src/App.js` (auth-reset-on-reconnect added)
- Modified hot file: `client/src/wallet/WalletContext.js` (Privy migration; new `signAndBurnShot`)
