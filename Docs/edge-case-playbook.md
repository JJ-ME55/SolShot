# Edge Case & Recovery Playbook

SolShot handles real SOL in real-time multiplayer matches. This document catalogs every failure mode we have identified, what the system does in response, what the player sees, and where the funds end up. The governing design principle:

> "The server owns the physics. The chain owns the money. Neither player nor operator can cheat either."

Every scenario below resolves to one of two fund outcomes: **correct settlement** (90% winner / 7% treasury / 3% ops) or **full refund** to both players. There is no third outcome. Funds cannot be permanently locked.

---

## Three-Layer Fund Safety Net

SolShot enforces three independent layers of fund protection, each a fallback for the one above:

| Layer | Mechanism | Trigger | Who Can Call | Timeframe |
|-------|-----------|---------|--------------|-----------|
| **1. Server Recovery** | Server restarts, reads MongoDB for `settling` or `battle`-state matches with funded PDAs, settles on last known game state | Automatic on server boot | Server authority keypair | Immediate on restart |
| **2. Player Cancel** | Either player calls `cancel_match` on-chain after the PDA expiry timestamp (1 hour from activation on v1; `match_end_ts` on v2) | Manual, player-initiated | Either registered player (requires wallet signature) | After timeout elapses |
| **3. Permissionless Reclaim** | Anyone triggers `permissionless_reclaim` after 2 hours from creation (v1) or `match_end_ts + 24h` (v2). Caller receives PDA rent lamports as economic incentive | Manual, anyone can call | Any Solana wallet (only fee payer signature required) | v1: 2h; v2: match_end + 24h |

At no point in any scenario can funds be permanently locked. If the server vanishes, players recover funds. If both players vanish, anyone can recover funds within the applicable grace window.

---

## Category 1 - Gameplay Disconnects & Timeouts

### Scenario 1: Player Disconnects Mid-Match (Opponent Is Winning)

**Trigger:** Player A loses their internet connection, closes the browser, or their device crashes during an active `battle`-state match where Player B has more round wins, higher HP, or a higher score.

**What the system does:**

1. The server detects the Socket.IO disconnect event immediately.
2. A 10-minute reconnect window opens (`RECONNECT_WINDOW_MS = 600000`). The server stores Player A's session in `pendingReconnects` keyed by wallet address.
3. If Player A reconnects within the window, their new socket is mapped to the old player slot. The match resumes seamlessly. Opponent sees a "reconnected" notification.
4. If the window expires without reconnect, the server fires `cleanupRoom` with reason `reconnect_timeout`.
5. The server evaluates game state using a tiered decision chain: round wins first, then HP, then score.
6. Because Player B is ahead, Player B is declared the winner.
7. The server transitions the match to `settling` state (preventing double-settlement) and calls `settleMatchEscrow` with Player B's wallet as the winner.

**What the players see:**

- Player A (disconnected): sees nothing during the window. If they return to the app later, they see a loss result.
- Player B (remaining): sees an "opponent disconnected" banner with a countdown, followed by a win screen with settlement confirmation.

**Funds outcome:** Standard settlement - Player B receives 90% of the pot. Treasury receives 7%. Ops receives 3%. PDA is closed.

---

### Scenario 2: Player Disconnects Mid-Match (Disconnected Player Is Winning)

**Trigger:** Player A disconnects while leading on round wins, HP, or score.

**What the system does:**

1. Same 10-minute reconnect window as Scenario 1.
2. If no reconnect, the server evaluates the tiered decision chain (`roundWins -> HP -> scores`).
3. Because Player A was ahead, Player A is declared the winner despite being the one who disconnected.

**What the players see:**

- Player A (disconnected, winning): receives settlement to their wallet. If they return to the app, they see a win result.
- Player B (remaining, losing): sees the "opponent disconnected" countdown, then a loss screen with the settlement confirmation showing funds went to Player A.

**Funds outcome:** Standard settlement - Player A (disconnected but winning) receives 90%. This prevents the exploit where a losing player intentionally disconnects to deny the leader their payout.

---

### Scenario 3: Player Disconnects Mid-Match (Genuinely Tied)

**Trigger:** Player A disconnects while both players have identical round wins, identical HP (default 250 each if no damage dealt yet), and identical scores.

**What the system does:**

1. Same 10-minute reconnect window.
2. If no reconnect, the server evaluates the decision chain: rounds equal, HP equal, scores equal.
3. The `shouldRefund` flag is set to `true`.
4. The server calls `cancelMatchEscrow` instead of `settleMatchEscrow`, refunding both players their full wager.

**What the players see:**

- Player B (remaining): sees the disconnect countdown, then a "match cancelled - refund issued" message.
- Player A (disconnected): receives their full wager back to their wallet.

**Funds outcome:** Full refund to both players. PDA is closed. No fees charged.

---

### Scenario 4: Player Disconnects During Funding

**Trigger:** The escrow PDA has been created on-chain, deposit transactions have been sent to both players, and Player A disconnects before submitting their deposit within the 2-minute funding window (`DEPOSIT_TIMEOUT_MS = 120000`).

**What the system does:**

1. If Player A disconnects before either player deposits, the room is immediately removed. The `depositTimers` countdown is cleared. On-chain, the PDA exists but holds zero SOL. The server calls `cancelMatchEscrow` to close the empty PDA.
2. If Player B has already deposited but Player A has not, the 2-minute deposit timer continues running.
3. When the timer expires, the server checks deposit status. Only one deposit confirmed means an incomplete funding state.
4. The server calls `cancelMatchEscrow`, which refunds Player B's full deposit and closes the PDA.
5. Both players receive the `escrowDepositTimeout` event.

**What the players see:**

- Player B (deposited): sees a "deposit timeout - refund issued" message. Their SOL is returned in full.
- Player A (disconnected, did not deposit): loses nothing - they never deposited.

**Funds outcome:** Full refund to Player B. Player A never deposited, so they lose nothing. PDA is closed.

---

### Scenario 5: Server Crashes Mid-Match

**Trigger:** The Node.js server process crashes (unhandled exception, OOM kill, host restart) while two players are in an active `battle`-state match with a funded escrow PDA.

**What the system does:**

1. Both players lose their Socket.IO connections immediately.
2. The match state in MongoDB reflects the last persisted state (status `battle` with player scores, HP, and round data).
3. **No resume.** This is a deliberate design decision - resuming a crashed match requires reconnecting both players, restoring exact game state, and syncing clocks, which introduces unacceptable complexity.
4. **Layer 1 (Server Recovery):** When the server restarts, it queries MongoDB for matches in `battle` or `settling` states. For each, it evaluates last known game state and settles to the player who was winning at the time of the crash.
5. If game state was genuinely even at crash time, the server issues a refund via `cancelMatchEscrow`.

**What the players see:**

- Both players see the game freeze, then a connection-lost screen. When they next open the app, the result is already settled.

**Funds outcome:** Settlement based on last known state. Winner (at time of crash) receives 90%. If tied, full refund to both.

---

### Scenario 6: Server Crashes During Settlement

**Trigger:** The server determines a winner, transitions the MongoDB match to `settling`, submits the `settle_match` transaction to Solana, and crashes before receiving the on-chain confirmation.

**What the system does:**

1. The `settling` state in MongoDB is the critical sentinel. It means "a settlement transaction has been submitted but not confirmed."
2. **On restart,** the server finds matches in `settling` state.
3. Before resubmitting, it checks on-chain whether the PDA still exists and what state it is in:
   - If the PDA is already closed (state `Settled`), the original transaction landed successfully. The server updates MongoDB to `complete`. No double-settlement occurs.
   - If the PDA still exists in `Active` state, the original transaction failed or was dropped. The server resubmits settlement.
4. The on-chain program provides a second guard: `settle_match` requires `state == MatchState::Active`. If the PDA is already in `Settled` state, the instruction fails with `InvalidState`. Double-settlement is structurally impossible.

**Funds outcome:** Correct settlement. The `settling` state in MongoDB plus the `MatchState::Active` requirement on-chain make double-settlement impossible at both the application layer and the program layer.

---

### Scenario 7: Both Players Disconnect

**Trigger:** Both Player A and Player B lose their connections simultaneously (e.g., the game lobby server goes down, both on the same network that fails).

**What the system does:**

1. Two disconnect events fire in rapid succession. Each triggers its own 10-minute reconnect window.
2. If one player reconnects within the window, the match can continue (the other player's timer is still running).
3. If neither reconnects within the window, the first timer to expire triggers `cleanupRoom` with `reconnect_timeout`.
4. The server evaluates game state using the same decision chain (round wins, HP, score). Settlement or refund proceeds normally.
5. The second disconnect timer fires but finds the room already removed - it no-ops safely.

**Funds outcome:** Settlement to the leader, or full refund if tied.

**Backstop if the server is also down:** If the server is unable to process the disconnect timers (because the server itself is down), Layers 2 and 3 activate. Either player can call `cancel_match` after the timeout period. Anyone can call `permissionless_reclaim` after the applicable grace window.

---

### Scenario 8: Funding Timeout (One Player Deposits, Other Does Not)

**Trigger:** Both players receive `escrowDeposit` events with deposit transactions. Player A signs and submits their deposit. Player B never signs. The 2-minute `DEPOSIT_TIMEOUT_MS` countdown expires.

**What the system does:**

1. The `depositTimers[roomId]` fires after 120 seconds.
2. The server checks `wsCheck.deposits` for both host and player socket IDs. Only one deposit is confirmed.
3. The server calls `cancelMatchEscrow(roomId, p1wallet, p2wallet)`.
4. On-chain, the PDA is in `AwaitingDeposits` state. The `cancel_match` instruction refunds the depositor their full wager amount and closes the PDA.
5. The room is removed. Both players receive `escrowDepositTimeout`.

**Funds outcome:** Full refund to the depositor. The non-depositor never had funds at risk. Zero funds lost.

---

### Scenario 9: Escrow Timeout (Settlement Never Happens)

**Trigger:** A match completes (or the server crashes and never recovers), but no settlement transaction is ever submitted. The on-chain PDA sits in `Active` state with both players' SOL locked.

**Layer 2 (Player Cancel):**

Either player signs a `cancel_match` transaction after the per-version timeout has elapsed. The program refunds both players their full wager and closes the PDA.

**Layer 3 (Permissionless Reclaim):**

After the applicable grace window, anyone can call `permissionless_reclaim`. The caller only needs to pay the transaction fee and receives the PDA's rent-exempt lamports as incentive.

**What about the settlement deadline?**

The on-chain `settle_match` instruction enforces `SETTLEMENT_TIMEOUT_SECONDS = 3600` (v1, post-fix). After 1 hour from match activation, the server can no longer settle - only cancel or await permissionless reclaim. This prevents a compromised server from settling a stale match days later with a fabricated winner.

**Funds outcome:** Full refund to both players via whichever layer activates first.

---

### Scenario 10: Wallet Has Insufficient SOL for Fees

**Trigger:** A player's wallet has exactly enough SOL for the wager but not enough to cover Solana transaction fees.

**What the system does:**

1. The client builds the deposit transaction with the player as `feePayer`.
2. When the player attempts to sign and submit, the Solana runtime rejects the transaction with an insufficient funds error.
3. The deposit never lands on-chain. From the server's perspective, this player simply never deposited.
4. The 2-minute deposit timeout fires. The server cancels the escrow and refunds the other player (if they deposited).

**Funds outcome:** Player A never deposited, so they lose nothing. Player B receives a full refund. The server authority keypair pays all settlement and cancellation transaction fees - players never pay fees for settlement.

---

### Scenario 13: Turn Timeout Cascade (AFK Player)

**Trigger:** A player stops taking turns during an active 1v1 lobby match. Each turn has a 10-minute timeout (`TURN_TIMEOUT_MS = 600000`). Group-chat matches use their own per-config turn timer (default 12 hours, host-set).

**What the system does:**

1. After the turn timer elapses, the server auto-advances the turn and tracks consecutive timeouts per player.
2. After 3 consecutive timeouts by the same player, the match ends via the forfeit rule.
3. The opponent is declared the winner. Settlement proceeds normally (90/7/3 split).

**Funds outcome:** Standard settlement to the active player.

---

### Scenario 14: Settlement Transaction Fails (RPC Error, Network Congestion)

**Trigger:** The server calls `settleMatchEscrow` but the Solana RPC returns an error (timeout, network congestion, blockhash expired).

**What the system does:**

1. The `settleMatchEscrow` call returns `{ success: false, error: '...' }`.
2. The server transitions the match to `cancelled` state.
3. `handleSettlementFailure` fires: it immediately attempts a `cancelMatchEscrow` to refund both players.
4. If the cancel also fails, the match data is stored in the `failedSettlements` in-memory Map with full context (matchId, escrowPDA, both player wallets, wager amount, timestamp).
5. A retry loop runs every 60 seconds, attempting `cancelMatchEscrow` for each failed settlement. Up to 5 attempts.
6. If all 5 retries fail, the entry is logged and removed from the retry queue. On-chain Layers 2 and 3 serve as the backstop.

**Diagnose:** Query `GET /admin/failed-settlements` (admin-guarded) or search logs for `failedSettlements`. Each entry contains matchId, PDA address, both player wallets, and wager amount.

**Workaround:** Manually invoke the admin retry endpoint or wait for the on-chain grace window.

**Funds outcome:** Refund via cancel on retry, or full refund via on-chain timeout if all retries fail. No funds lost.

---

### Scenario 15: Program Paused During Active Match

**Trigger:** The operator calls `pause_program` (emergency response) while matches are in progress.

**What the system does:**

1. The `is_paused` flag is set on the GlobalConfig PDA.
2. All new-commitment instructions (`create_match`, `deposit_wager`) check `!config.is_paused` and fail with `ProgramPaused`.
3. **v2 posture (post-fix):** `cancel_match`, `settle_match`, and `start_with_depositors` do NOT check the pause flag on v2. In-flight funds can always exit.
4. **v1 posture (post-fix):** Same - v1 pause guard was removed from `CancelMatch`, `SettleMatch`, and `StartWithDepositors` structs in the 2026-05-07 fix bundle (H016/H009 fix). Both programs now share the v2 posture.
5. **Permissionless reclaim is NOT gated by the pause flag** on either version. This is deliberate - the emergency pause cannot lock funds permanently.
6. After the emergency is resolved, the operator calls `unpause_program` and normal operation resumes. Both events now emit `Paused`/`Unpaused` events on-chain for monitoring.

**Funds outcome:** Funds are temporarily blocked from new entry but can still exit. Permissionless reclaim at the applicable grace window is the absolute backstop regardless of pause state.

---

## Category 2 - Authentication & Identity

### Edge Case A1: Wallet Rotation (Privy Re-Provisioning)

**What goes wrong:** Settlement goes to a wallet the user no longer controls.

**Root cause:** `server/services/users.js:91` - the wallet address is stored with `if (walletAddress && !existingByTg.walletAddress)` - only writes if currently null, never updates. Privy can silently re-provision an embedded wallet (SDK upgrade, account recovery, key rotation). DB retains the stale address. Settlement at `lifecycle.js:851` reads from DB and settles to the old address.

**Diagnose:**
- Log pattern: search server logs for `"settling to wallet"` - compare the wallet printed against the player's current Privy dashboard wallet.
- Query: `db.users.findOne({telegramUserId: VICTIM_TG_ID})` - check `walletAddress` against what Privy's dashboard shows.
- On-chain: use `solana account <PDA>` to confirm where the SOL went.

**Workaround (NOW):**
1. Identify the old and new wallet addresses via Privy dashboard.
2. Manually update MongoDB: `db.users.updateOne({telegramUserId: X}, {$set: {walletAddress: NEW_WALLET}})`.
3. If the stale wallet still has the SOL (settlement has not yet occurred), reach out to the player and have them use the old wallet to receive it, or coordinate with Privy to confirm key custody.
4. If settlement already went to the stale address and the player no longer controls it, this is an unrecovered loss on v1. Document and escalate.

**Long-term fix:** Bundle B - `updateWalletForTgUser()` helper with versioned audit trail; Privy SDK event listener for wallet rotation. Timeline: pre-mainnet.

**Pre-mainnet status:** ACCEPT with monitoring. Document and flag every case where `walletAddress` is set on a non-null existing record.

---

### Edge Case A2: Privy Session Expired Mid-Match

**What goes wrong:** Player's Privy session expires during an active wagered match. When the server tries to send an `escrowDeposit` or re-auth event, the client cannot sign new transactions.

**Root cause:** Privy embedded wallet sessions have a finite lifetime. The app relies on Privy's SDK for wallet access; if the session token expires, `signTransaction` throws.

**Diagnose:**
- Client-side: look for console errors from the Privy SDK (`"User is not authenticated"`, `"Session expired"`).
- Server-side: deposit timeout fires after 2 minutes with no confirmation from this player.

**What the player sees:** The deposit or action modal may hang or show an error. On wagered matches, the 2-minute deposit timeout fires and refunds the opponent if they had already deposited.

**Workaround (NOW):** The client-side auth-reset-on-reconnect flow handles automatic re-authentication. If the player dismisses the re-auth prompt or it fails, they must manually refresh the app, re-authenticate with Privy, and rejoin. The reconnect window may have already elapsed, so the match may be resolved before they can return.

**Long-term fix:** Proactive session refresh before match start; extend deposit window with explicit "signing in" state in the UI. Bundle C.

---

### Edge Case A3: Telegram WebView vs Standalone Safari

**What goes wrong:** Features that work in the Telegram in-app browser (WebView) fail silently in standalone Safari, or vice versa.

**Root cause:** The two runtime environments expose different JavaScript APIs, different Privy wallet initialization behavior, and different socket connection handling.

**Known differences:**
- Privy embedded wallet creation works in Telegram WebView. In standalone Safari, the embedded wallet creation modal may behave differently due to popup restrictions.
- Socket.IO `websocket` transport may fall back to `polling` in restricted TG WebView environments.
- `window.open` calls (wallet confirmation popups) are blocked in Telegram WebView by default.

**Diagnose:**
- Reproduce the failure in both environments.
- Check browser/TG user agent string in server logs.
- Console logs from the client will indicate if Privy SDK initialization fails or falls back.

**Workaround (NOW):** Direct users experiencing issues to use the canonical URL in their default browser rather than the in-app TG browser if critical features are broken.

**Long-term fix:** Audit all wallet interaction flows for WebView compatibility. Add a runtime environment detection check and degrade gracefully. Bundle C.

---

## Category 3 - Refund & Settlement Failures

### Edge Case R1: Refund Failure - H023 Desync (DB H014)

**What goes wrong:** `cancel_match` (or `permissionless_reclaim`) is called on-chain but reverts with `IncompleteRefund`. Server reports the cancel succeeded. Funds remain locked in the escrow PDA.

**Root cause:** `server/services/lifecycle.js:896-910` and `server/socket-io/main.js:433-512`. The SOS H023 on-chain fix requires `remaining_accounts.len() == count_ones(deposits_mask)` on-chain. But the server builds `remaining_accounts` from off-chain state (`wagerStates[roomId].deposits` for v1; `player.initialDepositTx` for v2), NOT from the on-chain `deposits_mask`. Any desync - server restart, partial memory loss, race condition in `confirmDeposit` - causes the array to be too short. The on-chain length-check then fires `IncompleteRefund` and reverts. Server's `refundWager()` then falls through to `{success:true}` anyway (DB H013), masking the failure.

**Diagnose:**
- Log pattern: search for `IncompleteRefund` in server logs.
- Query on-chain: `solana account <ESCROW_PDA>` - if it still exists and has lamports after a reported refund, the cancel reverted.
- Cross-check: compare `deposits_mask` (on-chain, decimal bit count) against `remaining_accounts.length` in the cancel TX.

**Workaround (NOW):**
1. The permissionless reclaim grace window provides ultimate backstop:
   - v1: 2 hours from PDA creation (`PERMISSIONLESS_RECLAIM_TIMEOUT = 7200s`).
   - v2: `match_end_ts + 86400s` (24 hours).
2. Until that window, the server-cancel may keep failing. Monitor the PDA.
3. If the `deposits_mask` is contiguous, the authority can call `start_with_depositors` first to ensure the mask state is clean, then `cancel_match` with the correct full `remaining_accounts` array built from on-chain mask.
4. After the grace window, `permissionless_reclaim` will work regardless because it's callable by anyone.

**Long-term fix:** Bundle A - `getEscrowState(matchId)` call before refund builder; use on-chain `deposits_mask` as source of truth, not off-chain state.

---

### Edge Case R2: Non-Contiguous Deposit Mask (H024 NOVEL)

**What goes wrong:** Refund fails on-chain with `IncompleteRefund` or `InvalidPlayer`. Server logs `UNRECOVERABLE` and drops the match. Funds are stranded in the PDA.

**Root cause:** `programs/solshot-escrow/src/lib.rs:393-410` (v1), `programs/solshot-escrow-v2/src/lib.rs:502-518` (v2). The refund loop uses `enumerate()` to generate monotonic indices `i=0,1,2,...`. Each step requires `(deposits_mask >> i) & 1 == 1`. If `deposits_mask = 0b0010` (player 1 deposited, player 0 did not), the loop fails at `i=0` regardless of what accounts are passed, because bit 0 is unset.

This arises any time a higher-indexed player deposits before a lower-indexed one - a 50% chance in a 2-player match under normal network latency variation. The H023 fix (requiring `remaining_accounts.len() == count_ones(mask)`) closes the theft angle but does not help with the stuck-funds angle.

**Diagnose:**
- Server log: search for `"UNRECOVERABLE"` and `"non_contiguous_deposits"` in `cancelEscrowSafely()`.
- Compute: `mask.toString(2)` - look for any `0` bit below the highest set bit (e.g., `0b1010` has a gap at bit 1).

**Workaround (NOW):**
1. **Authority-driven rescue path:** The authority calls `start_with_depositors` while the match is still in `AwaitingDeposits` state. This instruction compacts deposited slots to contiguous positions starting at index 0 and sets state to `Active`.
2. After compaction, `deposits_mask` is contiguous (e.g., `0b0001`), so the standard cancel or reclaim path works once the timeout elapses.
3. **Timing constraint (v1):** `start_with_depositors` now has a `MIN_DEPOSIT_WINDOW_SECS = 600` gate - must wait at least 10 minutes from `created_at` before calling (H017 fix).
4. **Timing constraint (v2):** Must call after `deposit_deadline` has elapsed.
5. After compaction and the subsequent Active timeout, either player or the permissionless reclaim window will refund correctly.
6. If the authority is unavailable, funds are stranded until the permissionless reclaim window (v1: 2h; v2: match_end + 24h). At that point `permissionless_reclaim` with correct `remaining_accounts` (built from the compacted on-chain mask) will work.

**Long-term fix:** Bundle 2 (SOS) / Bundle A (DB) - refactor refund loop to accept caller-supplied `player_indices: Vec<u8>` so non-contiguous masks can be refunded without authority rescue. Requires IDL + client + server changes.

---

## Category 4 - Match Lifecycle (Group-Chat Specific)

### Edge Case M1: Group-Chat Double-Settle Race (DB H015)

**What goes wrong:** Win credit appears twice in player stats, OR the settlement transaction is submitted twice (second one fails on-chain with `AlreadySettled` / `InvalidState`).

**Root cause:** `server/services/groupchat/lifecycle.js:804, 1039`. Three async paths (`handleShot`, `handleForfeit`, `handleIdleTimeout`) each call `checkAndSettle()`. The function reads `match.state !== 'active'` from the in-memory Mongoose document. Under concurrent execution, both callers can pass the guard before either save completes. The on-chain program rejects the second TX with `InvalidState`, but the server has already emitted double `matchSettled` and double `pushMatchHistory` events - stats are double-credited.

**Diagnose:**
- Log pattern: search for duplicate `matchSettled` events for the same `matchId` within a short time window.
- DB check: `db.matches.findOne({matchId: X})` - if `state === 'settled'` but there are two `pushMatchHistory` records, double-credit occurred.
- On-chain: check TX history for the PDA - a second failed settle TX will appear.

**Workaround (NOW):**
1. Identify the affected player(s) via duplicate `pushMatchHistory` records.
2. Run the reconcile script (once written) to correct stats. Manual correction for now: `db.users.updateOne({..}, {$inc: {wins: -1, totalWinnings: -AMOUNT}})`.
3. On-chain SOL is safe - the second settle TX failed, so funds were only transferred once.

**Long-term fix:** Bundle A - convert `checkAndSettle()` to use `findOneAndUpdate({state:'active'},{state:'settling'})` as a compare-and-swap gate. If the returned document is null (another caller already transitioned state), abort cleanly.

---

### Edge Case M2: Group-Chat `confirmDeposit` Overwrite Race (DB H016)

**What goes wrong:** Match stalls in `awaiting_deposits` indefinitely despite both players having confirmed on-chain. One player's deposit is never reflected in MongoDB.

**Root cause:** `server/services/groupchat/lifecycle.js:262-274`. Two simultaneous `confirmDeposit` calls each do `findOne()` → mutate their own player slot → `save()`. The second `save()` overwrites the entire document, erasing the first depositor's `initialDepositTx`. Server believes only one player deposited. The match never transitions to `active`.

**Diagnose:**
- Log pattern: search for `confirmDeposit` events for the same `matchId` arriving within milliseconds of each other.
- DB check: `db.matches.findOne({matchId: X}).players` - count how many have non-null `initialDepositTx`.
- On-chain: check the PDA's `deposits_mask` - if it shows 2 deposits but DB shows 1, the overwrite occurred.

**Workaround (NOW):**
1. Cancel the match and recreate: server admin can call `cancelMatchEscrow` for the stalled PDA (the on-chain state is healthy - both deposits landed). Both players receive full refunds.
2. The players then recreate the group match from scratch.

**Long-term fix:** Bundle A - refactor `confirmDeposit` to use `findOneAndUpdate` with `$set` on the specific player array slot: `findOneAndUpdate({_id: X, 'players.idx.tx': null}, {$set: {'players.idx.tx': txSig}})`. Returns null on duplicate - idempotent and race-safe.

---

## Category 5 - RPC & Network

### Edge Case N1: Single RPC Failure (DB H049)

**What goes wrong:** Balance checks, deposit confirmations, and settlement calls all fail simultaneously. Server queues failures in the `failedSettlements` Map. If the RPC outage persists long enough, retry exhaustion occurs and matches are left to the on-chain grace windows.

**Root cause:** `server/services/solana.js` uses a single `Connection` pointed at one RPC endpoint (no fallback). Any outage - Helius downtime, RPC rate limiting, temporary Solana mainnet congestion - causes all Solana calls to fail.

**Diagnose:**
- Log pattern: bursts of `Error: failed to send transaction`, `429 Too Many Requests`, or `FetchError` in server logs, all arriving within the same short window.
- Check `failedSettlements.size` via admin endpoint or log.
- Cross-check against RPC provider status page (Helius/QuickNode/Triton).

**Workaround (NOW):**
1. Monitor `failedSettlements` Map via the admin endpoint.
2. If the RPC recovers, the 60-second retry loop will process queued entries automatically (up to 5 attempts per entry).
3. If the RPC stays down and retry limit is reached, the on-chain grace windows handle player recovery:
   - Layer 2: player cancel after timeout.
   - Layer 3: permissionless reclaim after grace window.
4. For any match that has exceeded 5 retry attempts, manually trigger via the admin endpoint once RPC recovers.

**Long-term fix:** Bundle C (DB) - add fallback RPC endpoint and health check. Rotate connections on failure. Use exponential backoff on transient errors. Timeline: pre-mainnet.

---

### Edge Case N2: RPC 429 Rate Limiting (DB H050)

**What goes wrong:** RPC calls fail silently with `429 Too Many Requests`. No retry logic exists. Dependent operations (balance check, deposit confirmation, settlement) fail and may not surface clearly in logs.

**Root cause:** `server/services/solana.js` - all RPC calls go out immediately with no backoff wrapper. Under load (many concurrent matches confirming deposits), the free-tier RPC rate limit is hit.

**Diagnose:**
- Log pattern: `429` or `rate limit` in RPC response error text.
- Timing: correlates with match-creation spikes or high-concurrency periods.

**Workaround (NOW):** Same as N1 above - monitor `failedSettlements`, rely on retry loop and on-chain grace windows.

**Long-term fix:** Bundle C - exponential backoff wrapper around all `connection.send*` / `connection.get*` calls. Consider upgrading to a paid RPC tier before mainnet.

---

## Category 6 - Database

### Edge Case D1: MongoDB Connection Drop (DB H039)

**What goes wrong:** Requests hang silently for an extended period. Socket.IO handlers that make DB queries appear to stall. No errors are logged initially.

**Root cause:** Mongoose `bufferCommands: true` (the default). When MongoDB is unreachable, Mongoose buffers all pending operations instead of failing immediately. From the server's perspective, every DB call is pending. Match state transitions never complete. Socket events time out on the client side.

**Diagnose:**
- Log pattern: no Mongoose errors initially. After the buffer timeout (~30 seconds), logs will show `MongoNetworkError` or `buffering timed out after X ms`.
- Check MongoDB Atlas / MongoDB host status page.
- Server health endpoint: `GET /health` - if it returns but match operations are stuck, the DB is buffering.

**Workaround (NOW):**
1. Restart the server. On reconnect, Mongoose flushes its buffer and attempts to resume normal operation.
2. If the MongoDB outage persists, no match state changes are persisted. Matches in memory continue, but crashes during the outage result in unrecoverable memory loss.
3. Any in-flight settlements that required DB writes (status transitions, history records) will need manual reconciliation after DB recovery.

**Long-term fix:** Bundle C - set `bufferCommands: false` and add explicit Mongoose reconnect handling with error event listeners. Surface DB connection health to `/health` endpoint. Consider MongoDB Atlas connection resilience best practices.

---

## Category 7 - Server Operations

### Edge Case O1: Server Keypair Rotation

**Trigger:** The server keypair (`SOLANA_SERVER_KEYPAIR_PATH` / `SOLANA_KEYPAIR_JSON`) needs rotation due to suspected compromise, scheduled rotation policy, or key loss.

**What goes wrong without procedure:** Settlement and cancel calls fail immediately (new key is not the registered `config.authority`). All in-flight matches cannot be settled by the server. Players must wait for on-chain grace windows.

**Procedure (the right sequence):**

1. **Stop accepting new matches.** Set an environment flag or take the server offline briefly to prevent new escrow PDAs from being created.
2. **Settle or cancel all in-flight matches.** Using the OLD keypair, manually settle any `battle`-state matches and cancel any `awaiting_deposits`-state matches. Verify `failedSettlements` is empty.
3. **Stop the server.**
4. **Replace the keypair file.** Update the `SOLANA_SERVER_KEYPAIR_PATH` file on the server host, OR update the `SOLANA_KEYPAIR_JSON` environment variable in Render's dashboard with the new keypair JSON.
5. **Call `update_config` on-chain** using the OLD authority keypair (the one being rotated out), setting the new authority to the new pubkey. This is a single transaction updating the GlobalConfig PDA. Format: `update_config { new_authority: NEW_PUBKEY }`.
6. **Restart the server.** The new keypair is now the recognized `config.authority`. New matches will settle correctly.
7. **Verify** by checking the GlobalConfig PDA: `solana account 92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4` - confirm the `authority` field matches the new pubkey.

**Important constraints:**
- No on-chain rotation is possible without calling `update_config` with the OLD keypair first (H001 is still open - there is no two-step propose/accept mechanism). This means you must not lose the old keypair before completing the rotation.
- After rotation, existing escrow PDAs (if any) continue to work because the program reads `config.authority` at execution time, not at PDA creation time.
- `update_config` itself has no timelock pre-mainnet (H002/H032 deferred). The rotation takes effect immediately.

**Long-term fix:** Bundle 1 (SOS) - add `propose_authority` + `accept_authority` instructions with a 24h timelock on config changes. Timeline: pre-mainnet.

---

### Edge Case O2: Telegram Bot Rate Limiting (DB H056)

**What goes wrong:** Telegram `sendMessage` calls are silently dropped. Players in group-chat matches don't receive match notifications, deposit prompts, or result messages. The server believes messages were sent.

**Root cause:** `server/services/bot.js` - `bot.telegram.sendMessage()` is called directly with no queue or backoff. Under load (many active group matches), the Telegram Bot API's per-bot rate limit (30 messages/second, 20 messages/minute to the same chat) is hit and requests return 429 without triggering any server-side error handling.

**Diagnose:**
- Log pattern: `429 Too Many Requests` in bot service logs (if logged - currently they may be swallowed).
- Symptom: players report not receiving messages but match state progresses normally on server.
- Correlation: appears under high-concurrency group chat usage.

**Workaround (NOW):**
1. Monitor server logs for `429` patterns from the Telegram API.
2. If messages are being dropped, the only immediate workaround is to reduce concurrent group match volume or manually send critical information (e.g., deposit TX) via a separate channel.
3. Players can still interact via the web app even if Telegram notifications fail.

**Long-term fix:** Bundle C - wrap `bot.telegram.sendMessage` with a queue and exponential backoff (e.g., `p-queue` or a simple in-process ring buffer). Rate-limit per chat independently to respect Telegram's per-chat limits.

---

## Key Invariants

These properties hold across every scenario in this document:

1. **Funds never lock permanently.** Three independent recovery layers ensure this. The permissionless reclaim at the applicable grace window is the absolute backstop, callable by anyone, ungated by the pause mechanism.

2. **Settlement recipients are enforced on-chain.** The `settle_match` instruction requires `winner.key() == escrow.player_one || winner.key() == escrow.player_two`. No transaction, no matter who signs it, can send funds to an unregistered address.

3. **Fee math is enforced on-chain.** The 90/7/3 split is computed from hardcoded BPS constants (`TREASURY_BPS = 700`, `OPS_BPS = 300`) using u128 widened arithmetic. The winner receives the remainder after fees, eliminating dust loss.

4. **Double-settlement is structurally impossible.** Three layers prevent it: application-level async mutex (`withLock`), on-chain state requirement (`MatchState::Active`), and PDA closure after settlement.

5. **The server keypair is an authorized trigger, not an authorized destination.** A leaked keypair can only settle existing valid PDAs to their original players. It cannot redirect funds, drain accounts, or create self-dealing escrows (the `AuthorityAsPlayer` constraint blocks it).

6. **Pause cannot permanently lock funds.** Both v1 and v2 (post-fix) allow settle, cancel, and permissionless_reclaim regardless of pause state. Pause only gates new commitments (create_match, deposit_wager).

---

## Summary Table

| # | Scenario | Resolution | Funds Outcome |
|---|----------|------------|---------------|
| 1 | Disconnect mid-match (opponent winning) | 10-minute reconnect window, then forfeit to leader | 90/7/3 settlement to leader |
| 2 | Disconnect mid-match (disconnector winning) | 10-minute reconnect window, then settlement to leader | 90/7/3 settlement to disconnected player |
| 3 | Disconnect mid-match (tied) | 10-minute reconnect window, then refund | Full refund to both |
| 4 | Disconnect during funding | 2-min deposit timeout, cancel escrow | Full refund to depositor (if any) |
| 5 | Server crash mid-match | Settle on last known state at restart | 90/7/3 or refund if tied |
| 6 | Server crash during settlement | MongoDB `settling` state + on-chain state check prevents double-settle; retry on restart | Correct 90/7/3 settlement (exactly once) |
| 7 | Both players disconnect | Same as 1-3 based on who was winning; grace-window backstop if server also down | Settlement to leader or refund if tied |
| 8 | Funding timeout (one deposits) | 2-min deposit timer cancels escrow | Full refund to depositor |
| 9 | Escrow timeout (no settlement) | Player cancel after timeout; permissionless reclaim after grace window | Full refund to both |
| 10 | Insufficient SOL for fees | Deposit rejected by Solana runtime; 2-min timeout cancels | Full refund; no funds at risk |
| 11 | Key compromise | Pause, rotate key (see O1 procedure); attacker cannot redirect funds (on-chain enforcement) | No fund loss; worst case: wrong winner from original pair |
| 12 | Double-settlement attempt | Application mutex + on-chain `Active` state check + PDA closure | Exactly one settlement |
| 13 | AFK player (turn timeouts) | 3 consecutive timeouts triggers forfeit | 90/7/3 settlement to active player |
| 14 | Settlement TX fails | Immediate cancel retry, then 60s retry loop (5 attempts), then on-chain grace window backstop | Refund via cancel or grace window |
| 15 | Program paused mid-match | New commitments blocked; settle/cancel/reclaim unaffected (post-fix posture) | Temporarily frozen for new entries; in-flight funds can exit |
| A1 | Wallet rotation (Privy re-provision) | Manual DB update; ACCEPT pre-mainnet | Settlement may go to stale wallet; manual recovery |
| A2 | Privy session expired mid-match | Client re-auth flow; deposit timeout refunds opponent | Full refund if deposit missed |
| A3 | TG WebView vs standalone Safari | Degrade gracefully; direct to default browser | No funds at risk; UX degradation |
| R1 | Refund failure - H023 desync | Wait for permissionless reclaim grace window; authority can rescue via start_with_depositors | Full refund after grace window |
| R2 | Non-contiguous deposit mask | Authority calls start_with_depositors to compact, then cancel; or wait for permissionless reclaim | Full refund after rescue or grace window |
| M1 | Group-chat double-settle race | On-chain rejects second settle; stats need manual reconcile | SOL settled once correctly; stats reconcile needed |
| M2 | Group-chat confirmDeposit overwrite | Cancel + recreate match | Full refund; match restartable |
| N1 | Single RPC failure | Retry loop; on-chain grace windows as backstop | No funds lost; delayed recovery |
| N2 | RPC 429 rate limiting | Same as N1 | No funds lost; delayed recovery |
| D1 | MongoDB connection drop | Restart server; manual reconcile after DB recovery | No funds at risk on-chain |
| O1 | Server keypair rotation | Follow documented procedure (stop, settle, replace, update_config, restart, verify) | No fund risk if procedure followed |
| O2 | Telegram bot rate limiting | Monitor for 429s; players use web app as fallback | No funds at risk; UX degradation |

---

## Deferred Edge Cases - Pre-Mainnet Required

The following edge cases have no current workaround beyond documentation and monitoring. They are all deferred to pre-mainnet hardening bundles.

| ID | Risk | Status | Bundle |
|----|------|--------|--------|
| SOS H001 | One-step authority transfer (no timelock) | ACCEPT pre-mainnet; propose/accept instructions needed | SOS Bundle 1 |
| SOS H003 | Authority winner-selection fraud | ACCEPT pre-mainnet; VRF/commit-reveal long-term | SOS Bundle 4 |
| DB H004 | 5-min auth signature replay window | ACCEPT pre-mainnet; replay store needed | DB Bundle 2 |
| SOS H024 + DB H014 | Non-contiguous mask + server desync compound | ACCEPT; authority rescue path documented above | SOS Bundle 2 + DB Bundle 3 |
| SOS H044 / DB H012 | Single hot wallet for upgrade + application authority | ACCEPT; Squads multisig migration pre-mainnet | SOS Bundle 1 / DB Bundle 2 |

For full attack walkthroughs and CVSS scores, see `.audit/FINAL_REPORT.md` (SOS on-chain audit) and `.bulwark/FINAL_REPORT.md` (DB off-chain audit). For the remediation decision log, see the SOS remediation log and the DB remediation log.
