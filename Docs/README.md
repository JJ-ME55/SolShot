# SolShot - Documentation Index

Welcome. If you're a Colosseum judge, contributor, or someone investigating SolShot - **start with the root [`README.md`](../README.md) first**, then come here for the documents in depth.

This folder (`Docs/`) is the **public-facing project documentation**. Internal team artefacts (planning, comms, demo scripts, audit decision logs) live in [`Docs/internal/`](./internal/) and are not curated for outside readers.

---

## 📚 Read in this order

| # | Doc | Time |
|---|---|---|
| 1 | [**One-pager**](./one-pager.md) - the 90-second pitch | 2 min |
| 2 | [**How to play**](./how-to-play.md) - every match type, every weapon, full player guide | 10 min |
| 3 | [**Roadmap**](./ROADMAP.md) - forward-looking 5-phase plan, multi-game / multi-platform / open SDK | 5 min |
| 4 | [**Litepaper**](./SolShot_Litepaper_v2.2.md) - full project spec (vision, distribution, on-chain programs, security posture) | 20 min |
| 4b | [Litepaper PDF](./SolShot_Litepaper_v2.2.pdf) - same content, share-friendly format | 20 min |
| 5 | [**SHOT token model**](./SHOT_TOKEN_MODEL.md) - distribution, emissions, burns, scarcity analysis | 10 min |

## 🛡 Deeper context (still public)

- [`architecture.md`](./architecture.md) - system architecture
- [`security-model.md`](./security-model.md) - security model and trust boundaries
- [`audit-summary.md`](./audit-summary.md) - top-line summary across the three audits
- [`mainnet-roadmap.md`](./mainnet-roadmap.md) - sequenced remediation bundles required before mainnet
- [`crypto-explainer.md`](./crypto-explainer.md) - onboarding for crypto-newcomer readers
- [`competitive-landscape.md`](./competitive-landscape.md) - market positioning
- [`edge-case-playbook.md`](./edge-case-playbook.md) - operational edge cases

---

## 🔒 Audit posture

Three independent audit pipelines from the [Solana Vibes Kit](https://github.com/MetalegBob) ran end-to-end before submission. The full per-audit reports live at the repo root:

| Audit | Scope | Headline report |
|---|---|---|
| **SOS** - on-chain | Anchor program vulnerability surface | [`../.audit/FINAL_REPORT.md`](../.audit/FINAL_REPORT.md) |
| **BOK** - math | Settlement / fee / refund invariants - 159 verification tests passing | [`../.bok/reports/`](../.bok/reports/) |
| **DB** - off-chain | Auth / signing / Privy integration / server hardening | [`../.bulwark/FINAL_REPORT.md`](../.bulwark/FINAL_REPORT.md) |

The condensed summary lives here in `Docs/`: [`audit-summary.md`](./audit-summary.md) · [`mainnet-roadmap.md`](./mainnet-roadmap.md).

For each finding, the per-audit reports linked above record what was fixed in the post-audit bundles and what was deferred to the mainnet hardening roadmap.

---

## 📝 Blog drafts

[`./blog/`](./blog/) - ready-to-publish marketing copy ("What is SolShot?", "How wagering works")

---

## 🛠 Internal team docs (not curated for outside readers)

[`./internal/`](./internal/) holds team-facing working docs. Useful context for contributors; not curated for public reading.

---

## 📂 Other root folders worth knowing

| Folder | What it is |
|---|---|
| [`../.audit/`](../.audit/) | SOS on-chain audit - context, strategies, findings |
| [`../.bok/`](../.bok/) | BOK math invariants audit - proofs, proptest results, summary |
| [`../.bulwark/`](../.bulwark/) | DB off-chain audit - context, strategies, findings |
| [`../_archive/`](../_archive/) | Superseded / historical docs (pre-pivot specs, retired research, prior-version artefacts). Nothing here reflects current state. |

For the full repo tree explanation, see the root [`FOLDER_GUIDE.md`](../FOLDER_GUIDE.md).
