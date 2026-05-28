# Dinh's Bulwark — Off-Chain Audit #3 HANDOVER

**Audit:** `#3` (off-chain stack)
**Current git ref:** `da04b5e` (tag `v1-mainnet-rc1` + N001/N002/N003 SOS must-fixes)
**Previous git ref:** `5f2acec` (audit #2, 2026-05-07)
**Prior tier:** DEEP — 22 parallel context auditors, 5 batches
**Project state:** V1 mainnet candidate. SOL wagering live, v2 escrow for N>2, SHOT now off-chain.

---

## Audit Lineage

| # | Date | Git Ref | Tier | Confirmed | Verdict |
|---|------|---------|------|-----------|---------|
| 1 | 2026-02-24 | `ecfd03b` | n/a (pre-Bulwark format) | 70 (12C / 34H / 18M / 6L) | "Not safe for production with real funds" |
| 2 | 2026-05-07 | `5f2acec` | DEEP (22 auditors) | 113 (23C / 40H / 30M / 20L) | "Hackathon-safe (devnet); NOT mainnet-safe — Bundles A/B/D required" |
| **3** | **2026-05-28** | **`da04b5e`** | TBD | — in progress — | — |

Archive of #2: `.bulwark-history/2026-05-07-5f2acec/`.

---

## Delta Summary (5f2acec → da04b5e)

**`massive_rewrite: false`** — Express + Socket.IO + Privy + Mongo + Anchor v2 architecture is intact. Large by file count, but trust zones, identity model, and on-chain integration patterns are recognizable from #2. Verification agents CAN re-check prior findings against renumbered file:line.

### Files in scope (delta)

| Category | Status | Count | Notes |
|---|---|---|---|
| `server/services/*` | modified + new | ~25 mod, ~14 new | Hot zone — escrow-v2.js, users.js, privyAuth.js, shot-token.js, solana.js heavily touched; new: funnel.js, arcadeBot.js, arcadeSession.js, stealthBot.js, adminNotifications.js, 3x standaloneLeaderboard.js for arcade games |
| `server/socket-io/main.js` | massively modified | +689 LOC | Bug 6 added `cleanupRoom` N>2 branch; S2-T5a wired v2 settle for N>2; gating on room-full for escrow creation; reconnect path retouched |
| `server/socket-io/groupchat.js` | minor | +12 LOC | Minor tweaks |
| `server/index.js` | modified | +827 LOC | NEW: `/api/admin/funnel`, `/api/wallet/link-from-tg-token` reworked, several new arcade routes, S1-T3 wallet-link retry, NEW: `/api/admin/truncate-handles`, `/api/csp-report` |
| `server/models/User.js` | modified | +14 LOC | Added `walletHistory[]` audit trail field |
| `server/models/` | new | 6 new | `FunnelEvent`, `BasketballScore`, `KeepieUppiesScore`, `FreeKicksScore`, `Feedback`, `WagerWaitlist` |
| `server/scripts/` | new | 11 new | init-config-mainnet, accept-authority-v2, apply-config-update-v2, propose-authority-v2, migrate-config-v2, recover-stuck-v2, reconcile-wallets, wipe-user, dedupe-funnel-oneshots, smoke-funnel, smoke-wallet-rotation |
| `server/middleware/guards.js` | modified | +12 LOC | Minor tweaks |
| `server/services/privyAuth.js` | modified | +81 LOC | Bug 4 — diagnostic logging on JWT verify failure (logs token audience + claim details) |
| `server/services/escrow-v2.js` | modified | +213 LOC | S2-T7 derive-from-on-chain-mask for cancel + reclaim; S2-T5a settle dispatch helpers |
| `server/services/shot-token.js` | gutted | −189 net | SHOT pivoted off-chain — removed `verifyBurnTransaction()` and all SPL burn paths |
| `server/services/groupchat/lifecycle.js` | modified | +106 LOC | Race fixes, lifecycle correctness |
| `client/src/wallet/WalletContext.js` | modified | +307 LOC | Bug 5 — removed duplicate-creating `useEffect`; removed `signAndBurnShot()`; retry helper |
| `client/src/App.js` | modified | +40 LOC | S1-T3 wallet-link retry wired |
| `client/src/screens/LobbyScreen.js` | massively modified | +801 LOC | 4P matchmaking UI, Group lobby, mode tabs revamped |
| `client/src/screens/GroupBattleWrapper.js`, `GroupMatchScreen.js`, `GroupDepositScreen.js` | modified | varies | 4P UI + deposit flow |
| `client/src/screens/PrestigeScreen.js` | modified | +214 LOC | Burn replaced with off-chain SHOT spend |
| `client/src/components/DebugAuthOverlay.js` | unchanged | — | **CHECK whether H031 fix landed** (`if NODE_ENV !== 'production'` wrap) |
| `programs/solshot-escrow-v2/src/lib.rs` | modified | +addressed via SOS #3 | propose_authority + timelock + N001/N002/N003 must-fixes |

### NEW operational surface (each is an auth/access risk vector)

- `/api/admin/funnel` — read aggregated stage counts, admin-key gated (re-verify `requireAdminKey` is timing-safe vs prior H083 `!==`)
- `/api/admin/truncate-handles` — destructive Mongo mutation, admin-key gated
- `server/scripts/init-config-mainnet.mjs` — 3-vault Squads PDA bootstrap; depends on env-var validation + confirmation guards
- `server/scripts/wipe-user.mjs` — destructive Mongo mutation
- `server/scripts/reconcile-wallets.mjs` — bulk wallet rotation across users
- `server/scripts/dedupe-funnel-oneshots.mjs` — Mongo data mutation, requires confirmation
- `server/scripts/recover-stuck-v2.mjs` — operational permissionless_reclaim driver
- `server/services/arcadeBot.js` — second Telegraf bot (`@TheArcadeGG_Bot`), separate token + webhook; per-game JWT issuer
- `server/services/arcadeSession.js` — JWT issuance for arcade leaderboards
- 3x `standaloneLeaderboard.js` — score submission endpoints per arcade game

---

## Previous Findings Digest (CRITICAL section — read first)

Tagging legend:
- `CHECK_RESOLVED` — a commit explicitly addresses; verification agent must confirm landed fix is complete
- `RECHECK` — file was modified; re-verify prior finding still applies
- `VERIFY` — file unchanged; reaffirm dismissal/severity
- `RESOLVED_BY_REMOVAL` — file/feature deleted
- `RECURRENT` — open from #1, still open in #2; auditors should expect it to still be there

### Auth & Identity (8 findings — 5 CRITICAL, 3 carrying over)

| ID | Title | Sev | File:line (at #2) | Tag |
|----|-------|-----|-------------------|-----|
| H001 | Privy/TG bridge: server trusts client-supplied `telegramUserId` | CRIT | `server/index.js:502-519` | **RECHECK** — `link-from-privy-telegram` lives in heavily-modified `server/index.js`; was Bug 7 a related fix? Re-read endpoint. |
| H002 | `requirePrivyAuth({required:true})` no-op when `PRIVY_APP_SECRET` missing | CRIT | `server/services/privyAuth.js:64-66` | **CHECK_PARTIAL** — Bug 4 (`590d9d6`) added diagnostic logging; Bug 7 fixed Render `PRIVY_APP_ID` mismatch. Root issue (fail-open when secret absent) needs explicit re-check that handler now THROWS 503 instead of `next()`. |
| H003 | JWT generated but never verified server-side | CRIT (RECURRENT from #1 H029) | `server/middleware/auth.js` | **VERIFY** — auth.js not in delta. Still open unless implicit fix. |
| H004 | Auth signature 5-min replay window — no replay store | CRIT (RECURRENT from #1 C-6) | `server/middleware/auth.js:75-88` | **VERIFY** — auth.js not in delta. |
| H005 | `tgIdFor()` NODE_ENV fallback impersonation | CRIT | `server/socket-io/groupchat.js:72-78` | **RECHECK** — groupchat.js modified +12 LOC. |
| H006 | TG identity backfill bridges auth tiers (composes with H001) | CRIT | `server/socket-io/main.js:1298-1303` | **RECHECK** — main.js +689 LOC, line numbers shifted significantly. |
| H007 | `link-from-tg-token` soft Privy JWT (`required:false`) | CRIT | `server/index.js:432` | **RECHECK** — `server/index.js` heavily modified. |
| H008 | Composed H001+H006 takeover chain | CRIT (compound) | derived | **RECHECK** — depends on H001 + H006 status. |

### Wallet & Keypair (4 findings — 4 CRITICAL)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H009 | Wallet rotation gap — DB never updates after first set | CRIT | `server/services/users.js:91` | **CHECK_RESOLVED** by S2-T6 (`25e7cec`). New `updateWalletForTgUser()` atomic helper + `walletHistory[]`. Verification: check ALL callers of identity-linking actually invoke new helper, not the old short-circuit. |
| H010 | Reconnect remap copies stale wallet entry | CRIT | `server/socket-io/main.js:1815-1817` | **RECHECK** — main.js heavily modified; line numbers shifted. S2-T6 should have fixed if reconnect calls `updateWalletForTgUser`. |
| H011 | Escrow keypair unzeroized in process memory | CRIT (REGRESSION) | `server/services/keys.js:54-64` | **VERIFY** — `keys.js` not in server delta listing. Likely unchanged → STILL OPEN. |
| H012 | Single keypair = upgrade + application authority | CRIT (RECURRENT, pre-mainnet) | Render `SOLANA_KEYPAIR_JSON` | **CHECK_PARTIAL** — Bundle 1 Anchor changes (`e48b6b5`, S2-T1) added `propose_authority` + timelock; rotation drills landed (S2-T2). Auditors check `init-config-mainnet.mjs` actually sets the 3-vault Squads PDAs in production config. |

### Financial / Refund (5 findings — 5 CRITICAL)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H013 | `refundWager()` fails-open on cancel CPI throw | CRIT | `server/services/solana.js:240-258` | **CHECK_RESOLVED** by S2-T7 (`c9b3601`). Re-read `solana.js` (+103 LOC) to confirm return value of `cancelMatchEscrowV2` is propagated. |
| H014 | H023 fix-bundle ↔ server-side desync (`remaining_accounts` from off-chain state) | CRIT | `server/services/lifecycle.js:896-910` + `main.js:433-512` | **CHECK_RESOLVED** by S2-T7 (`c9b3601`). Server now fetches on-chain `deposits_mask` via `program.account.matchEscrow.fetch()` FIRST, then builds `remaining_accounts` from set bits only. |
| H015 | Group-chat double-settle race | CRIT | `server/services/groupchat/lifecycle.js:804, 1039` | **CHECK_PARTIAL** — S2-T7 commit notes "Settle race (H015) was already protected by existing `withLock` + SETTLING state-machine gate; verified during audit." `lifecycle.js` modified +106 LOC. Auditors re-confirm CAS gate. |
| H016 | `confirmDeposit` last-depositor doc overwrite race | CRIT | `server/services/groupchat/lifecycle.js:262-274` | **CHECK_RESOLVED** by S2-T7 (`c9b3601`). Per commit message: closes H016. |
| H017 | Self-damage `Math.abs(dmg)` sign-erasure in 1v1 | CRIT | `server/socket-io/main.js:3811` | **RECHECK** — main.js massively modified; line numbers shifted. Check whether `Math.abs(dmg)` was replaced with `if (dmg<=0) return`. |

### Authorization Bypass (8 findings)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H018 | `shoot` legacy relay no auth | CRIT (RECURRENT from #1 C-7) | `server/socket-io/main.js:3377` | **RECHECK** — main.js shifted. |
| H019 | `acceptChallenge`/`declineChallenge` no auth + leaked socketId | CRIT | `server/socket-io/main.js:3261, 3276` | **RECHECK** — main.js shifted. |
| H020 | `clientDebugLog` unauthenticated | CRIT | `server/socket-io/main.js:1356` | **RECHECK** — main.js shifted. |
| H021 | `groupShopComplete` tgId-only check | HIGH | `server/socket-io/groupchat.js:357` | **RECHECK** — groupchat.js +12 LOC. |
| H022 | `getGroupMatch` no auth, full doc exposed | CRIT | `server/socket-io/groupchat.js:97` | **RECHECK** — groupchat.js +12 LOC. |
| H023 | `/api/challenge/:code/cancel` unauthenticated | HIGH | `server/index.js:388` | **RECHECK** — index.js +827 LOC, also `services/challenge/challenge.js` modified. |
| H024 | `equipCosmeticResult` returns raw err.message | HIGH | `server/socket-io/main.js:3105` | **RECHECK** — main.js shifted. |
| H025 | Weapon inventory bypass on missing slot | HIGH | `server/socket-io/main.js:3714-3720` | **RECHECK** — main.js shifted. |

### Race / Concurrency (4 findings)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H026 | Turn-sequence nonce optional | HIGH | `server/socket-io/main.js:3690` | **RECHECK** — main.js shifted. |
| H027 | `depositTimers` slot reuse (5min vs 30sec) | CRIT (RECURRENT) | `server/socket-io/main.js:2108-2126` | **RECHECK** — main.js shifted; deposit-timer code likely affected by Bug 1 fix. |
| H028 | `handleShot` group-chat no mutex | CRIT | `server/services/groupchat/lifecycle.js:536` + `socket-io/groupchat.js:168` | **RECHECK** — lifecycle.js +106 LOC. |
| H029 | `bulkWrite ordered:false` partial failure silent (duplicate of H074) | HIGH | `server/services/groupchat/lifecycle.js:1002` | **RECHECK** |

### Information Disclosure (4 findings)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H030 | `escrowDepositStatus` PII cross-broadcast | CRIT (NOVEL) | `main.js` escrowDepositStatus emit | **RECHECK** — main.js shifted, escrow event surface heavily modified by Bug 3 fix. |
| H031 | `DebugAuthOverlay` ships in production | CRIT | `client/src/App.js:327` + `client/src/components/DebugAuthOverlay.js` | **RECHECK** — App.js +40 LOC, but DebugAuthOverlay.js NOT in delta list. Likely still bundled. |
| H032 | `runValidators: true` not used on update paths | HIGH | all `findOneAndUpdate`/`bulkWrite` | **RECHECK** — sweep new helpers (`updateWalletForTgUser`, funnel upserts, FunnelEvent unique indexes) for `runValidators`. |
| H033 | Pino redact policy effectively dead code (95% `console.*`) | HIGH | `server/services/logger.js` | **VERIFY** — logger.js not in delta. Still open. |

### Headers / Web (3 findings)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H034 | Vercel client zero security headers | CRIT | `client/vercel.json` | **VERIFY** — `vercel.json` not in delta. |
| H035 | Server CSP has dead Dynamic origins | MED | `server/index.js` helmet config | **RECHECK** — index.js heavily modified. May be cleaned up. |
| H036 | `'unsafe-inline'` in client script-src (Eruda) | HIGH | `client/public/index.html` meta CSP | **VERIFY** — html not in delta. |

### Failure Modes (4 findings)

| ID | Title | Sev | File:line | Tag |
|----|-------|-----|-----------|-----|
| H037 | `failedSettlements` silent drop after 5 retries | CRIT | `server/socket-io/main.js:329-331` | **RECHECK** — main.js shifted. New `adminNotifications.js` service may have addressed this. Re-check whether retries persist to Mongo or alert ops on exhaustion. |
| H038 | `uncaughtException`/`unhandledRejection` log-only | HIGH | `server/index.js:614-620` | **RECHECK** — index.js heavily modified. |
| H039 | No MongoDB reconnect handling | HIGH | `server/index.js:545` | **RECHECK** — index.js heavily modified. |
| H040 | v2 settle has no retry equivalent for v1 retry queue | HIGH | `server/services/groupchat/lifecycle.js:861-870` | **RECHECK** — `S2-T5a` (`b9134c3`) wired v2 settle dispatch for N>2; verify retry queue mirrored. |

### npm CVEs (5 findings — HIGH each)

| ID | Title | File | Tag |
|----|-------|------|-----|
| H041 | express-rate-limit IPv6 bypass (< 8.5.1) | `server/package.json` | **RECHECK** — server `package.json` modified +2 LOC. Run `npm audit` fresh. |
| H042 | socket.io-parser DOS | server + client lockfiles | **RECHECK** |
| H043 | path-to-regexp ReDoS | server lockfile | **RECHECK** |
| H044 | handlebars JS injection (transitive via phaser3-rex-plugins) | client lockfile | **RECHECK** |
| H045 | bigint-buffer overflow (via `@solana/spl-token`) | client | **CHECK_PARTIAL** — `@solana/spl-token` may have been removed alongside SHOT off-chain pivot; verify import status. |

### RPC / Chain (5 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H049 | Single unmonitored RPC endpoint | HIGH | `server/services/solana.js:28` | **RECHECK** — solana.js +103 LOC. |
| H050 | RPC 429 no retry | HIGH | `server/services/solana.js:113` | **RECHECK** — solana.js +103 LOC. |
| H051 | `confirmTransaction('confirmed')` deprecated form | HIGH | `client/src/wallet/WalletContext.js:584,624,654` | **RECHECK** — WalletContext.js +307 LOC. |
| H052 | Burn TX missing `lastValidBlockHeight` | HIGH | `client/src/wallet/WalletContext.js` (`signAndBurnShot`) | **RESOLVED_BY_REMOVAL** — `signAndBurnShot()` removed (SHOT off-chain pivot per S2-T3/T4 `886fcab`). |
| H053 | No `simulateTransaction()` pre-flight | HIGH | `server/services/escrow.js`, `escrow-v2.js` | **RECHECK** — escrow-v2.js +213 LOC. |

### TG Bot (4 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H054 | `TELEGRAM_BOT_TOKEN` absent from render.yaml | HIGH | `render.yaml` | **VERIFY** — render.yaml not in delta list. Re-check current production env. NEW: `ARCADE_BOT_TOKEN` likewise must be checked. |
| H055 | `/teststats` no NODE_ENV/admin check | MED | `server/services/bot.js:416` | **RECHECK** — bot.js +14 LOC. |
| H056 | Bot lacks queue/backoff for sendMessage | HIGH | `server/services/groupchat/lifecycle.js:1107` | **RECHECK** — lifecycle.js modified. NEW arcadeBot.js + stealthBot.js have same risk. |
| H057 | `lobbyWatchdog` bulk sends on boot | HIGH | `server/services/groupchat/lobbyWatchdog.js:63` | **VERIFY** — lobbyWatchdog.js not in delta. |

### v2 Escrow Off-Chain (5 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H058 | v2 settle TOCTOU between snapshot fetch + submit | HIGH (LIKELY) | `server/services/escrow-v2.js:305-322` | **RECHECK** — escrow-v2.js +213 LOC. |
| H059 | No state pre-check before settle | HIGH | `server/services/escrow.js:388-427`, `escrow-v2.js:301-330` | **RECHECK** — escrow-v2.js modified. |
| H060 | `match_id` uniqueness not guaranteed | HIGH | `server/socket-io/main.js:2212,2393` | **RECHECK** — main.js shifted. Bug 1 + Bug 3 fixes (`590d9d6`) gated escrow creation on room-full; this likely also affects match_id collision risk. |
| H061 | `remainingAccounts` order assumption | HIGH (LIKELY) | `server/services/escrow.js`, `escrow-v2.js` | **CHECK_PARTIAL** — S2-T7 now derives from on-chain `deposits_mask` bit order (canonical), eliminating reorder risk. Auditors confirm settle path follows same pattern. |
| H062 | Stale IDL after redeploy | MED | `server/idl/*.json` | **RECHECK** — `server/idl/solshot_escrow_v2.json` modified +521 LOC; IDL sync clearly happens. CI check still desirable. |

### Group-Chat Logic (4 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H063 | Group-chat self-firing infinite stall | HIGH (NOVEL) | `server/services/groupchat/lifecycle.js` | **RECHECK** |
| H064 | Group-chat null-winner path | HIGH | `server/services/groupchat/lifecycle.js` | **RECHECK** — H009/wallet rotation hardening (S2-T6) reduces incidence; null-winner path itself may still exist. |
| H065 | Auto-forfeit counter evaded via reconnect (keyed by `socketId`) | HIGH | `server/socket-io/main.js:676-681` | **RECHECK** — main.js shifted. |
| H066 | Authority duration-set lockup (24h cap off-chain) | MED | off-chain | **RECHECK** — `update-config-v2.mjs` modified, durations now validated server-side likely. |

### DB / Mongoose (4 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H072 | `matchId` operator injection (5 handlers) | HIGH | `server/socket-io/groupchat.js:103` | **RECHECK** — groupchat.js modified. |
| H073 | `handle` operator injection on /api/challenge | HIGH | `server/services/challenge.js:41` | **RECHECK** — `challenge/challenge.js` modified +16 LOC. |
| H074 | `bulkWrite` partial-failure silent (= H029) | HIGH | `server/services/groupchat/lifecycle.js:1002` | **RECHECK** |
| H075 | `upsert + unique index` race not E11000-aware | HIGH | `ServerState`, referral code generation | **CHECK_PARTIAL** — `dedupe-funnel-oneshots.mjs` + sparse-unique partial-filter indexes (`584c1e4`) show E11000 awareness in FunnelEvent path. Verify ServerState + referral generation still naive. |

### Logging & PII (5 findings — H071 already RESOLVED in #2)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H067 | `debugLog.js` always console.log | HIGH | `client/src/lib/debugLog.js:47` | **VERIFY** — debugLog.js not in delta. |
| H068 | TG ID + wallet co-logged | HIGH | `server/socket-io/main.js:1124,1368` | **RECHECK** — main.js shifted. Bug 4 ADDED MORE diagnostic logging (Privy token + claims) — verify it doesn't worsen PII linkage. |
| H069 | Escrow boot logs treasury + ops addresses | MED | `server/services/escrow.js:89-90` | **RECHECK** |
| H070 | `/health` exposes activeConnections | LOW | unauth `/health` | **RECHECK** — index.js heavily modified. |
| H071 | Source maps disabled in production | RESOLVED (was NOT_VULNERABLE in #2) | `client/.env.production` | **VERIFY** — confirm `GENERATE_SOURCEMAP=false` still in place. |

### RNG / Crypto (2 findings)

| ID | Title | Sev | File | Tag |
|----|-------|-----|------|-----|
| H089 | Group match IDs use Math.random() | HIGH | `server/services/groupchat/index.js:35` | **RECHECK** — groupchat/index.js +90 LOC. |
| H090 | Challenge shortcode 20 effective bits | HIGH (LIKELY) | `server/services/challenge/challenge.js:27` | **RECHECK** — challenge.js modified +16 LOC. |

### Tier 3 Defensive (32 findings — H091–H119)

Mostly inherited unchanged; categories: info disclosure (5), defensive hygiene (8), edge cases (8), resource limits (5), docs (3), plus cross-skill chain H120. Re-check the high-value ones explicitly:

- **H085** — nodemon in production deps (RECURRENT from #1 H053). RECHECK `server/package.json` modified +2.
- **H120** — CROSS-SKILL coup chain (SOS H001 + DB H002). **CHECK_PARTIAL** — both legs addressed: SOS H001 closed by S2-T1 propose_authority + timelock (`e48b6b5`); DB H002 partially closed by Bug 4 + Bug 7 (Render env fixes). Verify root cause of H002 (fail-open when secret missing) is THROW now, not next().
- **H083** — Timing-unsafe admin compare. RECHECK `requireAdminKey` middleware — now used by NEW `/api/admin/funnel` and `/api/admin/truncate-handles`.
- **H086** — Physics amplification DOS. `server/services/physics.js` +55 LOC — RECHECK throttle/limit.
- **H112** — `failedSettlements` Map unbounded. RECHECK (overlaps H037).
- **H113** — `balanceCache` never evicts. RECHECK.

---

## False-Positive / Dismissal Carry-Forward

Re-validated NOT_VULNERABLE in #2; carry forward where target file unchanged:

| Item | File at #2 | Carry? |
|------|------------|--------|
| H071 source maps disabled in production | `client/.env.production` (unchanged) | YES — verify file still has `GENERATE_SOURCEMAP=false` |
| `qs` 6.14.2 non-vulnerable | `server/package-lock.json` | RE-AUDIT — server `package-lock.json` modified; rerun `npm audit` |
| `withLock` settlement gate sound | `server/services/groupchat/lifecycle.js:wrapper` | RE-AUDIT — lifecycle.js +106 LOC may have touched mutex |
| BOK on-chain math invariants all sound | Anchor programs | RE-AUDIT — BOK audit #3 in parallel; off-chain assumes BOK clean |

---

## Architecture Snapshot (post-#2 update)

**Stack:** Node.js + Express + Socket.IO + Telegraf (server). React 18 + Phaser 3.55 PWA (client). MongoDB Atlas. Solana mainnet RPC (NEW for v1 launch). Privy embedded wallets (auth + signing). Hosted on Render (server) + Vercel (client).

**Architectural shifts since #2:**
- **Wallet rotation hardened (S2-T6).** New `updateWalletForTgUser()` atomic helper + `walletHistory[]` audit trail. Idempotent same-wallet, conflict-checked, refuses cross-user collision. Reconcile script (`reconcile-wallets.mjs`) batch-fixes existing stale rows.
- **Refund correctness (S2-T7).** `cancelMatchEscrowV2` + `permissionlessReclaimEscrowV2` now fetch on-chain `deposits_mask` FIRST, then build `remaining_accounts` from set bits only. Caller-supplied list kept as cross-check (warn-on-divergence). Closes H013 + H014.
- **SHOT off-chain (S2-T3 + S2-T4).** Pump.fun ABANDONED. SHOT is now closed in-game currency; no SPL mint, no on-chain burns. `verifyBurnTransaction()` removed. `signAndBurnShot()` removed. Devnet mint `4NnYBycL...` orphaned. Attack surface shrunk: no SPL burn TX flow, no `@solana/spl-token` dependency surface, but in-memory accounting is now load-bearing.
- **v2 escrow N>2 settle wired (S2-T5a).** `b9134c3` extended settle dispatch for N>2 matches. v2 retry path now exists.
- **Bug 6 — N>2 leave doesn't trigger settle.** `cleanupRoom` forfeit-settle block now gated on `room.players.length === 2`. For N>2 matches, leaver marked dead but pot stays escrowed; survivors play to natural end.
- **Funnel instrumentation (S1-T2).** Stages: register → auth → wallet_linked → first_deposit → first_settle. New `FunnelEvent` model with sparse-unique partial-filter indexes (`584c1e4`) closing dedupe race. NEW admin endpoint `/api/admin/funnel`.
- **Wallet-link retry (S1-T3).** Client `fetchWithRetry()` helper + exponential backoff for `link-from-tg-token` and `link-from-privy-telegram`.
- **Privy diagnostic logging (Bug 4, `590d9d6`).** Logs token audience + claim details on JWT verification failure. Diagnosed Bug 7 (Render `PRIVY_APP_ID` mismatch). Verify this logging doesn't itself leak.
- **Mainnet operational scripts.** `init-config-mainnet.mjs` bootstraps GlobalConfig with 3-vault Squads PDAs. `propose-authority-v2.mjs` + `accept-authority-v2.mjs` + `apply-config-update-v2.mjs` for two-step authority rotation with timelock.
- **Arcade hub.** Second Telegraf bot `@TheArcadeGG_Bot` (`arcadeBot.js`), 3 standalone leaderboard services, per-game JWT issuer. Arcade games hosted separately (Vercel per game) but server is shared. Bug surface for the AUDIT: leaderboard endpoint auth + JWT secret per-game.

### Trust zones (post-S2-T6/T7)

```
ZONE 0  Public Internet           → CORS + helmet + rate-limit
ZONE 1  Authenticated Client      → Privy JWT + Telegram HMAC + magic-link
                                     (GAPS unchanged: H003 JWT generated-never-verified,
                                      H004 5-min replay, H005 NODE_ENV fallback)
ZONE 2  Verified Identity         → tgIdFor() resolves TG ID + wallet
                                     IMPROVED: S2-T6 wallet now stays current
                                     GAPS still present: H001 client-supplied tgId,
                                       H006 backfill bridges sources
ZONE 3  Match Participant         → match-membership authz
                                     GAPS: H018 shoot legacy, H022 getGroupMatch,
                                       H019 accept/declineChallenge
ZONE 4  Server Authority          → signs settle/cancel/create
                                     IMPROVED: Bundle 1 propose_authority + timelock
                                       gives rotation path
                                     GAPS still present: H011 unzeroized keypair,
                                       H012 same key for upgrade + app (until mainnet
                                       3-vault Squads bootstrap actually runs)
```

### Top invariants (verify each in #3)

1. **Server is authoritative for match state; on-chain is source of truth for `deposits_mask` and authority.** — POST-S2-T7 this is fully aligned for refund/cancel. SETTLE still derives winner from off-chain physics; verify winner pubkey is cross-checked against on-chain `players` array at settle time.
2. **Wallet stored in DB == wallet user controls right now.** — POST-S2-T6 enforced via `updateWalletForTgUser` on identity link. Verify all link sites call the helper, not the old short-circuit.
3. **Settlement reaches the actual winner.** — Depends on Invariant 2 (wallet currency) plus null-winner handling (H064).
4. **Refunds always reach players.** — POST-S2-T7 closed. Verify both v1 and v2 paths.
5. **Match state transitions are atomic.** — H015/H016 closed per S2-T7. H072 NoSQL operator injection independent.
6. **Auth required for state-mutating events.** — STILL VIOLATED: H018/H019/H020/H022 unfixed unless explicitly remediated this cycle.
7. **Identity (tgId, wallet) cannot be forged.** — STILL VIOLATED until H001 + H006 explicitly remediated.
8. **Production builds don't ship debug surfaces.** — Likely STILL VIOLATED (H031 DebugAuthOverlay).
9. **Authority rotation is two-step with timelock.** — POST-S2-T1 enforced on-chain. Verify off-chain scripts respect the timelock (don't apply before window).
10. **Rate limits prevent DOS amplification.** — Unchanged.

### Data flow assertions to validate

- `wagerStates[roomId]` is no longer the source of truth for refund `remaining_accounts` — verify NO callers still pass off-chain state.
- New `walletHistory[]` is append-only; no deletes; sized bounded? — verify cap or rotation policy.
- `FunnelEvent` sparse-unique indexes — verify they actually exist in Atlas (deploy ran `ensureIndexes`).
- Stealth bot (`stealthBot.js`) joins lobbies; verify it cannot capture real player funds.
- Arcade JWT secrets — one per game, distinct from main session secret — verify each is set on Render.

---

## Audit #3 Focus Bundle (Phase 1 Auditor Priority)

The brand-new attack surfaces that did not exist at #2. Phase 1 auditors should weight these heavily on top of re-verifying prior CRITs/HIGHs.

### A. Mainnet bootstrap & operational scripts (HIGH priority — pre-launch)

1. **`server/scripts/init-config-mainnet.mjs` (NEW, 201 LOC)** — handles mainnet 3-vault Squads PDAs.
   - Verify env-var validation: TREASURY_VAULT, OPS_VAULT, AUTHORITY pubkey shape + length.
   - Verify idempotency: re-run after partial success doesn't blow rent or land bad state.
   - Confirmation guards: should require interactive YES-typed prompt or explicit `--confirm-mainnet` flag.
   - Verify the script does NOT log private keys; verify it reads server keypair from env not file path that could be world-readable.
   - Check `declare_id!` consistency — does it read the mainnet program ID from env, and refuse if not set?
   - Reference commit: `aa86f39`.

2. **Authority rotation scripts (NEW)** — `propose-authority-v2.mjs`, `accept-authority-v2.mjs`, `apply-config-update-v2.mjs`, `migrate-config-v2.mjs`.
   - Verify two-step flow + timelock window is enforced by client-side OR depends on on-chain check only.
   - Verify scripts refuse to operate on wrong cluster (mainnet check).
   - Reference commits: `e48b6b5`, `cb651b7`.

3. **Destructive Mongo scripts (NEW)** — `wipe-user.mjs`, `dedupe-funnel-oneshots.mjs`, `reconcile-wallets.mjs`.
   - Verify confirmation guards (PROD env check, `--confirm-yes` flag, dry-run default).
   - Verify they don't accept user-controlled input that could let an attacker run them remotely.
   - Verify Mongo connection string is loaded from env, not arg (so bash history doesn't leak it).

4. **`server/scripts/recover-stuck-v2.mjs` (NEW)** — operational permissionless_reclaim driver.
   - Verify it can only be invoked by ops authority, not authority key (would conflate roles).
   - Verify it doesn't bypass timelock.

### B. New admin/auth endpoints

5. **`/api/admin/funnel` (NEW)** — admin-key gated.
   - Verify `requireAdminKey` middleware uses `crypto.timingSafeEqual` (vs prior H083 `!==`).
   - Verify rate-limit shares budget or has dedicated bucket — admin-key brute force window.
   - Verify returned data doesn't leak per-user PII (only aggregates).

6. **`/api/admin/truncate-handles` (NEW)** — destructive Mongo mutation.
   - Verify `requireAdminKey` + double-confirm OR scoped to specific handle.
   - Verify it logs the operator (otherwise insider abuse has no audit trail).

7. **Privy diagnostic logging in `privyAuth.js` (Bug 4 / `590d9d6`)** — logs token audience + claim details on verify failure.
   - Verify these logs don't include the full JWT (signature leak).
   - Verify they don't co-log walletAddress + telegramUserId (worsens H068).
   - Verify they're behind a debug flag or stripped in production.

### C. New socket-io / lifecycle paths

8. **`cleanupRoom` N>2 branch (Bug 6 / `fabb8e1`)** — for N>2, leaver marked eliminated but doesn't trigger settle.
   - Verify match state consistency: eliminated player's HP=0, turn skips them, can't re-fire.
   - Verify they can't reconnect and resume (reconnect path should reject if `eliminated:true`).
   - Verify forfeit-settle gate `room.players.length === 2` is robust to disconnect-after-third-joins edge case.
   - Verify pot stays escrowed and lands on actual winner at natural end (not on the survivor list at cleanup time).

9. **Wallet rotation atomicity (`updateWalletForTgUser`)** — `findOneAndUpdate` with `$set + $push`.
   - Race window analysis: two concurrent rotations of the same tgId — does one win and one lose cleanly? Both atomic-write but second's `findOne` may see stale data, then conflict-check passes but `findOneAndUpdate` operates on different snapshot.
   - Race window analysis: concurrent rotation on tgId X + tgId Y both racing to acquire wallet W — does the conflict check prevent both succeeding?
   - Verify the helper is called on EVERY identity-link path, not just one.
   - Verify `walletHistory[]` is bounded (could grow unbounded on attacker-driven rotation churn).

10. **Escrow creation gated on room-full (`590d9d6`)** — closes dual-PDA bug.
    - Verify no path creates an escrow when room is not yet full (Bug 1 + 2 + 3 root cause).
    - Verify `match_id` collision: with retry on room-full, could two rooms race to claim the same match_id?

11. **S2-T5a v2 settle dispatch (`b9134c3`)** — wired for N>2.
    - Verify settle TX is built once (not per-confirmation-callback) — Bug 1 class.
    - Verify the on-chain `deposits_mask` is used for settle's expected pot computation, matching the cancel path.
    - Verify retry queue (failed-settle) mirrors v1 (or document acceptance per H040).

### D. Arcade hub surface (NEW)

12. **`server/services/arcadeBot.js` (NEW, 521 LOC)** — second Telegraf bot.
    - Verify `ARCADE_BOT_TOKEN` is set in Render env (Phase 1 auditor confirms by reading render.yaml).
    - Verify webhook path is distinct from main bot (no event mixing).
    - Verify per-game leaderboard JWT issuer pattern doesn't allow cross-game token reuse.

13. **`arcadeSession.js` + 3x `standaloneLeaderboard.js` (NEW)** — score submission + JWT issuance.
    - Verify JWT secret per game (`<GAMESLUG>_LEADERBOARD_SECRET`).
    - Verify score submission can't be replayed (nonce or signed payload).
    - Verify the score-submit endpoint validates the game-specific JWT before write.
    - Verify Mongo writes are bounded (rate-limit + score-shape validation, e.g. integer >= 0, no operator injection).

### E. Funnel surface (NEW)

14. **`FunnelEvent` model + `funnel.js` service** — `recordFunnelEvent()` upsert with sparse-unique partial-filter indexes.
    - Verify the indexes are actually deployed (`ensureIndexes` runs at boot, not silent on dev).
    - Verify funnel events don't co-log PII inappropriately (TG ID + wallet on same record).
    - Verify funnel events are GDPR-purgeable when `wipe-user.mjs` runs.

---

## State.json bootstrap hint

For `STATE.json` initialization:

```json
{
  "audit_id": "db-solshot-2026-05-28",
  "audit_number": 3,
  "git_ref": "da04b5e",
  "previous_git_ref": "5f2acec",
  "previous_audit_id": "db-solshot-2026-05-07",
  "tier": "TBD",
  "phase": "0",
  "massive_rewrite": false,
  "stacked_on": ".bulwark-history/2026-05-07-5f2acec/",
  "previous_findings_count": 113,
  "previous_severity_breakdown": { "CRITICAL": 23, "HIGH": 40, "MEDIUM": 30, "LOW": 20 },
  "carry_forward_focus": [
    "wallet_rotation_atomicity",
    "refund_correctness_postS2T7",
    "privy_secret_failopen_postBug4",
    "Nplus2_cleanup_consistency",
    "mainnet_init_script_safety",
    "arcade_leaderboard_auth"
  ]
}
```

---

## TL;DR for the strategist

Of the 23 CRITICALs from #2:
- **5 likely CHECK_RESOLVED** (H009 wallet rotation, H013 refund fail-open, H014 H023 desync, H016 deposit overwrite race, H015 verified-already-protected per S2-T7 commit msg)
- **1 partially resolved** (H002 Privy fail-open — Bug 4/7 closed env mismatch root, but fail-open behavior when secret absent needs explicit re-check)
- **1 partially resolved cross-skill** (H120 — both legs touched: SOS H001 timelock landed, H002 partial above)
- **1 RESOLVED_BY_REMOVAL** (H052 burn TX expiry — SHOT off-chain)
- **~15 RECHECK** (file modified, no explicit fix in commit log → may still be present; line numbers shifted)
- **~3 VERIFY** (file unchanged → likely still open as scored)

Of the 40 HIGHs: most RECHECK status due to widespread file modifications. Specific RESOLVED candidates: H040 (v2 retry — partially via S2-T5a), H061 (remaining_accounts order — partially via S2-T7).

**Brand-new attack surface (audit #3 priority):** mainnet bootstrap scripts (init-config-mainnet, authority rotation), funnel admin endpoint, arcade hub bots + leaderboards, wallet-rotation atomic helper, N>2 cleanup branch, privy diagnostic logging. None existed at #2.

**Threat model shift:** with v2 settle + refund derive-from-mask landed AND mainnet redeploy imminent, the remaining attack surface is concentrated in (1) auth/identity bridge composition (H001/H002/H006 still mostly open), (2) legacy un-auth socket events (H018/H019/H020/H022 unfixed unless explicitly addressed), (3) the new mainnet operational footprint (init-config + scripts + arcade leaderboards). The "fail-open financial path" category from #2 is largely closed.

---

*Generated: 2026-05-28 for Dinh's Bulwark Audit #3*
*Previous: `.bulwark-history/2026-05-07-5f2acec/HANDOVER.md`*
