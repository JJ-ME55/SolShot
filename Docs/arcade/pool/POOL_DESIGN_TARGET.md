# Pool — Design Target

Status: design-in-progress
Date: 2026-05-26 (created), 2026-05-26 (match-flow locked)
Game: TheArcade Game #2 — working name "SolShot Pool"
Reference base: [henshmi/Classic-8-Ball-Pool](https://github.com/henshmi/Classic-8-Ball-Pool) — TypeScript remake (MIT, cloned to `C:\Users\johnk\SolShot-Arcade-Research\Classic-8-Ball-Pool`). Original vanilla JS base at [henshmi/Classic-Pool-Game](https://github.com/henshmi/Classic-Pool-Game) retained at `C:\Users\johnk\SolShot-Arcade-Research\Classic-Pool-Game` for reference only.
Gold standard: Miniclip's 8 Ball Pool (https://www.miniclip.com/games/8-ball-pool)

## 1. Purpose

This doc captures the design target for our 8-Ball Pool entry into TheArcade. It does **not** describe what we will build in V1 — it describes the destination so V1, V2, V3 builds all aim at the same horizon.

Anchored to two constraints:
- [V1 mainnet scope](project_v1_mainnet_scope) — focus stays on SolShot until shipped.
- [V3 arcade economy north star](../../internal/V3_ARCADE_ECONOMY_NORTH_STAR.md) — wagered tables, shop, Tickets, and any cross-game economy are V3 work. Solo / hot-seat / vs-bot are fine before V3.

## 2. What we have today (henshmi base)

- Vanilla JS + HTML5 Canvas, no build step, LAB.js loader
- 2 modes: hot-seat 1v1 and vs-AI with 4 levels (Easy / Medium / Hard / Insane)
- Mouse-only aim, `W`/`S` for power, click to shoot, `Esc` to menu
- Single table, single cue sprite (`spr_stick.png`), basic ball sprites, two background variants
- AI logic in `script/AI/` (Opponent, AIPolicy, AITrainer)
- No touch input, no settings, no progression, no cosmetics, no audio polish
- Runs as static files on any HTTP server — Vercel-ready

**Read:** it's a competent physics + AI base from 2018, no UI/UX layer, no economy, no mobile. Roughly equivalent to free-kicks at its base-fork moment — months of polish needed to land where Miniclip is.

## 3. Miniclip 8BP — the gold standard, system by system

### 3.1 Modes
- **1v1 ranked** — global matchmaking by tier, the spine of the product
- **9-ball** — alternate ruleset on same physics
- **Tournaments** — bracket-style, single-elimination, larger prize pots
- **No Guidelines** — same modes with the trajectory line disabled (skill expression)
- **Lucky Shot / Lucky Hit / Spin-and-Win** — RNG side-modes for coin churn (we will not copy — slot-like, RNG-driven, fails our skill-not-luck filter)
- **Friends / private matches** — invite a friend by ID, no stake
- **Practice / vs AI** — pre-match warm-up

### 3.2 Controls & mechanics
- Click-and-drag cue (web) / tap-aim wheel + drag power bar (mobile)
- **Spin / English** — small cue-ball widget in the corner sets impact point: topspin / backspin / side-spin
- **Aim guideline** — shows cue ball's first contact + first ball's deflection. Length = cue's `Aim` stat
- **Shot clock** — ~30s per shot. Length = cue's `Time` stat. Running out → opponent gets ball-in-hand
- **Ball-in-hand** — fouls / scratches give opponent placement freedom (standard 8-ball rule)
- **Realistic physics** — restitution, friction, cushion bounce, English curves

### 3.3 Cues — the heart of the meta
**Four stats**, each scaled 1-10 (max 13 with Bonus Stats from Power Rank):
- **Force** — shot power
- **Aim** — guideline length / accuracy
- **Spin** — English control
- **Time** — shot-clock seconds

**Rarity tiers** with escalating perks:
- **Standard / Rare** — base stats, no perks
- **Epic** — Bonus XP + Free Recharge
- **Legendary** — Bonus XP + Free Recharge + Entry Fee Payback (up to 6% per cue)

**Acquisition** — 4 cue *pieces* collected via Surprise Boxes (Silver / Gold / Diamond), Victory Boxes (won by streaks), Pool Pass tiers, or direct purchase with Cash (real $).

**Collection Power / Power Rank** — owning more cues raises a meta-progression rank that unlocks Bonus Stat points granted to *every* cue.

### 3.4 Tables — city ladder
- **21 game rooms** named after cities, from `Downtown London Pub` (lowest entry) to `Las Vegas` (60,000 coin prize pot)
- Tier-gated by **player level** — higher rooms locked until ranked up
- **Rental fees** (rake) on premium tables: Seoul 5%, Mumbai 6%, Berlin 7%, Venice 9% — flat below Seoul
- **Subscription-only rooms** — Cancun / Monte Carlo / Cannes / Doha (Lounge tier), Venice / Maui (Elite tier)
- Each city has its **own visual theme** — table cloth color, room background, ambient detail

### 3.5 Cosmetics
- **Table cloths** — colors / patterns, no stat effect
- **Table decals** — branded overlays on the felt (e.g. logos, themes)
- **Pool Pass / Elite Pass** seasonal track — cosmetics + cue pieces + coins
- Ball skins — minimal in Miniclip, mostly fixed art

### 3.6 Currency & economy (this is the part we **don't** copy directly)

**Dual-currency architecture.** Coins (soft, earned by playing, lost by losing, spent on table entries + cue recharge) + Cash (hard, bought with real money or trickled, spent on gacha + cosmetics + Country Cues). Split prevents Miniclip from having to choose between flooding players with currency (devalues IAP) and being stingy (gates play). Foundational antipattern: connects wagering to monetization.

**Implicit rake.** Buy-in is winner-takes-all (2× the entry), but the house extracts via *cue recharge*: cues cost ~10% of cue price per ~50 shots. At Berlin tables (~25M coin buy-in), recharging a Multimillionaire cue costs ~3.5M coins per 50 shots. Legendary cues have no recharge cost — a giant convenience that converts to coin retention. **The recharge is the hidden tax that pressures players into the legendary funnel.**

**Geographic table ladder** (1-on-1 buy-ins, approximate, as of 2024-26):

| Table | Buy-in | Notes |
|-------|--------|-------|
| Downtown London Pub | 50 coins | Starting room (players start with 250 coins) |
| Sydney Marina Bar | 100 | |
| Moscow Winter Club | 500 | First No-Guideline tournament tier |
| Tokyo Warrior Hall | 2,500 | |
| Las Vegas Full House | 10,000 | First mid-tier plateau |
| Jakarta Volcano | 50,000 | |
| Mumbai Mahal | ~15,000,000 | Premium |
| Berlin Platz | ~25,000,000 | Top public table |
| Venice / Maui | Premium-only | Subscription-locked |

The ratio London→Berlin is **500,000×** over the ladder. The top exists primarily as aspiration; most players plateau around Las Vegas. **Each tier ~2-5× the previous = compound coin sink.**

**Tournaments.** 8-player single-elimination brackets. Entry ~6× higher than 1v1 of the same tier; prize ~6× the entry, awarded to the winner only — meaning **7 losers fund 1 winner**. Higher-variance, higher-rake mode whales prefer (concentrates rewards + drops exclusive cue trophies).

**Mini-games — top-grossing IAPs.** Spin & Win, Scratch & Win, Lucky Shot (and the retired Hi-Lo). Use slot-machine UI patterns explicitly to leverage windfall-gains psychology — players treat lucky-drop currency differently from earned currency and are more willing to spend it. Per Sensor Tower data cited in Om Tandon's teardown, chance-based mini-game packs sit at the TOP of 8BP's highest-grossing IAP categories — above box sales, above pass purchases.

**Pool Pass / Elite Pass / Pro Sub.** Pool Pass = $4.99/season (4-week cycle, free + premium tracks, 30 reward levels). Elite Pass = higher tier added ~2024. Pro Subscription = $7.99/week or $19.99/mo. Pro grants daily Coins+Cash, instant Emerald VIP, Pro-exclusive tables (Venice/Monte Carlo), exclusive Vulcan/Jupiter cues. **Critically, missing a daily login forfeits that day's reward** — deliberate retention via FOMO.

**VIP point ladder** (Silver → Gold → Platinum → Diamond → Emerald → Black Diamond). Earned via IAP spend, NOT via play. Higher tiers = better daily rewards + multipliers + exclusive shop deals. **Explicit pay-to-progress mechanic** that decouples progression from skill.

**Legendary Payback — the killer monetization mechanic.** Per Miniclip's "Legendary Cues and Payback" support article: owning a legendary cue refunds **up to 6% of the entry fee on every loss** while using it. Stackable across the collection — a full legendary collection refunds **30%+** of every losing buy-in. At Berlin's 25M buy-in, that's 7.5M coins back per loss. **At top tables you cannot survive without a stacked legendary collection — the rake will bankrupt you over time.** This is the mechanic that converts the cue gacha from cosmetic gambling into economic necessity. It is the single most important antipattern in the entire 8BP ecosystem.

### 3.7 What made 8BP go viral — social + onboarding loops

1. **Facebook Friend Challenge (2011)** — per Miniclip's own blog post "How Our Flash Game Reached 18 Million Monthly Players In Two Years" (Feb 21, 2013): *"Current players wanted to share the experience with their friends, who then joined… we accidentally built a viral game."* This single feature took 8BP from a leveling-off plateau to 18M MAU. **The hook was the social graph, not the pool.**
2. **Cross-platform single ID** — a Miniclip ID worked on Facebook/web, iOS, and Android from day one. Players boasted on Facebook, continued on the bus.
3. **F2P flip on mobile (October 2013)** — launched as paid, slow growth; flipped to free + IAP, explosive growth (per Miniclip CCO Sérgio Varanda's Game World Observer interview, Dec 2021).
4. **Free coin gifts between friends** — daily ritual, costs the sender nothing, drives daily logins. Miniclip set a Guinness Record challenge in 2021 to break 2.5B gifts sent.
5. **2-3 minute match length** — the single most important game-feel call. Short enough to fit a commuter session, long enough to feel real, recoverable from a loss.
6. **Canned chat phrases (intentional, no free-text ever)** — reduces moderation cost, kills harassment vector, creates "chat packs" as a soft revenue stream.

**Our adoption map (V1 only — no economy work, see V3 lock):**
- Facebook Friend Challenge → **TG group challenge link** (already in our spec, arguably *better* than FB because group chat keeps the match visible to the whole group)
- Cross-platform single ID → **Privy** (already in our spec)
- F2P → n/a (always free at V1)
- Free coin gifts → **deferred to V3** (Tickets / Ticket gifting is V3 economy work)
- 2-3 minute match length → V1 vs-bot fits; async PvP intentionally diverges (chess.com daily pattern, 12h per turn) — we trade match-cadence for lower-stakes asynchrony
- Canned chat → **lock for V1** (see §7.3 update)

## 4. Gap analysis — henshmi → gold standard

| System              | Henshmi has | Miniclip has | Build cost |
|---------------------|-------------|--------------|-----------|
| 2D physics          | ✓ Solid     | ✓            | 0 |
| 4 AI difficulty levels | ✓        | ✓            | 0 |
| Hot-seat 1v1        | ✓           | (only via invite) | 0 |
| Online 1v1 matchmaking | ✗        | ✓            | ~2 weeks (socket.io turn handoff, modeled on SolShot) |
| Mobile / touch input | ✗          | ✓            | ~3-5 days (drag-aim + power-slider, stale-pointer guard per BALL_GAMES_PLAYBOOK) |
| Spin / English      | ✗ (no UI)  | ✓            | ~2-4 days (cue-ball widget + impact-point physics) |
| Aim guideline (variable length) | ✗ (always-on full line) | ✓ Stat-driven | ~1 day (clamp ray length) |
| Shot clock          | ✗           | ✓            | ~0.5 days |
| Cue inventory + stats | ✗         | ✓            | ~1 week (model + UI + apply-to-game wiring) |
| Cosmetic skins (cue / cloth) | ✗ | ✓             | ~1-2 weeks per skin pipeline |
| Multiple tables (visual themes) | ✗ (one) | 21 cities | ~2-3 days per city after first |
| Progression / level | ✗           | ✓            | ~1 week |
| Pass / season       | ✗           | ✓            | V3 |
| Currency + shop     | ✗           | ✓            | V3 (must respect Tickets rules) |
| Wagered tables (entry / payout) | ✗ | ✓ Pool Coins | V3 (needs escrow router) |
| SOL wagered tables  | n/a         | n/a          | V3+ |

## 5. Constraints from our world

### 5.1 V3 economy lock — what this means concretely
Per [V3_ARCADE_ECONOMY_NORTH_STAR.md](../../internal/V3_ARCADE_ECONOMY_NORTH_STAR.md), the following systems are **V3-only**, no exceptions:
- Tickets currency (the equivalent of Pool Coins)
- Any shop, gacha, or surprise-box purchase
- Pool Pass / season pass progression
- Wagered tables with entry → payout flow
- Cue *stats* that affect gameplay (because owning a better stat-cue → better win rate → asymmetric advantage at wagered tables → connects the V3 firewalls)

What's safe **before** V3:
- Solo / hot-seat / vs-bot play with all gameplay polish (touch, spin, shot clock, guideline)
- **Cosmetic-only** cue / cloth / ball variants unlocked by playing (not paying)
- Local leaderboards / TG-bot leaderboards by skill (rate-based per V3 rule #2: win rate, accuracy, longest streak — NEVER cumulative volume)

### 5.2 Antipatterns from Miniclip we explicitly reject

These are the specific 8BP mechanics that drove $400M+ lifetime revenue but ALSO drove community sentiment downward. Each is a deliberate "no" for our pool game, not a "maybe later." Designed-in firewall against pay-to-win drift.

| Antipattern | What it is in 8BP | Why we reject it |
|-------------|------------------|------------------|
| **Stat-affecting cues** | Force/Aim/Spin/Time stats 1-10 (max 13 with Bonus Stats) directly affect win rate | Better stats → better wins → asymmetric edge at wagered tables → V3 firewall breaks. Locked V1: cosmetic only (OD-1) |
| **Legendary Payback** | Up to 6% entry-fee refund per legendary cue, stacking to 30%+ on a full collection | The single most pernicious mechanic in 8BP. "Pay to lose less" = whales subsidize their losing matches with IAP. Wagering becomes a treadmill the un-paid can't survive. Permanently out of scope |
| **Stat cap power creep** | Cue Collection Power (2019-2020) raised cue stat caps from 10 → 13 | Players who spent thousands to max their legendaries got their progression cap raised, forcing more spend. **Lock: stat caps (if any are ever introduced) are immutable post-launch** |
| **Coin-balance matchmaking** | Miniclip matches by coin balance within a tier, NOT by skill | Enables smurfing — a level-200 hustler drops to London tables (50-coin buy-in) and farms beginners. New-player experience destroyer. **Lock: skill-based matchmaking (Elo / win-rate), see §7.3 update** |
| **Cue recharge consumables** | Cues need ~10% of cue price in coins per ~50 shots; legendaries skip this | Hidden tax that disadvantages free players, funnels them toward legendary purchase. Cosmetic-only cues eliminate this lever for free |
| **RNG mini-games as top-grossing IAPs** | Spin & Win, Scratch & Win, Lucky Shot — slot-machine UI patterns | Fails our skill-not-luck filter (V3 economy north star §5.2). Pure variance is the foundation; the win-rate is determined by stake, not skill. Also: regulatory exposure |
| **Free-text chat** | n/a (Miniclip never added it — they made the right call) | We adopt their no-free-text rule. Canned phrases only. Reduces moderation cost, kills harassment vector |
| **VIP point ladder via IAP spend** | Silver→Gold→Platinum→Diamond→Emerald→Black Diamond, earned by spending, unlocks bigger dailies and exclusive deals | Pay-to-progress mechanic that decouples progression from skill. If we ever do a tier system, tiers are skill-gated (Bronze→Diamond via wins/win-rate), see OD-7 |
| **Pool Pass FOMO daily login forfeit** | Miss a day, lose that day's pass reward forever | Coercive retention. We DO want daily-login rewards in V3, but they should accumulate not forfeit |
| **Surprise box gacha (cue pieces)** | 4-12 random pieces per cue, ~1 in 1,300 drop rate for a specific legendary piece, ~30,000 boxes for one max-leveled legendary | Pure gambling mechanics. Permanently out of scope per V3 economy rules |

### 5.3 SolShot brand voice
Per [speedway-brand-voice](https://example.com) (skill applies here too), tone is military-billiards / SolShot palette: olive / bone / orange-rust, Black Ops One display, Share Tech Mono. Existing button assets in henshmi are bright-cartoon — full reskin required (consistent with `ARCADE_PLAYBOOK §5` re HUD-token unification not yet retroactively applied to other games).

### 5.4 Repo + deploy strategy
Following the free-kicks precedent (separate repo + own Vercel project, not monorepo branch). Eventual home: `JJ-ME55/solshot-pool` or similar, deployed to `solshot-pool-*.vercel.app`. **Own Vercel project, never share with another game's domain** (per `MEMORY.md` cardinal rule).

## 6. Phased build order

### Phase A — Solo polish (V1, ~3-4 weeks)
Goal: ship a Tier-2 standalone arcade game like basketball / keepies / free-kicks. Solo + bot only, leaderboard by skill, no wagering, no economy.

1. Touch input + power slider (mobile playable in TG WebView)
2. Spin / English widget — add the cue-ball impact UI + physics
3. Shot clock with visual countdown
4. Variable-length aim guideline (toggleable: full / short / off — call it "Pro mode")
5. SolShot brand reskin (cue, balls, felt, UI, fonts, palette)
6. 2-3 visual table variants (city-themed cloths/backgrounds) — purely visual, all playable from V1
7. JWT-gated leaderboard (rate-based: pot-rate per shot, break-and-runs, win streak vs bot at Insane)
8. @TheArcadeGG_Bot integration (`/pool` slash command, "Open in Safari ↗" link)
9. Stale-pointer guard, safeAudio wrappers, CI=false on Vercel, append CORS origin to Render

Exit: 50+ leaderboard submissions, mobile + desktop both stable, no console errors.

### Phase B — Online 1v1 (V2-ish, gated on SolShot V2 multiplayer infra)
1. Server-authoritative turn handoff (model on SolShot `giveTurn`/`receiveTurn`)
2. Deterministic physics (seed shared, both clients simulate same outcome)
3. Matchmaking lobby — TG group challenge link (reuse SolShot's pattern)
4. Disconnect / reconnect window (model on SolShot's 30s window)
5. Best-of-3 racks match format
6. Spectator-friendly stat card for TG share

Exit: 50+ online matches, no desync incidents.

### Phase C — V3 economy integration (gated on V3 launch)
1. Cosmetic cue / cloth / ball skins purchasable with Tickets
2. City-themed tables behind unlock progression (skill or Tickets unlock, not pay-only)
3. Wagered tables via the V3 escrow router (SOL entry, 90/7/3 split per SolShot pattern)
4. Rake % per table tier (mirrors Miniclip's Seoul-Berlin-Venice ladder)
5. Pool-specific stat card for shareable wagered-match results

**Not building in C:** real-cash hard currency, gacha cue pieces, Pool Pass, or stat-affecting cue upgrades. These are the Miniclip patterns we deliberately reject.

## 7. Match flow spec (LOCKED 2026-05-26)

This is the actual gameplay contract. Implementation references this section, not §3 (which is Miniclip's model for reference only).

### 7.1 Modes at V1
- **Web lobby** — random matchmaking + invite-by-link 1v1 (mirrors SolShot's LobbyScreen pattern; pool is lobby AND 1v1, not TG-only)
- **vs Computer** — Easy / Medium / Hard / Insane (the 4 levels henshmi already ships)
- TG-bot path comes later, mirrors `@TheArcadeGG_Bot` `/pool` slash command if/when added

### 7.2 Turn flow (the agile-async + sync-on-shot model)
```
Your turn → DM notification ("🎱 Your turn — 12h window")
  ↓ open match
[Async phase: unlimited think time]
  Drag cue (aim) → corner widget (spin) → slider (power)
  Can close app, return later, state persists server-side
  ↓ tap "READY TO SHOOT"
[Sync phase: 45s timer]
  Final aim micro-adjust + release
  Red flash at 10s remaining
  ↓ release OR timer hits 0
Server simulates → result pushed to both clients
  ↓
If pocketed legally → your turn again
If foul / nothing pocketed → opponent's turn
```

### 7.3 Locked parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Sync turn timer | **45s** | Red flash at 10s, no extensions |
| Sync timer timeout behaviour | **Pure skip** — opponent shoots from current cue position | Friendlier than ball-in-hand; explicitly chosen over the Miniclip default |
| Async window per turn | **12h** | From the "your turn" event to first "ready to shoot" |
| Async window expiry | **Forfeit to opponent** | Match auto-ends, opponent wins by default |
| Match wall-clock cap | **72h total** | Hard ceiling regardless of per-turn windows |
| Call your pocket | **No** at V1 | Sink-it-counts. Faster, friendlier; can layer in later as a mode toggle |
| Sink 8-ball on opening break | **Re-rack** | Cleanest outcome, not win/loss |
| Cue ball follows 8 in on legal 8-pocket | **Auto loss** | Standard rule, kept |
| Break cue ball placement | **Player chooses** anywhere behind the head string (the kitchen) | Standard 8-ball rule |
| Object-ball rack | **Standard triangle, deterministic from match seed** | Server CSPRNG seed matches SolShot pattern |
| Per-shot replay clips in chat | **Off** at V1 | Spectator-clip pipeline deferred; too much friction for too little signal early |
| Anti-cheat | **Server-authoritative everything** | Client sends shot params (angle, power, spin); server simulates; client never decides outcomes. Kills aim-extender cheats by design. Critical: third-party aim-hack subscriptions ($40/mo) infest Miniclip's high-stake tables because their client-authoritative model can't stop them. Ours does, structurally |
| Matchmaking algorithm | **Skill-based** (Elo or rolling win-rate within tier), NOT stake-based | Miniclip matches by coin balance, which enables smurfing (level-200 hustlers drop down and farm beginners at 50-coin tables). Skill-based prevents this from day one |
| Chat | **Canned phrases only, no free-text** ever | Miniclip's choice and the right call. Reduces moderation cost, kills harassment vector, and "chat packs" become a clean cosmetic monetization layer in V3 |

### 7.4 Identity, matchmaking, anti-cheat
- **Random matchmaking** in the web lobby — V1 ships with this (departure from earlier "invite-only first" recommendation)
- **vs Computer** as the safety net for empty-lobby moments
- **Invite-by-link 1v1** for friend duels (SolShot's existing flow)
- **Server-authoritative physics** — same engine philosophy as SolShot. Shot params in → deterministic simulation → result out. Cheats can't draw lines that matter
- Wallet-keyed identity via Privy (same as SolShot)
- Disconnect/reconnect window: model on SolShot's 30s wallet-keyed rejoin

### 7.5 What's deliberately NOT in V1
- Wagered tables, Tickets, any economy (V3-only — see [V3_ARCADE_ECONOMY_NORTH_STAR.md](../../internal/V3_ARCADE_ECONOMY_NORTH_STAR.md))
- Per-shot or per-turn replay clips in TG group (deferred)
- Random global matchmaking across regions / skill tiers — V1 is one pool of players, ranked-tier matchmaking is V2
- Stat-affecting cue upgrades (cosmetic only, per OD-1)
- Spin/English UI if implementation cost is large enough to slip Phase A; in that case ship without spin and add in Phase A.5

## 8. Open decisions (post-2026-05-26)

| ID | Question | Recommendation | Decision-by |
|----|----------|---------------|-------------|
| OD-5 | Brand: keep "8 Ball Pool" generic, or sub-brand it ("SolShot Pool" / something) | Defer — coordinate with arcade brand decision (`Next_Steps_Games.docx §9.4`) | Phase B start |
| OD-6 | Audio: ambient music + shot SFX from scratch or license? | License a small SFX pack, no music in V1 (TG WebView audio is fragile per `BALL_GAMES_PLAYBOOK`) | Pre-Phase A wk2 |
| OD-7 | Prestige progression: skill-gated unlocks at V1 (matches won, win rate) vs deferred entirely to V3 burn-to-upgrade | **Skill-gated cosmetic unlocks at V1** — mirrors SolShot's prestige flow without touching economy | Pre-Phase A wk3 |

Resolved this session: OD-4 (V1 modes — web lobby + random match + vs computer + invite-link); the 12 match-flow parameters in §7.3; **OD-1 (cosmetic-only cues, V3 shop purchase + limited-edition drops, soulbound at V3)**; **OD-3 (switch to TS remake — Referee class + State + types justify the switch on their own; upgrade Webpack 4→5 + TS 3.3→5.x before Phase A wk2)**; **OD-2 (new branch `arcade/pool` in the SolShot monorepo, with pool living in its own `pool/` subfolder isolated from CRA client; Vercel project root set to `pool/` for the new domain)**.

### 8.1 OD-1 unpacked — cue cosmetic model

Decided: cues are **purely cosmetic, never stat-affecting**. Acquisition by epoch:
- **V1** — skill-gated unlocks (prestige tier, matches won, achievements). No purchase.
- **V3** — Tickets shop adds purchasable cues. Limited-edition drops (seasonal, event-tied, milestone) layer on top.
- **V3 mechanic for limited editions** — soulbound (per V3 economy rule #4: real-value shop goods must be soulbound or modelled, no uncontrolled secondary market). Collectible, flexable, not tradeable. Stops a "cue cosmetic" from becoming a wagering proxy or speculative asset.
- **Never** — stat-affecting cues. Miniclip's Force/Aim/Spin/Time/Legendary-payback economy stays explicitly rejected.

Implication for design: §3.7 cue locker in POOL_DESIGN_HANDOFF.md is already correct (skill-gated at V1, Tickets layer V3). Limited-edition mechanics are V3 design work — flag for V3 economy spec, do not design V1 UI for it.

## 9. Next 7 days

Concrete actions:
1. Audit `henshmi/Classic-8-Ball-Pool` (TypeScript remake) — pick base for OD-3 (~1-2h)
2. Inventory henshmi's physics engine: is spin already in the math (just not exposed in UI), or does it need to be added? (~30min code read)
3. Resolve OD-1 (cue stats vs cosmetic) — blocks all later cue work
4. Hand POOL_DESIGN_HANDOFF.md to design when ready for screen mockups
5. Stop the local dev server when not poking at it

## 10. Lessons inherited from Miniclip's 13-year history

Distilled from teardowns of 8BP's design / UX / economy evolution (2010-2026). These are inheritances, not aspirations — each one applies to our build *today*, not at some future V3.

1. **Build the social hook BEFORE the gacha.** Miniclip didn't add Surprise Boxes until 2014, two years after Facebook Friend Challenge. The Challenge feature alone took them from leveling off to 18M MAU. **Our equivalent: TG group challenge link is live from V1 wk1. No economy work until match-flow is proven.**

2. **Match length is the most important game-feel call.** 2-3 minutes is the sweet spot Miniclip locked into. Short enough to fit a session, recoverable from a loss. **For us, async PvP changes this — match wall-clock can be hours, but the active play per turn must still feel snappy. The 45s sync timer + 12h async window encodes this.**

3. **Visual language = "polished bar billiards," not "crypto-cartoon."** Miniclip's deliberate mid-ground (between fully cartoony and fully realistic 3D) is what made the game read instantly as "real pool" to anyone who'd been in a bar. SolShot's olive/bone/orange-rust HUD over green-felt-warm-wood gameplay canvas mirrors this — distinct chrome, authentic gameplay surface.

4. **Resist free-text chat permanently.** Canned phrases + emote packs reduce moderation cost, kill harassment vector, and convert into a clean cosmetic monetization line in V3. Miniclip got this right in 2011 and have never reversed.

5. **Server-authoritative anti-cheat from day one is non-negotiable.** Miniclip's high-stake tables are infested with $40/mo aim-hack subscriptions because their client-authoritative model can't stop them. By the time you realize you have a cheating problem, you've already lost the trust of your top players. **We don't have this option to defer.**

6. **Skill-based matchmaking from day one too.** Miniclip's coin-balance matchmaking enables smurfing — the worst new-player experience killer in the entire industry. Elo/win-rate-based matchmaking is the antidote, and adding it post-launch is much harder than baking it in.

7. **The geographic table ladder is brilliant aspirational design, separate from economy.** Even before V3 wagered tables exist, having visually-themed tables (Downtown London Pub → Berlin Platz) gates the visual rotation by skill milestone. Players climb for the aesthetic, not just the stakes. **V1 ships with 2-3 themed tables, V3 adds the wagered ladder.**

8. **Don't power-creep stat caps post-launch.** Miniclip's 2019-2020 Cue Collection Power update raised stat caps from 10 → 13, instantly devaluing every maxed legendary anyone had grinded for. The community noticed. **If we ever introduce numeric caps, they're locked at launch and never raised.**

9. **Cosmetic legendaries with NO economic perks.** Miniclip's Legendary Payback is the worst pay-to-win mechanic in the genre. Even if we ship limited-edition cues as soulbound NFTs at V3, they grant ZERO in-game stat or coin benefit. Cosmetic only. Forever.

10. **Live-ops has diminishing returns.** After ~5 simultaneous live-ops systems (Pool Pass + Elite Pass + Pro Sub + Trophy Road + Showdowns + Clubs + Rings + Seasons + ...), new systems cannibalize attention from old ones. Community fatigue is now measurable in 8BP sentiment. **Lock the V3 economy at 3 core loops max** — wagered tables, cosmetic shop, prestige progression. Resist the urge to stack more on.

## 11. Sources

- [Miniclip 8 Ball Pool — official site](https://www.miniclip.com/games/8-ball-pool)
- [Miniclip support: How to start playing](https://support.miniclip.com/hc/en-us/articles/360020665798--How-to-start-playing-8-Ball-Pool)
- [Miniclip support: Cue Stats explained](https://support.miniclip.com/hc/en-us/articles/35451942766865-Basic-Controls-Improving-your-skills-8-Ball-Pool)
- [8ballpool.com: Pro Tips — Cue Stats](https://8ballpool.com/en/news/pro-tips-cue-stats)
- [Miniclip support: Legendary Cues & Payback](https://support.miniclip.com/hc/en-us/articles/115015644088-Victory-Cues-8-Ball-Pool)
- [Miniclip support: Cue Collection Power FAQ](https://support.miniclip.com/hc/en-us/articles/360011839377--Cue-Collection-Power-Frequently-Asked-Questions)
- [Wikipool: Game rooms (city tier list)](https://8ballpool.fandom.com/wiki/Game_rooms)
- [Miniclip support: Pro Subscription tables (Venice / Monte Carlo)](https://support.miniclip.com/hc/en-us/articles/360010808234-Pro-Subscription-8-Ball-Pool-Venice-and-Monte-Carlo-tables)
- [Miniclip support: Pool Pass & Elite Pass guide](https://support.miniclip.com/hc/en-us/articles/360036840073--Pool-Pass-Elite-Pass-Your-Ultimate-Guide-8-Ball-Pool)
- [Miniclip blog: Cues With Powers update (2014)](https://blog.miniclip.com/2014/08/26/cues-with-powers-8-ball-pool/)
- [u7buy: Diversity of game modes in 8 Ball Pool](https://www.u7buy.com/blog/diversity-of-game-modes-in-miniclips-8-ball-pool/)
- [Miniclip Fandom: Pool Shop](https://miniclip.fandom.com/wiki/8_Ball_Pool_Multiplayer_Pool_Shop)
- [Miniclip support: Advanced Plays — Spins](https://support.miniclip.com/hc/en-us/articles/35451960569361-Advanced-Plays-Spins-8-Ball-Pool)
- [Miniclip support: Table Decals](https://support.miniclip.com/hc/en-us/articles/360047537633--Table-Decals)
