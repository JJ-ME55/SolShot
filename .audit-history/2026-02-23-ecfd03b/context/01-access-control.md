# Access Control & Account Validation Analysis

<!-- CONDENSED_SUMMARY_START -->

## Condensed Summary

### Scope
- **File:** `programs/solshot-escrow/src/lib.rs` (855 LOC, single-file Anchor program)
- **Instructions analyzed:** 7 (initialize_config, update_config, pause_program, unpause_program, create_match, deposit_wager, settle_match, cancel_match, permissionless_reclaim)
- **Account structs analyzed:** 7
- **Estimated coverage:** 100% of on-chain access control surface

### Key Findings

**1. One-step authority transfer (update_config) -- centralization + lockout risk**
`update_config` (line 70) allows the current authority to instantly set a new authority via `new_authority: Option<Pubkey>`. There is no two-step (propose/accept) pattern. If the authority is set to an incorrect or uncontrolled pubkey, the entire program becomes permanently ungovernable. Additionally, there is no validation that `new_authority != treasury`, `new_authority != ops`, or that the three addresses remain distinct after an update. The distinct-address invariant enforced in `initialize_config` (lines 53-55) is NOT re-enforced in `update_config`.

**2. CreateMatch does not verify authority matches config.authority**
The `CreateMatch` account struct (line 510) requires `authority` as a `Signer<'info>` and uses it as the payer, but it does NOT have `has_one = authority` on the `config` account. The `config` account is only used for the pause guard. This means ANY signer can create a match, not just `config.authority`. The match's `escrow.authority` is then set to whoever called it (line 133). However, `settle_match` requires `has_one = authority` on the escrow (line 565) AND `has_one = authority` on config (line 604). So settlement requires both: (a) the signer who created the match, AND (b) the current `config.authority`. If they differ, settlement is impossible, and funds are stuck until the 24h/48h cancel/reclaim timeouts trigger.

**3. Permissionless reclaim bypasses pause guard by design (DCA-02)**
`PermissionlessReclaim` (line 654) intentionally omits the `config` account and therefore has no pause guard. This is by design as an escape hatch, but it means a paused program still allows permissionless reclaim after 48h. This is noted as a design decision (DCA-02), not a vulnerability.

**4. CancelMatch caller receives PDA rent -- economic incentive misalignment**
The `close = caller` constraint on `CancelMatch` (line 619) means whoever calls cancel receives the PDA rent lamports. This creates an incentive for the authority or players to cancel rather than settle, since cancellation returns the wager AND gives rent to the caller. The rent for a 168-byte account is approximately 0.00146 SOL. At small wagers (0.00001 SOL minimum), the PDA rent can be 146x the wager amount, creating a perverse incentive.

### Invariants
- I1: Only `config.authority` can settle, pause, unpause, or update config
- I2: Only registered players (player_one or player_two) can deposit
- I3: Winner must be player_one or player_two
- I4: Treasury and ops accounts must match config values and be distinct
- I5: Authority cannot be a player in the match it creates
- I6: Program cannot create matches, deposit, settle, or cancel while paused (except permissionless_reclaim)
- I7: Config is a singleton PDA -- only one exists per program

### Cross-Focus Handoffs
- **To CPI Agent:** `system_program::transfer` CPI in `deposit_wager` (line 179) passes player's signer authority to system program. Direct lamport manipulation in settle/cancel/reclaim (lines 284-291, 359-367, 421-428). Verify no privilege escalation.
- **To State Machine Agent:** Authority-gated state transitions: only authority can settle (Active -> Settled); authority-only cancel restricted to AwaitingDeposits state. Player cancel requires timeout for Active state. Verify state guards cannot be bypassed.
- **To Token/Economic Agent:** Authority controls fee destination addresses (treasury/ops) via `update_config`. Fee BPS are hardcoded constants (not admin-changeable). The `close = caller` / `close = authority` rent reclamation creates economic incentives that should be analyzed.
- **To Timing Agent:** Settlement deadline (1h) is authority-only. Cancel timeout (24h) gates player access. Permissionless reclaim (48h) opens to anyone. All timing checks interact with access control tiers.

### Risks Requiring Investigation
- R1: `update_config` can break the distinct-address invariant from `initialize_config`
- R2: `CreateMatch` has no `has_one = authority` on config -- anyone can create matches
- R3: One-step authority transfer with no acceptance step or timelock
- R4: PDA rent incentive for cancellation over settlement at low wagers
- R5: No CPI guard on any instruction -- all instructions are callable via CPI from other programs

<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

The SolShot escrow program implements a server-authority model where a single `config.authority` pubkey controls all privileged operations: match settlement, emergency pause/unpause, config updates, and (partially) match creation. The program uses Anchor's type system (`Signer<'info>`, `has_one`, `Account<'info, T>`) consistently for authority enforcement, with all 7 account structs containing appropriate signer constraints. The pause guard (OC-04) is applied to all 4 economic instructions via `constraint = !config.is_paused`.

However, the analysis reveals several access control observations that warrant investigation:

1. The `CreateMatch` instruction does not validate that the calling authority matches `config.authority`, meaning anyone can create match escrows. While settlement requires config authority, mismatched creation authority leads to stuck funds requiring timeout-based recovery.

2. The `update_config` instruction uses a one-step authority transfer pattern without a propose/accept flow, creating lockout risk. It also does not re-validate the distinct-address invariant, allowing the authority to set overlapping treasury/ops/authority addresses after initialization.

3. All instructions lack CPI guards, making them callable as inner instructions from other programs. While the program's trust model assumes direct invocation by the server, CPI-based invocation could create unexpected interaction patterns.

The overall access control architecture is well-structured for a server-authority escrow. The tiered timeout system (1h settlement, 24h player cancel, 48h permissionless reclaim) provides progressive access escalation that prevents permanent fund lockup.

---

## Scope

- **Files analyzed:** `programs/solshot-escrow/src/lib.rs` (855 LOC)
- **Functions analyzed:** `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim` (9 instruction handlers)
- **Account structs analyzed:** `InitializeConfig`, `UpdateConfig`, `PauseProgram`, `UnpauseProgram`, `CreateMatch`, `DepositWager`, `SettleMatch`, `CancelMatch`, `PermissionlessReclaim` (9 structs)
- **Estimated coverage:** 100% of on-chain access control surface

---

## Key Mechanisms

### Mechanism 1: Global Config Initialization (OC-01)

**Location:** `lib.rs:47-65` (handler), `lib.rs:446-461` (account struct)

**Purpose:**
One-time initialization of the program's global configuration PDA, which stores the authority pubkey, treasury address, ops address, pause flag, and PDA bump.

**How it works:**
1. Line 447-455: Anchor `init` constraint creates the config PDA with seeds `[b"config"]` and canonical bump. The `init` constraint ensures this can only be called once -- subsequent calls fail because the account already exists.
2. Line 458: `payer` is a `Signer<'info>` that pays rent. This is the deployer, but the payer is NOT necessarily the authority.
3. Lines 53-55: Three `require!` checks enforce that authority, treasury, and ops are all distinct pubkeys.
4. Lines 57-63: The config fields are set. Notably, `config.authority = authority` where `authority` is a parameter, not the payer's key. The payer and authority can be different addresses.

**Assumptions:**
- The deployer is trusted to provide correct authority, treasury, and ops addresses at initialization time.
- `init` constraint prevents reinitialization (Anchor discriminator check).
- The payer is trusted not to pass malicious addresses. There is no on-chain verification that the authority key is actually controlled by anyone -- it is a raw `Pubkey` parameter.

**Invariants:**
- I7: Only one GlobalConfig PDA can exist per program (PDA seeds `[b"config"]` are fixed).
- After initialization: `authority != treasury`, `authority != ops`, `treasury != ops`.

**Concerns:**
- The authority is set from a function parameter, not from the signer. A malicious deployer could set authority to any pubkey, including an address nobody controls, immediately bricking the program.
- There is no event emitted for initialization. Monitoring cannot detect when/how the config was initialized.

---

### Mechanism 2: Config Update / Authority Transfer

**Location:** `lib.rs:70-89` (handler), `lib.rs:464-475` (account struct)

**Purpose:**
Allows the current authority to update any combination of authority, treasury, and ops addresses.

**How it works:**
1. Line 466-471: Account struct requires `config` with `has_one = authority @ EscrowError::Unauthorized` and `authority: Signer<'info>`. This ensures only the current config authority can call this instruction.
2. Lines 78-86: Each field is updated only if the corresponding `Option` parameter is `Some`. If `None`, the current value is preserved.
3. Line 79: `config.authority = a` -- immediate one-step transfer. No pending state, no acceptance by new authority.

**Assumptions:**
- The authority is trusted to provide valid new addresses.
- The authority will not accidentally set authority to an uncontrolled key.
- No distinct-address re-validation is needed after initialization (this assumption is INCORRECT -- see concerns).

**Invariants:**
- I1: Only `config.authority` (as signer) can update config.

**Concerns:**
- **One-step authority transfer (EP-069/SP-017 pattern):** Line 79 sets authority immediately. If `new_authority` is set to an incorrect pubkey (typo, uncontrolled key, zero address), the program becomes permanently ungovernable. The secure pattern is two-step: propose + accept (SP-017). This is the highest-priority access control observation.
- **Distinct-address invariant not re-validated:** `initialize_config` enforces `authority != treasury`, `authority != ops`, `treasury != ops` (lines 53-55). However, `update_config` does NOT re-check these invariants. An authority could:
  - Set `new_authority` to the same address as treasury or ops.
  - Set `new_treasury` to the same address as ops.
  - Set `new_authority` to the same address as `new_treasury` AND `new_ops` by calling `update_config` twice (first update treasury, then update authority to match).
  - This breaks the `treasury != ops` check in `SettleMatch` (line 588), but since that check compares the accounts passed to the instruction (not the config values), an attacker could pass different accounts. Wait -- the constraint `treasury.key() == config.treasury` (line 587) and `ops.key() == config.ops` (line 596) bind the instruction accounts to config. If `config.treasury == config.ops`, then the same account must be passed for both, which would violate `treasury.key() != ops.key()` (line 588). So settlement would fail. The authority could set treasury == ops and effectively prevent settlement, requiring cancel/reclaim timeout recovery.
- **No event emitted:** Authority changes are not logged on-chain. An authority rotation would be invisible to monitoring unless indexing transaction logs.

---

### Mechanism 3: Emergency Pause/Unpause (OC-04)

**Location:** `lib.rs:93-103` (handlers), `lib.rs:480-505` (account structs)

**Purpose:**
Emergency pause mechanism that halts all economic instructions.

**How it works:**
1. Both `PauseProgram` and `UnpauseProgram` account structs require `has_one = authority` on the config account and `authority: Signer<'info>`.
2. Pause sets `config.is_paused = true` (line 94). Unpause sets it to `false` (line 101).
3. Both are idempotent -- calling pause when already paused is a no-op (no error).
4. The pause guard appears as `constraint = !config.is_paused @ EscrowError::ProgramPaused` on 4 instructions: `CreateMatch` (line 527), `DepositWager` (line 551), `SettleMatch` (line 605), `CancelMatch` (line 644).

**Assumptions:**
- The authority will use pause judiciously and not permanently pause to grief users.
- The pause guard covers all economically sensitive instructions.
- `permissionless_reclaim` intentionally bypasses pause (DCA-02 design).

**Invariants:**
- I1: Only `config.authority` can pause/unpause.
- I6: Paused state blocks create_match, deposit_wager, settle_match, cancel_match.

**Concerns:**
- **Pause blocks cancel_match but not permissionless_reclaim:** During a pause, players cannot cancel active matches. They must wait the full 48h for permissionless reclaim. The 24h cancel window is frozen during pause. If the authority pauses the program with Active matches, those matches can only be recovered via permissionless_reclaim (48h). This is a known design tradeoff documented as DCA-02.
- **Pause blocks settlement:** If the authority pauses the program, it also blocks itself from settling active matches. This means: pause -> cannot settle -> wait 48h -> permissionless reclaim refunds both players. The authority cannot selectively settle during pause.
- **Same authority for pause and unpause:** A compromised authority can pause the program to prevent settlements, then let timeouts trigger refunds for matches where it should have settled a winner. This is a denial-of-service vector, not a fund theft vector, since refunds go to the correct players.

---

### Mechanism 4: Match Creation Authority

**Location:** `lib.rs:110-152` (handler), `lib.rs:510-532` (account struct)

**Purpose:**
Creates a new match escrow PDA with two registered players and a wager amount.

**How it works:**
1. Line 510-518: The `escrow` account is initialized with `init`, `payer = authority`, seeds `[b"match", match_id.as_bytes()]`.
2. Line 520-521: `authority` is `Signer<'info>` and `mut` (pays rent).
3. Line 524-529: `config` is loaded with pause guard but NO `has_one = authority` constraint.
4. Lines 117-129: Input validation -- match_id length, wager bounds, distinct players, authority != player.
5. Line 133: `escrow.authority = ctx.accounts.authority.key()` -- stores the signer's pubkey as the match authority.

**Assumptions:**
- The calling authority is the server keypair that will later settle the match.
- The server ensures match_id uniqueness (PDA seeds enforce on-chain uniqueness).

**Invariants:**
- I5: `player_one != player_two` AND `authority != player_one` AND `authority != player_two`.
- The match PDA is unique per match_id (PDA derivation).

**Concerns:**
- **Missing `has_one = authority` on config (OBSERVATION):** The `CreateMatch` account struct does NOT validate that the signer matches `config.authority`. Any signer can create a match, paying their own SOL for rent. The `config` account is only used for the `!is_paused` constraint. This means:
  - A random user could create match escrows with arbitrary players and wager amounts.
  - The created escrow's `authority` field would be set to the random user's pubkey.
  - Later, `settle_match` requires BOTH `escrow.has_one = authority` (line 565) AND `config.has_one = authority` (line 604). If the escrow's authority differs from config's authority, settlement is impossible.
  - The match would require timeout-based cancel (24h by player, 48h by anyone).
  - This is likely by design for the server model (only the server has the keypair and sends create_match transactions), but is not enforced on-chain.
  - **5 Whys:** Why is there no `has_one = authority` on CreateMatch? Likely because the server is the only expected caller. Why is this a concern? Because on-chain enforcement should not rely on off-chain assumptions. Why would an attacker create a match? To lock up SOL in unresolvable escrows (grief) or to create matches where they are both player_one and player_two (self-play). Why can't they self-play? Because `player_one != player_two` is enforced (line 125), but both could be controlled by the same entity via separate keypairs.

---

### Mechanism 5: Deposit Authorization

**Location:** `lib.rs:156-223` (handler), `lib.rs:536-556` (account struct)

**Purpose:**
Allows registered players to deposit their wager into the escrow PDA.

**How it works:**
1. Line 544-545: `player: Signer<'info>` -- the depositor must sign.
2. Lines 163-166: State check -- must be `AwaitingDeposits`.
3. Lines 168-170: Player identity check -- depositor must be `escrow.player_one` or `escrow.player_two`.
4. Lines 172-176: Double-deposit prevention -- checks `player_one_deposited` / `player_two_deposited` flags.
5. Lines 179-188: System program CPI transfer from player to escrow PDA.
6. Lines 193-197: Update deposit flags.
7. Lines 206-209: If both deposited, transition to Active and record `activated_at`.

**Assumptions:**
- The system program CPI correctly transfers lamports.
- `player.key()` comparison against stored pubkeys is sufficient for identity verification.
- A player with insufficient lamports will have the CPI fail, preventing state corruption.

**Invariants:**
- I2: Only player_one or player_two can deposit.
- Each player can deposit exactly once.
- Deposit amount equals `escrow.wager_lamports` (read from escrow state, not from instruction params).

**Concerns:**
- No concerns identified. The deposit authorization is well-implemented. The player must be the signer, must match a registered player address, must not have already deposited, and the deposit amount is read from the escrow (not user-supplied).

---

### Mechanism 6: Settlement Authorization

**Location:** `lib.rs:228-305` (handler), `lib.rs:560-610` (account struct)

**Purpose:**
Authority-only settlement that distributes the pot to winner, treasury, and ops.

**How it works:**
1. Line 560-567: `escrow` has `has_one = authority` (the match creator authority) and `close = authority`.
2. Line 570-571: `authority: Signer<'info>`.
3. Line 574-580: `winner: UncheckedAccount` with constraint `winner.key() == escrow.player_one || winner.key() == escrow.player_two`.
4. Line 585-590: `treasury: UncheckedAccount` with constraints `treasury.key() == config.treasury` AND `treasury.key() != ops.key()`.
5. Line 594-597: `ops: UncheckedAccount` with constraint `ops.key() == config.ops`.
6. Line 601-606: `config` with `has_one = authority` (the config authority) AND `!config.is_paused`.

**Assumptions:**
- The match creator authority is the same as config.authority. If they differ, settlement is impossible.
- The authority is trusted to honestly report the winner.
- UncheckedAccount for winner/treasury/ops is safe because all are validated via constraints.

**Invariants:**
- I1: Only config.authority AND escrow.authority (must be same key) can settle.
- I3: Winner must be one of the two registered players.
- I4: Treasury matches config.treasury, ops matches config.ops, treasury != ops.

**Concerns:**
- **Dual authority requirement:** Settlement requires the signer to match BOTH `escrow.authority` (via `has_one` on escrow, line 565) AND `config.authority` (via `has_one` on config, line 604). If `config.authority` was rotated between match creation and settlement, old matches become unsettleable. The authority must remain stable during the 1h settlement window, or delegate to the same key.
- **Winner determination is authority-only:** The authority (server) decides who won. There is no on-chain game logic or dispute resolution. The authority could declare the wrong winner. This is an inherent trust assumption of the server-authority model.
- **UncheckedAccount for winner is appropriate:** The winner is a wallet address, not a program-owned account. `UncheckedAccount` with the constraint validation is the correct Anchor pattern here. The `/// CHECK:` comment is present (line 574).
- **UncheckedAccount for treasury/ops is appropriate:** Same reasoning. These are destination wallets, not program-owned accounts.

---

### Mechanism 7: Cancellation Authorization (OC-05)

**Location:** `lib.rs:310-376` (handler), `lib.rs:614-649` (account struct)

**Purpose:**
Two-tier cancellation: authority can cancel AwaitingDeposits; players can cancel AwaitingDeposits immediately or any state after 24h timeout.

**How it works:**
1. Line 614-624: `escrow` with `close = caller`. `caller: Signer<'info>`.
2. Lines 627-638: `player_one` and `player_two` are `UncheckedAccount` validated against escrow records.
3. Line 641-646: `config` with pause guard but NO `has_one = authority`. The config is used for `config.authority` comparison (line 312, 336) and pause check.
4. Lines 336-344: Authorization logic:
   - `is_authority = caller == config_authority` (line 336)
   - `is_player = caller == escrow.player_one || caller == escrow.player_two` (lines 337-338)
   - Authority can cancel ONLY if state is `AwaitingDeposits` (line 341)
   - Player can cancel if state is `AwaitingDeposits` OR if `is_timed_out` (line 342)
5. Lines 346-349: Terminal state check -- cannot cancel Settled or Cancelled.

**Assumptions:**
- `config.authority` read from the config account is the current authority (it is -- Anchor deserializes the account).
- The 24h timeout correctly prevents premature cancellation.
- The caller (authority or player) is an appropriate recipient for PDA rent.

**Invariants:**
- Authority can only cancel pre-deposit matches.
- Players can cancel pre-deposit matches immediately, or any non-terminal match after 24h.
- The caller receives PDA rent (incentive to clean up stale matches).

**Concerns:**
- **No `has_one = authority` on config:** The `CancelMatch` config account does NOT use `has_one = authority`. Instead, the handler reads `config.authority` (line 312) and compares it manually with `caller.key()` (line 336). This is functionally equivalent but differs from the pattern used in `SettleMatch` (which does use `has_one`). The manual comparison is safe because it reads from the validated config PDA, but it is an inconsistency.
- **Authority cancel vs. player cancel ambiguity:** If the authority is also a player (which is prevented by OC-06 in `create_match`, line 128-129), this would create ambiguity. Since OC-06 prevents authority-as-player, the `is_authority` and `is_player` paths are mutually exclusive for any given match.
- **Unauthorized caller who is neither authority nor player:** If someone who is neither authority nor a player calls cancel, both `is_authority` and `is_player` are false, and the `require!` on line 340-344 fails with `Unauthorized`. This is correct.

---

### Mechanism 8: Permissionless Reclaim (DCA-02)

**Location:** `lib.rs:381-438` (handler), `lib.rs:654-681` (account struct)

**Purpose:**
Escape hatch allowing anyone to trigger refund after 48 hours, with PDA rent going to the caller as incentive.

**How it works:**
1. Line 654-664: `escrow` with `close = caller`. `caller: Signer<'info>`. No `config` account.
2. Lines 667-678: `player_one` and `player_two` validated against escrow records.
3. Lines 390-394: Terminal state check.
4. Lines 396-411: 48h timeout check from `activated_at` or `created_at`.
5. Lines 414-428: Set state to Cancelled, refund depositors.

**Assumptions:**
- Anyone with a valid signer (any keypair) can call this after 48h.
- The PDA rent is sufficient incentive for a third party to submit the transaction.
- No pause guard is needed because this is an emergency escape hatch.

**Invariants:**
- Only callable after 48h from activation (or creation if never activated).
- Cannot reclaim Settled or Cancelled matches.
- Refunds go to the correct player addresses (validated via constraints).

**Concerns:**
- **No pause guard (by design):** This is the escape hatch. Even if the authority pauses the program and refuses to settle, anyone can reclaim after 48h. This is a deliberate design choice.
- **Caller receives rent but not wager:** The caller receives PDA rent (~0.00146 SOL for 168 bytes). For very small wagers, this rent is larger than the wager itself. This is not a vulnerability but is economically noteworthy.
- **No config account needed:** This instruction does not load the config PDA at all. It is fully self-contained using only the escrow PDA. This means it works even if the config has been corrupted or the authority has been lost.

---

## Trust Model

| Entity | Trust Level | What They Control | Trust Assumption |
|--------|------------|-------------------|------------------|
| `config.authority` (server keypair) | FULL | Settlement (winner determination), pause/unpause, config updates, match creation (by convention) | Trusted to honestly report winners, not abuse pause, not set invalid config |
| Players (player_one, player_two) | LIMITED | Deposit their own wagers, cancel after timeout | Trusted only to act in self-interest; constrained by on-chain logic |
| Permissionless caller (anyone) | NONE | Reclaim after 48h | Zero trust; fully constrained by 48h timeout and refund-only logic |
| Deployer (payer of initialize_config) | ONE-TIME | Initial config setup | Trusted at deploy time to set correct addresses; no ongoing trust |

---

## State Analysis

### State Read by Access Control Logic
- `config.authority` -- compared against signer in update_config, pause, unpause, settle_match, cancel_match
- `config.treasury` -- compared against instruction account in settle_match
- `config.ops` -- compared against instruction account in settle_match
- `config.is_paused` -- checked in create_match, deposit_wager, settle_match, cancel_match
- `escrow.authority` -- used for `has_one` in settle_match
- `escrow.player_one`, `escrow.player_two` -- used for player identity checks in deposit, settle (winner), cancel (player validation), reclaim (refund routing)
- `escrow.state` -- checked in deposit, settle, cancel, reclaim
- `escrow.player_one_deposited`, `escrow.player_two_deposited` -- checked in deposit (double-deposit prevention), cancel/reclaim (refund routing)
- `escrow.activated_at`, `escrow.created_at` -- used for timeout calculations in settle, cancel, reclaim

### State Written by Access Control Logic
- `config.authority`, `config.treasury`, `config.ops` -- modified by update_config
- `config.is_paused` -- modified by pause/unpause
- `escrow.authority` -- set once in create_match
- `escrow.player_one_deposited`, `escrow.player_two_deposited` -- set in deposit_wager
- `escrow.state` -- transitions in deposit (AwaitingDeposits -> Active), settle (Active -> Settled), cancel (-> Cancelled), reclaim (-> Cancelled)

---

## Dependencies

- `anchor_lang::prelude::*` -- Anchor framework providing account validation, PDA derivation, signer enforcement
- `anchor_lang::system_program` -- System program CPI for SOL transfers in deposit_wager
- `Clock::get()?` -- Solana clock sysvar for timestamp reads (lines 140, 209, 241, 333, 409)
- No external oracle programs
- No SPL Token program
- No third-party CPI targets

---

## Focus-Specific Analysis

### Complete Role Matrix

| Role | Who | Instructions | Accounts Controlled | Trust Level |
|------|-----|-------------|---------------------|-------------|
| **Authority** | `config.authority` (server hot wallet) | `update_config`, `pause_program`, `unpause_program`, `settle_match`, `cancel_match` (AwaitingDeposits only) | GlobalConfig (mut), MatchEscrow (via has_one) | FULL |
| **Match Creator** | `escrow.authority` (set at create time) | `create_match`, `settle_match` (must also be config.authority) | MatchEscrow (init, close on settle) | FULL (must = config.authority for settlement) |
| **Player** | `escrow.player_one` or `escrow.player_two` | `deposit_wager`, `cancel_match` (with timeout for Active) | MatchEscrow (deposit flags, state) | LIMITED |
| **Deployer/Payer** | Whoever calls `initialize_config` | `initialize_config` (one-time) | GlobalConfig (init) | ONE-TIME |
| **Anyone** | Any signer | `permissionless_reclaim` (after 48h), `create_match` (see concern) | MatchEscrow (close, state to Cancelled) | NONE (time-gated) |

### Authority Transfer Analysis

| Authority Field | Transfer Mechanism | One-Step or Two-Step | Timelock | Lockout Risk |
|----------------|-------------------|---------------------|---------|-------------|
| `config.authority` | `update_config(new_authority: Some(pubkey))` | **ONE-STEP** | **NONE** | **YES** -- setting to wrong key permanently bricks governance |
| `config.treasury` | `update_config(new_treasury: Some(pubkey))` | ONE-STEP | NONE | LOW -- can be corrected by authority |
| `config.ops` | `update_config(new_ops: Some(pubkey))` | ONE-STEP | NONE | LOW -- can be corrected by authority |
| `escrow.authority` | Set once at `create_match` (line 133); never changeable | IMMUTABLE | N/A | If config.authority rotates, old escrows cannot be settled (requires timeout recovery) |

**Assessment:** The one-step authority transfer is the highest-priority access control concern. SP-017 (Two-Step Authority Transfer) is the secure pattern. The program should implement a `propose_new_authority` + `accept_authority` pattern. At minimum, the update should validate that the new authority is not the zero address and that the three addresses remain distinct.

### Missing Check Inventory

| Instruction | State Modified | Signer Check | Authority Validated Against Config | Observation |
|-------------|---------------|-------------|-----------------------------------|-------------|
| `initialize_config` | GlobalConfig (init) | `payer: Signer` | N/A (first init) | Payer != authority by design. No issue. |
| `update_config` | GlobalConfig (mut) | `authority: Signer` | `has_one = authority` | **Missing: distinct-address re-validation** |
| `pause_program` | GlobalConfig (mut) | `authority: Signer` | `has_one = authority` | Correct |
| `unpause_program` | GlobalConfig (mut) | `authority: Signer` | `has_one = authority` | Correct |
| `create_match` | MatchEscrow (init) | `authority: Signer` | **NOT validated** (no has_one) | **Missing: config.authority check** |
| `deposit_wager` | MatchEscrow (mut) | `player: Signer` | N/A (player, not authority) | Correct |
| `settle_match` | MatchEscrow (mut, close) | `authority: Signer` | `has_one = authority` (both escrow and config) | Correct |
| `cancel_match` | MatchEscrow (mut, close) | `caller: Signer` | Manual comparison (line 336) | Functionally correct but inconsistent pattern |
| `permissionless_reclaim` | MatchEscrow (mut, close) | `caller: Signer` | N/A (permissionless) | Correct by design |

### Key Management Assessment

| Key | Storage | Single Key or Multisig | Hot or Cold | Assessment |
|-----|---------|----------------------|-------------|------------|
| `config.authority` | On-chain in GlobalConfig PDA | **Single key** | **Hot wallet** (server keypair) | Server hot wallet is a single point of failure. Compromise = arbitrary settlement, config changes, pause abuse. |
| Upgrade authority | Off-chain (Solana program authority) | Single key (currently) | Unknown | Comment at line 1 notes OC-13: must transfer to multisig before mainnet. |
| Treasury destination | On-chain in GlobalConfig PDA | Wallet address (not key management) | N/A | Receives 7% fees. Authority-changeable. |
| Ops destination | On-chain in GlobalConfig PDA | Wallet address (not key management) | N/A | Receives 3% fees. Authority-changeable. |

**Assessment:** The server keypair is a single hot wallet controlling all privileged operations. For mainnet, this should be a multisig or at minimum have the upgrade authority transferred to a multisig (as noted in OC-13). The server keypair creates matches, settles matches, and can update all config fields. If compromised, an attacker can: (1) settle matches to the wrong winner, (2) change treasury/ops to attacker-controlled wallets, (3) change authority to lock out the team, (4) pause the program indefinitely.

---

## Cross-Focus Intersections

### Access Control x State Machine
- State transitions are authority-gated: only authority can trigger `Active -> Settled`. Players can trigger `* -> Cancelled` with timeout constraints. The state machine agent should verify that the access control tiers correctly prevent unauthorized state transitions.
- The `cancel_match` handler has complex conditional logic (lines 340-344) that combines role checks with state checks. The state machine agent should verify this logic exhaustively.

### Access Control x Arithmetic
- No direct intersection. The authority does not control any arithmetic parameters (fee BPS are hardcoded constants).

### Access Control x CPI
- The `deposit_wager` instruction performs CPI to system program with the player's signer authority. The CPI agent should verify that the system program CPI cannot be exploited.
- Settlement and cancellation use direct lamport manipulation (not CPI). The lamport transfers are performed AFTER the mutable borrow is dropped (lines 284-291), which is correct for Anchor's borrow checker safety but is not technically a CPI concern.

### Access Control x Token/Economic
- The authority controls fee destination addresses via `update_config`. The Token/Economic agent should analyze the impact of destination changes on pending settlements.
- Fee BPS (700, 300) are hardcoded constants -- the authority CANNOT change fee percentages without a program upgrade.

### Access Control x Timing
- All three timeout tiers (1h settlement, 24h cancel, 48h reclaim) interact with access control by expanding who can act as time progresses. The timing agent should verify that the timeout boundaries are correct and that Clock manipulation (validator time skew) cannot bypass access control tiers prematurely.

---

## Cross-Reference Handoffs

- **To CPI Agent:** The `system_program::transfer` CPI in `deposit_wager` (line 179) passes the player's signer authority. Verify that no privilege escalation is possible. Also check: the system_program is validated via `Program<'info, System>` (lines 531, 555, 609, 648, 680) -- this is the secure pattern.
- **To State Machine Agent:** The `cancel_match` handler (lines 340-344) combines access control with state checks in a single `require!`. Verify that all state/role combinations are correctly handled: authority+AwaitingDeposits=OK, authority+Active=DENIED, player+AwaitingDeposits=OK, player+Active+timed_out=OK, player+Active+not_timed_out=DENIED, nobody+any=DENIED.
- **To Token/Economic Agent:** The authority can change treasury and ops addresses at any time via `update_config`. This means the authority can redirect fee income. The economic impact should be analyzed: is there a window where a settlement uses old treasury/ops addresses after an update? Answer: No, because `settle_match` reads `config.treasury` and `config.ops` at instruction execution time, and the config is loaded fresh each time. But: if the authority updates config in one instruction and settles in the next instruction of the same transaction, the settlement uses the new addresses. This is consistent behavior but should be documented.
- **To Timing Agent:** The settlement deadline check (line 236) has a conditional: `if ctx.accounts.escrow.activated_at > 0`. This means matches with `activated_at == 0` (which should be impossible for Active matches, since `activated_at` is set on Active transition at line 209) skip the deadline check entirely. Verify that no code path can set state to Active without also setting `activated_at`.

---

## Risk Observations

- **R1: update_config breaks distinct-address invariant.** `initialize_config` enforces `authority != treasury != ops`, but `update_config` does not re-validate this. An authority could set `treasury == ops`, making settlement impossible (the `treasury != ops` constraint on SettleMatch would fail). This is a self-grief by the authority, not a third-party attack, but it could leave active matches unresolvable via settlement.

- **R2: CreateMatch has no config authority gate.** Any signer can create match escrows. While this does not directly enable fund theft (settlement requires config.authority), it enables: (a) escrow griefing -- creating many matches that occupy PDA space, (b) creating matches where escrow.authority differs from config.authority, making them unsettleable, (c) wasting SOL on escrow rent for matches that can never be properly settled.

- **R3: One-step authority transfer.** Setting `config.authority` to a wrong key is an irreversible lockout. This is the most impactful access control risk. The program would continue to function for existing matches (timeout recovery works), but no new settlements, no config changes, and no pause/unpause would be possible.

- **R4: PDA rent incentive imbalance at low wagers.** The minimum wager is 10,000 lamports (0.00001 SOL). The PDA rent for 168 bytes is approximately 1,461,600 lamports (~0.00146 SOL). The PDA rent is 146x the minimum wager. For cancellation: the caller receives rent. For settlement: the authority receives rent. This creates a situation where the rent is more valuable than the wager itself at low wager amounts. Not a vulnerability, but an economic quirk worth analyzing.

- **R5: No CPI guard on any instruction.** None of the 9 instructions check whether they are being invoked via CPI or directly. This means another Solana program could invoke any instruction as an inner instruction. While the signer requirements still apply, CPI-based invocation opens interaction patterns not considered in the server-authority model. For example, a wrapper program could invoke `create_match` + `deposit_wager` + `deposit_wager` in a single transaction, or invoke `cancel_match` from within a CPI chain.

---

## Novel Attack Surface Observations

- **Authority rotation during active matches:** If the authority is rotated via `update_config` while matches are Active, those matches become permanently unsettleable (because `settle_match` requires `has_one = authority` on BOTH escrow and config). The escrow stores the old authority; the config now has the new authority. The only recovery path is timeout-based cancellation (24h by player, 48h by anyone). This is a unique interaction between the immutable escrow authority and the mutable config authority. An attacker who compromises the authority for even one transaction could: (1) rotate authority to an attacker-controlled key, (2) settle pending matches with the wrong winner (using the brief window where they ARE the authority), then (3) the real team loses all future governance. This is the standard authority compromise scenario, but the dual-authority requirement in `settle_match` creates a unique wrinkle: the attacker must act in the same transaction/before any matches are created with the new authority.

- **Match ID collision for PDA occupancy attack:** Match IDs are strings up to 32 characters (line 117). PDA seeds are `[b"match", match_id.as_bytes()]`. If an attacker can predict or observe match IDs that the server will use, they could pre-create escrow PDAs with those IDs (since `create_match` has no config authority gate). The server's subsequent `create_match` call would fail because the PDA already exists (`init` constraint). This is a denial-of-service vector: the attacker creates escrows with common match IDs (e.g., "room-1", "room-2", ...), blocking the server from creating legitimate matches with those IDs. The server must use unpredictable match IDs (e.g., UUIDs) to mitigate this. Note: each pre-created escrow costs the attacker ~0.00146 SOL in rent, which they recover 48h later via permissionless_reclaim.

---

## Questions for Other Focus Areas

- **For State Machine focus:** Can the state reach `Active` without `activated_at` being set? Line 207-209 sets state to Active and `activated_at` in the same block, but is there a scenario where only one update persists? (Answer should be no -- Anchor serialization is atomic within an instruction, but verify.)

- **For Arithmetic focus:** The u128 -> u64 cast at line 260 (`as u64`) and line 267 (`as u64`) -- are these safe given the MAX_WAGER bound? Max total_pot = 200 SOL = 200e9 lamports. Max treasury = 200e9 * 700 / 10000 = 14e9. Max ops = 200e9 * 300 / 10000 = 6e9. All fit in u64. But verify the intermediate u128 values are correctly bounded before the cast.

- **For CPI focus:** The `system_program::transfer` in `deposit_wager` (line 179) -- is the `system_program` account validated? Yes, via `Program<'info, System>` (line 555). Confirm this is the correct pattern.

- **For Timing focus:** The settlement deadline check at line 236 uses `if activated_at > 0`. What happens if a match transitions to Active with `activated_at = 0`? This should be impossible (line 209 reads Clock), but if the Clock returns 0 (which it should never do on mainnet), the settlement deadline check would be skipped.

- **For Token/Economic focus:** At minimum wager (10,000 lamports), the fee calculations yield: treasury = 20000 * 700 / 10000 = 1,400 lamports. ops = 20000 * 300 / 10000 = 600 lamports. Winner = 20000 - 1400 - 600 = 18,000 lamports. All values are > 0. But verify the dust-loss scenario at this minimum.

---

## Raw Notes

### Signer Map (All 9 `Signer<'info>` instances)

| Line | Account Name | Instruction | Purpose |
|------|-------------|------------|---------|
| 458 | `payer` | InitializeConfig | Pays rent for config PDA |
| 474 | `authority` | UpdateConfig | Must match config.authority |
| 489 | `authority` | PauseProgram | Must match config.authority |
| 504 | `authority` | UnpauseProgram | Must match config.authority |
| 521 | `authority` | CreateMatch | Pays rent for escrow PDA (NOT validated against config) |
| 545 | `player` | DepositWager | Must be player_one or player_two |
| 571 | `authority` | SettleMatch | Must match both escrow.authority and config.authority |
| 624 | `caller` | CancelMatch | Must be authority or player (logic in handler) |
| 664 | `caller` | PermissionlessReclaim | Any signer (permissionless) |

### has_one Map (All 5 `has_one` constraints)

| Line | Account | Field | Instruction | Error |
|------|---------|-------|------------|-------|
| 470 | config | authority | UpdateConfig | Unauthorized |
| 485 | config | authority | PauseProgram | Unauthorized |
| 500 | config | authority | UnpauseProgram | Unauthorized |
| 565 | escrow | authority | SettleMatch | (default) |
| 604 | config | authority | SettleMatch | Unauthorized |

### UncheckedAccount Inventory

| Line | Account | Instruction | CHECK Comment | Constraint Validation | Safe? |
|------|---------|------------|---------------|----------------------|-------|
| 581 | `winner` | SettleMatch | "Constrained to escrow.player_one or escrow.player_two" | `winner.key() == escrow.player_one \|\| winner.key() == escrow.player_two` | YES |
| 590 | `treasury` | SettleMatch | "Constrained to config.treasury; uniqueness check vs ops" | `treasury.key() == config.treasury` AND `treasury.key() != ops.key()` | YES |
| 598 | `ops` | SettleMatch | "Constrained to config.ops" | `ops.key() == config.ops` | YES |
| 631 | `player_one` | CancelMatch | "Must match escrow.player_one" | `player_one.key() == escrow.player_one` | YES |
| 638 | `player_two` | CancelMatch | "Must match escrow.player_two" | `player_two.key() == escrow.player_two` | YES |
| 671 | `player_one` | PermissionlessReclaim | "Must match escrow.player_one for refund routing" | `player_one.key() == escrow.player_one` | YES |
| 678 | `player_two` | PermissionlessReclaim | "Must match escrow.player_two for refund routing" | `player_two.key() == escrow.player_two` | YES |

All 7 UncheckedAccount instances have `/// CHECK:` comments and are validated via Anchor constraints. No unvalidated UncheckedAccounts found.

### Pause Guard Coverage

| Instruction | Has Pause Guard | Line |
|-------------|----------------|------|
| initialize_config | No (one-time init) | N/A |
| update_config | No (admin meta-operation) | N/A |
| pause_program | No (must work to activate) | N/A |
| unpause_program | No (must work to deactivate) | N/A |
| create_match | YES | 527 |
| deposit_wager | YES | 551 |
| settle_match | YES | 605 |
| cancel_match | YES | 644 |
| permissionless_reclaim | **No (DCA-02 escape hatch)** | N/A |

### PDA Derivation Catalog

| PDA | Seeds | Bump Handling | Collision Risk |
|-----|-------|--------------|----------------|
| GlobalConfig | `[b"config"]` | Canonical bump stored at init (line 62), referenced with `bump = config.bump` | None (singleton) |
| MatchEscrow | `[b"match", match_id.as_bytes()]` | Canonical bump stored at init (line 142), referenced with `bump = escrow.bump` | Low (match_id must be unique; enforced by PDA derivation) |

Both PDAs use Anchor's canonical bump pattern (SP-001, SP-009). No non-canonical bump vulnerabilities.
