# SolShot — Seeker Distribution Strategy & 4-Player Refactor Brief

---

# PART 1: Building for the Solana Seeker Phone & dApp Store

**The Solana Seeker phone and its dApp Store present a genuinely compelling distribution channel for SolShot**, offering zero platform fees, a pre-onboarded crypto-native user base of 150,000+ devices, and hardware wallet integration that streamlines transaction signing to a single double-tap plus fingerprint. A React/Phaser.js web game can be published to the dApp Store by wrapping it as a Progressive Web App (PWA) inside a Trusted Web Activity (TWA) APK using Google's Bubblewrap CLI — no native Android rewrite required. The critical unknown is the dApp Store's stance on real-money wagering: the Publisher Policy explicitly welcomes crypto transactions but its specific position on gambling remains undocumented in public sources, making direct outreach to Solana Mobile via their Discord `#dapp-store` channel essential before committing development resources.

---

## The Seeker phone: hardware and ecosystem

The Seeker shipped globally on **August 4, 2025**, at **$450–$500** (down from Saga's original $1,000). Built by Solana Mobile in collaboration with Fxtec, it runs Android 15 on a MediaTek Dimensity 7300 processor with 8 GB RAM, 128 GB storage, a 6.36-inch 120Hz AMOLED display, 4,500 mAh battery with wireless charging, and a triple-camera system (108 MP main, 50 MP telephoto, 13 MP ultrawide).

What makes it fundamentally different from a stock Android phone is the **Seed Vault** — a Trusted Execution Environment (TEE) that isolates private keys from the Android OS entirely, comparable to a Ledger hardware wallet built into the phone. Transaction signing uses a streamlined **double-tap of the side button plus fingerprint scan**, a significant UX improvement over Saga's multi-step process. Every device ships with the **Seed Vault Wallet** (powered by Solflare), a **Seeker Genesis Token** (soulbound, non-transferable NFT proving device ownership), and a **Seeker ID** with a human-readable `.skr` domain. The phone runs both the **Solana dApp Store 2.0** and the standard Google Play Store side-by-side.

The device has moved **150,000+ units across 57 countries**, up from Saga's roughly 20,000 lifetime units. The **SKR token** launched January 21, 2026, with Season 1 distributing ~1.82 billion SKR to 100,908 eligible owners — roughly 18,000 SKR per device, effectively exceeding the device's purchase cost for many holders.

| Spec | Saga (2023) | Seeker (2025) |
|------|-------------|---------------|
| Processor | Snapdragon 8+ Gen 1 | MediaTek Dimensity 7300 |
| RAM / Storage | 12 GB / 512 GB | 8 GB / 128 GB |
| Display | 6.67" AMOLED 120Hz | 6.36" AMOLED 120Hz |
| Battery | 4,110 mAh | 4,500 mAh |
| Price | $1,000 → $599 | $450–$500 |
| Units shipped | ~20,000 | 150,000+ |

---

## The dApp Store: zero fees, crypto-permissive policies

The Solana dApp Store is a decentralized, fee-free alternative to Google Play. Its stated policy: *"Our policies exist to protect users from illegal, harmful, and misleading content, without restricting the abilities of apps to use crypto features, like trading NFTs or other digital goods."* The Developer Agreement (Version 2.1, December 3, 2025) confirms a **commission rate of 0.0%** — developers keep 100% of all revenue.

Publishing uses an on-chain NFT model (Publisher NFT → App NFT → Release NFT) via Metaplex. Both the Publisher Portal (`publish.solanamobile.com`) and CLI (`@solana-mobile/dapp-store-cli`) require **KYC/KYB verification**, a connected Solana wallet with ~0.2 SOL, a signed release APK, and standard metadata (512×512 icon, 1200×600 banner, 4+ screenshots at 1080p+, EULA, privacy policy). No developer registration fee. No 30% cut.

During Season 1: 265 dApps, $2.6B trading volume, 9M transactions across 100,000+ users.

---

## Real-money wagering: the critical open question

The dApp Store's specific stance on gambling is **not explicitly documented**. The policy does not enumerate gambling as prohibited — unlike Apple and Google. Hackathon winners Catoff and Memeshot both feature wagering mechanics and were recognized by Solana Mobile, strongly signalling receptiveness.

Practical requirements if approved: geo-blocking for restricted jurisdictions, 18+ age gate, possible offshore gaming license (Curaçao/Anjouan), and publisher KYC/KYB creates accountability.

**Action required**: Join Solana Mobile Discord (`discord.gg/solanamobile`), ask in `#dapp-store` before investing development time. This is the single decisive answer.

---

## Publishing path: PWA → TWA → APK

No native Android rewrite required. Use **Bubblewrap CLI** to wrap the hosted web game as a Trusted Web Activity:

1. Add `client/public/manifest.json` + service worker → converts to PWA
2. `npm install -g @bubblewrap/cli`
3. `bubblewrap init --manifest https://solshot.gg/manifest.json`
4. Set `resConfigs "en"` in `build.gradle` (avoids locale bloat bug)
5. `bubblewrap build` → `app-release-signed.apk`
6. Host `/.well-known/assetlinks.json` with APK's SHA256 fingerprint
7. Test on any Android, submit via Publisher Portal

**Key rule**: Generate a **new signing key exclusively for the dApp Store** — never reuse a Google Play key.

---

## Mobile Wallet Adapter

Add to `client/src/index.js` before any wallet use:

```javascript
import { registerMwa } from '@solana-mobile/wallet-standard-mobile';

registerMwa({
  appIdentity: { name: 'SolShot', uri: 'https://solshot.gg', icon: '/icon-512.png' },
  chains: ['solana:mainnet'],
});
```

Existing `useWallet()`, `useConnection()`, `sendTransaction()` hooks work unchanged. **All transaction triggers must be direct user taps** — Chrome on Android blocks programmatic wallet navigation.

---

## Developer resources

| Resource | URL |
|----------|-----|
| Docs portal | `docs.solanamobile.com` |
| MWA web integration | `docs.solanamobile.com/mobile-wallet-adapter/web-apps` |
| PWA publishing | `docs.solanamobile.com/dapp-publishing/publishing-a-pwa` |
| Publisher Portal | `publish.solanamobile.com` |
| Discord | `discord.gg/solanamobile` — `#dapp-store` |
| Builder Grants | `solanamobile.com/grants` (up to $10K) |
| MONOLITH Hackathon | Deadline March 9, 2026 — $125K+ prizes, gaming track |

---

---

# PART 2: 4-Player Multiplayer Refactor Brief
## Instructions for Claude Code

> **This brief is written against the actual codebase (read February 2026). All file paths, event names, and data structures reference real code.**

---

## Context

SolShot is a browser-based 1v1 artillery game. The goal is to refactor it to support **2–4 players** with a **last-man-standing** win condition.

---

## Current Architecture (Actual Code)

### Primary files to modify
- `server/socket-io/main.js` — entire socket layer and room management
- `server/services/match.js` — match state machine (`createMatchState`, `getNextTurn`, `isRoundOver`, `MATCH_STATES`)
- `client/src/scenes/main/index.js` — Phaser `MainScene` class
- React components in `client/src/screens/` and `client/src/bridge/` — HUD and lobby

### Server room object (current actual shape)
```js
{
  roomId: string,
  host: { name, color, socketId, isReady, playAgain, pos },
  player: { name, color, socketId, isReady, playAgain, pos },
  active: boolean,
  heightmap: number[],        // server-authoritative terrain (1200 values)
  terrainSeed: string,
  wind: number,
  wager: number,
  matchMode: string | null,
  totalRounds: number,
  escrowPDA: string | null,
  _matchId: ObjectId,
  _terrainCache: object | null
}
```

### Parallel in-memory stores (keyed by roomId, in main.js)
```js
matchStates[roomId]       // ms object from createMatchState()
goldStates[roomId]        // { [socketId]: number }
weaponInventories[roomId] // { [socketId]: weaponId[] }
shopReady[roomId]         // { [socketId]: boolean }
wagerStates[roomId]       // { amount, wallets: { [socketId]: address }, deposits: {...} }
authenticatedWallets      // { [socketId]: walletAddress } — global
```

### Match state (`ms`) key fields
From `server/services/match.js`:
```js
{
  status: 'lobby' | 'weapon_shop' | 'battle' | 'round_end' | 'settling' | 'complete' | 'cancelled',
  currentTurn: socketId,          // whose turn it is
  hp: { [socketId]: number },     // 250 start
  scores: { [socketId]: number },
  kills: { [socketId]: number },
  roundWins: { [socketId]: number },
  moveCounts: { [socketId]: number },
  turnCount: number,
  turnSequence: number,           // anti-replay nonce
  consecutiveTimeouts: { [socketId]: number },
  ...
}
```

### Turn logic (current — binary)
- `ms.currentTurn` is a socketId, toggled via `getNextTurn(ms, hostId, playerId)` in `match.js`
- `fire` handler validates `ms.currentTurn !== client.id` to reject out-of-turn shots
- `stepLeft`/`stepRight` have the same turn ownership check

### Client scene (MainScene)
```js
// client/src/scenes/main/index.js
this.tank1 = null;          // Tank instance
this.tank2 = null;          // Tank instance
this.activeTank = 0;        // 0=neither, 1=host, 2=player
this._bridge = window.gameBridge;   // React↔Phaser state relay
```
- `createTank1()` / `createTank2()` called in `create()`
- `checkSwitchTurn()` called in `update()` — reads from GameBridge
- `window.pendingSceneData` / `sceneData.gameType` control scene init

### Key socket events (existing)
| Event | Notes |
|-------|-------|
| `fire` → `turnResult` | Server-authoritative — server runs physics, broadcasts result |
| `stepLeft/Right` → `opponentStep*` | Turn-validated |
| `requestTerrain` → `terrainGenerated` | Server generates, seeds tank positions |
| `shopPhase`, `shopEnd`, `buyWeapon`, `shopDone` | Weapon shop phase |
| `matchEnd`, `roundEnd` | End of match/round |
| `turnTimeout` | Server auto-advances on 60s timeout |
| `playerEliminated` | **To be added** |
| `escrowDeposit` → `escrowDepositConfirm` → `escrowActive` | Wager flow |

---

## Target Architecture

### Room object (refactored)
```js
{
  roomId: string,
  maxPlayers: number,             // 2, 3, or 4
  players: [
    {
      name, color, socketId,
      isReady, playAgain,
      pos, rotation,
      hp, alive,
      playerIndex                 // 0-indexed position in array
    }
  ],
  active: boolean,
  currentPlayerIndex: number,     // index into players[] for active turn
  heightmap: number[],
  terrainSeed: string,
  wind: number,
  wager: number,
  matchMode: string | null,
  totalRounds: number,
  escrowPDA: string | null,
  _matchId: ObjectId,
  _terrainCache: object | null
}
```

### match.js changes needed

Replace binary `getNextTurn(ms, hostId, playerId)` with N-player version:
```js
export function getNextTurn(ms, players) {
  let next = (ms.currentPlayerIndex + 1) % players.length;
  let attempts = 0;
  while (!players[next].alive && attempts < players.length) {
    next = (next + 1) % players.length;
    attempts++;
  }
  ms.currentPlayerIndex = next;
  return players[next].socketId;
}
```

Update `isRoundOver(ms)` for N players:
```js
export function isRoundOver(ms) {
  const alivePlayers = Object.values(ms.hp).filter(hp => hp > 0);
  return alivePlayers.length <= 1;
}
```

Add `currentPlayerIndex: 0` to `createMatchState()` initial object.

### Elimination logic
In the `fire` handler, after HP update loop — add:
```js
for (const [playerId, damage] of Object.entries(result.damage)) {
  if (ms.hp[playerId] <= 0) {
    // Mark player eliminated
    const eliminated = room.players.find(p => p.socketId === playerId);
    if (eliminated) eliminated.alive = false;

    // Broadcast elimination
    io.sockets.in(roomId).emit('playerEliminated', {
      playerIndex: eliminated.playerIndex,
      socketId: playerId
    });
  }
}
```

---

## Socket Events (refactored)

### Changed events

| Event | Direction | Change |
|-------|-----------|--------|
| `createRoom` | client→server | Add `maxPlayers: 2\|3\|4` |
| `startPick` | server→client | `{ host, player }` → `{ players[] }` |
| `startGame` | server→client | Add `currentPlayerIndex` |
| `terrainGenerated` | server→client | `tankPositions` → `players[]` with all positions |
| `turnResult` | server→client | Expand `tankPositions.host/player` → `players[]` array; add `currentPlayerIndex` |
| `matchEnd` | server→client | Add `survivorOrder[]` for 3rd/4th place finishes |
| `ready` | client→server | Server checks all N players ready |
| `playAgainRequest` | client→server | Check all `players[i].playAgain` |

### New events

| Event | Direction | Payload |
|-------|-----------|---------|
| `playerEliminated` | server→client | `{ playerIndex, socketId }` |

### Unchanged events
All existing events stay the same — `fire`, `shoot`, `weaponChange`, `angleChange`, `powerChange`, `stepLeft`, `stepRight`, `shopPhase`, `shopEnd`, `buyWeapon`, `shopDone`, escrow events, auth events.

---

## Escrow / Wagering (N-player)

The existing `createMatchEscrow(roomId, amount, p1wallet, p2wallet)` in `server/services/solana.js` is binary. For N-player support (post-game-logic milestone):

- `create_match` instruction: `player_count: u8` (2–4), N-slot PDA
- `deposit_wager`: each player calls individually
- `settle_match`: winner Pubkey — 90% winner / 7% treasury / 3% ops
- `cancel_match`: full refund to all depositors

The `wagerStates[roomId].wallets` object already uses `{ [socketId]: address }` — extending to N players is just adding more entries to this map.

**Priority**: Practice mode (no wager) first. Escrow is a separate task.

---

## HUD Changes

Current React HUD shows 2 HP bars via GameBridge. Update to N bars:
- Colour-coded per `players[i].color`
- Eliminated players' bars grey out / show crossed-out state
- Current turn player indicated (arrow or ring glow)
- Player names above each bar
- 4-player: horizontal strip across top, each bar ~¼ width

---

## Lobby / Room UI Changes

- Room creation: add "Number of players" selector (2 / 3 / 4)
- Room list: show `players.length / maxPlayers` (e.g. "2/4")
- Waiting room: all N joined players with ready status
- Game starts only when all slots filled AND all players ready

---

## Client (Phaser MainScene) Changes

### Tank creation — replace `createTank1()` / `createTank2()` with loop:
```js
// client/src/scenes/main/index.js
this.tanks = [];
this.myPlayerIndex = this.sceneData.myPlayerIndex;
this.currentPlayerIndex = 0;

for (let i = 0; i < this.sceneData.players.length; i++) {
  this.tanks.push(this.createTank(i, this.sceneData.players[i]));
}
```

### Active turn detection — replace `this.activeTank === 1`:
```js
// Before
if (this.activeTank === 1) { /* my turn */ }

// After
if (this.myPlayerIndex === this.currentPlayerIndex) { /* my turn */ }
```

`currentPlayerIndex` is updated from `turnResult.currentPlayerIndex` via GameBridge.

### Elimination visual — new socket handler:
```js
socket.on('playerEliminated', ({ playerIndex }) => {
  const tank = this.tanks[playerIndex];
  if (tank) {
    // play explosion animation, then destroy
    this._bridge.setPlayerEliminated(playerIndex);
  }
});
```

### Position sync — update `turnResult` handler:
```js
// After: iterate players[] instead of tankPositions.host/player
turnResult.players.forEach((p, i) => {
  if (this.tanks[i] && p.pos) {
    this.tanks[i].setPosition(p.pos.x, p.pos.y);
  }
});
this.currentPlayerIndex = turnResult.currentPlayerIndex;
```

---

## Implementation Order

1. `match.js` — N-player `getNextTurn`, `isRoundOver`, add `currentPlayerIndex`
2. Server room object — `players[]` replaces `host`/`player`, add `maxPlayers`, `currentPlayerIndex`
3. Helper functions — update `getOpenRooms()`, `persistRoom()`, `broadcastRooms()`
4. `createRoom` — add `maxPlayers`, init `players[0]` as host
5. `joinRoom` — push into `players[]` up to `maxPlayers`
6. `ready` — check all `players[i].isReady`
7. `requestTerrain` — generate N tank positions from `generateTankPositions(heightmap, N)`
8. `fire` handler — N-player HP/elimination loop, `playerEliminated` emit, N-player `getNextTurn`
9. `turnResult` emit — `players[]` array with all positions and `currentPlayerIndex`
10. `matchEnd` — add `survivorOrder[]`
11. `wagerStates` cleanup — ensure escrow cancellation handles N wallets
12. `shopPhase` / `shopEnd` — iterate `players[]` for Gold init and inventories
13. `playAgainRequest` — check all `players[i].playAgain`
14. Client: tank array — replace `createTank1/2`
15. Client: turn detection — `myPlayerIndex === currentPlayerIndex`
16. Client: `playerEliminated` handler + visual
17. React HUD — N HP bars, elimination state, turn indicator
18. React lobby — player count selector, N-player waiting room

---

## Constraints

- **Do not break 2-player** — `maxPlayers: 2` must work identically to current 1v1
- **Server-authoritative** — all HP, positions, turn state live on server
- **Practice mode first** — game logic before escrow changes
- **GameBridge** — extend `window.gameBridge` for N-player state rather than replacing it
- **Tank colours** — red `#E63946`, blue `#4A90D9`, green `#52B788`, yellow `#FFD166`

---

---

# PART 3: Adapting the 4-Player Build for Seeker
## Additional Implementation Guide for Seeker/dApp Store Deployment

This section is a **compatibility layer** on top of Part 2 — game logic unchanged, but wallet integration, UI, performance, and build pipeline need Seeker-specific treatment.

---

## Wallet integration: MWA for the TWA build

Add to `client/src/index.js` at the very top, before wallet adapter initialisation:

```javascript
import { registerMwa } from '@solana-mobile/wallet-standard-mobile';

registerMwa({
  appIdentity: {
    name: 'SolShot',
    uri: 'https://solshot.gg',
    icon: '/icon-512.png'
  },
  chains: ['solana:mainnet'],
});
```

All existing `useWallet()` hooks continue to work — MWA registers as a new adapter type automatically.

**Escrow deposit UX — critical for Seeker:**

The server emits `escrowDeposit` (with a transaction to sign) after both players join. The client must **not** auto-sign this. Instead, store it in React state and show a "Confirm Wager" button. The existing server-side `depositTimers[roomId]` (2-minute `DCA-01` countdown) handles the timeout:

```javascript
// client: escrowDeposit handler
socket.on('escrowDeposit', (data) => {
  setDepositPending(data);  // store in React state
  // UI renders: "Confirm X SOL wager" button
});

// On user tap:
async function handleConfirmDeposit() {
  const tx = deserializeTransaction(depositPending.transaction);
  const sig = await sendTransaction(tx, connection);
  socket.emit('escrowDepositConfirm', { roomId, txSignature: sig });
}
```

For 4-player: each player has their own `escrowDeposit` event. Each must tap their own confirm button. The server already checks `ws.deposits[socketId]` for all N players before emitting `escrowActive`.

---

## PWA manifest (`client/public/manifest.json`)

```json
{
  "name": "SolShot",
  "short_name": "SolShot",
  "description": "4-player artillery wager game on Solana",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#0a0a0f",
  "theme_color": "#FF6B2B",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Add to `client/public/index.html`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

---

## Touch controls

The current `MainScene` uses keyboard input. For Seeker, add a React overlay that emits the same socket events — **no Phaser changes required**. The server handles `stepLeft`, `stepRight`, `angleChange`, `powerChange`, and `fire` as socket events regardless of how the client triggers them.

**Recommended 4-player mobile HUD (landscape):**
```
┌──────────────────────────────────────────────────────┐
│  [P1 ████░]  [P2 ████░]  [P3 ████░]  [P4 ████░]      │  ← HP bars
│                                                      │
│              [  PHASER CANVAS  ]                     │
│                                                      │
│  [◄ MOVE]  [► MOVE]    [▲] [▼] ANGLE    [● FIRE]    │  ← controls
│                  [━━━━━ POWER ━━━━━]                 │
└──────────────────────────────────────────────────────┘
```

The 4 HP bars extend naturally from the existing React HUD — GameBridge already pushes `hp` state from `turnResult`. The Part 2 change to pass `players[]` in `turnResult` makes N bars automatic.

Minimum touch targets: 64px FIRE, 48px move/angle, full-width slider for power.

---

## Seeker-specific lobby additions

**Genesis Token badge detection** — reuse the existing Helius RPC key from `server/.env`:
```javascript
// client/src/hooks/useGenesisToken.js
async function hasGenesisToken(walletAddress) {
  const res = await fetch(
    `https://api.helius.xyz/v0/addresses/${walletAddress}/nfts?api-key=${HELIUS_KEY}`
  );
  const nfts = await res.json();
  return nfts.some(nft => nft.collection?.address === SEEKER_GENESIS_COLLECTION);
}
```

Show Seeker badge next to player name in waiting room if detected.

**`.skr` domain display** — resolve via Solana Name Service, fallback to shortened address for non-Seeker wallets.

---

## Seeker build pipeline

Add `/seeker/` directory to repo:
```
/seeker/
  bubblewrap/         ← generated by `bubblewrap init`
  assetlinks.json     ← deploy to solshot.gg/.well-known/
  SIGNING_KEYSTORE    ← .gitignore this — losing it = can't update app
  build-seeker.sh
```

`assetlinks.json` **must** be live at `https://solshot.gg/.well-known/assetlinks.json` with the correct SHA256 fingerprint — without it, Chrome will show browser chrome inside the TWA.

---

## dApp Store submission checklist

**Assets** (existing assets in `/Assets/` cover most of these):
- [ ] 512×512 icon
- [ ] 1200×600 banner (4-tank composition)
- [ ] 4+ landscape screenshots at 1080p+ (lobby, match, wager screen, win screen)
- [ ] Short description ≤80 chars
- [ ] Long description ≤4000 chars

**Legal:**
- [ ] Privacy Policy URL
- [ ] Terms of Service / EULA URL
- [ ] 18+ age requirement stated

**Technical:**
- [ ] Signed APK (new key, not Google Play key)
- [ ] `assetlinks.json` live and returning 200
- [ ] MWA tested with Seed Vault Wallet on Android Chrome
- [ ] All transaction flows user-gesture-gated
- [ ] Landscape locked

**Pre-submit:**
- [ ] ⚠️ **Wager policy confirmed with Solana Mobile (`#dapp-store`)** ← critical blocker

---

## Performance notes (4-player on Dimensity 7300)

The existing `BlastCache` class already pools blast rendering — verify it handles 4-player rapid successive blasts without unbounded growth.

The React-based HUD (via GameBridge) is correct for mobile — N HP bars in DOM cost nothing per frame. Adding `players[]` to bridge state makes rendering N bars automatic.

The server-driven turn cycle means `checkSwitchTurn()` in `update()` just reads `currentPlayerIndex` from bridge — no additional per-frame cost for N-player support.

Target: 60fps during turn transitions, ≥45fps during blast animations. Test proxy: Samsung Galaxy A54 (Exynos 1380 — comparable performance tier to Dimensity 7300).

---

## Summary: what differs between web and Seeker builds

| Concern | Web | Seeker |
|---------|-----|--------|
| Wallet | Standard adapter | MWA + Seed Vault |
| Transaction trigger | Programmatic OK | User-gesture only |
| Controls | Keyboard | Touch overlay (same socket events) |
| Orientation | Flexible | Locked landscape |
| Build | Hosted web | Signed APK (Bubblewrap) |
| Player display | Address | `.skr` domain + Genesis badge |
| Deposit confirm | Auto-trigger on socket OK | Must gate behind button tap |

One codebase, one deploy. `REACT_APP_PLATFORM=seeker` feature flag activates MWA registration, touch controls, Seeker ID resolution, and Genesis detection. TWA wrapper packages the hosted URL — Seeker users get the Seeker experience, web users get the standard experience.

---

*SolShot // AIM. FIRE. EARN.*
