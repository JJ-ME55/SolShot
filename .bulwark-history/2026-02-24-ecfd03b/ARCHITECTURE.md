# Off-Chain Architectural Understanding

**Project:** SolShot (Off-Chain: Server + Client)
**Generated:** 2026-02-23
**Source:** Dinh's Bulwark Phase 2 Synthesis (22 context auditors)
**Scope:** Express/Socket.IO server, React/Phaser.js client, wallet integration, off-chain economic logic
**Out of Scope:** On-chain Anchor escrow program (covered by SOS audit, cross-referenced here)

---

## 1. Project Overview

SolShot is a browser-based multiplayer artillery game (Pocket Tanks style) built on Solana with real SOL wagers. Two players connect via WebSocket, authenticate with Solana wallet signatures, select weapons, take turns firing, and the winner receives 90% of the wagered pot through an on-chain escrow settlement.

**Stack:**
- **Server:** Node.js, Express 4.18.1, Socket.IO 4.5.1, Mongoose/MongoDB, Pino logger
- **Client:** React, Phaser.js (game engine), Solana Wallet Adapter, @solana/web3.js, @solana/spl-token
- **On-Chain:** Anchor 0.32.1 escrow program (program ID: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`)
- **Infrastructure:** Render (server), Vercel (client), Solana devnet

**Scale:** 93 source files, ~36,512 LOC. 22 auditors completed Phase 1 context analysis across all off-chain security domains.

**Audit Tier:** Deep

**SOS Cross-Reference:** The on-chain audit (`.audit/ARCHITECTURE.md`, 6 auditors) confirmed the escrow program itself is correctly implemented -- proper PDA seeds, authority checks, pause guard, BPS arithmetic, winner-gets-remainder lamport conservation. The on-chain program's security posture depends entirely on the off-chain server's authority key and decision-making. This off-chain audit examines whether that trust is warranted.

---

## 2. Component Map

### Server Components

| Component | File | Purpose | LOC | Security Role |
|-----------|------|---------|-----|---------------|
| Socket Handler | `server/socket-io/main.js` | All game events, match lifecycle, settlement | ~1800 | Central authority for all gameplay and financial decisions |
| Auth Middleware | `server/middleware/auth.js` | JWT generation, wallet signature verification | ~80 | Authentication gate (partially bypassed) |
| Escrow Service | `server/services/escrow.js` | Anchor program RPC wrapper | ~200 | On-chain escrow interaction |
| Solana Service | `server/services/solana.js` | Balance checks, settlement dispatch, SHOT emission | ~300 | Financial operations coordinator |
| SHOT Token Service | `server/services/shot-token.js` | Burn verification, supply tracking | ~150 | Prestige economy verification |
| Gold Service | `server/services/gold.js` | In-match gold economy | ~50 | In-game resource management |
| Physics Engine | `server/services/physics.js` | Server-authoritative projectile simulation | ~400 | Game outcome determination |
| User Model | `server/models/User.js` | MongoDB user schema | ~60 | Persistent identity and stats |
| Telegram Bot | `server/services/telegram.js` | Admin notifications | ~100 | Alert pipeline |

### Client Components

| Component | File | Purpose | Security Role |
|-----------|------|---------|---------------|
| WalletContext | `client/src/context/WalletContext.js` | Wallet adapter, transaction signing | Client-side signing authority |
| LobbyScreen | `client/src/screens/LobbyScreen.js` | Match creation, mode selection, wager UI | User input surface |
| BattleScreen | `client/src/screens/BattleScreen.js` | Active gameplay, escrow deposit handling | Real-time game interaction |
| PrestigeScreen | `client/src/screens/PrestigeScreen.js` | SHOT burn for tier advancement | Token burn initiation |
| App.js | `client/src/App.js` | Root component, reconnect logic | Session lifecycle |

### State Architecture

All gameplay, economic, and session state resides in-memory on the server in uncoordinated Maps and Objects:

| State Store | Type | Key | Purpose | Persistence |
|-------------|------|-----|---------|-------------|
| `rooms` | Object | roomId | Match state, players, weapons, terrain | None (lost on restart) |
| `wagerStates` | Map | roomId | Wager amounts, escrow status per match | None |
| `playerGold` | Map | socketId | In-match gold balances | None |
| `authenticatedWallets` | Map | socketId | Wallet address bindings | None |
| `pendingReconnects` | Map | walletAddress | Disconnected player state for 30s rejoin | None |
| `disconnectTimers` | Map | walletAddress | Reconnect countdown timers | None |
| `turnTimers` | Map | roomId | 60s per-turn countdown | None |
| `failedSettlements` | Array | index | Settlement retry queue | None (lost on restart) |
| `verifiedBurnTxs` | Set | txSignature | Burn transaction replay protection | None (lost on restart) |
| `shotSupply` | Object | - | SHOT token emission tracking | None |

**Critical observation:** Every piece of financial state -- wagers, deposits, settlements, failed settlements, burn verifications -- is ephemeral. A server restart during an active wagered match results in total state loss with no recovery path.

---

## 3. Trust Boundaries

```
+===========================================================================+
|                       ZONE 1: UNTRUSTED (Client/Browser)                  |
|                                                                           |
|  - All socket event payloads (angle, power, position, weapon picks)       |
|  - Client-supplied wallet addresses (for non-financial identity)          |
|  - Client-reported escrow deposit confirmations                           |
|  - Client-supplied burn transaction signatures                            |
|  - Client-supplied burnAmount values                                      |
|  - Browser environment (XSS-susceptible, no CSP enforced)                 |
|  - window.socket global (accessible to injected scripts)                  |
|                                                                           |
+=============================== SOCKET.IO =================================+
|                  Transport Boundary (WebSocket / HTTP Upgrade)             |
|                  - express-rate-limit on HTTP (not WS events)             |
|                  - maxHttpBufferSize NOT configured                        |
|                  - No per-event rate limiting                              |
+===========================================================================+
|                                                                           |
|              ZONE 2: PARTIALLY TRUSTED (Server Application)               |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | Authentication Layer (BROKEN)                                      |   |
|  | - auth.js generates JWT but verifyToken() has ZERO call sites      |   |
|  | - Session identity = in-memory socket flag only                    |   |
|  | - 6 gameplay events skip authentication entirely                   |   |
|  | - Signature replay possible within 5-min window (no nonce)         |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | Business Logic Layer (main.js ~1800 LOC)                          |   |
|  | - Match lifecycle: create -> join -> ready -> play -> settle       |   |
|  | - 8+ in-memory state stores (unprotected from async races)        |   |
|  | - withLock() on settlement ONLY -- not deposits, not burns         |   |
|  | - Physics engine trusts whatever position/input is given           |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | Financial Layer (solana.js, escrow.js, shot-token.js)             |   |
|  | - Balance verification fails OPEN on RPC error                    |   |
|  | - 30s balance cache (TOCTOU window)                               |   |
|  | - Settlement computed in SOL floats (not lamports)                 |   |
|  | - Settlement failure -> refund (winner loses winnings)             |   |
|  | - failedSettlements retry queue lost on restart                    |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
+======================= RPC / ANCHOR / MONGOOSE ============================+
|              External Service Boundaries                                  |
+===========================================================================+
|                                                                           |
|              ZONE 3: TRUSTED (On-Chain + Database)                        |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | Solana Escrow Program (on-chain, audited separately)              |   |
|  | - Proper PDA seeds, authority checks, BPS arithmetic              |   |
|  | - Trusts server authority key for settle/cancel decisions         |   |
|  | - Treasury/ops destinations unconstrained (UncheckedAccount)      |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | MongoDB (via Mongoose)                                            |   |
|  | - Schema enforcement on User model                                |   |
|  | - No schema validation on walletAddress format                    |   |
|  | - Stats persistence is fire-and-forget                           |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
+===========================================================================+
```

### Cross-Boundary Data Flows

| Flow | From | To | Crossing | Validation at Boundary |
|------|------|-----|----------|----------------------|
| Wallet authentication | Client | Server | Socket.IO | Signature verified, but no nonce (replay possible) |
| Gameplay events (shoot, move) | Client | Server | Socket.IO | 6 events: NONE. Others: auth flag check only |
| Balance verification | Server | Solana RPC | HTTP/JSON-RPC | Fails OPEN on error -- no validation of failure |
| Escrow creation | Server | Anchor program | Signed TX | Authority signature required (correct) |
| Deposit transaction | Client | Solana chain | Wallet Adapter | Client signs, server sends TX; confirmation uses deprecated API |
| Deposit confirmation | Client | Server | Socket.IO | Client-reported; server does 1 on-chain check with single 2s retry |
| Settlement | Server | Anchor program | Signed TX | withLock prevents double-settle; but no deposit verification |
| Burn verification | Client | Server | Socket.IO | On-chain TX parsed; but burnAmount is client-supplied, 0 passes |
| Stats persistence | Server | MongoDB | Mongoose | Fire-and-forget; match result (winner/tx) never written |

---

## 4. API Surface Map

### Socket.IO Events (Server-Handled)

#### Financial Events (Wager/Settlement Path)

| Event | Authentication | Input Validation | Rate Limited | Financial Impact |
|-------|---------------|-----------------|-------------|-----------------|
| `createRoom` | Wallet signature | Mode/wager validated | HTTP-level only | Creates escrow PDA, locks wager |
| `joinRoom` | Wallet signature | Room existence check | HTTP-level only | Joins escrow, triggers deposit |
| `joinQueue` | Wallet signature | Mode validated | **NOT rate limited** | **NO balance check** -- enters wagered match |
| `escrowDepositConfirm` | Socket auth flag | txSignature format: **NONE** | No | Confirms deposit, enables match start |
| `prestigeBurn` | Socket auth flag | burnAmount: **NONE (0 passes)** | No | Burns SHOT tokens for tier upgrade |

#### Gameplay Events (Match Integrity Path)

| Event | Authentication | Input Validation | Rate Limited |
|-------|---------------|-----------------|-------------|
| `shoot` | **NONE** | Angle/power: no bounds check | No |
| `giveTurn` | **NONE** | Arbitrary payload relayed | No |
| `weaponPick` | **NONE** | No ownership verification | No |
| `weaponChange` | **NONE** | No ownership verification | No |
| `angleChange` | **NONE** | No bounds check | No |
| `powerChange` | **NONE** | No bounds check | No |
| `positionUpdate` | Socket auth flag | 400px tolerance (exploitable at 30/sec) | No |
| `createWeaponArray` | Socket auth flag | **No host-only check** | No |
| `requestTerrain` | Socket auth flag | **No duplicate guard** | No |

#### Session Events

| Event | Authentication | Input Validation | Rate Limited |
|-------|---------------|-----------------|-------------|
| `authenticate` | Wallet signature | 5-min window, no nonce | HTTP-level only |
| `rejoinRoom` | Wallet signature | **No pre-existing binding check** | No |
| `ready` | Socket auth flag | **Doesn't check deposit status** | No |
| `shopDone` | Socket auth flag | **Doesn't validate room membership** | No |
| `playAgainRequest` | Socket auth flag | Room check only | No |
| `broadcastRooms` | Socket auth flag | N/A | No |

#### Summary Statistics

- **Total server-handled events:** ~20+
- **Events with NO authentication:** 6 (all gameplay-critical)
- **Events with NO input validation:** 14+
- **Events with per-event rate limiting:** 0
- **Events with financial impact and missing guards:** 3 (joinQueue, escrowDepositConfirm, prestigeBurn)

### HTTP Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/verify` | POST | None (generates JWT) | Wallet signature verification |
| `/api/telegram/webhook` | POST | HMAC (timing-unsafe) | Telegram bot webhook |
| Express static | GET | None | Client serving |

### Client-to-Chain Direct Interactions

| Action | Signer | Transaction Type | Server Involvement |
|--------|--------|-----------------|-------------------|
| Escrow deposit | Player wallet | System Program transfer | Server builds TX, client signs and sends |
| SHOT burn | Player wallet | SPL Token burn | Client builds IX, signs, sends; server verifies after |

---

## 5. Critical Invariants

| # | Invariant | Expected State | Actual State | Violating Code | Impact |
|---|-----------|---------------|-------------|----------------|--------|
| I-1 | Players must have sufficient SOL before entering wagered match | ENFORCED | **NOT ENFORCED** | `main.js:990-993,1145-1148` (fails open), `main.js:1213-1389` (joinQueue: no check at all) | Zero-SOL wallets enter wagered matches |
| I-2 | Both deposits must be confirmed before match starts | ENFORCED | **NOT ENFORCED** | `ready` event doesn't check deposit status; `fire` handler settles regardless | Match can proceed and settle with one or zero deposits |
| I-3 | Each match settled exactly once | ENFORCED | **PARTIALLY** | `withLock` on settlement exists, but TOCTOU between disconnect handler and fire handler | Double-settlement theoretically possible under race |
| I-4 | Winner receives their winnings (not a refund) | ENFORCED | **NOT ENFORCED** | `handleSettlementFailure` calls `cancelMatchEscrow` (refund) instead of retrying settlement | Settlement failure = winner loses their winnings |
| I-5 | SHOT emissions respect 7M supply cap | ENFORCED | **PARTIALLY** | Non-atomic check-then-credit; race condition between concurrent matches | Oversupply possible under concurrent settlement |
| I-6 | Prestige burns are tier-specific and non-repeatable | ENFORCED | **PARTIALLY** | No per-wallet lock on prestigeBurn; burnAmount=0 bypass | Double-unlock via concurrent events; free tier advance |
| I-7 | All gameplay events require authentication | ENFORCED | **PARTIALLY** | 6 events (shoot, giveTurn, weaponPick, weaponChange, angleChange, powerChange) skip auth | Unauthenticated players can influence match outcomes |
| I-8 | Server is authoritative on player position | ENFORCED | **NOT ENFORCED** | `positionUpdate` 400px tolerance at 30 events/sec = 12,000 px/sec drift | Client dictates tank positioning |
| I-9 | Weapon selection is fair and randomized | ENFORCED | **NOT ENFORCED** | `createWeaponArray` has no host-only guard; non-host overwrites weapon pool | Any player can control weapon selection |
| I-10 | Rematch preserves original wager terms | ENFORCED | **NOT ENFORCED** | `playAgainRequest` preserves `wagerStates` but creates no new escrow, no deposits | Rematch plays with phantom wager (no real money at stake, settlement hits closed PDA) |

---

## 6. Critical Assumptions

| # | Assumption | Made By | Validation Status | Evidence |
|---|-----------|---------|------------------|----------|
| A-1 | Solana RPC is always available for balance checks | `solana.js` balance verification | **CONTRADICTED** | `verifyBalance()` rejection caught and execution continues (fails open) |
| A-2 | Both players deposit before match starts | Match lifecycle in `main.js` | **UNVALIDATED** | `ready` event does not check `wagerStates[roomId]` deposit flags |
| A-3 | Server stays running between match start and settlement | All in-memory state stores | **UNVALIDATED** | Zero persistence; 8+ Maps/Objects with financial data lost on restart |
| A-4 | Client sends valid data types and ranges | All socket event handlers | **UNVALIDATED** | No runtime type checking; no schema validation on any payload |
| A-5 | Players authenticate before playing | Gameplay event handlers | **PARTIALLY VALIDATED** | Financial events check auth flag; 6 relay events do not |
| A-6 | Room IDs are unpredictable | Room creation in `main.js` | **VALIDATED (weak)** | CSPRNG generation, but only 32-bit space (4.3B possibilities) |
| A-7 | Settlement math preserves intended split | `solana.js` settlement | **CONTRADICTED** | Off-chain calculation uses SOL floats (precision loss); on-chain BPS math is correct but receives server-computed values |
| A-8 | JWT provides session identity | `auth.js` | **CONTRADICTED** | `verifyToken()` has zero call sites; JWT is generated but never consumed |
| A-9 | Transaction confirmations are reliable | `escrow.js` deposit confirmation | **PARTIALLY VALIDATED** | Uses deprecated `confirmTransaction` signature-string form (no blockhash expiry); single 2s retry insufficient |
| A-10 | Failed settlements are retried until resolved | `failedSettlements` array | **CONTRADICTED** | In-memory only; 5 retries then abandoned; lost entirely on restart |

---

## 7. Cross-Cutting Concerns

### 7.1 Intersection Analysis

#### Intersection 1: Authentication x Financial Flow

**Finding:** The authentication system is structurally broken -- JWT is generated but never verified (`verifyToken()` has zero call sites), and 6 gameplay events execute without any authentication check. Combined with balance verification that fails open on RPC error, this creates a path where an adversary can:

1. Connect a socket without authenticating
2. Send `shoot`, `giveTurn`, and other relay events to influence an in-progress wagered match
3. Or: authenticate with any wallet during RPC outage, pass the failing-open balance check, enter a wagered match with zero SOL

**Severity:** CRITICAL. This intersection directly enables fund loss -- either through unauthorized match manipulation or wagered matches without backing funds.

**Affected invariants:** I-1 (balance check), I-7 (authentication required)

#### Intersection 2: Race Conditions x Settlement Logic

**Finding:** The server uses `withLock()` to protect settlement, but deposit confirmation and prestige burn have no equivalent protection. The `escrowDepositConfirm` handler and `prestigeBurn` handler can be called concurrently without serialization. Concurrent `prestigeBurn` events with the same `txSignature` can both pass the `verifiedBurnTxs.has()` check before either adds the signature to the Set, resulting in double tier advancement. Similarly, `escrowDepositConfirm` has a single 2s retry for on-chain state verification -- insufficient for Solana slot propagation.

**Severity:** CRITICAL for prestige burns (economic exploit); HIGH for deposit confirmation (match integrity).

**Affected invariants:** I-6 (prestige burns), I-2 (deposit verification)

#### Intersection 3: RPC Trust x Wager Flow

**Finding:** Three compounding weaknesses in the RPC trust boundary:
1. Balance verification cache is 30 seconds (TOCTOU: wallet can be drained between check and deposit)
2. RPC failure causes balance check to fail open (zero-SOL wallets proceed)
3. `joinQueue` skips balance verification entirely

An attacker targeting the RPC layer (public devnet endpoint instability, DNS manipulation, or simply waiting for natural RPC degradation) gains systematic entry to wagered matches. Combined with the 30s cache, even a brief RPC disruption affects all concurrent match entries.

**Severity:** CRITICAL. Three independent failures all favor the attacker.

**Affected invariants:** I-1 (balance check), I-2 (deposits confirmed)

#### Intersection 4: WebSocket Surface x Client-Side Security

**Finding:** The client exposes `window.socket` as a global, making the full WebSocket connection accessible to any JavaScript running in the page. The client deployment on Vercel has no Content Security Policy headers configured. Combined with the 6 unauthenticated relay events, an XSS injection gains:
- Full control of the WebSocket (emit arbitrary events)
- Ability to trigger wallet-signed transactions via `window.solWallet`
- Access to all game state emitted by the server

**Severity:** HIGH. XSS escalation path from cosmetic to financial.

**Affected invariants:** I-7 (authentication), I-8 (server authority on position)

#### Intersection 5: Escrow Lifecycle x Match Flow

**Finding:** The `playAgainRequest` handler preserves `wagerStates` (keeping the wager amount in server memory) but does not create a new escrow PDA or require new deposits. The original escrow PDA was closed during settlement of the first match. When the rematch concludes and the server calls `settleMatch()`, it targets a closed (non-existent) PDA. The settlement fails, triggers `handleSettlementFailure`, which attempts `cancelMatchEscrow` (also fails on closed PDA), enters the `failedSettlements` retry queue, exhausts 5 retries, and the match outcome is permanently lost.

**Severity:** CRITICAL. Winner of rematch receives nothing; match result discarded.

**Affected invariants:** I-4 (winner receives winnings), I-10 (rematch wager terms)

#### Intersection 6: Error Handling x Fund Safety

**Finding:** The error handling pattern across financial operations consistently favors fund loss over fund recovery:
- Settlement failure triggers `cancelMatchEscrow` (refund) instead of retry -- winner loses winnings
- Escrow creation failure is logged but match proceeds without escrow
- Deposit timeout cancel failure is swallowed silently
- `failedSettlements` is in-memory only (lost on restart)
- `refundWager()` called with wrong parameters in LOBBY disconnect handler

**Severity:** HIGH. Systematic pattern where every error path results in fund loss or state corruption.

**Affected invariants:** I-3 (single settlement), I-4 (winner receives winnings)

### 7.2 Shared Vulnerability Patterns

| Pattern | Occurrences | Examples |
|---------|-------------|---------|
| Fail-open on error | 3 | Balance check RPC error, escrow creation failure, deposit timeout cancel |
| Missing authentication | 6 events | shoot, giveTurn, weaponPick, weaponChange, angleChange, powerChange |
| No input validation | 14+ events | No type checking, no range validation, no schema enforcement |
| In-memory-only state | 8+ stores | All financial state lost on restart |
| Race condition susceptibility | 3 | Prestige burn, SHOT supply, deposit confirmation |
| Client-supplied values trusted | 3 | burnAmount, position updates, escrowDepositConfirm |
| Dead security code | 2 | JWT `verifyToken()` never called, `validatePayload` imported but never called |

---

## 8. On-Chain / Off-Chain Boundary Analysis

### SOS Cross-Reference Summary

The on-chain escrow program (audited by 6 SOS auditors) was found to be **correctly implemented** with the following protections:

- PDA seeds `["match", match_id]` with canonical bump storage
- `has_one = authority` on settle and cancel instructions
- Winner validated as `player_one || player_two`
- BPS arithmetic with winner-gets-remainder (lamport conservation)
- State progression guards preventing backward transitions

The on-chain audit identified these **server-trust dependencies**:

| On-Chain Trust Assumption | Off-Chain Reality |
|--------------------------|------------------|
| Server authority key is secure | Single hot-wallet key; no multisig, no rotation |
| Server selects correct winner | Game outcome determined by server physics; 6 unauthenticated events can manipulate outcome |
| Treasury/ops addresses are legitimate | Server passes these as `UncheckedAccount`; no on-chain registry. Off-chain code uses hardcoded program ID |
| Match IDs are globally unique | Server generates with CSPRNG; 32-bit space limits collision resistance |
| Deposits are confirmed before settlement | `ready` event doesn't check; settlement proceeds regardless of deposit status |

### Boundary Crossing Vulnerabilities

```
OFF-CHAIN (Server)                    BOUNDARY                  ON-CHAIN (Program)
========================================================================================

verifyBalance()
  |-- RPC fails --> fails OPEN -----> [NO DEPOSIT] ----------> Escrow PDA exists but
  |-- 30s cache --> stale ---------> [INSUFFICIENT DEPOSIT] -> under-funded or empty

calculateSettlement()
  |-- SOL floats (precision) ------> [INCORRECT AMOUNTS] ----> On-chain BPS math runs
  |-- But amounts are passed ------> [SERVER-COMPUTED] ------> on server-provided values

settleMatch()
  |-- No deposit check ------------> [PREMATURE SETTLE] -----> Program settles Active
  |-- withLock (good) -------------> [SINGLE SETTLE] --------> Account closed (correct)
  |-- Failure --> cancel/refund ---> [WINNER LOSES] ---------> Both players refunded

playAgainRequest()
  |-- No new escrow ---------------> [PHANTOM WAGER] --------> PDA already closed
  |-- Settlement attempted --------> [TX FAILS] -------------> Non-existent account

escrowDepositConfirm()
  |-- Client reports confirmation -> [TRUSTED EVENT] --------> 1 retry, 2s timeout
  |-- No auth on relay events ----> [MANIPULATED MATCH] -----> Legitimate escrow,
                                                                rigged outcome
```

### Key SOS Finding: Server Authority is Single Point of Failure

The on-chain audit's central finding was: **"a single server hot-wallet authority controls all fund-distribution decisions with zero on-chain verification of game outcomes."** This off-chain audit confirms that the server authority is not adequately protected:

1. **No multisig:** Single keypair at `SOLANA_SERVER_KEYPAIR_PATH`
2. **No rotation mechanism:** Hardcoded program ID in `escrow.js:39` (not from env)
3. **Match outcomes are manipulable:** 6 unauthenticated events affect gameplay; position spoofing at 12K px/sec
4. **Settlement decisions are not auditable:** Match results never written to database; `winner` and `settlementTx` fields are permanently null

---

## 9. Risk Heat Map

### Tier 1: CRITICAL -- Active Fund-Loss or Theft Paths

| # | Finding | Auditor Convergence | Attack Complexity | Impact |
|---|---------|--------------------|-------------------|--------|
| C-1 | Balance check fails open on RPC error | 4 auditors (AUTH-03, ERR-01, LOGIC-01, LOGIC-02) | Low (wait for RPC instability) | Zero-SOL wallets enter wagered matches |
| C-2 | joinQueue skips balance verification entirely | 3 auditors (AUTH-03, LOGIC-01, LOGIC-02) | Trivial (use queue instead of room) | Systematic wagered match entry without funds |
| C-3 | Settlement without deposit verification | 1 auditor (LOGIC-02) | Moderate (timing-dependent) | Match settles with partial/no escrow funding |
| C-4 | playAgainRequest creates wagerless rematch | 2 auditors (LOGIC-01, LOGIC-02) | Trivial (trigger rematch) | Winner of rematch receives nothing |
| C-5 | JWT never consumed; session identity is socket flag only | 3 auditors (AUTH-01, SEC-01, DATA-05) | Low (connect any socket) | Entire auth system is decorative |
| C-6 | Signature replay within 5-min window | 3 auditors (AUTH-01, CRYPTO-01, DATA-05) | Low (capture and replay) | Impersonate any wallet that authenticated recently |
| C-7 | 6 socket events execute without authentication | 2 auditors (AUTH-01, AUTH-03) | Trivial (send event) | Unauthenticated match manipulation |
| C-8 | createWeaponArray callable by non-host | 2 auditors (AUTH-03, LOGIC-01) | Trivial (send event) | Weapon selection manipulation |
| C-9 | positionUpdate allows 12,000 px/sec drift | 1 auditor (LOGIC-01) | Low (automated client) | Position-based aimbot |
| C-10 | Prestige burn double-unlock via concurrent events | 1 auditor (ERR-02) | Low (parallel socket sends) | Two tiers for one burn |
| C-11 | escrowDepositConfirm partial deposit attack | 1 auditor (LOGIC-02) | Moderate (slot timing) | Spoofed deposit confirmation |
| C-12 | Hardcoded program ID in escrow.js | 1 auditor (SEC-02) | N/A (operational) | Requires code deploy for rotation |

### Tier 2: HIGH -- Exploitable with Moderate Effort

| # | Finding | Auditor Convergence | Category |
|---|---------|--------------------|----------|
| H-1 | burnAmount=0 bypass (undefined/null/0 passes verification) | 2 auditors | Financial logic |
| H-2 | No wallet account-change handler (silent identity swap) | 1 auditor | Wallet integration |
| H-3 | window.socket global (XSS escalation to wallet signing) | 1 auditor | Client security |
| H-4 | Deprecated confirmTransaction (no blockhash expiry) | 1 auditor | Transaction construction |
| H-5 | 30s balance cache TOCTOU | 2 auditors | Financial logic |
| H-6 | failedSettlements in-memory only (lost on restart) | 1 auditor | Data persistence |
| H-7 | Match result never written to DB (winner/tx null) | 1 auditor | Data persistence |
| H-8 | JWT_SECRET placeholder weak in .env.example | 1 auditor | Secret management |
| H-9 | Telegram bot token absent from render.yaml | 1 auditor | Secret management |
| H-10 | JWT_SECRET in client/.env | 1 auditor | Secret exposure |
| H-11 | Settlement failure -> refund instead of retry | 1 auditor | Error handling |
| H-12 | calculateSettlement uses SOL floats not lamports | 1 auditor | Financial logic |
| H-13 | No CSP on client Vercel deployment | 1 auditor | Web security |
| H-14 | joinQueue not separately throttled | 1 auditor | Rate limiting |
| H-15 | SHOT supply cap race condition (non-atomic check-then-credit) | 1 auditor | Race condition |
| H-16 | Escrow creation failure logged but match proceeds | 1 auditor | Error handling |
| H-17 | refundWager() called with wrong params in LOBBY disconnect | 1 auditor | Error handling |
| H-18 | Deposit timeout cancel failure swallowed | 1 auditor | Error handling |
| H-19 | requestTerrain has no duplicate guard (resets round state) | 1 auditor | Business logic |
| H-20 | giveTurn legacy relay: unauthenticated, arbitrary payload | 2 auditors | Auth / API |
| H-21 | SHOT five_win_streak claimable from practice mode | 1 auditor | Business logic |
| H-22 | Timing-unsafe HMAC comparison in telegram.js | 2 auditors | Cryptography |
| H-23 | escrowDepositConfirm single 2s retry insufficient | 3 auditors | Chain interaction |
| H-24 | rejoinRoom no pre-existing binding requirement | 1 auditor | Authorization |
| H-25 | 3 fragmented RPC Connection objects | 1 auditor | Resource management |
| H-26 | ws 8.2.3 / express 4.18.1 / socket.io 4.5.1 known CVEs | 1 auditor | Dependencies |
| H-27 | nodemon in production dependencies | 1 auditor | Dependencies |
| H-28 | maxHttpBufferSize not set | 2 auditors | WebSocket security |

### Tier 3: MEDIUM-LOW -- Defense-in-Depth Gaps

| # | Finding | Category |
|---|---------|----------|
| M-1 | validatePayload imported but never called (dead validation) | Dead code |
| M-2 | Dual-write inconsistency (User.stats) | Data integrity |
| M-3 | No schema validation on walletAddress in DB | Data integrity |
| M-4 | Fragmented logging (pino bypassed by 45+ console.* calls) | Observability |
| M-5 | Settlement data logged verbatim in plain console | Data exposure |
| M-6 | styleSrc unsafe-inline in CSP | Web security |
| M-7 | trust proxy not configured for Render | Infrastructure |
| M-8 | Settlement timeout too short for long matches (1h on-chain) | Chain interaction |
| M-9 | SOLANA_RPC duplicated in 3 services | Configuration |
| M-10 | 32-bit terrain seed truncation | Randomness |
| M-11 | Room IDs only 32 bits | Randomness |
| M-12 | Re-authentication on same socket not prevented | Authentication |
| M-13 | authenticatedWallets leak during 30s reconnect window | Authentication |
| M-14 | ready event doesn't check deposit status | Business logic |
| M-15 | shopDone doesn't validate room membership | Authorization |
| M-16 | Host tiebreaker advantage in BO3 | Game fairness |
| M-17 | safeHandler swallows errors silently | Error handling |
| M-18 | Double settlement TOCTOU between state check and lock | Race condition |
| M-19 | txSignature no format/length validation before DB write | Injection |
| M-20 | broadcastRooms emits to ALL connected sockets | Information exposure |

### Heat Map Visualization

```
                        FINANCIAL IMPACT
                   Low         Medium        High
              +------------+------------+------------+
    Trivial   | M-15,M-16  | C-7,C-8    | C-2,C-4   |
              | M-19,M-20  | H-19,H-21  | H-1        |
              +------------+------------+------------+
ATTACK  Low   | M-1,M-4    | C-9,C-10   | C-1,C-5   |
EFFORT        | M-11,M-12  | H-3,H-13   | C-6,H-5   |
              | H-27,M-6   | H-20,H-14  | H-11,H-12 |
              +------------+------------+------------+
    Moderate  | M-7,M-10   | H-4,H-22   | C-3,C-11  |
              | M-17,M-2   | H-23,H-25  | H-6,H-7   |
              | M-8,M-9    | H-15,H-28  | H-16,H-17 |
              +------------+------------+------------+
```

---

## 10. Novel Attack Surface Observations

### Attack 1: Queue-to-Escrow Inversion (Griefing at Zero Cost)

**Path:** `joinQueue` (no balance check) -> matched with opponent -> `createMatchEscrow` (server pays TX fee) -> opponent deposits -> attacker's deposit fails (no SOL) -> 2-min timeout -> escrow cancelled -> opponent refunded (minus gas)

**Mechanism:** The `joinQueue` handler validates match mode but performs zero balance verification. The server creates the escrow PDA (paying the transaction fee from its authority wallet), and both players receive deposit requests. The legitimate player deposits; the attacker's deposit never arrives. After the deposit timeout, the server cancels the escrow.

**Impact:** Repeatable griefing. The attacker pays nothing (no authentication cost, no SOL required). The victim loses: (a) gas fees for their deposit transaction, (b) gas fees for the refund, (c) time waiting for timeout. The server loses: escrow creation transaction fees on every griefing attempt.

**Amplification:** Automated with multiple sockets, this becomes a denial-of-service on the matchmaking system.

### Attack 2: playAgain Phantom Wager (Rematch Fund Loss)

**Path:** Win first match legitimately -> trigger `playAgainRequest` -> second match runs with phantom wager (wagerStates preserved, no new escrow) -> win second match -> server calls `settleMatch` on closed PDA -> TX fails -> `handleSettlementFailure` -> `cancelMatchEscrow` fails -> enters `failedSettlements` -> 5 retries exhaust -> match outcome permanently lost

**Mechanism:** The `playAgainRequest` handler at `main.js:2498-2560` copies the room configuration including wager states but does not invoke `createMatchEscrow`. The original PDA was closed by the Anchor `close` constraint during first-match settlement. The server's in-memory `wagerStates` still contains the wager amount, so it attempts settlement -- targeting a non-existent account.

**Impact:** The winner of the rematch receives nothing. The match result is lost (never written to DB). Both players' time is wasted. If the loser was the attacker, they successfully denied the winner any payout.

### Attack 3: Position Drift Aimbot (Gameplay Manipulation for Financial Gain)

**Path:** Connect to wagered match -> send `positionUpdate` events at 30/sec with 400px deltas -> drift tank 12,000 px/sec to optimal firing position -> send `shoot` with optimal angle/power from spoofed position -> server-authoritative physics computes trajectory from accepted position -> guaranteed max damage

**Mechanism:** The `positionUpdate` handler accepts movements up to 400px per event. At the default Socket.IO tick rate (~30 events/sec), this allows 12,000 px/sec movement. The intended game speed is ~320 px/sec. The server physics engine uses the last accepted position as the projectile origin.

**Impact:** In wagered matches, this translates directly to financial advantage. The attacker can position their tank at the optimal firing angle for every shot, guaranteeing maximum damage output. Combined with weapon selection manipulation (`createWeaponArray` has no host check), the attacker controls both positioning and arsenal.

### Attack 4: RPC Denial-of-Balance (Systematic Wager Theft)

**Path:** Wait for Solana devnet RPC instability (or actively trigger it) -> all `verifyBalance()` calls fail -> all failures caught and execution continues -> zero-SOL wallets enter wagered matches via `createRoom`/`joinRoom` -> legitimate opponents deposit into escrow -> attacker plays match (can also use position drift) -> if attacker wins, settlement pays out from opponent's deposit; if attacker loses, their refund path also fails (no SOL to return)

**Mechanism:** Both `createRoom` (`main.js:990-993`) and `joinRoom` (`main.js:1145-1148`) catch `verifyBalance()` rejections and fall through to match creation. During any RPC disruption (natural devnet instability, rate limiting on public RPC endpoints, or DNS-level interference), ALL balance checks fail open simultaneously.

**Impact:** Systematic entry into wagered matches without any SOL. The attacker risks nothing. The opponent risks their entire wager. This is amplified by the 30s balance cache (even brief RPC disruptions affect matches for 30 seconds after recovery).

### Attack 5: Concurrent Prestige Double-Unlock (Economic Exploit)

**Path:** Build and submit a single SHOT burn transaction on-chain -> receive `txSignature` -> simultaneously emit two `prestigeBurn` socket events with the same `{ txSignature, burnAmount }` -> both events hit handler before either adds signature to `verifiedBurnTxs` Set -> both pass `verifiedBurnTxs.has()` check -> both call `verifyBurnTransaction()` (on-chain read succeeds for both) -> both add to Set (idempotent) -> both call `prestigeBurn(wallet)` -> advance two tiers

**Mechanism:** The `verifiedBurnTxs` Set is checked and updated non-atomically. JavaScript's event loop processes socket events asynchronously, and the `verifyBurnTransaction()` call involves an async RPC read. Between the `.has()` check and the `.add()` update, the second event can pass the same check.

**Impact:** Advance two prestige tiers for the cost of one burn. Repeatable: each burn transaction can be used twice, halving the total SHOT cost to reach Diamond tier. This devalues the prestige system and any associated privileges.

### Attack 6: Settlement Denial-of-Winnings (Winner Grief)

**Path:** Enter legitimate wagered match -> lose the match -> server attempts settlement during Solana RPC congestion -> `settleMatchEscrow()` fails (timeout, RPC error) -> `handleSettlementFailure` calls `cancelMatchEscrow()` -> both players refunded -> winner denied their 90% payout

**Mechanism:** The server's settlement error handling at `main.js:~580-685` treats settlement failure as unrecoverable and falls back to cancellation (full refund to both players). The winner, who legitimately won the match, receives only their original wager back instead of the 90% pot. The `failedSettlements` retry mechanism exists but: (a) has only 5 retries, (b) is in-memory only (lost on restart), and (c) the cancel may succeed before retries complete.

**Impact:** The losing player effectively converts a loss into a draw (gets their wager back). This can be passively triggered by Solana network congestion during settlement, or actively encouraged by timing matches to settle during known high-congestion periods. No active exploit required -- just unfavorable RPC timing.

---

## 11. Data Flow Analysis

### Flow 1: Wager Match Entry

```
CLIENT                          SERVER                         SOLANA
  |                               |                              |
  |-- authenticate(wallet,sig) -->|                              |
  |                               |-- verifySignature(sig) ----->|
  |                               |<---- valid/invalid ---------|
  |                               |-- [sets socket auth flag] ---|
  |                               |                              |
  |-- createRoom(mode,wager) ---->|                              |
  |                               |-- verifyBalance(wallet) ---->|
  |                               |<---- balance / ERROR --------|
  |                               |   [ERROR: falls through!]    |
  |                               |                              |
  |                               |-- createMatchEscrow() ------>|
  |                               |<---- PDA created ------------|
  |                               |   [FAILURE: logged, match    |
  |                               |    proceeds anyway!]         |
  |                               |                              |
  |<-- escrowDeposit(base64 tx) --|                              |
  |                               |                              |
  |-- [wallet signs tx] -------->|                              |
  |-- [send to chain] ----------------------------------------->|
  |<---- tx confirmed ------------------------------------------|
  |                               |                              |
  |-- escrowDepositConfirm(sig)->|                              |
  |                               |-- getEscrowState(PDA) ------>|
  |                               |<---- state / ERROR ---------|
  |                               |   [1 retry, 2s timeout]     |
  |                               |-- [mark deposit confirmed]   |
  |                               |                              |
  |-- ready ------------------- ->|   [NO deposit check!]       |
  |                               |-- [match starts] ------------|
```

**Trust boundary violations:**
- Balance check (Server->RPC): Fails open on error
- Escrow creation (Server->Chain): Failure ignored, match proceeds
- Deposit confirmation (Client->Server): Client-reported event, insufficient on-chain verification
- Ready event (Client->Server): No deposit status check before starting match

### Flow 2: Match Settlement

```
CLIENT                          SERVER                         SOLANA
  |                               |                              |
  |-- shoot(angle, power) ------->|   [NO AUTH CHECK]           |
  |                               |-- calculatePhysics() -------|
  |                               |-- isMatchOver() ------------|
  |                               |                              |
  |                               |-- transitionState(SETTLING) |
  |                               |-- withLock(roomId) ---------|
  |                               |                              |
  |                               |-- calculateSettlement() ----|
  |                               |   [USES SOL FLOATS!]        |
  |                               |   [NOT LAMPORT INTEGERS]    |
  |                               |                              |
  |                               |-- settleMatchEscrow() ------>|
  |                               |   [authority signs]          |
  |                               |<---- settled / ERROR --------|
  |                               |                              |
  |                               |   IF ERROR:                  |
  |                               |   -- cancelMatchEscrow() --->|
  |                               |   [WINNER LOSES WINNINGS]    |
  |                               |                              |
  |                               |-- emitShotReward() ---------|
  |                               |   [non-atomic supply check] |
  |                               |                              |
  |<-- matchSettled(result) ------|                              |
  |                               |                              |
  |                               |-- persistStats() ----------->| MongoDB
  |                               |   [fire-and-forget]          |
  |                               |   [winner: null, tx: null!]  |
```

**Trust boundary violations:**
- Shoot event (Client->Server): No authentication check
- Settlement calculation (Server internal): SOL float precision loss
- Settlement failure (Server->Chain): Falls back to cancel (refund) instead of retry
- Stats persistence (Server->DB): Winner and TX never written; fire-and-forget

### Flow 3: Prestige Burn

```
CLIENT                          SERVER                         SOLANA
  |                               |                              |
  |-- [build burn IX] ----------------------------------------->|
  |-- [wallet signs] ------------------------------------------>|
  |<---- tx confirmed, txSignature -----------------------------|
  |                               |                              |
  |-- prestigeBurn(sig, amount) ->|                              |
  |                               |-- verifiedBurnTxs.has(sig)? |
  |                               |   [RACE: concurrent events  |
  |                               |    both pass this check!]   |
  |                               |                              |
  |                               |-- verifyBurnTransaction() ->|
  |                               |   [checks mint, signer]     |
  |                               |<---- parsed TX -------------|
  |                               |                              |
  |                               |   [burnAmount from CLIENT!] |
  |                               |   [0/null/undefined passes!]|
  |                               |                              |
  |                               |-- verifiedBurnTxs.add(sig)  |
  |                               |-- prestigeBurn(wallet) ------|
  |                               |   [advances tier]            |
  |                               |-- deductShotBalance() ------|
  |                               |   [in-memory only]           |
  |                               |                              |
  |<-- prestigeUpdated(tier) ----|                              |
```

**Trust boundary violations:**
- burnAmount (Client->Server): Client-supplied, not extracted from on-chain TX; 0 passes
- Replay protection (Server internal): Non-atomic Set check allows concurrent bypass
- Balance deduction (Server internal): In-memory only, lost on restart

### Flow 4: Queue Matchmaking

```
CLIENT A                        SERVER                        CLIENT B
  |                               |                              |
  |-- joinQueue(mode, wager) ---->|                              |
  |                               |   [NO BALANCE CHECK!]       |
  |                               |   [validateMatchMode only]  |
  |                               |                              |
  |                               |<-- joinQueue(mode, wager) ---|
  |                               |   [NO BALANCE CHECK!]       |
  |                               |                              |
  |                               |-- matchPlayers(A, B) -------|
  |                               |-- createRoom(server-side) --|
  |                               |-- createMatchEscrow() ----->| Solana
  |                               |                              |
  |<-- escrowDeposit(tx) --------|-- escrowDeposit(tx) -------->|
  |                               |                              |
  |   [Player A: 0 SOL,           |                              |
  |    deposit TX fails silently] |                              |
  |                               |<-- escrowDepositConfirm ----|
  |                               |   [Only B deposited]        |
  |                               |                              |
  |-- ready --------------------->|   [NO deposit check!]       |
  |                               |<-- ready -------------------|
  |                               |-- [match starts with only   |
  |                               |    one player's funds]      |
```

**Trust boundary violations:**
- Queue entry (Client->Server): Zero balance verification for either player
- Match creation (Server internal): Proceeds even if only one player can deposit
- Ready (Client->Server): No deposit confirmation check before match start

### Flow 5: Reconnect

```
CLIENT (new socket)             SERVER                        STATE STORES
  |                               |                              |
  |   [original socket drops]     |                              |
  |                               |-- setTimeout(30s) ---------->| disconnectTimers
  |                               |-- save state --------------->| pendingReconnects
  |                               |   [wallet -> full state]     |
  |                               |                              |
  |   [authenticatedWallets       |                              |
  |    entry preserved for 30s    |                              |
  |    LEAK: old socketId still   |                              |
  |    maps to wallet address]    |                              |
  |                               |                              |
  |-- rejoinRoom(wallet,msg,sig)->|                              |
  |                               |-- verifySignature(sig) ------|
  |                               |   [NO pre-existing binding  |
  |                               |    requirement!]             |
  |                               |                              |
  |                               |-- remap all state stores:   |
  |                               |   rooms[].players            |
  |                               |   playerGold                 |
  |                               |   authenticatedWallets       |
  |                               |   wagerStates               |
  |                               |   turnTimers                |
  |                               |   [old socketId -> new]     |
  |                               |                              |
  |<-- reconnected(full state) ---|                              |
```

**Trust boundary violations:**
- rejoinRoom (Client->Server): No requirement that the wallet was previously bound to the disconnected session. Any wallet that can produce a valid signature can claim any pending reconnect session.
- State migration (Server internal): All state stores remapped in sequence (not atomic); interrupted migration could leave inconsistent state.
- authenticatedWallets leak: Old socketId mapping persists during 30s window, potentially allowing the old socketId to be reused if Socket.IO reassigns it.

---

## 12. Deduplicated Finding Summary

### By Severity

| Severity | Count | Financial Impact | Auth/Access Impact | Data/Integrity Impact |
|----------|-------|-----------------|-------------------|---------------------|
| CRITICAL | 12 | 7 (C-1,2,3,4,10,11,12) | 4 (C-5,6,7,8) | 1 (C-9) |
| HIGH | 28 | 11 (H-1,4,5,6,11,12,15,16,17,18,23) | 5 (H-2,20,22,24,28) | 12 (H-3,7,8,9,10,13,14,19,21,25,26,27) |
| MEDIUM | 20 | 2 (M-14,18) | 4 (M-1,12,13,15) | 14 (M-2,3,4,5,6,7,8,9,10,11,16,17,19,20) |
| **Total** | **60** | **20** | **13** | **27** |

### By Category

| Category | Critical | High | Medium | Total |
|----------|----------|------|--------|-------|
| Authentication (AUTH) | 4 | 2 | 3 | 9 |
| Authorization (AUTH-03) | 2 | 2 | 1 | 5 |
| Financial Logic (LOGIC-02) | 4 | 5 | 1 | 10 |
| Business Logic (LOGIC-01) | 2 | 3 | 2 | 7 |
| Error Handling (ERR) | 0 | 4 | 1 | 5 |
| Race Conditions (ERR-02) | 1 | 1 | 1 | 3 |
| Chain Interaction (CHAIN) | 1 | 4 | 1 | 6 |
| Secret Management (SEC) | 1 | 3 | 0 | 4 |
| Data Persistence (DATA) | 0 | 2 | 4 | 6 |
| Web Security (WEB) | 0 | 1 | 2 | 3 |
| Dependencies (DEP) | 0 | 2 | 0 | 2 |
| Injection (INJ) | 0 | 0 | 2 | 2 |
| Cryptography (CRYPTO) | 0 | 1 | 1 | 2 |
| API/WebSocket (API) | 0 | 1 | 1 | 2 |

### Auditor Convergence (findings flagged by 3+ auditors)

| Finding | Auditors | Severity | Convergence Signal |
|---------|----------|----------|--------------------|
| Balance check fails open on RPC error | 4 (AUTH-03, ERR-01, LOGIC-01, LOGIC-02) | CRITICAL | Highest convergence -- 4 independent auditors identified this |
| joinQueue skips balance verification | 3 (AUTH-03, LOGIC-01, LOGIC-02) | CRITICAL | Strong convergence across auth and logic domains |
| JWT never consumed | 3 (AUTH-01, SEC-01, DATA-05) | CRITICAL | Cross-domain agreement that auth is decorative |
| Signature replay in 5-min window | 3 (AUTH-01, CRYPTO-01, DATA-05) | CRITICAL | Crypto, auth, and data auditors all flagged |
| escrowDepositConfirm 2s retry insufficient | 3 (CHAIN-01, ERR-01, LOGIC-01) | HIGH | Chain, error, and logic auditors converged |

### Master Finding Index

| ID | Severity | Title | Primary Category | Intersection |
|----|----------|-------|-----------------|-------------|
| C-1 | CRITICAL | Balance check fails open on RPC error | LOGIC-02 | Auth x Financial |
| C-2 | CRITICAL | joinQueue skips balance verification | LOGIC-02 | Auth x Financial |
| C-3 | CRITICAL | Settlement without deposit verification | LOGIC-02 | Escrow x Match |
| C-4 | CRITICAL | playAgainRequest creates wagerless rematch | LOGIC-01 | Escrow x Match |
| C-5 | CRITICAL | JWT never consumed (decorative auth) | AUTH-01 | Auth x Financial |
| C-6 | CRITICAL | Signature replay within 5-min window | CRYPTO-01 | Auth x Crypto |
| C-7 | CRITICAL | 6 socket events without authentication | AUTH-01 | Auth x Gameplay |
| C-8 | CRITICAL | createWeaponArray callable by non-host | AUTH-03 | Auth x Gameplay |
| C-9 | CRITICAL | positionUpdate 12,000 px/sec drift | LOGIC-01 | Input x Physics |
| C-10 | CRITICAL | Prestige burn double-unlock race | ERR-02 | Race x Financial |
| C-11 | CRITICAL | escrowDepositConfirm partial deposit | LOGIC-02 | Chain x Match |
| C-12 | CRITICAL | Hardcoded program ID in escrow.js | SEC-02 | Config x Operations |
| H-1 | HIGH | burnAmount=0 bypass | LOGIC-02 | Input x Financial |
| H-2 | HIGH | No wallet account-change handler | CHAIN-03 | Wallet x Identity |
| H-3 | HIGH | window.socket global XSS escalation | CHAIN-03 | Client x Auth |
| H-4 | HIGH | Deprecated confirmTransaction form | CHAIN-01 | Chain x Reliability |
| H-5 | HIGH | 30s balance cache TOCTOU | LOGIC-02 | Cache x Financial |
| H-6 | HIGH | failedSettlements in-memory only | DATA-01 | Persistence x Financial |
| H-7 | HIGH | Match result never written to DB | DATA-01 | Persistence x Audit |
| H-8 | HIGH | JWT_SECRET placeholder weak | SEC-02 | Config x Auth |
| H-9 | HIGH | Telegram bot token absent from render.yaml | SEC-02 | Config x Ops |
| H-10 | HIGH | JWT_SECRET in client/.env | SEC-02 | Exposure x Auth |
| H-11 | HIGH | Settlement failure -> refund not retry | LOGIC-02 | Error x Financial |
| H-12 | HIGH | calculateSettlement SOL floats | LOGIC-02 | Arithmetic x Financial |
| H-13 | HIGH | No CSP on client deployment | WEB-02 | Client x XSS |
| H-14 | HIGH | joinQueue not throttled | ERR-03 | Rate limit x DoS |
| H-15 | HIGH | SHOT supply cap race condition | LOGIC-02 | Race x Economic |
| H-16 | HIGH | Escrow creation failure ignored | ERR-01 | Error x Financial |
| H-17 | HIGH | refundWager wrong params in disconnect | ERR-01 | Error x Financial |
| H-18 | HIGH | Deposit timeout cancel swallowed | ERR-01 | Error x Financial |
| H-19 | HIGH | requestTerrain no duplicate guard | LOGIC-01 | Input x State |
| H-20 | HIGH | giveTurn unauthenticated relay | AUTH-03 | Auth x Gameplay |
| H-21 | HIGH | SHOT streak claimable from practice | LOGIC-01 | Mode x Economic |
| H-22 | HIGH | Timing-unsafe HMAC in telegram.js | AUTH-01 | Crypto x API |
| H-23 | HIGH | escrowDepositConfirm 2s retry | CHAIN-01 | Chain x Reliability |
| H-24 | HIGH | rejoinRoom no binding requirement | AUTH-03 | Auth x Session |
| H-25 | HIGH | 3 fragmented RPC Connection objects | CHAIN-02 | Resource x Config |
| H-26 | HIGH | Known CVEs in ws/express/socket.io | DEP-01 | Dependencies |
| H-27 | HIGH | nodemon in production dependencies | DEP-01 | Dependencies |
| H-28 | HIGH | maxHttpBufferSize not set | API-03 | WebSocket x DoS |
| M-1 | MEDIUM | validatePayload dead code | INJ-05 | Dead code |
| M-2 | MEDIUM | Dual-write inconsistency User.stats | DATA-01 | Persistence |
| M-3 | MEDIUM | No schema validation walletAddress | DATA-01 | Input x DB |
| M-4 | MEDIUM | Fragmented logging (45+ console.*) | DATA-04 | Observability |
| M-5 | MEDIUM | Settlement data in plain console | DATA-04 | Exposure |
| M-6 | MEDIUM | styleSrc unsafe-inline | WEB-02 | CSP |
| M-7 | MEDIUM | trust proxy not configured | WEB-02 | Infrastructure |
| M-8 | MEDIUM | Settlement timeout too short | CHAIN-06 | Chain timing |
| M-9 | MEDIUM | SOLANA_RPC duplicated in 3 services | SEC-02 | Configuration |
| M-10 | MEDIUM | 32-bit terrain seed truncation | DATA-05 | Randomness |
| M-11 | MEDIUM | Room IDs only 32 bits | CRYPTO-01 | Randomness |
| M-12 | MEDIUM | Re-authentication not prevented | AUTH-01 | Session |
| M-13 | MEDIUM | authenticatedWallets 30s leak | AUTH-01 | Session |
| M-14 | MEDIUM | ready event no deposit check | LOGIC-01 | Match flow |
| M-15 | MEDIUM | shopDone no room membership check | LOGIC-01 | Authorization |
| M-16 | MEDIUM | Host tiebreaker advantage BO3 | LOGIC-01 | Fairness |
| M-17 | MEDIUM | safeHandler swallows errors | ERR-01 | Observability |
| M-18 | MEDIUM | Double settlement TOCTOU | ERR-02 | Race condition |
| M-19 | MEDIUM | txSignature no format validation | INJ-01 | Input x DB |
| M-20 | MEDIUM | broadcastRooms to ALL sockets | API-03 | Info exposure |

---

## Appendix A: Methodology

This document synthesizes findings from 22 parallel Phase 1 context audits, each examining a specific security domain:

| # | Auditor Focus | Domain |
|---|--------------|--------|
| 01 | SEC-01 | Private key / wallet security |
| 02 | SEC-02 | Secret / credential management |
| 03 | AUTH-01 | Authentication mechanisms |
| 04 | AUTH-03 | Authorization / access control |
| 05 | INJ-01 | NoSQL injection |
| 06 | INJ-05 | Prototype pollution |
| 07 | WEB-02 | CORS / CSP headers |
| 08 | CHAIN-01 | Transaction construction |
| 09 | CHAIN-02 | RPC client management |
| 10 | CHAIN-03 | Wallet adapter integration |
| 11 | CHAIN-06 | PDA interaction patterns |
| 12 | API-03 | WebSocket security |
| 13 | DATA-01 | Database security |
| 14 | DATA-04 | Logging practices |
| 15 | DATA-05 | Encryption / hashing |
| 16 | DEP-01 | Dependency vulnerabilities |
| 17 | ERR-01 | Error handling patterns |
| 18 | ERR-02 | Race conditions |
| 19 | ERR-03 | Rate limiting |
| 20 | CRYPTO-01 | RNG / randomness |
| 21 | LOGIC-01 | Business logic |
| 22 | LOGIC-02 | Financial logic |

Findings were deduplicated across auditors. Where multiple auditors identified the same issue from different perspectives, the finding was merged and auditor convergence noted as a signal of severity validation.

## Appendix B: SOS (On-Chain) Audit Cross-Reference

The on-chain audit identified 8 deduplicated findings. The intersection points between on-chain and off-chain findings are:

| On-Chain Finding | Off-Chain Amplifier | Combined Risk |
|-----------------|---------------------|---------------|
| Treasury/ops UncheckedAccount (CRITICAL) | Hardcoded program ID; no rotation mechanism | Server compromise = permanent fee redirection |
| Authority can cancel Active matches (HIGH) | Settlement failure -> cancel/refund pattern | Legitimate winner denied winnings via error path |
| Single admin key / no multisig (HIGH) | Server hot wallet as sole authority | Single key compromise = total fund control |
| Winner UncheckedAccount (HIGH) | 6 unauthenticated events manipulate game outcome | Rigged match -> attacker selected as winner |
| Terminal states not written (MEDIUM) | Match result never written to DB either | No audit trail on either layer |
| CEI violation in deposit (MEDIUM) | escrowDepositConfirm accepts client-reported event | Both layers have deposit verification gaps |

---

**This document synthesizes findings from 22 parallel context audits plus SOS on-chain cross-reference.**
**Use this as the foundation for attack strategy generation in Phase 3.**
