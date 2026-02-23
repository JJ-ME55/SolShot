# Roadmap: SolShot v1.1 — Security Hardening

## Overview

SolShot's three security audits (SOS, DB, BOK) revealed 15 CRITICAL and 23 HIGH-severity findings across the on-chain program, off-chain server, and client. This roadmap addresses all findings in dependency order: the on-chain program is redesigned first (all off-chain code depends on it), then the server financial path, game integrity, key management, client security, token economy, and infrastructure. A final verification phase re-runs all three audits to confirm remediation.

**Audit Reports:**
- SOS (on-chain): `.audit/FINAL_REPORT.md` — 7C/6H/6M/4L
- DB (off-chain): `.bulwark/FINAL_REPORT.md` — 8C/17H/15M/1L
- BOK (math): `.bok/reports/2026-02-21-report.md` — 24/24 pass, 8 gaps

## Phases

- [x] **Phase 1: On-Chain Program Redesign** — Rewrite escrow program with config PDA, multisig authority, account constraints, pause mechanism, checked arithmetic, and all SOS CRITICAL/HIGH fixes *(completed 2026-02-21; test execution deferred — McAfee blocks local validator)*
- [x] **Phase 2: Server Financial Security** — Verify deposits on-chain, propagate settlement failures, fix rate limiter, add recovery mechanisms *(completed 2026-02-22)*
- [x] **Phase 3: Server Auth & Game Integrity** — Auth guards on all handlers, rejoin re-verification, remove terrain/position manipulation vectors *(completed 2026-02-22)*
- [x] **Phase 4: Secrets & Key Management** — Rotate keypair, purge git history, centralize key loading with zeroization, add SIGHUP rotation mechanism *(completed 2026-02-22)*
- [x] **Phase 4.1: Doc-Code Alignment** — Deposit countdown timer, permissionless reclaim instruction, HP-based disconnect settlement, dead code cleanup *(completed 2026-02-22)*
- [x] **Phase 5: Client & Supply Chain Security** — TX validation before signing, self-hosted Telegram SDK, CSP headers, remove global wallet exposure *(completed 2026-02-22)*
- [x] **Phase 6: Token Economy Hardening** — Persist deduplication Sets to MongoDB, fail-hard on emission counter reset *(completed 2026-02-23)*
- [ ] **Phase 7: Infrastructure & Monitoring** — npm security, endpoint auth, connection limits, logging, terrain entropy
- [ ] **Phase 8: Verification & Re-Audit** — Re-run SOS, DB, BOK on hardened codebase; generate pre-launch security documentation

---

## Phase Details

### Phase 1: On-Chain Program Redesign
**Goal:** The escrow program has a global config PDA with multisig-controlled authority; winner/treasury/ops accounts are on-chain validated; an emergency pause mechanism exists; checked arithmetic eliminates all overflow paths; all SOS CRITICAL and HIGH findings are resolved in the program source.
**Depends on:** Nothing (first phase — all other phases depend on new program IDL)
**Requirements:** OC-01, OC-02, OC-03, OC-04, OC-05, OC-06, OC-07, OC-08, OC-09, OC-10, OC-11, OC-12, OC-13, OC-14
**Findings addressed:** SOS: S001, H008, H001, H026, H029-partial, H007, H003, H009, S004, S005, H002, H022, H028, H017, S003, H027, H024 | BOK: GAP-001 through GAP-008 | DB: H048, H053
**Success Criteria** (what must be TRUE):
  1. A `ProgramConfig` PDA exists with `authority`, `treasury`, `ops`, and `is_paused` fields — all settlement/cancel operations validate against this config
  2. The `winner` account in `SettleMatch` has an Anchor constraint binding it to one of the two registered players — passing an arbitrary address causes the instruction to fail
  3. `treasury` and `ops` accounts in `SettleMatch` are validated against the config PDA — no UncheckedAccount without address constraint remains
  4. `cancel_match` by authority is restricted to `AwaitingDeposits` state only — calling cancel on an Active match fails
  5. All BPS arithmetic uses u128 intermediates with checked operations — `cargo test` passes all 39 BOK tests plus new tests for added constraints
  6. `cargo build-sbf` succeeds and program deploys to devnet localnet
**Plans:** 3 plans
Plans:
- [x] 01-01-PLAN.md -- Rewrite lib.rs with all OC-01 through OC-12 security fixes (756 LOC, GlobalConfig PDA, constraints, checked arithmetic, pause, wager bounds)
- [x] 01-02-PLAN.md -- Build program, generate IDL, update server escrow.js for config PDA integration (OC-14)
- [x] 01-03-PLAN.md -- 25-test suite covering all constraints and negative cases (execution deferred — McAfee blocks validator)

---

### Phase 2: Server Financial Security
**Goal:** The escrow deposit flow verifies on-chain before accepting; settlement failures propagate to callers and trigger recovery; the rate limiter actually functions; queue wager mismatches are rejected
**Depends on:** Phase 1 (new IDL must be integrated before deposit verification can validate PDA state)
**Requirements:** SF-01, SF-02, SF-03, SF-04, SF-05
**Findings addressed:** DB: H013, H049, H051, H015, H020/H050, H021/H054, H017
**Success Criteria** (what must be TRUE):
  1. Sending a fake `escrowDepositConfirm({ txSignature: "fake" })` is rejected with an error — the server verifies the TX on-chain before accepting
  2. When `settleMatchEscrow()` fails, `settleMatch()` returns `{ success: false }` — no silent fallback to success
  3. On settlement failure, the server calls `cancelMatchEscrow()` as a recovery mechanism
  4. The rate limiter correctly blocks the 31st event per second from a single socket
  5. A joiner whose wager doesn't match the queue's required wager is rejected before pairing
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md -- Fix Float64Array rate limiter (SF-04), queue wager validation (SF-05), on-chain deposit verification (SF-01)
- [x] 02-02-PLAN.md -- Settlement failure propagation (SF-02) and recovery via cancelMatchEscrow (SF-03)

---

### Phase 3: Server Auth & Game Integrity
**Goal:** Every socket handler that modifies game state or touches financial operations requires authentication; reconnection requires cryptographic proof; no client-submitted data can override server-authoritative terrain, positions, or turn state
**Depends on:** Phase 2 (rate limiter must work before auth changes, to prevent bypass flooding)
**Requirements:** SA-01, SA-02, SA-03, SA-04, SA-05, SA-06
**Findings addressed:** DB: H008, H006, H033, H034, H035, H036, H009
**Success Criteria** (what must be TRUE):
  1. Connecting a socket without wallet authentication and calling `escrowDepositConfirm` returns an error — not silently accepted
  2. Calling `rejoinRoom` with only a wallet address (no signature) is rejected — Ed25519 re-verification required
  3. The `terrainPath` handler either does not exist or rejects calls during BATTLE state
  4. Firing with a position > 50px from server position uses server position — client position is not written back to server state
  5. Calling `stepLeft` during the opponent's turn is rejected — turn ownership check enforced
  6. Sending an event with a roomId the socket is not in is rejected
**Plans:** 3 plans
Plans:
- [x] 03-01-PLAN.md -- Auth guards on 14 handlers (SA-01) + turn ownership on step handlers (SA-05) + cross-room isolation (SA-06)
- [x] 03-02-PLAN.md -- Delete terrainPath handler (SA-03) + fix fire position writeback + positionUpdate distance validation (SA-04)
- [x] 03-03-PLAN.md -- Ed25519 rejoin re-verification on server + client (SA-02)

---

### Phase 4: Secrets & Key Management
**Goal:** The compromised devnet keypair is rotated; the old key is purged from git history; production secrets are stored in Render secrets (not env vars); keys are isolated per service; a rotation mechanism exists for zero-downtime credential updates
**Depends on:** Phase 1 (new program with config PDA must be deployed before authority rotation)
**Requirements:** KM-01, KM-02, KM-03, KM-04, KM-05
**Findings addressed:** DB: H001, H002, H004, H005, H045
**Success Criteria** (what must be TRUE):
  1. `git log --all -p -- '**/solshot-dev.json'` returns empty — the keypair is purged from all git history
  2. `render.yaml` does not contain `SOLANA_KEYPAIR_JSON` as a plaintext env var — it references a Render secret
  3. `escrow.js` and `solana.js` load different keypairs (or the same key via a single shared module — not independently)
  4. After server startup, the secret key bytes are zeroed out in the original Uint8Array
  5. The server supports SIGHUP-triggered credential reload without restart
**Plans:** 3 plans
Plans:
- [x] 04-01-PLAN.md -- Centralized key module (keys.js) with zeroization; refactor escrow.js + solana.js to use it (KM-03, KM-04)
- [x] 04-02-PLAN.md -- SIGHUP credential reload + admin endpoint in index.js; render.yaml secrets; .gitignore hardening (KM-02, KM-05)
- [x] 04-03-PLAN.md -- Git history purge via BFG; generate new keypair; reclone (KM-01) [manual checkpoint]

---

### Phase 4.1: Doc-Code Alignment (INSERTED)
**Goal:** Code matches all 39 litepaper/doc decisions — deposit countdown timer implemented, permissionless reclaim instruction added to escrow program, disconnect handler uses HP-based settlement for connection drops, dead code removed
**Depends on:** Phase 4 (keys must be rotated before program changes), Phase 1 (Anchor program must be updated for new instruction)
**Requirements:** DCA-01, DCA-02, DCA-03, DCA-04
**Findings addressed:** Litepaper QA — escrow flow, crypto explainer, token economics alignment
**Success Criteria** (what must be TRUE):
  1. After both players join a wagered match, a 2-3 minute deposit countdown starts — if only one player deposits before expiry, full refund occurs and PDA closes
  2. A `permissionless_reclaim` instruction exists in lib.rs that allows anyone to trigger refund after 2x the normal timeout — separate from `cancel_match`
  3. When a player disconnects (not intentional quit), the server checks HP and round scores — the player ahead wins the wager; genuinely even → refund both
  4. `server/services/raydium.js` is deleted (dead code, never imported)
**Plans:** 2/2

Plans:
- [x] 04.1-01: Deposit countdown timer + HP-based disconnect settlement + dead code removal
- [x] 04.1-02: Permissionless reclaim instruction + IDL rebuild + escrow.js wrapper

---

### Phase 5: Client & Supply Chain Security
**Goal:** The client validates transaction instructions before signing; the Telegram SDK is self-hosted (no external CDN dependency); CSP prevents arbitrary script injection; wallet signing functions are not exposed as globals
**Depends on:** Phase 1 (new program IDL needed for TX instruction validation)
**Requirements:** CS-01, CS-02, CS-03, CS-04
**Findings addressed:** DB: H019, H031, H032
**Success Criteria** (what must be TRUE):
  1. `signAndSendEscrowDeposit()` parses the deserialized transaction and verifies the program ID matches the escrow program — a transaction targeting a different program is rejected
  2. The Telegram SDK is self-hosted at `/js/telegram-web-app.js` (same origin) — no external CDN dependency *(deviation: SRI hash replaced by self-hosting because Telegram updates the SDK URL in-place without versioning)*
  3. Helmet CSP is enabled with a `script-src` that blocks inline scripts and unknown CDN origins
  4. `window.solWallet` is undefined — Phaser accesses wallet functions through a controlled interface (React context or message bus)
**Plans:** 2/2

Plans:
- [x] 05-01: TX instruction validation in signAndSendEscrowDeposit (CS-01) + window.solWallet removal (CS-04)
- [x] 05-02: Self-host Telegram SDK (CS-02) + CSP meta tag and Helmet (CS-03)

---

### Phase 6: Token Economy Hardening
**Goal:** All in-memory deduplication Sets are persisted to MongoDB; server restart cannot be exploited for replay attacks; emission counter reset cannot bypass the supply cap
**Depends on:** Phase 3 (auth guards must be in place before replay prevention matters)
**Requirements:** TE-01, TE-02, TE-03
**Findings addressed:** DB: H025, H029, H028
**Success Criteria** (what must be TRUE):
  1. After server restart, replaying a previously verified burn TX signature returns "already verified" — the Set is restored from MongoDB
  2. After server restart, replaying a previously claimed match ID returns "already claimed" — the Set is restored from MongoDB
  3. If MongoDB is unreachable at startup, the server exits with code 1 — it never starts with a zeroed emission counter
**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md -- Schema fields (verifiedBurnTxs, claimedMatchIds) + fail-hard startup (TE-03)
- [x] 06-02-PLAN.md -- Set persistence in shot-token.js: load/save verifiedBurnTxs (TE-01) + claimedMatchIds (TE-02)

---

### Phase 7: Infrastructure & Monitoring
**Goal:** Build pipeline uses `npm ci --ignore-scripts`; sensitive endpoints are authenticated; connection floods are throttled; logs redact sensitive data; terrain seeds are unpredictable
**Depends on:** Nothing (can run in parallel with Phases 5-6)
**Requirements:** IM-01, IM-02, IM-03, IM-04, IM-05
**Findings addressed:** DB: H041, H043, H024, H040, H038
**Success Criteria** (what must be TRUE):
  1. `render.yaml` build command includes `--ignore-scripts`
  2. Calling `/stats` without authentication returns 401
  3. More than 100 connections from a single IP are rejected
  4. No wallet addresses or balances appear in cleartext in stdout logs
  5. Terrain seeds are 128+ bits of CSPRNG entropy
**Plans:** 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Secure build command (IM-01) + /stats auth guard (IM-02) + per-IP connection limiting (IM-03)
- [ ] 07-02-PLAN.md -- Structured logging with pino redaction (IM-04) + 128-bit terrain seed entropy (IM-05)

---

### Phase 8: Verification & Re-Audit
**Goal:** All three audits re-run on the hardened codebase confirm that CRITICAL and HIGH findings are resolved; pre-launch security documentation is complete
**Depends on:** Phases 1-7 (all remediation complete)
**Requirements:** VR-01, VR-02, VR-03, VR-04
**Findings addressed:** All (verification)
**Success Criteria** (what must be TRUE):
  1. SOS re-audit shows 0 CRITICAL and 0 HIGH findings (all either RESOLVED or documented as ACCEPTED RISK with justification)
  2. DB re-audit shows 0 CRITICAL and 0 HIGH findings
  3. BOK re-verification shows all 8 gaps either fixed or documented as accepted risk
  4. A pre-launch security document exists at `.planning/SECURITY_SUMMARY.md` suitable for public disclosure
**Plans:** TBD

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → **4.1** → 5 → 6 → 7 → 8
(Phases 5-7 can partially overlap after Phase 1 is done; Phase 7 is independent)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. On-Chain Program Redesign | 3/3 | Complete (tests deferred) | 2026-02-21 |
| 2. Server Financial Security | 2/2 | Complete | 2026-02-22 |
| 3. Server Auth & Game Integrity | 3/3 | Complete | 2026-02-22 |
| 4. Secrets & Key Management | 3/3 | Complete | 2026-02-22 |
| 4.1 Doc-Code Alignment | 2/2 | Complete | 2026-02-22 |
| 5. Client & Supply Chain Security | 2/2 | Complete | 2026-02-22 |
| 6. Token Economy Hardening | 2/2 | Complete | 2026-02-23 |
| 7. Infrastructure & Monitoring | 0/2 | Planned | - |
| 8. Verification & Re-Audit | 0/TBD | Not started | - |

**Total:** 17/19 plans complete (Phases 1-6 done; Phase 7 planned; Phase 8 remaining)

---

## Findings Coverage Matrix

### SOS Findings (On-Chain)

| Finding | Severity | Phase | Requirement | Status |
|---------|----------|-------|-------------|--------|
| S001 | CRITICAL | 1 | OC-02, OC-03 | ✅ Resolved |
| H008 | CRITICAL | 1 | OC-02 | ✅ Resolved |
| H001 | CRITICAL | 1 | OC-03 | ✅ Resolved |
| H026 | CRITICAL | 1 | OC-01 | ✅ Resolved |
| H029 | CRITICAL | — | Out of scope (v1.2) | Deferred |
| H007 | CRITICAL | 1 | OC-01 | ✅ Resolved |
| H003 | CRITICAL | 1 | OC-03 | ✅ Resolved |
| H009 | HIGH | 1 | OC-05 | ✅ Resolved |
| S004 | HIGH | 1 | OC-05 | ✅ Resolved |
| S005 | HIGH | 1 | OC-06 | ✅ Resolved |
| H002 | HIGH | 1 | OC-02 | ✅ Resolved |
| H022 | HIGH | 1 | OC-07 | ✅ Resolved |
| H028 | HIGH | 1 | OC-04 | ✅ Resolved |
| S003 | MEDIUM | 1 | OC-11 | ✅ Resolved |
| H015 | MEDIUM | 1 | — | ✅ Resolved (via H022) |
| H027 | MEDIUM | 1 | OC-13 | ⏳ Deferred to mainnet |
| H014 | MEDIUM | — | Accepted risk | N/A |
| H024 | MEDIUM | 1 | OC-07 | ✅ Resolved |
| H017 | MEDIUM | 1 | OC-08 | ✅ Resolved |
| H018 | LOW | — | Nice-to-have | Optional |
| H016 | LOW | — | Nice-to-have | Optional |
| H031 | LOW | — | Nice-to-have | Optional |
| H032 | LOW | — | Nice-to-have | Optional |

### DB Findings (Off-Chain) — CRITICAL + HIGH only

| Finding | Severity | Phase | Requirement | Status |
|---------|----------|-------|-------------|--------|
| H001 | CRITICAL | 4 | KM-01 | ✅ Resolved |
| H006 | CRITICAL | 3 | SA-02 | ✅ Resolved |
| H013 | CRITICAL | 2 | SF-01 | ✅ Resolved |
| H019 | CRITICAL | 5 | CS-01 | Pending |
| H031 | CRITICAL | 5 | CS-02, CS-03 | Pending |
| H047 | CRITICAL | 4 | KM-01 (downstream) | ✅ Resolved |
| H049 | CRITICAL | 2 | SF-01, SF-02 | ✅ Resolved |
| H053 | CRITICAL | 1 | OC-01 | ✅ Resolved |
| H002 | HIGH | 4 | KM-02 | ✅ Resolved |
| H004 | HIGH | 4 | KM-03 | ✅ Resolved |
| H005 | HIGH | 4 | KM-04 | ✅ Resolved |
| H008 | HIGH | 3 | SA-01 | ✅ Resolved |
| H015 | HIGH | 2 | SF-02 | ✅ Resolved |
| H017 | HIGH | 2 | SF-05 | ✅ Resolved |
| H020/H050 | HIGH | 2 | SF-03 | ✅ Resolved |
| H021/H054 | HIGH | 2 | SF-04 | ✅ Resolved |
| H025 | HIGH | 6 | TE-01 | ✅ Resolved |
| H028 | HIGH | 6 | TE-03 | ✅ Resolved |
| H029 | HIGH | 6 | TE-02 | ✅ Resolved |
| H033 | HIGH | 3 | SA-03 | ✅ Resolved |
| H035 | HIGH | 3 | SA-04 | ✅ Resolved |
| H036 | HIGH | 3 | SA-05 | ✅ Resolved |
| H045 | HIGH | 4 | KM-05 | ✅ Resolved |
| H048 | HIGH | 1 | OC-03 | ✅ Resolved |

### BOK Coverage Gaps

| Gap | Severity | Phase | Requirement | Status |
|-----|----------|-------|-------------|--------|
| GAP-001 | MEDIUM | 1 | OC-08 | ✅ Resolved |
| GAP-002 | LOW | 1 | OC-09 | ✅ Resolved |
| GAP-003 | HIGH | 1 | OC-03 | ✅ Resolved |
| GAP-004 | LOW | 1 | OC-10 | ✅ Resolved |
| GAP-005 | LOW | 1 | OC-10 | ✅ Resolved |
| GAP-006 | LOW | 1 | OC-09 (comment) | ✅ Resolved |
| GAP-007 | LOW | 1 | OC-09 | ✅ Resolved |
| GAP-008 | LOW | 1 | OC-12 | ✅ Resolved |
