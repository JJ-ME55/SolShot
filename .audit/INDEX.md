# Audit Codebase Index

**Generated:** 2026-05-06
**Files indexed:** 2
**Total LOC:** 1982

## File Summary Table

| File | LOC | Instructions | Account Structs | State Account Types | Const Block Range | Error Enum Range |
|------|-----|--------------|-----------------|---------------------|-------------------|------------------|
| `programs/solshot-escrow/src/lib.rs` | 962 | 8 | 8 | 2 (GlobalConfig, MatchEscrow) | 10-32 | 913-962 |
| `programs/solshot-escrow-v2/src/lib.rs` | 1020 | 8 | 8 | 2 (GlobalConfig, MatchEscrow) | 30-51 | 962-1020 |

---

## File 1: programs/solshot-escrow/src/lib.rs (v1)

### Module Layout
| Section | Line Range | Description |
|---------|-----------|-------------|
| Imports | 4-5 | anchor_lang, system_program |
| Constants | 10-32 | 7 constants (hardcoded treasury/ops BPS, timeouts, wager bounds) |
| Module `solshot_escrow` | 38-537 | 8 pub fn instructions |
| Account structs (`#[derive(Accounts)]`) | 543-777 | 8 account-validation structs |
| State accounts (`#[account]`) | 783-855 | 2 state structs (GlobalConfig, MatchEscrow); 1 enum (MatchState) |
| Events | 860-907 | 6 event types |
| Errors enum | 913-962 | 20 error variants |

### Instructions
| Name | Line Range | Signers | PDA Touched | CPI? | Notes |
|------|-----------|---------|-------------|------|-------|
| initialize_config | 47-65 | payer | config (init) | no | One-time global config setup; validates authority/treasury/ops distinctness |
| update_config | 72-108 | authority | config (mut) | no | Authority-gated config field update; re-validates after all updates |
| pause_program | 112-115 | authority | config (mut) | no | Sets is_paused = true; idempotent; may be called twice |
| unpause_program | 119-122 | authority | config (mut) | no | Sets is_paused = false; idempotent |
| create_match | 130-182 | authority | escrow (init), config | no | Seeds: ["match", match_id.as_bytes()]; 2-4 players; validates distinctness + authority exclusion |
| deposit_wager | 187-252 | player | escrow (mut), config | yes (system_program::transfer) | Bitmap tracks per-player deposits; activates match when all deposited |
| settle_match | 258-338 | authority | escrow (mut, close), config | no | N-player pot calculation; 90/7/3 BPS split; closes escrow account |
| cancel_match | 344-419 | caller (authority or player) | escrow (mut, close), config | no | Authority-only AwaitingDeposits, players anytime after timeout; remaining_accounts for refunds |
| permissionless_reclaim | 425-487 | caller (any) | escrow (mut, close), config | no | 2x timeout (1200s) grace; anyone can trigger; remaining_accounts for refunds |
| start_with_depositors | 493-536 | authority | escrow (mut), config | no | Activate with partial deposits; compact players array; requires min 2 |

### Account Structs (`#[derive(Accounts)]`)
| Struct Name | Line Range | Used By Instruction | Account Count | Notable Constraints |
|-------------|-----------|---------------------|----------------|---------------------|
| InitializeConfig | 544-559 | initialize_config | 3 | init config; payer signer; system_program |
| UpdateConfig | 562-573 | update_config | 2 | config has_one = authority; authority signer |
| PauseProgram | 576-588 | pause_program | 2 | config has_one = authority; authority signer; config NOT checked is_paused |
| UnpauseProgram | 591-603 | unpause_program | 2 | config has_one = authority; authority signer; config NOT checked is_paused |
| CreateMatch | 606-631 | create_match | 4 | escrow init with match_id seed; authority signer; config constraint = !is_paused |
| DepositWager | 634-655 | deposit_wager | 4 | escrow mut (no close); player signer; config constraint = !is_paused |
| SettleMatch | 658-709 | settle_match | 6 | escrow mut + close = authority; authority signer; winner/treasury/ops all UncheckedAccount with constraints |
| CancelMatch | 712-735 | cancel_match | 4 | escrow mut + close = caller; caller signer; remaining_accounts for deposited players |
| PermissionlessReclaim | 738-754 | permissionless_reclaim | 3 | escrow mut + close = caller; caller signer; remaining_accounts for deposited players |
| StartWithDepositors | 757-777 | start_with_depositors | 3 | escrow mut (no close); authority signer; config has_one = authority |

### State Account Types (`#[account]` structs)
| Type Name | Line Range | SPACE | Fields (key ones) | Notes |
|-----------|-----------|-------|-------------------|-------|
| GlobalConfig | 787-804 | 106 bytes | authority, treasury, ops, is_paused (bool), bump | Singleton PDA; seeds = [b"config"] |
| MatchEscrow | 807-847 | 232 bytes | match_id (String), authority, players [Pubkey; 4], max_players (u8), wager_lamports, deposits_mask (u8), state (MatchState enum), created_at (i64), activated_at (i64), bump | Per-match escrow; max 4 players |

### Constants
| Name | Line | Value | Type | Purpose |
|------|------|-------|------|---------|
| TREASURY_BPS | 15 | 700 | u64 | 7% of pot to treasury (hardcoded) |
| OPS_BPS | 16 | 300 | u64 | 3% of pot to ops (hardcoded) |
| BPS_DENOMINATOR | 17 | 10000 | u64 | Basis point divisor |
| TIMEOUT_SECONDS | 20 | 600 | i64 | 10-minute deposit window timeout |
| PERMISSIONLESS_RECLAIM_TIMEOUT | 23 | 1200 (2x TIMEOUT_SECONDS) | i64 | 20-minute permissionless reclaim grace |
| SETTLEMENT_TIMEOUT_SECONDS | 26 | 3600 | i64 | 1-hour settlement deadline after activation |
| MIN_WAGER_LAMPORTS | 29 | 10_000 | u64 | 0.00001 SOL minimum |
| MAX_WAGER_LAMPORTS | 32 | 100_000_000_000 | u64 | 100 SOL maximum |

### State Enums
| Name | Line Range | Variants | Purpose |
|------|-----------|----------|---------|
| MatchState | 849-855 | AwaitingDeposits, Active, Settled, Cancelled | Match lifecycle state machine |

### Error Variants
Count: 20 variants; Line range: 913-962
(MatchIdTooLong, ZeroWager, SamePlayer, InvalidState, NotAPlayer, AlreadyDeposited, InvalidWinner, Unauthorized, InvalidPlayer, AuthorityAsPlayer, WagerTooSmall, WagerTooLarge, InvalidTreasury, InvalidOps, DuplicateFeeAccount, ProgramPaused, ArithmeticOverflow, InvalidConfig, SettlementExpired, TooEarlyToReclaim, TooFewPlayers, TooManyPlayers, MatchAlreadyStarted)

---

## File 2: programs/solshot-escrow-v2/src/lib.rs (v2)

### Module Layout
| Section | Line Range | Description |
|---------|-----------|-------------|
| Imports | 18-19 | anchor_lang, system_program |
| Constants | 27-51 | 10 constants (min/max players, durations, windows, fees, reclaim grace) |
| Module `solshot_escrow_v2` | 57-579 | 8 pub fn instructions |
| Account structs (`#[derive(Accounts)]`) | 585-803 | 8 account-validation structs |
| State accounts (`#[account]`) | 809-897 | 2 state structs (GlobalConfig, MatchEscrow); 1 enum (MatchState) |
| Events | 903-956 | 6 event types |
| Errors enum | 962-1020 | 26 error variants |

### Instructions
| Name | Line Range | Signers | PDA Touched | CPI? | Notes |
|------|-----------|---------|-------------|------|-------|
| initialize_config | 65-91 | payer | config (init) | no | Stores authority/treasury/ops PLUS fee_bps_treasury/ops (hardcoded 700/300 equiv in v1) |
| update_config | 96-142 | authority | config (mut) | no | Authority-gated; all params optional; updates fee BPS; affects NEW matches only |
| pause_program | 146-149 | authority | config (mut) | no | Sets is_paused = true; does NOT block settle/cancel/reclaim (funds can exit) |
| unpause_program | 151-154 | authority | config (mut) | no | Sets is_paused = false |
| create_match | 161-235 | authority | escrow (init), config | no | Seeds: ["match", match_id.as_bytes()]; 2-10 players; snapshots treasury/ops/bps from config; enforces duration + deposit_window bounds |
| deposit_wager | 239-318 | player | escrow (mut), config | yes (system_program::transfer) | Hard deadline on deposit_window; u16 deposits_mask (supports 16+); auto-activates + sets match_end_ts on full deposits |
| settle_match | 387-454 | authority | escrow (mut, close), config | no | Uses SNAPSHOT fee BPS + pubkeys (not live config); no settlement deadline; N-player pot |
| cancel_match | 459-519 | caller (authority or player) | escrow (mut, close), config | no | Player timeout = match_end_ts if Active, deposit_deadline if AwaitingDeposits; pause does NOT block |
| permissionless_reclaim | 526-578 | caller (any) | escrow (mut, close), config | no | Trigger = match_end_ts + 24h (or deposit_deadline + 24h if not activated); public grace window |
| start_with_depositors | 323-382 | authority | escrow (mut), config | no | Only after deposit_window closes; prevents prematurely kicking undeposited players; sets match_end_ts |

### Account Structs (`#[derive(Accounts)]`)
| Struct Name | Line Range | Used By Instruction | Account Count | Notable Constraints |
|-------------|-----------|---------------------|----------------|---------------------|
| InitializeConfig | 586-600 | initialize_config | 3 | init config; payer signer; system_program |
| UpdateConfig | 603-613 | update_config | 2 | config has_one = authority; authority signer |
| PauseProgram | 616-626 | pause_program | 2 | config has_one = authority; authority signer |
| UnpauseProgram | 629-639 | unpause_program | 2 | config has_one = authority; authority signer |
| CreateMatch | 642-665 | create_match | 4 | escrow init with match_id seed; authority signer; config constraint = !is_paused |
| DepositWager | 668-687 | deposit_wager | 4 | escrow mut (no close); player signer; config constraint = !is_paused |
| SettleMatch | 690-740 | settle_match | 6 | escrow mut + close = authority; authority signer; winner/treasury/ops UncheckedAccount; NOTE: treasury/ops constraints use escrow.treasury_snapshot/ops_snapshot (not config) |
| CancelMatch | 743-765 | cancel_match | 4 | escrow mut + close = caller; caller signer; config read-only (for authority check); pause does NOT constrain |
| PermissionlessReclaim | 768-782 | permissionless_reclaim | 3 | escrow mut + close = caller; caller signer; remaining_accounts for deposited players |
| StartWithDepositors | 785-803 | start_with_depositors | 3 | escrow mut (no close); authority signer; config constraint = !is_paused |

### State Account Types (`#[account]` structs)
| Type Name | Line Range | SPACE | Fields (key ones) | Notes |
|-----------|-----------|-------|-------------------|-------|
| GlobalConfig | 810-824 | 110 bytes | authority, treasury, ops, fee_bps_treasury (u16), fee_bps_ops (u16), is_paused (bool), bump | Singleton PDA; stores configurable fees |
| MatchEscrow | 828-889 | 509 bytes | match_id (String), authority, players [Pubkey; 10], max_players (u8), wager_lamports, deposits_mask (u16), duration_secs (u32), deposit_window_secs (u32), treasury_snapshot, ops_snapshot, fee_bps_treasury_snapshot (u16), fee_bps_ops_snapshot (u16), state (MatchState enum), created_at (i64), activated_at (i64), match_end_ts (i64), bump | Per-match escrow; max 10 players; snapshots config at create |

### Constants
| Name | Line | Value | Type | Purpose |
|------|------|-------|------|---------|
| MIN_PLAYERS | 30 | 2 | u8 | Minimum player count |
| MAX_PLAYERS | 31 | 10 | usize | Maximum player count (v2 upgrade from v1's 4) |
| MIN_WAGER_LAMPORTS | 34 | 10_000 | u64 | 0.00001 SOL minimum |
| MAX_WAGER_LAMPORTS | 35 | 100_000_000_000 | u64 | 100 SOL maximum |
| MIN_DURATION_SECS | 38 | 60 | u32 | 1-minute match duration minimum |
| MAX_DURATION_SECS | 39 | 604_800 | u32 | 7-day match duration maximum |
| MIN_DEPOSIT_WINDOW_SECS | 42 | 60 | u32 | 1-minute deposit window minimum |
| MAX_DEPOSIT_WINDOW_SECS | 43 | 86_400 | u32 | 24-hour deposit window maximum |
| PUBLIC_REFUND_GRACE_SECS | 47 | 86_400 | i64 | 24-hour permissionless reclaim grace |
| MAX_FEE_BPS | 50 | 1_000 | u16 | 10% combined fee cap (treasury + ops) |
| BPS_DENOMINATOR | 51 | 10_000 | u128 | Basis point divisor |

### State Enums
| Name | Line Range | Variants | Purpose |
|------|-----------|----------|---------|
| MatchState | 891-897 | AwaitingDeposits, Active, Settled, Cancelled | Match lifecycle state machine (identical to v1) |

### Error Variants
Count: 26 variants; Line range: 962-1020
(MatchIdTooLong, SamePlayer, InvalidState, NotAPlayer, AlreadyDeposited, InvalidWinner, Unauthorized, InvalidPlayer, AuthorityAsPlayer, WagerTooSmall, WagerTooLarge, InvalidTreasury, InvalidOps, DuplicateFeeAccount, FeesTooHigh, ProgramPaused, ArithmeticOverflow, InvalidConfig, TooEarlyToReclaim, TooFewPlayers, TooManyPlayers, DurationTooShort, DurationTooLong, DepositWindowTooShort, DepositWindowTooLong, DepositWindowClosed, DepositWindowOpen, MatchAlreadyStarted)

---

## Cross-File Comparison: v1 vs v2

| Aspect | v1 | v2 |
|--------|-----|-----|
| **Players** | Fixed 2-4 (`[Pubkey; 4]`) | 2-10 (`[Pubkey; 10]`) |
| **Deposits mask** | u8 (max 8 bits) | u16 (max 16 bits) |
| **Fee BPS** | Hardcoded 700/300 (const) | Configurable per account (stored in GlobalConfig); snapshotted at create |
| **MAX_FEE_BPS** | (implicit 1000) | Explicit 1000 (10%) cap in constraints |
| **Settlement deadline** | SETTLEMENT_TIMEOUT_SECONDS (3600s) after activation; enforced at settle | None (server can settle anytime after activation) |
| **Match duration** | Implicit (timeout-based) | Explicit per-match duration_secs (60s–7d); locks match_end_ts on activation |
| **Deposit window** | Soft 10-min timeout (TIMEOUT_SECONDS); can still deposit after if match not yet active | Hard per-match deposit_window_secs (60s–24h); rejects deposits after deadline |
| **Reclaim grace** | 2x TIMEOUT (1200s = 20 min) | match_end_ts + 24h (or deposit_deadline + 24h if not activated); much longer |
| **Config immutability** | N/A (hardcoded) | Changes affect only NEW matches (v2 snapshots at create_match) |
| **Pause behavior** | Blocks all economic operations | Does NOT block settle/cancel/reclaim (funds can always exit) |
| **start_with_depositors gate** | No explicit gate; can activate anytime if >=2 deposited | Only after deposit_window closes (prevents silent kicks) |
| **GlobalConfig SPACE** | 106 bytes | 110 bytes (+4 for two u16 fee fields) |
| **MatchEscrow SPACE** | 232 bytes | 509 bytes (+277 for 10-player array, duration/window, snapshots, match_end_ts) |

### Notable Differences in Logic

- **v1**: All players must deposit OR timeout; activate only at 100%; treasury/ops read from live config at settle time
- **v2**: Can activate early at 100%, OR after deposit window closes with partial deposits; treasury/ops frozen at create_match; match_end_ts powers predictable timeout windows
- **v1**: 1-hour settlement window (time-gated); v2 settles anytime (server-driven, no deadline)
- **v1**: deposit_wager activates immediately on full deposits; v2 also sets match_end_ts = now + duration_secs
- **v1**: permissionless_reclaim at created_at + 1200s (fixed 20 min); v2 at match_end_ts + 86400s (dynamically 24h after match expires)
