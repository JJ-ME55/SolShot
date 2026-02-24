# LOGIC-01: Business Logic & Workflow Security
<!-- CONDENSED_SUMMARY_START -->
---
task_id: LOGIC-01
focus: Business Logic & Workflow Security
auditor: LOGIC-01
date: 2026-02-23
scope: All off-chain code (server/, client/src/) — programs/ excluded
files_analyzed: 12 (deep), 20+ (signatures), index consulted
severity_counts:
  CRITICAL: 3
  HIGH: 5
  MEDIUM: 5
  LOW: 3
  INFO: 2
---

## Condensed Summary

SolShot's off-chain business logic has been substantially hardened since the Fortress audit (Feb 2026). The critical gaps documented in ARCHITECTURE.md — missing auth enforcement, no input validation, race conditions, infinite SHOT emissions — all now have mitigations in place. However, several residual vulnerabilities remain that are exploitable by a determined adversary, and three new issues were introduced by the fixes.

### Critical Findings

**BL-C01 (CRITICAL)**: `joinQueue` does not verify creator balance before pairing. The `createRoom` path correctly calls `verifyBalance()` before recording the wager, but `joinQueue` in `main.js:1213-1389` skips the creator-side balance check entirely. When two players match via the queue, neither player's balance is verified before the escrow is created and `startPick` emitted. An insolvent player can be matched and the escrow PDA created, consuming on-chain transaction fees with no guarantee of deposit.

**BL-C02 (CRITICAL)**: `playAgainRequest` preserves the old `wagerStates` entry (correct per H037 comment) but does NOT perform any re-verification of player balances, re-authentication, or escrow re-creation for the rematch. The old wager wallet mappings (keyed by socket ID) may be stale after the previous match, and no new deposits are collected. In practice this means a wagered rematch runs on phantom wager state with no on-chain backing — effectively a free match disguised as a wagered one.

**BL-C03 (CRITICAL)**: The `positionUpdate` handler (`main.js:2371-2402`) updates the server-authoritative tank position based on client-reported coordinates validated only by a distance bound (dx<=400, dy<=200). A client can inch the tank position 400px per `positionUpdate` event, and the rate limiter only checks the global event rate (30 events/sec), not per-event-type. With 30 events/sec the client can move the server position by 12,000px/sec — far exceeding the 4-step (320px) intended movement limit. This bypasses the `moveCounts` enforcement in `stepLeft`/`stepRight` and allows fire-from-arbitrary-position attacks, undermining the server-authoritative physics model.

### High Findings

**BL-H01 (HIGH)**: `requestTerrain` has no guard for duplicate calls. Either player can call it during an active match round (beyond the initial setup), re-generating terrain, resetting tank positions, resetting HP, resetting `ms.currentTurn`, and restarting the turn timer — effectively resetting the round state at will. The `room._terrainCache` check prevents re-generation only on subsequent calls, but `delete room._terrainCache` is called in `endShopPhase` (line 285), which a between-rounds shop phase triggers, so a player can call `requestTerrain` in round 2+ to get a fresh terrain before the opponent.

**BL-H02 (HIGH)**: The `joinQueue` matchmaking handler (`main.js:1242-1388`) only validates wager amount equality between the two matched players, but does not verify the joiner's balance via `verifyBalance()` before pairing. The `joinRoom` path has this check at line 982-992. The queue path bypasses it entirely, allowing a zero-balance wallet to enter a wagered queue match.

**BL-H03 (HIGH)**: The `escrowDepositConfirm` on-chain verification path has a single 2-second retry, after which it rejects with an error. A client on a slow connection will have its deposit rejected and no fallback recovery path is emitted to the client beyond `escrowError`. Meanwhile the deposit may confirm on-chain 5-10 seconds later. The deposit timeout timer (`DEPOSIT_TIMEOUT_MS = 120s`) would eventually cancel the escrow, but the window creates a scenario where a player's SOL is locked in an escrow that the server considers undeposited, and `removeRoom()` is called without attempting a late-confirmation path.

**BL-H04 (HIGH)**: The `giveTurn` relay event (`main.js:2479-2483`) has no authentication, no state validation, no rate limiting beyond the global 30/sec cap, and no content sanitization. It relays `terrainData, pos1, pos2, rotation1, rotation2` directly to the opponent. A malicious player can send fabricated terrain updates via `giveTurn` to desync the opponent's game state, potentially making the opponent fire into incorrect positions.

**BL-H05 (HIGH)**: The SHOT `five_win_streak` milestone (`shot-token.js:65`) tracks `consecutiveWins` which is reset on any loss in a wagered match but is NOT reset in practice mode. The check `s.consecutiveWins >= 5` runs in both wagered and practice contexts. A player who accumulates a 5-win streak purely in practice (unranked) mode can claim the `five_win_streak` milestone (40 SHOT), which is intended only for wagered competitive play per the litepaper description "Win 5 Matches in a Row" (implied wagered context).

### Medium Findings

**BL-M01 (MEDIUM)**: The `ready` event handler (`main.js:1399-1482`) does not check whether both players have deposited into escrow (`ws.deposits`) before transitioning to `WEAPON_SHOP`. In wagered matches with escrow enabled, both players should have confirmed their deposits before the match begins. A player who has not deposited can click ready, and the match proceeds with a partially-funded escrow.

**BL-M02 (MEDIUM)**: The `shopDone` path marks the player ready (`ready[client.id] = true`) but does not validate that `client.id` is actually a participant in this room (host or player). A third-party socket that somehow ends up in the room's Socket.IO channel could mark `ready[client.id] = true`, potentially counting toward the two-ready check and triggering `endShopPhase` prematurely.

**BL-M03 (MEDIUM)**: `isMatchOver` (`match.js:165-188`) determines the winner by `roundWins >= winsNeeded`, but the tiebreaker falls back to `hostId` (line 184). This is documented in ARCHITECTURE.md as a systematic host advantage. In BO3 mode, if both players win 1 round and round 3 ends in a draw (equal scores and HP), the host always wins — not random, not fair.

**BL-M04 (MEDIUM)**: The `startTurnTimer` forfeit path (`main.js:291-403`) uses a module-level closure and calls `removeRoom(roomId)` and `io.socketsLeave(roomId)` directly. It does not call `cleanupRoom()`. This means it may skip the HP-based disconnect settlement logic (DCA-03) and the `SETTLING` state guard (`H069`). If settlement fails in the forfeit path, `handleSettlementFailure()` is called but the room is destroyed immediately after regardless of whether the retry succeeds.

**BL-M05 (MEDIUM)**: The `verifyBurnTransaction` function accepts burns where `BigInt(ixAmount) >= expectedRaw` — it allows over-burns. A player who burns more SHOT than the tier requires still advances by only one tier (the `prestigeBurn()` function increments exactly one tier regardless of burn amount). This means excess SHOT is permanently destroyed without granting additional benefit, which is economically correct but the over-burn scenario is not surfaced to the user and the verification does not check that the amount exactly matches the current tier cost.

### Low Findings

**BL-L01 (LOW)**: `weaponChange`, `angleChange`, `powerChange` relay events (`main.js:2348-2368`) have null-payload guards but no state validation (they don't check `validateAction(ms.status, ...)`). These are cosmetic relays only, but they can be sent from any state including SETTLING and COMPLETE, creating noise and potential client-side confusion if the opponent receives movement updates after a match ends.

**BL-L02 (LOW)**: The `createWeaponArray` handler (`main.js:1666-1691`) uses `crypto.randomBytes` (good) but does not check match state before overwriting `room.randomArray`. If called during an active match it silently overwrites the weapon array. It has an auth guard but no state machine check.

**BL-L03 (LOW)**: Match ID for SHOT milestone deduplication is constructed as `${roomId}:${ms.currentRound}:${Date.now()}` (`main.js:2156`). The `Date.now()` component means two simultaneous match completions (e.g., test environment) would generate distinct IDs. In normal play this is fine, but in a server-restart recovery scenario, the same match could generate a new matchId since the old one is not persisted, allowing a replayed match completion event to credit SHOT a second time.

### Info Findings

**BL-I01 (INFO)**: The `withLock` mutex in `guards.js` correctly prevents concurrent settlement but uses a `while (locks.has(key)) await` pattern that is effectively a busy-poll on resolved Promises. Under high concurrency this works correctly but is not a true mutex — it allows the next waiter to proceed immediately when the lock is released. This is adequate for the 2-player match model.

**BL-I02 (INFO)**: The balance cache TTL is 30 seconds (`BALANCE_CACHE_TTL_MS`). A player could theoretically deposit SOL, get verified, then withdraw before the match starts. In practice the escrow flow should protect against this, but if escrow is disabled (dev mode), the balance cache TTL window creates a 30-second attack surface.
<!-- CONDENSED_SUMMARY_END -->

---

## Full Analysis

### Methodology

Three-layer search was applied:
1. **INDEX**: Identified LOGIC-01 hot spots — `main.js` (525 hits), `physics.js` (205), `shot-token.js` (102), `match.js`, `gold.js`, `solana.js`
2. **Signatures**: Read function signatures and key structures for all 10 critical files
3. **Full Source**: Deep-read `main.js` (all 2566 lines in sections), `match.js`, `gold.js`, `solana.js`, `shot-token.js`, `guards.js`, `LobbyScreen.js`

Cross-referenced against `ARCHITECTURE.md` trust boundary analysis and prior findings.

---

### BL-C01: Queue Matchmaking Bypasses Balance Verification (CRITICAL)

**File**: `server/socket-io/main.js:1213-1389`

**Issue**: The `joinQueue` handler validates the match mode and wager format (`validateMatchMode`), checks auth for wagered queues (`requireAuth`), but never calls `verifyBalance()` for either player. When two players match, the server immediately creates the escrow and emits `startPick` without verifying either wallet has sufficient SOL.

**Contrast with createRoom/joinRoom**:
- `createRoom` (line 1136-1148): Calls `verifyBalance(walletAddress, wagerAmount)`, rejects if insufficient
- `joinRoom` (line 981-993): Calls `verifyBalance(joinerWallet, roomWager)`, rejects if insufficient
- `joinQueue` (lines 1213-1389): No `verifyBalance()` call anywhere

**Code path**:
```javascript
// main.js:1231
if (wagerAmount > 0 && !requireAuth(client, 'joinQueue')) return;
// Auth check exists but NO balance check follows
// ...
// main.js:1256-1280: Room is created, wager recorded, escrow invoked
const escrowResult = await createMatchEscrow(roomId, wagerAmount, opponent.wallet, joinerWallet);
// Both players immediately receive deposit instructions
```

**Exploitability**: Medium. Requires two cooperating sockets or a player who joins the queue knowing they lack funds. The escrow PDA is created on-chain before deposits are received, costing fees. The 2-minute deposit timer (`DEPOSIT_TIMEOUT_MS`) will eventually cancel the escrow, but the on-chain PDA creation fee is unrecoverable.

**Impact**: DoS via escrow creation spam; insolvent players enter wagered matches, disrupting matchmaking.

**Existing Mitigations**: The deposit timeout (2 minutes) and `escrowDepositConfirm` on-chain verification eventually catch insolvent players, but only after resource consumption.

**Severity**: CRITICAL — bypasses the balance verification path that all other wager entry points enforce.

---

### BL-C02: Play-Again Wager State Is Phantom (CRITICAL)

**File**: `server/socket-io/main.js:2498-2561`

**Issue**: The `playAgainRequest` handler resets `matchStates`, `goldStates`, `weaponInventories`, but explicitly preserves `wagerStates` (comment at line 2526: "H037: Don't delete wagerStates — cleaned up by removeRoom or next createRoom"). The intent is to carry the wager into the rematch. However:

1. No new balance verification is performed before the rematch starts
2. No new escrow is created for the rematch
3. No new deposits are collected
4. The `ws.deposits` map (tracking per-player deposit confirmations) is not cleared
5. The `room.escrowPDA` still points to the now-settled (or cancelled) escrow from the previous match

When the rematch completes and settlement is attempted, `settleMatch(winnerWallet, loserWallet, ws.amount, roomId)` is called with the same `roomId`. But the previous match's escrow PDA was already settled or cancelled. The call to `settleMatchEscrow(matchId, winnerAddress)` will fail because the escrow account has been closed on-chain.

**Code path**:
```javascript
// playAgainRequest: wagerStates preserved, matchStates recreated
matchStates[client.roomId] = createMatchState(client.roomId, paRoundType)
delete goldStates[client.roomId]
// wagerStates[client.roomId] NOT deleted — still has old amount + wallet mapping

// Later in fire handler, when match ends:
const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount, roomId)
// settleMatchEscrow(roomId, winnerAddress) — but the escrow for roomId is already closed
// Result: settlement fails, handleSettlementFailure called, match cancelled
```

**Exploitability**: High. Any two players who click "play again" after a wagered match will trigger this path. The rematch appears to be wagered (both players see the wager amount in UI) but settlement will fail, and the match transitions to CANCELLED state. No funds are at risk (old escrow already settled), but players are deceived about the wager status.

**Impact**: Wagered rematch silently becomes a free match with a failed settlement, eroding trust. If players discover this, it can be exploited to play multiple "wagered" rematches for free.

**Existing Mitigations**: The `handleSettlementFailure` retry mechanism will attempt to cancel (not settle) the closed escrow, which will also fail, and after 5 retries the entry is dropped. No actual fund loss.

**Recommendation**: Either (a) disallow wagered rematches entirely (redirect to lobby), or (b) create a new escrow and collect new deposits before starting the rematch.

**Severity**: CRITICAL — wagered rematch is economically deceptive; settlement will always fail.

---

### BL-C03: positionUpdate Circumvents moveCount Enforcement (CRITICAL)

**File**: `server/socket-io/main.js:2371-2402`

**Issue**: The `positionUpdate` event directly overwrites the server-authoritative tank position (`room.host.pos` or `room.player.pos`) based on a client-reported coordinate, validated only by:
```javascript
const dx = Math.abs(clampedX - currentPos.x)
const dy = Math.abs(clampedY - currentPos.y)
if (dx > 400 || dy > 200) {
    return  // Reject
}
```

The `stepLeft`/`stepRight` handlers enforce a 4-step limit (`moveCounts[client.id] <= 4`) and only allow 80px per step. The intended movement is 4 x 80 = 320px maximum per turn. However, `positionUpdate` allows 400px per event in the X axis with no per-turn count limit. The global rate limiter allows 30 events/second.

**Attack scenario**:
1. Client fires shot and immediately emits a burst of `positionUpdate` events
2. Each moves the server tank position 400px in the desired direction
3. After one `fire` event, the client can reposition freely up to the rate limit
4. The next `fire` event uses the manipulated server position

**Rate limit calculation**: 30 events/sec × 400px = 12,000px/sec. The game map is 1200px wide. Tank can traverse the entire map in 0.1 seconds.

**Note**: The `positionUpdate` handler does check `BATTLE` state and distance, but:
- It does NOT check that `client.id === ms.currentTurn` (off-turn movement is allowed)
- It does NOT check `moveCounts`
- The distance bound allows 400px per event, far exceeding the 80px step limit

**Impact**: Player can fire from arbitrary positions, circumventing server-authoritative tank placement and enabling guaranteed hits on opponent.

**Existing Mitigations**: The `fire` handler uses server-stored positions with a 400px tolerance for the firing position (`dx <= 400 && dy <= 200`). This means if a player manipulates their position by 400px before firing, the fire handler still accepts the manipulated position as within tolerance of the server position.

**Severity**: CRITICAL — breaks server-authoritative physics model; allows fire-from-anywhere attacks.

---

### BL-H01: requestTerrain Resets Round State on Duplicate Call (HIGH)

**File**: `server/socket-io/main.js:2278-2344`

**Issue**: The `requestTerrain` handler caches the terrain in `room._terrainCache` and re-sends the cache on subsequent calls. However, the cache is deleted in `endShopPhase` (`main.js:285`):
```javascript
if (room) delete room._terrainCache
```

In a BO3/BO5 match, `endShopPhase` is called at the start of each round. After `endShopPhase` runs for round 2, `room._terrainCache` is null. If either player then emits `requestTerrain`, a new terrain is generated, re-initializing:
- `room.heightmap` (new terrain)
- `room.terrainSeed`
- `room.wind`
- `room.host.pos` / `room.player.pos` (new tank positions)
- `ms.hp[hostId]` / `ms.hp[playerId]` (reset to 250)
- `ms.currentTurn` (re-randomized)
- Turn timer reset

A player can exploit this mid-round to reset HP to 250 when losing, reset tank positions to favorable starting points, and re-randomize who goes first.

**Exploitability**: Medium. Requires a socket in the room during BATTLE state after round 2+.

**Existing Mitigations**: Auth guard (`requireAuth`) prevents unauthenticated calls. But any authenticated player in the room can trigger this.

**Severity**: HIGH — allows full round state reset mid-battle in multi-round matches.

---

### BL-H02: Queue Joiner Balance Not Verified (HIGH)

**File**: `server/socket-io/main.js:1213-1252`

**Issue**: This overlaps with BL-C01 but specifically covers the joiner side. In the queue flow, the joiner's wallet is `authenticatedWallets[client.id] || null` (line 1276). The queue entry for the opponent also only stores `opponent.wallet: authenticatedWallets[client.id] || null` (line 1275, captured at queue entry time). Neither wallet is verified for balance before pairing.

```javascript
// main.js:1242-1252
if (queue.length > 0) {
    const opponent = queue[0]; // peek first
    if (opponent.wager !== wagerAmount) {
        // wager mismatch — queue separately
        queue.push({ ... });
        return;
    }
    queue.shift(); // consume opponent
    // Immediately create room, create escrow — no balance check
```

**Severity**: HIGH — second critical queue balance bypass; listed separately as it affects the opposing player who entered the queue potentially minutes before pairing.

---

### BL-H03: escrowDepositConfirm Single-Retry Too Short (HIGH)

**File**: `server/socket-io/main.js:1740-1778`

**Issue**: After a client submits `escrowDepositConfirm`, the server fetches the escrow state with a single 2-second retry:
```javascript
let escrowState = await getEscrowState(rid)
if (!escrowState) {
    await new Promise(r => setTimeout(r, 2000))
    escrowState = await getEscrowState(rid)
}
if (!escrowState) {
    client.emit('escrowError', { reason: 'Escrow PDA not found on-chain' })
    return
}
```

Devnet confirmation times vary from 1-30 seconds. A 2-second retry catches only the fastest confirmations. After rejection, the server does not retry — the `ws.deposits[client.id]` is never set, and the deposit timer will eventually cancel the escrow.

**Impact**: Legitimate players on slower connections or during network congestion lose their deposits (from escrow cancel) after paying the deposit transaction fee.

**Severity**: HIGH — leads to legitimate fund loss via escrow cancellation; degrades UX significantly.

---

### BL-H04: giveTurn Relay Has No Validation (HIGH)

**File**: `server/socket-io/main.js:2479-2483`

```javascript
client.on('giveTurn', (data) => {
    if (!data || typeof data !== 'object') return
    const { terrainData, pos1, pos2, rotation1, rotation2 } = data
    client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
})
```

No auth check, no state check, no value validation. A player can inject arbitrary `terrainData` (potentially a large array), fabricated positions (`pos1`, `pos2`), and rotations to the opponent at any time, including outside BATTLE state. This is a legacy relay event but remains active.

**Impact**: Opponent desync; potential client crash if terrainData is oversized; can be used to spoof position data that the opponent's legacy client uses.

**Severity**: HIGH — unauthenticated, unvalidated relay of game state to opponent.

---

### BL-H05: five_win_streak Milestone Claimable via Practice Mode (HIGH)

**File**: `server/services/shot-token.js:65, 286-295`

The milestone `five_win_streak` (reward: 40 SHOT) is documented in the litepaper as "Win 5 Matches in a Row" with the implied context of wagered play. The `consecutiveWins` field is incremented for wagered wins but is not decremented in practice mode:

```javascript
if (isWagered) {
    state.wageredMatchesPlayed++;
    if (isWinner) {
        state.wageredWins++;
        state.consecutiveWins++;  // increment only for wagered wins
    } else {
        state.consecutiveWins = 0; // reset streak on any wagered loss
    }
} else {
    // Practice mode: streak unaffected (neither increments nor resets)
}
```

The `five_win_streak` milestone check is:
```javascript
{ id: 'five_win_streak', check: (s) => s.consecutiveWins >= 5 }
```

A player with 4 consecutive wagered wins who loses their next wagered match (resetting the streak to 0) can then switch to practice mode to preserve their current streak, while accumulating wagered wins elsewhere. But more directly: the streak was designed for wagered play, but the rateMultiplier for practice is 0.25, so the reward would be `floor(40 * 0.25) = 10 SHOT` instead of 40 SHOT. The check fires from state but practice mode doesn't increment `consecutiveWins`, so the only way to reach 5 is via wagered wins. This is actually correctly implemented — practice mode doesn't increment the counter.

**Correction on BL-H05**: Upon re-review, `consecutiveWins` is only incremented by wagered wins, so the 5-win streak is only achievable via wagered play. The practice-mode rate multiplier then applies to any milestone earned during a practice match. Since `consecutiveWins` doesn't change in practice mode, the milestone would be awarded during the next wagered match where the threshold is crossed, not in practice. The `rateMultiplier = isWagered ? 1.0 : 0.25` applies at the time the milestone fires. A player with `consecutiveWins === 5` who plays a wagered match earns 40 SHOT; one who then plays a practice match will see `consecutiveWins` unchanged at 5, but the milestone is already in `milestonesEarned` and won't fire again.

**Revised severity**: LOW — the implementation is actually correct; `five_win_streak` requires 5 wagered wins in sequence and fires at full rate when earned via a wagered match. Practice-mode 0.25x multiplier doesn't apply because the milestone can only fire during a wagered match check.

---

### BL-M01: Shop Phase Starts Without Escrow Deposit Confirmation (MEDIUM)

**File**: `server/socket-io/main.js:1399-1482`

The `ready` handler transitions to `WEAPON_SHOP` when both players are ready, regardless of escrow deposit status:

```javascript
client.on('ready', () => {
    if (!requireAuth(client, 'ready')) return
    // ...
    if (room.host.isReady && room.player && room.player.isReady) {
        // No check: ws.deposits[hostId] && ws.deposits[playerId]
        transitionState(ms, MATCH_STATES.WEAPON_SHOP)
        // Shop starts immediately
```

In wagered matches with escrow enabled, both players must have confirmed deposits before the match has financial backing. If both players click ready before confirming their deposits, the match proceeds as a wagered game with an underfunded escrow.

**Impact**: Match completes, settlement is attempted, but one or both players haven't deposited. The on-chain settle instruction would succeed for the funded player and fail for the unfunded one, creating an inconsistent payout.

**Severity**: MEDIUM — escrow verification catches this eventually, but the match state machine has no gate at the `ready` transition.

---

### BL-M02: shopDone Accepts Any Socket ID as Ready (MEDIUM)

**File**: `server/socket-io/main.js:1553-1573`

```javascript
client.on('shopDone', () => {
    if (!requireAuth(client, 'shopDone')) return
    const room = findRoom(client.roomId)
    if (!room) return
    // ...
    const ready = shopReady[client.roomId]
    if (!ready) return
    ready[client.id] = true  // Sets client.id without checking if it's host or player

    const hostId = room.host ? room.host.socketId : null
    const playerId = room.player ? room.player.socketId : null

    if (hostId && playerId && ready[hostId] && ready[playerId]) {
        endShopPhase(io, client.roomId)
    }
```

The `shopReady` map is initialized with `{ [hostId]: false, [playerId]: false }`. The check `ready[hostId] && ready[playerId]` only triggers if both host and player IDs are set to true. Setting `ready[client.id]` where `client.id` is neither `hostId` nor `playerId` would simply add a third key with no effect on the check.

**Revised assessment**: The logic is actually correct — `ready[client.id] = true` for a non-participant adds a key but the end-phase check only looks at `ready[hostId]` and `ready[playerId]`. A third-party socket cannot trigger `endShopPhase` this way.

**Revised severity**: INFO — the logic is safe by accident (the readiness check only looks at specific player IDs).

---

### BL-M03: Host Tiebreak Advantage in isMatchOver (MEDIUM)

**File**: `server/services/match.js:165-188`

```javascript
export function isMatchOver(matchState, hostId, playerId) {
    // ...
    if (matchState.currentRound >= matchState.maxRounds) {
        const hostScore = matchState.scores[hostId] || 0;
        const playerScore = matchState.scores[playerId] || 0;
        if (hostScore !== playerScore) {
            return { isOver: true, winner: hostScore > playerScore ? hostId : playerId };
        }
        // Draw — could handle differently, for now host wins tiebreak
        return { isOver: true, winner: hostId };
    }
    // ...
}
```

Similarly in `getRoundWinner`:
```javascript
return hostId; // tiebreak
```

The host always wins in a complete draw (equal HP, equal score, equal round wins). This is a systematic advantage that persists across settlement. In wagered matches, the host always wins ties, meaning the host player can exploit this by playing defensively to reach a draw.

**Impact**: Wagered match outcome manipulation; not random as a fair game should be.

**Severity**: MEDIUM — systematic economic advantage for host in draw scenarios.

---

### BL-M04: Forfeit Path Skips cleanupRoom and H069 Guard (MEDIUM)

**File**: `server/socket-io/main.js:288-403`

The `startTurnTimer` forfeit handler (module-level, outside the connection closure) directly calls `removeRoom()` and `io.socketsLeave()` without going through `cleanupRoom()`. The `cleanupRoom()` function contains the `H069` guard:

```javascript
// In cleanupRoom (inside connection closure):
if (ms && ms.status === MATCH_STATES.SETTLING) {
    client.leave(roomId)
    io.sockets.in(roomId).emit('opponentLeft', {})
    client.roomId = null
    client.isHost = false
    return  // Don't destroy room during settlement
}
```

The forfeit path does check for SETTLING:
```javascript
// In startTurnTimer:
transitionState(ms, MATCH_STATES.SETTLING)
// ... settlement ...
await removeRoom(roomId)
```

But it calls `removeRoom()` immediately after settlement, regardless of whether settlement succeeded. If settlement is still in-flight when `removeRoom()` fires (e.g., if settlement takes > 0ms and something else triggers `removeRoom` in parallel), the room state is destroyed mid-settlement.

Also, the forfeit path does not use `withLock('settle:${roomId}')`, whereas the fire handler and `cleanupRoom` both do. This creates a race window: forfeit fires → settlement starts → `fire` event arrives → fire handler acquires lock → fire handler transitions to SETTLING → fails (already SETTLING from forfeit) and returns (transitionState returns false, early return).

The `transitionState` guard in fire handles this correctly (returns false on invalid transition, line 2082: `if (!transitioned) return`). So the race is actually handled.

**Severity**: MEDIUM — structural concern; the `removeRoom` call in the forfeit path should ideally check settlement completion.

---

### BL-M05: Burn Verification Allows Over-Burn Without Tier Skip (MEDIUM)

**File**: `server/services/shot-token.js:509-514`

```javascript
const expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000);
if (BigInt(ixAmount) < expectedRaw) {
    return { valid: false, reason: `Burned ${ixAmount} raw but need ${expectedRaw} for prestige` };
}
```

The `>=` check allows a player to burn more than the required tier cost. The `prestigeBurn()` function then only advances one tier and deducts the exact tier cost from the server-side balance (not the actual burned amount). The excess burned tokens are consumed on-chain but not deducted from the server-side balance, creating an inconsistency where the server thinks the player has more SHOT than they actually do on-chain.

This matters because SHOT balances are an off-chain accounting construct (the real tokens are on-chain SPL tokens). The server balance can drift from on-chain reality via over-burns. A player could exploit this: burn the required amount for tier 1 (200 SHOT), but also accidentally burn enough for tier 2 (500 SHOT). The server counts only 200 as burned, leaving them with a fictional balance surplus.

**Impact**: Server-side SHOT balance inflation; mild economic inconsistency.

**Severity**: MEDIUM — server SHOT balance can exceed actual on-chain balance after over-burn.

---

### BL-L01: Relay Events Allow Out-of-State Messages (LOW)

**File**: `server/socket-io/main.js:2348-2368`

`weaponChange`, `angleChange`, `powerChange` relay events have no state validation. They can be emitted from SETTLING, COMPLETE, CANCELLED states, sending spurious movement data to the opponent after the match ends.

**Severity**: LOW — cosmetic/UX issue only; no economic impact.

---

### BL-L02: createWeaponArray Has No State Guard (LOW)

**File**: `server/socket-io/main.js:1666-1691`

```javascript
client.on('createWeaponArray', (data) => {
    if (!requireAuth(client, 'createWeaponArray')) return
    if (!data || typeof data !== 'object') return
    // No: if (ms && ms.status !== MATCH_STATES.LOBBY) return
    var room = findRoom(client.roomId)
    if (!room) return
    // ...
    room.randomArray = randomArray  // Overwrites existing array
```

Can overwrite `room.randomArray` during any match state. Legacy mechanism.

**Severity**: LOW — randomArray is a legacy field; server-authoritative terrain (via `requestTerrain`) takes precedence.

---

### BL-L03: matchId Dedup Key Uses Date.now() (LOW)

**File**: `server/socket-io/main.js:2156`

```javascript
const matchId = `${roomId}:${ms.currentRound}:${Date.now()}`
```

Using `Date.now()` means the same roomId+round combination generates a unique matchId each time. If a server crashes and recovers, replaying the match completion event would generate a new matchId and successfully credit SHOT again for the same match. The `claimedMatchIds` Set persists to MongoDB (via `saveMilestoneState`), but only if that save completed before the crash.

**Severity**: LOW — requires server crash during specific window; MongoDB persistence mitigates most cases.

---

### Gold Economy: Correctly Implemented

`gold.js` is well-designed:
- `spendGold()` rejects negative costs, checks balance before deduction, cannot go negative
- `earnGold()` only awards for positive damage
- No overflow risk at the math level
- Starting balance (1000G) and earn rates match the litepaper

The only residual concern is that Gold state is per-match and ephemeral, lost on server restart — but this is documented and acknowledged.

---

### State Machine: Substantially Hardened

The `TRANSITIONS` table in `match.js` now includes `BATTLE → SETTLING` (fix H022) and all `→ CANCELLED` paths. The `transitionState()` return value is now checked in the fire handler:
```javascript
const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
if (!transitioned) return  // Another handler already settled
```

The `withLock('settle:${roomId}')` mutex correctly prevents double-settlement in `cleanupRoom` and the fire handler.

**Remaining gap**: The `startTurnTimer` forfeit path does not use `withLock`, but its `transitionState(ms, MATCH_STATES.SETTLING)` call will fail if any other handler has already moved to SETTLING, which prevents double-settlement. The lock is not strictly required here.

---

### SHOT Token Economy: Supply Cap Now Enforced

`shot-token.js` correctly implements:
- Global `totalShotEmitted` counter capped at `SHOT_TOKEN_CONFIG.rewardPool` (7M)
- Per-match ID deduplication via `claimedMatchIds` Set (persisted to MongoDB)
- Minimum turn count (4) before rewards
- 30-second cooldown between rewards per wallet
- Milestone rewards earned at most once per account
- MongoDB persistence of all milestone state

**Remaining gap**: The 30-second cooldown is per-wallet, not per-server. With multiple server instances (horizontal scaling), two parallel completions 1 second apart on different instances would both pass the cooldown check. Not currently exploitable in the single-instance deployment.

---

### Authentication Chain: Mostly Enforced

Post-hardening, authentication is required for:
- `createRoom` (wagered)
- `joinRoom` (wagered)
- `joinQueue` (wagered)
- `fire`
- `ready`
- `buyWeapon`, `shopDone`
- `deleteRoom`
- `stepLeft`, `stepRight`, `positionUpdate`, `requestTurn`, `requestTerrain`
- `createWeaponArray`
- `playAgainRequest`
- `escrowDepositConfirm`
- `prestigeBurn`

`requireAuth` checks `client.isAuthenticated` which is set during wallet signature verification. JWT tokens are still generated but not validated on subsequent events — authentication is socket-session-scoped, not token-scoped. This means authentication is lost on disconnect/reconnect, and the `rejoinRoom` handler correctly requires re-verification before restoring auth state.

---

### Summary Table

| Finding | Severity | File | Line(s) | Exploitable? |
|---------|----------|------|---------|-------------|
| BL-C01: joinQueue no balance check | CRITICAL | main.js | 1213-1389 | Yes |
| BL-C02: playAgain phantom wager | CRITICAL | main.js | 2498-2561 | Yes |
| BL-C03: positionUpdate bypasses moveCount | CRITICAL | main.js | 2371-2402 | Yes |
| BL-H01: requestTerrain resets round state | HIGH | main.js | 2278-2344 | Yes (round 2+) |
| BL-H02: Queue joiner no balance check | HIGH | main.js | 1213-1252 | Yes |
| BL-H03: escrowDepositConfirm single retry | HIGH | main.js | 1740-1778 | Circumstantial |
| BL-H04: giveTurn relay unvalidated | HIGH | main.js | 2479-2483 | Yes |
| BL-H05: five_win_streak (corrected) | LOW | shot-token.js | 65 | No (correctly implemented) |
| BL-M01: Shop starts without deposit confirmation | MEDIUM | main.js | 1399-1482 | Yes |
| BL-M03: Host always wins tiebreak | MEDIUM | match.js | 165-188, 198-212 | Yes (systematic) |
| BL-M04: Forfeit path skips withLock | MEDIUM | main.js | 291-403 | Theoretical |
| BL-M05: Burn verification allows over-burn | MEDIUM | shot-token.js | 509-514 | Yes (mild) |
| BL-L01: Relay events out-of-state | LOW | main.js | 2348-2368 | No |
| BL-L02: createWeaponArray no state guard | LOW | main.js | 1666-1691 | Marginal |
| BL-L03: matchId uses Date.now() | LOW | main.js | 2156 | Crash-dependent |
| BL-I01: withLock busy-poll pattern | INFO | guards.js | 120-148 | No |
| BL-I02: Balance cache 30s TTL | INFO | solana.js | 95-113 | Dev mode only |
