# Requirements: SolShot v1.4 — N-Player Escrow

**Defined:** 2026-02-27
**Core Value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## v1.4 Requirements

Requirements for N-player escrow upgrade. Each maps to roadmap phases.

### On-Chain Program

- [x] **ESC-01**: MatchEscrow account supports 2-4 players via `players: [Pubkey; 4]` fixed array with `max_players: u8` field
- [x] **ESC-02**: `deposits_mask: u8` bitmap tracks per-player deposit status (bit N = player N deposited)
- [x] **ESC-03**: `create_match` accepts N player wallets (2-4) and validates all are distinct and none is authority
- [x] **ESC-04**: `deposit_wager` identifies depositor by iterating `players[]` array and sets correct bit in `deposits_mask`
- [x] **ESC-05**: Match transitions to Active when all `max_players` have deposited (bitmap == `(1 << max_players) - 1`)
- [x] **ESC-06**: `settle_match` calculates total pot as `wager_lamports * num_deposited`, applies 90/7/3 BPS split, winner gets remainder
- [x] **ESC-07**: `settle_match` winner constraint validates against all entries in `players[]` array (not just first two)
- [x] **ESC-08**: `cancel_match` refunds all deposited players via `remaining_accounts` pattern with manual key validation
- [x] **ESC-09**: `permissionless_reclaim` refunds all deposited players via `remaining_accounts` with same validation
- [x] **ESC-10**: Deposit timeout reduced from 24h to 10 minutes on-chain (`TIMEOUT_SECONDS = 600`)
- [x] **ESC-11**: `start_with_depositors` instruction allows authority to reduce `max_players` to `num_deposited` (min 2), kick non-depositors, activate match
- [x] **ESC-12**: Account SPACE constant updated for new struct size (~236 bytes)
- [x] **ESC-13**: All events updated for N-player (MatchCreated, MatchCancelled emit player arrays, not binary fields)
- [x] **ESC-14**: Existing error codes extended (new: `TooFewPlayers`, `TooManyPlayers`, `MatchAlreadyStarted`)

### Server Integration

- [x] **SRV-01**: `escrow.js:createMatchEscrow` accepts array of player addresses (2-4) instead of playerOne/playerTwo
- [x] **SRV-02**: `escrow.js:buildDepositTransaction` unchanged (player-agnostic, already works for any player)
- [x] **SRV-03**: `escrow.js:settleMatchEscrow` updated to pass winner validated against N players
- [x] **SRV-04**: `escrow.js:cancelMatchEscrow` passes N player addresses via remaining_accounts
- [x] **SRV-05**: `escrow.js:getEscrowState` returns `players[]`, `depositsMask`, `maxPlayers`, `numDeposited` instead of binary fields
- [x] **SRV-06**: `solana.js:settleMatch` accepts N-player context (winner from any of N players)
- [x] **SRV-07**: `solana.js:refundWager` passes all N player addresses for cancel
- [x] **SRV-08**: `solana.js:calculateSettlement` uses `wager * playerCount` for total pot (not `wager * 2`)
- [x] **SRV-09**: `main.js` creates escrow with all `room.players` wallets on room-full (not just host+player)
- [x] **SRV-10**: `main.js` sends deposit TX to all N players in parallel on escrow creation
- [x] **SRV-11**: `main.js` tracks N deposit confirmations; emits `escrowActive` when all confirmed
- [x] **SRV-12**: `main.js` deposit timeout set to 5 minutes (300,000ms)
- [x] **SRV-13**: `main.js` on deposit timeout with partial deposits: emits `escrowPartialDeposit` to host with depositor list
- [x] **SRV-14**: `main.js` handles host `escrowPartialStart` choice — calls `start_with_depositors` on-chain, kicks non-depositors, starts match
- [x] **SRV-15**: `main.js` handles host `escrowCancelAll` choice — calls `cancel_match`, refunds all, returns to lobby
- [x] **SRV-16**: SYS-08 wager guard removed — 3-4 player wagered matches allowed
- [x] **SRV-17**: IDL synced from `target/idl/` to `server/idl/solshot_escrow.json` after program rebuild
- [x] **SRV-18**: `escrowDepositStatus` socket event emitted after each confirmed deposit (shows "2/4 deposited")

### Client UX

- [ ] **CLT-01**: Deposit flow works for N players — `signAndSendEscrowDeposit` unchanged (already player-agnostic)
- [ ] **CLT-02**: Lobby shows per-player deposit status (checkmarks/pending icons for each player)
- [ ] **CLT-03**: Deposit countdown timer visible to all players (5-minute countdown)
- [ ] **CLT-04**: Host sees partial deposit choice UI when timeout fires with some deposits ("Start with 2" or "Cancel all")
- [ ] **CLT-05**: Non-depositor receives kick notification and returns to menu
- [ ] **CLT-06**: Total pot displayed in battle HUD during wagered matches ("Pot: 1.2 SOL")
- [ ] **CLT-07**: All match modes (Quick Match, Duel, High Roller, Custom Challenge) available for 3-4 player rooms
- [ ] **CLT-08**: Match mode UI in LobbyScreen updated to show all modes regardless of player count

### Tech Debt

- [x] **DEBT-01**: SHOT milestone recording covers all N players (not just players[0] and players[1])
- [x] **DEBT-02**: `playAgain` / `resetForPlayAgain` passes `maxPlayers` to `createMatchState`

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Settlement Variants

- **SETTLE-01**: Placement-based pot split (e.g. 60/25/15 for 4-player) as alternative to winner-takes-all
- **SETTLE-02**: Variable wager amounts per player (different stakes in same match)

### Advanced Escrow

- **ADV-01**: Deposit requirement before room creation (pre-commit funds)
- **ADV-02**: Timeout extension requests (player asks for more deposit time)
- **ADV-03**: Dispute mechanism for contested results

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Sequential deposit flow | Adds per-player latency; parallel is correct |
| Per-player different wager amounts | Complex pot math; user decided equal wagers only |
| Mainnet deployment | Separate process, requires SOL for deploy fees |
| New program ID migration tooling | Devnet; can redeploy freely |
| AI bot fill for incomplete lobbies | Separate multi-week feature |
| Team modes (2v2) | Entirely separate feature set |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ESC-01 | Phase 20 | Complete |
| ESC-02 | Phase 20 | Complete |
| ESC-03 | Phase 20 | Complete |
| ESC-04 | Phase 20 | Complete |
| ESC-05 | Phase 20 | Complete |
| ESC-06 | Phase 20 | Complete |
| ESC-07 | Phase 20 | Complete |
| ESC-08 | Phase 20 | Complete |
| ESC-09 | Phase 20 | Complete |
| ESC-10 | Phase 20 | Complete |
| ESC-11 | Phase 20 | Complete |
| ESC-12 | Phase 20 | Complete |
| ESC-13 | Phase 20 | Complete |
| ESC-14 | Phase 20 | Complete |
| SRV-01 | Phase 21 | Complete |
| SRV-02 | Phase 21 | Complete |
| SRV-03 | Phase 21 | Complete |
| SRV-04 | Phase 21 | Complete |
| SRV-05 | Phase 21 | Complete |
| SRV-06 | Phase 21 | Complete |
| SRV-07 | Phase 21 | Complete |
| SRV-08 | Phase 21 | Complete |
| SRV-09 | Phase 22 | Complete |
| SRV-10 | Phase 22 | Complete |
| SRV-11 | Phase 22 | Complete |
| SRV-12 | Phase 22 | Complete |
| SRV-13 | Phase 22 | Complete |
| SRV-14 | Phase 22 | Complete |
| SRV-15 | Phase 22 | Complete |
| SRV-16 | Phase 22 | Complete |
| SRV-17 | Phase 21 | Complete |
| SRV-18 | Phase 22 | Complete |
| CLT-01 | Phase 23 | Pending |
| CLT-02 | Phase 23 | Pending |
| CLT-03 | Phase 23 | Pending |
| CLT-04 | Phase 23 | Pending |
| CLT-05 | Phase 23 | Pending |
| CLT-06 | Phase 23 | Pending |
| CLT-07 | Phase 23 | Pending |
| CLT-08 | Phase 23 | Pending |
| DEBT-01 | Phase 22 | Complete |
| DEBT-02 | Phase 22 | Complete |

**Coverage:**
- v1.4 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-28 — Phase 22 (SRV-09 through SRV-16, SRV-18, DEBT-01, DEBT-02) marked Complete*
