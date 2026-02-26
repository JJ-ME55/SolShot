# Technology Stack — 4-Player Multiplayer Refactor

**Project:** SolShot — 1v1 → 2-4 Player Last-Man-Standing
**Researched:** 2026-02-26
**Scope:** Stack additions and changes for N-player support only. Existing validated stack not re-researched.

---

## Existing Stack (Locked — Do Not Re-evaluate)

| Layer | Technology | Version in Use |
|-------|-----------|----------------|
| Client UI | React 18 + CRA / react-app-rewired | 18.1.0 |
| Game Engine | Phaser 3 | ^3.55.2 (npm installed) |
| Client socket | socket.io-client | ^4.5.1 |
| Server | Express + Socket.IO | ^4.4.1 (server) |
| Server language | Node.js ES Modules | >=18.0.0 |
| Database | Mongoose / MongoDB | ^9.2.1 |
| Blockchain | @solana/wallet-adapter, Anchor 0.32.1 | as installed |

---

## Version Currency Check

### Phaser 3

Current installed: `^3.55.2`. Latest stable: **v3.90.0 "Tsugumi"** (released 23 May 2025).

Phaser v3.90.0 is likely the final Phaser 3 release. Phaser v4 is in active beta (Beta 7 released March 2025) but is not production-ready and would require a full rewrite. **Stay on Phaser 3 for this milestone.**

The gap from 3.55.2 to 3.90.0 is significant (35 minor versions). However, upgrading Phaser in the same milestone as a major architecture change is a compounding risk. **Recommendation: Do not upgrade Phaser as part of this milestone.** The N-player refactor does not require any APIs added after 3.55.2.

### Socket.IO

Current installed: server `^4.4.1`, client `^4.5.1`. Latest stable: **4.8.3** (released December 2025).

No breaking changes between 4.4.x and 4.8.x that affect this use case. Server and client versions should be aligned. **Recommendation: Update both to ^4.8.3 at milestone start as a clean housekeeping step.** This is low risk and closes the version gap between server and client packages.

---

## Stack Additions Required for N-Player

### Nothing New Is Required

The existing stack is sufficient. The refactor is architectural, not a library gap. Every capability needed exists in the current dependencies:

- Socket.IO rooms: already used, already support 2-4 sockets per room
- Phaser Groups: built into Phaser 3, no additional packages
- React dynamic rendering: standard `.map()` over a players array
- Server-authoritative turn management: the circular queue pattern is pure data logic in `match.js`

Do not add new libraries. The temptations to reach for (state management libraries, turn-management packages, N-player SDKs) add dependency weight without solving a problem that cannot be solved with existing tools.

---

## Architectural Changes by Subsystem

This section documents the specific changes required in each existing subsystem. This is the substance of what the roadmap phases will implement.

### 1. Server: Room Data Model

**Current structure (binary):**
```js
room.host    = { socketId, wallet, name, color, ... }
room.player  = { socketId, wallet, name, color, ... }
```

**Required structure (N-player):**
```js
room.players = [
  { socketId, wallet, name, color, slotIndex, isAlive, ... },
  // 1-3 more entries
]
room.maxPlayers = 2 | 3 | 4  // set at room creation
```

Every place in `server/socket-io/main.js` that references `room.host` or `room.player` by name must be migrated to array index operations. The `room.hostId` concept becomes `room.players[0].socketId` (or a separate `room.ownerId` for the player who created the room — keep this field for lobby control, separate from game slot ordering).

The existing wallet-keyed reconnect maps (`pendingReconnects`, `disconnectTimers`) work without changes for N players since they are already keyed by wallet address, not by host/player role.

### 2. Server: Match State Machine (`match.js`)

**Current `getNextTurn` (binary alternation):**
```js
export function getNextTurn(matchState, hostId, playerId) {
    if (!matchState.currentTurn) {
        return crypto.randomInt(2) === 0 ? hostId : playerId;
    }
    return matchState.currentTurn === hostId ? playerId : hostId;
}
```

**Required (circular queue with elimination):**

```js
// matchState gains:
//   turnOrder: string[]   — ordered array of socket IDs, established at round start
//   eliminated: Set       — socket IDs of dead players (hp <= 0)
//   turnIndex: number     — pointer into turnOrder

export function getNextTurn(matchState) {
    const alive = matchState.turnOrder.filter(
        id => !matchState.eliminated.has(id)
    );
    if (alive.length === 0) return null;

    // Advance from current index, wrapping, skipping eliminated
    let idx = matchState.turnIndex;
    for (let i = 0; i < matchState.turnOrder.length; i++) {
        idx = (idx + 1) % matchState.turnOrder.length;
        const candidate = matchState.turnOrder[idx];
        if (!matchState.eliminated.has(candidate)) {
            matchState.turnIndex = idx;
            return candidate;
        }
    }
    return null;
}
```

**Elimination trigger:** When a `fire` result drops a player's HP to 0, that player is added to `matchState.eliminated`. The round ends when `eliminated.size === matchState.turnOrder.length - 1` (one player left). This replaces the current `isRoundOver` binary check.

**Turn count:** The current `turnsPerRound` cap (20 turns total) needs re-evaluation for N players. With 4 players, 20 turns means only 5 turns per player — likely too few. Either remove the cap in favour of pure elimination, or scale it: `turnsPerRound = 10 * activePlayers`.

**callers that pass `hostId, playerId`:** `main.js` has multiple call sites. All must be updated to the new signature. Search for `getNextTurn(` — there will be 2-3 sites.

### 3. Server: `generateTankPositions` in `physics.js`

**Current:**
```js
export function generateTankPositions(heightmap) {
    // Returns { host: {x,y}, player: {x,y} }
    // Two positions, hardcoded left and right halves
}
```

**Required:**
```js
export function generateTankPositions(heightmap, playerCount = 2) {
    // Divide canvas width into playerCount equal zones
    // Place one tank per zone, finding the terrain surface at that X
    // Returns positions[]: [{x, y}, ...]
    // Enforce minimum separation (e.g. 200px) between adjacent tanks
}
```

The terrain canvas is 1200px wide. For N players, divide into N equal segments:
- 2 players: segments [0-600), [600-1200) — same as today
- 3 players: segments [0-400), [400-800), [800-1200)
- 4 players: segments [0-300), [300-600), [600-900), [900-1200)

Pick a random X within each segment and find the terrain surface Y at that X. Minimum separation enforcement prevents positions that end up too close after terrain randomness.

### 4. Server: Heatseeker / Homing Weapons

`WEAPON_DATA` type `'homing'` currently targets a single opponent. With N players, the homing logic in `physics.js` must target the nearest living player, not a hardcoded "the other tank". This requires passing the full list of living tank positions to the homing calculation.

### 5. Client: Phaser Scene — Tank Management

**Current:** `this.tank1` and `this.tank2` as named instance variables.

**Required:** `this.tanks = []` — an array of Tank instances, indexed by slot.

The `Tank` class constructor already accepts an `id` parameter and uses it for texture keying (`'tank' + id`). This pattern already handles uniqueness. Extending to 4 tanks means calling `new Tank(scene, 0)` through `new Tank(scene, 3)` — no Tank class changes needed.

**Perspective mapping** — the current "tank1 = mine, tank2 = opponent" convention must become "my tank is `this.tanks[mySlotIndex]`, all others are opponent tanks." The `mySlotIndex` comes from the server at terrain generation time.

**Turn pointer** — `showTurnPointer()` currently hardcodes `tank1` / `tank2`. Must look up `this.tanks[activeTankIndex]`.

**`applyTurnResult`** — currently walks `data.hp` keyed by socket ID and maps to `tank1`/`tank2` by comparing `socket.id`. The same pattern works: iterate `data.hp`, find the Tank whose `socketId` matches, update its `scoreHandler.hp`. No structural change needed — just replace the two-branch `isMe ? tank1 : tank2` with `this.tanks.find(t => t.socketId === targetId)`.

**`checkSwitchTurn`** — the local turn-switching logic for practice mode (gameType 4) uses `activeTank === 1 / 2`. Must be refactored to iterate over `this.tanks`, finding the one with `active === true`. For online mode (gameType 3) this method is already bypassed — turn switching is entirely server-driven.

### 6. Client: GameBridge

**Current state shape:**
```js
this.state = {
  tank1: { x, y, hp, angle, power, name, color, score },
  tank2: { x, y, hp, angle, power, name, color, score },
  activeTank: 0,     // 0 = none, 1 = tank1, 2 = tank2
  ...
}
```

**Required state shape:**
```js
this.state = {
  players: [         // array indexed by slot, always length = playerCount
    { x, y, hp, angle, power, name, color, score, isAlive, isMe },
    ...
  ],
  mySlot: 0,         // which index in players[] is the local player
  activeTankSlot: -1, // index of the player whose turn it is
  ...
}
```

Backward compatibility: `tank1` and `tank2` getters on the bridge state are convenient shorthand for `players[0]` and `players[1]` in 2-player mode, but the HUD components must be rewritten to consume `players[]` directly rather than relying on named fields.

### 7. Client: React HUD — ScoreBoard and BattleHUD

**Current ScoreBoard:** `function ScoreBoard({ tank, side })` — renders one player on a fixed side (left or right). Hardcoded to assume exactly two players, one each side.

**Required:** `function PlayerCard({ player, isActive, isEliminated })` — a compact card rendering name, HP bar, color dot. Rendered via `players.map()`. Layout adapts to player count:

- 2 players: current left/right layout
- 3-4 players: top bar with horizontal row of cards, or top-left cluster

No external library needed. Pure flexbox React. The existing `ScoreBoard` CSS idioms (HP bar with trailing damage, color-coded HP levels, damage flash animation) all generalize directly — they already operate on a single `tank` prop. Create `PlayerCard` as a generalization, replace `ScoreBoard` calls with `players.map(p => <PlayerCard key={p.socketId} player={p} ... />)`.

**BattleHUD layout:** Currently positions ScoreBoard components at top-left and top-right. For N-player, the scoreboard row fills the top center, players arranged horizontally. The existing flex structure in BattleHUD accommodates this without a layout library.

**Turn indicator:** The active player's card gets a highlight border/glow. `activeTankSlot` from bridge state drives this. "YOUR TURN / WAITING" label remains, keyed on `player.isMe && activeTankSlot === mySlot`.

**Eliminated display:** Dead players' cards show a skull/eliminated state (greyed out, HP bar at zero, no damage animation). `player.isAlive` boolean drives this.

### 8. Client: Lobby — Variable Player Count

**Current LobbyScreen:** Built around `host` / `player` binary join. Room creation does not accept a `maxPlayers` parameter.

**Required changes:**
- Room creation emits `maxPlayers` (2, 3, or 4) as part of `createRoom`
- Lobby waits until `room.players.length === maxPlayers` before enabling "Start" or auto-starting
- Lobby shows slots: N named slots, empty slots show "Waiting for player..."
- Player list is rendered as `players.map()` rather than a two-name display

No library additions needed. The existing `useSocket` hook already handles socket-based updates. Add a `playerList` event emitted by the server on each join/leave to drive the lobby display.

### 9. Client: Reconnection for N Players

**Current reconnect model:** Wallet-keyed, rejoin maps both players. Works with N players because it is already keyed by wallet, not by host/player role. The `pendingReconnects` map stores `{ roomId, isHost, socketId, name, color }`.

**Change needed:** Replace `isHost` boolean with `slotIndex: number` in the stored reconnect state. The reconnect handler on the server remaps the new socket ID at the correct slot index in `room.players[]`.

The `opponentDisconnected` / `opponentReconnected` events emitted to remaining players become `playerDisconnected: { slotIndex, name }` and `playerReconnected: { slotIndex, name }`. The client overlay that currently says "Opponent disconnected" generalizes to show the disconnected player's name.

### 10. Server: Disconnect / Reconnect for N Players

The 30-second reconnect window logic in `main.js` works per-wallet. For N players:

- On disconnect, broadcast `playerDisconnected` to the room instead of `opponentDisconnected`
- The 30s timer fires `playerEliminated` (not `matchSettled`) if the player does not reconnect — the match continues with remaining players
- If only one player remains after auto-elimination, that player wins (same path as normal last-man-standing victory)
- Only if ALL remaining players disconnect does the room get torn down

This is a meaningful behaviour change: currently a disconnect during a 1v1 starts a forfeit/settlement flow. In N-player, one disconnect just eliminates that player.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| Redux / Zustand for game state | The GameBridge dirty-flag pattern already solves the React-Phaser state problem with zero overhead. A store adds complexity without benefit. |
| Colyseus or other game server frameworks | Main.js is already a custom game server. Migrating to Colyseus would require rewriting ~1800 lines of validated logic. The existing Socket.IO architecture handles N players natively. |
| Socket.IO connection state recovery | The existing wallet-keyed manual reconnect is more game-appropriate. Socket.IO's built-in recovery preserves socket state but still requires manual game-state resync, which the existing system already does. |
| Phaser 3 upgrade to 3.90.0 | Safe to do but adds non-trivial regression risk with no functional benefit for this milestone. Defer to a dedicated maintenance milestone. |
| Phaser 4 | Beta, breaking API changes, would require full scene rewrite. Not viable for production. |
| A lobby management library | Overkill. Socket.IO rooms + a players[] array on the room object is sufficient. |
| `immer` for immutable server state | Server state mutations are intentional and contained. Immutability tooling adds overhead without addressing the actual multi-player complexity. |

---

## Integration Points (Changed Interfaces)

These are the seams between subsystems that will change. Each becomes a phase boundary or task in the roadmap.

| Interface | Current | Required |
|-----------|---------|---------|
| `createRoom` socket event | `{ matchMode, matchLength, wager, color, name }` | Add `maxPlayers: 2|3|4` |
| `terrainGenerated` socket event | `{ path, heightmap, tankPositions: {host, player}, firstTurn }` | `tankPositions: [{x,y}, ...]`, `firstTurn: socketId`, `playerOrder: socketId[]` |
| `turnResult` socket event | `{ hp: {[id]: number}, tankPositions: {host, player}, nextTurn, ... }` | `hp: {[id]: number}`, `tankPositions: [{x,y}]`, `eliminated: socketId[]`, `nextTurn: socketId` |
| `matchEnd` socket event | `{ winner: socketId }` | `{ winner: socketId, finalStandings: [{socketId, rank, hp}] }` |
| `GameBridge.state` | `{ tank1, tank2, activeTank }` | `{ players: [], mySlot, activeTankSlot }` |
| `getNextTurn(matchState, hostId, playerId)` | Binary alternation | Circular queue with elimination |
| `generateTankPositions(heightmap)` | Returns `{host, player}` | Returns `[{x,y}, ...]` of length `playerCount` |
| `isRoundOver(matchState)` | Binary HP check or turn cap | Checks `eliminated.size >= playerCount - 1` |
| Room data shape | `{ host, player, ... }` | `{ players: [], ownerId, maxPlayers, ... }` |

---

## Sources

- Phaser v3.90.0 stable release: [phaser.io/download/stable](https://phaser.io/download/stable)
- Phaser 4 beta status: [phaser.io/news/2025/03/phaser-v4-beta-7-released](https://phaser.io/news/2025/03/phaser-v4-beta-7-released)
- Socket.IO 4.8.3 changelog: [socket.io/docs/v4/changelog/4.8.3](https://socket.io/docs/v4/changelog/4.8.3)
- Socket.IO connection state recovery (limitations): [socket.io/docs/v4/connection-state-recovery](https://socket.io/docs/v4/connection-state-recovery)
- Phaser 3 Groups API: [docs.phaser.io/phaser/concepts/gameobjects/group](https://docs.phaser.io/phaser/concepts/gameobjects/group)
- Circular queue turn rotation pattern: [dev.to/sauravmh/browser-game-design-using-websockets-and-deployments-on-scale-1iaa](https://dev.to/sauravmh/browser-game-design-using-websockets-and-deployments-on-scale-1iaa)
- Haskell 3-player artillery (turn rotation reference): [github.com/sukrutrao/Artillery-Game](https://github.com/sukrutrao/Artillery-Game)
