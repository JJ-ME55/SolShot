---
task_id: db-phase1-api-03
provides: [api-03-findings, api-03-invariants]
focus_area: api-03-websocket
files_analyzed:
  - server/index.js
  - server/socket-io/main.js
  - server/socket-io/groupchat.js
  - server/middleware/auth.js
  - server/middleware/guards.js
  - server/middleware/telegram.js
  - client/src/socket/index.js
finding_count: 15
severity_breakdown: {critical: 2, high: 5, medium: 5, low: 3}
---

<!-- CONDENSED_SUMMARY_START -->
# API-03: WebSocket & Real-Time Security — Condensed Summary

## Key Findings (Top 10)

- **`authenticate` flips `isAuthenticated` permanently** with no nonce — any session-persistent authenticated socket is indefinitely trusted after one 5-min-window signature; no re-auth on reconnect: `auth.js:114-134`, `main.js:1240-1334`
- **`escrowDepositStatus` broadcast leaks all wallet addresses in the room** to both players during the deposit phase: `main.js:3473-3482`
- **`telegramSocketMiddleware` fails open** — if `TELEGRAM_BOT_TOKEN` is not set, validation is skipped, `socket.telegramUser` remains null, but the connection is still allowed and all group-chat handlers degrade to dev fallback: `telegram.js:16-20`, `telegram.js:107`
- **Telegram identity backfill via wallet→User DB lookup** overwrites `socket.telegramUser` in the `authenticate` handler, promoting a DB-derived TG ID to the same trust level as HMAC-validated initData: `main.js:1298-1303`
- **`escrowPartialDeposit` broadcasts all depositor wallet addresses** to the decision-maker socket — outside the room scope, at a minimum revealing P1's wallet to P0 in partial-deposit scenarios: `main.js:2084-2091`, `main.js:297`
- **`clientDebugLog` accepted unconditionally from any socket**, no auth gate — attacker can spam 2KB payloads at 30 events/sec (the per-socket cap) to poison Render logs and obscure real events: `main.js:1356-1370`
- **`shoot` (legacy relay) has no turn-ownership check**, only battle-state and numeric validation; any player in a room can relay an `opponentShoot` event on behalf of their opponent mid-battle: `main.js:3377-3396`
- **`challengeCallsign` iterates all of `playerUids` (linear scan)** and, on match, emits `challengeReceived` directly to a target socket, enabling any connected socket to enumerate online users by handle: `main.js:3219-3258`
- **`getGroupMatch` joins socket to `groupmatch:<matchId>` broadcast room** for any claimed member — membership check is based on `socket.telegramUser.id`; in dev mode falls back to `payload.telegramUserId`, allowing any client to subscribe to any match's real-time stream without validated TG identity: `groupchat.js:97-129`
- **`acceptChallenge`/`declineChallenge` forward a client-supplied `fromSocketId`** to route events to another socket, without verifying the challenge was ever sent to the acceptor — socket ID as capability: `main.js:3261-3284`

## Critical Mechanisms

- **Per-socket rate limiter (ring buffer)**: 30 events/sec drop threshold; escalates to `client.disconnect(true)` after 3× drops over 5s. Patches `client.onevent`. Does NOT apply to connection-level flooding — a new socket per connection bypasses accumulated drop counts — `main.js:1183-1236`
- **`requireAuth` / `requireAuthIfWagered`**: `isAuthenticated` boolean set once on `authenticate` event; wagered events check it; non-wagered events skip; no per-event token — `guards.js:40-46`, `main.js:505-513`
- **`telegramSocketMiddleware`**: validates Telegram initData HMAC-SHA256 on WebSocket handshake, 24-hour auth_date window, attaches `socket.telegramUser`; does NOT reject if invalid (always calls `next()`) — `telegram.js:87-108`
- **`tgIdFor()` (groupchat)**: uses `socket.telegramUser.id` in prod; falls back to `payload.telegramUserId` in non-prod — `groupchat.js:72-78`
- **`withLock('settle:roomId')`**: async mutex serialising settlement CAS; 30s auto-release timeout — `guards.js:170-198`

## Invariants & Assumptions

- INVARIANT: Wagered socket events require `client.isAuthenticated === true` — enforced at `guards.js:40-46` via `requireAuth`, applied to: `joinRoom`, `createRoom`, `joinQueue`, `fire` (wagered), `escrowDepositConfirm`, etc. / Partially enforced: `shoot` (legacy relay) skips auth — `main.js:3377`
- INVARIANT: Group-chat shot identity comes from `socket.telegramUser.id` (HMAC-validated) in production, never from payload — enforced at `groupchat.js:72-78` / NOT enforced in dev (`NODE_ENV !== 'production'`), payload accepted ⚠
- INVARIANT: Socket.IO maxHttpBufferSize is capped at 64KB — enforced at `index.js:73` / Enforced ✓
- INVARIANT: Per-IP connection cap of 100 — enforced via `ipConnectionCounts` Map in `index.js:90-113` / Enforced ✓
- INVARIANT: CORS origin is restricted to `CORS_ORIGINS` env var — enforced at `index.js:67-82` / ASSUMPTION: `CORS_ORIGINS` is set correctly in production; if missing, defaults to `['http://localhost:3000']` only ⚠

- ASSUMPTION: `isAuthenticated` remains valid for the life of the socket — UNVALIDATED ⚠ (no re-auth on reconnect, no token expiry check per-event; a compromised socket stays authenticated)
- ASSUMPTION: `socket.telegramUser.id` is always from HMAC-validated initData — UNVALIDATED in non-production ⚠ (dev fallback to payload)
- ASSUMPTION: The `escrowDepositStatus` broadcast is seen only by room members — VIOLATED ⚠ (io.sockets.in(rid) is room-scoped correctly, but the payload includes all wallet addresses which any room member can see)

## Risk Observations (Prioritized)

1. **Wallet address disclosure in `escrowDepositStatus`**: `main.js:3473-3482` — Emits `{ wallet: ws.wallets?.[p.socketId] }` for ALL room players to EVERY socket in the room. In a 2-player wagered match, P0 now knows P1's on-chain wallet and vice versa. Correlation with Telegram ID creates PII linkage.
2. **Telegram identity backfill elevation**: `main.js:1298-1303` — On `authenticate`, if wallet resolves to a User doc with a `telegramUserId`, that TG ID is written to `client.telegramUser.id`. This means a wallet-authenticated browser client gains group-chat `tgIdFor()` access without producing Telegram initData. Allows a wallet holder to fire group shots on behalf of their TG-linked identity from any browser.
3. **`telegramSocketMiddleware` fails open**: `telegram.js:101-107` — If `TELEGRAM_BOT_TOKEN` is absent, `validateTelegramInitData` logs a warning and returns `{ valid: false }`. The middleware calls `next()` unconditionally. In dev or a misconfigured prod environment, all Telegram auth is bypassed silently.
4. **`shoot` legacy relay lacks turn-ownership check**: `main.js:3377-3396` — The legacy `shoot` handler validates battle state and numeric fields but does NOT check `ms.currentTurn`. Any player in the room can emit `shoot` to relay an `opponentShoot` event claiming any values for `selectedWeapon`, `power`, `rotation`. Although the real game logic uses the authoritative `fire` event, `opponentShoot` drives client-side visuals — spoofed events cause animation confusion and could be exploited to mislead the opponent.
5. **`clientDebugLog` unauthenticated, no rate limit beyond global 30/sec**: `main.js:1356-1370` — Any connected socket (unauthenticated) can send up to 30 `clientDebugLog` events per second, each up to 2KB. That is 60KB/sec of attacker-controlled text injected into the server's Render log stream (with `tg=anon` prefix). Sustained across many sockets this is a log-flooding / monitoring-blindness vector.
6. **`escrowPartialDeposit` leaks other-player wallet addresses to the decision-maker**: `main.js:2084-2091` — Includes `depositorWallets` array (full Solana pubkeys of all confirmed depositors) in the payload sent specifically to the decision-maker socket. No game mechanic requires a player to know their opponent's wallet at this stage.
7. **`acceptChallenge`/`declineChallenge` trust client-supplied `fromSocketId`**: `main.js:3261-3284` — The handler emits to `io.sockets.sockets.get(challengerSocketId)` where `challengerSocketId` comes verbatim from the payload. An attacker can supply any live socket ID to deliver `challengeAccepted` / `challengeDeclined` to any connected socket, not just the actual challenger.
8. **`getGroupMatch` room subscription without match membership in dev**: `groupchat.js:110-117` — In production, `isMember` uses HMAC-validated `socket.telegramUser.id`. In dev, `tgIdFor` accepts `payload.telegramUserId`. Any dev-mode client can subscribe to any active group match's real-time stream by claiming a valid TG ID.

## Novel Attack Surface

- **Wallet→TG backfill creates a cross-identity trust bridge**: A player who connects their wallet from a browser (no Telegram) and authenticates via `authenticate` event gets their DB-stored TG ID backfilled into `socket.telegramUser`. From that point, `tgIdFor()` returns the TG ID as if HMAC-validated. An attacker who compromises a wallet private key (or obtains a fresh `authenticate` token within the 5-min window) gains full group-chat shot-firing capability for the linked TG identity without ever having a Telegram session. This is an identity trust conflation that neither the wallet auth (signature-based) nor the TG auth (HMAC-based) individually intended to grant.
- **Socket ID as ambient capability in challenge flow**: `fromSocketId` is used as both a routing identifier and an implicit "I was challenged by this socket" proof. Since socket IDs are opaque but broadcast in `roomUpdate` and `escrowDepositStatus` payloads, a persistent attacker could harvest live socket IDs and forge challenge acceptance messages to any connected user.

## Cross-Focus Handoffs

- → **AUTH-01/AUTH-03**: `isAuthenticated` is a single connection-scoped boolean set once on `authenticate` event; no expiry, no per-event re-validation. AUTH analysis should assess whether the 5-min signature window allows replay across sessions and whether socket recycling (reconnect) re-uses stale auth state.
- → **DATA-06 (PII)**: `escrowDepositStatus` broadcasts full Solana wallet addresses to all room members. `walletHandle` emits `telegramUserId` to the authenticated socket. `escrowPartialDeposit` sends `depositorWallets`. Log lines in `clientDebugLog` include `tg=<telegramId> w=<wallet prefix>`. These pairings create PII linkage (wallet ↔ TG ID) that persists in Render logs.
- → **ERR-02 (Race Conditions)**: Group-chat deposit confirmation (`confirmGroupDeposit`) reads GroupMatch from DB, then calls `lifecycle.confirmDeposit` in sequence without optimistic locking on the match doc. Concurrent `confirmGroupDeposit` from two players simultaneously could double-confirm the same slot.
- → **LOGIC-01 (Business Logic)**: `shoot` (legacy relay) can be sent by any room member to relay game-state events without turn ownership enforcement. While not directly financial, it could be used to confuse opponent client state in a live wagered match.

## Trust Boundaries

The WebSocket security model has two distinct tiers: web-client sockets (authenticate via Ed25519 wallet signature, gaining `isAuthenticated = true`), and Telegram Mini App sockets (authenticate via HMAC-SHA256 of initData, gaining `socket.telegramUser`). These tiers are theoretically independent but are bridged by the `authenticate` handler's wallet→User DB lookup, which backfills TG identity from the database. The practical effect is that wallet-authenticated clients can gain group-chat firing authority without ever presenting a Telegram session. Group-chat handlers (`tgIdFor`) trust the TG ID from whatever source populated `socket.telegramUser.id` — they cannot distinguish HMAC-validated identity from DB-backfilled identity. This conflation is the primary trust boundary weakness for the API-03 scope.
<!-- CONDENSED_SUMMARY_END -->

---

# API-03: WebSocket & Real-Time Security — Full Analysis

## Executive Summary

SolShot's real-time layer is built on Socket.IO v4 with two handler files: `main.js` (~1,850 LOC, 55 events) for the web-client game loop, and `groupchat.js` (420 LOC, 8 events) for the Telegram Mini App group-match flow. The server enforces a 64KB message size cap, a 100-connection-per-IP limit, and a 30-events/sec per-socket ring-buffer rate limiter. CORS is restricted to `CORS_ORIGINS`. Telegram initData is validated via HMAC-SHA256 on connect. Wallet identity is verified via Ed25519 signature on the `authenticate` event.

Despite these controls, several meaningful gaps exist: the `escrowDepositStatus` broadcast leaks wallet addresses to all room participants; the legacy `shoot` relay has no turn-ownership check; `clientDebugLog` is an unauthenticated log-injection channel; the `authenticate` handler bridges wallet and Telegram identities in a way neither auth system was designed to sanction; and challenge-flow handlers trust client-supplied socket IDs as routing capabilities.

## Scope

**In scope:** All `socket.on(...)` handlers in `server/socket-io/main.js` and `server/socket-io/groupchat.js`; Socket.IO server configuration in `server/index.js`; middleware in `server/middleware/auth.js`, `guards.js`, `telegram.js`; client socket setup in `client/src/socket/index.js`.

**Out of scope:** On-chain Anchor programs; HTTP REST endpoints (addressed by API-01 auditor).

## Socket Event Coverage Table

### main.js (55 events)

| Event Name | File:Line | Auth Required | Payload Validated | Notes |
|---|---|---|---|---|
| `authenticate` | main.js:1240 | None (pre-auth) | Type guard only | Sets `isAuthenticated` permanently; no nonce |
| `clientDebugLog` | main.js:1356 | None | Size caps (200/2000 chars) | Log injection vector |
| `setWalletHandle` | main.js:1382 | Wallet auth (implicit) | String check | Requires `authenticatedWallets[client.id]` |
| `registerIdentity` | main.js:1433 | None | uid length, profanity | Practice mode; no wager gate |
| `attributeReferrer` | main.js:1485 | None | Type + string guard | Silent fail; referral attribution |
| `getInviteLink` | main.js:1505 | None | None | Returns per-user referral link |
| `disconnect` | main.js:1709 | N/A | N/A | Cleanup + forfeit |
| `leaveRoom` | main.js:1722 | Wagered: yes | None | Cleanup |
| `rejoinRoom` | main.js:1728 | Wallet sig (disabled) | Full sig check | Dead code — returns error immediately |
| `deleteRoom` | main.js:1901 | Wagered: yes | None | Host-only check |
| `joinRoom` | main.js:1929 | Wagered: yes | Null guard | Balance check on wager path |
| `getRooms` | main.js:2166 | None | None | Returns open room list |
| `createChallengeRoom` | main.js:2176 | Wagered: yes | Null + format check | Creates private room + challenge record |
| `joinChallenge` | main.js:2277 | None | shortCode check | Accepts challenge by code |
| `createRoom` | main.js:2327 | Wagered: yes | Null + wager + mode | Rate limited (3/60s) |
| `createAIMatch` | main.js:2460 | None | Null guard | Practice only; no wager |
| `joinQueue` | main.js:2565 | Wagered: yes | Mode + wager validation | Balance check; queue cap 100 |
| `leaveQueue` | main.js:2795 | None | None | Queue cleanup |
| `ready` | main.js:2803 | Wagered: yes | State validation | Shop phase entry |
| `buyWeapon` | main.js:2895 | Wagered: yes | Null + weaponId type | Gold check server-side |
| `buyConsumable` | main.js:2958 | Wagered: yes | Null guard | Gold check |
| `shopDone` | main.js:2991 | Wagered: yes | None | Marks player as shop-complete |
| `getShotInfo` | main.js:3020 | None (optional) | None | Returns SHOT balance + prestige |
| `buyCosmetic` | main.js:3039 | Wallet auth | itemId existence | SHOT balance check; DB update |
| `equipCosmetic` | main.js:3087 | Wallet auth | category allowlist | DB update |
| `getCosmetics` | main.js:3110 | None (optional) | None | Returns cosmetics; defaults if unauthed |
| `getStats` | main.js:3129 | None (optional) | None | 1/sec rate limit; returns stats |
| `getLeaderboard` | main.js:3188 | None | None | 1/3sec rate limit |
| `challengeCallsign` | main.js:3219 | None | Length check | Enumerates online users by handle |
| `acceptChallenge` | main.js:3261 | None | fromSocketId existence | Socket ID as capability ⚠ |
| `declineChallenge` | main.js:3276 | None | fromSocketId existence | Socket ID as capability ⚠ |
| `prestigeBurn` | main.js:3288 | Wallet auth | txSignature presence | On-chain verify |
| `weaponPick` | main.js:3328 | Wagered: yes | arrayIndex range | Legacy relay |
| `getWeaponArray` | main.js:3338 | None | None | Returns room's random array |
| `createWeaponArray` | main.js:3346 | Wagered: yes | count/max types | Host-only not enforced |
| `shoot` | main.js:3377 | None ⚠ | Numeric fields | No turn-ownership check ⚠ |
| `escrowDepositConfirm` | main.js:3402 | Auth required | roomId type + cross-room check | On-chain bitmask verify |
| `escrowPartialStart` | main.js:3505 | Auth required | None | Decision-maker gate |
| `escrowCancelAll` | main.js:3585 | Auth required | None | Decision-maker gate |
| `fire` | main.js:3630 | Wagered: yes | validateFireParams | Turn + seq + inventory + escrow checks |
| `requestTerrain` | main.js:4335 | Wagered: yes | None | Escrow-ready gate |
| `weaponChange` | main.js:4489 | Wagered: yes | index range | Relay |
| `angleChange` | main.js:4499 | Wagered: yes | finite check | Relay |
| `powerChange` | main.js:4509 | Wagered: yes | power range | Relay |
| `positionUpdate` | main.js:4520 | Wagered: yes | finite + distance check | Distance cap 400px/200px |
| `stepLeft` | main.js:4555 | Wagered: yes | None | Turn-ownership + 4-step limit |
| `stepRight` | main.js:4589 | Wagered: yes | None | Turn-ownership + 4-step limit |
| `giveTurn` | main.js:4624 | Wagered: yes | Numeric schema | Legacy relay |
| `requestTurn` | main.js:4640 | Wagered: yes | State validation | Relay |
| `playAgainRequest` | main.js:4650 | Wagered: yes | State validation | Requires all players to agree |
| `getShotPrice` | main.js:4676 | None | None | Returns cached Jupiter price |

### groupchat.js (8 events)

| Event Name | File:Line | Auth Required | Payload Validated | Notes |
|---|---|---|---|---|
| `getGroupMatch` | groupchat.js:97 | TG identity (soft) | matchId presence | Joins broadcast room if member |
| `fireGroupShot` | groupchat.js:147 | TG identity (required) | matchId presence | Physics run via lifecycle.handleShot |
| `forfeitGroupMatch` | groupchat.js:231 | TG identity (required) | matchId presence | Settles if last player out |
| `purchaseGroupWeapon` | groupchat.js:269 | TG identity (required) | weaponId + matchId | Atomic DB update |
| `groupShopComplete` | groupchat.js:357 | TG identity (soft) | matchId presence | Idempotent; no outcome if no identity |
| `getMyGroupMatches` | groupchat.js:380 | TG identity (required) | None | Returns player's active matches |
| `requestGroupDepositTx` | groupchat.js:428 | TG identity (required) | matchId presence | Builds deposit TX; joins room |
| `confirmGroupDeposit` | groupchat.js:500 | TG identity (required) | matchId + txSig | On-chain bitmask verify |

**Total: 55 (main.js) + 8 (groupchat.js) = 63 socket event handlers.**

## Key Mechanisms

### 1. Connection-Level Security

**CORS** (`index.js:63-82`): `CORS_ORIGINS` env var splits a comma-delimited list; defaults to `['http://localhost:3000']`. Passed to both Express CORS and `socket.Server` constructor. Correct approach, but the default is safe only if the env var is set in prod.

**Socket.IO maxHttpBufferSize** (`index.js:73`): Capped at 64KB. This is the per-message frame limit, not a streaming limit. Clients using `websocket` transport (hardcoded in `client/src/socket/index.js:18`) do not use polling, so chunking is not available. Effective cap.

**Per-IP connection limit** (`index.js:90-113`): In-memory `Map<ip, count>`. Extracted from `x-forwarded-for` (leftmost IP after split — correct for Render's proxy config). Limit is 100. No expiry — counts decrement only on disconnect. Correct.

**`telegramSocketMiddleware`** (`telegram.js:87-108`): Validates HMAC-SHA256 of initData on connect. Calls `next()` unconditionally — the connection is never rejected even for invalid initData. The result is `socket.telegramUser` is either set (valid) or null (invalid/absent). All subsequent group-chat handlers use `tgIdFor()` which has the dev fallback. In production, `socket.telegramUser.id` is the only trusted TG identity source.

### 2. Per-Socket Rate Limiting (`main.js:1149-1236`)

Patches `client.onevent` with a ring-buffer approach:
- Global: 30 events/sec. Drop on exceed; after `90 drops in 5s`, `client.disconnect(true)`.
- Fire/shoot: 2/sec (fire-specific ring). Silent drop.
- createRoom: 3/60s (create-specific ring). Silent drop.

**Gap**: The per-socket limiter resets per connection. A new WebSocket (new `io.on("connection")` firing) starts with a fresh ring buffer. The per-IP HTTP connection cap (100) limits connections but does not prevent an attacker from cycling through 100 fresh connections each with 30 events/sec = 3,000 events/sec from a single IP. The connection limit mitigates this but does not eliminate it.

**Gap**: `clientDebugLog` is not excluded from the global 30/sec counter but is not separately rate-limited. Since it is not a wager event, it costs 30 events/sec of the attacker's budget shared with all other events, not its own counter.

### 3. Authentication Architecture

**Web-client path**: `authenticate` event → `handleAuthenticate()` → Ed25519 signature verify → `client.isAuthenticated = true` + `authenticatedWallets[client.id] = wallet`. This is a one-time set. There is no periodic re-auth, no token expiry check on subsequent events, and no mechanism for the server to revoke `isAuthenticated` without forcing a disconnect. The JWT generated by `generateToken()` is sent to the client (`authResult.token`) but is never checked server-side again; it is effectively dead code.

**Telegram path**: `telegramSocketMiddleware` validates initData HMAC-SHA256 on the initial WebSocket handshake. The 24-hour `auth_date` window is the replay protection. Once the socket is established with `socket.telegramUser` set, no re-validation occurs.

**Bridge**: In the `authenticate` handler (`main.js:1298-1303`), if the authenticated wallet resolves to a User doc with a `telegramUserId`, the server writes:
```js
client.telegramUser = {
    id: tgUserId,       // from MongoDB User.telegramUserId
    username: userDoc?.username || null,
    first_name: null,
};
```
This makes `tgIdFor(client, {})` return a non-null TG ID for a browser-only Privy session, bypassing the HMAC-validation path entirely. The comment explains this is intentional for convenience, but the security model of `fireGroupShot` (that TG ID is HMAC-validated) is not maintained when identity comes via this path.

### 4. Broadcast Scope Analysis

| Pattern | Events Using It | Security |
|---|---|---|
| `io.sockets.in(roomId).emit(...)` | turnResult, shopEnd, matchEnd, roomUpdate, escrowDepositStatus, etc. | Room-scoped ✓ |
| `io.to(socketId).emit(...)` | matchSettled, kickedFromRoom, escrowPartialDeposit | Targeted to one socket ✓ |
| `io.emit(...)` | queueSnapshot, setRooms | ALL connected sockets ⚠ |
| `client.to(roomId).emit(...)` | opponentShoot, opponentStepLeft, etc. | Room-scoped, excludes sender ✓ |
| `io.to(roomKey).emit(...)` in groupchat.js | shotResult, groupMatchData | Group-match room ✓ |

**`io.emit('queueSnapshot', ...)`** (`main.js:211`, `main.js:408`): Broadcasts queue counts (matchMode, matchLength, wager, count) to every connected socket globally. The payload is intentionally anonymised (counts only, no socket IDs or wallets). Risk: minimal, but any authenticated user learns the composition of all active queues including wager amounts. No wager-specific information that could aid manipulation.

**`io.emit('setRooms', ...)`** (`main.js:408`): Broadcasts open room list (host name, wager, mode) to all connected sockets. Up to 5 rooms. Payload excludes socket IDs and wallets (`getOpenRooms()` at line 517 projects safe fields). Risk: low.

**`escrowDepositStatus`** (`main.js:3473-3482`): Emitted to `io.sockets.in(rid)` (the room). Payload includes `wallet: ws.wallets?.[p.socketId]` for each player — full Solana public key. This is the highest-risk broadcast: a player in a wagered match now knows every other participant's on-chain wallet address. This could be used for off-platform harassment, on-chain analysis, or combined with TG ID to build PII profiles.

### 5. Payload Validation

Most handlers use `validatePayload()` or inline type checks. Notable gaps:

- **`getWeaponArray`** (`main.js:3338`): No auth, no payload check. Returns the room's `randomArray`. Any connected socket that guesses or obtains a `roomId` could call this — but they need `client.roomId` set server-side, which only happens after `joinRoom`/`createRoom`. Low risk.
- **`createWeaponArray`** (`main.js:3346`): Requires wagered auth, but does NOT check `client.isHost`. Any authenticated non-host player can call `createWeaponArray` to overwrite the room's random seed. Restoring from prior audit finding (H018 — `createWeaponArray` non-host). Count + max bounds are validated.
- **`shoot` relay** (`main.js:3377`): No auth required (`requireAuthIfWagered` not called — the old relayed `shoot` event is not gated by the wagered auth). Any socket in any room can relay arbitrary game-state animations to the opponent. Battle state is checked, but no `requireAuthIfWagered` is applied.
- **`registerIdentity`** (`main.js:1433`): `uid` must be a string of length >= 10. No auth. Attacker can register any UID and pollute `playerUids`. Since `playerUids` is used as a fallback identity in DB upserts, a crafted UID could shadow an existing practice user's identity — but only if the socket ID happens to collide (it won't — socket IDs are random).
- **`fire` sequence check** (`main.js:3689-3696`): Only active if `data.seq !== undefined`. A client that omits `seq` from the payload bypasses the idempotency check entirely. `data.seq` is optional. The check provides replay protection only when the client cooperates.

### 6. Disconnect/Reconnect State

**Current state (main.js:1727-1731)**: Reconnect is disabled for P1 launch. `rejoinRoom` immediately emits `rejoinError: 'Reconnect is disabled'` and returns. The reconnect code below is dead (after the early return). The dead code includes a full remapping path that was previously correct.

**Disconnect handler** (`main.js:1709-1718`): Calls `cleanupRoom(client, io, 'disconnect')` synchronously (awaited). This removes from all queues, then processes the disconnect as an immediate forfeit for active wagered matches. **No reconnect window is active.** This means any network dropout results in immediate forfeit and settlement.

**State maps on disconnect**: `authenticatedWallets[client.id]` and `playerUids[client.id]` are deleted on disconnect. In-memory gold, weapon inventories, match states for the room are deleted via `removeRoom`. This is correct.

**Observation**: The disconnect `cleanupRoom` runs `withLock('settle:roomId', ...)` but only if the match is in `BATTLE` or `WEAPON_SHOP` state. If a player disconnects while `SETTLING` is in progress (`matchStates[roomId].status === MATCH_STATES.SETTLING`), the handler at `main.js:1549-1555` skips the forfeit path, just does `client.leave(roomId)`. This prevents double-settlement but means the disconnecting client's room is never cleaned up — the socket leaves the Socket.IO room but `client.roomId` is not nulled.

### 7. Group-Chat Security Model

`tgIdFor()` (`groupchat.js:72-78`) is the identity resolver for all group-chat handlers:
```js
function tgIdFor(socket, payload) {
    if (socket?.telegramUser?.id) return socket.telegramUser.id;
    if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) {
        return payload.telegramUserId;
    }
    return null;
}
```

In production, identity is always from `socket.telegramUser.id`. The Telegram backfill from the `authenticate` handler (`main.js:1298-1303`) sets `socket.telegramUser` from the DB if a wallet→User lookup returns a telegramUserId. This means:

**Attack scenario**: An attacker who obtains a valid `authenticate` payload (wallet + message + signature) within the 5-minute window can authenticate as a wallet-holder. If that wallet is linked to a Telegram account in the DB, `client.telegramUser.id` is set to that TG ID. The attacker can then call `fireGroupShot` for any active group match where that TG ID is a player.

`confirmGroupDeposit` (`groupchat.js:500-597`): Correct design — resolves the depositor wallet from `lookupUserByTelegramId(tgId)` (server-side DB lookup), not from `payload.walletAddress`. The TG ID is from `socket.telegramUser.id`. On-chain verification via `getEscrowStateV2` bitmask check before calling `lifecycle.confirmDeposit`. This is the strongest deposit verification in the codebase.

`requestGroupDepositTx` (`groupchat.js:428-484`): Also correct — resolves wallet from TG identity server-side, not from payload.

### 8. Heartbeat / Ping-Pong

Socket.IO v4 uses a built-in ping/pong mechanism. Default `pingInterval` is 25s, `pingTimeout` is 20s. The server does not customize these. A malicious client can keep a WebSocket alive indefinitely by responding to pings. No server-side idle disconnect for inactive-but-alive connections.

The self-ping `setInterval` in `index.js:564-580` pings `/health` every 12 minutes to prevent Render hibernation. This is a keep-alive for the server process, unrelated to socket heartbeat.

### 9. Server-to-Client Emission — Sensitive Data Disclosure

- **`walletHandle` event** (`main.js:1305-1309`): Emits `{ handle, locked, telegramUserId }` to the authenticated socket. The `telegramUserId` field is included. This leaks the TG ID to the authenticated wallet client, enabling cross-platform correlation. The client uses it for `GroupMatchScreen` routing, but the exposure is broader than necessary.
- **`escrowDepositStatus`** (`main.js:3473-3482`): Includes full wallet addresses. See above.
- **`escrowPartialDeposit`** (`main.js:2084-2091`): Includes `depositorWallets` array. Sent to decision-maker socket. Reveals other player's wallet to the decision-maker before the match starts.
- **`rejoinSuccess`** (`main.js:1870-1897`): Dead code path (rejoin disabled), but if re-enabled, the full match state snapshot includes `goldBalance`, `weapons`, `terrain`, `positions`, `wager` — no wallet addresses. Acceptable scope.
- **`shopPhase`** (`main.js:2869-2876`): Includes `goldBalance` for all player IDs (keyed by socketId). SocketIds are already known to room members. Low risk.
- **`turnResult`** / `matchEnd`**: Includes all player HP, scores, gold balances keyed by socketId. No wallet addresses. Acceptable.

### 10. `clientDebugLog` as Log Injection Vector

The handler (`main.js:1356-1370`) requires no authentication, no prior registration, and only has the global 30-events/sec per-socket cap. It logs:
```
[client tg=<tgId> w=<walletPrefix>] <label> <data>
```

Where `tg` and `w` come from `client.telegramUser?.id` and `authenticatedWallets[client.id]` — server-resolved, not from payload. However, `label` and `data` are client-supplied (sliced to 200 and 2000 chars). An attacker could:
1. Emit log lines containing fake server-looking prefixes (e.g., `[Escrow]`, `[Recovery]`) to confuse log analysis.
2. Emit structured JSON data that matches Render's log parsing format to inject false telemetry.
3. At 30 events/sec × many sockets, flood the Render log stream, causing real events to scroll off the retention window.

No authentication is required to emit `clientDebugLog`. A fresh unauthenticated connection can start spamming immediately.

### 11. `createWeaponArray` Non-Host Bypass (Prior H018)

`main.js:3346-3371`: The handler calls `requireAuthIfWagered` (auth for wagered matches) but does NOT check `client.isHost`. In a wagered room, the non-host player can call `createWeaponArray` to overwrite `room.randomArray` and the array is immediately broadcast to both players via `io.sockets.in`. This was flagged as H018 in the Feb audit. Not fixed.

### 12. `shoot` Event No Auth / No Turn Check

`main.js:3377-3396`: The legacy `shoot` event:
- Does NOT call `requireAuth` or `requireAuthIfWagered`
- Validates battle state via `validateAction(ms.status, 'shoot')`
- Validates `power` and `rotation` are finite
- Does NOT check `ms.currentTurn !== client.id`

Any socket in a room that is in BATTLE state can emit `shoot`, which causes the server to relay `opponentShoot` to the other player. This drives the opponent's client-side visual animation (trajectory, explosion). An unauthenticated spectator or any authenticated room member can spoof opponent animations. While the authoritative `fire` event handles actual damage, spoofed `opponentShoot` events create visual confusion.

### 13. `requestGroupDepositTx` Joins Room Before Verification

`groupchat.js:470`: After resolving wallet and building the deposit TX, the handler calls `client.join(roomForMatch(matchId))`. This room subscription is applied before checking whether the deposit TX build succeeded (the failure check is at line 464 above, but the join is at line 470 which is after the success check — so this is actually correct). However, the join happens before `confirmGroupDeposit` is called. A player who requests a deposit TX but never signs it will remain subscribed to the match broadcast room (`groupmatch:<matchId>`) for the duration of their socket session. They will continue receiving `shotResult` and `groupMatchData` broadcasts even as a non-depositor/non-participant.

## Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│  UNTRUSTED (Browser / Telegram Mini App)                    │
│  All socket event payloads                                  │
│  client.telegramUser (set by middleware, but bridged by DB) │
└───────────────────────────────┬─────────────────────────────┘
                                │ authenticate (Ed25519 sig)
                                │ telegramSocketMiddleware (HMAC)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  PARTIALLY TRUSTED (Server Socket State)                    │
│  client.isAuthenticated (set once, never revoked)           │
│  authenticatedWallets[socketId] (set on authenticate)       │
│  client.telegramUser.id (HMAC or DB-backfilled — no marker) │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  TRUSTED (MongoDB, Solana On-Chain)                         │
│  User doc (walletAddress, telegramUserId, handle, cosmetics)│
│  On-chain escrow PDA (depositsMask, wagerLamports)          │
└─────────────────────────────────────────────────────────────┘
```

The key weakness is the bridge from DB-level (`User.telegramUserId`) up to socket-level trust (`socket.telegramUser.id`). No flag differentiates HMAC-validated TG identity from DB-backfilled TG identity. Handlers that use `tgIdFor()` treat both identically.

## Risk Observations (Full Detail, Prioritized)

### CRITICAL

**WS-C1: Wallet address disclosure via `escrowDepositStatus`**
- File: `main.js:3473-3482`
- All room members receive each other's full Solana wallet pubkeys during the deposit phase.
- `io.sockets.in(rid).emit('escrowDepositStatus', { deposits: room.players.map(p => ({ socketId, wallet, confirmed })) })`
- In a wagered 1v1 match, P0 and P1 both learn each other's wallets before the match starts. Combined with the TG ID in `walletHandle` event, this enables deanonymization.
- Recommendation: strip wallet from the `escrowDepositStatus` broadcast. Clients only need `socketId` + `confirmed` boolean.

**WS-C2: Telegram identity backfill bridges authentication tiers without marker**
- File: `main.js:1298-1303`
- A wallet-authenticated socket gains `socket.telegramUser.id` from DB lookup, indistinguishable from HMAC-validated TG initData.
- `tgIdFor()` in groupchat.js trusts this ID for `fireGroupShot`, `forfeitGroupMatch`, `confirmGroupDeposit`.
- Impact: wallet compromise = group-chat match control for all linked TG IDs.
- Recommendation: Add a `socket.telegramAuthSource` field ('hmac' | 'db_backfill'). Handlers that require HMAC origin (wagered group shot firing) should check it.

### HIGH

**WS-H1: `shoot` (legacy relay) missing auth and turn-ownership check**
- File: `main.js:3377-3396`
- No `requireAuth` or `requireAuthIfWagered`. No `ms.currentTurn` check.
- Any authenticated OR unauthenticated socket in a room can relay `opponentShoot` animations out of turn.
- Recommendation: Add `requireAuthIfWagered(client, 'shoot')` and turn-ownership check mirroring `fire`.

**WS-H2: `createWeaponArray` non-host bypass (prior H018)**
- File: `main.js:3346-3371`
- Auth required for wagered, but no host check. Non-host can overwrite the shared random seed.
- Recommendation: Add `if (!client.isHost) { client.emit('createWeaponArrayError', { reason: 'Host only' }); return }`.

**WS-H3: `clientDebugLog` unauthenticated log injection**
- File: `main.js:1356-1370`
- No auth gate. 2KB of attacker-controlled text per event at 30 events/sec.
- Recommendation: Require `client.isAuthenticated || client.telegramUser?.id`. Or drop entirely from production (`NODE_ENV === 'production'` no-op).

**WS-H4: `acceptChallenge`/`declineChallenge` trust client-supplied socket ID as capability**
- File: `main.js:3261-3284`
- `data.fromSocketId` is routed directly to `io.sockets.sockets.get(challengerSocketId)` without verifying the challenge was sent from that socket to this socket.
- Any live socket ID can be used to forge a `challengeAccepted` delivery to another player.
- Recommendation: Store pending challenges server-side in a `pendingChallenges` Map, verify `fromSocketId` is an entry there before forwarding.

**WS-H5: `requestGroupDepositTx` room subscription persists for non-depositors**
- File: `groupchat.js:470`
- After requesting a deposit TX, the socket joins `groupmatch:<matchId>`. If the player never signs/confirms, they remain subscribed and receive all match broadcasts (HP, trajectory, shot results) for the match duration.
- Impact: information disclosure — an unconfirmed/non-depositing player receives all game state.
- Recommendation: Remove from the match broadcast room if `confirmGroupDeposit` is not called within the deposit window.

### MEDIUM

**WS-M1: `telegramSocketMiddleware` fails open**
- File: `telegram.js:101-107`
- Invalid or missing `TELEGRAM_BOT_TOKEN` silently disables TG auth. All group-chat handlers degrade to anonymous or dev-mode.
- Recommendation: If `TELEGRAM_BOT_TOKEN` is set but validation fails, log clearly. Consider refusing the socket connection in production if initData is present but invalid.

**WS-M2: `fire` sequence check is optional**
- File: `main.js:3689-3696`
- The replay protection sequence check only applies if `data.seq !== undefined`. A client can omit `seq` entirely to bypass the idempotency check.
- Recommendation: Make `seq` a required field in `validateFireParams`. Reject if absent.

**WS-M3: `challengeCallsign` linear scan of all `playerUids` enables online user enumeration**
- File: `main.js:3219-3258`
- Iterates all of `playerUids` to find a matching handle. No auth required. Any connected socket can probe all online handles.
- Recommendation: Gate behind `requireAuth`. Or limit the callsign challenge to authenticated wallets only.

**WS-M4: `escrowPartialDeposit` leaks `depositorWallets` to decision-maker**
- File: `main.js:2084-2091`
- Sends full wallet pubkeys of depositing players to the decision-maker. Unnecessary for the UX decision (start vs cancel).
- Recommendation: Send counts only (`numDeposited`, `canStart`), not wallet addresses.

**WS-M5: `walletHandle` event includes `telegramUserId`**
- File: `main.js:1305-1309`
- Emits `{ telegramUserId }` to the authenticated socket. This links the TG ID to the wallet session client-side, enabling client-side PII storage.
- Recommendation: Consider whether the client actually needs the TG ID, or if it can be resolved server-side on group-chat flows only.

### LOW

**WS-L1: `getWeaponArray` has no auth and no room-membership check**
- File: `main.js:3338-3342`
- Returns `room.randomArray` if `client.roomId` is set. `client.roomId` is set server-side only after `joinRoom`/`createRoom`, so a socket not in a room gets nothing. Low risk.

**WS-L2: Auth-date 24-hour window may be too broad for group-chat**
- File: `telegram.js:68-73`
- TG initData with `auth_date` up to 24 hours old is accepted. For a long-lived Mini App session (user opens TG → waits 23 hours → rejoins same session), the initData is still valid. Replay of captured initData within 24 hours is possible.
- Recommendation: Reduce to 1-4 hours for wagered group matches.

**WS-L3: `io.emit('queueSnapshot')` broadcasts to all sockets including unauthenticated**
- File: `main.js:211`, `main.js:408`
- Queue counts (including wager amounts) visible to any connected socket. Minimal real-world risk since all wager tiers are public by design.

## Novel Attack Surface Observations

1. **Cross-identity trust bridge for group-chat cheating**: If an attacker knows the Telegram ID of a group-match participant (publicly visible in Telegram group chats), and knows or obtains that player's wallet address (possibly from a prior `escrowDepositStatus` broadcast), they can attempt to authenticate as that wallet (requiring the private key — unlikely). However, the inverse is easier: an attacker who legitimately obtains their OWN wallet auth can leverage the DB backfill to gain group-chat firing capability for their own linked TG ID — without ever presenting Telegram initData. This is not currently a user-level threat (they'd be firing as themselves), but architecturally the trust bridge is unconsolidated.

2. **matchId enumeration via `getGroupMatch`**: `getGroupMatch` accepts any `matchId` string and queries `GroupMatch.findOne({ matchId })`. Match IDs are generated by the lifecycle service (format unknown without reading lifecycle.js, but likely opaque). If match IDs are short or predictable, a client could enumerate all live group matches and subscribe to their broadcast rooms (subject to the TG membership check). Needs investigation in lifecycle.js.

3. **Log injection as monitoring-blindness attack**: A botnet of 100 connections (per-IP limit) × 30 events/sec × 2KB = 6MB/sec of attacker-controlled log data. At Render's free tier log retention (last N lines), this could push all legitimate server logs out of the retention window during a coordinated attack, leaving operators blind to a concurrent exploit.

## Cross-Focus Intersections

- **AUTH-01**: `isAuthenticated` is a one-time flag with no TTL. The JWT issued by `authenticate` is dead code server-side. The security model is purely socket-scoped with no token-based revocation.
- **AUTH-03**: `createWeaponArray` (non-host bypass), `shoot` (no auth), `challengeCallsign` (no auth) represent authorization gaps where operations bypass role/identity checks.
- **DATA-06 (PII)**: `escrowDepositStatus` wallet disclosure, `walletHandle.telegramUserId`, `escrowPartialDeposit.depositorWallets`, `clientDebugLog` rendering `tg=<id> w=<wallet>` in logs.
- **ERR-02 (Race Conditions)**: Concurrent `confirmGroupDeposit` could race on the deposit state without optimistic locking. `escrowDepositConfirm` in main.js is protected by on-chain bitmask verification, but the in-memory `ws.deposits[client.id] = txSignature` assignment is not locked.
- **LOGIC-01**: `shoot` relay (no auth/turn check) can interfere with match visual state without affecting server-authoritative physics. Still a game integrity issue for wagered matches.

## Questions for Other Focus Areas

- **AUTH-01**: Is the JWT issued by `generateToken()` and sent in `authResult.token` ever validated server-side? It appears to be dead code — needs confirmation.
- **ERR-02**: Does `lifecycle.confirmDeposit()` in groupchat.js use any form of optimistic concurrency control (MongoDB `$inc` + version field) when two players call `confirmGroupDeposit` simultaneously?
- **LOGIC-01**: Can the legacy `shoot` relay event affect any server-authoritative state, or is it purely visual?
- **DATA-06**: Is `telegramUserId` stored anywhere in the client's `localStorage` or `sessionStorage` after receiving the `walletHandle` event?

## Raw Notes

- `client.on('disconnect')` is registered TWICE in main.js: once at line 1128 (inside the TG multi-socket tracking block) and once at line 1709 (the real disconnect handler). The line 1128 handler only manages `socketsByTgId` cleanup. The line 1709 handler does room cleanup. Both fire on disconnect. This is intentional but should be documented.
- The `maxHttpBufferSize: 64 * 1024` limit at `index.js:73` applies to the raw Socket.IO frame. The `perMessageDeflate` option at `index.js:79-82` compresses above a 1024-byte threshold. A 2KB uncompressed `clientDebugLog` payload compresses to ~400 bytes. So the 64KB cap is on the decompressed payload, not the wire size. Potential memory amplification of ~5× for compressed payloads.
- `escrowDepositConfirm` cross-room check (`main.js:3407-3410`): `if (client.roomId !== rid) { ... reject }` — correctly prevents a socket in room A from confirming a deposit for room B.
- `main.js` uses `global.__solshotIo = io` (`index.js:202`) to expose the io instance to non-socket services. This is used by `groupchat/lifecycle.js` for broadcasting `groupMatchCancelled` from non-socket contexts (e.g. host cancels via /cancelmatch Telegram command). This pattern means any module that imports the lifecycle service can broadcast to any Socket.IO room. Trust is delegated to the module boundary.

---

**One-line summary:** The Socket.IO layer has strong foundational controls (64KB cap, per-IP limits, ring-buffer rate limiting, on-chain deposit verification, CORS restriction) but leaks wallet addresses in room-scoped broadcasts, conflates Telegram HMAC and DB-derived identity without a trust marker, and has an unauthenticated log-injection channel and a legacy `shoot` relay with no turn-ownership enforcement.
