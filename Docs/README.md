# SolShot — Documentation Index

Welcome. If you're a Colosseum judge, contributor, or someone investigating SolShot — **start with the root [`README.md`](../README.md) first**, then come here for the documents in depth.

This folder (`Docs/`) is the **public-facing project documentation**. Internal team artefacts (planning, comms, demo scripts, audit decision logs) live in [`Docs/internal/`](./internal/) and are not curated for outside readers.

The Solana Vibes Kit audit pipelines wrote outputs to four sibling dot-folders at the repo root (`.audit/`, `.bok/`, `.bulwark/`, `.docs/`). Those are tool-generated and stay where the tools wrote them — see the audit + GL sections below for the headline files.

---

## 📚 Read in this order

| # | Doc | Path | Time |
|---|---|---|---|
| 1 | **One-pager** — the 90-second pitch | [`../.docs/one-pager.md`](../.docs/one-pager.md) | 2 min |
| 2 | **How to play** — every match type, every weapon, full player guide | [`../.docs/how-to-play.md`](../.docs/how-to-play.md) | 10 min |
| 3 | **Roadmap** — forward-looking 5-phase plan, multi-game / multi-platform / open SDK | [`./ROADMAP.md`](./ROADMAP.md) | 5 min |
| 4 | **Litepaper** — full project spec (vision, distribution, on-chain programs, security posture) | [`./SolShot_Litepaper_v2.2.md`](./SolShot_Litepaper_v2.2.md) | 20 min |
| 4b | Litepaper PDF (same content, share-friendly format) | [`./SolShot_Litepaper_v2.2.pdf`](./SolShot_Litepaper_v2.2.pdf) | 20 min |
| 5 | **SHOT token model** — distribution, emissions, burns, scarcity analysis | [`./SHOT_TOKEN_MODEL.md`](./SHOT_TOKEN_MODEL.md) | 10 min |

---

## 🔒 Audit posture

Three independent audit pipelines from the [Solana Vibes Kit](https://github.com/MetalegBob) ran end-to-end before submission. All reports live in this repo.

| Audit | Scope | Headline report |
|---|---|---|
| **SOS** — on-chain | Anchor program vulnerability surface | [`../.audit/FINAL_REPORT.md`](../.audit/FINAL_REPORT.md) |
| **BOK** — math | Settlement / fee / refund invariants — 159 verification tests passing | [`../.bok/reports/`](../.bok/reports/) |
| **DB** — off-chain | Auth / signing / Privy integration / server hardening | [`../.bulwark/FINAL_REPORT.md`](../.bulwark/FINAL_REPORT.md) |

**Top-line summary across all three:** [`../.docs/audit-summary.md`](../.docs/audit-summary.md)

**Mainnet remediation roadmap** (what we fixed vs deferred, sequenced bundles): [`../.docs/mainnet-roadmap.md`](../.docs/mainnet-roadmap.md)

**Fix-vs-defer decision logs** for the items the audits flagged:
- SOS: [`./internal/REMEDIATION_DECISIONS.md`](./internal/REMEDIATION_DECISIONS.md)
- DB: [`./internal/DB_REMEDIATION_DECISIONS.md`](./internal/DB_REMEDIATION_DECISIONS.md)

---

## 📝 Other public docs

- [`./blog/`](./blog/) — ready-to-publish marketing copy ("What is SolShot?", "How wagering works")

---

## 🛠 Internal team docs (not curated for outside readers)

[`./internal/`](./internal/) holds team-facing artefacts: comms log between agents, decision history, open questions, the demo + pitch video scripts, audit fix-decision logs, internal specs, planning. Useful for contributors who join the project; not intended as public reading material.

---

## 📂 Other folders worth knowing

| Folder | What it is |
|---|---|
| [`../.docs/`](../.docs/) | Grand Library (GL) skill output — architecture, security model, mainnet roadmap, deployment sequence, edge-case playbook, etc. |
| [`../.audit/`](../.audit/) | SOS on-chain audit — context, strategies, findings |
| [`../.bok/`](../.bok/) | BOK math invariants audit — proofs, proptest results, summary |
| [`../.bulwark/`](../.bulwark/) | DB off-chain audit — context, strategies, findings |
| [`../_archive/`](../_archive/) | Superseded / historical docs (pre-pivot specs, retired research, prior-version artefacts). Nothing here reflects current state. |

For the full repo tree explanation, see the root [`FOLDER_GUIDE.md`](../FOLDER_GUIDE.md).
