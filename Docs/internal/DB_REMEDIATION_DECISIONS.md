# SolShot Off-Chain Audit Remediation Decisions

> Companion to `.bulwark/FINAL_REPORT.md`. Records which DB Audit #2 findings have been fixed in this commit and which are explicitly deferred to a pre-mainnet hardening pass, with rationale for each. Mirrors the structure of `Docs/internal/REMEDIATION_DECISIONS.md` (the SOS audit decisions doc).

**Audit reference:** Dinh's Bulwark audit #2, 2026-05-07 (`.bulwark/FINAL_REPORT.md`)
**Code reference:** This commit (post-DB-fix bundle)
**Status:** 15 findings fixed in source; 8 critical-but-deferred to pre-mainnet bundles; ~90 lower-severity items prioritized in Bundles B/C/D.

---

## Section 1 — Fixed in This Commit (15 findings)

The impactful + small fixes from DB Audit #2, applied immediately. All server modules pass `node --check` syntax verification.

| ID | Title | Fix | Files |
|---|---|---|---|
| **H001** | Privy/TG identity bridge unverified | Added Privy `getUser()` lookup to verify `telegramUserId` matches the Privy session's actual linked Telegram account. Returns 403 `tg_id_mismatch` on failure. | `server/index.js:521-548` (`/api/wallet/link-from-privy-telegram`) |
| **H002** | `requirePrivyAuth({required:true})` ineffective when secret missing | Production now refuses with 503 `auth_not_configured` if Privy isn't configured AND `required:true`. Dev mode passes through with loud warning. | `server/services/privyAuth.js:64-83` |
| **H013** | `refundWager()` fails-open | Cancel CPI errors now propagate to caller via `{success:false, error}`. The dev-mode no-escrow path warns when called with escrow enabled but no matchId/playerAddresses. | `server/services/solana.js:240-275` |
| **H018** | `shoot` legacy relay no auth | Added `requireAuth` + turn-ownership check (`ms.currentTurn === client.id`). Spectators / out-of-turn callers silently dropped. | `server/socket-io/main.js:3387-3416` |
| **H019** | `acceptChallenge`/`declineChallenge` no auth | Added `requireAuth` to both handlers + strict type check on client-supplied `fromSocketId`. | `server/socket-io/main.js:3265-3293` |
| **H020** | `clientDebugLog` unauthenticated log injection | Added `client.isAuthenticated` gate at handler entry — pre-auth sockets silently drop. | `server/socket-io/main.js:1356-1374` |
| **H022** | `getGroupMatch` no auth, full doc exposed | Added `client.isAuthenticated` gate. Errors with `auth_required` for unauthenticated callers. | `server/socket-io/groupchat.js:97-110` |
| **H023** | `/api/challenge/:code/cancel` unauthenticated | Endpoint now requires caller identity in body (`wallet` or `tgUserId`). `cancelChallenge()` validates against `challengerWallet` / `challengerTgUserId` via `$or` guard. | `server/index.js:388-405` + `server/services/challenge/challenge.js:240-264` |
| **H026** | Turn-sequence nonce optional | `data.seq` is now REQUIRED. Previously `if (clientSeq !== undefined)` allowed clients to omit seq and bypass idempotency. | `server/socket-io/main.js:3711-3724` |
| **H031** | DebugAuthOverlay ships in production | Wrapped in `process.env.NODE_ENV !== 'production'` conditional render. `?debug=1` param can no longer trigger it on production builds. | `client/src/App.js:327-330` |
| **H032** | `runValidators: true` not used on update paths | Set globally via `mongoose.set('runValidators', true)`. Schema enums + regex now enforced on all `findOneAndUpdate` / `updateOne` / `bulkWrite` calls. | `server/index.js:574-579` |
| **H035** | Server CSP has dead Dynamic origins | Replaced `app.dynamic.xyz` / `api.dynamic.xyz` with `auth.privy.io` / `api.privy.io` in CSP `connectSrc` + `frameSrc`. | `server/index.js:160-168` |
| **H041** | express-rate-limit IPv6 bypass | Bumped `^8.2.1` → `^8.5.1` (npm audit advisory GHSA-46wh-pxpv-q5gq). Verified installed: 8.5.1. | `server/package.json:25` + `package-lock.json` |
| **H055** | `/teststats` no admin guard in production | Added `NODE_ENV === 'production'` check + `ADMIN_TELEGRAM_IDS` env allowlist. Non-admin callers in prod silently ignored. | `server/services/bot.js:352-368` |
| **H072** | `matchId` operator injection | Added `typeof matchId !== 'string'` strict check in `getGroupMatch`. Returns `missing_or_invalid_matchId`. (Same edit as H022 — both gate the same handler.) | `server/socket-io/groupchat.js:103-110` |
| **H083** | Non-timing-safe admin key compare | Replaced `!==` with `crypto.timingSafeEqual`. Length-mismatch fails without revealing correct length. | `server/middleware/guards.js:25-39` |

**Net effect:** 16 findings (H001, H002, H013, H018, H019, H020, H022, H023, H026, H031, H032, H035, H041, H055, H072, H083) closed in source. Two additional fixes beyond the original 15-fix bundle landed (H072 came as a free side-effect of H022 in the same handler).

---

## Section 2 — Deferred to Pre-Mainnet Hardening (~30 findings, organized by bundle)

These are real DB Audit #2 findings the team has explicitly chosen NOT to fix in this commit. Each is in one of four bundles based on the audit's recommended remediation roadmap.

### Bundle A — Pre-mainnet must-fix (small, deferred for sequencing)

These are small fixes the audit calls out but require a bit more thought / coordinated change than the 15-fix bundle could absorb. ~5 items.

| ID | Title | Why deferred | Pre-mainnet plan |
|---|---|---|---|
| **H014** | H023 fix-bundle ↔ server desync | Server cancel paths build `remaining_accounts` from in-memory `wagerStates[roomId].deposits` (v1) and Mongo `player.initialDepositTx` (v2). On-chain SOS H023 fix now requires `len() == count_ones(on-chain mask)`. Server should fetch on-chain mask before constructing the array. **This is the dual-audit boundary defect** — needs careful change to both server + client. | Add `getEscrowState(matchId)` call before refund builder; use on-chain `deposits_mask` directly. Test the non-contiguous-mask scenario on devnet (currently UNRECOVERABLE per server logs). |
| **H009** | Wallet rotation gap (DB never updates) | `users.js:91` only sets walletAddress if currently null. Privy can re-provision; DB retains stale; settlement goes to wallet user no longer controls. **Fix is semantically delicate** — naive update could break old TG-bind paths or leak across users with same TG ID. | Add `updateWalletForTgUser()` helper with versioned audit trail. Coordinate with Privy SDK to detect rotations. Add reconcile script. |
| **H010** | Reconnect migrates stale wallet entry | `ws.wallets` reconnect remap copies OLD wallet. Same root cause as H009. | Bundled with H009 fix. |
| **H016** | `confirmDeposit` last-depositor doc overwrite | Two simultaneous deposit confirmations both `findOne → mutate → save()`. Second save overwrites first depositor's `initialDepositTx`. Match stalls indefinitely. | Refactor `confirmDeposit` to use `findOneAndUpdate` with `$set: {'players.$.initialDepositTx': txSig}` under `$elemMatch` guard. Couple of lines, but needs careful test. |
| **H015** | Group-chat double-settle race | Three async paths (`handleShot`, `handleForfeit`, `handleIdleTimeout`) each call `checkAndSettle()` on a stale in-memory match document. Concurrent calls all pass the state guard. | Convert settle to `findOneAndUpdate({state:'active'},{state:'settled'})` atomic; fail safely if doc moved. |

### Bundle B — Architectural pre-mainnet (design changes)

Items that need design-level changes, not just config tweaks.

| ID | Title | Why deferred | Pre-mainnet plan |
|---|---|---|---|
| **H003** | JWT generated but never verified server-side | Removing `verifyToken()` in Phase 4 hardening was correct (it was dead code), but `generateToken()` still runs and emits a JWT to clients who never use it. Proper fix is to either implement real JWT verification or remove generation entirely. | Decide: real JWT-based auth OR socket-flag-based auth (current). If staying with flag-based, remove `generateToken` to avoid implying auth that doesn't exist. |
| **H004** | Auth signature 5-min replay window | Need a `consumed_signatures` Set (in-memory or Redis) keyed by `(wallet, signature)` that rejects re-use within the 5-minute window. Couple lines but state management deserves attention. | Add `consumedSignatures` Set with TTL eviction. Use Redis if multi-process. |
| **H012** | Single keypair = upgrade auth + application auth | Acknowledged pre-mainnet posture per JJ. Same finding as SOS H044/H046 (already deferred to mainnet bundle in `Docs/internal/REMEDIATION_DECISIONS.md`). | Same plan as SOS-side: Squads multisig migration, separate keys for upgrade vs app auth. |
| **H017** | Self-damage Math.abs sign erasure (1v1) | Game-design question: should self-fire be allowed? If no, return early when `tank.id == shooter.id`. If yes, ensure damage doesn't double-count via Math.abs. | Decide game-design intent. ~3 line fix once decided. |
| **H030** | `escrowDepositStatus` PII broadcast | Server emits full wallet pubkeys to all room members on every deposit. PII linkage. | Strip wallet field from broadcast; emit only `{playerIndex, confirmed}` boolean. |

### Bundle C — Defensive cleanup (npm + headers + hygiene)

| ID | Title | Pre-mainnet plan |
|---|---|---|
| H042 | socket.io-parser DOS | `npm update socket.io` — bumps transitive socket.io-parser past advisory. |
| H043 | path-to-regexp ReDoS | Update Express transitive — likely arrives via Express minor bump. |
| H044 | handlebars JS injection (transitive of phaser3-rex-plugins) | Low exploitability in browser bundle. Audit phaser3-rex-plugins for newer release without handlebars. |
| H045 | bigint-buffer overflow | `@solana/spl-token` newer version. Low exploitability in browser. |
| H056 | Bot lacks queue/backoff for sendMessage | Wrap `bot.telegram.sendMessage` with a queue + 429 backoff. |
| H057 | lobbyWatchdog bulk sends on boot | Throttle the boot-recovery sweep to N/sec. |
| H034 | Vercel client zero security headers | Add `frame-ancestors`, `X-Frame-Options`, HSTS, Permissions-Policy via `client/vercel.json`. ~10 lines. |
| H036 | `'unsafe-inline'` in client script-src | Remove Eruda inline loader OR move to nonce-based CSP. |
| H047 | Magic-link token in URL query param | Move to fragment (`#linkToken=...`) — never sent to server, not logged in proxies. |
| H048 | Magic-link store is process-local | Move to Redis or short-TTL Mongo collection. |
| H049 | Single unmonitored RPC endpoint | Add fallback RPC + health check. Helius / Triton / QuickNode. |
| H050 | RPC 429 has no retry | Add exponential backoff wrapper around all RPC calls. |
| H051 | `confirmTransaction('confirmed')` deprecated form | Use `lastValidBlockHeight` + commitment object form. |
| H058 | v2 settle TOCTOU | Single-RPC fetch+submit pattern. |
| H059 | No state pre-check before settle | Add `escrow.state == Active` check before submitting settle TX. |
| H060 | match_id uniqueness not guaranteed | Add Mongo unique index + 16-char IDs (per project memory recommendation). |
| H067 | `debugLog.js` always console.log | Wrap in `if (debugFlag)`. |
| H068 | TG ID + wallet co-logged | Use logger.redact on these patterns. |
| H070 | `/health` exposes activeConnections | Strip from public endpoint. |
| H078 | Scheduler reentrance | Add `if (running) return` guard. |
| H085 | nodemon in production deps | Move to `devDependencies`. |
| H088 | Per-socket throttle resets on reconnect | Key throttle by wallet pubkey, not socket ID. |
| H089 | Group match IDs use Math.random() | Switch to `crypto.randomBytes`. |
| H090 | Challenge shortcode 20 effective bits | Bump to `randomBytes(4)` → 8 hex chars. |
| Plus ~15 other Tier 3 items | Defensive / cosmetic | Apply per finding when convenient. |

### Bundle D — Cross-skill mainnet hardening

These compose with SOS deferred items. Tracked in both decision docs.

| ID | Title | Compose with SOS finding |
|---|---|---|
| **H120** | Cross-skill chain (DB Privy + SOS H001) | Bundle D paired with SOS Bundle 1 (authority hardening). H002 fix already closed the immediate Privy fail-open; this entry tracks the broader composition for mainnet design. |
| **H011** | Escrow keypair unzeroized in process memory | Same root as SOS H044 (single hot wallet). Paired with SOS authority migration. |
| **H082** | KM-04 zeroization reverted | Same as H011 — depends on web3.js change OR architectural rotation policy. |
| **H084** | `@privy-io/server-auth` deprecated | Migrate to `@privy-io/node` (replacement library). |

---

## Section 3 — NOT VULNERABLE / Closed in Pre-Scan (4 items)

| ID | Title | Why not vulnerable |
|---|---|---|
| H071 | Source maps in production | ✅ `GENERATE_SOURCEMAP=false` confirmed in `client/.env.production` |
| H098 | qs prototype pollution | ✅ qs is 6.14.2 (above 6.10.3 threshold) — verified by DEP-01 agent |
| H110 | `window.solWallet` exposure | ✅ REMOVED — code now uses context hook (positive remediation since Feb) |
| Various | Secrets in source | ✅ NO `.env*` tracked; 2 doc references verified non-secrets |

---

## Section 4 — Mainnet Hardening Roadmap (Cross-Audit Summary)

When SolShot moves to mainnet, the following work bundles need to land. Many compose with the SOS Audit #2 deferrals (see `Docs/internal/REMEDIATION_DECISIONS.md` Section 5):

### Bundle 1 (SOS + DB) — Authority hardening

- SOS H001 (one-step authority transfer) → propose/accept + timelock
- DB H002 + H003 + H004 (auth verification correctness)
- DB H011 (keypair zeroization)
- SOS H044 / DB H012 (single hot wallet) → Squads multisig
- DB H049 + H050 (RPC fallback + retry)

### Bundle 2 (DB) — Wallet & Identity

- DB H001 (already closed) but full design review: should server EVER trust client-supplied identity, or always derive from JWT?
- DB H009 + H010 (wallet rotation handling)
- DB H006 (TG identity backfill — clarify auth tier model)
- DB H120 (cross-skill chain — composes with all above)

### Bundle 3 (DB) — Refund & Settle correctness

- DB H014 (H023 fix-bundle desync)
- DB H015 + H016 (race conditions on settle / deposit)
- DB H017 (self-damage Math.abs)
- DB H037 + H040 (failedSettlements + v2 retry queue)

### Bundle 4 (Client + Headers)

- DB H034 (Vercel security headers)
- DB H030 (PII broadcast)
- DB H031 (already closed) — verify CI doesn't accidentally re-include
- DB H047 (magic-link URL param)

---

## Cross-Reference

For full attack walkthroughs, evidence, and severity calibration, see `.bulwark/FINAL_REPORT.md` and individual context files at `.bulwark/context/H*-*.md`.

For prior audit context (Feb 2026), see `.bulwark-history/2026-02-24-ecfd03b/FINAL_REPORT.md`.

For SOS / on-chain decisions, see `Docs/internal/REMEDIATION_DECISIONS.md`.

For BOK math invariants, see `.bok/reports/2026-05-07-report.md`.
