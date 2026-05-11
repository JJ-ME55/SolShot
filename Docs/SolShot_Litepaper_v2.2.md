# SOLSHOT

## LITEPAPER

### ARTILLERY ON SOLANA, IN YOUR GROUP CHAT

**Version 2.2 // May 2026**

**solshot.gg**

*This document describes the design, mechanics, tokenomics, and security posture of SolShot. It is not financial advice and does not constitute an offer of securities. Players must be 18+ and responsible for compliance with local regulations regarding wagering.*

---

## CONTENTS

01. Overview
02. Distribution: How Players Get In
03. Game Mechanics
04. Weapon System
05. Gold Economy
06. SOL Wagering
07. On-chain Programs
08. SHOT Token
09. Prestige System
10. Security & Audit Posture
11. Roadmap
12. Team & Links

---

## 01 // OVERVIEW

SolShot is a multiplayer artillery game that lives inside Telegram group chats and the open web. Two to ten players take turns firing shots over chat-paced cadence, wagering SOL on the outcome. Every shot posts as a chat message. The smart contract pays the last tank standing.

The game combines the nostalgia of classic artillery (Pocket Tanks, Scorched Earth, Worms) with two new ingredients: Solana settlement at sub-cent fees, and a Telegram-native distribution layer that puts the game where players already hang out. SolShot runs in any modern browser, installable as a PWA on iPhone, with no app store dependency.

### Key Numbers

| Setting | Value |
|---|---|
| Wager tiers (1v1) | 0.1 to 1.0 SOL |
| Wager tiers (group-chat) | host-set, no cap |
| Winner take | 90% of pot |
| Treasury fee | 7% |
| Operations fee | 3% |
| Player count | 1v1 to 10-player group-chat |
| Settlement | Atomic, on-chain, sub-2-second |
| Audits | 3 independent (SOS, BOK, DB) |

### Core Principles

**Server-authoritative physics.** The browser sends inputs only: angle, power, weapon ID. The server runs the trajectory, damage, and terrain math. Both clients receive identical broadcast results. There is nothing for a client to manipulate.

**Trustless settlement.** Wagers are held in on-chain Anchor escrow programs. Neither the server nor any player can redirect funds outside the registered participant set. Settlement happens atomically: a single transaction pays the winner, treasury, and ops in one instruction.

**Skill over spend.** SHOT tokens are earned through gameplay milestones, not purchased. Prestige weapons are genuinely powerful but every one can be countered with smart terrain play and precise aim using base weapons.

---

## 02 // DISTRIBUTION: HOW PLAYERS GET IN

This is what makes SolShot different from every other on-chain game. Most crypto games require: download a wallet, fund it, navigate to a website, sign in, get matched. Each step loses ~30% of users. SolShot starts where players already are.

### Three Entry Points

**Telegram bot DM.** A user DMs `/play` to `@SolShotGG_bot`. The bot replies with a magic link. One tap binds a Privy embedded wallet (email, Google, or Telegram OAuth) and lands the user on the lobby. No seed phrases, no Phantom install.

**Group chat host.** Any player runs `/customgame` in a Telegram group where the bot has been added. The bot walks through wager amount, player count, match duration, turn timer, idle penalty, buybacks, and quiet hours. A self-updating lobby card posts to the chat. Players tap Join. When the lobby fills, the bot creates the on-chain escrow and DMs each player a deposit link.

**Web direct.** Anyone can open solshot.gg in a browser. Sign-in flows through the same Privy provider. Practice mode against the AI opponent (Shot Bot) is available immediately, no wallet required.

### Privy Embedded Wallets

SolShot uses Privy as its embedded wallet layer. Three sign-in methods are equally supported: email, Google OAuth, and Telegram OAuth. Privy creates a Solana wallet for the user automatically and stores key material in their infrastructure. Users can export their private keys at any time to migrate to a self-custody wallet (Phantom, Backpack, Solflare).

The result: a player who has never touched a Solana wallet can be in their first match in under 30 seconds.

### iOS WebView Edge Case

Telegram on iPhone opens links in its in-app browser by default. Privy sign-in does not always render cleanly in that environment. SolShot detects this case and surfaces a one-time banner directing users to tap Share, then Open in Browser (Safari or Chrome). Once the wallet is bound in Safari, gameplay works in either context. This is a documented Privy limitation, not a SolShot bug, and the workaround takes about three seconds.

---

## 03 // GAME MECHANICS

### Match Modes

| Mode | Players | Pace | Wallet | Wager |
|---|---|---|---|---|
| Practice | 1 vs Shot Bot | Real-time | Optional | Free |
| Quick Match | 1v1 | Real-time | Required | 0.1 SOL · BO1 / BO3 |
| Duel | 1v1 | Real-time | Required | 0.25 to 0.5 SOL · BO3 / BO5 |
| High Roller | 1v1 | Real-time | Required | 1.0 SOL · BO3 / BO5 |
| Custom Challenge | 1v1 | Real-time | Required | Host-set, BO1 / BO3 / BO5 |
| Group-chat (`/customgame`) | 2 to 10 | Async | Required | Host-set, 4h / 12h / 24h turn timer |

### Match Flow (1v1, Real-time)

1. Both players sign in via Privy and select a wager tier (or Practice).
2. For wagered matches, both deposit SOL into the escrow PDA.
3. The server generates a random terrain heightmap, picks a biome (5 distinct: jungle, arctic, desert, moon, volcanic), assigns spawn positions, and generates per-round wind.
4. Players enter the weapon shop. Each starts with 1,000 Gold.
5. Combat begins. Players alternate turns, adjusting angle, power, and weapon. Up to 4 movement steps per round.
6. The server calculates trajectories, impact, damage, and terrain deformation for each shot.
7. Each player starts with 250 HP. When one reaches 0, the round ends. Best-of-1, best-of-3, or best-of-5.
8. The winner receives 90% of the pot via on-chain settlement. Treasury 7%, operations 3%.

### Match Flow (Group-chat, Async)

1. Host runs `/customgame` in a Telegram group. The bot collects config: wager, max players, match duration (12h / 3d / 7d), turn timer (4h / 12h / 24h), idle penalty (10/20/30 HP per missed turn), buybacks on/off, quiet hours window.
2. A lobby card posts to the chat. Players tap Join. The bot resolves identities and adds them.
3. When the lobby fills, the bot creates the on-chain escrow PDA and DMs each player a deposit link. Each signs their own deposit transaction.
4. The match goes live. The bot posts a turn ping naming the first player.
5. Players take turns whenever they have time. Tapping the "Take Your Shot" link opens the Mini App at the live match state. Aim, fire, close the tab. The shot is committed to the server.
6. The bot posts a one-line shot summary in the chat (e.g. *"@jj_me fires Heatseeker: -50 HP PerryPeralta"*) and DMs the next player.
7. Quiet hours pause the timer overnight. Idle penalty fires if a player misses a turn. Three consecutive misses auto-forfeits the player.
8. Last tank standing wins. The contract distributes the pot. Bot posts the result with a Solscan link.

### Health and Damage

Each player begins every round with 250 HP. Damage is calculated server-side based on blast radius, distance from impact, and weapon-specific damage factors. Direct hits deal maximum damage; splash damage falls off linearly with distance. Self-damage is possible. When a player reaches 0 HP, the round ends immediately.

The 250 HP pool is calibrated so the free Single Shot requires 5 direct hits to kill. Matches typically last 4-6 minutes for 1v1, hours-to-days for group-chat.

### Terrain and Wind

Terrain is a 1D heightmap array generated server-side. Both clients receive identical data. Explosions deform terrain by modifying the heightmap, creating craters, collapsing hills, and exposing buried tanks. Weapons like Dirt Ball and Magic Wall add terrain; Pile Driver and Ground Hog destroy it.

Wind is generated per round in 1v1 mode and per match in group-chat mode. Horizontal acceleration ranges from -60 to +60 px/s². The wind indicator is visible in the HUD. A shot that's perfect in calm air will sail wide in a crosswind.

### Buybacks (Optional, Group-chat Only)

Hosts can enable buybacks at match creation. Eliminated players can pay an escalating cost (2× / 3× / 5× / 8× / 13× the wager) to re-enter at 50% HP. Forfeits survival-pool eligibility. Buyback fees go into the pot, increasing the prize.

---

## 04 // WEAPON SYSTEM

SolShot ships with 15 base weapons across 6 tiers, plus 5 prestige-exclusive weapons unlocked by burning SHOT tokens. Each weapon has distinct physics behaviour. There are no reskins or stat variations of the same weapon.

### Launch Roster (15 Weapons)

| Weapon | Tier | Cost | Behaviour | Damage |
|---|---|---|---|---|
| Single Shot | Free | 0G | Standard projectile, small blast. Infinite ammo. | 60 |
| Dirt Ball | Standard | 150G | Raises terrain on impact. Defensive utility. | 0 |
| Magic Wall | Standard | 200G | Erects terrain wall. Blocks incoming fire. | 0 |
| Skipper | Tactical | 350G | Bounces across terrain surface. Trick shots. | 40 |
| 3 Shot | Tactical | 400G | Three projectiles fan out mid-air. | 20 each |
| Spider | Tactical | 400G | Splits into crawling sub-munitions on proximity. | Variable |
| Heatseeker | Tactical | 500G | Homes toward opponent tank. Guided forgiveness. | 40 |
| Napalm | Rare | 600G | Area burn, melts terrain. Damage over time. | Variable |
| Pile Driver | Rare | 600G | Drills down through terrain. 6 sequential blasts. | 120 |
| Sniper Rifle | Rare | 700G | Pinpoint 1px blast. Maximum precision damage. | 100 |
| Big Shot | Rare | 700G | Huge blast radius. Maximum aim forgiveness. | 30 |
| Ground Hog | Epic | 900G | Tunnels through terrain, emerges and detonates. | 50 |
| Jackhammer | Epic | 1,000G | Drills vertically into terrain. 5 chain blasts. | 50 |
| Hail Storm | Epic | 1,200G | Rains projectiles over wide area. Damage over time. | Variable |
| Crazy Ivan | Legendary | 2,500G | 15 random explosions. Total chaos. | 300 |

### Prestige Weapons (5 Exclusive)

| Weapon | Prestige | Burn Cost | Behaviour | Damage |
|---|---|---|---|---|
| Homing Missile | Bronze | 200 SHOT | Guided missile. Reliable homing. | 60 |
| Cruiser | Silver | 500 SHOT | Rolling terrain bomb. Follows ground to target. | 80 |
| Tommy Gun | Gold | 1,200 SHOT | Rapid-fire burst of 12 small shots. | 240 |
| Chain Reaction | Platinum | 2,500 SHOT | 15 sequential blasts carpet-bombing along terrain. | 300 |
| Pineapple | Diamond | 4,000 SHOT | Splits into 20 explosive fragments on proximity. | 640 |

Diamond prestige players have access to 20 weapons versus 15 for everyone else. Each prestige tier unlocks a weapon that is genuinely more powerful than the last, rewarding hundreds of hours of dedication. But every prestige weapon can be countered. A new player with perfect aim beats a Diamond player who can't shoot straight.

### Design Philosophy

The weapon roster is built around three strategic pillars.

**Precision vs forgiveness.** Single Shot rewards perfect aim. Big Shot forgives bad aim with a huge blast at lower damage. Sniper Rifle is the ultimate gamble: 100 damage on a direct hit, but miss by 2 pixels and you deal zero.

**Attack vs terrain.** Dirt Ball and Magic Wall build cover. Pile Driver and Ground Hog destroy it. Napalm melts it. The battlefield changes with every shot.

**Reliable vs chaotic.** Heatseeker homes for guaranteed contact. Crazy Ivan scatters 15 random explosions and hopes for the best. Reliable weapons cost less gold. Chaotic weapons are expensive but can end rounds instantly.

---

## 05 // GOLD ECONOMY

Gold is the in-match currency used to purchase weapons during the shop phase. It exists only within a match and never persists between matches. Gold cannot be traded, sold, or converted to any other currency.

### Earning Gold

| Source | Amount | Notes |
|---|---|---|
| Starting balance | 1,000G | Every player, every match |
| Damage dealt | +15G per HP | Incentivises aggression |
| Kill bonus | +200G | Finishing-blow reward |
| Round win | +300G | Round winner |

### Budget Strategy

With 1,000G to start, round 1 forces meaningful choices. Sample loadouts:

- **Aggressive:** Sniper Rifle (700G) + Dirt Ball (150G) = 850G. High damage potential with one defensive option.
- **Balanced:** Heatseeker (500G) + 3 Shot (400G) = 900G. Guided weapon plus spread coverage.
- **Tactical:** Skipper (350G) + Spider (400G) + Magic Wall (200G) = 950G. Terrain-aware arsenal plus defence.

Crazy Ivan (2,500G) is impossible in round 1. Players earn into it through combat. In a BO3 match, a player who wins round 1 decisively could afford Crazy Ivan by round 2, creating natural power progression.

---

## 06 // SOL WAGERING

### 1v1 Wager Tiers

| Tier | Per-Player | Pot | Winner (90%) | Treasury (7%) | Ops (3%) |
|---|---|---|---|---|---|
| Quick Match | 0.1 SOL | 0.2 SOL | 0.18 SOL | 0.014 SOL | 0.006 SOL |
| Duel (low) | 0.25 SOL | 0.5 SOL | 0.45 SOL | 0.035 SOL | 0.015 SOL |
| Duel (high) | 0.5 SOL | 1.0 SOL | 0.90 SOL | 0.07 SOL | 0.03 SOL |
| High Roller | 1.0 SOL | 2.0 SOL | 1.80 SOL | 0.14 SOL | 0.06 SOL |
| Custom Challenge | Host-set | Variable | 90% | 7% | 3% |

### Group-chat Wager Scaling

Group-chat matches accept any host-configured wager. The pot scales with the number of depositors at start time.

| Players | Wager Each | Pot | Winner | Treasury | Ops |
|---|---|---|---|---|---|
| 3 | 0.1 SOL | 0.3 SOL | 0.27 SOL | 0.021 SOL | 0.009 SOL |
| 4 | 0.25 SOL | 1.0 SOL | 0.90 SOL | 0.07 SOL | 0.03 SOL |
| 5 | 0.5 SOL | 2.5 SOL | 2.25 SOL | 0.175 SOL | 0.075 SOL |
| 8 | 1.0 SOL | 8.0 SOL | 7.20 SOL | 0.56 SOL | 0.24 SOL |
| 10 | 1.0 SOL | 10.0 SOL | 9.00 SOL | 0.70 SOL | 0.30 SOL |

The 90/7/3 split is fixed in the contract. All distribution math uses integer lamport arithmetic to prevent rounding loss. 159 property tests across 41 invariants (BOK Audit #2) verify that `winner + treasury + ops == pot` holds for every valid input combination.

### Settlement Recovery

If the server goes dark mid-match, three independent recovery paths exist.

1. **Server recovery.** When the server restarts, it reads MongoDB for any in-progress matches and either resumes (group-chat) or settles based on last known state (1v1).
2. **Player cancel.** Either player can call `cancel_match` directly on-chain after the deposit timeout (1 hour for 1v1, host-configured for group-chat).
3. **Permissionless reclaim.** After a longer grace window (2 hours for 1v1, 24 hours after match-end timestamp for group-chat), any wallet on Solana can trigger a refund. The caller receives the PDA rent as economic incentive. This is the absolute backstop.

At no point can wagered SOL be permanently locked.

---

## 07 // ON-CHAIN PROGRAMS

SolShot deploys two Anchor programs to handle the wagering surface, each tuned for a different match cadence.

### Escrow v1 (`solshot-escrow`)

For 1v1 real-time matches: Quick Match, Duel, High Roller, Custom Challenge.

- **Devnet program ID:** `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`
- **Account model:** PDA per match, seeds `[b"match", match_id.as_bytes()]`
- **Players:** 2 to 4 (current usage is 1v1)
- **Deposit deadline:** 600 seconds after match creation
- **Reclaim grace:** 1200 seconds after deposit deadline

### Escrow v2 (`solshot-escrow-v2`)

For N-player async group-chat matches.

- **Devnet program ID:** `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`
- **GlobalConfig PDA:** `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4`
- **Players:** 2 to 10
- **Configurable:** deposit window, match duration, fee BPS (capped 10% combined)
- **Per-match snapshot:** fee BPS frozen at create time, immune to mid-match config rotation

### Instructions (Both Programs)

| Instruction | Caller | Purpose |
|---|---|---|
| `create_match` | Server (authority) | Initialise the escrow PDA with player roster, wager, and timing |
| `deposit_wager` | Each player (signed from own wallet) | Transfer wager into the escrow PDA |
| `settle_match` | Server (authority) | Atomic 90/7/3 distribution to winner, treasury, ops |
| `cancel_match` | Server (authority) | Refund deposited players if match cannot complete |
| `permissionless_reclaim` | Anyone | Refund all deposits after grace window. The 24-hour backstop. |
| `start_with_depositors` (v2) | Server (authority) | Compact the deposits mask so the match can start with partial deposits if some players never paid |

### Settled Match Examples (Devnet)

These are real settlements you can verify on Solana Explorer:

- **2026-05-04**, 1v1 Quick Match, first wagered match end-to-end on devnet: TX `4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf`
- **2026-05-06**, 3-player group-chat, first fully organic N-player auto-settle: TX `4ja8VKpZJnQek8xakFWqByyRJ6qG9U7iWeFwqiiZVKGhemVfnWLDLiJYuMdjoN9tKptCxE1Dkzx5d9ZE6D3NqtL1`
- **2026-05-08**, 3-player wagered (1 SOL each, 3 SOL pot): TX `4wgAXhapUmyv3afnchSNs2ZXCPWYZH77YqhScQmATPZNQHHmggttzbrNhvk5npwEJmG16wYeyC6js4vgY35YkL6G`. Winner +2.7 SOL, Treasury +0.21 SOL, Ops +0.09 SOL.

---

## 08 // SHOT TOKEN

SHOT is the utility token of the SolShot ecosystem. It is earned exclusively through gameplay milestones, burned permanently for prestige tier progression, and traded on the secondary market. The mint authority has been burned on-chain. Total supply is fixed at 10M and can only decrease as players burn for prestige.

### Specifications

| Parameter | Value |
|---|---|
| Token Name | SHOT |
| Standard | SPL Token (Solana) |
| Devnet Mint | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` |
| Total Supply | 10,000,000 SHOT |
| Decimals | 9 |
| Mintable | No (mint authority burned) |

### Distribution

| Allocation | Amount | % | Custody | Purpose |
|---|---|---|---|---|
| Reward Pool | 7,000,000 | 70% | On-chain PDA | Milestone-gated emissions to players |
| Treasury | 1,500,000 | 15% | Squads multisig | Ecosystem development, partnerships, liquidity |
| Team | 1,000,000 | 10% | Team wallet, 6-week linear vest | Development, infrastructure, operations |
| Initial Liquidity | 500,000 | 5% | Meteora DAMM v2 pool | Secondary market trading |

70% to rewards is the largest allocation by design. SolShot's thesis is that the people who play the game should own the majority of supply. The heavy reward weighting makes "play to earn" credible.

### Emission Mechanics

SHOT emits from the 7M reward pool based on one-time gameplay milestones. There is no passive accrual, staking yield, or daily login bonus. The maximum monthly emission is capped at 5% of the remaining pool, creating an asymptotic curve where early players receive higher rates than late entrants.

For full emission tables, milestone schedule, anti-farming protections, deflationary scarcity analysis, and DEX/liquidity details, see [`Docs/SHOT_TOKEN_MODEL.md`](SHOT_TOKEN_MODEL.md).

### Sell Discipline (Team Allocation)

The 1M team allocation vests linearly over **6 weeks** from launch, at roughly 166,667 SHOT per week. This is a public commitment rather than a smart-contract constraint, and that distinction is deliberate. Contract-enforced vesting can create a false sense of security; anyone with upgrade-authority access could circumvent it, and SolShot's authority key is held by the engineering lead (the structural single-key risk is named openly in Section 10). A contract-vesting clause that the authority can bypass would be theatre. SolShot opts for the honest framing instead: a 6-week schedule, governed by public commitment and on-chain observability.

Layered on top, the team commits to a maximum sell rate of 10% of the unlocked balance per week, sold into volume rather than against thin liquidity. Both the 6-week vest and the 10% weekly sell cap are public commitments, not on-chain guarantees. Anyone can monitor the team wallet on-chain and verify compliance. Deviation would be immediately visible.

---

## 09 // PRESTIGE SYSTEM

| Tier | Burn Cost | Cumulative | Exclusive Weapon | Max Damage |
|---|---|---|---|---|
| Bronze | 200 SHOT | 200 SHOT | Homing Missile | 60 |
| Silver | 500 SHOT | 700 SHOT | Cruiser | 80 |
| Gold | 1,200 SHOT | 1,900 SHOT | Tommy Gun | 240 |
| Platinum | 2,500 SHOT | 4,400 SHOT | Chain Reaction | 300 |
| Diamond | 4,000 SHOT | 8,400 SHOT | Pineapple | 640 |

Reaching Diamond requires earning and burning 8,400 SHOT, representing hundreds of hours of gameplay. High-prestige players have genuinely put in the hours.

### Burn Verification

The server performs five checks before crediting a prestige burn:

1. **Transaction exists** and has reached `confirmed` commitment on Solana.
2. **Replay protection** - the transaction signature has not been used for a previous prestige burn.
3. **Correct mint** - the burn instruction targets the SHOT token mint specifically.
4. **Correct signer** - the burn was authorised by the player's wallet.
5. **Correct amount** - the burned amount matches or exceeds the required prestige tier cost.

A TOCTOU guard claims the transaction signature immediately before async verification begins, preventing concurrent verification of the same burn. Verified signatures persist to MongoDB so replay protection survives server restarts.

---

## 10 // SECURITY & AUDIT POSTURE

Most hackathon submissions ship with zero adversarial security review. SolShot ran three independent audit passes before public flip using the Solana Vibes Kit (SVK), a set of structured audit skills published openly on GitHub by Solana builder MetalegBob. The methodology has been validated against professional human audits on Solana protocols in production: human auditors run on the same codebases subsequently confirmed the findings the SVK passes had already surfaced. The audit reports linked below are the direct outputs of that methodology, with full transparency on both what was fixed and what's deferred.

All findings are published openly with file-and-line evidence and a fix-or-defer disposition for every item.

### The Three Audits

| Audit | Tool | Scope | Findings |
|---|---|---|---|
| **SOS** (Stronghold of Security) | Adversarial security audit | On-chain Anchor programs (1,982 LOC) | 50 findings: 4 critical, 14 high, 4 medium, 6 low |
| **BOK** (Book of Knowledge) | Math invariant verification | Both programs, financial arithmetic | 41 invariants, 159 property tests, zero violations |
| **DB** (Dinh's Bulwark) | Adversarial off-chain audit | Server, API, bot, client, infrastructure (~84k LOC) | 113 findings across 8 categories |

### What Was Fixed

Two fix bundles shipped to `main` before submission.

**SOS fix bundle.** 9 of 50 findings applied. Settle-authority hardening (`has_one = authority` on CreateMatch.config), fee math precision, lamport overflow guards, CSPRNG for room IDs and terrain seeds and spawn positions, helmet + express-rate-limit, create-room throttle. Closes the partial-refund theft path that could have stolen up to 900 SOL per maximum group-chat match.

**DB fix bundle.** 16 of 113 findings applied. Privy/TG identity bridge verification (closes the H120 cross-skill chain), `requirePrivyAuth` hard-503 in production when secrets missing, `refundWager` proper failure propagation, auth gates on six previously-unguarded socket events (`shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog`, `getGroupMatch`, `/api/challenge/:code/cancel`), turn-sequence nonce required, `DebugAuthOverlay` removed from production builds, Mongoose `runValidators` global, CSP origins migrated from Dynamic to Privy, `express-rate-limit` IPv6 bypass patched, timing-safe admin key compare.

**BOK verification suite.** 159 property tests across 41 invariants verify that all SOS fix-bundle constants are non-regressive. 90/7/3 split holds, pot equals wager × deposits for every valid combination, lamport rounding stays under 2 lamports across the full BPS surface. The post-fix code passes every math invariant.

### What Was Deferred to Mainnet

Higher-complexity findings are documented openly in the SOS remediation log and the DB remediation log. Honest disclosure of what's still open.

**Bundle A - Pre-mainnet must-fix (small, deferred for sequencing):**

- H014 - H023 fix-bundle ↔ server desync. The on-chain refund path requires `count_ones(deposits_mask)` to match `remaining_accounts.len()`. Server builds the array from off-chain state. Fix requires fetching on-chain mask before refund builder. Cross-audit boundary defect.
- H016 - Concurrent `confirmDeposit` doc overwrite. Two simultaneous deposit confirmations both follow `findOne → mutate → save()`. Refactor to atomic `findOneAndUpdate` with `$elemMatch` guard.
- H015 - Group-chat double-settle race. Three async paths (`handleShot`, `handleForfeit`, `handleIdleTimeout`) each call `checkAndSettle()` on stale in-memory doc. Convert settle to atomic `findOneAndUpdate({state:'active'},{state:'settled'})`.
- H009 / H010 - Wallet rotation gap. Privy can re-provision; server retains stale binding. Fix is semantically delicate. Add `updateWalletForTgUser()` with versioned audit trail.

**Bundle B - Architectural pre-mainnet (design changes):**

- H001 (SOS) - One-step authority transfer. No `pending_authority` propose/accept. Acknowledged hot-wallet risk. Fix: add `propose_authority` + `accept_authority` requiring co-sign.
- H044 (SOS) - Single hot wallet for upgrade authority and application authority. Migrate upgrade authority to Squads M-of-N multisig before mainnet.
- H003 / H004 (DB) - JWT generated but never verified server-side; auth signature 5-min replay window with no consumed-signature store. Decide: implement real JWT verification or remove `generateToken` entirely.

**Bundle C - Defensive cleanup (~25 items):**

npm CVEs (`socket.io-parser` DoS, `path-to-regexp` ReDoS, `handlebars` JS injection); Vercel client zero security headers; `unsafe-inline` in client CSP; magic-link token in URL query param; single unmonitored RPC endpoint with no retry on 429; `Math.random` in challenge shortcodes; `nodemon` in production deps. Apply per-finding when convenient.

**Bundle D - Cross-audit mainnet hardening:**

- H120 - Cross-skill compound (DB Privy fail-open + SOS one-step authority rotation). DB H002 closed at the entry point; broader authority-hardening design tracked here.
- H011 / H082 - Escrow keypair zeroisation reverted. Depends on web3.js change OR architectural rotation policy.
- H084 - `@privy-io/server-auth` deprecated. Migrate to `@privy-io/node`.

### Verdict

**Hackathon submission on devnet:** safe. No real funds are at risk on devnet. The most severe open finding (one-step authority rotation) requires compromise of the application authority hot wallet to exploit. All findings that enable open-access attacks (no key compromise required) have been closed.

**Mainnet deployment with real funds:** not yet ready. Bundles A + B + D must land and be re-verified before mainnet. That work is documented and planned.

### Where to Read the Full Reports

- `.audit/FINAL_REPORT.md` - SOS full report, all 50 findings with CVSS scores and attack walkthroughs
- `.bulwark/FINAL_REPORT.md` - DB full report, all 113 findings with file:line evidence
- `.bok/reports/2026-05-07-report.md` - BOK math verification, 41 invariants, 159 tests, per-function findings
- the SOS remediation log - SOS fix-vs-defer disposition log
- the DB remediation log - DB fix-vs-defer disposition log
- `Docs/audit-summary.md` - single-page overview, all three audits combined

---

## 11 // ROADMAP

### Shipped (As of May 2026, Devnet)

- ✅ Two Anchor programs deployed and exercised
- ✅ First wagered 1v1 settled on-chain (May 4)
- ✅ First N-player group-chat match settled organically on-chain (May 6)
- ✅ SHOT token mint live, mint authority burned
- ✅ Prestige burn flow with on-chain verification
- ✅ Telegram bot with 18 commands (`/play`, `/customgame`, `/leaderboard`, `/refer`, `/mygames`, `/stats`, `/help`, etc.)
- ✅ Privy embedded wallet integration (email, Google, Telegram OAuth)
- ✅ Custom Challenge with 5-char shortcode and Satori-rendered Duel Card
- ✅ Career Card and Trophy DM, both server-rendered Satori at 1080×608 / 1080×1080
- ✅ Two-sided referral programme (25 SHOT inviter + 25 SHOT invitee)
- ✅ 28 cosmetic items across 5 categories
- ✅ Three independent security audits, two fix bundles shipped
- ✅ Open-source under MIT license

### Pre-Mainnet (Q2-Q3 2026)

- 🟡 Audit Bundle A (must-fix small items)
- 🟡 Audit Bundle B (architectural decisions, Squads multisig migration)
- 🟡 Audit Bundle D (cross-audit hardening, Privy SDK migration)
- 🟡 Mainnet deploy + end-to-end smoke test
- 🟡 Bot rate-limiting and abuse handling for public Telegram exposure

### Coming Soon (Designed, Not Yet Shipped)

- **Consumables.** Burn small SHOT amounts for in-match boosts (Tactical Scope, Smoke Screen, Reinforced Armour, Overcharge). Lasts 5 matches.
- **Tournaments.** Bracketed multi-round events with guaranteed prize pools and SHOT bonuses.
- **SHOT buybacks.** Treasury-funded protocol buyback that uses a slice of fees to repurchase and burn SHOT from open markets.
- **Multi-day marathon match modes.** Group-chat turn timers beyond 24 hours. Capped at 24h today (post-SOS H039 hardening). Longer modes planned post-mainnet once stuck-match recovery is fully load-tested.
- **Expanded leaderboard.** Per-mode boards, weekly resets, season-based prestige rewards, on-chain match-history indexer.

### The Bigger Vision

SolShot's roadmap is to become the social-game layer for crypto group chats. The artillery game is the wedge. Multiple game types on the same async-turn-based backend is the prize.

**Next three games designed for the same primitive:**

1. **Darts** - nearest to bullseye wins, same wager + settle infrastructure
2. **Golf** - fewest shots wins, multi-player async cadence is a natural fit
3. **Card Battles** - deck-building with SHOT-gated prestige cards

**Distribution surfaces beyond Telegram:**

1. Telegram (live)
2. Solana Mobile (Seekr dApp Store, planned post-Frontier)
3. iMessage (planned, native iOS extension)
4. WhatsApp (Cloud API integration, designed)

All share the same SHOT economy, the same Privy wallet stack, the same async-turn-based on-chain primitive. Open SDK so other developers can ship group-chat-native wagered games on the same infrastructure.

---

## 12 // TEAM & LINKS

### Links

- **Web:** [solshot.gg](https://solshot.gg)
- **Telegram bot:** [@SolShotGG_bot](https://t.me/SolShotGG_bot)
- **GitHub:** [github.com/JJ-ME55/SolShot](https://github.com/JJ-ME55/SolShot)
- **Twitter:** @SolShotGG
- **Discord:** discord.gg/solshot

### Team

**Jamie Abrahams** - Founder. Product, architecture, security audits, on-chain implementation.

**Fish** - Co-founder. Product narrative, video, community, growth.

### Treasury Usage

The 7% treasury fee from every wagered match and the 15% SHOT treasury allocation are governed by Squads multisig and used for:

- **Development.** Server infrastructure, security audits, feature development.
- **Liquidity.** Deepening the SHOT/SOL Meteora pool to support healthy token trading.
- **Community.** Tournament prize pools, seasonal events, community rewards, referral fund.
- **Operations.** The 3% operations fee covers server hosting, Solana transaction fees, and day-to-day running costs separately from the treasury.

Treasury spending will be published on-chain as the governance framework matures.

---

## DISCLAIMER

*This litepaper is provided for informational purposes only. It does not constitute financial advice, an offer of securities, or a solicitation of investment. SHOT tokens are utility tokens with no expectation of profit. The value of SHOT may fluctuate and may go to zero. SolShot involves wagering real cryptocurrency. Players should never wager more than they can afford to lose. Players must be 18 or older to participate in wagered matches. SolShot may not be available in all jurisdictions. The team reserves the right to modify game mechanics, tokenomics, and roadmap as development progresses.*

---

**SOLSHOT // AIM. FIRE. EARN.**
