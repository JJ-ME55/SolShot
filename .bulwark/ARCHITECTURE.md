# SolShot Off-Chain Architecture (DB Audit #2 Synthesis)

**Generated:** 2026-05-07 by `/DB:strategize`
**Synthesized from:** 22 context auditor outputs at `.bulwark/context/`
**Cross-skill inputs:** `.audit/` (SOS Audit #2), `.bok/reports/2026-05-07-report.md`, `Docs/` (GL Feb 2026)
**Stacked on:** `.bulwark-history/2026-02-24-ecfd03b/` (Audit #1 — 70 confirmed)

---

## 1. Project Overview

SolShot is a multiplayer artillery game with on-chain SOL escrow for wagered matches.

**Components:**
- **Server:** Node.js + Express + Socket.IO + Telegraf bot. Acts as game-physics authority + escrow signer + match coordinator.
- **Client:** React 18 + Phaser 3.55 PWA at solshot.gg. Privy embedded wallets for SOL signing.
- **Database:** MongoDB (Mongoose). Stores users, matches (1v1), group matches, challenges, referrals.
- **Bot:** Telegram bot (Telegraf) for match creation in group chats + magic-link wallet binding via DM.
- **On-chain:** v1 + v2 escrow programs on Solana devnet. Server holds the authority keypair for both.
- **Hosting:** Vercel (client + PWA), Render (server + bot).

**Architectural shifts since Feb 2026 audit:**
- Migrated Dynamic → Privy embedded wallets (new auth path: `privyAuth.js` + `walletLinkTokens.js`)
- Added group-chat infrastructure (10 service files; async multi-day matches)
- Added v2 N-player escrow integration (`escrow-v2.js`)
- Phase 4 secrets management hardening
- Phase 6 token economy hardening
- Today's auth-reset-on-reconnect fix (commit `8eefcca`)

---

## 2. Trust Boundary Map

```
┌──────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 0: PUBLIC INTERNET (UNTRUSTED)                         │
│ - Any HTTP client, any WebSocket connector, any TG webhook        │
└────────────────┬─────────────────────────────────────────────────┘
                 │ → CORS + helmet + rate-limit (helps but not fully scoped)
                 │ → CSP missing on Vercel; clickjacking vector on Privy modal
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 1: AUTHENTICATED CLIENT                                │
│ - Has TG webhook signature OR Privy session JWT OR magic-link tok │
│ - GAP: client.isAuthenticated flag (in-memory) is the real gate;  │
│   JWT generated but never verified server-side                    │
│ - GAP: auth signature replay 5-min window (Feb finding still open)│
└────────────────┬─────────────────────────────────────────────────┘
                 │ → tgIdFor() resolves identity (per-event)
                 │ → BUT: NODE_ENV fallback in non-prod allows impersonation
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 2: VERIFIED IDENTITY (TG ID + Wallet)                  │
│ - Server "knows" caller's TG ID and wallet pubkey                 │
│ - GAP: link-from-privy-telegram trusts client-supplied tg_id      │
│ - GAP: wallet rotation never updates DB (users.js:91)             │
│ - GAP: tgIdFor() can be backfilled from authenticate handler      │
└────────────────┬─────────────────────────────────────────────────┘
                 │ → match-participant authz
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 3: MATCH PARTICIPANT (per-match scope)                 │
│ - Server believes caller is a player in match X                   │
│ - Can: deposit, fire, forfeit, purchase weapon, confirm deposit   │
│ - GAP: shoot legacy relay no auth                                  │
│ - GAP: acceptChallenge / declineChallenge no auth                  │
│ - GAP: getGroupMatch unauthenticated read                         │
└────────────────┬─────────────────────────────────────────────────┘
                 │ → server-authoritative state mutation
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRUST ZONE 4: SERVER AUTHORITY (Escrow signer)                    │
│ - Server holds solshot-dev.json keypair                           │
│ - Signs on behalf of game state to settle/cancel/create on-chain  │
│ - Server is also Solana program upgrade authority for v1 + v2     │
│ - GAP: keypair unzeroized in process memory                       │
│ - GAP: same key for upgrade auth AND application auth (hot wallet)│
└────────────────┬─────────────────────────────────────────────────┘
                 │
        ╔════════╧═════════╗
        ▼                  ▼
   On-chain           MongoDB Atlas
   (Solana RPC)       (No at-rest encryption on free tier)
```

---

## 3. API Surface (Externally-Reachable)

### HTTP Routes (Express)

| Route | Method | Auth required | Notes |
|-------|--------|---------------|-------|
| `/health` | GET | No | Exposes activeConnections (info disclosure) |
| `/api/wallet/link-from-tg-token` | POST | Soft Privy + magic-link | **CRITICAL** — Privy fails-open if secret missing |
| `/api/wallet/link-from-privy-telegram` | POST | Privy JWT | **CRITICAL** — trusts client-supplied tg_id |
| `/api/challenge` | POST | None | **HIGH** — operator injection vector |
| `/api/challenge/:code/cancel` | POST | None | **HIGH** — fully unauthenticated |
| `/api/admin/reload-keys` | POST | Admin key (`!==`) | **HIGH** — timing-unsafe compare |
| `/stats` | GET | Admin key | Same timing-unsafe compare |
| `/teststats` (TG bot) | TG message | Admin only? | Returns `err.message` to users |
| Card render endpoints | GET | None | **HIGH** — no per-endpoint rate limit (blocking satori+resvg) |

### Socket.IO Events (~63 total)

55 in `server/socket-io/main.js`, 8 in `server/socket-io/groupchat.js`. Most authenticated 1v1 events have `requireAuth` and check player membership. New group-chat events have `tgIdFor()` checks. **Persistent gaps:**

- `shoot` (legacy relay) — zero auth
- `acceptChallenge` / `declineChallenge` — fromSocketId client-supplied
- `getGroupMatch` — unauthenticated read of full match doc
- `clientDebugLog` — unauthenticated log injection
- `groupShopComplete` — tgId only, no match-membership check
- `escrowDepositStatus` (server-emit) — broadcasts wallet pubkeys to all room members (PII leak)

---

## 4. Data Flows (Critical Paths)

### Flow A: Wagered Match End-to-End

```
Player TG /customgame
  → bot lobby card posted
  → players join via TG button
  → server creates GroupMatch in Mongo
  → server creates on-chain MatchEscrow PDA (signs with authority key)
  → bot DMs each player magic-link to deposit
  → player clicks → opens solshot.gg → Privy authenticates → walletLinkTokens redeems
  → ⚠ TRUST BOUNDARY: server creates JWT but never verifies it
  → ⚠ TRUST BOUNDARY: link-from-privy-telegram trusts client-supplied tg_id
  → player signs deposit_wager TX (Privy)
  → server confirms via getTransaction (2s retry then accepts; insufficient on devnet)
  → all deposited → match Active
  → players take turns firing (12-hr timer default)
  → ⚠ shoot relay (1v1 legacy) has no turn-ownership check
  → ⚠ self-damage Math.abs in 1v1 (player can fire at themselves to end)
  → server runs physics, emits shotResult
  → last alive wins → server settles on-chain
  → ⚠ refundWager fails-open if cancel CPI throws
  → ⚠ wallet rotation gap — settlement may go to stale DB-stored wallet
  → ⚠ group-chat double-settle race possible
```

### Flow B: Cancel/Refund Path

```
Player calls cancel via socket
  → server checks deposits_mask in Mongo (NOT on-chain)
  → ⚠ H023 fix mismatch: server passes remaining_accounts based on Mongo state, not on-chain
  → if Mongo desync: refund fails on-chain with IncompleteRefund
  → server reports success: true even though on-chain failed
  → player thinks refund happened; SOL stuck until 24h reclaim grace (v2) or 2h (v1)
```

### Flow C: SHOT Burn / Prestige Unlock

```
Player initiates burn
  → client builds + signs SPL burn TX
  → server verifyBurnTransaction()
  → server's verifiedBurnTxs Set is in-memory (lost on restart)
  → ⚠ Replay potential after server restart
  → server credits prestige unlock
```

---

## 5. Critical Invariants — Status Map

| Invariant | Enforcement | Status |
|-----------|-------------|--------|
| **Auth is required for state-mutating events** | `requireAuth` middleware + `client.isAuthenticated` flag | **PARTIAL** — `shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog` bypass |
| **Identity (tgId, wallet) cannot be forged** | `tgIdFor()` + Telegram HMAC | **VIOLATED** — backfill from `authenticate` handler bridges TG-HMAC and wallet-auth without distinction; `link-from-privy-telegram` trusts client-supplied tg_id |
| **Match state transitions are atomic** | Mongoose findOneAndUpdate + state guards | **PARTIAL** — group-chat double-settle race + confirmDeposit overwrite race |
| **Refunds always reach players** | Server constructs cancel TX with remaining_accounts | **VIOLATED** — refundWager fails-open; if Mongo state desyncs from on-chain, refund permanently fails |
| **Settlement reaches the actual winner** | Server reads `winnerPlayer.walletAddress` | **VIOLATED** — wallet rotation gap means stale address used post-Privy-rekey |
| **Server logs don't leak secrets/PII** | Pino redact policy | **PARTIAL** — 95% of logs bypass redact via raw console.log; TG ID + wallet co-logged |
| **Production builds don't ship debug surfaces** | Conditional compilation | **VIOLATED** — DebugAuthOverlay ships in prod; activated by `?debug=1` |
| **Rate limits prevent DOS amplification** | express-rate-limit + per-socket throttle | **PARTIAL** — physics × concurrent connections amplifies; RPC has no retry on 429 |

---

## 6. Critical Assumptions — Validation Status

| Assumption | Status |
|-----------|--------|
| `PRIVY_APP_SECRET` is set in production | **CONTRADICTED** — absent from `render.yaml`; production silently disables JWT verify |
| `TELEGRAM_BOT_TOKEN` is set | **UNVALIDATED** — also absent from `render.yaml`; HMAC validation skipped if missing |
| Mongo wallet matches on-chain wallet | **CONTRADICTED** — `users.js:91` never updates after first set |
| RPC always returns truth | **UNVALIDATED** — single endpoint, no fallback, no health check |
| Server keypair zeroized on shutdown | **CONTRADICTED** — `keys.js:56-64` documents the zero was REMOVED (web3.js aliases buffer) |
| `qs` is non-vulnerable | **VALIDATED** — 6.14.2 (above 6.10.3 threshold) |
| Deposits land on-chain when Mongo says they did | **PARTIAL** — server uses 2s retry then accepts; devnet often slower |

---

## 7. Cross-Cutting Concerns (3+ auditors flagged each)

| Concern | Auditors |
|---------|----------|
| **Privy/TG identity bridge unverified** | AUTH-01, CHAIN-03, SEC-01, ERR-01, INJ-01 (NODE_ENV) |
| **Wallet rotation gap** | CHAIN-03, DATA-01, SEC-01 |
| **`refundWager()` fails-open** | LOGIC-02, ERR-01 |
| **Group-chat double-settle race** | LOGIC-02, ERR-02, LOGIC-01 |
| **`confirmDeposit` doc overwrite** | ERR-02, LOGIC-01 |
| **Auth signature replay (5-min)** | AUTH-01, CHAIN-03, CRYPTO-01 |
| **JWT generated never verified** | AUTH-01, SEC-02, DATA-04 |
| **Single keypair = upgrade + app auth** | SEC-01, SEC-02, DATA-05 |
| **No state pre-check before settle** | CHAIN-01, CHAIN-06, ERR-01 |
| **`failedSettlements` silent drop** | LOGIC-02, ERR-01, ERR-03 |

---

## 8. On-Chain ↔ Off-Chain Boundary Analysis

The on-chain programs (post SOS Audit #2 fix bundle) enforce strong invariants. The off-chain code is the WEAKER LINK — and most exploitation paths route through it:

| On-chain assumption | Off-chain reality |
|---------------------|-------------------|
| `cancel_match` requires `len(remaining_accounts) == count_ones(deposits_mask)` (H023 fix) | **Server doesn't read on-chain mask** — uses Mongo `initialDepositTx` field. Desync = stuck refund. |
| Authority is a single trusted key | Off-chain: keypair unzeroized in memory, env-var-loaded, no rotation procedure |
| Per-match snapshot freezes treasury/ops/BPS at create | Off-chain: ✅ correctly read from snapshot when settling |
| Players array fixed at create | Off-chain: ✅ stored in match doc, used for pubkey-match check |
| Settlement winner ∈ players | Off-chain: ✅ enforced via Mongoose validation + on-chain constraint |
| Pause does not block in-flight exits (v2) | Off-chain: doesn't directly affect server logic |

**Net:** SOS fix bundle is comprehensive on-chain, but the off-chain refund-builder needs to be updated to read on-chain `deposits_mask` before constructing `remaining_accounts`. Otherwise the new H023 enforcement creates a new failure mode (refunds reject) without closing the underlying server-side state-desync risk.

---

## 9. Risk Heat Map

### Tier 1 (CRITICAL — fix before mainnet):

1. Privy/TG identity bridge unverified (auth bypass via composition)
2. Wallet rotation gap (silent fund loss to stale address)
3. `refundWager()` fails-open (silent fund loss on chain error)
4. Group-chat double-settle race (state corruption + double Mongo writes)
5. `confirmDeposit` doc overwrite race (match stalls indefinitely)
6. `requirePrivyAuth({required:true})` ineffective when secret missing
7. `shoot` legacy relay no auth (1v1 wagered match shot forging)
8. `acceptChallenge`/`declineChallenge` no auth (challenge takeover)
9. Self-damage Math.abs sign erasure in 1v1 (self-fire to end match)
10. `clientDebugLog` unauthenticated log injection
11. Escrow keypair unzeroized in process memory
12. `escrowDepositStatus` PII broadcast to all room members
13. DebugAuthOverlay ships in production bundle
14. JWT generated but never verified server-side (Feb finding)
15. Auth signature 5-min replay window (Feb finding)
16. `tgIdFor()` NODE_ENV fallback in non-prod
17. `link-from-privy-telegram` trusts client-supplied `telegramUserId`
18. `getGroupMatch` unauthenticated read of full match document
19. `runValidators: true` not set on update paths (schema enums bypassable)
20. `bulkWrite` partial-failure silent (group-chat stat-history)
21. `failedSettlements` silently dropped after 5 retries
22. Vercel client has zero security headers (clickjacking on Privy modal)
23. Single keypair = upgrade + application authority (acknowledged pre-mainnet)

### Tier 2 (HIGH — should-fix pre-mainnet):

- 5 npm CVEs (express-rate-limit IPv6, socket.io-parser DOS, path-to-regexp ReDoS, handlebars JS injection, bigint-buffer overflow)
- Server CSP has dead Dynamic origins
- Server uses single unmonitored RPC endpoint
- No state pre-check before settle (settle-on-Cancelled fails silently)
- Privy server-auth deprecated package
- nodemon in production deps (ReDoS chain)
- Weapon inventory bypass on missing slot
- Turn-sequence nonce optional (`if (clientSeq !== undefined)`)
- Group match IDs use Math.random() (predictable, lobby-sniping)
- TG bot lacks NODE_ENV/admin guard on `/teststats`
- v2 settle TOCTOU between snapshot fetch and submit
- Multi-step settle path with no retry/queue equivalent for v2
- 30s balance cache TOCTOU
- DOS amplification: physics × concurrent connections
- v2 settle path no failedSettlements equivalent
- `uncaughtException`/`unhandledRejection` are log-only
- No MongoDB reconnect handling (default `bufferCommands: true`)
- Magic-link token transmitted as URL query param (logged)
- Timing-unsafe admin key comparison (`!==`)

### Tier 3 (MEDIUM-LOW — defensive/cosmetic):

- ~30 medium-severity findings (config drift, minor leakage, cleanup gaps)
- ~20 low/cosmetic findings (documentation, hygiene, edge cases)

---

## 10. Novel Attack Surface Observations

1. **Composed-attack Privy/TG bridge** — each component looks reasonable individually; the attack only emerges from composition. Privy JWT proves identity to server, but server never checks that the supplied `telegramUserId` matches what's in Privy claims. Combined with backfill in `authenticate` handler that conflates wallet-auth and TG-HMAC sources, an attacker with valid Privy session can take over any TG ID in the system.

2. **Cross-protocol auth poisoning (now closed by qs 6.14.2)** — HTTP body `__proto__[isAuthenticated]=true` would have poisoned `Object.prototype` if `qs` were vulnerable, bypassing auth across all 50+ socket handlers via a single request. Validated NOT vulnerable but worth noting as the attack class.

3. **`escrowDepositStatus` cross-room PII broadcast** — server sends full wallet addresses to all room members on each deposit. Linkage of TG ID + wallet pubkey across all match participants.

4. **Group-chat self-firing infinite stall** — group-chat correctly filters `dmg <= 0` for self-shots, but `consecutiveMissedTurns` is reset on every fire event regardless of damage. A malicious player can fire at themselves indefinitely to stall the match while never being auto-forfeited.

5. **Wallet rotation silent fund redirect** — Privy may re-provision an embedded wallet (SDK upgrade, key rotation, user action). Server's Mongo doc is never updated. Settlement at lifecycle.js:851 reads stale `walletAddress`, settles ON-CHAIN to a wallet the user no longer controls. No error logged. Funds permanently lost to attacker who claimed the old wallet.

6. **Refund-builder ↔ on-chain mask desync** — H023 added a length-check on-chain. Server still reads its in-memory `wagerStates[roomId].deposits` map. Server crash + reconnect can desync these. Then every cancel attempt reverts on-chain with `IncompleteRefund`, leaving funds stranded for hours/days.

7. **Cross-skill chained: SOS deferred H001 + DB Privy auth gap** — SOS deferred H001 (one-step authority transfer). DB found Privy auth fails-open without secret. If both compromised: attacker rotates authority → settles all matches → drain treasury. The off-chain auth gap is the foothold; the on-chain gap is the multiplier.
