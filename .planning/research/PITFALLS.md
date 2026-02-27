# Domain Pitfalls: N-Player Multiplayer Refactor

**Domain:** Refactoring binary (1v1) game to N-player (2-4) support
**Researched:** 2026-02-26 (game mechanics) / 2026-02-27 (escrow upgrade)
**Scope:** SolShot-specific — based on reading the actual codebase, not generic advice

---

## How to Read This Document

Every pitfall below is traced to a specific line or pattern in the codebase. The "Location" field tells you exactly where the problem lives so the roadmap can target the right files. Severity ratings:

- **CRITICAL** — Will break the 2-player regression guarantee or corrupt match state
- **HIGH** — Will produce wrong results silently or require a rewrite
- **MODERATE** — Will create technical debt that compounds over time
- **LOW** — Annoyance; fixable without touching core state

---

## Part A: Game Mechanics Pitfalls

---

### Pitfall 1: Binary-Wired `getNextTurn` Cannot Handle Elimination

**Severity:** CRITICAL
**Location:** `server/services/match.js` lines 136-143

```js
export function getNextTurn(matchState, hostId, playerId) {
    if (!matchState.currentTurn) {
        return crypto.randomInt(2) === 0 ? hostId : playerId;
    }
    return matchState.currentTurn === hostId ? playerId : hostId;
}
```

**What goes wrong:** This function only knows about two players. It binary-toggles between `hostId` and `playerId`. With N players, the entire turn-rotation model must change. But the deeper danger is that every caller of `getNextTurn` in `main.js` also passes exactly two IDs — `room.host.socketId` and `room.player.socketId`. If you change the signature, every call site breaks.

**Why it happens:** The function was designed for exactly two players and takes exactly two IDs as arguments. There is no concept of a player list; turn rotation is a conditional toggle.

**Call sites in main.js** (lines 443, 2117, 2495): Each one passes `hostId` and `playerId` specifically. All three must change simultaneously.

**Consequences if not addressed:** Adding a third player to the room while leaving `getNextTurn` unchanged will cause the third player to be skipped on every turn cycle. No error is thrown — the game silently treats player 3 as if they do not exist.

**Prevention:**
- Replace `getNextTurn(ms, hostId, playerId)` with `getNextTurn(ms, playerList)` where `playerList` is the ordered array of active (non-eliminated) socket IDs.
- Change the "first turn" logic from `crypto.randomInt(2) === 0 ? hostId : playerId` to `playerList[crypto.randomInt(playerList.length)]`.
- Update `turnsPerRound` from a hardcoded 20 to `N * 10` (10 turns per player per round).
- Maintain backward compatibility: when `playerList.length === 2`, behavior must be identical to current.

**Warning signs during refactor:** Any test where Player 3 never gets a turn, or where turn order is only [P1, P2, P1, P2] in a 3-player game.

**Phase:** Must be addressed before any multiplayer logic is added.

---

### Pitfall 2: `room.host` / `room.player` Binary Schema Permeates 1,800 Lines

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js` — approximately 60+ locations

The room object is: `{ host: {socketId, name, color, pos, isReady, playAgain}, player: {...} }`.

Every handler in `main.js` references `room.host` and `room.player` directly by name. Partial list of affected patterns:

```
room.host.socketId        — turn management
room.player.socketId      — turn management
room.host.pos             — physics position tracking
room.player.pos           — physics position tracking
room.host.isReady         — shop readiness
room.player.isReady       — shop readiness
room.host.playAgain       — rematch tracking
room.player.playAgain     — rematch tracking
room.player = null        — join guard in joinRoom
room.active = true        — "room full" flag (binary: 2 players = active)
```

The `reconnectExpired`, `cleanupRoom`, `handleType3` in the client scene, `rejoinRoom`, `startPick`, `shopPhase`, `shopEnd`, `turnResult`, `getOpenRooms`, `persistRoom` all use this schema.

**What goes wrong:** Every new player slot requires a new named field (`room.player2`, `room.player3`) OR a complete schema migration to `room.players[]`. The named-field approach produces combinatorial duplication. The array approach requires touching every single one of those 60+ locations simultaneously.

**Consequences:** A partial migration — some code still using `room.host`/`room.player`, some using `room.players[0]`/`room.players[1]` — will produce a system where the 2-player path is broken (crashes or missing data) and the N-player path does not yet work.

**Prevention:**
- Make the migration complete and atomic within a single phase, not spread across phases.
- Create a compatibility shim: `room.host = room.players[0]` and `room.player = room.players[1]` as getters or assigned after each mutation. This lets existing code continue working while new code uses `room.players`.
- Add a `room.maxPlayers` field (2, 3, or 4). Guard new N-player code paths behind `room.maxPlayers > 2`.
- Write the shim first, verify 2-player mode still passes, then start migrating handlers one at a time.

**Warning signs:** Any test that creates a 2-player match and shows a regression in `joinRoom`, `ready`, or `shopDone` events.

**Phase:** The shim is Phase 1. Full migration is Phase 2.

---

### Pitfall 3: `isRoundOver` Triggers on ANY Player Reaching 0 HP — Will Fire Immediately in N-Player

**Severity:** CRITICAL
**Location:** `server/services/match.js` lines 151-160

```js
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    if (matchState.hp) {
        for (const hp of Object.values(matchState.hp)) {
            if (hp <= 0) return true;
        }
    }
    return false;
}
```

**What goes wrong:** In 1v1, any player reaching 0 HP means the round is over — there is only one opponent. In 4-player, one player dying should eliminate that player from future turns, but the remaining 3 players continue. The current code ends the entire round when Player 2 of 4 reaches 0 HP.

**Related:** `getRoundWinner` (lines 203-217) compares `hostHp` vs `playerHp` — exactly two values. In N-player this needs to find the last surviving player, or the player with highest HP when turns run out.

**Consequences:** The round ends after the first elimination in any N-player match. Match feels broken. No error is thrown — it just appears that rounds end too early.

**Prevention:**
- Rename the function to make intent explicit: `isLastManStanding(matchState)` or change the semantics so `isRoundOver` means "only one player remains OR turns exhausted".
- Add an `eliminatedPlayers` set to match state. When a player reaches 0 HP, add them to `eliminatedPlayers`, remove them from the active turn rotation, and continue the round.
- Round ends when `Object.keys(ms.hp).filter(id => ms.hp[id] > 0 && !ms.eliminatedPlayers.has(id)).length <= 1`.
- For 2-player backward compatibility: with 2 players, the first elimination is also "last man standing," so behavior is identical.

**Warning signs:** In a 3-player practice match, the round ends after the first kill instead of continuing.

**Phase:** Core to any N-player battle logic.

---

### Pitfall 4: `room.active = true` Is a Binary "Room Full" Flag That Assumes Exactly 2 Players

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js` lines 1004-1006, 1060-1061, 1343

```js
var room = findRoom(roomId)
if (!room || room.active === true) return  // Join blocked if active
room.active = true  // Set immediately after joiner connects
```

**What goes wrong:** `room.active` means "room is full and match can begin." Currently it flips to `true` the moment a second player joins. For N-player, the room should only become `active` when `maxPlayers` players have joined. Until then, additional players should be permitted to join.

**Consequences:** In a 4-player room, the 3rd and 4th players get rejected with a silent `return` — the join handler exits without sending an error. The room appears permanently "full" after 2 players join even if it was configured for 4.

**Prevention:**
- Change the join guard to: `if (!room || (room.active && room.players.length >= room.maxPlayers)) return`.
- Change the "set full" logic to: `if (room.players.length >= room.maxPlayers) room.active = true`.
- Also fix `getOpenRooms` which filters by `!room.active` — partially-filled N-player rooms should appear as joinable.

**Warning signs:** In a configured 4-player room, only 2 players can join and the room disappears from the lobby list.

**Phase:** Must be fixed at the same time as the room schema migration.

---

### Pitfall 5: Simultaneous-Kill Race Condition During Splash Damage

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js` lines 2060-2080 (fire handler HP update loop)

```js
for (const [playerId, dmg] of Object.entries(result.damage)) {
    if (ms.hp[playerId] === undefined) ms.hp[playerId] = 250
    const hpBefore = ms.hp[playerId]
    ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))
    if (hpBefore > 0 && ms.hp[playerId] <= 0 && playerId !== this.id) {
        ms.kills[this.id] = (ms.kills[this.id] || 0) + 1
    }
}
```

The current code handles multi-target damage correctly in a single pass — `result.damage` can contain multiple player IDs. The danger is what happens AFTER the loop: `isRoundOver` is called, and with the current binary `getRoundWinner`, the winner logic only compares two players.

**What goes wrong specifically for N-player:** If a Crazy Ivan scatter shot kills Players 2 AND 3 of 4 in the same `result.damage` object, the `eliminatedPlayers` set must be updated before checking `isRoundOver`. If the check runs between loop iterations (it does not today — this is single-threaded JS) or if `eliminatedPlayers` is stale, the round may end with the wrong surviving player determined as winner.

**In the current 1v1 code this is not a problem** because only the opponent can be in `result.damage` and there is only one opponent. With 4 players, `result.damage` can contain 3 opponents simultaneously.

**Prevention:**
- Complete the entire HP update loop and the `eliminatedPlayers` set update before calling any `isRoundOver` or `getRoundWinner` check.
- The loop already runs synchronously in a single Node.js event loop tick, so no actual race between loop iterations. The real risk is calling `isRoundOver` after the loop with a stale "who is still alive" check.
- Add a post-loop function: `updateEliminated(ms)` that scans `ms.hp` and adds newly-dead players to `ms.eliminatedPlayers`.
- Call `updateEliminated(ms)` immediately after the HP loop, then call `isRoundOver(ms)`.

**Warning signs:** Splash weapon (Crazy Ivan, Hail Storm) kills two players in 4-player game, but kill count is credited only once, or round winner is incorrectly determined.

**Phase:** N-player battle physics phase.

---

## Part A: High Pitfalls

### Pitfall 6: Reconnection Remapping Is 100% Binary — Will Miss N-Player Slots

**Severity:** HIGH
**Location:** `server/socket-io/main.js` lines 880-930 (`rejoinRoom` handler)

```js
if (isHost && room.host) {
    // Migrate wager wallet entry, gold state, weapon inventory, match state...
    room.host.socketId = client.id
} else if (room.player) {
    // Same migration for player slot...
    room.player.socketId = client.id
}
```

The reconnect migration is entirely if/else: "is reconnecting player the host or the player?" With N players, there are 3 or 4 possible slots. The migration would need to find the correct `room.players[i]` by wallet address or old socket ID.

**Consequences:** A Player 3 of 4 who disconnects and reconnects will NOT have their socket ID remapped in `goldStates`, `weaponInventories`, `matchStates` (HP, scores, roundWins, currentTurn), or `wagerStates`. Their gold balance is orphaned under the old socket ID. If `ms.currentTurn === oldSocketId`, the turn never advances after reconnection.

**Additional complexity:** The `pendingReconnects` object stores `{ isHost: boolean }` — binary. For N-player it needs to store the player's index or role within the room.

**Prevention:**
- When migrating to `room.players[]`, store `playerIndex` or `walletAddress` in `pendingReconnects` instead of `isHost: boolean`.
- Write a single `migrateSocketId(oldId, newId, roomId)` helper that handles all in-memory state migrations at once. Apply it to all slots.
- After migration, search `ms.currentTurn` against `oldId` and update to `newId` regardless of how many players are in the room.

**Warning signs:** After P3 reconnects in a 4-player game, P3's turn is skipped or gold balance shows 0.

**Phase:** Reconnection system must be updated in the same phase as room schema migration.

---

### Pitfall 7: `turnsPerRound` Is Hardcoded to 20 (10 Per Player)

**Severity:** HIGH
**Location:** `server/services/match.js` line 101

```js
turnsPerRound: 20,   // 10 per player per round
```

**What goes wrong:** In a 4-player game, 20 turns means only 5 turns per player — a very short match. In a 3-player game, 20 turns is not evenly divisible (6.67 turns per player), so one player gets 7 turns and two get 6, or the round ends mid-cycle creating an unfair last-turn advantage.

**Consequences:** Match feels rushed and unbalanced. Not immediately obvious from logs.

**Prevention:**
- Set `turnsPerRound = N * 10` where N is player count at match creation.
- For backward compatibility: when N=2, `turnsPerRound = 20` exactly as today.
- Store player count on the match state so `isRoundOver` can use `turnsPerRound` correctly without needing the player list.

**Warning signs:** 4-player match ends after 20 turns with each player having only fired 5 times.

**Phase:** Match state initialization phase.

---

### Pitfall 8: Phaser Scene Has Two Hardcoded Tanks — `tank1` and `tank2`

**Severity:** HIGH
**Location:** `client/src/scenes/main/index.js` lines 22-23, 124-126, 171, 250-258

```js
this.tank1 = null;
this.tank2 = null;
// ...
createTank1 = () => { this.tank1 = new Tank(this, 1); }
createTank2 = () => { this.tank2 = new Tank(this, 2); }
// ...
if (!this._created || !this.terrain || !this.tank1 || !this.tank2) return;
```

The scene's `update()`, `checkSwitchTurn()`, `applyTurnResult()`, and `showTurnPointer()` all reference `this.tank1` and `this.tank2` directly. The tank position sync logic in `applyTurnResult` explicitly maps `isHost ? data.tankPositions.host : data.tankPositions.player` to `tank1` and `tank2`.

**Consequences:** A 3rd or 4th tank cannot be added without restructuring the scene. The `activeTank` integer (0, 1, or 2) would need to become a player index into a `this.tanks[]` array. The turn pointer logic (`showTurnPointer`) only knows how to point to `tank1` or `tank2`.

**Additional surface area:**
- `checkSwitchTurn` guards: `this.tank1.turret.activeWeapon === null && this.tank2.turret.activeWeapon === null`
- Force-settle: `this.tank1.settled === false || this.tank2.settled === false`
- HP sync in `applyTurnResult`: only iterates `data.hp` entries for `socket.id` (me) and the opponent

**Prevention:**
- Migrate to `this.tanks = []` array in the scene.
- `createTanks(count)` method that creates `count` Tank instances and stores in `this.tanks`.
- All hardcoded `this.tank1` / `this.tank2` references become `this.tanks[0]` / `this.tanks[myIndex]` / `this.tanks[opponentIndex]`.
- `tankPositions` payload on `turnResult` and `terrainGenerated` must change from `{ host, player }` to `{ [socketId]: {x, y} }`.

**Warning signs:** Third tank never appears on screen, or scene update() throws `Cannot read properties of null` when `this.tank3` is referenced.

**Phase:** Client scene refactor phase. Do this after server N-player is stable.

---

### Pitfall 9: `tankPositions` Payload Uses Named Fields, Not Socket IDs

**Severity:** HIGH
**Location:** `server/socket-io/main.js` line 2145-2149 (`turnResult` emit), line 2484-2485 (`requestTerrain`), `client/src/scenes/main/index.js` lines 439-443, 562-575

Server emits:
```js
tankPositions: {
    host: room.host ? { x: room.host.pos.x, y: room.host.pos.y } : null,
    player: room.player ? { x: room.player.pos.x, y: room.player.pos.y } : null,
    hostId: room.host ? room.host.socketId : null,
}
```

Client receives:
```js
const myPos = isHost ? tankPositions.host : tankPositions.player;
const theirPos = isHost ? tankPositions.player : tankPositions.host;
```

**What goes wrong:** Adding `player2`, `player3` fields to this payload is the wrong approach. The client would need conditional logic for every player count. The hostId field is already a hack to let clients identify which position belongs to them.

**Prevention:**
- Change `tankPositions` to a flat object keyed by socket ID: `{ [socketId]: {x, y} }`.
- Client uses `tankPositions[socket.id]` for own tank. All others are opponents.
- This change touches `requestTerrain` handler, `turnResult` emit, `rejoinSuccess` emit, and client `terrainGenerated` and `applyTurnResult` handlers.
- Implement this change for the 2-player case first (verify regression), then N-player follows naturally.

**Warning signs:** After refactor, own tank teleports to opponent position because `isHost` mapping is wrong.

**Phase:** Socket payload normalization — early in the refactor, before N-player.

---

### Pitfall 10: `shopReady`, `shopDone`, and `endShopPhase` Require Both Players to Be Ready

**Severity:** HIGH
**Location:** `server/socket-io/main.js` lines 1519-1523 (initialization), 1644-1649 (`shopDone` handler), 278-321 (`endShopPhase`)

```js
shopReady[client.roomId] = {
    [hostId]: false,
    [playerId]: false
}
// ...
if (hostId && playerId && ready[hostId] && ready[playerId]) {
    endShopPhase(io, client.roomId)
}
```

`endShopPhase` also hardcodes the two-player inventory build:
```js
const hostWeapons = (inventory[hostId] || [0]).map(...)
const playerWeapons = (inventory[playerId] || [0]).map(...)
io.sockets.in(roomId).emit('shopEnd', { hostWeapons, playerWeapons, ... })
```

**Consequences:** With 3 players, `shopDone` will never trigger `endShopPhase` because it only checks `ready[hostId] && ready[playerId]`. Player 3 pressing "Done" does nothing. The shop timer will fire eventually, but if the timer already ran (checking only 2 players), Player 3's inventory is not in `shopEnd`.

**Prevention:**
- Change shop readiness to check: `room.players.every(p => ready[p.socketId] === true)`.
- Change `shopEnd` to emit all player inventories: `weapons: { [socketId]: inventory[socketId] || [0] }`.
- Update client `shopEnd` handler to look up own weapons by `socket.id` rather than by `isHost` flag.

**Phase:** Shop system refactor — same phase as room schema migration.

---

### Pitfall 11: Gold Economy Inflates With More Targets

**Severity:** HIGH
**Location:** `server/services/gold.js` (design), `server/socket-io/main.js` lines 2084-2092

Current gold earn formula: +15 Gold per HP damage dealt. In 1v1, maximum damage per shot is capped by the single opponent's HP (250). In 4-player, one Hail Storm or Crazy Ivan can hit 3 opponents for up to 750 HP damage — earning 11,250 Gold in a single shot (vs. maximum ~3,750 in 1v1).

**Consequences:** Players accumulate Gold so fast in 4-player that the entire weapon catalog is purchased by round 2. The shop phase loses meaning. Weapons that were "Legendary" tier become trivially affordable.

**Prevention:**
- Divide Gold earned per turn by `(N - 1)` where N is player count, so total Gold earning rate stays comparable to 1v1 regardless of opponent count.
- Alternative: keep per-hit Gold the same but increase weapon costs proportionally for N-player matches.
- For backward compatibility: when N=2, Gold economy is unchanged.
- **Do not ignore this** — the imbalance is invisible during development (tests pass) but immediately obvious to players.

**Warning signs:** In 4-player test match, player buys the entire weapon catalog by round 1 shop phase.

**Phase:** Economy balancing phase — must ship alongside or immediately after N-player battle.

---

### Pitfall 12: `wagerStates` Tracks Two Wallets and Two Deposits

**Severity:** HIGH
**Location:** `server/socket-io/main.js` lines 1222-1225, 1349-1355, 1869-1889

```js
wagerStates[roomId] = {
    amount: wagerAmount,
    wallets: { [client.id]: walletAddress }
}
// ... later during deposit confirmation:
const hostDeposited = ws.deposits[room.host?.socketId]
const playerDeposited = ws.deposits[room.player?.socketId]
if (hostDeposited && playerDeposited) {
    // Both deposits confirmed — escrow is active
}
```

The Anchor escrow program (`programs/solshot-escrow/src/lib.rs`) has `player_one_deposited` and `player_two_deposited` booleans — it is architecturally binary. The `settle_match` instruction takes a winner and a loser.

**What goes wrong:** For N-player wager matches, escrow must hold N wagers and distribute to 1 winner. The current program cannot do this without an upgrade. The deposit confirmation check only looks for 2 deposits.

**The brief says to not break escrow even if not updated.** This means N-player wager support cannot ship without a new escrow program that supports N participants. Practice mode (wager=0) bypasses all of this entirely.

**Prevention:**
- Ship N-player in practice mode only. Wager mode remains 2-player only.
- Add a server guard: if `room.maxPlayers > 2` and `wagerAmount > 0`, reject with a clear error rather than silently corrupting state.
- When escrow is eventually upgraded for N players, the deposit confirmation loop becomes: `room.players.every(p => ws.deposits[p.socketId])`.

**Warning signs:** Attempting to create a 4-player wagered match and the escrow deposit confirmation hangs indefinitely waiting for a third deposit that is never checked.

**Phase:** Keep 2-player wager unchanged. N-player wager is a separate milestone after escrow upgrade.

---

## Part A: Moderate Pitfalls

### Pitfall 13: The 1200px Terrain Gives Inadequate Spacing for 4 Tanks

**Severity:** MODERATE
**Location:** `server/services/physics.js` lines 449-456, terrain width 1200px

```js
const hostX = Math.floor(width * 0.2 + (crypto.randomInt(1000) / 1000) * width * 0.15);
const playerX = Math.floor(width * 0.65 + (crypto.randomInt(1000) / 1000) * width * 0.15);
```

Current spawn zones: Host in [240, 420]px, Player in [780, 960]px. The gap between their closest possible positions is 360px. Tank bodies are 40px wide.

For 4 tanks equally spaced: 1200px / 4 = 300px per tank. Acceptable. But current terrain generation has high peaks and deep valleys — it is common for a terrain spike to occupy a 200px horizontal range. Two tanks spawned near a spike could be inside terrain or at the same position.

**What goes wrong:** Tanks spawn inside each other or inside terrain. Physics engine immediately flings one tank off the map at match start. With steep terrain between adjacent spawn zones, tanks may be unreachable by standard weapons.

**Prevention:**
- Divide terrain into N equal zones and spawn one tank per zone.
- Add a minimum separation check: if any two spawn X coordinates are within `minSeparation` (recommend 200px), regenerate positions.
- Validate that `heightmap[spawnX]` is below a maximum Y value (not inside a spike) before accepting the spawn.
- For N=2, the existing [0.2, 0.35] and [0.65, 0.80] zones are unchanged.

**Warning signs:** At match start, one or more tanks are visually inside the terrain or at Y=0 (top of screen, indicating they fell off the terrain surface).

**Phase:** Physics / terrain phase.

---

### Pitfall 14: `BattleHUD.js` Is Hardcoded for Exactly Two ScoreBoards

**Severity:** MODERATE
**Location:** `client/src/screens/battle/BattleHUD.js` lines 122-132

```jsx
<ScoreBoard tank={tank1} side="left" />
{/* center HUD */}
<ScoreBoard tank={tank2} side="right" />
```

The HUD renders exactly one ScoreBoard on the left and one on the right. The `ScoreBoard` component itself is fine — it renders any `tank` prop — but the layout hardcodes two positions.

**Consequences:** With 3 or 4 players, only the local player (tank1) and the first opponent (tank2) show HP bars. Players 3 and 4 are invisible in the HUD even if they exist.

The turn indicator (`'YOUR TURN' : "OPPONENT'S TURN"`) is also binary — it needs to become `'YOUR TURN' : `${opponentName}'S TURN'` or `'WAITING...'` when multiple opponents exist.

**Prevention:**
- Change `BattleHUD` to accept a `tanks[]` prop instead of `tank1`/`tank2` separately.
- Render N ScoreBoards dynamically: `{tanks.map((tank, i) => <ScoreBoard key={tank.id} tank={tank} ... />)}`.
- Use a flex layout that can accommodate 2, 3, or 4 items. For 2 players, left/right positioning is preserved. For more, display a row across the top.
- The turn label needs to name whose turn it is, not just "OPPONENT'S TURN."

**Warning signs:** In 3-player match, only 2 HP bars appear. The third player appears to have infinite health.

**Phase:** Client UI phase — after server N-player works.

---

### Pitfall 15: `isMatchOver` Hardcodes Two-Player Round Wins

**Severity:** MODERATE
**Location:** `server/services/match.js` lines 170-193

```js
export function isMatchOver(matchState, hostId, playerId) {
    const hostWins = matchState.roundWins[hostId] || 0;
    const playerWins = matchState.roundWins[playerId] || 0;
    const winsNeeded = Math.ceil(matchState.maxRounds / 2);
    // ...
}
```

This function takes exactly `hostId` and `playerId`. It checks wins for exactly two players. With N players, "match over" means a single player has won enough rounds to be declared overall champion (if using round structure) or the match ends when enough rounds are played and the player with most round wins is declared champion.

**The draw tiebreak** (`return { isOver: true, winner: hostId }`) also assumes two known IDs.

**Prevention:**
- Change signature to `isMatchOver(matchState, playerIds)` where `playerIds` is an array.
- Winner is the first player to reach `winsNeeded` round wins, or the player with most round wins after `maxRounds` are played.
- Tiebreak: use total `ms.scores` (damage dealt) as tiebreaker, then by first-to-act.

**Phase:** Match state service refactor.

---

### Pitfall 16: BO3/BO5 Round Reset Only Clears Two Players' HP

**Severity:** MODERATE
**Location:** `server/services/match.js` lines 118-126

```js
export function resetForNextRound(matchState) {
    matchState.turnCount = 0;
    matchState.turnSequence = 0;
    matchState.currentTurn = null;
    for (const playerId of Object.keys(matchState.hp)) {
        matchState.hp[playerId] = 250;
    }
}
```

The HP reset itself is fine — it iterates `Object.keys(matchState.hp)` which would handle N players if HP was initialized correctly. The problem is the HP initialization in `requestTerrain`:

```js
// server/socket-io/main.js — ms.hp is populated implicitly in the fire handler:
if (ms.hp[playerId] === undefined) ms.hp[playerId] = 250
```

HP is initialized lazily on first damage. If a player never takes damage in a round, their HP entry may be missing when `resetForNextRound` runs. For 2-player this is rarely an issue. For 4-player matches where one player is never targeted, that player's HP never appears in `ms.hp` at all.

**Consequences:** The player who is never hit has undefined HP going into round 2. The first shot against them initializes to 250, which is correct — but if `getRoundWinner` runs before they are hit, their HP is treated as 0 (from the `?? 250` fallback in the current code... actually it is correct). The real issue is `resetForNextRound` not resetting what was never initialized.

**Prevention:**
- Initialize HP for all N players at match start (in `createMatchState` or at the start of `requestTerrain`), not lazily on first damage.
- `ms.hp = { [socketId]: 250 }` for all players before the round begins.

**Phase:** Match state initialization.

---

### Pitfall 17: The Temptation to Build a `Player` Class Hierarchy

**Severity:** MODERATE
**Type:** Architecture trap, not a bug

When adding N-player support, it will be tempting to create a `Player` class or `PlayerManager` to "properly" encapsulate player state. This is almost always a mistake at this stage.

**Why it happens:** The existing code uses plain objects (`room.host`, `room.player`). Developers with OOP backgrounds see this as "messy" and want to formalize it. N-player support feels like the right time to introduce structure.

**Why it goes wrong:**
- Every socket event handler in `main.js` must be updated to use the new class API.
- The class adds indirection (`.getSocketId()`, `.setReady()`) without reducing the number of places that reference player state.
- Serialization to DB and socket payloads requires `player.toJSON()` everywhere.
- The existing code works and has been battle-tested. A Player class is a rewrite disguised as a refactor.

**What to do instead:**
- Use a plain `room.players = []` array of the same plain objects that `room.host` and `room.player` currently are.
- Add utility functions if needed: `getPlayerBySocketId(room, socketId)`, `getPlayerIndex(room, socketId)`.
- The existing plain object schema (`{ name, color, socketId, isReady, playAgain, pos }`) is sufficient. Just make it an array.

**Warning signs:** Someone proposes `class Player { constructor(...) }` in a PR for this milestone.

**Phase:** Architecture guidance for Phase 1.

---

### Pitfall 18: Testing N-Player Without N Human Testers

**Severity:** MODERATE
**Type:** Process trap

**What goes wrong:** N-player bugs are invisible with 2 clients. Turn order, elimination, gold economy imbalance, and HUD layout problems only manifest with 3+ clients. But running 3+ browser windows simultaneously against a dev server is cumbersome.

**Why it matters for this codebase specifically:** The server is single-file (`main.js`, 1800+ lines) with deeply intertwined state. It is very easy to break a code path that only runs with 3 players and not notice until manual testing.

**Prevention:**
- Write server-side integration tests for the match state machine with 3-4 mock clients. The existing test structure at `programs/solshot-escrow/tests/` uses anchor-based integration tests; the same pattern works with socket.io-client for the game server.
- Specifically test: turn order with N=3, turn order after one elimination, round end with simultaneous eliminations.
- For practice mode, create a "bot" socket that auto-fires (random angle/power) when it receives `turnResult` with its socket ID. This lets a single developer simulate a 4-player match.
- **Do not skip tests here.** The 2-player path must still pass all existing tests after the refactor.

**Phase:** Testing strategy must be defined before coding starts.

---

## Part A: Minor Pitfalls

### Pitfall 19: `positionUpdate` Validation Uses Named Slots

**Severity:** LOW
**Location:** `server/socket-io/main.js` lines 2578-2583

```js
if (room.host && room.host.socketId === client.id) {
    room.host.pos.x = clampedX
    room.host.pos.y = clampedY
} else if (room.player && room.player.socketId === client.id) {
    room.player.pos.x = clampedX
    room.player.pos.y = clampedY
}
```

With N players, this if/else misses players 3 and 4 — their position updates are silently dropped.

**Prevention:** Use `getPlayerBySocketId(room, client.id)` and update `player.pos.x`/`player.pos.y` directly.

---

### Pitfall 20: `stepLeft` / `stepRight` Validation References Named Slots

**Severity:** LOW
**Location:** `server/socket-io/main.js` lines 2606-2621 (stepLeft, similar pattern for stepRight)

```js
const isHost = room.host && room.host.socketId === client.id
const pos = isHost ? room.host.pos : (room.player ? room.player.pos : null)
```

Player 3 of 4 attempting to move will have `pos === null` and be unable to move. Silent failure.

**Prevention:** Same helper — look up the player object from `room.players` by socket ID.

---

### Pitfall 21: `persistRoom` Only Serializes `host` and `player`

**Severity:** LOW
**Location:** `server/socket-io/main.js` lines 218-245

The MongoDB persistence function builds `update.host` and `update.player` from named slots. Players 3 and 4 are not persisted. This matters for crash recovery if DB persistence is used.

**Prevention:** When migrating to `room.players[]`, update `persistRoom` to serialize `update.players = room.players.map(...)`.

---

### Pitfall 22: `failedSettlements` Recovery Uses p1wallet / p2wallet

**Severity:** LOW
**Location:** `server/socket-io/main.js` lines 104, 133-162

The settlement failure recovery stores `{ p1wallet, p2wallet }`. If extended to N players, this would need all N wallet addresses. Since N-player wager mode is not in scope for the initial milestone, this is LOW for now.

**Prevention:** If N-player wager is ever added, change `failedSettlements` entries to store `playerWallets: string[]`.

---

---

## Part B: N-Player Escrow Upgrade Pitfalls

These pitfalls are specific to modifying `programs/solshot-escrow/src/lib.rs` from 2-player to N-player and propagating that change through `server/services/escrow.js`, `server/socket-io/main.js`, and `client/src/wallet/WalletContext.js`.

**Current program state (from reading `lib.rs` and `server/idl/solshot_escrow.json`):**
- `MatchEscrow` struct: `player_one: Pubkey`, `player_two: Pubkey`, `player_one_deposited: bool`, `player_two_deposited: bool`
- `SPACE = 168` bytes
- `create_match` takes `player_one` and `player_two` as args (binary)
- `settle_match` takes `winner: Pubkey` and validates against `player_one || player_two`
- `cancel_match` and `permissionless_reclaim` have fixed `player_one` and `player_two` accounts
- PDA seeds: `["match", match_id.as_bytes()]` — same seeds work for N players, no change needed

---

### Pitfall E1: SPACE Miscalculation When Switching to Vec-Based Player Storage

**Severity:** CRITICAL
**Location:** `programs/solshot-escrow/src/lib.rs` — `impl MatchEscrow { pub const SPACE: usize = ... }`

**What goes wrong:** Replacing fixed `player_one`/`player_two` Pubkeys and boolean flags with `Vec<Pubkey>` and `Vec<bool>` changes the account size from 168 bytes to a variable amount that must be declared as a fixed upper bound at `init` time.

**The current 168-byte calculation:**
```
8  (discriminator)
36 (String match_id: 4 + 32)
32 (authority Pubkey)
32 (player_one Pubkey)
32 (player_two Pubkey)
8  (wager_lamports u64)
1  (player_one_deposited bool)
1  (player_two_deposited bool)
1  (state enum)
8  (created_at i64)
8  (activated_at i64)
1  (bump u8)
= 168
```

**The N-player calculation for `Vec<Pubkey>` (max 4 players):**
```
8  (discriminator)
36 (String match_id: 4 + 32)
32 (authority Pubkey)
4  (Vec<Pubkey> length prefix)
128 (4 * 32 for Pubkeys — max 4 players)
8  (wager_lamports u64)
4  (Vec<bool> length prefix)
4  (4 * 1 for deposited flags — max 4 players)
1  (state enum)
8  (created_at i64)
8  (activated_at i64)
1  (bump u8)
= 242 bytes
```

If SPACE is declared as 168 but the actual data serializes to 242 bytes, Anchor raises `AccountDidNotSerialize` at the first `create_match` call. There is no compile-time check — this fails at runtime on devnet.

**Why it happens:** Developers make the Rust field changes correctly but forget to update the `const SPACE` computation. The old value (168) remains in `impl MatchEscrow` without errors until first use.

**Prevention:**
- Recalculate SPACE field-by-field and include a breakdown comment (same style as existing code).
- The Anchor `#[InitSpace]` derive macro with `#[max_len(4)]` attribute handles Vec sizing automatically — use it rather than manual calculation to eliminate this class of error.
- After the first `anchor build`, run `cargo test` with the space proptest in `programs/solshot-escrow/tests/bok_proptest_space.rs` — update it to cover the new struct layout.
- The existing `bok_proptest_space.rs` tests will fail immediately if SPACE is wrong, providing early detection before devnet deploy.

**Warning signs:** `anchor build` succeeds but the first `create_match` call returns `AccountDidNotSerialize` or `AccountSizeError`.

**Phase:** Rust program redesign — first thing to verify before any other changes.

---

### Pitfall E2: `settle_match` Winner Constraint Must Be Rewritten for N-Player

**Severity:** CRITICAL
**Location:** `programs/solshot-escrow/src/lib.rs` — `SettleMatch` struct, winner constraint (line 595-599)

**Current constraint:**
```rust
#[account(
    mut,
    constraint = winner.key() == escrow.player_one
        || winner.key() == escrow.player_two
        @ EscrowError::InvalidWinner
)]
pub winner: UncheckedAccount<'info>,
```

**What goes wrong:** This constraint is hardcoded to check only `player_one` or `player_two`. With N players stored in `escrow.players: Vec<Pubkey>`, this constraint cannot be expressed as a static Anchor `constraint =` attribute because Vec iteration is not supported in Anchor constraint syntax.

The constraint must move into the instruction body:
```rust
pub fn settle_match(ctx: Context<SettleMatch>, winner: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.escrow.players.contains(&winner),
        EscrowError::InvalidWinner
    );
    // ...
}
```

**Why this matters:** Moving validation from constraint attributes into the instruction body is safe here because the check happens before any state mutation. However, this is a pattern change that deviates from the established "everything is a constraint" discipline in the current code. Document clearly why this specific check must be in-body.

**Consequences if not addressed:** The winner validation is silently removed if the old constraint is left with the old field names (`player_one`, `player_two`) that no longer exist — the code won't compile, but the error message may not be obvious.

**Prevention:**
- Add `require!(ctx.accounts.escrow.players.contains(&winner), EscrowError::InvalidWinner)` at the top of `settle_match`, before any mutable borrow or state mutation.
- Update the `/// CHECK:` comment on the `winner` account to reflect the in-body validation.
- Add a new `InvalidWinner` test case that passes a non-player pubkey as winner and verifies the instruction fails.

**Warning signs:** Rust compile error `no field player_one on type MatchEscrow` when reusing old constraint syntax.

**Phase:** Rust program redesign — same commit as the struct field migration.

---

### Pitfall E3: `cancel_match` and `permissionless_reclaim` Have Fixed Player Accounts — Cannot Refund N Players

**Severity:** CRITICAL
**Location:** `programs/solshot-escrow/src/lib.rs` — `CancelMatch` and `PermissionlessReclaim` structs

**Current pattern (fixed accounts):**
```rust
pub struct CancelMatch<'info> {
    pub escrow: Account<'info, MatchEscrow>,
    pub caller: Signer<'info>,
    pub player_one: UncheckedAccount<'info>,   // Fixed
    pub player_two: UncheckedAccount<'info>,   // Fixed
    pub config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}
```

**What goes wrong:** With N players, the Rust `#[derive(Accounts)]` struct cannot have a variable-length list of player accounts. Fixed accounts work for exactly 2. For N players, the cancel instruction must receive player accounts via `ctx.remaining_accounts`.

**The `remaining_accounts` pattern:**
```rust
pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    // Validate remaining_accounts length matches players vec
    require!(
        ctx.remaining_accounts.len() == ctx.accounts.escrow.players.len(),
        EscrowError::PlayerCountMismatch
    );
    // Validate each account matches the stored pubkey in order
    for (i, account) in ctx.remaining_accounts.iter().enumerate() {
        require!(
            account.key() == ctx.accounts.escrow.players[i],
            EscrowError::InvalidPlayer
        );
        // Only refund if this player deposited
        if ctx.accounts.escrow.deposited[i] {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **account.try_borrow_mut_lamports()? -= 0; // writable check
            **account.try_borrow_mut_lamports()? += wager_lamports;
        }
    }
    // ...
}
```

**Critical security requirement:** Every account in `ctx.remaining_accounts` must be validated against the stored `escrow.players` list before any lamport transfer. `remaining_accounts` does not go through Anchor's constraint system — validation is entirely manual. A malicious caller could pass an arbitrary account as a "player" to redirect refund lamports.

**The ordering attack:** If the server passes accounts in the wrong order (e.g., player[0] as the 2nd remaining account), the wrong player gets refunded. The on-chain validation must be positional — `remaining_accounts[i].key() == escrow.players[i]`.

**Why this matters for existing code:** `cancelMatchEscrow()` in `server/services/escrow.js` currently passes `playerOne` and `playerTwo` as named accounts. For N players, it must pass all N player wallets as `remainingAccounts`. The JS API changes from positional arguments to an array.

**Prevention:**
- In `lib.rs`: validate `remaining_accounts.len() == escrow.players.len()` before iterating.
- In `lib.rs`: validate each account's key matches `escrow.players[i]` positionally.
- In `lib.rs`: verify each remaining account is writable before attempting lamport transfer (Solana silently demotes unwritable accounts to read-only — see Pitfall E9).
- In `escrow.js`: change `cancelMatchEscrow(matchId, playerOneAddress, playerTwoAddress)` to `cancelMatchEscrow(matchId, playerAddresses: string[])`.
- Add a new error code `PlayerCountMismatch` for the `remaining_accounts.len() != players.len()` case.

**Warning signs (in Rust):** Compile error if you try to add a 3rd named `player_three` to `CancelMatch` — Anchor processes named accounts differently from remaining accounts.

**Warning signs (at runtime):** Refund goes to wrong wallet when player order in remaining accounts differs from escrow.players order.

**Phase:** Rust program redesign — the most structurally disruptive change.

---

### Pitfall E4: Transaction Size Limit When Settling or Cancelling With 4 Players

**Severity:** HIGH
**Location:** `server/services/escrow.js` — `settleMatchEscrow()` and `cancelMatchEscrow()`

**The constraint:** Solana legacy transactions are limited to 1,232 bytes. Each account address is 32 bytes. A settle or cancel transaction with 4 players includes:

```
Fixed accounts in settle_match:
- escrow PDA:   32 bytes
- authority:    32 bytes
- winner:       32 bytes
- treasury:     32 bytes
- ops:          32 bytes
- config PDA:   32 bytes
- system_prog:  32 bytes
= 224 bytes in account list

4-player cancel adds 4 remaining accounts = 4 * 32 = 128 bytes more

Plus transaction overhead (blockhash, signatures, fee payer, program ID, instruction data)
~= 450-600 bytes total for settle, ~= 550-700 bytes for cancel
```

**At 4 players this is within the 1,232-byte limit for legacy transactions.** However, if additional instructions are bundled (e.g., compute budget), it approaches the limit. The risk is **not** that 4-player escrow exceeds the limit today — it is that:

1. Future additions (e.g., adding a 5th player, adding compute budget IX) could push it over.
2. The server builds transactions using `program.methods.cancelMatch().accounts({...}).remainingAccounts([...]).rpc()` — Anchor may include additional overhead.

**What goes wrong if the limit is exceeded:** The transaction is rejected by the Solana runtime with `Transaction too large` before any instruction executes. The server logs a failed cancel, funds remain locked in the PDA, and the match cannot be resolved.

**Prevention for the current 4-player design:**
- Legacy transactions are sufficient for 4 players. Do not use Address Lookup Tables (ALTs) yet — they require v0 versioned transactions, which add client complexity.
- Cap player count at 4 in both server room creation and the Rust program — enforced via `require!(players.len() <= 4, EscrowError::TooManyPlayers)`.
- If compute budget instructions are ever needed (CU optimization), verify total TX size does not exceed 1,232 bytes with `solana-transaction-inspector` or equivalent before shipping.

**Warning signs:** Server logs `Transaction too large` or `0x172b` (transaction too large error code) during cancel or settle on devnet.

**Phase:** Rust program redesign — add the player count cap at `create_match`.

---

### Pitfall E5: Arithmetic Overflow in N-Player Settlement — u128 Widening Still Required

**Severity:** HIGH
**Location:** `programs/solshot-escrow/src/lib.rs` — `settle_match` arithmetic

**Current 2-player settlement (correct):**
```rust
let total_pot_128 = (wager_lamports as u128)
    .checked_mul(2)  // 2 players
    .ok_or(EscrowError::ArithmeticOverflow)?;
```

**What goes wrong in N-player:** The `checked_mul(2)` becomes `checked_mul(player_count as u128)`. This is still correct — `100 SOL * 4 players = 400 SOL` is well within u64 range (max ~18.4 billion SOL). But the pattern must be maintained correctly.

**The real risk is in per-player distribution:**

For a partial-deposit cancel scenario (some players deposited, some did not), each deposited player gets `wager_lamports` back — not a share of the pot. The current binary code handles this with two simple if-checks. In N-player, an iteration over `escrow.deposited` must maintain the read-before-mutable-borrow discipline or Rust will reject the code.

**The borrow checker pattern for N-player refunds:**
```rust
// WRONG — will not compile:
for (i, &deposited) in escrow.deposited.iter().enumerate() {
    if deposited {
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager;
        // Cannot borrow ctx.accounts.escrow while loop holds reference via escrow.deposited
    }
}

// CORRECT — read deposited flags into local vec first:
let deposited_flags: Vec<bool> = ctx.accounts.escrow.deposited.clone();
// ... then set terminal state (mutable borrow scope) ...
// ... then iterate deposited_flags and transfer ...
```

**Why this is specifically the N-player version of the existing borrow checker pitfall:** The 2-player version was solved by reading `player_one_deposited` and `player_two_deposited` into locals before the mutable borrow. With a Vec, cloning the entire vec before any mutation is the equivalent discipline. Skipping the clone causes a compile error that may take 10-30 minutes to diagnose.

**Prevention:**
- Read all Vec data into local variables (or clone the Vec) at the top of the instruction, before any `&mut ctx.accounts.escrow` borrow.
- Maintain the pattern comment: `// Read-only values before mutable borrow (Rust borrow checker safety)`.
- The existing `bok_proptest_fee.rs` proptest verifies fee math at all wager levels — update it to test N-player total pot calculations.

**Warning signs:** Rust compile error `cannot borrow ctx.accounts.escrow as mutable because it is also borrowed as immutable` inside the N-player refund loop.

**Phase:** Rust program redesign — must be verified by the existing BOK proptests before deploy.

---

### Pitfall E6: IDL Must Be Rebuilt and Copied After Every Struct Change

**Severity:** HIGH
**Location:** `server/idl/solshot_escrow.json` vs `target/idl/solshot_escrow.json`

**What goes wrong:** Every change to `lib.rs` — adding fields to `MatchEscrow`, adding error codes, changing instruction args — changes the generated IDL. The server uses `server/idl/solshot_escrow.json` to parse account data. If the IDL is stale:

1. `program.account.matchEscrow.fetch(escrowPDA)` returns garbled data (field offsets shift).
2. `settleMatchEscrow()` passes wrong argument types to the Anchor client.
3. `getEscrowState()` in `escrow.js` returns `playerOne`/`playerTwo` fields that no longer exist in the new struct, returning `undefined` silently.

**The failure mode is silent.** Anchor's TS client deserializes the raw bytes using field offsets from the IDL. If the IDL says `playerOne` starts at byte 44 but the new struct stores `players` Vec at byte 44, the client reads garbage data with no error thrown.

**Current sync points that must ALL be updated atomically:**
```
target/idl/solshot_escrow.json  (auto-generated by anchor build)
server/idl/solshot_escrow.json  (manual copy — consumed by escrow.js)
server/services/escrow.js       (field names: playerOne/playerTwo → players array)
client/src/wallet/WalletContext.js (discriminator constant for CS-01 validation)
```

**The CS-01 discriminator is specifically affected:** `WalletContext.js` has a hardcoded `DEPOSIT_WAGER_DISCRIMINATOR` constant derived from `sha256("global:deposit_wager")[0..8]`. The `deposit_wager` instruction name is unchanged, so the discriminator is unchanged. But if any instruction is renamed, this constant breaks silently — the client will reject all deposit transactions as "unknown instruction."

**Prevention:**
- Add an explicit deploy checklist item: `anchor build → copy target/idl/ → update server/idl/ → rebuild server → verify getEscrowState() field names match new struct`.
- The deploy sequence from `01-RESEARCH.md` applies here too: (1) anchor build, (2) anchor deploy, (3) update `declare_id!()`, (4) rebuild, (5) copy IDL, (6) update field references in escrow.js.
- After IDL copy, run `node -e "const idl = require('./server/idl/solshot_escrow.json'); console.log(idl.types.find(t=>t.name==='MatchEscrow').type.fields.map(f=>f.name))"` to visually verify field names match expectations.

**Warning signs:** `escrow.playerOne is undefined` or `escrow.players is undefined` in server logs after deploy.

**Phase:** Every phase that modifies `lib.rs` — this is a recurring hazard, not a one-time pitfall.

---

### Pitfall E7: `escrowDepositConfirm` Handler Checks `playerOneDeposited`/`playerTwoDeposited` — Binary Fields That No Longer Exist

**Severity:** HIGH
**Location:** `server/socket-io/main.js` lines 2009-2012

**Current code:**
```js
const isHost = room.players[0]?.socketId === client.id
const depositConfirmed = isHost
    ? escrowState.playerOneDeposited
    : escrowState.playerTwoDeposited
```

**What goes wrong:** After the N-player escrow upgrade, `getEscrowState()` in `escrow.js` returns an object based on the new IDL. The `playerOneDeposited` and `playerTwoDeposited` fields no longer exist — replaced by a `deposited: boolean[]` array. This code returns `undefined` for `depositConfirmed`, and the `!depositConfirmed` guard at line 2014 fires, emitting `escrowError` to every player. No deposit is ever accepted. Match cannot start.

**The `getEscrowState()` return object must change** from:
```js
{
    playerOne: escrow.playerOne.toBase58(),
    playerTwo: escrow.playerTwo.toBase58(),
    playerOneDeposited: escrow.playerOneDeposited,
    playerTwoDeposited: escrow.playerTwoDeposited,
    // ...
}
```
to:
```js
{
    players: escrow.players.map(pk => pk.toBase58()),
    deposited: escrow.deposited,  // boolean[]
    // ...
}
```

**All callers of `getEscrowState()` in `main.js` must be updated** to use array access instead of named fields.

**Prevention:**
- When modifying `escrow.js`'s `getEscrowState()`, grep `main.js` for all usages of `playerOneDeposited`, `playerTwoDeposited`, `playerOne`, `playerTwo` on escrow state objects.
- Replace with array-indexed access: `escrowState.deposited[playerIndex]` where `playerIndex` is the position of the current player in `room.players`.
- The `escrowActive` event at line 2050 also broadcasts `totalPot: ws.amount * 2` — this must become `totalPot: ws.amount * room.players.length`.

**Warning signs:** Server logs `Deposit not confirmed on-chain` for every player immediately after they sign the deposit transaction.

**Phase:** Server integration phase — immediately after the Rust program and IDL are updated.

---

### Pitfall E8: `buildDepositTransaction` Still Works Without Change, But `cancelMatchEscrow` and `settleMatchEscrow` Signatures Must Change

**Severity:** HIGH
**Location:** `server/services/escrow.js` — `cancelMatchEscrow()` and `settleMatchEscrow()`

**`deposit_wager` instruction:** Takes only `escrow`, `player`, `config`, `system_program`. Player count is irrelevant — each player independently signs their own deposit. `buildDepositTransaction()` needs no change. (HIGH confidence — verified by reading `lib.rs`.)

**`settle_match`:** Currently validates `winner` against `escrow.player_one || escrow.player_two`. After N-player, validation moves to instruction body (see Pitfall E2). The JS side only passes the winner pubkey — no change to `settleMatchEscrow()` JS signature needed. But the Anchor accounts object must not include `playerOne`/`playerTwo` (they no longer exist).

**`cancel_match`:** Currently passes `playerOne` and `playerTwo` as named accounts. After N-player, these become `remainingAccounts`. The JS call changes from:
```js
program.methods.cancelMatch()
    .accounts({ escrow, caller, playerOne, playerTwo, config, systemProgram })
    .rpc()
```
to:
```js
program.methods.cancelMatch()
    .accounts({ escrow, caller, config, systemProgram })
    .remainingAccounts(
        playerAddresses.map(addr => ({
            pubkey: new PublicKey(addr),
            isSigner: false,
            isWritable: true,
        }))
    )
    .rpc()
```

**The function signature of `cancelMatchEscrow` must change** — it currently takes `(matchId, playerOneAddress, playerTwoAddress)` as separate strings and must change to `(matchId, playerAddresses: string[])`.

**Every caller of `cancelMatchEscrow` in `main.js` must be updated.** Search `main.js` for `cancelMatchEscrow` — there are at least 3 call sites (deposit timeout handler, escrowDepositConfirm handler, permissionless reclaim path).

**Prevention:**
- Change the function signature first, then update all call sites. TypeScript's type system would catch this automatically — since the server uses plain JS, a grep is required.
- `grep -n "cancelMatchEscrow" server/socket-io/main.js` before making any changes — count all call sites, verify all are updated.

**Warning signs:** Server error `too many arguments` or `unexpected argument` from Anchor client when cancel is called.

**Phase:** Server integration phase.

---

### Pitfall E9: Writable Account Demotion — `remaining_accounts` Players Must Be Marked Writable

**Severity:** HIGH
**Location:** `server/services/escrow.js` — `cancelMatchEscrow()` remaining accounts construction

**What goes wrong:** Solana transactions mark each account as writable or read-only in the transaction message. When using `remaining_accounts` in Anchor, the writable flag must be set by the caller (the server building the transaction). If a player's account is marked `isWritable: false` (or defaults to false), the on-chain lamport transfer fails with `IllegalLamportChange`.

The critical subtlety: Solana's runtime can silently demote an account to read-only if it appears on the reserved accounts list, even if you marked it writable. For user wallets receiving refunds, this is not an issue — user wallets are not reserved accounts. But this pattern is worth documenting because a future change (e.g., refunding to a program-owned account) could trigger it.

**The `.remainingAccounts()` call must explicitly set `isWritable: true`** for all player refund accounts:
```js
.remainingAccounts(
    playerAddresses.map(addr => ({
        pubkey: new PublicKey(addr),
        isSigner: false,
        isWritable: true,  // REQUIRED — must be writable to receive lamports
    }))
)
```

**Prevention:**
- Always set `isWritable: true` for accounts that receive lamports.
- Add a Rust-side writability check: `require!(account.is_writable, EscrowError::AccountNotWritable)` before the lamport transfer (defensive, since Solana runtime also enforces this, but the error message will be clearer).

**Warning signs:** On-chain error `IllegalLamportChange` during cancel_match even though player addresses are correct.

**Phase:** Server integration phase — when implementing `remainingAccounts` for cancel.

---

### Pitfall E10: Program ID Must Be Updated in Three Places After N-Player Redeploy

**Severity:** HIGH
**Location:** Three synchronized locations

The N-player escrow program changes `MatchEscrow::SPACE`. This means a new program deploy is required (cannot upgrade in-place when account layout changes). The new program gets a new program ID. The ID must be updated in:

1. `programs/solshot-escrow/src/lib.rs` — `declare_id!("NEW_ID")`
2. `server/services/escrow.js` line 39 — `const PROGRAM_ID = new PublicKey('NEW_ID')`
3. Client `.env` — `REACT_APP_ESCROW_PROGRAM_ID=NEW_ID`

If any of the three are stale, different parts of the system talk to different programs. The failure modes are:

- Stale server: Server derives PDA using old program ID. PDA derivation is deterministic — wrong program ID produces wrong PDA address. All on-chain calls fail with `AccountNotFound` because the PDA doesn't exist at the new program.
- Stale client `.env`: Client's CS-01 validation in `WalletContext.js` checks `ix.programId.equals(ESCROW_PROGRAM_ID)`. With old program ID, every deposit transaction is rejected as "unexpected program."
- Stale `declare_id!()`: Anchor refuses to load the program at all with `Program ID mismatch`.

**Prevention:**
- Maintain the 3-file deploy checklist from `01-RESEARCH.md` (OC-14 pattern) — this is the same problem, recurring.
- After redeploy: `anchor build && anchor deploy` outputs the new program ID — capture it immediately, update all three locations before any testing.
- Verify with: `anchor idl fetch CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` returning the old IDL (expected) vs the new ID returning the new IDL.

**Warning signs:** Server logs `[Escrow] Program ID: CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` after redeploy — if the old ID appears, the server was not updated.

**Phase:** Deploy phase — this is a process pitfall, not a code pitfall.

---

### Pitfall E11: `deposit_wager` "All Deposited" Logic Moves From Rust to Server

**Severity:** MODERATE
**Location:** `programs/solshot-escrow/src/lib.rs` lines 224-239 + `server/socket-io/main.js`

**Current Rust pattern:**
```rust
// Both deposited → match is active
if escrow.player_one_deposited && escrow.player_two_deposited {
    escrow.state = MatchState::Active;
    escrow.activated_at = Clock::get()?.unix_timestamp;
    emit!(MatchActive { ... });
}
```

**In N-player:** The "all deposited" check becomes:
```rust
if escrow.deposited.iter().all(|&d| d) {
    escrow.state = MatchState::Active;
    // ...
}
```

This is a straightforward change in Rust. The issue is on the server side: `main.js` also tracks deposit state in `wagerStates[rid].deposits` and independently checks "all deposited" to emit `escrowActive` to clients. Both the Rust program and the server must agree on what "all deposited" means.

**If the server checks deposits before all players have joined the room** (i.e., room is still filling up), the `escrowActive` event fires too early. This can only happen if N-player wager rooms allow players to deposit before the room is full — which the current design prevents by only creating the escrow after the room is full.

**Prevention:**
- Maintain the invariant: escrow is created only after all `maxPlayers` players have joined. Do not create the escrow early.
- Confirm that `wagerStates[rid].deposits` uses `room.players.every(p => ws.deposits[p.socketId])` — not the binary `hostDeposited && playerDeposited` check (see Pitfall 12 in Part A).

**Warning signs:** `escrowActive` event emitted with only 2 of 4 players having deposited.

**Phase:** Server integration phase.

---

### Pitfall E12: `permissionless_reclaim` Must Also Accept N Player Accounts

**Severity:** MODERATE
**Location:** `programs/solshot-escrow/src/lib.rs` — `PermissionlessReclaim` struct

**Current pattern:** Fixed `player_one` and `player_two` accounts, same as `cancel_match`. For N-player, same `remaining_accounts` pattern applies.

**The DCA-02 safety guarantee** (48-hour permissionless reclaim) must work for all N players' funds, not just 2. If the Rust program is upgraded for cancel but not for permissionless_reclaim, partial funds can be stranded.

**The server's `permissionlessReclaimEscrow()` in `escrow.js`** currently takes `(matchId, playerOneAddress, playerTwoAddress)` — same signature problem as `cancelMatchEscrow`.

**Prevention:**
- Apply the same `remaining_accounts` migration to `PermissionlessReclaim` as to `CancelMatch` — they have identical structure.
- Update `permissionlessReclaimEscrow()` in `escrow.js` to accept `playerAddresses: string[]`.
- The event `MatchCancelled { refunded_one: bool, refunded_two: bool }` must become `{ refunded: Vec<bool> }` — or a count `refunded_count: u8`.

**Warning signs:** After N-player escrow upgrade, `permissionlessReclaimEscrow()` still passes only 2 addresses — 3rd and 4th player funds are not reclaimed.

**Phase:** Rust program redesign — must be done simultaneously with `cancel_match` migration.

---

### Pitfall E13: `SamePlayer` Validation Must Extend to All N Players

**Severity:** MODERATE
**Location:** `programs/solshot-escrow/src/lib.rs` — `create_match` instruction body

**Current check:**
```rust
require!(player_one != player_two, EscrowError::SamePlayer);
```

**In N-player:** The check must verify no two players are the same wallet. With 4 players, there are 6 unique pairs to check:
```rust
// Naive O(n^2) — acceptable for max 4 players:
for i in 0..players.len() {
    for j in (i+1)..players.len() {
        require!(players[i] != players[j], EscrowError::SamePlayer);
    }
}
// Also: no player equals the authority
for player in &players {
    require!(*player != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
}
```

**Why this matters:** A malicious player submitting the same wallet twice would receive a double refund on cancel. With the current binary check, this is caught. In N-player, if the check is replaced with only `players[0] != players[1]`, wallets 2 and 3 could be identical.

**Prevention:**
- Implement the O(n^2) all-pairs check. At max 4 players, this is 6 comparisons — not a compute budget concern.
- Add a test case for 4 players where players[1] == players[3] and verify `SamePlayer` is returned.

**Phase:** Rust program redesign.

---

### Pitfall E14: Windows McAfee Blocks `solana-test-validator` — Testing Escrow Changes Is Blocked

**Severity:** MODERATE
**Type:** Environment constraint

**Current state (from MEMORY.md):** `solana-test-validator` is blocked by McAfee on Windows. The existing workaround is `litesvm` for in-process tests (`programs/solshot-escrow/tests/bok_litesvm.rs`). However, `litesvm` does not support all Anchor features and may not handle the `remaining_accounts` pattern used for N-player cancel and permissionless reclaim.

**What goes wrong:** Developers write N-player cancel tests using `bok_litesvm.rs`, discover that `remaining_accounts` are not properly handled by LiteSVM, and either skip testing or ship without cancel validation.

**Alternative testing approaches:**
1. **`banks-client` (via `solana-program-test`)** — runs a local validator in-process, supports remaining_accounts. Works on Windows without requiring a separate binary.
2. **`anchor test --skip-local-validator`** against a devnet fork — requires network access, slower.
3. **devnet directly** — slowest, costs SOL, but highest fidelity.

**Prevention:**
- Before writing N-player cancel tests, verify whether `bok_litesvm.rs` can handle `remaining_accounts` by testing against a simple existing example.
- If LiteSVM fails, switch to `solana-program-test` for the cancel/reclaim tests specifically. Add it as a dev-dependency in `programs/solshot-escrow/Cargo.toml`.
- Document the testing approach in the plan file before coding starts.

**Warning signs:** LiteSVM cancel test passes with 2 players but fails to compile or panics when 3+ remaining_accounts are passed.

**Phase:** Test infrastructure phase — verify before writing cancel tests.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Room schema migration | Breaking 2-player path while converting `host`/`player` to `players[]` | Add shim getters; run 2-player tests after each commit |
| Turn system refactor | `getNextTurn` skipping eliminated players | Add `eliminatedPlayers` set before changing turn rotation |
| Battle physics | `isRoundOver` ending round on first kill | Separate "player eliminated" from "round over" — handle both independently |
| Shop system | `shopDone` never firing with 3+ players | Check all-ready via `room.players.every(...)` not binary check |
| Client scene | Tank 3+ never rendered | `this.tanks[]` migration before client N-player ships |
| HUD layout | HP bars for players 3/4 invisible | Dynamic ScoreBoard rendering, not hardcoded left/right |
| Gold economy | 4-player game trivializes weapon costs | Scale gold-per-damage by `1/(N-1)` |
| Testing | 3-player bugs invisible in 2-player tests | Add bot client that auto-fires; write explicit 3-player socket tests |
| Reconnect | P3/P4 reconnect loses all state | `migrateSocketId()` helper covers all `room.players[i]` slots |
| Wager mode (game server) | N-player wager corrupts escrow state | Hard block: `maxPlayers > 2` + `wager > 0` = server error |
| Rust struct SPACE | `MatchEscrow` size wrong after Vec fields | Field-by-field recalculation + BOK space proptest must pass |
| Rust `settle_match` | Winner constraint silently removed | Move constraint to instruction body with `players.contains()` |
| Rust `cancel_match` | Fixed accounts can't refund N players | `remaining_accounts` pattern + positional key validation |
| TX size | 4-player settle/cancel too large | Stay within 4-player limit; cap at 4 in Rust program |
| N-player arithmetic | Borrow checker fails in deposit loop | Clone Vec before mutable borrow; maintain read-before-mutate discipline |
| IDL sync | Stale IDL causes silent data corruption | Rebuild IDL + copy after every `lib.rs` change |
| Server deposit check | `playerOneDeposited` no longer exists | Update `getEscrowState()` return shape; grep all usages |
| JS cancel signature | `cancelMatchEscrow(id, p1, p2)` breaks | Change to array parameter; grep all call sites |
| Writable accounts | `remaining_accounts` not marked writable | `isWritable: true` on all refund accounts |
| Program ID | New deploy = new ID in 3 locations | OC-14 checklist: declare_id, escrow.js, .env |
| `permissionless_reclaim` | Only refunds 2 players after upgrade | Apply same `remaining_accounts` migration as `cancel_match` |
| Same-wallet validation | N-player `SamePlayer` check is partial | O(n^2) all-pairs check in `create_match` |
| Windows testing | McAfee blocks `solana-test-validator` | Use `solana-program-test` (banks-client) for N-player cancel tests |

---

## Sources

**Part A (game mechanics) — all findings from direct code reading:**
- `server/socket-io/main.js` (full file, ~2600 lines)
- `server/services/match.js` (full file, 218 lines)
- `server/services/gold.js` (full file, 115 lines)
- `server/services/physics.js` (lines 440-460, generateTankPositions)
- `client/src/scenes/main/index.js` (lines 1-650)
- `client/src/screens/BattleScreen.js` (full file)
- `client/src/screens/battle/BattleHUD.js` (full file)
- `client/src/screens/battle/ScoreBoard.js` (full file)
- `client/src/bridge/GameBridge.js` (lines 1-100)
- `client/src/bridge/PhaserBootstrap.js` (full file)

**Part B (escrow upgrade) — sources:**
- `programs/solshot-escrow/src/lib.rs` (full file, 884 lines) — HIGH confidence
- `server/services/escrow.js` (full file, 544 lines) — HIGH confidence
- `server/services/solana.js` (full file, 284 lines) — HIGH confidence
- `server/socket-io/main.js` lines 1973-2056 (escrow deposit confirmation handler) — HIGH confidence
- `client/src/wallet/WalletContext.js` (full file, 450 lines) — HIGH confidence
- `server/idl/solshot_escrow.json` (full IDL) — HIGH confidence
- `.planning/phases/01-on-chain-program-redesign/01-RESEARCH.md` — HIGH confidence (prior research)
- Anchor space documentation — MEDIUM confidence (anchor-lang.com/docs/references/space, verified Vec<Pubkey> = 4 + (32 * n))
- Solana transaction size analysis — MEDIUM confidence (1,232-byte limit confirmed across multiple sources; ~35 accounts for legacy TX)
- Helius Solana security guide — MEDIUM confidence (remaining_accounts validation patterns, writable demotion)
- OSEC lamport transfer article (2025) — MEDIUM confidence (writable demotion via reserved accounts)
- Anchor remaining_accounts documentation — MEDIUM confidence (accounts not validated by Anchor, manual validation required)

Confidence: HIGH for all escrow pitfalls traced to specific code; MEDIUM for transaction size estimates (calculated from known constants, not measured on devnet).
