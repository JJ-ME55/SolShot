# Hot-Spots Map (Pre-Phase 1 Static Scan)

**Generated:** 2026-05-06
**Files scanned:** 2 (`programs/solshot-escrow/src/lib.rs` v1, `programs/solshot-escrow-v2/src/lib.rs` v2)
**Semgrep used:** No (not installed on Windows)

## Summary

- **Total patterns matched:** ~135
- **HIGH risk locations:** 39 (casts in arithmetic, UncheckedAccounts, CPI calls)
- **MEDIUM risk locations:** ~60 (timing/timeout, state machine, init, hardcoded constants)
- **Files with matches:** 2 (both source files)

### Headline observations

1. **No `unwrap()`/`expect()` in source files** — clean. All error paths use `?` propagation or explicit `require!`.
2. **No `unsafe` blocks** — clean.
3. **No oracle/price feed code** — escrow is SOL-only, no external price dependencies.
4. **No Token-2022 / SPL token code in escrow programs** — pure native SOL handling. (SHOT token burns happen off-chain via SPL token program, not in these contracts.)
5. **All `UncheckedAccount` usages have `/// CHECK:` annotations** with constraint validation against escrow snapshots (v2) or config fields (v1).
6. **v2 introduces runtime-configurable fee BPS** (`fee_bps_treasury`, `fee_bps_ops`) — new attack surface vs v1's compile-time constants.
7. **v2 deploys per-match snapshots** of treasury/ops/BPS, immune to mid-flight config rotation. Major architectural improvement over v1.
8. **`remaining_accounts` iteration** appears in 4 instructions across the two files (cancel_match, permissionless_reclaim in both v1 + v2). Each is a HIGH-priority focus area for Phase 1 — the iteration logic is where N-player refunds happen and bit-level mask validation lives.

---

## By File (Risk Density Order)

### `programs/solshot-escrow-v2/src/lib.rs` — Risk Score: HIGH (1020 LOC, never audited)

| Line | Pattern ID | Pattern | Risk | Focus Area |
|------|-----------|---------|------|------------|
| 21 | PG-002 | `declare_id!("BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N")` | LOW | Hardcoded values |
| 30-51 | PG-004 | 8 numeric constants (MIN/MAX_PLAYERS, MIN/MAX_WAGER, deposit/grace timeouts, MAX_FEE_BPS) | MEDIUM | Hardcoded / Token & Economic |
| 50 | PG-004 | `MAX_FEE_BPS: u16 = 1_000` (10% cap on configurable fees) | HIGH | Token & Economic — runtime fee mutation |
| 77, 129 | PA-004 | `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32` | MEDIUM | Arithmetic — confirm widening prevents overflow |
| 87, 147, 152 | PK-003 | `is_paused = true/false` | MEDIUM | State Machine / Pause |
| 206 | PA-005 | `escrow.max_players = players.len() as u8` | MEDIUM | Arithmetic — narrow cast (Vec len bounded by MAX_PLAYERS=10, safe) |
| 212 | PL-001 | `Clock::get()?.unix_timestamp` (created_at) | MEDIUM | Timing |
| 256-260 | PL-002 | Hard deposit-window deadline check | MEDIUM | Timing |
| 257, 302, 334 | PA-003 | `as i64` casts (deposit_window_secs, duration_secs) | MEDIUM | Arithmetic — widening to i64 for timestamp math |
| 276 | PF-004 | `CpiContext::new(...)` (system_program::transfer for deposit) | MEDIUM | CPI |
| 285-300 | PA-002 | u128 widening for pot calculation | MEDIUM | Arithmetic — designed widening (BOK Feb verified) |
| 298, 305 | PL-001 | `Clock::get()?.unix_timestamp` (deposit deadline + activate) | MEDIUM | Timing |
| 305, 330, 364 | PA-005 | `count_ones() as u64` and `as u32` | MEDIUM | Arithmetic — count_ones bounded by mask width |
| 362-372 | PA-002 | `start_with_depositors` arithmetic — pot scaling for partial deposits | HIGH | Arithmetic — NEW v2 mechanic, unaudited |
| 403-418 | PA-002 | `settle_match` u128 BPS split | HIGH | Arithmetic — uses snapshotted bps (v2-specific) |
| 470-480, 539-552 | PL-002 | Cancel/reclaim deadline branches based on `activated_at > 0` | HIGH | Timing — state-dependent deadline logic |
| 475, 545 | PA-003 | `deposit_window_secs as i64` | MEDIUM | Arithmetic |
| 502-513 | PF-005 | `cancel_match` iterates `remaining_accounts.iter().enumerate()` for refunds | HIGH | CPI / Account Validation — bit-mask matched against arbitrary accounts |
| 561-572 | PF-005 | `permissionless_reclaim` iterates `remaining_accounts` | HIGH | CPI / Account Validation — same pattern, anyone can call |
| 588, 645 | PE-002 | `init` constraint on config + escrow | MEDIUM | Account Validation |
| 597 | PD-001 | `payer: Signer<'info>` (initialize_config) | MEDIUM | Access Control |
| 608, 621, 634, 659, 695, 735, 790, 799 | PD-002 | `has_one = authority @ EscrowError::Unauthorized` (8 occurrences) | LOW | Access Control — wide coverage |
| 660, 682, 800 | PK-003 | `constraint = !config.is_paused` | MEDIUM | State Machine — pause guards |
| 696, 748, 773 | PK-001 | `close = authority` (settle), `close = caller` (cancel, reclaim) | HIGH | State Machine — rent destination differs by caller |
| 704, 711 | PC-001 | `winner: UncheckedAccount<'info>` with `/// CHECK:` annotation | MEDIUM | Account Validation — constraint validates against escrow.players |
| 714-720 | PC-001 | `treasury: UncheckedAccount<'info>` with `/// CHECK:` annotation | MEDIUM | Account Validation — constraint validates against escrow.treasury_snapshot |
| 717-718 | PD-006 | `treasury.key() == escrow.treasury_snapshot` and `treasury.key() != ops.key()` | LOW | Account Validation — explicit equality |
| 723-728 | PC-001 | `ops: UncheckedAccount<'info>` with `/// CHECK:` annotation | MEDIUM | Account Validation |
| 816 | PK-002 | GlobalConfig `is_paused: bool` field | MEDIUM | State Machine |
| 843, 860-861 | PG-004 | `deposit_window_secs`, `match_end_ts` per-match | MEDIUM | Timing — per-match storage of timing config |
| 892 | PK-002 | `pub enum MatchState` | MEDIUM | State Machine |
| 962-1020 | PG-004 | Errors enum (~25 variants) | LOW | Error Handling |

### `programs/solshot-escrow/src/lib.rs` — Risk Score: HIGH (962 LOC, modified +247/-140 since Feb audit)

| Line | Pattern ID | Pattern | Risk | Focus Area |
|------|-----------|---------|------|------------|
| 7 | PG-002 | `declare_id!("4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1")` | LOW | Hardcoded values |
| 15-32 | PG-004 | 8 constants: TREASURY_BPS=700, OPS_BPS=300, BPS_DENOMINATOR=10000, TIMEOUT_SECONDS=600, PERMISSIONLESS_RECLAIM_TIMEOUT=1200, SETTLEMENT_TIMEOUT_SECONDS=3600, MIN/MAX_WAGER_LAMPORTS | MEDIUM | Token & Economic |
| 61, 113, 120 | PK-003 | `is_paused = true/false` | MEDIUM | State Machine |
| 166, 522 | PA-005 | `players.len() as u8`, `j as u8` (max_players) | LOW | Arithmetic — bounded |
| 170 | PL-001 | `Clock::get()?.unix_timestamp` (created_at) | MEDIUM | Timing |
| 214 | PF-004 | `CpiContext::new(...)` for deposit | MEDIUM | CPI |
| 238 | PL-001 | `Clock::get()?.unix_timestamp` (activated_at) | MEDIUM | Timing |
| 240, 285 | PA-001/002 | `count_ones() as u64` / `as u128` (pot scaling) | MEDIUM | Arithmetic |
| 264-272 | PL-002 | Settlement deadline check (HIGH from Feb: H006 still likely open) | HIGH | Timing — RECHECK against Feb H006 |
| 285-300 | PA-002 | u128 widening for pot calc + 90/7/3 split | MEDIUM | Arithmetic |
| 357-367 | PL-002 | Cancel timeout branches (`activated_at > 0` check) | HIGH | Timing |
| 391-409 | PF-005 | `cancel_match` `remaining_accounts.iter().enumerate()` | HIGH | CPI / Account Validation |
| 442-454 | PL-002 | `permissionless_reclaim` 2x timeout calc | HIGH | Timing |
| 465-484 | PF-005 | `permissionless_reclaim` `remaining_accounts.iter().enumerate()` | HIGH | CPI / Account Validation |
| 524 | PL-001 | `Clock::get()?.unix_timestamp` (start_with_depositors activation) | MEDIUM | Timing |
| 527 | PA-002 | `wager.checked_mul(num_deposited as u64)` (start_with_depositors pot) | MEDIUM | Arithmetic — NEW since Feb (start_with_depositors instruction) |
| 547, 610 | PE-002 | `init` constraint | MEDIUM | Account Validation |
| 568, 583, 598, 625, 663-664, 703, 763-764, 773 | PD-002 | `has_one = authority` (Feb fix S004 confirmed at 625; ~10 occurrences total) | LOW | Access Control — broad coverage |
| 626, 650, 704, 729, 774 | PK-003 | `constraint = !config.is_paused` (cancel STILL has pause guard — H007 STILL OPEN per Feb delta) | HIGH | State Machine — RECHECK H007 |
| 665 | PK-001 | `close = authority` (settle) | LOW | State Machine |
| 673-697 | PC-001 | UncheckedAccount for winner/treasury/ops with `/// CHECK:` | MEDIUM | Account Validation |
| 686-687 | PD-006 | `treasury.key() == config.treasury` and `treasury.key() != ops.key()` (uses live config, NOT a snapshot — different from v2) | HIGH | Account Validation — RECHECK H002/H003/H011 chain (Feb still open) |
| 718, 745 | PK-001 | `close = caller` (cancel + reclaim) | HIGH | State Machine — rent goes to whoever calls; verify rent-theft variant H016 |
| 793-804 | PK-002 | GlobalConfig fields incl. `is_paused`, NO `pending_authority` field | HIGH | Access Control — RECHECK H001 (still open per Feb delta) |
| 807-847 | PG-004 | MatchEscrow `players: [Pubkey; 4]`, `deposits_mask: u8` (still u8 in v1 — different from v2's u16) | MEDIUM | State Machine |
| 850-855 | PK-002 | `enum MatchState` (4 variants) | LOW | State Machine |
| 913-962 | PG-004 | Error enum (~20 variants) | LOW | Error Handling |

---

## By Focus Area

### Access Control & Account Validation

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 793-804 | GlobalConfig has NO `pending_authority` | **HIGH** | RECHECK H001 — Feb critical, still open |
| v1 | 568-625 | `has_one = authority` widely applied including CreateMatch:625 | LOW | S004 fix confirmed |
| v1 | 686-687 | `treasury.key() == config.treasury` (live config read) | **HIGH** | RECHECK H002/H011 — fee redirect still possible via update_config |
| v2 | 717-728 | `treasury.key() == escrow.treasury_snapshot` (per-match snapshot, immune to mid-match rotation) | LOW | NEW v2 mitigation — verify snapshot is set correctly at create_match |
| v2 | 608-799 | Same `has_one = authority` pattern as v1 | LOW | Inherits S004 fix |
| v2 | 816 | GlobalConfig still missing `pending_authority` (v2 inherited the gap) | **HIGH** | RECHECK H001 on v2 |
| v1 | 673-697 | UncheckedAccount for winner/treasury/ops, all annotated with `/// CHECK:` | MEDIUM | Verify constraint coverage after H009 (executable account) — Feb POTENTIAL |
| v2 | 704-728 | UncheckedAccount for winner/treasury/ops, all annotated | MEDIUM | Same — verify executable check |

### Arithmetic Safety

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 285-300 | u128 widening for 90/7/3 split | LOW | BOK Feb verified |
| v1 | 524-527 | `start_with_depositors` pot = `wager × count_ones(deposits_mask)` | MEDIUM | NEW since Feb — never audited |
| v2 | 285-300, 403-418 | Same pattern but with snapshotted bps (runtime-set fee_bps_treasury, fee_bps_ops) | **HIGH** | NEW v2 mechanic — verify u128 widening covers configurable bps range |
| v2 | 77, 129 | `(fee_bps_treasury + fee_bps_ops) <= MAX_FEE_BPS` (1000 = 10% cap) | MEDIUM | Verify check covers update path, not just init |
| v2 | 305, 330, 364 | `count_ones() as u64`, `as u32` | LOW | u16 mask × max=10 players, count_ones ≤ 10, safe |
| v2 | 257, 302, 334, 343, 475, 545 | `as i64` for timestamp arithmetic | MEDIUM | Verify checked_add prevents i64 overflow at extreme deposit_window_secs |

### State Machine & Pause Behaviour

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 729 | `cancel_match` STILL has `constraint = !config.is_paused` | **HIGH** | RECHECK H007 — Feb explicitly recommended removing pause from cancel |
| v2 | 800 | `cancel_match` ALSO has `constraint = !config.is_paused` | **HIGH** | Same H007 issue inherited in v2 |
| v1 | 850-855 | MatchState enum 4 variants | LOW | Lifecycle |
| v2 | 892 | MatchState enum (verify variant set) | MEDIUM | Verify state transition table — v2 has Pending state? |
| v1 | 718, 745 | `close = caller` on cancel + reclaim | MEDIUM | RECHECK H016 — rent theft variant (Feb LOW) |
| v2 | 748, 773 | `close = caller` on cancel + reclaim | MEDIUM | Same H016 pattern |

### Timing & Ordering

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 20, 26 | TIMEOUT_SECONDS=600 vs SETTLEMENT_TIMEOUT_SECONDS=3600 | **HIGH** | RECHECK H006 23-hour dead-zone (Feb still open) — NOTE: per Feb delta the constants may have changed; verify current gap math |
| v1 | 264-272 | Settlement deadline check (only if activated) | HIGH | Tied to H006 |
| v2 | 30-51 | Per-match `deposit_window_secs` + `duration_secs` (configurable per-match instead of global const) | **HIGH** | NEW v2 mechanic — extreme values (very-short or very-long durations) need stress testing |
| v2 | 470-480, 539-552 | Cancel/reclaim deadline branches `activated_at > 0` | HIGH | State-dependent timeout logic, novel in v2 |
| v2 | 47 | `PUBLIC_REFUND_GRACE_SECS = 24h` | MEDIUM | Different model from v1's 2× timeout — verify match_end_ts math |

### CPI & External Calls

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 214 | `CpiContext::new` system_program::transfer for deposits | LOW | Single CPI, well-bounded |
| v2 | 276 | Same | LOW | |
| v1 | 391, 465 | `remaining_accounts.iter().enumerate()` for cancel + reclaim refunds | **HIGH** | Bit-mask validation against arbitrary caller-supplied accounts; verify each account's pubkey matches `escrow.players[i]` and is `is_writable` |
| v2 | 502, 561 | Same pattern for cancel + reclaim refunds | **HIGH** | NEW in v2 — verify same loop integrity holds for u16 mask |

### Token & Economic

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1 | 15-17 | TREASURY_BPS=700, OPS_BPS=300, BPS_DENOMINATOR=10000 (hardcoded 90/7/3 split) | LOW | Constants, immune to mutation without upgrade |
| v2 | 50, 816 | Runtime-configurable `fee_bps_treasury` + `fee_bps_ops` (capped at MAX_FEE_BPS=1000) | **HIGH** | NEW v2 attack surface — but per-match snapshot mitigates rotation. Verify cap enforcement at update_config |
| v1, v2 | 29, 32 | MIN_WAGER=10_000 lamports, MAX_WAGER=100B lamports (100 SOL) | LOW | Bounded |

### Upgrade & Admin

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1, v2 | comment | `OC-13 — transfer upgrade authority to multisig before mainnet` (TODO marker) | **HIGH** | Both programs deployed under hot-wallet upgrade authority; pre-mainnet decision required |
| v1, v2 | n/a | NO `propose_authority` / `accept_authority` / `pending_authority` | **HIGH** | RECHECK H001 — JJ's hot-wallet posture is intentional pre-mainnet; document the choice in final report |

### Rust Footguns / Error Handling

| File | Line | Pattern | Risk | Note |
|------|------|---------|------|------|
| v1, v2 | (none) | No `unwrap()`, no `expect()`, no `unsafe` | LOW | Clean error handling |

### Oracle & External Data

(Not applicable — pure SOL escrow, no external price data.)

---

## Hot-Spot Recommendations for Phase 1 Agents

| Phase 1 Agent | Top files / lines to start at |
|---------------|-------------------------------|
| 01 — Access Control | v2:608-805, v1:568-777 (struct constraints), v1:783-804 + v2:807-820 (GlobalConfig — confirm no pending_authority) |
| 02 — Arithmetic | v1:285-300, v2:285-300+403-418 (settle math), v1:524-527 (start_with_depositors NEW), v2:362-372 (start_with_depositors NEW with snapshot) |
| 03 — State Machine | v2:888-900 (MatchState — verify Pending), v1:850-855, both:cancel_match pause-guards (H007), close=caller patterns |
| 04 — CPI / External | v1:391+465 + v2:502+561 (remaining_accounts iteration — refund correctness), v1:214 + v2:276 (system_program CPI) |
| 05 — Token & Economic | v2:50+816 (configurable BPS — NEW), v1:15-17 (hardcoded BPS), pot calculation paths |
| 06 — Oracle | (skip — no oracles) |
| 07 — Upgrade & Admin | both: GlobalConfig structs, update_config flow, pause/unpause idempotency, missing pending_authority |
| 08 — Timing & Ordering | v1:20-26 + 264-272 + 357-367 (H006 dead zone), v2:470-480 + 539-552 (state-dependent deadlines), v2:30-51 (per-match timing) |

