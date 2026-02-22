---
phase: 02-server-financial-security
verified: 2026-02-22T08:15:00Z
status: passed
score: 5/5 must-haves verified
gaps: []
# Original gap (turn-timer COMPLETE→CANCELLED) fixed in commit e26ffc6
---

# Phase 2: Server Financial Security -- Verification Report

**Phase Goal:** The escrow deposit flow verifies on-chain before accepting; settlement failures propagate to callers and trigger recovery; the rate limiter actually functions; queue wager mismatches are rejected
**Verified:** 2026-02-22T08:15:00Z
**Status:** gaps_found -- 4/5 must-haves verified
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fake escrowDepositConfirm with invalid txSignature is rejected | VERIFIED | getEscrowState(rid) at main.js line 1580; checks playerOneDeposited/playerTwoDeposited PDA booleans; emits escrowError if PDA not found, flag false, or wager mismatch |
| 2 | settleMatch() returns failure when settleMatchEscrow() fails | VERIFIED | solana.js lines 239-241: explicit failure return without falling through to dev-mode fallback |
| 3 | cancelMatchEscrow() called as recovery on settlement failure | PARTIAL | Call sites 2 and 3 correct. Call site 1 (turn-timer) also calls handleSettlementFailure() but then transitions to MATCH_STATES.COMPLETE at line 381 unconditionally |
| 4 | Rate limiter blocks the 31st event per second from one socket | VERIFIED | Float64Array at lines 441/445/447; RL_MAX_EVENTS=30; ringCount compares ring[i] > (now - 1000ms); Int32Array overflow eliminated |
| 5 | Queue wager mismatch rejected before pairing | VERIFIED | Lines 1118-1126: queue[0] peeked before queue.shift(); opponent.wager !== wagerAmount pushes joiner to queue and emits queueWaiting; returns without pairing |

**Score:** 4/5 truths verified (truth 3 partial -- recovery initiates but state machine wrong at turn-timer call site)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server/socket-io/main.js | Float64Array buffers, queue wager check, on-chain deposit verify, failedSettlements Map, handleSettlementFailure, 3 updated call sites | PARTIAL | All present but turn-timer missing CANCELLED transition on failure |
| server/services/solana.js | settleMatch() returns failure on escrow failure | VERIFIED | Line 241: explicit failure return without fallthrough |
| server/services/escrow.js | cancelMatchEscrow() and getEscrowState() with correct shapes | VERIFIED | Both substantive; getEscrowState returns playerOneDeposited/playerTwoDeposited/wagerLamports |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| main.js escrowDepositConfirm | escrow.js getEscrowState | async call line 1580 | WIRED | Called with rid; null checked with 2s retry; PDA booleans checked per player role |
| main.js escrowDepositConfirm | isEscrowEnabled guard | line 1577 | WIRED | Entire verify block gated; dev mode skips |
| solana.js settleMatch | escrow.js settleMatchEscrow | line 226 result check | WIRED | Failure returns explicit failure object, no silent fallthrough |
| main.js turn-timer | handleSettlementFailure | line 336 | PARTIAL | Called on failure but unconditional COMPLETE at line 381 |
| main.js cleanupRoom | handleSettlementFailure | line 590 | WIRED | Correct: CANCELLED transition then handleSettlementFailure |
| main.js fire-handler | handleSettlementFailure | line 1936 | WIRED | Correct: CANCELLED transition then handleSettlementFailure |
| handleSettlementFailure | cancelMatchEscrow | line 109 | WIRED | Imported escrow.js line 11; immediate cancel attempt on failure |
| failedSettlements | 60s retry cancelMatchEscrow | lines 77-99 | WIRED | setInterval, max 5 attempts before giving up |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SF-01: On-chain deposit verification | SATISFIED | None |
| SF-02: Settlement failure propagation | SATISFIED | None |
| SF-03: Settlement failure recovery | PARTIAL | Turn-timer call site initiates recovery but transitions to COMPLETE not CANCELLED |
| SF-04: Fix Int32Array rate limiter | SATISFIED | None |
| SF-05: Queue wager validation | SATISFIED | None |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/socket-io/main.js | 381 | Unconditional MATCH_STATES.COMPLETE after settlement in turn-timer path | Warning | Failure marks match COMPLETE; recovery IS initiated via cancelMatchEscrow but state contradicts outcome |

---

## Human Verification Required

None -- all critical security paths are verifiable structurally from the code.

---

## Gaps Summary

One gap prevents full goal achievement for success criterion 3.

### Turn-timer call site does not transition to CANCELLED on settlement failure

At lines 301-391 of server/socket-io/main.js, when settleMatch() returns a failure at line 334, handleSettlementFailure() is correctly called to initiate cancelMatchEscrow() recovery. However, execution continues to line 381 where transitionState(ms, MATCH_STATES.COMPLETE) is called unconditionally. The match is marked COMPLETE even when funds were not settled on-chain.

The 02-02-SUMMARY.md claimed all 3 callers correctly transition to CANCELLED on settlement failure. That claim is inaccurate for call site 1. The SUMMARY also acknowledged this in the Decisions section as a minor gap deferred to a future plan.

The other two call sites are correct:
- cleanupRoom (lines 586-590): checks !settlementResult.success, transitions to CANCELLED, calls handleSettlementFailure
- fire handler (lines 1931-1936): checks !sResult.success, transitions to CANCELLED, calls handleSettlementFailure

### Fix required in server/socket-io/main.js around lines 327-381

Add a settlementSucceeded flag initialized to true, set it false on failure, and gate the transition:

    let settlementSucceeded = true
    if (wsState && wsState.amount > 0) {
        if (winnerWallet && loserWallet) {
            try {
                const result = await settleMatch(...)
                if (!result.success) {
                    settlementSucceeded = false
                    await handleSettlementFailure(...)
                }
            } catch (err) {
                settlementSucceeded = false
                await handleSettlementFailure(...)
            }
        }
    }
    // Replace line 381 with:
    transitionState(ms, settlementSucceeded ? MATCH_STATES.COMPLETE : MATCH_STATES.CANCELLED)

---

*Verified: 2026-02-22T08:15:00Z*
*Verifier: Claude (gsd-verifier)*
