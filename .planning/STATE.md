# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 19 Feb 2026)

**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** Phase 3 — Litepaper v2.1 Compliance (03-01, 03-03, 03-05 complete; 03-02 queue and 03-04 movement next)

## Current Position

Phase: 3 of 7 (Litepaper v2.1 Compliance)
Plan: 3 of 5 in current phase — 03-01 complete (wager tiers + Custom Challenge); 03-03 complete (SHOT v2.1 milestones); 03-05 complete (LP-09 governance)
Status: In progress — 03-01 complete (746a4ea, 62f5d7f)
Last activity: 20 Feb 2026 — Completed 03-01 (v2.1 wager tiers, custom_challenge mode server+client)

Progress: [████░░░░░░] ~42% (13/30 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 5 (+ 01.1-04 code-complete, pending QA)
- Average duration: ~20 min
- Total execution time: ~94 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-weapon-visual-audit | 2/2 complete | ~53 min | ~27 min |
| 1.1-weapon-visual-identity | 4/4 code-complete (QA pending) | ~41 min | ~14 min |

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
- **[01.1-04] Tasks 1+2 committed atomically as 59a32bd — both modify same file; interactive staging unavailable in non-TTY context**
- **[01.1-04] Chain Reaction energy arc uses arr[i-2] for previous offset — i is incremented end-of-createBlast, so inside body i = current, i-2 = blast before last**
- **[01.1-04] Pineapple sub-munitions upgraded rgba(0,255,100,1) radius 1.5 — brighter + slightly larger than original (0,230,80,1) radius 1**
- **[02-04] Twitter @SolShotGG confirmed created by user**
- **[02-04] Jurisdiction deferred — [TO BE DETERMINED BY LEGAL COUNSEL] in ToS 12.1 and Privacy Policy 10.1; resolve before mainnet**
- **[02-04] Contact email deferred — [TBD] in both legal docs; no contact@solshot.gg set**
- **[02-04] Legal doc GitHub raw URLs used for devnet; update to solshot.gg/terms and solshot.gg/privacy at mainnet**
- **[02-05] DNS live: A @ → 216.198.79.1 (Vercel), CNAME www → cname.vercel-dns.com; Vercel configured for solshot.gg + www.solshot.gg**
- **[02-05] render.yaml CORS_ORIGINS seeds solshot.gg — Render dashboard must ALSO be updated after server deploy (dashboard takes precedence)**
- **[03-05] LP-09 is ops-only — escrow program already routes 7% to TREASURY_WALLET env var; set Squads Protocol multisig address in Render before mainnet (Phase 6)**
- **[03-03] Practice mode earns 25% via rateMultiplier; Math.floor truncates fractional SHOT (integer semantics)**
- **[03-03] Milestone dedup by ID string; PRESTIGE_WEAPON_IDS=[24,29,26,21,22] exported for usedNoPrestige flag**
- **[03-03] saveMilestoneState fire-and-forget from both recordMatchPlayed and prestigeBurn; loadMilestoneState on authenticate**
- **[03-01] WAGER_TIERS=[0,0.1,0.25,0.5,1.0]; custom_challenge wagerRange=[0.1,Infinity]; old values 0.01/0.05 now rejected**
- **[03-01] isValidWager(amount, matchMode) — always pass matchMode in createRoom; matchMode extracted before this call (order matters)**
- **[03-01] Client customWager state separate from wager — avoids contaminating tier buttons when switching between modes**

### Pending Todos

None yet.

### Blockers/Concerns
- Missing sound WAV files (7 .wav files — TODO-01): preload lines added (9adf21e), WAV files still needed on disk
- Token metadata (Metaplex) not created yet — TODO-03
- Twitter @SolShotGG DONE — TODO-04 closed
- Legal docs: dates filled, jurisdiction and contact email deferred — TODO-05/06 partially closed (placeholders remain for mainnet)
- Escrow program not audited — SEC-01
- **[01-01 Open → WVA-03] Prestige weapons in-game playtesting — CHECKLIST READY, awaiting John sign-off**
- **[01-01 Open → WVA-03] Heatseeker sprite rotation visual confirmation — John confirmed PERFECT in play-test**
- **[01-01 Open] Napalm scoring reconciliation noted for awareness — not a bug, not blocking**
- **[01.1-04 OPEN] Human QA checkpoint — fire all 20 weapons in Practice mode, verify visual distinctness, type "approved" to complete phase**

## Session Continuity

Last session: 2026-02-20 UTC
Stopped at: 03-01 complete (wager tiers v2.1 + custom_challenge server + client)
Resume file: None (next: 03-02 matchmaking queue OR 03-04 movement enforcement)
