# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 19 Feb 2026)

**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** Phase 1.1 — Weapon Visual Identity (1 plan remaining)

## Current Position

Phase: 1.1 of 7 (Weapon Visual Identity)
Plan: 3 of 4 in current phase
Status: In progress — 3/4 plans complete in phase 1.1
Last activity: 19 Feb 2026 — Completed 01.1-03 (Tier 3 weapons: 3 Shot, Spider, Pile Driver, Jackhammer, Ground Hog, Napalm)

Progress: [█████░░░░░] ~17% (5/30 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~20 min
- Total execution time: ~94 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-weapon-visual-audit | 2/2 complete | ~53 min | ~27 min |
| 1.1-weapon-visual-identity | 3/4 | ~41 min | ~14 min |

*Updated after each plan completion*

## Accumulated Context

### Key Decisions
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- **[01-01] WVA-02 closed with no action taken — zero visual drift in any of 20 active weapon classes**
- **[01-01] Do not revert heatseeker: diff*0.15 turn rate + explicit angle-toward-tank = correct improved values (git 2e86aab)**
- **[01-01] Pineapple 32/20, Homing Missile 80px/60/80, Cruiser 80/80 — all correct server-matched values; converted-repo.txt is pre-rebalance reference**
- **[01-01] Spider dual blast: 80px proximity burst + 28px sub-segments — WEAPON_DATA.blastRadius=28 refers to sub-munitions only**
- **[01-01] Napalm client proximity scoring vs server burst model is known design divergence — acceptable for v1.0**
- **[01-02] WVA-03 checklist produced — 789-line QA worksheet covering all 20 weapons**
- **[01-02] Cruiser behavior: arc → land → roll ~2s along terrain → final 80px blast (full 80/80 damage factor)**
- **[1.1] Weapon Visual Identity phase inserted — John's play-test confirmed all weapons function correctly but 15/20 are visually indistinguishable in flight**
- **[1.1] Implementation: Option A (enhance existing updateTail system) + surgical spawnParticle() utility for lingering effects**
- **[1.1] Heatseeker + Skipper = gold standard — unique flight behavior makes weapon exciting; all others need this level of visual identity**
- **[1.1] Design doc: docs/plans/2026-02-19-weapon-visual-identity-design.md — full specs for all 20 weapons approved**
- **[1.1] Zero gameplay changes — purely visual. Server physics.js untouched. Damage/blast values unchanged.**
- **[01.1-01] spawnParticle/spawnBurstEffect on Weapon base class — Phaser add.circle + tweens.add pattern; all weapons can now emit particles**
- **[01.1-01] Frame counter pattern: this._dustFrame/_sparkFrame = 0 in constructor AND reset(), guard with groundHit === false**
- **[01.1-01] Magic Wall rotation: setRotation(rotation + 0.08) applied BEFORE defaultUpdate() to avoid physics override**
- **[01.1-01] Build tool: use npx react-app-rewired build from client/ directory (not react-scripts, not root)**
- **[01.1-02] Color oscillation: sin(_colorFrame * 0.15) * amplitude for smooth purple-to-red color cycling on frame counter**
- **[01.1-02] Wobble jitter: projectile.body.x/y += (Math.random()-0.5)*2 each frame for erratic projectile movement**
- **[01.1-02] Per-bullet effects: obj.index % 2 === 0 for alternating color/style per bullet in multi-projectile weapons**
- **[01.1-02] Bounce-scaled burst: Math.max(3, this.bounce + 2) to taper spawnBurstEffect particle count on successive bounces**
- **[01.1-03] Sine throb: _pulseFrame++ + setScale(1 + Math.sin(_pulseFrame * 0.2) * 0.15) for pulsing orb identity (Spider)**
- **[01.1-03] Terrain surface scan: loop from body.y upward checking alpha===0 — finds surface above tunnel path (Ground Hog)**
- **[01.1-03] Pile Driver burst ring uses blastCount - 1 index (post-increment) to correctly map ring to just-executed blast depth**
- **[01.1-03] flameColors array random pick: [0xFF6600, 0xFFAA00, 0xFF4400, 0xFFCC00] for organic Napalm flame variation**

### Pending Todos

None yet.

### Blockers/Concerns
- Missing sound effects (7 .wav files — TODO-01)
- Token metadata (Metaplex) not created yet — TODO-03
- Social accounts not created yet (Twitter) — TODO-04
- Legal docs (ToS, Privacy Policy) drafts exist but not finalized — TODO-05, TODO-06
- Escrow program not audited — SEC-01
- **[01-01 Open → WVA-03] Prestige weapons in-game playtesting — CHECKLIST READY, awaiting John sign-off**
- **[01-01 Open → WVA-03] Heatseeker sprite rotation visual confirmation — John confirmed PERFECT in play-test**
- **[01-01 Open] Napalm scoring reconciliation noted for awareness — not a bug, not blocking**

## Session Continuity

Last session: 2026-02-19 10:09 UTC
Stopped at: Completed 01.1-03-PLAN.md (Weapon Visual Identity — Tier 3 weapons: 3 Shot, Spider, Pile Driver, Jackhammer, Ground Hog, Napalm)
Resume file: None
