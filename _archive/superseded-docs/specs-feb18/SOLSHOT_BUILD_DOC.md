# SOLSHOT — MASTER BUILD DOCUMENT
## Technical Architecture & Step-by-Step Build Plan

---

## 1. WHAT WE'RE BUILDING

SolShot is a browser-based, real-time multiplayer artillery game on Solana. Players wager SOL in PvP matches. Winner takes the pot minus a 10% rake. A deflationary SHOT token provides a cosmetic prestige system with permanent burns. In-match economy uses Gold (non-blockchain, resets each match).

**Core loop:** Wager SOL → Play artillery match → Winner gets pot → Earn SHOT milestones → Burn SHOT for prestige status → Repeat

---

## 2. THE EXISTING CODEBASE — pocket-tanks

**Repo:** `github.com/Amankumar321/pocket-tanks`  
**Stack:** React (frontend) + Node.js/Express (server) + Phaser.js (game engine) + Socket.IO (real-time multiplayer) + MongoDB (data)  
**Live demo:** pocket-tanks.netlify.app

### What Already Exists (✅ = usable, 🔧 = needs modification)

| Feature | Status | Notes |
|---------|--------|-------|
| Phaser.js game engine | ✅ | 2D rendering, physics, animations already wired |
| Projectile physics | ✅ | Angle + power → trajectory. Core mechanic works |
| Terrain generation | ✅ | Procedural terrain with destructible surfaces |
| Terrain deformation | ✅ | Craters on impact. Key artillery mechanic |
| Tank rendering & positioning | ✅ | Tanks sit on terrain, turret rotation |
| Weapon system | ✅ | 30 weapons fully implemented — SolShot's 13 all map to existing ones |
| Turn-based gameplay | ✅ | Player 1 fires, Player 2 fires. Turn logic exists |
| Socket.IO multiplayer | ✅ | Real-time rooms with join codes already implemented |
| Room creation & joining | ✅ | "Create room + share code" flow exists — this IS private matches |
| CPU opponent (AI) | ✅ | Single-player / practice mode. Good for onboarding |
| 2P local mode | ✅ | Two players, same keyboard. Good for testing |
| Express.js server | ✅ | HTTP + WebSocket server. Needs Solana integration |
| MongoDB integration | ❌ | No database — pure in-memory rooms array. Need MongoDB from scratch |
| React UI shell | 🔧 | Basic menus exist but need complete SolShot reskin |
| Sound effects | ✅ | 20+ sounds already integrated (explosions, weapons, UI, music) |
| Screen shake / juice | ❌ | Not implemented — NEEDS ADDING (MVP requirement) |
| Anti-cheat | ❌ | Client-side physics — NEEDS server-authoritative mode |
| Mobile responsive | ❌ | Desktop keyboard controls only — NEEDS touch/responsive |
| Wallet integration | ❌ | No Solana — NEEDS full integration |
| Wager system | ❌ | No SOL flow — NEEDS building from scratch |
| Token system | ❌ | No SHOT — NEEDS Solana program + integration |
| Prestige system | ❌ | Not present — NEEDS building |
| Cosmetics / Armory | ❌ | Not present — NEEDS building |
| Gold (in-match currency) | 🔧 | Weapon shop UI exists (WeaponShopScroll.js) — needs Gold logic added |

### Key Architecture Insight

The existing codebase has the **game physics running client-side in Phaser.js**. For a wagering game, this is a security problem — a player could modify their client to cheat. The server currently acts as a relay (forwarding moves between players via Socket.IO) but doesn't validate physics.

**Critical change needed:** Server-authoritative physics. The server must run the physics simulation and only send results to clients. Clients send inputs (angle, power, weapon choice), server calculates trajectory, hit detection, damage, and broadcasts the outcome. Clients render the result but can't alter it.

This is the single biggest architectural change from the base codebase.

---

## 3. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────┐
│                     PLAYER'S BROWSER                      │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  React UI   │  │  Phaser.js   │  │  Phantom       │   │
│  │  (menus,    │  │  (game       │  │  Wallet        │   │
│  │   HUD,      │←→│   renderer,  │  │  (SOL txns)    │   │
│  │   screens)  │  │   animations)│  │                │   │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘   │
│         │                │                   │            │
│         └────────┬───────┘                   │            │
│                  │ Socket.IO                 │ @solana/web3│
└──────────────────┼───────────────────────────┼────────────┘
                   │                           │
                   ▼                           ▼
┌──────────────────────────────┐   ┌────────────────────────┐
│      GAME SERVER (Node.js)   │   │   SOLANA BLOCKCHAIN    │
│                              │   │                        │
│  ┌────────────────────────┐  │   │  ┌──────────────────┐  │
│  │  Match Manager         │  │   │  │  SHOT Token      │  │
│  │  - room creation       │  │   │  │  (SPL, 10M       │  │
│  │  - player matching     │  │   │  │   fixed supply)  │  │
│  │  - turn sequencing     │  │   │  └──────────────────┘  │
│  └────────────────────────┘  │   │                        │
│  ┌────────────────────────┐  │   │  ┌──────────────────┐  │
│  │  Physics Engine        │  │   │  │  Reward Pool     │  │
│  │  - trajectory calc     │  │   │  │  (PDA, 7M SHOT   │  │
│  │  - terrain collision   │  │   │  │   5%/mo emission)│  │
│  │  - damage calculation  │  │   │  └──────────────────┘  │
│  │  - terrain deformation │  │   │                        │
│  │  SERVER-AUTHORITATIVE  │  │   │  ┌──────────────────┐  │
│  └────────────────────────┘  │   │  │  Vesting         │  │
│  ┌────────────────────────┐  │   │  │  (PDA, 1.5M SHOT │  │
│  │  Economy Manager       │  │   │  │   12mo linear)   │  │
│  │  - Gold per match      │  │   │  └──────────────────┘  │
│  │  - weapon shop logic   │  │   │                        │
│  │  - damage→Gold rewards │  │   │  ┌──────────────────┐  │
│  └────────────────────────┘  │   │  │  Match Escrow    │  │
│  ┌────────────────────────┐  │   │  │  (PDA, holds     │  │
│  │  Settlement Engine     │  │   │  │   wagers during   │  │
│  │  - SOL payout calc     │──│───│─→│   match, settles │  │
│  │  - rake deduction      │  │   │  │   on completion) │  │
│  │  - SHOT milestone check│  │   │  └──────────────────┘  │
│  └────────────────────────┘  │   │                        │
│  ┌────────────────────────┐  │   │  ┌──────────────────┐  │
│  │  Player Database       │  │   │  │  Prestige Burns  │  │
│  │  (PostgreSQL/MongoDB)  │  │   │  │  (permanent,     │  │
│  │  - display names       │  │   │  │   public burn    │  │
│  │  - match history       │  │   │  │   address)       │  │
│  │  - stats & milestones  │  │   │  └──────────────────┘  │
│  │  - cosmetic inventory  │  │   │                        │
│  └────────────────────────┘  │   └────────────────────────┘
└──────────────────────────────┘
```

### What's On-Chain vs Off-Chain

| Data | Location | Why |
|------|----------|-----|
| SOL wagers & payouts | On-chain (escrow PDA) | Trust. Players must verify funds are locked |
| SHOT token balances | On-chain (SPL) | Transparency. Burn verification |
| Prestige rank | On-chain (PDA per player) | Permanent, verifiable, can't be faked |
| Reward pool emissions | On-chain (program logic) | Hard-coded rules nobody can override |
| Match physics/results | Off-chain (game server) | Too fast for blockchain. Server-authoritative |
| Gold (in-match currency) | Off-chain (server memory) | Ephemeral. Resets every match. Never persists |
| Display names | Off-chain (database) | Cosmetic. No trust requirement |
| Match history & stats | Off-chain (database) | High volume. Cheap storage. Read-heavy |
| Cosmetic inventory | Off-chain (database) | Low stakes. Can add on-chain later |
| Weapon loadouts | Off-chain (server memory) | Per-match only |

---

## 4. SOLANA PROGRAMS (SMART CONTRACTS)

You need 3 Solana programs. These can be written in Anchor (Rust framework).

### Program 1: Match Escrow

Handles SOL wagers, holds funds during match, settles on completion.

```
FLOW:
1. Server creates match PDA with match_id, wager_amount, player_count
2. Each player sends SOL to match PDA via signed transaction
3. PDA holds all wagers until match completes
4. Server submits match result (winner wallet) with server authority signature
5. Program distributes: 90% to winner, 7% to treasury, 3% to operations
6. If match is abandoned/forfeited, refunds remaining players minus forfeiter

ACCOUNTS:
- match_account (PDA): match_id, wager, players[], status, winner
- treasury (PDA): accumulates 7% rake
- operations (wallet): receives 3% rake
- server_authority (keypair): signs match results — ONLY the server can settle
```

**Anti-exploit:** The server authority keypair is the only signer that can settle matches. A rogue player can't claim they won. The server validates physics, determines the winner, and submits the settlement transaction.

### Program 2: SHOT Token + Reward Pool

Manages the token, drip emissions, and prestige burns.

```
FLOW (Emissions):
1. Player achieves milestone (server validates: 3 wins today, 100 kills, etc.)
2. Server calls reward_pool.emit(player_wallet, amount)
3. Program checks: monthly emissions < 5% of remaining pool
4. If under cap: transfers SHOT from pool PDA to player wallet
5. If over cap: queues for next month

FLOW (Prestige Burn):
1. Player requests prestige-up via client
2. Server validates: player has required match count, kills, current prestige level
3. If eligible: server calls prestige.burn(player_wallet, tier, amount)
4. Program burns SHOT tokens (sends to burn address)
5. Program updates player's prestige PDA: new tier, timestamp

ACCOUNTS:
- shot_mint: SPL token, mint authority revoked
- reward_pool (PDA): holds 7M SHOT, emission logic
- prestige_account (PDA per player): tier, total_burned, timestamps
- burn_address: standard Solana burn (close account or send to 0x000...)
```

### Program 3: Team Vesting

Simple linear vesting for the 1.5M team allocation.

```
FLOW:
1. At launch: 1.5M SHOT deposited into vesting PDA
2. Each month: ~125,000 SHOT unlocks
3. Team wallet can claim unlocked tokens anytime
4. Fully vested after 12 months
5. All state is public — anyone can verify remaining lockup

ACCOUNTS:
- vesting_account (PDA): total, released, start_time, beneficiary
```

---

## 5. MATCH FLOW — COMPLETE SEQUENCE

```
1. LOBBY
   Player connects wallet → sees SOL balance
   Selects: Quick Match / 1v1 / High Roller / Create Private / Join Private
   Selects round length: 1 / BO3 / BO5
   
2. MATCHMAKING
   Server creates match room via Socket.IO
   Private: generates room code (e.g., "TANK-7X3F"), player shares with friends
   Public: listed in lobby, anyone can join
   Players join room → server verifies SOL balance ≥ wager
   
3. WAGER LOCK
   All players connected → server prompts wallet transaction
   Each player signs TX sending wager to match escrow PDA
   Server waits for all TX confirmations on-chain
   If any player fails to deposit within 30s → match cancelled, deposits refunded
   
4. WEAPON SHOP (Gold)
   Match starts → all players get 1,000 Gold
   Weapon shop screen: buy weapons with Gold
   Timer: 30 seconds to shop, then round starts automatically
   All purchases validated server-side (can't buy what you can't afford)
   
5. BATTLE ROUND
   Turn order: randomized at match start, fixed for duration
   Active player sets angle + power + weapon → clicks FIRE
   Client sends: { angle: 53, power: 72, weapon: "cluster_bomb" }
   Server runs physics:
     - Calculate trajectory with angle, power, wind
     - Detect terrain collision point
     - Calculate damage to all players in blast radius
     - Deform terrain (crater)
     - Calculate Gold earned from damage dealt
   Server broadcasts result to all clients:
     { trajectory: [...points], impact: {x, y}, damage: {player2: 35}, terrain_update: [...], gold_earned: 120 }
   Clients animate the shot using broadcast data (NO local physics)
   Next player's turn
   
6. ROUND END
   Round ends when: one player reaches 0 HP, OR all players have fired X shots
   Server determines round winner
   Server broadcasts round result
   
   If more rounds remain:
     → Back to WEAPON SHOP with accumulated Gold
     → HP resets, terrain regenerates (or persists — design choice)
   
   If match complete (enough rounds won):
     → Proceed to SETTLEMENT
   
7. SETTLEMENT
   Server determines match winner
   Server signs settlement TX with server authority keypair
   Match escrow program distributes SOL:
     Winner: wager × player_count × 0.9
     Treasury: wager × player_count × 0.07
     Operations: wager × player_count × 0.03
   Server checks milestone progress for all players
   If milestone hit → triggers SHOT emission from reward pool
   Server records match in database (stats, history)
   
8. RESULT SCREEN
   WIN: Shows SOL earned, SHOT milestone (if triggered), stats, REMATCH button
   LOSE: Shows SOL lost, stats, RUN IT BACK button
   Both: LOBBY and MENU navigation options
```

---

## 6. WEAPON ROSTER

All weapons balanced around Gold cost vs damage vs utility.

| Weapon | Gold Cost | Damage | Blast Radius | Special | Tier |
|--------|-----------|--------|--------------|---------|------|
| Mortar | FREE | 25 | 30 | Standard projectile. Infinite ammo | Standard |
| Dirt Ball | 150 | 0 | 50 | Raises terrain. Defensive | Standard |
| Bouncer | 200 | 30 | 20 | Bounces off terrain once before exploding | Standard |
| Cluster Bomb | 300 | 40 | 60 | Splits into 5 bomblets at apex | Tactical |
| Napalm | 500 | 15/turn | 45 | Burns area for 3 turns. Area denial | Tactical |
| Roller | 400 | 45 | 15 | Rolls downhill on terrain contact | Tactical |
| Dirt Wall | 200 | 0 | 80 | Raises a wall of terrain. Shield | Tactical |
| Mega Roller | 800 | 65 | 20 | Heavy roller. Crushes through small hills | Rare |
| Meltdown | 600 | 55 | 45 | Napalm + terrain melt. Burns AND deforms | Rare |
| Sniper | 700 | 70 | 5 | Tiny blast but huge damage. Precision shot | Rare |
| Penetrator | 1,200 | 80 | 10 | Punches THROUGH terrain. Ignores cover | Epic |
| Earthquake | 1,000 | 35 | 100 | Shakes terrain. Moves all tanks. Chaos | Epic |
| Tactical Nuke | 2,500 | 100 | 100 | Total devastation. Game-ender if you hit | Legendary |

**Design philosophy:** Mortar is always free and infinite — you can never be weaponless. Expensive weapons are high-risk/high-reward. Gold management IS the strategy layer. Do you save for a nuke or buy steady cluster bombs?

---

## 7. GOLD ECONOMY (IN-MATCH)

- Every player starts with **1,000 Gold**
- Gold earned during match:
  - Direct hit: **+15 Gold per HP of damage**
  - Kill: **+200 Gold bonus**
  - Round win: **+300 Gold bonus**
- Gold resets at match end — never persists, never tradeable
- Server tracks all Gold balances — clients can't fake it
- Weapon shop opens between rounds (30 second timer)
- Players can see each other's Gold totals (or hide — design choice for mind games)

---

## 8. SHOT TOKEN ECONOMICS

### Supply & Distribution

| Allocation | Amount | Location | Access |
|------------|--------|----------|--------|
| Reward Pool | 7,000,000 (70%) | PDA (program-controlled) | Max 5% of remaining per month |
| Initial Liquidity + Community | 1,500,000 (15%) | 500K in Raydium LP, 1M for community | Immediate |
| Team | 1,500,000 (15%) | Vesting PDA | Linear 12-month vest |
| **Total** | **10,000,000** | **Mint authority revoked** | **Fixed forever** |

### Earning SHOT (Milestones — NOT per-match)

| Milestone | SHOT Reward | Frequency |
|-----------|-------------|-----------|
| First win of the day | +2 SHOT | Daily |
| 3 wins in a day | +5 SHOT | Daily |
| 10 kills in a day | +3 SHOT | Daily |
| 50th match played | +20 SHOT | One-time |
| 100th match played | +50 SHOT | One-time |
| First prestige | +30 SHOT | One-time |
| Season pass completion | +200 SHOT | Seasonal |
| Tournament placement | +50-500 SHOT | Event |

**Max realistic monthly earn:** ~80-120 SHOT for an active daily player. Casual players earn less.

### Burning SHOT (Permanent Destruction)

| Burn Sink | Cost | What You Get |
|-----------|------|-------------|
| Prestige 1 (Private) | 200 SHOT | Olive Drab skin, bronze pip badge |
| Prestige 2 (Corporal) | 400 SHOT | Gunmetal skin, dust cloud kill effect |
| Prestige 3 (Sergeant) | 600 SHOT | Desert Tan skin, dirt spray, Sgt Camo unlock |
| Prestige 4 (Lieutenant) | 900 SHOT | Gold Trim skin, ranked queue access |
| Prestige 5 (Captain) | 1,200 SHOT | Tiger Stripe skin, fire ring kill effect |
| Prestige 6 (Major) | 1,600 SHOT | Blaze Orange skin, shockwave effect |
| Prestige 7 (Colonel) | 2,000 SHOT | Blood Red skin, lightning, Colonel's Edge border |
| Prestige 8 (Brigadier) | 2,500 SHOT | Crimson Black skin, animated lobby entry |
| Prestige 9 (General) | 3,000 SHOT | Void Purple skin, plasma burst, custom kills |
| Prestige 10 (Marshal) | 4,000 SHOT | Sol Holo skin, solar flare, Marshal Crown |
| **Total to max prestige** | **16,400 SHOT** | |
| Cosmetic skins (Armory) | 100-800 SHOT | Various tank skins, kill effects, borders |

### Prestige Gating (Anti-Buy-To-Top)

Each prestige tier requires BOTH token burn AND gameplay milestones:

| Prestige | SHOT Cost | Matches Required | Kills Required | Wins Required |
|----------|-----------|------------------|----------------|---------------|
| P1 | 200 | 25 | 15 | 10 |
| P2 | 400 | 60 | 40 | 25 |
| P3 | 600 | 100 | 80 | 45 |
| P4 | 900 | 175 | 140 | 80 |
| P5 | 1,200 | 275 | 220 | 130 |
| P6 | 1,600 | 400 | 320 | 190 |
| P7 | 2,000 | 550 | 450 | 270 |
| P8 | 2,500 | 750 | 600 | 370 |
| P9 | 3,000 | 1,000 | 800 | 500 |
| P10 | 4,000 | 1,500 | 1,200 | 750 |

You can buy all the SHOT you want — you still can't prestige without playing.

### Token Launch Sequence

1. Launch game WITHOUT token (SOL wagers only)
2. Build player base for 2-4 weeks
3. Deploy SHOT token (SPL, 10M supply, revoke mint)
4. Transfer 7M → reward pool PDA, 1.5M → vesting PDA
5. Seed Raydium pool: 500K SHOT + 2.5 SOL
6. Announce token, activate prestige system
7. Retroactive SHOT drops to early players based on play history
8. Hold 1M SHOT for community incentives, tournaments, marketing

---

## 9. USER ACCOUNTS & AUTHENTICATION

| Component | Implementation |
|-----------|---------------|
| Authentication | Solana wallet signature (Phantom, Solflare, Backpack) |
| Player identity | Wallet public key |
| Display name | Off-chain, stored in database, set by player |
| Default name | Generated from wallet: "Tank_" + first 4 chars of pubkey |
| Private matches | Room code generated server-side (e.g., "TANK-7X3F") |
| Friend system | Share room codes / links: solshot.gg/match/7X3F |
| Session | JWT token signed after wallet verification, expires 24h |

**Sign-in flow:**
1. Player clicks "Connect Wallet" → Phantom popup
2. Player signs a message: "Sign in to SolShot: [nonce]"
3. Server verifies signature matches wallet pubkey
4. Server issues JWT for session authentication
5. All subsequent Socket.IO messages include JWT
6. Wallet remains connected for SOL transactions (wager deposits)

---

## 10. ANTI-CHEAT (MVP)

| Threat | Mitigation |
|--------|------------|
| Modified client (fake damage) | Server-authoritative physics. Client sends inputs only, server calculates all outcomes |
| Fake match results | Server authority keypair signs all settlement transactions. Only server can settle |
| Speed hacking (faster turns) | Server enforces turn timer. Inputs only accepted during player's turn window |
| Gold manipulation | All Gold tracked server-side. Shop purchases validated server-side |
| Wallet spoofing | All transactions require wallet signature verification |
| Bot farming (SHOT milestones) | Rate limits on milestone claims. Minimum match duration requirements. Suspicious pattern detection |
| Collusion (friends throwing matches) | Rake makes this -EV. At 10% rake, colluding costs 10% of pot per match. Not profitable |

**The big one is server-authoritative physics.** The existing codebase runs physics client-side. This MUST change. The Phaser.js physics on the client becomes a renderer only — it animates trajectories that the server has already calculated. The server runs a headless physics simulation (same math, no rendering) for every shot.

---

## 11. SOUND & JUICE (MVP)

### Sound Effects Needed

| Sound | Source | Notes |
|-------|--------|-------|
| Mortar fire | freesound.org | Short cannon thump |
| Projectile whoosh | freesound.org | Whistle during flight |
| Explosion (small) | freesound.org | Mortar, bouncer impacts |
| Explosion (large) | freesound.org | Nuke, penetrator |
| Cluster split | freesound.org | Multiple pops |
| Hit confirmation | custom | Satisfying "ding" when you deal damage |
| Kill confirmation | custom | Bigger ding + voice line or horn |
| Terrain deform | freesound.org | Earth crumbling |
| Menu click | freesound.org | Mechanical/military click |
| Match start | custom | Horn or alarm |
| Victory sting | custom | 2-3 second triumphant jingle |
| Defeat sting | custom | 2-3 second somber jingle |
| Gold earned | freesound.org | Coin clink |
| SOL payout | custom | Cash register or digital chime |

### Screen Shake & Juice

- **Screen shake on explosions:** Proportional to blast radius. Nuke = massive shake. Mortar = slight rumble
- **Camera follow projectile:** Smooth pan following the shot in flight
- **Impact crater animation:** Terrain chunks fly out, dust cloud
- **Damage numbers:** Float up from hit player, red text, fade out
- **Kill text:** Large "ELIMINATED" across screen when you kill someone
- **Gold popup:** "+120 🪙" floats up on damage dealt
- **Tank recoil:** Small kick-back animation on fire
- **Turret smoke:** Puff of smoke from barrel on fire

All of these are Phaser.js animations/tweens — no new library needed.

---

## 12. MOBILE RESPONSIVENESS (MVP)

The game is designed at 16:9 landscape. Mobile needs:

| Element | Desktop | Mobile |
|---------|---------|--------|
| Angle control | Slider + keyboard (Q/E) | Touch slider + drag on tank turret |
| Power control | Slider + keyboard (W/S) | Touch slider |
| Weapon select | Click arrows | Swipe or tap arrows |
| Fire button | Click or Space | Large touch button |
| HUD elements | Small, positioned | Scaled up for thumb targets |
| Menu navigation | Click buttons | Touch buttons (min 44px touch targets) |

**Phantom browser:** Players on mobile use Phantom's built-in dApp browser. The site loads in a WebView. Touch events replace mouse events. The game canvas scales to fill the viewport.

**Key requirement:** All interactive elements must be minimum 44×44px touch targets. The battle HUD sliders need to be touch-draggable. The FIRE button needs to be massive and thumb-friendly.

---

## 13. STEP-BY-STEP BUILD PLAN

### PHASE 1: FORK & FOUNDATION (Week 1-2)

**Goal:** Get the base game running locally, understand the codebase, set up SolShot project structure.

```
□ Fork pocket-tanks repo
□ Run client + server locally, play a match
□ Read through ALL source files — understand:
    □ How Phaser scenes are structured
    □ How Socket.IO rooms work
    □ How physics/trajectory is calculated
    □ How terrain generation works
    □ How weapons fire and deal damage
    □ How turns are managed
□ Create new SolShot repo
□ Strip out Pocket Tanks branding/assets
□ Set up project structure:
    /client (React + Phaser.js)
    /server (Node.js + Express + Socket.IO)
    /contracts (Anchor/Solana programs)
    /assets (art, sound, UI)
□ Set up development environment:
    □ Node.js 18+
    □ Solana CLI tools
    □ Anchor framework
    □ Local Solana validator (for testing)
□ Deploy to local dev: client on localhost:3000, server on localhost:4000
```

### PHASE 2: SERVER-AUTHORITATIVE PHYSICS (Week 2-3)

**Goal:** Move physics from client to server. This is the most critical change.

```
□ Extract physics calculation code from Phaser client
□ Create headless physics module on server (pure math, no rendering):
    □ Trajectory calculation (angle, power, wind → point array)
    □ Terrain collision detection
    □ Blast radius damage calculation
    □ Terrain deformation calculation
□ Modify client→server flow:
    □ Client sends: { angle, power, weapon }
    □ Server calculates: trajectory, impact, damage, terrain changes
    □ Server broadcasts: { trajectory_points, impact_pos, damage_map, terrain_update, gold_earned }
    □ Client animates using server data (Phaser tweens along trajectory points)
□ Remove client-side physics decision-making (keep only for visual prediction/animation)
□ Test: Two clients, same match, verify identical outcomes
□ Test: Modified client can't produce different damage values
```

### PHASE 3: SOLSHOT GAME MECHANICS (Week 3-5)

**Goal:** Implement the actual SolShot game rules, weapons, Gold economy.

```
□ Implement weapon roster (13 weapons with unique behaviors):
    □ Mortar (standard arc)
    □ Dirt Ball (terrain raising)
    □ Bouncer (terrain bounce)
    □ Cluster Bomb (split at apex)
    □ Napalm (area-over-time)
    □ Roller (terrain-following)
    □ Dirt Wall (terrain creation)
    □ Mega Roller (heavy terrain-following)
    □ Meltdown (burn + deform)
    □ Sniper (tiny radius, high damage)
    □ Penetrator (ignores terrain)
    □ Earthquake (global shake + move)
    □ Tactical Nuke (massive everything)
□ Implement Gold economy:
    □ Starting Gold: 1,000
    □ Gold from damage: 15 per HP
    □ Gold from kills: +200 bonus
    □ Gold from round wins: +300 bonus
    □ Weapon shop between rounds (server-validated purchases)
□ Implement round system:
    □ BO1, BO3, BO5 configurable
    □ HP reset between rounds
    □ Terrain: new terrain per round (or persistent — test both)
    □ Gold carries across rounds within a match
□ Implement wind system:
    □ Random wind per round
    □ Wind affects trajectory (server-side calculation)
    □ Wind display on HUD
□ Implement tank movement (limited moves per turn, like Pocket Tanks)
□ Add match timer: 30 seconds per turn, auto-skip if expired
```

### PHASE 4: UI RESKIN (Week 4-6)

**Goal:** Replace all Pocket Tanks UI with SolShot military aesthetic.

```
□ Implement SolShot design system:
    □ Colors: olive, khaki, rust, amber, bone, sol-green
    □ Fonts: Black Ops One (headings), Share Tech Mono (data), Bebas Neue (numbers)
    □ Noise overlay + scanlines
□ Build screens (reference solshot_v5.jsx mockups):
    □ Main Menu (logo, 4 nav buttons, wallet display)
    □ Lobby / Deploy (round selector, match types, lobby list)
    □ Weapon Shop (between rounds, Gold currency)
    □ Battle HUD (angle, power, weapon, fire, wind, pot, health, Gold)
    □ Win Screen (SOL earned, SHOT milestone, stats, rematch)
    □ Lose Screen (SOL lost, stats, run it back)
    □ Armory (SOL shop + SHOT burns tabs)
    □ Prestige (rank ladder, reward previews, burn button)
    □ Barracks (profile, stats grid)
□ Implement proper screen flow (no dev nav):
    Menu → Lobby → Shop → Battle → Win/Lose → Lobby/Menu
□ Add wallet connection UI (Connect Wallet button, balance display)
```

### PHASE 5: SOUND & JUICE (Week 5-6)

**Goal:** Make it feel like a game, not a tech demo.

```
□ Source all sound effects (freesound.org + custom):
    □ Weapon fire sounds (per weapon type)
    □ Explosion sounds (small, medium, large)
    □ Flight whoosh
    □ Hit confirmation ding
    □ Kill confirmation
    □ UI clicks
    □ Victory/defeat stings
    □ Gold/SOL sounds
□ Implement Phaser audio manager:
    □ Sound pooling for rapid fire
    □ Volume based on distance from impact
    □ Mute toggle
□ Implement screen effects:
    □ Screen shake (proportional to blast radius)
    □ Camera follow projectile
    □ Damage number popups
    □ Kill text overlay
    □ Gold earned popup
    □ Tank recoil animation
    □ Turret smoke particles
    □ Terrain chunk particles on impact
    □ Explosion particle system
□ Implement match flow polish:
    □ "YOUR TURN" indicator with sound
    □ Turn timer countdown (visual + audio tick at <5s)
    □ Round transition animation
    □ Match start countdown (3... 2... 1... FIRE!)
```

### PHASE 6: SOLANA INTEGRATION (Week 6-8)

**Goal:** Wire up wallet connection, SOL wagers, and settlement.

```
□ Set up Anchor development environment
□ Write Match Escrow program:
    □ create_match instruction
    □ deposit_wager instruction
    □ settle_match instruction (server authority only)
    □ forfeit_match instruction
    □ refund_match instruction (cancelled matches)
    □ Write tests on local validator
    □ Deploy to devnet
□ Integrate wallet adapter in React client:
    □ @solana/wallet-adapter-react
    □ Phantom, Solflare, Backpack support
    □ Connect/disconnect flow
    □ Balance display
□ Implement wager flow:
    □ Player joins match → prompted to sign wager TX
    □ TX sends SOL to match escrow PDA
    □ Server monitors on-chain confirmations
    □ All wagers confirmed → match begins
    □ Timeout handling (30s to deposit, else cancel + refund)
□ Implement settlement flow:
    □ Match ends → server determines winner
    □ Server signs settlement TX with authority keypair
    □ Escrow distributes: 90% winner, 7% treasury, 3% ops
    □ Client shows SOL earned/lost on result screen
□ Test full flow on devnet:
    □ Create match, deposit wager, play, settle, verify balances
    □ Test forfeit flow
    □ Test timeout/cancellation flow
    □ Test with insufficient balance
□ Security audit of escrow program
```

### PHASE 7: SHOT TOKEN & PRESTIGE (Week 8-10)

**Goal:** Deploy token, implement earning and burning.

```
□ Create SHOT SPL token on devnet:
    □ 10,000,000 supply
    □ Revoke mint authority
□ Write Reward Pool program:
    □ Deposit initial 7M SHOT
    □ emit instruction: transfers SHOT to player, checks monthly cap
    □ Monthly emission cap: 5% of remaining pool
    □ Write tests
□ Write Vesting program:
    □ Deposit 1.5M SHOT
    □ 12-month linear vest
    □ claim instruction for beneficiary
    □ Write tests
□ Implement milestone system in game server:
    □ Track: daily wins, daily kills, total matches, total kills, total wins
    □ Check milestones after each match
    □ Trigger reward pool emission when milestone hit
□ Implement Prestige system:
    □ Prestige UI with tier ladder
    □ Dual gating: SHOT balance + gameplay stats
    □ Burn transaction: player signs SHOT transfer to burn address
    □ Update prestige PDA on-chain
    □ Prestige badge visible in lobbies and in-match
□ Implement Armory cosmetics:
    □ SOL shop: direct SOL purchases (server-managed inventory)
    □ SHOT burns: burn tokens for prestige-locked cosmetics
    □ Equip system: player selects active skin/effect
    □ Render equipped cosmetics in-game
□ Deploy all programs to devnet
□ Full integration test: play → earn milestones → receive SHOT → prestige → verify burn
```

### PHASE 8: PRIVATE MATCHES & MOBILE (Week 9-10)

**Goal:** Room codes, shareable links, mobile touch controls.

```
□ Private match flow:
    □ Create Match → server generates 4-char room code
    □ Display code + shareable link: solshot.gg/match/XXXX
    □ Link auto-joins player to the room
    □ Lobby shows player list, wager, settings
    □ Host can start when ready
□ Mobile responsive:
    □ Touch event handlers for all controls
    □ Angle slider: touch-draggable
    □ Power slider: touch-draggable
    □ Fire button: large, thumb-friendly (min 60px)
    □ Weapon selector: swipe or large tap arrows
    □ HUD scaling for small screens
    □ Test in Phantom mobile browser
    □ Test in Solflare mobile browser
    □ Test on iPhone Safari and Android Chrome
```

### PHASE 9: TESTING, POLISH & ALPHA (Week 10-12)

**Goal:** Bug fixes, balance testing, alpha launch with real players.

```
□ Internal testing:
    □ Full match cycle 50+ times
    □ All 13 weapons balanced (adjust damage/cost as needed)
    □ Gold economy feels right (not too rich, not too poor)
    □ SOL settlement works flawlessly every time
    □ Edge cases: disconnects, timeouts, forfeits, simultaneous joins
□ Security testing:
    □ Attempt client modification → verify server rejects
    □ Attempt double-settlement → verify escrow prevents
    □ Attempt fake milestone claims → verify server validates
    □ Test with modified Socket.IO messages
□ Performance testing:
    □ 20 concurrent matches on one server
    □ WebSocket connection stability
    □ Database query performance
□ Alpha launch:
    □ Deploy to production server (Hetzner/DO)
    □ Deploy client to Vercel/Cloudflare Pages
    □ Deploy Solana programs to mainnet-beta
    □ Invite 20-50 players (Discord, Twitter, crypto gaming communities)
    □ Monitor: match completion rate, avg match duration, SOL volume
    □ Collect feedback, fix bugs
    □ 2-4 weeks of alpha before token launch
```

### PHASE 10: TOKEN LAUNCH & PUBLIC RELEASE (Week 14-16)

**Goal:** Go live with SHOT token, full prestige system, public marketing.

```
□ Deploy SHOT token to mainnet:
    □ Mint 10M SHOT
    □ Transfer 7M → reward pool PDA
    □ Transfer 1.5M → vesting PDA
    □ Revoke mint authority (PERMANENT)
□ Seed Raydium liquidity:
    □ 500K SHOT + 2.5 SOL
    □ Create pool on Raydium
    □ Verify pool is tradeable
□ Retroactive SHOT drops:
    □ Calculate SHOT owed to alpha players based on play history
    □ Distribute via reward pool emissions
□ Activate prestige system (all 10 tiers)
□ Activate Armory cosmetic shop
□ Marketing push:
    □ Twitter announcement + gameplay clips
    □ Discord community launch
    □ Crypto gaming community posts
    □ Influencer demos (if budget allows)
□ Monitor:
    □ Daily active users
    □ SOL wagered volume
    □ SHOT burned vs emitted (burn rate health)
    □ Token price (informational only — don't optimize for this)
    □ Player retention (D1, D7, D30)
    □ Match completion rate (target >90%)
```

---

## 14. INFRASTRUCTURE & COSTS

### Launch Infrastructure

| Service | Provider | Cost/month | Purpose |
|---------|----------|------------|---------|
| Game server | Hetzner CPX31 | $15 | Node.js + Socket.IO + physics |
| Database | Same server (PostgreSQL) | $0 | Player data, stats, history |
| Frontend hosting | Vercel free tier | $0 | React client |
| Domain | Namecheap | $1.25 | solshot.gg (annual) |
| SSL | Cloudflare (free) | $0 | HTTPS |
| CDN | Cloudflare (free) | $0 | Static assets |
| Solana RPC | Helius free tier | $0 | Transaction submission |
| **Monthly total** | | **~$16** | |

### One-Time Costs

| Item | Cost | Notes |
|------|------|-------|
| Domain registration (1 year) | $15 | .gg domain |
| Solana programs deployment | ~$200 (2-3 SOL) | Rent for program accounts |
| Raydium LP seed | ~$200 (2.5 SOL) | Initial liquidity |
| Raydium pool creation | ~$16 (0.2 SOL) | Pool setup fee |
| AI art generation (1 month) | $20 | Midjourney for terrain backdrops |
| Marketing float | $200 | Discord Nitro, giveaways, boosted posts |
| **Total one-time** | **~$651** | |

### Scaling Costs (when needed)

| Threshold | Action | Additional Cost |
|-----------|--------|----------------|
| 500+ concurrent players | Second game server | +$15/month |
| 2,000+ DAU | Dedicated database | +$25/month |
| 10,000+ DAU | Load balancer + 3 servers | +$60/month |
| 50K+ RPC calls/day | Paid Helius plan | +$50/month |

---

## 15. LAUNCH CHECKLIST — WHAT MUST BE READY

### Absolute MVP (Do NOT launch without these)

- [ ] Working multiplayer artillery game (minimum 3 maps)
- [ ] 10+ weapons with distinct behaviors
- [ ] Server-authoritative physics (anti-cheat)
- [ ] Wallet connection (Phantom, Solflare)
- [ ] SOL wager → escrow → settlement flow
- [ ] Gold economy with weapon shop between rounds
- [ ] BO1 / BO3 / BO5 match options
- [ ] Private matches with room codes
- [ ] Win/lose screens with SOL settlement display
- [ ] Sound effects for all weapon types and game events
- [ ] Screen shake, damage numbers, kill confirmations
- [ ] Mobile touch controls (playable in Phantom browser)
- [ ] Basic stat tracking (wins, kills, matches)
- [ ] Practice mode vs AI (player onboarding)

### Full Launch (Within 2 weeks of MVP)

- [ ] SHOT token deployed + reward pool active
- [ ] Prestige system (10 tiers with burn + milestone gating)
- [ ] Cosmetic Armory (SOL shop + SHOT burns)
- [ ] Barracks (full player profile + stats)
- [ ] 5+ terrain maps with distinct visual themes
- [ ] Spectator mode (watch after elimination)
- [ ] Display name customization
- [ ] Season 1 battle pass structure

---

## 16. REVENUE PROJECTIONS

### Conservative (100 DAU)

| Stream | Calculation | Monthly |
|--------|-------------|---------|
| PvP rake | 100 players × 5 matches/day × 0.08 SOL × 10% × 30 days | 12 SOL ($960) |
| Infrastructure cost | | -$16 |
| **Net monthly** | | **~$944** |

### Growth (500 DAU)

| Stream | Calculation | Monthly |
|--------|-------------|---------|
| PvP rake | 500 × 5 × 0.08 × 10% × 30 | 60 SOL ($4,800) |
| Season passes | 100 players × 0.5 SOL | 50 SOL ($4,000) |
| Cosmetic sales | Estimate | 20 SOL ($1,600) |
| **Gross monthly** | | **$10,400** |
| Infrastructure | | -$55 |
| **Net monthly** | | **~$10,345** |

---

*This document is the blueprint. Follow the phases in order. Each phase builds on the last. Don't skip server-authoritative physics — it's the foundation everything else sits on.*

*When in doubt, ship less and ship solid. A polished 3-map game with bulletproof SOL settlement beats a buggy 8-map game where players lose funds.*
