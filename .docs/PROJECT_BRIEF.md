---
project: "SolShot"
status: interview_complete
mode: existing
created: 2026-02-22
updated: 2026-02-22
topics_completed: []
topics_remaining: ["competition-pitch", "player-onboarding", "crypto-explainer", "architecture", "escrow-flow", "token-economics", "security-posture"]
---

# SolShot — Project Brief

## Vision
Browser-based 1v1 artillery combat on Solana where players wager real SOL, settled trustlessly via on-chain escrow — Pocket Tanks meets skill-based wagering.

## Scope
- **In scope (v1):** 20 weapons (15 base + 5 prestige), 4 match modes (Practice/Quick/Duel/High Roller), SOL escrow wagering, SHOT token with burn-for-prestige, server-authoritative physics, destructible terrain, BO1/BO3/BO5
- **Out of scope:** Tournaments, leaderboards, mobile-native app, governance DAO, mainnet deploy (pending security hardening)

## Architecture
- **Stack:** React 18 + Phaser 3 client, Express + Socket.IO server (ES modules), Anchor 0.32.1 escrow program, MongoDB Atlas
- **Components:** 1 on-chain program (escrow PDA), 1 game server (physics/economy/matchmaking), 1 web client (rendering + wallet adapter)
- **Key pattern:** Server-authoritative — client sends inputs (angle/power/weapon), server computes everything

## Decisions
- [existing] Litepaper v2.1 is canonical public spec — new docs complement, not replace
- [competition] Matrix Play Solana — JUP track. One-pager must highlight Jupiter integration.
- [competition] JUP integration scope: Jupiter swap (in-game), live JUP price feed, JUP-supported wallet connector
- [competition] JUP features are planned but not yet built — docs should present as upcoming/in-progress
- [audience] How-to-play targets both crypto-native and crypto-curious — accessible but not patronizing
- [token] SHOT mint authority burned — 10M fixed supply, deflationary via prestige burns
- [escrow] 90/7/3 BPS split (winner/treasury/ops), integer lamport math, 1hr settle + 48hr reclaim

- [jup] Swap pairs: SOL<>SHOT (in-game swap so players can acquire SHOT for prestige burns)
- [jup] Live JUP price: header bar across all non-game pages (menu, lobby, armory, prestige, etc.)
- [jup] Wallet connector: existing wallet-adapter extended to include Jupiter wallet support
- [pitch] Core hook: "Skill-based SOL wagering — live, not a demo" — everything on one-pager serves this
- [pitch] Mainnet-live at submission — no hedging, no footnotes
- [pitch] Stats order: 90/7/3 split → 3 audits → 10M fixed/burned → 20 weapons/4 modes/BO1-3-5
- [pitch] JUP integration = track qualification, not headline
- [pitch] Solo founder, built with AI — no ecosystem partner claims
- [pitch] solshot.gg as live demo link
- [onboarding] Guide = gameplay only, no wallet/crypto setup instructions
- [onboarding] Tone: "handed you a controller" — short, snappy, tutorial-style
- [onboarding] Two paths: Practice (no wallet) and Wagering (wallet + confirm)
- [onboarding] Use in-game screen names: Deploy, Shop, Armory, Prestige, Barracks
- [onboarding] Highlight gotchas: wind, multiple weapons, gold conservation, tank knockback
- [crypto] Progressive disclosure: two-liner → bank vault analogy → smart contract lite
- [crypto] Fee: "10% (7% treasury, 3% operations)" — transparent breakdown
- [crypto] Disconnect = forfeit to leader; even = refund both; 30s reconnect window first
- [crypto] No program addresses or explorer links — "audited and on-chain" is the trust ceiling
- [crypto] Escrow timeout: 1hr settlement + 48hr permissionless reclaim (updated from 24h)
- [arch] Thesis: "Server owns physics. Chain owns money. Neither can cheat."
- [arch] 15-second total read: thesis + 2-sentence explainer + 3-box diagram
- [arch] No dev audience — judges/users only, no implementation details
- [arch] Match lifecycle reserved for demo video, not this doc

- [escrow] 7-step lifecycle: room→join→fund PDA→play→win→settle→confirm
- [escrow] 2-3 min hard funding window, countdown visible, refund if missed
- [escrow] 3-layer fund safety: server recovery → player cancel → permissionless reclaim
- [escrow] Server crash = settle on last known state, no resume
- [escrow] Server keypair = authorized trigger only, program enforces correct recipients
- [escrow] Key rotation via config account, zero disruption to active matches
- [escrow] Match states: waiting→funding→funded→in_progress→settling→settled (+ refunding, disputed)

- [token] 10M fixed, mint burned. 70% reward pool / 15% treasury / 10% team / 5% liquidity
- [token] Milestone-based emission, 5% remaining pool/month cap (admin-enforced)
- [token] Team: no vesting, sell discipline max 10%/week into volume
- [token] Meteora DAMM V2 pool + Jupiter aggregation (NOT Raydium — litepaper outdated)
- [token] Prestige scarcity intentional — early players rewarded, Diamond increasingly rare
- [token] Additional burn sinks planned, TBD — frame as extensible architecture

- [security] Thesis: same as architecture — "Server owns physics, chain owns money, neither can cheat"
- [security] Audience: judges (rigor) + players (funds safe), no dev depth
- [security] Audit presentation: summary + results table only, no full reports published
- [security] Audit tooling: not mentioned — "3 independent security analyses"
- [security] Authority centralization: transparent — solo founder, rotation exists, multisig v1.2
- [security] Fund safety headline: "3 independent escape paths" (recovery → cancel → reclaim)
- [security] H029 outcome verification: head-on — server trusted for gameplay, chain for money
- [security] Server hardening: one-liner — authenticated, rate-limited, input-validated
- [security] Key rotation: statement only — can rotate without disrupting active matches
- [security] Incident response: brief — pause, halt, reclaim. No full IR doc.
- [security] Accepted risks: internal only, not in public doc
- [security] Regulatory: "Skill-based game. Players responsible for local compliance."

## Open Questions
- ~~Escrow timeout duration~~ — Resolved: 1hr settlement + 48hr permissionless reclaim
- ~~Permissionless reclaim instruction~~ — Resolved: implemented on-chain
- Litepaper v2.1 references Raydium — needs updating to Meteora DAMM V2
