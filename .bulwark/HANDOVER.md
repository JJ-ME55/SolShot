# DB Audit Handover — Bulwark #2 (Stacked Audit)

**Generated:** 2026-05-07  
**Current Audit:** #2 (stacked on Feb #1)  
**Previous Audit:** #1 — 2026-02-24 @ commit `ecfd03b`  
**Current Commit:** `5f2acec` (post-BOK Audit #2)  
**Previous Result:** 12 CRITICAL + 34 HIGH + 18 MEDIUM + 6 LOW (= 70 confirmed) + 29 POTENTIAL + 31 NOT_VULNERABLE  
**Previous Verdict:** "Not safe for production deployment with real funds in its current state."

---

## Section 1: Delta Summary

### File Changes (Feb 2026 → May 2026)

**Magnitude:**
- **Modified:** 71 files (server + client core)
- **New:** 127 files (~30 in server, ~50 in client, ~47 in audit history)
- **Deleted:** 3 files (old audit artifacts)
- **Total source files Feb 2026:** 93 files, ~36,512 LOC
- **Total source files May 2026 (estimated):** ~150 files, ~84,270 LOC (131% growth)

**Massive Rewrite Check:**
- Modified + New = 198 changes across ~150 total files = **~66% changed**
- **Result: Below 70% threshold.** Verification agents WILL RUN on the unchanged 34% (~50 files).

### Directory-Level Breakdown (Modified Files)

| Directory | Modified | New | Impact |
|-----------|----------|-----|--------|
| `server/socket-io/` | 1 | 0 | `main.js` — core handler (handler updates, auth-reset-on-reconnect) |
| `server/services/` | 12 | 8 | escrow-v2.js, jupiter-price, groupchat (10), walletLinkTokens, privyAuth |
| `server/middleware/` | 2 | 0 | auth.js, guards.js (rate limiter, auth, signature verification) |
| `server/models/` | 1 | 1 | User.js, new schemas |
| `client/src/context/` | 2 | 1 | WalletContext.js (Privy migration) |
| `client/src/screens/` | 15 | ~20 | LobbyScreen, BattleScreen, PrestigeScreen, HowToPlayScreen, etc. |
| `client/src/components/` | 8 | ~25 | New HUD, canvas, group-chat, modals |

**Major Architectural Changes:**
1. **Dynamic → Privy** embedded wallets (NEW: `privyAuth.js`, `walletLinkTokens.js`)
2. **Group-chat infrastructure** (NEW: 10 files in `server/services/groupchat/`)
3. **Escrow v2 integration** (NEW: `escrow-v2.js`, N-player multi-day matches)
4. **Auth-reset-on-reconnect fix** (commit `8eefcca`, applied to current)
5. **HUD overlay + canvas widening** (UI refactor)

---

## Section 2: Previous Findings Digest

### CRITICAL Findings (12 total)

| ID | Title | Target Files — Feb 2026 | Status Now | File Modified? |
|----|-------|--------------------------|-----------|-----------------|
| C-1 | Balance-Check-Fail-Open Wager | main.js:990-993, solana.js | **RECHECK** | YES |
| C-2 | joinQueue No Balance Check | main.js:1213-1389 | **RECHECK** | YES |
| C-3 | Settlement Without Deposit Verify | main.js:1399-1481, solana.js | **RECHECK** | YES |
| C-4 | Phantom Wager Rematch (H012) | main.js:2498-2561 | **RECHECK** | YES |
| C-5 | JWT Never Consumed (H029) | auth.js:~40, main.js | **RECHECK** | YES |
| C-6 | Signature Replay 5-Min Window (H030) | auth.js:39-64 | **RECHECK** | YES |
| C-7 | 6 Unauthenticated Socket Events (H016, H017) | main.js (6 handlers) | **RECHECK** | YES |
| C-8 | createWeaponArray Non-Host (H018) | main.js:~1800s | **RECHECK** | YES |
| C-9 | Position Teleport 12K px/sec (H047) | main.js positionUpdate | **RECHECK** | YES |
| C-10 | Prestige Burn Double-Unlock (F-04, H003, H005) | main.js:~1618, shot-token.js | **RECHECK** | YES |
| C-11 | escrowDepositConfirm Partial Deposit | main.js escrowDepositConfirm | **RECHECK** | YES |
| C-12 | Hardcoded Program ID / Single Authority (H013, H026) | keys.js, escrow.js, escrow-v2.js | **RECHECK** | YES |

**Tag: All 12 CRITICAL in modified files.**

### HIGH Findings (34 total)

**Financial/Escrow Path (11):**
| ID | Title | File(s) | Status | Modified? |
|----|-------|---------|--------|-----------|
| H001 | Balance-Check-Fail-Open | main.js, solana.js | RECHECK | YES |
| H003 | Prestige Double-Unlock Race | shot-token.js | RECHECK | YES |
| H004 | Settlement Without Deposit Check | main.js | RECHECK | YES |
| H005 | burnAmount=0 Bypass | shot-token.js | RECHECK | YES |
| H007 | refundWager Wrong Params | main.js:686-691 | RECHECK | YES |
| H010 | Deposit-Confirmation Race | main.js | RECHECK | YES |
| H012 | Wagerless Rematch | main.js:2498-2561 | RECHECK | YES |
| H027 | Escrow Creation Failure Ignored | main.js:1399-1481 | RECHECK | YES |
| H028 | 30s Balance Cache TOCTOU | solana.js | RECHECK | YES |
| H046 | RPC Fails-Open Default | solana.js, main.js | RECHECK | YES |
| H060 | joinQueue No Balance Check | main.js:1213-1389 | RECHECK | YES |

**Auth/Access (5):**
| ID | Title | File(s) | Status | Modified? |
|----|-------|---------|--------|-----------|
| H016, H017 | Unauthenticated Events (shoot, giveTurn, etc.) | main.js (6 handlers) | RECHECK | YES |
| H018 | Non-Host Weapon Override | main.js createWeaponArray | RECHECK | YES |
| H029 | JWT Dead Code | auth.js | RECHECK | YES |
| H031 | No Account-Change Handler | WalletContext.js | RECHECK | YES |
| H032 | window.socket XSS | App.js, WalletContext.js | RECHECK | YES |

**Error Handling / Retry (4):**
| ID | Title | File(s) | Status | Modified? |
|----|-------|---------|--------|-----------|
| H034 | Settlement Timeout Too Short | solana.js | RECHECK | YES |
| H042 | Deprecated confirmTransaction | escrow.js | RECHECK | YES |
| H044 | 2s Retry Insufficient | escrow.js | RECHECK | YES |
| H051 | txSignature Format Validation | main.js | RECHECK | YES |

**Dependency (4):**
| ID | Title | File(s) | Status | Modified? |
|----|-------|---------|--------|-----------|
| H023 | Client NPM Critical Vulns | package.json, package-lock.json | RECHECK | YES |
| H026 | Hardcoded Program ID | escrow.js:39, escrow-v2.js | RECHECK | YES |
| H053 | nodemon in Production | server/package.json | RECHECK | YES |
| H054 | Known CVEs (ws/express/socket.io) | server/package.json | RECHECK | YES |

**Other HIGH (6):**
| ID | Title | File(s) | Status | Modified? |
|----|-------|---------|--------|-----------|
| H025 | Treasury/Ops UncheckedAccount | escrow.js env vars | RECHECK | YES |
| H036 | Match Result Never Written to DB | main.js settlement | RECHECK | YES |
| H041 | Timing-Unsafe HMAC | telegram.js | RECHECK | YES |
| H050 | trust proxy Not Configured | render.yaml | RECHECK | NO |
| H067 | giveTurn Unsanitized Relay | main.js | RECHECK | YES |
| H094 | Coordinated Queue Flooding | matchmaking logic | RECHECK | YES |
| H095 | Memory State Divergence After Restart | in-memory stores | RECHECK | YES |

**Tag: All 34 HIGH — 33 in modified files (RECHECK), 1 in config (RECHECK).**

### MEDIUM Findings (18 total)

All 18 MEDIUM findings are in modified files or dependencies:
H014, H033, H037, H038, H040, H043, H045, H048, H052, H065, H074, H076, H090, H119, S009, and others.

**Tag: 18 MEDIUM — all RECHECK.**

### LOW Findings (6 total)

H019, H022, H035, H039, H049, H078 — all RECHECK.

**Summary by Tag:**
- **RECHECK (file modified, fix unknown):** 70 findings (all CRITICAL, HIGH, MEDIUM, LOW)
- **VERIFY (file unchanged, risk still applies):** 0 findings
- **RESOLVED_BY_REMOVAL (file deleted):** 0 findings
- **VERIFY_UNCHANGED (file unchanged, original assessment holds):** 31 NOT_VULNERABLE findings (5 in unchanged files; 26 in modified files, downgraded to RECHECK)

---

## Section 3: False Positive Log

**NOT_VULNERABLE Findings from Feb Audit (31 total):**

### Retained (File Unchanged, Dismissal Still Valid)

| ID | Title | Dismissal Reason | File(s) — Modified? |
|----|-------|------------------|----------------------|
| H006 | Turn-Timer Forfeit Double-Settlement | `transitionState()` CAS gate is atomic; single-threaded JS event loop. Validation: H006.md line 102–110. | match.js, main.js — YES, downgrade to RECHECK |
| H055 | Terrain Generation Race | Cache check (`room._terrainCache`) synchronously gates generation; no `await` between check and write. | main.js — YES, downgrade to RECHECK |
| H085 | Gold Overflow/Underflow | `spendGold()` checks balance before deduction; no arithmetic overflow possible. Bounded by 250 HP max. | gold.js — YES, downgrade to RECHECK |
| H108 | Terrain Seed Prediction | 128-bit CSPRNG entropy; 2^128 collision space, not predictable. | physics.js — YES, downgrade to RECHECK |
| H114 | Client-Predicted Physics Desync | Server is authoritative on damage; client physics cosmetic only. | physics.js, main.js — YES, downgrade to RECHECK |

### Downgraded to RECHECK (File Modified)

| ID | Title | Reason for Downgrade | Files Modified? |
|----|-------|----------------------|-----------------|
| H008 | SHOT milestone double-claim atomic | Atomic check-then-award — need to verify post-refactor | main.js (settlement) — YES |
| H009 | SHOT supply cap race | Single-threaded JS — verify no new concurrent paths | shot-token.js, main.js — YES |
| H011 | failedSettlements recovery race | Sequential retry with state checks — escrow-v2 persistence may change model | solana.js — YES |
| H056 | Shop phase double-trigger | State machine guard — verify state transitions unchanged | main.js — YES |
| H057 | Gold economy TOCTOU | Fully synchronous `spendGold` — check for new async gold paths | gold.js — YES |
| H058 | Cross-origin WebSocket hijack | Socket.IO requires same-origin by default — escrow-v2 may add endpoints | main.js, escrow-v2.js — YES |
| H062 | Room ID collision 32-bit | CSPRNG space — verify entropy unchanged | main.js (room creation) — YES |
| H063 | Error message info leak | Error handlers — check if error handling refactored | main.js — YES |
| H064 | JWT expiry window 5 min | JWT generation — middleware may have new JWT logic | auth.js — YES |
| H071 | BN import fragility | Anchor imports — check BN usage in escrow-v2 rewrite | escrow.js, escrow-v2.js — YES |

**Total NOT_VULNERABLE findings:** 31
- **All 31 downgraded to RECHECK** due to file modifications

---

## Section 4: Architecture Snapshot

### Trust Zones (from ARCHITECTURE.md)

**Zone 1: UNTRUSTED (Client/Browser)**
- All socket event payloads (angle, power, position, weapon picks, burns)
- Client-supplied wallet addresses, deposit confirmations, burn signatures, burnAmount values
- Browser environment (XSS-susceptible, no CSP enforced)
- window.socket global (accessible to injected scripts)

**Zone 2: PARTIALLY TRUSTED (Server Application)**
- **Auth layer:** JWT generated but never consumed; session = in-memory socket flag; signature replay in 5-min window (no nonce)
- **Business logic:** Match lifecycle unprotected from async races; `withLock()` on settlement only
- **Financial:** Balance check fails OPEN on RPC error; 30s cache TOCTOU; settlement computed in floats not lamports; failure → refund (winner loses)

**Zone 3: TRUSTED (On-Chain + Database)**
- Solana Escrow: Proper PDA seeds, authority checks, BPS math. **Trusts server authority key unconditionally.**
- MongoDB: Schema enforcement on User; fire-and-forget stats persistence (winner/tx never written)

### Critical Invariants (from ARCHITECTURE.md)

| # | Invariant | Expected | Actual (Feb 2026) | Impact |
|---|-----------|----------|-------------------|--------|
| I-1 | Players must have sufficient SOL before wagered match | ENFORCED | NOT ENFORCED (balance check fails open; joinQueue skips) | Zero-SOL wallets enter wagered matches |
| I-2 | Both deposits confirmed before match starts | ENFORCED | NOT ENFORCED (ready event doesn't check) | Match proceeds with partial/no escrow |
| I-3 | Each match settled exactly once | ENFORCED | PARTIALLY (withLock prevents double-settlement, but TOCTOU between disconnect/fire) | Double-settlement theoretically possible |
| I-4 | Winner receives winnings, not refund | ENFORCED | NOT ENFORCED (settlement failure → cancel/refund) | Settlement failure = fund loss for winner |
| I-6 | Prestige burns non-repeatable per wallet | ENFORCED | PARTIALLY (no per-wallet lock; burnAmount=0 bypass; concurrent TOCTOU) | Double-unlock via concurrent events |

### Key Data-Flow Assertions (from ARCHITECTURE.md)

**Wager Entry:**
1. `authenticate()` → signature verified; JWT set (NO nonce → replay in 5-min)
2. `createRoom()` → `verifyBalance()` → **FAILS OPEN on RPC error**
3. `joinRoom()` → joins without deposit check
4. `escrowDeposit()` → client signs and sends
5. `escrowDepositConfirm()` → client-reported event; 1 retry, 2s timeout (insufficient)
6. `ready` → **NO deposit check** → match starts

**Settlement:**
1. `shoot()` → **NO auth check** → server-authoritative physics
2. `isMatchOver()`
3. `transitionState(SETTLING)` → CAS gate (atomic)
4. `calculateSettlement()` → SOL floats (precision loss)
5. `settleMatchEscrow()` → single hot-wallet authority signs
6. IF ERROR → `cancelMatchEscrow()` → **Winner loses winnings**

**Prestige Burn:**
1. `verifyBurnTransaction()` → on-chain read
2. `verifiedBurnTxs.has(sig)?` → **TOCTOU: concurrent events both pass**
3. Extract `burnAmount` → **Client-supplied, 0 passes**
4. `prestigeBurn()` → advance tier
5. `deductShotBalance()` → in-memory only, lost on restart

---

## Section 5: Audit Lineage

| # | Date | Git Ref | Type | Files | Confirmed | Status |
|---|------|---------|------|-------|-----------|--------|
| 1 (Bulwark DB) | 2026-02-24 | `ecfd03b` | Off-Chain | 93 | 70 | Completed |
| 1 (SOS) | 2026-02-23 | `ecfd03b` | On-Chain | 1 | 8 | Completed |
| 2 (BOK) | 2026-05-07 | `5f2acec` | Invariant | Program | 41 inv, 159 tests | Completed |
| 2 (Bulwark DB) | 2026-05-07 | `5f2acec` | Off-Chain | ~150 | TBD | **THIS AUDIT (stacked)** |

---

## Section 6: Cross-Skill Updates Since Feb

### Completed Audits

1. **SOS Audit #2 (May 2026):** On-chain escrow-v2 N-player rewrite. 50 findings identified, 9 fixed in commit `7296e95`.

2. **BOK Audit #2 (May 2026):** Invariant verification. 41 invariants analyzed, 159 tests passing. All HP/damage/settlement math verified sound.

### Remediation Status

**Already Shipped (commit `7296e95` — 9 of 50 SOS findings):**
- Access control hardening in `programs/solshot-escrow-v2/src/lib.rs`
- State machine transition guards
- Account validation improvements

**Pending (Bulwark #1 — 70 findings, mostly in modified files):**
- See Section 2 RECHECK items (all 70 in modified files)

### Dependency Posture (npm audit)

**Server:**
- Feb: 30 vulnerabilities (4 low, 8 mod, 18 high)
- May: 20 vulnerabilities (0 low, 7 mod, 13 high) — **−33% reduction**

**Client:**
- Feb: 131 vulnerabilities (20 low, 35 mod, 73 high, 3 critical)
- May: 47 vulnerabilities (13 low, 8 mod, 25 high, 1 critical) — **−64% reduction**

---

## Summary for Investigation Phase

**Verification Strategy:**

1. **All 70 Prior Findings:** RECHECK — all in modified files. Verify whether fixes were landed or why they persist.

2. **31 NOT_VULNERABLE Findings:** Downgraded to RECHECK — target file modifications may invalidate dismissals.

3. **npm Audit Gaps:** 20 server, 47 client vulnerabilities remain. Prioritize high-severity CVEs in socket.io/express/ws.

4. **New Code Coverage:** 127 new files (escrow-v2, Privy, groupchat). These are novel attack surfaces.

5. **Unchanged Minority:** ~50 files (~33%) remain unchanged. Verification agents will run on these.

---

**Handover Complete. Ready for Bulwark Audit #2 Investigation Phase.**

**Timestamp:** 2026-05-07  
**Generated by:** Handover Builder (Agent)
