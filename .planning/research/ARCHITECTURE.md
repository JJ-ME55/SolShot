# Architecture Patterns: N-Player Multiplayer Refactor

**Domain:** Refactoring binary (1v1) artillery game to last-man-standing (2–4 players)
**Researched:** 2026-02-26
**Sources:** Direct codebase reading — `server/socket-io/main.js` (~2750 lines), `server/services/match.js`, `server/services/physics.js`, `server/services/gold.js`, `client/src/scenes/main/index.js`, `client/src/bridge/GameBridge.js`

---

## Existing Architecture (Ground Truth)

This section documents the actual, verified codebase. Every claim is traceable to a line in a source file.

### Server In-Memory Stores

Five parallel dictionaries keyed by `roomId`, all defined at module scope in `main.js` (lines 25–54):

```
rooms           Map<roomId, room>         — O(1) lookup via Map
matchStates     { [roomId]: ms }          — match state machine object
goldStates      { [roomId]: { [socketId]: number } }
weaponInventories { [roomId]: { [socketId]: weaponId[] } }
shopReady       { [roomId]: { [socketId]: boolean } }
wagerStates     { [roomId]: { amount, wallets: { [socketId]: address }, deposits: {...} } }
authenticatedWallets { [socketId]: walletAddress }   — global, not per-room
```

All sub-dictionaries inside these stores already use `{ [socketId]: value }` as the key structure. This is the primary reason N-player scaling is mostly additive: none of these stores hardcode two players.

### Room Object Shape (Actual)

```js
{
  roomId: string,
  host: { name, color, socketId, isReady, playAgain, pos },   // pos added at requestTerrain
  player: { name, color, socketId, isReady, playAgain, pos }, // added at joinRoom
  active: boolean,
  heightmap: number[],        // 1200 values, server-authoritative
  terrainSeed: string,
  wind: number,
  wager: number,
  matchMode: string | null,
  totalRounds: number,
  escrowPDA: string | null,
  _matchId: ObjectId,
  _terrainCache: object | null,  // cached terrainGenerated payload
  randomArray: number[] | null   // legacy weapon array
}
```

The `host` / `player` binary split is the structural root cause of everything that must change. Every handler in `main.js` that touches `room.host` or `room.player` by name is a change site.

### Match State Object Shape (Actual, from `match.js`)

```js
{
  roomId, status, roundType, maxRounds, currentRound,
  scores: {},         // { [socketId]: totalDamage }
  kills: {},          // { [socketId]: killCount }
  roundWins: {},      // { [socketId]: roundsWon }
  hp: {},             // { [socketId]: currentHP }
  currentTurn: null,  // socketId — the only field that is not a map
  turnCount: 0,
  turnSequence: 0,    // anti-replay nonce
  turnsPerRound: 20,  // HARDCODED for 2 players (10 each)
  terrain: null, tankPositions: null, stateChangedAt,
  weaponShotsFired: {}, weaponHits: {}, weaponDamage: {},
  totalDeaths: {},
  // Added dynamically during match:
  consecutiveTimeouts: {},
  moveCounts: {},
  roundDamage: {}, maxRoundDamage: {},
  weaponsUsed: {}
}
```

All fields except `currentTurn` and `turnsPerRound` are already N-player-compatible dictionaries.

### Binary Hardpoints in `match.js`

Four functions require N-player rewrites:

**`getNextTurn(ms, hostId, playerId)`** (line 136)
- Hardcoded 2-argument signature, toggles between exactly two IDs.
- Must become: iterate `players[]`, skip dead players, wrap modularly.

**`isRoundOver(ms)`** (line 151)
- Checks `turnCount >= turnsPerRound` (hardcoded 20) OR any HP <= 0.
- Must become: `alive count <= 1` for last-man-standing.
- The turn limit must scale with N (`N * turnsPerPlayer`, e.g. 10 each).

**`isMatchOver(ms, hostId, playerId)`** (line 170)
- Binary signature, checks two players by name.
- For last-man-standing: match ends when only one player remains alive each round. The "BO3/BO5 round wins" model may not apply to N-player; needs design decision.

**`getRoundWinner(ms, hostId, playerId)`** (line 203)
- Binary: compares two players' HP and scores.
- Must become: last survivor wins, or highest HP if round ends by turn limit.

**`initGold(hostId, playerId)`** in `gold.js` (line 26)
- Binary signature, returns `{ [hostId]: 1000, [playerId]: 1000 }`.
- Must become `initGold(playerIds[])`.
- All other gold functions (`earnGold`, `spendGold`, etc.) are already keyed by `playerId` and are already N-player-compatible.

### `fire` Handler Dependencies (main.js ~line 1896)

The fire handler is the most complex function in the codebase. Its binary dependencies:

```
line 2115: const hostId = room.host.socketId
line 2116: const playerId = room.player ? room.player.socketId : null
line 2117: ms.currentTurn = playerId ? getNextTurn(ms, hostId, playerId) : null
```

These three lines call the binary `getNextTurn`. Everything else in the fire handler — HP updates, damage tracking, Gold economy, turn timer, kill tracking — already works with arbitrary `{ [socketId]: value }` maps.

Tank position building for physics (lines 1994–2013) loops over `room.host` and `room.player` explicitly:

```js
const tanks = []
if (room.host && room.host.pos) { tanks.push({ id: room.host.socketId, ... }) }
if (room.player && room.player.pos) { tanks.push({ id: room.player.socketId, ... }) }
```

This must become a loop over `room.players`. The physics engine itself (`calculateImpact`, `calculateDamage`) already accepts an arbitrary `tankPositions` array — it is already N-player-compatible.

### `requestTerrain` Handler Dependencies (main.js ~line 2455)

Tank position generation (line 2477):

```js
const tankPositions = generateTankPositions(heightmap)
// Returns: { host: { x, y }, player: { x, y } }
```

The `generateTankPositions` function in `physics.js` (line 448) hardcodes two spawn zones:
- Host: left third (x = 20–35% of terrain width)
- Player: right third (x = 65–80%)

For N players: must distribute evenly across the terrain width. For 3 players, a middle zone is needed. For 4 players, four zones. Current approach can extend to:

```js
// N-player approach (suggested):
// Divide terrain into N equally-spaced zones, each with random offset within zone.
// Zone i: x range = [i/N * width + margin, (i+1)/N * width - margin]
export function generateTankPositions(heightmap, playerCount = 2, width = TERRAIN_WIDTH) {
    const margin = 0.05 * width;
    const zoneWidth = (width - 2 * margin) / playerCount;
    const positions = [];
    for (let i = 0; i < playerCount; i++) {
        const zoneStart = margin + i * zoneWidth;
        const x = Math.floor(zoneStart + (crypto.randomInt(1000) / 1000) * zoneWidth);
        const clampedX = Math.max(0, Math.min(width - 1, x));
        positions.push({ x: clampedX, y: heightmap[clampedX] - 15 });
    }
    return positions;
}
```

### `turnResult` Socket Payload (main.js ~line 2132)

Current payload references host/player by role:

```js
io.sockets.in(this.roomId).emit('turnResult', {
    ...
    tankPositions: {
        host: room.host ? { x: room.host.pos.x, y: room.host.pos.y } : null,
        player: room.player ? { x: room.player.pos.x, y: room.player.pos.y } : null,
        hostId: room.host ? room.host.socketId : null,
    },
    ...
})
```

Must become:

```js
tankPositions: room.players.map(p => ({ socketId: p.socketId, x: p.pos.x, y: p.pos.y, alive: p.alive })),
currentPlayerIndex: ms.currentPlayerIndex,
```

### Client `GameBridge` State (GameBridge.js)

Current state shape:

```js
{
  tank1: { x, y, hp, angle, power, name, color, score },
  tank2: { x, y, hp, angle, power, name, color, score },
  activeTank: 0,    // 0=neither, 1=my tank, 2=opponent
  ...
}
```

The `tank1`/`tank2` names and `activeTank` integer are the bridge-side hardpoints.

Must become:

```js
{
  players: [                // array indexed by playerIndex
    { x, y, hp, angle, power, name, color, score, alive },
    ...
  ],
  myPlayerIndex: number,    // which players[] slot is "me"
  currentPlayerIndex: number,  // whose turn
  ...
}
```

React HUD reads this and renders N HP bars. Phaser writes to it after every `turnResult`.

### Client `MainScene` Hardpoints (scenes/main/index.js)

```js
this.tank1 = null;   // line 21 — my tank
this.tank2 = null;   // line 22 — opponent
this.activeTank = 0; // line 27 — 0/1/2 integer
```

`createTank1()` / `createTank2()` called in `create()` (lines 124–125).

In `checkSwitchTurn()` (line 266): references `this.tank1.settled`, `this.tank2.settled`.

In `applyTurnResult()` (line 514): resolves positions via `isHost ? tankPositions.host : tankPositions.player`.

All of these become array operations: `this.tanks[i]`, `this.tanks[myPlayerIndex]`.

### `reconnect` Complexity (main.js ~line 818)

Reconnect handler remaps `oldSocketId → newSocketId` across all six in-memory stores:

```js
// Separate if/else blocks for isHost vs not-isHost
if (isHost && room.host) {
    ws.wallets[client.id] = ws.wallets[oldSocketId]; delete ws.wallets[oldSocketId]
    gs[client.id] = gs[oldSocketId]; delete gs[oldSocketId]
    wi[client.id] = wi[oldSocketId]; delete wi[oldSocketId]
    ms.scores/kills/roundWins/hp migration...
    if (ms.currentTurn === oldSocketId) ms.currentTurn = client.id
    room.host.socketId = client.id
}
```

For N players: find the player by `oldSocketId` in `room.players[]`, update their `socketId`, then migrate all store entries. The migration logic is the same operations, just found via array lookup instead of binary branch.

The `pendingReconnects[walletAddress]` shape also needs to change from `{ roomId, isHost, ... }` to `{ roomId, playerIndex, ... }` since `isHost` is no longer the right discriminator.

### `cleanupRoom` and Disconnect Settlement (main.js ~line 596)

Disconnect settlement is deeply binary: it identifies "disconnector" and "opponent" as two individuals, then settles a single 1v1 escrow. For N players with wagers, this must:

1. Determine which player disconnected (by `playerIndex`).
2. Decide whether to award remaining survivors, refund, or pause match.

This is the most design-sensitive part of the N-player migration. The escrow program itself (`programs/solshot-escrow`) is currently 2-player only. For the practice-mode-first approach, simply remove the disconnecting player from the active roster (mark `alive = false`) and continue play. Wager settlement for N players is deferred to a separate escrow milestone.

### `shopPhase`/`shopEnd` (main.js ~line 1497)

```js
goldStates[client.roomId] = initGold(hostId, playerId)  // binary call
weaponInventories[client.roomId] = {
    [hostId]: [0, ...prestige weapons],
    [playerId]: [0, ...prestige weapons]
}
shopReady[client.roomId] = { [hostId]: false, [playerId]: false }
```

All three must iterate `room.players`. `shopDone` check:

```js
if (hostId && playerId && ready[hostId] && ready[playerId]) { endShopPhase(...) }
```

Must become: check all `room.players[i].socketId` in `shopReady[roomId]`.

### `ready` Handler (main.js ~line 1476)

```js
if (room.host.isReady && room.player && room.player.isReady) { /* start shop */ }
```

Must become: check all `room.players[i].isReady`.

### `playAgainRequest` (main.js ~line 2688)

```js
if (client.isHost === true) {
    room.host.playAgain = true
    if (room.player && room.player.playAgain === true) { resetForPlayAgain(...) }
}
```

Must become: set `room.players[myIndex].playAgain = true`, check all `room.players[i].playAgain`.

### Turn Timeout (`startTurnTimer`) — line 323

```js
const opponentId = currentTurnId === hostId ? playerId : hostId
```

Binary. Must become: find `currentTurnId` in `room.players`, determine next alive player.

The 3-forfeit rule (`ms.consecutiveTimeouts[currentTurnId] >= 3`) should still apply per-player. But the "opponent wins" outcome must change to "last-man-standing wins" when only one alive player remains.

### `getOpenRooms()` (line 194)

```js
result.push({
    roomId, wager, matchMode, totalRounds,
    host: { name, color },
})
```

For N players, should become `players: [{ name, color }, ...]` or at minimum `hostName`, `playerCount`, `maxPlayers` so the lobby list can show "2/4 players".

### `persistRoom()` (line 215)

Calls `Match.findByIdAndUpdate()` with `host` and `player` fields. Schema must be updated to store `players[]`. Low priority — DB is not the source of truth for active matches, only for stats and cancelled state.

---

## Recommended Architecture: `players[]` Array

The brief's proposed target (from `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md`) is correct and well-matched to the actual codebase. The key decision points, confirmed by reading the code:

### 1. Room Object: `players[]` Replaces `host`/`player`

```js
room = {
  roomId: string,
  maxPlayers: 2 | 3 | 4,
  players: [
    {
      name, color, socketId,
      isReady, playAgain,
      pos: { x, y },
      playerIndex,   // immutable 0-indexed position
      alive,         // true until eliminated
    }
  ],
  active: boolean,
  ...existing fields unchanged...
}
```

`players[0]` is always the room creator (former host). `playerIndex` is immutable — it does not change when a player reconnects.

Why array, not Map: JSON serialization to clients is trivial, ordering is deterministic, positional indexing (`players[currentPlayerIndex]`) matches Phaser tank array indexing exactly.

**Compatibility note:** `client.isHost` on the socket object can remain as `client.playerIndex === 0` semantically, but the property should be kept as a boolean for backward-compatible auth checks (wagered rooms still need to know if the creator is the one connecting).

### 2. Match State: `currentPlayerIndex` Replaces Binary Turn Toggle

Add `currentPlayerIndex: 0` to `createMatchState()`.

`currentTurn` (the socketId) can be derived as `room.players[ms.currentPlayerIndex].socketId`. Keeping `currentTurn` as a redundant field eliminates a lookup in every turn validation check — worth the duplication.

`turnsPerRound` changes from `20` (2 * 10) to `N * 10`.

### 3. Turn Rotation with Skip-Dead Logic

```js
// match.js
export function getNextTurn(ms, players) {
    let next = (ms.currentPlayerIndex + 1) % players.length;
    let attempts = 0;
    while (attempts < players.length) {
        if (players[next].alive) break;
        next = (next + 1) % players.length;
        attempts++;
    }
    ms.currentPlayerIndex = next;
    ms.currentTurn = players[next].socketId;
    return players[next].socketId;
}
```

The `attempts < players.length` guard prevents infinite loop when zero players are alive (should not happen but the guard is cheap).

This function now mutates both `ms.currentPlayerIndex` and `ms.currentTurn` — the caller no longer assigns the return value to `ms.currentTurn`. All call sites in `main.js` must be updated.

### 4. `isRoundOver` for Last-Man-Standing

```js
export function isRoundOver(ms) {
    const alivePlayers = Object.values(ms.hp).filter(hp => hp > 0).length;
    return alivePlayers <= 1;
}
```

Turn limit check (`turnCount >= turnsPerRound`) remains valid — prevents infinite matches if players don't kill each other.

### 5. Elimination Events

After HP update in the `fire` handler, emit `playerEliminated` for each newly-dead player before calling `isRoundOver`:

```js
// In fire handler, after HP update loop
const newlyEliminated = [];
for (const [playerId, hp] of Object.entries(ms.hp)) {
    if (hp <= 0) {
        const p = room.players.find(p => p.socketId === playerId);
        if (p && p.alive) {
            p.alive = false;
            newlyEliminated.push({ playerIndex: p.playerIndex, socketId: playerId });
        }
    }
}
for (const e of newlyEliminated) {
    io.sockets.in(this.roomId).emit('playerEliminated', e);
}
```

Emit `playerEliminated` before `turnResult` so clients can start elimination animations before updating turn state.

### 6. Tank Positions on Terrain (1200px)

For N tanks across 1200px terrain:

| Players | Zone Width | Spawn Range per Zone |
|---------|-----------|---------------------|
| 2 | 600px | 20%–35% and 65%–80% (existing) |
| 3 | 400px | 10%–20%, 43%–57%, 80%–90% |
| 4 | 300px | 8%–18%, 32%–42%, 58%–68%, 82%–92% |

Minimum inter-tank spacing of ~200px prevents spawn collisions. The margin-based zone approach above naturally enforces this.

Tanks must not spawn within the blast radius of any other tank. Given terrain width 1200px and max blast radius 90px (Big Shot), zone separation of 200px is sufficient.

### 7. In-Memory Store Migration

All stores already use `{ [socketId]: value }` internally. The migration is:

- `goldStates[roomId]` — `initGold(playerIds[])` initializes all N entries. No other change.
- `weaponInventories[roomId]` — initialize for each player in `players[]`. No other change.
- `shopReady[roomId]` — initialize for each player. Check becomes `room.players.every(p => shopReady[roomId][p.socketId])`.
- `wagerStates[roomId].wallets` — already `{ [socketId]: address }`, already N-player-ready.
- `matchStates[roomId].hp` / `.scores` / `.kills` — already `{ [socketId]: value }`, already N-player-ready.

The one structural change: `wagerStates[roomId].deposits` check for escrow confirmation changes from `ws.deposits[room.host?.socketId] && ws.deposits[room.player?.socketId]` to `room.players.every(p => ws.deposits[p.socketId])`.

### 8. Socket Event Payload Changes

| Event | Change |
|-------|--------|
| `createRoom` | Add `maxPlayers: 2\|3\|4` |
| `joinRoom` | Allow multiple joins up to `maxPlayers` |
| `startPick` | `{ host, player }` → `{ players[], maxPlayers }` |
| `shopPhase` | `{ [hostId]: weapons, [playerId]: weapons }` → `{ [socketId]: weapons }` for all N |
| `shopEnd` | Same — iterate players |
| `terrainGenerated` | `tankPositions: { host, player }` → `tankPositions: [{ socketId, x, y }, ...]` |
| `turnResult` | `tankPositions: { host, player, hostId }` → `players: [{ socketId, x, y, alive }]` + `currentPlayerIndex` |
| `matchEnd` | Add `survivorOrder: socketId[]` (finishing positions for 3rd/4th place display) |
| `playerEliminated` | NEW: `{ playerIndex, socketId }` |
| `rejoinSuccess` | `tankPositions: { host, player }` → `players[]` |

Unchanged events: `fire`, `shoot`, `weaponChange`, `angleChange`, `powerChange`, `stepLeft`, `stepRight`, `buyWeapon`, `shopDone`, all escrow events, all auth events.

### 9. GameBridge State Changes

```js
// Before
{
  tank1: { x, y, hp, ... },
  tank2: { x, y, hp, ... },
  activeTank: 0,  // 0=neither, 1=my tank active, 2=opponent active
}

// After
{
  players: [
    { socketId, x, y, hp, name, color, score, alive },
    ...  // N entries
  ],
  myPlayerIndex: number,
  currentPlayerIndex: number,
  // All other fields unchanged: wind, gold, round, weapons, isPlayerTurn, etc.
}
```

The `isPlayerTurn` derived field (currently set in `handleType3`) remains valid:

```js
const isMyTurn = (currentPlayerIndex === myPlayerIndex);
bridge.updateState({ isPlayerTurn: isMyTurn });
```

React HUD renders N HP bars by mapping over `bridge.state.players`. Tank HUD color-coding uses `players[i].color`.

The `reset()` method in `GameBridge.js` must reinitialize `players: []` instead of `tank1`/`tank2`.

### 10. Reconnect with N Players

Change `pendingReconnects[walletAddress]` shape from:

```js
{ roomId, isHost, oldSocketId, name, color }
```

To:

```js
{ roomId, playerIndex, oldSocketId, name, color }
```

The reconnect handler finds the player slot via `playerIndex` instead of the `isHost` branch:

```js
const reconnecting = room.players[playerIndex];
reconnecting.socketId = client.id;
// Migrate all stores using oldSocketId → client.id
```

The opponent notification `'opponentDisconnected'` changes from targeting a single opponent to broadcasting to the room (`io.sockets.in(roomId).emit`). The reconnect window behavior is unchanged — 30 seconds, then forfeit cleanup.

For N-player disconnect during active match (practice mode): mark the disconnected player `alive = false` and continue. Emit `playerEliminated` for the disconnected player after reconnect window expires.

### 11. BO3/BO5 Round Resets with N Players

`resetForNextRound(ms)` already iterates `Object.keys(ms.hp)` to reset HP — no change needed.

The `isMatchOver` binary function is the challenge. For N-player last-man-standing:

- "Round win" = surviving the round. The last alive player gets `roundWins[playerId]++`.
- BO3 = first to 2 round wins. BO5 = first to 3. Valid for N players.
- Tiebreaker: if multiple players are alive when turn limit hits, highest HP wins the round.

The `ready` handler for between-round state currently checks `room.host.isReady && room.player.isReady`. For N players, it checks all `room.players[i].isReady`. The "between-rounds shop" comment (line 1504) correctly notes that Gold carries over — this is N-player-compatible as-is.

### 12. Escrow for N Players

The existing Anchor program and `escrow.js` service are binary (`p1wallet`, `p2wallet` parameters throughout). N-player wagering requires a program upgrade — deferred to a separate milestone.

For the N-player game logic milestone: practice mode (`wager: 0`) is fully achievable without touching escrow. The `wagerStates[roomId]` struct just grows more `wallets` entries when wager support is added later.

The `depositTimers` and escrow deposit flow currently checks:
```js
const hostDep = wsCheck.deposits[roomCheck.host?.socketId]
const playerDep = wsCheck.deposits[roomCheck.player?.socketId]
if (hostDep && playerDep) return  // both deposited
```

For N players: `room.players.every(p => wsCheck.deposits[p.socketId])`.

---

## Suggested Build Order

This order minimizes breakage by establishing the data contract (server structures) before modifying consumers.

The rationale: socket event payloads are the contract boundary between server and client. Change the server to emit N-player payloads, then update the client to consume them. Helper functions before handlers (handlers depend on helpers).

### Phase 1: match.js (isolated, no external dependencies)

1. Add `currentPlayerIndex: 0` to `createMatchState()` return object.
2. Update `turnsPerRound` to accept `playerCount` param (e.g. `turnsPerRound: playerCount * 10`).
3. Rewrite `getNextTurn(ms, players)` — new signature, skip-dead logic.
4. Rewrite `isRoundOver(ms)` — alive count <= 1, keep turn limit fallback.
5. Rewrite `isMatchOver(ms, players)` — N-player round-win check.
6. Rewrite `getRoundWinner(ms, players)` — last alive, or highest HP on turn limit.
7. Update `initGold(playerIds[])` in `gold.js` — iterate array instead of binary args.

All changes are self-contained. No imports from main.js. Test by reading the exported functions in isolation.

### Phase 2: Server room data structures (main.js, additive changes)

8. Update `createRoom`: accept `maxPlayers`, build `players[0]` as host entry.
9. Update `joinRoom`: push to `players[]` instead of assigning `room.player`.
10. Update `getOpenRooms()`: serialize `players[]` and `maxPlayers`.
11. Update `persistRoom()`: write `players[]` instead of `host`/`player`.
12. Update `removeRoom()`: no structural change needed (cleans by roomId key).

At this point: 2-player matches still work if `maxPlayers=2` falls through to old logic. Resist the temptation to keep old code paths — clean cut is safer for a 2750-line file.

### Phase 3: Lobby flow (ready, shopPhase, shopDone)

13. Update `ready` handler: check `room.players.every(p => p.isReady)`.
14. Update `shopPhase` emit: iterate `room.players` for Gold init and inventory.
15. Update `shopDone` check: `room.players.every(p => shopReady[roomId][p.socketId])`.
16. Update `endShopPhase`: iterate `room.players` for weapon list building.

### Phase 4: requestTerrain

17. Update `generateTankPositions(heightmap, N)` in `physics.js`: N-zone spawn.
18. Update `requestTerrain` handler: pass `room.players.length` to `generateTankPositions`.
19. Store positions in `room.players[i].pos` instead of `room.host.pos` / `room.player.pos`.
20. Initialize `ms.hp[socketId] = 250` for all N players.
21. Initialize `ms.currentPlayerIndex`, call new `getNextTurn(ms, room.players)`.
22. Update `terrainGenerated` payload: `tankPositions: room.players.map(...)`.

### Phase 5: fire handler

23. Replace binary tank building loop with `room.players.filter(p => p.pos).map(...)`.
24. Update position update logic (tank Y snap after blast) to iterate `room.players`.
25. Add elimination loop after HP updates: mark `alive = false`, emit `playerEliminated`.
26. Call new N-player `getNextTurn(ms, room.players)`.
27. Update `turnResult` payload: `players[]` array, `currentPlayerIndex`.
28. Update `isRoundOver`, `isMatchOver`, `getRoundWinner` call sites (now N-player signatures).
29. Update Gold award calls to handle N-player round winner.

### Phase 6: Remaining server handlers

30. Update `stepLeft` / `stepRight`: find player by `client.id` in `room.players`.
31. Update `positionUpdate`: find player by `client.id` in `room.players`.
32. Update `startTurnTimer` / forfeit logic: N-player opponent determination.
33. Update `cleanupRoom` / disconnect: mark dead instead of destroying room (for N>2 case).
34. Update `rejoinRoom`: use `playerIndex` instead of `isHost` branch.
35. Update `playAgainRequest`: check all `room.players[i].playAgain`.
36. Update `matchEnd` payload: add `survivorOrder[]`.

### Phase 7: Client — Phaser MainScene

37. Replace `this.tank1`, `this.tank2`, `this.activeTank` with `this.tanks[]`, `this.myPlayerIndex`, `this.currentPlayerIndex`.
38. Replace `createTank1()` / `createTank2()` with loop: `for (let i = 0; i < players.length; i++)`.
39. Update `handleType3()`: read `myPlayerIndex` from `sceneData`, build tanks array.
40. Update `terrainGenerated` handler: position all N tanks from `tankPositions[]`.
41. Update `applyTurnResult()`: iterate `players[]` for position sync and HP update.
42. Update `checkSwitchTurn()`: check `this.tanks` array instead of `tank1`/`tank2`.
43. Add `playerEliminated` socket handler: animate tank destruction, notify bridge.
44. Update `_pushStateToBridge()`: write `players[]` state to bridge.

### Phase 8: GameBridge

45. Change `GameBridge.state` to use `players[]`, `myPlayerIndex`, `currentPlayerIndex`.
46. Update `reset()` accordingly.
47. Add `setPlayerEliminated(playerIndex)` method for Phaser to call.

### Phase 9: React HUD

48. Update HP bar rendering: map over `bridge.state.players`, N bars.
49. Color-code by `players[i].color` — brief specifies: red, blue, green, yellow.
50. Grey-out / crossed-out styling for eliminated players (`players[i].alive === false`).
51. Turn indicator: highlight `players[currentPlayerIndex]` bar.
52. Update lobby waiting room: show N player slots with ready status.
53. Add player count selector to room creation: 2 / 3 / 4.

---

## Component Boundary Summary

| Component | Status | What Changes |
|-----------|--------|-------------|
| `server/services/match.js` | Modified | All 4 binary functions rewritten, `currentPlayerIndex` added |
| `server/services/gold.js` | Modified | `initGold()` signature only |
| `server/services/physics.js` | Modified | `generateTankPositions()` gains `playerCount` param |
| `server/socket-io/main.js` | Modified | ~30 change sites across ~15 handlers |
| `client/src/bridge/GameBridge.js` | Modified | State shape: `tank1/2` → `players[]` |
| `client/src/scenes/main/index.js` | Modified | Tank array, turn index, elimination handler |
| React HUD components | Modified | N HP bars, player count selector |
| `programs/solshot-escrow/` | Unchanged (deferred) | Binary escrow unchanged until wager milestone |
| `server/services/escrow.js` | Unchanged (deferred) | Same |
| `server/services/gold.js` (other funcs) | Unchanged | All already keyed by socketId |
| All physics calculation functions | Unchanged | Already accept arbitrary `tanks[]` array |
| Auth middleware, guards, monitoring | Unchanged | Orthogonal to player count |

---

## Integration Points Requiring Attention

### The `isHost` Flag

`client.isHost` is set on the socket object at `createRoom` / `joinRoom` / `rejoinRoom`. It is used in:
1. `cleanupRoom` — to identify disconnector role
2. `deleteRoom` — only host can delete
3. `fire` handler — to determine which position to use for shooter

For `deleteRoom`: keep `client.isHost = (client.playerIndex === 0)`.
For `cleanupRoom`: replace `client.isHost` branch with `room.players.find(p => p.socketId === client.id)`.
For `fire`: replace `isHost` with `room.players.find(p => p.socketId === this.id)`.

### `room.active` Flag

The `active` flag is set to `true` when the second player joins (E12 race guard, line 1006). For N>2 players: `active` should be set to `true` only when `players.length === maxPlayers`. This prevents the room from being joinable once full but requires care: the race guard at line 1006 (`room.active = true`) prevents double-join by temporarily locking the room. For N players, the lock-and-check pattern must remain, but the room unlocks after the join completes if `players.length < maxPlayers`.

### `broadcastRooms` and `getOpenRooms`

Currently shows rooms where `!room.active` (not full). This needs to also check `players.length < maxPlayers` for the case where maxPlayers > 2 and the room has 1 or 2 players but still has slots. The lobby UI must show "2/4" player counts.

### `turnsPerRound` Scaling

Currently hardcoded to `20` in `createMatchState()`. For N players with 10 turns each: `N * 10`. A 4-player match gets 40 total turns per round before the turn limit fires. This affects match length — the design should consider whether a 4-player last-man-standing round should have the same per-player turn count as 1v1.

### `consecutiveTimeouts` Forfeit Rule (3 timeouts)

The forfeit rule currently ends the match when one player times out 3 consecutive turns. For N players: 3 consecutive timeouts on the same player → eliminate that player (mark `alive = false`), not end the match. The match continues with remaining players. This avoids a single AFK player killing the whole match.

---

## Known Complications

**Tank Y settling in `checkSwitchTurn`:** The guard `if (this.tank1.settled === false || this.tank2.settled === false)` checks both tanks. For N tanks, this becomes `this.tanks.some(t => t.settled === false)`. The 3-second force-settle timeout must iterate all tanks.

**`opponentShoot` relay event:** The legacy `shoot` event (line 1784) relays to `client.to(roomId).emit('opponentShoot', ...)`. In N-player, all clients (not just the opponent) need to see the shot animation. `client.to(roomId)` already sends to everyone in the room except the sender — this is correct behavior for N players.

**`opponentWeaponChange`, `opponentAngleChange`, `opponentStepLeft`, etc.:** These relay events are correct for N players — each client sees other players' actions. No change needed.

**`matchEnd` SHOT Token recording:** Currently records for `hostId` and `playerId` separately. Must iterate `room.players`. The `recordMatchPlayed` function in `shot-token.js` is per-wallet and is already N-player-compatible.

**DB persistence (`Match` model):** The Mongoose schema likely has binary `host`/`player` fields. Updating the schema is low priority (DB is not authoritative for active matches), but the schema should eventually reflect `players[]` for historical match records. Not a blocker for the gameplay milestone.

**`wagerStates` escrow deposit countdown:** The `depositTimers[roomId]` handler (line 1107) checks only `roomCheck.host?.socketId` and `roomCheck.player?.socketId`. For N-player wagers, check all `room.players`. This is a Phase 7 concern when escrow is extended.
