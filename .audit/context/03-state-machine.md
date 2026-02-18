# 03 -- State Machine Integrity Audit

## Audit Metadata
- **Auditor**: Claude Opus 4.6 (automated static analysis)
- **Date**: 2026-02-14
- **Scope**: All server-side state transitions, event guards, and race conditions
- **Files Analyzed**:
  - `server/socket-io/main.js` (1058 LOC) -- primary socket handler, all event routing
  - `server/services/match.js` (177 LOC) -- state machine definition, transition/validation logic
  - `server/services/gold.js` (114 LOC) -- Gold economy state mutations
  - `server/services/solana.js` (208 LOC) -- settlement flow (async, stub)
  - `server/services/shot-token.js` (216 LOC) -- SHOT token state mutations
  - `server/models/Weapon.js` (113 LOC) -- weapon catalog (static)
  - `server/middleware/auth.js` (138 LOC) -- authentication (no state guard integration)
  - `server/services/monitoring.js` (211 LOC) -- analytics counters
  - `server/services/physics.js` (458 LOC) -- physics engine (stateless)
  - `server/index.js` (60 LOC) -- Express + Socket.IO bootstrap

---

## State Machine Overview

### Defined States (match.js:10-18)

```
LOBBY --> WEAPON_SHOP --> BATTLE --> ROUND_END --+--> WEAPON_SHOP (next round)
                                                 +--> SETTLING --> COMPLETE
Any state --> CANCELLED
```

States: `lobby`, `weapon_shop`, `battle`, `round_end`, `settling`, `complete`, `cancelled`

### Transition Table (match.js:21-29)

| From          | Valid Targets                            |
|---------------|------------------------------------------|
| LOBBY         | WEAPON_SHOP, BATTLE, CANCELLED           |
| WEAPON_SHOP   | BATTLE, CANCELLED                        |
| BATTLE        | ROUND_END, CANCELLED                     |
| ROUND_END     | WEAPON_SHOP, SETTLING, CANCELLED         |
| SETTLING      | COMPLETE, CANCELLED                      |
| COMPLETE      | (terminal)                               |
| CANCELLED     | (terminal)                               |

### Action Validation Table (match.js:59-73)

| State        | Allowed Actions                                    |
|--------------|----------------------------------------------------|
| LOBBY        | join, leave, ready                                  |
| WEAPON_SHOP  | buyWeapon, shopDone                                 |
| BATTLE       | fire, move, angleChange, powerChange, weaponChange, stepLeft, stepRight, giveTurn, requestTurn, shoot |
| ROUND_END    | playAgainRequest                                    |
| SETTLING     | (none)                                              |
| COMPLETE     | (none)                                              |
| CANCELLED    | (none)                                              |

---

## FINDINGS

---

### SM-01: `fire` During LOBBY/WEAPON_SHOP -- Partially Guarded but Bypassable

**Severity**: HIGH
**Location**: `server/socket-io/main.js:671-696`
**State**: LOBBY, WEAPON_SHOP

**Description**:
The `fire` event handler checks `validateAction(ms.status, 'fire')` at line 680, but the entire validation block is guarded by `if (ms)` at line 678. If `matchStates[roomId]` is undefined (which can happen if `playAgainRequest` just deleted and recreated it, or during a race window), the guard is skipped entirely and physics runs unprotected.

```javascript
// main.js:675-696
const ms = matchStates[client.roomId]
if (ms) {                                    // <-- if ms is falsy, ALL checks skipped
    if (!validateAction(ms.status, 'fire')) {
        client.emit('fireRejected', { reason: `Cannot fire during ${ms.status}` })
        return
    }
    if (ms.currentTurn && ms.currentTurn !== client.id) {
        client.emit('fireRejected', { reason: 'Not your turn' })
        return
    }
}
// Execution continues to physics even if ms was null/undefined
```

**Exploit Scenario**:
1. Player A triggers `playAgainRequest`, which at line 1015 calls `matchStates[roomId] = createMatchState(roomId)`. During the brief window between `delete wagerStates[...]` (line 1019) and the new state being fully propagated, Player B fires.
2. If `matchStates[roomId]` is momentarily `undefined` due to race between `removeRoom` (line 92: `delete matchStates[roomId]`) and a queued `fire` event, the fire proceeds with no state check.

**Recommendation**:
Change the `if (ms)` guard to a hard rejection:
```javascript
const ms = matchStates[client.roomId]
if (!ms) {
    client.emit('fireRejected', { reason: 'No active match' })
    return
}
```
Apply this same pattern to all event handlers that currently use soft `if (ms)` guards.

---

### SM-02: `buyWeapon` During BATTLE -- Correctly Guarded, But `weaponId` Allows PRESTIGE Weapons

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:515-571`, `server/models/Weapon.js:56-58`
**State**: Any

**Description**:
The `buyWeapon` handler at line 520 correctly validates `validateAction(ms.status, 'buyWeapon')`, which only permits purchases during `WEAPON_SHOP`. However, the weapon lookup at line 526 uses `getWeapon(weaponId)`, which only searches `WEAPON_CATALOG` (launch weapons) and returns `null` for prestige weapons. This means prestige weapons cannot be bought through the shop -- good.

However, there is NO validation that the `weaponId` field used in the `fire` event (line 692) is actually in the player's inventory. The `fire` handler only checks `WEAPON_DATA[weaponId]` exists (which includes all weapon IDs). A player could fire with any weapon ID that exists in `WEAPON_DATA`, regardless of whether they purchased it.

```javascript
// main.js:692-694 -- fire handler
if (!WEAPON_DATA[weaponId]) {
    client.emit('fireRejected', { reason: 'Invalid weapon' })
    return
}
// NO CHECK: Is weaponId in weaponInventories[roomId][client.id]?
```

**Exploit Scenario**:
Player buys only the free Single Shot (ID 0) but fires with `weaponId: 9` (Crazy Ivan, cost 2500 Gold) or `weaponId: 5` (Heatseeker). The server runs physics for the expensive weapon without verifying ownership.

**Recommendation**:
Add inventory check in the `fire` handler:
```javascript
const inventory = weaponInventories[client.roomId]
if (inventory && inventory[client.id] && !inventory[client.id].includes(weaponId)) {
    client.emit('fireRejected', { reason: 'Weapon not in inventory' })
    return
}
```

---

### SM-03: `ready` Event Has No State Guard -- Can Re-trigger WEAPON_SHOP From Any State

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:414-508`

**Description**:
The `ready` event handler performs NO `validateAction` check. It does not verify the match is in LOBBY state before allowing the ready-up flow. If both players set `isReady = true`, the handler transitions the match to `WEAPON_SHOP` and re-initializes Gold/inventories regardless of current state.

```javascript
// main.js:414-508
client.on('ready', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    if (client.isHost === true) {
        room.host.isReady = true
        if (room.player && room.player.isReady === true) {
            // ... initializes Gold, inventories, transitions to WEAPON_SHOP
            const ms = matchStates[client.roomId]
            if (ms) {
                transitionState(ms, MATCH_STATES.WEAPON_SHOP)  // <-- no current-state check
            }
```

The `transitionState` function (match.js:38-49) DOES validate the transition, so `BATTLE -> WEAPON_SHOP` would return `false`. But the code ignores the return value -- it proceeds to emit `shopPhase` and `startGame` regardless:

```javascript
// main.js:436-437
if (ms) {
    transitionState(ms, MATCH_STATES.WEAPON_SHOP)  // returns false if invalid, but unchecked
}
// Execution continues -- shopPhase emitted, timers started, Gold reset
```

**Exploit Scenario**:
1. Match is in BATTLE state, mid-round.
2. Both players rapidly send `ready` events.
3. `transitionState` returns `false` (BATTLE -> WEAPON_SHOP is invalid), but Gold/inventories are still re-initialized at lines 423-427 and 469-477.
4. `shopPhase` and `startGame` events are emitted, potentially causing client desync.
5. Gold balances are reset to 1000 for both players, erasing any Gold earned during battle.
6. `shopTimers` are started, which will call `endShopPhase` and attempt another transition.

**Recommendation**:
Add state guard and check transition return value:
```javascript
client.on('ready', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    const ms = matchStates[client.roomId]
    if (ms && ms.status !== MATCH_STATES.LOBBY) return  // Only allow ready in LOBBY
    // ... rest of handler
    if (ms) {
        const transitioned = transitionState(ms, MATCH_STATES.WEAPON_SHOP)
        if (!transitioned) return  // Abort if transition invalid
    }
```

---

### SM-04: SETTLING -> COMPLETE Transition Can Be Interrupted by Disconnect

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:802-860` (fire handler settlement), `server/socket-io/main.js:180-228` (disconnect handler)

**Description**:
The SETTLING -> COMPLETE transition happens within an async block in the `fire` handler. Between `transitionState(ms, MATCH_STATES.SETTLING)` (line 803) and `transitionState(ms, MATCH_STATES.COMPLETE)` (line 831), there is an `await settleMatch(...)` call (line 814). If a player disconnects during this await, the `disconnect` handler runs concurrently.

The `disconnect` handler at line 188 checks:
```javascript
if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
    // forfeit settlement
}
```

Since the state is `SETTLING` during the await, the disconnect handler's condition is `false`, so it skips the forfeit path. But it still proceeds to:
```javascript
// main.js:220-224
client.leave(client.roomId)
await removeRoom(client.roomId)       // <-- DELETES matchStates[roomId]
io.sockets.in(client.roomId).emit('opponentLeft', {})
```

`removeRoom` at line 91-108 deletes `matchStates[roomId]`, `goldStates[roomId]`, `wagerStates[roomId]`, and removes the room from the `rooms` array. When the `fire` handler's `await settleMatch()` returns, it continues executing on a now-deleted match state:

```javascript
// After await returns, these references are stale/deleted:
transitionState(ms, MATCH_STATES.COMPLETE)  // ms object still exists in memory but room is gone
io.sockets.in(client.roomId).emit('matchEnd', {...})  // emits to empty room
```

The `matchEnd` event is emitted to a room that no longer has any members (both sockets left/disconnected), so neither player receives settlement confirmation.

**Exploit Scenario**:
1. Player A fires the winning shot. Server enters SETTLING state and calls `await settleMatch()`.
2. Player B disconnects during the settlement await.
3. `removeRoom` deletes all state. `wagerStates[roomId]` is deleted.
4. The fire handler continues, emits `matchEnd` to an empty room.
5. Neither player receives settlement confirmation.
6. If settlement was real (not a stub), funds could be sent without either player being notified.
7. The `recordMatchPlayed` calls at lines 844/848 reference `wagerStates[client.roomId]` which is now `undefined`, so `wsState?.wallets?.[hostId]` returns `undefined`, and SHOT tokens are not awarded.

**Recommendation**:
1. Add a settling lock that prevents `removeRoom` during settlement:
```javascript
var settlingRooms = new Set()

// In fire handler before settlement:
settlingRooms.add(client.roomId)
// ... settlement ...
settlingRooms.delete(client.roomId)

// In removeRoom:
if (settlingRooms.has(roomId)) return  // Don't remove during settlement
```
2. Alternatively, capture all needed state (wagerStates, wallets) into local variables BEFORE the await.

---

### SM-05: `playAgainRequest` Races With `matchEnd` -- State Wipe During Settlement

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:1004-1053` (playAgainRequest), `server/socket-io/main.js:802-860` (matchEnd in fire handler)

**Description**:
The `playAgainRequest` handler has NO state guard. It does not check `ms.status`. According to the `validateAction` table, `playAgainRequest` is only allowed in `ROUND_END`, but the handler does not call `validateAction`:

```javascript
// main.js:1004-1053
client.on('playAgainRequest', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    if (client.isHost === true) {
        room.host.playAgain = true
        if (room.player && room.player.playAgain === true) {
            // WIPES ALL STATE:
            matchStates[client.roomId] = createMatchState(client.roomId)  // reset to LOBBY
            delete goldStates[client.roomId]
            delete weaponInventories[client.roomId]
            delete shopReady[client.roomId]
            delete wagerStates[client.roomId]     // <-- WAGER GONE
```

There is no check that the match is in `COMPLETE` or `ROUND_END` state. A player can send `playAgainRequest` while the match is in `SETTLING` state.

**Exploit Scenario**:
1. The winning shot triggers SETTLING state. `settleMatch()` is awaited.
2. Both players simultaneously send `playAgainRequest` (or had already set `playAgain = true` from a previous interaction).
3. `playAgainRequest` handler runs, deletes `wagerStates[roomId]`, resets `matchStates[roomId]` to a fresh LOBBY state.
4. Settlement completes, but `wagerStates` is gone. The `matchEnd` emission at line 858 sends `wager: ws ? ws.amount : 0` -- since `ws` was deleted, it sends `wager: 0`.
5. Both players see a new game lobby instead of settlement results.
6. If real SOL was at stake, the settlement may execute but players never see the results and wager tracking is lost.

**Recommendation**:
Add state validation to `playAgainRequest`:
```javascript
client.on('playAgainRequest', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    const ms = matchStates[client.roomId]
    if (!ms || (ms.status !== MATCH_STATES.COMPLETE && ms.status !== MATCH_STATES.ROUND_END)) return
    // ... rest of handler
})
```

---

### SM-06: Disconnect During SETTLING Causes Double Settlement

**Severity**: CRITICAL
**Location**: `server/socket-io/main.js:180-228` (disconnect), `server/socket-io/main.js:802-831` (fire handler settlement)

**Description**:
There is no mutex or "already settling" flag. Two settlement paths exist:

1. **Normal settlement** (fire handler, lines 802-831): Triggered when `isMatchOver` returns true. Calls `settleMatch(winnerWallet, loserWallet, ws.amount)`.
2. **Forfeit settlement** (disconnect handler, lines 186-217): Triggered when a player disconnects during `BATTLE` or `WEAPON_SHOP`. Calls `settleMatch(opponentWallet, disconnectorWallet, ws.amount)`.

The disconnect handler checks `ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP`. If a player disconnects during BATTLE but AFTER the winning shot has been processed (state briefly still BATTLE before transitioning to ROUND_END/SETTLING), both paths can execute:

Timing scenario:
```
T1: Player A fires winning shot
T2: fire handler: isRoundOver() = true, isMatchOver() = true
T3: fire handler: transitionState(ms, MATCH_STATES.SETTLING)
    -- state is now SETTLING --
T4: fire handler: await settleMatch(...)  -- SETTLEMENT #1 in progress
T5: Player B disconnects
T6: disconnect handler: ms.status === 'settling' -- condition FALSE, skip forfeit
    -- No double settlement in this exact path
```

However, consider this timing where Node.js event loop interleaves:
```
T1: Player A fires winning shot (async fire handler starts)
T2: fire handler: processes shot, isRoundOver() = true
T3: Player B disconnects (disconnect handler queued)
T4: fire handler: isMatchOver() = true, ms.status still BATTLE (transition not yet called)
T5: disconnect handler runs: ms.status === BATTLE -- condition TRUE
T6: disconnect handler: settleMatch(opponentWallet, disconnectorWallet, ws.amount) -- SETTLEMENT #1
T7: disconnect handler: removeRoom(client.roomId) -- all state deleted
T8: fire handler resumes: transitionState(ms, SETTLING) -- ms still in memory as local ref
T9: fire handler: settleMatch(winnerWallet, loserWallet, ws.amount) -- SETTLEMENT #2
```

At T5, the disconnect handler checks `ms.status` which is still `BATTLE` because the fire handler has not yet called `transitionState`. The disconnect handler runs synchronously up to `await settleMatch()`, then yields. The fire handler could then also reach its `settleMatch()` call.

Since `settleMatch` is currently a stub (returns immediately), both calls complete. When real on-chain settlement is implemented, this results in the winner being paid twice from escrow.

**Exploit Scenario**:
1. In a wagered match, Player A fires the winning shot.
2. Player B times a disconnect to happen after `isMatchOver` is evaluated but before `transitionState(ms, SETTLING)`.
3. Both settlement paths execute, potentially paying the winner twice or paying different winners.

**Recommendation**:
Add a settlement lock per room:
```javascript
var settlingLock = new Set()

// Before any settlement:
if (settlingLock.has(roomId)) return
settlingLock.add(roomId)
try {
    await settleMatch(...)
} finally {
    settlingLock.delete(roomId)
}
```

---

### SM-07: Both Players Disconnect Simultaneously -- Double Forfeit Settlement

**Severity**: HIGH
**Location**: `server/socket-io/main.js:180-228`

**Description**:
When both players disconnect at the same time (e.g., network outage), each player's `disconnect` handler runs independently. For each:

1. Player A disconnects: handler checks `ms.status === BATTLE`, determines Player B is opponent, calls `settleMatch(B_wallet, A_wallet, amount)` -- B wins by forfeit.
2. Player B disconnects: handler checks `ms.status === BATTLE` (state not yet mutated by A's handler since A is awaiting), determines Player A is opponent, calls `settleMatch(A_wallet, B_wallet, amount)` -- A wins by forfeit.

Both calls to `settleMatch` proceed because:
- The `ms` object is read at the start of each handler and the status check passes for both before either modifies it.
- `removeRoom` is called by both handlers (line 221/263), but the second call is a no-op (room already removed from array). However, the settlement calls happen BEFORE `removeRoom`.

After both handlers complete:
- `removeRoom` is called twice (second is harmless).
- Two conflicting settlements are issued: one says A wins, the other says B wins.

```javascript
// disconnect handler, lines 186-210
if (ws && ws.amount > 0 && ms) {
    const room = findRoom(client.roomId)
    if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
        const opponentId = client.isHost
            ? (room.player ? room.player.socketId : null)
            : (room.host ? room.host.socketId : null)
        // Both handlers see valid room + BATTLE state
        const settlementResult = await settleMatch(opponentWallet, disconnectorWallet, ws.amount)
        // Both settlements execute
    }
}
```

**Exploit Scenario**:
1. Wagered match in BATTLE state.
2. Both players close browser simultaneously (or network drops).
3. Server issues two settlements: A wins (from B's disconnect) and B wins (from A's disconnect).
4. With real escrow, both players could potentially receive payouts.

**Recommendation**:
Same settlement lock as SM-06. Additionally, transition state to SETTLING before calling settleMatch in the disconnect handler:
```javascript
if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
    const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
    if (!transitioned) return  // Another handler already started settling
    // ... proceed with settlement
}
```

---

### SM-08: Room Can Be Joined After It Is Active (Race in `joinRoom`)

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:288-344`

**Description**:
The `joinRoom` handler checks `room.active === true` at line 291 and returns if the room is active. However, `room.active` is set to `true` at line 337, which happens AFTER the balance check `await verifyBalance(...)` at line 307.

```javascript
client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
    if (client.roomId === roomId) return
    var room = findRoom(roomId)
    if (!room || room.active === true) return    // <-- check

    // ... wallet verification (async, may take 1-2 seconds for RPC) ...
    try {
        const balanceCheck = await verifyBalance(joinerWallet, roomWager)  // <-- AWAIT
        // ...
    } catch (err) { /* skip */ }

    // ... 20+ lines later ...
    room.active = true                            // <-- set
})
```

Between the `room.active` check at line 291 and setting `room.active = true` at line 337, another player could also pass the check and enter the room. This is a classic TOCTOU (Time-Of-Check-Time-Of-Use) race.

**Exploit Scenario**:
1. Player B and Player C both see room R in the lobby (active: false).
2. Both send `joinRoom` at the same time.
3. Both pass the `room.active === true` check.
4. Both reach the balance verification await.
5. Player B's await returns first, sets `room.player` and `room.active = true`.
6. Player C's await returns, overwrites `room.player` with Player C's data.
7. Player B is in the room but `room.player` now points to Player C.
8. Player B's socket is joined to the room but has no representation in the room object.
9. Three people are in a two-player game.

**Recommendation**:
Set `room.active = true` immediately after the initial check, before any async operations:
```javascript
var room = findRoom(roomId)
if (!room || room.active === true) return
room.active = true  // Lock immediately
// ... rest of handler. If anything fails, set room.active = false
```

---

### SM-09: `shopDone` Spam Does Not Skip Timer, But Has No Idempotency Guard

**Severity**: LOW
**Location**: `server/socket-io/main.js:574-593`

**Description**:
The `shopDone` handler sets `ready[client.id] = true` and checks if both players are ready. It validates the action with `validateAction(ms.status, 'shopDone')` at line 579, which only allows it during `WEAPON_SHOP`. The `endShopPhase` function at line 128 checks `ms.status !== MATCH_STATES.WEAPON_SHOP` and returns early if already transitioned.

```javascript
client.on('shopDone', () => {
    // ...
    ready[client.id] = true       // Idempotent -- setting true to true is no-op
    if (hostId && playerId && ready[hostId] && ready[playerId]) {
        endShopPhase(io, client.roomId)   // Has state guard at line 128
    }
})
```

Spamming `shopDone` is effectively harmless because:
1. Setting `ready[id] = true` again is a no-op.
2. `endShopPhase` checks state before transitioning.
3. After the first successful transition, `shopReady` is deleted (line 155).

However, there is a subtle issue: after `endShopPhase` deletes `shopReady[roomId]` (line 155), subsequent `shopDone` calls will hit `if (!ready) return` at line 582 and exit cleanly.

**Exploit Scenario**: None significant. Spam is handled correctly.

**Recommendation**: None required, but adding a log for duplicate `shopDone` calls could help debugging.

---

### SM-10: `removeRoom` Called Mid-Battle Causes Silent State Destruction

**Severity**: HIGH
**Location**: `server/socket-io/main.js:89-108` (removeRoom), called from disconnect (line 221), leaveRoom (line 263), deleteRoom (line 277)

**Description**:
`removeRoom` unconditionally destroys ALL room state:
```javascript
async function removeRoom(roomId) {
    rooms = rooms.filter((r) => r.roomId !== roomId);
    delete matchStates[roomId];
    delete goldStates[roomId];
    delete weaponInventories[roomId];
    delete shopReady[roomId];
    delete wagerStates[roomId];
    if (shopTimers[roomId]) {
        clearTimeout(shopTimers[roomId]);
        delete shopTimers[roomId];
    }
    // ... DB update
}
```

There is no state check. It does not verify whether settlement is in progress, whether the match has active wagers, or whether the room is in a critical state. It is called from three places:
1. `disconnect` (line 221) -- always called after forfeit settlement attempt
2. `leaveRoom` (line 263) -- always called after forfeit settlement attempt
3. `deleteRoom` (line 277) -- called with NO settlement logic at all

The `deleteRoom` handler is particularly dangerous:

```javascript
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        client.leave(client.roomId)
        await removeRoom(client.roomId)       // No settlement, no refund
        io.sockets.in(client.roomId).emit('opponentLeft', {})
        io.emit('setRooms', {rooms: getOpenRooms()})
        io.socketsLeave(client.roomId);
        client.roomId = null
        client.isHost = false
    }
})
```

No wager settlement or refund logic. No check if the room is active. No host-only authorization.

**Exploit Scenario**:
1. Wagered match in BATTLE state, Player A is losing.
2. Player A sends `deleteRoom` event.
3. All state is destroyed: `wagerStates` deleted, match cancelled in DB.
4. No settlement or refund occurs -- both players' wagers are effectively burned.
5. Player B receives `opponentLeft` but no settlement.

**Recommendation**:
1. `deleteRoom` should only be allowed in LOBBY state (before the match starts).
2. Add host-only authorization check.
3. Add wager refund logic for non-LOBBY deletions.
4. `removeRoom` should check if settlement is needed before destroying wager state:
```javascript
async function removeRoom(roomId) {
    const ms = matchStates[roomId]
    if (ms && ms.status === MATCH_STATES.SETTLING) return false  // Don't remove during settlement
    // ... rest of removal
}
```

---

### SM-11: `requestTerrain` Can Force State Transition to BATTLE From Any State

**Severity**: HIGH
**Location**: `server/socket-io/main.js:877-914`

**Description**:
The `requestTerrain` handler at line 897 transitions the match to BATTLE:
```javascript
client.on('requestTerrain', () => {
    const room = findRoom(client.roomId)
    if (!room) return

    // ... terrain generation ...

    const ms = matchStates[client.roomId]
    if (ms) {
        ms.terrain = heightmap
        ms.tankPositions = tankPositions
        if (ms.status !== MATCH_STATES.BATTLE) {
            transitionState(ms, MATCH_STATES.BATTLE)    // <-- forces BATTLE
        }
        ms.currentTurn = getNextTurn(ms, ...)
    }
    // ... emit to both clients
})
```

There is no state validation. Any client can send `requestTerrain` at any time. The `transitionState` function validates the transition table, so only valid transitions would succeed. But `WEAPON_SHOP -> BATTLE` IS a valid transition (match.js:23), so a player could skip the shop timer by sending `requestTerrain` during the weapon shop phase.

Additionally, `LOBBY -> BATTLE` is a valid transition (match.js:22), so `requestTerrain` could skip the entire ready-up and weapon shop flow.

**Exploit Scenario**:
1. Room is created (LOBBY state). Only host is present, no opponent.
2. Host sends `requestTerrain`. State transitions LOBBY -> BATTLE.
3. Match is now in BATTLE state with no opponent, no Gold initialization, no weapon inventory.
4. Alternatively: during WEAPON_SHOP, a player sends `requestTerrain` to skip the shop and jump straight to BATTLE before opponent finishes buying weapons.

**Recommendation**:
Add state guard:
```javascript
client.on('requestTerrain', () => {
    const room = findRoom(client.roomId)
    if (!room) return
    const ms = matchStates[client.roomId]
    if (!ms) return
    // Only allow terrain request during WEAPON_SHOP (normal flow) or ROUND_END (new round)
    if (ms.status !== MATCH_STATES.WEAPON_SHOP && ms.status !== MATCH_STATES.ROUND_END) return
    // ... rest of handler
})
```

---

### SM-12: `leaveRoom` Duplicates `disconnect` Forfeit Logic -- Inconsistent State Handling

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:233-270` vs `server/socket-io/main.js:180-228`

**Description**:
The `leaveRoom` handler (lines 233-270) is nearly identical to the disconnect handler (lines 180-228), but with subtle differences:

1. **disconnect** checks `ms.status === MATCH_STATES.LOBBY` for refund (lines 211-217). `leaveRoom` does NOT check for LOBBY refund.
2. **disconnect** handles the case where `ms.status === SETTLING` by skipping settlement (line 188 condition is false). `leaveRoom` has the same condition, so it also skips. But `leaveRoom` still calls `removeRoom`, destroying state during settlement.
3. **disconnect** deletes `authenticatedWallets[client.id]` (line 228). `leaveRoom` does NOT.

The duplicated logic means any bug fix applied to one path must also be applied to the other, creating maintenance risk.

**Exploit Scenario**:
1. Player is in LOBBY with a wager. They send `leaveRoom` instead of disconnecting.
2. `leaveRoom` does not check for LOBBY refund like `disconnect` does (lines 211-217).
3. Player's wager is not refunded.

**Recommendation**:
Extract shared forfeit/cleanup logic into a single function:
```javascript
async function handlePlayerLeave(io, client, reason) {
    // Single implementation for both disconnect and leaveRoom
}
```

---

### SM-13: Ready-Up Flow Race Condition -- Double Gold Initialization

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:414-508`

**Description**:
The `ready` handler has duplicated logic for host (lines 417-460) and player (lines 462-507). Both branches check if the OTHER player is ready. If two `ready` events arrive in quick succession (both players click ready at the same moment), Node.js processes them sequentially, but there is a subtle race:

1. Host sends `ready`. Handler sets `room.host.isReady = true`. Checks `room.player.isReady` -- it's `false`. Returns without starting.
2. Player sends `ready`. Handler sets `room.player.isReady = true`. Checks `room.host.isReady` -- it's `true`. Starts the match.

This is the intended flow and works correctly for normal timing. However:

If Player sends `ready` first and Host's `ready` arrives while the Player's handler is still executing (between `room.player.isReady = true` and the `room.host.isReady` check), both branches could see the other as ready and BOTH could initialize Gold/inventories and start shop timers.

In practice, this is unlikely in single-threaded Node.js since there are no async operations before the mutual check. But the code structure (two identical 40-line blocks) invites copy-paste bugs.

**Recommendation**:
Add a "match started" guard:
```javascript
client.on('ready', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    const ms = matchStates[client.roomId]
    if (!ms || ms.status !== MATCH_STATES.LOBBY) return  // Guard: only in LOBBY

    if (client.isHost) room.host.isReady = true
    else if (room.player) room.player.isReady = true
    else return

    if (room.host.isReady && room.player && room.player.isReady) {
        // Single path for starting match
    }
})
```

---

### SM-14: `ROUND_END` -> `WEAPON_SHOP` Transition Is Never Triggered

**Severity**: MEDIUM (design gap)
**Location**: `server/services/match.js:25`, `server/socket-io/main.js:861-870`

**Description**:
The transition table defines `ROUND_END -> WEAPON_SHOP` as valid (match.js:25), supporting multi-round matches with a shop phase between rounds. However, the `fire` handler's round-end logic (main.js:861-870) only emits `roundEnd` and transitions to `ROUND_END` -- it never transitions back to `WEAPON_SHOP` for the next round:

```javascript
// main.js:861-870
} else {
    transitionState(ms, MATCH_STATES.ROUND_END)
    io.sockets.in(client.roomId).emit('roundEnd', {
        winner: roundWinner,
        scores: ms.scores,
        roundWins: ms.roundWins,
        round: ms.currentRound,
        goldBalance: goldStates[client.roomId] || {}
    })
}
```

After `roundEnd` is emitted, there is no handler or event to transition from `ROUND_END` to `WEAPON_SHOP` or `BATTLE` for the next round. The match is effectively stuck in `ROUND_END` forever.

The `playAgainRequest` handler (which is the only action allowed in `ROUND_END` per the validation table) resets the ENTIRE match state to LOBBY, not just advances to the next round.

For single-round matches (`roundType: '1'`), this is not an issue because the match ends after one round. But for BO3/BO5, the state machine has no path to continue.

**Recommendation**:
Implement a `nextRound` event or automatically transition from `ROUND_END` to `WEAPON_SHOP` after a delay:
```javascript
// After emitting roundEnd:
setTimeout(() => {
    const ms = matchStates[roomId]
    if (ms && ms.status === MATCH_STATES.ROUND_END) {
        transitionState(ms, MATCH_STATES.WEAPON_SHOP)
        // Re-emit shopPhase
    }
}, 5000)
```

---

### SM-15: `BATTLE -> ROUND_END` Transition Missing -- Direct to SETTLING

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:802-803`, `server/services/match.js:24`

**Description**:
The transition table requires `BATTLE -> ROUND_END` (match.js:24), and then `ROUND_END -> SETTLING` (match.js:25). However, the fire handler at line 802-803 transitions directly from `BATTLE` to `SETTLING`:

```javascript
// main.js:802-803
if (matchResult.isOver) {
    transitionState(ms, MATCH_STATES.SETTLING)   // BATTLE -> SETTLING: NOT IN TRANSITION TABLE
```

The transition table defines:
```javascript
[MATCH_STATES.BATTLE]: [MATCH_STATES.ROUND_END, MATCH_STATES.CANCELLED]
```

`BATTLE -> SETTLING` is NOT a valid transition. The `transitionState` function will log a warning and return `false`, but the code ignores the return value and proceeds with settlement anyway. This means:
1. `ms.status` remains `BATTLE` (not `SETTLING`) because the transition was rejected.
2. The disconnect handler can still trigger forfeit settlement (it checks for `BATTLE` state).
3. The `COMPLETE` transition at line 831 also fails (since `ms.status` is still `BATTLE`, and `BATTLE -> COMPLETE` is not valid).
4. The match state is permanently stuck in `BATTLE` even though the match is over.

**Exploit Scenario**:
After match completion, both players can continue sending `fire` events because `ms.status` never leaves `BATTLE`. The `validateAction(ms.status, 'fire')` check passes. Scores, Gold, and SHOT tokens could be accumulated indefinitely after the match should have ended.

**Recommendation**:
Fix the transition path: BATTLE -> ROUND_END -> SETTLING -> COMPLETE:
```javascript
if (matchResult.isOver) {
    transitionState(ms, MATCH_STATES.ROUND_END)
    transitionState(ms, MATCH_STATES.SETTLING)
    // ... settlement ...
    transitionState(ms, MATCH_STATES.COMPLETE)
}
```
Or add `SETTLING` as a valid transition from `BATTLE`:
```javascript
[MATCH_STATES.BATTLE]: [MATCH_STATES.ROUND_END, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED],
```

---

### SM-16: `transitionState` Return Value Universally Ignored

**Severity**: HIGH
**Location**: All calls to `transitionState` in `server/socket-io/main.js`

**Description**:
The `transitionState` function returns `boolean` indicating whether the transition was valid. Every call site in `main.js` ignores this return value:

| Line | Call | Return Checked? |
|------|------|-----------------|
| 130  | `transitionState(ms, MATCH_STATES.BATTLE)` | No |
| 436  | `transitionState(ms, MATCH_STATES.WEAPON_SHOP)` | No |
| 482  | `transitionState(ms, MATCH_STATES.WEAPON_SHOP)` | No |
| 803  | `transitionState(ms, MATCH_STATES.SETTLING)` | No |
| 831  | `transitionState(ms, MATCH_STATES.COMPLETE)` | No |
| 862  | `transitionState(ms, MATCH_STATES.ROUND_END)` | No |
| 898  | `transitionState(ms, MATCH_STATES.BATTLE)` | No |

This means the state machine's transition validation is purely decorative -- a `console.warn` is emitted but execution continues as if the transition succeeded. The server proceeds with actions that should be blocked by the state machine.

**Recommendation**:
Every call to `transitionState` should check the return value and abort if `false`:
```javascript
if (!transitionState(ms, MATCH_STATES.SETTLING)) {
    console.error(`[StateMachine] Failed transition ${ms.status} -> SETTLING for room ${roomId}`)
    return  // or handle error appropriately
}
```

---

### SM-17: Legacy Relay Events Have No State Guards

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js` -- multiple relay handlers

**Description**:
The following events are pure client-to-client relays with zero server validation:

| Line | Event | Guard |
|------|-------|-------|
| 631  | `weaponPick` | None |
| 637  | `getWeaponArray` | Room exists only |
| 645  | `createWeaponArray` | Room exists only |
| 664  | `shoot` | None |
| 918  | `weaponChange` | None |
| 924  | `angleChange` | None |
| 930  | `powerChange` | None |
| 937  | `terrainPath` | Room exists only |
| 969  | `getTerrainPath` | Room exists only |
| 978  | `stepLeft` | None |
| 984  | `stepRight` | None |
| 991  | `giveTurn` | None |
| 998  | `requestTurn` | None |

The `shoot` event (line 664) is a legacy event that relays fire data directly to the opponent with no server-side physics, state validation, or turn checking. It exists alongside the new `fire` event (line 671) which has validation. A malicious client can use the `shoot` event to bypass all server-side validation and fire unlimited shots.

**Exploit Scenario**:
1. Client reverse-engineers the socket protocol.
2. Instead of sending `fire` (which has state/turn validation), they send `shoot` (which is a pure relay).
3. Opponent receives `opponentShoot` and processes it client-side without server validation.
4. Attacker can fire out of turn, fire during shop phase, fire unlimited times per turn.

**Recommendation**:
1. Remove the `shoot` relay event or gate it behind a feature flag for backward compatibility.
2. Add state validation to all relay events that affect gameplay.
3. At minimum, add `if (!matchStates[client.roomId] || matchStates[client.roomId].status !== MATCH_STATES.BATTLE) return` to gameplay relays.

---

### SM-18: `deleteRoom` Has No Authorization Check

**Severity**: HIGH
**Location**: `server/socket-io/main.js:274-284`

**Description**:
Any player in a room can delete it, not just the host:
```javascript
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        // No check: client.isHost === true
        // No check: matchState is LOBBY
        client.leave(client.roomId)
        await removeRoom(client.roomId)
        // ...
    }
})
```

The non-host player (joiner) can delete the room during any state, including mid-battle with active wagers.

**Exploit Scenario**:
1. Player B (non-host) is losing a wagered match.
2. Player B sends `deleteRoom`.
3. Room is destroyed with no settlement or refund.
4. Player A loses their wager with no recourse.

**Recommendation**:
```javascript
client.on('deleteRoom', async () => {
    if (client.roomId !== null && client.isHost === true) {
        const ms = matchStates[client.roomId]
        if (ms && ms.status !== MATCH_STATES.LOBBY) {
            // If match started, treat as forfeit instead of delete
            // ... forfeit logic ...
            return
        }
        // Only allow clean delete in LOBBY
        await removeRoom(client.roomId)
    }
})
```

---

### SM-19: No Timeout for Stale Rooms/Matches

**Severity**: MEDIUM
**Location**: All state stores in `server/socket-io/main.js:19-40`

**Description**:
There are seven in-memory state stores:
```javascript
var rooms = []
var matchStates = {}
var goldStates = {}
var weaponInventories = {}
var shopTimers = {}
var shopReady = {}
var wagerStates = {}
var authenticatedWallets = {}
```

None of these have TTL (time-to-live) or cleanup mechanisms. If a room enters a broken state (e.g., stuck in `ROUND_END` due to SM-14, or stuck in `BATTLE` due to SM-15), it persists in memory forever until the server restarts.

The `matchState.stateChangedAt` timestamp is recorded (match.js:48/98) but never checked. There is no periodic sweep to clean up stale rooms.

**Exploit Scenario**:
1. Attacker creates hundreds of rooms via `createRoom` without joining.
2. Rooms accumulate in memory (`rooms`, `matchStates`, `wagerStates`).
3. Server memory grows unbounded, eventually causing OOM crash.
4. Alternatively: legitimate matches that hit a state bug remain in memory forever, leaking wager state.

**Recommendation**:
Add a periodic cleanup sweep:
```javascript
setInterval(() => {
    const now = Date.now()
    const STALE_TIMEOUT = 30 * 60 * 1000  // 30 minutes
    for (const [roomId, ms] of Object.entries(matchStates)) {
        if (now - ms.stateChangedAt > STALE_TIMEOUT) {
            removeRoom(roomId)
        }
    }
}, 60 * 1000)  // Check every minute
```

---

### SM-20: `playAgainRequest` Deletes `wagerStates` -- New Game Has No Wager

**Severity**: MEDIUM
**Location**: `server/socket-io/main.js:1019, 1043`

**Description**:
When both players agree to play again, the handler deletes `wagerStates[roomId]` (lines 1019/1043):
```javascript
delete wagerStates[client.roomId]
```

The new game starts with no wager, even if the original match was wagered. There is no prompt to re-wager. The `playAgain` event emitted to clients (line 1025/1049) does not include any wager information.

This is a design issue rather than a security vulnerability, but it means:
1. Players who agreed on a wagered match get a free rematch with no wager.
2. The wager state is lost, so if the settlement for the previous match was not yet processed (race with SM-05), the wager data is gone.

**Recommendation**:
Either preserve the wager for the rematch or prompt players to confirm a new wager:
```javascript
// Option A: Preserve wager
// Don't delete wagerStates[client.roomId]

// Option B: Inform client
io.sockets.in(client.roomId).emit('playAgain', {
    previousWager: ws ? ws.amount : 0,
    wagerRequired: false  // or true to require re-wager
})
```

---

## SUMMARY TABLE

| ID    | Severity | Category            | Description                                                  |
|-------|----------|---------------------|--------------------------------------------------------------|
| SM-01 | HIGH     | Missing Guard       | `fire` handler skips all validation if matchState is null    |
| SM-02 | MEDIUM   | Missing Guard       | `fire` handler does not verify weapon is in player inventory |
| SM-03 | CRITICAL | Missing Guard       | `ready` event has no state check, can reset Gold mid-battle  |
| SM-04 | CRITICAL | Race Condition      | Disconnect during SETTLING destroys state mid-settlement     |
| SM-05 | CRITICAL | Race Condition      | `playAgainRequest` wipes wager during active settlement      |
| SM-06 | CRITICAL | Race Condition      | Double settlement from disconnect + fire handler             |
| SM-07 | HIGH     | Race Condition      | Simultaneous disconnect = contradictory double settlement    |
| SM-08 | MEDIUM   | TOCTOU              | Two players can join same room due to async balance check    |
| SM-09 | LOW      | Spam Resilience     | `shopDone` spam is handled correctly                         |
| SM-10 | HIGH     | Missing Guard       | `removeRoom` destroys all state without settlement check     |
| SM-11 | HIGH     | Missing Guard       | `requestTerrain` can force BATTLE from LOBBY or WEAPON_SHOP  |
| SM-12 | MEDIUM   | Code Duplication    | `leaveRoom` duplicates disconnect logic with differences     |
| SM-13 | MEDIUM   | Race Condition      | Ready-up duplicated blocks invite initialization bugs        |
| SM-14 | MEDIUM   | Design Gap          | Multi-round matches stuck in ROUND_END (no next-round flow)  |
| SM-15 | MEDIUM   | Broken Transition   | BATTLE -> SETTLING not in transition table, state stuck      |
| SM-16 | HIGH     | Ignored Return      | `transitionState` return value never checked -- guards useless |
| SM-17 | MEDIUM   | Missing Guard       | Legacy relay events bypass all server validation             |
| SM-18 | HIGH     | Authorization       | `deleteRoom` has no host-only check, destroys wagered match  |
| SM-19 | MEDIUM   | Resource Leak       | No TTL/cleanup for stale rooms, unbounded memory growth      |
| SM-20 | MEDIUM   | Design Gap          | `playAgainRequest` deletes wager state for rematch           |

---

## PRIORITY REMEDIATION ORDER

### Immediate (Before any real SOL touches this code)

1. **SM-16**: Check `transitionState` return values everywhere -- this is the foundation all other fixes depend on.
2. **SM-15**: Fix BATTLE -> SETTLING transition path (either add to table or go through ROUND_END).
3. **SM-06 + SM-07**: Implement settlement lock (mutex per room) to prevent double settlement.
4. **SM-04**: Capture state into locals before await; prevent removeRoom during settlement.
5. **SM-05**: Add state guard to `playAgainRequest` (require COMPLETE state).
6. **SM-03**: Add LOBBY-only guard to `ready` event.

### High Priority (Before beta/public testing)

7. **SM-01**: Hard-reject `fire` when matchState is null.
8. **SM-10**: Add state checks to `removeRoom`; forbid during settlement.
9. **SM-11**: Gate `requestTerrain` to WEAPON_SHOP state only.
10. **SM-18**: Add host-only + LOBBY-only checks to `deleteRoom`.
11. **SM-02**: Verify weapon inventory in `fire` handler.

### Medium Priority (Pre-launch hardening)

12. **SM-08**: Lock room immediately on join, before async balance check.
13. **SM-12**: Refactor disconnect/leaveRoom into shared function.
14. **SM-13**: Refactor ready handler to eliminate code duplication.
15. **SM-17**: Remove legacy `shoot` relay or add state guards.
16. **SM-14**: Implement multi-round flow (ROUND_END -> WEAPON_SHOP -> BATTLE).
17. **SM-19**: Add stale room cleanup sweep.
18. **SM-20**: Decide on wager persistence for rematches.

### Low Priority

19. **SM-09**: No action needed (spam handled correctly).

---

## ARCHITECTURAL RECOMMENDATION

The root cause of most findings is that the state machine in `match.js` is well-designed but its enforcement is optional. The `transitionState` function validates transitions correctly, and `validateAction` maps actions to states correctly, but the socket handlers in `main.js` either:

1. Do not call `validateAction` (SM-03, SM-05, SM-11, SM-17)
2. Call `validateAction` but only inside an optional `if (ms)` block (SM-01)
3. Call `transitionState` but ignore the return value (SM-16)

**Proposed Architecture**:

Create a middleware-style guard that wraps every gameplay event handler:

```javascript
function withStateGuard(requiredStates, handler) {
    return function(data) {
        const ms = matchStates[this.roomId]
        if (!ms) {
            this.emit('error', { reason: 'No active match' })
            return
        }
        if (!requiredStates.includes(ms.status)) {
            this.emit('error', { reason: `Action not allowed in ${ms.status}` })
            return
        }
        return handler.call(this, data, ms)
    }
}

// Usage:
client.on('fire', withStateGuard([MATCH_STATES.BATTLE], async function(data, ms) {
    // ms is guaranteed non-null and in BATTLE state
}))

client.on('buyWeapon', withStateGuard([MATCH_STATES.WEAPON_SHOP], function(data, ms) {
    // ms is guaranteed non-null and in WEAPON_SHOP state
}))

client.on('ready', withStateGuard([MATCH_STATES.LOBBY], function(data, ms) {
    // ms is guaranteed non-null and in LOBBY state
}))
```

Additionally, implement a settlement lock as a `Set<roomId>` that prevents any state mutation (removeRoom, playAgainRequest, second settlement) while settlement is in progress.
