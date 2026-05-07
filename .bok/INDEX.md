# Book of Knowledge — Math Region Index

**Generated:** 2026-05-07 by `/BOK:scan`
**Audit number:** #2 (stacked on Feb 2026 BOK run, archived at `.bok-history/2026-02-23-ecfd03b/`)
**Git ref:** `7296e95` (post-audit fix bundle)

## Summary

- **Files scanned:** 2 source files (`programs/solshot-escrow/src/lib.rs` v1 962 LOC, `programs/solshot-escrow-v2/src/lib.rs` v2 1020 LOC) + 4 existing BOK test files at `programs/solshot-escrow/tests/`
- **Files with math signals:** 2 (both source files)
- **Math regions identified:** 14 (across 6 categories)
- **Kani available:** NO (degraded mode — same posture as Feb)
- **GL docs available:** YES (Feb 2026 run at `.docs/`)
- **SOS findings available:** YES (Audit #2 at `.audit/`)

## Verification Mode

**Degraded mode (no Kani):**
- LiteSVM tests (runtime simulation against actual program bytecode) — empirical evidence
- Proptest (property-based testing with shrinking) — probabilistic confidence
- Both stress-test invariants but cannot PROVE for all inputs
- Sufficient for HIGH-CONFIDENCE PROBABILISTIC tier; not PROVEN tier

This matches Feb posture and is acceptable for hackathon submission. PROVEN tier (Kani) requires WSL2 setup — flagged for mainnet hardening.

## Math Regions

### Category 1: Fee Calculations (Pot Split — 90/7/3)

The settlement split is the highest-value math region. v1 uses hardcoded BPS constants; v2 uses runtime-configurable BPS snapshotted at `create_match`.

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| `settle_match` (v1) | `programs/solshot-escrow/src/lib.rs:258-338` | Multi-account economic | 8 | YES (`token-economics.md`) | NO new — Feb verified, unchanged |
| `settle_match` (v2) | `programs/solshot-escrow-v2/src/lib.rs:387-454` | Multi-account economic | 9 | YES | **YES — A01-A04, untested by Feb BOK** |

**Invariants (existing on v1, NEW on v2):**

- I-FEE-1 — Pot conservation: `winner + treasury + ops ≤ total_pot` for all valid inputs
- I-FEE-2 — Dust bound: `total_pot - winner - treasury - ops ≤ 2 lamports` (two BPS floor divisions)
- I-FEE-3 — No underflow: `total_pot ≥ treasury + ops` enforced by `MAX_FEE_BPS = 1000` cap
- I-FEE-4 — u128 widening sufficient: `wager × count_ones × bps` stays well below `u128::MAX` at all valid inputs (max product = 1e16 vs u128::MAX = 3.4e38)
- I-FEE-5 (v2 NEW) — Cap holds for all (treasury_bps, ops_bps) pairs in `[0..1000] × [0..1000]` with sum ≤ 1000

### Category 2: Pot Scaling — `start_with_depositors`

NEW since Feb BOK run. Compacts deposited players, activates with reduced max_players, scales pot by `count_ones(deposits_mask)`.

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| `start_with_depositors` (v1) | `lib.rs:493-536` (post-H017-fix: timing gate added) | Multi-account economic | 5 | PARTIAL | YES — A05; H017 fix applied |
| `start_with_depositors` (v2) | `lib.rs:323-382` | Multi-account economic | 6 | PARTIAL | **YES — A06; never proptested** |

**Invariants:**

- I-POT-1 — Pot equals `wager × count_ones(deposits_mask)` post-compaction
- I-POT-2 — Compaction preserves player set: every set bit pre-compaction maps to one slot post
- I-POT-3 — `MIN_PLAYERS` enforced: count_ones ≥ 2 (cannot multiply by 0)
- I-POT-4 (v1 NEW post-fix) — Timing gate: `now ≥ created_at + MIN_DEPOSIT_WINDOW_SECS` before compaction (H017 fix)

### Category 3: Refund Conservation — cancel_match + permissionless_reclaim

POST-FIX (Audit #2 H023): `require!(remaining_accounts.len() == count_ones(deposits_mask))` enforced at all 4 sites.

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| `cancel_match` (v1) | `lib.rs:344-419` | Multi-account economic | 6 | YES (`edge-case-playbook.md`) | YES — A09; H023 fixed |
| `cancel_match` (v2) | `lib.rs:459-519` | Multi-account economic | 6 | YES | **YES — A09 v2** |
| `permissionless_reclaim` (v1) | `lib.rs:425-487` | Multi-account economic | 6 | YES | YES (H023 fixed) |
| `permissionless_reclaim` (v2) | `lib.rs:526-578` | Multi-account economic | 6 | YES | **YES** |

**Invariants:**

- I-REF-1 (POST-H023-FIX) — Length check: `remaining_accounts.len() == count_ones(deposits_mask)`. Enables stronger invariants below.
- I-REF-2 — Refund conservation: `Σ(refund per slot) == wager × count_ones(deposits_mask)`
- I-REF-3 — No over-debit: `escrow.lamports` never goes negative (per-iteration bit_set check + length check)
- I-REF-4 — Each refund is exactly `wager_lamports` (no fee on refunds, returns 100% of deposit)

### Category 4: Timestamp / Duration Arithmetic

Per-match deadlines (v2) and timeout chains (both versions). All use `checked_add` against `Clock::get()`.

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| Deposit-deadline calc (v2) | `lib.rs:255-262` (post-H018-fix: `<` strict) | Simple arithmetic | 3 | NO | YES — H018 fixed |
| Match-end calc (v2) | `lib.rs:296-303, 365-369` | Simple arithmetic | 4 | NO | NO |
| Cancel deadline branches (v2) | `lib.rs:470-477` | Simple arithmetic | 4 | NO | NO |
| Reclaim deadline branches (v2) | `lib.rs:539-549` | Simple arithmetic | 4 | NO | NO |
| Settlement deadline (v1) | `lib.rs:264-272` | Simple arithmetic | 3 | NO | NO |
| Cancel timeout (v1, post-H035-fix) | `lib.rs:357-378` | Simple arithmetic | 4 | NO | YES (constants 600→3600) |
| Reclaim 2x timeout (v1, post-fix) | `lib.rs:442-456` | Simple arithmetic | 3 | NO | YES (1200→7200) |
| MIN_DEPOSIT_WINDOW gate (v1, NEW) | `lib.rs:493-501` | Simple arithmetic | 2 | NO | YES — H017 fix added |

**Invariants:**

- I-TIME-1 — No overflow on deadline addition: `created_at + window_secs` cannot overflow i64 at any realistic timestamp (year 292B AD before overflow)
- I-TIME-2 — Monotonic deadline ordering: deposit_deadline ≤ match_end_ts ≤ reclaim_deadline
- I-TIME-3 (v1, post-H035-fix) — Cancel deadline ≥ settle deadline: was 600 < 3600 (race window); now both = 3600. Race eliminated.
- I-TIME-4 (v1, post-H040-fix) — Comment integrity: `PERMISSIONLESS_RECLAIM_TIMEOUT` doc-string matches actual value (was "48-hour" claim with 1200s value; now "2-hour" claim with 7200s value)

### Category 5: Bit-Field — deposits_mask

v1 uses u8 (max 8 bits, 4 used); v2 uses u16 (max 16 bits, 10 used).

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| `deposit_wager` mask set (v1) | `lib.rs:225-226` | Simple arithmetic | 2 | NO | NO |
| `deposit_wager` mask set (v2) | `lib.rs:286-287` | Simple arithmetic | 2 | NO | NO |
| `count_ones()` use sites | various — pot scaling + state checks | Simple arithmetic | 6 (v1) / 7 (v2) | NO | YES — A09 |

**Invariants:**

- I-BIT-1 — Bit count ≤ max_players: enforced via `position()` over `players[..max_players]` in deposit_wager
- I-BIT-2 — No bit collision: `(deposits_mask >> player_index) & 1 == 0` check before set + Solana account-locking serializes same-PDA writes
- I-BIT-3 — Mask integrity across compaction: start_with_depositors rewrites mask as `(1 << j) - 1` where j = num_deposited; bit count preserved

### Category 6: Cap Enforcement — Configurable BPS (v2 only)

NEW in v2. Audit #2 H011 documented as REGRESSION of Feb H028 dismissal.

| Function | File | Complexity | Signal Hits | Has GL Spec | SOS Flagged |
|----------|------|-----------|-------------|-------------|-------------|
| `initialize_config` BPS cap (v2) | `lib.rs:75-79` | Simple arithmetic | 2 | YES (`token-economics.md`) | YES — A02 |
| `update_config` BPS cap (v2) | `lib.rs:128-131` | Simple arithmetic | 2 | YES | YES — A02 |
| Per-match snapshot write (v2) | `lib.rs:201-219` (atomic with create_match) | Simple arithmetic | 4 | YES | YES — verified atomic in Audit #2 |

**Invariants:**

- I-CAP-1 — Combined cap holds: `fee_bps_treasury + fee_bps_ops ≤ MAX_FEE_BPS (1000)` at every update path
- I-CAP-2 — u32 widening prevents overflow: `u16::MAX + u16::MAX = 131,070 < u32::MAX (4.29B)`
- I-CAP-3 — Per-match snapshot atomic: at create_match, all 4 BPS-related fields set in same instruction as `state = AwaitingDeposits`. No observable window with default values.
- I-CAP-4 — Settle reads only snapshot: settle_match never reads live config for BPS values; cross-instruction config rotation cannot affect in-flight matches

## Existing BOK Tests (from Feb run, partially obsoleted by fix bundle)

| Test File | Path | Coverage | Re-run Required After Fix Bundle? |
|-----------|------|----------|------------------------------------|
| `bok_litesvm.rs` | `programs/solshot-escrow/tests/` | Runtime simulation of v1 settle/cancel/reclaim | YES — TIMEOUT_SECONDS changed |
| `bok_proptest_fee.rs` | `programs/solshot-escrow/tests/` | Proptest sweep of v1 settle math (hardcoded 700/300) | YES — but logic unchanged; constants changed |
| `bok_proptest_space.rs` | `programs/solshot-escrow/tests/` | Account space allocations | NO — sizes unchanged |
| `bok_proptest_timestamp.rs` | `programs/solshot-escrow/tests/` | v1 timestamp arithmetic + deadline ordering | YES — TIMEOUT / PERMISSIONLESS_RECLAIM constants changed |

**Coverage gap (high priority for this BOK run):** v2 is COMPLETELY untested by BOK. New test files needed at `programs/solshot-escrow-v2/tests/bok_*.rs` covering the same matrix on v2's surface (configurable BPS, 10-player ceiling, per-match snapshot atomicity, refund conservation post-H023-fix).

## Cross-Skill Notes

**From SOS Audit #2 (`.audit/findings/`):**

- **H023 fixed** — refund-loop length check landed. New invariant I-REF-1: `len() == count_ones()`.
- **H011 (REGRESSION on v2)** — runtime BPS opens snapshot-poisoning surface. Cap re-verified at update; need to verify snapshot atomicity (I-CAP-3).
- **H035 fixed** — v1 TIMEOUT_SECONDS = 3600. New invariant I-TIME-3: cancel ≥ settle.
- **H039 fixed** — v2 MAX_DURATION_SECS = 86400.
- **H017 fixed** — v1 start_with_depositors timing gate. New invariant I-POT-4.
- **H040 fixed** — comment integrity I-TIME-4 (no funds at risk; doc-quality invariant).
- **H018 fixed** — v2 deposit_wager bound `<` strict (closes at-deadline edge collision; affects I-TIME-2 strict ordering).

**From GL docs (`.docs/`):**

- `token-economics.md` describes the 90/7/3 split intent — invariants I-FEE-1..5 align with documented intent.
- `edge-case-playbook.md` covers cancel/reclaim flows — invariants I-REF-1..4 match documented behavior.
- `security-model.md` describes trust boundaries — non-economic invariants tie back here.

## Phase 0 Output

- `.bok/STATE.json` — audit state, scan complete
- `.bok/INDEX.md` — this file (14 math regions across 6 categories)
- Prior Feb run archived at `.bok-history/2026-02-23-ecfd03b/` (25 invariants verified, 59 tests passing)

## Next Step

Run `/BOK:analyze` (Phase 1) to match these regions against the verification pattern catalog and propose explicit invariants for the next phase.
