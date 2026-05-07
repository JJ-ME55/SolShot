# State Machine & Error Handling Analysis

<!-- CONDENSED_SUMMARY_START -->
## Condensed Summary

### Scope
- **File:** `programs/solshot-escrow/src/lib.rs` (855 LOC)
- **Focus:** On-chain MatchState lifecycle, transition guards, account lifecycle, error handling, and invariant enforcement
- **Coverage:** 100% of state-related code paths in the escrow program

### State Machine Model
Four-state lifecycle: `AwaitingDeposits -> Active -> Settled | Cancelled`. Terminal states (`Settled`, `Cancelled`) have no outbound transitions. The enum is `MatchState` at line 757.

### Key Invariants
1. **Terminal Finality:** Once `Settled` or `Cancelled`, no instruction can modify the escrow (enforced by explicit `require!` checks + Anchor `close` constraint)
2. **Deposit Atomicity:** `activated_at` is set in the same atomic instruction as the `Active` transition; they cannot diverge
3. **State-Before-Transfer (OC-10):** All three fund-moving instructions set terminal state before lamport transfers
4. **Fee Immutability:** BPS constants are compile-time; cannot be changed without program upgrade
5. **Pause Asymmetry:** `cancel_match` requires `!is_paused` but `permissionless_reclaim` does not (intentional DCA-02 escape hatch)

### Risk Observations (Ranked)
1. **23-Hour Dead Zone (MEDIUM):** Between settlement expiry (1h) and player cancellation (24h), no actor can process an Active match. Funds locked with no escape path until hour 24.
2. **update_config Validation Gap (MEDIUM):** `update_config` does not re-validate address distinctness. Setting `treasury == ops` permanently blocks all settlements. Setting `authority` to an invalid key causes permanent lockout (one-step transfer, no two-step pattern).
3. **Pause-as-DoS (LOW):** A compromised authority can pause to block `cancel_match` for up to 48h until `permissionless_reclaim` activates. Cannot steal funds but can delay refunds.
4. **Same-TX PDA Revival (LOW):** After `close`, the same `match_id` PDA can be re-initialized in a subsequent instruction. Not financially exploitable (new escrow starts fresh) but allows match_id reuse.

### Cross-Focus Handoffs
- **-> Access Control:** `update_config` lacks distinctness re-validation (lines 70-89); one-step authority transfer risk; authority as sole settlement actor
- **-> Timing:** 1h/24h/48h deadline hierarchy creates dead zone; `Clock::get()` timestamp accuracy (1-2s variance on 3600s window is negligible)
- **-> Token/Economic:** Remainder strategy for winner amount (lines 270-274); fee rounding direction favors protocol; `treasury == ops` config state blocks settlements
- **-> Error Handling:** All checked arithmetic propagates via `ok_or(EscrowError::ArithmeticOverflow)?`; no `.unwrap()` in instruction handlers; `try_borrow_mut_lamports` propagates with `?`
- **-> CPI:** Single CPI call (system_program::transfer in deposit_wager line 179); all other transfers are direct lamport manipulation
<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

The SolShot on-chain escrow program implements a clean four-state lifecycle (`AwaitingDeposits`, `Active`, `Settled`, `Cancelled`) with well-defined transition guards. Terminal states are enforced consistently across all instructions, and the state-before-transfer pattern (OC-10) is applied as defense-in-depth. The state machine uses Rust's enum type system to prevent invalid states at the language level.

The primary state machine risk is structural: a 23-hour dead zone between the 1-hour settlement deadline and the 24-hour player cancellation timeout, during which no actor can process an Active match. This is a design trade-off (preventing authority from canceling to deny winners) but results in extended fund lockup if the authority fails to settle.

The secondary risk is in the `update_config` instruction, which can modify the authority, treasury, and ops addresses without re-validating that they remain distinct. This could be used to create a permanently broken configuration that blocks all settlements, forcing matches through the cancellation/reclaim path. Combined with the lack of a two-step authority transfer pattern, this creates centralization risk around the authority key.

## Scope

**Files analyzed:**
- `programs/solshot-escrow/src/lib.rs` (855 LOC) -- all instruction handlers, account structs, state enums, error codes

**Functions analyzed:**
- `initialize_config` (line 47)
- `update_config` (line 70)
- `pause_program` (line 93)
- `unpause_program` (line 100)
- `create_match` (line 110)
- `deposit_wager` (line 156)
- `settle_match` (line 228)
- `cancel_match` (line 310)
- `permissionless_reclaim` (line 381)

**Estimated coverage:** 100% of on-chain state machine logic

## Key Mechanisms

### MatchState Enum
**Location:** `lib.rs:756-762`

**Purpose:** Defines the four possible states of a match escrow account.

**How it works:**
```
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MatchState {
    AwaitingDeposits,  // Variant 0
    Active,            // Variant 1
    Settled,           // Variant 2
    Cancelled,         // Variant 3
}
```

**Assumptions:**
- Borsh serialization maps variants to single bytes (0-3)
- `PartialEq` and `Eq` are derived, enabling `==` comparisons in guards
- `Copy` semantics mean state reads don't consume the value (can read multiple times)

**Invariants:**
- Serialized representation is 1 byte (4 variants fit in u8)
- Deserialization of any byte value 0-3 yields a valid variant
- Byte values >= 4 would cause deserialization failure (Anchor discriminator + Borsh handles this)

**Concerns:**
- None. Standard Anchor enum pattern.

---

### State Transition: AwaitingDeposits -> Active
**Location:** `lib.rs:206-209` (inside `deposit_wager`)

**Purpose:** Transition match to Active when both players have deposited their wagers.

**How it works:**
1. Line 206: Check both `player_one_deposited` AND `player_two_deposited`
2. Line 207: Set `escrow.state = MatchState::Active`
3. Line 209: Set `escrow.activated_at = Clock::get()?.unix_timestamp`

**Assumptions:**
- The deposit flags are set BEFORE this check (lines 193-197), so the current depositor's flag is already true
- `Clock::get()?.unix_timestamp` is always > 0 on any Solana network (mainnet epoch started at 1585958400)
- Both lines 207 and 209 are in the same instruction and thus atomic

**Invariants:**
- `activated_at > 0` if and only if `state == Active` (or was Active before terminal transition)
- Both players must have deposited before Active (no partial activation)
- The transition only happens once per match (subsequent deposits are blocked by `AlreadyDeposited` check)

**Concerns:**
- Lines 207 and 209 are sequential within the same mutable borrow block. If `Clock::get()` returned an error between them, the instruction would fail and both changes roll back. This is sound.

---

### State Transition: Active -> Settled
**Location:** `lib.rs:229-291` (inside `settle_match`)

**Purpose:** Distribute pot to winner, treasury, and ops accounts; close escrow.

**How it works:**
1. Line 229-232: Guard -- `state == Active`
2. Lines 236-243: Guard -- settlement deadline (activated_at + 3600 <= now)
3. Lines 247-274: Calculate distribution amounts
4. Lines 277-280: Set `state = Settled` (OC-10: before transfers)
5. Lines 284-291: Perform three lamport transfers
6. Anchor `close = authority` runs after instruction body

**Assumptions:**
- Authority is the sole actor who can settle (enforced by `has_one = authority` on config, line 565/604)
- Winner is validated to be player_one or player_two (Anchor constraint lines 576-579)
- Treasury and ops are validated against config (lines 587-597)
- The settlement deadline of 1 hour is sufficient for the server to process match results

**Invariants:**
- Settlement can only happen once (state transitions to Settled, then account is closed)
- `winner_amount + treasury_amount + ops_amount == total_pot` (remainder strategy at line 270-274)
- All funds leave the escrow PDA (transfers + close constraint reclaims rent)

**Concerns:**
- The `if ctx.accounts.escrow.activated_at > 0` guard at line 236 is defensive. For any match in Active state, `activated_at` is guaranteed > 0 because it's set atomically during the Active transition. The guard is theoretically unnecessary but harmless.
- The settlement deadline uses `<=` (inclusive): `Clock::get()?.unix_timestamp <= deadline`. This means the last second of the window is included. Solana clock variance of 1-2 seconds is negligible relative to the 3600-second window.

---

### State Transition: Any Non-Terminal -> Cancelled (cancel_match)
**Location:** `lib.rs:310-376`

**Purpose:** Refund both players' deposits. Two-tier authorization: authority for AwaitingDeposits only; players for AwaitingDeposits or after 24h timeout.

**How it works:**
1. Lines 315-319: Read state values before mutable borrow
2. Lines 322-326: Determine timeout reference (activated_at if > 0, else created_at)
3. Lines 329-331: Calculate timeout deadline with checked_add
4. Line 333: Evaluate `is_timed_out = now > timeout_deadline`
5. Lines 336-338: Determine caller role (authority or player)
6. Lines 340-344: Authorization guard (complex compound condition)
7. Lines 346-349: Guard -- state is not terminal
8. Lines 352-355: Set `state = Cancelled` (OC-10: before transfers)
9. Lines 358-366: Conditional refunds based on deposit flags
10. Anchor `close = caller` runs after instruction body

**Assumptions:**
- Authority should only cancel matches that haven't started (AwaitingDeposits), not active games
- Players deserve a timeout-based escape if the authority fails to settle
- The 24-hour timeout is measured from activation (if activated) or creation (if never activated)

**Invariants:**
- Authority can only cancel AwaitingDeposits (line 341)
- Players can cancel AwaitingDeposits immediately OR any non-terminal state after 24h (line 342)
- Refunds are conditional on deposit flags -- only deposited amounts are returned
- After cancellation, account is closed (no residual state)

**Concerns:**
- The authorization logic at lines 340-344 is a compound boolean expression. Let me trace all paths:
  - `is_authority && AwaitingDeposits` -> ALLOWED (authority cancels pre-game)
  - `is_authority && Active` -> NOT ALLOWED (authority cannot cancel active games)
  - `is_authority && Settled` -> NOT ALLOWED (terminal guard at line 347)
  - `is_authority && Cancelled` -> NOT ALLOWED (terminal guard at line 347)
  - `is_player && AwaitingDeposits` -> ALLOWED (player cancels pre-game)
  - `is_player && Active && !timed_out` -> NOT ALLOWED (line 342 requires AwaitingDeposits OR is_timed_out)
  - `is_player && Active && timed_out` -> ALLOWED (player cancels after timeout)
  - `is_player && Settled` -> NOT ALLOWED (terminal guard at line 347)
  - `is_player && Cancelled` -> NOT ALLOWED (terminal guard at line 347)
  - `!is_authority && !is_player` -> NOT ALLOWED (Unauthorized error)
- The guard ordering matters: the authorization check (line 340) runs BEFORE the terminal state check (line 346). This means a random caller (not authority, not player) gets `Unauthorized` rather than `InvalidState` even if the match is already terminal. This is correct behavior (don't leak state information to unauthorized callers).

---

### State Transition: Any Non-Terminal -> Cancelled (permissionless_reclaim)
**Location:** `lib.rs:381-437`

**Purpose:** Permissionless escape hatch after 48 hours. Anyone can trigger refund and receive PDA rent as incentive.

**How it works:**
1. Lines 383-387: Read state values before mutable borrow
2. Lines 390-394: Guard -- state is not terminal
3. Lines 397-401: Determine timeout reference
4. Lines 404-406: Calculate reclaim deadline (timeout_ref + 172800)
5. Lines 408-410: Guard -- `now > reclaim_deadline`
6. Lines 414-417: Set `state = Cancelled` (OC-10: before transfers)
7. Lines 420-428: Conditional refunds
8. Anchor `close = caller` runs after instruction body

**Assumptions:**
- After 48 hours, any match should be considered abandoned
- The economic incentive (PDA rent to caller) is sufficient to motivate third-party cleanup
- This instruction intentionally has NO pause guard (escape hatch must work even during emergency)

**Invariants:**
- 48-hour minimum waiting period from activation/creation
- Refunds go to the recorded player addresses (validated by Anchor constraints at lines 667-678)
- Caller receives only PDA rent, not any wager funds

**Concerns:**
- No pause guard is intentional (DCA-02) but creates an asymmetry: during a pause, `cancel_match` is blocked but `permissionless_reclaim` is not. This means the pause effectively delays refunds by up to 48h - 24h = 24h longer than without a pause (since `cancel_match` at 24h is blocked, players must wait for permissionless at 48h).
- The `close = caller` means anyone who triggers reclaim gets the PDA rent (~0.00197 SOL for 168 bytes). This is a small but real economic incentive. Could an attacker spam `permissionless_reclaim` on many expired matches for profit? Yes, but this is by design -- it incentivizes cleanup.

---

### GlobalConfig Lifecycle
**Location:** Lines 691-708 (struct), lines 446-461 (init), lines 464-475 (update)

**Purpose:** Singleton configuration PDA storing authority, treasury, ops, and pause state.

**How it works:**
- Created once via `initialize_config` with `init` constraint (Anchor discriminator prevents re-init)
- Modified via `update_config` (authority signer required)
- Modified via `pause_program` / `unpause_program` (authority signer required)
- Never closed (no `close` constraint anywhere)

**Assumptions:**
- The deployer calls `initialize_config` immediately after deploy
- The authority key is a server hot wallet
- Treasury and ops are wallets controlled by the project team

**Invariants:**
- Config PDA exists at `[b"config"]` -- program-wide singleton
- Only the current authority can modify config
- Config cannot be re-initialized (Anchor `init` prevents it)

**Concerns:**
- `update_config` (lines 70-89) does NOT re-validate address distinctness. After initialization, the authority can:
  1. Set `treasury == ops` (blocks all settlements due to `DuplicateFeeAccount` constraint at line 588)
  2. Set `authority == treasury` or `authority == ops` (no immediate exploit but weakens separation)
  3. Set `authority` to `Pubkey::default()` or an uncontrolled key (permanent lockout)
- There is no two-step authority transfer. If the authority calls `update_config` with `new_authority = Some(wrong_key)`, authority is permanently transferred with no recovery.
- There is no timelock on config changes. Authority changes, treasury changes, and ops changes take effect immediately.

---

### Pause Mechanism
**Location:** Lines 93-103 (pause/unpause handlers), lines 527, 551, 605, 644 (guard constraints)

**Purpose:** Emergency halt of all economic operations.

**How it works:**
- `pause_program`: Sets `config.is_paused = true`
- `unpause_program`: Sets `config.is_paused = false`
- Both are idempotent (safe to call when already in the target state)
- Guard constraint `!config.is_paused @ EscrowError::ProgramPaused` applied to:
  - `CreateMatch` (line 527)
  - `DepositWager` (line 551)
  - `SettleMatch` (line 605)
  - `CancelMatch` (line 644)
- NOT applied to:
  - `PermissionlessReclaim` (intentional -- DCA-02 escape hatch)
  - `UpdateConfig` (authority must be able to change config during pause)
  - `PauseProgram` / `UnpauseProgram` (cannot guard itself)

**Assumptions:**
- A single authority key controls both pause and settlement
- Pause is a binary toggle (no granular per-instruction pause)

**Invariants:**
- Paused state blocks create, deposit, settle, and cancel
- Paused state does NOT block permissionless_reclaim (after 48h timeout)
- Paused state does NOT block config updates

**Concerns:**
- The pause mechanism does not differentiate between "pause deposits" and "pause settlements." A pause blocks everything except permissionless_reclaim.
- During pause, active matches cannot be settled (authority blocked) or cancelled (players blocked). The only exit path is permissionless_reclaim after 48 hours. This means a griefing authority can delay all refunds by up to 48 hours by pausing.
- The same authority that settles matches also controls the pause. There is no separation of duties (noted in the code comment at line 69: "v1.2 -- separate multisig for update_config vs pause_program").

---

## Trust Model

| Role | Who | Trust Level | What They Can Do |
|------|-----|-------------|------------------|
| Authority | Server hot wallet | FULL | Create matches, settle matches, cancel AwaitingDeposits, pause/unpause, update config |
| Players | Wallet signers | LIMITED | Deposit wagers, cancel (AwaitingDeposits or after 24h timeout) |
| Permissionless Caller | Anyone | NONE | Trigger reclaim after 48h (receives PDA rent) |

**Critical trust assumption:** The authority determines the winner. There is no on-chain mechanism to verify gameplay outcomes. Players must trust the server to report the correct winner.

## State Analysis

### State Diagram

```
                  create_match()
                       |
                       v
              [AwaitingDeposits]
              /        |        \
  deposit_wager()  cancel(auth)  cancel(player)
  (1st deposit)      |              |
              \       v              v
              [AwaitingDeposits]  [CANCELLED] *terminal*
                     |
            deposit_wager()
            (2nd deposit)
                     |
                     v
                 [Active]
               /    |     \
    settle()  cancel(player  permissionless_reclaim()
       |      after 24h)        (after 48h)
       v         |                    |
  [SETTLED]  [CANCELLED]         [CANCELLED]
  *terminal*  *terminal*          *terminal*
```

### Transition Matrix

| From State | To State | Instruction | Guard Condition | Can Attacker Trigger? |
|---|---|---|---|---|
| AwaitingDeposits | AwaitingDeposits (self) | deposit_wager | player is p1 or p2; not already deposited; not paused | No (player must sign) |
| AwaitingDeposits | Active | deposit_wager | both players deposited; not paused | No (both players must sign separately) |
| AwaitingDeposits | Cancelled | cancel_match | caller is authority; not paused | Only authority |
| AwaitingDeposits | Cancelled | cancel_match | caller is player; not paused | Only registered player |
| AwaitingDeposits | Cancelled | permissionless_reclaim | now > created_at + 172800 | Yes (anyone, after 48h) |
| Active | Settled | settle_match | authority signer; now <= activated_at + 3600; not paused | Only authority |
| Active | Cancelled | cancel_match | caller is player; now > activated_at + 86400; not paused | Only registered player |
| Active | Cancelled | permissionless_reclaim | now > activated_at + 172800 | Yes (anyone, after 48h) |
| Settled | -- | none | -- | No (terminal, account closed) |
| Cancelled | -- | none | -- | No (terminal, account closed) |

### Account Lifecycle Map

**GlobalConfig:**
- Creation: `initialize_config` (one-time, PDA with `init` constraint)
- Modifications: `update_config`, `pause_program`, `unpause_program`
- Closure: Never
- Can it be reopened? N/A (never closed)

**MatchEscrow:**
- Creation: `create_match` (PDA with `init` constraint, seeds = `[b"match", match_id.as_bytes()]`)
- Modifications: `deposit_wager` (deposit flags, state, activated_at)
- Closure: `settle_match` (close = authority), `cancel_match` (close = caller), `permissionless_reclaim` (close = caller)
- Can it be reopened? Theoretically yes in the same transaction (after close, `init` for same PDA seeds could succeed). Not exploitable because new escrow starts fresh with no deposits.

### Invariant Registry

| # | Invariant | Where Enforced | Verification |
|---|-----------|----------------|--------------|
| INV-1 | Only Active matches can be settled | `settle_match` line 229-232 | `require!(state == Active)` |
| INV-2 | Only non-terminal matches can be cancelled/reclaimed | `cancel_match` lines 346-349; `permissionless_reclaim` lines 390-394 | `require!(state != Settled && state != Cancelled)` |
| INV-3 | activated_at > 0 implies state was Active (or terminal after Active) | `deposit_wager` lines 207-209 | Set atomically in same instruction |
| INV-4 | Both players must deposit before Active transition | `deposit_wager` line 206 | `if p1_deposited && p2_deposited` |
| INV-5 | Escrow lamport balance >= sum of deposited wagers (pre-settlement) | `deposit_wager` CPI transfer; state-before-transfer pattern | System program transfer CPI; terminal state set before any lamport deduction |
| INV-6 | Fee splits sum to total pot | `settle_match` lines 253-274 | `winner = total_pot - treasury - ops` (remainder strategy) |
| INV-7 | Config addresses are distinct at initialization | `initialize_config` lines 53-55 | Three `require!` checks |
| INV-8 | Authority cannot be a player in any match | `create_match` lines 128-129 | `require!(p1 != authority); require!(p2 != authority)` |

## Dependencies

- **anchor_lang::prelude** -- Anchor framework types, macros, error handling
- **anchor_lang::system_program** -- System program CPI for SOL transfers
- **Clock sysvar** -- `Clock::get()?.unix_timestamp` for all timing logic (no account needed)
- No SPL Token dependency (pure SOL/lamport program)
- No oracle dependency
- No external program CPIs (only system_program)

## Focus-Specific Analysis

### State Diagram
See "State Diagram" section above.

### Transition Matrix
See "Transition Matrix" section above.

### Account Lifecycle Map
See "Account Lifecycle Map" section above.

### Invariant Registry
See "Invariant Registry" section above.

## Cross-Focus Intersections

| This Focus (State Machine) | Intersects With |
|---|---|
| Terminal state enforcement | **Access Control** -- who can trigger each transition |
| Pause mechanism | **Access Control** -- authority controls pause toggle |
| Settlement deadline | **Timing** -- 1h/24h/48h hierarchy; Clock sysvar accuracy |
| State-before-transfer (OC-10) | **Error Handling** -- Solana atomicity makes this defense-in-depth |
| Deposit CPI | **CPI** -- system_program::transfer is the only CPI |
| Fee distribution | **Token/Economic** -- BPS calculations, remainder strategy |
| update_config validation gap | **Access Control** -- authority can break config |

## Cross-Reference Handoffs

- **-> Access Control Agent:** The `update_config` instruction (lines 70-89) does not re-validate address distinctness after initial config. Authority can set `treasury == ops` (blocks settlements) or `authority` to an uncontrolled key (permanent lockout). This is the most significant state machine risk with access control implications. Also: one-step authority transfer pattern (no two-step, no timelock) at line 79.

- **-> Timing Agent:** The three-tier deadline system (1h settlement, 24h cancel, 48h permissionless) creates a 23-hour dead zone (hours 1-24 after activation) where no actor can process an Active match. Evaluate whether this dead zone is acceptable given typical match durations and server reliability. Also: `Clock::get()` is used at lines 140, 209, 241, 333, 409 -- confirm timestamp variance is tolerable for all windows.

- **-> Token/Economic Agent:** Fee calculation at lines 253-274 uses u128 widening and remainder strategy. Verify: (1) remainder strategy always gives winner >= 90% of pot at all wager levels, (2) treasury and ops amounts are >= 1 lamport at minimum wager (10,000 lamports -> pot 20,000 -> treasury = 1,400 lamports, ops = 600 lamports -- both > 0, confirmed safe), (3) no dust loss (winner gets exact remainder).

- **-> Error Handling Agent:** All `checked_*` arithmetic returns `EscrowError::ArithmeticOverflow` via `ok_or`. The `try_borrow_mut_lamports()` calls at lines 284-291, 359-366, 421-428 use `?` to propagate. Verify no silent failures in lamport manipulation. Also: confirm that Anchor's `close` constraint properly handles the case where escrow lamports are already fully drained by prior transfers in the same instruction.

## Risk Observations

1. **23-Hour Dead Zone (MEDIUM):** Between settlement deadline expiry (1 hour post-activation) and player cancellation timeout (24 hours post-activation), an Active match has no valid transition. No actor can settle, cancel, or reclaim. Players' funds are locked with no action available. This is a deliberate design trade-off (prevents authority from canceling to deny winners) but creates extended fund lockup if the server fails.

2. **update_config Lacks Re-Validation (MEDIUM):** The `update_config` instruction at line 70 allows changing authority, treasury, and ops without checking distinctness. Setting `treasury == ops` makes all settlements impossible (the `DuplicateFeeAccount` constraint at line 588 in `SettleMatch` would always fail). This forces all matches to the cancel/reclaim path. Setting `authority` to an uncontrolled key causes permanent lockout. This is a liveness risk, not a fund-theft risk, because cancel_match and permissionless_reclaim still function for refunds.

3. **One-Step Authority Transfer (MEDIUM):** Authority transfer at line 79 (`config.authority = a`) takes immediate effect with no confirmation step. A typo in the new authority address causes permanent lockout. The secure pattern (SP-017) is a two-step propose/accept flow. The code comment at line 69 notes "v1.2 -- separate multisig" suggesting future plans.

4. **Pause Delays Refunds Up to 48h (LOW):** During a pause, `cancel_match` is blocked but `permissionless_reclaim` is not. A malicious or compromised authority can pause the program and delay all refunds by up to 48 hours (until permissionless_reclaim becomes available). Cannot steal funds -- only delay refunds.

5. **Same-TX PDA Revival (LOW):** After any terminal transition closes a MatchEscrow PDA, the same `match_id` could theoretically be used to create a new escrow in a subsequent instruction within the same transaction. The new escrow starts fresh (no deposits, AwaitingDeposits state) so this is not financially exploitable. It means match_ids can be reused, which could confuse off-chain indexers or clients tracking by match_id.

6. **Lamport Transfer to Unchecked Accounts (LOW):** `settle_match` transfers lamports to `winner`, `treasury`, and `ops`, which are `UncheckedAccount` types. These are validated by Anchor constraints against stored pubkeys (lines 576-597). However, if the winner/treasury/ops account is a program account (executable), the write would fail at runtime (Solana prevents lamport modifications to executable accounts). The constraints don't check `!executable`. In practice, wallets are never executable, but this is an edge case worth noting.

## Novel Attack Surface Observations

1. **Config Poisoning for Settlement Denial:** This codebase uniquely separates config management from match lifecycle. An authority with `update_config` access can make `treasury == ops`, which permanently blocks the `SettleMatch` instruction's `DuplicateFeeAccount` constraint. All existing Active matches become unsettleable, forcing them through the 24h cancel or 48h reclaim path. This is novel because: (a) the config validation gap only exists in `update_config`, not `initialize_config`; (b) the impact is silent -- no immediate error, only future settlements fail; (c) combined with a pause, it could lock funds for up to 48 hours with no settlement possible. The attacker doesn't steal funds but causes maximum disruption. **Mitigation:** Add distinctness checks to `update_config`, or use a separate "pending config" pattern requiring two-step confirmation.

2. **Authority Winner Selection as Implicit Trust:** The `settle_match` instruction accepts a `winner: Pubkey` parameter from the authority. The on-chain constraint only verifies the winner is one of the two players. There is no on-chain verification of gameplay outcomes. This means the authority has absolute power to choose the winner of any match. While this is inherent to the server-authoritative design, it creates a unique attack surface where a compromised server key could systematically settle all matches in favor of a colluding player. The economic incentive for this attack scales with wager amounts (up to 100 SOL per match). **This is not a code bug** but a fundamental trust assumption that should be explicitly documented for users.

## Questions for Other Focus Areas

- **For Access Control focus:** Is the `has_one = authority` constraint on `SettleMatch` (line 565) checking against `escrow.authority` or `config.authority`? The account struct has both `escrow` and `config` with `authority` fields. If it checks `escrow.authority` (set at match creation, line 133), then changing the authority via `update_config` mid-match would not affect settlement of existing matches. Verify which `authority` the `has_one` resolves to.

- **For Arithmetic focus:** The `total_pot_128 as u64` cast at line 267 narrows from u128 to u64. Given MAX_WAGER_LAMPORTS = 100e9, total_pot = 200e9, which fits in u64 (max ~18.4e18). But is there a `try_from` check? The cast uses `as u64` which truncates silently. Verify this is safe at all wager levels.

- **For Timing focus:** The `created_at` fallback in timeout calculations (lines 322-326, 397-401) is described as "backward compat with matches created pre-OC-07." Under what circumstances would `activated_at == 0` for a match that is being cancelled or reclaimed? Only if the match is still in AwaitingDeposits (never activated). Is the fallback to `created_at` appropriate for this case?

- **For CPI focus:** The system_program::transfer CPI in `deposit_wager` (lines 179-188) transfers SOL from the player to the escrow PDA. Anchor validates the system program via `Program<'info, System>`. Is there any scenario where the transfer could partially succeed (e.g., player has just barely enough SOL but transaction fees tip them under)?

## Raw Notes

### All State Reads/Writes by Instruction

**create_match:**
- WRITES: escrow.match_id, escrow.authority, escrow.player_one, escrow.player_two, escrow.wager_lamports, escrow.player_one_deposited=false, escrow.player_two_deposited=false, escrow.state=AwaitingDeposits, escrow.created_at, escrow.activated_at=0, escrow.bump
- READS: config.is_paused, authority.key()

**deposit_wager:**
- READS: escrow.state, escrow.player_one, escrow.player_two, escrow.player_one_deposited, escrow.player_two_deposited, escrow.wager_lamports, escrow.match_id, config.is_paused
- WRITES: escrow.player_one_deposited or escrow.player_two_deposited, escrow.state (conditionally), escrow.activated_at (conditionally)

**settle_match:**
- READS: escrow.state, escrow.activated_at, escrow.wager_lamports, escrow.match_id, config.is_paused, config.authority, config.treasury, config.ops
- WRITES: escrow.state=Settled
- TRANSFERS: escrow -> winner, escrow -> treasury, escrow -> ops
- CLOSES: escrow (to authority)

**cancel_match:**
- READS: escrow.state, escrow.player_one_deposited, escrow.player_two_deposited, escrow.wager_lamports, escrow.match_id, escrow.activated_at, escrow.created_at, escrow.player_one, escrow.player_two, config.authority, config.is_paused
- WRITES: escrow.state=Cancelled
- TRANSFERS: escrow -> player_one (conditional), escrow -> player_two (conditional)
- CLOSES: escrow (to caller)

**permissionless_reclaim:**
- READS: escrow.player_one_deposited, escrow.player_two_deposited, escrow.wager_lamports, escrow.match_id, escrow.state, escrow.activated_at, escrow.created_at
- WRITES: escrow.state=Cancelled
- TRANSFERS: escrow -> player_one (conditional), escrow -> player_two (conditional)
- CLOSES: escrow (to caller)

### OC-10 Pattern Verification

All three fund-moving instructions set terminal state before transfers:

| Instruction | State Set (line) | First Transfer (line) | Pattern Correct? |
|---|---|---|---|
| settle_match | 279 (Settled) | 284 (winner) | Yes |
| cancel_match | 354 (Cancelled) | 359 (player_one) | Yes |
| permissionless_reclaim | 416 (Cancelled) | 421 (player_one) | Yes |

### Error Code Coverage

Every error code is reachable from at least one instruction:

| Error | Used In | Reachable? |
|---|---|---|
| MatchIdTooLong | create_match:117 | Yes |
| ZeroWager | (UNUSED -- superseded by WagerTooSmall) | Dead code |
| SamePlayer | create_match:125 | Yes |
| InvalidState | deposit_wager:164, settle_match:231, cancel_match:348, permissionless_reclaim:393 | Yes |
| NotAPlayer | deposit_wager:170 | Yes |
| AlreadyDeposited | deposit_wager:173,175 | Yes |
| InvalidWinner | SettleMatch constraint:579 | Yes |
| Unauthorized | UpdateConfig:470, PauseProgram:485, UnpauseProgram:500, cancel_match:343 | Yes |
| InvalidPlayer | CancelMatch:629,636, PermissionlessReclaim:669,676 | Yes |
| AuthorityAsPlayer | create_match:128,129 | Yes |
| WagerTooSmall | create_match:120 | Yes |
| WagerTooLarge | create_match:123 | Yes |
| InvalidTreasury | SettleMatch:587 | Yes |
| InvalidOps | SettleMatch:596 | Yes |
| DuplicateFeeAccount | initialize_config:55, SettleMatch:588 | Yes |
| ProgramPaused | CreateMatch:527, DepositWager:551, SettleMatch:605, CancelMatch:644 | Yes |
| ArithmeticOverflow | deposit_wager:214, settle_match:239,255,259,264,272,273, cancel_match:331, permissionless_reclaim:406 | Yes |
| InvalidConfig | initialize_config:53,54 | Yes |
| SettlementExpired | settle_match:242 | Yes |
| TooEarlyToReclaim | permissionless_reclaim:410 | Yes |

**Note:** `ZeroWager` (line 817) is dead code. It was superseded by `WagerTooSmall` (OC-08) which uses MIN_WAGER_LAMPORTS = 10,000 instead of 0. The error code remains in the enum but is never referenced. This is harmless but should be cleaned up to avoid confusion.
