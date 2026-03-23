# Roadmap: SolShot

## Milestones

- ✅ **v1.0 Development** - Phases 1-4 (pre-GSD, shipped 18 Feb 2026)
- ✅ **v1.1 Security Hardening** - Phases 1-8 (shipped 23 Feb 2026)
- ✅ **v1.2 Launch Readiness** - Phases 9-14 (shipped 25 Feb 2026)
- ✅ **v1.3 4-Player Multiplayer** - Phases 15-19 (shipped 27 Feb 2026)
- ✅ **v1.4 N-Player Escrow** - Phases 20-23 (shipped 28 Feb 2026)
- ✅ **v2.0 Practice Mode Public Launch** - Phases 24-28 (shipped 23 Mar 2026)
- 🔄 **v3.0 Public Practice Launch** - Phases 29-32 (in progress)

---

<details>
<summary>✅ v1.0 Development (Phases 1-4) - SHIPPED 18 Feb 2026</summary>

Pre-GSD work. Core game, escrow, SHOT token, prestige burns, art assets, deployment config.

- Phase 1: Code Fixes and Polish
- Phase 2: Escrow and On-Chain
- Phase 3A: Deployment Config
- Phase 4: Art and Assets

</details>

<details>
<summary>✅ v1.1 Security Hardening (Phases 1-8) - SHIPPED 23 Feb 2026</summary>

Three security audits (SOS, DB, BOK) — all CRITICAL/HIGH resolved.

- Phase 1: On-Chain Program Redesign
- Phase 2: Server Financial Security
- Phase 3: Server Auth and Game Integrity
- Phase 4: Secrets and Key Management
- Phase 4.1: Doc-Code Alignment (INSERTED)
- Phase 5: Client and Supply Chain Security
- Phase 6: Token Economy Hardening
- Phase 7: Infrastructure and Monitoring
- Phase 8: Verification and Re-Audit

</details>

<details>
<summary>✅ v1.2 Launch Readiness (Phases 9-14) - SHIPPED 25 Feb 2026</summary>

Jupiter ecosystem integration, polished UI, stats pipeline, mobile, security, checklist re-audit.

- Phase 9: Jupiter Ecosystem Integration
- Phase 10: Landing Page and Global Header
- Phase 11: Post-Match Stats Pipeline
- Phase 12: Mobile Experience
- Phase 13: Client Security Hardening
- Phase 14: Checklist Re-Audit

</details>

<details>
<summary>✅ v1.3 4-Player Multiplayer (Phases 15-19) - SHIPPED 27 Feb 2026</summary>

Refactor from 1v1 to 2-4 player last-man-standing. Practice mode first; N-player escrow deferred.

- Phase 15: Server Core Services (2 plans)
- Phase 16: Room Schema and Battle Engine (3 plans)
- Phase 17: Server Systems (1 plan)
- Phase 18: Client Phaser and GameBridge (2 plans)
- Phase 19: React HUD and Lobby UI (2 plans)

See: milestones/v1.3-ROADMAP.md for full details.

</details>

<details>
<summary>✅ v1.4 N-Player Escrow (Phases 20-23) - SHIPPED 28 Feb 2026</summary>

Full-stack escrow upgrade for 2-4 player wagered matches with winner-takes-all settlement and partial deposit handling.

- Phase 20: Anchor Program (3 plans)
- Phase 21: Server Escrow Services (2 plans)
- Phase 22: Server Socket Handlers (3 plans)
- Phase 23: Client UX (2 plans)

See: milestones/v1.4-ROADMAP.md for full details.

</details>

<details>
<summary>✅ v2.0 Practice Mode Public Launch (Phases 24-28) - SHIPPED 23 Mar 2026</summary>

Clean 2-player practice experience with zero friction onboarding. Handle system, token masking, lobby lockdown, practice stats, How To Play. Demo live at solshot.gg.

- Phase 24: Handle System
- Phase 25: Menu and Token Masking
- Phase 26: Lobby Lockdown
- Phase 27: Practice Stats
- Phase 28: How To Play

</details>

---

## v3.0 — Public Practice Launch

**Overview:** Overhaul aiming controls for intuitive game feel on desktop and mobile, add terrain wall decay for long-match balance, harden the escrow program for mainnet readiness, and go public with leaderboard and community launch content. The aiming overhaul ships first because game feel must be right before players share or promote the game.

**Coverage:** 22 requirements across 6 categories mapped to 4 phases (29-32).

**Note:** REQUIREMENTS.md header states 18 requirements but the actual count is 22. All 22 requirement IDs are mapped below.

---

### Phase 29 — Desktop Mouse-Aim and Control Settings

**Goal:** Desktop players can aim intuitively using their mouse, with a persistent control scheme preference that defaults to the new system.

**Dependencies:** None (Phaser scene is the target; React sliders become read-only displays)

**Requirements:** AIM-01, AIM-02, AIM-03, AIM-04, AIM-05, AIM-06, CTRL-01, CTRL-02, CTRL-03

**Plans:** 3 plans

Plans:
- [ ] 29-01-PLAN.md — Control scheme hook, MenuScreen toggle, BattleHUD prop plumbing
- [ ] 29-02-PLAN.md — Phaser mouse-aim pointer handlers in MainScene
- [ ] 29-03-PLAN.md — Read-only sliders, FireButton gating, end-to-end verification

**Success Criteria:**
1. On desktop, moving the mouse over the game canvas rotates the turret barrel to track the cursor angle relative to the tank in real time during the player's own turn
2. Mouse distance from the tank changes the power level displayed in the React HUD (clamped 5–100), and the slider reflects the live value as a read-only indicator
3. Left-clicking the canvas fires the selected weapon — no separate FIRE button click required on desktop
4. Q and E keys still adjust the angle as fine-tune controls on top of mouse aim; the two input modes co-exist without conflict
5. The settings or menu screen has a control scheme selector; selecting Classic Sliders restores the previous slider-and-button behavior; the chosen scheme persists across browser sessions via localStorage
6. The control scheme defaults to Mouse Aim on fresh load (no prior localStorage entry)

---

### Phase 30 — Mobile Tap-to-Aim

**Goal:** Mobile players can aim by tapping the canvas, matching the intuitiveness of the desktop mouse-aim without requiring a drag gesture.

**Dependencies:** Phase 29 (control scheme toggle already wired; mobile mode slots in as the second scheme option)

**Requirements:** AIM-07, AIM-08, AIM-09, AIM-10

**Success Criteria:**
1. On mobile, tapping anywhere on the game canvas rotates the turret toward the tapped position; the barrel snaps to that angle immediately
2. Tap-to-aim is only active during the local player's own turn; tapping during the opponent's turn or during a projectile animation has no effect
3. The power slider and FIRE button remain the primary controls on mobile — tapping the canvas only sets angle, and the player must explicitly press FIRE to shoot
4. The control scheme selector on the settings or menu screen shows Tap to Aim (not Mouse Aim) as the option label on mobile, and Classic Sliders remains available as a fallback

---

### Phase 31 — Terrain Wall Decay and Escrow Hardening

**Goal:** Magic Walls expire automatically so terrain cannot lock down maps permanently, and the escrow program is validated against all failure modes before mainnet.

**Dependencies:** Phase 29 and Phase 30 are independent of this phase; this can begin as soon as Phase 29 ships (or in parallel)

**Requirements:** TERR-01, TERR-02, TERR-03, ESC-01, ESC-02, ESC-03, ESC-04

**Success Criteria:**
1. Magic Wall placements are tracked server-side with the round number they were placed; no existing terrain logic is changed for non-wall placements
2. After N rounds (default 3–5, configurable in server constants), wall segments are removed from the terrain heightmap and the removal is broadcast to all clients
3. On the final round before a wall expires, the wall is rendered with a visual crack or fade effect so players can see it is about to disappear
4. A full integration test runs against devnet: create escrow → both players deposit → match completes → winner settled → funds distributed at 90/7/3 BPS — test passes without manual intervention
5. Edge cases are tested and documented: timeout refund path, cancel mid-match, double-settle guard, and disconnect during deposit — all resolve without stuck funds or server crashes
6. Burn TX replay protection (the in-memory verifiedBurnTxs Set) survives a server restart without accepting duplicate transactions

---

### Phase 32 — Leaderboard and Launch Content

**Goal:** The game is publicly shareable with a leaderboard that gives players a reason to keep playing and compete.

**Dependencies:** Phase 29, Phase 30 (aiming must feel good before public promotion), Phase 31 (escrow hardened before main push)

**Requirements:** PUB-01, PUB-02

**Success Criteria:**
1. A leaderboard screen is accessible from the menu and shows ranked players by wins, kills, and K/D ratio with no wallet connection required to view
2. Launch announcement content (tweet or thread copy, screenshots) is prepared and ready to post — the game demo at solshot.gg reflects the finished aiming overhaul before the announcement goes out

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-4. Pre-GSD Work | v1.0 | — | Complete | 18 Feb 2026 |
| 1-8. Security Hardening | v1.1 | 25/25 | Complete | 23 Feb 2026 |
| 9-14. Launch Readiness | v1.2 | 15/15 | Complete | 25 Feb 2026 |
| 15-19. 4-Player Multiplayer | v1.3 | 10/10 | Complete | 27 Feb 2026 |
| 20-23. N-Player Escrow | v1.4 | 10/10 | Complete | 28 Feb 2026 |
| 24-28. Practice Mode Public Launch | v2.0 | — | Complete | 23 Mar 2026 |
| 29. Desktop Mouse-Aim and Control Settings | v3.0 | 0/3 | Planned | — |
| 30. Mobile Tap-to-Aim | v3.0 | 0/? | Pending | — |
| 31. Terrain Wall Decay and Escrow Hardening | v3.0 | 0/? | Pending | — |
| 32. Leaderboard and Launch Content | v3.0 | 0/? | Pending | — |

---

*Roadmap created: 26 Feb 2026*
*v1.3 archived: 27 Feb 2026*
*v1.4 archived: 28 Feb 2026*
*v2.0 archived: 23 Mar 2026*
*v3.0 added: 23 Mar 2026*
