# SOLSHOT — GSD SPEC SHEET
## Claude Code Execution Plan

---

## 0. REPO SETUP (You Do This First)

### Step 1: Clone pocket-tanks into your SolShot repo

Open CMD in whatever folder you want the project:

```cmd
cd C:\Users\johnk
git clone https://github.com/Amankumar321/pocket-tanks.git SolShot
cd SolShot
```

### Step 2: Re-point to YOUR GitHub repo

```cmd
git remote remove origin
git remote add origin https://github.com/JJ-ME55/SolShot.git
```

### Step 3: Create branch structure

```cmd
git checkout -b dev
git push -u origin dev
git checkout -b main
git push -u origin main
git checkout dev
```

### Step 4: Verify

```cmd
git remote -v
```

Should show:
```
origin  https://github.com/JJ-ME55/SolShot.git (fetch)
origin  https://github.com/JJ-ME55/SolShot.git (push)
```

### Step 5: Install Node.js (if not installed)

Download from: https://nodejs.org/en (LTS version, currently 20.x)

Verify:
```cmd
node --version
npm --version
```

### Step 6: Test the base game runs

```cmd
cd server
npm install
cd ../client
npm install
```

Then open two terminals:

**Terminal 1 (server):**
```cmd
cd C:\Users\johnk\SolShot\server
npm start
```

**Terminal 2 (client):**
```cmd
cd C:\Users\johnk\SolShot\client
npm start
```

Browser should open to localhost:3000 with the Pocket Tanks game running.

### Step 7: Create devnet wallet for SolShot

```cmd
solana-keygen new --outfile ~/.config/solana/solshot-dev.json
solana config set --keypair ~/.config/solana/solshot-dev.json
solana config set --url devnet
solana airdrop 2
```

If you don't have Solana CLI installed:
```cmd
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Or on Windows, use: https://docs.solanalabs.com/cli/install

### Step 8: MongoDB Atlas Setup

1. Go to https://www.mongodb.com/cloud/atlas
2. Create free M0 cluster
3. Create database user (save username + password)
4. Whitelist your IP (or 0.0.0.0/0 for dev)
5. Get connection string — looks like:
   `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/solshot?retryWrites=true&w=majority`
6. Create `.env` file in `server/`:
   ```
   PORT=5001
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/solshot
   SOLANA_RPC=https://api.devnet.solana.com
   SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json
   ```

---

## 1. FULL WEAPON ROSTER — ALL 30 AVAILABLE

Below is every weapon in the pocket-tanks codebase. I've mapped each to a SolShot tier with recommended Gold costs. **Pick 13 for launch** (my recommendations marked with ⭐).

### Existing Weapons (from Standard.js + array.js)

| ID | Weapon | Behavior | Blast Radius | Recommended Tier | Gold Cost | Pick? |
|----|--------|----------|-------------|-----------------|-----------|-------|
| 0 | Single Shot | Standard projectile, small blast | Small (30) | Free | 0 | ⭐ FREE (Mortar equivalent — always available) |
| 1 | Big Shot | Larger projectile, bigger blast | Large (80) | Rare | 700 | ⭐ |
| 2 | 3 Shot | Fires 3 projectiles in spread | Medium (30×3) | Tactical | 400 | ⭐ |
| 3 | 5 Shot (Super Star) | Fires 5 projectiles in spread | Medium (30×5) | Rare | 800 | ⭐ |
| 4 | Jackhammer | Drills into terrain, multiple blasts going down | Medium (chain) | Epic | 1,000 | ⭐ |
| 5 | Heatseeker | Homes toward opponent tank | Medium (40) | Tactical | 500 | ⭐ |
| 6 | Tracer | Bounces off terrain, marks position | Small (20) | Standard | 100 | |
| 7 | Pile Driver | Drops straight down, deep blast | Large (70) | Rare | 600 | ⭐ |
| 8 | Dirt Mover | Displaces terrain (utility) | Large (terrain) | Standard | 150 | |
| 9 | Crazy Ivan | Erratic trajectory, unpredictable | Medium (46×15!) | Legendary | 2,500 | ⭐ |
| 10 | Spider | Splits into crawling sub-munitions | Medium (scattered) | Tactical | 400 | ⭐ |
| 11 | Sniper Rifle | Tiny blast, precision damage | Tiny (15) | Rare | 700 | ⭐ |
| 12 | Magic Wall | Raises terrain wall (defensive) | N/A (builds) | Tactical | 200 | ⭐ |
| 13 | Dirt Slinger | Flings dirt at opponent | Medium (terrain) | Standard | 150 | |
| 14 | Zapper | Laser beam, instant hit | Line (40) | Tactical | 500 | |
| 15 | Napalm | Burns area, fire damage | Large (area) | Rare | 600 | ⭐ |
| 16 | Hail Storm | Rains down multiple projectiles | Large (scattered) | Epic | 1,200 | ⭐ |
| 17 | Ground Hog | Tunnels through terrain | Medium (50) | Tactical | 300 | |
| 18 | Worm | Burrows through ground, emerges | Medium (60) | Tactical | 350 | |
| 19 | Homing Worm | Worm + homing toward enemy | Medium (60) | Rare | 600 | |
| 20 | Skipper | Bounces across terrain surface | Small (per bounce) | Tactical | 300 | |
| 21 | Chain Reaction | Multiple blasts in sequence | Large (chain) | Epic | 1,000 | |
| 22 | Pineapple | Grenade-style, fragments on impact | Medium (spread) | Tactical | 350 | |
| 23 | Firecracker | Line of small explosions L+R | Medium (chain) | Tactical | 400 | |
| 24 | Homing Missile | Homes to opponent | Medium (80) | Rare | 700 | |
| 25 | Dirt Ball | Raises terrain (defensive) | N/A (builds) | Standard | 150 | |
| 26 | Tommy Gun | Rapid-fire burst of small shots | Small (×many) | Tactical | 400 | |
| 27 | Mountain Mover | Massive terrain displacement | Huge (terrain) | Epic | 1,000 | |
| 28 | Scatter Shot | Shotgun spread of fragments | Wide (scattered) | Tactical | 350 | |
| 29 | Cruiser | Guided missile, player controls | Medium | Rare | 800 | |

### ⭐ My Recommended 13 for Launch

| Tier | Weapon | Gold | Why |
|------|--------|------|-----|
| **FREE** | Single Shot (ID:0) | 0 | Infinite ammo fallback. You're never weaponless |
| **Standard** | Dirt Ball (ID:25) | 150 | Defensive terrain builder. Cheap utility |
| **Standard** | Magic Wall (ID:12) | 200 | Wall builder. Creates cover. Mind games |
| **Tactical** | Spider (ID:10) | 400 | Splits into crawlers. Area denial |
| **Tactical** | 3 Shot (ID:2) | 400 | Spread damage. Forgiving aim |
| **Tactical** | Heatseeker (ID:5) | 500 | Homing. Reliable damage dealer |
| **Rare** | Napalm (ID:15) | 600 | Area burn. Terrain melter |
| **Rare** | Pile Driver (ID:7) | 600 | Deep blast. Dig opponent out |
| **Rare** | Sniper Rifle (ID:11) | 700 | Precision. High risk/high reward |
| **Rare** | Big Shot (ID:1) | 700 | Big blast radius. Reliable |
| **Epic** | Jackhammer (ID:4) | 1,000 | Drilling chain blasts. Devastating |
| **Epic** | Hail Storm (ID:16) | 1,200 | Rain of projectiles. Area saturation |
| **Legendary** | Crazy Ivan (ID:9) | 2,500 | 15 random blasts. Total chaos. Game-ender |

**Gold budget math:** Players start with 1,000 Gold. So round 1 you can afford:
- 2 Tacticals (400+400) + Magic Wall (200) = 1,000 ✅
- 1 Rare (700) + 1 Standard (200) + remainder saves for R2 ✅
- Can never afford Legendary R1. Must earn Gold via damage first ✅

---

## 2. MONOREPO STRUCTURE (Target)

```
SolShot/
├── client/                    # Phaser + React frontend (EXISTS)
│   ├── public/
│   │   └── assets/            # Sprites, sounds, images (EXISTS)
│   ├── src/
│   │   ├── classes/           # Phaser game objects (EXISTS — modify)
│   │   ├── graphics/          # UI drawing functions (EXISTS)
│   │   ├── scenes/            # Game scenes (EXISTS — modify)
│   │   ├── socket/            # Socket.IO client (EXISTS — modify)
│   │   ├── wallet/            # NEW — Solana wallet adapter
│   │   ├── weapons/           # Weapon definitions (EXISTS — trim to 13)
│   │   └── App.js             # React root (EXISTS — modify)
│   └── package.json
│
├── server/                    # Express + Socket.IO backend (EXISTS)
│   ├── socket-io/
│   │   └── main.js            # Socket handlers (EXISTS — heavy rewrite)
│   ├── models/                # NEW — MongoDB schemas
│   │   ├── User.js
│   │   ├── Match.js
│   │   └── Weapon.js
│   ├── services/              # NEW — business logic
│   │   ├── physics.js         # Server-side physics engine
│   │   ├── match.js           # Match lifecycle
│   │   ├── gold.js            # Gold economy
│   │   └── solana.js          # Solana RPC + escrow
│   ├── middleware/             # NEW — auth, validation
│   │   └── auth.js            # Wallet signature verification
│   ├── index.js               # Server entry (EXISTS — modify)
│   └── package.json
│
├── programs/                  # NEW — Solana on-chain programs
│   ├── match-escrow/          # SOL wager escrow
│   └── shot-token/            # SHOT token + reward pool
│
├── .env                       # Environment config
├── .gitignore
└── README.md
```

---

## 3. PHASE PLAN — CLAUDE CODE GSD TASKS

### PHASE 1: Foundation (Weeks 1-2)
**Goal:** Game runs with SolShot branding, server has basic authority, DB connected

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 1.1 | `server/package.json` | Add: mongoose, @solana/web3.js, jsonwebtoken, bcrypt, cors, dotenv | `npm install` succeeds |
| 1.2 | `server/index.js` | Add MongoDB connection, env config, basic middleware | Server connects to Atlas on startup |
| 1.3 | `server/models/User.js` | Create: `{ walletAddress, username, goldBalance, matchesPlayed, wins, losses, createdAt }` | Can create/find user in Mongo |
| 1.4 | `server/models/Match.js` | Create: `{ players[], wagerAmount, status, rounds[], winner, createdAt, settledAt }` | Can create match doc |
| 1.5 | `server/socket-io/main.js` | Refactor rooms from memory array → DB-backed matches. Keep all existing events working | Online multiplayer still works, matches persist in DB |
| 1.6 | `client/src/weapons/array.js` | Trim to 13 weapons (IDs: 0,1,2,3,4,5,7,9,10,11,12,15,16) | Only 13 weapons appear in shop |
| 1.7 | `client/public/index.html` | Update title to "SolShot" | Tab shows SolShot |
| 1.8 | `client/src/App.js` | Update game title, remove Kongregate/GD SDK references | Clean app startup |
| 1.9 | `client/src/socket/index.js` | Point to localhost:5001 for dev, env var for prod URL | Client connects to local server |
| 1.10 | `server/.env.example` | Create template with all required env vars | Devs know what to configure |

### PHASE 2: Server Authority (Weeks 3-4)
**Goal:** Physics runs server-side. Client becomes a dumb renderer

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 2.1 | `server/services/physics.js` | Extract trajectory calc from Weapon.js: `calculateTrajectory(angle, power, gravity, terrainData) → [{x,y}...points]` | Unit test: given angle+power, returns correct arc |
| 2.2 | `server/services/physics.js` | Add: `calculateImpact(trajectory, terrain) → {x, y, terrainDelta[]}` | Impact point matches client-side calc |
| 2.3 | `server/services/physics.js` | Add: `calculateDamage(impactPoint, blastRadius, tankPositions[]) → {player: damage}` | Damage correct based on distance |
| 2.4 | `server/services/physics.js` | Add: `deformTerrain(terrain, impactPoint, blastRadius) → newTerrain` | Terrain updates match client craters |
| 2.5 | `server/socket-io/main.js` | Replace `shoot` relay → server receives `{angle, power, weaponId}`, runs physics, broadcasts `{trajectory, impact, damage, terrainUpdate}` | Client sends input only, server returns results |
| 2.6 | `client/src/classes/Weapon.js` | Modify to receive server results and animate (no local physics calc) | Client animates server-provided trajectory |
| 2.7 | `server/services/match.js` | Add match state machine: LOBBY → WEAPON_SHOP → BATTLE → ROUND_END → SETTLEMENT | Match progresses through states correctly |
| 2.8 | `server/socket-io/main.js` | Add turn validation: reject if not your turn, wrong weapon, etc. | Can't fire out of turn |
| 2.9 | `server/services/physics.js` | Add terrain generation server-side (currently host generates) | Both clients get identical terrain from server |
| 2.10 | Tests | Write integration test: 2 socket clients, full match flow | Automated match completes server-side |

### PHASE 3: Gold Economy + Weapon Shop (Weeks 5-6)
**Goal:** Weapon shop uses Gold. Server validates all purchases

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 3.1 | `server/services/gold.js` | Gold service: `startingGold(1000)`, `earnGold(damage)`, `spendGold(weaponCost)`, `getBalance()` | Gold math correct |
| 3.2 | `server/services/gold.js` | Gold earn rates: +15/HP damage, +200 kill bonus, +300 round win | Correct Gold earned per action |
| 3.3 | `server/models/Weapon.js` | Weapon definitions with costs: `{ id, name, tier, goldCost, blastRadius, damage }` for all 13 | Weapon data accessible from DB/config |
| 3.4 | `server/socket-io/main.js` | Replace `weaponPick` → `buyWeapon`: validate Gold balance, deduct cost, add to inventory | Can't buy weapons you can't afford |
| 3.5 | `client/src/scenes/scene-5/` | Update weapon shop UI: show Gold costs, player balance, grey out unaffordable | Shop shows costs and balance |
| 3.6 | `server/socket-io/main.js` | Add 30-second weapon shop timer, auto-start round when timer expires | Shop phase has time limit |
| 3.7 | `client/src/classes/HUD.js` | Add Gold display to in-game HUD | Players see Gold balance during match |
| 3.8 | `server/services/gold.js` | Gold earned from damage broadcasts to both players in real-time | Both players see Gold updates |

### PHASE 4: Wallet + SOL Wager (Weeks 7-8)
**Goal:** Players connect Solana wallet, wager SOL, winner gets paid

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 4.1 | `client/src/wallet/` | Install @solana/wallet-adapter-react, configure Solflare + Phantom providers | Wallet connect button works |
| 4.2 | `client/src/wallet/WalletContext.js` | Create React context: connected wallet, balance, sign transaction | Can read SOL balance |
| 4.3 | `server/middleware/auth.js` | Wallet auth: client signs message with wallet, server verifies signature | Only wallet owner can authenticate |
| 4.4 | `programs/match-escrow/` | Anchor program: `create_match`, `deposit_wager`, `settle_match`, `cancel_match` | Program deploys to devnet |
| 4.5 | `server/services/solana.js` | Solana service: create match PDA, verify deposits, sign settlement TX | Server can interact with escrow program |
| 4.6 | `client/src/scenes/scene-3/` | Add wager selection UI: 0.01 / 0.05 / 0.1 / 0.25 / 0.5 SOL tiers | Player selects wager amount |
| 4.7 | `server/socket-io/main.js` | On `joinRoom`: verify wallet balance ≥ wager, prompt deposit TX | Can't join match without enough SOL |
| 4.8 | `server/services/match.js` | On match end: call escrow `settle_match` — winner gets 90%, treasury 7%, ops 3% | SOL distributed correctly on devnet |
| 4.9 | `client/src/scenes/main/` | Add result screen: SOL won/lost, match stats | Winner sees SOL earned |
| 4.10 | `server/services/match.js` | Handle edge cases: disconnect → forfeit, timeout → draw, escrow refund on cancel | No SOL lost to bugs |

### PHASE 5: UI Reskin + Polish (Weeks 9-10)
**Goal:** Looks like SolShot, not Pocket Tanks

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 5.1 | `client/src/scenes/scene-1/` | Replace main menu with SolShot branding, lobby buttons | SolShot main menu |
| 5.2 | `client/src/scenes/scene-2/` | Wallet connect screen replaces name/color picker | Connect wallet → enter game |
| 5.3 | `client/src/scenes/scene-3/` | Match mode selection with wager tiers | Mode select with SOL amounts |
| 5.4 | `client/src/scenes/scene-4/` | Room lobby with SolShot styling | Rooms show wager amounts |
| 5.5 | `client/src/classes/HUD.js` | Reskin HUD: SolShot colors, Gold display, SOL balance | New HUD design |
| 5.6 | `client/public/assets/` | New tank sprites, backgrounds, UI elements (your Midjourney assets) | Visual refresh |
| 5.7 | `client/src/App.js` | Add screen shake on impact (Phaser camera shake) | Screen shakes on explosion |
| 5.8 | `client/src/scenes/main/` | Add kill cam / replay of winning shot | End-of-match replay |

### PHASE 6: SHOT Token + Prestige (Weeks 11-13)
**Goal:** SHOT token live, prestige burns working

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 6.1 | `programs/shot-token/` | SPL token: 10M supply, 70% reward pool PDA | Token minted on devnet |
| 6.2 | `server/services/solana.js` | Milestone tracking: matches played → SHOT emissions | SHOT earned at milestones |
| 6.3 | `client/src/wallet/` | Show SHOT balance in UI | Player sees SHOT balance |
| 6.4 | `server/services/solana.js` | Prestige burn: 200/500/1200/4000 SHOT per tier | Burns execute on-chain |
| 6.5 | `client/src/scenes/` | Prestige UI: tier badges, burn button, confirmation | Prestige tiers visible |

### PHASE 7: Deploy + Launch (Weeks 14-16)
**Goal:** Live on mainnet

| Task | File(s) | What Claude Code Does | Test |
|------|---------|----------------------|------|
| 7.1 | Deploy | Server to Render/Railway, client to Vercel/Netlify | Site accessible at SolShot.gg |
| 7.2 | Mainnet | Switch programs from devnet → mainnet | Real SOL wagers work |
| 7.3 | Raydium | Seed SHOT/SOL pool (500K SHOT + 2.5 SOL) | Token tradeable |
| 7.4 | Monitoring | Add error tracking, match analytics, SOL flow monitoring | Dashboard shows health |

---

## 4. SOCKET EVENT CONTRACTS (New)

### Client → Server

```typescript
// Authentication
{ event: 'authenticate', data: { walletAddress: string, signature: string, message: string } }

// Match lifecycle
{ event: 'createMatch', data: { wagerAmount: number, roundType: '1' | 'BO3' | 'BO5', isPrivate: boolean } }
{ event: 'joinMatch', data: { matchId: string } }
{ event: 'ready', data: {} }

// Weapon shop
{ event: 'buyWeapon', data: { weaponId: number } }
{ event: 'shopDone', data: {} }

// Gameplay (CLIENT SENDS INPUT ONLY)
{ event: 'fire', data: { angle: number, power: number, weaponId: number } }
{ event: 'move', data: { direction: 'left' | 'right' } }
```

### Server → Client

```typescript
// Authentication
{ event: 'authenticated', data: { userId: string, username: string, stats: {} } }

// Match lifecycle
{ event: 'matchCreated', data: { matchId: string, roomCode: string } }
{ event: 'playerJoined', data: { player: { wallet, username } } }
{ event: 'wagerLocked', data: { txSignature: string } }
{ event: 'shopPhase', data: { weapons: Weapon[], goldBalance: number, timer: 30 } }
{ event: 'roundStart', data: { terrain: number[], tankPositions: {}, firstTurn: string } }

// Gameplay (SERVER SENDS RESULTS ONLY)  
{ event: 'turnResult', data: { 
    playerId: string,
    trajectory: {x: number, y: number}[],
    impact: {x: number, y: number},
    damage: { [playerId]: number },
    terrainUpdate: number[],
    goldEarned: number,
    nextTurn: string
  } 
}
{ event: 'roundEnd', data: { winner: string, scores: {}, goldTotals: {} } }
{ event: 'matchEnd', data: { winner: string, solWon: number, solLost: number, shotEarned?: number } }
```

---

## 5. DATABASE SCHEMAS

### User Collection
```javascript
{
  _id: ObjectId,
  walletAddress: String,        // Solana pubkey (unique, indexed)
  username: String,             // Display name
  stats: {
    matchesPlayed: Number,
    wins: Number,
    losses: Number,
    totalSolWon: Number,
    totalSolLost: Number,
    totalShotEarned: Number,
    shotBurned: Number,
    prestigeTier: Number        // 0-5
  },
  createdAt: Date,
  lastActive: Date
}
```

### Match Collection
```javascript
{
  _id: ObjectId,
  roomCode: String,             // e.g., "TANK-7X3F"
  players: [{
    walletAddress: String,
    username: String,
    score: Number,
    goldBalance: Number,
    weapons: [Number],          // weapon IDs
    depositTx: String           // on-chain TX signature
  }],
  wagerAmount: Number,          // SOL per player
  roundType: String,            // '1', 'BO3', 'BO5'
  status: String,               // 'lobby', 'weapon_shop', 'battle', 'settling', 'complete', 'cancelled'
  escrowPDA: String,            // on-chain escrow address
  rounds: [{
    terrain: [Number],          // terrain heightmap
    turns: [{
      playerId: String,
      weaponId: Number,
      angle: Number,
      power: Number,
      damage: Object,
      goldEarned: Number
    }],
    winner: String
  }],
  winner: String,
  settlementTx: String,         // on-chain settlement TX
  createdAt: Date,
  settledAt: Date
}
```

---

## 6. ENVIRONMENT VARIABLES

```env
# Server
PORT=5001
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/solshot

# Solana
SOLANA_RPC=https://api.devnet.solana.com
SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json
MATCH_ESCROW_PROGRAM_ID=<deployed program ID>
SHOT_TOKEN_MINT=<token mint address>
TREASURY_WALLET=<treasury pubkey>
OPS_WALLET=<ops pubkey>

# Auth
JWT_SECRET=<random 64 char string>

# Client (in client/.env)
REACT_APP_SERVER_URL=http://localhost:5001
REACT_APP_SOLANA_NETWORK=devnet
REACT_APP_MATCH_ESCROW_PROGRAM_ID=<same as server>
```

---

## 7. CRITICAL RULES FOR CLAUDE CODE

1. **Never delete existing weapon behavior code** — only trim the array.js imports to the 13 selected weapons. The weapon classes in Standard.js stay intact (we may add more later).

2. **Server physics must produce IDENTICAL results to client physics** — extract the exact same formulas from Weapon.js `defaultUpdate`, `defaultBounce`, `retractInTerrain`. Don't approximate.

3. **Keep Socket.IO event naming consistent** — camelCase, verb-first: `createMatch`, `joinMatch`, `buyWeapon`, `fire`, not `match_create` etc.

4. **All Gold calculations happen server-side** — client displays Gold but never computes it.

5. **Terrain is a 1D heightmap array** — `terrain[x] = y` where y is the highest solid pixel. Server generates this, clients render from it.

6. **Match state machine is the source of truth** — no action can happen outside the current state (can't fire during weapon_shop, can't buy during battle).

7. **Wallet addresses are the user identity** — no email, no password. Wallet signature = authentication.

8. **Keep the existing Phaser scene flow** — Scene1→2→3→4→5→Main. Just modify contents, don't restructure.

9. **Test with 2 browser tabs** — the existing multiplayer flow (create room tab 1, join room tab 2) is our primary test method.

10. **Commit after every completed task** — one task = one commit on `dev` branch.

---

## 8. HANDOFF CHECKLIST

Before handing this to Claude Code, confirm:

- [ ] Repo cloned and pushed to github.com/JJ-ME55/SolShot
- [ ] `dev` branch created and checked out
- [ ] Node.js installed (`node --version` works)
- [ ] `npm install` done in both `/server` and `/client`
- [ ] Game runs locally (both terminals)
- [ ] MongoDB Atlas cluster created, connection string in `.env`
- [ ] Solana devnet wallet created
- [ ] This spec file is in the repo root as `SOLSHOT_GSD_SPEC.md`

Once all boxes ticked → Claude Code starts at Task 1.1
