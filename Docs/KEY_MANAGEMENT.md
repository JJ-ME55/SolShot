# SolShot Key Management

**Status:** Active runbook for V1 mainnet
**Authored:** 2026-05-26 as part of [Sprint 1 S1-T4](internal/V1_LAUNCH_SPRINT.md)
**Approach:** Squads-from-day-one — multisig is the authority from genesis. No hot upgrade-authority keypair ever exists.

This doc is the **source of truth** for:
- Which keys exist, what they do, where they live
- How to set up the Squads multisig
- How to rotate the server hot key
- How to recover if a key is lost
- What never to do

---

## §1 Key Inventory

### Mainnet (V1 target)

| Key | Role | Location | Privilege | Rotateable |
|---|---|---|---|---|
| **Squads governance — 3 Squads** | **Three separate Squads V4 multisigs** (each 2-of-3, same signer set: JJ hot + Fish + Ledger), one vault each — V4 gates multiple vaults per Squad behind the $49/mo Pro plan, so three free Basic Squads is the no-subscription path (see §8 2026-06-04). Roles + vault PDAs (all distinct, all 2-of-3 verified live on-chain 2026-06-04): **Authority** `9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb` (upgrade auth + config governance), **Treasury** `5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE` (7% fee dest), **Operations** `6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy` (3% fee dest). On-chain `initialize_config` rejects same-PDA collisions (`require!(authority != treasury); require!(authority != ops); require!(treasury != ops);`). | On-chain vault PDAs (Squads V4 program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, app.squads.so) | Highest. Can redeploy programs, rotate config, drain fee destinations — all gated through the same 2-of-3 signer set. | Via Squads UI — note: rotating a signer must be repeated on **each of the 3 Squads** |
| **JJ hot signer** | One of 3 Squads signers | JJ local wallet (Phantom / Solflare / hardware) | Single signature toward 2-of-3 threshold | Via Squads UI |
| **Fish hot signer** | One of 3 Squads signers | Fish local wallet (Phantom mainnet). Pubkey `311auAZEvCVX2oBaW7AYMcSnby3UDaTN1uJYuuPWkXwo` (provided 2026-05-26). | Single signature toward 2-of-3 threshold | Via Squads UI |
| **Cold Ledger** | One of 3 Squads signers, recovery role | Ledger Nano hardware, stored offline by JJ. Pubkey `4XoQgPxxLFNSc19A3TPqpfcvptEQ5g2DYmnaRLkYTFLV` (derived 2026-05-26). | Single signature toward 2-of-3 threshold. Only used if a hot signer is lost. | Squads UI (with 2 existing signers approving) |
| **`solshot-server-authority.json`** | Server operational key | Render disk, env var `SOLANA_SERVER_KEYPAIR_PATH` | Lowest. Can call `create_match`, `settle_match`, `cancel_match` on the program — but program logic gates what each call can do. Cannot rotate config, cannot drain treasury. | Hot rotation procedure (see §5) |

**Generated:** `solshot-server-authority.json` pubkey = `CgcAZJf6U5LFkUzPRhcx217prT76uUV3vUdae7QU3wmC` (2026-05-26)

### Devnet (current, pre-Sprint-2)

| Key | Role | Location | Notes |
|---|---|---|---|
| `solshot-dev.json` | Devnet v1 + v2 escrow authority (god-mode hot key) | `~/.config/solana/solshot-dev.json` on JJ's machine | Pubkey `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`. Will be retired when v1 is deprecated. |
| `solshot-treasury.json` | Devnet treasury fee dest | `~/.config/solana/solshot-treasury.json` | Pubkey `4Ekd8xxsym6HiGaKbDVP7hgf3AoBsLmBSenyfx3N2hGk` |
| `solshot-ops.json` | Devnet ops fee dest | `~/.config/solana/solshot-ops.json` | Pubkey `G2TgxypFAQHvcfwRA1dkJMx2St4gYpDpz37uiG1Q9grx` |
| `id.json` | Solana CLI default | `~/.config/solana/id.json` | Personal — not used in production |

**Devnet retains its single-key god-mode setup** for in-flight Sprint 1 work. Squads multisig setup happens directly on **mainnet** for V1 launch — no devnet mirror needed for the multisig itself. (The Sprint 2 S2-T1 Anchor instructions are tested against the existing devnet v2 program with `solshot-dev.json` as the "old authority" being rotated to a devnet Squads PDA — that test multisig is throwaway, generated specifically for the drill.)

---

## §2 Why Squads-from-day-one

Two layers of authority exist on a Solana program:
1. **Layer 1 — BPF Loader upgrade authority.** Can deploy new bytecode. Set when the program is deployed via `solana program deploy --upgrade-authority <pubkey>` or `anchor deploy`.
2. **Layer 2 — Application authority.** The `config.authority` field stored inside `GlobalConfig`. Used by `update_config` and related governance instructions in the Anchor program.

With **Squads-from-day-one**:
- At mainnet deploy: `solana program deploy` (deployer is initial authority), then **immediately** `solana program set-upgrade-authority <prog> --new-upgrade-authority <vault> --skip-new-upgrade-authority-signer-check` to hand Layer 1 to the multisig. The one-step `deploy --upgrade-authority <PDA>` does NOT work — that flag needs a signer and a vault PDA can't sign (verified on devnet 2026-06-04).
- Immediately after deploy: server calls `initialize_config(authority: <vault-0>, treasury: <vault-1>, ops: <vault-2>, ...)`. Layer 2 + fee destinations = multisig from genesis. Three distinct vault PDAs, one per Squad (three separate 2-of-3 Squads — V4 paywalls multi-vault, see §8 2026-06-04) — required because the program rejects same-PDA collisions.
- The deployer keypair is the authority ONLY for the brief window between deploy and the set-upgrade-authority handoff (seconds, on your trusted machine) — then never again. It is a disposable hot fee-payer, not a Squad signer and not a cold wallet.

This eliminates:
- The "rotation window" — between deploy and handoff the deployer briefly has god-mode. This is **minimized to seconds** (run the handoff immediately), not fully eliminated: the Solana CLI can't set a non-signing PDA as authority at deploy time, so a brief deployer-authority window is unavoidable. Mitigation: run deploy → set-upgrade-authority back-to-back on a trusted machine and verify the authority is the vault before walking away.
- The need to store `solshot-upgrade-authority.json` and `solshot-app-authority.json` as files anywhere. They don't exist.
- A whole class of "leaked from JJ's laptop" attack vectors. The only secret material the team holds for governance is each signer's individual wallet seed phrase, distributed across separate humans + hardware.

The Bundle 1 Anchor instructions (`propose_authority` / `accept_authority` / `apply_config_update` + 24h timelock) still ship in the program — they're **not used at launch**, but exist as recovery tools for future governance moves (e.g. adding a new signer, rotating after a compromise).

---

## §3 Squads Multisig Setup Procedure

**Prerequisites:**
- A fresh, unused Ledger Nano (JJ has a stash — pick one, dedicate it to SolShot governance only, never reuse for personal crypto)
- Seed phrase written on paper (NEVER digital, NEVER cloud), stored in a safe
- JJ + Fish each have a Solana wallet (Phantom / Solflare) with at least 0.01 SOL on mainnet for rent

**Steps:**

1. **Initialize the Ledger.** First-boot setup generates a fresh seed phrase — write it on the supplied recovery sheet (or paper of equal durability), set a strong PIN. The seed phrase is the ONLY thing that can recover this signer if the device is lost. Treat it accordingly.

2. **Install the Solana app on the Ledger.** Open Ledger Live → Manager → Solana → install. Open the Solana app on-device.

3. **Derive the SolShot cold signer pubkey.** In Ledger Live, add a Solana account. Account 0 is fine since this device is dedicated to SolShot only. Copy the pubkey — that's the value Fish and JJ feed into the Squads "members" field.

4. **(Recommended) Verify seed restore on a second device.** Take a second unused Ledger from the stash, set it up using the recovery procedure, enter the SolShot seed phrase, derive Solana account 0. Confirm the pubkey matches what you recorded in step 3. If it does, the seed phrase is correctly backed up. Wipe the second Ledger and put it back in the stash (or keep it as a hot spare). This verification is cheap insurance against bad seed transcription.

5. **Create three separate Squads.** Go to https://app.squads.so/ (Squads **V4** — `v3.squads.so` is deprecated, see §8 2026-06-04) on **mainnet** (top-right network selector). Connect JJ's hot wallet. **Why three Squads, not one Squad with three vaults:** V4 gates additional vaults ("Add Account") behind the **$49/mo Pro** plan. Three free Basic Squads (each ~0.1 SOL one-time deploy fee) give the same three distinct PDAs under the same 2-of-3, with no subscription. Create each Squad with:
   - **Members:** JJ hot pubkey, Fish hot pubkey (`311au…`), Ledger cold pubkey (`4XoQ…`) — 3 total
   - **Threshold:** 2 (any 2 of 3 must sign)
   - **Names — match the role exactly so nobody signs the wrong action:** "SolShot Authority", "SolShot Treasury", "SolShot Operations"
   - Fund each with a little SOL for the deploy fee + rent

6. **Record each Squad's vault ("Account 1") PDA + its role.** Mainnet values (created + verified 2026-06-04):
   - **Authority** → `9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb` — becomes the **program upgrade authority**, the most critical one
   - **Treasury** → `5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE`
   - **Operations** → `6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy`

   Confirm all three distinct — the program enforces `require!(authority != treasury); require!(authority != ops); require!(treasury != ops);`. (A Treasury==Operations duplicate was caught and corrected during the 2026-06-04 setup — double-check before deploy.)

7. **Verify membership on each Squad.** The PDA tells you nothing about who controls it — open each Squad → Owners and confirm members = JJ + Fish + Ledger, threshold = 2. A Squad accidentally left at 1-of-1 is a single point of failure holding real money.

8. **Test the 2-of-3 on each Squad.** Send 0.001 SOL out of each vault → two members approve → execute → confirm on-chain. The two signers can be **JJ-hot + Ledger** (Fish not required) — this doubles as a live test that the cold recovery key actually signs. ✅ **All three Squads passed 2-of-3 on-chain 2026-06-04.**

   **Ledger gotchas discovered during that test (they WILL bite again — recovery, signer rotation, etc.):**
   - The cold key was derived in **Ledger Live** (path `m/44'/501'/0'`). **Phantom uses a different path and cannot reach `4XoQ…TFLV`** — it shows a different account entirely. **Use Solflare** to connect the Ledger: it exposes a derivation-path picker → choose the "Ledger Live" path → select the account matching `4XoQ…TFLV`.
   - **Enable Blind signing** on the Ledger Solana app (on-device: Settings → Blind signing → Enabled). Without it the device auto-**declines** every Squads approval — this was the cause of the "keeps being declined" failures.
   - The cold device is a **Nano S**. It signed the test fine, but the Nano S's small memory can choke on larger transactions. If a future big op (e.g. a program upgrade) declines *with* blind signing on, suspect the Nano S size limit — a **Nano X / S Plus** is the safer long-term device.

9. **Lock down access:**
   - Confirm JJ and Fish each have their hot signer seed phrases backed up (paper, offline)
   - Lock the Ledger in a safe / safety deposit box
   - Document each signer's recovery procedure in their personal records (separate from this repo)

**Estimated time:** 1–2 hours including the test TX. Most of it is the seed-phrase paper-trail discipline. The Ledger initialization + Squads UI itself is ~30 minutes.

---

## §4 Mainnet Deploy Procedure (uses Squads from genesis)

After §3 is complete and the three Squads vault PDAs (Authority/Treasury/Ops) are known:

```bash
# 1. Update declare_id! in programs/solshot-escrow-v2/src/lib.rs to match
#    Anchor.toml [programs.mainnet].solshot_escrow_v2:
#    BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS

# 2. Build mainnet binary.
#    GOTCHA (Windows + McAfee, confirmed 2026-06-04): McAfee real-time scanning
#    locks each host .exe as link.exe writes it, so the IDL step of a full
#    `anchor build` dies with LNK1104. Two ways through:
#      (a) temporarily disable McAfee Real-Time Scanning for this one build, OR
#      (b) `anchor build --no-idl` — builds the deployable .so (McAfee only touches
#          host exes, not the BPF build) and reuse the committed server/idl IDL,
#          which is current as long as the escrow source is unchanged.
anchor build   # or: anchor build --no-idl  (see gotcha above)

# Point the CLI at mainnet with your funded DEPLOYER wallet (~3 SOL; just a
# fee-payer — NOT a Squad signer, does NOT need to be cold). It is the program's
# initial upgrade authority for the few seconds between steps 3 and 4.
solana config set --url mainnet-beta --keypair <path-to-deployer-keypair>

# 3. Deploy. You CANNOT pass the Squad vault to --upgrade-authority: that flag is
#    a SIGNER arg and a PDA can't sign. Deploy with the default authority (the
#    deployer), then hand off in step 4.
solana program deploy \
  --program-id target/deploy/solshot_escrow_v2_mainnet-keypair.json \
  target/deploy/solshot_escrow_v2.so

# 4. Hand upgrade authority to the Authority Squad vault — CLI, unilateral. The
#    Squad does NOT sign; --skip-new-upgrade-authority-signer-check lets the
#    deployer set a non-signing PDA as the new authority. Do this IMMEDIATELY
#    after deploy (the deployer holds authority until it runs).
#    ✅ Verified on devnet 2026-06-04: throwaway program 9bu1jWZb… → authority
#    set to 9f1M7tXb… via exactly this command.
solana program set-upgrade-authority BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS \
  --new-upgrade-authority 9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb \
  --skip-new-upgrade-authority-signer-check

# 5. Verify upgrade authority is now the Squad vault
solana program show BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS
# → "Authority" MUST read 9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb before you trust it
```

Then initialize the config via the server. The server keypair signs `initialize_config`, but passes the three **distinct** Squads vault PDAs as authority/treasury/ops:

```bash
# Dry-run first (no INIT_MAINNET_CONFIRM)
cd server/
ESCROW_PROGRAM_ID_V2=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS \
SOLANA_RPC=https://api.mainnet-beta.solana.com \
SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server-authority.json \
SQUADS_AUTHORITY_PDA=9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb \
SQUADS_TREASURY_PDA=5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE \
SQUADS_OPS_PDA=6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy \
node scripts/init-config-mainnet.mjs

# Review output, then execute for real
INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE \
ESCROW_PROGRAM_ID_V2=... (same env) ... \
node scripts/init-config-mainnet.mjs
```

`initialize_config` is **one-shot** — the script aborts if config already exists. After this, all rotations go through `update_config` (24h timelock) and `propose_authority` / `accept_authority` (two-step).

---

## §5 Server Hot Key Rotation Procedure

The server hot key (`solshot-server-authority.json`) can be rotated WITHOUT touching the multisig, because it's not an authority — it just signs operational TXs the program permits.

**When to rotate:**
- After a Render host compromise (suspected or confirmed)
- After any other event that exposed the key to an untrusted environment
- As routine hygiene every ~6 months

**Procedure (under 30 minutes):**

1. **Generate a new server keypair on the operations workstation:**
   ```bash
   solana-keygen new --no-bip39-passphrase --silent \
     --outfile ~/.config/solana/solshot-server-authority-NEW.json
   solana-keygen pubkey ~/.config/solana/solshot-server-authority-NEW.json
   # → save the pubkey
   ```

2. **Update Render env vars:**
   - `SOLANA_SERVER_KEYPAIR_PATH` → path to NEW keypair (or upload the file via Render disk)
   - Deploy / restart server

3. **Verify the new server keypair is operational:**
   - Hit `/health` — should return OK
   - Create a small no-wager match — should complete normally
   - Inspect Render logs for `[Escrow] Initialized — authority: <new pubkey>` matching

4. **Securely destroy the old keypair:**
   - On the dev machine: `shred -u ~/.config/solana/solshot-server-authority-OLD.json`
   - If on Render disk: rename or delete via SSH/console; ensure no backups retain it

5. **Update this doc** with the new pubkey + rotation date.

**No on-chain change required** — the program doesn't store the server key as an authority. It just verifies that the signer on `create_match` / `settle_match` is a valid signer of the TX.

---

## §6 Recovery Procedures

### Scenario A: JJ's hot signer key is lost or compromised

Threshold is 2-of-3. With JJ's key gone, Fish + Ledger can still sign. Procedure:

1. Fish + JJ confer on a recovery proposal.
2. From Squads UI, Fish + Ledger propose `removeMember(JJ_old_pubkey)` and `addMember(JJ_new_pubkey)`. Both sign.
3. Once executed on-chain, the multisig is JJ-new + Fish + Ledger, threshold 2.
4. JJ destroys the lost key (revoke from any wallet apps).
5. **Update this doc** with the new pubkey + the date of recovery.

### Scenario B: Fish's hot signer key is lost or compromised

Identical procedure to A, with roles swapped.

### Scenario C: Ledger is lost (or Ledger seed phrase compromised)

Ledger is the cold backup. If lost:

1. Procure a fresh Ledger (or use a backup if §3 step 2 was done).
2. Restore the seed phrase onto the fresh device. Verify the derived pubkey matches what's in the multisig.
3. If the seed phrase itself is compromised (not just the device): treat as full compromise. JJ + Fish use their hot signers to `removeMember(Ledger_old_pubkey)` and `addMember(Ledger_new_pubkey)` derived from a fresh seed. New seed phrase backed up offline.

### Scenario D: Two of three signers lost simultaneously

This is catastrophic — Squads CANNOT recover without 2 signatures. The on-chain governance is permanently locked. The program continues to function (operational keys keep working), but no config changes or upgrades can ever happen.

**Mitigation:** never let this happen. Each signer's seed phrase MUST be independently backed up (paper, safe). The probability of simultaneous loss of two physically separate, offline, paper-backed seeds is the bound on this risk.

**If it does happen:** the only path forward is to fork: deploy a new program at a new program ID with new authority, update server env vars to point at the new program, and migrate user balances (impossible for in-flight matches — those funds are permanently locked in the old escrow PDAs).

This scenario is the reason for the Bundle 1 Step 1i `propose_recovery` guardian (deferred from V1 — adds a 7-day timelock recovery path with a 4th key held by a totally separate party). Worth revisiting if the protocol holds significant TVL.

### Scenario E: Server hot key compromised

Follow §5 rotation procedure. Treasury is NOT at risk (gated on Squads). Worst case is an attacker calls `create_match` / `settle_match` / `cancel_match` against the program. Settle requires a winner address — but the winner address comes from on-chain match state, not from the signer, so attacker can't redirect to themselves. Worst-case damage: griefing (force-settling in-flight matches to whichever winner is recorded server-side, which an attacker who controls the server could manipulate). The cost is reputational, not capital.

---

## §7 Anti-Patterns (NEVER do these)

- ❌ **Never commit a keypair file to git.** `.gitignore` covers the names we use, but anyone adding a new keypair must update `.gitignore` for the new name BEFORE saving the file. Git's "untracked, then commit" footgun catches you otherwise. Always `git status` after generating a key.
- ❌ **Never paste a seed phrase into Slack / Telegram / Discord / email / any digital channel.** Paper only. Photographs of paper count as digital.
- ❌ **Never store a seed phrase in a password manager.** Password managers are hot — a compromised laptop reveals them. Paper + safe is the bar.
- ❌ **Never use one keypair for both governance and operations.** If the server compromised, the operational key burns but governance survives. Conflate them = single compromise burns everything.
- ❌ **Never `solana-keygen new` without `--no-bip39-passphrase` flag, unless you're consciously adding a passphrase.** Without the flag, `solana-keygen` prompts interactively and the resulting key may or may not have a passphrase depending on whether you remembered to press enter. Be explicit.
- ❌ **Never run `solana program set-upgrade-authority` against mainnet without dry-running it on devnet first.** The command is irreversible. If you fat-finger the new authority pubkey, the program is permanently locked.
- ❌ **Never sign a Squads proposal without reading the TX detail.** Squads UI shows the proposed instruction. If it doesn't match what you expected (e.g. you expected `transfer` but see `setUpgradeAuthority`), do NOT sign. Phishing exists.
- ❌ **Never assume a Ledger is genuine without verifying.** Buy from ledger.com directly; never from Amazon resellers or eBay. Verify the device's seal on receipt. (JJ's existing fresh Ledgers were procured from official sources — confirm the seal is intact on the chosen device before initialization.)

---

## §8 Change Log

| Date | Change | By |
|---|---|---|
| 2026-05-26 | Initial doc. Generated `solshot-server-authority.json` (pubkey `CgcAZJf6U5LFkUzPRhcx217prT76uUV3vUdae7QU3wmC`). Squads multisig + Ledger purchase pending JJ + Fish coordination. | JJ + Claude (Sprint 1 S1-T4) |
| 2026-05-26 | Cold Ledger initialized from JJ's stash (fresh seed, never reused). Solana app installed + opened on device. Cold signer pubkey: `4XoQgPxxLFNSc19A3TPqpfcvptEQ5g2DYmnaRLkYTFLV`. | JJ |
| 2026-05-26 | Fish provided his mainnet Phantom pubkey for the Squads multisig: `311auAZEvCVX2oBaW7AYMcSnby3UDaTN1uJYuuPWkXwo`. All 3 signers ready; Squads create itself awaits JJ + Fish at the UI together. | Fish (via JJ) |
| 2026-06-04 | **Platform switched v3 → V4.** A live deprecation banner on `v3.squads.so` ("Swaps on v3 are no longer supported, migrate to app.squads.so") surfaced while creating the Squad, so mainnet governance moves to the actively-supported Squads **V4** app (`app.squads.so`, program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`). A throwaway v3 Squad (vault `G6N3…9dfy`, ~0.001 SOL) created during the v3 attempt is abandoned. §1 + §3 updated to V4. | JJ + Claude |
| 2026-06-04 | **Structure changed: one multisig/3 vaults → 3 separate Squads.** V4 paywalls additional vaults per Squad behind the $49/mo Pro plan, so the multi-vault plan would have cost $588/yr. Used three free Basic Squads instead (each ~0.1 SOL one-time deploy), same 2-of-3 signer set, one vault each. | JJ + Claude |
| 2026-06-04 | **Bucket 1 COMPLETE — 3 Squads created + verified on mainnet.** Each 2-of-3 (JJ hot + Fish `311au…` + Ledger `4XoQ…`): **Authority** vault `9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb`, **Treasury** vault `5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE`, **Operations** vault `6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy`. Membership + threshold verified per Squad; live 2-of-3 test send passed on all three (signed JJ-hot + Ledger, confirming the cold recovery key works). Ledger gotchas (Solflare for Ledger-Live path, blind-signing, Nano S size risk) logged in §3 step 8. | JJ + Claude |

When you complete the Squads setup, append a row with the multisig vault PDA + JJ hot pubkey + the create TX hash.
