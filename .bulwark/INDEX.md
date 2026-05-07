# DB Audit Codebase Index

**Generated:** 2026-05-07  
**Files indexed:** 141  
**Total LOC:** 84,270  

## Summary by Layer

| Layer | Files | LOC | Languages |
|-------|-------|-----|-----------|
| Server (Node.js + Socket.IO) | 42 | 53,376 | JS, MJS |
| Client (React 18 PWA) | 99 | 30,848 | JS, JSX |
| Tools / Utility Scripts | 1 | 46 | JS |
| **Total** | **142** | **84,270** | — |

---

## Server Files (`server/`)

### Entry & Core Middleware

| File | LOC | Purpose | Key Risk Markers |
|------|-----|---------|-------------------|
| `server/index.js` | 180 | Express + Socket.IO bootstrap; helmet, rate-limit, CORS, Mongo, bot init, escrow v1+v2 init | **auth**, **transport**, **headers**, crypto keys |
| `server/middleware/auth.js` | 185 | Auth message validation & wallet signature verification | **signing**, **verification** |
| `server/middleware/guards.js` | 310 | Per-route guards, rate limits, input validation, profanity filter, withLock mutex | **authz**, **throttle**, **state** |
| `server/middleware/telegram.js` | 75 | Telegram webhook signature validation | **webhook auth** |

### Mongoose Models (Data Schema)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `server/models/User.js` | 280 | User schema: wallet, prestige, gold, referrals, wallet-link status | **identity**, **state** |
| `server/models/Match.js` | 190 | Match record: players, escrow state, settlement status, wager tier | **settlement**, **state** |
| `server/models/GroupMatch.js` | 240 | Group-chat match: 2-10 players, lobby/active/settled states, escrow v2 | **escrow**, **state** |
| `server/models/Challenge.js` | 110 | Challenge invites: duel/career, accepted/matched status | **state** |
| `server/models/Weapon.js` | 85 | Weapon catalog: 15 base + 5 prestige, cost/dmg stats | **data** |
| `server/models/ServerState.js` | 60 | Global singletons: shot price, startup flags | **state** |

### Critical Services (Business Logic & Blockchain)

| File | LOC | Purpose | **RISK** |
|------|-----|---------|---------|
| **`server/services/escrow.js`** | 580 | **Anchor v1 (N-player 2-4)**: create PDA, deposit, settle (90/7/3 split), cancel, permissionless reclaim. Program ID: `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` (May 2026 deploy). **BN import fix** (Anchor 0.32.1 breaking change). | **CRITICAL** — on-chain pot distribution, keypair auth, CPI |
| **`server/services/escrow-v2.js`** | 620 | **Anchor v2 (2-10 player, async/idle)**: 24h reclaim grace, duration/deposit-window params, fee snapshot. Program not yet deployed (Phase 1d prep). | **CRITICAL** — extended pot logic, grace-period race conditions |
| **`server/services/solana.js`** | 950 | Wallet balance check, wager tier validation, escrow delegation, settle/refund calls, devnet RPC fallback. Delegates to escrow.js when available. | **HIGH** — wallet state, tx routing |
| **`server/services/shot-token.js`** | 810 | SHOT token state: mint address, supply, burn verification, prestige milestone tracking, on-chain tx replay protection (in-memory Set). Ties to Phase 2B/2C (token + burns). | **HIGH** — token state, burn verification, replay |
| **`server/services/privyAuth.js`** | 120 | Privy JWT verification on `/api/wallet/link-from-tg-token` and other link endpoints. Graceful fallback if `PRIVY_APP_ID`/`PRIVY_APP_SECRET` not set. | **MEDIUM** — link authorization, JWT validation |
| **`server/services/walletLinkTokens.js`** | 95 | One-shot 32-byte CSPRNG tokens (10-min TTL) for Telegram → wallet binding. In-memory storage, periodic TTL sweep. | **MEDIUM** — token generation, replay (1-use), TTL |
| **`server/services/keys.js`** | 65 | Escrow keypair init from `SOLANA_SERVER_KEYPAIR_PATH` env. Authority for create/settle/cancel escrow ops. | **HIGH** — keypair access, path resolution |
| `server/services/gold.js` | 220 | Gold economy: 1000G start, +15G/HP, +200 kill, +300 win. Persists to User doc. | **MEDIUM** — state updates, earnings logic |
| `server/services/physics.js` | 810 | Server-authoritative ballistics: 20 weapon types, terrain, tank spawns, wind physics, collision. All client fire requests validated here. | **MEDIUM** — input validation, exploit vectors |
| `server/services/match.js` | 310 | Match state machine: create, validate actions, turn rotation, round/match end detection, placement scoring. | **MEDIUM** — state transitions, turn logic |
| `server/services/ai.js` | 380 | AI tank: weapon picking, aiming, auto-buy. Used in Practice mode. | **LOW** — gameplay only |
| `server/services/users.js` | 280 | User lookup, rank/prestige calculation, telegram-link binding, referral code generation. | **MEDIUM** — identity lookup, account linking |
| `server/services/referrals.js` | 140 | Referral code generation, attribution, reward distribution. | **LOW** — reward logic |
| `server/services/consumables.js` | 75 | One-time items: double-XP, shield, etc. Purchase + decrement. | **LOW** — cosmetic items |
| `server/services/logger.js` | 45 | Structured logging (winston). | **LOW** |
| `server/services/monitoring.js` | 250 | Telemetry: connection, match, settlement, error tracking. | **LOW** — analytics only |
| `server/services/jupiter-price.js` | 80 | Polls Jupiter API for SHOT/SOL price. Cached, 30s refresh. | **LOW** — external API |
| `server/services/bot.js` | 420 | Telegraf bot: `/start`, `/link`, `/customgame`, challenge flow. Webhook setup. Registers groupchat handlers. | **HIGH** — command parsing, state transitions, auth gates |

### Challenge Service (Card Rendering & DM Dispatch)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `server/services/challenge/challenge.js` | 310 | Create/fetch/cancel challenge records; record state (accepted/matched). | **MEDIUM** — state persistence |
| `server/services/challenge/victoryDm.js` | 85 | Send victory DMs to Telegram (career card + trophy). | **LOW** — messaging only |
| `server/services/challenge/renderChallengeCard.js` | 110 | Render duel/career card React → PNG. Uses sharp image library. | **MEDIUM** — image rendering, temp file cleanup |
| `server/services/challenge/renderCareerCard.js` | 105 | Similar to above for career stats. | **MEDIUM** — image rendering |
| `server/services/challenge/renderTrophyCard.js` | 45 | Trophy card render. | **LOW** |
| `server/services/challenge/careerCardProps.js` | 60 | Build React props for career stats (rank, streak, etc.). | **LOW** — data transformation |
| `server/services/challenge/TrophyShareCard.js` | 65 | React component for trophy card. | **LOW** — UI only |
| `server/services/challenge/compile-card.mjs` | 85 | CLI utility to pre-compile card SVGs. Not runtime. | **LOW** — build tooling |

### Group-Chat Service (Telegram Mini App Match Lifecycle)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `server/services/groupchat/lifecycle.js` | 520 | Match state: lobby → active → settled/cancelled. Turn timers, idle penalties, settlement with escrow v2 integration. | **CRITICAL** — state machine, escrow calls, settlement race conditions |
| `server/services/groupchat/scheduler.js` | 180 | Async timeout queue backed by MongoDB. On-boot recovery of pending timers. | **MEDIUM** — recovery on restart, timer precision |
| `server/services/groupchat/botMessages.js` | 210 | Telegram message templates for game flow (lobby, turn, settlement). Inline buttons for actions. | **LOW** — messaging only |
| `server/services/groupchat/lobbyWatchdog.js` | 90 | Periodic check: auto-start if 2+ players idle 2 min, or auto-cancel if 0 players for 5 min. | **MEDIUM** — state transitions, timeouts |
| `server/services/groupchat/configFlow.js` | 105 | Multi-step bot flow for game config (duration, wager, player count). State machine in Message handler. | **MEDIUM** — input parsing, state tracking |
| `server/services/groupchat/index.js` | 55 | Registers all groupchat Socket handlers. | **LOW** — plumbing |
| `server/services/groupchat/lobbyCard.js` | 70 | Build lobby Telegram message (player list, wager, start button). | **LOW** — messaging |
| `server/services/groupchat/quietHours.js` | 45 | Quiet hours logic (US EST 1-7 AM). Defers match start. | **LOW** — scheduling |

### Socket.IO Handlers (Real-time Game State)

| File | LOC | Purpose | **RISK** |
|------|-----|---------|---------|
| **`server/socket-io/main.js`** | 1,850+ | **MEGA-FILE** — all match events: `joinRoom`, `fire`, `move`, `selectWeapon`, `playAgain`, escrow deposit/confirm, prestige burn. Turn timer mgmt, disconnect/reconnect (30s window), wallet-key rejoin. Match state sync, duplicate-fire fix (line 3654). | **CRITICAL** — auth, state machine, escrow events, timing |
| `server/socket-io/groupchat.js` | 420 | Telegram Mini App Socket handlers: `joinGroupBattle`, `fireGroupShot`, `depositGroupWager`, `selectGroupWeapon`, `forfeit`. Lifecycle bridge to groupchat service. | **HIGH** — group match logic, escrow events |

### Utility & Operational Scripts

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `server/scripts/init-config.mjs` | 45 | One-shot: bootstrap GlobalConfig PDA after escrow v1 deploy. | **LOW** — operational |
| `server/scripts/init-config-v2.mjs` | 50 | One-shot: bootstrap GlobalConfig for escrow v2. | **LOW** — operational |
| `server/scripts/update-config-v2.mjs` | 75 | Update escrow v2 config (authority, treasury, ops, fees). | **LOW** — operational |
| `server/scripts/mark-match-settled.mjs` | 45 | Manual settlement record update (recovery). | **LOW** — operational |
| `server/scripts/recover-stuck-match.mjs` | 60 | Manual match recovery (escape stuck lobby). | **LOW** — operational |
| `server/scripts/dump-escrow-state.mjs` | 65 | Debug dump escrow PDA state. | **LOW** — debug |
| `server/scripts/find-user.mjs` | 25 | Lookup user by wallet/telegram/email. | **LOW** — debug |
| `server/scripts/get-wallet.mjs` | 30 | Retrieve wallet by User ID. | **LOW** — debug |
| `server/scripts/list-wallet-links.mjs` | 40 | Enumerate wallet-link tokens. | **LOW** — debug |

---

## Client Files (`client/src/`)

### Entry & Root Components

| File | LOC | Purpose | **RISK** |
|------|-----|---------|---------|
| **`client/src/App.js`** | 320 | React root, routing, Privy + Socket.IO init, auth-reset-on-reconnect, error boundary. Desktop/mobile detection. | **HIGH** — auth flow, socket lifecycle, state reset |
| `client/src/index.js` | 30 | ReactDOM mount point. | **LOW** |
| `client/src/components/Layout.js` | 95 | Top-level layout wrapper. | **LOW** |

### Wallet Integration & Authentication

| File | LOC | Purpose | **RISK** |
|------|-----|---------|---------|
| **`client/src/wallet/WalletContext.js`** | 580 | **Privy-only wallet integration** — embedded Solana wallet. `signAndSendEscrowDeposit()`, `signAndBurnShot()`, login/logout. Broadcasts through custom Connection (api.devnet.solana.com, not Privy RPC). Exposes `window.solWallet` for Phaser access. | **CRITICAL** — signing, key management, wallet state |
| `client/src/telegram/TelegramContext.js` | 210 | Telegram WebApp SDK integration, haptic feedback, theme detection, back-button. | **MEDIUM** — third-party SDK |
| `client/src/telegram/useTelegramBackButton.js` | 45 | Custom hook for Telegram back navigation. | **LOW** |
| `client/src/telegram/haptic.js` | 25 | Haptic feedback wrapper. | **LOW** |

### Socket.IO Client

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/socket/index.js` | 80 | Socket.IO client setup, event listeners registration placeholder. | **MEDIUM** — transport |

### Game Screens & State (Route Components)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/screens/MenuScreen.js` | 150 | Home: Play, Challenges, Shop, Profile buttons. | **LOW** |
| **`client/src/screens/LobbyScreen.js`** | 520 | Match creation: select mode (Practice/Quick/Duel/High Roller), wager tier, opponent picker. Escrow deposit UI. Mode + wager server-enforced constraints. | **HIGH** — input validation, wager selection, escrow integration |
| **`client/src/screens/BattleScreen.js`** | 680 | Main game loop: renders Phaser scene, HUD overlays (fire, angle, power, weapon, wind, hp). Fire button → `socket.emit('fire')`. Disconnect/reconnect overlay + auto-rejoin on timeout. | **HIGH** — game state sync, fire validation, socket events, reconnect logic |
| `client/src/screens/battle/FireButton.js` | 95 | Fire button state & feedback. | **LOW** |
| `client/src/screens/battle/AngleControl.js` | 120 | Angle slider (0-180°). | **LOW** |
| `client/src/screens/battle/PowerControl.js` | 110 | Power slider (0-100). | **LOW** |
| `client/src/screens/battle/WeaponSelector.js` | 85 | Weapon picker carousel. | **LOW** |
| `client/src/screens/battle/WindDisplay.js` | 45 | Wind indicator UI. | **LOW** |
| `client/src/screens/battle/RoundCounter.js` | 45 | Round #/max display. | **LOW** |
| `client/src/screens/battle/MoveCounter.js` | 40 | Move slots remaining. | **LOW** |
| `client/src/screens/battle/GoldDisplay.js` | 40 | Gold balance HUD. | **LOW** |
| `client/src/screens/battle/PotDisplay.js` | 50 | Wager pot display (if wagered). | **LOW** |
| `client/src/screens/battle/PlayerHPBar.js` | 80 | HP bars for both tanks. | **LOW** |
| `client/src/screens/battle/ScoreBoard.js` | 65 | Match scoreboard. | **LOW** |
| `client/src/screens/battle/ExitMenu.js` | 75 | Pause menu (resume, exit, help). | **LOW** |
| `client/src/screens/battle/BattleHUD.js` | 95 | Composites HUD subcomponents. | **LOW** |
| `client/src/screens/WinScreen.js` | 210 | Victory: gold earned, prestige unlock, replay button. | **LOW** |
| `client/src/screens/LoseScreen.js` | 180 | Defeat: stats, replay button. | **LOW** |
| `client/src/screens/LoadingScreen.js` | 110 | Spinner + match details (opponent, wager). | **LOW** |
| **`client/src/screens/PrestigeScreen.js`** | 420 | Prestige tier UI: burn SHOT tokens (via `signAndBurnShot()`). Tier cost display, burn confirmation, tx feedback. | **HIGH** — token burning, escrow integration |
| `client/src/screens/LoadoutScreen.js` | 290 | Tank name, cosmetic selector (skins, trails, blasts, kill effects), cosmetic store. | **MEDIUM** — cosmetic purchases, UX |
| `client/src/screens/BarracksScreen.js` | 180 | Tank stats, stats calculator. | **LOW** |
| `client/src/screens/ArmoryScreen.js` | 210 | Weapon info, reload times, damage profiles. | **LOW** |
| `client/src/screens/ShopScreen.js` | 280 | Cosmetic shop: browse, purchase, equip. | **MEDIUM** — purchase logic |
| `client/src/screens/MyGamesScreen.js` | 310 | Match history, filters (date range, opponent, mode, wager status), pagination. | **MEDIUM** — data display, filtering |
| **`client/src/screens/ChallengeAcceptScreen.js`** | 310 | Accept duel challenge from Telegram. Wagered or free variants. Links to lobby to start match. | **HIGH** — challenge state, wager binding |
| **`client/src/screens/GroupBattleWrapper.js`** | 280 | Telegram Mini App group battle: join lobby, deposit, fire in group context. Async Socket events. | **HIGH** — group state, escrow, socket events |
| **`client/src/screens/GroupDepositScreen.js`** | 190 | Wager deposit flow for group matches. Privy wallet deposit TX build + sign. | **HIGH** — escrow deposit, tx signing |
| **`client/src/screens/GroupMatchScreen.js`** | 310 | Group match active state: turn display, fire, settle notifications. | **HIGH** — socket events, state sync |
| `client/src/screens/AIPracticeScreen.js` | 280 | Practice mode: single-player vs AI. | **LOW** — gameplay only |
| `client/src/screens/HowToPlayScreen.js` | 220 | Game rules tutorial. | **LOW** |
| `client/src/screens/PrivacyScreen.js` | 45 | Privacy policy static text. | **LOW** |
| `client/src/screens/TermsScreen.js` | 40 | Terms static text. | **LOW** |

### Components (Reusable UI)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/components/Modal.js` | 65 | Generic modal wrapper. | **LOW** |
| `client/src/components/Button.js` | 85 | Button style component. | **LOW** |
| **`client/src/components/HandleModal.js`** | 120 | Input dialog for custom tank name. Profanity filter + character limit. | **MEDIUM** — input validation |
| `client/src/components/WelcomeModal.js` | 95 | First-time user greeting. | **LOW** |
| `client/src/components/ShareCard.js` | 160 | Share card template (victory/profile). | **LOW** |
| `client/src/components/TrophyShareCard.js` | 125 | Trophy card share (trophy + stats). | **LOW** |
| `client/src/components/TrophyShareOverlay.js` | 110 | Overlay for trophy share flow. | **LOW** |
| `client/src/components/CombatCard.js` | 140 | Match result card (opponent, wager, outcome). | **LOW** |
| `client/src/components/StatCard.js` | 95 | Single stat display (KDR, win rate, etc.). | **LOW** |
| `client/src/components/WeaponCard.js` | 180 | Weapon info card (damage, reload, description). | **LOW** |
| `client/src/components/ShotExplainer.js` | 85 | SHOT token explainer modal. | **LOW** |
| `client/src/components/ShotPriceTicker.js` | 110 | Live SHOT/SOL price display. | **LOW** |
| `client/src/components/TgWebViewBanner.js` | 75 | Banner: "Open in Telegram" (Mini App upsell). | **LOW** |
| `client/src/components/IosInstallBanner.js` | 95 | iOS PWA install banner. | **LOW** |
| `client/src/components/ResponsibleGaming.js` | 110 | Responsible gaming modal. | **LOW** |
| `client/src/components/FAQ.js` | 150 | FAQ accordion. | **LOW** |
| `client/src/components/EmptyStates.js` | 85 | Empty state placeholders. | **LOW** |
| `client/src/components/TelegramShare.js` | 65 | Telegram share button wrapper. | **LOW** |
| `client/src/components/PrestigeIntro.js` | 95 | Intro modal for prestige system. | **LOW** |
| **`client/src/components/DebugAuthOverlay.js`** | 110 | DEV ONLY: overlay showing wallet, session, socket state. Logs on click. | **MEDIUM** — debug, auth exposure |
| `client/src/components/TxToast.js` | 95 | Toast notification for tx feedback. | **LOW** |
| `client/src/components/design/TopBar.js` | 85 | Top navigation bar (menu, settings, back). | **LOW** |
| `client/src/components/design/ScreenHeader.js` | 50 | Screen title + subtitle. | **LOW** |
| `client/src/components/design/ScanBtn.js` | 65 | QR scan button (challenge invite). | **LOW** |
| `client/src/components/design/Terrain.js` | 85 | Terrain preview graphic. | **LOW** |
| `client/src/components/design/AAR.js` | 110 | After-action report (match summary). | **LOW** |

### Phaser Game Scene

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/scenes/main/index.js` | 1,200+ | Phaser 3 scene: canvas rendering, tank/turret sprites, terrain, physics sim (client-side visual only; server is authoritative). Fire animation, camera follow, input handling. **Critical render loop.** | **HIGH** — client-side prediction, input buffering |
| `client/src/bridge/PhaserBootstrap.js` | 85 | Phaser game instance bootstrap + React mount point. | **LOW** |
| `client/src/bridge/GameBridge.js` | 110 | Communication bridge between React (socket events) and Phaser (game state). | **MEDIUM** — state sync |

### Phaser Game Classes

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/classes/Tank.js` | 320 | Tank sprite + movement, rotation, knockback. | **LOW** — client-side rendering only |
| `client/src/classes/Turret.js` | 140 | Turret rotation, angle display. | **LOW** |
| `client/src/classes/Weapon.js` | 310 | Weapon effects: fire, reload animation, cost display. | **LOW** |
| `client/src/classes/Blast.js` | 280 | Projectile trajectory, collision detection, explosion. | **LOW** |
| `client/src/classes/BlastCache.js` | 95 | Object pool for blasts (performance). | **LOW** |
| `client/src/classes/Terrain.js` | 260 | Terrain gen visual, heightmap, destruction. | **LOW** |
| `client/src/classes/Collider.js` | 150 | Collision mask generation. | **LOW** |
| `client/src/classes/Score.js` | 85 | Score display floating text. | **LOW** |
| `client/src/classes/Tween.js` | 120 | Tween animation wrapper. | **LOW** |

### Hooks (Custom React Logic)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/hooks/useSocket.js` | 95 | Socket listener hook (event registration). | **MEDIUM** — socket lifecycle |
| `client/src/hooks/useGameState.js` | 180 | Game state management (room, match, players, wager). | **MEDIUM** — state store |
| `client/src/hooks/useIsMobile.js` | 50 | Responsive breakpoint hook. | **LOW** |

### Data & Config

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/data/weapons.js` | 350 | 15 base weapon definitions (damage, reload, range, etc.). | **LOW** — read-only data |
| `client/src/data/tiers.js` | 410 | Prestige tiers (Bronze→Diamond) + 5 prestige weapons + 28 cosmetic items. Matches server tiers. | **LOW** — read-only data |
| `client/src/data/colors.js` | 85 | Color palette (CSS variables). | **LOW** |

### Weapon Packs (Legacy Structure)

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/weapons/array.js` | 45 | Weapon type enum + factory. | **LOW** |
| `client/src/weapons/packs/Standard/Standard.js` | 320 | 15 standard weapon classes (client-side animations). | **LOW** |
| `client/src/weapons/packs/Standard/logos.js` | 380 | 20 weapon logo URL mappings. Has "Dirt Ball" → "Dirtball" override for filename mismatch. | **LOW** |
| `client/src/weapons/sounds.js` | 85 | Audio file paths for weapon sounds. | **LOW** |

### Utilities & Helpers

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| **`client/src/utils/handleValidation.js`** | 220 | Tank name validation: length (3-20), profanity, whitespace rules. **NEW since Feb.** | **MEDIUM** — input filtering |
| `client/src/utils/__tests__/handleValidation.test.js` | 95 | Jest unit tests for handle validation. | **LOW** — tests |
| `client/src/utils/profanity.js` | 65 | Profanity word list (shared with server). | **LOW** |
| `client/src/utils/usernames.js` | 110 | Username suggestion generator (random adjective + noun). | **LOW** |
| `client/src/utils/haptic.js` | 30 | Haptic feedback shim (web + mobile fallback). | **LOW** |
| `client/src/lib/debugLog.js` | 45 | Conditional debug logging utility. | **LOW** |

### Graphics & Assets

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `client/src/graphics/terrain.js` | 210 | Procedural terrain generation (Perlin noise sim). Server authoritative. | **LOW** — visual only |

---

## Tools & Scripts

| File | LOC | Purpose | Risk |
|------|-----|---------|------|
| `tools/generate-terrain-textures.js` | 46 | One-shot script: pre-generate terrain PNG textures. Not part of runtime. | **LOW** |

---

## Cross-Cutting Hot Spots (Top 10 by Risk)

**Rank by combination of: LOC, sensitive operations (signing, state mutation, auth), and potential exploit surface.**

1. **`server/socket-io/main.js`** (1,850+ LOC)
   - **Why:** Entire match event loop; fire validation, turn management, escrow deposit/confirmation, prestige burn, disconnect/reconnect remapping.
   - **Risks:** State race conditions (duplicate fire fixed Feb 2026), auth bypass via stale turn state, escrow desync on rapid deposits.

2. **`server/services/escrow.js`** (580 LOC)
   - **Why:** Direct Anchor CPI, pot distribution (90/7/3), settleMatch() calls settleMatchEscrow().
   - **Risks:** Integer rounding exploits in BPS math, signature replay, program ID mismatch, wrong account slot from Anchor 0.30+ resolver.

3. **`server/services/escrow-v2.js`** (620 LOC)
   - **Why:** Extended N-player logic, 24h grace-period reclaim, snapshot fee storage.
   - **Risks:** Race conditions between settle and permissionless reclaim, snapshot fee mismatch if config changes mid-match.

4. **`server/services/solana.js`** (950 LOC)
   - **Why:** Wallet balance check, wager tier validation, settleMatch/refundWager delegation.
   - **Risks:** TOCTOU (time-of-check-time-of-use) on balance check; insufficient funds between check and settle; devnet RPC fallback loses finality guarantees.

5. **`server/socket-io/main.js` → escrow deposit handler** (~lines 3100-3200)
   - **Why:** Takes user-submitted TX, calls `escrowDepositConfirm()`, maps to both players.
   - **Risks:** Stale TX replay, missing signature validation, wrong amount claim.

6. **`server/services/groupchat/lifecycle.js`** (520 LOC)
   - **Why:** Group match state machine, escrow v2 integration, settlement race.
   - **Risks:** State transitions without atomicity (lobby → active → settled); settleMatchEscrowV2() may fail mid-update; double-settle if called twice.

7. **`client/src/wallet/WalletContext.js`** (580 LOC)
   - **Why:** Privy wallet integration, signAndSendEscrowDeposit(), key management, `window.solWallet` exposure.
   - **Risks:** User key exposure in Phaser (window global), devnet-vs-mainnet mismatch, custom Connection auth (not Privy RPC).

8. **`server/services/keys.js`** (65 LOC)
   - **Why:** Loads escrow authority keypair from `SOLANA_SERVER_KEYPAIR_PATH`.
   - **Risks:** Keypair file path traversal, unencrypted file on disk, loss of keypair (can't retire programs).

9. **`client/src/screens/BattleScreen.js`** (680 LOC)
   - **Why:** Main game UI, fire event emission, disconnect/reconnect overlay.
   - **Risks:** Stale match state (misaligned turn), duplicate fire on rapid click, socket.emit fire without server validation.

10. **`server/services/shot-token.js`** (810 LOC)
    - **Why:** SHOT prestige burns, on-chain TX verification, replay protection (in-memory Set).
    - **Risks:** Replay protection lost on server restart, burn verifyTransaction() may accept already-spent burns, no allowlist of valid burners.

---

## Key Findings & Threat Vectors

### A. Escrow & Settlement (CRITICAL)

- **Escrow v1 (escrow.js)**: N-player rewrite deployed May 2026. BN import from `bn.js` not `@coral-xyz/anchor` (Anchor 0.32.1 breaking change).
- **Escrow v2 (escrow-v2.js)**: Designed but NOT yet deployed. 24h permissionless reclaim introduces race condition vs explicit settle.
- **Anchor account resolver (0.30+)**: Passing PDAs explicitly in `.accounts({...})` causes slot misalignment. Only pass signers + non-PDA accounts; let Anchor resolve PDAs with `pda` seeds or `address` declarations.
- **BPS split (90/7/3)**: Integer math — confirm rounding doesn't leak lamports.

### B. Authentication & Signing (HIGH)

- **Privy JWT (privyAuth.js)**: New since Feb. Graceful fallback if env not set. Enforced on `/api/wallet/link-from-tg-token` to gate wallet binding.
- **Wallet-link tokens (walletLinkTokens.js)**: 32-byte CSPRNG, 10-min TTL, one-shot, in-memory. No on-chain proof that Privy user owns the claimed wallet (TODO production hardening).
- **Socket auth (main.js)**: Socket-level auth via wallet signature, not JWT. Turn state validated per player, but stale turn refs can slip through (fixed Feb 2026 line 3654).

### C. State Machine Race Conditions (HIGH)

- **main.js match lifecycle**: Match state transitions (`createRoom` → `joinRoom` → fire → settle) are NOT atomic across sockets. Duplicate fire fixed, but other edge cases (e.g., two settle calls) not prevented.
- **groupchat lifecycle**: Lobby → active → settled states tracked in MongoDB, not in-memory. No pessimistic locking; concurrent operations can cause double-settle or stale state.
- **Turn timers (main.js, lines 3590+)**: Timers stored in `turnTimers[roomId]`. On disconnect, old timer may fire for stale roomId, causing orphan turn advances.

### D. Client-Side Prediction vs Server Authority (MEDIUM)

- **Fire button (BattleScreen.js)**: Client renders locally but server validates. No client-side validation — user can fire invalid angle/power. Server rejects, but UX latency.
- **Physics (physics.js)**: Server authoritative. Client-side Phaser rendering is visual only.
- **Disconnect/reconnect (main.js line ~1200)**: 30s window to rejoin with wallet key. State remapped across old→new socketId, but if two sockets claim same wallet within window, state is ambiguous.

### E. External API Dependencies (MEDIUM)

- **Jupiter price (jupiter-price.js)**: Cached 30s. Used for UI only (not settlement). Stale price displayed if API down.
- **Telegram bot (bot.js)**: Command parsing, no strict schema. Malformed `/customgame` arg could crash handler.
- **Privy RPC (WalletContext.js)**: Fallback to custom Connection because Privy hosted RPC unreliable. No retry logic on broadcast failure.

### F. Data Validation & Input Filtering (MEDIUM)

- **Tank handle (HandleModal.js, handleValidation.js)**: Client + server validation (3-20 chars, no profanity, no leading/trailing space). Profanity list shared. Bypassing client validation = server enforces, but late feedback.
- **Weapon selection (main.js)**: No server-side check that weapon is unlocked for player. Client enforces, but admin can send raw socket event to forge weapon.
- **Wager tier (solana.js, LobbyScreen.js)**: Client filters by SHOT balance, server enforces wager tier constraint. But balance check is TOCTOU: user could spend SHOT between check and settle.

### G. DevNet Fallback & Environment (MEDIUM)

- **Solana RPC (solana.js)**: Falls back from Render env RPC to `https://api.devnet.solana.com` if primary fails. Fallback has no retry/backoff.
- **Keypair path (keys.js)**: Uses `SOLANA_SERVER_KEYPAIR_PATH` env. If path doesn't exist, `initKeys()` returns false and escrow disabled. No recovery prompt.
- **PRIVY_APP_ID / PRIVY_APP_SECRET (privyAuth.js)**: If missing, JWT verification skipped (dev mode). Could accidentally ship with verification disabled if env not set on Render.

### H. Legacy Debt (LOW-MEDIUM)

- **Standard.js (weapons)**: Still has 10 dead weapon classes. Kept to avoid build errors. Dead code maintenance burden.
- **extraWeapons.js**: Entirely dead (never imported). Low priority cleanup.
- **logos.js**: Cleaned Feb 2026 (30→20 exports) with `makeLogo()` DRY. "Dirt Ball" → "Dirtball" filename override suggests inconsistent asset naming.

---

## Audit Recommendations

1. **Escrow math (escrow.js):** Fuzz-test 90/7/3 split with varied pot sizes (1 lamport, max u64). Confirm no rounding leaks.
2. **Account resolution (escrow-v2.js):** Verify all PDA references have `pda` in IDL or are passed as non-PDA explicit accounts.
3. **Race conditions (main.js, lifecycle.js):** Add optimistic locking (version field) to Match + GroupMatch schemas. Prevent double-settle.
4. **Socket auth (main.js):** Enforce wallet signature verification on EVERY event, not just connect. Consider JWT bearer token as alternative to per-event signatures.
5. **TOCTOU (solana.js):** Move balance check to settlement time, not lobby join. Or use on-chain escrow deposit to gate match start (Escrow v2 design is correct here).
6. **Privy rollout:** Once PRIVY_APP_ID + PRIVY_APP_SECRET set on Render, verify enforcement is active (test 401 without token).
7. **Replay protection (shot-token.js):** Move verified burn TX set to MongoDB (persistent across restarts). Or require burn account signature from msg.sender.
8. **Telegram bot (bot.js):** Add schema validation to all command handlers. Reject malformed inputs early.
9. **Disconnect timers (main.js):** Use `roomId + playerId` composite key for turn timers, not just `roomId`. Clear on room removal.
10. **Key management (keys.js):** Consider rotating escrow keypair to a multi-sig or hardware wallet for production.

---

## File Counts by Category

| Category | Files | Avg LOC/File |
|----------|-------|--------------|
| Entry & Middleware | 4 | 187 |
| Models | 6 | 161 |
| Services (core) | 18 | 485 |
| Services (challenge) | 7 | 109 |
| Services (groupchat) | 7 | 153 |
| Socket handlers | 2 | 1,135 |
| Scripts | 10 | 48 |
| **Server Subtotal** | **54** | **988** |
| React screens | 31 | 251 |
| Phaser scene & classes | 9 | 337 |
| Wallet & auth | 2 | 395 |
| Components | 27 | 107 |
| Hooks & utilities | 13 | 109 |
| Weapons & data | 5 | 246 |
| **Client Subtotal** | **87** | **211** |
| **Grand Total** | **142** | **594** |

