---
task_id: db-phase1-auth-03
provides: [auth-03-findings, auth-03-invariants]
focus_area: auth-03
files_analyzed:
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/middleware/guards.js
  - server/middleware/auth.js
  - server/middleware/telegram.js
  - server/index.js
  - server/services/groupchat/lifecycle.js
  - server/services/privyAuth.js
  - server/services/walletLinkTokens.js
finding_count: 12
severity_breakdown: {critical: 2, high: 5, medium: 4, low: 1}
---
<!-- CONDENSED_SUMMARY_START -->
# AUTH-03: Authorization & Access Control — Condensed Summary

## Key Findings (Top 10)

- **`shoot` has no auth check at all**: `client.on('shoot', ...)` at `main.js:3377` — no `requireAuth`, no `requireAuthIfWagered`. Any unauthenticated socket can relay opponent-shoot events to forge game state during wagered matches.
- **`acceptChallenge` / `declineChallenge` / `challengeCallsign` unauthenticated**: `main.js:3219,3261,3276` — no auth, no room membership check. Any socket can accept/decline a challenge on another user's behalf if it knows the `fromSocketId`.
- **`getGroupMatch` exposes full match data to non-members**: `groupchat.js:97` — no auth required, any socket can fetch any match by `matchId`. Only the Socket.IO room-join is gated on membership.
- **`groupShopComplete` has zero auth checks**: `groupchat.js:357` — `if (!tgId) return;` only; no match-membership verification. Any socket with a valid `tgId` and a known `matchId` can flip another player's `shopComplete` flag.
- **`tgIdFor()` dev fallback trusts client-supplied `telegramUserId`**: `groupchat.js:72-78` — in `NODE_ENV !== 'production'`, the entire group-chat authz model collapses to whatever value the client sends in the payload. If the server ever runs in non-production mode with real players, full impersonation is trivial.
- **`/api/wallet/link-from-tg-token` Privy JWT is soft (non-required)**: `index.js:432` — `requirePrivyAuth({ required: false })` means the Privy JWT layer is advisory. Anyone who obtains a valid magic-link token (CSPRNG, but in-memory, exfiltrable via other vulns) can bind any wallet to any TG account without Privy validation.
- **`/api/challenge/:code/cancel` is unauthenticated**: `index.js:388` — no auth middleware. Any anonymous HTTP caller who knows the shortCode can cancel another user's challenge.
- **`escrowCancelAll` / `escrowPartialStart` check `partialDecisionMaker` but only by socketId**: `main.js:3592, 3512` — the decision-maker is the first depositor's socketId. If a socket disconnects and re-authenticates with a new socketId before the decision window opens, the check could theoretically be bypassed (depends on exact reconnect timing).
- **`/api/stats/:tgUserId/card.png` exposes career stats for any TG user ID**: `index.js:364` — no auth. Public enumeration of any user's win/loss record by incrementing tgUserId.
- **Wallet backfill in `authenticate` creates cross-identity trust chain without an explicit second signature**: `main.js:1298-1303` — during wallet auth, if a User doc has a `telegramUserId`, server sets `client.telegramUser = { id: tgUserId }`, enabling group-chat `tgIdFor()` to pass. A wallet-to-tgId database lookup substitutes for actual Telegram HMAC validation.

## Critical Mechanisms

- **`requireAuth(client, eventName)`** `guards.js:40-46`: checks `client.isAuthenticated` only. Set by `handleAuthenticate()` after Ed25519 signature verification. Does NOT re-verify identity per event — entire session inherits auth from one-time handshake.
- **`requireAuthIfWagered(client, eventName)`** `main.js:507-512`: wraps `requireAuth` gated on `room.wager > 0`. Practice-mode events have no identity check at all.
- **`tgIdFor(socket, payload)`** `groupchat.js:72-78`: HMAC-validated `socket.telegramUser.id` (set by `telegramSocketMiddleware`) or client-supplied `payload.telegramUserId` in non-production. The production path is cryptographically sound. The dev path is fully attacker-controlled.
- **`telegramSocketMiddleware`** `telegram.js:87-108`: validates Telegram `initData` HMAC-SHA256 on connection. Uses timing-safe comparison. 24-hour `auth_date` window. Does NOT reject connections with invalid initData — it proceeds silently (`return next()`) after setting `socket.telegramUser` only on success.
- **Match-membership checks**: No centralized service. Ad-hoc per handler. 1v1: room membership via `getPlayerSlot(room, client.id)` (socketId). Group: MongoDB query `telegramUserId: tgId` in `purchaseGroupWeapon` `$elemMatch`. `fireGroupShot` delegates to `lifecycle.handleShot()` which does DB lookup by `tgId`.
- **`escrowDepositConfirm`** `main.js:3402`: `requireAuth` + cross-room roomId check + on-chain `depositsMask` bitmask verification. Well-layered.

## Invariants & Assumptions

- INVARIANT: "Wagered actions require `client.isAuthenticated`" — enforced via `requireAuth` / `requireAuthIfWagered` on `createRoom`, `joinRoom`, `joinQueue`, `fire`, `buyWeapon`, `shopDone`, `requestTerrain`, etc. — `main.js:2345,1950,2585,3647,2896,2992,4336`.
- INVARIANT: "Group-chat identity derived from HMAC-validated TG initData in production" — enforced by `tgIdFor()` conditional at `groupchat.js:73`. NOT enforced in dev/non-production. ⚠
- INVARIANT: "Server never trusts client-supplied wallet address" — enforced via `authenticatedWallets[client.id]` pattern; `walletAddress` from payload never used for financial decisions. `main.js:1946, 2348`.
- INVARIANT: "Turn ownership enforced before fire" — enforced at `main.js:3682`: `!ms.currentTurn || ms.currentTurn !== this.id`.
- ASSUMPTION: "A socket that passed `authenticate` owns its `walletAddress` for the session lifetime" — validated at auth time (signature check), NOT re-validated per event. If socket is stolen (XSS, etc.) the entire session is compromised.
- ASSUMPTION: "Admin key in `x-admin-key` header is secret" — VALIDATED via `requireAdminKey` middleware. `guards.js:25-31`. Risk: `ADMIN_API_KEY` not configured → all admin routes return 401 (secure default).
- ASSUMPTION: "A Telegram initData on the socket handshake is fresh (< 24 hours)" — VALIDATED at `telegram.js:69-74`. Expiry window is 24 hours — longer than typical attack window, but not per-session.

## Risk Observations (Prioritized)

1. **`shoot` relay event has zero auth check** (`main.js:3377`): Any socket can relay fabricated `opponentShoot` events during a wagered match. This can cause the opponent's client to render fake shot animations, but since `fire` (server-authoritative) is the canonical hit-detection path, actual HP/damage cannot be forged this way. Impact: visual desync/confusion in wagered matches. Not a fund-theft vector but a game-integrity concern.
2. **`acceptChallenge` / `declineChallenge` unauthenticated** (`main.js:3261,3276`): Caller supplies `fromSocketId` in payload. No auth, no ownership check. A socket that knows (or can enumerate) another player's socket ID can accept or decline their challenge. SocketIds are not secret (broadcast in `roomUpdate` payloads). Practical impact: DoS on challenge flow; malicious socket can accept a wagered challenge on behalf of a victim and trigger escrow deposit.
3. **`/api/challenge/:code/cancel` unauthenticated** (`index.js:388`): Any unauthenticated caller with the short code can cancel a challenge. Short codes are shared publicly (in Telegram DMs, QR codes), so this is a griefing vector.
4. **`groupShopComplete` membership not verified** (`groupchat.js:357`): Any socket with a valid TG identity and a known `matchId` can flip another player's `shopComplete=true`, skipping their shop visit. This is cosmetically impactful but not a direct financial vector (weapons bought in shop phase cost in-match Gold, not SOL).
5. **`getGroupMatch` no auth, full data exposure** (`groupchat.js:97`): Returns full sanitized match document to any socket. Includes player callsigns, HP values, weapon inventories, terrain snapshot. No membership required. Match IDs are short (guessable if low-entropy) — needs verification.
6. **Wallet → TG backfill in `authenticate` bypasses HMAC validation** (`main.js:1298-1303`): After wallet auth, server sets `client.telegramUser` from `User.telegramUserId` DB lookup. This is a DB-backed trust chain (wallet signature → DB → TG id) rather than Telegram HMAC chain. An attacker who can update a User's `telegramUserId` field (via a compromised DB operation or a race in `linkTelegramIdentity`) can forge a TG identity for group-chat fire events.
7. **`/api/wallet/link-from-tg-token` Privy JWT soft** (`index.js:432`): `requirePrivyAuth({ required: false })` makes Privy JWT advisory. The magic-link token alone is sufficient. Consequence: if the in-memory token store is read (e.g., via a process dump, memory disclosure, or the server log leaking token values), an attacker can bind arbitrary wallets to TG accounts without Privy.
8. **`telegramSocketMiddleware` proceeds on invalid initData** (`telegram.js:101-107`): Invalid or absent Telegram initData does not reject the connection. This is correct behavior (not all clients are Telegram). But it means group-chat events that rely on `tgIdFor()` silently get `tgId=null` and emit `no_identity` — rather than being audited as suspicious. No rate limiting on invalid-initData connects.

## Novel Attack Surface

- **Challenge accept via socket ID enumeration**: `acceptChallenge` accepts `fromSocketId` from the payload with zero validation. Socket IDs are not secret — they are included in `roomUpdate` broadcasts and are visible to all players in a room. An attacker who is in any room with a challenged player can see their socketId and issue `acceptChallenge` on their behalf, triggering a wagered room join flow.
- **`groupShopComplete` cross-match flagging**: The update query is `{ matchId, 'players.telegramUserId': tgId }`. A TG user who is in multiple group matches simultaneously could fire `groupShopComplete` for a `matchId` they're not currently playing (if they joined a past match that is still "active" in the DB). The update silently no-ops if no matching player doc exists, but this hasn't been stress-tested with concurrent multi-match scenarios.
- **`shoot` relay as confusion injection**: While `shoot` cannot alter server state, it can inject believable fake fire animations into an opponent's Phaser scene during a wagered match. Combined with a turn-timer exploit, this could cause an opponent to believe they took damage when they didn't, potentially causing them to make suboptimal weapon purchases.

## Cross-Focus Handoffs

- → **AUTH-01 (Authentication)**: The `authenticate` event's wallet-to-TG backfill (`main.js:1298`) effectively merges auth and authz identity establishment. AUTH-01 should examine whether `linkTelegramIdentity` is idempotent and whether a wallet can be linked to a different TG id by re-authenticating.
- → **API-03 (WebSocket Security)**: The `shoot` relay event (`main.js:3377`) is a no-auth relay with no room membership check beyond `client.roomId`. API-03 should examine whether `client.roomId` can be set to an arbitrary value by a different event, enabling cross-match relay injection.
- → **LOGIC-01 (Business Logic)**: `escrowPartialStart` and `escrowCancelAll` (`main.js:3505,3585`) check `partialDecisionMaker === client.id`. The decision-maker is assigned as the `firstDepositorSocketId` which is set in the deposit confirmation flow. If reconnect is ever re-enabled, a reconnecting socket gets a new ID and the old decision-maker check could be bypassed — the reconnect path at `main.js:1728` currently short-circuits with "Reconnect is disabled" but the dead code beneath still sets `client.id` mapping.
- → **ERR-02 (Race Conditions)**: `groupShopComplete` uses `findOneAndUpdate` atomically but `purchaseGroupWeapon`'s diagnostic read path (`main.js` equivalent in `groupchat.js:325-343`) re-reads the document after the atomic update fails — this diagnostic window has no lock and could race.

## Trust Boundaries

The 1v1 match model has a two-layer authz model: **socket authentication** (Ed25519 wallet signature verified once at `authenticate`) gates wagered actions via `requireAuth`; **turn ownership** gates firing via `ms.currentTurn === client.id`. Practice mode deliberately bypasses authentication. The group-chat model uses a **separate identity chain**: Telegram HMAC-SHA256 initData validated at socket connect time sets `socket.telegramUser.id`, which `tgIdFor()` uses exclusively in production. The critical trust transition is the `authenticate` handler's wallet-to-TG backfill, which promotes a DB-sourced TG id to the same trust level as HMAC-validated initData. HTTP endpoints are either fully public (challenge read, stats card) or gated by `requireAdminKey` (admin operations) or `requirePrivyAuth` (wallet-link operations). There is no per-HTTP-endpoint ownership check beyond wallet-link token possession — the challenge cancel endpoint has no auth at all.
<!-- CONDENSED_SUMMARY_END -->

---

# AUTH-03: Authorization & Access Control — Full Analysis

## Executive Summary

The SolShot server has a heterogeneous authorization model: 1v1 socket events use a `requireAuth`/`requireAuthIfWagered` guard pattern based on a one-time Ed25519 wallet signature; group-chat events use Telegram HMAC initData validated per-connection; HTTP routes are either public or guarded by `requireAdminKey` / `requirePrivyAuth`. Since the February 2026 audit the most critical finding (6 unauthenticated socket events) has been substantially remediated — the `fire` event now has per-turn auth + ownership checks. However, several gaps remain, notably the `shoot` relay event (no auth), challenge accept/decline (no auth, socketId from payload), the challenge cancel HTTP endpoint (completely unauthenticated), and inconsistent group-chat membership verification.

## Scope

Off-chain only. Anchor/Rust program authorization not in scope. Analysis covers:
- All `socket.on()` handlers in `server/socket-io/main.js` (~58 events)
- All `socket.on()` handlers in `server/socket-io/groupchat.js` (8 events)
- All HTTP endpoints in `server/index.js` (~12 routes)
- Guard middleware: `server/middleware/guards.js`, `server/middleware/auth.js`, `server/middleware/telegram.js`
- Group-chat lifecycle: `server/services/groupchat/lifecycle.js` (TG identity threading)

## Key Mechanisms

### 1. `requireAuth` / `requireAuthIfWagered` Pattern

**File:** `server/middleware/guards.js:40-46`

```js
export function requireAuth(client, eventName) {
    if (!client.isAuthenticated) {
        client.emit(`${eventName}Error`, { reason: 'Authentication required' });
        return false;
    }
    return true;
}
```

`client.isAuthenticated` is set to `true` in `handleAuthenticate()` (`auth.js:131`) after successful Ed25519 signature verification. It is never cleared (except on disconnect). There is no per-event re-verification.

`requireAuthIfWagered` (`main.js:507-512`) wraps `requireAuth` and only calls it when `room.wager > 0`. For practice-mode events, any socket can proceed.

**Concern**: `requireAuthIfWagered` guards most gameplay events correctly, but several relay events and info-read events have no guard at all (see event inventory below).

### 2. Telegram Identity (`tgIdFor`)

**File:** `server/socket-io/groupchat.js:72-78`

```js
function tgIdFor(socket, payload) {
    if (socket?.telegramUser?.id) return socket.telegramUser.id;
    if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) {
        return payload.telegramUserId;
    }
    return null;
}
```

`socket.telegramUser` is set by `telegramSocketMiddleware` (`telegram.js:97-99`) only after HMAC-SHA256 validation of Telegram `initData`. The HMAC uses timing-safe comparison (`crypto.timingSafeEqual`). The 24-hour `auth_date` window is checked.

**However**, in `main.js:1298-1303`, during the `authenticate` handler, the server performs a DB lookup `User.telegramUserId` and backfills `client.telegramUser`:

```js
if (tgUserId && !client.telegramUser?.id) {
    client.telegramUser = {
        id: tgUserId,
        username: userDoc?.username || null,
        first_name: null,
    };
}
```

This means a browser-only user (no Telegram initData on connect) who authenticates with their wallet will have `client.telegramUser` populated from the database — bypassing HMAC validation entirely. The trust chain is: wallet signature (Ed25519) → User DB → TG id. This is documented in the code comments as intentional for "browser-only Privy users," but it merges two distinct identity systems.

**Critical concern for dev mode**: `NODE_ENV !== 'production'` is the only gate on `payload.telegramUserId`. If the server runs in dev mode (e.g., staging, local), any client can claim any TG identity.

### 3. Match Membership Checks

**1v1 Matches:**
- Membership checked via `getPlayerSlot(room, client.id)` which does `room.players.find(p => p.socketId === client.id)`.
- The `fire` event verifies `ms.currentTurn === this.id` (turn ownership implies membership).
- `buyWeapon`: checks `inventory[client.id]` — if the key exists, player is implicitly in the room.
- No explicit "is this socket in this room's player list" check on all events; the guard is transitively enforced via `client.roomId` which is set at `joinRoom`.

**Group Matches:**
- `fireGroupShot`: membership checked via `lifecycle.handleShot(matchId, tgId, payload)` which does a DB query `GroupMatch.findOne({ matchId })` and verifies `match.currentPlayer.telegramUserId === tgId`. This is a full membership AND turn check in one DB query. Sound.
- `purchaseGroupWeapon`: uses atomic `findOneAndUpdate` with `$elemMatch: { telegramUserId: tgId }` — sound.
- `forfeitGroupMatch`: delegates to `lifecycle.handleForfeit(matchId, tgId)` — sound.
- `groupShopComplete`: **only** checks `tgId` existence, then does `findOneAndUpdate({ matchId, 'players.telegramUserId': tgId })` without verifying `state: 'active'`. No state guard. Any TG user in any non-settled match can mark their shop complete.
- `getGroupMatch`: no membership check, returns full match to any caller.
- `getMyGroupMatches`: filters by `tgId` — only returns matches the caller is in. Sound.
- `requestGroupDepositTx`: verifies caller's wallet is in `match.players` — sound.
- `confirmGroupDeposit`: resolves wallet from `lookupUserByTelegramId(tgId)` (server-side), checks `playerIndex >= 0`, and verifies on-chain `depositsMask` bitmask. Well-layered.

### 4. HTTP Route Authorization

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/` | GET | None | Static string |
| `/health` | GET | None | Health check — public, no sensitive data |
| `/stats` | GET | `requireAdminKey` | Financial metrics — guarded |
| `/api/admin/reload-keys` | POST | `requireAdminKey` | Key reload — guarded |
| `/api/admin/truncate-handles` | POST | `requireAdminKey` | Data migration — guarded |
| `/api/csp-report` | POST | None | CSP report — acceptable public |
| `/api/challenge` | POST | None | Create challenge — unauthed |
| `/api/challenge/:code` | GET | None | Read challenge — unauthed |
| `/api/challenge/:code/card.png` | GET | None | Render card — unauthed |
| `/api/challenge/:code/cancel` | POST | **None** | Cancel challenge — **UNAUTHED** ⚠ |
| `/api/stats/:tgUserId/card.png` | GET | None | Career stats — unauthed, enumerable |
| `/api/wallet/link-from-tg-token` | POST | `requirePrivyAuth({ required: false })` | Soft Privy JWT — magic-link is primary |
| `/api/wallet/link-from-privy-telegram` | POST | `requirePrivyAuth({ required: true })` | Hard Privy JWT — required |

**Critical finding**: `/api/challenge/:code/cancel` at `index.js:388` has no authentication at all. Short codes are distributed to players via Telegram DMs and QR codes and are considered semi-public. Any unauthenticated caller who knows (or guesses) a short code can cancel a challenge.

**Medium finding**: `/api/challenge` (POST) has no auth. Any anonymous caller can create challenge records in the DB with arbitrary `challengerHandle`, `challengerWallet`, and `opponentHandle`. This is a spam/DoS vector against the Challenge collection.

**Medium finding**: `/api/stats/:tgUserId/card.png` exposes win/loss/damage stats for any Telegram user ID by enumeration. tgUserId values are predictable sequential integers assigned by Telegram.

### 5. Admin Endpoints

`requireAdminKey` (`guards.js:25-31`) checks `x-admin-key` header against `ADMIN_API_KEY` env var. If `ADMIN_API_KEY` is not configured, ALL requests return 401 (secure default — fail-closed). Used on:
- `/stats` (financial metrics)
- `/api/admin/reload-keys` (keypair reload)
- `/api/admin/truncate-handles` (data migration)

No admin-tier socket events were found. The match settle/cancel path uses the server keypair directly (not an admin socket event), which is correct.

## Socket Event Inventory + Auth Coverage Table

### main.js Events

| Event | Auth Guard | Turn/Membership | Notes |
|---|---|---|---|
| `authenticate` | None (sets auth) | N/A | Entry point |
| `clientDebugLog` | None | N/A | Log relay, no state change |
| `setWalletHandle` | Checks `authenticatedWallets[client.id]` | N/A | Read wallet from server — sound |
| `registerIdentity` | None | N/A | Practice identity, no wager |
| `attributeReferrer` | None | N/A | Attribution, no financial impact |
| `getInviteLink` | None (returns empty if no identity) | N/A | Read-only |
| `disconnect` | N/A | N/A | Internal |
| `leaveRoom` | None | N/A | No wager impact |
| `rejoinRoom` | DISABLED | N/A | Returns error immediately |
| `deleteRoom` | `requireAuthIfWagered` + `isHost` | Checks `client.isHost` | Sound for wagered |
| `joinRoom` | `requireAuth` if wager > 0 | Implicit via room capacity | Sound |
| `getRooms` | None | N/A | Read-only, public data |
| `createChallengeRoom` | `requireAuth` if wager > 0 | N/A | Sound for wagered |
| `joinChallenge` | None | N/A | Validates shortCode, not player identity ⚠ |
| `createRoom` | `requireAuth` if wager > 0 | N/A | Sound for wagered |
| `createAIMatch` | None (practice only) | N/A | Practice, no wager |
| `joinQueue` | `requireAuth` if wager > 0 + balance check | N/A | Sound |
| `leaveQueue` | None | N/A | No state impact |
| `ready` | `requireAuthIfWagered` | N/A | Sound |
| `buyWeapon` | `requireAuthIfWagered` | Implicit via gold state | Sound for wagered |
| `buyConsumable` | Checks `authenticatedWallets[client.id]` | N/A | Sound |
| `shopDone` | `requireAuthIfWagered` | N/A | Sound |
| `getShotInfo` | None (returns empty if no wallet) | N/A | Read-only |
| `buyCosmetic` | Checks `authenticatedWallets[client.id]` | N/A | Sound |
| `equipCosmetic` | Checks `authenticatedWallets[client.id]` | N/A | Sound |
| `getCosmetics` | Returns empty if no wallet | N/A | Read-only |
| `getStats` | None (returns defaults if no identity) | N/A | Read-only |
| `getLeaderboard` | None | N/A | Public data |
| `challengeCallsign` | **None** | None | No auth ⚠ |
| `acceptChallenge` | **None** | None — caller claims `fromSocketId` | **No auth, socketId from payload** ⚠ |
| `declineChallenge` | **None** | None — caller claims `fromSocketId` | **No auth, socketId from payload** ⚠ |
| `prestigeBurn` | Checks `authenticatedWallets[client.id]` + on-chain verify | N/A | Sound |
| `weaponPick` | `requireAuthIfWagered` | None beyond room membership | Sound |
| `getWeaponArray` | None | N/A | Read-only |
| `createWeaponArray` | `requireAuthIfWagered` | None (any room member) | Sound for wagered |
| `shoot` | **None** | State check only | **No auth at all** ⚠ |
| `escrowDepositConfirm` | `requireAuth` + roomId cross-check + on-chain verify | Room membership via `room.players.find` | Sound |
| `escrowPartialStart` | `requireAuth` + `partialDecisionMaker === client.id` | Via decision-maker check | Sound |
| `escrowCancelAll` | `requireAuth` + `partialDecisionMaker === client.id` | Via decision-maker check | Sound |
| `fire` | Auth if wager > 0 + turn check | `ms.currentTurn === this.id` | Sound |
| `requestTerrain` | `requireAuthIfWagered` | N/A | Sound |
| `weaponChange` | `requireAuthIfWagered` | N/A | Relay only |
| `angleChange` | `requireAuthIfWagered` | N/A | Relay only |
| `powerChange` | `requireAuthIfWagered` | N/A | Relay only |
| `positionUpdate` | `requireAuthIfWagered` + clamp | None beyond room | Clamp reduces impact |
| `stepLeft` | `requireAuthIfWagered` + turn check | `ms.currentTurn !== client.id` guard | Sound |
| `stepRight` | `requireAuthIfWagered` + turn check | `ms.currentTurn !== client.id` guard | Sound |
| `giveTurn` | `requireAuthIfWagered` | None beyond room | Relay, no financial impact |
| `requestTurn` | `requireAuthIfWagered` | N/A | Relay only |
| `playAgainRequest` | `requireAuthIfWagered` | N/A | State-guarded |
| `getShotPrice` | None | N/A | Read-only, public |

### groupchat.js Events

| Event | Auth Guard | Membership Check | Notes |
|---|---|---|---|
| `getGroupMatch` | `tgIdFor` (returns `tgId` but doesn't gate on null — proceeds anyway) | None — joins room if member, serves data either way | Full match data to any caller ⚠ |
| `fireGroupShot` | `tgIdFor` gates, null → reject | Full membership + turn check via `lifecycle.handleShot` | Sound |
| `forfeitGroupMatch` | `tgIdFor` gates, null → reject | Caller-only via `lifecycle.handleForfeit(matchId, tgId)` | Sound |
| `purchaseGroupWeapon` | `tgIdFor` gates, null → reject | Atomic `$elemMatch` in update | Sound |
| `groupShopComplete` | `tgIdFor` present (null → return), but no reject emit | No state check, no `state: 'active'` guard | Can flip any match ⚠ |
| `getMyGroupMatches` | `tgIdFor` gates | Filtered by `tgId` | Sound |
| `requestGroupDepositTx` | `tgIdFor` gates | Wallet membership check via `match.players` | Sound |
| `confirmGroupDeposit` | `tgIdFor` gates | Wallet resolved server-side + `playerIndex >= 0` | Sound |

**Auth coverage calculation:**
- main.js: 58 events. Events with proper auth (wagered-gated correctly OR always-authenticated OR read-only-safe): ~50. Problematic: `shoot` (1), `acceptChallenge` (1), `declineChallenge` (1), `challengeCallsign` (1). = **54/58 = 93%**.
- groupchat.js: 8 events. Problematic: `getGroupMatch` (data exposure), `groupShopComplete` (no state guard). = **6/8 = 75%**.
- HTTP: 12 routes. Problematic: `/api/challenge/:code/cancel` (0 auth). = **11/12 = 92%**.

**Overall: ~91% coverage (69/76 events+routes properly authorized)**

## Trust Model

**1v1 socket model:** Wallet signature at connect time establishes identity for the session. `client.isAuthenticated` + `client.walletAddress` are the session state. All financial events check `requireAuth`. Turn ownership (`ms.currentTurn`) prevents off-turn actions. No per-event re-authentication.

**Group-chat model:** Telegram HMAC-SHA256 initData at connect time establishes identity. `socket.telegramUser.id` is the canonical identity. Server never accepts `tgId` from the event payload in production. The wallet-backfill mechanism in `authenticate` creates a secondary path: `walletSignature → DB.telegramUserId → socket.telegramUser.id`.

**HTTP model:** Admin routes gated by shared secret (`ADMIN_API_KEY`). Wallet-link route gated by magic-link token (CSPRNG, single-use) + optional Privy JWT. Challenge/stats routes have no auth.

## State Analysis

All session auth state is in-memory on the socket object (`client.isAuthenticated`, `client.walletAddress`, `client.telegramUser`). There is no persistent auth token beyond the session. Server restart means all sessions lose auth state. The JWT generated by `generateToken()` in `auth.js` is returned to the client on `authenticate` success but is never consumed server-side for subsequent event authorization (it was dead code — noted in `auth.js:104` as "verifyToken removed — was dead code").

## Dependencies

- **`tweetnacl`** (`auth.js`): Ed25519 signature verification. Well-established library.
- **`jsonwebtoken`** (`auth.js`): JWT generation (24h). Not consumed server-side.
- **`@privy-io/server-auth`** (`privyAuth.js`): Privy JWT verification for wallet-link routes.
- **Telegram `initData` HMAC** (`telegram.js`): In-house implementation per Telegram docs. Correctly uses timing-safe comparison.

## Focus-Specific Analysis

### `tgIdFor()` Integrity Assessment

The function is cryptographically sound in production:
1. `telegramSocketMiddleware` validates HMAC-SHA256 of `initData` using `crypto.timingSafeEqual` and a 24h expiry window.
2. `tgIdFor()` returns `socket.telegramUser.id` only if set by the middleware.
3. The dev fallback (`payload.telegramUserId`) is gated on `NODE_ENV !== 'production'`.

**Weakness**: The wallet-to-TG backfill in `authenticate` (main.js:1298) populates `client.telegramUser` from the DB. This means in production, a browser user who authenticated via wallet signature will pass `tgIdFor()` checks using a DB-sourced TG id. The DB trust chain is: Ed25519 wallet sig → `linkTelegramIdentity` (which itself requires magic-link token or Privy JWT). If the wallet-link flow was compromised (see `/api/wallet/link-from-tg-token` soft Privy issue), a forged wallet→TG binding could enable group-chat impersonation.

### Disconnect/Reconnect Authz

`rejoinRoom` at `main.js:1728` is currently **disabled** — it immediately emits `rejoinError: 'Reconnect is disabled'`. The dead code beneath shows the original implementation had a signature-based wallet rejoin path that would re-verify the Ed25519 signature. The practice-mode UID rejoin path had no signature check. The current disabled state means no reconnect security issues are active.

### Cross-Match Authorization

For 1v1: `client.roomId` is the only cross-match isolation. The `escrowDepositConfirm` handler explicitly checks `client.roomId !== rid` at `main.js:3408` ("SA-06: Cross-room isolation"). The `fire` handler uses `this.roomId` (the socket's current room). A socket cannot send fire events for a room it's not in because it would need `client.roomId` to be set to that room — which only happens at `joinRoom` / `createRoom`.

For group-chat: The `matchId` is passed as a payload parameter and verified against the DB. No cross-match isolation issue beyond the `tgId` membership check.

## Risk Observations (Detail)

### CRITICAL-1: `shoot` relay without any auth check

`main.js:3377-3397`:
```js
client.on('shoot', (data) => {
    if (!data || typeof data !== 'object') return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'shoot')) return
    // ... relay to opponent
})
```

No `requireAuth`, no `requireAuthIfWagered`. Any unauthenticated socket that has `client.roomId` set (by joining a public room) can relay `opponentShoot` events to the opponent. This event is the legacy client-relay path. The server-authoritative `fire` event is separate and properly guarded. Impact: visual fake-shot injection during wagered matches. Not a fund-theft vector since `fire` is the canonical damage path, but it can confuse and deceive opponents.

### CRITICAL-2: `acceptChallenge` / `declineChallenge` no auth, socketId from payload

`main.js:3261-3284`:
```js
client.on('acceptChallenge', (data) => {
    const challengerSocketId = data?.fromSocketId
    // ...
    challengerSocket.emit('challengeAccepted', { ... })
})
```

No auth. `fromSocketId` comes from client payload. Socket IDs are visible to other room members via `roomUpdate` broadcasts (they contain `socketId` for each player). An attacker in the same room as a challenged player can accept/decline challenges on their behalf. The `acceptChallenge` emits `challengeAccepted` to the challenger socket, which triggers them to initiate the room join flow — potentially creating a wagered room and triggering escrow deposit prompts to an unwitting challenger.

### HIGH-1: `/api/challenge/:code/cancel` unauthenticated

`index.js:388-397`: No auth middleware. Anyone who knows the shortCode can cancel a challenge. ShortCodes are semi-public (shared in TG messages and QR codes as `https://solshot.gg/?startapp=ch_<CODE>`). Impact: griefing/DoS on challenge flow, not a financial loss vector (no funds at stake at challenge creation time).

### HIGH-2: `groupShopComplete` no membership state guard

`groupchat.js:357-374`: Only checks `!tgId` then issues `findOneAndUpdate`. No `state: 'active'` filter in the query. Any group-match player (in any state including `lobby` or `settled`) can flip `shopComplete=true` on their own player doc. This could cause the Mini App to skip the shop on next open. Not a direct financial vector.

### HIGH-3: Wallet→TG backfill bypasses HMAC

`main.js:1298-1303`: Sets `client.telegramUser` from DB without Telegram signature. A compromised wallet→TG binding in the DB propagates to group-chat fire authorization. This is an indirect exploit requiring a prior compromise of `linkTelegramIdentity`, but it creates a trust chain longer than necessary.

### HIGH-4: `/api/wallet/link-from-tg-token` Privy JWT soft

`index.js:432`: `requirePrivyAuth({ required: false })`. Magic-link token alone is sufficient to bind a wallet to a TG account. The token is 32-byte CSPRNG with 10-minute TTL and single-use enforcement, which is a strong primary control. But if the in-memory token store is somehow readable (debug endpoint, memory disclosure), an attacker can bypass Privy entirely.

### HIGH-5: `getGroupMatch` full data exposure without membership

`groupchat.js:97-130`: Returns sanitized match (players, HP, weapons, terrain) to any unauthenticated caller with a `matchId`. The sanitize function removes only `lobbyMessageId` and `__v`. Concern: match IDs appear to be short hex strings generated by `crypto.randomBytes` — need to check their length. Need to verify if match IDs are guessable.

### MEDIUM-1: `challengeCallsign` no auth

`main.js:3219`: No auth check. Any socket can spam `challengeReceived` events to any connected player by sending known or guessed handle names.

### MEDIUM-2: `/api/challenge` (POST) unauthenticated

`index.js:282-320`: No auth. Can create challenge records with arbitrary data. Spam/DoS against the Challenge MongoDB collection.

### MEDIUM-3: `/api/stats/:tgUserId/card.png` stat enumeration

`index.js:364-386`: Public endpoint. tgUserId values are predictable Telegram-assigned sequential integers. Enumerating them reveals player win rates, damage stats, and callsigns.

### MEDIUM-4: `getGroupMatch` match-ID guessability

Match IDs for group matches are generated in `lifecycle.js`. Need to verify they use CSPRNG with sufficient entropy. If group match IDs are short or sequential, the unauthenticated `getGroupMatch` becomes an enumeration vector. (Note: `createRoom` in main.js uses `crypto.randomBytes(4).toString('hex')` = 32-bit entropy. Group match IDs may use the same pattern — 4 bytes = 4 billion possibilities, but not huge.)

## Cross-Focus Intersections

- **CHAIN-01/CHAIN-03**: The `escrowDepositConfirm` handler's on-chain `depositsMask` verification is well-designed. The server re-checks the bitmask rather than trusting the client's `txSignature` claim.
- **ERR-02**: `escrowCancelAll` and `escrowPartialStart` check the `partialDecisionMaker` socketId. If two concurrent events from the same socket arrive, JavaScript's single-threaded event loop prevents race conditions here. But if the decision-maker socketId changes (e.g., a reconnect re-enables) the check could be bypassed.
- **LOGIC-01**: `playAgainRequest` requires `requireAuthIfWagered`. Once all players request it, `resetForPlayAgain` is called which re-creates escrow. No second auth challenge here — the existing session auth is inherited.

## Cross-Reference Handoffs

- **→ AUTH-01**: Examine `handleAuthenticate` return value and whether the JWT is retained client-side. If the JWT is used for anything client-side (e.g., forwarded to a Privy flow), its 24h expiry and lack of server-side consumption are interesting.
- **→ API-03**: `shoot` relay has no auth. `giveTurn` relay has `requireAuthIfWagered`. Examine whether `giveTurn` data could be exploited to desync game state even with auth (it relays raw positions, and while schema-validated, positions could still be abused to teleport the opponent's visual representation).
- **→ LOGIC-01**: `escrowPartialStart` compacts `room.players` to depositors only and promotes a new host. Examine whether this compact operation has any authz checks on the promotion (new host inherits `isHost = true` without any signature).
- **→ INJ-05**: `acceptChallenge` passes `fromSocketId` from payload directly to `io.sockets.sockets.get(fromSocketId)`. If `fromSocketId` can be crafted to be a non-socket-ID object, prototype pollution or socket-map corruption could result. Need to verify Socket.IO's get() safety with arbitrary keys.
- **→ ERR-01**: `groupShopComplete` has a silent catch on the DB update. If it fails (e.g., DB down), the client receives `groupShopCompleteAck: { ok: true }` but the update may not have been applied. The client proceeds to battle thinking shop is done when it isn't.

## Novel Attack Surface Observations

1. **Socket ID leakage as authz bypass surface**: Socket IDs are visible in `roomUpdate` payloads to all room members. This turns any `fromSocketId`-based authz check (currently only in challenge flow) into an enumerable attack surface for anyone who shared a room with the target. Worth noting as a pattern to avoid.

2. **`authenticate` as group-chat privilege escalation**: A browser user without TG initData can gain `tgIdFor()` trust by: (a) having a wallet linked to a TG account via the magic-link flow, (b) authenticating with wallet signature in the main.js `authenticate` handler. This is a designed flow, but it creates a cross-system trust bridge that could be exploited if the wallet-link flow has weaknesses.

3. **Dead reconnect code with weak UID path**: `rejoinRoom` is disabled but the dead code contains `} else if (data.uid) { reconnectKey = 'uid:${data.uid}' }` at `main.js:1761-1764` — no signature check for UID-based rejoin, just matching a client-supplied string against `pendingReconnects`. If reconnect is ever re-enabled without removing this branch, UID spoofing enables match slot stealing.

## Questions for Other Focus Areas

1. **For API-03**: Is `client.roomId` settable by any event other than `joinRoom` / `createRoom` / `createAIMatch` / `joinQueue`? If so, the per-room isolation guarantee breaks.
2. **For ERR-02**: Could concurrent `fireGroupShot` events for the same `matchId` from two different sockets (both with valid tgIds for different players) cause a double-fire if `lifecycle.handleShot`'s turn check has a TOCTOU window?
3. **For INJ-05**: The `clientDebugLog` handler (`main.js:1356`) accepts `payload.label` and `payload.data` with `JSON.stringify`. Is there any path where this data reaches a template or query?

## Raw Notes

- `rooms` Map key is `roomId` (hex string from CSPRNG). Room membership is `room.players[].socketId`.
- `matchStates` keyed by `roomId`. Player identity in match state is `socketId`.
- `wagerStates[roomId].wallets[socketId]` → walletAddress (server-verified, not client-supplied).
- Group-chat: `GroupMatch.players[].telegramUserId` is the canonical identity field.
- `requireAdminKey` fails closed if `ADMIN_API_KEY` env is not set (returns 401). Good default.
- `telegramSocketMiddleware` proceeds on invalid initData — correct behavior for non-TG clients.
- `getShotInfo` has no auth guard but returns `balance: 0` if no wallet — acceptable read-only.
- `getWeaponArray` has no auth guard but returns room's `randomArray` — read-only, low risk.
- `getRooms` has no auth guard — returns open room list to any caller — acceptable for matchmaking.
- `leaveQueue` has no auth — can remove any socket from queue, but only its own `client.id` — acceptable.
- Authz coverage: ~91% of all events and HTTP routes have appropriate authorization for their risk level.
