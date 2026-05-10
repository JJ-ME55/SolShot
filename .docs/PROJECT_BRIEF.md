---
project: "SolShot"
status: refresh_complete
mode: existing
created: 2026-02-22
updated: 2026-05-07
last_refresh: 2026-05-07
refresh_trigger: "post-audit (SOS+BOK+DB) + v2 escrow + Privy migration + group-chat infrastructure"
topics_completed: ["competition-pitch", "player-onboarding", "crypto-explainer", "architecture", "escrow-flow", "token-economics", "security-posture"]
topics_remaining: []
---

# SolShot — Project Brief

## Vision
**Artillery duels in your group chat.** Multiplayer Pocket Tanks-style combat played asynchronously inside Telegram group chats, with optional real-SOL wagering settled trustlessly via on-chain escrow. The wedge is artillery; the prize is becoming the social-game layer for crypto group chats.

## Scope (current devnet state, May 2026)
- **In scope (live on devnet):**
  - 1v1 wagered matches (Quick Match / Duel / High Roller / Custom Challenge) via v1 escrow
  - N-player (2–10) wagered group-chat matches via v2 escrow, async multi-day cadence
  - 20 weapons (15 base + 5 prestige), destructible terrain, server-authoritative physics
  - SHOT token with prestige burns (mint authority burned, 10M supply)
  - SOL escrow wagering with 90/7/3 split (winner/treasury/ops)
  - Privy embedded wallets + Telegram bot magic-link binding
  - PWA at solshot.gg + Telegram bot @SolShotGG_bot
- **Out of scope (mainnet hardening required):**
  - Mainnet deploy (pending Bundles A/B/C/D — see `.docs/mainnet-roadmap.md`)
  - Tournaments, leaderboards (post-mainnet)
  - Mobile-native app (PWA covers iOS via Add to Home Screen)
  - Governance DAO, multi-token markets

## Architecture
- **Stack:** React 18 + Phaser 3.55 PWA, Express + Socket.IO server (ES modules), Anchor 0.32.1 (two programs: v1 + v2), MongoDB Atlas, Privy embedded wallets, Telegraf for Telegram bot, Vercel (client) + Render (server) hosting
- **Components:** 2 on-chain programs (v1 1v1 + v2 N-player), 1 game server (physics + economy + matchmaking + escrow signer), 1 web client (rendering + wallet adapter), 1 Telegram bot (lobby creation + magic-link DM)
- **Key pattern:** Server-authoritative physics + state; chain-authoritative funds. Server signs on-chain instructions; player wallets sign their own deposits.

## Live milestones
- **2026-05-04:** First wagered match settled end-to-end on devnet (1v1, match `2f5b6180`, TX [`4WSsDsKVz...`](https://solscan.io/tx/4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf?cluster=devnet))
- **2026-05-06:** First fully organic 3-player group-chat match auto-settled (TX [`4ja8VKp...`](https://solscan.io/tx/4ja8VKpZJnQek8xakFWqByyRJ6qG9U7iWeFwqiiZVKGhemVfnWLDLiJYuMdjoN9tKptCxE1Dkzx5d9ZE6D3NqtL1?cluster=devnet))

## Audit posture (May 2026)
- **3 audits performed** via Solana Vibes Kit (SVK):
  - **SOS Audit #2** (on-chain, both Anchor programs): 50 findings → 9 fixed in commit `7296e95`
  - **BOK Audit #2** (math invariants): 41 invariants verified, 159/159 tests passing (commit `5f2acec`)
  - **DB Audit #2** (off-chain server + client + bot): 113 findings → 16 fixed in commit `348f109`
- ~50 findings deferred to mainnet hardening, organized into Bundles A/B/C/D in `.docs/mainnet-roadmap.md`
- Full audit summary: `.docs/audit-summary.md`
- Fix-vs-defer logs: `Docs/internal/REMEDIATION_DECISIONS.md` (SOS), `Docs/internal/DB_REMEDIATION_DECISIONS.md` (DB)

## Decisions (carried from Feb 2026 + May 2026 refresh)
- [refresh-2026-05-07] Audit transparency is a core deliverable — full audit reports + remediation decision logs published in repo
- [refresh-2026-05-07] v1 + v2 coexist; v2 is the production target for new match types; v1 stays for 1v1 real-time legacy
- [refresh-2026-05-07] Privy replaces Dynamic — embedded wallets, magic-link DM bind, custody at Privy infra
- [refresh-2026-05-07] Mainnet hardening is sequenced: Bundle 1 (authority) → Bundle 3 (refund/settle) → Bundles 2 + 4 in parallel
- [escrow] 90/7/3 BPS split. v1: hardcoded constants. v2: configurable per-match snapshot, capped at 10% combined.
- [escrow] v1 timeouts (post-fix-bundle): TIMEOUT_SECONDS=3600, PERMISSIONLESS_RECLAIM_TIMEOUT=7200, SETTLEMENT_TIMEOUT_SECONDS=3600
- [escrow] v2 timing: per-match `deposit_window_secs` (60s–24h) + `duration_secs` (60s–24h, post-H039-fix) + 24h public-grace tail
- [escrow] H023 fix: refund loops require `len(remaining_accounts) == count_ones(deposits_mask)` — prevents partial-refund theft via close=caller
- [token] SHOT: 10M fixed, mint burned. 70% reward pool / 15% treasury / 10% team / 5% liquidity. Mint `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` (devnet)
- [arch] Thesis: "Server owns physics. Chain owns money. Neither can cheat."
- [security] Single hot wallet for upgrade auth + app auth — intentional pre-mainnet posture per JJ. Mainnet plan: Squads multisig (Bundle 1).
- [security] Server-as-winner-selector — design limitation, not vulnerability. Long-term: commit-reveal/VRF (Bundle 2 / mainnet research).
- [crypto] Disconnect = forfeit to leader; even = refund both; today's `8eefcca` adds auth-reset-on-reconnect
- [onboarding] Two paths: Practice (no wallet) and Wagering (Privy wallet + Telegram bot bind)
- [pitch] Hackathon angle: "First multiplayer-on-Solana with audit transparency" — 3 audits + remediation logs published
- [pitch] solshot.gg as live demo link

## Open Questions (May 2026)
- ~~Escrow timeout duration~~ — Resolved (1h settle + 2h permissionless reclaim post-fix-bundle)
- ~~Permissionless reclaim instruction~~ — Resolved (implemented + verified)
- ~~v2 escrow design~~ — Resolved (deployed + first organic match May 6)
- Privy wallet rotation handling — open for Bundle 2
- JWT model decision — open for Bundle 2 (real verify vs remove generation)
- Mainnet RPC provider choice (Helius / Triton / QuickNode) — open for Bundle 4
- Tournament mode design — post-mainnet
