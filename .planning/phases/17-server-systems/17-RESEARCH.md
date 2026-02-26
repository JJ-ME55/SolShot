# Phase 17: Server Systems - Research

**Researched:** 2026-02-26
**Domain:** Socket.IO server — shop, disconnect/reconnect, turn-timeout, playAgain, wager guard in main.js
**Confidence:** HIGH — all findings from direct codebase inspection of main.js (2854 lines), gold.js, match.js, and Phase 16 plan/summary files

---

## Summary

Phase 17 is a pure server refactor with no new external libraries. Phase 16 (complete as of today) migrated the room data model from binary `room.host`/`room.player` to `room.players[]` and `room.maxPlayers`. The battle engine, fire handler, movement handlers, and disconnect/reconnect handler were all updated in 16-01 through 16-03. However, several specific systems still contain residual 2-player assumptions or are missing N-player-specific correctness fixes that were explicitly deferred from Phase 16.

The primary research finding is that **most of the Phase 16 migration was actually completed correctly** — the shop system, disconnect handler, and reconnect handler all use `room.players[]`. What remains for Phase 17 is a small number of specific gaps: a debug log hardcoded to 2 players, the reconnect timeout path notifying only one opponent instead of all N, the wager guard for 3-4 player matches (missing entirely), and the `pendingReconnects` object storing `isHost` (a binary field) instead of `playerIndex`.

**Primary recommendation:** Phase 17 consists of targeted surgical fixes to specific lines in main.js. The planner should scope tasks narrowly — do not re-migrate anything Phase 16 already completed. Focus on the 5 specific gaps documented below.

---

## What Phase 16 Already Completed (Do Not Re-Migrate)

These systems are already N-player correct. Phase 17 plans must not repeat this work.

| System | Status | Evidence |
|--------|--------|----------|
| `endShopPhase` | DONE | Line 310: `const playerIds = room.players.map(p => p.socketId)` — N-player loop |
| `shopDone` handler | DONE | Lines 1741-1742: `room.players.length === room.maxPlayers && room.players.every(p => ready[p.socketId])` |
| `ready` handler (shop init) | DONE | Lines 1609-1618: `initGold(playerIds)`, `weaponInventories` loop over playerIds, `shopReady` fromEntries |
| `playAgainRequest` | DONE | Lines 2837-2840: `getPlayerSlot(room, client.id)` then `room.players.every(p => p.playAgain)` |
| `resetForPlayAgain` | DONE | Line 103: `room.players.forEach(p => { p.playAgain = false; })` |
| Reconnect remap (rejoinRoom) | DONE | Lines 967-1003: unified `room.players.find(oldSocketId)` remap + all per-player maps |
| `opponentDisconnected` emit | DONE | Lines 856-861: `room.players.filter(p => socketId !== client.id).forEach(...)` |
| `getOpenRooms` | DONE | Lines 204-218: `room.players.length < room.maxPlayers`, `currentPlayers`, `maxPlayers` |
| `getPlayerSlot` helper | DONE | Lines 24-26: `(room.players || []).find(p => p.socketId === socketId)` |

---

## Remaining 2-Player Assumptions (Phase 17 Work)

### Gap 1: Between-Round Debug Log (ready handler, line 1604-1606)

**Location:** `server/socket-io/main.js` lines 1604-1606

**Current code:**
```javascript
const hostId = playerIds[0]
const pid = playerIds[1]
console.log(`[BO3] Between-round shop: Round ${ms.currentRound} ended. Gold: host=${getBalance(goldStates[client.roomId], hostId)}, player=${getBalance(goldStates[client.roomId], pid)}`)
```

**Problem:** The variables `hostId`/`pid` reference only players[0] and players[1]. In a 3-4 player BO3/BO5, players[2] and players[3] are silently omitted from the log. The log label says `[BO3]` but this also runs for BO5.

**Fix:** Replace with an N-player log using `playerIds.map(...)`.

```javascript
const goldSummary = playerIds.map((id, i) => `P${i+1}=${getBalance(goldStates[client.roomId], id)}`).join(', ')
console.log(`[BetweenRound] Round ${ms.currentRound} ended. Gold: ${goldSummary}`)
```

**Severity:** Low — diagnostic only, does not affect game logic.

---

### Gap 2: `reconnectExpired` Notify — Only Tells One Player (disconnect handler, line 874-876)

**Location:** `server/socket-io/main.js` lines 853-876

**Current code (the `opponentId` variable):**
```javascript
const opponentId = room.players
    ? (room.players.find(p => p.socketId !== client.id)?.socketId || null)
    : null
```
This captures only the FIRST opponent (players[1] in a 3-4 player room). The `opponentDisconnected` broadcast correctly uses `room.players.filter(...)` (lines 856-861) but the `reconnectExpired` event at line 874-876 still uses the stale single `opponentId`:

```javascript
if (opponentId) {
    io.to(opponentId).emit('reconnectExpired', {})  // ONLY players[1] in N-player!
}
```

The `opponentId` variable is captured at disconnect time (before the setTimeout fires). In a 3-4 player game, players[2] and players[3] never receive `reconnectExpired`.

**Fix:** Replace the `reconnectExpired` emit with a loop. Since `opponentId` is captured in closure (before the 30s timer fires), we need to either:
- Option A: Capture all opponent socket IDs at disconnect time: `const opponentIds = room.players.filter(p => p.socketId !== client.id).map(p => p.socketId)` — then loop in the timer callback.
- Option B: Re-read `currentRoom.players` inside the timer callback (already re-read as `currentRoom`) and filter there.

Option B is safer (handles reconnect → new socket ID scenario):
```javascript
// Inside the setTimeout callback, after re-reading currentRoom:
if (currentRoom) {
    currentRoom.players
        .filter(p => p.socketId !== client.id)
        .forEach(p => io.to(p.socketId).emit('reconnectExpired', {}))
}
```

**Severity:** Medium — in a 3-player match, 1 player gets the reconnect-expired notification, 1 does not.

---

### Gap 3: `pendingReconnects` Stores `isHost` (Binary Field)

**Location:** `server/socket-io/main.js` lines 844-850, 939, 959

**Current code:**
```javascript
pendingReconnects[walletAddress] = {
    roomId,
    isHost: client.isHost,   // BINARY — meaningless for players[2]/players[3]
    oldSocketId: client.id,
    name: client.name,
    color: client.color,
}
```

And the rejoin uses it at line 959: `client.isHost = isHost`

**Problem:** `isHost` is `true` only for `players[0]`. Players[2] and [3] both get `isHost = false`. When they rejoin, `client.isHost = false` is set correctly. However, `client.isHost` is used by downstream guards (e.g., `deleteRoom` at line 1053: `if (!client.isHost)` blocks delete). For the reconnect path this is correct behavior — only host should be able to delete — but the `isHost` field name is semantically misleading for N-player and the comment at line 55 says `{ roomId, isHost, socketId (old), name, color }`.

**Decision:** Add `playerIndex` to `pendingReconnects` for future use (SYS-05 requirement: playerIndex preserved on reconnect). `isHost` can remain for the `client.isHost` assignment which only matters for host privilege guards.

```javascript
pendingReconnects[walletAddress] = {
    roomId,
    isHost: client.isHost,
    playerIndex: room.players.findIndex(p => p.socketId === client.id),
    oldSocketId: client.id,
    name: client.name,
    color: client.color,
}
```

**Severity:** Low — game works correctly without this (rejoin uses oldSocketId for remap, not isHost). Required by SYS-05 to pass verification.

---

### Gap 4: Wager Guard Missing for 3-4 Player Rooms (SYS-08)

**Location:** `server/socket-io/main.js` — createRoom handler around line 1293-1308

**Current code:**
```javascript
const maxPlayers = Number.isInteger(player.maxPlayers) && [2, 3, 4].includes(player.maxPlayers)
    ? player.maxPlayers : 2;
```

There is **no guard** preventing a 3-4 player room from being created with a wager. The `wagerAmount` and `maxPlayers` are validated independently but never cross-checked. A client can send `{ wager: 0.1, maxPlayers: 3 }` and the server will create a wagered 3-player room, which will never be able to settle correctly (escrow only supports 2-player until Phase 19).

**Fix:** Add a guard after the `maxPlayers` derivation:
```javascript
// SYS-08: Wager modes with 3-4 players are practice-only until N-player escrow (Phase 19)
if (wagerAmount > 0 && maxPlayers > 2) {
    client.emit('createRoomError', { reason: 'Wager modes only support 2-player until N-player escrow is available. Use Practice mode for 3-4 player matches.' })
    return
}
```

**joinRoom** also needs checking: if a room has `wager > 0` and `maxPlayers > 2`, reject. However, since `createRoom` guards prevent this from happening, this is defense-in-depth only.

**Severity:** High — without this, a wagered 3-4 player room can be created and would corrupt settlement logic at match end.

---

### Gap 5: `cleanupRoom` HP-Based Settlement Uses Only First Two Players

**Location:** `server/socket-io/main.js` lines 707-753

**Current code:**
```javascript
const opponentId = room.players
    ? (room.players.find(p => p.socketId !== client.id)?.socketId || null)
    : null
const disconnectorWallet = ws.wallets[client.id]
const opponentWallet = opponentId ? ws.wallets[opponentId] : null
```

And the HP comparison (lines 725-753) uses only `disconnectorId` vs `opponentSid` (one-on-one). This is fine for 2-player wagered matches. Per the prior decision, wagered 3-4 player matches are blocked (Gap 4 above). Once Gap 4's guard is in place, `cleanupRoom`'s 2-player settlement logic is correct for all valid wagered matches. **No change needed in `cleanupRoom` if Gap 4 is implemented.**

**Severity:** None after Gap 4 is implemented.

---

## Architecture Patterns (Established in Phase 16)

Phase 17 must follow the patterns Phase 16 established. Any deviations from these patterns will cause inconsistency.

### Pattern 1: N-Player All-Done Check

```javascript
// Standard pattern for "all N players did X" check
const allDone = room.players.length === room.maxPlayers &&
    room.players.every(p => someCondition[p.socketId])
```

Used in: `shopDone` (line 1741), `ready` (line 1595).

### Pattern 2: Player Slot Lookup

```javascript
// Use getPlayerSlot for all per-player slot mutations
const playerSlot = getPlayerSlot(room, client.id)
if (playerSlot) playerSlot.someField = value
```

Used in: `ready`, `shopDone`, `playAgainRequest`, `positionUpdate`, `stepLeft`, `stepRight`.

### Pattern 3: N-Player Loop from playerIds

```javascript
const playerIds = room.players.map(p => p.socketId)
for (const pid of playerIds) {
    // per-player init or computation
}
```

Used in: `endShopPhase` (line 310), `ready` handler (lines 1609-1618), `shopPhase` emit (lines 1629-1633).

### Pattern 4: Dual-Payload for Events

```javascript
io.sockets.in(roomId).emit('someEvent', {
    // N-player canonical
    players: room.players.map(p => ({ socketId: p.socketId, ... })),
    // 2-player backward-compat shim
    host: room.players[0]?.someField || null,
    player: room.players[1]?.someField || null,
})
```

Used in: `terrainGenerated`, `turnResult`, `rejoinSuccess`, `shopEnd`, `startPick`.

### Pattern 5: Notify All Other Players

```javascript
// Broadcast to all except sender
room.players
    .filter(p => p.socketId !== client.id)
    .forEach(p => io.to(p.socketId).emit('someEvent', payload))
```

Used in: `opponentDisconnected` (line 856-861), `opponentReconnected` (line 1007-1010).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N-player turn order | Custom turn tracking | `getNextTurn(ms)` from match.js | Already handles random first turn, alive[] skip, currentPlayerIndex |
| Round end detection | Count alive players manually | `isRoundOver(ms)` from match.js | Handles edge cases (alive map vs HP fallback) |
| Match over detection | Compare scores manually | `isMatchOver(ms)` from match.js | Uses placementPoints + damageDealtTotal tiebreaker |
| Placement ranking | Sort by HP manually | `getRoundPlacement(ms)` from match.js | Returns ranked[] array with correct N-player logic |
| Gold for all players | Loop manually | `initGold(playerIds[])` from gold.js | Already accepts any-length array |
| Placement rewards | Manual gold assignment | `awardPlacementGold(goldState, ranked[])` from gold.js | [300, 150, 75, 0] by rank |

---

## Common Pitfalls

### Pitfall 1: Re-Migrating Already-Done Work

**What goes wrong:** Phase 17 planner treats Phase 16 summaries as aspirational rather than completed. Plans include tasks that redo work already done (e.g., "migrate shopDone to N-player" when it's already done).
**Why it happens:** Phase 16 plans described what to do; summaries confirmed what was done. Research must read SUMMARIES (completed evidence), not just PLANS (intent).
**How to avoid:** For each system, grep main.js first to confirm current state before planning changes.
**Warning signs:** A plan task says "migrate X" when grep shows X already uses `room.players[]`.

### Pitfall 2: The `opponentId` Closure Capture in disconnect Timer

**What goes wrong:** The `opponentId = room.players.find(...)` at line 853 is captured at disconnect time. When the 30s timer fires, the room may have changed (e.g., another player reconnected with a new socketId). Using the captured `opponentId` to notify inside the timer callback may target a stale socket.
**How to avoid:** Inside the timer callback, re-read `currentRoom.players` (already done at line 871) and filter live players from there.

### Pitfall 3: Forgetting `room.wager` vs `wagerStates[roomId].amount`

**What goes wrong:** Two sources of truth for wager amount. `room.wager` is set at createRoom (line 1322) and persisted to DB. `wagerStates[roomId].amount` is the in-memory authority used by settlement.
**How to avoid:** Use `wagerStates[roomId]?.amount` for settlement checks, `room.wager` only for display/lobby listing. Never cross-reference them for settlement.

### Pitfall 4: `maxPlayers > 2` Guard Must Run Before `wagerAmount > 0` Balance Check

**What goes wrong:** Balance check (lines 1272-1286) is async (RPC call). If the wager+maxPlayers guard runs AFTER the balance check, a valid but incorrect wagered 3-player room can be created before the guard fires.
**How to avoid:** Place the `wagerAmount > 0 && maxPlayers > 2` guard BEFORE the async balance check, immediately after `maxPlayers` is derived.

### Pitfall 5: `shopReady` Keyed by socketId — Must Re-Init on Reconnect

**What goes wrong:** If a player reconnects during the shop phase, their old socketId entry in `shopReady[roomId]` is orphaned. The new socketId has no entry and `shopReady[newId]` is undefined (falsy). If this player then calls `shopDone`, `ready[client.id] = true` works correctly (adds new key), but the all-done check (`room.players.every(p => ready[p.socketId])`) will correctly use the new socketId too — so this is actually fine because rejoinRoom already remaps the player's socketId in `room.players[]`.
**Why it's OK:** The rejoin handler at lines 966-1003 remaps `room.players[i].socketId` from old to new. After remap, `room.players.every(p => ready[p.socketId])` uses new socketId but `shopReady` still has old socketId as key. This IS a bug in the reconnect path.
**How to avoid:** In `rejoinRoom`, also remap `shopReady[roomId]` key from old to new socketId (same pattern as goldStates, weaponInventories remapping at lines 979-988).

---

## Code Examples

### Verified Pattern: N-Player Log (replacing binary hostId/pid log)

```javascript
// Source: Pattern from lines 1629-1633 in main.js (already correct N-player pattern)
const goldSummary = playerIds.map((id, i) => `P${i+1}=${getBalance(goldStates[client.roomId], id)}`).join(', ')
console.log(`[BetweenRound] Round ${ms.currentRound} ended. Gold: ${goldSummary}`)
```

### Verified Pattern: reconnectExpired to All Remaining Players

```javascript
// Source: Pattern from lines 1007-1010 in main.js (opponentReconnected emit)
if (currentRoom) {
    currentRoom.players
        .filter(p => p.socketId !== client.id)
        .forEach(p => io.to(p.socketId).emit('reconnectExpired', {}))
}
```

### Verified Pattern: Wager+MaxPlayers Guard

```javascript
// Insert BEFORE async balance check (~line 1272) in createRoom handler
// SYS-08: 3-4 player wager rooms blocked until N-player escrow (Phase 19)
if (wagerAmount > 0 && maxPlayers > 2) {
    client.emit('createRoomError', {
        reason: 'Wager modes require 2 players. Use Practice mode for 3-4 player matches.'
    })
    return
}
```

### Verified Pattern: playerIndex in pendingReconnects

```javascript
// Source: matches rejoinRoom remap pattern at line 967-970
pendingReconnects[walletAddress] = {
    roomId,
    isHost: client.isHost,
    playerIndex: room.players.findIndex(p => p.socketId === client.id),
    oldSocketId: client.id,
    name: client.name,
    color: client.color,
}
```

### Verified Pattern: shopReady Remap on Reconnect

```javascript
// Insert in rejoinRoom handler (line 984-988 block, after weaponInventories remap)
// Remap shopReady entry
const sr = shopReady[roomId]
if (sr && sr[oldSocketId] !== undefined) {
    sr[client.id] = sr[oldSocketId]
    delete sr[oldSocketId]
}
```

---

## Plan Structure (What Phase 17 Plans Should Contain)

Based on the roadmap's plan breakdown:

### Plan 17-01: N-Player Shop System

**Scope:** Fix the between-round log (Gap 1). Verify `endShopPhase`, `shopDone`, and `ready` are already correct (they are). The main work is confirming these are done and fixing the one remaining log.

**Files:** `server/socket-io/main.js`

**Key lines to touch:** 1604-1606 (debug log only)

**Verification:** `node -c server/socket-io/main.js`; grep for `hostId.*playerIds\[0\]` should return 0 matches in the ready handler's between-round block.

### Plan 17-02: N-Player Reconnect, Disconnect, Turn Timer, PlayAgain, Wager Guard

**Scope:** Five targeted fixes:
1. `reconnectExpired` — notify all remaining players (Gap 2) — lines 874-876
2. `playerIndex` in `pendingReconnects` (Gap 3) — lines 844-850
3. Wager+maxPlayers guard (Gap 4) — after line 1308, before line 1272 (re-ordered)
4. `shopReady` remap in `rejoinRoom` (Pitfall 5) — after line 988
5. Verify `playAgainRequest` requires all survivors (already done — lines 2840)

**Files:** `server/socket-io/main.js`

**Key lines to touch:** 844-850, 874-876, ~1308-1315 (add guard), 984-988 (add shopReady remap)

---

## State of the Art

| Old Approach | Current Approach | Changed In | Impact |
|--------------|------------------|------------|--------|
| `room.host`/`room.player` binary | `room.players[]` array | Phase 16-01 | N-player room schema |
| `generateTankPositions({host,player})` | `generateTankPositions(N)` → `[{x,y},...]` | Phase 16-02 | N-player spawn |
| Fire handler: 2 tanks hardcoded | `room.players.filter(ms.alive)` | Phase 16-03 | N-player battle |
| `shopDone`: `hostId && playerId && ready[hostId] && ready[playerId]` | `room.players.every(p => ready[p.socketId])` | Phase 16-01 | N-player shop done |
| `playAgainRequest`: `room.host.playAgain && room.player.playAgain` | `room.players.every(p => p.playAgain)` | Phase 16-01 | N-player rematch |
| `opponentDisconnected`: single emit | `room.players.filter().forEach()` | Phase 16-03 | N-player disconnect notify |
| `rejoinRoom`: `if(isHost) room.host.socketId = ...` | `room.players.find(oldSocketId)` | Phase 16-03 | N-player reconnect |

---

## Open Questions

1. **playAgainRequest survivor-only check (SYS-10)**
   - What we know: `room.players.every(p => p.playAgain)` at line 2840 checks ALL players including eliminated ones.
   - What's unclear: Should eliminated players be excluded from the rematch vote? The requirement says "all surviving players." An eliminated player's `playAgain` field defaults to `false` and they can still send `playAgainRequest`.
   - Recommendation: Clarify in plan whether "all players" or "all surviving players" is the intended check. If survivors-only: `room.players.filter(p => ms.alive[p.socketId] || !ms.alive).every(p => p.playAgain)`. But since matchEnd has already been emitted, ms.alive may be stale.
   - **Likely answer:** Keep `room.players.every(p => p.playAgain)` — all N players must agree, including eliminated ones. This is the current behavior and matches the success criteria language "all surviving players agree" (in a rematch, "surviving" means players still in the room, not HP-alive).

2. **`cleanupRoom` with 3+ player room and wager (post-gap-4)**
   - What we know: Once Gap 4 blocks wagered 3-4 player rooms, `cleanupRoom`'s 2-player settlement logic is correct for all valid wagered matches.
   - What's unclear: Is there any edge case where a room starts as 2-player wagered and somehow gets a 3rd player? No — `joinRoom` blocks at `maxPlayers`. So no issue.

---

## Sources

### Primary (HIGH confidence)
- `server/socket-io/main.js` — direct inspection, lines 1-2854
- `server/services/gold.js` — direct inspection, complete file
- `server/services/match.js` — direct inspection, lines 1-136
- `.planning/phases/16-room-schema-battle-engine/16-01-SUMMARY.md` — completed work evidence
- `.planning/phases/16-room-schema-battle-engine/16-02-SUMMARY.md` — completed work evidence
- `.planning/phases/16-room-schema-battle-engine/16-03-SUMMARY.md` — completed work evidence

### Secondary (MEDIUM confidence)
- `.planning/phases/16-room-schema-battle-engine/16-01-PLAN.md` — what was intended (cross-verified with summary)
- `.planning/phases/16-room-schema-battle-engine/16-03-PLAN.md` — what was intended (cross-verified with summary)

---

## Metadata

**Confidence breakdown:**
- What Phase 16 completed: HIGH — summaries explicitly list each change and its commit
- Gap identification: HIGH — verified by grep against actual main.js line content
- Fix patterns: HIGH — patterns copied directly from existing correct code in main.js
- Open questions: MEDIUM — logic interpretation, not code ambiguity

**Research date:** 2026-02-26
**Valid until:** Stable (no external dependencies — pure refactor of internal server code)
**Next step:** Planner can create 17-01-PLAN.md and 17-02-PLAN.md immediately
