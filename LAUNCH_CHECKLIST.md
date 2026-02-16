# SolShot Launch Checklist
## From Current State to Full Production Launch

**Status as of 16 Feb 2026:**
React UI migration complete. Server-authoritative physics working. All 10 screens built.
All Solana/SHOT/Settlement logic is STUBBED (server-side only, no on-chain programs).

The codebase is the bulk of the work and it's done. What remains is testing, config,
deployment, and blockchain integration.

---

## Legend

- `[x]` = Done
- `[ ]` = To do
- `BLOCKER:` = Cannot proceed without this
- `DEP:` = Depends on another task
- `MANUAL:` = Requires human action (accounts, keys, purchases)
- `SECURITY:` = Must be done before any public URL is shared

---

## WORKSTREAM A: LOCAL TESTING (No external deps)

Everything here can be done with just the codebase, localhost, and a browser.
This entire workstream is a testing session, not development work.
Block out 3-4 hours and blast through A1-A8 in one sitting.
Track bugs in BUGS.md rather than stopping to fix each one.

### A1. Environment Setup (~10 min)
- [ ] A1.1 -- Copy `server/.env.example` to `server/.env`, fill in JWT_SECRET (any random string)
- [ ] A1.2 -- Copy `client/.env.example` to `client/.env`, set `REACT_APP_SERVER_URL=http://localhost:5001`
- [ ] A1.3 -- Install server deps: `cd server && npm install`
- [ ] A1.4 -- Install client deps: `cd client && npm install`
- [ ] A1.5 -- (Optional) Set up MongoDB Atlas free tier (512MB) for persistence
         Without MongoDB: server runs fine but match history lost on restart.
         Recommendation: Use Atlas free tier even in dev. You want persistence
         across server restarts. Don't run MongoDB locally.

### A2. Single-Player Smoke Test (~20 min)
- [ ] A2.1 -- Start server: `cd server && npm run dev`
- [ ] A2.2 -- Start client: `cd client && npm start`
- [ ] A2.3 -- Verify LoadingScreen renders (fonts, progress bar, socket connection)
- [ ] A2.4 -- Verify MenuScreen renders (wallet connect button, lobby button)
- [ ] A2.5 -- Navigate to LobbyScreen, verify room list loads (empty is fine)
- [ ] A2.6 -- Navigate to ArmoryScreen, verify weapon list renders
- [ ] A2.7 -- Navigate to PrestigeScreen, verify tier display
- [ ] A2.8 -- Navigate to BarracksScreen, verify stats display
- [ ] A2.9 -- Test ESC key / back button navigation between screens

### A3. Wallet Integration Test (~15 min)
         NOTE: Only needed for wager rooms. Free matches (0 SOL) work without wallet.
- [ ] A3.1 -- Install Phantom browser extension (or Solflare)
         BLOCKER: Need a browser wallet extension
- [ ] A3.2 -- Switch wallet to Devnet
- [ ] A3.3 -- Connect wallet on MenuScreen, verify address shows in TopBar
- [ ] A3.4 -- Verify SOL balance displays (will be 0 on fresh devnet wallet)
- [ ] A3.5 -- Airdrop devnet SOL: `solana airdrop 2 <YOUR_WALLET> --url devnet`
- [ ] A3.6 -- Verify balance updates after airdrop (may need refresh)
- [ ] A3.7 -- Verify wallet disconnect works
- [ ] A3.8 -- Verify auto-reconnect on page reload

### A4. Two-Player Match Test (~45-60 min) -- THE CRITICAL TEST
         This will surface 80% of remaining bugs.
- [ ] A4.1 -- Open two browser windows (or incognito + normal) side by side
- [ ] A4.2 -- Connect different wallets in each (or skip auth for free matches)
- [ ] A4.3 -- Player 1: Create room (0 SOL wager, BO1)
- [ ] A4.4 -- Player 2: Join the room from lobby list
- [ ] A4.5 -- Both players: Click READY
- [ ] A4.6 -- Verify: Both enter ShopScreen (30s timer)
- [ ] A4.7 -- Both players: Buy weapons with starting gold (1000G)
- [ ] A4.8 -- Verify: Both transition to BattleScreen after shop timer
- [ ] A4.9 -- Verify: Phaser canvas renders terrain, tanks, background
- [ ] A4.10 -- Verify: React HUD overlay shows (angle, power, fire button, score, etc.)
- [ ] A4.11 -- Verify: "DEPLOYING..." overlay disappears when Phaser is ready
- [ ] A4.12 -- Player 1 (host): Adjust angle slider, verify turret moves on canvas
- [ ] A4.13 -- Player 1: Adjust power slider
- [ ] A4.14 -- Player 1: Click FIRE, verify projectile launches
- [ ] A4.15 -- Verify: Turn switches to Player 2 after shot resolves
- [ ] A4.16 -- Player 2: Adjust angle/power, fire
- [ ] A4.17 -- Verify: Damage numbers appear, HP bars update in ScoreBoard
- [ ] A4.18 -- Verify: Gold updates after dealing damage (GOLD_PER_DAMAGE = 15/hp)
- [ ] A4.19 -- Verify: Move buttons (A/D or < >) move tank left/right
- [ ] A4.20 -- Verify: MoveCounter dots deplete after moves
- [ ] A4.21 -- Verify: WeaponSelector cycles through available weapons
- [ ] A4.22 -- Play until one tank reaches 0 HP
- [ ] A4.23 -- Verify: Winner sees WinScreen, loser sees LoseScreen
- [ ] A4.24 -- Verify: Both can navigate back to lobby

### A5. Multi-Round Match Test (~20 min)
- [ ] A5.1 -- Create room (0 SOL, BO3)
- [ ] A5.2 -- Play through round 1 until one player wins
- [ ] A5.3 -- Verify: Both transition to ShopScreen between rounds
- [ ] A5.4 -- Verify: Gold balance carries over from battle earnings
- [ ] A5.5 -- Verify: RoundCounter shows correct round (e.g., RND 2/3)
- [ ] A5.6 -- Complete BO3 (first to 2 round wins)
- [ ] A5.7 -- Verify: Final result screen shows match winner

### A6. Disconnect / Edge Case Tests (~30 min)
- [ ] A6.1 -- Mid-match: Close Player 2's tab
- [ ] A6.2 -- Verify: Player 1 gets "Opponent has left" modal
- [ ] A6.3 -- Verify: Player 1 can return to lobby
- [ ] A6.4 -- Mid-shop: Disconnect one player
- [ ] A6.5 -- Verify: Other player handles gracefully
- [ ] A6.6 -- Test: Player creates room then leaves before anyone joins
- [ ] A6.7 -- Verify: Room disappears from lobby list
- [ ] A6.8 -- Test: ESC key opens exit menu during battle
- [ ] A6.9 -- Test: FORFEIT button leaves match and returns to lobby
- [ ] A6.10 -- Test: CANCEL button closes exit menu
- [ ] A6.11 -- Test: Rapid-fire clicking FIRE button (should be debounced)
- [ ] A6.12 -- Test: Server restart mid-match (both clients should error gracefully)

### A7. Server Integration Test (~5 min)
- [ ] A7.1 -- Run existing test: `cd server && npm test`
         This runs `tests/integration.test.js`
- [ ] A7.2 -- Fix any failures from the React migration changes
- [ ] A7.3 -- Verify: test creates room, joins, fires, calculates damage

### A8. Sound Test (~10 min)
- [ ] A8.1 -- Enter battle, verify background music plays (if browser allows autoplay)
- [ ] A8.2 -- Fire a weapon, verify launch sound plays
- [ ] A8.3 -- Explosion hits terrain, verify rubble sounds (rocks_1-6)
- [ ] A8.4 -- Move tank, verify click sound plays
- [ ] A8.5 -- Note which weapon sounds are missing (tracer, split, magicwall, zapper, etc.)
         These are silently skipped -- not a blocker

---

## WORKSTREAM B: SOLANA INFRASTRUCTURE

### B1. Devnet Wallet Setup (~30 min, NO dependencies -- do this today)
- [ ] B1.1 -- MANUAL: Install Solana CLI (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`)
- [ ] B1.2 -- MANUAL: Generate server keypair: `solana-keygen new -o ~/.config/solana/solshot-dev.json`
- [ ] B1.3 -- MANUAL: Generate treasury wallet: `solana-keygen new -o ~/.config/solana/solshot-treasury.json`
- [ ] B1.4 -- MANUAL: Generate ops wallet: `solana-keygen new -o ~/.config/solana/solshot-ops.json`
- [ ] B1.5 -- Set SOLANA_KEYPAIR_PATH in server .env
- [ ] B1.6 -- Set TREASURY_WALLET and OPS_WALLET pubkeys in server .env
- [ ] B1.7 -- Airdrop devnet SOL to server wallet: `solana airdrop 5 --url devnet`
- [ ] B1.8 -- Airdrop devnet SOL to treasury: `solana airdrop 2 --url devnet`

### B2. Wager Match Test (Devnet SOL, ~1 hour)
         DEP: A4 (basic match works), B1 (wallets exist)
         NOTE: No actual SOL moves -- this confirms the stub flow works
         end-to-end with devnet wallets connected.
- [ ] B2.1 -- Both players: Airdrop devnet SOL to browser wallets
- [ ] B2.2 -- Player 1: Create room with 0.01 SOL wager
- [ ] B2.3 -- Verify: Balance check passes for both players
- [ ] B2.4 -- Play match to completion
- [ ] B2.5 -- Verify: `matchSettled` event fires (check server console logs)
- [ ] B2.6 -- Note: No actual SOL moves -- settlement is logged only

### B3. Match Escrow Program (On-Chain, 1-2 weeks)
         DEP: B1, B2 (stub flow proven). This is the BIG blockchain work.
         RECOMMENDATIONS:
         - Don't write from scratch. Adapt existing Solana Cookbook escrow patterns.
         - Start with simplest possible: deposit + settle + refund. Three instructions.
         - One PDA per match, server keypair signs settle.
         - Hardcode the 90/7/3 split in the program, not passed as args.
         - Timeout auto-refund is critical for trust: 24 hours.
         - Budget $5K-8K for audit. Don't skip this.
- [ ] B3.1 -- Design escrow program: deposit, settle, refund instructions
- [ ] B3.2 -- Write Anchor program (Rust) for match escrow
           - PDA derivation: seeds = ["escrow", room_code]
           - deposit: player sends wager SOL to escrow PDA
           - settle: server authority distributes (90% winner, 7% treasury, 3% ops)
           - refund: emergency refund if match cancelled
           - timeout: auto-refund if no settlement within 24 hours
- [ ] B3.3 -- Write Anchor tests (TypeScript)
- [ ] B3.4 -- Deploy to devnet: `anchor deploy --provider.cluster devnet`
- [ ] B3.5 -- Set MATCH_ESCROW_PROGRAM_ID in server .env
- [ ] B3.6 -- Update `server/services/solana.js` settleMatch() to call program
- [ ] B3.7 -- Update `server/services/solana.js` to add deposit instruction
- [ ] B3.8 -- Update client to send deposit tx when creating/joining wager room
- [ ] B3.9 -- Test full wager flow on devnet (deposit -> play -> settle)
- [ ] B3.10 -- Verify: Winner receives ~90% of pot on-chain
- [ ] B3.11 -- Verify: Treasury + Ops wallets receive fees
- [ ] B3.12 -- Test refund flow (match cancelled / timeout)
- [ ] B3.13 -- Security audit the escrow program

### B4. SHOT Token Program (On-Chain, can parallel with B3)
         DEP: B1
         RECOMMENDATION: Launch with free matches first, add SHOT rewards after
         escrow is proven. SPL token creation is straightforward CLI work.
         The harder part is wiring real transfers into server + client.
- [ ] B4.1 -- Create SPL token mint: `spl-token create-token --decimals 6`
- [ ] B4.2 -- Record mint address, set SHOT_TOKEN_MINT in server .env
- [ ] B4.3 -- Mint initial supply: 10,000,000 SHOT to server wallet
- [ ] B4.4 -- Create token accounts for treasury, ops wallets
- [ ] B4.5 -- Write reward distribution program (or use direct SPL transfers)
           - Server signs transfer of SHOT to player after match milestones
- [ ] B4.6 -- Update `server/services/shot-token.js` to do real SPL transfers
- [ ] B4.7 -- Update client WalletContext to read real SHOT balance (getTokenAccountBalance)
- [ ] B4.8 -- Update PrestigeScreen burn to create real burn tx (client signs)
- [ ] B4.9 -- Test: Play matches, verify SHOT appears in wallet
- [ ] B4.10 -- Test: Burn SHOT for prestige tier upgrade
- [ ] B4.11 -- Test: SHOT balance persists across server restarts

### B5. Raydium Liquidity Pool (Post-launch, when real users exist)
         DEP: B4 (SHOT token exists on-chain)
         RECOMMENDATION: Don't create the pool until you have real users playing.
         Too early and you waste it, too late and people complain.
- [ ] B5.1 -- MANUAL: Acquire SOL for initial LP (2.5 SOL planned)
- [ ] B5.2 -- Create Raydium v4 pool: SHOT/SOL
- [ ] B5.3 -- Seed pool: 500,000 SHOT + 2.5 SOL (initial price ~$0.000005/SHOT)
- [ ] B5.4 -- Lock LP tokens via Streamflow (6 months planned)
- [ ] B5.5 -- Verify: SHOT tradeable on Raydium
- [ ] B5.6 -- Add pool address to client for price display (optional)

---

## WORKSTREAM C: TELEGRAM MINI APP

### C1. Bot Setup (~10 min, NO dependencies -- do this today)
- [ ] C1.1 -- MANUAL: Open Telegram, message @BotFather
- [ ] C1.2 -- MANUAL: `/newbot` -> name it "SolShot" (or "SolShot Game")
- [ ] C1.3 -- MANUAL: Copy bot token
- [ ] C1.4 -- Set TELEGRAM_BOT_TOKEN in server .env
- [ ] C1.5 -- MANUAL: `/newapp` -> set Web App URL to your deployed client URL
         DEP: D2 (client deployed) OR use ngrok for testing

### C2. Wire Telegram Middleware (~15 min code change, do before deployment)
         DEP: C1.4 (bot token set)
         The middleware already exists. Just enable it.
- [ ] C2.1 -- In server socket-io setup, add:
           `io.use(telegramSocketMiddleware())` before the main connection handler
- [ ] C2.2 -- Restart server, verify middleware logs on connection

### C3. Telegram Testing
         DEP: C1, C2, D2 (deployed client)
- [ ] C3.1 -- Open bot in Telegram, launch the Mini App
- [ ] C3.2 -- Verify: App loads in Telegram WebView
- [ ] C3.3 -- Verify: TelegramContext detects environment (check for user badge on MenuScreen)
- [ ] C3.4 -- Verify: Viewport adapts (full width, fluid height)
- [ ] C3.5 -- Verify: Back button works on non-menu screens
- [ ] C3.6 -- Test: Two players via Telegram (share bot link)
- [ ] C3.7 -- Test: Wallet connection inside Telegram
         NOTE: Phantom/Solflare likely won't work in Telegram WebView.
         This is expected -- see C4.
- [ ] C3.8 -- Test: Match flow inside Telegram (create room, join, play)
- [ ] C3.9 -- Test: Landscape orientation on mobile
- [ ] C3.10 -- Test: Touch controls (angle/power sliders, fire button, move buttons)

### C4. Telegram Wallet Problem (Research early, implement later)
         IMPORTANT: Research this during Week 1 in parallel with local testing.
         It could change your entire Telegram strategy.
         Solana wallets don't natively work in Telegram WebView.

         RECOMMENDATION FOR MVP:
         Telegram users play free matches only (0 SOL wager).
         Don't try to solve wallet-in-WebView before launch. It's a rabbit hole.
         Don't force Phantom/Solflare deep links -- the UX is terrible
         (app-switching, auth loss, etc).

         POST-LAUNCH:
         Evaluate Privy or Dynamic for embedded wallets. Both have Telegram
         Mini App SDKs now. Budget ~$100-300/month.
- [ ] C4.1 -- Research: Does Phantom support Telegram Mini App deep links?
- [ ] C4.2 -- Research: Solflare Telegram integration
- [ ] C4.3 -- Decision: Use Privy, Dynamic, or Web3Auth for embedded wallet?
         Or: Allow Telegram users to play free matches only (no wager)?
- [ ] C4.4 -- Implement chosen wallet solution for Telegram
- [ ] C4.5 -- Test: Full wager flow inside Telegram

---

## WORKSTREAM D: DEPLOYMENT

### D1. Server Deployment (Render, ~30-45 min)
         DEP: A1-A7 pass locally
         IMPORTANT: Use paid tier ($7/mo) from day one. Render free tier spins down
         after 15 min inactivity, killing WebSocket connections. Non-starter for
         a real-time game.
- [ ] D1.1 -- MANUAL: Create Render account (render.com)
- [ ] D1.2 -- MANUAL: Connect GitHub repo
- [ ] D1.3 -- Create Web Service from render.yaml
- [ ] D1.4 -- Set environment variables in Render dashboard:
           - MONGODB_URI (Atlas connection string)
           - JWT_SECRET (64+ random chars)
           - SOLANA_RPC (devnet for now)
           - TREASURY_WALLET
           - OPS_WALLET
           - PORT=5001
           - NODE_ENV=production
           - TELEGRAM_BOT_TOKEN (if C1 done)
- [ ] D1.5 -- Deploy, verify health endpoint: `https://your-app.onrender.com/health`
- [ ] D1.6 -- Verify: WebSocket connections work (not just HTTP)
- [ ] D1.7 -- Set up MongoDB Atlas (free tier, 512MB) if not already done
         Upgrade to $9/mo shared cluster when you have real traffic.
- [ ] D1.8 -- Test: `https://your-app.onrender.com/stats` shows server metrics

### D2. Client Deployment (Vercel, ~15-20 min)
         DEP: D1 (need server URL)
         Vercel free tier is fine for the client (static files).
- [ ] D2.1 -- MANUAL: Create Vercel account (vercel.com)
- [ ] D2.2 -- MANUAL: Connect GitHub repo, set root to `client/`
- [ ] D2.3 -- Set environment variables:
           - REACT_APP_SERVER_URL=https://your-server.onrender.com
           - REACT_APP_SOLANA_NETWORK=devnet
- [ ] D2.4 -- Deploy, verify: site loads at your-app.vercel.app
- [ ] D2.5 -- Update server CORS to allow your Vercel domain
- [ ] D2.6 -- Test: Full flow on deployed version (2 players, different devices)

### D3. Custom Domain
         RECOMMENDATION: Buy the domain NOW before someone else takes it.
         $10-15/year. Point it at Vercel. 30 min total including DNS propagation.
- [ ] D3.1 -- MANUAL: Purchase domain (e.g., solshot.gg or .io)
- [ ] D3.2 -- Point DNS to Vercel (client)
- [ ] D3.3 -- Update server CORS for custom domain
- [ ] D3.4 -- Update Telegram bot Web App URL to custom domain
- [ ] D3.5 -- Update manifest.json start_url
- [ ] D3.6 -- Update service-worker.js scope

### D4. Security Hardening (MUST do before sharing any public URL)
         SECURITY: These are the "security minimum" -- do before ANY public access.
         ~3 hours total for the critical items.
- [ ] D4.1 -- Verify: Both server and client use HTTPS (Render + Vercel provide this)
- [ ] D4.2 -- SECURITY: Add express-rate-limit: 100 req/min per IP (~30 min)
         Without this, anyone can DDoS your server.
         `npm install express-rate-limit`, add 5 lines of code.
- [ ] D4.3 -- SECURITY: Add socket.io rate limiting per event type (~1 hour)
         Prevent fire-spam, room-creation spam. Per-event limiters.
- [ ] D4.4 -- SECURITY: Replace Math.random() with crypto.randomBytes (~30 min)
         For room codes, turn order. Security fix.
- [ ] D4.5 -- SECURITY: Verify room CREATOR balance too (~15 min)
         Currently only joiner checked. Quick fix.
- [ ] D4.6 -- SECURITY: Verify double-settlement prevention (~30 min)
         withLock exists but verify it's wired correctly.
- [ ] D4.7 -- Add helmet.js to Express for security headers
- [ ] D4.8 -- Review CORS config -- restrict to exact production domain
- [ ] D4.9 -- Verify: JWT_SECRET is strong (64+ random characters)

---

## WORKSTREAM E: ASSETS & POLISH

### E1. Visual Assets
- [x] E1.1 -- Logo: SOLSHOT_Logo.png, SOLSHOT_Transparent.png, TransparentLogoMonochrome.png
- [ ] E1.2 -- Create PWA icons: 192x192 and 512x512 PNG
         Crop SOLSHOT_Logo.png icon mark in Figma. 5 min.
- [ ] E1.3 -- Create favicon.ico from logo
         Export icon mark at 32x32 as .ico. 2 min.
- [x] E1.4 -- Open Graph image: Solshot_OpenGraph.png (1200x630 with tagline)
- [x] E1.5 -- Telegram splash: Solshot_Banner.png works for this
- [ ] E1.6 -- Wire logo into LoadingScreen (replace "S" shell placeholder)

### E2. Missing Sound Files (~30 min on Freesound.org)
         7 weapon sounds referenced in code but no audio files exist.
         NOT a launch blocker -- game works silently without them.
         Recommendation: 30 min on Freesound.org (free CC0 sounds).
         Download, trim to <1 second each in Audacity, export as WAV.

| Sound Key | Suggestion |
|-----------|-----------|
| tracer.wav | Short "zip/whiz" synth -- search "bullet whiz" |
| split.wav | Short "crack" sound -- search "split crack" |
| magicwall.wav | Stone/brick thud -- search "stone place" |
| zapper.wav | Electric zap -- search "electric zap short" |
| skipperbounce.wav | Bouncy "boing" -- search "cartoon bounce" |
| homing.wav | Rocket engine loop -- search "rocket whoosh short" |
| sniper.wav | Sharp rifle crack -- search "sniper shot" |

- [ ] E2.1 -- Source or create all 7 sounds
- [ ] E2.2 -- Place in `client/public/assets/sounds/others/`
- [ ] E2.3 -- Add `this.load.audio(...)` entries to MainScene preload()

### E3. UI Polish (Do after D2 is live and real people are testing)
         Don't rabbit-hole on this before launch.
- [ ] E3.1 -- Test all screens at different viewport sizes (mobile, tablet, desktop)
- [ ] E3.2 -- Fix any overflow / clipping issues
- [ ] E3.3 -- Verify fonts load before first paint (LoadingScreen handles this)
- [ ] E3.4 -- Add touch-friendly hit targets (min 44px) for mobile
- [ ] E3.5 -- Test color contrast against WCAG AA (military theme may be too dark)
- [ ] E3.6 -- Add loading states for socket operations (creating room, joining room)
- [ ] E3.7 -- Add error toasts for failed operations

---

## WORKSTREAM F: PRODUCTION HARDENING

### F1. Server Hardening (Critical items merged into D4)
         The critical security items (rate limiting, crypto.randomBytes, balance checks,
         double-settlement) are now in D4 as SECURITY items done before going public.
         The items below are post-launch improvements.
- [ ] F1.1 -- Add server-side turn timeout (e.g., 60s per turn, auto-forfeit)
- [ ] F1.2 -- Persist analytics to MongoDB (currently in-memory, lost on restart)
- [ ] F1.3 -- Add structured logging (winston or pino) instead of console.log
- [ ] F1.4 -- Set up error alerting (Sentry, or simple webhook to Discord)
- [ ] F1.5 -- Add input validation on ALL socket events (validatePayload middleware)
         Some events already guarded, audit for remaining gaps

### F2. Client Hardening
- [ ] F2.1 -- Add error boundaries around each screen
- [ ] F2.2 -- Add reconnection handling (socket.io auto-reconnects, but UI should show status)
- [ ] F2.3 -- Add "connection lost" overlay when socket disconnects
- [ ] F2.4 -- Graceful handling of stale game state on reconnect
- [ ] F2.5 -- Add CSP (Content Security Policy) headers via Vercel config
- [ ] F2.6 -- Minimize bundle: verify tree-shaking, check bundle size
- [ ] F2.7 -- Add `react-error-boundary` for Phaser crash recovery

### F3. Monitoring
         DEP: D1
- [ ] F3.1 -- Set up uptime monitoring (UptimeRobot, BetterStack, or Render's built-in)
- [ ] F3.2 -- Set up alerts for server errors (Sentry or Discord webhook)
- [ ] F3.3 -- Monitor WebSocket connection counts (prevent resource exhaustion)
- [ ] F3.4 -- Set up MongoDB Atlas alerts (connection limits, slow queries)

---

## WORKSTREAM G: SOLANA DAPP STORE

         RECOMMENDATION: Deprioritize entirely for now. The dApp Store is specifically
         for Saga/Seeker phone users -- a tiny audience. Your web deployment (D2) and
         Telegram (C) reach 100x more people. Come back after B3 is done and you have
         real wager matches working.

### G1. TWA (Trusted Web Activity) Setup
         DEP: D2 (client deployed), E1 (icons ready)
- [ ] G1.1 -- Generate Android keystore for TWA signing
- [ ] G1.2 -- Update `.well-known/assetlinks.json` with keystore fingerprint
- [ ] G1.3 -- Build TWA wrapper using Bubblewrap or PWABuilder
- [ ] G1.4 -- Test TWA on Android device
- [ ] G1.5 -- Verify: App installs, opens fullscreen, no browser bar

### G2. dApp Store Submission
         DEP: G1, E1, B3 or B4 (some on-chain component)
- [ ] G2.1 -- Fill in `dapp-store/config.yaml` with real metadata
- [ ] G2.2 -- Take 3-5 screenshots of gameplay
- [ ] G2.3 -- Write app description (short + long)
- [ ] G2.4 -- Submit to Solana dApp Store
- [ ] G2.5 -- Address any review feedback

---

## WORKSTREAM H: TESTING INFRASTRUCTURE (Optional but Recommended)

         RECOMMENDATION: Skip for MVP launch. Add tests incrementally as you fix bugs.
         The server already has tests/integration.test.js for the basics.
         Most valuable addition would be a single Playwright E2E test for the
         two-player flow -- nice to have for week 2+.

### H1. Automated Tests
- [ ] H1.1 -- Set up Jest for client: add test config to package.json
- [ ] H1.2 -- Write unit tests for GameBridge (state updates, dirty flag)
- [ ] H1.3 -- Write unit tests for useSocket hook (listener management)
- [ ] H1.4 -- Write unit tests for useGameState hook (polling, consume)
- [ ] H1.5 -- Write component tests for BattleHUD (renders all sub-components)
- [ ] H1.6 -- Expand server integration test to cover:
           - Wager room creation + balance check
           - Shop phase (buy weapons, timer)
           - Full match lifecycle (multiple rounds)
           - Disconnect/reconnect handling
- [ ] H1.7 -- Set up Playwright for E2E browser tests
- [ ] H1.8 -- Write E2E test: Two-player full match flow

### H2. CI/CD Pipeline
- [ ] H2.1 -- Add GitHub Actions workflow: lint + test on PR
- [ ] H2.2 -- Add build check (webpack compiles without errors)
- [ ] H2.3 -- Add auto-deploy on merge to main

---

## REVISED LAUNCH SEQUENCE

### Week 1: Prove It Works + Deploy

```
Day 1-2: A1-A8      (local testing, bug tracking in BUGS.md)
Day 2:   Bug fixes   (from testing)
Day 3:   D1 + D2     (deploy to Render + Vercel)
Day 3:   D4.2-D4.6   (security minimum -- rate limiting, crypto random, balance checks)
Day 3:   E1.2+E1.3   (PWA icons + favicon -- 10 min)
Day 4:   D3          (buy domain, point DNS)
Day 4:   Test deployed version with a friend on a different network
```

**Result: Playable game live with free matches. ~4 days.**

### In parallel during Week 1:
```
B1          (devnet keypairs -- 30 min of CLI commands, zero risk)
C1          (create Telegram bot -- 5 min with BotFather, bank the token)
C2          (wire middleware -- 15 min code change)
C4.1-C4.3  (RESEARCH wallet-in-Telegram -- could change strategy)
D3.1        (buy domain before someone takes it)
```

### Week 2: Blockchain Foundation
```
Day 5:      B2       (stub wager test on devnet)
Day 5-12:   B3       (escrow program -- this is the big build)
Day 5:      C3       (test Telegram Mini App now that D2 is live)
```

### Week 3: Token + Telegram
```
Day 12-14:  B4       (SHOT token + real transfers)
Day 14:     E2       (missing sounds -- 30 min on Freesound)
```

### Week 4: Polish + Pool + Store
```
Day 15-16:  E3       (UI polish pass)
Day 15-16:  F1-F3    (post-launch hardening, monitoring)
Day 17:     B5       (Raydium LP -- only if there are real players)
Day 18-20:  G1-G2    (dApp Store -- only if escrow is audited)
```

---

## TOP 5 ACTIONS FOR TODAY

All five take under an hour combined and unblock everything else:

1. **Run A1-A4** -- Get the game running locally with two players. Validates everything.
2. **Generate devnet keypairs (B1)** -- 10 min of CLI commands, zero risk.
3. **Create Telegram bot (C1)** -- 5 min with BotFather, bank the token.
4. **Buy your domain (D3.1)** -- Before someone else takes solshot.gg.
5. **Sign up for Render + Vercel (D1.1, D2.1)** -- Accounts ready for deployment day.

---

## CRITICAL PATH TO MINIMUM VIABLE LAUNCH

The absolute minimum to go live with free matches (no wager):

1. A1-A7 (local testing -- fix bugs found)
2. D1-D2 (deploy server + client)
3. D4.2-D4.6 (security minimum before going public)
4. E1.2+E1.3+E1.6 (PWA icons + favicon + logo wired in)

That gets you a playable, deployed game people can use.

Everything else (Solana wagers, SHOT token, Telegram, dApp Store)
can be added incrementally while the game is live.

---

## TOTAL ESTIMATED EFFORT

| Workstream | Items | Effort | Notes |
|------------|-------|--------|-------|
| A: Local Testing | 42 | 3-4 hours | Just testing, not dev work |
| B: Solana Infra | 30 | 1-3 weeks | B3 escrow is the longest lead |
| C: Telegram | 16 | 1-2 days | C4 wallet problem needs early research |
| D: Deployment + Security | 17 | 1 day | Includes critical security items |
| E: Assets/Polish | 12 | 1-2 days | Logo done, sounds + icons remain |
| F: Post-Launch Hardening | 12 | 2-3 days | After deploy, incremental |
| G: dApp Store | 10 | 3-5 days | Deprioritize until B3 done |
| H: Test Infra | 10 | Ongoing | Skip for MVP |
| **TOTAL** | **149** | **~4 weeks to full launch** | **MVP in ~4 days** |
