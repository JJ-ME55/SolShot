# SolShot

### Artillery duels in your Telegram group chat. Wager SOL. Settle on-chain.

**Last updated:** May 7, 2026. Devnet.  
**Play:** [solshot.gg](https://solshot.gg) | **Telegram bot:** [@SolShotGG_bot](https://t.me/SolShotGG_bot)

---

## What it is

SolShot is a skill-based multiplayer artillery game (Pocket Tanks style) where players wager real SOL inside Telegram group chats. Every wager is held in an Anchor escrow program on Solana. No custodian, no off-chain accounting. The last tank standing gets 90% of the pot, settled atomically on-chain.

---

## Why it matters

**The wedge.** Telegram group chats are where crypto-native players already hang out. SolShot brings a real game into the chat window: async turns, self-updating lobby cards, bot-posted shot recaps, in-chat trophy DMs after wins. The game happens in the group, not away from it.

**The vision.** SolShot is the first game on a bigger platform: a social-game layer for crypto group chats. Multiple game types (golf, darts, billiards, card battles) on the same async-turn-based backend, with the same SHOT economy across the same chat surfaces. Telegram first, then Seekr Mobile, iMessage and WhatsApp.

**The moat.** Privy embedded wallets (email, Google or Telegram OAuth, no seed phrases) make onboarding straightforward for players who have never touched a Solana wallet.

---

## How a match works

1. **Lobby.** Host runs `/customgame` in any Telegram group. The bot walks through wager, player count, duration, turn timer, idle penalty, buybacks and quiet hours. A self-updating lobby card posts to chat.
2. **Deposit.** When the lobby fills, the server creates the escrow PDA. Each player signs their own `deposit_wager` transaction. No custodial step. The pot accumulates inside the PDA on-chain.
3. **Play.** The server advances turns and posts "Take your shot" pings in chat. Players tap the button, aim inside solshot.gg, fire. The server runs the physics, broadcasts shot results and posts the recap back to chat.
4. **Settle.** When one tank remains, the server calls `settle_match`. The contract distributes the pot 90/7/3 (winner, treasury, ops). The settlement TX and Solscan link post back to chat. The winner gets a Trophy DM with a shareable card.

Server runs all physics. Players only send angle, power and weapon. Nothing the client does can affect the outcome. There is nothing to hack on the client.

---

## What's live (devnet)

### On-chain programs

| Component | Address |
|---|---|
| Escrow v1 (1v1 real-time) | [`4kzrDpV9...`](https://solscan.io/account/4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1?cluster=devnet) |
| Escrow v2 (N-player async) | [`BVKXLUnu...`](https://solscan.io/account/BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N?cluster=devnet) |
| GlobalConfig PDA | [`92wnuoau...`](https://solscan.io/account/92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4?cluster=devnet) |
| SHOT token mint | [`4NnYBycL...`](https://solscan.io/token/4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd?cluster=devnet) |

### Sample settled matches

- **2026-05-04, 1v1 Quick Match.** First wagered match end-to-end on devnet. Winner +0.18 SOL, Treasury +0.014, Ops +0.006. TX: [`4WSsDsKV...`](https://solscan.io/tx/4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf?cluster=devnet)
- **2026-05-06, 3-player group-chat.** First fully organic N-player auto-settle. No manual intervention. TX: [`4ja8VKpZ...`](https://solscan.io/tx/4ja8VKpZJnQek8xakFWqByyRJ6qG9U7iWeFwqiiZVKGhemVfnWLDLiJYuMdjoN9tKptCxE1Dkzx5d9ZE6D3NqtL1?cluster=devnet)

### SHOT token

10M fixed supply. Mint authority burned at launch, so supply can only decrease. 1.5M in treasury, 8.5M in dev wallet (rewards, team, liquidity). Players burn SHOT to unlock prestige weapon tiers. On-chain burn verification on every upgrade.

### Access points

| Surface | Link |
|---|---|
| Web PWA | [solshot.gg](https://solshot.gg) |
| Telegram bot | [@SolShotGG_bot](https://t.me/SolShotGG_bot). `/play` to bind wallet, `/customgame` in any group |
| iPhone | Safari, Share, Add to Home Screen (fullscreen PWA) |

### Game modes

| Mode | Wallet | Real-time? | Wager |
|---|---|---|---|
| **Practice vs Shot Bot** | none | yes, instant | free, no opponent matchmaking |
| **Quick Match** | required | yes | 0.1 SOL · BO1 / BO3 |
| **Duel** | required | yes | 0.25–0.5 SOL · BO3 / BO5 |
| **High Roller** | required | yes | 1.0 SOL · BO3 / BO5 |
| **Custom Challenge** | required | yes | host-set · BO1 / BO3 / BO5, deep-link to a friend |
| **Group-chat (`/customgame`)** | required | no, async | host-set, 4h / 12h / 24h turn timers |

**Shot Bot** is SolShot's built-in AI opponent. Server-side probabilistic aiming with calibration. It picks weapons situationally and gets sharper as the match progresses. Anyone can drop in and play with zero matchmaking wait.

### Game features

Everything below is shipped and live on devnet today.

| Feature | What it does | Code |
|---|---|---|
| **Callsign lock-in** | First-time onboarding picks a 3–12 char handle, profanity-filtered, locked forever | `client/src/components/HandleModal.js` |
| **Privy auth** | Embedded Solana wallet via email, Google or Telegram OAuth, no seed phrase | `client/src/wallet/` |
| **Custom Challenges** | Generate a 5-char challenge code, Satori-rendered Duel Card, share to TG, friend taps to accept | `server/services/challenge/DuelChallengeCard.js`, `client/src/screens/ChallengeAcceptScreen.js` |
| **Career Card** | 1080×608 share image with callsign, tier badge, rank, W/L, K/D, MVP weapon and 10-match recent form | `server/services/challenge/CareerStatsCard.js` |
| **Trophy DMs** | Bot DMs winner a 1080×1080 trophy share card after every settle (1v1 and group) | `server/services/challenge/victoryDm.js`, `TrophyShareCard.js` |
| **My Games** | Multi-match home screen for active group-chat matches with turn timers | `client/src/screens/MyGamesScreen.js` |
| **Share to Telegram** | One-tap share buttons throughout post-match flow plus native TG inline-share | `client/src/components/TelegramShare.js` |
| **Referrals** | 25 SHOT to inviter and 25 SHOT to invitee on first wagered match. Self-referral guard, one-shot, treasury-subsidised | `server/services/referrals.js` |
| **Leaderboard** | Global wins board. Top 10 in-bot (`/leaderboard`) plus full UI in app | `server/services/bot.js` |
| **Cosmetics / Armory** | 28 items across 5 categories (PATTERN, TRAIL, BLAST, SKIN, KILL) | `client/src/screens/ArmoryScreen.js` |
| **Tank customisation** | Barracks screen for colour, equipped cosmetics, loadout | `client/src/screens/BarracksScreen.js` |
| **Live SHOT/SOL price** | Jupiter-pulled price ticker in the header bar across all non-game screens | `client/src/components/ShotPriceTicker.js` |
| **iOS PWA install** | Native-looking banner walks Safari users through Add to Home Screen | `client/src/components/IosInstallBanner.js` |
| **TG WebView guard** | Auto-detects Telegram in-app browser on iPhone, prompts "Open in Browser" for Privy | `client/src/components/TgWebViewBanner.js` |
| **Wind physics** | Per-round horizontal wind ([-60, +60] px/s²), HUD indicator | `server/services/physics.js` |
| **Group-chat config** | `/customgame` wizard for wager, max players, duration (12h/3d/7d), turn timer (4h/12h/24h), idle penalty, buybacks, quiet hours | `server/services/groupchat/configFlow.js` |
| **Quiet hours** | Configurable nightly window (default 11pm–7am UTC) pauses turn timers | `server/services/groupchat/quietHours.js` |
| **Buybacks** | Optional per-match. Eliminated players pay 2/3/5/8/13× wager to re-enter at 50% HP | `server/services/groupchat/configFlow.js` |
| **Responsible Gaming** | 18+ notice plus Terms / Privacy footer on every screen | `client/src/components/ResponsibleGaming.js` |

---

## Audit transparency

Three independent audits ran ahead of mainnet. Most hackathon submissions have zero. We shipped all of them with remediation logs included.

### The three audits

| Audit | Scope | Key finding |
|---|---|---|
| **SOS (Stronghold of Security)** | Server and smart contracts. 50 vulnerability findings | H-severity: escrow math precision, settle-authority gating, race conditions |
| **BOK (Book of Knowledge)** | Smart contract math invariants. Formal property tests | 159/159 math property tests passing (Litesvm + proptest) |
| **DB (Dinh's Bulwark)** | Off-chain server and API security | Authentication, rate-limiting, CSPRNG, input validation |

### What was fixed

Three fix bundles shipped to `main`:

- **SOS fix bundle.** 9 of 50 SOS findings applied: settle-authority checks, fee math precision, lamport overflow guards, CSPRNG for room IDs, terrain seeds and spawn positions, helmet plus express-rate-limit, create-room throttle.
- **BOK verification suite.** 159 tests passing, confirming all escrow math invariants hold (90/7/3 split, pot = wager × depositor count, lamport rounding).
- **DB fix bundle.** Authentication hardening, rate limiting, input validation improvements.

### What was deferred

Higher-complexity SOS findings (re-entrancy patterns, full formal verification) are logged with rationale in the remediation log alongside each audit report. Nothing was quietly dropped. Every finding has a disposition.

### Audit output documents

- `.audit/FINAL_REPORT.md`. Full SOS report.
- `.bulwark/FINAL_REPORT.md`. DB final report.
- `.bok/results/summary.md`. BOK math verification summary.

---

## What's next

**Pre-mainnet hardening (Q2–Q3 2026)**

- Resolve remaining deferred SOS findings (re-entrancy, formal verification pass)
- Mainnet escrow deploy plus end-to-end mainnet smoke test
- Bot rate-limiting and abuse handling for public Telegram exposure
- On-chain match-history indexer for richer leaderboards

**Coming soon (designed, not yet shipped)**

| Feature | What it adds | Status |
|---|---|---|
| **Consumables** | Burn small amounts of SHOT for in-match boosts (Tactical Scope, Smoke Screen, Reinforced Armor, etc.) Lasts 5 matches, all SHOT burned permanently. | Service scaffolded (`server/services/consumables.js`). v1 ships Overcharge only |
| **Tournaments** | Bracketed multi-round events with guaranteed prize pools and SHOT bonuses | Designed |
| **SHOT buybacks** | Treasury-funded protocol buyback. Uses a slice of fees to repurchase and burn SHOT from open markets | Designed |
| **Multi-day marathon modes** | Group-chat turn timers beyond 24h. Capped at 24h today after SOS H039 hardening. Longer modes planned post-mainnet once stuck-match recovery is fully load-tested. | Lobby UI ready, server cap remains 24h |
| **Expanded leaderboard** | Per-mode boards, weekly resets, season-based prestige rewards | Designed |

**First 3 partner game types**

The async-turn-based backend is game-agnostic. Next three games targeted:

1. **Darts.** Nearest to bullseye wins. Same wager, settle and bot infrastructure.
2. **Golf.** Fewest shots wins. Multi-player async cadence is a natural fit.
3. **Card Battles.** Deck-building with SHOT-gated prestige cards.

All three share the same SHOT economy, Telegram bot and Privy wallet stack.

---

## By the numbers

| | |
|---|---|
| **90 / 7 / 3** | Escrow split (winner, treasury, ops). Fixed in contract |
| **2 programs** | v1 (1v1 real-time) and v2 (N-player async group-chat) |
| **3 audits** | SOS, BOK, DB. All reports public, all findings dispositioned |
| **159 / 159** | BOK math property tests passing |
| **10M SHOT** | Fixed supply, mint authority burned |
| **20 weapons** | 15 base plus 5 prestige across BO1 / BO3 / BO5 formats |
| **28 cosmetics** | 5 categories (PATTERN / TRAIL / BLAST / SKIN / KILL) |
| **3 auth methods** | Privy: email, Google, Telegram OAuth. No seed phrase |
| **3 share cards** | Trophy (post-win), Career (stats), Duel (challenge call-out). All server-rendered Satori |
| **3 safety layers** | Server settle, player cancel, permissionless reclaim (24h) |
| **25 SHOT** | Two-sided referral reward. Both inviter and invitee |

---

## Try it

| | |
|---|---|
| **Web** | [solshot.gg](https://solshot.gg). Works on desktop and mobile |
| **Telegram** | DM [@SolShotGG_bot](https://t.me/SolShotGG_bot), send `/play`, then `/customgame` in any group chat |
| **iPhone** | Safari, Share, Add to Home Screen for fullscreen |
| **Refer a friend** | DM `/refer` to the bot. Both earn 25 SHOT on their first wagered match |
| **Contribute** | [github.com/JJ-ME55/SolShot](https://github.com/JJ-ME55/SolShot). MIT, open to PRs |

---

## Team

Two-person team - JJ on engineering, Fish on product. Built with AI assistance. Three security audits, two shipped fix bundles, one working wagered game on devnet. Full stack delivered: React + Phaser 3 PWA, Express + Socket.IO server, two Anchor programs, SHOT token, Telegram bot with 18 commands (`/play`, `/customgame`, `/leaderboard`, `/refer`, `/mygames`, `/stats`, etc.), Privy wallet integration, MongoDB Atlas, Satori-rendered share cards, domain registered.

*SolShot is a skill-based game. Players are responsible for compliance with local regulations regarding wagering. This document is not financial advice.*
