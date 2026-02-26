# Research Summary

**Project:** SolShot — v1.3 — 4-Player Multiplayer Refactor (1v1 to 2-4 Last-Man-Standing)
**Domain:** Browser-based server-authoritative artillery game, N-player multiplayer
**Researched:** 2026-02-26
**Confidence:** HIGH

---

## Executive Summary

The 4-player refactor is fundamentally an architectural migration, not a feature addition. No new libraries are needed — the existing React/Phaser/Socket.IO/Node.js stack is fully capable of N-player. The entire scope of work is replacing binary (1v1) hardpoints throughout the server and client with N-player data structures. The good news: roughly 80% of the server's in-memory state (`goldStates`, `weaponInventories`, `matchStates` sub-fields) is already keyed by socket ID and is N-player-compatible today. The bad news: the room object (`host`/`player`), the turn system (`getNextTurn`), the round-over check (`isRoundOver`), and every socket event payload that names `host` and `player` explicitly must all change.

The recommended approach is a phased migration that establishes the data contract first. Start with the isolated `match.js` service functions (zero external dependencies), then migrate the server room data model and establish a compatibility shim, then work outward through socket handlers, then update the client only after the server emits correct N-player payloads. This top-down server-first order prevents a situation where the client is updated to expect an N-player payload that the server is not yet sending. Practice mode (no wager) should be the first and only wager context until the Anchor escrow program is separately upgraded for N-player; adding N-player wager support on the binary escrow program would silently corrupt state.

The biggest risk is partial migration — `main.js` has approximately 60 locations that reference `room.host` or `room.player` by name. A compatibility shim (assigning `room.host = room.players[0]` and `room.player = room.players[1]` after every mutation) reduces this risk by keeping the 2-player code path working while handlers are migrated one at a time. The 2-player regression guarantee must hold throughout the refactor. The second-biggest risk is the `isRoundOver` function ending rounds on the first kill in a 4-player match — this is a silent correctness failure with no error thrown. Fix this before any multi-player testing.

---

## Key Findings

### Stack Additions Needed

No new dependencies are required. The existing stack handles everything:

**Version housekeeping only:**
- Socket.IO: server `^4.4.1` and client `^4.5.1` are misaligned; update both to `^4.8.3` at milestone start — low risk, clean housekeeping
- Phaser 3: current `^3.55.2`, latest stable is `3.90.0` — **do not upgrade during this milestone**, the N-player refactor does not require any APIs added after 3.55.2, and compounding a major architecture change with a Phaser upgrade multiplies regression risk

**Explicitly do not add:**
- Redux/Zustand — GameBridge dirty-flag pattern already solves React-Phaser state sync
- Colyseus or any game server framework — would require rewriting 2750+ validated lines of `main.js`
- Any N-player lobby management library — Socket.IO rooms + `players[]` array is sufficient

See `STACK.md` for full version currency analysis and "What NOT to Add" rationale.

---

### Feature Table Stakes vs. Differentiators

**Must ship (table stakes — absence breaks the product):**
- Round-robin turn order with eliminated-player skipping — the game halts without this
- Last-man-standing win condition (`alive count <= 1`) — the core N-player format
- N HP bars in HUD with color coding (red/blue/green/yellow) and turn indicator
- Eliminated player visual state (tank destroyed, HP bar greyed out)
- Player count selector at room creation (2, 3, or 4)
- Lobby showing N player slots with names and ready status
- Game starts only when all slots filled AND all players ready
- Spectator state after elimination (client watches remaining combat passively)
- Disconnected player in 3-4 player match: eliminate-on-timeout, match continues

**Should have (differentiators — add real value, not universally expected):**
- Post-round placement summary screen (1st/2nd/3rd/4th with gold earned) — replaces binary win/lose screen
- Seeker device badge in waiting room — low-lift identity signal for target hardware

**Defer to follow-on milestone:**
- BO3/BO5 for 3-4 player matches — ship BO1 FFA only at launch; multi-round N-player needs separate design work
- Placement-based scoring (Worms WMD 4/3/2/1 pts per round) — requires scoring model that rewards 2nd/3rd place meaningfully
- Gold economy scale factor (`1/(N-1)` per-hit multiplier) — defer; BO1 FFA has no between-round shop, so imbalance is only relevant when BO3/BO5 N-player ships
- N-player escrow / Anchor program changes — binary PDA, do not touch until dedicated escrow milestone
- Placement-based pot split (60/25/15 for 4-player) — very high Anchor complexity, not needed at launch
- Team modes (2v2) — entirely separate feature set, not an extension of FFA
- AI bot fill for incomplete lobbies — requires physics-capable AI, separate multi-week milestone

See `FEATURES.md` for genre research (Worms WMD, ShellShock Live) and anti-feature analysis.

---

### Architecture: Key Integration Points and Build Order

The migration has approximately 10 seams that must change. The build order is strictly dependency-driven: isolated services first, shared data model second, socket handlers third, client last.

**Key components and their required changes:**

| Component | Status | Core Change |
|-----------|--------|-------------|
| `server/services/match.js` | Rewrite 4 functions | `getNextTurn` → circular queue; `isRoundOver` → alive count; binary signatures → `players[]` param |
| `server/services/gold.js` | Signature only | `initGold(hostId, playerId)` → `initGold(playerIds[])` |
| `server/services/physics.js` | Extend | `generateTankPositions(heightmap, playerCount)` — N-zone spawn distribution |
| `server/socket-io/main.js` | ~30 change sites | Room schema, ~15 handlers, reconnect, turn timer, disconnect flow |
| `client/src/bridge/GameBridge.js` | State shape | `tank1/tank2/activeTank` → `players[]/myPlayerIndex/currentPlayerIndex` |
| `client/src/scenes/main/index.js` | Major refactor | `this.tank1/tank2` → `this.tanks[]`; elimination handler; terrain handler |
| React HUD components | Moderate | N HP bars via `players.map()`, `PlayerCard` component, lobby slot display |
| `programs/solshot-escrow/` | Unchanged (deferred) | Binary escrow untouched until N-player wager milestone |

**Critical interface changes (socket event payloads):**

| Event | Change Required |
|-------|----------------|
| `createRoom` | Add `maxPlayers: 2\|3\|4` |
| `terrainGenerated` | `tankPositions: {host, player}` → `tankPositions: [{socketId, x, y}, ...]` |
| `turnResult` | `tankPositions: {host, player, hostId}` → `players: [{socketId, x, y, alive}]` + `currentPlayerIndex` |
| `matchEnd` | Add `survivorOrder: socketId[]` |
| `playerEliminated` | NEW: `{ playerIndex, socketId }` |

**Recommended build order (9 phases, server-to-client):**
1. `match.js` + `gold.js` service rewrites (isolated, no external deps)
2. Server room data model: `players[]` replaces `host`/`player`, with compatibility shim
3. Lobby flow: `ready`, `shopPhase`, `shopDone` — all-player checks
4. `requestTerrain` + N-zone `generateTankPositions`
5. `fire` handler — elimination loop, N-player `turnResult` payload
6. Remaining server handlers (reconnect, step, turn timer, disconnect, playAgain)
7. Client — Phaser `MainScene`: `tanks[]` array, elimination handler
8. Client — `GameBridge`: `players[]` state shape
9. Client — React HUD: N HP bars, lobby UI, player count selector

See `ARCHITECTURE.md` for line-number-traced code locations and specific rewrite targets.

---

### Top Pitfalls to Watch

All pitfalls below are traced to specific lines in the codebase (see `PITFALLS.md` for full detail).

**Critical — will break correctness silently:**

1. **`isRoundOver` ends round on first kill** (`match.js` line 151-160) — the current code returns `true` when ANY player HP hits 0, not when only one player survives. In a 4-player match, the round ends after the first kill. Fix: change to `alive count <= 1`. This is the first function to touch before any N-player testing.

2. **`room.active = true` locks out players 3 and 4** (`main.js` lines 1004-1006) — the join guard blocks any join when `room.active === true`, which is set the moment the second player joins regardless of `maxPlayers`. Fix: `if (room.players.length >= room.maxPlayers) room.active = true`. Must ship with the room schema migration or the lobby is non-functional for N-player.

3. **`getNextTurn` skips players 3+ entirely** (`match.js` line 136-143) — binary toggle, no concept of a player list. Player 3 is silently never given a turn. Fix: circular queue with `players[]` param and skip-dead logic.

4. **`room.host`/`room.player` binary schema at ~60 locations** (`main.js`, all handlers) — partial migration produces a broken state where 2-player tests fail and N-player does not yet work. Fix: shim `room.host = room.players[0]` and `room.player = room.players[1]` immediately after the schema change; migrate handlers one at a time against the shim.

5. **Simultaneous splash-damage kills in N-player** (`main.js` fire handler, HP update loop) — Crazy Ivan or Hail Storm can kill 2+ players in a single `result.damage` object. Fix: run a full `updateEliminated(ms)` pass after the entire HP loop, before calling `isRoundOver`. Node.js is single-threaded so there is no true race, but the stale `alive` check must be resolved post-loop.

**High — wrong results, may be subtle:**

6. **`shopDone` never fires with 3+ players** — `shopReady` check is `ready[hostId] && ready[playerId]`, ignoring players 3-4. Fix: `room.players.every(p => ready[p.socketId])`.

7. **Reconnecting player 3/4 loses all state** — `rejoinRoom` is a binary if/else for host vs player. Fix: `migrateSocketId(oldId, newId, roomId)` helper that covers all `room.players[i]` slots via array lookup.

8. **`turnsPerRound` hardcoded to 20** — in a 4-player game this is 5 turns each; in a 3-player game it is not evenly divisible. Fix: `turnsPerRound = N * 10` at match state creation.

9. **Gold economy inflation with more targets** — `+15G per HP` against 3 opponents yields 3x the gold rate of 1v1, trivializing weapon costs. This only matters for BO3/BO5 N-player (shop between rounds); safe to defer for BO1-only launch.

10. **N-player wager on binary escrow corrupts state** — the Anchor program has hardcoded `player_one_deposited` and `player_two_deposited` booleans. Fix: server guard rejects `maxPlayers > 2` + `wager > 0` with a clear error message until the escrow milestone.

---

## Open Design Decisions

These must be resolved before implementation begins. They are not covered by research.

**1. BO1 only or BO3/BO5 for N-player at launch?**
Research recommendation: ship BO1 FFA only for 3-4 players. BO3/BO5 multi-round with N players requires placement-based scoring design and weapon-inventory carry-forward logic that is meaningfully different from 1v1 BO3. Deferring keeps the launch scope clean. CONFIRM this with stakeholders before writing any round-tracking code.

**2. Does a 3-player/4-player match allow 2 human players to start with empty slots?**
Research recommendation: require all slots filled before the match starts. No AI bots, no empty slots. Forcing full lobbies simplifies all "who wins if someone is never present" edge cases. If this is too restrictive for early access, add a "start early" host button as a config flag — but build the "require full" path first.

**3. What colors are assigned to players 3 and 4?**
The brief specifies red/blue/green/yellow. Confirm the color-to-slot assignment (slot 0=red, slot 1=blue, slot 2=green, slot 3=yellow) and ensure the server enforces these assignments at room join time. Colors must be locked to slot index, not chosen freely, to avoid two players with the same color.

**4. What happens to the existing `matchMode` (Quick Match, Duel, High Roller) for N-player?**
These modes have server-enforced wager and format constraints. High Roller is explicitly a wager mode. For v1.3, the safest approach is: Quick Match and Duel modes remain 2-player only; a new "FFA" or "Battle Royale" mode is added for 3-4 players with `wager: 0` enforced server-side. Confirm whether 3-4 player wager is in scope at all for this milestone.

**5. How does `playAgain` / rematch work for N-player?**
Currently both players must request `playAgain` to reset. For N-player, if one of 4 players declines a rematch, do the remaining 3 proceed? Or does all-players-agree remain the rule? Recommend: all-players-agree for simplicity; unagreed rematches return to lobby. This affects `playAgainRequest` handler design.

---

## Recommended Phase Structure

Based on the dependency graph in FEATURES.md and the build order from ARCHITECTURE.md:

### Phase 1: Server Core — Match State Services
**Rationale:** `match.js` has zero external dependencies and exports the functions that everything else in `main.js` calls. Rewriting these first establishes correct N-player logic in isolation before it is wired into the 2750-line handler file. Failures here are immediately detectable with unit tests.
**Delivers:** N-player turn rotation, elimination-aware round-over detection, N-player match-over check, correct `turnsPerRound`, N-player gold initialization
**Addresses:** Pitfalls 1, 3, 7 (getNextTurn, isRoundOver, turnsPerRound)
**Note:** Needs deeper planning — `isMatchOver` signature change has multiple callers; BO1-only decision must be locked before touching `isMatchOver`.

### Phase 2: Server Room Data Model + Lobby Foundation
**Rationale:** The room schema is the structural root cause of every binary hardpoint. Once `room.players[]` exists with a compatibility shim, individual handlers can be migrated without breaking the 2-player path. The `room.active` join guard must ship in this phase or no 3-4 player rooms can be created.
**Delivers:** `players[]` room shape, `maxPlayers` field, compatibility shim, fixed join guard, N-player `getOpenRooms`, `createRoom` with `maxPlayers` param
**Addresses:** Pitfalls 2, 4 (binary schema permeation, active flag)
**Note:** Standard patterns — mechanical migration with the shim strategy. No research needed.

### Phase 3: Lobby Flow + Shop System
**Rationale:** Depends on Phase 2 room shape. The `ready`, `shopPhase`, `shopDone`, and `endShopPhase` handlers all use binary checks that must become `room.players.every(...)`. This phase also wires up the client lobby UI (player count selector, N-slot waiting room).
**Delivers:** N-player ready gate, N-player shop initialization and completion, lobby UI with 2/3/4 slot display
**Addresses:** Pitfall 10 (shopDone never fires)
**Note:** Standard patterns.

### Phase 4: Physics — N-Player Terrain and Tank Spawn
**Rationale:** Depends on Phase 2 (need `room.players.length` to calculate spawn count). `generateTankPositions` is a self-contained function in `physics.js`. This phase also initializes `ms.hp` for all N players eagerly (not lazily on first hit), fixing the round-reset gap.
**Delivers:** N equally-spaced spawn zones across 1200px terrain, minimum separation enforcement, eager HP initialization
**Addresses:** Pitfall 13, 16 (terrain spacing, lazy HP initialization)
**Note:** Standard patterns. Zone math is straightforward.

### Phase 5: Server Battle Logic — Fire Handler and Elimination
**Rationale:** This is the most complex phase. Depends on Phase 1 (new `getNextTurn`, `isRoundOver` signatures), Phase 2 (players array), and Phase 4 (N tank positions). The fire handler must emit `playerEliminated` before `turnResult`, update the N-player `turnResult` payload, and run the full elimination loop before calling `isRoundOver`.
**Delivers:** N-player `turnResult` payload, `playerEliminated` event, simultaneous-kill handling, N-player gold awards, updated `matchEnd` with `survivorOrder`
**Addresses:** Pitfalls 3, 5 (isRoundOver, simultaneous-kill race)
**Note:** Needs careful testing — write socket integration tests with 3 mock clients specifically for: turn order with N=3; turn order after elimination; simultaneous splash kills.

### Phase 6: Remaining Server Handlers
**Rationale:** Cleanup phase. All remaining binary handlers in `main.js` that were not covered in Phases 2-5. Reconnect is in this phase because it requires `players[]` from Phase 2 and the `migrateSocketId` helper.
**Delivers:** N-player reconnect (playerIndex-keyed), N-player disconnect/eliminate-on-timeout, N-player `stepLeft`/`stepRight`/`positionUpdate`, turn timer N-player forfeit, N-player `playAgainRequest`, wager guard for N-player + wager
**Addresses:** Pitfalls 6, 12, 19, 20 (reconnect, wager, step handlers, positionUpdate)
**Note:** Reconnect migration needs care — `pendingReconnects` shape change from `isHost` to `playerIndex` is a breaking change for any in-flight reconnects during deploy.

### Phase 7: Client — Phaser Scene
**Rationale:** Client work begins only after the server emits correct N-player payloads. Attempting to build the client scene before the server payloads are stable means constant re-work as the protocol changes. The Phaser scene is the client's most complex component.
**Delivers:** `this.tanks[]` array, `createTanks(count)`, `terrainGenerated` N-tank positioning, `applyTurnResult` iterating players array, `playerEliminated` handler with tank destruction animation, `checkSwitchTurn` using `.some()` over all tanks
**Addresses:** Pitfall 8 (hardcoded tank1/tank2), Pitfall 9 (tankPositions named fields)
**Note:** Needs deeper planning — the `checkSwitchTurn` practice mode path uses local turn-switching that must be rethought for N-player. Practice mode with N players needs a clear local turn-rotation design before coding.

### Phase 8: Client — GameBridge
**Rationale:** GameBridge is the state contract between Phaser and React. Change it after the Phaser scene is updated (Phase 7) so the Phaser writes and React reads are updated together.
**Delivers:** `players[]` state shape in bridge, `myPlayerIndex`/`currentPlayerIndex`, `setPlayerEliminated(playerIndex)` method, updated `reset()`
**Note:** Standard patterns — mechanical state shape migration.

### Phase 9: Client — React HUD and Lobby UI
**Rationale:** React HUD reads from GameBridge. Finalize after GameBridge shape is locked. Lobby UI changes can technically be done earlier but are most stable once the full server socket event set is in place.
**Delivers:** `PlayerCard` component replacing binary `ScoreBoard`, N HP bars, eliminated state display, turn highlight, player count selector, N-slot lobby waiting room
**Addresses:** Pitfall 14 (hardcoded 2-scoreboard HUD)
**Note:** Standard patterns — flex layout, `.map()` rendering.

### Phase Ordering Rationale

- Phases 1-6 are server-only — they do not require client changes and can be tested with socket.io-client scripts against the dev server
- The compatibility shim in Phase 2 is the linchpin — without it, migrating the 60+ `room.host`/`room.player` references in one commit is a high-risk big-bang change
- Phases 7-9 are client-only and begin only when the server emits verified N-player payloads
- Escrow and wager changes are explicitly excluded from all phases — the wager guard in Phase 6 ensures no accidental N-player wager corruption

### Research Flags

Phases that need deeper planning/design work before coding:
- **Phase 1:** `isMatchOver` signature change has multiple callers in `main.js`; the BO1-only decision must be locked before touching this function or the callers will be rewritten incorrectly
- **Phase 5:** Requires integration test setup with 3-4 mock socket clients before coding; the simultaneous-kill edge case and turn-rotation correctness are impossible to verify by inspection alone
- **Phase 7:** Practice mode N-player local turn-switching (`checkSwitchTurn` for `gameType === 4`) has no documented design; this needs a decision before the Phaser scene refactor begins

Phases with well-documented patterns (skip additional research):
- **Phase 2:** Schema migration with shim — mechanical, well-understood pattern
- **Phase 3:** Binary-to-N-player `every()` checks — trivial once the schema is in place
- **Phase 4:** Zone-based spawn math — fully specified in ARCHITECTURE.md
- **Phase 8:** State shape migration in GameBridge — mechanical
- **Phase 9:** `players.map()` HUD rendering — standard React patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack verified against current codebase. No new libraries confirmed. Socket.IO 4.8.3 upgrade is low-risk. |
| Features | MEDIUM | Table stakes verified against Worms WMD and ShellShock Live. BO3/BO5 N-player is under-documented in the genre — recommendation to defer is inference from first principles, not verified genre precedent. |
| Architecture | HIGH | All claims traced to specific line numbers in the actual codebase. Build order derived from real dependency graph, not assumption. |
| Pitfalls | HIGH | All 22 pitfalls traced to specific file locations. No generic advice — every finding is codebase-specific. |

**Overall confidence: HIGH**

### Gaps to Address

- **`checkSwitchTurn` practice mode design for N-player:** The current function handles local turn-switching for `gameType === 4` (practice). With N players in practice mode, who controls player 2, 3, 4? All controlled by the same browser? Auto-advance after fire? This is undefined and must be decided before Phase 7.
- **Color assignment enforcement:** The brief mentions red/blue/green/yellow. The server does not currently enforce color uniqueness per slot. Decide whether colors are assigned by slot (deterministic) or chosen by player (with duplicate prevention) before Phase 2.
- **`matchMode` eligibility for N-player:** Which of the existing match modes (Quick Match / Duel / High Roller) are available for 3-4 player rooms? High Roller is wager-only and must be blocked. Quick Match is unclear. A clean decision prevents the server-side validation in Phase 6 from being rewritten.
- **Testing infrastructure:** No socket.io integration tests exist for the game server. Phase 5 is the hardest phase to verify manually. Decide before implementation starts whether to write integration tests (recommended) or rely entirely on manual multi-browser testing.

---

## Sources

### Primary (HIGH confidence — direct codebase reading)
- `server/socket-io/main.js` (~2750 lines) — all handler locations and binary patterns
- `server/services/match.js` — all 4 binary functions, exact line numbers
- `server/services/gold.js` — `initGold` binary signature
- `server/services/physics.js` — `generateTankPositions` current spawn zones
- `client/src/scenes/main/index.js` — tank hardpoints, `checkSwitchTurn`, `applyTurnResult`
- `client/src/screens/battle/BattleHUD.js` — binary ScoreBoard layout
- `client/src/bridge/GameBridge.js` — `tank1`/`tank2` state shape
- `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md` — project brief and target architecture

### Secondary (MEDIUM confidence — external genre research)
- [Worms Armageddon Wiki](https://worms.fandom.com/wiki/Worms_Armageddon) — turn order, round-robin mechanics
- [ShellShock Live Wikipedia](https://en.wikipedia.org/wiki/ShellShock_Live) — FFA deathmatch, elimination, spectating
- [ShellShock Live game modes archive](https://shellshock-live-archive.fandom.com/wiki/Game_Modes) — mode variants
- [Worms WMD FFA discussion (Steam)](https://steamcommunity.com/app/327030/discussions/0/1488866813778981941/) — kingmaking dynamics
- [Last Man Standing genre definition (Wikipedia)](https://en.wikipedia.org/wiki/Last_man_standing_(video_games)) — spectate pattern

### Tertiary (informational)
- [Phaser 3.90.0 stable release](https://phaser.io/download/stable) — version currency
- [Phaser 4 Beta 7](https://phaser.io/news/2025/03/phaser-v4-beta-7-released) — not viable for production
- [Socket.IO 4.8.3 changelog](https://socket.io/docs/v4/changelog/4.8.3) — no breaking changes from 4.4.x
- [Poker tournament payout structure](https://beastsofpoker.com/poker-tournament-payout-structure/) — N-player pot split ratios reference

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
