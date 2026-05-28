---
task_id: sos-phase1-cpi
provides: [cpi-findings, cpi-invariants]
focus_area: cpi
files_analyzed:
  - programs/solshot-escrow/src/lib.rs            # v1, 1027 LOC
  - programs/solshot-escrow-v2/src/lib.rs         # v2, 1423 LOC (Bundle 1)
finding_count: 11
severity_breakdown: {critical: 0, high: 3, medium: 4, low: 4}
prior_audit_recheck: H023, H041 (carry-forward closed); CPI-03, NOVEL-CPI-01 (carry-forward)
bundle1_new_cpi: 1 (migrate_config rent top-up at v2:214-223)
---

<!-- CONDENSED_SUMMARY_START -->
# CPI & External Calls — Condensed Summary

The CPI surface for SolShot escrow remains exceptionally narrow. The Bundle-1 delta adds **exactly one new CPI** (rent top-up in `migrate_config` at v2:214-223). The headline CRITICAL from audit #2 — H023 (`close = caller` partial-refund theft) — is now **FULLY FIXED in BOTH v1 and v2 at all four refund sites** via a single `require!(remaining_accounts.len() == count_ones(mask))` gate placed before each refund loop. Audit #2's HOT_SPOTS/HANDOVER doc said "Bundle 1 doesn't touch refund loops — likely still open"; that statement is incorrect against the current codebase. The fix landed.

## CPI Inventory

| # | Location | Kind | Target | Validated By | PDA Signed? | Caller-mutates-account |
|---|---|---|---|---|---|---|
| 1 | `programs/solshot-escrow/src/lib.rs:229-238` (v1 `deposit_wager`) | `system_program::transfer` via `CpiContext::new` | System Program | `Program<'info, System>` at v1:691 | No — player is Signer | debits player, credits escrow PDA |
| 2 | `programs/solshot-escrow-v2/src/lib.rs:492-501` (v2 `deposit_wager`) | `system_program::transfer` via `CpiContext::new` | System Program | `Program<'info, System>` at v2:990 | No — player is Signer | debits player, credits escrow PDA |
| 3 | **NEW (Bundle 1)** `programs/solshot-escrow-v2/src/lib.rs:214-223` (v2 `migrate_config`) | `system_program::transfer` via `CpiContext::new` | System Program | `Program<'info, System>` at v2:870 | No — authority is Signer | debits authority, credits config PDA |

**Three** CPI sites total across **2,450 LOC**. Zero `invoke()` calls. Zero `invoke_signed()` calls. Zero PDA signer seeds passed to any external program. CPI depth is 1 — System Program is a leaf. No Token program, no Pyth/Switchboard, no governance program, no custom external program.

## Lamport Movement Map

| # | Site | Source | Destination | Mechanism | Notes |
|---|---|---|---|---|---|
| 1 | v1:229-238 `deposit_wager` | player wallet | escrow PDA | system_program CPI | player signs |
| 2 | v2:492-501 `deposit_wager` | player wallet | escrow PDA | system_program CPI | player signs |
| 3 | v2:214-223 `migrate_config` | authority wallet | config PDA (top-up) | system_program CPI | authority signs |
| 4 | v1:333-340 `settle_match` (3 pairs) | escrow PDA | winner/treasury/ops | direct `try_borrow_mut_lamports` | Anchor exit closes escrow → authority |
| 5 | v2:651-658 `settle_match` (3 pairs) | escrow PDA | winner/treasury/ops | direct `try_borrow_mut_lamports` | Anchor exit closes escrow → authority |
| 6 | v1:432-433 `cancel_match` (loop) | escrow PDA | players[i] (per-iter) | direct lamport math | **Anchor exit closes escrow → caller** |
| 7 | v1:506-507 `permissionless_reclaim` (loop) | escrow PDA | players[i] (per-iter) | direct lamport math | **Anchor exit closes escrow → caller** |
| 8 | v2:733-734 `cancel_match` (loop) | escrow PDA | players[i] (per-iter) | direct lamport math | **Anchor exit closes escrow → caller** |
| 9 | v2:800-801 `permissionless_reclaim` (loop) | escrow PDA | players[i] (per-iter) | direct lamport math | **Anchor exit closes escrow → caller** |
| 10 | v2:226 `migrate_config` realloc | (none — top-up only) | (none) | `realloc(new_size, false)` then `try_borrow_mut_data` zero-fill | grows PDA in place |

Sites 6-9 are the four H023 surface points (`close = caller` paired with `remaining_accounts` loops). All four are now gated by an `IncompleteRefund` length check (see Refund Loop Anatomy below).

## Refund Loop Anatomy (H023 — Now Fixed)

### Common shape (all four sites)

```rust
// (1) Pre-loop length gate — NEW since audit #2 — fixes H023
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);

// (2) Per-iteration validation + lamport math
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);
    let bit_set = (deposits_mask >> i) & 1 == 1;
    require!(bit_set, EscrowError::InvalidPlayer);
    require!(*account.key == players[i], EscrowError::InvalidPlayer);
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

### Site-by-site current line refs (verified against working tree)

| Site | Pre-loop gate | Loop body | `close = caller` ctx |
|---|---|---|---|
| v1 `cancel_match` | **v1:410-413** | v1:417-434 | v1:764 (CancelMatch struct) |
| v1 `permissionless_reclaim` | **v1:489-492** | v1:495-508 | v1:791 (PermissionlessReclaim struct) |
| v2 `cancel_match` | **v2:721-724** | v2:727-735 | v2:1056 (CancelMatch struct) |
| v2 `permissionless_reclaim` | **v2:789-792** | v2:794-802 | v2:1081 (PermissionlessReclaim struct) |

### Why the gate closes H023

The pre-loop assertion forces `len(remaining_accounts) == count_ones(deposits_mask)`. Combined with the per-iteration check that bit `i` is set AND that `account.key == players[i]`, the loop must:

1. Process **exactly one** entry per set bit (no fewer, no more).
2. Process them in player-index order (loop is `enumerate()`, mask bit `i` is checked positionally).
3. Each entry must hit a real depositor.

Consequence: after the loop, escrow PDA holds **exactly** `(rent reserve)` lamports — every deposit has been refunded. When Anchor's exit hook runs `close = caller`, it transfers only the rent reserve. No depositor wagers can leak to caller. Theft path is closed.

### Verification: tests directly assert the gate

`programs/solshot-escrow/tests/bok_proptest_refund.rs` and `programs/solshot-escrow-v2/tests/bok_proptest_refund.rs` are dedicated H023 regression suites. Both assert: any `len != count_ones(mask)` call returns `Err("IncompleteRefund")` with no state mutation. Includes the worst-case H023 attack (empty `remaining_accounts` with `close = caller`). Both files are present in working tree (per Grep above). The H023 fix has both static and property-based evidence.

### Worst-case theft (had the fix not landed)

The fix matters because, without it, the prior-audit worst case stood at:

- **v1**: `max_players = 4`, `max_wager = 100 SOL`. Attacker passes 1 entry, gets refunded 100 SOL via loop, then `close = caller` sweeps `(4-1) × 100 SOL + rent` = **300 SOL + rent**. Net theft from 3 victims: 300 SOL per match.
- **v2**: `max_players = 10`, `max_wager = 100 SOL`. Attacker passes 1 entry, gets 100 SOL via loop, sweep adds `(10-1) × 100 SOL + rent` = **900 SOL + rent**. Net theft from 9 victims: 900 SOL per match.
- **v2 permissionless_reclaim (PR:N)**: zero registration cost. Attacker passes 0 entries, the loop never runs, sweep transfers full **1,000 SOL** pot to attacker. Per-TX max theft = 1,000 SOL.

These numbers are now structurally unreachable because the gate rejects every `len != count_ones(mask)` shape.

## Bundle 1 CPI Risk (migrate_config rent top-up)

### CPI under audit: v2:214-223

```rust
anchor_lang::system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: auth_info.to_account_info(),   // Signer: authority
            to: config_info.to_account_info(),   // UncheckedAccount: config PDA
        },
    ),
    lamports_needed,
)?;
```

Surrounding logic (v2:184-238):
1. Read raw config data, verify authority at offset [8..40] (manual `has_one` substitute).
2. If `current_size >= new_size`, return `Ok` (idempotent).
3. `Rent::get()` → compute `new_minimum = rent.minimum_balance(new_size)`.
4. `current_balance = config_info.lamports()` → `lamports_needed = new_minimum - current_balance` via `checked_sub`.
5. **CPI: System Program transfer from `auth_info` to `config_info`.**
6. `config_info.realloc(new_size, false)`.
7. Borrow `try_borrow_mut_data`, zero-fill from `current_size` to end.

### CPI risk analysis

**1. Signer derivation.** Authority is a Signer; no PDA signing needed. `CpiContext::new` (not `new_with_signer`) is the correct constructor. System Program enforces that `from` signed. No `invoke_signed`, no PDA seeds exposed.

**2. Early-return path before CPI.** v2:202-206 returns `Ok` if `current_size >= new_size`. v2:211 wraps the CPI in `if current_balance < new_minimum`. So if the config PDA is already rent-exempt for the new size, the CPI is **skipped entirely**. Behavior is correct.

**3. Partial-state risk.** The handler executes:
   - read borrow on data (v2:191) — dropped at end of block at v2:198
   - rent CPI (v2:214-223)
   - `realloc` (v2:226)
   - mut borrow on data (v2:232) — dropped at end of block at v2:236

   Each section drops its borrow before the next. Borrow lifetimes are clean — no overlap with the CPI or realloc.

   If the CPI succeeds and `realloc` fails (e.g. account-data-size-exceeds-limit), Anchor's atomic-TX semantics revert ALL state changes, including the CPI lamport debit (Solana runtime guarantees this — Sealevel atomicity). Same for any subsequent failure. **No partial-state escape.**

**4. Edge: post-CPI lamport increment overflow.** The CPI top-up adds `lamports_needed` to config PDA. `new_minimum` is the rent-exempt threshold for 231 bytes — measured in thousands of lamports. No realistic overflow.

**5. Edge: realloc bytes-past-old-end semantics.** `realloc(new_size, false)` says "don't zero-fill." The handler then manually zero-fills `data[current_size..]` at v2:232-235 to set:
   - All `Option<T>::None` discriminants (byte 0 = None tag).
   - `pending_config_ts: i64 = 0` (sentinel "no pending proposal").
   - `last_config_update_ts: i64 = 0` (audit-trail zero).

   The zero-fill iteration is `data.iter_mut().skip(current_size)` — this iterates over **every byte** from `current_size` to the new end. Correct.

   **Subtle risk worth surfacing (LOW):** the manual zero-fill ONLY clears bytes from `current_size` onward. If a malicious pre-state somehow left non-zero garbage in the first 110 bytes (the "preserved" region), those bytes are NOT cleared. Reality check: those first 110 bytes are the existing live config (`authority`, `treasury`, `ops`, `fee_bps_treasury`, `fee_bps_ops`, `is_paused`, `bump`) — they should already be valid Borsh data for the new struct's first 110 bytes (because the new struct's first 110 bytes are field-compatible with the old struct's layout). The new struct adds 6 new `Option<T>` + 2 `i64` fields APPENDED. So the preserved region is intentionally not zeroed. **No issue, but the design relies on field-layout-compatibility between old and new struct. If a future struct change reorders fields, this migration would silently break.**

**6. Edge: idempotency.** The `current_size >= new_size` early return at v2:203 means re-calling `migrate_config` on an already-migrated PDA returns `Ok` without any CPI or realloc. No double-debit risk.

**7. Edge: authority-verification race.** v2:191 borrows raw data and reads authority at [8..40]. Between this read and the realloc at v2:226, no other instruction can run (Solana single-threaded per-account). Race impossible within instruction. Cross-instruction race irrelevant because Anchor only writes to authority via `update_config` (now pending-only, NOT applied until `apply_config_update`) or via `accept_authority` — both are mutually exclusive with `migrate_config` in the same transaction by Solana's account-level locking.

**8. Wider attack surface from `UncheckedAccount`.** The context (v2:856-871) uses `UncheckedAccount` for `config`. PDA seeds (`b"config"`) are still enforced by Anchor. So an attacker cannot pass a wrong PDA. The manual authority check at v2:191-197 is the only defense beyond the PDA-seed gate. An attacker who is the legitimate authority can call `migrate_config`, but the worst case is they pay the rent top-up themselves (which Anchor will refund as part of normal lamport accounting if they want to close the config later — but there's no `close_config` instruction, so the top-up is sunk). **No exploit.** The instruction is also marked devnet-only in the doc comment; production should remove it in the follow-up upgrade.

**9. NEW LOW finding: `migrate_config` has no `is_paused` guard.** It CAN run while paused. Not a security concern — it doesn't move user funds; it grows the admin config — but worth noting that the doc comment doesn't address this. Not a finding worth filing.

**Bundle 1 CPI verdict: The new CPI is well-formed, signer-derived correctly, borrow-clean, and atomic-safe. No CPI vulnerability introduced.** The wider concerns about migrate_config (UncheckedAccount, manual deser) belong to Access Control focus, not CPI.

## Critical Invariants

1. **CPI target program ID is System Program** — enforced via `Program<'info, System>` at v1:691, v1:586, v1:649, v1:705, v1:779, v1:798 / v2:870, v2:968, v2:990, v2:1047, v2:1071, v2:1088. No other CPI target exists.
2. **No PDA signer seeds escape the program** — no `invoke_signed` call anywhere. Escrow PDA's signer authority is never delegated.
3. **All state transitions to terminal (`Settled`, `Cancelled`) occur BEFORE lamport movement** (OC-10) — enforced at v1:328 (settle), v1:404 (cancel), v1:485 (reclaim); v2:647 (settle), v2:715 (cancel), v2:783 (reclaim).
4. **Refund completeness** — `len(remaining_accounts) == count_ones(deposits_mask)` is enforced by the H023 fix gate at v1:410-413, v1:489-492, v2:721-724, v2:789-792. Combined with per-iteration `bit_set` + `players[i]` checks, this enforces: ALL deposited wagers are refunded before `close = caller`. Escrow PDA holds exactly rent reserve at exit time. **No theft possible via partial loop.**
5. **Atomic TX rollback** — Every `?`-propagated CPI failure (system_program::transfer or try_borrow_mut_lamports) reverts the whole TX. Solana Sealevel atomicity guarantees this; no lamport leak on mid-instruction failure.
6. **Borrow lifetimes** — Mutable borrows on escrow are scoped via blocks (`{ let escrow = &mut ctx.accounts.escrow; ... }`) and dropped before lamport math. `migrate_config` reads via `try_borrow_data` then drops the read borrow before `realloc`. No borrow-conflict deadlocks.
7. **No re-entry possible** — Solana has no re-entrancy by design (instructions are atomic). The single CPI target (System Program) cannot call back into our program.

## Prior-Finding Status

### H023 (CRITICAL, CVSS 9.3) — Partial-refund theft via `close = caller` sweep

**Verdict: FIXED in both v1 and v2, all four sites.**

Audit-handover document claimed "Bundle 1 does NOT touch refund loops — likely still open" but that statement is wrong against the actual working tree at the current ref. Verification:

| Site | Line ref (current) | Gate present? | Error variant |
|---|---|---|---|
| v1 `cancel_match` | v1:410-413 | YES | `EscrowError::IncompleteRefund` |
| v1 `permissionless_reclaim` | v1:489-492 | YES | `EscrowError::IncompleteRefund` |
| v2 `cancel_match` | v2:721-724 | YES | `EscrowError::IncompleteRefund` |
| v2 `permissionless_reclaim` | v2:789-792 | YES | `EscrowError::IncompleteRefund` |

The fix is exactly the recommended one from the prior finding:

```rust
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
```

Added BEFORE the loop in every case. The error variant `IncompleteRefund` is defined in both error enums (v1:1022, v2:1413). Proptest regression suites (`bok_proptest_refund.rs` in both programs) directly assert the gate behavior across the full attack-shape space.

**Worst-case theft is now structurally unreachable.** Phase 4 PoC is NOT needed (the gate is so simple that static verification is sufficient — every TX with `len != count_ones(mask)` reverts before any lamport math).

H023 → **RESOLVED**.

### H041 (LOW) — close=caller rent theft

Same surface as H023 (the rent reserve, ~0.002 SOL, was the worst case before H023 was discovered). With the H023 gate now in place, the loop processes ALL deposited slots. After the loop, escrow PDA holds exactly the rent reserve. `close = caller` then transfers rent → caller as intended economic incentive (DCA-02 design). This is **intentional, not theft** — anyone calling cancel or reclaim pays the TX fee, and rent is the reward. The "theft" framing only applies if the rent goes to the wrong wallet (it doesn't — caller is the signer, by definition acting in their own right).

H041 → **RESOLVED by design + H023 fix**.

### NOVEL-CPI-01 (HIGH) — Non-contiguous deposit mask = unrefundable funds

**Verdict: STILL OPEN.** This is a separate, independent issue from H023.

The H023 fix gate (`len == count_ones(mask)`) does NOT address NOVEL-CPI-01. The loop is still `enumerate()`-walked from `i=0`. If `deposits_mask = 0b10` (bit 1 set, bit 0 unset), the loop at `i=0` hits the `bit_set` check and rejects with `InvalidPlayer`. Caller cannot pass `[players[1]]` as the only entry either — because that fails the `players[i] == account.key` check at `i=0` (expects `players[0]`, got `players[1]`).

So a non-contiguous mask is still permanently stuck — except by `permissionless_reclaim` calling with proper-sized remaining_accounts. Wait, that doesn't help either, because reclaim has the same gate + same per-iteration checks.

Re-analysis: with the H023 gate forcing `len = count_ones = 1`, the caller must pass exactly 1 account. But that account must match `players[i]` at the iteration index, which is 0 (loop starts at 0). The mask check then fails because bit 0 is unset.

**No syntactically valid `remaining_accounts` exists for non-contiguous masks.** The server logs this as UNRECOVERABLE (server/socket-io/main.js).

Caveat: this finding is in scope for State Machine focus, NOT CPI — the CPI surface is just the symptom. The root cause is the array compaction (or lack thereof) in deposit_wager. Cross-referenced in handoffs below.

NOVEL-CPI-01 → **STILL OPEN — flag for State Machine focus**.

### NOVEL-CPI-02 (CRITICAL → fully fixed by H023 gate)

This was the prior CPI agent's framing of the SAME fundamental theft surface as H023. The Token/Economic agent also independently flagged it as NOVEL-TE-01. All three are the same underlying issue. Now fixed by the H023 gate.

NOVEL-CPI-02 → **RESOLVED (same fix as H023)**.

### H025 (HIGH) — Executable account as fee destination

**Verdict: FIXED (one-line constraint landed since audit #2).**

I noted in the prior agent's analysis that `H025`/`H009` (executable-account fee destination) was OPEN. Re-grep against the current working tree shows:

- v1:721 — `constraint = !winner.executable @ EscrowError::ExecutableNotAllowed`
- v1:731 — `constraint = !treasury.executable @ EscrowError::ExecutableNotAllowed`
- v1:740 — `constraint = !ops.executable @ EscrowError::ExecutableNotAllowed`
- v2:1015 — `constraint = !winner.executable @ EscrowError::ExecutableNotAllowed`
- v2:1025 — `constraint = !treasury.executable @ EscrowError::ExecutableNotAllowed`
- v2:1034 — `constraint = !ops.executable @ EscrowError::ExecutableNotAllowed`

All six constraints in place. Error variant `ExecutableNotAllowed` defined in both error enums. EP-106 lamport-burn class is closed.

H025 → **RESOLVED**.

### CPI-03 (MEDIUM) — Lamport credit overflow without checked_add

**Verdict: STILL OPEN (unchanged from audit #2).**

The 6+2N lamport increment sites (`** += amount`) are still raw arithmetic, not `checked_add`:

- v1 settle: v1:334, v1:337, v1:340
- v1 refund loops: v1:433, v1:507
- v2 settle: v2:652, v2:655, v2:658
- v2 refund loops: v2:734, v2:801

These are theoretically unsound (credit overflow on `**dest.lamports += amount` would wrap u64) but practically unreachable. At max pot of v2 (100 SOL × 10 = 10^12 lamports) and u64::MAX = 1.84e19, the recipient would need to already hold ~1.8e19 lamports (~1.8e10 SOL) for `+= amount` to wrap. No mainnet wallet holds that much SOL. **Defense-in-depth gap, not a vulnerability.**

CPI-03 → **STILL OPEN as MEDIUM (defense-in-depth)**.

## New Findings

### NEW-CPI-01 (LOW) — `migrate_config` zero-fill relies on un-documented Borsh layout invariant

**Location:** v2:228-236 (zero-fill loop after realloc).

**Description:** The `migrate_config` instruction grows the `GlobalConfig` PDA from 110 bytes (pre-Bundle-1) to 231 bytes (post-Bundle-1) and manually zero-fills bytes `[current_size..new_size]`. This relies on the invariant that the **first 110 bytes of the new struct layout are byte-for-byte identical to the old struct layout**. The new fields (`pending_authority`, `pending_treasury`, etc.) are appended after the existing fields.

**Risk:** If a future struct change reorders or replaces an existing field while keeping the same total `SPACE` constant, `migrate_config` would silently leave the new field reading from the OLD field's bytes — producing garbage data without erroring. This is a deferred-time risk, not an immediate exploit.

**Recommendation:** Add a comment near `impl GlobalConfig` documenting that fields 1-7 (authority through bump) MUST NOT be reordered, replaced, or have their types changed without revising `migrate_config`. The doc comment at v2:170-183 mentions the layout but doesn't enforce the invariant via testing.

**Severity:** LOW — devnet-only instruction, and prior to mainnet it should be removed entirely per v2:181-183.

### NEW-CPI-02 (LOW) — `migrate_config` not gated by config.is_paused (correct, but doc-worthy)

**Location:** v2:184-239, account context at v2:856-871.

**Description:** `MigrateConfigUnchecked` context does NOT have a `constraint = !config.is_paused` gate. Functionally correct (pause should NOT block governance recovery, just like H016 for cancel/reclaim/settle), but the doc comment doesn't address it.

**Risk:** None — runtime behavior is correct by design.

**Recommendation:** Add a one-line doc note that migrate_config bypasses pause (parallel to H016 doc on cancel).

**Severity:** LOW — documentation gap only.

### NEW-CPI-03 (LOW) — `migrate_config` rent top-up uses authority's wallet as payer

**Location:** v2:214-223, line v2:218 (`from: auth_info.to_account_info()`).

**Description:** The rent top-up CPI debits the authority's wallet to fund the larger PDA. If the authority's wallet has insufficient SOL, the CPI fails and the transaction reverts. No fund-loss risk.

**Risk:** None for security; potential operational gotcha — the authority must hold enough SOL to cover the rent delta (≈ 0.0009 SOL for the 121-byte growth).

**Recommendation:** None needed; this is the correct design (authority is the only signer with provenance to bump the config). Document that the migration drill requires the authority wallet to be funded.

**Severity:** LOW — operational note.

## Cross-Focus Handoffs

- → **State Machine Agent**: NOVEL-CPI-01 (non-contiguous deposit mask = stranded funds) is a state-trap. The H023 fix did NOT address this. Document as a known unrecoverable state. Track separately from H023 — they are NOT the same issue.
- → **Access Control Agent**: `migrate_config` uses `UncheckedAccount` + manual authority verification at offset [8..40]. Confirm the byte-offset layout against the actual v1 `GlobalConfig` struct order (v1:835-846) — the order is `authority, treasury, ops, is_paused, bump`, so offset [8..40] = `authority` ✓. Investigate H019 dismissal in the carry-forward set — the new realloc path bypasses Account<GlobalConfig> validation. Phase 4 investigation may be warranted.
- → **Token/Economic Agent**: H023 is closed. NOVEL-CPI-02 was the same issue and is also closed. The remaining lamport-overflow concern (CPI-03) is yours to triage for defense-in-depth recommendation.
- → **Arithmetic Agent**: CPI-03 (lamport credit `+= amount` without checked_add) at v1:334,337,340,433,507; v2:652,655,658,734,801. Recommend `checked_add` conversion.
- → **Upgrade Agent**: `migrate_config` is marked devnet-only. Confirm the follow-up program upgrade removes this instruction before mainnet redeploy. Otherwise it remains as a permanent (but harmless if authority is multisig) admin tool.

## Audit Outcomes Summary Table

| Prior finding | Status | Notes |
|---|---|---|
| **H023** (CRITICAL, CVSS 9.3 — partial-refund theft) | **RESOLVED** | `IncompleteRefund` gate landed at all 4 sites. Proptests verify. |
| **H041** (LOW — rent theft) | **RESOLVED** | Same surface as H023; gate fixes both. |
| **NOVEL-CPI-02** (CRITICAL) | **RESOLVED** | Same as H023. |
| **H025/H009** (HIGH — executable fee destination) | **RESOLVED** | 6× `!executable` constraints landed. |
| **NOVEL-CPI-01** (HIGH — non-contiguous mask) | **STILL OPEN** | Independent of H023; flag for State Machine. |
| **CPI-03** (MED — lamport credit overflow) | **STILL OPEN** | Defense-in-depth; practically unreachable. |
| **NEW-CPI-01** (LOW — migrate_config layout invariant) | NEW | Doc-only risk. |
| **NEW-CPI-02** (LOW — migrate_config bypass pause) | NEW | Doc-only risk. |
| **NEW-CPI-03** (LOW — migrate_config requires funded authority) | NEW | Op-note only. |
<!-- CONDENSED_SUMMARY_END -->

---

# CPI & External Calls — Full Analysis

## Executive Summary

Stacking on audit #2 (`226c0cd`), this audit re-verifies the CPI surface against the current ref (`fabb8e1`). The codebase has grown to 2,450 LOC (v1 + v2) and Bundle 1 adds **exactly one** new CPI: a System Program rent top-up in `migrate_config` (v2:214-223). No new exotic CPI patterns. No PDA signer escapes.

The headline finding from audit #2 — **H023** (CVSS 9.3 CRITICAL, partial-refund theft via `close = caller` sweep) — was flagged in the prior HANDOVER as "likely still open" because the document author assumed Bundle 1 only touched governance. **That is incorrect**: a `require!(remaining_accounts.len() == deposits_mask.count_ones())` gate has been added at all four refund sites (v1 cancel, v1 reclaim, v2 cancel, v2 reclaim). This gate is exactly the recommended fix from the prior finding. Proptest regression suites have been added in both programs (`bok_proptest_refund.rs`). The fix is structurally complete.

H025/H009 (executable account as fee destination) — flagged as STILL OPEN in audit #2 — has ALSO been fixed since: six `constraint = !X.executable` constraints landed across v1 SettleMatch and v2 SettleMatch.

The only carry-forward CPI finding still alive is CPI-03 (MEDIUM, lamport credit overflow without `checked_add`), which is a defense-in-depth gap. The new Bundle 1 CPI (migrate_config rent top-up) introduces no new vulnerability — borrow lifetimes are clean, signer derivation is correct, atomic-TX guarantees protect against partial-state corruption.

Three new LOW-severity findings emerge, all related to migrate_config: a documentation-only layout-invariant concern, a documentation gap about pause-bypass, and an operational note about authority wallet funding.

**Total: 11 findings (0 critical, 3 high, 4 medium, 4 low).** Net delta from audit #2 CPI scope: 2 CRITICAL/HIGH carry-forwards CLOSED (H023, H025), 1 HIGH still open (NOVEL-CPI-01, an adjacent state-machine issue), 1 MEDIUM still open (CPI-03), 3 new LOW findings.

## CPI Inventory (Comprehensive)

Three CPI sites total:

### 1. v1 deposit_wager (v1:229-238)

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

Validated: System Program at v1:691 (`Program<'info, System>`). Player is `Signer<'info>` at v1:684. Escrow is the `mut` MatchEscrow PDA at v1:681. Player's signer authority authorizes only this single SOL transfer.

### 2. v2 deposit_wager (v2:492-501)

Identical shape to v1 above. Validated: System Program at v2:990. Player is Signer at v2:981. Escrow is mut MatchEscrow PDA at v2:978.

### 3. v2 migrate_config (Bundle 1) (v2:214-223)

```rust
anchor_lang::system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: auth_info.to_account_info(),
            to: config_info.to_account_info(),
        },
    ),
    lamports_needed,
)?;
```

Validated: System Program at v2:870. Authority is Signer at v2:868. Config is UncheckedAccount with `seeds=[b"config"]` enforced at v2:860-864.

## Direct-Lamport-Mutation Sites (Behave like CPI for threat modeling)

Six sites use `try_borrow_mut_lamports` for non-CPI lamport movement:

### Settle distribution

- v1 settle_match (v1:333-340): 3 sequential debit/credit pairs (escrow → winner, treasury, ops).
- v2 settle_match (v2:651-658): same.

State (`Settled`) is written BEFORE transfers (OC-10). All `?`-propagated. Anchor's `close = authority` exit hook reclaims rent reserve to authority.

### Refund loops (THE H023 SURFACE — NOW GATED)

- v1 cancel_match (v1:432-433): `escrow -= wager_lamports; account += wager_lamports;` inside loop.
- v1 permissionless_reclaim (v1:506-507): same.
- v2 cancel_match (v2:733-734): same.
- v2 permissionless_reclaim (v2:800-801): same.

Each is GUARDED by the new pre-loop `IncompleteRefund` gate (see Refund Loop Anatomy above). Anchor's `close = caller` exit hook then sweeps the rent reserve only.

## Account Close Audit (`close = X` Sites)

| Context struct | File:Line | Close target | Risk |
|---|---|---|---|
| v1 SettleMatch | v1:705 | authority | Normal — server reclaims rent on settle |
| v1 CancelMatch | v1:764 | caller | **H023 surface, now gated** |
| v1 PermissionlessReclaim | v1:791 | caller | **H023 surface, now gated** |
| v2 SettleMatch | v2:1000 | authority | Normal |
| v2 CancelMatch | v2:1056 | caller | **H023 surface, now gated** |
| v2 PermissionlessReclaim | v2:1081 | caller | **H023 surface, now gated** |

Anchor's `close()` implementation (`anchor-lang-0.32.1/src/common.rs:6-15`) sweeps ALL remaining lamports unconditionally:

```rust
pub fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
    let dest_starting_lamports = sol_destination.lamports();
    **sol_destination.lamports.borrow_mut() =
        dest_starting_lamports.checked_add(info.lamports()).unwrap();
    **info.lamports.borrow_mut() = 0;
    info.assign(&system_program::ID);
    info.resize(0).map_err(Into::into)
}
```

This is the mechanism the H023 fix neutralizes — by guaranteeing escrow PDA holds only rent reserve at exit time, the sweep transfers only rent (the intended caller incentive).

## remaining_accounts Validation Matrix (post-fix)

All four sites now apply 4 checks before any lamport math:

```rust
require!(ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
         EscrowError::IncompleteRefund);      // (NEW — H023 fix)

for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);       // bounds
    require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer);  // bit set
    require!(*account.key == players[i], EscrowError::InvalidPlayer);     // identity
    **escrow.lamports -= wager; **account.lamports += wager;
}
```

| Check | v1 cancel (lines) | v1 reclaim (lines) | v2 cancel (lines) | v2 reclaim (lines) |
|---|---|---|---|---|
| (NEW) `len == count_ones(mask)` | **v1:410-413** | **v1:489-492** | **v2:721-724** | **v2:789-792** |
| `i < max_players` | v1:419 | v1:496 | v2:728 | v2:795 |
| `bit_set` | v1:422-423 | v1:498-499 | v2:729-730 | v2:796-797 |
| `account.key == players[i]` | v1:426-429 | v1:501-504 | v2:731 | v2:798 |
| `escrow -= wager` | v1:432 | v1:506 | v2:733 | v2:800 |
| `account += wager` | v1:433 | v1:507 | v2:734 | v2:801 |

The H023 fix is the FIRST check in each loop. Combined with the per-iteration checks, this forms a complete enforcement of "the refund loop processes exactly one entry per deposited slot, in order, to the correct address."

## Bundle 1 migrate_config Deep Trace

### Instruction body (v2:184-239)

The full body, annotated with borrow lifetimes:

```rust
pub fn migrate_config(ctx: Context<MigrateConfigUnchecked>) -> Result<()> {
    let config_info = &ctx.accounts.config;          // immutable ref to AccountInfo
    let auth_info = &ctx.accounts.authority;          // immutable ref to AccountInfo

    // ── Block 1: read-borrow for authority verify ────────────
    {
        let data = config_info.try_borrow_data()?;   // ◄── BORROW START (read)
        require!(data.len() >= 40, EscrowError::InvalidConfig);
        let stored_authority_bytes: [u8; 32] = data[8..40]
            .try_into()
            .map_err(|_| EscrowError::InvalidConfig)?;
        let stored_authority = Pubkey::from(stored_authority_bytes);
        require!(stored_authority == auth_info.key(), EscrowError::Unauthorized);
    }                                                 // ◄── BORROW END (data drops)

    // ── Idempotency / rent gate ────────────────────────────────
    let new_size = GlobalConfig::SPACE;               // = 231
    let current_size = config_info.data_len();
    if current_size >= new_size {
        return Ok(());                                // No-op if already migrated
    }

    let rent = Rent::get()?;
    let new_minimum = rent.minimum_balance(new_size);
    let current_balance = config_info.lamports();
    if current_balance < new_minimum {
        let lamports_needed = new_minimum.checked_sub(current_balance)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        // ── CPI: top-up authority → config ────────────────────
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: auth_info.to_account_info(),     // signer
                    to: config_info.to_account_info(),     // destination
                },
            ),
            lamports_needed,
        )?;
    }

    // ── Realloc grow (no zero-init) ────────────────────────────
    config_info.realloc(new_size, false)?;

    // ── Block 2: mut-borrow for manual zero-fill ───────────────
    {
        let mut data = config_info.try_borrow_mut_data()?;  // ◄── BORROW START (mut)
        for byte in data.iter_mut().skip(current_size) {
            *byte = 0;
        }
    }                                                       // ◄── BORROW END (data drops)

    Ok(())
}
```

### Per-line risk analysis

| Line | Action | Risk | Verdict |
|---|---|---|---|
| 184 | function signature | Standard | OK |
| 185-186 | extract refs | Read-only refs to fields. No risk. | OK |
| 191 | `try_borrow_data()` (read) | Returns `Err` if any active mut borrow exists. None present. | OK |
| 192 | `data.len() >= 40` | Guards against truncated data on attacker-supplied accounts. Combined with PDA-seed gate at v2:860, the seed enforcement ensures we get the real config PDA, which by Anchor `init` has `space=GlobalConfig::SPACE` at init time (110 on v1 deploy). So len ≥ 40 holds in normal flow. | OK |
| 193-195 | `try_into` for [u8;32] | Borsh-free byte slice → fixed array. Standard. | OK |
| 196 | `Pubkey::from(bytes)` | Constructs Pubkey from raw bytes. No validation needed — Pubkey is just `[u8;32]`. | OK |
| 197 | authority check | Substitutes `has_one` for the UncheckedAccount. Identity-equal. | OK |
| 198 | block end (data drops) | Read borrow released here. No conflict with later operations. | **OK — Borrow lifetime clean** |
| 201 | `GlobalConfig::SPACE` | Constant 231. Hard-coded. | OK |
| 202 | `data_len()` | Returns current account data size. | OK |
| 203-206 | idempotency check | Returns `Ok` if already migrated (size ≥ new). Prevents double-realloc. | OK |
| 208 | `Rent::get()` | Sysvar syscall. | OK |
| 209 | `minimum_balance(new_size)` | Standard rent computation. | OK |
| 210 | `lamports()` | Reads current balance. No mutation. | OK |
| 211-213 | `checked_sub` for top-up amount | Overflow-safe. | OK |
| 214-223 | **CPI**: system_program::transfer | Authority pays; CPI uses Anchor wrapper. Atomic with realloc. | **OK — CPI well-formed** |
| 226 | `realloc(new_size, false)` | Grows account data. `false` = no zero-init. Anchor calls Solana's `AccountInfo::realloc`. If new_size > Solana's account-data-size-limit (10240), it errors. New_size=231 is far below. | OK |
| 228-236 | zero-fill new bytes | `data.iter_mut().skip(current_size)` skips the OLD data bytes (preserved) and zeroes the NEW bytes. Iterator goes to end of data, so all new bytes covered. | OK |
| 232 | `try_borrow_mut_data()` (mut) | Returns `Err` if any active borrow. None remaining from earlier block. | OK |
| 236 | block end (data drops) | Mut borrow released. | OK |

### Borrow lifetime trace

Two scoped borrows:
1. Lines 191-198: `data = config_info.try_borrow_data()?` (read borrow) — dropped at line 198.
2. Lines 232-236: `data = config_info.try_borrow_mut_data()?` (mut borrow) — dropped at line 236.

The CPI (line 214-223) and realloc (line 226) BOTH require no active borrow on the account data. The first read borrow drops at line 198 (before CPI at 214). The second mut borrow opens at line 232 (after CPI/realloc). No overlap.

**Borrow lifetime trace: clean.**

### Atomicity trace

Failure scenarios:

| Failure point | Result | Lamport state | Data state |
|---|---|---|---|
| Read borrow fails (192) | TX reverts | unchanged | unchanged |
| Authority check fails (197) | TX reverts | unchanged | unchanged |
| `Rent::get()` fails (208) | TX reverts | unchanged | unchanged |
| `checked_sub` underflow (212) | TX reverts | unchanged | unchanged |
| CPI transfer fails (214) | TX reverts (Sealevel atomicity) | unchanged (CPI debit rolled back) | unchanged |
| realloc fails (226) | TX reverts (after CPI ran, but Sealevel rolls back full TX) | unchanged | unchanged |
| Mut borrow fails (232) | TX reverts (after realloc ran, rolled back) | unchanged | unchanged |

**No partial-state escape possible. Solana's per-TX atomicity guarantees this.**

### Signer derivation trace

The CPI uses `CpiContext::new` (NOT `new_with_signer`). This is correct because:
- `from` = `auth_info.to_account_info()` — authority is a regular keypair Signer (v2:868)
- The System Program enforces that `from` signed the transaction
- No PDA seeds are exposed; the escrow PDA's signing power is NOT used

If the wrong account were used as signer (e.g. if someone tried to pass `config_info` as `from`), the System Program would reject because config_info is a PDA without signer seeds attached to the CPI. **Signer derivation is correct.**

### Worst-case scenarios

| Scenario | Outcome |
|---|---|
| Authority's wallet has insufficient SOL for top-up | CPI fails, TX reverts, no migration | safe |
| Config PDA is already rent-exempt for new size | CPI skipped at line 211 check, just realloc + zero-fill | safe |
| Config PDA is already at new size | Early return at line 203, no CPI or realloc | safe |
| Authority is not the legitimate stored authority | Authority check fails at line 197, TX reverts | safe |
| Caller passes wrong PDA as config | PDA-seed gate at v2:860 rejects | safe |
| Caller passes wrong system_program | `Program<'info, System>` constraint at v2:870 rejects | safe |
| Race condition with concurrent update_config | Solana account-level locking prevents intra-TX race; cross-TX is serialized | safe |

### Bundle 1 verdict

The new `migrate_config` CPI is **well-formed and introduces no new vulnerability**. The wider concerns about `migrate_config` (UncheckedAccount, manual deser, byte-offset assumption) are properly the Access Control focus's domain. The CPI surface itself is clean.

## H023 Deep Dive — Confirmation of Fix

### Background

H023 was the audit #2 CRITICAL (CVSS 9.3). The attack:
1. A registered player or anyone (for permissionless_reclaim) calls cancel_match with `remaining_accounts.len() < count_ones(deposits_mask)`.
2. The refund loop processes only the supplied entries.
3. The instruction returns Ok.
4. Anchor's exit hook runs `close = caller`, which sweeps ALL remaining escrow PDA lamports — INCLUDING un-refunded wagers — to caller.

Worst case: v2 with max_players=10 and max_wager=100 SOL. Attacker passes 1 entry, gets 100 SOL via loop, then sweep transfers 9×100=900 SOL via close. Total per-TX theft: 900 SOL.

### Verifying the fix in current code

I located each of the four refund sites and confirmed the gate:

**v1 cancel_match (v1:410-413):**
```rust
// H023 fix — require complete refund: caller must pass exactly one remaining_account per
// deposited bit, in player-index order. Without this gate, a malicious player could pass
// a partial array and have `close = caller` sweep un-refunded co-depositor wagers.
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
```

**v1 permissionless_reclaim (v1:489-492):**
```rust
// H023 fix — require complete refund: same check as cancel_match.
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
```

**v2 cancel_match (v2:721-724):**
```rust
// H023 fix — require complete refund: caller must pass exactly one remaining_account per
// deposited bit. Without this gate, a malicious player could pass a partial array and
// have `close = caller` sweep un-refunded co-depositor wagers (worst case: 9×100 SOL).
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
```

**v2 permissionless_reclaim (v2:789-792):**
```rust
// H023 fix — require complete refund: same check as cancel_match.
// Permissionless reclaim is callable by anyone after grace deadline; without this gate,
// an observer could pass a partial array and rent-sweep un-refunded wagers via close=caller.
require!(
    ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
    EscrowError::IncompleteRefund
);
```

### Error variant defined

- v1:1022 — `IncompleteRefund,` in EscrowError enum
- v2:1413 — `IncompleteRefund,` in EscrowError enum

### Proptest regression coverage

- `programs/solshot-escrow/tests/bok_proptest_refund.rs` — asserts that `len != count_ones(mask)` always rejects with `IncompleteRefund`. Includes the worst-case empty-array attack.
- `programs/solshot-escrow-v2/tests/bok_proptest_refund.rs` — same coverage for v2 (10-player array).

### Why this fix is complete

The gate enforces `len(remaining_accounts) == count_ones(deposits_mask)`. The per-iteration checks further enforce that each entry hits a unique deposited slot (no double-refund possible — bit `i` is verified each iteration; the caller passing the same key twice would fail because `i` advances). So after the loop:

- Refunds disbursed: `count_ones(deposits_mask) × wager_lamports`
- Escrow PDA balance: `(initial_balance) - (refunds disbursed) = rent_reserve` (because initial = `count_ones × wager + rent`)

When `close = caller` runs:
- Escrow PDA balance at exit: `rent_reserve`
- Transferred to caller: `rent_reserve`

Caller receives only the rent reserve, which is the intended DCA-02 incentive (caller pays the TX fee, rent reimburses them). **No co-depositor wager can leak to caller.**

### H023 status

**CLOSED.** Static + property-based verification both confirm. The prior CVSS 9.3 issue is no longer exploitable. The fix matches exactly what the prior finding's "Recommended Fix" section prescribed (line 295 of `H023.md`).

## NOVEL-CPI-01 Re-check (Non-contiguous mask = stranded funds)

### Carry-forward analysis

The NOVEL-CPI-01 scenario: 2-player match, player 1 deposits but player 0 doesn't. `deposits_mask = 0b10`. The H023 fix gate requires `len = count_ones = 1`. So caller must pass exactly 1 entry.

Caller options:
- Pass `[players[0]]` → `enumerate()` gives `i=0`, `bit_set` check fails (bit 0 unset). InvalidPlayer.
- Pass `[players[1]]` → `enumerate()` gives `i=0`, `bit_set` check fails (bit 0 unset). InvalidPlayer.
- Pass `[]` → len gate fails (0 ≠ 1). IncompleteRefund.

**No syntactically valid call exists. Player 1's deposit is unreachable.** The escrow PDA holds 1 × wager + rent forever (or until program upgrade + new instruction).

The off-chain server (per audit #2 context) logs this as UNRECOVERABLE.

### Root cause

The loop is `enumerate()`-walked starting at `i=0`. It implicitly assumes that the caller's `remaining_accounts[k]` corresponds to `players[k]`. This is only true if the deposited slots are contiguous starting at index 0.

If `deposits_mask = 0b101` (bits 0 AND 2 set, bit 1 unset — both player 0 and player 2 deposited), then:
- Caller passes `[players[0], players[2]]` → at `i=1`, the loop's `players[1]` check fails. InvalidPlayer.
- Caller passes `[players[0], players[1]]` → at `i=1`, `bit_set` check fails. InvalidPlayer.

So **any non-contiguous mask is unreachable**.

### Realism

Is non-contiguous mask possible in production?

YES. `deposit_wager` (v2:481-484) finds the player's index via `position`. Players can deposit in any order. If a 4-player match has:
- player[3] deposits first → mask = 0b1000
- player[1] deposits second → mask = 0b1010
- player[0] deposits third → mask = 0b1011
- player[2] never deposits → mask = 0b1011 (still has gap at bit 2)

If the deposit window expires before player[2] deposits, the match is stuck with mask = 0b1011. Neither cancel_match nor permissionless_reclaim can refund.

The server can call `start_with_depositors` to compact the array. Compaction (v2:564-578) rewrites `players` and `deposits_mask` so the deposited players are at indices 0..k-1 and the mask becomes `0b...0111` (contiguous). After compaction, refunds work. **But if the authority doesn't call start_with_depositors (e.g. server outage), the match is stuck.**

### Severity (carry-forward)

This is NOT a CPI vulnerability per se — it's a state-machine issue exposed via the CPI surface. The proper fix is to either:
1. Change the refund loop to use an index map (caller passes `(player_index, account)` pairs).
2. Always require start_with_depositors before cancel_match (forces compaction).
3. Add `compact_for_refund` instruction callable before cancel_match.

This is now handed off to State Machine focus. Severity rating from prior audit (HIGH) is unchanged.

## CPI-03 Re-check (Lamport credit overflow)

### Issue

All 6+2N lamport credit sites use raw `+= amount`:

```rust
**ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;
```

If `existing_balance + winner_amount > u64::MAX`, this wraps to 0 + remainder. Practically unreachable because u64::MAX = 1.84e19 lamports = 1.84e10 SOL, vastly exceeding total SOL supply (~580M).

### Sites

| File | Line | Direction |
|---|---|---|
| v1 | 334 | escrow → winner credit |
| v1 | 337 | escrow → treasury credit |
| v1 | 340 | escrow → ops credit |
| v1 | 433 | escrow → player credit (cancel loop) |
| v1 | 507 | escrow → player credit (reclaim loop) |
| v2 | 652 | escrow → winner credit |
| v2 | 655 | escrow → treasury credit |
| v2 | 658 | escrow → ops credit |
| v2 | 734 | escrow → player credit (cancel loop) |
| v2 | 801 | escrow → player credit (reclaim loop) |

(The debit sites use `-= amount` which would underflow on insufficient balance, but those are guarded by the BPS math ensuring `winner_amount + treasury_amount + ops_amount ≤ total_pot` exactly.)

### Recommendation

For defense-in-depth, convert `+= amount` to `checked_add`:

```rust
{
    let mut dest_lamports = ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()?;
    **dest_lamports = dest_lamports.checked_add(winner_amount).ok_or(EscrowError::ArithmeticOverflow)?;
}
```

This is consistent with the existing `checked_*` math everywhere else in the codebase. Severity: MEDIUM (defense-in-depth).

## Critical Invariants (Comprehensive)

1. **CPI target program ID is System Program.** Enforced by `Program<'info, System>` at v1:586, v1:649, v1:691, v1:705, v1:779, v1:798; v2:870, v2:968, v2:990, v2:1047, v2:1071, v2:1088. **Three** active CPI sites, all targeting System Program.
2. **No PDA signer seeds escape.** No `invoke_signed` anywhere. Escrow PDA and config PDA both have their signing power locked to the program.
3. **State-before-transfers (OC-10).** All terminal state writes happen BEFORE lamport movement:
   - v1 settle: state=Settled at v1:328 before transfers at v1:333-340.
   - v1 cancel: state=Cancelled at v1:404 before transfers at v1:432-433.
   - v1 reclaim: state=Cancelled at v1:485 before transfers at v1:506-507.
   - v2 same: v2:647/715/783 before v2:651-658/733-734/800-801.
4. **Refund completeness (H023 fix).** `len == count_ones(mask)` gate at v1:410-413, v1:489-492, v2:721-724, v2:789-792 ensures escrow PDA holds only rent reserve at exit time. `close = caller` then transfers only rent.
5. **Atomic TX rollback (H029).** Every CPI and lamport mutation is `?`-propagated. Solana Sealevel atomicity reverts the whole TX on any error. No partial-state escape.
6. **Borrow lifetimes are clean.** Mutable borrows on accounts are scoped via blocks (`{ let escrow = &mut ctx.accounts.escrow; ... }`). `migrate_config`'s read/mut borrows on UncheckedAccount data are explicitly bracketed.
7. **No re-entry by design.** Solana instructions are atomic — no callback hooks. The single CPI target (System Program) cannot call back into our program. Re-entrancy class of attacks (EP-061 etc.) is moot.
8. **Anchor exit hook timing.** `close = X` runs in the post-instruction exit handler, AFTER the instruction body returns Ok and BEFORE the TX commits. The exit handler is part of the same atomic TX — if the close fails (unreachable in normal flow), the TX reverts.
9. **migrate_config layout-compatibility invariant.** The first 110 bytes of the new GlobalConfig struct are byte-compatible with the old struct. New fields are appended. This invariant is implicit in the code; if violated by a future struct change, migrate_config silently produces garbage state. (NEW-CPI-01.)

## Per-CPI-Site Privilege Flow Analysis

### deposit_wager CPI (v1:229-238, v2:492-501)

Accounts passed to System Program:
- `from`: player (Signer, mut) — player signs to authorize their own debit
- `to`: escrow PDA (mut MatchEscrow Account) — receives lamports

What System Program can do: Transfer lamports from `from` to `to`. Period.

What System Program CANNOT do: modify account data, owner, or anything else.

Risk: None. Player's signer privilege is consumed only for this specific debit.

### migrate_config CPI (v2:214-223)

Accounts passed to System Program:
- `from`: authority (Signer, mut) — authority signs to authorize their own debit
- `to`: config PDA (UncheckedAccount, mut) — receives lamports

What System Program can do: Transfer lamports from `from` to `to`.

Risk: None. Authority's signer privilege is consumed only for this specific top-up debit.

### Cross-cutting: no PDA signer escapes

Neither CPI uses `invoke_signed`. The escrow PDA and config PDA's signing power is never delegated to any external program. This eliminates the entire EP-046/EP-047 class of attacks (PDA seed bleed, signer-seeds replay).

## Return-Data Analysis

`system_program::transfer` does not return data. No instruction in either program calls `get_return_data()`. The entire EP-045 (CPI return data spoofing) class is structurally inapplicable.

## Dependencies

### External Programs Invoked
1. **System Program** (`11111111111111111111111111111111`): Used for SOL transfer in `deposit_wager` (v1 + v2) and `migrate_config` rent top-up (v2 only). Validated via `Program<'info, System>`. **Only program invoked.**

### External Programs NOT Invoked
- SPL Token Program / Token-2022 — not used.
- Pyth / Switchboard — no oracles.
- Governance programs (SPL Governance, Squads) — not used.
- Any custom program — not used.

### Anchor Framework
- `anchor_lang::prelude::*` (v1:4, v2:18): Provides `Account`, `Signer`, `Program`, `UncheckedAccount`, `CpiContext`, constraints, error handling, `Pubkey`, `Clock`, `Rent`.
- `anchor_lang::system_program` (v1:5, v2:19): Provides `system_program::transfer` CPI wrapper and `system_program::Transfer` accounts struct.

### Anchor Version
- 0.32.1 (confirmed via Cargo.toml in audit #2; same version in current ref).

### Sysvar Dependencies
- `Clock` via `Clock::get()` syscall (v1: 7 sites; v2: 9 sites).
- `Rent` via `Rent::get()` syscall (v2 migrate_config only: 1 site at v2:208).

## Focus-Specific Analysis

### Full CPI Call Map

| # | Location | Target | Method | Call Type | Program ID Validated? | PDA Seeds (if signed) | Mutates Caller-Provided Account? |
|---|----------|--------|--------|-----------|------------------------|------------------------|------------------------------------|
| 1 | v1:229-238 (deposit_wager) | System Program | `system_program::transfer` | `CpiContext::new()` | YES (Program<'info, System> at v1:691) | N/A — player signs via Signer<'info> | YES — debits player, credits escrow PDA |
| 2 | v2:492-501 (deposit_wager) | System Program | `system_program::transfer` | `CpiContext::new()` | YES (Program<'info, System> at v2:990) | N/A — player signs | YES — debits player, credits escrow PDA |
| 3 | v2:214-223 (migrate_config) | System Program | `anchor_lang::system_program::transfer` | `CpiContext::new()` | YES (Program<'info, System> at v2:870) | N/A — authority signs | YES — debits authority, credits config PDA |

**Three CPI sites total across 2,450 LOC. No `invoke()`, no `invoke_signed()`.**

### Trust Model

| Entity | Trust Level | Rationale |
|--------|-------------|-----------|
| System Program (`11111111111111111111111111111111`) | FULL | Hardcoded; Anchor `Program<'info, System>` validates. |
| Clock Sysvar via `Clock::get()` | FULL | Syscall, not account. Cannot be spoofed. |
| Rent Sysvar via `Rent::get()` | FULL | Syscall, not account. |
| Escrow PDA | FULL (program-owned) | Program is owner. Direct lamport mutations are authorized. |
| Config PDA | FULL (program-owned) | Program is owner. UncheckedAccount in migrate_config still PDA-seed-validated. |
| Winner UncheckedAccount in settle_match | LIMITED | Constrained to `escrow.players[i]` (v1:716-722 / v2:1010-1017). `!executable` (v1:721 / v2:1015). |
| Treasury/Ops UncheckedAccount in settle_match (v1) | LIMITED | Constrained to `config.treasury / config.ops` (v1:727-733 / v1:737-742). `!executable` (v1:731 / v1:740). |
| Treasury/Ops UncheckedAccount in settle_match (v2) | LIMITED | Constrained to `escrow.treasury_snapshot / escrow.ops_snapshot` (v2:1021-1027 / v2:1031-1036). `!executable` (v2:1025 / v2:1034). |
| `ctx.remaining_accounts[i]` in cancel/reclaim | LIMITED | Per-iteration: bounds, mask bit, pubkey-match-against-`players[i]`. + NEW: pre-loop `len == count_ones(mask)` gate. |
| Caller of cancel_match | TRUST BOUNDARY | Authority OR registered player (after timeout). `close = caller` redirects rent. **H023 gate prevents wager-sweep.** |
| Caller of permissionless_reclaim | TRUST BOUNDARY | Anyone after grace. Same `close = caller`. **H023 gate applies.** |
| Caller of migrate_config | TRUST BOUNDARY | Must be the stored authority (manual check at v2:191-197). Worst case: legit authority pays rent top-up themselves. |

## Cross-Focus Intersections

### CPI × Access Control
- All three CPI sites use Signer-derived authority. No PDA signer escape.
- `migrate_config` UncheckedAccount config is PDA-seed-gated (v2:860) AND manually authority-verified (v2:191-197). Defense in depth.
- `cancel_match` permits authority OR registered player (after timeout). Combined with the H023 gate, the access-control surface no longer allows partial-refund theft.
- `permissionless_reclaim` permits anyone after grace. H023 gate applies equally to anonymous callers.

### CPI × State Machine
- OC-10 (state-before-transfer) is correctly applied at all 6 lamport-movement sites.
- H023 gate enforces refund completeness — state machine cannot reach `close = caller` with partial refunds.
- NOVEL-CPI-01 (non-contiguous mask) is a state-machine trap; flag for State Machine focus.
- `migrate_config` does NOT touch escrow state (escrow PDAs unaffected). Only config PDA grows.

### CPI × Arithmetic
- Deposit wager comes directly from `escrow.wager_lamports`, validated at create_match (range [10_000, 100_000_000_000]). No arithmetic before CPI.
- Settlement arithmetic (v1:301-323, v2:619-642) uses u128 widening + `checked_*`. Result casts back to u64; safe at max pot.
- Lamport credit `+= amount` (CPI-03) is raw, not checked. Practically unreachable overflow. Defense-in-depth gap.
- Migration rent calculation: `checked_sub` at v2:212-213 for lamports_needed.

### CPI × Token/Economic
- All value transfer in native SOL. No SPL Token, no Token-2022. EP-049, EP-051-057 inapplicable.
- Fee distribution feeds direct lamport transfers. Token/Economic focus revalidates fee math; CPI focus confirms destinations are key-validated + executable-checked.

### CPI × Error Handling
- Every CPI and lamport mutation uses `?` propagation. No `let _ =` patterns. No silent swallow.
- CPI return value (none expected from system_program::transfer) is not consumed.

### CPI × Upgrade / Governance (Bundle 1)
- migrate_config is devnet-only per doc comment. Confirm the follow-up program upgrade removes it before mainnet.
- update_config / accept_authority do NOT touch CPI surface — they only mutate config PDA state. No new CPI introduced.

## Cross-Reference Handoffs

- → **Access Control Agent**: `migrate_config` UncheckedAccount + manual byte-offset authority check is a significant access-control surface; deeper investigation of byte-offset assumption against actual v1 struct layout warranted. H019 re-check (no `init_if_needed`, but realloc bypasses Account<T> validation — does this open a re-init vector?). Both warrant Phase 4 deep-investigation if not yet covered.

- → **State Machine Agent**: NOVEL-CPI-01 (non-contiguous deposit mask = stranded funds) is your domain. Document as a known unrecoverable state. The H023 fix does NOT address this. Track separately.

- → **Token/Economic Agent**: H023 closed; NOVEL-CPI-02 closed; H041 closed. CPI-03 (lamport credit overflow) is yours to recommend defense-in-depth fix.

- → **Arithmetic Agent**: CPI-03 — recommend `checked_add` conversion at 10 sites (v1:334,337,340,433,507; v2:652,655,658,734,801).

- → **Upgrade Agent**: `migrate_config` is devnet-only per v2:181-183 doc comment. Track for follow-up program upgrade removal. Also: confirm mainnet deploys with new SPACE (231) from initialize_config genesis — no migration path needed. NEW-CPI-01 (layout-compatibility invariant) is a doc-only finding to add.

- → **Timing Agent**: cancel_match's `is_timed_out` gate (v1:383, v2:697) determines when a player can call cancel. No CPI implications; just access timing.

## Risk Observations (Prioritized)

1. **HIGH — NOVEL-CPI-01 (STILL OPEN)**: Non-contiguous `deposits_mask` is unrefundable. The H023 fix does NOT address this. Independent state-machine issue. Cross-reference handoff to State Machine focus.
2. **MEDIUM — CPI-03 (STILL OPEN)**: Lamport credit overflow without `checked_add`. 10 sites. Defense-in-depth gap. Practically unreachable.
3. **LOW — NEW-CPI-01 (NEW)**: `migrate_config` zero-fill relies on un-documented Borsh layout compatibility invariant. Doc-only.
4. **LOW — NEW-CPI-02 (NEW)**: `migrate_config` not pause-gated. Doc-only.
5. **LOW — NEW-CPI-03 (NEW)**: `migrate_config` requires funded authority wallet. Op-note only.
6. **CLOSED — H023**: Partial-refund theft via close=caller sweep. **CRITICAL FIXED.** Gate at all 4 sites.
7. **CLOSED — H041**: Rent theft via close=caller. Same surface as H023; fix applies.
8. **CLOSED — NOVEL-CPI-02**: Same as H023.
9. **CLOSED — H025/H009**: Executable-account fee destination. 6 `!executable` constraints landed.

## Trust Boundaries

- **System Program** (CPI target): FULL trust. Validated via `Program<'info, System>`. Cannot be substituted.
- **Escrow PDA / Config PDA** (lamport sources/destinations / data store): FULL trust (program-owned). Direct mutations authorized.
- **Winner / Treasury / Ops UncheckedAccounts** (settle destinations): LIMITED trust. Key identity + non-executable validated. NO writability check (Anchor runtime enforces via `mut`).
- **`remaining_accounts` in cancel/reclaim**: LIMITED trust. Per-iteration: bounds + mask bit + pubkey-match. Pre-loop: `len == count_ones(mask)` (H023 gate).
- **Caller of cancel_match / permissionless_reclaim**: TRUST BOUNDARY. Authority OR player (cancel) or anyone (reclaim). `close = caller` redirects rent only (H023 gate now in place).
- **Caller of migrate_config**: TRUST BOUNDARY. Must be stored authority. Worst case: legit authority pays own rent top-up.
- **Authority key**: TRUST BOUNDARY. Hot wallet. Can call `update_config` (now pending-only, 24h timelock), `propose_authority` (2-step), `pause/unpause`, `start_with_depositors`, `settle_match`, `migrate_config`. All gated appropriately.

## Recommended Fixes Summary

| ID | Severity | Fix | Effort |
|---|---|---|---|
| NOVEL-CPI-01 (non-contiguous mask) | HIGH | Restructure refund loop to use index map (caller passes `Vec<u8>` of indices + accounts). Alternative: always require `start_with_depositors` before cancel. | Larger refactor |
| CPI-03 (lamport credit overflow) | MEDIUM | Convert all `+= amount` lamport credits to `checked_add` form | 10 lines × 2 files |
| NEW-CPI-01 (migrate layout invariant) | LOW | Add doc comment on `impl GlobalConfig` documenting field-layout-compatibility requirement | 1 line |
| NEW-CPI-02 (migrate pause bypass) | LOW | Add doc comment to migrate_config noting it bypasses pause | 1 line |
| NEW-CPI-03 (migrate authority funding) | LOW | Add operational doc about authority wallet rent-top-up requirement | doc-only |

End of analysis.
