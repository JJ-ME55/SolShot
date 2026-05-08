# SolShot — Folder Guide

> Last updated: May 2026. Generated after a full de-duplication and reorganisation pass.

---

## Root-level files

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick-start |
| `TODO.md` | Active task list |
| `SolShot_Redesign.html` | Full standalone redesign preview (self-contained, ~50 MB) |
| `Anchor.toml` | Solana Anchor workspace config |
| `Cargo.toml` / `Cargo.lock` | Rust workspace manifest |
| `package.json` / `package-lock.json` | Node/JS dependencies |
| `tsconfig.json` | TypeScript config |
| `render.yaml` | Render.com deployment config |

---

## Code directories

### `src/`
Main UI source — all React/JSX screen components for the desktop/web client.
Also contains `design-canvas.jsx` (design exploration tool) and `generate-terrain-textures.js` (terrain utility script).

### `client/`
Client-side application code (separate from `src/` UI components).

### `server/`
Backend server code.

### `programs/`
Solana on-chain programs (Rust/Anchor).

### `tests/`
Test suites.

### `mobile/`
Mobile-specific React components (`MobileHome.jsx`, `MobileMatch.jsx`, `MobileBarracks.jsx`, etc.).

### `styles/`
Shared stylesheets and CSS/design tokens.

### `target/`
Rust build output — do not edit manually.

---

## Content directories

### `Docs/`
**All project documentation lives here.** Key files:

| File | Purpose |
|------|---------|
| `PROJECT_BRIEF.md` | Top-level product vision |
| `MASTER_LAUNCH_PLAN.md` | Full launch roadmap |
| `LAUNCH_CHECKLIST.md` | Launch checklist tracker |
| `SOLSHOT_CHECKLIST_STATUS.md` | Live checklist status |
| `SOLSHOT_BUILD_DOC.md` | Technical build documentation |
| `SOLSHOT_CODEBASE_AUDIT.md` | Codebase audit notes |
| `SOLSHOT_DESIGN_CONTROL.md` | Design system control doc |
| `SOLSHOT_GSD_SPEC.md` | GSD feature specification |
| `SOLSHOT_STAT_CARD_SPEC.md` | Stat card design spec |
| `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md` | Seeker mode / 4-player design brief |
| `SOLSHOT_REACT_MIGRATION_SPEC.md` | React migration plan |
| `SOLSHOT_WEAPON_REBALANCE_Spec_v2.md` | Weapon balance specification |
| `SOLSHOT_P1_LAUNCH.md` | P1 priority launch doc |
| `SolShot_Litepaper_v2.2.md` | Current litepaper (v2.2, May 2026 — canonical) |
| `SHOT_TOKEN_MODEL.md` | Full SHOT token model — distribution, emissions, burns, scarcity analysis |
| `SOLSHOT_LITEPAPER.pdf` | Litepaper PDF export |
| `SOLSHOT_ASSET_MASTER_v2.md` | Asset master list |
| `SOLSHOT_DISCORD_PLAN.md` | Discord community plan |
| `SOLSHOT_LAUNCH_ANNOUNCEMENTS.md` | Launch announcement copy |
| `SOLSHOT_LAUNCH_BUDGET.md` | Launch budget |
| `SOLSHOT_LAUNCH_GAP_ANALYSIS.md` | Launch gap analysis |
| `SOLSHOT_PRESS_KIT.md` | Press kit |
| `SOLSHOT_PRIVACY_POLICY.md` | Privacy policy |
| `SOLSHOT_TERMS_OF_SERVICE.md` | Terms of service |
| `SOLSHOT_GPT_ART_PROMPTS.md` | Art generation prompts |
| `DAPP_STORE_SETUP.md` | dApp store setup guide |
| `TELEGRAM_PLAN.md` | Telegram community strategy |
| `TELEGRAM_SETUP.md` | Telegram technical setup guide |
| `DECISIONS.md` | Architectural decisions log |
| `OPEN_QUESTIONS.md` | Outstanding open questions |
| `CLAUDE_COMMS.md` | Comms / copy drafts |
| `STARTER_PROMPTS.md` | Claude starter prompts |
| `GROUP_CHAT_MODE.md` | Group chat mode spec |
| `SESSION_HANDOFF_2026-04-30.md` | Latest session handoff notes |
| `BLOG_WHAT_IS_SOLSHOT.md` | Blog post draft |
| `BLOG_HOW_WAGERING_WORKS.md` | Blog post draft |
| `solshot-landing-v2.html` | Landing page HTML |
| `solshot_v5.jsx` | UI component snapshot (v5) |
| `plans/` | Time-stamped design decision plans |

### `Assets/`
All visual game assets — weapon icons, badge images, background art, PSD source files.

| Sub-folder | Contents |
|------------|---------|
| `Archive/` | Older/renamed versions of asset files |
| `uploads/` | Badge PNGs and UI screenshots uploaded for store listings / sharing |
| `screenshots/` | In-progress render screenshots (tank compositions, UI previews) |

### `Handoffs/`
Design handoff exports from Figma / Claude design sessions. One sub-folder per feature.

| Sub-folder | Contents |
|------------|---------|
| `redesign/` | Full UI redesign handoff |
| `career_stats_card_v2/` | Career stats card component (current v2) |
| `handoff_postmatch_share/` | Post-match share card handoff |
| `handoff_trophy_share_satori/` | Trophy share card handoff (Satori/JSX) |
| `design_extract/` | Raw design extracts from Figma |
| `stat-card-preview.html` | Stat card standalone preview |

### `Marketing/`
Video content, clips, and marketing production files.

| File/Folder | Contents |
|-------------|---------|
| `*.mp4` | Raw and split video recordings |
| `clips/` | Edited clip exports |
| `frames/` | Extracted frame sequences per clip |
| `Content/` | Additional marketing content |
| `CLIP_PLAN.md` | Video clip plan and shot list |
| `CUT_COMMANDS.ps1` | FFmpeg/PowerShell cut commands |

---

## Feature / integration directories

### `bobs-bazaar/`
Bob's Bazaar feature module (Telegram challenge integration).

### `dapp-store/`
Solana dApp Store listing config (`config.yaml`).

---

## Archive

### `_archive/`
Archived, superseded, and duplicate files. Do not use these — kept for reference only.

| Sub-folder | Contents |
|------------|---------|
| `superseded-docs/` | Old document versions (litepaper v2.0, duplicate design control doc, etc.) |
| `old-ui-versions/` | Superseded UI files (solshot_v1–v4 JSX, old landing HTML, old redesign HTMLs) |
| `old-artillery/` | Previous weapon/artillery design files |
| `old-project-exports/` | Full project snapshots (`IDle_export`, `SolShot_v3`, `careercard_v1`) |
| `duplicate-assets/` | Asset files that were duplicated and cleaned up |
| `junk/` | Temporary files, chat transcripts, one-off exports |
| `Assets.zip` | Compressed asset backup |

---

## What was cleaned up

- **`IDle/`** (66 MB old project export) → `_archive/old-project-exports/IDle_export`
- **`SolShot (3)/` + `.zip`** (old project copy) → `_archive/old-project-exports/`
- **`SolShot_Litepaper_v2.0.md`** → `_archive/superseded-docs/` (v2.1 is canonical)
- **`SOLSHOT_DESIGN_CONTROL (1).md`** → `_archive/superseded-docs/` (duplicate of `Docs/SOLSHOT_DESIGN_CONTROL.md`)
- **`SolShot Redesign.html`** (6.8 KB stub) and **`SolShot_Redesign_decoded.html`** → `_archive/old-ui-versions/`
- **`careercard/`** (v1) → `_archive/old-project-exports/careercard_v1` (`Careercard 2` / v2 is in `Handoffs/`)
- **`converted-repo.txt`**, **`Transcript chat with Fish.txt`** → `_archive/junk/`
- **8 spec/setup `.md` files** scattered at root → consolidated into `Docs/`
- **5 handoff folders** scattered at root → consolidated into `Handoffs/`
- **`Markiting videos/`** → renamed to `Marketing/`
- **`uploads/`**, **`screenshots/`** → moved into `Assets/`
- **`design-canvas.jsx`**, **`generate-terrain-textures.js`** → moved into `src/`
