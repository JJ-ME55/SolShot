# Phase 18: Client Phaser and GameBridge - Research

**Researched:** 2026-02-26
**Domain:** Phaser 3 MainScene refactor (N-player tanks[]), GameBridge state shape migration, elimination visuals, spectator camera
**Confidence:** HIGH — all findings from direct codebase inspection + local Phaser 3.55.2 build verification

---

## Summary

Phase 18 migrates the client Phaser scene (MainScene) and GameBridge from their current hardcoded 2-player assumption (`tank1`/`tank2`) to an N-player `tanks[]` array. The server (Phase 16-17) already emits complete N-player payloads (`turnResult.players[]`, `terrainGenerated.positions[]`, `playerEliminated`), but the client currently reads backward-compat shims (`tankPositions.host/player`). This phase removes those shims on the client side.

The research reveals the migration scope is larger than just MainScene: the `Tank` class constructor registers hardcoded `opponentStep*` and `opponentPowerChange` socket listeners that assume exactly 2 players, and `Turret` references `scene.tank1`/`scene.tank2` by name. Both classes need surgery. However, the plan breakdown into 18-01 (MainScene + Tank) and 18-02 (GameBridge) cleanly contains the work.

Phaser 3.55.2's `cameras.main.zoomTo(zoom, duration, ease)` and `cameras.main.pan(x, y, duration, ease)` are confirmed available in the local node_modules build. The spectator zoom-out is straightforward — no new libraries needed.

**Primary recommendation:** Build tanks[] as an array of Tank instances indexed to `room.players[]` order. The "my tank" concept is expressed via `myPlayerIndex` (derived from socket.id lookup against `terrainGenerated.positions[]`). All scene methods that reference `tank1`/`tank2` become `tanks[i]` loops or `tanks[myPlayerIndex]` lookups.

---

## Standard Stack

No new libraries needed. Phase 18 uses only:

### Core (already in project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| phaser | ^3.55.2 | Game engine — tanks, terrain, camera, tweens | Installed |
| React | (existing) | GameBridge → HUD state propagation | Installed |
| Socket.IO client | (existing) | Server event reception (turnResult, playerEliminated) | Installed |

### Phaser Camera API (confirmed in local build)
| Method | Signature | Available Since |
|--------|-----------|----------------|
| `cameras.main.zoomTo` | `(zoom, duration, ease, force, callback, context)` | Phaser 3.11.0 |
| `cameras.main.pan` | `(x, y, duration, ease, force, callback, context)` | Phaser 3.11.0 |
| `cameras.main.setZoom` | `(zoom)` | Phaser 3.0.0 |

**Installation:** None required — all dependencies already present.

---

## Server Payload Shapes (What Phase 18 Must Consume)

These are the exact N-player event payloads emitted by Phase 16-17 server code. Phase 18 must read these instead of the 2-player shims.

### `terrainGenerated` (main.js line ~2653)
```javascript
{
  path,
  heightmap,
  positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
  // SHIM (still present, do not use in phase 18):
  tankPositions: { host: room.players[0]?.pos, player: room.players[1]?.pos, hostId: ... },
  seed,
  wind,
  firstTurn: ms.currentTurn,  // socket.id of first player
  seq,
}
```

**Key:** `positions[]` is ordered to match `room.players[]`. The local player's index is found by `positions.findIndex(p => p.socketId === socket.id)`.

### `turnResult` (main.js line ~2245)
```javascript
{
  playerId,     // socket.id of who fired
  weaponId,
  trajectory,
  impact,
  damage,
  terrainUpdate,
  scores,
  hp,           // { [socketId]: hpValue } for all players
  nextTurn,     // socket.id of next active player
  seq,
  goldBalance,
  // N-PLAYER CANONICAL:
  players: ms.players.map(id => ({
    socketId: id,
    pos: slot.pos,
    hp: ms.hp[id],
    alive: ms.alive[id],
  })),
  alive,                  // { [socketId]: boolean }
  currentPlayerIndex,     // ms.currentPlayerIndex (0-based index into ms.players[])
  positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
  // SHIM (still present, do not remove from server — remove from client reads):
  tankPositions: { host: ..., player: ..., hostId: ... },
}
```

### `playerEliminated` (main.js line ~2221)
```javascript
{
  eliminatedId,           // socket.id of eliminated player
  killedById,             // socket.id of killer (null for timeout)
  survivingPlayers,       // array of socket.ids still alive
  reason,                 // 'timeout' | undefined (combat)
}
```

### `shopEnd` → `screenData` in BattleScreen
Currently sends `hostWeapons`, `playerWeapons`, `weaponsByPlayer` to ShopScreen which builds `player1`/`player2` for MainScene init. Phase 18 needs to read `weaponsByPlayer` (keyed by socketId) to assign weapons to each tank slot.

**Current ShopScreen.js navigate call:**
```javascript
navigate('battle', {
  gameType: 3,
  hostId: hostInfo.socketId,
  player1: { name, color, weapons: data.hostWeapons },  // host
  player2: { name, color, weapons: data.playerWeapons }, // joiner (N>2: missing!)
  wager, goldBalance, round, totalRounds,
});
```

**Problem:** `player1`/`player2` only covers 2 players. For N>2, ShopScreen must be updated to pass `players[]` array. However, ShopScreen is not explicitly in Phase 18's plan boundary. The plan breakdown says 18-01 handles MainScene refactor. The cleanest approach: BattleScreen reads `screenData.players[]` if available, falls back to `player1`/`player2` for 2-player compat. ShopScreen update is a dependency that may need to be included in 18-01 or confirmed as already done.

**Check:** `data.weaponsByPlayer` is already emitted in `shopEnd` (main.js line 329) — this is the N-player weapons map keyed by socketId.

---

## Architecture Patterns

### Recommended tanks[] Structure in MainScene

```javascript
// MainScene constructor
constructor() {
  super('main-scene');
  this.tanks = [];          // replaces tank1, tank2
  this.myPlayerIndex = -1;  // which tanks[i] is me
  this.currentPlayerIndex = 0; // whose turn it is
  this._eliminated = {};    // { [index]: boolean } for wreckage display
  // ... existing fields unchanged
}
```

### Pattern 1: createTanks(N) — Initialize N Tanks

```javascript
createTanks = (N) => {
  // Clean up any existing tanks
  this.tanks.forEach(t => { try { t.destroy(); } catch (_) {} });
  this.tanks = [];

  for (let i = 0; i < N; i++) {
    const t = new Tank(this, i + 1);  // id=1..N (matches texture key 'tank1','tank2'...)
    t.setDepth(-2);
    this.tanks.push(t);
  }
};
```

**Note:** Tank constructor uses `id` for its canvas texture key (`'tank' + id`). IDs 1..N work fine for up to 4 tanks.

### Pattern 2: terrainGenerated Handler — N-Player

```javascript
// In handleType3():
this._socketHandlers.terrainGenerated = ({ path, heightmap, positions, firstTurn, wind, seq }) => {
  this._serverHeightmap = heightmap;
  this._turnSeq = seq || 0;
  this.wind = wind || 0;
  this.terrain.setPath(path);

  // Find my index
  this.myPlayerIndex = positions.findIndex(p => p.socketId === socket.id);

  // Position all tanks from positions[]
  positions.forEach((p, i) => {
    const tank = this.tanks[i];
    if (!tank || !p.pos) return;
    tank.setPosition(p.pos.x, p.pos.y);
    const rotation = this.terrain.getSlope(p.pos.x, p.pos.y);
    if (rotation !== undefined) tank.setRotation(rotation);
    tank.enablePhysics();
  });

  // Set turn
  this.currentPlayerIndex = positions.findIndex(p => p.socketId === firstTurn);
  this._activateCurrentTank();
  this.showTurnPointer();
  this._pushStateToBridge();
  if (this._bridge) { this._bridge._readyFired = true; this._bridge.notifyReady(); }
};
```

### Pattern 3: applyTurnResult — N-Player

```javascript
applyTurnResult = (data) => {
  const { terrainUpdate, nextTurn, goldBalance } = data;

  // 1. Terrain sync
  if (terrainUpdate?.length > 0) {
    this._serverHeightmap = terrainUpdate;
    this.terrain.applyHeightmap(terrainUpdate);
  }

  // 2. HP from server — iterate data.players[]
  if (data.players) {
    data.players.forEach((p, i) => {
      const tank = this.tanks[i];
      if (tank?.scoreHandler) {
        const oldHp = tank.scoreHandler.hp;
        tank.scoreHandler.hp = Math.max(0, p.hp);
        if (i === this.myPlayerIndex && p.hp < oldHp) {
          window.haptic && window.haptic.heavy();
        }
      }
    });
  }

  // 3. Position sync from data.positions[]
  if (data.positions) {
    data.positions.forEach((p, i) => {
      const tank = this.tanks[i];
      if (!tank || !p.pos) return;
      const snapY = this._serverHeightmap
        ? (this._serverHeightmap[Math.min(1199, Math.max(0, Math.floor(p.pos.x)))] || p.pos.y) - 15
        : p.pos.y;
      tank.setPosition(p.pos.x, snapY);
    });
  }

  // 4. Gold
  if (goldBalance && socket) {
    const myGold = goldBalance[socket.id];
    if (myGold !== undefined && this._bridge) {
      this._bridge.updateState({ gold: myGold });
    }
  }

  // 5. Next turn
  if (nextTurn) {
    const positions = data.positions || [];
    this.currentPlayerIndex = positions.findIndex(p => p.socketId === nextTurn);
    if (this.currentPlayerIndex === -1) this.currentPlayerIndex = 0;
  }

  this._activateCurrentTank();
  this.showTurnPointer();
  this._pushStateToBridge();
};
```

### Pattern 4: checkSwitchTurn — Any Tank Settled

Current code checks only `this.tank1.settled` and `this.tank2.settled`. N-player version:

```javascript
checkSwitchTurn = () => {
  if (this.terrain.animate === true) return;
  if (this.terrain.blastArray.length !== 0) return;
  if (this.gameOver === true) return;

  // Check all alive tanks settled
  const unsettled = this.tanks.filter((t, i) => !this._eliminated[i] && !t.settled);
  if (unsettled.length > 0) {
    if (!this._settleWaitStart) {
      this._settleWaitStart = Date.now();
    } else if (Date.now() - this._settleWaitStart > 3000) {
      this.tanks.forEach(t => { t.settled = true; t.body.stop(); t.body.setGravity(0); });
      this._settleWaitStart = null;
    }
    return;
  }
  this._settleWaitStart = null;

  // Multiplayer: apply pending result once settled
  if (this.sceneData.gameType === 3) {
    if (this.pendingTurnResult) {
      if (this._turnResultCooldown > 0) { this._turnResultCooldown--; return; }
      const isMyShot = (this.pendingTurnResult.playerId === window.socket?.id);
      const myTank = this.tanks[this.myPlayerIndex];
      const weaponDone = isMyShot
        ? (myTank?.turret && myTank.turret.activeWeapon === null)
        : true;
      if (weaponDone) {
        this._weaponWaitLogged = false;
        this.applyTurnResult(this.pendingTurnResult);
        this.pendingTurnResult = null;
      }
    }
    return;
  }
  // type4 practice: not needed for N-player scope
};
```

### Pattern 5: _activateCurrentTank()

```javascript
_activateCurrentTank = () => {
  this.tanks.forEach((t, i) => {
    t.active = (i === this.myPlayerIndex && i === this.currentPlayerIndex);
    // Reset moves for the newly active tank
    if (i === this.currentPlayerIndex) t.movesRemaining = 4;
  });
};
```

### Pattern 6: playerEliminated Handler

```javascript
this._socketHandlers.playerEliminated = ({ eliminatedId, killedById }) => {
  const positions = this._lastPositions || [];
  const idx = positions.findIndex(p => p.socketId === eliminatedId);
  if (idx !== -1) {
    this._eliminated[idx] = true;
    this._playEliminationEffect(idx, eliminatedId, killedById);
  }
  // If I was eliminated — enter spectator mode
  if (eliminatedId === socket.id) {
    this._enterSpectatorMode(idx + 1); // placement = how many are left + 1
  }
};
```

### Pattern 7: showTurnPointer — Index-Based

```javascript
showTurnPointer = () => {
  const tank = this.tanks[this.currentPlayerIndex];
  if (!tank) return;
  this.hideTurnPointer();
  // ... same canvas drawing as current, just use tank variable
  this.turnPointer = this.add.image(tank.x, tank.y - 45, 'turn-pointer');
  // ... tween
};
```

### Anti-Patterns to Avoid

- **tank1/tank2 references anywhere in MainScene:** All must become `tanks[i]` — use `myPlayerIndex` for "my tank" access.
- **isHost for perspective:** Don't re-derive `isHost`. Use `myPlayerIndex` from `positions[]` lookup. `myPlayerIndex === 0` happens to be true for host but is not the authority.
- **`opponentStepLeft/Right` socket listeners in Tank.create():** These hardcode the 2-player model (`this === this.scene.tank2`). Phase 18 must remove these from Tank.js and move movement relay into MainScene's N-player handler.
- **`opponentAngleChange` in Turret.create():** Same problem — `this.tank === this.scene.tank2` check. Remove from Turret; show aim trajectory in MainScene's spectator path.
- **Physics colliders registered per-tank in Tank.create():** `scene.physics.add.collider(this, scene.leftWall)` and `rightWall` — these use `this.scene.tank2` indirectly (leftWall/rightWall already exist by this time). This pattern is fine as-is for N tanks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wreckage sprite | Custom new sprite class | `this.add.graphics()` drawn directly at tank's last position | Tank's canvas texture is already a canvas — draw a darkened version procedurally, same pattern as `createBackground()` |
| Elimination kill text overlay | DOM overlay | `this.add.text()` with a Phaser tween for fade | Phaser text lives in canvas layer, auto-cleaned up — React overlay requires bridge event |
| Spectator zoom | Custom camera interpolation | `this.cameras.main.zoomTo(zoom, duration, ease)` | Confirmed available in Phaser 3.11.0+ / 3.55.2 local build |
| Spectator "YOUR TURN" flash | CSS animation | `this.add.text()` with tween alpha + scale | Same rendering layer as other Phaser text |
| "You placed Nth" banner | Phaser text | React state via bridge `notifyEliminated(placement)` callback | Stays visible indefinitely while spectating — easier in React than a persistent Phaser text |
| Player name labels | Phaser.GameObjects.Text per tank | Phaser `this.add.text()` updated in `update()` loop | Labels must track tank position every frame |
| Arrow indicator | New asset | `this.add.graphics()` drawn as downward arrow triangle | Current `showTurnPointer` already uses `add.image` with canvas — same pattern works |

**Key insight:** All in-canvas overlays (kill text, wreckage, name labels, arrow) should use Phaser drawing primitives. Persistent React overlays (placement banner, Leave Match button) should go through GameBridge callbacks, since they outlive the current animation frame.

---

## Common Pitfalls

### Pitfall 1: Tank.js Hardcoded Socket Listeners

**What goes wrong:** Tank.create() registers `socket.on('opponentStepLeft', ...)` with guard `this !== this.scene.tank2`. When `tank2` doesn't exist (N>2), all tanks match or none match, causing every tank to animate or none to.

**Why it happens:** Tank.js was written for 2-player before N-player existed.

**How to avoid:** Remove `opponentStep*` and `opponentPowerChange` listeners from Tank.create(). Register equivalent N-player handlers in MainScene.handleType3() where the full tanks[] array is available. Movement relay: server-authoritative path (Phase 16 complete) means the opponent's tank DOESN'T animate step-by-step — the position is snapped from `turnResult.positions[]`. The `opponentStep*` handlers can simply be deleted (they're a 2-player client-side animation artifact that predates server-authoritative physics).

**Warning signs:** Multiple tanks moving when one player steps.

### Pitfall 2: Turret.js References scene.tank1/tank2

**What goes wrong:** `Turret.create()` registers `socket.on('opponentAngleChange', ...)` checking `this.tank === this.scene.tank2`. In N-player, only `tanks[1]`'s turret shows aim for opponents. Opponents' tanks 3 and 4 never show aim.

**How to avoid:** Remove `opponentAngleChange` from Turret.create(). For spectator aim trajectory: the CONTEXT.md decision says spectators CAN see the active player's aim. Implement this as a dotted line drawn in MainScene from the active tank's turret position, visible only when `myPlayerIndex !== currentPlayerIndex && this._eliminated[myPlayerIndex]` (i.e., I am spectating). The `emitRotation` guard `this.tank === this.scene.tank1` also breaks — replace with `this.tank === this.tanks[this.myPlayerIndex]`.

**Warning signs:** Aim trajectory not shown for spectators; multiple turrets emitting `angleChange` events.

### Pitfall 3: myPlayerIndex Derived Before positions[] Is Available

**What goes wrong:** `myPlayerIndex` is computed from `positions.findIndex(p => p.socketId === socket.id)`. If `positions[]` hasn't arrived yet (e.g., during `create()` before `terrainGenerated`), `myPlayerIndex` defaults to `-1`, causing `tanks[-1]` (undefined) to be referenced as "my tank."

**How to avoid:** Store `myPlayerIndex = -1` in constructor. All code that uses `myPlayerIndex` must guard `if (this.myPlayerIndex < 0) return`. The tank is not active until `terrainGenerated` fires and sets a valid index.

**Warning signs:** Controls fire for index -1; `this.tanks[-1]` undefined errors.

### Pitfall 4: Tank Texture Key Collision

**What goes wrong:** Tank constructor does `if (scene.textures.exists('tank' + id)) scene.textures.remove('tank' + id)`. For a 4-player match after round 1, `createTanks(4)` creates textures `tank1` through `tank4`. Round 2 calls `createTanks(4)` again — texture removal works correctly. But if `id` values change between rounds, orphaned textures remain.

**How to avoid:** Use consistent ids 1..N always. Call `createTanks(N)` once in `create()` (not per-round), and rely on `Tank.create(color, name)` being called to re-initialize visuals each round without destroying the Tank object.

**Warning signs:** "Texture already exists" Phaser warnings; previous tank sprite showing wrong color.

### Pitfall 5: checkSwitchTurn settle-timeout Uses Wrong Tank References

**What goes wrong:** Current code force-settles `this.tank1` and `this.tank2` explicitly. After migration, if the settle loop doesn't cover all N tanks, some tanks settle while others remain stuck.

**How to avoid:** Replace `this.tank1.settled` / `this.tank2.settled` checks with `this.tanks.every(t => t.settled || this._eliminated[i])` — skip eliminated tanks.

### Pitfall 6: screenData Still Uses player1/player2 for N>2

**What goes wrong:** ShopScreen.js navigates to battle with `player1`/`player2` shape. For 3-4 player matches, `player3` and `player4` don't exist. MainScene's `handleType3()` currently reads `sceneData.player1` and `sceneData.player2` for tank setup.

**How to avoid:** Phase 18 must update ShopScreen.js to build a `players[]` array from `weaponsByPlayer` and navigate with it. The `players[]` array can be ordered to match `room.players[]` using hostId as anchor. `screenData.players[i].weapons` feeds `tanks[i].weapons` in MainScene.

**ShopScreen currently emits:** `weaponsByPlayer` (keyed by socketId) IS in the shopEnd payload — the data is there, just not being assembled into `players[]`.

---

## Code Examples

### Wreckage Visual (Phaser graphics, no new sprite needed)

```javascript
// Source: Pattern from createBackground() — canvas-to-texture approach
_playEliminationEffect = (tankIndex, eliminatedId, killedById) => {
  const tank = this.tanks[tankIndex];
  if (!tank) return;

  const ex = tank.x;
  const ey = tank.y;

  // 1. Particle burst explosion (brief, using existing playExplosionEffect)
  this.playExplosionEffect(ex, ey, 1); // weapon 1 = big explosion radius

  // 2. Draw wreckage hull at tank's last position
  const wreckage = this.add.graphics();
  wreckage.fillStyle(0x3a2a1a, 0.85); // charred brown
  wreckage.fillRect(ex - 18, ey - 8, 36, 12); // same approximate size as tank
  wreckage.fillStyle(0x1a0a00, 0.6);
  wreckage.fillRect(ex - 10, ey - 12, 20, 6); // turret stub
  wreckage.setDepth(-2); // same depth as tanks (below blast layer)

  // 3. Destroy the tank sprite (no longer visible)
  tank.setVisible(false);
  tank.body.enable = false; // stop physics

  // 4. Kill text overlay — fades after 2 seconds
  const killerName = killedById
    ? (this.tanks.find((t, i) => this._lastPositions?.[i]?.socketId === killedById)?.name || 'unknown')
    : 'timeout';
  const eliminatedName = tank.name || 'Player';
  const msg = killedById
    ? `${eliminatedName} was eliminated by ${killerName}`
    : `${eliminatedName} was eliminated`;

  const killText = this.add.text(
    this.renderer.width / 2, this.renderer.height * 0.3,
    msg,
    { fontFamily: "'Share Tech Mono', monospace", fontSize: '18px', color: '#ff4444', stroke: '#000', strokeThickness: 3 }
  );
  killText.setOrigin(0.5, 0.5);
  killText.setDepth(20);

  this.tweens.add({
    targets: killText,
    alpha: 0,
    y: killText.y - 20,
    duration: 1800,
    delay: 800,
    ease: 'Quad.easeIn',
    onComplete: () => { try { killText.destroy(); } catch (_) {} }
  });
};
```

### Spectator Camera Zoom-Out (Phaser 3.55.2 confirmed)

```javascript
// Source: cameras.main.zoomTo confirmed at phaser.js line 75648
_enterSpectatorMode = (placement) => {
  // Zoom out to show full battlefield
  const centerX = this.renderer.width / 2;
  const centerY = this.renderer.height / 2;
  this.cameras.main.pan(centerX, centerY, 600, 'Cubic.easeOut');
  this.cameras.main.zoomTo(0.7, 800, 'Cubic.easeOut');

  // Notify React: player was eliminated, show placement banner + Leave Match button
  if (this._bridge) {
    this._bridge._onEliminated && this._bridge._onEliminated({ placement });
  }
};
```

### GameBridge State Shape (N-Player)

```javascript
// New state in GameBridge constructor and reset()
this.state = {
  players: [],      // Array<{ x, y, hp, angle, power, name, color, score, alive }>
  myPlayerIndex: -1,
  currentPlayerIndex: 0,
  isPlayerTurn: false,  // derived: myPlayerIndex === currentPlayerIndex
  isFiring: false,
  wind: 0,
  gold: 0,
  round: 1,
  totalRounds: 5,
  gameOver: false,
  moveSteps: 4,
  currentWeaponIndex: 0,
  weapons: [],
  wager: 0,
  potDisplay: 0,
  // Eliminated player state
  isEliminated: false,       // local player was eliminated
  eliminatedPlacement: null, // 'You placed 3rd'
};
```

### _pushStateToBridge (N-Player)

```javascript
_pushStateToBridge = () => {
  if (!this._bridge) return;
  const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
  const isMyTurn = myTank && myTank.active;

  const players = this.tanks.map((t, i) => ({
    x: t.x,
    y: t.y,
    hp: t.scoreHandler ? t.scoreHandler.hp : 250,
    angle: t.turret ? Phaser.Math.RadToDeg(t.turret.relativeRotation + t.rotation + Math.PI / 2) : 45,
    power: t.power || 60,
    name: t.name || '',
    color: t.color || '#ffffff',
    score: t.score || 0,
    alive: !this._eliminated[i],
  }));

  this._bridge.updateState({
    players,
    myPlayerIndex: this.myPlayerIndex,
    currentPlayerIndex: this.currentPlayerIndex,
    isPlayerTurn: !!isMyTurn,
    isFiring: myTank?.turret ? myTank.turret.activeWeapon !== null : false,
    wind: this.wind || 0,
    moveSteps: myTank ? myTank.movesRemaining : 0,
    currentWeaponIndex: myTank ? myTank.selectedWeapon : 0,
    weapons: myTank ? myTank.weapons : [],
    gameOver: this.gameOver,
  });
};
```

### GameBridge.setPlayerEliminated(index) Method

```javascript
// New bridge method called by Phaser when elimination happens
setPlayerEliminated(index, placement) {
  const players = [...this.state.players];
  if (players[index]) {
    players[index] = { ...players[index], alive: false };
  }
  const isMe = (index === this.state.myPlayerIndex);
  Object.assign(this.state, {
    players,
    isEliminated: isMe ? true : this.state.isEliminated,
    eliminatedPlacement: isMe ? placement : this.state.eliminatedPlacement,
  });
  this.dirty = true;
}
```

### GameBridge.reset() (N-Player)

```javascript
reset() {
  this.state = {
    players: [],
    myPlayerIndex: -1,
    currentPlayerIndex: 0,
    isPlayerTurn: false,
    isFiring: false,
    wind: 0,
    gold: 0,
    round: 1,
    totalRounds: 5,
    gameOver: false,
    moveSteps: 4,
    currentWeaponIndex: 0,
    weapons: [],
    wager: 0,
    potDisplay: 0,
    isEliminated: false,
    eliminatedPlacement: null,
  };
  this.dirty = true;
  this.scene = null;
}
```

### Player Name Labels (Phaser text, updated in update())

```javascript
// In MainScene.create() after createTanks():
_createNameLabels = () => {
  this._nameLabels = this.tanks.map((t, i) => {
    const label = this.add.text(t.x, t.y - 30, t.name || '', {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: t.color || '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    label.setOrigin(0.5, 1);
    label.setDepth(15);
    return label;
  });
};

// In MainScene.update():
_updateNameLabels = () => {
  this.tanks.forEach((t, i) => {
    const label = this._nameLabels?.[i];
    if (!label) return;
    label.setPosition(t.x, t.y - 30);
    // Marker for local player
    if (i === this.myPlayerIndex) {
      label.setText((t.name || '') + '\nYOU');
    }
  });
};
```

---

## State of the Art

| Old Approach | Current Approach | Changed In | Impact for Phase 18 |
|--------------|------------------|------------|---------------------|
| `this.tank1 = new Tank(this, 1)` | `this.tanks = []` array | Phase 18 | Core refactor |
| `terrainGenerated.tankPositions.host` | `terrainGenerated.positions[]` | Server Phase 16-02 | Client reads new field |
| `turnResult.tankPositions.host/player` | `turnResult.players[]` | Server Phase 16-03 | Client reads new field |
| `activeTank = 1 or 2` | `currentPlayerIndex` (0-based) | Phase 18 | Semantics change |
| `tank1 = me, tank2 = opponent` | `tanks[myPlayerIndex] = me` | Phase 18 | Perspective now via index |
| GameBridge `tank1`/`tank2` state | `players[]` array | Phase 18 | BattleHUD reads new shape |
| `isPlayerTurn` (boolean) | `myPlayerIndex === currentPlayerIndex` | Phase 18 | More expressive |
| No elimination handling on client | `playerEliminated` → wreckage + spectator | Phase 18 | New feature |

**No deprecated APIs used:** Phaser 3.55.2 `cameras.main.zoomTo`, `cameras.main.pan`, `add.graphics()`, `add.text()`, `tweens.add()` are all stable APIs available in the local build.

---

## Files to Modify

| File | What Changes | Scope |
|------|-------------|-------|
| `client/src/scenes/main/index.js` | Full N-player refactor — tanks[], myPlayerIndex, currentPlayerIndex, playerEliminated handler, spectator mode, name labels | 18-01 |
| `client/src/classes/Tank.js` | Remove `opponentStepLeft/Right`, `opponentPowerChange` socket listeners; remove `tank2` checks in `moveLeft`/`moveRight`; update `emitPower` and `autoAdjust` | 18-01 |
| `client/src/classes/Turret.js` | Remove `opponentAngleChange` listener; update `emitRotation` and `update` guards from `scene.tank1` to `scene.tanks[scene.myPlayerIndex]` | 18-01 |
| `client/src/bridge/GameBridge.js` | Replace `tank1`/`tank2` state with `players[]`, `myPlayerIndex`, `currentPlayerIndex`; add `setPlayerEliminated()`; update `reset()` | 18-02 |
| `client/src/screens/ShopScreen.js` | Build `players[]` array from `weaponsByPlayer` + player name/color info; pass to navigate() | 18-01 (dependency) |

**Files NOT touched (by explicit phase boundary):**
- `client/src/screens/battle/BattleHUD.js` — Phase 19
- `client/src/screens/battle/ScoreBoard.js` — Phase 19
- `server/socket-io/main.js` — Phase 17 complete, no changes needed

---

## Open Questions

1. **ShopScreen N-player player info for players[2] and [3]**
   - What we know: ShopScreen currently builds `hostInfo` (from room listing) and `playerInfo` (from joinRoom echo). For players 3 and 4, their name/color is received via `lobbyUpdate` events.
   - What's unclear: Does ShopScreen currently store players 3 and 4's name/color? Needs verification before writing 18-01.
   - Recommendation: Read ShopScreen.js fully in task 18-01-01 before writing — check what player data is available at shopEnd time.

2. **`opponentAngleChange` spectator aim trajectory**
   - What we know: CONTEXT.md says spectators see the active player's aim dotted line.
   - What's unclear: The current `opponentAngleChange` animates `tank2`'s turret rotation (lerp). In N-player, spectators need to see the ACTIVE player's aim, not tank2's.
   - Recommendation: Remove `opponentAngleChange` from Turret.create(). Instead, in MainScene's `update()`, if `isEliminated`, draw a dotted trajectory preview from `tanks[currentPlayerIndex].turret` to wherever the current aim points. This is cleaner than animating the turret. Alternatively, keep the lerp approach but apply it to `tanks[currentPlayerIndex]` when spectating.

3. **Backward Compatibility: 2-Player Practice Mode (gameType 4)**
   - What we know: MainScene handles `gameType === 4` (offline practice) in `handleType4()` with `tank1`/`tank2` hardcoded.
   - What's unclear: Does Phase 18 need to maintain practice mode? The CONTEXT.md is silent on practice mode.
   - Recommendation: Keep practice mode working. After the N-player migration, `handleType4()` can continue to create tanks via `createTanks(2)` and use `myPlayerIndex=0`, `currentPlayerIndex=0/1`. The same `tanks[i]` API works for 2 tanks.

---

## Sources

### Primary (HIGH confidence)
- `client/src/scenes/main/index.js` — direct inspection, full file (~1134 lines)
- `client/src/bridge/GameBridge.js` — direct inspection, full file
- `client/src/bridge/PhaserBootstrap.js` — direct inspection, full file
- `client/src/classes/Tank.js` — direct inspection, full file
- `client/src/classes/Turret.js` — direct inspection, full file
- `client/src/screens/BattleScreen.js` — direct inspection, full file
- `client/src/screens/battle/BattleHUD.js` — direct inspection, full file
- `client/src/screens/battle/ScoreBoard.js` — direct inspection, full file
- `server/socket-io/main.js` lines 2245-2278 — `turnResult` N-player payload shape
- `server/socket-io/main.js` lines 2652-2672 — `terrainGenerated` N-player payload shape
- `server/socket-io/main.js` lines 371-376, 2221-2225 — `playerEliminated` payload shapes
- `client/node_modules/phaser/dist/phaser.js` lines 75583-75651 — `camera.pan()` and `camera.zoomTo()` confirmed in local Phaser 3.55.2 build
- `.planning/phases/16-room-schema-battle-engine/16-03-SUMMARY.md` — server N-player payload decisions
- `.planning/phases/17-server-systems/17-VERIFICATION.md` — Phase 17 complete, all server gaps fixed

### Secondary (MEDIUM confidence)
- `.planning/phases/18-client-phaser-and-gamebridge/18-CONTEXT.md` — user decisions on elimination visuals, spectator UX, turn transitions, tank identity
- `client/src/screens/ShopScreen.js` — confirmed `weaponsByPlayer` available in shopEnd but players[] assembly needed

---

## Metadata

**Confidence breakdown:**
- Server payload shapes: HIGH — verified by direct grep of main.js at specific emit lines
- Tank/Turret 2-player hardcoding: HIGH — verified by direct class inspection
- Phaser camera API: HIGH — verified in local `node_modules/phaser/dist/phaser.js`
- GameBridge new shape: HIGH — derived directly from existing bridge pattern + requirements
- ShopScreen N-player gap: MEDIUM — confirmed `weaponsByPlayer` exists; actual data availability for players 3-4 needs verification in task

**Research date:** 2026-02-26
**Valid until:** Stable — no external dependency changes expected. ShopScreen open question needs runtime verification.
