# Reference Repository Research — Artillery Game N-Player Patterns

**Purpose:** Inform SolShot's refactor from 1v1 to 2-4 player last-man-standing.
**Date:** 2026-02-26
**Researcher:** Claude Code

---

## Summary Table

| Repo | Stack | Players | Server Auth? | Relevance |
|------|-------|---------|--------------|-----------|
| Amankumar321/pocket-tanks | React + Phaser 3 + Express + Socket.IO | 2 only | No (relay) | MEDIUM |
| masag0/Guntanks | Vanilla JS + Canvas (local only) | 2 or 4 | N/A (local) | HIGH |
| tymochko/pocket-tanks | AngularJS + Node + Socket.IO + MongoDB | 2 only | No (relay) | LOW |
| tomlokhorst/ScorchedCanvas | C# ASP.NET server + CoffeeScript/JS client | N (list) | Yes (C#) | LOW |
| joshdaws/scorched-earth-clone | Vanilla JS + Canvas + Convex | 2 (1vAI) | No (client) | LOW |

---

## Repo 1 — Amankumar321/pocket-tanks

**URL:** https://github.com/Amankumar321/pocket-tanks
**Relevance: MEDIUM**

### Tech Stack
- **Client:** React + Phaser 3 (Phaser `GameObjects.Sprite`, scenes, physics)
- **Server:** Node.js + Express + Socket.IO
- **Architecture:** Client-server split. Server is a thin relay — it does NOT compute physics.
- **Build:** Standard CRA client, separate Node server, Heroku/Procfile deploy

### Player Model
Players are stored in the server room object as two named fields:

```javascript
// server/socket-io/main.js
room = {
  roomId: string,
  active: bool,
  host:   { name, color, socketId, pos, isReady, playAgain },
  player: { name, color, socketId, pos, isReady, playAgain },
  randomArray,   // weapon selection
  terrainPath    // shared terrain state
}
```

On the client (`client/src/scenes/main/index.js`), players are `this.tank1` and `this.tank2` — hard-coded Phaser sprites. `this.activeTank` is an integer (0, 1, or 2) tracking whose turn it is.

**Player count supported: exactly 2.** The `host`/`player` dichotomy is baked into every event handler. No array; cannot extend to N without restructuring.

### Turn System
- `checkSwitchTurn()` polls conditions each frame: terrain animation complete, no active blasts, tanks settled, current tank's weapon has fired.
- When conditions pass: `activeTank` flips between 1 and 2.
- Multiplayer sync: the active client emits `giveTurn` with `{ terrainData, pos1, pos2, rotation1, rotation2 }`. The opponent receives `recieveTurn` and applies a `multiplayerCorrection()`.
- `requestTurn` / `opponentRequestTurn` are a readiness handshake before giving the turn.

**No elimination system.** The original Pocket Tanks game ends when both players run out of weapons, not when one is killed. There is no health-to-zero detection in this codebase.

### Physics
**Client-authoritative.** The server is a pure relay — it never touches trajectory math. The shooting client calculates everything locally via Phaser physics (`setGravityY`, velocity components from angle+power). The `giveTurn` packet syncs terrain state snapshots to the opponent after each shot resolves. This is exploitable in a competitive/wagered context; SolShot already solves this with server-authoritative physics.

### Room/Lobby
```javascript
// Room creation
const roomId = Math.random().toString(32).slice(2, 8)   // insecure RNG
rooms.unshift({ roomId, host, active: false })

// Join: sets room.active = true, emits 'startPick' to both
// Rooms list: broadcasts 5 inactive rooms on every change
```

Room listing exposes up to 5 open rooms globally — simple but not invite-only.

### N-Player Patterns
None present. The relay architecture (`client.to(roomId).emit(...)`) does not change for N players; the server just passes events. What needs to change:
- Room player model: `host`/`player` → `players: []` array
- Client: `tank1`/`tank2` → `tanks[]` array; `activeTank` index into that array
- `giveTurn` payload must carry all N tank states, not just `pos1, pos2`

### Code Quality
Moderate. Clean separation of concerns, readable event handlers. The disconnect/leaveRoom/deleteRoom handlers are copy-pasted three times with identical bodies — a clear DRY violation. Server has no auth, no rate limiting, no CSPRNG for room IDs (`Math.random()`). Physics is client-side only.

**Worth borrowing:** The `startPick` → `ready` → `startGame` lobby handshake pattern is clean for 2 players and adaptable.
**Do NOT copy:** `Math.random()` room IDs (SolShot already uses crypto CSPRNG). Client-side physics. Copy-pasted disconnect handlers.

---

## Repo 2 — masag0/Guntanks

**URL:** https://github.com/masag0/Guntanks
**Relevance: HIGH**

This is the most directly relevant repo for SolShot's N-player refactor. It is the only one that actually implements 2-4 player support with a working turn queue. It is local multiplayer only (no server), but the turn and elimination algorithms are directly adaptable.

### Tech Stack
- **Vanilla JavaScript + HTML5 Canvas** — no framework, no libraries except lodash and webpack for bundling
- **No server** — local multiplayer only, all players on one keyboard
- **Layered canvases:** UI canvas, entity canvas, terrain canvas

### Player Model
```javascript
// lib/guntanks.js
this.tank = new Tank('Player 1', 100, -200, ctx, ctxTerrain);
this.tank2 = new Tank('Player 2', 400, -200, ctx, ctxTerrain);
this.tank3 = new Tank('Player 3', 770, -200, ctx, ctxTerrain);
this.tank4 = new Tank('Player 4', 1070, -200, ctx, ctxTerrain);

window.tanks = [this.tank, this.tank2, this.tank3, this.tank4];
```

Players live in `window.tanks[]` — a global mutable array. The `currentTank` pointer tracks who is active. Player count is dynamic: tanks are spliced out of the array on elimination.

Each `Tank` has:
- `username`, `x`, `y`, `angle` (aim), `face` (left/right)
- `velX`, `velY` (physics)
- `health: 1000`, `maxHealth: 1000` (health bar rendered as green/red proportional fill)
- `delay` (cumulative time taken on turns — determines queue order)
- `ssCooldown` (special shot cooldown counter)
- `turnOver: bool` (signals shot has been fired)

### Turn System — KEY PATTERN

This is the most valuable code in all 5 repos. The turn system uses a **delay-based rotating queue**:

```javascript
// lib/guntanks.js — startTurns()

// 1. Sort by accumulated delay on first turn of a round
if (this.turnCounter === 1)
  window.tanks = window.tanks.sort((a, b) => a.delay - b.delay);

// 2. Current tank is always tanks[0]
this.currentTank = window.tanks[0];
this.currentTank.delay = 0;   // reset delay for this turn

// 3. Rotate the queue: move [0] to end
window.tanks.push(window.tanks.shift());

// 4. Detect round completion
if (this.turnCounter % window.tanks.length === 0) {
  this.roundCounter++;
  this.turnCounter = 1;
} else {
  this.turnCounter++;
}

// 5. Per-turn timer: 30s, then auto-advance
this.interval = setInterval(() => {
  if (this.currentTank.turnOver) {
    clearInterval(this.interval);
    this.time = this.TIMEOUT;
    clearTimeout(this.timeout);
  } else {
    this.currentTank.delay += 10;
    this.time--;
  }
}, 1000);

this.timeout = setTimeout(() => {
  this.time = this.TIMEOUT;
  clearInterval(this.interval);
  this.startTurns();
}, this.TIMEOUT * 1000);
```

**Elimination:**
```javascript
// lib/guntanks.js — render() loop
for (let i = 0; i < window.tanks.length; i++) {
  window.tanks[i].render(...);
  if (Math.abs(window.tanks[i].x) > this.can.width ||
      Math.abs(window.tanks[i].y) > this.can.height) {
    // Tank fell off screen — eliminate it
    window.tanks.splice(i, 1);
    clearInterval(window.game.interval);
    clearTimeout(window.game.timeout);
    window.game.startTurns();   // restart turns with one fewer player
  }
}
```

**Win condition:**
```javascript
// In the game loop
if (window.tanks.length === 1) {
  game.render();
  game.over(window.tanks[0]);  // last tank standing wins
}
```

**Wind rotation:** every 3 rounds (`roundCounter % 3 === 0`) wind changes.

**Delay queue display:**
```javascript
for (let i = 1; i < window.tanks.length + 1; i++) {
  li.innerHTML = `${window.tanks[i-1].username}   ${window.tanks[i-1].delay}`;
}
```

### Physics
Client-side custom physics (no library). Projectile: kinematic equations with gravity and wind. Shell:

```javascript
// lib/shell.js
x += xVel + 0.02 * windSpeed * Math.cos(windAngle) * time;
y += yVel + 0.5 * weight * time * time - 0.02 * windSpeed * Math.sin(windAngle) * time;
```

Collision: circle-to-circle distance for tanks, pixel-sampling for terrain. Damage: fixed `130` per hit (no falloff).

### Room/Lobby
No networking — local only. Not applicable.

### N-Player Patterns — DIRECTLY ADAPTABLE

The key algorithms for SolShot's refactor:

1. **`window.tanks.push(window.tanks.shift())`** — O(n) queue rotation. Trivially adaptable to `room.players[]` on the server.
2. **`window.tanks.splice(i, 1)` + restart** — splice eliminated player from array, restart turn cycle with reduced count.
3. **`if (window.tanks.length === 1)`** — last-man-standing win condition.
4. **`turnCounter % window.tanks.length === 0`** — round boundary detection that adjusts dynamically as players are eliminated.
5. **Delay accumulation** — tracks fairness across unequal turn lengths (interesting but not required for SolShot).

### Code Quality
Good for its scope. Single-file game class is readable and well-commented. No server = no security concerns. The `window.*` globals are messy but acceptable for local play. The delay-queue concept is creative.

**Worth borrowing:** The entire turn rotation + elimination + win detection pattern. Adapt `window.tanks[]` → `room.players[]` on the server. `startTurns()` → server-side `advanceTurn(room)` function.
**Do NOT copy:** `window.*` globals. Client-side physics (SolShot is server-authoritative). Fixed damage value.

---

## Repo 3 — tymochko/pocket-tanks

**URL:** https://github.com/tymochko/pocket-tanks
**Relevance: LOW**

### Tech Stack
- **Client:** AngularJS (not Angular 2+) + HTML5 Canvas + SASS + Bootstrap
- **Server:** Node.js + Express + Socket.IO + MongoDB + Mongoose
- **Build:** Gulp + Babel

### Player Model
Server-side (`src/server/socket/gameSocket.js`) uses a `tanksCoords` object:

```javascript
tanksCoords = {
  tank1: { id, tankX, tankY, weaponAngle },
  tank2: { id, tankX, tankY, weaponAngle }
}
```

Hard-coded `tank1`/`tank2` named keys. Client invitation system (`invitation.js`) stores active connections in a flat array:

```javascript
const info = { socket, user: null, username: null };
connections.push(info);
```

Matching is done by scanning the array for a target user ID. No Socket.IO rooms used — this limits scalability.

### Turn System
No explicit turn system visible in the server code. Turn progression appears to be entirely client-driven. Socket events are pure relays:
- `inputBulletPos` → `outputBulletPos` (bullet sync)
- `changeCoords` → `sendCoordsOnClient` (tank position)
- `end-game-request` → `end-game-ok`

### Physics
Client-authoritative. The server relays bullet positions — it does not validate or compute trajectories.

### Room/Lobby
No Socket.IO rooms. Uses a global connections array + direct user-to-user invitation flow. Game state stored in MongoDB for persistence.

### N-Player Patterns
None. Hard-coded 2-player named structure (`tank1`/`tank2`) throughout. No array-based iteration.

### Code Quality
Low. AngularJS is end-of-life (2021). No rooms = state isolation issues with multiple concurrent games. Database for what should be ephemeral session state adds unnecessary complexity. Physics is client-authoritative.

**Worth borrowing:** Nothing directly applicable.
**Do NOT copy:** Global connections array for matching (state isolation nightmare). AngularJS. Database-per-session pattern.

---

## Repo 4 — tomlokhorst/ScorchedCanvas

**URL:** https://github.com/tomlokhorst/ScorchedCanvas
**Relevance: LOW**

### Tech Stack
- **Server:** C# ASP.NET MVC + Reactive Extensions (Rx.NET) — Windows-only stack
- **Client:** CoffeeScript compiled to JavaScript + jQuery + custom WebSocket wrapper (`nepsocket.js`)
- **Architecture:** True server-authoritative — C# server runs physics, client is a dumb renderer

### Player Model
Server-side (`src/Tmoag/World.cs`):
```csharp
public List<Player> Players { get; set; }
public double[] Landscape { get; set; }
```

`List<Player>` supports arbitrary N players. Each `Player` has `id`, `name`, `color`, `health`, `score`, `angle`, `barrelAngle`, `position` (Vector).

Client-side (`play/socketimpl.js`):
```javascript
world.players = [];   // array of player objects
world.me = { ... };   // local player reference
```

Players join by sending a `gameInit` message; the server broadcasts `newPlayer` to all connections. Disconnection triggers `quitPlayer` broadcast.

### Turn System
Time-based (not turn-based): `Observable.Interval(roundTime * TimeSpan.TicksPerSecond)` fires every 10 seconds. There is no explicit turn-passing mechanism visible — the game appears to allow simultaneous firing within a time window, not strict alternating turns. This is a Scorched Earth convention (simultaneous turns), not a Pocket Tanks convention.

When a player's health reaches zero, the server broadcasts:
```csharp
{ type = "quitPlayer", playerId = p.id }
```
Clients remove the player from `world.players`.

### Physics
**Server-authoritative C#.** `Shot.Trace()` runs projectile simulation on the server using `LineSegment` intersection math against `Player.Shape` geometry. This is the correct architecture for a competitive game but implemented in C# — not portable to SolShot's Node.js stack.

### Room/Lobby
No rooms. Single global game world. `allConnections` is a `Dictionary<string, Connection>`. Every connected client joins the same game. Not suitable for multiple concurrent matches.

### N-Player Patterns
The `List<Player>` + `quitPlayer` broadcast pattern is directly analogous to what SolShot needs. The key idea: maintain an ordered list, remove players when they die, broadcast the removal to all surviving clients.

### Code Quality
High quality for its age (2010 hackathon). Demonstrates correct server-authoritative architecture. C# + Reactive Extensions is thoughtfully designed. Completely irrelevant technology stack for SolShot — but the concepts are sound.

**Worth borrowing:** The concept of broadcasting `playerEliminated` with a `playerId` to all survivors, who then splice that player from their local array.
**Do NOT copy:** The tech stack. The single global world (no room isolation). The time-based (simultaneous) turn model if strict alternation is required.

---

## Repo 5 — joshdaws/scorched-earth-clone

**URL:** https://github.com/joshdaws/scorched-earth-clone
**Relevance: LOW**

### Tech Stack
- **Client:** Vanilla JavaScript (ES6 modules) + HTML5 Canvas + Web Audio API
- **Backend:** Convex (cloud database/functions) for persistence — NOT real-time multiplayer
- **Mobile:** Capacitor for iOS
- **Build:** Vite

### Player Model
```javascript
// js/main.js
let playerTank = null;
let enemyTank = null;
```

Two singular variables. No array. Explicitly 1v1 (human vs AI).

`Tank` class (`js/tank.js`) is well-designed and reusable:
```javascript
new Tank({ x, y, team })   // TEAMS.PLAYER or TEAMS.ENEMY
tank.isAlive()             // health > 0
tank.isDestroyed()         // health <= 0
tank.takeDamage(amount)    // clamps at 0, fires onDestroyed()
tank.serialize()           // full state snapshot
tank.deserialize(data)     // restore from snapshot
```

`areAnyTanksFalling(tanks)` — accepts an array, suggesting the author considered multi-tank scenarios.

### Turn System
Binary state machine (`js/turn.js`):
```javascript
// PLAYER_AIM → PLAYER_FIRE → PROJECTILE_FLIGHT → AI_AIM → AI_FIRE → ...
if (currentShooter === 'player') setPhase(TURN_PHASES.AI_AIM);
else setPhase(TURN_PHASES.PLAYER_AIM);
```
Strict two-participant alternation. No elimination handling in turn logic.

### Physics
Client-side only. Standard kinematic: `vx = cos(angle) * speed`, `vy = -sin(angle) * speed`, gravity + wind applied per frame. Wind scales by round (rounds 1-3: ±5, 4-6: ±8, 7-9: ±10, 10+: ±12).

`damage.js` implements `applyExplosionToAllTanks(tanks, explosion)` — iterates through a tanks array and applies linear falloff damage:
```javascript
damage = maxDamage * (1 - distance / blastRadius)
```
Uses `distanceToRect()` for bounding-box hit detection (fairer than center-point).

### Room/Lobby
No multiplayer. Single player vs AI. Convex is used for leaderboards/persistence, not real-time game state.

### N-Player Patterns
None in practice, but `applyExplosionToAllTanks(tanks[])` and `areAnyTanksFalling(tanks[])` show the author designed the damage and physics helpers to be array-aware. These specific function signatures are worth noting.

The wind scaling-by-round pattern is interesting for tuning competitive balance in SolShot.

### Code Quality
Very high. Large, professional-quality codebase (73 files, ~280KB main.js). Clean ES6 module structure, comprehensive achievements system, level editor, touch controls, full audio. Massively over-engineered for reference purposes, but individual modules (tank.js, damage.js, wind.js, turn.js) are clean and readable.

**Worth borrowing:** `applyExplosionToAllTanks(tanks[])` signature pattern — passing the full tanks array to damage functions rather than hardcoding tank references. `distanceToRect()` for bounding-box-aware hit detection. Wind scaling by round number. `Tank.serialize()` / `Tank.deserialize()` pattern for state snapshots.
**Do NOT copy:** The 1v1 binary turn machine. Client-side physics. Convex backend (SolShot uses Socket.IO).

---

## Cross-Repo Analysis — Patterns for SolShot's N-Player Refactor

### 1. Turn Queue: Shift-Push Rotation (from Guntanks)

The cleanest pattern found across all repos. Adapt for SolShot's server-authoritative `main.js`:

```javascript
// server/socket-io/main.js — adapt room.players[]

// Current (1v1):
room.currentTurn = room.players[0].socketId === currentId ? 1 : 0;

// Target (N-player): store ordered player array
room.players = [
  { socketId, walletAddress, hp, alive: true },
  ...
];
room.activeTurnIndex = 0;   // index into room.players[]

function advanceTurn(room) {
  // Rotate: move active player to end
  room.players.push(room.players.shift());

  // Skip eliminated players
  while (!room.players[0].alive) {
    room.players.push(room.players.shift());
  }

  room.activeTurnIndex = 0;
  // Check win: only one alive
  const alive = room.players.filter(p => p.alive);
  if (alive.length === 1) return endMatch(room, alive[0]);

  startTurnTimer(room);
  io.to(room.roomId).emit('turnStart', { activePlayer: room.players[0].socketId });
}
```

### 2. Elimination: Splice from Array + Broadcast (from ScorchedCanvas + Guntanks)

```javascript
// On server when a player reaches 0 HP:
function eliminatePlayer(room, socketId) {
  const idx = room.players.findIndex(p => p.socketId === socketId);
  room.players[idx].alive = false;   // mark dead; keep in array for turn skipping
  // OR splice: room.players.splice(idx, 1);  // remove entirely

  io.to(room.roomId).emit('playerEliminated', {
    socketId,
    order: room.players.filter(p => !p.alive).length,  // 1st out, 2nd out, etc.
  });

  // Check win condition
  const alive = room.players.filter(p => p.alive);
  if (alive.length === 1) endMatch(room, alive[0]);
}
```

**Recommendation for SolShot:** Mark as `alive: false` rather than splicing. Splicing changes indices mid-turn and can cause off-by-one bugs. Keep dead players in the array, skip them in `advanceTurn`.

### 3. Win Condition: Last-Man-Standing (from Guntanks)

```javascript
// Guntanks: window.tanks.length === 1
// SolShot adaptation:
const alivePlayers = room.players.filter(p => p.alive);
if (alivePlayers.length === 1) {
  endMatch(room, alivePlayers[0]);
}
```

### 4. Damage to All Players in Blast Radius (from joshdaws)

```javascript
// joshdaws: applyExplosionToAllTanks(tanks, explosion)
// SolShot server physics adaptation:
function applyExplosion(room, blast) {
  const results = [];
  for (const player of room.players) {
    if (!player.alive) continue;
    const dist = distanceTo(blast.x, blast.y, player.x, player.y);
    if (dist < blast.radius) {
      const dmg = Math.round(blast.maxDamage * (1 - dist / blast.radius));
      player.hp = Math.max(0, player.hp - dmg);
      results.push({ socketId: player.socketId, damage: dmg, newHp: player.hp });
      if (player.hp === 0) eliminatePlayer(room, player.socketId);
    }
  }
  return results;
}
```

SolShot's `server/services/physics.js` already handles blast damage but likely only for 2 players. This is the key change needed there.

### 5. Round Boundary Detection (from Guntanks)

```javascript
// Guntanks: turnCounter % tanks.length === 0
// SolShot: detect when all alive players have taken one turn
room.turnsThisRound++;
if (room.turnsThisRound >= room.players.filter(p => p.alive).length) {
  room.turnsThisRound = 0;
  room.roundNumber++;
  // Round-end events: wind change, etc.
}
```

### 6. Lobby: N-Player Ready Check (extending Amankumar321 pattern)

```javascript
// Amankumar321 (2-player):
if (room.host.isReady && room.player.isReady) io.emit('startGame')

// N-player adaptation:
room.players[idx].isReady = true;
const allReady = room.players.every(p => p.isReady);
if (allReady && room.players.length >= 2) {
  io.to(room.roomId).emit('startGame', { players: room.players.map(p => p.publicData()) });
}
```

---

## What NOT to Copy

| Pattern | Repo | Reason |
|---------|------|--------|
| `Math.random()` room IDs | Amankumar321 | Predictable, exploitable — SolShot already uses `crypto.randomBytes` |
| Client-authoritative physics | Amankumar321, tymochko, joshdaws | Exploitable in a wagered game — SolShot's server physics is the correct architecture |
| Copy-paste disconnect/leave/delete handlers | Amankumar321 | DRY violation — SolShot already has a single `cleanupRoom()` utility |
| Global connections array for matching | tymochko | No room isolation, O(n) scan for every message |
| `window.*` globals for game state | Guntanks | Fine for local, disastrous for server |
| `tank1`/`tank2` named fields | Amankumar321, tymochko | Cannot extend to N; use `players[]` array |
| AngularJS framework | tymochko | EOL 2021 |
| Single global game world | ScorchedCanvas | No concurrent match isolation |
| In-memory `verifiedBurnTxs` without TTL | (SolShot) | Already noted as acceptable for devnet; needs fix for mainnet |

---

## Recommended Action Plan for SolShot N-Player Refactor

Based on this research, the following changes are needed. No external code needs to be copied wholesale — the patterns inform the design.

### Server (`server/socket-io/main.js`)

1. **Replace `room.host`/`room.player` with `room.players[]`** — array of player objects `{ socketId, walletAddress, hp, alive, isReady, turnsTaken }`.
2. **Add `room.activeTurnIndex`** — integer index into `room.players[]`.
3. **Write `advanceTurn(room)`** — shift-push rotation, skip dead players, detect win on `alive.length === 1`. Borrow directly from Guntanks `startTurns()` logic.
4. **Write `eliminatePlayer(room, socketId)`** — mark `alive: false`, emit `playerEliminated`, check win condition. Borrow broadcast pattern from ScorchedCanvas `quitPlayer`.
5. **Update `physics.js` blast damage** — iterate `room.players.filter(p => p.alive)` instead of checking two hardcoded targets. Borrow array-iteration signature from joshdaws `applyExplosionToAllTanks`.
6. **Update join/ready logic** — `every(p => p.isReady)` instead of `host.isReady && player.isReady`.
7. **Parameterize `minPlayers`/`maxPlayers`** per match mode (Practice=1, QuickMatch=2, Duel=2, HighRoller=2-4).

### Client (Phaser scenes + React)

1. **Replace `tank1`/`tank2` with `tanks[]` array** — build from `room.players` list received at game start.
2. **Listen for `playerEliminated`** — remove/hide that tank sprite, update HUD.
3. **Listen for `turnStart` with `activePlayer` ID** — highlight active tank, enable/disable controls.
4. **Update HUD** — show all N player HP bars (Guntanks renders all tank health bars in `render()`).

### Escrow (Phase 2A)

- Multi-player escrow needs re-evaluation: the current `create_match` / `deposit_wager` / `settle_match` is 2-party. For 3-4 players, the PDA structure and settlement math need extension.
- This is out of scope for the initial N-player client/server refactor — suggest implementing 2-player wagers with N-player free/practice modes first.

---

*Research complete. All code snippets verified by reading raw GitHub source files.*
