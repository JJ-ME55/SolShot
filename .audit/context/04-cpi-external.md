---
task_id: sos-phase1-cpi
provides: [cpi-findings, cpi-invariants]
focus_area: cpi
files_analyzed: [programs/solshot-escrow/src/lib.rs, programs/solshot-escrow-v2/src/lib.rs]
finding_count: 9
severity_breakdown: {critical: 0, high: 3, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# CPI & External Calls — Condensed Summary

## CPI Inventory (Complete)

| # | Location | Kind | Target | Validated By | Notes |
|---|----------|------|--------|--------------|-------|
| 1 | v1 `lib.rs:213-222` (`deposit_wager`) | `system_program::transfer` via `CpiContext::new` | System Program | `Program<'info, System>` at v1:654 | Player→escrow SOL transfer; player signs |
| 2 | v2 `lib.rs:275-284` (`deposit_wager`) | `system_program::transfer` via `CpiContext::new` | System Program | `Program<'info, System>` at v2:686 | Player→escrow SOL transfer; player signs |

**That is the entire CPI surface.** Neither program calls `invoke()`, `invoke_signed()`, `get_return_data()`, any Token program, any oracle, any governance program, or any custom external program. CPI depth is exactly 1 — the System Program is a leaf with no further nesting.

**Direct-lamport-mutation sites (NOT CPI but behave like CPI for threat modeling):**

| # | Location | Action | Pattern |
|---|----------|--------|---------|
| 3 | v1 `settle_match:317-324` | escrow → winner / treasury / ops (3 transfers) | `**try_borrow_mut_lamports()? -=/+= amount` |
| 4 | v1 `cancel_match:391-410` | escrow → players[i] (loop, bit-mask gated) | Same, inside `for (i, account) in remaining_accounts.iter().enumerate()` |
| 5 | v1 `permissionless_reclaim:464-478` | escrow → players[i] (loop, bit-mask gated) | Same loop pattern, anyone can call |
| 6 | v2 `settle_match:434-441` | escrow → winner / treasury_snapshot / ops_snapshot | Same as v1 but reads snapshot pubkeys/BPS |
| 7 | v2 `cancel_match:502-510` | escrow → players[i] (loop) | Same |
| 8 | v2 `permissionless_reclaim:561-569` | escrow → players[i] (loop) | Same |

## `remaining_accounts` Validation Matrix (the highest-priority surface)

Four iteration sites, identical 3-line per-iteration validation:

```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);              // (a) bounds
    require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer); // (b) bit set
    require!(*account.key == players[i], EscrowError::InvalidPlayer);    // (c) pubkey match
    **escrow.lamports -= wager_lamports;                                  // (d) debit
    **account.lamports += wager_lamports;                                 // (e) credit
}
```

| Check | v1 cancel (391-409) | v1 reclaim (465-484) | v2 cancel (502-510) | v2 reclaim (561-569) |
|-------|---------------------|----------------------|---------------------|----------------------|
| 1. `remaining_accounts[i]` matches `players[i]` | YES (line 402-405) | YES (471-474) | YES (506) | YES (565) |
| 2. Bit `i` of `deposits_mask` controls refund | YES (398-399) | YES (468-469) | YES (504-505) | YES (563-564) |
| 3. Pubkey check forces exact `players[i]` | YES — strict `==` | YES | YES | YES |
| 4. Writability — destination must be writable | NOT enforced in program; client-side `isWritable: true` (server/services/escrow.js:459) | Same | Same (server/services/escrow-v2.js) | Same |
| 5. Lamport conservation: refunds == wager × count_ones | Implicit (loop iterates only deposited slots) | Implicit | Implicit | Implicit |
| 6. Order: caller MUST pass in `players[i]` index order, contiguous starting at 0 | YES — `enumerate()` + strict `==` | YES | YES | YES |

**The single mandatory invariant the loop enforces:** `remaining_accounts` must be a **contiguous prefix** of the deposited slots — exactly `players[0], players[1], ..., players[k-1]` where `k = remaining_accounts.len()`, AND `deposits_mask` bits 0..k must all be set. **Any non-contiguous `deposits_mask` (e.g. `0b10`) is unrefundable** because the loop walks `i=0,1,...` and rejects on bit-not-set OR pubkey mismatch (since the caller cannot insert "skip" entries).

## Key Findings (Top 9)

1. **NOVEL-CPI-01 (HIGH) — Non-contiguous `deposits_mask` is permanently unrefundable.** The loop matches `remaining_accounts[i]` against `players[i]` and requires bit `i` set. If only `players[1]` deposits and `players[0]` does not (`deposits_mask = 0b10`), there is no syntactically valid call: passing `players[1]` as the only `remaining_accounts[0]` fails the pubkey check (`players[0] != players[1]`); passing `players[0]` as `remaining_accounts[0]` and `players[1]` as `remaining_accounts[1]` fails the bit-set check at i=0; passing nothing leaves the deposit stranded. **The off-chain server (`server/socket-io/main.js:484-489`) explicitly logs this as "UNRECOVERABLE" and writes the match off.** Affects v1 cancel + v1 reclaim + v2 cancel + v2 reclaim. — `v1:393-410, 465-484; v2:502-510, 561-569`
2. **H009 — Executable account as fee destination — STILL OPEN in BOTH v1 and v2.** Grep for `executable` returns zero matches. v1 SettleMatch constraints check key identity only (lines 686-687, 695); v2 SettleMatch checks against snapshot (lines 717-718, 726) — neither checks `!treasury.executable` or `!ops.executable`. Per EP-106, lamport credits to executable accounts may silently succeed in-memory but be discarded at commit. Same exposure on v1's `winner` account (only constrained to `players[i]`) — but mitigated by the fact that players must sign `deposit_wager`, so they hold private keys. Recommended fix from Feb (Fix 2) was a 1-line constraint addition; not landed. — `v1:680-697, v2:711-728`
3. **CPI-02 (MEDIUM) — `Pubkey::default()` slot pollution risk in v1 `cancel_match`.** Players array is `[Pubkey; 4]` zero-padded. If `max_players = 2` but caller passes 4 `remaining_accounts` (or any number > deposit count), the bounds check `i < max_players` REJECTS at i=2, which is correct. But if the bit-mask check at i=2 passes (mask wider than max_players, defensive coding gap), comparison would be `account.key == Pubkey::default()` — which is a real Solana pubkey (`11111111111111111111111111111111`, the System Program). Anyone passing `system_program` at slot i=k where bit k is somehow set would match. Currently safe because (a) `deposits_mask` bits past max_players are never set in normal flow; (b) v1 `deposits_mask` is u8 so max is 8 bits; (c) the bounds check fires first. But the defensive gap is real if `deposits_mask` is ever corrupted or written from an instruction we haven't audited. — `v1:394-405; v2:503-506`
4. **CPI-03 (MEDIUM) — `try_borrow_mut_lamports()? += amount` increment without overflow check.** Line 318 (v1), line 321 (v1), line 324 (v1), line 409 (v1), line 477 (v1), and identical positions in v2. Solana lamport balances are u64. If the recipient already holds a balance such that `existing + wager_lamports > u64::MAX`, the `+=` panics in debug or wraps in release (Rust integer arithmetic). Fee destinations could receive many settlements; theoretically reachable at extreme volumes. The escrow PDA debit side is bounded (escrow holds at most `MAX_WAGER × MAX_PLAYERS` = 100 SOL × 10 = 1000 SOL = 10^12 lamports, far below u64::MAX), so debits are safe. Credits to wallet accounts could be unsafe across many settlements but practically unreachable (would need >1.8e10 SOL accumulated). NOT a vulnerability under realistic conditions. — `v1:317-324, 408-409, 476-477; v2:434-441, 508-509, 567-568`
5. **CPI-04 (MEDIUM) — v1 reclaim has NO `config` account, NO pause guard, NO authority gate.** Designed escape hatch (DCA-02). Anyone can call after `created_at + 1200s`. No `Program<'info, System>` validation needed because no CPI happens (only direct lamport math). The intentional gap is documented; no novel concern beyond what was flagged in Feb (CPI-R03). — `v1:737-754`
6. **CPI-05 (LOW) — v2 reclaim is similar but timing differs.** `match_end_ts + 24h` (or `deposit_deadline + 24h` if not activated). Same architectural pattern — config absent on purpose. No new CPI concern. — `v2:768-782`
7. **CPI-06 (LOW) — Anchor 0.32.1 auto-resolution applied correctly.** `Program<'info, System>` is on every relevant struct (v1:558, 630, 654, 708, 733, 752; v2:599, 664, 686, 739, 763, 780). `config` is auto-resolved from constant seed `b"config"` in all client calls per memory note. No CPI program-ID-mismatch attack vector exists.
8. **CPI-07 (LOW) — H026 holds.** Donation to escrow PDA is economically irrational (recovered by authority via `close = authority` at v1:665; or by `caller` via `close = caller` on cancel/reclaim at v1:718, 745; v2:748, 773). Validated; no change.
9. **CPI-08 (LOW) — H029 holds.** Solana atomic-TX rollback prevents partial settlement. The 6 sequential `try_borrow_mut_lamports()?` calls in `settle_match` (3 debits + 3 credits) and the loop bodies in cancel/reclaim are all `?`-propagated; any failure reverts the entire instruction including the state write at line 311 (v1) / 429 (v2). Validated.

## Critical Mechanisms

- **System Program CPI for deposit (v1:213-222, v2:275-284):** The ONLY CPI in the codebase. `CpiContext::new(...)` with explicit `from = player_signer` and `to = escrow_pda` accounts. Player's signer privilege authorizes only this single SOL transfer. No PDA seeds are exposed; no `invoke_signed`. Anchor validates the System Program ID via `Program<'info, System>`.
- **Direct lamport mutation in `settle_match` (v1:317-324, v2:434-441):** Three sequential debit/credit pairs. State (`Settled`) is written before transfers (OC-10). All `?`-propagated. **No executable check on destinations** — H009.
- **`remaining_accounts` refund loop in cancel/reclaim (4 sites):** Walks caller-provided accounts in `enumerate()` order; per-iteration validates index bounds, deposit-bit, and exact pubkey match against `players[i]`. **Cannot accept non-contiguous deposits_mask** — see NOVEL-CPI-01.

## Invariants & Assumptions

- INVARIANT: The only CPI target program ID is the System Program — enforced by `Program<'info, System>` at v1:558,630,654,708,733,752 / v2:599,664,686,739,763,780.
- INVARIANT: No PDA signer seeds are passed to any external program (no `invoke_signed`) — enforced by the absence of the call.
- INVARIANT: All state transitions to terminal (`Settled`/`Cancelled`) occur BEFORE lamport transfers (OC-10) — enforced at v1:309-313, 385-389, 458-462; v2:427-431, 496-499, 556-559.
- INVARIANT: Each refund destination in cancel/reclaim must equal `escrow.players[i]` for the corresponding loop index `i` AND deposit-bit `i` must be set — enforced at v1:402-405,471-474; v2:506,565.
- INVARIANT: Lamport conservation in the refund loop — `sum(refunds) == wager_lamports × count_ones(deposits_mask provided)`; HOLDS only if `remaining_accounts` is a contiguous prefix of deposited slots.
- ASSUMPTION (UNVALIDATED ⚠): Refund destinations and fee destinations are non-executable — NOT validated; H009 still open in v1 and v2.
- ASSUMPTION (UNVALIDATED ⚠): The off-chain caller will always pass `remaining_accounts` in player-index order with contiguous deposits — required by program logic but not enforced; non-contiguous deposits = stranded funds (NOVEL-CPI-01).
- ASSUMPTION (validated): System Program at `11111111111111111111111111111111` is the legitimate system program — Anchor `Program<'info, System>` enforces this.
- ASSUMPTION (validated): `try_borrow_mut_lamports()` returns `Err` if the borrow conflicts; `?` propagates and Solana rolls back atomically — H029 confirmed.
- ASSUMPTION (UNVALIDATED ⚠): Lamport credit `**dest.lamports += amount` does not overflow u64 — practically safe at realistic volumes (CPI-03), but no explicit `checked_add`.

## Risk Observations (Prioritized)

1. **HIGH — NOVEL-CPI-01 (non-contiguous mask = stranded funds)**: `v1:393-410, 465-484; v2:502-510, 561-569` — On-chain refund logic CANNOT process `deposits_mask` like `0b10` (player 1 deposited, player 0 didn't). Server explicitly tags as UNRECOVERABLE. Fix requires program upgrade: change loop to walk `0..max_players` and look up the correct `remaining_account` by index, OR allow caller to pass an index map. NOT a security exploit per se (no theft), but a permanent fund-lock if the deposit ordering produces a non-contiguous mask, which is possible whenever Player N deposits before Player N-1. Pre-mainnet: test the 2-player `0b10` path.
2. **HIGH — H009 still open (executable fee destination)**: `v1:680-697, v2:711-728` — Single-line fix not landed. v2 architecturally improves via snapshot (immune to mid-flight rotation) BUT does NOT add `!treasury.executable` constraint, so an executable account snapshotted at create-time still exhibits the same lamport-burn behavior. Fix Recommendation: add `constraint = !treasury.executable @ EscrowError::InvalidTreasury` and same for ops on both v1:684-697 and v2:715-728.
3. **HIGH — NOVEL-CPI-02 (refund loop is server-trust-dependent)**: The loop's correctness invariant ("`remaining_accounts` is a contiguous prefix of deposited players in `players[i]` order") is enforced by THE SERVER, not by the program. A malicious authority calling `cancel_match` with a wrong account ordering will cause `InvalidPlayer` revert — safe for funds. But a malicious player calling `cancel_match` (when `is_timed_out`) can call with `remaining_accounts = [their_own_pubkey]` and skip refunding anyone else IF they were players[0]. Specifically: the loop terminates after consuming all `remaining_accounts`, leaving any later-indexed depositors unrefunded — but the close=caller still happens and the player gets the rent. The undelivered wagers stay in the (now-closed!) PDA → UNREACHABLE because Anchor's `close` constraint sweeps ALL remaining lamports to caller. **So a malicious player at `players[0]` could call cancel_match with only themselves in `remaining_accounts`, refund themselves the wager, and rent-sweep the remaining wagers (deposited by `players[1..]`) to themselves.** This is a CRITICAL fund-theft path if we're unsure the bit-mask invariant covers all cases — needs deep dive in Phase 4. — `v1:391-419, v2:501-518` (cancel_match — note the `close = caller` at v1:718, v2:748)
4. **MEDIUM — CPI-03 (credit overflow without checked math)**: Practically unreachable but not formally safe. `**dest.try_borrow_mut_lamports()? += wager_lamports`. Recommendation: convert to `checked_add` form for defense-in-depth.
5. **MEDIUM — CPI-02 (Pubkey::default in zero-padded slots)**: Defensive concern only; current bounds check protects.
6. **LOW — Anchor 0.32.1 auto-resolution**: Used correctly per memory note. No CPI vulnerability from this surface.

## Novel Attack Surface

- **NOVEL-CPI-01 — Non-contiguous deposit mask = permanent fund lock.** Stranding pattern: Player B deposits in window; Player A doesn't (or transaction fails for A). `deposits_mask = 0b10`. NO call sequence can refund Player B because the loop walks i=0,1,... and requires bit 0 set. Player B's wager is locked until program is redeployed. Server logs this as UNRECOVERABLE. **This is unique to this protocol's per-index account-passing design.** Fix: rewrite loop to look up the correct `remaining_account` by player-index map (e.g., caller passes `Vec<u8>` of player indices alongside).
- **NOVEL-CPI-02 — Player at index 0 can rent-sweep co-depositors' wagers.** If a malicious player at `players[0]` is `is_timed_out` and calls `cancel_match` with `remaining_accounts = [their_own_account]`: they refund themselves wager_lamports; the loop terminates; `close = caller` sweeps the PDA's remaining lamports (which include the other depositors' wagers + rent) to their own account. **This is a CRITICAL THEFT VECTOR if the analysis holds.** Phase 4 must validate by either (a) constructing the exact failing assertion or (b) confirming Anchor `close = caller` sweeps post-instruction lamports. Sets up a strong attacker incentive: be a player, wait for timeout, call cancel with only yourself in remaining_accounts, walk away with everyone's deposit. Counter-argument: maybe the `close` semantics + `mut` constraints on the loop prevent it. **Needs PoC.** — `v1:391-419 cancel_match + close=caller at v1:718; v2:459-519 cancel_match + close=caller at v2:748`

## Cross-Focus Handoffs

- → **State Machine Agent**: NOVEL-CPI-02 — investigate whether `close = caller` + partial `remaining_accounts` allows a player to rent-sweep co-depositors' wagers. Specifically: if `cancel_match` runs and consumes only 1 of N depositors in `remaining_accounts`, what does `close = caller` do with the lamports that should have been refunded to the others? Same for v1 + v2. ALSO: NOVEL-CPI-01 — non-contiguous `deposits_mask` makes refund unreachable; document as a state-trap.
- → **Account Validation Agent**: H009 verification on both v1 and v2. SettleMatch UncheckedAccount constraints check key identity only; no `!executable` check. Single-line fix not landed since Feb. Recommend reproducing the EP-106 write-demotion behavior on devnet to confirm Behavior A vs Behavior B.
- → **Token/Economic Agent**: NOVEL-CPI-02 (theft-by-rent-sweep) — confirm or refute the exploitation scenario; calculate worst-case loss (max wager × max_players-1 = 1000 SOL). NOVEL-CPI-01 — quantify probability that a 2-player wager produces `0b10` deposits_mask in production traffic.
- → **Access Control Agent**: cancel_match permits any player after timeout. Combined with NOVEL-CPI-02, the access-control surface for cancel_match expands to a fund-extraction path. Re-evaluate H016 (rent theft) under the lens of NOVEL-CPI-02.
- → **Error Handling Agent**: The 6 `?` propagations in settle_match and the loops in cancel/reclaim. Confirm Solana TX rollback behavior matches Feb assessment under Anchor 0.32.1 (no behavior change expected, but note for audit completeness).
- → **Arithmetic Agent**: CPI-03 (lamport credit overflow without checked math). Recommend `checked_add` for defense-in-depth on lines v1:318, 321, 324, 409, 477; v2:435, 438, 441, 509, 568.

## Trust Boundaries

- **System Program** (CPI target): FULL trust. Validated via `Program<'info, System>`. Cannot be substituted.
- **Escrow PDA** (lamport source/destination): FULL trust (program-owned).
- **Winner / Treasury / Ops UncheckedAccounts** (lamport credit destinations in `settle_match`): LIMITED trust. Key identity validated against `escrow.players[i]` (winner) and `config.treasury / config.ops` (v1) or `escrow.treasury_snapshot / ops_snapshot` (v2). NO executable check (H009). NO writability check.
- **`remaining_accounts` in cancel/reclaim**: LIMITED trust. Per-iteration validated for: index bounds, mask bit set, exact pubkey match against `players[i]`. NOT validated for: writability, executability, non-default-pubkey (defense-in-depth gap, not exploitable).
- **Caller of cancel_match**: TRUST BOUNDARY. Authority OR any registered player (after timeout). `close = caller` sends rent (+ potentially co-depositors' wagers per NOVEL-CPI-02) to caller.
- **Caller of permissionless_reclaim**: TRUST BOUNDARY. Anyone after grace period. Same `close = caller`. Same NOVEL-CPI-02 exposure.
<!-- CONDENSED_SUMMARY_END -->

---

# CPI & External Calls — Full Analysis

## Executive Summary

The SolShot escrow programs (v1: `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`; v2: `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`) have an exceptionally narrow CPI surface. There is exactly **ONE** cross-program invocation across both 1982 LOC of source code: a `system_program::transfer` call in each `deposit_wager` instruction (v1:213-222, v2:275-284). Both use Anchor's type-safe `CpiContext::new()` wrapper, validate the System Program via `Program<'info, System>`, and pass only the player's signer and the escrow PDA destination. There is no `invoke()`, no `invoke_signed()`, no `get_return_data()`, no Token program CPI, no oracle CPI, no governance CPI, no custom external program CPI.

All other value movement (settlement payouts, cancellation refunds, permissionless reclaims) uses **direct lamport mutation** via `try_borrow_mut_lamports()` — operations on accounts the program owns or has been authorized to modify via `mut` constraints. This is NOT CPI but lives in the same threat model: lamport movement to caller-supplied accounts must validate ownership, executability, and writability of the destinations.

The highest-risk surface is the four `remaining_accounts` iteration sites (v1 cancel_match:391-410, v1 permissionless_reclaim:465-484, v2 cancel_match:502-510, v2 permissionless_reclaim:561-569). Each loop walks `for (i, account) in ctx.remaining_accounts.iter().enumerate()` and validates: (a) `i < max_players`, (b) `(deposits_mask >> i) & 1 == 1`, (c) `*account.key == players[i]`. Two novel concerns emerge:

1. **NOVEL-CPI-01: Non-contiguous deposit masks are unrefundable.** The loop's structure forces `remaining_accounts` to be a contiguous prefix of `players[]` corresponding to set bits in the mask. If `players[1]` deposits but `players[0]` doesn't, `deposits_mask = 0b10` — no syntactically valid call exists. The off-chain server (`server/socket-io/main.js:484-489`) explicitly identifies this as UNRECOVERABLE on-chain.

2. **NOVEL-CPI-02: A malicious player at `players[0]` may be able to rent-sweep co-depositors' wagers.** If the player calls `cancel_match` with only their own pubkey in `remaining_accounts`, the loop refunds them, terminates, and `close = caller` (v1:718, v2:748) sweeps the PDA's remaining lamports — including any other depositors' wagers — to the caller. This is a CRITICAL theft vector if the analysis holds; needs Phase 4 PoC.

The Feb-flagged H009 (executable account as fee destination) **remains open in BOTH v1 and v2**. A simple grep for `executable` returns zero matches; the SettleMatch constraints check key identity only. v2's per-match snapshot architecturally improves config-rotation safety but does not address the executable concern. The single-line fix recommended in Feb has not landed.

H026 (donation attack) and H029 (atomic-TX state revert) are re-validated and confirmed NOT_VULNERABLE in both v1 and v2.

## Scope

- **Files analyzed:**
  - `programs/solshot-escrow/src/lib.rs` (962 LOC, v1)
  - `programs/solshot-escrow-v2/src/lib.rs` (1020 LOC, v2)
- **Functions analyzed:** All 8 instruction handlers in each file (16 total). Specific deep-read on: v1 deposit_wager (187-252), settle_match (258-338), cancel_match (344-419), permissionless_reclaim (425-487); v2 deposit_wager (239-318), settle_match (387-454), cancel_match (459-519), permissionless_reclaim (526-578).
- **Account structs analyzed:** All 8 account structs in each file (16 total). Particular focus on SettleMatch (v1:658-709, v2:690-740), CancelMatch (v1:712-735, v2:743-765), PermissionlessReclaim (v1:738-754, v2:768-782).
- **Estimated coverage:** 100% of CPI and direct-lamport surface.

## Key Mechanisms

### Mechanism 1: System Program Transfer CPI in deposit_wager

**Location:** v1 `lib.rs:213-222`; v2 `lib.rs:275-284`

**Purpose:** Transfer SOL from a player's wallet into the escrow PDA during deposit.

**How it works (v1):**
1. v1:188 reads `wager` from escrow state into a local before any mutable borrow
2. v1:213-220 constructs `CpiContext::new()`:
   - `program`: `ctx.accounts.system_program.to_account_info()`
   - `accounts`: `system_program::Transfer { from: player, to: escrow }`
3. v1:213-222 calls `system_program::transfer(cpi_ctx, wager)`
4. The `?` operator propagates any CPI error (insufficient balance, account locked, etc.)
5. v1:225-226 takes a fresh mutable borrow to set the deposit bit

**How it works (v2):** Identical structure at v2:275-284. The only difference is that v2 reads `duration_secs`, `created_at`, `deposit_window_secs` BEFORE the deposit-window deadline check at v2:256-262. The CPI itself is the same shape.

**Assumptions:**
- The System Program is at `11111111111111111111111111111111`. Anchor's `Program<'info, System>` auto-validates this at v1:654 / v2:686.
- The player has sufficient lamports. If not, the System Program returns an error and `?` propagates.
- The player is a `Signer<'info>` (v1:644 / v2:677). They authorize their own debit.
- The escrow PDA can receive lamports. PDAs accept any positive amount; no upper bound.

**Invariants:**
- Post-CPI: escrow PDA lamport balance increased by exactly `wager_lamports`.
- Post-CPI: player lamport balance decreased by exactly `wager_lamports` (modulo TX fees deducted separately).
- The CPI target is the System Program (Anchor enforces).
- No PDA signer seeds are passed (player is a normal keypair signer; `invoke` not `invoke_signed`).

**Concerns:**
- None on this CPI itself. Canonical safe pattern.
- Adjacent concern: in v1, the deposit may proceed even when the program is unpaused-then-paused mid-window (pause-as-griefing covered by Timing Agent's H007 review).

### Mechanism 2: Direct Lamport Distribution in settle_match

**Location:** v1 `lib.rs:317-324`; v2 `lib.rs:434-441`

**Purpose:** Distribute pot to winner / treasury / ops after match concludes.

**How it works (v1):**
1. v1:309-313 sets state to `Settled` BEFORE transfers (OC-10 defense-in-depth)
2. v1:317 debits `winner_amount` from escrow
3. v1:318 credits winner
4. v1:320 debits `treasury_amount` from escrow
5. v1:321 credits treasury (validated against `config.treasury` at v1:686)
6. v1:323 debits `ops_amount` from escrow
7. v1:324 credits ops (validated against `config.ops` at v1:695)
8. After instruction returns Ok, Anchor's `close = authority` (v1:665) reclaims escrow PDA rent to authority

**How it works (v2):** Identical pattern at v2:434-441. **Key difference:** treasury/ops constraints validate against `escrow.treasury_snapshot` / `escrow.ops_snapshot` (v2:717, 726) instead of `config.treasury` / `config.ops`. This means v2 is immune to mid-flight `update_config` rotation. v2 also reads `treasury_bps` and `ops_bps` from snapshots (v2:398-399) instead of constants.

**Assumptions:**
- Escrow holds ≥ `winner_amount + treasury_amount + ops_amount` (= `total_pot`). Holds because deposits sum to `wager × num_deposited`, and arithmetic at v1:285-307 / v2:402-425 sets each amount such that the sum equals total_pot.
- All recipient accounts can receive lamports (validated by key identity but NOT by executable/reserved-list checks — H009).
- All `try_borrow_mut_lamports()` calls succeed. Within a single instruction, Anchor prevents overlapping borrows by the account-struct field separation.

**Invariants:**
- `winner_amount + treasury_amount + ops_amount == total_pot` (arithmetic remainder strategy at v1:303-307, v2:421-425).
- No lamports created or destroyed (assuming no executable destinations — H009 risk).
- State is `Settled` BEFORE any lamport movement.

**Concerns:**
- **H009 (HIGH, OPEN):** No `!treasury.executable` constraint at v1:684-697 or v2:715-728. Per EP-106, lamport credit to executable accounts may silently succeed in-memory but be discarded at commit, while the escrow debit IS committed. Result: silent fund loss. Single-line fix not landed since Feb.
- **CPI-03 (MEDIUM):** Lamport credits use raw `+= amount` not `checked_add`. Theoretically wraps if recipient already holds ~1.8e19 lamports (~1.8e10 SOL); practically unreachable but not formally safe.
- **CPI-02 (LOW):** `winner` account constraint (v1:674-679, v2:705-710) iterates `(0..escrow.max_players as usize).any(...)`. This is bounded by max_players ≤ 4 (v1) / ≤ 10 (v2). Compute-safe.

### Mechanism 3: remaining_accounts Refund Loop in cancel_match

**Location:** v1 `lib.rs:391-410`; v2 `lib.rs:501-510`

**Purpose:** Refund deposited players' wagers when a match is cancelled.

**How it works (v1):**
1. v1:386-389 sets state to `Cancelled` BEFORE transfers (OC-10)
2. v1:391-410 iterates `for (i, account) in ctx.remaining_accounts.iter().enumerate()`:
   - v1:395 — `require!(i < max_players, EscrowError::InvalidPlayer)` — bounds check
   - v1:398-399 — `require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer)` — bit must be set
   - v1:402-405 — `require!(*account.key == players[i], EscrowError::InvalidPlayer)` — exact pubkey match
   - v1:408 — `**escrow.lamports -= wager_lamports`
   - v1:409 — `**account.lamports += wager_lamports`
3. After instruction returns Ok, `close = caller` (v1:718) reclaims escrow PDA's remaining lamports (rent reserve) to caller.

**How it works (v2):** Identical at v2:501-510. Different timing logic in the cancel-eligibility check (v2:471-489) but the loop body is the same.

**Assumptions:**
- The caller passes `remaining_accounts` as a contiguous prefix of `players[]` corresponding to set bits in `deposits_mask`. **THE PROGRAM DOES NOT ENFORCE THIS** — it only enforces the per-iteration check.
- The caller passes WRITABLE `AccountInfo` instances. Server side does (`isWritable: true` at server/services/escrow.js:459). Program does not enforce writability — the runtime would presumably fail the `try_borrow_mut_lamports()` if the account were not writable.
- `deposits_mask` bit `i` was set ONLY through normal flow (i.e., bit < max_players). True under normal program logic.

**Invariants:**
- Each iteration refunds exactly `wager_lamports` to the account at slot `players[i]` if bit `i` is set.
- After all iterations, `escrow.lamports -= wager_lamports × len(remaining_accounts_passed)`.
- **CRITICAL implicit invariant:** `remaining_accounts` MUST be a contiguous prefix of deposited slots starting at index 0. There is no skip-mechanism.

**Concerns:**
- **NOVEL-CPI-01 (HIGH):** Non-contiguous `deposits_mask` (e.g., `0b10` — bit 1 set, bit 0 unset) is unrefundable. The loop walks i=0,1,...; at i=0 the bit-set check fails. Passing different-order `remaining_accounts` fails the pubkey check. **Result: stranded funds.** Server logs "UNRECOVERABLE" (server/socket-io/main.js:488).
- **NOVEL-CPI-02 (HIGH if confirmed):** Player at `players[0]` calls cancel with only their own account in `remaining_accounts`. Loop refunds them once and exits (length=1). `close = caller` then sweeps PDA's remaining lamports — INCLUDING the unrefunded wagers from `players[1..]` — to the caller. **THEFT.** Needs Phase 4 PoC. Counter-argument: maybe Anchor's `close` semantics or the `mut` Signer constraint blocks this; needs runtime test.
- **CPI-02 (MEDIUM):** If `deposits_mask` is somehow widened beyond `max_players` (bit at index ≥ max_players set), the bounds check fires before the bit check and the loop terminates with `InvalidPlayer`. Defensive coding holds, but the pubkey check at slot ≥ max_players would compare against `Pubkey::default()` (the zero-padded slots), which equals the System Program pubkey. Unreachable in normal flow, but worth noting.

### Mechanism 4: remaining_accounts Refund Loop in permissionless_reclaim

**Location:** v1 `lib.rs:464-484`; v2 `lib.rs:561-569`

**Purpose:** Public escape hatch — any signer can refund deposited players after the grace period.

**How it works:** Identical to Mechanism 3 (cancel_match's loop body). Different gating logic on when it can be called (timeout-based, no authority gate). `close = caller` at v1:745, v2:773.

**Differences from cancel_match:**
- No `config` account in PermissionlessReclaim (v1:740-754, v2:768-782). Intentional — DCA-02 escape hatch must work even if config is corrupted.
- No pause guard (intentional).
- v1: 2× TIMEOUT_SECONDS = 1200s (20 min) grace from `created_at` (or `activated_at` if Active).
- v2: PUBLIC_REFUND_GRACE_SECS = 86400s (24h) grace from `match_end_ts` (or `deposit_deadline` if not activated).

**Concerns:** Same NOVEL-CPI-01 and NOVEL-CPI-02 as cancel_match. The "anyone" caller widens NOVEL-CPI-02's exploit population beyond just registered players.

### Mechanism 5: Clock Sysvar Access (Reference)

**Location:** v1: lines 170, 238, 367, 454, 524. v2: lines 216, 260, 298, 337, 364, 479, 552.

**How it works:** All call sites use `Clock::get()?.unix_timestamp` — syscall-based, NOT account-based. No `AccountInfo<Clock>` is ever passed in any instruction context.

**Concerns:** None. The syscall approach eliminates EP-006 (sysvar account injection). Per EP-089 / EP-090, validators have ~1-2s timestamp drift; for the protocol's hour/day-scale deadlines this is immaterial.

## Trust Model

| Entity | Trust Level | Rationale |
|--------|-------------|-----------|
| System Program (`11111111111111111111111111111111`) | FULL | Hardcoded; Anchor `Program<'info, System>` validates. |
| Clock Sysvar via `Clock::get()` | FULL | Syscall, not account. Cannot be spoofed. |
| Escrow PDA | FULL (program-owned) | Program is the only owner. Lamport mutations from program are authorized. |
| Winner UncheckedAccount in settle_match | LIMITED | Constrained to `escrow.players[i]`. NO executable check. |
| Treasury/Ops UncheckedAccount in settle_match (v1) | LIMITED | Constrained to `config.treasury / config.ops`. NO executable check. Live config = mid-flight rotation risk (covered by Token/Economic Agent). |
| Treasury/Ops UncheckedAccount in settle_match (v2) | LIMITED | Constrained to `escrow.treasury_snapshot / escrow.ops_snapshot`. Per-match snapshot — immune to mid-flight rotation. NO executable check. |
| `ctx.remaining_accounts[i]` in cancel/reclaim | LIMITED | Per-iteration validated for bounds, mask bit, pubkey-match-against-`players[i]`. NO executable check. NO writability check at the program level (relies on runtime). |
| Caller of cancel_match | TRUST BOUNDARY | Authority OR registered player after timeout. `close = caller` redirects rent + (per NOVEL-CPI-02 if confirmed) co-depositors' wagers. |
| Caller of permissionless_reclaim | TRUST BOUNDARY | Anyone after grace. Same NOVEL-CPI-02 exposure with broader attacker population. |
| Authority key | TRUST BOUNDARY | Hot wallet on devnet. Can call `update_config` to rotate `config.treasury`/`ops` to anything (executable, reserved, default) — see H009, H001. |

## State Analysis

### State Read by CPI / External-call Sites

- v1 deposit_wager (213-222): reads `escrow.wager_lamports` (line 191) before CPI. Account: `system_program` (read).
- v2 deposit_wager (275-284): reads `escrow.wager_lamports`, `escrow.duration_secs`, `escrow.created_at`, `escrow.deposit_window_secs` (243-248) before CPI. Account: `system_program` (read).

### State Written After CPI / External Calls

- v1 deposit_wager (225-249): `escrow.deposits_mask` (226), `escrow.state` (237 if full), `escrow.activated_at` (238 if full).
- v2 deposit_wager (286-315): `escrow.deposits_mask` (287), `escrow.state` (299 if full), `escrow.activated_at` (300 if full), `escrow.match_end_ts` (301-303 if full).

### State Written BEFORE Direct Lamport Movement

- v1 settle_match (309-313): `escrow.state = Settled` BEFORE lamport transfers.
- v1 cancel_match (385-389): `escrow.state = Cancelled` BEFORE transfers.
- v1 permissionless_reclaim (458-462): `escrow.state = Cancelled` BEFORE transfers.
- v2 settle_match (427-431): same.
- v2 cancel_match (496-499): same.
- v2 permissionless_reclaim (556-559): same.

This is the OC-10 pattern. The state-before-transfer ordering is correct.

## Dependencies

### External Programs Invoked
1. **System Program** (`11111111111111111111111111111111`): Used for SOL transfer in deposit_wager. Validated via `Program<'info, System>`. **Only program invoked.**

### External Programs NOT Invoked
- SPL Token Program — not used.
- SPL Token-2022 — not used.
- Pyth / Switchboard — no oracles.
- Governance programs (SPL Governance, Squads) — not used.
- Any custom program — not used.

### Anchor Framework Dependencies
- `anchor_lang::prelude::*` (v1:4, v2:18): Provides `Account`, `Signer`, `Program`, `UncheckedAccount`, `CpiContext`, constraints, error handling, `Pubkey`, `Clock`.
- `anchor_lang::system_program` (v1:5, v2:19): Provides `system_program::transfer` CPI wrapper and `system_program::Transfer` accounts struct.

### Sysvar Dependencies
- `Clock` via `Clock::get()` syscall (v1: 5 sites; v2: 7 sites).

### Anchor Version
- 0.32.1 in both `programs/solshot-escrow/Cargo.toml:20` and `programs/solshot-escrow-v2/Cargo.toml:20`.
- Per project memory: Anchor 0.30+ auto-resolves accounts with `pda` (constant seeds) or `address` declarations. The escrow team observed `InvalidProgramId on system_program` when explicitly passing config in `.accounts({...})`. **Off-chain client code MUST pass only signers + non-constant-PDA accounts in `.accounts({...})`.** Verified at server/services/escrow.js:452-455 (cancel passes only `escrow` + `caller`) and server/services/escrow-v2.js:344+374. Auto-resolution is correctly applied. No CPI-from-Anchor-resolution-mismatch attack vector.

## Focus-Specific Analysis

### CPI Call Map (Mandatory Output Section 1)

| # | Location | Target | Method | Call Type | Program ID Validated? | PDA Seeds (if signed) | Mutates Caller-Provided Account? |
|---|----------|--------|--------|-----------|------------------------|------------------------|------------------------------------|
| 1 | v1:213-222 (deposit_wager) | System Program | `system_program::transfer` | `CpiContext::new()` | YES (`Program<'info, System>` at v1:654) | N/A — player signs via `Signer<'info>` | YES — debits player, credits escrow PDA |
| 2 | v2:275-284 (deposit_wager) | System Program | `system_program::transfer` | `CpiContext::new()` | YES (`Program<'info, System>` at v2:686) | N/A — player signs | YES — debits player, credits escrow PDA |

**That is the entire CPI map.** No `invoke()`, no `invoke_signed()`, no other targets, no PDA signer seeds anywhere.

### Privilege Flow Analysis (Mandatory Output Section 2)

**deposit_wager CPI (v1:213-222, v2:275-284):**
- Accounts passed to System Program:
  - `from`: player (`Signer<'info>` at v1:644 / v2:677, `mut`) — player signs the transfer authorization
  - `to`: escrow PDA (`Account<'info, MatchEscrow>` at v1:641 / v2:674, `mut`) — receives lamports
- What can the System Program do with these?
  - Transfer lamports from `from` to `to`. Period.
  - System Program cannot modify account data, owner, or anything else.
  - System Program enforces that `from` is a signer.
- Mutable accounts that shouldn't be?
  - Both are correctly mutable.
  - No additional accounts are passed beyond what's required.

**No PDA signer seeds are passed to ANY external program because no `invoke_signed` exists.** The escrow PDA's signer authority is therefore never delegated.

### Return Data Analysis (Mandatory Output Section 3)

**No instruction in either program calls `get_return_data()`.** The single CPI (`system_program::transfer`) does not return data. EP-045 (CPI return data spoofing) is therefore eliminated entirely.

### remaining_accounts Audit (Mandatory Output Section 4)

Four iteration sites — full audit:

#### Site A: v1 cancel_match (lines 391-410)

```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);                  // bounds
    let bit_set = (deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);                          // mask bit
    require!(*account.key == players[i], EscrowError::InvalidPlayer);       // pubkey
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

| Validation | Status | Notes |
|------------|--------|-------|
| Owner check | NO | Refund destinations are external wallets, no owner constraint required |
| Discriminator check | NO (N/A — not a typed account) | |
| Type check | NO (raw `AccountInfo`) | |
| Pubkey match against `escrow.players[i]` | YES (line 402-405) | Strict `==` |
| Mask bit `i` set | YES (line 398-399) | |
| Bounds (`i < max_players`) | YES (line 395) | |
| Writability | NOT in program; runtime presumably enforces via `try_borrow_mut_lamports` | Server passes `isWritable: true` |
| Executability | NOT enforced | Same H009 concern applies if a player wallet is replaced by an executable pubkey at create-time. But players must SIGN deposit_wager (Signer<'info>), so they cannot be programs. |
| Non-default (zero) pubkey | NOT enforced | Theoretical concern at slot ≥ max_players; bounds check protects |

**Loop integrity:** The loop walks `enumerate()` so `i = 0, 1, 2, ...` strictly. This means `remaining_accounts` MUST appear in exactly the order `[players[0], players[1], ..., players[k-1]]` where the first `k` bits of `deposits_mask` are all set. **If bit `i` is set but bit `i-1` is not, no valid call exists** — see NOVEL-CPI-01.

#### Site B: v1 permissionless_reclaim (lines 465-484)

Identical structure to Site A. Same validation matrix. Same NOVEL-CPI-01 concern. Same NOVEL-CPI-02 concern.

#### Site C: v2 cancel_match (lines 502-510)

```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);
    let bit_set = (deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);
    require!(*account.key == players[i], EscrowError::InvalidPlayer);
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

Identical to Site A. The only difference is `deposits_mask` is `u16` instead of `u8`, supporting up to 16 bits (max 10 players in v2).

#### Site D: v2 permissionless_reclaim (lines 561-569)

Identical to Site C.

**Summary table — 6-check matrix per loop site:**

| Check | Site A (v1 cancel) | Site B (v1 reclaim) | Site C (v2 cancel) | Site D (v2 reclaim) |
|-------|---|---|---|---|
| 1. account==players[i] | ✓ 402-405 | ✓ 471-474 | ✓ 506 | ✓ 565 |
| 2. bit i in mask | ✓ 398-399 | ✓ 468-469 | ✓ 504-505 | ✓ 563-564 |
| 3. bounds (i < max) | ✓ 395 | ✓ 466 | ✓ 503 | ✓ 562 |
| 4. writability | runtime-enforced via try_borrow_mut_lamports | same | same | same |
| 5. lamport conservation | implicit (sum=wager×len) | implicit | implicit | implicit |
| 6. order/contiguity | NOT enforced (NOVEL-CPI-01) | NOT enforced | NOT enforced | NOT enforced |

### Account Validation Cross-Reference for CPI Surface

Beyond the loop sites, the following accounts also receive direct lamport credits:

| Account | Site | UncheckedAccount? | Constraint | Receives Lamports? | Risk |
|---------|------|---------------------|------------|----------------------|------|
| winner | v1 settle_match (line 318) | YES (v1:680) | `(0..max_players).any(|i| players[i] == winner.key())` | YES | Players sign deposit, so cannot be programs. Effectively safe. |
| winner | v2 settle_match (line 435) | YES (v2:711) | Same | YES | Same. |
| treasury | v1 settle_match (line 321) | YES (v1:689) | `treasury.key() == config.treasury`, `treasury.key() != ops.key()` | YES | H009: no executable check |
| treasury | v2 settle_match (line 438) | YES (v2:720) | `treasury.key() == escrow.treasury_snapshot`, `!= ops.key()` | YES | H009: no executable check (but snapshot prevents mid-flight rotation) |
| ops | v1 settle_match (line 324) | YES (v1:697) | `ops.key() == config.ops` | YES | H009: no executable check |
| ops | v2 settle_match (line 441) | YES (v2:728) | `ops.key() == escrow.ops_snapshot` | YES | H009: no executable check |

## Cross-Focus Intersections

### CPI × Access Control
- The single CPI in deposit_wager uses the player's signer authority. No PDA signer seeds escape the program. No authority key is passed to any external program.
- `cancel_match` access control (any registered player after timeout) intersects with NOVEL-CPI-02: a player gaining caller status post-timeout could exploit `close = caller` to sweep PDA lamports.
- `permissionless_reclaim` widens the caller surface to "anyone after grace period" — broadens NOVEL-CPI-02's attacker population.
- Authority's `update_config` can rotate `config.treasury`/`config.ops` to executable accounts (H009), bypassing v1's settle-match constraints semantically. v2 mitigates via snapshot but does not add the executable check.

### CPI × State Machine
- OC-10 (state-before-transfer) is correctly applied at all 6 lamport-movement sites. State writes to `Settled` / `Cancelled` BEFORE `try_borrow_mut_lamports`. If any transfer fails, atomic TX rollback reverts both the state and the transfer (H029 confirmed).
- NOVEL-CPI-02: state is `Cancelled` at v1:387 / v2:497 BEFORE the partial loop runs. If the malicious caller exits the loop early (only 1 of N depositors), the state is already `Cancelled` and `close = caller` runs to completion, sweeping PDA lamports. **The state machine does not prevent partial refunds.**

### CPI × Arithmetic
- Wager amounts in the deposit CPI are read directly from `escrow.wager_lamports`, validated at create-time to be in `[10_000, 100_000_000_000]`. No arithmetic before the CPI.
- Settlement arithmetic (v1:285-307, v2:402-425) uses u128 widening + checked_mul/checked_sub. Result casts back to u64 — safe for max wager.
- Lamport credit `+= amount` (e.g. v1:318) is NOT checked. Practically unreachable overflow but a gap.

### CPI × Token/Economic
- All value transfer is in native SOL via `system_program::transfer` (CPI) or direct lamport math. No SPL Token, no Token-2022. EP-049 (unverified token program) and EP-051-057 (Token category) are inapplicable.
- Fee distribution math feeds into the direct lamport transfers. The Token/Economic Agent should re-validate the fee math; the CPI Agent confirms the destinations are key-validated but not executable-checked.

### CPI × Error Handling
- Every CPI and every direct-lamport mutation uses `?` propagation. No `let _ =` patterns. No silent swallow.
- CPI return value (none expected from `system_program::transfer`) is not consumed.

## Cross-Reference Handoffs

- → **State Machine Agent**: Investigate NOVEL-CPI-02 with full lifecycle context. Specifically: in v1 cancel_match (391-419) and v2 cancel_match (501-518), if the loop processes only k of N depositors (where k < count_ones(deposits_mask)), what does `close = caller` do with the unrefunded lamports? Test scenario: max_players=4, all 4 deposit (deposits_mask=0b1111), then players[0] calls cancel with `remaining_accounts = [players[0]]`. Loop runs once (i=0, refunds players[0]), exits. PDA holds (4-1)×wager + rent. `close = caller` sweeps to caller (= players[0]). Outcome: players[0] receives 4×wager + rent. Theft of 3×wager from players[1..3]. Confirm or refute.
- → **State Machine Agent**: Document NOVEL-CPI-01 (non-contiguous mask = stranded funds) as a state trap in the lifecycle map. Affects all 4 cancel/reclaim sites.
- → **Account Validation Agent**: H009 is OPEN. Single-line fix not landed. Add `constraint = !treasury.executable @ EscrowError::InvalidTreasury` and same for ops at v1:684-697 and v2:715-728. Recommend devnet test to confirm EP-106 Behavior A (silent burn) vs Behavior B (atomic revert) under Anchor 0.32.1 + Solana 1.18+.
- → **Token/Economic Agent**: NOVEL-CPI-02 — quantify worst-case loss. Max scenario: v2 with max_players=10, max_wager=100 SOL → up to 900 SOL stealable per match by a malicious caller. NOVEL-CPI-01 — estimate frequency of non-contiguous masks in production traffic.
- → **Access Control Agent**: H016 (rent theft via cancel_match `close = caller`) was Feb LOW. Re-evaluate as POTENTIAL HIGH under NOVEL-CPI-02 if confirmed.
- → **Arithmetic Agent**: CPI-03 lamport credit overflow. Apply `checked_add` defense-in-depth.
- → **Timing Agent**: cancel_match's `is_timed_out` gate (v1:367, v2:480) determines when a player can call cancel. NOVEL-CPI-02 requires this to be true. Verify that `is_timed_out` calculation doesn't allow earlier-than-intended access.

## Risk Observations

1. **NOVEL-CPI-01 (HIGH) — Non-contiguous deposit mask = unrefundable.** Affects all four iteration sites. Off-chain server explicitly logs as UNRECOVERABLE.
2. **NOVEL-CPI-02 (HIGH if confirmed) — Player at slot 0 can rent-sweep co-depositors via partial cancel_match call + close = caller.** Phase 4 PoC required. Counter-arguments: maybe Anchor's exit hooks check refund completeness (unlikely), or the `mut` constraint blocks it (also unlikely — `mut` on Signer just means mutable signer, not "signer must be unique").
3. **H009 (HIGH, OPEN) — Executable account as fee destination — both v1 and v2.** Single-line fix not landed since Feb.
4. **CPI-03 (MEDIUM) — Lamport credit overflow without checked_add.** Practically unreachable but defensive gap.
5. **CPI-02 (MEDIUM) — Pubkey::default in zero-padded slots could match if mask widens beyond max_players.** Bounds check protects in current flow.
6. **H026 (LOW, NOT_VULNERABLE) — Donation attack.** Re-validated. No change.
7. **H029 (LOW, NOT_VULNERABLE) — Atomic-TX rollback prevents partial settlement.** Re-validated. No change.
8. **CPI-04 (LOW) — Reclaim has no config; intentional escape hatch.** Per DCA-02 design.
9. **CPI-05 (LOW) — Anchor 0.32.1 auto-resolution applied correctly.** Off-chain code follows the project memory note.

## Novel Attack Surface Observations

### NOVEL-CPI-01: Non-Contiguous Deposit Mask Strands Funds Permanently

**Pattern unique to this protocol:** The refund loop's `for (i, account) in remaining_accounts.iter().enumerate()` design forces `remaining_accounts` to be a contiguous prefix of deposited slots. In a 2-player wager where players[1] deposits FIRST and the deposit window expires before players[0] deposits, `deposits_mask = 0b10` (bit 1 set, bit 0 unset). No syntactically valid call exists:

- `cancel_match(remaining_accounts=[])` → loop doesn't run; players[1]'s deposit stays in PDA. Then `close = caller` sweeps PDA lamports (rent + players[1]'s wager) to caller. **If caller is authority, authority steals the wager. If caller is a player (only players[1] qualifies via `is_player` check at v1:372), players[1] effectively gets rent back too** but loses the wager which goes... wait, where? Re-read.
- Actually `close = caller` would send all remaining lamports to caller. So if players[1] calls cancel_match with empty `remaining_accounts`, they receive the rent reserve PLUS their own deposit — refunding themselves correctly, plus rent windfall. So this case is actually OK economically for players[1].
- But what if the authority calls cancel_match with empty `remaining_accounts` while in AwaitingDeposits? Then authority receives rent + players[1]'s deposit. **That's an authority extraction path** — needs Token/Economic deep-dive.

Key insight: the "UNRECOVERABLE" tag from the server is overly pessimistic. The funds are ALWAYS recoverable — the question is BY WHOM. With empty `remaining_accounts`, `close = caller` recovers everything to caller, INCLUDING wagers that should have been refunded to the depositor. **This IS a theft path. NOVEL-CPI-02 generalizes it.**

### NOVEL-CPI-02: Player-Triggered Rent Sweep of Co-Depositor Wagers

**Mechanism:** A registered player calling `cancel_match` (after timeout) or `permissionless_reclaim` (after grace) controls the contents of `remaining_accounts`. By passing FEWER accounts than `count_ones(deposits_mask)`, the loop refunds only the included slots. After the loop returns, `close = caller` (v1:718, v2:748 for cancel; v1:745, v2:773 for reclaim) transfers ALL remaining PDA lamports — including the unrefunded wagers — to the caller.

**Specific exploit (v1 cancel_match, max_players=4, all 4 deposited):**
1. Match has 4 players, deposits_mask = 0b1111, escrow PDA holds 4 × wager + rent.
2. Match becomes timed-out (e.g., authority abandons settlement; v1's TIMEOUT_SECONDS=600 elapses).
3. Malicious players[0] calls `cancel_match` with `remaining_accounts = [players[0]_pubkey]`.
4. Loop runs once: i=0, bit 0 set, account.key==players[0] ✓, debit wager from escrow, credit wager to players[0]. PDA now holds 3 × wager + rent.
5. Loop exits (no more `remaining_accounts`).
6. State is `Cancelled`. Instruction returns Ok.
7. Anchor exit handler runs `close = caller`: transfers ALL PDA lamports (3 × wager + rent) to players[0].
8. **Net result:** players[0] receives 4 × wager + rent. players[1..3] lose their entire deposit.

**Worst-case loss (v2):** max_players=10, max_wager=100 SOL → up to 9 × 100 = 900 SOL stolen by one malicious player.

**Permissionless reclaim variant:** Same exploit but caller is "anyone" — any wallet that can wait for the grace period.

**Mitigations potentially in place:**
- Anchor's `close` constraint: per Anchor docs, `close = X` transfers ALL remaining lamports to X. This is exactly the exploit vector, NOT a mitigation.
- Authority can call `cancel_match` only in AwaitingDeposits (v1:374-378, v2:485-489). This LIMITS authority's exposure to NOVEL-CPI-02 to AwaitingDeposits state — but a player can still trigger it in any state past timeout.
- Server passes correct `remaining_accounts` (server/services/escrow.js:456-462). But on-chain anyone can call directly without going through the server.

**Counter-argument (needs Phase 4 verification):**
- Maybe `try_borrow_mut_lamports` partial mutation conflicts with `close = caller`'s lamport sweep. UNLIKELY — Anchor's close runs in the exit handler AFTER instruction body completes.
- Maybe the `mut` Signer constraint prevents the same account from being both Signer AND a `remaining_accounts` entry. Possibly — would need testing. If true, the player at slot 0 cannot use their own account as both `caller` and the remaining_account for slot 0, blocking the simple variant. But the malicious player can pass a DIFFERENT pubkey in `remaining_accounts` (the players[0] pubkey, not necessarily their signer caller pubkey)... wait, those must be the same to pass `players[i] == account.key`. Confused — needs careful read.

Re-read: `caller` is the signer, but `caller.key()` must equal one of `players[..max_players]` for `is_player` to be true (v1:372). So `caller.key() == players[0]` is required. Then in `remaining_accounts[0]`, the account.key must also equal `players[0]`. So the same pubkey appears both as Signer and as a remaining_account. Anchor MAY refuse this (account uniqueness check), or MAY accept it (since `caller` and `remaining_accounts[0]` are different account-info structs even if pointing at the same key). **NEEDS TESTING.**

If Anchor's runtime check rejects same-key-twice, the exploit fails — players[0] cannot cancel and rent-sweep simultaneously. They'd need a confederate wallet at one of the slots, which they can't get since all slots are pre-validated.

If Anchor accepts same-key-twice (which is the case for normal accounts; the runtime DOES allow duplicates for non-signer non-mut, but for two `mut` references to the same account it should fail with overlapping borrow), the exploit succeeds.

**Verdict: HIGH severity if confirmed; CRITICAL if multi-player; needs Phase 4 PoC test.**

### NOVEL-CPI-03 (Speculative): The "deposit racing" pattern as N-player scaling weakness

In v2 with max_players=10, the chance of producing a non-contiguous mask grows with N. If 10 wallets attempt to deposit but their on-chain ordering is shuffled by network latency, the resulting mask might be `0b1110111110` (8 bits set, gap at index 5). **This is the same NOVEL-CPI-01 stranding pattern but probability scales with N.** For 10-player tournaments, partial deposits are far more likely than for 2-player matches. The protocol's design assumes contiguous deposits but provides no mechanism to enforce that.

## Questions for Other Focus Areas

- **For Account Validation focus:** Does the `mut` constraint on `caller: Signer<'info>` (v1:722, v2:752) prevent the same pubkey from also appearing in `remaining_accounts` as a writable destination? If yes, NOVEL-CPI-02's simplest variant fails. If no, the exploit succeeds. **Critical question.**
- **For State Machine focus:** Is there any code path where `deposits_mask` could be set to a non-contiguous value (e.g., 0b101) via normal flow? If not, NOVEL-CPI-01's prerequisite is impossible in production... wait, normal flow is exactly: player N can deposit before player N-1 since deposit_wager doesn't enforce ordering. So `deposits_mask = 0b10` is achievable any time player[1] deposits and player[0] doesn't (e.g., player[0]'s TX failed for any reason). NOT-impossible, in fact LIKELY at scale.
- **For Token/Economic focus:** What's the worst-case theft under NOVEL-CPI-02 across the full universe of possible matches? At v2's max wager (100 SOL × 10 players = 1000 SOL pot), one malicious player can steal up to 900 SOL.
- **For Timing focus:** v2's `is_timed_out` logic (v2:471-489) uses `match_end_ts` if Active or `deposit_deadline` if AwaitingDeposits. Can a malicious player manipulate Clock drift or rent-trigger timing to enter the cancel-eligible window earlier? Probably not (1-2s drift, 600s timeout), but worth confirming.
- **For Error Handling focus:** What happens if `try_borrow_mut_lamports()` returns Err mid-loop (e.g., 2nd of 4 refunds fails)? Atomic TX revert per H029. The state revert is correct. But this means a malicious caller could force a partial-refund commitment by intentionally including a non-writable account at slot 1, causing the loop to fail at line 2... no, that would revert the entire instruction including the refund at slot 0. Safe.

## Raw Notes

### Per-File Pattern Counts

- `invoke()`: 0 occurrences in either file.
- `invoke_signed()`: 0 occurrences in either file.
- `CpiContext`: 1 in v1 (line 214), 1 in v2 (line 276).
- `system_program::transfer`: 1 call in v1 (213-222), 1 in v2 (275-284).
- `get_return_data`: 0.
- `Program<'info, System>`: appears in 6 account structs in v1 (InitializeConfig, CreateMatch, DepositWager, SettleMatch, CancelMatch, PermissionlessReclaim), 6 in v2.
- `Program<'info, Token>` or `InterfaceAccount<TokenAccount>`: 0. **No SPL Token CPI.**
- `Pyth` / `Switchboard` / oracle types: 0.
- `remaining_accounts`: 4 iteration sites (v1:393, v1:465, v2:502, v2:561).
- `try_borrow_mut_lamports`: 6 sites in v1 (lines 317, 318, 320, 321, 323, 324, 408, 409, 476, 477 — 10 total), 6 in v2 (lines 434, 435, 437, 438, 440, 441, 508, 509, 567, 568 — 10 total).
- `executable` / `is_executable` checks: **0 in both files. H009 is unmitigated.**
- `Pubkey::default()` reads: 6 in v2, 4 in v1 (zero-pad initialization + zero-address rejection in update_config).

### Anchor 0.32.1 Verification

Per project memory: "`.accounts({...})` ONLY pass signers + non-PDA accounts. Anchor auto-resolves anything with `pda` (constant seeds) or `address` declaration in the IDL."

Confirmed in client code:
- `server/services/escrow.js:452-454` (cancel_match): passes only `escrow` + `caller`. Auto-resolved: `config` (constant seed `b"config"`), `system_program` (fixed address). Correct.
- `server/services/escrow.js:497-500` (reclaim): passes only `escrow` + `caller`. Auto-resolved: `system_program`. Correct.
- `server/services/escrow-v2.js:344, 374`: same patterns.

No CPI-from-account-resolution-mismatch attack vector exists in the on-chain side. The off-chain side correctly applies the auto-resolution rule.

### Behavior Verification: try_borrow_mut_lamports on Executable Account

Per Feb H009 analysis (still open): the runtime behavior is uncertain between Behavior A (silent in-memory write, runtime discards at commit, escrow debit committed = lamport burn) and Behavior B (explicit error from borrow, atomic TX revert = DoS only). Anchor 0.32.1 + Solana 1.18.x should be tested to determine which applies.

**Devnet test recipe (recommended for Phase 4):**
1. Deploy v1 to devnet.
2. Initialize config with a fresh treasury wallet.
3. Create + deposit + activate a match.
4. Authority calls `update_config(new_treasury = Some(SystemProgram_ID))`.
5. Authority calls `settle_match(winner)`. Pass `treasury = SystemProgram_ID`.
6. Observe:
   - Did TX succeed? → Behavior A (lamport burn).
   - Did TX fail? → Behavior B (atomic revert / DoS).
7. Restore via second `update_config(new_treasury = Some(real_treasury))`.

If Behavior A is observed, H009 → CONFIRMED with HIGH severity. If Behavior B, H009 → DOWNGRADED to liveness DoS.

Either way, the recommended fix (`constraint = !treasury.executable`) is appropriate and trivial to add.

### Behavior Verification: `close = caller` Lamport Sweep Semantics

Per Anchor docs + source, `close = X` runs in the post-instruction exit handler:
1. Set account.lamports() = 0
2. Add account.lamports to X.lamports
3. Zero account data
4. Set owner to System Program

**Critical question for NOVEL-CPI-02:** Does Anchor's exit handler run after the loop completes? YES — it runs after the entire instruction body returns Ok. This means PDA lamports remaining post-loop ARE swept to caller.

**Therefore NOVEL-CPI-02 is mechanically possible UNLESS:**
- (a) Anchor's instruction-level account uniqueness check rejects `caller == remaining_accounts[i]` for the same pubkey;
- (b) The lamport debit on PDA in the loop somehow conflicts with the close handler's behavior;
- (c) Solana runtime's overlapping-mut-borrow check fires when same pubkey appears as both Signer (caller) and AccountInfo (remaining_accounts[0]).

Phase 4 should construct a runtime test:
- 2 players deposit (deposits_mask = 0b11).
- Player 0 calls `cancel_match` with `remaining_accounts = [player_0_pubkey]`.
- Verify: does player_0 receive 2 × wager + rent (theft confirmed) or does the TX fail (theft blocked)?

If the test shows theft, NOVEL-CPI-02 → CRITICAL. Mitigation: change `close = caller` to `close = first_remaining_account` is non-trivial; better to enforce loop-completes-all-deposits via `require!(remaining_accounts.len() == count_ones(deposits_mask) as usize)` BEFORE the loop, AND require the loop to walk EVERY set bit (not just the prefix).

### Recommended Fixes Summary

| ID | Severity | Fix | Effort |
|----|----------|-----|--------|
| H009 (executable check) | HIGH | Add `constraint = !treasury.executable` and `!ops.executable` | 1 line × 4 places |
| NOVEL-CPI-02 (rent-sweep theft) | HIGH if confirmed | Add `require!(remaining_accounts.len() == count_ones(deposits_mask) as usize)` before the loop in v1 cancel_match (391), v1 permissionless_reclaim (465), v2 cancel_match (501), v2 permissionless_reclaim (561). This ensures the loop processes EVERY deposited slot, leaving zero unrefunded wagers in the PDA when `close = caller` runs. | 1 line × 4 places |
| NOVEL-CPI-01 (non-contiguous mask) | HIGH | Combine fix above with: rewrite loop to walk `0..max_players` and look up `remaining_accounts` by an index-map. OR restructure escrow to use individual per-deposit PDAs that close independently. | Larger refactor |
| CPI-03 (lamport credit overflow) | MEDIUM | Convert all `+= amount` lamport credits to `checked_add` form with overflow propagation | 10 lines × 2 files |

End of analysis.
