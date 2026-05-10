# Audit Sweep Execution Checklist

> Internal reference doc. Written by Claude for Claude — sequence to follow when JJ greenlights post-recording.

## Prerequisites — VERIFIED

- ✅ `solana-vibes-kit` cloned to `~/SolShot/../solana-vibes-kit`
- ✅ Rust toolchain present (cargo 1.93.0, rustc 1.93.0)
- ❌ Kani NOT installed (Windows can't install — depends on `std::os::unix`). BOK runs in **degraded mode** like prior Feb run. Outcome: HIGH-CONFIDENCE PROBABILISTIC instead of PROVEN.
- ✅ Anchor programs at `programs/solshot-escrow/` (v1, 962 LOC) + `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC)
- ✅ Cargo workspace has both programs registered
- ✅ Anchor.toml has program IDs configured
- ⚠️ No LICENSE file (add MIT / similar before publishing as judge-ready)

## Prior audit baselines — DO NOT IGNORE

There are existing audit artifacts from late February. They were on the **v1-only** code, before group-chat / v2 escrow / Privy migration / today's auth fix.

| Skill | Path | Date | Tier | Status |
|---|---|---|---|---|
| SOS | `.audit/` | 2026-02-23 | quick | 12 confirmed vulns, 3 CRITICAL (S001, S004, H001) — centralization + access control. Need to verify these were fixed. |
| BOK | `.bok/` | 2026-02-23 | n/a | 25 invariants verified, 1 finding (FEE-INV-5: dust ≤ 2 lamports). 59/59 tests passing. Tests merged into `programs/solshot-escrow/tests/bok_*.rs`. |
| DB | `.bulwark/` | 2026-02-24 | deep | Need to read findings before re-run. |

**Action before re-running anything:**
1. Read each prior `FINAL_REPORT.md` to extract findings list
2. For each finding, search current code to confirm fix landed (or note still-open)
3. Document this as a "delta since Feb audit" file so the new audit can focus on new code (v2 escrow, group-chat, Privy auth, today's fixes)

## Step-by-step execution

### Phase 0 — Pre-flight (~30 min)

1. **Confirm working tree clean.** `git status` should show no uncommitted real changes (just `.claude/settings.local.json` which is local). Untracked dirs are fine for audit but should be addressed before final cleanup.
2. **Read prior audit reports**, write a `Docs/internal/PRIOR_AUDIT_DELTA.md` listing:
   - Feb SOS findings + current status (fixed / open / partially)
   - Feb BOK findings + current status
   - Feb DB findings + current status
3. **Tag current state** as `pre-audit-sweep-2026-XX-XX` so we have a rollback if any audit's auto-fix accidentally touches code.

### Phase 1 — Light cleanup before audit (~1 hr)

The repo has cruft that'll create noise in audit findings. Before running, do a **conservative** cleanup — only what won't change behavior.

**Add to `.gitignore`:**
```
.audit/
.bok/
.bulwark/
.anchor/
.agents/
.claude/scheduled_tasks.lock
.design-canvas.state.json
```

**Delete (untracked, dead):**
- Root `src/` (old design exploration JSX, not the live React app — that's `client/src/`)
- Root `styles/` (1 file, unused)
- Root `mobile/` (5 mobile JSX prototypes, unused)
- Root `bobs-bazaar/` (1 tracked file, dead)
- Root `dapp-store/` (4KB, dead)
- `Transcript chat with Fish.txt` (move to `_archive/`)
- `converted-repo.txt` (2MB, code dump)
- `SolShot_Redesign.html` (50MB, design mockup, move to `_archive/`)
- `SOLSHOT_DESIGN_CONTROL (1).md` (the `(1)` indicates a Windows duplicate)

**Move (preserve, just relocate):**
- `DAPP_STORE_SETUP.md` → `Docs/`
- `FOLDER_GUIDE.md` → `Docs/`
- `LAUNCH_CHECKLIST.md` → `Docs/`
- `SolShot_Litepaper_v2.0.md` → `Docs/` (or delete since v2.1 supersedes)
- `SolShot_Litepaper_v2.1.md` → `Docs/`
- `SOLSHOT_P1_LAUNCH.md` → `Docs/`
- `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md` → `Docs/`
- `SOLSHOT_STAT_CARD_SPEC.md` → `Docs/`
- `SolShot_Weapon_Rebalance_Spec_v2.md` → `Docs/`
- `TELEGRAM_SETUP.md` → `Docs/`
- `generate-terrain-textures.js` → `tools/`
- `stat-card-preview.html` → `tools/preview/`

**Add LICENSE file** (MIT or similar, JJ to confirm).

**Massive untracked dirs that should be moved off-repo:**
- `Marketing/` (1.2GB) — move to external storage, add to `.gitignore`
- `Handoffs/` (168MB) — move to external storage or `_archive/`

Commit cleanup as one commit titled `chore(repo): pre-audit cleanup pass — root tidy + .gitignore`. Tag as `clean-repo-pre-audit`.

### Phase 2 — Install audit skills (~5 min)

```bash
cd ../solana-vibes-kit/stronghold-of-security && ./install.sh ~/SolShot
cd ../book-of-knowledge && ./install.sh ~/SolShot
cd ../dinhs-bulwark && ./install.sh ~/SolShot
cd ../grand-library && ./install.sh ~/SolShot
```

This populates `.claude/skills/{stronghold-of-security,book-of-knowledge,dinhs-bulwark,grand-library}/` and `.claude/commands/{SOS,BOK,DB,GL}/`. Updates `svk-meta.json` with versions for update tracking.

### Phase 3 — SOS run (~2-3 hours, with /clear between phases)

**On both v1 + v2 escrow programs.** SOS auto-detects multi-program workspaces.

```
/SOS:scan          # auto-detects tier (likely "standard" given the LOC + protocol type)
/clear
/SOS:analyze       # 8 parallel auditors, deep dive
/clear
/SOS:strategize    # synthesize, generate 50+ attack hypotheses
/clear
/SOS:investigate   # priority-ordered batches
/clear
/SOS:report        # FINAL_REPORT.md
```

Each phase produces files in `.audit/`. **Read between phases** to make sure the auditors haven't gone off the rails. Output is the report — JJ reads, prioritizes findings, we fix together, then `/SOS:verify`.

### Phase 4 — BOK run (~2 hours, parallel-safe with SOS)

```
/BOK:scan          # checks for Kani — will report degraded mode
/BOK:analyze       # invariant proposal
/BOK:confirm       # interactive — JJ reviews invariants, confirms or skips
/BOK:generate      # writes test files into programs/solshot-escrow*/tests/
/BOK:execute       # runs Proptest + LiteSVM (no Kani)
/BOK:report        # final report
```

Note: BOK already has 25 verified invariants on v1 from Feb. Re-run will likely confirm those + add new invariants for v2.

### Phase 5 — DB run (~2-3 hours)

```
/DB:scan
/clear
/DB:analyze
/clear
/DB:strategize
/clear
/DB:investigate
/clear
/DB:report
```

Targets the off-chain code: `server/`, `client/`. Will catch the kind of bug we hit today (auth-on-reconnect race, identity validation, socket auth state). Findings will inform server-side refactors.

### Phase 6 — Address findings (~variable, depends on count)

After SOS + BOK + DB reports, JJ + I work through them in priority order. CRITICAL findings block mainnet. HIGH findings should be fixed pre-launch. MEDIUM/LOW can ship as known issues with mitigations.

For each fix:
- Make the change
- Run targeted local test
- Commit with `fix(audit): <FINDING-ID> — <description>`
- After all fixes in a category: re-run `/SOS:verify` / `/BOK:execute` / `/DB:verify` to confirm

### Phase 7 — Grand Library docs sweep (~1-2 hours)

```
/GL:survey         # discovers project, plans doc set
/GL:interview      # Q&A on design decisions
/GL:draft          # generates spec docs (uses Opus)
/GL:reconcile      # checks consistency across docs
```

Inputs to feed it:
- The reconciled audit reports from Phase 6
- The verified BOK invariants
- Existing litepaper drafts (`SolShot_Litepaper_v2.0.md`, `v2.1.md`) — GL should reconcile these
- TX hashes of devnet settled matches as proof points
- The architecture diagrams from `Docs/SESSION_HANDOFF_2026-04-30.md`

Output: clean docs/ folder with technical spec, architecture, security posture statement, public-ready material.

### Phase 8 — Final repo polish (~30 min)

After GL produces clean docs:
- Update README.md to be a punchy product page (current is a textbook)
- Add 1-2 GIFs showing gameplay
- Add devnet program addresses + Solscan links for verification
- Add audit summary section ("Verified by SOS, BOK, DB — see Docs/audits/")
- Tag a release: `v0.1-devnet-audited`

### Phase 9 — Loom 2-min pitch deck (~1 hour)

5 slides max:
1. Hook + product (10s)
2. Live demo via screen-share embed (60-90s)
3. Traction + proof points (TX hashes, audit summary) (20-30s)
4. Team (10s)
5. Ask + close (10s)

Draft slide content as markdown bullets, JJ converts to actual slides in his deck tool of choice.

## Estimated total: 10-15 hours, spread across multiple sessions

The cleanup + audit + docs + repo polish is ~2-3 working days if done sequentially with quality. Can be parallelized somewhat (BOK runs while SOS investigates; DB runs while BOK reports).

## Open questions for JJ when he's back

1. **Kani install attempt?** WSL2 setup is ~30 min and would unlock formal proofs (PROVEN tier instead of HIGH-CONFIDENCE PROBABILISTIC). Worth it for credibility, or skip and stay in degraded mode like Feb?
2. **Marketing/ folder relocation** — where to put 1.2GB? S3? Drive? Git LFS? Or just `.gitignore` and host elsewhere?
3. **Handoffs/ — keep history or archive?** Has historical context but adds 168MB to repo size.
4. **Cleanup commit granularity** — one big "pre-audit cleanup" commit, or split into multiple (gitignore, deletions, moves, license)?
