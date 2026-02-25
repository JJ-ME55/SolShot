# SolShot — Milestones

## v0.x — Development (pre-GSD)

All work through 18 Feb 2026 was done outside GSD tracking. See TODO.md for full history.

### Shipped
- Phase 1: Code Fixes & Polish (graphics, weapon logos, wind, security, disconnect/reconnect, match modes)
- Phase 2: Escrow & On-Chain (escrow program, SHOT token, prestige burns — all on devnet)
- Phase 3A: Deployment Config (render.yaml, vercel.json, env examples)
- Phase 4: Art & Assets (weapon icons, win/lose screens, PWA icons, combat card)

## v1.1 — Security Hardening (COMPLETE)

All work 21-23 Feb 2026. Three security audits (SOS, DB, BOK) — all CRITICAL/HIGH resolved.

### Shipped
- Phase 1: On-Chain Program Redesign (GlobalConfig PDA, constraints, checked arithmetic, pause)
- Phase 2: Server Financial Security (deposit verification, settlement failure recovery)
- Phase 3: Server Auth & Game Integrity (auth guards, rejoin verification, position validation)
- Phase 4: Secrets & Key Management (keypair rotation, git history purge, centralized keys.js)
- Phase 4.1: Doc-Code Alignment (deposit countdown, permissionless reclaim, HP-based forfeit)
- Phase 5: Client & Supply Chain Security (TX validation, self-hosted Telegram SDK, CSP, window.solWallet removal)
- Phase 6: Token Economy Hardening (MongoDB persistence for dedup Sets, fail-hard startup)
- Phase 7: Infrastructure & Monitoring (npm security, endpoint auth, connection limits)
- Phase 8: Verification & Re-Audit (SOS/DB/BOK re-run, SECURITY_SUMMARY.md)

### Last Phase Number: 8

## v1.2 — Launch Readiness (SHIPPED 2026-02-25)

**Delivered:** Full code-level launch readiness — Jupiter ecosystem integration, polished UI across all screens, stats pipeline with social sharing, mobile haptics, and a 221-item checklist re-audit.

**Phases completed:** 9-14 (15 plans total)

**Key accomplishments:**
- Jupiter ecosystem integration (Mobile wallet, Price API V3, Terminal SDK with 0.5% platform fee)
- Landing page overhaul with ecosystem partners, SHOT price ticker, wager display
- Post-match stats pipeline (MongoDB persistence, milestones, prestige progress, X/Twitter sharing)
- Mobile experience (haptic feedback, dApp browser detection, Telegram share, FAQ)
- Client security hardening (source maps disabled, CSP report-uri, console.log cleanup)
- Full 221-item checklist re-audit with 5 design decision annotations and scored summary

**Stats:**
- 85 files changed, ~37K insertions, ~35K deletions
- 31 source files modified (client + server)
- 62 commits across 6 phases
- 2 days (24 Feb → 25 Feb 2026)

**Git range:** `ffc846b` → `04eda30`

**Launch checklist:** 91/195 scored items pass (47%) — gap is QA sessions (54 items) and deployment (14 items), not missing code.

**What's next:** Deployment, QA sessions, mainnet readiness

### Last Phase Number: 14
