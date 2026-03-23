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

## v1.4 — N-Player Escrow (SHIPPED 2026-02-28)

**Delivered:** Full-stack N-player escrow upgrade — Anchor program rewrite for 2-4 player wagered matches with winner-takes-all settlement, partial deposit handling with host choice, and client deposit UX with real-time status and countdown timer.

**Phases completed:** 20-23 (10 plans total)

**Key accomplishments:**
- Anchor MatchEscrow rewritten for N-player: players[4] array, deposits_mask bitmap, 10-min timeout, start_with_depositors instruction
- Server escrow services (escrow.js + solana.js) upgraded to N-player arrays and remaining_accounts pattern
- Socket handlers for N-player deposit orchestration, 3-branch partial timeout (all/zero/partial), host decision flow
- SHOT milestone recording and playAgain state fixed for all N players (tech debt from v1.3)
- Client LobbyScreen with per-player deposit badges, countdown timer, partial decision UI, kick notification
- BattleScreen pot display uses N-player math with defensive fallback chain

**Stats:**
- 11 code files changed, +3,635 / -471 lines
- 41 commits across 4 phases
- 4 phases, 10 plans
- 2 days (27 Feb → 28 Feb 2026)

**Git range:** `fdac49e` → `33c02be`

**Audit:** 42/42 requirements satisfied, 18/18 integration, 5/5 E2E flows — PASSED. See milestones/v1.4-MILESTONE-AUDIT.md.

**What's next:** Deployment, QA testing with real wallets, mainnet readiness

### Last Phase Number: 23

## v2.0 — Practice Mode Public Launch (SHIPPED 2026-03-23)

**Delivered:** Clean 2-player practice experience with zero friction onboarding. Handle system, token masking, lobby lockdown to practice-only, localStorage stats, How To Play page. Demo live at solshot.gg.

**Phases completed:** 24-28 (shipped outside GSD tracking)

**Key accomplishments:**
- Handle system: first-time modal, localStorage persistence, TopBar display
- Menu cleanup: greyed locked features with COMING SOON badges
- Token masking: all SHOT/Jupiter/prestige references hidden
- Lobby locked to 2-player practice mode
- Practice stats in localStorage
- How To Play page at /how-to-play
- Friends testing complete, teaser content recorded

**What's next:** Public practice launch — aiming overhaul, terrain wall decay, community, escrow hardening

### Last Phase Number: 28
