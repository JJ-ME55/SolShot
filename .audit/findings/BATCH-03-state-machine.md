# BATCH-03: State Machine Vulnerability Findings

**Auditor:** Claude Opus 4.6 (Automated Security Hypothesis Investigation)
**Date:** 2026-02-14
**Scope:** State machine transitions, concurrency, and game-state integrity in `server/socket-io/main.js` and `server/services/match.js`
**Branch:** dev

---

## H019: Ready event during BATTLE resets Gold

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `ready` handler at `main.js:414-507` performs **zero match-state validation** before executing. It does not check `matchStates[client.roomId].status` at any point. The only guard is whether the room exists and whether both players have `isReady === true`.

```javascript
// main.js:414-507
client.on('ready', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    if (client.isHost === true) {
        room.host.isReady = true
        if (room.player && room.player.isReady === true) {
            // Initialize Gold for this match  <-- NO STATE CHECK
            const hostId = room.host.socketId
            const playerId = room.player.socketId
            goldStates[client.roomId] = initGold(hostId, playerId)  // OVERWRITES existing Gold
            weaponInventories[client.roomId] = {                     // OVERWRITES existing inventory
                [hostId]: [0],
                [playerId]: [0]
            }
            // ...
            transitionState(ms, MATCH_STATES.WEAPON_SHOP)  // return value ignored
```

Key observations:
1. No call to `validateAction(ms.status, 'ready')` -- though `'ready'` is only listed as valid in LOBBY state per `match.js:61`.
2. `goldStates[client.roomId] = initGold(...)` at lines 423 and 469 unconditionally overwrites any existing Gold state, resetting both players to 1000 Gold.
3. `weaponInventories[client.roomId]` is similarly overwritten, destroying any purchased weapons.
4. `transitionState(ms, MATCH_STATES.WEAPON_SHOP)` at lines 436 and 482 will fail (return `false`) if current state is BATTLE (BATTLE only allows transitions to ROUND_END or CANCELLED per `match.js:24`), but the return value is ignored. The `shopPhase` and `startGame` events are still emitted regardless.
5. At lines 458-459 and 504-505, `isReady` is reset to `false` for both players, so the attack can be repeated.

**Exploit scenario:**

1. Match is in BATTLE state. Host has 3500 Gold, player has 800 Gold (player spent Gold on weapons).
2. Attacker (host) emits `ready` -- `room.host.isReady = true`.
3. Attacker's colluding partner (player) emits `ready` -- `room.player.isReady = true`.
4. Both `isReady` are true: `goldStates[roomId]` is overwritten with `initGold()`, resetting both to 1000 Gold.
5. `weaponInventories[roomId]` is reset to `[0]` for both, wiping any purchased weapons.
6. `shopPhase` event is emitted with a new 30-second timer, even though the state machine rejected the transition.
7. Both players can now re-purchase weapons during an active BATTLE. The player who spent all their Gold gets a full refund.

**Recommendation:**

Add state validation at the top of the `ready` handler:
```javascript
client.on('ready', () => {
    var room = findRoom(client.roomId)
    if (!room) return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'ready')) return  // Only allow in LOBBY
    // ... rest of handler
```

---

## H020: Double settlement via disconnect + fire race

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

There is **no mutex, lock, or `settlingRooms` Set** anywhere in the codebase. A grep for `settlingRooms` across the entire `server/` directory returns zero matches.

Two independent async code paths can invoke `settleMatch()` for the same room concurrently:

**Path 1 -- Fire handler settlement** (`main.js:802-830`):
```javascript
if (matchResult.isOver) {
    transitionState(ms, MATCH_STATES.SETTLING)         // line 803
    // ...
    const ws = wagerStates[client.roomId]              // line 807 - reads wager state
    if (ws && ws.amount > 0) {
        // ...
        const sResult = await settleMatch(...)          // line 814 - ASYNC, yields control
```

**Path 2 -- Disconnect handler settlement** (`main.js:180-221`):
```javascript
client.on('disconnect', async () => {
    const ws = wagerStates[client.roomId]               // line 184 - reads SAME wager state
    const ms = matchStates[client.roomId]               // line 185
    if (ws && ws.amount > 0 && ms) {
        if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
            const settlementResult = await settleMatch(...)  // line 198 - ASYNC, yields control
```

**Race condition timeline:**

1. Player A fires the killing shot. The `fire` handler begins executing.
2. `transitionState(ms, MATCH_STATES.SETTLING)` is called at line 803, but the transition **fails** (see H022 -- BATTLE->SETTLING is not in the transition table). The state remains BATTLE.
3. The fire handler reads `wagerStates[roomId]` at line 807 and enters the `await settleMatch()` call at line 814. JavaScript yields control to the event loop.
4. During this await, Player B disconnects. The disconnect handler fires.
5. Disconnect handler reads `wagerStates[roomId]` at line 184 -- it still exists because `removeRoom()` hasn't been called yet.
6. Disconnect handler checks `ms.status === MATCH_STATES.BATTLE` at line 188 -- this is TRUE because the BATTLE->SETTLING transition failed.
7. Disconnect handler calls `await settleMatch()` at line 198 -- **second settlement**.
8. Disconnect handler then calls `removeRoom()` at line 221, which deletes `wagerStates[roomId]`.
9. The fire handler's `settleMatch()` resolves. It continues emitting `matchEnd` with the first settlement data.

Result: `settleMatch()` is called **twice** for the same wager. When real on-chain settlement is implemented, this means the winner is paid twice and the pot is drained 2x.

**Additional path:** `leaveRoom` handler (`main.js:233-270`) contains identical settlement logic to `disconnect`, creating a **third** potential concurrent settlement path.

**Recommendation:**

1. Add a `settlingRooms` Set to prevent re-entry:
```javascript
const settlingRooms = new Set()

// Before any settlement:
if (settlingRooms.has(roomId)) return
settlingRooms.add(roomId)
try {
    await settleMatch(...)
} finally {
    settlingRooms.delete(roomId)
}
```
2. Fix BATTLE->SETTLING transition (see H022).
3. In disconnect/leaveRoom, check `ms.status === MATCH_STATES.SETTLING || ms.status === MATCH_STATES.COMPLETE` and skip settlement if already settling/settled.

---

## H021: playAgainRequest wipes wager mid-settlement

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `playAgainRequest` handler at `main.js:1004-1053` explicitly deletes `wagerStates[client.roomId]`:

```javascript
// main.js:1019 (host path) and 1043 (player path)
delete wagerStates[client.roomId]
```

This happens **unconditionally** when both players have `playAgain === true`. There is no check on `matchStates[client.roomId].status` -- the handler does not call `validateAction()` at all.

Note that `validateAction` in `match.js:64` lists `'playAgainRequest'` as valid only in `ROUND_END` state, but the handler never invokes this check.

The handler also resets the match state entirely:
```javascript
// main.js:1015 and 1039
matchStates[client.roomId] = createMatchState(client.roomId)   // replaces state with LOBBY
delete goldStates[client.roomId]
delete weaponInventories[client.roomId]
delete shopReady[client.roomId]
delete wagerStates[client.roomId]                               // WIPES WAGER
```

**Exploit scenario:**

1. Match is in BATTLE state. A wager of 0.5 SOL is active (`wagerStates[roomId].amount = 0.5`).
2. The fire handler detects match over, enters `await settleMatch()` at line 814. JavaScript yields control.
3. During the await, both players emit `playAgainRequest` in rapid succession (or colluding attacker controls both).
4. `playAgainRequest` handler executes synchronously: `delete wagerStates[client.roomId]` runs immediately.
5. `matchStates[roomId]` is replaced with a fresh LOBBY state.
6. The fire handler's `settleMatch()` resolves and continues. At line 839, it reads `wagerStates[client.roomId]` to find wallet addresses for SHOT tokens -- this is now `undefined`.
7. The `matchEnd` event is emitted, but the wager state used for SHOT token emission is gone.
8. On the next match, `createRoom` creates a fresh `wagerStates[roomId]` -- the new match is free (wager = 0 or whatever the creator sets), not bound by the previous wager.

When real escrow is implemented: A losing player can trigger `playAgainRequest` during the settlement await to wipe the wager state before the settlement transaction completes, potentially causing the settlement to reference deleted data or skip entirely.

**Recommendation:**

1. Add state validation to `playAgainRequest`:
```javascript
const ms = matchStates[client.roomId]
if (ms && ms.status !== MATCH_STATES.COMPLETE) return  // Only after match is fully settled
```
2. Do not delete `wagerStates` until after settlement is fully confirmed.

---

## H022: BATTLE to SETTLING missing transition

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `TRANSITIONS` table in `match.js:21-29` defines:

```javascript
const TRANSITIONS = {
    [MATCH_STATES.LOBBY]:       [MATCH_STATES.WEAPON_SHOP, MATCH_STATES.BATTLE, MATCH_STATES.CANCELLED],
    [MATCH_STATES.WEAPON_SHOP]: [MATCH_STATES.BATTLE, MATCH_STATES.CANCELLED],
    [MATCH_STATES.BATTLE]:      [MATCH_STATES.ROUND_END, MATCH_STATES.CANCELLED],           // <-- NO SETTLING
    [MATCH_STATES.ROUND_END]:   [MATCH_STATES.WEAPON_SHOP, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED],
    [MATCH_STATES.SETTLING]:    [MATCH_STATES.COMPLETE, MATCH_STATES.CANCELLED],
    [MATCH_STATES.COMPLETE]:    [],
    [MATCH_STATES.CANCELLED]:   []
};
```

BATTLE can only transition to ROUND_END or CANCELLED. SETTLING is **not listed** as a valid target from BATTLE.

However, `main.js:803` calls:
```javascript
transitionState(ms, MATCH_STATES.SETTLING)
```

This call returns `false` and logs a warning, but the **return value is never checked**:
```javascript
// main.js:802-803
if (matchResult.isOver) {
    transitionState(ms, MATCH_STATES.SETTLING)  // returns false, state stays BATTLE
```

Consequence: `ms.status` remains `'battle'` during the entire async settlement process. This directly enables the double-settlement race in H020, because the disconnect handler checks `ms.status === MATCH_STATES.BATTLE` and proceeds with a duplicate settlement.

Later at line 831, another transition is attempted:
```javascript
transitionState(ms, MATCH_STATES.COMPLETE)  // BATTLE -> COMPLETE is also invalid, returns false
```

The state **never leaves BATTLE** for the match-over path. This means:
- All state guards that check for SETTLING or COMPLETE will never trigger.
- The fire handler's `validateAction(ms.status, 'fire')` continues to return `true` for additional fire events during settlement.
- Disconnect/leaveRoom handlers see BATTLE status and attempt forfeit settlement.

**Return value checking across all call sites:**

| Line | Call | Return checked? |
|------|------|----------------|
| 130 | `transitionState(ms, MATCH_STATES.BATTLE)` | No |
| 436 | `transitionState(ms, MATCH_STATES.WEAPON_SHOP)` | No |
| 482 | `transitionState(ms, MATCH_STATES.WEAPON_SHOP)` | No |
| 803 | `transitionState(ms, MATCH_STATES.SETTLING)` | No |
| 831 | `transitionState(ms, MATCH_STATES.COMPLETE)` | No |
| 862 | `transitionState(ms, MATCH_STATES.ROUND_END)` | No |
| 898 | `transitionState(ms, MATCH_STATES.BATTLE)` | No |

**Zero out of seven call sites check the return value.**

**Recommendation:**

1. Add SETTLING to the BATTLE transitions: `[MATCH_STATES.BATTLE]: [MATCH_STATES.ROUND_END, MATCH_STATES.SETTLING, MATCH_STATES.CANCELLED]`
2. Add COMPLETE to the BATTLE transitions (or route through SETTLING first consistently).
3. Check `transitionState()` return values at all call sites and abort the operation if the transition is invalid:
```javascript
if (!transitionState(ms, MATCH_STATES.SETTLING)) {
    console.error('Failed to transition to SETTLING')
    return
}
```

---

## H023: turnCount never resets between rounds

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `isRoundOver()` function in `match.js:125-127` checks:
```javascript
export function isRoundOver(matchState) {
    return matchState.turnCount >= matchState.turnsPerRound;   // turnsPerRound = 20
}
```

`turnCount` is incremented at `main.js:759`:
```javascript
ms.turnCount++
```

When a round ends at `main.js:786-870`, the code handles round-end logic:
```javascript
if (ms && isRoundOver(ms)) {
    const hostId = room.host.socketId
    const playerId = room.player ? room.player.socketId : null
    const roundWinner = getRoundWinner(ms, hostId, playerId)
    ms.roundWins[roundWinner] = (ms.roundWins[roundWinner] || 0) + 1
    ms.currentRound++
    // ... check if match is over ...
    if (!matchResult.isOver) {
        transitionState(ms, MATCH_STATES.ROUND_END)
        io.sockets.in(client.roomId).emit('roundEnd', { ... })
    }
}
```

**There is no `ms.turnCount = 0` anywhere in the round-end path.** The `createMatchState()` function sets `turnCount: 0` at line 94, but that only runs on initial creation.

After round 1 ends:
- `ms.turnCount` = 20 (the value that triggered `isRoundOver`)
- `ms.turnsPerRound` = 20

When round 2 begins, the very first fire event increments `turnCount` to 21. Then `isRoundOver(ms)` checks `21 >= 20` = `true`. **Round 2 ends immediately after the first shot.**

For BO3 or BO5 matches, every round after the first is exactly 1 turn long.

Additionally, `ms.scores` is never reset between rounds, so `getRoundWinner()` uses cumulative scores rather than per-round scores. This means the player who won round 1 has a permanent score advantage and will likely win every subsequent 1-turn round.

**Exploit scenario (BO3 match):**

1. Round 1 plays normally for 20 turns. Player A wins with score 450 vs 300.
2. Round 2 starts. Player A fires once (turnCount goes to 21).
3. `isRoundOver()` returns true immediately. `getRoundWinner()` compares cumulative scores (still ~450 vs ~300+whatever). Player A wins round 2.
4. `isMatchOver()`: Player A has 2 round wins, needs `ceil(3/2) = 2`. Match is over. Player A wins after just 1 shot in round 2.

**Recommendation:**

Reset `turnCount` and optionally `scores` when transitioning between rounds:
```javascript
// After roundEnd emission, before transitioning to next shop phase:
ms.turnCount = 0
// Optionally reset scores for fair per-round scoring:
// ms.scores = {}
```

---

## H024: Legacy shoot relay

**Status:** CONFIRMED
**Severity:** MEDIUM

**Evidence:**

The `shoot` event handler at `main.js:663-666`:

```javascript
// LEGACY: shoot relay (still works -- client sends, server relays to opponent)
client.on('shoot', ({selectedWeapon, power, rotation, rotation1, rotation2, position1, position2}) => {
    client.to(client.roomId).emit('opponentShoot', {selectedWeapon, power, rotation, rotation1, rotation2, position1, position2})
})
```

This handler performs **zero server-side validation**:

1. **No state check** -- Does not verify `matchStates[roomId].status === BATTLE`. Can be emitted in any state.
2. **No turn check** -- Does not verify it is the emitting player's turn.
3. **No weapon validation** -- `selectedWeapon` is passed through without checking against `WEAPON_DATA` or the player's inventory.
4. **No type validation** -- All parameters (`power`, `rotation`, `rotation1`, `rotation2`, `position1`, `position2`) are relayed directly without type checking or bounds validation.
5. **No sanitization** -- Object values are forwarded as-is, creating a potential prototype pollution or XSS vector if the client trusts these values for DOM rendering.
6. **No room membership check** -- Only verifies `client.roomId` is set (implicitly via `client.to()`), but does not confirm the client is actually in a valid active match.

The `shoot` event coexists with the newer `fire` event. The comment explicitly says "still works," confirming this is an active code path. If the client still listens for `opponentShoot` events, an attacker can use this legacy relay to:
- Send arbitrary weapon data to the opponent's client
- Send forged position/rotation data to manipulate opponent's visual state
- Bypass the server-authoritative physics engine entirely

Note that `validateAction` in `match.js:63` lists `'shoot'` as valid in BATTLE state, confirming the developers intended it to be a valid action. But the handler never calls `validateAction`.

**Exploit scenario:**

1. Attacker connects to a room and joins a match.
2. Attacker emits `shoot` with arbitrary `position1`, `position2` values (e.g., placing their tank at the opponent's location).
3. The opponent's client receives `opponentShoot` and renders the forged shot, potentially displaying incorrect visual feedback.
4. If the legacy client processes damage client-side based on `opponentShoot` data, the attacker can forge hit/damage values.
5. This bypass runs in parallel with the server-authoritative `fire` path -- the attacker can use `fire` for "real" shots and `shoot` for visual manipulation.

**Recommendation:**

1. Remove the legacy `shoot` relay entirely if all clients have migrated to the `fire` event.
2. If backward compatibility is required, add at minimum:
   - State validation: `if (!ms || !validateAction(ms.status, 'shoot')) return`
   - Turn validation: `if (ms.currentTurn !== client.id) return`
   - Input type validation on all numeric parameters
3. Remove `'shoot'` from the `validateAction` allowed actions for BATTLE state if the legacy path is removed.

---

## Summary Table

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| H019 | Ready event during BATTLE resets Gold | CONFIRMED | HIGH |
| H020 | Double settlement via disconnect + fire race | CONFIRMED | CRITICAL |
| H021 | playAgainRequest wipes wager mid-settlement | CONFIRMED | CRITICAL |
| H022 | BATTLE to SETTLING missing transition | CONFIRMED | HIGH |
| H023 | turnCount never resets between rounds | CONFIRMED | HIGH |
| H024 | Legacy shoot relay | CONFIRMED | MEDIUM |

**All 6 hypotheses confirmed.** The state machine subsystem has fundamental integrity failures: the transition table is incomplete, return values are universally ignored, and no handler validates match state before mutating shared game state. The absence of any concurrency control (no `settlingRooms` Set, no locks) combined with the missing BATTLE->SETTLING transition creates a reliable double-settlement race condition that will cause direct fund loss when real on-chain settlement is implemented.
