<!-- CONDENSED_SUMMARY_START -->
---
task_id: CHAIN-01
auditor: Transaction Construction & Signing
date: 2026-02-23
files_reviewed:
  - server/services/escrow.js
  - server/services/solana.js
  - server/services/shot-token.js
  - client/src/wallet/WalletContext.js
  - server/socket-io/main.js (escrow sections)
  - tests/solshot-escrow.ts
  - programs/solshot-escrow/src/lib.rs
severity_counts:
  critical: 0
  high: 3
  medium: 3
  low: 2
  informational: 4
---

## Condensed Findings

[HIGH] Deprecated `confirmTransaction(signature, commitment)` API used in client — `WalletContext.js` calls `connection.confirmTransaction(signature, 'confirmed')` (the legacy signature-only overload) for both the escrow deposit and the SHOT burn transaction. This overload does not use the `lastValidBlockHeight` expiry and cannot distinguish between a dropped transaction and a slow one, raising the risk of false-positive confirmation or indefinite hang. The modern strategy overload `{ signature, blockhash, lastValidBlockHeight }` should be used instead. (`client/src/wallet/WalletContext.js:234, 288`)

[HIGH] SHOT burn TX blockhash fetched without `lastValidBlockHeight` capture — `signAndBurnShot` fetches `{ blockhash }` from `getLatestBlockhash()` but discards `lastValidBlockHeight`. The blockhash is set on `tx.recentBlockhash` and the transaction is submitted, but confirmation uses only the signature overload. If the transaction expires (blockhash invalid after ~150 slots, ~60-90 seconds), the client gets no actionable error and cannot retry safely. (`client/src/wallet/WalletContext.js:280-289`)

[HIGH] `escrowDepositConfirm` server handler relies on polling `getEscrowState` with only one 2-second retry — the server reads on-chain state immediately after the client emits `escrowDepositConfirm`. On Solana devnet (and occasionally mainnet), RPC propagation can lag several seconds. A single retry with a 2-second delay is insufficient for `confirmed` commitment on a loaded network. If the on-chain read fails both attempts, the server emits `escrowError: 'Deposit not confirmed on-chain'` and the room stalls — neither escrow is cancelled nor game started. This creates a liveness failure that requires the 2-minute deposit timeout to resolve. (`server/socket-io/main.js:1743-1763`)

[MEDIUM] `wagerLamports` comparison uses `!==` on a `Number` vs `BN.toNumber()` — `getEscrowState` returns `wagerLamports: escrow.wagerLamports.toNumber()` (a JS Number). The comparison `escrowState.wagerLamports !== expectedLamports` at line 1769 of `main.js` works correctly for wagers up to `2^53 - 1` lamports (~9007 SOL). The current max wager is 100 SOL (10^11 lamports), well within safe integer range. However, if the on-chain `wagerLamports` is ever a BN value that overflows `Number` (e.g., due to a bug or configuration change), `.toNumber()` silently rounds, causing a comparison mismatch that incorrectly rejects a valid deposit. Strict `BigInt` arithmetic would be safer for lamport comparisons. (`server/services/escrow.js:529`, `server/socket-io/main.js:1769`)

[MEDIUM] Server-side `buildDepositTransaction` builds a legacy `Transaction` with `blockhash` from `getLatestBlockhash()`, but the client re-uses that same serialized transaction up to the 2-minute deposit window. Blockhashes expire after approximately 150 slots (~60-90 seconds on mainnet, faster on devnet). If the client delays beyond this window, the deposit TX will be rejected by the validator as `BlockhashNotFound`. There is no server-side TX refresh mechanism — the client has no way to request a fresh-blockhash version of the same deposit TX without re-entering the escrow flow. The 120-second `DEPOSIT_TIMEOUT_MS` slightly exceeds the typical blockhash lifetime, meaning late depositors are silently failed rather than explicitly rejected. (`server/services/escrow.js:348-361`, `server/socket-io/main.js:56`)

[MEDIUM] `confirmTransaction` in both client flows (escrow deposit and SHOT burn) is called without a timeout or abort signal — if the Solana RPC node is unresponsive, `confirmTransaction` hangs indefinitely. The escrow deposit flow would stall the React component state indefinitely; the SHOT burn flow would leave the user on a "burning..." screen with no timeout UI feedback. There is no `AbortController` or `Promise.race` with a timeout. (`client/src/wallet/WalletContext.js:234, 288`)

[LOW] The `validateEscrowTransaction` discriminator check correctly identifies `deposit_wager` instructions but does not validate the instruction's account keys (escrow PDA, player pubkey, config PDA). A hypothetical compromise scenario where the correct discriminator is used with a different escrow PDA account (targeting a different player's escrow) would pass client-side validation but be rejected on-chain by the PDA seed derivation check. The on-chain defense is the correct backstop, but adding an account key check client-side (verifying the escrow PDA matches the expected derivation for the given `roomId`) would add defense-in-depth. (`client/src/wallet/WalletContext.js:50-90`)

[LOW] `createMatchEscrow` in `escrow.js` uses `Math.round(wagerSOL * LAMPORTS_PER_SOL)` to convert SOL to lamports. For the configured wager tiers (0.1, 0.25, 0.5, 1.0 SOL), the floating-point representation of these values in IEEE 754 is exact or rounds predictably. However, for arbitrary `custom_challenge` wagers (e.g., 0.3 SOL = 0.29999... in IEEE 754), `Math.round` may produce a lamport value that does not match the on-chain escrow's stored `wagerLamports`. The off-chain `calculateSettlement` in `solana.js` uses the same `Math.round`, so the split calculation stays internally consistent. No immediate exploit, but `Math.round(wagerSOL * 1e9)` for non-exact SOL values is a known footgun. (`server/services/escrow.js:287`, `server/services/solana.js:167`)

[INFO] Transaction signing boundary is correctly separated: the server keypair signs `createMatch`, `settleMatch`, `cancelMatch`, and `permissionlessReclaim`; the player wallet signs only `depositWager`. The server never requests the player to sign anything other than the deposit TX, and the deposit TX is constructed server-side with the correct program ID and is validated client-side via discriminator check before wallet signing is requested. The architecture correctly enforces minimal-privilege for each signer.

[INFO] Settlement split arithmetic is sound on-chain. The Rust program uses `u128` widening (`total_pot as u128`) before BPS multiplication to avoid overflow at the maximum wager of 100 SOL (10^11 lamports × 2 = 2×10^11, safely below `u128::MAX`). Winner receives `totalPot - floor(treasury) - floor(ops)`, which guarantees no lamport dust is lost (remainder goes to winner). The off-chain `calculateSettlement` in `solana.js` mirrors this correctly using `Math.floor` for treasury/ops and remainder for winner.

[INFO] The on-chain program enforces all critical invariants independently of server logic: winner must be `player_one` or `player_two` (Anchor constraint), treasury/ops must match `config.treasury`/`config.ops` (Anchor constraints), authority must be the registered escrow keypair (`has_one`), and the program pauses globally via the config PDA. A compromised server cannot redirect settlement funds to arbitrary addresses.

[INFO] Dev-mode fallback is clearly gated: `isEscrowEnabled()` returns false when `keys.js` has no keypair, `verifyBurnTransaction` returns `{ valid: true }` when `SHOT_TOKEN_MINT` is not set, and `validateEscrowTransaction` returns `{ valid: true }` when `REACT_APP_ESCROW_PROGRAM_ID` is not set. All three bypasses are conditioned on missing env vars that must be present in production. The risk is a misconfigured production deployment, not a code-level attack path.

<!-- CONDENSED_SUMMARY_END -->

---

# CHAIN-01 Full Analysis: Transaction Construction & Signing

## 1. TX Lifecycle Overview

The escrow deposit transaction lifecycle is:

```
server: createMatchEscrow()                   → on-chain: create match PDA
server: buildDepositTransaction(matchId, playerAddr) → unsigned TX (base64)
server: socket.emit('escrowDeposit', { transaction, ... })
client: WalletContext.signAndSendEscrowDeposit(serializedTxBase64, roomId)
  → validateEscrowTransaction(tx)             → discriminator check
  → sendTransaction(tx, connection)           → wallet signs + submits
  → confirmTransaction(signature, 'confirmed')
  → socket.emit('escrowDepositConfirm', { roomId, txSignature })
server: escrowDepositConfirm handler
  → getEscrowState(rid)                       → on-chain PDA read (1 retry)
  → verify playerXDeposited == true
  → verify wagerLamports matches
  → emit 'escrowActive' when both confirmed
```

Settlement lifecycle:
```
server: settleMatch(winnerAddr, loserAddr, wagerSOL, matchId)
  → isEscrowEnabled() → settleMatchEscrow(matchId, winnerAddr)
  → program.methods.settleMatch(winner).accounts({...}).rpc()
  → on-chain: 90/7/3 split, escrow closed, rent to authority
```

---

## 2. Transaction Construction — `server/services/escrow.js`

### `buildDepositTransaction` (lines 326-372)

```js
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

const tx = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: player,
});
tx.add(ix);

const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
}).toString('base64');
```

**Assessment:**

The server correctly uses `getLatestBlockhash()` (not the deprecated `getRecentBlockhash()`) and sets both `blockhash` and `lastValidBlockHeight` on the Transaction constructor. This means the transaction has a defined expiry window.

The serialization uses `requireAllSignatures: false` which is correct — the transaction is intentionally unsigned at this point for client signing.

**FINDING (MEDIUM): Blockhash lifetime vs. deposit timeout window**

The `DEPOSIT_TIMEOUT_MS = 120_000` (2 minutes) at line 56 of `main.js` slightly exceeds the typical blockhash lifetime. Solana blockhashes are valid for approximately 150 slots. At ~400ms per slot on mainnet that is ~60 seconds; on devnet (slower) it can be up to 90-120 seconds. This means a client that takes the full 2-minute window to sign may receive a `BlockhashNotFound` rejection from the validator.

There is no mechanism for the client to request a fresh-blockhash version of the same deposit TX. If the TX expires, the user's wallet rejects it, the `sendTransaction` call throws, `signAndSendEscrowDeposit` returns `null`, no `escrowDepositConfirm` is ever emitted, and the deposit timeout fires 2 minutes after room join — cancelling the escrow and removing the room. The user experience is silent failure.

**Recommendation:** Reduce `DEPOSIT_TIMEOUT_MS` to 60 seconds, or add a TX refresh endpoint the client can call to get a new-blockhash version of the deposit TX. Document that blockhash expiry is the effective time constraint for deposits.

---

### `settleMatchEscrow` and `cancelMatchEscrow` (lines 384-467)

Both functions call `program.methods.XXX().accounts({...}).rpc()` which uses the Anchor provider's configured connection with `commitment: 'confirmed'` and `preflightCommitment: 'confirmed'`. The Anchor RPC call handles blockhash fetching, signing via the `Wallet` wrapper, and submission internally. No manual TX construction is needed for server-signed instructions.

**Assessment:** No blockhash management issues for server-signed TXs. Anchor handles blockhash fetching internally before each `.rpc()` call, so staleness is not a concern.

---

## 3. Client Transaction Signing — `client/src/wallet/WalletContext.js`

### `validateEscrowTransaction` (lines 50-90)

```js
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);
const ESCROW_PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID)
    : null;

function validateEscrowTransaction(tx) {
    if (!ESCROW_PROGRAM_ID) { return { valid: true }; }  // Dev mode bypass
    for (const ix of instructions) {
        if (ix.programId.equals(ESCROW_PROGRAM_ID)) {
            const discriminator = ix.data.slice(0, 8);
            if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
                return { valid: false, reason: `Unknown escrow instruction (discriminator mismatch)` };
            }
            hasDepositInstruction = true;
        } else if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
            continue;
        } else {
            return { valid: false, reason: `Unexpected program: ${programId}` };
        }
    }
}
```

**Assessment — strong defense against TX substitution:**

The discriminator check (`[234, 73, 235, 136, 168, 103, 239, 207]`) is the SHA-256 preimage of `"global:deposit_wager"` truncated to 8 bytes, matching the Anchor IDL. This check correctly prevents a malicious server from substituting an arbitrary instruction (e.g., `SystemProgram.transfer` draining the player's wallet) while claiming it is an escrow deposit.

The unknown-program rejection is strict: any instruction whose program ID is neither the escrow program nor ComputeBudget is immediately rejected. This prevents piggybacking attacks (inserting an extra SOL drain instruction alongside a valid deposit instruction).

**FINDING (LOW): No account-key validation in `validateEscrowTransaction`**

The discriminator check confirms instruction *type* but not instruction *target*. A sophisticated attack where the discriminator is correct but the escrow PDA account key points to a different match's PDA would pass client-side validation. On-chain, the PDA derivation check (seeds `["match", matchId]`) would reject this, but a client-side account-key check (verifying the escrow PDA derived from the `roomId` matches the `escrow` account in the instruction) would add defense-in-depth.

```js
// Proposed addition to validateEscrowTransaction(tx, roomId):
const expectedEscrowPDA = PublicKey.findProgramAddressSync(
    [Buffer.from('match'), Buffer.from(roomId)],
    ESCROW_PROGRAM_ID
)[0];
const escrowAccount = ix.keys[0]; // first account is escrow PDA in DepositWager
if (!escrowAccount.pubkey.equals(expectedEscrowPDA)) {
    return { valid: false, reason: 'Escrow PDA does not match expected room' };
}
```

---

### `signAndSendEscrowDeposit` — Confirmation (lines 230-245)

**FINDING (HIGH): Deprecated `confirmTransaction` overload**

```js
const signature = await sendTransaction(tx, connection);

// CS-01 guard passed. Submit.
await connection.confirmTransaction(signature, 'confirmed');
```

The `connection.confirmTransaction(signature, commitment)` overload is the legacy form, deprecated in `@solana/web3.js`. It does not use `lastValidBlockHeight` and cannot detect transaction expiry. If the transaction is dropped (network congestion, leader skip) and never finalized, `confirmTransaction` may either hang indefinitely or return a false positive depending on the RPC implementation.

The modern API requires:

```js
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
// (already done by sendTransaction internally, but client needs to capture it)
await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
}, 'confirmed');
```

Note: `sendTransaction` via the wallet adapter does not expose the blockhash used internally. The correct pattern is to set `recentBlockhash` on the transaction before signing (already done by the server-built TX), then use the `lastValidBlockHeight` from the original `buildDepositTransaction` RPC call. This value is already encoded in the serialized TX but is not surfaced by the wallet adapter's `sendTransaction`. A practical fix is to have the server include `lastValidBlockHeight` in the `escrowDeposit` socket event payload alongside the `transaction` base64 string.

**Risk:** On a slow or congested network, an escrow deposit TX may be dropped. The client emits `escrowDepositConfirm` only after `confirmTransaction` resolves, so a dropped TX causes a hang. With no timeout, the user is stuck and must close/reopen the client.

---

### `signAndBurnShot` — Blockhash and Confirmation (lines 254-296)

**FINDING (HIGH): Burn TX blockhash does not capture `lastValidBlockHeight`**

```js
const tx = new Transaction().add(burnIx);
tx.feePayer = publicKey;
const { blockhash } = await connection.getLatestBlockhash();  // lastValidBlockHeight discarded
tx.recentBlockhash = blockhash;

const signature = await sendTransaction(tx, connection);
await connection.confirmTransaction(signature, 'confirmed');  // legacy overload
```

Both issues are present: `lastValidBlockHeight` is discarded, and the legacy `confirmTransaction` overload is used. For SHOT burns (which are irreversible), a false-positive confirmation (where the TX was dropped but `confirmTransaction` returned without error) would cause the server to accept a burn that never happened. The server's `verifyBurnTransaction` then calls `getParsedTransaction` which would not find the TX and return `{ valid: false }`, so the prestige upgrade would be correctly rejected — the server's on-chain re-verification is the backstop. However, the user experience is poor (burn TX appears successful to client but prestige upgrade fails).

**Recommendation for both issues:**

```js
// WalletContext.js — corrected pattern:
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
const signature = await sendTransaction(tx, connection);
const confirmResult = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
);
if (confirmResult.value.err) {
    throw new Error('Transaction failed: ' + JSON.stringify(confirmResult.value.err));
}
```

---

## 4. Deposit Confirmation Verification — `server/socket-io/main.js:1720-1804`

### On-Chain Deposit Verification (lines 1739-1777)

```js
if (isEscrowEnabled()) {
    let escrowState = await getEscrowState(rid)
    if (!escrowState) {
        await new Promise(r => setTimeout(r, 2000))
        escrowState = await getEscrowState(rid)
    }
    if (!escrowState) {
        client.emit('escrowError', { reason: 'Escrow PDA not found on-chain' })
        return
    }
    const depositConfirmed = isHost ? escrowState.playerOneDeposited : escrowState.playerTwoDeposited
    if (!depositConfirmed) {
        client.emit('escrowError', { reason: 'Deposit not confirmed on-chain' })
        return
    }
    if (escrowState.wagerLamports !== expectedLamports) {
        client.emit('escrowError', { reason: 'On-chain wager amount mismatch' })
        return
    }
}
```

**Assessment — on-chain verification is present and correct in design:**

The server reads the on-chain PDA state after receiving `escrowDepositConfirm` rather than trusting the client-supplied `txSignature`. This is the correct design: a malicious client cannot forge a deposit by sending a fake signature because the server independently verifies `playerOneDeposited` or `playerTwoDeposited` on-chain.

**FINDING (HIGH): Insufficient retry logic for RPC propagation lag**

The single retry with a 2-second delay is insufficient for cases where:
1. The deposit TX was confirmed (committed to the ledger) but the RPC node the server is reading from has not yet propagated the account update.
2. Devnet RPC nodes can lag by 5-15 seconds during normal operation.

If both attempts fail, the server emits `escrowError` and returns. The escrow PDA remains open (both player deposits may be in it), but the game does not start. The deposit timeout fires after 2 minutes and calls `cancelMatchEscrow`, which refunds deposited players. This is a liveness failure, not a security failure.

**Recommendation:**

```js
// Replace single retry with exponential backoff (3 attempts: 0ms, 2s, 5s)
let escrowState = null;
const delays = [0, 2000, 5000];
for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    escrowState = await getEscrowState(rid);
    if (escrowState) break;
}
```

**FINDING (MEDIUM): `wagerLamports` comparison — BN.toNumber() safe integer range**

```js
// escrow.js:529
wagerLamports: escrow.wagerLamports.toNumber(),

// main.js:1769
const expectedLamports = Math.round(ws.amount * LAMPORTS_PER_SOL);
if (escrowState.wagerLamports !== expectedLamports) { ... }
```

`BN.toNumber()` returns a JS Number. The current maximum wager is 100 SOL = 10^11 lamports, which is below `Number.MAX_SAFE_INTEGER` (9 × 10^15). However, `BN.toNumber()` throws if the value exceeds `Number.MAX_SAFE_INTEGER` — a defensive check around `toNumber()` would prevent an unhandled exception if the on-chain value is unexpectedly large.

Additionally, the comparison `!==` between a `Math.round(float)` result and a `BN.toNumber()` result can produce false negatives if floating-point rounding produces a different integer than the stored BN value. For example, `Math.round(0.3 * 1e9)` = 300000000 (correct), but some wager values could round differently. No current wager tier triggers this, but for robustness, lamport values should be compared as integers derived from `BN` throughout.

---

## 5. Settlement Split Correctness — `server/services/solana.js` vs. on-chain

### Off-chain (`solana.js:166-178`)

```js
export function calculateSettlement(totalWagerSOL) {
    const totalLamports = Math.round(totalWagerSOL * LAMPORTS_PER_SOL);
    const treasuryLamports = Math.floor(totalLamports * TREASURY_SHARE);  // 0.07
    const opsLamports = Math.floor(totalLamports * OPS_SHARE);             // 0.03
    const winnerLamports = totalLamports - treasuryLamports - opsLamports; // remainder
    return { winner: winnerLamports / ..., treasury: ..., ops: ... };
}
```

### On-chain (`lib.rs:253-274`)

```rust
let total_pot_128 = (wager_lamports as u128).checked_mul(2)...;
let treasury_amount = (total_pot_128.checked_mul(TREASURY_BPS as u128)... / BPS_DENOMINATOR as u128) as u64;
let ops_amount = (total_pot_128.checked_mul(OPS_BPS as u128)... / BPS_DENOMINATOR as u128) as u64;
let winner_amount = total_pot.checked_sub(treasury_amount)....checked_sub(ops_amount)...;
```

**Assessment:**

Both use integer floor division and assign the remainder to the winner. The off-chain calculation uses floating-point `0.07` and `0.03` multipliers, while the on-chain uses BPS integers (`700/10000`, `300/10000`). For all tested wager tiers (confirmed by Group 8 in `tests/solshot-escrow.ts`), these produce identical results.

The off-chain `calculateSettlement` result is used only for event emission/logging — the actual settlement is performed on-chain. If the off-chain calculation diverges from the on-chain result (e.g., due to floating-point differences at unusual wager values), the emitted `winnerSOL` in the `settlementResult` event would be inaccurate, but no funds would be misdirected. The on-chain arithmetic is authoritative.

**Status: NOT_VULNERABLE** — arithmetic is correct and on-chain is the source of truth.

---

## 6. Serialization / Deserialization of Deposit TX (Wire Format)

### Server → Client (via Socket.IO)

```js
// escrow.js:358-361
const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
}).toString('base64');
return { success: true, transaction: serialized, ... };
```

### Client Deserialization

```js
// WalletContext.js:211-212
const txBuffer = Buffer.from(serializedTxBase64, 'base64');
const tx = Transaction.from(txBuffer);
```

**Assessment:**

The base64 serialization uses Solana's native legacy transaction binary format. `Transaction.from()` deserializes the binary wire format, re-creating the instruction list, fee payer, and blockhash. The `validateEscrowTransaction` function then inspects the deserialized instructions.

**Tamperability:** Socket.IO transmits data as JSON over TLS WebSocket. The base64 string is transmitted as a JSON property. A MITM attacker with TLS decryption capability could substitute the base64 payload, but this requires certificate compromise. Within the TLS tunnel, the payload integrity is protected by the transport layer. The `validateEscrowTransaction` discriminator check is an application-layer defense that would catch instruction substitution even if the transport were compromised.

**Status: NOT_VULNERABLE** under normal TLS assumptions; client-side validation provides application-layer defense-in-depth.

---

## 7. Race Conditions in TX Submission and Confirmation

### Escrow Active Gate (lines 1790-1803)

```js
if (!ws.deposits) ws.deposits = {}
ws.deposits[client.id] = txSignature

const hostDeposited = ws.deposits[room.host?.socketId]
const playerDeposited = ws.deposits[room.player?.socketId]

if (hostDeposited && playerDeposited) {
    if (depositTimers[rid]) { clearTimeout(depositTimers[rid]); delete depositTimers[rid]; }
    io.sockets.in(rid).emit('escrowActive', { ... })
}
```

Node.js's single-threaded event loop prevents a true race between two simultaneous `escrowDepositConfirm` events (the second will queue behind the first in the microtask queue). The `ws.deposits` map is updated synchronously after the `await getEscrowState()` call completes. No mutex is needed here because:

1. The `await getEscrowState()` yields to the event loop, but by the time the handler resumes, the `ws.deposits[client.id] = txSignature` assignment is atomic.
2. The "both deposited" check fires only once — once `escrowActive` is emitted, `hostDeposited && playerDeposited` remains true but the timer is cleared and no second emission occurs (Socket.IO `in(rid).emit` is idempotent from the client's perspective).

**Status: NOT_VULNERABLE** — Node.js single-threaded model prevents deposit race.

### Settlement Race (guarded by `withLock`)

The settlement call path in `main.js` is wrapped in `withLock('settle:roomId')` (confirmed in the SEC-01 analysis). This prevents double-settlement if two events simultaneously trigger the settlement path. The on-chain program also enforces state transitions (`MatchState::Active → MatchState::Settled`) atomically, so even without the application-level mutex, double-settlement would fail on-chain.

**Status: NOT_VULNERABLE** — double-lock protection at both application and on-chain layers.

---

## 8. SHOT Burn Verification — `server/services/shot-token.js`

### `verifyBurnTransaction` (lines 457-558)

**Assessment of verification steps:**

1. **Replay protection:** `verifiedBurnTxs` Set checked before any RPC call — correct.
2. **Transaction existence:** `getParsedTransaction(txSignature, { commitment: 'confirmed' })` — fetches parsed JSON with instruction details.
3. **Transaction success:** `tx.meta?.err` check — correct; rejects failed transactions.
4. **Mint verification:** `ixMint !== SHOT_MINT` comparison — correct; prevents burns of other tokens from counting.
5. **Signer verification:** `ixAuthority !== walletAddress` comparison — correct; prevents one player using another's burn TX.
6. **Amount verification:** `BigInt(ixAmount) < expectedRaw` — see HIGH finding in SEC-01 regarding `burnAmount = 0` bypass.
7. **Inner instructions:** checked for CPI-wrapped burns — correct pattern for wallets that use CPI.
8. **Persistence:** `persistBurnTx(txSignature)` called after adding to Set — correct for restart-durable replay protection.

**Status:** See SEC-01 finding for the `burnAmount = 0` bypass. All other checks are correct.

**FINDING (MEDIUM): `confirmTransaction` timeout / hang potential for burn flow**

After `signAndBurnShot` submits the burn TX via `sendTransaction`, it calls `confirmTransaction(signature, 'confirmed')` with the legacy overload. If the TX is dropped, this call may hang indefinitely before the socket `prestigeBurn` event is emitted. The server's `verifyBurnTransaction` would then never be called. The user sees a perpetual loading state. Adding a timeout here (`Promise.race` with a 60-second timer) would improve liveness.

---

## 9. Wire Format Attack Surface Summary

| TX Type | Built By | Signed By | Validated By | On-Chain Guard |
|---------|----------|-----------|--------------|----------------|
| `deposit_wager` | server | client wallet | client discriminator check | PDA seeds, player key, state |
| `settle_match` | Anchor (server) | server keypair | Anchor | winner constraint, has_one authority, treasury/ops config check |
| `cancel_match` | Anchor (server) | server keypair | Anchor | caller = authority or player, state check |
| SHOT burn | client (WalletContext) | client wallet | server `verifyBurnTransaction` | mint, authority, amount |
| `create_match` | Anchor (server) | server keypair | Anchor | authority ≠ player, wager range, pause guard |

**Key observation:** The most attack-exposed path is `deposit_wager` because:
- The TX is built server-side (server could construct a malicious version)
- It is transmitted over the network as base64 (wire tampering possible under MITM)
- The client must sign it without seeing a human-readable description

The discriminator check in `validateEscrowTransaction` is the primary defense. The on-chain PDA and state machine are the backstop.

---

## 10. Findings Summary Table

| # | Finding | File | Lines | Severity | Status |
|---|---------|------|-------|----------|--------|
| C-01 | Deprecated `confirmTransaction` overload in escrow deposit | `WalletContext.js` | 234 | HIGH | CONFIRMED |
| C-02 | SHOT burn TX: `lastValidBlockHeight` discarded, legacy confirm | `WalletContext.js` | 280-289 | HIGH | CONFIRMED |
| C-03 | `escrowDepositConfirm` only 1 retry for on-chain propagation | `main.js` | 1743-1763 | HIGH | CONFIRMED |
| C-04 | `wagerLamports` `BN.toNumber()` compared as JS Number | `escrow.js`, `main.js` | 529, 1769 | MEDIUM | POTENTIAL |
| C-05 | Blockhash lifetime (60-90s) vs. 120s deposit timeout | `escrow.js`, `main.js` | 348, 56 | MEDIUM | CONFIRMED |
| C-06 | No timeout on `confirmTransaction` calls | `WalletContext.js` | 234, 288 | MEDIUM | CONFIRMED |
| C-07 | `validateEscrowTransaction` does not verify escrow PDA account key | `WalletContext.js` | 50-90 | LOW | POTENTIAL (on-chain guard exists) |
| C-08 | `Math.round(wagerSOL * 1e9)` for non-exact SOL values | `escrow.js`, `solana.js` | 287, 167 | LOW | POTENTIAL (current tiers safe) |
| — | TX signing boundary correctly separated | all | — | INFO | NOT_VULNERABLE |
| — | Settlement arithmetic correct (u128 BPS, remainder to winner) | `lib.rs`, `solana.js` | — | INFO | NOT_VULNERABLE |
| — | On-chain constraints enforce settlement independently of server | `lib.rs` | — | INFO | NOT_VULNERABLE |
| — | Dev-mode bypass correctly gated on missing env vars | all | — | INFO | ACCEPTABLE |
