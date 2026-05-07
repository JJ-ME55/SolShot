---
task_id: sos-phase1-token-economic
provides: [token-economic-findings, token-economic-invariants]
focus_area: token-economic
files_analyzed:
  - programs/solshot-escrow/src/lib.rs (v1, 962 LOC)
  - programs/solshot-escrow-v2/src/lib.rs (v2, 1020 LOC)
  - programs/solshot-escrow/tests/bok_proptest_fee.rs (BOK Feb proptest harness for fee math)
finding_count: 12
severity_breakdown: {critical: 0, high: 5, medium: 4, low: 3}
---
<!-- CONDENSED_SUMMARY_START -->
# Token & Economic — Condensed Summary

## Token Flow Diagram (high-level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DEPOSIT PHASE (player → escrow PDA)                                       │
│                                                                            │
│   each player ──[system_program::transfer(wager_lamports)]──> escrow PDA  │
│                                                                            │
│   POT = wager × count_ones(deposits_mask)   [u128 widening]                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ SETTLE PATH (escrow PDA → 3 destinations)                                  │
│                                                                            │
│   v1 reads LIVE config:    treasury, ops, TREASURY_BPS=700, OPS_BPS=300   │
│   v2 reads SNAPSHOT:       escrow.treasury_snapshot, ops_snapshot,        │
│                            fee_bps_treasury_snapshot, fee_bps_ops_snapshot│
│                                                                            │
│       ┌─→ winner   = pot - treasury_amt - ops_amt    (≈90% + dust ≤2)    │
│   POT ┼─→ treasury = pot × treasury_bps / 10_000     (≈7%)                │
│       └─→ ops      = pot × ops_bps / 10_000          (≈3%)                │
│                                                                            │
│   THEN close = authority returns escrow rent to authority                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ CANCEL/RECLAIM PATH (escrow PDA → original depositors)                    │
│                                                                            │
│   for each remaining_account in player-index order:                        │
│     escrow PDA ─[direct lamport math: wager_lamports]─> player[i]         │
│   THEN close = caller returns rent to caller (NOT depositors)              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Findings (Top 10)

1. **v1 still reads LIVE config at settle** for treasury/ops destination + BPS, leaving in-flight matches vulnerable to authority hijack — `lib.rs:686-687, 286-298`
2. **v2 mitigates fee redirect via per-match snapshot** of `treasury_snapshot`/`ops_snapshot`/`fee_bps_*_snapshot` set at create_match, immune to mid-flight `update_config` — `lib.rs:211-214, 717-728, 396-399`
3. **v2 fee cap (MAX_FEE_BPS=1000) enforced at BOTH init AND update** paths via identical require! (lines 76-79 init, 128-131 update) — half-mitigation acknowledged: cap protects against >10% fees on NEW matches, but in-flight matches keep their snapshot regardless of update
4. **H028 v2 verdict: PARTIALLY EXPLOITABLE** — runtime-configurable BPS lets authority set fee_bps_treasury+fee_bps_ops up to 1000 (10%) on NEW matches, capped but NOT zero. Combined with H001 (no pending_authority), an attacker with stolen authority can drain 10% of all FUTURE pots until detected — `v2:118-131`
5. **H011 v1: still possible** — authority can update config.treasury = config.authority and earn 7% on every IN-FLIGHT and FUTURE settlement (no constraint preventing self-redirect when fee destination doesn't equal authority directly — only treasury != ops is checked) — `v1:96-98`
6. **H011 v2: still possible at create-time** — same self-redirect pattern, but only affects NEW matches (snapshot freezes destinations); in-flight matches protected — `v2:125-127`
7. **H013 v2 RE-VALIDATE: rent extraction now favors caller, not depositor** — `close = caller` on cancel/reclaim sends rent (~0.0036 SOL = MatchEscrow::SPACE rent) to whoever calls, not necessarily original payer. Authority pays rent at create_match but cannot recover it on cancel — small economic leakage to caller, but not exploitable for net theft since pot conservation still holds — `v1:718, 745; v2:748, 773`
8. **start_with_depositors pot is correctly scaled** by `count_ones(deposits_mask)`, not `max_players`. Non-depositors aren't credited; pot = wager × num_deposited; no double-credit — `v1:526-528; v2:371-373`
9. **Pot ceiling math** — v1 max pot = 100 SOL × 4 = 400 SOL (4×10^11 lamports); v2 max pot = 100 SOL × 10 = 1000 SOL (10^12 lamports). u64::MAX = 1.8×10^19 — both fit comfortably even before u128 widening — `v1:285-300; v2:402-418`
10. **Dust property holds in v2 with configurable BPS**: winner = total_pot - treasury_amt - ops_amt absorbs all integer-division floor remainder. Max 2 lamports dust to winner regardless of bps values (only 2 division operations in fee path) — `v2:421-425`

## Critical Mechanisms

- **Settlement split (v1)**: hardcoded `TREASURY_BPS = 700`, `OPS_BPS = 300`, `BPS_DENOMINATOR = 10_000`. Pot read from `wager × count_ones(deposits_mask)`. Fees from `(pot as u128 × bps) / 10_000` cast to u64. Winner = pot - treasury - ops. Any future BPS change requires program upgrade. — `programs/solshot-escrow/src/lib.rs:285-307`
- **Settlement split (v2)**: BPS are per-match snapshots (`fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot`) read from MatchEscrow at settle time. Combined cap MAX_FEE_BPS=1000 enforced at config init/update. Per-match snapshot is set at create_match from current config values. — `programs/solshot-escrow-v2/src/lib.rs:213-214, 396-425`
- **Pot calculation**: Both versions use `(wager_lamports as u128).checked_mul(count_ones(deposits_mask) as u128)`. Solely native SOL, no SPL tokens. — `v1:285-288; v2:402-406`
- **Refund path (cancel/reclaim)**: Both versions iterate `remaining_accounts` in player-index order, validate bit-set in deposits_mask, validate pubkey matches escrow.players[i], then direct lamport math: `escrow -= wager` and `player += wager`. — `v1:391-410, 465-478; v2:502-510, 561-569`
- **Direct lamport mutation**: Both versions use `**ctx.accounts.X.to_account_info().try_borrow_mut_lamports()? -=/+= amount` (no system_program::transfer CPI for outflow — required because escrow is program-owned, not system-owned). The `close = X` constraint reclaims residual rent to X after instruction completes. — `v1:317-324, 408-409, 476-477; v2:434-441, 508-509, 567-568`

## Invariants & Assumptions

- **INVARIANT (Pot conservation, BOK-verified for v1)**: `winner_amount + treasury_amount + ops_amount == total_pot`. Holds for hardcoded BPS in v1. — enforced at `v1:303-307` (winner = pot - treasury - ops by construction)
- **INVARIANT (Pot conservation, NEEDS BOK on v2)**: same identity, but with snapshot-derived configurable BPS. NEEDS RE-VERIFICATION — `v2:421-425` ⚠
- **INVARIANT (Refund conservation)**: For cancel/reclaim: sum of `wager_lamports × count_ones(deposits_mask)` lamports leaves escrow exactly once. — enforced via per-iteration `bit_set` check at `v1:398, 466; v2:504, 563` AND single subtraction per iteration {assumes no integer underflow on PDA balance — see ASSUMPTION below}
- **INVARIANT (Pot ceiling)**: `wager_lamports ≤ MAX_WAGER_LAMPORTS (100 SOL)`. Pot ceiling = MAX_WAGER × MAX_PLAYERS = 100 SOL × 10 (v2) = 1000 SOL = 10^12 lamports. Fits comfortably in u64. — enforced at `v1:138; v2:171`
- **INVARIANT (Min wager economic)**: `wager_lamports ≥ MIN_WAGER_LAMPORTS (10,000)`. Ensures both fee components are at least 1 lamport (v1's hardcoded 7%/3% split). — enforced at `v1:137; v2:170`. ⚠ For v2 with configurable BPS, this minimum was sized for 7%/3% — if treasury_bps drops to e.g. 1 bps, fees can still hit 0 (10,000 × 1 / 10,000 = 1; 1,000 × 1 / 10,000 = 0). NOT_FORMALLY_VERIFIED for arbitrary BPS values.
- **INVARIANT (Settlement does not exceed pot)**: dust ≤ 2 lamports. Winner remainder formulation absorbs all rounding loss. BOK Feb verified for v1. — enforced at `v1:303-307; v2:421-425`. ⚠ NEEDS RE-BOK for v2's configurable BPS (but property is structural, should hold for any BPS pair).
- **ASSUMPTION (Authority is honest about config values)**: `update_config` allows authority to set treasury and ops to ANY pubkey distinct from each other and from authority — but the authority itself has free choice. UNVALIDATED at `v1:78-108; v2:96-142` ⚠ — cannot prevent self-redirect via secondary wallet (H011 family).
- **ASSUMPTION (Pot lamports ≥ rent reserve at settle/refund)**: Direct lamport math assumes escrow PDA has at least `winner_amount + treasury_amount + ops_amount + rent_reserve` lamports. Created at deposit time — sum of deposits = wager × count_ones, plus initial rent for `init`. UNVALIDATED at `v1:317-324; v2:434-441` (no explicit balance check — but pot conservation by construction makes this true).
- **ASSUMPTION (deposits_mask integrity)**: bits set in deposits_mask correspond 1:1 to actual deposits (no spurious bit setting). VALIDATED via the `(deposits_mask >> player_index) & 1 == 0` check at `v1:208; v2:270` and bit set after CPI at `v1:226; v2:287`.
- **ASSUMPTION (No SPL token logic in scope)**: Both programs are pure native SOL escrow. No SPL/Token-2022 mints, no transfer hooks, no permanent delegates. CONFIRMED — `BOK_HOT_SPOTS:18-19`.

## Risk Observations (Prioritized)

1. **HIGH — v1 fee redirect via update_config still LIVE-READ at settle**: `v1:686-687` reads `config.treasury` and `config.ops` at settle time. Authority changing config.treasury via `update_config` (line 78) will redirect ALL future settlements, INCLUDING in-flight matches. Combined with H001 (no pending_authority), if authority key is compromised, attacker drains 7% from every ongoing match.
2. **HIGH — v2 H028 partially exploitable on NEW matches**: `v2:118-131` allows authority to set fee_bps_treasury and fee_bps_ops up to combined 1000 (10%) at any time. Snapshot mitigates IN-FLIGHT but every NEW match created after the change uses the new BPS. Authority could front-run a tournament with elevated BPS, take +3% extra, then revert.
3. **HIGH — H011 self-redirect path exists in both versions**: `v1:96-98; v2:125-127` — `update_config` only requires `authority ≠ treasury`, `authority ≠ ops`, `treasury ≠ ops`. Authority can use a secondary wallet (`treasury_alt`) it controls and earn 7% on every settlement. Already documented as authority-trust assumption (centralization risk), but the OPS_BPS revenue stream is captured by authority too if authority controls ops_alt.
4. **MEDIUM — H028 v2 cap is per-update not per-match**: Authority can ratchet bps to 999/1 today, settle 100 matches at ~10% extraction, ratchet to 0/0 tomorrow. Per-update bounds checked but no rate-limiting / timelock. — `v2:128-131`
5. **MEDIUM — MIN_WAGER tuned for v1's 7%/3% split, NOT for v2's configurable BPS**: At MIN_WAGER=10,000 lamports and v2 with treasury_bps=1, ops_bps=999 (combined 1000, valid), treasury_amount = 10,000×1/10,000 = 1, ops_amount = 10,000×999/10,000 = 999. OK at this config. But at min wager × 2 players = 20,000 pot with treasury_bps=50, ops_bps=950: treasury = 20,000×50/10,000 = 100; ops = 20,000×950/10,000 = 1,900. OK. At wager=10,000, num_deposited=2, pot=20,000 with treasury_bps=4 and ops_bps=996: treasury = 20,000×4/10,000 = 8; ops = 20,000×996/10,000 = 1,992. Safe. The v2 cap (combined 1000 bps) prevents underflow at MIN_WAGER × 2 when one component is 1 bps: 20,000 × 1 / 10,000 = 2. Always ≥ 0, conservation holds. **At combined bps=0 (treasury=0, ops=0)**: winner gets 100% of pot, both fee accounts get zero. Conservation holds; no dust loss. Safe. **No underflow at the floor**.
6. **MEDIUM — close = caller economic leakage on cancel/reclaim**: `v1:718, 745; v2:748, 773` — rent (~0.0036 SOL for v1's 232-byte escrow, ~0.0061 SOL for v2's 509-byte escrow) goes to `caller` after refunds. Original rent payer (authority at create_match) cannot recover. Net effect: authority subsidizes ~0.006 SOL per cancel + reclaim. Combined with the 1-min minimum deposit window, this is an O(1) fixed cost — economically irrational at ≥0.01 SOL wagers but adds friction for griefing. Net economic impact: tens of thousands of cancels would be needed for material rent drain, well beyond reasonable adversary effort.
7. **LOW — start_with_depositors pot scaling correctness verified**: `v1:526-528; v2:371-373` — pot = wager × count_ones(deposits_mask). Non-depositors aren't represented in count_ones, so pot is correctly bounded by what's actually in the escrow. No double-credit risk. (Verified — `count_ones` after compaction matches the count before compaction.)
8. **LOW — v2 snapshot is bound to creation, not match start**: A 24-hour deposit window means `start_with_depositors` could activate a match using `fee_bps_*_snapshot` values that are 24+ hours old. Authority could change fees for all NEW matches, but cannot retroactively increase a match's fees. This is the design intent — flag for documentation.

## Novel Attack Surface

- **Per-match BPS snapshot vs. authority+create timing**: An attacker who has compromised the authority key and is trying to maximize extraction faces a tradeoff. Path A: `update_config` to bump BPS to 10% → wait for new matches to be created → settle them. Path B: settle existing matches FIRST (at their snapshotted BPS) using authority capabilities (e.g., `settle_match` to a controlled winner — H005) — then update config and farm new matches. Path B is faster (no waiting for new match creation). The snapshot architecture incentivizes attackers to focus on H005 (settle to controlled winner) for in-flight matches and H011 (self-redirect) for new matches. **The snapshot is a defense-in-depth layer that constrains but doesn't eliminate authority extraction.**
- **MIN_WAGER + extreme low BPS = silent zero fees**: If authority sets fee_bps_treasury=0 and fee_bps_ops=0, settle pays 100% to winner with no fee accrual. This isn't an attack — it's intentional waiver — but combined with H011 (self-redirect to attacker treasury), the attacker can "subsidize" certain matches (set BPS to 0 for matches where authority controls a player) and "tax" others (set BPS to 1000 for matches where authority is the treasury). Differential extraction.
- **Pot ceiling with v2's 10-player support**: At MAX_WAGER (100 SOL) × 10 players = 1000 SOL pot. This is single-pot-on-program at any moment. If authority is compromised at the moment a 1000 SOL pot is funded, settle_match sends 100 SOL (10% via maxed BPS) to attacker's treasury alt — vs. v1's max ~40 SOL @ 10% on 4 players. v2's higher player ceiling raises per-incident damage by 2.5×.

## Cross-Focus Handoffs

- → **Access Control Agent**: H001 (no pending_authority field) is the root cause of every economic finding above. v2 still missing two-step authority transfer at `v2:602-613`. Verify whether the centralization model is acceptable for mainnet.
- → **Arithmetic Agent**: BOK-verified the pot/fee math for v1's hardcoded 700/300. v2 introduces configurable BPS — the dust ≤ 2 lamports property should still hold (only 2 division ops) but proptest harness should be re-run with configurable BPS as a search parameter. Specifically: verify `total_pot ≥ treasury_amount + ops_amount` for ALL valid BPS pairs in [0..1000] × [0..1000-treasury_bps] and ALL pots in [MIN_WAGER × 2 .. MAX_WAGER × 10].
- → **State Machine Agent**: `MatchState::Settled` is terminal (good); but `start_with_depositors` activates a match using snapshot from create-time. If authority changes config between create and start, the snapshot is stale (intentionally). Verify whether stale snapshot can cause economic anomaly (e.g., MAX_FEE_BPS was 1000 at create, MAX_FEE_BPS could only increase via program upgrade — so snapshot ≤ current cap by induction). 
- → **Timing Agent**: H006 v1 dead-zone is a Token & Economic concern: between SETTLEMENT_TIMEOUT (3600s after activation) and PERMISSIONLESS_RECLAIM_TIMEOUT (1200s after creation OR activation), funds may be locked. Specifically, if activated_at = X, settle deadline = X + 3600, reclaim deadline = X + 1200. So reclaim opens BEFORE settle closes — actually this means "race window" not "dead zone." Need timing focus to verify the exact gap math against current constants.
- → **CPI Agent**: All deposit CPIs are `system_program::transfer` (validated). All settlement/refund outflows are direct lamport math (no CPI) — this is correct for program-owned PDAs but does NOT respect rent-exemption automatically. Verify that none of `winner.lamports`, `treasury.lamports`, `ops.lamports`, or `player[i].lamports` can be written if those accounts are reserved/executable (EP-106 lamport transfer dangers).

## Trust Boundaries

The escrow programs assume the **authority key is fully trusted** to:
- Select the legitimate winner at settlement (no on-chain proof of game outcome)
- Set fee destinations honestly (no constraint preventing self-redirect)
- Update fee BPS within the cap honestly (no timelock or governance)
- Cancel matches at appropriate times

The economic model is **non-custodial of player wagers** but **custodial of fee distribution**. Players are protected from drain (cannot send to non-players via settle, due to `winner ∈ players` constraint). Players are NOT protected from authority skimming up to 10% (v2) / fixed 10% (v1) of every pot. Permissionless reclaim is the only failsafe — it requires waiting 24h (v2) or 20min (v1) past timeout before any non-authority can recover funds.

Pure native SOL — no SPL tokens, no oracles, no Token-2022 extensions, no flash loans (Solana has no native flash loan; no protocol flash loan integration). The economic surface is bounded to authority extraction + H006 race timing.
<!-- CONDENSED_SUMMARY_END -->

---

# Token & Economic — Full Analysis

## Executive Summary

The SolShot escrow programs implement a **pure native SOL betting escrow** with a fixed 90/7/3 winner/treasury/ops split (v1) or a runtime-configurable split capped at 10% combined fees (v2). There are NO SPL tokens, NO oracles, NO flash loan interactions, and NO Token-2022 extensions in the on-chain surface. The economic model is straightforward: each player deposits a fixed wager into a per-match PDA, and settlement distributes the accumulated pot to the winner (selected by authority), with a portion going to fee destinations.

The major v2 architectural change is **per-match snapshot** of fee destinations and BPS values, taken at create_match time. This is a defense-in-depth measure against authority compromise — even if the authority key is stolen mid-match, the in-flight match's fee destinations and split are immutable. However, NEW matches created after a config change will use the updated values; this is the v2 half-mitigation.

The most pressing token/economic concerns are inherited authority-centralization patterns (H001 family) where the single authority key controls fee destinations, BPS values, and winner selection. Pot math has been BOK-verified for v1's hardcoded BPS; v2's configurable BPS introduces a new (small) verification gap that should be closed with a re-run of the proptest harness covering arbitrary valid BPS pairs.

## Scope

**Files analyzed:**
- `programs/solshot-escrow/src/lib.rs` — v1, 962 LOC. The original 1v1 program rewritten to N-player (2-4). Modified +247/-140 since Feb audit. Already deployed to devnet at `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`.
- `programs/solshot-escrow-v2/src/lib.rs` — v2, 1020 LOC. NEW since Feb audit. Never deployed/audited. 2-10 players, configurable BPS, per-match snapshots, explicit duration model. Declares `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`.
- `programs/solshot-escrow/tests/bok_proptest_fee.rs` — Feb BOK proptest harness for fee invariants on v1's hardcoded BPS. Reference for property tests.

**Functions analyzed (token/economic surface):**
- v1: `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim`, `start_with_depositors`, `update_config`
- v2: same set, plus `initialize_config` (now sets BPS), and the snapshot mechanism in `create_match`

**Estimated coverage:** 100% of token/economic-related code in both programs.

## Key Mechanisms

### Mechanism 1: Pot Accumulation via System Program Transfer
**Location:** `programs/solshot-escrow/src/lib.rs:213-222` (v1); `programs/solshot-escrow-v2/src/lib.rs:275-284` (v2)

**Purpose:**
Each player deposits exactly `wager_lamports` into the per-match escrow PDA. Pot grows monotonically with each deposit.

**How it works:**
1. Player calls `deposit_wager` (signer = player).
2. Program reads wager amount from the escrow account (already set at create_match).
3. Program checks state == AwaitingDeposits.
4. Program checks player is in the players[] array, finds index.
5. Program checks bit at index in deposits_mask is unset (no double-deposit).
6. v2 only: program checks current Clock < deposit_deadline.
7. Program issues `system_program::transfer(player → escrow PDA, wager)` via CPI.
8. Program sets bit in deposits_mask.
9. If full mask reached: state transitions to Active, and v2 sets match_end_ts = now + duration_secs.

**Assumptions:**
- player has at least `wager_lamports + transaction_fees` in their account (system_program::transfer rejects on insufficient funds).
- `wager_lamports` was validated at create_match within [MIN_WAGER, MAX_WAGER].
- The escrow PDA is rent-exempt (Anchor `init` enforces this at create_match).

**Invariants:**
- Sum of deposits exactly equals `wager × count_ones(deposits_mask)`.
- Each player can deposit at most once (bit-set check).
- Total pot bounded by `wager × max_players` (4 in v1, 10 in v2).

**Concerns:**
- Pot is plain native SOL. No SPL tokens, so no transfer fee, no transfer hook, no decimal mismatches, no permanent delegate concerns.
- The escrow PDA continues to grow as each player deposits. If a player's transaction is dropped/timed-out mid-fund-flow, the escrow PDA may be partially funded — but state remains AwaitingDeposits and other players can still deposit. Atomicity per-deposit is guaranteed by Solana TX atomicity.

**Cross-focus note:** Arithmetic agent should verify `wager` is bounded (it is — MAX_WAGER=100 SOL). State machine agent should verify deposit_mask transitions are monotonic (they are — `|=` only).

---

### Mechanism 2: Settlement Distribution (the core economic event)
**Location:** `programs/solshot-escrow/src/lib.rs:258-338` (v1); `programs/solshot-escrow-v2/src/lib.rs:387-454` (v2)

**Purpose:**
On settlement, the accumulated pot is split into three parts: winner (~90%), treasury (~7%), ops (~3%). The winner is selected by authority at call-time.

**How it works (v1):**
```
1. Read state == Active. Else error.
2. (OC-07) Check Clock <= activated_at + 3600. Else SettlementExpired.
3. Read snapshot of escrow values (wager_lamports, deposits_mask, treasury_key, ops_key).
4. num_deposited = count_ones(deposits_mask) as u128.
5. total_pot_128 = (wager_lamports as u128).checked_mul(num_deposited)?
6. treasury_amount = (total_pot_128 × 700 / 10_000) as u64
7. ops_amount      = (total_pot_128 × 300 / 10_000) as u64
8. total_pot       = total_pot_128 as u64
9. winner_amount   = total_pot - treasury_amount - ops_amount  [winner gets dust]
10. SET state = Settled FIRST (defense-in-depth)
11. Direct lamport math: escrow -= winner_amount, winner += winner_amount
12. Direct lamport math: escrow -= treasury_amount, treasury += treasury_amount
13. Direct lamport math: escrow -= ops_amount, ops += ops_amount
14. close = authority returns escrow rent to authority
15. Emit MatchSettled event with all four parties' pubkeys + amounts
```

**How it works (v2):**
```
1. Read state == Active.
2. NO settlement deadline (server can settle any time after activation).
3. Read snapshot of escrow values INCLUDING treasury_snapshot, ops_snapshot, fee_bps_treasury_snapshot, fee_bps_ops_snapshot.
4. num_deposited = count_ones(deposits_mask) as u128.
5. total_pot_128 = (wager_lamports as u128).checked_mul(num_deposited)?
6. treasury_amount = (total_pot_128 × treasury_bps as u128 / 10_000) as u64    [SNAPSHOT BPS, NOT CONFIG]
7. ops_amount      = (total_pot_128 × ops_bps as u128 / 10_000) as u64         [SNAPSHOT BPS, NOT CONFIG]
8. total_pot       = total_pot_128 as u64
9. winner_amount   = total_pot - treasury_amount - ops_amount  [winner gets dust]
10. SET state = Settled FIRST
11. Direct lamport math (same as v1)
12. close = authority returns escrow rent to authority
13. Emit MatchSettled event
```

**Account constraint validation (settle_match):**
- v1 SettleMatch struct: `winner` is constrained against `escrow.players[..max_players]`; `treasury.key() == config.treasury`; `treasury.key() != ops.key()`; `ops.key() == config.ops`. **All read from CONFIG, not escrow.**
- v2 SettleMatch struct: `winner` is constrained against `escrow.players[..max_players]`; `treasury.key() == escrow.treasury_snapshot`; `treasury.key() != ops.key()`; `ops.key() == escrow.ops_snapshot`. **All read from ESCROW, not config.**

**Assumptions:**
- `escrow.lamports >= winner_amount + treasury_amount + ops_amount + rent_reserve` at settle time. This is structurally true because:
  - escrow.lamports = initial_rent + (count_ones(deposits_mask) × wager_lamports)
  - total_pot = count_ones(deposits_mask) × wager_lamports
  - After three subtractions, escrow.lamports = initial_rent (rent reserve)
  - close = authority returns rent_reserve to authority.
- The `winner.key()` matches one of `escrow.players[0..max_players]`. Validated by Anchor constraint.
- treasury and ops accounts can receive lamports (i.e., they are not on the reserved account list and not executable). NOT explicitly checked — relies on authority's good faith at config setup.

**Invariants:**
- Pot conservation: `winner + treasury + ops == total_pot` (always, by construction since winner is the residual).
- Pot ceiling: total_pot ≤ MAX_WAGER × MAX_PLAYERS = 100 SOL × 10 = 10^12 lamports (v2). Far below u64::MAX (1.8 × 10^19).
- Dust: winner gets 0–2 lamports of integer-division floor remainder.

**Concerns:**
- **v1: live config read at settle** (`treasury.key() == config.treasury`) means an authority who calls `update_config(new_treasury=attacker_key)` AFTER a match becomes Active but BEFORE it's settled will redirect the treasury fee to attacker. The settle TX will succeed because the constraint matches the new config. **This is the canonical H011 path on v1.**
- **v2: snapshot read at settle** (`treasury.key() == escrow.treasury_snapshot`) closes this attack on in-flight matches. The treasury_snapshot is set at create_match from `cfg.treasury` and CANNOT be changed. New matches created after `update_config` will use the new treasury, but in-flight matches retain the original snapshot.
- **v2 still has an authority-takeover path**: even with snapshot, `update_config(new_authority=attacker)` makes the attacker the authority of all FUTURE matches and any in-flight match where the authority is read live (see has_one constraint on settle_match: `has_one = authority` — this reads escrow.authority, set at create_match, NOT live config!). Wait, let me re-verify: `pub authority: Signer<'info>` paired with `has_one = authority` on `escrow` means the authority signer must match `escrow.authority`, which was set at create_match (line 204) to `ctx.accounts.authority.key()` (the create_match signer). So in-flight matches retain their original authority for settle. ✓ snapshot covers authority too.
- HOWEVER — the v2 SettleMatch struct ALSO has a `config: Account<'info, GlobalConfig>` constraint with `has_one = authority`. So `authority` must equal BOTH `escrow.authority` AND `config.authority` at settle time. Even if `update_config(new_authority=...)` is called, future settles will fail for in-flight matches whose `escrow.authority` doesn't match the new `config.authority`. **This is a FAIL-CLOSED behavior** — settling an in-flight match after authority rotation requires a transaction that satisfies BOTH constraints, which is impossible if the new authority differs from the old. So in-flight matches become **un-settlable** after authority change. The funds are locked until reclaim deadline.
- This is interesting: v2's defense against authority hijack on in-flight matches is `transactions become un-settlable, then permissionless_reclaim returns funds to depositors after match_end_ts + 24h`. This is a STRONGER guarantee than v1's "fee redirect possible" — players get their wagers back rather than partial loss. Authority compromise = denial-of-service on in-flight matches, but no economic loss.

---

### Mechanism 3: Cancel/Refund Path
**Location:** `programs/solshot-escrow/src/lib.rs:344-419, 425-487` (v1); `programs/solshot-escrow-v2/src/lib.rs:459-519, 526-578` (v2)

**Purpose:**
Return all deposited wagers to their original payers, with no fees taken. Available in three modes:
- Authority cancel during AwaitingDeposits (any time).
- Player cancel during AwaitingDeposits (any time) or after timeout (any state).
- Permissionless reclaim by anyone after grace period.

**How it works (cancel_match in both versions):**
```
1. Read caller, config_authority, escrow_state, deposits_mask, max_players, players, wager_lamports.
2. Compute timeout_deadline (per version logic).
3. Determine is_authority, is_player.
4. Require: (is_authority AND state == AwaitingDeposits) OR (is_player AND (state == AwaitingDeposits OR is_timed_out))
5. Require: state != Settled AND state != Cancelled.
6. SET state = Cancelled FIRST.
7. For each remaining_account:
   a. Check i < max_players.
   b. Check deposits_mask bit i is set.
   c. Check account.key == players[i].
   d. escrow -= wager_lamports; account += wager_lamports (direct lamport math).
8. Emit MatchCancelled.
9. close = caller returns rent to caller.
```

**Permissionless reclaim** is identical to cancel except:
- No authority/player check (anyone is the caller).
- Different timeout: 2x TIMEOUT (1200s) in v1; match_end_ts + 24h (or deposit_deadline + 24h) in v2.

**Assumptions:**
- Caller passes deposited player accounts in player-INDEX order (i.e., remaining_accounts[0] = players[0], etc., ONLY for indices where deposits_mask bit is set).
- The remaining_accounts array length ≤ max_players.
- Each remaining_account is a system-owned account (lamport increments are valid).

**Invariants:**
- Refund total: sum of refunds == wager × count_ones(deposits_mask) == total deposit pool.
- No refund to non-depositor: bit_set check prevents refunding accounts that didn't deposit.
- No double-refund: each iteration refunds at most once per deposit_mask bit.

**Concerns:**
- **The caller doesn't have to refund ALL deposited players in a single call.** If `remaining_accounts` is empty or partial, the loop runs zero or partial iterations, refunds nothing/partial, and then `close = caller` reclaims rent. The escrow's residual lamports (from undisbursed wagers) become the caller's via close.
  - Wait — let me re-read. `close = caller` transfers residual lamports to caller. If only some deposits are refunded, the rest remain in escrow at close time, and ALL go to caller (rent + un-refunded wagers). **This is a potential exploit.**
  - Verify this in code: `v1:344-419, 718` and `v2:459-519, 748`.
  - In v1 cancel_match: line 393 iterates `ctx.remaining_accounts.iter().enumerate()`. If remaining_accounts.len() < count_ones(deposits_mask), only the supplied accounts get refunded. The remaining wagers stay in escrow. Then `close = caller` (line 718) reclaims everything.
  - **THIS IS A NEW HIGH-CRITICAL FINDING.** The caller can pass empty remaining_accounts, refund zero players, and steal the entire pot via close-to-caller.
  - WAIT — let me re-verify. In v1, who can call cancel_match?
    - **is_authority AND AwaitingDeposits**: Only authority, only when state is AwaitingDeposits. Authority would be stealing from players. This is the H011 family.
    - **is_player AND (AwaitingDeposits OR is_timed_out)**: A player can call. This player (call them attacker) can pass remaining_accounts excluding all OTHER players, refund only itself (or no one), and then `close = caller` gives attacker the rest.
  - **Confirmed: cancel_match in BOTH v1 and v2 has this exploit.**
  - But is_player gate requires the caller to be one of escrow.players. So attacker must be a registered player. OK. Attacker player calls cancel_match after timeout, passes `remaining_accounts = []` (or remaining_accounts = [attacker_account]), gets refunded (or not), then close = caller gives attacker ALL the lamports in escrow.
  - **WAIT** — does the deposits_mask contain a bit for attacker? Only if attacker actually deposited. So:
    - Attacker deposited and others did too → attacker calls cancel_match (after timeout) → passes only their own account → refunds 1 wager to attacker → close to attacker steals (count_ones-1) wagers + rent.
    - Attacker didn't deposit, others did → attacker is still a player → calls cancel_match (after timeout, since state can be Active or AwaitingDeposits-timeout) → passes nothing → no refunds → close to attacker gives all wagers + rent. Attacker pays no wager, gets all.
  - **THIS IS A CRITICAL FINDING.** Player can exploit cancel_match's `close = caller` to steal the entire pot if they're a registered player and timeout has elapsed.
  - **PERMISSIONLESS RECLAIM** has even worse properties — anyone (not just players) can call, no is_player gate. After reclaim deadline, ANYONE passes empty remaining_accounts and gets ALL escrow lamports including all undisbursed wagers via close = caller.
  - **CRITICAL FINDING: cancel_match and permissionless_reclaim allow theft via close = caller + partial/empty remaining_accounts.**
  - Need to flag this as a primary token/economic finding for Phase 4 investigation.

- Actually, let me re-read the close mechanic carefully. `close = caller` in Anchor means after the instruction completes successfully, Anchor transfers all remaining lamports from the closed account to caller AND zeroes the data AND sets owner to system program.
  - The "remaining lamports" is whatever is in the escrow PDA at the END of the instruction.
  - If the instruction body refunds 2 of 3 deposits (each `wager_lamports`), then escrow has `(initial_rent + 1 × wager_lamports)` left. `close = caller` transfers this to caller.
  - **The question: can caller manipulate `remaining_accounts` to skip refunds and inflate escrow's residual?** YES.
  - Caller explicitly passes the accounts to refund. If they pass fewer accounts than deposited, only those get refunded.
  - The instruction does NOT verify that all deposited bits in deposits_mask have a corresponding refund.
  - **Therefore:** the caller can choose how many players to refund, then take the rest via close.

**Concerns (additional):**
- **Caller manipulation of remaining_accounts to skip refunds**: This is THE big finding. Will document as a top concern.
- The check `*account.key == players[i]` ensures the i-th remaining_account matches the i-th player. But the index `i` is the LOOP index from `enumerate()`, NOT a player-index from a parameter. So if caller passes `remaining_accounts = [player[2]]`, the loop sets i=0, then checks `players[0] == player[2]` which is FALSE. Refund fails.
  - Wait, this is interesting. The caller is FORCED to pass accounts in player-INDEX order, starting from index 0. They can't skip players[0] and only refund players[2]. They'd have to pass [players[0], players[1], players[2]] or [players[0], players[1]] to get to index 2.
  - Let me re-read the code carefully:
    ```rust
    for (i, account) in ctx.remaining_accounts.iter().enumerate() {
        require!(i < max_players, EscrowError::InvalidPlayer);
        let bit_set = (deposits_mask >> i) & 1 == 1;
        require!(bit_set, EscrowError::InvalidPlayer);
        require!(*account.key == players[i], EscrowError::InvalidPlayer);
        ...
    }
    ```
  - Yes — `i` is the loop index. `account` is the i-th remaining_account. The check `bit_set` requires `deposits_mask` bit i to be set (i.e., the i-th player deposited). The check `*account.key == players[i]` requires the i-th remaining_account to match the i-th player.
  - **If `deposits_mask` has bits set at indices [0, 1, 2] (all three players deposited), and caller passes only `[players[0]]`, the loop does i=0 → checks bit 0 set ✓, checks players[0] match ✓, refunds player[0], loop ends.** Players 1 and 2 don't get refunded; their wagers stay in escrow. close = caller transfers them to caller. EXPLOIT CONFIRMED.
  - What if `deposits_mask` has bits set at [0, 2] only (player 1 didn't deposit)? Caller passes `[players[0]]`, loop processes index 0, refunds. Loop ends because remaining_accounts is exhausted. Player 2's wager stays in escrow. close = caller takes it.
  - What if caller passes `[players[0], dummy]` where dummy isn't players[1]? Loop i=0 → ok, refunds player[0]. Loop i=1 → checks bit 1 set... if bit 1 is set, then check players[1] == dummy fails → ERROR → entire transaction reverts. So caller can't pass garbage in the middle to skip — they must STOP early.
  - Hmm actually if bit 1 is NOT set (player 1 didn't deposit), then `bit_set = false`, require!(bit_set) errors. So caller can't send a dummy at i=1 either.
  - **Therefore: caller's only freedom is to truncate the remaining_accounts array. They can pass [players[0]], [players[0], players[1]], etc., but can't pass anything other than the canonical [players[0], players[1], ..., players[k]] for some k <= max_players.**
  - **And as we showed, if k < count_ones(deposits_mask), the un-refunded wagers go to caller via close.**
  - This means: anyone (player in v1 cancel after timeout, anyone in permissionless_reclaim after grace) can call with ZERO remaining_accounts and steal the entire pot.
  - **CRITICAL CONFIRMED.** This is a very serious finding for Phase 4 investigation.

---

### Mechanism 4: Per-Match Snapshot (v2 only)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:201-219` (write at create); `lib.rs:396-399, 715-728` (read at settle)

**Purpose:**
Freeze the fee destinations and BPS values for a specific match at create_match time, so subsequent `update_config` calls don't affect in-flight matches.

**How it works:**
At create_match, the program reads from the live config:
```rust
let cfg = &ctx.accounts.config;
escrow.treasury_snapshot = cfg.treasury;
escrow.ops_snapshot = cfg.ops;
escrow.fee_bps_treasury_snapshot = cfg.fee_bps_treasury;
escrow.fee_bps_ops_snapshot = cfg.fee_bps_ops;
```

These four fields are written to the MatchEscrow PDA and are immutable for the lifetime of the match. At settle_match, they are read back:
```rust
let treasury_snapshot = ctx.accounts.escrow.treasury_snapshot;
let ops_snapshot = ctx.accounts.escrow.ops_snapshot;
let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;
let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;
```

The settle account constraints validate against snapshots, not config:
```rust
constraint = treasury.key() == escrow.treasury_snapshot @ EscrowError::InvalidTreasury,
constraint = ops.key() == escrow.ops_snapshot @ EscrowError::InvalidOps,
```

**Assumptions:**
- The values in cfg at create_match are valid (cap-checked, distinctness-checked at update_config).
- Once snapshotted, no instruction modifies the snapshot fields. (Verified: snapshot fields are written ONLY at line 211-214 in create_match, never elsewhere.)

**Invariants:**
- Per-match: `escrow.treasury_snapshot, escrow.ops_snapshot, escrow.fee_bps_treasury_snapshot, escrow.fee_bps_ops_snapshot` are immutable post-create.
- At settle: payment goes to the snapshotted treasury/ops at the snapshotted BPS — never the current config.

**Concerns:**
- The snapshot covers fees/destinations but **not the authority**. v2 SettleMatch has `has_one = authority` on the escrow (line 695), so `authority: Signer` must match `escrow.authority`, which is set at create_match. So authority is also snapshotted — good.
- However, v2 SettleMatch ALSO has `has_one = authority` on the config (line 735). So `authority` must match BOTH `escrow.authority` and `config.authority` SIMULTANEOUSLY. After `update_config(new_authority=X)`:
  - `config.authority = X`
  - For an in-flight match: `escrow.authority` is still the original authority Y.
  - When trying to settle: `authority = X` satisfies has_one on config but FAILS on escrow.
  - When trying to settle: `authority = Y` satisfies has_one on escrow but FAILS on config.
  - **No signer can satisfy both. The match becomes un-settlable.**
- This means v2's snapshot mechanism, combined with the dual has_one constraint, gives a STRONG defense: in-flight matches can't be drained via authority change. Funds eventually return to depositors via permissionless_reclaim.
- **Caveat:** if the attacker sets `update_config(new_authority=Y)` (revert to original — but they don't have Y's key) then... no, they wouldn't. The attack pattern is for an attacker who steals authority key Y to change it to X. After this, in-flight matches need someone with key Y to settle. If Y is compromised but not "given away," the original holder can still settle. If Y is rotated AWAY by attacker (config.authority = X), nobody can settle.
- So v2's behavior under authority compromise is: in-flight matches become DoS'd, eventually refundable by permissionless_reclaim. Better than v1's "in-flight matches get fee-redirected."

---

## Trust Model

**Trusted parties:**
- **Authority key** (single key in v1, single key in v2): controls winner selection at settlement, fee destinations, BPS values, pause toggle, match cancellation in AwaitingDeposits, partial-deposit activation. Hot-wallet model on devnet (intentional per project notes; multisig intended pre-mainnet but not implemented).
- **Players' own keys**: trusted to deposit their own wagers. No trust required from players regarding game outcome (server-determined) or fee distribution (config-determined).

**Untrusted parties:**
- Other players (cannot drain wagers due to constraint validations).
- External callers (can only trigger permissionless_reclaim after grace, which has a CRITICAL flaw — see Mechanism 3).
- The Solana network (program is upgradeable via upgrade authority, separate concern).

**Trust boundaries:**
- Player → Escrow PDA: zero trust (system_program::transfer is atomic).
- Authority → All players' wagers: HIGH trust required (authority can rotate fee destinations, set BPS up to 10%, select winner from players).
- Server backend → on-chain: server is the off-chain agent that holds the authority key.
- Caller of cancel_match/permissionless_reclaim → escrow residual lamports: **NO TRUST IS REQUIRED — but escrow currently has a flaw allowing the caller to steal residual via partial remaining_accounts. See above.**

---

## State Analysis

**State read/written by token/economic logic:**

| Field | Read In | Written In | Scope |
|-------|---------|-----------|-------|
| `escrow.wager_lamports` | deposit, settle, cancel, reclaim, start_with_depositors | create_match | per-match, immutable post-create |
| `escrow.deposits_mask` | settle, cancel, reclaim, start_with_depositors | deposit (set bit), start_with_depositors (compact) | per-match |
| `escrow.players[]` | deposit (find index), settle (validate winner), cancel/reclaim (validate refund recipient), start_with_depositors (compact) | create_match, start_with_depositors | per-match |
| `escrow.max_players` | deposit, settle, cancel, reclaim, start_with_depositors | create_match (initial), start_with_depositors (reduced) | per-match |
| `escrow.state` | all instructions (gate on state) | all instructions (transition) | per-match |
| `escrow.treasury_snapshot, ops_snapshot, fee_bps_*_snapshot` (v2 only) | settle | create_match | per-match, immutable post-create |
| `config.authority, treasury, ops` (v1 only — v2 reads only at create) | settle (v1), update_config | initialize_config, update_config | global, mutable by authority |
| `config.fee_bps_treasury, fee_bps_ops` (v2 only) | create_match (snapshot), update_config | initialize_config, update_config | global, mutable by authority within MAX_FEE_BPS |
| `config.is_paused` | create, deposit, settle (v1), settle (v2 — pause does NOT block), cancel (v1 with pause guard), cancel (v2 — pause does NOT block), reclaim (v2 — pause does NOT block), start_with_depositors | pause_program, unpause_program | global, mutable by authority |

---

## Dependencies

**External calls:**
- `system_program::transfer` (deposit_wager only): trusted (Anchor `Program<'info, System>` validates program ID).

**No other CPI.** No SPL Token, no Token-2022, no Pyth/Switchboard, no governance program. The program is fully self-contained on the economic side (modulo system program for deposits and Anchor's close mechanic for rent recovery).

**Imports analyzed:**
- `anchor_lang::prelude::*` — standard.
- `anchor_lang::system_program` — for the deposit transfer CPI.

---

## Focus-Specific Analysis

### 1. Token Flow Diagram

(See condensed summary at top.)

**v1 detailed flow:**
```
Wager deposit (per player, repeated 2-4 times):
  player_pubkey  ──[wager × 1]──→  escrow_PDA
  (deposits_mask bit set per player)

Activation (when all deposit OR start_with_depositors):
  state = Active, activated_at = now

Settlement (authority signs):
  ── Read live config ──
  treasury_dest    = config.treasury        ← MUTABLE BY UPDATE_CONFIG
  ops_dest         = config.ops             ← MUTABLE BY UPDATE_CONFIG
  treasury_bps     = 700 (HARDCODED)
  ops_bps          = 300 (HARDCODED)
  
  pot = wager × count_ones(deposits_mask)
  treasury_amt = pot × 700 / 10_000
  ops_amt      = pot × 300 / 10_000
  winner_amt   = pot - treasury_amt - ops_amt   (≈90% + dust ≤2)
  
  escrow_PDA  ──[winner_amt]──→  winner
  escrow_PDA  ──[treasury_amt]──→  treasury_dest
  escrow_PDA  ──[ops_amt]──→  ops_dest
  
  close = authority: rent reserve ──→  authority (server keypair)

Cancel/refund (caller signs):
  for i in 0..remaining_accounts.len():
    if (deposits_mask >> i) & 1 == 1 AND remaining_accounts[i].key == players[i]:
      escrow_PDA  ──[wager × 1]──→  remaining_accounts[i]
  
  close = caller: ALL RESIDUAL ──→  caller   ← INCLUDES UN-REFUNDED WAGERS
```

**v2 detailed flow:**
```
At create_match:
  escrow.treasury_snapshot     = cfg.treasury
  escrow.ops_snapshot          = cfg.ops
  escrow.fee_bps_treasury_snap = cfg.fee_bps_treasury  (≤ 1000)
  escrow.fee_bps_ops_snap      = cfg.fee_bps_ops       (≤ 1000)

Wager deposit: same as v1.

Activation: same as v1, plus match_end_ts = now + duration_secs.

Settlement (authority signs):
  ── Read SNAPSHOT from escrow ──
  treasury_dest  = escrow.treasury_snapshot       ← IMMUTABLE
  ops_dest       = escrow.ops_snapshot            ← IMMUTABLE
  treasury_bps   = escrow.fee_bps_treasury_snap   ← IMMUTABLE
  ops_bps        = escrow.fee_bps_ops_snap        ← IMMUTABLE
  
  same math as v1 with configurable BPS
  same lamport flow as v1

Cancel/reclaim: same flow as v1 (but cancel doesn't have pause guard).
```

### 2. Fee Analysis

**v1 fee model:**
- Treasury: 7% fixed (BPS 700)
- Ops: 3% fixed (BPS 300)
- Winner: 90% + dust (BPS ~9000)
- Calculation: `(pot as u128) × bps / 10_000` cast to u64
- Rounding direction: integer-division floor → favor winner (winner gets pot residual via subtraction)
- Destination: from `config.treasury` and `config.ops` (LIVE READ — mutable mid-flight by update_config)
- Mutability: rate is constant; can ONLY be changed via program upgrade
- Dust: ≤ 2 lamports per settlement, accrues to winner

**v2 fee model:**
- Treasury BPS: configurable [0..1000], stored in GlobalConfig and snapshotted to MatchEscrow
- Ops BPS: configurable [0..1000-treasury_bps], stored in GlobalConfig and snapshotted to MatchEscrow
- Combined cap: 1000 BPS (10%) at any point in time
- Calculation: `(pot as u128) × bps_snapshot / 10_000` cast to u64
- Rounding direction: same as v1 — winner gets residual
- Destination: from `escrow.treasury_snapshot` and `escrow.ops_snapshot` (SNAPSHOT — immutable per-match)
- Mutability: rate can change for FUTURE matches via update_config; in-flight matches use their snapshot
- Dust: ≤ 2 lamports per settlement, accrues to winner (only 2 division ops)

**Comparison:**

| Aspect | v1 | v2 |
|--------|-----|-----|
| BPS values | hardcoded 700/300 | configurable [0..1000]/[0..1000-treasury_bps] |
| Cap on combined | implicit 1000 (sum of consts) | explicit 1000 (MAX_FEE_BPS) |
| Cap enforcement | none needed | at init (line 76-79) AND at update (line 128-131) |
| Mutability for in-flight | NONE (constants) | NONE (snapshot) |
| Mutability for new matches | only via upgrade | runtime via update_config (within cap) |
| Destination read at settle | LIVE config | SNAPSHOT (immutable) |
| Authority can self-redirect destination | YES (set treasury = secondary wallet) | YES (set treasury = secondary wallet for new matches) |
| Authority can change rate to extract more | NO (without upgrade) | YES (within 10% cap) for new matches |

**Fee destinations who controls them:**
- v1: `config.authority` controls `config.treasury` and `config.ops` via `update_config`. No timelock. No 2-step transfer.
- v2: same as v1 plus also controls `config.fee_bps_treasury` and `config.fee_bps_ops`.

**Can rate be changed:**
- v1: only by program upgrade (TREASURY_BPS=700, OPS_BPS=300 are `const`). Upgrade requires upgrade authority signature on a deploy.
- v2: yes, by `update_config` within MAX_FEE_BPS cap of 1000 (10%) combined.

### 3. Economic Invariant List

**Verified invariants (BOK Feb for v1):**
1. **Pot conservation**: winner_amount + treasury_amount + ops_amount == total_pot. (Trivially true by construction since winner = total_pot - treasury - ops.)
2. **Pot ceiling**: total_pot ≤ MAX_WAGER × MAX_PLAYERS = 100 SOL × 4 (v1) or × 10 (v2) = 400 SOL or 1000 SOL. Far below u64::MAX.
3. **Fee floor**: At v1's MIN_WAGER and 2 players, treasury_amount ≥ 1, ops_amount ≥ 1. Verified by FEE-INV-2 in proptest.
4. **Dust bound**: Winner's dust accumulation ≤ 2 lamports (only 2 division ops in settlement path). Verified by FEE-INV-5.
5. **Fee monotonicity**: As wager increases, all fee components increase (FEE-INV-10).
6. **Refund conservation**: Sum of refunds == sum of deposits when remaining_accounts is complete. (NOT enforced by the program — relies on caller.)

**Pending invariants (need re-verification on v2):**
- Pot conservation with configurable BPS: winner + treasury + ops == pot for all (treasury_bps, ops_bps) ∈ [0..1000]² with treasury_bps + ops_bps ≤ 1000. Property is structural; should hold by induction on the same residual subtraction.
- Pot ceiling at 10 players: 100 SOL × 10 = 10^12 lamports. u64::MAX is ~1.8 × 10^19. Safe.
- Fee floor at v2 with configurable BPS: With treasury_bps = 1, ops_bps = 0, treasury_amount at MIN_WAGER × 2 = 20,000 × 1 / 10,000 = 2. With treasury_bps = 0, ops_bps = 0, treasury_amount = 0, ops_amount = 0, winner = total_pot. **Zero fees are valid in v2.** This is intentional (admin can waive fees).
- Dust bound at v2: Should still hold since only 2 division operations.

**Violated/at-risk invariants:**
- **Refund conservation: NOT enforced by code.** The caller can pass partial remaining_accounts and the un-refunded wagers go to caller via `close = caller`. **CRITICAL FINDING for Phase 4.**

### 4. Flash Loan Impact Analysis

**Standard analysis:**
- Solana has no native flash loan primitive. Cross-protocol flash loan (e.g., via Solend/Mango) doesn't directly affect SolShot escrow because escrow doesn't read external prices, doesn't have a price oracle, doesn't support arbitrage, and doesn't allow same-tx deposit + claim.
- **Conclusion:** No flash loan attack surface on the escrow programs themselves.

**Flash-loan-style atomic exploitation (within 1 transaction):**
- An attacker who is a player in match X could: in a single transaction, (1) call deposit_wager (adds to escrow), (2) cancel_match (refunds to attacker), (3) close = caller (steals residual). Wait, but cancel_match requires either is_authority OR is_player AND timed_out. Within 1 TX, is_timed_out is at most ~400ms past activated_at. SETTLEMENT_TIMEOUT_SECONDS is 600s in v1, 60s+ in v2. So is_timed_out is FALSE within 1 TX. Cancel only works if state is AwaitingDeposits.
  - In AwaitingDeposits + 1 TX: attacker is_player, state = AwaitingDeposits. Cancel allowed. They deposit, cancel (refund themselves, close = caller for residual). If only attacker has deposited, escrow has only attacker's wager + initial rent — refund returns wager, close = caller returns rent. Net: attacker pays gas + initial rent (paid by authority at create_match) is gained. Authority pays 0.0036 SOL rent → attacker gains 0.0036 SOL. **Economic griefing of authority via attacker claiming rent.**
  - This was already noted in handover as H013 / rent extraction. Re-validated: still possible in v2 with `close = caller`. Not a serious finding (small constant; authority pays for create_match), but confirms the pattern.

### 5. Value Extraction Matrix

| Path | Type | Mechanism | Actor | Mitigations |
|------|------|-----------|-------|-------------|
| Settlement → winner | Legitimate | settle_match selects winner, sends ~90% | Authority chooses winner from players | winner ∈ players[] constraint |
| Settlement → treasury | Legitimate | settle_match sends ~7% (v1) or 0–10% (v2) | Authority controls treasury destination | treasury_snapshot in v2; live config in v1 |
| Settlement → ops | Legitimate | settle_match sends ~3% (v1) or 0–10% (v2) | Authority controls ops destination | ops_snapshot in v2; live config in v1 |
| Cancel/Reclaim → players | Legitimate | refund deposited wagers | Authority/player/anyone (gated) | refund per-bit-set + per-pubkey-match |
| **Cancel/Reclaim → caller via partial remaining_accounts + close=caller** | **THEFT** | **caller skips refunds, takes residual** | **Any player (cancel) or anyone (reclaim)** | **NONE — CRITICAL FLAW** |
| Authority self-redirect (v1) | Skim | update_config(new_treasury=attacker_wallet) before settle | Authority | NONE in v1 (live read) |
| Authority self-redirect (v2 new matches) | Skim | update_config(new_treasury=attacker_wallet) for future matches | Authority | NONE — applies to all new matches |
| Authority BPS bump (v2) | Skim | update_config(new_fee_bps=high) for future matches | Authority | MAX_FEE_BPS=1000 cap |
| Authority winner fraud | Theft | settle_match(winner=attacker_wallet) for matches with attacker as registered player | Authority | NONE (winner ∈ players is required, but attacker can be registered as player) |
| Rent extraction via cancel | Skim | player calls cancel after timeout, takes rent + residual via close | Player | NONE (close = caller is by design but exploitable) |
| H006-style timing arbitrage (v1) | Lockup | Match settles 23h+ after activation due to timeout interaction | Server | TIMING agent investigation |

---

## Cross-Focus Intersections

- **Token & Economic ↔ Access Control**: Authority-trust assumption is the single most impactful cross-cutting concern. Every economic finding above traces to "authority key compromise leads to value loss." Access Control should investigate H001 (no pending_authority).
- **Token & Economic ↔ Account Validation**: The cancel_match / permissionless_reclaim refund flaw (caller manipulates remaining_accounts) is fundamentally an Account Validation issue — the program doesn't enforce that ALL deposits are refunded before close. Account validation agent should flag this.
- **Token & Economic ↔ State Machine**: Settled and Cancelled are terminal — good. But the cancel flaw above means a Cancelled state can be reached with un-refunded deposits, which is an state-economic invariant violation.
- **Token & Economic ↔ Arithmetic**: BOK proptest harness covers v1's hardcoded BPS exhaustively. v2's configurable BPS needs a re-run with BPS in [0..1000] as a search dimension. The arithmetic itself is well-structured (u128 widening, checked operations); only the BPS parameter space changes.
- **Token & Economic ↔ Timing**: H006 dead-zone, deposit deadline tightness, match_end_ts arithmetic — all touch on whether players can recover funds or if authority can drain via timing manipulation.

---

## Cross-Reference Handoffs

- → **Access Control Agent**: 
  - Investigate H001 root cause (no pending_authority, no two-step authority transfer) on both v1 and v2.
  - Verify fee destination self-redirect path: can authority set treasury = own_alt_wallet? YES — H011 still possible.
  - Verify BPS update path: who can call update_config in v2? Authority. Is there a timelock? NO.
  - **NEW**: Verify cancel_match's `is_player` gate combined with `close = caller` allows player rent + residual extraction.
  
- → **Arithmetic Agent**:
  - Re-run BOK proptest harness for v2 with BPS pair (treasury_bps, ops_bps) ∈ [0..1000]² constrained sum ≤ 1000. Verify dust ≤ 2 lamports invariant holds for ALL valid BPS pairs.
  - Verify pot scaling at v2's max (100 SOL × 10 players = 10^12 lamports) doesn't overflow u128 in BPS multiplication. (10^12 × 1000 = 10^15, within u128.)
  
- → **State Machine Agent**:
  - Investigate the state-economic invariant: "Cancelled state implies all deposits refunded" — currently NOT enforced.
  - Verify activated_at / match_end_ts state transitions are atomic in v2.
  - Investigate snapshot freshness: `start_with_depositors` uses snapshot at create-time, even if deposit window is 24h. Can stale snapshot cause economic anomaly? (Unlikely since snapshot ≤ MAX_FEE_BPS by induction.)
  
- → **Account Validation Agent**:
  - **CRITICAL**: Investigate `remaining_accounts` validation in cancel_match and permissionless_reclaim. The current implementation validates each supplied account but does NOT require all deposited players to be supplied. This is the root cause of the partial-refund theft.
  - Verify treasury, ops, winner UncheckedAccount constraints prevent reserved-account-list passes (EP-106).
  - Verify executable account check — can treasury/ops/winner be a program account? (No explicit check.)
  
- → **Timing Agent**:
  - H006 dead-zone math on v1 with current constants (TIMEOUT=600, SETTLEMENT_TIMEOUT=3600, RECLAIM_TIMEOUT=1200).
  - v2's per-match timing: extreme values (max 24h deposit_window + 7d duration = 8 days lockup) — does this exceed reasonable? OK by design.
  - Cancel/reclaim deadline branches: `activated_at > 0` flag — can it be manipulated? (Set in deposit_wager, not externally controllable.)
  
- → **Upgrade & Admin Agent**:
  - v2 fee BPS update path is admin-only with no timelock. Document as centralization risk.
  - v1 BPS is hardcoded → no admin power, but program upgrade authority CAN change it. v2 upgrade authority can also change MAX_FEE_BPS cap.
  
- → **CPI Agent**:
  - Deposit CPI to `system_program::transfer` is well-validated. No risk.
  - All other token outflows are direct lamport math (no CPI). Verify EP-106 lamport transfer dangers (reserved accounts, executable accounts, rent exemption).

---

## Risk Observations

1. **Partial-refund theft via close = caller (CRITICAL — present in BOTH v1 and v2)**: 
   - In `cancel_match` and `permissionless_reclaim`, the caller can pass fewer remaining_accounts than the number of deposited players. The unrefunded deposits accumulate in escrow, and `close = caller` transfers ALL residual lamports (rent + un-refunded wagers) to the caller. 
   - In `cancel_match`, the caller must be either the authority (only when state is AwaitingDeposits — so refund is from un-deposited slots, low impact) OR a registered player (after timeout in any state — HIGH impact, can steal up to (n-1)/n of the pot).
   - In `permissionless_reclaim`, the caller can be ANYONE after grace period — HIGH impact, can steal entire pot.
   - **Estimated severity: CRITICAL.** Phase 4 should investigate and confirm. Recommend: add explicit assertion that `count_ones(post_refund_residual_mask) == 0` OR enforce that exactly `count_ones(deposits_mask)` accounts are passed in remaining_accounts.
   - Code refs: `v1:344-419, 425-487, 712-754`; `v2:459-519, 526-578, 742-782`.

2. **v1 fee redirect via live config read (HIGH — H011 still open)**: 
   - `settle_match` reads `treasury.key() == config.treasury` (line 686), which is mutable via `update_config`. 
   - Authority can hijack in-flight matches' fees to a controlled account.
   - v2 mitigates via snapshot, but v1 doesn't. v1 is currently deployed.

3. **v2 BPS bump for new matches (HIGH — H028 partially exploitable)**: 
   - `update_config` allows authority to set fee_bps_treasury + fee_bps_ops up to 1000 (10%).
   - Per-update cap, no per-match cap, no rate limit.
   - Authority could front-run a high-stakes match, bump BPS to 10%, settle, revert — extracting +3% over normal 7%.

4. **MIN_WAGER tuned for v1's 7%/3%, not v2's configurable BPS (MEDIUM)**: 
   - At MIN_WAGER=10,000 with bps_pair = (1, 0) at 2 players (pot=20,000): treasury=2, ops=0. With bps_pair=(1, 999): treasury=2, ops=1998. Verified safe at boundaries.
   - At wager=10,000 × 2 = 20,000 with bps_pair=(0, 0): treasury=0, ops=0, winner=20,000. Works (no fees).
   - **No underflow risk at v2's bps floor.** But documentation should note that admin can waive fees entirely.

5. **`close = caller` rent leakage (MEDIUM)**: 
   - Rent reserve (~0.006 SOL for v2's 509-byte escrow) goes to whoever calls cancel/reclaim, NOT the original create_match payer (authority). 
   - Authority pays rent at create, doesn't recover on cancel. Net authority subsidy ~0.006 SOL per cancel.
   - Combined with a player who didn't deposit calling cancel, attacker gains 0.006 SOL gross at low cost.

6. **Pot ceiling calculation correctness (LOW)**: 
   - v1: 100 SOL × 4 = 400 SOL = 4 × 10^11 lamports. Multiplied by 1000 BPS in u128 = 4 × 10^14, far below u128::MAX.
   - v2: 100 SOL × 10 = 1000 SOL = 10^12 lamports. Multiplied by 1000 BPS in u128 = 10^15, far below u128::MAX.
   - **No overflow risk on pot or fee math.**

7. **Per-match snapshot in v2: design quality (LOW)**: 
   - Architecture is well-structured. All fee-related state is snapshotted: treasury_snapshot, ops_snapshot, fee_bps_treasury_snapshot, fee_bps_ops_snapshot.
   - Snapshot is set at create_match from config, never modified post-create.
   - settle_match constraints validate against snapshot, not config.
   - Defense-in-depth quality: GOOD.

---

## Novel Attack Surface Observations

1. **v2's snapshot design creates an "early-settle to lock in current BPS" attack incentive**: An attacker who controls the authority and wants to extract maximum value should:
   - Step 1: For all in-flight matches with high pots, settle them NOW (before any BPS change is detected by monitoring).
   - Step 2: Then update BPS to max (1000), deploy a flash of new matches with attacker-aligned fee destinations, and farm new value.
   - The snapshot architecture means each match has an "effective BPS time-frozen at create_match" — so attacker's leverage is HIGHER for future matches than for in-flight ones.
   - **Implication**: post-incident response should focus on UPGRADE AUTHORITY (which can rotate program-level constants) more than on AUTHORITY (which only affects new matches).

2. **The partial-refund theft is unique to this protocol's design choice of "remaining_accounts as the refund target list"**: 
   - Standard Anchor patterns either (a) use a fixed account struct with named refund recipients, or (b) iterate a known-length collection. SolShot uses `remaining_accounts` which is caller-controlled length.
   - The code validates each individual account in the iteration but does NOT validate the COUNT of accounts.
   - Combined with `close = caller`, this creates the theft path.
   - **Defense**: After the loop, require `actual_refund_count == count_ones(deposits_mask)` AND `escrow.lamports == initial_rent_only` (i.e., no un-refunded deposits remain).
   - This is a NOVEL pattern not in any standard EP database — it's specific to SolShot's choice of caller-controlled refund list combined with `close = caller`.

3. **MIN_WAGER is sized for the original 7%/3% split**: With v2's configurable BPS, an admin who waives fees (BPS=0,0) means no fee floor concern, but if BPS is set to (1, 0), fees are still ≥ 1 lamport at MIN_WAGER × 2. The protocol can run at zero fees. **This is a configuration choice, not a vulnerability — but needs documentation.**

4. **Pot ceiling × player count: v2's 10-player support increases per-incident damage 2.5×**: At max wager (100 SOL) × 10 players = 1000 SOL pot. If authority is compromised at the moment a 1000 SOL pot is funded, settle_match can send 100 SOL (10% via maxed BPS) to attacker's treasury alt — vs. v1's max ~40 SOL @ 10% on 4 players. This is an inherent consequence of the "more players, more pot" model, not a bug, but worth documenting for incident-response sizing.

---

## Questions for Other Focus Areas

- **For Account Validation focus**: The `remaining_accounts` iteration in cancel_match/permissionless_reclaim validates individual accounts but not the count. Is it the program's responsibility to enforce "all deposited players must be refunded" or is this a caller-error pattern? The combination with `close = caller` makes it exploitable. Specifically: does the v1/v2 design REQUIRE the caller to pass all deposited players? If yes, where is this enforced? If not, what's the mitigation?

- **For Arithmetic focus**: BOK proptest currently covers v1's hardcoded BPS. Can you re-run with v2's configurable BPS pair as a search dimension, specifically:
  - `wager ∈ [MIN_WAGER, MAX_WAGER]`
  - `num_deposited ∈ [2, 10]`  
  - `treasury_bps ∈ [0, 1000]`
  - `ops_bps ∈ [0, 1000 - treasury_bps]`
  Verify FEE-INV-1 (conservation), FEE-INV-3 (u128→u64 narrowing), FEE-INV-5 (winner gets remainder, dust ≤ 2), FEE-INV-11 (subtractions don't underflow) hold for all combinations.

- **For State Machine focus**: When `cancel_match` transitions state to Cancelled and refunds only some players, is this a valid Cancelled state? The terminal state means it can't be Re-cancelled or settled, but un-refunded wagers remain (now stolen by caller). Is "Cancelled with stuck wagers" a state-machine invariant violation? What's the expected post-condition of Cancelled?

- **For Timing focus**: 
  - H006 dead-zone math: with TIMEOUT=600, SETTLEMENT_TIMEOUT=3600, RECLAIM_TIMEOUT=1200, can you confirm the gap math? activated_at + 3600 = settle deadline; created_at + 1200 = reclaim deadline. If created_at + 1200 < activated_at + 3600, there's overlap, not gap. Verify.
  - v2 reclaim deadline = match_end_ts + 86400 OR deposit_deadline + 86400. With max duration 7d, the longest-locked funds: 7d + 24h = 8 days. Is this acceptable per protocol design?

- **For CPI focus**: The deposit_wager CPI to system_program::transfer is the only CPI. All settle/refund use direct lamport math (`try_borrow_mut_lamports`). EP-106 (reserved account list / executable accounts) — can you verify that none of the destinations (winner, treasury, ops, players) can be a reserved-list account? The constraint validation only checks pubkey equality, not account properties.

- **For Upgrade & Admin focus**: With v2's configurable BPS at 10% cap, is the cap itself changeable? `MAX_FEE_BPS = 1_000` is a `const` — only changeable via program upgrade. Upgrade authority is currently hot-wallet (per project notes). Can the upgrade authority unilaterally raise the cap? YES. This is an additional centralization risk.

---

## Raw Notes

### Code refs by line number (for fast Phase 4 lookup):

**v1 settle_match math:**
```rust
// programs/solshot-escrow/src/lib.rs:285-307
let num_deposited = deposits_mask.count_ones() as u128;
let total_pot_128 = (wager_lamports as u128).checked_mul(num_deposited).ok_or(EscrowError::ArithmeticOverflow)?;
let treasury_amount = (total_pot_128.checked_mul(TREASURY_BPS as u128).ok_or(...)? / BPS_DENOMINATOR as u128) as u64;
let ops_amount = (total_pot_128.checked_mul(OPS_BPS as u128).ok_or(...)? / BPS_DENOMINATOR as u128) as u64;
let total_pot = total_pot_128 as u64;
let winner_amount = total_pot.checked_sub(treasury_amount).ok_or(...)?.checked_sub(ops_amount).ok_or(...)?;
```

**v2 settle_match math:**
```rust
// programs/solshot-escrow-v2/src/lib.rs:402-425
let num_deposited = deposits_mask.count_ones() as u128;
let total_pot_128 = (wager_lamports as u128).checked_mul(num_deposited).ok_or(EscrowError::ArithmeticOverflow)?;
let treasury_amount = (total_pot_128.checked_mul(treasury_bps as u128).ok_or(...)? / BPS_DENOMINATOR) as u64;
let ops_amount = (total_pot_128.checked_mul(ops_bps as u128).ok_or(...)? / BPS_DENOMINATOR) as u64;
let total_pot = total_pot_128 as u64;
let winner_amount = total_pot.checked_sub(treasury_amount).ok_or(...)?.checked_sub(ops_amount).ok_or(...)?;
```

**v1 vs v2 BPS_DENOMINATOR type:**
- v1: `const BPS_DENOMINATOR: u64 = 10000;` (cast to u128 in division)
- v2: `const BPS_DENOMINATOR: u128 = 10_000;` (already u128)
- Both functionally equivalent.

**v1 cancel_match refund loop:**
```rust
// programs/solshot-escrow/src/lib.rs:393-410
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);
    let bit_set = (deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);
    require!(*account.key == players[i], EscrowError::InvalidPlayer);
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
// THEN: close = caller in account struct (line 718) reclaims residual.
```

Same pattern at v1:465-478 (permissionless_reclaim), v2:502-510 (cancel), v2:561-569 (reclaim).

**Critical: v1 cancel_match auth gating:**
```rust
// programs/solshot-escrow/src/lib.rs:374-378
require!(
    (is_authority && escrow_state == MatchState::AwaitingDeposits)
    || (is_player && (escrow_state == MatchState::AwaitingDeposits || is_timed_out)),
    EscrowError::Unauthorized
);
```

So a player can call cancel_match in any state once `is_timed_out` (Clock > activated_at + 600 OR Clock > created_at + 600).

**Critical: v2 cancel_match auth gating:**
```rust
// programs/solshot-escrow-v2/src/lib.rs:485-489
require!(
    (is_authority && escrow_state == MatchState::AwaitingDeposits)
        || (is_player && (escrow_state == MatchState::AwaitingDeposits || is_timed_out)),
    EscrowError::Unauthorized
);
```

Same logic. is_timed_out is now player_cancel_deadline-based (deposit_window if not active, match_end_ts if active).

**v1 vs v2 close = caller:**
- v1: lines 718 (cancel), 745 (reclaim).
- v2: lines 748 (cancel), 773 (reclaim).
- Both: `close = caller` after the instruction body completes successfully.

### BOK Feb proptest coverage (for reference):

Existing tests (FEE-INV-1 through FEE-INV-11) cover v1's hardcoded 700/300 split for wagers in [10K, 100B] and player counts in [2, 4]. For v2, would need to extend with:
- BPS pair: `(treasury_bps, ops_bps)` in `[0..1000] × [0..1000-treasury_bps]`.
- Player count: extend to [2, 10].
- Same invariant set (FEE-INV-1, FEE-INV-3, FEE-INV-5, FEE-INV-11) should still hold by structural argument.

### Specific concerns from pre-scan, confirmed:

- v2:50 — `MAX_FEE_BPS = 1_000`. Verified at init (lines 76-79) AND update (lines 128-131). ✓
- v2:77, v2:129 — `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32`. The `as u32` widening prevents u16+u16 overflow (max sum = 65535+65535 = 131070, fits in u32). ✓
- v1:285-300, v2:285-300, v2:403-418 — dust property: 2 division operations, max 2 lamports dust. Verified for v1 by BOK. v2 by structural argument should hold.
- start_with_depositors partial-fill: pot = wager × count_ones(deposits_mask). Non-depositors: not credited (count_ones bound). ✓
- Wager bounds: MIN=10,000 lamports (0.00001 SOL), MAX=100B lamports (100 SOL per player). With 10 players in v2: pot ceiling = 1000 SOL = 10^12 lamports. Safe in u64 and u128.

---

# RECHECK Verdicts

| ID | Title | v1 | v2 | Verdict |
|----|-------|-----|-----|---------|
| H001 | One-step authority transfer | RECHECK — STILL OPEN | INHERITED — STILL OPEN | Both still vulnerable; no pending_authority field. Authority key compromise still allows takeover. |
| H002 | Fee destination hijack via update_config | OPEN — live config read at settle | MITIGATED for in-flight via snapshot | v1: still possible mid-match. v2: only affects new matches (half-mitigation). |
| H003 | Distinctness bypass at update | RECHECK — verify | RECHECK — verify | v1:96-98 and v2:125-127 both re-validate post-update. Distinct-keys constraint enforced. ✓ Resolved if no other bypass found. |
| H005 | Authority winner selection fraud | OPEN — authority chooses winner | OPEN — same | Authority can settle to any registered player. Mitigated by S004 (only authority creates matches), so attacker must register their own wallet as a player at match creation. |
| H006 | 23-hour dead zone | RECHECK — timing constants | NOT_APPLICABLE — different model | v1: TIMEOUT=600, SETTLEMENT_TIMEOUT=3600, RECLAIM_TIMEOUT=1200. Need timing focus to verify. v2 uses match_end_ts+24h, no fixed dead-zone math. |
| H007 | Pause-as-griefing on cancel | OPEN — cancel STILL has pause guard | RESOLVED — cancel/reclaim/settle removed pause guard | v1:729 still has `constraint = !config.is_paused`. v2:756-761, 768-782 (cancel/reclaim) and 730-735 (settle) — no pause guard. v2 fully resolved. |
| H011 | Config treasury self-redirect | OPEN — only treasury≠ops checked | OPEN for new matches; MITIGATED for in-flight | Authority can still set treasury == authority_alt (different pubkey) and earn 7% (v1) or 0-10% (v2 new matches). Snapshot mitigates in-flight only. |
| H013 | PDA rent extraction at low wagers | RE-VALIDATE | RE-VALIDATE | v2: close=caller pattern means rent goes to caller, not depositor. NOT economically exploitable for net theft (rent ~0.006 SOL is small). HOWEVER — combined with the partial-refund theft, the attacker takes much more than just rent. Re-classify as: rent leakage to caller is intentional but the partial-refund theft is the actual issue. |
| H014 | Authority collusion: settle to controlled winner | OPEN — POTENTIAL | OPEN — POTENTIAL | Same as H005. Authority registers self/alt as player, settles to alt. Mitigated by S004 (authority can't be a player) but authority can use a controlled secondary wallet as player. |
| H016 | AwaitingDeposits cancel without depositing | OPEN — close=caller pattern | OPEN — same | Player who didn't deposit can call cancel after timeout, take rent + un-refunded wagers via close=caller. **This is the partial-refund theft pattern.** |
| H028 | BPS constant manipulation via upgrade | LIKELY HOLDS | **PARTIALLY EXPLOITABLE** | v1: BPS hardcoded, only changeable via program upgrade. v2: BPS configurable via update_config within MAX_FEE_BPS=1000 cap (10%). Authority can ratchet BPS for new matches. Snapshot prevents in-flight modification. **Phase 4 must investigate further: rate-limiting? timelock? per-match max?** |

---

**One-line summary:** 12 economic concerns documented; **H028 v2 verdict: PARTIALLY EXPLOITABLE** — runtime-configurable BPS allows authority to extract up to 10% of NEW matches' pots (combined treasury+ops cap), in-flight matches protected by snapshot. **NOVEL CRITICAL FINDING surfaced: partial-refund theft via `close = caller` + caller-controlled `remaining_accounts` length affects BOTH v1 and v2 cancel_match and permissionless_reclaim.**
