# Attack Strategy Catalog

**Project:** SolShot Escrow (programs v1 + v2)
**Generated:** 2026-05-07
**Total Strategies:** 50 (+ supplementals to be added during investigation)

---

## Strategy Generation Sources

This catalog was generated from:
- 7 focus area context analyses (.audit/context/01..08-*.md)
- Prior audit findings (15 RECHECK + 17 false-positive log entries from `.audit/HANDOVER.md`)
- Solana exploit pattern catalog (PATTERNS_INDEX.md, ~128 EPs)
- Codebase-specific novel observations from cross-agent convergence

**Origin distribution:**
- Novel: 23 (46% — well above 20% requirement)
- RECHECK: 20 (verifying or re-investigating prior findings)
- KB (EP-derived): 7

---

## Strategy Index by Category

### Access Control (10 strategies)
- H001: H001 RECHECK — One-step authority transfer takeover (v1 + v2)
- H002: H011 RECHECK — Treasury self-redirect via multi-TX rotation chain
- H003: H005 RECHECK — Authority winner selection fraud (worse on v2 N-player)
- H004: S004 RECHECK — Verify CreateMatch `has_one = authority` fix landed cleanly
- H005: H008 RECHECK — Verify subsumed by S004 fix
- H006: H014 RECHECK — Authority collusion to settle in favor of controlled wallet
- H007: H027 RECHECK — Authority self-play via secondary wallet (design limitation)
- H008: NOVEL — `initialize_config` race-init (any payer accepted, no zero-address guard)
- H009: NOVEL — Pause-then-rotate-then-unpause attack chain (v1 freeze-during-coup)
- H010: NOVEL — Authority can rotate config.authority to itself across 2 TXs

### Arithmetic (5 strategies)
- H011: NOVEL — H028 v2: BPS poisoning via authority Layer-2 compromise
- H012: H028 RECHECK on v1 — Verify dismissal still holds (constants only changeable via upgrade)
- H013: H012 RECHECK — Lamport underflow on v2 N-player refund loop
- H014: H019 RECHECK — Narrowing cast safety on v2 (10-player pot)
- H015: NOVEL — Lamport credit overflow on destination accounts (defense-in-depth)

### State Machine & Error Handling (7 strategies)
- H016: H007 RECHECK — Pause-as-griefing on v1 cancel_match (still open)
- H017: NOVEL — v1 silent-kick attack via `start_with_depositors` (no timing gate)
- H018: NOVEL — v2 deposit_window edge collision at exactly `deposit_deadline`
- H019: H022 RECHECK — GlobalConfig re-init blocked
- H020: H023 RECHECK — PDA revival post-close yields fresh state
- H021: H024 RECHECK — Settlement deadline bypass via activated_at
- H022: H030 RECHECK — Cancel-from-AwaitingDeposits refund-all flow on v2

### CPI & External / Refund Loop (7 strategies)
- H023: NOVEL CRITICAL — Partial-refund theft via `close = caller` sweep (4 sites)
- H024: NOVEL HIGH — Non-contiguous `deposits_mask` is permanently unrefundable
- H025: H009 RECHECK — Executable-account fee destination (still open both versions)
- H026: H026 RECHECK — Donation attack (lamport inflation to escrow)
- H027: H029 RECHECK — Atomic-TX rollback under Anchor 0.32.1
- H028: NOVEL — Pubkey::default() in zero-padded slots
- H029: NOVEL — Asymmetric pot-vs-mask scaling (mask bits past max_players)

### Token & Economic (5 strategies)
- H030: H002 RECHECK — Fee destination hijack via update_config (v1 live read; v2 in-flight protected)
- H031: H013 RECHECK — Rent extraction at low wagers (close=caller economics)
- H032: NOVEL — BPS rotation ratcheting across matches within 10% cap
- H033: NOVEL — start_with_depositors griefing via authority-chosen activation timing
- H034: NOVEL — MIN_WAGER + extreme low BPS = silent zero fees (intentional waiver path)

### Timing & Ordering (6 strategies)
- H035: NOVEL CRITICAL — Settle-vs-cancel priority-fee race (H006 inverted)
- H036: H006 RECHECK — Original 23h dead zone (verify resolved)
- H037: H010 RECHECK — Deposit ordering asymmetry (v1 + v2)
- H038: H020 RECHECK — Clock drift at v2 short-duration matches (60s minimum)
- H039: NOVEL — v2 unbounded duration_secs lockup (8-day fund lockup possible)
- H040: NOVEL — Stale 48-hour comment misleads operators (`v1:22-23`)

### Upgrade & Admin (6 strategies)
- H041: H016 RECHECK — close = caller rent theft (still open both)
- H042: NOVEL — GlobalConfig has no close path (key-loss permanence)
- H043: NOVEL — Idempotent pause emits no event (operational gap)
- H044: NOVEL — Single hot wallet for Layer 1 + Layer 2 (verified live)
- H045: NOVEL — Snapshot drift across update_config calls (audit trail gap)
- H046: NOVEL — Layer-1 bytecode replacement risk (no governance)

### Account Validation / Defense-in-Depth (4 strategies)
- H047: NOVEL — UncheckedAccount no `is_writable` check at-program (relies on client)
- H048: NOVEL — Permissionless reclaim caller cannot be `Pubkey::default()` validated only by runtime
- H049: NOVEL — match_id PDA seed entropy (server-side CSPRNG dependency)
- H050: S001/S002 RECHECK — Combined-attack chain status

---

## Strategy Definitions

---

## H001: H001 RECHECK — One-Step Authority Transfer Takeover

**Category:** Access Control + Upgrade & Admin
**Estimated Priority:** Tier 1 (CRITICAL)
**Origin:** RECHECK (Feb H001 — CVSS 8.7)
**Historical Precedent:** EP-068 (Raydium $4.4M, Step Finance $30-40M, Pump.fun $1.9M, Garden Finance $11M)

### Hypothesis

A single compromise of the application authority key results in immediate, irreversible takeover of either v1 or v2. No `pending_authority` field, no propose/accept flow, no timelock means an attacker can execute config rotation in the same transaction as fee redirect and settlement fraud.

### Attack Vector

1. Attacker obtains `config.authority` private key (phishing, .env leak, insider).
2. TX 0: `update_config(new_authority = attacker_secondary, new_treasury = attacker_2, new_ops = attacker_3)` — rotates all three slots in one TX (zero-address guard fires only on default-pubkey).
3. v2-specific TX 0b: also rotate `new_fee_bps_treasury = 999, new_fee_bps_ops = 1` (combined ≤ 1000, passes cap).
4. TX 1+: settle in-flight v1 matches with controlled winner (via H003); for v2, settle existing snapshotted matches at original snapshot, then create new matches that snapshot the poisoned config.
5. Permanent governance lockout once `new_authority` is rotated.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `programs/solshot-escrow/src/lib.rs` | `update_config` | 72-108 | One-step rotation handler |
| `programs/solshot-escrow/src/lib.rs` | GlobalConfig struct | 787-798 | No `pending_authority` field |
| `programs/solshot-escrow-v2/src/lib.rs` | `update_config` | 96-142 | Same pattern |
| `programs/solshot-escrow-v2/src/lib.rs` | GlobalConfig struct | 810-818 | Same gap |

### Prerequisites
- Authority key compromise.

### Potential Impact
**Severity:** CRITICAL
- Financial: Up to entire pot of every in-flight v1 match (v1 reads live config) plus 10% of every NEW v2 match.
- Users: All players currently in matches.
- Protocol: Permanent governance lockout once authority rotated.

### Investigation Approach
1. Confirm `pending_authority` field absence in both `GlobalConfig` structs.
2. Verify single-TX `update_config(new_authority = X)` succeeds when authority signs.
3. Document JJ's intentional pre-mainnet posture per `Docs/internal/PRIOR_AUDIT_DELTA.md`.
4. Calibrate severity: CONFIRMED (the gap exists by design); document operational risk for the report.

### Indicators of Vulnerability
```rust
// Single-TX rotation:
if let Some(a) = new_authority {
    require!(a != Pubkey::default(), EscrowError::InvalidAuthority);
    cfg.authority = a;
}
```

### Indicators of Safety
```rust
// What we'd want (not present):
pub pending_authority: Option<Pubkey>,
// + propose_authority + accept_authority instructions
```

---

## H002: H011 RECHECK — Treasury Self-Redirect via Multi-TX Rotation Chain

**Category:** Access Control + Token & Economic
**Estimated Priority:** Tier 1 (HIGH)
**Origin:** RECHECK (Feb H011 — CVSS 8.7)
**Historical Precedent:** EP-068 fee-routing redirects (Vaultka 2024)

### Hypothesis

Even with the post-update distinctness check (`authority != treasury`, `treasury != ops`), an authority can multi-TX rotate to set treasury == authority's primary wallet by temporarily swapping authority through a secondary key.

### Attack Vector

1. Authority A1 calls `update_config(new_authority = A2)` — config now has `authority=A2, treasury=T_old, ops=O_old`.
2. A2 calls `update_config(new_treasury = A1)` — passes distinctness because authority is currently A2 (so A1 != A2).
3. A2 calls `update_config(new_authority = A1)` — passes because A1 != A1's-own-treasury... actually FAILS because authority would equal treasury.
4. Refined chain: A1 → A2 → set treasury = A3 (A1's secondary) → set authority = A1 → distinctness OK because A3 ≠ A1 ≠ ops.
5. Now A1 receives 7% of every settle via the A3 wallet it controls.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `programs/solshot-escrow/src/lib.rs` | `update_config` | 72-108 (esp. 96-98 distinctness) | v1 — affects in-flight matches via live read at `lib.rs:686` |
| `programs/solshot-escrow-v2/src/lib.rs` | `update_config` | 96-142 (esp. 125-127) | v2 — only affects NEW matches via snapshot |

### Prerequisites
- Authority key compromise.
- Attacker controls multiple wallets.

### Potential Impact
**Severity:** HIGH
- Financial: 7% of all v1 in-flight + future settlements; 7% of all v2 new matches.
- Detection: silent — passes distinctness invariants.

### Investigation Approach
1. Walk the multi-TX rotation sequence and verify which combinations pass / fail the distinctness checks at v1:96-98 and v2:125-127.
2. Identify which intermediate states are necessary.
3. Verify v2's per-match snapshot prevents the in-flight redirect (treasury_snapshot is frozen at create_match).
4. Severity: confirmed-conditional-on-authority-compromise.

### Indicators of Vulnerability
```rust
// Distinctness only fires post-update, not across-history
require!(cfg.authority != cfg.treasury, EscrowError::DuplicateFeeAccount);
require!(cfg.treasury != cfg.ops, EscrowError::DuplicateFeeAccount);
require!(cfg.authority != cfg.ops, EscrowError::DuplicateFeeAccount);
```

---

## H003: H005 RECHECK — Authority Winner Selection Fraud

**Category:** Access Control + Token & Economic
**Estimated Priority:** Tier 1 (HIGH POTENTIAL)
**Origin:** RECHECK (Feb H005)
**Historical Precedent:** Garden Finance $11M (settlement authority abuse)

### Hypothesis

Authority freely chooses any pubkey in `escrow.players[0..max_players]` as the winner. Combined with authority's control over `create_match`, the authority can pre-register a controlled wallet as a player and always settle in its favor. v2's 10-player limit makes this 2.5× worse than v1's 4-player limit per single match.

### Attack Vector

1. Authority creates match with `players = [legit_p1, attacker_alt]` (or larger group).
2. Match plays out off-chain.
3. Regardless of game outcome, authority calls `settle_match(winner = attacker_alt)`.
4. Pot's 90% goes to attacker_alt.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `programs/solshot-escrow/src/lib.rs` | `settle_match` SettleMatch winner constraint | 676-679 | Validates winner ∈ players only |
| `programs/solshot-escrow-v2/src/lib.rs` | settle_match winner constraint | 707-710 | Same pattern; 10-player ceiling |

### Prerequisites
- Authority is malicious or compromised.

### Potential Impact
**Severity:** HIGH
- Financial: up to 90% × wager × 10 players = 900 SOL × 90% = 810 SOL per max v2 match.
- Detection: requires off-chain monitoring of game outcomes.

### Investigation Approach
1. Confirm `winner` constraint is `players.contains(&winner.key())` only.
2. Verify no on-chain proof of game outcome is required.
3. Check `OC-06` author/player exclusion at v1:127-129, v2:188 — only excludes the SIGNING authority key, not derivatives.
4. Status: STILL_OPEN by design.

---

## H004: S004 RECHECK — Verify CreateMatch `has_one = authority` Fix

**Category:** Access Control
**Estimated Priority:** Tier 1 (verification)
**Origin:** RECHECK (Feb S004 — CVSS 9.3)
**Historical Precedent:** Solend 2022 PDA-rent pattern

### Hypothesis

Verify the Feb S004 fix (PDA Pre-Squatting DoS) landed cleanly in v1 AND was carried over correctly to v2.

### Investigation Approach
1. Confirm `has_one = authority @ EscrowError::Unauthorized` on `CreateMatch.config` at v1:625.
2. Confirm same constraint on v2 CreateMatch (per pre-scan: v2:659).
3. Verify no regression: third-party signer cannot pass authority check.
4. Status: spot-check says FIXED both. Confirm no subtle bypasses.

### Target Code
- v1:606-631 (CreateMatch struct), v2:642-664 (CreateMatch struct).

### Indicators of Safety
```rust
#[account(
    seeds = [b"config"],
    bump = config.bump,
    has_one = authority @ EscrowError::Unauthorized,
    constraint = !config.is_paused @ EscrowError::ProgramPaused,
)]
pub config: Account<'info, GlobalConfig>,
```

---

## H005: H008 RECHECK — CreateMatch PDA Occupancy DoS

**Category:** Access Control
**Estimated Priority:** Tier 2 (verification)
**Origin:** RECHECK (Feb H008)

### Hypothesis

Subsumed by S004 fix — only authority can create matches. Verify no other path allows third-party PDA pre-squatting.

### Investigation Approach
1. Verify CreateMatch is the only instruction that `init`s a MatchEscrow PDA.
2. Confirm only authority can sign create_match.
3. Status: LIKELY FIXED both versions; flag any subtle workaround.

---

## H006: H014 RECHECK — Authority Collusion to Settle in Favor of Controlled Wallet

**Category:** Access Control + Token & Economic
**Estimated Priority:** Tier 1 (POTENTIAL)
**Origin:** RECHECK (Feb H014)

### Hypothesis

Authority pre-registers a wallet they control as a player at create_match, then settles in its favor (via H003). Distinct from H003 in that the attacker is the AUTHORITY operator deliberately, not just exploiting a compromised key.

### Investigation Approach
1. Verify create_match accepts arbitrary pubkeys in `players[]` (no liveness check).
2. Verify authority/player exclusion (`OC-06`) only checks signing key, not derivatives.
3. Document as design limitation.

---

## H007: H027 RECHECK — Authority Self-Play Bypass via Secondary Wallet

**Category:** Access Control
**Estimated Priority:** Tier 2 (POTENTIAL — design limitation)
**Origin:** RECHECK (Feb H027)

### Hypothesis

Authority operator uses a secondary wallet they control as a "player" — `OC-06` checks only the signing authority key, not derivatives.

### Investigation Approach
1. Locate `OC-06` author/player checks: v1:127-129, v2:186-188.
2. Confirm checks compare against `ctx.accounts.authority.key()` only.
3. Status: design limitation, not fixable without architectural change.

---

## H008: NOVEL — `initialize_config` Race-Init

**Category:** Access Control + Upgrade & Admin
**Estimated Priority:** Tier 2 (MEDIUM)
**Origin:** Novel (EP-076 pattern)

### Hypothesis

`initialize_config` accepts any payer (`payer: Signer<'info>`); the `authority`, `treasury`, `ops` arguments are passed by the caller. If the deployer doesn't fire init in the same script as deploy, an attacker can race-init and set themselves as authority.

### Attack Vector

1. Attacker monitors mempool for new program deployment.
2. Sees deploy TX land at slot N.
3. Submits `initialize_config(authority = attacker, treasury = attacker, ops = attacker)` at slot N+1.
4. Wins the race. Now controls the program.

### Target Code
- v1:47-65 + InitializeConfig struct at v1:544-559.
- v2: equivalent at v2:73-94 + 587-600.

### Investigation Approach
1. Verify init has no constraint that authority == upgrade authority of the program.
2. Verify no zero-address guard on init (only update has it).
3. Document operational risk: deploy + init must be atomic via deploy script.

### Indicators of Vulnerability
```rust
pub struct InitializeConfig<'info> {
    pub payer: Signer<'info>,  // NO constraint binding payer to authority
    ...
}
```

---

## H009: NOVEL — Pause-Then-Rotate-Then-Unpause Attack Chain

**Category:** Access Control + State Machine + Upgrade & Admin
**Estimated Priority:** Tier 2 (HIGH on v1 only)
**Origin:** Novel

### Hypothesis

On v1 (where pause blocks cancel), a compromised authority can: pause → rotate authority/config → unpause to perform a coup while preventing player exit.

### Attack Vector (v1)

1. Authority calls `pause_program`. Pause blocks cancel/settle/start_with_depositors.
2. Players in active matches cannot self-cancel during pause window.
3. Authority calls `update_config(new_authority = attacker)`.
4. Attacker calls `unpause_program`.
5. Attacker can now settle all in-flight matches in their favor (H003 + H002 chain).

v2 doesn't have this exact path (cancel/settle/reclaim are pause-immune in v2), but the partial-mitigation still applies for new matches.

### Target Code
- v1:112-122 (pause/unpause), 72-108 (update_config), all `!is_paused` constraints.

### Investigation Approach
1. Verify v1 pause guards on cancel/settle/start (yes per pre-scan).
2. Verify v2 has removed these (yes per state-machine agent).
3. Confirm permissionless_reclaim is callable during pause in both (yes — no config in struct).
4. Severity: HIGH on v1 because of the freeze window.

---

## H010: NOVEL — Authority Self-Rotation to Itself Across 2 TXs

**Category:** Access Control
**Estimated Priority:** Tier 3 (LOW — likely benign)
**Origin:** Novel

### Hypothesis

Investigate whether sequential `update_config` calls allow authority to revert to itself with a different role assignment, bypassing distinctness invariants.

### Investigation Approach
1. Walk through TX1 (rotate authority to A2) → TX2 (rotate treasury through A2 → A1) → TX3 (rotate authority back to A1).
2. Confirm distinctness check at v1:96-98 / v2:125-127 catches each step.
3. Likely safe but worth tracing carefully.

---

## H011: NOVEL — H028 v2: BPS Poisoning via Authority Layer-2 Compromise

**Category:** Arithmetic + Token & Economic + Upgrade & Admin
**Estimated Priority:** Tier 1 (HIGH)
**Origin:** Novel (Feb H028 dismissal INVALIDATED on v2)

### Hypothesis

v2's `fee_bps_treasury` and `fee_bps_ops` are runtime-mutable via `update_config`. Authority can ratchet fees up to 10% combined (MAX_FEE_BPS=1000) on every NEW match without an upgrade. Per-match snapshot protects in-flight matches but NEW matches use the new BPS.

### Attack Vector

1. Authority compromised. Attacker calls `update_config(new_fee_bps_treasury = 999, new_fee_bps_ops = 1)` → combined 1000 = passes cap.
2. Authority creates new matches — each snapshots (999, 1) BPS.
3. Each settle pays 9.99% to attacker-controlled treasury, 0.01% to attacker-controlled ops, 90% to "winner."
4. After many matches, authority calls `update_config(new_fee_bps_treasury = 700, new_fee_bps_ops = 300)` — restores normal-looking BPS.
5. Audit logs only reflect end-state config, not the duration of the high-BPS window.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `programs/solshot-escrow-v2/src/lib.rs` | `update_config` | 96-142 | Runtime BPS mutation (cap enforced) |
| `programs/solshot-escrow-v2/src/lib.rs` | `create_match` snapshot | 211-214 | Snapshot writes use current cfg |
| `programs/solshot-escrow-v2/src/lib.rs` | `settle_match` consumption | 396-425 | Reads snapshot, no re-validation |

### Prerequisites
- Authority key compromise.
- (Or malicious authority deliberately ratcheting — within cap, this is "policy" not vulnerability.)

### Potential Impact
**Severity:** HIGH
- Financial: extra 7% of every NEW match's pot (3% above default).
- v2-specific: not present in v1.

### Investigation Approach
1. Verify cap re-validation logic at v2:128-131.
2. Trace whether create_match validates the snapshot values post-write (likely NOT — only update_config validates).
3. Verify settle_match has no re-validation.
4. Severity: HIGH given the ratcheting pattern + no timelock.

### Indicators of Vulnerability
```rust
// In update_config — cap on update only
require!((cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32, ...);
// Missing: same check at create_match post-snapshot AND at settle_match
```

---

## H012: H028 RECHECK on v1 — BPS Constants Still Immutable Without Upgrade

**Category:** Arithmetic + Upgrade & Admin
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H028 v1 dismissal)

### Hypothesis

Confirm v1's `TREASURY_BPS = 700` and `OPS_BPS = 300` remain `const u64` and only changeable via Layer-1 program upgrade.

### Investigation Approach
1. Read v1:15-17 — verify still `const u64`.
2. Verify no instruction reads or writes these as runtime values.
3. Status: dismissal HOLDS for v1.

---

## H013: H012 RECHECK — Lamport Underflow on v2 N-Player Refund Loop

**Category:** Arithmetic + CPI
**Estimated Priority:** Tier 2 (verification)
**Origin:** RECHECK (Feb H012)

### Hypothesis

Re-validate the Feb H012 dismissal on v2's refund-all flow with u16 mask + 10-player ceiling. Specifically: can `escrow.lamports -= wager` underflow when called with maximum N?

### Investigation Approach
1. Verify per-iteration `bit_set` check prevents debiting beyond `count_ones × wager`.
2. Verify `overflow-checks=true` in profile would catch any wrap.
3. Compute: 10 × MAX_WAGER (100 SOL) = 1000 SOL = 10^12 lamports. Escrow PDA holds at most this much. Safe.
4. Status: HOLDS on v2 with the same defense layers.

---

## H014: H019 RECHECK — Narrowing Cast Safety on v2 (10-player pot)

**Category:** Arithmetic
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H019)

### Hypothesis

Verify u128 → u64 narrowing at v2 settle is safe with 10-player pot scaling.

### Investigation Approach
1. Verify pot ceiling: 100 SOL × 10 = 10^12 lamports. u64::MAX = 1.8 × 10^19. Safe.
2. Verify no other narrowing casts introduced in v2 (e.g., `start_with_depositors` math).

---

## H015: NOVEL — Lamport Credit Overflow on Destination Accounts

**Category:** Arithmetic + CPI
**Estimated Priority:** Tier 3 (defense-in-depth)
**Origin:** Novel

### Hypothesis

`**dest.try_borrow_mut_lamports()? += wager_lamports` uses bare `+=`. If a recipient already holds `existing + wager > u64::MAX`, panic in debug or wrap in release.

### Investigation Approach
1. Quantify: u64::MAX = 1.8 × 10^19 lamports = 1.8 × 10^10 SOL. Attacker would need accumulated 18 billion SOL. Impossible.
2. Recommend `checked_add` for defense-in-depth.
3. Status: practically unreachable; not a vulnerability under realistic conditions.

---

## H016: H007 RECHECK — Pause-as-Griefing on v1 cancel_match (Still Open)

**Category:** State Machine + Access Control
**Estimated Priority:** Tier 1 (HIGH on v1)
**Origin:** RECHECK (Feb H007)

### Hypothesis

v1's `cancel_match` still has `constraint = !config.is_paused` at v1:729. Authority pause blocks player cancel until permissionless_reclaim opens at +1200s (20 min, NOT 48h as the stale comment claims).

### Investigation Approach
1. Confirm constraint at v1:729 still present.
2. Confirm v2 cancel_match has no pause guard (per pre-scan).
3. Compute lockup window: from pause to permissionless_reclaim availability. Is it bounded by `created_at + 1200s` or by pause-time + 1200s?
4. Status: CONFIRMED still open in v1; FIXED in v2.

---

## H017: NOVEL — v1 Silent-Kick Attack via `start_with_depositors`

**Category:** State Machine + Access Control
**Estimated Priority:** Tier 1 (HIGH on v1)
**Origin:** Novel (cross-flagged by State Machine agent)

### Hypothesis

v1's `start_with_depositors` has NO timing gate (only requires state == AwaitingDeposits and num_deposited >= 2). Authority can call it the moment 2 deposits land, silently kicking late-broadcasting players whose TXs are mid-flight.

### Attack Vector

1. Match has max_players = 4. Players P1, P2 deposit. P3 broadcasts deposit TX (~400ms latency to leader).
2. Authority observes P3's deposit in mempool.
3. Authority front-runs with `start_with_depositors`. Compaction reduces max_players to 2; players[2,3] become Pubkey::default().
4. P3's deposit_wager TX arrives, fails on `state == Active` check or on `position()` lookup not finding P3 in the now-shorter players list. P3 paid TX fees + lost a slot.

v2 fixes this with `Clock::get >= deposit_deadline` gate at v2:336-339.

### Target Code
- v1:493-536 (start_with_depositors) — no timing gate.
- v2:323-382 — has timing gate.

### Investigation Approach
1. Verify v1 has no `Clock` check before allowing start_with_depositors.
2. Confirm v2 gate at v2:336-339.
3. Severity: HIGH on v1 (player loses TX fees + slot in race); FIXED in v2.

---

## H018: NOVEL — v2 Deposit-Window Edge Collision at `deposit_deadline`

**Category:** State Machine + Timing
**Estimated Priority:** Tier 3 (MEDIUM)
**Origin:** Novel

### Hypothesis

At exactly `T = deposit_deadline`, both `deposit_wager` (allows `<= deposit_deadline`) AND `start_with_depositors` (requires `>= deposit_deadline`) are valid. Non-deterministic ordering depending on Solana leader's TX selection.

### Investigation Approach
1. Verify both conditions are inclusive (`<=` and `>=`) at v2:260 and v2:337.
2. Determine which TX wins in same-slot race.
3. Document edge case; recommend tightening one bound to be exclusive.

---

## H019-H022: State Machine RECHECKs

**H019: H022 — GlobalConfig re-init blocked.** Tier 3. Verify Anchor `init` constraint at v1:546-552, v2:587-593 rejects re-init.

**H020: H023 — PDA revival post-close.** Tier 3. Verify close zeros data + reassigns ownership; revived PDA via init yields fresh state.

**H021: H024 — Settlement deadline bypass via activated_at.** Tier 3. Verify v1 activated_at is always set in same atomic block as state=Active; v2 has no settlement deadline so question is moot.

**H022: H030 — Cancel-from-AwaitingDeposits refund-all on v2.** Tier 2. Re-validate that v2's new refund-all flow handles partial-deposit cancellation correctly.

---

## H023: NOVEL CRITICAL — Partial-Refund Theft via `close = caller` Sweep

**Category:** CPI + State Machine + Token & Economic
**Estimated Priority:** Tier 1 (CRITICAL — needs PoC)
**Origin:** Novel (cross-flagged by CPI and Token/Economic agents independently)

### Hypothesis

A malicious player at `players[0]` (or any player after their slot's deposit timeout / public reclaim grace) calls `cancel_match` (or `permissionless_reclaim`) with `remaining_accounts = [self_only]`. The loop refunds them once. Then Anchor's `close = caller` sweeps the PDA's remaining lamports (including un-refunded co-depositors' wagers) to the caller's account.

**Worst case (v2 max match):** 9 × 100 SOL = 900 SOL stealable in a single TX.

### Attack Vector

1. Attacker is registered as `players[0]` in a v2 max match (10 players, 100 SOL each).
2. All 10 players deposit. State = Active. activated_at set. match_end_ts = now + duration_secs.
3. Wait for `match_end_ts` (or trigger pause-then-wait sequence).
4. Attacker calls `cancel_match` with `remaining_accounts = [self_only]`:
   - Loop iteration 0: bounds OK, bit 0 set, pubkey matches → debit escrow 100 SOL, credit attacker 100 SOL.
   - Loop terminates (no more remaining_accounts).
5. Anchor `close = caller` runs: drains PDA's remaining 900 SOL (9 un-refunded wagers) to caller's account, marks PDA as closed.
6. Total received: 100 SOL refund + 900 SOL sweep = 1000 SOL = entire pot.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `programs/solshot-escrow/src/lib.rs` | `cancel_match` loop | 391-410 | Loop + close=caller |
| `programs/solshot-escrow/src/lib.rs` | CancelMatch struct | 711-735 | `close = caller` at 718 |
| `programs/solshot-escrow/src/lib.rs` | `permissionless_reclaim` loop | 465-484 | Same pattern |
| `programs/solshot-escrow/src/lib.rs` | PermissionlessReclaim struct | 736-754 | `close = caller` at 745 |
| `programs/solshot-escrow-v2/src/lib.rs` | cancel_match loop | 502-518 | Same |
| `programs/solshot-escrow-v2/src/lib.rs` | CancelMatch struct | 743-765 | `close = caller` at 748 |
| `programs/solshot-escrow-v2/src/lib.rs` | permissionless_reclaim loop | 561-577 | Same |
| `programs/solshot-escrow-v2/src/lib.rs` | PermissionlessReclaim struct | 768-782 | `close = caller` at 773 |

### Prerequisites
- Attacker is registered in `escrow.players[0]` (or first deposited slot).
- Match is in a state where cancel or reclaim is callable (after timeout for cancel, after grace for reclaim).
- For v2: match_end_ts has passed; for v1: timeout deadline has passed.

### Potential Impact
**Severity if confirmed:** CRITICAL
- Financial: Up to (max_players - 1) × wager_lamports per match. v2 max = 900 SOL.
- Affects: every match in both v1 and v2.
- Detection: post-fact only (TX is already final on-chain).

### Investigation Approach
1. **PoC FIRST**: deploy to devnet (or LiteSVM) and attempt the attack. Read Anchor 0.32.1 close-handler source code to determine exact close-time lamport drain semantics.
2. Verify whether Anchor's `close = caller` runs:
   - (a) After all instruction handler logic completes
   - (b) Drains ALL remaining lamports to the destination
   - (c) Or whether it requires lamports == 0 first (would reject)
3. If (a) + (b) hold, the attack works as described.
4. **Counter-hypothesis to investigate:** Maybe Anchor's `Account<MatchEscrow>` deserialization at function entry locks the account with the current state (10 deposits worth of lamports). If the loop drains some + close drains rest, total still equals the original. The runtime invariant might be "lamports must equal expected_post_close" — verify this.
5. **If confirmed CRITICAL:** propose fix (require `remaining_accounts.len() == count_ones(deposits_mask)` AND assert all bits in mask are matched in the loop, OR convert `close = caller` to manual rent-only drain + state preservation).

### Indicators of Vulnerability

```rust
// In cancel_match handler:
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!((deposits_mask >> i) & 1 == 1, ...);  // bit set check
    require!(*account.key == players[i], ...);     // pubkey match
    **escrow.try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
// Loop terminates when remaining_accounts is exhausted —
// IF count_ones(deposits_mask) > remaining_accounts.len(),
// some deposited wagers stay in escrow.lamports.

// Then Anchor's #[account(close = caller)] sweeps escrow → caller.
```

### Indicators of Safety

```rust
// What a fix would look like:
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::InvalidPlayer
);
// PLUS verify each bit i in mask has a matching remaining_accounts[i].
```

---

## H024: NOVEL HIGH — Non-Contiguous `deposits_mask` is Permanently Unrefundable

**Category:** CPI + State Machine
**Estimated Priority:** Tier 1 (HIGH)
**Origin:** Novel (CPI agent NOVEL-CPI-01)

### Hypothesis

If `deposits_mask = 0b10` (player 1 deposited, player 0 didn't), no syntactically valid call sequence can refund player 1. Server logs as "UNRECOVERABLE."

### Attack Vector / Failure Mode

1. Match has 4 players. Player 1 (index 1) deposits first. Player 0 (index 0) never deposits.
2. Deposit deadline expires.
3. cancel_match invoked with `remaining_accounts = [players[1]]`:
   - Loop iteration 0: bit_set check: `(0b10 >> 0) & 1 == 0` → fails on InvalidPlayer.
4. cancel_match invoked with `remaining_accounts = [players[0], players[1]]`:
   - Loop iteration 0: bit_set check: bit 0 of 0b10 is 0 → fails.
5. cancel_match invoked with `remaining_accounts = [players[1]]`:
   - Loop iteration 0: pubkey check: `players[1] != players[0]` → fails.
6. No call sequence succeeds. Player 1's wager is locked permanently.

### Target Code
- All 4 refund loop sites (v1 cancel/reclaim, v2 cancel/reclaim).

### Prerequisites
- Production deposit ordering produces non-contiguous mask (any time Player N deposits before Player N-1 fails for any reason).

### Potential Impact
**Severity:** HIGH
- Financial: per-match wager × N un-refunded slots.
- Common occurrence: Player 0 fails to deposit while others succeed.

### Investigation Approach
1. Confirm by code inspection that the loop CANNOT skip indices.
2. Verify server's claim of "UNRECOVERABLE" at `server/socket-io/main.js:484-489`.
3. Construct test case: 2-player match, 0b10 mask, attempt all refund call shapes.
4. Document fix: refactor loop to walk `0..max_players` and look up the corresponding `remaining_account` via index map.

### Indicators of Vulnerability
```rust
// Loop can only handle contiguous prefix:
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!((deposits_mask >> i) & 1 == 1, ...);
    // No skip mechanism — i increments monotonically from 0.
}
```

---

## H025: H009 RECHECK — Executable-Account Fee Destination

**Category:** Account Validation + CPI
**Estimated Priority:** Tier 2 (HIGH)
**Origin:** RECHECK (Feb H009)

### Hypothesis

`treasury` and `ops` (and `winner`) are `UncheckedAccount`. No `!executable` constraint. If authority sets treasury or ops to an executable program account or sysvar, lamport credits via `try_borrow_mut_lamports` may silently succeed in-memory but be discarded at TX commit (per EP-106).

### Investigation Approach
1. grep `executable` in both lib.rs files — pre-scan reports zero matches.
2. Confirm SettleMatch struct has no `!treasury.executable` or `!ops.executable` constraint.
3. Verify Solana runtime behavior: does writing to a reserved/executable account silently succeed or panic?
4. Recommend fix: `constraint = !treasury.executable @ EscrowError::InvalidTreasury`.

---

## H026: H026 RECHECK — Donation Attack (Lamport Inflation to Escrow)

**Category:** CPI + Token & Economic
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H026 NOT_VULNERABLE)

### Hypothesis

External actor donates lamports to escrow PDA. Authority gains via `close = authority` on settle (or any caller via `close = caller` on cancel/reclaim). Attacker loses money.

### Investigation Approach
1. Verify donation is economically irrational for attacker.
2. Status: HOLDS in both versions.

---

## H027: H029 RECHECK — Atomic-TX Rollback Under Anchor 0.32.1

**Category:** Error Handling + CPI
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H029)

### Hypothesis

The 6 sequential `try_borrow_mut_lamports()?` calls in settle_match and the loop bodies in cancel/reclaim all use `?`. Verify Solana TX rollback restores all-or-nothing under Anchor 0.32.1.

### Investigation Approach
1. Verify atomic TX semantics unchanged in Anchor 0.32.1.
2. Check no unexpected behavior with Anchor 0.30+ auto-resolution.

---

## H028: NOVEL — Pubkey::default() in Zero-Padded Slots

**Category:** Account Validation
**Estimated Priority:** Tier 3 (defensive)
**Origin:** Novel

### Hypothesis

v1 `players: [Pubkey; 4]` is zero-padded with Pubkey::default() for unused slots. A future code change that loops over the full array (instead of `players[..max_players]`) would treat default as a valid player.

### Investigation Approach
1. Verify all current loops use bounded slice.
2. Document as defensive concern — brittle pattern.

---

## H029: NOVEL — Asymmetric Pot-vs-Mask Scaling

**Category:** Arithmetic + CPI
**Estimated Priority:** Tier 3 (defensive)
**Origin:** Novel (Arithmetic agent NOVEL-A2)

### Hypothesis

v2's u16 mask supports 16 bits but max_players ≤ 10. If `count_ones(mask)` could ever exceed `max_players` due to corrupted state, refund loop could over-debit escrow.

### Investigation Approach
1. Verify deposit_wager bit-set bounded by `player_index < max_players` via `position()` semantics.
2. Verify no other instruction modifies mask.
3. Status: structural invariant holds; flag for defensive coding review.

---

## H030: H002 RECHECK — Fee Destination Hijack via update_config

**Category:** Token & Economic + Access Control
**Estimated Priority:** Tier 1 (HIGH on v1)
**Origin:** RECHECK (Feb H002)

### Hypothesis

v1 settle reads `config.treasury` and `config.ops` LIVE at v1:686-687. Authority key compromised mid-match → attacker rotates treasury/ops via update_config → next settle sends fees to attacker.

v2 mitigates IN-FLIGHT matches via per-match snapshot at create. But NEW v2 matches created post-compromise still snapshot the poisoned config.

### Investigation Approach
1. Confirm v1:686-687 reads live config (not snapshot).
2. Confirm v2:717,726 reads `escrow.treasury_snapshot` and `escrow.ops_snapshot`.
3. Trace snapshot atomicity at v2:211-214.
4. Severity: CONFIRMED on v1, EVOLVED on v2 (half-mitigation).

---

## H031: H013 RECHECK — Rent Extraction at Low Wagers

**Category:** Token & Economic
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H013)

### Hypothesis

`close = caller` on cancel/reclaim sends rent (~0.0036-0.0061 SOL) to caller, not original payer. At low wagers, the rent leakage may dominate the wager.

### Investigation Approach
1. Compute rent for v1 (232-byte escrow) and v2 (509-byte escrow per pre-scan SPACE).
2. Confirm rent is paid by authority at create_match and not recovered on cancel/reclaim.
3. Status: economic leakage but pot conservation holds.

---

## H032: NOVEL — BPS Rotation Ratcheting Across Matches

**Category:** Token & Economic + Upgrade & Admin
**Estimated Priority:** Tier 2 (HIGH)
**Origin:** Novel

### Hypothesis

v2 authority can ratchet BPS across matches within the 10% cap with NO timelock. Authority could front-run a tournament with elevated BPS, take +3% extra, then revert before detection.

### Investigation Approach
1. Verify update_config can change BPS at any time without delay.
2. Verify ConfigUpdated event is emitted but no timelock structure exists.
3. Compute economic impact: +3% × volume = significant siphon over time.

---

## H033: NOVEL — start_with_depositors Griefing via Authority-Chosen Activation Timing

**Category:** Token & Economic + Timing
**Estimated Priority:** Tier 3 (MEDIUM — design concern)
**Origin:** Novel

### Hypothesis

Authority's choice of WHEN to call start_with_depositors influences pot size. Authority could call at a moment that disadvantages a specific player (e.g., when the player is mid-deposit-broadcast).

### Investigation Approach
1. Verify v1 has no timing gate (silent-kick via H017).
2. Verify v2's gate (must be after deposit_window) limits this attack.
3. Document v2's residual griefing surface.

---

## H034: NOVEL — MIN_WAGER + Extreme Low BPS = Silent Zero Fees

**Category:** Token & Economic
**Estimated Priority:** Tier 3 (LOW)
**Origin:** Novel

### Hypothesis

v2 authority can set `fee_bps_treasury = 0` and `fee_bps_ops = 0` — settle pays 100% to winner with no fee accrual. Combined with H011 (self-redirect), authority can subsidize matches where they control a player and tax matches where they're the treasury.

### Investigation Approach
1. Verify v2 cap allows 0/0 BPS (check distinctness only requires ≤ MAX, not > 0).
2. Document as differential extraction surface.

---

## H035: NOVEL CRITICAL — Settle-vs-Cancel Priority-Fee Race

**Category:** Timing + Token & Economic
**Estimated Priority:** Tier 1 (HIGH)
**Origin:** Novel (Timing agent — H006 inverted)

### Hypothesis

v1's current constants create a 50-minute window (T+601 to T+3600) where both settle (authority) and cancel (player) are simultaneously valid. A losing player can race-cancel via priority fees to deny legitimate settlement. v2 has the same architecture but the race window is the entire `match_end_ts` to `match_end_ts + 24h` interval.

### Attack Vector

1. Authority signals settle (e.g., off-chain prep for settle_match TX).
2. Losing player observes the impending settle (mempool monitoring or off-chain signal).
3. Losing player submits cancel_match TX with high priority fee.
4. Solana's leader prioritizes higher-fee TXs.
5. If cancel lands first: state = Cancelled, all players refunded (including loser), settle TX fails on InvalidState.
6. Loser saved 100 SOL wager loss; cost ~$0.30 priority fee.

### Target Code
- v1:264-272 (settle deadline), 357-378 (cancel timeout), 442-456 (reclaim).
- v2:387-454 (settle no deadline), 459-519 (cancel), 526-578 (reclaim).

### Investigation Approach
1. Quantify race window:
   - v1: from `activated_at + TIMEOUT_SECONDS = +600` to `activated_at + SETTLEMENT_TIMEOUT_SECONDS = +3600` for settle vs player cancel.
   - v2: from `match_end_ts` onwards for settle vs player cancel.
2. Confirm priority-fee bidding mechanics on Solana.
3. Document mitigation: shorter cancel-after-activation window, or settle-first-in-block invariant.

### Indicators of Vulnerability
```rust
// settle_match deadline (v1):
require!(now <= activated_at + SETTLEMENT_TIMEOUT_SECONDS, ...);
// cancel_match timeout (v1):
let timeout_deadline = timeout_reference + TIMEOUT_SECONDS;
let is_timed_out = now > timeout_deadline;
// → window: timeout_deadline < now <= settlement_deadline
//   (T+601 .. T+3600 in v1)
```

---

## H036: H006 RECHECK — Original 23h Dead Zone

**Category:** Timing
**Estimated Priority:** Tier 3 (verification)
**Origin:** RECHECK (Feb H006)

### Hypothesis

Verify the original H006 (23h dead zone where neither settle nor cancel works) has been replaced by the inverse race window (H035). Math has changed since Feb.

### Investigation Approach
1. Confirm constants: TIMEOUT_SECONDS=600, SETTLEMENT_TIMEOUT_SECONDS=3600 (current v1).
2. Confirm in Feb constants were TIMEOUT=86400, SETTLEMENT=3600 (creating 23h gap).
3. Verify the gap has inverted, not eliminated.
4. Status: STATUS_CHANGED — new flaw replaces old.

---

## H037: H010 RECHECK — Deposit Ordering Asymmetry

**Category:** Timing + Token & Economic
**Estimated Priority:** Tier 3 (MEDIUM)
**Origin:** RECHECK (Feb H010)

### Hypothesis

First depositor's funds locked while waiting for second. v1 partially mitigated via cancel-anytime in AwaitingDeposits. v2 explicitly bounds via deposit_window_secs.

### Investigation Approach
1. Verify v1 cancel timeout for AwaitingDeposits.
2. Verify v2 hard deadline at v2:255-262.
3. Status: PARTIAL — improvement in v2 but exposure remains.

---

## H038: H020 RECHECK — Clock Drift at v2 Short-Duration Matches

**Category:** Timing
**Estimated Priority:** Tier 3 (LOW-MED)
**Origin:** RECHECK (Feb H020)

### Hypothesis

Validator clock drift of 1-2s is 1.6-3.3% of v2's MIN_DURATION_SECS=60. Material in adversarial bidding scenarios.

### Investigation Approach
1. Verify MIN_DURATION_SECS lower bound.
2. Compute drift sensitivity at extreme values.
3. Status: bumped from LOW to MEDIUM in v2 short-duration scenarios.

---

## H039: NOVEL — v2 Unbounded duration_secs Lockup (8-Day Fund Lock)

**Category:** Timing + Access Control
**Estimated Priority:** Tier 2 (HIGH)
**Origin:** Novel

### Hypothesis

Authority can set duration_secs up to MAX_DURATION_SECS=604800 (7 days). Plus 24h grace = 8 days fund lockup. Authority gets nothing economically but can stall the protocol.

### Investigation Approach
1. Verify MAX_DURATION_SECS at v2:38-39.
2. Verify reclaim deadline = `match_end_ts + 24h`.
3. Compute total lockup horizon.
4. Recommend tighter cap (e.g., 24h max for production).

---

## H040: NOVEL — Stale 48-Hour Comment Misleads Operators

**Category:** Documentation / Error Handling
**Estimated Priority:** Tier 3 (LOW)
**Origin:** Novel

### Hypothesis

`v1:22-23` says "48-hour permissionless reclaim timeout" but actual is 1200s = 20 min. Operators reading the comment plan for 48h windows.

### Investigation Approach
1. Read v1:22-23.
2. Verify actual constant value.
3. Recommend fixing the comment.

---

## H041: H016 RECHECK — close = caller Rent Theft (Both)

**Category:** State Machine + Token & Economic
**Estimated Priority:** Tier 3 (LOW)
**Origin:** RECHECK (Feb H016)

### Hypothesis

A non-depositing observer can race to call cancel after timeout (matching `is_player` test) and pocket the PDA rent reserve (~0.002 SOL).

### Investigation Approach
1. Confirm `close = caller` on cancel/reclaim in both versions.
2. Compute rent value.
3. Status: LOW per Feb; race surface remains.

---

## H042: NOVEL — GlobalConfig Has No Close Path (Key-Loss Permanence)

**Category:** Upgrade & Admin
**Estimated Priority:** Tier 2 (HIGH operational)
**Origin:** Novel

### Hypothesis

No `close_config` instruction exists. If authority key is lost AND H001 stays open, GlobalConfig is permanently locked. Recovery requires Layer-1 program upgrade introducing a recover instruction — which itself requires upgrade-key access.

### Investigation Approach
1. grep for `close = ` near GlobalConfig usages.
2. Verify no instruction can rotate authority without authority signing.
3. Document operational risk.

---

## H043: NOVEL — Idempotent Pause Emits No Event

**Category:** Upgrade & Admin
**Estimated Priority:** Tier 3 (LOW operational)
**Origin:** Novel

### Hypothesis

`pause_program` and `unpause_program` are idempotent and emit no events. State changes cannot be tracked off-chain via event-replay.

### Investigation Approach
1. Verify no Paused/Unpaused events at v1:112-122, v2:146-154.
2. Recommend adding events for off-chain monitoring.

---

## H044: NOVEL — Single Hot Wallet for Layer 1 + Layer 2

**Category:** Upgrade & Admin + Access Control
**Estimated Priority:** Tier 1 (CRITICAL operational)
**Origin:** Novel (verified live)

### Hypothesis

The same hot wallet `HPyV...nokv` holds both Solana-level upgrade authority and application-level config.authority for both v1 and v2. Single-key compromise = total protocol drainage AND ability to deploy malicious replacement bytecode.

### Investigation Approach
1. `solana program show <program_id>` for both v1 and v2 (verified by Upgrade/Admin agent).
2. Verify deploy keypair == config init authority.
3. Document for the report. Pre-mainnet decision per JJ.

---

## H045: NOVEL — Snapshot Drift Across update_config Calls (Audit Trail Gap)

**Category:** Upgrade & Admin + Token & Economic
**Estimated Priority:** Tier 3 (LOW operational)
**Origin:** Novel

### Hypothesis

v2 per-match BPS snapshot is taken at create_match. Different matches in flight may have different snapshots. There's no on-chain audit trail relating snapshot → config-version. Off-chain monitoring can't easily detect "this match was created with poisoned config."

### Investigation Approach
1. Verify create_match emits MatchCreated event with snapshot values.
2. Identify any gap in event coverage.
3. Recommend: include `config_version` field in snapshot.

---

## H046: NOVEL — Layer-1 Bytecode Replacement Risk

**Category:** Upgrade & Admin
**Estimated Priority:** Tier 1 (CRITICAL operational)
**Origin:** Novel

### Hypothesis

Upgrade authority can deploy malicious replacement bytecode that drains all MatchEscrow PDAs in one TX. EP-083 pattern. No timelock, no notice period, no on-chain governance.

### Investigation Approach
1. Verify upgrade authority has full control (BPF Loader Upgradeable defaults).
2. Document as Layer-1 single-key risk.
3. Pre-mainnet recommendation: transfer upgrade authority to multisig.

---

## H047: NOVEL — UncheckedAccount No `is_writable` Check At-Program

**Category:** Account Validation
**Estimated Priority:** Tier 3 (defense-in-depth)
**Origin:** Novel

### Hypothesis

`remaining_accounts` writability is not enforced in-program. The lamport credit operation requires writability — Solana runtime would reject if not writable, but the program doesn't pre-check.

### Investigation Approach
1. Confirm Solana runtime rejects writes to non-writable accounts.
2. Recommend adding `account.is_writable` check for fail-fast.

---

## H048: NOVEL — Permissionless Reclaim Caller Default-Pubkey

**Category:** Account Validation
**Estimated Priority:** Tier 3 (LOW)
**Origin:** Novel

### Hypothesis

`permissionless_reclaim` doesn't explicitly check `caller != Pubkey::default()`. Solana runtime won't allow default-pubkey signer in practice, but combined with `close = caller`, the semantic intent leans on runtime guarantees.

### Investigation Approach
1. Verify Solana runtime rejects default-pubkey signers.
2. Document defense-in-depth gap.

---

## H049: NOVEL — match_id PDA Seed Entropy

**Category:** Account Validation + State Machine
**Estimated Priority:** Tier 3 (cross-domain)
**Origin:** Novel

### Hypothesis

match_id is a 4-character server-generated string (per project memory: "Server generates 4-character match ids"). 4 chars from a small alphabet = limited entropy. PDA seed collision possible if entropy < 32 bits.

### Investigation Approach
1. Identify match_id alphabet and length in server code.
2. Compute collision probability.
3. Status: server-side concern, but on-chain has no entropy check. Cross-handoff to DB scope.

---

## H050: S001/S002 RECHECK — Combined Attack Chain Status

**Category:** Multi-domain
**Estimated Priority:** Tier 1 (CRITICAL — chain)
**Origin:** RECHECK (Feb S001 + S002)

### Hypothesis

Verify status of the original combined-attack chains:
- **S001** = H001 + H002 + H005 (authority takeover + fee redirect + winner fraud).
- **S002** = H003 + H007 (distinctness poison + pause double lock).

### Investigation Approach
1. Determine status of each component finding (H001, H002, H003, H005, H007).
2. S001: H001 still open in both. H002 still open on v1, mitigated for in-flight on v2. H005 still open by design. **Chain still works on v1; partially mitigated on v2.**
3. S002: H003 fixed in both (distinctness re-validated post-update). H007 still open on v1, fixed on v2. **Chain partially closed on v1; closed on v2.**

---

## Cross-Strategy Analysis

### Potentially Related Strategies

| Strategy A | Strategy B | Potential Combination |
|------------|------------|----------------------|
| H001 | H002 | One-step rotation enables instant treasury redirect chain |
| H001 | H003 | Authority compromise enables systematic winner fraud |
| H001 | H011 | Authority compromise → BPS poisoning → 10% siphon (v2 only) |
| H001 | H023 | Authority compromise → cancel-with-self trick to drain pots |
| H016 | H035 | v1 pause + race window = compounded griefing |
| H023 | H024 | Both attack the refund loop pattern; investigate together |
| H025 | H047 | Both UncheckedAccount defense-in-depth gaps |
| H011 | H032 | Configurable BPS attack surface — any-time mutation |
| H017 | H033 | Authority compaction timing griefing patterns |
| H035 | H039 | Timing-based griefing pairs |

### Investigation Priority Order

**Tier 1 (Investigate First — CRITICAL):**

1. **H023** — Partial-refund theft via close=caller. NEEDS PoC FIRST. If confirmed, this is the highest-impact finding in the audit.
2. **H024** — Non-contiguous mask permanently unrefundable. Confirms a known fund-lock pattern.
3. **H001** — One-step authority transfer (verify still open by design).
4. **H050** — Combined chain status (touches H001, H002, H003, H007).
5. **H035** — Settle-vs-cancel race (CRITICAL economic loss potential).
6. **H011** — H028 invalidated on v2 (BPS poisoning path).
7. **H030** — H002 verification (v1 live read still vulnerable).
8. **H016** — H007 still open on v1.
9. **H017** — v1 silent-kick attack (NEW novel finding).
10. **H044** — Single hot wallet Layer 1 + Layer 2 (verified live).
11. **H046** — Layer-1 bytecode replacement risk.
12. **H004** — S004 fix verification.

**Tier 2 (HIGH — Investigate Second):**

13. **H002** — H011 self-redirect chain.
14. **H003** — H005 winner fraud.
15. **H006** — H014 collusion.
16. **H013** — H012 v2 underflow re-validation.
17. **H022** — H030 v2 refund-all flow.
18. **H025** — H009 executable check.
19. **H032** — BPS rotation ratcheting.
20. **H039** — v2 unbounded duration.
21. **H042** — GlobalConfig has no close path.

**Tier 3 (MEDIUM-LOW — Investigate Last):**

Remaining strategies (H005, H007-H010, H012, H014-H015, H018-H021, H026-H029, H031, H033-H034, H036-H038, H040-H041, H043, H045, H047-H049).

---

## Statistics

| Category | Count | Tier 1 | Tier 2 | Tier 3 | Origin |
|----------|-------|--------|--------|--------|--------|
| Access Control | 10 | 4 | 3 | 3 | 7 RECHECK / 3 Novel |
| Arithmetic | 5 | 1 | 1 | 3 | 3 RECHECK / 2 Novel |
| State Machine | 7 | 2 | 1 | 4 | 4 RECHECK / 3 Novel |
| CPI & External | 7 | 2 | 1 | 4 | 3 RECHECK / 4 Novel |
| Token & Economic | 5 | 1 | 1 | 3 | 2 RECHECK / 3 Novel |
| Timing & Ordering | 6 | 1 | 1 | 4 | 3 RECHECK / 3 Novel |
| Upgrade & Admin | 6 | 2 | 1 | 3 | 1 RECHECK / 5 Novel |
| Account Validation | 4 | 0 | 0 | 4 | 0 RECHECK / 4 Novel |
| **TOTAL** | **50** | **13** | **9** | **28** | **23 RECHECK / 27 Novel (54%)** |

---

## Supplemental Strategies

(Initially empty — populated after Phase 4 Batch 1 surfaces additional hypotheses.)

---

## Notes for Investigators

### General Guidance

- **H023 must be investigated FIRST.** It is the highest-impact novel finding and requires a PoC against Anchor 0.32.1's close-handler semantics. Do NOT assume the attack works — verify.
- Reference `.audit/ARCHITECTURE.md` for the unified architectural context.
- Reference `.audit/HANDOVER.md` Findings Digest + False Positive Log for prior-audit context.
- Write findings to `.audit/findings/H{XXX}.md`.
- Note any discoveries that suggest NEW strategies (add to Supplemental Strategies section).
- Distinguish CONFIRMED (exploitable) from POTENTIAL (conditional on authority compromise) — the audit's report will calibrate severity differently for each.

### Status Definitions

- **CONFIRMED**: Vulnerability exists and is exploitable as described.
- **POTENTIAL**: Could be vulnerable under specific conditions (e.g., authority key compromise — common precondition in this audit).
- **NOT VULNERABLE**: Protected against this attack; defense-in-depth holds.
- **NEEDS MANUAL REVIEW**: Could not determine; needs JJ or domain expert.

### Key Codebase Notes

- v1 source: `programs/solshot-escrow/src/lib.rs` (962 LOC).
- v2 source: `programs/solshot-escrow-v2/src/lib.rs` (1020 LOC).
- Anchor 0.32.1 — auto-resolution rules apply (see `Docs/internal/PRIOR_AUDIT_DELTA.md`).
- BOK proptests at `programs/solshot-escrow/tests/bok_*.rs` cover v1 ONLY. v2 has no formal verification coverage.
- Both programs deployed live to devnet: v1 = `4kzr...nH1`, v2 = `BVKX...G7N`.

---

**This catalog is the input for Phase 4: Parallel Investigation.**
