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
| **Squads multisig** | Upgrade authority + config authority + treasury + ops fee destination | On-chain PDA (Squads v3 program `SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu`) | Highest. Can redeploy programs, rotate config, drain fee destinations. | Via Squads UI (add/remove signers, change threshold) |
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
- At mainnet deploy: `anchor deploy --provider.cluster mainnet --upgrade-authority <squads-pda>`. Layer 1 = multisig from genesis.
- Immediately after deploy: server calls `initialize_config(authority: <squads-pda>, treasury: <squads-pda>, ops: <squads-pda>, ...)`. Layer 2 + fee destinations = multisig from genesis.
- The original deployer keypair is **never the authority** at any point.

This eliminates:
- The "rotation window" attack — between deploy-with-hot-key and rotate-to-multisig, the hot key briefly has god-mode. Day-one multisig closes this window.
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

5. **Create the multisig.** Go to https://v3.squads.so/ on **mainnet** (top-right network selector). Connect JJ's hot wallet (Phantom). Click "Create Squad":
   - **Members:** JJ hot pubkey, Fish hot pubkey, Ledger cold pubkey (3 total)
   - **Threshold:** 2 (any 2 of 3 must sign)
   - **Squad name:** "SolShot Mainnet Governance"
   - **Vault name:** "SolShot Treasury"
   - **Initial deposit:** ~0.05 SOL (covers rent + first few TX fees)

6. **Record the multisig vault PDA.** Squads shows it on the Squad detail page. This pubkey is the value you pass to:
   - `anchor deploy --upgrade-authority <THIS PDA>`
   - `initialize_config(authority: <THIS PDA>, treasury: <THIS PDA>, ops: <THIS PDA>, ...)`

7. **Test the multisig with a no-op TX.** Create a proposal that sends 0.001 SOL from the vault to JJ's hot wallet. JJ signs, Fish signs, executes. Confirm SOL moves on-chain. This validates the 2-of-3 flow works before you bet the program on it.

8. **Lock down access:**
   - Confirm JJ and Fish each have their hot signer seed phrases backed up (paper, offline)
   - Lock the Ledger in a safe / safety deposit box
   - Document each signer's recovery procedure in their personal records (separate from this repo)

**Estimated time:** 1–2 hours including the test TX. Most of it is the seed-phrase paper-trail discipline. The Ledger initialization + Squads UI itself is ~30 minutes.

---

## §4 Mainnet Deploy Procedure (uses Squads from genesis)

After §3 is complete and the multisig vault PDA is known:

```bash
# Build mainnet binary
anchor build

# Deploy with Squads as upgrade auth from genesis
solana program deploy \
  --url mainnet-beta \
  --program-id <v2_program_id> \
  --upgrade-authority <squads_vault_pda> \
  target/deploy/solshot_escrow_v2.so

# Verify upgrade authority
solana program show <v2_program_id> --url mainnet-beta
# → "Upgrade Authority" should show the Squads vault PDA
```

Then initialize the config via the server (server keypair signs `initialize_config`, but passes Squads PDA as the `authority` argument):

```bash
# From server/ — uses solshot-server-authority.json
node scripts/init-config-mainnet.mjs \
  --authority <squads_vault_pda> \
  --treasury <squads_vault_pda> \
  --ops <squads_vault_pda> \
  --fee-bps-treasury 700 \
  --fee-bps-ops 300
```

(The `init-config-mainnet.mjs` script is a S2 / pre-flip deliverable — TBD path.)

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

When you complete the Squads setup, append a row with the multisig vault PDA + JJ hot pubkey + the create TX hash.
