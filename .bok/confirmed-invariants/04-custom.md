# Custom Invariants (User-Added in Phase 2)

These invariants were added by the user during the BOK:confirm review on top of the 39 agent-proposed invariants.

---

## I-CUSTOM-1: Per-Match Zero-Leakage (Refund Total ≤ Deposit Total)

**Priority:** HIGH — backstop check on the critical-path refund flow.
**Tool:** LiteSVM (runtime)
**Confidence:** HIGH

### Plain-English description

For any single match, the total amount of SOL refunded via `cancel_match` or `permissionless_reclaim` must be exactly equal to the total amount deposited into the escrow PDA via `deposit_wager`. No leakage in either direction.

### Why it matters (concrete exploit)

Complements `I-REF-2` (Σ refunds = wager × count_ones). I-REF-2 verifies the per-iteration math holds; I-CUSTOM-1 verifies the END-TO-END accounting holds across the full match lifecycle, including:

- The `close = caller` rent reclamation.
- Any external lamport credits to the escrow PDA (donation attack — H026 says it's economically irrational, but the invariant should hold even under deliberate inflation).
- Combined with the H023 fix `len() == count_ones()` length check, this proves zero on-chain leakage of player funds.

If this invariant fails, it means there's a code path that drains escrow lamports to a destination NOT covered by the per-iteration accounting — that would be a fund-loss vulnerability we missed.

### Formal property

```
For each MatchEscrow PDA over its lifetime from create_match to terminal-state close:

   Σ(deposit_wager amounts to escrow_pda) ==
       Σ(per-iteration refunds in cancel_match + permissionless_reclaim) +
       Σ(settlement transfers in settle_match)

Equivalently, no lamport sent into escrow_pda is destroyed or sent to an
unaccounted destination over the lifetime of the match.

(Rent reserve is excluded — that's paid by `payer` at create_match and
reclaimed via `close = caller/authority`. Player wagers ≠ rent reserve.)
```

### Target code

| File | Function | Lines |
|---|---|---|
| `programs/solshot-escrow/src/lib.rs` | All deposit/refund/settle paths | full lifecycle |
| `programs/solshot-escrow-v2/src/lib.rs` | All deposit/refund/settle paths | full lifecycle |

### Verification approach

LiteSVM end-to-end test fixture:

1. Create match with N players (N ∈ {2, 3, 4} for v1; N ∈ {2, 5, 10} for v2).
2. Each player deposits `wager_lamports`.
3. Capture `escrow_pda.lamports` post-deposits — should equal `wager × N + rent_reserve`.
4. Run terminal path (settle / cancel / reclaim).
5. Sum: external lamport credits to (winner / treasury / ops / refunded players) - external lamport debits from those accounts == `wager × N`.
6. After close, escrow_pda is closed; rent reserve goes to `close = X` destination.
7. Net wager flow MUST balance.

### Cross-references

- `I-REF-2` — per-iteration refund math holds.
- `I-FEE-1` — settlement split sums correctly.
- `H023` (SOS audit) — partial-refund theft via close=caller. Fix applied; this invariant is the regression check.

---

## I-CUSTOM-2: CPI Surface Lockdown — Only system_program::transfer in deposit_wager

**Priority:** MEDIUM — defensive invariant against future regressions.
**Tool:** LiteSVM + static check
**Confidence:** HIGH

### Plain-English description

The only Cross-Program Invocation (CPI) made by either program is `system_program::transfer` from the deposit_wager handler. Any future code change that introduces a new CPI must trip this invariant.

### Why it matters (concrete exploit)

The Phase 1 CPI agent confirmed: "Neither program calls `invoke()`, `invoke_signed()`, `get_return_data()`, any Token program, any oracle, any governance program, or any custom external program. CPI depth is exactly 1." This minimal surface is a major security property — it bounds the trust model to "Solana runtime + our own validation."

If a future code change adds a CPI to e.g., a price oracle or an SPL Token program, that introduces an entirely new attack surface (oracle manipulation, transfer hooks, etc.). This invariant is a tripwire for that scenario.

### Formal property

```
Static analysis property:
   For both lib.rs files, the count of `invoke()`, `invoke_signed()`,
   `CpiContext::*`, and `Program<'info, X>` (where X != System) must equal
   the expected baseline count.

Runtime property (LiteSVM):
   In a transaction trace, the only inner instructions invoked by either
   program ID are System Program transfers, and those transfers ONLY occur
   inside deposit_wager.
```

### Target code

| File | Function | Lines |
|---|---|---|
| `programs/solshot-escrow/src/lib.rs` | `deposit_wager` — only allowed CPI site | `:213-222` |
| `programs/solshot-escrow-v2/src/lib.rs` | `deposit_wager` — only allowed CPI site | `:275-284` |

### Verification approach

**Static check (compile-time-style):**

```rust
// In tests/bok_cpi_lockdown.rs:
#[test]
fn cpi_surface_static_check() {
    let v1_src = include_str!("../src/lib.rs"); // adjust path as needed
    let invoke_count = v1_src.matches("invoke(").count();
    let invoke_signed_count = v1_src.matches("invoke_signed(").count();
    let cpi_context_count = v1_src.matches("CpiContext::new").count();

    // Baseline: 0 invoke(), 0 invoke_signed(), 1 CpiContext::new (in deposit_wager)
    assert_eq!(invoke_count, 0, "Unexpected invoke() — review for new CPI");
    assert_eq!(invoke_signed_count, 0, "Unexpected invoke_signed() — review for PDA-signed CPI");
    assert_eq!(cpi_context_count, 1, "Unexpected CpiContext usage — review for new CPI");
}
```

**Runtime check (LiteSVM):**

```rust
#[test]
fn cpi_surface_runtime_check() {
    let mut svm = LiteSVM::new();
    deploy_program(&mut svm, ESCROW_V1_ID, "../target/deploy/solshot_escrow.so");

    // Run a settle_match TX
    let tx = build_settle_tx(...);
    let result = svm.send_transaction(tx).unwrap();

    // Inspect inner instructions: settle should have ZERO inner instructions
    // (direct lamport mutation is not a CPI)
    let inner_instructions = result.inner_instructions();
    assert_eq!(inner_instructions.len(), 0, "Unexpected CPI in settle_match");

    // Run a deposit_wager TX
    let deposit_tx = build_deposit_tx(...);
    let result = svm.send_transaction(deposit_tx).unwrap();

    // Inspect inner instructions: should be exactly 1 system_program::transfer
    let inner = result.inner_instructions();
    assert_eq!(inner.len(), 1, "Unexpected CPI count in deposit_wager");
    assert_eq!(inner[0].program_id, system_program::ID);
}
```

### Cross-references

- `.audit/context/04-cpi-external.md` — Phase 1 CPI agent verified the current CPI surface.
- Mainnet hardening: this invariant becomes more important when external integrations (oracle, SPL token) are added.

---

## Custom invariants summary

| ID | Tool | Priority |
|---|---|---|
| **I-CUSTOM-1** | LiteSVM | HIGH |
| **I-CUSTOM-2** | LiteSVM + static check | MEDIUM |

Both are defensive backstops complementing the agent-proposed invariants.
