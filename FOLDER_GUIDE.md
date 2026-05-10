# SolShot — Folder Guide

> Last updated: 2026-05-10 (post-merge: `.docs/` content folded into `Docs/`).

This guide explains every top-level directory and the front-of-house / back-of-house split. If you're a new contributor or a hackathon judge, **read [`README.md`](README.md) first** — it's the proper landing doc with curated links into the most relevant material.

---

## The split

| Tier | Where | Who reads it |
|---|---|---|
| **Front of house** | `README.md`, `Docs/`, `.audit/`, `.bok/`, `.bulwark/` | Judges, contributors, new players |
| **Back of house** | `Docs/internal/` | The dev team |
| **Archived** | `_archive/superseded-docs/` | Historical reference only |

If a doc isn't worth a stranger reading, it lives in `Docs/internal/`. If a doc is genuinely stale, it lives in `_archive/`. Anything left in `Docs/` (or referenced from `README.md`) should be polished and current.

---

## Top-level layout

```
SolShot/
├── README.md                     # Project overview + curated doc index
├── LICENSE                       # MIT
├── FOLDER_GUIDE.md               # This file
├── Anchor.toml, Cargo.toml/.lock, package.json, tsconfig.json, render.yaml
│
├── client/                       # React + Phaser PWA (Vercel)
├── server/                       # Node + Express + Socket.IO (Render)
├── programs/                     # Anchor on-chain programs (escrow v1 + v2)
├── tests/                        # Anchor TypeScript test suite
├── tools/                        # One-shot scripts (terrain bake, stat-card preview)
│
├── Docs/                         # All public-facing project docs
│   ├── README.md                 # Doc-index (auto-renders when you click into Docs/)
│   ├── one-pager.md              # 90-second pitch
│   ├── how-to-play.md            # Player guide
│   ├── ROADMAP.md                # Forward-looking 5-phase plan
│   ├── SolShot_Litepaper_v2.2.md # Canonical project spec
│   ├── SolShot_Litepaper_v2.2.pdf# Same content, share-friendly format
│   ├── SHOT_TOKEN_MODEL.md       # Token economics
│   ├── architecture.md           # System architecture
│   ├── security-model.md         # Trust boundaries + key custody
│   ├── audit-summary.md          # Summary across the three audits
│   ├── mainnet-roadmap.md        # Remediation bundles before mainnet
│   ├── crypto-explainer.md       # Crypto-newcomer onboarding
│   ├── competitive-landscape.md  # Market positioning
│   ├── edge-case-playbook.md     # Operational edge cases
│   ├── blog/                     # Marketing copy ready to publish
│   └── internal/                 # Team operations — see "Back of house" below
│
├── .audit/                       # SVK on-chain audit (SOS) output
├── .bok/                         # SVK math-invariants audit (BOK) output
├── .bulwark/                     # SVK off-chain audit (DB) output
│
├── Assets/                       # Game assets (logos, badges, weapon icons, screenshots)
├── dapp-store/                   # Solana dApp Store listing config
└── _archive/                     # Superseded / pre-pivot docs and historical artefacts
```

---

## The three SVK audit folders

These look unusual at the root because they're tool-generated outputs. Naming convention is set by the [Solana Vibes Kit](https://github.com/MetalegBob) — keeping the dot-prefix makes them easy to grep and easy to regenerate via `/SOS:scan`, `/BOK:scan`, `/DB:scan`.

| Folder | What it is | Headline file |
|---|---|---|
| `.audit/` | SOS — on-chain Anchor program audit | `.audit/FINAL_REPORT.md` |
| `.bok/` | BOK — math invariants (settlement, fees, refunds), 159 verification tests | `.bok/reports/...` |
| `.bulwark/` | DB — off-chain server audit (auth, signing, Privy integration) | `.bulwark/FINAL_REPORT.md` |

The Grand Library skill (`/GL:survey`) historically wrote to `.docs/`. As of the 2026-05-10 pre-submission cleanup, those outputs were merged into `Docs/` so all public-facing markdown lives in one place. Future GL refreshes write directly into `Docs/`.

The `*-history/` siblings (`.audit-history/`, `.bulwark-history/`) and the `.planning/`, `.claude/`, `.agents/` directories are **gitignored**. They exist on disk for the dev team but never get committed.

---

## Front of house — `Docs/`

All public-facing project documentation. Order to read it in:

1. `Docs/one-pager.md` — start here
2. `Docs/how-to-play.md` — player guide
3. `Docs/ROADMAP.md` — forward-looking plan
4. `Docs/SolShot_Litepaper_v2.2.md` — full project spec
5. `Docs/SHOT_TOKEN_MODEL.md` — token economics

Plus deeper-context companions: `architecture.md`, `security-model.md`, `audit-summary.md`, `mainnet-roadmap.md`, `crypto-explainer.md`, `competitive-landscape.md`, `edge-case-playbook.md`.

`Docs/blog/` holds polished marketing copy ready to publish (`BLOG_WHAT_IS_SOLSHOT.md`, `BLOG_HOW_WAGERING_WORKS.md`).

---

## Back of house — `Docs/internal/`

Team-facing docs. Not stale, just not curated for a public audience.

Includes:

- **Comms / decisions / questions:** `CLAUDE_COMMS.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `PROJECT_BRIEF.md`
- **Audit fix decisions:** `REMEDIATION_DECISIONS.md`, `DB_REMEDIATION_DECISIONS.md`, `PRIOR_AUDIT_DELTA.md`
- **Internal audits:** `AUDIT_2026-05-06_iOS_render_regression.md`, `MOBILE_AUDIT_2026-05-08.md`
- **QA + ops:** `PRE_SUBMISSION_QA_v2.md`, `EXECUTION_CHECKLIST_audit_sweep.md`
- **Demo + pitch recording:** `DEMO_VIDEO_CUE_CARDS.md`, `DEMO_VIDEO_SCRIPT_v2.md`, `PITCH_VIDEO_SCRIPT.md`, `PITCH_VIDEO_CUE_CARDS.md`
- **Setup + deploy guides:** `TELEGRAM_PLAN.md`, `TELEGRAM_SETUP.md`, `DAPP_STORE_SETUP.md`, `SOLSHOT_DISCORD_PLAN.md`, `deployment-sequence.md`
- **Launch ops (current era):** `MASTER_LAUNCH_PLAN.md`, `LAUNCH_CHECKLIST.md`, `SOLSHOT_P1_LAUNCH.md`, `HACKATHON_SCOPE.md`, `solshot_frontier_execution_plan.md`, `TODO.md`
- **Specs (current era):** `SOLSHOT_STAT_CARD_SPEC.md`, `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md`, `SOLSHOT_ASSET_MASTER_v2.md`, `SolShot_Weapon_Rebalance_Spec_v2.md`, `GROUP_CHAT_MODE.md`
- **Prompts:** `SOLSHOT_GPT_ART_PROMPTS.md`, `STARTER_PROMPTS.md`
- **Briefs:** `briefs/proofreading-guide-remove-ai-tells.md`

---

## `_archive/superseded-docs/`

Historical reference. Everything here is **stale, pre-pivot, or superseded**. Nothing in this folder reflects current code or current strategy. Kept for git history and provenance.

Subfolders:

- `launch-feb18/` — pre-pivot launch checklists (Feb 18 era)
- `specs-feb18/` — pre-pivot specs (privacy template, terms template, press kit, design control v1, build doc v1, GSD spec v1)
- `wallet-research/` — wallet architecture research artefacts (Privy was picked + shipped)
- `escrow-research/` — N-player escrow research artefacts (escrow-v2 was built + shipped)
- `audio-briefs/` — one-shot music selection tool + briefs
- `gl-decisions-feb24/` — Grand Library Feb 24 stub files (superseded by May 7 refresh, then folded into `Docs/` in the May 10 merge)
- `old-plans/` — dated planning docs whose work has shipped

Plus loose files: `SOLSHOT_CODEBASE_AUDIT.md`, `SOLSHOT_REACT_MIGRATION_SPEC.md`, `SESSION_HANDOFF_2026-04-30.md`, `solshot_v5.jsx`, `solshot-landing-v2.html`.

---

## Other root directories

| Directory | Purpose |
|---|---|
| `Assets/` | Game art, weapon logos, badges, tank sprites, screenshots, archive of older asset versions |
| `dapp-store/` | Solana dApp Store listing config (`config.yaml`) |
| `Marketing/`, `Handoffs/`, `BATTLE/` | Gitignored — large media stored externally (Drive/S3) |

---

## Conventions for future contributors

1. **New public-facing doc?** → drop it in `Docs/` directly.
2. **New team-only doc?** → `Docs/internal/`.
3. **Doc went stale?** → move to `_archive/superseded-docs/` (don't delete — preserves history).
4. **Audit re-run?** → SOS / BOK / DB skills write to `.audit/`, `.bok/`, `.bulwark/`. Don't move those paths or the skills will recreate them.
5. **GL re-run?** → as of the May 10 merge, GL outputs land directly in `Docs/`. If a future GL run writes to `.docs/` again (skill regression), re-run the merge.
6. **Don't track local agent state.** `.claude/`, `.planning/`, `.agents/`, `*-history/` are gitignored for a reason.
