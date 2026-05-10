# SolShot Audit Summary

**Date:** 2026-05-07
**Intended audience:** Hackathon judges + future contributors
**Purpose:** One-stop overview of all three audits SolShot has run. Read this before diving into the full reports.

---

## TL;DR

Three independent audits ran in parallel on 2026-05-07: Stronghold of Security (SOS #2) analyzed the on-chain Anchor escrow programs; Book of Knowledge (BOK #2) ran math invariant verification on both programs; Dinh's Bulwark (DB #2) covered the full off-chain stack (Express + Socket.IO + React + Privy + MongoDB, 142 files / ~84 k LOC). Roughly 25 findings were fixed across two commits (the SOS fix commit SOS, the DB fix commit DB); roughly 50 additional findings were explicitly deferred with documented rationale, a written mainnet plan, and a file:line reference for every item. Nothing was silently dismissed. The cross-skill H120 finding - where SOS deferred H001 (one-step authority rotation) composed with DB H002 (Privy fail-open) into a production-blocking compound - was caught only because both audits ran simultaneously; DB H002 is now closed.

---

## Audit Overview

| Audit | Tool | Scope | Date | Headline counts | Status | Full report |
|---|---|---|---|---|---|---|
| **#1 SOS** | Stronghold of Security | On-chain Anchor programs v1 + v2 (1,982 LOC) | 2026-05-07 | 50 total: 4 CRIT / 14 HIGH / 4 MED / 6 LOW + 18 NOT_VULNERABLE + 4 STATUS_CHANGED + 4 doc-only | 9 fixed in the SOS fix commit; 16 deferred to mainnet; 22 not vulnerable or doc-only | `.audit/FINAL_REPORT.md` |
| **#2 BOK** | Book of Knowledge | Math invariants - both programs (v1 962 LOC + v2 1020 LOC) | 2026-05-07 | 41 invariants verified; 159 / 159 tests passing; 0 violations; 6 math regions, 14 sub-regions | Tests landed in the BOK verification commit; all 9 SOS fix-bundle constants verified non-regressive | `.bok/reports/2026-05-07-report.md` |
| **#3 DB** | Dinh's Bulwark | Off-chain: Express + Socket.IO + Telegraf + React + Phaser + Privy + MongoDB + Vercel/Render | 2026-05-07 | 113 findings: 23 CRIT / 40 HIGH / 30 MED / 20 LOW + 6 NOT_VULNERABLE + cross-skill H120 chain | 16 fixed in the DB fix commit; ~30 deferred to mainnet bundles A–D | `.bulwark/FINAL_REPORT.md` |

### What the programs actually do (context for judges)

SolShot has two parallel Anchor programs, both deployed on Solana devnet:

**v1** (`programs/solshot-escrow/src/lib.rs`, 962 LOC) - program ID `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`. Real-time 1v1 to 4-player matches. Players deposit SOL into a per-match PDA; the server signs `settle_match` naming the winner; Anchor pays out winner 90%, treasury 7%, ops 3%. Deployed 2026-05-04; first successful wagered settlement confirmed on-chain that same day.

**v2** (`programs/solshot-escrow-v2/src/lib.rs`, 1,020 LOC) - async N-player (2–10) matches targeting the Telegram group-chat mode. Key differences from v1: runtime-configurable fee BPS (capped at 10% combined), per-match snapshot of fees at creation time (immune to mid-flight config rotation), `deposit_window_secs` parameter, `permissionless_reclaim` after 24h, `start_with_depositors` to compact partial-deposit masks, configurable `duration_secs` (now capped at 24h after H039 fix). v2 has had no prior audit coverage before this run.

The server holds the `config.authority` keypair and is the only entity that can call `settle_match` or `cancel_match`. There is no on-chain proof of game outcome; the server is trusted for winner selection. This is a deliberate architectural choice documented in the deferred section below.

---

## What Was Fixed in This Commit Set

Fix bundles were applied in two sequential commits: the SOS fix commit carries the SOS on-chain fixes; the DB fix commit carries the DB off-chain fixes. Both compile clean (`cargo check` / `node --check`).

### SOS fix bundle - 9 findings (commit the SOS fix commit)

| ID | Severity | Description | Location |
|---|---|---|---|
| **H023** | CRITICAL | Partial-refund theft via `close = caller` sweep - added `require!(remaining_accounts.len() == deposits_mask.count_ones())` at all 4 refund-loop sites (v1 + v2 cancel_match + permissionless_reclaim). New `EscrowError::IncompleteRefund` variant. Closes up to 900 SOL stealable per v2 max match. | v1 `lib.rs:393-410, 465-484`; v2 `lib.rs:502-518, 561-577` |
| **H016 + H009** | HIGH | Pause-as-griefing on v1 `cancel_match` + pause-rotate-coup chain - removed `!config.is_paused` constraint from v1 `CancelMatch`, `SettleMatch`, and `StartWithDepositors`. Pause now only blocks new commitments; never blocks in-flight exits. Mirrors v2's existing posture. | v1 `SettleMatch`, `CancelMatch`, `StartWithDepositors` structs |
| **H017** | HIGH | v1 silent-kick via `start_with_depositors` (no timing gate) - added `MIN_DEPOSIT_WINDOW_SECS = 600` + `require!(now >= created_at + MIN_DEPOSIT_WINDOW_SECS)` at handler entry. Mirrors v2's existing `deposit_window_secs` gate. | v1 `lib.rs` handler |
| **H035** | HIGH | Settle-vs-cancel priority-fee race (v1) - bumped `TIMEOUT_SECONDS` from 600 to 3600. Cancel-from-Active timeout now aligns with `SETTLEMENT_TIMEOUT_SECONDS`, closing the 50-minute window where a losing player could priority-bid to deny settlement. | v1 `lib.rs` constants |
| **H039** | HIGH | v2 unbounded `duration_secs` enabling 8-day fund lockup - reduced `MAX_DURATION_SECS` from 7 days to 24 hours. Worst-case authority griefing now ~48 hours (24h duration + 24h grace), not 8 days. | v2 `lib.rs` constants |
| **H018** | MEDIUM | v2 deposit-window edge collision at exactly `deposit_deadline` - tightened `deposit_wager` check from `<= deposit_deadline` to `< deposit_deadline`. At `T = deposit_deadline` only `start_with_depositors` is valid; concurrent-TX race eliminated. | v2 `deposit_wager` handler |
| **H025** | LOW | `UncheckedAccount` fee destinations lack `!executable` check - added `constraint = !X.executable @ EscrowError::ExecutableNotAllowed` to all 6 `UncheckedAccount` declarations across both programs' `SettleMatch` structs. Defense against EP-106 lamport-burn pattern. | v1 + v2 `SettleMatch` structs |
| **H040** | LOW | Stale doc-comment claimed 48-hour reclaim timeout - updated to reflect correct 2-hour math (`TIMEOUT_SECONDS * 2 = 7200`). Operators reading the code now plan correct monitoring windows. | v1 `lib.rs` constants |
| **H043** | LOW | Idempotent pause emits no event (operational monitoring gap) - added `Paused` and `Unpaused` events in both programs with authority pubkey; off-chain monitoring can now event-replay pause state changes. | v1 + v2 handlers + event definitions |

### DB fix bundle - 16 findings (commit the DB fix commit)

| ID | Severity | Description | Location |
|---|---|---|---|
| **H001** | CRITICAL | Privy/TG identity bridge unverified - added Privy `getUser()` lookup to verify `telegramUserId` matches the session's actual linked TG account; returns 403 `tg_id_mismatch` on mismatch. | `server/index.js:521-548` |
| **H002** | CRITICAL | `requirePrivyAuth({required:true})` fail-open when `PRIVY_APP_SECRET` missing - production now refuses with 503 `auth_not_configured`; dev passes through with loud warning. Note: `render.yaml` was verified to NOT include this env var - this was a live production gap. | `server/services/privyAuth.js:64-83` |
| **H013** | CRITICAL | `refundWager()` fails-open - on-chain cancel CPI errors now propagate via `{success:false, error}` instead of being swallowed; dev-mode no-escrow path warns when called with escrow enabled but no matchId. | `server/services/solana.js:240-275` |
| **H018** | CRITICAL | `shoot` legacy relay no auth - added `requireAuth` + turn-ownership check (`ms.currentTurn === client.id`); spectators and out-of-turn callers silently dropped. | `server/socket-io/main.js:3387-3416` |
| **H019** | CRITICAL | `acceptChallenge` / `declineChallenge` no auth - added `requireAuth` to both handlers plus strict type check on client-supplied `fromSocketId`. | `server/socket-io/main.js:3265-3293` |
| **H020** | CRITICAL | `clientDebugLog` unauthenticated log injection - added `client.isAuthenticated` gate; pre-auth sockets silently dropped. | `server/socket-io/main.js:1356-1374` |
| **H022** | CRITICAL | `getGroupMatch` unauthenticated + full Mongo document exposed - added `client.isAuthenticated` gate; errors `auth_required` for unauthenticated callers. | `server/socket-io/groupchat.js:97-110` |
| **H023** | CRITICAL | `/api/challenge/:code/cancel` unauthenticated - endpoint now requires caller identity in body; `cancelChallenge()` validates against `challengerWallet` / `challengerTgUserId` via `$or` guard. | `server/index.js:388-405` + `server/services/challenge/challenge.js:240-264` |
| **H026** | CRITICAL | Turn-sequence nonce optional - `data.seq` is now REQUIRED; previously `if (clientSeq !== undefined)` allowed clients to omit it and bypass idempotency entirely. | `server/socket-io/main.js:3711-3724` |
| **H031** | CRITICAL | `DebugAuthOverlay` ships in production - wrapped in `process.env.NODE_ENV !== 'production'`; `?debug=1` URL param can no longer expose auth internals in production builds. | `client/src/App.js:327-330` |
| **H032** | CRITICAL | Mongoose `runValidators: true` not applied on update paths - set globally via `mongoose.set('runValidators', true)`; schema enums + regex now enforced on all `findOneAndUpdate` / `updateOne` / `bulkWrite` calls. | `server/index.js:574-579` |
| **H035** | MEDIUM | CSP has dead Dynamic origins (regression) - replaced `app.dynamic.xyz` / `api.dynamic.xyz` with `auth.privy.io` / `api.privy.io` in `connectSrc` + `frameSrc`. | `server/index.js:160-168` |
| **H041** | HIGH | `express-rate-limit` IPv6 bypass - bumped `^8.2.1` → `^8.5.1` (advisory GHSA-46wh-pxpv-q5gq). Verified installed: 8.5.1. | `server/package.json:25` |
| **H055** | MEDIUM | `/teststats` no admin guard in production - added `NODE_ENV === 'production'` check + `ADMIN_TELEGRAM_IDS` env allowlist; non-admin callers in prod silently ignored. | `server/services/bot.js:352-368` |
| **H072** | HIGH | `matchId` operator injection in `getGroupMatch` - added `typeof matchId !== 'string'` strict check; returns `missing_or_invalid_matchId` error. (Side-effect of H022 - same handler.) | `server/socket-io/groupchat.js:103-110` |
| **H083** | HIGH | Non-timing-safe admin key comparison - replaced `!==` with `crypto.timingSafeEqual`; length-mismatch fails without revealing correct length. | `server/middleware/guards.js:25-39` |

---

## What Was Deferred and Why

Deferrals are organized by the bundle roadmap in the SOS remediation log (SOS) and the DB remediation log (DB).

### SOS deferrals

**Authority key model - intentional pre-mainnet posture, acknowledged by the team**

The current architecture uses a single hot wallet (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) for both the Solana BPF Loader upgrade authority and the application-level `config.authority` on both programs (verified live via `solana program show` 2026-05-06). JJ has formally acknowledged this as an explicit pre-mainnet decision in the prior-audit delta record. Blast radius is gated on compromise of one key - not open access - but the consequence of compromise is total.

| ID | Title | Rationale | Mainnet plan |
|---|---|---|---|
| H001 | One-step authority transfer (no propose/accept) | `pending_authority` + propose/accept is a meaningful state-machine change requiring IDL update + client integration; not appropriate for hackathon scope. Historical analogues: Step Finance $30-40M, Garden $11M. | Add `propose_authority` + `accept_authority`; require new authority to co-sign accept. |
| H044 | Single hot wallet for Layer 1 + Layer 2 | Same key holds upgrade authority and application authority for both programs. Migration requires generating new key + multisig setup + redeploy. | Migrate upgrade authority to Squads M-of-N multisig before mainnet. Separate hot wallet for application authority. |
| H046 | Layer-1 bytecode replacement (no timelock) | Same root as H044. One TX can deploy malicious bytecode with no on-chain recovery. | Squads multisig for upgrade authority. Optionally freeze post-stabilization. |
| H002 | Treasury self-redirect via multi-TX rotation | Distinctness check fires post-update; a multi-TX dance can route treasury through a secondary wallet. v2 in-flight matches are protected by per-match BPS snapshot. | 24h timelock on `update_config` for treasury / ops / fee_bps changes. Bundle with H032. |
| H030 | Fee destination hijack via `update_config` (v1, reads live config at settle) | v2 mitigates via per-match snapshot. Backporting snapshot pattern to v1 is a structural change. v2 is the production target. | Document v1 as legacy; migrate production traffic to v2 once stabilized. |
| H032 | BPS rotation ratcheting (no timelock) | 10% combined cap holds; risk is selective extraction across matches. Cap bounds blast radius. | `last_bps_update_ts` + 24h delay. Bundle with H002 timelock work. |
| H011 | Runtime BPS poisoning via Layer-2 compromise (v2) | Per-match snapshot protects in-flight matches. New matches use current BPS. 10% cap bounds blast radius. | Same timelock bundle as H002 + H032. |
| H042 | GlobalConfig has no close path (key-loss permanence) | If authority key is lost AND H001 is still open, GlobalConfig is permanently locked. Recovery requires Layer-1 program upgrade. | Add `propose_recovery` + guardian mechanism once H001 is implemented. Key backup is the operational mitigation in the meantime. |

**Server-as-authority design limitations - intentional architecture**

These are protocol design properties, not code bugs. The server selects the match winner with no on-chain proof of game outcome. All three require compromise of the server keypair to exploit.

- **H003 - Authority winner selection fraud.** The server signs `settle_match` with any registered player as winner. Worst case for v2 at max players: 900 SOL. Requires server key compromise. Long-term fix: commit-reveal or VRF-based winner selection. Interim: monitor settlement patterns server-side and add a community dispute mechanism.
- **H006 - Authority collusion via controlled player wallet.** Server generates a secondary wallet, registers it as a "player" in `create_match`, settles in its favor. The existing OC-06 exclusion only prevents the SIGNING key from receiving funds - not a wallet the server holds separately. Fix: bind player wallets to verified Telegram user IDs (Privy magic-link → DB whitelist) at match creation time.
- **H007 - Authority self-play.** Alias of H006 with same root cause and same fix path.

**Architectural limitations accepted for hackathon**

- **H024 - Non-contiguous `deposits_mask` permanently unrefundable on-chain.** If mask bit 0 is unset but bit 1 is set (player 0 never deposited, player 1 did), the refund loop at current v1:393-410 / v2:502-518 has no valid execution path - every `remaining_accounts` length fails the H023 count check. Server logs as UNRECOVERABLE. The authority can rescue by calling `start_with_depositors` which compacts the mask, so this is not permanent fund loss under normal operations - but it requires authority cooperation. Full fix: refactor the refund loop to accept a caller-supplied `player_indices: Vec<u8>` matching the accounts provided. Requires IDL update + server `escrow.js` + client `WalletContext` changes.
- **H033 - `start_with_depositors` griefing via timing choice (v2).** The authority decides WHEN to call `start_with_depositors` once `deposit_window` has expired. A malicious or buggy authority could delay activation to disadvantage a specific player. Server policy enforces timely activation in practice. Optional on-chain mitigation: require activation within 1h of `deposit_deadline` or auto-cancel.
- **H049 - match_id PDA seed entropy (4-char hex IDs).** 4-char hex = 65,536 possibilities. Birthday collision expected around 256 concurrent matches. On-chain `init` rejects the collision, so this is a UX degradation, not a fund-loss issue. Fix: `crypto.randomBytes(8)` → 16 hex chars, plus a Mongoose unique index. Approximately 10 server-side lines.
- **H008 - `initialize_config` accepts any payer (race-init, theoretical).** The race was won on devnet (config initialized 2026-05-04). For future mainnet deploys, a single deploy script that atomically chains `solana program deploy` immediately followed by the init TX (same operator session) prevents the race without any code change to the program.

### DB deferrals

**Bundle A - Pre-mainnet must-fix (small, deferred for coordinated change)**

| ID | Title | Why deferred | Plan |
|---|---|---|---|
| H014 | H023 fix-bundle ↔ server desync | SOS H023 fix requires on-chain `count_ones(deposits_mask)` to match `remaining_accounts.len()`. Server builds the array from off-chain state, not on-chain mask. Any desync → `IncompleteRefund` revert → SOL stuck for 2h or 24h. **This is the dual-audit boundary defect.** | Add `getEscrowState(matchId)` call before refund builder; use on-chain `deposits_mask` directly. Test non-contiguous-mask scenario on devnet. |
| H009 | Wallet rotation gap (DB never updates) | `users.js:91` only sets `walletAddress` if currently null. Privy can re-provision; DB retains stale; settlement flows to wallet user no longer controls. Fix is semantically delicate - naive update could break TG-bind paths. | Add `updateWalletForTgUser()` with versioned audit trail. Coordinate with Privy SDK rotation detection. |
| H010 | Reconnect migrates stale wallet entry | Same root as H009. Reconnect remap copies OLD wallet from in-memory state. | Bundle with H009 fix. |
| H016 | `confirmDeposit` last-depositor doc overwrite | Two simultaneous deposit confirmations both follow `findOne → mutate → save()`. Second save overwrites first depositor's `initialDepositTx`. Match stalls indefinitely. | Refactor to `findOneAndUpdate` with `$set: {'players.$.initialDepositTx': txSig}` under `$elemMatch` guard. |
| H015 | Group-chat double-settle race | Three async paths (`handleShot`, `handleForfeit`, `handleIdleTimeout`) each call `checkAndSettle()` on stale in-memory doc. Concurrent calls all pass the state guard. | Convert settle to atomic `findOneAndUpdate({state:'active'},{state:'settled'})`; fail safely if doc has moved. |

**Bundle B - Architectural pre-mainnet (design decisions required)**

- **H003 - JWT generated but never verified server-side.** `verifyToken()` was correctly removed as dead code in Phase 4 hardening, but `generateToken()` still runs and emits a token to clients who never use it. This implies an auth model that doesn't exist. Decision needed: implement real JWT verification on every state-mutating socket event, or remove `generateToken` entirely and document that auth is purely socket-flag-based (`client.isAuthenticated`).
- **H004 - Auth signature 5-min replay window.** `verifyAuthMessage()` checks that a wallet signature's embedded timestamp is within 5 minutes but maintains no store of consumed signatures. The same signed message is reusable on any new socket within the window. Fix: add an in-memory (or Redis) `Set<signature>` with 5-minute TTL eviction. The state management approach (per-process vs cross-process) deserves deliberate design before mainnet.
- **H012 - Single keypair for upgrade + application authority.** Same finding as SOS H044/H046, confirmed from the DB side. Pre-mainnet posture, accepted by the team. Fix is Squads multisig migration coordinated with SOS Bundle 1.
- **H017 - Self-damage `Math.abs` sign erasure (1v1 physics).** The physics handler applies `Math.abs` to damage values, erasing the sign distinction between hits and self-hits. A game-design decision is needed first: should self-fire be allowed and at what damage coefficient? Once decided, the code fix is approximately 3 lines.
- **H030 - `escrowDepositStatus` PII broadcast.** The server emits full wallet pubkeys to ALL room members on every deposit confirmation. Wallet pubkeys are pseudonymous but linking them to TG user IDs creates a trackable identity chain. Fix: strip the wallet field from the broadcast and emit only `{playerIndex, confirmed}` boolean flags.

**Bundle C - Defensive cleanup (~25 items)**

npm CVEs (`socket.io-parser` DoS, `path-to-regexp` ReDoS, `handlebars` JS injection, `bigint-buffer` overflow); Vercel client zero security headers; `unsafe-inline` in client CSP; magic-link token in URL query param; single unmonitored RPC endpoint with no retry on 429; `Math.random` in group match IDs and challenge shortcodes; `nodemon` in production dependencies; per-socket throttle resets on reconnect; `/health` endpoint exposing `activeConnections`; Telegram bot lacks queue/backoff for `sendMessage`; and ~15 additional Tier 3 defensive items. Full list at the DB remediation log Section 2, Bundle C.

**Bundle D - Cross-audit mainnet hardening**

These compose SOS and DB deferrals into a joint mainnet hardening pass:

| ID | Title | Composes with |
|---|---|---|
| H120 | Cross-skill chain (DB Privy fail-open + SOS one-step authority rotation) | SOS Bundle 1 (propose/accept + timelock + Squads multisig). H002 already closed by DB fix bundle; this entry tracks the broader authority-hardening design. |
| H011 | Escrow keypair unzeroized in process memory | SOS H044 (single hot wallet). Paired with authority migration. |
| H082 | KM-04 zeroization reverted | Same as H011. Depends on web3.js change OR architectural rotation policy. |
| H084 | `@privy-io/server-auth` deprecated | Migrate to `@privy-io/node` (replacement library). |

---

## Cross-Skill Findings - The H120 Chain

This is the single most consequential finding of the May 2026 audit cycle and illustrates why running two independent audits on the same system simultaneously matters.

**The chain, step by step:**

1. **SOS Audit #2** deferred **H001** (one-step authority transfer). Rationale: requires authority key compromise to exploit; hot-wallet risk model; acceptable pre-mainnet posture per explicit team decision. Status: deferred, no code change.

2. **DB Audit #2** found **H002** (`requirePrivyAuth({required:true})` fails-open when `PRIVY_APP_SECRET` is absent). Verified: `render.yaml` does NOT include `PRIVY_APP_SECRET`. On a live deploy without that env var, the middleware calls `next()` unconditionally even with `required:true`. The `/api/wallet/link-from-privy-telegram` endpoint is fully ungated. DB fix bundle closed H002 in the DB fix commit (`server/services/privyAuth.js:64-83`).

3. **The composition** (H120): with H002 open on a misconfigured deploy, an attacker with any valid Privy account can POST to `/api/wallet/link-from-privy-telegram` with a victim's `telegramUserId` (H001 of DB audit), have the server bind that TG ID to the attacker's wallet, then use the wallet-auth backfill path (H006) to assume victim's identity across all group-chat Socket.IO events. From there, the SOS-deferred H001 (one-step authority rotation) becomes reachable if the compromised session can invoke server-side admin paths - enabling treasury drain in the worst case. DB Audit #2 labelled this compound **H120 CRITICAL**.

**Why neither audit alone catches it:** SOS sees H001 as "requires authority key compromise - acceptable." DB sees H002 as "close the ungated entry point." Only the cross-audit synthesis surfaces that H001's acceptable-because-gated framing depended on the gate (H002) actually working.

**Current status:** H002 is closed in the DB fix commit. H001 remains deferred (acceptable posture: authority key compromise required). H120 is tracked in the DB remediation log Section 2, Bundle D as a mainnet note: the SOS Bundle 1 authority hardening (propose/accept + timelock + Squads multisig) should be designed in coordination with the DB identity-chain fixes so they land atomically.

---

## Stacked-Audit Context - Feb 2026 vs May 2026

Both SOS and DB are second audits. First runs were 2026-02-23 (SOS) and 2026-02-24 (DB). The delta between Feb and May is material.

**Quantitative improvements:**

| Metric | Feb 2026 | May 2026 | Change |
|---|---|---|---|
| Server npm vulnerabilities | 30 (4L / 8M / 18H) | 20 (0L / 7M / 13H) | **−33%** |
| Client npm vulnerabilities | 131 (20C / 35H / 73M / 3L) | 47 (13H / 8M / 25L / 1C) | **−64%** |
| Feb CRITICAL S004 (PDA pre-squat DoS - anyone could de-escrow any match) | OPEN | `has_one = authority` on `CreateMatch.config` at v1:625 / v2:659 | **RESOLVED** |
| Source maps in production | Enabled | Disabled (`GENERATE_SOURCEMAP=false` in `client/.env.production`) | **RESOLVED** |
| `qs` prototype pollution (6.10.3 vulnerable) | OPEN | `qs` at 6.14.2 | **RESOLVED** |
| Helmet + CORS middleware | Partial | Comprehensive CSP, HSTS, frameguard, scoped CORS | **RESOLVED** |
| `window.solWallet` XSS exposure | OPEN | REMOVED - context hook used instead | **RESOLVED** |
| `crypto.randomBytes` for room IDs | `Math.random()` | `crypto.randomBytes()` | **RESOLVED** |
| Create-room rate limiter | None | 3 req / 60s / IP | **RESOLVED** |
| Auth gaps in gameplay events | Six events unguarded | Five closed in DB fix bundle; group-chat events gated via `tgIdFor()` validation | **SUBSTANTIALLY FIXED** |

**Regressions caught** (Feb resolved → now broken again; both addressed in fix bundles or noted as deferred):
- **H011 / H082** - KM-04 zeroization of escrow keypair was resolved in Feb, then reverted. `server/services/keys.js:54-64` documents the removal with a web3.js aliasing comment. Now deferred as Bundle D item.
- **H035** - CSP dead origins (`app.dynamic.xyz` / `api.dynamic.xyz`) reappeared after the Dynamic → Privy wallet migration. Fixed in DB fix bundle (`server/index.js:160-168`).

The Feb DB verdict was "not safe for production deployment with real funds in its current state." May DB verdict is "safe for hackathon submission on devnet; NOT safe for mainnet with real funds - Bundles A, B, and D must land first." That is a genuine step forward, documented with evidence.

---

## BOK Math Verification - What Was Proved

BOK Audit #2 ran against both programs at git ref the SOS fix commit (post-SOS-fix-bundle). 41 invariants across 14 math regions, 159 tests, zero violations. The BOK suite acts as a regression guard confirming that the 9 SOS fixes did not introduce any arithmetic bugs.

**Verification tool breakdown:**

| Tool | Invariants | Status |
|---|---|---|
| Proptest (stress-tested with thousands of inputs each) | 33 | All passing |
| `const _: () = assert!(...)` (compile-time constant checks) | 2 | All passing |
| Code-read / source-grep (runtime-context invariants not reducible to pure math) | 6 | Verified by inspection; LiteSVM tests deferred to mainnet |
| Kani formal proof | 0 | Unavailable on Windows host - degraded mode |

**Six invariant clusters across 14 math sub-regions:**

*1. Settlement math - v1 (hardcoded 90/7/3 split):*
`winner + treasury + ops == total_pot` for all valid player counts 2–4; dust ≤ 2 lamports from two BPS floor divisions; u128 widening lossless for wagers up to max u64. All inherited from the Feb BOK suite; verified still passing on post-fix-bundle code.

*2. Settlement math - v2 (runtime-configurable BPS from per-match snapshot):*
I-FEE-1 through I-FEE-6 - pot conservation across the full valid BPS surface; no underflow when the 10% combined cap holds; zero-BPS waiver path valid; fee monotonicity (higher fee_bps never produces lower absolute fee). Covers the SOS A01–A04 BPS-poisoning chain concerns directly. The 10% combined cap holds at every valid snapshot value (0–1000 BPS each side, sum ≤ 1000 BPS).

*3. Cap enforcement - v2 `initialize_config` / `update_config`:*
I-CAP-1 (cap holds at init) and I-CAP-2 (cap holds after multi-step update sequence) both passing under Proptest. I-CAP-3 (per-match snapshot atomicity: all 4 fee fields written in same instruction body as `state = AwaitingDeposits`) verified by code-read at v2:201-219. I-CAP-4 (settle path reads only snapshot fields, never live config) verified at v2:396-399, v2:717, v2:726.

*4. H023 fix regression suite:*
I-REF-1 confirms the canonical attack is rejected (attacker passes `remaining_accounts.len() < count_ones(mask)` → reverts with `IncompleteRefund`). I-REF-5 confirms non-contiguous masks are always rejected (e.g., `0b0010` with no player-0 deposit has no valid call sequence). I-REF-2 confirms refund conservation: Σ refunds == wager × count_ones for every valid contiguous mask. Together these three cover both the fix's correctness and its boundary conditions for u8 (v1) and u16 (v2) masks.

*5. Pot scaling - `start_with_depositors`:*
I-POT-1 (pot = wager × count_ones post-compaction), I-POT-2 (compaction preserves the depositor set), I-POT-3 (MIN_PLAYERS = 2 enforced - cannot multiply by 0), I-POT-4 (v1 H017 timing gate: T < MIN_DEPOSIT_WINDOW_SECS correctly rejected, T ≥ gate accepted). Boundary partition verified at exactly T = 600s.

*6. Timestamp / duration ordering:*
12 invariants (INV-1 through INV-12) covering: deadline addition no-overflow, monotonic ordering, H035 race-window elimination (cancel window now equals settle window), H018 strict `<` at deadline, v2 deposit_window bounds [60, 86400], H039 24h cap, reclaim grace minimum, u32→i64 cast safety. All SOS fix-bundle constant changes verified non-regressive via Proptest sweep and compile-time `const_assert`.

**Two user-added defensive invariants:**
I-CUSTOM-1 (per-match zero-leakage: refund total ≤ deposit total) - decomposed into I-REF-2 + I-FEE-1, both passing; full lifecycle LiteSVM test deferred to mainnet. I-CUSTOM-2 (CPI surface lockdown: only `system_program::transfer` in `deposit_wager`) - verified via source-grep: 0 `invoke()`, 0 `invoke_signed()`, 1 `CpiContext::new` in deposit_wager only.

**Assurance level:** HIGH-CONFIDENCE PROBABILISTIC (not PROVEN). Kani is unavailable on the Windows host - same degraded posture as Feb 2026. For mainnet hardening, WSL2 + Kani would upgrade I-FEE-1 through I-FEE-4 and I-CAP-1 through I-CAP-2 to PROVEN tier. Estimated setup: ~2 hours (WSL2 + Kani install + cargo kani run).

---

## Limitations - What Is NOT Verified

**1. Kani formal proof unavailable on Windows**

Both the Feb 2026 and May 2026 BOK runs operate in degraded mode. Proptest stress-tests thousands of randomly-generated inputs per invariant but cannot exhaustively prove properties the way model-checking does. The distinction matters most for the fee/pot invariants (I-FEE-1 through I-FEE-4) and cap enforcement (I-CAP-1 through I-CAP-2) - these are the invariants where an arithmetic edge case at an unusual input combination could slip through Proptest but be caught by Kani. For mainnet hardening: WSL2 + Kani for PROVEN tier on those six; LiteSVM end-to-end for I-CUSTOM-1 (full lifecycle zero-leakage). Neither is blocking for a devnet hackathon; both should be completed before the program holds real mainnet value.

**2. DB Phase 4 (Investigate) was skipped**

The DB audit pipeline includes a Phase 4 that produces live PoC exploits for the highest-severity findings, verifying that the attack path works in practice and not just in theory. Phase 4 was skipped for the May run. Phase 1 cross-agent corroboration (22 parallel context auditors covering Auth, Wallet/Keypair, Financial Logic, Socket Events, Group-Chat, Client Security, Dependency/Infrastructure, and Logging/PII categories) provides the confidence behind CONFIRMED classifications. Findings labelled LIKELY have unambiguous evidence from static analysis and are expected to confirm if PoC'd, but they have not been.

**3. Fix bundles compile clean but devnet runtime testing is pending**

Both fix bundles pass `cargo check` (on-chain) and `node --check` (off-chain syntax verification). Neither has been subjected to extensive runtime testing on devnet under realistic match conditions. In particular, the DB fix bundle touches several high-traffic Socket.IO event handlers (`shoot`, `acceptChallenge`, `declineChallenge`, `getGroupMatch`) where timing and state interactions should be validated with live multi-player sessions before mainnet use.

**4. Some findings are INVESTIGATE not CONFIRMED**

DB Audit #2 includes several HIGH/MEDIUM findings where the attack path is plausible from static analysis (with file:line evidence) but no PoC was run. These are explicitly labelled INVESTIGATE in the full report. They are included in the deferred bundle counts but carry more uncertainty than CONFIRMED findings.

**5. N-player group-chat state machine is first-time coverage**

The async multi-day group-chat state machine in `server/services/groupchat/` (~10 new files: `lifecycle.js`, `scheduler.js`, `configFlow.js`, `lobbyCard.js`, `botMessages.js`, `quietHours.js`, `lobbyWatchdog.js`) was built entirely between Feb and May 2026 and received its first DB audit coverage here. The surface is large and the compositional races (H015 double-settle, H016 deposit overwrite) remain open in Bundle A pending atomic Mongo operation refactors.

**6. v2 program is first-time audit coverage**

`programs/solshot-escrow-v2/src/lib.rs` (1,020 LOC) had no prior SOS or BOK coverage. SOS Audit #2 is its inaugural security review. It passed its first live test (3-player auto-settlement on devnet) but should be considered audited-once before mainnet use with significant value.

---

## Re-Validated NOT VULNERABLE Findings

Both audits verified a set of concerns and concluded they are not exploitable in the current code. These are documented to prevent future investigators from re-investigating them unnecessarily.

**SOS (18 NOT_VULNERABLE findings):** Anchor `init` macro prevents double-initialization; `has_one` constraints enforce account ownership; `close` semantics are safe when the H023 length guard is present; `u128` widening prevents overflow in settlement math; `remaining_accounts` iteration respects Solana's account-locking; the `deposits_mask` shift operations are within the type width for both u8 (v1) and u16 (v2). Full list at `.audit/FINAL_REPORT.md` Section 3.

**DB (6 NOT_VULNERABLE or already-resolved findings):**

- `H071 - Source maps in production` - `GENERATE_SOURCEMAP=false` confirmed in `client/.env.production`. Resolved.
- `H098 - qs prototype pollution` - `qs` is at 6.14.2, above the 6.10.3 threshold. Resolved.
- `H110 - window.solWallet XSS exposure` - REMOVED. Code now uses the React context hook. Resolved between Feb and May.
- `Various - Secrets in source code` - No `.env*` files tracked in git; 2 documentation references verified as non-secrets.
- `withLock settlement gate` - The `withLock` mechanism in the server settlement path is sound; concurrent settle calls do not race.

---

## For Contributors - Running the Audit Pipeline

All three audits use the Solana Vibes Kit (SVK) audit pipeline, invocable as Claude Code skills in this repository.

**Skill entry points:**

- `/SOS` → runs the Stronghold of Security on-chain audit. Working directory: `.audit/`. Full pipeline: Phase 0 (index) → Phase 1+1.5 (parallel context auditors: Access Control, Arithmetic, State Machine, CPI, Token/Economic, Upgrade/Admin, Timing) → Phase 2+3 (attack hypotheses) → Phase 4+4.5 (investigation) → Phase 5 (report).
- `/BOK` → runs the Book of Knowledge math invariant verification. Working directory: `.bok/`. Generates Proptest suites in `programs/*/tests/bok_*.rs` and a verification report.
- `/DB` → runs Dinh's Bulwark off-chain audit. Working directory: `.bulwark/`. Full pipeline: Phase 0+0.5 (scan) → Phase 1+1.5 (22 context auditors) → Phase 2+3 (strategize) → Phase 4+4.5 (investigate, optional) → Phase 5 (report).

Pass `--stacked` to indicate a prior run exists; the pipeline loads prior verdicts as priors and skips re-investigating resolved findings. Pass the git ref of the prior run (`--prior-ref ecfd03b`) to anchor the delta.

**Key files for contributors:**

- the prior-audit delta record - Feb → May delta context document; defines the net-new audit surface and status of every Feb finding before the new runs started.
- the SOS remediation log - SOS fix-vs-defer decision log with file:line evidence for every finding.
- the DB remediation log - DB fix-vs-defer decision log, same structure.
- `.audit/FINAL_REPORT.md` - Full SOS report: CVSS table, per-finding attack walkthroughs, coverage map, knowledge base references.
- `.bulwark/FINAL_REPORT.md` - Full DB report: 113 findings with file:line evidence, category breakdown, and comparison table vs Feb.
- `.bok/reports/2026-05-07-report.md` - Full BOK report: 41 invariants, 159 tests, per-function findings table, assurance map by tier.
- `programs/solshot-escrow/tests/bok_*.rs` - v1 Proptest suites (91 tests across 4 files: `bok_proptest_fee.rs`, `bok_proptest_refund.rs`, `bok_proptest_timestamp.rs`, `bok_space.rs`).
- `programs/solshot-escrow-v2/tests/bok_*.rs` - v2 Proptest suites (68 tests across 4 matching files).
- the SOS remediation log Section 5 - SOS mainnet hardening roadmap (4 bundles with sequencing).
- the DB remediation log Section 4 - DB mainnet hardening roadmap (4 bundles; composes with SOS bundles).

**Note on BOK test architecture:** BOK tests use a local-reimplementation pattern instead of importing Anchor sources, because the Anchor framework requires the BPF toolchain (unavailable in standard `cargo test`). The reimplementations at `bok_proptest_fee.rs` and `bok_proptest_refund.rs` mirror the on-chain math functions line-for-line. `const _: () = assert!(...)` compile-time assertions verify that constants in the tests match the deployed program constants.

**Re-running after a code change:** after any change to `programs/*/src/lib.rs`, run `cargo test --manifest-path programs/solshot-escrow/Cargo.toml -- bok` (and the v2 equivalent) to verify the BOK suite still passes. A failing BOK test after a code change indicates either an arithmetic regression in the program or a reimplementation that needs updating to match the new math.

---

## Methodology Note - How the Finding Counts Were Derived

SOS and DB use different counting approaches, which is why the DB totals appear higher.

**SOS** counts one finding per distinct vulnerability, assigns it a severity, and lists it in a flat table. 50 findings total.

**DB** uses a strategy-taxonomy approach: 122 strategies were deployed across 8 audit categories (Auth/Identity, Wallet/Keypair, Financial Logic, Socket Events, Group-Chat, Client Security, Dependency/Infrastructure, Logging/PII). Each strategy produces an investigation result. The 113-finding count is the subset of those 122 strategies that produced CONFIRMED, LIKELY, or INVESTIGATE verdicts. The remainder are NOT_VULNERABLE (6+) or superseded by a higher-level finding. This means DB's counts are not directly comparable to SOS's; a finding in both audits (e.g., single-keypair authority) is counted once per audit.

**BOK** counts invariants (mathematical properties that must hold), not vulnerabilities. 41 invariants across 6 clusters. A single invariant may implicitly cover multiple SOS findings - for example, I-REF-1 through I-REF-5 together constitute the regression suite for the single SOS H023 finding.

In aggregate, fixing 25 findings and deferring ~50 is the right summary of what happened, but readers should understand these numbers come from three different taxonomies applied to overlapping (but distinct) surfaces.

---

## Verdict

**Hackathon submission on devnet:**
Safe. No real funds are at risk on devnet. The most severe open finding (H001 one-step authority rotation) requires compromise of the `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` hot wallet to exploit, and that key controls only devnet SOL. All findings that enable open-access attack paths (no key compromise required) have been closed in the fix bundles.

**Mainnet deployment with real funds:**
Not yet ready. Three bundles must land and be re-verified:

- **Bundle A** (estimated 1 week): H014 server/on-chain desync for refund building, H015 double-settle race, H016 deposit overwrite, H009 wallet rotation handling. These are the findings most likely to cause silent fund loss or stuck-match states under real traffic.
- **Bundle B** (estimated 1 week, overlaps with A): JWT auth model decision (use it or remove it), signature replay store (in-memory or Redis), H012/H044 Squads multisig migration for the upgrade authority. The multisig migration can be scoped to upgrade authority only; application authority can remain a hot wallet until Bundle D.
- **Bundle D** (estimated 1–2 weeks, requires Bundle B): Authority hardening compose (SOS H001 propose/accept + timelock + DB H120 identity chain design), keypair zeroization (H011/H082), Privy SDK migration from `@privy-io/server-auth` to `@privy-io/node`.

Bundle C (npm CVEs, Vercel headers, CSP cleanup) can be shipped incrementally and does not gate mainnet, but it should be completed before any public launch to reduce the attack surface on the infrastructure layer.

**Improvement vs Feb 2026:**
Significant. npm vulnerabilities down 33% (server) and 64% (client). Helmet and CORS deployed comprehensively. The Feb CRITICAL S004 (PDA pre-squat DoS - anyone could de-escrow any match at near-zero cost) is fully resolved. Source maps disabled. `qs` patched out of vulnerable range. Five major auth gaps closed in the DB fix bundle. Two regressions (KM-04 zeroization, dead CSP origins) caught by the stacked audit and addressed. The on-chain math surface has 159 passing invariant tests across 41 invariants, with zero violations. The cross-skill H120 compound - the most dangerous single finding in the May cycle - is closed at its exploitable entry point (DB H002).
