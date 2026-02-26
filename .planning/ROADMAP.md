# Roadmap: SolShot

## Milestones

- ✅ **v1.0 Development** - Phases 1-4 (pre-GSD, shipped 18 Feb 2026)
- ✅ **v1.1 Security Hardening** - Phases 1-8 (shipped 23 Feb 2026)
- ✅ **v1.2 Launch Readiness** - Phases 9-14 (shipped 25 Feb 2026)
- 🚧 **v1.3 4-Player Multiplayer** - Phases 15-19 (in progress)

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

---

## 🚧 v1.3 4-Player Multiplayer (Phases 15-19)

**Milestone Goal:** Refactor SolShot from 1v1 to 2-4 player last-man-standing while preserving all existing 2-player functionality. Practice mode ships first; N-player escrow is deferred.

- [ ] **Phase 15: Server Core Services** — match.js, gold.js, and placement scoring rewritten for N players
- [ ] **Phase 16: Room Schema and Battle Engine** — players[] room model, N-player fire handler, terrain spawn
- [ ] **Phase 17: Server Systems** — shop, disconnect/reconnect, wager guard, playAgain for N players
- [ ] **Phase 18: Client Phaser and GameBridge** — tanks[] array, elimination handler, bridge state shape
- [ ] **Phase 19: React HUD and Lobby UI** — N HP bars, player count selector, N-slot waiting room

---

### Phase 15: Server Core Services

**Goal:** The server's isolated match state functions correctly model N-player turn rotation, elimination-aware round detection, and placement-based scoring so that all downstream handlers build on a correct foundation.

**Depends on:** Nothing (all functions are isolated services with no external dependencies)

**Requirements:** CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05, SCORE-06

**Success Criteria** (what must be TRUE):
1. A 4-player match state initializes with HP, scores, kills, and roundWins for all 4 socket IDs, `currentPlayerIndex: 0`, and `turnsPerRound: 40` (N * 10).
2. `getNextTurn()` cycles through all alive players in order — eliminated players are permanently skipped, and 2-player mode produces identical output to the original toggle.
3. `isRoundOver()` returns false when 2 of 4 players remain alive, and returns true only when 1 or fewer players are alive (or turns are exhausted).
4. `isMatchOver()` correctly identifies the leader using placement point totals (4th=0, 3rd=1, 2nd=2, 1st=3 per round) and resolves ties by total damage dealt.
5. `resetForNextRound()` restores all N players to 250 HP and alive status — including players who were never hit in the prior round.

**Plans:** 2 plans

Plans:
- [ ] 15-01-PLAN.md — Rewrite match.js: createMatchState, getNextTurn, isRoundOver, getRoundPlacement, isMatchOver, resetForNextRound for N players
- [ ] 15-02-PLAN.md — Rewrite gold.js initGold + awardPlacementGold, update all main.js call sites for new signatures

---

### Phase 16: Room Schema and Battle Engine

**Goal:** The server room uses a `players[]` array instead of `host`/`player`, the join guard allows up to `maxPlayers` connections, and the fire handler correctly applies damage to all N players, emits `playerEliminated`, and produces an N-player `turnResult` payload.

**Depends on:** Phase 15 (new match.js function signatures drive every call site)

**Requirements:** CORE-01, CORE-02, BATTLE-01, BATTLE-02, BATTLE-03, BATTLE-04, BATTLE-05, BATTLE-06, BATTLE-07, BATTLE-08, BATTLE-09, BATTLE-10, SYS-01, SYS-02, SYS-03

**Note:** CORE-01 and CORE-02 (players[] array and maxPlayers field) are foundational to both Phase 15 logic and Phase 16 schema — they are implemented here as the schema migration, with Phase 15 establishing the functions that operate on that schema.

**Success Criteria** (what must be TRUE):
1. A room created with `maxPlayers: 4` accepts four separate socket connections before locking, shows "2/4" in `getOpenRooms()` when half-filled, and blocks a fifth join attempt.
2. When Player 2 of 4 is eliminated mid-round, the fire handler emits `playerEliminated` before `turnResult`, Player 2's turn is never given again, and the remaining three players continue taking turns.
3. A Crazy Ivan or Hail Storm shot that kills two players simultaneously credits both eliminations and correctly transitions to the last-man-standing round-end state.
4. Homing weapons (Heatseeker) track to the nearest living enemy in a 4-player match — not always to the original second player.
5. The `turnResult` payload contains `players[]` with all N positions and alive states, plus `currentPlayerIndex`, compatible with both 2-player and 4-player clients.
6. A turn timeout in a 4-player match eliminates the timed-out player (not the entire match) after 3 consecutive no-fires; the match continues with remaining players.

**Plans:** TBD

Plans:
- [ ] 16-01: Room schema migration — players[] array, maxPlayers, compatibility shim, join guard fix, getOpenRooms update
- [ ] 16-02: N-player terrain and tank spawn — generateTankPositions(heightmap, N), eager HP init, terrainGenerated payload
- [ ] 16-03: Fire handler and elimination — N-player tank loop, playerEliminated event, simultaneous-kill handling, matchEnd survivorOrder, gold awards

---

### Phase 17: Server Systems

**Goal:** Every server system that touches player-specific state — shop, disconnect, reconnect, turn timer forfeit, playAgain, and wager validation — correctly handles 2 to 4 players.

**Depends on:** Phase 16 (requires stable players[] room shape and N-player socket event contract)

**Requirements:** SYS-04, SYS-05, SYS-06, SYS-07, SYS-08, SYS-09, SYS-10

**Success Criteria** (what must be TRUE):
1. In a 4-player match, the shop phase waits until all 4 players click "Done" before ending — a single player finishing early does not advance the phase.
2. A Player 3 who disconnects and reconnects within 30 seconds rejoins with their correct gold, weapons, HP, and turn position preserved — no state is orphaned under the old socket ID.
3. A 3-player match where one player disconnects permanently eliminates that player on reconnect window expiry and the remaining 2 players finish the match normally.
4. Attempting to create a wager room with `maxPlayers: 3` or `maxPlayers: 4` returns a clear server-side error; the match falls back to practice mode.
5. A rematch request in a 4-player match only starts if all surviving players agree; a single refusal returns all players to lobby.

**Plans:** TBD

Plans:
- [ ] 17-01: N-player shop system — initGold loop, weaponInventories loop, shopReady all-player check, endShopPhase N-inventory emit
- [ ] 17-02: N-player reconnect, disconnect, turn timer, playAgain, wager guard — migrateSocketId helper, pendingReconnects playerIndex, stepLeft/stepRight/positionUpdate

---

### Phase 18: Client Phaser and GameBridge

**Goal:** The Phaser scene renders N colored tanks, handles elimination animations, syncs all tank positions from `turnResult.players[]`, and the GameBridge state shape exposes `players[]`, `myPlayerIndex`, and `currentPlayerIndex` to React.

**Depends on:** Phase 17 (server must emit verified N-player payloads before client is updated to consume them)

**Requirements:** PHASER-01, PHASER-02, PHASER-03, PHASER-04, PHASER-05, PHASER-06, PHASER-07, BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04

**Success Criteria** (what must be TRUE):
1. Opening a 4-player practice match renders 4 distinctly colored tanks (red, blue, green, yellow) positioned across the terrain without overlap.
2. When a player is eliminated, their tank plays a destruction animation and becomes permanently inactive — other tanks continue moving and firing normally.
3. After elimination, the local player's view remains active (camera stays, controls disabled) and they can watch the remaining combat as a spectator.
4. Turn detection correctly enables controls only for the local player when `myPlayerIndex === currentPlayerIndex` and disables them for all other indices.
5. GameBridge `players[]` array updates after every `turnResult`, with each player's position, HP, alive status, name, and color — React HUD reads this array without additional socket access.

**Plans:** TBD

Plans:
- [ ] 18-01: Phaser MainScene refactor — tanks[] array, createTanks(N), terrainGenerated N-tank positioning, applyTurnResult players[] loop, checkSwitchTurn any-tank settled check, playerEliminated handler
- [ ] 18-02: GameBridge state shape — players[] replaces tank1/tank2, myPlayerIndex/currentPlayerIndex, setPlayerEliminated(index), reset() update

---

### Phase 19: React HUD and Lobby UI

**Goal:** Players can create rooms with 2/3/4 player slots, see all joined players with ready status in the waiting room, choose a color without duplicates, and during battle see N color-coded HP bars with live turn indicator and eliminated state.

**Depends on:** Phase 18 (HUD reads from GameBridge; lobby UI stability requires Phase 17 server socket events)

**Requirements:** HUD-01, HUD-02, HUD-03, HUD-04, HUD-05, LOBBY-01, LOBBY-02, LOBBY-03, LOBBY-04, LOBBY-05, LOBBY-06

**Success Criteria** (what must be TRUE):
1. The battle HUD displays N HP bars in a horizontal strip — each bar is color-coded with the player's chosen color, shows their name, and the active player's bar is visually highlighted.
2. When a player is eliminated, their HP bar immediately shows a greyed or crossed-out state that persists for the rest of the match.
3. Room creation offers a "Number of players" selector (2, 3, or 4); the room list shows "currentPlayers/maxPlayers" for each open room.
4. The waiting room displays all N player slots: filled slots show the player's name and color, empty slots show "Waiting…", and the host cannot start until all slots are filled and all players are ready.
5. The color picker prevents two players from selecting the same color — selecting a color already taken by another player is disabled or triggers automatic reassignment.
6. Quick Match matchmaking only proposes rooms matching the selected player count.

**Plans:** TBD

Plans:
- [ ] 19-01: N HP bar HUD — PlayerCard component, dynamic players.map() rendering, horizontal strip layout, turn highlight, eliminated styling
- [ ] 19-02: Lobby UI — player count selector, room list currentPlayers/maxPlayers, N-slot waiting room, color picker with duplicate prevention, Quick Match player-count filter

---

## Progress

**Execution Order:** 15 → 16 → 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-4. Pre-GSD Work | v1.0 | — | Complete | 18 Feb 2026 |
| 1-8. Security Hardening | v1.1 | 25/25 | Complete | 23 Feb 2026 |
| 9-14. Launch Readiness | v1.2 | 15/15 | Complete | 25 Feb 2026 |
| 15. Server Core Services | v1.3 | 0/2 | Not started | - |
| 16. Room Schema and Battle Engine | v1.3 | 0/3 | Not started | - |
| 17. Server Systems | v1.3 | 0/2 | Not started | - |
| 18. Client Phaser and GameBridge | v1.3 | 0/2 | Not started | - |
| 19. React HUD and Lobby UI | v1.3 | 0/2 | Not started | - |

---

*Roadmap created: 26 Feb 2026*
*v1.3 phases start at 15 (continues from v1.2 phase 14)*
