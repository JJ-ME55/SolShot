# Token & Economic Analysis

<!-- CONDENSED_SUMMARY_START -->

## Condensed Summary

### Protocol Economics

SolShot Escrow is a pure SOL escrow for 1v1 wagered matches. No SPL tokens, no liquidity pools, no oracle-driven pricing, no share-based accounting. Economics are:
- **Deposit:** Each player deposits a fixed `wager_lamports` into a PDA (system_program::transfer CPI).
- **Settlement:** Authority-only. Pot = 2 x wager. Split: 90% winner, 7% treasury, 3% ops. BPS math uses u128 widening. Remainder (dust) goes to winner.
- **Cancellation/Refund:** Each depositing player receives exact `wager_lamports` back. No fees deducted.
- **Rent:** PDA rent paid by authority at creation; reclaimed by authority (settle), caller (cancel), or anyone (permissionless reclaim after 48h).

### Key Findings

1. **Fee calculation is arithmetically sound.** u128 widening prevents overflow. Remainder-to-winner prevents dust loss. BPS constants are hardcoded (immutable without upgrade). Min wager (10,000 lamports) guarantees both treasury and ops fees >= 1 lamport at current BPS rates. Verified across min/max/pathological wager values.

2. **update_config lacks re-validation of address distinctness.** `initialize_config` enforces authority != treasury != ops, but `update_config` (lines 70-88) applies changes without re-checking. Authority could set treasury == ops (settlement would fail due to constraint at line 588), treasury == authority (fee redirection), or ops to a program address (settlement DoS). This is an observation for Access Control focus.

3. **Authority has total economic control.** Server authority is sole winner selector, sole match creator (in practice), and can change all fee destinations instantly via update_config. No timelock, no multisig. Combined with OC-06 (authority cannot be player), the authority cannot directly steal deposited funds, but can always choose which player wins and redirect all fees to controlled addresses.

4. **create_match is not authority-gated.** Any signer can call it (no `has_one = authority` on config in CreateMatch struct). However, settle_match requires BOTH escrow.authority and config.authority to match the signer. So matches created by non-authority are unsettleable by the config authority, making them economically useless (they time out to cancellation). Spam creates an economic nuisance (PDA space usage) but the spammer loses rent.

5. **Flash loan immunity.** Protocol has no price-dependent calculations, no pool-based pricing, no share accounting, no reward distribution. Flash loans cannot manipulate any economic invariant.

6. **overflow-checks = true in Cargo.toml release profile.** This makes native Rust arithmetic panic on overflow (instead of wrapping), providing defense-in-depth beyond checked_* methods.

### Critical Economic Invariants

| Invariant | Where Enforced | Status |
|-----------|---------------|--------|
| total_distributed <= total_pot (no minting) | Lines 270-274: winner = pot - treasury - ops | HOLDS |
| winner_amount + treasury_amount + ops_amount == total_pot | Lines 253-274: remainder strategy | HOLDS (modulo rounding always in protocol's favor) |
| Each player deposits exactly wager_lamports, refunded exactly wager_lamports | Lines 179-188 (deposit), 358-367 (refund) | HOLDS |
| Fees are >= 1 lamport per fee recipient | MIN_WAGER=10,000, minimum treasury=1,400, minimum ops=600 | HOLDS |
| No value extraction beyond designed paths | All lamport movements in 5 instructions only | HOLDS |

### Cross-Focus Handoffs

- **Access Control:** update_config missing distinctness re-validation; create_match not authority-gated; authority as sole winner selector (centralization risk)
- **Arithmetic:** `as u64` narrowing casts on lines 260, 265, 267 are safe ONLY because MAX_WAGER bounds the domain; if MAX_WAGER increases, these casts need re-analysis
- **Timing:** Settlement deadline (1h) + cancel timeout (24h) + permissionless reclaim (48h) create economic forcing functions; authority non-settlement griefing possible within these windows
- **State Machine:** Terminal state-before-transfer pattern (OC-10) prevents economic re-entry; `close` attribute handles rent sweep

<!-- CONDENSED_SUMMARY_END -->

---

## Executive Summary

The SolShot Escrow program implements a straightforward 1v1 wagering system using native SOL (lamports). The economic model is intentionally simple: two players each deposit a fixed wager, the server authority designates a winner, and the pot is split 90/7/3 (winner/treasury/ops) using basis-point math with u128 widening.

From a token and economic perspective, the program demonstrates strong defensive design: all arithmetic is checked, the fee calculation uses a remainder-to-winner strategy that eliminates dust loss, wager bounds prevent both too-small fees and too-large escrows, and the protocol is entirely immune to flash loan attacks due to the absence of pool-based pricing or oracle-dependent calculations.

The primary economic risks are centralization concerns rather than code-level vulnerabilities: the server authority has unilateral power over winner selection and fee destination addresses, with no timelock or multisig requirement on configuration changes. The update_config function lacks the distinctness re-validation present in initialize_config, creating a potential fee destination manipulation path for a compromised authority.

## Scope

- **Files analyzed:** `programs/solshot-escrow/src/lib.rs` (855 lines), `Cargo.toml` (workspace + program)
- **Functions analyzed:** `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim`
- **Constants analyzed:** `TREASURY_BPS`, `OPS_BPS`, `BPS_DENOMINATOR`, `MIN_WAGER_LAMPORTS`, `MAX_WAGER_LAMPORTS`, `TIMEOUT_SECONDS`, `PERMISSIONLESS_RECLAIM_TIMEOUT`, `SETTLEMENT_TIMEOUT_SECONDS`
- **Estimated coverage:** 100% of on-chain economic logic

## Key Mechanisms

### Fee Calculation (BPS Math)

**Location:** `lib.rs:252-274`

**Purpose:**
Calculate the 90/7/3 split of the total pot between winner, treasury, and ops.

**How it works:**
1. Line 253-255: `total_pot_128 = (wager_lamports as u128).checked_mul(2)` -- widens to u128 BEFORE multiplication to prevent overflow at max wager (100 SOL x 2 = 200 SOL = 200,000,000,000 lamports; 200e9 x 700 = 1.4e14 which would overflow u64 but is safe in u128)
2. Lines 257-260: `treasury_amount = (total_pot_128.checked_mul(TREASURY_BPS as u128)? / BPS_DENOMINATOR as u128) as u64` -- BPS numerator product is in u128, division produces a value that fits in u64 given current MAX_WAGER
3. Lines 262-265: Same pattern for `ops_amount` with OPS_BPS=300
4. Line 267: `total_pot = total_pot_128 as u64` -- safe because max value is 200e9 which fits in u64
5. Lines 270-274: `winner_amount = total_pot.checked_sub(treasury_amount)?.checked_sub(ops_amount)?` -- remainder strategy ensures winner_amount + treasury_amount + ops_amount == total_pot exactly

**Assumptions:**
- MAX_WAGER_LAMPORTS (100e9) bounds the domain such that `as u64` narrowing casts are safe after division by BPS_DENOMINATOR
- BPS_DENOMINATOR is 10,000 (standard basis point denominator)
- Treasury BPS + Ops BPS = 1,000 (10%), leaving 9,000 BPS (90%) for winner
- Integer division truncates toward zero; truncation on fees means protocol never over-distributes

**Invariants:**
- winner_amount + treasury_amount + ops_amount == total_pot (enforced by remainder strategy)
- treasury_amount >= 1 lamport when MIN_WAGER >= 10,000 and TREASURY_BPS >= 1
- ops_amount >= 1 lamport when MIN_WAGER >= 10,000 and OPS_BPS >= 1
- No value is created (all outputs come from deposited lamports)

**Concerns:**
- Line 260: `as u64` narrowing cast -- safe given current MAX_WAGER. If MAX_WAGER increases beyond u64::MAX / 700 (~2.6e16 lamports = ~26 million SOL), the cast would truncate. This is far above the current 100 SOL limit.
- Line 265: Same concern for ops cast (threshold even higher at u64::MAX / 300).
- Line 267: `total_pot_128 as u64` -- safe when MAX_WAGER <= u64::MAX / 2. Current MAX_WAGER of 100e9 is far below.
- The division on lines 260 and 265 is NOT checked (uses native `/`). However, BPS_DENOMINATOR is a non-zero constant (10,000), so division by zero is impossible.

### Wager Deposit (System Transfer CPI)

**Location:** `lib.rs:156-222`

**Purpose:**
Transfer exactly `wager_lamports` from each player's wallet to the escrow PDA via System Program CPI.

**How it works:**
1. Lines 160-161: Read `wager` and `match_id` from escrow BEFORE any mutable borrow
2. Lines 163-176: Validate state (AwaitingDeposits), player identity, not-already-deposited
3. Lines 179-188: `system_program::transfer(CpiContext::new(...), wager)` -- CPI to System Program
4. Lines 191-197: Mutable borrow to update deposit flags
5. Lines 206-219: If both deposited, transition to Active, set activated_at, emit MatchActive

**Assumptions:**
- Player has sufficient lamports to cover wager + transaction fees
- System Program transfer is atomic and correct (trusted system program)
- `wager_lamports` was validated at create_match time (MIN <= wager <= MAX)
- The CPI context correctly transfers FROM player TO escrow PDA

**Invariants:**
- Post-deposit: escrow PDA balance increased by exactly `wager_lamports`
- Post-deposit: player balance decreased by exactly `wager_lamports` (plus transaction fees)
- Each player deposits at most once (enforced by player_X_deposited boolean flags)
- Total pot = 2 x wager_lamports when both have deposited

**Concerns:**
- Line 187: The `wager` variable is a copy of `ctx.accounts.escrow.wager_lamports` from line 160. Between reading and CPI, the escrow account is not mutated, so this is safe. But this read-before-borrow pattern is a Rust-specific idiom that must be maintained in any refactoring.

### Settlement Distribution (Direct Lamport Transfer)

**Location:** `lib.rs:276-291`

**Purpose:**
Move calculated amounts from escrow PDA to winner, treasury, and ops accounts via direct lamport manipulation.

**How it works:**
1. Lines 277-280: Set state to `Settled` BEFORE transfers (OC-10 defense-in-depth)
2. Lines 284-285: Deduct winner_amount from escrow, credit to winner
3. Lines 287-288: Deduct treasury_amount from escrow, credit to treasury
4. Lines 290-291: Deduct ops_amount from escrow, credit to ops
5. After all explicit transfers, escrow has exactly rent remaining
6. Anchor's `close = authority` (line 566) then sweeps rent to authority

**Assumptions:**
- `try_borrow_mut_lamports()` succeeds on all accounts (they are all marked `mut`)
- No account is on the reserved account list or executable (which would cause write-demotion per EP-106)
- winner, treasury, and ops are distinct accounts (enforced by constraints)
- The escrow PDA has sufficient lamports (total_pot + rent) to cover all transfers

**Invariants:**
- Post-settlement: escrow balance = rent_exempt_minimum (total_pot was distributed)
- Post-settlement: no more operations possible (state = Settled, terminal)
- Total outflow from escrow = winner_amount + treasury_amount + ops_amount = total_pot

**Concerns:**
- Lines 284-291: Direct lamport manipulation (not CPI). If any `try_borrow_mut_lamports()` fails, the transaction fails atomically (all-or-nothing). Partial success is impossible because Solana transactions are atomic.
- EP-106 risk: If winner/treasury/ops were executable or reserved accounts, write would fail. Winner is constrained to player_one/player_two (who must sign to deposit, so they hold private keys and are not programs). Treasury/ops are set by authority via config and could theoretically be set to program addresses via update_config. This would cause settlement DoS (not theft).

### Wager Refund (Cancel/Reclaim)

**Location:** `lib.rs:351-367` (cancel_match), `lib.rs:413-428` (permissionless_reclaim)

**Purpose:**
Return deposited wagers to players. No fees deducted on cancellation/refund.

**How it works:**
1. Set state to Cancelled BEFORE transfers (OC-10)
2. If player_one_deposited: transfer wager_lamports from escrow to player_one
3. If player_two_deposited: transfer wager_lamports from escrow to player_two
4. Anchor `close` sweeps remaining rent to caller

**Assumptions:**
- Each player receives exactly their deposited amount (no fee on refund)
- Player accounts match escrow records (enforced by constraints on player_one/player_two)

**Invariants:**
- Post-refund: each depositing player receives exactly wager_lamports
- Post-refund: escrow balance = rent (all wagers refunded)
- No fees collected on cancellation/refund

**Concerns:**
- If only one player deposited: only one refund occurs. Escrow holds wager_lamports + rent. After one refund, rent remains. Anchor `close` sweeps it. The non-depositing player gets nothing (correct -- they deposited nothing).
- If neither deposited: no refunds needed. Escrow holds only rent. Anchor `close` sweeps it.

### Wager Bounds Enforcement

**Location:** `lib.rs:119-123` (in create_match)

**Purpose:**
Ensure wager amount is within safe economic bounds.

**How it works:**
1. Line 120: `require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall)` -- 10,000 lamports minimum
2. Line 123: `require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge)` -- 100 SOL maximum

**Assumptions:**
- MIN_WAGER_LAMPORTS (10,000) ensures both fee amounts are >= 1 lamport with current BPS rates
- MAX_WAGER_LAMPORTS (100e9) bounds the domain for u128/u64 cast safety

**Invariants:**
- 10,000 <= wager_lamports <= 100,000,000,000 for all matches
- At MIN: treasury = 1,400 lamports, ops = 600 lamports (both > 0)
- At MAX: total_pot = 200e9, max intermediate product = 1.4e14 (fits u128, post-division fits u64)

**Concerns:**
- MIN_WAGER comment says "ensures both fees are at least 1 lamport" (OC-08). Verification: min_pot = 20,000. treasury = 20,000 x 700 / 10,000 = 1,400. ops = 20,000 x 300 / 10,000 = 600. Both > 0. Correct.
- If TREASURY_BPS or OPS_BPS were changed (requires program upgrade since constants are hardcoded), the MIN_WAGER would need recalculation. For fee >= 1 lamport: min_pot >= ceil(10,000 / BPS). With current min_pot = 20,000 and BPS = 300 (lowest), floor(20,000 x 300 / 10,000) = 600 >= 1.

### Config Update (Fee Destination Management)

**Location:** `lib.rs:70-88`

**Purpose:**
Allow the authority to update fee destination addresses (treasury, ops) and rotate the authority key itself.

**How it works:**
1. Lines 76-86: If `new_authority`, `new_treasury`, or `new_ops` is `Some(pubkey)`, overwrite the corresponding config field
2. No validation on the new values (no distinctness check, no blacklist check)
3. Protected by `has_one = authority` on UpdateConfig struct (line 470)

**Assumptions:**
- Authority is trusted to set valid, distinct addresses
- No re-validation that authority != treasury != ops after updates
- One-step authority transfer (no pending + accept pattern)

**Invariants:**
- NONE explicitly enforced on update. The distinctness invariant from initialize_config is NOT re-checked.

**Concerns:**
- Authority could set treasury = ops: settlement would fail (line 588 constraint: treasury != ops). This is a liveness issue.
- Authority could set treasury = authority's own address: fees go to authority. This is fee redirection (centralization risk, relates to EP-119).
- Authority could set treasury/ops to an executable account: settlement would fail (EP-106). Liveness issue.
- One-step authority transfer: if authority sets new_authority to a wrong address, the authority is permanently locked out. No recovery mechanism.
- No timelock: config changes are instant. No delay for players to exit before fee changes take effect.

## Trust Model

| Entity | Trust Level | Economic Powers |
|--------|------------|-----------------|
| Config Authority (server) | FULL | Create matches, choose winner, settle, cancel (AwaitingDeposits only), set fee destinations, pause/unpause |
| Players | LIMITED | Deposit wager, cancel (immediate in AwaitingDeposits, after 24h in Active) |
| Permissionless Caller | NONE (by design) | Reclaim after 48h (receives PDA rent as incentive) |
| System Program | TRUSTED (system) | Execute SOL transfers via CPI |
| Clock Sysvar | TRUSTED (system) | Provide timestamps for deadline enforcement |

**Key trust assumption:** The server authority is honest in selecting the correct winner. No on-chain verification of game outcomes exists. This is fundamental to the protocol design (server-authoritative gaming) and cannot be mitigated on-chain without a verifiable game execution layer.

## State Analysis

### State Read in Economic Operations

| State Field | Read By | Economic Relevance |
|-------------|---------|-------------------|
| `escrow.wager_lamports` | deposit_wager, settle_match, cancel_match, permissionless_reclaim | Determines all transfer amounts |
| `escrow.player_one_deposited` | deposit_wager (guard), cancel_match (refund routing), permissionless_reclaim (refund routing) | Determines who gets refunded |
| `escrow.player_two_deposited` | Same as above | Same as above |
| `escrow.state` | All match instructions | Guards against invalid economic operations |
| `config.treasury` | settle_match (via constraint) | Validates treasury recipient |
| `config.ops` | settle_match (via constraint) | Validates ops recipient |
| `config.is_paused` | create/deposit/settle/cancel | Blocks all economic operations when paused |

### State Written in Economic Operations

| State Field | Written By | Economic Effect |
|-------------|-----------|----------------|
| `escrow.state = Active` | deposit_wager (line 207) | Enables settlement |
| `escrow.state = Settled` | settle_match (line 279) | Prevents re-settlement |
| `escrow.state = Cancelled` | cancel_match (line 354), permissionless_reclaim (line 416) | Prevents re-cancellation |
| `escrow.activated_at` | deposit_wager (line 209) | Sets timeout reference for settlement deadline |
| `escrow.player_X_deposited = true` | deposit_wager (lines 194, 196) | Prevents double-deposit |
| `config.treasury` | update_config | Changes fee destination |
| `config.ops` | update_config | Changes fee destination |

## Dependencies

- **anchor_lang::system_program** -- System Program CPI for deposit transfers (line 5, used at line 179)
- **anchor_lang::prelude::Clock** -- Timestamp access for deadline enforcement (lines 140, 209, 241, 333, 409)
- **No SPL Token dependency** -- All value transfer is native SOL (lamports)
- **No oracle dependency** -- No external price data

## Focus-Specific Analysis

### Token Flow Diagram

```
DEPOSIT PHASE (per player):
  Player Wallet --[wager_lamports]--> Escrow PDA  (system_program::transfer CPI)

SETTLEMENT (authority-only):
  Escrow PDA --[winner_amount = pot - treasury_fee - ops_fee]--> Winner Account   (direct lamport)
  Escrow PDA --[treasury_amount = pot * 700 / 10000]--> Treasury Account          (direct lamport)
  Escrow PDA --[ops_amount = pot * 300 / 10000]--> Ops Account                    (direct lamport)
  Escrow PDA --[rent_lamports]--> Authority  (Anchor close)

CANCELLATION/REFUND:
  Escrow PDA --[wager_lamports]--> Player One (if deposited)  (direct lamport)
  Escrow PDA --[wager_lamports]--> Player Two (if deposited)  (direct lamport)
  Escrow PDA --[rent_lamports]--> Caller  (Anchor close)

PERMISSIONLESS RECLAIM (48h):
  Escrow PDA --[wager_lamports]--> Player One (if deposited)  (direct lamport)
  Escrow PDA --[wager_lamports]--> Player Two (if deposited)  (direct lamport)
  Escrow PDA --[rent_lamports]--> Any Caller  (Anchor close = DCA-02 incentive)
```

### Fee Analysis

| Fee | Formula | Rounding Direction | Recipient | Can Destination Change? | Can Rate Change? |
|-----|---------|-------------------|-----------|------------------------|-----------------|
| Treasury (7%) | `(pot_u128 * 700 / 10000) as u64` | Truncate (toward zero, favors winner) | `config.treasury` | Yes, via `update_config` (no timelock) | No (hardcoded constant, requires upgrade) |
| Ops (3%) | `(pot_u128 * 300 / 10000) as u64` | Truncate (toward zero, favors winner) | `config.ops` | Yes, via `update_config` (no timelock) | No (hardcoded constant, requires upgrade) |
| Winner (90%) | `pot - treasury - ops` (remainder) | N/A (gets remainder = exact) | player_one or player_two | No (constrained at instruction level) | No (computed as remainder) |

**Rounding direction analysis:** Truncation on treasury and ops fees means the protocol slightly under-collects fees. The winner receives the remainder, which may be 1-2 lamports more than exactly 90%. This is the correct direction: the protocol never distributes more than the pot. The winner is favored, which is acceptable in a wagering context.

**Minimum fee verification at MIN_WAGER (10,000 lamports per player):**
- total_pot = 20,000
- treasury = floor(20,000 * 700 / 10,000) = 1,400 lamports
- ops = floor(20,000 * 300 / 10,000) = 600 lamports
- winner = 20,000 - 1,400 - 600 = 18,000 lamports
- All amounts > 0. Sum = 20,000. Correct.

**Maximum fee verification at MAX_WAGER (100 SOL = 100,000,000,000 lamports per player):**
- total_pot = 200,000,000,000
- treasury = floor(200e9 * 700 / 10,000) = 14,000,000,000 lamports (14 SOL)
- ops = floor(200e9 * 300 / 10,000) = 6,000,000,000 lamports (6 SOL)
- winner = 200e9 - 14e9 - 6e9 = 180,000,000,000 lamports (180 SOL)
- All amounts fit in u64. Sum = 200e9. Correct.

**Pathological case (non-clean BPS division, wager = 10,001):**
- total_pot = 20,002
- treasury = floor(20,002 * 700 / 10,000) = floor(14,001,400 / 10,000) = 1,400
- ops = floor(20,002 * 300 / 10,000) = floor(6,000,600 / 10,000) = 600
- winner = 20,002 - 1,400 - 600 = 18,002
- Sum = 20,002. Correct. 2 lamports of rounding "dust" go to winner.

### Economic Invariant List

1. **Conservation of value:** Total lamports distributed (winner + treasury + ops) == total lamports deposited (2 * wager_lamports). No value created or destroyed.
   - **Enforced at:** Lines 270-274 (remainder strategy ensures equality)
   - **Verified:** At all wager values in [MIN, MAX], integer division truncation means treasury + ops <= floor(pot * 1000 / 10000) and winner = pot - treasury - ops, so sum is exactly pot.

2. **Non-negative fees:** Treasury and ops fees are always >= 1 lamport for any valid wager.
   - **Enforced at:** Line 120 (MIN_WAGER >= 10,000) combined with BPS constants
   - **Proof:** min_treasury = floor(20,000 * 700 / 10,000) = 1,400 > 0. min_ops = floor(20,000 * 300 / 10,000) = 600 > 0.

3. **No double-spend on deposits:** Each player can deposit at most once per match.
   - **Enforced at:** Lines 173, 175 (player_X_deposited boolean check before deposit)

4. **Exact refund on cancellation:** Each player receives exactly their deposited wager, no more, no less.
   - **Enforced at:** Lines 358-366, 420-428 (conditional refund of `wager_lamports` per depositing player)

5. **Fee destinations match config:** Settlement recipients are validated against GlobalConfig.
   - **Enforced at:** Lines 587 (treasury == config.treasury), 596 (ops == config.ops)

6. **No stuck funds:** Every escrow eventually resolves via settlement, cancellation, or permissionless reclaim.
   - **Enforced by:** Three-tier timeout (1h settlement expiry, 24h player cancel, 48h permissionless reclaim)

7. **Winner is a registered player:** Settlement can only send the winner's share to player_one or player_two.
   - **Enforced at:** Lines 577-578 (Anchor constraint: winner.key() == escrow.player_one || == escrow.player_two)

### Flash Loan Impact Analysis

| Economic Operation | Flash Loan Vulnerable? | Reason |
|-------------------|----------------------|--------|
| deposit_wager | No | Fixed wager amount, no price calculation, no share minting |
| settle_match | No | Fixed BPS split, no external price input, authority-controlled |
| cancel_match | No | Exact refund of deposited amount, no calculation |
| permissionless_reclaim | No | Exact refund, time-gated (48h minimum) |

**Analysis:** This protocol is entirely immune to flash loan attacks. There are no price-dependent calculations, no pool reserves to manipulate, no share-based accounting, and no oracle inputs. The only "calculation" is the deterministic BPS split of a known pot size. A flash loan could fund a deposit, but this provides no advantage -- the winner is decided by the server authority, not by any on-chain mechanism that could be manipulated.

### Value Extraction Matrix

**Legitimate value exits:**

| Path | Trigger | Amount | Recipient |
|------|---------|--------|-----------|
| Winner payout | settle_match | ~90% of pot | player_one or player_two |
| Treasury fee | settle_match | 7% of pot | config.treasury address |
| Ops fee | settle_match | 3% of pot | config.ops address |
| Player refund | cancel_match / permissionless_reclaim | exact wager per player | depositing player(s) |
| PDA rent reclaim (settle) | settle_match (Anchor close) | ~0.00143 SOL | config authority |
| PDA rent reclaim (cancel) | cancel_match (Anchor close) | ~0.00143 SOL | caller (authority or player) |
| PDA rent reclaim (reclaim) | permissionless_reclaim (Anchor close) | ~0.00143 SOL | any caller (DCA-02 incentive) |

**Potential attack value exits:**

| Path | Precondition | Amount | Mitigated By |
|------|-------------|--------|-------------|
| Authority awards wrong winner | Compromised server | 90% of pot (per match) | On-chain constraint: winner must be player_one or player_two (OC-02) |
| Authority redirects fees | update_config to self-controlled address | 10% of pot (per match) | No on-chain mitigation (centralization risk, relates to EP-119) |
| Authority colludes with player | Server + one player cooperate | 100% of pot across many matches | Off-chain monitoring (OC-11 events), game integrity systems |
| Authority DoS (non-settlement) | Authority ignores matches | Delays refund by up to 48h | Timeout system (24h cancel, 48h permissionless reclaim) |
| Match creation spam | Any signer creates matches | Spammer's rent (~0.00143 SOL per match) | Self-punishing (spammer pays rent, loses it to reclaimer after 48h) |

## Cross-Focus Intersections

| This Focus (Token/Economic) | Intersects With | Intersection Point |
|----------------------------|----------------|-------------------|
| Fee calculation arithmetic | Arithmetic | u128 widening, `as u64` casts, checked_* operations |
| Settlement authorization | Access Control | Authority as sole winner selector, has_one constraints |
| Fee destination management | Access Control / Admin | update_config without re-validation |
| Settlement/cancel timing | Timing | 1h/24h/48h deadline enforcement affects fund availability |
| State-before-transfer pattern | State Machine | OC-10 terminal state prevents economic re-entry |
| Direct lamport transfers | CPI | system_program::transfer for deposits, direct manipulation for settlements |

## Cross-Reference Handoffs

- **Access Control Agent:** update_config (lines 70-88) does not re-validate that authority, treasury, and ops remain distinct after updates. This could allow authority to set treasury = authority (fee redirection to self) or treasury = ops (settlement bricking). The Access Control agent should assess whether this lacks sufficient validation for a production deployment. Additionally, create_match (lines 510-531) is not gated by config authority -- any signer can create matches, though only matches where escrow.authority matches config.authority can be settled.

- **Arithmetic Agent:** The `as u64` narrowing casts on lines 260, 265, and 267 are safe ONLY because MAX_WAGER_LAMPORTS (100e9) bounds the domain. The Arithmetic agent should verify this bound is sufficient and document the maximum safe MAX_WAGER value for each cast. Specifically: line 260 is safe up to MAX_WAGER ~2.6e16 (26M SOL), line 265 up to ~6.1e16 (61M SOL), line 267 up to ~9.2e18 (9.2 billion SOL). Also, the native division on lines 260 and 265 (not `checked_div`) is safe only because BPS_DENOMINATOR is a non-zero constant.

- **State Machine Agent:** The terminal state-before-transfer pattern (OC-10) is critical for economic safety. The State Machine agent should verify that no code path can reach the lamport transfer lines (284-291, 358-366, 420-428) without first setting the terminal state. Also verify that Anchor's `close` attribute correctly handles the rent sweep after explicit lamport transfers have reduced the PDA balance.

- **Timing Agent:** The 1-hour settlement deadline (lines 236-244) creates an economic forcing function. If the authority cannot settle within 1 hour, the match enters a limbo state where it can only be cancelled (not settled). The Timing agent should assess whether this deadline is appropriate and whether Clock manipulation (+/- a few seconds) could affect settlement outcomes at the exact boundary. Additionally, verify that activated_at is always > 0 in Active state (line 236 has a defensive guard that skips the deadline check if activated_at == 0).

## Risk Observations

- **update_config lacks distinctness re-validation (lines 70-88):** initialize_config enforces authority != treasury != ops, but update_config applies Optional changes without re-checking this invariant. If authority sets config.treasury = config.ops via two separate updates, settle_match would fail due to the treasury != ops constraint (line 588), creating a liveness issue. If authority sets treasury = authority's own address, fees are redirected. This is a centralization concern, not a code bug, but the absence of re-validation is worth documenting for production readiness.

- **One-step authority transfer (line 79):** update_config immediately overwrites config.authority with no pending/accept pattern. If the new authority address is incorrect (typo, burned key), authority is permanently locked out. All economic operations requiring authority (settle, pause, unpause) become unavailable. Matches would be resolvable only via player cancel (24h) or permissionless reclaim (48h).

- **Create_match not config-authority-gated (lines 510-531):** The CreateMatch struct does not include `has_one = authority` on the config account. Any signer can call create_match. While matches created by non-authority signers are unsettleable (settle_match requires both escrow.authority AND config.authority to match), this allows anyone to create PDA accounts (burning their own rent) with arbitrary player_one/player_two values. These matches would time out and be reclaimable via permissionless_reclaim, but they consume PDA namespace during that window.

- **Authority as sole winner selector:** The protocol's economic model fundamentally trusts the server authority to honestly select winners. A compromised authority can extract value by always designating a colluding player as winner. On-chain constraints prevent authority from being a player (OC-06) and require the winner to be player_one or player_two (OC-02), but these do not prevent authority-player collusion.

- **Rent subsidy from authority to cancel callers:** The authority pays PDA rent at create_match (line 513: `payer = authority`). On cancellation, rent goes to `caller` (which may be a player, not the authority). This creates a small value transfer (~0.00143 SOL) from authority to player on every cancelled match. At scale, this could accumulate, but the amount is economically insignificant relative to wager sizes.

- **EP-106 risk on treasury/ops accounts (lines 287-291):** If config.treasury or config.ops is set to an executable account address (via update_config), the direct lamport transfers in settle_match would fail due to the Solana runtime's write-demotion on executable accounts. This would brick settlement for all Active matches until the config is corrected, forcing 24h/48h timeout resolution. Players are not harmed (they get refunds via cancel), but the protocol loses fee revenue.

## Novel Attack Surface Observations

- **Selective non-settlement griefing:** Because the authority decides WHEN to settle (within the 1h window) and because settlement is the only path that deducts fees, the authority could selectively not settle matches where the "undesired" player won. The match would then time out, and both players get refunded (no fees collected). This allows the authority to effectively "void" match outcomes without a visible on-chain authority action -- the match simply expires. Detection: monitor for matches that expire without settlement when they were clearly Active (both deposited). This is a novel griefing pattern unique to server-authoritative escrow with settlement deadlines. It is not detectable from the escrow program alone; off-chain monitoring of the MatchActive -> MatchCancelled event sequence (without an intervening MatchSettled) is needed.

- **Match ID collision for PDA denial-of-service:** Since match escrow PDAs are derived from `[b"match", match_id.as_bytes()]` and match_id is a string up to 32 characters, an attacker who knows upcoming match IDs could pre-create matching PDAs (since create_match is callable by anyone). The legitimate authority's create_match would then fail because the PDA already exists (Anchor `init` fails on existing accounts). The attacker's match would be unsettleable and eventually reclaimed, but the legitimate match is blocked until the PDA is freed (48h + reclaim). Mitigation: the server should use unpredictable match IDs (per MEMORY.md, the server already uses CSPRNG for room IDs). The risk is proportional to the predictability of match IDs.

## Questions for Other Focus Areas

- **For Access Control focus:** Is the absence of `has_one = authority` (linking to config.authority) in CreateMatch intentional? It means anyone can create matches. Was this a design decision (to allow future decentralization) or an oversight? The economic consequence is that non-authority-created matches waste PDA space and are unsettleable.

- **For Arithmetic focus:** The BPS division on lines 260 and 265 uses native `/` (not `checked_div`). While the divisor is a non-zero constant, should this be documented as an explicit exception to the "all arithmetic is checked" invariant (OC-09)?

- **For State Machine focus:** After Anchor's `close` attribute processes (zeroing data, transferring ownership to System Program), can the same PDA (same seeds `[b"match", match_id.as_bytes()]`) be re-initialized in a subsequent transaction? If so, is there a risk of re-initialization with different parameters that could affect pending off-chain state tracking?

- **For Timing focus:** The settlement deadline check on line 236 has a defensive guard: `if ctx.accounts.escrow.activated_at > 0`. The comment says "backward compat with matches created pre-OC-07." Is there a scenario where `activated_at == 0` in an Active state match (which would bypass the settlement deadline entirely)? In the current code, activated_at is set at line 209 when transitioning to Active, so it should always be > 0 for Active matches. But the Timing agent should verify this invariant holds.

## Raw Notes

### Concrete Arithmetic Verification

```
Wager: 10,000 (MIN)
  pot = 20,000
  treasury = floor(20,000 * 700 / 10,000) = 1,400
  ops = floor(20,000 * 300 / 10,000) = 600
  winner = 20,000 - 1,400 - 600 = 18,000
  SUM = 20,000 OK

Wager: 10,001
  pot = 20,002
  treasury = floor(20,002 * 700 / 10,000) = floor(14,001,400 / 10,000) = 1,400
  ops = floor(20,002 * 300 / 10,000) = floor(6,000,600 / 10,000) = 600
  winner = 20,002 - 1,400 - 600 = 18,002
  SUM = 20,002 OK (2 lamports rounding dust to winner)

Wager: 50,000,000 (0.05 SOL)
  pot = 100,000,000
  treasury = 7,000,000
  ops = 3,000,000
  winner = 90,000,000
  SUM = 100,000,000 OK

Wager: 100,000,000,000 (100 SOL / MAX)
  pot = 200,000,000,000
  treasury = 14,000,000,000
  ops = 6,000,000,000
  winner = 180,000,000,000
  SUM = 200,000,000,000 OK

Intermediate overflow check at MAX:
  200,000,000,000 * 700 = 140,000,000,000,000 (1.4e14)
  u64::MAX = 18,446,744,073,709,551,615 (1.8e19)
  1.4e14 < 1.8e19 -- fits in u64 AFTER division
  BUT 1.4e14 overflows u64 relative to BPS_DENOMINATOR only if...
  Actually: 1.4e14 fits in u64. The u128 widening prevents overflow in the
  intermediate step (total_pot_128 * TREASURY_BPS) which could be up to
  200e9 * 700 = 1.4e14 -- still fits u64 but u128 provides headroom.
  The real danger would be if MAX_WAGER were increased:
  At wager = u64::MAX / 2 = 9.2e18:
    pot = 1.8e19 (max u64)
    treasury intermediate = 1.8e19 * 700 = 1.29e22 (overflows u64!)
    u128 handles this safely
  So u128 widening is essential for safety at high wagers.
```

### Constants Cross-Reference

| Constant | Value | Line | Used In | Economic Purpose |
|----------|-------|------|---------|-----------------|
| TREASURY_BPS | 700 | 15 | settle_match (line 258) | 7% treasury fee |
| OPS_BPS | 300 | 16 | settle_match (line 263) | 3% ops fee |
| BPS_DENOMINATOR | 10,000 | 17 | settle_match (lines 260, 265) | Basis point divisor |
| MIN_WAGER_LAMPORTS | 10,000 | 29 | create_match (line 120) | Ensures fees >= 1 lamport |
| MAX_WAGER_LAMPORTS | 100,000,000,000 | 32 | create_match (line 123) | Bounds u128->u64 cast safety |
| TIMEOUT_SECONDS | 86,400 | 20 | cancel_match (line 330) | 24h player cancel window |
| PERMISSIONLESS_RECLAIM_TIMEOUT | 172,800 | 23 | permissionless_reclaim (line 405) | 48h permissionless reclaim |
| SETTLEMENT_TIMEOUT_SECONDS | 3,600 | 26 | settle_match (line 238) | 1h settlement deadline |

### Anchor Version Note

Program uses Anchor 0.32.1 (per `programs/solshot-escrow/Cargo.toml`). Workspace Cargo.toml has `overflow-checks = true` in release profile, meaning native Rust arithmetic would panic on overflow even without `checked_*` methods. This provides defense-in-depth but does not replace the need for checked arithmetic (panics are DoS vectors). The combination of `overflow-checks = true` AND `checked_*` methods means:
1. `checked_*` methods return errors (graceful failure)
2. If any unchecked arithmetic exists, it panics rather than wrapping (crash but no value corruption)
3. Both layers prevent silent overflow exploitation

### EP Pattern Relevance Assessment

| EP Pattern | Relevance | Assessment |
|-----------|-----------|------------|
| EP-015 (Integer Overflow) | ADDRESSED | All financial arithmetic uses checked_* methods; overflow-checks=true in release profile |
| EP-016 (Precision Loss in Division) | LOW | BPS math truncates toward zero; minimum wager ensures non-zero results |
| EP-019 (Rounding Direction) | ADDRESSED | Truncation on fees, remainder to winner -- protocol never over-distributes |
| EP-020 (Unsafe Type Casting) | BOUNDED | `as u64` casts are safe given current MAX_WAGER; safe threshold documented above |
| EP-051 (Token Account Owner) | N/A | No SPL tokens used |
| EP-054 (Token-2022 Transfer Fee) | N/A | No Token-2022 used |
| EP-058 (Flash Loan Price Manipulation) | N/A | No price calculations |
| EP-059 (Vault Donation Attack) | N/A | No share-based accounting |
| EP-060 (Missing Slippage Protection) | N/A | No swaps |
| EP-098 (CPI Destination Injection) | LOW | Treasury/ops validated against config; but config is authority-mutable |
| EP-099 (Business Logic Inversion) | LOW | Fee split is simple subtraction-from-remainder; hard to invert |
| EP-105 (Fee Exclusion from Accounting) | LOW | No internal balance tracking beyond deposit flags; fees computed at settlement from pot |
| EP-106 (Lamport Write-Demotion) | MEDIUM | Direct lamport transfers to UncheckedAccounts in settle_match could fail if recipient is executable/reserved |
| EP-109 (LP Deposit Rounding Drain) | N/A | No LP deposits or share minting |
| EP-116 (Vault Share Donation) | N/A | No share-based accounting |
| EP-119 (Fee Destination Hijacking) | MEDIUM | update_config allows authority to change treasury/ops instantly, no timelock; relates to centralization risk |

### Rent Economics Detail

```
MatchEscrow account space: 168 bytes
Rent-exempt minimum (approx): Rent::get()?.minimum_balance(168)
At current Solana rent rate: ~0.00143 SOL (1,430,400 lamports approx)

PDA lifecycle rent flow:
  CREATE: authority pays ~0.00143 SOL rent
  DEPOSIT: no rent change (wager_lamports added on top of rent)
  SETTLE: explicit transfers remove total_pot; rent remains; Anchor close sweeps to authority
  CANCEL: explicit refunds remove wager(s); rent remains; Anchor close sweeps to caller
  RECLAIM: same as cancel; Anchor close sweeps to any caller (DCA-02 incentive)

Net rent cost to authority per settled match: 0 (rent paid at create, recovered at settle)
Net rent cost to authority per cancelled match: ~0.00143 SOL (rent paid at create, swept to caller)
```
