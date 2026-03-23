---
doc_id: deployment-sequence
title: "SolShot Deployment Runbook"
status: draft
requires: ["architecture-decisions", "escrow-flow-decisions", "security-posture-decisions"]
sources: ["escrow-flow", "security-posture", "token-economics", "architecture"]
last_updated: 2026-02-24
---

# SolShot Deployment Runbook

Operational procedures for deploying and managing the SolShot stack: Anchor escrow program, Express/Socket.IO server, and React/Phaser client. This document captures what was previously tribal knowledge.

**Audience:** Solo founder. This is not polished documentation -- it is a step-by-step reference for when you are sitting at the terminal at 2am before a launch.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Program Deployment -- Devnet](#2-program-deployment----devnet)
3. [Config Initialization](#3-config-initialization)
4. [Server Deployment](#4-server-deployment)
5. [Client Deployment](#5-client-deployment)
6. [Program Deployment -- Mainnet](#6-program-deployment----mainnet)
7. [Key Rotation](#7-key-rotation)
8. [Emergency Procedures](#8-emergency-procedures)
9. [Post-Deploy Verification](#9-post-deploy-verification)

---

## 1. Prerequisites

### Toolchain

| Tool | Required Version | Install |
|------|-----------------|---------|
| Solana CLI | stable (Anza) | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor CLI | 0.32.1 | Pinned in `Anchor.toml` `[toolchain]` section |
| Rust | stable | `rustup default stable` |
| Node.js | >= 18.0.0 | Pinned in `server/package.json` `engines` field |
| npm | bundled with Node | -- |

### Keypair Inventory

You need three separate Solana keypairs. These must all be distinct addresses -- the on-chain program enforces that authority, treasury, and ops are different pubkeys.

| Keypair | Purpose | Generation |
|---------|---------|------------|
| **Authority (server)** | Signs `create_match`, `settle_match`, `cancel_match`, `pause_program`, `update_config` | `solana-keygen new -o ~/.config/solana/solshot-dev.json` |
| **Treasury** | Receives 7% of each settlement pot | `solana-keygen new -o ~/.config/solana/solshot-treasury.json` |
| **Ops** | Receives 3% of each settlement pot | `solana-keygen new -o ~/.config/solana/solshot-ops.json` |

Record all three public keys. You will need them for config initialization and `.env` files.

### RPC Endpoints

| Network | Endpoint | Notes |
|---------|----------|-------|
| Devnet | `https://api.devnet.solana.com` | Public, rate-limited. Fine for dev. |
| Mainnet | TBD -- not captured in interview | Use a dedicated RPC provider (Helius, QuickNode). Public mainnet RPC is unreliable under load. Budget accordingly. |

### Pre-Flight Checklist (all deployments)

- [ ] Solana CLI configured to correct cluster: `solana config set --url <cluster_url>`
- [ ] Deployer wallet has sufficient SOL for rent + transaction fees (at least 3 SOL for program deploy)
- [ ] All three keypairs generated and public keys recorded
- [ ] `Anchor.toml` `[provider].cluster` set to target cluster
- [ ] `Anchor.toml` `[provider].wallet` points to deployer keypair

---

## 2. Program Deployment -- Devnet

### 2.1 Build the program

```bash
anchor build
```

This produces:
- `target/deploy/solshot_escrow.so` -- the compiled BPF program
- `target/idl/solshot_escrow.json` -- the IDL (copy to `server/idl/` after build)
- `target/types/solshot_escrow.ts` -- TypeScript types

### 2.2 Verify the program ID

After first build, Anchor generates a keypair at `target/deploy/solshot_escrow-keypair.json`. The program ID is derived from this keypair.

```bash
solana address -k target/deploy/solshot_escrow-keypair.json
```

**Critical:** This ID must match the `declare_id!()` in `programs/solshot-escrow/src/lib.rs` (currently `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`). If it does not match, update these locations:

1. `programs/solshot-escrow/src/lib.rs` -- `declare_id!("...")` macro
2. `Anchor.toml` -- `[programs.devnet]` and `[programs.localnet]` sections
3. `server/services/escrow.js` -- `PROGRAM_ID` constant
4. `server/.env` -- `MATCH_ESCROW_PROGRAM_ID`
5. `client/.env` -- `REACT_APP_ESCROW_PROGRAM_ID`

Then rebuild: `anchor build`

### 2.3 Configure for devnet

Verify `Anchor.toml`:

```toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/solshot-dev.json"
```

### 2.4 Fund the deployer

```bash
solana airdrop 5 --url devnet
solana balance --url devnet
```

You need roughly 2-3 SOL for program deployment rent. Airdrop multiple times if needed (devnet caps at 2 SOL per airdrop in some periods).

### 2.5 Deploy

```bash
anchor deploy --provider.cluster devnet
```

Expected output includes `Program Id: CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` (or your generated ID).

### 2.6 Copy the IDL to the server

```bash
cp target/idl/solshot_escrow.json server/idl/solshot_escrow.json
```

The server loads this IDL at startup from `server/idl/solshot_escrow.json` to construct the Anchor `Program` object.

### 2.7 Run tests

```bash
anchor test --provider.cluster devnet
```

Test script is configured in `Anchor.toml`: `npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts`

### 2.8 Verification

- [ ] `solana program show <PROGRAM_ID> --url devnet` -- confirms program is deployed and shows data length, authority
- [ ] IDL copied to `server/idl/solshot_escrow.json`
- [ ] Program ID matches across all 5 locations listed in step 2.2

---

## 3. Config Initialization

The GlobalConfig PDA must be initialized exactly once after each fresh program deploy. It stores the authority pubkey, treasury address, ops address, and the emergency pause flag.

**Seeds:** `[b"config"]` -- singleton PDA, one per program.

### 3.1 Pre-flight

- [ ] Program is deployed (section 2 complete)
- [ ] Server keypair is the same one used as `[provider].wallet` in Anchor.toml
- [ ] You have the three pubkeys ready: authority, treasury, ops
- [ ] All three addresses are distinct (the instruction enforces this on-chain)

### 3.2 Initialize via the server escrow service

The `initializeConfig()` function in `server/services/escrow.js` wraps the on-chain instruction. You can call it from a Node REPL or a one-off script:

```javascript
// init-config.mjs — run with: node init-config.mjs
import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

import { initKeys } from './server/services/keys.js';
import { initEscrow, initializeConfig, getConfigState } from './server/services/escrow.js';

initKeys();
initEscrow();

const AUTHORITY = '<server-keypair-pubkey>';
const TREASURY  = '<treasury-wallet-pubkey>';
const OPS       = '<ops-wallet-pubkey>';

const result = await initializeConfig(AUTHORITY, TREASURY, OPS);
console.log('initializeConfig result:', result);

// Verify
const state = await getConfigState();
console.log('Config PDA state:', state);
```

### 3.3 What `initialize_config` sets

| Field | Value | Notes |
|-------|-------|-------|
| `authority` | Server hot wallet pubkey | Signs settlement, cancellation, pause |
| `treasury` | Treasury wallet pubkey | Receives 7% of settlement (700 BPS) |
| `ops` | Ops wallet pubkey | Receives 3% of settlement (300 BPS) |
| `is_paused` | `false` | Program starts unpaused |
| `bump` | Auto-derived | PDA bump seed |

### 3.4 Verification

```bash
# Fetch the config PDA account data
solana account <CONFIG_PDA_ADDRESS> --url devnet --output json
```

Or use the `getConfigState()` function from the escrow service and confirm:
- `authority` matches your server keypair pubkey
- `treasury` matches your treasury wallet
- `ops` matches your ops wallet
- `isPaused` is `false`

### 3.5 Important notes

- **This instruction can only be called once.** The `init` constraint on the PDA means a second call fails with "already in use." If you need to change values after initialization, use `update_config` (see section 7).
- If you deploy a fresh program (new program ID), you must initialize config again for that new program.
- The payer (deployer) pays rent for the config account: 106 bytes = 8 (discriminator) + 32 (authority) + 32 (treasury) + 32 (ops) + 1 (bool) + 1 (u8).

---

## 4. Server Deployment

### 4.1 Environment variables

Copy `server/.env.example` to `server/.env` and fill in all values:

| Variable | Example | Required |
|----------|---------|----------|
| `PORT` | `5001` | Yes |
| `NODE_ENV` | `production` | Yes |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/solshot` | Yes (server exits with FATAL if missing and DB is needed) |
| `SOLANA_RPC` | `https://api.devnet.solana.com` | Yes |
| `SOLANA_KEYPAIR_PATH` | `~/.config/solana/solshot-dev.json` | One of PATH or JSON required |
| `SOLANA_KEYPAIR_JSON` | `[1,2,3,...,64]` | For cloud deploy -- raw JSON array |
| `MATCH_ESCROW_PROGRAM_ID` | `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` | Yes |
| `TREASURY_WALLET` | `4Ekd8xxsym6HiGaKbDVP7hgf3AoBsLmBSenyfx3N2hGk` | Yes |
| `OPS_WALLET` | `G2TgxypFAQHvcfwRA1dkJMx2St4gYpDpz37uiG1Q9grx` | Yes |
| `JWT_SECRET` | 64+ random characters | Yes |
| `ADMIN_API_KEY` | Random string for `/stats` and `/api/admin/reload-keys` | Yes in production |
| `CORS_ORIGINS` | `https://solshot.gg,https://www.solshot.gg` | Yes in production |
| `SHOT_TOKEN_MINT` | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` | For SHOT token features |

**Key loading priority:** `SOLANA_KEYPAIR_JSON` env var takes precedence over `SOLANA_KEYPAIR_PATH` file. For cloud deployments (Render), use `SOLANA_KEYPAIR_JSON` with the raw JSON array contents of the keypair file. The `keys.js` module zeros the byte array after constructing the Keypair object (KM-04).

### 4.2 Startup sequence

The server boot order in `server/index.js`:

1. `dotenv.config()` -- loads `.env`
2. `initKeys()` -- loads server keypair (logs `LOADED` or `NOT CONFIGURED`)
3. Express middleware setup (helmet, CORS, rate limiter)
4. Socket.IO initialization with per-IP connection limiting (max 100)
5. MongoDB connection (if `MONGODB_URI` set)
6. `initShotState()` -- loads SHOT token emission state from DB (fatal on failure)
7. `server.listen()` on `0.0.0.0:PORT`
8. SIGHUP handler registered for credential hot-reload

### 4.3 Cloud deployment (Render)

The Launch Checklist references Render as the hosting platform.

1. Create a Web Service on Render, connect the GitHub repo
2. Set build command: `cd server && npm install`
3. Set start command: `cd server && npm start`
4. Set all environment variables from section 4.1 in the Render dashboard
5. Use paid tier ($7/mo minimum) -- free tier spins down after 15min inactivity, killing WebSocket connections
6. `trust proxy` is set to `1` in `index.js` -- required for correct IP extraction behind Render's reverse proxy

### 4.4 Verification

- [ ] `GET /health` returns 200
- [ ] `GET /stats` with `x-admin-key` header returns server metrics
- [ ] Server logs show `[Keys] Escrow authority: <pubkey>`
- [ ] Server logs show `[Escrow] Initialized` with correct program ID, config PDA, treasury, ops
- [ ] Server logs show `MongoDB connected`
- [ ] WebSocket connections work (test with a client connecting from browser)

---

## 5. Client Deployment

### 5.1 Environment variables

Copy `client/.env.example` to `client/.env`:

| Variable | Example | Required |
|----------|---------|----------|
| `REACT_APP_SERVER_URL` | `https://solshot-server.onrender.com` | Yes |
| `REACT_APP_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | Yes |
| `REACT_APP_ESCROW_PROGRAM_ID` | `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` | Yes |
| `REACT_APP_SHOT_TOKEN_MINT` | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` | For SHOT features |
| `REACT_APP_SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` | Recommended for mainnet |
| `INLINE_RUNTIME_CHUNK` | `false` | Yes (CS-03: CSP compliance) |

### 5.2 Build and deploy (Vercel)

1. Create Vercel project, set root directory to `client/`
2. Set environment variables in Vercel dashboard
3. Deploy -- Vercel auto-detects Create React App
4. Update `CORS_ORIGINS` on the server to include the Vercel domain

### 5.3 Verification

- [ ] Site loads at deployed URL
- [ ] Browser console shows Socket.IO connected to server
- [ ] Wallet connect button appears and Phantom/Solflare adapter works
- [ ] Network matches expected cluster (devnet or mainnet-beta)

---

## 6. Program Deployment -- Mainnet

### 6.1 Pre-flight checklist

This is the critical deployment. Do not rush it.

- [ ] All devnet testing complete -- full match lifecycle (create, deposit, settle, cancel) tested
- [ ] 3 independent security analyses completed with 0 active CRITICAL/HIGH findings
- [ ] Mainnet RPC endpoint provisioned (TBD -- not captured in interview; use Helius, QuickNode, or similar)
- [ ] Mainnet SOL funded in deployer wallet (need ~3 SOL for program rent)
- [ ] Mainnet treasury wallet created and funded with enough SOL for rent
- [ ] Mainnet ops wallet created and funded with enough SOL for rent
- [ ] Mainnet authority keypair generated (use a fresh keypair, not the devnet one)
- [ ] OC-13: Plan to transfer upgrade authority to multisig after deploy (noted in `lib.rs` line 1)
- [ ] Program code is identical to what was audited -- `anchor build` with no modifications after audit sign-off

### 6.2 Update configuration

```toml
# Anchor.toml
[programs.mainnet]
solshot_escrow = "<MAINNET_PROGRAM_ID>"

[provider]
cluster = "mainnet"
wallet = "~/.config/solana/solshot-mainnet.json"
```

### 6.3 Build and deploy

```bash
# Ensure clean build
anchor build

# Verify program ID matches declare_id!
solana address -k target/deploy/solshot_escrow-keypair.json

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
```

### 6.4 Initialize config (mainnet)

Same procedure as section 3, but with mainnet addresses:

```javascript
const AUTHORITY = '<mainnet-server-keypair-pubkey>';
const TREASURY  = '<mainnet-treasury-pubkey>';
const OPS       = '<mainnet-ops-pubkey>';

const result = await initializeConfig(AUTHORITY, TREASURY, OPS);
```

### 6.5 Update all references

After mainnet deploy, update the program ID in all 5 locations (see section 2.2), plus:

- Server `.env`: `SOLANA_RPC` to mainnet RPC, all wallet pubkeys to mainnet versions
- Client `.env`: `REACT_APP_SOLANA_NETWORK=mainnet-beta`, program ID, RPC endpoint
- Server CSP `connectSrc` in `index.js`: ensure `mainnet-beta` RPC URLs are included (they already are)

### 6.6 Transfer upgrade authority to multisig

Per OC-13 (noted at top of `lib.rs`): transfer program upgrade authority to a Squads multisig before mainnet goes live.

```bash
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG_ADDRESS>
```

**Warning:** This is irreversible if the multisig cannot be recovered. Double-check the multisig address.

TBD -- multisig setup details not captured in interview. Planned for v1.2 per security-posture D5.

### 6.7 Verification

- [ ] `solana program show <PROGRAM_ID> --url mainnet-beta` shows correct authority
- [ ] Config PDA initialized with correct mainnet addresses
- [ ] `is_paused` is `false`
- [ ] End-to-end test match on mainnet with minimum wager (0.1 SOL = 100,000,000 lamports, above the 10,000 lamport minimum)
- [ ] Settlement split verified: 90% winner, 7% treasury, 3% ops
- [ ] Treasury and ops wallets received correct amounts

---

## 7. Key Rotation

Authority keys can be rotated without disrupting active matches. The on-chain program reads authority from the GlobalConfig PDA at execution time, not at escrow creation time. Active PDAs continue working after rotation.

### 7.1 When to rotate

- Suspected key compromise
- Scheduled rotation (define your own cadence -- TBD, not captured in interview)
- Personnel change (N/A for solo founder, but relevant if team grows)

### 7.2 Rotation procedure

**Step 1: Generate new keypair**

```bash
solana-keygen new -o ~/.config/solana/solshot-authority-new.json
solana address -k ~/.config/solana/solshot-authority-new.json
# Record the new public key
```

**Step 2: Update on-chain config**

The current authority must sign this transaction. Use `update_config` with only the field(s) you want to change -- pass `null` for fields to keep unchanged.

```javascript
import { updateConfig } from './server/services/escrow.js';

// Rotate authority only (treasury and ops unchanged)
const result = await updateConfig(
    '<NEW_AUTHORITY_PUBKEY>',  // newAuthority
    null,                      // newTreasury (keep current)
    null                       // newOps (keep current)
);
console.log('Config update TX:', result.txSignature);
```

On-chain, this emits a `ConfigUpdated` event with all three current addresses for audit trail.

**Safety checks enforced by the program:**
- New authority cannot be the zero address (prevents accidental governance burn -- SOS: B1)
- All three addresses must remain distinct after update (prevents settlement DoS -- SOS: H003)

**Step 3: Update server credentials**

Two options depending on your deployment:

**Option A: SIGHUP hot-reload (Linux/Render)**

1. Update the `SOLANA_KEYPAIR_JSON` environment variable in your hosting dashboard (Render) with the new keypair's JSON array
2. Trigger credential reload:
   ```bash
   curl -X POST https://your-server/api/admin/reload-keys \
     -H "x-admin-key: <YOUR_ADMIN_API_KEY>"
   ```
   This sends SIGHUP to the server process, which calls `initKeys()` then `initEscrow()` to reinitialize with the new keypair.

**Option B: Restart**

1. Update the keypair file or environment variable
2. Restart the server process

**Step 4: Verify**

```javascript
import { getConfigState } from './server/services/escrow.js';
const config = await getConfigState();
console.log('Current authority:', config.authority);
// Should match new keypair pubkey
```

### 7.3 Rotating treasury or ops

Same procedure using `updateConfig`, but changing the second or third parameter:

```javascript
// Rotate treasury only
await updateConfig(null, '<NEW_TREASURY_PUBKEY>', null);

// Rotate ops only
await updateConfig(null, null, '<NEW_OPS_PUBKEY>');

// Rotate all three at once
await updateConfig('<NEW_AUTH>', '<NEW_TREASURY>', '<NEW_OPS>');
```

After changing treasury or ops, update the corresponding `TREASURY_WALLET` / `OPS_WALLET` in the server's environment variables and restart or reload.

### 7.4 What happens to active matches

Nothing. Active escrow PDAs store `escrow.authority` but settlement validates the authority against the GlobalConfig PDA at execution time via `has_one = authority`. So after rotation:

- The old authority can no longer settle or create matches
- The new authority can settle all existing active matches
- Players can still cancel after timeout (24h) regardless of authority changes
- Permissionless reclaim (48h) is unaffected -- requires no authority at all

---

## 8. Emergency Procedures

### 8.1 Pause the program (on-chain)

Halts all economic instructions: `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. The `permissionless_reclaim` instruction is NOT gated by the pause flag -- it remains available as the nuclear backstop.

```javascript
import { pauseProgram } from './server/services/escrow.js';

const result = await pauseProgram();
console.log('Pause TX:', result.txSignature);
```

Or call via the Anchor CLI if the server is down:

```bash
# TBD — not captured in interview: direct CLI invocation of pause_program
# You would need a script that constructs and sends the transaction manually
```

**Idempotent:** Calling `pauseProgram` when already paused succeeds without error.

### 8.2 Unpause the program

```javascript
import { unpauseProgram } from './server/services/escrow.js';

const result = await unpauseProgram();
console.log('Unpause TX:', result.txSignature);
```

**Idempotent:** Calling `unpauseProgram` when already unpaused succeeds without error.

### 8.3 Halt the server

If the situation requires stopping all match activity immediately:

1. **Pause the on-chain program first** (section 8.1) -- this prevents any settlement or deposit even if the server restarts
2. Stop the server process (Render: manual deploy of a stopped state, or scale to 0)
3. All connected clients will receive Socket.IO disconnect events
4. MongoDB match states will reflect last known state

### 8.4 Crash recovery

When the server restarts after a crash, it checks MongoDB for matches in `settling` state (match MongoDB state machine: `lobby -> weapon_shop -> battle -> settling -> complete/cancelled`). The `settling` state specifically exists for the "did my TX land?" scenario:

1. Server checks if settlement transaction already confirmed on-chain
2. If confirmed: update MongoDB to `complete`
3. If not confirmed: resubmit settlement transaction
4. No match resumption -- winner determined by last known game state (escrow-flow D4)

### 8.5 Fund safety layers during emergency

Three independent layers ensure players never lose SOL, even during extended outages:

| Layer | Mechanism | Trigger | Timeout |
|-------|-----------|---------|---------|
| 1. Server recovery | Server restarts, settles based on last known state | Automatic on restart | Immediate |
| 2. Player cancel | Either player calls `cancel_match` on-chain | Player signature required | After 24h from activation (or creation if never activated) |
| 3. Permissionless reclaim | Anyone calls `permissionless_reclaim` | Any fee payer signature | After 48h (`TIMEOUT_SECONDS * 2 = 172800s`) |

**Key point:** Permissionless reclaim (layer 3) works even when the program is paused. It has no pause guard. This is the absolute backstop -- funds can never be permanently locked.

### 8.6 Incident checklist

For any security incident:

- [ ] **Immediate:** Pause the on-chain program (`pauseProgram()`)
- [ ] **Immediate:** Halt the server if compromise is server-side
- [ ] **Assess:** Check on-chain config state -- is authority still correct?
- [ ] **Assess:** Check for unauthorized settlements via on-chain `MatchSettled` events
- [ ] **Rotate:** If key compromise suspected, rotate authority (section 7.2) -- this is a single TX
- [ ] **Communicate:** TBD -- not captured in interview (no public comms channel documented)
- [ ] **Resume:** Unpause program, restart server, verify end-to-end flow
- [ ] **Post-mortem:** Document what happened and update procedures

---

## 9. Post-Deploy Verification

Run through this checklist after every deployment (devnet or mainnet).

### 9.1 On-chain verification

- [ ] Program deployed: `solana program show <PROGRAM_ID> --url <cluster>`
- [ ] Config initialized: `getConfigState()` returns correct authority, treasury, ops
- [ ] Config not paused: `isPaused === false`
- [ ] Create a test match escrow via `createMatchEscrow()`
- [ ] Both test players deposit via `depositWager` client-side transactions
- [ ] Settle the test match -- verify winner gets 90%, treasury gets 7%, ops gets 3%
- [ ] Verify the escrow PDA is closed after settlement (rent returned to authority)

### 9.2 Server verification

- [ ] `GET /health` returns 200
- [ ] `GET /stats` (with admin key) returns metrics
- [ ] Server logs: `[Keys] Escrow authority: <expected_pubkey>`
- [ ] Server logs: `[Escrow] Initialized`
- [ ] Server logs: `MongoDB connected`
- [ ] WebSocket connections work (two players can join a room)

### 9.3 Client verification

- [ ] Site loads, Socket.IO connects
- [ ] Wallet adapter detects Phantom/Solflare
- [ ] Balance displays correctly
- [ ] Full match lifecycle: create room, join, fund, play, settle

### 9.4 Settlement math verification

For a 0.1 SOL wager (each player), total pot = 0.2 SOL = 200,000,000 lamports:

| Recipient | BPS | Lamports | SOL |
|-----------|-----|----------|-----|
| Winner | 9000 | 180,000,000 | 0.18 |
| Treasury | 700 | 14,000,000 | 0.014 |
| Ops | 300 | 6,000,000 | 0.006 |
| **Total** | **10000** | **200,000,000** | **0.2** |

Winner amount is calculated as remainder (`total - treasury - ops`) to prevent dust loss from integer division. BPS math uses u128 widening to prevent overflow at max wager (100 SOL, BOK GAP-002).

### 9.5 Wager bounds verification

| Bound | Value | Enforced By |
|-------|-------|-------------|
| Minimum wager | 10,000 lamports (0.00001 SOL) | `MIN_WAGER_LAMPORTS` in `lib.rs` (OC-08) |
| Maximum wager | 100,000,000,000 lamports (100 SOL) | `MAX_WAGER_LAMPORTS` in `lib.rs` (OC-12) |
| Settlement deadline | 3,600 seconds (1 hour) after activation | `SETTLEMENT_TIMEOUT_SECONDS` (OC-07) |
| Cancel timeout | 86,400 seconds (24 hours) | `TIMEOUT_SECONDS` |
| Permissionless reclaim | 172,800 seconds (48 hours) | `PERMISSIONLESS_RECLAIM_TIMEOUT` |

---

## Appendix A: Program ID Locations

When the program ID changes (fresh deploy), update all of these:

| File | Field / Constant |
|------|-----------------|
| `programs/solshot-escrow/src/lib.rs` | `declare_id!("...")` |
| `Anchor.toml` | `[programs.devnet]` and `[programs.localnet]` |
| `server/.env` | `MATCH_ESCROW_PROGRAM_ID` |
| `server/services/escrow.js` | `PROGRAM_ID` constant (line 39) |
| `client/.env` | `REACT_APP_ESCROW_PROGRAM_ID` |

## Appendix B: PDA Derivations

| PDA | Seeds | Notes |
|-----|-------|-------|
| GlobalConfig | `[b"config"]` | Singleton. 106 bytes. |
| MatchEscrow | `[b"match", match_id.as_bytes()]` | One per match. 168 bytes. `match_id` max 32 chars. |

## Appendix C: On-Chain Instructions Quick Reference

| Instruction | Signer | Pause-gated | Notes |
|-------------|--------|-------------|-------|
| `initialize_config` | Payer (deployer) | No | One-time after deploy |
| `update_config` | Authority | No | Rotate authority/treasury/ops |
| `pause_program` | Authority | No | Must work when paused |
| `unpause_program` | Authority | No | Must work when paused |
| `create_match` | Authority | Yes | Server creates escrow PDA |
| `deposit_wager` | Player | Yes | Client-signed, one per player |
| `settle_match` | Authority | Yes | 90/7/3 split, closes PDA |
| `cancel_match` | Authority OR Player | Yes | Refunds deposited players |
| `permissionless_reclaim` | Any fee payer | **No** | 48h backstop, caller gets rent |
