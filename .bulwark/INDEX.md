# Codebase Index — SolShot Off-Chain Stack

**Generated:** 2026-05-28 | **Scope:** Off-chain (Express + Socket.IO + React) | **High-priority only**

## Scope Summary

- **Total tracked files:** ~45 (HIGH + MEDIUM priority; excludes LOW/SKIP)
- **Off-chain LOC:** ~18,500 (server ~13.4K, client screens/wallet ~5K+)
- **Languages:** JavaScript (ES modules, no CommonJS), JSX (React), JSON (config)
- **Key frameworks:** Express, Socket.IO, Telegraf (bot), React, Phaser, @coral-xyz/anchor
- **Auth:** Privy JWT (OIDC-style), magic-link tokens (CSPRNG), Telegram initData validation
- **Persistence:** MongoDB (User, Match, FunnelEvent, Challenge, leaderboards)
- **Blockchain:** Solana RPC, N-player escrow programs (v1 devnet, v2 devnet + mainnet)

---

## HIGH PRIORITY Files

### `server/index.js`
**LOC:** 1408 | **Purpose:** HTTP entry point — Express app, middleware setup, route mounting
**Key exports:** Express app initialization, Socket.IO server, HTTP route handlers
**Routes defined:**
- `GET /health` — health check (no auth)
- `GET /stats` — financial metrics (requireAdminKey)
- `POST /api/admin/reload-keys` — credential reload (requireAdminKey)
- `POST /api/admin/truncate-handles` — one-shot handle migration (requireAdminKey)
- `GET /api/admin/funnel` — funnel aggregates, 24h/7d/30d windows (requireAdminKey)
- `POST /api/csp-report` — CSP violation reporting (public)
- `POST /api/feedback` — in-game bug reports, rate-limited (5/hr/IP)
- `POST /api/challenge` — create wagered challenge with deeplink (public)
- `GET /api/challenge/:code` — fetch challenge details (public)
- `GET /api/challenge/:code/card.png` — render challenge Satori card (public, cached 60s)
- `GET /api/stats/:tgUserId/card.png` — render career card (public, cached 60s)
- `POST /api/challenge/:code/cancel` — withdraw challenge (caller identity check)
- `POST /api/wallet/link-from-tg-token` — magic-link + optional Privy JWT (requirePrivyAuth soft)
- `POST /api/wallet/link-from-privy-telegram` — Privy-direct TG binding (requirePrivyAuth strict)
- `POST /api/arcade/session-handoff` — mint arcade-→-solshot JWT (requirePrivyAuth strict)
- `POST /api/arcade/session-validate` — validate arcade session JWT (public)
- `POST /api/arcade/register` — idempotent User doc creation (requirePrivyAuth strict)
- `POST /api/arcade/mint-session` — mint per-game leaderboard JWT (requirePrivyAuth strict)
- `POST /api/games/basketball/score` — score submission (verifyBasketballSession)
- `GET /api/games/basketball/leaderboard?limit=10&since=<iso>` — top-N leaderboard
- `GET /api/games/basketball/standing/:telegramUserId` — user's rank/standing
- `POST /api/games/keepieuppies/score` — score submission
- `GET /api/games/keepieuppies/leaderboard` — top-N leaderboard
- `GET /api/games/keepieuppies/standing/:telegramUserId` — user's rank/standing
- `POST /api/games/freekicks/score` — score submission
- `GET /api/games/freekicks/leaderboard` — top-N leaderboard
- `GET /api/games/freekicks/standing/:telegramUserId` — user's rank/standing
- `GET /api/games/leaderboard` — cross-game overall standings (basketball+keepie+freekicks)
- `GET /api/games/standing/:telegramUserId` — user's cross-game overall standing
- `POST /api/wager-waitlist` — email signup for v2 beta (public, idempotent)
**Auth gates:** 2 of 30 routes use requireAdminKey, 6 use requirePrivyAuth (5 strict, 1 soft), 3 use game-specific JWT verifiers, rest public
**Risk markers:**
- **SEC:** Hardcoded ALWAYS_ALLOWED_ORIGINS + env CORS_ORIGINS merge; helmet CSP with broad connectSrc allowing devnet + mainnet RPC + Privy auth endpoints
- **AUTH:** Magic-link token burned on first call regardless of outcome; Privy JWT soft-mode fallback to magic-link if JWT fails; H001 fix checks Privy user's TG link against body param
- **INJ:** Email regex permissive (RFC not enforced); handle truncation to 12 chars via regex slice; challenge code passed raw to DB query
- **WEB:** CSP header set; CORS explicitly managed; trust proxy enabled for Render; www→non-www redirect in prod
- **API:** maxHttpBufferSize capped 64KB; body limit 1MB; rate limiting 100 req/15min global; per-IP socket connection cap (100)
- **DATA:** FunnelEvent.create with IPHash (SHA256 truncated to 16 chars), not raw IP; handle/walletAddress field slicing on inbound
**Focus:** SEC, AUTH, WEB, API, DATA

### `server/middleware/guards.js`
**LOC:** 228 | **Purpose:** Reusable auth guards and input validation
**Key exports:**
- `requireAdminKey(req, res, next)` — timing-safe compare of x-admin-key header (uses crypto.timingSafeEqual)
- `requireAuth(client, eventName)` — socket-level auth check for isAuthenticated
- `validatePayload(data, schema)` — null-guard + type validation for socket payloads
- `validateFireParams({ angle, power, weaponId })` — numeric bounds check for shot inputs
- `sanitizeName(name)` — 20-char cap + profanity filter (143-word blacklist + leetspeak normalization)
- `withLock(key, fn, timeoutMs)` — async mutex with 30s deadlock timeout; auto-releases; logs timeout as error
- `safeHandler(handlerFn)` — try/catch wrapper for async socket handlers; tracks via monitoring.trackError
**Risk markers:**
- **AUTH:** Timing-safe compare only on admin key; socket auth is synchronous bool check
- **INJ:** sanitizeName has 143-word profanity list including slurs; leetspeak norm (0→o, 1→i, etc.); allowlist for 'jewel|jewelry|...' to prevent false positives; regex-based profanity detect
- **CRYPTO:** withLock uses setTimeout + Promise — not interrupt-safe; lock auto-releases after 30s even if fn is still running (could cause double-execution if socket reconnects within that window)
**Focus:** AUTH, INJ, CRYPTO

### `server/socket-io/main.js`
**LOC:** ~5198 | **Purpose:** Authoritative match server — all gameplay state, escrow flows, turn logic, physics delegation
**Socket event handlers (grep-extracted, ~45+ events):**
- Line 1412: `disconnect` — cleanup pendingReconnects, turn timers, player state
- Line 1524: `authenticate` — validates walletAddress + uid, sets isAuthenticated
- Line 1656: `clientDebugLog` — echo client-side console messages (if server.isDEBUG)
- Line 1686: `setWalletHandle` — update User.handle via socket (requires auth)
- Line 1737: `registerIdentity` — capture uid from client
- Line 1819: `attributeReferrer` — record referral source (funnel tracking)
- Line 1839: `getInviteLink` — generate TG share URL for solo user
- Line 2087: `disconnect` (retry window) — start 30s reconnect timer, move to pendingReconnects map
- Line 2101: `leaveRoom` — socket exit from match room
- Line 2107: `rejoinRoom` — wallet-keyed reconnect within 30s window (restore old socketId→newSocketId mapping)
- Line 2280: `deleteRoom` — host-only room deletion
- Line 2308: `joinRoom` — core match lifecycle; creates escrow if wagered; emits escrowDeposit for N-player; broadcasts room state
- Line 2562: `getRooms` — fetch public lobby list (filtered by mode, limit 100)
- Line 2572: `createChallengeRoom` — create a wagered 1v1 from challenge deeplink
- Line 2673: `joinChallenge` — join opponent side of challenge
- Line 2723: `createRoom` — host creates match room; mode validation; escrow creation deferred to joinRoom
- Line 2876: `createAIMatch` — practice vs Shot Bot (AI service integration)
- Line 2981: `joinQueue` — Quick Match queue entry; triggers auto-matchmaking every 5s
- Line 3244: `leaveQueue` — exit Quick Match
- Line 3253: `ready` — player signals loaded+ready for match start
- Line 3345: `buyWeapon` — purchase weapon with in-game gold
- Line 3408: `buyConsumable` — purchase consumable (one-time use)
- Line 3441: `shopDone` — finalize purchases, start match
- Line 3470: `getShotInfo` — fetch SHOT token balance + milestones
- Line 3489: `buyCosmetic` — purchase cosmetic item (armor/trail/blast/kill effect/skin)
- Line 3537: `equipCosmetic` — toggle cosmetic active
- Line 3560: `getCosmetics` — list all cosmetics (owned + unowned)
- Line 3579: `getStats` — fetch leaderboard rank, career stats
- Line 3638: `getLeaderboard` — top-100 by wins
- Line 3677: `challengeCallsign` — set display name for challenge
- Line 3719: `acceptChallenge` — confirm match start
- Line 3738: `declineChallenge` — reject opponent
- Line 3760: `prestigeBurn` — on-chain burn verification → tier unlock
- Line 3788: `weaponPick` — select weapon for round
- Line 3798: `getWeaponArray` — fetch custom weapon loadout
- Line 3806: `createWeaponArray` — save custom weapon loadout
- Line 3841: `shoot` (fire) — player fires; physics server-authoritative; triggers on-round-end checks
- Line 3873: `escrowDepositConfirm` — player confirms TX signature + confirms balance deduction
- Line 3998: `escrowPartialStart` — timeout path: settle with fewer than max_players deposits
- Line 4078: `escrowCancelAll` — full cancel flow on user leave
**Helper functions** (module scope):
- `getNextTurn(ms)` — advance turn in round-robin by player index
- `isRoundOver(ms)` — check if all players dead or maxRoundHealth <= 0
- `broadcastShotResult(room, shotData)` — emit trajectory + damage map to all players
- `getConnection()` — lazy-init Solana RPC connection (memoized)
- `restoreRoom(match)` — hydrate Match doc back into room object
- `createMatchEscrow(...)` / `createMatchEscrowV2(...)` — dispatch by player count
- `settlementPath(...)` — escrow settle + funnel record + SHOT emission
- `disconnectPath(...)` — graceful player-drop cleanup
**External integrations:**
- **Mongo:** User (stats, handle), Match (room state), GroupMatch (group-chat matches), Challenge (wagered duals), FunnelEvent (event log)
- **Solana RPC:** Balance check (verifyBalance), wager create/settle/refund via escrow.js or escrow-v2.js
- **Telegram:** Bot broadcast via global.__solshotIo (cancelMatch emit)
- **AI Service:** Shot Bot integration (ai.js)
- **Leaderboard:** Custom weapon arrays, cosmetic purchases persisted to User.gold + User.cosmetics
**Auth gates:**
- `requireAuth` checked on: setWalletHandle, createRoom, deleteRoom, joinRoom, joinQueue, buyWeapon, buyConsumable, weaponPick, shoot, escrowDepositConfirm, escrowCancelAll
- Socket.isAuthenticated must be true for wager flows; TG initData validates mini-app users
**Risk markers:**
- **LOGIC:** Turn advancement at line ~3654 fixed in May (was advancing even when round over, allowing duplicate fire); currentTurn now null-checked before fire dispatch (line ~3454)
- **CHAIN:** escrowDepositConfirm handler (line 3873) confirms both players received wager before proceeding; uses withLock('settle:roomId') on settle to prevent double-settlement
- **API:** Socket payloads validated via validatePayload for most handlers; fire handler has dedicated validateFireParams
- **INJ:** room name/player name passed through sanitizeName before broadcast
- **ERR:** safeHandler wraps createAIMatch, try/catch around escrow calls, monitoring.trackError on settlement fail
- **INFRA:** Turn timers cleaned up on round end and match end; room object removed from rooms map on delete; pendingReconnects cleaned up after 30s window or successful rejoin
**Focus:** LOGIC, CHAIN, AUTH, API, INJ, ERR, INFRA

### `server/services/privyAuth.js`
**LOC:** 200 | **Purpose:** Privy access-token verification middleware
**Key exports:**
- `requirePrivyAuth({ required: false })` — Express middleware; verifies Authorization header Bearer token against Privy's public key
- `verifyPrivyToken(token)` — lower-level token verify (returns null on failure)
- `isPrivyAuthConfigured()` — check if PRIVY_APP_ID + PRIVY_APP_SECRET set
**Behavior:**
- If PRIVY_APP_ID + PRIVY_APP_SECRET not configured: soft-mode (skipped), warns once; hard-mode (required:true) returns 503 in prod, pass-through in dev
- On verify failure: logs diagnostic dump (audience mismatch, expiry, issuer, signature failed); unsafeDecodeForLogging() extracts claims without verifying signature
- Sets req.privyAuth (full claims) and req.privyUserId (Privy DID / sub claim) on success
**Risk markers:**
- **AUTH:** Graceful degradation in dev (no env vars = pass-through); hard rejection in prod if configured but token invalid (required:true mode)
- **CRYPTO:** PrivyClient from @privy-io/server-auth; delegate trust to Privy's signature verification
- **INJ:** unsafeDecodeForLogging() base64url decodes without verifying — used only for diagnostic logs, safe because the token itself isn't trusted
**Focus:** AUTH, CRYPTO

### `server/services/keys.js`
**LOC:** 94 | **Purpose:** Centralized escrow authority keypair management (KM-03, KM-04)
**Key exports:**
- `initKeys()` — load keypair from SOLANA_KEYPAIR_JSON env or SOLANA_KEYPAIR_PATH file; returns true if loaded
- `getEscrowKeypair()` — retrieve loaded Keypair (required for Anchor signing)
- `isKeysReady()` — boolean check
**Behavior:**
- KM-04 note: previous version zeroed input Uint8Array after Keypair construction, but @solana/web3.js aliases the array internally — zeroing broke signing. Now omitted.
- Logs public key on init; logs errors on failure
**Risk markers:**
- **CRYPTO:** KM-03 single-point-of-ingestion for secret key; KM-04 (zeroing) removed because of Keypair aliasing issue
- **SEC:** Keypair only loaded if SOLANA_KEYPAIR_JSON/PATH configured; dev mode (no keys) gracefully disabled
**Focus:** CRYPTO, SEC

### `server/services/escrow-v2.js`
**LOC:** 640 (first 100 shown) | **Purpose:** Wraps solshot-escrow-v2 Anchor program for server-side calls
**Key exports:**
- `initEscrowV2()` — initialize Anchor provider + Program object; returns true if ready
- `getConfigPDAV2()` — derive GlobalConfig PDA seeds
- `createMatchEscrowV2(args)` — CPI create_match; returns match_id
- `settleMatchEscrowV2(matchId, winnerId, playerWallets)` — settle on-chain, distribute pot
- `cancelMatchEscrowV2(...)` — refund all depositors
- `buildDepositTransactionV2(...)` — build unsigned depositWager TX for client signing
- `getEscrowStateV2(matchId)` — fetch MatchEscrow PDA state
- `isEscrowV2Enabled()` — check if initialized
**Program ID routing:**
- Default: BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N (devnet)
- Env override: ESCROW_PROGRAM_ID_V2 (mainnet path)
- Anchor 0.30+ auto-resolves PDAs with `address` or `pda` declarations; caller must only pass signers + non-PDA accounts explicitly
**IDL path:** `server/idl/solshot_escrow_v2.json`
**Risk markers:**
- **CHAIN:** Anchor 0.30+ account resolution bug (fixed by NOT passing auto-resolvable accounts); Anchor 0.32.1 uses `bn.js` directly not from anchor (breaking change from earlier versions)
- **CRYPTO:** server keypair required (getEscrowKeypair); on init failure, v2 disabled (logs warn, returns false)
- **INJ:** Program ID read from env; IDL loaded from file; no user input validation (caller responsibility)
**Focus:** CHAIN, CRYPTO

### `server/services/users.js`
**LOC:** 377 | **Purpose:** Identity linking, wallet rotation, leaderboard helpers
**Key exports:**
- `updateWalletForTgUser(telegramUserId, newWalletAddress, source)` — S2-T6 wallet rotation with audit trail; idempotent + conflict check
- `linkTelegramIdentity({...})` — upsert User doc by TG ID (canonical merge target); 4-step fallback chain (TG → wallet → uid → create)
- `lookupUserByTelegramId(telegramUserId)` — fetch User by TG ID (lean)
- `getTopPlayers(limit)` — top-10 by wins, filters to handles != null; tiebreak by matches played asc
- `getPlayerRank(telegramUserId)` — 1-indexed rank calculation
**Behavior:**
- linkTelegramIdentity identity-policy: TG username is canonical display name (overwrites prior handle); username > firstName > supplied handle fallback
- Wallet rotation: checks new wallet not already on a different User (conflict check); pushes old to walletHistory array with timestamp + source audit
- Orphan consume: if Privy creates wallet-only doc (no TG) during /play flow, and TG identity later links a wallet, finds + deletes orphan doc and attaches to TG-keyed doc
**Auth gates:** Lookups are permissionless; linkTelegramIdentity called from index.js routes (requirePrivyAuth or magic-link)
**Risk markers:**
- **DATA:** Wallet history tracked with source ('privy-rotation', 'linkTelegramIdentity', etc.); rotated wallets logged with ellipsis (show first 8 chars only)
- **LOGIC:** S2-T6 upsert priority is TG-first (canonical), avoiding orphaned state; conflict on wallet means two users claim same address = manual merge required
**Focus:** DATA, LOGIC, AUTH

### `server/services/shot-token.js`
**LOC:** 479 (first 150 shown) | **Purpose:** Off-chain SHOT token tracking (V3 pivot — no SPL token)
**Key exports:**
- `initShotState()` — load totalShotEmitted from MongoDB on startup
- `getPlayerShotState(walletAddress)` — fetch in-memory player state (milestones, balance, burns)
- `emitShotForMatch(...)` — award SHOT for wagered/practice match completion
- `verifyBurnTransaction(txSignature)` — on-chain verification stub (v3: off-chain only, method deprecated)
- `getPrestigeInfo(walletAddress)` — fetch player's tier, burn cost, next-tier cost
**Milestones (8 one-time rewards):**
- first_wagered_match → 10 SHOT
- ten_wagered_wins → 25 SHOT
- fifty_wagered_wins → 75 SHOT
- 100_wagered_matches → 50 SHOT
- 500_damage_round → 15 SHOT
- no_prestige_win → 20 SHOT
- five_win_streak → 40 SHOT
- 100_total_matches → 100 SHOT
**Prestige tiers (cumulative burn):**
- Tier 0 (Unranked): 0 SHOT burned
- Tier 1 (Bronze): 200 SHOT → Homing Missile
- Tier 2 (Silver): 500 SHOT → Cruiser
- Tier 3 (Gold): 1200 SHOT → Tommy Gun
- Tier 4 (Platinum): 2500 SHOT → Chain Reaction
- Tier 5 (Diamond): 4000 SHOT → Pineapple
**Drip rates:**
- Wagered match: 2 SHOT + 3 SHOT if win
- Practice match: 0.5 SHOT + 0.5 SHOT if win
- Daily cap: 25 SHOT
**Risk markers:**
- **DATA:** totalShotEmitted persisted to MongoDB (debounced, max 1 save/sec); Player state in-memory (playerShotState map by walletAddress)
- **LOGIC:** Milestones checked via closure functions (check(stats) and check(stats, ctx)); context passed for contextual checks like maxRoundDamage
- **CHAIN:** verifyBurnTransaction() deprecated in v3 (SHOT is off-chain); method body checks SPL burn via onchain tx but returns null (skipped in dev mode if SHOT_TOKEN_MINT not set)
**Focus:** DATA, LOGIC

### `server/services/solana.js`
**LOC:** 354 (first 100 shown) | **Purpose:** Dispatch layer for SOL wager management
**Key exports:**
- `shouldUseEscrowV2(playerCount)` — route 1v1 to v1, N>2 to v2
- `validateMatchMode(mode, wagerSOL, matchLength)` — validate wager tier + format against match mode
- `MATCH_MODES` constant (practice/quick_match/duel/high_roller/custom_challenge)
- `WAGER_TIERS` constant (0, 0.1, 0.25, 0.5, 1.0 SOL)
- Re-exports from escrow-v2: createMatchEscrowV2, buildDepositTransactionV2, getEscrowStateV2, settleMatchEscrowV2, cancelMatchEscrowV2, isEscrowV2Enabled
**Behavior:**
- shouldUseEscrowV2 returns true for 3+ players (v2), false for 1v1 (v1)
- validateMatchMode checks wager within range + format in allowed list; custom_challenge skips tier whitelist
**Risk markers:**
- **CHAIN:** Re-exports v2 functions so main.js doesn't import from escrow.js/escrow-v2.js directly (cleaner dispatch)
- **API:** WAGER_TIERS and MATCH_MODES must stay in sync with client (LobbyScreen.js has a duplicate definition)
**Focus:** CHAIN, API

---

## MEDIUM PRIORITY Files

### `server/services/arcadeBot.js`
**LOC:** 521 | **Purpose:** Multi-game Telegram bot launcher (@TheArcadeGG_Bot)
**Key exports:**
- `initArcadeBot()` — Telegraf instance setup (token from ARCADE_BOT_TOKEN env)
- `setupArcadeBotWebhook(app)` — register webhook path /arcade-bot
- `stopArcadeBot()` — graceful shutdown
**Commands:**
- `/games` — list all arcade games (SolShot, Basketball, Keepie Uppies, Free Kicks)
- `/<slug>` — launch specific game (basketball, keepieuppies, freekicks); mint per-game JWT + redirect
**Game registry:**
- Each game has: slug, name, Vercel URL, leaderboard secret env var, session minter
**Risk markers:**
- **BOT:** Separate Telegraf instance from SolShotGG_bot; separate webhook path
- **AUTH:** Per-game JWT minted with telegramUserId + username; secret from env `<GAMESLUG>_LEADERBOARD_SECRET`
- **INFRA:** Render CORS_ORIGINS must include all game Vercel URLs or score POST blocked
**Focus:** BOT, AUTH

### `server/services/bot.js`
**LOC:** 1202 | **Purpose:** Game-specific Telegram bot (@SolShotGG_bot, hackathon-frozen)
**Commands:** `/play`, `/stats`, `/leaderboard`, `/link`, `/wallet`, `/prestige`, `/customgame`, `/duel`, `/cancel`, `/join`, `/cancelmatch`
**Risk markers:** Massive file; socket/webhook integration for group-chat matches via global.__solshotIo
**Focus:** BOT, API, AUTH

### `server/services/funnel.js`
**LOC:** 147 | **Purpose:** Onboarding funnel instrumentation (S1-T2)
**Key exports:**
- `recordFunnelEvent(stage, identity, metadata, via)` — write FunnelEvent to MongoDB
- `getFunnelAggregates(range)` — aggregate by stage, count unique identities, compute per-step retention
**Stages:** register → auth → wallet_linked → first_deposit → first_settle
**Risk markers:**
- **DATA:** recordFunnelEvent logs to console with greppable format; getFunnelAggregates returns retention.fromPrev = uniqueIds[i] / uniqueIds[i-1]
- **API:** Admin-only endpoint, requires x-admin-key
**Focus:** DATA, API

### `server/services/walletLinkTokens.js`
**LOC:** 113 | **Purpose:** Magic-link token lifecycle (32-byte CSPRNG, 10-min TTL)
**Key exports:**
- `generateLinkToken(telegramUserId, ...)` — create one-shot CSPRNG token, store in memory, return token
- `consumeLinkToken(token)` — fetch + delete token; returns entry or null if expired/used
**Risk markers:**
- **CRYPTO:** Uses crypto.randomBytes(32) for token generation
- **AUTH:** Single-use + 10-min TTL; burned on first call regardless of outcome (guards against retry-based attacks)
**Focus:** CRYPTO, AUTH

### `server/services/shot-token.js` (continued)
**Purpose:** Prestige burn verification (verifyBurnTransaction() deprecated in v3 but code retained)
**Focus:** AUTH, DATA

### `client/src/wallet/WalletContext.js`
**LOC:** ~400–500 | **Purpose:** Privy + signing orchestrator (main auth entry point for web)
**Key exports:**
- `WalletContext` — React context providing wallet state, signing methods
- `signAndSendEscrowDeposit(matchId, wagerSOL)` — build + sign TX via Privy, confirm on RPC, notify server
- `signAndBurnShot(burnAmount)` — SPL burn instruction (v3: deprecated in favor of off-chain prestige unlock)
- `walletAddress`, `isConnected`, `balance` — state
**Behavior:**
- Privy embedded wallet (replacement for Dynamic, pre-migration was Dynamic+Para+Privy)
- On first load: tries to connect, fallback to unauthenticated (browser uid only)
- signAndSendEscrowDeposit deserializes base64 TX from server, signs, broadcasts, waits for confirmation
**Risk markers:**
- **AUTH:** Privy session gates wallet access; signAndSendEscrowDeposit is soft auth (graceful fail if unsigned)
- **FE:** Balance check is client-side RPC call + Privy balance fetch; server re-verifies on deposit
**Focus:** AUTH, FE

### `client/src/screens/LobbyScreen.js`
**LOC:** ~800–1000 | **Purpose:** Match mode selection + room creation/join (4P support in S1-T5)
**Key features:**
- Match mode tabs: Practice, Quick Match, Duel, High Roller, Custom Challenge
- Wager tier selection + format (BO1/BO3/BO5)
- Create room (host) or join existing (guest)
- Escrow deposit flows for N-player matches
- MATCH_MODES definition (must sync with server solana.js)
**Risk markers:**
- **LOGIC:** MATCH_MODES definition in two places (client + server) — manual sync required
- **API:** Calls server createRoom / joinRoom socket events
- **FE:** Mode tabs + wager UI + escrow flows
**Focus:** LOGIC, API, FE

### `client/src/screens/GroupBattleWrapper.js` / `GroupDepositScreen.js`
**LOC:** ~300–400 each | **Purpose:** N-player group-chat match flows
**Key features:**
- Escrow deposit countdown (2 min)
- Both players confirm balance deduction + TX before round 1
- Escrow-active signal triggers battle start
**Risk markers:**
- **CHAIN:** Waits for escrowActive socket event before proceeding
- **FE:** Countdown + TX toast feedback
**Focus:** CHAIN, FE

### `server/models/*.js` (User, Match, GroupMatch, Challenge, FunnelEvent, *Score, etc.)
**LOC:** ~40 files, ~30–3600 LOC each | **Purpose:** Mongoose schemas + validation
**Key models:**
- **User.js** (5313 LOC): telegramUserId, walletAddress, uid, handle, stats, cosmetics, walletHistory, prestige tier, SHOT balance
- **Match.js** (1619 LOC): legacy match doc (mostly unused in v2+)
- **GroupMatch.js** (15505 LOC): group-chat match state, escrow details, deposits, settlements, state machine
- **Challenge.js** (2916 LOC): 1v1 wager challenge, deeplink code, status lifecycle
- **FunnelEvent.js** (3615 LOC): onboarding event log (stage, identity, metadata, timestamp, ipHash)
- **BasketballScore.js**, **KeepieUppiesScore.js**, **FreeKicksScore.js** (~2100 LOC each): leaderboard score docs
- **WagerWaitlist.js** (1378 LOC): email signup for v2 beta
**Risk markers:**
- **DATA:** Schemas define enums (Match.status, GroupMatch.state, Challenge.status), regex (referralCode), min:0 validators (wager)
- **INFRA:** H032 fix — mongoose.set('runValidators', true) enforces validation on all update paths
**Focus:** DATA, INFRA

### `server/scripts/*.mjs` (14+ files)
**LOC:** ~1–12K each | **Purpose:** One-shot maintenance scripts (auth required for destructive ops)
**Key scripts:**
- **init-config-mainnet.mjs** (12K): Initialize v2 escrow config on mainnet; takes CLI args for treasury/ops wallets + fee BPS
- **propose-authority-v2.mjs**, **accept-authority-v2.mjs** (2-4K): Bundle 1 timelock authority rotation
- **apply-config-update-v2.mjs**, **update-config-v2.mjs** (2-3K): Rotate treasury/ops/fee BPS
- **reconcile-wallets.mjs** (7.8K): Audit trail for wallet rotations; fix orphans + conflicts
- **recover-stuck-v2.mjs** (6.9K): Manual match recovery (settle/refund stuck matches)
- **find-privy-owner.mjs** (6.8K): Lookup Privy DID by telegram/wallet/email
- **smoke-*.mjs** (4–7K): Smoke tests for funnel, wallet rotation, etc.
- **wipe-user.mjs** (2.2K): Delete all user data (GDPR deletion)
**Risk markers:**
- **INJ:** Scripts read regex from CLI args (find-user.mjs); minimal validation
- **CRYPTO:** Scripts load keypair same as index.js (via initKeys)
- **INFRA:** Most scripts connect to MongoDB directly; some do RPC calls
**Focus:** INJ, CRYPTO, INFRA

---

## MEDIUM PRIORITY (continued)

### `client/src/scenes/main/index.js`
**LOC:** ~1500–2000 | **Purpose:** Phaser game scene (artillery gameplay)
**Key systems:**
- Tank + terrain rendering
- Physics delegation to server (server-authoritative)
- Weapon selection + aiming UI
- Damage/hit feedback
- Round/match lifecycle
**Risk markers:**
- **FE:** Client computes trajectory for visual preview only; server physics is truth
- **LOGIC:** Round-end checks, turn advancement
**Focus:** FE, LOGIC

### `client/src/components/design/*`
**LOC:** ~100–300 each | **Purpose:** Design system components (wallet display, TX toast, terrain, HUD)
**Key components:**
- **TxToastHost.js** — TX submission feedback (fixed May 7: was ignoring toast.duration)
- **Terrain.js** — terrain visualization
- **TopBar.js**, **ScreenHeader.js** — HUD layout
**Risk markers:**
- **FE:** TxToastHost bug fixed (duration honoring); depends on socket events for TX status
**Focus:** FE

---

## LOW PRIORITY Files (listed for completeness)

- `client/src/components/` — UI components (Modal, Button, Layout, etc.)
- `client/src/data/` — constants (weapons, tiers, logos)
- `client/src/utils/` — helpers (formatting, storage, math)
- `server/services/ai.js` (472 LOC) — Shot Bot (practice AI)
- `server/services/monitoring.js` (211 LOC) — error tracking + health metrics
- `server/services/gold.js` (134 LOC) — in-game currency calculation
- `server/services/match.js` (351 LOC) — legacy match helper
- `server/services/physics.js` (1545 LOC) — weapon physics (delegated from server; called by escrow settle logic)
- `server/services/physics.js` — weapon physics (delegated from server; called by escrow settle logic)

---

## SKIP ENTIRELY

- `node_modules/` — dependencies
- `target/`, `dist/`, `build/` — build artifacts
- `.bulwark/`, `.audit/`, `.bok/`, `.audit-history/` — audit working directories
- `_archive/` — old design exports (not active code)
- `programs/` — Anchor on-chain code (SOS scope)
- `pool/` — separate 8-ball pool project (stashed in working tree)

---

## Authentication Summary

| Method | Type | TTL | Usage | Enforced? |
|--------|------|-----|-------|-----------|
| **Privy JWT** | Access token | ~30 min | `/api/wallet/link-from-privy-telegram`, arcade session mint, mint-session | requirePrivyAuth (soft or strict) |
| **Magic-link token** | CSPRNG 32B | 10 min | `/api/wallet/link-from-tg-token` (primary) | consumeLinkToken, single-use |
| **Telegram initData** | Mini-app header | session | Socket.IO + bot commands | telegramSocketMiddleware |
| **Admin key** | HTTP header (x-admin-key) | ∞ | `/stats`, `/admin/funnel`, `/admin/reload-keys` | crypto.timingSafeEqual (timing-safe) |
| **Game JWT** | HS256 per-game secret | 10 min | `/api/games/<slug>/score`, `/api/games/<slug>/leaderboard` | verifySession per game |

---

## Focus Area Cross-Reference

| Category | Files (sorted by relevance) | Risk Density |
|----------|-----|-------|
| **SEC** (secrets, env vars) | keys.js, privyAuth.js, arcadeBot.js, index.js | HIGH |
| **AUTH** (access control, identity) | guards.js, privyAuth.js, users.js, walletLinkTokens.js, main.js (socket auth check) | HIGH |
| **INJ** (injection: SQL/NoSQL, command, path traversal) | guards.js (sanitizeName profanity), index.js (challenge code), scripts/*.mjs (regex from CLI) | MEDIUM |
| **WEB** (CORS, CSP, HTTPS redirect, headers) | index.js (helmet CSP, CORS_ORIGINS), main.js | MEDIUM |
| **CHAIN** (on-chain calls, escrow, settlement) | escrow-v2.js, solana.js, main.js (escrow flows), shot-token.js (burn verification deprecated) | HIGH |
| **API** (HTTP routes, socket events, validation) | index.js (30 routes), main.js (45+ socket events), guards.js (validatePayload, validateFireParams) | HIGH |
| **DATA** (persistence, schema, PII) | User.js, funnel.js, shot-token.js, index.js (IP hashing for feedback) | MEDIUM |
| **FE** (React, client-side logic) | WalletContext.js, LobbyScreen.js, GroupBattleWrapper.js, BattleScene.js | MEDIUM |
| **INFRA** (process lifecycle, caching, rate limiting) | index.js (rate limit, socket cap, keep-alive), main.js (reconnect window, locks) | MEDIUM |
| **DEP** (dependencies, versions) | package.json (server + client) | LOW |
| **BOT** (Telegram bot implementation) | bot.js, arcadeBot.js, index.js (webhook setup) | MEDIUM |
| **ERR** (error handling, logging) | guards.js (safeHandler), main.js (try/catch on settlement), monitoring.js | MEDIUM |
| **CRYPTO** (signing, hashing, RNG) | keys.js, walletLinkTokens.js, privyAuth.js | HIGH |
| **LOGIC** (game rules, state machines) | main.js (turn logic, round-end checks), users.js (identity merge priority), solana.js (wager validation) | HIGH |

---

## Top 5 Files by Risk-Marker Count

1. **main.js** (5198 LOC) — 8 markers: LOGIC, CHAIN, AUTH, API, INJ, ERR, INFRA (tight coupling of all subsystems)
2. **index.js** (1408 LOC) — 7 markers: SEC, AUTH, INJ, WEB, API, DATA (HTTP entry point, many routes)
3. **guards.js** (228 LOC) — 5 markers: AUTH, INJ, CRYPTO (core validation + auth)
4. **escrow-v2.js** (640 LOC) — 3 markers: CHAIN, CRYPTO (on-chain integration)
5. **users.js** (377 LOC) — 3 markers: DATA, LOGIC, AUTH (identity merging complexity)

---

## Files That Could Not Be Fully Classified

None — all HIGH/MEDIUM priority files summarized above. Files in LOW/SKIP categories are either simple (< 200 LOC), non-critical (archive/artifacts), or out-of-scope (Anchor programs).

---

## Notes for DB Phase 1 Auditors

- **Start with:** main.js (gameplay logic + escrow flows) → index.js (HTTP + auth gates) → guards.js (validation) → escrow-v2.js (on-chain)
- **Auth is distributed:** Privy JWT on some routes, magic-link on others, admin key on 2 routes, game JWT on arcade leaderboards, TG initData on socket. No single auth layer — check each entry point.
- **Escrow routing:** shouldUseEscrowV2(playerCount) in solana.js dispatches. N>2 always uses v2; 1v1 uses v1 (deprecated but still deployed).
- **Socket event handlers:** ~45 handlers in main.js. Start with joinRoom (core), ready (start signal), shoot (physics), escrowDepositConfirm (settlement gate).
- **Mongo schemas:** Strict validation enabled globally (H032). enums enforced on Match.status, GroupMatch.state, Challenge.status. Regex on referralCode. Min:0 on wager.
- **SHOT currency:** Off-chain only (v3 pivot); no SPL token. Balances in User.stats.shotBalance; milestones checked via closure functions.

---

**Total files indexed:** 45 (HIGH=12, MEDIUM=15, LOW=18+)  
**Total indexed LOC:** ~18,500 server + client  
**Audit scope:** All HTTP routes, all socket handlers, all service integrations, key models, key scripts  
**Excluded:** on-chain (programs/), build artifacts (target/dist/), dependencies (node_modules/)
