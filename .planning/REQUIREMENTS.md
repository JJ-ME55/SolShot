# SolShot v1.1 — Security Hardening Requirements

Derived from three completed audits:
- **SOS** (on-chain): `.audit/FINAL_REPORT.md` — 7C/6H/6M/4L
- **DB** (off-chain): `.bulwark/FINAL_REPORT.md` — 8C/17H/15M/1L
- **BOK** (math): `.bok/reports/2026-02-21-report.md` — 8 gaps

---

## On-Chain Program Redesign

- [x] **OC-01**: Implement global config PDA with multisig authority — replace single-key authority with 2-of-3 multisig for settlement/cancel operations (SOS: H026, H007, H053; DB: H053)
- [x] **OC-02**: Constrain winner account — add Anchor constraint linking `winner: UncheckedAccount` to validated `winner: Pubkey` argument so funds cannot be redirected to arbitrary addresses (SOS: H008, H002, S001)
- [x] **OC-03**: Validate treasury/ops accounts on-chain — hardcode or config-PDA-validate treasury and ops pubkeys; add uniqueness constraint `treasury != ops` (SOS: H001, H003, S001; BOK: GAP-003; DB: H048)
- [x] **OC-04**: Add emergency pause mechanism — create global `is_paused` flag in config PDA; add pause guard to all four instructions; pause callable by separate emergency key (SOS: H028)
- [x] **OC-05**: Restrict authority cancel to AwaitingDeposits — prevent authority from cancelling Active matches (denial of winner prize) (SOS: H009, S004)
- [x] **OC-06**: Prevent authority as player — add `require!(player_one != authority && player_two != authority)` in `create_match` (SOS: S005)
- [x] **OC-07**: Add settlement deadline — add `activated_at` field to MatchEscrow; enforce maximum settlement time after Active state; fix timeout reference point to measure from `activated_at` (SOS: H022, H024)
- [x] **OC-08**: Add minimum wager floor — `require!(wager_lamports >= 10_000)` to prevent dust-wager fee bypass (SOS: H017; BOK: GAP-001)
- [x] **OC-09**: Apply checked arithmetic + u128 widening throughout — u128 intermediates for BPS math, `checked_add` for timeout, `checked_mul` for pot/events (BOK: GAP-002, GAP-007)
- [x] **OC-10**: Set terminal state before transfers — `state = Settled` before lamport transfers in settle_match; `state = Cancelled` before refunds in cancel_match (BOK: GAP-004, GAP-005)
- [x] **OC-11**: Add fee destination addresses to MatchSettled event — include `treasury_account: Pubkey` and `ops_account: Pubkey` (SOS: S003)
- [x] **OC-12**: Add maximum wager cap — `require!(wager_lamports <= MAX_WAGER_LAMPORTS)` to prevent dead/unfundable escrows (BOK: GAP-008)
- [x] **OC-13**: Transfer/burn upgrade authority before mainnet *(deferred to mainnet deploy)* — move to multisig or burn depending on immutability decision (SOS: H027)
- [x] **OC-14**: Update IDL and server service after program changes — rebuild, copy IDL, update `escrow.js` account structs and instruction calls

## Server Financial Security

- [x] **SF-01**: Verify escrow deposits on-chain — `getEscrowState(rid)` PDA boolean verification in `escrowDepositConfirm` handler; verifies deposit flags + wager amount on-chain (DB: H013, H049, H051)
- [x] **SF-02**: Propagate settlement failure — `settleMatch()` returns `{ success: false }` when escrow settlement fails; no silent fallback (DB: H015)
- [x] **SF-03**: Add settlement failure recovery — `handleSettlementFailure()` calls `cancelMatchEscrow()` immediately; `failedSettlements` Map retries every 60s (max 5); all 3 call sites transition to CANCELLED on failure (DB: H020/H050)
- [x] **SF-04**: Fix Int32 rate limiter — `Float64Array` ring buffers at all 3 declarations; Date.now() timestamps stored correctly (DB: H021/H054)
- [x] **SF-05**: Queue wager validation — peek `queue[0].wager` before `queue.shift()`; mismatch queues joiner separately with `queueWaiting` emit (DB: H017)

## Server Auth & Game Integrity

- [x] **SA-01**: Add auth guards to all socket handlers — apply `requireAuth(client)` to all 24 unguarded handlers that affect game state or financial operations (DB: H008)
- [x] **SA-02**: Require Ed25519 re-verification on rejoin — add signature check in `rejoinRoom` handler before restoring `isAuthenticated` (DB: H006)
- [x] **SA-03**: Remove or gate terrainPath handler — delete handler entirely or restrict to pre-BATTLE states and host-only (DB: H033)
- [x] **SA-04**: Fix position manipulation — remove fire handler position writeback; use server position as authoritative; add distance validation to `positionUpdate` (DB: H034, H035)
- [x] **SA-05**: Add turn ownership to step handlers — add `ms.currentTurn !== client.id` check to stepLeft/stepRight (DB: H036)
- [x] **SA-06**: Cross-room event isolation — validate `roomId` against socket's actual room membership in all handlers accepting client-supplied roomId (DB: H009)

## Secrets & Key Management

- [ ] **KM-01**: Rotate server keypair and purge from git — generate new keypair, update on-chain authority, remove `_archive/junk/tilde-dir/.config/solana/solshot-dev.json` from git history using BFG (DB: H001)
- [ ] **KM-02**: Use Render secrets for keypair — move `SOLANA_KEYPAIR_JSON` from plaintext env var to Render secret (DB: H002)
- [ ] **KM-03**: Separate keys per service — use distinct keys for escrow operations vs token operations; no shared keypair between `escrow.js` and `solana.js` (DB: H004)
- [ ] **KM-04**: Key material zeroization — zeroize secret key Uint8Array after `Keypair.fromSecretKey()` to prevent heap dump exposure (DB: H005)
- [ ] **KM-05**: Key rotation mechanism — implement SIGHUP-triggered credential reload; support key versioning for graceful rotation without restart (DB: H045)

## Client & Supply Chain Security

- [ ] **CS-01**: Client-side TX validation — parse and verify transaction instructions in `signAndSendEscrowDeposit()` before signing; verify program ID, instruction type, and destination accounts (DB: H019)
- [ ] **CS-02**: Add SRI hash to Telegram SDK — pin version and add `integrity` attribute to Telegram Web App SDK script tag at `index.html:7` (DB: H031)
- [ ] **CS-03**: Enable Content Security Policy — remove `contentSecurityPolicy: false` at `server/index.js:31-34`; configure strict `script-src` (DB: H031)
- [ ] **CS-04**: Remove window.solWallet global — replace with React context or message passing for Phaser access; eliminate direct global exposure of wallet signing functions (DB: H031/H032)

## Token Economy Hardening

- [ ] **TE-01**: Persist verifiedBurnTxs to MongoDB — add to User schema; restore Set from DB on startup; prevent prestige burn TX replay after server restart (DB: H025)
- [ ] **TE-02**: Persist claimedMatchIds to MongoDB — add to User schema; restore in `loadMilestoneState()`; prevent match reward double-claim after restart (DB: H029)
- [ ] **TE-03**: Fail hard on initShotState failure — `process.exit(1)` if MongoDB query for emission counter fails at startup; prevent supply cap bypass from reset counter (DB: H028)

## Infrastructure & Monitoring

- [ ] **IM-01**: Use `npm ci --ignore-scripts` on Render — change `render.yaml:16` build command to prevent malicious lifecycle scripts from executing with access to secrets (DB: H041)
- [ ] **IM-02**: Authenticate /stats endpoint — add auth guard to prevent unauthenticated financial metric exposure (DB: H043)
- [ ] **IM-03**: Connection limiting — add `maxConnections` to Socket.IO and per-IP connection limiting (DB: H024)
- [ ] **IM-04**: Structured logging with redaction — replace cleartext wallet/balance logging with structured logger that redacts sensitive fields (DB: H040)
- [ ] **IM-05**: Increase terrain seed entropy — increase from 20-bit to 128+ bit seeds to prevent terrain prediction (DB: H038)

## Verification

- [ ] **VR-01**: Re-run SOS on hardened escrow program — verify all CRITICAL/HIGH findings are resolved
- [ ] **VR-02**: Re-run DB on hardened server + client — verify all CRITICAL/HIGH findings are resolved
- [ ] **VR-03**: Re-run BOK on updated arithmetic — verify checked arithmetic and new constraints
- [ ] **VR-04**: Generate pre-launch security documentation — summary of scope, findings, remediations suitable for public disclosure

---

## Traceability

| Requirement | Phase | Audit Source | Findings Addressed |
|-------------|-------|--------------|-------------------|
| OC-01 | Phase 1 | SOS, DB | H026, H007, H053 |
| OC-02 | Phase 1 | SOS | H008, H002, S001 |
| OC-03 | Phase 1 | SOS, BOK, DB | H001, H003, S001, GAP-003, H048 |
| OC-04 | Phase 1 | SOS | H028 |
| OC-05 | Phase 1 | SOS | H009, S004 |
| OC-06 | Phase 1 | SOS | S005 |
| OC-07 | Phase 1 | SOS | H022, H024 |
| OC-08 | Phase 1 | SOS, BOK | H017, GAP-001 |
| OC-09 | Phase 1 | BOK | GAP-002, GAP-007 |
| OC-10 | Phase 1 | BOK | GAP-004, GAP-005 |
| OC-11 | Phase 1 | SOS | S003 |
| OC-12 | Phase 1 | BOK | GAP-008 |
| OC-13 | Phase 1 | SOS | H027 |
| OC-14 | Phase 1 | — | (integration) |
| SF-01 | Phase 2 | DB | H013, H049, H051 |
| SF-02 | Phase 2 | DB | H015 |
| SF-03 | Phase 2 | DB | H020/H050 |
| SF-04 | Phase 2 | DB | H021/H054 |
| SF-05 | Phase 2 | DB | H017 |
| SA-01 | Phase 3 | DB | H008 |
| SA-02 | Phase 3 | DB | H006 |
| SA-03 | Phase 3 | DB | H033 |
| SA-04 | Phase 3 | DB | H034, H035 |
| SA-05 | Phase 3 | DB | H036 |
| SA-06 | Phase 3 | DB | H009 |
| KM-01 | Phase 4 | DB | H001 |
| KM-02 | Phase 4 | DB | H002 |
| KM-03 | Phase 4 | DB | H004 |
| KM-04 | Phase 4 | DB | H005 |
| KM-05 | Phase 4 | DB | H045 |
| CS-01 | Phase 5 | DB | H019 |
| CS-02 | Phase 5 | DB | H031 |
| CS-03 | Phase 5 | DB | H031 |
| CS-04 | Phase 5 | DB | H031/H032 |
| TE-01 | Phase 6 | DB | H025 |
| TE-02 | Phase 6 | DB | H029 |
| TE-03 | Phase 6 | DB | H028 |
| IM-01 | Phase 7 | DB | H041 |
| IM-02 | Phase 7 | DB | H043 |
| IM-03 | Phase 7 | DB | H024 |
| IM-04 | Phase 7 | DB | H040 |
| IM-05 | Phase 7 | DB | H038 |
| VR-01 | Phase 8 | — | All SOS findings |
| VR-02 | Phase 8 | — | All DB findings |
| VR-03 | Phase 8 | — | All BOK gaps |
| VR-04 | Phase 8 | — | SEC-04 (from v1.0) |

## Out of Scope (v1.1)
- Outcome verification / dispute mechanism (SOS: H029) — deferred to v1.2; requires protocol-level design decisions beyond code fix
- Horizontal scaling architecture (DB: H060) — architectural debt, not exploitable on single instance
- Dev mode prestige bypass (DB: H030) — mitigated by env var being set in production
- Low-severity findings from all three audits unless trivially addressable alongside HIGH fixes
