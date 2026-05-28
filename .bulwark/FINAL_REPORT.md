# Dinh's Bulwark — Off-Chain Audit Report (Audit #3)

**Project:** SolShot (off-chain stack)
**Audit Date:** 2026-05-28
**Auditor:** Dinh's Bulwark v1.0 (delta-focused stacked audit on top of #2 DEEP-tier coverage)
**Scope:** Off-chain SolShot — Express + Socket.IO + Privy + Mongo + Telegraf bots + React + Phaser client + new mainnet operational scripts
**Audit Number:** #3 (stacked on #2 from 2026-05-07 @ `5f2acec`; #1 from 2026-02-24 @ `ecfd03b`)
**Current Ref:** `da04b5e` (v1-mainnet-rc1 + SOS N001/N002/N003 fixes landed in `fabb8e1`)

---

## 1. Executive Summary

### Overall Posture

Between audit #2 (May 7) and audit #3 (May 28), the off-chain stack has made substantial, measurable progress toward mainnet readiness. The two finding families that dominated audit #2 — "fail-open financial paths" (H013/H014/H015/H016) and "legacy unauthenticated socket events" (H018/H019/H020) — are now **substantially RESOLVED**. The identity-bridge composition family (H001+H002+H006) is **partially RESOLVED**: H001 closed cleanly via authoritative Privy `getUser` cross-check, H002 closed via 503-throw-in-production guard. But H003+H004+H006 still compose into a 5-minute wallet-auth replay window that translates directly to TG identity assumption — this is now the highest-residual-risk attack chain in the stack and is documented here as **AUTH-N02**.

New issues fall into three buckets. **First**, operational hygiene gaps around the mainnet bootstrap and deploy footprint — `client/.env.production` ships devnet program IDs alongside `REACT_APP_SOLANA_NETWORK=mainnet-beta` (CHAIN-N01), the IDL is stale w.r.t. the freshly-landed SOS N001/N002/N003 fixes (CHAIN-N02), and `migrate_config` wrappers are dead code that will fail confusingly post-N002 (CHAIN-N03). **Second**, authority-rotation operational scripts (`propose-authority-v2.mjs`, `update-config-v2.mjs`, `accept-authority-v2.mjs`, `apply-config-update-v2.mjs`) lack the confirmation guards that `init-config-mainnet.mjs` correctly applies (AUTH-N03 + CHAIN-N05). **Third**, the magic-link consume-before-link-success ordering (AUTH-N01) creates a hard-lockout primitive on link failure. Each is a small surgical fix.

The H017 self-damage `Math.abs(dmg)` pattern at `main.js:4308` (DATA-N01) is **STILL OPEN**. Severity remains CRITICAL IF `physics.processShot()` ever returns the shooter as a damage recipient with non-zero damage; MEDIUM if not. This requires a physics-side verification pass to definitively classify — flagged here as a one-liner pre-mainnet fix regardless (the cost is trivial; the upside is closing a 1v1 wagered exploit window).

Cross-skill cohesion is now strong. **SOS audit #3 (on-chain) just landed N001 (timelock guard) + N002 (migrate_config deletion) + N003 (apply_config_update pause gate)** in commit `da04b5e` per the SOS audit verdict. The on-chain side is now structurally clean for the v1-mainnet-rc1 cut. **The remaining mainnet gate is off-chain operational hygiene.** With 6 hours of focused work to land the must-fix items below, SolShot's off-chain stack reaches a mainnet-ready posture appropriate to the V1 scope (small-wager SOL only, no large bankrolls, Squads multisig at deploy).

### Comparison to Audit #2 (2026-05-07)

| Dimension | Audit #2 (May 7) | Audit #3 (May 28) |
|---|---|---|
| Methodology | DEEP-tier — 22 parallel auditors, 5 batches, 122 strategy verdicts | Standard-tier — 3 focused delta bundles (auth/identity, chain/mainnet, data/sockets/logic) |
| Files in scope | 142 / 84,270 LOC | 192 / 60,561 LOC (some prior files moved to `_archive/`; trust zones intact) |
| Verdict | "Safe for hackathon devnet, NOT safe for mainnet — Bundles A/B/D required" | **"Conditional GO — 6 off-chain must-fix items pre-mainnet, then ready"** |
| Prior CRITICAL count | 23 | **5 RESOLVED**, **1 RESOLVED_BY_REMOVAL** (SHOT pivot — H052), **~5 PARTIAL**, **~12 RECHECK** (file modified — many addressed by S2-T6/T7) |
| Prior HIGH count | 40 | Most RECHECK; specific RESOLVED: H040 (v2 retry partial), H061 (remaining_accounts order via S2-T7); RECURRENT: H003, H004, H085 |
| New CRITICAL findings | n/a | **3** (AUTH-N01 magic-link consume-before-success; AUTH-N02 H003+H004+H006 replay window composition; DATA-N01 self-damage `Math.abs` if physics returns self-entry) |
| New HIGH findings | n/a | **~7** (CHAIN-N01 client env devnet/mainnet mix; CHAIN-N02 stale IDL; CHAIN-N03 dead migrate_config; CHAIN-N04 RPC substring; AUTH-N03 propose-auth no guards; AUTH-N04 fresh PrivyClient per request; DATA-N02 NF6 PII broadcast; DATA-N03 NF8 wallet rotation incomplete uid-path; DATA-N04 NF13 settle drop no admin notify) |
| Cross-skill posture | DB+SOS combined "BLOCK MAINNET" via H120 chain (SOS deferred H001 × DB H002) | DB+SOS combined **"CONDITIONAL GO"** — SOS N001/N002/N003 landed; H120 chain broken at both legs; DB must-fix items are the remaining gate |

### Key Statistics

| Category | Count |
|---|---|
| Prior CRITICAL findings re-statused | 23 |
| Prior CRITICAL — RESOLVED | 5 (H001, H002, H009, H013, H014, H015 (verified-already), H016, H019, H020) |
| Prior CRITICAL — RESOLVED_BY_REMOVAL | 1 (H052 — SHOT off-chain pivot removed signAndBurnShot) |
| Prior CRITICAL — PARTIAL | 4 (H006 — H001 leg closed but backfill chain still possible via H003/H004; H007 — magic-link primary auth; H010 — resolved by disabling reconnect; H012 — operational via Squads) |
| Prior CRITICAL — STILL_OPEN | 5 (H003, H004, H005, H017, H018-class re-verified clean except DATA-N01) |
| Prior CRITICAL — RECHECK confirmed open | ~3 (H011 keypair zeroization unchanged; H027 deposit timer slot reuse; H037 silent settle drop) |
| Prior HIGH findings | 40 |
| Prior HIGH — RESOLVED outright | ~8 (H018/H019/H020 auth gates; H040 v2 retry partial via S2-T5a; H058/H059 sanity per S2-T7; H061 order canonicalization) |
| Prior HIGH — STILL_OPEN/RECHECK | ~25 (most unchanged file-wise; H041–H045 npm CVEs need re-audit; H049/H050/H051 RPC; H072–H075 NoSQL injection) |
| Prior MEDIUM/LOW status | Mostly carry-forward |
| **New findings (audit #3)** | **22** (3 CRITICAL, ~9 HIGH, ~7 MEDIUM, ~3 LOW) |

### Top Priority Items (Pre-Mainnet Must-Fixes)

1. **CHAIN-N01 (CRITICAL)** — Update `client/.env.production` mainnet program IDs (else every mainnet deposit TX fails at client validator).
2. **CHAIN-N02 (HIGH)** — Regenerate IDL via `anchor build` after the N001/N002/N003 fixes; copy to `server/idl/`.
3. **CHAIN-N04 (HIGH)** — Replace `/mainnet/i` substring check in `init-config-mainnet.mjs` with explicit host allowlist.
4. **AUTH-N01 (CRITICAL)** — Move magic-link `consumeLinkToken()` to AFTER `linkTelegramIdentity` success (one-liner reorder).
5. **DATA-N02 (HIGH)** — Redact other players' wallets from `escrowDepositStatus` broadcasts.
6. **DATA-N01 verification (CRITICAL pending verify)** — Confirm physics output never includes shooter as damage recipient. Otherwise replace `Math.abs(dmg)` with `if (dmg <= 0) return`.

---

## 2. Methodology

This is an **abridged, delta-focused stacked audit** building on audit #2's full DEEP-tier coverage at `.bulwark-history/2026-05-07-5f2acec/`. Instead of redeploying 22 parallel auditors, three focused delta bundles were run:

1. **Bundle 1 — Auth / Identity** (16 findings) — `privyAuth.js`, `walletLinkTokens.js`, `users.js`, `guards.js`, `auth.js`, `index.js` (link routes), `socket-io/main.js` (authenticate + backfill), `socket-io/groupchat.js` (tgIdFor), `arcadeSession.js`, magic-link mint, mainnet bootstrap scripts.
2. **Bundle 2 — Chain / Mainnet Ops** (18 findings) — `escrow-v2.js`, `escrow.js`, `solana.js`, `keys.js`, all mainnet operational scripts, `WalletContext.js`, `solshot_escrow_v2.json` IDL, `client/.env.production`.
3. **Bundle 3 — Data / Sockets / Logic / Err** (22 findings) — `socket-io/main.js` (5,198 LOC of 51 socket handlers), `User.js`/`FunnelEvent.js` models, `funnel.js`, `admin` routes, destructive operational scripts.

Trade-off: less breadth (vs 22 auditors) but more depth-per-bundle. Cross-bundle handoffs were captured explicitly in each condensed summary's "Cross-Focus Handoffs" section. The synthesizer de-duplicates findings flagged by multiple bundles (e.g., AUTH-N02 ↔ NF10 self-damage ↔ H017; CHAIN-N04 ↔ AUTH-N14 RPC substring; AUTH-N03 ↔ CHAIN-N05 script guards).

**Phases executed:** Phase 0 (scan + INDEX), Phase 1+1.5 (parallel bundle auditors), Phase 5 (this synthesis). Strategize/Investigate/Coverage phases compressed because bundle auditors provided file:line evidence + status verdicts in-band.

---

## 3. Prior Finding Status (Audit #2 → Audit #3)

Sorted by prior severity, then prior ID. Lineage to audit #1 noted where relevant.

### CRITICAL (23 prior)

| Audit #2 ID | Title | Status | Justification |
|---|---|---|---|
| **H001** | Privy/TG bridge: unverified `telegramUserId` | **RESOLVED** | `server/index.js:649-694` now calls `client.getUser(privyUserId)`, extracts `linkedAccounts[type='telegram'].telegramUserId`, rejects with 403 `tg_id_mismatch` if it differs from body. Privy lookup failure returns 502. Three trust checks layered (Privy JWT verify → `isPrivyAuthConfigured` 503 gate → `getUser` cross-check). |
| **H002** | `requirePrivyAuth({required:true})` no-op when secret missing | **RESOLVED (with caveat)** | `server/services/privyAuth.js:88-104` returns **503 `auth_not_configured`** in production when `getClient()` returns null + `required:true`. Bug-7 (`590d9d6`) separately closed the env-mismatch root cause. **Caveat:** dev fall-through sets `req.privyAuth = null` and continues — acceptable IFF Render env has `NODE_ENV=production` (confirmed per render.yaml). |
| **H003** | JWT generated but never verified server-side | **STILL_OPEN (RECURRENT from #1 H029)** | `server/middleware/auth.js` unchanged. `generateToken()` mints a JWT shipped to client via `authResult`; no `verifyToken` import or middleware anywhere. Auth is purely `client.isAuthenticated` boolean. JWT is decorative. |
| **H004** | Auth signature 5-min replay window | **STILL_OPEN (RECURRENT from #1 C-6)** | `auth.js:75-88` `verifyAuthMessage` checks timestamp only; no replay store. Same `{walletAddress, message, signature, timestamp}` payload reusable on new socket within 5 minutes — the entry vector for AUTH-N02. |
| **H005** | `tgIdFor()` NODE_ENV fallback impersonation | **STILL_OPEN** | `groupchat.js:72-78` still has `if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) return payload.telegramUserId`. Negative-of-production pattern — silently enables impersonation if NODE_ENV is unset, misspelled, or set to "staging". |
| **H006** | TG identity backfill bridges auth tiers | **PARTIAL** | `main.js:1582-1588` backfill unchanged. Audit #2 recommended `telegramUserSource` tagging — NOT applied. H001 fix neutered one leg (`link-from-privy-telegram` is no longer a binding primitive), but the residual chain (H003/H004 wallet replay → H006 backfill) is the new entry. |
| **H007** | `link-from-tg-token` soft Privy JWT | **PARTIAL** | `index.js:582` still uses `requirePrivyAuth({required:false})`. Magic-link CSPRNG token (32-byte one-shot, 10-min TTL, TG-DM delivered) IS the primary auth. Threat model bounded by TG account compromise. Reasonable to downgrade severity. |
| **H008** | Composed H001+H006 takeover chain | **PARTIAL** | H001 leg closed; composition now requires wallet auth replay (H003+H004) as new entry. Materially harder, but composes — see AUTH-N02. |
| **H009** | Wallet rotation gap (DB never updates) | **RESOLVED** | S2-T6 atomic helper `users.js:41-103` `updateWalletForTgUser` with idempotency check + conflict check + `findOneAndUpdate($set + $push)`. `walletAddress` unique-sparse index per `User.js:4-9` provides write-side race protection. Caveat: NF8 below — Step 3 uid-keyed path doesn't call the helper. |
| **H010** | Reconnect remap copies stale wallet entry | **RESOLVED (by reconnect disabled)** | `rejoinRoom` handler early-returns at `main.js:2108` per HOT_SPOTS line 484. No stale-wallet copy possible. **Reopens automatically if reconnect re-enabled.** |
| **H011** | Escrow keypair unzeroized in process memory | **STILL_OPEN (RECURRENT)** | `server/services/keys.js:54-64` not in delta. The web3.js aliasing issue documented in comment block. Mainnet init script exposure window is shorter (~10s), but long-running server keypair stays live for process lifetime. |
| **H012** | Single keypair = upgrade + application authority | **CARRY-FORWARD (operational)** | Bundle 1 Anchor changes (S2-T1) added propose_authority + 24h timelock — the rotation primitive. Mainnet deploy plan is Squads multisig for both upgrade authority AND `config.authority`. Operational, not code. |
| **H013** | `refundWager()` fails-open on cancel CPI throw | **RESOLVED** | `server/services/solana.js:281-324` (S2-T7). All three error paths handled (cancelFn success/false, cancelFn throw, escrow disabled). Caller propagates failure to `handleSettlementFailure` chain. |
| **H014** | H023 server-side desync | **RESOLVED for v2 / STILL_OPEN for v1 retry queue** | v2 path (S2-T7) fetches on-chain `depositsMask` FIRST, derives `refundTargets` from set bits, builds `remainingAccounts` from on-chain truth. Caller-supplied list kept as warning-only sanity check. **V1 retry queue at `main.js:562-591` still uses caller-supplied `data.depositorWallets`** — bounded by v1=1v1-only scope at V1 launch. |
| **H015** | Group-chat double-settle race | **RESOLVED** | Two-layer guard: `transitionState(ms, MATCH_STATES.SETTLING)` CAS at `main.js:4504` blocks duplicates before lock; `withLock('settle:...')` + inner re-check at `:4512-4514` blocks late entrants. S2-T7 commit verified "already protected." |
| **H016** | `confirmDeposit` last-depositor doc overwrite race | **RESOLVED** | Idempotent guard at `main.js:3898-3901` (`if (ws.deposits?.[client.id]) return`) blocks duplicates BEFORE RPC fetch + state mutation. On-chain v2 program intrinsically idempotent. |
| **H017** | Self-damage `Math.abs(dmg)` sign-erasure (1v1) | **STILL_OPEN** | `main.js:4308` unchanged: `ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))`. Severity depends on whether `physics.processShot()` ever returns a damage entry for the shooter. **Flagged as DATA-N01 — requires physics-side verification.** |
| **H018** | `shoot` legacy relay no auth | **RESOLVED** | `main.js:3841-3868` — `requireAuth` at 3842, currentTurn check at 3850 (spectator-spoof protection). |
| **H019** | `acceptChallenge`/`declineChallenge` no auth | **RESOLVED** | `main.js:3719-3736` (accept) + `:3738-3749` (decline) — `requireAuth` calls with named "H019 fix" comments. |
| **H020** | `clientDebugLog` unauthenticated | **RESOLVED** | `main.js:1656-1674` — `if (!client.isAuthenticated) return` at 1661, named "H020 fix". |
| **H022** | `getGroupMatch` no auth | **OUT OF SCOPE this bundle** (groupchat.js not in Bundle 3 delta); HANDOVER flagged as RECHECK. Carry-forward STILL_OPEN unless explicitly addressed by groupchat.js modifications. |
| **H027** | `depositTimers` slot reuse (5min vs 30sec) | **RECHECK STILL_OPEN** | Not addressed in delta commits. Code comment in audit #2 acknowledged "Pitfall 1." |
| **H030** | `escrowDepositStatus` PII cross-broadcast | **STILL_OPEN** | `main.js:3966-3975` still broadcasts every player's wallet to every other room player. Flagged here as DATA-N02 (high-priority must-fix). |
| **H031** | `DebugAuthOverlay` in production | **RECHECK STILL_OPEN** | `DebugAuthOverlay.js` not in delta listing; likely still bundled. App.js +40 LOC but no explicit gate confirmed. |
| **H037** | `failedSettlements` silent drop after 5 retries | **STILL_OPEN** | `main.js:562-591` still has `failedSettlements.delete(matchId)` after 5 attempts. `adminNotifications.js` service exists but NOT wired into the drop path. Flagged as DATA-N04. |
| **H120** | Cross-skill coup: SOS deferred H001 + DB H002 | **RESOLVED** | Both legs closed: SOS H001 closed by S2-T1 propose_authority + 24h timelock (`e48b6b5`, plus N001 in `da04b5e`); DB H002 closed by Bug-4 + Bug-7 + privyAuth.js 503 guard. The H120 chain is broken at both anchor points. |

### HIGH (40 prior) — summary

Of the 40 audit #2 HIGHs, status pattern:
- **RESOLVED (~8):** H040 (v2 retry partial via S2-T5a), H061 (remaining_accounts order canonicalization via S2-T7), H058 / H059 (sanity per S2-T7 on-chain mask source-of-truth), H021 (groupShopComplete RECHECK with Bundle 2), H023 (challenge/cancel — RECHECK)
- **STILL_OPEN / RECHECK file-shifted (~25):** H024-H026, H028-H029, H032-H036, H038-H039, H041-H045 (npm CVEs need fresh audit), H049-H053 (RPC layer; H052 RESOLVED_BY_REMOVAL with SHOT pivot), H054 (TELEGRAM_BOT_TOKEN re-verify on render.yaml), H055-H057 (TG bot rate-limit), H062-H075 (DB/Mongoose injection), H083 (admin-key timing — likely RESOLVED via `crypto.timingSafeEqual` per Bundle 1), H086 (physics amplification), H089-H090 (RNG)
- **RESOLVED_BY_REMOVAL (1):** H052 (signAndBurnShot removed per SHOT off-chain pivot S2-T3/T4)

The full re-statusing of all 40 HIGHs would require the breadth of audit #2's 22-auditor sweep. This audit selected the highest-impact items per bundle.

---

## 4. New Findings (Audit #3)

De-duplicated across the three bundles. Bundle origin noted in "Aliases" where multiple bundles flagged the same root issue.

### AUTH-N01 (CRITICAL) — Magic-link consume-before-link-success

- **Severity:** CRITICAL (account lockout primitive; gates wallet binding on fragile non-atomic sequence)
- **Aliases:** Bundle 1 AUTH-N01
- **Location:** `server/index.js:597-619` (consumeLinkToken before linkTelegramIdentity)
- **Description:** `consumeLinkToken(token)` is called BEFORE `linkTelegramIdentity` succeeds. If the link fails (Mongo error, wallet shape rejection, conflict in helper), the token is GONE — user cannot retry. With S1-T3 client-side retry on 5xx, the client hammers the endpoint for tokens that no longer exist (404 `token_invalid_or_expired`) and never recovers.
- **Attack scenario:** User opens `/play`, gets magic-link DM, clicks. Network blip mid-link. Server consumes token, link fails. User is permanently unable to bind via this token. Must request a new link via TG. Bug, not exploit — but lockout-class.
- **Recommendation:** Reorder so `consumeLinkToken` is called only AFTER `linkTelegramIdentity` returns `{ ok: true }`. Two-liner reorder.
- **Fix complexity:** One-liner reorder.

### AUTH-N02 (CRITICAL) — H003+H004+H006 5-minute identity-replay window composition

- **Severity:** CRITICAL — the highest-residual-risk attack chain in the off-chain stack
- **Aliases:** Bundle 1 AUTH-N02; composes prior H003, H004, H006
- **Location:** `server/middleware/auth.js:75-88` (no replay store) + `server/socket-io/main.js:1582-1588` (TG identity backfill)
- **Description:** Three legacy CRITICALs compose: wallet-signature auth has no JWT verify (H003) AND no replay store (H004), so any captured `{walletAddress, message, signature, timestamp}` payload is replayable for 5 minutes on a fresh socket. Once replayed, the `authenticate` handler backfills `client.telegramUser.id` from the User doc (H006), giving the attacker the victim's TG identity for all group-chat operations (`tgIdFor()` returns the backfilled value). **Single-vector replay → TG identity takeover.**
- **Attack scenario:**
  1. Attacker captures one signed auth payload from a victim's session (MITM during connection, log scrape, etc.).
  2. Within 5 minutes, connect a fresh socket to the server.
  3. Emit `authenticate` with the captured `{walletAddress, message, signature, timestamp}`.
  4. `verifyAuthMessage` accepts (timestamp valid, signature valid, no replay store rejects).
  5. `handleAuthenticate` sets `client.isAuthenticated = true` and emits authResult.
  6. Backfill at `main.js:1582-1588` reads `User.findOne({walletAddress})`, finds victim's `telegramUserId`, sets `client.telegramUser = {id: victim_tg_id}`.
  7. Attacker now passes `tgIdFor()` as the victim for all group-chat operations on this socket.
- **Recommendation:** Close ANY ONE of three legs:
  - **(a)** Maintain in-memory `Set<signature>` with 5-minute TTL replay store. ~30 LOC. **Trivial fix — closes the chain.**
  - **(b)** Verify JWT on every state-mutating event (close H003) — restore `verifyToken` middleware or remove `generateToken` to make the model honest.
  - **(c)** Tag `telegramUserSource: 'tg-hmac' | 'wallet-backfill'` (close H006); require HMAC source for high-trust ops.
- **Fix complexity:** (a) is the lowest-risk fix at ~30 LOC. Per the V1 mainnet scope (small-wager only), launching without (a) is a documented risk-acceptance — but capping wager tiers should be tied to this gap explicitly in `Docs/internal/REMEDIATION_DECISIONS.md`.

### AUTH-N03 (CRITICAL/HIGH) — `propose-authority-v2.mjs` no safety guards

- **Severity:** CRITICAL on operator-compromised machine; HIGH otherwise
- **Aliases:** Bundle 1 AUTH-N03; Bundle 2 F-CHAIN-NEW-07 (same root, broader script set)
- **Location:** `server/scripts/propose-authority-v2.mjs:1-51`
- **Description:** Script accepts `NEW_AUTHORITY` env var and immediately calls `proposeAuthorityV2(NEW_AUTHORITY)`. NO `--confirm`, NO `INIT_MAINNET_CONFIRM`-style gate, NO `/mainnet/i.test(RPC)` check, NO dry-run mode. The script also overwrites previous proposals without warning. Compared to `init-config-mainnet.mjs` which has 4 distinct guards, the propose script is bare.
- **Attack scenario:** Operator with `SOLANA_RPC` pointing at mainnet runs the script with a typo or attacker-staged env (`NEW_AUTHORITY=<attacker pubkey>`). Single command sends a real propose TX on mainnet. The on-chain `accept_authority` is non-destructive and gated on the new authority's signature, so single propose alone doesn't drain — but the proposal lands on-chain mempool, observable, and operator-panic-inducing.
- **Recommendation:** Add `--confirm PROPOSE_AUTHORITY_CONFIRM=I_UNDERSTAND_AUTHORITY_ROTATION` gate. Add `/mainnet/i` cluster check (or use the host-allowlist from CHAIN-N04 fix). Add dry-run mode that prints proposed `new_authority`, current state, and "next step required: accept-authority-v2.mjs" message.
- **Fix complexity:** Surgical (~20 LOC mirroring `init-config-mainnet.mjs` pattern).

### CHAIN-N01 (CRITICAL) — `client/.env.production` ships devnet program IDs with `mainnet-beta` network

- **Severity:** CRITICAL (every mainnet deposit TX fails on client-side validator OR signs against non-existent program)
- **Aliases:** Bundle 2 F-CHAIN-NEW-01
- **Location:** `client/.env.production:9-15`
- **Description:**
  ```ini
  REACT_APP_SOLANA_NETWORK=mainnet-beta
  REACT_APP_ESCROW_PROGRAM_ID=4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1  # ← devnet v1
  REACT_APP_ESCROW_V2_PROGRAM_ID=BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N  # ← devnet v2
  REACT_APP_SHOT_TOKEN_MINT=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd  # ← orphaned devnet SHOT mint
  ```
  Combined with `REACT_APP_SOLANA_NETWORK=mainnet-beta`, `WalletContext.js:51` routes Privy signing to `solana:mainnet`. The TX validator `validateEscrowTransaction` (line 112) builds `ALLOWED_ESCROW_PROGRAM_IDS` from the devnet IDs. Server-built TX targets mainnet program ID (from server `ESCROW_PROGRAM_ID_V2` env); client validator rejects with "Unexpected program."
- **Attack scenario:** Not an attack — a launch-failure mode. At first mainnet deposit attempt, every TX fails at client validator with confusing error. User retries, server retries, build-up of failed states.
- **Recommendation:** Before mainnet flip, update `client/.env.production`:
  - `REACT_APP_ESCROW_PROGRAM_ID=<mainnet v1 ID>` (or remove if v1 not deployed)
  - `REACT_APP_ESCROW_V2_PROGRAM_ID=<mainnet v2 ID>` (matches deployed program)
  - Remove `REACT_APP_SHOT_TOKEN_MINT` entirely (SHOT is off-chain in V3)
  - Add `REACT_APP_SOLANA_RPC=<mainnet RPC URL>` to avoid public-tier rate limits
  - Add CI guard: if `REACT_APP_SOLANA_NETWORK=mainnet-beta`, assert program IDs NOT in devnet const list.
  - **Verify Vercel project env vars** — Vercel may not auto-load `.env.production`; per-project env values may already be correct in Vercel dashboard. Reconcile before flip.
- **Fix complexity:** Config update + 1 CI check.

### CHAIN-N02 (HIGH) — IDL `solshot_escrow_v2.json` still declares `migrate_config` post SOS N002 fix

- **Severity:** HIGH (silent misdeserialize potential; confusing operator errors on migrate-config invocation)
- **Aliases:** Bundle 2 F-CHAIN-NEW-02
- **Location:** `server/idl/solshot_escrow_v2.json:414`
- **Description:** SOS audit #3 N002 fix removed `migrate_config` instruction from `programs/solshot-escrow-v2/src/lib.rs:186` ("migrate_config instruction removed."), but `server/idl/solshot_escrow_v2.json` still declares the discriminator + args + accounts. The IDL is the off-chain client's view of the on-chain program. Anchor uses it to (a) derive discriminators, (b) auto-resolve PDA accounts, (c) deserialize fetched account data.
- **Symptoms:**
  - `migrateConfigV2()` wrapper builds TX with stale discriminator → on-chain `InstructionFallbackNotFound`.
  - `program.account.globalConfig.fetch(configPDA)` — IF GlobalConfig struct layout changed during N001/N002/N003 cycle, deserialize could misread fields. (Layout appears unchanged per SOS audit, but brittle.)
- **Recommendation:** Run `anchor build`; copy `target/idl/solshot_escrow_v2.json` to `server/idl/`. Add as V1 launch checklist gate. **CI script:** `diff target/idl/solshot_escrow_v2.json server/idl/solshot_escrow_v2.json` fails on diff.
- **Fix complexity:** One command + CI guard.

### CHAIN-N03 (HIGH) — Dead-code `migrateConfigV2()` + `migrate-config-v2.mjs`

- **Severity:** HIGH (operator-confusion vector; bytecode hygiene)
- **Aliases:** Bundle 2 F-CHAIN-NEW-03
- **Location:** `server/services/escrow-v2.js:216-229` + `server/scripts/migrate-config-v2.mjs` (entire file)
- **Description:** Both are dead code per SOS N002 (on-chain instruction deleted). Script docstring confidently states "Idempotent — re-running on already-migrated PDA is a no-op" — TRUE before N002, FALSE after. Running now will fail with Anchor `InstructionFallbackNotFound`, which an operator may misdiagnose as "config missing" and trigger `init-config-mainnet.mjs` (which has its own idempotency gate, so escalation is bounded — but minutes wasted).
- **Recommendation:** Delete `migrateConfigV2()` from escrow-v2.js. Delete `server/scripts/migrate-config-v2.mjs`. Add a 1-line comment in `lib.rs` near the N002 removal site referencing the off-chain deletion commit. The IDL block disappears automatically after CHAIN-N02 regen.
- **Fix complexity:** Surgical (2 deletions, 1 comment).

### CHAIN-N04 (HIGH) — `init-config-mainnet.mjs` RPC validation is substring match

- **Severity:** HIGH (operator-compromise amplifier)
- **Aliases:** Bundle 1 AUTH-N14 (LOW classification); Bundle 2 F-CHAIN-NEW-04 (HIGH). Synthesizer calibrates to HIGH — the script writes irreversible state to whatever RPC the env points at.
- **Location:** `server/scripts/init-config-mainnet.mjs:77`
- **Description:** `if (!/mainnet/i.test(RPC)) fail(...)` accepts ANY URL containing "mainnet" substring. Passes:
  - `https://my-spoof-mainnet.attacker.com` ✓ (UNINTENDED)
  - `https://api.devnet-mainnet-test.example.com` ✓ (UNINTENDED)
  - `http://localhost:8899/mainnet` ✓ (UNINTENDED)
- **Attack scenario:** Operator-machine-compromise → attacker pre-stages malicious DNS resolution OR modifies env `SOLANA_RPC` to point at attacker RPC. Init-config-mainnet sends the real TX to attacker RPC. Attacker returns spoofed state on the post-init verification fetch (`getConfigStateV2()`), so operator sees green checkmarks. Real mainnet config never initialized; attacker owns the authority slot.
- **Recommendation:** Replace with explicit allowlist:
  ```js
  const url = new URL(RPC);
  const MAINNET_HOSTS = ['api.mainnet-beta.solana.com', 'solana-api.projectserum.com'];
  const MAINNET_SUFFIXES = ['.helius-rpc.com', '.quiknode.pro', '.alchemy.com'];
  if (!MAINNET_HOSTS.includes(url.host) && !MAINNET_SUFFIXES.some(s => url.host.endsWith(s))) {
      fail(`SOLANA_RPC host "${url.host}" not in mainnet allowlist`);
  }
  ```
- **Fix complexity:** Surgical (~10 LOC).

### CHAIN-N05 (MEDIUM) — Operational scripts lack confirmation env-var gates

- **Severity:** MEDIUM
- **Aliases:** Bundle 2 F-CHAIN-NEW-07 (partial overlap with AUTH-N03)
- **Location:** `server/scripts/{propose-authority-v2,accept-authority-v2,update-config-v2,apply-config-update-v2}.mjs`
- **Description:** `init-config-mainnet.mjs` correctly requires `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE`. The other operational scripts lack this guard. They send the TX immediately on first invocation.
- **Recommendation:** Standardize on `<SCRIPT>_CONFIRM=I_UNDERSTAND_THIS_IS_REAL` env-var pattern. Provide dry-run output showing pre-state + proposed change.
- **Fix complexity:** Surgical (~10 LOC per script).

### DATA-N01 (CRITICAL pending verification) — H017 self-damage `Math.abs(dmg)` STILL PRESENT

- **Severity:** CRITICAL IF physics returns shooter as damage recipient with non-zero damage; MEDIUM if not
- **Aliases:** Bundle 3 NF10; identical to prior H017
- **Location:** `server/socket-io/main.js:4308`
- **Description:**
  ```js
  ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))
  ```
  Code path UNCHANGED since audit #2. The `for (playerId, dmg of damageEntries)` loop gates `playerId !== this.id` ONLY for kill-tracking (line 4310) — but NOT for the HP deduction at 4308. So self-damage `dmg > 0` IS applied. `Math.abs` would also erase the sign of any negative-damage case where physics intends to no-op/heal.
- **Attack scenario:** In a 1v1 BO1 wagered match, a player who can trigger `result.damage[shooter.id] = 250` self-eliminates → opponent wins the wager. Useful for collusion or accidental self-grief.
- **Verification step:** Read `server/services/physics.js` `processShot()`. If the output shape never includes the shooter as a damage recipient (which is the apparent design intent per audit #2's note "physics returns negative for self-hits to indicate ignore"), then **the `Math.abs` makes the code WRONG: a negative-damage signal from physics would be flipped to positive damage**. Either way, the fix is the same.
- **Recommendation:**
  ```js
  if (!Number.isFinite(dmg) || dmg <= 0) continue;  // skip self-damage / heal / ignore signals
  ms.hp[playerId] = Math.max(0, ms.hp[playerId] - dmg);
  ```
  Matching the group-chat treatment confirmed clean per audit #2 LOGIC-02.
- **Fix complexity:** One-liner.

### DATA-N02 (HIGH) — `escrowDepositStatus` broadcasts every player's wallet to every other player

- **Severity:** HIGH (identity-linkage; compounds with AUTH-N02 + H068 cross-log linkage)
- **Aliases:** Bundle 3 NF6; carry-forward of H030
- **Location:** `server/socket-io/main.js:3966-3975`
- **Description:** Every wallet in the room is broadcast to every player on every deposit confirm:
  ```js
  io.sockets.in(rid).emit('escrowDepositStatus', {
      deposits: room.players.map(p => ({
          socketId: p.socketId,
          wallet: ws.wallets?.[p.socketId] || null,  // ← every player's wallet visible to every other
          confirmed: !!(ws.deposits?.[p.socketId]),
      })),
      ...
  })
  ```
  Wallet addresses are public on-chain but the server-side broadcast enables real-time cross-correlation between socketIds, TG handles (via leaderboard/challenge UX), and wallets. An attacker joining a single match harvests every co-participant's wallet.
- **Recommendation:** Per-recipient projection: send only the recipient's own wallet + booleans for others' deposit status.
  ```js
  client.emit('escrowDepositStatus', {
      yourWallet: ws.wallets?.[client.id] || null,
      yourConfirmed: !!(ws.deposits?.[client.id]),
      othersConfirmed: room.players
          .filter(p => p.socketId !== client.id)
          .map(p => ({ confirmed: !!(ws.deposits?.[p.socketId]) })),
      numDeposited: Object.keys(ws.deposits || {}).length,
      totalPlayers: room.players.length,
  });
  ```
- **Fix complexity:** Surgical (~15 LOC change in the emit block; iterate per-socket instead of room broadcast).

### DATA-N03 (HIGH) — `linkTelegramIdentity` Step 3 uid-keyed path doesn't use `updateWalletForTgUser`

- **Severity:** HIGH (silent partial regression of H009)
- **Aliases:** Bundle 3 NF8
- **Location:** `server/services/users.js:251-282`
- **Description:** S2-T6 wallet rotation helper is correctly wired at Step 1 (line 216 — TG-keyed doc with different wallet). BUT:
  - **Step 2 (line 251-261)**: TG-keyed doc absent, wallet-keyed doc present. Just adds TG ID to wallet doc. No rotation. **OK.**
  - **Step 3 (line 264-282)**: TG + wallet docs absent, uid-keyed doc present. `if (walletAddress && !existingByUid.walletAddress)` — adds wallet only if doc has none. **If `existingByUid` ALREADY has a wallet AND a new wallet is provided AND it's different, the new one is silently dropped.** Same H009 pattern reintroduced via uid-first user flow.
- **Attack scenario:** User registers browser-first (uid-only). Server records their wallet at registration. User then opens TG Mini App, authenticates Privy, and re-emits identity with a Privy-rotated wallet. The rotation is silently dropped. Future settlements go to stale wallet.
- **Recommendation:** In Step 3, when `existingByUid.walletAddress !== walletAddress && walletAddress`, call `updateWalletForTgUser(telegramUserId, walletAddress, 'linkTelegramIdentity-uid-path')` to handle the rotation atomically.
- **Fix complexity:** Surgical (~5 LOC).

### DATA-N04 (MEDIUM-HIGH) — `failedSettlements` 5-retry silent drop + `adminNotifications` not wired

- **Severity:** MEDIUM-HIGH (mainnet operational risk: funds stranded with no operator alert)
- **Aliases:** Bundle 3 NF13; carry-forward of H037
- **Location:** `server/socket-io/main.js:562-591`
- **Description:** After 5 retries (~5 mins), the match's settlement attempt is dropped from in-memory map. `adminNotifications.js` service exists per HANDOVER but is NOT wired into the drop path — no Telegram alert, no PagerDuty, no `Feedback` doc persistence. Render restart loses the entire `failedSettlements` Map.
- **Path forward post-drop:** v2 program's `permissionless_reclaim` after 1200s does eventually let depositors recover, BUT the server never tells the user this happened, and ops has no actionable alert.
- **Recommendation (in priority order):**
  - Wire `adminNotifications.notify({severity:'high', kind:'settlement_drop', matchId, depositorWallets, lastError})` BEFORE `failedSettlements.delete()`.
  - Persist failed-settlement to a `StrandedSettlement` Mongo collection so process restart doesn't lose state.
  - Emit a server-side `matchSettlementStranded` event so client UI shows "Funds reclaimable in 24h via /api/reclaim/:matchId".
  - Add `/api/admin/stranded` endpoint to list pending recoveries.
- **Fix complexity:** Surgical for the notify wire (one call), architectural for persistence (~50 LOC + new model).

### DATA-N05 (MEDIUM) — `rooms`/`wagerStates`/`matchStates` not persisted; Render restart strands escrow

- **Severity:** MEDIUM (mainnet operational risk during Render auto-redeploy or hibernate cycle)
- **Aliases:** Bundle 3 NF17
- **Location:** `server/socket-io/main.js:179-180` (module-level in-memory state)
- **Description:** `wagerStates`, `matchStates`, `rooms`, `authenticatedWallets`, `failedSettlements`, `depositTimers`, `turnTimers` are all in-memory. Render deploys auto-trigger from `main` (~1/week) lose every in-flight match. For v2 matches the on-chain state survives — `permissionless_reclaim` after 1200s recovers — but the server forgets it created the escrow, can't re-fire `escrowActive` to re-enter battle. User sees match disappear + stranded deposit.
- **Recommendation:** At server boot, scan Mongo `Match` collection for `status: 'active'` rows; call `restoreRoom()` (helper exists per HANDOVER). Persist `wagerStates`, `matchStates`, `depositTimers` end-time to Mongo on every mutation so restart can recreate timers.
- **Fix complexity:** Architectural — separate from V1 launch list, plan for V1.1 hardening.

### AUTH-N04 (HIGH) — Fresh PrivyClient per `link-from-privy-telegram` request

- **Severity:** HIGH (DOS amplification + Privy rate-cap hit risk)
- **Aliases:** Bundle 1 AUTH-N04
- **Location:** `server/index.js:672-686`
- **Description:** `new privyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET)` instantiated on every incoming request. New HTTPS connection pool + Privy SDK init per request. At scale or under brute-force, multiplies socket count to Privy + amplifies per-request cost.
- **Recommendation:** Hoist a module-level `_lookupClient` singleton and reuse (mirror the `getClient()` pattern from `privyAuth.js`).
- **Fix complexity:** Surgical (~5 LOC).

### AUTH-N05 (HIGH) — Admin endpoints share global 100 req/15min rate-limit

- **Severity:** HIGH (design pattern concern; brute-force surface)
- **Aliases:** Bundle 1 AUTH-N05
- **Location:** `server/index.js:238-245`; admin routes `/api/admin/funnel`, `/api/admin/truncate-handles`, `/api/admin/reload-keys`, `/stats`
- **Description:** Global `httpLimiter` (100 req/15min) is the ONLY budget for admin endpoints. Brute-force budget against `requireAdminKey` shares the user's own page-load budget. The 32-char hex key would take ~3500 years to brute-force at 100/15min, but the design pattern is wrong — admin endpoints should have a dedicated low-budget bucket (e.g., 20/h).
- **Recommendation:** Dedicated `adminLimiter` middleware for `/api/admin/*`.
- **Fix complexity:** One-liner (express-rate-limit instance + mount).

### AUTH-N06 (HIGH) — Arcade session JWT no audience claim

- **Severity:** HIGH (cross-game token reuse if secret leaks via Render dashboard)
- **Aliases:** Bundle 1 AUTH-N06
- **Location:** `server/services/arcadeSession.js:71-113`
- **Description:** JWT issued with `{ uid, wa, tg, h }` carries issuer `arcade:session-handoff` and TTL 10m. Verification checks issuer + algorithm but no audience. Per-game secrets (`BASKETBALL_LEADERBOARD_SECRET` vs `KEEPIE_UPPIES_LEADERBOARD_SECRET` vs `ARCADE_SESSION_SECRET`) prevent cross-secret forgery, BUT if any single secret leaks (Render dashboard compromise), attacker can mint JWTs with arbitrary `uid` accepted by SolShot's `/api/arcade/session-validate`.
- **Recommendation:** Add `aud` claim per-game (e.g., `aud: 'basketball.leaderboard'`); verify on each game's standalone leaderboard. Document per-game secret rotation procedure.
- **Fix complexity:** Surgical (claim + verify update across 3 standalone leaderboards).

### AUTH-N07 (HIGH) — Broken `require('crypto')` in ESM standalone leaderboard dev fallback

- **Severity:** HIGH (dev mode broken; silent failure)
- **Aliases:** Bundle 1 AUTH-N07
- **Location:** `server/services/games/basketball-standalone/standaloneLeaderboard.js:54` (and 2 sibling files)
- **Description:** `process.env._BASKETBALL_DEV_SECRET = require('crypto').randomBytes(32).toString('hex')` in an ESM module. `require` is undefined in ESM strict mode — throws `ReferenceError` if path runs (NODE_ENV !== 'production' AND `BASKETBALL_LEADERBOARD_SECRET` unset). Production not affected (env is set), but dev fallback is broken silently. Same pattern in keepie-uppies-standalone + free-kicks-standalone.
- **Recommendation:** Import `crypto` at top of file (mirror `arcadeSession.js` pattern).
- **Fix complexity:** One-line import per file (× 3 files).

### Additional findings (MEDIUM/LOW, consolidated)

| ID | Aliases | Severity | Title | Location | One-line fix |
|---|---|---|---|---|---|
| **DATA-N06** | NF2 | MEDIUM | `wipe-user.mjs` unbounded regex needle | `scripts/wipe-user.mjs:35-37` | Require `needle.length >= 3` + hard cap matches > 50 |
| **DATA-N07** | NF5 | MEDIUM | `dedupe-funnel-oneshots.mjs` no confirmation guard | `scripts/dedupe-funnel-oneshots.mjs` | Add `FUNNEL_DEDUPE_CONFIRM=YES` env gate |
| **DATA-N08** | NF9 | MEDIUM | `updateWalletForTgUser` TOCTOU on concurrent rotations | `users.js:64-90` | Catch E11000, return `wallet_belongs_to_other_user` |
| **AUTH-N08** | AUTH-N10 (orig MED) | MEDIUM | Orphan-consume race in `linkTelegramIdentity` | `users.js:177-198` | Only delete orphan if recently-created (<60s) |
| **AUTH-N09** | NF7 + AUTH-N09 (orig MED) | MEDIUM | `walletHistory[]` unbounded growth | `User.js:16-23` + `users.js:80-84` | Cap at 50 entries via `$slice: -50` in `$push` |
| **AUTH-N10** | AUTH-N11 (orig MED) | MEDIUM | `link-from-privy-telegram` no Privy lookup cache | `index.js:676-686` | Cache `getUser` by Privy DID with 30s TTL |
| **DATA-N09** | NF11 | LOW | `escrowDepositConfirm` logs full TX signature | `main.js:3979` | Truncate to first 16 chars in log |
| **DATA-N10** | NF12 | LOW | `clientDebugLog` 2KB payload — log-spam DoS | `main.js:1656-1674` | Drop in production via NODE_ENV gate at handler-attach |
| **DATA-N11** | NF18 | LOW | Multiple `findOneAndUpdate` calls missing `runValidators:true` | `main.js:1720-1724` + sweep | Add `{runValidators: true}` per call |
| **CHAIN-N06** | F-CHAIN-NEW-05 | HIGH | No server↔client cluster handshake | server `index.js` + `WalletContext.js:44-51` | Emit `serverHello {network, programId}` on socket connect; client refuses sign on mismatch |
| **CHAIN-N07** | F-CHAIN-NEW-06 | MEDIUM | V1 refund retry queue still uses caller list | `main.js:562-591` + `escrow.js:439-475` | Update v1 `cancelMatchEscrow` to derive from on-chain mask (mirror S2-T7 v2 pattern) |
| **CHAIN-N08** | F-CHAIN-NEW-08 | MEDIUM | Operational script explorer URLs hardcoded `?cluster=devnet` | `propose/accept/apply-config-v2.mjs` | Shared `explorerUrl(sig)` helper based on RPC host |
| **CHAIN-N09** | F-CHAIN-NEW-09 | MEDIUM | `recover-stuck-v2.mjs` hardcodes one match's data | `scripts/recover-stuck-v2.mjs:23-30` | Rename file with match ID suffix OR refactor to env-gated tool |
| **CHAIN-N10** | F-CHAIN-NEW-12 | LOW | Hardcoded devnet `DEFAULT_PROGRAM_ID` in escrow-v2.js | `escrow-v2.js:50` | Throw in production if `ESCROW_PROGRAM_ID_V2` unset |
| **CHAIN-N11** | F-CHAIN-NEW-13 | LOW | No CI check for IDL/program-ID/network triple | n/a | Pre-deploy script: `anchor build && diff target/idl server/idl` |

---

## 5. Composition / Attack-Chain Analysis

### Chain A — AUTH-N02 Replay Window + DATA-N02 PII Broadcast

```
GOAL: Capture identity + correlate to TG account
├── STEP 1: Attacker joins any wagered match as legitimate player.
├── STEP 2: escrowDepositStatus broadcast reveals every co-participant's wallet (DATA-N02).
├── STEP 3: Later, attacker MITM-captures a victim's wallet auth payload (or scrapes from a log).
├── STEP 4: Replay within 5min on fresh socket (AUTH-N02 — no replay store).
├── STEP 5: Backfill at main.js:1582-1588 assigns victim's TG identity to attacker's socket.
└── OUTCOME: Attacker now operates as victim across all group-chat / leaderboard / settle paths.

DEFENSE: Close ANY ONE leg
  - AUTH-N02 (a): in-memory replay Set (~30 LOC) — closes Step 4.
  - DATA-N02: per-recipient projection on escrowDepositStatus — closes Step 2.
  - H006 fix: telegramUserSource tagging — closes Step 5.
```

### Chain B — CHAIN-N01 Env Config Failure Mode

```
NOT an attack chain — a launch failure.
At mainnet flip:
├── Server has mainnet ESCROW_PROGRAM_ID_V2 in Render env.
├── Client .env.production has devnet program IDs + REACT_APP_SOLANA_NETWORK=mainnet-beta.
├── First deposit TX: server builds with mainnet program ID, client validator rejects ("Unexpected program").
├── User sees confusing error. Retries fail same way.
└── Loud failure (not catastrophic) — but every mainnet match is blocked until env reconciled.

DEFENSE: CHAIN-N01 fix BEFORE mainnet flip.
```

### Chain C — DATA-N05 Render Hibernation + Mid-Match Restart

```
GOAL (not adversarial): characterize operational risk.
├── Render auto-redeploys from main on push (~1/week).
├── In-flight matches lose all in-memory state: rooms, wagerStates, depositTimers.
├── On-chain v2 program state survives — funds NOT lost.
├── User-facing impact: match "disappears" from UI; can't re-enter battle.
└── Recovery: permissionless_reclaim after 1200s lets depositors withdraw.

DEFENSE: DATA-N05 fix (persist match state to Mongo, restore on boot) — V1.1 hardening.
```

### Chain D — AUTH-N03 + H011 (carried) + Operator Compromise

```
GOAL: Authority rotation to attacker key.
├── PRECONDITION: Operator's machine compromised OR phishing-staged env.
├── STEP 1: SOLANA_RPC pointed at mainnet (CHAIN-N04 substring check passes for spoofed host).
├── STEP 2: NEW_AUTHORITY env set to attacker pubkey.
├── STEP 3: Run propose-authority-v2.mjs — no confirmation guard, sends TX immediately.
├── STEP 4: On-chain propose lands. Off-chain monitor pages on ConfigProposed.
├── STEP 5: Operator panics. (Attacker hasn't completed rotation — accept_authority requires attacker's signature, which they have if they control NEW_AUTHORITY key.)
└── Off-chain monitoring window (SOS N007) is the defense — operator must rotate back via legitimate propose+accept within 24h.

DEFENSE: AUTH-N03 fix (confirmation gate) — blocks Step 3.
         CHAIN-N04 fix (allowlist) — blocks Step 1.
         Squads multisig on authority (H012 operational) — blocks Step 5.
```

---

## 6. Pre-Mainnet Recommendations

### Priority 1 — MUST FIX (blocks mainnet)

| # | ID | Action | Effort |
|---|---|---|---|
| 1 | **CHAIN-N01** | Update `client/.env.production` mainnet program IDs (or rely on Vercel env-var override; verify both). Add CI guard: `network=mainnet-beta → assert programIds NOT devnet`. | 30 min |
| 2 | **CHAIN-N02** | `anchor build`; copy `target/idl/solshot_escrow_v2.json` to `server/idl/`. Verify all instructions match on-chain post-N002. | 15 min |
| 3 | **CHAIN-N04** | Replace `/mainnet/i.test(RPC)` substring in `init-config-mainnet.mjs:77` with explicit host allowlist. | 15 min |
| 4 | **AUTH-N01** | Reorder `consumeLinkToken()` to AFTER `linkTelegramIdentity()` success in `index.js:597-619`. | 5 min |
| 5 | **DATA-N02** | Per-recipient projection on `escrowDepositStatus` emit at `main.js:3966-3975`. Iterate sockets, redact other wallets. | 30 min |
| 6 | **DATA-N01 verification + fix** | Read `physics.js` `processShot()` output shape. Replace `Math.abs(dmg)` with `if (!Number.isFinite(dmg) \|\| dmg <= 0) continue` at `main.js:4308`. | 30 min |

**Priority 1 total: ~2 hours.**

### Priority 2 — SHOULD FIX (before mainnet, addressable in <1 day)

| # | ID | Action | Effort |
|---|---|---|---|
| 7 | **AUTH-N02** | In-memory `Set<signature>` 5-min TTL replay store in `auth.js:verifyAuthMessage`. ~30 LOC. **Caps the AUTH-N02 replay window — highest residual risk fix.** | 1 hr |
| 8 | **AUTH-N03** | Add `PROPOSE_AUTHORITY_CONFIRM` gate + cluster check to `propose-authority-v2.mjs`. Mirror init-config-mainnet pattern. | 30 min |
| 9 | **CHAIN-N03** | Delete `server/services/escrow-v2.js:216-229` `migrateConfigV2()` + delete `server/scripts/migrate-config-v2.mjs`. Add `#[cfg(feature = "devnet")]` ref comment. | 10 min |
| 10 | **CHAIN-N05** | Add `<SCRIPT>_CONFIRM` env-var gate to all authority/config rotation scripts (~5 scripts × 10 LOC each). | 1 hr |
| 11 | **CHAIN-N06** | Server↔client cluster handshake `serverHello` event on connect. Client refuses sign on mismatch. | 1 hr |
| 12 | **DATA-N03** | Wire `updateWalletForTgUser` call into `linkTelegramIdentity` Step 3 (uid-keyed) path at `users.js:264-282`. | 20 min |
| 13 | **DATA-N04** | Wire `adminNotifications.notify()` BEFORE `failedSettlements.delete()` at `main.js:562-591`. Add `StrandedSettlement` Mongo model for persistence. | 1.5 hr |
| 14 | **DATA-N08** | Catch E11000 in `updateWalletForTgUser`, return `wallet_belongs_to_other_user`. | 10 min |
| 15 | **AUTH-N04** | Hoist Privy client singleton in `link-from-privy-telegram` handler. | 10 min |
| 16 | **AUTH-N05** | Dedicated `adminLimiter` for `/api/admin/*` (e.g., 20/h). | 15 min |
| 17 | **AUTH-N07** | Import `crypto` at top of 3 standalone leaderboard ESM files (fix `require()` ReferenceError in dev). | 5 min |

**Priority 2 total: ~7 hours.**

### Priority 3 — POST-LAUNCH / V1.1

| # | ID | Action |
|---|---|---|
| 18 | **DATA-N05** | Persist `rooms`/`wagerStates`/`matchStates` to Mongo on every mutation; restore on boot. (~50 LOC + model.) |
| 19 | **CHAIN-N07** | Update v1 `cancelMatchEscrow` to derive refund list from on-chain mask (parity with v2 S2-T7 pattern). |
| 20 | **CHAIN-N08** | Cluster-aware explorer URL helper. |
| 21 | **CHAIN-N09** | Rename `recover-stuck-v2.mjs` or refactor as env-gated generic tool. |
| 22 | **CHAIN-N10** | Throw in production if `ESCROW_PROGRAM_ID_V2` env unset. |
| 23 | **CHAIN-N11** | CI pre-deploy script: `anchor build && diff target/idl server/idl`. |
| 24 | **AUTH-N06** | Add `aud` claim per-game to arcade JWTs; rotation runbook. |
| 25 | **AUTH-N09** | Cap `walletHistory[]` at 50 via `$slice: -50` in `$push`. |
| 26 | **DATA-N06/N07/N09/N10/N11** | Defensive hygiene — needle bounds on wipe-user, confirmation guard on dedupe-funnel-oneshots, TX-sig truncation, drop clientDebugLog in production, sweep `runValidators:true`. |
| 27 | H003 / H004 (long-term) | Decide auth model honestly: either restore `verifyToken()` middleware (per-event JWT verify) OR delete `generateToken()` entirely and document socket-flag model. |
| 28 | H005 (defense-in-depth) | Replace `NODE_ENV !== 'production'` with positive `NODE_ENV === 'development'` in `tgIdFor()`. |
| 29 | H006 (long-term close) | Tag `telegramUserSource: 'tg-hmac' \| 'wallet-backfill'`; require HMAC source for high-trust ops. |
| 30 | Operational | Verify Render env: `NODE_ENV=production`, all per-game leaderboard secrets, `ARCADE_SESSION_SECRET`, `PRIVY_APP_SECRET`. Update `CORS_ORIGINS` with new Vercel URLs. |
| 31 | Monitoring | Subscribe to on-chain events (`ConfigProposed`, `ConfigApplied`, `AuthorityProposed`, `AuthorityAccepted`, `Paused`, `Unpaused`) per SOS N007. 5-min alert SLA. |
| 32 | Bug bounty | Publish at mainnet flip (industry standard for hot-wallet phase). |

---

## 7. Cross-Skill Status

| Skill | Audit # | Verdict | Joint Bottleneck |
|---|---|---|---|
| **SOS (on-chain)** | #3 (today, `fabb8e1` / `da04b5e`) | **CONDITIONAL GO** — N001 (timelock guard) + N002 (migrate_config deletion) + N003 (apply pause-gate) landed. 2 of 4 prior CRITs RESOLVED; 6 prior HIGHs closed. Remaining: H024 (non-contiguous mask), N004/N005/N006 (Priority 2). Squads-from-day-one operational fix for H044/H046. | None blocking — on-chain side is structurally clean. |
| **DB (off-chain)** | #3 (today, `da04b5e`) | **CONDITIONAL GO** — 6 must-fix items above (~2 hr), plus 11 should-fix items (~7 hr). Identity-bridge AUTH-N02 chain is the highest-residual-risk item; mitigable via 30-LOC replay store. | Operational hygiene (`.env.production`, IDL regen, RPC allowlist, propose-authority guards, magic-link ordering, PII broadcast). |
| **BOK (math invariants)** | #2 (May 7) clean; #3 not yet run | Carry-forward CLEAN. | None. |
| **GL (docs)** | Not yet run | TBD. Will likely flag SHOT-as-on-chain-token in litepaper (stale post-pivot per `project_shot_pivot_to_ingame.md`), and missing 3-vault Squads docs. | Doc updates — not a code blocker. |

### Joint Posture

The H120 cross-skill coup chain from audit #2 (SOS deferred H001 × DB H002) is **BROKEN AT BOTH LEGS**:
- SOS leg: Bundle 1 propose_authority + 24h timelock (`e48b6b5` + `da04b5e`) — H001 RESOLVED on v2.
- DB leg: privyAuth 503 guard + Bug-7 env mismatch fix — H002 RESOLVED.

**SolShot is materially closer to mainnet than the audit #2 pair.** The off-chain operational hygiene is the long pole. Total estimated fix time: **~9 hours of focused work** to land all Priority 1 + 2 items (Priority 1 alone = 2 hours).

---

## 8. Stacking Lineage

| Audit # | Date | Git Ref | Tier | Confirmed | Verdict |
|---|---|---|---|---|---|
| #1 | 2026-02-24 | `ecfd03b` | n/a (pre-Bulwark format) | 70 (12C / 34H / 18M / 6L) | "Not safe for production with real funds" |
| #2 | 2026-05-07 | `5f2acec` | DEEP (22 auditors, 5 batches) | 113 (23C / 40H / 30M / 20L) | "Hackathon-safe (devnet); NOT mainnet-safe — Bundles A/B/D required" |
| **#3** | **2026-05-28** | **`da04b5e`** | **Standard (3 focused delta bundles)** | **22 new (3C / 9H / 7M / 3L) + prior re-status: 9 prior CRITs RESOLVED, 1 RESOLVED_BY_REMOVAL, 4 PARTIAL, 9 RECHECK/STILL_OPEN** | **"CONDITIONAL GO — 6 must-fix items pre-mainnet (~2 hr), then mainnet-ready for V1 scope"** |

### Recurring Findings Across Audits

| Cross-Audit ID | Title | Audits Present | Current Status |
|---|---|---|---|
| H003 family | JWT generated never verified | #1 (H029), #2 (H003), #3 | STILL_OPEN — auth.js unchanged |
| H004 family | Auth signature replay window | #1 (C-6/H030), #2 (H004), #3 | STILL_OPEN — auth.js unchanged; AUTH-N02 composition |
| H012 family | Single keypair = upgrade + app authority | #1 (H044), #2 (H012), #3 | CARRY-FORWARD operational — Squads at mainnet deploy |
| H018 family | Legacy `shoot` relay no auth | #1 (C-7), #2 (H018), #3 | RESOLVED in #3 (S2-T6/T7 hardening) |
| H085 family | nodemon in production deps | #1 (H053), #2 (H085), #3 | RECHECK — re-audit `npm audit` |
| H017 family | Self-damage `Math.abs` | #2 (H017), #3 (DATA-N01) | STILL_OPEN — pending physics-side verification |

---

## 9. Verdict

**CONDITIONAL GO for mainnet (V1 scope).**

With SOS audit #3 N001/N002/N003 already landed and the off-chain Bundle 1-3 deltas confirmed, the remaining gate is **6 off-chain must-fix items (~2 hours of focused work)** plus **operational checks** (Render env reconciliation, Vercel env reconciliation, Squads multisig deploy procedure, monitoring infrastructure live, bug bounty published).

The headline residual risk after must-fixes lands is **AUTH-N02** — the 5-minute wallet-auth replay window enabling TG identity assumption. For V1 scope (small-wager SOL only, no large bankrolls per `project_v1_mainnet_scope.md`), this is an acceptable launch risk IF AND ONLY IF (a) wager tiers are explicitly capped to align with the bound, (b) the gap is recorded in `Docs/internal/REMEDIATION_DECISIONS.md` Section 5 with a target close date, and (c) the Priority 2 replay-store fix (1 hr) is on the V1.1 sprint. Otherwise, land the replay store fix before mainnet flip — it's a 1-hour fix that closes the chain.

**Net delta from audit #2 to audit #3:** the "fail-open financial path" category is closed, the "legacy un-auth socket events" category is closed, the cross-skill H120 coup is broken at both legs. SolShot's off-chain stack has moved from "NOT safe for mainnet" to "mainnet-ready after 2-9 hours of must-fix work" — a substantial, measurable improvement consistent with the audit-driven discipline visible in the commit log.

---

## Disclaimer

This is an automated security audit, abridged due to delta-focused stacking on audit #2's DEEP-tier coverage. It does NOT replace:
- Manual expert security review (recommended before scaling TVL beyond V1 scope)
- Live PoC validation of the AUTH-N02 replay window (left as exercise for the team)
- Comprehensive runtime testing of `init-config-mainnet.mjs` on mainnet with operator-verified Squads PDAs

**Limitations:**
- The audit assumes audit #2's NOT_VULNERABLE findings still hold against the current code; spot-checked but not fully re-validated.
- The full re-statusing of all 40 audit #2 HIGHs would require breadth comparable to audit #2's 22-auditor sweep; this audit selected the highest-impact items per bundle.
- DATA-N01 severity assignment is contingent on physics-side verification of `processShot()` output shape — flagged as a one-liner fix regardless.

**Recommendation:** Engage a professional Solana security firm (Halborn, Hacken, OtterSec) before scaling mainnet TVL beyond a defined threshold (e.g., $5M). For V1 launch at smaller scale with Squads multisig + monitoring + bug bounty + the Priority 1 must-fixes landed, the audit #2/#3 stacked posture + SOS audit #3 posture is appropriate per the V1 mainnet scope.

---

## Report Metadata

| Field | Value |
|---|---|
| Report Generated | 2026-05-28 |
| Dinh's Bulwark Version | 1.0.0 |
| Audit Number | #3 |
| Previous Audits | 2 (Feb 2026 #1; May 2026 #2 DEEP) |
| Files Audited | 192 / ~60K LOC (subset focus per 3 bundles) |
| Context Auditors (this audit) | 3 (focused delta bundles) |
| New CONFIRMED Findings | 22 (3 CRITICAL + 9 HIGH + 7 MEDIUM + 3 LOW) |
| Prior CRITICAL Resolved | 9 (H001, H002, H009, H013, H014, H015, H016, H019, H020) |
| Prior CRITICAL Resolved_By_Removal | 1 (H052 — SHOT off-chain pivot) |
| Prior CRITICAL Partial | 4 (H006, H007, H010 by reconnect-disabled, H012 operational) |
| Prior CRITICAL Still_Open | 5 (H003, H004, H005, H011, H017→DATA-N01) |
| Prior CRITICAL Recheck Confirmed Open | ~3 (H027, H031, H037) |
| Prior HIGH Resolved/Recheck | mixed — full sweep deferred to next DEEP cycle |
| Cross-Skill (SOS) Status | CONDITIONAL GO — N001/N002/N003 landed |
| Verdict | **CONDITIONAL GO** — 6 must-fix items (~2 hr) pre-mainnet |

---

**End of Report**

*Generated by Dinh's Bulwark v1.0 — Phase 5 (Report)*
*Audit ID: `db-solshot-2026-05-28`*
*Git ref: `da04b5e`*
*Previous: `.bulwark-history/2026-05-07-5f2acec/`*
