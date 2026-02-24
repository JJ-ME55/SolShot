# Timing & Ordering Analysis

<!-- CONDENSED_SUMMARY_START -->

## Condensed Summary

### Key Findings

1. **Three-tier deadline system is sound at the protocol logic level.** The invariant `settlement_deadline (1h) < cancel_timeout (24h) < permissionless_reclaim (48h)` is correctly enforced via `checked_add` arithmetic on `i64` timestamps. The progressive access expansion (authority-only -> players -> anyone) prevents stuck escrows.

2. **Settlement deadline has a conditional bypass path.** The settlement deadline check at line 236 (`if ctx.accounts.escrow.activated_at > 0`) was designed for backward compatibility with pre-OC-07 matches. However, `activated_at` is ALWAYS set on the `AwaitingDeposits -> Active` transition (line 209), and `settle_match` requires state == `Active` (line 230). Therefore the `activated_at > 0` guard is redundant-but-safe: there is no path to `Active` state without `activated_at` being set. The backward-compat comment is misleading since it implies old-format accounts could reach `Active` with `activated_at == 0`, which is structurally impossible.

3. **Gap between settlement expiry and cancellation timeout creates a 23-hour dead zone.** After the 1-hour settlement deadline expires, the authority cannot settle the match. Players cannot cancel until 24 hours have elapsed. This means from hour 1 through hour 24, an Active match with an expired settlement is stuck -- neither authority nor players can act. This is a design-level timing gap. The match is not permanently stuck (player cancel becomes available at 24h), but funds are locked for an extended period unnecessarily.

4. **Deposit ordering creates a timing asymmetry.** The first depositor's funds are locked in escrow while waiting for the second depositor, who may never deposit. The first depositor can cancel from `AwaitingDeposits` state, but must do so proactively. There is no automatic refund mechanism if the second player never deposits -- the 24h timeout (keyed to `created_at` since `activated_at == 0`) eventually enables player cancellation.

5. **`Clock::get()` is used correctly (not passed as account).** All 5 Clock accesses use `Clock::get()?` (Solana sysvar API), not an injected account. This eliminates EP-006 (fake sysvar injection). However, `unix_timestamp` has 1-2 second drift from real time per Solana runtime documentation -- this is immaterial for the 1h/24h/48h timeframes in this program.

6. **Pause mechanism creates timing-sensitive ordering risk.** If the authority pauses the program while an Active match exists, settlement becomes impossible (pause guard blocks `settle_match`). Players must wait 24h for the timeout to expire, then call `cancel_match` -- but `cancel_match` is ALSO blocked by the pause guard (line 644). The only escape is `permissionless_reclaim` at 48h, which intentionally has NO pause guard. This is by design (DCA-02 escape hatch) but creates a 48-hour fund lockup during pause. Observation: if the authority key is compromised, an attacker could pause the program to grief all active matches into 48h lockups.

7. **No MEV/sandwich attack surface.** This is a pure escrow program with no swap, trade, or price-dependent logic. There is no slippage parameter because there is no exchange. Settlement amounts are deterministic (fixed BPS split). Front-running the settlement transaction gains nothing since the outcome is pre-determined by the authority's winner selection.

### Critical Invariants (Timing-Specific)

- **INV-T1:** `activated_at` is set exactly once, only during the `AwaitingDeposits -> Active` transition (line 209). It is never modified afterward.
- **INV-T2:** `created_at` is set exactly once at match creation (line 140). It is never modified afterward.
- **INV-T3:** Settlement is only possible when `Clock::get()?.unix_timestamp <= activated_at + 3600` (line 241). After 1 hour, settlement is permanently blocked.
- **INV-T4:** Player cancellation of Active matches requires `Clock::get()?.unix_timestamp > timeout_reference + 86400` (line 333).
- **INV-T5:** Permissionless reclaim requires `Clock::get()?.unix_timestamp > timeout_reference + 172800` (line 409).
- **INV-T6:** The pause guard blocks `create_match`, `deposit_wager`, `settle_match`, and `cancel_match` but NOT `permissionless_reclaim`.

### Risks (for Investigation Phase)

| ID | Risk | Severity Estimate | Location |
|----|------|-------------------|----------|
| RT-01 | 23-hour dead zone between settlement expiry and player cancel | MEDIUM | Lines 236-244 vs 329-333 |
| RT-02 | Pause + Active match = 48h fund lockup | LOW-MEDIUM | Lines 605, 644 vs PermissionlessReclaim (no pause guard) |
| RT-03 | First depositor funds locked with no deadline for second deposit | LOW | Lines 156-222 |
| RT-04 | Authority can create match and immediately settle within same slot | INFO | Lines 110-152, 228-305 |
| RT-05 | Backward-compat guard misleading but safe (activated_at > 0 check) | INFO | Line 236 |

### Cross-Focus Handoffs

- **-> Token/Economic Agent:** The 23-hour dead zone (RT-01) means funds are locked without economic activity. Investigate whether this creates opportunity cost or griefing scenarios at max wager (100 SOL).
- **-> State Machine Agent:** The state transition from `AwaitingDeposits -> Active` at line 206-209 sets `activated_at` -- verify no path exists to reach `Active` without timestamp being set. Also verify the terminal state-before-transfer pattern (OC-10) at lines 277-280, 352-355, 414-417 cannot be bypassed by transaction ordering.
- **-> Access Control Agent:** The pause/settle interaction (RT-02) means a compromised authority key can grief active matches. Investigate whether the single-key authority model has sufficient operational security for mainnet.
- **-> Error Handling Agent:** All `Clock::get()?` calls propagate errors correctly (5 instances at lines 140, 209, 241, 333, 409). Verify that clock sysvar unavailability (theoretical network issue) does not create inconsistent state.

<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

This analysis examines the SolShot escrow program (`programs/solshot-escrow/src/lib.rs`, 855 LOC) through the Timing & Ordering security lens. The program implements a wagering escrow with three time-based deadline tiers: a 1-hour settlement window, a 24-hour player cancellation timeout, and a 48-hour permissionless reclaim escape hatch.

The timing architecture is fundamentally sound. All clock accesses use `Clock::get()?` (immune to sysvar injection), all deadline arithmetic uses `checked_add` (immune to overflow), and the progressive timeout hierarchy ensures no match can be permanently stuck. The program has no swap/trade operations, eliminating MEV/sandwich concerns entirely.

The primary timing-related observations concern: (1) a 23-hour dead zone between settlement expiry and player cancellation availability, (2) the interaction between the pause mechanism and active match deadlines, and (3) a deposit-ordering asymmetry that disadvantages the first depositor. None of these are exploitable vulnerabilities in the traditional sense, but they represent design-level timing gaps that could affect user experience and fund availability.

## Scope

- **Files analyzed:** `programs/solshot-escrow/src/lib.rs` (855 lines, the entire on-chain program)
- **Functions analyzed:** `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim` (9 instruction handlers)
- **Account structs analyzed:** `InitializeConfig`, `UpdateConfig`, `PauseProgram`, `UnpauseProgram`, `CreateMatch`, `DepositWager`, `SettleMatch`, `CancelMatch`, `PermissionlessReclaim` (9 account structs)
- **State structs analyzed:** `GlobalConfig`, `MatchEscrow`, `MatchState` (3 state types)
- **Estimated coverage:** 100% of timing-relevant code paths

## Key Mechanisms

### Mechanism 1: Clock Sysvar Access Pattern

**Location:** `lib.rs:140, 209, 241, 333, 409`

**Purpose:** All time-dependent logic reads the current Unix timestamp from the Solana Clock sysvar.

**How it works:**
1. Line 140: `Clock::get()?.unix_timestamp` records `created_at` during `create_match`
2. Line 209: `Clock::get()?.unix_timestamp` records `activated_at` during `deposit_wager` (when both deposits complete)
3. Line 241: `Clock::get()?.unix_timestamp` compared against settlement deadline in `settle_match`
4. Line 333: `Clock::get()?.unix_timestamp` compared against cancellation timeout in `cancel_match`
5. Line 409: `Clock::get()?.unix_timestamp` compared against permissionless reclaim deadline in `permissionless_reclaim`

**Assumptions:**
- `Clock::get()` returns a valid, monotonically-increasing timestamp (Solana runtime guarantee)
- No injected account is needed -- `Clock::get()` reads directly from the sysvar (immune to EP-006)
- `unix_timestamp` is accurate to within 1-2 seconds of real wall-clock time (per Solana docs)
- Timestamps are `i64`, giving range to year ~292 billion (no practical overflow concern)

**Invariants:**
- INV-T1: `activated_at` is set exactly once, at the `AwaitingDeposits -> Active` transition
- INV-T2: `created_at` is set exactly once, at match creation
- Both timestamps are immutable after being set -- no instruction modifies them after initial write

**Concerns:**
- None from a security standpoint. The `Clock::get()?` pattern is the canonical safe approach.
- Timestamp drift of 1-2 seconds is immaterial for 1h/24h/48h timeframes.

---

### Mechanism 2: Settlement Deadline (1-hour window)

**Location:** `lib.rs:236-244`

**Purpose:** Enforces that settlement must occur within 1 hour of match activation, preventing indefinitely-delayed settlements.

**How it works:**
1. Line 236: Guard check -- `if ctx.accounts.escrow.activated_at > 0`
2. Lines 237-239: Compute deadline: `activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS)` where `SETTLEMENT_TIMEOUT_SECONDS = 3600`
3. Lines 240-243: Require `Clock::get()?.unix_timestamp <= deadline`, else `SettlementExpired`

**First Principles Analysis:**

*Why does the `activated_at > 0` guard exist?*
- The code comment says "backward compat with matches created pre-OC-07"
- However, `settle_match` requires state == `Active` (line 230)
- `Active` state is ONLY entered when both players deposit (line 207)
- When both players deposit, `activated_at` is set to `Clock::get()?.unix_timestamp` (line 209)
- Therefore: any match in `Active` state ALWAYS has `activated_at > 0`
- The guard is redundant. It never evaluates to false for valid matches.
- **Observation:** The backward-compat comment is misleading. There is no code path where a match reaches `Active` with `activated_at == 0`.

*What happens after the 1-hour deadline expires?*
- Settlement becomes impossible (line 242 rejects with `SettlementExpired`)
- Authority cannot cancel Active matches (line 341 restricts authority to `AwaitingDeposits` only)
- Players cannot cancel until 24h timeout (line 342 requires `is_timed_out` for Active state)
- Result: 23-hour dead zone where the match is stuck

**Assumptions:**
- Server will always settle within 1 hour of match activation
- If settlement fails, the 24h player timeout is an acceptable fallback
- The 23-hour gap is tolerable from a UX perspective

**Invariants:**
- INV-T3: After `activated_at + 3600`, no settlement is possible
- Settlement deadline is enforced strictly with `<=` (inclusive of the exact second)

**Concerns:**
- **RT-01 (23-hour dead zone):** Between hour 1 and hour 24, an expired-but-unsettled Active match has no resolution path. Funds (up to 200 SOL) are locked. This is not a vulnerability per se, but it is a timing design gap that could affect user confidence.

---

### Mechanism 3: Player Cancellation Timeout (24-hour)

**Location:** `lib.rs:310-376`

**Purpose:** Allows players to cancel matches that the authority has not settled, providing a safety net.

**How it works:**
1. Lines 321-326: Select timeout reference -- `activated_at` if > 0, else `created_at`
2. Lines 329-331: Compute deadline: `timeout_reference.checked_add(TIMEOUT_SECONDS)` where `TIMEOUT_SECONDS = 86400`
3. Line 333: Compute `is_timed_out = Clock::get()?.unix_timestamp > timeout_deadline` (strict greater-than)
4. Lines 340-344: Authorization check:
   - Authority can cancel ONLY in `AwaitingDeposits` (no timeout required)
   - Players can cancel in `AwaitingDeposits` (no timeout required) OR in any state if `is_timed_out`
5. Lines 346-349: Reject if already in terminal state (`Settled` or `Cancelled`)

**5 Whys - Timeout Reference Selection:**
1. *Why use `activated_at` vs `created_at`?* Because `activated_at` marks when real money is at stake (both deposits in). Timing from this point is more meaningful.
2. *Why fall back to `created_at`?* Because in `AwaitingDeposits` state, `activated_at == 0`. The timeout must still work for matches where only one player deposited.
3. *Why is the fallback needed?* A match could sit in `AwaitingDeposits` indefinitely if only one player deposits. The 24h timeout from `created_at` prevents permanent fund lockup.
4. *Why not just use `created_at` always?* Using `activated_at` resets the clock when the match becomes Active. If 23 hours pass before both deposits, and you used `created_at`, the player could cancel just 1 hour after the match goes Active.
5. *Why would that be bad?* Because 1 hour after activation, the game may still be in progress. The 24h timeout from `activated_at` gives a full day for the authority to settle.

**Assumptions:**
- Players have wallet access and can submit transactions after 24h
- The Solana network is operational at the 24h mark
- Players are aware of the cancellation mechanism

**Invariants:**
- INV-T4: After `timeout_reference + 86400`, any player can cancel
- Cancellation sets state to `Cancelled` BEFORE transfers (OC-10, line 354)

**Concerns:**
- **RT-03 (first depositor asymmetry):** The first depositor's funds are locked with no guaranteed second deposit. They can cancel (no timeout required in `AwaitingDeposits`), but they must proactively do so. There is no automatic refund if the second player never arrives.
- The `>` (strict) comparison at line 333 means the timeout expires at `timeout_reference + 86400 + 1 second`. This is correct and prevents boundary-condition issues.

---

### Mechanism 4: Permissionless Reclaim (48-hour escape hatch)

**Location:** `lib.rs:381-438`

**Purpose:** DCA-02 -- allows ANYONE to trigger a full refund after 48 hours, ensuring no match is permanently stuck regardless of authority or player availability.

**How it works:**
1. Lines 382-387: Read all values before mutable borrow
2. Lines 390-394: Reject terminal states
3. Lines 397-401: Select timeout reference (same logic as cancel_match)
4. Lines 404-406: Compute deadline: `timeout_reference.checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)` where `PERMISSIONLESS_RECLAIM_TIMEOUT = 172800`
5. Lines 408-411: Require `Clock::get()?.unix_timestamp > reclaim_deadline`
6. Lines 414-417: Set state to `Cancelled` BEFORE transfers
7. Lines 420-428: Refund each depositor if they deposited
8. Caller receives PDA rent as economic incentive (via `close = caller` at line 659)

**Critical Design Decision: No Pause Guard**
- The `PermissionlessReclaim` account struct (lines 653-681) does NOT include a `config` account
- This means `permissionless_reclaim` works even when the program is paused
- This is intentional: if the authority pauses the program and abandons it, funds must still be recoverable
- This is the only instruction not gated by the pause mechanism

**Assumptions:**
- 48 hours is sufficient time for legitimate settlement to occur
- The rent incentive (a few hundred lamports) is sufficient to motivate third-party reclaim callers
- No pause guard is acceptable because the 48h delay provides sufficient protection against abuse

**Invariants:**
- INV-T5: After `timeout_reference + 172800`, anyone can reclaim
- INV-T6: Pause guard blocks 4 of 5 economic instructions; `permissionless_reclaim` is exempt

**Concerns:**
- The rent incentive for callers is very small (~0.00114 SOL for a 168-byte account). At current SOL prices, this may not motivate third-party reclaim bots. However, the players themselves can also call this function.

---

### Mechanism 5: Pause/Unpause Timing Interaction

**Location:** `lib.rs:91-103` (handlers), lines 527, 551, 605, 644 (guards)

**Purpose:** Emergency pause halts all economic operations.

**How it works:**
1. `pause_program` sets `config.is_paused = true` (line 94)
2. `unpause_program` sets `config.is_paused = false` (line 101)
3. Both are idempotent (safe to call repeatedly)
4. Four account structs check `!config.is_paused`:
   - `CreateMatch` (line 527)
   - `DepositWager` (line 551)
   - `SettleMatch` (line 605)
   - `CancelMatch` (line 644)
5. `PermissionlessReclaim` has NO pause check (intentional)

**5 Hows - Pause Timing Attack Surface:**

1. *How does pause interact with active matches?*
   - Pause prevents settlement, so active matches cannot be resolved
   - Pause prevents cancellation, so players cannot exit
   - Only `permissionless_reclaim` at 48h provides escape

2. *How could pause be exploited?*
   - Compromised authority key pauses program, locking all active match funds for 48h
   - Authority creates many matches, deposits, then pauses -- all opponents' funds locked
   - However: authority-as-player is prohibited (OC-06, lines 128-129), so the authority cannot be a depositor

3. *How does unpause interact with expired deadlines?*
   - If program is paused for >1h, settlement deadlines expire during pause
   - After unpause, those matches can no longer be settled (deadline check at line 241 is wall-clock based)
   - The matches fall through to 24h player cancel or 48h permissionless reclaim

4. *How does this fail?*
   - If authority key is lost AND program is paused, only the 48h reclaim path works
   - This is acceptable -- DCA-02 ensures eventual fund recovery

5. *How would an attacker approach this?*
   - Most likely: compromise authority key, pause program, wait 48h while creating chaos
   - Impact: temporary fund lockup (48h max), reputational damage
   - Mitigation: transfer authority to multisig before mainnet (OC-13)

**Assumptions:**
- Authority key is secure (single point of failure currently)
- Pause is a last-resort emergency mechanism, not routine
- 48h is an acceptable maximum fund lockup under worst-case conditions

**Invariants:**
- Pause is a single boolean flag -- no partial pause states
- Pause does not affect permissionless reclaim

**Concerns:**
- **RT-02:** Pause creates a 48h fund lockup for all active matches. This is by design but represents significant griefing potential if the authority key is compromised.

---

### Mechanism 6: Deposit Ordering and Timing

**Location:** `lib.rs:156-222`

**Purpose:** Two-step deposit process where each player calls `deposit_wager` independently.

**How it works:**
1. Lines 163-166: Verify match is in `AwaitingDeposits`
2. Lines 168-176: Identify depositor (player one or two) and verify not already deposited
3. Lines 179-188: Transfer SOL via CPI
4. Lines 191-197: Update deposit flags
5. Lines 206-220: If both deposited, transition to `Active` and set `activated_at`

**Ordering Analysis:**

*What if both players submit deposit transactions simultaneously?*
- Solana processes them sequentially within a block
- The first transaction processed sets the deposit flag
- The second transaction sees the first deposit and transitions to Active
- The `AlreadyDeposited` check (lines 173, 175) prevents double-deposits
- This is safe: the escrow account is write-locked between transactions

*What if player one deposits and player two never deposits?*
- Match stays in `AwaitingDeposits` indefinitely
- `activated_at` remains 0
- Timeout reference falls back to `created_at`
- After 24h from creation, player one can cancel and reclaim their deposit
- After 48h from creation, anyone can trigger permissionless reclaim

*Can an attacker front-run the second deposit with a cancel?*
- If the authority sees player two's deposit transaction in the mempool, could the authority submit a cancel first?
- Authority CAN cancel `AwaitingDeposits` matches (line 341)
- If the cancel executes first, the deposit would fail (match no longer exists -- PDA is closed)
- This is a theoretical front-running vector, but the authority is trusted in this protocol model

**Assumptions:**
- Server (authority) acts honestly and does not front-run player deposits
- Players trust the server to not cancel a match after one player has deposited
- Both players intend to deposit in a timely manner

**Invariants:**
- Each player can deposit exactly once (boolean flags, lines 137-138, 193-196)
- Active state requires both deposits (line 206)

**Concerns:**
- **RT-03:** First depositor is disadvantaged -- their funds are locked while awaiting the second deposit. No automatic timeout refund exists; the player must actively cancel.
- **RT-04:** The authority creates the match AND settles it. There is no enforced minimum time between match creation, both deposits, and settlement. In theory, the authority could create a match, both players deposit instantly, and the authority settles all within the same Solana slot (~400ms). This is not necessarily a vulnerability (the match outcome is determined by the game server), but it means the on-chain program has no concept of "match duration."

---

## Trust Model

| Entity | Role | Trust Level | Timing Relevance |
|--------|------|-------------|------------------|
| Authority (server keypair) | Creates matches, settles matches, can cancel AwaitingDeposits, can pause/unpause | FULL | Controls settlement timing; can delay settlement up to 1h; cannot delay cancel beyond 24h timeout |
| Player one / Player two | Deposit wagers, can cancel after timeout | LIMITED | Can be front-run by authority on deposits; must proactively cancel if needed |
| Any third party | Can trigger permissionless reclaim after 48h | NONE (permissionless) | Only timing constraint is 48h elapsed |
| Solana Clock sysvar | Provides timestamp | RUNTIME-TRUSTED | 1-2 second drift, immaterial for this program |

## State Analysis

### Time-Related State Fields

| Field | Type | Set At | Modified After | Used By |
|-------|------|--------|----------------|---------|
| `created_at` | `i64` | `create_match` (line 140) | Never | `cancel_match` (timeout ref fallback), `permissionless_reclaim` (timeout ref fallback) |
| `activated_at` | `i64` | `deposit_wager` when both deposit (line 209) | Never | `settle_match` (deadline check), `cancel_match` (timeout ref), `permissionless_reclaim` (timeout ref) |
| `is_paused` | `bool` | `initialize_config` (line 61, false) | `pause_program` (line 94, true), `unpause_program` (line 101, false) | 4 account struct constraints |

### Time Constants

| Constant | Value | Type | Line |
|----------|-------|------|------|
| `SETTLEMENT_TIMEOUT_SECONDS` | 3600 (1 hour) | `i64` | 26 |
| `TIMEOUT_SECONDS` | 86400 (24 hours) | `i64` | 20 |
| `PERMISSIONLESS_RECLAIM_TIMEOUT` | 172800 (48 hours) | `i64` | 23 |

## Dependencies

- **`anchor_lang::prelude::*`**: Provides `Clock::get()` for sysvar access
- **`anchor_lang::system_program`**: CPI for SOL transfers in `deposit_wager`
- No external oracle dependencies
- No external time sources beyond `Clock::get()`

## Focus-Specific Analysis

### 1. Time-Dependent Operations Map

| Instruction | Uses Clock? | Time-Sensitive Calculation | What Happens If Clock Manipulated (+/- 1 slot) |
|-------------|-------------|---------------------------|----------------------------------------------|
| `create_match` | Yes (line 140) | Sets `created_at` | +/- 0.4s on creation timestamp; immaterial for 24h/48h timeouts |
| `deposit_wager` | Yes (line 209) | Sets `activated_at` when both deposit | +/- 0.4s on activation timestamp; immaterial for 1h settlement window |
| `settle_match` | Yes (line 241) | Compares `now <= activated_at + 3600` | +/- 0.4s on deadline comparison; could shift boundary by ~1 second; immaterial |
| `cancel_match` | Yes (line 333) | Compares `now > timeout_ref + 86400` | +/- 0.4s; immaterial |
| `permissionless_reclaim` | Yes (line 409) | Compares `now > timeout_ref + 172800` | +/- 0.4s; immaterial |
| `initialize_config` | No | None | N/A |
| `update_config` | No | None | N/A |
| `pause_program` | No | None | N/A |
| `unpause_program` | No | None | N/A |

**Clock manipulation risk assessment:** Solana validators set `unix_timestamp` with 1-2 second maximum drift. Since all deadlines in this program are >= 3600 seconds, a few seconds of clock manipulation has zero practical impact. This program is NOT vulnerable to timestamp manipulation attacks.

### 2. MEV Attack Surface

| Instruction | Involves Tokens? | Can Be Sandwiched? | Slippage Protection? | Max Extractable Value |
|-------------|-----------------|--------------------|--------------------|---------------------|
| `create_match` | No (PDA creation only) | No | N/A | 0 |
| `deposit_wager` | Yes (SOL transfer) | No (fixed amount) | N/A (amount is deterministic) | 0 |
| `settle_match` | Yes (SOL distribution) | No (amounts deterministic) | N/A (fixed BPS split) | 0 |
| `cancel_match` | Yes (SOL refund) | No (exact refund of deposit) | N/A | 0 |
| `permissionless_reclaim` | Yes (SOL refund + rent) | No (exact refund) | N/A | PDA rent (~0.001 SOL) |

**Assessment:** This program has ZERO MEV attack surface. All token movements are either:
- Fixed amounts (deposits are `wager_lamports`, refunds are `wager_lamports`)
- Deterministic calculations (settlement uses fixed BPS split)
- No price-dependent operations exist
- No swap, trade, or exchange functionality exists

The only value a "front-runner" could extract is the PDA rent in `permissionless_reclaim`, which is ~0.001 SOL -- not economically meaningful.

### 3. Front-Running Risk Assessment

| Scenario | Information Revealed | Front-Runner Action | Impact |
|----------|---------------------|-------------------|--------|
| Player submits `deposit_wager` | Match ID, player identity, wager amount | Authority cancels match before deposit | Player's deposit fails (PDA closed); no fund loss |
| Authority submits `settle_match` | Winner identity | Competitor submits conflicting settle | Not possible (authority-only) |
| Player submits `cancel_match` at 24h | Match being cancelled | MEV bot submits first | No benefit (same refund amounts either way) |
| Anyone submits `permissionless_reclaim` at 48h | Match being reclaimed | MEV bot submits first | Bot receives PDA rent (~0.001 SOL) instead of original caller |

**Assessment:** The only actionable front-running scenario is the authority cancelling a match before a player's deposit. This is not a blockchain-level attack -- it is a server-level trust issue (the authority is the game server). The protocol's trust model already assumes the authority acts honestly.

The `permissionless_reclaim` rent-stealing via front-running is economically negligible.

### 4. Ordering Dependency Analysis

**Operations that MUST happen in sequence:**

```
create_match -> deposit_wager (p1) -> deposit_wager (p2) -> settle_match
                                                          -> cancel_match (after timeout)
                                                          -> permissionless_reclaim (after 2x timeout)
```

**What if reordered?**

| Reordering Attempt | Result | Protected By |
|-------------------|--------|-------------|
| `deposit_wager` before `create_match` | Fails: PDA doesn't exist | Anchor `seeds` constraint (account not found) |
| `settle_match` before both deposits | Fails: state != `Active` | Line 230 state check |
| `settle_match` before `deposit_wager` (p2) | Fails: state still `AwaitingDeposits` | Line 230 state check |
| `cancel_match` during Active before timeout | Fails: not authority AND not timed out | Lines 340-344 authorization check |
| Double `deposit_wager` by same player | Fails: `AlreadyDeposited` | Lines 173, 175 boolean checks |
| `settle_match` after `cancel_match` | Fails: state == `Cancelled` (terminal) | Line 230 state check (state != `Active`) |
| `cancel_match` after `settle_match` | Fails: PDA is closed (Anchor `close`) | Account doesn't exist |

**What if another TX inserts between operations?**

| Between | Inserted TX | Impact |
|---------|-------------|--------|
| `create_match` and `deposit_wager` | `cancel_match` (by authority) | Match cancelled; deposit fails (PDA state wrong or closed) |
| `deposit_wager` (p1) and `deposit_wager` (p2) | `cancel_match` (by p1) | Match cancelled; p1 refunded; p2 deposit fails |
| Both deposits and `settle_match` | `cancel_match` (by player, if timed out) | Race condition: whoever's TX lands first wins. Settlement OR cancellation, not both. Protected by terminal state + close. |
| `deposit_wager` and `settle_match` (same slot) | Nothing | Technically possible: create + 2 deposits + settle in 1 block. Not a vulnerability. |

**Critical observation on close-race:** When settlement and cancellation are both eligible (after 24h for players), the first transaction to land determines the outcome. Anchor's `close` constraint physically removes the PDA account, preventing any subsequent operation. The terminal state set BEFORE transfers (OC-10) provides additional defense. This is safe.

## Cross-Focus Intersections

| This Focus (Timing) | Intersects With | Intersection Point |
|---------------------|----------------|-------------------|
| Settlement deadline (1h) | State Machine | Active state is prerequisite; deadline creates implicit new sub-state ("Active but expired") |
| 24h cancel timeout | Access Control | Different authorization rules before vs after timeout |
| 48h permissionless reclaim | Access Control | Bypass of all authorization (permissionless) |
| Pause mechanism | State Machine | Pause creates implicit "frozen" state for all operations |
| Pause + Active match | Token/Economic | 48h fund lockup during pause |
| Deposit ordering | State Machine | `AwaitingDeposits -> Active` transition timing |
| `Clock::get()` usage | Account Validation | Not passed as account -- EP-006 mitigated by design |

## Cross-Reference Handoffs

- **-> Token/Economic Agent:** The 23-hour dead zone (RT-01) between settlement expiry and player cancel means funds up to 200 SOL (2 * max wager) can be locked without resolution for nearly a full day. Evaluate whether this creates unacceptable opportunity cost or griefing potential. Also: the PDA rent incentive for `permissionless_reclaim` is very small (~0.001 SOL) -- verify this is sufficient to motivate third-party reclaim bots.

- **-> State Machine Agent:** The `activated_at > 0` guard at line 236 is structurally redundant (no path to Active with `activated_at == 0`). Verify this invariant is maintained by confirming all transitions to Active state are covered. Also verify the state-before-transfer pattern (OC-10) at lines 277-280, 352-355, 414-417 is atomic from the perspective of same-transaction reordering.

- **-> Access Control Agent:** The pause/settle interaction (RT-02) means a compromised authority can lock all active match funds for 48 hours by pausing the program. The `update_config` instruction (line 70) allows single-step authority transfer with no timelock. Investigate whether the authority key has sufficient operational security for mainnet deployment, and whether the lack of timelock on authority transfer creates additional risk.

- **-> Error Handling Agent:** Verify that `Clock::get()?` failure (theoretical sysvar unavailability) does not leave state partially modified. Since Solana transactions are atomic, a Clock error should revert the entire instruction -- but confirm this interacts correctly with the `close` constraint on settlement/cancellation.

## Risk Observations

- **RT-01 (23-hour dead zone):** After the 1-hour settlement deadline expires, there is no resolution mechanism until the 24-hour player cancel timeout. This is a design gap, not a vulnerability. Funds up to 200 SOL are locked during this period. The gap exists because the authority is restricted from cancelling Active matches (OC-05, line 341), and players require the timeout to cancel Active matches. A potential mitigation would be to add an authority-cancel path for Active matches with expired settlement deadlines.

- **RT-02 (Pause + Active match lockup):** Pausing the program blocks settlement AND cancellation. Only the 48h permissionless reclaim provides escape. This is intentional (DCA-02) but creates a 48-hour worst-case fund lockup. If the authority key is compromised, an attacker could strategically pause to maximize disruption.

- **RT-03 (First depositor asymmetry):** The first player to deposit has their funds locked in escrow with no guarantee the second player will deposit. The first player can cancel, but must proactively do so. No automatic timeout refund exists for `AwaitingDeposits` state (the player must submit a cancel transaction). This is a UX concern rather than a security issue.

- **RT-04 (Instant settlement):** The program has no minimum match duration. A match could be created, funded, and settled within a single Solana slot. The on-chain program has no concept of "game duration" -- it trusts the authority to settle at the appropriate time. This is consistent with the server-authoritative design, but means the on-chain program cannot enforce fair play timing.

- **RT-05 (Redundant backward-compat guard):** The `if ctx.accounts.escrow.activated_at > 0` check at line 236 is described as "backward compat with matches created pre-OC-07." This is misleading: there is no code path where a match reaches Active state with `activated_at == 0`. The check is harmless but the comment should be updated to avoid confusion during future maintenance.

## Novel Attack Surface Observations

- **Pause-then-grief pattern:** An attacker who compromises the authority key has a novel griefing strategy: (1) create many high-wager matches, (2) wait for all to reach Active state, (3) pause the program, (4) all matches are locked for 48h. The attacker cannot steal funds (settlement requires winner to be a registered player, and authority cannot be a player), but they can deny access to up to `N * 200 SOL` of player funds for 48 hours. This is unique to this protocol's combination of pause mechanism + timeout architecture + authority model. The mitigation is OC-13 (multisig authority before mainnet), but if the multisig has insufficient threshold, the same attack applies.

- **Settlement deadline as implicit authority timeout:** The 1-hour settlement window effectively creates a "use it or lose it" deadline for the authority. If the authority's server goes down for >1 hour during an active match, settlement becomes permanently impossible for that match. Players must wait 23 additional hours (24h total) to recover their funds. This is a novel interaction between the settlement deadline and the server's operational reliability. On Solana mainnet, with validator outages (EP-124 describes multi-hour halts), a network outage during a match could trigger this scenario even without server failure.

## Questions for Other Focus Areas

- **For State Machine focus:** Can the terminal state-before-transfer pattern (OC-10) be defeated by same-transaction instruction ordering? Specifically: if `settle_match` sets state to `Settled` at line 279, then Anchor's `close` constraint zeroes the account -- could a subsequent instruction in the same transaction observe the intermediate state?

- **For Access Control focus:** The `update_config` instruction allows single-step authority transfer (line 79). If the new authority is a malicious key, the attacker immediately gains full control over all future settlements and the pause mechanism. Is there a two-step authority transfer pattern that should be recommended?

- **For Arithmetic focus:** The settlement deadline comparison uses `<=` (line 241: `now <= deadline`), while the cancellation timeout uses `>` (line 333: `now > deadline`). Is this intentional asymmetry correct? It means there is exactly 1 second where settlement is possible but cancellation is not. This seems correct (settlement should be inclusive, cancellation should be strictly after), but warrants confirmation.

- **For Error Handling focus:** If `Clock::get()` fails at line 209 (setting `activated_at`), the deposit CPI has already executed (line 179-188). Does Solana's transaction atomicity guarantee the CPI is reverted? (Answer should be yes, but this is an important assumption to verify.)

## Raw Notes

### Clock Access Inventory

```
Line 140: Clock::get()?.unix_timestamp  -- create_match, sets created_at
Line 209: Clock::get()?.unix_timestamp  -- deposit_wager, sets activated_at (conditional on both deposited)
Line 241: Clock::get()?.unix_timestamp  -- settle_match, compares against deadline
Line 333: Clock::get()?.unix_timestamp  -- cancel_match, determines is_timed_out
Line 409: Clock::get()?.unix_timestamp  -- permissionless_reclaim, compares against reclaim_deadline
```

All 5 instances use `Clock::get()?` (sysvar API, not account injection). All propagate errors via `?`.

### Deadline Comparison Operators

```
Line 241: now <= deadline          (settlement: inclusive, "at or before deadline")
Line 333: now > timeout_deadline   (cancellation: exclusive, "strictly after timeout")
Line 409: now > reclaim_deadline   (reclaim: exclusive, "strictly after timeout")
```

The asymmetry is intentional: settlement should be allowed up to and including the deadline second, while cancellation/reclaim should only be allowed AFTER the full timeout has elapsed.

### State-Before-Transfer Pattern (OC-10) Locations

```
Lines 277-280: settle_match -- escrow.state = MatchState::Settled (in scoped borrow)
Lines 352-355: cancel_match -- escrow.state = MatchState::Cancelled (in scoped borrow)
Lines 414-417: permissionless_reclaim -- escrow.state = MatchState::Cancelled (in scoped borrow)
```

All three follow the same pattern: set terminal state in a scoped mutable borrow, drop the borrow, then perform lamport transfers. This prevents any re-entrancy or double-execution path.

### Timeout Reference Selection Pattern

Used identically in two locations:

```rust
// cancel_match (lines 322-326)
let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
    ctx.accounts.escrow.activated_at
} else {
    ctx.accounts.escrow.created_at
};

// permissionless_reclaim (lines 397-401)
let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
    ctx.accounts.escrow.activated_at
} else {
    ctx.accounts.escrow.created_at
};
```

This duplicated logic is consistent between the two functions. The fallback to `created_at` ensures matches stuck in `AwaitingDeposits` (where `activated_at == 0`) can still be cancelled/reclaimed.
