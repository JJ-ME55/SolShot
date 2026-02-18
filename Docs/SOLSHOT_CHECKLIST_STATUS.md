# SolShot Launch Checklist — Status Review
## As of 16 Feb 2026

---

## OVERVIEW

| Workstream | Items | Done | Partial | Todo | % |
|------------|:-----:|:----:|:-------:|:----:|--:|
| A: Local Testing | 42 | 0 | 0 | 42 | 0% |
| B: Solana Infra | 30 | 0 | 0 | 30 | 0% |
| C: Telegram | 16 | 0 | 0 | 16 | 0% |
| D: Deployment | 17 | 0 | 0 | 17 | 0% |
| E: Assets & Polish | 21 | 12 | 3 | 6 | 57% |
| F: Hardening | 17 | 0 | 0 | 17 | 0% |
| G: dApp Store | 10 | 0 | 0 | 10 | 0% |
| H: Test Infra | 10 | 0 | 0 | 10 | 0% |
| **TOTAL** | **163** | **12** | **3** | **148** | **~9%** |

That looks bleak on paper but it's misleading. The **codebase itself is the bulk of the work and it's done** — React migration complete, server authoritative physics working, all screens built. What remains is testing, config, deployment, and blockchain integration. Most of workstream A is just "run the thing and check boxes."

---

## WORKSTREAM A: LOCAL TESTING — 0% Done (but ready to start)

**Status:** No items checked, but the code exists to run all of these. This entire workstream is a testing session, not development work.

**Recommendation:** Block out 3-4 hours and blast through A1-A8 in one sitting. You'll find bugs — that's the point. Track them in a simple `BUGS.md` rather than stopping to fix each one.

### Specific callouts:

- **A1 (Env Setup):** 10 minutes. Copy env files, npm install, go.
- **A2 (Single-Player Smoke):** 20 minutes. Just navigate every screen.
- **A3 (Wallet):** You already have Phantom. Switch to devnet, airdrop, connect. 15 min.
- **A4 (Two-Player Match):** This is the big one. 45-60 min. Open two browsers side by side. This will surface 80% of remaining bugs.
- **A5 (Multi-Round):** 20 min. BO3 test.
- **A6 (Disconnect/Edge):** 30 min. Close tabs mid-match, rapid-click fire, etc.
- **A7 (Server Tests):** `npm test` — 5 min. May need fixes from React migration.
- **A8 (Sound):** 10 min. Note what's missing, move on.

**Total: ~3 hours for the full workstream.**

---

## WORKSTREAM B: SOLANA INFRA — 0% Done

**Status:** All stubbed. Settlement is logged, not on-chain. This is the longest lead item.

### Recommendations by sub-section:

**B1 (Devnet Wallets):** 30 minutes of CLI commands. No reason not to do this today. Generate keypairs, airdrop devnet SOL, set env vars. Zero risk.

**B2 (Wager Match Test):** Depends on A4 passing. Just confirms the stub flow works end-to-end with devnet wallets connected. No actual SOL moves. 1 hour.

**B3 (Match Escrow Program):** This is the big one. My recommendations:

1. **Don't write a custom Anchor program from scratch.** Look at existing escrow patterns — the Solana Cookbook has reference escrow implementations. Adapt, don't reinvent.
2. **Start with the simplest possible program:** deposit + settle + refund. Three instructions. One PDA per match. The server keypair signs settle.
3. **The 90/7/3 split** (winner/treasury/ops) should be hardcoded in the program, not passed as args. Prevents manipulation.
4. **Timeout auto-refund** is critical for trust. Set it at 24 hours. If the server goes down, players get their money back.
5. **Budget $5K-8K for the audit** (from your launch budget doc). Don't skip this. A single escrow bug = game over for trust.
6. **Estimated effort: 1-2 weeks** for an experienced Solana dev. If you're learning Anchor, 2-3 weeks.

**B4 (SHOT Token):** Can be done in parallel with B3. SPL token creation is straightforward CLI work. The harder part is wiring real transfers into the server and client. Recommendation: launch with free matches first, add SHOT rewards after escrow is proven.

**B5 (Raydium LP):** Do this last. Don't create the pool until you have real users playing. The 2.5 SOL + 500K SHOT seed is fine but timing matters — too early and you waste it, too late and people complain.

### My recommended order:
```
B1 (today, 30 min) → B2 (after A4) → B3 (1-2 weeks) → B4 (parallel) → B5 (post-launch)
```

---

## WORKSTREAM C: TELEGRAM — 0% Done

**Status:** Code exists (TelegramContext, middleware), but bot isn't created and nothing is wired.

### Recommendations:

**C1 (Bot Setup):** 10 minutes with BotFather. Do this whenever. No dependency other than having a Telegram account.

**C2 (Wire Middleware):** The middleware already exists in code. Just uncomment/enable it and set the token. 15 min.

**C3 (Testing):** Requires D2 (deployed client). Can't test Mini App locally.

**C4 (Wallet Problem):** This is the real blocker. My recommendation:

- **For MVP launch: Telegram users play free matches only (0 SOL wager).** Don't try to solve the wallet-in-WebView problem before launch. It's a rabbit hole.
- **Post-launch: Evaluate Privy or Dynamic** for embedded wallets. Both have Telegram Mini App SDKs now. Budget ~$100-300/month for their service.
- **Don't try to force Phantom/Solflare deep links in Telegram.** The UX is terrible (app-switching, auth loss, etc).

**Priority: LOW for launch. Do after D2 is live and B3 is working.**

---

## WORKSTREAM D: DEPLOYMENT — 0% Done

**Status:** Nothing deployed yet. Render + Vercel accounts not created.

### Recommendations:

**D1 (Server on Render):** 30-45 min. Create account, connect repo, set env vars, deploy. Use **paid tier from day one** ($7/mo) — Render free tier spins down after 15 min inactivity, which kills WebSocket connections. For a real-time game, this is a non-starter on free tier.

**D2 (Client on Vercel):** 15-20 min. Vercel's free tier is fine for the client (it's just static files). Connect repo, set root to `client/`, set env vars, deploy.

**D3 (Custom Domain):** Buy `solshot.gg` (or `.io`) now before someone else grabs it. Domain registration is $10-15/year. Point it at Vercel. 30 min total including DNS propagation.

**D4 (SSL/Security):** Render and Vercel both provide HTTPS by default. The real work here is helmet.js, CORS lockdown, and rate limiting — which overlaps with F1.

**Priority: HIGH. This should be your Phase 2 immediately after local testing passes.**

### MongoDB decision:
Use **MongoDB Atlas free tier** (512MB). It's enough for match history during early testing. Upgrade to $9/mo shared cluster when you have real traffic. Don't run MongoDB locally — you want persistence across server restarts even in dev.

---

## WORKSTREAM E: ASSETS & POLISH — 57% Done

**Status:** This is where our art review sessions pay off.

### E1: Visual Assets

| Item | Status | Notes |
|------|--------|-------|
| E1.1 — Logo | **DONE** | SOLSHOT_Logo.png, SOLSHOT_Transparent.png, TransparentLogoMonochrome.png |
| E1.2 — PWA icons 192/512 | **TODO** | Crop SOLSHOT_Logo.png icon mark to 192x192 and 512x512 in Figma. 5 min. |
| E1.3 — Favicon | **TODO** | Export SOLSHOT_Logo.png icon mark at 32x32 as .ico. 2 min. |
| E1.4 — Open Graph image | **DONE** | Solshot_OpenGraph.png (1200x630 with tagline) |
| E1.5 — Telegram splash | **DONE** | Solshot_Banner.png works for this |

### E2: Missing Sound Files — 0% Done

| Sound | Recommendation |
|-------|---------------|
| tracer.wav | Use a short "zip/whiz" synth — Freesound.org, search "bullet whiz" |
| split.wav | Short "crack" sound — search "split crack" |
| magicwall.wav | Stone/brick thud — search "stone place" |
| zapper.wav | Electric zap — search "electric zap short" |
| skipperbounce.wav | Bouncy "boing" — search "cartoon bounce" |
| homing.wav | Rocket engine loop — search "rocket whoosh short" |
| sniper.wav | Sharp rifle crack — search "sniper shot" |

**Recommendation:** Spend 30 min on Freesound.org (free CC0 sounds). Download, trim to <1 second each in Audacity, export as WAV. These are not launch blockers — the game works silently without them.

### E3: UI Polish — 0% Done

**Recommendation:** Don't rabbit-hole on this before launch. The React migration already handles responsive layout. Do a quick pass on mobile viewports after D2 is live and real people are testing. The military dark theme has decent contrast already.

---

## WORKSTREAM F: HARDENING — 0% Done

**Status:** No hardening applied yet.

### Priority items (do before any public access):

1. **F1.1 — express-rate-limit** (30 min) — CRITICAL. Without this, anyone can DDoS your server. `npm install express-rate-limit`, add 5 lines of code.
2. **F1.2 — socket.io rate limiting** (1 hour) — CRITICAL. Prevent fire-spam, room-creation spam. Per-event limiters.
3. **F1.4 — crypto.randomBytes** (30 min) — Replace Math.random() for room codes and turn order. Security fix.
4. **F1.5 — Creator balance check** (15 min) — The checklist notes only the joiner is checked. Quick fix.
5. **F1.6 — Double-settlement prevention** (30 min) — Verify withLock is wired correctly.

### Can wait until post-MVP:

- F1.7 (turn timeout) — nice to have, not a launch blocker
- F1.8 (MongoDB analytics) — in-memory is fine for early testing
- F1.9 (structured logging) — console.log is fine until you have traffic
- F1.10 (Sentry) — add when you have real users
- F2.1-F2.7 (client hardening) — error boundaries, reconnect UI, CSP

**Recommendation: F1.1 + F1.2 + F1.4 + F1.5 + F1.6 are the "security minimum" — do these before sharing any public URL. ~3 hours total.**

---

## WORKSTREAM G: DAPP STORE — 0% Done

**Status:** Furthest from ready. Depends on E1 + some blockchain being live.

**Recommendation:** Deprioritize entirely for now. The dApp Store is specifically for Saga/Seeker phone users — a tiny audience. Your web deployment (D2) and Telegram (C) reach 100x more people. Come back to this after B3 is done and you have real wager matches working.

---

## WORKSTREAM H: TEST INFRA — 0% Done

**Recommendation:** Skip for MVP launch. Add tests incrementally as you fix bugs. The server already has `tests/integration.test.js` which covers the basics. The most valuable thing you could add is a single Playwright E2E test for the two-player flow, but that's a "nice to have" for week 2+.

---

## REVISED LAUNCH SEQUENCE

Based on what's actually done and what matters most:

### Week 1: Prove It Works + Deploy

```
Day 1-2: A1-A8 (local testing, bug tracking)
Day 2:   Bug fixes from testing
Day 3:   D1 + D2 (deploy to Render + Vercel)
Day 3:   F1.1 + F1.2 + F1.4 + F1.5 + F1.6 (security minimum)
Day 3:   E1.2 + E1.3 (PWA icons + favicon — 10 min)
Day 4:   D3 (buy domain, point DNS)
Day 4:   Test deployed version with a friend on a different network
```

**Result: Playable game live at solshot.gg with free matches. ~4 days.**

### Week 2: Blockchain Foundation

```
Day 5:   B1 (devnet wallets — 30 min)
Day 5:   B2 (stub wager test on devnet)
Day 5-12: B3 (escrow program — this is the big build)
Day 5:   C1 (create Telegram bot — 10 min while waiting for builds)
```

### Week 3: Token + Telegram

```
Day 12-14: B4 (SHOT token + real transfers)
Day 14:    C2-C3 (wire Telegram, test Mini App)
Day 14:    E2 (missing sounds — 30 min on Freesound)
```

### Week 4: Polish + Pool + Store

```
Day 15-16: E3 (UI polish pass)
Day 17:    B5 (Raydium LP — only if there are real players)
Day 18-20: G1-G2 (dApp Store — only if escrow is audited)
```

---

## TOP 5 ACTIONS FOR TODAY

1. **Run A1-A4** — get the game running locally with two players. This validates everything.
2. **Generate devnet keypairs (B1)** — 10 min of CLI commands, zero risk.
3. **Create Telegram bot (C1)** — 5 min with BotFather, bank the token.
4. **Buy your domain (D3.1)** — before someone else takes solshot.gg.
5. **Sign up for Render + Vercel (D1.1, D2.1)** — accounts ready for deployment day.

All five of these take under an hour combined and unblock everything else.
