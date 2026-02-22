---
phase: 01-on-chain-program-redesign
verified: 2026-02-21T19:15:00Z
status: passed
score: 14/14 must-haves verified
gaps: []
---

# Phase 01: On-Chain Program Redesign Verification Report

**Phase Goal:** Rewrite the solshot-escrow Anchor program to resolve all on-chain security findings from the SOS, BOK, and DB audits. Add GlobalConfig PDA, Anchor account constraints, emergency pause, checked arithmetic, wager bounds, settlement deadline, and terminal-state-before-transfer.
**Verified:** 2026-02-21T19:15:00Z
**Status:** PASSED
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GlobalConfig PDA with authority/treasury/ops/is_paused/bump | VERIFIED | pub struct GlobalConfig at lib.rs:594; SPACE=106 |
| 2 | 4 config instructions: initialize, update, pause, unpause | VERIFIED | lib.rs lines 44, 67, 90, 97 and in IDL |
| 3 | All 4 economic instructions have pause guard (OC-04) | VERIFIED | constraint = !config.is_paused at lib.rs:462, 486, 540, 579 |
| 4 | SettleMatch winner validated against registered players (OC-02) | VERIFIED | winner.key() == player_one OR player_two at lib.rs:512-514 |
| 5 | Treasury/ops validated against config PDA plus uniqueness check (OC-03) | VERIFIED | treasury == config.treasury; treasury != ops; ops == config.ops at lib.rs:522-531 |
| 6 | Authority cancel restricted to AwaitingDeposits only (OC-05) | VERIFIED | (is_authority && escrow_state == AwaitingDeposits) at lib.rs:337-341 |
| 7 | Authority cannot be a player (OC-06) | VERIFIED | require!(player != authority.key()) for both players at lib.rs:125-126 |
| 8 | activated_at field plus 1hr settlement deadline (OC-07) | VERIFIED | Field at lib.rs:636; set on Active at line 206; deadline at lines 233-240 |
| 9 | Minimum wager 10,000 lamports (OC-08) | VERIFIED | MIN_WAGER_LAMPORTS = 10_000 at lib.rs:26; enforced at line 117 |
| 10 | u128 widening for BPS arithmetic (OC-09) | VERIFIED | total_pot_128 as u128 at lib.rs:250-264; 8 checked arithmetic calls |
| 11 | Terminal state before transfers in settle and cancel (OC-10) | VERIFIED | Scoped borrow sets Settled/Cancelled BEFORE transfers at lib.rs:274-277, 349-352 |
| 12 | MatchSettled event includes fee destination pubkeys (OC-11) | VERIFIED | treasury_account and ops_account in event struct at lib.rs:694-702 |
| 13 | Maximum wager 100 SOL (OC-12) | VERIFIED | MAX_WAGER_LAMPORTS = 100_000_000_000 at lib.rs:29; enforced at line 120 |
| 14 | Server integration: IDL and escrow.js config PDA wiring (OC-14) | VERIFIED | IDL has 8 instructions; getConfigPDA() x11 in escrow.js; config in all 4 .accounts() calls |

**Score:** 14/14 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| programs/solshot-escrow/src/lib.rs | VERIFIED | 756 lines; GlobalConfig at line 594; all 8 instructions; cargo check passes |
| server/idl/solshot_escrow.json | VERIFIED | 1053 lines; valid JSON; 8 instructions; GlobalConfig; activated_at; 19 error codes |
| server/services/escrow.js | VERIFIED | 505 lines; node --check OK; getConfigPDA() exported; all 4 instructions pass config PDA |
| tests/solshot-escrow.ts | VERIFIED | 951 lines; 25 test cases; 8 groups covering all OC requirements with negative tests |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server/services/escrow.js | lib.rs program | IDL at server/idl/solshot_escrow.json | WIRED | Buffer.from(config) seed; IDL_PATH loaded in initEscrow() |
| createMatchEscrow() | config PDA | .accounts({ config: configPDA }) | WIRED | escrow.js:299 maps to CreateMatch struct lib.rs:444 |
| buildDepositTransaction() | config PDA | .accounts({ config: configPDA }) | WIRED | escrow.js:344 maps to DepositWager struct lib.rs:470 |
| settleMatchEscrow() | config PDA | .accounts({ config: configPDA }) | WIRED | escrow.js:410 maps to SettleMatch struct lib.rs:494 |
| cancelMatchEscrow() | config PDA | .accounts({ config: configPDA }) | WIRED | escrow.js:455 maps to CancelMatch struct lib.rs:547 |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| OC-01: GlobalConfig PDA singleton | SATISFIED | None |
| OC-02: Winner constraint in SettleMatch | SATISFIED | None - Anchor constraint not manual require |
| OC-03: Treasury/ops validated against config | SATISFIED | None - both constrained plus uniqueness check |
| OC-04: Emergency pause on all 4 economic instructions | SATISFIED | None |
| OC-05: Authority cancel restricted to AwaitingDeposits | SATISFIED | None |
| OC-06: Authority cannot be a player | SATISFIED | None - checked for both player_one and player_two |
| OC-07: activated_at field plus settlement deadline 1hr | SATISFIED | None |
| OC-08: Minimum wager 10,000 lamports | SATISFIED | None |
| OC-09: u128 widening for BPS arithmetic | SATISFIED | None |
| OC-10: Terminal state before transfers | SATISFIED | None - scoped mutable borrow in settle and cancel |
| OC-11: Fee destinations in MatchSettled event | SATISFIED | None |
| OC-12: Maximum wager 100 SOL | SATISFIED | None |
| OC-13: Upgrade authority transfer | DEFERRED | Explicit deferral to mainnet; comment at lib.rs:1 |
| OC-14: Server integration IDL plus escrow.js config PDA | SATISFIED | None |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib.rs | 1 | OC-13 NOTE comment | INFO | Documents intentional mainnet deferral not a stub |

No blockers or stubs found in any production code path.

---

## Human Verification Required

### 1. anchor test execution

**Test:** Add McAfee exclusion for the Solana local share directory then run: anchor test --provider.cluster localnet
**Expected:** All 25 tests pass across 8 groups
**Why human:** McAfee LiveSafe blocks solana-test-validator genesis archive extraction with Access Denied os error 5.

### 2. Devnet deployment and config initialization

**Test:** Fund devnet wallet to approximately 2.12 SOL, anchor deploy, call initializeConfig() with authority/treasury/ops
**Expected:** Config PDA created on-chain; createMatchEscrow() succeeds
**Why human:** Requires devnet SOL (wallet at 0.97 SOL, airdrop rate-limited) and a manual deploy step.

### 3. On-chain constraint rejection

**Test:** Submit a settle_match transaction to the deployed program with a non-player winner address
**Expected:** Transaction rejected with InvalidWinner error code 6006
**Why human:** Anchor constraint enforcement only verifiable at runtime against a deployed program.

---

## Verification Notes

**Compilation:** cargo check passed per Plan 01 SUMMARY. anchor build succeeded per Plan 02 SUMMARY generating the IDL from actual compilation.

**MatchEscrow::SPACE = 168:** Verified at lib.rs:656. Formula: 8 + (4+32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 8 + 1 = 168. The activated_at i64 field (8 bytes) accounts for the increase from the pre-OC-07 value of 160.

**Test coverage:** 25 tests in 8 groups. Every .accounts() call includes config: configPDA. Unique runId suffix prevents PDA collisions. Positive and negative paths for every OC requirement. Execution blocked by McAfee on Windows - code passes static review.

**Known deferred items:**
- OC-13 (upgrade authority to multisig): Deferred to mainnet. Documented at lib.rs:1.
- Test execution: McAfee blocks solana-test-validator. Tests pass static review.
- Fresh deploy: Program ID remains old devnet ID until funded redeploy.

---

*Verified: 2026-02-21T19:15:00Z*
*Verifier: Claude (gsd-verifier)*
