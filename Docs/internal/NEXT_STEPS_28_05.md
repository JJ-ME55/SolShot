# Next Steps Before Mainnet — Session pickup 2026-05-28

Single-page mobile-friendly briefing. Read top-to-bottom.

> **Update at end of 2026-05-28 session:** several buckets advanced. Diff
> summary at the bottom under "What landed since rc1."

---

## Where we are

- **Tag:** `v1-mainnet-rc1` at `fabb8e1`
- **HEAD:** ahead of rc1 by audit fixes + auth replay store + IDL regen + script guards + doc reconcile
- **Devnet status:** ✅ first successful 4P wagered match landed
  - Match `1fcc67c0`, settle TX `3TkVMUUPrTBqfBjcMqeYkHbPfwSErAkPU8KJpkK6W8AceePm23asc9UfYv98HpSqo2xNn5KQAbjnfQGKso1Qdwbo`
  - Pot 0.4 SOL → 0.36 winner / 0.028 treasury / 0.012 ops (90/7/3)
- **Audits all run:** SOS #3 (on-chain), DB #3 (off-chain), GL reconcile (docs). All three verdicts: **CONDITIONAL GO**.

---

## What's left (5 buckets, in order)

### 1. JJ + Fish: Squads multisig (~30 min) — STILL BLOCKING

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

### 2. JJ decisions — Q1 + Q3 DONE; Q2 (IDL) DONE autonomously

**Q1 — CHAIN-N01: client mainnet env vars — RESOLVED.**
Option B (Vercel-only) applied. Devnet IDs stripped from `client/.env.production`; convention comment in the file documents that Vercel project Environment Variables are now sole source of truth for `REACT_APP_ESCROW_*_PROGRAM_ID` and `REACT_APP_SOLANA_RPC`. JJ still needs to **key the mainnet values into the Vercel dashboard before flip**.

**Q2 — CHAIN-N02: IDL regeneration — RESOLVED.**
`anchor build` ran cleanly on JJ's box. `target/idl/solshot_escrow_v2.json` copied into `server/idl/solshot_escrow_v2.json`; `migrate_config` discriminator gone (was the audit's concern). `target/idl/solshot_escrow.json` (v1) also re-synced.

**Q3 — AUTH-N02: wallet-auth replay store — RESOLVED.**
Option A applied. In-memory `Map<signature, expiresAt>` replay store added to `server/middleware/auth.js`, runs after sig verifies inside `handleAuthenticate`. Lazy sweep at >1024 entries. Smoke-tested.

---

### 3. Rebuild + redeploy to devnet (~15 min) — PARTIAL

After audit fixes + JJ decisions:

```bash
# From repo root
anchor build  # ✓ DONE — finished clean
cp target/idl/solshot_escrow_v2.json server/idl/  # ✓ DONE
cp target/idl/solshot_escrow.json server/idl/  # ✓ DONE

# BOK proptests — ✓ DONE, 48 #[test] fns all green
cargo test --manifest-path programs/solshot-escrow-v2/Cargo.toml

# Upgrade devnet bytecode — STILL TODO (needs JJ on the keyboard + wallet)
anchor upgrade target/deploy/solshot_escrow_v2.so \
  --program-id BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
  --provider.cluster devnet

# Re-run 4P playtest one more time on patched code (S2-T8 smoke) — STILL TODO
# → verify N001/N002/N003 don't break anything

# Tag rc2 — STILL TODO (after devnet smoke clean)
git tag -a v1-mainnet-rc2 -m "Audit fixes landed + auth replay store + script guards + IDL re-sync"
git push origin v1-mainnet-rc2
```

---

### 4. Mainnet deploy day (~2 hours) — UNCHANGED

**Pre-flight checklist** (run morning of flip — full version in `Docs/internal/V1_LAUNCH_SPRINT.md` §4):
- [ ] `v1-mainnet-rc2` tag exists
- [ ] SOS report: zero HIGH/CRITICAL open ✓
- [ ] DB report: zero HIGH/CRITICAL open (AUTH-N02 + CHAIN-N01 + CHAIN-N02 closed) ✓
- [ ] Render mainnet env vars staged (not deployed yet)
- [ ] Vercel mainnet env vars staged (per Q1 resolution — Vercel-only is now the convention)
- [ ] **Vercel Deployment Protection: DISABLED** (the 3.5-day gotcha — see §4.5)
- [ ] Mainnet RPC chosen (Helius / QuickNode / etc.) + tested
- [ ] Squads multisig + 3 vaults created on mainnet ✓ (Bucket 1)
- [ ] Treasury + Ops vault PDAs funded with ~0.05 SOL each for rent
- [ ] Server keypair `solshot-server-authority.json` on Render disk
- [ ] Bug bounty page drafted

**Deploy sequence:** unchanged from prior version of this doc. See `V1_LAUNCH_SPRINT.md` §4 for the runbook.

---

### 5. Doc rewrites — MECHANICAL SUBSET DONE; VOICE-DEPENDENT SUBSET PENDING

| Doc | Status |
|---|---|
| `one-pager.md` | ✓ done — line edits to SHOT row, program IDs, By-the-numbers |
| `competitive-landscape.md` | ✓ done — Differentiator #4 reframed, table row updated, multisig phrasing |
| `crypto-explainer.md` | ✓ done — player count + treasury reward-pool framing |
| `how-to-play.md` | ✓ done — player count, "burn"→"spend" softening, Jupiter ticker retired |
| `architecture.md` | ✓ done — SHOT row, mainnet program ID, 3-vault Squads block, Bundle 1 LANDED |
| `audit-summary.md` | ✓ done — appended "Audit Pass 3 (2026-05-28)" section + new verdict |
| `Docs/README.md` | ✓ done — nav entry for SHOT model |
| `SHOT_TOKEN_MODEL.md` | ✓ already a stub (`Docs/SHOT_TOKEN_MODEL.md`) |
| **`SolShot_Litepaper_v2.2.md → v2.3`** | **STILL TODO (~2h, needs JJ voice for §08 + §09 + §11 rewrite)** |
| **`security-model.md`** | **STILL TODO (~1h, needs JJ voice for Bundle 1 LANDED status + audit #3 narrative)** |
| **`mainnet-roadmap.md`** | **STILL TODO (~1.5h, needs JJ voice for v1-retired-from-mainnet decision narrative)** |

Per-doc line-numbered stale claims at `Docs/internal/DOC_RECONCILE_2026-05-28.md`.

---

## Total wall-clock estimate

**~3-5 hours from current HEAD to live mainnet** (long pole is Squads multisig with Fish; doc rewrites can run in parallel to mainnet deploy).

---

## What I (Claude) can do for you remotely

Same as before:
- Answer questions about any of the audit reports
- Walk you through anchor upgrade errors
- Diagnose Render/Vercel deployment issues by reading logs
- Help draft the launch tweet / Discord / TG announcement

**What I can't do without you:**
- Open a browser to v3.squads.so (you need to do the Squads UI)
- Sign on the Ledger
- Trigger Render/Vercel env var changes (you do these in their dashboards)
- Actually call `solana program deploy --provider.cluster mainnet` (needs your signature)
- Actually call `anchor upgrade` on devnet (needs your signature)

---

## Quick reference

- **SOS audit report:** `.audit/FINAL_REPORT.md`
- **DB audit report:** `.bulwark/FINAL_REPORT.md`
- **Doc reconcile:** `Docs/internal/DOC_RECONCILE_2026-05-28.md`
- **V1 launch sprint master:** `Docs/internal/V1_LAUNCH_SPRINT.md`
- **Key management runbook:** `Docs/KEY_MANAGEMENT.md`
- **Inter-agent comms:** `Docs/internal/CLAUDE_COMMS.md` (most recent entry has full session capture)

---

## What landed since rc1 (2026-05-28 evening session)

Three commits beyond `fabb8e1`:
- `b941b3b` + `c4371ec` + `0572635` — original audit-fix bundle (CHAIN-N03/N04, AUTH-N03, DATA-N01)
- `e7098d7` + `36a0e40` — doc reconcile + comms entry
- `3762389` — this doc (initial version)
- `d5cbf18` — **AUTH-N02 replay store + CHAIN-N01 env clean**
- `af96baf` — **7 public doc reconciliation edits**
- (pending commit) — **IDL re-sync + script guards for accept-authority-v2 + update-config-v2 + apply-config-update-v2 + `_op_guards.mjs` helper**

Closed CRITs/HIGHs in this session: AUTH-N02, CHAIN-N01, CHAIN-N02, plus operator-compromise hardening on 3 sibling ops scripts.

When you're back at the keyboard, just say "ready to keep going" and tell me which bucket (1-5) you want to tackle first. The next blocker is **Squads multisig with Fish (Bucket 1)** — everything else is either done or downstream of that.
