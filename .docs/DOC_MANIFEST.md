---
project: "SolShot"
mode: existing
created: 2026-02-22
last_refresh: 2026-05-07
total_docs: 11
waves: 4
status: refresh_complete
---

# Document Manifest

**Last refresh:** 2026-05-07 — targeted refresh of 6 docs + 2 new docs added (`audit-summary.md`, `mainnet-roadmap.md`).
**Refresh trigger:** post-audit (SOS + BOK + DB) + v2 escrow + Privy migration + group-chat infrastructure.

## Wave 1 — Competition Essentials

| Doc ID | Title | Status | Last update |
|--------|-------|--------|-------------|
| one-pager | SolShot One-Pager | refreshed 2026-05-07 | post-audit + first wagered match |
| how-to-play | How to Play SolShot | unchanged | gameplay fundamentals stable |

**one-pager** — High-level pitch. 60-second read for hackathon judges. Updated 2026-05-07 to include audit transparency angle, first wagered match milestone (May 4), Privy + Telegram bot stack.

**how-to-play** — Player-facing onboarding guide. Unchanged since Feb — the gameplay model hasn't shifted.

## Wave 2 — Crypto & Technical Depth

| Doc ID | Title | Requires | Status | Last update |
|--------|-------|----------|--------|-------------|
| crypto-explainer | How Wagering Works | one-pager | unchanged | crypto fundamentals stable |
| token-economics | SHOT Token Model | one-pager | unchanged | model unchanged since Feb |
| architecture | System Architecture | one-pager | refreshed 2026-05-07 | major rewrite |

**crypto-explainer** — Escrow mechanics for crypto-curious players. Unchanged.

**token-economics** — SHOT supply, distribution, burn mechanics. Unchanged (model is stable; v2 BPS configurability is captured in architecture.md and security-model.md).

**architecture** — System diagram + components + data flows. **Major refresh** — added v2 escrow program, Privy migration, group-chat infrastructure (10 service files), updated trust model from `.audit/ARCHITECTURE.md` and `.bulwark/ARCHITECTURE.md`. ~700+ lines.

## Wave 3 — Operational Depth

| Doc ID | Title | Requires | Status | Last update |
|--------|-------|----------|--------|-------------|
| security-model | Security Posture | architecture | refreshed 2026-05-07 | major rewrite |
| deployment-sequence | Deployment Runbook | architecture | refreshed 2026-05-07 | major rewrite |

**security-model** — Unified security document. **Major refresh** — synthesized findings from 3 audits (SOS, BOK, DB). Headline counts, fix-vs-defer log pointers, critical invariants table with enforcement status, known limitations + rationale, mainnet roadmap pointer. ~500 lines.

**deployment-sequence** — Step-by-step deployment runbook. **Major refresh** — current devnet program IDs, sample settled match TXs, sequenced pre-mainnet checklist (Bundles 1–4), mainnet deploy procedure with rollback plan. Important note: source-level fixes shipped but devnet `.so` redeploy may need verification.

## Wave 4 — Creative / High-Impact

| Doc ID | Title | Trigger | Status | Last update |
|--------|-------|---------|--------|-------------|
| edge-case-playbook | Edge Case & Recovery Playbook | escrow + disconnects | refreshed 2026-05-07 | +13 new edge cases |
| competitive-landscape | Why SolShot (Competitive Landscape) | competition entry | unchanged | market positioning stable |

**edge-case-playbook** — Operational runbook for edge cases. **Major refresh** — 13 NEW edge cases added since Feb covering wallet rotation, refund failure paths (H023 desync), group-chat double-settle race, non-contiguous deposit mask, pause divergence v1 vs v2, RPC failure modes, Mongo reconnect handling, Privy session expiry, TG WebView vs Safari. 28 total edge cases.

**competitive-landscape** — How SolShot compares to other Solana gaming. Unchanged — market positioning stable (group-chat-native gaming wedge still the differentiator).

## Wave 5 — Audit deliverables (NEW since May 2026 refresh)

| Doc ID | Title | Status |
|--------|-------|--------|
| audit-summary | Audit Summary (3 audits) | NEW 2026-05-07 |
| mainnet-roadmap | Mainnet Hardening Roadmap | NEW 2026-05-07 |

**audit-summary** — One-stop overview of all 3 audits SolShot has run. Headline counts, fixed-vs-deferred breakdown, cross-skill chain analysis (H120), stacked-audit context (Feb #1 → May #2), limitations of verification mode, verdict. Written for hackathon judges + future contributors. ~340 lines.

**mainnet-roadmap** — Sequenced path from current devnet to mainnet with real funds. 4 bundles (Authority hardening / Wallet & Identity / Refund & Settle correctness / Defensive hygiene), each with sequence steps, effort estimate, risk level. Cross-references every deferred finding to its bundle step. ~1000 lines.

---

## Existing Documents (reference, not regenerated)

| Document | Location | Role |
|----------|----------|------|
| Litepaper v2.1 | `SolShot_Litepaper_v2.1.md` | Canonical public spec — game mechanics, tokenomics, wagering |
| Weapon Rebalance Spec v2 | `SolShot_Weapon_Rebalance_Spec_v2.md` | Weapon balance rationale |
| Privacy Policy | `Docs/SOLSHOT_PRIVACY_POLICY.md` | Legal |
| Terms of Service | `Docs/SOLSHOT_TERMS_OF_SERVICE.md` | Legal |
| Press Kit | `Docs/SOLSHOT_PRESS_KIT.md` | Media assets |
| Launch Checklist | `Docs/LAUNCH_CHECKLIST.md` | Pre-launch tasks |
| Prior audit delta | `Docs/PRIOR_AUDIT_DELTA.md` | Feb → May audit context (NEW since refresh) |
| SOS audit decisions | `Docs/REMEDIATION_DECISIONS.md` | SOS fix-vs-defer log (NEW since refresh) |
| DB audit decisions | `Docs/DB_REMEDIATION_DECISIONS.md` | DB fix-vs-defer log (NEW since refresh) |
| SOS Audit Report | `.audit/FINAL_REPORT.md` | On-chain security audit (refreshed 2026-05-06) |
| DB Audit Report | `.bulwark/FINAL_REPORT.md` | Off-chain security audit (refreshed 2026-05-07) |
| BOK Audit Report | `.bok/reports/2026-05-07-report.md` | Math verification (refreshed 2026-05-07) |

## Refresh history

| Date | Type | Trigger | Docs touched |
|------|------|---------|--------------|
| 2026-02-22 | Initial | First Grand Library run | 9 docs across 4 waves |
| 2026-05-07 | Targeted refresh | Post-audit + v2 escrow + Privy + group-chat | 6 refreshed (architecture, security-model, deployment-sequence, edge-case-playbook, one-pager, PROJECT_BRIEF) + 2 added (audit-summary, mainnet-roadmap) |
