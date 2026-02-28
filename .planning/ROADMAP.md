# Roadmap: SolShot

## Milestones

- ✅ **v1.0 Development** - Phases 1-4 (pre-GSD, shipped 18 Feb 2026)
- ✅ **v1.1 Security Hardening** - Phases 1-8 (shipped 23 Feb 2026)
- ✅ **v1.2 Launch Readiness** - Phases 9-14 (shipped 25 Feb 2026)
- ✅ **v1.3 4-Player Multiplayer** - Phases 15-19 (shipped 27 Feb 2026)
- 🚧 **v1.4 N-Player Escrow** - Phases 20-23 (in progress)

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

---

### 🚧 v1.4 N-Player Escrow (In Progress)

**Milestone Goal:** Upgrade the Anchor escrow program and full stack to support 2-4 player wagered matches with trustless winner-takes-all settlement and partial deposit handling.

- [x] **Phase 20: Anchor Program** — Rewrite MatchEscrow for N players (struct, instructions, events, errors)
- [x] **Phase 21: Server Escrow Services** — Update escrow.js and solana.js service layer for N-player context
- [ ] **Phase 22: Server Socket Handlers** — Update main.js for N-player escrow flow, partial deposits, tech debt
- [ ] **Phase 23: Client UX** — Deposit status, countdown timer, partial deposit UI, pot display, mode unlock

## Phase Details

### Phase 20: Anchor Program
**Goal:** The MatchEscrow on-chain program supports 2-4 players: deposits tracked via bitmap, settlement calculates pot from all depositors, partial deposits can start or cancel, and the 10-minute timeout applies.
**Depends on:** Phase 19 (complete)
**Requirements:** ESC-01, ESC-02, ESC-03, ESC-04, ESC-05, ESC-06, ESC-07, ESC-08, ESC-09, ESC-10, ESC-11, ESC-12, ESC-13, ESC-14
**Success Criteria** (what must be TRUE):
  1. `anchor build` succeeds and all 8 test cases pass against a local validator
  2. A 4-player match can be created, all 4 players deposit, and `settle_match` pays the winner 90% of the 4-wager pot
  3. `cancel_match` refunds only deposited players when called with partial deposits (remaining_accounts pattern)
  4. `start_with_depositors` reduces `max_players` to 2 and activates a match where only 2 of 4 players deposited
  5. Deposit timeout fires at 10 minutes (`TIMEOUT_SECONDS = 600`) and `permissionless_reclaim` returns lamports
**Plans:** TBD

Plans:
- [x] 20-01: Struct rewrite — MatchEscrow account (ESC-01, ESC-02, ESC-12, ESC-13, ESC-14)
- [x] 20-02: Core instructions — create_match, deposit_wager, settle_match (ESC-03, ESC-04, ESC-05, ESC-06, ESC-07, ESC-10)
- [x] 20-03: Refund instructions — cancel_match, permissionless_reclaim, start_with_depositors (ESC-08, ESC-09, ESC-11)

### Phase 21: Server Escrow Services
**Goal:** The server-side service layer (escrow.js and solana.js) can create, settle, and cancel N-player escrow accounts, with correct pot math and N-player remaining_accounts for cancel.
**Depends on:** Phase 20 (IDL must be generated and synced before services can reference new instructions)
**Requirements:** SRV-01, SRV-02, SRV-03, SRV-04, SRV-05, SRV-06, SRV-07, SRV-08, SRV-17
**Success Criteria** (what must be TRUE):
  1. `createMatchEscrow(['wallet1', 'wallet2', 'wallet3'])` builds and sends a valid on-chain transaction with 3 player pubkeys
  2. `settleMatchEscrow` accepts a winner from any position in the players array and the program accepts it
  3. `cancelMatchEscrow` passes all N deposited player addresses as remaining_accounts and the refund succeeds
  4. `getEscrowState` returns `players[]`, `depositsMask`, `maxPlayers`, and `numDeposited` fields
  5. `calculateSettlement` returns `wager * playerCount` as total pot (not hardcoded `wager * 2`)
**Plans:** TBD

Plans:
- [x] 21-01: escrow.js N-player update — createMatchEscrow, settleMatchEscrow, cancelMatchEscrow, getEscrowState (SRV-01, SRV-03, SRV-04, SRV-05, SRV-17)
- [x] 21-02: solana.js integration — settleMatch, refundWager, calculateSettlement (SRV-02, SRV-06, SRV-07, SRV-08)

### Phase 22: Server Socket Handlers
**Goal:** The game server orchestrates N-player escrow from room-full through match start, handles partial deposit timeout with host choice, and records SHOT milestones + playAgain state correctly for all N players.
**Depends on:** Phase 21 (socket handlers call service functions)
**Requirements:** SRV-09, SRV-10, SRV-11, SRV-12, SRV-13, SRV-14, SRV-15, SRV-16, SRV-18, DEBT-01, DEBT-02
**Success Criteria** (what must be TRUE):
  1. When a 4-player wagered room fills, all 4 players receive an `escrowDeposit` socket event simultaneously
  2. After all N players confirm deposits, the server emits `escrowActive` and the match begins
  3. When the 5-minute deposit timer expires with partial deposits, the host receives `escrowPartialDeposit` with a list of who deposited
  4. The host can choose `escrowPartialStart` (starts match with depositors, kicks others) or `escrowCancelAll` (full refund, back to lobby)
  5. A 3-player or 4-player room can select Quick Match, Duel, or High Roller in the lobby without being blocked by the wager guard
  6. After a BO3 match, `playAgain` resets with the correct `maxPlayers` (3 or 4) preserved
**Plans:** 3 plans

Plans:
- [ ] 22-01-PLAN.md — N-player escrow orchestration: deposit timeout to 5min, N-player wallet collection, parallel deposit TX dispatch, depositsMask verification, escrowDepositStatus events (SRV-09, SRV-10, SRV-11, SRV-12, SRV-18)
- [ ] 22-02-PLAN.md — Partial deposit flow: 3-branch timeout (zero/partial/all), escrowPartialDeposit event, escrowPartialStart + escrowCancelAll handlers, wager guard removal (SRV-13, SRV-14, SRV-15, SRV-16)
- [ ] 22-03-PLAN.md — Tech debt: N-player SHOT milestones + prestige + DB persist, playAgain maxPlayers + escrow re-creation, failedSettlements N-player (DEBT-01, DEBT-02)

### Phase 23: Client UX
**Goal:** Players in any wagered room see real-time deposit status for all participants, a countdown timer, and the host can make the partial deposit choice from the lobby; the battle HUD shows the live pot, and all match modes are selectable for 3-4 player rooms.
**Depends on:** Phase 22 (client reacts to server socket events)
**Requirements:** CLT-01, CLT-02, CLT-03, CLT-04, CLT-05, CLT-06, CLT-07, CLT-08
**Success Criteria** (what must be TRUE):
  1. In a 4-player wagered lobby, each player's deposit status updates in real time (checkmark appears when they deposit)
  2. A visible countdown timer counts down from 5 minutes while deposits are pending
  3. When the timer expires with partial deposits, the host sees "Start with depositors" and "Cancel and refund all" buttons; non-hosts see a waiting message
  4. A non-depositing player who is kicked receives a notification and is returned to the menu screen
  5. During a wagered match, the battle HUD displays the total pot (e.g., "Pot: 1.2 SOL")
  6. A 3-player or 4-player room can select Quick Match, Duel, or High Roller from the lobby mode tabs
**Plans:** TBD

Plans:
- [ ] 23-01: LobbyScreen deposit flow — per-player status badges, countdown timer, partial deposit host UI, kick notification (CLT-01, CLT-02, CLT-03, CLT-04, CLT-05, CLT-07, CLT-08)
- [ ] 23-02: BattleScreen — total pot display in HUD (CLT-06)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-4. Pre-GSD Work | v1.0 | — | Complete | 18 Feb 2026 |
| 1-8. Security Hardening | v1.1 | 25/25 | Complete | 23 Feb 2026 |
| 9-14. Launch Readiness | v1.2 | 15/15 | Complete | 25 Feb 2026 |
| 15-19. 4-Player Multiplayer | v1.3 | 10/10 | Complete | 27 Feb 2026 |
| 20. Anchor Program | v1.4 | 3/3 | Complete | 27 Feb 2026 |
| 21. Server Escrow Services | v1.4 | 2/2 | Complete | 28 Feb 2026 |
| 22. Server Socket Handlers | v1.4 | 0/3 | Not started | - |
| 23. Client UX | v1.4 | 0/2 | Not started | - |

---

*Roadmap created: 26 Feb 2026*
*v1.3 archived: 27 Feb 2026*
*v1.4 roadmap added: 27 Feb 2026*
