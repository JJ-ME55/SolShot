# Stronghold of Security - Final Audit Report

**Audit ID:** sos-solshot-escrow-clean-2026-02-23
**Program:** SolShot Escrow (`programs/solshot-escrow/src/lib.rs`)
**Protocol Type:** Escrow/Wagering (SOL-only)
**Ecosystem:** Solana / Anchor
**LOC:** 855 (single file)
**Git Ref:** `ecfd03ba15f64bd17606ce16ab2a29dcbd0d7361`
**Audit Date:** 2026-02-23
**Audit Tier:** Quick (coverage verification skipped)
**Auditor:** The Fortress v2.0 / Stronghold of Security

---

## 1. Executive Summary

### Overall Security Posture

SolShot Escrow is a single-file Anchor program (855 LOC) implementing a 1v1 wagered match escrow using native SOL. The program's arithmetic is sound (u128 widening, checked operations, overflow-checks=true), the state machine lifecycle is well-guarded (OC-10 state-before-transfer pattern), and the CPI surface is minimal (single System Program call for deposits). The permissionless_reclaim instruction provides an effective 48h escape hatch ensuring no funds are permanently stuck.

However, the program's security posture is **critically compromised by centralization risk and missing access control gates**. The server authority has unilateral, instantaneous, irreversible power over: winner selection, fee destinations, program pause, and its own transfer -- all without timelock, multisig, or propose/accept patterns. A single authority key compromise enables complete protocol takeover and fund extraction within a single transaction bundle.

Three CRITICAL-severity findings define the threat landscape:

1. **S004 (CVSS 9.3):** The `create_match` instruction lacks `has_one = authority`, enabling any wallet to pre-squat PDA namespaces. Combined with public roomId broadcast via WebSocket, this allows an automated attacker to silently disable on-chain wager escrow for every match at near-zero cost.

2. **S001 (CVSS 8.7):** A chain attack combining authority takeover (H001) + fee redirect (H002) + winner fraud (H005) enables 100% fund extraction from all active matches plus permanent governance lockout upon authority key compromise.

3. **H001 (CVSS 8.7):** One-step authority transfer with no propose/accept, no timelock, no zero-address guard. Historical precedent: Raydium $4.4M, Step Finance $30-40M.

The program has strong defenses against flash loans, sandwich attacks, oracle manipulation, reentrancy, and arithmetic overflow. The primary attack surface is governance centralization and a single missing access control constraint on `create_match`.

### Key Statistics

| Metric | Count |
|--------|-------|
| Total Strategies Investigated | 34 |
| CONFIRMED Vulnerabilities | 12 |
| POTENTIAL Issues (conditional) | 5 |
| NOT VULNERABLE (cleared) | 17 |
| Confirmation Rate | 50% (17/34 actionable) |

---

## 2. Scope and Methodology

### Scope

| Attribute | Value |
|-----------|-------|
| Program | `programs/solshot-escrow/src/lib.rs` (855 LOC) |
| Framework | Anchor (Solana) |
| Protocol Type | 1v1 SOL escrow/wagering |
| Instructions | 9 (initialize_config, update_config, pause_program, unpause_program, create_match, deposit_wager, settle_match, cancel_match, permissionless_reclaim) |
| CPI Surface | System Program only (deposit_wager) |
| Token Types | Native SOL only (no SPL tokens) |
| Off-chain Dependencies | Server socket handlers referenced for S004 analysis |

### Methodology

This audit followed the Stronghold of Security (SOS) methodology:

1. **Phase 0/0.5 -- Pre-Flight & Static Scan:** Configuration detection, KB manifest generation, hot-spot pattern scanning
2. **Phase 1/1.5 -- Parallel Context Building:** 6 specialized auditor agents (Access Control, Arithmetic, State Machine, CPI/External, Token/Economic, Timing/Ordering) analyzed the program independently
3. **Phase 2/3 -- Architecture Synthesis & Strategy Generation:** Unified architectural understanding, 30 primary + 4 supplemental attack strategies generated across 3 tiers
4. **Phase 4/4.5 -- Parallel Investigation:** All 34 strategies investigated with evidence-based status determination
5. **Phase 5 -- Final Synthesis:** Combination matrix, attack trees, severity re-calibration, this report

### Coverage Notes

- **Quick tier:** Coverage verification was SKIPPED. All 34 strategies were investigated.
- **Not a stacked audit:** No previous findings or HANDOVER.md.
- **Off-chain code referenced:** Server socket handlers (`main.js`) were analyzed for S004 to verify the public roomId broadcast and missing retry logic. The on-chain program remains the primary audit target.

---

## 3. Severity Breakdown

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| **CRITICAL** | 3 | S004, S001, H001 |
| **HIGH** | 9 | H002, H003, H005(P), H006, H007, H008, H011, H014(P), S002 |
| **MEDIUM** | 4 | H009(P), H010, H017(P), H027(P) |
| **LOW** | 1 | H016 |
| **NOT VULNERABLE** | 17 | H004, H012-H013, H015, H018-H026, H028-H030, S003 |

(P) = POTENTIAL status -- vulnerability exists conditionally, typically requiring authority compromise as precondition.

### CVSS Score Summary

| ID | Finding | Status | CVSS | Vector |
|----|---------|--------|------|--------|
| S004 | PDA Namespace Pre-Squatting DoS | CONFIRMED | 9.3 | `AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:H` |
| S001 | Chain: Authority Takeover + Fee Redirect + Winner Fraud | CONFIRMED | 8.7 | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H001 | One-Step Authority Transfer Takeover | CONFIRMED | 8.7 | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H003 | update_config Distinctness Bypass -> Settlement DoS | CONFIRMED | 8.7 | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H008 | CreateMatch PDA Occupancy DoS | CONFIRMED | 8.2 | `AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:L/A:H` |
| H002 | Fee Destination Hijack via update_config | CONFIRMED | 8.7* | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H006 | 23-Hour Dead Zone Fund Lockup | CONFIRMED | 8.7* | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H007 | Pause-as-Griefing on Active Matches | CONFIRMED | 8.7* | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| H011 | Config Treasury Self-Redirect | CONFIRMED | 8.7* | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |
| S002 | Chain: Distinctness Poison + Pause Double Lock | CONFIRMED | 8.7* | `AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H` |

*Scores for PR:H findings reflect post-compromise blast radius. Operational severity should be treated as higher given hot wallet authority model.

---

## 4. Detailed Findings

### CRITICAL FINDINGS

---

#### CRITICAL-01: S004 -- PDA Namespace Pre-Squatting DoS

**Status:** CONFIRMED | **Confidence:** 9/10
**CVSS:** 9.3 (`AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:H`)
**Location:** `lib.rs:507-532` (CreateMatch struct), `server/socket-io/main.js:1163,1204`
**Category:** Access Control, Resource/DoS
**Precedent:** EP-084 (resource exhaustion)

**Description:** The `CreateMatch` account struct has no `has_one = authority` constraint on config, meaning any funded wallet can create MatchEscrow PDAs. The server generates 32-bit roomIds (`crypto.randomBytes(4)`) that are publicly broadcast to all connected clients via `setRooms` WebSocket event BEFORE the escrow is created. An attacker monitors the lobby feed, observes the exact roomId when a wagered room appears, and races `create_match` with that ID before the server's own escrow creation call (which only fires when a second player joins). The server has no retry logic -- failed escrow creation silently drops the wager.

**Impact:** 100% of wagered matches can be silently de-escrowed. Sustainable at ~0.00001 SOL per match (two transaction fees). Rent fully recoverable via `permissionless_reclaim` after 48h.

**Root Cause:** Missing `has_one = authority` on CreateMatch config account (lib.rs:523-529).

**Fix:**
```rust
// Add to CreateMatch config constraint:
has_one = authority @ EscrowError::Unauthorized,
```

Secondary: Increase roomId entropy from 4 bytes to 16 bytes. Tertiary: Add server-side retry with new roomId on escrow failure.

---

#### CRITICAL-02: S001 -- Combined Authority Takeover + Fee Redirect + Winner Fraud

**Status:** CONFIRMED | **Confidence:** 9/10
**CVSS:** 8.7 (`AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H`)
**Location:** `lib.rs:70-89` (update_config), `lib.rs:228-305` (settle_match), `lib.rs:573-580` (winner constraint)
**Category:** Access Control, Token/Economic (chain attack)
**Precedent:** EP-068 chain (Step Finance $30-40M, Garden Finance $11M)

**Description:** A single authority key compromise enables a three-step chain: (1) TX0: `update_config(new_treasury=attacker, new_ops=attacker)` redirects 10% fees instantly; (2) TX1-N: `settle_match(winner=colluding_player)` extracts 90% per match; (3) TX_final: `update_config(new_authority=attacker_key)` permanently locks out governance. Combined extraction: 100% of all deposited funds in matches where attacker controls a registered player, plus 10% fee theft on all other settlements, plus permanent protocol takeover.

The developer annotated constraints referencing S001 awareness (OC-02, OC-03), but the mitigations (winner must be registered player, treasury must match config) are insufficient -- the attacker trivially satisfies these by pre-registering as a player (create_match is ungated) and redirecting config before settlement.

**Impact:** Complete protocol takeover. Up to 100% fund extraction per match. Permanent governance lockout without program upgrade.

**Fix:** Three mandatory layers: (1) Two-step propose/accept authority transfer; (2) Timelock on treasury/ops changes (24h); (3) Multisig authority before mainnet.

---

#### CRITICAL-03: H001 -- One-Step Authority Transfer Takeover

**Status:** CONFIRMED | **Confidence:** 9/10
**CVSS:** 8.7 (`AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:H`)
**Location:** `lib.rs:79` (assignment), `lib.rs:464-475` (UpdateConfig struct), `lib.rs:690-702` (GlobalConfig)
**Category:** Access Control
**Precedent:** EP-068 (Raydium $4.4M, Pump.fun $1.9M, Step Finance $30-40M)

**Description:** `update_config` at line 79 performs `config.authority = a` -- immediate, irreversible, no propose/accept, no timelock, no zero-address guard. GlobalConfig has no `pending_authority` field. Once the authority key is compromised, the attacker transfers governance in a single transaction with zero recovery path.

**Impact:** Complete protocol takeover. Winner manipulation, fee redirection, program pause, permanent governance lockout.

**Fix:**
```rust
// Add to GlobalConfig:
pub pending_authority: Option<Pubkey>,

// Split into propose_authority + accept_authority instructions
// New authority must sign to accept (proves key control)
```

---

### HIGH FINDINGS

---

#### HIGH-01: H002 -- Fee Destination Hijack via update_config

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:81-86` (treasury/ops assignment)

`update_config` accepts arbitrary pubkeys for treasury/ops with zero validation -- no distinctness re-check, no timelock, no event emission. Compromised authority redirects 10% of all settlement pots silently. Players still receive 90%, making the attack low-noise and potentially undetected.

**Fix:** Add distinctness re-validation mirroring `initialize_config` checks. Add timelock. Emit `ConfigUpdated` event.

---

#### HIGH-02: H003 -- update_config Distinctness Bypass -> Settlement DoS

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:70-89` (no re-validation), `lib.rs:588` (DuplicateFeeAccount constraint)

Setting `treasury == ops` via `update_config` creates an unsatisfiable logical contradiction in `SettleMatch`: lines 587/596 require both accounts to match config (now identical), but line 588 requires `treasury.key() != ops.key()`. Exhaustive proof: no valid account combination satisfies all three constraints. All active matches become unsettleable until config is repaired. 24-48h fund lockup.

**Fix:** Add `require!(config.treasury != config.ops, EscrowError::DuplicateFeeAccount)` at end of `update_config`.

---

#### HIGH-03: H005 -- Authority Winner Selection Fraud (POTENTIAL)

**Status:** POTENTIAL | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:573-581` (winner constraint), `lib.rs:228-305` (settle_match)
**Precondition:** Authority compromise

Winner is constrained to player_one/player_two (blocks third-party injection), but authority freely selects between the two with no on-chain game state verification. Combined with ungated create_match (H008), attacker can pre-register as player and always win.

**Fix:** Commit-reveal scheme for winner. Multisig settlement. On-chain game state verification.

---

#### HIGH-04: H006 -- 23-Hour Dead Zone Fund Lockup Griefing

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:20` (TIMEOUT=86400), `lib.rs:26` (SETTLEMENT_TIMEOUT=3600)

SETTLEMENT_TIMEOUT=3600s (1h) vs TIMEOUT=86400s (24h) creates an 82,800-second gap. After 1h, authority cannot settle. Before 24h, players cannot cancel Active matches. Up to 200 SOL per match locked for 23 hours with zero on-chain recourse.

**Fix:** Reduce TIMEOUT_SECONDS to 2*SETTLEMENT_TIMEOUT (7200s). Or allow player cancel immediately after settlement deadline expires.

---

#### HIGH-05: H007 -- Pause-as-Griefing Attack on Active Matches

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:93-95` (pause handler), `lib.rs:644` (cancel pause guard)

`pause_program` blocks both `settle_match` and `cancel_match`. Only escape: `permissionless_reclaim` at 48h. Compromised authority pauses program -> all active match funds locked for up to 48 hours.

**Fix:** Remove pause guard from `cancel_match`. Players should always be able to exit. Keep pause on `settle_match` and `create_match` only.

---

#### HIGH-06: H008 -- CreateMatch PDA Occupancy DoS

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.2
**Location:** `lib.rs:507-532` (CreateMatch struct, no authority gate)

Any signer can call `create_match` and occupy PDA namespace. Cost: ~0.00146 SOL rent per PDA (fully recoverable at 48h via permissionless_reclaim). Matches created by non-authority are permanently unsettleable. See S004 for the refined exploitation path via public roomId observation.

**Fix:** Add `has_one = authority @ EscrowError::Unauthorized` to CreateMatch config constraint.

---

#### HIGH-07: H011 -- Config Treasury Self-Redirect

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:70-89` (no distinctness in update), `lib.rs:583-598` (SettleMatch constraints)

No constraint prevents `config.treasury == config.authority`. Authority sets treasury to own wallet, receives 7% fee on every settlement in addition to operational role. Silent ongoing fee capture.

**Fix:** Add `require!(config.treasury != config.authority)` in `update_config`. Add `constraint = treasury.key() != authority.key()` in SettleMatch.

---

#### HIGH-08: H014 -- Authority Collusion: Settle to Controlled Winner (POTENTIAL)

**Status:** POTENTIAL | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:507-532` (ungated create_match), `lib.rs:573-581` (winner constraint)
**Precondition:** Authority compromise

Overlaps H005. create_match is ungated so attacker registers controlled wallet as player_one. Combined with authority's winner selection power, enables systematic extraction.

**Fix:** Gate create_match with `has_one = authority`. Mitigates this, H008, and S004.

---

#### HIGH-09: S002 -- Distinctness Poison + Pause Double Lock

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** 8.7
**Location:** `lib.rs:70-89` (update_config), `lib.rs:93-95` (pause), `lib.rs:644` (cancel pause guard)

Two independent mechanisms combine: (1) config poison (treasury==ops) breaks all settlement permanently, (2) pause blocks cancel_match. Only escape: 48h `permissionless_reclaim`. Can be atomic in a single TX with optional authority rotation.

**Fix:** Fix A: Add distinctness checks to update_config. Fix B: Remove pause guard from cancel_match. Fix C: Multisig authority.

---

### MEDIUM FINDINGS

---

#### MEDIUM-01: H009 -- Executable Account as Fee Destination (POTENTIAL)

**Status:** POTENTIAL | **Confidence:** 7/10 | **CVSS:** ~6.5
**Location:** `lib.rs:582-598` (UncheckedAccount for treasury/ops)
**Precondition:** Authority sets treasury/ops to executable account

Treasury/ops accounts are `UncheckedAccount`. If set to a program-owned executable account, lamport transfers via `try_borrow_mut_lamports` may succeed but funds become irrecoverable. Requires devnet verification.

**Fix:** Add `constraint = !treasury.executable` and `constraint = !ops.executable` checks in SettleMatch.

---

#### MEDIUM-02: H010 -- Deposit Ordering Asymmetry

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** ~5.5
**Location:** `lib.rs:156-222` (deposit_wager), `lib.rs:336-344` (cancel auth logic)

First depositor's funds are locked immediately. However, cancel from AwaitingDeposits is available to players without timeout (lib.rs:336-344 branch succeeds without timeout check), mitigating the asymmetry to MEDIUM.

**Fix:** Consider adding a deposit deadline separate from match timeout.

---

#### MEDIUM-03: H017 -- Config State Read During Same-TX Mutation (POTENTIAL)

**Status:** POTENTIAL | **Confidence:** 8/10 | **CVSS:** ~5.5
**Location:** `lib.rs:70-89` (update_config), Solana TX atomicity
**Precondition:** Authority compromise

Authority can compose `update_config -> settle_match -> update_config(restore)` atomically in one TX. Settlement reads config at execution time, seeing the mutated state. Config appears clean post-TX. Stealth fee redirect.

**Fix:** Timelock on config changes. Event emission for monitoring.

---

#### MEDIUM-04: H027 -- Authority Self-Play Bypass (OC-06) (POTENTIAL)

**Status:** POTENTIAL | **Confidence:** 9/10 | **CVSS:** ~5.0
**Location:** `lib.rs:127-129` (OC-06 checks)
**Precondition:** Malicious authority

OC-06 checks `authority != player_one && authority != player_two` against signing key only. Authority uses secondary wallet to play and always settles in their favor. Design limitation, not code bug.

**Fix:** Off-chain monitoring. Multisig authority. Commit-reveal settlement.

---

### LOW FINDINGS

---

#### LOW-01: H016 -- AwaitingDeposits Cancel Without Depositing (Rent Theft)

**Status:** CONFIRMED | **Confidence:** 9/10 | **CVSS:** ~2.5
**Location:** `lib.rs:619` (`close = caller`), `lib.rs:336-344`

Player who never deposited can cancel and receive the PDA rent (~0.002 SOL) that was paid by the match creator. Nuisance, not economically significant.

**Fix:** Change `close = caller` to `close = authority` or add check that caller deposited before receiving rent.

---

## 5. Combination Attack Analysis

### N x N Combination Matrix (Actionable Findings)

The 17 actionable findings (12 CONFIRMED + 5 POTENTIAL) were analyzed pairwise. Key amplifying combinations:

| Finding A | Finding B | Combination Effect | Combined Severity |
|-----------|-----------|--------------------|-------------------|
| H001 (authority takeover) | H002 (fee redirect) | Takeover enables total fee redirection | CRITICAL (S001) |
| H001 (authority takeover) | H005 (winner fraud) | Takeover enables systematic winner manipulation | CRITICAL (S001) |
| H003 (distinctness bypass) | H007 (pause griefing) | Poison + pause = 48h maximum lockup | HIGH (S002) |
| H008 (PDA DoS) | S004 (pre-squatting) | S004 is the weaponized form of H008 with public roomId | CRITICAL |
| H002 (fee redirect) | H011 (treasury self-redirect) | Overlapping fee capture vectors | HIGH |
| H001 (authority takeover) | H007 (pause griefing) | Takeover enables indefinite pause | CRITICAL |
| H006 (dead zone) | H007 (pause griefing) | 23h gap + pause = 48h lockup | HIGH |

### Findings That Enable Others

| Enabler Finding | Findings Enabled | Why |
|-----------------|------------------|-----|
| H001 (one-step transfer) | H002, H005, H007, H011, S001, S002 | Key compromise gives unrestricted admin power |
| H008 (ungated create_match) | S004, H014 | Permissionless match creation enables DoS and collusion |
| H003 (distinctness bypass) | S002 | Config poison breaks settlement for all matches |
| H007 (pause griefing) | S002 | Pause blocks the cancel escape hatch |

---

## 6. Attack Trees

### Attack Tree 1: Fund Drain (Authority Compromise)

```
[ROOT: Drain all active match funds]
  |
  +-- [PRECONDITION: Compromise authority key]
  |     |-- Phishing / social engineering
  |     |-- Leaked .env / server breach
  |     |-- Insider threat
  |
  +-- [STEP 1: Redirect fees] -- H002
  |     `-- update_config(new_treasury=attacker, new_ops=attacker)
  |         `-- No timelock, no event, instant effect
  |
  +-- [STEP 2: Settle matches with wrong winner] -- H005
  |     |-- For matches where attacker is player: 90% extraction
  |     `-- For all matches: 10% fee theft via redirected treasury/ops
  |
  +-- [STEP 3: Lock out governance] -- H001
  |     `-- update_config(new_authority=attacker_key2)
  |         `-- One-step, irreversible, no recovery
  |
  +-- [OPTIONAL: Maximum disruption] -- H007
        `-- pause_program -> 48h fund lockup for all remaining matches

  CRITICAL FIX NODES:
  [*] Two-step authority transfer -- breaks Step 3
  [*] Timelock on config changes -- breaks Step 1
  [*] Multisig authority -- eliminates the precondition
```

### Attack Tree 2: Protocol DoS / Fund Lockup

```
[ROOT: Block all wager escrow or lock all funds]
  |
  +-- [PATH A: PDA Pre-Squatting] -- S004
  |     |-- Monitor setRooms WebSocket (no auth needed)
  |     |-- Observe roomId for wagered rooms
  |     |-- Race create_match with observed ID
  |     |-- Server escrow creation fails silently
  |     `-- Cost: ~0.00001 SOL per blocked match
  |
  +-- [PATH B: Settlement DoS via Config Poison] -- H003 + S002
  |     |-- Requires authority compromise
  |     |-- update_config(treasury=X, ops=X) -- poisons settlement
  |     |-- Optional: pause_program -- blocks cancel
  |     `-- All matches locked 24-48h
  |
  +-- [PATH C: Dead Zone Exploitation] -- H006
        |-- Authority intentionally does not settle within 1h
        `-- Funds locked 23h (gap between 1h settle deadline and 24h cancel)

  CRITICAL FIX NODES:
  [*] has_one=authority on CreateMatch -- blocks Path A entirely
  [*] Distinctness checks in update_config -- blocks Path B
  [*] Remove pause from cancel_match -- reduces Path B to 24h
  [*] Reduce TIMEOUT to 2h -- eliminates Path C
```

---

## 7. Severity Calibration

### Re-Calibration Table

| Finding | Strategy Tier | Investigation Severity | Final Severity | Reason for Change |
|---------|---------------|----------------------|----------------|-------------------|
| S004 | Supplemental (HIGH est.) | HIGH | **CRITICAL** | Upgraded: PR:None (no privileges), CVSS 9.3, silently voids protocol's core economic guarantee, fully automated, near-zero cost. Per severity-calibration.md "always CRITICAL" pattern: permissionless DoS on core protocol function. |
| S001 | Tier 1 (CRITICAL est.) | CRITICAL | **CRITICAL** | Confirmed. Chain is worse than individual components. |
| H001 | Tier 1 (CRITICAL est.) | CRITICAL | **CRITICAL** | Confirmed. Historical precedent: 4 incidents totaling >$50M losses. |
| H003 | Tier 1 (CRITICAL est.) | HIGH | **HIGH** | No permanent fund loss (cancel/reclaim paths work). Recoverable by authority. |
| H008 | Tier 2 (HIGH est.) | HIGH | **HIGH** | Subsumed by S004 for the weaponized variant. Standalone impact is still HIGH. |
| H010 | Tier 2 (HIGH est.) | MEDIUM | **MEDIUM** | Downgraded from strategy estimate: cancel from AwaitingDeposits is available without timeout, mitigating the asymmetry significantly. |
| H016 | Tier 2 (HIGH est.) | LOW | **LOW** | Downgraded: ~0.002 SOL per exploit. Nuisance, not economically significant. |
| H005 | Tier 1 (CRITICAL est.) | HIGH (POTENTIAL) | **HIGH** | Downgraded from CRITICAL estimate: requires authority compromise precondition (PR:H). Winner constraint provides partial mitigation. |

### Calibration Notes

- **S004 upgrade rationale:** The severity-calibration.md identifies "permissionless denial of core protocol function" as an always-CRITICAL pattern. S004 requires no privileges (PR:None), no authentication, and silently disables on-chain wager enforcement for every match. The CVSS score of 9.3 reflects the combination of PR:None + Changed Scope + High Integrity/Availability impact.

- **Authority-compromise findings (H001, H002, H003, H005, H006, H007, H011, S001, S002):** All scored with PR:High per CVSS, producing 8.7 base scores. Operationally, these should be treated as CRITICAL given the hot wallet authority model and historical precedent (EP-068: four incidents, $50M+ combined losses).

---

## 8. Strategic Recommendations

### Priority 1: Immediate (Block Deployment)

| # | Fix | Findings Addressed | Attack Paths Broken |
|---|-----|--------------------|---------------------|
| 1 | Add `has_one = authority` to CreateMatch config | S004, H008, H014 | PDA pre-squatting, namespace DoS |
| 2 | Implement two-step propose/accept authority transfer | H001, S001 (TX_final) | Governance lockout |
| 3 | Add distinctness re-validation to update_config | H002, H003, H011, S001 (TX0), S002 | Fee hijack, settlement DoS, treasury self-redirect |
| 4 | Remove pause guard from cancel_match | H007, S002 | Pause griefing, double-lock |
| 5 | Emit events on all config changes | H002, H017 | Silent fee redirect detection |

### Priority 2: Pre-Mainnet (Required)

| # | Fix | Findings Addressed |
|---|-----|--------------------|
| 6 | Migrate authority to multisig (Squads Protocol) | Entire authority-compromise class |
| 7 | Add timelock on treasury/ops config changes (24h) | H002, H017, S001 |
| 8 | Reduce TIMEOUT_SECONDS to 7200 (2h) or allow cancel after settlement deadline | H006 |
| 9 | Add `constraint = !treasury.executable` and `!ops.executable` in SettleMatch | H009 |
| 10 | Increase roomId entropy from 4 bytes to 16 bytes | S004 (defense-in-depth) |
| 11 | Add server retry logic on escrow creation failure with new roomId | S004 (defense-in-depth) |
| 12 | Add zero-address guard on new_authority in update_config | H001 |
| 13 | Change CancelMatch `close = caller` to `close = authority` | H016 |

### Priority 3: Post-Launch

| # | Fix | Findings Addressed |
|---|-----|--------------------|
| 14 | Implement commit-reveal or VRF-based winner selection | H005, H014, H027 |
| 15 | Add separate deposit deadline (shorter than match timeout) | H010 |
| 16 | Add on-chain monitoring hooks for anomalous settlement patterns | General |
| 17 | Consider on-chain game state for winner verification | H005, H014 |

### Critical Fix Nodes (highest ROI fixes)

These 5 fixes break the most attack chains:

1. **`has_one = authority` on CreateMatch** -- fixes S004, H008, H014 (3 findings, blocks entire PDA DoS tree)
2. **Distinctness checks in update_config** -- fixes H002, H003, H011, S001(partial), S002(partial) (5 findings)
3. **Two-step authority transfer** -- fixes H001, S001(TX_final) (2 findings, blocks governance lockout)
4. **Remove pause from cancel_match** -- fixes H007, S002(partial) (2 findings, ensures player exit path)
5. **Multisig authority** -- mitigates the entire authority-compromise class (H001, H002, H003, H005, H006, H007, H011, H014, H027, S001, S002 -- 11 findings)

---

## 9. NOT VULNERABLE Summary

The following 17 hypotheses were investigated and found NOT VULNERABLE:

| ID | Title | Why Safe |
|----|-------|----------|
| H004 | PDA Close-and-Revive | OC-10 drains funds before close; re-created PDA is fresh/empty |
| H012 | Lamport Underflow on Cancel/Reclaim | 3 independent layers: invariant check, overflow-checks profile, runtime conservation |
| H013 | PDA Rent Extraction at Low Wagers | Rent cycle is economically neutral for authority (pay at create, recover at settle) |
| H015 | Concurrent Double-Deposit by Same Player | Solana runtime account locking serializes same-PDA writes + AlreadyDeposited flag |
| H018 | ZeroWager Dead Code | MIN_WAGER=10,000 enforced at lib.rs:148; zero wager is dead code |
| H019 | Narrowing Cast Overflow | `as u64` casts safe; overflow requires ~131 trillion SOL (impossible) |
| H020 | Clock Drift at Settlement Deadline | 1-2s drift immaterial on 3600s window |
| H021 | Permissionless Reclaim During Active Pause | Intentional design (DCA-02 escape hatch) -- unaffected by pause |
| H022 | GlobalConfig Re-Initialization | Anchor `init` constraint prevents re-initialization |
| H023 | PDA Account Revival After Close | Re-created PDA has fresh state; harmless |
| H024 | Settlement Deadline Bypass via activated_at | activated_at always set on Active transition (lib.rs:209) |
| H025 | Match ID Collision for PDA Hijack | Server CSPRNG + Anchor init uniqueness; collision negligible |
| H026 | Escrow PDA Lamport Inflation (Donation) | Attacker loses money; authority gains -- economically irrational |
| H028 | BPS Constant Manipulation via Upgrade | Constants hardcoded; no runtime modification. Upgrade is separate governance concern |
| H029 | Error Propagation in try_borrow_mut_lamports | Solana TX atomicity ensures all-or-nothing; `?` propagation fail-fast |
| H030 | Cancel from AwaitingDeposits Refund Logic | Independent deposit flags checked correctly for all 3 scenarios |
| S003 | Authority == Treasury Economic Consolidation | Duplicate of H011 (same underlying vulnerability, merged) |

---

## 10. Appendix

### A. Methodology Reference

This audit used the Stronghold of Security (SOS) methodology v2.0:
- 6 parallel context auditor agents with independent focus areas
- 128 exploit patterns (EP-001 through EP-128) cross-referenced
- CVSS v3.1 scoring with Solana-specific calibration (Beosin/Sec3 adapted)
- N x N combination matrix for finding interactions
- Attack tree construction with critical fix node identification
- Severity re-calibration against historical incident database

### B. Files Analyzed

| File | LOC | Focus Areas | Finding Count |
|------|-----|-------------|---------------|
| `programs/solshot-escrow/src/lib.rs` | 855 | All 6 focuses | 34 strategies |
| `server/socket-io/main.js` (referenced) | ~1800 | S004 verification | 1 finding (S004) |

### C. Finding Cross-Reference

| Finding | Root Cause Location | Fix Location |
|---------|--------------------|--------------|
| H001 | `lib.rs:79` | Add pending_authority to GlobalConfig, new propose/accept instructions |
| H002 | `lib.rs:81-86` | `lib.rs:70-89` (add re-validation) |
| H003 | `lib.rs:70-89` (missing checks) | `lib.rs:70-89` (add require! checks) |
| H005 | `lib.rs:573-581` (design) | New commit-reveal/VRF mechanism |
| H006 | `lib.rs:20,26` (timeout constants) | Reduce TIMEOUT_SECONDS |
| H007 | `lib.rs:644` (cancel pause guard) | Remove pause guard from CancelMatch |
| H008 | `lib.rs:523-529` (missing has_one) | Add `has_one = authority` to CreateMatch |
| H009 | `lib.rs:582-598` (UncheckedAccount) | Add `!executable` constraint |
| H010 | `lib.rs:336-344` (cancel auth) | Add deposit deadline |
| H011 | `lib.rs:70-89` (missing checks) | Add authority/treasury distinctness |
| H014 | `lib.rs:507-532` (ungated) | Gate create_match with authority |
| H016 | `lib.rs:619` (close = caller) | Change to close = authority |
| H017 | Solana TX atomicity + lib.rs:70-89 | Add timelock |
| H027 | `lib.rs:127-129` (design) | Off-chain monitoring, multisig |
| S001 | H001 + H002 + H005 combined | Fixes for all three components |
| S002 | H003 + H007 combined | Fixes for both components |
| S004 | `lib.rs:523-529` + `main.js:1163` | Add has_one + increase entropy |

### D. Historical Precedent Reference

| Incident | Date | Loss | Relevant Findings |
|----------|------|------|-------------------|
| Raydium | Dec 2022 | $4.4M | H001, S001 (admin key compromise, immediate withdrawal) |
| Pump.fun | May 2024 | $1.9M | H001, S001 (admin key compromise via insider) |
| Garden Finance | Oct 2025 | $11M | H001, H005, S001 (settlement authority abuse) |
| Step Finance | Jan 2026 | $30-40M | H001, S001 (hot wallet key exfiltration, governance lock) |
| Vaultka | 2024 | Critical | H002, H011 (fee routing redirect) |
| Cetus | Jun 2023 | $223M | H019 (overflow -- cleared as safe here) |
| Solend | 2022 | N/A | H008, S004 (PDA rent theft pattern) |

### E. Audit Configuration

| Parameter | Value |
|-----------|-------|
| Audit Tier | Quick |
| Strategy Count | 30 + 4 supplemental = 34 |
| Batch Size | 5 |
| Coverage Verification | SKIPPED |
| Context Auditors | 6 (Access Control, Arithmetic, State Machine, CPI/External, Token/Economic, Timing/Ordering) |
| Stacked Audit | No |

---

**End of Report**

*Generated by Stronghold of Security v2.0 on 2026-02-23*
*Audit ID: sos-solshot-escrow-clean-2026-02-23*
