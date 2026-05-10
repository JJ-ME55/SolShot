# SOLSHOT — CODEBASE AUDIT REPORT
## pocket-tanks repo → SolShot transformation

---

## EXECUTIVE SUMMARY

The pocket-tanks codebase is a **solid 60% foundation** for SolShot. The core game loop — terrain generation, projectile physics, tank movement, turn-based gameplay, weapon system, explosions with terrain deformation, scoring, and Socket.IO multiplayer — all works. The remaining 40% is: Solana integration (wallet, wager escrow, SHOT token), server-authoritative physics (anti-cheat), SolShot UI reskin, Gold economy, and prestige system.

**Biggest win:** 30 weapons already implemented with full physics, sound effects, and blast animations. We don't need to build weapons from scratch — we cherry-pick and re-balance the best ones.

**Biggest risk:** Physics runs entirely client-side. The server is a dumb relay. For real-money wagering, this MUST move server-side (Phase 2).

---

## 1. SERVER ARCHITECTURE

### server/index.js — Express + Socket.IO Entry

**What it does:**
- Express server on port 5001
- CORS wide open (`origin: "*"`)
- Socket.IO server created and passed to `mainsocket()`
- Single health-check route (`GET /` → "running")

**Dependencies (server/package.json):**
```
express: ^4.17.3
socket.io: ^4.4.1
dotenv: ^16.0.0
nodemon: ^1.3.3
```

**What's missing for SolShot:**
- No database (no MongoDB despite build doc assumption — it's purely in-memory)
- No authentication
- No HTTPS/TLS
- No rate limiting
- No Solana SDK (`@solana/web3.js`)
- No environment-based config (hardcoded port)

**Action items:**
- Add MongoDB/Mongoose for player profiles, match history, stats
- Add `@solana/web3.js` + `@coral-xyz/anchor` for on-chain interactions
- Add JWT or session auth (wallet-based)
- Add rate limiting (express-rate-limit)
- Environment config for prod/dev/staging

---

### server/socket-io/main.js — The Multiplayer Brain

**This is the most critical file.** It handles the entire match lifecycle.

#### Room Data Structure (in-memory array):
```js
room: {
  roomId,           // random 6-char string
  active: bool,     // true = 2 players joined, game in progress
  host: { name, color, socketId, pos, isReady, playAgain },
  player: { name, color, socketId, pos, isReady, playAgain },
  randomArray,      // weapon selection order (server-generated)
  terrainPath       // terrain data shared between players
}
```

#### Socket Events (Full Map):

| Event | Direction | Purpose | SolShot Status |
|-------|-----------|---------|----------------|
| `createRoom` | Client→Server | Host creates room, gets roomId | ✅ Keep — becomes "Create Match" |
| `joinRoom` | Client→Server | Player joins by roomId | ✅ Keep — becomes "Join Match" |
| `getRooms` | Client→Server | List open rooms (max 5) | ✅ Keep — becomes matchmaking lobby |
| `setRooms` | Server→Client | Broadcast open room list | ✅ Keep |
| `ready` | Client→Server | Both players ready → `startGame` | ✅ Keep — add wager confirmation here |
| `startPick` | Server→Client | Begin weapon selection phase | ✅ Keep — triggers weapon shop |
| `startGame` | Server→Client | Both ready, begin match | ✅ Keep — add escrow lock here |
| `createWeaponArray` | Client→Server | Host requests random weapon order | ✅ Keep — server generates, both receive |
| `setWeaponArray` | Server→Client | Distribute weapon array to both | ✅ Keep |
| `weaponPick` | Client→Server | Player picks weapon from shop | ✅ Keep — add Gold cost validation |
| `opponentWeaponPick` | Server→Client | Relay opponent's weapon pick | ✅ Keep |
| `terrainPath` | Client→Server | Host sends generated terrain | 🔧 Move terrain gen to server |
| `setTerrainPath` | Server→Client | Distribute terrain to joiner | ✅ Keep |
| `shoot` | Client→Server | Fire weapon (weapon, power, rotation, positions) | ⚠️ **CRITICAL** — relay only, no validation |
| `opponentShoot` | Server→Client | Relay shot to opponent | ⚠️ Must become server-computed result |
| `angleChange` | Client→Server | Real-time turret angle updates | ✅ Keep for visual sync |
| `powerChange` | Client→Server | Real-time power updates | ✅ Keep for visual sync |
| `stepLeft/stepRight` | Client→Server | Tank movement | ✅ Keep |
| `giveTurn` | Client→Server | End turn, sync terrain + positions | 🔧 Server should own turn state |
| `recieveTurn` | Server→Client | Relay turn data to opponent | 🔧 Server should validate |
| `requestTurn` | Client→Server | Non-host requests turn back | ✅ Keep |
| `weaponChange` | Client→Server | Switch active weapon | ✅ Keep |
| `playAgainRequest` | Client→Server | Rematch (both must agree) | ✅ Keep — add new wager flow |
| `leaveRoom` | Client→Server | Player exits room | ✅ Keep — add forfeit/escrow refund |
| `deleteRoom` | Client→Server | Host deletes room | ✅ Keep |
| `disconnect` | Auto | Socket disconnects | 🔧 Add forfeit logic + escrow handling |
| `opponentLeft` | Server→Client | Notify player opponent disconnected | ✅ Keep — add win-by-forfeit |

#### Critical Finding: RELAY-ONLY SERVER

The `shoot` event is the smoking gun:
```js
client.on('shoot', ({selectedWeapon, power, rotation, rotation1, rotation2, position1, position2}) => {
    client.to(client.roomId).emit('opponentShoot', {selectedWeapon, power, rotation, rotation1, rotation2, position1, position2})
})
```

**The server does ZERO physics.** It blindly relays whatever the client sends. A cheater could send modified positions, fake hit data, or impossible trajectories. This is fine for a free game, but for SOL wagering it's a deal-breaker.

**Phase 1 workaround:** For MVP, keep relay-only but add basic sanity checks (power 1-100, rotation within bounds, weapon must be in player's inventory). Accept the risk for low-stakes testing.

**Phase 2 fix:** Server-authoritative physics. Server runs headless Phaser or custom physics engine. Client sends inputs only, server computes and broadcasts results.

---

## 2. CLIENT ARCHITECTURE

### client/package.json — Dependencies

```
phaser: ^3.55.2              // Game engine — core of everything
phaser3-rex-plugins: ^1.60.4 // Extended Phaser plugins (scrolling, etc.)
react: ^18.1.0               // UI framework
react-dom: ^18.1.0           
react-scripts: ^5.0.1        // Create React App
socket.io-client: ^4.5.1     // Real-time comms
webfontloader: ^1.6.28       // Custom fonts
```

**What's missing:**
- `@solana/web3.js` — wallet connection
- `@solana/wallet-adapter-react` — Phantom/Solflare integration
- `@coral-xyz/anchor` — Solana program interaction
- State management (Zustand or Jotai for game state)
- Tailwind or similar for UI reskin

### client/src/socket/index.js — Socket Connection

```js
import io from 'socket.io-client'
var local = 'http://localhost:5001'
var url = 'https://pocket-tanks.onrender.com'
export const socket = io(url)
```

**Issues:**
- Hardcoded to production URL (should be env-based)
- No reconnection handling
- No auth token on connection
- Exported as singleton — fine for now

---

## 3. GAME OBJECTS — DEEP DIVE

### Tank.js — Core Player Object

**Properties:**
```
power: 60 (default)     // 1-100 range
powerFactor: 8          // multiplier for velocity
movesRemaining: 4       // steps per turn
weapons: []             // array of weapon objects
selectedWeapon: 0       // current weapon index
score: 0                // running score
active: bool            // is it this tank's turn
settled: bool           // has physics settled (not in air)
```

**Controls:** WASD keyboard
- W/S = power up/down
- A/D = step left/right (80 frames of movement per step, 4 steps per turn)

**Turret:** Separate `Turret` class handles angle/rotation and firing

**autoAdjust():** Built-in aim assist — brute-force simulates trajectories to find optimal angle/power to hit opponent. Currently behind a rewarded-ad gate. For SolShot: remove or make it a purchasable Gold item.

**Score system:** Distance-based. Closer hit = more points. Direct hit on tank = max points. Hitting yourself = negative points. Score is purely visual — no blockchain connection.

**Key observations:**
- Physics body size is 1x1 pixel (the "collision point" is the tank's base position)
- Tank sits ON terrain using slope calculation
- Movement is terrain-following (not free movement)
- `isPointInside()` uses polygon hitbox for hit detection

### Weapon.js — Weapon Framework

Every weapon follows the same interface:
```
create(weapon)          // Set up projectile sprites/canvas
shoot(weapon)           // Launch projectile with velocity
update(weapon)          // Per-frame update (tail effects, collision checks)
onTerrainHit(weapon)    // Projectile hit terrain → blast
onBaseHit(weapon)       // Hit bottom of map
onTankHit(weapon, tank) // Direct hit on a tank
onOutOfBound(weapon)    // Left the map
onBounceHit(weapon)     // Hit magic wall (bouncy terrain)
```

**defaultShoot() physics:**
```
velocity = power * powerFactor (8)
rotation = turret angle - π/2
gravity = 300 (default)
```
So power 100 = velocity 800, which is the max projectile speed.

**Scoring formula (defaultUpdateScore):**
- Direct tank hit: `±blastRadius * factor` points
- Near miss: `(blastRadius - distance) * factor` points
- Hit yourself: negative same formula

### Blast.js — Explosions & Terrain Deformation

Three blast animation types:
1. **Type 1** — Expanding ring (most weapons). Carves circular hole in terrain.
2. **Type 2** — Multiple circles (cluster weapons).
3. **Type 3** — Variable radius (special weapons).

Each blast:
- Removes terrain pixels in a circle (`destination-out` compositing)
- Applies knockback to nearby tanks (`blowPower` velocity)
- Plays sound effect
- Caches rendered frames for performance (BlastCache)

### Terrain.js — Procedural Destructible Terrain

- Generated client-side using path-based algorithm
- Rendered as HTML Canvas texture
- Pixel-level collision (alpha > 0 = solid)
- `getSlope()` — calculates surface angle for tank positioning
- `getRightGround()` / `getLeftGround()` — terrain-following movement
- Host generates terrain and sends path data to joiner via Socket
- `multiplayerCorrection()` — syncs terrain destruction between players

---

## 4. GAME MODES (Type System)

| Type | Mode | How It Works |
|------|------|-------------|
| **type1** | vs CPU | Player 1 (human) vs Player 2 (Computer AI). Uses `Computer.js` for auto-aim + shoot. |
| **type2** | Local 2P | Two players, same keyboard. Random first turn. |
| **type3** | Online PvP | Socket.IO multiplayer. Host generates terrain. Turn-based with network sync. **THIS IS SOLSHOT'S MODE.** |
| **type4** | Target Practice | Same as type2 but unlimited weapons (`movesRemaining` never decreases). |

**SolShot uses type3 (online PvP) as the base.** We keep type1 (vs CPU) for practice mode. Type2 and type4 can be removed or kept as casual modes.

---

## 5. WEAPON INVENTORY — ALL 30 WEAPONS

The repo ships 30 fully implemented weapons in `Standard.js`:

| ID | Name | Blast Radius | Score Factor | Notes |
|----|------|-------------|-------------|-------|
| 0 | Single Shot | 46 | 60/46 | Basic projectile, 3 bounces on magic wall |
| 1 | Big Shot | 90 | 30/90 | Large blast, lower per-pixel score |
| 2 | 3 Shot | ~46 each | ~1.3 each | Three projectiles, slight spread |
| 3 | 5 Shot | ~46 each | ~1.3 each | Five projectiles, wider spread |
| 4 | Jackhammer | Variable | - | Digs into terrain vertically |
| 5 | Heatseeker | ~46 | ~1.3 | Tracks opponent tank |
| 6 | Tracer | ~46 | ~1.3 | Shows trajectory preview then fires |
| 7 | Pile Driver | Variable | - | Vertical terrain destruction |
| 8 | Dirt Mover | - | - | Moves terrain (terrain manipulation) |
| 9 | Crazy Ivan | Random | - | Erratic trajectory |
| 10 | Spider | Multiple | - | Splits on impact |
| 11 | Sniper Rifle | Small | High | Small blast, high damage |
| 12 | Magic Wall | - | - | Creates bouncy terrain (special) |
| 13 | Dirt Slinger | - | - | Throws dirt/terrain |
| 14 | Zapper | - | - | Lightning/energy weapon |
| 15 | Napalm | Spread | - | Fire spread on terrain |
| 16 | Hail Storm | Multiple | - | Rain of projectiles |
| 17 | Ground Hog | Tunnel | - | Burrows through terrain |
| 18 | Worm | Ground | - | Travels along terrain surface |
| 19 | Homing Worm | Ground+Track | - | Worm that tracks opponent |
| 20 | Skipper | Bounce | - | Bounces along terrain |
| 21 | Chain Reaction | Multi-blast | - | Multiple explosions |
| 22 | Pineapple | Cluster | - | Grenade-style cluster |
| 23 | Firecracker | Multi | - | Multiple small explosions |
| 24 | Homing Missile | Track | - | Heat-seeking missile |
| 25 | Dirt Ball | Terrain | - | Adds terrain on impact |
| 26 | Tommy Gun | Rapid | - | Multiple small shots |
| 27 | Mountain Mover | Huge | - | Massive terrain destruction |
| 28 | Scatter Shot | Spread | - | Shotgun-style spread |
| 29 | Cruiser | Low | - | Low-altitude missile |

### SolShot Weapon Mapping

Our build doc specified 13 weapons. Here's how they map to existing weapons:

| SolShot Weapon | Gold Cost | Existing Weapon | Action |
|----------------|-----------|-----------------|--------|
| Mortar (default) | 0 | Single Shot (id:0) | ✅ Rename, keep physics |
| Scatter Shell | 250 | Scatter Shot (id:28) | ✅ Rename, rebalance |
| Cluster Bomb | 500 | Pineapple (id:22) or Chain Reaction (id:21) | ✅ Pick best, rename |
| Tracer Round | 350 | Tracer (id:6) | ✅ Already exists |
| Napalm | 750 | Napalm (id:15) | ✅ Already exists |
| Dirt Bomb | 200 | Dirt Ball (id:25) | ✅ Rename |
| Homing Missile | 1,000 | Homing Missile (id:24) | ✅ Already exists |
| Sniper | 600 | Sniper Rifle (id:11) | ✅ Already exists |
| EMP | 1,500 | Zapper (id:14) | ✅ Rename, adjust effect |
| Bunker Buster | 1,200 | Pile Driver (id:7) or Jackhammer (id:4) | ✅ Pick best |
| Shield Wall | 800 | Magic Wall (id:12) | ✅ Rename to defensive |
| Nuke | 2,500 | Mountain Mover (id:27) or Big Shot (id:1) | ✅ Biggest blast |
| Earthquake | 2,000 | Ground Hog (id:17) | 🔧 Modify for area effect |

**MASSIVE WIN: Zero weapons need to be built from scratch.** Every SolShot weapon maps to an existing implementation. We just rename, adjust blast radius/score factors, and assign Gold costs.

---

## 6. SOUND & ASSETS AUDIT

### Sound Effects Already Present:
- `launch.mp3` — weapon fire
- `expmedium.mp3`, `expmedium2.mp3` — medium explosions
- `expshort.mp3`, `expshort2.mp3` — small explosions  
- `exphuge.mp3`, `explong.mp3` — large explosions
- `hailstorm.mp3` — hail storm weapon
- `homingmissile.mp3` — homing weapon
- `napalm.mp3` — napalm
- `firecracker.mp3` — firecracker
- `rocket.mp3` — rocket launch
- `laser1.mp3` — laser/zapper
- `rocks_1.mp3` through `rocks_6.mp3` — debris sounds
- `rockslide.mp3` — terrain collapse
- `click.wav` — UI click
- `background.mp3` — in-game music
- `intro.mp3` — menu music
- `winner.mp3` — victory music

**Previous audit said "Sound effects ❌ Not implemented."** That was WRONG. Sound effects are fully implemented and integrated into weapon blast() calls.

### Images Present:
- Tank sprites (6 variations + 3 additional)
- 30 weapon logos (one per weapon)
- Terrain textures
- UI elements
- Screenshots for guide

**What's missing:**
- SolShot-branded logo
- Solana wallet UI icons
- Gold/SHOT token icons
- Prestige tier badges
- Win/loss celebration effects

---

## 7. SCENE FLOW (Game State Machine)

```
Loading → Scene-1 (Main Menu)
                 ↓
         Scene-2 (Mode Select: CPU/Local/Online/Practice)
                 ↓
         Scene-3 (Player Setup: name, color, difficulty)
                 ↓
         Scene-4 (Online: Room lobby / Room create+join)
                 ↓
         Scene-5 (Weapon Shop: pick weapons from random array)
                 ↓
         Main-Scene (THE GAME: turn-based artillery combat)
                 ↓
         Game Over → Play Again / Exit
```

### For SolShot, this becomes:
```
Loading → Connect Wallet → Main Menu (with wallet status)
                 ↓
         Match Setup (wager amount, mode select)
                 ↓
         Matchmaking (create/join room + wager lock)
                 ↓
         Weapon Shop (spend Gold on weapons)
                 ↓
         Main-Scene (THE GAME)
                 ↓
         Game Over → Payout → Stats → Play Again
```

---

## 8. CRITICAL BUGS / ISSUES IN BASE CODE

1. **`rooms` is an in-memory array.** Server restart = all rooms lost. Need persistence or at minimum graceful handling.

2. **No room size limit.** Unlimited rooms can be created → memory leak potential.

3. **No input validation on `shoot` event.** Any data can be sent.

4. **Bug in `getTerrainPath`:** `rooms.terrainPath` should be `room.terrainPath` (line 52413 of dump). Typo — `rooms` (the array) instead of `room` (the found object).

5. **Race condition in turn switching.** `checkSwitchTurn()` runs every frame. If terrain animation and blast timing overlap, turns can switch prematurely.

6. **No timeout handling.** A player can hold their turn indefinitely — no shot clock.

7. **Magic wall bounce uses pixel color detection** (`r:230, g:0, b:230`). Fragile — could break with any rendering changes.

8. **Weapon texture key collision.** Many weapons use `'projectile'` as texture key, destroying/recreating each time. Works but could cause flicker.

---

## 9. UPDATED BUILD DOC CORRECTIONS

Based on this audit, the following items in the master build doc need correction:

| Build Doc Claim | Reality | Correction |
|-----------------|---------|------------|
| "MongoDB integration" | **No database at all** — pure in-memory | Need to add MongoDB from scratch |
| "Sound effects ❌ Not implemented" | **Fully implemented** — 20+ sound files, integrated into weapon/blast code | ✅ Already done |
| "Weapon system needs SolShot roster" | **30 weapons exist** — every SolShot weapon maps to an existing one | Just rename + rebalance |
| "Room creation exists" | Confirmed — full room lifecycle | ✅ Working |
| "Screen shake ❌" | Not present but `Blast.blowPower` provides knockback | Add camera shake in Blast.js |
| "Gold economy ❌" | Confirmed not present | Need to build (weapon shop already has UI framework) |

---

## 10. PHASE 1 BUILD PRIORITY (Updated)

Given the audit findings, here's the corrected Phase 1 priority:

### Week 1-2: Foundation
1. **Rename & rebrand** — Update all UI text, colors, logos
2. **Weapon roster** — Disable 17 unused weapons, rename 13 keepers, assign Gold costs
3. **Gold economy** — Add Gold earning (100/turn + bonus for hits) and spending in weapon shop
4. **Shot clock** — 30-second turn timer (prevents stalling)
5. **Environment config** — Move hardcoded URLs to env vars

### Week 3-4: Wallet & Wager
6. **Phantom wallet** — Connect wallet, display SOL balance
7. **Wager flow** — Select wager tier (0.05/0.1/0.25/0.5 SOL)
8. **Escrow program** — Solana program: lock wagers, pay winner, take 10% rake
9. **Room flow** — Integrate wager confirmation into room join/ready flow
10. **Forfeit handling** — Disconnect/leave = forfeit, opponent wins pot

### Week 5-6: Polish & Deploy
11. **Basic anti-cheat** — Server-side input validation (power bounds, weapon inventory check, turn order enforcement)
12. **MongoDB** — Player profiles, match history, stats tracking
13. **UI reskin** — SolShot theme (dark + neon)
14. **Screen shake** — Camera shake on blast (easy Phaser tween)
15. **Deploy** — VPS + domain + SSL

---

## 11. FILE-BY-FILE MODIFICATION MAP

| File | Action | What Changes |
|------|--------|-------------|
| `server/index.js` | Modify | Add MongoDB, auth middleware, Solana SDK, env config |
| `server/socket-io/main.js` | Heavy modify | Add wager flow, Gold tracking, turn timer, input validation, forfeit logic |
| `server/package.json` | Modify | Add mongoose, @solana/web3.js, @coral-xyz/anchor, jsonwebtoken, express-rate-limit |
| `client/src/socket/index.js` | Modify | Env-based URL, auth token, reconnection |
| `client/src/classes/Tank.js` | Modify | Gold tracking, weapon cost enforcement |
| `client/src/classes/Weapon.js` | Light modify | Gold cost property, validation |
| `client/src/classes/Blast.js` | Light modify | Add camera shake trigger |
| `client/src/classes/HUD.js` | Heavy modify | SolShot theme, Gold display, timer, wager info |
| `client/src/classes/WeaponShopScroll.js` | Modify | Gold prices, cost display, buy validation |
| `client/src/weapons/array.js` | Modify | Remove unused weapons, rename keepers |
| `client/src/weapons/packs/Standard/Standard.js` | Modify | Rebalance blast radii, score factors |
| `client/src/scenes/main/index.js` | Modify | Shot clock, wager display, SolShot game over flow |
| `client/src/scenes/main/types/type3.js` | Heavy modify | Wager integration, escrow hooks |
| `client/src/scenes/scene-1/index.js` | Replace | SolShot main menu with wallet |
| `client/src/scenes/scene-4/index.js` | Heavy modify | Wager-enabled room lobby |
| `client/src/scenes/scene-5/index.js` | Modify | Gold-based weapon shop |
| `client/src/App.js` | Modify | Add wallet provider wrapper |
| `client/package.json` | Modify | Add @solana/web3.js, wallet-adapter, tailwind |
| **NEW:** `server/solana/escrow.js` | Create | Escrow program interaction |
| **NEW:** `server/models/` | Create | MongoDB schemas (Player, Match) |
| **NEW:** `server/middleware/auth.js` | Create | Wallet-based authentication |
| **NEW:** `client/src/components/WalletConnect.js` | Create | Phantom wallet button |
| **NEW:** `programs/match_escrow/` | Create | Solana Anchor program |

---

*Audit completed: Feb 14, 2026*
*Base repo: github.com/Amankumar321/pocket-tanks*
*Target: SolShot Phase 1 MVP*
