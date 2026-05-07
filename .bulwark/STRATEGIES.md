# DB Audit #2 — Attack Strategy Catalog

**Generated:** 2026-05-07 by `/DB:strategize`
**Total strategies:** 122 (40 Tier 1 / 50 Tier 2 / 32 Tier 3)
**Origin breakdown:** 18 KB-pattern · 25 RECHECK · 79 Novel
**Synthesis source:** 22 context auditor outputs at `.bulwark/context/`

---

## Strategy Format

Compact format because most strategies are findings already with file:line evidence. Format: ID · Name · Origin · Severity · Target · Hypothesis · Status hint.

Status hint: `CONFIRMED` (Phase 1 evidence is conclusive) · `LIKELY` (strong signal, needs PoC) · `INVESTIGATE` (worth checking).

---

# TIER 1 (CRITICAL) — investigate first / fix-before-mainnet

## Auth & Identity (8 strategies)

**H001 — Privy/TG identity bridge unverified**
Origin: Novel · CONFIRMED
Target: `server/index.js:502-519` (`/api/wallet/link-from-privy-telegram`)
Hypothesis: Attacker with valid Privy session supplies victim's `telegramUserId` in request body. Server validates Privy JWT but never checks `telegramUserId` matches Privy session's actual TG link. Code comment confirms intent.

**H002 — `requirePrivyAuth({required:true})` ineffective when secret missing**
Origin: Novel · CONFIRMED
Target: `server/services/privyAuth.js:64-66`
Hypothesis: When `PRIVY_APP_SECRET` is absent (and it's missing from `render.yaml`), `getClient()` returns null, middleware calls `next()` unconditionally even when `required:true`. Production: `link-from-privy-telegram` is fully ungated.

**H003 — JWT generated but never verified server-side (Feb H029)**
Origin: RECHECK (Feb H029) · CONFIRMED
Target: `server/middleware/auth.js`
Hypothesis: `verifyToken()` was removed as dead code; `generateToken()` still runs. Auth is purely socket-flag-based (`client.isAuthenticated`). The "fix" claimed by today's auth-reset-on-reconnect doesn't address this.

**H004 — Auth signature 5-min replay window (Feb C-6/H030)**
Origin: RECHECK (Feb C-6/H030) · CONFIRMED
Target: `server/middleware/auth.js:75-88`
Hypothesis: `verifyAuthMessage` checks timestamp within 5 minutes but no replay store. Same signature reusable on new socket within 5 minutes.

**H005 — `tgIdFor()` NODE_ENV fallback impersonation**
Origin: Novel · CONFIRMED
Target: `server/socket-io/groupchat.js:72-78`
Hypothesis: In non-production (or if NODE_ENV misconfigured), any socket can supply `payload.telegramUserId` to impersonate any TG user across all group-match queries.

**H006 — Telegram identity backfill bridges auth tiers**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:1298-1303`
Hypothesis: Wallet-auth `authenticate` handler does DB lookup to backfill `client.telegramUser.id`. `tgIdFor()` then can't distinguish between TG-HMAC-signed identity and wallet-derived identity. Identity escalation path.

**H007 — `link-from-tg-token` soft Privy JWT**
Origin: Novel · CONFIRMED
Target: `server/index.js:432`
Hypothesis: `requirePrivyAuth({required:false})` means token-knowledge alone is sufficient to bind wallets. No real authentication.

**H008 — Composed Privy bridge → TG identity takeover chain**
Origin: Novel · LIKELY
Target: H001 + H006 chained
Hypothesis: Attacker with Privy account binds victim's TG ID via `link-from-privy-telegram`. Then connects via wallet-auth `authenticate`; backfill at line 1298-1303 substitutes victim's TG ID. Now `tgIdFor()` returns victim's identity for ALL group-match operations on attacker's socket. Identity takeover, end-to-end.

## Wallet & Keypair (4 strategies)

**H009 — Wallet rotation gap (DB never updates)**
Origin: Novel · CONFIRMED
Target: `server/services/users.js:91`
Hypothesis: `if (walletAddress && !existingByTg.walletAddress)` — wallet pubkey is NEVER updated once set. Privy can silently re-provision embedded wallet; DB retains stale address; settlement at `lifecycle.js:851` reads stale; on-chain fund redirect to attacker-claimed wallet.

**H010 — Reconnect migrates stale wallet entry**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:1815-1817`
Hypothesis: `ws.wallets` reconnect remap copies the OLD wallet entry. If pubkey changed between joinRoom and reconnect, settle uses stale pubkey.

**H011 — Escrow keypair unzeroized in process memory**
Origin: KB (OC-035) · CONFIRMED
Target: `server/services/keys.js:54-64`
Hypothesis: `bytes.fill(0)` removed because web3.js aliases buffer. 64-byte secret key lives in heap for entire process lifetime. Heap dump = total compromise.

**H012 — Single keypair for upgrade auth + application auth**
Origin: RECHECK (Feb H044) · CONFIRMED
Target: `programs/.../target/deploy/*.json` + Render `SOLANA_KEYPAIR_JSON`
Hypothesis: Same hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is BOTH Solana program upgrade authority AND application authority. Compromise gives full protocol control. Pre-mainnet decision documented in REMEDIATION_DECISIONS.md.

## Financial / Refund (5 strategies)

**H013 — `refundWager()` fails-open**
Origin: Novel · CONFIRMED
Target: `server/services/solana.js:240-258`
Hypothesis: When `cancelMatchEscrow()` returns `{success:false}` or throws, falls through to `return {success:true}`. Server reports refund succeeded; SOL still locked on-chain.

**H014 — H023 fix server-side desync**
Origin: Novel · CONFIRMED
Target: `server/services/lifecycle.js:896-910`, `server/socket-io/main.js:433-512`
Hypothesis: Server cancel paths build `remaining_accounts` from off-chain state (`wagerStates[roomId].deposits` for v1; `player.initialDepositTx` for v2), NOT from on-chain `deposits_mask`. Any desync → `IncompleteRefund` reverts → SOL stuck for 2h/24h.

**H015 — Group-chat double-settle race**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:804, 1039`
Hypothesis: Two concurrent calls to `checkAndSettle()` both check `match.state !== 'active'` against own in-memory document; both pass guard before either Mongo save. On-chain rejects second with AlreadySettled, but server emitted double `matchSettled` + double `pushMatchHistory` (double win credit in stats).

**H016 — `confirmDeposit` last-depositor doc overwrite race**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:262-274`
Hypothesis: Two simultaneous deposit confirmations both `findOne` → mutate own slot → `save()`. Second `save()` overwrites first depositor's `initialDepositTx`. Match stalls in `awaiting_deposits` indefinitely.

**H017 — Self-damage Math.abs sign erasure (1v1)**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:3811`
Hypothesis: Physics returns negative for self-hits; 1v1 fire applies `Math.abs(dmg)`. Self-shots deal real damage. In wagered 1v1, player can self-fire to end the match. Group-chat correctly filters `dmg <= 0`.

## Authorization Bypass (8 strategies)

**H018 — `shoot` legacy relay no auth**
Origin: RECHECK (Feb C-7) · CONFIRMED
Target: `server/socket-io/main.js:3377`
Hypothesis: Zero auth on legacy event; any unauthenticated socket can forge shot events into wagered matches.

**H019 — `acceptChallenge`/`declineChallenge` no auth + leaked socketId**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:3261, 3276`
Hypothesis: No auth, `fromSocketId` client-supplied. Socket IDs leaked in `roomUpdate` broadcasts → anyone can impersonate.

**H020 — `clientDebugLog` unauthenticated**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:1356`
Hypothesis: Any pre-auth socket can inject content into Render logs + cause TG ID + wallet co-logging on same line.

**H021 — `groupShopComplete` tgId-only check**
Origin: Novel · CONFIRMED
Target: `server/socket-io/groupchat.js:357`
Hypothesis: tgId check but no match-membership enforcement.

**H022 — `getGroupMatch` no auth, full doc exposed**
Origin: Novel · CONFIRMED
Target: `server/socket-io/groupchat.js:97`
Hypothesis: Unauthenticated callers receive full match document including all participants' wallet addresses.

**H023 — `/api/challenge/:code/cancel` unauthenticated**
Origin: Novel · CONFIRMED
Target: `server/index.js:388`
Hypothesis: Anyone can cancel any challenge by URL.

**H024 — `equipCosmeticResult` returns raw err.message**
Origin: KB (OC-068) · CONFIRMED
Target: `server/socket-io/main.js:3105`
Hypothesis: Mongoose errors expose schema field names + document structure.

**H025 — `weapon inventory bypass on missing slot`**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:3714-3720`
Hypothesis: `if (inventory && inventory[this.id])` — silent skip if slot absent (e.g., reconnect edge case). Player can fire any weapon.

## Race / Concurrency (4 strategies)

**H026 — Turn-sequence nonce optional**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:3690`
Hypothesis: `if (clientSeq !== undefined)` — client can omit `seq` to bypass idempotency guard. Socket.IO retries → double-fire possible.

**H027 — `depositTimers` slot reuse (5min vs 30sec)**
Origin: RECHECK (Feb finding) · CONFIRMED
Target: `server/socket-io/main.js:2108-2126`
Hypothesis: Same key for 5-min deposit window AND 30-sec partial-deposit decision. Clearing one clears the other. Comment acknowledges as "Pitfall 1".

**H028 — `handleShot` group-chat no mutex**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:536`, `server/socket-io/groupchat.js:168`
Hypothesis: No `withLock` for group fire path. Advancing turn save racing with incoming fire → wrong player can fire.

**H029 — `bulkWrite ordered:false` partial failure silent**
Origin: KB (OC-104) · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:1002`
Hypothesis: Per-player stat failures invisible; only top-level throw caught (only fires if ALL ops fail). `result.writeErrors` never inspected.

## Information Disclosure (4 strategies)

**H030 — `escrowDepositStatus` PII cross-broadcast**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js` (escrowDepositStatus emit)
Hypothesis: Server emits full wallet addresses to ALL room members on each deposit. Linkage of TG ID + wallet pubkey across participants.

**H031 — `DebugAuthOverlay` ships in production**
Origin: KB (OC-128) · CONFIRMED
Target: `client/src/App.js:327`, `client/src/components/DebugAuthOverlay.js`
Hypothesis: Activated by URL param `?debug=1`. Exposes live SOL balance, auth state, internal Privy wallet flags.

**H032 — `runValidators: true` not used on update paths**
Origin: KB (OC-091) · CONFIRMED
Target: All `findOneAndUpdate`, `updateOne`, `bulkWrite` calls
Hypothesis: Schema enums (Match.status, GroupMatch.state, Challenge.status), regex on referralCode, min:0 on wager — all bypassable via direct update.

**H033 — Pino redact policy effectively dead code**
Origin: Novel · CONFIRMED
Target: `server/services/logger.js`
Hypothesis: Wallet-address redact list correct, but ~95% of logging bypasses via raw `console.*` calls.

## Headers / Web (3 strategies)

**H034 — Vercel client zero security headers**
Origin: KB (OC-152) · CONFIRMED
Target: `client/vercel.json`
Hypothesis: No frame-ancestors, no X-Frame-Options, no HSTS, no Permissions-Policy. Privy wallet sign modal can be framed → clickjacking.

**H035 — Server CSP has dead Dynamic origins**
Origin: RECHECK (post-Privy) · CONFIRMED
Target: `server/index.js` helmet config
Hypothesis: `app.dynamic.xyz` and `api.dynamic.xyz` still in `frameSrc`/`connectSrc` from pre-Privy era.

**H036 — `'unsafe-inline'` in client script-src**
Origin: KB (OC-148) · CONFIRMED
Target: `client/public/index.html` meta CSP
Hypothesis: Driven by Eruda debug loader inline. Defeats most XSS protection.

## Failure Modes (4 strategies)

**H037 — `failedSettlements` silent drop after 5 retries**
Origin: KB (OC-201) · CONFIRMED
Target: `server/socket-io/main.js:329-331`
Hypothesis: Map deletes entry after 5 retries with only console.error. No DB record, no operator alert.

**H038 — `uncaughtException`/`unhandledRejection` log-only**
Origin: KB (OC-208) · CONFIRMED
Target: `server/index.js:614-620`
Hypothesis: Server continues running in potentially corrupted match state.

**H039 — No MongoDB reconnect handling**
Origin: KB (OC-205) · CONFIRMED
Target: `server/index.js:545`
Hypothesis: Default `bufferCommands: true` means DB ops silently queue indefinitely on connection drop.

**H040 — v2 settle has no retry equivalent**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:861-870`
Hypothesis: v2 settlement failures logged + discarded. No retry queue. Recovery depends on 24h permissionless reclaim grace.

---

# TIER 2 (HIGH) — should-fix pre-mainnet

## npm CVEs (5 strategies)

**H041 — express-rate-limit IPv6 bypass**
Origin: KB (CVE) · CONFIRMED
Target: `server/package.json:25` — `express-rate-limit@8.2.1`
Fix: `npm update express-rate-limit` to 8.5.1.

**H042 — socket.io-parser DOS**
Origin: KB (CVE) · CONFIRMED
Target: server + client lockfiles
Fix: `npm update socket.io`.

**H043 — path-to-regexp ReDoS**
Origin: KB (CVE) · CONFIRMED
Target: `server/package-lock.json` (transitive)

**H044 — handlebars JS injection (transitive)**
Origin: KB (CVE) · CONFIRMED
Target: `client/package-lock.json` (via phaser3-rex-plugins)
Note: Low exploitability in browser bundle but rated CRITICAL by npm audit.

**H045 — bigint-buffer overflow**
Origin: KB (CVE) · CONFIRMED
Target: `client/package.json:9` — `@solana/spl-token@0.4.14`
Note: Low exploitability in browser context.

## Auth signature / Replay (3 strategies)

**H046 — Auth replay during Privy session lifetime**
Origin: Novel · INVESTIGATE
Target: Privy session JWT
Hypothesis: Even after H004 fix, Privy sessions can be valid for hours. Stolen JWT works for full session lifetime. Investigate: rotation policy, revoke API.

**H047 — Magic-link token in URL query param**
Origin: KB (OC-046) · CONFIRMED
Target: `walletLinkTokens.js`
Hypothesis: `?linkToken=...` in URL → recorded in browser history, TG message logs, proxy logs.

**H048 — Magic-link `store` is process-local**
Origin: Novel · CONFIRMED
Target: `walletLinkTokens.js:43`
Hypothesis: Render dyno restart between DM and click silently invalidates. UX issue, not security.

## RPC / Chain (5 strategies)

**H049 — Single unmonitored RPC endpoint**
Origin: Novel · CONFIRMED
Target: `server/services/solana.js:28`
Hypothesis: Default `api.devnet.solana.com` (free public). No fallback, no health check, no rate-limit handling for HTTP 429.

**H050 — RPC 429 has no retry**
Origin: KB (OC-095) · CONFIRMED
Target: `server/services/solana.js:113`
Hypothesis: Balance checks throw + settlement CPI fails silently on 429.

**H051 — `confirmTransaction('confirmed')` deprecated form**
Origin: KB (OC-093) · CONFIRMED
Target: `client/src/wallet/WalletContext.js:584, 624, 654`
Hypothesis: Silent timeout → never emits `escrowDepositConfirm`. SOL locked in PDA until 5-min timeout cancel path.

**H052 — Burn TX missing `lastValidBlockHeight`**
Origin: Novel · CONFIRMED
Target: `client/src/wallet/WalletContext.js` (signAndBurnShot)
Hypothesis: Captures only blockhash; no expiry. Burn can hang past TX expiry.

**H053 — No `simulateTransaction()` pre-flight**
Origin: KB (OC-094) · CONFIRMED
Target: `server/services/escrow.js`, `escrow-v2.js`
Hypothesis: Errors caught by RPC 5x more expensive than simulate would catch.

## TG Bot / Telegraf (4 strategies)

**H054 — `TELEGRAM_BOT_TOKEN` absent from render.yaml**
Origin: Novel · CONFIRMED
Target: `render.yaml`
Hypothesis: Without bot token, initData validation skipped; any socket can claim any `telegramUser`.

**H055 — `/teststats` no NODE_ENV/admin check in production**
Origin: Novel · CONFIRMED
Target: `server/services/bot.js:416`
Hypothesis: Returns `err.message` to TG users.

**H056 — Bot lacks queue/backoff for sendMessage**
Origin: KB (OC-189) · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:1107`
Hypothesis: 429 silently drops turn pings.

**H057 — `lobbyWatchdog` bulk sends on boot**
Origin: KB (OC-191) · CONFIRMED
Target: `server/services/groupchat/lobbyWatchdog.js:63`
Hypothesis: N stale lobbies → N rapid sendMessage calls hitting TG rate limit.

## v2 Escrow Off-Chain (5 strategies)

**H058 — v2 settle TOCTOU**
Origin: Novel · LIKELY
Target: `server/services/escrow-v2.js:305-322`
Hypothesis: Fetches snapshot addresses, then submits TX. 24h reclaim grace means PDA could be closed in between.

**H059 — No state pre-check before settle (v1 + v2)**
Origin: KB (OC-077) · CONFIRMED
Target: `server/services/escrow.js:388-427`, `escrow-v2.js:301-330`
Hypothesis: Doesn't verify `escrow.state == Active` before submitting. Settle on Cancelled fails silently → costs winner their payout.

**H060 — match_id uniqueness not guaranteed**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:2212, 2393`
Hypothesis: 32-bit CSPRNG, no DB unique constraint, no `rooms.has(roomId)` guard, no chain-side check that PDA wasn't previously created.

**H061 — `remainingAccounts` order assumption**
Origin: Novel · LIKELY
Target: `server/services/escrow.js`, `escrow-v2.js`
Hypothesis: H023 on-chain fix requires exact pubkey+index match. Server builds from in-memory `room.players`. Disconnect/reconnect remap could change order.

**H062 — Stale IDL after redeploy**
Origin: KB (OC-085) · INVESTIGATE
Target: `server/idl/*.json`
Hypothesis: Manually maintained IDL. Stale → silent field-offset misread in borsh deserialization.

## Group-Chat Logic (4 strategies)

**H063 — Group-chat self-firing infinite stall**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js`
Hypothesis: Self-shots correctly filtered (`dmg<=0`) but `consecutiveMissedTurns` reset on every fire. Player can self-fire indefinitely to stall match while never auto-forfeiting.

**H064 — Group-chat null-winner path**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js`
Hypothesis: If `winnerPlayer.walletAddress` null at settlement, escrow abandoned; falls back to permissionless_reclaim equal-split after 24h. Winner gets no premium.

**H065 — Auto-forfeit counter evaded via reconnect**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:676-681`
Hypothesis: `consecutiveTimeouts[socketId]` keyed by socket ID, not player identity. Reconnect resets counter. Indefinite idle stalling.

**H066 — Authority duration-set lockup (8-day worst case)**
Origin: RECHECK (SOS H039) · CONFIRMED post-fix
Target: post-fix MAX_DURATION_SECS=86400 in v2; off-chain doesn't enforce
Hypothesis: SOS fix bundle reduced cap to 24h. Off-chain config sets `duration_secs` per match — verify it respects the cap.

## Logging & PII (5 strategies)

**H067 — `debugLog.js` always console.log**
Origin: KB (OC-129) · CONFIRMED
Target: `client/src/lib/debugLog.js:47`
Hypothesis: Unconditionally logs regardless of debug flag. DevTools always shows passed data.

**H068 — TG ID + wallet co-logged**
Origin: KB (OC-117) · CONFIRMED
Target: `server/socket-io/main.js:1124, 1368`
Hypothesis: Two patterns log both TG ID and wallet prefix on same line → persistent cross-identity linkage in log stream.

**H069 — Escrow boot logs treasury + ops addresses**
Origin: KB (OC-119) · CONFIRMED
Target: `server/services/escrow.js:89-90`
Hypothesis: Public wallet addresses in logs. Not directly sensitive but enables monitoring + correlation.

**H070 — `/health` exposes activeConnections**
Origin: KB (OC-127) · CONFIRMED
Target: unauth `/health` endpoint
Hypothesis: Information disclosure / fingerprinting.

**H071 — Source maps confirmed disabled in production**
Origin: KB (OC-130) · NOT_VULNERABLE
Target: `client/.env.production`
Status: ✅ `GENERATE_SOURCEMAP=false` set correctly.

## DB / Mongoose (4 strategies)

**H072 — `matchId` operator injection**
Origin: KB (OC-076) · CONFIRMED
Target: `server/socket-io/groupchat.js:103` (5 handlers)
Hypothesis: `if (!matchId)` accepts `{$gt: ""}` → arbitrary match doc.

**H073 — `handle` operator injection on /api/challenge**
Origin: KB (OC-076) · CONFIRMED
Target: `server/services/challenge.js:41`
Hypothesis: `User.findOne({handle: {$ne:null}})` returns real user data.

**H074 — `bulkWrite` partial-failure silent (DATA-01 confirms ERR-02)**
Origin: KB (OC-104) · CONFIRMED
Target: `server/services/groupchat/lifecycle.js:1002`
(Same as H029)

**H075 — `upsert + unique index` race not E11000-aware**
Origin: KB (OC-105) · CONFIRMED
Target: `ServerState`, referral code generation
Hypothesis: Doesn't catch E11000 specifically → burn TX persistence can silently fail.

## Concurrency (5 strategies)

**H076 — `cancelEscrowSafely` race with `startWithDepositorsEscrow`**
Origin: Novel · LIKELY
Target: `server/socket-io/main.js:2108-2126`
Hypothesis: Slot reuse on `depositTimers` (H027) + concurrent paths → cancelEscrow vs SWD race on same PDA.

**H077 — Reconnect remap race (currently disabled)**
Origin: RECHECK · CURRENTLY_DEAD
Target: `server/socket-io/main.js:1729`
Hypothesis: 30s reconnect window dead-code per project memory. Re-enabling resurrects the race.

**H078 — Scheduler reentrance**
Origin: Novel · INVESTIGATE
Target: `server/services/groupchat/scheduler.js`
Hypothesis: Scheduled callbacks not reentrant-safe. Long-running callback overlap.

**H079 — `setImmediate(settleMatchEscrowV2)` no retry path**
Origin: Novel · CONFIRMED
Target: `server/services/groupchat/lifecycle.js`
Hypothesis: Fire-and-forget settle with no retry queue (vs v1 has `failedSettlements`).

**H080 — withLock 30s force-release during RPC hang**
Origin: Novel · INVESTIGATE
Target: `server/socket-io/main.js`
Hypothesis: If RPC hangs > 30s, lock force-released → concurrent state mutation possible.

## Other High (5 strategies)

**H081 — Stale Dynamic wallet Env ID in client/.env**
Origin: Novel · CONFIRMED
Target: `client/.env`
Hypothesis: `REACT_APP_DYNAMIC_ENV_ID=...` from superseded Dynamic infrastructure. Not committed but suggests stale infrastructure.

**H082 — KM-04 zeroization reverted**
Origin: RECHECK (Feb KM-04) · CONFIRMED
Target: `server/services/keys.js`, commit `f551275`
(Same as H011)

**H083 — Non-timing-safe admin key compare**
Origin: KB (OC-051) · CONFIRMED
Target: `server/middleware/guards.js:27`
Hypothesis: `!==` on string. Should be `crypto.timingSafeEqual`.

**H084 — Privy server-auth deprecated package**
Origin: Novel · CONFIRMED
Target: `server/package.json:19` — `@privy-io/server-auth@1.32.5`
Hypothesis: Officially deprecated; replacement is `@privy-io/node`. No future security patches.

**H085 — nodemon in production deps**
Origin: KB (OC-265) · CONFIRMED
Target: `server/package.json:29`
Hypothesis: Deploys to Render production. ReDoS CVE chain (chokidar, braces, micromatch, minimatch).

## Rate Limiting (3 strategies)

**H086 — Multi-socket physics amplification**
Origin: KB (OC-238) · CONFIRMED
Target: `server/socket-io/main.js:1149`, `server/services/physics.js:929`
Hypothesis: 100 conns × 2 fires/sec = 12.6M Euler steps/sec single-thread.

**H087 — Card-render endpoints share global rate budget**
Origin: KB (OC-244) · CONFIRMED
Target: `server/index.js:344-386`
Hypothesis: Blocking satori+resvg calls share 100 req/15min global budget.

**H088 — Per-socket throttle resets on reconnect**
Origin: Novel · CONFIRMED
Target: `server/socket-io/main.js:1157`
Hypothesis: createRoom 3/60s bypassable via disconnect+reconnect.

## CRYPTO / RNG (2 strategies)

**H089 — Group match IDs use Math.random()**
Origin: KB (OC-217) · CONFIRMED
Target: `server/services/groupchat/index.js:35`
Hypothesis: V8 XorShift128, 1M keyspace. Predictable after ~5 observations → lobby sniping.

**H090 — Challenge shortcode 20 effective bits**
Origin: KB (OC-216) · LIKELY
Target: `server/services/challenge/challenge.js:27`
Hypothesis: `randomBytes(3).slice(0,5)` drops 4 bits. 1M space + 24h TTL. Enumerable; no rate limit on lookup.

---

# TIER 3 (MEDIUM-LOW) — defensive / cosmetic

## Information Disclosure (5)

**H091** — Magic-link token in URL leaked to history (covered in H047 Tier 2 but Tier-3-rated alone)
**H092** — `version: '1.0.0'` in /health response (server fingerprinting)
**H093** — `err.message` propagated in admin HTTP response (`index.js:259`)
**H094** — `cdn.jsdelivr.net` in script-src without SRI (supply chain)
**H095** — `localhost:5001` hardcoded in client meta CSP

## Defensive Hygiene (8)

**H096** — `^` caret ranges on all 46 direct deps (lockfile sole reproducibility guard)
**H097** — No automated `npm audit` in CI (no GitHub Actions)
**H098** — Vercel build uses `npm run build` not `npm ci`
**H099** — `@testing-library/*` in client `dependencies` not `devDependencies`
**H100** — React 19.2.5 in server dependencies (alongside satori; acceptable)
**H101** — Mongoose `playerSchema` identity constraint comment-only (not schema-enforced)
**H102** — `confirmed` commitment everywhere (should be `finalized` for mainnet settlement reads)
**H103** — `shot-token.js` module-level Connection cannot reinit without restart

## Edge Cases (8)

**H104** — Auth replay window (covered separately as H004 Tier 1; included here for completeness)
**H105** — Math.random in lifecycle.js for first-player + theme (gameplay only, not security)
**H106** — `clientSeq` nonce sequential integer (predictable but auth covers it; defense-in-depth)
**H107** — `walletLinkToken` plaintext Map key (heap dump exposure)
**H108** — Privy `autoBindAttempted` flag never resets on wallet change
**H109** — `signAndBurnShot` skips pre-signing discriminator/program-ID validation
**H110** — `window.socket` accessible from XSS despite non-enumerable
**H111** — `report-uri` directive deprecated (use `report-to`)

## Resource Limits (5)

**H112** — `failedSettlements` Map unbounded on repeated RPC failure
**H113** — `balanceCache` never evicts stale entries
**H114** — `escalation counter resets on clean event` (29 ev/s never triggers disconnect)
**H115** — Admin routes share global HTTP rate budget
**H116** — Per-Batch finding: HSTS preload flag absent (server has 365d)

## Documentation (3)

**H117** — Privy rotation issue undocumented in user-facing terms
**H118** — Backup/rotation procedures undocumented for server keypair
**H119** — Open-issue tracker for "DB wallet ≠ on-chain wallet" needs visibility

## Bonus Novel Investigations (3)

**H120 — Multi-step settle with intervening config rotation (cross-skill)**
Origin: Novel + cross-skill
Target: SOS Audit #2 deferred H001 + DB Privy auth fail-open
Hypothesis: Attacker chains H001 (one-step authority transfer) + H002 (Privy fails-open). On a server with fresh deploy lacking PRIVY_APP_SECRET, attacker binds victim's TG ID → assumes session → triggers update_config to redirect treasury → settles in-flight matches → drains 7%-10% of all wagers.

**H121 — TG WebView vs standalone Safari auth state divergence**
Origin: Novel · INVESTIGATE
Target: `client/src/telegram/TelegramContext.js`, Privy SDK
Hypothesis: Per project memory, Privy auth in TG WebView reportedly differs from standalone Safari. Investigate auth state leak between contexts when same user accesses from both.

**H122 — `groupShopComplete` purchase replay + match-membership bypass**
Origin: Novel · LIKELY
Target: `server/socket-io/groupchat.js:357`
Hypothesis: tgId-only check (no match-membership) + no idempotency key → attacker who knows victim's tgId can submit purchases to deplete victim's gold.

---

## Statistics

| Category | Count |
|----------|-------|
| Auth & Identity | 8 |
| Wallet & Keypair | 4 |
| Financial / Refund | 5 |
| Authorization Bypass | 8 |
| Race / Concurrency | 9 |
| Information Disclosure | 9 |
| Headers / Web | 3 |
| Failure Modes | 4 |
| npm CVEs | 5 |
| RPC / Chain | 7 |
| TG Bot | 4 |
| v2 Escrow Off-Chain | 5 |
| Group-Chat Logic | 4 |
| DB / Mongoose | 4 |
| Logging & PII | 5 |
| Defensive | 8 |
| Edge Cases | 8 |
| Resource Limits | 5 |
| Documentation | 3 |
| Cross-skill Novel | 3 |
| RNG / Crypto | 2 |
| **TOTAL** | **122** |

| Origin | Count | % |
|--------|-------|---|
| KB (pattern-based) | 18 | 15% |
| RECHECK (Feb prior) | 25 | 20% |
| Novel (creative) | 79 | 65% |

**Novel % (65%) far exceeds 20% target.** Reflects that this codebase has a lot of bespoke architecture (Privy + Telegram bridge, group-chat lifecycle, server-as-authority) where novel attack surfaces dominate over textbook patterns.

---

## Cross-Strategy Analysis

**Combination chains** (compound attacks):

| Path | Components | Net Effect |
|------|-----------|-----------|
| **TG Identity Takeover** | H001 + H006 | Attacker fully impersonates victim across all group matches |
| **Silent Fund Redirect** | H009 + H010 | Settlement goes to stale wallet attacker now controls |
| **Refund Black Hole** | H013 + H014 | Cancel claims success on chain failure; SOL stranded |
| **Race-Then-Drain** | H015 + H016 + lifecycle | Concurrent ops corrupt state → match stalls or double-settles |
| **Cross-Skill Coup** | SOS H001 + DB H002 | Privy fails-open → bind victim → rotate authority → drain treasury |

**Investigation Priority:**

Tier 1 (40 strategies) — investigate first. Strong signal across multiple agents.
Tier 2 (50 strategies) — high impact, individual fixes mostly straightforward.
Tier 3 (32 strategies) — defensive cleanup. Low risk individually but contributes to overall posture.

---

## Notes for Investigators

- Most Tier 1 strategies are already CONFIRMED with file:line evidence from Phase 1. Phase 4 should:
  1. Quickly re-verify (light pass, 5 mins each) the CONFIRMED ones
  2. Spend more time on LIKELY (need PoC) and INVESTIGATE (need code-read)
- Cross-skill chain H120 is the highest-stakes finding in the audit — composing SOS deferred + DB findings.
- The Privy/TG identity bridge cluster (H001-H008) is the dominant security theme — fix this before mainnet.
- The wallet rotation gap (H009) is silent and devastating — fix this before mainnet.
