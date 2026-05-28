# Next Steps Before Mainnet — Session pickup 2026-05-28

Single-page mobile-friendly briefing. Read top-to-bottom.

---

## Where we are

- **Tag:** `v1-mainnet-rc1` at `fabb8e1`
- **HEAD:** `36a0e40` (3 audit-fix commits + comms entry beyond rc1)
- **Devnet status:** ✅ first successful 4P wagered match landed
  - Match `1fcc67c0`, settle TX `3TkVMUUPrTBqfBjcMqeYkHbPfwSErAkPU8KJpkK6W8AceePm23asc9UfYv98HpSqo2xNn5KQAbjnfQGKso1Qdwbo`
  - Pot 0.4 SOL → 0.36 winner / 0.028 treasury / 0.012 ops (90/7/3)
- **Audits all run:** SOS #3 (on-chain), DB #3 (off-chain), GL reconcile (docs). All three verdicts: **CONDITIONAL GO**.

---

## What's left (5 buckets, in order)

### 1. JJ + Fish: Squads multisig (~30 min)

**Where:** https://v3.squads.so → mainnet network
**Who:** JJ + Fish synced up
**Why:** closes the only remaining audit CRITs (H044 single hot wallet L1+L2, H046 bytecode replacement). Nothing else moves until this is done.

**Steps** (full runbook at `Docs/KEY_MANAGEMENT.md` §3):
1. Connect JJ Phantom hot wallet
2. Create Squad: JJ hot + Fish hot + cold Ledger as members, threshold 2
   - Fish pubkey: `311auAZEvCVX2oBaW7AYMcSnby3UDaTN1uJYuuPWkXwo`
   - Cold Ledger pubkey: `4XoQgPxxLFNSc19A3TPqpfcvptEQ5g2DYmnaRLkYTFLV`
3. Squad name: "SolShot Mainnet Governance", Initial vault: "Authority"
4. Add Vault 1 "Treasury" + Vault 2 "Ops" to same Squad
5. Record all 3 vault PDAs (you'll need them in step 4 deploy)
6. Send 0.001 SOL out from each vault as test → confirm 2-of-3 works for all 3 vaults

---

### 2. JJ decisions (5 min — answer these 3)

These block the next steps. Answer here or just tell me when you're back.

**Q1 — CHAIN-N01: client mainnet env vars**
- **Option A:** commit mainnet IDs to `client/.env.production` in the repo
- **Option B:** set them ONLY in Vercel project Environment Variables (recommended — cleaner, no risk of stale repo IDs overriding)

**Q2 — CHAIN-N02: IDL regeneration**
- Mechanical, not really a decision. After N002 (migrate_config deletion) the on-disk IDL is stale. Needs `anchor build` + copy `target/idl/solshot_escrow_v2.json` → `server/idl/`. **Just confirm when you're ready and I'll walk you through it.**

**Q3 — AUTH-N02: wallet-auth replay store**
- The 5-min identity-replay window from H003+H004+H006 composition. ~30 LOC in-memory store closes it cleanly.
- **Option A:** implement now (recommended — closes a CRIT-family chain cheaply)
- **Option B:** accept as residual risk under V1 small-wager scope, deferred to V2

---

### 3. Rebuild + redeploy to devnet (~30 min)

After audit fixes + JJ decisions:

```bash
# From repo root
anchor build
# → catches compile errors on N001/N002/N003
# → regenerates target/idl/solshot_escrow_v2.json (closes CHAIN-N02)

# Copy fresh IDL into server
cp target/idl/solshot_escrow_v2.json server/idl/

# Re-run BOK proptests — must stay 159/159 green
cargo test --manifest-path programs/solshot-escrow-v2/Cargo.toml

# Upgrade devnet bytecode
anchor upgrade target/deploy/solshot_escrow_v2.so \
  --program-id BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
  --provider.cluster devnet

# Re-run 4P playtest one more time on patched code (S2-T8 smoke)
# → verify N001/N002/N003 don't break anything

# Tag rc2
git tag -a v1-mainnet-rc2 -m "Audit fixes landed + devnet re-smoke clean"
git push origin v1-mainnet-rc2
```

---

### 4. Mainnet deploy day (~2 hours)

**Pre-flight checklist** (run morning of flip — full version in `Docs/internal/V1_LAUNCH_SPRINT.md` §4):
- [ ] `v1-mainnet-rc2` tag exists
- [ ] SOS report: zero HIGH/CRITICAL open ✓
- [ ] DB report: zero HIGH/CRITICAL open (assuming N002 + replay store land)
- [ ] Render mainnet env vars staged (not deployed yet)
- [ ] Vercel mainnet env vars staged
- [ ] **Vercel Deployment Protection: DISABLED** (the 3.5-day gotcha — see §4.5)
- [ ] Mainnet RPC chosen (Helius / QuickNode / etc.) + tested
- [ ] Squads multisig + 3 vaults created on mainnet ✓
- [ ] Treasury + Ops vault PDAs funded with ~0.05 SOL each for rent
- [ ] Server keypair `solshot-server-authority.json` on Render disk
- [ ] Bug bounty page drafted

**Deploy sequence:**

```bash
# 1. Update declare_id! in lib.rs to mainnet ID
# programs/solshot-escrow-v2/src/lib.rs line ~36:
#   declare_id!("BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS");

# 2. Build mainnet binary
anchor build

# 3. Deploy with Squads Vault 0 as upgrade authority
solana program deploy \
  --url mainnet-beta \
  --program-id target/deploy/solshot_escrow_v2_mainnet-keypair.json \
  --upgrade-authority <squads_vault_0_pda> \
  target/deploy/solshot_escrow_v2.so

# 4. Verify deploy
solana program show BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS --url mainnet-beta
# → Upgrade Authority should show Vault 0 PDA

# 5. Initialize config — 3 distinct Squads vault PDAs
cd server
ESCROW_PROGRAM_ID_V2=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS \
SOLANA_RPC=https://api.mainnet-beta.solana.com \
SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server-authority.json \
SQUADS_AUTHORITY_PDA=<vault_0_pda> \
SQUADS_TREASURY_PDA=<vault_1_pda> \
SQUADS_OPS_PDA=<vault_2_pda> \
node scripts/init-config-mainnet.mjs
# → dry-run first, review values

# 6. For real
INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE \
ESCROW_PROGRAM_ID_V2=... (same env) ... \
node scripts/init-config-mainnet.mjs

# 7. Flip Render env vars to mainnet:
#    SOLANA_RPC=<mainnet RPC>
#    ESCROW_PROGRAM_ID_V2=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS
#    PRIVY_APP_ID + PRIVY_APP_SECRET already correct
#    Restart Render service

# 8. Flip Vercel env vars to mainnet:
#    REACT_APP_SOLANA_NETWORK=mainnet-beta
#    REACT_APP_ESCROW_V2_PROGRAM_ID=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS
#    REACT_APP_SOLANA_RPC=<mainnet RPC>
#    Trigger Vercel redeploy

# 9. Smoke test — JJ creates 1v1 match at 0.001 SOL wager
#    → if anything off, rollback procedure in §4 of V1_LAUNCH_SPRINT

# 10. Open the gates:
#     - Bug bounty page live (solshot.gg/security or Immunefi)
#     - Tweet / Discord / TG announcement
```

---

### 5. Doc rewrites (parallel, non-blocking)

These can happen any time, don't block the flip. Needs your voice for the user-facing tone:

| Doc | Effort | What |
|---|---|---|
| `SolShot_Litepaper_v2.2.md → v2.3` | ~2h | Rewrite SHOT section (off-chain), clamp 10P → 4P, update Squads/audit/deploy claims |
| `security-model.md` | ~1h | Add Bundle 1 governance + audit #3 results |
| `mainnet-roadmap.md` | ~30min | V1 scope + pre-flip checklist |
| `architecture.md` | ~30min | Match current code reality |
| `one-pager.md` | ~15min | Refresh pitch |
| `how-to-play.md` | ~15min | Verify wager mechanics |
| `crypto-explainer.md` | ~15min | SHOT framing |
| `competitive-landscape.md` | ~30min | Refresh |

Per-doc line-numbered stale claims at `Docs/internal/DOC_RECONCILE_2026-05-28.md`.

---

## Total wall-clock estimate

**~6-8 hours from rc1 to live mainnet.** Long pole is Squads multisig (~30 min real time but needs Fish synced).

---

## What I (Claude) can do for you remotely

If you're on phone/iPad via Claude Code remote-control, I can:
- Answer questions about any of the audit reports (read `.audit/FINAL_REPORT.md`, `.bulwark/FINAL_REPORT.md`, `Docs/internal/DOC_RECONCILE_2026-05-28.md`)
- Apply any of the deferred fixes (AUTH-N02 replay store, CHAIN-N01 env vars, doc rewrites)
- Walk you through `anchor build` errors
- Diagnose Render/Vercel deployment issues by reading logs
- Build the smoke-test sequence
- Help draft the launch tweet / Discord / TG announcement

**What I can't do without you:**
- Open a browser to v3.squads.so (you need to do the Squads UI)
- Sign on the Ledger
- Trigger Render/Vercel env var changes (you do these in their dashboards)
- Run `anchor build` (needs the toolchain on your machine)
- Actually call `solana program deploy --provider.cluster mainnet` (needs your signature)

---

## Quick reference

- **SOS audit report:** `.audit/FINAL_REPORT.md`
- **DB audit report:** `.bulwark/FINAL_REPORT.md`
- **Doc reconcile:** `Docs/internal/DOC_RECONCILE_2026-05-28.md`
- **V1 launch sprint master:** `Docs/internal/V1_LAUNCH_SPRINT.md`
- **Key management runbook:** `Docs/KEY_MANAGEMENT.md`
- **Inter-agent comms:** `Docs/internal/CLAUDE_COMMS.md` (most recent entry has full session capture)

---

When you're back at the keyboard, just say "ready to keep going" and tell me which bucket (1-5) you want to tackle first. If you want me to start something autonomously (e.g. draft the AUTH-N02 replay store + open a PR for review), just say so.
