# SOLSHOT — MASTER TODO
## Updated: 18 Feb 2026

---

## STATUS KEY
- [ ] Not started
- [~] In progress
- [x] Complete

---

## PHASE 1: CODE FIXES & POLISH (Claude)

### 1A: Graphics Issues (from John — 5 items)
- [x] Issue 1: Logo not visible on Menu screen → added fallback text if image fails
- [x] Issue 2: Logo not visible on Loading screen → added fallback text if image fails
- [x] Issue 3: Prestige badges — removed ugly colored circles, enlarged badges (140px / 52px)
- [x] Issue 4: BADGE_IMAGES mapping was wrong (tiers 1-10 pairs → fixed to 1-5 direct)
- [x] Issue 5: Armory cosmetics too sparse → expanded from 10 to 28 items (PATTERN/TRAIL/BLAST/SKIN/KILL)

### 1B: Weapon Logo Audit (DONE)
- [x] Audited logos.js — cut from 30 exports to 20 (active roster only)
- [x] Removed 10 dead weapon logos: fiveshot, tracer, dirtmover, dirtslinger, zapper, worm, homingworm, firecracker, mountainmover, scattershot
- [x] Refactored logos.js — DRYed up with `makeLogo()` helper (383 lines → 44 lines)
- [x] Fixed Dirtball filename mismatch — `getWeaponIconUrl` override for "Dirt Ball" → "Dirtball.png"
- [x] Confirmed 17 of 20 PNGs exist on disk
- [x] **3 genuinely missing PNGs** — RESOLVED: Full 20-icon audit + rename session (18 Feb). All mislabeled AI-generated icons corrected and deployed to `client/public/assets/images/logos/standard/`

**Dead code note:** `extraWeapons.js` is never imported — entirely dead. `Standard.js` still has 10 dead weapon classes (never instantiated) — low-priority cleanup.

### 1C: Wind Physics (DONE)
- [x] `generateWind()` — crypto.randomInt, range [-60, +60] px/s² horizontal acceleration
- [x] `calculateTrajectory()` takes `wind` param — applied to vx each frame (Euler integration)
- [x] Wind applied to all trajectory types: primary, multi-shot, bouncer, homing
- [x] Server generates wind per round in `requestTerrain`, passes to `processShot`
- [x] Client: `Weapon.js defaultShoot` applies `setAccelerationX(wind)` on every projectile
- [x] Client: MainScene stores `this.wind`, pushes to bridge → WindDisplay HUD (already wired)

### 1D: Security Hardening (DONE)
- [x] F1.1 — express-rate-limit + helmet on HTTP endpoints
- [x] F1.2 — socket.io per-event rate limiting (fire-spam + create-room max 3/60s)
- [x] F1.4 — Replace Math.random() with crypto.randomBytes/randomInt (room IDs, terrain seed, first turn, spawn positions)
- [x] F1.5 — matchLength server validation (must be 1, 3, or 5)
- [x] F1.6 — Fix playAgain BO1 reset bug (passes original roundType from room.totalRounds)
- [x] Creator balance check already existed (server line ~755)
- [x] withLock verified correct (double-settlement prevention works)

### 1E: Disconnect/Reconnect (DONE)
- [x] 30-second reconnect window — deferred cleanup, wallet-keyed pending reconnects
- [x] Forfeit on timeout — opponent gets `reconnectExpired`, server runs settlement
- [x] Turn timeout (60s no action → auto-advance to next player)
- [x] Client: opponent disconnect countdown overlay in BattleScreen
- [x] Client: opponentReconnected dismisses countdown
- [x] Client: reconnectExpired shows forfeit win modal
- [x] Client: turnTimeout updates bridge state (currentTurn/turnCount)
- [x] Client: App.js auto-rejoin on socket reconnect (rejoinRoom + rejoinSuccess → battle)

### 1F: Match Modes (DONE)
- [x] Server: MATCH_MODES config (Practice, Quick Match, Duel, High Roller) with wager ranges + format constraints
- [x] Server: validateMatchMode() in createRoom — rejects invalid wager/format combos
- [x] Server: matchMode included in room broadcast (getOpenRooms)
- [x] Client: Mode selector tabs in LobbyScreen with auto-constraining wager/format options
- [x] Client: Room cards show mode badge, format (BO1/3/5), and wager
- [x] Client: Quick Match respects selected mode
- [x] Practice mode = 0 SOL, BO1 only enforced

---

## PHASE 2: ESCROW & ON-CHAIN (Claude + John)

### 2A: Match Escrow Program (DONE — Claude wrote, John deploys)
- [x] Anchor program: create_match, deposit_wager, settle_match, cancel_match
- [x] PDA-based escrow per match (seeds: ["match", match_id])
- [x] 90/7/3 split hardcoded (winner/treasury/ops) — BPS integer math
- [x] 24-hour timeout auto-refund (TIMEOUT_SECONDS = 86400)
- [x] Integer lamport arithmetic (no floating point) — floor treasury/ops, winner gets remainder
- [x] Server escrow service (server/services/escrow.js) — wires to Anchor program
- [x] Client deposit signing (WalletContext.signAndSendEscrowDeposit)
- [x] Server creates escrow on joinRoom, builds deposit TXs, settles on match end
- [x] Tests written (tests/solshot-escrow.ts) — requires `anchor test` with local validator
- [x] Deploy to devnet — Program ID: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`
- [ ] Integration test: full match flow with devnet wallets (after deploy)

### 2B: SHOT Token (DONE — deployed to devnet)
- [x] Mint SPL token on devnet (10M supply, 9 decimals) — `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`
- [x] Burn mint authority (permanently disabled)
- [x] 1.5M SHOT transferred to treasury wallet
- [x] 8.5M SHOT held in dev wallet (7M reward pool + 1M team + 500K liquidity)
- [x] Server .env updated with MATCH_ESCROW_PROGRAM_ID and SHOT_TOKEN_MINT
- [x] Client .env updated with REACT_APP_ESCROW_PROGRAM_ID and REACT_APP_SHOT_TOKEN_MINT
- [ ] Token metadata (name, symbol, image) — TODO: Metaplex after mainnet

### 2C: Prestige Burns (DONE)
- [x] Wire prestige screen "BURN" button → calls signAndBurnShot → emits prestigeBurn with txSignature
- [x] Server verifyBurnTransaction() — on-chain verification (mint, signer, amount, replay protection)
- [x] Client PrestigeScreen: burn state, result display, tier indicators (✓ completed, ◄ next)
- [x] WalletContext.signAndBurnShot() — builds SPL burn instruction, signs via wallet adapter
- [x] Dev mode fallback: skips on-chain verification if SHOT_TOKEN_MINT not set
- [x] Client builds clean, server starts clean

---

## PHASE 3: DEPLOYMENT (John + Claude)

### 3A: Deployment Config (DONE — Claude)
- [x] `render.yaml` — Render IaC config (starter plan, rootDir=server, envVars with program IDs)
- [x] `client/vercel.json` — Vercel SPA config (CRA build, rewrites, static caching)
- [x] `server/.env.example` updated with program IDs, CORS_ORIGINS, SOLANA_KEYPAIR_JSON option
- [x] `client/.env.example` updated with program IDs
- [x] `server/services/solana.js` + `escrow.js` — support SOLANA_KEYPAIR_JSON env var (cloud deploy)
- [x] `server/package.json` — added `engines: { node: ">=18.0.0" }`
- [x] `.gitignore` updated — .env in client, Anchor target/, keypair files

### 3B: Server Deploy (John)
- [ ] Push code to GitHub (JJ-ME55/SolShot)
- [ ] Create Render account → connect GitHub repo
- [ ] Render auto-detects `render.yaml` and configures service
- [ ] Set SECRET env vars in Render dashboard:
  - `SOLANA_KEYPAIR_JSON` — paste raw contents of `~/.config/solana/solshot-dev.json`
  - `JWT_SECRET` — auto-generated by render.yaml (or set your own)
  - `MONGODB_URI` — from MongoDB Atlas (optional for devnet)
- [ ] Wait for first deploy → note the Render URL (e.g. `https://solshot-server.onrender.com`)
- [ ] Verify health check: `curl https://solshot-server.onrender.com/health`

### 3C: Client Deploy (John)
- [ ] Create Vercel account → connect GitHub repo
- [ ] Set root directory to `client`
- [ ] Set framework preset to "Create React App"
- [ ] Set env vars in Vercel dashboard:
  - `REACT_APP_SERVER_URL` = Render URL from 3B (e.g. `https://solshot-server.onrender.com`)
  - `REACT_APP_SOLANA_NETWORK` = `devnet`
  - `REACT_APP_ESCROW_PROGRAM_ID` = `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`
  - `REACT_APP_SHOT_TOKEN_MINT` = `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`
- [ ] Deploy → note the Vercel URL (e.g. `https://solshot-client.vercel.app`)
- [ ] Update Render CORS_ORIGINS to include the actual Vercel URL

### 3D: Domain (DONE)
- [x] solshot.gg registered and pointed

### 3E: Domain + SSL
- [ ] Point solshot.gg DNS to Vercel (CNAME or A record)
- [ ] Verify HTTPS on both Render + Vercel (auto-provisioned)
- [ ] Update Render CORS_ORIGINS to include `https://solshot.gg`
- [ ] Cloudflare if needed for DDoS protection

---

## PHASE 4: ART & ASSETS (John — Gemini/Midjourney)

### 4A: Missing Weapon Icons (DONE)
- [x] All 20 weapon PNGs present in `client/public/assets/images/logos/standard/`

### 4B: Victory/Defeat Screens (DONE)
- [x] Win splash art → `client/public/assets/images/branding/win-screen.png`
- [x] Lose splash art → `client/public/assets/images/branding/lose-screen.png`
- [x] Wired into WinScreen.js + LoseScreen.js as hero banners (replaces text headers)

### 4C: Missing Sound Effects (Freesound.org — 30 min session)
- [ ] tracer.wav — bullet whiz
- [ ] split.wav — crack sound
- [ ] magicwall.wav — stone thud
- [ ] zapper.wav — electric zap
- [ ] skipperbounce.wav — cartoon bounce
- [ ] homing.wav — rocket whoosh
- [ ] sniper.wav — rifle crack

### 4D: PWA Icons (DONE)
- [x] 192x192 icon from bullet crosshair logo
- [x] 512x512 icon from bullet crosshair logo
- [x] Favicon .ico (multi-size: 16/24/32/48/64)
- [x] Maskable PWA icons (192 + 512 with safe-zone padding)
- [x] Apple touch icon (180x180)

### 4E: Barracks Combat Card (DONE)
- [x] Server: persist match stats to MongoDB User model on match end
- [x] Server: `getStats` socket handler returns wallet-linked persistent stats
- [x] Client: BarracksScreen shows live stats (matches/wins/losses/win rate/SOL/SHOT)
- [x] Client: CombatCard component — exportable stats card with html2canvas (clipboard copy or PNG download)

---

## PHASE 5: SOCIAL & LAUNCH PREP (John)

### 5A: Social Accounts
- [ ] Twitter/X @SolShotGG
- [ ] Discord server (announcements, general, feedback, support channels)

### 5B: Content
- [ ] Launch announcement tweet/thread
- [ ] Gameplay trailer (30-60 sec screen capture)
- [ ] 5-10 gameplay screenshots

### 5C: Legal
- [ ] Terms of Service (draft exists in Docs/)
- [ ] Privacy Policy (draft exists in Docs/)
- [ ] Age verification checkbox (18+)
- [ ] Responsible gaming disclosures

---

## PHASE 6: POST-LAUNCH (Both — after live)

### 6A: Telegram
- [ ] Create bot via BotFather
- [ ] Wire middleware (code exists, just enable)
- [ ] Test Mini App after deploy
- [ ] Wallet solution (Privy/Dynamic for embedded wallets)

### 6B: Token Launch
- [ ] SHOT token on mainnet
- [ ] Raydium LP (500K SHOT + SOL seed)
- [ ] CoinGecko / Jupiter listing

### 6C: dApp Store
- [ ] Saga/Seeker submission (after escrow audit)

### 6D: Test Infrastructure
- [ ] Playwright E2E for two-player flow
- [ ] Server integration tests passing
- [ ] Load testing (50+ concurrent matches)

---

## RECENTLY COMPLETED
- [x] **Phase 4E: Combat Card** — Persistent wallet-linked stats (MongoDB User model), BarracksScreen live data, exportable CombatCard component (html2canvas → clipboard/download)
- [x] **Phase 4D: PWA Icons** — Favicon.ico (multi-size), icon-192/512, maskable variants, apple-touch-icon — all from bullet crosshair logo
- [x] **Phase 4B: Win/Lose Screens** — Hero banner images wired into WinScreen.js + LoseScreen.js (replaces text headers)
- [x] **BO3 Round Fixes** — Gold carries over between rounds, ready allowed during ROUND_END, ShopScreen data normalization, terrain cache for round 2, kill tracking + matchEnd stats format
- [x] **HP Bar Redesign** — 140x14px with number overlay, gradient colors, trailing damage ghost bar, floating damage popup
- [x] **Heatseeker Visual Fix** — Corrected homing angle, stronger turn rate, sprite rotation
- [x] **Phase 3A: Deployment Config** — render.yaml, vercel.json, .env.examples updated, SOLANA_KEYPAIR_JSON cloud support, .gitignore hardened
- [x] **Phase 2C: Prestige Burns** — On-chain SPL burn for prestige tiers, server burn tx verification, PrestigeScreen wired with burn button + result UI
- [x] **Phase 2B: SHOT Token** — 10M SHOT minted on devnet (`4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`), mint authority burned, 1.5M to treasury
- [x] **Phase 2A: Match Escrow Program** — Anchor program deployed to devnet (`CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`), PDA escrow, 90/7/3 BPS split, 24h timeout, server escrow.js service, client deposit signing, tests written
- [x] Wind physics — generateWind(), trajectory acceleration, client setAccelerationX, HUD display
- [x] Security hardening — helmet, express-rate-limit, crypto CSPRNG, create-room throttle
- [x] Disconnect/reconnect — 30s window, wallet-keyed rejoin, turn timer (60s), forfeit settlement
- [x] Match modes — Practice/Quick/Duel/High Roller with server-enforced wager+format constraints
- [x] playAgain BO1 reset bug fix (roundType preserved from room.totalRounds)
- [x] matchLength server validation (reject anything not 1/3/5)
- [x] Logo fallback on Menu + Loading screens (shows SOL/SHOT text if image fails)
- [x] Prestige badge fix — removed colored circles, enlarged, fixed tier→image mapping
- [x] Armory expanded — 28 cosmetic items across 5 categories (was 10)
- [x] logos.js audit — cut 30→20 exports, DRY refactor, removed 10 dead weapons
- [x] Dirtball filename fix — override in getWeaponIconUrl for "Dirt Ball"→"Dirtball.png"
- [x] HP system 100→250 (all 7 locations)
- [x] Sniper Rifle fix (1px, 100 dmg)
- [x] Client HP bar from turnResult
- [x] Prestige weapon reorder (HM→Cruiser→Tommy→Chain→Pineapple)
- [x] Homing Missile damage buff (20→60)
- [x] Cruiser damage buff (60→80)
- [x] Pineapple as Diamond weapon
- [x] All 20 weapons in server WEAPON_DATA
- [x] Multi-hit server physics (all weapon types)
- [x] Gold economy (1000G, +15G/HP, +200 kill, +300 win)
- [x] Terrain weapons (Dirt Ball raise, Magic Wall 8x140)
- [x] Heatseeker rewrite (rotation-based homing)
- [x] Round counter fix (matchLength chain, falsy guard, 0-index)
- [x] HP bar percentage fix
- [x] Background images (6 themes)
- [x] Prestige badges (5 tiers)
- [x] Currency icons (SOL, SHOT, Gold)
- [x] Branding assets (logos, banner, OG)
- [x] Tank sprites (base, turret, destroyed)
- [x] Domain: solshot.gg

---

## GEMINI IMAGE PROMPTS

### Weapon Icons — 3 Missing (John — Gemini)
After audit, only 3 PNGs are genuinely missing. Save as 200x200 PNG to `client/public/assets/images/logos/standard/`.
Style: **Military icon, dark steel background, 200x200px, top-down flat illustration, dark olive/gunmetal palette, no text, clean edges, game UI icon style**

1. **Skipper.png** — "A bouncing projectile with motion trail arcs, military icon, dark steel background, flat illustration, 200x200"
2. **Ground_Hog.png** — "A burrowing torpedo-shaped projectile emerging from underground, military icon, dark steel background, flat illustration, 200x200"
3. **Pineapple.png** — "A pineapple-shaped grenade splitting into 20 fragments radiating outward, military icon, dark steel background, flat illustration, 200x200"

### Victory/Defeat Screens
21. **Victory** — "Military victory scene, tank with raised cannon barrel, golden sunset, medal/star burst, dramatic lighting, SolShot artillery game style, 1200x800, dark military theme with gold accents"
22. **Defeat** — "Military defeat scene, damaged smoking tank, dark storm clouds, red/orange glow, somber atmosphere, SolShot artillery game style, 1200x800, dark military theme with muted tones"

---

_This file is the single source of truth for SolShot project status. Update as tasks complete._
