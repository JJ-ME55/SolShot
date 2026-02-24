# Attack Strategy Catalog

**Project:** SolShot Escrow (solshot-escrow)
**Generated:** 2026-02-23
**Total Strategies:** 30 (Quick Tier)

---

## Strategy Generation Sources

This catalog was generated from:
- 6 focus area context analyses (Access Control, Arithmetic, State Machine, CPI/External, Token/Economic, Timing/Ordering)
- ARCHITECTURE.md unified synthesis
- 128 Solana exploit patterns (EP-001 through EP-128)
- Audit firm findings and bug bounty disclosures

---

## Strategy Index by Priority

### Tier 1 — CRITICAL potential (5 strategies)
- H001: One-Step Authority Transfer Takeover
- H002: Fee Destination Hijack via update_config
- H003: update_config Distinctness Bypass → Settlement DoS
- H004: Same-Transaction PDA Close-and-Revive
- H005: Authority Winner Selection Fraud

### Tier 2 — HIGH potential (12 strategies)
- H006: 23-Hour Dead Zone Fund Lockup Griefing
- H007: Pause-as-Griefing Attack on Active Matches
- H008: CreateMatch PDA Occupancy DoS
- H009: Executable Account as Fee Destination (Silent Lamport Loss)
- H010: Deposit Ordering Asymmetry Exploitation
- H011: Config Treasury Self-Redirect
- H012: Lamport Underflow on Cancel/Reclaim
- H013: PDA Rent Extraction at Low Wagers
- H014: Authority Collusion — Settle to Controlled Winner Wallet
- H015: Concurrent Double-Deposit by Same Player
- H016: AwaitingDeposits → Cancel Without Depositing (Rent Theft)
- H017: Config State Read During Same-TX Mutation

### Tier 3 — MEDIUM-LOW potential (13 strategies)
- H018: ZeroWager Dead Code Exploitation
- H019: Narrowing Cast Overflow at Hypothetical MAX_WAGER Increase
- H020: Clock Drift Exploitation at Settlement Deadline
- H021: Permissionless Reclaim During Active Pause
- H022: GlobalConfig Re-Initialization
- H023: PDA Account Revival After Close
- H024: Settlement Deadline Bypass via activated_at Path
- H025: Match ID Collision for PDA Hijack
- H026: Escrow PDA Lamport Inflation (Donation Attack)
- H027: Authority Self-Play Bypass (OC-06)
- H028: BPS Constant Manipulation via Upgrade
- H029: Error Propagation in try_borrow_mut_lamports Chain
- H030: Cancel from AwaitingDeposits Refund Logic

---

## Strategy Definitions

---

## H001: One-Step Authority Transfer Takeover

**Category:** Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** EP-068 (Key Management — Raydium $4.4M, Pump.fun $1.9M, Step Finance $30-40M)
**Origin:** KB (EP-068)
**Requires:** [access-control-findings, state-machine-findings]

### Hypothesis

An attacker who compromises the authority private key can immediately and irreversibly transfer authority to their own address via `update_config`, with no propose/accept pattern, timelock, or multisig requirement. Once transferred, the attacker controls all protocol operations.

### Attack Vector

1. Attacker compromises authority key (phishing, malware, leaked key)
2. Attacker calls `update_config` with `new_authority = Some(attacker_pubkey)`
3. Authority transfer is immediate — no delay, no second confirmation
4. Attacker now controls: settlement (winner selection), fee destinations, pause/unpause
5. Attacker settles all active matches to controlled wallets, redirects fees, pauses protocol

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | Authority transfer logic |
| `lib.rs` | `UpdateConfig` struct | 456-475 | Account validation |

### Potential Impact

**Severity if confirmed:** CRITICAL

- Financial: Total TVL at risk (all active match escrows + future deposits)
- Users affected: All active players
- Protocol state: Complete protocol takeover

### Investigation Approach

1. **Check:** Does update_config have a propose/accept pattern for authority changes?
   - Look for: Two-step transfer, timelock, or multisig requirement
   - In: `lib.rs:70-88`
2. **Check:** Can the authority transfer be reversed by the old authority?
   - Look for: Any recovery mechanism or grace period
   - In: `lib.rs` (all instructions)
3. **Determine:**
   - Vulnerable if: Single call transfers authority immediately
   - Safe if: Two-step transfer or timelock exists

---

## H002: Fee Destination Hijack via update_config

**Category:** Access Control, Token/Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** EP-119 (UncheckedAccount fee destination — Raydium CP-Swap), EP-098 (rebalance/compound destination)
**Origin:** KB (EP-119)
**Requires:** [access-control-findings, token-economic-findings]

### Hypothesis

A compromised or malicious authority can redirect all settlement fees to attacker-controlled addresses by calling `update_config` to change treasury and ops addresses. No timelock or validation prevents this.

### Attack Vector

1. Attacker gains authority access (or authority acts maliciously)
2. Calls `update_config` with `new_treasury = Some(attacker_wallet1)`, `new_ops = Some(attacker_wallet2)`
3. All subsequent `settle_match` calls send 10% of pot to attacker wallets
4. Players receive correct 90% — attack may go unnoticed

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | Config change logic |
| `lib.rs` | `settle_match` | 284-291 | Fee distribution |

### Potential Impact

**Severity if confirmed:** CRITICAL

- Financial: 10% of all settled match pots (7% treasury + 3% ops)
- Users affected: All players (indirectly — winner amounts correct, but protocol revenue stolen)
- Protocol state: Ongoing fee drain until detected

### Investigation Approach

1. **Check:** Are treasury/ops changes subject to any delay or validation?
   - Look for: Timelock, distinctness check, non-executable validation
   - In: `lib.rs:70-88`
2. **Check:** Is there any monitoring/event that would reveal the change?
   - Look for: Anchor events or logs on config changes
   - In: `lib.rs:70-88`
3. **Determine:**
   - Vulnerable if: Immediate treasury/ops update with no delay
   - Safe if: Timelock or governance approval required

---

## H003: update_config Distinctness Bypass → Settlement DoS

**Category:** Access Control, State Machine
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** EP-033 (Logic/State Machine — invalid state transitions)
**Origin:** KB (EP-033)
**Requires:** [access-control-findings, state-machine-findings]

### Hypothesis

The `update_config` function does not re-validate that authority, treasury, and ops addresses are distinct (unlike `initialize_config`). Setting treasury == ops could cause settlement to fail (Anchor constraint requiring distinct writable accounts), permanently blocking settlement of all active matches.

### Attack Vector

1. Authority calls `update_config(new_treasury = Some(X), new_ops = Some(X))` where X is the same address
2. `settle_match` passes treasury and ops as separate `UncheckedAccount` but both resolve to the same pubkey
3. Anchor may reject the transaction because two writable accounts have the same key, or runtime may error on double borrow
4. All settlement becomes impossible; matches can only be cancelled after 24h timeout

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | Missing distinctness validation |
| `lib.rs` | `initialize_config` | 35-55 | Has distinctness check (compare) |
| `lib.rs` | `SettleMatch` struct | 576-600 | treasury and ops as separate accounts |

### Potential Impact

**Severity if confirmed:** CRITICAL

- Financial: All active escrows locked until timeout (24h minimum)
- Users affected: All active players (delayed refunds)
- Protocol state: Settlement permanently broken until config fixed

### Investigation Approach

1. **Check:** Does update_config enforce authority ≠ treasury ≠ ops?
   - Look for: `require!()` with `!=` checks
   - In: `lib.rs:70-88`
2. **Check:** What happens in settle_match if treasury == ops?
   - Look for: Anchor constraint behavior with duplicate writable accounts
   - In: `lib.rs:576-600` (SettleMatch struct)
3. **Determine:**
   - Vulnerable if: No distinctness check in update_config AND settle fails with duplicate accounts
   - Safe if: Either update_config validates or settle handles duplicates gracefully

---

## H004: Same-Transaction PDA Close-and-Revive

**Category:** State Machine
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** EP-036 (Account close without ownership transfer), EP-040 (close without constraint)
**Origin:** Novel
**Requires:** [state-machine-findings, access-control-findings]

### Hypothesis

If `settle_match` or `cancel_match` closes the escrow PDA (via Anchor's `close` attribute) and returns rent to a recipient, an attacker could include a `create_match` instruction in the same transaction to re-create the PDA at the same address, potentially extracting rent multiple times or resetting match state.

### Attack Vector

1. Attacker constructs a transaction with: [settle_match (closes PDA)] → [create_match (same match_id)]
2. settle_match distributes funds and closes account
3. create_match re-creates the PDA at the same address (same seeds)
4. New escrow has fresh state, potentially allowing new deposits into a "ghost" match

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `settle_match` | 277-305 | Account close via Anchor `close` |
| `lib.rs` | `create_match` | 110-152 | PDA initialization with `init` |
| `lib.rs` | `SettleMatch` struct | 576-600 | `close = authority` attribute |
| `lib.rs` | `CreateMatch` struct | 500-530 | `init` attribute on escrow |

### Potential Impact

**Severity if confirmed:** CRITICAL

- Financial: Rent extraction, potential state confusion leading to double payouts
- Users affected: Match participants
- Protocol state: PDA reuse creates inconsistent state

### Investigation Approach

1. **Check:** Does Anchor's `init` constraint prevent re-initialization of a closed account in the same TX?
   - Look for: Anchor `init` behavior with same-TX close/reopen
   - In: Anchor framework behavior
2. **Check:** Are the PDA seeds dependent on any data that changes between close and re-create?
   - Look for: match_id reuse potential
   - In: `lib.rs:500-530` (CreateMatch seeds)
3. **Determine:**
   - Vulnerable if: Same-TX PDA revival is possible with `init`
   - Safe if: Anchor prevents re-initialization of recently-closed accounts in same TX

---

## H005: Authority Winner Selection Fraud

**Category:** Token/Economic, Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel (game-specific centralization)
**Origin:** Novel
**Requires:** [token-economic-findings, access-control-findings]

### Hypothesis

The authority has unchecked power to select any winner in `settle_match`. A compromised or colluding authority could systematically select a controlled wallet as the winner, extracting 90% of all match pots.

### Attack Vector

1. Authority (or compromised server) creates matches via `create_match`
2. Legitimate players deposit wagers
3. Authority always calls `settle_match` with `winner = controlled_wallet`
4. Controlled wallet receives 90% of pot for every match
5. Combined with H002 (fee redirect), attacker gets 100% of all deposited funds

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `settle_match` | 228-305 | Winner parameter and constraint |
| `lib.rs` | `SettleMatch` struct | 576-600 | Winner account validation |

### Potential Impact

**Severity if confirmed:** CRITICAL

- Financial: 90% of all match pots (up to 200 SOL per match at max wager)
- Users affected: All players (always lose)
- Protocol state: Ongoing extraction until detected

### Investigation Approach

1. **Check:** Is the winner parameter validated against match outcome/game state?
   - Look for: Any on-chain game result verification
   - In: `lib.rs:228-305`
2. **Check:** Can the winner be set to an address that is NOT player_one or player_two?
   - Look for: Constraint requiring winner ∈ {player_one, player_two}
   - In: `lib.rs:576-600` (SettleMatch struct)
3. **Determine:**
   - Vulnerable if: Authority can freely choose winner with no on-chain verification
   - Safe if: Winner must be one of the two depositing players (constraint check)

---

## H006: 23-Hour Dead Zone Fund Lockup Griefing

**Category:** Timing, State Machine
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-089 (Timestamp-based race conditions)
**Origin:** KB (EP-089)
**Requires:** [timing-ordering-findings, state-machine-findings]

### Hypothesis

After the 1-hour settlement deadline expires, the authority can no longer settle, but players cannot cancel until 24 hours. This creates a 23-hour window where funds are locked with no possible action. A malicious authority could intentionally not settle to grief players.

### Attack Vector

1. Both players deposit wagers, match becomes Active
2. Authority intentionally does NOT settle within 1-hour window
3. Settlement deadline expires — authority can no longer settle
4. Players cannot cancel until 24h from activated_at
5. Funds locked for 23 hours with no recourse

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `settle_match` | 236-244 | Settlement deadline check |
| `lib.rs` | `cancel_match` | 329-333 | Cancel timeout check |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Temporary lockup of up to 200 SOL per match
- Users affected: Both players in affected matches
- Protocol state: Funds locked but eventually recoverable

### Investigation Approach

1. **Check:** What is the exact gap between settlement expiry and cancel availability?
   - Look for: SETTLEMENT_TIMEOUT_SECONDS vs TIMEOUT_SECONDS values
   - In: `lib.rs` constants
2. **Determine:**
   - Vulnerable if: Gap > 1 hour creates meaningful fund lockup
   - Safe if: Gap is minimal or cancel is available immediately after settlement expires

---

## H007: Pause-as-Griefing Attack on Active Matches

**Category:** Timing, Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel (specific pause/timeout interaction)
**Origin:** Novel
**Requires:** [timing-ordering-findings, access-control-findings]

### Hypothesis

A compromised authority can pause the program while active matches exist. Pause blocks settle_match AND cancel_match, but NOT permissionless_reclaim. This forces all active match participants to wait 48 hours for permissionless_reclaim, creating maximum fund lockup.

### Attack Vector

1. Attacker compromises authority key
2. Multiple matches are in Active state with deposited funds
3. Attacker calls `pause_program`
4. settle_match is blocked (pause guard), cancel_match is blocked (pause guard)
5. Only escape: permissionless_reclaim after 48h
6. All active match funds locked for up to 48 hours

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `pause_program` | ~90-95 | Pause mechanism |
| `lib.rs` | `settle_match` | ~605 | Pause guard |
| `lib.rs` | `cancel_match` | ~644 | Pause guard |
| `lib.rs` | `permissionless_reclaim` | (no pause guard) | Escape hatch |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Total TVL locked for 48 hours (all active escrows)
- Users affected: All active match participants
- Protocol state: Complete protocol freeze (except reclaim)

### Investigation Approach

1. **Check:** Which instructions have pause guards?
   - Look for: `require!(!config.is_paused, ...)` pattern
   - In: All instruction handlers
2. **Check:** Does permissionless_reclaim truly have no pause guard?
   - Look for: Absence of pause check
   - In: `PermissionlessReclaim` struct and handler
3. **Determine:**
   - Vulnerable if: Pause blocks settle+cancel but not reclaim (creating 48h lockup)
   - Safe if: Either cancel is not pause-gated or reclaim timeout is shorter

---

## H008: CreateMatch PDA Occupancy DoS

**Category:** Access Control, Resource/DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-084 (Resource exhaustion DoS), EP-085 (unbounded allocation)
**Origin:** KB (EP-084)
**Requires:** [access-control-findings]

### Hypothesis

`create_match` is not authority-gated (missing `has_one = authority` on config in CreateMatch struct). Any signer can create matches, consuming PDA namespace slots and forcing rent payments. While the spammer pays rent, they can flood the system with unsettleable matches.

### Attack Vector

1. Attacker repeatedly calls `create_match` with many unique match_ids
2. Each call creates a new PDA consuming on-chain storage
3. Matches are unsettleable by config authority (escrow.authority ≠ config.authority)
4. PDAs remain until 48h permissionless_reclaim timeout
5. Attacker's rent is eventually reclaimable, but PDA space is occupied

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `create_match` | 110-152 | No authority check |
| `lib.rs` | `CreateMatch` struct | 500-530 | Missing `has_one = authority` |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Attacker loses only rent (reclaimable after 48h)
- Users affected: Potential confusion from spam matches
- Protocol state: PDA namespace pollution

### Investigation Approach

1. **Check:** Does CreateMatch validate that the signer is the config authority?
   - Look for: `has_one = authority` or signer check against config
   - In: `lib.rs:500-530`
2. **Determine:**
   - Vulnerable if: Any signer can create matches
   - Safe if: Authority check exists

---

## H009: Executable Account as Fee Destination (Silent Lamport Loss)

**Category:** CPI/External, Token/Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-106 (Lamport manipulation to arbitrary account)
**Origin:** KB (EP-106)
**Requires:** [cpi-external-findings, token-economic-findings]

### Hypothesis

If `update_config` sets treasury or ops to an executable program address, the direct lamport credit (`try_borrow_mut_lamports` += amount) may silently fail or behave unexpectedly. The Solana runtime may discard the lamport write if the recipient is an executable account not owned by the program.

### Attack Vector

1. Compromised authority calls `update_config(new_treasury = Some(program_address))`
2. `settle_match` attempts to credit lamports to the program address
3. `try_borrow_mut_lamports` succeeds in the instruction's memory view
4. Runtime may discard the write (program accounts have specific lamport rules)
5. Treasury fees are effectively burned — 7% of each pot lost

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | No executable/reserved check on addresses |
| `lib.rs` | `settle_match` | 284-291 | Direct lamport credit to UncheckedAccount |
| `lib.rs` | `SettleMatch` struct | 576-600 | Treasury/ops as UncheckedAccount |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: 7-10% of each pot silently lost
- Users affected: Protocol treasury (indirect user impact)
- Protocol state: Ongoing fee loss until config corrected

### Investigation Approach

1. **Check:** Are treasury/ops validated as non-executable wallet addresses?
   - Look for: `executable` field check or is_writable constraint
   - In: `lib.rs:70-88` and `lib.rs:576-600`
2. **Check:** What happens when `try_borrow_mut_lamports` credits an executable account?
   - Look for: Solana runtime behavior on lamport credit to programs
3. **Determine:**
   - Vulnerable if: No executable check AND lamport credit fails silently
   - Safe if: Runtime errors prevent silent loss or config validates addresses

---

## H010: Deposit Ordering Asymmetry Exploitation

**Category:** Timing
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-089 (Race conditions)
**Origin:** KB (EP-089)
**Requires:** [timing-ordering-findings]

### Hypothesis

The first depositor's funds are locked while waiting for the second depositor, who may never deposit. The first depositor must proactively cancel (after 24h timeout from created_at) to recover funds. An adversary could create matches, wait for one player to deposit, then never deposit themselves.

### Attack Vector

1. Match is created, adversary is player_two
2. Player_one (victim) deposits wager
3. Adversary never deposits
4. Player_one's funds locked until 24h timeout from created_at
5. Player_one must actively cancel to recover funds

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `deposit_wager` | 156-222 | Deposit logic, state transition |
| `lib.rs` | `cancel_match` | 310-395 | Cancel from AwaitingDeposits |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Temporary lockup of victim's wager (up to 100 SOL) for 24h
- Users affected: First depositor in each targeted match
- Protocol state: Funds locked but eventually recoverable

### Investigation Approach

1. **Check:** Can cancel_match be called from AwaitingDeposits state?
   - Look for: State check allowing AwaitingDeposits cancel
   - In: `lib.rs:310-395`
2. **Check:** What is the timeout reference for AwaitingDeposits cancel?
   - Look for: Whether timeout is from created_at or some other reference
   - In: `lib.rs:329-333`
3. **Determine:**
   - Vulnerable if: 24h timeout before first depositor can recover
   - Safe if: Immediate cancel available or shorter timeout

---

## H011: Config Treasury Self-Redirect

**Category:** Token/Economic, Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-099 (Fee routing — Vaultka Critical)
**Origin:** KB (EP-099)
**Requires:** [token-economic-findings, access-control-findings]

### Hypothesis

Authority can set treasury == authority's own wallet via `update_config`, redirecting 7% of all settlement fees to themselves. Combined with ops redirect (H002), authority captures 10% of all pots beyond their operational role.

### Attack Vector

1. Authority calls `update_config(new_treasury = Some(authority_wallet))`
2. All future settlements send 7% to authority's wallet
3. Authority also sets ops to another controlled wallet for additional 3%

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | Treasury/ops update |
| `lib.rs` | `initialize_config` | 35-55 | Distinctness check (compare) |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: 7-10% of all settlement pots
- Users affected: Protocol stakeholders

### Investigation Approach

1. **Check:** Does update_config prevent setting treasury == authority?
   - Look for: Cross-field validation
   - In: `lib.rs:70-88`
2. **Determine:**
   - Vulnerable if: No distinctness check between authority and treasury/ops
   - Safe if: Distinctness enforced

---

## H012: Lamport Underflow on Cancel/Reclaim

**Category:** Arithmetic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-015 (Unchecked arithmetic)
**Origin:** KB (EP-015)
**Requires:** [arithmetic-findings]

### Hypothesis

If the escrow PDA's lamport balance is somehow reduced below the expected refund amount (e.g., due to rent adjustments or external lamport manipulation), the `try_borrow_mut_lamports` subtraction could underflow, causing the transaction to fail and permanently locking funds.

### Attack Vector

1. Escrow PDA created with rent + 2 * wager lamports
2. Some mechanism reduces PDA balance below expected (rent changes, bugs)
3. cancel_match or permissionless_reclaim attempts to refund wager_lamports
4. Subtraction underflows → transaction fails
5. Funds permanently stuck (cannot cancel, cannot reclaim)

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `cancel_match` | 359-366 | Lamport subtraction for refund |
| `lib.rs` | `permissionless_reclaim` | 421-428 | Lamport subtraction for refund |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Permanently locked escrow funds
- Users affected: Players in affected match

### Investigation Approach

1. **Check:** Does the subtraction use checked arithmetic or can it underflow?
   - Look for: `checked_sub` vs direct subtraction
   - In: `lib.rs:359-366`, `lib.rs:421-428`
2. **Check:** Can the PDA balance be reduced externally?
   - Look for: Whether any instruction or external action can reduce PDA lamports
3. **Determine:**
   - Vulnerable if: Unchecked subtraction AND balance can be reduced
   - Safe if: Checked arithmetic or balance is always sufficient

---

## H013: PDA Rent Extraction at Low Wagers

**Category:** Token/Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel (game-specific economic incentive)
**Origin:** Novel
**Requires:** [token-economic-findings]

### Hypothesis

At minimum wager (10,000 lamports ≈ $0.002), the rent-exempt minimum for the escrow PDA (~1,500,000 lamports for typical Anchor account) vastly exceeds the wager. Authority pays rent at creation and recovers it at settlement via `close = authority`. If rent > wager, the authority has an economic incentive to create-and-settle matches purely for rent cycling.

### Attack Vector

1. Authority creates match with MIN_WAGER (10,000 lamports), paying ~1.5M lamports rent
2. Two players deposit 10,000 lamports each (20,000 total)
3. Authority settles immediately: winner gets 18,000, treasury 1,400, ops 600
4. Account closes → authority recovers ~1.5M rent
5. Net: authority spent ~1.5M rent, recovered ~1.5M rent + 2,000 (treasury+ops if controlled)

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `CreateMatch` struct | 500-530 | Rent payer and `init` attribute |
| `lib.rs` | `SettleMatch` struct | 576-600 | `close = authority` attribute |
| `lib.rs` | constants | MIN_WAGER_LAMPORTS | Minimum wager value |

### Potential Impact

**Severity if confirmed:** HIGH (design concern, not exploit)

- Financial: Minimal per-match, but incentive misalignment
- Protocol state: Economic model not aligned at low wagers

### Investigation Approach

1. **Check:** Who pays rent at creation and who receives it at close?
   - Look for: `payer` in CreateMatch, `close = ` in Settle/Cancel/Reclaim
   - In: Account structs
2. **Determine:**
   - Concern if: Rent recovery creates perverse incentive at low wagers
   - Non-issue if: MIN_WAGER is high enough relative to rent

---

## H014: Authority Collusion — Settle to Controlled Winner Wallet

**Category:** Token/Economic, Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-094 (Single withdraw authority — Pump.fun $1.9M)
**Origin:** KB (EP-094)
**Requires:** [token-economic-findings, access-control-findings]

### Hypothesis

The `settle_match` winner parameter is constrained to be either player_one or player_two. If the authority controls the game server and always assigns a colluding account as one of the players, they can systematically extract 90% of every pot.

### Attack Vector

1. Authority controls the off-chain game server
2. Server always pairs legitimate players with a bot/shill account
3. Authority always settles with bot account as winner
4. Bot extracts 90% of wager from every match

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `settle_match` | 228-305 | Winner constraint |
| `lib.rs` | `SettleMatch` struct | 576-600 | Winner validation |

### Potential Impact

**Severity if confirmed:** HIGH (design-level centralization)

- Financial: 90% of all match pots
- Users affected: All legitimate players

### Investigation Approach

1. **Check:** Is winner constrained to be player_one or player_two?
   - Look for: Constraint on winner account in SettleMatch
   - In: `lib.rs:576-600`
2. **Check:** Is there any on-chain verification of game outcome?
   - Look for: Signed game result, VRF, oracle
3. **Determine:**
   - Vulnerable if: Winner can be any address (not constrained to players)
   - Partially safe if: Winner must be one of the players (but authority still picks)

---

## H015: Concurrent Double-Deposit by Same Player

**Category:** State Machine
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-033 (State machine inconsistency)
**Origin:** KB (EP-033)
**Requires:** [state-machine-findings]

### Hypothesis

If a player submits two `deposit_wager` transactions in rapid succession (same slot or adjacent slots), both might pass the deposit flag check before either updates the flag. This could allow a single player to deposit twice, transitioning to Active state as both player_one and player_two.

### Attack Vector

1. Match created with player_one = A, player_two = A (or player_one = A, player_two = B)
2. Player A sends two deposit_wager TXs in same slot
3. Both TXs read `player_one_deposited = false`
4. Both TXs set `player_one_deposited = true` and transfer wager
5. Second deposit overwrites first, or match transitions to Active with only one actual deposit

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `deposit_wager` | 156-222 | Deposit flag check and update |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Potential double-deposit leading to incorrect state
- Users affected: Match participants

### Investigation Approach

1. **Check:** Does the deposit flag check prevent same-slot double execution?
   - Look for: Solana runtime behavior with duplicate account writes in same slot
   - In: `lib.rs:156-222`
2. **Check:** Can player_one == player_two in create_match?
   - Look for: Distinctness constraint on players
   - In: CreateMatch struct
3. **Determine:**
   - Vulnerable if: No runtime protection against same-slot double deposit
   - Safe if: Solana runtime serializes writes to same account within a slot

---

## H016: AwaitingDeposits → Cancel Without Depositing (Rent Theft)

**Category:** State Machine, Token/Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-040 (Close-related exploits)
**Origin:** KB (EP-040)
**Requires:** [state-machine-findings, token-economic-findings]

### Hypothesis

A player assigned to a match (player_one or player_two) might be able to call `cancel_match` from the AwaitingDeposits state without ever depositing, potentially claiming rent or disrupting the match for the other player who has deposited.

### Attack Vector

1. Match created with player_one = A, player_two = B
2. Player A deposits wager
3. Player B (without depositing) calls cancel_match after 24h
4. cancel_match refunds depositors — Player A gets wager back
5. Account closes — rent goes to... who? If attacker can claim rent, they profit

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `cancel_match` | 310-395 | Cancel from AwaitingDeposits |
| `lib.rs` | `CancelMatch` struct | 630-660 | close attribute |

### Potential Impact

**Severity if confirmed:** HIGH (if rent exploitable)

- Financial: Rent extraction per cancelled match
- Protocol state: Match disruption

### Investigation Approach

1. **Check:** Who receives rent on cancel_match close?
   - Look for: `close = ` attribute in CancelMatch struct
   - In: `lib.rs:630-660`
2. **Check:** Does cancel from AwaitingDeposits require the caller to have deposited?
   - Look for: Deposit flag check in cancel logic
3. **Determine:**
   - Vulnerable if: Non-depositing player can cancel and claim rent
   - Safe if: Cancel requires deposit or rent goes to authority/payer

---

## H017: Config State Read During Same-TX Mutation

**Category:** State Machine, Timing
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-111 (Mutable config PDA in fund-flow conditionals)
**Origin:** KB (EP-111)
**Requires:** [state-machine-findings, timing-ordering-findings]

### Hypothesis

If `update_config` and `settle_match` are composed in the same transaction, the config read by settle_match might see stale or mid-update state. An attacker could change treasury/ops addresses in the same TX as settlement, potentially redirecting fees.

### Attack Vector

1. Attacker constructs TX: [update_config(new_treasury=attacker)] → [settle_match]
2. settle_match reads config AFTER update_config has modified it
3. Fees go to attacker's new treasury address

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `update_config` | 70-88 | Config mutation |
| `lib.rs` | `settle_match` | 228-305 | Config read for fee destinations |

### Potential Impact

**Severity if confirmed:** HIGH

- Financial: Fee redirection in composed transactions

### Investigation Approach

1. **Check:** Can update_config and settle_match be composed in the same TX?
   - Look for: Whether both instructions share the config account
   - In: Both account structs
2. **Check:** Does Solana runtime serialize instructions or share account state within a TX?
   - Look for: Solana transaction execution model (instructions see prior instruction's writes)
3. **Determine:**
   - Vulnerable if: Second instruction sees first instruction's state changes
   - Safe if: Authority needed for both (attacker already needs full access)

---

## H018: ZeroWager Dead Code Exploitation

**Category:** State Machine, Token/Economic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-033 (State machine logic errors)
**Origin:** KB (EP-033)
**Requires:** [state-machine-findings, arithmetic-findings]

### Hypothesis

The `ZeroWager` error code exists in the codebase but may never trigger if wager validation occurs elsewhere. If a code path allows wager_lamports = 0, the BPS fee calculation would produce 0 for all recipients, and the match would have no economic purpose.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `create_match` | 110-152 | Wager validation |
| `lib.rs` | constants | MIN_WAGER_LAMPORTS | Minimum bound |

### Potential Impact

**Severity if confirmed:** MEDIUM

- Economic: Zero-value matches waste on-chain resources

### Investigation Approach

1. **Check:** Is MIN_WAGER_LAMPORTS > 0 and enforced in create_match?
2. **Determine:** Dead code if min wager check prevents zero wager

---

## H019: Narrowing Cast Overflow at Hypothetical MAX_WAGER Increase

**Category:** Arithmetic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-020 (Truncation via `as` casts), EP-091 (Cetus $223M)
**Origin:** KB (EP-020)
**Requires:** [arithmetic-findings]

### Hypothesis

The `as u64` narrowing casts after u128 BPS calculations are safe at current MAX_WAGER (100 SOL), but if MAX_WAGER were increased (via upgrade), the intermediate u128 values might exceed u64 range, causing silent truncation.

### Target Code

| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `lib.rs` | `settle_match` | 260, 265, 267 | `as u64` casts |

### Potential Impact

**Severity if confirmed:** MEDIUM (requires upgrade)

- Financial: Fee calculation overflow → incorrect distribution

### Investigation Approach

1. **Check:** At what MAX_WAGER value do the `as u64` casts overflow?
2. **Determine:** Safe if: MAX_WAGER is a compile-time constant that cannot be changed without redeployment

---

## H020: Clock Drift Exploitation at Settlement Deadline

**Category:** Timing
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-089 (Timestamp manipulation)
**Origin:** KB (EP-089)
**Requires:** [timing-ordering-findings]

### Hypothesis

Solana's `Clock::get()?.unix_timestamp` has 1-2 second drift. At the exact settlement deadline boundary (activated_at + 3600 seconds), clock drift might allow settlement slightly after the intended 1-hour window, or block settlement slightly before.

### Potential Impact

**Severity if confirmed:** LOW — 1-2 second window is immaterial for 1-hour deadlines

### Investigation Approach

1. **Check:** Is the deadline check `<=` or `<`?
2. **Determine:** Non-issue if: 1-2 second drift on 3600-second window

---

## H021: Permissionless Reclaim During Active Pause

**Category:** Timing, Access Control
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel (pause interaction)
**Origin:** Novel
**Requires:** [timing-ordering-findings, access-control-findings]

### Hypothesis

`permissionless_reclaim` intentionally has no pause guard (DCA-02 escape hatch). During an emergency pause, funds continue flowing out via this path. An attacker who discovers a vulnerability might pause to prevent legitimate settlements while using reclaim to drain.

### Potential Impact

**Severity if confirmed:** MEDIUM — by design, but worth verifying intent

### Investigation Approach

1. **Check:** Is the lack of pause guard on permissionless_reclaim documented as intentional?
2. **Determine:** By-design if: Comments or docs confirm escape hatch purpose

---

## H022: GlobalConfig Re-Initialization

**Category:** Access Control, Initialization
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-075 (Re-initialization attacks)
**Origin:** KB (EP-075)
**Requires:** [access-control-findings]

### Hypothesis

If `initialize_config` can be called again after the config PDA is already initialized, an attacker could re-initialize with their own authority, taking over the protocol.

### Potential Impact

**Severity if confirmed:** CRITICAL (but likely prevented by Anchor `init`)

### Investigation Approach

1. **Check:** Does initialize_config use Anchor `init` (which prevents re-init)?
2. **Determine:** Safe if: Anchor `init` constraint on GlobalConfig PDA

---

## H023: PDA Account Revival After Close

**Category:** State Machine
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-036 (Account close revival)
**Origin:** KB (EP-036)
**Requires:** [state-machine-findings]

### Hypothesis

After an escrow PDA is closed (settle/cancel/reclaim), the account's data is zeroed. A subsequent `create_match` with the same match_id could re-create the PDA. In a future transaction (not same-TX as H004), this could create state confusion.

### Potential Impact

**Severity if confirmed:** MEDIUM

### Investigation Approach

1. **Check:** Does Anchor `init` prevent creating a PDA with a previously-used match_id (after close)?
2. **Determine:** Likely safe — Anchor `init` creates fresh accounts, and closed PDAs can be re-initialized with new data

---

## H024: Settlement Deadline Bypass via activated_at Path

**Category:** Timing, State Machine
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-033 (Logic bypass)
**Origin:** KB (EP-033)
**Requires:** [timing-ordering-findings, state-machine-findings]

### Hypothesis

The settlement deadline check has a conditional: `if ctx.accounts.escrow.activated_at > 0`. If there's a path to Active state without setting activated_at, the deadline check would be skipped, allowing settlement at any time.

### Potential Impact

**Severity if confirmed:** HIGH (but all agents confirm activated_at is always set)

### Investigation Approach

1. **Check:** Is activated_at set on every AwaitingDeposits → Active transition?
2. **Determine:** Safe if: No path to Active without setting activated_at (confirmed by agents 03 and 08)

---

## H025: Match ID Collision for PDA Hijack

**Category:** Access Control
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel (string-based PDA seeds)
**Origin:** Novel
**Requires:** [access-control-findings]

### Hypothesis

PDA seeds are `["match", match_id.as_bytes()]`. If match_id is user-controlled and an attacker can predict or duplicate a match_id, they could create a PDA that collides with a legitimate match.

### Potential Impact

**Severity if confirmed:** MEDIUM

### Investigation Approach

1. **Check:** Is match_id user-controlled or server-generated?
2. **Check:** Does Anchor `init` prevent creating a PDA that already exists?
3. **Determine:** Safe if: PDA uniqueness is enforced by Anchor and match_id is server-generated

---

## H026: Escrow PDA Lamport Inflation (Donation Attack)

**Category:** Token/Economic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel (donation-based economic manipulation)
**Origin:** Novel
**Requires:** [token-economic-findings, cpi-external-findings]

### Hypothesis

Anyone can transfer SOL to the escrow PDA via system transfer (outside the program). Extra lamports above 2*wager+rent would be swept to the `close` recipient (authority) on account close. This creates a donation → authority extraction path.

### Potential Impact

**Severity if confirmed:** LOW (attacker loses donated SOL, authority gains)

### Investigation Approach

1. **Check:** What happens to excess lamports when the account is closed?
2. **Determine:** Non-exploitable if: Only authority benefits (attacker loses money)

---

## H027: Authority Self-Play Bypass (OC-06)

**Category:** Access Control
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel (game-specific constraint)
**Origin:** Novel
**Requires:** [access-control-findings]

### Hypothesis

OC-06 prevents authority from being a player. But authority could use a secondary wallet to play, then always settle in their favor. The on-chain constraint only checks `authority != player_one && authority != player_two` against the signing key.

### Potential Impact

**Severity if confirmed:** MEDIUM (design limitation, not code bug)

### Investigation Approach

1. **Check:** Does OC-06 exist and what exactly does it check?
2. **Determine:** Design concern if: Authority can trivially use a different wallet

---

## H028: BPS Constant Manipulation via Upgrade

**Category:** Upgrade/Admin
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-079 (Upgrade-related vulnerabilities)
**Origin:** KB (EP-079)
**Requires:** [access-control-findings]

### Hypothesis

BPS constants (TREASURY_BPS=700, OPS_BPS=300) are hardcoded. If the program has an upgrade authority, the constants could be changed to redirect a larger percentage of pots.

### Potential Impact

**Severity if confirmed:** MEDIUM (requires upgrade authority)

### Investigation Approach

1. **Check:** Is the program upgradeable? Is there an upgrade authority?
2. **Determine:** Not applicable if: Program is immutable after deployment

---

## H029: Error Propagation in try_borrow_mut_lamports Chain

**Category:** CPI/External, State Machine
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-046 (let _ = on CPI — silent error suppression)
**Origin:** KB (EP-046)
**Requires:** [cpi-external-findings, state-machine-findings]

### Hypothesis

`settle_match` performs three sequential lamport transfers (winner, treasury, ops). If the state is set to Settled before all transfers complete and one transfer fails, the state revert (due to transaction atomicity) might not be properly handled.

### Potential Impact

**Severity if confirmed:** MEDIUM

### Investigation Approach

1. **Check:** Is state set before or after all lamport transfers?
2. **Check:** Do all transfers use `?` error propagation?
3. **Determine:** Safe if: Solana TX atomicity ensures all-or-nothing (confirmed by agent 04)

---

## H030: Cancel from AwaitingDeposits Refund Logic

**Category:** State Machine, Token/Economic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** EP-033 (State machine edge cases)
**Origin:** KB (EP-033)
**Requires:** [state-machine-findings, token-economic-findings]

### Hypothesis

When cancel_match is called from AwaitingDeposits state (only one or zero deposits), the refund logic must correctly handle: (a) no deposits, (b) only player_one deposited, (c) only player_two deposited. Incorrect handling could lead to funds being sent to wrong recipient or stuck.

### Potential Impact

**Severity if confirmed:** MEDIUM

### Investigation Approach

1. **Check:** Does cancel_match check deposit flags before refunding?
2. **Check:** Are all three cases (0, 1, or 2 deposits) handled correctly?
3. **Determine:** Safe if: Each deposit flag is checked independently before refund

---

## Cross-Strategy Analysis

### Potentially Related Strategies

| Strategy A | Strategy B | Potential Combination |
|------------|------------|----------------------|
| H001 (Authority Takeover) | H002 (Fee Hijack) | Takeover enables total fee redirection |
| H001 (Authority Takeover) | H005 (Winner Fraud) | Takeover enables systematic winner manipulation |
| H001 (Authority Takeover) | H007 (Pause Griefing) | Takeover enables protocol freeze |
| H003 (Distinctness DoS) | H006 (Dead Zone) | DoS forces all matches into 24h+ lockup |
| H005 (Winner Fraud) | H014 (Collusion) | Both target authority's winner selection power |
| H008 (PDA Spam) | H010 (Deposit Asymmetry) | Spam matches with intentional non-deposit |
| H004 (PDA Revival) | H023 (Post-Close Revival) | Same attack class, different timing |

### Investigation Priority Order

**Tier 1 (Investigate First):**
1. H001: Authority takeover — single most impactful attack if authority key is compromised
2. H003: Distinctness bypass — could make all settlements impossible
3. H004: PDA revival — if possible, enables rent extraction or state confusion
4. H005: Winner fraud — fundamental centralization concern
5. H002: Fee hijack — ongoing extraction without player-visible impact

**Tier 2 (High Priority):**
6-17. H006 through H017 in order listed

**Tier 3 (Standard):**
18-30. H018 through H030 in order listed

---

## Supplemental Strategies

*Generated after Batch 1 investigation (H001-H005). Based on confirmed findings and incidental discoveries.*

### S001: Combined Authority Takeover + Fee Redirect + Winner Fraud (Chain Attack)

**Category:** Access Control, Token/Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** EP-068 chain (Step Finance $30-40M), H001+H002+H005 combination
**Origin:** Novel (chain from Batch 1 findings)

**Hypothesis:** A single authority key compromise enables a chained attack: (1) update_config to redirect treasury/ops to attacker wallets, (2) settle all active matches with attacker-controlled player as winner, (3) transfer authority to lock out recovery. Combined extraction: 100% of all deposited funds + permanent protocol takeover.

**Attack Vector:**
1. TX0: `update_config(new_treasury=attacker1, new_ops=attacker2)` — redirects 10% fees
2. TX1-N: `settle_match(winner=colluding_player)` for all active matches — extracts 90% per match
3. TX_final: `update_config(new_authority=attacker_key)` — locks out recovery

**Target Code:** `lib.rs:70-89` (update_config), `lib.rs:228-305` (settle_match)
**Requires:** [access-control-findings, token-economic-findings]

### S002: Distinctness Poison + Pause Double Lock

**Category:** State Machine, Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** H003+H007 combination
**Origin:** Novel (chain from Batch 1 findings)

**Hypothesis:** A compromised authority can execute a two-step griefing attack: (1) set treasury == ops via update_config to break all settlement, then (2) pause the program. Now neither settle (broken by distinctness) nor cancel (blocked by pause) work. Only permissionless_reclaim after 48h remains as escape. Maximum fund lockup.

**Attack Vector:**
1. TX0: `update_config(new_treasury=X, new_ops=X)` — poisons config
2. TX1: `pause_program` — blocks cancel_match
3. All active matches locked for 48h until permissionless_reclaim

**Target Code:** `lib.rs:70-89`, `lib.rs:90-95` (pause), settlement/cancel handlers
**Requires:** [state-machine-findings, access-control-findings]

### S003: Authority == Treasury Economic Consolidation

**Category:** Token/Economic, Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-099 (Vaultka fee routing), H003 incidental discovery
**Origin:** Novel (from H003 investigation)

**Hypothesis:** Authority sets `treasury == authority_wallet` via update_config. Unlike treasury==ops (which breaks settlement), treasury==authority may succeed because the SettleMatch struct has separate constraints for treasury and authority accounts. This silently redirects 7% of all pots to the authority, creating hidden fee capture.

**Attack Vector:**
1. `update_config(new_treasury=authority_wallet)` — passes because update_config has no distinctness checks
2. `settle_match` passes treasury=authority_wallet — constraint `treasury.key() == config.treasury` ✓
3. Authority receives 7% fee on top of normal operational role

**Target Code:** `lib.rs:70-89`, `lib.rs:583-598` (SettleMatch constraints)
**Requires:** [token-economic-findings, access-control-findings]

### S004: PDA Namespace Pre-Squatting DoS

**Category:** Access Control, Resource/DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** EP-084 (Resource exhaustion), H004 incidental + H008 refinement
**Origin:** Novel (from H004 investigation)

**Hypothesis:** Because `create_match` lacks `has_one = authority`, an attacker can pre-create escrow PDAs using match_ids the server will use in the future. When the legitimate server tries to create a match with that ID, `init` fails (PDA already exists). Combined with cancel-after-24h for rent recovery, this is a sustainable DoS.

**Attack Vector:**
1. Attacker predicts or brute-forces server match_id patterns
2. Creates escrow PDAs with those IDs (paying rent)
3. Server `create_match` calls fail (PDA already exists)
4. After 24h, attacker cancels to recover rent
5. Repeat — sustainable DoS with zero net cost

**Target Code:** `lib.rs:500-530` (CreateMatch struct, no authority check), match_id seed derivation
**Requires:** [access-control-findings]

---

## Statistics

| Category | Count | Tier 1 | Tier 2 | Tier 3 | Novel |
|----------|-------|--------|--------|--------|-------|
| Access Control | 8 | 3 | 4 | 1 | 2 |
| Arithmetic | 2 | 0 | 1 | 1 | 0 |
| State Machine | 6 | 1 | 2 | 3 | 1 |
| CPI & External | 2 | 0 | 1 | 1 | 0 |
| Token & Economic | 7 | 2 | 3 | 2 | 2 |
| Timing & Ordering | 5 | 0 | 2 | 3 | 2 |
| Upgrade & Admin | 1 | 0 | 0 | 1 | 0 |
| **TOTAL** | **30** | **5** | **12** | **13** | **7 (23%)** |

Note: Some strategies span multiple categories. Counted once by primary category.

---

## Notes for Investigators

### General Guidance

- Each strategy should be investigated independently
- Reference ARCHITECTURE.md for context
- Write findings to `.audit/findings/H{XXX}.md`
- Don't skip strategies even if they seem unlikely
- Note any discoveries that suggest NEW strategies

### Status Definitions

- **CONFIRMED**: Vulnerability exists and is exploitable
- **POTENTIAL**: Could be vulnerable under specific conditions
- **NOT VULNERABLE**: Protected against this attack
- **NEEDS MANUAL REVIEW**: Couldn't determine, needs expert

---

**This catalog is the input for Phase 4: Parallel Investigation**
