---
project: "SolShot"
mode: existing
created: 2026-02-22
total_docs: 9
waves: 4
status: draft_complete
---

# Document Manifest

## Wave 1 — Competition Essentials (priority: these are why we're here)

| Doc ID | Title | Status |
|--------|-------|--------|
| one-pager | SolShot One-Pager | generated |
| how-to-play | How to Play SolShot | generated |

**one-pager** — A punchy, visual-ready single page for competition judges. Hook, what it is, how it works, key stats, tech differentiators, team. Designed to be scannable in 30 seconds. Think pitch deck condensed to one sheet.

**how-to-play** — Player-facing guide covering: getting started (wallet, connecting), match flow, weapon system overview, gold economy, wagering explained simply, prestige system. Written for someone who's never played an artillery game OR used Solana. Friendly tone, no jargon walls.

## Wave 2 — Crypto & Technical Depth (supports competition, useful long-term)

| Doc ID | Title | Requires | Status |
|--------|-------|----------|--------|
| crypto-explainer | How Wagering Works | one-pager | generated |
| token-economics | SHOT Token Model | one-pager | generated |
| architecture | System Architecture | one-pager | generated |

**crypto-explainer** — Outward-facing explainer of the escrow mechanism for crypto-curious players. "Where does my SOL go? How do I know it's safe? What happens if I disconnect?" Builds trust. References litepaper v2.1 sections 05 and 08 but makes them accessible.

**token-economics** — Standalone SHOT token document. Supply, distribution, emission milestones, burn mechanics, deflationary math. Goes deeper than the litepaper. Useful for competition judges evaluating tokenomics and for future investors.

**architecture** — Visual-friendly system architecture. Client/server/chain diagram, data flow, what's server-authoritative and why. Shows judges this is a real, working system — not a whitepaper project.

## Wave 3 — Operational Depth (long-term value)

| Doc ID | Title | Requires | Status |
|--------|-------|----------|--------|
| security-model | Security Posture | architecture | generated |
| deployment-sequence | Deployment Runbook | architecture | generated |

**security-model** — Unified security document synthesizing findings from 3 completed audits (SOS: 7C/6H, DB: 8C/17H, BOK: 8 gaps). What was found, what was fixed, what the security posture is now. Competition judges love seeing "we found X problems and fixed Y of them" — it shows maturity.

**deployment-sequence** — Step-by-step: devnet deploy, mainnet deploy, key rotation, config initialization. Currently tribal knowledge — needs to be written down before mainnet.

## Wave 4 — Creative / High-Impact (non-obvious docs that add unique value)

| Doc ID | Title | Trigger | Status |
|--------|-------|---------|--------|
| edge-case-playbook | Edge Case & Recovery Playbook | escrow + disconnects | generated |
| competitive-landscape | Why SolShot (Competitive Landscape) | competition entry | generated |

**edge-case-playbook** — SolShot handles real money in real-time multiplayer. What happens when: player disconnects mid-wager? Server crashes during settlement? Escrow times out? Both wallets run out of SOL for fees? This doc shows you've thought through every failure mode. Judges evaluating financial dApps specifically look for this.

**competitive-landscape** — How SolShot compares to other Solana gaming projects. What exists (Star Atlas, Aurory, etc.), why SolShot is different (skill-based wagering, not play-to-earn), what the market gap is. Short and punchy — supports the one-pager's "why this matters" argument.

---

## Existing Documents (reference, not regenerated)

| Document | Location | Role |
|----------|----------|------|
| Litepaper v2.1 | `SolShot_Litepaper_v2.1.md` | Canonical public spec — game mechanics, tokenomics, wagering |
| Weapon Rebalance Spec v2 | `SolShot_Weapon_Rebalance_Spec_v2.md` | Weapon balance rationale |
| Privacy Policy | `Docs/SOLSHOT_PRIVACY_POLICY.md` | Legal |
| Terms of Service | `Docs/SOLSHOT_TERMS_OF_SERVICE.md` | Legal |
| Press Kit | `Docs/SOLSHOT_PRESS_KIT.md` | Media assets |
| Launch Checklist | `LAUNCH_CHECKLIST.md` | Pre-launch tasks |
| SOS Audit Report | `.audit/FINAL_REPORT.md` | On-chain security audit |
| DB Audit Report | `.bulwark/FINAL_REPORT.md` | Off-chain security audit |
| BOK Verification | `.bok/reports/2026-02-21-report.md` | Math verification |
