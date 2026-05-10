# SolShot Deployment Runbook

Operational reference for deploying and managing the SolShot stack: Anchor escrow programs (v1 + v2), Express/Socket.IO server, and React/Phaser client. Step-by-step commands for engineering use during launch and post-launch operations.

---

## Table of Contents

1. [Devnet - Current State](#1-devnet--current-state)
2. [Sample Settled Matches](#2-sample-settled-matches)
3. [Prerequisites](#3-prerequisites)
4. [Deploy Procedure (Devnet)](#4-deploy-procedure--devnet)
5. [Server Deployment](#5-server-deployment)
6. [Client Deployment](#6-client-deployment)
7. [Pre-Mainnet Checklist](#7-pre-mainnet-checklist)
8. [Mainnet Deploy Procedure](#8-mainnet-deploy-procedure)
9. [Post-Mainnet Monitoring](#9-post-mainnet-monitoring)
10. [Rollback Procedure](#10-rollback-procedure)
11. [Key Rotation](#11-key-rotation)
12. [Emergency Procedures](#12-emergency-procedures)
13. [Post-Deploy Verification](#13-post-deploy-verification)
14. [Appendices](#14-appendices)

---

## 1. Devnet - Current State

**As of 2026-05-07 - post SOS + DB Audit #2 fix bundle (commit `7296e95`)**

### Program IDs

| Program | Address | Status |
|---------|---------|--------|
| **v1 Escrow** | `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` | Deployed on devnet. Fix bundle landed in source at `7296e95`. |
| **v2 Escrow** | `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` | Deployed on devnet. Fix bundle landed in source at `7296e95`. |
| ~~Old v1 (obsolete)~~ | ~~`CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`~~ | OBSOLETE. Feb 18 deploy, pre-N-player rewrite. Keypair lost. ~1.77 SOL rent recoverable via `solana program close` if keypair can be recovered. Do not reference. |

> **IMPORTANT - verify `.so` files are in sync with source:**
> The fix bundle in commit `7296e95` patched both `programs/solshot-escrow/src/lib.rs` (v1) and `programs/solshot-escrow-v2/src/lib.rs` (v2). Verify the deployed `.so` files on devnet match this source by running `anchor build` and checking the build hash, then running `anchor upgrade` against both program IDs if the deployed bytecode predates the fix bundle.
>
> ```bash
> # Verify v1
> solana program show 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 --url devnet
>
> # Verify v2
> solana program show BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N --url devnet
>
> # Upgrade if needed (run after anchor build)
> anchor upgrade target/deploy/solshot_escrow.so \
>   --program-id 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 \
>   --provider.cluster devnet
>
> anchor upgrade target/deploy/solshot_escrow_v2.so \
>   --program-id BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
>   --provider.cluster devnet
> ```

### PDAs and Tokens

| Item | Address | Notes |
|------|---------|-------|
| **GlobalConfig PDA** | `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4` | Seeds: `[b"config"]`. Initialized 2026-05-04. Authority = server hot wallet. |
| **SHOT Token Mint** | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` | 10M supply, 9 decimals. Mint authority BURNED - no more can be minted. |
| **Server hot wallet** | `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` | `solshot-dev.json`. Used as escrow authority, create_match signer, settle_match signer. |

### Infrastructure

| Component | Platform | Notes |
|-----------|----------|-------|
| **Server** | Render (Web Service) | Auto-deploys from `main` branch. Paid tier. |
| **Client** | Vercel | Auto-deploys from `main` branch. Root: `client/`. |
| **Database** | MongoDB Atlas | URI in `MONGODB_URI` env var on Render. |

### Settlement Economics (verified on-chain)

90/7/3 BPS split on the total pot (wager × num_deposited):

| Recipient | BPS | Example (0.1 SOL × 2 players = 0.2 SOL pot) |
|-----------|-----|----------------------------------------------|
| Winner | 9000 | 0.18 SOL |
| Treasury | 700 | 0.014 SOL |
| Ops | 300 | 0.006 SOL |

Winner amount is the remainder (`total - treasury - ops`) to prevent dust loss from integer division. BPS math uses u128 widening (BOK GAP-002 verified).

---

## 2. Sample Settled Matches

### First 1v1 Wagered Match - 2026-05-04

- Match ID: `2f5b6180`
- Settlement TX: [`4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf`](https://solscan.io/tx/4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf?cluster=devnet)
- Result: Winner +0.18 SOL, Treasury +0.014 SOL, Ops +0.006 SOL - all on-chain

### First 3-Player Group-Chat Auto-Settle - 2026-05-06

- Settlement TX: [`4ja8VKp...`](https://solscan.io/tx/4ja8VKp?cluster=devnet)
- Notes: N-player v2 path. Auto-settle triggered by server on game end.

---

## 3. Prerequisites

### Toolchain

| Tool | Required Version | Install |
|------|-----------------|---------|
| Solana CLI | stable (Anza) | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor CLI | 0.32.1 | Pinned in `Anchor.toml` `[toolchain]` section |
| Rust | stable | `rustup default stable` |
| Node.js | >= 18.0.0 | Pinned in `server/package.json` `engines` field |
| npm | bundled with Node | - |

### Keypair Inventory

Three distinct keypairs required. The on-chain program enforces that authority, treasury, and ops are different pubkeys.

| Keypair | Purpose | Generation |
|---------|---------|------------|
| **Authority (server)** | Signs `create_match`, `settle_match`, `cancel_match`, `pause_program`, `update_config` | `solana-keygen new -o ~/.config/solana/solshot-dev.json` |
| **Treasury** | Receives 7% of each settlement pot | `solana-keygen new -o ~/.config/solana/solshot-treasury.json` |
| **Ops** | Receives 3% of each settlement pot | `solana-keygen new -o ~/.config/solana/solshot-ops.json` |

### RPC Endpoints

| Network | Endpoint | Notes |
|---------|----------|-------|
| Devnet | `https://api.devnet.solana.com` | Public, rate-limited. Fine for dev/testing. |
| Mainnet | Helius or QuickNode dedicated endpoint | Public mainnet RPC is unreliable under load. Budget for a paid plan. |

### Pre-Flight (all deployments)

- [ ] Solana CLI configured to correct cluster: `solana config set --url <cluster_url>`
- [ ] Deployer wallet has >= 3 SOL for program rent + fees
- [ ] All three keypairs generated and public keys recorded
- [ ] `Anchor.toml` `[provider].cluster` set to target cluster
- [ ] `Anchor.toml` `[provider].wallet` points to deployer keypair

---

## 4. Deploy Procedure - Devnet

### 4.1 Build

```bash
anchor build
```

Produces:
- `target/deploy/solshot_escrow.so` - v1 BPF binary
- `target/deploy/solshot_escrow_v2.so` - v2 BPF binary
- `target/idl/solshot_escrow.json` - v1 IDL (copy to `server/idl/`)
- `target/idl/solshot_escrow_v2.json` - v2 IDL (copy to `server/idl/` if used by server)
- `target/types/` - TypeScript types

### 4.2 Verify Program IDs

After build, confirm the keypair-derived program IDs match `declare_id!()` in source:

```bash
# v1
solana address -k target/deploy/solshot_escrow-keypair.json
# Must match 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1

# v2
solana address -k target/deploy/solshot_escrow_v2-keypair.json
# Must match BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N
```

**If IDs do not match:** Update `declare_id!()` in `lib.rs`, `Anchor.toml`, `server/.env`, `server/services/escrow.js`, and `client/.env`, then rebuild. See Appendix A for full location list.

> **Keypair gotcha:** `target/deploy/*-keypair.json` may be regenerated if deleted or if you run `anchor keys list` carelessly. Before any deploy, ALWAYS confirm the keypair-derived pubkey matches the deployed program ID. Mismatches deploy a fresh program at a new ID with no on-chain history.

### 4.3 Configure for Devnet

Verify `Anchor.toml`:

```toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/solshot-dev.json"
```

### 4.4 Fund the Deployer

```bash
solana airdrop 5 --url devnet
solana balance --url devnet
# Need ~2-3 SOL per program. Airdrop multiple times if needed (devnet caps vary).
```

### 4.5 Deploy or Upgrade

**Fresh deploy (new program ID):**
```bash
anchor deploy --provider.cluster devnet
```

**Upgrade existing deployed program (existing program ID):**
```bash
anchor upgrade target/deploy/solshot_escrow.so \
  --program-id 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 \
  --provider.cluster devnet

anchor upgrade target/deploy/solshot_escrow_v2.so \
  --program-id BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
  --provider.cluster devnet
```

Use `anchor upgrade` (not `anchor deploy`) when you already have a deployed program and want to preserve the program ID. The deployer wallet must currently hold the upgrade authority.

### 4.6 Initialize GlobalConfig (first deploy only)

The GlobalConfig PDA must be initialized exactly once after each fresh program deploy. Skip this step if upgrading an existing deployment with a live config.

Verify config state first:
```bash
# If this returns data, config is already initialized - do not re-init
solana account 92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4 --url devnet --output json
```

If fresh:
```bash
node server/scripts/init-config.mjs
```

The script is at `server/scripts/init-config.mjs`. Edit the AUTHORITY / TREASURY / OPS pubkey constants before running. All three must be distinct.

What it sets:

| Field | Value |
|-------|-------|
| `authority` | Server hot wallet pubkey |
| `treasury` | Treasury wallet pubkey |
| `ops` | Ops wallet pubkey |
| `is_paused` | `false` |

Config can only be initialized once. Subsequent changes use `update_config`.

### 4.7 Sync IDL to Server

```bash
cp target/idl/solshot_escrow.json server/idl/solshot_escrow.json
```

The server loads this IDL at startup to construct the Anchor `Program` object. Stale IDL = runtime errors on instruction calls.

### 4.8 Run Tests

```bash
anchor test --provider.cluster devnet
```

Tests are in `tests/**/*.ts`, configured via `Anchor.toml` scripts section.

### 4.9 Deploy Verification

- [ ] `solana program show <PROGRAM_ID> --url devnet` - program deployed, authority correct
- [ ] IDL copied to `server/idl/solshot_escrow.json`
- [ ] Program ID matches in all 5 locations (Appendix A)
- [ ] `getConfigState()` returns correct authority, treasury, ops, `isPaused: false`

---

## 5. Server Deployment

### 5.1 Environment Variables

Copy `server/.env.example` to `server/.env`:

| Variable | Example | Required |
|----------|---------|----------|
| `PORT` | `5001` | Yes |
| `NODE_ENV` | `production` | Yes |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/solshot` | Yes |
| `SOLANA_RPC` | `https://api.devnet.solana.com` | Yes |
| `SOLANA_KEYPAIR_PATH` | `~/.config/solana/solshot-dev.json` | One of PATH or JSON required |
| `SOLANA_KEYPAIR_JSON` | `[1,2,...,64]` | For cloud deploy - raw JSON array |
| `MATCH_ESCROW_PROGRAM_ID` | `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` | Yes |
| `TREASURY_WALLET` | `<treasury-pubkey>` | Yes |
| `OPS_WALLET` | `<ops-pubkey>` | Yes |
| `JWT_SECRET` | 64+ random characters | Yes |
| `ADMIN_API_KEY` | Random string | Yes in production |
| `CORS_ORIGINS` | `https://solshot.gg,https://www.solshot.gg` | Yes in production |
| `SHOT_TOKEN_MINT` | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` | For SHOT token features |
| `PRIVY_APP_ID` | `<privy-app-id>` | For Privy auth |
| `PRIVY_APP_SECRET` | `<privy-app-secret>` | For Privy auth |

**Key loading priority:** `SOLANA_KEYPAIR_JSON` takes precedence over `SOLANA_KEYPAIR_PATH`. For Render, use `SOLANA_KEYPAIR_JSON` with the raw JSON array. `keys.js` zeros the byte array after constructing the Keypair object.

### 5.2 Startup Sequence

The server boots in this order (`server/index.js`):
1. `dotenv.config()` - loads `.env`
2. `initKeys()` - loads server keypair
3. Express middleware: helmet, CORS, rate limiter
4. Socket.IO initialization
5. MongoDB connection
6. `initShotState()` - loads SHOT emission state from DB
7. `server.listen()` on `0.0.0.0:PORT`
8. SIGHUP handler registered for credential hot-reload

### 5.3 Cloud Deployment (Render)

1. Create Web Service on Render, connect GitHub repo
2. Build command: `cd server && npm install`
3. Start command: `cd server && npm start`
4. Set all env vars from section 5.1 in Render dashboard
5. Use paid tier ($7/mo minimum) - free tier spins down after 15min, killing WebSocket connections
6. `trust proxy = 1` is set in `index.js` - required for correct IP extraction behind Render's reverse proxy

### 5.4 Verification

- [ ] `GET /health` returns 200
- [ ] `GET /stats` with `x-admin-key` header returns metrics
- [ ] Logs: `[Keys] Escrow authority: <pubkey>`
- [ ] Logs: `[Escrow] Initialized` with correct program ID, config PDA, treasury, ops
- [ ] Logs: `MongoDB connected`
- [ ] WebSocket connections work (test from browser)

---

## 6. Client Deployment

### 6.1 Environment Variables

Copy `client/.env.example` to `client/.env`:

| Variable | Example | Required |
|----------|---------|----------|
| `REACT_APP_SERVER_URL` | `https://solshot-server.onrender.com` | Yes |
| `REACT_APP_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | Yes |
| `REACT_APP_ESCROW_PROGRAM_ID` | `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` | Yes |
| `REACT_APP_SHOT_TOKEN_MINT` | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` | For SHOT features |
| `REACT_APP_SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` | Recommended for mainnet |
| `INLINE_RUNTIME_CHUNK` | `false` | Yes (CSP compliance) |
| `GENERATE_SOURCEMAP` | `false` | Yes in production |

### 6.2 Build and Deploy (Vercel)

1. Create Vercel project, set root directory to `client/`
2. Set env vars in Vercel dashboard
3. Deploy - Vercel auto-detects Create React App
4. Update `CORS_ORIGINS` on server to include the Vercel domain

### 6.3 Verification

- [ ] Site loads at deployed URL
- [ ] Browser console shows Socket.IO connected
- [ ] Wallet connect button works (Phantom / Solflare via Privy)
- [ ] Network matches expected cluster

---

## 7. Pre-Mainnet Checklist

Work through these bundles in order before any mainnet deploy. Each bundle should be a separate PR with a `DB:verify` / `SOS:verify` pass.

### 7.1 Verify Fix Bundle Is Live On-Chain

The source at `7296e95` has 9 SOS fixes + 16 DB fixes. Verify the deployed `.so` files reflect this:

- [ ] `anchor build` produces a `.so` hash that matches the post-`7296e95` build
- [ ] `anchor upgrade` run against both program IDs on devnet if `.so` was not redeployed after the fix commit
- [ ] IDL at `server/idl/` matches `target/idl/` output from the verified build

### 7.2 Bundle 1 - Authority Hardening (SOS H001/H044/H046 + DB H012)

**Rationale:** Current architecture uses a single hot wallet for both Layer-1 (upgrade authority) and Layer-2 (application authority). A single key compromise grants full control. This must be resolved before mainnet.

Steps:
1. Set up a Squads M-of-N multisig for program upgrade authority
2. Transfer upgrade authority: `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG_ADDRESS>`
3. Generate a separate hot wallet for application authority (config.authority)
4. Call `update_config` to rotate authority to the new application wallet
5. Add `propose_authority` + `accept_authority` instructions to both programs (closes SOS H001 - one-step transfer)
6. Add `last_config_update_ts` + 24h timelock on `update_config` for treasury/ops/fee_bps changes (closes SOS H002/H032)
7. Add `propose_recovery` guardian mechanism for key-loss recovery (closes SOS H042)

**Verify:** Confirm upgrade authority is the multisig via `solana program show <ID> --url mainnet-beta`.

> Warning on step 2: The multisig address transfer is irreversible. Verify the multisig address three times. If the multisig cannot be recovered, the program can never be upgraded.

### 7.3 Bundle 2 - Refund Loop Refactor (SOS H024 + DB H014)

**Rationale:** The current on-chain refund loop iterates `0..max_players` requiring contiguous bit mask. Non-contiguous masks (player 1 deposited, player 0 did not) leave funds UNRECOVERABLE on-chain. Also, server-side `remaining_accounts` construction must read the live on-chain mask rather than in-memory state.

Steps:
1. Refactor on-chain refund loop to accept `player_indices: Vec<u8>` + matching `remaining_accounts`
2. Update IDL for both programs
3. Update `server/services/escrow.js` (v1) to call `getEscrowState(matchId)` before building `remaining_accounts`, use on-chain `deposits_mask`
4. Update `server/services/escrow-v2.js` (v2) same
5. Test the non-contiguous mask scenario on devnet (force a partial-deposit scenario)
6. Verify the mask scenario is now recoverable

### 7.4 Bundle 3 - Off-Chain Hardening (DB H009/H010/H014/H015/H016 + SOS H049)

Steps:
1. Bump `match_id` entropy: `crypto.randomBytes(8)` → 16 hex chars (closes SOS H049 + DB H060)
2. Add Mongoose `unique: true` constraint on `matchId` field
3. Refactor `confirmDeposit` to use `findOneAndUpdate` with `$set` + `$elemMatch` guard (closes DB H016 - double-overwrite race)
4. Convert group-chat settle to atomic `findOneAndUpdate({state:'active'},{state:'settled'})` (closes DB H015 - double-settle race)
5. Add `updateWalletForTgUser()` helper with audit trail for wallet rotation (closes DB H009/H010)
6. Add `consumed_signatures` Set with TTL eviction for auth signature replay protection (closes DB H004)
7. Add server-side win-rate anomaly monitor + failedSettlements logging

### 7.5 Bundle 4 - Client / Header Hardening (DB H034/H030/H047)

Steps:
1. Add `client/vercel.json` with `frame-ancestors`, `X-Frame-Options`, HSTS, Permissions-Policy headers (closes DB H034)
2. Strip wallet pubkeys from `escrowDepositStatus` broadcast - emit only `{playerIndex, confirmed}` boolean (closes DB H030)
3. Move magic-link token from URL query param to URL fragment `#linkToken=...` (closes DB H047)
4. Remove `unsafe-inline` from client `script-src` CSP or add nonce-based policy (closes DB H036)

### 7.6 Devnet Load Test

Before mainnet:
- [ ] Simulate 10-player v2 match reaching `permissionless_reclaim` - measure CU consumption (SOS G001)
- [ ] If near 1.4M CU ceiling, refactor reclaim or split into two TXs
- [ ] Simulate 50+ concurrent rooms and verify no birthday collision on 16-char match IDs (after Bundle 3 bump)
- [ ] Simulate server crash during settlement - verify crash recovery settles correctly
- [ ] Run `npm audit` on both `server/` and `client/` - address H041/H042/H043/H044/H045 (express-rate-limit, socket.io-parser, path-to-regexp, handlebars, bigint-buffer)

### 7.7 Staging End-to-End Verification

- [ ] Deploy fix-bundle source to staging server + staging Vercel
- [ ] Full match lifecycle on devnet: create room → deposit wagered → play → settle
- [ ] Prestige burn flow (SHOT token burn + on-chain verify)
- [ ] 3-player group-chat match (v2 path)
- [ ] Permissionless reclaim (wait 2h after timeout, verify any fee-payer can reclaim)
- [ ] Emergency pause → verify deposits + creates are blocked
- [ ] Emergency unpause → verify flow resumes

---

## 8. Mainnet Deploy Procedure

Do not rush this. Work through section 7 completely first.

### 8.1 Pre-Flight

- [ ] All pre-mainnet bundles (section 7) merged, audited, verified on devnet
- [ ] Mainnet RPC endpoint provisioned (Helius / QuickNode - budget for paid plan)
- [ ] Mainnet SOL funded in deployer wallet (need ~3 SOL per program for rent)
- [ ] Fresh authority keypair generated (do NOT reuse devnet hot wallet)
- [ ] Squads multisig created and signers confirmed
- [ ] Treasury and ops mainnet wallets created and funded
- [ ] Program code is identical to what was audited - `anchor build` with no post-audit modifications
- [ ] `anchor build` produces clean output (no warnings that affect behavior)

### 8.2 Configure for Mainnet

```toml
# Anchor.toml
[programs.mainnet]
solshot_escrow = "<MAINNET_PROGRAM_ID>"
solshot_escrow_v2 = "<MAINNET_V2_PROGRAM_ID>"

[provider]
cluster = "mainnet"
wallet = "~/.config/solana/solshot-mainnet.json"
```

### 8.3 Build

```bash
# Clean build from post-audit source
anchor build

# Verify program IDs match declare_id! in both programs
solana address -k target/deploy/solshot_escrow-keypair.json
solana address -k target/deploy/solshot_escrow_v2-keypair.json
```

### 8.4 Deploy

```bash
anchor deploy --provider.cluster mainnet
```

Expected output: `Program Id: <new-mainnet-program-id>` for each program.

### 8.5 Initialize GlobalConfig (Mainnet)

Same procedure as section 4.6, but with mainnet addresses:

```bash
node server/scripts/init-config.mjs
# Edit AUTHORITY / TREASURY / OPS to mainnet pubkeys before running
```

### 8.6 Transfer Upgrade Authority to Multisig

```bash
solana program set-upgrade-authority <PROGRAM_ID_V1> \
  --new-upgrade-authority <SQUADS_MULTISIG_ADDRESS>

solana program set-upgrade-authority <PROGRAM_ID_V2> \
  --new-upgrade-authority <SQUADS_MULTISIG_ADDRESS>
```

Verify:
```bash
solana program show <PROGRAM_ID> --url mainnet-beta
# "Upgrade Authority" field must show the multisig address, not the deployer wallet
```

### 8.7 Update All References

Update the program IDs in all 5 locations (Appendix A) for mainnet. Also update:
- `server/.env`: `SOLANA_RPC` to mainnet RPC, all wallet pubkeys to mainnet versions, `NODE_ENV=production`
- `client/.env`: `REACT_APP_SOLANA_NETWORK=mainnet-beta`, program IDs, RPC endpoint

### 8.8 Deploy Server and Client

1. Push to `main` - Render auto-deploys server
2. Vercel auto-deploys client on push to `main`
3. Verify all env vars are set in Render + Vercel dashboards

### 8.9 Mainnet Post-Deploy Verification

- [ ] `solana program show <PROGRAM_ID> --url mainnet-beta` - correct authority (multisig)
- [ ] Config PDA initialized with correct mainnet addresses
- [ ] `isPaused === false`
- [ ] End-to-end test match on mainnet with minimum wager (0.1 SOL minimum recommended)
- [ ] Settlement split verified: 90% winner, 7% treasury, 3% ops
- [ ] Treasury and ops wallets received correct amounts
- [ ] `GET /health` returns 200 on production server
- [ ] Client loads at `solshot.gg` and connects to server
- [ ] Wallet connect works (Phantom / Solflare via Privy on mainnet-beta)

### 8.10 Rollback Plan

See section 10 for full rollback procedure. Have it open before you start.

---

## 9. Post-Mainnet Monitoring

### 9.1 Key Metrics to Watch

| Signal | Where | Alert threshold |
|--------|-------|-----------------|
| `failedSettlements` | Server logs + `/stats` endpoint | Any non-zero value |
| `escrowDepositTimeout` | Server logs | Spike above baseline |
| RPC latency | Server logs `[Solana]` prefixed lines | > 5s average |
| `npm audit` critical CVEs | CI / manual run | Any critical |
| Pause state | `getConfigState().isPaused` | Should always be `false` unless emergency |
| Treasury + ops balance | On-chain accounts | Verify match deposits vs received amounts weekly |
| Authority account balance | Server hot wallet | Keep above 0.1 SOL for TX fees |

### 9.2 Settlement Health

Watch for `MatchSettled` events on-chain. A `SettlementFailed` log (server-side) means the settlement TX was not confirmed. The server retry logic (`settling` state in MongoDB) will resubmit, but you should investigate if failures persist.

On-chain events emitted by the programs:
- `MatchCreated` - match escrow initialized
- `WagerDeposited` - player deposited
- `MatchSettled` - settlement complete (includes winner, amounts)
- `MatchCancelled` - match cancelled
- `ConfigUpdated` - authority/treasury/ops rotated
- `Paused` / `Unpaused` - pause state changed (added in fix bundle)

Use Helius webhooks or a Geyser plugin to stream these events to a monitoring service.

### 9.3 Dependency Hygiene

Run monthly (or before any production change):
```bash
cd server && npm audit
cd client && npm audit
```

Priority packages from DB Audit #2:
- `socket.io-parser` (H042) - DOS advisory
- `path-to-regexp` (H043) - ReDoS advisory
- `express-rate-limit` - already bumped to 8.5.1 in fix bundle

### 9.4 RPC Health

If `REACT_APP_SOLANA_RPC` or server `SOLANA_RPC` returns 429 or times out consistently:
- Switch to backup RPC endpoint (DB H049 - add fallback RPC to server config)
- Check Helius / QuickNode dashboard for rate limit usage
- Exponential backoff wrapper (DB H050) should absorb transient spikes

### 9.5 Bot and Scheduler

- Monitor Telegram bot for `429 Too Many Requests` (DB H056 - bot lacks queue/backoff, deferred to Bundle C)
- Monitor `lobbyWatchdog` scheduler for reentrance (DB H078 - deferred). If duplicate runs observed in logs, add `if (running) return` guard immediately.

---

## 10. Rollback Procedure

### 10.1 Scope Assessment

First determine what broke:

| Scenario | Rollback target |
|----------|----------------|
| Server bug (logic, not on-chain) | Revert server commit, redeploy |
| Client bug (UI, not on-chain) | Revert client commit, redeploy |
| On-chain program bug (critical) | Pause program + upgrade program |
| Settlement math bug | Pause immediately, manually settle affected matches, upgrade |
| Key compromise | Pause + rotate authority (section 11) |

### 10.2 Server Rollback

```bash
# Identify last good commit
git log --oneline server/

# Revert to last known good server state
git revert <bad-commit> --no-edit
git push origin main
# Render auto-deploys from main
```

Or via Render dashboard: "Manual Deploy" → select a previous deploy.

### 10.3 Client Rollback

Via Vercel dashboard: Deployments → select previous deployment → "Promote to Production".

Or:
```bash
git revert <bad-commit> --no-edit
git push origin main
# Vercel auto-deploys
```

### 10.4 On-Chain Program Rollback

If a critical bug is found in the deployed program:

**Step 1: Pause immediately**
```javascript
import { pauseProgram } from './server/services/escrow.js';
await pauseProgram();
```

This blocks `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. Permissionless reclaim remains unblocked as the player-safety backstop.

**Step 2: Assess active matches**

Check MongoDB for all matches in non-terminal state (`lobby`, `weapon_shop`, `battle`, `settling`). Decide per-match: cancel (refund players) or attempt manual settlement.

**Step 3: Upgrade the program**

Fix the bug in source, rebuild, then upgrade via the multisig (post-mainnet) or direct authority (devnet):

```bash
anchor build

# Devnet (direct upgrade authority)
anchor upgrade target/deploy/solshot_escrow.so \
  --program-id <PROGRAM_ID> \
  --provider.cluster devnet

# Mainnet (via Squads multisig - requires M-of-N signatures)
# Use Squads UI or squads-multisig-cli to propose and approve the upgrade TX
```

**Step 4: Unpause**
```javascript
import { unpauseProgram } from './server/services/escrow.js';
await unpauseProgram();
```

**Step 5: Verify**

Run the post-deploy verification checklist (section 13) before announcing resume of service.

### 10.5 Fund Safety During Rollback

Three independent layers ensure players never lose SOL during an outage or rollback:

| Layer | Mechanism | Timeout |
|-------|-----------|---------|
| 1. Server recovery | Server restarts, settles based on last MongoDB state | Immediate on restart |
| 2. Player cancel | Either player calls `cancel_match` on-chain | After 1h from activation (v1 TIMEOUT_SECONDS = 3600 post-fix) |
| 3. Permissionless reclaim | Any fee payer calls `permissionless_reclaim` | After 2h (v1 PERMISSIONLESS_RECLAIM_TIMEOUT = 7200 post-fix) |

Permissionless reclaim has NO pause guard - it remains available even when the program is paused. This is the absolute backstop.

---

## 11. Key Rotation

Authority keys can be rotated without disrupting active matches. The on-chain program reads authority from GlobalConfig PDA at execution time.

### 11.1 When to Rotate

- Suspected key compromise
- Scheduled rotation (define cadence post-mainnet)
- Squads multisig signer departure

### 11.2 Rotate Application Authority

**Step 1: Generate new keypair**
```bash
solana-keygen new -o ~/.config/solana/solshot-authority-new.json
solana address -k ~/.config/solana/solshot-authority-new.json
```

**Step 2: Update on-chain config**

After Bundle 1 is implemented (propose/accept authority), use the two-step flow. Until then (devnet only):
```javascript
import { updateConfig } from './server/services/escrow.js';
await updateConfig('<NEW_AUTHORITY_PUBKEY>', null, null);
```

**Step 3: Update server credentials**

Option A - SIGHUP hot-reload:
```bash
# Update SOLANA_KEYPAIR_JSON in Render dashboard, then:
curl -X POST https://your-server/api/admin/reload-keys \
  -H "x-admin-key: <YOUR_ADMIN_API_KEY>"
```

Option B - Restart:
Update env var, redeploy.

**Step 4: Verify**
```javascript
import { getConfigState } from './server/services/escrow.js';
const config = await getConfigState();
// config.authority must match new keypair pubkey
```

### 11.3 What Happens to Active Matches

Nothing breaks. Settlement validates authority against GlobalConfig at execution time via `has_one = authority`. After rotation:
- Old authority can no longer settle or create
- New authority can settle all existing active matches
- Players can cancel after timeout regardless of authority changes
- Permissionless reclaim is unaffected

### 11.4 Rotate Treasury or Ops

```javascript
// Rotate treasury only
await updateConfig(null, '<NEW_TREASURY_PUBKEY>', null);

// Rotate ops only
await updateConfig(null, null, '<NEW_OPS_PUBKEY>');
```

After changing, update `TREASURY_WALLET` / `OPS_WALLET` in server env and reload.

---

## 12. Emergency Procedures

### 12.1 Pause the Program

Halts `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. Does NOT halt `permissionless_reclaim`.

```javascript
import { pauseProgram } from './server/services/escrow.js';
const result = await pauseProgram();
console.log('Pause TX:', result.txSignature);
// Idempotent - safe to call when already paused
```

### 12.2 Unpause the Program

```javascript
import { unpauseProgram } from './server/services/escrow.js';
const result = await unpauseProgram();
console.log('Unpause TX:', result.txSignature);
// Idempotent - safe to call when already unpaused
```

### 12.3 Halt the Server

1. Pause the on-chain program first (12.1) - prevents settlement or deposit even if server restarts
2. Stop the server process (Render: scale to 0 or manual deploy stop)
3. All connected clients receive Socket.IO disconnect events

### 12.4 Crash Recovery

On server restart, check MongoDB for matches in `settling` state:
1. Server checks if settlement TX already confirmed on-chain
2. If confirmed: update MongoDB to `complete`
3. If not confirmed: resubmit settlement TX

### 12.5 Incident Checklist

- [ ] **Immediate:** Pause on-chain program (`pauseProgram()`)
- [ ] **Immediate:** Halt server if compromise is server-side
- [ ] **Assess:** Check on-chain config state - is authority still correct?
- [ ] **Assess:** Check for unauthorized settlements via on-chain `MatchSettled` events
- [ ] **Rotate:** If key compromise suspected, rotate authority (section 11.2)
- [ ] **Communicate:** Notify players via Telegram bot / community channel
- [ ] **Resume:** Unpause program, restart server, run section 13 verification
- [ ] **Post-mortem:** Document and update procedures

---

## 13. Post-Deploy Verification

Run after every deployment (devnet or mainnet).

### 13.1 On-Chain Verification

- [ ] `solana program show <PROGRAM_ID> --url <cluster>` - program deployed, authority correct
- [ ] `getConfigState()` returns correct authority, treasury, ops
- [ ] `isPaused === false`
- [ ] Create a test match escrow
- [ ] Both test players deposit
- [ ] Settle test match - verify 90/7/3 split
- [ ] Verify escrow PDA is closed after settlement (rent returned to authority)

### 13.2 Server Verification

- [ ] `GET /health` returns 200
- [ ] `GET /stats` with admin key returns metrics
- [ ] Logs: `[Keys] Escrow authority: <expected_pubkey>`
- [ ] Logs: `[Escrow] Initialized`
- [ ] Logs: `MongoDB connected`
- [ ] WebSocket connections work

### 13.3 Client Verification

- [ ] Site loads, Socket.IO connects
- [ ] Wallet adapter detects Phantom / Solflare (via Privy)
- [ ] Balance displays correctly
- [ ] Full match lifecycle: create room → join → fund → play → settle

### 13.4 Settlement Math Verification

For 0.1 SOL wager each, 2 players:

| Recipient | BPS | Lamports | SOL |
|-----------|-----|----------|-----|
| Winner | 9000 | 180,000,000 | 0.18 |
| Treasury | 700 | 14,000,000 | 0.014 |
| Ops | 300 | 6,000,000 | 0.006 |
| **Total** | **10000** | **200,000,000** | **0.2** |

### 13.5 Wager Bounds Verification

| Bound | Value | Enforced by |
|-------|-------|-------------|
| Minimum wager | 10,000 lamports (0.00001 SOL) | `MIN_WAGER_LAMPORTS` in `lib.rs` |
| Maximum wager | 100,000,000,000 lamports (100 SOL) | `MAX_WAGER_LAMPORTS` in `lib.rs` |
| Settlement deadline | 3,600s after activation | `SETTLEMENT_TIMEOUT_SECONDS` |
| Cancel timeout (v1 post-fix) | 3,600s | `TIMEOUT_SECONDS` (bumped from 600 per SOS H035) |
| Permissionless reclaim (v1 post-fix) | 7,200s | `PERMISSIONLESS_RECLAIM_TIMEOUT` (= TIMEOUT_SECONDS * 2) |

---

## 14. Appendices

### Appendix A - Program ID Locations

When the program ID changes (fresh deploy), update all of these:

| File | Field |
|------|-------|
| `programs/solshot-escrow/src/lib.rs` | `declare_id!("...")` |
| `programs/solshot-escrow-v2/src/lib.rs` | `declare_id!("...")` |
| `Anchor.toml` | `[programs.devnet]` and `[programs.localnet]` (both programs) |
| `server/.env` | `MATCH_ESCROW_PROGRAM_ID` |
| `server/services/escrow.js` | `PROGRAM_ID` constant |
| `client/.env` | `REACT_APP_ESCROW_PROGRAM_ID` |

### Appendix B - PDA Derivations

| PDA | Seeds | Notes |
|-----|-------|-------|
| GlobalConfig | `[b"config"]` | Singleton. Initialized once per program deploy. |
| MatchEscrow (v1) | `[b"match", match_id.as_bytes()]` | One per match. 232 bytes. `match_id` max 32 chars. |
| MatchEscrow (v2) | `[b"match", match_id.as_bytes()]` | Same seed pattern. |

### Appendix C - On-Chain Instructions Quick Reference

| Instruction | Signer | Pause-gated | Notes |
|-------------|--------|-------------|-------|
| `initialize_config` | Payer (deployer) | No | One-time after deploy |
| `update_config` | Authority | No | Rotate authority/treasury/ops |
| `pause_program` | Authority | No | Emits `Paused` event (added in fix bundle) |
| `unpause_program` | Authority | No | Emits `Unpaused` event (added in fix bundle) |
| `create_match` | Authority | Yes | Server creates escrow PDA |
| `deposit_wager` | Player | Yes | Client-signed; deadline strictly `< deposit_deadline` (v2 post-fix H018) |
| `start_with_depositors` (v1) | Authority | No | Removed pause guard per SOS H016 fix; 1h deposit window gate (SOS H017 fix) |
| `settle_match` | Authority | No | Removed pause guard per SOS H016 fix; 90/7/3 split, closes PDA |
| `cancel_match` | Authority OR Player | No | Removed pause guard per SOS H016 fix; requires all depositors in remaining_accounts (SOS H023 fix) |
| `permissionless_reclaim` | Any fee payer | **No** | 2h backstop (v1 post-fix); caller gets rent |

### Appendix D - Deferred-to-Mainnet Finding Summary

Audit findings explicitly deferred to pre-mainnet bundles. Full details in the SOS remediation log (SOS on-chain) and the DB remediation log (off-chain).

**Must-fix before mainnet:**
- SOS H001 - one-step authority transfer (no propose/accept)
- SOS H044/H046 + DB H012 - single hot wallet holds both upgrade + application authority
- SOS H002/H032 - BPS/treasury rotation with no timelock
- SOS H024 + DB H014 - non-contiguous refund mask UNRECOVERABLE; server/on-chain desync
- DB H015/H016 - group-chat double-settle and confirmDeposit double-overwrite races
- DB H049/H050 - single unmonitored RPC endpoint, no retry backoff

**Design-level pre-mainnet:**
- SOS H003/H006/H007 - authority winner selection fraud (server-authoritative architecture limitation)
- DB H003/H004 - JWT generated but never verified; auth signature replay window
- DB H009/H010 - wallet rotation leaves stale DB entry
