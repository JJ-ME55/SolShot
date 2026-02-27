# Research Summary: SolShot v1.4 — N-Player Escrow

**Project:** SolShot — extending 2-player on-chain escrow to support 2-4 players
**Domain:** N-player extension of binary (1v1) game engine + Anchor escrow program upgrade (2-player PDA to 2-4 player PDA)
**Researched:** 2026-02-27
**Confidence:** HIGH (all findings from direct codebase reading; MEDIUM for partial-deposit UX design and test infrastructure)

---

## Executive Summary

The v1.4 milestone has two tightly coupled but separable concerns: upgrading the game engine from a hardwired 2-player binary model to a generalized N-player model, and simultaneously upgrading the Anchor escrow program from a 2-player PDA to one that handles 2-4 players. Research confirms both upgrades are achievable without new libraries, new blockchains, or architectural pivots — but neither is cosmetic. The game server (`server/socket-io/main.js`, ~2800 lines) has the 2-player assumption baked into roughly 60+ locations, and the Anchor program (`programs/solshot-escrow/src/lib.rs`) is architecturally binary in its account struct, four instruction handlers, and every downstream consumer. Both must be fully migrated in coordinated phases.

The recommended approach is sequential and dependency-ordered: the Anchor program rewrite comes first because its compiled IDL gates all server-side and client-side escrow changes. The game engine server migration runs in parallel, using a compatibility shim (`room.players[]` with `room.host`/`room.player` as alias getters) to preserve the 2-player regression guarantee while incrementally replacing binary assumptions. The client Phaser scene and React HUD changes come last, after server N-player logic is validated in Practice mode. The critical wager guard (`SYS-08`, a single `if` block in `main.js`) is the integration gate: it blocks wagered matches for `maxPlayers > 2` and must remain in place until both the Anchor program supports N players and Practice mode N-player is stable end-to-end.

The most operationally dangerous risk is the silent IDL desync: every `lib.rs` change requires an `anchor build`, an IDL copy to `server/idl/`, and a field-name audit in `escrow.js`. Failure to do this produces silent data corruption with no error thrown — `getEscrowState()` returns `undefined` for every field from the old struct without raising an exception. The second most dangerous risk is the `remaining_accounts` security gap in `cancel_match`: without explicit positional key validation (`account.key() == escrow.players[i]`), a malicious caller can pass arbitrary writable accounts to redirect refund lamports. This validation is not provided by Anchor's constraint system and must be written manually inside the instruction body.

---

## Key Findings

### Recommended Stack

No new technologies are required for this milestone. The existing stack — Anchor 0.32.1, Solana devnet, Node.js/Express/Socket.IO server, React client — is sufficient for all changes. Anchor 0.32.1 provides fixed-size arrays (`[Pubkey; 4]`), `remaining_accounts` for variable-length account lists, account space calculation, and bitmap/bool-array deposit tracking. There is no reason to upgrade Anchor for this milestone.

**Core technologies and their roles:**
- **Anchor 0.32.1** — on-chain program framework; `[Pubkey; 4]` fixed arrays and `remaining_accounts` pattern are the two key features used; `BN` must continue to be imported from `bn.js` directly (not from `@coral-xyz/anchor`) per existing MEMORY.md gotcha
- **Solana legacy transactions** — sufficient for 4-player settle/cancel; estimated 420-700 bytes total against 1,232-byte limit; versioned transactions (v0) and Address Lookup Tables are not needed and must not be introduced for this milestone
- **Socket.IO room model** — server-side deposit tracking (`ws.deposits[socketId]`) and `room.players[]` array are already N-player generic; the deposit confirmation loop (`room.players.every(...)`) needs no logic changes, only call-site updates removing the binary host/player check

**Account space decision required:** Three research documents calculated the new `MatchEscrow` account size with slight differences:
- STACK.md: 232 bytes — uses `deposits_mask: u8` (1-byte bitmap)
- FEATURES.md: 235 bytes — uses `deposited: [bool; 4]` (4 bytes)
- ARCHITECTURE.md: 236 bytes — uses `deposited: [bool; 4]` (4 bytes) + `num_deposited: u8` counter (1 byte)

The difference is the deposit-tracking field design. The bitmap approach (STACK.md) is more compact and the "all deposited" check reduces to a single comparison (`deposits_mask == (1u8 << player_count) - 1`). The bool-array approach (FEATURES.md / ARCHITECTURE.md) is more readable and maps one-to-one to Anchor's constraint expressions. Either is correct. Choose one before Phase 1 and propagate consistently. The space proptest (`bok_proptest_space.rs`) will catch any miscalculation immediately.

### Expected Features

**Must have — blocks wagered N-player:**
- Anchor program N-player PDA — replace `player_one`/`player_two` Pubkeys with `players: [Pubkey; 4]` + `player_count: u8`, deposit tracking updated accordingly
- `cancel_match` extended to N accounts via `remaining_accounts` (with mandatory positional key validation before any lamport transfer)
- `permissionless_reclaim` same `remaining_accounts` migration — must be done simultaneously or the 48-hour safety net only refunds 2 players
- `settle_match` winner constraint updated to `players[..count].iter().any(...)` and pot math changed from `wager * 2` to `wager * num_deposited`
- Server: `createMatchEscrow`, `cancelMatchEscrow`, `settleMatchEscrow`, `refundWager` signatures updated for N players
- Server: Remove SYS-08 wager guard (`main.js` line ~1356) only after all above is verified in Practice mode
- Server: N-player deposit emit (`Promise.all` for N `buildDepositTransaction` calls)
- Server: `escrowDepositStatus` broadcast after each confirmed deposit — eliminates dead-air period where lobby appears frozen
- Client: Per-player deposit status UI — checkmarks per player + countdown from `depositDeadlineMs`

**Game engine pre-requisites (must exist before SYS-08 removal):**
- `room.players[]` array model (not binary host/player schema) with compatibility shim
- `getNextTurn` taking `playerList[]` not fixed `hostId`/`playerId`
- `isRoundOver` distinguishing "player eliminated" from "round over" with `eliminatedPlayers` set
- `room.active` flag correctly guarding on `players.length >= maxPlayers`
- `turnsPerRound = N * 10` scaled to player count
- 3-4 player Practice match works end-to-end

**Should have — material UX, medium complexity:**
- Partial deposit decision flow: `escrowPartialDeposit` event + host modal ("start with depositors" or "cancel all")
- `start_with_depositors` Anchor instruction — compacts `max_players` to depositor count, transitions to Active
- Total pot display in BattleHUD (`escrowActive` payload already includes `totalPot: wager * N`)
- Deposit countdown visible to all N players

**Defer to follow-on:**
- Placement-based pot split (60/25/15 for 3-4 players) — requires new Anchor instructions and complex settlement UI
- N-player matchmaking queue — queue currently pairs 2 players; extending to fill N-player rooms requires lobby matchmaking rewrite
- BO3/BO5 placement scoring across rounds for N players

**Anti-features to resist:**
- Sequential deposit flow — all N players receive deposit TX simultaneously via `Promise.all`; sequential adds per-player latency
- On-chain voting for partial deposit start — server authority cancel is simpler and maintains the same existing trust model
- Separate per-player deposit receipt PDAs — unnecessary for max 4 players, adds 3-4 extra PDAs per match

### Architecture Approach

The upgrade touches four layers in strict dependency order: (1) Anchor program + IDL, (2) server escrow service (`escrow.js`, `solana.js`), (3) socket handler (`main.js`), (4) client (minimal changes for deposit UI). The game engine migration is a separate parallel track that must complete before the wager guard is removed. The architecture research identified two key patterns to codify as standards for this codebase: the **fixed-size array pattern** (`[Pubkey; 4]` with `player_count: u8` bounding the valid slice) for on-chain player storage, and the **`remaining_accounts` pattern** for variable-length account lists in cancel and reclaim instructions.

**Major components and their changes:**

1. **`programs/solshot-escrow/src/lib.rs`** — full rewrite of `MatchEscrow` struct and all 4 match lifecycle instructions; new `start_with_depositors` instruction; new program ID after deploy; must be built and deployed first
2. **`server/idl/solshot_escrow.json`** — derivative of Anchor build; must be copied immediately after every `anchor build`; stale IDL produces silent data corruption (no exception thrown)
3. **`server/services/escrow.js`** — `createMatchEscrow` takes player array; `cancelMatchEscrow` takes array + builds `remainingAccounts`; `getEscrowState` returns `deposited[]` array not named bools; new `startWithDepositors` function
4. **`server/services/solana.js`** — `settleMatch` removes `loserAddress` param, gains `numPlayers`; `calculateSettlement` gains `numPlayers` (changes `wager * 2` to `wager * numPlayers`); `refundWager` takes `playerAddresses[]` array
5. **`server/socket-io/main.js`** — 14 specific change sites identified; includes SYS-08 removal (unlock gate), N-player deposit emit loop, deposit confirmation index lookup, `escrowActive` totalPot fix, settlement `numPlayers` param, SHOT milestone loop for all N players, `matchEndPayload.prestigeInfo` for all N players
6. **`client/src/screens/LobbyScreen.js`** — remove wager-mode-blocked UI for 3-4 players; add deposit status rows; partial deposit host modal

**Unchanged components (explicitly verified):**
- `WalletContext.js:signAndSendEscrowDeposit` — server serializes TX, client signs; account structure change is transparent to the signing function
- `BattleScreen.js` / `LobbyScreen.js` socket event handler shapes — same event names, same handler pattern
- `GlobalConfig` PDA and all config management instructions
- Settlement math BPS structure (90/7/3) — only the `total_pot` calculation changes
- PDA seeds `["match", match_id.as_bytes()]` — unchanged; program is upgraded in-place on devnet

### Critical Pitfalls

Research identified 22 game-engine pitfalls and 14 escrow-specific pitfalls. These 7 produce incorrect behavior with no error thrown:

1. **`getNextTurn` binary toggle skips Player 3+ silently** (CRITICAL) — `match.js` lines 136-143 toggle between exactly two IDs; Player 3 never gets a turn. Replace with `getNextTurn(ms, playerList[])` where `playerList` contains non-eliminated active socket IDs. All 3 call sites in `main.js` (lines 443, 2117, 2495) must change simultaneously.

2. **`room.active = true` fires on 2nd player join — blocks Player 3 and 4** (CRITICAL) — `main.js` lines 1004-1006; join guard exits silently when `room.active === true` regardless of `maxPlayers`. Change to `players.length >= maxPlayers` for both the guard and the setter.

3. **`isRoundOver` ends the round on any player reaching 0 HP** (CRITICAL) — `match.js` lines 151-160; in 4-player, first kill ends the entire round. Introduce `eliminatedPlayers` set; round ends only when `<= 1` non-eliminated player remains.

4. **`MatchEscrow::SPACE` miscalculation crashes `create_match` at runtime** (CRITICAL) — constant is set manually; wrong value produces `AccountDidNotSerialize` at runtime, not compile time. Run `bok_proptest_space.rs` immediately after any struct field change.

5. **Stale IDL produces silent data corruption** (HIGH) — `getEscrowState()` deserializes bytes using field offsets from the IDL; stale IDL returns `undefined` for all fields with no exception. Treat "anchor build + copy IDL + verify field names" as one atomic operation.

6. **`remaining_accounts` missing positional key validation allows fund redirection** (CRITICAL, security) — every account in `remaining_accounts` must be validated `account.key() == escrow.players[i]` before any lamport transfer; Anchor's constraint system does not validate these accounts. Without this check, a caller can drain the escrow by passing arbitrary writable accounts.

7. **`escrowDepositConfirm` checks `playerOneDeposited`/`playerTwoDeposited` fields that no longer exist** (HIGH) — after IDL update, these return `undefined`; the `!depositConfirmed` guard fires for every player; all deposits are rejected; match cannot start. Update `getEscrowState()` return shape first, then grep all usages in `main.js`.

---

## Implications for Roadmap

Research establishes a clear dependency chain: Anchor program before server escrow service before socket handler before client. The game engine migration is a separate dependency chain that must complete before the wager guard is removed. These two tracks can run in parallel by different developers but converge at the SYS-08 unlock gate.

### Phase 1: Anchor Program Rewrite

**Rationale:** Everything downstream depends on the compiled IDL. No server or client change can be tested against real escrow until the program is rewritten, built, and deployed to devnet with a new program ID.
**Delivers:** New `MatchEscrow` struct (232-236 bytes depending on deposit tracking choice), all 4 lifecycle instructions updated for N players, new `start_with_depositors` instruction, new `NotEnoughDepositors` error code, new program ID, new IDL
**Addresses:** Escrow pitfalls E1 (SPACE calc), E2 (winner constraint moved to instruction body), E3 (remaining_accounts with positional validation), E4 (player count cap enforced in create_match), E5 (borrow checker — clone before mutable), E12 (permissionless_reclaim simultaneous migration), E13 (all-pairs SamePlayer check)
**Research flag:** No research needed — ARCHITECTURE.md provides instruction-by-instruction pseudocode with exact Rust patterns; `remaining_accounts` pattern is the only non-standard element and is documented in official Anchor docs.

### Phase 2: Server Escrow Service

**Rationale:** `escrow.js` and `solana.js` are the direct IDL consumers and must be updated before `main.js` can call them. Depends on Phase 1 (new IDL).
**Delivers:** Updated function signatures for `createMatchEscrow`, `cancelMatchEscrow`, `settleMatchEscrow`, `refundWager`; new `startWithDepositors`; updated `getEscrowState` return shape (`deposited[]` array, `maxPlayers`, `numDeposited`); `calculateSettlement` with `numPlayers` parameter
**Addresses:** Escrow pitfalls E6 (IDL sync — rebuild before this phase starts), E7 (escrowState field names), E8 (JS cancel signature), E9 (isWritable: true on remainingAccounts), E12 (permissionlessReclaim array signature)
**Research flag:** No research needed — standard JS Anchor client patterns.

### Phase 3: Socket Handler (main.js)

**Rationale:** Depends on Phase 2 function signatures. The 14 specific change sites are largely mechanical. This phase includes SYS-08 wager guard removal — the unlock gate for wagered N-player — which must be the last change in this phase, after all other sites are verified.
**Delivers:** N-player deposit emit (`Promise.all`), `escrowDepositStatus` broadcast per confirmation, `escrowActive` totalPot (`wager * N`), deposit confirmation using `deposited[playerIndex]`, settlement with `numPlayers`, forfeit/failure paths, SHOT milestone loop for all N players, `matchEndPayload.prestigeInfo` for all N players, SYS-08 removal
**Addresses:** Escrow pitfalls E7 (deposit confirm field names), E10 (program ID in 3 locations after redeploy), E11 (escrow creation deferred until room-full)
**Research flag:** No research needed. Architecture document provides specific line numbers and exact code patterns for all 14 change sites.

### Phase 4: Game Engine Migration (parallel track)

**Rationale:** Can start in parallel with Phase 1 but must complete before Phase 3's SYS-08 removal. This is the larger engineering effort — 60+ locations in `main.js` plus `match.js`, `physics.js`, client Phaser scene, and React HUD.
**Delivers:** `room.players[]` schema with compatibility shim (`room.host`/`room.player` as aliases), updated turn system (`getNextTurn` with `playerList[]`), `isRoundOver` with `eliminatedPlayers` set, `room.active` fixed for N players, `turnsPerRound = N * 10`, gold economy scaling (`1/(N-1)` divisor), reconnect migration for N players (`migrateSocketId` helper), shop system all-ready check (`room.players.every(...)`), N-player spawn zones in physics.js, 3-4 player Practice match working end-to-end
**Addresses:** Game engine pitfalls 1 (getNextTurn), 2 (room schema), 3 (isRoundOver), 4 (room.active), 5 (simultaneous kills), 6 (reconnect), 7 (turnsPerRound), 10 (shop readiness), 11 (gold inflation), 13 (terrain spacing), 15 (isMatchOver), 16 (HP initialization), 19-20 (positionUpdate/stepLeft named slots)
**Research flag:** This is the highest-complexity phase. Write bot-client integration tests for 3-player turn order, elimination, and round-end logic before shipping. Testing without 3 human clients is the primary operational risk (Pitfall 18). The bot-client test infrastructure must be built before Phase 4 coding begins.

### Phase 5: Client N-Player UI

**Rationale:** Comes after the server N-player game engine is stable (Phase 4 Practice mode validated). Client changes are additive and do not break 2-player.
**Delivers:** `this.tanks[]` array replacing `this.tank1`/`this.tank2`, `tankPositions` payload keyed by socketId (not named host/player fields), N ScoreBoards in BattleHUD via `tanks.map()`, deposit status rows with checkmarks and countdown in LobbyScreen, partial deposit host modal, total pot display in BattleHUD, wager-blocked UI removed for 3-4 player rooms
**Addresses:** Game engine pitfalls 8 (Phaser scene hardcoded tanks), 9 (tankPositions named fields), 14 (BattleHUD two ScoreBoards)
**Research flag:** The `tankPositions` payload normalization (Pitfall 9) should be done for the 2-player case first and verified before N-player — this reduces scope of potential regression.

### Phase Ordering Rationale

- Phases 1-3 (Anchor program → escrow service → socket handler) form the escrow dependency chain and cannot be reordered
- Phase 4 (game engine) can run in parallel with Phases 1-3 but is the gate to SYS-08 removal in Phase 3
- Phase 5 (client UI) is always last — depends on server N-player being stable in Practice mode
- The compatibility shim in Phase 4 is the linchpin: without it, migrating 60+ `room.host`/`room.player` references simultaneously is a high-risk big-bang change that breaks 2-player while N-player is not yet working

### Research Flags

**Needs design before coding:**
- **Phase 3 (partial deposit UX):** The "start with depositors" host modal has multiple edge cases (host disconnects during the 60-second choice window, depositors have mixed intent, host ignores deadline). The FEATURES.md decision tree covers the main paths but the server state machine needs to be fully spec'd in a phase plan doc before implementation of this specific sub-feature.
- **Phase 4 (bot-client test infrastructure):** A bot socket that auto-fires when it receives `turnResult` with its socket ID must be built before Phase 4 coding starts. Without 3 human clients available for testing, N-player turn order bugs are invisible.

**Standard patterns (no research needed):**
- Phase 1: Fixed-array pattern, `remaining_accounts`, bitmap/bool-array deposit tracking — all in official Anchor docs
- Phase 2: JS Anchor client `remainingAccounts()` chain method — standard
- Phase 3: Socket.IO emit patterns — no new patterns
- Phase 5: React dynamic rendering via `players.map()` — standard

---

## Open Design Decisions

These were not resolved by research and require a product or engineering decision before the relevant phase begins:

| Decision | Options | Recommendation | When Needed |
|----------|---------|----------------|-------------|
| Deposit tracking: bitmap vs bool array | `deposits_mask: u8` (1 byte, elegant "all deposited" check) vs `deposited: [bool; 4]` (4 bytes, more readable) | Bitmap — saves 3 bytes, single-comparison all-deposited check; STACK.md recommendation | Before Phase 1 coding |
| `start_with_depositors`: ship or defer | Include in Phase 1-3 (medium complexity) vs defer to v1.5 | Defer — partial deposit case is rare; a server-side cancel with clear error messaging ("not all players deposited") is sufficient for launch | Phase 1 planning |
| Deposit timeout duration | Keep 2 minutes (current) vs extend to 5 minutes | Extend to 5 minutes for N-player rooms — each additional player adds wallet interaction latency; 2 minutes is tight for 4 mobile wallets | Phase 3 implementation |
| Gold economy scaling | `gold_per_damage / (N-1)` vs increase weapon costs proportionally | Divide gold rate by `(N-1)` — simpler, preserves existing weapon cost table unchanged; only relevant for BO3/BO5 with shop between rounds | Phase 4 implementation |
| BO3/BO5 winner determination for N>2 | Last alive wins the round (current, no change) vs placement scoring | Last alive wins — no implementation change needed; placement scoring deferred to v1.5 | Phase 4 (no change needed) |
| SYS-08 removal timing | Remove at Phase 3 completion vs hold for explicit QA sign-off | Require explicit QA: 3-player Practice match end-to-end validated + escrow service unit tests passing + devnet deploy verified | Phase 3 end |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Anchor program changes | HIGH | All findings from direct reading of `lib.rs` (884 lines); account space math verified against official Anchor docs; `remaining_accounts` pattern from official docs; borrow checker pattern is existing codebase precedent |
| Server escrow service changes | HIGH | All findings from direct reading of `escrow.js` (543 lines) and `solana.js` (284 lines); specific function signatures and all call sites identified |
| Socket handler (main.js) | HIGH | 14 specific change sites identified with line numbers from direct reading of `main.js` (~2800 lines); patterns are mechanical signature and field-name updates |
| Game engine pitfalls | HIGH | All 22 game pitfalls traced to specific lines in `match.js`, `physics.js`, `main.js`; every finding directly observed in code, not inferred |
| Partial deposit UX design | MEDIUM | Decision tree in FEATURES.md is logically complete; `start_with_depositors` authorization model (server-only vs depositor-triggered) is unresolved; server state machine edge cases need a spec before coding |
| Deposit timeout value (5 min) | MEDIUM | Derived from industry norms and first principles; no authoritative reference for "4-player mobile wallet deposit timeout" specifically |
| Transaction size estimates | MEDIUM | Calculated from known constants (32 bytes/account, 1,232-byte limit); not measured on devnet; well within limit at 4 players (~700 bytes worst case for cancel) |
| Test infrastructure for N-player | LOW | Bot-client approach is recommended but not yet designed; LiteSVM support for `remaining_accounts` is unverified on Windows (Pitfall E14) |

**Overall confidence: HIGH** for implementation correctness (all escrow and game engine changes from direct codebase reading). MEDIUM for product design decisions (partial deposit flow, timeout values). LOW for test infrastructure.

### Gaps to Address

- **Space proptest:** Update `bok_proptest_space.rs` immediately after the deposit tracking field design is chosen (bitmap vs bool array) — this is the early-warning system for SPACE miscalculation and must pass before any devnet deploy
- **LiteSVM + remaining_accounts compatibility:** Verify whether `bok_litesvm.rs` can test the new `cancel_match` before writing N-player cancel tests; if not, set up `solana-program-test` (banks-client) as a fallback — McAfee blocks `solana-test-validator` on this machine (Pitfall E14)
- **Program ID update checklist:** After N-player redeploy, 3 locations must be updated atomically: `declare_id!()` in `lib.rs`, `PROGRAM_ID` in `escrow.js`, `REACT_APP_ESCROW_PROGRAM_ID` in client `.env`; the OC-14 checklist from prior research covers this; confirm it is embedded in the Phase 1 plan file
- **`matchEndPayload.prestigeInfo` N-player shape:** Currently covers only `hostId`/`playerId`; must be generalized to all N players in Phase 3; identify all client consumers of this payload before the server change
- **SYS-08 removal gate criteria:** Define explicit acceptance criteria for when the wager guard can be removed — recommended: 3-player Practice match end-to-end passing + escrow devnet deploy verified + Phase 2 service tests passing

---

## Sources

### Primary — HIGH confidence (direct codebase reading)

- `programs/solshot-escrow/src/lib.rs` (884 lines) — full program audit, instruction signatures, escrow struct, BPS math
- `server/services/escrow.js` (543 lines) — function signatures, IDL field names, call patterns, `remainingAccounts` pattern
- `server/services/solana.js` (284 lines) — settlement math, refund signatures, `calculateSettlement`
- `server/socket-io/main.js` (~2800 lines) — all 14 change sites, SYS-08 guard location (line ~1356), deposit confirmation handler (line ~1975), SHOT milestone loop, settlement call sites
- `server/services/match.js` (218 lines) — `getNextTurn`, `isRoundOver`, `isMatchOver`, `resetForNextRound`, `turnsPerRound`
- `server/services/gold.js` (115 lines) — gold economy structure and per-HP earn rate
- `server/services/physics.js` (lines 440-460) — tank spawn zone calculation
- `client/src/scenes/main/index.js` (lines 1-650) — Phaser scene tank references, `checkSwitchTurn`, `applyTurnResult`
- `client/src/screens/battle/BattleHUD.js` — hardcoded two ScoreBoards
- `client/src/wallet/WalletContext.js` (450 lines) — `signAndSendEscrowDeposit`, CS-01 discriminator constant
- `programs/solshot-escrow/tests/bok_proptest_space.rs` — space verification harness
- `server/idl/solshot_escrow.json` — current IDL field names and layout

### Secondary — HIGH confidence (official documentation)

- Anchor Space Reference Table ([anchor-lang.com/docs/references/space](https://www.anchor-lang.com/docs/references/space)) — Pubkey=32B, bool=1B, Vec prefix=4B, discriminator=8B, u8=1B, i64=8B, u64=8B
- Anchor 0.32.1 Release Notes ([anchor-lang.com/docs/updates/release-notes/0-32-1](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1)) — no breaking changes for this milestone
- Solana Transaction Size Limits ([solana.com/docs/core/transactions](https://solana.com/docs/core/transactions)) — 1,232 bytes, 64 accounts max
- Direct Lamport Transfer from PDA ([solana.com/developers/guides/games/store-sol-in-pda](https://solana.com/developers/guides/games/store-sol-in-pda)) — lamport transfer pattern for cancel/refund
- Anchor Account Constraints / remaining_accounts ([solana.com/docs/programs/anchor](https://solana.com/docs/programs/anchor)) — usage and manual validation requirement
- Anchor Account Constraints realloc ([anchor-lang.com/docs/references/account-constraints](https://www.anchor-lang.com/docs/references/account-constraints)) — not needed for devnet where accounts are throwaway

### Secondary — MEDIUM confidence (derived or community sources)

- Helius Solana security guide — `remaining_accounts` positional key validation, writable account demotion via reserved accounts list
- OSEC lamport transfer article (2025) — writable demotion patterns and `IllegalLamportChange` error conditions
- Simple-Escrow-Bet GitHub ([github.com/eltontay/Simple-Escrow-Bet](https://github.com/eltontay/Simple-Escrow-Bet)) — N-player (up to 20) escrow reference implementation
- GamerWager.com — 1v1 wager deposit patterns (extrapolated for N-player parallel emit model)
- SIMD-0296 (transaction size increase to 4,096 bytes) — draft proposal only; not live on mainnet; do not depend on it

---

*Research completed: 2026-02-27*
*Ready for roadmap: yes*
