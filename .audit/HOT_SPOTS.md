# HOT_SPOTS.md — Static Pre-Scan Results

## Risk Density by File (sorted HIGH → LOW)

### 1. `server/socket-io/main.js` (1058 LOC) — **CRITICAL**
- **Line 360**: `Math.random().toString(32).slice(2,8)` — Predictable room IDs (PRNG)
- **Lines 19-41**: 7 in-memory state stores, no persistence
- **Line 17**: `origin: "*"` CORS wildcard
- **Lines 281-337**: `joinRoom` — wallet balance check fails-open on RPC error
- **Lines 347-410**: `createRoom` — no wallet signature required for wager
- **Lines 178-224**: `disconnect` — async forfeit settlement, race conditions
- **Lines 228-263**: `leaveRoom` — duplicate forfeit logic, race conditions
- **Lines 670-760**: `fire` — no numeric bounds on angle/power, async settlement
- **Line 652**: Weapon array generation uses `Math.random()` (non-crypto)

### 2. `server/middleware/auth.js` (138 LOC) — **HIGH**
- **Line 37**: `atob(signatureBase64)` — Browser API, NOT Node.js native. Will throw in strict Node.
- **Lines 72-73**: Auth message timestamp window 5 min, but no nonce/replay prevention
- **Line 86-92**: JWT generated but NEVER validated on subsequent events
- **Line 31**: `PublicKey.isOnCurve()` — curve check only, no format bounds

### 3. `server/services/solana.js` (208 LOC) — **HIGH**
- **Lines 139-180**: `settleMatch()` — STUB, only logs, no actual SOL transfer
- **Lines 82-95**: `verifyBalance()` — catches all errors, returns `{sufficient: false}`, used fail-open
- **Lines 198-202**: `getBalance()` — catches error, returns 0

### 4. `server/services/shot-token.js` (216 LOC) — **MEDIUM-HIGH**
- **Line 65**: `playerShotState = {}` — all state in-memory, lost on restart
- **Lines 95-129**: `recordMatchPlayed()` — no deduplication check (same match counted twice?)
- **Lines 137-173**: `prestigeBurn()` — balance deduction without persistence

### 5. `server/index.js` (54 LOC) — **MEDIUM**
- **Line 17**: CORS `origin: "*"`
- **Line 22**: `cors()` with no config (allows all)
- **Line 33**: `/stats` endpoint exposes financial data without auth

### 6. `server/services/match.js` (177 LOC) — **LOW**
- **Line 113**: `Math.random() < 0.5` for first turn — non-crypto PRNG
- No audit trail of state transitions

## Hot-Spots by Focus Area

### Access Control
- main.js:281-337 (joinRoom — no auth required)
- main.js:347-410 (createRoom — no auth required for wager)
- main.js:267-277 (deleteRoom — no host-only check)
- index.js:33 (/stats — no auth)

### Arithmetic / Numeric
- main.js:670 (fire handler — angle/power not validated)
- physics.js (all ballistic calculations — potential NaN/Infinity input)
- solana.js:113-135 (calculateSettlement — floating point arithmetic on SOL amounts)

### State Machine
- main.js:178-224 (disconnect — async state mutation during settlement)
- main.js:228-263 (leaveRoom — duplicate of disconnect logic)
- main.js:998-1044 (playAgainRequest — wipes all state)

### External / CPI Equivalent
- solana.js:82-95 (RPC calls — fail-open)
- auth.js:37 (atob — platform-dependent)
- solana.js:139-180 (settleMatch — stub, no on-chain)

### Token & Economic
- shot-token.js:65 (all SHOT state ephemeral)
- gold.js (all Gold state ephemeral)
- main.js:36 (wagerStates ephemeral)
- solana.js (settlement not implemented)

### Input Validation
- main.js:281 (joinRoom payload — no type checks)
- main.js:347 (createRoom payload — no type checks)
- main.js:670 (fire payload — no bounds on angle/power/weaponId)
- main.js:506 (buyWeapon — weaponId not type-checked)

### Error Handling
- solana.js:82-95 (catch-all returns false)
- main.js:306-315 (balance check catch — logs and continues)
- auth.js:52 (signature verification catch — returns invalid)

### Timing & Ordering
- main.js:178-263 (disconnect/leave race conditions)
- main.js:670 (fire handler is async — concurrent fires possible?)
- auth.js:72-73 (5 min auth window, no nonce)
