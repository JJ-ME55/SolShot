---
doc_id: edge-case-playbook
title: "Edge Case & Recovery Playbook"
status: draft
created: 2026-02-24
sources:
  - escrow-flow-decisions
  - crypto-explainer-decisions
  - security-posture-decisions
  - architecture-decisions
---

# Edge Case & Recovery Playbook

SolShot handles real SOL in real-time multiplayer matches. This document catalogs every failure mode we have identified, what the system does in response, what the player sees, and where the funds end up. The governing design principle:

> "The server owns the physics. The chain owns the money. Neither player nor operator can cheat either."

Every scenario below resolves to one of two fund outcomes: **correct settlement** (90% winner / 7% treasury / 3% ops) or **full refund** to both players. There is no third outcome. Funds cannot be permanently locked.

---

## Three-Layer Fund Safety Net

Before diving into scenarios, it is essential to understand the defense-in-depth architecture that underpins every recovery path. SolShot enforces three independent layers of fund protection, each a fallback for the one above:

| Layer | Mechanism | Trigger | Who Can Call | Timeframe |
|-------|-----------|---------|--------------|-----------|
| **1. Server Recovery** | Server restarts, reads MongoDB for `settling` or `battle`-state matches with funded PDAs, settles on last known game state | Automatic on server boot | Server authority keypair | Immediate on restart |
| **2. Player Cancel** | Either player calls `cancel_match` on-chain after the PDA expiry timestamp (24 hours from activation) | Manual, player-initiated | Either registered player (requires wallet signature) | After 24 hours |
| **3. Permissionless Reclaim** | Anyone triggers `permissionless_reclaim` after 48 hours from activation. Caller receives PDA rent lamports as economic incentive | Manual, anyone can call | Any Solana wallet (only fee payer signature required) | After 48 hours |

At no point in any scenario can funds be permanently locked. If the server vanishes, players recover funds. If both players vanish, anyone can recover funds after 48 hours.

---

## Scenario 1: Player Disconnects Mid-Match (Opponent Is Winning)

**Trigger:** Player A loses their internet connection, closes the browser, or their device crashes during an active `battle`-state match where Player B has more round wins, higher HP, or a higher score.

**What the system does:**

1. The server detects the Socket.IO disconnect event immediately.
2. A 30-second reconnect window opens (`RECONNECT_WINDOW_MS = 30000`). The server stores Player A's session in `pendingReconnects` keyed by wallet address.
3. If Player A reconnects within 30 seconds, their new socket is mapped to the old player slot. The match resumes seamlessly. Opponent sees a "reconnected" notification.
4. If the 30-second window expires without reconnect, the server fires `cleanupRoom` with reason `reconnect_timeout`.
5. The server evaluates game state using a tiered decision chain: round wins first, then HP, then score.
6. Because Player B is ahead, Player B is declared the winner.
7. The server transitions the match to `settling` state (preventing double-settlement) and calls `settleMatchEscrow` with Player B's wallet as the winner.

**What the players see:**

- Player A (disconnected): sees nothing during the window. If they return to the app later, they see a loss result.
- Player B (remaining): sees an "opponent disconnected" banner with a 30-second countdown, followed by a win screen with settlement confirmation.

**Funds outcome:** Standard settlement -- Player B receives 90% of the pot. Treasury receives 7%. Ops receives 3%. PDA is closed.

---

## Scenario 2: Player Disconnects Mid-Match (Disconnected Player Is Winning)

**Trigger:** Player A disconnects while leading on round wins, HP, or score.

**What the system does:**

1. Same 30-second reconnect window as Scenario 1.
2. If no reconnect, the server evaluates the tiered decision chain (`roundWins -> HP -> scores`).
3. Because Player A was ahead, Player A is declared the winner despite being the one who disconnected.

**What the players see:**

- Player A (disconnected, winning): receives settlement to their wallet. If they return to the app, they see a win result.
- Player B (remaining, losing): sees the "opponent disconnected" countdown, then a loss screen with the settlement confirmation showing funds went to Player A.

**Funds outcome:** Standard settlement -- Player A (disconnected but winning) receives 90%. This prevents the exploit where a losing player intentionally disconnects to deny the leader their payout.

---

## Scenario 3: Player Disconnects Mid-Match (Genuinely Tied)

**Trigger:** Player A disconnects while both players have identical round wins, identical HP (default 250 each if no damage dealt yet), and identical scores.

**What the system does:**

1. Same 30-second reconnect window.
2. If no reconnect, the server evaluates the decision chain: rounds equal, HP equal, scores equal.
3. The `shouldRefund` flag is set to `true`.
4. The server calls `cancelMatchEscrow` instead of `settleMatchEscrow`, refunding both players their full wager.

**What the players see:**

- Player B (remaining): sees the disconnect countdown, then a "match cancelled -- refund issued" message.
- Player A (disconnected): receives their full wager back to their wallet.

**Funds outcome:** Full refund to both players. PDA is closed. No fees charged.

---

## Scenario 4: Player Disconnects During Funding

**Trigger:** The escrow PDA has been created on-chain, deposit transactions have been sent to both players, and Player A disconnects before submitting their deposit within the 2-minute funding window (`DEPOSIT_TIMEOUT_MS = 120000`).

**What the system does:**

1. If Player A disconnects before either player deposits, the room is immediately removed. The `depositTimers` countdown is cleared. On-chain, the PDA exists but holds zero SOL. The server calls `cancelMatchEscrow` to close the empty PDA.
2. If Player B has already deposited but Player A has not, the 2-minute deposit timer continues running.
3. When the timer expires, the server checks deposit status. Only one deposit confirmed means an incomplete funding state.
4. The server calls `cancelMatchEscrow`, which refunds Player B's full deposit and closes the PDA.
5. Both players receive the `escrowDepositTimeout` event.

**What the players see:**

- Player B (deposited): sees a "deposit timeout -- refund issued" message. Their SOL is returned in full.
- Player A (disconnected, did not deposit): loses nothing -- they never deposited.

**Funds outcome:** Full refund to Player B. Player A never deposited, so they lose nothing. PDA is closed.

---

## Scenario 5: Server Crashes Mid-Match

**Trigger:** The Node.js server process crashes (unhandled exception, OOM kill, host restart) while two players are in an active `battle`-state match with a funded escrow PDA.

**What the system does:**

1. Both players lose their Socket.IO connections immediately.
2. The match state in MongoDB reflects the last persisted state (status `battle` with player scores, HP, and round data).
3. **No resume.** This is a deliberate design decision -- resuming a crashed match requires reconnecting both players, restoring exact game state, and syncing clocks, which introduces unacceptable complexity.
4. **Layer 1 (Server Recovery):** When the server restarts, it queries MongoDB for matches in `battle` or `settling` states. For each, it evaluates last known game state and settles to the player who was winning at the time of the crash.
5. If game state was genuinely even at crash time, the server issues a refund via `cancelMatchEscrow`.

**What the players see:**

- Both players see the game freeze, then a connection-lost screen. When they next open the app, the result is already settled.

**Funds outcome:** Settlement based on last known state. Winner (at time of crash) receives 90%. If tied, full refund to both. The on-chain escrow program enforces that the settlement recipient must be one of the two original depositors -- the server cannot redirect funds elsewhere.

---

## Scenario 6: Server Crashes During Settlement

**Trigger:** The server determines a winner, transitions the MongoDB match to `settling`, submits the `settle_match` transaction to Solana, and crashes before receiving the on-chain confirmation.

**What the system does:**

1. The `settling` state in MongoDB is the critical sentinel. It means "a settlement transaction has been submitted but not confirmed."
2. **On restart,** the server finds matches in `settling` state.
3. Before resubmitting, it checks on-chain whether the PDA still exists and what state it is in:
   - If the PDA is already closed (state `Settled`), the original transaction landed successfully. The server updates MongoDB to `complete`. No double-settlement occurs.
   - If the PDA still exists in `Active` state, the original transaction failed or was dropped. The server resubmits settlement.
4. The on-chain program provides a second guard: `settle_match` requires `state == MatchState::Active`. If the PDA is already in `Settled` state, the instruction fails with `InvalidState`. Double-settlement is structurally impossible.

**What the players see:**

- Brief outage. Funds arrive at the winner's wallet either from the original transaction or the retry. The delay is the server restart time plus one Solana confirmation (~2 seconds).

**Funds outcome:** Correct settlement. The `settling` state in MongoDB plus the `MatchState::Active` requirement on-chain make double-settlement impossible at both the application layer and the program layer.

---

## Scenario 7: Both Players Disconnect

**Trigger:** Both Player A and Player B lose their connections simultaneously (e.g., the game lobby server goes down, both on the same network that fails).

**What the system does:**

1. Two disconnect events fire in rapid succession. Each triggers its own 30-second reconnect window.
2. If one player reconnects within 30 seconds, the match can continue (the other player's timer is still running).
3. If neither reconnects within 30 seconds, the first timer to expire triggers `cleanupRoom` with `reconnect_timeout`.
4. The server evaluates game state using the same decision chain (round wins, HP, score). Settlement or refund proceeds normally.
5. The second disconnect timer fires but finds the room already removed -- it no-ops safely.

**What the players see:**

- Both see connection-lost screens. Settlement or refund arrives at their wallets based on who was ahead.

**Funds outcome:** Settlement to the leader, or full refund if tied. Same as Scenarios 1-3, just with both players absent.

**Backstop if the server is also down:** If the server is unable to process the disconnect timers (because the server itself is down), Layers 2 and 3 activate. Either player can call `cancel_match` after 24 hours. Anyone can call `permissionless_reclaim` after 48 hours.

---

## Scenario 8: Funding Timeout (One Player Deposits, Other Does Not)

**Trigger:** Both players receive `escrowDeposit` events with deposit transactions. Player A signs and submits their deposit. Player B never signs. The 2-minute `DEPOSIT_TIMEOUT_MS` countdown expires.

**What the system does:**

1. The `depositTimers[roomId]` fires after 120 seconds.
2. The server checks `wsCheck.deposits` for both host and player socket IDs. Only one deposit is confirmed.
3. The server calls `cancelMatchEscrow(roomId, p1wallet, p2wallet)`.
4. On-chain, the PDA is in `AwaitingDeposits` state (only one of `player_one_deposited` / `player_two_deposited` is true). The `cancel_match` instruction refunds the depositor their full wager amount and closes the PDA.
5. The room is removed. Both players receive `escrowDepositTimeout`.

**What the players see:**

- Player A (deposited): sees "Deposit timeout -- your SOL has been refunded."
- Player B (did not deposit): sees "Deposit timeout -- match cancelled."

**Funds outcome:** Full refund to Player A. Player B never deposited. Zero funds lost.

---

## Scenario 9: Escrow Timeout (Settlement Never Happens)

**Trigger:** A match completes (or the server crashes and never recovers), but no settlement transaction is ever submitted. The on-chain PDA sits in `Active` state with both players' SOL locked.

**What the system does -- Layer 2 (Player Cancel, after 24 hours):**

1. The `cancel_match` instruction checks: caller is a registered player AND `Clock::get()?.unix_timestamp > activated_at + TIMEOUT_SECONDS` (where `TIMEOUT_SECONDS = 86400`, i.e., 24 hours).
2. Either player signs the `cancel_match` transaction from their wallet.
3. The program refunds both players their full wager and closes the PDA.

**What the system does -- Layer 3 (Permissionless Reclaim, after 48 hours):**

1. If neither player acts within 48 hours (both lost wallet access, both unaware, etc.), the `permissionless_reclaim` instruction activates.
2. Anyone can call it. The instruction checks: `Clock::get()?.unix_timestamp > activated_at + PERMISSIONLESS_RECLAIM_TIMEOUT` (where `PERMISSIONLESS_RECLAIM_TIMEOUT = 172800`, i.e., 48 hours).
3. The caller only needs to pay the transaction fee. They receive the PDA's rent-exempt lamports as an economic incentive to clean up stale escrows.
4. Both players receive their full wager refund regardless of who calls the instruction.

**What about the 1-hour settlement deadline?**

The on-chain `settle_match` instruction enforces `SETTLEMENT_TIMEOUT_SECONDS = 3600`. After 1 hour from match activation, the server can no longer settle -- only cancel or await permissionless reclaim. This prevents a compromised server from settling a stale match days later with a fabricated winner.

**Funds outcome:** Full refund to both players via whichever layer activates first.

---

## Scenario 10: Wallet Has Insufficient SOL for Fees

**Trigger:** A player's wallet has exactly enough SOL for the wager but not enough to cover Solana transaction fees (~0.000005 SOL per transaction) required to sign the `deposit_wager` instruction.

**What the system does:**

1. The client builds the deposit transaction with the player as `feePayer`.
2. When the player attempts to sign and submit, the Solana runtime rejects the transaction with an insufficient funds error.
3. The deposit never lands on-chain. From the server's perspective, this player simply never deposited.
4. The 2-minute deposit timeout fires. The server cancels the escrow and refunds the other player (if they deposited).

**What the players see:**

- Player A (insufficient SOL): sees a wallet error ("insufficient funds for transaction fee") when attempting to sign.
- Player B (deposited): sees the deposit timeout and refund message after 2 minutes.

**Funds outcome:** Player A never deposited, so they lose nothing. Player B receives a full refund. The minimum wager of 0.00001 SOL (`MIN_WAGER_LAMPORTS = 10_000`) ensures that any wager large enough to create is large enough to generate at least 1 lamport in both fee buckets on-chain.

**What about fees during settlement?** The server authority keypair pays all settlement transaction fees. Players never pay fees for settlement or cancellation -- only for their initial deposit transaction.

---

## Scenario 11: Key Compromise (Server Authority Keypair Leaked)

**Trigger:** The server's authority keypair (stored in a secret manager in production) is exposed to an attacker.

**What the attacker can do:**

- Call `settle_match` on any PDA in `Active` state.
- Call `cancel_match` on any PDA in `AwaitingDeposits` state.

**What the attacker CANNOT do:**

- Redirect funds to their own wallet. The on-chain program enforces: `winner.key() == escrow.player_one || winner.key() == escrow.player_two`. The winner must be one of the original depositors.
- Drain the treasury or ops wallets. Settlement amounts are computed on-chain from the `wager_lamports` field using hardcoded BPS constants (`TREASURY_BPS = 700`, `OPS_BPS = 300`).
- Create escrows where the authority is also a player (`AuthorityAsPlayer` error).
- Settle an already-settled PDA (requires `state == MatchState::Active`).
- Access or modify the GlobalConfig PDA's treasury/ops addresses without the authority signer (which they do have in this scenario, but see incident response below).

**What the system does:**

1. **Incident response:** The operator calls `pause_program` to halt all economic instructions (create, deposit, settle, cancel). The pause is enforced by the config PDA's `is_paused` flag on every economic instruction.
2. **Key rotation:** The operator calls `update_config` with a new authority pubkey. This is a single transaction updating the GlobalConfig PDA. Active escrow PDAs continue to work because the program reads authority from the config account at execution time, not at PDA creation time.
3. **Assessment:** Even in the worst case, the attacker could only settle existing active PDAs to their original players. The financial blast radius is effectively zero -- the attacker could cause incorrect winners but cannot steal funds.

**Funds outcome:** No funds can be redirected. Worst case: some matches settle to the wrong player out of the two registered players. Pausing + key rotation stops the attacker within minutes. Multisig authority is on the v1.2 roadmap to further reduce this risk.

---

## Scenario 12: Double-Settlement Attempt

**Trigger:** A race condition where two code paths (e.g., match completion and disconnect handler) both attempt to settle the same match simultaneously.

**What the system does -- Application Layer:**

1. All settlement code paths are wrapped in `withLock('settle:${roomId}', ...)`, an async mutex with a 30-second timeout. The second caller blocks until the first completes.
2. The first code path transitions the match state to `settling` via `transitionState()`. The second code path checks the state, finds it is no longer `battle`, and aborts.

**What the system does -- On-Chain Layer:**

1. The `settle_match` instruction requires `escrow.state == MatchState::Active`.
2. The instruction sets `escrow.state = MatchState::Settled` **before** any lamport transfers (defense-in-depth, OC-10).
3. A second `settle_match` call on the same PDA fails with `InvalidState` because the state is already `Settled`.
4. After settlement, the PDA is closed via Anchor's `close = authority` constraint. A third attempt would fail because the account no longer exists.

**What the players see:** Nothing unusual. Settlement happens exactly once. The locking and state checks are invisible.

**Funds outcome:** Exactly one settlement. Winner receives 90%, treasury 7%, ops 3%. The three-layer defense (application lock, on-chain state check, PDA closure) makes double-settlement structurally impossible.

---

## Scenario 13: Turn Timeout Cascade (AFK Player)

**Trigger:** A player stops taking turns during an active match. Each turn has a 60-second timeout (`TURN_TIMEOUT_MS = 60000`).

**What the system does:**

1. After 60 seconds of inactivity, the server auto-advances the turn and tracks consecutive timeouts per player.
2. After 3 consecutive timeouts by the same player, the match ends via the forfeit rule (LP-08).
3. The opponent is declared the winner. Settlement proceeds normally (90/7/3 split).

**What the players see:**

- AFK player: their turns are skipped automatically. After the third skip, they see a loss screen with "forfeit -- 3 consecutive turn timeouts."
- Active player: sees turns advancing automatically, then a win screen with settlement confirmation.

**Funds outcome:** Standard settlement to the active player.

---

## Scenario 14: Settlement Transaction Fails (RPC Error, Network Congestion)

**Trigger:** The server calls `settleMatchEscrow` but the Solana RPC returns an error (timeout, network congestion, blockhash expired).

**What the system does:**

1. The `settleMatchEscrow` call returns `{ success: false, error: '...' }`.
2. The server transitions the match to `cancelled` state (not `complete` -- SF-03 fix).
3. `handleSettlementFailure` fires: it immediately attempts a `cancelMatchEscrow` to refund both players.
4. If the cancel also fails, the match data is stored in the `failedSettlements` in-memory Map with full context (matchId, escrowPDA, both player wallets, wager amount, timestamp).
5. A retry loop runs every 60 seconds, attempting `cancelMatchEscrow` for each failed settlement. Up to 5 attempts.
6. If all 5 retries fail, the entry is logged and removed from the retry queue. The on-chain PDA remains, and Layers 2 and 3 (player cancel after 24h, permissionless reclaim after 48h) serve as the backstop.

**What the players see:**

- Both players see a "settlement processing" state, then either a successful refund notification or a message indicating the match is being resolved.

**Funds outcome:** Refund via cancel on retry, or full refund via on-chain timeout if all retries fail. No funds lost.

---

## Scenario 15: Program Paused During Active Match

**Trigger:** The operator calls `pause_program` (emergency response) while matches are in progress.

**What the system does:**

1. The `is_paused` flag is set on the GlobalConfig PDA.
2. All economic instructions (`create_match`, `deposit_wager`, `settle_match`, `cancel_match`) check `!config.is_paused` as an Anchor constraint. They will fail with `ProgramPaused` error.
3. Active matches cannot be settled or cancelled through normal paths.
4. **Permissionless reclaim is NOT gated by the pause flag.** The `permissionless_reclaim` instruction does not reference the config PDA. This is deliberate -- the emergency pause cannot lock funds permanently.
5. After the emergency is resolved, the operator calls `unpause_program` and normal settlement/cancellation resumes.

**Funds outcome:** Funds are temporarily frozen but never permanently locked. Permissionless reclaim at 48 hours is the absolute backstop regardless of pause state.

---

## Summary Table

| # | Scenario | Resolution | Funds Outcome |
|---|----------|------------|---------------|
| 1 | Disconnect mid-match (opponent winning) | 30s reconnect window, then forfeit to leader | 90/7/3 settlement to leader |
| 2 | Disconnect mid-match (disconnector winning) | 30s reconnect window, then settlement to leader | 90/7/3 settlement to disconnected player |
| 3 | Disconnect mid-match (tied) | 30s reconnect window, then refund | Full refund to both |
| 4 | Disconnect during funding | 2-min deposit timeout, cancel escrow | Full refund to depositor (if any) |
| 5 | Server crash mid-match | Settle on last known state at restart | 90/7/3 or refund if tied |
| 6 | Server crash during settlement | MongoDB `settling` state + on-chain state check prevents double-settle; retry on restart | Correct 90/7/3 settlement (exactly once) |
| 7 | Both players disconnect | Same as 1-3 based on who was winning; 24h/48h backstop if server also down | Settlement to leader or refund if tied |
| 8 | Funding timeout (one deposits) | 2-min deposit timer cancels escrow | Full refund to depositor |
| 9 | Escrow timeout (no settlement) | Player cancel after 24h; permissionless reclaim after 48h | Full refund to both |
| 10 | Insufficient SOL for fees | Deposit rejected by Solana runtime; 2-min timeout cancels | Full refund; no funds at risk |
| 11 | Key compromise | Pause, rotate key; attacker cannot redirect funds (on-chain enforcement) | No fund loss; worst case: wrong winner from original pair |
| 12 | Double-settlement attempt | Application mutex + on-chain `Active` state check + PDA closure | Exactly one settlement |
| 13 | AFK player (turn timeouts) | 3 consecutive timeouts triggers forfeit | 90/7/3 settlement to active player |
| 14 | Settlement TX fails | Immediate cancel retry, then 60s retry loop (5 attempts), then on-chain timeout backstop | Refund via cancel or 24h/48h backstop |
| 15 | Program paused mid-match | Economic instructions blocked; permissionless reclaim unaffected | Temporarily frozen; 48h backstop |

---

## Key Invariants

These properties hold across every scenario in this document:

1. **Funds never lock permanently.** Three independent recovery layers ensure this. The permissionless reclaim at 48 hours is the absolute backstop, callable by anyone, ungated by the pause mechanism.

2. **Settlement recipients are enforced on-chain.** The `settle_match` instruction requires `winner.key() == escrow.player_one || winner.key() == escrow.player_two`. No transaction, no matter who signs it, can send funds to an unregistered address.

3. **Fee math is enforced on-chain.** The 90/7/3 split is computed from hardcoded BPS constants (`TREASURY_BPS = 700`, `OPS_BPS = 300`) using u128 widened arithmetic. The winner receives the remainder after fees, eliminating dust loss.

4. **Double-settlement is structurally impossible.** Three layers prevent it: application-level async mutex (`withLock`), on-chain state requirement (`MatchState::Active`), and PDA closure after settlement.

5. **The server keypair is an authorized trigger, not an authorized destination.** A leaked keypair can only settle existing valid PDAs to their original players. It cannot redirect funds, drain accounts, or create self-dealing escrows.
