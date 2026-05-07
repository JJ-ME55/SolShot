# CPI & External Calls Analysis

<!-- CONDENSED_SUMMARY_START -->

## Condensed Summary

### Scope
Single-file Anchor program: `programs/solshot-escrow/src/lib.rs` (855 LOC). Seven instruction handlers, two state structs, one enum. SOL-only escrow (no SPL tokens).

### CPI Inventory (Complete)
1. **`system_program::transfer` CPI** (line 179-188, `deposit_wager`): The ONLY cross-program invocation in the entire program. Transfers SOL from player to escrow PDA via System Program. Target is validated via `Program<'info, System>` (Anchor enforces program ID). No PDA signer seeds required (player is the signer).
2. **Direct lamport manipulation** (lines 284-291, 359-366, 421-428): NOT CPI. Used in `settle_match`, `cancel_match`, `permissionless_reclaim`. The program-owned escrow PDA's lamports are directly debited/credited. This is a native Solana operation that does not invoke any external program.
3. **`Clock::get()`** (lines 140, 209, 241, 333, 409): Sysvar access via syscall. Not a CPI. No account injection risk (uses `Clock::get()`, not an account-based sysvar).

### Key Findings
- **CPI surface is minimal.** One CPI call total, targeting the System Program with Anchor type-safety.
- **No `invoke()` or `invoke_signed()` raw calls.** All CPI uses Anchor's `CpiContext::new()` wrapper.
- **No `remaining_accounts` usage.** Zero dynamic account passing.
- **No CPI return data consumption.** No `get_return_data()` calls.
- **No Token Program CPI.** All value transfer is in native SOL lamports.
- **Direct lamport transfers carry a nuance:** transfers to `UncheckedAccount` recipients (winner, treasury, ops, player_one, player_two) could fail silently if those accounts are on the reserved account list or are executable. This is mitigated by the fact that all recipients are wallet addresses validated against stored pubkeys, but no explicit executable/reserved check exists.

### Invariants
1. The only CPI target is the System Program, validated by `Program<'info, System>` at line 460/531/555/609/648/680.
2. No PDA signer seeds are exposed to any external program (the single CPI does not use `invoke_signed`).
3. All lamport transfers from the escrow PDA occur AFTER state is set to terminal (Settled/Cancelled), per OC-10.
4. Every `UncheckedAccount` that receives lamports has a constraint tying it to a known pubkey (escrow.player_one, escrow.player_two, config.treasury, config.ops, or the winner constraint).

### Risks
1. **OBSERVATION (CPI-R01):** Direct lamport manipulation to `UncheckedAccount` recipients does not check if the recipient is executable or on the reserved account list. If config.treasury or config.ops were set to a program address (executable), the lamport credit would silently fail (the `+=` on lamports succeeds in the instruction's memory view but the runtime may discard the write). Likelihood: LOW (requires admin misconfiguration via `update_config`). Impact: Fees silently lost.
2. **OBSERVATION (CPI-R02):** The `settle_match` instruction performs three sequential lamport transfers (winner, treasury, ops). If any `try_borrow_mut_lamports()` call fails (returns Err), the `?` operator propagates the error and the transaction reverts atomically. The state was already set to `Settled` (line 279), but since the entire TX reverts on error, the state revert is correct. No partial-transfer risk exists due to Solana's transaction atomicity.
3. **OBSERVATION (CPI-R03):** The `permissionless_reclaim` instruction has no `config` account (by design, as an escape hatch). This means it does NOT check `is_paused`. A paused program can still have matches reclaimed after 48h. This is intentional (DCA-02) but worth noting: even during an emergency pause, funds continue flowing out via this path.

### Cross-Focus Handoffs
- **--> Access Control Agent:** The `update_config` instruction can set treasury/ops to any Pubkey, including executable accounts. Verify that treasury/ops validation occurs at settlement time (it does, via constraint matching config), but the config itself has no validation that treasury/ops are non-executable wallets.
- **--> Arithmetic Agent:** The BPS fee calculation at lines 253-265 feeds directly into lamport transfer amounts. Verify the `as u64` narrowing cast from u128 is safe for all wager values in [10_000, 100_000_000_000].
- **--> Token/Economic Agent:** All three lamport transfer sites (settle, cancel, reclaim) should be verified for economic correctness: total outflows must not exceed total inflows (2 * wager_lamports).
- **--> State Machine Agent:** The OC-10 pattern (state-before-transfer) is the primary reentrancy defense. Verify that no instruction can be composed in the same transaction to exploit the window between state write and lamport transfer.
- **--> Error Handling Agent:** All `try_borrow_mut_lamports()` calls use `?` propagation. Verify no error path leads to partial lamport movement.

<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

The SolShot escrow program has an exceptionally narrow CPI surface. There is exactly one cross-program invocation in the entire 855-line program: a `system_program::transfer` call in the `deposit_wager` instruction that moves SOL from the player's wallet to the escrow PDA. This CPI is constructed using Anchor's type-safe `CpiContext::new()` and targets the System Program, which is validated via the `Program<'info, System>` account type in every instruction context that includes it.

All other value movement (settlement payouts, cancellation refunds, permissionless reclaims) uses direct lamport manipulation via `try_borrow_mut_lamports()`. This is not CPI -- it is the program directly modifying lamport balances of accounts it owns (the escrow PDA) and accounts passed into the instruction. This approach avoids all CPI-related attack vectors (arbitrary program substitution, signer privilege escalation, return data spoofing, CPI depth limits) but introduces its own considerations around the Solana runtime's handling of writable accounts.

The program does not use `invoke()`, `invoke_signed()`, `remaining_accounts`, `get_return_data()`, or any Token Program CPI. It does not interact with any oracle, AMM, governance, or third-party program. The external data dependency is limited to `Clock::get()` for timestamp access, which uses the syscall-based approach (not account-based), eliminating sysvar injection risk (EP-006).

## Scope

- **Files analyzed:** `programs/solshot-escrow/src/lib.rs` (855 lines)
- **Functions analyzed:** `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim` (9 instruction handlers)
- **Account structs analyzed:** `InitializeConfig`, `UpdateConfig`, `PauseProgram`, `UnpauseProgram`, `CreateMatch`, `DepositWager`, `SettleMatch`, `CancelMatch`, `PermissionlessReclaim` (9 structs)
- **Estimated coverage:** 100% of CPI and external call surface in the on-chain program

## Key Mechanisms

### Mechanism 1: System Program Transfer CPI (deposit_wager)

**Location:** `lib.rs:179-188`

**Purpose:**
Transfer SOL lamports from a player's wallet into the escrow PDA account during the deposit phase.

**How it works:**
1. Line 160: Read `wager_lamports` from escrow state (immutable borrow, before mutable borrow)
2. Line 179: Construct `CpiContext::new()` with:
   - `program`: `ctx.accounts.system_program.to_account_info()` -- the System Program
   - `accounts`: `system_program::Transfer { from: player, to: escrow }`
3. Line 187: Call `system_program::transfer(cpi_ctx, wager)` with the pre-read wager amount
4. Line 188: `?` propagates any CPI error (insufficient balance, account issues)
5. Lines 191-197: After CPI completes, take mutable borrow of escrow to update deposit flags

**Assumptions:**
- The System Program at `11111111111111111111111111111111` is the legitimate system program. This is enforced by Anchor's `Program<'info, System>` type at line 555.
- The player has sufficient lamports to cover `wager_lamports`. If not, the System Program CPI returns an error which propagates via `?`.
- The player is a `Signer<'info>` (line 545), authorizing the transfer from their account.
- The escrow PDA can receive arbitrary lamports (no upper bound check on PDA balance, which is fine -- PDAs can hold any amount).

**Invariants:**
- Post-CPI: escrow PDA lamport balance increased by exactly `wager_lamports`
- Post-CPI: player lamport balance decreased by exactly `wager_lamports`
- The CPI target program ID is the System Program (Anchor enforces this)

**Concerns:**
- None identified. This is the canonical safe pattern for SOL transfers on Solana: `CpiContext::new` + `Program<'info, System>` + `Signer<'info>` on the source account.

### Mechanism 2: Direct Lamport Transfers (settle_match)

**Location:** `lib.rs:284-291`

**Purpose:**
Distribute the escrow pot to the winner, treasury, and ops accounts after a match concludes.

**How it works:**
1. Lines 277-280: Set escrow state to `Settled` (OC-10 defense-in-depth, before any transfers)
2. Lines 284-285: Debit `winner_amount` from escrow, credit to winner account
3. Lines 287-288: Debit `treasury_amount` from escrow, credit to treasury account
4. Lines 290-291: Debit `ops_amount` from escrow, credit to ops account
5. After instruction completes, Anchor's `close = authority` on the escrow account reclaims remaining rent lamports to the authority.

**Assumptions:**
- The escrow PDA has sufficient lamports to cover all three transfers plus rent. This holds because the PDA received exactly `2 * wager_lamports` from deposits, and `winner_amount + treasury_amount + ops_amount = 2 * wager_lamports` (the remainder strategy at line 270-274 guarantees this).
- `try_borrow_mut_lamports()` succeeds for all six account borrows. This could fail if any account is already borrowed elsewhere, but within a single instruction execution, Anchor ensures no overlapping borrows.
- The winner, treasury, and ops accounts are writable (`mut` constraint). Anchor enforces this at the account struct level.
- The recipient accounts can receive lamports. This is where the reserved account list / executable account nuance applies (see Risk CPI-R01 below).

**Invariants:**
- Total lamports debited from escrow = winner_amount + treasury_amount + ops_amount = total_pot (2 * wager_lamports)
- No lamports are created or destroyed (conservation)
- State is `Settled` before any lamport movement (OC-10)

**Concerns:**
- Lines 284-291: Each `try_borrow_mut_lamports()?` uses `?` for error propagation. If the first transfer (to winner) succeeds but the second (to treasury) fails, the entire transaction reverts atomically due to Solana's transaction model. The escrow state revert from `Settled` back to `Active` happens as part of the atomic rollback. This is safe.
- No explicit check that recipient accounts are not executable or on the reserved account list. See Risk CPI-R01.

### Mechanism 3: Direct Lamport Transfers (cancel_match)

**Location:** `lib.rs:358-366`

**Purpose:**
Refund deposited wagers to players when a match is cancelled.

**How it works:**
1. Lines 352-355: Set escrow state to `Cancelled` (OC-10)
2. Lines 358-360: If player_one deposited, debit `wager_lamports` from escrow, credit to player_one
3. Lines 364-366: If player_two deposited, debit `wager_lamports` from escrow, credit to player_two
4. Anchor's `close = caller` reclaims rent to the caller.

**Assumptions:**
- If both players deposited, escrow holds `2 * wager_lamports` (plus rent). Both refunds total `2 * wager_lamports`, leaving rent for the `close` mechanism.
- If only one player deposited, escrow holds `wager_lamports` (plus rent). One refund of `wager_lamports`, leaving rent for `close`.
- If neither deposited, no refunds occur. Rent is reclaimed via `close`.

**Invariants:**
- Each player receives back exactly what they deposited (no more, no less)
- State is `Cancelled` before any lamport movement
- Player accounts are validated via constraints: `player_one.key() == escrow.player_one` (line 629), `player_two.key() == escrow.player_two` (line 636)

**Concerns:**
- Same reserved account / executable account concern as Mechanism 2. Player wallet addresses are unlikely to be executable, but no explicit check exists.

### Mechanism 4: Direct Lamport Transfers (permissionless_reclaim)

**Location:** `lib.rs:420-428`

**Purpose:**
Emergency refund path callable by anyone after 48 hours. Identical refund logic to `cancel_match`.

**How it works:**
1. Lines 414-417: Set escrow state to `Cancelled` (OC-10)
2. Lines 420-422: If player_one deposited, refund `wager_lamports` to player_one
3. Lines 426-428: If player_two deposited, refund `wager_lamports` to player_two
4. Anchor's `close = caller` reclaims rent to the caller (incentive for permissionless callers)

**Assumptions:**
- Same as Mechanism 3
- No config account is required (intentional: this is an escape hatch that works even if config is corrupted or authority is lost)
- No pause guard exists (intentional: DCA-02 design, funds must be recoverable even during emergency pause)

**Invariants:**
- Same as Mechanism 3
- Callable by ANY signer after 48 hours (no authority or player check)

**Concerns:**
- The caller receives PDA rent as an incentive. This is by design but means a griefing vector exists: anyone can close expired escrows and collect the rent. This is acceptable behavior (it's the intended incentive mechanism).

### Mechanism 5: Clock Sysvar Access

**Location:** `lib.rs:140, 209, 241, 333, 409`

**Purpose:**
Obtain current unix timestamp for recording creation/activation times and enforcing deadlines.

**How it works:**
- All five call sites use `Clock::get()?.unix_timestamp`
- This is a syscall, not an account-based sysvar read
- No `AccountInfo` for the Clock sysvar is passed in any instruction context

**Assumptions:**
- `Clock::get()` returns the actual runtime Clock sysvar. Since this uses the syscall approach (not an account), there is no injection risk (EP-006 does not apply).
- Timestamps have ~1-2 second variance from real wall-clock time. For the program's timeout windows (1h, 24h, 48h), this variance is negligible.
- Validators can influence timestamps within approximately 30 seconds (per EP-089). This is insufficient to meaningfully affect any deadline in this program.

**Invariants:**
- `Clock::get()?.unix_timestamp` is monotonically non-decreasing within a single transaction
- Timestamps are `i64` (signed), accommodating all reasonable unix timestamps

**Concerns:**
- None. The syscall approach is the recommended secure pattern per EP-006.

## Trust Model

| Entity | Trust Level | Rationale |
|--------|-------------|-----------|
| System Program (`11111111111111111111111111111111`) | FULL | Hardcoded by Solana runtime. Anchor `Program<'info, System>` validates program ID. |
| Clock Sysvar (via `Clock::get()`) | FULL | Syscall-based access, cannot be spoofed. Minor timestamp variance is acceptable for hour/day-scale deadlines. |
| Escrow PDA | FULL (self-owned) | Program-owned account. Only this program can modify its data. Lamport manipulation is authorized because the program owns the PDA. |
| Winner/Treasury/Ops accounts | LIMITED | `UncheckedAccount` types. Key identity validated via constraints against stored pubkeys. No owner/executable validation. |
| Player accounts (cancel/reclaim) | LIMITED | `UncheckedAccount` types. Key identity validated against escrow.player_one/player_two. |
| Authority (server keypair) | TRUST BOUNDARY | External signer. The program trusts that settlement decisions (winner selection) from the authority are correct. No on-chain game logic verifies the winner claim. |

## State Analysis

### State Read by CPI/External Calls
- `escrow.wager_lamports` (line 160): Read before CPI to determine transfer amount
- `escrow.match_id` (line 161): Read before CPI for event emission (not used in CPI itself)
- `escrow.player_one_deposited` / `player_two_deposited` (lines 316-317, 383-384): Read before direct transfers in cancel/reclaim to determine which refunds to issue

### State Written After CPI/External Calls
- `escrow.player_one_deposited` / `player_two_deposited` (lines 193-197): Set to `true` after System Program transfer CPI in `deposit_wager`
- `escrow.state` (line 207): Transitions to `Active` after both deposits
- `escrow.activated_at` (line 209): Set to current timestamp after `Active` transition

### State Written Before Lamport Transfers
- `escrow.state = MatchState::Settled` (line 279): Before settlement transfers
- `escrow.state = MatchState::Cancelled` (lines 354, 416): Before cancel/reclaim transfers

## Dependencies

### External Programs Invoked
1. **System Program** (`11111111111111111111111111111111`): Used for SOL transfer in `deposit_wager`. Validated via `Program<'info, System>`.

### External Programs NOT Invoked
- SPL Token Program (not used; SOL-only)
- SPL Token-2022 (not used)
- Pyth / Switchboard (no oracles)
- Any governance program
- Any custom program

### Anchor Framework Dependencies
- `anchor_lang::prelude::*` (line 4): Provides `Account`, `Signer`, `Program`, `UncheckedAccount`, `CpiContext`, constraints, error handling
- `anchor_lang::system_program` (line 5): Provides `system_program::transfer` CPI wrapper and `system_program::Transfer` accounts struct

### Sysvar Dependencies
- `Clock` sysvar via `Clock::get()` syscall (5 call sites)

## Focus-Specific Analysis

### CPI Call Map

| Location | Target Program | Method | Call Type | Program ID Validated? | PDA Seeds (if signed) |
|----------|---------------|--------|-----------|----------------------|----------------------|
| `lib.rs:179-188` | System Program | `transfer` | `CpiContext::new()` | YES -- `Program<'info, System>` at line 555 | N/A (player signs, not PDA) |

### Privilege Flow Analysis

**deposit_wager CPI (line 179-188):**
- **Accounts passed to System Program:**
  - `from`: player (`Signer<'info>`, `mut`) -- player authorizes debit from their own wallet
  - `to`: escrow PDA (`Account<'info, MatchEscrow>`, `mut`) -- receives lamports
- **What can the System Program do with these accounts?**
  - Transfer lamports from `from` to `to` (this is the intended behavior)
  - The System Program cannot modify account data, only lamport balances
  - The System Program requires `from` to be a signer for debits
- **Are any accounts mutable that shouldn't be?**
  - Both accounts are correctly mutable (source debited, destination credited)
  - No unnecessary accounts are passed to the CPI

**Assessment:** The privilege flow is minimal and correct. The player's signer privilege authorizes only the SOL transfer. No PDA signer seeds are exposed. The System Program cannot be exploited to perform unintended operations.

### Return Data Analysis

No CPI in this program uses `get_return_data()`. The single CPI (`system_program::transfer`) does not return data. This eliminates EP-045 (CPI return data spoofing) entirely.

### remaining_accounts Audit

No instruction context in this program uses `ctx.remaining_accounts`. This eliminates EP-014 (ALT account substitution), EP-050 (CPI account injection), and EP-108 (remaining_accounts arbitrary CPI) entirely.

### UncheckedAccount Analysis for CPI/Transfer Recipients

| Account | Location | `/// CHECK:` Comment | Constraint | Receives Lamports? | Risk Assessment |
|---------|----------|---------------------|------------|-------------------|-----------------|
| `winner` | line 581 | "Constrained to escrow.player_one or escrow.player_two" | `winner.key() == escrow.player_one \|\| winner.key() == escrow.player_two` | YES (winner_amount, line 285) | Key validated. No executable/reserved check. |
| `treasury` | line 590 | "Constrained to config.treasury; uniqueness check vs ops" | `treasury.key() == config.treasury`, `treasury.key() != ops.key()` | YES (treasury_amount, line 288) | Key validated against config PDA. No executable check. |
| `ops` | line 598 | "Constrained to config.ops" | `ops.key() == config.ops` | YES (ops_amount, line 291) | Key validated against config PDA. No executable check. |
| `player_one` (CancelMatch) | line 631 | "Must match escrow.player_one" | `player_one.key() == escrow.player_one` | YES (wager refund, line 360) | Key validated. |
| `player_two` (CancelMatch) | line 638 | "Must match escrow.player_two" | `player_two.key() == escrow.player_two` | YES (wager refund, line 366) | Key validated. |
| `player_one` (Reclaim) | line 671 | "Must match escrow.player_one for refund routing" | `player_one.key() == escrow.player_one` | YES (wager refund, line 422) | Key validated. |
| `player_two` (Reclaim) | line 678 | "Must match escrow.player_two for refund routing" | `player_two.key() == escrow.player_two` | YES (wager refund, line 428) | Key validated. |

**Summary:** All `UncheckedAccount` recipients have key identity validated via Anchor constraints. Every `/// CHECK:` comment accurately describes the constraint in place. The remaining concern is the lack of executable/reserved checks on recipient accounts.

## Cross-Focus Intersections

### CPI x Access Control
- The single CPI in `deposit_wager` uses the player's signer authority. The player signs the transaction, authorizing the System Program to debit their wallet. No authority keys or PDA seeds are passed to any external program.
- The `settle_match` direct lamport transfers are authorized by the program owning the escrow PDA, not by CPI signer seeds. The authority signer at line 571 is used for Anchor's `has_one` validation and `close` target, not for CPI.

### CPI x State Machine
- The Checks-Effects-Interactions pattern (CEI, EP-033) is followed: `deposit_wager` performs the CPI (Interaction) and then updates deposit flags and state (Effects). However, this is technically Effects-after-Interaction. The mitigating factor is that the state check (AwaitingDeposits) and the deposit flag check (not already deposited) occur before the CPI, and Solana's runtime prevents reentrancy within a single CPI chain.
- For settlement and cancellation, the OC-10 pattern inverts this: state is set to terminal BEFORE lamport transfers. This is the ideal pattern for direct lamport manipulation.

### CPI x Arithmetic
- The wager amount used in the System Program CPI (line 187) is read directly from `escrow.wager_lamports`, which was validated at creation time (MIN_WAGER_LAMPORTS <= wager <= MAX_WAGER_LAMPORTS). No arithmetic is performed on the CPI amount.
- The settlement amounts (winner, treasury, ops) are calculated using u128 intermediate arithmetic before being used in direct lamport transfers. The `as u64` narrowing at lines 260, 265, 267 should be verified by the Arithmetic agent.

### CPI x Token/Economic
- No SPL Token CPI exists. All value transfer is in native SOL. This eliminates an entire class of CPI-related vulnerabilities (EP-049 unverified token program, EP-054/055 Token-2022 issues, EP-051 token account owner mismatch).

## Cross-Reference Handoffs

- **--> Access Control Agent:** `update_config` (line 70-88) allows the authority to set treasury and ops to any Pubkey without validation that the target is a wallet (non-executable, non-program). If treasury or ops were set to an executable program address, lamport credits via `try_borrow_mut_lamports()` may silently fail or behave unexpectedly due to the runtime's executable account write restriction. Investigate whether `update_config` should validate that new treasury/ops addresses are not executable accounts.

- **--> Arithmetic Agent:** The `as u64` narrowing casts at lines 260, 265, and 267 in `settle_match` convert u128 BPS calculation results to u64. Verify that for the maximum wager (100 SOL = 100,000,000,000 lamports), the intermediate u128 values and final u64 values are correct and no truncation occurs. Specifically: `200_000_000_000u128 * 700 / 10_000 = 14_000_000_000` which fits in u64. `200_000_000_000u128` itself fits in u64. The total_pot `as u64` cast at line 267 is safe because `200_000_000_000 < u64::MAX`.

- **--> State Machine Agent:** In `deposit_wager`, the CPI transfer (lines 179-188) occurs BEFORE the mutable borrow that updates deposit flags and state (lines 191-207). This means the escrow has received the lamports but state has not been updated. If a same-transaction attack could read the escrow between CPI completion and state update, it would see stale flags. However, Solana's runtime prevents this: account data changes within a single instruction are atomic, and re-entering the program via CPI during the same instruction is blocked by the runtime. Confirm this assumption holds for all code paths.

- **--> Error Handling Agent:** All six `try_borrow_mut_lamports()` debit operations (lines 284, 287, 290, 359, 365, 421, 427) use `?` to propagate errors. If any of these fails, the transaction reverts atomically. Verify that no error condition in the borrow/debit path could produce a partial state update that persists (it should not, given Solana's atomicity, but confirm).

- **--> Token/Economic Agent:** Verify that in all three settlement/refund paths, the total lamports leaving the escrow PDA exactly equals the total lamports that entered. For `settle_match`: `winner_amount + treasury_amount + ops_amount` must equal `2 * wager_lamports`. For `cancel_match` and `permissionless_reclaim`: each player gets back exactly `wager_lamports`. The remainder strategy (winner = total - treasury - ops) at lines 270-274 is designed to guarantee this.

## Risk Observations

### CPI-R01: Lamport Credit to UncheckedAccount Without Executable Check
**Lines:** 285, 288, 291, 360, 366, 422, 428
**Observation:** Direct lamport credits via `try_borrow_mut_lamports()` are performed on `UncheckedAccount` types (winner, treasury, ops, player_one, player_two). The Solana runtime silently prevents lamport modifications to executable accounts and accounts on the reserved account list. If any recipient is an executable program account, the lamport credit would be silently discarded (the `+=` appears to succeed in the instruction's memory view, but the runtime does not commit the change). The debit from the escrow PDA, however, DOES take effect, resulting in lost lamports.
**Likelihood:** LOW. Player wallets are external Solana wallets (non-executable). Treasury and ops are set by the server authority via `update_config`. An admin misconfiguration (setting treasury/ops to a program address) would trigger this.
**Why it matters:** If triggered, lamports deducted from the escrow are permanently lost -- they leave the PDA but never arrive at the intended recipient.
**Mitigation in place:** Anchor constraints validate that the passed accounts match stored pubkeys. The `update_config` instruction is authority-gated.
**Verification needed:** Confirm whether `try_borrow_mut_lamports()` on an executable account returns an error (which would cause TX revert) or silently succeeds (which would cause fund loss). The behavior may differ between Solana runtime versions.

### CPI-R02: No Rent-Exemption Check on Escrow PDA After Transfers
**Lines:** 284-291, 359-366, 421-428
**Observation:** After debiting lamports from the escrow PDA, no explicit check ensures the PDA remains rent-exempt. However, since Anchor's `close` constraint is applied to the escrow in `settle_match`, `cancel_match`, and `permissionless_reclaim`, the PDA is zeroed and closed in the same instruction. The remaining lamports (rent) are transferred to the `close` target (authority or caller). Therefore, rent-exemption of the escrow PDA post-transfer is not a concern because the PDA is being closed.
**Assessment:** Non-issue. The close constraint handles rent reclamation.

### CPI-R03: deposit_wager CEI Ordering
**Lines:** 179-188 (CPI), 191-197 (state update)
**Observation:** In `deposit_wager`, the CPI transfer to the escrow PDA (Interaction) occurs BEFORE the state update (Effect). This is technically a CEI violation. However, the mitigating factors are:
1. Solana's runtime prevents re-entering the same program during a CPI chain.
2. The CPI target is the System Program, which does not callback to user programs.
3. The state checks (AwaitingDeposits, not already deposited) are performed before the CPI.
4. Within a single instruction, account data modifications are atomic.
**Assessment:** No practical exploit path exists, but the pattern is worth noting as a deviation from ideal Checks-Effects-Interactions ordering.

### CPI-R04: System Program Trust Assumption
**Lines:** 460, 531, 555, 609, 648, 680
**Observation:** Six instruction contexts include `system_program: Program<'info, System>`. Anchor's `Program<'info, T>` validates that the passed account's key matches the expected program ID for type `T`. For `System`, this is the hardcoded System Program ID. This is the canonical safe pattern. No custom or third-party programs are trusted.
**Assessment:** Secure. No action needed.

## Novel Attack Surface Observations

### Novel-1: Config Update + Settlement Race
The `update_config` instruction can change treasury and ops addresses at any time. If the authority calls `update_config` to change treasury/ops immediately before a `settle_match` transaction lands, the settlement will use the OLD treasury/ops because the config is read at the start of the `settle_match` instruction. This is actually SAFE behavior (the constraints check against the config as it exists when the instruction executes). However, the inverse is concerning: if `update_config` and `settle_match` are in the SAME transaction (two instructions), the first instruction updates config, and the second instruction reads the updated config. An authority could:
1. Call `update_config` setting treasury to their personal wallet
2. Call `settle_match` in the same transaction
3. Receive 7% of pot in their personal wallet instead of the real treasury
4. Call `update_config` again to restore the original treasury

This is not a bug (the authority is already trusted to settle matches honestly), but it illustrates that the authority has unrestricted ability to redirect fees per-settlement. This is a centralization observation, not a CPI vulnerability.

### Novel-2: Permissionless Reclaim + Paused Program Escape
The `permissionless_reclaim` instruction (line 654) intentionally omits the `config` account and therefore has no pause guard. This means that even when the program is paused (emergency), anyone can still trigger refunds after 48h. This is by design (escape hatch), but creates an interesting interaction: if the program is paused due to a discovered vulnerability in the settlement math, an attacker cannot exploit settlement, but escrowed funds will still flow out via reclaim after 48h. The pause effectively creates a 48h window for the authority to either fix the issue or manually cancel matches before the permissionless reclaim kicks in.

## Questions for Other Focus Areas

- **For Access Control:** Does `update_config` validate that new authority/treasury/ops addresses are not the zero address (Pubkey::default())? If authority is set to Pubkey::default(), no signer could ever match it, effectively locking out all authority functions permanently.
- **For Arithmetic:** Is the `PERMISSIONLESS_RECLAIM_TIMEOUT` computation at line 23 (`TIMEOUT_SECONDS * 2`) performed at compile time or runtime? If runtime, is there any risk of overflow on `i64` multiplication? (Answer: it is a compile-time constant evaluation, so this is safe, but should be verified.)
- **For State Machine:** Can the `close` constraint on the escrow PDA in `settle_match` (line 566, `close = authority`) race with the lamport transfers at lines 284-291? Specifically, when does Anchor execute the `close` logic relative to the instruction body? (Answer: Anchor executes `close` in the exit handler after the instruction body returns Ok. So transfers happen first, then close. This is safe.)
- **For Error Handling:** If `Clock::get()` fails (returns Err) at line 140 in `create_match`, the entire instruction reverts. Is there any scenario where the Clock sysvar is unavailable? (This would be a network-level issue, not an attack vector.)
- **For Timing:** The settlement deadline uses `<=` comparison at line 241 (`Clock::get()?.unix_timestamp <= deadline`). Is this correct? A `<=` means the settlement is valid up to and including the exact deadline second. With `<`, the settlement would fail exactly at the deadline. The choice of `<=` is slightly more permissive. Confirm this is intentional.

## Raw Notes

### System Program CPI Construction Detail (lines 179-188)
```rust
system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.player.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
        },
    ),
    wager,
)?;
```
- `CpiContext::new` (not `new_with_signer`): No PDA signer seeds passed. The player is the signer, not a PDA.
- `system_program.to_account_info()`: Provides the program account for the CPI target. Anchor has already validated this is the real System Program.
- The `?` operator ensures the CPI error propagates and the transaction reverts if the transfer fails.

### Direct Lamport Transfer Pattern (settle_match, lines 284-291)
```rust
**ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
**ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;
```
- This is NOT a CPI. It directly modifies the lamport balance fields in the account's `RefCell`.
- The escrow PDA is owned by this program, so the program has authority to debit its lamports.
- The winner/treasury/ops accounts are `UncheckedAccount` with `mut` constraint, so the runtime allows lamport credits.
- The double-dereference `**` is needed because `try_borrow_mut_lamports()` returns `Result<RefMut<&mut u64>>`.

### EP Pattern Cross-Reference

| EP Pattern | Applies? | Assessment |
|-----------|----------|------------|
| EP-042: Arbitrary CPI | NO | Only CPI target is System Program, validated via `Program<'info, System>` |
| EP-043: CPI Signer Privilege Escalation | NO | No `invoke_signed` used. No PDA seeds exposed to CPI targets. |
| EP-044: CPI Privilege Propagation | NO | No CPI chains (depth = 1 max). System Program does not callback. |
| EP-045: CPI Return Data Spoofing | NO | No `get_return_data()` calls. |
| EP-046: Missing CPI Error Propagation | NO | The single CPI uses `?` for error propagation. |
| EP-047: State Update Before CPI | PARTIAL | `deposit_wager` updates state AFTER CPI. See CPI-R03. Mitigated by runtime re-entrancy prevention. |
| EP-048: Missing CPI Guard | NO | No sensitive instructions need CPI protection. All are top-level instruction handlers. |
| EP-049: Unverified Token Program | NO | No Token Program CPI exists. |
| EP-050: CPI Account Injection | NO | No `remaining_accounts` usage. |
| EP-108: remaining_accounts Arbitrary CPI | NO | No `remaining_accounts` in any instruction context. |
| EP-006: Unchecked Sysvar Account | NO | Clock access via `Clock::get()` syscall, not account-based. |
| EP-011: Rent Siphoning | NO | All escrow PDAs are closed (zeroed + rent reclaimed) after transfers. |
| EP-033: CEI Violation | PARTIAL | See CPI-R03. `deposit_wager` transfers before state update. Mitigated by Solana's reentrancy prevention. |
