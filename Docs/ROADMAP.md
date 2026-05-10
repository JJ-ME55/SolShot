# SolShot - Roadmap

> **Last updated:** 2026-05-10

---

## Thesis

> SolShot today is artillery in your group chat. Tomorrow it's the **social-game layer for crypto group chats** - multiple games, multiple chat surfaces, one shared on-chain economy.

The artillery game is the wedge. Group-chat-native gaming is the prize.

---

## Phased plan

### Phase 1 - Beachhead *(now → Q2 2026)*

Mainnet launch on Telegram. Artillery 1v1 + group chat, free + wagered. SHOT live.

- **Target:** first 5–10 active groups running real matches.

### Phase 2 - TG density *(Q3 2026)*

Deepen Telegram retention before chasing new chat surfaces.

- Tournament mode
- Seasons + battle pass
- SHOT staking
- **Spectator vaulting** - group members bet on the outcome of a live match they're watching
- **Target:** 100+ active groups, $1M cumulative wagered

### Phase 3 - Multi-game on TG *(Q4 2026 → Q1 2027)*

Second and third games shipping on the same infrastructure - same wallet, same SHOT, same prestige, same async-turn loop.

The catalogue:

- Basketball hoop shots
- Football keepie-uppies
- Football free-kick madness
- 8-ball pool
- Hockey
- Golf, darts, asymmetric card battles

Skill-based, async-fit, replayable in chat. Proves the playbook is replicable across a portfolio.

### Phase 4 - Multi-platform expansion *(Q2 2027+)*

Same Anchor programs, same SHOT, same prestige - different chat shells calling the same backend. Combined addressable surface: ~5B users.

| Order | Platform | Why this order |
|---|---|---|
| 1 | **Seekr Mobile** | Solana-native phone, OS-level wallet, dApp Store curated discovery. Wagered loop has near-zero auth friction. Strongest strategic fit, leads the multi-platform expansion. |
| 2 | **iMessage** | Native Apple framework, sticker-style invite flow into matches inside an iMessage thread. Wallet bind via Privy embedded wallets (already in our stack). |
| 3 | **WhatsApp** | Pilot via web-link bind in the near term; full native integration when Meta ships their mini-app framework. Highest TAM, longest road. |

### Phase 5 - Open SDK / platform *(mid 2027+)*

Third-party devs ship group-chat-native wagered games on SolShot infrastructure. We provide the escrow primitives, identity layer, chat plumbing, and settlement contracts. We take rake. SHOT becomes the cross-game economy.

**End state:** an app store for group-chat wagered games.

---

## New mechanic - multi-game time-windowed wagered events

Beyond single-match wagers, a wager structure that spans multiple games over a time window:

1. Lobby host picks N games from the catalogue
2. Sets a window (1 / 2 / 4 / 7 days)
3. Players join, deposit, post their best scores during the window
4. At the deadline, the smart contract releases funds to the leader (or top-N split)

Different rhythm from real-time SolShot matches, complementary not competing. Single-game wagers compete on game quality. Multi-game async wagers across a friend group is **infrastructure**. That's the moat.
