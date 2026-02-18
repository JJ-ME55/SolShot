# SOLSHOT — REACT UI MIGRATION SPEC
## Replaces GSD Phase 5 (UI Reskin + Polish)
## Version 1.1 — With Fixes

---

## Context

SolShot's entire UI is currently rendered inside Phaser canvas (11 scenes, all drawn programmatically). The user has provided a React mockup component (v5), a design control document, and an HTML landing page that define the target visual identity: military-tech aesthetic with olive drab, khaki, bone colors, Black Ops One / Share Tech Mono / Bebas Neue fonts, noise+scanline overlays.

**Goal:** Replace all Phaser UI with React components. Phaser stays ONLY for the battle canvas (terrain, tanks, projectiles, physics). Build all 9 screens from the mockup. Drop offline modes (CPU, local 2P, practice). Drop info screens (About, Controls, Guide, Screenshots). Online multiplayer is the only game mode.

**Key Constraints:**
- NO fire emoji or lightning emoji anywhere — use text/SVG alternatives
- NO emoji in production UI per design control doc (SOLSHOT_DESIGN_CONTROL.md)
- Keep ALL existing Socket.IO events working (server is unchanged)
- `window.socket` and `window.solWallet` globals must remain
- Player name auto-generated from wallet address, color is selectable
- Game physics must NOT change — only UI layer

---

## Final Screen Inventory (10 Screens)

| # | Screen | Source | Status |
|---|--------|--------|--------|
| 1 | Loading | New | Replaces Phaser LoadingScene |
| 2 | Menu | Mockup | Replaces Scene-1 |
| 3 | Lobby | Mockup | Replaces Scene-2 + Scene-3 + Scene-4 |
| 4 | Shop | Mockup | Replaces Scene-5 |
| 5 | Battle | Mockup + Phaser | Phaser canvas + React HUD overlay |
| 6 | Win | Mockup | Replaces in-Phaser game over |
| 7 | Lose | Mockup | Replaces in-Phaser game over |
| 8 | Armory | Mockup | New (placeholder, static) |
| 9 | Prestige | Mockup | New (placeholder, static) |
| 10 | Barracks | Mockup | New (placeholder, static) |

---

## Deleted Functionality

- CPU mode (type1), local 2P (type2), target practice (type4) — all dropped
- Scene-2 mode selection — no longer needed (online only)
- Scene-3 name input — auto from wallet
- Scene-4 type1 (CPU difficulty), type2/4 (player 2 setup) — dropped
- About, Controls, Guide, Screenshots scenes — all dropped
- All `/graphics/*.js` files (canvas-drawn buttons) — replaced by React
- `classes/HUD.js`, `classes/ScrollList.js`, `classes/WeaponShopScroll.js` — replaced by React

---

## Architecture

### State Management

No Redux/Zustand. Simple React state:

- `App.js`: `useState('loading')` for current screen + `useState({})` for screen data
- `navigate(screen, data)` function passed to all screens — uses spread copies to avoid stale refs
- Socket state per-screen via `useSocket` hook (auto cleanup on unmount)
- Wallet state via existing WalletContext (already on `window.solWallet`)
- Battle state via GameBridge object with dirty-flag update pattern

### Phaser Integration (Battle Only)

- `PhaserBootstrap.js` creates/destroys Phaser game instance on demand
- `BattleScene.js` is a refactored MainScene — no HUD, no exit menu, no game-over UI
- `GameBridge.js` is a plain JS object on `window.gameState`:
  - Phaser writes tank/game state and sets `dirty = true` when state actually changes
  - React reads via `requestAnimationFrame` loop, only triggering re-render when `dirty` flag is set
  - React dispatches commands (fire, power, weapon) via bridge methods
- React HUD overlay sits on top of Phaser canvas with `pointer-events: none` (interactive elements get `pointer-events: auto`)

### Socket Event Ownership

| Screen | Events Subscribed | Events Emitted |
|--------|-------------------|----------------|
| Lobby | `setRooms`, `startPick`, `joinRoomError`, `opponentLeft` | `getRooms`, `createRoom`, `deleteRoom`, `joinRoom` |
| Shop | `shopPhase`, `buyWeaponResult`, `opponentBoughtWeapon`, `shopEnd` | `buyWeapon`, `shopDone`, `ready` |
| Battle | `turnResult`, `fireRejected`, `terrainGenerated`, `roundEnd`, `matchEnd`, `matchSettled`, `recieveTurn`, `opponentRequestTurn`, `setTerrainPath`, `opponentLeft`, `playAgain` | `fire`, `terrainPath`, `getTerrainPath`, `giveTurn`, `requestTurn`, `leaveRoom`, `playAgainRequest` |
| WalletContext | `shotInfo` | `authenticate`, `getShotInfo` |

---

## File Structure

```
src/
  App.js                          <- REWRITE (React screen router)
  index.js                        <- MINOR EDIT (keep as-is)
  index.css                       <- REWRITE (CSS vars + design system + fonts)

  components/
    Layout.js                     (Game viewport container + noise/scanline overlays)
    TopBar.js                     (Title bar + back button + wallet display)
    WalletDisplay.js              (SOL balance + SHOT balance chip)
    Button.js                     (Primary/Secondary/Gold/Disabled variants)
    WeaponCard.js                 (Weapon list item with tier color + stats)
    HealthBar.js                  (Thin colored bar)
    Timer.js                      (Countdown in Bebas Neue)
    PrestigeBadge.js              (Circular tier ring)
    Modal.js                      (Centered overlay for confirms/errors)

  screens/
    LoadingScreen.js              (Progress bar, asset preload)
    MenuScreen.js                 (Logo, 4 nav buttons, wallet, tagline)
    LobbyScreen.js                (Wager select, room list, create/join, color picker)
    ShopScreen.js                 (Gold, weapon catalog, buy, loadout, READY, timer)
    BattleScreen.js               (Phaser container + HUD overlay)
    WinScreen.js                  (Victory + SOL earned + stats + rematch)
    LoseScreen.js                 (Defeated + wager lost + stats + rematch)
    ArmoryScreen.js               (Placeholder — cosmetics tabs)
    PrestigeScreen.js             (Placeholder — rank + burn)
    BarracksScreen.js             (Placeholder — profile + stats)

  screens/battle/
    BattleHUD.js                  (Full HUD overlay container)
    AngleControl.js               (Angle display + slider)
    PowerControl.js               (Power slider + meter)
    WeaponSelector.js             (Current weapon + scroll picker)
    FireButton.js                 (FIRE CTA button)
    WindDisplay.js                (Wind direction + speed)
    ScoreBoard.js                 (Player names + health bars)
    GoldDisplay.js                (In-match gold)
    PotDisplay.js                 (SOL pot for wagered matches)
    RoundCounter.js               (Round X / Y)
    MoveCounter.js                (Steps remaining)
    ExitMenu.js                   (ESC overlay — forfeit confirm)

  hooks/
    useSocket.js                  (Socket.IO subscribe/cleanup hook)
    useGameState.js               (rAF-based poll of GameBridge with dirty flag)

  bridge/
    GameBridge.js                 (Plain object: Phaser writes, React reads, dirty flag)
    PhaserBootstrap.js            (Create/destroy Phaser game instance)
    BattleScene.js                (Refactored MainScene — physics only, no UI)

  data/
    weapons.js                    (Static weapon metadata: name, tier, cost, desc)
    tiers.js                      (Tier color map + prestige definitions)
    colors.js                     (8 tank color options)

  socket/index.js                 <- NO CHANGE
  wallet/WalletContext.js         <- MINOR EDIT (keep window.solWallet bridge)
  classes/Tank.js                 <- NO CHANGE (physics)
  classes/Terrain.js              <- NO CHANGE (physics)
  classes/Blast.js                <- NO CHANGE (physics)
  classes/BlastCache.js           <- NO CHANGE (physics)
  classes/Weapon.js               <- NO CHANGE (physics)
  classes/Turret.js               <- NO CHANGE (physics)
  classes/Collider.js             <- NO CHANGE (physics)
  classes/Score.js                <- NO CHANGE (physics)
  classes/Tween.js                <- NO CHANGE (physics)
  classes/Computer.js             <- DELETE (CPU mode dropped)
  classes/HUD.js                  <- DELETE (replaced by React)
  classes/ScrollList.js           <- DELETE (replaced by React)
  classes/WeaponShopScroll.js     <- DELETE (replaced by React)
  classes/WebFontFile.js          <- DELETE (fonts via CSS now)
  weapons/                        <- NO CHANGE (weapon definitions stay)
  graphics/*.js                   <- ALL DELETE (canvas buttons replaced)
  scenes/                         <- ALL DELETE after migration
```

---

## Critical Fixes (Applied to Original Plan)

### Fix 1: useSocket Hook — Stale Closure Prevention

The original `useSocket` hook used an empty dependency array, meaning the callback would be stale if it referenced any React state. Fixed with a ref-based pattern:

```javascript
import { useEffect, useRef } from 'react';

function useSocket(event, callback) {
  const savedCallback = useRef(callback);

  // Update ref on every render so callback always has fresh state
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    const handler = (...args) => savedCallback.current(...args);
    window.socket.on(event, handler);
    return () => window.socket.off(event, handler);
  }, [event]);
}

export default useSocket;
```

**Why this matters:** Without this fix, socket event handlers would capture stale state values from when the component first mounted. For example, if the Shop screen received a `buyWeaponResult` event, the handler would reference the initial `gold` state (1000) instead of the current value. This ref pattern ensures the callback always sees the latest state.

### Fix 2: GameBridge — Dirty Flag Instead of 60fps Blind Polling

The original plan used `setInterval` at 60fps to poll GameBridge and call `setState`, which would trigger 60 React re-renders per second even when nothing changed. Fixed with a dirty-flag + `requestAnimationFrame` pattern:

```javascript
// bridge/GameBridge.js
class GameBridge {
  constructor() {
    this.state = {
      tank1: { x: 0, y: 0, hp: 100, angle: 45, power: 50 },
      tank2: { x: 0, y: 0, hp: 100, angle: 45, power: 50 },
      activeTank: null,
      wind: 0,
      gold: 0,
      round: 1,
      totalRounds: 5,
      gameOver: false,
      moveSteps: 0,
      currentWeaponIndex: 0,
      weapons: [],
      isPlayerTurn: false,
      isFiring: false,
    };
    this.dirty = false;
    this._onGameOver = null;
    this._onRoundEnd = null;
    this._onMatchEnd = null;
  }

  // Phaser calls this in update() — only when state actually changed
  updateState(partial) {
    Object.assign(this.state, partial);
    this.dirty = true;
  }

  // React calls this to check + consume dirty flag
  consume() {
    if (!this.dirty) return null;
    this.dirty = false;
    return { ...this.state };
  }

  // Commands from React to Phaser
  fire() { /* dispatch to Phaser scene */ }
  setPower(v) { this.state.power = v; this.dirty = true; }
  setAngle(v) { this.state.angle = v; this.dirty = true; }
  selectWeapon(idx) { this.state.currentWeaponIndex = idx; this.dirty = true; }
  moveLeft() { /* dispatch to Phaser scene */ }
  moveRight() { /* dispatch to Phaser scene */ }
  exit() { /* dispatch to Phaser scene */ }

  // Callbacks for Phaser to notify React of game events
  set onGameOver(fn) { this._onGameOver = fn; }
  set onRoundEnd(fn) { this._onRoundEnd = fn; }
  set onMatchEnd(fn) { this._onMatchEnd = fn; }
}

export default GameBridge;
```

```javascript
// hooks/useGameState.js
import { useState, useEffect, useRef } from 'react';

function useGameState(bridge) {
  const [gameState, setGameState] = useState(bridge?.state || {});
  const rafRef = useRef(null);

  useEffect(() => {
    if (!bridge) return;

    const poll = () => {
      const updated = bridge.consume();
      if (updated) {
        setGameState(updated);
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [bridge]);

  return gameState;
}

export default useGameState;
```

**Why this matters:** React only re-renders when `bridge.consume()` returns non-null (i.e., state actually changed). During idle turns where nothing is happening, zero re-renders occur. During projectile flight, Phaser updates at 60fps but only the properties that change (trajectory position) trigger re-renders. This prevents React perf degradation.

### Fix 3: Shop Timer Sync — Handle Late Joins

The original plan didn't address how the shop timer handles late joins where the countdown is already partway through:

```javascript
// In ShopScreen.js
useSocket('shopPhase', (data) => {
  setWeapons(data.weapons);
  setGold(data.goldBalance);

  // Server sends shopStartTime (unix ms) and shopDuration (ms)
  // Calculate remaining time accounting for network delay
  const elapsed = Date.now() - data.shopStartTime;
  const remaining = Math.max(0, data.shopDuration - elapsed);
  setTimeRemaining(Math.ceil(remaining / 1000));
});
```

**Why this matters:** Without this, if a player's client loads slowly or reconnects, they'd see 30s on the timer even if the shop phase started 10s ago. The server should send `shopStartTime` in the `shopPhase` event, and the client calculates remaining time locally.

### Fix 4: BattleScene — No removeAllListeners()

The original MainScene code likely calls `socket.removeAllListeners()` in `destroy()` or `shutdown()`. This would nuke WalletContext listeners and any other global socket handlers. The BattleScene refactor MUST use specific `socket.off(event, handler)` calls instead:

```javascript
// WRONG — nukes everything
destroy() {
  window.socket.removeAllListeners();
}

// CORRECT — clean up only our handlers
destroy() {
  window.socket.off('turnResult', this.handleTurnResult);
  window.socket.off('roundEnd', this.handleRoundEnd);
  window.socket.off('matchEnd', this.handleMatchEnd);
  window.socket.off('recieveTurn', this.handleReceiveTurn);
  // ... each event individually
}
```

### Fix 5: Computer.js Import Check

Before deleting `classes/Computer.js`, verify it's not imported in the MainScene or any battle logic that runs during online mode. Search for:

```bash
grep -r "Computer" src/ --include="*.js" -l
```

If MainScene imports Computer for any fallback logic, remove that import in the BattleScene refactor before deleting the file.

### Fix 6: Battle Loading State

Phaser assets (terrain textures, explosion sprites, tank sprites, sounds) need loading time. Add a "DEPLOYING..." overlay within BattleScreen that shows while Phaser boots:

```javascript
// In BattleScreen.js
const [phaserReady, setPhaserReady] = useState(false);

// PhaserBootstrap calls this when scene's create() completes
bridge.onReady = () => setPhaserReady(true);

// Render
return (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div ref={canvasRef} />
    {!phaserReady && <DeployingOverlay />}
    {phaserReady && <BattleHUD bridge={bridge} gameState={gameState} />}
  </div>
);
```

### Fix 7: Weapon Canvas Textures in React Shop

The existing weapon logo `.webp` files in `/assets/images/logos/standard/` are loaded as canvas textures in Phaser. The React Shop screen needs them as `<img>` sources. Two approaches:

**Option A (Preferred):** Reference the `.webp` files directly via `<img src="./assets/images/logos/standard/Single_Shot.webp" />` — they're in the public directory.

**Option B:** If canvas conversion is needed, add a utility:
```javascript
// In data/weapons.js, alongside metadata
export function getWeaponIconUrl(weaponName) {
  const filename = weaponName.replace(/ /g, '_') + '.webp';
  return `${process.env.PUBLIC_URL}/assets/images/logos/standard/${filename}`;
}
```

---

## GSD Phase Plan

This React UI migration replaces the original GSD Phase 5 and expands it into 7 sub-phases (5A through 5G). Original Phases 1-4 and 6-7 remain unchanged.

**Relationship to existing GSD spec:**
- Phases 1-4: Unchanged (server authority, MongoDB, Gold economy, wallet + wagering)
- **Phase 5: REPLACED by 5A-5G below (React UI migration)**
- Phases 6-7: Unchanged (SHOT token, deploy + launch)

**Pre-requisite:** Phases 1-4 must be complete. The server must be authoritative, Gold economy working, Socket.IO events stable. This migration changes ONLY the client rendering layer.

---

### PHASE 5A: Foundation + Menu
**Estimated: 1-2 sessions**
**Goal:** React app shell renders, design system applied, Menu screen works.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5A.1 | `client/src/index.css` | Rewrite: CSS variables (all 17 tokens from SOLSHOT_DESIGN_CONTROL.md), Google Fonts import (Black Ops One, Share Tech Mono, Bebas Neue), keyframe animations (si, su, sm, sc, vp, dp, wd, ug, fl, eg), body noise+scanline overlays, base component styles (buttons, cards, range inputs, scrollbars) | Page background is dark olive with noise texture |
| 5A.2 | `client/src/App.js` | Rewrite: Remove Phaser game creation from module scope. Keep `window.socket = socket`. `useState('loading')` for screen, `useState({})` for screenData. `navigate(screen, data)` with spread copy. Render `<SolShotWalletProvider>` -> `<Layout>` -> screen switch (10 cases) | App renders without crash |
| 5A.3 | `client/src/components/Layout.js` | Centered 16:9 viewport (max-width 860px per v5 mockup), noise overlay div, scanline overlay div, subtle flicker animation | Container visible, overlays render |
| 5A.4 | `client/src/components/WalletDisplay.js` | SOL balance (diamond char + sol-green), SHOT balance (hexagon char + amber). Reads from `window.solWallet`. No emoji. | Balance displays correctly |
| 5A.5 | `client/src/components/TopBar.js` | Back button (left, text "MENU" with triangle), screen title (center, Black Ops One), WalletDisplay (right). Border-bottom olive line | Top bar renders on all screens |
| 5A.6 | `client/src/components/Button.js` | 4 variants: Primary (red gradient + orange border + glow), Secondary (olive dark + olive border), Gold (amber gradient + amber border), Disabled (olive dark + dim opacity). No emoji in any variant. | All 4 button styles render |
| 5A.7 | `client/src/screens/MenuScreen.js` | Shell icon (CSS div, not emoji) + "SOL" bone / "SHOT" orange in Black Ops One. Tagline: "ARTILLERY COMBAT ON SOLANA". Solana badge: "POWERED BY SOLANA" with green dot. 4 nav buttons: DEPLOY, ARMORY, PRESTIGE, BARRACKS. Wallet display panel. Version tag bottom-left. Background: terrain silhouette + explosion glow (CSS). No emoji. Arrow chars for hover indicators. | Menu renders matching v5 mockup |
| 5A.8 | `client/src/screens/LoadingScreen.js` | Military-styled progress bar in olive/amber. "LOADING ASSETS..." in Share Tech Mono. Transitions to 'menu' when complete. | Loading screen shows, then transitions |

**Commit:** `Phase 5A: React foundation + menu screen`

---

### PHASE 5B: Lobby Screen
**Estimated: 1-2 sessions**
**Goal:** Full room management with socket events, replaces Scene-2+3+4.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5B.1 | `client/src/hooks/useSocket.js` | Ref-based socket hook (see Fix 1 above). Auto-cleanup on unmount. No stale closures. | Hook subscribes and unsubscribes correctly |
| 5B.2 | `client/src/data/colors.js` | 8 tank colors with hex values and display names | Import works |
| 5B.3 | `client/src/screens/LobbyScreen.js` (Left Panel) | Match length selector (BO1/BO3/BO5 buttons). QUICK MATCH button (primary CTA, no emoji). 1v1 DUEL button (secondary). HIGH ROLLER button (secondary, sol-green text). Color picker: 8 swatches. CREATE MATCH button (bottom). | Left panel renders, buttons clickable |
| 5B.4 | `client/src/screens/LobbyScreen.js` (Right Panel) | "OPEN LOBBIES" label. Room list from `setRooms` socket event. Each room: host prestige badge + name + mode + map + wager amount + player count + join button. | Room list populates from server |
| 5B.5 | `client/src/screens/LobbyScreen.js` (Socket Wiring) | On mount: `socket.emit('getRooms')`. `useSocket('setRooms', ...)` -> populate list. Create room: emit `createRoom` with `{player: {name, color, walletAddress, wager}}`. Join room: emit `joinRoom`. `useSocket('startPick', ...)` -> `navigate('shop', sceneData)`. `useSocket('joinRoomError', ...)` -> error modal. `useSocket('opponentLeft', ...)` -> show modal. Auto-name from wallet: `wallet.slice(0,4)...wallet.slice(-4)` | Create room in tab 1, join in tab 2, both navigate to shop |
| 5B.6 | `client/src/components/Modal.js` | Centered overlay for confirm/error dialogs. Dark background with olive border. Title + message + button(s). | Modal shows for errors |

**Commit:** `Phase 5B: Lobby screen with socket events`

---

### PHASE 5C: Shop Screen
**Estimated: 1-2 sessions**
**Goal:** Gold-based weapon shop with timer, replaces Scene-5.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5C.1 | `client/src/data/weapons.js` | Static array of 13 weapons: id, name, tier, goldCost, description, damage, blastRadius, iconChar (text). Tier color mapping. `getWeaponIconUrl()` helper for .webp files. | Import works, data correct |
| 5C.2 | `client/src/components/WeaponCard.js` | Left accent border (tier color). Icon box + name + tier label. Damage/blast stat bars (thin, tier-colored). Price (gold or "FREE"). BUY button (or owned count). Selectable state with border glow. | Card renders matching v5 shop style |
| 5C.3 | `client/src/screens/ShopScreen.js` (Layout) | Top bar: "WEAPON SHOP" + round indicator + gold display (with gold coin char, no emoji) + pot display (SOL amount). Left panel (58%): scrollable weapon catalog. Right panel: selected weapon detail (name, desc, damage bar, blast bar). Bottom: loadout summary chips + READY button (primary). | Layout renders, weapon selection works |
| 5C.4 | `client/src/screens/ShopScreen.js` (Timer) | Countdown from server-provided `shopStartTime` (see Fix 3). Calculate remaining on arrival. Display in Bebas Neue. When timer hits 0, auto-ready. | Timer syncs with server, auto-readies at 0 |
| 5C.5 | `client/src/screens/ShopScreen.js` (Socket Wiring) | `useSocket('shopPhase', ...)` -> populate catalog + gold + start timer (with late-join sync). Buy: `socket.emit('buyWeapon', {weaponId})`. `useSocket('buyWeaponResult', ...)` -> update gold + inventory. `useSocket('shopEnd', ...)` -> receive final weapons, `navigate('battle', data)`. Ready: `socket.emit('shopDone')`. | Buy weapons, gold decrements, ready transitions to battle |

**Commit:** `Phase 5C: Weapon shop with timer sync`

---

### PHASE 5D: Battle Screen — THE CRITICAL PHASE
**Estimated: 4-5 sessions**
**Goal:** Phaser canvas embedded in React with React HUD overlay.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5D.1 | `client/src/bridge/GameBridge.js` | Plain object with dirty-flag pattern (see Fix 2). State: tank1/tank2, activeTank, wind, gold, round, gameOver, moveSteps, weaponIndex, weapons, isPlayerTurn, isFiring. Command methods: fire(), setPower(), setAngle(), selectWeapon(), moveLeft(), moveRight(), exit(). Callback hooks: onGameOver, onRoundEnd, onMatchEnd, onReady. | Bridge instantiates, methods callable |
| 5D.2 | `client/src/bridge/PhaserBootstrap.js` | `startBattle(containerElement, sceneData, bridge)` -> creates `Phaser.Game` with CANVAS renderer, 1200x800, FIT scale, Arcade physics at 60fps. `destroyBattle()` -> cleans up game instance. Config: `pixelArt=true`, no antialiasing. | Phaser boots in container div |
| 5D.3 | `client/src/bridge/BattleScene.js` | Refactored from `scenes/main/index.js`. **KEEP:** createBackground, createBlastLayer, createPointsLayer, createTerrain, createBoundWalls, createTank1/2, showTurnPointer, hideTurnPointer, checkSwitchTurn, all type3 socket events. **REMOVE:** createHUD(), showGameOver(), showExitMenu(), hideExitMenu(). **ADD:** In `create()`, wire bridge callbacks + emit `onReady`. In `update()`, write state to `bridge.updateState()` only when values change. **CRITICAL:** Use specific `socket.off(event, handler)` in destroy — NEVER `removeAllListeners()` (see Fix 4). Verify Computer.js is not imported (see Fix 5). | Phaser renders terrain + tanks without HUD |
| 5D.4 | `client/src/hooks/useGameState.js` | rAF-based poll with dirty flag (see Fix 2 implementation). `React.memo`-friendly — only updates when `bridge.consume()` returns non-null. | Hook returns state, updates on changes only |
| 5D.5 | `client/src/screens/BattleScreen.js` | `useRef` for canvas container. `useRef` for bridge instance. `useEffect` mount: create bridge -> start Phaser -> set up bridge callbacks. Cleanup: destroy Phaser, cancel rAF. "DEPLOYING..." overlay while Phaser loads (see Fix 6). HUD overlay on top when ready. | Battle screen renders with Phaser canvas + React HUD |
| 5D.6 | `client/src/screens/battle/BattleHUD.js` | Full overlay container. `pointer-events: none` on background, `pointer-events: auto` on interactive elements. Top row: WindDisplay, GoldDisplay, PotDisplay, RoundCounter. Health bars: ScoreBoard (player left green, opponent right orange). All sub-components `React.memo` wrapped. | HUD overlays canvas correctly |
| 5D.7 | `client/src/screens/battle/AngleControl.js` + `PowerControl.js` | Bebas Neue large number + range input slider. Styled range thumb (amber). Dispatches to bridge on change. Semi-transparent dark panel. | Sliders control angle/power, values update in real-time |
| 5D.8 | `client/src/screens/battle/WeaponSelector.js` + `FireButton.js` | Prev/next buttons + weapon name display (Black Ops One). FIRE button: primary style, "FIRE" text (no emoji). Dispatches to bridge. Disabled when not player's turn. | Weapon cycles, fire button triggers shot |
| 5D.9 | `client/src/screens/battle/ExitMenu.js` | ESC key triggers modal. "EXIT — FORFEIT [X] SOL" text (no emoji). Confirm/cancel buttons. Emits `leaveRoom` on confirm. | ESC opens menu, confirm forfeits |
| 5D.10 | Keyboard Controls | Phaser keeps keyboard handlers (SPACE, W, S, A, D, Q, E) for when canvas has focus. React adds global `keydown` listener forwarding to bridge for HUD focus. After React button clicks, refocus canvas: `canvasRef.current.querySelector('canvas').focus()`. | Keyboard works from both canvas and HUD |
| 5D.11 | Turn State Management | When not player's turn: all controls dim + `pointer-events: none` + "OPPONENT'S TURN" label. When firing: controls disabled + firing animation. When round ends: navigate to shop (if more rounds) or navigate to win/lose. | Controls correctly enable/disable per turn |

**Commit per sub-task or logical group. Minimum commits:**
- `Phase 5D.1-2: GameBridge + PhaserBootstrap`
- `Phase 5D.3: BattleScene refactor`
- `Phase 5D.4-6: BattleScreen + HUD container`
- `Phase 5D.7-9: HUD controls`
- `Phase 5D.10-11: Keyboard + turn state`

---

### PHASE 5E: Win + Lose Screens
**Estimated: 0.5-1 session**
**Goal:** Post-match result screens with rematch flow.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5E.1 | `client/src/screens/WinScreen.js` | "VICTORY" in Black Ops One, slam animation (`sm`), green pulse glow (`vp`). Green-tinted background. SOL earned card (scale-pop `sc`, staggered reveal). SHOT milestone card if earned. Stats grid: damage, kills, accuracy, best shot, gold. 3 buttons: REMATCH (primary), LOBBY (secondary), MENU (tertiary). No emoji. | Victory screen shows with animations and correct data |
| 5E.2 | `client/src/screens/LoseScreen.js` | "DEFEATED" in Black Ops One, slam + red pulse (`dp`). Red-tinted background. Wager lost card. Stats grid. 3 buttons: RUN IT BACK, LOBBY, MENU. No emoji. | Defeat screen shows with correct wager lost |
| 5E.3 | Socket Wiring | REMATCH emits `playAgainRequest`. `useSocket('playAgain', ...)` -> navigate to shop. `useSocket('opponentLeft', ...)` -> show modal, only LOBBY button. `useSocket('matchSettled', ...)` -> update settlement display with TX signature. | Rematch works, opponent-left handled |

**Commit:** `Phase 5E: Win + lose screens with rematch`

---

### PHASE 5F: Placeholder Screens
**Estimated: 0.5 session**
**Goal:** Armory, Prestige, Barracks render with correct v5 styling.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5F.1 | `client/src/data/tiers.js` | Tier color map, prestige definitions (P1-P10 names, costs, rewards, colors), cosmetic item data for Armory. | Import works |
| 5F.2 | `client/src/screens/ArmoryScreen.js` | Two tabs: SOL SHOP / SHOT BURNS. Hardcoded item list with tier colors (from v5 mockup data). Preview panel with icon char, name, tier, description. BUY/EQUIP button shows "COMING SOON" badge. | Armory renders, tabs switch, items selectable |
| 5F.3 | `client/src/screens/PrestigeScreen.js` | Current rank badge from `window.solWallet.prestigeInfo` (or placeholder P0). Tier list P1-P10 with names, costs, rewards (from v5 data). Burn button (disabled with "COMING SOON" or wired to `prestigeBurn` if available). | Prestige screen renders all 10 tiers |
| 5F.4 | `client/src/screens/BarracksScreen.js` | Wallet address display (hexagon icon char). Prestige badge + tier name. Stats grid (all zeros or dashes as placeholder). "Joined" date placeholder. | Barracks renders with placeholder data |

**Commit:** `Phase 5F: Placeholder screens (armory, prestige, barracks)`

---

### PHASE 5G: Cleanup + Smoke Test
**Estimated: 0.5-1 session**
**Goal:** Delete old code, full end-to-end verification.

| Task | File(s) | What To Do | Test |
|------|---------|------------|------|
| 5G.1 | Delete old scenes | Remove entire `scenes/` directory (scene-1 through scene-5, main, loading, controls, about, guide, screenshots) | No import errors |
| 5G.2 | Delete old graphics | Remove entire `graphics/` directory (canvas-drawn buttons) | No import errors |
| 5G.3 | Delete unused classes | Remove `Computer.js`, `HUD.js`, `ScrollList.js`, `WeaponShopScroll.js`, `WebFontFile.js` | No import errors |
| 5G.4 | Clean imports | Remove any remaining references to deleted files in App.js, index.js, or any surviving file | `npm start` compiles cleanly |
| 5G.5 | Syntax check | `node --check` on all new `.js` files | No syntax errors |
| 5G.6 | Full smoke test | Menu -> Lobby -> Create room -> Join room (2nd tab) -> Shop -> Battle -> Win/Lose -> Rematch -> Shop -> Battle -> Win/Lose -> Menu | All 10 screens render and transition correctly |
| 5G.7 | Edge case test | Wallet connect/disconnect during gameplay. Opponent leaves mid-shop. Opponent leaves mid-battle. ESC forfeit during battle. Timer expiry in shop. | All edge cases handled gracefully |

**Commit:** `Phase 5G: Cleanup old Phaser UI + smoke test pass`

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Phaser canvas loses keyboard focus when React HUD clicked | Refocus canvas after React interactions + duplicate keydown listeners in React |
| GameBridge polling causes React perf issues | Dirty-flag pattern (Fix 2) — React only re-renders on actual state changes |
| `socket.removeAllListeners()` in old code nukes WalletContext | Never call `removeAllListeners()` — use specific `socket.off(event, handler)` (Fix 4) |
| Asset loading timing (Phaser not running on menu) | Lazy-load Phaser + assets only when entering battle. "DEPLOYING..." overlay in BattleScreen (Fix 6) |
| Weapon canvas textures needed in React Shop | Reference .webp files directly via img tags or `getWeaponIconUrl()` helper (Fix 7) |
| Scene data mutation across screens | Use spread copies in `navigate()` to avoid stale references |
| Shop timer desync on slow load / reconnect | Server sends `shopStartTime`, client calculates remaining locally (Fix 3) |
| useSocket stale closures | Ref-based callback pattern (Fix 1) |
| Computer.js phantom imports | Grep before delete (Fix 5) |
| Phaser boot time leaves blank screen | "DEPLOYING..." overlay until BattleScene.create() completes (Fix 6) |

---

## Verification Checklist

### After Each Sub-Phase:
- [ ] `npm start` from client directory — verify compilation
- [ ] Test completed screens visually against v5 mockup
- [ ] Browser console — check for React warnings/errors
- [ ] No emoji visible anywhere in UI

### After Phase 5D (Battle):
- [ ] Open two browser tabs at localhost:3000
- [ ] Create room in tab 1 -> Join in tab 2
- [ ] Go through shop -> buy weapons -> ready
- [ ] Battle: fire shots, verify HUD updates, verify terrain destruction
- [ ] Complete match -> verify Win/Lose screen appears with correct data
- [ ] Verify keyboard controls work from both canvas focus and HUD focus

### After Phase 5G (Cleanup):
- [ ] Full end-to-end: Menu -> Lobby -> Shop -> Battle -> Win -> Rematch -> Shop -> Battle -> Lose -> Menu
- [ ] All 10 screens render correctly with v5 design system
- [ ] Wallet connect/disconnect doesn't break anything
- [ ] Opponent-left handling works on every screen
- [ ] No references to deleted files remain
- [ ] No emoji in any screen
