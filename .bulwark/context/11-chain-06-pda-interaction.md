# CHAIN-06: Program Account & PDA Interaction

**task_id:** CHAIN-06
**auditor:** CHAIN-06
**generated:** 2026-02-23
**files_reviewed:**
- `server/services/escrow.js` (primary)
- `programs/solshot-escrow/src/lib.rs` (on-chain program)
- `server/idl/solshot_escrow.json`
- `server/services/solana.js`
- `server/socket-io/main.js` (escrow flow)
- `client/src/wallet/WalletContext.js`
- `tests/solshot-escrow.ts`

---

## CONDENSED SUMMARY

The escrow architecture is well-designed overall. PDA seed derivation is consistent across all layers, the account lifecycle state machine is enforced on-chain, and accounts are properly closed after settlement. Critical on-chain constraints (winner validation, treasury/ops validation, authority checks, pause guard) are solid.

**Three findings require attention before mainnet:**

1. **MEDIUM — Settlement timeout too short for long matches.** The on-chain `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1 hour from activation) can be exceeded by a valid BO5 match. If a match runs longer than 1 hour, `settle_match` fails with `SettlementExpired`, the recovery path then tries `cancel_match` (which requires either `AwaitingDeposits` state OR 24-hour timeout — neither applies to an Active match under 24 hours), leaving funds stuck until the 48-hour `permissionless_reclaim` window. There is a 1-hour to 24-hour window where no authority-controlled path can rescue the funds.

2. **LOW — `refundWager` silently succeeds on on-chain cancel failure.** When `cancelMatchEscrow` fails and escrow is enabled, `refundWager` falls through to a log-only path and returns `{ success: true }`. The caller in `main.js` treats this as a successful refund, but no funds were actually moved. This only applies to the cancel/disconnect path, not the primary settlement path (which correctly propagates failure via SF-02).

3. **LOW — `permissionless_reclaim` bypasses the program pause guard.** The `PermissionlessReclaim` account struct does not include the `config` PDA, meaning `permissionless_reclaim` can be called even when the program is paused. This is likely intentional (allow recovery even during emergency pause), but it is undocumented and inconsistent with the other economic instructions.

No critical issues were found. PDA derivation, IDL sync, account space calculations, state machine transitions, and authority validation are all correct.

---

## FULL ANALYSIS

### 1. PDA Derivation Consistency

**On-chain program (`lib.rs`):**
```rust
seeds = [b"match", match_id.as_bytes()]   // CreateMatch account struct, line 515
seeds = [b"match", escrow.match_id.as_bytes()]  // DepositWager, SettleMatch, CancelMatch
seeds = [GlobalConfig::SEED]  // = b"config", line 707
```

**Server (`escrow.js`):**
```js
export function getEscrowPDA(matchId) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('match'), Buffer.from(matchId)],
        PROGRAM_ID
    );
}
export function getConfigPDA() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID
    );
}
```

**Tests (`solshot-escrow.ts`):**
```ts
const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    program.programId
);
const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
);
```

**Verdict: Fully consistent.** All three layers use identical seed arrays. `Buffer.from(matchId)` is UTF-8 encoding, which matches `match_id.as_bytes()` for ASCII room IDs. Room IDs are generated as `crypto.randomBytes(4).toString('hex')` (8 ASCII hex characters), so encoding is safe.

**Minor note:** `permissionlessReclaimEscrow` in `escrow.js` derives its PDA using `program.programId` (line 485) rather than the `PROGRAM_ID` constant used elsewhere. In Anchor 0.32, `new Program(idl, provider)` extracts the program ID from `idl.address`, which is `"CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD"` — identical to the `PROGRAM_ID` constant. Functionally equivalent, but inconsistent style. Recommend using the exported `PROGRAM_ID` constant for clarity.

---

### 2. matchId (roomId) Validation Before PDA Derivation

**On-chain guard:** `require!(match_id.len() <= 32, EscrowError::MatchIdTooLong)` in `create_match`. The PDA account space allocates `4 + 32 = 36` bytes for the `String` field (Borsh length prefix + max 32 chars), which is correct.

**Server-side:** `main.js` generates room IDs as `crypto.randomBytes(4).toString('hex')` = 8 characters. This is far below the 32-character limit. No pre-validation of the matchId length before PDA derivation is performed in `escrow.js`, but this is acceptable because:
- Production room IDs are server-generated at fixed 8-char length.
- The on-chain program enforces the constraint if the server ever passed a longer ID.

**Test IDs:** The longest test match ID is `test-authcancel-active-` + `runId` = 22 + 8 = 30 characters (within limit). Verified at runtime.

**No collision risk:** `crypto.randomBytes(4)` gives 2^32 ≈ 4 billion distinct room IDs. Combined with the `init` constraint in `CreateMatch` (which would error if PDA already exists), duplicate room IDs are practically impossible and programmatically rejected.

---

### 3. Account Lifecycle: State Machine Enforcement

The `MatchState` enum has four variants: `AwaitingDeposits` → `Active` → `Settled` / `Cancelled`. Transitions are enforced on-chain:

| Instruction | Required State | Terminal State Set |
|---|---|---|
| `create_match` | (account does not exist) | `AwaitingDeposits` |
| `deposit_wager` | `AwaitingDeposits` | stays, or → `Active` |
| `settle_match` | `Active` | `Settled` (before transfers) |
| `cancel_match` (authority) | `AwaitingDeposits` only | `Cancelled` (before refunds) |
| `cancel_match` (player) | `AwaitingDeposits` OR timed-out | `Cancelled` (before refunds) |
| `permissionless_reclaim` | not `Settled`/`Cancelled` | `Cancelled` (before refunds) |

State is set to terminal BEFORE lamport transfers (OC-10 defense-in-depth). This correctly prevents re-entrancy / replay issues within Solana's execution model.

The server does NOT query `getEscrowState` before calling `settleMatch`. If `settle_match` is called on a non-Active escrow, the on-chain guard rejects it and the recovery path (`handleSettlementFailure`) attempts `cancelMatchEscrow`. This is safe but incurs unnecessary RPC round trips. Adding a pre-settlement on-chain state check to `main.js` would be a minor efficiency improvement.

---

### 4. Account Closure After Settlement

**`settle_match`:** The `SettleMatch` account struct has `close = authority`, which directs Anchor to send remaining lamports (the rent-exemption amount) to the authority after the instruction executes. The winner's payout, treasury fee, and ops fee are transferred out manually first. The math is:

```
total_pot = wager × 2
winner_amount = total_pot - treasury_amount - ops_amount
```

The escrow account holds exactly `wager × 2` lamports (plus rent). After the three manual transfers (winner + treasury + ops = total_pot), the remaining balance is the rent. Anchor's `close = authority` sweeps this remainder to the authority. This is correct and the test at line 584 confirms `escrowInfo` is null after settlement.

**`cancel_match` and `permissionless_reclaim`:** Both use `close = caller`, giving the rent back to the transaction payer. This is appropriate.

**Stale escrow replay risk: None.** Once an account is closed (lamports zeroed and ownership returned to System Program), the PDA address is freed. A new `create_match` with the same `match_id` would re-initialize it with `init`, which requires the account to not exist. Since room IDs are CSPRNG-generated and practically unique, the combination of account closure and `init` constraint makes replay attacks impossible.

---

### 5. Server Verification of On-Chain Escrow State

**Deposit verification (strong):** The `escrowDepositConfirm` handler in `main.js` (lines 1739–1774) calls `getEscrowState(rid)` with one retry after a 2-second delay. It verifies:
- Escrow PDA exists on-chain
- The correct player's deposit flag is set (`playerOneDeposited` or `playerTwoDeposited`)
- `wagerLamports` on-chain matches the expected amount

**Settlement verification (absent):** Before calling `settleMatch` at match end, the server does not call `getEscrowState` to verify the escrow is `Active`. The on-chain guard is the final enforcement, but a pre-check would allow the server to skip the RPC call and give a better error message. Not a security issue given the on-chain guard.

**isHost determination:** The deposit confirmation handler determines which player is depositing via `room.host?.socketId === client.id`. This maps to `playerOneDeposited` (host = player_one) or `playerTwoDeposited` (player = player_two). Since `createMatchEscrow` is called as `createMatchEscrow(roomId, roomWager, hostWallet, joinerWallet)`, the mapping is consistent: host is always player_one.

---

### 6. Authority Validation

**On-chain:** `SettleMatch` has dual `has_one = authority` constraints: one on the `escrow` account (checking `escrow.authority`) and one on the `config` account (checking `config.authority`). Both must match the signer. This correctly requires the server to sign with the same keypair used during `create_match`.

**Server-side:** The server always uses `getEscrowKeypair().publicKey` as the `authority` account in all Anchor calls. This is loaded once at initialization via `keys.js`. The authority key is not accepted from external input — it is always sourced from the server's own keypair.

The `cancelMatch` instruction does not have a `has_one = authority` constraint on the escrow account directly, but authority is read from the config PDA and compared with the caller inside the instruction logic:
```rust
let config_authority = ctx.accounts.config.authority;
let is_authority = caller == config_authority;
```
This is correct but relies on the config PDA being properly initialized with the right authority pubkey.

---

### 7. Account Data Deserialization

**Server-side:** `getEscrowState` uses `program.account.matchEscrow.fetch(escrowPDA)` which performs discriminator validation and Borsh deserialization through Anchor's generated type-safe accessors. If the account data does not match the `MatchEscrow` schema, Anchor throws an error and the function returns `null`.

**IDL sync:** The IDL at `server/idl/solshot_escrow.json` has `"address": "CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD"`, matching the `PROGRAM_ID` constant and the `declare_id!` macro in `lib.rs`. All instruction discriminators, account schemas, and event schemas in the IDL match the Rust source. The IDL was confirmed to include all instructions (`cancel_match`, `create_match`, `deposit_wager`, `initialize_config`, `pause_program`, `permissionless_reclaim`, `settle_match`, `unpause_program`, `update_config`), all event types (`MatchActive`, `MatchCancelled`, `MatchCreated`, `MatchSettled`, `WagerDeposited`), and the correct `MatchState` enum variants.

**Account space:** Both account space calculations are correct:
- `GlobalConfig::SPACE = 106` = 8 + 32 + 32 + 32 + 1 + 1
- `MatchEscrow::SPACE = 168` = 8 + (4+32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 8 + 1

The `MatchState` enum is encoded as 1 byte by Borsh (4 variants, fits in u8), consistent with the space calculation.

---

### 8. Findings

#### FINDING-C06-01: Settlement Timeout Creates Fund Lockup Window (MEDIUM)

**Location:** `programs/solshot-escrow/src/lib.rs` lines 236–243; `server/services/solana.js` `settleMatch`; `server/socket-io/main.js` settlement recovery.

**Description:** `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1 hour) defines the window from escrow activation within which the server must call `settle_match`. After this deadline, `settle_match` fails with `SettlementExpired`. The recovery path in `main.js` tries `cancelMatchEscrow`, but `cancel_match` by the authority is restricted to `AwaitingDeposits` state (OC-05), and player cancel requires either `AwaitingDeposits` or a 24-hour timeout from activation. An `Active` match that has been running for 1–24 hours falls into neither case: the server cannot settle (SettlementExpired) or cancel (authority restricted, player not timed out). Funds become accessible only via `permissionless_reclaim` after 48 hours.

A BO5 match can realistically run longer than 1 hour. The turn timer is 60 seconds per turn, the shop phase is 30 seconds per round, and a BO5 has up to 5 rounds. Slow players making full use of the turn timer can exceed the 1-hour window.

**Recommendation:** Either increase `SETTLEMENT_TIMEOUT_SECONDS` to cover the realistic maximum match duration (e.g., 8 hours), or add an explicit check in the server settlement flow that calls `cancelMatchEscrow` if `settle_match` fails with `SettlementExpired` and the match is past the 24-hour cancel threshold. The cleanest fix is raising the settlement deadline to match the expected maximum match duration.

**Code:**
```rust
// lib.rs
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600;  // 1 hour — too short for BO5
```

```js
// main.js recovery: if settle fails with SettlementExpired and escrow is Active,
// neither settle nor cancel (by authority) can rescue the funds until 48h
```

---

#### FINDING-C06-02: `refundWager` Silent Success on On-Chain Cancel Failure (LOW)

**Location:** `server/services/solana.js` lines 241–253.

**Description:** When `isEscrowEnabled()` is true and `cancelMatchEscrow` fails, `refundWager` logs an error but falls through to a "Fallback: log refund" path that returns `{ success: true, txSignature: null }`. Callers in `main.js` treat this response as a successful refund. In the primary settlement path, SF-02 correctly propagates failure. However, for cancel/disconnect paths, a failed on-chain refund is silently masked.

This is in contrast to `settleMatch` in the same file, which correctly propagates failure:
```js
// SF-02: Propagate failure — do NOT fall through to dev-mode fallback
console.error('[Solana] On-chain settle failed:', result.error);
return { success: false, error: result.error, settlement };
```

**Recommendation:** Apply the same SF-02 pattern to `refundWager`. When escrow is enabled and `cancelMatchEscrow` fails, return `{ success: false, error: result.error }` and let callers handle it (e.g., route to `handleSettlementFailure`).

**Code:**
```js
// server/services/solana.js
if (isEscrowEnabled() && matchId && playerOneAddress && playerTwoAddress) {
    const result = await cancelMatchEscrow(matchId, playerOneAddress, playerTwoAddress);
    if (result.success) {
        return { success: true, txSignature: result.txSignature };
    }
    console.error('[Solana] On-chain cancel failed:', result.error);
    // BUG: falls through to "success" fallback below — should return failure
}
// Fallback: log refund
return { success: true, txSignature: null };  // misleading when escrow enabled and cancel failed
```

---

#### FINDING-C06-03: `permissionless_reclaim` Bypasses Program Pause Guard (LOW)

**Location:** `programs/solshot-escrow/src/lib.rs` lines 651–681 (`PermissionlessReclaim` account struct).

**Description:** All economic instructions (`create_match`, `deposit_wager`, `settle_match`, `cancel_match`) include the `config` PDA with `constraint = !config.is_paused @ EscrowError::ProgramPaused`. The `PermissionlessReclaim` account struct does not include the `config` PDA at all, so it can be executed even when the program is paused.

This may be intentional — if the server is compromised or offline, the pause-bypass allows anyone to recover funds after 48 hours. However, it is undocumented and inconsistent. If the pause is used to halt all activity during an exploit, an attacker who controls an escrow account key could potentially trigger early permissionless reclaim (they would still need to wait 48 hours, so the attack surface is limited).

**Recommendation:** Add a doc comment to `PermissionlessReclaim` and `permissionless_reclaim` explicitly stating that the pause guard is intentionally absent. Alternatively, add the config account with `constraint = !config.is_paused` if emergency halt should include reclaim.

---

### 9. Items Verified Correct

- **PDA seed consistency:** Identical across server, client tests, and on-chain program.
- **matchId length enforcement:** On-chain `require!(match_id.len() <= 32)` is the final gate. Server-generated 8-char IDs are well within limit.
- **PDA collision resistance:** `crypto.randomBytes(4)` CSPRNG + `init` constraint prevents collisions.
- **Account closure:** `close = authority` (settle), `close = caller` (cancel, reclaim) correctly close accounts and return rent.
- **Stale account replay:** Not possible — Anchor `init` rejects pre-existing accounts at the same PDA address.
- **IDL sync:** IDL `address`, instruction discriminators, account schemas, and error codes all match `lib.rs`.
- **Account space:** Both `GlobalConfig::SPACE` (106) and `MatchEscrow::SPACE` (168) are correct.
- **Authority validation:** Dual `has_one = authority` in `SettleMatch` correctly prevents unauthorized settlement.
- **Winner validation:** On-chain `constraint = winner.key() == escrow.player_one || winner.key() == escrow.player_two` (OC-02) prevents theft.
- **Treasury/ops validation:** On-chain constraint against config PDA (OC-03) prevents fee redirection.
- **Double deposit protection:** `require!(!player_one_deposited)` / `require!(!player_two_deposited)` correctly prevents duplicate deposits.
- **Non-player deposit prevention:** `require!(is_p1 || is_p2, EscrowError::NotAPlayer)` correctly rejects third-party deposits.
- **Client TX validation (CS-01):** `validateEscrowTransaction` in `WalletContext.js` checks the deposit_wager discriminator `[234, 73, 235, 136, 168, 103, 239, 207]` which matches the IDL. Unknown programs in the transaction cause rejection.
- **On-chain deposit verification:** `escrowDepositConfirm` handler queries the PDA state and verifies both deposit flag and wager amount before accepting.
- **Arithmetic:** `u128` widening for BPS math eliminates overflow at max wager (OC-09). Winner gets remainder to avoid dust loss.
- **State-before-transfer:** Settled/Cancelled state is set before any lamport moves (OC-10).
- **Wallet ordering consistency:** `createMatchEscrow(roomId, wager, hostWallet, joinerWallet)` always places host as `player_one`. `cancelMatchEscrow` reads `wallets[host.socketId]` as p1 and `wallets[player.socketId]` as p2, consistent with creation. Reconnect remapping updates `wagerStates.wallets` correctly.
- **program.programId vs PROGRAM_ID:** `new Program(idl, provider)` in Anchor 0.32 extracts programId from `idl.address`, making `program.programId === PROGRAM_ID`. The single inconsistency in `permissionlessReclaimEscrow` (line 485) is functionally equivalent.
- **Test coverage:** 8 test groups cover config init, pause/unpause, match creation guards, deposit transition to Active, settlement with all constraint violations, cancel with authority restriction, and settlement math.
