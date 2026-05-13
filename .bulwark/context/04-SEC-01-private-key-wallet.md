---
task_id: db-phase1-sec-01
provides: [sec-01-findings, sec-01-invariants]
focus_area: sec-01
files_analyzed:
  - server/services/keys.js
  - server/services/escrow.js
  - server/services/escrow-v2.js
  - server/services/solana.js
  - server/services/users.js
  - server/services/privyAuth.js
  - server/socket-io/main.js
  - server/scripts/init-config.mjs
  - server/index.js
  - render.yaml
  - client/src/wallet/WalletContext.js
  - client/src/components/DebugAuthOverlay.js
  - server/.env
  - server/.env.example
  - .gitignore
finding_count: 12
severity_breakdown: {critical: 2, high: 5, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# SEC-01: Private Key & Wallet Security — Condensed Summary

## Key Findings (Top 10)

- **KM-04 zero-fill removed due to @solana/web3.js aliasing**: `Keypair.fromSecretKey()` in v1.98.4 aliases the input `Uint8Array` rather than copying it, meaning `_escrowKeypair.secretKey` and the `bytes` buffer share the same backing memory. The fill(0) was removed after it caused signing failures. The raw secret key array remains live in the `bytes` variable until GC collects it — `server/services/keys.js:51-64`

- **Single hot wallet is BOTH upgrade authority AND application authority**: `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` signs `createMatch`, `settleMatch`, `cancelMatch`, `pauseProgram`, `updateConfig`, `initializeConfig` AND is the program upgrade authority for both v1 and v2. Compromise = full protocol takeover — `server/services/escrow.js:282-546`, `server/services/escrow-v2.js:56-88`

- **`SOLANA_KEYPAIR_JSON` env var loaded as raw JSON array — value lives in process.env forever**: When the inline JSON path is used (as on Render), the 64-byte secret key array sits in `process.env.SOLANA_KEYPAIR_JSON` for the life of the process. Any code path that serializes or logs `process.env` exposes the full keypair — `server/services/keys.js:33-49`

- **`server/.env` contains live credentials (MongoDB URI with password, Telegram bot token, program IDs)**: The file is gitignored but present locally. `TELEGRAM_BOT_TOKEN=8048345182:AAFtG0a-o2w_mZ8iw_QnEmyrk-lx3t_ZBXg` and MongoDB URI `mongodb+srv://solshot-server:Soja21245%21%21%21%21%21@...` are cleartext. No evidence of rotation after the file was written — `server/.env:9,32`

- **Privy JWT verification disabled by default in both production paths and dev**: `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are not set in `server/.env` (local dev) and not defined in `render.yaml` (production deploy). Both environments run with `[privyAuth] JWT verification disabled` — `/api/wallet/link-from-tg-token` gate is magic-link-only, not JWT-hardened as documented — `server/services/privyAuth.js:35-44`, `render.yaml:18-44`

- **`ws.wallets` (settlement address map) keyed by `socketId` and migrated on reconnect**: On reconnect, wallet entry moves from `ws.wallets[oldSocketId]` to `ws.wallets[client.id]` if `data.walletAddress` matches the pending reconnect. If an attacker spoofs a wallet address during reconnect (old signature replay), they could redirect settlement funds — `server/socket-io/main.js:1801,1815-1817,1995`

- **Privy wallet rotation issue (DB wallet ≠ on-chain wallet)**: `linkTelegramIdentity` only attaches a wallet to an existing TG-keyed User doc when `existingByTg.walletAddress` is null. If a Privy user's embedded wallet is re-provisioned (e.g. after account recovery, SDK re-init, or wallet recreation), the new address cannot overwrite the existing one — `server/services/users.js:91-109`. The DB retains the old wallet address; the client sends the new one; settlement uses the DB-stale address from `ws.wallets` (set at joinRoom time from `authenticatedWallets[client.id]`, which was populated at authenticate time from the current wallet). The practical risk: if wallet was rotated between account creation and match join, the discrepancy may cause the escrow `deposit_wager` to succeed on-chain (player signs with new wallet) while the server's escrow `settleMatch` targets the old wallet address.

- **`sendTransactionUnified` in WalletContext uses `showWalletUIs` suppression ONLY for `signMessageUnified` (auth) but NOT for transaction signing**: Comment at line 499 says "We keep the modal ON for real-money paths." However, `privySignTransactionFn` is called with `{ transaction, wallet, chain }` but no explicit `uiOptions` — the Privy SDK's default behaviour for `useSignTransaction` varies by SDK version. If Privy suppresses the UI by default for this hook, real-money escrow deposits could sign silently — `client/src/wallet/WalletContext.js:512-526`

- **`DebugAuthOverlay` exposes full wallet address, auth state, and socket details when `?debug=1` or `localStorage.solshotDebug=1`**: Any attacker who can inject `?debug=1` into a link sent to a victim user (social engineering, QR code) or set `localStorage.solshotDebug=1` via XSS will see the authenticated wallet address and auth token state in the overlay — `client/src/components/DebugAuthOverlay.js:22-131`

- **`local .env` TELEGRAM_BOT_TOKEN is live devnet**: Token `8048345182:AAFtG0a-o2w_mZ8iw_QnEmyrk-lx3t_ZBXg` hardcoded in a file that is gitignored but not rotated. If the local machine is compromised or the file is accidentally shared, bot can be taken over — `server/.env:32`

## Critical Mechanisms

- **Server keypair load flow**: `initKeys()` reads `SOLANA_KEYPAIR_JSON` (env var, inline JSON array) or `SOLANA_KEYPAIR_PATH` (file path, tilde-expanded). Constructs `Keypair.fromSecretKey(bytes)`. Does NOT zero the input buffer (KM-04 was reverted after @solana/web3.js aliasing discovery). Returns `true` if loaded. Singleton `_escrowKeypair` shared across all callers via `getEscrowKeypair()` — `server/services/keys.js:32-93`

- **Sign-flow map**:
  - `createMatch` — server signs, keypair = `getEscrowKeypair()` — `escrow.js:282-317`
  - `settleMatch` — server signs — `escrow.js:388-427`
  - `cancelMatch` — server signs — `escrow.js:439-475`
  - `pauseProgram / unpauseProgram / updateConfig / initializeConfig` — server signs — `escrow.js:205-246`
  - `depositWager` — CLIENT signs (serialized TX built by server, signed via Privy) — `WalletContext.js:564-596`
  - `signAndBurnShot` — CLIENT signs directly via Privy — `WalletContext.js:638-660`
  - `authenticate` — CLIENT signs message via Privy `signMessage` (suppressUI=true) — `WalletContext.js:530-562`

- **Privy key custody**: Embedded Solana wallet key never leaves Privy's iframe-isolated signing environment. `privySignTransactionFn` and `privySignMessageFn` are RPC calls into Privy's SDK iFrame. `exportWallet` exposes private key to USER (not to JS) through Privy's iframe modal. No private key material flows into the React component tree or browser storage.

- **`ws.wallets` settlement address map**: Populated at `joinRoom` time from `authenticatedWallets[client.id]`, which is set at `authenticate` event time (`main.js:1248`). On reconnect, the entry migrates by socketId match. Settlement reads from `ws.wallets[socketId]` directly. There is NO re-verification that the wallet in `ws.wallets` still matches the reconnecting client's current `authenticatedWallets` entry.

## Invariants & Assumptions

- INVARIANT: The server keypair private key is accessible only through `getEscrowKeypair()` — no other module reads `SOLANA_KEYPAIR_JSON/PATH` directly — enforced at `server/services/keys.js:1-93` (single point of ingestion, all escrow callers import from keys.js)

- INVARIANT: Escrow deposit transactions are validated before signing: discriminator checked against `DEPOSIT_WAGER_DISCRIMINATOR`, program ID against `ALLOWED_ESCROW_PROGRAM_IDS`, no unexpected instructions permitted — enforced at `client/src/wallet/WalletContext.js:79-110`

- INVARIANT: Privy embedded wallet private key material never reaches client JS heap — enforced by Privy SDK architecture (iframe isolation) — NOT independently verifiable from source code alone; depends on Privy SDK trust

- ASSUMPTION: `@solana/web3.js` `Keypair.fromSecretKey()` does NOT copy the input array (it aliases it) — confirmed empirically per code comment at `keys.js:54-64`. The `_escrowKeypair.secretKey` Uint8Array is the same buffer as `bytes`. Any code that retains a reference to `bytes` retains the secret key. CURRENTLY SAFE: `bytes` is a local variable that goes out of scope, but the aliased buffer is now pinned by the Keypair object itself until GC.

- ASSUMPTION: `SOLANA_KEYPAIR_JSON` env var is never logged by the Node.js process or Express error handlers. UNVALIDATED — need to verify no `process.env` dump in error handlers.

- ASSUMPTION: The wallet address in `ws.wallets[socketId]` at settlement time matches the wallet address that signed the escrow deposit on-chain. PARTIALLY VALIDATED — set from `authenticatedWallets` at join-room time; migrated on reconnect by socketId; no re-check against on-chain escrow deposit mask.

- ASSUMPTION: Privy JWT verification is active in production. UNVALIDATED — `PRIVY_APP_SECRET` is absent from `render.yaml`; enforcement is off on the deployed server.

## Risk Observations (Prioritized)

1. **Single hot wallet = upgrade authority + application authority**: `server/services/keys.js:67` logs the pubkey; `escrow.js:86-89` logs it again. If `SOLANA_KEYPAIR_JSON` is compromised on Render (e.g., via env var exposure in logs, Render dashboard access), attacker can: (a) drain all escrow PDAs by calling settle with attacker-controlled winner, (b) deploy malicious bytecode via program upgrade, (c) modify GlobalConfig to redirect treasury/ops. This is intentional pre-mainnet posture but the operational risk is severe if the secret escapes `render.yaml`'s secret store.

2. **Privy JWT gate is off in production**: `render.yaml` has no `PRIVY_APP_ID`/`PRIVY_APP_SECRET` entries. The `/api/wallet/link-from-tg-token` endpoint relies solely on the 32-byte CSPRNG magic-link token. An attacker who intercepts a magic-link DM can bind any wallet to the victim's TG identity without a valid Privy JWT — `server/services/privyAuth.js:35-44`

3. **`SOLANA_KEYPAIR_JSON` in process.env — env var dump risk**: `render.yaml:37` sets `SOLANA_KEYPAIR_JSON` as a secret. Express error handlers, uncaughtException handlers, and third-party monitoring agents can serialize `process.env`. The 64-byte key is a flat JSON number array, trivially readable if logged — `server/index.js:614-617` (uncaughtException handler logs `err` but not env; verify third-party SDKs don't).

4. **Wallet rotation / DB staleness**: `linkTelegramIdentity` will NOT update `walletAddress` on an existing TG-keyed doc that already has one (`server/services/users.js:91`). If Privy re-provisions a user's embedded wallet (possible after account recovery), the DB stores the old address. Settlement at `main.js:775` uses `ws.wallets[socketId]` which was set from `authenticatedWallets` at join-room time from the current (new) wallet. The on-chain escrow creates a PDA that lists the new wallet as a player; the deposit is signed by the new wallet. Settlement should work correctly from on-chain perspective — but DB stats, match records, and any DB-based wallet lookup will target the stale address.

5. **`ws.wallets` reconnect migration without re-authentication**: `main.js:1801` sets `authenticatedWallets[client.id] = data.walletAddress` from the `rejoinRoom` event payload. `main.js:1815-1817` migrates `ws.wallets`. The `rejoinRoom` handler calls `handleAuthenticate(client, data)` to verify the signature, which is correct. However, if two sockets race to claim the same wallet (same wallet, two reconnect attempts), both could pass signature verify and the second migration could corrupt `ws.wallets` — `server/socket-io/main.js:1801-1817`

6. **`TELEGRAM_BOT_TOKEN` in local `.env` is live/real**: `server/.env:32` contains a real Telegram bot token. It is gitignored but not rotated. Risk: developer machine compromise, accidental paste, or `.env` leaking through a backup system.

7. **`initKeys()` KM-04 regression**: The buffer zeroing was reverted. `bytes` goes out of scope after `initKeys()` returns, but since `Keypair.fromSecretKey` aliases it, the secretKey buffer is now permanently alive as `_escrowKeypair.secretKey`. This is normal Solana keypair behaviour — the key must stay in memory to sign. The concern is if any code inadvertently serializes the Keypair object (e.g., `JSON.stringify(escrowKeypair)`) — `server/services/keys.js:51-64`

8. **No documented keypair rotation procedure**: Project memory notes the program-keypair was regenerated at some point (old deploy orphaned). There is a `reload-keys` endpoint and SIGHUP handler, but no runbook for: (a) detecting compromise, (b) rotating `SOLANA_KEYPAIR_JSON` on Render, (c) updating the GlobalConfig authority, (d) verifying settlement resumes correctly. The reload mechanism exists but the operational procedure to USE it safely is undocumented.

## Novel Attack Surface

- **Race on wallet-address migrate during reconnect window**: The 30-second reconnect window allows a client to claim a `pendingReconnect` entry by wallet address. If an attacker knows the victim's wallet address (it's visible on-chain after any deposit) and can connect to the socket server within the window, they can attempt `rejoinRoom` with the victim's wallet address. They'd need a valid signature (Privy controls the key), but the authentication check at `main.js:1801` only verifies the message signature. The attacker can't forge the Privy signature — but this path deserves careful logging.

- **`DEPOSIT_WAGER_DISCRIMINATOR` hardcoded client-side**: The discriminator `[234, 73, 235, 136, 168, 103, 239, 207]` at `WalletContext.js:72` is derived from `SHA-256("global:deposit_wager")[0:8]`. If a new Anchor program is deployed with a different instruction name but same logic, the validation would reject legitimate deposits. Conversely, any Anchor program that happens to expose a `deposit_wager` instruction would pass validation — the check verifies intent, not that the recipient is specifically the SolShot escrow.

## Cross-Focus Handoffs

- → **CHAIN-01 (Transaction Construction)**: The TX validation in `validateEscrowTransaction()` checks discriminator and program ID but does not validate the escrow PDA address, wager amount, or player address in the instruction accounts. A malicious server could build a valid-looking TX that deposits to a wrong PDA — cross-reference with CHAIN-01 analysis of `buildDepositTransaction`.

- → **AUTH-01 (Authentication)**: `authenticate` event uses `showWalletUIs: false` (suppresses Privy confirmation modal). The auth message format `"SolShot Auth: {wallet} at {timestamp}"` should be reviewed for replay window (5-min currently) and whether nonce is server-generated or client-supplied.

- → **SEC-02 (Secret Management)**: `server/.env` contains MongoDB URI with password, Telegram bot token, and wallet addresses in cleartext. The MongoDB URI is a live credential — cross-reference with SEC-02 analysis of all secrets in env files.

- → **LOGIC-02 (Financial Logic)**: `ws.wallets` is the sole source of truth for settlement addresses. Any manipulation of this in-memory map between match start and settlement end could redirect funds. Cross-reference with ERR-02 race condition analysis.

## Trust Boundaries

The server keypair (`_escrowKeypair`) is the only credential with direct financial authority — it is the sole signer for all escrow program instructions that move funds. It is loaded from environment (env var or file), held in a Node.js module singleton, and used synchronously in Anchor program calls. Its trust boundary is the Node.js process itself; any code running in the same process has potential access. The Privy embedded wallet trust boundary is Privy's infrastructure — private keys never reach SolShot's code, only signed transaction bytes. The wallet-address trust boundary is the `authenticate` event: once verified by signature, the address is stored in `authenticatedWallets[socketId]` and propagated to `ws.wallets` at join time. The DB trust boundary for wallet identity is weaker — `linkTelegramIdentity` can only set a wallet once per TG-keyed document; it cannot update or rotate it. Settlement uses the in-memory `ws.wallets` map (from socket-time auth), not the DB record, which is a design choice that prevents DB staleness from affecting in-flight matches but means DB and on-chain reality can diverge permanently.
<!-- CONDENSED_SUMMARY_END -->

---

# SEC-01: Private Key & Wallet Security — Full Analysis

## Executive Summary

The SolShot off-chain stack manages two distinct key types: a server-controlled Solana keypair (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) that acts as escrow authority for both the v1 and v2 programs, and user-controlled Privy embedded wallets whose private key material never leaves Privy's iframe-isolated signing environment. The server keypair architecture has a clean single-ingestion point (`keys.js`) and a live key-reload mechanism, but carries significant systemic risk because the same key is both the program upgrade authority AND the application authority — compromise gives full protocol control. The Privy integration is well-implemented for the client signing path, but the server-side JWT verification layer is not deployed in production. A potential wallet rotation issue (DB wallet diverging from on-chain wallet after Privy re-provisioning) exists by design but has subtle settlement implications.

## Scope

Off-chain only. Covers: server keypair loading and usage, escrow transaction signing, client Privy adapter, wallet-to-settlement address mapping, program keypair status in the repo, auth event handling, Privy JWT verification state, and key rotation procedures.

## Key Mechanisms

### 1. Server Keypair Load and Management (`server/services/keys.js`)

`initKeys()` supports two load paths, priority-ordered:
1. `SOLANA_KEYPAIR_JSON` — env var containing a JSON number array `[b0,b1,...,b63]`. Used on Render (production) via `render.yaml:37` as a `sync: false` secret.
2. `SOLANA_KEYPAIR_PATH` — file path, tilde-expanded using `process.env.HOME || process.env.USERPROFILE`. Used locally (dev).

**KM-04 regression**: The code comment at `keys.js:54-64` documents that `bytes.fill(0)` was previously run as a post-construction zeroing step. This was removed after empirically discovering that `@solana/web3.js` v1.98.4 `Keypair.fromSecretKey()` aliases (does not copy) the input `Uint8Array`. Zeroing `bytes` also zeroed `_escrowKeypair.secretKey` — every signing operation thereafter produced invalid signatures (surfacing as "Signature verification failed" on create/settle/cancel calls). The workaround is correct: do not zero the buffer because the Keypair depends on it. The implication is that `_escrowKeypair.secretKey` and `bytes` share the same backing `ArrayBuffer` for the lifetime of the `Keypair` object. Since `bytes` is a local variable, it goes out of scope after `initKeys()` returns — but the `ArrayBuffer` itself is kept alive by the `Keypair` object's reference.

**Key reachability**: The only way to access the secret key after init is through `getEscrowKeypair()`, which returns the full `Keypair` object. `_escrowKeypair.secretKey` is a 64-byte Uint8Array (seed + public key concatenated per ed25519 convention). Any code that receives the `Keypair` object can access `.secretKey`.

**Reload mechanism**: A `SIGHUP` handler at `server/index.js:601-611` calls `initKeys()`, then `initEscrow()` and `initEscrowV2()`. A protected HTTP endpoint `/api/admin/reload-keys` (guarded by `requireAdminKey`) triggers the same flow. On Linux/Render it sends `SIGHUPP to self; on Windows it calls directly. This is a competent hot-reload design.

**Failure mode**: If neither env var is set, `initKeys()` returns `false` and logs a warning. `isEscrowEnabled()` returns `false`. All escrow functions return `{ success: false, error: 'Escrow not initialized' }`. The server continues in "practice mode only." This is a graceful fail-closed design for escrow operations.

### 2. Server Keypair Usage in Escrow Services

`escrow.js` and `escrow-v2.js` both call `getEscrowKeypair()` and wrap it in `new Wallet(escrowKeypair)` for the `AnchorProvider`. The keypair signs:

| Instruction | File | Trigger |
|---|---|---|
| `initializeConfig` | escrow.js:144-166 | One-shot after deploy (init-config.mjs) |
| `updateConfig` | escrow.js:177-197 | Admin rotation |
| `pauseProgram` | escrow.js:205-221 | Emergency |
| `unpauseProgram` | escrow.js:229-245 | Recovery |
| `createMatch` | escrow.js:282-317 | joinRoom (wagered) |
| `settleMatch` | escrow.js:388-427 | Match end |
| `cancelMatch` | escrow.js:439-475 | Disconnect/cancel |
| `permissionlessReclaim` | escrow.js:487-516 | Anyone (authority = provider.wallet) |
| `startWithDepositors` | escrow.js:527-546 | Deposit timeout |
| All v2 equivalents | escrow-v2.js | Group chat matches |

**All authority instructions use the same keypair.** There is no separation between operational authority (create/settle/cancel) and administrative authority (pause/updateConfig/initializeConfig) or upgrade authority (program bytecode replacement). Per project memory, `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is also the Solana program upgrade authority (set at deploy time via `solana deploy`).

### 3. Client Privy Wallet Integration (`client/src/wallet/WalletContext.js`)

The Privy integration is a well-structured Privy-only wallet adapter. Key security properties:

**Signing architecture**: `sendTransactionUnified` (line 512-526) calls `privySignTransactionFn({ transaction: Uint8Array, wallet, chain })`, which dispatches to Privy's iframe signing context. The signed transaction bytes (`signResult.signedTransaction` as Uint8Array) come back and are broadcast via `conn.sendRawTransaction()`. The private key never enters the React component's closure or the main JS heap.

**TX validation before signing**: `validateEscrowTransaction(tx)` at lines 79-110 runs before every call to `sendTransactionUnified` for escrow deposits. It checks:
- At least one instruction exists
- Every instruction is either (a) in `ALLOWED_ESCROW_PROGRAM_IDS` with the correct 8-byte `deposit_wager` discriminator, or (b) a `ComputeBudget` instruction
- No other program IDs are permitted

This is a meaningful defense against a malicious server building a TX with extra instructions (e.g., transferring SOL from the player to an attacker-controlled address).

**`showWalletUIs` for auth vs transactions**: The `signMessageUnified` path (used for `authenticate` event) explicitly passes `{ uiOptions: { showWalletUIs: false } }` (line 501-503). The comment explains this is intentional — auth fires once per page load and a confirmation modal is friction. The `sendTransactionUnified` path for real-money transactions does NOT pass `showWalletUIs` — the comment at line 497-499 says "We keep the modal ON for real-money paths." However, the SDK call at line 515-518 does not explicitly set `showWalletUIs: true`. Whether Privy shows the confirmation UI depends on the SDK's default for `useSignTransaction`. This needs empirical verification against the installed Privy SDK version.

**`exportWallet` availability**: Lines 163-167 and 789-805 show that `privyExportSolanaWalletFn` is wired up as `openPrivyAccount`. This calls Privy's iframe-based private key reveal. The private key is shown ONLY inside Privy's sandboxed iframe to the authenticated user — it does not flow into JavaScript. This is by design. The risk is user-facing: Privy's export functionality means users can extract their private key if they choose, which also means a social engineering attack ("paste your private key here to recover your account") could target users who have exported it.

**`window.solWallet` status**: Per project memory, `signAndSendEscrowDeposit` was previously exposed on `window.solWallet` for Phaser access. Grep of current `WalletContext.js` finds NO assignment to `window.solWallet`. Grep of current `BattleScreen.js` and `LobbyScreen.js` shows comments `// CS-04: Use context hook instead of window.solWallet`. The global has been removed as of the current codebase — the prior finding (H032 from Feb audit) is resolved.

### 4. Settlement Address Flow

The path from wallet address to settlement is:

1. `authenticate` event → `handleAuthenticate()` → on success → `authenticatedWallets[client.id] = result.walletAddress` (`main.js:1248`)
2. `joinRoom` event → `const joinerWallet = authenticatedWallets[client.id] || null` (`main.js:1946`) → `ws.wallets[client.id] = joinerWallet` (`main.js:1995`)
3. On reconnect: `rejoinRoom` → re-authenticate → `authenticatedWallets[client.id] = data.walletAddress` → `ws.wallets[client.id] = ws.wallets[oldSocketId]` (migrates wallet entry; `main.js:1815-1817`). NOTE: The migration copies the OLD wallet entry — not the newly authenticated wallet address. If the wallet address changed between the original join and the reconnect, the old address remains in `ws.wallets`.
4. Settlement: `ws.wallets[winnerSocketId]` used directly as `winnerAddress` for `settleMatch(winnerAddress, loserAddress, wager, matchId)` (`main.js:775`).

This means the on-chain settlement targets the wallet address from the original `joinRoom` time. If a player's Privy embedded wallet was re-provisioned between `authenticate` and the reconnect, the settlement targets the old address — which may not have deposited and may not be listed in the escrow PDA's `players[]` array. This would cause `settleMatch` to fail on-chain with an account constraint error.

### 5. Privy Wallet Rotation Issue Analysis

From project memory: "Privy wallet rotation issue surfaced today (DB wallet ≠ on-chain wallet on some accounts) — open investigation."

Analysis of `server/services/users.js:63-109`:
- `linkTelegramIdentity` searches by `telegramUserId` first
- If a doc exists with that TG ID AND `walletAddress` is already set, it will NOT overwrite it (`if (walletAddress && !existingByTg.walletAddress)` — only enters the attach block if wallet is null)
- If Privy re-provisions a user's embedded wallet (new address), the client will `authenticate` with the new address → `authenticatedWallets[socketId] = newAddress` — correct for in-memory match state
- But `linkTelegramIdentity` called from the link endpoint will find the existing TG-keyed doc, skip the wallet update, and the DB retains the old address

**Root cause of the divergence**: The `walletAddress` field in the User schema is `unique: true, sparse: true` (enforced by MongoDB). The design intent is "one wallet per user, immutable after first set." Privy can silently re-provision wallets in certain recovery flows, breaking this assumption. The off-chain code has no pathway to update an existing wallet address.

**Settlement impact**: In-flight matches use `ws.wallets` (from `authenticatedWallets` at join-time, which uses the CURRENT authenticated wallet). The DB may have the old address, but settlement targets the in-memory address — so financial settlement is likely correct. The DB divergence causes stat attribution errors and potential issues with the Telegram identity lookup path used in bot commands.

### 6. Program Keypair Repo Status

The `.gitignore` has:
```
target/
*-keypair.json
solshot-dev.json
solshot-server.json
```

The `target/` glob covers `programs/solshot-escrow/target/deploy/solshot_escrow-keypair.json`. The `*-keypair.json` glob also covers it. Git `ls-files` for `*keypair*` returns empty — no keypair files are tracked. The `programs/solshot-escrow/target/` directory itself does not exist on disk (confirmed: ls returns "No such file"). The keypair is generated at build time and lives only on the deploy machine's disk or in Render's secret store.

**Critical operational note from project memory**: The program keypair at `target/deploy/solshot_escrow-keypair.json` was "regenerated at some point between the Feb 18 deploy and the May 04 redeploy." This orphaned the original program at `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`. The new keypair's public key became `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`. The keypair that controls upgrades to the live v1 program is on the developer's local machine only — there is no backup procedure documented, and losing it means the program can never be upgraded (frozen) or would require an `--allow-missing-signers` workaround.

### 7. Privy JWT Verification Production Status

`server/services/privyAuth.js` initializes `PrivyClient` only if both `PRIVY_APP_ID` AND `PRIVY_APP_SECRET` are set. The local `server/.env` has neither. `render.yaml` also has neither. The `[privyAuth] JWT verification disabled` warning fires on every server start. Both bind endpoints (`/api/wallet/link-from-tg-token` with `required: false` and `/api/wallet/link-from-privy-telegram` with `required: true`) operate in degraded mode:

- `link-from-tg-token`: magic-link token alone authorizes the bind (the JWT is the defense-in-depth layer that's missing)
- `link-from-privy-telegram`: `requirePrivyAuth({ required: true })` passes through when `client` is null (`getClient()` returns null, `!client` → `return next()` at `privyAuth.js:66-68`). The `required: true` option only rejects when Privy IS configured and the token fails verification — if Privy is not configured, required=true is silently bypassed.

This means `link-from-privy-telegram` — which is supposed to be the more strongly-authenticated path — is actually ungated in production. Any caller with a valid Privy JWT structure (or none at all, since client is null) plus a valid `telegramUserId` and `walletAddress` can bind any Telegram user to any wallet.

### 8. Key Logs and Information Disclosure

Reviewing all log calls in key-handling code:
- `keys.js:67`: `[Keys] Escrow authority: ${_escrowKeypair.publicKey.toBase58()}` — public key only, safe
- `keys.js:70`: `[Keys] Failed to load keypair: ${err.message}` — error message only, no key material
- `escrow.js:86`: `[Escrow] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}` — safe
- `escrow.js:89`: logs `TREASURY_WALLET` and `OPS_WALLET` values — public addresses, safe

No log call writes `secretKey`, `privateKey`, `SOLANA_KEYPAIR_JSON`, or `bytes`. The risk is indirect: if any error handler dumps `process.env` (e.g., a third-party APM SDK configured with `captureEnv: true`), the `SOLANA_KEYPAIR_JSON` key is exposed. The `uncaughtException` handler at `server/index.js:614-617` logs `err` (the error object) — not `process.env`. This appears safe as written, but cannot be guaranteed against future middleware additions or third-party SDK instrumentation.

### 9. Local .env File

`server/.env` is gitignored (confirmed via `git check-ignore`). It contains:
- MongoDB URI with embedded password: `Soja21245!!!!!`
- Telegram bot token: `8048345182:AAFtG0a-o2w_mZ8iw_QnEmyrk-lx3t_ZBXg`
- `SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json` (file path, not inline)
- `JWT_SECRET=change-me-to-a-random-64-char-string` — DEFAULT VALUE NOT ROTATED
- Program ID: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` — the OBSOLETE Feb 18 program, not the live May 4 one

The `.env.example` has the correct live program ID `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`. The local `.env` has the old ID — which means local dev uses the dead/uncontrolled program. This is functionally harmless for dev (escrow fails gracefully) but is a stale config that could confuse future developers.

**JWT_SECRET**: The local value `change-me-to-a-random-64-char-string` is the literal placeholder from the example. `render.yaml:36` sets `generateValue: true` — Render auto-generates this secret, so production is fine. Dev is using the literal default — any developer who runs the server locally with this default JWT secret can accept any JWT signed with that known secret.

### 10. render.yaml Keypair Injection Analysis

```yaml
- key: SOLANA_KEYPAIR_JSON
  sync: false
```

`sync: false` means the value is NOT in the `render.yaml` file itself — it must be entered manually in the Render dashboard. This is correct for a secret. The env var name `SOLANA_KEYPAIR_JSON` is referenced in the comment at `render.yaml:6`. The `keys.js` parser will consume it at server start.

**Missing from render.yaml**: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PRIVY_APP_ID` for the server. These may be set manually in Render's dashboard outside the YAML — but since they're not in the blueprint, they may also simply not be set.

## Trust Model

```
User Browser (UNTRUSTED)
  └── Privy SDK iframe (TRUSTED: Privy infrastructure)
       └── signTransaction → signed TX bytes → broadcast to devnet
  └── WalletContext.js (UNTRUSTED: runs in browser)
       └── validateEscrowTransaction() — partial defense
       └── socket.emit('escrowDepositConfirm') — unverified by server until on-chain check

Server Process (PARTIALLY TRUSTED)
  └── _escrowKeypair (TRUSTED: loaded from env/file, single point)
       └── Anchor Provider → all authority instructions
  └── authenticatedWallets Map (PARTIALLY TRUSTED: set from sig-verified auth)
  └── ws.wallets Map (PARTIALLY TRUSTED: set at join-time from authenticatedWallets)
       └── used directly as settlement address — no re-verification

Solana Devnet (TRUSTED: on-chain logic verified by BOK/SOS audits)
MongoDB Atlas (TRUSTED: schema-enforced, but wallet address immutable-once-set)
Privy Infrastructure (TRUSTED: key custody, JWT issuance)
```

## State Analysis

- `_escrowKeypair` — Node.js module singleton. Set once at init, overwritten on reload. Accessible to all imports via `getEscrowKeypair()`. Lives for server process lifetime.
- `authenticatedWallets` — in-memory `Map<socketId, walletAddress>`. Set on successful `authenticate` event. Cleared on disconnect. Source of truth for wallet→socket mapping during a session.
- `ws.wallets` (wagerStates) — in-memory per-room map. Set at `joinRoom`. Migrated on reconnect. Source of truth for settlement addresses during a match.
- `process.env.SOLANA_KEYPAIR_JSON` — if set, lives in the process environment table for the entire server lifetime. Cannot be unset from Node.js (assigning `undefined` does not remove it from `process.env` in all Node versions).

## Dependencies

- `@solana/web3.js` v1.98.4 — `Keypair.fromSecretKey()` aliases input buffer (critical behaviour documented in keys.js)
- `@coral-xyz/anchor` v0.32.1 — `BN` imported from `bn.js` directly (not from anchor, breaking change)
- `@privy-io/react-auth` v3.23.1 (client) — embedded wallet signing, `useSignTransaction`, iframe-based key management
- `@privy-io/server-auth` (server) — JWT verification; currently not initialized due to missing env vars

## Focus-Specific Analysis

### Keypair Inventory

| Keypair | Location | Who Can Read | What It Signs | Backup |
|---------|----------|--------------|---------------|--------|
| Server authority (`HPyVPj2V...`) | Render env (`SOLANA_KEYPAIR_JSON` secret) / local `~/.config/solana/solshot-dev.json` | Render admins / local user | all escrow authority instructions for v1 + v2 | None documented |
| Program upgrade authority | Same as server authority (same key) | Same | BPF program bytecode upgrade on v1 + v2 | None documented |
| User Privy embedded wallets | Privy key management infra (HSM-backed, iframe isolated) | User only (via Privy export modal) | deposit_wager, signAndBurnShot, authenticate | Privy recovery (email/TG backup) |
| Treasury wallet (`4Ekd8xxs...`) | Hardcoded in render.yaml | Public (in render.yaml committed to git) | Receives 7% settlement split | N/A (recipient only) |
| Ops wallet (`G2Tgxypf...`) | Hardcoded in render.yaml | Public (in render.yaml committed to git) | Receives 3% settlement split | N/A (recipient only) |

### Sign-Flow Map

```
Escrow Deposit (client):
  Client signs (Privy iframe)
  └── deposit_wager IX built by server (buildDepositTransaction)
  └── validateEscrowTransaction() on client before sign
  └── broadcast via WalletContext connection
  └── client emits escrowDepositConfirm to server

SHOT Burn (client):
  Client signs (Privy iframe)
  └── SPL createBurnInstruction built in WalletContext
  └── NO validateEscrowTransaction — direct SPL IX (safe: burn is benign by definition)
  └── broadcast via WalletContext connection
  └── client calls PrestigeScreen.confirmBurn → server verifyBurnTransaction

Match Auth (client):
  Client signs message (Privy, showWalletUIs=false)
  └── "SolShot Auth: {wallet} at {timestamp}"
  └── server verifies at handleAuthenticate()
  └── no nonce — replay window = 5 min

Server Authority (all escrow TXs):
  Server keypair via Anchor Provider
  └── createMatch, settleMatch, cancelMatch, pause, updateConfig, initializeConfig, startWithDepositors
  └── Same key = program upgrade authority
```

## Cross-Focus Intersections

- **AUTH-01**: Auth signature has no server-generated nonce — 5-minute replay window is a known issue (C-6/H030 from Feb audit). The `ws.wallets` migration on reconnect depends on the auth flow being sound.
- **CHAIN-01**: `buildDepositTransaction` in `escrow.js` constructs the TX; the client validates it with `validateEscrowTransaction`. The validation is instruction-level only — no validation of the escrow PDA address against the expected room's match ID.
- **ERR-02**: `ws.wallets` is mutated at join time and reconnect time. Concurrent reconnect attempts could create a race condition where wallet mapping is corrupted.
- **DATA-04**: `process.env.SOLANA_KEYPAIR_JSON` in logs is the most sensitive potential leak. Current code doesn't log it, but dependency chain (APM, error reporting SDKs) needs audit.

## Cross-Reference Handoffs

- → **AUTH-01**: Verify nonce handling in `handleAuthenticate`. Is the timestamp client-supplied or server-enforced? If client-supplied, replay window is effectively unbounded within system clock tolerance.
- → **CHAIN-01**: Verify `buildDepositTransaction` — does it include the correct `escrowPDA` for the match ID? Can server serve a TX for a different match's PDA and the client validation miss it (PDA is not in `ALLOWED_ESCROW_PROGRAM_IDS` check)?
- → **SEC-02**: `render.yaml` is committed to the repo with public addresses and program IDs. Verify no secrets are in it. `server/.env` with live credentials (TG token, MongoDB password) is gitignored but should be rotated. Verify `PRIVY_APP_SECRET` is set in Render dashboard.
- → **ERR-02**: Two-player concurrent reconnect race on `ws.wallets`. Document whether JS single-threaded event loop prevents this or if async paths create a window.

## Risk Observations

1. [CRITICAL] Single keypair = upgrade authority + app authority. Documented as intentional but the off-chain exposure (Render env secret, local file) makes this a single point of total protocol compromise.
2. [CRITICAL] `requirePrivyAuth({ required: true })` silently passes when Privy is not configured. `/api/wallet/link-from-privy-telegram` is ungated in production — any caller can bind any Telegram user to any wallet address.
3. [HIGH] `SOLANA_KEYPAIR_JSON` in `process.env` lives for process lifetime and cannot be zeroed. Third-party env-dumping SDKs would expose the raw keypair bytes.
4. [HIGH] Privy wallet rotation creates a permanent DB divergence (DB has old wallet, on-chain uses new wallet). Settlement uses in-memory address (new, correct), but DB stats, bot commands, and leaderboard targeting the old address.
5. [HIGH] `ws.wallets` reconnect migration copies the OLD wallet entry — if wallet changed between join and reconnect, in-memory settlement address is stale from first join.
6. [HIGH] No documented keypair rotation procedure. The program keypair was previously orphaned (Feb→May deploy gap); same could happen again and is undetectable until a signing failure.
7. [HIGH] `server/.env` JWT_SECRET is the literal placeholder `change-me-to-a-random-64-char-string`. Anyone who runs the local dev server can accept any JWT signed with this known secret. Production uses `generateValue: true` (Render), so Render is safe.
8. [MEDIUM] `sendTransactionUnified` for real-money TXs does not explicitly pass `showWalletUIs: true`. Privy SDK default behaviour for `useSignTransaction` determines whether the user sees a confirmation modal for escrow deposits.
9. [MEDIUM] `DebugAuthOverlay` activated by `?debug=1` URL param (injectable via social engineering link) exposes wallet address and auth state.
10. [MEDIUM] Local `.env` contains obsolete program ID `CqvRC6...` instead of live `4kzrDp...`. Confuses local dev but escrow disabled gracefully.
11. [LOW] `server/.env` `TELEGRAM_BOT_TOKEN` is a live real token in a gitignored file. Not rotated.
12. [LOW] No backup of program upgrade keypair. Losing it means programs are frozen at current bytecode. For devnet this is acceptable but undocumented.

## Novel Attack Surface Observations

1. **`link-from-privy-telegram` ungated**: Because `requirePrivyAuth({ required: true })` passes through when the Privy client is not initialized, and Privy is not initialized in production (missing env vars), this endpoint accepts ANY call with a valid `telegramUserId` and `walletAddress`. An attacker who knows a target's Telegram user ID and has any wallet address can bind that wallet to the victim's Telegram identity. This would redirect any future group-match settlement to the attacker's wallet for matches where the victim's TG ID is used to look up the settlement address.

2. **Privy `useSignTransaction` UI suppression ambiguity**: The comment explicitly says escrow deposits keep the modal ON — but the actual SDK call passes no `uiOptions`. If a Privy SDK update changes the default from "show UI" to "suppress UI," real-money deposits would sign silently (invisible to user). This is a soft dependency on SDK version behaviour.

3. **`DEPOSIT_WAGER_DISCRIMINATOR` whitelist applies to v1 AND v2 programs**: The `ALLOWED_ESCROW_PROGRAM_IDS` includes both. A single `validateEscrowTransaction()` check covers both programs. This is correct as designed, but if the v2 program ever exposes a `deposit_wager` instruction for a fraudulent match ID, the client-side validation cannot distinguish it from a legitimate deposit (it validates program ID + discriminator, not the PDA address).

## Questions for Other Focus Areas

- AUTH-01: What is the exact replay window for the `authenticate` signature? Is timestamp validated server-side or only for format?
- ERR-02: Is there any mutex or guard preventing two concurrent `escrowDepositConfirm` handlers for the same room from both passing the "not yet active" check?
- CHAIN-01: In `buildDepositTransaction`, is the `escrowPDA` always derived from the match's actual `matchId`, and is there any path where the server could build a TX for a different room's PDA?
- SEC-02: Is `PRIVY_APP_SECRET` actually set in Render's dashboard (outside render.yaml)? Is `TELEGRAM_WEBHOOK_SECRET` set?

## Raw Notes

- `keys.js` comment block (lines 1-12) mentions "KM-03" and "KM-04" which appear to be internal audit/task IDs from a previous security review cycle. These suggest the key management was explicitly reviewed previously.
- `escrow.js:59-60` comment: "Reset module state — supports re-initialization after SIGHUP key reload (04-02)" — internal reference suggesting prior work on this.
- `render.yaml` `autoDeploy: true` — any merge to `main` triggers a Render redeploy. If `main` is `LIVE demo` and `launch` is full build (per project memory), then an accidental merge to `main` deploys to production with Render's current env vars.
- The `bytes.fill(0)` issue at `keys.js:54-64` is actually a documented known limitation of `@solana/web3.js`. This is a widely-reported issue in the Solana dev community — the library was designed for browser use where GC handles cleanup, not for server-side long-running processes where the secret key persists in a Keypair object indefinitely. The practical implication is that `_escrowKeypair.secretKey` is accessible for the process lifetime, which is normal and expected but worth noting for a hardened production deployment (HSM/KMS would eliminate this).
- `server/services/privyAuth.js:21` contains the actual `PRIVY_APP_ID` value in a comment: `PRIVY_APP_ID = cmorbf1nk00z10cidg6jitsgm`. This is the Privy application ID — it's a public identifier (same as `REACT_APP_PRIVY_APP_ID` sent to all clients), not a secret. The `PRIVY_APP_SECRET` is the sensitive value and is not in any committed file.
