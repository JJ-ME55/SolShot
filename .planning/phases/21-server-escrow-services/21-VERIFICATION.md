---
phase: 21-server-escrow-services
verified: 2026-02-28T07:18:58Z
status: passed
score: 5/5 must-haves verified
gaps: []
---

# Phase 21: Server Escrow Services - Verification Report

**Phase Goal:** The server-side service layer (escrow.js and solana.js) can create, settle, and cancel N-player escrow accounts, with correct pot math and N-player remaining_accounts for cancel.
**Verified:** 2026-02-28T07:18:58Z
**Status:** PASSED
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | createMatchEscrow accepts playerAddresses[] and passes Vec<Pubkey> to program | VERIFIED | escrow.js:287 - playerAddresses.map(a => new PublicKey(a)) passed as third arg to program.methods.createMatch(). IDL arg players is vec:pubkey. Both main.js call sites use array form (lines 1191, 1551). |
| 2 | settleMatchEscrow accepts winner from any position in the players array | VERIFIED | escrow.js:382-421 - passes winner pubkey to .settleMatch(winner). IDL doc confirms on-chain validation against N registered players. No JS position restriction. |
| 3 | cancelMatchEscrow passes all N deposited player addresses as remaining_accounts | VERIFIED | escrow.js:450-457 - .remainingAccounts() builder with playerAddresses array. IDL cancel_match accounts struct has no named player accounts. All 5 main.js call sites use array form with .filter(Boolean). |
| 4 | getEscrowState returns players[], depositsMask, maxPlayers, and numDeposited fields | VERIFIED | escrow.js:574-590 - all four N-player fields in return object. countBits() helper at line 548. Backward-compat shims playerOneDeposited/playerTwoDeposited also returned for main.js lines 2011-2012. |
| 5 | calculateSettlement returns wager * playerCount as total pot (not hardcoded wager * 2) | VERIFIED | solana.js:197 - totalPot = wagerSOL * playerCount (default 2). Zero occurrences of wagerSOL * 2. Both main.js display sites updated to ws.amount * (room?.players?.length || 2) (lines 2053, 2399). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/services/escrow.js` | N-player createMatchEscrow, cancelMatchEscrow with remainingAccounts, getEscrowState N-player fields, startWithDepositorsEscrow, permissionlessReclaimEscrow with remainingAccounts | VERIFIED | 596 lines. All five functions present and substantive. countBits() helper at line 548. No stub patterns. Syntax clean. |
| `server/services/solana.js` | settleMatch with playerCount param, refundWager with playerAddresses array, startWithDepositorsEscrow re-export | VERIFIED | 284 lines. settleMatch has playerCount=2 default at line 192. refundWager accepts playerAddresses array at line 235. startWithDepositorsEscrow in re-export block at line 281. |
| `server/socket-io/main.js` | All 8 escrow call sites updated to array form (5 cancelMatchEscrow, 2 createMatchEscrow, 1 refundWager) | VERIFIED | 2923 lines. All 5 cancelMatchEscrow calls use [p1, p2].filter(Boolean). Both createMatchEscrow calls use array form. refundWager uses [p1w, p2w].filter(Boolean). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/services/escrow.js` | `server/idl/solshot_escrow.json` | Function signatures match IDL instruction args/accounts | WIRED | IDL create_match args: match_id, wager_lamports, players Vec<pubkey>. IDL cancel_match has no named player accounts (remainingAccounts pattern). server/idl identical to target/idl (diff confirms). |
| `server/services/solana.js` | `server/services/escrow.js` | Delegates correctly with new signatures | WIRED | solana.js imports and re-exports all escrow functions including startWithDepositorsEscrow. refundWager passes playerAddresses array directly to cancelMatchEscrow. |
| `server/socket-io/main.js` | `server/services/escrow.js` | main.js imports cancelMatchEscrow directly - uses array signature | WIRED | main.js:13 imports cancelMatchEscrow from ../services/escrow.js. All 5 call sites confirmed array form. |
| `server/socket-io/main.js` | `server/services/solana.js` | refundWager call uses new array signature | WIRED | main.js:816 - refundWager(wallet, ws.amount, roomId, [p1w, p2w].filter(Boolean)). |

### Requirements Coverage

| Req ID | Description | Status | Evidence |
|--------|-------------|--------|----------|
| SRV-01 | createMatchEscrow accepts array of player addresses (2-4) | SATISFIED | escrow.js:280 - playerAddresses param, playerAddresses.map(a => new PublicKey(a)) |
| SRV-02 | buildDepositTransaction unchanged (player-agnostic) | SATISFIED | escrow.js:324 - signature buildDepositTransaction(matchId, playerAddress) unchanged |
| SRV-03 | settleMatchEscrow for N-player winner validation | SATISFIED | No JS change needed; on-chain program validates. escrow.js:382 signature unchanged. |
| SRV-04 | cancelMatchEscrow passes N player addresses via remaining_accounts | SATISFIED | escrow.js:450-457 - .remainingAccounts() builder with playerAddresses array |
| SRV-05 | getEscrowState returns players[], depositsMask, maxPlayers, numDeposited | SATISFIED | escrow.js:574-590 - all four fields present in return object |
| SRV-06 | settleMatch accepts N-player context (playerCount param) | SATISFIED | solana.js:192 - playerCount = 2 default, totalPot = wagerSOL * playerCount |
| SRV-07 | refundWager passes all N player addresses for cancel | SATISFIED | solana.js:235 - playerAddresses array param passed to cancelMatchEscrow |
| SRV-08 | calculateSettlement uses wager * playerCount for total pot | SATISFIED | solana.js:197-198 - totalPot = wagerSOL * playerCount, passed to calculateSettlement |
| SRV-17 | IDL synced (Phase 20) | SATISFIED | diff server/idl and target/idl confirms files identical |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server/services/solana.js` | 6 | Word placeholder in JSDoc comment (documentation only) | Info | No impact - documentation text, not code |

No blockers or warnings found. No stub patterns, empty returns, or TODO/FIXME in implementation code.

### Human Verification Required

None. All goal-relevant behaviors are verifiable from code structure:

- createMatchEscrow calls program.methods.createMatch() with a Vec<Pubkey> - IDL confirms arg type
- cancelMatchEscrow uses .remainingAccounts() - IDL confirms no named player accounts in cancel_match struct
- getEscrowState reads all four N-player fields from the Anchor account
- calculateSettlement receives wager * playerCount pot, not a hardcoded * 2

Runtime confirmation via actual devnet transactions is out of scope for structural verification and will be covered during Phase 22 integration testing.

### Notes on settleMatch playerCount in main.js

All three settleMatch call sites in main.js pass only 4 args (no playerCount), relying on the default of 2. This is intentional per plan 21-02: the 2-player wager guard (SYS-08) is still enforced, so only 2-player wager matches reach settlement. The playerCount parameter is forward-compatible for when the guard is lifted. SRV-06 is satisfied by the solana.js signature change.

---

_Verified: 2026-02-28T07:18:58Z_
_Verifier: Claude (gsd-verifier)_
