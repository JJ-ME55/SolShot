# Unified Architectural Understanding

**Project:** SolShot Escrow (programs v1 + v2)
**Generated:** 2026-05-07
**Source:** Stronghold of Security Phase 2 Synthesis (7 context auditors merged)

---

## Executive Summary

SolShot ships two parallel Anchor programs that escrow native SOL for wagered tank-battle matches. **v1 (`programs/solshot-escrow/`, 962 LOC, deployed `4kzr...nH1`)** handles real-time 1v1-to-4-player matches and has been live-fire tested on devnet (first wagered settlement 2026-05-04). **v2 (`programs/solshot-escrow-v2/`, 1020 LOC, deployed `BVKX...G7N`)** handles asynchronous N-player (2-10) group-chat matches with longer windows; it has had 1 organic 3-player match auto-settle on devnet (2026-05-06) and **no prior audit coverage**. Both share the same on-chain trust model and CPI surface; they diverge sharply on timing, fee mutability, and pause-guard placement.

The protocol's security posture is dominated by two structural choices and one shared mechanism. **Choice 1**: a single hot wallet (`HPyV...nokv`) holds both Solana-level upgrade authority and application-level `config.authority` for both programs — verified live via `solana program show`. JJ has flagged this as an intentional pre-mainnet posture. **Choice 2**: settlement is server-authoritative — the authority key freely chooses the winner from the registered players list, with no on-chain proof of the game outcome. **Mechanism**: the `cancel_match` and `permissionless_reclaim` instructions both use `close = caller` and refund deposited players via `remaining_accounts.iter().enumerate()`. This refund pattern produced two independently flagged novel findings (NOVEL-CPI-01 and NOVEL-CPI-02 / NOVEL-TE-01) that may constitute a critical fund-theft path.

v2 introduces a per-match snapshot of treasury / ops / fee_bps_treasury / fee_bps_ops captured atomically inside `create_match`. This is a real architectural mitigation: in-flight matches in v2 are immune to mid-match config rotation by a compromised authority. It does NOT mitigate winner-pick fraud, NEW matches created post-compromise, or Layer-1 bytecode replacement. v1 settle still reads live config, leaving in-flight matches exposed to the H001 → H002 chain. Net: v2's architecture is materially stronger for the fee-redirect attack class but inherits the rest of v1's centralization risks unchanged, and adds a new H028-class concern (configurable BPS reachable via Layer-2 compromise without an upgrade).

---

## System Overview

### Core Components

| Component | Purpose | Location | Security Role |
|-----------|---------|----------|---------------|
| `solshot_escrow` (v1) | 1v1 → N-player escrow with hardcoded BPS, real-time pace | `programs/solshot-escrow/src/lib.rs` (962 LOC) | Holds wager pots; settles 90/7/3 fixed split |
| `solshot_escrow_v2` (v2) | N-player (2-10) escrow with configurable BPS, async pace | `programs/solshot-escrow-v2/src/lib.rs` (1020 LOC) | Same role; introduces per-match snapshot |
| `GlobalConfig` PDA | Singleton admin record, seeds = `[b"config"]` | both programs | Holds authority/treasury/ops + (v2) fee_bps_treasury/ops + is_paused |
| `MatchEscrow` PDA | Per-match escrow, seeds = `[b"match", match_id.as_bytes()]` | both programs | Holds player wagers + state machine; closes on settle/cancel |

### Data Flow Diagram

```
[Authority (server) signs create_match]
             │
             ▼
   ┌────────────────────────┐
   │ MatchEscrow PDA inits  │  ← v2 also writes treasury_snapshot,
   │ state = AwaitingDeposits│    ops_snapshot, fee_bps_*_snapshot
   └─────────┬──────────────┘
             │
   [Each player signs deposit_wager]
             │
             ▼
   system_program::transfer(player → escrow PDA)
   set bit in deposits_mask
             │
   [On full mask] state → Active, activated_at = now
   v2 also: match_end_ts = activated_at + duration_secs
             │
       ┌─────┴─────────┬─────────────────────────┐
       │               │                         │
[Authority settles]  [Player cancels        [Anyone reclaims
                      after timeout]         after grace deadline]
       │               │                         │
       ▼               ▼                         ▼
  state=Settled   state=Cancelled         state=Cancelled
  90/7/3 split    refund all deposited    refund all deposited
  via direct      via remaining_accounts   via remaining_accounts
  lamport math    loop + close=caller      loop + close=caller
  + close=auth
```

**The four `remaining_accounts.iter().enumerate()` refund sites are the single highest-risk surface in the codebase**, flagged independently by the CPI, State Machine, and Token/Economic agents.

---

## Trust Model

### Actors

| Actor | Trust Level | Capabilities | Entry Points |
|-------|-------------|--------------|--------------|
| Anonymous (anyone) | UNTRUSTED | Trigger `permissionless_reclaim` after grace deadline; receive PDA rent reserve via `close = caller` | `permissionless_reclaim` |
| Listed Player | PARTIAL | Deposit own wager (once); cancel own match after timeout | `deposit_wager`, `cancel_match` |
| Authority (server hot wallet) | TRUSTED (single key) | Create matches; settle (pick winner); cancel AwaitingDeposits any time; pause; rotate config; (v2) rotate fee BPS within 10% cap; `start_with_depositors` partial activation | All admin instructions |
| Solana Upgrade Authority (same wallet) | FULLY TRUSTED | Replace bytecode; close program | BPF Loader Upgradeable |
| System Program | FULLY TRUSTED | SOL transfer for deposits | `deposit_wager` CPI only |

### Trust Boundaries

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1 — SOLANA UPGRADE AUTHORITY                       │
│    HPyV...nokv (hot wallet — same as Layer 2)             │
│    Power: replace any bytecode, close program             │
│    Safeguards: NONE (no timelock, no multisig)            │
├──────────────────────────────────────────────────────────┤
│  LAYER 2 — APPLICATION AUTHORITY (config.authority)       │
│    HPyV...nokv (hot wallet — same as Layer 1)             │
│    Power: rotate config / pause / settle / create / cancel│
│            v2 also: rotate fee BPS up to 10% combined     │
│    Safeguards: distinctness, zero-address guard on update │
│                v2 per-match snapshot for in-flight        │
│                NO timelock, NO propose/accept             │
├──────────────────────────────────────────────────────────┤
│  ON-CHAIN VALIDATION                                      │
│    has_one = authority on every privileged path           │
│    PDA seed re-derivation, Anchor init/close guarantees   │
│    Bit-mask deposit dedup, state-monotonicity invariant   │
├──────────────────────────────────────────────────────────┤
│  PLAYER ZONE (allowlisted via escrow.players[])           │
│    Sign own deposit; cancel own match after timeout       │
├──────────────────────────────────────────────────────────┤
│  PERMISSIONLESS ZONE                                      │
│    permissionless_reclaim after grace deadline            │
│    NO config account in struct (immune to pause)          │
└──────────────────────────────────────────────────────────┘
```

**Single-key risk:** A compromise of EITHER the upgrade authority OR the application authority is sufficient for total protocol drainage. Both currently resolve to the same hot wallet.

---

## State Management

### Critical State Variables

| State | Location | Modified By | Read By | Invariants |
|-------|----------|-------------|---------|------------|
| `GlobalConfig.authority` | both, `[b"config"]` | `update_config` (one-step) | `has_one` constraint everywhere | Always non-default; never == treasury || ops |
| `GlobalConfig.treasury` / `ops` | both | `update_config` | v1: live in settle; v2: only at create_match (snapshotted) | Always pairwise distinct; never == authority |
| `GlobalConfig.fee_bps_treasury` / `fee_bps_ops` | **v2 only** | `update_config` | only at create_match (snapshotted) | sum ≤ 1000 (10%) |
| `GlobalConfig.is_paused` | both | pause_program / unpause_program (idempotent) | v1: cancel/settle/create/deposit/start; v2: create/deposit/start only | Bool flag; no event emitted |
| `MatchEscrow.state` | both | deposit_wager (→Active), settle (→Settled), cancel/reclaim (→Cancelled), start_with_depositors (→Active) | Every match-lifecycle instruction | Settled/Cancelled terminal |
| `MatchEscrow.deposits_mask` | both — u8 (v1) / u16 (v2) | deposit_wager only | settle/cancel/reclaim refund loops | Bits ≤ max_players; bit count ≤ MAX_PLAYERS |
| `MatchEscrow.activated_at` | both | deposit_wager (full mask) / start_with_depositors | timeout calcs in cancel/reclaim | Always set in same atomic block as state=Active |
| `MatchEscrow.match_end_ts` | **v2 only** | deposit_wager / start_with_depositors | reclaim deadline calc | = activated_at + duration_secs; never modified after |
| `MatchEscrow.{treasury_snapshot, ops_snapshot, fee_bps_*_snapshot}` | **v2 only** | create_match ONLY (atomic with init) | settle_match | Immutable post-create; validated via account constraints at settle |

### State Lifecycle (identical 4-state enum in v1 and v2)

```
                [create_match — authority-only]
                            │
                            ▼
                  AwaitingDeposits ──────────────────┐
                       │                              │
       [deposit_wager  │                              │  [start_with_depositors]
        — full mask]   │                              │   v1: anytime, ≥2 deposits
                       │                              │   v2: ≥deposit_deadline + ≥2
                       ▼                              ▼
                     Active ←──────────────[same]────┘
                       │
        ┌──────────────┼──────────────────────┐
        │              │                      │
   [settle      [cancel_match           [permissionless_reclaim
    _match]      — authority any        — anyone after grace]
        │        time on AwaitingDep,        │
        ▼        player after timeout]       ▼
     Settled         │                    Cancelled
   [TERMINAL]        ▼                   [TERMINAL]
                  Cancelled
                  [TERMINAL]
```

**Pause guard divergence (the H007 fix):**

| Instruction | v1 paused = blocked? | v2 paused = blocked? |
|-------------|---------------------|---------------------|
| create_match | YES | YES |
| deposit_wager | YES | YES |
| **settle_match** | **YES** | **NO** ← v2 fix |
| **cancel_match** | **YES** | **NO** ← v2 fix |
| permissionless_reclaim | NO (no config account in struct) | NO (no config account in struct) |
| start_with_depositors | YES | YES |

---

## Key Mechanisms

### Mechanism 1: Per-Match Snapshot (v2 only)

**Purpose:** Decouple in-flight matches from runtime config rotation, mitigating mid-match fee redirect attacks.

**How it works:**
1. At `create_match` (`v2:201-219`), inside the same atomic block as `escrow.state = AwaitingDeposits`, the program copies the current `cfg.{treasury, ops, fee_bps_treasury, fee_bps_ops}` into the freshly-initialised escrow's `{treasury_snapshot, ops_snapshot, fee_bps_treasury_snapshot, fee_bps_ops_snapshot}` fields.
2. `settle_match` reads from the snapshot fields exclusively (`v2:396-399`); the SettleMatch account constraints validate the supplied `treasury` / `ops` accounts against `escrow.treasury_snapshot` / `escrow.ops_snapshot` (`v2:717, 726`), NOT against live config.
3. No instruction modifies the snapshot fields after create_match (verified via grep).

**Security considerations:**
- Atomic with create_match — no observable window where escrow exists with default snapshots.
- Provides defense-in-depth against H001 → H002 chain on in-flight matches.
- Does NOT protect: NEW matches created post-compromise (snapshot uses current — possibly poisoned — config), winner-pick fraud (H005), Layer-1 bytecode replacement.
- Cap of 10% combined (MAX_FEE_BPS=1000) bounds blast radius even when authority is hostile.

### Mechanism 2: `remaining_accounts` Refund Loop

**Purpose:** Refund N depositors with a single-instruction pattern that doesn't require named account slots per match-size.

**How it works (4 sites: v1 cancel/reclaim, v2 cancel/reclaim):**
```rust
for (i, account) in ctx.remaining_accounts.iter().enumerate() {
    require!(i < max_players, EscrowError::InvalidPlayer);              // bounds
    require!((deposits_mask >> i) & 1 == 1, EscrowError::InvalidPlayer); // bit set
    require!(*account.key == players[i], EscrowError::InvalidPlayer);    // pubkey match
    **escrow.try_borrow_mut_lamports()? -= wager_lamports;
    **account.try_borrow_mut_lamports()? += wager_lamports;
}
```

Then Anchor's `close = caller` constraint sweeps any remaining lamports from the escrow PDA to the caller.

**Security considerations:**
- The loop's correctness invariant ("`remaining_accounts` is a contiguous prefix of deposited players in `players[i]` order") is enforced by THE CALLER, not by the program — only per-iteration validation runs.
- **NOVEL-01 (HIGH):** Non-contiguous `deposits_mask` (e.g. 0b10) is permanently unrefundable — no syntactically valid call sequence works. Server logs as UNRECOVERABLE.
- **NOVEL-02 (potentially CRITICAL):** A malicious player at slot 0 may call `cancel_match` (after timeout) with `remaining_accounts = [self]` only. Loop refunds them. `close = caller` then sweeps PDA's remaining lamports — including un-refunded co-depositors' wagers — to the caller. Worst case: 9 × 100 SOL = 900 SOL stealable from a v2 max match. **PoC required in Phase 4.**
- No `!executable` check on destination accounts (H009 still open).
- No `is_writable` enforced in-program; relies on client/server passing correct flags.
- No checked_add on the lamport credit (`+= wager_lamports`); practically unreachable overflow.

### Mechanism 3: Direct Lamport Mutation in `settle_match`

**Purpose:** Distribute pot 90/7/3 from program-owned PDA to winner / treasury / ops.

**How it works:**
- v1 (`lib.rs:317-324`): three sequential `try_borrow_mut_lamports` debit/credit pairs against escrow → winner / treasury / ops, where treasury/ops pubkeys come from LIVE `config.{treasury, ops}` (constraint validated).
- v2 (`lib.rs:434-441`): same pattern but reads `escrow.{treasury_snapshot, ops_snapshot}`.
- BPS calc: `total_pot = wager × count_ones(mask)` (u128 widened); `treasury_amount = pot × treasury_bps / 10_000`; `ops_amount = pot × ops_bps / 10_000`; `winner_amount = pot - treasury_amount - ops_amount` (checked_sub, absorbs ≤ 2 lamports dust).
- State (`Settled`) is written BEFORE lamport math (OC-10, EP-033 compliant).
- `close = authority` recovers PDA rent.

**Security considerations:**
- `winner` / `treasury` / `ops` are `UncheckedAccount` — no `!executable` check (H009 STILL OPEN both).
- v1 reads live config — vulnerable to mid-match authority hijack (H002).
- v2 reads snapshot — immune to mid-match hijack but vulnerable to BPS-poisoning at create-time if authority is hostile (H028-class new finding).
- Lamport credits use bare `+=`, not `checked_add` (defense-in-depth gap).

### Mechanism 4: One-Step Authority Rotation (no propose/accept)

**Purpose:** Rotate config.authority / treasury / ops / (v2) fee_bps in a single TX.

**How it works:**
- `update_config` (v1:72-108, v2:96-142) takes `Option<Pubkey>` and `Option<u16>` arguments.
- Each provided field updates atomically.
- Distinctness re-validated post-update (v1:96-98, v2:125-127): `authority != treasury`, `authority != ops`, `treasury != ops`.
- v2 also re-validates `(fee_bps_treasury + fee_bps_ops) <= MAX_FEE_BPS` (1000) at v2:128-131.
- Zero-address guard: `a != Pubkey::default()` at v1:82, v2:107 (but this guard is missing from `initialize_config`).

**Security considerations:**
- **CRITICAL — H001 STILL OPEN both:** No `pending_authority` field, no two-step flow. Hot-wallet compromise = instant total takeover. Historical precedent: Raydium $4.4M, Step Finance $30-40M, Pump.fun $1.9M, Garden Finance $11M.
- No timelock anywhere on the admin path.
- Pause/unpause emits no event (operational gap).
- ConfigUpdated event emitted but no `actor` field (only end-state).

### Mechanism 5: Permissionless Reclaim Escape Hatch

**Purpose:** Server-down failsafe — anyone can refund deposited players after grace deadline.

**How it works:**
- v1: callable after `created_at + 1200s` (or `activated_at + 1200s` if activated). Uses same loop pattern as cancel.
- v2: callable after `match_end_ts + 24h` (or `deposit_deadline + 24h` if not activated).
- Account struct has NO `config` slot — immune to pause.
- `close = caller` rebases rent to whoever calls (incentive for any monitor to sweep).

**Security considerations:**
- Has the same NOVEL-02 exposure as `cancel_match` (caller can pass partial `remaining_accounts` and rent-sweep co-depositors' wagers).
- Stale `lib.rs:22` comment claims "48-hour permissionless reclaim timeout" but actual is 1200s = 20 minutes — operators reading the comment will plan wrong response windows.

---

## External Dependencies

### CPI Targets (the entire CPI surface)

| Program | Purpose | Validation | Trust Level |
|---------|---------|------------|-------------|
| System Program (`1111...1111`) | SOL transfer for `deposit_wager` ONLY | `Program<'info, System>` everywhere; auto-resolved by Anchor 0.32.1 | FULL |

That is the entire CPI surface. **No** `invoke()`, **no** `invoke_signed()`, **no** SPL Token, **no** Token-2022, **no** oracles, **no** governance program, **no** custom external programs. CPI depth is exactly 1.

### Oracles / External Data

**None.** The protocol is pure native SOL with no price feeds.

---

## Access Control Summary

### Role Hierarchy

```
   Solana Upgrade Authority (Layer 1)
              │ same key (HPyV...nokv hot wallet)
              ▼
   config.authority (Layer 2)
              │
   ┌──────────┴──────────┐
   │                     │
Listed Player        Permissionless caller
   │                     │
(deposit_wager,        (permissionless_reclaim
 cancel after timeout)  after grace)
```

### Permission Matrix

| Operation | Anonymous | Listed Player | Authority |
|-----------|-----------|---------------|-----------|
| `initialize_config` | ANY (race-init theoretical) | — | (one-time) |
| `update_config` | — | — | YES (one-step) |
| `pause_program` / `unpause_program` | — | — | YES |
| `create_match` | — | — | YES |
| `deposit_wager` | — | YES (own slot only) | — (excluded) |
| `settle_match` | — | — | YES |
| `cancel_match` (AwaitingDeposits) | — | YES (any time) | YES |
| `cancel_match` (Active) | — | YES (after timeout) | — |
| `permissionless_reclaim` | YES (after grace) | YES (after grace) | YES (after grace) |
| `start_with_depositors` | — | — | YES |

---

## Economic Model

### Value Flows

```
Players → deposit_wager → Escrow PDA accumulates pot
                              │
                ┌─────────────┴─────────────┐
                │                           │
         settle_match                 cancel/reclaim
                │                           │
        ┌───────┼───────┐         per deposited slot:
        │       │       │         escrow → players[i]
   90% → 7% →  3% →  rent          (then close = caller
   winner treasury ops              sweeps rent + any
        ↓       ↓       ↓           residual lamports)
                ↓
            close = authority
            (rent → authority)
```

### Fee Structure

| Version | Treasury BPS | Ops BPS | Mutability |
|---------|--------------|---------|------------|
| v1 | 700 (7%) hardcoded `const u64` | 300 (3%) hardcoded | Layer-1 upgrade only |
| v2 | `cfg.fee_bps_treasury` (mutable, default likely 700) | `cfg.fee_bps_ops` (mutable, default likely 300) | Layer-2 authority via `update_config`; capped at MAX_FEE_BPS=1000 combined; per-match snapshot freezes for in-flight |

### Economic Invariants

1. **Pot conservation:** `winner_amount + treasury_amount + ops_amount == total_pot` (BOK Feb verified for v1; needs re-BOK for v2's configurable BPS).
2. **Refund conservation:** `Σ(refund per deposited slot) == wager_lamports × count_ones(deposits_mask)` for cancel/reclaim. **HOLDS only if `remaining_accounts` is a contiguous prefix of deposited players** (NOVEL-01 if non-contiguous).
3. **Pot ceiling:** `wager × max_players ≤ MAX_WAGER × MAX_PLAYERS = 100 SOL × 10 = 10^12 lamports`, well below u64::MAX.
4. **Dust bound:** `≤ 2 lamports` per settle (two BPS floor divisions). BOK Feb verified for v1; needs re-BOK for v2.
5. **Min wager:** ≥ 10_000 lamports — chosen for v1's 7%/3% split; verify still produces ≥ 1 lamport for fees under all valid v2 BPS pairs.
6. **Fee cap (v2):** combined `fee_bps_treasury + fee_bps_ops ≤ MAX_FEE_BPS (1000)` — bounds authority extraction at 10% per match.

---

## High-Complexity Areas

### Area 1: `remaining_accounts` Refund Loop

**Identified by:** CPI agent (NOVEL-CPI-01, NOVEL-CPI-02), State Machine agent (H030 cross-handoff), Token/Economic agent (NOVEL-TE-01), Access Control agent (H016 re-evaluation)

**Why complex:**
- 4 separate sites (v1 cancel/reclaim, v2 cancel/reclaim) with structurally identical code.
- Caller-controlled `remaining_accounts.len()` interacts with `close = caller` to potentially enable partial-refund theft.
- Non-contiguous `deposits_mask` is unrefundable — fund-lock pattern.
- Per-iteration validation is correct; the loop ENDS when `remaining_accounts` is exhausted, but `close = caller` then sweeps the rest.

**Key code:** `v1:391-419, 465-484; v2:502-518, 561-577` + close constraints at `v1:718, 745; v2:748, 773`

### Area 2: v2 Configurable BPS Pipeline

**Identified by:** Arithmetic agent (A02-A04, NOVEL-A1), Token/Economic agent (H028 verdict), Upgrade/Admin agent (Layer-2 mutation analysis)

**Why complex:**
- BPS values flow: `update_config` → live cfg → `create_match` snapshot → `settle_match` consumption.
- Cap is enforced at update_config but NOT re-validated at settle.
- Per-match snapshot is the architectural defense — atomic with create.
- Authority can ratchet BPS across matches within the 10% cap with no timelock.

**Key code:** `v2:96-142, 201-219, 396-425`

### Area 3: v1 H006-Inverted / v2 Match-End Race Window

**Identified by:** Timing & Ordering agent, Token/Economic agent (cross-handoff)

**Why complex:**
- v1's current constants (TIMEOUT_SECONDS=600, SETTLEMENT_TIMEOUT_SECONDS=3600) create a 50-minute window where settle_match (authority) and cancel_match (player) are simultaneously valid.
- v2 has no settlement deadline; cancel becomes available at `match_end_ts`. Race is theoretically infinite.
- Priority-fee bidding determines outcome.
- Stale comment at `v1:22` claims 48-hour reclaim timeout — actual is 20 min.

**Key code:** `v1:264-272, 357-378, 442-456; v2:387-454, 459-519, 526-578`

### Area 4: Authority Hot-Wallet (Layer 1 + Layer 2)

**Identified by:** Access Control agent, Upgrade/Admin agent, Token/Economic agent

**Why complex:**
- Single key holds upgrade authority AND application authority — verified live.
- No `pending_authority`, no timelock, no propose/accept.
- v2's per-match snapshot mitigates fee-redirect class for in-flight matches; H001 chain is otherwise unchanged.
- No `close_config` instruction — key loss is permanent without Layer-1 upgrade.

---

## Cross-Cutting Concerns

### Patterns Used Across the Codebase

| Pattern | Usage | Consistency |
|---------|-------|-------------|
| `has_one = authority @ EscrowError::Unauthorized` | All admin-mutating + settle paths | Consistent |
| `Signer<'info>` on payer/authority/player/caller | All instructions | Consistent |
| `Clock::get()?.unix_timestamp` | All time reads | Consistent (no slot-based ordering) |
| u128 widening for BPS math | Settle path both versions | Consistent |
| `try_borrow_mut_lamports() ± amount` | All program-owned-PDA payouts | Consistent (no checked_add though) |
| `close = X` (auth on settle, caller elsewhere) | Terminal instructions | Consistent intent — but creates NOVEL-02 surface |
| State-write before lamport math (CEI / OC-10) | Settle, cancel, reclaim | Consistent |

### Shared Assumptions

1. **`overflow-checks = true`** preserved in deployment build — verified at workspace `Cargo.toml:8-11`. Defense layer for unchecked arithmetic.
2. **Authority is honest** about config values — there is no on-chain check preventing self-redirect via secondary wallets (H011 family).
3. **Caller passes `remaining_accounts` correctly** in player-index order, contiguous prefix — REQUIRED by program logic but NOT enforced; non-contiguous = NOVEL-01.
4. **Server uses unique match_id** (CSPRNG) — server-side concern; on-chain `init` rejects collisions.
5. **No SPL Token, no oracles, no Token-2022 in scope** — confirmed pure native SOL.

---

## Attack Surface Summary

### Entry Points by Risk

| Risk Level | Entry Point | Why This Risk |
|------------|-------------|---------------|
| **CRITICAL** | `cancel_match` + `permissionless_reclaim` | NOVEL-02 partial-refund theft (close=caller sweeps residual); affects both v1 and v2 |
| **CRITICAL** | `update_config` | H001 instant authority rotation, no timelock; H011 self-redirect via multi-TX rotation |
| HIGH | `settle_match` (v1) | Reads live config — H002 mid-match hijack still possible |
| HIGH | `settle_match` (v2) | H028-class new finding — BPS poisoning via authority |
| HIGH | `start_with_depositors` (v1) | NOVEL silent-kick (no timing gate) |
| HIGH | `cancel_match` (v1) | H007 still open — pause-griefing path; settle-vs-cancel race window |
| HIGH | `create_match` (v2) | Authority sets duration_secs / deposit_window_secs / BPS snapshot — unbounded discretion |
| MEDIUM | `initialize_config` | Race-init theoretical (any payer accepted) |
| MEDIUM | `permissionless_reclaim` | Race for rent reward; NOVEL-02 also applies |

### Known Constraints / Protections Observed

- `has_one = authority` widely applied — verified clean coverage.
- S004 fix landed at v1:625, v2:659 (CreateMatch.config gated).
- v2 CancelMatch / SettleMatch / PermissionlessReclaim deliberately omit pause guard — H007 fix in v2.
- Distinctness re-validated post-update at v1:96-98, v2:125-127 — H003 fix.
- v2 per-match snapshot atomic with create — defense for in-flight matches.
- Anchor `init` blocks reinitialization — H022 holds.
- `close` zeros data + reassigns ownership — PDA revival yields fresh state (H023 holds).
- u128 widening + `checked_*` arithmetic + `overflow-checks=true` — three layers for arithmetic safety.
- `Program<'info, System>` validated at every CPI declaration.

### Open Questions

1. **NOVEL-02 PoC**: Does `close = caller` actually sweep un-refunded lamports, or does Anchor's runtime drain logic reject this? **MUST be verified by Phase 4 PoC** — either via devnet test against live programs, or by reading Anchor 0.32.1 close-handler source code.
2. **NOVEL-01 mitigation**: Is there an off-chain enforcement that prevents non-contiguous `deposits_mask` from arising in production? Server logs as UNRECOVERABLE — but is the right fix server-side ordering, or an on-chain refactor of the loop to support index maps?
3. **v2 BPS individual cap**: The combined cap fires post-update via re-validation. Could a sequence of partial updates ever leave individual values > MAX_FEE_BPS while the combined sum stays ≤ MAX_FEE_BPS? Walk through the update sequence carefully in Phase 4.
4. **Settle-vs-cancel race economic impact**: Quantify expected loss at MAX_WAGER (100 SOL) given priority-fee bidding mechanics.
5. **`duration_secs` upper bound**: Should v2 cap be more restrictive than 7 days? Current authority discretion → 8-day fund lockup possible.

---

## Appendix: Focus Area Cross-References

### Where Focus Areas Intersected (high-value handoffs)

| Focus A | Focus B | Intersection Point |
|---------|---------|-------------------|
| CPI | Token/Economic | NOVEL-02 partial-refund theft — independently flagged by both |
| CPI | State Machine | NOVEL-01 non-contiguous mask = stranded funds |
| Arithmetic | Token/Economic | H028 invalidated on v2 — BPS pipeline |
| Access Control | Upgrade/Admin | H001 single-key Layer 1 + Layer 2 |
| State Machine | Timing | v1 H007 still open + H006 inverted to race window |
| Access Control | Token/Economic | H011 self-redirect via secondary wallet |
| Token/Economic | Upgrade/Admin | v2 BPS ratcheting within 10% cap |
| Timing | State Machine | v2 deposit_window edge collision at deposit_deadline |
| Arithmetic | CPI | Lamport credit overflow theoretical (defense-in-depth) |

### Convergent Findings (multi-agent agreement)

| Finding | Flagged by |
|---------|-----------|
| **NOVEL Partial-refund theft (close=caller sweeps residual)** | CPI (NOVEL-CPI-02), Token/Economic (NOVEL-TE-01) |
| **NOVEL Non-contiguous mask = unrefundable** | CPI (NOVEL-CPI-01), State Machine (cross-handoff) |
| **H001 still open both versions** | Access Control, Upgrade/Admin (verified live), Token/Economic (root-cause cite) |
| **H007 fixed in v2 only** | Access Control, State Machine, Timing, Upgrade/Admin |
| **H028 invalidated on v2** | Arithmetic (A10), Token/Economic (#4), Upgrade/Admin (RECHECK verdict) |
| **H009 still open both** | Access Control, CPI |
| **H006 inverted, not resolved** | Timing (primary), Token/Economic (cross-handoff) |
| **v1 silent-kick attack** | State Machine (primary) |
| **Stale 48-hour comment** | Timing |
| **No close_config / GlobalConfig permanent** | State Machine, Upgrade/Admin |

### Contradictions / Tensions

| Area | Observation A | Observation B | Resolution |
|------|---------------|---------------|------------|
| v2 cancel_match config validation | State Machine: "v2 CancelMatch struct does NOT validate has_one = authority" | Access Control: "config has_one = authority widely applied" | Resolved: v2's CancelMatch correctly omits has_one because both authority AND any depositor-after-timeout can call it; authority check happens in instruction body via `caller == config.authority`. NOT a vulnerability. |
| Per-match snapshot scope | Token/Economic: "v2 mitigates fee redirect via snapshot" | Upgrade/Admin: "snapshot only protects in-flight; new matches use new BPS" | Both true — snapshot is half-mitigation. Document accurately. |

---

**This document synthesizes 7 parallel context audits + 1 archived prior audit + 1 quality gate validation.**
**It is the foundation for `.audit/STRATEGIES.md` (Phase 3 attack hypothesis generation).**
