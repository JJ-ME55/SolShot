# Domain Pitfalls: N-Player Multiplayer Refactor

**Domain:** Refactoring binary (1v1) game to N-player (2-4) support
**Researched:** 2026-02-26
**Scope:** SolShot-specific — based on reading the actual codebase, not generic advice

---

## How to Read This Document

Every pitfall below is traced to a specific line or pattern in the codebase. The "Location" field tells you exactly where the problem lives so the roadmap can target the right files. Severity ratings:

- **CRITICAL** — Will break the 2-player regression guarantee or corrupt match state
- **HIGH** — Will produce wrong results silently or require a rewrite
- **MODERATE** — Will create technical debt that compounds over time
- **LOW** — Annoyance; fixable without touching core state

---

## Critical Pitfalls

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

## High Pitfalls

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

## Moderate Pitfalls

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

## Minor Pitfalls

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
| Wager mode | N-player wager corrupts escrow state | Hard block: `maxPlayers > 2` + `wager > 0` = server error |

---

## Sources

All findings derived from direct code reading:
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

Confidence: HIGH — all pitfalls are traced to specific line numbers in the actual codebase, not inferred from general knowledge.
