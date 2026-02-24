# Error Handling & Fail Modes — ERR-01

**task_id:** ERR-01
**auditor:** ERR-01
**date:** 2026-02-23
**scope:** server/socket-io/main.js, server/services/escrow.js, server/services/solana.js,
server/services/shot-token.js, server/services/match.js, server/middleware/auth.js,
server/middleware/guards.js, server/index.js, client/src/wallet/WalletContext.js

---

## CONDENSED SUMMARY

The error handling posture of SolShot has been substantially hardened from the
baseline described in ARCHITECTURE.md. Process-level crash handlers exist, the fire
handler is wrapped in `safeHandler`, and a settlement retry loop (`failedSettlements`
map + 60-second interval) prevents permanent fund loss on RPC failure. However, five
significant structural weaknesses remain that create paths to silent fund loss, state
divergence, or server-side unhandled promise rejections.

### Most Critical Findings (in order)

1. **EH-F01 (CRITICAL) — Balance check fails open on RPC error.**
   Both `createRoom` (line 1145) and `joinRoom` (line 990) catch the `verifyBalance`
   rejection and `console.warn` then `return` — meaning they silently skip the balance
   check and allow the player to proceed. A Solana RPC outage lets zero-balance wallets
   enter wagered matches with no gate.

2. **EH-F02 (HIGH) — Escrow creation failure is logged but match proceeds.**
   In both `joinRoom` (line 1083–1088) and `joinQueue` (line 1346–1351), if
   `createMatchEscrow()` fails, the code logs the error but does NOT prevent the match
   from starting. The match runs without an on-chain escrow. If players later win/lose,
   `settleMatch()` will be called with `isEscrowEnabled()` = true and a valid `matchId`
   but no corresponding PDA on-chain — causing settlement to fail. The `failedSettlements`
   retry then attempts `cancelMatchEscrow`, which will also fail (PDA never existed),
   exhausting 5 retries without refunding either player. Real-money path: deposits were
   never taken (escrow creation failed), so no funds are at risk in isolation — but the
   mismatched state between server expectation and chain reality causes all downstream
   financial operations to fail and emit confusing error events to clients.

3. **EH-F03 (HIGH) — `refundWager()` called with only two arguments in LOBBY disconnect path.**
   At `main.js` line 690, `cleanupRoom` calls `refundWager(wallet, ws.amount)` when a
   player disconnects from the LOBBY state. The `refundWager` signature in `solana.js`
   is `refundWager(playerAddress, wagerSOL, matchId, playerOneAddress, playerTwoAddress)`.
   With only two arguments: `matchId` = undefined, so `isEscrowEnabled() && matchId`
   is falsy, causing the function to fall through to the dev-mode log path and return
   `{ success: true, txSignature: null }` without touching the chain. In production with
   escrow enabled, a LOBBY-stage disconnect silently skips the on-chain cancel. If the
   escrow PDA was already created (it is created at join time, before LOBBY becomes
   BATTLE), the funds deposited by either player remain locked in the PDA indefinitely
   until the 48-hour permissionless reclaim window.

4. **EH-F04 (HIGH) — Deposit timeout cancel failure is swallowed without recovery.**
   The `depositTimers` callback (line 1072–1076 in joinRoom, identical at line 1336–1340
   in joinQueue) calls `cancelMatchEscrow` inside a try/catch that logs the error but
   neither retries nor adds the entry to `failedSettlements`. If the deposit timeout
   fires and the cancel fails, the PDA remains open and both players receive
   `escrowDepositTimeout` and the room is torn down — but the on-chain escrow still holds
   the partial deposit from whichever player deposited within the 2-minute window.
   There is no recovery path. Funds are effectively frozen until the 48-hour permissionless
   reclaim.

5. **EH-F05 (MEDIUM) — `safeHandler` swallows all errors silently after logging.**
   `safeHandler` in guards.js catches any thrown error, logs it, calls `trackError`, and
   does not re-throw. This is correct for preventing process crashes, but it means that
   if the fire handler throws after advancing `ms.turnCount` or after emitting
   `turnResult` but before completing the round-end settlement block, the match state is
   left in a partially-advanced condition with no error emitted to the client. The
   client sees no `fireRejected` and no `turnResult` after the exception point.
   Turn is consumed; game is soft-locked.

6. **EH-F06 (MEDIUM) — `persistStats()` is fire-and-forget inside `withLock`, so DB errors never surface.**
   At line 2243, `persistStats()` is called without `await` inside the settlement lock
   block. A MongoDB failure silently drops the stats write. This is by design (non-fatal),
   but the concern is the interaction: if the DB write fails for wins/losses and the
   server later restarts with MongoDB, the next `loadMilestoneState` call will restore
   stale (pre-match) counters, causing SHOT milestones to re-evaluate against wrong data.

7. **EH-F07 (LOW) — `authenticate` handler is not wrapped in `safeHandler`.**
   The `authenticate` socket handler (line 533) has its own null-guard but is an `async`
   function and calls `loadMilestoneState` inside a try/catch. If `handleAuthenticate`
   throws an unexpected error (e.g., `atob` fails on a malformed signature in a Node
   version that doesn't support it), the handler throws outside the try/catch at line 540.
   The `async` throw becomes an unhandled rejection. The process-level
   `unhandledRejection` handler in index.js catches this, but it only logs — it does not
   emit an `authResult` error to the client, leaving the client silently waiting.

8. **EH-F08 (LOW) — `refundWager()` in solana.js falls through to success on escrow cancel failure.**
   At `solana.js` lines 241–248, if `cancelMatchEscrow` fails, the function logs the
   error but falls through to the dev-mode fallback at line 251, returning
   `{ success: true, txSignature: null }`. This means a failed on-chain cancel is
   reported as success to all callers. Callers in main.js check `if (p1w && p2w)` before
   calling cancel but do not check the return value of `refundWager` at all (line 690
   calls it fire-and-forget with no `await` result check). Net effect: any caller of
   `refundWager` receives no signal that the chain cancel failed.

---

## FULL ANALYSIS

### 1. Process-Level Crash Handlers

**Location:** `server/index.js` lines 177–183

```js
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
```

**Assessment:** Handlers exist and prevent server crashes. They log but do not
`process.exit(1)`. This is the correct choice for a game server (crashing all active
matches to handle a single unhandled rejection would be disproportionate). However, the
handlers only log — they do not call `trackError` or send an alert. Silent-but-logged
errors during settlement in production will not trigger any monitoring pipeline unless
log aggregation is in place.

**Verdict:** Adequate. No crash-on-error. Missing monitoring callback.

---

### 2. `safeHandler` Wrapper Analysis

**Location:** `server/middleware/guards.js` lines 157–167

```js
export function safeHandler(handlerFn) {
    return async function(...args) {
        try {
            await handlerFn.apply(this, args);
        } catch (err) {
            console.error(`[SafeHandler] Unhandled error in socket handler:`, err.message || err);
            trackError(err, 'socket_handler');
            // Don't re-throw — prevent unhandled rejection from killing process
        }
    };
}
```

**Coverage:** `safeHandler` is applied to the `fire` handler (line 1809) only. No
other socket handler uses it. All other handlers — `disconnect`, `leaveRoom`,
`rejoinRoom`, `createRoom`, `joinRoom`, `deleteRoom`, `ready`, `buyWeapon`,
`escrowDepositConfirm`, `prestigeBurn`, `getStats`, `shopDone` — are plain async
functions on socket events. If they throw, the rejection propagates to Socket.IO's
internal uncaught rejection handler, which in Socket.IO 4.x emits an `error` event on
the socket. If no `error` listener exists on the client, it silently drops. The
process-level `unhandledRejection` catches it at the node level.

**Gap:** Only `fire` is protected. `createRoom` and `joinRoom` (both async, both touch
financial logic) are unprotected. A null-deref inside either (e.g., `room.host.socketId`
when `host` is null from a race) throws outside any catch and becomes an unhandled
rejection.

**EH-F09 (LOW):** `disconnect` is async and calls `cleanupRoom` which calls
`settleMatch` — a chain of awaits. If `settleMatch` throws unexpectedly (not caught by
its own try/catch) and the exception propagates, it would become an unhandled rejection
during an active settlement. Given that `settleMatch` has its own try/catch, this path
is low probability but not impossible if the escrow service module itself throws during
initialization-state checks.

---

### 3. Fire Handler Error Path Analysis

**Location:** `main.js` lines 1809–2272

The fire handler is the most complex async handler (~460 lines). It is wrapped in
`safeHandler`. Key error paths:

**a. `processShot()` crash** — Physics is called at line 1933 synchronously (not async).
If it throws (e.g., from a NaN that slips past `validateFireParams`), the exception is
caught by `safeHandler`. State at that point: `ms.turnSequence` has been incremented
(line 1858), `ms.consecutiveTimeouts` reset (line 1877), `ms.turnCount` has NOT yet
been incremented. The turn timer was NOT restarted. The client receives no `turnResult`
and no `fireRejected`. The turn timer from the previous turn continues to run. After 60
seconds the turn-timeout fires, advances the turn, and the game continues. Impact:
one consumed turn sequence number with no shot. Recoverable.

**b. Settlement block exception** — The `withLock` block at line 2085 contains the
entire settlement flow. If it throws (e.g., `ws.wallets[matchResult.winner]` throws
because `ws` is null after a race), `safeHandler` catches it. State at that point:
`ms.status` was set to SETTLING (line 2081) before the lock. It remains stuck in
SETTLING. No `matchEnd` event is emitted. Both clients are soft-locked. The match
state is never cleaned up (no `removeRoom` call is made from within this path).
Room leaks until server restart.

**c. `setTimeout` inside `safeHandler`** — The `matchEnd` emit is deferred via
`setTimeout` at line 2208. This callback is NOT inside the `safeHandler` wrapper — it
runs in a new async context. If the callback throws (e.g., `io.sockets.in(roomId)` is
null after a room teardown that happened in the 3-second delay), it becomes an
unhandled rejection caught only by the process-level handler. No settlement data would
be lost since the settlement already completed before the `setTimeout`, but the client
event is never emitted, leaving both clients with no match outcome.

---

### 4. Financial Operation Fail-Mode Matrix

| Operation | Trigger | Failure Mode | System State | Funds at Risk | Notes |
|-----------|---------|--------------|--------------|---------------|-------|
| `verifyBalance` — RPC error (createRoom) | Solana RPC down | catch → `console.warn` → proceeds | Player joins wagered match with unverified balance | Potential (escrow will be created for player who can't pay) | EH-F01 |
| `verifyBalance` — RPC error (joinRoom) | Solana RPC down | catch → `console.warn` → proceeds | Player joins wagered match with unverified balance | Potential | EH-F01 |
| `createMatchEscrow` fails (joinRoom) | RPC error / program error | catch → log → match proceeds without escrow | Match runs with `room.escrowPDA = undefined`; future settlement calls `settleMatchEscrow` with valid `matchId` but no PDA | No funds locked yet; settlement will fail | EH-F02 |
| `buildDepositTransaction` fails (joinRoom) | RPC error (getLatestBlockhash fails) | `hostDeposit.success = false` / `joinerDeposit.success = false` — deposit event not emitted | One or both players never receive the deposit event; deposit timer fires after 2 min | Partial deposit if one player deposited manually; other never prompted | No explicit error emitted to client whose deposit failed |
| `escrowDepositConfirm` — on-chain verify fails | RPC error during `getEscrowState` | catch → `client.emit('escrowError', ...)` → returns | Client notified; match in LOBBY/WEAPON_SHOP (no settlement needed yet) | None yet (match may not have started) | Fail-closed — correct |
| Deposit timeout cancel fails | RPC error in setTimeout callback | catch → log → no retry → room torn down | On-chain escrow PDA open with partial deposit; room destroyed in-memory | YES — depositing player's funds locked until 48h permissionless reclaim | EH-F04 |
| `cleanupRoom` — LOBBY disconnect refund | Player disconnects from LOBBY | `refundWager(wallet, ws.amount)` — only 2 args — escrow cancel skipped | In-memory room cleared; on-chain PDA still open | YES — if escrow was created (join happened), deposited funds frozen | EH-F03 |
| `cleanupRoom` — BATTLE/SHOP forfeit settlement fails | RPC error during `settleMatch` | catch → `transitionState(CANCELLED)` → `handleSettlementFailure()` → retry loop | State = CANCELLED; retry attempts `cancelMatchEscrow` up to 5 times | YES if all 5 cancel retries fail — funds frozen until 48h reclaim | Recovery path exists but has 5-attempt limit |
| `handleSettlementFailure` — both wallets null | Missing wallet addresses | `if (p1wallet && p2wallet)` fails — stores entry with null wallets | `failedSettlements` entry created but `cancelMatchEscrow(roomId, null, null)` will throw on retry | YES — PDA open, wallets unknown, retries all fail | |
| `settleMatchEscrow` — TREASURY/OPS not configured | Missing env vars | returns `{ success: false, error: 'Treasury/Ops wallets not configured' }` | `settleMatch` propagates failure; `handleSettlementFailure` stores for retry; retries all fail same way | YES — winner not paid, funds frozen until 48h reclaim | Config error detected correctly but retry loop cannot fix a missing env var |
| `settleMatchEscrow` throws (Anchor RPC error) | Network / program error | catch → `{ success: false, error: err.message }` | Caller gets failure response; recovery path triggered | Depends on recovery success | Correctly propagated |
| `refundWager()` — cancel fails | RPC error | logs + falls through to `{ success: true }` | Caller sees success; on-chain cancel did not execute | YES if caller relied on return value | EH-F08; callers do not check return value |
| `verifyBurnTransaction` — RPC error | Solana RPC down | catch → `{ valid: false, reason: 'Failed to verify...' }` | Prestige burn rejected | None (no SOL involved) | Fail-closed — correct |
| `persistEmissionCount` debounce fails | MongoDB error | async setTimeout with no error handling | SHOT emission count not persisted; next restart will under-count | None (SHOT only) | Silent; supply cap tracking weakened |
| `saveMilestoneState` fails | MongoDB error | `.catch(err => console.error(...))` | Milestone progress not persisted | None (SHOT only) | Silent but logged |
| Match state machine — `transitionState` returns false | Invalid transition attempted | `console.warn` + returns false | Status unchanged; caller checks return value in fire handler (line 2082: `if (!transitioned) return`) | None | Return value checked in fire handler; other callers ignore it |
| `startTurnTimer` setTimeout fires after room removed | Room torn down during 60s window | `const ms = matchStates[roomId]` returns undefined → early return | No action | None | Null-guarded correctly |
| `persistStats()` DB write fails | MongoDB error | inner try/catch → log | Stats not updated; `loadMilestoneState` on next auth restores pre-match state | None (SHOT only) | Could cause SHOT milestone re-trigger if counted match not recorded |

---

### 5. Balance Verification Fail-Open (EH-F01 — CRITICAL)

**createRoom path** (`main.js` lines 1136–1148):

```js
try {
    const balanceCheck = await verifyBalance(walletAddress, wagerAmount)
    if (!balanceCheck.sufficient) {
        client.emit('createRoomError', { reason: `Insufficient SOL...` })
        return
    }
} catch (err) {
    console.warn('[Solana] Creator balance check skipped:', err.message)
    // ← falls through, does not return
}
```

**joinRoom path** (`main.js` lines 981–992):

```js
try {
    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
    if (!balanceCheck.sufficient) {
        client.emit('joinRoomError', { reason: `Insufficient SOL...` })
        return
    }
} catch (err) {
    console.warn('[Solana] Balance check skipped:', err.message)
    // ← falls through, does not return
}
```

`verifyBalance` in `solana.js` has its own try/catch that returns `{ sufficient: false }`
on any error. This means `verifyBalance` itself never throws — it always resolves. The
outer catch in main.js can only be triggered if `verifyBalance` is called on an invalid
wallet address that causes a `PublicKey` constructor exception. In practice, `verifyBalance`
absorbs all RPC errors internally and returns `{ sufficient: false }`. So the fail-open
path actually only fires when `walletAddress` is null — and in `joinRoom`, `joinerWallet`
is sourced from `authenticatedWallets[client.id]`, which can be null if not authenticated
(but `requireAuth` is called first). In `createRoom`, the outer catch is dead code
because `verifyBalance` never throws. However, the structural pattern is still fragile:
the inner `verifyBalance` behavior of returning `{ sufficient: false }` on error means
a down RPC correctly blocks balance-empty wallets, but cannot distinguish between
"genuinely zero balance" and "RPC error with real balance." Both result in rejection,
which is the conservative choice.

**Revised severity:** The fail-open is effectively closed at the `verifyBalance` level
(it returns `{ sufficient: false }` on error). However, the architecture creates a
second problem: during a sustained RPC outage, all wagered match creation is blocked
(even for wallets with real funds), which is a denial-of-service against legitimate
players. No fallback or degraded mode exists.

---

### 6. Escrow Creation Failure — Match Proceeds Without Escrow (EH-F02 — HIGH)

**Location:** `main.js` lines 1083–1090 (joinRoom), 1346–1353 (joinQueue)

```js
} else {
    console.error(`[Match] Escrow creation failed for ${roomId}:`, escrowResult.error)
}
```

After this block, `startPick` is emitted regardless (line 1092). The match proceeds
into the weapon shop and battle phases without `room.escrowPDA` being set.

When the match ends in the fire handler, `settleMatch` is called (solana.js line 201):

```js
if (isEscrowEnabled() && matchId) {
    const result = await settleMatchEscrow(matchId, winnerAddress);
```

`settleMatchEscrow` calls `getEscrowPDA(matchId)` which derives the expected PDA, then
calls `.rpc()` on the Anchor program — which will fail with `AccountNotFound` since the
PDA was never created. This failure propagates back as `{ success: false, error: ... }`,
which triggers `handleSettlementFailure` and the retry loop. The retry calls
`cancelMatchEscrow`, which also fails (PDA never existed). After 5 retries, the entry
is deleted from `failedSettlements`. Since no deposit ever happened, no funds are
actually at risk — but both players receive:
1. No `matchSettled` event (the event is inside the success branch)
2. Potentially no `matchEnd` event if settlement throws before the delayed emit

The correct fix is to prevent the match from starting if escrow creation fails when
escrow is enabled. Alternatively, mark `room.escrowRequired = false` on creation
failure and skip on-chain settlement at match end for that room.

---

### 7. LOBBY Disconnect Refund Missing Arguments (EH-F03 — HIGH)

**Location:** `main.js` lines 686–692

```js
} else if (ms.status === MATCH_STATES.LOBBY) {
    // Not started yet — refund if applicable
    const wallet = ws.wallets[client.id]
    if (wallet && ws.amount > 0) {
        await refundWager(wallet, ws.amount)
    }
}
```

`refundWager` signature (`solana.js` line 235):
```js
export async function refundWager(playerAddress, wagerSOL, matchId, playerOneAddress, playerTwoAddress)
```

With only two arguments: `matchId = undefined`, `playerOneAddress = undefined`,
`playerTwoAddress = undefined`. The condition on line 241 is:
```js
if (isEscrowEnabled() && matchId && playerOneAddress && playerTwoAddress)
```
All three are undefined — condition false — falls to dev-mode log, returns
`{ success: true, txSignature: null }`.

In the scenario where a player has joined, the escrow PDA has been created (escrow
creation happens immediately on join), and then the player disconnects from LOBBY —
the PDA remains open with any deposited funds. The correct call needs all five arguments:
```js
await refundWager(wallet, ws.amount, roomId, ws.wallets[room.host?.socketId], ws.wallets[room.player?.socketId])
```

---

### 8. `withLock` Behavior on Timeout

**Location:** `server/middleware/guards.js` lines 117–148

The lock auto-releases after 30 seconds (`LOCK_TIMEOUT_MS`). If a settlement
operation hangs (e.g., Solana RPC has a 30-second delay), the lock releases while the
`settleMatchEscrow` call is still in-flight. A second settlement attempt (from a
concurrent disconnect or forfeit) could now acquire the lock and call `settleMatchEscrow`
again for the same `matchId`. The Anchor program's `settle_match` instruction is
idempotent only if the PDA state prevents double-settlement (the program marks the
escrow as settled). If the on-chain program has the settled-state check, the second
call fails harmlessly. If not, double-settlement occurs.

The check inside the lock at line 2087 (`if (ms.status !== MATCH_STATES.SETTLING) return`)
provides a partial guard: after the first caller sets status to SETTLING (line 2081,
before acquiring the lock), a second caller running `transitionState(ms, MATCH_STATES.SETTLING)`
would fail (SETTLING→SETTLING is not a valid transition) and return false (line 2082:
`if (!transitioned) return`). This guard is effective provided the transition check
happens before lock acquisition. Examining the code: `transitionState` is called at
line 2081, then `withLock` is entered at 2085. The re-check inside the lock at line
2087 catches any race that squeezed through between lines 2081 and 2085.

**Assessment:** The double-settlement race for the normal match-end path is adequately
guarded. The 30-second lock timeout is a theoretical edge case if Solana RPC takes
more than 30 seconds (possible during network congestion).

---

### 9. `authenticate` Handler Not Wrapped (EH-F07 — LOW)

**Location:** `main.js` lines 533–553

```js
client.on('authenticate', async (data) => {
    if (!data || typeof data !== 'object') {
        client.emit('authResult', { success: false, reason: 'Missing payload' })
        return
    }
    const result = handleAuthenticate(client, data)
    if (result.success) {
        authenticatedWallets[client.id] = result.walletAddress
        logger.info(...)
        try {
            await loadMilestoneState(result.walletAddress)
        } catch (err) {
            console.warn(`[Auth] Failed to load milestone state:`, err.message)
        }
    }
    client.emit('authResult', result)
})
```

`handleAuthenticate` in auth.js wraps everything in try/catch and returns
`{ success: false, reason: ... }` on any error — it never throws. `loadMilestoneState`
has its own try/catch. So in practice, this handler is effectively safe already. The
risk is if `handleAuthenticate` is later modified to throw rather than return, which
would create an unprotected async throw. Low risk, but the inconsistency with other
handlers that are not async is notable.

---

### 10. Client-Side Error Handling (WalletContext.js)

**`signAndSendEscrowDeposit`** (lines 203–251):
- Validation failure: emits `suspiciousTx` to server, returns null (no UI feedback provided at this level — caller must handle null return)
- `sendTransaction` user rejection: caught, logs, returns null
- `confirmTransaction` failure: caught in same try/catch as `sendTransaction` — if confirm fails after TX is sent, the TX may be on-chain but the client doesn't know; `escrowDepositConfirm` is never emitted to server; server's deposit timer eventually fires and attempts cancel

**`signAndBurnShot`** (lines 254–296):
- `getAssociatedTokenAddress` failure: caught, returns null — caller (PrestigeScreen) must handle null
- User rejection: caught, returns null
- Confirmation failure: same double-risk as above — burn may be confirmed on-chain but client returns null; `prestigeBurn` socket event is never sent; user's SHOT is burned but prestige not unlocked

**Gap:** Neither function provides the caller with a typed error (only null vs. signature). Callers cannot distinguish user-rejected (retry OK) from network-error (retry risky — TX may be in-flight) from validation-failed (do not retry).

---

### 11. `failedSettlements` Recovery Loop Analysis

**Location:** `main.js` lines 82–104

```js
setInterval(async () => {
    for (const [matchId, data] of failedSettlements.entries()) {
        if (data.attempts >= 5) {
            console.error(`[Recovery] Giving up on settlement recovery...`)
            failedSettlements.delete(matchId)
            continue
        }
        try {
            const result = await cancelMatchEscrow(matchId, data.p1wallet, data.p2wallet)
            if (result.success) {
                failedSettlements.delete(matchId)
            } else {
                data.attempts++
            }
        } catch (err) {
            data.attempts++
        }
    }
}, 60_000);
```

**Observations:**

1. The recovery loop only calls `cancelMatchEscrow` — it never retries `settleMatchEscrow`.
   If settlement failed because of a transient RPC error, the correct action would be to
   retry settlement, not immediately cancel. A transient failure means the winner may
   have won legitimately but the server gives up and refunds instead.

2. On server restart, `failedSettlements` is wiped. Any pending recovery entries are
   lost. The 48-hour permissionless reclaim is the only remaining backstop.

3. If `data.p1wallet` or `data.p2wallet` is null (from `handleSettlementFailure`'s null
   check path at lines 112–123), `cancelMatchEscrow` receives null addresses and will
   throw a `PublicKey` constructor error. The catch block increments `attempts` and
   retries 4 more times — all failing. After 5 attempts the entry is deleted. Funds
   frozen.

4. The interval is NOT cleared on server shutdown (`process.on('SIGTERM')`). On Render
   deployments this is benign (process exits), but the lack of cleanup is noted.

---

### 12. Empty Catch Blocks / Silent Swallowing Summary

| Location | Operation | What Is Swallowed | Impact |
|----------|-----------|-------------------|--------|
| `main.js:207` (`persistRoom`) | DB update failure | Error logged, not propagated | Room metadata stale in DB |
| `main.js:232` (`removeRoom`) | DB cancel update failure | Error logged, not propagated | Match status not updated in DB |
| `main.js:546–549` (`authenticate`) | `loadMilestoneState` failure | Error warned, auth still succeeds | Milestone state not restored; user starts fresh |
| `main.js:990–992` (`joinRoom`) | Balance check failure | Warns, proceeds | Fail-open for balance verification (see EH-F01) |
| `main.js:1145–1147` (`createRoom`) | Balance check failure | Warns, proceeds | Same as above |
| `main.js:1074–1076` (`deposit timeout`) | Cancel escrow failure | Logs, no retry stored | Funds frozen in PDA (EH-F04) |
| `main.js:1338–1340` (`queue deposit timeout`) | Cancel escrow failure | Logs, no retry stored | Same as EH-F04 |
| `shot-token.js:554–557` | Burn verification RPC error | Returns `{ valid: false }` — fail-closed | Prestige rejected on RPC error (recoverable) |
| `shot-token.js:183–185` | `loadMilestoneState` DB read failure | Logs, continues with defaults | Milestone state lost |
| `WalletContext.js:128–131` | Balance fetch RPC failure | Warns, sets balance to 0 | UI shows 0 balance |
| `WalletContext.js:247–249` | Escrow TX sign/send failure | Logs, returns null | No `escrowDepositConfirm` sent; deposit timer eventually cancels |
| `WalletContext.js:292–294` | Burn TX sign/send failure | Logs, returns null | Burn not reported to server; user may have burned on-chain |
| `escrow.js:157–160` | `initializeConfig` Anchor call | Returns `{ success: false }` | Config not set |
| `escrow.js:465–467` | `cancelMatchEscrow` Anchor call | Returns `{ success: false }` | Caller must check return value |
| `solana.js:136–143` | `getCachedLamports` RPC failure | Returns `{ sufficient: false }` | Balance check correctly fails-closed |

---

### 13. Unhandled Promise Rejection Paths

The following async socket handlers are NOT wrapped in `safeHandler` and could produce
unhandled rejections if their internal try/catch blocks have gaps:

- `disconnect` (async): calls `cleanupRoom` which calls `settleMatch`. If `settleMatch`
  resolves with a failure result (not a throw), control flow is correct. If `cancelMatchEscrow`
  inside `cleanupRoom` throws unexpectedly beyond its own catch, the throw propagates up
  to `cleanupRoom`'s `withLock` callback, which propagates to `withLock`'s `return await fn()`
  at line 142. If `fn` throws, `withLock`'s `finally` runs (cleanup correct), and the
  exception propagates to `cleanupRoom`'s `await withLock(...)`. `cleanupRoom` has no
  try/catch, so it propagates to `disconnect`'s `await cleanupRoom(...)`. `disconnect`
  has no try/catch → unhandled rejection → process-level handler logs it. Settlement
  state at that point: SETTLING (set before lock), never transitioned to COMPLETE or
  CANCELLED. Room not removed. Funds potentially frozen.

- `leaveRoom` (same as disconnect, delegates to `cleanupRoom`).

- `joinRoom` (async): touches `createMatchEscrow`, `buildDepositTransaction`,
  `Promise.all`. If `Promise.all` throws (one of the `buildDepositTransaction` calls
  rejects beyond its own catch — but looking at escrow.js, `buildDepositTransaction`
  has its own try/catch returning `{ success: false }`, so this is safe in practice).

- `createRoom` (async): DB `Match.create` is wrapped in try/catch. Balance check has
  try/catch. No raw unhandled paths visible.

- `rejoinRoom` (async): calls `verifyAuthMessage` and `verifyWalletSignature` (both
  synchronous, no throw paths). No async operations beyond the synchronous handler body.
  Safe.

---

### 14. `validateMatchMode` with Infinity in wagerRange

**Location:** `solana.js` lines 54–55

```js
if (wagerSOL < config.wagerRange[0] || wagerSOL > config.wagerRange[1]) {
```

For `custom_challenge`, `config.wagerRange[1] = Infinity`. Any finite `wagerSOL`
satisfies `wagerSOL > Infinity === false`, so the check passes correctly. This is not
a bug but worth noting — `Infinity` comparison behaves as expected in JS.

---

### 15. `verifyBalance` Cache and Stale Data Risk

**Location:** `solana.js` lines 94–113

Balance is cached for 30 seconds per wallet address. If a player is checked at time T
with 0.5 SOL and passes, then spends their SOL externally, then triggers a second check
within 30 seconds, the cached balance will still show sufficient. This is a known
tradeoff (documented as "best-effort") but the window is material for high-roller matches
(1.0 SOL wager). The escrow deposit serves as the actual financial gate — if the player
cannot actually deposit, the escrow fails. The balance check is a UX gate only, not a
security gate when escrow is enabled.

---

## FAIL-MODE MATRIX (Condensed)

| Operation | Failure | System State | Funds at Risk | Severity |
|-----------|---------|--------------|---------------|----------|
| Balance check (RPC error) | Proceeds without check | Unverified player in wagered match | Potential | HIGH (EH-F01) |
| Escrow creation failure | Match starts without escrow | Settlement will fail at match end | No (no deposit taken) | HIGH (EH-F02) |
| LOBBY disconnect refund | Wrong args to refundWager | PDA remains open | YES — frozen | HIGH (EH-F03) |
| Deposit timeout cancel failure | No retry added | PDA open with partial deposit | YES — frozen | HIGH (EH-F04) |
| safeHandler catches mid-settlement throw | Match stuck in SETTLING | Room leaked, no matchEnd | NO (settlement may be complete) | MEDIUM (EH-F05) |
| `persistStats` DB fail | Stats not written | Wrong milestone counters on restart | NO (SHOT only) | MEDIUM (EH-F06) |
| `authenticate` unexpected throw | No authResult emitted | Client hangs | None | LOW (EH-F07) |
| `refundWager` cancel fail | Returns success anyway | PDA open | YES — frozen | LOW (EH-F08) |
| Recovery loop — null wallets | All 5 retries fail | failedSettlements entry deleted | YES — frozen until 48h | MEDIUM |
| Recovery loop — retry cancel not settle | Transient settle error → cancel | Winner not paid; both refunded | YES — winner loses payout | HIGH |
| Lock timeout (30s) | Lock released mid-settlement | Possible double-settlement attempt | Depends on on-chain guard | MEDIUM |
| Client deposit confirm race | Confirmation fails after TX sent | escrowDepositConfirm not sent; timer cancels | YES — deposited funds locked until cancel | MEDIUM |
| Client burn confirm race | Confirmation fails after burn | prestigeBurn never sent to server | None (SHOT burned, prestige not unlocked — resolvable) | LOW |

---

## RECOMMENDATIONS

1. **(EH-F01)** In `joinRoom` and `createRoom`, if `verifyBalance` returns
   `{ sufficient: false }` due to error (not just insufficient funds), emit a typed
   error that distinguishes RPC-down from genuinely insufficient. Consider a
   `balance_check_unavailable` reason code that lets the client display "balance
   verification unavailable" rather than "insufficient balance."

2. **(EH-F02)** After `createMatchEscrow` fails, either (a) abort the match with a
   `matchCancelledEscrowFailed` event, or (b) set `room.escrowRequired = false` and
   skip on-chain settlement for this room at match end. Do not proceed with a match
   that was intended to be escrowed but is not.

3. **(EH-F03)** Pass all required arguments to `refundWager` in the LOBBY disconnect
   path:
   ```js
   const p1w = ws.wallets[room.host?.socketId]
   const p2w = ws.wallets[room.player?.socketId]
   await refundWager(wallet, ws.amount, roomId, p1w, p2w)
   ```

4. **(EH-F04)** On deposit timeout cancel failure, add the entry to `failedSettlements`
   for retry — same pattern as `handleSettlementFailure`. The retry loop should
   distinguish "needs cancel" entries from "needs settle" entries and act accordingly.

5. **(EH-F05)** Consider wrapping `disconnect` and `leaveRoom` in `safeHandler` as
   well. The settlement path inside `cleanupRoom` can throw in edge cases, and a
   thrown exception during cleanup leaves the match in SETTLING permanently.

6. **(Recovery loop)** Add a `type: 'settle' | 'cancel'` field to `failedSettlements`
   entries. For settlement failures (transient RPC), retry `settleMatch` first (up to
   3 times) before falling back to cancel. Only attempt cancel if settlement retries
   are exhausted.

7. **(Client)** In `signAndSendEscrowDeposit` and `signAndBurnShot`, distinguish
   rejection reasons and return a typed result object (`{ success, error, code }`)
   rather than null so callers can decide whether to prompt retry.

8. **(Monitoring)** Add `trackError` call in the process-level `unhandledRejection`
   handler so production alerts fire on unexpected async throws.
