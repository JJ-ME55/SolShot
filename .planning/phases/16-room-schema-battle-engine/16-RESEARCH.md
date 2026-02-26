# Phase 16: Room Schema and Battle Engine — Research

**Researched:** 2026-02-26
**Domain:** Node.js/ES-module server — room data model migration, N-player battle loop, homing physics
**Confidence:** HIGH (all findings from direct source-code inspection of the live codebase)

---

## Summary

Phase 16 is a concentrated server migration with no external library requirements. The work splits into three clusters: (1) replace the binary `room.host`/`room.player` schema with a `room.players[]` array and add `room.maxPlayers`, (2) rewrite `generateTankPositions()` in `physics.js` to position N tanks across N terrain zones, and (3) update the fire handler in `main.js` to build tanks from `room.players[]`, mark `ms.alive[id] = false` on kill, emit `playerEliminated`, handle simultaneous kills, fix the turn-timeout forfeit path for N-player, and upgrade the `turnResult` payload.

Every "binary" assumption (`room.host`, `room.player`, `isHost` boolean, `hostId`/`playerId` local vars) appears in at least ten places in `main.js` (2746 lines). The schema migration therefore touches every handler that reads room player slots: `joinRoom`, `createRoom`, `joinQueue`, `ready`, `requestTerrain`, `positionUpdate`, `stepLeft`, `stepRight`, `giveTurn`, `startTurnTimer`, reconnect handler, disconnect handler, `playAgain`, `getOpenRooms`, `persistRoom`, and `removeRoom`. Plan 16-01 must enumerate all of them.

The homing weapon issue is the smallest change but hardest to overlook: `processHomingShot()` in `physics.js` currently picks the **first non-shooter tank** in iteration order. In 4-player this may not be the nearest enemy. The fix is a distance-sort before the break. This is a one-function, four-line change.

**Primary recommendation:** Execute the migration in three atomic plans that gate on each other — (16-01) room schema + join guard, (16-02) N-player terrain/spawn + requestTerrain block, (16-03) fire handler elimination loop. This mirrors the dependency chain described in the phase brief: the fire handler cannot be correct until room.players[] exists, and terrain/spawn cannot be correct until room knows maxPlayers.

---

## Standard Stack

No new external libraries needed. This is pure refactoring of existing server logic.

| File | Lines | Role |
|------|-------|------|
| `server/socket-io/main.js` | 2746 | All socket handlers — primary target |
| `server/services/physics.js` | ~1400 | `generateTankPositions`, `processHomingShot` — two function rewrites |
| `server/services/match.js` | 331 | Already N-player — no changes needed |
| `server/services/gold.js` | 134 | Already N-player — no changes needed |

---

## Architecture Patterns

### Current Room Schema (binary)

```javascript
// Current — must be replaced
roomData = {
    roomId: string,
    host: { name, color, socketId, isReady, playAgain, pos },
    player: { name, color, socketId, isReady, playAgain, pos } | undefined,
    active: boolean,    // true = locked (second player joined)
    wager: number,
    matchMode: string,
    totalRounds: number,
    heightmap: number[],
    terrainSeed: string,
    wind: number,
    _terrainCache: object,
    escrowPDA: string,
    _matchId: string,   // DB object ID
}
```

### Target Room Schema (N-player)

```javascript
// Phase 16 target
roomData = {
    roomId: string,
    players: [          // ordered array, replaces host + player
        { name, color, socketId, isReady, playAgain, pos, isHost: true },
        { name, color, socketId, isReady, playAgain, pos, isHost: false },
        // ... up to maxPlayers
    ],
    maxPlayers: 2 | 3 | 4,    // set at createRoom
    joinedCount: number,       // players.length (convenience alias or computed)
    active: boolean,           // true when players.length === maxPlayers
    wager: number,
    matchMode: string,
    totalRounds: number,
    // ... rest unchanged
}
```

**Key constraint from verification report:** The `requestTerrain` compat block (main.js ~line 2496) currently reads `room.host`/`room.player` to populate `ms.players[]`. Phase 16 replaces that block with one that reads `room.players[]`.

### Join Guard: `room.active` Flag

Currently `joinRoom` sets `room.active = true` immediately (E12 race guard) and then checks `if (!room || room.active === true) return`. This is binary: once active, no one can join.

For N-player: `room.active` must be set to `true` only when `room.players.length === room.maxPlayers`. Until then, `room.active` stays `false` so the lobby UI shows the room as joinable. The join handler must check `room.players.length >= room.maxPlayers` instead of `room.active === true`.

**The race guard pattern still works:** set `room.players.length` to `maxPlayers` atomically before any async balance check (i.e., push a placeholder or increment a count), then roll back on failure.

### N-Player Tank Position Algorithm

Current `generateTankPositions(heightmap, width)` returns `{ host: {x,y}, player: {x,y} }` — binary.

Target: `generateTankPositions(heightmap, N, width)` returns `Array<{x, y}>` of length N.

**Zone distribution pattern (BATTLE-10):** Divide the terrain into N equal zones. Each player spawns in their assigned zone (left 10%–90% of zone width, avoiding edges). This guarantees separation.

```javascript
export function generateTankPositions(heightmap, N = 2, width = TERRAIN_WIDTH) {
    // Divide [0.1*width, 0.9*width] into N equal zones
    // Player i spawns in zone i's center third
    const usableStart = Math.floor(width * 0.1);
    const usableWidth = Math.floor(width * 0.8);
    const zoneWidth = Math.floor(usableWidth / N);

    const positions = [];
    for (let i = 0; i < N; i++) {
        const zoneStart = usableStart + i * zoneWidth;
        const innerStart = Math.floor(zoneStart + zoneWidth * 0.2);
        const innerWidth = Math.floor(zoneWidth * 0.6);
        const x = innerStart + Math.floor(crypto.randomInt(1000) / 1000 * innerWidth);
        positions.push({ x, y: heightmap[x] - 15 });
    }
    return positions; // [p0pos, p1pos, ..., p(N-1)pos]
}
```

**Backward compat note:** The current function's return shape is `{host, player}`. All callers in main.js read `tankPositions.host` and `tankPositions.player`. After migration to `room.players[]`, callers read `room.players[i].pos`. The old shape can be dropped when the callers are updated. Since both changes (physics.js + main.js) happen in Plan 16-02, they are atomic.

### Fire Handler: N-Player Tank Array Build

Current fire handler (main.js ~line 1995):

```javascript
const tanks = []
if (room.host && room.host.pos) {
    tanks.push({ id: room.host.socketId, x: room.host.pos.x, y: room.host.pos.y, width: 40, height: 30 })
}
if (room.player && room.player.pos) {
    tanks.push({ id: room.player.socketId, x: room.player.pos.x, y: room.player.pos.y, width: 40, height: 30 })
}
```

Target (N-player):

```javascript
const tanks = room.players
    .filter(p => p.pos && ms.alive[p.socketId])  // only alive players have physics targets
    .map(p => ({ id: p.socketId, x: p.pos.x, y: p.pos.y, width: 40, height: 30 }))
```

**Critical decision:** Should eliminated tanks still be included in `tanks[]` for physics purposes (i.e., can you still hit an eliminated player's corpse)? The spec says eliminated players don't fire but does not specify if their tank is a physics obstacle. The safest interpretation for BATTLE-01: eliminated players receive no further damage (exclude from `tanks[]`). This matches the `ms.alive` filter.

### Fire Handler: Elimination Loop

After HP update, the elimination detection block must:

1. Iterate `result.damage` in `ms.players[]` order (deterministic for simultaneous kills)
2. For each player whose HP dropped to 0, push to `ms.eliminationOrder` and set `ms.alive[id] = false`
3. For each new kill, emit `playerEliminated` event (BATTLE-02)
4. Award `awardKillBonus` to shooter for each kill (currently imported but never called)

```javascript
// After HP update loop:
const newlyEliminated = []
for (const pid of ms.players) {
    const dmg = result.damage[pid]
    if (!dmg) continue
    const hpBefore = ms.hp[pid] + Math.abs(dmg)  // reconstruct from post-update
    // Better: track hpBefore inline in the HP update loop
    if (ms.hp[pid] <= 0 && ms.alive[pid]) {
        ms.alive[pid] = false
        ms.eliminationOrder.push(pid)
        newlyEliminated.push(pid)
    }
}

for (const pid of newlyEliminated) {
    const gold = goldStates[this.roomId]
    if (gold) awardKillBonus(gold, this.id)  // already imported, never called
    io.sockets.in(this.roomId).emit('playerEliminated', {
        eliminatedId: pid,
        killedById: this.id,
        survivingPlayers: ms.players.filter(id => ms.alive[id]),
    })
}
```

**Simultaneous kill ordering:** `ms.players[]` array order is deterministic and stable. Two players dying on the same shot get pushed to `eliminationOrder` in `ms.players[]` index order. The later-indexed player is treated as having survived marginally longer (used by `getRoundPlacement` for ranking). This is a defined convention documented in Phase 15 research.

### `turnResult` Payload: N-Player

Current payload (main.js ~line 2132) uses binary `tankPositions: { host, player, hostId }`. This must become:

```javascript
io.sockets.in(this.roomId).emit('turnResult', {
    playerId: this.id,
    weaponId,
    trajectory: result.trajectory,
    impact: result.impact,
    damage: result.damage,
    terrainUpdate: result.newTerrain,
    scores: ms ? ms.scores : {},
    hp: ms ? ms.hp : {},
    alive: ms ? ms.alive : {},          // NEW: N-player alive state
    nextTurn: ms ? ms.currentTurn : null,
    currentPlayerIndex: ms ? ms.currentPlayerIndex : 0,  // NEW: BATTLE-06
    seq: ms ? ms.turnSequence : 0,
    goldEarned,
    goldBalance: goldStates[this.roomId] || {},
    players: ms ? ms.players.map((id, i) => ({   // NEW: BATTLE-06
        socketId: id,
        pos: room.players[i]?.pos || null,
        hp: ms.hp[id] || 0,
        alive: ms.alive[id] || false,
    })) : [],
    scatterPoints: result.scatterPoints || null,
    subTrajectories: result.subTrajectories || null,
    spiderLegs: result.spiderLegs || null,
    tunnelEntry: result.tunnelEntry || null,
    tunnelExit: result.tunnelExit || null
})
```

**2-player backward compat:** A 2-player client currently reads `turnResult.tankPositions.host` and `turnResult.tankPositions.player`. The new `players[]` array contains both positions. The old `tankPositions` key can be included as a shim for the current client:

```javascript
// Backward-compat shim — remove when client is updated for 4-player:
tankPositions: {
    host: room.players[0]?.pos || null,
    player: room.players[1]?.pos || null,
    hostId: room.players[0]?.socketId || null,
},
```

### Turn Timeout: N-Player Forfeit

Current timeout handler (main.js ~line 344):

```javascript
if (ms.consecutiveTimeouts[currentTurnId] >= 3) {
    // Ends match — gives win to opponent (binary: only 1 opponent)
    const opponentId = currentTurnId === hostId ? playerId : hostId
    io.sockets.in(roomId).emit('matchEnd', { winner: opponentId, ... })
    // then full teardown
}
```

For BATTLE-07/BATTLE-08 requirement: in N-player, 3 consecutive timeouts should eliminate the timed-out player, not end the match. The match continues with remaining players.

```javascript
if (ms.consecutiveTimeouts[currentTurnId] >= 3) {
    // N-player: eliminate timed-out player, continue if others remain
    if (ms.players.filter(id => ms.alive[id]).length > 2) {
        // More than 2 alive — eliminate timed-out player, continue
        ms.alive[currentTurnId] = false
        ms.eliminationOrder.push(currentTurnId)
        io.sockets.in(roomId).emit('playerEliminated', {
            eliminatedId: currentTurnId,
            reason: 'timeout',
            survivingPlayers: ms.players.filter(id => ms.alive[id]),
        })
        ms.consecutiveTimeouts[currentTurnId] = 0
        ms.currentTurn = getNextTurn(ms)
        startTurnTimer(io, roomId)
    } else {
        // 2-player (or last 2 alive): existing forfeit-ends-match behavior
        const opponentId = ms.players.find(id => id !== currentTurnId && ms.alive[id])
        // ... existing match-end + settle + teardown
    }
}
```

**N-player special case for timeout round-end:** After eliminating the timed-out player via timeout, check `isRoundOver(ms)`. If only 1 player remains, trigger round/match end normally through the existing path.

### Homing Weapon: Nearest Enemy Fix (BATTLE-05)

Current `processHomingShot()` in `physics.js` (~line 1057):

```javascript
let target = null;
for (const tank of tanks) {
    if (tank.id !== shooterId) {
        target = tank;
        break;  // BUG: takes first non-shooter, not nearest
    }
}
```

Fix: find the nearest non-shooter tank by Euclidean distance from shot origin:

```javascript
export function processHomingShot(weapon, trajectory, terrain, tanks, shooterId) {
    const startPoint = trajectory[0];
    let target = null;
    let minDist = Infinity;
    for (const tank of tanks) {
        if (tank.id === shooterId) continue;
        const d = Math.hypot(tank.x - startPoint.x, tank.y - startPoint.y);
        if (d < minDist) { minDist = d; target = tank; }
    }
    if (!target) return processSingleShot(weapon, trajectory, terrain, tanks, shooterId);
    // ... rest of homing logic unchanged
}
```

This change is in `physics.js` and is backward-compatible with 2-player (only one non-shooter, nearest === first).

### N-Player shopReady, initGold, weaponInventories

These are currently keyed `{ [hostId]: boolean, [playerId]: boolean }` etc. After schema migration they must be keyed by all N socket IDs. The `ready` handler that initializes them uses `room.host.socketId` / `room.player.socketId` and checks `room.host.isReady && room.player.isReady`.

Replacement pattern:

```javascript
// Was:
shopReady[client.roomId] = { [hostId]: false, [playerId]: false }

// Becomes:
shopReady[client.roomId] = Object.fromEntries(room.players.map(p => [p.socketId, false]))

// Was: both-ready check
if (room.host.isReady && room.player && room.player.isReady) { ... }

// Becomes:
if (room.players.length === room.maxPlayers && room.players.every(p => p.isReady)) { ... }
```

The `initGold` and weapon inventory initialization already accept `playerIds[]` arrays (Phase 15 done). The `ready` handler just needs to pass `room.players.map(p => p.socketId)` instead of `[hostId, playerId]`.

### getOpenRooms: Show Fill Status

Current `getOpenRooms()` shows rooms where `!room.active`. With N-player, rooms are joinable until `players.length === maxPlayers`. The lobby should show "2/4" style fill counts:

```javascript
// Was:
if (!room.active) {
    result.push({
        roomId: room.roomId,
        host: room.host ? { name: room.host.name, color: room.host.color } : null,
        wager: room.wager || 0,
        matchMode: room.matchMode || null,
        totalRounds: room.totalRounds || 1,
    });
}

// Becomes:
if (room.players.length < room.maxPlayers) {
    result.push({
        roomId: room.roomId,
        host: room.players[0] ? { name: room.players[0].name, color: room.players[0].color } : null,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        wager: room.wager || 0,
        matchMode: room.matchMode || null,
        totalRounds: room.totalRounds || 1,
    });
}
```

### Reconnect Handler: players[] Remap

Phase 15 research identified this gap. The reconnect handler at main.js ~line 880 remaps `room.host.socketId` and `room.player.socketId`. After migration:

```javascript
// After migration — remap by finding old socketId in room.players[]
const playerSlot = room.players.find(p => p.socketId === oldSocketId)
if (playerSlot) {
    // Remap wager wallet, gold, weapons, ms maps
    playerSlot.socketId = client.id
}
```

The `ms.players[]` array must also be remapped:

```javascript
const pIdx = ms.players.indexOf(oldSocketId)
if (pIdx !== -1) ms.players[pIdx] = client.id
if (ms.alive && ms.alive[oldSocketId] !== undefined) {
    ms.alive[client.id] = ms.alive[oldSocketId]
    delete ms.alive[oldSocketId]
}
```

### isHost Flag: Keep or Remove

Currently `client.isHost` is a boolean on the socket object, set in `createRoom` and `joinRoom`. With N-player, "host" may be a fuzzy concept (who created the room). The simplest approach: keep `client.isHost = true` for the room creator, `false` for all others. This preserves the room-deletion auth guard (`if (!client.isHost) return`) and the escrow/wager flows which use `room.host` (creator).

After schema migration, `room.host` as a concept is replaced by `room.players[0]` (the creator). The per-socket `client.isHost` flag can remain for the deletion guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N-zone spawn distribution | Custom algo | Divide `[0.1W, 0.9W]` into N equal zones, random within center 60% of zone | Already proven pattern for 2-player (left 20–35%, right 65–80%); generalize it |
| Nearest-target search | Fancy spatial index | Linear O(N) distance comparison | N ≤ 4, O(N) is fine |
| Simultaneous-kill ordering | Hash-based | `ms.players[]` iteration order | Already stable and deterministic |
| Reconnect state remap | New remap function | Extend existing remap block | Existing block is well-understood |

---

## Common Pitfalls

### Pitfall 1: `room.active` Race Guard — N-Player Version

**What goes wrong:** Current `joinRoom` sets `room.active = true` immediately as a race guard (E12). If changed naively to only set active when full, two concurrent joins could both see `players.length < maxPlayers`, both push, and over-fill the room.

**How to avoid:** Use an atomic counter: increment `room.joinedCount` (or use `room.players.length` with a push-before-async-check pattern). The simplest atomic approach: push the player's socket ID as a placeholder before the async balance check, then remove if check fails. Since Node.js is single-threaded, push + check is atomic within the event loop tick.

**Warning sign:** More than `maxPlayers` entries in `room.players[]`.

### Pitfall 2: `startPick` Payload — Host/Player Fields

**What goes wrong:** The `startPick` event sent when both players join currently sends `{ host: room.host, player: room.player }`. Client LobbyScreen reads these fields. After migration, the payload must include `players[]` for N-player but also keep `host`/`player` for the current 2-player client.

**How to avoid:** Include backward-compat shim in the `startPick` emit:
```javascript
io.sockets.in(roomId).emit('startPick', {
    host: room.players[0],      // shim
    player: room.players[1],    // shim (undefined for 3-4 player, but 2-player is only mode currently)
    players: room.players,      // canonical N-player field
    wager: roomWager
})
```

### Pitfall 3: `shopEnd` and `shopPhase` — Keyed by hostId/playerId

**What goes wrong:** `shopPhase` and `shopEnd` payloads use `{ [hostId]: ..., [playerId]: ... }` for gold/inventory. For N-player these must be `{ [socketId]: ... }` for all N players.

**How to avoid:** Replace binary key construction with `Object.fromEntries(room.players.map(p => [p.socketId, ...]))`.

### Pitfall 4: `turnResult.tankPositions` — Client Reads Binary Shape

**What goes wrong:** The current 2-player client reads `turnResult.tankPositions.host` and `turnResult.tankPositions.player`. If the key is removed without a shim, the client breaks immediately.

**How to avoid:** Keep `tankPositions: { host: room.players[0]?.pos, player: room.players[1]?.pos, hostId: room.players[0]?.socketId }` as a shim alongside the new `players[]` array. Remove shim in Phase 19 when client is updated.

### Pitfall 5: Reconnect Sends `rejoinSuccess` with Binary Positions

**What goes wrong:** `rejoinSuccess` at main.js ~line 941 sends `tankPositions: { host: room.host.pos, player: room.player.pos }`. After migration, this must read from `room.players[]`.

**How to avoid:** Replace with `tankPositions: { players: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })) }` plus shim.

### Pitfall 6: `consecutiveTimeouts` Uses `hostId`/`opponentId` for Forfeit Path

**What goes wrong:** The 3-timeout forfeit path derives `opponentId = currentTurnId === hostId ? playerId : hostId`. In N-player this picks the wrong "opponent."

**How to avoid:** Replace with `ms.players.find(id => id !== currentTurnId && ms.alive[id])` which works for both 2-player and N-player.

### Pitfall 7: `ms.alive` is Empty Until requestTerrain Populates It

**What goes wrong:** The `alive` map is set in `requestTerrain` compat block (currently reads `room.host`/`room.player`). The fire handler's new elimination check (`if ms.alive[pid]`) reads from `alive`. If `alive` is empty (match not yet started), the check fails silently.

**How to avoid:** After Phase 16 Plan 16-02 replaces the compat block with `room.players[]`, `alive` will be populated for all N players before the first fire. Verify this with an assertion.

### Pitfall 8: `persistRoom()` Uses `room.host`/`room.player` Directly

**What goes wrong:** `persistRoom()` at main.js ~line 215 explicitly constructs DB update from `room.host` and `room.player`. After migration this fails silently (no error, just wrong DB data).

**How to avoid:** Update `persistRoom()` to write from `room.players[]` to the DB structure.

### Pitfall 9: `positionUpdate` and `stepLeft`/`stepRight` Use Binary Room Fields

**What goes wrong:** All movement handlers read `const isHost = room.host && room.host.socketId === client.id` and `const pos = isHost ? room.host.pos : room.player.pos`. After migration: `const playerSlot = room.players.find(p => p.socketId === client.id)`.

**How to avoid:** Define a helper: `function getPlayerSlot(room, socketId) { return room.players.find(p => p.socketId === socketId) }` and call it in all handlers.

---

## Code Examples

### getPlayerSlot Helper (NEW — use everywhere)

```javascript
// Source: derived from existing room access patterns throughout main.js
function getPlayerSlot(room, socketId) {
    return (room.players || []).find(p => p.socketId === socketId) || null;
}
```

### createRoom — Add maxPlayers to roomData

```javascript
// current line ~1220:
const roomData = { roomId: roomId, host: host, active: false }
// becomes:
const maxPlayers = Number.isInteger(player.maxPlayers) && [2,3,4].includes(player.maxPlayers)
    ? player.maxPlayers : 2;
const creatorSlot = { name: sanitizeName(player.name), color: player.color, socketId: client.id, isReady: false, playAgain: false, pos: null, isHost: true };
const roomData = {
    roomId,
    players: [creatorSlot],
    maxPlayers,
    active: false,
    wager: wagerAmount,
    matchMode,
    totalRounds: rounds,
};
```

### joinRoom — N-Player Guard

```javascript
// current:
if (!room || room.active === true) return
room.active = true  // E12 race guard

// becomes:
if (!room || room.players.length >= room.maxPlayers) return
// No need to set active here — active=true is set when players.length === maxPlayers
const joinerSlot = { name: sanitizeName(name), color, socketId: client.id, isReady: false, playAgain: false, pos: null, isHost: false };
room.players.push(joinerSlot);  // Atomic in Node.js event loop
if (room.players.length === room.maxPlayers) room.active = true;
```

### requestTerrain — Replace Compat Block

```javascript
// Replace the compat block at ~line 2496:
// OLD:
if (ms.players.length === 0) {
    const pIds = [];
    if (room.host) pIds.push(room.host.socketId);
    if (room.player) pIds.push(room.player.socketId);
    ms.players = pIds;
    // ...
}
// NEW (Phase 16):
if (ms.players.length === 0) {
    const pIds = room.players.map(p => p.socketId);
    ms.players = pIds;
    ms.alive = {};
    ms.turnsPerRound = pIds.length * 10;
    for (const id of pIds) {
        ms.alive[id] = true;
        ms.hp[id] = 250;
        ms.scores[id] = ms.scores[id] || 0;
        ms.kills[id] = ms.kills[id] || 0;
        ms.roundWins[id] = ms.roundWins[id] || 0;
        ms.placementPoints[id] = ms.placementPoints[id] || 0;
        ms.damageDealtTotal[id] = ms.damageDealtTotal[id] || 0;
    }
}
// Also pass maxPlayers to createMatchState when creating room:
matchStates[roomId] = createMatchState(roomId, roundType, maxPlayers);
```

### generateTankPositions — N-Player

```javascript
// Source: derived from current 2-player pattern (left 20-35%, right 65-80%)
export function generateTankPositions(heightmap, N = 2, width = TERRAIN_WIDTH) {
    if (N === 2) {
        // Preserve original 2-player behavior exactly for backward compat
        const hostX = Math.floor(width * 0.2 + (crypto.randomInt(1000) / 1000) * width * 0.15);
        const playerX = Math.floor(width * 0.65 + (crypto.randomInt(1000) / 1000) * width * 0.15);
        return [
            { x: hostX, y: heightmap[hostX] - 15 },
            { x: playerX, y: heightmap[playerX] - 15 },
        ];
    }
    // N > 2: divide [10%, 90%] into N equal zones
    const usableStart = Math.floor(width * 0.1);
    const usableWidth = Math.floor(width * 0.8);
    const zoneWidth = Math.floor(usableWidth / N);
    const positions = [];
    for (let i = 0; i < N; i++) {
        const zoneStart = usableStart + i * zoneWidth;
        const innerStart = Math.floor(zoneStart + zoneWidth * 0.2);
        const innerWidth = Math.floor(zoneWidth * 0.6);
        const x = Math.min(width - 1, innerStart + Math.floor(crypto.randomInt(Math.max(1, innerWidth))));
        positions.push({ x, y: heightmap[x] - 15 });
    }
    return positions;
}
```

### matchEnd: survivorOrder[] (BATTLE-09)

Current `matchEnd` event sends `winner` (single socketId). Must add `survivorOrder[]`:

```javascript
io.sockets.in(roomId).emit('matchEnd', {
    winner: matchResult.winner,
    survivorOrder: ranked,   // [1st, 2nd, 3rd, 4th] — from last getRoundPlacement()
    forfeitReason: ...,      // if applicable
    scores: ms.scores,
    hp: ms.hp,
})
```

---

## Exact Call Site Inventory: Binary Room Fields in main.js

All locations that read `room.host` or `room.player` directly (must be updated in Plan 16-01):

| ~Line | Handler | Field | Purpose |
|-------|---------|-------|---------|
| 98–99 | `resetForPlayAgain` | `room.player.playAgain`, `room.host.playAgain` | Reset flags |
| 198–208 | `getOpenRooms` | `room.host.name/color`, `room.active` | Lobby list |
| 223–239 | `persistRoom` | `room.host.*`, `room.player.*` | DB persist |
| 297–298 | `endShopPhase` | `room.host.socketId`, `room.player.socketId` | Weapon lists |
| 336–337 | `startTurnTimer` | `room.host.socketId`, `room.player.socketId` | Forfeit target |
| 346 | `startTurnTimer` | `opponentId = currentTurnId === hostId ? playerId : hostId` | Forfeit opponent |
| 373–374 | `startTurnTimer` | `room.host`, `room.player` snapshot | Settlement |
| 623–625 | disconnect handler | `room.player.socketId`, `room.host.socketId` | Opponent lookup |
| 631–632 | disconnect handler | snapshot | Settlement |
| 672–673 | disconnect handler | `room.host?.socketId`, `room.player?.socketId` | Wallet lookup |
| 768–771 | disconnect handler | `room.player?.socketId`, `room.host?.socketId` | Notify opponent |
| 881–930 | reconnect handler | `room.host`, `room.player` | State remap |
| 934–936 | reconnect handler | `room.player?.socketId`, `room.host?.socketId` | Opponent notify |
| 959–961 | reconnect `rejoinSuccess` | `room.host.pos`, `room.player.pos` | Tank positions |
| 1060 | `joinRoom` | `room.player = {...}` | Player assignment |
| 1070 | `joinRoom` | `room.host.socketId` | Wallet lookup |
| 1085 | `joinRoom` | `room.host.socketId` | Socket lookup |
| 1113–1118 | deposit timeout | `roomCheck.host?.socketId`, `roomCheck.player?.socketId` | Deposit check |
| 1140 | `joinRoom` emit | `room.host`, `room.player` | startPick payload |
| 1218 | `createRoom` | `host = {...}` | Host object |
| 1220 | `createRoom` | `roomData.host = host` | Room creation |
| 1336–1337 | `joinQueue` | `hostEntry`, `playerEntry` | Queue match |
| 1447 | `joinQueue` emit | `host: hostEntry`, `player: playerEntry` | startPick |
| 1489–1493 | `ready` | `room.host.isReady`, `room.player.isReady` | Ready state |
| 1497–1499 | `ready` | `room.host.isReady && room.player.isReady` | Both-ready check |
| 1498–1499 | `ready` | `room.host.socketId`, `room.player.socketId` | Gold/shop init |
| 1510 | `ready` | `initGold([hostId, playerId])` | Gold init |
| 1513–1516 | `ready` | weapon inventories | Weapon init |
| 1520–1523 | `ready` | shopReady | Shop init |
| 1533–1546 | `ready` | shopPhase payload | Binary keyed |
| 1556–1557 | `ready` | `room.player.isReady = false`, `room.host.isReady = false` | Reset |
| 1970–1971 | fire handler | `room.host.socketId`, `room.player.pos` | Position lookup |
| 1996–2013 | fire handler | `room.host.pos`, `room.player.pos` | tanks[] build |
| 2040–2047 | fire handler | `room.host.pos.y`, `room.player.pos.y` | Terrain update |
| 2115 | fire handler | `hostId`, `playerId` local vars | (may remove) |
| 2146–2149 | fire `turnResult` | `room.host.pos`, `room.player.pos`, `room.host.socketId` | Payload |
| 2199–2200 | settlement block | `hostId`, `playerId` for loser lookup | Settlement |
| 2265–2266 | SHOT milestones | `hostWallet`, `playerWallet` | Wallet lookup |
| 2585–2602 | `positionUpdate` | `room.host.socketId`, `room.player.socketId` | Pos update |
| 2626–2636 | `stepLeft` | `room.host.socketId`, `room.player.pos` | Movement |
| 2661–2671 | `stepRight` | `room.host.socketId`, `room.player.pos` | Movement |
| 2723–2733 | `playAgainRequest` | `room.host.playAgain`, `room.player.playAgain` | Both-agreed check |

This is approximately 50 distinct read/write sites. Plans 16-01 through 16-03 must divide this list.

---

## State Machine: No Changes Needed

`MATCH_STATES`, `TRANSITIONS`, `transitionState`, `validateAction` are already N-player-agnostic. No changes to `server/services/match.js` in Phase 16.

---

## Gold Service: No Changes Needed

`gold.js` is already N-player. `awardKillBonus` is already imported in main.js but never called. Phase 16 must call it when `newlyEliminated.length > 0`.

---

## Plan Split Recommendation

Phase 16 has 3 plans per the ROADMAP. Based on dependency analysis:

### Plan 16-01: Room Schema Migration

**Scope:** Everything in `main.js` that reads `room.host`/`room.player` EXCEPT the fire handler tank build and position updates (deferred to 16-03). Specifically:
- Add `room.players[]` + `room.maxPlayers` to `createRoom` and `joinQueue`
- Fix `joinRoom` join guard + push to `room.players[]`
- Update `getOpenRooms` for fill-count
- Update `persistRoom` (binary DB fields)
- Add `getPlayerSlot()` helper
- Update `ready` handler (shopReady, initGold, both-ready check, shopPhase payload)
- Update `playAgainRequest` + `resetForPlayAgain`
- Update `startPick` emit
- Update deposit timeout check (host/player refs)
- Pass `maxPlayers` to `createMatchState` at all 3 call sites

**Does NOT touch:** fire handler, stepLeft/stepRight, positionUpdate, reconnect handler (complex — separate), startTurnTimer forfeit path (N-player timeout — plan 16-03)

### Plan 16-02: N-Player Terrain and Tank Spawn

**Scope:**
- Rewrite `generateTankPositions(heightmap, N, width)` in `physics.js`
- Replace `requestTerrain` compat block with `room.players[]`-based init
- Update `requestTerrain` to use new `generateTankPositions` call signature
- Update `terrainGenerated` payload (tank positions are now an array)
- Update reconnect `rejoinSuccess` payload for N tank positions

**Note:** The `terrainGenerated` event currently sends `tankPositions: { host, player }`. The client uses this to position tanks. For backward compat with the 2-player client, include both old shape and new array. The 2-player positions are `positions[0]` and `positions[1]`.

### Plan 16-03: Fire Handler and Elimination

**Scope:**
- Replace fire handler `tanks[]` build to use `room.players[]` + `ms.alive` filter
- Add elimination loop: `ms.alive[pid] = false`, push `eliminationOrder`, emit `playerEliminated`
- Call `awardKillBonus` for each kill
- Update `turnResult` payload: add `players[]`, `alive`, `currentPlayerIndex`; keep `tankPositions` shim
- Fix `startTurnTimer` forfeit path for N-player (eliminate vs end-match)
- Fix `processHomingShot` in `physics.js` (nearest enemy, not first enemy)
- Add `survivorOrder[]` to `matchEnd` payload
- Update `stepLeft`/`stepRight`/`positionUpdate`/`reconnect` binary field refs
- Update `startTurnTimer` `opponentId` derivation for N-player

---

## Open Questions

1. **maxPlayers from client payload**
   - What: createRoom currently ignores `player.maxPlayers` — there is no such field in the current client payload.
   - What's unclear: Does the client (LobbyScreen) need to send `maxPlayers` for Phase 16? Or is it always 2 for the current client?
   - Recommendation: Default to 2 in createRoom if `player.maxPlayers` is not provided. The 4-player UI is not part of Phase 16. This way the schema supports it but the UI doesn't expose it yet.

2. **playAgainRequest with N-player**
   - What: `playAgainRequest` handler checks `room.host.playAgain && room.player.playAgain`. After migration, this needs all N players.
   - What's unclear: For 4-player rematch, all 4 must agree? That may be impractical. Majority vote?
   - Recommendation: For Phase 16, require all N players to request playAgain. The current 2-player behavior is preserved (both must agree). Flag for revisit if 3/4 player is enabled in a later phase.

3. **DB schema for `players[]`**
   - What: `persistRoom()` writes to the Match MongoDB model. The current model has `host` and `player` subdocuments.
   - What's unclear: Does Phase 16 require DB schema migration for the Match model?
   - Recommendation: Keep DB write minimal for Phase 16 — write `players[0]` as `host` and `players[1]` as `player` to preserve existing DB structure. Full N-player DB migration is Phase 17+ work.

4. **wagerStates[roomId].wallets — N-player**
   - What: Currently `{ [hostSocketId]: wallet, [playerSocketId]: wallet }`. For N-player, this map naturally extends (just add more keys).
   - What's unclear: No change needed in data structure — just ensure all N join flows populate the wallets map.
   - Recommendation: No change to `wagerStates` schema. The wallet map already supports N keys.

---

## Sources

### Primary (HIGH confidence)
- `server/socket-io/main.js` — 2746 lines, all binary room field sites audited
- `server/services/physics.js` — `generateTankPositions` (lines 440–457), `processHomingShot` (lines 1052–1131) inspected
- `server/services/match.js` — 331 lines, confirmed no Phase 16 changes needed
- `server/services/gold.js` — 134 lines, confirmed no Phase 16 changes needed
- `.planning/phases/15-server-core-services/15-VERIFICATION.md` — gap analysis confirms Phase 16 responsibilities

### Secondary (MEDIUM confidence)
- Phase 15 RESEARCH.md — reconnect remap pattern for `ms.players[]` (derived logic, not yet implemented but design is correct)

---

## Metadata

**Confidence breakdown:**
- Room schema migration: HIGH — all sites identified by direct source inspection
- N-player tank position algorithm: HIGH — straightforward generalization of existing 2-player pattern
- Fire handler elimination loop: HIGH — derived from Phase 15 `alive` map design
- Homing weapon fix: HIGH — bug is clearly visible in source
- Timeout N-player fork: HIGH — behavior requirement is explicit in success criteria
- DB backward compat: MEDIUM — assumes Match model keeps host/player fields; not verified against model file

**Research date:** 2026-02-26
**Valid until:** Stable for 60 days (pure internal logic, no external library dependencies)
