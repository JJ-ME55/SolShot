# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 28 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v2.0 — Practice Mode Public Launch

## Current Position

Milestone: v2.0 — Practice Mode Public Launch
Phase: 24 — Handle System
Plan: —
Status: Roadmap complete, ready to plan Phase 24
Last activity: 28 Feb 2026 — v2.0 roadmap created (5 phases, 22 requirements)

```
Phase: [24][25][26][27][28]
        [  ][  ][  ][  ][  ]
         ^
         current
```

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)
- v1.3 plans completed: 10 (across 5 phases)
- v1.4 plans completed: 10 (across 4 phases)

**Total across all milestones:** 75 plans, 28 phases

**v2.0 so far:** 0 plans, 0 phases complete

## Accumulated Context

### Key Decisions (carried forward)
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- Three audits complete: SOS, DB, BOK — all PASS
- 2-player only for public launch (ship clean, expand to 4p later)
- Handle system for identity (not wallet) — zero friction onboarding
- Token masking: hide all SHOT/Jupiter/prestige references until wagering goes live
- DO NOT TOUCH: server files, escrow.js, solana.js, shot-token.js, battle logic, wager logic

### v2.0 Phase Decisions
- Phase 24 delivers the handle modal + localStorage identity before any other screen is reachable
- Phase 25 clusters all token suppression (ticker, WinScreen, ShotExplainer, SHOT text) with menu copy changes — same "hide wagering layer" intent
- Phase 26 locks the lobby to 2-player practice only — separate phase because it is a distinct screen with distinct component changes
- Phase 27 adds the localStorage stats service keyed by solshot_uid — no UI, pure data layer, designed for future Barracks migration
- Phase 28 delivers the /how-to-play route as a new standalone page — last because it has no blockers beyond handle display and token masking

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows — tests need exclusion
- Devnet wallet at 0.97 SOL — need ~2.12 SOL to redeploy program with v1.4 instructions
- main.js is now ~3143 lines — search by function name, not line number
- tests/solshot-escrow.ts uses old 2-player API (TS integration tests cannot run against new program)

## Session Continuity

Last session: 2026-02-28
Stopped at: v2.0 roadmap created — ready to plan Phase 24 (Handle System)
Resume file: None
Next command: /gsd:plan-phase 24
