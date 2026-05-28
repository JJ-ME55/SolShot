---
task_id: db-bundle-1-auth
focus: auth-identity-composition
files_analyzed:
  - server/services/privyAuth.js
  - server/services/walletLinkTokens.js
  - server/services/users.js
  - server/middleware/guards.js
  - server/middleware/auth.js
  - server/index.js (link-from-tg-token, link-from-privy-telegram, /admin/funnel, /admin/truncate-handles, /api/arcade/{register,mint-session,session-handoff,session-validate} routes)
  - server/socket-io/main.js ('authenticate' handler + tgIdFor backfill region)
  - server/socket-io/groupchat.js (tgIdFor helper)
  - server/services/arcadeSession.js
  - server/services/games/basketball-standalone/standaloneLeaderboard.js
  - server/services/bot.js (magic-link mint points)
  - server/scripts/init-config-mainnet.mjs
  - server/scripts/propose-authority-v2.mjs
  - server/scripts/accept-authority-v2.mjs
  - server/scripts/find-privy-owner.mjs
  - server/scripts/dump-trenchdemon.mjs
  - server/models/User.js (walletAddress/telegramUserId indexes)
finding_count: 16
severity_breakdown: {critical: 3, high: 4, medium: 6, low: 3}
---
<!-- CONDENSED_SUMMARY_START -->
# Auth / Identity — Condensed Summary (DB Audit #3)

## Trust Boundaries (post-Bug-7)

The post-S2-T6/T7 + Bug-7 trust model is materially stronger but still has the four legacy auth gaps that never moved:

| Zone | Authority | Notable change since #2 |
|---|---|---|
| **Z0 Public** | Bearer everyone | Helmet+CORS+global 100 req/15min limiter. Admin endpoints share the same global bucket — no dedicated brute-force budget. |
| **Z1 Authenticated client** | Privy JWT *or* magic-link CSPRNG *or* TG initData HMAC *or* wallet signature | **H002 closed**: `requirePrivyAuth({required:true})` now returns 503 in production when Privy isn't configured (was: silent next()). Bug-7 closed the env-mismatch root cause. H003 + H004 (legacy wallet-signature JWT path) **STILL OPEN** — `verifyToken` is dead, no replay store. |
| **Z2 Verified identity** | `tgIdFor()` resolves `socket.telegramUser.id` | **H006 weakened-but-NOT-closed**: the backfill at `main.js:1582-1588` no longer auto-trusts a TG ID it discovers via wallet→User lookup ONLY when `client.telegramUser?.id` is null. **The backfill itself is still a TG-HMAC-equivalent trust elevation**, justified by the comment "wallet was just authenticated via signMessage … as trustworthy as a TG initData HMAC". TRUE if and only if H003+H004 are closed (they aren't — wallet auth has no replay store). H005 (NODE_ENV fallback) **STILL OPEN** verbatim. |
| **Z3 Match participant** | Match-membership check (still partial) | H018/H019/H020/H022 still applicable; gated through Bundle 2. Not in this bundle's scope. |
| **Z4 Server authority** | Server keypair (signs settle/cancel/create) | Improved: propose_authority + timelock landed on-chain. Off-chain `propose-authority-v2.mjs` script has NO confirmation guard and NO cluster check (only `accept` script gets a pubkey-match guard). **NEW M-finding.** |

## Prior-Finding Status (table)

| Prior ID | Severity | Status | Justification |
|---|---|---|---|
| **H001** | CRITICAL | **RESOLVED** | `server/index.js:667-694` now calls `client.getUser(privyUserId)`, extracts `linkedAccounts[type='telegram'].telegramUserId`, and rejects with 403 `tg_id_mismatch` if it differs from the body `telegramUserId`. Privy lookup failure returns 502. The fix is direct and matches the audit #2 recommended remediation verbatim. |
| **H002** | CRITICAL | **RESOLVED (with caveat)** | `privyAuth.js:88-104` now refuses with **503 `auth_not_configured`** in production when `getClient()` returns null + `required:true`. Dev-mode falls through with loud warn. Bug-7 + Bug-4 separately closed the env-mismatch root cause that was masking JWT failures for valid configs. The endpoint also redundantly re-checks `isPrivyAuthConfigured()` at `index.js:654-656`, returning 503. **Caveat:** the dev pass-through (`NODE_ENV !== 'production'`) sets `req.privyAuth = null` and continues — the H001 endpoint then dereferences `req.privyUserId` (null) and the Privy lookup throws → 502. So in dev the endpoint isn't usable, which is acceptable; but verify the dev fall-through isn't accidentally reachable in production via `NODE_ENV` being unset. **Render config must set `NODE_ENV=production` for the guard to fire** — already there per render.yaml. |
| **H003** | CRITICAL | **STILL OPEN (RECURRENT)** | `server/middleware/auth.js` is unchanged. `generateToken()` mints a JWT into `result.token` and `client.emit('authResult', result)` ships it to client, but there is no `verifyToken` import or middleware anywhere — only `isAuthenticated` boolean is checked. JWT is decorative. Audit #2 fix recommendation (remove generateToken to make the model honest, OR verify on each event) NOT applied. |
| **H004** | CRITICAL | **STILL OPEN (RECURRENT)** | `auth.js:75-88` `verifyAuthMessage()` checks timestamp window only; **no replay store**. Same `{walletAddress, message, signature, timestamp}` payload reusable on a new socket within 5 minutes — H001+H006-class identity tier escalation is the chained exploit. |
| **H005** | CRITICAL | **STILL OPEN** | `groupchat.js:72-78` `tgIdFor()` still has `if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) return payload.telegramUserId`. Comment defends this as dev convenience. If Render env ever drops `NODE_ENV=production` (e.g. preview deploy, hand-edited env, image rollback), every payload becomes an impersonation primitive. Defense-in-depth recommendation: gate on a positive `NODE_ENV === 'development'` instead of negative-of-production. |
| **H006** | CRITICAL | **PARTIAL** | The `client.telegramUser.id` source-tagging fix the audit #2 recommended is **NOT applied** — there's still no `telegramUserSource` field. However, the H001 fix makes the `link-from-privy-telegram` exploit path no longer a binding primitive. The remaining residual risk is purely the wallet-backfill direction: an attacker who controls a victim's wallet (or successfully replays the H003/H004 wallet auth) reads the victim's `User.telegramUserId` from the DB at `main.js:1556-1588`, which the server then backfills into the socket. The chain is now H003/H004 → wallet auth replay → H006 backfill → victim TG identity assumed. **H001 alone is no longer a foothold; H006 still composes if the wallet-auth chain isn't fixed.** |
| **H007** | CRITICAL | **PARTIAL** | `link-from-tg-token` still uses `requirePrivyAuth({required: false})` at `index.js:582` — soft mode. Magic-link token is the primary auth. Audit #2 recommended hardening to `{required:true}`. NOT done. **HOWEVER**: the magic-link CSPRNG token is 32-byte one-shot, 10-min TTL, delivered via TG DM (TG channel is end-to-end encrypted to the user's TG account). The realistic threat model — TG DM intercept — requires compromising the user's TG account itself, which IS more credible than wallet+private-key compromise but bounded. Severity could downgrade to HIGH with magic-link-as-primary-auth justification. |
| **H008** | CRITICAL (compound) | **PARTIAL** | The H001 leg is closed; H006 leg still applies; composition now requires H003/H004 (wallet replay) as the new entry point. Reduces from "any Privy account → victim identity" to "wallet signature replay → victim identity". Materially harder but not closed. |
| **H009** | CRITICAL | **RESOLVED** | S2-T6 atomic helper `users.js:41-103` `updateWalletForTgUser` with idempotency check + conflict check + `findOneAndUpdate($set + $push)`. Caller sites (`linkTelegramIdentity:216-225`) hand off when the rotation path triggers. NEW finding below: rotation TOCTOU on concurrent writes mitigated by `walletAddress` unique-sparse index per `User.js:4-9`. Confirmed in schema. |
| **H010** | CRITICAL | **RESOLVED** (by reconnect disabled) | Reconnect path is now early-returned with comment "Reconnect is disabled for P1 launch" per hot-spots map. No stale-wallet copy possible. If reconnect is ever re-enabled, this finding reopens. |
| **Bug-4 logging** | n/a | **CLEAN** | `privyAuth.js:139-150` + `:179-194` log `tokenAudience`, `ourAppId`, `audMatchesEnv`, `issuer`, `privyDid` (= Privy `sub`), age, expiry. **Token itself is NOT logged** — `unsafeDecodeForLogging` returns the parsed payload object, none of the log lines emit `token` or `parts[2]` (signature). Privy DID is a public identifier, not a secret. `aud` and `iss` are app-level identifiers, not user secrets. No PII linkage worsened. |

## New Findings (audit #3)

### CRITICAL (3)

1. **AUTH-N01 — `link-from-tg-token` consume-then-link sequence allows abuse on link-failure.** `index.js:597-609`: `consumeLinkToken(token)` is called BEFORE `linkTelegramIdentity` succeeds. If the link fails (Mongo error, wallet shape rejection later in the helper, conflict), the token is gone, the user cannot retry. With S1-T3 client-side retry on 5xx, the client will hammer the endpoint for tokens that no longer exist (404 `token_invalid_or_expired`) and never recover. **Functionality bug, not exploit, but lockout primitive.** Severity CRITICAL because it gates wallet binding on a fragile non-atomic sequence; fix is to consume only after link success. — `server/index.js:597-619`

2. **AUTH-N02 — H003+H004+H006 chain remains the primary mainnet-blocking risk.** Three legacy CRITs that compose: wallet-signature auth has no JWT verify (H003) AND no replay store (H004), so any captured `{walletAddress, message, signature, timestamp}` is replayable for 5 minutes on a fresh socket; once replayed, the `authenticate` handler at `main.js:1582-1588` backfills `client.telegramUser.id` from the User doc, giving the attacker the victim's TG identity for all group-chat operations (`tgIdFor()` returns it). **Single-vector replay → identity takeover.** Pre-conditions: capture one signed auth message (e.g. MITM during the 5-min window of any authenticated session, or via H020 client-debug-log path now closed). Fix: closes either (a) verify JWT on every state-mutating event, OR (b) maintain in-memory `Set<signature>` with 5-min TTL replay store, OR (c) tag `telegramUserSource` and require HMAC source for high-trust ops. — `server/middleware/auth.js:75-88` + `server/socket-io/main.js:1582-1588`

3. **AUTH-N03 — Authority rotation script `propose-authority-v2.mjs` has zero safety guards.** `scripts/propose-authority-v2.mjs` accepts `NEW_AUTHORITY` env var and immediately calls `proposeAuthorityV2(NEW_AUTHORITY)`. No `--confirm`, no `INIT_MAINNET_CONFIRM`-style gate, no `/mainnet/i.test(RPC)` check, no dry-run mode. The script also overwrites a previous proposal without warning ("Use the CURRENT authority's own pubkey as NEW_AUTHORITY to effectively cancel"). On mainnet, an operator who runs this against the wrong cluster, or a malicious actor with server-keypair access (H011 still open), can propose attacker-controlled authority in a single command. Mitigation: on-chain `propose` is non-destructive; only `accept` finalizes. But on-chain mempool exposure of the proposal could trigger panic. Compared to `init-config-mainnet.mjs` which has 4 distinct guards, the propose script is bare. — `server/scripts/propose-authority-v2.mjs:1-51`

### HIGH (4)

4. **AUTH-N04 — `link-from-privy-telegram` instantiates a fresh PrivyClient per request.** `index.js:672-673` does `new privyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET)` on EVERY incoming request, rather than reusing the singleton from `getClient()` in `privyAuth.js`. Cost: new HTTPS connection pool per request, Privy SDK initialization overhead. At scale or under attacker-driven brute-force, this amplifies the per-request cost AND multiplies socket count to Privy. Also a small DOS amplification vector. Fix: hoist a module-level `_lookupClient` and reuse. — `server/index.js:672-686`

5. **AUTH-N05 — Admin endpoints share global 100 req/15min limit.** `index.js:238-245`: the global `httpLimiter` is the ONLY budget for `/api/admin/funnel`, `/api/admin/truncate-handles`, `/api/admin/reload-keys`, and `/stats`. An attacker with valid `x-admin-key` (compromised once) can hit 100 req/15min — but more critically, the SAME 100 budget is shared with all other endpoints from that IP. The attacker doesn't benefit from a separate brute-force budget, but the operator hosting an admin endpoint reads-heavy can starve themselves out of all other routes. More important: no dedicated admin endpoint bucket means brute-force of `requireAdminKey` shares budget with the user's own page loads from same IP — at 100 attempts per 15 min you'd need ~3500 years to brute-force a 32-char hex key, so the practical risk is negligible, but the design pattern is wrong. Fix: dedicated low-budget limiter for `/api/admin/*` (e.g. 20 req/h). — `server/index.js:238-245` + `/api/admin/*` routes

6. **AUTH-N06 — `arcadeSession` JWT has no audience claim; cross-game token reuse possible if secret is leaked.** `arcadeSession.js:81-86` issues `{ uid, wa, tg, h }` with issuer `arcade:session-handoff` and TTL 10m. Verification at `:96-113` checks issuer but no audience. The standalone leaderboard JWTs at `basketball-standalone/standaloneLeaderboard.js` use issuer `arcade-bot:basketball` and ONLY validate `algorithms: [ALG]` + `issuer`. Because each game uses a DIFFERENT secret (`BASKETBALL_LEADERBOARD_SECRET` vs `KEEPIE_UPPIES_LEADERBOARD_SECRET` vs `ARCADE_SESSION_SECRET`), cross-secret forgery is impossible. **However**: the `ARCADE_SESSION_SECRET` and game-leaderboard-secrets are all 48-byte random base64url from env. If ANY ONE leaks via Render dashboard compromise, an attacker can mint a JWT with arbitrary `uid` AND have it accepted by SolShot's `/api/arcade/session-validate`. Severity HIGH because the JWT carries (and SolShot trusts) the `walletAddress` and `telegramUserId` for "welcome banner" UX, but the comment claims this is "hints, not authorisation." Verify the SolShot client never escalates an `arcade_token` claim into a binding decision. — `server/services/arcadeSession.js:71-113`

7. **AUTH-N07 — `_BASKETBALL_DEV_SECRET` fallback path uses `require('crypto')` in an ES module.** `basketball-standalone/standaloneLeaderboard.js:54`: `process.env._BASKETBALL_DEV_SECRET = require('crypto').randomBytes(32).toString('hex')`. This file is ESM (`import jwt from 'jsonwebtoken'`). `require` is not defined in ESM strict mode — this code path will throw `ReferenceError: require is not defined` if it ever runs (i.e. NODE_ENV !== 'production' and BASKETBALL_LEADERBOARD_SECRET unset). Will manifest as 500 on first score-submit in dev. Identical pattern in `keepie-uppies-standalone/standaloneLeaderboard.js` and `free-kicks-standalone/standaloneLeaderboard.js`. Production not affected (env is set), but the dev fallback is broken silently. **Fix:** import `crypto` at top of file like `arcadeSession.js` does. — `server/services/games/basketball-standalone/standaloneLeaderboard.js:42-58` (and 2 sibling files)

### MEDIUM (6)

8. **AUTH-N08 — H006 backfill comment overstates trust equivalence.** `main.js:1576-1581`: "Safe because: the wallet was just authenticated via signMessage (handleAuthenticate verified the wallet signature), and the linkTelegramIdentity flow is the ONLY path that sets User.telegramUserId. So a wallet → User → telegramUserId chain is as trustworthy as a TG initData HMAC validation." This is FALSE so long as H003+H004 are open: wallet signature is replay-able, TG HMAC requires fresh initData each socket. The trust equivalence claim is the load-bearing assumption for not tagging identity source — but the chain it relies on is broken. Update the comment OR close H003/H004 first. — `server/socket-io/main.js:1576-1581`

9. **AUTH-N09 — `walletHistory[]` is unbounded.** `users.js:80-84`: `$push: { walletHistory: { address, timestamp, source } }` on every rotation. No cap, no rotation/trim. An attacker (or a misbehaving Privy SDK) could trigger repeated rotations: each adds a doc to the array. At 1 KB per entry × 10K rotations = 10 MB doc, eventually hitting Mongo's 16 MB doc limit. Mitigations: each rotation requires a successful `linkTelegramIdentity` call from a verified TG socket OR magic-link consume, which is rate-limited. Not exploitable today; defensive cap at e.g. 50 entries (FIFO trim) prudent. — `server/services/users.js:80-84` + `server/models/User.js:16-23`

10. **AUTH-N10 — `linkTelegramIdentity` orphan-consume path can be abused for cross-user takeover.** `users.js:188-193`: when a wallet conflict resolves to an orphan (no `telegramUserId` on the conflicting doc, "pure Privy sign-in artifact"), the helper deletes the orphan and attaches the wallet to the TG-keyed doc. **Threat model**: attacker registers via Privy (creates orphan User with their wallet), waits for victim to run `/play` → magic-link bind, victim's TG ID gets attached to the doc that ATTACKER's Privy session also controls. Race window: between Privy provisioning the wallet on attacker side and victim's link arriving. **However**: the orphan consume path is gated on `existingByTg` already being a TG-keyed doc — attacker would need the victim to NOT already have a TG-keyed User. For a new user flow this is possible: victim first opens TG → registers via /play → server creates TG-keyed doc → THEN attacker can't take it. But if attacker registers first (Privy account before TG bind) AND knows victim's TG id (public on TG), and times the bind, races are possible. Severity MEDIUM because windowed and requires public TG id knowledge. Fix: only delete orphan if the orphan's `_id` matches a freshly-created one (record orphan create timestamp; require <60s old). — `server/services/users.js:177-198`

11. **AUTH-N11 — `link-from-privy-telegram` Privy lookup result is not cached.** `index.js:676`: `await client.getUser(privyUserId)` is a synchronous Privy API call per bind request. Privy's user lookup has rate limits (typically 100 req/min per app). At wallet-bind storms (e.g. high signup burst, or a malicious replay storm with valid Privy JWTs), this hits Privy's rate cap and the H001 fix throws 502. **Fix:** cache `getUser` result keyed by Privy DID with 30s TTL; fail-open with 503 (not 502) if Privy upstream is unreachable. — `server/index.js:676-686`

12. **AUTH-N12 — Magic-link `consumeLinkToken` "always delete on lookup" + TTL check ordering.** `walletLinkTokens.js:74-82`: `store.delete(token)` runs BEFORE TTL check. If the token IS expired, it's still deleted and `null` returned. Correct for single-use semantics. But there's no log emitted on expired-token attempts — silent failure. Operators can't tell if a user is failing to bind due to TG DM expiry, network lag, or replay attempt. Fix: log expired-vs-not-found distinction. Severity MEDIUM (observability, not exploit). — `server/services/walletLinkTokens.js:74-82`

13. **AUTH-N13 — `wipe-user.mjs` regex from CLI deletes ALL matching users.** Out of scope of this bundle's "no key leak" cross-check, but flagging here because it's an auth/identity destructive surface: per HOT_SPOTS line 605-609, `wipe-user.mjs` takes a regex needle from `process.argv[2]` and "will delete ALL matching users (no preview limit). On a typo, can wipe many records." Single confirmation env var `WIPE_CONFIRM=YES`, but no dry-run-with-count step. Should `findOne` first, print count, require second confirmation if >1 match. Operator-only blast radius. — `server/scripts/wipe-user.mjs`

### LOW (3)

14. **AUTH-N14 — `init-config-mainnet.mjs` `/mainnet/i.test(RPC)` is substring-match.** Line 77-79. Accepts any URL with "mainnet" substring — e.g. `https://mainnet-staging.example.com` or even `https://api.devnet-mainnet.solana.com`. Realistic mainnet-RPC providers use known hostnames (`api.mainnet-beta.solana.com`, `solana-mainnet.g.alchemy.com`, etc.). For sysadmin-only execution the false-positive risk is low. Defensive: maintain known-prefix allowlist. — `server/scripts/init-config-mainnet.mjs:77`

15. **AUTH-N15 — `find-privy-owner.mjs` regex from CLI is `new RegExp(value, 'i')`.** Line 131. Already flagged in HOT_SPOTS as LOW. ReDoS possible (e.g. attacker-controlled pattern `(.+?)+`), but the script is admin-only, run from operator terminal with PRIVY_APP_SECRET in env. Confirmed: reads-only Privy + reads-only Mongo. No write paths. **No PII leak in logs**: console output prints email/TG/wallet of MATCHED Privy users to operator terminal, but `User.find` projects only `handle`, `username`, `telegramUserId`, `walletAddress`, `stats.matchesPlayed`, `lastActive`. Wallet truncated to slice(0,8)…slice(-4). Acceptable for ops console. — `server/scripts/find-privy-owner.mjs:131`

16. **AUTH-N16 — `dump-trenchdemon.mjs` is hard-coded to a specific user regex.** Line 17: `User.find({ handle: /trenchdemon|jj_me/i })`. Read-only, prints `walletAddress` in full to console plus the full `walletHistory[]` (including full historical wallets). Run only by operator (JJ) for a specific debug. **No write paths, no PII leak beyond what's already on-chain (wallets are public).** Acceptable. — `server/scripts/dump-trenchdemon.mjs`

## Cross-Focus Handoffs

### → Bundle 2 (Chain / Settlement)
- **AUTH-N02 (H003+H004+H006 chain)** is the highest-residual-risk item but its EXPLOITATION requires capturing a signed auth message. Bundle 2 should validate that NO state-mutating socket events accept the wallet auth without `requireAuth` check, AND that `authenticatedWallets[client.id]` lookup is the only path that gates wager-touching operations. If `tgIdFor()` is read in any settle/cancel/refund path, the H006 chain composes into a financial drain.
- **AUTH-N03 (propose-authority-v2.mjs guard gap)** is the chain-side mirror — if compromised server keypair (H011 still open per HANDOVER) runs this script, on-chain authority is in attacker's pending slot. Bundle 2 should verify on-chain `propose_authority` requires CURRENT authority signer (it does, per Anchor program), so the script can only propose IF the current authority signed, but the script has no protection against signing the wrong NEW_AUTHORITY value.

### → Bundle 3 (Sockets / Data)
- **H005** (NODE_ENV fallback in `tgIdFor`) is a socket-level finding; Bundle 3 should re-verify by greping `process.env.NODE_ENV !== 'production'` for similar dev-only auth bypasses (e.g. `verifyTelegramInitData`, socket middleware).
- **AUTH-N09** (`walletHistory[]` unbounded) is a DB-shape concern. Bundle 3 should verify all `$push`-on-update paths have caps (sliding-window pattern with `$slice: -N`).
- **AUTH-N12** (magic-link silent expiry) is observability — Bundle 3 should check funnel events emit on expired-magic-link consume attempts so operators can correlate drop-offs.

### → Out-of-bundle (mainnet readiness checklist)
- Verify Render env has `NODE_ENV=production` (closes H005 + Bug-4-related dev fall-through in privyAuth).
- Verify Render env has `BASKETBALL_LEADERBOARD_SECRET`, `KEEPIE_UPPIES_LEADERBOARD_SECRET`, `FREE_KICKS_LEADERBOARD_SECRET` set (closes AUTH-N07 dev-fallback bug).
- Verify Render env has `ARCADE_SESSION_SECRET` set (closes AUTH-N06 dev-fallback risk).
- Run `init-config-mainnet.mjs` in dry-run mode FIRST; verify all 3 Squads PDAs differ and are correct addresses; only then re-run with `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE`.

<!-- CONDENSED_SUMMARY_END -->

# Full Analysis

## H001 — Privy/TG identity bridge unverified — **RESOLVED**

### Status: RESOLVED
The fix is direct, matches the audit #2 remediation recommendation, and is the canonical exemplar of "close a verification gap by calling the upstream's authoritative API."

### Evidence
`server/index.js:649-694`:

```js
app.post(
    '/api/wallet/link-from-privy-telegram',
    requirePrivyAuth({ required: true }),
    async (req, res) => {
        try {
            if (!isPrivyAuthConfigured()) {
                return res.status(503).json({ error: 'privy_auth_not_configured' });
            }
            const { telegramUserId, telegramUsername, walletAddress } = req.body || {};
            // ... shape checks ...
            // H001 fix — verify the supplied telegramUserId matches the
            // Privy session's actual Telegram link.
            const privyUserId = req.privyUserId;
            const privyClient = (await import('@privy-io/server-auth')).PrivyClient;
            const client = new privyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET);
            let claimedTgId = null;
            try {
                const privyUser = await client.getUser(privyUserId);
                const tgAccount = (privyUser?.linkedAccounts || [])
                    .find(a => a?.type === 'telegram');
                claimedTgId = tgAccount?.telegramUserId
                    ? Number(tgAccount.telegramUserId)
                    : (tgAccount?.subject ? Number(tgAccount.subject) : null);
            } catch (lookupErr) {
                console.error('[POST /api/wallet/link-from-privy-telegram] Privy lookup failed:', lookupErr.message);
                return res.status(502).json({ error: 'privy_user_lookup_failed' });
            }
            if (!claimedTgId || claimedTgId !== Number(telegramUserId)) {
                console.warn('[POST /api/wallet/link-from-privy-telegram] tg_id mismatch:', {
                    privyUserId,
                    privyClaimedTgId: claimedTgId,
                    bodyTgId: Number(telegramUserId),
                });
                return res.status(403).json({ error: 'tg_id_mismatch' });
            }
            // proceed with linkTelegramIdentity
            ...
```

Three trust checks layered:
1. `requirePrivyAuth({required:true})` — JWT must verify
2. `isPrivyAuthConfigured()` — secondary 503 gate (redundant but defensive)
3. `getUser(privyUserId)` — reads authoritative `linkedAccounts[type=telegram]` from Privy, compares against body-supplied `telegramUserId`. Mismatch → 403.

### Residual: AUTH-N04, AUTH-N11
- New PrivyClient per request (AUTH-N04, HIGH)
- No caching on `getUser` lookup (AUTH-N11, MEDIUM)
- Both are amplification/availability concerns, not correctness gaps.

---

## H002 — Privy fail-open when secret missing — **RESOLVED (with caveat)**

### Status: RESOLVED
The middleware now throws 503 in production when Privy isn't configured + `required:true`. Bug-7 separately closed the env-mismatch root cause.

### Evidence
`server/services/privyAuth.js:84-107`:

```js
export function requirePrivyAuth(options = {}) {
    const { required = false } = options;
    return async (req, res, next) => {
        const client = getClient();
        if (!client) {
            // H002 fix — when `required: true`, never silently pass through.
            if (required) {
                if (process.env.NODE_ENV === 'production') {
                    console.error('[privyAuth] Refusing request: required=true but Privy is not configured. Set PRIVY_APP_ID + PRIVY_APP_SECRET.');
                    return res.status(503).json({ error: 'auth_not_configured' });
                }
                // Dev fallback: pass through so local development keeps working
                console.warn('[privyAuth] DEV-MODE pass-through on required=true endpoint. Set PRIVY env vars for parity.');
                req.privyAuth = null;
                req.privyUserId = null;
                return next();
            }
            // Soft mode — pass through unverified
            return next();
        }
        // ... token verify path ...
```

### Caveat: dev fall-through path
In NODE_ENV !== 'production' with `required:true` but Privy unconfigured, the middleware passes through with `req.privyAuth = null; req.privyUserId = null`. The downstream `/api/wallet/link-from-privy-telegram` handler then does:

```js
const privyUserId = req.privyUserId;  // null
const privyUser = await client.getUser(privyUserId);  // throws
```

In dev mode this 502s rather than allows the bind through. Effectively endpoint is not usable in dev without Privy env vars, which matches "set the env to use the endpoint" expectation.

### Required mainnet check
- Render env MUST set `NODE_ENV=production`. Per HOT_SPOTS line 332-333, `render.yaml` includes `NODE_ENV` as plain-text env var. Verify the value is exactly `production`.
- `PRIVY_APP_SECRET` is marked `sync: false` (manual Render dashboard input). Verify the dashboard value is the production secret (matches `PRIVY_APP_ID` per Bug-7 root cause).

### Bug-4 diagnostic logging follow-up — CLEAN
`privyAuth.js:129-150` (middleware) and `:179-194` (helper):
- Logs `endpoint`, `tokenAudience` (= JWT `aud` claim — public app identifier), `ourAppId` (= our `PRIVY_APP_ID` env, public), `audMatchesEnv` (bool), `issuer` (Privy issuer URL), `privyDid` (= JWT `sub` claim — public user identifier), `ageSinceIssueSecs`, `secsUntilExpiry`, `expired`.
- Does NOT log: the full token, the signature segment, the JWT secret, walletAddress.
- `unsafeDecodeForLogging(token)` returns parsed payload JSON; the code only reads specific claims out of it. Privy DID is a public user identifier (same as Privy `userId` returned by verifyAuthToken — printed by `[privyAuth] Initialized — JWT verification enabled (PRIVY_APP_ID=${PRIVY_APP_ID})` on every cold start).

No secret/PII leakage. Safe.

---

## H003 — JWT generated but never verified — **STILL OPEN (RECURRENT from #1 + #2)**

### Status: STILL OPEN
`server/middleware/auth.js` is unchanged in this audit window (NOT in delta listing in HANDOVER).

### Evidence
`auth.js:96-102`:
```js
export function generateToken(walletAddress) {
    return jwt.sign(
        { wallet: walletAddress },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}
// E1: verifyToken removed — was dead code (never imported anywhere)
```

`auth.js:114-135` `handleAuthenticate`:
```js
const token = generateToken(walletAddress);
// Mark socket as authenticated
client.walletAddress = walletAddress;
client.isAuthenticated = true;
return { success: true, token, walletAddress };
```

The token is generated, returned to client, but server only uses `client.isAuthenticated` boolean (set on the socket).

### Why it matters
The `token` is shipped via `client.emit('authResult', result)` at `main.js:1633`. Client receives it. Server never asks for it back. The socket-flag-based model is THE auth model — the JWT is decorative.

### Fix paths
- (a) Remove `generateToken` entirely; document socket-flag model honestly.
- (b) Require client to send JWT in every state-mutating event payload; middleware verifies before handler.

Option (a) is the lower-risk fix; option (b) is the audit-recommended hardening.

---

## H004 — Auth signature 5-min replay window — **STILL OPEN (RECURRENT)**

### Status: STILL OPEN
`auth.js` unchanged.

### Evidence
`auth.js:75-88`:
```js
export function verifyAuthMessage(message, walletAddress, timestamp) {
    const expected = `SolShot Auth: ${walletAddress} at ${timestamp}`;
    if (message !== expected) {
        return { valid: false, reason: 'Invalid message format' };
    }
    // Check timestamp is recent
    const age = Date.now() - timestamp;
    if (age > AUTH_TIMEOUT || age < -60000) {
        return { valid: false, reason: 'Auth message expired' };
    }
    return { valid: true };
}
```

`AUTH_TIMEOUT = 5 * 60 * 1000`. No in-memory `Set<signature>` for replay detection.

### Fix
```js
const seenSigs = new Map();  // sig → expiresAt
export function verifyAuthMessage(message, walletAddress, timestamp, signature) {
    // ... existing checks ...
    if (seenSigs.has(signature)) return { valid: false, reason: 'replay' };
    seenSigs.set(signature, Date.now() + AUTH_TIMEOUT);
    // Periodic sweep ...
}
```

Bounded growth: max ~5000 entries at 1000 auths/sec for 5min window — acceptable in-memory.

---

## H006 — TG identity backfill — **PARTIAL**

### Status: PARTIAL
The audit #2 recommended fix (`telegramUserSource` field tag) is NOT applied. However, the H001 fix has neutered the most concerning leg of the exploit chain.

### Current behavior
`main.js:1582-1588`:
```js
if (tgUserId && !client.telegramUser?.id) {
    client.telegramUser = {
        id: tgUserId,
        username: userDoc?.username || null,
        first_name: null,
    };
}
```

The backfill runs inside the `authenticate` handler, AFTER `handleAuthenticate` verified the wallet signature. The TG ID is read from the User doc keyed on `walletAddress`. `tgIdFor()` in `groupchat.js` cannot distinguish the source.

### Audit comment defending the change (`main.js:1576-1581`)
> Safe because: the wallet was just authenticated via signMessage (handleAuthenticate verified the wallet signature), and the linkTelegramIdentity flow is the ONLY path that sets User.telegramUserId. So a wallet → User → telegramUserId chain is as trustworthy as a TG initData HMAC validation.

**This claim is FALSE so long as H003+H004 are open.** Wallet signature is replay-able; TG HMAC requires fresh initData on every socket connection (validated by `telegramSocketMiddleware`). The two are NOT trust-equivalent.

### Residual exploit chain
Pre-H001-fix: Privy account → bind victim TG ID via link-from-privy-telegram → wallet-auth → backfill victim TG ID. ONE-STEP takeover via fully ungated endpoint (when H002 also open).

Post-H001-fix (current): require captured wallet auth message → replay within 5min → wallet-auth → backfill victim TG ID. TWO-STEP, with a 5-min capture window. Materially harder but still composes.

### Required to fully close
Closing H003 OR H004 (replay store) breaks the chain. Tagging source per audit #2 closes it directly.

---

## H005 — `tgIdFor()` NODE_ENV fallback — **STILL OPEN**

### Status: STILL OPEN
`groupchat.js:72-78` unchanged:
```js
function tgIdFor(socket, payload) {
    if (socket?.telegramUser?.id) return socket.telegramUser.id;
    if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) {
        return payload.telegramUserId;
    }
    return null;
}
```

### Defense-in-depth recommendation
Replace `process.env.NODE_ENV !== 'production'` with `process.env.NODE_ENV === 'development'`. The negative-of-production pattern silently enables impersonation if NODE_ENV is unset, misspelled, or set to "staging"/"preview"/"test".

---

## H007 — `link-from-tg-token` soft Privy — **PARTIAL**

### Status: PARTIAL
`index.js:582` still uses `requirePrivyAuth({ required: false })`. The audit #2 recommendation (hard-require Privy JWT) is NOT applied.

### Threat model re-justification
The magic-link CSPRNG token is:
- 32-byte cryptographically random one-shot
- 10-min TTL
- Delivered via TG DM (E2E-encrypted to the user's TG account)
- Burned on first consume

For an attacker to bind a victim's TG ID to attacker's wallet using THIS path:
1. Attacker needs the magic-link token (delivered via DM only the victim sees)
2. OR attacker needs to compromise victim's TG account to read the DM
3. OR attacker needs to intercept the token in flight (TG DM is E2E)

This is effectively equivalent to compromising the victim's TG account, in which case the attacker can also link a wallet via /play. The remaining residual risk is acceptable.

### Severity calibration
Reasonable to downgrade from CRITICAL to HIGH or even MEDIUM, given:
- Magic-link is the primary auth, not a soft Privy-failing-open
- Token is TG DM-delivered (not web-routable)
- TTL is short

For mainnet, hardening to `{required:true}` is defense-in-depth.

---

## H008 — Composed H001+H006 takeover — **PARTIAL (H001 closed)**

### Status: PARTIAL
Composition no longer viable through the H001 endpoint. The new entry point is wallet auth replay (H003+H004) + H006 backfill. Chain shortened by one step but not closed.

---

## H009 — Wallet rotation gap — **RESOLVED**

### Status: RESOLVED via S2-T6.

### Evidence: atomic helper at `users.js:41-103`
- Type check `:42-50`
- Find existing user `:53`
- Idempotent early-return on same wallet `:59-61`
- Conflict check against other users `:64-71`
- Atomic `findOneAndUpdate($set + $push)` `:86-90`
- `walletAddress` unique-sparse index in `User.js:4-9` provides write-side race protection

### Caller integration
`linkTelegramIdentity:216-225` invokes `updateWalletForTgUser` when an existing TG-keyed doc's wallet differs from the new one. Handle/username updates still apply if rotation refuses.

### Concurrency analysis
- **Same tgId, concurrent rotations to different wallets**: `findOneAndUpdate` is atomic; second one will see the just-updated `walletAddress` value. If both target the same wallet → idempotent. If different → last-write-wins (acceptable per "rotation = current intent").
- **Different tgIds, concurrent rotations to SAME wallet**: conflict check at `:64-71` happens before update; if both pass at T1, both attempt `findOneAndUpdate` at T2. The unique-sparse index on `walletAddress` catches the second writer with E11000. **However**: `updateWalletForTgUser` doesn't currently catch E11000 explicitly — it returns generic `db_error`. Defensive improvement: catch E11000 specifically and return `wallet_belongs_to_other_user`.

### Residual: AUTH-N09, AUTH-N10
- `walletHistory[]` unbounded growth (AUTH-N09 MEDIUM)
- Orphan-consume path race window (AUTH-N10 MEDIUM)

---

## H010 — Reconnect migrates stale wallet — **RESOLVED (by reconnect disabled)**

### Status: RESOLVED
Per HOT_SPOTS line 484, reconnect is early-returned at top of `rejoinRoom` handler with comment "Reconnect is disabled for P1 launch." No code path can copy stale wallet entry. Reopens automatically if reconnect re-enabled.

---

## Bug-4/Bug-7 fix follow-up — **CLEAN**

### Status: NO LEAK
Per the detailed walk-through in H002 section above. Token never logged. Privy DID is public. App ID is public. Issuer is public. Truncated timestamps are operational.

---

## NEW ATTACK SURFACES (audit #3)

### /admin/funnel — gated by requireAdminKey
`index.js:333-343`:
- `requireAdminKey` middleware at `guards.js:27-41` uses `crypto.timingSafeEqual` (correctly closes prior H083).
- Returns aggregated counts only — `getFunnelAggregates(range)` at `funnel.js:92-147` returns `{range, since, generatedAt, stages: [{stage, count, uniqueIdentities, retentionFromPrev}]}`. **No per-user PII leaked**, only counts of unique identity dedupe sets.
- `$addToSet` aggregation builds the unique-identity set in memory in Mongo, only returns its size. Implementation correct.
- **Residual: shares global 100 req/15min limit with all other endpoints (AUTH-N05 HIGH).**

### /admin/truncate-handles — gated by requireAdminKey
`index.js:296-319`:
- One-shot DB mutation, idempotent.
- No operator logging — destructive operation runs without recording who triggered it. **Insider-abuse audit gap.** (MEDIUM, deferred to ops audit not security audit.)

### Arcade JWT mint — `/api/arcade/mint-session`
`index.js:921-959`:
- Gated by `requirePrivyAuth({required:true})`.
- Validates `req.query.game` against `GAME_MINTERS` registry — rejects unknown game.
- Reads Privy DID → User → telegramUserId. If no TG linkage, returns 412 `tg_not_linked`.
- Mints session via per-game `minter({telegramUserId, telegramUsername, firstName})`.
- **Token TTL = 30d** per `basketball-standalone/standaloneLeaderboard.js:39` (raised from 24h on 2026-05-28 after Elliot's expired-session score loss).
- **Per-game secret rotation**: not documented anywhere. If a leaderboard secret is leaked, no documented rotation procedure.
- **Cross-game token reuse**: each game's verifySession() checks issuer (`arcade-bot:basketball` vs `arcade-bot:keepieuppies` etc) + algorithm (HS256). Cross-game forgery prevented IF AND ONLY IF each game has a distinct secret. Verify Render dashboard has all three set distinct.

### init-config-mainnet.mjs — guards inventory
- Env-var presence check `:75-83`
- `/mainnet/i.test(RPC)` substring check `:77-79` (AUTH-N14 LOW: substring is loose)
- Keypair path required `:81`
- Squads PDAs all required `:82-83`
- Pubkey base58 parse `:90-92`
- Three PDAs distinct `:96-98` (mirrors on-chain require!)
- BPS bounds + sum ≤ 1000 `:100-108`
- `PROGRAM_ID` env override match check `:118-120`
- Idempotency check `:139-146` (refuses if config already exists)
- Confirmation guard `:149-158` (must equal exact string `I_UNDERSTAND_MAINNET_IRREVERSIBLE`)
- Post-init state verification `:181-193`

**Verdict: SOLID guards.** Only AUTH-N14 (RPC substring) is a minor improvement opportunity.

### Authority rotation scripts — propose-authority-v2.mjs
`scripts/propose-authority-v2.mjs`:
- NO confirmation guard
- NO cluster check (could run against any RPC the server's env points at)
- NO dry-run mode
- Comment defends overwriting prior proposals: "Use the CURRENT authority's own pubkey as NEW_AUTHORITY to effectively cancel a prior bad proposal" — operationally fine but no in-script safety.

`scripts/accept-authority-v2.mjs`:
- Loads keypair from `NEW_AUTHORITY_KEYPAIR` env (must be the new authority's keypair)
- Fetches `config.pendingAuthority` and verifies it matches the loaded keypair pubkey before sending `:67-72`
- Two-step on-chain flow IS the safety net here (compromised server keypair can propose but cannot accept on behalf of a different keypair)

**Verdict: accept is defensively guarded; propose is not.** AUTH-N03 CRITICAL.

### find-privy-owner.mjs + dump-trenchdemon.mjs — read-only cross-check
- Both scripts: read-only Privy (`privy.getUser`, `getUsers`, `getUserByWalletAddress`) + read-only Mongo (`User.find` with projection).
- No `Privy.update*` or `Privy.delete*` calls.
- No PII written to disk or external service.
- Console output goes to operator terminal only — no log shipping.
- Wallet addresses truncated where appropriate (find-privy-owner: `slice(0,8) + '…' + slice(-4)`); full addresses in dump-trenchdemon (acceptable for the operator's specific debug).
- **AUTH-N15 LOW**: `new RegExp(value, 'i')` from CLI accepts attacker-controllable patterns IF the script is invoked by an attacker — but it's admin-only so admin-only blast radius.

---

## Summary verdict

**Is the identity layer mainnet-ready, with caveats?** With caveats, YES. The H001 fix is solid. The H002 fix is solid (with NODE_ENV=production required in Render env — already in render.yaml). The S2-T6 wallet rotation hardening (H009/H010) is well-engineered. The Bug-4 diagnostic logging doesn't leak. The new admin endpoints are properly gated with timing-safe key compare. The H001 verification against authoritative Privy state is the textbook fix.

**The unresolved CRITs are H003 + H004 + H005 + H006 (partial) + H007 (partial)** — all carry-forward from the wallet-signature legacy auth path. H003 + H004 together enable a 5-minute replay window. With H006 backfill still in place, that replay translates directly to TG identity assumption. The exploit difficulty escalated from "any Privy account" (pre-H001-fix) to "capture-and-replay wallet auth message" (post-H001-fix), but the chain is intact.

**For mainnet GA**, the recommended ordering: (1) close H004 (replay store — trivially implemented), (2) close H003 (remove or wire verifyToken), (3) tighten H005 (`NODE_ENV === 'development'` positive check), (4) add `telegramUserSource` tagging (closes H006 cleanly), (5) tighten propose-authority-v2.mjs (AUTH-N03). Items 1, 3, 4 are <1 day each. Item 2 is a design decision (drop dead code vs add proper verify). Item 5 is operational hygiene.

**Without items 1+2+3, V1 mainnet ships with a 5-minute identity-replay window. Per the V1_MAINNET_SCOPE doc this may be within acceptable launch risk for the named V1 scope (small-wager only, no large bankrolls), but should be tracked explicitly in `Docs/internal/REMEDIATION_DECISIONS.md` and capped via wager-tier limits, not allowed to silently roll into V2 unaddressed.**
