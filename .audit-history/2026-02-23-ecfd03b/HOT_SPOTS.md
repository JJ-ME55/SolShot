# HOT_SPOTS.md — Solshot Escrow Program Security Audit

File: programs/solshot-escrow/src/lib.rs
Audit Date: 2026-02-23
Audit Method: Static pattern pre-scan (grep-based)

## Summary

Total Patterns Matched: 22
- HIGH Risk: 11
- MEDIUM Risk: 11
- Files Scanned: 1

Status: No CRITICAL findings. Program demonstrates strong defensive architecture.

## Results by Focus Area

### 1. Access Control & Account Validation (HIGH PRIORITY)

Winner Validation (Lines 574-579)
- Risk: HIGH
- Pattern: /// CHECK: Constrained to escrow.player_one or escrow.player_two
- Mitigation: Anchor constraint enforces winner in (player_one, player_two)
- Resolves: H008 (arbitrary winner), H002 (treasury theft), S001 (dup accounts)

Treasury/Ops Validation (Lines 584-596)
- Risk: HIGH
- Pattern: constraint = treasury.key() == config.treasury AND treasury != ops
- Mitigation: Prevents fee accounts from being swapped or duplicated

Signer Constraints (Lines 458, 474, 489, 504, 521, 545, 571, 624, 664)
- Risk: HIGH
- Pattern: 9 instances of pub X: Signer<'info>
- Mitigation: All authority/caller/player operations require signer

has_one Validation (Lines 470, 485, 500, 565, 604)
- Risk: HIGH
- Pattern: 5 instances of has_one = authority @ EscrowError
- Mitigation: Authority must match config.authority

Pause Guards (Lines 527, 551, 605, 644)
- Risk: HIGH
- Pattern: 4 instances of constraint = !config.is_paused
- Mitigation: Economic operations blocked during emergency pause (OC-04)

### 2. Arithmetic Safety (HIGH PRIORITY)

Type Casting (Lines 253-267)
- Risk: HIGH
- Pattern: 6 instances of 'as u128' widening before BPS math, 'as u64' narrowing after
- Mitigation: Prevents overflow at max wager (100 SOL ~ 1e11 lamports)
- BOK Compliance: Gap OC-09 — proper u128 widening

Checked Operations (Lines 213-214, 238, 271-274, 330, 405)
- Risk: HIGH
- Pattern: .checked_mul(), .checked_sub(), .checked_add() throughout
- Mitigation: 13 total checked operations prevent arithmetic overflow/underflow
- BOK Compliance: Gap GAP-002 — remainder strategy prevents dust loss

### 3. State Machine & Error Handling

MatchState Enum (Line 757)
- Risk: MEDIUM
- Pattern: 4 states (AwaitingDeposits, Active, Settled, Cancelled)
- Mitigation: Terminal states prevent re-entry

Pause Mechanism (Lines 61, 94, 101, 699)
- Risk: MEDIUM
- Pattern: is_paused boolean; checked on 4 economic operations
- Mitigation: Global emergency pause (OC-04)

State Ordering (Lines 279, 354, 416)
- Risk: MEDIUM
- Pattern: State set BEFORE transfers (OC-10 defense-in-depth)
- Mitigation: 3 instances ensure state terminal before lamport movement

### 4. CPI & External Calls

System Transfer (Line 180)
- Risk: HIGH
- Pattern: CpiContext::new for system_program::Transfer
- Mitigation: Only CPI call; properly constructed context

Direct Transfers (Lines 284-291, 359-367, 421-428)
- Risk: HIGH
- Pattern: Direct try_borrow_mut_lamports() for settlement/refunds
- Mitigation: Native SOL (lamports) only; no SPL Token risk

### 5. Token & Economic

Fee Constants (Lines 15-17)
- Risk: MEDIUM
- Pattern: TREASURY_BPS=700 (7%), OPS_BPS=300 (3%), denominator=10000
- Note: Hardcoded; immutable post-deploy

Wager Bounds (Lines 29, 32)
- Risk: MEDIUM
- Pattern: MIN=10k lamports (0.00001 SOL), MAX=100 SOL
- Mitigation: Min ensures fees >= 1 lamport; Max prevents unfundable escrows

### 6. Timing & Ordering

Timeout Tiers (Lines 20, 23, 26)
- Risk: MEDIUM
- Pattern: 24h player timeout, 48h permissionless (DCA-02), 1h settlement deadline (OC-07)
- Mitigation: Three-tier timeout system with backward compatibility

Timestamp Recording (Lines 140, 209)
- Risk: MEDIUM
- Pattern: created_at and activated_at captured via Clock::get()
- Mitigation: activated_at=0 initially; set only at Active transition

Deadline Enforcement (Lines 237-243, 322-326, 329-333, 404-411)
- Risk: MEDIUM
- Pattern: Checked arithmetic for all deadline calculations
- Mitigation: All use checked_add to prevent timestamp overflow

### 7. Oracle & External Data

Status: NONE
Finding: Program uses only Clock::get() for timestamps; no external oracles

### 8. Upgrade & Admin

Upgrade Authority Warning (Lines 1-2)
- Risk: MEDIUM
- Pattern: NOTE: OC-13 — transfer upgrade authority to multisig before mainnet
- Action: REQUIRED before production deployment

Program ID (Line 7)
- Risk: MEDIUM
- Pattern: declare_id!("CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD")
- Note: Devnet ID; update before mainnet

Config Management (Lines 47-88)
- Risk: MEDIUM
- Pattern: initialize_config (singleton PDA), update_config (authority updates)
- Design: Authority can change own key (lockout risk noted)

## Key Strengths

1. Arithmetic: OC-09 compliant — u128 widening, all checked, remainder strategy
2. Access Control: OC-02/OC-03 compliant — all recipients validated
3. State Machine: OC-10 compliant — state BEFORE transfers, clear terminal states
4. Emergency Pause: OC-04 compliant — global pause on all economic operations
5. Timing: OC-07 compliant — settlement deadline, timeouts, backward compat
6. No CPI Risk: Direct lamport transfers avoid token program risks
7. No Oracle Risk: Clock-only; no external data feeds

## Pre-Mainnet Tasks

- Transfer upgrade authority to multisig (line 1-2)
- Update declare_id! to mainnet program ID (line 7)
- Separate multisig for pause_program vs update_config (governance)
- Verify PDA rent exemption at max wager (100 SOL)
- Manual audit of UncheckedAccount constraints

End of Report
