<!-- CONDENSED_SUMMARY_START -->
---
task_id: SEC-02
auditor: Secret & Credential Management
date: 2026-02-23
scope: server/ + client/src/ (off-chain only)
files_reviewed: 13
severity_counts: {critical: 1, high: 3, medium: 3, low: 2, info: 3}
---

## SEC-02 Condensed Summary

### Overall Posture
Secret management is substantially correct. All runtime secrets are loaded from environment variables via `process.env`. No private keys, JWT secrets, bot tokens, or database credentials are hardcoded in source code. The `keys.js` centralized keypair module, the production-only `JWT_SECRET` enforcement, and Render's `sync: false` pattern for true secrets are all solid. However, five discrete findings remain, one of which (the hardcoded Anchor program ID) is operationally significant for mainnet deployment.

### Findings Summary

| ID | Severity | Title | File |
|----|----------|-------|------|
| SC-01 | CRITICAL | Program ID hardcoded — not read from env | `server/services/escrow.js:39` |
| SC-02 | HIGH | `JWT_SECRET` placeholder in `.env.example` is weak | `server/.env.example:JWT_SECRET` |
| SC-03 | HIGH | `TELEGRAM_BOT_TOKEN` absent from `render.yaml` and `server/.env.example` | `server/middleware/telegram.js`, `render.yaml` |
| SC-04 | HIGH | `client/.env` contains `JWT_SECRET` (server-only secret in client file) | `client/.env` |
| SC-05 | MEDIUM | `SOLANA_RPC` duplicated in three services — no central env ingestion point | `escrow.js:42`, `solana.js:27`, `shot-token.js:35` |
| SC-06 | MEDIUM | Treasury/Ops wallet addresses in plaintext inside committed `render.yaml` | `render.yaml:29-32` |
| SC-07 | MEDIUM | `client/.env.example` committed but contains devnet on-chain IDs that will need updating for mainnet | `client/.env.example` |
| SC-08 | LOW | `telegram.js` uses CommonJS `require()` — ESM server will crash if it is ever imported | `server/middleware/telegram.js:1` |
| SC-09 | LOW | Logger redact list does not cover `txSignature` or `matchId` — minor operational data leakage | `server/services/logger.js` |
| SC-10 | INFO | `ADMIN_API_KEY` absent from `server/.env.example` | `server/.env.example` |
| SC-11 | INFO | `MATCH_ESCROW_PROGRAM_ID` env var declared in `.env.example` and `render.yaml` but never read by `escrow.js` | `escrow.js`, `server/.env.example` |
| SC-12 | INFO | `LOG_LEVEL` defaults to `info`; if operator sets `debug`, structured logs may surface financial amounts | `server/services/logger.js:4` |

### Key Positives (Correct Patterns)
- All true secrets (`SOLANA_KEYPAIR_JSON`, `ADMIN_API_KEY`, `MONGODB_URI`) use `sync: false` in `render.yaml` — never committed to git.
- `JWT_SECRET` uses Render `generateValue: true` — cryptographically random on first deploy.
- `keys.js` is the single ingestion point for the server keypair; KM-04 zero-fill after Keypair construction is correct.
- `requireAdminKey` fails closed when `ADMIN_API_KEY` is not set.
- `auth.js` calls `process.exit(1)` in production if `JWT_SECRET` is missing.
- No private keys found in source code, test files, or committed `.env` files.
- `client/.env` is properly gitignored by `client/.gitignore`.
- Pino logger has a redact list covering wallet addresses.

### Top Remediation Actions
1. **SC-01 (CRITICAL):** Read program ID from `process.env.MATCH_ESCROW_PROGRAM_ID` in `escrow.js`. A code deployment is currently required for every program ID rotation.
2. **SC-02 (HIGH):** Replace `JWT_SECRET=change-me-to-a-random-64-char-string` placeholder with `JWT_SECRET=` (empty, forcing operators to set it), or add a startup assertion like auth.js already does for production.
3. **SC-03 (HIGH):** Add `TELEGRAM_BOT_TOKEN` to `server/.env.example` and `render.yaml` (as `sync: false`) so that Telegram validation is not silently disabled on Render deployments.
4. **SC-04 (HIGH):** Remove `JWT_SECRET` from `client/.env`. While CRA does not bundle non-`REACT_APP_` vars, its presence is a maintenance hazard and confuses operators about secret scoping.
5. **SC-05 (MEDIUM):** Centralize `SOLANA_RPC` ingestion to `solana.js` and have `escrow.js` and `shot-token.js` import the shared connection or constant.
<!-- CONDENSED_SUMMARY_END -->

---

# SEC-02 Full Analysis: Secret & Credential Management

**Auditor:** SEC-02
**Date:** 2026-02-23
**Project:** SolShot-clean
**Scope:** All off-chain code — `server/`, `client/src/`
**Excluded:** `programs/` (Anchor on-chain)

---

## Methodology

1. Read `.bulwark/INDEX.md` and `.bulwark/HOT_SPOTS.md` for SEC-02 pattern hits.
2. Read full source of all 13 files handling env vars, secrets, and credentials.
3. Read `.audit/ARCHITECTURE.md` for system-level context.
4. Checked git history for committed `.env` files (`git ls-files | grep .env`).
5. Searched for hardcoded secrets using regex patterns against all server and client source.
6. Examined deployment config (`render.yaml`) for secret handling patterns.

---

## File-by-File Evidence

### `server/services/keys.js`

**Rating: GOOD with minor notes**

```javascript
export function initKeys() {
    const keypairJson = process.env.SOLANA_KEYPAIR_JSON;
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;

    if (!keypairJson && !keypairPath) {
        console.warn('[Keys] No SOLANA_KEYPAIR_JSON/PATH configured — keys not loaded (dev mode)');
        return false;
    }

    try {
        let secretKeyArray;
        if (keypairJson) {
            secretKeyArray = JSON.parse(keypairJson);
        } else {
            const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
            secretKeyArray = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        }

        const bytes = Uint8Array.from(secretKeyArray);
        _escrowKeypair = Keypair.fromSecretKey(bytes);

        // KM-04: Zero the input array
        bytes.fill(0);

        console.log(`[Keys] Escrow authority: ${_escrowKeypair.publicKey.toBase58()}`);
        return true;
    } catch (err) {
        console.error('[Keys] Failed to load keypair:', err.message);
        return false;
    }
}
```

**Positives:**
- Single ingestion point for keypair (KM-03 pattern).
- KM-04 byte zeroing is correct — `Keypair.fromSecretKey` slices internally, so the source buffer is safe to wipe.
- `SOLANA_KEYPAIR_JSON` supports cloud deploy without filesystem keypair files.
- Error message on failure does not expose the key or path contents.
- Public key logged (not secret key) — appropriate.

**Notes:**
- `~` expansion via simple `replace('~', ...)` is not a path traversal risk here because the string comes from a trusted env var, not user input. However using `path.resolve` and `os.homedir()` would be more correct.
- No length validation on `secretKeyArray` before constructing the keypair — a malformed array would throw inside `Keypair.fromSecretKey()`, which is caught. Acceptable.

---

### `server/middleware/auth.js`

**Rating: GOOD with one HIGH finding (SC-02 affects .env.example, not this file)**

```javascript
// H007: Remove hardcoded JWT secret fallback
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] FATAL: JWT_SECRET must be set in production');
        process.exit(1);
    }
    const devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] No JWT_SECRET set — using random secret (dev mode). Tokens will not survive restart.');
    return devSecret;
})();
```

**Positives:**
- Production guard with `process.exit(1)` is correct — hard fail rather than weak default.
- Dev fallback uses `crypto.randomBytes(32)` — 256-bit random secret. Correct.
- JWT is signed with `{ expiresIn: '24h' }`. Reasonable.
- `verifyToken` function exists and is used for verification.

**Concerns:**
- The IIFE pattern is evaluated at module load time. In production, if `JWT_SECRET` is missing, the process exits before serving any requests. This is the desired behaviour but means startup failures may not produce useful logs if the logger hasn't initialized yet. Minor operational concern only.

---

### `server/middleware/guards.js`

**Rating: GOOD**

```javascript
export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
```

**Positives:**
- Fails closed when `ADMIN_API_KEY` is not set in env — the first condition `!process.env.ADMIN_API_KEY` returns 401 before comparing to the header.
- No timing attack protection (constant-time comparison), but ADMIN_API_KEY is a long random string and this endpoint is not a high-value timing oracle.

---

### `server/services/escrow.js`

**Rating: MIXED — one CRITICAL finding (SC-01)**

```javascript
// Program ID — must match deployed program
// NOTE: This ID will change after fresh deploy — see OC-14 deploy checklist
const PROGRAM_ID = new PublicKey('CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD');
```

**SC-01 (CRITICAL):** The Anchor program ID is hardcoded as a string literal rather than read from `process.env.MATCH_ESCROW_PROGRAM_ID`. The env var `MATCH_ESCROW_PROGRAM_ID` is declared in `server/.env.example` and set in `render.yaml`, but `escrow.js` never reads it. This creates two problems:

1. Any program ID rotation (devnet → mainnet, or post-exploit redeploy) requires a **code change and redeployment** rather than an environment variable update. This significantly increases the blast radius of a program upgrade event and slows incident response.
2. The env var `MATCH_ESCROW_PROGRAM_ID` in `render.yaml` is a dead configuration key that creates an illusion of configurability.

**5-Whys for SC-01:**
- Why is program ID hardcoded? The original implementation chose to hardcode it for simplicity.
- Why is that a problem? Program upgrades require code changes, not just env updates.
- Why does that matter? On mainnet, incident response (e.g., emergency pause + redeploy) needs to be fast; a code deploy takes minutes to hours vs. env var update is seconds.
- Why wasn't the env var wired up? The env var was declared for documentation/render.yaml consistency but the code was never updated to read it.
- Why is this CRITICAL and not just LOW? Because it silently creates the false impression that the program ID is configurable, and because it creates coupling between secret management and code deployment that should not exist for a financial system.

**Other escrow.js env vars (correct patterns):**
```javascript
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET;   // undefined if not set
const OPS_WALLET = process.env.OPS_WALLET;             // undefined if not set
```

The `TREASURY_WALLET` and `OPS_WALLET` correctly have no hardcoded fallbacks — `settleMatchEscrow()` returns an error if they are unset:
```javascript
if (!TREASURY_WALLET || !OPS_WALLET) {
    return { success: false, error: 'Treasury/Ops wallets not configured' };
}
```

**Log review — escrow.js:**
Lines 82-86 log public key addresses (authority, program ID, config PDA, treasury, ops) at startup. These are public Solana addresses — no secret data is logged.

---

### `server/services/solana.js`

**Rating: GOOD with one MEDIUM finding (SC-05)**

```javascript
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET || null;
const OPS_WALLET = process.env.OPS_WALLET || null;
```

Correct pattern. All values are env-sourced. Treasury and ops fall back to `null` (which causes `settleMatch` to use off-chain logging in dev mode).

**SC-05 (MEDIUM) — SOLANA_RPC duplicated across three services:**
`escrow.js:42`, `solana.js:27`, and `shot-token.js:35` each independently read `process.env.SOLANA_RPC` with the same devnet default. If an operator sets a custom RPC endpoint, they must ensure it is picked up by all three — which it will be since all three read the same env var name. The risk is not a secret leak, but a maintenance hazard: if the env var name changes, or if a service needs a different commitment level, three files must be updated. The pattern diverges from the centralized approach used for keypairs (`keys.js`).

---

### `server/services/shot-token.js`

**Rating: GOOD**

```javascript
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const SHOT_MINT = process.env.SHOT_TOKEN_MINT || null;
```

Both values are env-sourced. Dev-mode bypass (skipping on-chain burn verification when `SHOT_TOKEN_MINT` is not set) is documented and appropriate for development workflow.

```javascript
// If no SHOT mint is configured, skip on-chain verification (dev mode)
if (!SHOT_MINT) {
    console.log('[SHOT] No SHOT_TOKEN_MINT configured — skipping on-chain burn verification (dev mode)');
```

This is a documented and acceptable divergence. The check is transparent and logged.

---

### `server/middleware/telegram.js`

**Rating: MIXED — two findings (SC-03, SC-08)**

```javascript
const crypto = require('crypto');  // CommonJS require in ESM server

function validateTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping validation');
    return { valid: false, user: null };
  }
  // ...
}
```

**SC-03 (HIGH) — TELEGRAM_BOT_TOKEN undocumented in deployment config:**
- `TELEGRAM_BOT_TOKEN` is read from env (correct) but is absent from `server/.env.example` and `render.yaml`.
- A developer setting up Telegram integration by following the `.env.example` will not know this variable is required.
- More critically, on Render deployment, if the operator does not manually add `TELEGRAM_BOT_TOKEN`, validation silently fails open (the middleware returns `{ valid: false, user: null }` and calls `next()` — Telegram auth is "supplementary, not required"). This means Telegram user identity is never attached to sockets in production, degrading the feature to zero without any error signal.

**5-Whys for SC-03:**
- Why is `TELEGRAM_BOT_TOKEN` missing from the docs? Likely added after the initial `.env.example` was written.
- Why does that matter? Silent failure — operators don't know the feature is broken.
- Why is silent failure bad here? Telegram user identity (`socket.isTelegram`, `socket.telegramUser`) may be used for access control decisions upstream.
- Why isn't there an error? The middleware explicitly suppresses the warning when no bot token is set.
- Why is this HIGH not CRITICAL? The current codebase does not gate any financial operations on Telegram identity — it is supplementary. If that changes, this becomes CRITICAL.

**SC-08 (LOW) — CommonJS in ESM server:**
```javascript
const crypto = require('crypto');  // telegram.js line 1
```

The server uses `"type": "module"` in `package.json`, making all `.js` files ESM by default. `require()` is not available in ESM scope. If `telegram.js` is ever imported using `import` in the ESM server, Node.js will throw `ReferenceError: require is not defined`. Currently, `telegram.js` is NOT imported anywhere in the server codebase (confirmed by grep), so this is a latent defect rather than an active failure. The file would need to be converted to ESM (`import crypto from 'crypto'` / `export`) before being usable.

---

### `server/services/logger.js`

**Rating: GOOD with one LOW finding (SC-09)**

```javascript
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
    // ...
});
```

**Positives:** Pino redaction is applied at the serializer level — it cannot be bypassed by accident. The redact list covers the most common wallet address field names.

**SC-09 (LOW) — Incomplete redact coverage:**
- `txSignature` is not redacted. Transaction signatures are public Solana data, but logging them may be undesirable in some compliance contexts.
- `matchId` is not redacted. Match IDs are room-scoped UUIDs — low sensitivity.
- Structured `console.log` calls (not going through pino) in `main.js` bypass redaction entirely. The forfeit settlement log at line 662 passes the entire `settlementResult` object via `console.log`, which includes `{ success, settlement: { winner, treasury, ops }, txSignature }`. SOL amounts (not wallet addresses) are exposed in plain `console.log`. This is an operational data leakage, not a credential leak.

---

### `server/index.js`

**Rating: GOOD**

All env var usage is correct:
```javascript
const PORT = process.env.PORT || 5001
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];
const MONGODB_URI = process.env.MONGODB_URI;
```

CORS defaults to `localhost:3000` only — not a wildcard. Production override is externalized.

---

### `client/src/wallet/WalletContext.js`

**Rating: GOOD — no secrets present**

```javascript
const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);
const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
    ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
    : null;
const ESCROW_PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID)
    : null;
```

All client-side env vars are `REACT_APP_` prefixed (correct for CRA — only these are bundled into the build). Values are public on-chain identifiers (program IDs, mint address) — these are not secrets. No private keys, JWT tokens, or server credentials are present in the client.

The `validateEscrowTransaction()` function (CS-01 pattern) validates instruction discriminators before the user signs, which is a correct security control not a credential management issue.

---

### `client/src/socket/index.js`

**Rating: GOOD**

```javascript
const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001'
```

Server URL defaults to localhost. Telegram `initData` is passed as socket auth, not embedded as a hardcoded token.

---

### `client/.env` (local, gitignored)

**Rating: MEDIUM finding (SC-04)**

File content (not committed to git — confirmed by `client/.gitignore` and `git check-ignore`):
```
REACT_APP_SERVER_URL=http://localhost:5001
REACT_APP_SOLANA_NETWORK=devnet
REACT_APP_ESCROW_PROGRAM_ID=CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD
REACT_APP_SHOT_TOKEN_MINT=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd
INLINE_RUNTIME_CHUNK=false
JWT_SECRET=change-me-to-a-random-64-char-string   ← SERVER-ONLY VAR IN CLIENT FILE
```

**SC-04 (HIGH) — `JWT_SECRET` in client `.env`:**
CRA does NOT bundle env vars that lack the `REACT_APP_` prefix into the build output, so `JWT_SECRET` is not actually exposed to browsers. However:
1. The presence of a server secret (even a placeholder) in a client-side file is an operational mistake that could be copied into a real deployment configuration.
2. If an operator misreads the guidance and intentionally adds `JWT_SECRET` to the client `.env.local` with the real value, CRA still ignores it — but the confusion is a training and process risk.
3. The weak placeholder value `change-me-to-a-random-64-char-string` if somehow used for the real server `JWT_SECRET` would result in an easy-to-guess secret (it's a known placeholder string).

**5-Whys for SC-04:**
- Why is `JWT_SECRET` in `client/.env`? Likely a copy-paste error when the developer merged server and client env vars.
- Why is it not exposed? CRA only bundles `REACT_APP_*` prefixed vars.
- Why is it still a problem? Future operators may not know CRA's prefix rule.
- Why is the placeholder dangerous? The string `change-me-to-a-random-64-char-string` is a well-known default; any attacker who finds this value in use can sign arbitrary JWTs.
- Why is this HIGH not CRITICAL? The file is not committed to git and CRA does not bundle it.

---

### `server/.env.example` (committed to git)

**Rating: MIXED — findings SC-02, SC-10, SC-11**

```
# Auth
JWT_SECRET=change-me-to-a-random-64-char-string
```

**SC-02 (HIGH) — Weak `JWT_SECRET` placeholder in committed example:**
The placeholder `change-me-to-a-random-64-char-string` is committed in the repository. While this is documented as an example to be changed, the string is:
1. A known placeholder that operators may forget to change.
2. Not guarded by a startup assertion in the example itself (though `auth.js` does guard at runtime in production).

The `render.yaml` correctly handles this with `generateValue: true`, but any deployment NOT using `render.yaml` (e.g., Docker, VPS) would use this placeholder if the operator doesn't replace it.

**Better pattern:** `JWT_SECRET=` (empty) with a comment: `# Required. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**5-Whys for SC-02:**
- Why is a weak placeholder there? Convenience for documentation.
- Why is that a problem? Operators copy `.env.example` to `.env` and may forget to change this value.
- Why does a weak JWT_SECRET matter? Anyone who knows the secret can forge tokens for any wallet address.
- Why isn't auth.js enough protection? Auth.js guards production only — staging/testing environments with this placeholder are unprotected.
- Why is this HIGH not CRITICAL? Render deployments use `generateValue: true`, so the production path is safe.

**SC-10 (INFO) — `ADMIN_API_KEY` absent from `.env.example`:**
The `requireAdminKey` middleware reads `process.env.ADMIN_API_KEY` but this variable is not documented in `server/.env.example`. It is in `render.yaml` (as `sync: false`) but a developer setting up locally will not know to set it. Result: `/stats` and `/api/admin/reload-keys` are always 401 in local dev unless the developer discovers the variable independently.

**SC-11 (INFO) — `MATCH_ESCROW_PROGRAM_ID` env var is a dead key:**
`server/.env.example` and `render.yaml` both declare `MATCH_ESCROW_PROGRAM_ID`, but `escrow.js` never reads it (see SC-01). This is documented as a separate CRITICAL finding. The env var creates false configurability.

---

### `render.yaml` (committed to git)

**Rating: GOOD with one MEDIUM finding (SC-06)**

```yaml
envVars:
  - key: JWT_SECRET
    generateValue: true          # ← cryptographically random, correct
  - key: SOLANA_KEYPAIR_JSON
    sync: false                  # ← never stored in render.yaml, correct
  - key: ADMIN_API_KEY
    sync: false                  # ← correct
  - key: MONGODB_URI
    sync: false                  # ← correct
  - key: TREASURY_WALLET
    value: 4Ekd8xxsym6HiGaKbDVP7hgf3AoBsLmBSenyfx3N2hGk   # ← SC-06
  - key: OPS_WALLET
    value: G2TgxypFAQHvcfwRA1dkJMx2St4gYpDpz37uiG1Q9grx    # ← SC-06
```

**SC-06 (MEDIUM) — Treasury/Ops wallet addresses in committed plaintext:**
Treasury and ops wallet addresses are committed in `render.yaml` as plaintext values. These are public Solana addresses (not private keys), so this is not a cryptographic secret leak. However:
1. Public Solana wallet addresses are considered semi-sensitive operational data — they identify real wallets that hold funds.
2. Committing specific wallet addresses to a public repository permanently associates those wallets with the SolShot project, which may not be desired.
3. For mainnet, treasury/ops wallets should likely be moved to `sync: false` to allow address rotation without code commits.

**Note:** This is specifically NOT a private key exposure. The addresses are `base58` public keys. The risk is operational (address rotation requires code commits) rather than cryptographic.

---

## Cross-Cutting Concerns

### Dev vs. Production Secret Handling Divergence

The codebase has a consistent pattern of dev/production divergence for secrets:

| Secret | Dev Mode Behaviour | Production Requirement |
|--------|-------------------|----------------------|
| `SOLANA_KEYPAIR_JSON/PATH` | Warns, disables escrow | Not required (escrow optional) |
| `JWT_SECRET` | Random 32-byte hex | `process.exit(1)` if missing |
| `SHOT_TOKEN_MINT` | Skips on-chain burn verification | Required for prestige burns |
| `TELEGRAM_BOT_TOKEN` | Silently skips validation | Should be set (currently silent) |
| `ADMIN_API_KEY` | All admin endpoints 401 | Required for `/stats`, `/reload-keys` |

The pattern is generally correct: cryptographic secrets fail hard in production, optional features degrade gracefully. The gap is `TELEGRAM_BOT_TOKEN` which silently degrades without operator notice.

### Git History

Confirmed: no `.env` files with actual secrets are tracked in git. `git ls-files | grep .env` returns only:
- `client/.env.example` (safe — no secrets, only placeholders)
- `server/.env.example` (safe — placeholder `JWT_SECRET` only)

The `client/.env` (containing the misplaced `JWT_SECRET` placeholder) is properly ignored by `client/.gitignore`.

### No Hardcoded Private Keys in Source

Full grep of server and client source confirms: no private key byte arrays, no hardcoded JWT secrets with actual token values, no MongoDB credentials with real passwords, no Telegram bot tokens as string literals. The devnet keypair (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) is mentioned in project memory but not found in the clean repo's source files.

---

## Findings Register

### SC-01 — CRITICAL: Anchor Program ID Hardcoded in `escrow.js`

**File:** `server/services/escrow.js:39`
**Evidence:**
```javascript
const PROGRAM_ID = new PublicKey('CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD');
```
**Impact:** Program ID rotation requires code change + redeploy. `MATCH_ESCROW_PROGRAM_ID` env var (set in `render.yaml` and `.env.example`) is dead configuration.
**Fix:**
```javascript
const programIdEnv = process.env.MATCH_ESCROW_PROGRAM_ID;
if (!programIdEnv) {
    throw new Error('[Escrow] MATCH_ESCROW_PROGRAM_ID not configured');
}
const PROGRAM_ID = new PublicKey(programIdEnv);
```

---

### SC-02 — HIGH: Weak `JWT_SECRET` Placeholder in Committed Example

**File:** `server/.env.example` (last line)
**Evidence:** `JWT_SECRET=change-me-to-a-random-64-char-string`
**Impact:** Operators who copy the example without changing this value will use a known, weak secret in staging or non-Render deployments.
**Fix:** Change to `JWT_SECRET=` with a comment instructing generation via `crypto.randomBytes`.

---

### SC-03 — HIGH: `TELEGRAM_BOT_TOKEN` Not Documented in Deployment Config

**File:** `server/middleware/telegram.js`, `render.yaml`, `server/.env.example`
**Evidence:** Grep confirms `TELEGRAM_BOT_TOKEN` is absent from `render.yaml` and `server/.env.example`. `telegram.js` silently disables validation when the token is missing.
**Impact:** Telegram identity verification is silently disabled on Render deployments unless the operator manually adds the env var.
**Fix:** Add to `server/.env.example`:
```
# Telegram Mini App (optional — set to enable Telegram identity verification)
# TELEGRAM_BOT_TOKEN=your_bot_token_here
```
Add to `render.yaml`:
```yaml
  - key: TELEGRAM_BOT_TOKEN
    sync: false
```
Additionally, fix SC-08 (CJS/ESM mismatch) to make the file importable.

---

### SC-04 — HIGH: `JWT_SECRET` in Client `.env` File

**File:** `client/.env`
**Evidence:** File contains `JWT_SECRET=change-me-to-a-random-64-char-string` (server-only variable).
**Impact:** Although CRA does not bundle non-`REACT_APP_*` vars, operators may be confused and may accidentally expose this in other contexts.
**Fix:** Remove `JWT_SECRET` from `client/.env`. It has no effect in a CRA build and should not exist in a client-side file.

---

### SC-05 — MEDIUM: `SOLANA_RPC` Duplicated in Three Services

**Files:** `server/services/escrow.js:42`, `server/services/solana.js:27`, `server/services/shot-token.js:35`
**Evidence:** All three services independently read `process.env.SOLANA_RPC` with identical defaults.
**Impact:** Maintenance hazard. If RPC URL needs different configuration per service (e.g., higher commitment for settlement), three files must be changed.
**Fix:** Centralize `SOLANA_RPC` in `solana.js` and export a shared `getConnection()` that other services import.

---

### SC-06 — MEDIUM: Treasury/Ops Addresses in Committed `render.yaml`

**File:** `render.yaml:29-32`
**Evidence:**
```yaml
  - key: TREASURY_WALLET
    value: 4Ekd8xxsym6HiGaKbDVP7hgf3AoBsLmBSenyfx3N2hGk
  - key: OPS_WALLET
    value: G2TgxypFAQHvcfwRA1dkJMx2St4gYpDpz37uiG1Q9grx
```
**Impact:** Not a private key exposure (public addresses only). However, address rotation requires a code commit. Addresses are permanently on-chain-associated with the project.
**Fix:** Move to `sync: false` for address rotation flexibility. Alternatively, accept as low-risk for public addresses.

---

### SC-07 — MEDIUM: `client/.env.example` Contains Devnet Program IDs

**File:** `client/.env.example`
**Evidence:** `REACT_APP_ESCROW_PROGRAM_ID=CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`
**Impact:** Devnet-specific addresses committed. Mainnet deployment requires updating this file. Operators may forget to change these values.
**Fix:** Add a comment: `# These are devnet addresses. Update for mainnet deployment.` and consider using a variable name convention that distinguishes network.

---

### SC-08 — LOW: `telegram.js` Uses CommonJS `require()` in ESM Server

**File:** `server/middleware/telegram.js:1`
**Evidence:** `const crypto = require('crypto');` in a server with `"type": "module"`.
**Impact:** The file cannot be imported in the ESM server without throwing `ReferenceError: require is not defined`. Currently unused (no imports found), so this is a latent defect.
**Fix:**
```javascript
import crypto from 'crypto';
// ...
export { validateTelegramInitData, telegramSocketMiddleware };
```

---

### SC-09 — LOW: Logger Redact List Incomplete

**File:** `server/services/logger.js`
**Evidence:** `txSignature`, `matchId`, and SOL amounts passed to `console.log` in `main.js` are not redacted.
**Impact:** Transaction signatures and match financial data appear in plaintext in server logs. Low sensitivity (public blockchain data) but potentially undesirable in compliance contexts.
**Fix:** Add `txSignature` to the pino redact list if compliance requires it. Migrate high-value `console.log` calls in `main.js` to use the pino logger.

---

### SC-10 — INFO: `ADMIN_API_KEY` Not in `.env.example`

**File:** `server/.env.example`
**Impact:** Local development documentation gap. Admin endpoints (404 all) until developers discover this variable.
**Fix:** Add `# ADMIN_API_KEY=your_random_key_here` to `server/.env.example`.

---

### SC-11 — INFO: `MATCH_ESCROW_PROGRAM_ID` Env Var Never Read

**Files:** `server/.env.example`, `render.yaml`, `server/services/escrow.js`
**Impact:** Dead configuration. See SC-01 for remediation.

---

### SC-12 — INFO: `LOG_LEVEL` Defaults to `info`; Debug Mode Risk

**File:** `server/services/logger.js:4`
**Evidence:** `level: process.env.LOG_LEVEL || 'info'`
**Impact:** If an operator sets `LOG_LEVEL=debug` in production, additional internal state may be logged. No known debug-level calls currently, but the risk exists for future additions.
**Fix:** Document that `LOG_LEVEL=debug` should never be set in production. Consider asserting `LOG_LEVEL !== 'debug'` in production startup.

---

## Positive Patterns Worth Noting

These patterns are correctly implemented and should be preserved:

1. **`keys.js` single ingestion point** — only module that reads keypair env vars; all others import from `keys.js`.
2. **KM-04 byte zeroing** — `bytes.fill(0)` after keypair construction limits in-memory secret lifetime.
3. **`requireAdminKey` fail-closed** — returns 401 when `ADMIN_API_KEY` is undefined, not when it is empty or wrong.
4. **`auth.js` production hard fail** — `process.exit(1)` on missing `JWT_SECRET` in production.
5. **`render.yaml` `sync: false`** — `SOLANA_KEYPAIR_JSON`, `ADMIN_API_KEY`, `MONGODB_URI` are never stored in Render's blueprint definition.
6. **`render.yaml` `generateValue: true`** — JWT secret is cryptographically generated per deployment.
7. **No private keys in source or git history** — confirmed by full grep and `git ls-files`.
8. **Client `.env` gitignored** — `client/.gitignore` correctly excludes `.env` from tracking.
9. **Pino redaction** — wallet addresses are censored in structured logs at the serializer level.
10. **CS-01 TX validation in `WalletContext.js`** — client validates instruction discriminator before signing escrow deposits.

---

*End of SEC-02 Full Analysis*
