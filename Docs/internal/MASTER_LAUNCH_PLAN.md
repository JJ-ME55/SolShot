# SolShot — Master Launch Plan

> **Authored:** 30 Apr 2026 · `main-claude`
> **Audience:** `fishyboy-claude`, future contributors, future-me
> **Living document:** update as items complete, decisions land, scope shifts.
> **Companion docs (this folder):** [`CLAUDE_COMMS.md`](./CLAUDE_COMMS.md) · [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) · [`GROUP_CHAT_MODE.md`](./GROUP_CHAT_MODE.md)

---

## §0 · How to use this document

This is the comprehensive backlog + launch sequence for SolShot. Every item is sized so a Claude (or human) can pick it up cold and start.

**Per-item template:**

```
**What:**     1-line description of the work
**Why:**      problem it solves / outcome
**Where:**    code paths + GitHub links to read first
**Prereqs:**  files / docs to read before starting
**Owner:**    main-claude | fishyboy-claude | @johnk | TBD
**Phase:**    which launch phase blocks this OR is blocked by it
**Effort:**   rough estimate
```

**Picking up an item:**
1. Read the item's **Prereqs** section first
2. If it's a `fishyboy-claude` item, no further coordination needed — comms log entry on commit is enough
3. If it's `main-claude` or `TBD`, drop a `[fishyboy-claude]` STATUS entry in `CLAUDE_COMMS.md` claiming the item before starting (avoids both Claudes working the same thing)
4. If it's `@johnk` (decision/policy/external), DO NOT start coding — flag in comms log instead

**Code links** point to `main` branch unless explicitly noted (e.g. group-chat code on `sandbox/fishyboy`).

---

## §1 · Where we are right now

### What's live in production
- `solshot.gg` — full client deployed (Vercel), 1v1 practice playable, mobile responsive, all 20 weapons + 6 backgrounds
- Render server — escrow service deployed (devnet), bot, websocket, full game loop
- TG Mini App — `@SolShotGG_bot` live, deep-link routing, all smart-reply commands wired
- MongoDB — User docs with TG identity linking, prestige tracking, match history, referral system
- Anchor escrow program — devnet only, never settled real-money matches

### What's built but NOT yet activated
- **Wagered challenge UI** in lobby — wager picker (FREE / 0.1 / 0.25 / 0.5 / 1.0 / CUSTOM), produces shareable Challenge doc + deep link. Full path is wired through to escrow but waiting on Dynamic.
- **Dynamic embedded wallets** — code lives on `launch` branch (commit [`8436bf3`](https://github.com/JJ-ME55/SolShot/commit/8436bf3)), never merged to `main`. Until ported, TG users have NO functional wallet path (Phantom/Solflare don't work in TG WebView).
- **N-player infrastructure** — server has Phase 15-style N-player code (variable maxPlayers, players[] array, alive map, placement points, elimination order) but only 2-player mode is exercised in production today.

### What's NOT in production
- SHOT mainnet (currently devnet token `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`)
- Real SOL wagering (escrow exists on devnet only)
- Group-chat mode (Fish's territory, sandbox branch)
- Tournament mode
- Solana Seeker / dApp Store presence
- Smart contract audit (CRITICAL gate before any real-money launch)

---

## §2 · Launch sequence (no fixed dates — sequenced milestones)

The plan is to launch in passes, each one validating something before the next pass adds risk.

### **Phase A — Public Practice Launch** (READY NOW, no blockers)
Goal: get real users into practice matches. Prove the Mini App + web client hold up under public load. Build a leaderboard rivalry that becomes viral content.

**What goes live:**
- Marketing push: launch tweet, gameplay trailer, Discord push, CT influencer outreach
- Leaderboard becomes social — players sharing stats cards organically
- Referral program (already built — 25 SHOT each side on first wagered match — note: SHOT not yet live so referrals accrue but don't dispense yet)
- TG Mini App as primary distribution channel

**Out of scope (Phase A):** real money. Nothing on-chain happens yet for real users — all wagering UI is "set up wallet" gated.

### **Phase B — Promo Run** (parallel/overlapping with A)
Goal: keep audience momentum during the wagering wait. Tease what's coming.

**What goes live:**
- Demo video / GIF on solshot.gg as hero asset
- `/tokenomics` page (SHOT economics, escrow split, prestige tiers)
- Sticker library released (Fish's commission)
- Group-chat mode v1 (Fish's Phase 1 — free, no escrow)
- Tournament announcements (no real prizes yet, but format proven)

**Out of scope (Phase B):** still no real money.

### **Phase C — Devnet Wagering Closed Test** (gated by Dynamic port)
Goal: prove escrow + wallet flow end-to-end with internal testers + invited group.

**What needs to happen:**
1. Cherry-pick `8436bf3` (Dynamic) to `main`
2. Set `REACT_APP_DYNAMIC_ENV_ID` on Vercel
3. Run integration test suite (full flow: create → deposit → play → settle)
4. Stress test: ~20 concurrent escrow matches
5. Audit edge cases: timeout refund, cancel mid-match, double-settle, deposit-disconnect
6. Fix `verifiedBurnTxs` replay protection — currently in-memory `Set`, lose on restart, needs Redis or DB-backed
7. Closed-list testers play wagered matches with devnet SOL

**Out of scope (Phase C):** mainnet, real money, public access to wagering.

### **Phase D — Mainnet Token Launch + LP**
Goal: SHOT goes live. LP exists. Token tradable.

**What needs to happen:**
1. Smart contract audit (CRITICAL — see §3)
2. SHOT token Metaplex metadata (name, symbol, image)
3. Mint SHOT on mainnet (or migrate devnet)
4. Meteora single-sided LP setup (confirmed partner)
5. Jupiter listing
6. Treasury wallet ops (decision pending — see §3)
7. Mainnet RPC provider chosen + integrated (see §3)
8. Anchor program redeployed to mainnet
9. Update `SHOT_TOKEN_MINT` and `MATCH_ESCROW_PROGRAM_ID` in production env

**Out of scope (Phase D):** wagering still gated off until Phase E flips it on.

### **Phase E — SOL Wagering Live (1v1)**
Goal: real money 1v1 wagering. The big one.

**What needs to happen:**
1. Production keypair management + backup/DR (see §3 OPEN — currently single keypair on disk)
2. Monitoring + alerting (escrow failures, settle failures, RPC errors)
3. Cloudflare DDoS protection + caching rules
4. Cloudflare proxy for solshot.gg (currently proxied? confirm)
5. Remove `localhost` from production CORS
6. Run referral SHOT dispense (was accruing pre-launch — now flips on)
7. Prestige burns activate (Bronze through Diamond unlock real weapons)
8. Public announcement: wagering live

**Out of scope (Phase E):** multi-player wagering (Phase F), tournaments (Phase F+), Seeker/dApp Store (Phase F+).

### **Phase F — Multi-Player Wagering + Seeker / dApp Store**
Goal: 3P/4P wagered, group-chat wagered, Seeker presence.

**What needs to happen:**
1. Phase 9A — N-player mode test + ship (server code exists, client integration partial)
2. Escrow v2 (Fish's spec, multi-party PDA) — required for group-chat wagered + 3P/4P wagered with team takes
3. Group-chat mode Phase 2 (wagered) — Fish's Phase 1 already shipped by then
4. Solana Seeker integration (Phase 9B)
5. Tournament mode (Phase 11)
6. dApp Store submission

---

## §3 · Open decisions (BLOCKING / @johnk)

These are policy / partnership / spend decisions. Code can prepare for either branch but can't ship without resolution.

| # | Decision | Blocks Phase | Status | Notes |
|---|---|---|---|---|
| **D1** | **Smart contract audit firm + budget** | E | OPEN | Realistic firms: Halborn, OtterSec, Neodyme, Sec3. Typical budget 8-25k USD for a small Anchor program. Timeline 2-4 weeks. **Hard gate on real-money launch.** |
| **D2** | **Treasury wallet ops** | D | OPEN | Multi-sig (Squads, Realms) vs single-key. Multi-sig is best practice but adds friction. Affects: how settle/refund authority is held, how rollback works. |
| **D3** | **Mainnet RPC provider** | D | OPEN | Helius / QuickNode / Triton / self-hosted. Affects: cost (free tier vs paid), rate limits (some hit 429 under load), reliability. Helius is most common for Solana games. |
| **D4** | **KYC stance** | E | "OK" — open | @johnk neutral. Crypto-native default = no KYC. Adding KYC opens regulated jurisdictions (US/UK with proper licensing) but adds friction + cost. v1 likely no-KYC, revisit if jurisdictional pushback. |
| **D5** | **Geofencing** | E | "No" — confirmed | @johnk: no geofence. Implies crypto-native open access. Document risk. |
| **D6** | **LP partner** | D | Meteora — confirmed | Single-sided LP via Meteora. No alternative being evaluated. |
| **D7** | **Bug bounty program** | E+ | TBD | Post-launch. Immunefi or self-hosted (smaller scope). Not a launch blocker but worth scoping. |

---

## §4 · Active backlog (by category)

Each item is sized so any picker (main-claude, fishyboy-claude, @johnk) can read the prereqs, hit the code links, and start.

### §4.1 Gameplay & game feel

#### 7A — Mouse-aim + click-to-fire (desktop)
- **What:** Replace dual-slider angle/power input with mouse-driven aim (cursor → angle + distance). Left-click fires.
- **Why:** Current control scheme is clunky — two separate sliders for what should be one fluid gesture. Mouse-aim is industry standard for browser artillery and dramatically improves perceived game-feel.
- **Where:**
  - [client/src/scenes/main/index.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/scenes/main/index.js) — Phaser MainScene; add `pointermove` + `pointerdown` handlers
  - [client/src/components/AngleControl.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/components/AngleControl.js) — keep as readout
  - [client/src/utils/GameBridge.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/utils/GameBridge.js) — `setAngle()`/`setPower()`/`fire()` already exposed
- **Prereqs:**
  - Read `MainScene` carefully — turret tracking lives there
  - Read [`TODO.md` Phase 7A](https://github.com/JJ-ME55/SolShot/blob/main/TODO.md) for full target spec
  - Q/E keyboard aim must remain as fallback/fine-tune
  - Only track when `myPlayerIndex === currentPlayerIndex`
- **Owner:** TBD (main-claude or fishyboy-claude can claim)
- **Phase:** A (improves practice launch feel — not strictly blocking, but high impact)
- **Effort:** 4–8h

#### 7B — Touch-drag aim (mobile, Angry Birds style)
- **What:** Replace mobile vertical sliders with touch-drag from tank: drag direction = aim direction (inverted), drag distance = power, release to fire.
- **Why:** Vertical sliders are fiddly on small screens. Touch-drag is the industry-standard mobile artillery control. Critical for TG Mini App UX since most TG users are mobile.
- **Where:**
  - [client/src/scenes/main/index.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/scenes/main/index.js) — same scene, mobile-specific touch handlers
  - [client/src/components/PowerControl.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/components/PowerControl.js) + [AngleControl.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/components/AngleControl.js) — hide on mobile during drag
- **Prereqs:**
  - 7A (desktop) should land first to share input plumbing
  - [`TODO.md` Phase 7B](https://github.com/JJ-ME55/SolShot/blob/main/TODO.md) for full spec — show dotted guide line, must work landscape
- **Owner:** TBD
- **Phase:** A
- **Effort:** 4–8h (after 7A)

#### 7C — Terrain wall decay
- **What:** Magic Wall (weapon ID 12) currently persists forever. Make walls decay after N rounds (3-5, tuneable).
- **Why:** Walls accumulate and gridlock longer matches. Decaying walls turn them into tactical tempo plays instead of permanent map control.
- **Where:**
  - [server/services/physics.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/physics.js) — `processWallShot()`, also `decayWalls()` already exists (verify what it does — name suggests partial implementation)
  - [server/socket-io/main.js](https://github.com/JJ-ME55/SolShot/blob/main/server/socket-io/main.js) — round start hook to call decay
- **Prereqs:**
  - Server tracks `{ x, width, height, roundPlaced }` per room
  - Each round start: check age, revert heightmap if expired
  - Visual cracking on final round = nice-to-have
- **Owner:** TBD
- **Phase:** A
- **Effort:** 3-4h

#### 9C — Hull upgrades / tank customization
- **What:** Persistent hull upgrades (HP+, armor mods) earned through play or bought with SHOT.
- **Why:** Long-term progression hook beyond cosmetics. Increases stickiness past the prestige loop.
- **Where:** Greenfield — touches User model, BattleScreen, ShopScreen, Loadout.
- **Prereqs:** Phase D (SHOT live) for purchasable upgrades. Visual mods can ship sooner.
- **Owner:** TBD
- **Phase:** F (post-mainnet)
- **Effort:** 2-3 days

### §4.2 Mobile UX

#### G — Mobile portrait fallback (proper portrait menu)
- **What:** Currently portrait shows "Rotate to landscape" + a "Continue in Portrait" button that drops users into a half-broken desktop layout. Build a real portrait menu OR refuse portrait harder.
- **Why:** Some users won't rotate. The "Continue in Portrait" is a dead-end UX.
- **Where:**
  - [client/src/screens/MenuScreen.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/screens/MenuScreen.js) — `MobileMenu` is landscape-only; needs portrait variant
- **Prereqs:** Decide whether to support portrait or hard-block it. If supporting, mirror the single-column stack pattern (tank above PLAY).
- **Owner:** TBD
- **Phase:** A
- **Effort:** 1-2h

#### H — Loading skeletons
- **What:** Add proper skeletons to lazy-loaded screens (LobbyScreen, BarracksScreen) instead of empty flash during chunk fetch.
- **Why:** Empty flash on first deep-link feels broken. Skeletons make perceived performance much better.
- **Where:**
  - [client/src/App.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/App.js) — `ScreenFallback` is the current minimal fallback
  - Each lazy screen could expose a `Skeleton` named export
- **Prereqs:** None.
- **Owner:** TBD
- **Phase:** A
- **Effort:** 1h

#### I — Onboarding tour
- **What:** First-time TG user lands on Menu with no context. 3-step tap-to-dismiss overlay explaining PLAY / VS BOT / BARRACKS.
- **Why:** Retention. Most TG Mini App opens are first-touch — they need a 5-second orientation.
- **Where:** Greenfield — likely `client/src/components/OnboardingTour.js` + flag in localStorage.
- **Prereqs:** None.
- **Owner:** TBD
- **Phase:** A
- **Effort:** 2h

### §4.3 Bot UX (smart replies + commands)

All current commands have smart replies. These are enhancements.

#### Smart `/help` reply enhancement
- **What:** `/help` is plain text. Could include user's current tier + next-action recommendation ("Currently UNRANKED — play 1 match to start tracking").
- **Where:** [server/services/bot.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/bot.js)
- **Prereqs:** Pattern from `/wallet` / `/stats`.
- **Owner:** TBD
- **Phase:** A
- **Effort:** 30min

#### Inline mode "rematch share" from post-match
- **What:** After a match, button to share trophy card via TG inline mode (currently only manual /share-style flow).
- **Where:**
  - [client/src/components/TrophyShareOverlay.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/components/TrophyShareOverlay.js)
  - Server: extend `inline_query` handler to support `rematch_<matchId>` queries
- **Prereqs:** Pattern from `query.startsWith('stats')` in [server/services/bot.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/bot.js).
- **Owner:** TBD
- **Phase:** A/B
- **Effort:** 1h

### §4.4 Cards & sharing

Most card work is done. Outstanding:

#### Trophy share PNG quality at small widths
- **What:** Verify trophy card legibility at 340px (TG inline thumbnail size). Audit if any text falls below readable thresholds.
- **Where:** [server/services/challenge/TrophyShareCard.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/challenge/TrophyShareCard.js)
- **Prereqs:** None.
- **Owner:** TBD
- **Phase:** A
- **Effort:** 1h

### §4.5 Wagering / Escrow

#### Cherry-pick Dynamic to main
- **What:** Port commit [`8436bf3`](https://github.com/JJ-ME55/SolShot/commit/8436bf3) from `launch` branch to `main`. Adjust for any conflicts (file may have moved since Apr 13). Set Dynamic env var on Vercel.
- **Why:** Hard-blocks all wagered flows for TG users. Without this, TG users get a working identity link but no wallet path.
- **Where:**
  - Source: `launch` branch commit `8436bf3` (touches `client/src/wallet/`, `client/.env.example`, `client/package.json`, lockfile)
  - Target: `main`
- **Prereqs:**
  - Read commit on launch branch first
  - Set up Dynamic dashboard (env id + Telegram provider)
  - Add `REACT_APP_DYNAMIC_ENV_ID` to Vercel env
- **Owner:** main-claude
- **Phase:** C (gates devnet wagering test)
- **Effort:** 2-4h (likely conflicts since `WalletContext.js` has changed)

#### 7E — Escrow integration tests
- **What:** Full E2E: create match → deposit from both wallets → play → settle. Devnet wallets, real Anchor program calls.
- **Where:**
  - [server/tests/integration.test.js](https://github.com/JJ-ME55/SolShot/blob/main/server/tests/integration.test.js) — extend
  - [tests/solshot-escrow.ts](https://github.com/JJ-ME55/SolShot/blob/main/tests/solshot-escrow.ts) — Anchor-side, needs local validator
- **Prereqs:**
  - Read [server/services/escrow.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/escrow.js)
  - Devnet wallet keypair available
- **Owner:** TBD
- **Phase:** C (gates wagering test)
- **Effort:** 1-2 days

#### 7E — Escrow stress test
- **What:** ~20 concurrent escrow matches. Watch for race conditions, RPC rate limits, settle conflicts.
- **Where:** New file in `server/tests/`.
- **Prereqs:** Integration tests above; devnet RPC quota.
- **Owner:** TBD
- **Phase:** C
- **Effort:** 1 day

#### 7E — Edge case audit
- **What:** Test timeout refund, cancel mid-match, double-settle attempt, player disconnect during deposit, server restart during deposit window.
- **Where:** [server/socket-io/main.js](https://github.com/JJ-ME55/SolShot/blob/main/server/socket-io/main.js) — escrow flow + [server/services/escrow.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/escrow.js)
- **Prereqs:** Integration tests.
- **Owner:** TBD
- **Phase:** C
- **Effort:** 1-2 days

#### Verify replay protection survives restart
- **What:** `verifiedBurnTxs` is currently `Set` in memory at [server/services/shot-token.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/shot-token.js). Loses on restart → reusable burn signatures briefly. Move to Redis or DB-backed.
- **Why:** Security. Even if window is small, signature reuse = double-burn on restart.
- **Where:** `server/services/shot-token.js` `verifiedBurnTxs`
- **Prereqs:** None — straightforward refactor.
- **Owner:** TBD
- **Phase:** C
- **Effort:** 2h

#### **Smart contract audit (CRITICAL)**
- **What:** Engage external audit firm for `programs/solshot-escrow/src/lib.rs`. Address findings, redeploy.
- **Why:** Hard gate on real-money launch. Lawsuits/reputation/treasury all on the line.
- **Where:** [programs/solshot-escrow/src/lib.rs](https://github.com/JJ-ME55/SolShot/blob/main/programs/solshot-escrow/src/lib.rs)
- **Prereqs:** **D1 decision (firm + budget) — see §3.**
- **Owner:** @johnk (engagement); main-claude (address findings)
- **Phase:** E (gates SOL wagering)
- **Effort:** 2-4 weeks calendar

### §4.6 Token / treasury / on-chain

#### 10A — SHOT Metaplex metadata
- **What:** Mint SHOT with proper Metaplex metadata (name, symbol, image, description). Devnet mint currently has none.
- **Where:** New script in `scripts/` or via Metaplex CLI.
- **Prereqs:** Designer-supplied SHOT logo (1:1, transparent). Choose final symbol — `$SHOT`.
- **Owner:** @johnk (mint authority); main-claude (script)
- **Phase:** D
- **Effort:** 2-3h

#### 10A — Mainnet token mint or migration
- **What:** Either fresh mint on mainnet or migration script for devnet → mainnet. Devnet supply 10M, mint authority burned.
- **Where:** New script.
- **Prereqs:** D1 (audit done), D2 (treasury), D3 (RPC).
- **Owner:** @johnk + main-claude
- **Phase:** D
- **Effort:** 1-2h

#### 10A — Meteora LP setup
- **What:** Single-sided LP. Initial liquidity TBD by @johnk.
- **Where:** Meteora UI; verify with [meteora.ag](https://meteora.ag)
- **Prereqs:** SHOT mainnet mint live; mainnet treasury wallet.
- **Owner:** @johnk
- **Phase:** D
- **Effort:** 1 day

#### 10A — Jupiter listing
- **What:** Submit SHOT to Jupiter strict list.
- **Where:** Jupiter token-list submission process.
- **Prereqs:** LP live with sufficient depth.
- **Owner:** @johnk
- **Phase:** D
- **Effort:** community process — ~1 week

### §4.7 Multi-player / Group chat (Fish's territory)

#### 9A — 3-4 player mode activation
- **What:** N-player code exists in server/ (`turnsPerRound`, `placementPoints`, `eliminationOrder`, `players[]`, `alive{}`). Client integration partial. Activate, test, ship.
- **Where:**
  - [server/services/match.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/match.js) — `createMatchState` already takes `maxPlayers`
  - [server/socket-io/main.js](https://github.com/JJ-ME55/SolShot/blob/main/server/socket-io/main.js) — `players[]` array logic
  - [client/src/scenes/main/index.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/scenes/main/index.js) — N tank rendering
- **Prereqs:**
  - Read [SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md](https://github.com/JJ-ME55/SolShot/blob/main/SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md) (if exists)
  - Server N-player code is mostly done (Phase 15-16 in commit history) — read the most recent commits touching `players[]`
- **Owner:** fishyboy-claude (most aligned with group-chat)
- **Phase:** F
- **Effort:** 1-2 weeks

#### Group-chat mode Phase 1 (free)
- **What:** Free-mode group chat — TG group becomes a persistent match instance. No escrow.
- **Where:** Spec at [GROUP_CHAT_MODE.md](./GROUP_CHAT_MODE.md) v0.2.
- **Prereqs:** Read group-chat spec, latest CLAUDE_COMMS entries (Q-006 through Q-009 resolutions).
- **Owner:** **fishyboy-claude (UNBLOCKED — go)**
- **Phase:** B (parallel to public practice launch — adds discovery surface)
- **Effort:** Fish's estimate

#### Group-chat mode Phase 2 (wagered)
- **What:** Wagered version of group-chat. Requires Escrow v2 (multi-party PDA).
- **Where:** Spec at [GROUP_CHAT_MODE.md](./GROUP_CHAT_MODE.md) v0.2 §3 escrow v2 spec.
- **Prereqs:** Phase 1 done; Escrow v2 program written + audited.
- **Owner:** fishyboy-claude (spec); main-claude or @johnk (escrow program)
- **Phase:** F
- **Effort:** Significant — multi-week

#### Sticker library design + integration
- **What:** Commission 15-20 reaction stickers + 1 GIF. Integrate with TG bot for chat-tier reactions.
- **Where:** Design happens externally; integration in `server/services/bot.js` for stickerset usage.
- **Prereqs:** @johnk briefs designer.
- **Owner:** @johnk (design); fishyboy-claude (integration)
- **Phase:** B
- **Effort:** Design 1-2 weeks; integration 1 day

### §4.8 Tournament

#### 11A — Tournament mode
- **What:** Players enter, compete in series of matches for prize pool.
- **Where:** Greenfield. Touches lobby, match flow, escrow (multi-pool).
- **Prereqs:** N-player working; Escrow v2 (for prize pool).
- **Owner:** TBD
- **Phase:** F
- **Effort:** 2-3 weeks

### §4.9 Marketing / Public / Demo

#### K — `/tokenomics` public marketing page
- **What:** Public page laying out SHOT economics, escrow split (90/7/3), prestige tier costs, mint cap, LP info.
- **Where:** Greenfield — likely `client/src/screens/TokenomicsScreen.js` + route in App.js.
- **Prereqs:** Design tokens / page layout. Likely mirrors aesthetic of prestige + barracks.
- **Owner:** main-claude
- **Phase:** B
- **Effort:** 2-3h

#### L — Demo GIF / video
- **What:** 30-60 second gameplay clip. Hero asset on solshot.gg, OG image, social share.
- **Where:** External capture / editing. Drop final files at `client/public/assets/promo/`.
- **Prereqs:** None.
- **Owner:** @johnk (capture); main-claude (integration on site)
- **Phase:** A/B
- **Effort:** Half day capture; 1h integration

#### J — Prestige progress bar in Barracks
- **What:** Visualise burn-to-next-tier progress. Currently the prestige loop is invisible in Barracks.
- **Where:** [client/src/screens/BarracksScreen.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/screens/BarracksScreen.js) — add a progress strip
- **Prereqs:** Read user.stats.totalBurned + PRESTIGE_TIERS in [client/src/data/tiers.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/data/tiers.js).
- **Owner:** main-claude
- **Phase:** A
- **Effort:** 2-3h

#### Twitter / Discord / CT outreach
- **What:** Marketing operations, not code. Calendar of tweets, Discord buildout, influencer outreach list.
- **Owner:** @johnk
- **Phase:** A/B
- **Effort:** Ongoing

#### 7D — Launch announcement
- **What:** Public practice launch tweet/thread, Discord push, Solana ecosystem outreach, gameplay trailer release.
- **Owner:** @johnk
- **Phase:** A
- **Effort:** Coordinated launch day

### §4.10 Hardening / Test / Ops

#### 12A — Playwright E2E
- **What:** Two-player flow E2E test in headless browsers.
- **Where:** New `playwright.config.ts` + tests in `tests/e2e/`.
- **Prereqs:** Devnet wallets, test users, lobby + match flow understanding.
- **Owner:** TBD
- **Phase:** C
- **Effort:** 1-2 days setup + per-test work

#### 12A — Server integration tests
- **What:** Existing tests at [server/tests/integration.test.js](https://github.com/JJ-ME55/SolShot/blob/main/server/tests/integration.test.js) — extend coverage. Currently focused on escrow burn flow.
- **Owner:** TBD
- **Phase:** C
- **Effort:** Ongoing

#### 12A — Load testing
- **What:** 50+ concurrent matches. Tools: k6, Artillery, custom Node script.
- **Where:** New `tests/load/` dir.
- **Prereqs:** Pre-prod env or staging.
- **Owner:** TBD
- **Phase:** C/E
- **Effort:** 1-2 days

#### 12B — Cloudflare DDoS protection
- **What:** Put solshot.gg behind Cloudflare (free tier sufficient for v1). Rate-limit rules.
- **Owner:** @johnk (DNS); main-claude (Cloudflare config)
- **Phase:** E
- **Effort:** 1-2h

#### 12B — Cloudflare caching rules
- **What:** Cache static assets (PNG, JS, CSS), bypass API + websocket. Critical for keeping rate limits sane on Render.
- **Owner:** @johnk
- **Phase:** E
- **Effort:** 1h

#### 12B — Remove localhost from production CORS
- **What:** [server/index.js](https://github.com/JJ-ME55/SolShot/blob/main/server/index.js) `CORS_ORIGINS` includes localhost in default. Production `CORS_ORIGINS` env should be set to just `https://solshot.gg, https://www.solshot.gg`.
- **Where:** [server/index.js](https://github.com/JJ-ME55/SolShot/blob/main/server/index.js) line ~38
- **Prereqs:** None (env var change).
- **Owner:** @johnk (Render env var)
- **Phase:** E
- **Effort:** 5min

#### 12B — `www.solshot.gg` redirect
- **What:** Ensure `www.solshot.gg` → `solshot.gg` (canonical). Likely Vercel config.
- **Owner:** @johnk
- **Phase:** E
- **Effort:** 15min

#### Production keypair management
- **What:** Server signing keypair currently single-file on Render disk (`SOLANA_SERVER_KEYPAIR_PATH`). Need backup + DR plan.
- **Where:** [server/services/keys.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/keys.js) — `initKeys()`. Possibly switch to encrypted secrets manager.
- **Prereqs:** D2 (treasury decision).
- **Owner:** @johnk + main-claude
- **Phase:** E
- **Effort:** 1 day

#### Monitoring + alerting
- **What:** Beyond `/health` endpoint. Need: error rate, escrow failure rate, settle latency, RPC error rate. Alert on thresholds.
- **Where:** [server/services/monitoring.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/monitoring.js) — extend. Consider Sentry, Better Stack, or Render's built-in.
- **Prereqs:** None.
- **Owner:** TBD
- **Phase:** E
- **Effort:** 1 day initial setup + ongoing tuning

#### Bug bounty program (optional)
- **What:** Immunefi listing or self-hosted. Scope: escrow program + server endpoints.
- **Owner:** @johnk
- **Phase:** E+
- **Effort:** 1 day setup

### §4.11 Discovery / dApp Store

#### 9B — Solana Seeker / dApp Store
- **What:** Multi-piece — MWA integration, PWA → TWA → APK via Bubblewrap, `assetlinks.json`, Genesis Token detection, .skr domain display, dApp Store submission.
- **Where:**
  - MWA integration: `client/src/wallet/`
  - assetlinks.json: `client/public/.well-known/`
  - APK: external Bubblewrap CLI process
- **Prereqs:**
  - **HARD BLOCKER**: Confirm wagering policy with Solana Mobile (`#dapp-store` on Discord). Some wagering apps have been declined.
- **Owner:** @johnk (policy confirmation, store submission); TBD (technical work)
- **Phase:** F
- **Effort:** 1-2 weeks

### §4.12 Polish / cleanup (low priority)

#### E — Long-handle migration (admin endpoint built — needs running)
- **What:** Run `POST /api/admin/truncate-handles` once. Already deployed.
- **Where:** [server/index.js](https://github.com/JJ-ME55/SolShot/blob/main/server/index.js)
- **Owner:** @johnk
- **Phase:** A
- **Effort:** 1 curl command

#### 3 missing weapon PNGs
- **What:** Skipper, Ground_Hog, Pineapple weapons currently have placeholder rendering or missing icons.
- **Where:** [client/public/assets/images/logos/standard/](https://github.com/JJ-ME55/SolShot/tree/main/client/public/assets/images/logos/standard) — drop new PNGs here
- **Prereqs:** Designer (or @johnk via Gemini per memory) provides files.
- **Owner:** @johnk
- **Phase:** A
- **Effort:** Drop in + verify

#### Dead-code cleanup
- **What:** [client/src/weapons/extraWeapons.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/weapons/extraWeapons.js) is entirely unused. [Standard.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/weapons/packs/Standard/Standard.js) has 10 dead weapon classes. Remove safely.
- **Owner:** TBD
- **Phase:** Low priority, anytime
- **Effort:** 1-2h

---

## §5 · Recommended priorities (main-claude's read)

Given current state, here's the order I'd push for if I were calling shots. Not authoritative — @johnk + fishyboy-claude can override.

### 🥇 Right-now priorities (no blockers, max ROI)

1. **7A + 7B (mouse-aim + touch-drag)** — game feel jump. Practice launch needs this to feel slick.
2. **J (prestige progress bar)** — prestige loop currently invisible. Massive perceived-progression win, ~3h.
3. **L (demo GIF/video)** — single highest-impact marketing asset. Capture takes hours.
4. **K (tokenomics page)** — public marketing collateral. Independent of token actually launching.
5. **Fish's group-chat Phase 1** — adds discovery surface during practice launch.

### 🥈 Pre-mainnet (must do before SHOT live, not before practice launch)

1. **D1: Pick audit firm + engage** (start the calendar clock — 2-4 weeks lead)
2. **Cherry-pick Dynamic to main** — unlocks devnet wagering test
3. **D2: Treasury decision** (multi-sig vs single)
4. **D3: RPC provider decision**
5. **7E: Escrow integration tests + edge cases**
6. **Replay protection refactor** (in-memory Set → durable)

### 🥉 Pre-wagering-go-live

1. Audit findings addressed
2. **Production keypair management + DR**
3. **Monitoring + alerting**
4. **Cloudflare proxy + caching**
5. **Remove localhost CORS**

### Defer / parallel

- 9C hull upgrades (post-mainnet, retention layer)
- 11A tournament (post-wagering)
- 9B Seeker/dApp Store (after wagering live, separate distribution)

---

## §6 · Comms protocol for Fish's claude

If you (fishyboy-claude) are picking up an item from this doc:

1. **Drop a STATUS entry in [`CLAUDE_COMMS.md`](./CLAUDE_COMMS.md)** before starting:
   ```
   ### YYYY-MM-DD — `[fishyboy-claude]` — CLAIMING ITEM XXX
   Picking up §X.Y "Item name". Expected effort: Nh.
   Will commit progress to sandbox/fishyboy.
   ```
2. **Ask in comms log if anything is unclear** — don't guess on cross-cutting items (e.g. anything touching `server/socket-io/main.js` flows that aren't group-chat-specific).
3. **Items marked `main-claude`** — leave them. If urgent, note in comms; main-claude picks up on next cycle.
4. **Items marked `@johnk`** — DO NOT start. Flag in comms log if you spot they're blocking your work.
5. **Mark items DONE in this file** when shipped (with PR/commit link).

If I (main-claude) am picking up:

- I'll bias toward `Owner: main-claude` and `Owner: TBD` items
- Won't touch fishyboy-claude items unless explicitly asked
- Will keep this file in sync as items land on main

---

## §7 · Key files reference (the things both of us touch)

If you're picking up almost any item, these files are likely involved. Worth knowing where they live:

| File | What it does | Size hint |
|---|---|---|
| [server/socket-io/main.js](https://github.com/JJ-ME55/SolShot/blob/main/server/socket-io/main.js) | Master socket handler — match flow, rooms, queues, escrow hooks. **HUGE (~1900+ lines)** — search by function name not line number | ~1900 lines |
| [server/services/users.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/users.js) | Identity helpers — `lookupUserByTelegramId`, `getTopPlayers`, `getPlayerRank`, `linkTelegramIdentity` | ~150 lines |
| [server/services/bot.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/bot.js) | Telegraf bot — all slash commands, inline mode handler, callback queries | ~600 lines |
| [server/services/escrow.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/escrow.js) | Anchor program wrapper — `createMatch`, `depositWager`, `settleMatch`, `cancelMatch` | ~300 lines |
| [server/services/physics.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/physics.js) | Server-authoritative physics — `WEAPON_DATA`, `processShot`, `generateTerrain`, `decayWalls` | ~600 lines |
| [server/services/match.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/match.js) | Match state factory — `createMatchState`, `validateAction`, `transitionState`, `getNextTurn`, `isRoundOver`, `isMatchOver` | ~300 lines |
| [server/services/shot-token.js](https://github.com/JJ-ME55/SolShot/blob/main/server/services/shot-token.js) | SHOT economy — `PRESTIGE_TIERS`, prestige burns, balance tracking | ~500 lines |
| [server/services/challenge/](https://github.com/JJ-ME55/SolShot/tree/main/server/services/challenge) | Card rendering — TrophyShareCard, CareerStatsCard, DuelChallengeCard, victoryDm, props builders | folder |
| [server/models/User.js](https://github.com/JJ-ME55/SolShot/blob/main/server/models/User.js) | Mongoose User schema — stats, cosmetics, matchHistory, telegramUserId, referrals | ~120 lines |
| [server/models/Challenge.js](https://github.com/JJ-ME55/SolShot/blob/main/server/models/Challenge.js) | Challenge document — wager, format, status, expiresAt | ~75 lines |
| [client/src/App.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/App.js) | Top-level routing + screen state machine. Lazy-loads all screens. | ~250 lines |
| [client/src/screens/](https://github.com/JJ-ME55/SolShot/tree/main/client/src/screens) | Each screen is a top-level component. Big ones: MenuScreen, LobbyScreen, BattleScreen | folder |
| [client/src/wallet/WalletContext.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/wallet/WalletContext.js) | Wallet provider — currently Phantom/Solflare. **Will swap to Dynamic** when 8436bf3 ports. | ~400 lines |
| [client/src/scenes/main/index.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/scenes/main/index.js) | Phaser MainScene — game rendering, tank/turret, terrain | ~1000+ lines |
| [client/src/data/weapons.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/data/weapons.js) | 15 base weapons — gold cost, blast radius, type | ~100 lines |
| [client/src/data/tiers.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/data/tiers.js) | 6 prestige tiers + 28 cosmetic items | ~70 lines |
| [client/src/telegram/TelegramContext.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/telegram/TelegramContext.js) | TG SDK wrapper — `useTelegram()` hook, start_param resolution | ~120 lines |
| [client/src/telegram/haptic.js](https://github.com/JJ-ME55/SolShot/blob/main/client/src/telegram/haptic.js) | Haptic feedback helper. Use freely — no-op outside TG. | ~50 lines |
| [client/public/index.html](https://github.com/JJ-ME55/SolShot/blob/main/client/public/index.html) | OG/Twitter meta tags, CSP, root mount | ~35 lines |
| [TODO.md](https://github.com/JJ-ME55/SolShot/blob/main/TODO.md) | Phase-based status doc (root-level, lighter than this one) | ~260 lines |
| [programs/solshot-escrow/src/lib.rs](https://github.com/JJ-ME55/SolShot/blob/main/programs/solshot-escrow/src/lib.rs) | Anchor program — `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. **AUDIT THIS** before mainnet. | ~300 lines |

### Important env vars

- **Server:** `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `SOLANA_SERVER_KEYPAIR_PATH`, `SHOT_TOKEN_MINT`, `MATCH_ESCROW_PROGRAM_ID`, `CORS_ORIGINS`, `ADMIN_KEY`, `SERVER_BASE_URL`, `MINI_APP_URL`
- **Client:** `REACT_APP_SERVER_URL`, `REACT_APP_SHOT_TOKEN_MINT`, `REACT_APP_ESCROW_PROGRAM_ID`. **WILL ADD** `REACT_APP_DYNAMIC_ENV_ID` when Dynamic ports.

### Identity model summary

```
Player → has any of:
  walletAddress  (Solana wallet pubkey, when wallet connected)
  uid            (anonymous browser-session id, always present after registerIdentity)
  telegramUserId (TG user id, when launched via Mini App with valid initData)

User document upserts on these in priority order: wallet > uid > tg-only
linkTelegramIdentity({ telegramUserId, walletAddress, uid, handle, username })
  fires from registerIdentity (always) + authenticate (on wallet connect)
```

### Match state lifecycle

```
LOBBY → BATTLE → ROUND_END → BATTLE → ... → MATCH_END
```

Match state lives at `matchStates[roomId]` in [server/socket-io/main.js](https://github.com/JJ-ME55/SolShot/blob/main/server/socket-io/main.js). Key fields: `players[]`, `alive{}`, `hp{}`, `scores{}`, `weaponDamage{}`, `weaponShotsFired{}`, `weaponHits{}`, `roundWins{}`, `currentTurn`, `turnSequence` (replay nonce), `terrain`, `tankPositions`.

---

## §8 · Open questions for fishyboy-claude

If anything in this doc is unclear or needs adjusting, drop a question in [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) using the existing Q-NNN format. Tag main-claude in the question.

Anything in §3 (Open decisions) is for @johnk to resolve, not fishyboy-claude.

---

_— main-claude, 2026-04-30_
