---
task_id: db-phase1-chain-02-rpc-trust
provides: [chain-02-rpc-findings, chain-02-rpc-invariants]
focus_area: CHAIN-02-RPC-trust
files_analyzed:
  - server/services/solana.js
  - server/services/escrow.js
  - server/services/escrow-v2.js
  - server/services/shot-token.js
  - server/services/jupiter-price.js
  - server/services/monitoring.js
  - server/socket-io/main.js
  - client/src/wallet/WalletContext.js
  - server/index.js
finding_count: 9
severity_breakdown: {critical: 1, high: 4, medium: 3, low: 1}
---
<!-- CONDENSED_SUMMARY_START -->
# CHAIN-02: RPC Client & Node Trust — Condensed Summary

## Key Findings (Top 5-10)

1. **Three separate `new Connection()` objects for the same RPC**: `solana.js`, `escrow.js`, and `escrow-v2.js` each create their own `Connection` with the same `SOLANA_RPC` value at init time. `shot-token.js` creates a fourth at module load (top-level `const connection`). No shared singleton — `solana.js` has one, escrow services have their own. This multiplies connection overhead but more importantly means each can independently fail or diverge in state without the others knowing. — `server/services/escrow.js:73`, `server/services/escrow-v2.js:67`, `server/services/shot-token.js:36`, `server/services/solana.js:75`

2. **`connection.confirmTransaction(signature, 'confirmed')` is the deprecated string-commitment form**: The client calls this in `signAndSendEscrowDeposit`, `signAndSendGroupDeposit`, and `signAndBurnShot`. This form has known reliability issues on Solana — it can silently succeed or time out without a clear error. There is no fallback, no retry, and no `getSignatureStatus` follow-up. If the call times out, the client never emits `escrowDepositConfirm`, leaving the match stuck. — `client/src/wallet/WalletContext.js:584,624,654`

3. **Balance cache TTL of 30 seconds creates TOCTOU window for SOL drain**: `verifyBalance()` uses an in-memory cache with 30s TTL. The check at `joinRoom` (line 1961) and `createRoom` (line 2362) can return a cached stale balance. Between the check and the actual on-chain deposit (which happens after the match is created and escrow PDA is built), the wallet can be drained by another transaction. The escrow deposit instruction would then fail on-chain, but the match may already be partially initialized. — `server/services/solana.js:100-117`, `server/socket-io/main.js:1961,2362`

4. **No RPC health check, no startup validation, no liveness probe on the Solana connection**: The `initSolana()` function creates a `Connection` and logs the endpoint. There is no test call (`getSlot`, `getVersion`, etc.) to verify the RPC is reachable. Render cold starts may succeed at the Express layer while the RPC is down. The health check endpoint at `/health` returns `{status: 'ok'}` based solely on server uptime — it does not ping the RPC. — `server/services/solana.js:74-87`, `server/services/monitoring.js:148-160`

5. **Single-endpoint, no fallback, no multi-RPC consensus**: All four `Connection` instances read from the single `SOLANA_RPC` env var with a hardcoded default of `https://api.devnet.solana.com`. There is no fallback RPC URL, no automatic failover, and no retry-with-alternate-endpoint logic anywhere in the codebase. A rate-limited or downed RPC causes all escrow operations to fail silently. The INDEX.md comment about "devnet RPC fallback loses finality guarantees" is the prior team's concern, but the fallback described there is just the default public devnet endpoint, not a Helius/Triton/QuickNode alternative. — `server/services/solana.js:28`, `server/services/escrow.js:46`, `server/services/escrow-v2.js:45`, `server/services/shot-token.js:35`

6. **RPC trust scope for economic decisions**: The server trusts `getEscrowState()` (which calls `program.account.matchEscrow.fetch()`) to verify deposits before proceeding with match start. A malicious RPC provider could return a spoofed account state. This is a standard Solana trust model limitation — the on-chain program validates the actual transaction, so the real attack surface here is **if** the RPC lies about the escrow account state after a legitimate deposit and causes the server to reject the deposit. The inverse — RPC lying that a deposit exists when it doesn't — is impossible if the RPC can't forge real program state. However, a stale/cached RPC returning old data (pre-deposit) could cause the single-retry path to still fail. — `server/socket-io/main.js:3422-3446`

7. **`shot-token.js` connection is a module-level singleton without reconnect logic**: `const connection = new Connection(SOLANA_RPC, 'confirmed')` at line 36 fires at module load time. If the RPC becomes unavailable after startup, there is no reconnect or reinitiation path. `getParsedTransaction` calls for burn verification would fail with network errors that are caught and return `{ valid: false, reason: '...' }`. This means a downed RPC at burn-verification time would block prestige upgrades — fail-closed, which is safer than fail-open but causes user-visible failures. — `server/services/shot-token.js:36`

8. **Jupiter price feed (`jupiter-price.js`) is display-only with no economic coupling**: `getShotPrice()` is called only on `getShotPrice` socket event (main.js line 4677) and returned to the requesting client for UI display (`ShotPriceTicker.js`). There is no code path where the Jupiter price is used in settlement amount calculation, wager validation, or any economic decision. This means oracle manipulation attacks on Jupiter are irrelevant to SolShot's financial security. However, the stale price display (last updated timestamp not validated client-side) means a user could see a price up to 30s stale or indefinitely stale if polling stopped. — `server/services/jupiter-price.js`, `server/socket-io/main.js:4674-4679`

9. **`preflightCommitment: 'confirmed'` on Anchor provider vs `'confirmed'` default on all Connections**: Both `escrow.js` and `escrow-v2.js` set `commitment: 'confirmed'` and `preflightCommitment: 'confirmed'` on the `AnchorProvider`. This is consistent but uses `confirmed` (not `finalized`) for all RPC reads. For devnet this is acceptable. For mainnet, `confirmed` means results can be reverted in the rare case of a fork. Settlement reads on an unfinalized block could show wrong state. — `server/services/escrow.js:75-77`

## Critical Mechanisms

- **Deposit verification loop** (`main.js:3419-3459`): On `escrowDepositConfirm`, server calls `getEscrowState(rid)`, retries once with 2s delay if null, then checks `depositsMask` bitmask. This is the core on-chain trust verification. Single retry is fragile — if devnet is 3+ seconds slow (common), the second fetch also fails and the deposit is rejected despite being real.

- **Balance cache** (`solana.js:100-117`): 30s TTL map, never invalidated after a successful deposit. A player who deposits for one match and then tries to join another within 30s could pass the balance check on cached data.

- **Settlement retry loop** (`main.js:327-385`): `failedSettlements` Map with 5-attempt cap, 60s interval. Uses `cancelMatchEscrow` for recovery (not settle). No alerting when max retries hit — silent discard.

- **confirmTransaction** (deprecated form, `WalletContext.js:584,624,654`): Called after `sendRawTransaction`. Deprecated — Solana recommends using `confirmTransaction` with `BlockhashTransactionOptions` (recent blockhash + lastValidBlockHeight) instead of the string-commitment form, which internally polls and can silently lose track.

## Invariants & Assumptions

- INVARIANT: All RPC calls use `'confirmed'` commitment — enforced at `server/services/escrow.js:75`, `server/services/escrow-v2.js:70`, `server/services/shot-token.js:36`, `server/services/solana.js:75`. NOT enforced for `getBalance()` in `solana.js:115` which uses the connection default (same `'confirmed'` from init, so technically consistent but implicit).

- INVARIANT: Economic decisions (deposit acceptance) require on-chain state verification when escrow is enabled — enforced at `server/socket-io/main.js:3419-3460`. NOT enforced when `isEscrowEnabled()` returns false (dev mode) — `main.js:3461` explicitly skips it.

- INVARIANT: `SOLANA_RPC` defaults to devnet public endpoint if env not set — enforced at `server/services/solana.js:28`, `server/services/escrow.js:46`, `server/services/escrow-v2.js:45`, `server/services/shot-token.js:35`. Consistent but could accidentally default to public devnet on mainnet if `SOLANA_RPC` env var is dropped.

- ASSUMPTION: The RPC endpoint is always available and responsive — UNVALIDATED. No health check at startup, no liveness probe, no circuit breaker.

- ASSUMPTION: A single 2s retry is sufficient for devnet confirmation lag — UNVALIDATED. Devnet is sometimes 5-10s behind. Only one retry is made.

- ASSUMPTION: The `balanceCache` does not need invalidation after an actual deposit — UNVALIDATED. If a player deposits during the 30s window, a subsequent check returns the pre-deposit balance. This could allow a player with exactly `wager + 0.01 SOL` to re-join another room immediately after depositing.

## Risk Observations (Prioritized)

1. **Deprecated `confirmTransaction` form on client, no fallback**: `client/src/wallet/WalletContext.js:584,624,654` — If confirmation times out silently, the client never emits `escrowDepositConfirm`, the deposit is valid on-chain but the server never learns of it. Potential impact: locked funds with no automatic recovery path until the permissionless reclaim window expires (600s).

2. **Single-retry deposit verification is fragile on devnet / slow mainnet RPCs**: `server/socket-io/main.js:3422-3427` — 2s single retry. If RPC is slow (>2s), the deposit confirmation is rejected. Combined with point 1, a legitimate depositor can be locked out of the match they paid for.

3. **No RPC health check at startup**: `server/services/solana.js:74-87` — Render cold starts may succeed with escrow silently disabled or broken. Operators have no visibility into RPC connectivity until a match attempt fails.

4. **30s balance cache creates TOCTOU window**: `server/services/solana.js:100-117` — Between check and actual deposit TX, a player can drain their wallet via another client. Small practical risk on devnet, higher on mainnet with real value.

5. **Four independent `Connection` instances for the same endpoint**: Any one could be rate-limited or hit a different node independently. Most consequential for `shot-token.js` which fires `getParsedTransaction` for burn verification — if this connection is rate-limited at burn time, prestige upgrades silently fail.

6. **Settlement retry uses `cancelMatchEscrow` not `settleMatch` for recovery**: `server/socket-io/main.js:343` — If the original settlement fails and the retry-cancel also fails, the escrow is orphaned. Funds are only recoverable via the 600s permissionless reclaim. No operator alert is fired.

7. **`confirmed` finality for all reads on mainnet path**: `server/services/escrow.js:75` — On a production mainnet deploy, using `confirmed` means reading potentially-reversible state. For the deposit verification read, a reverted deposit could trick the server into thinking a deposit exists.

8. **Jupiter API: no staleness guard on client**: `client/src/components/ShotPriceTicker.js:43` — Displays `shotPrice.usdPrice` without checking `lastUpdated`. If polling stops (server restart, Jupiter API down), stale price is shown indefinitely. Low risk (display only) but misleading.

9. **`shot-token.js` connection has no reconnect path**: `server/services/shot-token.js:36` — Module-level singleton. Fails closed (burn rejected) on network errors, but no recovery without server restart.

## Novel Attack Surface

- **Deposit confirmation race via slow RPC**: A user could exploit the 2s single-retry window by timing their `escrowDepositConfirm` emit to arrive at the server immediately after broadcasting (before the RPC has indexed the transaction). The server queries RPC, gets null, retries after 2s, still null (if RPC indexing lag > 2s), rejects the deposit. The on-chain TX succeeds — their SOL is in the escrow PDA — but the server considers them undeposited. The match may start without them or cancel. Their SOL is locked until permissionless reclaim. This is not a theft vector but a griefing/DoS vector against the depositor themselves, or against the match (blocking it from starting).

- **Balance cache invalidation via parallel sessions**: A player with two browser tabs could have Tab A pass the balance check (caches balance), send SOL from another wallet, then Tab B pass the same check using the cached stale balance. Both tabs emit `escrowDepositConfirm` for different rooms, but only one deposit TX can succeed on-chain for each room. The resulting state would have one room with an accepted deposit that doesn't exist on-chain.

## Cross-Focus Handoffs

- **ERR-01 (Error Handling)**: The `failedSettlements` retry loop silently discards failures after 5 attempts with no operator alert. This needs investigation for fail-open vs fail-closed behavior on max-retry.

- **CHAIN-01 (Transaction Construction)**: `buildDepositTransaction()` in `escrow.js:329` uses `getLatestBlockhash()` on the Anchor provider's connection. If the blockhash is from a slow/lagging RPC, the resulting transaction may expire before it's sent. `lastValidBlockHeight` is included in the TX but the client has no visibility into it.

- **ERR-02 (Race Conditions)**: The single-retry deposit verification (`main.js:3422-3427`) does not hold a lock between the two fetch attempts. Another `escrowDepositConfirm` from the same player in a parallel socket (reconnect scenario) could interleave.

## Trust Boundaries

The server trusts the single `SOLANA_RPC` endpoint for all economic state reads. There is no multi-RPC consensus, no validator cross-check, and no alerting on RPC error rates. All four Solana-interacting services create independent `Connection` objects pointing to the same URL — coordination between them exists only at the business-logic level via shared return values, not at the network layer. The client trusts its own `Connection` (hardcoded to `clusterApiUrl(NETWORK)` or `REACT_APP_SOLANA_RPC`) for transaction broadcast and confirmation, bypassing Privy's unreliable hosted RPC. The Jupiter price feed is trusted for display only, with no economic coupling. The overall RPC trust model is: one trusted provider, no fallback, no health monitoring, fail-closed for most operations (RPC error = reject deposit / reject burn), with the exception of the 5-attempt settlement retry which silently discards after exhaustion.
<!-- CONDENSED_SUMMARY_END -->

---

# CHAIN-02: RPC Client & Node Trust — Full Analysis

## Executive Summary

SolShot's server interacts with the Solana RPC layer through four independent `Connection` instances all pointing to a single `SOLANA_RPC` environment variable (defaulting to `https://api.devnet.solana.com`). There is no fallback RPC, no multi-RPC consensus, no health checks at startup, and no alerting when RPC errors occur. The primary RPC use cases are: balance checks (with a 30s in-memory cache), deposit verification (via `getEscrowState`/`program.account.matchEscrow.fetch`), burn TX verification (`getParsedTransaction`), and transaction construction (blockhash fetching). All RPC reads use `confirmed` commitment — not `finalized`.

The client side adds a distinct issue: it uses the deprecated string-based form of `connection.confirmTransaction(signature, 'confirmed')` for escrow deposit and SHOT burn confirmation. This form can silently time out, leaving funds locked in an escrow PDA with no server-side visibility.

The Jupiter price feed (`jupiter-price.js`) polls every 30s for display purposes only. No economic decision depends on it — settlement amounts are fixed in SOL at wager-tier multiples, not priced in SHOT. This eliminates oracle attack risk from Jupiter.

## Scope

All off-chain RPC interaction. On-chain Anchor programs are out of scope.

## Key Mechanisms

### 1. Connection Architecture

Four independent `Connection` instances:

| Module | Creation point | Commitment |
|--------|---------------|------------|
| `solana.js` | `initSolana()` → stored in module-level `connection` variable | `'confirmed'` |
| `escrow.js` | `initEscrow()` → stored inside `provider` | `'confirmed'` |
| `escrow-v2.js` | `initEscrowV2()` → stored inside `provider` | `'confirmed'` |
| `shot-token.js` | Module-level constant, fires on import | `'confirmed'` |

Each reads `process.env.SOLANA_RPC || 'https://api.devnet.solana.com'`. There is no shared connection pool or reconnect hook. If the RPC endpoint changes (e.g., operator rotates to a Helius endpoint), all four must reinitialize — `initSolana()` is called from `server/index.js` but only `escrow.js`/`escrow-v2.js` reinitialize via their own `init*()` functions. `shot-token.js` uses a module-level constant that cannot be reinitialized without a server restart.

### 2. Balance Verification + Cache

`solana.js:getCachedLamports()` maintains a `Map<walletAddress, {lamports, expiresAt}>` with a 30s TTL. Called by `verifyBalance()`, which is called in three places in `main.js`:

- `createRoom` handler (~line 2362): checks creator balance
- `joinRoom` handler (~line 1961): checks joiner balance  
- Queue match handler (~line 2594): checks queued player balance

The cache is never explicitly invalidated. After a deposit TX is submitted, the balance changes on-chain, but the 30s cache will still return the pre-deposit value. In practice, the balance check happens before the escrow deposit TX — the check is a pre-flight, not a post-confirmation. However, because the cache persists across multiple room join events, a player who drains their wallet (via any means) within 30s of a prior check can still pass subsequent checks.

Error behavior: `verifyBalance()` catch block returns `{ sufficient: false, balance: 0 }`. This is fail-closed — an RPC error at balance-check time rejects the player from the room. The socket emits `joinRoomError`/`createRoomError` with a user-visible message.

### 3. Escrow Deposit Verification

In `main.js:3402` (`escrowDepositConfirm` handler):

```
1. Client submits txSignature after signing+broadcasting
2. Server calls getEscrowState(rid) → program.account.matchEscrow.fetch(escrowPDA)
3. If null: wait 2000ms, retry once
4. If still null: emit 'escrowError', return
5. If found: check depositsMask bitmask for player index
6. If bit not set: emit 'escrowError', return
7. Also verify wagerLamports matches expected
```

This is the primary on-chain verification point. It trusts the RPC's `getAccountInfo` response (underlying `fetch` call). Vulnerabilities:

- **Single retry, 2s delay**: Devnet can be 3-8s slow for indexing confirmed transactions. The single retry is insufficient on a slow devnet day.
- **No transaction ID verification**: The server checks the escrow PDA state (deposit bit set) but does not verify that the specific `txSignature` submitted by the client is the TX that set it. A player who previously deposited for a different match (now cancelled/settled) cannot reuse the signature because the PDA state reflects the current match. However, the `txSignature` field is stored in `ws.deposits[client.id]` but never verified on-chain against the escrow state — it's used as a receipt identifier only.
- **RPC response spoofing**: If the RPC provider lies about the `matchEscrow` account state (returns `depositsMask` with the bit set for a player who never deposited), the server would accept the false deposit. This is the standard RPC trust problem — mitigated by using reputable providers but not eliminated.

### 4. Client `confirmTransaction` (Deprecated Form)

`WalletContext.js:584`, `WalletContext.js:624`, `WalletContext.js:654`:

```javascript
await connection.confirmTransaction(signature, 'confirmed');
```

This is the **deprecated** Solana `confirmTransaction` API. The recommended form since `@solana/web3.js` 1.31+ is:

```javascript
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
```

The deprecated form internally polls `getSignatureStatuses` until confirmed or until a timeout. Known issues:
- Can return `null` on timeout without throwing
- Does not use `lastValidBlockHeight` — cannot detect when the TX has definitively expired
- On devnet, can silently succeed, appear to succeed, then the callback code (`socket.emit('escrowDepositConfirm', ...)`) never fires if the confirmation resolves incorrectly

The `sendRawTransaction` call at line 521 does set `skipPreflight: false` and `preflightCommitment: 'confirmed'` — so pre-flight checks are done. But post-flight confirmation is via the deprecated method.

The consequence: if `confirmTransaction` times out, the client's catch block fires (`console.error('[SolShot] Escrow deposit error:', err.message)`) and returns `null`. The socket never emits `escrowDepositConfirm`. The on-chain TX is in an unknown state — it may have succeeded. The server has no awareness of this. The player's SOL is in the escrow PDA but the server will eventually hit the `DEPOSIT_TIMEOUT_MS` (5 minutes), take the partial-deposit path, and potentially cancel the escrow (refunding the deposited player on-chain). So fail behavior is: eventual refund after 5 minutes, not permanent fund loss. But the user experience is: "deposited, match never started."

### 5. Jupiter Price Feed

`jupiter-price.js` polls `https://api.jup.ag/price/v3` every 30s. Error handling: `console.warn` and return (cache unchanged). The cached price object is returned verbatim via the `getShotPrice` socket event to the requesting client, which displays it in `ShotPriceTicker.js`.

No code path uses the Jupiter price in any economic calculation. The prestige burn amounts (`verifyBurnTransaction`) verify token amount in raw lamports against `expectedAmount * 1e9`. Settlement distributes fixed SOL wager multiples. Wager tiers are defined as SOL amounts (`WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0]`). Jupiter price is cosmetic.

### 6. `confirmed` vs `finalized` Commitment

All connections use `'confirmed'` commitment (2/3 validator vote supermajority). This means:
- Account fetches can return state from blocks that have not yet been finalized
- On mainnet, a fork reversal (rare) could make a `confirmed` block disappear
- For devnet testing: acceptable

For a production mainnet deployment, the deposit verification read (`getEscrowState`) should ideally use `finalized` commitment — or at minimum the wager should be large enough that the fork probability doesn't create an economically viable attack. At the current wager tiers (0.1–1.0 SOL), finality risk is low but not zero.

### 7. `shot-token.js` Standalone Connection

`const connection = new Connection(SOLANA_RPC, 'confirmed')` at module level. This fires at `import` time. If `initSolana()` is called after this module loads and changes the effective RPC, the `shot-token.js` connection still points to the original env value (same string, so no difference in practice, but the connection socket is separate). No reconnect hook.

`getParsedTransaction` at line 503 runs with `commitment: 'confirmed'`. This is correct for burn verification — we want to confirm the burn TX is at least confirmed before granting prestige. Error handling: catch removes from `verifiedBurnTxs` and returns `{ valid: false }`. Fail-closed.

### 8. No RPC Health Monitoring

`/health` endpoint returns server uptime + connection count. Does not check:
- Whether `connection.getSlot()` succeeds
- Whether the RPC is responding within reasonable latency
- Whether escrow program accounts are reachable

The Render deployment has `autoRestart` behavior on crash, but a hung RPC (connection accepted, responses extremely slow) would not trigger restart — it would just cause all RPC operations to queue and time out.

### 9. Rate Limiting from RPC

The codebase has no handling for HTTP 429 from the RPC provider. The free public devnet endpoint (`api.devnet.solana.com`) rate-limits at approximately 100 req/s. Under load (multiple simultaneous matches with deposit verifications), the server could hit rate limits. The Anchor `program.account.matchEscrow.fetch()` call in `getEscrowState` is unbatched — each call is one HTTP request.

If the RPC returns 429, the Anchor SDK will throw. The catch in `main.js:3455` will catch this and emit `escrowError` to the client. Fail-closed, but every player in the room gets an error during a period of high load.

## Trust Model

| RPC Operation | Trusts RPC For | Attack Impact if Lied |
|--------------|----------------|----------------------|
| `getBalance()` (balance check) | Wallet SOL balance | Reject valid player, or pass insufficient player |
| `getEscrowState()` (deposit verify) | Escrow PDA state + depositsMask | Accept fake deposit (if bit spoofed) or reject real deposit (if bit not set) |
| `getParsedTransaction()` (burn verify) | TX instruction details | Accept fake burn (if instructions spoofed) or reject valid burn |
| `getLatestBlockhash()` (TX construction) | Recent blockhash validity | Produce expired TX (if stale blockhash returned) |
| `program.methods.*.rpc()` (settle/cancel) | TX submission + confirmation | Unknown — depends on Anchor's internal confirmation |

## State Analysis

- **`balanceCache`** (`solana.js:100`): In-memory Map, 30s TTL, no size bound. Under sustained load with thousands of unique wallets, this could grow unbounded (memory leak). No LRU or eviction beyond TTL expiry.
- **`failedSettlements`** (`main.js:319`): In-memory Map, entries dropped after 5 retries or on success. No persistence — lost on server restart. A server restart during retry window means no retry.
- **`verifiedBurnTxs`** (`shot-token.js`): In-memory Set. Already documented in INDEX.md as a known issue (lost on restart).

## Dependencies

- `@solana/web3.js` — Connection, Transaction, PublicKey, LAMPORTS_PER_SOL. Version not audited here.
- `@coral-xyz/anchor` — AnchorProvider, Program, Wallet. Version 0.32.1 (per MEMORY.md).
- `bn.js` — direct import (Anchor 0.32.1 breaking change workaround).
- Jupiter Price API V3 — `https://api.jup.ag/price/v3` — external, requires `JUP_API_KEY`.

## Focus-Specific Analysis

### Finality vs Confirmation Semantics

Settlement transactions (`settleMatch`, `cancelMatch`) are submitted via Anchor's `.rpc()` which uses the provider's default commitment (`confirmed`). The returned `txSignature` is confirmed at `confirmed` level. The server logs it and proceeds. There is no post-settlement read to verify the on-chain state changed as expected. If the settlement TX succeeds but the provider times out returning the signature, Anchor would throw and the match settlement would enter the `failedSettlements` retry queue — but the on-chain state is already settled. The retry would attempt `cancelMatchEscrow`, which would fail with an on-chain error (can't cancel an already-settled account), increment attempts, and eventually be discarded. This is a specific scenario where the RPC timing out on a successful settlement causes unnecessary retry attempts — and those retry-cancel attempts would fail harmlessly on-chain.

### WebSocket vs Polling

No WebSocket subscription (account subscribe) is used server-side. All RPC reads are HTTP polling on demand. Client-side, `confirmTransaction` internally polls `getSignatureStatuses`. No `onAccountChange` subscriptions.

### Retry Logic

Only one retry path exists:
1. Deposit verification: single retry with 2s delay (`main.js:3422-3427`)
2. Settlement failure: 5-attempt retry via `failedSettlements` at 60s interval (`main.js:327-385`) — but this retries `cancelMatchEscrow`, not `settleMatch`

There is no exponential backoff, no jitter, no circuit breaker.

### Server-Side Pre-Flight Balance Check vs On-Chain Enforcement

The server calls `verifyBalance()` before creating the escrow PDA (at room join/create time). This is a pre-flight UX guard, not a security guarantee. The on-chain escrow program enforces that the depositor has sufficient SOL when `deposit_wager` is called. If the balance check passes but the player drains their wallet before calling `deposit_wager`, the on-chain instruction fails. The server handles this gracefully via the deposit timeout path — eventually cancelling the escrow or starting with partial depositors.

## Cross-Focus Intersections

- **ERR-01 (Error Handling)**: `failedSettlements` max-retry silent discard is an error-handling gap.
- **CHAIN-01 (TX Construction)**: Blockhash fetched on server for deposit TX construction. If server-side RPC returns stale blockhash, client signs an expired TX.
- **SEC-01 (Key Management)**: The `shot-token.js` module-level `Connection` is created before keypairs are loaded. If the RPC endpoint changes via env rotation, `shot-token.js` requires restart.

## Risk Observations

1. **Deprecated `confirmTransaction` (HIGH)**: Client-side, all three signing operations use the deprecated string form. Needs upgrade to blockhash-based form to handle TX expiry correctly.

2. **No RPC health check (HIGH)**: Operators have no observability into RPC health. Startup failures are silent.

3. **Single 2s retry for deposit verification (HIGH)**: Insufficient for devnet and potentially mainnet. Should be 3-5 retries with increasing delays.

4. **30s balance cache TOCTOU (MEDIUM)**: Low immediate risk on devnet, higher on mainnet.

5. **No rate limit handling for RPC 429 (MEDIUM)**: No graceful degradation.

6. **`shot-token.js` non-reinitializable connection (MEDIUM)**: Operator cannot rotate RPC endpoint without full restart.

7. **`confirmed` commitment for deposit reads on mainnet path (MEDIUM)**: Consider `finalized` for security-critical reads.

8. **`failedSettlements` silent discard after 5 attempts (MEDIUM)**: No operator alert. Funds may be orphaned.

9. **Jupiter price `lastUpdated` not checked client-side (LOW)**: Stale price display, no economic impact.

## Novel Attack Surface Observations

**Slot timing exploitation**: An attacker who controls a slow or rate-limited RPC response for the devnet public endpoint could target the 2s retry window. By introducing 2-3s RPC lag (possible on shared public devnet during peak hours or via a targeted DDoS on api.devnet.solana.com — not the attacker's concern since it's public infrastructure), legitimate deposits are systematically rejected. This would work as a griefing attack on a specific player without the attacker needing to interact with the smart contract at all. On mainnet with a reputable private RPC, this attack surface collapses.

**Balance cache abuse with high-frequency room creation**: An automated script that creates rooms in rapid succession (rate limiting exists via `express-rate-limit` at 100 req/15min for HTTP, but the socket-based `createRoom` has a separate `withLock` guard, not global rate limiting) could exploit the 30s balance cache to verify balance once and create multiple rooms before the cache expires.

## Questions for Other Focus Areas

- ERR-01: What is the actual behavior of `failedSettlements` on Render restart? Are these retries lost?
- CHAIN-01: Does `buildDepositTransaction` set `lastValidBlockHeight` correctly such that the client can detect TX expiry before confirming?
- SEC-02: Is `JUP_API_KEY` present on the Render deployment? If not, Jupiter polling is silently disabled.

## Raw Notes

- `server/services/solana.js:28`: `SOLANA_RPC` default is `https://api.devnet.solana.com` — this is the free public endpoint, shared with all Solana devnet users worldwide. Rate limits are aggressive. For production, this must be replaced with a Helius, Triton, or QuickNode endpoint.
- `client/src/wallet/WalletContext.js:32-33`: Comment explicitly says "Privy's hosted devnet RPC has been unreliable" — this indicates there was a real production failure from the RPC layer, validating that RPC reliability is a live concern.
- `server/index.js:146-151`: CSP `connectSrc` includes both `api.devnet.solana.com` and `api.mainnet-beta.solana.com` — intentional dual-network support in the browser security policy.
- `server/services/escrow.js:73`: Escrow service creates its own `Connection` independently of the `solana.js` singleton. The Anchor `provider.connection` field stores this separate instance. Any RPC operations via `provider.connection` (e.g., `getLatestBlockhash` in `buildDepositTransaction:352`) use the escrow's own connection, not solana.js's.
- No WebSocket (`wss://`) RPC subscription is used anywhere in server code. All state reads are synchronous HTTP calls.
- `server/services/monitoring.js:148-160`: The `/health` endpoint is informational only — it does not verify RPC connectivity.
