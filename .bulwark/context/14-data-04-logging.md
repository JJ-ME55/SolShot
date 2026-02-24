# DATA-04: Logging & Information Disclosure

**task_id:** DATA-04
**auditor:** DATA-04 (Logging & Information Disclosure)
**generated:** 2026-02-23
**scope:** All server files + client files (browser console exposure)

---

## CONDENSED SUMMARY

### Infrastructure

The server has a `pino`-based structured logger (`server/services/logger.js`) but it is used in only **4 of ~12 logging call sites** across the four files that import it. The remaining ~45+ server-side log calls use raw `console.log`, `console.error`, and `console.warn`. Pino is configured with a `redact` list for wallet-address fields, but this redaction only applies to the minority of calls that pass through the structured logger — the majority of operational logs bypass it entirely.

### What Is Logged (Server)

No private keys, seed phrases, or raw secret values are logged. The escrow authority **public key** (base58) is logged at startup, which is acceptable. Transaction signatures (Solana txids), match IDs, room IDs, PDA addresses, wager amounts in SOL, and treasury/ops wallet addresses are all logged via `console.log` at info level. These are not secrets but do create a financial activity trail in server logs.

### What Is Logged (Client)

Client-side `console.log` calls in `WalletContext.js` and `BattleScreen.js` emit transaction signatures and auth-flow status strings to the browser developer console. No private keys or wallet secrets are emitted. The logs are visible to any user who opens DevTools, which is expected for browser JS but is worth noting for competitive gameplay analysis.

### Key Issues Found

1. **MEDIUM — Fragmented logging infrastructure**: Pino with redaction is imported in 4 files but bypassed by ~45+ raw `console.*` calls in the same files. The redaction guarantees are therefore not meaningful — wallet addresses can appear in the unredacted streams.

2. **MEDIUM — Settlement data logged verbatim in plain console**: `console.log('[Solana] Match settled:', settlementInfo)` at `main.js:2119` logs an object containing `wager`, `totalPot`, `winnerPayout`, `treasuryFee`, `opsFee`, and `txSignature` as a plain JS object dump. In production this appears in stdout unstructured, bypassing pino redaction.

3. **MEDIUM — Forfeit settlement object logged verbatim**: `console.log('[Solana] Forfeit settlement...', settlementResult)` at `main.js:662` logs the entire settlement result object including financial fields.

4. **LOW — Debug-level fire logs left in production path**: `main.js:1932` and `main.js:1944` log every shot's tank positions (sliced IDs) and impact/damage values at `console.log` level. These are unconditional — they fire on every shot in production.

5. **LOW — Balance figures echoed to clients in error messages**: `joinRoomError` and `createRoomError` responses at `main.js:986` and `main.js:1141` include the player's actual SOL balance: `"Insufficient SOL balance. Need X, have Y"`. This leaks balance information to the network layer.

6. **LOW — Treasury and Ops wallet addresses logged at startup**: `escrow.js:85-86` logs `TREASURY_WALLET` and `OPS_WALLET` env var values to stdout. These are not secrets but their disclosure in logs adds unnecessary surface for operational reconnaissance.

7. **LOW — `errors.recent` in `/stats` endpoint**: The `/stats` endpoint (now protected by `requireAdminKey`) returns the last 5 error messages from the in-memory store. `trackError` stores `error.message` strings. Some error messages may contain room IDs, wallet addresses, or Anchor error payloads depending on where they are called.

8. **LOW — `uncaughtException` handler logs full Error object**: `index.js:178` passes the entire `err` object to `console.error`. Node.js will serialize the error including its `stack` property, writing full stack traces (including file paths) to stdout/stderr. These are server-side only but can expose internal path structure to log aggregators.

9. **INFO — No log rotation configured**: Pino outputs to stdout/stderr only. There is no file-based transport, no rotation policy, and no size limit in the code. Disk exhaustion via log volume is a deployment-level concern not addressed in code.

10. **INFO — Telegram user data logged**: `telegram.js:97` logs `user.first_name` and `user.id` from validated Telegram initData. These are PII and will appear in server logs. The risk is low (valid users only, no secrets) but worth flagging for GDPR/privacy compliance.

---

## FULL ANALYSIS

### 1. Logger Infrastructure

**File:** `/server/services/logger.js`

```js
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'walletAddress', 'wallet', 'winner', 'loser', 'player',
            'p1wallet', 'p2wallet', 'winnerAddress', 'loserAddress',
            '*.walletAddress', '*.wallet',
        ],
        censor: '[REDACTED]',
    },
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
});
```

**Assessment:**
- Pino is a solid choice. Structured JSON in production, pretty-print in dev.
- The redaction list covers the most important wallet address field names.
- `level` is configurable via `LOG_LEVEL` env var, which is good.
- However, the redaction is only applied to calls going through `logger.*`. The ~45 raw `console.*` calls in the same files do not benefit from this.

**Coverage of structured logger across files that import it:**

| File | Structured `logger.*` calls | Raw `console.*` calls |
|------|------|------|
| `server/services/escrow.js` | 1 (`logger.info` in `settleMatchEscrow`) | ~20 |
| `server/services/solana.js` | 3 (`logger.info` in `settleMatch`, `refundWager`, and on-chain settlement path) | ~5 |
| `server/services/shot-token.js` | 3 (`logger.info` in `loadMilestoneState`, `prestigeBurn`) | ~5 |
| `server/socket-io/main.js` | 3 (`logger.info` in authenticate, prestige, stats persist) | ~49 |

The structured logger is used for a small subset of high-value events (settlement, prestige burn, authentication confirmation). The majority of logging — including all error paths, recovery paths, and operational status messages — uses `console.*` and is unstructured.

---

### 2. Private Key / Credential Logging

**Files examined:** `keys.js`, `escrow.js`, `auth.js`, `solana.js`, `index.js`

No private key material (raw bytes, base64 key, mnemonic, seed phrase) is logged anywhere. The closest pattern is:

**`server/services/keys.js:57`**
```js
console.log(`[Keys] Escrow authority: ${_escrowKeypair.publicKey.toBase58()}`);
```
This logs the **public key** only — acceptable.

**`server/services/escrow.js:82-86`**
```js
console.log(`[Escrow] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}`);
console.log(`[Escrow] Program ID: ${PROGRAM_ID.toBase58()}`);
console.log(`[Escrow] Config PDA: ${configPDA.toBase58()}`);
console.log(`[Escrow] Treasury: ${TREASURY_WALLET || 'NOT SET'}`);
console.log(`[Escrow] Ops: ${OPS_WALLET || 'NOT SET'}`);
```
Program ID and PDA addresses are public. Treasury and Ops wallet addresses are env-var values; their appearance in server logs is not a secret leak but is unnecessary operational disclosure.

**`server/middleware/auth.js:21,25`**
```js
console.error('[Auth] FATAL: JWT_SECRET must be set in production');
console.warn('[Auth] No JWT_SECRET set — using random secret (dev mode)...');
```
The JWT secret itself is not logged — only its absence. This is safe.

**Verdict:** No private key material logged. No credential values logged.

---

### 3. Wallet Address Logging

Wallet addresses (Solana base58 public keys) appear in several log contexts:

**`server/services/shot-token.js:184`**
```js
console.error(`[SHOT] Failed to load milestone state for ${walletAddress}:`, err.message);
```
A wallet address is interpolated directly into a `console.error` string. This bypasses the pino redaction.

**`server/services/shot-token.js:222`**
```js
console.error(`[SHOT] Failed to save milestone state for ${walletAddress}:`, err.message);
```
Same pattern.

These are on error paths and log the address associated with a failed DB operation. Acceptable operationally but technically bypasses the redaction goal.

The pino `redact` configuration would catch wallet addresses logged as object fields (e.g., `logger.info({ walletAddress }, ...)`), but not string interpolation.

---

### 4. Financial Data Logging

**Finding: Settlement object logged verbatim**

**`server/socket-io/main.js:2119`**
```js
console.log('[Solana] Match settled:', settlementInfo)
```
Where `settlementInfo` is:
```js
settlementInfo = {
    wager: ws.amount,
    totalPot: ws.amount * 2,
    winnerPayout: sResult.settlement.winner,
    treasuryFee: sResult.settlement.treasury,
    opsFee: sResult.settlement.ops,
    txSignature: sResult.txSignature
}
```
This logs the full settlement breakdown including wager amounts and payout values. The winner's wallet address is NOT included here (the winner is identified by socketId, not wallet in this context), but the financial amounts and txSignature are fully disclosed. In production this appears as an unstructured object dump in stdout.

**`server/socket-io/main.js:662`**
```js
console.log(`[Solana] Forfeit settlement (${reason}):`, settlementResult)
```
`settlementResult` contains `settlement.winner`, `settlement.treasury`, `settlement.ops`, `txSignature`. Similar financial disclosure.

**`server/services/solana.js:216` (via pino)**
```js
logger.info({ winnerSOL: settlement.winner, treasurySOL: settlement.treasury, opsSOL: settlement.ops, totalPot }, '[Solana] Settlement (off-chain)');
```
This one correctly uses the structured logger. The field names (`winnerSOL`, etc.) are not in the redact list, so they appear in the JSON log. This is intentional for audit purposes and is acceptable.

**`server/socket-io/main.js:1249`**
```js
console.log(`[Queue] Wager mismatch: opponent=${opponent.wager} SOL, joiner=${wagerAmount} SOL — queued separately`);
```
Logs wager amounts of specific players during matchmaking. Useful for debugging but reveals per-player financial intent.

**`server/socket-io/main.js:1372`**
```js
console.log(`[Queue] Matched: ${opponent.name} vs ${sanitizeName(playerName)} in ${matchMode} (${roundType}) @ ${wagerAmount} SOL — room ${roomId}`);
```
Logs matched player names and wager amounts together. Creates a correlation between identities and financial values in server logs.

**`server/socket-io/main.js:1387`**
```js
console.log(`[Queue] ${sanitizedName} queued for ${matchMode} (${matchLength}) @ ${wagerAmount} SOL — ${queue.length} waiting`);
```
Same pattern — name + wager amount in single log line.

---

### 5. Debug Logs in Production Path

**`server/socket-io/main.js:1932,1944`**
```js
console.log('[Fire] tanks:', tanks.map(t => ({ id: t.id.slice(0,8), x: Math.round(t.x), y: Math.round(t.y) })))
// ... fire processing ...
console.log('[Fire] impact:', result.impact, 'damage:', result.damage)
```
These fire on **every single shot** in every match, in production. They log truncated socketIds, tank coordinates, impact point, and damage values. This is clearly debugging code that was not removed before production readiness. At 2 shots per turn, 20+ turns per match, this produces ~40+ log lines per match purely for debugging. In a high-traffic deployment this contributes meaningfully to log volume.

**`server/socket-io/main.js:1430`**
```js
console.log(`[BO3] Between-round shop: Round ${ms.currentRound} ended. Gold: host=${getBalance(...)}, player=${getBalance(...)}`)
```
Logs Gold balances of both players at each round transition. Minor but unnecessary production noise.

---

### 6. Client-Side Console Exposure

**File:** `client/src/wallet/WalletContext.js`

```js
console.log('[SolShot] Escrow deposit TX sent:', signature);    // line 231
console.log('[SolShot] Escrow deposit confirmed:', signature);  // line 235
console.log('[SolShot] SHOT burn TX sent:', signature);         // line 285
console.log('[SolShot] SHOT burn confirmed:', signature);       // line 289
console.log('[SolShot] Auth confirmed by server');              // line 305
console.log('[SolShot] Auto-authenticating wallet...');         // line 331
```

Transaction signatures emitted in the browser console are not secrets — they are already public on the Solana ledger — but they do allow any user who opens DevTools to trivially reconstruct their own and their opponents' on-chain activity timeline. This is a low concern for a game context.

**File:** `client/src/screens/BattleScreen.js`

```js
console.log('[Battle] Escrow deposit signed:', sig);            // line 132
```
Transaction signature in browser console.

**File:** `client/src/scenes/main/index.js`

```js
console.log('[SolShot] applyTurnResult: impact=' + JSON.stringify(data.impact) + ' damage=' + JSON.stringify(damage) + ...)
console.log('[SolShot] HP update: ...')
```
Detailed gameplay event data (damage, HP, impact position) in the browser console. This is expected for a game but means that any opponent running with DevTools open can read the full server state for every shot — including HP values and impact coordinates that might otherwise be revealed only progressively in the UI.

---

### 7. Error Response Information Disclosure

**HTTP Endpoints:**

`GET /health` returns:
```json
{ "status": "ok", "uptime": "Xh", "uptimeMs": 123, "activeConnections": 5, "timestamp": "...", "version": "1.0.0" }
```
No sensitive data. Active connection count and version string are minor disclosures but acceptable.

`GET /stats` (protected by `requireAdminKey`) returns:
```json
{
    "errors": {
        "count": 12,
        "recent": [
            { "timestamp": "...", "message": "settlement_failed", "context": "settlement" },
            ...
        ]
    }
}
```
The `errors.recent` array stores the last 5 error messages collected by `trackError()`. These messages come from exception `.message` properties and include Anchor error payloads (e.g., constraint violations from the escrow program). These could in principle contain room IDs, match IDs, or partial wallet information depending on how the underlying library formats errors. Because `/stats` now requires the `ADMIN_API_KEY` header (`guards.js:requireAdminKey`), this endpoint is appropriately protected.

**Socket Error Responses:**

The balance echo in join/create room error is the most notable disclosure:
```js
// main.js:986
reason: `Insufficient SOL balance. Need ${balanceCheck.required.toFixed(3)}, have ${balanceCheck.balance.toFixed(3)}`
```
This tells the client their actual wallet balance as seen from the server's RPC call. Since the client's own wallet adapter can query this directly, the disclosure is not a meaningful elevation, but it is an unnecessary server-sourced confirmation of balance data.

**Stack Traces:**

No server stack traces are returned to HTTP clients or socket clients. Error responses use `err.message` only. The `uncaughtException` handler in `index.js:178` passes the full `err` object to `console.error`, which Node.js renders with stack trace, but this goes to server stdout only — not to any client.

---

### 8. Log Rotation and Disk Exhaustion

Pino is configured to write to stdout (default). There is no file transport, no rotation (`pino-roll` or `logrotate`), and no size limit in the application code. In a cloud deployment (Render), stdout is captured by the platform's log aggregator with its own retention policy. For self-hosted deployments, unbounded log output combined with the per-shot debug logs (2 `console.log` per shot, every match) could contribute to disk or aggregator quota pressure over time. This is a deployment concern rather than a code vulnerability, but the per-shot debug logs are the main contributing factor that should be removed.

---

### 9. Telegram PII in Logs

**`server/middleware/telegram.js:97`**
```js
console.log(`[Telegram] Validated user: ${user.first_name} (ID: ${user.id})`);
```
`user.first_name` is a Telegram-provided display name; `user.id` is the Telegram numeric user ID. Both are PII under GDPR. They appear in server logs for every validated Telegram connection. If server logs are shipped to a third-party aggregator (Datadog, Papertrail, etc.), this constitutes inadvertent PII transfer. The logging adds no operational value that cannot be obtained from an anonymous validation success/failure count.

---

## Findings Summary

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| LOG-01 | MEDIUM | `main.js`, `escrow.js`, `solana.js`, `shot-token.js` | ~45 raw `console.*` calls bypass pino redaction; wallet-address-in-string interpolation not caught by redact config |
| LOG-02 | MEDIUM | `main.js:2119`, `main.js:662` | Settlement financial data (wager, payouts, fees, txSignature) logged as verbatim object dump via `console.log`, bypassing structured logger |
| LOG-03 | LOW | `main.js:1932`, `main.js:1944` | Per-shot debug logs unconditionally active in production; logs tank positions, impact point, damage on every shot |
| LOG-04 | LOW | `main.js:986`, `main.js:1141` | Player wallet SOL balance echoed back in error message to the client socket |
| LOG-05 | LOW | `main.js:1372`, `main.js:1387` | Player name and wager amount correlated in the same log line during matchmaking |
| LOG-06 | LOW | `escrow.js:85-86` | Treasury and ops wallet addresses from env vars logged to stdout at startup |
| LOG-07 | LOW | `monitoring.js`/`getStats` | `errors.recent` in `/stats` response may contain Anchor program error payloads; endpoint now protected by `requireAdminKey` |
| LOG-08 | LOW | `index.js:178` | `uncaughtException` handler logs full Error object including stack; discloses internal file paths in server-side logs |
| LOG-09 | LOW | `telegram.js:97` | Telegram `first_name` and `user.id` (PII) logged on every successful validation |
| LOG-10 | INFO | `logger.js` | No file transport or rotation configured; per-shot debug logs increase log volume; deployment-level concern |
| LOG-11 | INFO | `WalletContext.js`, `BattleScreen.js` | Client logs tx signatures and auth events to browser console; no sensitive data, expected for game UI |

---

## Recommendations

**Priority 1 — Remove per-shot debug logs (LOG-03):**
Remove or gate behind `process.env.LOG_LEVEL === 'debug'` the two fire-handler console.log calls at `main.js:1932` and `main.js:1944`. These produce significant production log volume and expose shot-by-shot game state.

**Priority 2 — Migrate settlement logs to structured logger (LOG-02):**
Replace `console.log('[Solana] Match settled:', settlementInfo)` and the forfeit equivalent with `logger.info({ wager, totalPot, txSignature }, '[Solana] Match settled')`. This routes through pino's redaction pipeline. Add wallet-neutral field names so amounts are logged without player wallet association.

**Priority 3 — Audit remaining console.* calls for wallet-containing strings (LOG-01):**
Walk through the ~45 raw `console.*` calls and either: (a) migrate financially/identity-sensitive ones to `logger.*` with structured fields, or (b) remove/reduce those that are pure debugging noise. Key targets: `shot-token.js:184,222` (wallet in error string), `main.js:1372,1387` (name+wager correlation).

**Priority 4 — Remove SOL balance from client error responses (LOG-04):**
Change the joinRoom/createRoom balance error to a generic message: `"Insufficient SOL balance"` without the specific amounts. The client's own wallet adapter can show the user their balance; the server does not need to confirm it.

**Priority 5 — Remove Telegram PII from logs (LOG-09):**
Replace `console.log('[Telegram] Validated user: ${user.first_name} (ID: ${user.id})')` with `console.log('[Telegram] User validated successfully')` or remove entirely. A counter metric is sufficient.

**Priority 6 — Configure LOG_LEVEL in production deployment:**
Ensure `LOG_LEVEL=warn` or `LOG_LEVEL=error` is set in the production environment to suppress info-level pino output. This also requires the per-shot debug logs to be gated behind debug level (Priority 1) to take effect.
