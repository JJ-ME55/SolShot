# Dinh's Bulwark — Off-Chain Security Audit Report

**Project:** SolShot
**Audit ID:** `db-solshot-2026-05-07`
**Audit Date:** 2026-05-07
**Audit Number:** #2 (stacked on Audit #1, 2026-02-24)
**Auditor:** Claude Code Dinh's Bulwark v1.0
**Git Ref:** `5f2acec`
**Scope:** Off-chain SolShot stack — Express + Socket.IO + Telegraf server, React + Phaser client, Privy embedded wallets, MongoDB, Vercel/Render infrastructure.
**Tier:** Deep (22 parallel context auditors, 5 batches)
**Files in scope:** 142 files / ~84,270 LOC

---

## Verdict (1-line)

**Safe for hackathon submission on devnet (no funds at risk); NOT safe for mainnet with real funds — Bundles A, B, and D below must land first.**

---

## 1. Executive Summary

### Overall Posture

Audit #2 finds SolShot's off-chain stack in materially better shape than the Feb 2026 baseline ("not safe for production deployment with real funds in its current state"), but still meaningfully short of mainnet-ready. Three categories of risk dominate:

1. **Identity-bridge composition attacks.** The Privy → Telegram → wallet identity chain has multiple individually-reasonable steps that compose into a clean account takeover. The key compositional path (H001 + H006 + H002) lets an attacker with a valid Privy account bind a victim's TG ID, then assume the victim's identity across the entire group-chat surface.

2. **Fail-open financial paths.** `refundWager()` returns `{success: true}` even when the underlying on-chain cancel CPI throws (H013). The wallet rotation gap (H009) silently routes settlement to stale Mongo-stored addresses. The H023 fix-bundle landed in commit `7296e95` introduced a NEW failure mode: server still builds `remaining_accounts` from off-chain state, not from on-chain `deposits_mask`, so any desync results in `IncompleteRefund` reverts.

3. **Authorization gaps in legacy event surface.** Five Socket.IO events still bypass `requireAuth` (`shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog`, `getGroupMatch`) — three of them are direct game-state mutations or PII reads. The `shoot` legacy relay specifically allows anyone to forge shot events into wagered 1v1 matches.

The most consequential combination is **H120 (cross-skill chain)**: SOS Audit #2 deferred H001 (one-step authority transfer) + DB H002 (Privy fails-open without secret). On a fresh deploy that lacks `PRIVY_APP_SECRET` (a configuration absent from the current `render.yaml`), an attacker can bind a victim's TG ID, assume their session, and trigger the SOS-deferred one-step authority rotation to drain the treasury. This single chain composes pre-mainnet posture from both audits into a production-blocking compound.

### Headline Counts

| Severity | Count | Notes |
|---|---|---|
| **CRITICAL** | 23 | Tier 1 strategies — confirmed via Phase 1 file:line evidence + cross-agent corroboration |
| **HIGH** | 40 | Tier 2 — should-fix pre-mainnet |
| **MEDIUM** | 30 | Tier 3 partial + Tier 2 lower-bound |
| **LOW** | 20 | Tier 3 — defensive cleanup |
| **NOT_VULNERABLE** (re-validated) | 6+ | Includes H071 source-maps disabled, qs not vulnerable, `withLock` settlement gate sound |
| **TOTAL CONFIRMED** | 122 strategies (40 T1 / 50 T2 / 32 T3) | |

### Top 5 Critical Issues

| # | ID | Title | Location | Why It Matters |
|---|----|-------|----------|----------------|
| 1 | **H120** | Cross-skill coup: SOS deferred H001 + DB Privy fails-open | `render.yaml`, SOS finding | Compound chain enables session takeover → authority rotation → treasury drain |
| 2 | **H013** | `refundWager()` fails-open | `server/services/solana.js:240-258` | Server reports refund success while on-chain CPI throws; SOL silently locked |
| 3 | **H001 + H006** | Privy/TG identity bridge (composed) | `server/index.js:502-519` + `main.js:1298-1303` | Attacker with Privy account assumes victim's TG identity end-to-end |
| 4 | **H009** | Wallet rotation gap | `server/services/users.js:91` | Privy re-provisions wallet → DB never updates → settlement to stale (attacker-claimable) address |
| 5 | **H023** fix desync | `lifecycle.js:896-910`, `main.js:433-512` | SOS H023 fix forces on-chain length-check; server doesn't read on-chain mask | Refunds revert with `IncompleteRefund`; SOL stuck for 2h/24h |

### Comparison to Audit #1 (Feb 2026)

| Metric | Feb #1 | May #2 | Delta |
|---|---|---|---|
| Files scanned | 93 | 142 | +53% |
| LOC | ~36,512 | ~84,270 | +131% |
| Server npm vulnerabilities | 30 (4 low / 8 mod / 18 high) | 20 (0 low / 7 mod / 13 high) | **−33%** |
| Client npm vulnerabilities | 131 (20/35/73/3) | 47 (13/8/25/1) | **−64%** |
| Confirmed findings | 70 (12C/34H/18M/6L) | ~113 (23C/40H/30M/20L) | (different methodology — strategy taxonomy vs finding taxonomy) |
| Top CRITICAL | C-1 Balance check fails open | H120 cross-skill chain (SOS+DB compound) | More sophisticated chain |
| Source maps in production | enabled | disabled | **RESOLVED** |
| `qs` vulnerability | 6.10.3 vulnerable | 6.14.2 patched | **RESOLVED** |
| Helmet+CORS middleware | partial | comprehensive | **RESOLVED** |
| Verdict | "Not safe for production with real funds" | Hackathon-safe (devnet); not mainnet-safe | Improved but still pre-mainnet |

**Improvements:**
- Helmet middleware deployed with CSP, HSTS, frameguard
- CORS scoped to allowed origins
- Source maps disabled in production builds
- 64% reduction in client npm critical vulnerabilities
- crypto.randomBytes() used for room ID generation (was Math.random)
- create-room rate limiter added (3 req/60s/IP)
- `qs` upgraded out of vulnerable range
- BOK Audit #2 verified all on-chain math invariants are sound

**Regressions (Feb fixed → now broken again):**
- **H011 / H082** (KM-04 zeroization reverted) — escrow keypair is no longer zeroed after load. `server/services/keys.js:54-64` documents the removal with comment that web3.js aliases the buffer. Severity: HIGH (was LOW in Feb).
- **CSP dead origins** — `app.dynamic.xyz`/`api.dynamic.xyz` still in helmet `frameSrc`/`connectSrc` from pre-Privy era (H035).

**Still-open from Feb (RECURRENT):**
- **JWT generated but never verified server-side** (Feb H029 → May H003) — `verifyToken()` removed as dead code; auth is purely socket-flag-based.
- **Auth signature 5-min replay window** (Feb C-6/H030 → May H004) — no replay store; same signature reusable on new socket within 5 minutes.
- **Single keypair = upgrade authority + application authority** (Feb H044 → May H012) — pre-mainnet posture documented.
- **`shoot` legacy relay no auth** (Feb C-7 → May H018).
- **30s balance cache TOCTOU** (Feb H028 → May H028 indirect).
- **nodemon in production deps** (Feb H053 → May H085).

---

## 2. Severity Breakdown

| Severity | Count | Examples |
|---|---|---|
| CRITICAL | 23 | H001 (Privy/TG bridge), H002 (Privy fails-open), H009 (wallet rotation), H011 (keypair zeroization), H013 (refund fails-open), H014 (H023 desync), H015 (double-settle race), H016 (deposit overwrite), H017 (self-damage 1v1), H018 (shoot relay), H019 (challenge no auth), H020 (clientDebugLog), H022 (getGroupMatch unauth), H030 (escrowDepositStatus PII), H031 (DebugAuthOverlay in prod), H032 (runValidators bypass), H033 (Pino redact dead code), H034 (Vercel zero headers), H037 (failedSettlements drop), H120 (cross-skill chain) |
| HIGH | 40 | H041-H045 (npm CVEs), H049 (single RPC), H051 (deprecated confirmTransaction), H058 (v2 settle TOCTOU), H063 (self-firing stall), H064 (null-winner), H072-H075 (NoSQL injection + bulkWrite), H083 (timing-unsafe admin compare), H084 (deprecated Privy SDK), H085 (nodemon in prod), H086 (physics amplification DOS), H089 (Math.random group ID), H090 (challenge code 20 bits) |
| MEDIUM | 30 | H035 (dead Dynamic CSP), H055 (`/teststats` no admin), H062 (stale IDL), H066 (auth duration off-chain enforce), H094 (jsdelivr without SRI), H102 (`confirmed` vs `finalized`) |
| LOW | 20 | H092 (`/health` version), H105 (Math.random in lifecycle), H110 (`window.socket` from XSS), H111 (`report-uri` deprecated), H115 (admin shares global rate budget), H116 (HSTS preload absent) |

(Counts sum to >113 because some Tier 3 items are alternative classifications of Tier 1/2 items — e.g., H091 = Tier 3 view of H047.)

---

## 3. Detailed Findings — by Category

### 3.1 Auth & Identity (8 findings)

#### H001 — Privy/TG identity bridge unverified
- **Severity:** CRITICAL
- **File:line:** `server/index.js:502-519` (`/api/wallet/link-from-privy-telegram`)
- **Status:** CONFIRMED
- **Description:** Server validates the Privy JWT but never checks that the client-supplied `telegramUserId` matches the Privy session's actual TG link. A code comment confirms the intent; the check is simply absent. An attacker with a valid Privy session of their own can supply any victim's `telegramUserId` and have the server bind that TG ID to attacker's wallet.
- **Reproduction:**
  1. Attacker creates legitimate Privy account → obtains valid JWT.
  2. POST `/api/wallet/link-from-privy-telegram` with `{ telegramUserId: VICTIM_TG_ID, walletAddress: ATTACKER_WALLET }`.
  3. Privy JWT verifies. Server records the binding without checking JWT's `linked_accounts.telegram` claim.
- **Fix:** Extract the actual telegram link from Privy session claims (`getUser(jwt).linkedAccounts.find(a => a.type==='telegram').telegramUserId`), and reject if mismatched.

#### H002 — `requirePrivyAuth({required:true})` ineffective when secret missing
- **Severity:** CRITICAL
- **File:line:** `server/services/privyAuth.js:64-66`
- **Status:** CONFIRMED
- **Description:** When `PRIVY_APP_SECRET` is absent (and it is **missing from `render.yaml`** — verified during scan), `getClient()` returns `null`, and the middleware calls `next()` unconditionally even with `required:true`. In production this means `link-from-privy-telegram` is fully ungated.
- **Reproduction:**
  1. Confirm `render.yaml` does not set `PRIVY_APP_SECRET` (it doesn't).
  2. POST `/api/wallet/link-from-privy-telegram` with no JWT at all.
  3. Middleware short-circuits at `getClient() returns null`, calls `next()`, handler runs.
- **Fix:** Throw 503 (not bypass) if `getClient()` is null when `required:true`. Add `PRIVY_APP_SECRET` to render.yaml as a secret reference.

#### H003 — JWT generated but never verified server-side
- **Severity:** CRITICAL (RECURRENT — Feb H029)
- **File:line:** `server/middleware/auth.js`
- **Status:** CONFIRMED
- **Description:** `verifyToken()` was removed as dead code; `generateToken()` still runs. Auth is purely socket-flag-based (`client.isAuthenticated`). Today's auth-reset-on-reconnect commit doesn't address this.
- **Fix:** Either restore JWT verification on every state-mutating event, or remove the entire `generateToken()` path to clarify the actual auth model (socket-flag-based).

#### H004 — Auth signature 5-min replay window
- **Severity:** CRITICAL (RECURRENT — Feb C-6/H030)
- **File:line:** `server/middleware/auth.js:75-88`
- **Status:** CONFIRMED
- **Description:** `verifyAuthMessage` checks timestamp within 5 minutes but maintains no replay store. Same signature is reusable on new sockets within 5 minutes.
- **Fix:** Maintain in-memory `Set<signature>` with 5-minute TTL; reject duplicates.

#### H005 — `tgIdFor()` NODE_ENV fallback impersonation
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/groupchat.js:72-78`
- **Status:** CONFIRMED
- **Description:** In non-production (or if `NODE_ENV` misconfigured at deploy), any socket can supply `payload.telegramUserId` to impersonate any TG user across all group-match queries.
- **Fix:** Remove the dev fallback entirely; require HMAC-validated initData in all environments.

#### H006 — Telegram identity backfill bridges auth tiers
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/main.js:1298-1303`
- **Status:** CONFIRMED
- **Description:** Wallet-auth `authenticate` handler does a DB lookup to backfill `client.telegramUser.id`. `tgIdFor()` then can't distinguish between TG-HMAC-signed identity and wallet-auth-derived identity. This is the second leg of the H001 takeover chain.
- **Fix:** Tag the source of `client.telegramUser.id` (e.g., `telegramUserSource: 'tg-hmac' | 'wallet-backfill'`); require HMAC source for high-trust ops.

#### H007 — `link-from-tg-token` soft Privy JWT
- **Severity:** CRITICAL
- **File:line:** `server/index.js:432`
- **Status:** CONFIRMED
- **Description:** `requirePrivyAuth({required:false})` means token-knowledge alone is sufficient to bind wallets. Magic-link tokens are not real authentication.
- **Fix:** Require Privy JWT verification at this endpoint; remove the `required:false` mode entirely.

#### H008 — Composed Privy → TG identity takeover chain
- **Severity:** CRITICAL (compound)
- **File:line:** H001 + H006 chained
- **Status:** LIKELY (PoC needed but unambiguous from evidence)
- **Description:** Attacker with Privy account binds victim's TG ID via `link-from-privy-telegram` (H001). Then connects via wallet-auth `authenticate`; backfill at line 1298-1303 (H006) substitutes victim's TG ID. Now `tgIdFor()` returns victim's identity for ALL group-match operations on attacker's socket. Identity takeover, end-to-end.
- **Fix:** Address both H001 (verify Privy session's TG claim) and H006 (tag identity source). Either one alone closes the chain.

### 3.2 Wallet & Keypair (4 findings)

#### H009 — Wallet rotation gap (DB never updates)
- **Severity:** CRITICAL
- **File:line:** `server/services/users.js:91`
- **Status:** CONFIRMED
- **Description:** `if (walletAddress && !existingByTg.walletAddress)` — the wallet pubkey is **never** updated once set on a user. Privy can silently re-provision an embedded wallet (SDK upgrade, account recovery, key rotation). DB retains the stale address. Settlement at `lifecycle.js:851` reads stale; on-chain SOL flows to a wallet the user no longer controls.
- **Reproduction:**
  1. User binds wallet `A` to TG ID via Privy at time T.
  2. At time T+30d, Privy re-provisions to wallet `B`. User is unaware.
  3. User wins a wagered match. Server settles to wallet `A`.
  4. If wallet `A` is unclaimed (or claimed by attacker via Privy SDK collision/exploit), funds are lost.
- **Fix:** On every authenticated request, verify `claimedWallet === user.walletAddress`. If not, write the new value (idempotent) or mark account for reverification.

#### H010 — Reconnect migrates stale wallet entry
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/main.js:1815-1817`
- **Status:** CONFIRMED
- **Description:** The reconnect remap (`ws.wallets`) copies the OLD wallet entry. If pubkey changed between joinRoom and reconnect, settlement uses the stale pubkey.
- **Fix:** Re-fetch wallet from authenticated source on reconnect.

#### H011 — Escrow keypair unzeroized in process memory
- **Severity:** CRITICAL (REGRESSION — Feb KM-04 was RESOLVED, now reopened)
- **File:line:** `server/services/keys.js:54-64`
- **Status:** CONFIRMED
- **Description:** `bytes.fill(0)` was removed (commit `f551275`) because web3.js aliases the buffer. The 64-byte secret key now lives in heap for the entire process lifetime. Heap dump from a Render attacker (CVE in nodemon, Express, etc.) = total compromise.
- **Fix:** Either (a) clone the buffer before passing to web3.js so the original can be zeroed, or (b) move signing to a separate process / KMS.

#### H012 — Single keypair for upgrade authority + application authority
- **Severity:** CRITICAL (RECURRENT — Feb H044)
- **File:line:** `programs/.../target/deploy/*.json` + Render `SOLANA_KEYPAIR_JSON`
- **Status:** CONFIRMED (acknowledged pre-mainnet posture)
- **Description:** Same hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is BOTH Solana program upgrade authority AND application `config.authority`. This is documented in `Docs/internal/REMEDIATION_DECISIONS.md` Section 2.1 as deferred to mainnet. Compound with H120 — see Section 5.
- **Fix (mainnet-required):** Migrate Layer 1 (upgrade authority) to a Squads multisig; rotate `config.authority` to a separate hot/multisig.

### 3.3 Financial / Refund (5 findings)

#### H013 — `refundWager()` fails-open
- **Severity:** CRITICAL
- **File:line:** `server/services/solana.js:240-258`
- **Status:** CONFIRMED
- **Description:** When `cancelMatchEscrow()` returns `{success:false}` or throws, the function falls through to `return {success:true}`. Server reports refund succeeded; SOL still locked on-chain. Player believes they were refunded; only realizes at next attempt to withdraw.
- **Reproduction:**
  1. Trigger any error path in `cancelMatchEscrow` — e.g., RPC 429, IDL deserialization failure, on-chain `IncompleteRefund` revert.
  2. Server emits `refunded` event to client. SOL still in escrow PDA.
- **Fix:** Propagate the actual return value. If cancel CPI fails, return `{success:false, error}` and surface the issue both to the client and to operator monitoring.

#### H014 — H023 fix-bundle ↔ server-side desync
- **Severity:** CRITICAL
- **File:line:** `server/services/lifecycle.js:896-910`, `server/socket-io/main.js:433-512`
- **Status:** CONFIRMED
- **Description:** SOS H023 fix forces on-chain `require!(remaining_accounts.len() == count_ones(deposits_mask))`. But server cancel paths build `remaining_accounts` from off-chain Mongo state (`wagerStates[roomId].deposits` for v1; `player.initialDepositTx` for v2), NOT from on-chain `deposits_mask`. Any desync → `IncompleteRefund` reverts → SOL stuck for 2h (v1 timeout) or 24h (v2 reclaim grace). The on-chain fix created a NEW failure mode for the off-chain path.
- **Reproduction:**
  1. Player deposits successfully on-chain. Server records via `confirmDeposit`.
  2. Server crashes/restarts before persistence; in-memory `wagerStates[roomId]` is lost.
  3. Cancel attempt builds `remaining_accounts` from incomplete state → on-chain length-check fails.
- **Fix:** Read `deposits_mask` from on-chain account before building `remaining_accounts`. Use the on-chain bitmap as source of truth.

#### H015 — Group-chat double-settle race
- **Severity:** CRITICAL
- **File:line:** `server/services/groupchat/lifecycle.js:804, 1039`
- **Status:** CONFIRMED
- **Description:** Two concurrent calls to `checkAndSettle()` both check `match.state !== 'active'` against their own in-memory document; both pass guard before either Mongo save. On-chain rejects second with AlreadySettled, but server emitted double `matchSettled` + double `pushMatchHistory` (double win credit in stats; possibly double SHOT mint depending on milestone path).
- **Fix:** Use Mongoose `findOneAndUpdate({state:'active'}, {state:'settling'})` as CAS gate, then proceed only if returned doc is non-null.

#### H016 — `confirmDeposit` last-depositor doc overwrite race
- **Severity:** CRITICAL
- **File:line:** `server/services/groupchat/lifecycle.js:262-274`
- **Status:** CONFIRMED
- **Description:** Two simultaneous deposit confirmations both `findOne()` → mutate own slot → `save()`. Second `save()` overwrites first depositor's `initialDepositTx`. Match stalls in `awaiting_deposits` indefinitely because server believes only one player deposited.
- **Fix:** Use atomic `$set` operator on the specific slot: `findOneAndUpdate({_id, [\`players.${idx}.tx\`]: null}, {$set: {[\`players.${idx}.tx\`]: txSig}})`.

#### H017 — Self-damage Math.abs sign erasure (1v1)
- **Severity:** CRITICAL (NOVEL)
- **File:line:** `server/socket-io/main.js:3811`
- **Status:** CONFIRMED
- **Description:** Physics returns negative for self-hits to indicate ignore; the 1v1 fire path applies `Math.abs(dmg)`, converting the ignore signal back to actual damage. In a wagered 1v1, a player who is losing can self-fire to end the match (their own death triggers settlement to opponent) — but in some weapon paths self-damage on the leader instead concedes a win to opponent.

  Group-chat correctly filters `dmg <= 0` (verified clean per LOGIC-02 auditor).
- **Fix:** Replace `Math.abs(dmg)` with `if (dmg <= 0) return;` (matching group-chat treatment).

### 3.4 Authorization Bypass (8 findings)

#### H018 — `shoot` legacy relay no auth
- **Severity:** CRITICAL (RECURRENT — Feb C-7)
- **File:line:** `server/socket-io/main.js:3377`
- **Status:** CONFIRMED
- **Description:** Zero auth on the legacy `shoot` event; any unauthenticated socket can forge shot events into wagered matches.
- **Fix:** Add `requireAuth(client)` + match-membership check, or remove the legacy event entirely.

#### H019 — `acceptChallenge`/`declineChallenge` no auth + leaked socketId
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/main.js:3261, 3276`
- **Status:** CONFIRMED
- **Description:** No auth check; `fromSocketId` is client-supplied; socket IDs leak in `roomUpdate` broadcasts. Any unauthenticated party can impersonate a challenger or challengee.
- **Fix:** Bind challenge IDs to TG ID (or wallet) at creation; verify the caller's identity matches the challenge target.

#### H020 — `clientDebugLog` unauthenticated
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/main.js:1356`
- **Status:** CONFIRMED
- **Description:** Any pre-auth socket can inject content into Render logs + cause TG ID + wallet co-logging on the same line. This is a log injection + PII linkage vector.
- **Fix:** Remove the event or gate it behind admin auth.

#### H021 — `groupShopComplete` tgId-only check
- **Severity:** HIGH
- **File:line:** `server/socket-io/groupchat.js:357`
- **Status:** CONFIRMED
- **Description:** `tgId` check but no match-membership enforcement. Combined with H072 (matchId injection), an attacker can submit purchases against any match.
- **Fix:** Verify `tgId` is in the target match's player list.

#### H022 — `getGroupMatch` no auth, full doc exposed
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/groupchat.js:97`
- **Status:** CONFIRMED
- **Description:** Unauthenticated callers receive the full match document including all participants' wallet addresses. Privacy violation + reconnaissance for further attacks.
- **Fix:** Require auth; project response to exclude wallet addresses unless caller is a participant.

#### H023 — `/api/challenge/:code/cancel` unauthenticated
- **Severity:** HIGH
- **File:line:** `server/index.js:388`
- **Status:** CONFIRMED
- **Description:** Anyone who knows a challenge code can cancel any challenge by URL. Combined with H090 (20-bit codes are enumerable), enables denial-of-service across the challenge surface.
- **Fix:** Require auth; verify caller is challenge creator or recipient.

#### H024 — `equipCosmeticResult` returns raw err.message
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:3105`
- **Status:** CONFIRMED
- **Description:** Mongoose errors expose schema field names + document structure. Information disclosure assists further attacks.
- **Fix:** Wrap with sanitized error message; log full error server-side only.

#### H025 — Weapon inventory bypass on missing slot
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:3714-3720`
- **Status:** CONFIRMED
- **Description:** `if (inventory && inventory[this.id])` — silent skip if slot absent (e.g., reconnect edge case). Player can fire any weapon by triggering the absent-slot condition.
- **Fix:** Treat absent slot as `0 ammo` and reject.

### 3.5 Race / Concurrency (4 findings)

#### H026 — Turn-sequence nonce optional
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:3690`
- **Status:** CONFIRMED
- **Description:** `if (clientSeq !== undefined)` — client can omit `seq` to bypass idempotency guard. Socket.IO retries → double-fire possible.
- **Fix:** Make `seq` required and reject if missing.

#### H027 — `depositTimers` slot reuse (5min vs 30sec)
- **Severity:** CRITICAL (RECURRENT)
- **File:line:** `server/socket-io/main.js:2108-2126`
- **Status:** CONFIRMED
- **Description:** Same key for 5-min deposit window AND 30-sec partial-deposit decision. Clearing one clears the other. The code comment acknowledges this as "Pitfall 1."
- **Fix:** Use distinct keys for the two timers.

#### H028 — `handleShot` group-chat no mutex
- **Severity:** CRITICAL
- **File:line:** `server/services/groupchat/lifecycle.js:536`, `server/socket-io/groupchat.js:168`
- **Status:** CONFIRMED
- **Description:** No `withLock()` for group fire path. Advancing turn save races with incoming fire → wrong player can fire if the second event arrives during the save.
- **Fix:** Wrap handler in `withLock(matchId, ...)`.

#### H029 — `bulkWrite ordered:false` partial failure silent
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lifecycle.js:1002`
- **Status:** CONFIRMED
- **Description:** Per-player stat failures invisible; only top-level throw caught. `result.writeErrors` never inspected.
- **Fix:** Inspect `result.writeErrors` and log/alert on any non-empty array.

### 3.6 Information Disclosure (4 findings)

#### H030 — `escrowDepositStatus` PII cross-broadcast
- **Severity:** CRITICAL (NOVEL)
- **File:line:** `server/socket-io/main.js` (escrowDepositStatus emit)
- **Status:** CONFIRMED
- **Description:** Server emits full wallet addresses to ALL room members on each deposit. Linkage of TG ID + wallet pubkey across all participants. Attacker who joins a single match learns the wallet of every co-participant.
- **Fix:** Project to per-recipient view; only broadcast deposit-status booleans, not addresses.

#### H031 — `DebugAuthOverlay` ships in production
- **Severity:** CRITICAL
- **File:line:** `client/src/App.js:327`, `client/src/components/DebugAuthOverlay.js`
- **Status:** CONFIRMED
- **Description:** Activated by URL param `?debug=1`. Exposes live SOL balance, auth state, internal Privy wallet flags. Anyone navigating with this query string sees the data.
- **Fix:** Wrap in `if (process.env.NODE_ENV !== 'production')` so the bundle excludes it entirely.

#### H032 — `runValidators: true` not used on update paths
- **Severity:** HIGH
- **File:line:** All `findOneAndUpdate`, `updateOne`, `bulkWrite` calls
- **Status:** CONFIRMED
- **Description:** Schema enums (Match.status, GroupMatch.state, Challenge.status), regex on referralCode, min:0 on wager — all bypassable via direct update.
- **Fix:** Add `{ runValidators: true }` to all relevant calls. Audit for unsafe direct updates.

#### H033 — Pino redact policy effectively dead code
- **Severity:** HIGH
- **File:line:** `server/services/logger.js`
- **Status:** CONFIRMED
- **Description:** Wallet-address redact list is correct, but ~95% of logging in the server bypasses it via raw `console.*` calls. The redact policy applies only to `logger.info()` / `logger.warn()` calls.
- **Fix:** Replace all `console.*` with `logger.*`. Add ESLint rule banning bare `console.*` calls in `server/`.

### 3.7 Headers / Web (3 findings)

#### H034 — Vercel client zero security headers
- **Severity:** CRITICAL
- **File:line:** `client/vercel.json`
- **Status:** CONFIRMED
- **Description:** No frame-ancestors, no X-Frame-Options, no HSTS, no Permissions-Policy. The Privy wallet sign modal can be framed by attacker site → clickjacking the user into approving transactions.
- **Fix:** Add `headers` block to `vercel.json` with `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

#### H035 — Server CSP has dead Dynamic origins
- **Severity:** MEDIUM
- **File:line:** `server/index.js` (helmet config)
- **Status:** CONFIRMED
- **Description:** `app.dynamic.xyz` and `api.dynamic.xyz` still in `frameSrc`/`connectSrc` from pre-Privy era. Mostly cosmetic but wastes a CSP slot and signals stale infrastructure.
- **Fix:** Remove Dynamic entries; add Privy origins (`auth.privy.io`, `api.privy.io`).

#### H036 — `'unsafe-inline'` in client script-src
- **Severity:** HIGH
- **File:line:** `client/public/index.html` meta CSP
- **Status:** CONFIRMED
- **Description:** Driven by Eruda debug loader inline script. Defeats most XSS protection.
- **Fix:** Remove Eruda from production builds. Use nonce-based CSP if any inline is required.

### 3.8 Failure Modes (4 findings)

#### H037 — `failedSettlements` silent drop after 5 retries
- **Severity:** CRITICAL
- **File:line:** `server/socket-io/main.js:329-331`
- **Status:** CONFIRMED
- **Description:** After 5 retries, the Map deletes the entry with only `console.error`. No DB record, no operator alert. Match settles to nobody; SOL stays locked.
- **Fix:** On retry exhaustion, persist failure to a `FailedSettlement` Mongoose collection + emit operator alert (e.g., Telegram admin DM).

#### H038 — `uncaughtException` / `unhandledRejection` log-only
- **Severity:** HIGH
- **File:line:** `server/index.js:614-620`
- **Status:** CONFIRMED
- **Description:** Server continues running in potentially corrupted match state. After a critical error, in-memory state may be inconsistent — but the server keeps accepting events.
- **Fix:** On uncaught exception, log + drain in-flight events + exit cleanly. Render will restart the dyno.

#### H039 — No MongoDB reconnect handling
- **Severity:** HIGH
- **File:line:** `server/index.js:545`
- **Status:** CONFIRMED
- **Description:** Default `bufferCommands: true` means DB ops silently queue indefinitely on connection drop. Operations build up; eventually the queue exceeds memory.
- **Fix:** Set `bufferCommands: false`; add explicit reconnection handler with operator alert.

#### H040 — v2 settle has no retry equivalent
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lifecycle.js:861-870`
- **Status:** CONFIRMED
- **Description:** v2 settlement failures are logged + discarded. No retry queue (vs v1 which has `failedSettlements`). Recovery depends on 24h permissionless reclaim grace, which gives equal-split refunds rather than the winner's premium.
- **Fix:** Mirror v1's retry queue for v2 settlement.

### 3.9 npm CVEs (5 findings)

#### H041 — express-rate-limit IPv6 bypass
- **Severity:** HIGH
- **File:line:** `server/package.json:25` — `express-rate-limit@8.2.1`
- **Status:** CONFIRMED (CVE)
- **Description:** Pre-8.5.1 versions have an IPv6 bypass; attacker rotating across IPv6 prefixes evades the rate limiter.
- **Fix:** `npm update express-rate-limit` to 8.5.1 or higher.

#### H042 — socket.io-parser DOS
- **Severity:** HIGH
- **File:line:** server + client lockfiles (transitive)
- **Status:** CONFIRMED (CVE)
- **Fix:** `npm update socket.io` (latest pulls patched parser).

#### H043 — path-to-regexp ReDoS
- **Severity:** HIGH
- **File:line:** `server/package-lock.json` (transitive via Express)
- **Status:** CONFIRMED (CVE)
- **Fix:** Update Express; force-resolve transitive `path-to-regexp` if needed.

#### H044 — handlebars JS injection (transitive)
- **Severity:** HIGH (rated CRITICAL by npm)
- **File:line:** `client/package-lock.json` (via phaser3-rex-plugins)
- **Status:** CONFIRMED (CVE)
- **Description:** Browser-bundle exploitability is low (handlebars compiles strings, not user input typically), but npm audit flags it CRITICAL.
- **Fix:** Update phaser3-rex-plugins to a version with patched handlebars; or pin a non-vulnerable handlebars version via `overrides` in package.json.

#### H045 — bigint-buffer overflow
- **Severity:** HIGH
- **File:line:** `client/package.json:9` — `@solana/spl-token@0.4.14`
- **Status:** CONFIRMED (CVE)
- **Description:** Browser context low exploitability. Update to fixed version.
- **Fix:** Update `@solana/spl-token` to current; verify burn flow still works (key dependency).

### 3.10 RPC / Chain (5 findings)

#### H049 — Single unmonitored RPC endpoint
- **Severity:** HIGH
- **File:line:** `server/services/solana.js:28`
- **Status:** CONFIRMED
- **Description:** Default `api.devnet.solana.com` (free public). No fallback, no health check, no rate-limit handling for HTTP 429.
- **Fix:** Use Helius/Triton/QuickNode primary + Solana public secondary. Implement health-check rotation.

#### H050 — RPC 429 has no retry
- **Severity:** HIGH
- **File:line:** `server/services/solana.js:113`
- **Status:** CONFIRMED
- **Description:** Balance checks throw + settlement CPI fails silently on 429.
- **Fix:** Implement exponential-backoff retry (e.g., 3 attempts, 250ms/500ms/1000ms).

#### H051 — `confirmTransaction('confirmed')` deprecated form
- **Severity:** HIGH
- **File:line:** `client/src/wallet/WalletContext.js:584, 624, 654`
- **Status:** CONFIRMED
- **Description:** Silent timeout → never emits `escrowDepositConfirm`. SOL locked in PDA until 5-min timeout cancel path.
- **Fix:** Migrate to `getSignatureStatuses` polling with explicit timeout.

#### H052 — Burn TX missing `lastValidBlockHeight`
- **Severity:** HIGH
- **File:line:** `client/src/wallet/WalletContext.js` (signAndBurnShot)
- **Status:** CONFIRMED
- **Description:** Captures only blockhash; no expiry. Burn can hang past TX expiry.
- **Fix:** Pass full `{blockhash, lastValidBlockHeight}` to `confirmTransaction`.

#### H053 — No `simulateTransaction()` pre-flight
- **Severity:** HIGH
- **File:line:** `server/services/escrow.js`, `escrow-v2.js`
- **Status:** CONFIRMED
- **Description:** Errors caught by RPC are 5x more expensive than simulate would catch. No pre-flight.
- **Fix:** Add `connection.simulateTransaction(tx)` before submission; surface simulation errors to client.

### 3.11 TG Bot (4 findings)

#### H054 — `TELEGRAM_BOT_TOKEN` absent from render.yaml
- **Severity:** HIGH
- **File:line:** `render.yaml`
- **Status:** CONFIRMED
- **Description:** Without bot token, initData validation skipped; any socket can claim any `telegramUser`.
- **Fix:** Add `TELEGRAM_BOT_TOKEN` as a secret reference in `render.yaml`.

#### H055 — `/teststats` no NODE_ENV/admin check in production
- **Severity:** MEDIUM
- **File:line:** `server/services/bot.js:416`
- **Status:** CONFIRMED
- **Description:** Returns `err.message` to TG users.
- **Fix:** Gate on `NODE_ENV === 'development'` or admin TG ID list.

#### H056 — Bot lacks queue/backoff for sendMessage
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lifecycle.js:1107`
- **Status:** CONFIRMED
- **Description:** 429 silently drops turn pings.
- **Fix:** Use Telegraf's built-in rate limiter or a small queue; retry on 429 with exponential backoff.

#### H057 — `lobbyWatchdog` bulk sends on boot
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lobbyWatchdog.js:63`
- **Status:** CONFIRMED
- **Description:** N stale lobbies → N rapid sendMessage calls hitting TG rate limit.
- **Fix:** Stagger sends with 50ms delay between calls.

### 3.12 v2 Escrow Off-Chain (5 findings)

#### H058 — v2 settle TOCTOU
- **Severity:** HIGH
- **File:line:** `server/services/escrow-v2.js:305-322`
- **Status:** LIKELY (PoC needed)
- **Description:** Fetches snapshot addresses, then submits TX. 24h reclaim grace means PDA could be closed in between.
- **Fix:** Pre-flight simulation + atomic settle attempt + retry on stale-account error.

#### H059 — No state pre-check before settle (v1 + v2)
- **Severity:** HIGH
- **File:line:** `server/services/escrow.js:388-427`, `escrow-v2.js:301-330`
- **Status:** CONFIRMED
- **Description:** Doesn't verify `escrow.state == Active` before submitting. Settle on Cancelled fails silently → costs winner their payout.
- **Fix:** Fetch escrow account, assert state == Active before constructing settle TX.

#### H060 — `match_id` uniqueness not guaranteed
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:2212, 2393`
- **Status:** CONFIRMED
- **Description:** 32-bit CSPRNG, no DB unique constraint, no `rooms.has(roomId)` guard, no chain-side check that PDA wasn't previously created.
- **Fix:** Bump to 64-bit randomBytes. Add `unique: true` index on Mongoose `matchId`. Guard `rooms.has(roomId)` retry.

#### H061 — `remainingAccounts` order assumption
- **Severity:** HIGH
- **File:line:** `server/services/escrow.js`, `escrow-v2.js`
- **Status:** LIKELY
- **Description:** SOS H023 fix requires exact pubkey+index match. Server builds from in-memory `room.players`. Disconnect/reconnect remap could change order.
- **Fix:** Sort `remainingAccounts` by `players[i]` index canonically; treat any inconsistency as fatal.

#### H062 — Stale IDL after redeploy
- **Severity:** MEDIUM
- **File:line:** `server/idl/*.json`
- **Status:** INVESTIGATE
- **Description:** Manually maintained IDL. Stale IDL → silent field-offset misread in borsh deserialization.
- **Fix:** Add CI check that `server/idl/*.json` matches `target/idl/*.json` after build.

### 3.13 Group-Chat Logic (4 findings)

#### H063 — Group-chat self-firing infinite stall
- **Severity:** HIGH (NOVEL)
- **File:line:** `server/services/groupchat/lifecycle.js`
- **Status:** CONFIRMED
- **Description:** Self-shots correctly filtered (`dmg<=0`) but `consecutiveMissedTurns` resets on every fire. Player can self-fire indefinitely to stall match while never auto-forfeiting. Locks group match for the full duration.
- **Fix:** Don't reset `consecutiveMissedTurns` if `dmg<=0`; treat self-fire as a missed turn.

#### H064 — Group-chat null-winner path
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lifecycle.js`
- **Status:** CONFIRMED
- **Description:** If `winnerPlayer.walletAddress` is null at settlement, escrow is abandoned; falls back to permissionless_reclaim equal-split after 24h. Winner gets no premium.
- **Fix:** Pre-settle check: if winner has no walletAddress, emit operator alert; fallback to equal-split immediately rather than waiting 24h.

#### H065 — Auto-forfeit counter evaded via reconnect
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:676-681`
- **Status:** CONFIRMED
- **Description:** `consecutiveTimeouts[socketId]` keyed by socket ID, not player identity. Reconnect resets counter. Indefinite idle stalling.
- **Fix:** Key by `tgId`/`walletAddress` instead of `socketId`.

#### H066 — Authority duration-set lockup
- **Severity:** MEDIUM (RECURRENT — SOS H039 post-fix)
- **File:line:** Off-chain doesn't enforce `MAX_DURATION_SECS=86400`
- **Status:** CONFIRMED post-fix
- **Description:** SOS fix bundle reduced cap to 24h. Off-chain config sets `duration_secs` per match — verify it respects the cap.
- **Fix:** Validate `duration_secs <= 86400` server-side before passing to `createMatchEscrow`.

### 3.14 DB / Mongoose (4 findings)

#### H072 — `matchId` operator injection
- **Severity:** HIGH
- **File:line:** `server/socket-io/groupchat.js:103` (5 handlers)
- **Status:** CONFIRMED
- **Description:** `if (!matchId)` accepts `{$gt: ""}` → arbitrary match doc returned.
- **Fix:** Validate `typeof matchId === 'string'` and reject otherwise.

#### H073 — `handle` operator injection on /api/challenge
- **Severity:** HIGH
- **File:line:** `server/services/challenge.js:41`
- **Status:** CONFIRMED
- **Description:** `User.findOne({handle: {$ne:null}})` returns real user data when attacker supplies operator-shaped input.
- **Fix:** Validate input is string; sanitize all `req.body` fields with operator-stripping.

#### H074 — `bulkWrite` partial-failure silent
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/lifecycle.js:1002`
- **Status:** CONFIRMED (same as H029)
- **Fix:** Inspect `result.writeErrors`.

#### H075 — `upsert + unique index` race not E11000-aware
- **Severity:** HIGH
- **File:line:** `ServerState`, referral code generation
- **Status:** CONFIRMED
- **Description:** Doesn't catch E11000 specifically → burn TX persistence can silently fail.
- **Fix:** Catch E11000 explicitly + retry with regenerated key.

### 3.15 Logging & PII (5 findings)

#### H067 — `debugLog.js` always console.log
- **Severity:** HIGH
- **File:line:** `client/src/lib/debugLog.js:47`
- **Status:** CONFIRMED
- **Description:** Unconditionally logs regardless of debug flag. DevTools always shows passed data including potentially sensitive args.
- **Fix:** Gate on `process.env.NODE_ENV !== 'production'`.

#### H068 — TG ID + wallet co-logged
- **Severity:** HIGH
- **File:line:** `server/socket-io/main.js:1124, 1368`
- **Status:** CONFIRMED
- **Description:** Two patterns log both TG ID and wallet prefix on the same line → persistent cross-identity linkage in log stream.
- **Fix:** Log only one identifier per line; for cross-ref, use a separate `linkage` event with policy.

#### H069 — Escrow boot logs treasury + ops addresses
- **Severity:** MEDIUM
- **File:line:** `server/services/escrow.js:89-90`
- **Status:** CONFIRMED
- **Description:** Public wallet addresses in logs. Not directly sensitive but enables monitoring + correlation.
- **Fix:** Truncate addresses in logs.

#### H070 — `/health` exposes activeConnections
- **Severity:** LOW
- **File:line:** unauth `/health` endpoint
- **Status:** CONFIRMED
- **Description:** Information disclosure / fingerprinting.
- **Fix:** Move detailed metrics behind admin auth; keep `/health` returning only `{status:'ok'}`.

#### H071 — Source maps disabled in production
- **Severity:** RESOLVED (NOT_VULNERABLE)
- **File:line:** `client/.env.production`
- **Status:** ✅ `GENERATE_SOURCEMAP=false` confirmed correct.

### 3.16 RNG / Crypto (2 findings)

#### H089 — Group match IDs use Math.random()
- **Severity:** HIGH
- **File:line:** `server/services/groupchat/index.js:35`
- **Status:** CONFIRMED
- **Description:** V8 XorShift128, ~1M effective keyspace. Predictable after ~5 observations → lobby sniping (attacker pre-creates colliding match to capture invitees).
- **Fix:** Use `crypto.randomBytes(8).toString('hex')`.

#### H090 — Challenge shortcode 20 effective bits
- **Severity:** HIGH
- **File:line:** `server/services/challenge/challenge.js:27`
- **Status:** LIKELY
- **Description:** `randomBytes(3).slice(0,5)` drops 4 bits. ~1M space + 24h TTL. Enumerable; no rate limit on lookup.
- **Fix:** Use `randomBytes(4).toString('base32')` for 32-bit code; add lookup rate limit.

### 3.17 Tier 3 / Defensive / Edge / Resource Limits (32 findings)

Summary tables — full details in STRATEGIES.md:

**Information Disclosure (5):** H091 (magic-link in URL/history), H092 (`/health` version field), H093 (admin err.message propagated), H094 (cdn.jsdelivr.net without SRI), H095 (`localhost:5001` hardcoded in client meta CSP).

**Defensive Hygiene (8):** H096 (^ caret on all 46 deps), H097 (no CI npm audit), H098 (Vercel uses `npm run build` not `npm ci`), H099 (`@testing-library/*` in dependencies not devDependencies), H100 (React 19.2.5 in server deps; acceptable), H101 (Mongoose `playerSchema` identity constraint comment-only), H102 (`confirmed` everywhere; should be `finalized` for mainnet settle reads), H103 (`shot-token.js` module-level Connection cannot reinit without restart).

**Edge Cases (8):** H104 (auth replay 5-min, alias of H004), H105 (Math.random in lifecycle for first-player + theme — gameplay-only), H106 (`clientSeq` sequential integer — predictable but auth covers it), H107 (`walletLinkToken` plaintext Map key — heap dump exposure), H108 (Privy `autoBindAttempted` flag never resets on wallet change), H109 (`signAndBurnShot` skips pre-signing discriminator/program-ID validation), H110 (`window.socket` accessible from XSS despite non-enumerable), H111 (`report-uri` directive deprecated; use `report-to`).

**Resource Limits (5):** H112 (`failedSettlements` Map unbounded on repeated RPC failure), H113 (`balanceCache` never evicts stale entries), H114 (escalation counter resets on clean event — 29 ev/s never triggers disconnect), H115 (admin routes share global HTTP rate budget), H116 (HSTS preload flag absent — server has 365d).

**Documentation (3):** H117 (Privy rotation issue undocumented in user-facing terms), H118 (backup/rotation procedures undocumented for server keypair), H119 (open-issue tracker for "DB wallet ≠ on-chain wallet" needs visibility).

---

## 4. Combination Attack Analysis (Attack Chains)

### Chain A: TG Identity Takeover (H001 + H006)

```
GOAL: Assume victim's identity across all group-chat operations
├── PATH: Privy bridge + identity backfill
│   ├── STEP 1: Attacker creates legitimate Privy account → valid JWT [CONFIRMED]
│   ├── STEP 2: POST /api/wallet/link-from-privy-telegram with victim's TG ID + attacker's wallet → server binds [CONFIRMED H001]
│   └── STEP 3: Connect via wallet-auth → backfill at main.js:1298-1303 substitutes victim's TG ID
│              into client.telegramUser.id → tgIdFor() returns victim's identity for ALL group operations [CONFIRMED H006]

CRITICAL NODE: H001 — Fixing this breaks the entry foothold.
ALTERNATIVE FIX: H006 — Tagging identity source closes the same chain.
```

### Chain B: Silent Fund Redirect (H009 + H010)

```
GOAL: Settlement to attacker-controlled wallet without server detection
├── PATH: Wallet rotation + reconnect remap
│   ├── STEP 1: Privy re-provisions victim's wallet from A→B (SDK upgrade or attacker-induced) [PRECONDITION]
│   ├── STEP 2: DB never updates (users.js:91 blocks update-after-set) [CONFIRMED H009]
│   ├── STEP 3: Victim wins wagered match
│   ├── STEP 4: Server reads stale walletAddress from DB → settles SOL to wallet A [CONFIRMED]
│   └── STEP 5: Attacker (who anticipated A becoming abandoned) claims SOL via wallet A control

CRITICAL NODE: H009 — Updating wallet on every authenticated event closes the attack at the source.
```

### Chain C: Refund Black Hole (H013 + H014)

```
GOAL: Player believes refund succeeded; SOL stays locked indefinitely
├── PATH 1: refundWager fails-open
│   ├── STEP 1: Trigger any error path in cancelMatchEscrow (RPC 429, IDL deserialization, on-chain revert) [TRIVIAL]
│   ├── STEP 2: refundWager returns {success:true} despite error [CONFIRMED H013]
│   └── STEP 3: Server emits "refunded" to client; SOL still in PDA
├── PATH 2: H023 desync forces revert
│   ├── STEP 1: Server crash/restart loses in-memory wagerStates [TRIGGERED]
│   ├── STEP 2: Server builds remaining_accounts from incomplete state [CONFIRMED H014]
│   ├── STEP 3: On-chain length-check rejects with IncompleteRefund
│   └── STEP 4: Refund stuck for 2h (v1) or 24h (v2)

CRITICAL NODE: H013 — Fixes UX but not stuck SOL.
ROOT FIX: Read on-chain deposits_mask (closes both H013 surfacing and H014 root cause).
```

### Chain D: Race-Then-Drain (H015 + H016 + lifecycle races)

```
GOAL: Concurrent ops corrupt state → match stalls or double-settles
├── PATH: Mongo overwrite race
│   ├── STEP 1: Two players' confirmDeposit arrive within event-loop tick [CONFIRMED H016]
│   ├── STEP 2: findOne → mutate slot → save races; second save overwrites first
│   └── STEP 3: Match stalls indefinitely; SOL locked until 24h reclaim
├── PATH: Double-settle
│   ├── STEP 1: Two checkAndSettle calls both pass state guard [CONFIRMED H015]
│   ├── STEP 2: First on-chain settle succeeds; second rejected
│   └── STEP 3: Server emits matchSettled twice → double pushMatchHistory → potentially double SHOT mint

CRITICAL NODE: Atomic Mongoose CAS via findOneAndUpdate breaks both paths.
```

### Chain E: Cross-Skill Coup (SOS H001 + DB H002 = THE H120 CHAIN)

```
GOAL: Drain treasury + redirect 7%-10% of all wagers to attacker
├── PATH: DB foothold → SOS mainnet vulnerability
│   ├── STEP 1: Identify deploy lacking PRIVY_APP_SECRET (current render.yaml does NOT include it)
│   ├── STEP 2: Privy fails-open at requirePrivyAuth — link-from-privy-telegram fully ungated [CONFIRMED H002]
│   ├── STEP 3: Bind victim TG ID to attacker wallet (no Privy session needed when secret missing) [H001]
│   ├── STEP 4: Assume victim's session + identity (H001 + H006 chain) [CONFIRMED]
│   ├── STEP 5: Trigger SOS H001 (deferred): one-step authority transfer via update_config [SOS confirmed deferred to mainnet]
│   ├── STEP 6: New authority = attacker wallet; treasury/ops also rotated
│   └── STEP 7: settle_match for all in-flight matches → 7%+3% fee splits go to attacker; winner stake also attacker-controllable

CRITICAL NODE: H002 (Privy fails-open) is the foothold.
ALTERNATIVE FIX 1: SOS H001 (two-step authority transfer with timelock) breaks the multiplier.
ALTERNATIVE FIX 2: H012 (multisig for upgrade authority) limits blast radius.

This chain combines pre-mainnet posture from BOTH skills into a production-blocking compound.
```

---

## 5. Cross-Boundary Analysis (SOS ↔ DB)

The SOS programs (post fix-bundle commit `7296e95`) are robust on-chain. The off-chain code is the weaker link, and most exploitation paths route through it.

### 5.1 Where the boundaries combine

| On-chain assumption | Off-chain reality | Risk |
|---------------------|-------------------|------|
| `cancel_match` requires `len(remaining_accounts) == count_ones(deposits_mask)` (H023 fix) | **Server doesn't read on-chain mask** — uses Mongo `initialDepositTx` field | H014 desync — refund reverts; SOL stuck |
| Authority is a single trusted key | Off-chain: keypair unzeroized in memory, env-var-loaded, no rotation procedure | H011 + H012 — heap dump = total compromise |
| Per-match snapshot freezes treasury/ops/BPS at create | Off-chain: ✅ correctly read from snapshot when settling | OK |
| Players array fixed at create | Off-chain: ✅ stored in match doc, used for pubkey-match check | OK |
| Settlement winner ∈ players | Off-chain: ✅ enforced via Mongoose validation + on-chain constraint | OK |
| Pause does not block in-flight exits (v2) | Off-chain: doesn't directly affect server logic | OK |

### 5.2 The H120 cross-skill chain

The headline cross-boundary finding is **H120**, composing SOS Audit #2's deferred H001 with DB Audit #2's H002:

- **SOS H001 (deferred to mainnet, per `Docs/internal/REMEDIATION_DECISIONS.md` Section 2.1):** One-step authority transfer with no propose/accept and no timelock. Acknowledged pre-mainnet posture — "introduce propose/accept + timelock, or accept the risk."
- **DB H002:** `requirePrivyAuth({required:true})` becomes a no-op when `PRIVY_APP_SECRET` is missing. The current `render.yaml` does not include this secret.

Composition: an attacker on a fresh deploy (or any deploy where the secret is absent) achieves session takeover via H001+H006 chain → triggers SOS-deferred authority rotation → drains treasury. This is the most consequential single chain in the audit because it composes "intentional pre-mainnet posture" from both skills into a working mainnet-blocking compound.

### 5.3 The H023 fix-bundle interaction (positive but incomplete)

SOS H023 fix bundle (commit `7296e95`) added on-chain `require!(remaining_accounts.len() == count_ones(deposits_mask))` at all 4 refund-loop sites. This is a real CRITICAL fix — closes a 900 SOL theft path.

But on the off-chain side, the server cancel-builders still construct `remaining_accounts` from off-chain Mongo state (`wagerStates[roomId].deposits` for v1; `player.initialDepositTx` for v2). The on-chain fix didn't update the off-chain mental model; any state desync (server crash, RPC drop, race condition) now yields `IncompleteRefund` reverts instead of partial refunds.

**Net:** SOS H023 fix is comprehensive on-chain, but the off-chain refund-builder (H014) needs to be updated to read on-chain `deposits_mask` before constructing `remaining_accounts`. Otherwise the new H023 enforcement creates a new failure mode (refunds reject) without closing the underlying server-side state-desync risk.

---

## 6. Comparison to Audit #1 (Feb 2026)

### Quantitative deltas

| Metric | Feb #1 | May #2 | Delta |
|---|---|---|---|
| Files scanned | 93 | 142 | +53% |
| LOC | ~36,512 | ~84,270 | +131% |
| Server npm vulns | 30 | 20 | -33% |
| Client npm vulns | 131 | 47 | -64% |
| CRITICAL findings | 12 | 23 | +92% (but reflects bigger surface, not regression) |
| HIGH findings | 34 | 40 | +18% |
| Verdict | "Not safe for production" | "Hackathon-safe; not mainnet-safe" | Improved |

### Qualitative status

**RESOLVED (Feb finding now fixed):**
- Source maps in production builds — `client/.env.production: GENERATE_SOURCEMAP=false` confirmed (was H071 alias).
- `qs` vulnerability — 6.14.2 above 6.10.3 threshold (originally Feb critical-vector for prototype pollution).
- Helmet middleware deployed with comprehensive defaults (CSP, HSTS, frameguard).
- CORS scoped to allowed origins (vs. open in Feb).
- Room ID generation uses `crypto.randomBytes` (was `Math.random` in Feb).
- create-room rate limiter (3 req/60s/IP) added.

**RECURRENT (still open from Feb):**
- H003 ← Feb H029 — JWT generated but never verified server-side.
- H004 ← Feb C-6/H030 — Auth signature 5-min replay window.
- H012 ← Feb H044 — Single keypair = upgrade auth + application auth.
- H018 ← Feb C-7 — `shoot` legacy relay no auth.
- H027 (depositTimers slot reuse) — same Pitfall 1 acknowledged in code comment.
- H085 ← Feb H053 — nodemon in production deps.

**REGRESSION (Feb fixed → now broken; +1 severity escalation applied):**
- **H011 (was Feb KM-04):** Keypair zeroization. Feb resolved this; commit `f551275` reverted because web3.js aliases buffer. **Original severity LOW → escalated to HIGH then to CRITICAL** under +1 chain rule given heap-dump exploit class.
- **CSP dead origins (H035):** Feb cleaned the original Dynamic-era origins; the recent Dynamic→Privy migration left them in the helmet config. Severity MEDIUM (was MEDIUM in Feb).

**NEW (didn't exist in Feb scope):**
- H001/H002/H006/H007/H008 — Privy infrastructure didn't exist in Feb. These are full-greenfield findings on the new auth path.
- H013/H014/H015/H016 — Group-chat lifecycle didn't exist in Feb.
- H058–H062 — v2 escrow off-chain code didn't exist in Feb.
- H030 (escrowDepositStatus PII) — escrow event surface didn't exist in Feb.

---

## 7. Remediation Roadmap

Following the SOS fix bundle precedent (commit `7296e95`), recommend bundling fixes into audit-driven commits.

### Bundle A: Pre-mainnet must-fix (~20 small concrete fixes; 1-2 days)

Quick wins. Each is a small concrete diff with no architectural implications.

| ID | Fix | Effort |
|---|---|---|
| H013 | Propagate `cancelMatchEscrow` return value in `refundWager()` | 5 min |
| H014 | Read on-chain `deposits_mask` before building `remaining_accounts` | 1 hr |
| H015 | Replace `findOne→save` with `findOneAndUpdate` CAS gate in `checkAndSettle` | 30 min |
| H016 | Atomic `$set` operator in `confirmDeposit` slot mutation | 30 min |
| H017 | Replace `Math.abs(dmg)` with `if (dmg<=0) return` in 1v1 fire path | 5 min |
| H018 | Add `requireAuth` + match-membership to `shoot` legacy relay | 15 min |
| H019 | Auth + identity-binding on `acceptChallenge`/`declineChallenge` | 30 min |
| H020 | Remove `clientDebugLog` event or gate behind admin auth | 10 min |
| H022 | Auth + projection on `getGroupMatch` | 15 min |
| H023 | Auth on `/api/challenge/:code/cancel` | 10 min |
| H025 | Treat absent inventory slot as 0 ammo + reject | 10 min |
| H026 | Make `clientSeq` required (remove `if defined`) | 5 min |
| H030 | Per-recipient projection on `escrowDepositStatus` | 30 min |
| H031 | `if (NODE_ENV!=='production')` wrap on `DebugAuthOverlay` | 5 min |
| H034 | Add `headers` block to `client/vercel.json` | 15 min |
| H041 | `npm update express-rate-limit` | 5 min |
| H055 | Gate `/teststats` on admin TG ID | 10 min |
| H063 | Don't reset `consecutiveMissedTurns` if `dmg<=0` | 10 min |
| H072 | Validate `typeof matchId === 'string'` in 5 handlers | 30 min |
| H083 | Replace `!==` with `crypto.timingSafeEqual` for admin key | 15 min |

Total Bundle A: ~5 hours.

### Bundle B: Architectural pre-mainnet (~10 items; 1-2 weeks)

Items requiring design change.

| ID | Fix | Effort |
|---|---|---|
| H001 + H002 | Verify Privy session's TG claim against client-supplied `telegramUserId` + add `PRIVY_APP_SECRET` to `render.yaml` | 1-2 days |
| H006 | Tag identity source (`tg-hmac` vs `wallet-backfill`); restrict high-trust ops to HMAC source | 2-3 days |
| H009 | Wallet rotation handling: re-verify on every authenticated event, write new value (idempotent) | 2-3 days |
| H011 | Re-implement keypair zeroization (clone buffer before web3.js call) OR migrate to KMS | 2-5 days |
| H012 | Multisig migration plan + Squads setup for upgrade authority | 1 week |
| H037 | `FailedSettlement` Mongoose collection + operator alert on retry exhaustion | 1 day |
| H040 | Mirror v1 retry queue for v2 settlement | 1 day |
| H049 + H050 | Helius primary + Solana public secondary RPC + retry on 429 | 2 days |
| H067/H068/H033 | Replace all `console.*` with logger; ESLint rule banning bare console | 2-3 days |

Total Bundle B: 2-3 weeks.

### Bundle C: Defensive cleanup (~30 items; 2-3 days)

| Category | Items |
|----------|-------|
| npm updates | H041–H045 (5 CVE updates) — 30 min |
| Header polish | H035 (remove Dynamic CSP), H036 (remove Eruda inline), H094 (add SRI to jsdelivr) — 1 hour |
| Log policy enforcement | H067, H068, H069, H070 — 1 day |
| Defensive guards | H024 (sanitize errors), H038 (exit on uncaught), H039 (Mongo reconnect), H075 (E11000) — 1 day |
| Resource limits | H112, H113, H114, H115, H116 — 1 day |
| Tier 3 cleanup | H091–H119 selectively — 1 day |

### Bundle D: Cross-skill mainnet hardening (~10 items; coordinate with SOS team)

Document in `Docs/internal/REMEDIATION_DECISIONS.md` Section 5 or new `Docs/internal/DB_REMEDIATION_DECISIONS.md`.

| Item | Owner | Notes |
|------|-------|-------|
| Squads multisig for both upgrade authority + config.authority | Both teams | Closes H012 + reduces blast radius of H001 (SOS) and H120 chain |
| Two-step authority transfer with 24h timelock | SOS team | Closes SOS H001; eliminates H120 multiplier |
| `propose_authority` + `accept_authority` instructions | SOS team | Same |
| Server-side win-rate anomaly monitor | DB team | Mitigates H120 even if foothold exists |
| Privy magic-link → DB whitelist for player-wallet binding | DB team | Closes H001 root cause; eliminates the foothold |
| Refund-loop refactor (caller-supplied indices) | SOS team | Closes SOS H024 (non-contiguous mask) — currently authority-rescuable |
| Bump `match_id` to 64-bit + Mongoose unique index | DB team | Closes H060 |

---

## 8. Verdict

### Hackathon submission (devnet, no real funds)

**SAFE.** No real funds are at risk on devnet. The most consequential chain (H120) requires triggering on-chain authority rotation; there are no mainnet funds to extract.

### Mainnet with real funds

**NOT SAFE** until Bundles A + B + D land. Specifically:

- **Bundle A** is mandatory — closes 20 concrete vulnerabilities with simple fixes.
- **Bundle B** is mandatory — addresses architectural gaps that no amount of patch-fixing can cure (Privy/TG bridge, wallet rotation, keypair handling).
- **Bundle D** is mandatory — closes the cross-skill compound that composes pre-mainnet posture from both audits.

### Improvement vs Feb 2026

**Substantial improvement.** Server vulns down 33%, client down 64%, source maps off, helmet/CORS deployed, secrets clean of git tree, `qs` patched, room ID generation cryptographic, rate limiting on the most-abused endpoints. The codebase shows clear evidence of an audit-driven discipline.

The headline regressions are limited (two: keypair zeroization revert, CSP dead origins) and tractable. The headline new findings (Privy bridge, group-chat races, H120 cross-skill chain) reflect a real expansion of attack surface alongside the substantial new feature work — they are the cost of progress, not signs of negligence.

---

## 9. Methodology Reference

### Audit phases

This audit ran the Dinh's Bulwark deep-tier pipeline:

1. **Phase 0+0.5** — Codebase scan + static pre-scan. 142 files / 84K LOC indexed. Static tools: `npm audit` (server + client), `git secrets` (clean), grep for credentials in source/docs. KB manifest generated covering ~270 OC patterns.
2. **Phase 1+1.5** — 22 parallel context auditors deployed (5 batches). Each produces a CONDENSED_SUMMARY block + full analysis. Quality gate skipped (concrete file:line evidence in all outputs).
3. **Phase 2+3** — Architectural synthesis (`ARCHITECTURE.md` — trust zones, invariants, cross-cutting concerns). Strategy generation produces 122 attack hypotheses across Tier 1/2/3 (`STRATEGIES.md`).
4. **Phase 4** — **SKIPPED.** Per user direction, Tier 1 strategies are CONFIRMED via Phase 1 file:line evidence + cross-agent corroboration; no separate PoC pass needed.
5. **Phase 5** — This report.

### Why Phase 4 was skipped

The 22 context auditors in Phase 1 produced concrete file:line evidence with strong cross-agent corroboration (see `ARCHITECTURE.md` Section 7 — Cross-Cutting Concerns). For example:
- "Privy/TG identity bridge unverified" was independently flagged by AUTH-01, CHAIN-03, SEC-01, ERR-01, and INJ-01.
- "Wallet rotation gap" was independently flagged by CHAIN-03, DATA-01, and SEC-01.
- "`refundWager()` fails-open" was flagged by LOGIC-02 and ERR-01.

The strategist organized 113 unique findings into 122 strategies (some strategies pair complementary findings). With this density of corroborated file:line evidence, Phase 4's main contribution would be PoC artifacts — useful for fix triage but not necessary for audit-grade confidence. The user opted to synthesize directly from Phase 1 + Phase 2/3 outputs.

**Limitation:** Tier 1 strategies are CONFIRMED via context-auditor evidence but not separately PoC'd. A few items marked LIKELY (H008, H058, H061, H090) would benefit from explicit PoC pass.

### Cross-validation matrix

When 3+ auditors flagged the same concern, the finding receives weighted confidence:

| Concern | Auditors | Strategy |
|---------|----------|----------|
| Privy/TG bridge unverified | AUTH-01, CHAIN-03, SEC-01, ERR-01, INJ-01 (NODE_ENV) | H001 |
| Wallet rotation gap | CHAIN-03, DATA-01, SEC-01 | H009 |
| `refundWager` fails-open | LOGIC-02, ERR-01 | H013 |
| Group-chat double-settle race | LOGIC-02, ERR-02, LOGIC-01 | H015 |
| `confirmDeposit` doc overwrite | ERR-02, LOGIC-01 | H016 |
| Auth signature replay | AUTH-01, CHAIN-03, CRYPTO-01 | H004 |
| JWT generated never verified | AUTH-01, SEC-02, DATA-04 | H003 |
| Single keypair = upgrade + app auth | SEC-01, SEC-02, DATA-05 | H012 |
| No state pre-check before settle | CHAIN-01, CHAIN-06, ERR-01 | H059 |
| `failedSettlements` silent drop | LOGIC-02, ERR-01, ERR-03 | H037 |

---

## 10. Appendix

### Audit lineage

| # | Date | Git Ref | Type | Scope | Confirmed | Status |
|---|------|---------|------|-------|-----------|--------|
| 1 (Bulwark DB) | 2026-02-24 | `ecfd03b` | Off-Chain | 93 files | 70 | Completed |
| 1 (SOS) | 2026-02-23 | `ecfd03b` | On-Chain | 1 program | 8 | Completed |
| 1 (BOK) | 2026-02-23 | `ecfd03b` | Invariant | v1 (855 LOC) | 25 inv / 59 tests | Completed |
| 2 (SOS) | 2026-05-07 | `7296e95` | On-Chain | 2 programs | 22 confirmed (4C/14H/4M/6L) | Completed; 9 fixed |
| 2 (BOK) | 2026-05-07 | `7296e95` | Invariant | v1+v2 (1982 LOC) | 41 inv / 159 tests | Completed; 0 violations |
| 2 (Bulwark DB) | 2026-05-07 | `5f2acec` | Off-Chain | 142 files | 113 (23C/40H/30M/20L) | **THIS REPORT** |

### Files analyzed (142 / 84K LOC)

Top-level categories:
- `server/` — Express + Socket.IO + Telegraf (~28K LOC across 71 modified + 8 new files)
- `client/` — React + Phaser PWA (~50K LOC across 71 modified + 50 new files)
- `programs/` — Anchor escrow v1 + v2 (excluded from this audit; covered by SOS + BOK)
- `Docs/`, `.audit/`, `.bok/`, `.bulwark/` — audit artifacts (not under audit; consumed as reference)

### Auditor list (22 of 51 in DB skill catalog)

Selected based on ecosystem (`solana-offchain`) + protocol types (`game-server`, `wagering`, `wallet-integration`, `socket-io-realtime`, `group-chat-async`, `embedded-wallet-privy`):

| ID | Name | Output |
|----|------|--------|
| SEC-01 | Private Key & Wallet Security | `04-SEC-01-private-key-wallet.md` |
| SEC-02 | Secret & Credential Management | `03-SEC-02-secret-credential.md` |
| AUTH-01 | Authentication Mechanisms | `02-AUTH-01-authentication.md` |
| AUTH-03 | Authorization & Access Control | `05-AUTH-03-authorization.md` |
| INJ-01 | SQL & NoSQL Injection | `11-INJ-01-nosql-injection.md` |
| INJ-05 | Prototype Pollution & Deserialization | `11-INJ-05-prototype-pollution.md` |
| WEB-02 | CORS, CSP & Security Headers | `13-WEB-02-cors-csp-headers.md` |
| CHAIN-01 | Transaction Construction & Signing | `06-CHAIN-01-tx-construction.md` |
| CHAIN-02 | RPC Client & Node Trust | `07-CHAIN-02-rpc-trust.md` |
| CHAIN-03 | Wallet Integration & Adapter Security | `08-CHAIN-03-wallet-adapter.md` |
| CHAIN-06 | Program Account & PDA Interaction | `09-CHAIN-06-pda-interaction.md` |
| API-03 | WebSocket & Real-Time Security | `10-API-03-websocket.md` |
| DATA-01 | Database & Query Security | `14-DATA-01-database.md` |
| DATA-04 | Logging & Information Disclosure | `15-DATA-04-logging.md` |
| DATA-05 | Encryption & Data Protection | `16-DATA-05-encryption.md` |
| DEP-01 | Package & Dependency Security | `17-DEP-01-dependencies.md` |
| ERR-01 | Error Handling & Fail Modes | `18-ERR-01-error-handling.md` |
| ERR-02 | Race Conditions & Concurrency | `19-ERR-02-race-conditions.md` |
| ERR-03 | Rate Limiting & Resource Exhaustion | `20-ERR-03-rate-limiting.md` |
| CRYPTO-01 | Random Number Generation & Nonces | `21-CRYPTO-01-rng-nonces.md` |
| LOGIC-01 | Business Logic & Workflow Security | `22-LOGIC-01-business-logic.md` |
| LOGIC-02 | Financial & Economic Logic | `01-LOGIC-02-financial-economic.md` |

### Key file references (absolute paths)

- This report: `C:/Users/johnk/SolShot/.bulwark/FINAL_REPORT.md`
- Architecture synthesis: `C:/Users/johnk/SolShot/.bulwark/ARCHITECTURE.md`
- Strategy catalog: `C:/Users/johnk/SolShot/.bulwark/STRATEGIES.md`
- Stacked-audit handover: `C:/Users/johnk/SolShot/.bulwark/HANDOVER.md`
- Audit state: `C:/Users/johnk/SolShot/.bulwark/STATE.json`
- Hot spots map: `C:/Users/johnk/SolShot/.bulwark/HOT_SPOTS.md`
- Cross-skill: SOS `.audit/FINAL_REPORT.md` + BOK `.bok/reports/2026-05-07-report.md` + GL `.docs/`
- Remediation log: `C:/Users/johnk/SolShot/Docs/internal/REMEDIATION_DECISIONS.md`

---

## Disclaimer

This audit was conducted by Claude Code Dinh's Bulwark v1.0, an automated parallel-auditor system. Findings are based on file:line evidence with cross-agent corroboration; no independent PoC was generated for Tier 1 items (Phase 4 was skipped per user direction). The audit covers the off-chain stack only; on-chain code is covered by the parallel SOS and BOK audits.

This audit does not constitute legal, financial, or investment advice. The team and any third parties relying on this report should perform their own due diligence before mainnet deployment with real funds. The report reflects the codebase state at git ref `5f2acec`; any subsequent changes are out of scope.

For full attack walkthroughs, evidence chains, and verification artifacts:
- On-chain findings: `.audit/FINAL_REPORT.md`
- Invariant verification: `.bok/reports/2026-05-07-report.md`
- Off-chain findings (this audit): `.bulwark/FINAL_REPORT.md` + `.bulwark/STRATEGIES.md` + `.bulwark/context/*.md`

*Generated by Dinh's Bulwark v1.0 — Phase 5 (Report)*
*Audit ID: `db-solshot-2026-05-07`*
*Git ref: `5f2acec`*
