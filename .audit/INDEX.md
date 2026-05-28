# Codebase Index — SolShot Escrow Programs

## Audit Scope

Two Solana Anchor programs (v1 and v2 of the SolShot escrow escrow contract):
- **v1**: Fixed 2-4 player matches, hardcoded fees (90/7/3 BPS), 1-hour settlement/deposit timeouts
- **v2**: Configurable 2-10 player matches, per-match duration/deposit windows, configurable fees, Bundle 1 governance (2-step authority rotation + 24h config timelock)

**Audit focus**: Bundle 1 (v2 only) — governance/configuration additions since the previous audit (commit 226c0cd).

---

## File: programs/solshot-escrow/src/lib.rs
**LOC:** 1,027 | **Modified since audit #2 (226c0cd):** YES (+97 lines, hardening fixes)
**Program ID:** `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`

### Constants

| Name | Line | Value | Notes |
|---|---|---|---|
| `TREASURY_BPS` | 15 | `700` | Settlement split — winner 90%, treasury 7% |
| `OPS_BPS` | 16 | `300` | Ops fee 3% of pot |
| `BPS_DENOMINATOR` | 17 | `10_000` | Fixed-point denominator for fee calculations |
| `TIMEOUT_SECONDS` | 22 | `3_600` | 1-hour timeout for deposit window + player cancel (was 600s pre-OC-10) |
| `PERMISSIONLESS_RECLAIM_TIMEOUT` | 26 | `7_200` | 2x normal timeout (H040 fix: docstring/math alignment) |
| `SETTLEMENT_TIMEOUT_SECONDS` | 29 | `3_600` | 1-hour settlement deadline after activation (OC-07) |
| `MIN_DEPOSIT_WINDOW_SECS` | 33 | `600` | 10-minute minimum before authority can activate partial match (H017) |
| `MIN_WAGER_LAMPORTS` | 36 | `10_000` | 0.00001 SOL — ensures both fees ≥ 1 lamport (OC-08) |
| `MAX_WAGER_LAMPORTS` | 39 | `100_000_000_000` | 100 SOL max (OC-12) |

### Instructions

| Name | Lines | Purpose | Context Struct | Authority Gate | Lamports | Notes |
|---|---|---|---|---|---|---|
| `initialize_config` | 54–72 | One-shot config init; validates authority/treasury/ops distinctness (OC-01) | `InitializeConfig` | payer signs | rent | Sets up global config PDA; called once after deploy |
| `update_config` | 79–115 | Update authority/treasury/ops addresses; optional params; re-validates distinctness (H003); emits event (B1-mini) | `UpdateConfig` | authority signs (`has_one`) | none | Guards against accidental governance burn (B1-mini: zero-address check on authority) |
| `pause_program` | 121–127 | Emergency pause; halts new commitments (OC-04, H016 fix: doesn't block exits) | `PauseProgram` | authority signs | none | Idempotent; emits `Paused` event (H043) |
| `unpause_program` | 132–138 | Emergency unpause; resumes new commitments | `UnpauseProgram` | authority signs | none | Idempotent; emits `Unpaused` event (H043) |
| `create_match` | 146–198 | Create N-player match escrow (2-4 players); validates player distinctness, authority exclusion, wager bounds | `CreateMatch` | authority signs (config `has_one`) | rent + init space | Pause guard enforced via config constraint (OC-04, S004) |
| `deposit_wager` | 203–268 | Player deposits wager; updates bitmap; activates match when all deposited (OC-04, OC-07, OC-09, ESC-05) | `DepositWager` | player signs | transfer lamports | Rust borrow checker safety: reads values BEFORE mutable borrow (Pitfall 3) |
| `settle_match` | 274–354 | Distribute pot (90/7/3 BPS split) to winner/treasury/ops using N-player math; deadline check (OC-07, OC-10 defense-in-depth) | `SettleMatch` | authority signs | lamport transfers | u128 widening for BPS math (BOK GAP-002, OC-09); terminal state set BEFORE transfers (OC-10) |
| `cancel_match` | 360–443 | Refund deposited players via remaining_accounts; authority can only cancel AwaitingDeposits; players can cancel after timeout | `CancelMatch` | caller (authority or player) | refund transfers | H023 fix: requires complete refund list (exact count_ones match); defense-in-depth state set BEFORE transfers |
| `permissionless_reclaim` | 449–517 | Anyone can refund after 2x timeout (DCA-02, ESC-09); caller gets PDA rent as incentive | `PermissionlessReclaim` | any signer (permissionless) | refund + rent sweep | H023 fix: same complete-refund gate; timeout reference uses activated_at or created_at |
| `start_with_depositors` | 523–576 | Activate match with partial deposits; compacts array; enforces MIN_DEPOSIT_WINDOW_SECS gate (H017) | `StartWithDepositors` | authority signs (escrow `has_one`) | none | H009 fix: no pause guard so partial activation always works |

### Account Contexts

| Name | Lines | Fields & Constraints | Notes |
|---|---|---|---|
| `InitializeConfig` | 584–599 | `config`: `init`, `payer=payer`, `space=GlobalConfig::SPACE`, `seeds=[b"config"]`, `bump` | Payer funds account; payer signer required |
| `UpdateConfig` | 601–613 | `config`: `mut`, `seeds=[b"config"]`, `has_one=authority` | Authority-gated modification |
| `PauseProgram` | 617–628 | `config`: `mut`, `seeds=[b"config"]`, `has_one=authority` | Authority signer enforced |
| `UnpauseProgram` | 632–643 | `config`: `mut`, `seeds=[b"config"]`, `has_one=authority` | Authority signer enforced |
| `CreateMatch` | 645–671 | `escrow`: `init`, `payer=authority`, `seeds=[b"match", match_id.as_bytes()]`; `config`: `seeds=[b"config"]`, `has_one=authority`, `!is_paused` (S004) | Match PDA initialized; pause guard present (OC-04) |
| `DepositWager` | 673–695 | `escrow`: `mut`, `seeds=[b"match", escrow.match_id.as_bytes()]`; `config`: `seeds=[b"config"]`, `!is_paused` | Player signer required; pause guard present (OC-04) |
| `SettleMatch` | 697–754 | `escrow`: `mut`, `close=authority`, `seeds=[b"match", ...]`; `winner`: `UncheckedAccount`, `!executable` (H025), constraint vs `escrow.players`; `treasury`/`ops`: `UncheckedAccount`, `!executable`, constraint vs `config` | Fee accounts validated against config (H025 executable check prevents lamport burn) |
| `CancelMatch` | 756–781 | `escrow`: `mut`, `close=caller`, `seeds=[b"match", ...]`; `config`: `seeds=[b"config"]` (no `has_one`, no pause guard — H016) | Caller receives PDA rent; no pause guard so escape hatch always works |
| `PermissionlessReclaim` | 783–800 | `escrow`: `mut`, `close=caller`, `seeds=[b"match", ...]` | Permissionless (no signer gate on anyone other than caller); caller gets rent |
| `StartWithDepositors` | 806–825 | `escrow`: `mut`, `has_one=authority`, `seeds=[b"match", ...]`; `config`: `seeds=[b"config"]`, `has_one=authority` (no pause guard — H009) | No pause guard so partial activation always callable |

### State Accounts

| Name | Lines | Fields | SPACE |
|---|---|---|---|
| `GlobalConfig` | 834–852 | `authority: Pubkey`, `treasury: Pubkey`, `ops: Pubkey`, `is_paused: bool`, `bump: u8` | 106 bytes (8 disc + 32×3 + 1 + 1) |
| `MatchEscrow` | 854–895 | `match_id: String`, `authority: Pubkey`, `players: [Pubkey; 4]`, `max_players: u8`, `wager_lamports: u64`, `deposits_mask: u8`, `state: MatchState`, `created_at: i64`, `activated_at: i64`, `bump: u8` | 232 bytes; fixed 4-player array with zero-padding for < 4 |

### Match State Enum

| Variant | Line | Meaning |
|---|---|---|
| `AwaitingDeposits` | 899 | Before all players deposit or authority activates |
| `Active` | 900 | All players deposited or authority activated partial match |
| `Settled` | 901 | Winner received payment; terminal |
| `Cancelled` | 902 | Refunded all players; terminal |

### Events

| Name | Lines | Fields |
|---|---|---|
| `MatchCreated` | 910–915 | `match_id`, `players: Vec<Pubkey>`, `max_players`, `wager_lamports` |
| `WagerDeposited` | 918–922 | `match_id`, `player`, `amount` |
| `MatchActive` | 925–928 | `match_id`, `total_pot` |
| `MatchSettled` | 932–940 | `match_id`, `winner`, `winner_amount`, `treasury_account`, `treasury_amount`, `ops_account`, `ops_amount` (OC-11) |
| `MatchCancelled` | 943–947 | `match_id`, `players`, `deposits_mask` |
| `ConfigUpdated` | 951–955 | `authority`, `treasury`, `ops` (B1-mini audit trail) |
| `Paused` | 959–961 | `authority` (H043) |
| `Unpaused` | 964–966 | `authority` (H043) |

### Errors (36 variants)

| Name | Line | Category | Key Fixes |
|---|---|---|---|
| `MatchIdTooLong` | 974 | Input validation | Max 32 chars |
| `ZeroWager` | 976 | Input validation | Wager > 0 |
| `SamePlayer` | 978 | Player validation | Players must be distinct (ESC-03) |
| `InvalidState` | 980 | State machine | Invalid transition |
| `NotAPlayer` | 982 | Access control | Signer not in match |
| `AlreadyDeposited` | 984 | Idempotency | Bitmap check prevents double-deposit |
| `InvalidWinner` | 986 | Validation | Must be one of registered players (OC-02, ESC-07, H008) |
| `Unauthorized` | 988 | Access control | Caller lacks authority |
| `InvalidPlayer` | 990 | Validation | Account doesn't match escrow record |
| `AuthorityAsPlayer` | 993 | Validation | Authority cannot play (ESC-03) |
| `WagerTooSmall` | 995 | Validation | Below MIN_WAGER_LAMPORTS (OC-08) |
| `WagerTooLarge` | 997 | Validation | Above MAX_WAGER_LAMPORTS (OC-12) |
| `InvalidTreasury` | 999 | Config validation | Doesn't match config.treasury (OC-03, H001, S001) |
| `InvalidOps` | 1001 | Config validation | Doesn't match config.ops (OC-03) |
| `DuplicateFeeAccount` | 1003 | Config validation | Treasury == ops (H003 defense-in-depth) |
| `ProgramPaused` | 1005 | Pause gate | New commitments blocked |
| `ArithmeticOverflow` | 1007 | Math safety | Overflow in fee/pot calc |
| `InvalidConfig` | 1009 | Config validation | General config constraint |
| `SettlementExpired` | 1011 | Deadline | Settlement window closed (OC-07) |
| `TooEarlyToReclaim` | 1013 | Deadline | 2x timeout not yet elapsed |
| `TooFewPlayers` | 1015 | Player count | < 2 (ESC-14) |
| `TooManyPlayers` | 1017 | Player count | > 4 (ESC-14) |
| `MatchAlreadyStarted` | 1019 | State | Cannot re-activate |
| `IncompleteRefund` | 1021 | Validation | H023 fix: must refund all deposited players |
| `DepositWindowOpen` | 1023 | Deadline | H017 fix: MIN_DEPOSIT_WINDOW_SECS not yet elapsed |
| `ExecutableNotAllowed` | 1025 | Validation | H025 fix: prevents lamport burn on executable accounts (EP-106) |

---

## File: programs/solshot-escrow-v2/src/lib.rs
**LOC:** 1,423 | **Modified since audit #2 (226c0cd):** YES (+449 lines, Bundle 1)
**Program ID:** `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`

### Constants

| Name | Line | Value | Notes |
|---|---|---|---|
| `MIN_PLAYERS` | 30 | `2` | N-player lower bound |
| `MAX_PLAYERS` | 31 | `10` | N-player upper bound (was 4 in v1) |
| `MIN_WAGER_LAMPORTS` | 34 | `10_000` | Same as v1 |
| `MAX_WAGER_LAMPORTS` | 35 | `100_000_000_000` | Same as v1 |
| `MIN_DURATION_SECS` | 41 | `60` | 1 min (supports real-time mode) |
| `MAX_DURATION_SECS` | 42 | `86_400` | 24h (H039 fix: was 7 days, reduced for griefing surface) |
| `MIN_DEPOSIT_WINDOW_SECS` | 45 | `60` | 1 min |
| `MAX_DEPOSIT_WINDOW_SECS` | 46 | `86_400` | 24h |
| `PUBLIC_REFUND_GRACE_SECS` | 50 | `86_400` | 24h post-match_end_ts (v2-specific; was 2x timeout in v1) |
| `MAX_FEE_BPS` | 53 | `1_000` | 10% combined treasury + ops fee cap |
| `BPS_DENOMINATOR` | 54 | `10_000` | Fixed-point for fee math |
| `CONFIG_TIMELOCK_SECS` | 61 | `86_400` | **S2-T1 (Bundle 1)**: 24h between `update_config` propose and `apply_config_update` apply |

### Instructions

| Name | Lines | Purpose | Context Struct | Authority Gate | Lamports | **Bundle 1?** |
|---|---|---|---|---|---|---|
| `initialize_config` | 75–101 | One-shot config init (v2: includes fee BPS params) | `InitializeConfig` | payer signs | rent | No |
| `update_config` | 115–168 | **S2-T1**: Propose pending treasury/ops/fee BPS changes (no apply yet); validates effective state; emits `ConfigProposed` event | `UpdateConfig` | authority signs | none | **NEW** |
| `migrate_config` | 184–239 | **S2-T2**: Devnet-only PDA realloc from old SPACE (110) to new SPACE (231); manual authority verification; zero-fills new bytes | `MigrateConfigUnchecked` | authority signs | lamports for rent top-up | **NEW** |
| `apply_config_update` | 245–293 | **S2-T1**: Permissionless apply of pending changes after CONFIG_TIMELOCK_SECS; re-validates; emits `ConfigApplied` event | `ApplyConfigUpdate` | any signer (payer for tx fee) | none | **NEW** |
| `propose_authority` | 302–318 | **S2-T1**: Step 1 of 2-step authority rotation; current authority proposes new key (no timelock); overwrites prior pending; emits `AuthorityProposed` | `ProposeAuthority` | authority signs | none | **NEW** |
| `accept_authority` | 326–348 | **S2-T1**: Step 2 of authority rotation; NEW key signs to claim authority; re-validates distinctness; emits `AuthorityAccepted` | `AcceptAuthority` | new_authority signs | none | **NEW** |
| `pause_program` | 353–359 | Emergency pause (matches v1) | `PauseProgram` | authority signs | none | No |
| `unpause_program` | 362–368 | Emergency unpause (matches v1) | `UnpauseProgram` | authority signs | none | No |
| `create_match` | 375–449 | Create N-player match (2-10); snapshotted treasury/ops/fee BPS at create; accept duration/deposit_window params | `CreateMatch` | authority signs (config `has_one`) | rent + init | No |
| `deposit_wager` | 453–535 | Player deposits; hard deposit-window deadline (H018 strict `<` fix); activates match when all deposited; sets match_end_ts | `DepositWager` | player signs | transfer lamports | No |
| `settle_match` | 604–671 | Distribute pot using SNAPSHOTTED BPS + pubkeys (no config dependency); N-player pot math; no deadline check (authority can settle anytime) | `SettleMatch` | authority signs | lamport transfers | No |
| `cancel_match` | 676–744 | Refund deposited players; authority can only cancel AwaitingDeposits; players can cancel AwaitingDeposits or after player_cancel_deadline (deposit_deadline or match_end) | `CancelMatch` | caller (authority or player) | refund transfers | No |
| `permissionless_reclaim` | 751–811 | Permissionless refund after public-grace window (match_end_ts + 24h or deposit_deadline + 24h); caller gets rent | `PermissionlessReclaim` | any signer | refund + rent sweep | No |
| `start_with_depositors` | 540–599 | Activate match with partial deposits; compacts array; deposit-window deadline must have closed | `StartWithDepositors` | authority signs (escrow `has_one`) | none | No |

### Account Contexts (Bundle 1 additions highlighted)

| Name | Lines | Fields & Constraints | **Bundle 1?** |
|---|---|---|---|
| `InitializeConfig` | 818–833 | Standard init structure | No |
| `UpdateConfig` | 835–846 | `config`: `mut`, `has_one=authority` | No |
| **`MigrateConfigUnchecked`** | **856–871** | `config`: `UncheckedAccount` (manual deserialization), `mut`, `seeds=[b"config"]`; authority verified by reading raw data at [8..40] | **NEW** |
| **`ApplyConfigUpdate`** | **878–888** | `config`: `mut`, `seeds=[b"config"]`; `payer`: `mut` (any signer, permissionless); no `has_one` gate — timelock check only in instruction body | **NEW** |
| **`ProposeAuthority`** | **892–902** | `config`: `mut`, `has_one=authority`; `authority`: signer | **NEW** |
| **`AcceptAuthority`** | **908–917** | `config`: `mut`, `seeds=[b"config"]`; `new_authority`: signer (must match pending_authority); no `has_one` gate | **NEW** |
| `PauseProgram` | 919–930 | Standard authority-gated structure | No |
| `UnpauseProgram` | 932–943 | Standard authority-gated structure | No |
| `CreateMatch` | 945–969 | Match PDA init; authority-gated via config | No |
| `DepositWager` | 971–991 | Player-signed deposit; pause guard present | No |
| `SettleMatch` | 993–1048 | Winner/treasury/ops constraints vs ESCROW SNAPSHOTS (not config) | No |
| `CancelMatch` | 1050–1073 | Caller-signed refund; no pause guard | No |
| `PermissionlessReclaim` | 1075–1090 | Permissionless caller; no signer gate | No |
| `StartWithDepositors` | 1092–1111 | Authority-gated via escrow; pause guard present (unlike v1's H009 fix) | No |

### State Accounts

| Name | Lines | Fields | SPACE |
|---|---|---|---|
| **`GlobalConfig`** | **1117–1171** | **Live:** `authority`, `treasury`, `ops`, `fee_bps_treasury`, `fee_bps_ops`, `is_paused`, `bump`; **S2-T1 NEW:** `pending_authority: Option<Pubkey>`, `pending_treasury`, `pending_ops`, `pending_fee_bps_treasury`, `pending_fee_bps_ops`, `pending_config_ts: i64`, `last_config_update_ts: i64` | **231 bytes** (was 110 pre-Bundle 1; +121 bytes for pending fields + timestamps) |
| `MatchEscrow` | 1173–1236 | `match_id: String`, `authority: Pubkey`, `players: [Pubkey; 10]` (was [4]), `max_players: u8`, `wager_lamports: u64`, `deposits_mask: u16` (was u8), `duration_secs: u32`, `deposit_window_secs: u32`, `treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot: u16`, `fee_bps_ops_snapshot: u16`, `state`, `created_at: i64`, `activated_at: i64`, `match_end_ts: i64`, `bump: u8` | **509 bytes** (was 232 in v1; +277 bytes for snapshots, duration fields, 10-player array) |

### Bundle 1: GlobalConfig Structure Changes

**Pre-S2-T1 layout (110 bytes):**
```
8       discriminator
32      authority
32      treasury
32      ops
2       fee_bps_treasury
2       fee_bps_ops
1       is_paused
1       bump
───────
110     total
```

**Post-S2-T1 layout (231 bytes):**
```
[Previous 110 bytes unchanged]
1 + 32  pending_authority: Option<Pubkey>
1 + 32  pending_treasury
1 + 32  pending_ops
1 + 2   pending_fee_bps_treasury
1 + 2   pending_fee_bps_ops
8       pending_config_ts
8       last_config_update_ts
───────
231     total
```

**`migrate_config` procedure:**
1. Read authority pubkey manually from raw account data at offset [8..40] (old layout known)
2. Verify signer == stored authority
3. Realloc to 231 bytes; top up rent if needed
4. Zero-fill bytes [current_size..new_size] so new Option fields read as None (discriminant 0) and i64 fields read as 0

### Match State Enum (unchanged)

| Variant | Meaning |
|---|---|
| `AwaitingDeposits` | Before full deposit or authority activation |
| `Active` | Activated; match_end_ts set |
| `Settled` | Terminal; pot distributed |
| `Cancelled` | Terminal; players refunded |

### Events

| Name | Lines | Fields | **Bundle 1?** |
|---|---|---|---|
| `MatchCreated` | 1250–1262 | `match_id`, `players`, `max_players`, `wager_lamports`, `duration_secs`, `deposit_window_secs`, `treasury` (snapshot), `ops` (snapshot), `fee_bps_treasury`, `fee_bps_ops` | No |
| `WagerDeposited` | 1264–1269 | `match_id`, `player`, `amount` | No |
| `MatchActive` | 1271–1276 | `match_id`, `total_pot`, `match_end_ts` | No |
| `MatchSettled` | 1278–1287 | `match_id`, `winner`, `winner_amount`, `treasury_account`, `treasury_amount`, `ops_account`, `ops_amount` | No |
| `MatchCancelled` | 1289–1294 | `match_id`, `players`, `deposits_mask: u16` | No |
| **`ConfigProposed`** | **1300–1307** | `pending_treasury`, `pending_ops`, `pending_fee_bps_treasury`, `pending_fee_bps_ops`, `propose_ts`, `applies_at` (= propose_ts + CONFIG_TIMELOCK_SECS) | **NEW** |
| **`ConfigApplied`** | **1312–1319** | `authority`, `treasury`, `ops`, `fee_bps_treasury`, `fee_bps_ops`, `applied_ts` | **NEW** |
| **`AuthorityProposed`** | **1326–1330** | `current` (old authority), `pending` (new), `replaced_pending` (prior pending if overwritten) | **NEW** |
| **`AuthorityAccepted`** | **1334–1337** | `old`, `new` | **NEW** |
| `Paused` | 1341–1343 | `authority` | No |
| `Unpaused` | 1345–1348 | `authority` | No |

### Errors (41 variants; 6 new for Bundle 1)

| Name | Line | Category | **Bundle 1?** | Notes |
|---|---|---|---|---|
| `MatchIdTooLong` | 1356 | Input | No | Max 32 chars |
| `SamePlayer` | 1358 | Player | No | Distinctness |
| `InvalidState` | 1360 | State | No | Invalid transition |
| `NotAPlayer` | 1362 | Access | No | Signer not in match |
| `AlreadyDeposited` | 1364 | Idempotency | No | Bitmap check |
| `InvalidWinner` | 1366 | Validation | No | Must be registered |
| `Unauthorized` | 1368 | Access | No | No authority |
| `InvalidPlayer` | 1370 | Validation | No | Account mismatch |
| `AuthorityAsPlayer` | 1372 | Validation | No | Authority cannot play |
| `WagerTooSmall` | 1374 | Validation | No | Below MIN |
| `WagerTooLarge` | 1376 | Validation | No | Above MAX |
| `InvalidTreasury` | 1378 | Validation | No | Doesn't match snapshot |
| `InvalidOps` | 1380 | Validation | No | Doesn't match snapshot |
| `DuplicateFeeAccount` | 1382 | Validation | No | Treasury == ops |
| **`FeesTooHigh`** | **1384** | **Validation** | **NEW** | Combined treasury + ops BPS > 1000 (10%) |
| `ProgramPaused` | 1386 | Pause | No | New commitments blocked |
| `ArithmeticOverflow` | 1388 | Math | No | Overflow in fee/pot |
| `InvalidConfig` | 1390 | Config | No | General constraint |
| `TooEarlyToReclaim` | 1392 | Deadline | No | Public grace not yet elapsed |
| `TooFewPlayers` | 1394 | Player count | No | < 2 |
| `TooManyPlayers` | 1396 | Player count | No | > 10 |
| `DurationTooShort` | 1398 | Duration | No | < 60s |
| `DurationTooLong` | 1400 | Duration | No | > 24h (H039 fix) |
| `DepositWindowTooShort` | 1402 | Deposit window | No | < 60s |
| `DepositWindowTooLong` | 1404 | Deposit window | No | > 24h |
| `DepositWindowClosed` | 1406 | Deadline | No | Hard deadline passed (H018 strict `<` check) |
| `DepositWindowOpen` | 1408 | Deadline | No | Deposit window still open |
| `MatchAlreadyStarted` | 1410 | State | No | Cannot re-activate |
| `IncompleteRefund` | 1412 | Validation | No | H023 fix: must refund all |
| `ExecutableNotAllowed` | 1414 | Validation | No | H025 fix: no executable accounts |
| **`NoPendingAuthority`** | **1417** | **Governance** | **NEW** | `accept_authority` called without prior `propose_authority` |
| **`NoPendingConfig`** | **1419** | **Governance** | **NEW** | `apply_config_update` called without prior `update_config` |
| **`TimelockNotElapsed`** | **1421** | **Governance** | **NEW** | CONFIG_TIMELOCK_SECS not yet elapsed since propose |

---

## Bundle 1 (S2-T1 & S2-T2) Summary

### S2-T1: Governance Rotation (Lines 103–348)

**New Instructions:**
- `propose_authority` (302–318) — Step 1: current authority proposes a new key
- `accept_authority` (326–348) — Step 2: new key claims authority (atomically updates)
- `update_config` (115–168) — Rewritten: now proposals pending changes instead of applying immediately
- `apply_config_update` (245–293) — New: permissionless apply after 24h timelock

**Key Design Decisions:**
1. **Authority rotation has NO timelock** — 2-step ensure the new key is live (can sign) BEFORE the old key loses access. Recovery scenarios may need speed.
2. **Config updates have 24h timelock** — `update_config` writes pending_* fields + pending_config_ts. `apply_config_update` (callable by anyone after 24h) applies them live. Off-chain monitors can detect and respond during the window.
3. **Permissionless apply ensures liveness** — if the proposing authority becomes unreachable, any third party can apply announced changes after the timelock.
4. **Snapshotted config in MatchEscrow** — changes never affect in-flight matches (they snapshot at create). This decouples governance updates from match settlement and avoids complex state dependencies.

### S2-T2: Devnet Migration (Lines 184–239)

**`migrate_config` instruction — one-time Devnet-only PDA realloc:**
- Reads authority pubkey manually from raw account data at offset [8..40] (old pre-Bundle-1 layout)
- Verifies signer == stored authority
- Calls `realloc(231, false)` to grow the account from 110 → 231 bytes
- Tops up rent if needed (via CPI transfer)
- Zero-fills new bytes so pending_* fields deserialize as None and timestamps as 0

**Important notes:**
- Uses `UncheckedAccount` because Anchor's normal `Account<GlobalConfig>` deserializer would fail (old data only has 110 bytes, can't parse new struct)
- Manual authority verification via raw byte read — only the proposing authority can approve the migration
- **Remove this instruction in the follow-up program upgrade after drilling.** Mainnet deploys with new SPACE (231) from initialize_config genesis — no migration path needed.

### Risk Surface (High-Risk Code Paths)

1. **`migrate_config` uses `UncheckedAccount` + manual `realloc()`** (lines 184–239)
   - High-risk territory: raw data parsing, mutable account growth
   - Mitigation: authority verified manually; rent checked before realloc; zero-fill prevents uninitialized reads
   - Recommendation: audit off-chain simulation before Devnet drilling; remove after successful migration

2. **`accept_authority` doesn't use `has_one` gate** (line 908)
   - Design choice: new_authority signs (must match pending), not old authority
   - Validates `pending == new_authority.key()` in instruction body (line 330)
   - Risk: if wrong pending is set, new_authority can claim it even if not the intended recipient
   - Mitigation: offchain monitor watches `AuthorityProposed` events; proposal overwrites are free (current authority can cancel by re-proposing to itself)

3. **Snapshot BPS fields in MatchEscrow** (lines 1197–1199)
   - If a match is created, then fees are updated, then settlement happens, the settlement uses OLD snapshotted BPS not new config BPS
   - Design choice: prevents governance changes from affecting in-flight matches
   - Risk: authority could propose BPS < snapshotted, then never apply (leaves locked-in-flight matches at higher fees)
   - Mitigation: `ConfigProposed` events emit `applies_at` timestamp; off-chain can monitor and force `apply_config_update` if needed

---

## Structural Changes Summary

| Metric | v1 | v2 | Δ | Notes |
|---|---|---|---|---|
| **LOC** | 1,027 | 1,423 | +396 | +38% |
| **Instructions** | 10 | 16 | +6 | `propose_authority`, `accept_authority`, `update_config` (rewritten), `apply_config_update`, `migrate_config`, unchanged match lifecycle (6 instr) |
| **GlobalConfig SPACE** | 106 | 231 | +125 | Pending authority + config fields + timestamps |
| **MatchEscrow SPACE** | 232 | 509 | +277 | 10-player array, snapshotted fees, duration, deposit_window, match_end_ts |
| **Max Players** | 4 | 10 | +6 | Array grew; bitmap upgraded u8→u16 |
| **Fee Architecture** | Hardcoded 700/300 BPS | Configurable + snapshotted | Changed | Allows governance updates without affecting in-flight matches |
| **Deposit Window** | Fixed 1h (TIMEOUT_SECONDS) | Configurable (60s–24h) | Changed | Per-match parameter |
| **Match Duration** | Fixed 1h (SETTLEMENT_TIMEOUT_SECONDS) | Configurable (60s–24h, H039: was 7d) | Changed | Per-match parameter; H039 reduced to mitigate griefing (8-day fund lockup risk) |
| **Refund Grace** | 2x timeout (7200s) | 24h post-match_end | Changed | v2 uses absolute grace; simpler for public reclaim |
| **Authority Rotation** | Single-step `update_config` | 2-step propose/accept (no timelock) | Changed | New: recovery-focused; old authority instantly loses all access on accept |
| **Config Updates** | Immediate via `update_config` | 2-step propose + 24h timelock apply | NEW | Off-chain monitoring window; permissionless apply for liveness |
| **Audit Events** | `ConfigUpdated` (on every update) | `ConfigProposed` + `ConfigApplied` (one-shot pair) | Changed | Better tracking of governance intent vs execution |
| **Governance Gates** | Has none (config updates instant) | CONFIG_TIMELOCK_SECS (24h) between propose and apply | NEW | S2-T1 primary addition |

---

## Known Issues (From Code Comments)

| Issue | File | Lines | Status | Notes |
|---|---|---|---|---|
| **OC-13 note** | v1 | 1–2 | Planning | Transfer upgrade authority to multisig before mainnet (not yet done) |
| **H017 fix** | v1 | 529–536 | FIXED | MIN_DEPOSIT_WINDOW_SECS gate blocks silent-kick of in-flight depositors |
| **H018 fix** | v2 | 470–478 | FIXED | Strict `<` (not `<=`) on deposit-window deadline; closes race with `start_with_depositors` |
| **H025 fix** | v1, v2 | 721, 1015 | FIXED | `!executable` guard on winner/treasury/ops prevents lamport burn on executable accounts (EP-106) |
| **H039 fix** | v2 | 38–42 | FIXED | MAX_DURATION_SECS capped 7d → 24h; mitigates authority griefing (8-day fund lockup) |
| **H043 fix** | v1, v2 | 123, 355 | FIXED | Paused / Unpaused events emitted for off-chain monitoring |

---

## Recommendation for SOS Phase 0.5+

**Focus areas for deeper audit:**

1. **`migrate_config` instruction** — manual UncheckedAccount + realloc is high-risk. Verify:
   - Authority check logic at offset [8..40] is correct for the old layout
   - Rent calculation handles all edge cases (realloc cost, balance top-up)
   - Zero-fill loop doesn't skip or overfill bytes
   - No issues with rent exemption after migration

2. **Bundle 1 governance flows** — verify:
   - `accept_authority` validation (pending must match signer) is airtight
   - `apply_config_update` timelock check has no edge-case bypasses (e.g., clock manipulation)
   - Snapshotted config in MatchEscrow prevents DoS attacks (e.g., proposal-then-never-apply locks fees)
   - Off-chain monitoring can reliably detect `ConfigProposed` + `AuthorityProposed` events and respond

3. **Bitmap edge cases** — u16 bitmap now supports 16 players (code allows only 10):
   - Verify counts_ones() math holds for max 10 players
   - No silent bit-rotation bugs in compact logic (start_with_depositors lines 564–576)

4. **Deposit-window hard deadline** — H018 strict `<` fix:
   - Ensure no slot boundary collision where both deposit_wager and start_with_depositors pass checks in same slot
   - Verify created_at + deposit_window_secs arithmetic can't underflow (already uses checked_add)
