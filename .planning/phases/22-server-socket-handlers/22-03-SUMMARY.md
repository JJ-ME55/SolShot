---
phase: 22-server-socket-handlers
plan: 03
subsystem: api
tags: [socket.io, escrow, solana, n-player, shot-token, milestones, prestige, db-stats, play-again]

# Dependency graph
requires:
  - phase: 22-02
    provides: Partial deposit decision flow, wagerStates patterns, room compaction logic
  - phase: 21-server-escrow-services
    provides: N-player escrow.js API (createMatchEscrow, cancelMatchEscrow, buildDepositTransaction)
provides:
  - N-player SHOT milestone recording for all room.players in match-end path (DEBT-01)
  - N-player SHOT milestone recording for all room.players in forfeit/timeout path (DEBT-01)
  - matchEndPayload.prestigeInfo and earnedMilestones keyed by socketId for all N players
  - N-player DB persist loop — winner gets stats.wins++, all others get stats.losses++
  - solWonAmt uses room.players.length multiplier (not hardcoded * 2)
  - resetForPlayAgain passes room.players.length as third arg to createMatchState (DEBT-02)
  - resetForPlayAgain preserves wager amount+wallets, clears deposit state for fresh escrow round
  - Wagered rematches trigger new escrow creation cycle with deposit timer and partial deposit flow
  - failedSettlements store shape upgraded to allWallets[] for N-player settlement recovery
  - handleSettlementFailure collects all player wallets from room.players
affects:
  - client escrow integration (escrowDeposit event fired again on rematch)
  - prestige/milestone client display (all N player IDs now present in matchEnd payload)
  - DB stats aggregation (N-player matches now correctly recorded)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "N-player loop: for (const p of room.players) { ... recordMatchPlayed(wallet, {...}) }"
    - "playerWalletMap: per-player wallet lookup built once via loop, then reused for milestones+prestige+persist"
    - "milestonesBefore: snapshot map keyed by socketId before recordMatchPlayed, diffed after"
    - "Object.fromEntries(room.players.map(p => [p.socketId, ...])) for prestigeInfo and earnedMilestones"
    - "solWonAmt = wagerAmt * room.players.length * 0.9 — N-player pot calculation"
    - "resetForPlayAgain: preserve wagerStates[roomId].amount + wallets, clear deposit-specific fields"
    - "failedSettlements: allWallets[] array replaces p1wallet/p2wallet for N-player recovery"
    - "Backward-compat fallback: data.allWallets || [data.p1wallet, data.p2wallet].filter(Boolean) in retry loop"

key-files:
  created: []
  modified:
    - server/socket-io/main.js

key-decisions:
  - "playerWalletMap built once before milestones snapshot — single source of truth for wallet lookup in match-end block"
  - "persistStats N-player loop: isWinner = (pid === matchResult.winner) — winner gets wins++, all others get losses++"
  - "solWonAmt multiplied by room.players.length at match-end time — accurately reflects N-player pot size"
  - "resetForPlayAgain preserves wagerStates[roomId] (amount+wallets intact) — new escrow round reuses existing wager config"
  - "PlayAgain escrow creation block mirrors joinRoom escrow block (22-01 pattern) with same partial deposit flow"
  - "failedSettlements backward-compat fallback retained — prevents silent failure for any entries stored pre-upgrade"

patterns-established:
  - "Match-end N-player: playerWalletMap → milestonesBefore → recordMatchPlayed loop → Object.fromEntries for payload"
  - "Forfeit path: same N-player recordMatchPlayed loop pattern, uses opponentId for isWinner determination"
  - "DB persist: for (const p of room.players) loop with isWinner conditional $inc spread"
  - "rematch escrow: IIFE async block in resetForPlayAgain, same 3-branch deposit timeout as joinRoom"

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 22 Plan 03: N-Player SHOT Milestones and playAgain Fixes Summary

**N-player SHOT milestone loops for match-end and forfeit paths, prestige payload for all players, N-player DB persist, maxPlayers-aware createMatchState on rematch, wagered rematch escrow cycle, and failedSettlements N-player wallet arrays**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T09:31:05Z
- **Completed:** 2026-02-28T09:34:51Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- DEBT-01: Replaced hardcoded `hostWallet`/`playerWallet` `recordMatchPlayed` calls with `for (const p of room.players)` loops for both match-end path and forfeit/timeout path — all N players now earn SHOT milestones
- DEBT-01: `matchEndPayload.prestigeInfo` and `earnedMilestones` now use `Object.fromEntries(room.players.map(...))` — keyed by socketId for all N players, not just hostId/playerId
- DEBT-01: DB persist (`persistStats`) loops over all `room.players` — winner gets `stats.wins++`, all others get `stats.losses++`; `solWonAmt` uses `room.players.length` multiplier
- DEBT-02: `resetForPlayAgain` passes `room.players.length` as third arg to `createMatchState` — 4-player rematch stays 4-player
- `resetForPlayAgain` now preserves `wagerStates[roomId].amount` and `.wallets`, clears deposit-specific fields, and triggers a fresh escrow creation cycle with deposit timer and partial deposit flow for wagered rematches
- `failedSettlements` store upgraded to `allWallets[]` shape — `handleSettlementFailure` collects all player wallets from `room.players`; retry loop uses `data.allWallets` with backward-compat fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: N-player SHOT milestones, prestige, and DB persist for match-end and forfeit** - `8906650` (feat)
2. **Task 2: playAgain maxPlayers preservation and failedSettlements N-player fix** - `95698c4` (feat)

**Plan metadata:** _(pending)_

## Files Created/Modified
- `server/socket-io/main.js` — N-player recordMatchPlayed loops, prestige/milestones Object.fromEntries, N-player DB persist, solWonAmt N-player calc, createMatchState maxPlayers arg, wagerStates preservation + playAgain escrow cycle, failedSettlements N-player

## Decisions Made
- `playerWalletMap` built once before milestones snapshot — single pass over `room.players` used for all subsequent wallet lookups in the match-end block
- `persistStats` loop uses `isWinner = (pid === matchResult.winner)` conditional `$inc` spread — clean N-player extension of the 2-player winner/loser pattern
- `resetForPlayAgain` preserves `wagerStates[roomId]` object (amount + wallets intact), only clears deposit-specific fields — enables immediate escrow creation without re-collecting wallet addresses
- PlayAgain escrow creation IIFE mirrors the joinRoom pattern from 22-01 exactly, including the 3-branch deposit timeout (zero/partial/all)
- `failedSettlements` backward-compat fallback `data.allWallets || [data.p1wallet, data.p2wallet].filter(Boolean)` retained — prevents silent failure for any in-memory entries created before this upgrade

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Plan verification grep `grep -c "Object.fromEntries.*room.players"` returns 0 because the implementation spans multiple lines (multiline format). The implementation is correct — `Object.fromEntries(` on one line, `room.players.map(p => ...)` on the next. Visual inspection at lines 2792-2801 confirms both `prestigeInfo` and `earnedMilestones` use the N-player pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 22 is now complete — all 3 plans executed: 22-01 (N-player escrow creation), 22-02 (partial deposit flow), 22-03 (SHOT milestones + playAgain fixes)
- All DEBT-01 and DEBT-02 correctness bugs are resolved
- main.js is fully N-player capable for escrow, SHOT milestones, prestige payloads, DB stats, and match resets
- Next: client-side integration for `escrowDeposit`, `escrowPartialDeposit`, `escrowPartialWaiting`, `kickedFromRoom`, `escrowCancelledAll` events (separate phase)
- Devnet deploy of updated Anchor program still pending (needs fresh SOL for redeployment)

---
*Phase: 22-server-socket-handlers*
*Completed: 2026-02-28*
