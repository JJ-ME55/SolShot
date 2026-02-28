# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 27 Feb 2026)
**Core value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.4 — Phase 20: Anchor Program

## Current Position

Milestone: v1.4 — N-Player Escrow
Phase: 22 of 23 (Server Socket Handlers) — COMPLETE
Plan: 03 of 3 in phase 22 (N-player SHOT milestones + playAgain fixes)
Status: Phase 22 complete — ready for Phase 23
Last activity: 28 Feb 2026 — Completed 22-03-PLAN.md (N-player SHOT milestone loops, prestige payload, DB persist, playAgain maxPlayers, wagered rematch escrow, failedSettlements N-player)

Progress: [████████░░] 80% (8/10 plans)

## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)
- v1.2 plans completed: 15 (across 6 phases)
- v1.3 plans completed: 10 (across 5 phases)

**Total across all milestones:** 65 plans, 24 phases

## Accumulated Context

### Key Decisions (carried forward)
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- Three audits complete: SOS, DB, BOK — all PASS
- Re-audit risk accepted for lib.rs modifications (v1.4 requires it)
- Winner-takes-all N-player settlement (not placement split)
- Equal wagers only (simpler PDA, fairer gameplay)
- 5-10 min deposit timeout (more players = higher no-show risk)
- Partial deposit: host chooses start-with-depositors or cancel-all
- Wager guard for 3-4 players removed in v1.4
- TIMEOUT_SECONDS=600 (10 min) — confirmed in 20-01; PERMISSIONLESS_RECLAIM_TIMEOUT=1200
- MatchEscrow SPACE=232: players:[Pubkey;4]+max_players+deposits_mask replaces two Pubkeys+two bools
- TS-INV-5 v1.4: settle/cancel windows overlap — mutual exclusion is STATE-enforced (not time-enforced)
- Compile stubs (todo!) in instruction bodies allow incremental rewrite across plans 20-01/02/03
- pot = wager * deposits_mask.count_ones() — NOT wager * num_deposited (uses actual depositors, not registered count)
- dust absorption: winner = pot - treasury - ops; max dust is always 2 lamports regardless of player count (2 division ops)
- (0..max_players).any(|i| escrow.players[i] == winner.key()) is the canonical winner constraint pattern
- cancel_match and permissionless_reclaim use ctx.remaining_accounts — no named player accounts in structs
- start_with_depositors compacts players[] array before reducing max_players — ensures contiguous depositor slots after partial-start
- Phase 20 COMPLETE: anchor build succeeds, all 69 cargo tests pass, IDL synced to server/idl/
- escrow.js N-player: createMatchEscrow takes playerAddresses[], cancel+reclaim use .remainingAccounts(), getEscrowState returns depositsMask + backward-compat shims
- PermissionlessReclaim has NO config account (only escrow, caller, systemProgram) — unlike CancelMatch which has config
- getEscrowState shims playerOneDeposited/playerTwoDeposited via depositsMask bitmask — main.js updated in 21-02
- solana.js settleMatch: playerCount param (default 2), totalPot = wagerSOL * playerCount
- solana.js refundWager: playerAddresses[] array replaces separate playerOneAddress/playerTwoAddress params
- solana.js re-exports startWithDepositorsEscrow for callers
- main.js: all cancelMatchEscrow/createMatchEscrow/refundWager call sites use array form with .filter(Boolean)
- main.js: totalPot display uses room?.players?.length || 2 (not hardcoded * 2)
- 22-01: DEPOSIT_TIMEOUT_MS = 300_000 (5 min); joinRoom+joinQueue use room.players.map() for wallet collection; escrowDepositConfirm uses depositsMask bitmask (1 << playerIndex); firstDepositorSocketId tracked for Phase 22-02; escrowDepositStatus event emitted after each deposit
- 22-01: escrowDepositStatus shape: {roomId, deposits:[{socketId, wallet, confirmed}], numDeposited, totalPlayers}
- 22-02: 3-branch deposit timeout (all/zero/partial); partialDecisionMaker tracked in wagerStates; 30s decision timer reuses depositTimers[roomId]; escrowPartialStart kicks non-depositors + compacts room; escrowCancelAll preserves room; wager guard removed (SRV-16)
- 22-02: cancelMatchEscrow wallet order always from room.players.filter().map() (not Object.keys); kickedSocket.leave() before room.players compact; escrowCancelAll resets deposit state without destroying room
- 22-03: DEBT-01 fixed: recordMatchPlayed loops over all room.players (not hardcoded hostId/playerId) for match-end + forfeit paths; prestige+milestones in matchEndPayload keyed by socketId for all N players
- 22-03: DEBT-02 fixed: createMatchState(roomId, paRoundType, room.players.length) in resetForPlayAgain; wagerStates preserved (amount+wallets kept, deposits cleared) for wagered rematches
- 22-03: playAgain wagered rematch triggers fresh escrow creation cycle (create PDA, build deposit TXs, escrowDeposit emit, deposit timer with 3-branch partial flow)
- 22-03: failedSettlements shape changed to allWallets[] — handleSettlementFailure collects all room.players wallets; retry loop uses data.allWallets with backward-compat fallback
- 22-03: solWonAmt = wagerAmt * room.players.length * 0.9 (not hardcoded * 2) — N-player DB persist loops over all players

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
- Phase 21 COMPLETE: escrow.js N-player API (21-01) + solana.js/main.js caller updates (21-02) done
- Phase 22 COMPLETE: all 3 plans done — N-player escrow socket handlers fully upgraded
- Phase 23 (client escrow integration) is next — handle escrowDeposit, escrowPartialDeposit, escrowPartialWaiting, kickedFromRoom, escrowCancelledAll events on client

## Session Continuity

Last session: 2026-02-28T09:34:51Z
Stopped at: Completed 22-03-PLAN.md — N-player SHOT milestones, playAgain maxPlayers, wagered rematch escrow, failedSettlements N-player (main.js)
Resume file: None
