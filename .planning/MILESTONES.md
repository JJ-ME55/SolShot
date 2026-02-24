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

## v1.2 — Launch Readiness (ACTIVE)

Started 24 Feb 2026. Closing checklist gaps — Jupiter integration, UI polish, stats, onboarding, re-audit.

### Last Phase Number: 8 (continues from v1.1)
