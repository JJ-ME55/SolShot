# Mainnet Deploy Day — Runbook & Env Manifests

Single-page, ordered runbook for flipping SolShot v2 escrow to mainnet. Prepared
2026-06-04. Companion to `Docs/KEY_MANAGEMENT.md` §4 (deploy commands) and
`Docs/internal/deployment-sequence.md` §8.

> **Cutover note:** the same Render server + Vercel client that serve the live
> devnet demo become the mainnet ones once their env vars flip. There is no
> separate staging. Treat the env-var flip + redeploy as the go-live moment.

---

## ✅ Pre-flight — already verified (2026-06-04)

- `v1-mainnet-rc2` tagged
- 3 Squads governance live, 2-of-3 verified (Authority/Treasury/Operations)
- Mainnet program keypair `target/deploy/solshot_escrow_v2_mainnet-keypair.json` → `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` ✓
- Server-authority keypair `~/.config/solana/solshot-server-authority.json` → `CgcAZJf6U5LFkUzPRhcx217prT76uUV3vUdae7QU3wmC` ✓
- `Anchor.toml [programs.mainnet] solshot_escrow_v2 = BNLgn96…` ✓

---

## ✅ STEP 0 — 1v1 escrow dispatch — RESOLVED 2026-06-04

`shouldUseEscrowV2` changed `> 2` → `>= 2` in `server/services/solana.js`, so all
wagered matches (1v1 included) route through v2 — required because mainnet is
v2-only. Validated on devnet via `server/scripts/smoke-v2-1v1.mjs`: v2 accepted a
2-player create (PDA `8BsZKMGY…`, `maxPlayers: 2`) and cleanly cancelled. Tagged
`v1-mainnet-rc3`.

---

## Render (server) env vars — mainnet

| Var | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | |
| `SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=<key>` | key in `.HeliusRPC.txt` (gitignored) |
| `ESCROW_PROGRAM_ID_V2` | `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` | mainnet v2 |
| `SOLANA_KEYPAIR_JSON` | _contents of `solshot-server-authority.json`_ | the `[..]` byte array; pubkey `CgcAZJf6…` |
| `TREASURY_WALLET` | `5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE` | Treasury Squad vault |
| `OPS_WALLET` | `6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy` | Operations Squad vault |
| `CORS_ORIGINS` | `https://solshot.gg,https://www.solshot.gg` | |
| `MATCH_ESCROW_PROGRAM_ID` | **leave UNSET** | v1 not deployed on mainnet |
| `SHOT_TOKEN_MINT` | **leave UNSET** | V3 pivot — SHOT off-chain |
| keep as-is | `MONGODB_URI`, `JWT_SECRET`, `ADMIN_API_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `TELEGRAM_*` | unchanged |

## Vercel (client) env vars — mainnet

| Var | Value | Note |
|---|---|---|
| `REACT_APP_SOLANA_NETWORK` | `mainnet-beta` | |
| `REACT_APP_ESCROW_V2_PROGRAM_ID` | `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` | required |
| `REACT_APP_SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=<key>` | same Helius key as server |
| `REACT_APP_WAGERED_ENABLED` | `true` | enable wagering |
| `REACT_APP_ESCROW_PROGRAM_ID` | **leave UNSET** | v1 not on mainnet |
| keep as-is | `REACT_APP_SERVER_URL`, `REACT_APP_PRIVY_APP_ID` | unchanged |

---

## Ordered deploy-day steps

1. **Mainnet RPC — already in hand ($0).** A Helius key already exists in `.HeliusRPC.txt` (gitignored). Helius keys are cross-cluster, so use the same key on the mainnet host: `https://mainnet.helius-rpc.com/?api-key=<key from .HeliusRPC.txt>`. That host is on this script's allowlist. (Optionally test with a `getHealth` call.) No new account, no new cost.
2. **Fund wallets** (mainnet SOL):
   - **Deployer/CLI wallet** (the one in `solana config` for the deploy): ~3 SOL for program rent + fees.
   - **Server-authority** `CgcAZJf6…`: ~0.2 SOL for ongoing create/settle tx fees.
   - **Treasury + Operations vaults**: ~0.05 SOL each for rent (optional but tidy).
3. **Set Render env vars** (table above) — **do not redeploy yet** (would flip the live server to a not-yet-deployed mainnet program).
4. **Set Vercel env vars** (table above) **+ DISABLE Vercel Deployment Protection** (the 3.5-day gotcha).
5. **Build + deploy the program** (see `KEY_MANAGEMENT.md` §4 for exact commands):
   - Swap `declare_id!` in `programs/solshot-escrow-v2/src/lib.rs` → `BNLgn96…` (see branch note below).
   - `anchor build` (disable McAfee real-time for this build, or `anchor build --no-idl`).
   - `solana config set --url mainnet-beta --keypair <funded-deployer-keypair>` (~3 SOL; disposable fee-payer, not a Squad signer, not cold).
   - `solana program deploy --program-id target/deploy/solshot_escrow_v2_mainnet-keypair.json target/deploy/solshot_escrow_v2.so` — **do NOT** add `--upgrade-authority <vault>` (that flag needs a signer; a PDA can't sign).
   - **Immediately** hand off authority: `solana program set-upgrade-authority BNLgn96… --new-upgrade-authority 9f1M… --skip-new-upgrade-authority-signer-check` (CLI, unilateral — Squad doesn't sign; ✅ verified on devnet 2026-06-04).
   - Verify: `solana program show BNLgn96…` → Authority = `9f1M…` (Authority Squad vault) before trusting it.
6. **Initialize config** (one-shot): `node server/scripts/init-config-mainnet.mjs` with `SQUADS_AUTHORITY_PDA=9f1M…`, `SQUADS_TREASURY_PDA=5zLEY…`, `SQUADS_OPS_PDA=6vism…`, `ESCROW_PROGRAM_ID_V2=BNLgn96…`, mainnet `SOLANA_RPC`, `SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server-authority.json`, then `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE`.
7. **Redeploy** Render (server picks up mainnet env) + Vercel (client picks up mainnet env). ← go-live.
8. **Verify on-chain**: program authority = Squads vault; `getConfigState` shows correct authority/treasury/ops; `isPaused === false`.
9. **Smoke**: one small real mainnet wagered match (0.1 SOL) → confirm 90/7/3 split lands on-chain.
10. **Rollback ready**: pause via Squads (`pause_program` proposal) if anything's wrong; full rollback in `deployment-sequence.md` §10.

---

## declare_id / branch note

The `declare_id!` swap to `BNLgn96…` makes the source no longer match the **devnet**
program (`BVKXL…`), whose runtime check would then reject the devnet server with
`DeclaredProgramIdMismatch`. So decide before deploy day:

- **Option A — keep devnet on `main`:** do the `declare_id!` swap as a local,
  uncommitted change at deploy time; build + deploy; then revert it (mainnet program
  ID is locked on-chain by the deploy — the source declare_id only matters at build).
- **Option B — `main` becomes mainnet (devnet retired):** commit the swap; the devnet
  server stops working (acceptable if devnet is being retired post-launch).

Per the current branch strategy (`main` = LIVE), Option B is the likely end-state, but
it's a conscious call — make it explicitly.
