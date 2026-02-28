# Roadmap: SolShot

## Milestones

- ✅ **v1.0 Development** - Phases 1-4 (pre-GSD, shipped 18 Feb 2026)
- ✅ **v1.1 Security Hardening** - Phases 1-8 (shipped 23 Feb 2026)
- ✅ **v1.2 Launch Readiness** - Phases 9-14 (shipped 25 Feb 2026)
- ✅ **v1.3 4-Player Multiplayer** - Phases 15-19 (shipped 27 Feb 2026)
- ✅ **v1.4 N-Player Escrow** - Phases 20-23 (shipped 28 Feb 2026)
- 🔄 **v2.0 Practice Mode Public Launch** - Phases 24-28 (in progress)

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

---

## v2.0 — Practice Mode Public Launch

**Overview:** Client-only milestone that makes SolShot publicly playable with zero friction. No wallet required, no token references visible. New players get a persistent handle, land in a clean practice-mode lobby, play 2-player matches, and can read how to play. All wagering and token surfaces are suppressed until a future milestone enables them.

**Scope constraint:** DO NOT TOUCH server files, escrow.js, solana.js, shot-token.js, battle logic, or wager logic. All changes are client-side React components.

**Coverage:** 22 requirements across 6 categories mapped to 5 phases (24-28).

---

### Phase 24 — Handle System

**Goal:** Every visitor has a persistent identity before they reach the menu.

**Dependencies:** None (foundation layer)

**Requirements:** HANDLE-01, HANDLE-02, HANDLE-03, HANDLE-04, HANDLE-05

**Success Criteria:**
1. A visitor with no prior localStorage sees a modal before the menu loads, with no way to bypass it
2. Entering a handle and confirming writes `solshot_handle` and `solshot_uid` to localStorage, and the modal dismisses to the menu
3. The modal clearly communicates that the handle is permanent (visible "Choose carefully" language)
4. Handle input rejects strings longer than 16 characters and strips leading/trailing whitespace and control characters
5. The TopBar shows the player's handle in the position where the wallet address would appear, with no wallet connection UI

---

### Phase 25 — Menu and Token Masking

**Goal:** The menu presents a clean practice-mode product with no token economy visible.

**Dependencies:** Phase 24 (handle must exist before menu is usable)

**Requirements:** MENU-01, MENU-02, MENU-03, MASK-01, MASK-02, MASK-03, MASK-04

**Success Criteria:**
1. The menu subtagline reads "SKILL-BASED ARTILLERY COMBAT" — the SOL wager range is gone
2. Armory, Prestige, and Barracks buttons are visually disabled with a COMING SOON badge and do not respond to clicks
3. PLAY FREE is the only interactive button on the menu
4. The SHOT price ticker does not appear anywhere in the TopBar or menu layout
5. The WinScreen shows no SHOT reward card, no Jupiter swap CTA, and no CONVERT WINNINGS section; the ShotExplainer modal never opens; any SHOT amount display shows "???" in its place

---

### Phase 26 — Lobby Lockdown

**Goal:** The lobby presents only the practice 2-player mode with no wagered options available.

**Dependencies:** Phase 24 (handle required for lobby identity), Phase 25 (token masking active before lobby is reachable)

**Requirements:** LOBBY-01, LOBBY-02

**Success Criteria:**
1. The player count selector is not visible in the lobby; the match always creates with exactly 2 players
2. Quick Match, Duel, and High Roller mode tabs are visually disabled with COMING SOON treatment and cannot be selected; Practice is the active default

---

### Phase 27 — Practice Stats

**Goal:** Every match outcome is recorded locally so players accumulate a meaningful record from day one.

**Dependencies:** Phase 24 (requires `solshot_uid` to key stats), Phase 26 (stats written after a practice match completes)

**Requirements:** STATS-01, STATS-02, STATS-03

**Success Criteria:**
1. After a completed practice match, matches played, wins, losses, and K/D ratio are updated in localStorage under the player's `solshot_uid`
2. Stats persist across browser sessions and accumulate correctly across multiple matches
3. The localStorage data structure uses field names and shape that map cleanly to the future Barracks server schema (no lossy fields, no client-specific keys mixed into the record)

---

### Phase 28 — How To Play

**Goal:** Any visitor can learn the game fully before ever playing a match.

**Dependencies:** Phase 24 (TopBar handle display), Phase 25 (no SHOT references on page)

**Requirements:** HTP-01, HTP-02, HTP-03, HTP-04, HTP-05, HTP-06

**Success Criteria:**
1. Navigating to `/how-to-play` renders the full How To Play page with all sections and the complete weapons table, no wallet or login required
2. The page is visually consistent with SolShot: Black Ops One headings, Share Tech Mono body text, olive-dark background, bone text color, orange-rust accent elements
3. The weapons table is the visual centrepiece of the page, rendered cleanly with all weapon entries and stats
4. The TopBar on the How To Play page has an onBack prop that returns the user to the menu when clicked
5. The MenuScreen has a HOW TO PLAY link below the main nav buttons, styled as a secondary element that does not compete with PLAY FREE

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-4. Pre-GSD Work | v1.0 | — | Complete | 18 Feb 2026 |
| 1-8. Security Hardening | v1.1 | 25/25 | Complete | 23 Feb 2026 |
| 9-14. Launch Readiness | v1.2 | 15/15 | Complete | 25 Feb 2026 |
| 15-19. 4-Player Multiplayer | v1.3 | 10/10 | Complete | 27 Feb 2026 |
| 20-23. N-Player Escrow | v1.4 | 10/10 | Complete | 28 Feb 2026 |
| 24. Handle System | v2.0 | 0/? | Pending | — |
| 25. Menu and Token Masking | v2.0 | 0/? | Pending | — |
| 26. Lobby Lockdown | v2.0 | 0/? | Pending | — |
| 27. Practice Stats | v2.0 | 0/? | Pending | — |
| 28. How To Play | v2.0 | 0/? | Pending | — |

---

*Roadmap created: 26 Feb 2026*
*v1.3 archived: 27 Feb 2026*
*v1.4 archived: 28 Feb 2026*
*v2.0 added: 28 Feb 2026*
