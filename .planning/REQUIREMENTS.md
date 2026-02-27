# Requirements: SolShot v1.4 — N-Player Escrow

**Defined:** 2026-02-27
**Core Value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## v1.4 Requirements

Requirements for N-player escrow upgrade. Each maps to roadmap phases.

### On-Chain Program

- [ ] **ESC-01**: MatchEscrow account supports 2-4 players via `players: [Pubkey; 4]` fixed array with `max_players: u8` field
- [ ] **ESC-02**: `deposits_mask: u8` bitmap tracks per-player deposit status (bit N = player N deposited)
- [ ] **ESC-03**: `create_match` accepts N player wallets (2-4) and validates all are distinct and none is authority
- [ ] **ESC-04**: `deposit_wager` identifies depositor by iterating `players[]` array and sets correct bit in `deposits_mask`
- [ ] **ESC-05**: Match transitions to Active when all `max_players` have deposited (bitmap == `(1 << max_players) - 1`)
- [ ] **ESC-06**: `settle_match` calculates total pot as `wager_lamports * num_deposited`, applies 90/7/3 BPS split, winner gets remainder
- [ ] **ESC-07**: `settle_match` winner constraint validates against all entries in `players[]` array (not just first two)
- [ ] **ESC-08**: `cancel_match` refunds all deposited players via `remaining_accounts` pattern with manual key validation
- [ ] **ESC-09**: `permissionless_reclaim` refunds all deposited players via `remaining_accounts` with same validation
- [ ] **ESC-10**: Deposit timeout reduced from 24h to 10 minutes on-chain (`TIMEOUT_SECONDS = 600`)
- [ ] **ESC-11**: `start_with_depositors` instruction allows authority to reduce `max_players` to `num_deposited` (min 2), kick non-depositors, activate match
- [ ] **ESC-12**: Account SPACE constant updated for new struct size (~236 bytes)
- [ ] **ESC-13**: All events updated for N-player (MatchCreated, MatchCancelled emit player arrays, not binary fields)
- [ ] **ESC-14**: Existing error codes extended (new: `TooFewPlayers`, `TooManyPlayers`, `MatchAlreadyStarted`)

### Server Integration

- [ ] **SRV-01**: `escrow.js:createMatchEscrow` accepts array of player addresses (2-4) instead of playerOne/playerTwo
- [ ] **SRV-02**: `escrow.js:buildDepositTransaction` unchanged (player-agnostic, already works for any player)
- [ ] **SRV-03**: `escrow.js:settleMatchEscrow` updated to pass winner validated against N players
- [ ] **SRV-04**: `escrow.js:cancelMatchEscrow` passes N player addresses via remaining_accounts
- [ ] **SRV-05**: `escrow.js:getEscrowState` returns `players[]`, `depositsMask`, `maxPlayers`, `numDeposited` instead of binary fields
- [ ] **SRV-06**: `solana.js:settleMatch` accepts N-player context (winner from any of N players)
- [ ] **SRV-07**: `solana.js:refundWager` passes all N player addresses for cancel
- [ ] **SRV-08**: `solana.js:calculateSettlement` uses `wager * playerCount` for total pot (not `wager * 2`)
- [ ] **SRV-09**: `main.js` creates escrow with all `room.players` wallets on room-full (not just host+player)
- [ ] **SRV-10**: `main.js` sends deposit TX to all N players in parallel on escrow creation
- [ ] **SRV-11**: `main.js` tracks N deposit confirmations; emits `escrowActive` when all confirmed
- [ ] **SRV-12**: `main.js` deposit timeout set to 5 minutes (300,000ms)
- [ ] **SRV-13**: `main.js` on deposit timeout with partial deposits: emits `escrowPartialDeposit` to host with depositor list
- [ ] **SRV-14**: `main.js` handles host `escrowPartialStart` choice — calls `start_with_depositors` on-chain, kicks non-depositors, starts match
- [ ] **SRV-15**: `main.js` handles host `escrowCancelAll` choice — calls `cancel_match`, refunds all, returns to lobby
- [ ] **SRV-16**: SYS-08 wager guard removed — 3-4 player wagered matches allowed
- [ ] **SRV-17**: IDL synced from `target/idl/` to `server/idl/solshot_escrow.json` after program rebuild
- [ ] **SRV-18**: `escrowDepositStatus` socket event emitted after each confirmed deposit (shows "2/4 deposited")

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

- [ ] **DEBT-01**: SHOT milestone recording covers all N players (not just players[0] and players[1])
- [ ] **DEBT-02**: `playAgain` / `resetForPlayAgain` passes `maxPlayers` to `createMatchState`

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
| ESC-01 | — | Pending |
| ESC-02 | — | Pending |
| ESC-03 | — | Pending |
| ESC-04 | — | Pending |
| ESC-05 | — | Pending |
| ESC-06 | — | Pending |
| ESC-07 | — | Pending |
| ESC-08 | — | Pending |
| ESC-09 | — | Pending |
| ESC-10 | — | Pending |
| ESC-11 | — | Pending |
| ESC-12 | — | Pending |
| ESC-13 | — | Pending |
| ESC-14 | — | Pending |
| SRV-01 | — | Pending |
| SRV-02 | — | Pending |
| SRV-03 | — | Pending |
| SRV-04 | — | Pending |
| SRV-05 | — | Pending |
| SRV-06 | — | Pending |
| SRV-07 | — | Pending |
| SRV-08 | — | Pending |
| SRV-09 | — | Pending |
| SRV-10 | — | Pending |
| SRV-11 | — | Pending |
| SRV-12 | — | Pending |
| SRV-13 | — | Pending |
| SRV-14 | — | Pending |
| SRV-15 | — | Pending |
| SRV-16 | — | Pending |
| SRV-17 | — | Pending |
| SRV-18 | — | Pending |
| CLT-01 | — | Pending |
| CLT-02 | — | Pending |
| CLT-03 | — | Pending |
| CLT-04 | — | Pending |
| CLT-05 | — | Pending |
| CLT-06 | — | Pending |
| CLT-07 | — | Pending |
| CLT-08 | — | Pending |
| DEBT-01 | — | Pending |
| DEBT-02 | — | Pending |

**Coverage:**
- v1.4 requirements: 40 total
- Mapped to phases: 0
- Unmapped: 40

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after initial definition*
