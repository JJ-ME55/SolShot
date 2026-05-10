---
topic: "Escrow Flow"
topic_slug: "escrow-flow"
status: complete
interview_date: 2026-02-22
decisions_count: 8
provides: ["escrow-flow-decisions"]
requires: ["competition-pitch-decisions", "crypto-explainer-decisions"]
verification_items: []
---

# Escrow Flow — Decisions

## Summary
The escrow lifecycle is a 7-step flow: room creation, player join, PDA funding, match play, win condition, atomic settlement, confirmation. Three layers of fund safety ensure players never lose SOL regardless of server state. The server keypair is an authorized trigger, not an authorized destination — on-chain program enforces correct recipients and math.

## Decisions

### D1: Match Lifecycle — 7 Steps
**Choice:** The full wagered match lifecycle:
1. **Room creation** — P1 selects wager tier, room recorded in MongoDB (`waiting` state)
2. **P2 join** — server confirms both present + wager amounts match, nothing on-chain yet
3. **Escrow funding** — server instructs both players to fund PDA (derived from room ID), both sign + deposit SOL, server waits for both confirmations before proceeding
4. **Match plays** — server-authoritative physics, SOL static in PDA
5. **Win condition** — server determines winner
6. **Settlement** — server submits single atomic TX: 90% winner / 7% treasury / 3% ops, PDA closed
7. **Confirmation** — on-chain confirmation received, MongoDB updated, winner/loser screens triggered on clients
**Rationale:** Clean separation of concerns — nothing goes on-chain until both players have committed real money. Settlement is a single atomic transaction so there's no partial-payout state.
**Alternatives considered:** On-chain match state tracking (too expensive), streaming payments during match (unnecessary complexity)
**Affects docs:** [edge-case-playbook, crypto-explainer, architecture, deployment-sequence]

### D2: Funding Window
**Choice:** 2-3 minute hard window with visible countdown. No grace period. If P2 deposits at 2m59s and it confirms, match continues. If timer hits zero with only one deposit, immediate full refund to the depositor, PDA closes.
**Rationale:** Hard window with no ambiguity — players see the countdown, know exactly what happens. Late-but-valid deposits are fine; missing the window is clean.
**Alternatives considered:** Soft timeout with grace period, indefinite wait
**Affects docs:** [edge-case-playbook, crypto-explainer]

### D3: Three-Layer Fund Safety
**Choice:** Players never lose SOL regardless of server state. Three safety layers:
1. **Server recovery** — server restarts, checks MongoDB for `in_progress` matches with funded PDAs, settles based on last known game state (no resume)
2. **Player cancel** — either player calls `cancel_match` after PDA expiry timestamp passes. Requires player signature (anti-spam). Full refund to both.
3. **Permissionless reclaim** — anyone can trigger after 48 hours. Only requires a fee payer signature. Absolute backstop if both players lose wallet access or can't transact. Now implemented on-chain.
**Rationale:** Defense in depth. Server crash is the common case (layer 1). Player-triggered is the backup (layer 2). Permissionless is the nuclear option (layer 3). At no point can funds be permanently locked.
**Alternatives considered:** Server-only recovery (single point of failure), immediate refund on any disruption
**Affects docs:** [edge-case-playbook, crypto-explainer, security-model]

### D4: Server Crash — No Resume
**Choice:** If the server crashes mid-match, it settles based on last known game state when it recovers. No attempt to reconnect players and resume the match.
**Rationale:** Resuming a crashed match introduces massive complexity (reconnecting both players, restoring exact game state, syncing clocks). Settling based on last state is fair — whoever was winning gets the win.
**Alternatives considered:** Full match resume after crash, always refund on crash
**Affects docs:** [edge-case-playbook]

### D5: Server Keypair — Authorized Trigger, Not Destination
**Choice:** Server keypair lives in secret manager in production, with a dev-only file path fallback for local development. The Anchor program validates: settlement amounts match deposits, recipients are original depositors. A leaked keypair can only settle existing valid PDAs to their original players — cannot redirect funds or drain arbitrary accounts.
**Rationale:** The program is the authority, the keypair is just the trigger. This limits blast radius of key compromise to essentially zero financial risk.
**Alternatives considered:** Multisig settlement (slower, more complex), player-signed settlement (requires both online)
**Affects docs:** [security-model, deployment-sequence, edge-case-playbook]

### D6: Key Rotation — Zero Disruption
**Choice:** Authority keypair stored in a global config account on-chain. Rotation is a single transaction updating the config. Active PDAs continue working because the program reads authority from the config account at execution time, not at PDA creation time.
**Rationale:** Hot-swappable authority means you can rotate on suspicion without draining/refunding every active match first.
**Alternatives considered:** PDA-embedded authority (requires migration), multi-authority with quorum
**Affects docs:** [security-model, deployment-sequence]

### D7: On-Chain Latency
**Choice:** Total on-chain overhead per match is ~2-3 seconds (funding confirmation + settlement confirmation). Solana confirmation under 2 seconds, server processing under 1 second. Match duration (3-8 min for BO1) is entirely gameplay — on-chain latency is negligible.
**Rationale:** Important for player experience framing — the blockchain is invisible during gameplay. Players don't wait on the chain.
**Alternatives considered:** N/A — this is observed performance, not a design choice
**Affects docs:** [crypto-explainer, how-to-play]

### D8: MongoDB Match State Machine
**Choice:** Match records move through these states:
- `lobby` — room created, players joining, wager selection
- `weapon_shop` — shop phase, players purchasing weapons
- `battle` — active gameplay, turns alternating
- `settling` — settlement TX submitted, awaiting on-chain confirmation (crash recovery checks if TX already landed before resubmitting)
- `complete` — settlement confirmed, winner paid, PDA closed, terminal state
- `cancelled` — match cancelled (covers: disconnect timeout, funding timeout, server crash recovery, refunds)
**Rationale:** States map directly to player-visible game phases. The `settling` state prevents double-settlement on crash recovery. `cancelled` is the catch-all exit for any non-standard resolution.
**Alternatives considered:** More granular states (funding/funded/refunding/disputed — adds precision but complexity), on-chain state tracking (expensive)
**Affects docs:** [edge-case-playbook, deployment-sequence, security-model]

## Open Questions
- [x] ~~Permissionless reclaim instruction~~ — **Resolved.** Implemented on-chain. No longer limited to `cancel_match` with player signature.
- [x] ~~Escrow timeout duration~~ — **Resolved.** Now 1hr settlement + 48hr permissionless reclaim. See crypto-explainer D5.

## Raw Notes
- "Server can crash and players NEVER lose SOL" — use this exact framing in docs
- The PDA is derived from room ID, making each escrow account unique per match
- The `settling` state exists specifically for the "did my TX land?" crash recovery scenario — without it you risk double-submitting settlement
- BO1 typical match: 5-15 minutes depending on player skill level
- Key rotation is a config account update, not a migration — important distinction for deployment docs
- The permissionless reclaim at 2x expiry is the "nuclear option" — covers the case where both players AND the server are gone
