---
task_id: db-phase1-err-01
provides: [err-01-findings, err-01-invariants]
focus_area: ERR-01
files_analyzed:
  - server/services/solana.js
  - server/services/escrow.js
  - server/services/escrow-v2.js
  - server/services/groupchat/scheduler.js
  - server/services/groupchat/lifecycle.js
  - server/services/privyAuth.js
  - server/socket-io/main.js
  - server/index.js
finding_count: 11
severity_breakdown: {critical: 2, high: 4, medium: 3, low: 2}
---

<!-- CONDENSED_SUMMARY_START -->
# ERR-01: Error Handling & Fail Modes — Condensed Summary

## Key Findings (Top 10)

- **refundWager fail-open confirmed**: On-chain cancel failure falls through to `return { success: true }` — caller believes refund succeeded even when escrow funds were NOT returned — `server/services/solana.js:252-258`
- **groupchat settle failure silently dropped**: `settleMatchEscrowV2` failure (RPC down, account not found) is logged then discarded; no retry, no alerting, match stays in settled DB state with unrecovered on-chain pot — `server/services/groupchat/lifecycle.js:861-870`
- **failedSettlements exits silently after 5 attempts**: After 5 cancel retries, entry is deleted with only a `console.error` — no external alert, no ops notification, funds may remain stranded on-chain — `server/socket-io/main.js:329-331`
- **uncaughtException swallows without crashing**: `process.on('uncaughtException')` logs only — server continues running in unknown state, allowing subsequent requests to hit corrupted in-memory match state — `server/index.js:614-616`
- **unhandledRejection swallows without crashing**: Same pattern — async escrow failures that propagate to top level do not terminate the process — `server/index.js:618-620`
- **Privy auth fail-open when env not set**: `requirePrivyAuth({required: true})` on `/api/wallet/link-from-privy-telegram` still calls `getClient()` → returns `null` → calls `next()` with no auth when `PRIVY_APP_SECRET` absent — `server/services/privyAuth.js:64-66`
- **No MongoDB reconnect handling**: After initial connect, no `connection.on('error')` or `connection.on('disconnected')` handler — a mid-session DB drop causes all subsequent `User.findOne` / `Match.save` calls to throw unhandled rejections caught only by the global handler — `server/index.js:544-586`
- **Mongoose bufferCommands default (true)**: With no reconnect configuration, `mongoose.connect` default `bufferCommands: true` means DB operations silently queue indefinitely on a dropped connection — never timing out, never erroring to the caller — `server/index.js:545`
- **scheduler fireCallback swallows thrown errors**: If `onTimeoutCallback` (lifecycle.handleIdleTimeout) throws, the error is caught and logged but the timer is already deleted — no rescheduling, idle turn never resolved — `server/services/groupchat/scheduler.js:133-138`
- **No RPC timeout or retry configuration**: All `.rpc()` calls in escrow.js and escrow-v2.js use the default Anchor timeout (~30s); no custom `commitment`, `maxRetries`, or fallback RPC — a devnet RPC spike hangs the call until Anchor's internal timeout — `server/services/escrow.js:304, 415, 463`
- **setupBotWebhook in no-DB path has no .catch**: `server/index.js:589` — `setupBotWebhook(app).then(...)` has no `.catch()`, so a webhook registration failure in no-DB mode is an unhandled rejection swallowed by the global handler

## Critical Mechanisms

- **refundWager()**:  Wrapper that calls `cancelMatchEscrow()` when escrow enabled. If that call returns `{success: false}`, the function logs the error and then falls through to the always-`{success: true}` fallback at line 258 — `server/services/solana.js:240-258`
- **failedSettlements retry queue**: In-memory `Map` in `main.js` retried every 60s for up to 5 attempts via `setInterval`. On attempt 5, deleted silently. In-memory only — lost on restart. Non-contiguous deposit masks are immediately deleted without retry — `server/socket-io/main.js:318-356`
- **groupchat settle path**: `setImmediate` async block in `lifecycle.js:settleMatch()` calls `settleMatchEscrowV2()` with no retry queue. If result is failure, logs and continues — no retry, no fallback to `cancelMatchEscrowV2()`, no ops alert — `server/services/groupchat/lifecycle.js:848-870`
- **process-level handlers**: Both `uncaughtException` and `unhandledRejection` log to console but call no `process.exit()` — server stays up in potentially corrupted state — `server/index.js:614-620`

## Invariants & Assumptions

- INVARIANT: `refundWager()` returns `{ success: false }` when on-chain cancel fails — NOT ENFORCED: always returns `{ success: true }` at line 258, even after a failed cancel — `server/services/solana.js:252-258`
- INVARIANT: Failed settlements are durably tracked until recovered or manually resolved — NOT ENFORCED: `failedSettlements` Map is in-memory; lost on restart. No DB persistence of failure state — `server/socket-io/main.js:319`
- INVARIANT: Privy auth is enforced on `/api/wallet/link-from-privy-telegram` — PARTIALLY ENFORCED: `required: true` is set, but `getClient()` returns `null` when env vars absent, which calls `next()` — `server/services/privyAuth.js:64-66`
- ASSUMPTION: MongoDB connection stays up after initial connect — UNVALIDATED: No `mongoose.on('disconnected')` handler, no reconnect options configured, `bufferCommands: true` means calls silently queue — `server/index.js:545`
- ASSUMPTION: `settleMatchEscrowV2` failures are acceptable because permissionless_reclaim fires after 24h — PARTIALLY VALID: True for v2 wagered matches, but the 24h grace means players wait up to 24h+ for funds if settle fails at match end — `server/services/groupchat/lifecycle.js:862-865`
- ASSUMPTION: `fireCallback` in scheduler always receives a live match — UNVALIDATED: If match was deleted from DB between timer fire and callback execution, `handleIdleTimeout` may throw, caught by scheduler's try/catch with no rescheduling — `server/services/groupchat/scheduler.js:127-138`

## Risk Observations (Prioritized)

1. **refundWager CRITICAL fail-open**: `server/services/solana.js:252-258` — When `cancelMatchEscrow` fails, server tells callers refund succeeded. Players who disconnected during a wagered match are told their wager was returned; in reality the PDA still holds their SOL. No one is alerted. Risk: stranded player funds with false assurance.
2. **groupchat settle silently dropped (no retry)**: `server/services/groupchat/lifecycle.js:861-869` — v2 settle failure on RPC hiccup leaves funds locked in PDA. Only recovery is permissionless_reclaim after 24h. No ops alert. Match DB marked as settled with no `settlementTx`. Risk: winner loses their winnings for 24h+ with no visibility.
3. **failedSettlements drop after 5 retries (no alert)**: `server/socket-io/main.js:329-331` — v1 settle/cancel failure queue exhausts silently. Risk: non-contiguous deposit patterns strand funds permanently (program upgrade required, no automated escalation).
4. **uncaughtException + unhandledRejection log-only**: `server/index.js:614-620` — Server continues running after any unhandled error in async escrow callbacks. A corrupted `matchStates[roomId]` from an async error could allow a subsequent fire/settle to operate on stale state.
5. **Privy auth fail-open when secret absent**: `server/services/privyAuth.js:64-66` — `required: true` is ineffective when `PRIVY_APP_SECRET` not set. The wallet-link-from-privy-telegram endpoint accepts unauthenticated requests silently. Risk: any caller can bind a Telegram ID to a wallet if env not configured.
6. **MongoDB bufferCommands with no timeout**: `server/index.js:545` — On DB drop, `User.save()`, `Match.findByIdAndUpdate()` calls queue silently with no timeout. Turn progression, gold awards, match history writes all hang indefinitely without error to the caller.
7. **scheduler fireCallback swallows idle callback crash**: `server/services/groupchat/scheduler.js:133-138` — If `handleIdleTimeout` throws (e.g., match already cancelled), the timer is gone with no rescheduling. Idle turn never resolved, match may be stuck permanently in 'active' DB state.
8. **No RPC retry/fallback on escrow calls**: `server/services/escrow.js:304` — All CPI calls use single devnet RPC, no retry backoff. A 5-second devnet hiccup causes settle to fail, triggering handleSettlementFailure. Risk: routine devnet instability cascades to settlement failures.

## Novel Attack Surface

- **Coordinated RPC pressure to trigger fail-open refunds**: An attacker playing a wagered match could intentionally DDoS the devnet RPC at match end. If settle fails, the old `refundWager` path (pre-SF-02) returned success-true immediately. With SF-02, settle now propagates failure. However `refundWager` still fails-open. A disconnect-timed attack during the reconnect window that triggers the disconnect settlement path (`cancelEscrowSafely` → `refundWager`) would still report success on RPC failure.
- **Scheduler starvation on restart**: If server crashes mid-match and `failedSettlements` is lost, and the group-match DB state is 'settled' (settled flag was written but escrow was never settled), the permissionless_reclaim is the only recovery. A server restart wipes the retry queue — this is a permanent failure mode for v1 matches (no permissionless_reclaim retry for v1 after restart).

## Cross-Focus Handoffs

- → **ERR-02 (Race Conditions)**: The `failedSettlements` retry interval (`setInterval(60s)`) runs concurrently with live match settlement. If a match settles successfully after being queued in `failedSettlements` (e.g., server had a transient RPC issue, settle succeeded later), the retry may call `cancelMatchEscrow` on an already-settled account. Anchor would reject it on-chain, but worth verifying the error path is safe.
- → **LOGIC-02 (Financial Logic)**: The `refundWager` fail-open means callers (`cleanupRoom`, disconnect handlers) believe a refund succeeded and transition match state to CANCELLED. But the on-chain PDA still holds funds. Callers should not transition state until refund is confirmed, or should persist the failure for recovery.
- → **CHAIN-02 (RPC Trust)**: All RPC calls in escrow.js and escrow-v2.js have no retry, no timeout override, no fallback URL. RPC failure propagates immediately to settlement failure. Recommend a dead-simple retry wrapper around `.rpc()` for financial operations.

## Trust Boundaries

The server is the sole trust anchor for on-chain escrow operations — it holds the authority keypair, calls settle/cancel, and is the only entity that knows match outcomes. Its error handling directly determines whether players receive funds or lose them. The current model assumes RPC calls succeed on first attempt and that the server stays up indefinitely — neither is guaranteed on devnet. The `refundWager` fail-open is the most dangerous trust violation: it tells callers (and by extension players) a refund occurred when none did. The groupchat settle path uses eventual consistency via permissionless_reclaim as a safety net, which is sound architecture for v2, but the absence of alerting means ops may not know funds are waiting for reclaim. Process-level error suppression (`uncaughtException` + `unhandledRejection` without `process.exit`) means a corrupted server state can silently handle subsequent match events.
<!-- CONDENSED_SUMMARY_END -->

---

# ERR-01: Error Handling & Fail Modes — Full Analysis

## Executive Summary

The error handling architecture has been substantially improved since the Feb 2026 audit: `settleMatch()` now propagates failure (SF-02 fix), `handleSettlementFailure()` was introduced as a structured recovery path, and `failedSettlements` provides a 5-attempt retry queue. However several critical fail-open patterns remain:

1. `refundWager()` in `solana.js` still returns `{ success: true }` after on-chain cancel failure
2. Groupchat v2 settle failures are silently dropped (no retry queue equivalent to v1's `failedSettlements`)
3. The `failedSettlements` queue itself is in-memory only (lost on restart) and exhausts silently (no external alert)
4. Process-level crash handlers swallow errors without restarting
5. No MongoDB reconnect handling — DB drop causes silent infinite queuing

## Scope

This analysis covers:
- `server/services/solana.js` — `refundWager`, `settleMatch`, `verifyBalance`
- `server/services/escrow.js` — all CPI wrappers
- `server/services/escrow-v2.js` — v2 CPI wrappers
- `server/services/groupchat/scheduler.js` — timer recovery
- `server/services/groupchat/lifecycle.js` — groupchat settle/cancel
- `server/services/privyAuth.js` — JWT auth middleware
- `server/socket-io/main.js` — settlement failure handling, retry queue
- `server/index.js` — process handlers, MongoDB connect

## Key Mechanisms

### 1. refundWager() Fail-Open Pattern (CRITICAL — Batch 1 LOGIC-02 Confirmed)

**Code path** (`server/services/solana.js:240-258`):
```
refundWager(playerAddress, wagerSOL, matchId, playerAddresses)
  if wagerSOL === 0 → return { success: true }
  if isEscrowEnabled() && matchId && playerAddresses.length > 0:
    result = await cancelMatchEscrow(matchId, playerAddresses)
    if result.success → return { success: true }
    console.error('[Solana] On-chain cancel failed:', result.error)  ← logs only
                                                                       ← NO return here
  // Fallback: log refund
  logger.info(...)
  return { success: true }  ← ALWAYS REACHED on on-chain failure
```

**Why it exists**: Original design was "dev mode fallback" — when escrow wasn't deployed, refunds were just logged. SF-02 updated `settleMatch()` to propagate failure but `refundWager()` was NOT updated with the same pattern.

**What must be true for this to work correctly**: `cancelMatchEscrow` must succeed, OR callers must check that the returned `txSignature` is non-null to distinguish real from fake refunds.

**Impact**: Callers (`cleanupRoom`, disconnect handlers in main.js) see `{ success: true }` and transition match state to CANCELLED. Player-facing UI shows "match cancelled / refund sent". On-chain, the PDA still holds funds. Callers do not check `txSignature` nullness.

### 2. groupchat v2 Settle Failure — No Retry (HIGH)

**Code path** (`server/services/groupchat/lifecycle.js:848-870`):
```
setImmediate(async () => {
    try {
        const result = await settleMatchEscrowV2(match.matchId, winnerWallet)
        if (result.success) {
            match.settlementTx = result.txSignature
            await match.save()
        } else {
            console.error('[group-chat] settleMatchEscrowV2 failed...')
            // "Eventual consistency: permissionless_reclaim fires after 24h"
        }
    } catch (err) {
        console.error('[group-chat] settle on-chain crash...')
    }
})
```

The comment at line 862-865 acknowledges the design choice: rely on permissionless_reclaim as a 24h safety net. This is architecturally sound for v2 (unlike v1 which has no permissionless_reclaim safety net by default). However:

1. No retry attempt is made — even a transient RPC timeout causes 24h fund delay for winner
2. The match DB record has `state: 'settled'` but `settlementTx: null/undefined` — no easy ops query to find matches needing recovery
3. No alerting — ops team has no visibility

Contrast with v1 in main.js: `handleSettlementFailure()` is called, which attempts immediate `cancelEscrowSafely()` and queues for 5-attempt retry.

### 3. failedSettlements Queue — In-Memory, No Alert on Exhaustion

**Code path** (`server/socket-io/main.js:318-356`):
```
const failedSettlements = new Map()  // in-memory only

setInterval(async () => {
    for (const [matchId, data] of failedSettlements.entries()) {
        if (data.attempts >= 5) {
            console.error('[Recovery] Giving up on settlement recovery for matchId...')
            failedSettlements.delete(matchId)  // silently drop, no external alert
            continue
        }
        // ... retry cancelMatchEscrow
    }
}, 60_000)
```

Problems:
- **In-memory only**: Server restart clears all pending retries. A crash during settlement failure recovery means funds are stranded with no recovery path.
- **5-attempt limit with no escalation**: After 5 failed cancels (5 minutes), the entry is deleted. The only output is `console.error`. No ops webhook, no DB record, no PagerDuty-style alert.
- **Non-contiguous deposits**: If `deposits_mask` has non-contiguous bits (e.g., players[0] and players[2] deposited but not players[1]), the cancel cannot succeed on-chain. Entry is immediately dropped from the queue with a `console.error`. Funds are permanently stranded pending a program upgrade.

### 4. Process-Level Error Suppression

**Code** (`server/index.js:614-620`):
```js
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
```

These handlers were added (H061 fix) to prevent single errors from killing the server. However, they create a new risk: a corrupted in-memory state continues to be used. In particular:

- An `uncaughtException` from an async escrow operation mid-settlement means `matchStates[roomId]` may be in an intermediate state (e.g., SETTLING but escrow call threw)
- A subsequent `fire` event on the same room could trigger a double-settle attempt
- The server continues to handle events on that room with unknown state

Industry practice is to log + restart gracefully (exit with non-zero code; let the process supervisor restart). The current implementation logs only.

### 5. MongoDB Reconnect Absent — bufferCommands Risk

`server/index.js:545`:
```js
mongoose.connect(MONGODB_URI)
```

No options passed. Defaults:
- `bufferCommands: true` — operations queue in memory indefinitely while disconnected
- `serverSelectionTimeoutMS: 30000` — initial connection only
- No `reconnectTries`, no `reconnectInterval` (these were removed in Mongoose 6+)

In Mongoose 6+, reconnect is automatic — but if a connection drop is prolonged (e.g., Atlas maintenance > 30s), `bufferCommands: true` means socket events like `authenticate`, `selectWeapon`, `fire` that trigger DB writes will silently queue, never return, and eventually the event handler hangs indefinitely.

`isDbConnected()` in main.js checks `readyState === 1`, which correctly detects the drop and skips DB writes for those paths. But not all paths check this — for example, `server/services/groupchat/lifecycle.js` calls `match.save()` without a `readyState` check.

### 6. Privy Auth Fail-Open When Env Not Set

**Code** (`server/services/privyAuth.js:61-68`):
```js
export function requirePrivyAuth(options = {}) {
    const { required = false } = options;
    return async (req, res, next) => {
        const client = getClient();
        if (!client) {
            // Dev mode — no verification possible, pass through
            return next();  // ← ALWAYS called when PRIVY_APP_SECRET absent
        }
```

`/api/wallet/link-from-privy-telegram` uses `requirePrivyAuth({ required: true })`. When `PRIVY_APP_SECRET` is not set on Render, `getClient()` returns `null`, and `next()` is called with no auth check regardless of the `required: true` flag.

The `required` flag is checked AFTER the `!client` guard — it only applies when a client exists but a token is missing or invalid. This means `required: true` is effectively dead code when Privy is not configured.

The index.js also adds a `isPrivyAuthConfigured()` check inside the handler at line 499:
```js
if (!isPrivyAuthConfigured()) {
    return res.status(503).json({ error: 'privy_auth_not_configured' });
}
```

This partially mitigates the issue at the route level but relies on the handler remembering to check. The middleware `required: true` is the expected security boundary and it silently no-ops.

### 7. scheduler.js — fireCallback Error Swallowing

**Code** (`server/services/groupchat/scheduler.js:127-138`):
```js
async function fireCallback(matchId) {
    timers.delete(matchId)  // ← deleted before callback runs
    if (!onTimeoutCallback) {
        console.warn(...)
        return
    }
    try {
        await onTimeoutCallback(matchId)
    } catch (err) {
        console.error(`[group-chat] timeout callback for ${matchId} threw:`, err)
    }
}
```

The timer is deleted before the callback runs. If `handleIdleTimeout(matchId)` throws (e.g., GroupMatch.find fails due to DB drop, or match was deleted between timer fire and callback), the error is caught and logged but:
- No timer is rescheduled
- The match stays in `state: 'active'` in DB indefinitely
- The idle turn is never resolved
- Players are stuck

This is an implicit assumption that `handleIdleTimeout` always succeeds or fails gracefully.

### 8. RPC Calls — No Timeout, No Retry, No Fallback

All CPI calls in `escrow.js` and `escrow-v2.js` use Anchor's `.rpc()` with the `AnchorProvider` configured at `confirmed` commitment. No custom timeout, no `maxRetries` option, no fallback RPC URL.

The `AnchorProvider` uses the `Connection` object's default behavior: no timeout (waits for block confirmation until the blockhash expires, ~90 seconds on devnet). If devnet is under load, a single `.rpc()` call can hang for 30-90 seconds before timing out.

This means:
- `settleMatchEscrow()` can hang for up to 90s, blocking the socket event loop turn
- `cancelMatchEscrow()` in `handleSettlementFailure()` similarly hangs
- The retry interval (60s) can fire while a previous retry is still hanging

Since JavaScript is single-threaded but `await` yields to the event loop, concurrent Socket.IO events can still be processed. But a settlement handler awaiting RPC for 90s does hold the event loop iteration for that handler.

## Trust Model

The server is the unconditional authority for escrow operations. It signs all `create_match`, `settle_match`, and `cancel_match` transactions. The on-chain program trusts the server keypair without reservation. This trust is sound on-chain but means any error in server-side error handling directly translates to financial risk:

- If the server incorrectly reports a refund succeeded (`refundWager` fail-open), players have no recourse — the on-chain program has correct state but the server has moved on
- If the server crashes after writing `state: SETTLING` but before completing the settlement TX, no automatic recovery fires on restart for v1 matches
- The `failedSettlements` Map and process-level crash handlers are the only safety nets, and both have the weaknesses documented above

## State Analysis

### In-Memory State at Risk on Error
- `matchStates[roomId]` — match state machine; an uncaughtException mid-transition leaves it in SETTLING with no escrow TX
- `failedSettlements` — recovery queue; lost on restart
- `wagerStates[roomId]` — wager amount + wallet addresses; lost on restart (same)
- `disconnectTimers` + `pendingReconnects` — reconnect state; lost on restart
- Turn timers in `turnTimers[roomId]` — lost on restart

### Database State
- Match records written fire-and-forget in several paths; DB drop during settlement means `Match.findByIdAndUpdate(status: 'complete')` silently queues
- `GroupMatch.state` transitions are direct saves; if DB drops mid-lifecycle, the in-memory GroupMatch doc diverges from the DB record after the next restart

## Dependencies

- **Solana RPC (devnet)**: No health check, no retry, no fallback. All escrow calls assume RPC responds in < 30s.
- **MongoDB Atlas**: No reconnect monitoring, no timeout configuration. Assumes connection stays up indefinitely after initial connect.
- **Privy API** (`@privy-io/server-auth`): Network call to verify JWT. If Privy API is down, `client.verifyAuthToken()` throws, which is caught and treated as invalid token in `required: true` mode (correct) but as pass-through in `required: false` mode (risky for `/api/wallet/link-from-tg-token`).

## Focus-Specific Analysis

### Fail-Open vs Fail-Safe Classification

| Path | Behavior on Error | Expected | Classification |
|------|-------------------|----------|----------------|
| `refundWager()` on cancel failure | Returns `{ success: true }` | Returns `{ success: false }` | **FAIL-OPEN** (CRITICAL) |
| `settleMatch()` on settle failure | Returns `{ success: false }` | Returns `{ success: false }` | Correct (SF-02 fixed) |
| `requirePrivyAuth({required: true})` when no Privy config | Calls `next()` | Returns 401 | **FAIL-OPEN** (HIGH) |
| `scheduler.fireCallback()` on callback throw | Logs, no reschedule | Reschedule or mark failed | **FAIL-OPEN** (MEDIUM) |
| `groupchat settle failure` | Logs, no retry | Retry or alert | **FAIL-OPEN** (MEDIUM) |
| `failedSettlements` after 5 attempts | Deletes, no alert | Alert ops team | **FAIL-OPEN** (HIGH) |
| `uncaughtException` | Logs, continues | Restart process | **FAIL-OPEN** (HIGH) |
| `verifyBalance()` on RPC error | Returns `{ sufficient: false }` | Returns `{ sufficient: false }` | **FAIL-SAFE** (correct) |
| `isDbConnected()` guard | Skips DB write | Varies | **FAIL-SAFE** (partial) |

### Empty Catch Blocks

No strict `catch (e) {}` empty blocks found. All catches at minimum call `console.error`. However "silent log-only" is functionally equivalent to swallowing in terms of operational visibility.

### Switch/Case Default Missing

Not applicable — settlement path uses `if/else` chains, not switch statements.

### Async Errors Lost — Un-awaited Promises

`server/index.js:589`:
```js
setupBotWebhook(app).then(() => {
    server.listen(...)
});
// No .catch() — webhook failure in no-DB mode is an unhandledRejection
```

`server/services/bot.js:1148`:
```js
registerBotCommands().catch(() => {});
// Intentionally swallowed — documented as non-fatal
```

The keepalive ping at `server/index.js:575`:
```js
fetch(`${keepAliveUrl}/health`).catch(() => {});
// Intentionally swallowed — documented as non-actionable
```

## Cross-Focus Intersections

- **ERR-02**: The `failedSettlements` retry interval running concurrently with live match events could attempt a double-cancel on a match that settled between queue entry and retry.
- **LOGIC-02**: `refundWager` fail-open directly impacts financial guarantees — on-chain funds stranded while server reports success.
- **CHAIN-02**: All RPC timeouts/failures flow through these error handlers — no fallback RPC means any RPC issue becomes a settlement failure.

## Risk Observations

1. **CRITICAL — refundWager fail-open**: `server/services/solana.js:252-258`
2. **CRITICAL — Privy required:true ineffective without env**: `server/services/privyAuth.js:64-66`
3. **HIGH — groupchat settle failure silently dropped**: `server/services/groupchat/lifecycle.js:861-870`
4. **HIGH — failedSettlements in-memory, no alert on exhaustion**: `server/socket-io/main.js:319, 329-331`
5. **HIGH — uncaughtException + unhandledRejection log-only**: `server/index.js:614-620`
6. **HIGH — no MongoDB reconnect or bufferCommands timeout**: `server/index.js:545`
7. **MEDIUM — scheduler fireCallback swallows idle callback throw**: `server/services/groupchat/scheduler.js:133-138`
8. **MEDIUM — no RPC retry or fallback for escrow calls**: `server/services/escrow.js:304, 415`
9. **MEDIUM — setupBotWebhook no-catch in no-DB path**: `server/index.js:589`
10. **LOW — registerBotCommands swallowed entirely**: `server/services/bot.js:1148`
11. **LOW — non-contiguous deposit mask handling**: funds stranded permanently if mask non-contiguous + all retries fail; only escalation is console.error — `server/socket-io/main.js:370-372`

## Novel Attack Surface Observations

**Timed RPC Saturation + Disconnect**: An attacker who can (1) participate in a wagered match and (2) cause transient devnet RPC saturation at match end could force a settlement failure. The v1 `handleSettlementFailure` path calls `cancelEscrowSafely` → `refundWager`. If `cancelMatchEscrow` fails during that immediate-cancel attempt AND fails 5 more times in the retry queue AND the server restarts before 5 retries complete — the match PDA holds funds with no automatic recovery. The `refundWager` fail-open means the server believes refund succeeded and stops tracking the failure.

**Restart after Settlement Failure**: The `failedSettlements` Map is in-memory. If a server restart occurs after a settlement failure is queued but before the retries complete, the failure record is lost. The GroupMatch/Match DB record is in CANCELLED state (already transitioned). No in-flight recovery exists. The on-chain PDA holds funds until permissionless_reclaim fires (v2: 24h after match_end_ts; v1: 1200s = 20 minutes after creation, not after match end — shorter window).

## Questions for Other Focus Areas

- **ERR-02**: Does the 60-second `setInterval` for `failedSettlements` retry ever fire while a settlement is in-progress (i.e., does a Match transition to SETTLING mid-retry)?
- **CHAIN-02**: What is the actual devnet RPC p99 latency and timeout for `.rpc()` calls? Is the 30-90s Anchor default timeout realistic for a Render-hosted server?
- **LOGIC-02**: Do any callers of `refundWager()` check the returned `txSignature` for null? If callers used nullness as a signal, the fail-open could be partially mitigated at call sites.
- **DATA-01**: Is there a `failedSettlements`-equivalent persistent record in MongoDB? If not, should `handleSettlementFailure` write a DB record before queuing in-memory?

## Raw Notes

- `getConfigState()` in `escrow.js:265` has empty catch: `return null` — intentional (config not initialized case), not a risk.
- `getEscrowState()` in `escrow.js:597-599` has empty catch: `return null` — intentional (account doesn't exist), not a risk.
- `getEscrowStateV2()` same pattern — intentional.
- `saveServerState()` in `ServerState.js:48-49` silently returns if DB disconnected — intentional fire-and-forget for SHOT emission tracking.
- `persistBurnTx()` same pattern — acceptable for replay protection since in-memory Set is primary guard.
- All individual escrow.js functions properly return `{ success: false, error: err.message }` in their catch blocks — the fail-open is exclusively in `solana.js:refundWager()` which wraps them.
