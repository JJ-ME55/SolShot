---
phase: 03-litepaper-v2.1-compliance
verified: 2026-02-20T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 3: Litepaper v2.1 Compliance Verification Report

**Phase Goal:** The running game matches every specification in Litepaper v2.1 - correct wager tiers, Custom Challenge mode, queue-based matchmaking, SHOT milestone emissions, Practice mode emission rate, 20-turn limit, tank movement, 3-forfeit rule, and treasury multisig governance
**Verified:** 2026-02-20
**Status:** PASSED
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Lobby enforces wager tiers 0/0.1/0.25/0.5/1.0 SOL; rejects non-tier amounts outside Custom Challenge | VERIFIED | WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0] in server/services/solana.js:37; isValidWager() checks whitelist for standard modes; validateMatchMode() enforces per-mode wager ranges |
| 2 | Custom Challenge accepts any wager >= 0.1 SOL and any BO1/BO3/BO5 format | VERIFIED | custom_challenge wagerRange [0.1, Infinity] formats [1,3,5] in solana.js:45; isValidWager bypasses whitelist (solana.js:178); validateMatchMode skips tier check (solana.js:58) |
| 3 | Standard modes pair players via matchmaking queue; Custom Challenge uses room codes | VERIFIED | matchmakingQueues Map in main.js:55; joinQueue at main.js:1006 auto-pairs and creates room; custom_challenge blocked (main.js:1011-1013); client emits joinQueue for standard modes, createRoom for custom (LobbyScreen.js:466,601-607) |
| 4 | SHOT milestone emissions fire at 8 defined milestones exactly once per account; Practice mode applies 25% rate | VERIFIED | 8 milestones in SHOT_MILESTONES (shot-token.js:57-66); dedup via state.milestonesEarned; rateMultiplier = isWagered ? 1.0 : 0.25 (shot-token.js:295); enriched context in normal path (main.js:1843-1864) and forfeit (main.js:277-306) |
| 5 | Rounds end at 20 turns or 0 HP; tanks move max 4 steps/turn; 3 consecutive timeouts forfeit the match | VERIFIED | turnsPerRound: 20 in createMatchState (match.js:101); isRoundOver checks turnCount >= turnsPerRound (match.js:148); moveCounts[id] >= 4 drops stepLeft/stepRight (main.js:2139,2171); consecutiveTimeouts[id] >= 3 triggers forfeit (main.js:238); timeouts reset on fire (main.js:1568-1569) |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|--------|
| server/services/solana.js | WAGER_TIERS, MATCH_MODES, validateMatchMode, isValidWager | VERIFIED | 319 lines; all required symbols exported with substantive implementations |
| server/socket-io/main.js | matchmakingQueues, joinQueue, leaveQueue, removeFromAllQueues, 4-step limit, 3-forfeit rule, enriched recordMatchPlayed, loadMilestoneState wiring | VERIFIED | 2260+ lines; all LP-01 through LP-08 handlers present and wired |
| server/services/shot-token.js | SHOT_MILESTONES (8), PRESTIGE_WEAPON_IDS, recordMatchPlayed enriched, loadMilestoneState, saveMilestoneState, 25% Practice multiplier | VERIFIED | 547 lines; all exports present with substantive implementations |
| server/services/match.js | turnsPerRound: 20, isRoundOver checks turn limit and HP | VERIFIED | 213 lines; createMatchState sets turnsPerRound: 20; isRoundOver checks both conditions |
| server/models/User.js | Milestone state fields in MongoDB schema | VERIFIED | Fields totalMatchesPlayed, wageredMatchesPlayed, wageredWins, consecutiveWins, milestonesEarned, shotBalance, totalBurned all present with defaults |
| client/src/screens/LobbyScreen.js | Client MATCH_MODES mirrors server; joinQueue for standard modes; createRoom for custom_challenge; queue UI state | VERIFIED | 739 lines; MATCH_MODES identical to server; joinQueue wired for standard modes; createRoom for custom |
| .planning/phases/03-litepaper-v2.1-compliance/TREASURY-GOVERNANCE.md | LP-09 treasury multisig documentation | VERIFIED | File exists; references TREASURY_WALLET env var and Squads Protocol; operational task, no code changes required |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| createRoom handler | isValidWager(wagerAmount, matchMode) | Direct call | WIRED | main.js:923 passes matchMode so custom_challenge bypasses tier whitelist |
| createRoom handler | validateMatchMode(matchMode, wagerAmount, rounds) | Direct call | WIRED | main.js:949 validates full mode+wager+format combination |
| authenticate handler | loadMilestoneState(walletAddress) | Await call | WIRED | main.js:462 - milestone state loaded on every successful authenticate |
| joinQueue handler | matchmakingQueues Map | Read/write | WIRED | main.js:1027-1063 - pushes to queue or auto-creates room when opponent found |
| disconnect handler | removeFromAllQueues(client.id) | Direct call | WIRED | main.js:551 - first action on disconnect, clears queue before room cleanup |
| startTurnTimer timeout | consecutiveTimeouts[id] >= 3 forfeit | Closure over roomId | WIRED | main.js:238; uses closure roomId variable, not this.roomId (correct outside socket context) |
| Forfeit path | settleMatch(winnerWallet, loserWallet, amount, roomId) | Wallet addresses from wagerStates | WIRED | main.js:266 - uses wsState.wallets[opponentId] and wsState.wallets[currentTurnId], not socketIds |
| Forfeit path | recordMatchPlayed(wallet, enrichedCtx) | Direct calls for both players | WIRED | main.js:284-306 - enriched context with isWagered, isWinner, maxRoundDamage, weaponsUsed |
| Forfeit path | removeRoom(roomId) | Direct call | WIRED | main.js:315 - uses module-level helper (cleanupRoom not in scope outside socket closure) |
| Fire handler | recordMatchPlayed(wallet, enrichedCtx) | Calls inside settlement lock | WIRED | main.js:1843-1864 - both players receive full enriched context |
| Fire handler | ms.consecutiveTimeouts[this.id] = 0 | Reset on fire | WIRED | main.js:1568-1569 - clears streak counter on any successful fire |
| stepLeft / stepRight | moveCounts[id] >= 4 limit | Match state check | WIRED | main.js:2139, 2171 - silent drop, server-side enforcement |
| recordMatchPlayed | rateMultiplier = isWagered ? 1.0 : 0.25 | In-function conditional | WIRED | shot-token.js:295 - all milestone rewards scaled before awarding |
| isRoundOver | turnsPerRound: 20 | Match state field | WIRED | match.js:148 - turnCount >= matchState.turnsPerRound |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| LP-01: Wager tiers 0.1/0.25/0.5/1.0 SOL | SATISFIED | None |
| LP-02: Custom Challenge >= 0.1 SOL, any BO format | SATISFIED | None |
| LP-03: Queue-based matchmaking for standard modes | SATISFIED | None |
| LP-04: 8 SHOT milestones, once per account, enriched context | SATISFIED | None |
| LP-05: Practice mode 25% SHOT emission rate | SATISFIED | None |
| LP-06: 20-turn round limit | SATISFIED | None |
| LP-07: Max 4 tank steps per turn | SATISFIED | None |
| LP-08: 3 consecutive timeout forfeit | SATISFIED | None |
| LP-09: Treasury multisig governance | SATISFIED | None (operational task, not code) |

---

## Anti-Patterns Found

No TODO/FIXME/placeholder/stub patterns found in any verified implementation file. All handlers contain substantive implementations.

---

## Human Verification Required

### 1. Queue Matchmaking - Live Pairing

**Test:** Open two browser sessions, set both to Quick Match BO1, click FIND QUICK MATCH in both.
**Expected:** Both clients show SEARCHING FOR OPPONENT then transition to weapon shop within seconds.
**Why human:** Queue pairing requires two live concurrent WebSocket connections - cannot verify from static analysis.

### 2. Custom Challenge Wager Input Validation

**Test:** Select Custom Challenge mode, enter 0.05 SOL in the wager input, attempt to create a challenge.
**Expected:** Input rejects value (HTML min=0.1 attribute) or server emits createRoomError with invalid wager tier.
**Why human:** Client-side input constraint enforcement varies across browsers and needs visual confirmation.

### 3. 3-Forfeit Rule - Turn Timeout Cascade

**Test:** Join a live match. Let one player turn expire (60 seconds) three times consecutively without firing.
**Expected:** After the third timeout, both clients receive matchEnd with forfeitReason: 3 consecutive turn timeouts.
**Why human:** Requires waiting 3 x 60 seconds in a live match - impractical to automate.

### 4. SHOT Milestone Emission - End-to-End

**Test:** Complete a wagered Quick Match as a player whose wageredMatchesPlayed counter is 0.
**Expected:** Post-match data includes shotEarned with earned: 10 (First Wagered Match milestone).
**Why human:** Requires a real wagered match on devnet with authenticated wallet and MongoDB connected.

### 5. Practice Mode 25% Rate

**Test:** Complete a Practice match that crosses the 100_total_matches milestone threshold.
**Expected:** Player earns 25 SHOT (25% of 100) rather than the full 100 SHOT.
**Why human:** Requires tracking SHOT balance across a qualifying Practice match with MongoDB connected.

---

## Gaps Summary

No gaps found. All 5 observable truths verified at all three levels: artifact exists, artifact is substantive (no stubs), artifact is wired into the system.

**LP-01/02 (Wager tiers + Custom Challenge):** Server-side whitelist with explicit custom_challenge bypass. createRoom passes matchMode to both isValidWager and validateMatchMode. Client MATCH_MODES is an exact structural mirror of the server definition.

**LP-03 (Queue matchmaking):** matchmakingQueues Map keyed by matchMode:matchLength provides per-format queuing. Auto-room-creation in joinQueue mirrors the manual createRoom+joinRoom flow including wager state, escrow, and startPick emission. Custom Challenge blocked by explicit early-return at top of joinQueue. removeFromAllQueues fires as first action in disconnect.

**LP-04/05 (SHOT milestones + Practice rate):** All 8 v2.1 milestones present with correct reward amounts and check functions. milestonesEarned array prevents double-claim. The 0.25 rate multiplier applied before reward calculation. Enriched context flows correctly through both normal fire-handler settlement path and startTurnTimer forfeit path. loadMilestoneState called on every successful authenticate to survive server restarts.

**LP-06 (20-turn limit):** turnsPerRound: 20 initialized in createMatchState. isRoundOver checks turnCount >= turnsPerRound. getRoundWinner falls back to damage score when both players retain HP - correct litepaper-compliant tiebreak for turn-limit exhaustion.

**LP-07/08 (Movement + forfeit):** 4-step limit silently enforced server-side in both stepLeft and stepRight via moveCounts. Counts reset on fire and on turn advance. consecutiveTimeouts initialized lazily, incremented on every timeout, reset on any successful fire. Forfeit uses closure roomId variable (correct - no socket context in startTurnTimer). Settlement uses wagerStates.wallets addresses, not socketIds.

**LP-09 (Treasury governance):** Documented in TREASURY-GOVERNANCE.md as an operational configuration task. Escrow program already routes 7% to TREASURY_WALLET environment variable. No code changes needed - Squads multisig setup required before mainnet deployment.

---

_Verified: 2026-02-20_
_Verifier: Claude (gsd-verifier)_
