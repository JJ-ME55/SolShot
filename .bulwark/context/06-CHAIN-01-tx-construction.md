---
task_id: db-phase1-chain-01
provides: [chain-01-findings, chain-01-invariants]
focus_area: CHAIN-01
files_analyzed:
  - server/services/escrow.js
  - server/services/escrow-v2.js
  - server/services/solana.js
  - server/services/keys.js
  - client/src/wallet/WalletContext.js
  - server/socket-io/main.js (cancelEscrow + deposit flows, lines 278–500, 1613–1622, 3524–3540)
  - server/services/groupchat/lifecycle.js (cancelMatchEscrowV2 call, lines 875–920)
finding_count: 12
severity_breakdown: {critical: 1, high: 5, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# CHAIN-01: Transaction Construction & Signing — Condensed Summary

## Key Findings (Top 10)

- **H023 sync is PARTIALLY ADDRESSED but has a critical gap in the v1 recovery path**: `cancelEscrowSafely()` in `main.js` derives depositor count from in-memory `wagerStates[roomId]` and passes that exact count to `cancelMatchEscrow()`. Because the on-chain H023 fix now requires `remaining_accounts.len() == count_ones(deposits_mask)`, the server count MUST match what the chain believes the mask is. If the in-memory `ws.deposits` map diverges from actual on-chain `depositsMask` (e.g., due to a false-positive `escrowDepositConfirm` event), the count will mismatch and every cancel call will throw `EscrowError::IncompleteRefund`. — `server/socket-io/main.js:433–494`, `server/services/escrow.js:439–475`

- **v2 cancel path uses player `initialDepositTx` field as the deposit sentinel**: `lifecycle.js` counts deposited players by checking `p.initialDepositTx != null` (line 897). This is an off-chain DB field, not an on-chain bitmask read. If a deposit TX was confirmed on-chain but `initialDepositTx` was never written to the DB (server crash, write failure), the count passed to `cancelMatchEscrowV2()` will be too low, producing `IncompleteRefund` on every cancel attempt. — `server/services/groupchat/lifecycle.js:896–910`

- **`confirmTransaction(signature, 'confirmed')` is the legacy string-based API**: deprecated in `@solana/web3.js` 1.67+ in favor of `confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')`. The deposit and burn paths use the old form, which loses the `lastValidBlockHeight` bound — meaning a TX that expires due to a stale blockhash will hang the client until network timeout rather than failing fast. — `client/src/wallet/WalletContext.js:584`, `:624`, `:654`

- **Burn TX does NOT include blockhash in the deposit-style struct**: `signAndBurnShot()` fetches `getLatestBlockhash()` but assigns only `blockhash` to `tx.recentBlockhash` (not `lastValidBlockHeight`). Confirmation is called with string-form `'confirmed'` and has no timeout. A stuck burn will silently return `null` with no user feedback and emit no socket event — prestige unlock attempt will silently fail. — `client/src/wallet/WalletContext.js:651–655`

- **Client TX validation (`validateEscrowTransaction`) uses only discriminator check — no amount validation**: The client verifies that the instruction is `deposit_wager` (8-byte discriminator match) and comes from a known escrow program. However, the instruction's `wager_lamports` is set server-side and baked into the escrow PDA at `create_match` time — the deposit instruction itself carries no amount arg (it reads from `escrow.wager_lamports`). This is correct by design, but the comment at `CS-01` in WalletContext should note that amount integrity is enforced on-chain, not in the client validator. No exploitable gap; documentation concern. — `client/src/wallet/WalletContext.js:79–110`

- **Server uses `Math.round(wagerSOL * LAMPORTS_PER_SOL)` for wager conversion**: floating-point multiply before rounding. For the current tier set `[0.1, 0.25, 0.5, 1.0]`, all are exactly representable in binary float, so rounding is not an issue. However, `MATCH_MODES.custom_challenge` allows any wager `>= 0.1 SOL`, making arbitrary float → lamport conversion possible. At e.g. `0.3 SOL`: `0.3 * 1e9 = 299999999.99999997`, round → `300000000`. The `Math.round` saves it here, but any wager requiring exactly 3 decimal places could silently round. — `server/services/escrow.js:288`, `server/services/escrow-v2.js:238`

- **`keys.js` confirmed NOT zeroing the secret key bytes**: a comment in `keys.js:54–64` explicitly documents that the prior `bytes.fill(0)` was removed because `Keypair.fromSecretKey()` ALIASES the input buffer. The Keypair's `secretKey` property thus shares a buffer with the original parsed JSON bytes, which remain live in the process heap until GC. In a memory-dump scenario (crash report, heap snapshot in dev), the 64-byte secret key will be visible. No mitigation exists at this layer. — `server/services/keys.js:54–64`

- **No `ComputeBudgetProgram.setComputeUnitLimit()` on v1 `cancelMatch` or `permissionlessReclaim`**: a 4-player v1 match requires 4 iterations of the refund loop, each doing 3 account checks + 2 lamport mutations + `close()`. Default CU limit is 200,000; the v1 program is unlikely to hit it with 4 players, but v2 with up to 10 players has no compute budget instruction. For v2 10-player reclaim: 10 refund loop iterations x (account checks + transfer + close = ~5,000 CU/iter) + program overhead = est. 100–200k CU. Within default limit, but should be measured. — `server/services/escrow.js:487–516`, `server/services/escrow-v2.js:365–388`

- **No pre-flight `simulateTransaction()` before submitting server-side TXs**: server calls `.rpc()` directly on all Anchor method calls. A failed on-chain instruction produces a full RPC error after spending a validator round-trip. Simulation would catch `IncompleteRefund`, `NotActive`, or `AlreadySettled` errors cheaply and allow better error handling. — `server/services/escrow.js:allRpcCalls`, `server/services/escrow-v2.js:allRpcCalls`

- **`confirmTransaction` on deposit path has no timeout; client may hang indefinitely**: `signAndSendEscrowDeposit` and `signAndSendGroupDeposit` both call `connection.confirmTransaction(signature, 'confirmed')` with no abort signal or timeout. If the transaction never confirms (dropped validator, expired blockhash), the async function hangs. The socket event `escrowDepositConfirm` is never emitted. Match hangs waiting for a deposit that will never arrive. — `client/src/wallet/WalletContext.js:583–585`, `:623–625`

- **Deposit TX blockhash freshness**: `buildDepositTransaction()` (v1 and v2) fetches `getLatestBlockhash()` at build time on the server, then serializes the TX and sends it to the client. The client signs and sends. If the round-trip (server → socket → client → user → sign → send) takes longer than ~90 seconds (150 blocks at 600ms/block), the blockhash expires. The TX will fail with `BlockhashNotFound` but the client has no retry logic — it will emit `escrowDepositConfirm` only on success; silence on failure. — `server/services/escrow.js:352`, `server/services/escrow-v2.js:279`

- **`refundWager()` in `solana.js` falls through to dev-mode no-op if `playerAddresses` is empty**: if `playerAddresses.length === 0` the escrow cancel is skipped and the function returns `{ success: true }`. Callers that pass an empty array believing no refunds are needed rely entirely on the caller's own logic to determine who deposited. An off-by-one in caller logic produces a silent skip with no funds locked on-chain. — `server/services/solana.js:246`

## Critical Mechanisms

- **`cancelEscrowSafely()` (v1 / main.js)**: Reads `ws.deposits[socketId]` to build the depositor wallet array in player-index order, derives `contiguous` flag, then calls `cancelMatchEscrow(matchId, wallets)`. The wallet count passed to `cancelMatchEscrow` must exactly match `count_ones(deposits_mask)` on-chain (H023 fix). Trust path: in-memory `wagerStates` map → correct. Failure path: `escrowDepositConfirm` false-positive → count mismatch → `IncompleteRefund`. — `main.js:433–512`

- **`buildDepositTransaction()` (v1 + v2)**: Server builds a `Transaction` containing one `deposit_wager` instruction. Fee payer is the PLAYER (not server). Blockhash fetched at build time. TX serialized (unsigned) and sent to client over socket. Client deserializes, validates discriminator, signs via Privy, broadcasts, and calls `connection.confirmTransaction(sig, 'confirmed')`. — `escrow.js:329–376`, `WalletContext.js:564–596`

- **`settleMatchEscrow()` (v1)**: Server (as authority) calls `.rpc()` with `winner`, `treasury`, `ops` as named accounts. Anchor resolves `config` PDA and `system_program` automatically. Program reads treasury/ops from LIVE config (not snapshot). On-chain H030 risk applies (config rotation between `create_match` and `settle_match`). — `escrow.js:388–427`

- **`settleMatchEscrowV2()` (v2)**: Fetches `escrow.treasurySnapshot` and `escrow.opsSnapshot` from the on-chain account BEFORE calling settle. Uses snapshot addresses (immutable post-create). Immune to mid-flight config rotation. — `escrow-v2.js:301–329`

- **`signAndBurnShot()` (client)**: Builds SPL `createBurnInstruction` locally. Does NOT go through server. No server-side amount validation before the instruction is constructed — amount comes from `PrestigeScreen.js` UI state. Server verifies the burn on-chain after the fact via `verifyBurnTransaction()`. — `WalletContext.js:638–660`

## Invariants & Assumptions

- INVARIANT: `remaining_accounts.len() == count_ones(deposits_mask)` — ENFORCED on-chain (H023 fix in `programs/solshot-escrow/src/lib.rs` and v2), NOT DIRECTLY ENFORCED by server before calling. Server derives count from in-memory `ws.deposits` (v1) or DB `player.initialDepositTx` (v2). ⚠ Off-chain enforcement only.

- INVARIANT: Deposit TX `feePayer` is always the player, never the server keypair — ENFORCED at `escrow.js:357` (`feePayer: player`) and `escrow-v2.js:282` (`feePayer: player`). Server keypair never co-signs deposit TXs. ✓

- INVARIANT: Client validates discriminator before signing deposit TX — ENFORCED at `WalletContext.js:79–110` (`validateEscrowTransaction`). Rejects any TX whose first instruction does not carry the `deposit_wager` discriminator `[234,73,235,136,168,103,239,207]`. ✓ Dev-mode bypass: if `ALLOWED_ESCROW_PROGRAM_IDS` is empty (PRIVY env not set), validation skips silently.

- ASSUMPTION: In-memory `wagerStates[roomId].deposits` accurately reflects on-chain `depositsMask` — UNVALIDATED ⚠. Server never reads on-chain `depositsMask` before building the cancel `remaining_accounts` list. `ws.deposits` is updated only when `escrowDepositConfirm` socket event is received from the client. A network partition or client crash can desync these.

- ASSUMPTION: Blockhash fetched at `buildDepositTransaction()` will remain valid through the client sign-and-send round-trip — UNVALIDATED ⚠. No retry logic exists for `BlockhashNotFound` on the client. If the round-trip exceeds ~90s, the TX will silently fail client-side without the client emitting `escrowDepositConfirm`.

- ASSUMPTION: `connection.confirmTransaction(sig, 'confirmed')` completes within finite time — UNVALIDATED ⚠. No timeout or AbortSignal on the confirmation call. A never-confirming TX hangs the deposit flow silently.

## Risk Observations (Prioritized)

1. **H023 sync gap (CRITICAL)**: On-chain `cancel_match` + `permissionless_reclaim` now require `remaining_accounts.len() == count_ones(deposits_mask)`. Server derives this count from in-memory `ws.deposits` (v1) and DB `player.initialDepositTx` (v2). Both are off-chain sentinels. Any desync between sentinel and on-chain mask → `EscrowError::IncompleteRefund` on EVERY cancel attempt. Net: if player 1 confirms deposit on-chain but server never receives `escrowDepositConfirm` (crash, socket drop), server's count is 1 but mask says 2 → cancel fails. Player 1's wager is stranded pending permissionless reclaim. — `main.js:433–512`, `lifecycle.js:896–910`

2. **`confirmTransaction` hang (HIGH)**: Both `signAndSendEscrowDeposit` and `signAndSendGroupDeposit` call `connection.confirmTransaction(signature, 'confirmed')` with no timeout. A stale blockhash or validator drop causes indefinite hang. Server is waiting for `escrowDepositConfirm`; client is stuck inside the async function. Match cannot start. No user feedback. — `WalletContext.js:584`, `:624`

3. **Burn TX no-op on confirm failure (HIGH)**: `signAndBurnShot()` wraps the confirm in a try/catch that returns `null` on failure. PrestigeScreen receives `null` and should treat it as burn failure. But if the TX was actually submitted and confirmed but the client-side `confirmTransaction` timed out or errored, `null` is returned while the burn already happened on-chain. Server's `verifyBurnTransaction()` would accept the real signature if re-submitted — but the client discards it. Prestige unlock silently does not fire. — `WalletContext.js:638–660`

4. **Blockhash expiry window (HIGH)**: Server fetches blockhash at `buildDepositTransaction()` time. Client receives the serialized TX over socket, user may delay signing (e.g., low battery, slow phone). No freshness check before signing. TX fails with `BlockhashNotFound` if >~90s elapsed. Client has no retry path. — `escrow.js:352`, `escrow-v2.js:279`

5. **v2 lifecycle uses DB field as deposit sentinel (HIGH)**: `lifecycle.js` checks `player.initialDepositTx` to determine who has deposited when building the `cancelMatchEscrowV2` `playerAddresses` array. This is a MongoDB field set after server receives `confirmGroupDeposit`. Server restart between deposit and DB write → field missing → count is 0 → skip cancel (`lifecycle.js:900–904`). Deposit is stranded, pending 24h+ permissionless reclaim. — `lifecycle.js:896–904`

6. **Secret key bytes not zeroed in memory (MEDIUM)**: `keys.js` comment documents that `bytes.fill(0)` was removed because `Keypair.fromSecretKey` aliases the input buffer. The raw 64-byte secret key remains in the JS heap as a live `Uint8Array` for the process lifetime. Heap dumps, core dumps, or `--inspect` connections expose it. — `keys.js:54–64`

7. **No TX simulation before `.rpc()` calls (MEDIUM)**: All Anchor `.rpc()` calls fire directly without first calling `provider.connection.simulateTransaction()`. On-chain errors (wrong state, wrong accounts, IncompleteRefund) are only surfaced after the full round-trip. Simulation at the server would catch errors before they consume a full slot and improve error messages. — `escrow.js:all`, `escrow-v2.js:all`

8. **`Math.round(wagerSOL * LAMPORTS_PER_SOL)` on non-tier wagers (MEDIUM)**: Custom Challenge allows any wager ≥ 0.1 SOL. Float multiply for values with 3+ decimal places (e.g., 0.003, 0.007) can under- or over-round by 1 lamport. The on-chain escrow checks wager amounts with `==` comparison at deposit time — a 1-lamport discrepancy causes `InvalidWagerAmount`. Server should use integer-based conversion: `Math.round(wagerSOL * 1e9)` is fine for values up to 2^53/1e9 ≈ 9 million SOL. — `escrow.js:288`, `escrow-v2.js:238`

9. **Dev mode bypasses discriminator validation (LOW)**: If `REACT_APP_ESCROW_PROGRAM_ID` is not set (`ALLOWED_ESCROW_PROGRAM_IDS` is empty), `validateEscrowTransaction` returns `{ valid: true }` without checking anything. A misconfigured production deploy would sign any TX blindly. — `WalletContext.js:80–82`

10. **`refundWager()` silent success on empty `playerAddresses` (LOW)**: `solana.js:246` skips the escrow cancel if `playerAddresses.length === 0` and returns `{ success: true }`. Callers can pass an empty array and believe the refund succeeded. The comment says "escrow cancel is a no-op if nobody deposited" — but there is no guard against callers accidentally deriving an empty list when funds ARE locked. — `solana.js:246`

## Novel Attack Surface

- **False-positive `escrowDepositConfirm` desync**: The client emits `escrowDepositConfirm` over Socket.IO after `confirmTransaction`. A malicious client (or a user who intercepts their own socket connection) can emit `escrowDepositConfirm` without ever submitting a real deposit TX. Server currently verifies this event via `getEscrowState()` on-chain only for the "did both players deposit" check; the `ws.deposits[socketId]` map is updated immediately on the socket event without waiting for on-chain verification. This means `cancelEscrowSafely()` will include a non-depositor wallet in `remaining_accounts`, and since H023 is now enforced, the count will mismatch on-chain (`len = 2` but `count_ones(mask) = 1`) → cancel throws `IncompleteRefund`. Net: malicious player can prevent cancellation of a match where only they themselves did NOT deposit, stranding the real depositor's wager until permissionless reclaim. — `main.js:escrowDepositConfirm handler`, `main.js:433–512`

- **Wallet rotation impact**: Privy allows users to link external wallets. If a user signs in with wallet A, starts a match deposit flow, then rotates to wallet B mid-flow (via Privy's "link wallet" feature), the deposit TX was built with wallet A as `player` and fee payer. If wallet B tries to send it (different `feePayer` and signer), the TX will fail on-chain. No detection at the client layer — `privyWallet` is picked dynamically and `findWalletByName('Privy')` could return a different address. — `WalletContext.js:218–226`

## Cross-Focus Handoffs

- → **CHAIN-02 (RPC Trust)**: Both escrow services share a single `Connection(SOLANA_RPC, 'confirmed')`. If the RPC endpoint is compromised or provides stale data, `getEscrowState()` results are wrong, and `confirmTransaction()` outcomes are unreliable. Investigate what happens when RPC returns stale blockhash or wrong account state.

- → **ERR-02 (Race Conditions)**: `ws.deposits` in `main.js` is updated in the `escrowDepositConfirm` handler (async Socket.IO event). In a 4-player match, 4 concurrent confirmations arrive close together. Each reads `ws.deposits`, writes to it, then checks `numDeposited === totalPlayers`. Since JS is single-threaded (event loop), this is safe — but only if no `await` exists between read and write. Verify no async gap in the deposit confirm handler.

- → **ERR-01 (Error Handling)**: `cancelEscrowSafely()` and `handleSettlementFailure()` in `main.js` — what happens if both the cancel and the retry queue fail? There is no final fallback that alerts ops or writes an irrecoverable state to the DB. A match can silently drop from the retry queue after `maxAttempts` without any notification. Investigate the alert/monitoring path for stranded escrow PDAs.

- → **AUTH-03 (Authorization)**: `permissionlessReclaimEscrowV2()` is called with `provider.wallet.publicKey` as `caller` — the server's own authority keypair. But permissionless reclaim is designed to be called by ANYONE. Is the server ever triggering this on behalf of users? If so, the server gets the rent incentive, not the triggering user. Verify if external callers can trigger the reclaim or if only the server does.

## Trust Boundaries

The TX construction trust boundary is split three ways: (1) The **server** builds deposit TXs and signs settle/cancel TXs with the authority keypair. The server is trusted to build correct instructions and pass correct accounts. (2) The **client** signs deposit TXs after discriminator validation. The client is NOT trusted to provide correct amounts — the wager is baked into the on-chain `MatchEscrow.wager_lamports` and is not an instruction argument. (3) The **on-chain program** is the final arbiter via H023's `require!(remaining_accounts.len() == count_ones(deposits_mask))`. The critical trust gap is between the server's in-memory deposit tracking (`ws.deposits`, DB `initialDepositTx`) and the actual on-chain `depositsMask`. These can diverge, and when they do, the H023 fix causes every cancel attempt to throw `IncompleteRefund`, converting a temporary desync into permanent fund lockup pending permissionless reclaim timeout.
<!-- CONDENSED_SUMMARY_END -->

---

# CHAIN-01: Transaction Construction & Signing — Full Analysis

## Executive Summary

The off-chain TX construction layer for SolShot's wagered matches has solid structural foundations: Anchor 0.32.1 auto-resolution is correctly applied, BN is properly imported from `bn.js` directly, deposit TXs are built server-side with the player as fee payer, and the client validates the discriminator before signing. The H023 on-chain fix (requiring `remaining_accounts.len() == count_ones(deposits_mask)`) is real and landed in the programs, but the server-side code that drives refund calls has a critical synchronization gap: it derives depositor counts from in-memory / DB state, not from an on-chain read of `depositsMask`. When these diverge — a realistic scenario under server crash, socket drop, or false-positive confirmation event — every cancel call will fail with `IncompleteRefund`, permanently stranding funds until permissionless reclaim fires (2h for v1, 24h for v2).

Secondary concerns are operational but meaningful: the client uses deprecated `confirmTransaction` string-form with no timeout, stale-blockhash expiry on deposit TXs has no retry path, and the burn TX has no `lastValidBlockHeight` binding.

## Scope

**In scope:** `server/services/escrow.js`, `server/services/escrow-v2.js`, `server/services/solana.js`, `server/services/keys.js`, `client/src/wallet/WalletContext.js`, and relevant portions of `server/socket-io/main.js` (deposit confirm handler, `cancelEscrowSafely`, `getEscrowDepositors`) and `server/services/groupchat/lifecycle.js` (cancel path).

**Out of scope:** On-chain Anchor programs in `programs/`. Settlement math verification (covered by BOK Audit #2). RPC trust and node selection (CHAIN-02).

## Scope: TX Inventory

| TX | Builder | Signer | Fee Payer | Method |
|----|---------|--------|-----------|--------|
| `create_match` (v1+v2) | Server | Server keypair | Server keypair | `program.methods.createMatch().accounts({authority}).rpc()` |
| `deposit_wager` (v1) | Server | Player (via Privy) | Player | `buildDepositTransaction()` → serialize → client signs + broadcasts |
| `deposit_wager` (v2) | Server | Player (via Privy) | Player | `buildDepositTransactionV2()` → serialize → client signs + broadcasts |
| `settle_match` (v1+v2) | Server | Server keypair | Server keypair | `settleMatchEscrow()` / `settleMatchEscrowV2()` |
| `cancel_match` (v1) | Server | Server keypair | Server keypair | `cancelMatchEscrow(matchId, playerAddresses)` |
| `cancel_match` (v2) | Server | Server keypair | Server keypair | `cancelMatchEscrowV2(matchId, playerAddresses)` |
| `permissionless_reclaim` (v1) | Server | Server keypair | Server keypair | `permissionlessReclaimEscrow(matchId, playerAddresses)` |
| `permissionless_reclaim` (v2) | Server | Server keypair | Server keypair | `permissionlessReclaimEscrowV2(matchId, playerAddresses)` |
| `start_with_depositors` (v1+v2) | Server | Server keypair | Server keypair | `startWithDepositorsEscrow()` / V2 variant |
| `initialize_config` / `update_config` / `pause` / `unpause` | Server | Server keypair | Server keypair | Direct `.rpc()` calls |
| SHOT burn | Client | Player (via Privy) | Player | `signAndBurnShot()` — local SPL instruction build, direct broadcast |
| Auth sign-message | Client | Player (via Privy) | N/A (off-chain) | `signMessageUnified()` → emit `authenticate` socket event |

## Key Mechanisms

### 1. H023 Fix Sync (CRITICAL)

**On-chain state:** The Anchor programs (v1 + v2) now have `require!(remaining_accounts.len() == deposits_mask.count_ones() as usize, EscrowError::IncompleteRefund)` before every refund loop site. This is confirmed in `Docs/REMEDIATION_DECISIONS.md` Section 1.

**Server v1 path (`cancelEscrowSafely` in `main.js`):**
```
getEscrowDepositors(room, ws) → { wallets, contiguous, mask }
  - iterates room.players[0..n]
  - checks ws.deposits[socketId] (in-memory Map)
  - if yes: pushes wallet, sets mask bit
cancelMatchEscrow(matchId, wallets)
  - builds remainingAccounts from wallets array
  - len(wallets) === count_ones(mask) — true BY DEFINITION of the above loop
```

This is internally consistent: the loop itself maintains `len(wallets) == count_ones(mask)` because it adds a wallet IFF it sets the mask bit. BUT the critical question is whether `ws.deposits` agrees with on-chain `depositsMask`. If they diverge, the count passed to the on-chain instruction will mismatch the on-chain state.

**Divergence scenarios:**
1. Player sends `escrowDepositConfirm` socket event WITHOUT actually depositing → `ws.deposits[sid]` is set → wallet count = 2, but on-chain mask = 1 → cancel throws `IncompleteRefund`.
2. Player deposits on-chain, but socket disconnects before sending `escrowDepositConfirm` → `ws.deposits[sid]` is NOT set → wallet count = 1, but on-chain mask = 2 → cancel throws `IncompleteRefund`.
3. Server restarts → `wagerStates` is reset → wallet count = 0, but on-chain mask may be 1 or 2 → cancel throws `IncompleteRefund`.

**Server v2 path (`cancelMatchEscrowV2` in `lifecycle.js:896–910`):**
```javascript
const depositedWallets = match.players
    .map((p, i) => p.initialDepositTx ? { wallet: p.walletAddress, slot: i } : null)
    .filter(x => x !== null);
cancelMatchEscrowV2(match.matchId, depositedWallets.map(d => d.wallet))
```
Uses `p.initialDepositTx != null` as the sentinel — a MongoDB field set when the server processes `confirmGroupDeposit`. Same divergence risk as v1: if MongoDB write fails or server crashes between on-chain confirmation and DB write, the count will be wrong.

**Verdict:** H023 on-chain fix is present, but server-side callers are NOT synchronized against the on-chain `depositsMask` before calling. This is a CRITICAL gap.

### 2. Anchor 0.32.1 Auto-Resolution Compliance

Reviewed all `.accounts({...})` calls across both escrow services. Findings:

| Instruction | Explicit Accounts Passed | Notes |
|-------------|--------------------------|-------|
| `initializeConfig` | `payer` | ✓ config + system_program auto-resolved |
| `updateConfig` | `authority` | ✓ |
| `pauseProgram` | `authority` | ✓ |
| `unpauseProgram` | `authority` | ✓ |
| `createMatch` (v1) | `authority` | ✓ — escrow PDA (account-derived), config, system_program all auto-resolved |
| `createMatch` (v2) | `authority` | ✓ |
| `depositWager` (v1) | `escrow`, `player` | ✓ — escrow passed explicitly (account-derived PDA), config+system_program auto-resolved |
| `depositWager` (v2) | `escrow`, `player` | ✓ |
| `settleMatch` (v1) | `escrow`, `authority`, `winner`, `treasury`, `ops` | ✓ — config+system_program auto-resolved |
| `settleMatch` (v2) | `escrow`, `authority`, `winner`, `treasury`, `ops` | ✓ |
| `cancelMatch` (v1) | `escrow`, `caller` | ✓ + `remainingAccounts` |
| `cancelMatch` (v2) | `escrow`, `caller` | ✓ + `remainingAccounts` |
| `permissionlessReclaim` (v1) | `escrow`, `caller` | ✓ + `remainingAccounts` |
| `permissionlessReclaim` (v2) | `escrow`, `caller` | ✓ + `remainingAccounts` |
| `startWithDepositors` (v1) | `escrow`, `authority` | ✓ — config auto-resolved |
| `startWithDepositors` (v2) | `escrow`, `authority` | ✓ |

**Verdict:** Anchor 0.32.1 auto-resolution compliance is CORRECT across all instructions. No explicit passing of PDA-with-constant-seeds accounts. The `escrow` PDA is correctly passed explicitly in all instructions where it exists on-chain (account-derived seed `["match", match_id]`).

### 3. TX Signing Flow

**Server side:**
- `getEscrowKeypair()` returns the `Keypair` from `keys.js`
- `AnchorProvider` wraps it as `new Wallet(escrowKeypair)` — sets `provider.wallet = escrowKeypair`
- `.rpc()` calls have Anchor auto-add the `provider.wallet` as signer
- No double-signing: the authority keypair signs ONCE per instruction

**Client side (Privy):**
- `sendTransactionUnified()` calls `privySignTransactionFn({ transaction: new Uint8Array(serialized), wallet: privyWallet, chain: PRIVY_SOLANA_CHAIN })`
- Privy signs in an isolated iframe/process
- Signed result is `signResult.signedTransaction` (Uint8Array)
- Client broadcasts via own `Connection.sendRawTransaction()`
- The explicit `chain: PRIVY_SOLANA_CHAIN` prevents mainnet/devnet mismatch (documented at `WalletContext.js:49`)

**No double-signing risk:** deposit TXs are unsigned when serialized server-side (`requireAllSignatures: false`). Client is the sole signer. Server keypair is NOT a required signer on deposit instructions.

### 4. Blockhash Handling

**Deposit TXs:**
`buildDepositTransaction()` (v1, `escrow.js:352`):
```javascript
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: player });
```
`lastValidBlockHeight` is included in the `Transaction` constructor. This is correct — the TX object will expire gracefully. However, the client confirms with:
```javascript
await connection.confirmTransaction(signature, 'confirmed');
```
This is the legacy string-based form. The correct modern form is:
```javascript
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
```
The legacy form does not use `lastValidBlockHeight` to bound the confirmation wait, meaning it will retry past expiry.

**Burn TXs (`signAndBurnShot`):**
```javascript
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
// lastValidBlockHeight NOT captured or used
const signature = await sendTransactionUnified(tx, connection);
await connection.confirmTransaction(signature, 'confirmed');
```
Both missing `lastValidBlockHeight` storage AND using legacy confirm form. Burn TXs can hang indefinitely.

**Server-built TXs (settle, cancel):**
All use `program.methods.XYZ().rpc()` which internally handles blockhash. Anchor's `.rpc()` method uses the provider's connection and handles blockhash internally.

### 5. RPC Endpoint

`SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com'` — used in both `escrow.js:46` and `escrow-v2.js:45`. Client uses `REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK)`.

- Single point of failure: no failover/retry logic in escrow service initialization.
- Devnet fallback has no rate limiting — sustained load could hit public RPC limits.
- Server and client may use different RPC endpoints (server env var vs client env var), potentially seeing different chain states momentarily.

### 6. Compute Unit Limits

No `ComputeBudgetProgram` instructions found anywhere in the codebase. For v2 10-player reclaim, estimated CU consumption:
- 10 iterations × ~10,000 CU/iteration = ~100,000 CU
- Plus program overhead: ~15,000 CU
- Total: ~115,000 CU — within 200,000 CU default

However, this is an estimate. The BOK audit flags this as `G001 (coverage gap)` — devnet stress test needed. For mainnet with max wager matches, a failed TX due to CU exhaustion would leave funds locked until permissionless reclaim.

### 7. Client-Side `signAndSendEscrowDeposit` Analysis

The deposit flow:
1. Server builds TX (unsigned) via `buildDepositTransaction()` / V2 variant
2. TX serialized to base64 and sent to client over Socket.IO `escrowDeposit` event
3. Client deserializes: `Transaction.from(Buffer.from(serializedTxBase64, 'base64'))`
4. `validateEscrowTransaction(tx)` checks:
   - At least one instruction exists
   - Every instruction's program ID is either an allowed escrow program or `ComputeBudgetProgram`
   - The escrow instruction has the correct 8-byte discriminator
5. If valid: `sendTransactionUnified(tx, connection)` → Privy signs → client broadcasts
6. `connection.confirmTransaction(signature, 'confirmed')` — no timeout
7. On success: `socket.emit('escrowDepositConfirm', { roomId, txSignature })`

**Amount integrity:** The instruction carries NO wager amount — the amount is stored on the `MatchEscrow` account at `create_match` time. The player deposits exactly what the on-chain escrow says. The client cannot manipulate the amount.

**Match ID integrity:** The `escrow` PDA address is derived from `["match", matchId]`. The client passes the `escrowPDA` as an account reference — if a malicious server built a TX with a different matchId's PDA, the instruction would deposit to the wrong escrow. But the server built the TX, so this would be a server-side attack, not a client-side one.

**Privy wallet alignment:** `validateEscrowTransaction` does not verify that `tx.feePayer` matches the currently connected wallet. If the server built the TX for wallet A but wallet B is now the connected wallet, Privy will sign with wallet B, but `tx.feePayer` is still wallet A. This may or may not cause a fee payer mismatch error at the validator depending on whether the TX requires the fee payer to be a signer.

### 8. BN / u64 Conversion

`BN` is imported from `bn.js` directly in both `escrow.js:25` and `escrow-v2.js:30`:
```javascript
import BN from 'bn.js';
```
This is the project memory's documented fix for the Anchor 0.32.1 breaking change (where `@coral-xyz/anchor` stopped re-exporting BN). Confirmed correct.

Wager conversion:
- v1: `new BN(Math.round(wagerSOL * LAMPORTS_PER_SOL))` — `escrow.js:300`
- v2: `new BN(Math.round(wagerSOL * LAMPORTS_PER_SOL))` — `escrow-v2.js:245`

`Math.round(wagerSOL * LAMPORTS_PER_SOL)`: for the standard tier set `[0.1, 0.25, 0.5, 1.0]`, all are representable. For Custom Challenge arbitrary values, floating-point rounding may occur. `BN` takes a number; if the number is not an integer, `BN` will floor it. Fortunately `Math.round` runs first. The real risk is values like `0.001 SOL` where float multiply gives `999999.9999...` → rounds to `1000000`. This is correct behavior.

For settlement, `calculateSettlement()` uses `Math.round(totalWagerSOL * LAMPORTS_PER_SOL)` — same pattern. But settlement is off-chain display only; actual on-chain settlement math uses BPS (basis points) in integer lamports, which is correct.

### 9. Idempotency

**Double-deposit:** On-chain, the deposit instruction checks `deposits_mask` bit for the player's index. If already set, it rejects with `AlreadyDeposited`. Network retry of a confirmed deposit TX will hit this. Server has no retry logic for deposit — client emits `escrowDepositConfirm` once on success. Safe.

**Double-settle:** On-chain, `settle_match` checks state == `Active`. After settlement, state == `Settled`. Second call rejects with `NotActive`. Safe.

**Double-cancel:** On-chain, `cancel_match` checks state != `Settled`. After cancellation, PDA is closed. Second call fails with account-does-not-exist. Safe.

**Server retry queue (`failedSettlements`):** The in-memory retry queue retries `cancelMatchEscrow` up to `maxAttempts` times at 60-second intervals. If the TX eventually succeeds, it's removed. If all retries fail (e.g., due to H023 IncompleteRefund), it's silently dropped from the queue (`main.js:330–332`). No alert, no DB record of the stranded escrow.

### 10. Privy Embedded Wallet TX Flow

Privy signs in an iframe-isolated context. The `privySignTransactionFn` call:
```javascript
await privySignTransactionFn({
    transaction: new Uint8Array(serialized),
    wallet: privyWallet,
    chain: PRIVY_SOLANA_CHAIN,
})
```
Privy's iframe renders the TX contents (in theory) — but for embedded wallets with `showWalletUIs: false` in `signAndSendEscrowDeposit`, the confirmation modal MAY be suppressed. `sendTransactionUnified` does not pass `uiOptions` — checking the code: `uiOptions` is only in `signMessageUnified`. So the deposit flow does show Privy's UI. Whether the displayed TX contents accurately reflect the instruction's intended effect is a Privy SDK trust question (out of scope for off-chain audit).

The key security property: `PRIVY_SOLANA_CHAIN` is correctly set based on `NETWORK` env var (`WalletContext.js:49`). Without this, signing would default to mainnet even on devnet, causing all TXs to fail.

### 11. `keys.js` Secret Key Memory Residency

The documented gotcha in `keys.js:54–64`:
```
NOTE: We previously ran `bytes.fill(0)` here as KM-04 "zero the
input array". That was wrong: @solana/web3.js Keypair.fromSecretKey
ALIASES the input Uint8Array. Zeroing the input also zeroed the
keypair's internal secret.
```

This means the 64-byte secret key lives in the heap as a `Uint8Array` at the location referenced by both the local `bytes` variable (stack frame, will be GC'd when `initKeys()` returns) AND by `_escrowKeypair.secretKey`. The `bytes` variable goes out of scope after `initKeys()` returns, but its buffer may not be GC'd immediately. `_escrowKeypair.secretKey` is a live reference to the same buffer for the process lifetime.

**Impact:** In any heap dump or core dump, the 64-byte secret is readable. For a server process on Render.com, this is in-memory only — no disk exposure unless the platform supports heap snapshot tooling. A V8 `--inspect` session would expose it immediately.

### 12. `window.solWallet` Exposure

`WalletContext.js` context value is consumed by screens via `useSolShotWallet()`. The `signAndSendEscrowDeposit` function is in the context value. Per project memory: "signAndSendEscrowDeposit is exposed on both context value AND `window.solWallet` for Phaser access." However, reviewing `WalletContext.js` directly, there is NO `window.solWallet =` assignment in this file. The project memory mentions this was done, but it's not visible in the current file content. This may have been removed or may be in a different file. Need to verify — but if `signAndSendEscrowDeposit` is on `window`, any script with DOM access can trigger a deposit TX.

## Trust Model

**Layer 1 — Server:** Trusted for TX construction (creates match, builds deposit TX, settles, cancels). Server keypair `HPyV…nokv` is the authority. Single point of failure. SOLANA_KEYPAIR_JSON / SOLANA_KEYPAIR_PATH env vars must be secured.

**Layer 2 — Client:** Untrusted for instruction content (amount, accounts). Client validates discriminator only. Client controls fee-payer wallet (must match Privy embedded wallet). Client confirms on-chain.

**Layer 3 — On-chain program:** Final arbiter. Validates all accounts, amounts, states, and H023 `remaining_accounts` count. Cannot be bypassed by client or server except via authority key compromise.

**Trust gap:** Server's in-memory/DB deposit state vs. on-chain `depositsMask`. This is the H023 sync gap described in Finding #1 and is the primary risk item for this focus area.

## Dependencies

- `@coral-xyz/anchor` 0.32.1 — `.rpc()`, `.instruction()`, `.accounts()`, `.remainingAccounts()`
- `bn.js` — BN arithmetic for wager lamports
- `@solana/web3.js` — `Connection`, `PublicKey`, `Transaction`, `LAMPORTS_PER_SOL`
- `@solana/spl-token` — `createBurnInstruction`, `getAssociatedTokenAddress` (client only)
- `@privy-io/react-auth/solana` — `useSignTransaction`, `useSignMessage` (client only)
- Devnet RPC: `https://api.devnet.solana.com` (default) or `SOLANA_RPC` env var

## Cross-Focus Intersections

- **SEC-01:** `keys.js` secret key memory residency is a CHAIN-01 × SEC-01 intersection. The key is used for TX signing here but the residency concern belongs to SEC-01.
- **ERR-01:** `confirmTransaction` hang is CHAIN-01 × ERR-01. The async hang with no timeout is an error handling failure.
- **ERR-02:** `ws.deposits` concurrent update in multi-player deposit flow is CHAIN-01 × ERR-02. JS event loop protects but should be verified.
- **CHAIN-02:** RPC endpoint trust is out of scope here but the single `Connection` instance is shared for both TX submission and on-chain reads.
- **CHAIN-06:** PDA derivation is used in every transaction builder. The `getEscrowPDA(matchId)` vs. `getConfigPDA()` distinction is correctly maintained.

## Risk Observations

| # | Concern | File:Line | Severity | Impact |
|---|---------|-----------|----------|--------|
| 1 | H023 sync gap: in-memory vs on-chain deposit count mismatch | `main.js:433–512`, `lifecycle.js:896–910` | CRITICAL | Cancel fails with IncompleteRefund; funds stranded |
| 2 | `confirmTransaction` no timeout (deposits + burns) | `WalletContext.js:584,624,654` | HIGH | Silent hang; match never starts or prestige never unlocks |
| 3 | Burn TX no `lastValidBlockHeight` | `WalletContext.js:651–655` | HIGH | TX expiry not detected; confirm hangs past expiry |
| 4 | Blockhash expiry: no client retry on `BlockhashNotFound` | `escrow.js:352`, `escrow-v2.js:279` | HIGH | Deposit silently fails if sign takes >90s |
| 5 | v2 cancel uses DB `initialDepositTx` as on-chain truth | `lifecycle.js:896–910` | HIGH | DB desync → IncompleteRefund on cancel |
| 6 | Secret key not zeroed; aliased buffer live in heap | `keys.js:54–64` | MEDIUM | Key visible in heap dumps, inspector |
| 7 | No TX simulation before `.rpc()` | `escrow.js`, `escrow-v2.js` (all) | MEDIUM | Poor error messages; wasted validator round-trips |
| 8 | Float→lamport conversion on custom wager amounts | `escrow.js:288`, `escrow-v2.js:238` | MEDIUM | Off-by-1 lamport possible for non-standard amounts |
| 9 | Dev-mode discriminator bypass (empty program ID list) | `WalletContext.js:80–82` | LOW | Mis-configured prod would sign any TX |
| 10 | `refundWager()` silent success on empty `playerAddresses` | `solana.js:246` | LOW | Silent no-op when caller passes wrong list |
| 11 | Failed settlement retry queue drops silently after maxAttempts | `main.js:326–355` | MEDIUM | No alert for permanently stranded escrow |
| 12 | `window.solWallet` exposure (need to verify current state) | project memory | MEDIUM | Any XSS can trigger deposit TX if still exposed |

## Novel Attack Surface Observations

**Cross-socket deposit spoofing to trigger IncompleteRefund:**
A malicious player can exploit the async gap between on-chain deposit confirmation and server-side `ws.deposits` update:
1. Player A deposits on-chain (mask bit 0 set).
2. Player A immediately sends `escrowDepositConfirm` for themselves AND emits a fake `escrowDepositConfirm` for Player B (via custom socket client).
3. Server marks both as deposited in `ws.deposits`.
4. Match starts (all confirmed).
5. Player A loses the match.
6. Server calls `settleMatch`. If settlement fails for any reason, `cancelEscrowSafely` is called.
7. `getEscrowDepositors` returns 2 wallets (both "confirmed" per `ws.deposits`).
8. `cancelMatchEscrow(matchId, [walletA, walletB])` is called.
9. On-chain mask is `0b01` (only Player A deposited) → count_ones = 1, but remaining_accounts.len = 2 → `IncompleteRefund`.
10. Cancel fails. Player A's wager is stranded until 2h permissionless reclaim.

This is primarily a self-harm attack (Player A loses their own funds), but it demonstrates the desync attack surface. It could be weaponized if combined with a scenario where Player B actually did deposit (both deposited, but Player A wants to strand Player B's refund post-settlement-failure).

**Mitigation path:** Server should read `getEscrowState(matchId).depositsMask` before calling cancel, and derive `playerAddresses` from the on-chain mask rather than in-memory state.

## Questions for Other Focus Areas

1. **ERR-02:** In the `escrowDepositConfirm` Socket.IO handler in `main.js`, is there an `await` between reading `ws.deposits` and writing to it? If yes, two concurrent confirmations could produce a race where `numDeposited` is checked at an inconsistent state.

2. **CHAIN-02:** Does the RPC used for `getEscrowState()` (the on-chain read used to build escrow state displays) use `'confirmed'` commitment? Is there a scenario where the RPC returns a pre-deposit state due to caching or propagation delay, causing a false "not deposited" when the player has already deposited?

3. **ERR-01:** After `failedSettlements.delete(matchId)` at retry queue exhaustion (`main.js:330–332`), what happens to the players? Is there a server-side notification to ops? Is there a UI fallback for players in that match?

4. **AUTH-03:** `permissionlessReclaimEscrowV2` uses `provider.wallet.publicKey` as `caller`. Is the server running this proactively, or only as a last resort? If proactively, is there a race condition where the server calls reclaim while a cancel is in flight?

## Raw Notes

- `escrow-v2.js` has `countBits` using `>>>=` (unsigned right shift) which is correct for u16 values. `escrow.js` uses `>>=` (signed right shift) — for values up to u8 (255) this is fine, but if `depositsMask` is ever treated as larger, unsigned shift is safer.
- The comment on `permissionlessReclaimEscrow` says "48h safety refund (DCA-02)" but the `REMEDIATION_DECISIONS.md` says the timeout was reduced to 2h (from H040 fix). The function comment is stale.
- `solana.js:289` exports `startWithDepositorsEscrow` from `escrow.js` but NOT `startWithDepositorsEscrowV2` — lifecycle.js must import it directly.
- v2's `settleMatchEscrowV2()` fetches the escrow account before calling settle to get snapshot addresses. This is an extra RPC call that doesn't exist in v1. Race condition: between the fetch and the settle TX, could someone cancel the escrow? If yes, the fetch returns a closed account and the settle call will fail with `AccountNotFound`. Server handles this via `try/catch` returning `{ success: false }`, which triggers `handleSettlementFailure()`.
- `escrow.js:PROGRAM_ID` and `escrow-v2.js:PROGRAM_ID` are module-level constants. They cannot be changed at runtime. If a redeploy produces a new program ID, the service must be restarted with updated code. No runtime config path exists.

---

**One-line summary:** H023 on-chain fix is present in both programs, but server-side callers derive deposit counts from in-memory/DB state rather than on-chain `depositsMask` — any desync between these (crash, socket drop, false confirmation event) converts a temporary glitch into a permanent fund lockup until permissionless reclaim fires.
