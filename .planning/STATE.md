# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 23 Mar 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v3.0 — Public Practice Launch

## Current Position

Milestone: v3.0 — Public Practice Launch
Phase: 29 — Desktop Mouse-Aim and Control Settings
Plan: 01 of 3 complete
Status: In progress
Last activity: 23 Mar 2026 — Completed 29-01-PLAN.md (control scheme foundation)

Progress: [░░░░░░░░░░░░░░░░░░░░] ~3% (1/9 plans across v3.0 phases)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)
- v1.3 plans completed: 10 (across 5 phases)
- v1.4 plans completed: 10 (across 4 phases)
- v2.0: shipped outside GSD tracking (5 phases)

**Total across all milestones:** 75 plans, 33 phases

**v3.0 so far:** 1 plan complete (29-01)

## Accumulated Context

### Key Decisions (carried forward)
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- Three audits complete: SOS, DB, BOK — all PASS
- `launch` branch for v3.0 development, `main` stays stable for live demo
- Desktop: mouse-aim (cursor = angle + power, click = fire)
- Mobile: tap-to-aim (tap canvas = turret angle, power via slider, FIRE button)
- Control scheme toggle in settings/menu (classic sliders vs new aiming)
- Terrain walls decay after N rounds (suggest 3-5, tuneable)
- Control scheme defaults to new aiming; classic sliders available as fallback
- CTRL requirements ship with Phase 29 (desktop) since toggle is first needed there
- useControlScheme hook: localStorage key is `solshot_control_scheme`, default `'mouse'` desktop / `'classic'` mobile
- window.controlScheme is the React-to-Phaser interop channel for control scheme (mirrors window.socket pattern)
- CONTROLS selector in MenuScreen is desktop-only — mobile deferred to Phase 30

### v3.0 Branch Strategy
- `main` = live demo at solshot.gg (Vercel + Render deploy from here)
- `launch` = all v3.0 development
- Hotfixes: branch off main, merge to main, then merge main into launch
- Launch day: merge launch into main

### v3.0 Phase Summary
- Phase 29: Desktop mouse-aim + control settings toggle (9 requirements)
- Phase 30: Mobile tap-to-aim (4 requirements) — slots into toggle wired in Phase 29
- Phase 31: Terrain wall decay + escrow hardening (7 requirements) — independent of aiming
- Phase 32: Leaderboard + launch content (2 requirements) — depends on aiming being done

### Pending Todos (carried from v2.0)
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows — tests need exclusion
- Devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program (relevant for Phase 31 ESC tests)
- main.js is now ~3143 lines — search by function name, not line number

## Session Continuity

Last session: 2026-03-23
Stopped at: Completed 29-01-PLAN.md — control scheme hook + MenuScreen toggle + BattleHUD prop plumbing
Resume file: None
Next command: /gsd:execute-phase (plan 29-02 — Phaser mouse-aim in MainScene)
