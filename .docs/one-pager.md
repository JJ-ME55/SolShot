---
doc_id: one-pager
title: "SolShot One-Pager"
updated: 2026-05-07
network: devnet
status: live
---

# SolShot

### Artillery duels in your Telegram group chat. Wager SOL. Settle on-chain.

**Last updated:** May 7, 2026 — Devnet  
**Play:** [solshot.gg](https://solshot.gg) | **Telegram bot:** [@SolShotGG_bot](https://t.me/SolShotGG_bot)

---

## What it is

SolShot is a skill-based multiplayer artillery game (Pocket Tanks style) where players wager real SOL inside Telegram group chats. Every wager is held in an Anchor escrow program on Solana — no custodian, no off-chain accounting. The last tank standing gets 90% of the pot, settled atomically on-chain.

---

## Why it matters

**The wedge:** Telegram group chats are where crypto-native players already hang out. SolShot brings a real game into the chat window — async turns, self-updating lobby cards, bot-posted shot recaps — so the game happens in the group, not away from it.

**The vision:** SolShot is the first game on a bigger platform: a social-game layer for crypto group chats. Multiple game types (golf, darts, billiards, card battles) on the same async-turn-based backend, same SHOT economy, same chat surfaces. Telegram first, then Seekr Mobile, iMessage, and WhatsApp.

**The moat:** Privy embedded wallets (email or Telegram OAuth, no seed phrases) make onboarding seamless for players who have never touched a Solana wallet. Frictionless entry into a wagered skill game — that combination is rare.

---

## How a match works

1. **Lobby.** Host runs `/customgame` in any Telegram group. Bot posts a self-updating lobby card showing wager amount, player slots, and join status.
2. **Deposit.** When the lobby fills, the server creates the escrow PDA. Each player signs their own `deposit_wager` transaction — no custodial step. Pot accumulates inside the PDA on-chain.
3. **Play.** Server advances turns, posts "Take your shot" pings in chat. Players tap the button, aim inside solshot.gg, fire. Server runs server-authoritative physics, broadcasts shot results, posts the recap back to chat.
4. **Settle.** When one tank remains, the server calls `settle_match`. The contract distributes the pot 90 / 7 / 3 (winner / treasury / ops). Settlement TX and Solscan link post back to chat.

Server runs all physics. Players only send angle + power + weapon. Nothing the client does can affect the outcome — there is nothing to hack on the client.

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

- **2026-05-04 — 1v1 Quick Match:** First wagered match end-to-end on devnet. Winner +0.18 SOL, Treasury +0.014, Ops +0.006. TX: [`4WSsDsKV...`](https://solscan.io/tx/4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf?cluster=devnet)
- **2026-05-06 — 3-player group-chat:** First fully organic N-player auto-settle. No manual intervention. TX: [`4ja8VKpZ...`](https://solscan.io/tx/4ja8VKpZJnQek8xakFWqByyRJ6qG9U7iWeFwqiiZVKGhemVfnWLDLiJYuMdjoN9tKptCxE1Dkzx5d9ZE6D3NqtL1?cluster=devnet)

### SHOT token

10M fixed supply. Mint authority burned at launch — supply can only decrease. 1.5M in treasury, 8.5M in dev wallet (rewards + team + liquidity). Players burn SHOT to unlock prestige weapon tiers. On-chain burn verification on every upgrade.

### Access points

| Surface | Link |
|---|---|
| Web PWA | [solshot.gg](https://solshot.gg) |
| Telegram bot | [@SolShotGG_bot](https://t.me/SolShotGG_bot) — `/play` to bind wallet, `/customgame` in any group |
| iPhone | Safari → Share → Add to Home Screen (fullscreen PWA) |

---

## Audit transparency

Three independent audits ran before mainnet. Most hackathon submissions have zero. We shipped all of them, remediation logs included.

### The three audits

| Audit | Scope | Key finding |
|---|---|---|
| **SOS (Stronghold of Security)** | Server + smart contracts — 50 vulnerability findings | H-severity: escrow math precision, settle-authority gating, race conditions |
| **BOK (Book of Knowledge)** | Smart contract math invariants — formal property tests | 159/159 math property tests passing (Litesvm + proptest) |
| **DB (Dinh's Bulwark)** | Off-chain server and API security | Authentication, rate-limiting, CSPRNG, input validation |

### What was fixed

Two fix bundles shipped to `main`:

- **Commit `7296e95`** — 9 of 50 SOS findings applied: settle-authority checks, fee math precision, lamport overflow guards, CSPRNG for room IDs / terrain seeds / spawn positions, `helmet` + `express-rate-limit`, create-room throttle.
- **Commit `5f2acec`** — BOK Audit #2 verification suite added; 159 tests passing, confirms all escrow math invariants hold (90/7/3 split, pot = wager × depositor count, lamport rounding).
- **Commit `348f109`** — DB fix bundle: authentication hardening, rate limiting, input validation improvements.

### What was deferred

Higher-complexity SOS findings (re-entrancy patterns, full formal verification) are logged with rationale in `Docs/REMEDIATION_DECISIONS.md`. Nothing was quietly dropped — every finding has a disposition.

### Audit output documents

- `Docs/SOS_FINAL_REPORT.md` — full 50-finding SOS report
- `.bulwark/FINAL_REPORT.md` — DB final report
- `.bok/results/summary.md` — BOK math verification summary
- `Docs/REMEDIATION_DECISIONS.md` — finding-by-finding disposition log

---

## What's next

**Pre-mainnet hardening (Q2–Q3 2026)**

- Resolve remaining deferred SOS findings (re-entrancy, formal verification pass)
- Mainnet escrow deploy + end-to-end mainnet smoke test
- Bot rate-limiting + abuse handling for public Telegram exposure
- Leaderboard + match history on-chain indexer

**First 3 partner game types**

The async-turn-based backend is game-agnostic. Next three games targeted:

1. **Darts** — nearest to bullseye wins, same wager/settle/bot infrastructure
2. **Golf** — fewest shots wins, multi-player async cadence is a natural fit
3. **Card Battles** — deck-building with SHOT-gated prestige cards

All three share the same SHOT economy, Telegram bot, and Privy wallet stack.

---

## By the numbers

| | |
|---|---|
| **90 / 7 / 3** | Escrow split — winner / treasury / ops, fixed in contract |
| **2 programs** | v1 (1v1 real-time) + v2 (N-player async group-chat) |
| **3 audits** | SOS + BOK + DB — all reports public, all findings dispositioned |
| **159 / 159** | BOK math property tests passing |
| **10M SHOT** | Fixed supply, mint authority burned |
| **20 weapons** | 15 base + 5 prestige across BO1 / BO3 / BO5 formats |
| **3 safety layers** | Server settle → player cancel → permissionless reclaim (24h) |

---

## Try it

| | |
|---|---|
| **Web** | [solshot.gg](https://solshot.gg) — works on desktop and mobile |
| **Telegram** | DM [@SolShotGG_bot](https://t.me/SolShotGG_bot) → `/play`, then `/customgame` in any group chat |
| **iPhone** | Safari → Share → Add to Home Screen for fullscreen |
| **Contribute** | [github.com/JJ-ME55/SolShot](https://github.com/JJ-ME55/SolShot) — MIT, open to PRs |

---

## Team

Solo founder. Built with AI assistance. Three security audits, two shipped fix bundles, one working wagered game on devnet. Full stack delivered: React + Phaser 3 PWA, Express + Socket.IO server, two Anchor programs, SHOT token, Telegram bot, Privy wallet integration, MongoDB Atlas, domain registered.

*SolShot is a skill-based game. Players are responsible for compliance with local regulations regarding wagering. This document is not financial advice.*
