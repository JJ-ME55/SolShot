# The Fortress - Final Audit Report

**Project:** SolShot
**Audit Date:** 2026-02-14
**Auditor:** The Fortress v1.0
**Scope:** Full codebase adversarial security analysis
**Ecosystem:** Node.js / Socket.IO / Solana (Anchor-adjacent)
**Branch:** dev

---

## Executive Summary

### Overall Security Posture

SolShot is a browser-based multiplayer artillery game with Solana wallet integration and SOL wager settlement. The security posture is **critically deficient across every subsystem**. Of 35 attack hypotheses investigated, 34 were confirmed and 1 was rated potential — a 97% confirmation rate that indicates systemic rather than isolated failures.

The codebase has three foundational security failures that compound into a non-deployable state: (1) **Authentication is decorative** — wallet signature verification exists but is never enforced on any gameplay event, meaning every socket handler is accessible to anonymous connections. (2) **Input validation is absent** — every socket event payload passes directly from untrusted clients into state mutations, physics calculations, and economic operations without type checking, bounds checking, or sanitization. (3) **Concurrency is unmanaged** — all 8 in-memory state stores are mutated by multiple async handlers without locks, creating reliable double-settlement race conditions.

The SOL settlement system is currently a stub (returns `success: true` without on-chain execution), which masks the severity of the wager logic bugs. When real escrow is implemented, the existing codebase has at least 4 distinct paths to double-pay or zero-pay outcomes. The SHOT token system has no supply cap enforcement and can be infinitely farmed. All economic state is ephemeral — a server restart wipes balances, milestones, prestige tiers, and active wagers with no recovery mechanism. **This codebase must not handle real funds in its current state.**

### Key Statistics

| Metric | Count |
|--------|-------|
| Total Attack Hypotheses Investigated | 35 |
| CONFIRMED Vulnerabilities | 34 |
| POTENTIAL Issues | 1 |
| Investigated & Cleared | 0 |
| Requires Manual Review | 0 |

### Severity Distribution

| Severity | Count | CVSS Range | Requires Immediate Action |
|----------|-------|------------|---------------------------|
| CRITICAL | 13 | 9.0 - 10.0 | YES - Block deployment |
| HIGH | 20 | 7.0 - 8.9 | YES - Fix before launch |
| MEDIUM | 1 | 4.0 - 6.9 | Recommended before launch |
| LOW | 1 | 0.1 - 3.9 | Address when convenient |
| INFO | 0 | N/A | No action required |

### CVSS Score Summary

| ID | Finding | CVSS Score | Vector |
|----|---------|------------|--------|
| H006 | Auth bypass — no enforcement | 9.8 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H` |
| H001 | Unauthenticated wager room creation | 9.8 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:H` |
| H002 | Wallet address spoofing | 9.8 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:H` |
| H061 | No uncaughtException handler | 9.4 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H` |
| H062 | Fire handler unhandled rejection | 9.4 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H` |
| H020 | Double settlement race condition | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:H` |
| H027 | Fail-open balance check | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H` |
| H038 | Unfunded wager room creation | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H` |
| H037 | Play-again wager deletion | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:N` |
| H011 | Negative wager bypass | 8.6 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:L` |
| H015 | Null payload crash | 8.6 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:H` |
| H069 | Disconnect during settling | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:H` |
| H021 | playAgainRequest wipes wager | 9.1 | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:N` |

**Average CVSS (CONFIRMED only):** 8.2
**Highest CVSS:** H006 at 9.8

### Top 5 Priority Items

| Priority | ID | Finding | Severity | Location |
|----------|-----|---------|----------|----------|
| 1 | H006 | Auth bypass — isAuthenticated never checked | CRITICAL | `server/socket-io/main.js` |
| 2 | H001+H002 | Unauthenticated wager + wallet spoofing | CRITICAL | `server/socket-io/main.js:288-410` |
| 3 | H020+H069 | Double settlement race (fire + disconnect) | CRITICAL | `server/socket-io/main.js:180-830` |
| 4 | H061+H062 | No error handlers — single event crashes server | CRITICAL | `server/index.js`, `main.js:671` |
| 5 | H027+H038 | Fail-open balance + unfunded room creation | CRITICAL | `main.js:305-317`, `solana.js:80-102` |

---

## Critical Findings

> **ACTION REQUIRED**: These findings MUST be addressed before any deployment.

---

### CRITICAL-01: Authentication Never Enforced (H006)

**ID:** H006
**Severity:** CRITICAL
**CVSS Score:** 9.8 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`)
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js` (all 27 event handlers)

#### Description

`client.isAuthenticated` is set to `false` on connection (line 166) and set to `true` in `handleAuthenticate()` (auth.js:135). However, `isAuthenticated` is **never read or checked** anywhere in the codebase after assignment. Every single socket event handler executes unconditionally for any connected socket.

#### Attack Scenario

An attacker could:
1. Connect a raw Socket.IO client — never call `authenticate`
2. Emit `createRoom` with a spoofed wallet address and 0.5 SOL wager
3. Play the entire match, fire weapons, trigger settlement
4. **Result:** Full game participation and wager settlement without any authentication

#### Impact

- **Financial:** Unlimited fund theft when real settlement is implemented
- **Users Affected:** All players — any attacker on the internet
- **Protocol State:** Complete compromise of the wager system

#### Evidence

```javascript
// main.js:166 — set on connect
client.isAuthenticated = false

// auth.js:135 — set on auth success
client.isAuthenticated = true;

// NOWHERE in the codebase:
// if (!client.isAuthenticated) return  ← DOES NOT EXIST
```

All 27 socket event handlers have zero auth guards.

#### Recommended Fix

```javascript
// Create auth middleware for wager-related events
function requireAuth(client) {
    if (!client.isAuthenticated || !authenticatedWallets[client.id]) {
        client.emit('error', { reason: 'Authentication required' });
        return false;
    }
    return true;
}

// Apply to all sensitive handlers:
client.on('createRoom', async ({player}) => {
    if (player.wager > 0 && !requireAuth(client)) return;
    // ...
});
```

#### Verification

After fix, verify:
- [ ] Anonymous sockets cannot create wagered rooms
- [ ] Anonymous sockets cannot join wagered rooms
- [ ] All wager-related wallet addresses come from `authenticatedWallets[client.id]`, never from payload

---

### CRITICAL-02: Unauthenticated Wager Room Creation (H001)

**ID:** H001
**Severity:** CRITICAL
**CVSS Score:** 9.8
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:354-410`

#### Description

The `createRoom` handler has zero authentication checks. There is no guard that verifies `client.isAuthenticated === true` or that `authenticatedWallets[client.id]` exists. No balance check is performed on the creator's wallet (only the joiner gets a balance check). The wallet address is taken from the untrusted payload.

#### Attack Scenario

1. Attacker connects raw Socket.IO client (no wallet, no auth)
2. Emits `createRoom` with `{ player: { wager: 0.5, walletAddress: "SpoofedWallet" } }`
3. Server creates room — no balance verification on creator
4. Legitimate player joins, passes (broken) balance check
5. **Result:** Attacker risks nothing; legitimate player's funds at stake

#### Evidence

```javascript
// main.js:354-378 — zero auth, zero balance check on creator
client.on('createRoom', async ({player}) => {
    const wagerAmount = player.wager || 0
    const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
    if (wagerAmount > 0 && !isValidWager(wagerAmount)) { return }
    wagerStates[roomId] = { amount: wagerAmount, wallets: { [client.id]: walletAddress } }
```

#### Recommended Fix

```javascript
if (wagerAmount > 0) {
    if (!requireAuth(client)) return;
    const wallet = authenticatedWallets[client.id]; // NEVER from payload
    const balance = await verifyBalance(wallet, wagerAmount);
    if (!balance.sufficient) { client.emit('createRoomError', { reason: 'Insufficient balance' }); return; }
}
```

---

### CRITICAL-03: Wallet Address Spoofing (H002)

**ID:** H002
**Severity:** CRITICAL
**CVSS Score:** 9.8
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:296,370`

#### Description

Both `joinRoom` (line 296) and `createRoom` (line 370) accept wallet addresses from the untrusted payload first, using the authenticated wallet only as fallback: `walletAddress || authenticatedWallets[client.id] || null`. An attacker can authenticate as Wallet A, then submit Wallet B in the payload.

#### Attack Scenario

1. Authenticate as empty wallet (WalletA, 0 SOL)
2. Emit `joinRoom` with `{ walletAddress: "RichWalletAddress" }`
3. Balance check runs against rich wallet — passes
4. `wagerStates` stores the spoofed wallet
5. **Result:** Settlement references wrong wallet; attacker risks nothing

#### Recommended Fix

Never accept wallet addresses from payload for wager operations. Always use `authenticatedWallets[client.id]`.

---

### CRITICAL-04: Fail-Open Balance Check (H027)

**ID:** H027
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:305-317`, `server/services/solana.js:80-102`

#### Description

Two bypass paths: (1) When wallet has exactly 0 SOL, `verifyBalance()` returns `{ sufficient: false, balance: 0 }`. The guard `balanceCheck.balance > 0 && !balanceCheck.sufficient` evaluates to `false` when balance is 0 — player joins. (2) When RPC fails, the catch block logs a warning and continues — no rejection.

#### Recommended Fix

```javascript
if (!balanceCheck.sufficient) {
    client.emit('joinRoomError', { reason: 'Insufficient balance' });
    return;
}
// AND in catch block:
} catch (err) {
    client.emit('joinRoomError', { reason: 'Balance check failed' });
    return;
}
```

---

### CRITICAL-05: Unfunded Wager Room Creation (H038)

**ID:** H038
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:354-410`

#### Description

`createRoom` performs zero `verifyBalance()` call on the room creator. Only `joinRoom` has a balance check (which itself fails open — H027). The creator can set a 0.5 SOL wager with an empty wallet.

#### Recommended Fix

Add `verifyBalance()` for the creator before storing the wager state.

---

### CRITICAL-06: Double Settlement Race Condition (H020)

**ID:** H020
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:180-830`

#### Description

No mutex, lock, or `settlingRooms` Set exists anywhere. Two async paths (`fire` handler at line 814 and `disconnect` handler at line 198) can both call `settleMatch()` concurrently. The `BATTLE→SETTLING` transition is invalid (not in transition table), so state stays `BATTLE`, allowing disconnect handler to enter settlement while fire handler is mid-settle.

#### Recommended Fix

```javascript
const settlingRooms = new Set();
// Before any settlement:
if (settlingRooms.has(roomId)) return;
settlingRooms.add(roomId);
try { await settleMatch(...) } finally { settlingRooms.delete(roomId) }
```

---

### CRITICAL-07: playAgainRequest Wipes Wager Mid-Settlement (H021)

**ID:** H021
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:1004-1053`

#### Description

`playAgainRequest` executes `delete wagerStates[client.roomId]` unconditionally when both players agree. No check on `matchStates[client.roomId].status`. During async settlement, this deletes the wager data that `settleMatch()` needs.

#### Recommended Fix

Add state validation: only allow in COMPLETE state, after settlement confirmed.

---

### CRITICAL-08: Play-Again Wager Deletion (H037)

**ID:** H037
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:1019,1043`

#### Description

After play-again, `wagerStates` is deleted. The rematch has no wager — settlement is skipped entirely. A player who won Match 1 profits, but the losing player's Match 2 win has no settlement. Asymmetric outcomes from what should be symmetric matches.

#### Recommended Fix

Either preserve wager state across rematches (re-verify balances) or require fresh room creation for each wagered match.

---

### CRITICAL-09: Negative Wager Bypass (H011)

**ID:** H011
**Severity:** CRITICAL
**CVSS Score:** 8.6
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:369-374`

#### Description

The guard `wagerAmount > 0 && !isValidWager(wagerAmount)` means negative values bypass `isValidWager()` entirely. A wager of `-0.1` is stored, producing negative settlement amounts. Forfeit on disconnect is also skipped since `-0.1 > 0` is false.

#### Recommended Fix

```javascript
const wagerAmount = Number(player.wager) || 0;
if (wagerAmount < 0) { client.emit('createRoomError', { reason: 'Invalid wager' }); return; }
if (wagerAmount > 0 && !isValidWager(wagerAmount)) { return; }
```

---

### CRITICAL-10: Null Payload Crash (H015)

**ID:** H015
**Severity:** CRITICAL
**CVSS Score:** 8.6
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js` (multiple handlers)

#### Description

Multiple handlers destructure incoming payload directly (e.g., `async ({angle, power, ...}) =>`). Sending `null` causes `TypeError: Cannot destructure property of null`. Socket.IO catches this and disconnects the socket, triggering the `disconnect` handler which runs settlement/forfeit logic and `removeRoom()`.

#### Recommended Fix

Add null guard at top of every handler: `if (!data || typeof data !== 'object') return;`

---

### CRITICAL-11: No uncaughtException Handler (H061)

**ID:** H061
**Severity:** CRITICAL
**CVSS Score:** 9.4
**Status:** CONFIRMED
**Location:** `server/index.js`

#### Description

Zero `process.on('uncaughtException')`, `process.on('unhandledRejection')`, or `process.on('SIGTERM')` handlers. Any unhandled error terminates the process, wiping all 8 in-memory state stores — rooms, matches, wagers, Gold, SHOT balances.

#### Recommended Fix

Add process-level error handlers and graceful shutdown logic to `server/index.js`.

---

### CRITICAL-12: Fire Handler Unhandled Rejection (H062)

**ID:** H062
**Severity:** CRITICAL
**CVSS Score:** 9.4
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:671-872`

#### Description

The `fire` handler is a 200-line `async` function with no top-level try/catch. The only try/catch covers `settleMatch()` (lines 813-827). Everything else is unprotected. Any throw produces an unhandled rejection that terminates the process on Node.js 15+.

#### Recommended Fix

Wrap the entire handler body in try/catch. Apply the same pattern to all async handlers.

---

### CRITICAL-13: Disconnect During Settling Destroys State (H069)

**ID:** H069
**Severity:** CRITICAL
**CVSS Score:** 9.1
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:180-228`

#### Description

The disconnect handler calls `removeRoom()` unconditionally. No check for SETTLING state. If a player disconnects during `await settleMatch()`, the handler triggers a second settlement AND deletes all state via `removeRoom()` while the first settlement is still in-flight.

#### Recommended Fix

Check for settlement-in-progress before cleanup. Never call `removeRoom()` during async settlement.

---

## High Priority Findings

> **IMPORTANT**: These findings should be fixed before mainnet launch.

---

### HIGH-01: deleteRoom Host-Only Bypass (H003)

**ID:** H003
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:274-284`

#### Description

`deleteRoom` performs no host verification. Any player in the room can call it. `removeRoom()` deletes all state including `wagerStates` without settlement.

#### Recommended Fix

Add `if (!client.isHost) return` guard. If match active and wagered, treat deletion as forfeit.

---

### HIGH-02: JWT Secret Hardcoded Fallback (H007)

**ID:** H007
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/middleware/auth.js:17`

#### Description

`const JWT_SECRET = process.env.JWT_SECRET || 'solshot-dev-secret-change-me'`. If env var not set, all JWTs signed with well-known string. Additionally, `verifyToken()` is exported but never called anywhere.

#### Recommended Fix

Remove hardcoded fallback. Require env var and fail startup if not set. Either use JWTs for session validation or remove the JWT system entirely.

---

### HIGH-03: CORS Wildcard (H008)

**ID:** H008
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/index.js:15-22`

#### Description

Both Socket.IO and Express use `origin: "*"`. Any website can open Socket.IO connections and make HTTP requests to the server. Combined with H006 (no auth), any website can control the game server.

#### Recommended Fix

Replace with explicit allowlist of trusted origins.

---

### HIGH-04: NaN Injection via Fire Handler (H009)

**ID:** H009
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:671`, `server/services/physics.js:59-84`

#### Description

No type validation on `angle`, `power`, `startX`, `startY`. NaN values propagate through 3000-step trajectory calculation, contaminate scores, and cause the host to always win via tiebreak logic.

#### Recommended Fix

Add `typeof` + `isFinite()` validation at top of fire handler for all numeric inputs.

---

### HIGH-05: Arbitrary Position Spoofing (H012)

**ID:** H012
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:671,725-734`

#### Description

The `fire` handler accepts client-supplied `startX`/`startY` for the projectile origin. The server stores authoritative tank positions but uses them only for hit detection targets, not for the firing origin. A player can fire from the opponent's exact position.

#### Recommended Fix

Replace client-supplied coordinates with server-stored tank positions.

---

### HIGH-06: createWeaponArray Denial-of-Service (H013)

**ID:** H013
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:645-658`

#### Description

No validation on `count` parameter. Client-supplied value directly controls loop iteration count. `count: 1e9` blocks the event loop for seconds/minutes. `count: Infinity` freezes the server permanently.

#### Recommended Fix

Cap `count` at a reasonable maximum (e.g., 20). Validate type and bounds.

---

### HIGH-07: Megabyte Player Name Broadcast (H017)

**ID:** H017
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:354,288`

#### Description

No length validation on player names. A 10MB name is stored in memory, broadcast to ALL clients via `setRooms`, and written to MongoDB. Multiple oversized rooms saturate bandwidth.

#### Recommended Fix

Enforce max name length (e.g., 20 characters). Set Socket.IO `maxHttpBufferSize`.

---

### HIGH-08: Ready Event During BATTLE Resets Gold (H019)

**ID:** H019
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:414-507`

#### Description

The `ready` handler performs zero match-state validation. Emitting `ready` during BATTLE unconditionally overwrites `goldStates` (resetting to 1000 Gold) and `weaponInventories` (resetting to `[0]`).

#### Recommended Fix

Add `validateAction(ms.status, 'ready')` check at handler top.

---

### HIGH-09: BATTLE→SETTLING Missing Transition (H022)

**ID:** H022
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/services/match.js:21-29`

#### Description

The TRANSITIONS table does not include SETTLING as valid from BATTLE. `transitionState()` returns `false` but the return value is ignored at all 7 call sites. State gets stuck in BATTLE during settlement, enabling the double-settlement race.

#### Recommended Fix

Add SETTLING to BATTLE transitions. Check `transitionState()` return values at all call sites.

---

### HIGH-10: turnCount Never Resets Between Rounds (H023)

**ID:** H023
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:786-870`, `server/services/match.js:125-127`

#### Description

`turnCount` is never reset between rounds. After round 1 ends at `turnCount=20`, round 2's first shot increments to 21, which satisfies `turnCount >= turnsPerRound (20)`. Every round after the first is exactly 1 turn.

#### Recommended Fix

Reset `ms.turnCount = 0` in the round-end logic before transitioning to the next round.

---

### HIGH-11: SHOT Token Unlimited Farming (H033)

**ID:** H033
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/services/shot-token.js:95-129`

#### Description

No deduplication on match completion. No minimum match duration or turn count. Colluding players can complete matches in <5 seconds, earning ~7,200 SHOT/hour from recurring milestones.

#### Recommended Fix

Add minimum match duration, turn count, and rate limiting per wallet.

---

### HIGH-12: SHOT Supply Cap Not Enforced (H034)

**ID:** H034
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/services/shot-token.js:29-39`

#### Description

`SHOT_TOKEN_CONFIG.rewardPool` (7M) is defined but never referenced in emission logic. No global counter tracks total emissions. SHOT can be emitted infinitely past the intended cap.

#### Recommended Fix

Add global emission counter. Check before every emission.

---

### HIGH-13: Gold Farming via Position Spoofing (H036)

**ID:** H036
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:671,725-734`

#### Description

Client-supplied `startX`/`startY` allows guaranteed direct hits. Gold is earned from damage dealt (`floor(damage * 15)`). Maximum damage every turn = maximum Gold farming.

#### Recommended Fix

Use server-stored tank positions (same fix as H012).

---

### HIGH-14: Weapon Firing Without Purchase (H039)

**ID:** H039
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:691-695`

#### Description

Fire handler checks `WEAPON_DATA[weaponId]` exists but never checks `weaponInventories`. A player starts with weapon 0 but can fire any of the 13 weapons without purchasing.

#### Recommended Fix

Add inventory ownership check after weapon existence check.

---

### HIGH-15: Prestige Burn Reversal (H035)

**ID:** H035
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/services/shot-token.js:64-65`

#### Description

`playerShotState` is stored in-memory only — no persistence to MongoDB, file, or any durable storage. Server restart wipes all SHOT balances, milestones, and prestige tiers. Burns are effectively reversed.

#### Recommended Fix

Persist `playerShotState` to MongoDB. Load on startup. Write on every mutation.

---

### HIGH-16: Settlement Error Still Transitions to COMPLETE (H064)

**ID:** H064
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:802-835`

#### Description

`transitionState(ms, MATCH_STATES.COMPLETE)` executes unconditionally — whether settlement succeeded, failed, or was skipped. Failed settlement marks match COMPLETE with no retry mechanism.

#### Recommended Fix

Check settlement result before transitioning. Stay in SETTLING and schedule retry on failure.

---

### HIGH-17: Concurrent Fire Events During Settlement (H068)

**ID:** H068
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:671-872`

#### Description

During `await settleMatch()`, the event loop is free to process more `fire` events. Since BATTLE→SETTLING transition fails, `validateAction('battle', 'fire')` returns true. Multiple fires during settlement = multiple settlements.

#### Recommended Fix

Add `settlingRooms` Set guard at top of fire handler.

---

### HIGH-18: Room Deletion During Active Settlement (H070)

**ID:** H070
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:274-284`

#### Description

`deleteRoom` has no match state check and no host-only check. Unlike `disconnect`, it does not attempt forfeit settlement — the wager is simply deleted.

#### Recommended Fix

Add host-only check. Prevent deletion during BATTLE/SETTLING. Trigger forfeit settlement if match active.

---

### HIGH-19: playAgainRequest During Async Settlement (H073)

**ID:** H073
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/socket-io/main.js:1004-1054`

#### Description

No state check prevents `playAgainRequest` from executing during settlement. `delete wagerStates[client.roomId]` corrupts in-flight settlement. SHOT token emissions reference deleted wallet data.

#### Recommended Fix

Only allow `playAgainRequest` when `ms.status === MATCH_STATES.COMPLETE`.

---

### HIGH-20: Event Flooding DoS (H074)

**ID:** H074
**Severity:** HIGH
**Status:** CONFIRMED
**Location:** `server/index.js`, `server/socket-io/main.js`

#### Description

Zero rate limiting on any socket event or HTTP endpoint. 23 event handlers registered per socket with no throttling. Express body parser allows 30MB payloads. A single attacker can saturate the server.

#### Recommended Fix

Add per-socket rate limiting. Set `maxHttpBufferSize` to 64KB. Reduce body parser limit. Add connection rate limiting per IP.

---

## Medium Priority Findings

> **RECOMMENDED**: Address these before launch if possible.

| ID | Title | Location | Issue | Recommendation |
|----|-------|----------|-------|----------------|
| H024 | Legacy shoot relay | `main.js:663-666` | Unvalidated relay bypasses server-authoritative physics | Remove legacy handler or add full validation |

### Details

<details>
<summary>MEDIUM-01: Legacy Shoot Relay (H024)</summary>

**Location:** `server/socket-io/main.js:663-666`

The `shoot` event handler performs zero validation — no state check, no turn check, no weapon validation. It relays arbitrary data to the opponent. If the client processes `opponentShoot` events for rendering, an attacker can forge visual states.

**Fix:** Remove the legacy `shoot` relay if all clients use the `fire` event. If backward compatibility needed, add full validation.

</details>

---

## Low Priority Findings

> **OPTIONAL**: Minor issues that can be addressed over time.

| ID | Title | Location | Issue | Recommendation |
|----|-------|----------|-------|----------------|
| H016 | Float-point settlement rounding | `solana.js:121-127` | Sub-lamport rounding errors in settlement math | Use integer lamport arithmetic instead of float SOL |

---

## Combination Attack Analysis

> **CRITICAL SECTION**: Findings that chain together for amplified impact.

### Chain 1: "Zero-Cost Wager Theft"

**Combined Severity:** CRITICAL (higher than individual findings)

**Component Findings:**

| ID | Individual Severity | Role in Chain |
|----|---------------------|---------------|
| H006 | CRITICAL | Skip authentication entirely |
| H001 | CRITICAL | Create wagered room without auth or balance check |
| H002 | CRITICAL | Spoof wallet address to avoid real risk |
| H027 | CRITICAL | Even if balance checked, 0-SOL wallets pass |
| H038 | CRITICAL | Creator balance never verified |

**Combined Attack:**
1. Attacker skips `authenticate` (H006)
2. Creates 0.5 SOL wager room with spoofed wallet address (H001 + H002)
3. Server never checks creator's balance (H038)
4. Legitimate player joins — their balance check may pass or fail-open (H027)
5. Attacker wins the match using position spoofing (H012)
6. Settlement pays attacker 0.9 SOL from a wallet they don't own

**Why This Is Worse:** Each finding alone might be mitigated by other checks. Together, they form a complete zero-cost theft pipeline requiring no authentication, no real wallet, and no real funds.

**Mitigation:** Fix H006 first — requiring authentication blocks the entire chain.

---

### Chain 2: "Server Kill Switch"

**Combined Severity:** CRITICAL

**Component Findings:**

| ID | Individual Severity | Role in Chain |
|----|---------------------|---------------|
| H015 | CRITICAL | Null payload triggers TypeError |
| H061 | CRITICAL | No uncaughtException handler |
| H062 | CRITICAL | Fire handler has no try/catch |
| H074 | HIGH | No rate limiting to slow attacks |
| H008 | HIGH | CORS wildcard allows attack from any website |

**Combined Attack:**
1. Attacker opens Socket.IO connection from any website (H008)
2. Sends rapid null payloads to async handlers (H015 + H074)
3. TypeError propagates as unhandled rejection (H062)
4. Node.js terminates — no uncaughtException handler (H061)
5. ALL in-memory state destroyed — rooms, wagers, Gold, SHOT

**Why This Is Worse:** A single null payload can crash the entire server, destroying all active matches and economic state for all players simultaneously. Rate limiting absence allows millions of crash attempts.

**Mitigation:** Fix H061 first (add process error handlers), then H015 (null guards).

---

### Chain 3: "Double-Pay Settlement"

**Combined Severity:** CRITICAL

**Component Findings:**

| ID | Individual Severity | Role in Chain |
|----|---------------------|---------------|
| H022 | HIGH | BATTLE→SETTLING transition fails, state stays BATTLE |
| H020 | CRITICAL | Fire + disconnect race condition |
| H069 | CRITICAL | Disconnect during settling runs second settlement |
| H068 | HIGH | Additional fire events during settlement |
| H064 | HIGH | Settlement error doesn't prevent COMPLETE transition |

**Combined Attack:**
1. Match is in BATTLE. Player A fires winning shot.
2. `transitionState(ms, SETTLING)` fails — state stays BATTLE (H022)
3. `await settleMatch()` begins (fire handler, line 814)
4. Player B disconnects during the `await` (H069)
5. Disconnect handler sees status=BATTLE, calls `settleMatch()` again (H020)
6. Two concurrent `settleMatch()` calls execute for the same wager
7. Winner receives payout twice

**Why This Is Worse:** The missing transition (H022) is the root enabler — it keeps the state in BATTLE, which allows every guard that checks for BATTLE to proceed during settlement.

**Mitigation:** Fix H022 first (add SETTLING to BATTLE transitions), then add `settlingRooms` Set.

---

### Chain 4: "Infinite SHOT Token Printer"

**Combined Severity:** HIGH

**Component Findings:**

| ID | Individual Severity | Role in Chain |
|----|---------------------|---------------|
| H033 | HIGH | No min gameplay requirement for match credit |
| H034 | HIGH | No supply cap enforcement |
| H035 | HIGH | State lost on restart — milestones re-earnable |
| H012 | HIGH | Position spoofing ends matches in 1 shot |
| H061 | CRITICAL | Crash → restart → milestones reset |

**Combined Attack:**
1. Two colluding accounts create free rooms, instant-complete matches via position spoofing (H012)
2. Each match credits both accounts — no dedup, no min turns (H033)
3. After 100 matches (~8 min), recurring 500 SHOT/50 matches begins
4. Emissions exceed 7M cap with no enforcement (H034)
5. Crash the server (H061) to reset `playerShotState` — re-earn one-time milestones (H035)
6. Repeat indefinitely

**Mitigation:** Fix H034 (supply cap) and H035 (persistence) first, then H033 (match requirements).

---

### Findings That Enable Others

| Finding | Enables | Combined Impact |
|---------|---------|-----------------|
| H006 (No auth) | H001, H002, H003, H008, H038 | Every wager exploit requires no auth |
| H022 (Missing transition) | H020, H068, H069, H073 | All settlement races depend on state stuck in BATTLE |
| H061 (No error handler) | H015, H062, H035 | Any crash wipes all state |
| H074 (No rate limit) | H013, H015, H017, H033 | Amplifies every DoS and farming attack |
| H012 (Position spoofing) | H036, H033 | Enables Gold farming and instant match completion |

---

## Investigated & Cleared

> **GOOD NEWS**: These attack vectors were investigated and found not vulnerable.

<details>
<summary>Click to expand cleared items (0 total)</summary>

No hypotheses were cleared as not vulnerable. All 34 confirmed, 1 potential.

</details>

---

## Recommendations Summary

### Immediate Actions (Before ANY Deployment)

> **BLOCKING**: Do not deploy until these are resolved.

1. [ ] **Fix H006**: Add authentication enforcement middleware for all wager-related events
2. [ ] **Fix H001+H002**: Use `authenticatedWallets[client.id]` exclusively — never accept wallet from payload
3. [ ] **Fix H061+H062**: Add `process.on('uncaughtException')` and wrap all async handlers in try/catch
4. [ ] **Fix H015**: Add null/type guards at top of every socket handler
5. [ ] **Fix H022**: Add SETTLING to BATTLE transitions in state machine
6. [ ] **Fix H020+H069**: Implement `settlingRooms` Set for settlement concurrency control
7. [ ] **Fix H027+H038**: Fix balance check logic and add creator balance verification
8. [ ] **Fix H011**: Reject negative and non-numeric wager values
9. [ ] **Fix H012**: Replace client-supplied startX/startY with server-stored tank positions
10. [ ] **Break Chain 1**: Fix H006 to prevent zero-cost wager theft pipeline

### Pre-Launch Requirements

> **REQUIRED**: Complete before mainnet launch.

1. [ ] Fix all HIGH findings (H003, H007-H009, H013, H017, H019, H023, H033-H039, H064, H068, H070, H073, H074)
2. [ ] Implement rate limiting on all socket events and HTTP endpoints
3. [ ] Restrict CORS to production origins
4. [ ] Persist all economic state (wagerStates, goldStates, playerShotState) to database
5. [ ] Implement real escrow/deposit at room creation — not post-hoc settlement
6. [ ] Enforce SHOT supply cap with global emission counter
7. [ ] Add weapon ownership check in fire handler
8. [ ] Reset turnCount between rounds
9. [ ] Remove legacy `shoot` relay or add full validation
10. [ ] Re-audit after fixes

### Post-Launch Improvements

> **RECOMMENDED**: Address after stable launch.

1. [ ] Address H016 (float-point rounding) — use integer lamport arithmetic
2. [ ] Add turn timer to prevent stalling/griefing
3. [ ] Add nonce/replay prevention to authentication
4. [ ] Replace `Math.random()` with CSPRNG for security-relevant decisions
5. [ ] Add monitoring alerts for anomalous wager patterns

### Ongoing Security Practices

> **CONTINUOUS**: Security is an ongoing process.

- **Code Review**: All changes should go through security-focused review
- **Input Validation**: Establish validation middleware pattern for all socket events
- **Monitoring**: Implement transaction monitoring for anomalous wager/settlement patterns
- **Bug Bounty**: Launch a bug bounty program before handling real funds
- **Re-Audits**: Schedule security review after each major feature addition
- **Incident Response**: Have a plan for settlement failures and state recovery

---

## Audit Coverage

### Files Analyzed

<details>
<summary>Click to expand file list (12 files)</summary>

| File | Focus Areas | Findings |
|------|-------------|----------|
| `server/socket-io/main.js` | All 10 focuses | H001-H003, H006, H009, H011-H013, H015, H017, H019-H024, H036, H038-H039, H061-H062, H064, H068-H070, H073-H074 |
| `server/middleware/auth.js` | Access Control, Account Validation, Admin | H006, H007 |
| `server/services/solana.js` | Token/Economic, External Calls, Error Handling | H011, H016, H027, H064 |
| `server/services/physics.js` | Arithmetic, State Machine | H009, H012, H036 |
| `server/services/match.js` | State Machine, Timing | H019, H020, H022, H023 |
| `server/services/shot-token.js` | Token/Economic | H033, H034, H035 |
| `server/services/gold.js` | Token/Economic | H019, H036 |
| `server/services/monitoring.js` | Error Handling, Admin | H061 |
| `server/models/Weapon.js` | Account Validation | H039 |
| `server/models/Match.js` | State Machine, External | — |
| `server/index.js` | All focuses | H008, H061, H074 |
| `server/package.json` | External Calls | — |

</details>

### Analysis Depth by Area

| Focus Area | Files Covered | Findings |
|------------|---------------|----------|
| Access Control | 3 | 6 |
| Arithmetic & Input | 4 | 7 |
| State Machine | 3 | 6 |
| Token & Economic | 5 | 8 |
| Error Handling & Timing | 4 | 8 |
| **Total** | **12** | **35** |

---

## Methodology

This audit was performed using The Fortress methodology:

### Phase 0: Pre-Flight Analysis
- Analyzed codebase metrics: 12 source files, ~2,500 LOC
- Detected ecosystem: Node.js / Socket.IO / Solana
- Protocol patterns: PvP wager game, SPL token emissions, wallet authentication
- Recommended tier: standard (75 strategies, batch size 5)

### Phase 0.5: Static Pre-Scan
- Ran grep-based pattern scan across all source files
- Generated HOT_SPOTS.md with risk-prioritized file listing
- Identified 50+ hot-spot patterns across 6 categories

### Phase 1: Parallel Context Building
- 10 specialized auditors analyzed the entire codebase
- Each auditor focused on one security domain
- Applied micro-first analysis (5 Whys, 5 Hows, First Principles)

### Phase 2: Architectural Synthesis
- Merged all 10 context analyses
- Identified cross-cutting concerns
- Built unified security model with trust boundaries
- Documented 8 violated economic invariants

### Phase 3: Attack Strategy Generation
- Generated 75 attack hypotheses
- Drew from historical Solana exploits and DeFi attack patterns
- Tailored strategies to codebase-specific attack surface
- Prioritized into Tier 1 (8), Tier 2 (17), Tier 3 (50)

### Phase 4: Parallel Investigation
- 35 Tier 1/2 strategies investigated by 5 parallel agents
- Evidence-based determination of vulnerability status
- 34 CONFIRMED, 1 POTENTIAL, 0 cleared

### Phase 5: Final Synthesis
- Aggregated all findings
- Performed combination attack analysis (4 chains identified)
- CVSS scoring and prioritization
- Generated this report

---

## Disclaimer

This automated security audit represents a comprehensive starting point for security hardening but does not guarantee the absence of vulnerabilities.

**This audit does NOT replace:**
- Manual expert security review
- Formal verification where applicable
- Comprehensive test coverage
- Bug bounty programs
- Ongoing security monitoring

**Limitations:**
- 40 Tier 3 strategies were not investigated due to context constraints
- Business logic correctness is partially out of scope
- Economic attack viability requires market analysis
- Some findings may require verification against deployed infrastructure
- New vulnerabilities may emerge after code changes

**Recommendation:** Engage a professional security firm for a manual audit before mainnet deployment, especially given the volume of critical findings in the wager settlement system.

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report Generated | 2026-02-14 |
| The Fortress Version | 1.0.0 |
| Total Agent Invocations | ~30 |
| Context Files Generated | 10 |
| Strategies Generated | 75 |
| Strategies Investigated | 35 |
| Confirmation Rate | 97% (34/35) |

---

**End of Report**
