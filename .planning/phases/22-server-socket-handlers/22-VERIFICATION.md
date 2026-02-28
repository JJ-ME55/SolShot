---
phase: 22-server-socket-handlers
verified: 2026-02-28T09:39:48Z
status: passed
score: 6/6 must-haves verified
gaps: []
human_verification:
  - test: 4-player wagered room deposit flow end-to-end
    expected: All 4 players receive escrowDeposit simultaneously; escrowActive fires when all 4 confirm
    why_human: Requires 4 connected wallet clients on devnet
  - test: Partial deposit scenario 2-of-4 players deposit timer expires
    expected: First depositor receives escrowPartialDeposit with canStart true; others receive escrowPartialWaiting
    why_human: Timer behavior requires real sockets
  - test: escrowPartialStart chosen non-depositors kicked
    expected: Non-depositors receive kickedFromRoom; room.players compacted; escrowActive fires for remaining players
    why_human: Requires real socket connections
  - test: escrowCancelAll chosen room preserved
    expected: All players receive escrowCancelledAll; room.players unchanged
    why_human: Requires real socket connections and on-chain cancel verification
  - test: 3-player wagered room via lobby UI
    expected: createRoom with maxPlayers 3 and wager succeeds without createRoomError
    why_human: Client-side lobby may have its own guard not yet removed
  - test: BO3 playAgain in 4-player room
    expected: playAgain resets with maxPlayers 4 preserved; new escrowDeposit cycle fires for all 4 players
    why_human: Requires full match completion cycle with real sockets
---

# Phase 22: Server Socket Handlers Verification Report

**Phase Goal:** The game server orchestrates N-player escrow from room-full through match start, handles partial deposit timeout with host choice, and records SHOT milestones + playAgain state correctly for all N players.
**Verified:** 2026-02-28T09:39:48Z
**Status:** PASSED
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a 4-player wagered room fills, all 4 players receive escrowDeposit simultaneously | VERIFIED | room.players.forEach emit loop at line 1270 in joinRoom; same pattern in joinQueue at line 1695 and playAgain at line 126 |
| 2 | After all N players confirm deposits, server emits escrowActive and match begins | VERIFIED | room.players.every() check at line 2192; escrowActive emitted at line 2204; totalPot uses room.players.length at line 2207 |
| 3 | When 5-minute deposit timer expires with partial deposits, first depositor receives escrowPartialDeposit | VERIFIED | 3-branch timeout at lines 1283-1385; branch 3 emits escrowPartialDeposit with numDeposited, totalPlayers, depositorWallets, canStart, decisionWindowMs at line 1336 |
| 4 | Host can choose escrowPartialStart or escrowCancelAll | VERIFIED | escrowPartialStart at line 2213; escrowCancelAll at line 2293; both validate partialDecisionMaker identity; escrowCancelAll preserves room at line 2324 |
| 5 | 3-4 player room can select wagered modes without wager guard blocking | VERIFIED | SYS-08 wager guard absent; trackWager uses wagerAmount * maxPlayers at line 1541 |
| 6 | After BO3 match, playAgain resets with correct maxPlayers preserved | VERIFIED | createMatchState(roomId, paRoundType, room.players.length) at line 90; wagerStates amount+wallets preserved; fresh escrow cycle at lines 111-175 |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server/socket-io/main.js | N-player escrow orchestration | VERIFIED | 3181 lines, syntax valid (node --check passes); all handlers present and wired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| main.js import | startWithDepositorsEscrow in solana.js | Destructured import line 12 | WIRED | Used at line 2238 in escrowPartialStart handler |
| main.js escrowDepositConfirm | getEscrowState depositsMask | bitmask at line 2149 | WIRED | playerIndex = room.players.findIndex() at line 2144 |
| main.js escrowPartialStart | startWithDepositorsEscrow(roomId) | On-chain call before kick at line 2238 | WIRED | Guarded by isEscrowEnabled() |
| main.js escrowCancelAll | cancelMatchEscrow(roomId, depositorWallets) | Refund using room.players order | WIRED | line 2317; wallets from room.players.filter().map() at line 2312 |
| main.js matchEnd | recordMatchPlayed loop | for (const p of room.players) at line 2744 | WIRED | playerWalletMap built at lines 2730-2733 |
| main.js forfeit path in startTurnTimer | recordMatchPlayed loop | for (const p of room.players) at lines 559-572 | WIRED | Inside module-level startTurnTimer function |
| main.js resetForPlayAgain | createMatchState third arg | room.players.length as maxPlayers at line 90 | WIRED | Was previously called without third arg |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SRV-09: N-player escrow creation with all player wallets | SATISFIED | createMatchEscrow(roomId, roomWager, allWallets) at line 1256; allWallets = room.players.map() at line 1253 |
| SRV-10: Deposit TXs built and emitted to all N players | SATISFIED | Promise.all(room.players.map()) at line 1262; forEach emit loop at line 1270 |
| SRV-11: Deposit confirmation uses depositsMask bitmask | SATISFIED | (escrowState.depositsMask and 1 shifted left playerIndex) at line 2149 |
| SRV-12: DEPOSIT_TIMEOUT_MS is 300_000 (5 minutes) | SATISFIED | const DEPOSIT_TIMEOUT_MS = 300_000 at line 62 |
| SRV-13: Partial deposit flow with escrowPartialDeposit event | SATISFIED | 3-branch timeout at lines 1283-1385; escrowPartialDeposit emitted at line 1336 |
| SRV-14: escrowPartialStart handler | SATISFIED | Lines 2213-2290; validates decision-maker, calls on-chain, kicks non-depositors, compacts room.players, emits escrowActive |
| SRV-15: escrowCancelAll handler | SATISFIED | Lines 2293-2340; refunds depositors on-chain, preserves room, emits escrowCancelledAll |
| SRV-16: Wager guard removed | SATISFIED | No wagerAmount greater-than-zero and maxPlayers greater-than-2 check; SYS-08 comment absent from file |
| SRV-18: escrowDepositStatus event | SATISFIED | Emitted at line 2181 with roomId, deposits array of socketId/wallet/confirmed, numDeposited, totalPlayers |
| DEBT-01: N-player SHOT milestones and DB persist | SATISFIED | Match-end loop lines 2744-2757; forfeit loop lines 559-572; DB persist loop lines 2829-2851; Object.fromEntries at lines 2792-2801 |
| DEBT-02: playAgain maxPlayers preservation | SATISFIED | createMatchState(roomId, paRoundType, room.players.length) at line 90; wagerStates amount+wallets preserved |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/socket-io/main.js | 2197 | Stale comment: Both players deposited - escrow is now active | Info | Logic below correctly uses room.players.every() at line 2192 - cosmetic only, no functional impact |
| server/socket-io/main.js | 2683 | totalPot: ws.amount * (room players length with fallback 2) | Info | Fallback 2 is in the settlement display payload only, not load-bearing - room always defined at this point |

No blockers. No stub patterns. No empty handlers.

### Human Verification Required

#### 1. 4-Player Wagered Room - Deposit Flow End-to-End

**Test:** Create a 4-player wagered room (Quick Match, 0.1 SOL), have all 4 clients join, observe socket events.
**Expected:** All 4 players receive escrowDeposit simultaneously when room fills; each includes transaction, escrowPDA, wager, depositDeadlineMs; after all 4 call escrowDepositConfirm, all 4 receive escrowActive with totalPot = wager * 4 * 0.9.
**Why human:** Requires 4 connected wallet clients on devnet. Socket fan-out timing and transaction signing cannot be verified statically.

#### 2. Partial Deposit Scenario

**Test:** 4-player wagered room, only 2 players sign their escrowDeposit; wait for 5-minute timer.
**Expected:** First depositor receives escrowPartialDeposit with numDeposited:2, totalPlayers:4, canStart:true, decisionWindowMs:30000; other 3 players receive escrowPartialWaiting with decisionMaker field.
**Why human:** Timer expiry requires controlled real-time testing with real sockets.

#### 3. escrowPartialStart - Non-Depositors Kicked

**Test:** After escrowPartialDeposit fires, first depositor sends escrowPartialStart event.
**Expected:** Non-depositors receive kickedFromRoom with reason and destination:lobby; room.players compacted to depositors only; escrowActive fires for remaining players.
**Why human:** Requires real socket connections to observe kick delivery and room state update.

#### 4. escrowCancelAll - Room Preserved

**Test:** After escrowPartialDeposit fires, first depositor sends escrowCancelAll event.
**Expected:** All players receive escrowCancelledAll with reason:host_cancelled; room.players unchanged; room.escrowPDA reset to null; players remain in room.
**Why human:** Requires real socket connections and on-chain cancel verification.

#### 5. 3-Player Wagered Room via Lobby UI

**Test:** Open lobby UI, select 3 players and Quick Match mode and non-zero wager, click Create Room.
**Expected:** Room created successfully; no createRoomError; room appears in room list with maxPlayers:3.
**Why human:** Client-side lobby UI needs to pass maxPlayers:3 in createRoom payload. Server guard is removed but client may have its own guard.

#### 6. BO3 playAgain in 4-Player Room

**Test:** Complete a BO3 4-player wagered match, all 4 players click Play Again.
**Expected:** New match state created with maxPlayers:4; all 4 players receive escrowDeposit for new round; deposit timer restarts with full 5 minutes.
**Why human:** Requires full match completion cycle with real sockets.

### Gaps Summary

No gaps. All automated checks pass across all three plans.

**Plan 22-01 (N-player escrow creation):** DEPOSIT_TIMEOUT_MS = 300_000 at line 62 (was 120_000). startWithDepositorsEscrow imported at line 12, used at line 2238. N-player wallet collection via room.players.map() in joinRoom (line 1253), joinQueue (line 1682), and playAgain IIFE (line 113). depositsMask bitmask at line 2149. escrowDepositStatus broadcast at line 2181 with full per-player deposit map. firstDepositorSocketId tracking at line 2176.

**Plan 22-02 (Partial deposit flow):** 3-branch deposit timeout (lines 1283-1385) with all-deposited noop, zero-deposits cancel+destroy, partial decision flow. escrowPartialDeposit emitted at line 1336 with canStart (true when numDeposited >= 2), decisionWindowMs:30_000. escrowPartialWaiting to non-decision-makers at line 1351. 30s auto-cancel reuses depositTimers slot at line 1361. escrowPartialStart handler (lines 2213-2290) validates identity, calls on-chain, kicks non-depositors, compacts room.players, promotes host, emits escrowActive. escrowCancelAll handler (lines 2293-2340) validates identity, refunds on-chain, preserves room, emits escrowCancelledAll. SYS-08 wager guard fully absent. trackWager(wagerAmount * maxPlayers) at lines 1541 and 1676.

**Plan 22-03 (SHOT milestones + playAgain):** N-player recordMatchPlayed loops for match-end (lines 2744-2757) and forfeit (lines 559-572). Object.fromEntries(room.players.map()) for prestigeInfo and earnedMilestones at lines 2792-2801. N-player DB persist loop with isWinner conditional at lines 2829-2851. solWonAmt = wagerAmt * room.players.length * 0.9 at line 2810. createMatchState(roomId, paRoundType, room.players.length) at line 90 in resetForPlayAgain. wagerStates deposits cleared but amount+wallets preserved at lines 95-101. playAgain wagered rematch escrow IIFE at lines 111-175 with full 3-branch deposit timeout. failedSettlements allWallets shape at lines 189 and 218-238; retry backward-compat fallback at line 201.

---

_Verified: 2026-02-28T09:39:48Z_
_Verifier: Claude (gsd-verifier)_
