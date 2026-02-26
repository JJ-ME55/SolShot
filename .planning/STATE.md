# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 26 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.3 — 4-Player Multiplayer, Phase 18: Client Phaser and GameBridge

## Current Position

Milestone: v1.3 — 4-Player Multiplayer
Phase: 18 of 19 (Client Phaser and GameBridge) — COMPLETE
Plan: 2 of 2 in Phase 18 — COMPLETE
Status: Phase complete — ready for Phase 19
Last activity: 26 Feb 2026 — Completed 18-02-PLAN.md (elimination visuals, spectator mode, name labels)

Progress: [████████░░] ~80% (8/10 v1.3 plans)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)

**Total across all milestones:** 56 plans, 23 phases

## Accumulated Context

### Key Decisions (carried forward)
- 16-01: room.players[] ordered array — players[0] is always host (room creator), players[n-1] is last joiner
- 16-01: maxPlayers defaults to 2 if client omits player.maxPlayers (UI not yet updated)
- 16-01: joinRoom race guard uses push-before-async (pop on failure) not room.active=true
- 16-01: startPick emits both legacy host/player shim AND new players[] canonical field
- 16-01: persistRoom writes players[0]/players[1] as DB host/player — Match model unchanged
- 16-01: getPlayerSlot(room, socketId) helper available to all future handlers
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- Three audits complete: SOS, DB, BOK — all PASS
- Do NOT modify lib.rs — preserves audit certifications
- Jupiter Mobile via Reown, Price API V3, Terminal SDK with 0.5% platform fee
- Practice mode as default landing tab
- Self-hosted Telegram SDK (supply chain security)
- 4-player: practice mode first, escrow N-player changes deferred
- 4-player: players[] array replaces host/player binary structure
- 4-player: BO1/BO3/BO5 all supported with placement scoring (4th=0, 3rd=1, 2nd=2, 1st=3)
- 4-player: all slots must fill before start (no AI bots, no empty slots)
- 4-player: color CHOICE with duplicate prevention (red/blue/green/yellow)
- 4-player: wager modes with 3-4 players are practice-only until escrow upgrade
- Tank colours: red #E63946, blue #4A90D9, green #52B788, yellow #FFD166
- 15-01: players[] intentionally empty at createMatchState; populated at requestTerrain (Plan 15-02)
- 15-01: isMatchOver has no early exit — all rounds always played; winner by cumulative placementPoints
- 15-01: getRoundWinner removed; getRoundPlacement returns ranked[] with PLACEMENT_POINTS[3,2,1,0]
- 15-01: roundWins[1st] side-effect kept in getRoundPlacement for backward compat with disconnect chain
- 15-01: isRoundOver uses alive map with HP fallback until Phase 16 updates fire handler
- 15-02: initGold(playerIds[]) — backward compat: initGold([A,B]) produces {A:1000, B:1000}
- 15-02: PLACEMENT_GOLD [300,150,75,0] replaces flat ROUND_WIN_BONUS for N-player round-end
- 15-02: ms.players[] populated at requestTerrain from room.host/room.player (pre-Phase 16 compat block)
- 15-02: ms.players.length > 1 replaces old playerId ? guard for post-fire getNextTurn
- 15-02: roundEnd emit now includes placementPoints field (SCORE-06 server-side)
- 16-02: generateTankPositions(heightmap, N, width) → Array<{x,y}> — N=2 preserves original zones, N>2 uses equal [10%-90%] zones
- 16-02: ms.tankPositions stores positions[] array (not {host,player} object)
- 16-02: dual-payload pattern: all terrain emits send positions[] canonical + tankPositions shim
- 16-02: turnResult also updated with dual payload (bonus fix for consistency)
- 16-03: tanks[] in fire handler built from room.players[] filtered by ms.alive (N-player, living only)
- 16-03: elimination loop iterates ms.players[] for deterministic simultaneous-kill order
- 16-03: playerEliminated event emitted in fire handler AND timeout path
- 16-03: turnResult includes players[], alive, currentPlayerIndex alongside backward-compat shims
- 16-03: matchEnd includes survivorOrder[] from getRoundPlacement ranked array
- 16-03: timeout >2 alive = player elimination + round-end path; <=2 alive = forfeit-ends-match
- 16-03: rejoinRoom unified remap via room.players.find(oldSocketId) — all per-player maps remapped
- 16-03: zero room.host/room.player (singular) references in main.js — migration complete
- 16-03: homing weapon uses Math.hypot nearest-enemy targeting
- 17-01: wager guard placed after matchMode validation — maxPlayers declaration moved up to avoid duplicate const
- 17-01: reconnectExpired uses currentRoom (re-read inside setTimeout) not opponentId captured at disconnect time
- 17-01: pendingReconnects keeps isHost for backward compat AND adds playerIndex for N-player correctness
- 17-01: shopReady remap inserted after consecutiveTimeouts remap and before ms.players[] remap in rejoinRoom
- 17-01: wager guard (wagerAmount > 0 && maxPlayers > 2) will need removal in Phase 19 when escrow supports N-player
- 18-01: tanks[] indexed to room.players[] order — myPlayerIndex tracks local player (not host/joiner perspective)
- 18-01: terrainGenerated reads positions[] canonical with tankPositions shim fallback
- 18-01: createTanks(N) uses sceneData.players?.length || 2 (resilient fallback for type4/old clients)
- 18-01: fireRejected guards myPlayerIndex >= 0 before tanks[myPlayerIndex] access
- 18-01: backward-compat tank1/tank2 shims in GameBridge and _pushStateToBridge until Phase 19
- 18-01: opponentPowerChange/StepLeft/StepRight/AngleChange listeners removed — sync via turnResult.positions[]
- 18-01: handleType4 sets myPlayerIndex=0 (local player always tanks[0] in practice)
- 18-01: _eliminated{} object defined in constructor but NOT populated (Plan 18-02 adds playerEliminated handler)
- 18-02: playerEliminated handler uses _lastPositions[myPlayerIndex].socketId (not window.socket?.id)
- 18-02: wreckage graphics setDepth(-1) — above terrain, below blast layer, non-interactive
- 18-02: spectator camera zooms to 0.85 via zoomTo() + pans to center — passive spectate, no follow-cam
- 18-02: Leave Match button deferred to Phase 19 — notifyEliminated({placement}) provides React hook
- 18-02: _flashYourTurn skips first turn (hasHadFirstTurn guard) to avoid spurious flash on game start
- 18-02: showTurnPointer y offset bumped from -45 to -58 to clear name labels and YOU marker
- 18-02: spectator aim line recreated each frame (destroy + recreate) to track live turret rotation

### Pending Todos
- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Production deployment (Render + Vercel)
- QA sessions (A4-A8 gameplay testing)
- Telegram bot creation (BotFather)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy
- main.js is ~1800+ lines — search by function name, not line number
- Phase 15 critical RESOLVED: isRoundOver now uses alive map (was ending on first kill) — done in 15-01
- Phase 15 COMPLETE: match.js N-player rewrite (15-01) + gold.js/main.js wiring (15-02) both done
- Phase 16 Plan 01 COMPLETE: room schema migrated to players[] — room.active flag fixed (now only true when all slots filled)
- Phase 16 Plan 02 COMPLETE: N-player generateTankPositions + requestTerrain/terrainGenerated/turnResult/rejoinSuccess payloads updated
- Phase 16 COMPLETE (all 3 plans): room schema → terrain spawn → battle engine migration done
- Server supports full 4-player match: terrain → spawn → fire → elimination → round-end → match-end
- Phase 17 COMPLETE (1 plan): wager guard, reconnectExpired broadcast, playerIndex, shopReady remap, debug log — all 5 surgical N-player fixes done
- Server is fully N-player correct — all SYS requirements (SYS-01 through SYS-10) complete
- Phase 18 COMPLETE (2 plans): N-player Phaser migration + elimination visuals/spectator/name labels done
- Client has backward-compat tank1/tank2 shims in GameBridge — Phase 19 removes these
- Phase 19 needed: React BattleHUD N-player components (Leave Match button, placement overlay, N-player HP bars)
- Escrow settlement still 2-player (hostId/playerId) — N-player escrow deferred to v2

## Session Continuity

Last session: 2026-02-26T19:52:37Z
Stopped at: Completed 18-02-PLAN.md — Elimination visuals, spectator mode, name labels complete
Resume file: None
