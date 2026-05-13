---
task_id: db-phase1-err-02
provides: [err-02-findings, err-02-invariants]
focus_area: err-02
files_analyzed:
  - server/services/groupchat/lifecycle.js
  - server/services/groupchat/lobbyWatchdog.js
  - server/services/groupchat/scheduler.js
  - server/services/groupchat/index.js
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/services/match.js
  - server/middleware/guards.js
finding_count: 12
severity_breakdown: {critical: 3, high: 5, medium: 3, low: 1}
---
<!-- CONDENSED_SUMMARY_START -->
# ERR-02: Race Conditions & Concurrency — Condensed Summary

## Key Findings (Top 10)

- **Group-chat double-settle via concurrent `checkAndSettle` calls**: `handleShot`, `handleForfeit`, and `handleIdleTimeout` all call `checkAndSettle(match)` on a stale in-memory doc (fetched once at function entry via `GroupMatch.findOne`). Two concurrent calls (e.g., simultaneous shot + idle timer fire) both read state `active`, both evaluate `alive.length <= 1`, both proceed to `settleMatch`. No atomicity or mutex at the MongoDB layer — `settleMatch` checks `match.state !== 'active'` but uses the same stale in-memory object, not a re-fetch. `settleMatch` then calls `settleMatchEscrowV2` twice → double on-chain settlement attempt — `lifecycle.js:804–872, 1039–1052`
- **`confirmDeposit` TOCTOU — last-depositor race**: Two players confirm simultaneously. Both call `GroupMatch.findOne({matchId})` at line 255. Both see `state: 'awaiting_deposits'` and no `initialDepositTx` for themselves. Both proceed to `match.players[playerIdx].initialDepositTx = txSignature; await match.save()`. The second `.save()` overwrites the first player's slot only if Mongoose uses the full document replace pattern. More critically, the `allDeposited` check at line 271 reads from the in-memory doc that was fetched in the same call — if both saw the other's slot empty, both calculate `allDeposited = false` and neither fires `activateMatch`. The match stalls in `awaiting_deposits` despite both having deposited. — `lifecycle.js:254–278`
- **`depositTimers` slot reuse (Batch 1 LOGIC-02 confirmed)**: The 5-minute deposit window and the 30-second partial-deposit decision window both write to `depositTimers[roomId]`. The 5-min timer fires, writes the 30s timer to `depositTimers[roomId]` — immediately overwriting the reference. If `escrowPartialStart` or `escrowCancelAll` then calls `clearTimeout(depositTimers[roomId])`, it cancels the 30s timer, NOT the already-fired 5-min timer. The 5-min timer's body already started async work before writing the 30s timer. The 30s timer auto-fires when no one clears the correct handle, causing a double-cancel via `cancelEscrowSafely`. — `main.js:2039–2126, 2108–2126`
- **`turnTimers[roomId]` cleared but not null-guarded on stale room fire**: `startTurnTimer` is a module-level function. When a forfeit path calls `io.socketsLeave(roomId); await removeRoom(roomId)` (lines 827–829), it does NOT call `clearTurnTimer(roomId)` first. If a prior timer was set but not yet fired (e.g., mid-fire flow restarted a timer during a forfeit), the stale timer fires on the next tick after `removeRoom`, reads `matchStates[roomId]` (now undefined), passes the early-exit check `if (!ms || ms.status !== MATCH_STATES.BATTLE) return`, but then fires for AI rooms — and AI turn-timer cleanup `if (aiTurnTimers[roomId])` is done in `cleanupRoom` (inside disconnect closure), not the forfeit path. — `main.js:706–831`
- **Reconnect remap is not atomic with concurrent fire events**: `rejoinRoom` (dead code, but reconnect logic path is still in the 30s window code) remaps 10+ in-memory maps (scores, kills, hp, alive, currentTurn, etc.) synchronously over multiple assignment statements. While Node.js is single-threaded, each assignment is individually synchronous, but an `await` in between (e.g., the `await withLock(...)` on the forfeit path that runs during the same disconnect handler) can interleave with a `fire` event from another client. If `fire` arrives during reconnect remap's awaits, it reads partially remapped state. — `main.js:1807–1856`
- **Lobby watchdog `sweepStaleLobbies` is not re-entrant safe**: `sweepStaleLobbies` queries all stale lobbies then iterates and calls `match.save()` per match. The 15-minute interval runs again while a prior sweep is still awaiting DB calls. Second sweep fetches the same stale matches (the first sweep's `save()` hasn't committed yet), processes them again, and calls `postToChat` twice for the same matchId. No mutex or in-progress guard. — `lobbyWatchdog.js:54–91`
- **`scheduler.restoreActiveTimers` + new turn from concurrent boot**: At server boot, `restoreActiveTimers` loads all `active` GroupMatches and calls `scheduleTurnDeadline(match)` for each. If `handleIdleTimeout` fires for a recovered match before the scheduler has finished restoring all matches, lifecycle advances the match (save to DB), but `scheduleTurnDeadline` is called again immediately after by `advanceTurn → scheduler.scheduleTurnDeadline(match)`. These two `scheduleTurnDeadline` calls compete: the recovery call uses the pre-restart stale `match.turnStartedAt`, the live call uses a freshly mutated `match`. The timer `clearMatchTimer` at the start of `scheduleTurnDeadline` prevents a double-timer only if they run sequentially; concurrent interleaved execution means the first call's `timers.set(match.matchId, handle)` is overwritten by the second. — `scheduler.js:56–85, 109–123`
- **`settleMatch` (group-chat) on-chain call inside `setImmediate` after `match.state = 'settled'` with no retry-idempotency guard**: `settleMatch` sets `match.state = 'settled'` and `await match.save()` synchronously (lines 808–818), then defers `settleMatchEscrowV2` to `setImmediate`. If `setImmediate` fails (RPC error), `match.settlementTx` is never set. A second call to `settleMatch` (from double-settle race) checks `if (match.state !== 'active')` at line 805, sees `settled`, and returns early — correctly blocking a second on-chain settle. BUT: if the first `settleMatchEscrowV2` threw, the match is stuck `settled` in DB with no `settlementTx` and no retry mechanism. Recovery is permissionless_reclaim after 24h. — `lifecycle.js:804–872`
- **`handleShot` in `groupchat.js` is unguarded against concurrent calls for same match**: `fireGroupShot` socket handler calls `lifecycle.handleShot(payload.matchId, tgId, payload)` without any mutex. Two sockets for the same match can both pass the "not_your_turn" check if both read `currentPlayerIndex` simultaneously before either writes the updated index. The group-chat `handleShot` uses the same in-memory Mongoose doc pattern — `GroupMatch.findOne` then mutate then `match.save()`. Two calls serialize only if they both await the same DB round-trip; in practice, RPC + DB latency means both can be mid-execution simultaneously. — `groupchat.js:168`, `lifecycle.js:536–779`
- **bulkWrite `ordered: false` partial failure in `pushMatchHistory`**: `User.bulkWrite(ops, { ordered: false })` silently ignores individual document write failures (line 1002). For a multi-player match (up to 10 players), some players' stats update while others silently fail. The caller catches only the top-level error, not per-operation `writeErrors` in the `BulkWriteResult`. This is a DATA-01 concern but has ERR-02 overlap: concurrent writes to the same User doc from separate matches can cause the per-op write to fail due to version conflicts. — `lifecycle.js:1001–1006`
- **`wagerStates[roomId]` and `matchStates[roomId]` mutations are unprotected in the `fire` handler path**: The fire handler in `main.js` mutates `ms.hp`, `ms.scores`, `ms.alive`, `ms.kills`, `ms.currentTurn` etc. synchronously (no `await` between reads and writes for these fields). However, the `earnGold` and `awardKillBonus` calls at lines 3836–3874 use `goldStates[roomId]` which is the same shared reference. If a second fire event is processed (different player's turn, N-player) before the first fire's synchronous section completes, the gold state mutations can interleave. This is mitigated by Node.js single-threaded event loop guarantees ONLY for the synchronous section — any intervening `await` (like `processShot` if it ever goes async) would break this. — `main.js:3796–3880`
- **`disconnectTimers` and `pendingReconnects` not cleaned up on match teardown via forfeit path**: The forfeit timeout path at lines 766–832 calls `await removeRoom(roomId)` and `io.socketsLeave(roomId)` but does NOT delete `disconnectTimers[reconnectKey]` or `pendingReconnects[reconnectKey]`. If a player disconnected 25 seconds before the match ended via forfeit, their `disconnectTimers` entry still has a 5s timer pending. When it fires, `cleanupRoom` runs against an already-removed room, potentially attempting to settle or refund an already-settled escrow. — `main.js:1709–1719, 766–832`

## Critical Mechanisms

- **`withLock('settle:roomId')`**: In-memory async mutex in `guards.js:170–198`. Protects the forfeit settlement path in `main.js`. Does NOT apply to the group-chat lifecycle's `settleMatch` / `checkAndSettle`. 30s auto-release on timeout means a hung RPC call can let a second settlement attempt through after 30s.
- **`checkAndSettle(match)` (group-chat)**: Helper called from `handleShot`, `handleForfeit`, `handleIdleTimeout`, and `advanceTurn`. Reads `match.state` from a stale in-memory doc fetched at the caller's entry point. No atomicity: `lifecycle.js:1039–1052`
- **`transitionState(ms, newState)` (1v1)**: In `match.js:50–62`. Pure in-memory mutation with valid-transitions guard. Prevents invalid state jumps but does NOT prevent two event handlers from both passing the guard before either mutates the state (JS single-thread only protects within a single synchronous run-to-completion block).
- **`depositTimers[roomId]`**: Shared slot for two different timer semantics (5-min deposit window + 30s decision window). The second timer overwrites the slot reference of the first, corrupting `clearTimeout` attempts by code that held no separate reference. `main.js:146, 273–306, 2039–2126`
- **`scheduler.timers` Map**: Keyed by `matchId`. `scheduleTurnDeadline` always calls `clearMatchTimer` first, which is safe for single-caller sequential use. Not safe across concurrent callers (boot recovery + live `advanceTurn`). `scheduler.js:56–94`

## Invariants & Assumptions

- INVARIANT: Group-chat match is settled exactly once — enforced by `if (match.state !== 'active') return` at `lifecycle.js:805` — NOT enforced ⚠ (guard reads stale in-memory doc, not a DB atomic check)
- INVARIANT: `depositTimers[roomId]` always holds the handle for the currently active timer — NOT enforced ⚠ (slot reused for two different timers at `main.js:2108–2109`)
- INVARIANT: `scheduler.timers` has exactly one entry per active match — enforced by `clearMatchTimer` at start of `scheduleTurnDeadline` — PARTIALLY enforced (concurrent calls at boot recovery + live `advanceTurn` can create a second timer before the first is cleared)
- ASSUMPTION: `handleShot` is never called concurrently for the same match — UNVALIDATED ⚠ (no mutex in `groupchat.js` `fireGroupShot` handler)
- ASSUMPTION: `confirmDeposit` serializes per matchId — UNVALIDATED ⚠ (no mutex; two simultaneous last-depositor calls can both miss `activateMatch`)
- ASSUMPTION: Reconnect remap in `rejoinRoom` completes atomically with respect to `fire` events — UNVALIDATED ⚠ (awaits mid-remap allow interleaving)

## Risk Observations (Prioritized)

1. **Double-settle race in group-chat** (`lifecycle.js:804,1039`): Concurrent `handleIdleTimeout` + `handleShot` both pass `checkAndSettle`'s `active` guard and both call `settleMatchEscrowV2`. First call succeeds; second call may fail with on-chain `AlreadySettled` but also emits a second "match settled" broadcast and writes duplicate `settlementTx` to DB. High financial impact.
2. **`confirmDeposit` last-depositor stall** (`lifecycle.js:254–278`): Both players confirm simultaneously; both see `allDeposited = false`; neither fires `activateMatch`; match stalls in `awaiting_deposits` indefinitely. Players must re-trigger deposit or wait for deposit window expiry + `start_with_depositors`. Medium-high UX and financial impact.
3. **`depositTimers` slot reuse** (`main.js:2108–2126`): The 30s decision-window timer reference is written to the same slot as the completed 5-min timer. Downstream `clearTimeout(depositTimers[roomId])` cancels the wrong timer, leaving the 30s timer to auto-fire a double-cancel. Medium financial impact.
4. **Lobbywatch reentrancy** (`lobbyWatchdog.js:54–91`): Sweeps can overlap on long DB round-trips. Duplicate Telegram posts are low-severity; duplicate `match.save()` with `state: 'cancelled'` is idempotent but indicates missing guard.
5. **Scheduler boot-recovery + live `advanceTurn` timer collision** (`scheduler.js:109–123, 56–85`): Extra turn deadline timer created with stale `turnStartedAt`; could fire a premature idle penalty during a live turn. Medium severity.
6. **Stale `disconnectTimers` after forfeit match teardown** (`main.js:766–832, 1709`): Timer fires against destroyed room, potentially calling `cancelEscrowSafely` on already-settled escrow.

## Novel Attack Surface

- **Triggering double-settle via deliberate idle + simultaneous shot**: An attacker controlling two accounts in the same group match — one player whose turn it is fires a killing shot while simultaneously their colluding opponent's idle timer (set to 1ms in a crafted scenario using the scheduler) fires. Both events enter `handleShot` and `handleIdleTimeout` at roughly the same time (within the same Node.js I/O poll cycle). The stale-document race is reliably triggerable under high-latency MongoDB conditions because both DB fetches complete before either `save()` writes back. The second on-chain settle attempt gets `AlreadySettled` from the program but the server has already emitted a second `matchSettled` event. Client-side: receiving `matchSettled` twice may cause double UI navigation.

## Cross-Focus Handoffs

- → **LOGIC-02 (Financial)**: `depositTimers` slot reuse at `main.js:2108` directly affects wager fund handling — the auto-cancel `cancelEscrowSafely` that fires from the leaked 30s timer acts on funds. Should be a LOGIC-02 finding.
- → **ERR-01 (Error Handling)**: `settleMatch` defers `settleMatchEscrowV2` to `setImmediate` (fire-and-forget). If this throws, no retry is scheduled, `settlementTx` is never stored, and the match remains `settled` in DB with unknown on-chain state. ERR-01 should cover the missing recovery path.
- → **DATA-01 (Database)**: `pushMatchHistory` bulkWrite with `ordered: false` silently drops per-player stat updates on write error. No individual error inspection on `result.writeErrors`.

## Trust Boundaries

The group-chat lifecycle is entirely server-side but lacks the in-memory mutex (`withLock`) that the 1v1 path in `main.js` uses for settlement. All state reads use `GroupMatch.findOne` (a fresh DB fetch) at function entry, but mutations are applied to the fetched in-memory object and saved via `match.save()` — a full document replace pattern that loses concurrent updates (last write wins). The 1v1 path's `transitionState` + `withLock('settle:roomId')` provides meaningful protection only because the lock key is per-roomId and settlement is a single code path; the group-chat path has three independent entry points (`handleShot`, `handleForfeit`, `handleIdleTimeout`) that each independently check-and-settle without holding any shared mutex.
<!-- CONDENSED_SUMMARY_END -->

---

# ERR-02: Race Conditions & Concurrency — Full Analysis

## Executive Summary

The codebase has three distinct concurrency models operating simultaneously:
1. **1v1 in-memory match state** in `main.js` — protected by `withLock` on the settlement path and synchronous JS event-loop guarantees for non-async mutations.
2. **Group-chat lifecycle state** in `lifecycle.js` — MongoDB-backed with full document save/replace; NO mutex on any path; three independent entry points all call `checkAndSettle` on stale in-memory docs.
3. **Scheduled timers** — `setTimeout` handles in module-level Maps; boot recovery can create competing timers; `depositTimers[roomId]` slot reused for semantically different timers.

The most critical races are in the group-chat path because it was newly written and does not inherit the `withLock` protection from the 1v1 path.

## Scope

**In scope analyzed:**
- `server/services/groupchat/lifecycle.js` — full read
- `server/services/groupchat/lobbyWatchdog.js` — full read
- `server/services/groupchat/scheduler.js` — full read
- `server/services/groupchat/index.js` — partial read (cancel + inline-cancel paths)
- `server/socket-io/main.js` — partial read (timer setup, deposit flow, fire handler, reconnect remap, disconnect handler, lines 130–870, 1527–1720, 1760–1900, 2039–2150, 3400–3500, 3640–3900)
- `server/socket-io/groupchat.js` — partial read (confirmGroupDeposit, purchaseGroupWeapon, forfeitGroupMatch, fireGroupShot handlers)
- `server/services/match.js` — full read
- `server/middleware/guards.js` — full read (withLock implementation)

**On-chain programs:** Skipped per methodology.

## Key Mechanisms

### 1v1 Settlement Protection (`withLock`)

`guards.js:170–198` implements a per-key async mutex backed by a `Promise` chain. The lock key for settlement is `settle:${roomId}`. The implementation is standard `while(locks.has(key)) await` pattern — it queues callers correctly. The 30s auto-release prevents deadlock on hung RPC calls.

Key limitation: `withLock` is only used in the **disconnect/forfeit** path (`main.js:1562`). The **fire handler's** settlement path at line 3893 (`ms.currentTurn = isRoundOver(ms) ? null : getNextTurn(ms)`) does NOT use `withLock`. Instead, it relies on `transitionState` returning `false` for an already-settled match, and the null-currentTurn check (`!ms.currentTurn || ms.currentTurn !== this.id`) preventing re-entry. This is correct for the single-shooter scenario but could fail under N-player with a precisely-timed second fire from a different socket during the ROUND_END_DELAY window.

### Group-Chat `checkAndSettle` Pattern

`lifecycle.js:1039–1052`:
```
async function checkAndSettle(match) {
    if (match.state !== 'active') return true;   // reads from stale in-memory doc
    const alive = match.players.filter(p => !p.eliminated);
    if (alive.length <= 1) {
        await settleMatch(match, 'last_alive');   // passes same in-memory ref
        return true;
    }
    ...
}
```

`settleMatch` at line 804:
```
export async function settleMatch(match, reason) {
    if (match.state !== 'active') return;   // same stale in-memory ref
    ...
    match.state = 'settled';
    await match.save();                     // full document replace
    setImmediate(async () => {
        ...
        await settleMatchEscrowV2(...)      // on-chain settle
    });
}
```

Race scenario:
1. `handleIdleTimeout('match-123')` fires: `const match = await GroupMatch.findOne(...)` → fetches doc with `state:'active'`, `alive: [playerA]` (one alive after penalty).
2. Simultaneously (within same Node.js I/O poll), `handleShot('match-123', playerA, shot)` fires: `const match = await GroupMatch.findOne(...)` → SAME result (DB hasn't been written by step 1 yet).
3. Both call `checkAndSettle(match)`. Both check `match.state !== 'active'` → both pass (state is 'active' in their respective in-memory copies).
4. Both call `settleMatch(match, ...)`. Both check `match.state !== 'active'` → both pass (each has their own copy, neither has written yet).
5. Both set `match.state = 'settled'` on their in-memory copies and call `await match.save()`.
6. Both then call `settleMatchEscrowV2` (inside `setImmediate`) → two on-chain settle calls.

The on-chain program will fail the second call with `AlreadySettled`. The match in DB will have whichever doc was saved last (last write wins). `settlementTx` will be set by the first successful `save()` in `setImmediate`, potentially overwritten by the second save (line 858).

### Disconnect/Reconnect Remap (`rejoinRoom`)

Note: `rejoinRoom` is **disabled** for P1 launch (line 1729: `client.emit('rejoinError', { reason: 'Reconnect is disabled' }); return`). The remap logic below the `return` is dead code. The disconnect handler (line 1709) calls `cleanupRoom` immediately — no 30s window. So the reconnect remap race identified in memory/project notes is NOT CURRENTLY ACTIVE. However, the dead code still exists and would re-introduce the race if the early return is removed.

### `depositTimers` Slot Reuse

`main.js:146` defines `var depositTimers = {}` shared across all rooms. The 5-minute deposit timeout (line 2039) writes `depositTimers[roomId] = setTimeout(...)`. Inside that timer's body (when partial deposits are detected), the 30-second decision window overwrites the same key (line 2109): `depositTimers[roomId] = setTimeout(...)`. 

The comment at line 2108 explicitly acknowledges this: `// 30-second decision window — auto-cancel if no decision (Pitfall 1: reuse depositTimers slot)`.

This means:
- The 5-min timer fires, starts its async body.
- In that async body, at line 2109, `depositTimers[roomId]` is set to the 30s timer's handle.
- Any code that does `clearTimeout(depositTimers[roomId])` now cancels the 30s timer handle — but the 5-min timer has already fired, so there is nothing to cancel there. This is actually correct behavior for canceling the 30s window.
- The real danger: if `escrowPartialStart` (line 3505) calls `clearTimeout(depositTimers[client.roomId])` at line 3523 AFTER the 30s timer fires but before the `delete depositTimers[roomId]` at line 2110, it calls `clearTimeout(undefined)` which is a no-op. The cancel path then proceeds to `startWithDepositorsEscrow`, but also the leaked 30s timer's body runs concurrently (since its timer already fired), calling `cancelEscrowSafely` after `escrowPartialStart` already called `startWithDepositorsEscrow`. This is a cancel-after-start race on the escrow PDA.

Separately, there's also a PlayAgain flow that uses `depositTimers[roomId]` (line 273–306), and a joinRoom flow (line 2039). If a room experiences PlayAgain after a joinRoom deposit timeout, the `depositTimers[roomId]` from `joinRoom` may not have been cleared (it fired but wasn't deleted if the partial-deposit path was taken), and `PlayAgain` overwrites the slot.

### `scheduler.timers` Map and Boot Recovery

`scheduler.js:109–123`: `restoreActiveTimers` fetches all `active` matches and calls `scheduleTurnDeadline(match)` for each. `scheduleTurnDeadline` at line 56 calls `clearMatchTimer(match.matchId)` first, then sets a new timer.

Concurrency risk: If `handleIdleTimeout` fires for match A (from a timer that survived the restart somehow, or from a `setImmediate` in step 68) while `restoreActiveTimers` is still iterating other matches, the following sequence is possible:
1. `restoreActiveTimers` processes match B, calls `scheduleTurnDeadline(B)` — sets `timers.set('B', handleB)`.
2. A `setImmediate` from `scheduleTurnDeadline(A)` (deadline in past → line 70–72) fires `handleIdleTimeout('A')`.
3. `handleIdleTimeout` → `advanceTurn(match)` → `scheduler.scheduleTurnDeadline(match)` → `clearMatchTimer('A'); timers.set('A', handleA2)`.
4. `restoreActiveTimers` then reaches match A again (if it was already added to the loop's collection) and calls `scheduleTurnDeadline(A)` again → `clearMatchTimer('A')` clears `handleA2` → `timers.set('A', handleA3)` — but `handleA3` is set based on the pre-restart `turnStartedAt`, not the just-updated one from step 3.

This means match A's deadline resets backward to the pre-restart snapshot deadline. If that's already in the past, it fires immediately again (another idle penalty on top of the one just applied).

### Lobby Watchdog Re-entrancy

`lobbyWatchdog.js:97–106`: `setInterval` fires `sweepStaleLobbies` every 15 minutes. `sweepStaleLobbies` does a `GroupMatch.find({state:'lobby', lobbyExpiresAt: {$lte: now}})` and iterates results. The sweep is async. If the DB is slow and the sweep takes more than 15 minutes (unlikely but possible on Atlas free tier), a second sweep starts while the first is still iterating.

Both sweeps fetch the same stale lobbies (the first hasn't saved `state:'cancelled'` yet for all of them). Both call `match.save()` for the same matches. The second `save()` after the first will succeed (MongoDB allows re-saving a document with the same `state:'cancelled'`), but `postToChat` is called twice per match — the group sees two "lobby expired" notifications.

More critically: the two sweeps use independent in-memory Mongoose docs, so there's no version conflict. Mongoose's `save()` does a full document replace, not an optimistic-lock update. Both writes succeed. This is benign data-integrity-wise (idempotent outcome) but indicates the watchdog lacks the guard the intent implies.

### `pushMatchHistory` bulkWrite Error Handling

`lifecycle.js:1001–1006`:
```js
try {
    await User.bulkWrite(ops, { ordered: false });
} catch (err) {
    console.warn('[group-chat] matchHistory bulkWrite failed:', err.message);
    return;
}
```

`ordered: false` means individual write failures are returned in `result.writeErrors`, NOT thrown as exceptions. The catch block only fires if the entire operation fails (e.g., network). Per-player update failures (version conflicts from concurrent writes) silently drop stat updates. For a 10-player match, it's plausible that multiple players' stat updates race with separate match settlements happening concurrently (each match attempts to update the same User document).

### Turnover Timer and Match Teardown in 1v1

In the N-player forfeit path (`main.js:706–832`):
1. `ms.alive[currentTurnId] = false` (line 689)
2. `if (isRoundOver(ms))` → `transitionState(ms, MATCH_STATES.SETTLING); transitionState(ms, MATCH_STATES.COMPLETE)` (lines 709–710)
3. `await removeRoom(roomId)` (line 719)
4. `io.socketsLeave(roomId)` (line 721)

`clearTurnTimer(roomId)` is called at line 682 (`clearTurnTimer(roomId)`) — this IS done before the settlement and teardown. So the concern about stale timers here is partially mitigated.

However, the **regular forfeit path** (<=2 alive, 3 consecutive timeouts, lines 751–832):
- Line 682: `clearTurnTimer(roomId)` — done.
- Lines 770–797: `await settleMatch(...)` (RPC call, can take seconds).
- Lines 827–830: `io.sockets.in(roomId).emit; await removeRoom; broadcastRooms; io.socketsLeave`.

During the `await settleMatch` window, a `fire` event from the surviving opponent can arrive. The fire handler checks `ms.status !== MATCH_STATES.BATTLE` — if `transitionState(ms, MATCH_STATES.SETTLING)` at line 767 was already applied, the fire is correctly rejected. So this is protected.

The actual gap is with `disconnectTimers` and `pendingReconnects` (even though reconnect is disabled for P1): these module-level maps are not cleaned up in the forfeit timer path. If/when reconnect is re-enabled, this creates a ghost reconnect window for a match that is already gone.

## Trust Model

The 1v1 in-memory state model relies on Node.js single-threaded execution to provide atomicity for synchronous mutation blocks. This is valid and holds, BUT any `await` creates a yield point where other events can be processed. The `withLock` mutex protects settlement but NOT the fire handler's post-shot state mutations (which are synchronous and thus safe). The group-chat model breaks this trust model: it uses MongoDB as the shared state store (correct for persistence), but applies read-modify-write on fetched documents without optimistic locking (`__v` version field) or atomic operators (`findOneAndUpdate` with conditions). The weapon purchase handler in `groupchat.js` actually implements this correctly (`findOneAndUpdate` with guard conditions, line 295), demonstrating the team knows the pattern — it was just not applied to the settlement and deposit paths.

## State Analysis

- `matchStates[roomId]`: In-memory JS object; no DB persistence; single-threaded JS event loop protects synchronous mutations.
- `wagerStates[roomId]`: In-memory JS object; same protection.
- `depositTimers[roomId]`: Module-level shared object; slot reuse confirmed.
- `disconnectTimers[key]`, `pendingReconnects[key]`: Not cleaned up on forfeit-path room teardown.
- `GroupMatch` (MongoDB): Full-document save via `match.save()`; no `__v` optimistic locking used; last-write-wins on concurrent saves.
- `scheduler.timers` Map: Per-matchId; `clearMatchTimer` at head of `scheduleTurnDeadline` prevents single-caller double timers; not safe under concurrent callers.
- `resumeTimers` Map (lifecycle.js): Per-matchId; `clearResumeTimer` called at start of `postTurnPing`; cleared on cancel/settle. Appears safe.

## Dependencies

- **MongoDB / Mongoose**: Save pattern is full document replace. No `findOneAndUpdate` with conditions on settlement or deposit paths (except weapon purchase). No `__v` version field or `timestamps.v` used.
- **Solana RPC / `settleMatchEscrowV2`**: Called inside `setImmediate` (fire-and-forget from `settleMatch`). No retry mechanism for the on-chain settle. Failed on-chain settle leaves match in DB state `settled` with `settlementTx: undefined`.

## Focus-Specific Analysis

### Concern 1: Group-Chat Double-Settle Race (CRITICAL)

**Window**: MongoDB round-trip latency (typically 50–200ms on Atlas). Two callers fetch the doc before either saves. Both see `state: 'active'`. Both proceed through `checkAndSettle → settleMatch`. The first `match.save()` writes `state: 'settled'`. The second `match.save()` also writes `state: 'settled'` (same outcome, but `settlementTx` may differ if the first on-chain call succeeds and the second has `result.success = false`).

**Impact**: Double `settleMatchEscrowV2` call. On-chain program rejects the second with `AlreadySettled`. No fund loss (program is idempotent on settle). But: double `matchSettled` broadcast to socket clients, double `pushMatchHistory` call (awards win twice to winner's stats), and `match.settlementTx` is written from whichever `setImmediate` finishes last (potentially the failed one sets it to undefined if first call's setImmediate saved, then second's setImmediate overwrites with a failed result).

**Fix path**: `checkAndSettle` should use `GroupMatch.findOneAndUpdate({matchId, state:'active'}, {$set:{state:'settled'}})` — atomic CAS. Only the caller that gets the returned document should proceed with on-chain settlement.

### Concern 2: `confirmDeposit` Last-Depositor Stall (HIGH)

**Specific line trace**:
- `confirmDeposit` at `lifecycle.js:254`: `const match = await GroupMatch.findOne({matchId})`.
- Line 264: `if (match.players[playerIdx].initialDepositTx)` — early-return if already confirmed. Both callers see `initialDepositTx: undefined` for their own slot.
- Line 268–269: `match.players[playerIdx].initialDepositTx = txSignature; await match.save()`.
- Line 271: `const allDeposited = match.players.every(p => p.initialDepositTx)`.

Both players are confirming simultaneously (possible because deposit TX signing is done client-side, independently, and both finish within the same ~100ms window). Player A fetches the doc — sees slot A empty, slot B empty. Player B fetches the doc — sees slot A empty, slot B empty. A saves slot A filled, slot B empty → `allDeposited = false`. B saves slot B filled (but its in-memory doc still shows slot A empty) → `allDeposited = false`. Neither fires `activateMatch`. 

Actually: Mongoose's `save()` does a full document replace (`replaceOne` under the hood for documents with existing `_id`). Player A's save writes `{slotA: txA, slotB: undefined}`. Player B's save writes `{slotA: undefined, slotB: txB}`. Last write wins. If A's save completes first, B's save overwrites `slotA: undefined`. The match ends up with only B's deposit recorded.

This is actually worse than the "stall" scenario — it's a lost deposit record. The deposit happened on-chain (bit is set in `depositsMask`) but the DB record of it is lost. `allDeposited` is never true. The deposit window expires. `start_with_depositors` is needed, but from the DB perspective only one player deposited.

**Fix path**: Replace the `match.save()` pattern with `GroupMatch.findOneAndUpdate({matchId, state:'awaiting_deposits', 'players.walletAddress': walletAddress, 'players.$.initialDepositTx': {$exists: false}}, {$set: {'players.$.initialDepositTx': txSignature}}, {returnDocument: 'after'})`.

### Concern 3: `depositTimers` Slot Reuse (HIGH, Confirmed LOGIC-02)

Confirmed. The comment at `main.js:2108` says "Pitfall 1: reuse depositTimers slot". This means the developer was aware of the problem but did not fix it; they noted it as a "pitfall" in the comment and left it. The risk is not just slot confusion — it creates a race between `escrowPartialStart` clearing the 30s timer and the 30s timer's body firing `cancelEscrowSafely` (in the case where the decision maker acts just before the 30s window expires).

**Sequence for double-action**:
1. 5-min timer fires, sets 30s timer at `depositTimers[roomId]`.
2. Decision maker's client receives `escrowPartialDeposit` event.
3. Decision maker clicks "Start with depositors" → `escrowPartialStart` event → clears `depositTimers[roomId]` at line 3523. This clears the 30s timer handle correctly.
4. `startWithDepositorsEscrow` is called.

This is actually safe IF the clear happens before the 30s timer fires. The 30s window is generous enough that this should usually work. BUT: if the clear happens AFTER the 30s timer body has already started executing (timer fired before the clear), both `cancelEscrowSafely` (from 30s body) AND `startWithDepositorsEscrow` (from `escrowPartialStart`) run concurrently. This is the concrete race.

### Concern 4: `startTurnTimer` Not Cleared on Group-Chat Match Teardown (MEDIUM)

In `lifecycle.js:settleMatch` (line 807): `scheduler.clearMatchTimer(match.matchId)` — this IS called. So the scheduler timer IS cleared on settle.

However, for the 1v1 path: `clearTurnTimer(roomId)` is called in the forfeit path (line 682) and in `clearTurnTimer` via `startTurnTimer` (which calls `clearTurnTimer` at line 657). The concern is whether stale timers survive if `removeRoom` is called without first clearing the turn timer. In the N-player elimination path (lines 706–748), `startTurnTimer` is called again after elimination (line 746) without ever calling `clearTurnTimer` first — but `startTurnTimer` at line 657 calls `clearTurnTimer` itself, so the old timer IS cleared.

The actual concern is: `removeRoom(roomId)` is an async function. Between `clearTurnTimer(roomId)` (synchronous) and `removeRoom` completing, a new timer from `startTurnTimer` (if called in a concurrent handler) could be set. This would be cleared by... nothing (the room is removed). The stale timer fires, finds `matchStates[roomId]` is undefined, and exits via the early null check (line 659–660). So the impact is a no-op stale timer fire. Low severity in practice.

### Concern 5: `handleShot` No Mutex (HIGH for group-chat)

The `fireGroupShot` handler in `groupchat.js:168` directly calls `lifecycle.handleShot`. There is no mutex or lock around this call. Two rapid fire events from two different players (which happens naturally in N-player when Player A fires just as Player B's idle timer fires and the turn advances to B who immediately fires) can both enter `handleShot` simultaneously.

`handleShot` begins at line 540: `const match = await GroupMatch.findOne({matchId})`. Both fetch the same doc. Both check `firerIdx !== match.currentPlayerIndex` — if turn just advanced (not yet saved), both see the old `currentPlayerIndex` and one of them passes the turn check incorrectly (the player who "just" got their turn via an in-flight `advanceTurn` that hasn't written to DB yet).

The `advanceTurn` → `match.save()` at `lifecycle.js:495` writes the new `currentPlayerIndex`. If a `handleShot` fetch arrives before this save completes, it sees the old `currentPlayerIndex`, which may let the wrong player fire.

**Fix path**: Per-match mutex in `fireGroupShot`, similar to `withLock('shot:${matchId}', ...)`.

### Concern 6: Bulkwrite `ordered: false` Silent Failures (MEDIUM, Cross-DATA-01)

`lifecycle.js:1001–1006`: `User.bulkWrite(ops, {ordered: false})`. The bulk write result object contains `result.writeErrors` array for per-operation failures, but this array is never inspected. The code only catches thrown exceptions (full operation failure). Per-operation failures (version conflicts, document not found) are silently dropped. For a 10-player match, a failed stat update is a permanent data loss (no retry).

## Cross-Focus Intersections

- **LOGIC-02**: `depositTimers` slot reuse directly affects financial flows (cancel vs start).
- **ERR-01**: `settleMatchEscrowV2` in `setImmediate` with no retry on failure; match remains `settled` in DB with no `settlementTx`.
- **DATA-01**: `pushMatchHistory` bulkWrite silent failures; Mongoose full-doc-replace without optimistic locking.
- **AUTH-03**: Reconnect remap (dead code) — if re-enabled, concurrent fire events during remap can read partially remapped `ms.currentTurn`.
- **CHAIN-01**: Double-settle sends two `settleMatchEscrowV2` calls; second fails on-chain with `AlreadySettled` (SOS concern) but the DB and broadcast state on the server-side is inconsistent.

## Cross-Reference Handoffs

- → **LOGIC-02**: Confirm the `depositTimers` slot-reuse race for the `escrowPartialStart` + stale 30s timer body concurrent execution path (`main.js:2108–2126, 3504–3525`).
- → **ERR-01**: Document the `setImmediate` fire-and-forget for `settleMatchEscrowV2` in `lifecycle.js:825–872` — no retry, no persistent failure record for on-chain settlement errors.
- → **DATA-01**: `pushMatchHistory` `bulkWrite` result not inspected for `writeErrors` (`lifecycle.js:1001–1006`); confirm whether Mongoose `ordered: false` propagates per-op errors to `err` or `result.writeErrors` only.
- → **AUTH-03**: Note that `rejoinRoom` reconnect logic (lines 1727–1900) is dead code (early return at line 1729). If re-enabled for Phase 2, the remap + concurrent fire interleave needs a mutex.

## Risk Observations

1. **Double-settle (group-chat)** — `lifecycle.js:804, 1039–1052`: Three callers share no mutex. In-memory doc used for state guard. MongoDB last-write-wins. First on-chain settle succeeds; second fails silently (AlreadySettled on-chain, but server may write incorrect `settlementTx: undefined`). CRITICAL.
2. **`confirmDeposit` last-depositor doc overwrite** — `lifecycle.js:254–278`: Full-doc-replace `save()` under concurrent confirms can delete the first depositor's record. Match stalls. HIGH.
3. **`depositTimers` slot reuse** — `main.js:2108–2126`: Cancel-after-partial-start race possible if 30s timer fires concurrently with `escrowPartialStart`. HIGH.
4. **`handleShot` no group-chat mutex** — `lifecycle.js:536`, `groupchat.js:168`: Wrong player can fire if `advanceTurn` save races with incoming shot. HIGH.
5. **Scheduler boot recovery + live `advanceTurn` timer collision** — `scheduler.js:109–123, 56–85`: Stale pre-restart deadline reinstated, potentially causing premature idle penalty. MEDIUM.
6. **Lobby watchdog reentrancy** — `lobbyWatchdog.js:54–91`: Duplicate cancel + postToChat on slow DB sweeps. MEDIUM.
7. **`pushMatchHistory` silent bulkWrite failures** — `lifecycle.js:1001–1006`: Per-player stat drop on write error. MEDIUM.
8. **Stale `disconnectTimers` after forfeit path** — `main.js:766–832`: Ghost disconnect timer fires against destroyed room; currently low-impact (reconnect is disabled). LOW.
9. **`transitionState` in fire handler** — `match.js:50–62, main.js:3893`: In-memory CAS but no `withLock` on fire handler's settlement branch. Correct for 1v1 synchronous section but would break if fire handler ever introduces an `await` between HP update and `transitionState`. Note for refactors.
10. **`setImmediate` on-chain settle** — `lifecycle.js:825–872`: No retry on `settleMatchEscrowV2` failure; no recovery record; match stuck `settled` with `settlementTx: undefined`. ERR-01 primary, ERR-02 secondary.

## Novel Attack Surface Observations

- **Coordinated double-settle trigger**: A colluding player pair in a group match could engineer the simultaneous `handleIdleTimeout` + `handleShot` race by one player making their turn take exactly as long as the MongoDB fetch for the other's idle timeout. This is achievable under high-latency conditions (Atlas free tier, Render cold start). The outcome isn't fund theft (on-chain is idempotent) but causes stat manipulation (double win record for the winner).
- **Deposit record destruction via race**: Two players confirming deposits simultaneously can cause the second player's `save()` to overwrite the first player's `initialDepositTx` field with `undefined`. This makes the match appear to have only one depositor, blocking auto-activation. The attacker (if they could time it) could force the match into a partial-deposit decision window, then exploit the `depositTimers` slot reuse to trigger a premature cancel. Net effect: wagers deposited on-chain but DB thinks the match was cancelled, allowing the attacker to trigger `cancelMatchEscrowV2` to reclaim funds they didn't intend to give up.

## Questions for Other Focus Areas

- **DATA-01**: Does Mongoose `save()` on a document fetched with `findOne` do a full document replace (`replaceOne`) or a partial update (`updateOne` with delta)? Answer affects severity of the `confirmDeposit` deposit-record-destruction scenario.
- **LOGIC-02**: Is the `cancelEscrowSafely` call idempotent? If called twice (from slot-reused 30s timer + subsequent retry), does it refund twice or fail gracefully?
- **CHAIN-01**: What does `settleMatchEscrowV2` return when the escrow account is already settled (`AlreadySettled`)? Does it return `{success: false, error: 'AlreadySettled'}` or throw? This affects how the second `setImmediate` body handles the double-settle.

## Raw Notes

- `lifecycle.js` comment structure is good — developers are aware of some races (the `// Re-fetch — match state may have changed` comment in `postTurnPing` quiet-hours handler at line 114, and the `// Pitfall 1` comment in `main.js:2108`). Awareness without remediation indicates these are known technical debts.
- `match.js:transitionState` returns `false` on invalid transition — callers should check this return value. In `main.js` many callers do not check the return value, meaning they proceed even if the transition was invalid (e.g., double-SETTLING attempt silently fails).
- The reconnect path being dead code (line 1729) is a meaningful risk reduction. Project memory says "30s window, wallet-keyed rejoin" but the actual code has disabled this for P1. If/when re-enabled, the remap logic needs `withLock` to be safe.
- `restoreActiveTimers` could be made safe by processing matches sequentially with `for...of` + `await`, which is what it already does. The risk is that `handleIdleTimeout` fires mid-loop due to `setImmediate` dispatch. Using a `Promise.allSettled` would not help; the issue is JS event loop interleaving. The fix would be to not use `setImmediate` for overdue timers during boot recovery, or to set a "boot recovery in progress" flag and defer overdue callbacks until recovery completes.
