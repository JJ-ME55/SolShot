# CHAIN-02: RPC Client & Node Trust

**task_id:** CHAIN-02
**auditor:** Dinh's Bulwark — CHAIN-02
**generated:** 2026-02-23
**scope:** server/services/escrow.js, server/services/solana.js, server/services/shot-token.js, server/services/monitoring.js, server/index.js, client/src/wallet/WalletContext.js

---

## CONDENSED SUMMARY

SolShot uses a single, configurable RPC endpoint (env var `SOLANA_RPC`, defaulting to the public Solana devnet URL) across all three server-side consumers: `solana.js`, `escrow.js`, and `shot-token.js`. The client uses a separate configurable endpoint (`REACT_APP_SOLANA_RPC`, also defaulting to the public devnet URL via `clusterApiUrl`). Neither the server nor the client has a fallback RPC, retry logic, or circuit-breaker. There are no health checks against the RPC node, and no quorum/multi-RPC verification of any returned data.

The most financially significant RPC call — `getBalance()` in `verifyBalance()` — fails **closed** on error (returns `sufficient: false`), which is correct. However the `getBalance()` exposed as a standalone utility function in `solana.js` **fails open**, returning `0` on error rather than propagating the failure. A 30-second balance cache introduces a TOCTOU window: a player's balance is checked once and cached, but funds could be spent before the escrow deposit is taken. The `confirmTransaction()` call in the client uses `'confirmed'` commitment rather than `'finalized'`, which is technically correct for user-facing deposit confirmation, but the server never independently re-verifies deposit finality before calling `settleMatch()` on-chain — it relies entirely on the client's socket message. The `getParsedTransaction()` call in `shot-token.js` for burn verification correctly requests `'confirmed'` commitment.

The server creates two independent `Connection` objects rather than one shared instance: `solana.js` owns a singleton, while `escrow.js` creates its own inside `initEscrow()` and then again for `buildDepositTransaction()`. `shot-token.js` creates a third module-level `Connection` at import time, before any RPC config is validated. This fragmentation means RPC endpoint changes are not atomic across all subsystems, and the module-level connection in `shot-token.js` is constructed at process startup with no error handling. The monitoring service (`monitoring.js`) contains no RPC calls itself.

The client's `Connection` object is provided via `useConnection()` from the wallet adapter's `ConnectionProvider`, making it lifecycle-managed by React. This is sound, but the client and server may point to different RPC nodes (both configurable independently), which can produce divergent views of chain state — in particular, the client confirming a deposit at `'confirmed'` level against one node while the server queries escrow state via a different node that has not yet propagated the same block.

**Finding severity distribution:** 1 HIGH, 4 MEDIUM, 3 LOW, 2 INFO.

---

## FULL ANALYSIS

### 1. RPC Endpoint Configuration

**Files:** `server/services/solana.js:27`, `server/services/escrow.js:42`, `server/services/shot-token.js:35-36`

All three server-side consumers read `process.env.SOLANA_RPC` independently:

```js
// solana.js line 27
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

// escrow.js line 42
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

// shot-token.js lines 35-36
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');
```

**Findings:**

- **[MEDIUM — RPC-01] Default public endpoint in production fallback.** If `SOLANA_RPC` is not set in the production environment, all three consumers silently fall back to `https://api.devnet.solana.com`. If the deployment is on mainnet but this env var is accidentally missing, all financial operations (balance checks, escrow creation, settlement, burn verification) would query the wrong cluster. There is no startup assertion that validates the RPC URL matches the expected cluster, and no check that the configured endpoint is reachable before accepting connections.

- **[INFO — RPC-02] No fallback/secondary RPC endpoint.** There is no second endpoint configured for failover. If the primary RPC node is unavailable, the system has no automatic recovery path. This is a reliability concern rather than a direct security issue, but a degraded RPC node that returns slow or partial responses could cause settlement delays.

- **[LOW — RPC-03] RPC URL is also hardcoded into the CSP in `server/index.js`.** The CSP `connectSrc` directive at `server/index.js:77-88` explicitly names both `https://api.devnet.solana.com` and `https://api.mainnet-beta.solana.com`. If the operator changes `REACT_APP_SOLANA_RPC` to a private RPC provider's URL, the CSP will block client requests to that endpoint since the CSP is not dynamically generated from the env var. The server-side CSP controls only apply to HTML responses from the server, but the mismatch is a latent configuration trap.

---

### 2. Connection Object Lifecycle

**Files:** `server/services/solana.js:67-92`, `server/services/escrow.js:69`, `server/services/shot-token.js:36`, `client/src/wallet/WalletContext.js:27,110`

**Server side:**

`solana.js` maintains a module-level singleton via `getConnection()`:

```js
// solana.js lines 67-92
let connection = null;

export function initSolana() {
    connection = new Connection(SOLANA_RPC, 'confirmed');
    ...
    return connection;
}

export function getConnection() {
    if (!connection) {
        return initSolana();
    }
    return connection;
}
```

This is the intended shared connection. However:

`escrow.js` creates its own `Connection` inside `initEscrow()` and never exposes it — it is embedded in the `AnchorProvider`:

```js
// escrow.js line 69
const connection = new Connection(SOLANA_RPC, 'confirmed');
const wallet = new Wallet(escrowKeypair);
provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
});
```

`buildDepositTransaction()` then accesses this via `provider.connection`:

```js
// escrow.js line 347
const connection = provider.connection;
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
```

`shot-token.js` creates a third `Connection` at module load time, outside any initialization function, with no error handling if the URL is invalid:

```js
// shot-token.js lines 35-36
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');
```

**Findings:**

- **[MEDIUM — RPC-04] Three independent Connection objects across server subsystems.** `solana.js`, `escrow.js`, and `shot-token.js` each hold their own `Connection`. This means there are three independent TCP connection pools, three sets of WebSocket subscriptions, and potentially three different views of chain state if there is any clock skew or propagation delay between them. More critically, a credential reload via SIGHUP calls `initEscrow()`, which re-creates the `AnchorProvider` with a fresh `Connection` — but the `shot-token.js` connection is created at module import time and is never refreshed. If the RPC endpoint changes during a running process (e.g., the env var is hot-reloaded), `shot-token.js` continues to use the original connection.

- **[LOW — RPC-05] `shot-token.js` connection created at module import, no initialization guard.** The connection object in `shot-token.js` is constructed when the module is first imported, before `dotenv.config()` is confirmed to have run. In `server/index.js`, `dotenv.config()` is called at line 16, then `initKeys()` at line 19, then `mainsocket(io)` at line 113 (which triggers socket handler imports). If `shot-token.js` is imported as a transitive dependency before `dotenv.config()` runs, `process.env.SOLANA_RPC` will be `undefined` and the connection will be constructed with the devnet fallback even if a different RPC is configured. This is dependent on module import order, but it is a fragile initialization pattern.

**Client side:**

The client uses the wallet adapter's `ConnectionProvider` pattern, which is the standard and correct approach:

```js
// WalletContext.js lines 27, 374
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);
...
<ConnectionProvider endpoint={RPC_URL}>
```

The `connection` obtained via `useConnection()` is React lifecycle-managed, shared across all components, and updated if the endpoint changes. This is sound.

- **[INFO — RPC-06] Client and server RPC endpoints are independently configurable.** `REACT_APP_SOLANA_RPC` (client) and `SOLANA_RPC` (server) are separate env vars. If they are set to different RPC providers, the client and server may observe different chain state at the same logical moment. This is most relevant for escrow deposit confirmation: the client confirms via `connection.confirmTransaction(signature, 'confirmed')` against its RPC node, then sends an `escrowDepositConfirm` socket event. The server does not independently re-verify the transaction on-chain before recording the deposit — it trusts the socket message. If the client's RPC node is ahead of the server's RPC node by one or more blocks, this is harmless. If the client's node is behind (e.g., the client confirms a fork that later rolls back at `confirmed` level), the deposit could be accepted by the server despite the on-chain transaction being invalid. Finalized commitment would eliminate this risk entirely.

---

### 3. Commitment Levels

**Files:** `server/services/solana.js:74`, `server/services/escrow.js:69,71-74`, `server/services/shot-token.js:36,471-474`, `client/src/wallet/WalletContext.js:234,288`

**Server-side commitment choices:**

| Call site | Commitment | File | Notes |
|---|---|---|---|
| `Connection` constructor (solana.js) | `'confirmed'` | solana.js:74 | Used for `getBalance()` |
| `Connection` constructor (escrow.js) | `'confirmed'` | escrow.js:69 | Used for all Anchor RPC calls |
| `AnchorProvider` options | `preflightCommitment: 'confirmed'` | escrow.js:71-74 | Used for TX simulation + send |
| `Connection` constructor (shot-token.js) | `'confirmed'` | shot-token.js:36 | Used for `getParsedTransaction()` |
| `getParsedTransaction()` | `'confirmed'` | shot-token.js:471-474 | Burn verification |

**Client-side commitment choices:**

| Call site | Commitment | File | Notes |
|---|---|---|---|
| `confirmTransaction()` (escrow deposit) | `'confirmed'` | WalletContext.js:234 | Deposit wait |
| `confirmTransaction()` (SHOT burn) | `'confirmed'` | WalletContext.js:288 | Burn wait |

**Findings:**

- **[MEDIUM — RPC-07] Escrow deposit confirmed at `'confirmed'` (not `'finalized'`) and not independently re-verified by the server.** The client calls `connection.confirmTransaction(signature, 'confirmed')` and then immediately emits `escrowDepositConfirm` over the socket. The server-side `escrowDepositConfirm` handler in `main.js` records this confirmation and, when both players confirm, emits `escrowActive` — allowing the match to proceed. Neither `main.js` nor `escrow.js` independently calls `getEscrowState(matchId)` to verify the on-chain escrow account shows both deposits before activating the match. In practice, `'confirmed'` on Solana is extremely reliable (finalized within a few seconds), but the design places all trust in the client's assertion rather than the server independently verifying chain state. For a system handling real SOL, the server should call `getEscrowState()` and verify `playerOneDeposited` and `playerTwoDeposited` are both `true` before emitting `escrowActive`. The `getEscrowState()` function exists in `escrow.js` but is not called from this path.

- **[LOW — RPC-08] `'confirmed'` for burn verification is acceptable but creates a brief replay window.** `verifyBurnTransaction()` in `shot-token.js` requests the transaction at `'confirmed'` commitment. This means a transaction that is confirmed but not yet finalized could be accepted. If the block containing the burn is subsequently rolled back (rare but theoretically possible before finalization), the prestige would have been granted for a burn that did not ultimately land on the canonical chain. The existing in-memory `verifiedBurnTxs` set and MongoDB persistence (`persistBurnTx`) prevent replay of the same signature, but they do not protect against a roll-back scenario. Using `'finalized'` for burn verification would close this window at the cost of a few extra seconds of latency.

---

### 4. Balance Verification and Fail Behavior

**Files:** `server/services/solana.js:95-143, 262-272`

Two distinct balance functions exist with different failure semantics:

**`verifyBalance()` (lines 122-143) — used for join-room wager checks:**

```js
export async function verifyBalance(walletAddress, wagerSOL) {
    try {
        const lamports = await getCachedLamports(walletAddress);
        ...
        return { sufficient: balance >= required, balance, required };
    } catch (err) {
        console.error('[Solana] Balance check error:', err.message);
        return { sufficient: false, balance: 0, required: wagerSOL + 0.01 };
    }
}
```

This fails **closed**: on RPC error, `sufficient: false` is returned, which should prevent the player from joining a wagered match. Correct behavior.

**`getBalance()` (lines 262-272) — utility function:**

```js
export async function getBalance(walletAddress) {
    const conn = getConnection();
    try {
        const pubkey = new PublicKey(walletAddress);
        const lamports = await conn.getBalance(pubkey);
        return lamports / LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('[Solana] Balance error:', err.message);
        return 0;
    }
}
```

This fails **open**: on RPC error, it returns `0`. Whether this is harmful depends on what the caller does with `0`. If any caller uses this function to make a wager-gating decision and treats `0` as "insufficient" (fail-closed), the outcome is correct. However, if any code path uses the return value in a way that `0` is permissive, this becomes a vulnerability. Callers should be audited.

**Findings:**

- **[HIGH — RPC-09] 30-second balance cache creates a TOCTOU window for wager eligibility.** `getCachedLamports()` in `solana.js` caches the RPC balance result for 30 seconds per wallet address:

  ```js
  // solana.js lines 95-113
  const balanceCache = new Map(); // walletAddress → { lamports, expiresAt }
  const BALANCE_CACHE_TTL_MS = 30_000; // 30 seconds

  async function getCachedLamports(walletAddress) {
      const now = Date.now();
      const cached = balanceCache.get(walletAddress);
      if (cached && now < cached.expiresAt) {
          return cached.lamports;
      }
      const conn = getConnection();
      const pubkey = new PublicKey(walletAddress);
      const lamports = await conn.getBalance(pubkey);
      balanceCache.set(walletAddress, { lamports, expiresAt: now + BALANCE_CACHE_TTL_MS });
      return lamports;
  }
  ```

  This cache is shared globally across all callers. If player A's balance is checked at T=0 (showing sufficient funds), they can spend their SOL externally, and then join a second match at T=10 seconds — the cache will return the stale balance and allow entry. The 30-second window is wide enough for an attacker to: (1) get their balance cached during a legitimate join, (2) immediately transfer funds out of the wallet, and (3) join a second (or third) wager match within the cache window. Both matches would record a wager against a balance that no longer exists. With real escrow, this is mitigated at the on-chain level because `deposit_wager` will fail if the wallet lacks funds. However, the server may emit `escrowDeposit` transactions to both players before either confirms, and the lobby state is committed before the deposit is verified. The cache is a sound optimization for the read-heavy `/stats` path, but for wager eligibility it should either be removed or have its TTL reduced to 0–5 seconds.

  **Note:** The comment on line 94 says "Cuts RPC costs nearly in half for wagered games" — this is accurate, but the security cost is non-trivial for real-money wagers.

- **[MEDIUM — RPC-10] `getBalance()` return value of `0` on RPC error is semantically ambiguous.** Callers of `getBalance()` cannot distinguish "wallet has no SOL" from "RPC call failed". If this function is used in any decision path (e.g., the `/stats` endpoint reporting total wagered balances, or any future balance display logic), a transient RPC failure silently returns a misleading `0`. The function should throw on error or return a typed result distinguishing "balance is 0" from "balance is unknown due to RPC failure".

---

### 5. Error Handling on RPC Calls

**Files:** `server/services/solana.js`, `server/services/escrow.js`, `server/services/shot-token.js`, `client/src/wallet/WalletContext.js`

All server-side RPC call sites are wrapped in `try/catch` blocks. `escrow.js` wraps every exported async function in try/catch and returns `{ success: false, error: err.message }` on failure — this is a consistent and safe pattern. `solana.js` follows the same pattern for `verifyBalance()` but uses `return 0` for `getBalance()` as noted above.

`shot-token.js:verifyBurnTransaction()` correctly wraps the `getParsedTransaction()` call and returns `{ valid: false, reason: 'Failed to verify burn transaction' }` on error, which is fail-closed for prestige burns. This is correct.

The client-side `signAndSendEscrowDeposit()` and `signAndBurnShot()` both catch errors and return `null` on failure. The caller in `main.js` would see a null signature and should handle this gracefully. No escalated error reporting to the server occurs on RPC failure from the client side — the server simply never receives the `escrowDepositConfirm` event, and the match would time out waiting for deposits rather than failing explicitly.

**Findings:**

- **[MEDIUM — RPC-11] Anchor `.rpc()` calls do not explicitly set a timeout.** All Anchor method calls in `escrow.js` (`createMatchEscrow`, `settleMatchEscrow`, `cancelMatchEscrow`, etc.) use the default Anchor `.rpc()` call with no explicit `options` for timeout or retry. The `AnchorProvider` is configured with `commitment: 'confirmed'` and `preflightCommitment: 'confirmed'`, but no `skipPreflight: false` is explicitly set (it defaults to false, so preflight simulation is enabled — this is correct). However, if the RPC node is slow or saturated, these calls will hang indefinitely until the underlying `web3.js` connection times out. A long-running `settleMatchEscrow()` call that stalls but eventually succeeds could interleave with the settlement lock in `main.js`, depending on when the lock is released. There is no explicit per-call timeout or circuit-breaker.

---

### 6. Preflight Simulation

**Files:** `server/services/escrow.js:71-74`, `client/src/wallet/WalletContext.js:230`

The server's `AnchorProvider` is constructed without explicitly setting `skipPreflight`:

```js
// escrow.js lines 71-74
provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
});
```

Anchor's default for `skipPreflight` is `false`, meaning preflight simulation is enabled for all `.rpc()` calls. This is correct — if a settlement or cancel instruction would fail (e.g., authority mismatch, wrong state), it will be caught in simulation before being submitted and wasting the network fee.

The client's `sendTransaction(tx, connection)` in `WalletContext.js` does not pass explicit `SendOptions`, so it uses the wallet adapter's defaults. Phantom and Solflare both enable preflight by default. This is acceptable.

**Finding:** No issues with preflight configuration. Both the server's Anchor calls and the client's wallet adapter transaction sends use preflight simulation. This is correct behavior.

---

### 7. RPC Response Validation

**Files:** `server/services/solana.js`, `server/services/shot-token.js`

RPC responses are consumed directly without sanity checks on the returned data structure:

- `getBalance()` returns a number — consumed as `lamports / LAMPORTS_PER_SOL`. No validation that `lamports` is a non-negative integer.
- `getParsedTransaction()` returns a complex object — `shot-token.js` accesses `tx.transaction.message.instructions` and `tx.meta?.innerInstructions` without validating the top-level structure beyond a null check. If the RPC node returns a malformed or unexpected transaction format (e.g., version 0 transaction where the client expects legacy), the instruction parsing could silently miss the burn instruction, causing `burnFound` to remain `false` and the verification to reject a valid burn. The code does request `maxSupportedTransactionVersion: 0`, which is correct.

**Finding:** Low risk in practice since the `@solana/web3.js` library handles deserialization. The main gap is the absence of a positive assertion that `getBalance()` returned a valid number type before arithmetic (NaN propagation risk if the RPC returns an unexpected shape, though `web3.js` would throw rather than return NaN in this case).

---

### 8. Retry Mechanisms and TOCTOU

Beyond the balance cache (discussed in RPC-09), there are no explicit retry mechanisms in the codebase. All Anchor `.rpc()` calls are single-attempt. This is generally correct for settlement transactions — retrying a `settleMatch` call would hit the on-chain idempotency guard (Anchor accounts cannot be re-settled once closed). However, for `createMatchEscrow()` and `cancelMatchEscrow()`, a transient network error with no retry means the escrow account may never be created or cancelled, leaving the match in a state where the server believes escrow is disabled but the on-chain program has a partially initialized account. There is no server-side reconciliation loop to detect stale escrow accounts.

---

### 9. Monitoring Service RPC Usage

`monitoring.js` contains no RPC calls. It is a pure in-memory counter service with Express route handlers. No findings.

---

## Finding Index

| ID | Severity | Title | File(s) |
|---|---|---|---|
| RPC-01 | MEDIUM | Default public devnet fallback with no cluster validation | solana.js:27, escrow.js:42, shot-token.js:35 |
| RPC-02 | INFO | No fallback/secondary RPC endpoint | solana.js, escrow.js, shot-token.js |
| RPC-03 | LOW | CSP hardcodes devnet/mainnet URLs, not driven by env var | server/index.js:77-88 |
| RPC-04 | MEDIUM | Three independent Connection objects, no shared singleton | solana.js, escrow.js, shot-token.js |
| RPC-05 | LOW | `shot-token.js` Connection created at module import before dotenv confirmed | shot-token.js:35-36 |
| RPC-06 | INFO | Client and server RPC endpoints independently configurable — potential divergent views | WalletContext.js:27, solana.js:27 |
| RPC-07 | MEDIUM | Server does not independently verify escrow deposit on-chain before activating match | escrow.js:518-541, WalletContext.js:234 |
| RPC-08 | LOW | Burn verification uses `'confirmed'` not `'finalized'` — brief rollback window | shot-token.js:471-474 |
| RPC-09 | HIGH | 30-second balance cache creates TOCTOU window for wager eligibility | solana.js:95-113 |
| RPC-10 | MEDIUM | `getBalance()` returns 0 on RPC error — ambiguous fail-open for non-gating callers | solana.js:262-272 |
| RPC-11 | MEDIUM | Anchor `.rpc()` calls have no per-call timeout — can stall indefinitely | escrow.js:293-301, 400-411, 446-456 |

---

## Recommendations

**RPC-09 (HIGH):** Reduce balance cache TTL from 30 seconds to 3–5 seconds for wager-gated paths, or bypass the cache entirely for the `joinRoom` balance check. Alternatively, the cache should be invalidated when a player joins a wagered match.

**RPC-07 (MEDIUM):** Before emitting `escrowActive`, the server should call `getEscrowState(matchId)` and verify that `playerOneDeposited` and `playerTwoDeposited` are both `true`. Do not rely solely on client socket messages to gate match activation.

**RPC-04 (MEDIUM):** Consolidate to a single `Connection` instance, created in `solana.js:initSolana()` and injected into `escrow.js` and `shot-token.js` via a shared `getConnection()` import. This prevents divergent views and reduces connection pool overhead.

**RPC-11 (MEDIUM):** Wrap all settlement-critical `program.methods...rpc()` calls with an explicit timeout (e.g., 30 seconds) by passing `options: { commitment: 'confirmed', maxRetries: 2 }` or using a `Promise.race()` with a timeout rejection.

**RPC-01 (MEDIUM):** Add a startup assertion that validates `SOLANA_RPC` is set and contains a cluster indicator (`mainnet-beta`, `devnet`, `testnet`) matching `REACT_APP_SOLANA_NETWORK`. Log a fatal error and exit if they are inconsistent.

**RPC-10 (MEDIUM):** Rename or replace `getBalance()` with a version that throws on error rather than returning 0, or change the return type to `{ lamports: number | null, error?: string }` to make the failure mode explicit to callers.

**RPC-08 (LOW):** Consider using `'finalized'` commitment for `verifyBurnTransaction()` to eliminate the rollback window for prestige unlocks. The added latency (~20–30 seconds on devnet) is acceptable for a one-time prestige operation.

**RPC-03 (LOW):** Generate the CSP `connectSrc` directive dynamically from `process.env.SOLANA_RPC` so that custom RPC providers are not silently blocked by the hardcoded policy.
