# Solana Escrow Program Index
**File:** `programs/solshot-escrow/src/lib.rs`
**Lines:** 855 LOC
**Language:** Rust / Anchor
**Purpose:** Wagering match escrow with multi-signature settlement authority, 24h timeout auto-refund, and emergency pause controls

---

## 1. File Inventory

| Path | LOC | Purpose |
|------|-----|---------|
| `programs/solshot-escrow/src/lib.rs` | 855 | Core escrow instruction handlers, state structs, error codes, and event emissions |

---

## 2. Entry Points

### Configuration Management

#### `initialize_config` (Line 47)
- **Parameters:** `authority: Pubkey, treasury: Pubkey, ops: Pubkey`
- **Account Struct:** `InitializeConfig`
- **Description:** One-time deployer-only initialization of the global config PDA (seeds: `[b"config"]`). Validates that authority, treasury, and ops are all distinct addresses. Sets `is_paused = false`. Stores bump seed for PDA derivation.
- **Security Tags:** OC-01 (config initialization)

#### `update_config` (Line 70)
- **Parameters:** `new_authority: Option<Pubkey>, new_treasury: Option<Pubkey>, new_ops: Option<Pubkey>`
- **Account Struct:** `UpdateConfig`
- **Description:** Governance update of authority/treasury/ops addresses. All parameters optional (None = keep current). Requires current authority signer (`has_one` constraint).
- **Security Tags:** Authority management

#### `pause_program` (Line 93)
- **Parameters:** None
- **Account Struct:** `PauseProgram`
- **Description:** Emergency pause that halts all economic instructions (`create_match`, `deposit_wager`, `settle_match`). Sets `is_paused = true`. Idempotent (safe to call multiple times).
- **Security Tags:** OC-04 (emergency controls)

#### `unpause_program` (Line 100)
- **Parameters:** None
- **Account Struct:** `UnpauseProgram`
- **Description:** Emergency unpause that resumes economic instructions. Sets `is_paused = false`. Idempotent.
- **Security Tags:** OC-04 (emergency controls)

### Match Lifecycle

#### `create_match` (Line 110)
- **Parameters:** `match_id: String, wager_lamports: u64, player_one: Pubkey, player_two: Pubkey`
- **Account Struct:** `CreateMatch`
- **Description:** Creates a new match escrow PDA (seeds: `[b"match", match_id.as_bytes()]`). Validates:
  - `match_id.len() <= 32` (OC-08)
  - `wager_lamports >= MIN_WAGER_LAMPORTS` (10,000 lamports = 0.00001 SOL) (OC-08)
  - `wager_lamports <= MAX_WAGER_LAMPORTS` (100,000,000,000 = 100 SOL) (OC-12)
  - Players are distinct (`player_one != player_two`)
  - Authority (server keypair) is not a player (OC-06)
  - Program is not paused (OC-04)
  - Initializes state to `AwaitingDeposits`, sets `activated_at = 0` (set later in `deposit_wager`). Emits `MatchCreated` event.
- **Security Tags:** OC-04, OC-06, OC-08, OC-12

#### `deposit_wager` (Line 156)
- **Parameters:** None (wager amount from escrow state)
- **Account Struct:** `DepositWager`
- **Description:** Each player calls once to deposit their wager into the escrow PDA. Uses Rust borrow-checker-safe read-before-borrow pattern: reads `wager_lamports` and `match_id` as immutable values first (lines 160–161), then transfers via CPI (lines 179–188), then takes mutable borrow to update state (line 191). Validates:
  - Match is in `AwaitingDeposits` state
  - Caller is player_one or player_two
  - Caller has not already deposited
  - Program is not paused (OC-04)
  - Transitions to `Active` when both players deposit (line 206–209)
  - Sets `activated_at = Clock::get()?.unix_timestamp` at activation (OC-07)
  - Emits `WagerDeposited` and `MatchActive` events with checked arithmetic for total_pot (OC-09)
- **Security Tags:** OC-04, OC-07, OC-09

#### `settle_match` (Line 228)
- **Parameters:** `winner: Pubkey`
- **Account Struct:** `SettleMatch`
- **Description:** Authority-only settlement that distributes the pot (total_pot = 2 × wager). All BPS calculations use u128 widening (lines 253–265) to avoid overflow at max wager. Distribution:
  - Winner: `total_pot - treasury_amount - ops_amount` (remainder, avoiding dust loss)
  - Treasury: `7%` (700 BPS)
  - Ops: `3%` (300 BPS)
  - Validates:
    - Match is in `Active` state
    - Settlement deadline check: `activated_at + 1h <= now` (OC-07, lines 236–244)
    - Winner is player_one or player_two (OC-02)
    - Treasury account matches config.treasury (OC-03)
    - Ops account matches config.ops (OC-03)
    - Treasury != ops (OC-03)
    - Authority is signer
    - Program is not paused (OC-04)
  - Sets state to `Settled` BEFORE transfers (OC-10, lines 277–280)
  - Performs three direct lamport transfers (lines 284–291)
  - Closes escrow PDA, reclaiming rent to authority
  - Emits `MatchSettled` with treasury/ops pubkeys for on-chain monitoring (OC-11)
- **Security Tags:** OC-02, OC-03, OC-04, OC-07, OC-09, OC-10, OC-11

#### `cancel_match` (Line 310)
- **Parameters:** None
- **Account Struct:** `CancelMatch`
- **Description:** Refunds both players' wagers. Two-tier authorization (OC-05):
  - **Authority path:** Can only cancel `AwaitingDeposits` state (not Active even if desired). Does not require timeout.
  - **Player path:** Can cancel `AwaitingDeposits` immediately, or any state after 24h timeout from activation/creation (OC-07).
  - Validates:
    - Match is not already `Settled` or `Cancelled`
    - Program is not paused (OC-04)
    - Timeout check uses `activated_at` if > 0, else `created_at` (OC-07)
    - Checked arithmetic for timeout deadline (OC-09, lines 329–331)
  - Sets state to `Cancelled` BEFORE transfers (OC-10, lines 352–355)
  - Refunds player_one if they deposited (lines 358–360)
  - Refunds player_two if they deposited (lines 364–366)
  - Closes escrow PDA, reclaiming rent to caller
  - Emits `MatchCancelled` with refund status
- **Security Tags:** OC-04, OC-05, OC-07, OC-09, OC-10

#### `permissionless_reclaim` (Line 381)
- **Parameters:** None
- **Account Struct:** `PermissionlessReclaim`
- **Description:** **DCA-02** — Permissionless escape hatch: anyone can trigger refund after 48h (2× normal 24h timeout). No authority or player authorization required. Caller receives PDA rent as economic incentive. Validates:
  - Match is not already `Settled` or `Cancelled`
  - Timeout reference uses `activated_at` if > 0, else `created_at` (OC-07)
  - Current time > `activated_at + 172800` or `created_at + 172800` (OC-07, lines 404–406)
  - Checked arithmetic for reclaim deadline (line 405)
  - Sets state to `Cancelled` BEFORE transfers (lines 414–417)
  - Refunds both players (lines 420–428)
  - Closes escrow PDA, reclaiming rent to caller
  - Emits `MatchCancelled`
- **Security Tags:** DCA-02, OC-07

---

## 3. Account Structs

### `InitializeConfig` (Line 446)
```
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    config:          Account<GlobalConfig>        [init, payer, seeds=[b"config"], SPACE=106]
    payer:           Signer                        [mut]
    system_program:  Program<System>
}
```
**Constraints:**
- `config` initialized as PDA with bump seed
- `payer` pays rent (typically deployer)
- One-time call only (config account init fails if already exists)

---

### `UpdateConfig` (Line 464)
```
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    config:    Account<GlobalConfig>     [mut, seeds=[b"config"], has_one=authority]
    authority: Signer
}
```
**Constraints:**
- `authority` is signer and must match `config.authority` (enforced by Anchor)

---

### `PauseProgram` (Line 480)
```
#[derive(Accounts)]
pub struct PauseProgram<'info> {
    config:    Account<GlobalConfig>     [mut, seeds=[b"config"], has_one=authority]
    authority: Signer
}
```
**Constraints:**
- `authority` is signer and must match `config.authority`

---

### `UnpauseProgram` (Line 495)
```
#[derive(Accounts)]
pub struct UnpauseProgram<'info> {
    config:    Account<GlobalConfig>     [mut, seeds=[b"config"], has_one=authority]
    authority: Signer
}
```
**Constraints:**
- `authority` is signer and must match `config.authority`

---

### `CreateMatch` (Line 510)
```
#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreateMatch<'info> {
    escrow:        Account<MatchEscrow>         [init, payer, seeds=[b"match", match_id.as_bytes()], SPACE=168]
    authority:     Signer                       [mut]
    config:        Account<GlobalConfig>        [seeds=[b"config"], constraint: !is_paused]
    system_program: Program<System>
}
```
**Constraints:**
- `escrow` initialized as PDA with bump seed (per-match)
- `authority` pays rent (server keypair)
- `config.is_paused == false` (OC-04 pause guard)

---

### `DepositWager` (Line 536)
```
#[derive(Accounts)]
pub struct DepositWager<'info> {
    escrow:        Account<MatchEscrow>         [mut, seeds=[b"match", escrow.match_id.as_bytes()]]
    player:        Signer                       [mut]
    config:        Account<GlobalConfig>        [seeds=[b"config"], constraint: !is_paused]
    system_program: Program<System>
}
```
**Constraints:**
- `escrow` is mutable (state updated)
- `player` is signer (must authorize lamport transfer)
- `config.is_paused == false` (OC-04 pause guard)

---

### `SettleMatch` (Line 560)
```
#[derive(Accounts)]
pub struct SettleMatch<'info> {
    escrow:        Account<MatchEscrow>         [mut, seeds=[b"match", escrow.match_id.as_bytes()], close=authority]
    authority:     Signer                       [mut]
    winner:        UncheckedAccount             [mut, constraint: == player_one || == player_two]
    treasury:      UncheckedAccount             [mut, constraint: == config.treasury, != ops]
    ops:           UncheckedAccount             [mut, constraint: == config.ops]
    config:        Account<GlobalConfig>        [seeds=[b"config"], has_one=authority, constraint: !is_paused]
    system_program: Program<System>
}
```
**Constraints:**
- `escrow` closed to `authority` after settlement (rent reclaimed)
- `authority` is signer and must match config
- `winner` is validated against `escrow.player_one` or `escrow.player_two` (OC-02)
- `treasury` is validated against `config.treasury` (OC-03)
- `ops` is validated against `config.ops` (OC-03)
- `treasury != ops` (OC-03, prevents fee skimming)
- `config.is_paused == false` (OC-04 pause guard)

---

### `CancelMatch` (Line 614)
```
#[derive(Accounts)]
pub struct CancelMatch<'info> {
    escrow:        Account<MatchEscrow>         [mut, seeds=[b"match", escrow.match_id.as_bytes()], close=caller]
    caller:        Signer                       [mut]
    player_one:    UncheckedAccount             [mut, constraint: == escrow.player_one]
    player_two:    UncheckedAccount             [mut, constraint: == escrow.player_two]
    config:        Account<GlobalConfig>        [seeds=[b"config"], constraint: !is_paused]
    system_program: Program<System>
}
```
**Constraints:**
- `escrow` closed to `caller` (rent reclaimed)
- `caller` is signer (authority or player)
- `player_one` and `player_two` validated against escrow records
- `config.is_paused == false` (OC-04 pause guard)

---

### `PermissionlessReclaim` (Line 654)
```
#[derive(Accounts)]
pub struct PermissionlessReclaim<'info> {
    escrow:        Account<MatchEscrow>         [mut, seeds=[b"match", escrow.match_id.as_bytes()], close=caller]
    caller:        Signer                       [mut]
    player_one:    UncheckedAccount             [mut, constraint: == escrow.player_one]
    player_two:    UncheckedAccount             [mut, constraint: == escrow.player_two]
    system_program: Program<System>
}
```
**Constraints:**
- `escrow` closed to `caller` (caller receives rent)
- `caller` is any signer (permissionless)
- `player_one` and `player_two` validated for refund routing
- NO `config` account needed (no pause guard; this is an escape hatch)

---

## 4. State Structs

### `GlobalConfig` (Line 691)
```rust
pub struct GlobalConfig {
    pub authority: Pubkey,     // Server authority (settlement signer)
    pub treasury: Pubkey,      // 7% fee destination
    pub ops: Pubkey,           // 3% fee destination
    pub is_paused: bool,       // Emergency pause flag
    pub bump: u8,              // PDA bump seed
}
```
**Space:** 8 (discriminator) + 32 + 32 + 32 + 1 + 1 = **106 bytes**
**PDA Seeds:** `[b"config"]`
**Singleton:** Yes, one per program (Anchor's `#[derive(Accounts)]` enforces this)

---

### `MatchEscrow` (Line 712)
```rust
pub struct MatchEscrow {
    pub match_id: String,              // Unique match ID (max 32 chars)
    pub authority: Pubkey,             // Server authority that created match
    pub player_one: Pubkey,            // Player 1 wallet
    pub player_two: Pubkey,            // Player 2 wallet
    pub wager_lamports: u64,           // Wager per player (in lamports)
    pub player_one_deposited: bool,    // Deposit flag
    pub player_two_deposited: bool,    // Deposit flag
    pub state: MatchState,             // Current state enum
    pub created_at: i64,               // Unix timestamp of creation (fallback timeout ref)
    pub activated_at: i64,             // Unix timestamp when match became Active (OC-07)
    pub bump: u8,                      // PDA bump seed
}
```
**Space:** 8 + (4+32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 8 + 1 = **168 bytes**
**PDA Seeds:** `[b"match", match_id.as_bytes()]`
**Per-Match:** Yes, one per match

---

### `MatchState` (Line 757)
```rust
pub enum MatchState {
    AwaitingDeposits,  // Variant 0: initial state, players can deposit
    Active,            // Variant 1: both deposited, match is running
    Settled,           // Variant 2: terminal, winner settled
    Cancelled,         // Variant 3: terminal, refunded
}
```
**Size:** 1 byte (4 variants fit in u8)

---

## 5. Error Enums

| Error Code | Line | Message | Relevant Security Tag |
|------------|------|---------|----------------------|
| `MatchIdTooLong` | 815 | Match ID must be 32 characters or fewer | OC-08 |
| `ZeroWager` | 817 | Wager must be greater than zero | — |
| `SamePlayer` | 819 | Players must be different wallets | — |
| `InvalidState` | 821 | Match is not in the correct state for this operation | — |
| `NotAPlayer` | 823 | Signer is not a player in this match | — |
| `AlreadyDeposited` | 825 | Player has already deposited | — |
| `InvalidWinner` | 827 | Winner must be player one or player two | OC-02 |
| `Unauthorized` | 829 | Not authorized for this operation | OC-05 |
| `InvalidPlayer` | 831 | Player account does not match escrow record | — |
| `AuthorityAsPlayer` | 834 | Authority cannot participate as a player | OC-06 |
| `WagerTooSmall` | 836 | Wager below minimum threshold (0.00001 SOL) | OC-08 |
| `WagerTooLarge` | 838 | Wager above maximum threshold (100 SOL) | OC-12 |
| `InvalidTreasury` | 840 | Treasury account does not match config | OC-03 |
| `InvalidOps` | 842 | Ops account does not match config | OC-03 |
| `DuplicateFeeAccount` | 844 | Treasury and ops accounts must be different | OC-03 |
| `ProgramPaused` | 846 | Program is paused | OC-04 |
| `ArithmeticOverflow` | 848 | Arithmetic overflow (checked_mul, checked_add) | OC-09 |
| `InvalidConfig` | 850 | Invalid config parameters (distinct addresses) | OC-01 |
| `SettlementExpired` | 852 | Settlement deadline has passed (1h after activation) | OC-07 |
| `TooEarlyToReclaim` | 854 | Cannot reclaim before 2x timeout has elapsed (48h) | DCA-02 |

---

## 6. Constants

| Name | Line | Value | Purpose |
|------|------|-------|---------|
| `TREASURY_BPS` | 15 | 700 | Treasury fee in basis points (7%) |
| `OPS_BPS` | 16 | 300 | Ops fee in basis points (3%) |
| `BPS_DENOMINATOR` | 17 | 10_000 | Denominator for BPS calculations |
| `TIMEOUT_SECONDS` | 20 | 86_400 | 24-hour timeout (seconds) |
| `PERMISSIONLESS_RECLAIM_TIMEOUT` | 23 | 172_800 | 48-hour permissionless reclaim timeout (2× normal) |
| `SETTLEMENT_TIMEOUT_SECONDS` | 26 | 3_600 | 1-hour settlement deadline (OC-07) |
| `MIN_WAGER_LAMPORTS` | 29 | 10_000 | Minimum wager: 0.00001 SOL (OC-08) |
| `MAX_WAGER_LAMPORTS` | 32 | 100_000_000_000 | Maximum wager: 100 SOL (OC-12) |

**Fee Split (BPS):**
- Winner: 10,000 - 700 - 300 = **9,000 BPS (90%)**
- Treasury: 700 BPS (7%)
- Ops: 300 BPS (3%)

---

## 7. Key Mechanisms

### SOL Flow

1. **Deposit Phase (AwaitingDeposits → Active)**
   - Player 1 calls `deposit_wager()`: transfers `wager_lamports` from player 1 to escrow PDA
   - Player 2 calls `deposit_wager()`: transfers `wager_lamports` from player 2 to escrow PDA
   - Escrow PDA now holds `2 × wager_lamports` (total pot)
   - State transitions to `Active`, `activated_at` timestamp recorded

2. **Settlement Phase (Active → Settled)**
   - Authority calls `settle_match(winner)`: distributes from escrow PDA:
     - Winner gets: `total_pot - treasury_fee - ops_fee`
     - Treasury gets: `total_pot × 7 / 100`
     - Ops gets: `total_pot × 3 / 100`
   - Escrow PDA rent reclaimed by authority
   - State transitions to `Settled`

3. **Refund Phase (Any → Cancelled)**
   - `cancel_match()`: players get their `wager_lamports` back (if deposited)
   - `permissionless_reclaim()`: same, but callable by anyone after 48h
   - Escrow PDA rent reclaimed by caller
   - State transitions to `Cancelled`

### PDA Derivation

| PDA | Seeds | Uniqueness |
|-----|-------|-----------|
| Global Config | `[b"config"]` | Program-wide singleton |
| Match Escrow | `[b"match", match_id.as_bytes()]` | Per-match (match_id max 32 chars, enforced at line 117) |

### Authority Model

- **`GlobalConfig.authority`:** Server keypair (controlled by SolShot backend)
  - Can initialize config (one-time)
  - Can update config (move treasury/ops addresses, rotate authority)
  - Can pause/unpause program (emergency controls)
  - Can settle Active matches (validates winner via constraints)
  - Can cancel AwaitingDeposits matches (authority-only refund)
  - Receives PDA rent on `close` (settlement and cancellation)

- **`MatchEscrow.authority`:** Copied from authority signer at match creation (line 133)
  - Used for PDA derivation validation (Anchor's `has_one` constraint)

- **Players:** Can deposit wagers and cancel after timeout or in AwaitingDeposits

- **Permissionless Caller:** Can reclaim after 48h (DCA-02)

### State Machine Transitions

```
AwaitingDeposits
    ├─ (both deposit) → Active
    ├─ (authority calls cancel_match) → Cancelled [refund]
    └─ (player calls cancel_match in time) → Cancelled [refund]

Active
    ├─ (authority calls settle_match) → Settled [distribute]
    ├─ (player calls cancel_match after 24h) → Cancelled [refund]
    └─ (after 48h, permissionless reclaim) → Cancelled [refund]

Settled [terminal]

Cancelled [terminal]
```

---

## 8. Timing & Deadline Model (OC-07 Core)

### Timeout Reference Selection (Lines 321–326, 397–401)

All timeout calculations use **`activated_at` if > 0, else `created_at`**:
- `activated_at` is set when match transitions to Active (both players deposit)
- `created_at` is set at match creation
- Fallback to `created_at` ensures backward compat with matches created before OC-07 deployment

### Three Key Deadlines

1. **Settlement Deadline** (1 hour after activation)
   - Only applies if `activated_at > 0` (OC-07 defensive check, lines 236–244)
   - Formula: `activated_at + 3600 seconds`
   - Checked in `settle_match()`: if `now > deadline`, reject with `SettlementExpired`
   - Prevents stale settlements (resolution must happen within 1h of match start)

2. **Authority/Player Cancellation Deadline** (24 hours)
   - Formula: `timeout_reference + 86400 seconds` (lines 329–331)
   - Authority can cancel only in `AwaitingDeposits` state (no timeout check)
   - Players can cancel in `AwaitingDeposits` immediately or in any state after 24h
   - Checked in `cancel_match()` (lines 333, 341–344)

3. **Permissionless Reclaim Deadline** (48 hours)
   - Formula: `timeout_reference + 172800 seconds` (lines 404–406)
   - Anyone can reclaim (and receive PDA rent) after 48h
   - Checked in `permissionless_reclaim()` (lines 408–411)
   - Ensures no stuck escrows indefinitely

---

## 9. Arithmetic Safety (OC-09 Core)

All arithmetic uses **checked operations** to prevent overflow/underflow:

| Operation | Line | Type | Widening |
|-----------|------|------|----------|
| `total_pot = wager × 2` | 212–214 | `checked_mul` → Result | u64 → u64 |
| `total_pot = wager × 2` (settle) | 253–255 | `checked_mul` → Result | u64 → u128 |
| `treasury = total_pot × 700 / 10000` | 257–260 | `checked_mul` → Result | u128 (no overflow) |
| `ops = total_pot × 300 / 10000` | 262–265 | `checked_mul` → Result | u128 (no overflow) |
| `winner = total_pot - treasury - ops` | 270–274 | `checked_sub` (2×) | u64 → u64 |
| `deadline = activated_at + 3600` | 237–239 | `checked_add` → Result | i64 → i64 |
| `deadline = timeout_ref + 86400` | 329–331 | `checked_add` → Result | i64 → i64 |
| `deadline = timeout_ref + 172800` | 404–406 | `checked_add` → Result | i64 → i64 |

**Key Pattern (OC-09):**
- Max wager: 100 SOL = 100,000,000,000 lamports
- Max pot: 200 SOL = 200,000,000,000 lamports
- BPS calc: `200e9 × 700 / 10000 = 14e9` (safe in u128, overflows in u64)
- Solution: Widen to u128 for intermediate BPS calculations (lines 253–260)

---

## 10. Lamport Transfer Safety (OC-10)

**Defense-in-depth principle:** Set terminal state BEFORE transfers.

Example from `settle_match()` (lines 276–291):
```rust
// OC-10: set terminal state FIRST (before transfers)
{
    let escrow = &mut ctx.accounts.escrow;
    escrow.state = MatchState::Settled;
} // mutable borrow dropped

// Then perform transfers
**ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
**ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;
// ... treasury and ops transfers follow
```

**Rationale:**
- If any transfer panics or fails, state is already terminal
- Prevents re-entry attacks or repeated settlements
- Same pattern used in `cancel_match()` and `permissionless_reclaim()`

---

## 11. Focus Area Relevance Tags

### **Access Control** [HIGH]
- OC-01: Config initialization with distinct address validation
- OC-02: Winner validation (must be player_one or player_two)
- OC-03: Treasury/Ops validation against config PDA
- OC-05: Two-tier authorization for cancellation (authority vs. player)
- OC-06: Authority cannot be a player
- `has_one` constraints enforce authority signer on config/settlement
- Player authorization via constraint checks on player_one/player_two

**Findings Resolved:**
- H001, H002, H003, H008, S001, GAP-003, H048 (per comment lines 583–584)

### **Arithmetic Safety** [HIGH]
- OC-09: Checked arithmetic throughout (`checked_mul`, `checked_add`, `checked_sub`)
- u128 widening for BPS calculations (avoids overflow at max wager)
- Dust-loss prevention: winner gets remainder after treasury/ops deductions
- All fee calculations include overflow guards

**Findings Resolved:**
- BOK GAP-002 (u128 widening, line 252)

### **State Machine** [HIGH]
- OC-07: Temporal state tracking (activated_at timestamp)
- OC-10: Terminal state-before-transfer pattern
- Four-state lifecycle: AwaitingDeposits → Active → Settled/Cancelled
- Authorization logic depends on state (authority only in AwaitingDeposits)
- Timeout logic keyed on activated_at vs. created_at

**State Invariants:**
- Only `Active` matches can be settled
- Only non-terminal matches can be cancelled/reclaimed
- Cannot transition from terminal states

### **CPI & External** [MEDIUM]
- `system_program::transfer()` CPI in deposit_wager (lines 179–188)
- Lamport transfers via direct borrow manipulation (settle/cancel/reclaim)
- No SPL token interactions (SOL only)
- Clock access for timestamp: `Clock::get()?.unix_timestamp`

**Safety:**
- CPI context properly constructed with `to_account_info()`
- No nested CPIs (all transfers internal)
- Program owns all transferred lamports (escrow PDA is receiver/sender)

### **Token & Economic** [HIGH]
- Fee split: 90% winner, 7% treasury, 3% ops
- BPS-based calculation (hardcoded per litepaper v2.0)
- Min/max wager constraints (OC-08, OC-12)
- Rent reclamation incentivizes permissionless reclaim (DCA-02)

**Economic Invariants:**
- Total distributed ≤ total pot (no minting)
- Fees fixed at program level (cannot be changed without upgrade)
- No liquidity pool or swap logic (pure escrow)

### **Timing & Ordering** [HIGH]
- OC-07: Temporal window enforcement (1h settlement, 24h timeout, 48h permissionless)
- Activation timestamp gates settlement and cancellation deadlines
- Idempotent pause/unpause (no state dependency)
- Read-before-borrow pattern (lines 160–161, 314–319, 382–387) avoids borrow-checker conflicts

**Ordering Invariants:**
- Settlement deadline (1h) < Player cancellation timeout (24h) < Permissionless reclaim (48h)
- Ensures progressive access expansion (authority only → players → anyone)
- Prevents stuck escrows indefinitely

---

## 12. Audit Notes & Findings Cross-Reference

### OC Codes (On-Chain)
- **OC-01:** Initialize config with distinct addresses
- **OC-02:** Winner must be registered player (resolves H008, H002, S001)
- **OC-03:** Treasury/ops validation against config (resolves H001, H003, S001, GAP-003, H048)
- **OC-04:** Emergency pause/unpause guards all economic instructions
- **OC-05:** Two-tier cancellation (authority in AwaitingDeposits only)
- **OC-06:** Authority cannot be a player
- **OC-07:** Temporal deadlines (settlement 1h, cancellation 24h, reclaim 48h)
- **OC-08:** Min wager 0.00001 SOL (ensures fees ≥ 1 lamport)
- **OC-09:** Checked arithmetic throughout (resolves BOK GAP-002)
- **OC-10:** Set terminal state before transfers (defense-in-depth)
- **OC-11:** Settlement event includes treasury/ops pubkeys (on-chain monitoring)
- **OC-12:** Max wager 100 SOL (prevents unfundable escrow rent)

### DCA Codes (Design Consideration)
- **DCA-02:** Permissionless 48h reclaim with rent incentive (escape hatch)

### External References
- `.planning/phases/01-on-chain-program-redesign/01-RESEARCH.md` (Pitfall 6, Pitfall 3)
- `Cargo.toml`: Anchor 0.32.1, workspace with explicit path (`programs/solshot-escrow/`)
- `bn.js` imported directly (not from `@coral-xyz/anchor` due to breaking change in Anchor 0.32.1)

---

## 13. Deployment Notes

- **Program ID:** `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`
- **Keypair:** `target/deploy/solshot_escrow-keypair.json`
- **Pre-Deploy:** Must call `initialize_config()` once with deployer + treasury + ops pubkeys
- **Production:** Transfer upgrade authority to multisig (see comment line 1, OC-13)
- **IDL:** Canonical at `server/idl/solshot_escrow.json` (copied from `target/idl/` after build)

