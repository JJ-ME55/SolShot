# Investigation Findings Digest

**Audit:** sos-solshot-escrow-clean-2026-02-23
**Program:** SolShot Escrow (programs/solshot-escrow/src/lib.rs, 855 LOC)
**Ecosystem:** Solana/Anchor escrow/wagering (SOL-only)
**Total Strategies:** 34 (30 original + 4 supplemental)
**Results:** 12 CONFIRMED, 5 POTENTIAL, 17 NOT VULNERABLE, 0 NEEDS MANUAL REVIEW

---

## CONFIRMED FINDINGS (12)

---

### H001: One-Step Authority Transfer Takeover
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** CRITICAL
- **Category:** Access Control
- **Precedent:** EP-068 (Raydium $4.4M, Pump.fun $1.9M, Step Finance $30-40M)
- **Root Cause:** `update_config` at lib.rs:70-89 implements one-step authority transfer. Line 79: `config.authority = a` — immediate, irreversible, no propose/accept, no timelock, no zero-address guard.
- **Attack:** Compromised authority key → single TX sets `config.authority = attacker_pubkey` → attacker controls all protocol ops (settle, fee redirect, pause).
- **Impact:** Complete protocol takeover. All active match funds at risk. Irreversible without attacker cooperation.
- **Code:** `lib.rs:79` (assignment), `lib.rs:464-475` (UpdateConfig struct, only guard is `has_one = authority`), `lib.rs:690-702` (GlobalConfig — no `pending_authority` field).
- **Fix:** Implement two-step propose/accept authority transfer pattern.

---

### H002: Fee Destination Hijack via update_config
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Access Control, Token/Economic
- **Precedent:** EP-068, EP-099 (Vaultka fee routing)
- **Root Cause:** `update_config` accepts arbitrary pubkeys for treasury/ops with zero validation. No distinctness re-check, no timelock, no event emission.
- **Attack:** Authority calls `update_config(new_treasury=attacker1, new_ops=attacker2)` → all future settlements send 10% of pot to attacker wallets. Players still receive 90% — attack is silent.
- **Impact:** Ongoing fee theft (7% treasury + 3% ops = 10% of every settled pot). Low-noise, potentially undetected.
- **Code:** `lib.rs:81-86` (treasury/ops assignment), `lib.rs:53-55` (init distinctness checks NOT repeated in update).
- **Fix:** Add distinctness re-validation in update_config mirroring initialize_config checks. Add timelock. Emit ConfigUpdated event.

---

### H003: update_config Distinctness Bypass → Settlement DoS
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Access Control, State Machine
- **Precedent:** Novel (init vs update invariant gap)
- **Root Cause:** `initialize_config` enforces `treasury != ops` (lib.rs:55) but `update_config` does NOT. Setting `treasury == ops` creates impossible constraint in SettleMatch: line 588 requires `treasury.key() != ops.key()` but lines 587/596 require both to match config (which are now equal).
- **Attack:** Authority calls `update_config(new_treasury=X, new_ops=X)` → all `settle_match` calls fail permanently → all Active matches stranded until 24h cancel or 48h reclaim.
- **Impact:** Settlement DoS for all active matches. 24-48h fund lockup depending on pause state.
- **Code:** `lib.rs:70-89` (no re-validation), `lib.rs:588` (distinctness constraint in SettleMatch), `lib.rs:53-55` (init checks).
- **Fix:** Add `require!(treasury != ops)` and `require!(authority != treasury)` and `require!(authority != ops)` at end of `update_config`.

---

### H006: 23-Hour Dead Zone Fund Lockup Griefing
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Timing/Ordering, State Machine
- **Precedent:** Novel (timeout gap analysis)
- **Root Cause:** SETTLEMENT_TIMEOUT=3600s (1h) vs TIMEOUT=86400s (24h) creates 82,800-second gap. After 1h, authority cannot settle (lib.rs:242). Before 24h, players cannot cancel Active matches (lib.rs:340-344).
- **Attack:** Authority intentionally does not settle within 1h window → funds locked 23h with zero on-chain recourse.
- **Impact:** Up to 200 SOL (2×MAX_WAGER) per match locked for 23 hours. Griefing vector.
- **Code:** `lib.rs:20` (TIMEOUT=86400), `lib.rs:26` (SETTLEMENT_TIMEOUT=3600), `lib.rs:236-244` (settlement deadline), `lib.rs:336-344` (cancel auth logic).
- **Fix:** Reduce TIMEOUT_SECONDS to 2*SETTLEMENT_TIMEOUT (e.g., 7200s = 2h). Or allow player cancel after settlement deadline expires.

---

### H007: Pause-as-Griefing Attack on Active Matches
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Access Control, State Machine
- **Precedent:** EP-068 (admin abuse patterns)
- **Root Cause:** `pause_program` (lib.rs:93-95) blocks both `settle_match` and `cancel_match` (via pause guard at lib.rs:644). Only escape is `permissionless_reclaim` at 48h (lib.rs:409).
- **Attack:** Authority pauses program → settle blocked, cancel blocked → all active matches locked for up to 48h until permissionless_reclaim.
- **Impact:** 48h maximum fund lockup for all active matches. Combined with H003 (distinctness poison), creates double-lock.
- **Code:** `lib.rs:93-95` (pause handler), `lib.rs:480-490` (PauseProgram struct), `lib.rs:644` (CancelMatch pause guard), `lib.rs:409` (48h reclaim threshold).
- **Fix:** Remove pause guard from `cancel_match` — players should always be able to exit. Keep pause on `settle_match` and `create_match` only.

---

### H008: CreateMatch PDA Occupancy DoS
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Access Control, Resource/DoS
- **Precedent:** EP-084 (resource exhaustion)
- **Root Cause:** `CreateMatch` struct (lib.rs:507-532) has NO `has_one = authority` constraint on config. Any signer can call `create_match` and occupy PDA namespace.
- **Attack:** Attacker spams `create_match` with arbitrary match_ids → occupies PDA space → legitimate server matches fail if IDs collide. Cost: ~0.003 SOL rent per PDA (recoverable via cancel after 24h).
- **Impact:** Protocol-level DoS. Sustainable at near-zero net cost.
- **Code:** `lib.rs:507-532` (CreateMatch — no authority gate), PDA seeds: `["match", match_id.as_bytes()]`.
- **Fix:** Add `has_one = authority @ EscrowError::Unauthorized` to CreateMatch config constraint.

---

### H010: Deposit Ordering Asymmetry Exploitation
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** MEDIUM
- **Category:** State Machine, Timing
- **Precedent:** EP-033 (state machine edge cases)
- **Root Cause:** First depositor's funds are locked immediately. If second player never deposits, first player must wait for cancel timeout (24h from creation, not from deposit). However, cancel from AwaitingDeposits is available to players immediately per auth logic.
- **Attack:** Attacker creates match, deposits as player_one, never has player_two deposit. Cancel is available without timeout from AwaitingDeposits state.
- **Impact:** MEDIUM — asymmetry exists but immediate cancel mitigates. First depositor can cancel without waiting if match hasn't activated.
- **Code:** `lib.rs:336-344` (cancel auth — `is_player && AwaitingDeposits` branch succeeds without timeout check).
- **Fix:** Design concern. Consider adding deposit deadline separate from match timeout.

---

### H011: Config Treasury Self-Redirect
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** Access Control, Token/Economic
- **Precedent:** EP-099 (Vaultka fee routing)
- **Root Cause:** No constraint prevents `config.treasury == config.authority`. SettleMatch requires `treasury.key() == config.treasury` (lib.rs:587) but has NO `treasury.key() != authority.key()` constraint.
- **Attack:** Authority calls `update_config(new_treasury=authority_wallet)` → authority receives 7% treasury fee on every settlement in addition to PDA rent.
- **Impact:** Silent ongoing fee capture. 7% of all pots redirected to authority.
- **Code:** `lib.rs:70-89` (no distinctness in update), `lib.rs:583-598` (SettleMatch — treasury constraint checks config match but not authority distinctness).
- **Fix:** Add `require!(config.treasury != config.authority)` in update_config. Add `constraint = treasury.key() != authority.key()` in SettleMatch.

---

### H016: AwaitingDeposits → Cancel Without Depositing (Rent Theft)
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** LOW
- **Category:** Token/Economic
- **Precedent:** Novel
- **Root Cause:** `CancelMatch` uses `close = caller` (lib.rs:619). A player who never deposited can cancel and receive the PDA rent (~0.002 SOL) that was paid by the match creator.
- **Attack:** Player registered as player_one/two cancels from AwaitingDeposits without depositing → receives rent refund that creator paid.
- **Impact:** LOW — ~0.002 SOL per exploit. Nuisance, not economically significant.
- **Code:** `lib.rs:619` (`close = caller`), `lib.rs:336-344` (players can cancel from AwaitingDeposits).
- **Fix:** Change `close = caller` to `close = authority` or add check that caller deposited before receiving rent.

---

### S001: Combined Authority Takeover + Fee Redirect + Winner Fraud (Chain Attack)
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** CRITICAL
- **Category:** Access Control, Token/Economic (chain attack)
- **Precedent:** EP-068 chain (Step Finance $30-40M, Garden Finance $11M)
- **Root Cause:** H001 + H002 + H005 combine into full extraction chain. Single authority key compromise enables: (1) fee redirect to attacker, (2) settle all active matches to colluding player, (3) authority transfer to lock out recovery.
- **Attack Chain:**
  - TX0: `update_config(new_treasury=attacker1, new_ops=attacker2)` — redirects 10% fees
  - TX1-N: `settle_match(winner=colluding_player)` — extracts 90% per match
  - TX_final: `update_config(new_authority=attacker_key)` — permanent lockout
- **Impact:** 100% extraction of all deposited funds + permanent protocol takeover. Can execute in a single TX bundle.
- **Code:** `lib.rs:70-89` (update_config), `lib.rs:228-305` (settle_match), `lib.rs:575-580` (winner constraint allows registered players).
- **Fix:** Two-step authority transfer (breaks TX_final). Timelock on config changes (breaks TX0). Multisig authority (eliminates single-key precondition).

---

### S002: Distinctness Poison + Pause Double Lock
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** HIGH
- **Category:** State Machine, Access Control (chain attack)
- **Precedent:** H003 + H007 combination
- **Root Cause:** Two independent mechanisms combine to maximize lockup: (1) config poison (treasury==ops) breaks all settlement permanently, (2) pause blocks cancel_match. Only escape: 48h permissionless_reclaim.
- **Attack Chain:**
  - TX0: `update_config(new_treasury=X, new_ops=X)` — poisons settlement
  - TX1: `pause_program` — blocks cancel
  - Can be atomic in single TX with optional authority rotation
- **Impact:** 48h maximum fund lockup for all active matches. Settlement blocked permanently until config AND pause both repaired.
- **Code:** `lib.rs:70-89` (update_config), `lib.rs:93-95` (pause), `lib.rs:644` (cancel pause guard), `lib.rs:653-681` (permissionless_reclaim — unaffected by pause).
- **Fix:** Fix A: Add distinctness checks to update_config. Fix B: Remove pause guard from cancel_match. Fix C: Multisig authority.

---

### S004: PDA Namespace Pre-Squatting DoS
- **Status:** CONFIRMED | **Confidence:** 9/10
- **Severity:** CRITICAL
- **Category:** Access Control, Resource/DoS
- **Precedent:** EP-084 (resource exhaustion), H008 refinement
- **Root Cause:** Missing `has_one = authority` on CreateMatch (lib.rs:507-532) + match IDs publicly visible on WebSocket `setRooms` broadcast before escrow creation + no server retry logic.
- **Attack Chain:**
  1. Host creates wagered room → roomId visible on WebSocket
  2. Attacker sees roomId, races `create_match(roomId)` → PDA occupied
  3. Server's `createMatchEscrow(roomId)` fails silently
  4. Match plays without on-chain escrow enforcement
  5. After 48h, attacker reclaims rent via permissionless_reclaim
- **Impact:** 100% of wagered matches can be silently de-escrowed. Sustainable at ~0.00001 SOL per match.
- **Code:** `lib.rs:507-532` (no authority gate), server `main.js:1163,1256` (4-byte roomId, public broadcast).
- **Fix:** Primary: Add `has_one = authority` to CreateMatch. Secondary: Increase `crypto.randomBytes(4)` to `crypto.randomBytes(16)`.

---

## POTENTIAL FINDINGS (5)

---

### H005: Authority Winner Selection Fraud
- **Status:** POTENTIAL | **Confidence:** 9/10
- **Severity:** HIGH (if authority compromised)
- **Category:** Access Control, Centralization
- **Root Cause:** Authority has unchecked unilateral power to choose which registered player wins any match. Winner constrained to player_one/player_two (lib.rs:575-580) — blocks third-party injection — but authority freely picks between the two with no on-chain game state verification.
- **Precondition:** Compromised or malicious authority.
- **Impact:** 90% of all pots to colluding player + 10% fees via H002. Centralization/trust risk.
- **Code:** `lib.rs:573-581` (winner constraint), `lib.rs:228-305` (settle_match — no game state check).
- **Fix:** Commit-reveal scheme for winner. Multisig settlement. On-chain game state.

---

### H009: Executable Account as Fee Destination (Silent Lamport Loss)
- **Status:** POTENTIAL | **Confidence:** 7/10
- **Severity:** MEDIUM
- **Category:** CPI/External
- **Root Cause:** Treasury/ops accounts are `UncheckedAccount` (lib.rs:582-598). If set to a program-owned executable account, lamport transfers may succeed but funds become irrecoverable.
- **Precondition:** Authority sets treasury/ops to executable account address.
- **Impact:** Fee lamports permanently lost. Requires devnet verification.
- **Code:** `lib.rs:582-598` (UncheckedAccount for treasury/ops).
- **Fix:** Add `constraint = !treasury.executable` check in SettleMatch.

---

### H014: Authority Collusion — Settle to Controlled Winner Wallet
- **Status:** POTENTIAL | **Confidence:** 9/10
- **Severity:** HIGH (if authority compromised)
- **Category:** Access Control
- **Root Cause:** Overlaps H005. create_match is ungated (no authority check) so attacker can register controlled wallet as player_one. Combined with authority's winner selection power.
- **Precondition:** Authority compromise.
- **Impact:** Same as H005. create_match gating is the structural entry point.
- **Code:** `lib.rs:507-532` (ungated create_match), `lib.rs:573-581` (winner constraint).
- **Fix:** Gate create_match with `has_one = authority`. Mitigates both this and H008/S004.

---

### H017: Config State Read During Same-TX Mutation
- **Status:** POTENTIAL | **Confidence:** 8/10
- **Severity:** MEDIUM
- **Category:** Timing/Ordering
- **Root Cause:** Solana allows multiple instructions in one TX. Authority can: update_config → settle_match → update_config(restore) atomically. Settlement reads config at execution time, seeing the mutated state.
- **Precondition:** Authority compromise.
- **Impact:** Stealth fee redirect within single TX. Config appears clean after TX.
- **Code:** `lib.rs:70-89` (update_config), Solana TX atomicity.
- **Fix:** Timelock on config changes. Event emission for monitoring.

---

### H027: Authority Self-Play Bypass (OC-06)
- **Status:** POTENTIAL | **Confidence:** 9/10
- **Severity:** MEDIUM
- **Category:** Access Control
- **Root Cause:** OC-06 (lib.rs:127-129) checks `authority != player_one && authority != player_two` against signing key only. Authority can use secondary wallet to play and always settle in their favor.
- **Precondition:** Malicious authority.
- **Impact:** Design limitation. Authority can self-play via secondary wallets. Overlaps H005/H014.
- **Code:** `lib.rs:127-129` (OC-06 checks).
- **Fix:** Off-chain monitoring. Multisig authority. Commit-reveal settlement.

---

## NOT VULNERABLE FINDINGS (17)

| ID | Title | Reason Safe |
|----|-------|-------------|
| H004 | PDA Close-and-Revive | OC-10 drains funds before close; re-created PDA is fresh/empty |
| H012 | Lamport Underflow on Cancel/Reclaim | 3 independent layers: invariant check, overflow-checks profile, runtime conservation |
| H013 | PDA Rent Extraction at Low Wagers | Rent cycle is economically neutral for authority (pay at create, recover at settle) |
| H015 | Concurrent Double-Deposit by Same Player | Solana runtime account locking serializes same-PDA writes + AlreadyDeposited flag |
| H018 | ZeroWager Dead Code | MIN_WAGER=10,000 enforced at lib.rs:148; zero wager is dead code |
| H019 | Narrowing Cast Overflow | as u64 casts safe; overflow requires ~131 trillion SOL (impossible) |
| H020 | Clock Drift at Settlement Deadline | 1-2s drift immaterial on 3600s window |
| H021 | Permissionless Reclaim During Active Pause | Intentional design — DCA-02 escape hatch unaffected by pause |
| H022 | GlobalConfig Re-Initialization | Anchor `init` constraint prevents re-initialization |
| H023 | PDA Account Revival After Close | Re-created PDA has fresh state — harmless |
| H024 | Settlement Deadline Bypass via activated_at | activated_at always set on Active transition (lib.rs:209) |
| H025 | Match ID Collision for PDA Hijack | Server CSPRNG; collision negligible |
| H026 | Escrow PDA Lamport Inflation (Donation) | Attacker loses money; authority gains — economically irrational |
| H028 | BPS Constant Manipulation via Upgrade | Constants hardcoded; no runtime modification. Upgrade is separate governance concern |
| H029 | Error Propagation in try_borrow_mut_lamports | Solana TX atomicity ensures all-or-nothing; `?` propagation fail-fast |
| H030 | Cancel from AwaitingDeposits Refund Logic | Independent deposit flags checked correctly for all 3 scenarios |
| S003 | Authority == Treasury Economic Consolidation | Duplicate of H011 (same underlying vulnerability) |

---

## KEY CODE REFERENCES

### Critical Functions
- `lib.rs:47-65` — `initialize_config`: Sets up GlobalConfig with distinctness checks
- `lib.rs:70-89` — `update_config`: Modifies config WITHOUT re-validation (ROOT CAUSE of H001, H002, H003, H011)
- `lib.rs:93-95` — `pause_program`: Authority-only pause (ROOT CAUSE of H007)
- `lib.rs:120-156` — `create_match`: Creates escrow PDA, NO authority gate (ROOT CAUSE of H008, S004)
- `lib.rs:160-225` — `deposit_wager`: Deposits SOL via CPI system_program::transfer
- `lib.rs:228-305` — `settle_match`: Distributes pot (90/7/3 BPS), closes PDA
- `lib.rs:310-395` — `cancel_match`: Refunds depositors, closes PDA
- `lib.rs:400-445` — `permissionless_reclaim`: 48h emergency escape hatch

### Key Constants
- `TIMEOUT_SECONDS = 86400` (24h) — match cancel timeout
- `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1h) — settlement deadline
- `RECLAIM_TIMEOUT_SECONDS = 172800` (48h) — permissionless reclaim
- `TREASURY_BPS = 700` (7%) — treasury fee
- `OPS_BPS = 300` (3%) — ops fee
- `MIN_WAGER = 10_000` — minimum wager in lamports
- `MAX_WAGER = 100_000_000_000` (100 SOL) — maximum wager

### Account Structs
- `GlobalConfig` (lib.rs:690-702): authority, treasury, ops, is_paused
- `MatchEscrow` (lib.rs:710-726): match_id, authority, player_one, player_two, wager_lamports, state, deposit flags, timestamps, bump

---

## CROSS-STRATEGY RELATIONSHIPS

### Chain Attack Families
1. **Authority Compromise Chain:** H001 → H002 + H005 + H007 → S001 (complete extraction)
2. **Settlement DoS Chain:** H003 + H007 → S002 (48h maximum lockup)
3. **PDA DoS Chain:** H008 → S004 (sustainable protocol DoS)
4. **Fee Capture Chain:** H002 + H011 (silent ongoing extraction)
5. **Centralization Cluster:** H005 + H014 + H027 (all require authority trust assumption)

### Critical Fix Nodes (fixes that break multiple chains)
1. **Add distinctness to update_config** → fixes H002, H003, H011, S001(partial), S002(partial)
2. **Add `has_one = authority` to CreateMatch** → fixes H008, S004, H014(partial)
3. **Two-step authority transfer** → fixes H001, S001(TX_final)
4. **Remove pause guard from cancel_match** → fixes H007, S002(partial)
5. **Multisig authority** → mitigates entire authority compromise class (H001, H002, H003, H005, H007, H011, H014, H027, S001, S002)
