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

## v1.3 — 4-Player Multiplayer (SHIPPED 2026-02-27)

**Delivered:** Full 2-4 player last-man-standing multiplayer with N-player server engine, Phaser tanks[] array, React HUD with HP strip and elimination overlay, and lobby UI with player count selector and waiting room.

**Phases completed:** 15-19 (10 plans total)

**Key accomplishments:**
- Server match state machine rewritten for N-player: placement scoring, alive-map turn rotation, no-early-exit match determination
- Room schema migrated from binary host/player to players[] array with maxPlayers field — zero legacy references remain
- N-player battle engine: fire handler with elimination loop, homing nearest-enemy, simultaneous kills, timeout elimination
- Client Phaser migrated to tanks[] array with spectator mode, wreckage effects, name labels, YOUR TURN flash
- React HUD with N HP bars (PlayerHPBar component), elimination overlay with Leave Match, FINAL STANDINGS leaderboard
- Lobby UI with player count selector (2/3/4), N-slot waiting room, color de-dup, room list badges

**Stats:**
- 15 files changed, 2,067 insertions(+), 682 deletions(-)
- 17 feat commits across 5 phases
- 5 phases, 10 plans
- 2 days (26 Feb → 27 Feb 2026)

**Git range:** `2dbdd37` → `d7fb5d7`

**Audit:** 56/56 requirements satisfied, 8 tech debt items (no critical blockers). See milestones/v1.3-MILESTONE-AUDIT.md.

**What's next:** N-player QA testing, tech debt fixes (SHOT milestones for players 3/4, playAgain maxPlayers), then deployment/mainnet readiness

### Last Phase Number: 19
