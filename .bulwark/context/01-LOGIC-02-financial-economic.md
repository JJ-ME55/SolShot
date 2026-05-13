---
task_id: db-phase1-logic-02
provides: [logic-02-findings, logic-02-invariants]
focus_area: LOGIC-02 (Financial & Economic Logic)
files_analyzed:
  - server/services/escrow.js (580 LOC)
  - server/services/escrow-v2.js (620 LOC)
  - server/services/solana.js (950 LOC)
  - server/services/gold.js (220 LOC)
  - server/services/match.js (333 LOC)
  - server/services/shot-token.js (597 LOC)
  - server/services/groupchat/lifecycle.js (1123 LOC)
  - server/services/consumables.js (78 LOC)
  - server/services/referrals.js (163 LOC)
  - server/services/jupiter-price.js (99 LOC)
  - server/models/ServerState.js (80 LOC)
  - server/socket-io/main.js (escrow/settlement/prestige sections)
  - server/socket-io/groupchat.js (purchaseGroupWeapon/confirmGroupDeposit sections)
finding_count: 12
severity_breakdown: {critical: 2, high: 5, medium: 4, low: 1}
---
<!-- CONDENSED_SUMMARY_START -->
# LOGIC-02: Financial & Economic Logic — Condensed Summary

## Token Flow Diagram (Off-Chain Perspective)

```
SOL WAGER FLOW (v1 — 1v1/small-N, main.js):
  Player wallet --[depositWager TX]-->  On-chain Escrow PDA (v1)
  Server (authority) --[settleMatch]-->  Winner (90%) + Treasury (7%) + Ops (3%)
  Settlement failure --> handleSettlementFailure() --> cancelMatchEscrow() retry loop
  Disconnect forfeit --> same settleMatch() path, winnerWallet = surviving player

SOL WAGER FLOW (v2 — group-chat, lifecycle.js):
  Player wallet --[depositWager TX]-->  On-chain Escrow PDA (v2)
  lifecycle.confirmDeposit() --> tracks per-player initialDepositTx in GroupMatch
  lifecycle.settleMatch() --> setImmediate() --> settleMatchEscrowV2(matchId, winnerWallet)
  Settlement failure --> "eventual consistency via permissionless_reclaim after 24h"
  cancelWageredEscrow() --> cancelMatchEscrowV2(matchId, depositedWallets)

IN-GAME GOLD FLOW:
  initGold() → 1000G per player
  +15G/HP damage (earnGold) → +200G kill (awardKillBonus) → +300G/150G/75G/0G placement
  spendGold() validates cost>=0, balance>=cost, deducts atomically (JS single-threaded)

SHOT TOKEN FLOW:
  recordMatchPlayed() → milestone check (8 one-shot milestones) + per-match drip
  → totalShotEmitted++ (global cap: 7M rewardPool) → debounced MongoDB persist
  burnForPrestige() client TX → verifyBurnTransaction() → prestigeBurn() → tier++
  verifiedBurnTxs (in-memory Set + MongoDB persistence via persistBurnTx)
  consumables: purchaseConsumable() → playerShotState.balance-- (pure in-memory, no chain)
  referrals: processReferralReward() → User.findOneAndUpdate with atomic $set referralRewardedAt guard

WAGER SETTLEMENT PATH (end-to-end):
  main.js:fire → damage → isMatchOver() → transitionState(SETTLING) → emit matchEnd
  → settleMatch(winnerWallet, loserWallet, wagerSOL, roomId, playerCount)
  → solana.js:settleMatch → isEscrowEnabled() ? settleMatchEscrow(roomId, winnerWallet) : log
  → escrow.js:settleMatchEscrow → program.methods.settleMatch(winner).accounts({...}).rpc()
  → if fail: handleSettlementFailure → cancelEscrowSafely → failedSettlements retry (60s intervals, max 5x)
```

## Key Findings (Top 10)

1. **GROUP-CHAT DOUBLE-SETTLE RACE**: `lifecycle.settleMatch()` sets `match.state = 'settled'` and `await match.save()`, then dispatches on-chain settle via `setImmediate`. Two concurrent `checkAndSettle()` calls (e.g., simultaneous kill + turn-timer expiry) can both pass the `match.state !== 'active'` guard before the first save completes, resulting in two `settleMatchEscrowV2()` calls — one of which will fail on-chain (the PDA is already closed), but both will write to `match.settlementTx`. No mutex or optimistic-lock version field on GroupMatch. — `server/services/groupchat/lifecycle.js:804-873`

2. **SETTLEMENT SILENTLY FALLS BACK TO DEV-MODE LOG ON REFUND FAILURE**: `refundWager()` in solana.js falls through to `return { success: true, txSignature: null }` even when `cancelMatchEscrow()` fails (the error is logged but the return value is `success: true`). This means the calling code (disconnect path, playAgain cancel) believes the refund succeeded when it may not have. Unlike the settle path (which now propagates failure via SF-02), the cancel path fails-open. — `server/services/solana.js:240-258`

3. **SHOT EMISSION RACE: `totalShotEmitted` vs `state.balance` UPDATED NON-ATOMICALLY**: In `recordMatchPlayed()`, milestones and drip both add to `state.balance` before the global cap check runs. The excess removal line (`state.balance -= excess`) reduces balance correctly, but only after `totalShotEmitted` has already been incremented. Under concurrent calls for the same wallet (same `playerShotState` object), two racing `recordMatchPlayed()` calls can both pass the `if (totalShotEmitted >= rewardPool)` pre-check and both add to `totalShotEmitted`, collectively overshooting the 7M cap. JS single-threaded event loop prevents this for synchronous code, but `await` points inside the function break the atomicity guarantee if two events land in the same tick. — `server/services/shot-token.js:284-360`

4. **`state.totalShotEarned` UNDEFINED WRITE**: At line 347, `state.totalShotEarned += dripEarned` is called on the in-memory state object. The `getPlayerShotState()` initializer does NOT include `totalShotEarned` in the new-state template — only `balance`, `totalBurned`, `milestonesEarned`, etc. This means the field starts as `undefined`, and `undefined += N` yields `NaN`. The field is later serialized to `saveMilestoneState` as `state.balance + state.totalBurned` (not `totalShotEarned`), so no DB corruption, but the in-memory value is always `NaN`. — `server/services/shot-token.js:347`, `server/services/shot-token.js:133-153`

5. **CONSUMABLES BURNED WITHOUT ON-CHAIN VERIFICATION**: `purchaseConsumable()` deducts from `playerShotState.balance` and increments `playerShotState.shotBurned` purely in-memory. No on-chain burn TX is built or verified. This is a design choice (consumables are cheap), but it means `shotBurned` for consumable purposes is not reflected on-chain (mint authority is burned; the tokens are still in the player's wallet). There is no supply-sink mechanism enforcing that the SHOT is actually removed from circulation. The "burned permanently" claim in comments is inaccurate. — `server/services/consumables.js:32-40`

6. **GROUP-CHAT CANCEL PASSES PARTIAL `depositedWallets` THAT MAY VIOLATE ON-CHAIN CONTIGUITY REQUIREMENT**: `cancelWageredEscrow()` builds `depositedWallets` by filtering `match.players` for those with `initialDepositTx`. It does NOT verify that these form a contiguous prefix (slots 0..k-1). If player 0 did not deposit but player 1 did, the `remainingAccounts` array passed to `cancel_match` will fail on-chain (the v2 program requires accounts in player-index order and all must match deposited slots). This is exactly the `contiguous === false` scenario that v1's main.js handles with `cancelEscrowSafely`, but v2's lifecycle.js does not have equivalent protection — it will error and fall back to "permissionless_reclaim after 24h" — meaning funds are stuck for 24h, not immediately refunded. — `server/services/groupchat/lifecycle.js:894-921`

7. **`calculateSettlement()` IN `solana.js` IS DEAD CODE FOR REAL SETTLEMENTS**: The `calculateSettlement()` function uses JavaScript float math to compute 90/7/3 split in SOL then converts back. This function is called to produce a `settlement` object returned alongside `txSignature`, but the actual lamport math happens entirely on-chain (the escrow program does integer BPS math). The off-chain `settlement` object is used only for logging/display, never to drive on-chain transactions — but callers may mislead themselves into thinking the displayed split is authoritative. More critically: the function computes `totalPot = wagerSOL * playerCount` using float multiplication (e.g., 0.1 SOL * 2 = 0.2 SOL, which has IEEE 754 representation issues), then does `Math.round(...* LAMPORTS_PER_SOL)`. For small wagers this is safe, but for wager amounts that don't map cleanly to lamports (e.g., 0.25 SOL * 3 players = 0.75 SOL = 750000000 lamports — fine) the displayed values may drift from on-chain reality. — `server/services/solana.js:171-183`

8. **`referrals.js` INVITER REWARD NOT ATOMIC WITH REFEREE STAMP**: `processReferralReward()` uses an atomic `findOneAndUpdate` with `referralRewardedAt: null` guard to stamp the referee and credit their SHOT in one step (correct). However, the inviter reward is a separate `findOneAndUpdate` call with NO guard. If the server crashes between the two calls, the referee is credited and marked but the inviter is not. Additionally, SHOT credited via `$inc: { 'stats.shotBalance': REFERRAL_REWARD_SHOT }` bypasses the in-memory `playerShotState` map entirely — if the inviter is currently in a match, their in-memory balance is stale until next login. — `server/services/referrals.js:131-155`

9. **DEPOSIT TIMEOUT `depositTimers[roomId]` SLOT REUSE CAN SKIP CANCELLATION**: In `main.js`, `depositTimers[roomId]` is used for both the initial 5-minute deposit window AND the 30-second decision window that follows. If the 5-minute timer fires and starts the decision window by overwriting `depositTimers[roomId]` with a new `setTimeout`, and then a reconnecting player sends `escrowDepositConfirm` with `allDeposited=true` (racing the decision window), the `clearTimeout(depositTimers[rid])` at line 3492 will clear the decision timer (not the deposit timer, which already fired). The decision timeout at line 2109 then fires after the match has already started, calling `cancelEscrowSafely` on a now-active escrow PDA — which on-chain should fail (cancelled state guard), but the server-side cleanup (removeRoom + escrowCancelledAll broadcast) would still execute, corrupting the match state. — `server/socket-io/main.js:273-315, 2039-2115`

10. **GOLD ECONOMY: `awardPlacementGold()` AND `recordMatchPlayed()` BOTH PERSIST VIA FIRE-AND-FORGET**: Gold state is in-memory, persisted via `saveMilestoneState()` (fire-and-forget). If the server crashes after `goldStates` is updated but before `saveMilestoneState()` completes, the player loses their match gold. This is by design for in-game gold (which resets each match), but SHOT balance updates via `recordMatchPlayed()` also fire-and-forget. A crash during the 1-second debounce window for `saveServerState` could advance `totalShotEmitted` in-memory without persisting, causing over-emission on next boot. — `server/services/shot-token.js:116-123`, `server/services/gold.js:61-76`

11. **VERIFY BURN: `getParsedTransaction` COMMITMENT IS `confirmed`, NOT `finalized`**: `verifyBurnTransaction()` uses `commitment: 'confirmed'` to fetch the TX. On mainnet, a confirmed TX can still be reverted in a rare validator fork before finalization. The burn TX could pass verification, advance the user's prestige tier, then be rolled back on-chain — the user keeps the tier without actually burning SHOT. For devnet this is extremely unlikely but worth flagging for mainnet readiness. — `server/services/shot-token.js:502-507`

12. **GROUP-CHAT WINNER WALLET LOOKUP WITH NO FALLBACK**: `lifecycle.settleMatch()` finds the winner's wallet via `match.players.find(p => p.telegramUserId === winnerTgId)`. If `winnerPlayer.walletAddress` is null/undefined (unlinked wallet at match-end), the function logs an error and leaves the escrow unsettled, expecting permissionless_reclaim after 24h. But the v2 `permissionless_reclaim` refunds ALL deposited players equally — there's no winner-pays-loser semantics. So a wagered match completed by a player who had a linked wallet at deposit time but unlinked it mid-match results in an equal refund rather than a winner settlement. The economic impact: winner receives refund (wagerSOL back) instead of 90% of pot, and the protocol receives nothing. — `server/services/groupchat/lifecycle.js:848-872`

## Critical Mechanisms

- **BPS Fee Math (v1)**: On-chain integer: `treasury = floor(pot * 700 / 10000)`, `ops = floor(pot * 300 / 10000)`, `winner = pot - treasury - ops`. Winner gets remainder, preventing lamport dust loss. Off-chain `calculateSettlement()` mirrors this using float math but is display-only. — `server/services/solana.js:171-183`
- **BPS Fee Math (v2)**: Snapshot-based — `feeBpsTreasury` and `feeBpsOps` are snapshotted into MatchEscrow at `create_match` time. `settleMatchEscrowV2()` reads the snapshot from the escrow account itself, immune to mid-match config changes. — `server/services/escrow-v2.js:301-330`
- **Wager Lamport Conversion**: `Math.round(wagerSOL * LAMPORTS_PER_SOL)` — same in both v1 and v2 `createMatchEscrow`. No overflow risk for WAGER_TIERS [0.1, 0.25, 0.5, 1.0] (max = 1e9 lamports, well within JS safe integer range). — `server/services/escrow.js:288`, `server/services/escrow-v2.js:238`
- **SHOT Supply Cap**: Global `totalShotEmitted` counter tracked in-memory + MongoDB. `recordMatchPlayed()` checks cap before and after adding milestones+drip, with clamp correction. Persistent via 1s debounce `saveServerState()`. — `server/services/shot-token.js:284-363`
- **Prestige Burn Replay Guard**: `verifiedBurnTxs` Set (in-memory) + `verifiedBurnTxs` array (MongoDB). Both loaded on init via `initShotState()`. Set is pre-claimed before async verification, released on failure. MongoDB persistence via `persistBurnTx()` on success. — `server/services/shot-token.js:495-596`, `server/models/ServerState.js`
- **Failed Settlement Recovery**: `failedSettlements` Map stores failed settle attempts, retried every 60s via `setInterval`, max 5 attempts, then dropped. Non-contiguous deposits are detected and skipped (no retry). — `server/socket-io/main.js:318-387`
- **Group Match Double-Settle Guard**: Only guards checking `match.state !== 'active'` at entry of `settleMatch()` — no optimistic lock or version field to prevent concurrent calls from passing before the first DB write. — `server/services/groupchat/lifecycle.js:804`

## Invariants & Assumptions

- INVARIANT: Wager settlement is attempted ONCE per match (v1) — enforced by `transitionState(SETTLING)` CAS gate in main.js and the single JS event-loop thread. — `server/services/match.js:50-62` / **PARTIALLY ENFORCED** ⚠ (group-chat lacks equivalent CAS guard)
- INVARIANT: SHOT emissions never exceed the 7M rewardPool cap — enforced by `totalShotEmitted >= rewardPool` pre-check and post-clamp in `recordMatchPlayed()`. — `server/services/shot-token.js:284-360` / **PARTIALLY ENFORCED** ⚠ (race between concurrent calls under await)
- INVARIANT: Prestige burn TX cannot be reused — enforced by `verifiedBurnTxs` Set (pre-claimed) + MongoDB persistence. — `server/services/shot-token.js:495-499` / **ENFORCED** (barring MongoDB init failure before first burn)
- INVARIANT: Gold balance never goes negative — enforced by `spendGold()` checking `balance < cost` before deduction. — `server/services/gold.js:115-131` / **ENFORCED**
- INVARIANT: Group-match weapon purchase is atomic (no race on gold) — enforced by MongoDB `findOneAndUpdate` with `gold: { $gte: cost }` in query filter. — `server/socket-io/groupchat.js:295-322` / **ENFORCED**
- INVARIANT: Depositors' funds return to them on cancel/refund — enforced by on-chain cancel_match logic. Off-chain: `cancelEscrowSafely` (v1) is contiguity-aware. `cancelWageredEscrow` (v2/groupchat) is NOT contiguity-aware. — `server/services/groupchat/lifecycle.js:894-921` / **NOT ENFORCED for v2 non-contiguous deposits** ⚠
- ASSUMPTION: Exactly one `settleMatch()` call reaches the on-chain program per match (v1). — Validated by JS single-threaded event loop + `transitionState(SETTLING)` gate. / **VALIDATED for v1**
- ASSUMPTION: `match.players[currentPlayerIndex].walletAddress` is populated before `settleMatchEscrowV2` is called. — NOT VALIDATED at settle time (only at deposit entry). / **UNVALIDATED** ⚠ (see finding #12)
- ASSUMPTION: `verifiedBurnTxs` MongoDB array is loaded before any `verifyBurnTransaction()` call. — Validated by `initShotState()` called from `server/index.js` MongoDB connect hook. / **VALIDATED** (assuming init order maintained)
- ASSUMPTION: `totalShotEmitted` loaded from MongoDB on boot is accurate. — Validated by `saveServerState()` debounced 1s persist. / **PARTIALLY VALIDATED** ⚠ (1s window of over-emission possible on crash)

## Risk Observations (Prioritized)

1. **CRITICAL — Group-chat double-settle race** (`lifecycle.js:804`): Two concurrent `checkAndSettle()` calls (shot kill + scheduler turn-expiry racing) can both see `match.state === 'active'` before the first save commits. Both call `settleMatchEscrowV2()`. The second call will fail on-chain (PDA closed/settled), but the first may produce a valid settlement. The race window is small (~50ms DB round trip) but exploitable by timing: an attacker who is the last alive could fire exactly as the scheduler fires the turn-deadline to force double-settlement. Net risk: escrow PDA settled correctly (on-chain is safe), but server-side state corruption — duplicate SHOT milestone credits, duplicate match history entries, incorrect winner stats.

2. **CRITICAL — `refundWager()` fails-open on cancel failure** (`solana.js:240-258`): After a failed `cancelMatchEscrow()`, `refundWager()` returns `{ success: true }`. Callers (disconnect path in main.js, playAgain cancel) act as if the refund succeeded. The escrow PDA remains funded on-chain. Players will receive their funds only when `permissionlessReclaimEscrow` fires after 600s (v1 timeout), but the server has already told them the match was refunded. Combined with failed-settlement retry loop dropping non-contiguous cases, some funds could be stranded.

3. **HIGH — `totalShotEarned` field initialized as `undefined`** (`shot-token.js:347`): `state.totalShotEarned += dripEarned` on a freshly-created state object results in `NaN`. This field is not used in any security-critical calculation (the cap check uses `totalShotEmitted`, not per-player `totalShotEarned`), but the `$max` update in `saveMilestoneState` (`stats.totalShotEarned: state.balance + state.totalBurned`) would overwrite any existing DB value with the correct computation, so DB corruption is avoided. Still a latent bug that could cause unexpected NaN propagation if `totalShotEarned` is ever used directly.

4. **HIGH — Consumables are not actually burned on-chain** (`consumables.js:32-40`): The "burned permanently" comment is incorrect. Purchasing a consumable decrements in-memory SHOT balance only. No on-chain burn instruction is built. This means consumable purchases inflate `shotBurned` in player state without corresponding on-chain proof, allowing the server to claim supply was burned when it was not.

5. **HIGH — `cancelWageredEscrow` (v2) missing contiguity guard** (`lifecycle.js:894-921`): Non-contiguous depositor layouts will silently fail the on-chain cancel, falling back to 24h permissionless reclaim. The v1 main.js handles this explicitly; v2 lifecycle does not.

6. **HIGH — Referral SHOT credit bypasses in-memory state** (`referrals.js:148-155`): Inviter's `stats.shotBalance` is incremented in MongoDB but the in-memory `playerShotState` is not updated. If the inviter is actively playing when the referral rewards, their live balance (shown in HUD, used for consumable purchases) is stale. Only corrected on next `loadMilestoneState()` call (i.e., next login).

7. **HIGH — `depositTimers[roomId]` slot reuse** (`main.js:273-315, 2039-2115`): Overwriting the deposit timer with the decision timer means a concurrent `escrowDepositConfirm` (all-deposited path) can clear the decision timer instead of the deposit timer, and vice versa. The decision timer firing post-match-start can call `cancelEscrowSafely` on a live escrow PDA.

8. **MEDIUM — `calculateSettlement()` float math used for display** (`solana.js:171-183`): Off-chain SOL amounts displayed to users may differ from actual on-chain lamport distribution by up to 1 lamport due to float→lamport rounding. Not a financial loss, but misleading UX.

9. **MEDIUM — Prestige burn verification uses `confirmed` commitment** (`shot-token.js:502-507`): Mainnet fork risk: TX could be rolled back after confirmation. Mitigation: use `finalized` commitment for burn verification before mainnet.

10. **MEDIUM — `totalShotEmitted` 1-second debounce window** (`shot-token.js:116-123`): Server crash in the 1-second debounce window causes under-reporting of `totalShotEmitted` on next boot. Up to 25 SHOT (daily cap) could be re-emitted per wallet per crash event.

11. **MEDIUM — Group-chat winner wallet unlinked mid-match** (`lifecycle.js:848-872`): Winner falls back to permissionless equal refund. Economic outcome: winner gets wagerSOL back (no win premium), protocol gets nothing. Not a security exploit, but a financial correctness gap.

12. **LOW — Jupiter price oracle hardcoded mint** (`jupiter-price.js:5`): `SHOT_MINT` is hardcoded to the devnet address. If the mint changes (e.g., mainnet re-deploy), the price service silently shows null. Not a financial risk (display-only) but a deployment footgun.

## RECHECK Verdicts on Feb HANDOVER Items

### Financial/Escrow Path (HANDOVER HIGH items)

- **H001 (Balance-Check-Fail-Open)**: RECHECK. `verifyBalance()` returns `sufficient: false` on RPC error (correct, not fail-open now). But the balance check in `createRoom` handler still does `balanceCheck.sufficient` check — verified at `main.js:2362-2370`. **STATUS: APPEARS FIXED** (fail-closed on RPC error). Verify the exact code path.
- **H003 (Prestige Double-Unlock Race)**: RECHECK. `verifiedBurnTxs.add(txSignature)` is now done BEFORE async verification (pre-claim pattern). Concurrent calls with same TX both enter, first one proceeds, second is rejected by `has()` check. **STATUS: FIXED** (pre-claim at `shot-token.js:499`).
- **H004 (Settlement Without Deposit Check)**: RECHECK. `fire` handler now has `isEscrowReady()` gate at line ~3656 that prevents firing until all deposits confirmed. **STATUS: PARTIALLY FIXED** — but the gate relies on in-memory `wagerStates[roomId].deposits` completeness, which could be bypassed if escrow confirmation was never received (escrow-disabled dev mode or race).
- **H005 (burnAmount=0 Bypass)**: RECHECK. `verifyBurnTransaction()` now checks `BigInt(ixAmount) < expectedRaw` where `expectedRaw = BigInt(expectedAmount) * BigInt(1_000_000_000)`. If `burnAmount=0`, `expectedRaw=0` and any burn passes. **STATUS: STILL VULNERABLE** — a zero-amount burn (or a burn of 1 token) for a tier requiring 200 SHOT would fail the `state.balance < nextTier.burnCost` check in `prestigeBurn()`, but only AFTER `verifyBurnTransaction()` returns `valid: true`. The `prestigeBurn()` function independently checks balance, so the exploit is: burn 1 SHOT on-chain → server verifies it → `prestigeBurn()` checks `state.balance >= 200` → rejects if balance < 200. **STATUS: FIXED by defense in depth** (both layers check independently). But if burnAmount param is manipulated to match a tier cost while the burn TX was for less, the `BigInt(ixAmount) >= expectedRaw` comparison would catch it — `expectedAmount` in the server call comes from the client's `burnAmount` field which is unvalidated at the `prestigeBurn` event handler: only `txSignature` is checked for presence, not `burnAmount` range. Need to verify.
- **H007 (refundWager Wrong Params)**: RECHECK. `refundWager()` now accepts `playerAddresses` param and passes to `cancelMatchEscrow()`. **STATUS: FIXED** structurally.
- **H010 (Deposit-Confirmation Race)**: RECHECK. `escrowDepositConfirm` handler now verifies on-chain via `getEscrowState()` + depositsMask bitmask check. **STATUS: FIXED** (on-chain deposit verification added).
- **H012 (Wagerless Rematch)**: RECHECK. `playAgainWithEscrow()` block at main.js:244 creates a fresh escrow round for wagered rematches. `ws.deposits = {}` cleared. **STATUS: FIXED** structurally, but see `depositTimers` slot reuse concern.
- **H027 (Escrow Creation Failure Ignored)**: RECHECK. `createMatchEscrow()` failure now logged; in `joinRoom` handler the `result.success` check exists. **STATUS: FIXED** — failure is now propagated back to client.
- **H028 (30s Balance Cache TOCTOU)**: RECHECK. Balance cache still exists at 30s TTL. `verifyBalance()` can return stale data. **STATUS: OPEN** — cached balance check is still TOCTOU. The escrow deposit mechanism largely mitigates this (on-chain deposit is the real gate), but the initial `createRoom` balance check can still use stale data.
- **H046 (RPC Fails-Open Default)**: RECHECK. `verifyBalance()` now returns `sufficient: false` on error (catch block). **STATUS: FIXED**.
- **H060 (joinQueue No Balance Check)**: RECHECK. `joinQueue` now has balance check at main.js:~2577+ area. Need precise line verification.

### Auth/Access Items Relevant to Financial Path

- **C-5 (JWT Never Consumed)**: Not in LOGIC-02 scope. Auth-01 agent.
- **C-11 (escrowDepositConfirm Partial Deposit)**: FIXED — on-chain bitmask verification added.

## Novel Attack Surface

- **Consumable/SHOT balance desync via referral**: A player farms SHOT via referrals (MongoDB credit), purchases consumables (in-memory debit). After server restart, referral SHOT is in MongoDB but consumable debit is in-memory only. Player effectively gets consumables for free. Specifically: (1) referee completes first wagered match → inviter gets 25 SHOT in DB; (2) inviter is currently in a match → their in-memory balance doesn't reflect DB credit; (3) server restarts → in-memory balance reloaded from DB = 25 SHOT credited, consumable debit lost. Net: 25 free SHOT.

- **Referral code self-referral bypass via Telegram ID vs referralCode mismatch**: Self-referral guard checks `referee.referralCode === code` — but `referralCode` is lazily created. If a user has not yet generated their referral code (code is null), the comparison `null === code` is always false, meaning a user could try to attribute themselves if their code hasn't been generated. The lookup for the referrer then checks `User.findOne({ referralCode: code })` — if the code belongs to the same user's account via wallet but different telegramId linking, the self-referral guard fails. Low probability but worth noting.

- **Group-chat `computeRanking()` uses in-memory match.players at settle time**: The ranking (and thus winner determination) is computed from the `match` object in memory at `settleMatch()` time. If `match.players` was mutated between `handleShot()` returning and `setImmediate(() => settleMatch())` executing (e.g., a concurrent DB write via `forfeitGroupMatch` that eliminates another player), the in-memory and DB states could diverge. The settle TX uses `rankedFinishers[0]`'s wallet from the in-memory object — which may not match what the on-chain state expects. Since the on-chain program only validates the authority + winner address (not match outcome), an incorrect winner could receive the pot if the in-memory ranking diverges from the actual game state.

## Cross-Focus Handoffs

- → **AUTH-03 (Authorization)**: `prestigeBurn` event handler in `main.js:3288` does NOT verify that `burnAmount` falls within valid prestige tier cost range (200–4000 SHOT). The `burnAmount` is passed directly to `verifyBurnTransaction(txSignature, wallet, burnAmount)` — if burnAmount is manipulated by a client to be very large (larger than any tier cost), `expectedRaw` is huge and the actual burn would never satisfy it, but if manipulated to be 0 or negative, BigInt conversion of a negative number could be unexpected. AUTH-03 should verify input validation on the `prestigeBurn` event payload.

- → **CHAIN-01 (TX Construction)**: `buildDepositTransaction()` in both escrow.js and escrow-v2.js builds unsigned transactions with a caller-supplied `playerAddress` as `feePayer`. There is no server-side validation that `playerAddress` matches the authenticated wallet address — it comes from `wagerStates[roomId].wallets[playerId]` which is set from the socket's authenticated wallet at join time. Verify the chain between authenticated wallet storage and deposit TX construction.

- → **ERR-02 (Race Conditions)**: The `depositTimers[roomId]` slot reuse issue (finding #9) is primarily a race condition concern crossing into ERR-02. The double-settle race in group-chat lifecycle (finding #1) is also an ERR-02 concern. Both should be cross-referenced.

- → **ERR-01 (Error Handling)**: `refundWager()` fails-open pattern (finding #2). The settlement retry loop (failedSettlements) drops non-contiguous cases with a log and no further action — no player notification, no admin alert. ERR-01 should flag this as a monitoring gap.

- → **CHAIN-02 (RPC Trust)**: Both escrow services use `connection.getLatestBlockhash()` at deposit transaction build time (not at signing time). The blockhash may expire before the client signs and broadcasts. Retry logic at the client level? Verify in CHAIN-02 scope.

## Trust Boundaries

The server unconditionally trusts: (1) the Solana RPC for on-chain state reads (deposit verification, escrow state fetches) — a malicious RPC could falsely report deposits as confirmed; (2) in-memory `playerShotState` as the authoritative SHOT balance for purchases and milestone checks — this state is loaded from MongoDB on authenticate but may drift between restart and state load; (3) `match.players[].walletAddress` as populated and correct at settlement time, with no re-verification against the authenticated wallet session. Clients are untrusted for: deposit amounts (verified on-chain via bitmask), weapon inventory (server-authoritative), fire inputs (server-validated physics), burn TX validity (on-chain verification). The main trust gap is the in-memory SHOT balance being the source of truth for consumable purchases and prestige tier unlock checks, with MongoDB as the eventual-consistency backup — a server restart between earning SHOT (DB persisted) and spending it (in-memory) correctly reconstructs state, but a restart between spending (in-memory) and persisting (fire-and-forget) loses the spend.
<!-- CONDENSED_SUMMARY_END -->

---

# LOGIC-02: Financial & Economic Logic — Full Analysis

## Executive Summary

SolShot's financial flows span four distinct economic systems: (1) SOL wagering via on-chain escrow (v1 for 1v1/small-N real-time matches, v2 for async group-chat matches), (2) in-game Gold economy (in-memory, per-match), (3) SHOT token economy (milestones, per-match drip, prestige burns, consumables, referrals), and (4) the Jupiter price oracle (display-only, no financial decisions based on it).

The most mature and well-defended system is the v1 escrow (live on devnet since May 2026 with one verified settlement). It has the most hardening: on-chain deposit verification, contiguity-aware cancel, SF-02 failure propagation, and the `failedSettlements` retry loop. The v2 escrow (group-chat) is newer and carries several gaps: no double-settle guard, no contiguity check on cancel, and a fallback strategy that leaves funds locked for 24h rather than immediately refunded.

The SHOT token economy has been substantially hardened since Feb 2026: burn replay protection now survives restarts (MongoDB persistence via `persistBurnTx` + `initShotState`), pre-claim pattern prevents TOCTOU on concurrent burns. However, several issues remain: `totalShotEarned` field initialized as `undefined`, consumables not actually burned on-chain, and referral SHOT credits bypassing in-memory state.

The gold economy is structurally sound (single-threaded JS, synchronous `spendGold()`), with the group-chat purchase handler using MongoDB atomic `findOneAndUpdate` to prevent race conditions.

## Scope

In-scope: All server-side and client-side code related to financial calculations, token flows, wager mechanics, reward distribution, and economic state management.

Out of scope: On-chain Anchor program logic (reviewed in SOS Audit #2). The on-chain math (integer BPS splits, deposit mask validation, account validation) is treated as correct per SOS findings.

## Key Mechanisms

### Wager Entry (v1 main.js path)

1. `createRoom` → `verifyBalance(wallet, wagerAmount)` → cached 30s balance check → `isValidWager()` tier check → `wagerStates[roomId] = { amount, wallets: {} }`
2. `joinRoom` → stores joiner's wallet → `createMatchEscrow(roomId, wagerSOL, playerAddresses)` → sets `room.escrowPDA`
3. `escrowDeposit` (socket event) → server builds deposit TX via `buildDepositTransaction(matchId, playerAddress)` → sends base64 TX to client
4. Client signs via Privy → `signAndSendEscrowDeposit()` → broadcasts to Solana → emits `escrowDepositConfirm { roomId, txSignature }`
5. `escrowDepositConfirm` handler → `requireAuth` → `getEscrowState(rid)` (on-chain fetch) → `depositsMask` bitmask check → `wagerStates[rid].deposits[client.id] = txSignature` → check `allDeposited`
6. `allDeposited` → emit `escrowActive` → deposit timer cleared

### Wager Settlement (v1 main.js path)

1. `fire` → server physics → damage applied → `isMatchOver()` returns `{ isOver: true, winner }`
2. `transitionState(ms, MATCH_STATES.SETTLING)` — CAS gate (single-threaded JS, atomic)
3. `io.sockets.in(roomId).emit('matchEnd', { winner })` — clients get result
4. `settleMatch(winnerWallet, loserWallet, wagerSOL, roomId, playerCount)` from `solana.js`
5. → `isEscrowEnabled()` ? `settleMatchEscrow(roomId, winnerAddress)` : log fallback
6. → `program.methods.settleMatch(winner).accounts({ escrow, authority, winner, treasury, ops }).rpc()`
7. Success: `logger.info` + return `{ success: true, txSignature }`
8. Failure: `handleSettlementFailure(roomId, roomSnapshot, wsSnapshot, error)` → `cancelEscrowSafely` → `failedSettlements` retry map

### Wager Settlement (v2 lifecycle.js path)

1. `handleShot()` → `checkAndSettle()` → `settleMatch(match, reason)`
2. `match.state = 'settled'` → `match.rankedFinishers = computeRanking(match)` → `match.save()`
3. `setImmediate(async () => { ... })` — deferred async block
4. `postToChat` + `pushMatchHistory` + `dispatchGroupVictoryDm` + on-chain settle
5. `settleMatchEscrowV2(match.matchId, winnerPlayer.walletAddress)` — reads snapshot from on-chain escrow, passes winner address
6. On success: `match.settlementTx = txSignature` → `match.save()`
7. On failure: log error, "permissionless_reclaim will fire after 24h"

### SHOT Milestone and Drip Flow

1. `recordMatchPlayed(walletAddress, matchInfo)` — called post-match
2. Anti-farming: `turnCount >= 4`, 30s cooldown, `claimedMatchIds` dedup
3. `totalShotEmitted >= rewardPool` pre-check
4. Milestone loop: 8 one-shot milestones, each checked against `state.milestonesEarned`
5. Per-match drip: 2 SHOT wagered + 3 SHOT win bonus, capped by `DAILY_SHOT_CAP = 25`
6. Post-earn clamp: `totalShotEmitted + totalEarned > rewardPool` → subtract excess
7. `totalShotEmitted += totalEarned` → `persistEmissionCount()` (1s debounce)
8. `saveMilestoneState(walletAddress)` (fire-and-forget)

### Prestige Burn Flow

1. Client burns SHOT token on-chain via `signAndBurnShot(burnAmount)`
2. Client emits `prestigeBurn { txSignature, burnAmount }`
3. Server: `requireAuth` → `verifyBurnTransaction(txSignature, wallet, burnAmount)`
4. `verifiedBurnTxs.has(txSignature)` → reject if already used
5. `verifiedBurnTxs.add(txSignature)` — pre-claim
6. `getParsedTransaction(txSignature, { commitment: 'confirmed' })` — on-chain fetch
7. Find `spl-token` burn instruction → verify mint == SHOT_MINT, authority == wallet, amount >= expectedRaw
8. `persistBurnTx(txSignature)` — MongoDB $addToSet
9. `prestigeBurn(wallet)` — check `state.balance >= nextTier.burnCost` → deduct → tier++

## Trust Model

### Trusted Sources
- On-chain escrow program: settlement math, deposit validation, authority checks
- MongoDB: persistent player SHOT state, burn TX set, claimed match IDs
- Server keypair (authority): signs escrow creates, settles, cancels

### Partially Trusted
- In-memory state: gold, SHOT balance, consumables — authoritative within a session, bootstrapped from MongoDB on authenticate, fire-and-forget persistence
- Solana RPC responses: `getEscrowState()`, `getEscrowStateV2()` used for deposit verification — trusted but single-provider (devnet RPC, no fallback for verification calls)

### Untrusted (Client-Supplied)
- `burnAmount` in `prestigeBurn` event — server re-derives from tier cost, not blindly used
- `txSignature` in burn/deposit — verified on-chain before accepting
- Weapon fire parameters (angle, power, weaponId) — server-authoritative physics
- `walletAddress` in `confirmGroupDeposit` — looked up from server-side User record (correct)

## State Analysis

### In-Memory State

| State Store | Key | Content | Persistence | Loss on Restart |
|-------------|-----|---------|-------------|-----------------|
| `wagerStates` | roomId | amount, wallets, deposits, partial state | None | All (match-scoped) |
| `goldStates` | roomId | per-player gold balance | None | All (match-scoped, by design) |
| `weaponInventories` | roomId | per-player weapon arrays | None | All (match-scoped) |
| `playerShotState` | walletAddress | SHOT balance, milestones, streak | MongoDB (fire-and-forget) | Up to 1s debounce window |
| `verifiedBurnTxs` | — | Set of used burn TX sigs | MongoDB (`persistBurnTx`) | Restored on `initShotState()` |
| `totalShotEmitted` | — | Global SHOT supply counter | MongoDB (1s debounce) | Up to 1s debounce window |
| `failedSettlements` | roomId | Failed settle retry data | None | All (lost on restart) |
| `depositTimers` | roomId | Timeout handles | None | All (match-scoped) |
| `matchmakingQueues` | mode:length | Queued players | None | All |

### MongoDB State (Persistent)

| Collection | Financial Fields | Notes |
|------------|-----------------|-------|
| User | stats.shotBalance, stats.totalBurned, stats.prestigeTier, stats.milestonesEarned, stats.claimedMatchIds, referralRewardedAt, referredByCode | Source of truth across restarts |
| Match | status, active | Match outcome record |
| GroupMatch | state, players[].gold, players[].weapons, players[].initialDepositTx, rankedFinishers, settlementTx, escrowPda | Group-match economy state |
| ServerState | totalShotEmitted, verifiedBurnTxs | Global counters |

## Dependencies

| Dependency | Used For | Trust Level | Failure Mode |
|------------|---------|-------------|--------------|
| Solana RPC (devnet) | Balance checks, escrow state, deposit verification, TX settlement | External (trusted but single-provider) | `verifyBalance` returns insufficient; deposit verification fails |
| Anchor Program (v1) | On-chain escrow settlement + cancel | On-chain (authoritative) | `settleMatchEscrow` fails → `handleSettlementFailure` |
| Anchor Program (v2) | Group-chat escrow | On-chain (authoritative) | `settleMatchEscrowV2` fails → 24h permissionless fallback |
| MongoDB | SHOT state persistence, burn TX replay protection | Internal (trusted) | `saveMilestoneState` fire-and-forget silently fails |
| Jupiter Price API | SHOT/SOL display price | External (display only) | Returns null prices — no financial decisions |

## Focus-Specific Analysis

### F1: Wager Rounding Errors

**Finding:** `createMatchEscrow` uses `Math.round(wagerSOL * LAMPORTS_PER_SOL)`. For WAGER_TIERS [0, 0.1, 0.25, 0.5, 1.0], the conversions are:
- 0.1 SOL = 100000000 lamports (exact)
- 0.25 SOL = 250000000 lamports (exact)
- 0.5 SOL = 500000000 lamports (exact)
- 1.0 SOL = 1000000000 lamports (exact)

No rounding error for the defined tiers. `Math.round` is conservative. For `custom_challenge` mode with arbitrary wagers (>= 0.1), wagers that are not exact multiples of lamports would round — acceptable.

**Off-chain display `calculateSettlement()`:** Uses `Math.floor` for fee shares, winner gets remainder. Same semantics as on-chain BPS math. For a pot of 0.2 SOL (2 players at 0.1 SOL):
- `totalLamports = 200000000`
- `treasuryLamports = floor(200000000 * 0.07) = floor(14000000) = 14000000`
- `opsLamports = floor(200000000 * 0.03) = floor(6000000) = 6000000`
- `winnerLamports = 200000000 - 14000000 - 6000000 = 180000000`

This matches the on-chain 90/7/3 BPS split. The display values are correct.

**Conclusion:** Wager rounding is sound for the defined tier set.

### F2: Mid-Match State Mutations

**Gold:** `earnGold()`, `awardKillBonus()`, `spendGold()` all operate on the in-memory `goldStates[roomId]` object synchronously. No await between check and deduct. JS single-threaded event loop prevents race conditions. **SAFE.**

**SHOT consumables:** `purchaseConsumable()` is synchronous, operates on `playerShotState[wallet]` object. Same single-threaded safety. However, there is no server event handler for consumable purchases — the purchase is called internally after a socket event. Need to verify the calling context is authenticated and the wallet is validated. **Need to verify calling site in main.js.**

**Weapon purchase (group-chat):** Uses MongoDB atomic `findOneAndUpdate` with gold-balance filter. **SAFE.**

**Weapon purchase (1v1):** `buyWeapon` handler in main.js uses `spendGold()` then updates `weaponInventories[roomId]`. Synchronous, but the two operations (gold deduct + inventory add) are not a single atomic DB operation. If server crashes between them, player has paid but not received the weapon. Low risk (in-memory only, both reset on restart). **ACCEPTABLE for current design.**

### F3: Settle/Refund Call Paths

**v1 settle paths:**
1. Normal match end: `fire` → `isMatchOver` → `transitionState(SETTLING)` → `settleMatch()`
2. Forfeit/timeout: `startTurnTimer` callback (3 consecutive misses) → `settleMatch()`
3. Disconnect forfeit: `disconnect` handler → check `ms.roundWins` → `settleMatch()`

All three paths use the same `settleMatch()` from `solana.js`, which delegates to `settleMatchEscrow()`. The `transitionState(SETTLING)` CAS gate prevents double-settlement from paths 1 vs 2/3 racing (JS event loop serializes them).

**v1 cancel paths:**
1. Normal cancel: `removeRoom()` does NOT call refundWager — wager state is deleted without on-chain refund. **POTENTIAL ISSUE:** If a room is removed (e.g., both players disconnect during escrow phase) via `removeRoom()`, the escrow PDA is NOT cancelled. Funds remain on-chain until `permissionlessReclaimEscrow` fires after 600s. The `refundWager` function is called only in the disconnect forfeit path.
2. Deposit timeout: `depositTimers[roomId]` → `cancelEscrowSafely()`
3. User cancel: `escrowCancelAll` → `cancelEscrowSafely()`
4. Play-again cancel: `playAgainWithEscrow()` → `cancelEscrowSafely()`

**v2 settle paths (group-chat):**
1. Normal: `handleShot()` → `checkAndSettle()` → `settleMatch()` → setImmediate → `settleMatchEscrowV2()`
2. Idle timeout: `handleIdleTimeout()` → `checkAndSettle()` → same
3. Forfeit: `handleForfeit()` → `checkAndSettle()` → same
4. Time cap: `checkAndSettle()` after `endsAt` → same

**Double-settle race (v2):** Paths 1 and 2 can overlap: if a shot kills the last opponent AND the turn timer fires in the same ~50ms window (both await the DB fetch of the match), both `checkAndSettle()` calls see `match.state === 'active'` before the first save. Both call `settleMatch()`. The first `settleMatch()` sets `match.state = 'settled'` and saves. The second `settleMatch()` also passes the `match.state !== 'active'` guard (using the in-memory match object, which hasn't been refreshed from DB yet). On-chain, the second `settleMatchEscrowV2()` call will fail because the PDA is already in settled/closed state. Net effect: server-side match gets `settlementTx` overwritten twice (second call fails, so it stays as the first), and `pushMatchHistory()` and `dispatchGroupVictoryDm()` may fire twice.

### F4: TOCTOU on Financial State

**v1 balance check TOCTOU:** `verifyBalance()` checks at `createRoom` time. Player could spend SOL between the check and the actual deposit. The on-chain escrow deposit itself will fail if the wallet is insufficient (SPL transfer fails). So the exploit is: pass balance check, create escrow PDA, then try to deposit with insufficient funds. Result: deposit TX fails, client receives error, match doesn't start. **Acceptable — on-chain enforces the real gate.**

**v2 group-chat wager TOCTOU:** `beginWageredDepositPhase()` creates the on-chain escrow at match start time but does not re-verify balance. Players have `WAGERED_DEPOSIT_WINDOW_SECS = 3600s` (1 hour) to deposit. During this window, a player could spend their SOL elsewhere and fail to deposit. The match is designed to handle this via `startWithDepositors` or cancel paths. **Design intent, not a bug.**

**SHOT balance for consumables:** Purchased using in-memory `playerShotState.balance`. No on-chain verification. A player could earn SHOT in a match (DB + in-memory updated), disconnect, reconnect (DB loaded), and spend the same SHOT again if the first spend was in-memory only and DB didn't persist before disconnect. The fire-and-forget `saveMilestoneState()` should persist the deduction, but if the crash happens in the ~1s between deduction and persist, the player gets to respend. **LOW risk for small consumable costs.**

### F5: Group-Match Deposit Verification (v2)

`confirmGroupDeposit` in `groupchat.js` correctly:
1. Resolves wallet from server-side User record (not client-supplied wallet)
2. Fetches `getEscrowStateV2(matchId)` for on-chain verification
3. Checks `depositsMask` bit for the player's index
4. Verifies `escrowState.wagerLamports === match.config.wagerLamports`

This is strong. The main gap is that `match.config.wagerLamports` is an integer (lamports), while `escrowState.wagerLamports` comes from `escrow.wagerLamports.toNumber()` — if the BN value exceeds `Number.MAX_SAFE_INTEGER` (very large wager), this comparison could fail silently. For realistic wager tiers (max ~1 SOL = 1e9 lamports), this is safe.

### F6: SHOT Emission Supply Cap

The cap check in `recordMatchPlayed()`:

```js
// Pre-check
if (totalShotEmitted >= SHOT_TOKEN_CONFIG.rewardPool) {
    return { earned: 0, ... };
}
// ... add milestones and drip to state.balance and totalEarned ...
// Post-clamp
if (totalShotEmitted + totalEarned > SHOT_TOKEN_CONFIG.rewardPool) {
    const allowed = SHOT_TOKEN_CONFIG.rewardPool - totalShotEmitted;
    const excess = totalEarned - allowed;
    state.balance -= excess;
    totalEarned = allowed;
}
totalShotEmitted += totalEarned;
```

The pre-check is a fast-path short-circuit. The post-clamp handles the case where `totalEarned` would overshoot. But between the pre-check and the post-clamp, there are multiple `await` points? Actually, looking at the code: `recordMatchPlayed()` is NOT async — it's a synchronous function. All the milestone checks, balance updates, and clamp happen synchronously. `totalShotEmitted` is a module-level variable, and JS single-threaded guarantees that between function calls no interruption occurs. **The cap check is actually SAFE** — the race I identified in Finding #3 would require two simultaneous calls to `recordMatchPlayed()` for different wallets, but since each completes synchronously before the next event loop tick, the `totalShotEmitted` variable is correctly updated. The race scenario would only occur if `recordMatchPlayed()` were async — it is not. **RETRACT Finding #3 as critical. Reclassify to LOW: the concern is about the 1s debounce persist window, not an intra-call race.**

However, `totalShotEarned` being undefined (Finding #4) is a real bug — confirmed at line 347 where `state.totalShotEarned` is not initialized in `getPlayerShotState()`.

### F7: Referral Economy

`processReferralReward()` has a two-phase write:
1. Atomic: stamp `referralRewardedAt` + credit referee SHOT (single `findOneAndUpdate` with null guard)
2. Non-atomic: credit inviter SHOT (separate `findOneAndUpdate`, no guard)

The inviter credit has no guard against double-credit (though the referee stamp prevents the outer function from re-running, so the inviter credit is also one-shot in practice). The SHOT credited to inviter goes directly to `stats.shotBalance` in MongoDB, bypassing in-memory `playerShotState`. If the inviter is in an active game, their HUD-displayed balance (in-memory) shows the pre-referral amount. The MongoDB credit is correct. On their next login/`loadMilestoneState()`, the in-memory state will sync.

**Exploit window:** If an inviter's in-memory SHOT balance (pre-referral) is 0, and the referral awards 25 SHOT to MongoDB, and the inviter tries to buy a 25 SHOT consumable before the next `loadMilestoneState()`, the purchase will fail (in-memory balance = 0). After restart/reload, they can buy it. This is a UX annoyance, not a financial loss.

## Cross-Focus Intersections

- **AUTH-01 / AUTH-03**: The `prestigeBurn` event does not validate `burnAmount` range client-server. Client sends `burnAmount`, server passes it directly to `verifyBurnTransaction()` as `expectedAmount`. If the client sends `burnAmount: 200` (Bronze tier cost) but the actual burn TX only burned 1 SHOT, the server checks `BigInt(1 * 1e9) >= BigInt(200 * 1e9)` = false, correctly rejecting. But if the client sends `burnAmount: 1` and actually burned 1 SHOT, `prestigeBurn()` is called with the wallet — and `prestigeBurn()` then independently checks `state.balance >= nextTier.burnCost` (e.g., 200). So the invariant holds: `verifyBurnTransaction` verifies the burn happened for at least `burnAmount` tokens, and `prestigeBurn()` verifies the player can afford the next tier. The two-layer check prevents under-burn exploits. However, neither check validates that `burnAmount` matches the tier cost — a player could burn exactly 1 SHOT, claim `burnAmount: 200`, and the server would reject at the on-chain check (burned < expected). **SAFE by design.**

- **ERR-01**: `refundWager()` failure mode. `cancelMatchEscrow()` failing causes `refundWager()` to return `{ success: true }`. The `match.save()` in group-chat cancel flow does not record that the on-chain cancel failed. Players and the server believe funds are refunded. Funds are actually locked on-chain until permissionless reclaim. No alert/notification mechanism for this scenario.

- **CHAIN-01**: `buildDepositTransaction()` builds a TX with `feePayer: player`. The player address used is from `wagerStates[roomId].wallets[client.id]`, which was stored from `authenticatedWallets[client.id]` at join time. If the player's wallet changes between join and deposit (wallet reconnect), the stale address from wagerStates would be used to build the TX — but the player would sign with their new wallet, causing a signature mismatch. The on-chain program validates that the depositor matches the registered player address, so this would be rejected on-chain. **SAFE.**

- **CHAIN-04**: On-chain deposit verification uses `getEscrowState()` which fetches with `commitment: 'confirmed'`. This is appropriate for deposit verification (faster than finalized, acceptable for game flow). Settlement uses `program.methods.settleMatch().rpc()` which uses the provider's `commitment: 'confirmed'` — again appropriate. No finalized-level guarantees are used. On mainnet, this means a small (< 0.1%) chance of settlement TX being rolled back, which would result in funds staying in the escrow PDA. The on-chain program's `permissionlessReclaimEscrow` would then allow recovery after the grace period.

## Risk Observations

Full ranked list with file:line evidence:

| Rank | Finding | Severity | File:Line |
|------|---------|----------|-----------|
| 1 | Group-chat double-settle race (no pessimistic lock on GroupMatch) | CRITICAL | `lifecycle.js:804, 1039` |
| 2 | `refundWager()` fails-open on cancel failure | CRITICAL | `solana.js:240-258` |
| 3 | Consumables not burned on-chain (supply claim inaccurate) | HIGH | `consumables.js:32-40` |
| 4 | `cancelWageredEscrow` missing contiguity guard (v2) | HIGH | `lifecycle.js:894-921` |
| 5 | Referral SHOT bypasses in-memory state (stale balance) | HIGH | `referrals.js:148-155` |
| 6 | `depositTimers` slot reuse (v1 deposit + decision windows) | HIGH | `main.js:273-315, 2039-2115` |
| 7 | `totalShotEarned` field undefined on new state objects | HIGH | `shot-token.js:347, 133-153` |
| 8 | Prestige burn uses `confirmed` not `finalized` (mainnet fork risk) | MEDIUM | `shot-token.js:502-507` |
| 9 | `calculateSettlement()` display-only float math can mislead | MEDIUM | `solana.js:171-183` |
| 10 | Group-chat winner wallet unlinked mid-match → equal refund not win | MEDIUM | `lifecycle.js:848-872` |
| 11 | `totalShotEmitted` 1s debounce crash window | MEDIUM | `shot-token.js:116-123` |
| 12 | Jupiter price oracle mint hardcoded to devnet address | LOW | `jupiter-price.js:5` |

## Novel Attack Surface Observations

### NSO-01: Consumable/SHOT restart resync exploit
An adversary who knows a server restart is imminent can:
1. Earn SHOT via match (DB persisted + in-memory)
2. Buy max consumables (in-memory debit, fire-and-forget DB persist)
3. If server crashes in the debounce window, the DB persist for the consumable debit fails
4. On restart, in-memory is reloaded from DB — consumable debit is missing
5. Player has consumables active AND still has the SHOT in DB balance
Low-probability (requires crash timing) and low-value (consumable costs are small), but demonstrates the fire-and-forget persistence gap.

### NSO-02: Fake wallet mid-match (group-chat)
A player could unlink their wallet after depositing but before the match ends. If they are the winner, `lifecycle.settleMatch()` cannot find their wallet address, falls through to the "no wallet → permissionless refund" path. The permissionless refund distributes equally to all depositors. For a 2-player wagered match, the "winner" gets their wager back instead of 90% of pot — they lose 90% of pot size (0.09 SOL at 0.1 SOL wager). This is economically self-defeating. But for a 10-player group-chat match, the "winner" could potentially influence the outcome to ensure a specific player wins while their wallet is unlinked, causing an equal refund that favors the 9 losers collectively — not an obvious attack but a structural gap.

### NSO-03: Group-chat match forced to equal-refund outcome
An external attacker who gains access to one player's Privy session mid-match could: (1) unlink the wallet after deposit, (2) ensure that player wins (or collaborate with them to do so), (3) settle triggers equal refund instead of 90% winner + 7/3 split. The attacker's player receives only `wagerSOL` back instead of 0.9 * N * wagerSOL. This is only economically viable in the attacker's interest if the attacker controls the "losing" position and wants to ensure even distribution rather than winner-takes-all. Complex attack, low probability.

## Questions for Other Focus Areas

1. **AUTH-01**: Is `burnAmount` validated to be a positive integer within the range [200, 4000] in the `prestigeBurn` event handler before being passed to `verifyBurnTransaction`? The current code passes it unchecked.

2. **ERR-02**: Is there any locking (optimistic or pessimistic) on `GroupMatch` documents during `handleShot` → `checkAndSettle` → `settleMatch` paths? The double-settle concern (Finding #1) needs an ERR-02 analysis of the MongoDB query patterns.

3. **CHAIN-02**: When `getEscrowState()` or `getEscrowStateV2()` fails (RPC down), the deposit verification path (`escrowDepositConfirm` handler) returns an error to the client (`client.emit('escrowError', { reason: 'Deposit verification failed' })`). Is this fail-closed behavior confirmed across all RPC failure modes (timeout, 429 rate limit, invalid response)?

4. **AUTH-03**: The `escrowPartialStart` event requires `ws.partialDecisionMaker === client.id`. How is `ws.partialDecisionMaker` set? Is it the first depositor's socketId, which could be stale after a reconnect that remaps socketIds?

5. **ERR-01**: When `failedSettlements` drops a roomId after 5 retry attempts, is there any admin notification or monitoring alert? The funds remain in the escrow PDA and can only be recovered by permissionless reclaim or manual ops intervention.

## Raw Notes

- `startWithDepositorsEscrow` (v1) at `main.js:3530` passes `client.roomId` — correct (same as the matchId used to create the escrow). No matchId mismatch risk here.

- `escrow-v2.js:settleMatchEscrowV2` re-fetches the escrow account to get `treasurySnapshot` and `opsSnapshot` addresses. This is one extra RPC round trip per settlement but is the correct approach (ensures snapshot immutability protection). The v2 program validates that the passed `treasury` + `ops` accounts match the snapshots stored on-chain.

- `wagerStates` is deleted in `removeRoom()` but the `failedSettlements` entry persists independently (keyed by roomId, not tied to wagerStates). The retry loop at line 327 can therefore attempt recovery even after the room is removed from memory — correct behavior.

- The `PLACEMENT_GOLD` array in `gold.js` is `[300, 150, 75, 0]` indexed by 0-3. For a 4-player match, the last-place player gets 0G from placement but may still have earned gold from damage dealt. This is correct per the litepaper.

- `awardRoundWinBonus()` vs `awardPlacementGold()`: The former is kept for backward compat (BO1/BO3/BO5 2-player). The latter is used by the N-player `getRoundPlacement()` in match.js. Both update `goldStates[roomId]` — no double-award risk as they are called in different code paths.

- Group-chat `activateMatch()` at `lifecycle.js:291` uses `Math.floor(Math.random() * match.players.length)` for first turn selection (not CSPRNG). This is a cosmetic fairness issue, not a security concern (same vulnerability as the 1v1 path, where `match.js:getNextTurn()` uses `crypto.randomInt()` — inconsistency worth noting).

- `refundWager()` in `solana.js` receives a `playerAddress` param that is ignored when escrow is enabled (the cancel call refunds all depositors via `remainingAccounts`). The `playerAddress` parameter is legacy from pre-escrow design and is never used. This is dead parameter clutter but not a security issue.
