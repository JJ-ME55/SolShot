# Unified Architectural Understanding

**Project:** SolShot Escrow (solshot-escrow)
**Generated:** 2026-02-23
**Source:** The Fortress Phase 2 Synthesis (6 context auditor summaries)

---

## Executive Summary

SolShot Escrow is a single-file Anchor program (855 LOC) implementing a 1v1 wagered match escrow using native SOL. The program is architecturally simple: two players deposit equal wagers into a PDA, a server authority designates a winner, and the pot is split 90/7/3 (winner/treasury/ops) via BPS math. The program has no SPL token interactions, no oracle dependencies, no pool-based pricing, and a single CPI call to the System Program.

From a security perspective, the program's attack surface is dominated by **centralization risk**, not code-level vulnerabilities. The server authority has unilateral power over: winner selection, fee destination addresses, match lifecycle (pause/unpause), and its own transfer (one-step, no propose/accept). The arithmetic is sound (u128 widening, checked ops, overflow-checks=true in Cargo.toml), the state machine is well-guarded (OC-10 state-before-transfer pattern), and the CPI surface is minimal. The primary concerns are: (1) one-step authority transfer enabling instant takeover, (2) update_config lacking distinctness re-validation, (3) a 23-hour dead zone between settlement expiry and player cancellation, and (4) the authority's total economic control without timelock or multisig.

The program is immune to flash loans, sandwich attacks, oracle manipulation, and reentrancy. The permissionless_reclaim instruction provides an effective escape hatch ensuring no funds are permanently stuck.

---

## System Overview

### Core Components

| Component | Purpose | Location | Security Role |
|-----------|---------|----------|---------------|
| GlobalConfig | Protocol settings (authority, treasury, ops, pause) | `lib.rs` PDA `["config"]` | Single authority controls all admin functions |
| MatchEscrow | Per-match state (players, wager, deposits, state) | `lib.rs` PDA `["match", match_id]` | Holds deposited SOL, enforces lifecycle |
| MatchState | 4-state enum lifecycle | `lib.rs` enum | Guards instruction access per state |
| 9 Instructions | Full program API | `lib.rs:90-855` | Each instruction validates state + access |

### Data Flow Diagram

```
Player A ─── deposit_wager ──→ MatchEscrow PDA ←── deposit_wager ─── Player B
                                     │
                            (both deposited)
                                     │
                              ┌──────┴──────┐
                              ▼              ▼
Authority ─ settle_match ─→ Split:      Player ─ cancel_match ─→ Refund:
  90% → Winner                24h timeout      exact wager back
  7%  → Treasury                                to each depositor
  3%  → Ops wallet
                              │              │
                              ▼              ▼
                        [Account closed]  [Account closed]
                                     │
                              ┌──────┘
                              ▼
Anyone ── permissionless_reclaim ──→ Refund (48h timeout)
```

---

## Trust Model

### Actors

| Actor | Trust Level | Capabilities | Entry Points |
|-------|-------------|--------------|--------------|
| Authority (Server) | TRUSTED (centralized) | Configure protocol, create matches, settle matches, pause/unpause, transfer authority | initialize_config, update_config, pause_program, unpause_program, create_match, settle_match |
| Player | PARTIAL | Deposit wager, cancel match (after timeout) | deposit_wager, cancel_match |
| Anyone | UNTRUSTED | Reclaim stuck funds (after 48h) | permissionless_reclaim |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      UNTRUSTED ZONE                          │
│  - All instruction arguments (match_id, winner, wager)       │
│  - All user-provided accounts (player wallets)               │
│  - Clock timestamp (1-2s drift, immaterial for 1h+ windows)  │
├─────────────────────────────────────────────────────────────┤
│                    ANCHOR VALIDATION LAYER                    │
│  - Program<'info, System> enforces System Program ID         │
│  - has_one = authority on config-gated instructions           │
│  - PDA seeds enforce account derivation ["match", match_id]  │
│  - State enum guards (require!(escrow.state == ...))         │
│  - Constraint expressions (player matching, deposit flags)   │
├─────────────────────────────────────────────────────────────┤
│                      TRUSTED ZONE                            │
│  - GlobalConfig PDA (authority, treasury, ops, is_paused)    │
│  - MatchEscrow PDA (validated state, stored pubkeys)         │
│  - Hardcoded BPS constants (700, 300, 10000)                 │
│  - Wager bounds (MIN=10,000, MAX=100,000,000,000 lamports)   │
└─────────────────────────────────────────────────────────────┘
```

---

## State Management

### Critical State Variables

| State | Location | Modified By | Read By | Invariants |
|-------|----------|-------------|---------|------------|
| GlobalConfig.authority | PDA ["config"] | initialize_config, update_config | All admin instructions | Must be a signer for admin ops |
| GlobalConfig.treasury | PDA ["config"] | initialize_config, update_config | settle_match | Receives 7% BPS fee |
| GlobalConfig.ops | PDA ["config"] | initialize_config, update_config | settle_match | Receives 3% BPS fee |
| GlobalConfig.is_paused | PDA ["config"] | pause_program, unpause_program | create_match, deposit_wager, settle_match, cancel_match | NOT checked by permissionless_reclaim (by design) |
| MatchEscrow.state | PDA ["match", id] | deposit_wager, settle_match, cancel_match, permissionless_reclaim | All match instructions | 4-state lifecycle, monotonic transitions only |
| MatchEscrow.activated_at | PDA ["match", id] | deposit_wager (when both deposit) | settle_match, cancel_match, permissionless_reclaim | Set once, never modified |
| MatchEscrow.created_at | PDA ["match", id] | create_match | cancel_match (AwaitingDeposits timeout ref) | Set once, never modified |

### State Lifecycle

```
                create_match
                     │
                     ▼
            ┌─────────────────┐
            │ AwaitingDeposits │ ←── deposit_wager (1st player)
            └────────┬────────┘
                     │ deposit_wager (2nd player → activated_at set)
                     ▼
              ┌────────────┐
              │   Active    │
              └──┬───┬───┬──┘
                 │   │   │
    settle_match │   │   │ cancel_match (24h timeout)
    (≤1h window) │   │   │
                 ▼   │   ▼
          ┌────────┐ │ ┌───────────┐
          │Settled │ │ │ Cancelled │
          └────────┘ │ └───────────┘
                     │
                     │ permissionless_reclaim (48h timeout)
                     ▼
              ┌───────────┐
              │ Cancelled │
              └───────────┘

  Cancel from AwaitingDeposits: cancel_match (24h from created_at)
  Cancel from Active: cancel_match (24h from activated_at)
  Reclaim from any non-terminal: permissionless_reclaim (48h)
```

---

## Key Mechanisms

### Mechanism 1: BPS Fee Calculation (settle_match)

**Purpose:** Split the pot 90/7/3 between winner, treasury, and ops.

**How it works:**
1. Widen to u128: `total_pot_128 = (wager_lamports as u128).checked_mul(2)`
2. Treasury: `(total_pot_128 * 700 / 10000) as u64`
3. Ops: `(total_pot_128 * 300 / 10000) as u64`
4. Winner: `total_pot - treasury - ops` (remainder strategy)

**Security considerations:**
- u128 widening prevents overflow at max wager (200 SOL * 700 = 1.4e14, safe in u128)
- Remainder-to-winner prevents dust loss
- `as u64` narrowing casts are safe ONLY because MAX_WAGER bounds the domain

### Mechanism 2: Direct Lamport Manipulation (settle/cancel/reclaim)

**Purpose:** Transfer SOL without CPI (only the single deposit uses CPI).

**How it works:**
1. Set terminal state (Settled/Cancelled) — OC-10 pattern
2. `try_borrow_mut_lamports()` on escrow PDA and recipient accounts
3. Debit escrow, credit recipient(s)

**Security considerations:**
- Recipients are `UncheckedAccount` — validated via `constraint` against stored pubkeys
- No check that recipient is non-executable — if treasury/ops set to program address, lamport credit may silently fail
- Transaction atomicity prevents partial transfers (any `?` error reverts all)

### Mechanism 3: Three-Tier Timeout Hierarchy

**Purpose:** Ensure funds are never permanently stuck.

**How it works:**
1. Settlement window: ≤1h from activated_at (authority-only)
2. Player cancel: >24h from activated_at or created_at (either depositing player)
3. Permissionless reclaim: >48h from activated_at or created_at (anyone)

**Security considerations:**
- Creates 23-hour dead zone between settlement expiry (1h) and player cancel (24h)
- Pause mechanism blocks cancel_match but NOT permissionless_reclaim (escape hatch)

---

## External Dependencies

### CPI Targets

| Program | Purpose | Validation | Trust Level |
|---------|---------|------------|-------------|
| System Program | SOL transfer (deposit_wager only) | `Program<'info, System>` | HIGH (native) |

### Oracles/External Data

| Source | Data Type | Usage | Validation |
|--------|-----------|-------|------------|
| Clock Sysvar | unix_timestamp | Deadline enforcement (5 locations) | `Clock::get()` syscall (no injection risk) |

---

## Access Control Summary

### Permission Matrix

| Operation | Anyone | Player | Authority |
|-----------|--------|--------|-----------|
| initialize_config | - | - | Yes (one-time) |
| update_config | - | - | Yes |
| pause_program | - | - | Yes |
| unpause_program | - | - | Yes |
| create_match | Yes* | Yes* | Yes |
| deposit_wager | - | Yes (matching player) | - |
| settle_match | - | - | Yes (within 1h) |
| cancel_match | - | Yes (after 24h) | - |
| permissionless_reclaim | Yes (after 48h) | Yes (after 48h) | Yes (after 48h) |

*create_match lacks `has_one = authority` — any signer can create, but matches created by non-authority are unsettleable.

---

## Economic Model

### Value Flows

```
Player A (wager) ──CPI──→ Escrow PDA ←──CPI── Player B (wager)
                              │
                     ┌────────┴────────┐
                     │   SETTLEMENT    │
                     │   (authority)   │
                     └───┬───┬───┬────┘
                         │   │   │
               ┌─────────┘   │   └─────────┐
               ▼             ▼             ▼
          Winner (90%)  Treasury (7%)   Ops (3%)
          + remainder   via config      via config
          + rent

         OR: CANCELLATION → each player gets exact wager back
         OR: RECLAIM → each depositing player gets exact wager back
```

### Fee Structure

| Fee Type | Rate (BPS) | Collection Point | Destination |
|----------|-----------|------------------|-------------|
| Treasury | 700 (7%) | settle_match | config.treasury |
| Operations | 300 (3%) | settle_match | config.ops |
| Winner | 9000 (90%) + remainder | settle_match | winner account |

### Economic Invariants

| Invariant | Where Enforced | Status |
|-----------|---------------|--------|
| total_distributed ≤ total_pot | Lines 270-274: remainder strategy | HOLDS |
| winner + treasury + ops == total_pot | Lines 253-274: checked math | HOLDS |
| Each player deposits/refunds exactly wager_lamports | Lines 179-188 / 358-367 | HOLDS |
| Fees ≥ 1 lamport per recipient | MIN_WAGER=10,000 guarantees | HOLDS |
| No value extraction beyond designed paths | All lamport movements in 5 instructions | HOLDS |

---

## High-Complexity Areas

### Area 1: update_config Missing Distinctness Re-Validation

**Identified by:** Access Control (01), State Machine (03), Token/Economic (05)

**Why complex:**
- initialize_config enforces authority ≠ treasury ≠ ops
- update_config allows arbitrary Pubkey changes without re-checking distinctness
- Could set treasury == ops (settlement failure at account constraint), treasury == authority (fee redirection), or ops to executable account (silent lamport loss)

**Key code:** `lib.rs:70-88`

### Area 2: Authority Centralization

**Identified by:** Access Control (01), State Machine (03), Token/Economic (05), Timing (08)

**Why complex:**
- Single key controls: winner selection, fee destinations, pause/unpause, authority transfer
- One-step authority transfer (no propose/accept pattern) — immediate, irreversible
- No timelock on any configuration change
- Authority cannot be a player (OC-06), preventing direct fund theft, but can always select winners

**Key code:** `lib.rs:56-88` (config management), `lib.rs:228-305` (settlement)

### Area 3: 23-Hour Dead Zone

**Identified by:** State Machine (03), Timing (08)

**Why complex:**
- Settlement expires at 1h (authority can no longer settle)
- Player cancel not available until 24h
- 23 hours where Active match with deposits is stuck — neither party can act
- Not permanently stuck (cancel available at 24h), but creates significant fund lockup

**Key code:** `lib.rs:236-244` (settlement deadline), `lib.rs:329-333` (cancel timeout)

---

## Cross-Cutting Concerns

### Patterns Used Across Codebase

| Pattern | Usage Count | Locations | Consistency |
|---------|-------------|-----------|-------------|
| OC-10: State-before-transfer | 3 | settle (L279), cancel (L355), reclaim (L417) | Consistent |
| checked_add for timestamps | 5 | create, deposit, settle, cancel, reclaim | Consistent |
| try_borrow_mut_lamports | 9 | settle (3x), cancel (2x), reclaim (2x) | Consistent |
| Pause guard | 4 | create, deposit, settle, cancel | Consistent (reclaim excluded by design) |
| Anchor has_one = authority | 6/9 | All admin instructions | Missing on CreateMatch |

### Shared Assumptions

1. **Authority is honest and operational:** All match outcomes depend on authority settling correctly within 1h. No dispute mechanism exists.
2. **Authority key is secure:** One-step transfer means a compromised key immediately transfers all protocol control.
3. **Treasury/ops are valid wallet addresses:** No validation that fee destinations are non-executable, system-owned wallets.
4. **Players will act to protect their funds:** Cancel and reclaim are player-initiated — no automatic refund mechanism.

---

## Attack Surface Summary

### Entry Points by Risk

| Risk Level | Entry Point | Why This Risk |
|------------|-------------|---------------|
| HIGH | `update_config` | Changes authority, treasury, ops with no timelock or distinctness check |
| HIGH | `settle_match` | Authority unilaterally selects winner — total economic control |
| MEDIUM | `create_match` | Not authority-gated — PDA namespace spam possible |
| MEDIUM | `cancel_match` | 24h delay creates timing asymmetry |
| LOW | `deposit_wager` | Single CPI call, well-validated |
| LOW | `permissionless_reclaim` | Intentional escape hatch, 48h delay |

### Known Constraints

- `overflow-checks = true` in Cargo.toml release profile: native arithmetic panics on overflow
- `Program<'info, System>` on all CPI contexts: System Program ID enforced by Anchor
- PDA seeds `["match", match_id]` with canonical bump: no seed manipulation
- Terminal state set before any lamport transfer (OC-10): reentrancy mitigation
- Wager bounds [10,000 .. 100,000,000,000] lamports: prevents zero-fee and overflow edge cases

### Novel Attack Surface Observations

1. **PDA rent incentive imbalance:** At minimum wager (10,000 lamports ≈ $0.002), the rent-exempt minimum for the escrow PDA (~0.0015 SOL) may exceed the wager itself. Authority pays rent at creation, recovers it at settlement. Economic incentive to create-and-settle matches for rent profit at low wagers.
2. **Escrow PDA lamport inflation:** Anyone can send lamports to the escrow PDA via system transfer. Extra lamports above 2*wager+rent would be swept to the authority on account close. Potential for donation-based economic manipulation.
3. **Match ID as string-based PDA seed:** The match_id is a string that becomes PDA seed bytes. Long or adversarial match_id strings could affect PDA derivation costs or create collisions if the string space is predictable.

### Open Questions

1. Is one-step authority transfer an intentional design choice or an oversight? (No propose/accept or timelock)
2. Should the 23-hour dead zone be narrowed? (e.g., allow player cancel at 2h instead of 24h)
3. Should create_match require authority? (Current behavior allows spam but spammer loses rent)

---

## Appendix: Focus Area Cross-References

### Where Focus Areas Intersected

| Focus A | Focus B | Intersection Point | Notes |
|---------|---------|-------------------|-------|
| Access Control (01) | Token/Economic (05) | update_config distinctness | Both flag missing re-validation |
| Access Control (01) | Token/Economic (05) | create_match ungated | Both flag PDA spam risk |
| State Machine (03) | Timing (08) | 23-hour dead zone | Both flag with consistent analysis |
| State Machine (03) | CPI/External (04) | OC-10 state-before-transfer | Both confirm correct implementation |
| Token/Economic (05) | CPI/External (04) | BPS fee → lamport transfer | Both confirm arithmetic soundness |
| Timing (08) | State Machine (03) | Pause + active match = 48h lock | Both flag with consistent analysis |

### Contradictions or Tensions

| Area | Observation A | Observation B | Resolution |
|------|---------------|---------------|------------|
| CPI (04) vs Economic (05) | "Direct lamport manipulation is safe" | "UncheckedAccount recipient could be executable" | Both correct — safe for valid wallets, edge case for misconfigured config |
| State Machine (03) vs Timing (08) | "activated_at backward-compat guard is redundant" | "Settlement deadline check is sound" | Consistent — both agree guard is redundant-but-safe |

---

**This document synthesizes findings from 6 parallel context audits.**
**Use this as the foundation for attack strategy generation.**
