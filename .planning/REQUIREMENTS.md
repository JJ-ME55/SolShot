# Requirements: SolShot v1.3 — 4-Player Multiplayer

**Defined:** 26 Feb 2026
**Core Value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## v1.3 Requirements

### Server Core (CORE)

- [x] **CORE-01**: Room data model uses `players[]` array (2-4 slots) instead of `host`/`player`
- [x] **CORE-02**: `maxPlayers` field on room (2, 3, or 4) set at creation time
- [ ] **CORE-03**: `getNextTurn()` rotates through alive players in order, skipping eliminated
- [ ] **CORE-04**: `isRoundOver()` returns true when 1 or fewer players alive
- [ ] **CORE-05**: `isMatchOver()` uses placement scoring for N-player BO3/BO5 (4th=0, 3rd=1, 2nd=2, 1st=3pts)
- [ ] **CORE-06**: `createMatchState()` initializes HP, scores, kills, roundWins for N players
- [ ] **CORE-07**: `currentPlayerIndex` tracks turn position in players[] array
- [ ] **CORE-08**: 2-player mode (`maxPlayers: 2`) works identically to current 1v1 (backward compat)

### Server Battle (BATTLE)

- [x] **BATTLE-01**: Fire handler applies damage to all N players from weapon physics
- [x] **BATTLE-02**: `playerEliminated` event emitted when a player's HP reaches 0
- [x] **BATTLE-03**: Eliminated players are skipped in turn rotation
- [x] **BATTLE-04**: Simultaneous eliminations handled correctly (splash damage kills 2+ in one shot)
- [x] **BATTLE-05**: Homing weapons target nearest living enemy (not just "the other tank")
- [x] **BATTLE-06**: `turnResult` payload includes all N players' positions and `currentPlayerIndex`
- [x] **BATTLE-07**: Turn timeout (60s) eliminates the timed-out player in N-player (not end match)
- [x] **BATTLE-08**: 3 consecutive timeouts eliminates player (not ends match) for N-player
- [x] **BATTLE-09**: `matchEnd` includes `survivorOrder[]` (placement: 1st through Nth)
- [x] **BATTLE-10**: N-player tank position generation distributes tanks across terrain zones

### Server Systems (SYS)

- [x] **SYS-01**: Gold system initializes for N players (1000G each)
- [x] **SYS-02**: Gold earnings from damage scale correctly with N targets
- [x] **SYS-03**: Weapon inventories initialized for N players
- [ ] **SYS-04**: Shop phase waits for all N players to finish shopping
- [ ] **SYS-05**: Disconnect/reconnect works for N players (wallet-keyed, playerIndex preserved)
- [ ] **SYS-06**: Disconnected player forfeit timeout triggers elimination (not match end)
- [ ] **SYS-07**: All match modes (Practice/Quick Match/Duel/High Roller) accept 2-4 players
- [ ] **SYS-08**: Wager modes with 3-4 players enforce practice-only until escrow upgrade
- [ ] **SYS-09**: `getOpenRooms()` broadcasts player count (e.g. "2/4") and maxPlayers
- [ ] **SYS-10**: `playAgainRequest` requires all surviving players to agree

### Client Phaser (PHASER)

- [ ] **PHASER-01**: Dynamic `tanks[]` array replaces `tank1`/`tank2`
- [ ] **PHASER-02**: `myPlayerIndex` identifies local player's position in the array
- [ ] **PHASER-03**: Turn detection uses `myPlayerIndex === currentPlayerIndex`
- [ ] **PHASER-04**: Eliminated tank plays destruction animation and becomes inactive
- [ ] **PHASER-05**: Position sync from `turnResult.players[]` updates all N tanks
- [ ] **PHASER-06**: Player continues to spectate after elimination (camera stays, controls disabled)
- [ ] **PHASER-07**: Tank colors assigned from player's chosen color

### Client HUD (HUD)

- [ ] **HUD-01**: N HP bars displayed (color-coded per player)
- [ ] **HUD-02**: Eliminated players' HP bars show greyed/crossed-out state
- [ ] **HUD-03**: Current turn player indicated (arrow, glow, or highlight)
- [ ] **HUD-04**: Player names displayed above/beside each HP bar
- [ ] **HUD-05**: 4-player layout: horizontal strip across top, each bar ~1/4 width

### Client Lobby (LOBBY)

- [ ] **LOBBY-01**: Room creation includes "Number of players" selector (2/3/4)
- [ ] **LOBBY-02**: Room list shows `currentPlayers/maxPlayers` (e.g. "2/4")
- [ ] **LOBBY-03**: Waiting room shows all N joined players with ready status
- [ ] **LOBBY-04**: Game starts only when all slots filled AND all players ready
- [ ] **LOBBY-05**: Color picker per player with duplicate prevention
- [ ] **LOBBY-06**: Quick Match finds rooms matching selected player count

### GameBridge (BRIDGE)

- [ ] **BRIDGE-01**: GameBridge `players[]` array replaces `tank1`/`tank2` state
- [ ] **BRIDGE-02**: Bridge relays `currentPlayerIndex` and `myPlayerIndex`
- [ ] **BRIDGE-03**: Bridge relays elimination state per player
- [ ] **BRIDGE-04**: Bridge relays player colors and names

### Round Scoring (SCORE)

- [ ] **SCORE-01**: BO1 with N players: last man standing wins
- [ ] **SCORE-02**: BO3/BO5 with N players: placement scoring per round (4th=0, 3rd=1, 2nd=2, 1st=3)
- [ ] **SCORE-03**: Match winner is player with most cumulative points after all rounds
- [ ] **SCORE-04**: Tiebreaker: total HP damage dealt across all rounds
- [ ] **SCORE-05**: Round reset restores all players to 250 HP and alive status
- [ ] **SCORE-06**: Between-round scoreboard shows cumulative placement points

## v2 Requirements (Deferred)

### N-Player Escrow

- **ESC-01**: Anchor escrow program supports N-player deposits (requires lib.rs changes)
- **ESC-02**: N-player settlement: winner-takes-all or placement split
- **ESC-03**: N-player cancel/refund for all depositors

### Advanced Features

- **ADV-01**: Team mode (2v2)
- **ADV-02**: Spectator mode (non-players can watch)
- **ADV-03**: Match replay system
- **ADV-04**: Tournament bracket for N-player

## Out of Scope

| Feature | Reason |
|---------|--------|
| N-player escrow program | Requires lib.rs modification — separate milestone to preserve audit certs |
| Real-money wagers for 3-4p | Blocked by binary escrow — practice-only until escrow upgrade |
| Team mode (2v2) | Additional complexity, deferred to v1.4+ |
| Spectator mode (non-player) | Nice-to-have, not table stakes for 4-player |
| Real-time simultaneous play | SolShot is turn-based, not changing core mechanic |
| artil-io code reuse | Different architecture (real-time vs turn-based), data model pattern confirmed only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 16 | Complete |
| CORE-02 | Phase 16 | Complete |
| CORE-03 | Phase 15 | Complete |
| CORE-04 | Phase 15 | Complete |
| CORE-05 | Phase 15 | Complete |
| CORE-06 | Phase 15 | Complete |
| CORE-07 | Phase 15 | Complete |
| CORE-08 | Phase 15 | Complete |
| BATTLE-01 | Phase 16 | Complete |
| BATTLE-02 | Phase 16 | Complete |
| BATTLE-03 | Phase 16 | Complete |
| BATTLE-04 | Phase 16 | Complete |
| BATTLE-05 | Phase 16 | Complete |
| BATTLE-06 | Phase 16 | Complete |
| BATTLE-07 | Phase 16 | Complete |
| BATTLE-08 | Phase 16 | Complete |
| BATTLE-09 | Phase 16 | Complete |
| BATTLE-10 | Phase 16 | Complete |
| SYS-01 | Phase 16 | Complete |
| SYS-02 | Phase 16 | Complete |
| SYS-03 | Phase 16 | Complete |
| SYS-04 | Phase 17 | Pending |
| SYS-05 | Phase 17 | Pending |
| SYS-06 | Phase 17 | Pending |
| SYS-07 | Phase 17 | Pending |
| SYS-08 | Phase 17 | Pending |
| SYS-09 | Phase 17 | Pending |
| SYS-10 | Phase 17 | Pending |
| PHASER-01 | Phase 18 | Pending |
| PHASER-02 | Phase 18 | Pending |
| PHASER-03 | Phase 18 | Pending |
| PHASER-04 | Phase 18 | Pending |
| PHASER-05 | Phase 18 | Pending |
| PHASER-06 | Phase 18 | Pending |
| PHASER-07 | Phase 18 | Pending |
| HUD-01 | Phase 19 | Pending |
| HUD-02 | Phase 19 | Pending |
| HUD-03 | Phase 19 | Pending |
| HUD-04 | Phase 19 | Pending |
| HUD-05 | Phase 19 | Pending |
| LOBBY-01 | Phase 19 | Pending |
| LOBBY-02 | Phase 19 | Pending |
| LOBBY-03 | Phase 19 | Pending |
| LOBBY-04 | Phase 19 | Pending |
| LOBBY-05 | Phase 19 | Pending |
| LOBBY-06 | Phase 19 | Pending |
| BRIDGE-01 | Phase 18 | Pending |
| BRIDGE-02 | Phase 18 | Pending |
| BRIDGE-03 | Phase 18 | Pending |
| BRIDGE-04 | Phase 18 | Pending |
| SCORE-01 | Phase 15 | Complete |
| SCORE-02 | Phase 15 | Complete |
| SCORE-03 | Phase 15 | Complete |
| SCORE-04 | Phase 15 | Complete |
| SCORE-05 | Phase 15 | Complete |
| SCORE-06 | Phase 15 | Complete |

**Coverage:**
- v1.3 requirements: 56 total (note: initial count of 49 was before SCORE-01..06 were added)
- Mapped to phases: 56
- Unmapped: 0

| Phase | Requirements |
|-------|-------------|
| Phase 15 | CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05, SCORE-06 (12) |
| Phase 16 | CORE-01, CORE-02, BATTLE-01..10, SYS-01, SYS-02, SYS-03 (15) |
| Phase 17 | SYS-04..10 (7) |
| Phase 18 | PHASER-01..07, BRIDGE-01..04 (11) |
| Phase 19 | HUD-01..05, LOBBY-01..06 (11) |

---
*Requirements defined: 26 Feb 2026*
*Last updated: 26 Feb 2026 — traceability filled in after roadmap creation*
