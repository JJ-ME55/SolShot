# SolShot — Folder Guide

> Last updated: 2026-05-10 (post pre-submission reorg).

This guide explains every top-level directory and the front-of-house / back-of-house split. If you're a new contributor or a hackathon judge, **read [`README.md`](README.md) first** — it's the proper landing doc with curated links into the most relevant material.

---

## The split

| Tier | Where | Who reads it |
|---|---|---|
| **Front of house** | `README.md`, `Docs/` (root), `.docs/`, `.audit/`, `.bok/`, `.bulwark/` | Judges, contributors, new players |
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
├── Docs/                         # Public-facing project docs (front of house)
│   ├── SolShot_Litepaper_v2.2.md  # Canonical spec
│   ├── SolShot_Litepaper_v2.2.pdf # Litepaper PDF export (same content as the .md)
│   ├── SHOT_TOKEN_MODEL.md        # Token model (distribution, emissions, burns)
│   ├── blog/                      # Marketing copy ready to publish
│   └── internal/                  # Team operations — see "Back of house" below
│
├── .audit/                       # SVK on-chain audit (SOS) output
├── .bok/                         # SVK math-invariants audit (BOK) output
├── .bulwark/                     # SVK off-chain audit (DB) output
├── .docs/                        # SVK Grand Library (GL) output (architecture, one-pager, etc.)
│
├── Assets/                       # Game assets (logos, badges, weapon icons, screenshots)
├── dapp-store/                   # Solana dApp Store listing config
└── _archive/                     # Superseded / pre-pivot docs and historical artefacts
```

---

## The four SVK audit folders

These look unusual at the root because they're tool-generated outputs. Naming convention is set by the [Solana Vibes Kit](https://github.com/MetalegBob) — keeping the dot-prefix makes them easy to grep and easy to regenerate via `/SOS:scan`, `/BOK:scan`, `/DB:scan`, `/GL:survey`.

| Folder | What it is | Headline file |
|---|---|---|
| `.audit/` | SOS — on-chain Anchor program audit | `.audit/FINAL_REPORT.md` |
| `.bok/` | BOK — math invariants (settlement, fees, refunds), 159 verification tests | `.bok/reports/...` |
| `.bulwark/` | DB — off-chain server audit (auth, signing, Privy integration) | `.bulwark/FINAL_REPORT.md` |
| `.docs/` | GL — Grand Library project documentation pipeline | `.docs/one-pager.md`, `.docs/how-to-play.md`, `.docs/audit-summary.md`, `.docs/mainnet-roadmap.md` |

The `*-history/` siblings (`.audit-history/`, `.bulwark-history/`) and the `.planning/`, `.claude/`, `.agents/` directories are **gitignored**. They exist on disk for the dev team but never get committed.

---

## Front of house — what judges and contributors read

### `Docs/` (root)

| File | Purpose |
|---|---|
| `SolShot_Litepaper_v2.2.md` | Canonical project spec — vision, distribution, on-chain programs, security posture, what we're shipping vs deferring |
| `SolShot_Litepaper_v2.2.pdf` | Litepaper PDF export for sharing (same content as the .md, share-friendly format) |
| `SHOT_TOKEN_MODEL.md` | SHOT token economics — distribution, emissions, burns, scarcity analysis |

### `Docs/blog/`

Polished marketing copy ready to publish.

| File | Purpose |
|---|---|
| `BLOG_WHAT_IS_SOLSHOT.md` | Explainer post: what SolShot is |
| `BLOG_HOW_WAGERING_WORKS.md` | Explainer post: how on-chain wagering and settlement work |

### `.docs/` — Grand Library output

The GL pipeline produces these. They're current as of the May 7 refresh.

| File | Purpose |
|---|---|
| `one-pager.md` | 90-second pitch |
| `how-to-play.md` | Player guide (every match type, every weapon) |
| `architecture.md` | System architecture |
| `security-model.md` | Security model and trust boundaries |
| `audit-summary.md` | Top-line summary across all three audits |
| `mainnet-roadmap.md` | Remediation bundles required before mainnet |
| `crypto-explainer.md` | Crypto-newcomer onboarding |
| `competitive-landscape.md` | Market positioning |
| `deployment-sequence.md` | Deploy order for mainnet |
| `edge-case-playbook.md` | Operational edge cases |

---

## Back of house — `Docs/internal/`

Team-facing docs. Not stale, just not curated for a public audience.

Includes:

- **Comms / decisions / questions:** `CLAUDE_COMMS.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `PROJECT_BRIEF.md`
- **Audit fix decisions:** `REMEDIATION_DECISIONS.md`, `DB_REMEDIATION_DECISIONS.md`, `PRIOR_AUDIT_DELTA.md`
- **Internal audits:** `AUDIT_2026-05-06_iOS_render_regression.md`, `MOBILE_AUDIT_2026-05-08.md`
- **QA + ops:** `PRE_SUBMISSION_QA_v2.md`, `EXECUTION_CHECKLIST_audit_sweep.md`
- **Demo recording:** `DEMO_VIDEO_CUE_CARDS.md`, `DEMO_VIDEO_SCRIPT_v2.md`
- **Setup guides:** `TELEGRAM_PLAN.md`, `TELEGRAM_SETUP.md`, `DAPP_STORE_SETUP.md`, `SOLSHOT_DISCORD_PLAN.md`
- **Launch ops (current era):** `MASTER_LAUNCH_PLAN.md`, `LAUNCH_CHECKLIST.md`, `SOLSHOT_P1_LAUNCH.md`, `HACKATHON_SCOPE.md`, `solshot_frontier_execution_plan.md`
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
- `gl-decisions-feb24/` — Grand Library Feb 24 stub files (superseded by May 7 refresh)
- `old-plans/` — dated planning docs whose work has shipped

Plus loose files: `SOLSHOT_CODEBASE_AUDIT.md`, `SOLSHOT_REACT_MIGRATION_SPEC.md`, `SESSION_HANDOFF_2026-04-30.md`, `TOMORROW.md`, `solshot_v5.jsx`, `solshot-landing-v2.html`.

---

## Other root directories

| Directory | Purpose |
|---|---|
| `Assets/` | Game art, weapon logos, badges, tank sprites, screenshots, archive of older asset versions |
| `dapp-store/` | Solana dApp Store listing config (`config.yaml`) |
| `Marketing/`, `Handoffs/`, `BATTLE/` | Gitignored — large media stored externally (Drive/S3) |

---

## Conventions for future contributors

1. **New public-facing doc?** → `Docs/` root or appropriate `.docs/` GL doc.
2. **New team-only doc?** → `Docs/internal/`.
3. **Doc went stale?** → move to `_archive/superseded-docs/` (don't delete — preserves history).
4. **Audit re-run?** → SVK skills write to `.audit/`, `.bok/`, `.bulwark/`, `.docs/`. Don't move those paths or the skills will recreate them.
5. **Don't track local agent state.** `.claude/`, `.planning/`, `.agents/`, `*-history/` are gitignored for a reason.
