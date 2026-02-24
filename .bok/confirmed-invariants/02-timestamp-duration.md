# Confirmed Invariants: Timestamp & Duration Arithmetic

**Status:** CONFIRMED (7 invariants approved for code generation)
**Source:** `.bok/invariants/timestamp-duration.md`
**Confirmed:** 2026-02-23

---

## P1 — High

### TS-INV-5: Settlement/Cancel Window Mutual Exclusion
- **Property:** No point in time exists where both settle_match and cancel_match (timeout path) can succeed
- **Tool:** Proptest
- **Critical:** Prevents double-drain of escrow (4x wager from 2x balance)

### TS-INV-2: Deadline Ordering (settle < cancel < reclaim)
- **Property:** `activated_at + 3600 < activated_at + 86400 < activated_at + 172800`
- **Tool:** Proptest
- **Critical:** Foundation of match lifecycle timeout design

---

## P2 — Medium

### TS-INV-1a: Settlement Deadline Overflow Safety
- **Property:** `activated_at + SETTLEMENT_TIMEOUT_SECONDS` does not overflow i64 for realistic timestamps
- **Tool:** Proptest
- **Range:** Realistic [2020, 2100], boundary [i64::MAX - 3600, i64::MAX]

### TS-INV-1b: Cancel Timeout Overflow Safety
- **Property:** `timeout_reference + TIMEOUT_SECONDS` does not overflow i64 for realistic timestamps
- **Tool:** Proptest

### TS-INV-1c: Permissionless Reclaim Overflow Safety
- **Property:** `timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT` does not overflow i64 for realistic timestamps
- **Tool:** Proptest
- **Note:** Largest addition (172800s), tightest headroom. Last-resort fund recovery path.

### TS-INV-3: Constant Relationship (2x)
- **Property:** `PERMISSIONLESS_RECLAIM_TIMEOUT == 2 * TIMEOUT_SECONDS` and no const overflow
- **Tool:** Proptest + static assertions
- **Note:** Rust `const` arithmetic wraps silently; this catches TIMEOUT_SECONDS > i64::MAX/2

### TS-INV-4: Timeout Reference Fallback
- **Property:** When `activated_at == 0`, timeout uses `created_at`; when > 0, uses `activated_at`
- **Tool:** Proptest (pure logic) + LiteSVM (runtime integration)
- **Critical:** Incorrect fallback could make matches immediately cancellable after activation

### TS-INV-6: Reclaim Window Subsumes Cancel Window
- **Property:** `reclaim_deadline > cancel_deadline` for all valid timeout_references
- **Tool:** Proptest
- **Gap:** Exactly TIMEOUT_SECONDS (24h) between cancel and reclaim eligibility
