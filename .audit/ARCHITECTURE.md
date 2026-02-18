# Unified Architectural Understanding

**Project:** SolShot
**Generated:** 2026-02-14
**Source:** The Fortress Phase 2 Synthesis (10 parallel context auditors)

---

## Executive Summary

SolShot is a browser-based multiplayer artillery game (Pocket Tanks clone) built on Phaser.js (client) with a Node.js/Express/Socket.IO backend and a Solana integration layer for wallet authentication and SOL wager settlement. The server processes all game logic server-side (physics, damage, Gold economy, SHOT token emissions) but performs **virtually zero input validation** on any socket event payload, **no authentication enforcement** on gameplay events, and **no authorization checks** on privileged operations like room deletion.

The architecture has three fundamental security failures that pervade every subsystem: (1) **The validation layer is absent** -- socket payloads pass directly from untrusted clients into state mutations, physics calculations, and economic operations. (2) **Authentication is decorative** -- wallet signature verification exists but is optional, JWT tokens are generated but never validated, and wallet addresses in gameplay payloads override authenticated identities. (3) **Concurrency is unmanaged** -- all 8 in-memory state stores are mutated by async handlers without locks, creating double-settlement race conditions that would cause direct fund loss if real SOL transfers were implemented.

The SOL settlement system is currently a stub (returns `success: true` without on-chain execution), which masks the severity of the wager logic bugs. When real escrow is implemented, the existing codebase has at least 4 distinct paths to double-pay or zero-pay outcomes. The SHOT token system has no supply cap enforcement and can be infinitely farmed by colluding players. All economic state is ephemeral -- a server restart wipes balances, milestones, prestige tiers, and active wagers with no recovery mechanism.

---

## System Overview

### Core Components

| Component | Purpose | Location | Security Role |
|-----------|---------|----------|---------------|
| Express HTTP Server | Static endpoints, health, stats | `server/index.js` | Exposes unauthenticated financial data |
| Socket.IO Server | Real-time game events (27 event types) | `server/socket-io/main.js` | Primary attack surface (1058 LOC, zero validation) |
| Auth Middleware | Wallet signature verification, JWT | `server/middleware/auth.js` | Optional, never enforced post-authenticate |
| Physics Engine | Ballistic trajectory, damage calculation | `server/services/physics.js` | Trusts all inputs (angle, power, startX/Y) |
| Match State Machine | Game state transitions (LOBBY→BATTLE→COMPLETE) | `server/services/match.js` | Transitions exist but return values are universally ignored |
| Solana Service | Balance verification, settlement | `server/services/solana.js` | Settlement is a stub; balance check fails open |
| Gold Service | Per-match Gold economy | `server/services/gold.js` | All state in-memory, no persistence |
| SHOT Token Service | Milestone emissions, prestige burns | `server/services/shot-token.js` | No supply cap, no deduplication, no persistence |
| Monitoring | Metrics tracking, /health, /stats | `server/services/monitoring.js` | trackError() imported but never called |
| Weapon Catalog | Weapon definitions, pricing | `server/models/Weapon.js` | Dual catalog (WEAPON_DATA vs WEAPON_CATALOG) creates confusion |
| Match Model | MongoDB persistence | `server/models/Match.js` | Only persists room metadata, not economic state |

### Data Flow Diagram

```
Client (Phaser.js/React)
    │
    │  Socket.IO (origin: "*")
    ▼
┌──────────────────────────────────────────────────────────┐
│  Socket Event Handler (main.js)                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ❌ NO INPUT VALIDATION                           │    │
│  │ ❌ NO AUTH ENFORCEMENT                           │    │
│  │ ❌ NO RATE LIMITING                              │    │
│  └──────────────────────────────────────────────────┘    │
│                     │                                     │
│         ┌───────────┼───────────┐                         │
│         ▼           ▼           ▼                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐              │
│  │ Physics  │ │ Match    │ │ Solana       │              │
│  │ Engine   │ │ State    │ │ Service      │              │
│  │          │ │ Machine  │ │              │              │
│  │ Trusts   │ │ Returns  │ │ Fails open   │              │
│  │ NaN/Inf  │ │ ignored  │ │ Stub settle  │              │
│  └──────────┘ └──────────┘ └──────────────┘              │
│         │           │           │                         │
│         ▼           ▼           ▼                         │
│  ┌────────────────────────────────────────────────┐      │
│  │         8 IN-MEMORY STATE STORES               │      │
│  │  rooms, matchStates, goldStates, wagerStates,  │      │
│  │  weaponInventories, shopTimers, shopReady,      │      │
│  │  authenticatedWallets                           │      │
│  │                                                 │      │
│  │  ❌ NO MUTEX/LOCKS                             │      │
│  │  ❌ NO PERSISTENCE (except partial MongoDB)    │      │
│  └────────────────────────────────────────────────┘      │
│                     │                                     │
│                     ▼                                     │
│         ┌─────────────────────┐                           │
│         │  MongoDB (optional) │                           │
│         │  Stores: room meta  │                           │
│         │  Missing: wagers,   │                           │
│         │  Gold, SHOT, match  │                           │
│         │  states, weapons    │                           │
│         └─────────────────────┘                           │
└──────────────────────────────────────────────────────────┘
```

---

## Trust Model

### Actors

| Actor | Trust Level | Capabilities | Entry Points |
|-------|-------------|--------------|--------------|
| Anonymous Socket | UNTRUSTED | All socket events; create/join rooms; fire weapons; delete rooms; trigger settlement | All 27 socket events — no auth required |
| Authenticated Socket | UNTRUSTED (effectively) | Identical to anonymous — auth adds `authenticatedWallets[id]` entry but is never checked | `authenticate` event; then all 27 events |
| HTTP Client | UNTRUSTED | Read financial data, health info | `GET /`, `/health`, `/stats` |
| Solana RPC | SEMI-TRUSTED | Provides wallet balances | `verifyBalance()`, `getBalance()` |
| MongoDB | TRUSTED | State persistence (partial) | `mongoose.connect()` |
| Server Admin | N/A | No admin interface exists | No entry points |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                        │
│    - ALL socket event payloads (no validation)          │
│    - ALL client-supplied wallet addresses                │
│    - ALL numeric values (angle, power, startX/Y)        │
│    - ALL string values (name, color, roomId)             │
│    - Solana RPC responses (can fail, return stale)       │
├─────────────────────────────────────────────────────────┤
│                 ❌ VALIDATION LAYER (ABSENT)             │
│    - No input type checking                              │
│    - No bounds checking                                  │
│    - No sanitization                                     │
│    - No auth enforcement                                 │
│    - No null/undefined guards                            │
├─────────────────────────────────────────────────────────┤
│                    "TRUSTED" ZONE                        │
│    - Server state stores (unprotected from above)       │
│    - Physics engine (processes NaN/Infinity)              │
│    - Settlement logic (double-pay race conditions)       │
│    - Gold/SHOT emission (no caps, no dedup)              │
└─────────────────────────────────────────────────────────┘
```

**Critical observation:** The validation layer that should exist between the untrusted and trusted zones is completely absent. Data flows directly from socket payloads into state mutations, physics calculations, and economic operations.

---

## State Management

### Critical State Variables

| State | Location | Modified By | Read By | Invariants | Persisted? |
|-------|----------|-------------|---------|------------|------------|
| `rooms[]` | `main.js:19` | createRoom, deleteRoom, removeRoom | findRoom, getOpenRooms, all handlers | Each room has exactly one host and 0-1 players | No |
| `matchStates{}` | `main.js:22` | createMatchState, transitionState, fire | isRoundOver, getNextTurn, all battle logic | State machine: LOBBY→PICK→SHOP→BATTLE→ROUND_END→COMPLETE | No |
| `goldStates{}` | `main.js:25` | initGold, addGold, deductGold | getGold, buyWeapon | Gold >= 0 per player | No |
| `wagerStates{}` | `main.js:37` | createRoom, joinRoom, playAgainRequest | fire, disconnect, leaveRoom | Amount matches valid tier; wallets match authenticated | No |
| `weaponInventories{}` | `main.js:28` | buyWeapon, fire handler | fire, shopPhase | Player owns weapon before firing | No |
| `shopTimers{}` | `main.js:31` | shopPhase, shopDone | clearTimeout on completion | Timer cleared before state transition | No |
| `authenticatedWallets{}` | `main.js:40` | authenticate | createRoom, joinRoom (fallback) | Wallet verified via signature | No |
| `playerShotState{}` | `shot-token.js:65` | recordMatchPlayed, prestigeBurn | getShotInfo | Balance >= 0; milestones earned once; prestige tier monotonic | No |

**Key invariant violations found:**

1. **`wagerStates` wallet integrity**: Wallets stored in wagerStates come from untrusted payload, NOT from `authenticatedWallets` (AC-04, V-01, V-02, V-07)
2. **`matchStates` transition integrity**: `transitionState()` return value is ignored at all 7 call sites — invalid transitions silently proceed (SM-15, SM-16)
3. **`goldStates` monotonicity**: Gold can go negative due to missing bounds check in `deductGold` (E-10 via arbitrary startX/Y Gold farming)
4. **`playerShotState` supply cap**: No global emission counter; total SHOT emitted can exceed 7M reward pool (E-04)
5. **`weaponInventories` ownership**: Fire handler does NOT check weapon ownership — any player can fire any weapon (V-19)

### Match State Lifecycle

```
LOBBY ──(both ready)──→ WEAPON_PICK ──(both picked)──→ WEAPON_SHOP
                                                           │
                                                    (timer/both done)
                                                           │
                                                           ▼
                                                        BATTLE
                                                           │
                        ┌──────────────────────────────────┤
                        │                                  │
                   (turnCount >= turnsPerRound)    (HP <= 0: match over)
                        │                                  │
                        ▼                                  ▼
                    ROUND_END                          ❌ SETTLING
                        │                          (NOT in transition
                        │                           table — SM-15)
                   (if more rounds)                        │
                        │                                  ▼
                        ▼                              COMPLETE
                    WEAPON_SHOP ───→ BATTLE                │
                                                    (SHOT awarded,
                                                     settlement stub)

NOTES:
- BATTLE→SETTLING transition is NOT in the transition table
- transitionState() returns false, but return value is ignored
- State gets stuck in BATTLE during settlement
- playAgainRequest wipes state during any phase
```

---

## Key Mechanisms

### Mechanism 1: Wallet Authentication

**Purpose:** Verify player wallet ownership for wager matches

**How it works:**
1. Client signs message `"SolShot Auth: <wallet> at <timestamp>"` with wallet private key
2. Client emits `authenticate` event with `{walletAddress, message, signature, timestamp}`
3. Server verifies ed25519 signature via tweetnacl, checks timestamp within 5-minute window
4. Server stores `authenticatedWallets[socket.id] = walletAddress` and generates JWT
5. JWT is returned to client but **never validated on subsequent events**
6. Subsequent events (`createRoom`, `joinRoom`) accept wallet address from payload, using authenticated wallet only as fallback

**Key files:**
- `server/middleware/auth.js`: Signature verification, JWT generation (never consumed)
- `server/socket-io/main.js:170-177`: Authenticate event handler

**Security failures (7 agents flagged):**
- JWT generated but never validated (AC-01, UA-03, EXT-16)
- No nonce/replay prevention — same signature replayable within 5 min (OD-06, T-06, V-20)
- Payload wallet overrides authenticated wallet (AC-04, V-01, V-02, V-07)
- `atob()` used for Base64 decoding instead of Node.js `Buffer.from()` (V-06, EXT-15)
- Hardcoded JWT secret fallback `'solshot-dev-secret-change-me'` (UA-02)
- Auth timestamp allows 60s future manipulation (OD-05)
- `PublicKey.isOnCurve()` check only runs during authenticate, not on payload wallets (V-21)

### Mechanism 2: SOL Wager System

**Purpose:** Allow players to wager SOL on match outcomes

**How it works:**
1. Room creator sets wager tier (0, 0.01, 0.05, 0.1, 0.25, 0.5 SOL)
2. Room joiner's balance is checked via Solana RPC (creator's is NOT checked)
3. No deposit/escrow occurs — wager is recorded in-memory only
4. On match completion, `settleMatch()` is called — returns `success: true` without moving SOL
5. `matchSettled` event is emitted to clients with phantom settlement data

**Key files:**
- `server/socket-io/main.js:354-410`: Room creation with wager
- `server/socket-io/main.js:288-344`: Room joining with balance check
- `server/services/solana.js:139-163`: Settlement stub
- `server/services/solana.js:80-102`: Balance verification

**Security failures (8 agents flagged):**
- Settlement is a stub — no real SOL transfers (E-06, OD-12)
- Balance check fails open — zero-balance wallets pass (E-16, OD-01, EH-04)
- Room creator balance never verified (E-17)
- Negative wager values bypass validation (E-08, ARITH-03)
- Double settlement via disconnect/fire race condition (E-14, T-01, SM-06)
- `playAgainRequest` deletes wager state — rematch always free (E-12)
- `deleteRoom` skips settlement — any player can call (E-15, UA-11, AC-06)
- Devnet RPC fallback in production (OD-03)

### Mechanism 3: Physics & Fire Event

**Purpose:** Server-authoritative ballistic simulation and damage calculation

**How it works:**
1. Client emits `fire` with `{angle, power, weaponId, startX, startY}`
2. Server calls `processShot()` which computes trajectory via Euler integration (3000 max steps)
3. Damage is calculated per tank within blast radius
4. Gold is awarded based on damage dealt
5. Turn alternates; after turnsPerRound turns, round ends

**Key files:**
- `server/socket-io/main.js:671-872`: Fire event handler (200 lines, async, no try/catch)
- `server/services/physics.js:59-84`: Trajectory calculation
- `server/services/physics.js:189-201`: Damage calculation

**Security failures (5 agents flagged):**
- No type/bounds validation on angle, power, startX, startY (V-04, ARITH-01, E-10)
- Client-supplied startX/startY overrides server tank position — arbitrary aim (E-10, V-04)
- NaN/Infinity inputs produce NaN damage, contaminating scores (ARITH-04)
- No weapon ownership check — fire any weapon without purchasing (V-19)
- No top-level try/catch — unhandled errors crash server (EH-02)
- Async handler without mutex — concurrent fires during settlement (T-02, T-11)

### Mechanism 4: Gold Economy

**Purpose:** Per-match currency for purchasing weapons during shop phases

**How it works:**
1. Both players start with 1000 Gold (initGold)
2. Gold earned from damage dealt: `floor(damage * 15)` per hit
3. Gold spent in weapon shop during WEAPON_SHOP phase
4. Gold resets on play-again

**Security failures:**
- Arbitrary startX/startY allows guaranteed max damage for Gold farming (E-10)
- turnCount never resets between rounds — rounds end instantly after round 1 (E-02)
- Gold state is ephemeral — lost on server restart (E-19)

### Mechanism 5: SHOT Token Emissions

**Purpose:** Reward long-term play with SHOT tokens via milestones

**How it works:**
1. On match completion, `recordMatchPlayed(wallet)` increments match count
2. Milestones at 1, 5, 10, 25, 50, 100 matches award SHOT bonuses
3. Recurring milestone: 500 SHOT every 50 matches after 100
4. Prestige system burns SHOT for cosmetic tiers

**Security failures (3 agents flagged):**
- No supply cap enforcement — emissions can exceed 7M pool (E-04)
- No match deduplication — same match could credit twice (E-03)
- No minimum gameplay requirement — trivial matches count (E-13)
- All state ephemeral — server restart reverses burns and resets balances (E-05, E-19)
- Colluding players can grind unlimited SHOT via rapid trivial matches (E-03, E-13)

---

## External Dependencies

### External Services

| Service | Purpose | Validation | Trust Level | Failure Mode |
|---------|---------|------------|-------------|--------------|
| Solana RPC | Wallet balance checks | None — no staleness check, no quorum | SEMI-TRUSTED | Fails open (returns 0, player enters match) |
| MongoDB | Match persistence | Mongoose schema typing | TRUSTED | Graceful degradation (server runs without DB) |

### npm Dependencies (28 vulnerabilities found)

| Package | Version | Risk | Notes |
|---------|---------|------|-------|
| Express | 4.18.1 | HIGH | Multiple known CVEs (EXT-01) |
| Socket.IO | 4.5.1 | HIGH | Parser DoS, ws vulnerabilities (EXT-02) |
| nodemon | ^1.3.3 | MEDIUM | Dev tool in production deps, ancient version (UA-08) |
| jsonwebtoken | ^9.0.0 | LOW | Current version, but JWTs are never validated |

---

## Access Control Summary

### Permission Matrix

| Operation | Anonymous | Authenticated | Host | Notes |
|-----------|-----------|---------------|------|-------|
| Connect | Yes | Yes | N/A | No rate limit |
| Create room (free) | **Yes** | Yes | N/A | No auth required |
| Create room (wager) | **Yes** | Yes | N/A | No auth required, no balance check |
| Join room (free) | **Yes** | Yes | N/A | No auth required |
| Join room (wager) | **Yes** | Yes | N/A | Balance check fails open |
| Delete room | **Yes** | Yes | **Should be** | No host check (AC-06, UA-11) |
| Fire weapon | **Yes** | Yes | N/A | No auth, no validation |
| Buy weapon | **Yes** | Yes | N/A | No auth required |
| Delete room during match | **Yes** | Yes | **Should be** | Skips settlement |
| View /stats | **Yes** | Yes | N/A | Financial data exposed |
| Admin actions | N/A | N/A | N/A | **No admin interface exists** |

**Summary:** Every operation is available to anonymous, unauthenticated connections.

---

## Economic Model

### Value Flows

```
                         ┌─────────────────┐
                         │  Player Wallets  │
                         └────────┬────────┘
                                  │
                           (no deposit taken)
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │   wagerStates{} (memory) │
                    │   amount + wallet mapping │
                    └────────────┬─────────────┘
                                 │
                          (match completes)
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   settleMatch() — STUB   │
                    │   Returns success: true  │
                    │   Transfers: $0 actual   │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              Winner 90%   Treasury 7%   Ops 3%
              (phantom)    (phantom)     (phantom)


   Gold Economy:           SHOT Token Economy:
   ┌──────────────┐        ┌────────────────────┐
   │ 1000 start   │        │ Milestone rewards   │
   │ +damage*15   │        │ No supply cap ❌    │
   │ -weapon cost │        │ No dedup check ❌   │
   │ Per-match    │        │ No min gameplay ❌  │
   │ Ephemeral ❌ │        │ Ephemeral ❌        │
   └──────────────┘        │                    │
                           │ Prestige burns     │
                           │ (reversed on       │
                           │  restart) ❌       │
                           └────────────────────┘
```

### Fee Structure

| Fee Type | Rate | Collection Point | Destination | Implemented? |
|----------|------|------------------|-------------|--------------|
| Winner payout | 90% | Match completion | Winner wallet | NO (stub) |
| Treasury fee | 7% | Match completion | Treasury wallet | NO (stub) |
| Operations fee | 3% | Match completion | Ops wallet | NO (stub) |

### Economic Invariants (ALL VIOLATED)

| Invariant | Status | Violation |
|-----------|--------|-----------|
| Winner + Treasury + Ops = Total Pot | Correct math (E-07) | N/A — never executes |
| Balance >= wager before entering match | **VIOLATED** | 0-balance wallets pass (E-16, OD-01) |
| SHOT emitted <= 7M reward pool | **VIOLATED** | No enforcement (E-04) |
| Prestige burns are permanent | **VIOLATED** | Lost on restart (E-05) |
| Each match settled exactly once | **VIOLATED** | Double settle via race (E-14, T-01) |
| Wager preserved across rematch | **VIOLATED** | playAgainRequest deletes (E-12) |
| Host always wins tiebreak (fairness) | **BY DESIGN (unfair)** | Systematic advantage (E-22) |
| Gold earned proportional to skill | **VIOLATED** | Arbitrary startX/Y bypasses physics (E-10) |

---

## High-Complexity Areas

### Area 1: Fire Event Handler (main.js:671-872)

**Identified by:** Arithmetic, State Machine, Timing, Error Handling, Account Validation, Token/Economic (6/10 agents)

**Why complex:**
- 200 lines of async code with no top-level try/catch
- Processes physics, damage, Gold, turn management, round-end detection, match-end detection, settlement, and SHOT emissions in a single handler
- No mutex — concurrent fires and disconnects interleave
- Client-supplied startX/startY bypasses server-authoritative positioning
- NaN/Infinity inputs propagate through entire calculation chain
- Settlement (async, potentially slow) runs without state lock

**Key code:** `main.js:671-872`

### Area 2: Disconnect/LeaveRoom Settlement Race

**Identified by:** State Machine, Timing, Error Handling, Token/Economic, CPI/External (5/10 agents)

**Why complex:**
- Both `disconnect` (main.js:178-224) and `leaveRoom` (main.js:228-263) contain duplicate settlement logic
- Both are async handlers that call `settleMatch()` and `removeRoom()`
- If both players disconnect simultaneously: both handlers read `wagerStates[roomId]` before either completes, resulting in two settlements
- `removeRoom()` deletes state that in-flight fire handlers are still reading
- No settlement lock — the `settlingRooms` Set recommended by multiple agents is absent

**Key code:** `main.js:178-263`

### Area 3: Authentication-to-Wager Trust Chain

**Identified by:** Access Control, Account Validation, Oracle/External, Admin/Upgrade, Error Handling (5/10 agents)

**Why complex:**
- Authentication is optional
- Authenticated wallet is stored but never enforced on subsequent events
- Payload wallet overrides authenticated wallet via `||` fallback chain
- Balance check fails open (RPC error = balance 0 = allowed)
- Creator balance never checked at all
- JWT exists but is never validated
- CORS wildcard allows any origin to connect and authenticate

**Key code:** `auth.js`, `main.js:170-177,288-344,354-410`

---

## Cross-Cutting Concerns

### Deduplicated Observations (Same Issue Found by Multiple Agents)

| Issue | Agents That Found It | Finding IDs |
|-------|---------------------|-------------|
| No input validation on socket payloads | 06, 02, 05, 09, 01 | V-04, ARITH-01, E-10, EH-08, AC-09 |
| JWT generated but never validated | 01, 08, 04, 06 | AC-01, UA-03, EXT-16, V-07 |
| Balance check fails open (zero-balance bypass) | 05, 07, 09, 04 | E-16, OD-01, EH-04, EXT-04 |
| Double settlement race condition | 03, 10, 05 | SM-06, T-01, E-14 |
| deleteRoom has no host-only check | 01, 08, 05 | AC-06, UA-11, E-15 |
| /stats exposes financial data without auth | 01, 08, 07, 05 | AC-13, UA-01, OD-13, E-20 |
| CORS wildcard on Express + Socket.IO | 01, 08, 04 | AC-14, UA-13, EXT-20 |
| Settlement stub returns success without transfer | 05, 07, 04 | E-06, OD-12, EXT-07 |
| No rate limiting on any endpoint/event | 04, 08, 10 | EXT-19, UA-15, T-14 |
| All state ephemeral (lost on restart) | 05, 03, 09 | E-19, SM-19, EH-11 |
| No nonce/replay prevention in auth | 07, 10, 06 | OD-06, T-06, V-20 |
| Math.random() for security-relevant decisions | 07, 03 | OD-08/09/10, SM-07 |
| atob() browser API in Node.js | 06, 04 | V-06, EXT-15 |
| Player names never sanitized (XSS) | 06, 01 | V-03, V-18 |
| Negative wager bypasses validation | 05, 02 | E-08, ARITH-03 |
| transitionState() return value ignored | 03 | SM-15, SM-16 |
| Hardcoded JWT secret fallback | 08, 04 | UA-02, EXT-15 |
| No turn timer (stalling griefing) | 05, 10 | E-18 |

### Shared Assumptions (All Incorrect)

1. **"Clients send valid data"**: Relied upon by physics, Gold, match state, weapons, wagers — violated by every socket event
2. **"Players authenticate before playing"**: Relied upon by wager system — violated by lack of enforcement
3. **"Settlement happens exactly once"**: Relied upon by wager system — violated by concurrent async handlers
4. **"Math.random() is sufficient randomness"**: Relied upon by terrain, turns, room IDs, weapon arrays — violated by xorshift128+ predictability
5. **"Server stays running"**: Relied upon by all 8 in-memory stores — violated by any restart/crash/deploy
6. **"Solana RPC is available"**: Relied upon by balance checks — violated by fail-open error handling

---

## Attack Surface Summary

### Entry Points by Risk

| Risk Level | Entry Point | Why This Risk |
|------------|-------------|---------------|
| CRITICAL | `fire` event | No validation, arbitrary position, async settlement race, NaN/Inf injection |
| CRITICAL | `createRoom` event | Spoofed wallet, negative wager, no creator balance check |
| CRITICAL | `joinRoom` event | Spoofed wallet, fail-open balance check, 0-SOL bypass |
| CRITICAL | `disconnect` handler | Double settlement race, state destruction during async operations |
| HIGH | `deleteRoom` event | No host check, skips settlement, wipes wager state |
| HIGH | `leaveRoom` event | Duplicate settlement logic, race with disconnect |
| HIGH | `createWeaponArray` event | Unbounded loop (DoS), PRNG state leakage |
| HIGH | `authenticate` event | Replay within 5 min, no nonce, hardcoded JWT secret |
| HIGH | `GET /stats` | Unauthenticated financial data + error messages |
| HIGH | `playAgainRequest` event | Wipes wager state during active settlement |
| MEDIUM | `buyWeapon` event | No type check on weaponId, no auth |
| MEDIUM | `terrainPath` event | Unbounded array copy, prototype pollution risk |
| MEDIUM | `ready` event | No state check, can reset Gold mid-battle |
| LOW | `weaponPick`, `angleChange`, `powerChange` | Unvalidated relay to opponent (client XSS risk) |

### Known Protections (Few)

| Protection | Location | Effectiveness |
|------------|----------|---------------|
| Wager tier validation | `solana.js:isValidWager()` | Works for positive values, bypassed by negatives |
| Weapon catalog lookup | `Weapon.js:getWeapon()` | Returns null for unknown IDs, but `fire` uses different catalog |
| Room existence check | `main.js:findRoom()` | Prevents operations on nonexistent rooms |
| Turn check in fire | `main.js:681-684` | Prevents out-of-turn firing (but not concurrent fires) |
| Shop timer | `main.js:476-505` | Forces shop phase to end after 30s |
| Mongoose schema types | `Match.js`, `User.js` | Prevents MongoDB injection at DB layer only |

---

## Appendix: Focus Area Cross-References

### Where Focus Areas Intersected

| Focus A | Focus B | Intersection Point | Finding Cluster |
|---------|---------|-------------------|----------------|
| Access Control (01) | Account Validation (06) | Wallet address spoofing in wager events | AC-04 + V-01/V-02/V-07 |
| Arithmetic (02) | Account Validation (06) | NaN/Infinity in fire handler | ARITH-01 + V-04 |
| State Machine (03) | Timing (10) | Double settlement from concurrent handlers | SM-06 + T-01 |
| CPI/External (04) | Oracle/Data (07) | RPC fail-open balance bypass | EXT-04 + OD-01 |
| Token/Economic (05) | State Machine (03) | Match completion triggering ephemeral rewards | E-03 + SM-19 |
| Token/Economic (05) | Timing (10) | Settlement + wager state deletion races | E-14 + T-09 |
| Error Handling (09) | Timing (10) | Unhandled async errors during concurrent operations | EH-02 + T-11 |
| Admin/Upgrade (08) | Access Control (01) | /stats endpoint exposure | UA-01 + AC-13 |
| Oracle/Data (07) | Account Validation (06) | Auth replay + wallet spoofing | OD-06 + V-07 |

### Aggregate Finding Counts Across All Agents

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 26 | No auth enforcement, settlement stub, double settlement, ephemeral state, SHOT supply unlimited, fail-open balance, null payload crash, no process handlers |
| HIGH | 48 | Input validation absent, wallet spoofing, PRNG predictable, CORS wildcard, JWT unused, race conditions, negative wagers, deleteRoom unprotected |
| MEDIUM | 33 | Relay event validation, prototype pollution, turn timer absent, health endpoint info leak, error message leakage, nodemon in prod deps |
| LOW | 10 | Auth nonce, PublicKey.isOnCurve scope, floating-point stats, security headers |
| INFO | 6 | Settlement math correct, no runtime config mutation, no process management exposed |

**Total unique findings (after deduplication): ~95** — many overlap across agents as documented above.

---

**This document synthesizes findings from 10 parallel context audits.**
**Use this as the foundation for attack strategy generation in Phase 3.**
