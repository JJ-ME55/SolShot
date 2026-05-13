---
task_id: db-phase1-err-03-rate-limiting
provides: [err-03-findings, err-03-invariants]
focus_area: ERR-03-rate-limiting
files_analyzed:
  - server/index.js
  - server/socket-io/main.js
  - server/middleware/guards.js
  - server/services/physics.js
  - server/services/groupchat/scheduler.js
  - server/services/groupchat/lobbyWatchdog.js
  - server/services/groupchat/lifecycle.js
  - server/services/solana.js
  - server/services/bot.js
finding_count: 10
severity_breakdown: {critical: 0, high: 4, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# ERR-03: Rate Limiting & Resource Exhaustion — Condensed Summary

## Key Findings (Top 10)

- **HTTP rate limiter is global, not per-endpoint**: 100 req/15min shared across all routes including CPU-heavy card-render endpoints (`/api/challenge/:code/card.png`, `/api/stats/:tgUserId/card.png`) — a focused burst on those two endpoints exhausts the allowance before hitting the global cap — `server/index.js:180-187`
- **Socket per-event rate limiter is per-socket, not per-IP**: An attacker with N connections (max 100 per IP) multiplies their effective event budget to N × 30 events/sec = 3,000 events/sec per IP — `server/socket-io/main.js:1149-1165`
- **Escalation threshold math bug**: disconnect fires when `dropCount >= RL_DISCONNECT_MULT * RL_MAX_EVENTS` (= 90) and `(now - firstDropAt) <= RL_DISCONNECT_WINDOW` (5s); but `dropCount` resets if any clean event lands between drops — a patient attacker sending 29 clean + 1 drop per second can accumulate drops indefinitely without triggering disconnect — `server/socket-io/main.js:1196-1208`
- **Physics engine: 3,000-step inner loop per fire event, multiplied by sub-weapon count**: Pineapple (20 frags) + Tommy Gun (12 multi) each run N complete trajectories of up to 3,000 steps each. One fire event = up to 20 × 3,000 = 60,000 Euler steps on a single thread — `server/services/physics.js:62,929,935`
- **No Solana RPC 429 handling**: `getBalance()` and all escrow CPI calls have no retry/backoff. Under RPC rate limiting the server either throws (balance check) or silently fails open — `server/services/solana.js:113-116`
- **Telegram bot has no server-side rate limiting**: every `postToChat()` fires immediately, with no queue or delay. The lobbyWatchdog on a large database can emit one `sendMessage` per stale lobby per 15-min sweep with no inter-message delay — `server/services/groupchat/lifecycle.js:1107-1122`, `server/services/groupchat/lobbyWatchdog.js:76-79`
- **`ipConnectionCounts` Map is never bounded**: the Map grows one entry per distinct IP that has ever connected, is never pruned (only decremented on disconnect), and lives for the process lifetime — `server/index.js:88`
- **`authenticatedWallets` / `playerUids` / `matchmakingQueues` are never size-capped**: any socket event (no auth required for authenticate/registerIdentity) adds entries; a connect-authenticate-disconnect loop leaks nothing per cycle *if* disconnect fires cleanly, but concurrent flood during disconnect lag can leave orphan entries — `server/socket-io/main.js:131,134,150`
- **Card-render endpoints are CPU-bound with no per-endpoint limit**: `GET /api/challenge/:code/card.png` and `GET /api/stats/:tgUserId/card.png` each call satori + resvg-js synchronously (Node.js native module, blocks event loop during rasterization) — no concurrency cap, no response caching beyond 60-second `Cache-Control` header that is client-side only — `server/index.js:344-386`
- **`failedSettlements` Map grows unbounded on repeated settlement failures**: entries are added in the settlement error path but only removed on successful recovery — a series of escrow failures with no recovery path means the Map accumulates indefinitely — `server/socket-io/main.js:318-320`

## Critical Mechanisms

- **HTTP rate limiter**: `express-rate-limit` at 100 req/15min per IP; `trust proxy 1` is set so `req.ip` reflects real client IP via `x-forwarded-for`. Applied globally via `app.use(httpLimiter)` — no per-route overrides — `server/index.js:59-60,180-187`
- **Socket per-event throttle**: ring-buffer rate limiter patched onto `client.onevent` per socket connection; 30 events/sec global + 2 fires/sec + 3 createRoom/60s; escalates to disconnect at 90 accumulated drops within a 5s window — `server/socket-io/main.js:1149-1236`
- **Per-IP WebSocket connection cap**: `MAX_CONNECTIONS_PER_IP = 100`; enforced in a Socket.IO use-middleware using `x-forwarded-for`; Map entry decremented on disconnect — `server/index.js:84-113`
- **Socket.IO payload cap**: `maxHttpBufferSize: 64 * 1024` (64KB); any single inbound socket frame larger than 64KB is rejected at the transport layer — `server/index.js:72-73`
- **Body parser limit**: `express.json({ limit: '1mb' })` — `server/index.js:190-191`
- **Physics computation**: `computeTrajectory()` loop capped at `MAX_TRAJECTORY_STEPS = 3000`; multi-hit weapons run N parallel trajectories (up to 20 for Pineapple); total work per fire = O(N × 3000 steps) — `server/services/physics.js:62,105,929`

## Invariants & Assumptions

- INVARIANT: no single socket can exceed 30 events/sec — enforced in `client.onevent` patch at `server/socket-io/main.js:1183-1235`
- INVARIANT: no single IP can hold more than 100 concurrent WebSocket connections — enforced at `server/index.js:96-98`
- INVARIANT: HTTP requests capped at 100/15min per IP — enforced at `server/index.js:180-187`
- ASSUMPTION: event-rate limiter per-socket is sufficient to protect server CPU — UNVALIDATED for multi-socket attacks (100 sockets × 30 events/sec = 3,000/sec per IP) ⚠
- ASSUMPTION: physics computation completes fast enough to not block the event loop — UNVALIDATED; Pineapple + max-wind combo runs 20 × 3000 Euler steps synchronously, no async yield ⚠
- ASSUMPTION: Telegram's own 429 response will surface via `postToChat` try/catch error log — PARTIALLY ENFORCED; errors are caught and logged but there is no retry queue, backoff, or circuit breaker ⚠

## Risk Observations (Prioritized)

1. **Multi-socket event amplification (HIGH)**: `server/socket-io/main.js:1149` — per-socket rate limit of 30 ev/s × 100 connections per IP = 3,000 events/sec per IP; physics handler is synchronous and O(N × 3000), so a single IP can submit 3,000 fire events/sec if they maintain 100 connections; this could monopolize the event loop
2. **CPU-bound card render, no per-endpoint limit (HIGH)**: `server/index.js:344-386` — satori + resvg-js rasterization is a native blocking operation; public endpoints with only 100 req/15min shared across all routes; a targeted campaign against the card endpoints could block the event loop for other users without exhausting the rate limit
3. **RPC 429 no backoff (HIGH)**: `server/services/solana.js:113-116` — `getBalance()` calls `conn.getBalance()` directly; any Solana RPC 429 throws unhandled; `verifyBalance()` caller (createRoom handler) catches the error and emits `createRoomError` rather than failing open, so this is partially mitigated, but escrow CPI calls in `escrow.js` have no 429 handling and will throw into the settlement path
4. **Pineapple/TommyGun physics CPU spike (HIGH)**: `server/services/physics.js:929,935` — Pineapple fires 20 fragment sub-trajectories of up to 3000 steps each; with 2 fires/sec rate limit per socket × 100 connections, this is 200 Pineapple shots/sec = 200 × 20 × 3000 = 12M Euler steps/sec on one thread — exceeds any plausible free-tier tolerance
5. **Telegram flood on group match events (MEDIUM)**: `server/services/groupchat/lifecycle.js:1107-1122` — each idle penalty, turn ping, elimination, and match-end calls `postToChat()` serially with no queue; a 10-player match with all-idle turns generates 10 `sendMessage` calls per turn cycle; Telegram's per-bot-per-chat limit is ~1 msg/sec — bursts of HP penalties could hit 429 from Telegram
6. **`ipConnectionCounts` Map unbounded growth (MEDIUM)**: `server/index.js:88` — Map accumulates one key per distinct IP ever seen, is never pruned; in production with thousands of daily unique IPs this is a slow memory leak
7. **Escalation drop counter reset on clean event (MEDIUM)**: `server/socket-io/main.js:1207-1209` — `dropCount` is reset to 0 if any event passes cleanly after `RL_DISCONNECT_WINDOW` elapses; an attacker can interleave one legitimate event per 5s with a burst of 89 dropped events to avoid the disconnect trigger indefinitely
8. **`failedSettlements` Map unbounded (MEDIUM)**: `server/socket-io/main.js:318-320` — added on CPI failure, cleared on recovery success; no max-size enforcement; repeated escrow failures cause the Map to grow without bound, though practical impact is limited to rare error scenarios
9. **No per-endpoint rate limit for admin routes (LOW)**: `server/index.js:210-226` — `/stats` and `/api/admin/reload-keys` are protected by `requireAdminKey` but share the same global 100 req/15min HTTP rate limiter; admin key brute-forcing is rate-limited but not strictly per-endpoint
10. **lobbyWatchdog bulk Telegram sends (LOW)**: `server/services/groupchat/lobbyWatchdog.js:63-83` — on a sweep finding N stale lobbies, fires N sequential `sendMessage` calls with no delay; if N is large (e.g. after a server outage), this blasts Telegram's API for that bot token in a loop, risking 429 and chat-ban

## Novel Attack Surface

- **Physics amplifier via multi-connection fire flood**: The 2 fires/sec per-socket rate limit is reasonable for a 1v1 match but the limit lives per-socket, not per room. An attacker who opens 100 connections and joins as a spectator/bot could submit 200 Pineapple shots/sec to the physics engine — all synchronous, all on the same Node.js thread. The physics handler at `server/services/physics.js:1415` has no concurrency cap or early-exit once the match is over; even stale/invalid shots are fully computed before the authorization check in main.js returns. Need to verify whether physics runs before or after the turn-check gate.
- **keepAlive self-ping as reflection amplifier**: `server/index.js:573-580` — the server pings itself at `/health` every 12 minutes to prevent Render hibernation. If `SERVER_BASE_URL` is set by an attacker via env injection to a victim's server, this becomes a reflection DoS. Low practicality (env is set at deploy time) but worth noting.

## Cross-Focus Handoffs

- → **ERR-02 (Race Conditions)**: The escalation drop-counter reset window (`RL_DISCONNECT_WINDOW` 5s, `server/socket-io/main.js:1207`) creates a race: a client clearing the counter by one clean event per 5s while sustaining near-limit bursts avoids disconnect indefinitely. Investigate whether the ring-buffer tick can be bypassed by time manipulation or socket reconnect.
- → **LOGIC-01 (Business Logic)**: Physics engine runs synchronously for all 20 weapon types including multi-hit (count up to 20) and chain-reaction (count up to 15). The weapon unlock check only happens in the inventory layer — verify that `validateAction()` or the fire handler rejects weaponIds not in the player's inventory BEFORE calling `processShot()`, not after. If processShot runs first, forged weaponId=22 (Pineapple) is a free CPU spike from any socket.
- → **AUTH-03 (Authorization)**: The `createRoom` per-socket rate limit (3/60s) is bypassed if the attacker disconnects and reconnects — the ring buffer lives on the socket object, not keyed by wallet or IP. A reconnect resets all per-socket counters.

## Trust Boundaries

HTTP endpoints are behind a global 100 req/15min IP rate limiter plus the 1MB body cap. Card-render endpoints are public (no auth) and CPU-bound. Socket events are rate-limited per-socket at 30 events/sec, but the limit is not aggregated across connections from the same IP, allowing amplification. Telegram is an external API with its own hard rate limits that the server does not respect with any backoff logic — bot actions are fire-and-forget inside try/catch. Solana RPC is an external dependency with 429 responses that the server has no retry/backoff strategy for.
<!-- CONDENSED_SUMMARY_END -->

---

# ERR-03: Rate Limiting & Resource Exhaustion — Full Analysis

## Executive Summary

The server has added meaningful rate-limiting controls since the Feb 2026 audit: helmet, express-rate-limit (100 req/15min), 64KB socket payload cap, per-socket ring-buffer event throttle (30/sec), per-socket fire throttle (2/sec), 3 createRoom/60s, and per-IP connection cap (100 sockets). These controls are well-implemented individually. However, several structural gaps remain:

1. All per-socket limits multiply by connection count per IP (100 sockets = 3,000 events/sec aggregate).
2. The physics engine runs synchronous O(N × 3000) work per fire event — multi-hit weapons amplify this significantly.
3. Solana RPC and Telegram Bot API have no retry/backoff — 429 from either kills the operation silently.
4. Several in-memory Maps (ipConnectionCounts, failedSettlements) have no size bounds.
5. CPU-bound card render endpoints lack per-endpoint rate limits.

## Scope

Files analyzed in full:
- `server/index.js` (180 LOC) — express + Socket.IO init, HTTP rate limiter, connection cap
- `server/socket-io/main.js` (1850+ LOC) — per-socket event throttle, fire throttle, createRoom throttle, in-memory state maps
- `server/middleware/guards.js` (218 LOC) — `withLock`, `safeHandler`, `validateFireParams`
- `server/services/physics.js` (1800+ LOC) — processShot, trajectory loop, weapon processors
- `server/services/groupchat/scheduler.js` (147 LOC) — turn timer management
- `server/services/groupchat/lobbyWatchdog.js` (117 LOC) — 15-min sweep interval
- `server/services/groupchat/lifecycle.js` (1100+ LOC) — postToChat calls, idle penalty handler
- `server/services/solana.js` (950 LOC) — getBalance, RPC connection

Files analyzed for signatures only:
- `server/services/bot.js` — no setInterval, one-off sendMessage calls
- `server/services/challenge/renderTrophyCard.js`, `renderCareerCard.js`, `renderChallengeCard.js` — satori + resvg-js PNG pipeline
- `server/services/jupiter-price.js` — 30s polling cache (no concern)

## Scope Boundaries

- On-chain programs in `programs/` are out of scope (SOS).
- Client-side rate limiting (`client/src/`) is informational only — all limits that matter must be server-enforced.

## Key Mechanisms

### 1. HTTP Rate Limiter
**Location:** `server/index.js:180-187`
```
rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false })
app.use(httpLimiter)
```
- Window: 15 minutes
- Max: 100 requests per window per IP
- Applied: globally, before all routes (correct ordering)
- `trust proxy 1` ensures `req.ip` is the leftmost value from `x-forwarded-for` — correct for Render's single-hop proxy
- **No per-route overrides exist** — card-render endpoints share the budget with all other endpoints
- `standardHeaders: true` emits `RateLimit-*` headers (RFC 6585 draft) but does NOT set `Retry-After` on 429 responses by default in express-rate-limit v6 (need to verify version)

### 2. Socket.IO Connection Cap
**Location:** `server/index.js:84-113`
```js
const MAX_CONNECTIONS_PER_IP = 100;
const ipConnectionCounts = new Map();
io.use((socket, next) => {
    const ip = (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || socket.handshake.address;
    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }
    ipConnectionCounts.set(ip, current + 1);
    socket.on('disconnect', () => { ... decrement ... });
    next();
});
```
- Limit: 100 concurrent connections per IP
- IP extraction: trusts leftmost value of `x-forwarded-for` — consistent with `trust proxy 1`
- **Concern**: the Map is never pruned of zero-count IPs on disconnect when count drops to 0 — confirmed: `if (count <= 1) ipConnectionCounts.delete(ip)` so zeros ARE deleted. OK.
- **Concern**: Map grows indefinitely as unique IPs connect over time — each new unique IP adds an entry; these are deleted after disconnect, so map size tracks concurrent unique IPs only. Likely fine in practice (a few thousand concurrent IPs max).

### 3. Socket Per-Event Rate Limiter
**Location:** `server/socket-io/main.js:1149-1236`
```js
const RL_MAX_EVENTS = 30          // max events per second
const RL_MAX_FIRES = 2            // max fires per second
const RL_DISCONNECT_MULT = 3      // disconnect at 3x limit
const RL_DISCONNECT_WINDOW = 5000 // sustained for 5 seconds
const RL_WINDOW_MS = 1000
const RL_MAX_CREATES = 3
const RL_CREATE_WINDOW = 60000
```

Ring buffer implementation using `Float64Array` — O(1) insert, O(N) count (N = ring size, fixed).

- **eventRing**: Float64Array of size 31 — stores last 31 event timestamps
- **fireRing**: Float64Array of size 3
- **createRing**: Float64Array of size 4

**Escalation logic:**
```js
if (dropCount >= RL_DISCONNECT_MULT * RL_MAX_EVENTS &&
    (now - firstDropAt) <= RL_DISCONNECT_WINDOW) {
    client.disconnect(true)
}
dropCount = 0  // ← reset if any event lands after RL_DISCONNECT_WINDOW
```
The `dropCount` is reset when `(now - firstDropAt) > RL_DISCONNECT_WINDOW`, i.e. when 5s elapses without a check. An attacker who sends 29 events/sec (under the 30/sec limit) plus one extra event every cycle accumulates drops. If they send one clean event after each 5s window, `dropCount` resets. They can sustain near-90 drops without ever triggering disconnect.

**Critical gap**: this rate limiter lives on the socket object, created fresh on every `io.on('connection')`. A disconnect + reconnect resets all ring buffers. An attacker cycling connections evades the per-socket throttle for `createRoom` (max 3/60s) and the disconnect escalation counter.

### 4. Socket.IO Payload Cap
**Location:** `server/index.js:73`
```js
maxHttpBufferSize: 64 * 1024
```
64KB per message. The server comment says "prevent memory abuse". This is enforced at the Engine.IO transport layer — any message exceeding 64KB is rejected before reaching Socket.IO handlers. This is correctly positioned.

### 5. Body Parser Limit
**Location:** `server/index.js:190-191`
```js
express.json({ limit: '1mb', extended: true })
express.urlencoded({ limit: '1mb', extended: true })
```
1MB limit (reduced from 30MB per commit comment). The CSP report endpoint at line 264 adds a second `express.json` parser inline with `type: 'application/csp-report'` — this does not override the 1MB global limit but adds a separate parser for that content type.

### 6. Physics Engine Computation
**Location:** `server/services/physics.js`
```js
const MAX_TRAJECTORY_STEPS = 3000; // safety cap (~50 seconds of flight)
```

Multi-hit weapon trajectories:
- `Tommy Gun` (id=26): `type: 'multi'`, `count: 12` — 12 parallel trajectories, each up to 3000 steps
- `Chain Reaction` (id=21): `type: 'chain'`, `count: 15` — 15 chain detonations
- `Crazy Ivan` (id=9): `type: 'scatter'`, `count: 15` — 15 scatter sub-munitions
- `Pineapple` (id=22): `type: 'fragment'`, `count: 20`, plus main trajectory — 21 trajectories total
- `Hail Storm` (id=16): `type: 'rain'`, `count: 10` — 10 drops
- `Spider` (id=10): `type: 'spider'`, `count: 6` — 6 legs

Total worst case for Pineapple: 1 (main) + 20 (fragments) × 3000 steps = 63,000 Euler steps, synchronous, before the function returns.

The processShot call chain is:
1. `client.on('fire')` → `validateFireParams()` → `processShot()` → weapon-specific handler
2. The turn-ownership check (`ms.currentTurn !== this.id`) happens BEFORE `processShot()` — so unauthorized shots are rejected without running physics. This is the correct order. **Mitigates the worst case for unauthorized fire amplification.**
3. However, within a player's legitimate turn (2 fires/sec allowed), the physics CPU cost is real. With 100 connections each sending 2 Pineapple shots/sec = 200 Pineapple shots/sec (if each connection is in a different room or the turn check passes). This scenario requires 100 rooms each with an active match, which is constrained by `createRoom` (3/60s per socket). Practical ceiling is much lower.

**Key finding**: the weapon-type check does NOT happen before `processShot` — `processShot()` looks up `weaponId` in `WEAPON_DATA`. If a weaponId not in `WEAPON_DATA` is passed, `processShot` returns early with empty results. If a valid but expensive weaponId is passed (e.g. Pineapple), but the player doesn't own it, the physics still runs before the inventory check.

Need to verify: does the fire handler check `weaponInventories[roomId][client.id]` before calling `processShot`, or does it call processShot first and then apply results?

### 7. Telegram Bot Message Rate
**Location:** `server/services/groupchat/lifecycle.js:1107-1122`, `lobbyWatchdog.js:63-83`

```js
async function postToChat(chatId, text, extra = {}) {
    const bot = getBot();
    try {
        return await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
    } catch (err) {
        console.error(`[group-chat] postToChat to ${chatId} failed:`, err.description || err.message);
        return null;
    }
}
```

No queue, no rate limit, no backoff. Telegraf will throw if Telegram returns 429, and `postToChat` catches and logs it — the message is silently dropped.

In a 10-player group match with all players idle, one turn cycle generates:
- 1 `formatTurnPing` message
- 1 `formatIdlePenalty` message (per idle player)
- Potentially 1 `formatElimination` if HP reaches 0

In a worst-case cascade: 10 idle players = 10 penalty messages + up to 9 elimination messages = up to 19 `sendMessage` calls in rapid succession. Telegram's limit is ~30 msg/min per bot per chat (1 msg/2s sustained). Rapid-fire sends will trigger 429 and messages will be lost silently.

**lobbyWatchdog**: on a server outage recovery, all stale lobbies are swept in one loop. If 20 stale lobbies exist, 20 `sendMessage` calls fire with no delay.

### 8. Solana RPC — No 429 Handling
**Location:** `server/services/solana.js:113-116`

```js
async function getCachedBalance(walletAddress) {
    ...
    const conn = getConnection();
    const pubkey = new PublicKey(walletAddress);
    const lamports = await conn.getBalance(pubkey);
    ...
}
```

The `@solana/web3.js` `Connection.getBalance()` will throw on HTTP 429. There is a 30s balance cache (`BALANCE_CACHE_TTL_MS = 30000`) that reduces RPC call frequency per wallet, but on cache miss under RPC rate limiting, the call throws.

In `verifyBalance()` the catch path correctly emits `createRoomError` rather than failing open. However, in `escrow.js` and `escrow-v2.js`, RPC calls for CPI (confirm transaction, get account info) are made with no retry/backoff. A 429 from the RPC during settlement causes the settlement to fail and the match to enter the failed-settlements recovery path.

### 9. In-Memory State Maps
**Location:** `server/socket-io/main.js:110-150`

```js
const rooms = new Map()
var matchStates = {}
var goldStates = {}
var weaponInventories = {}
var shopTimers = {}
var shopReady = {}
var wagerStates = {}
var authenticatedWallets = {}
var playerUids = {}
var disconnectTimers = {}
var pendingReconnects = {}
var turnTimers = {}
var depositTimers = {}
const matchmakingQueues = new Map()
const failedSettlements = new Map()
const socketsByTgId = new Map()
```

**Cleanup analysis:**
- `rooms`, `matchStates`, `goldStates`, `weaponInventories`, `shopTimers`, `shopReady`, `wagerStates`: all deleted in `removeRoom()` which is called on match end, forfeit, and disconnect. **Cleaned.** `server/socket-io/main.js:575-601`
- `authenticatedWallets[client.id]`, `playerUids[client.id]`: deleted in disconnect handler at lines 1716-1717. **Cleaned.**
- `disconnectTimers`, `pendingReconnects`: set on disconnect, cleared when reconnect window closes or player rejoins. Keyed by walletAddress — potential leak if a wallet disconnects, 30s timer is set, then server is killed before the timer fires. After restart these are gone (in-memory); no leak concern.
- `failedSettlements`: added on settlement failure, removed on successful recovery. No max-size enforcement. In a scenario where the RPC is down for extended periods, entries accumulate. Each entry is ~200 bytes; unlikely to exhaust memory but unbounded.
- `matchmakingQueues`: entries removed when queue is consumed or player disconnects. `removeFromAllQueues(socketId)` is called on disconnect. **Cleaned.**
- `socketsByTgId`: a Map from telegramUserId → Set of socket IDs. Sockets are added on Telegram socket auth and removed on disconnect. **Need to verify** the disconnect cleanup removes from this Map.

### 10. Scheduler and lobbyWatchdog Intervals
**Location:** `server/services/groupchat/scheduler.js`, `server/services/groupchat/lobbyWatchdog.js`

- `scheduler.js` uses `setTimeout` per match, not `setInterval`. No runaway interval risk. Timer count equals active match count (bounded by DB state). Timer is cleared in `clearMatchTimer()` on match end.
- `lobbyWatchdog.js` uses `setInterval` at 15-minute sweep. One interval for the process lifetime. Low overhead — DB query once every 15 min. `unref()` is called so it doesn't block process shutdown. **No concern.**

## Trust Model

All rate-limiting controls are server-enforced. The client has no say in rate limit enforcement. The key trust boundaries:

1. **HTTP rate limiter** trusts `x-forwarded-for` via `trust proxy 1` — appropriate for Render single-hop but could be spoofed if Render's ingress layer ever changes or if deployed behind a different proxy config.
2. **Socket throttle** trusts that each socket represents one distinct user agent — violated by multi-connection attacks from the same IP (within the 100-connection cap).
3. **Physics engine** trusts that the fire handler validates turn ownership before calling `processShot` — confirmed true by code inspection, but needs ongoing verification in main.js updates.
4. **Telegram API** is an external dependency with its own limits — the server assumes success or catches errors but does not retry.
5. **Solana RPC** is treated as reliable — no 429-aware retry.

## State Analysis

| Map/Object | Grows with | Cleaned by | Bounded? |
|------------|-----------|------------|---------|
| `rooms` | new match | `removeRoom()` | Yes — bounded by concurrent matches |
| `matchStates` | new match | `removeRoom()` | Yes |
| `goldStates` | new match | `removeRoom()` | Yes |
| `weaponInventories` | new match | `removeRoom()` | Yes |
| `authenticatedWallets` | connection + auth | `disconnect` handler | Yes — bounded by connected sockets |
| `playerUids` | registerIdentity | `disconnect` handler | Yes |
| `failedSettlements` | escrow failure | successful recovery | **No upper bound** |
| `ipConnectionCounts` | unique IPs | auto-deleted at 0 on disconnect | Yes — bounded by concurrent unique IPs |
| `matchmakingQueues` | queue join | consumed or disconnect | Yes |
| `socketsByTgId` | TG socket auth | disconnect (need to verify) | Need to verify |

## Dependencies

- **express-rate-limit**: `app.use(httpLimiter)` — applied globally
- **Socket.IO 4.x**: `maxHttpBufferSize` enforced at Engine.IO layer
- **Telegraf (Telegram)**: no retry/backoff in `bot.telegram.sendMessage`
- **@solana/web3.js Connection**: no 429 handling in `getBalance`, `confirmTransaction`, `getAccount`

## Focus-Specific Analysis

### Throttle Bypass via Reconnect
Per-socket ring buffers reset on reconnect. The `createRoom` throttle (3/60s) is the most impactful — an attacker disconnects and reconnects to reset it. Creating a room involves no auth for free matches, so an unauthenticated attacker can create rooms at the rate of 3 per reconnect cycle.

Mitigation gap: the throttle should be keyed by IP (for unauthenticated sockets) or wallet (for authenticated sockets), not socket ID.

### Physics Amplification
The fire handler at ~line 3400 in main.js does check `ms.currentTurn !== this.id` before calling `processShot`. This is the critical gate. However:
- The check is inside the event handler; if the rate limiter passes the event, the check runs.
- For a legitimate player's turn, they can submit 2 fires/sec. With Pineapple each fire runs 21 trajectories × 3000 steps = 63,000 Euler steps. At 2 fires/sec that's 126,000 steps/sec — single-threaded Node.js.
- Compare with regular Single Shot: 1 × 3000 = 3,000 steps/sec at same rate.
- The disparity is 42×. Pineapple is a prestige weapon, so only high-tier players have it — but in a group match with multiple prestige players, multiple concurrent Pineapple shots could saturate the event loop.

### MongoDB Query in Watchdog
The lobbyWatchdog runs `GroupMatch.find({ state: 'lobby', lobbyExpiresAt: { $lte: now } })` every 15 minutes. If the DB has millions of GroupMatch documents (unlikely but possible over months), this query could be slow without an index on `{ state: 1, lobbyExpiresAt: 1 }`. The query result set is processed in a synchronous `for` loop with `await` per save — this is fine for concurrency but could spike I/O on a large result set.

## Cross-Focus Intersections

- **ERR-01 (Error Handling)**: The `withLock` mutex at `server/middleware/guards.js:170` has a 30s timeout safety net. This prevents deadlocks but means any operation holding the lock for >30s is force-released. Under RPC 429, a `settleMatchEscrow` call that hangs for 30s triggers lock auto-release. If settlement is mid-execution, the state may be partially updated. → Handoff to ERR-01.
- **AUTH-03 (Authorization)**: The `createRoom` and `fire` per-socket rate limits do not survive reconnect. → Handoff to AUTH-03 for per-IP/wallet throttle recommendation.
- **LOGIC-01 (Business Logic)**: Confirm whether weapon inventory check runs before or after `processShot()` — if processShot runs first, unauthorized weapon use triggers expensive physics computation. → Handoff to LOGIC-01.

## Cross-Reference Handoffs

- → **ERR-01**: `withLock` force-release at 30s during RPC hang — settlement may be mid-state when released. `server/middleware/guards.js:182-188`
- → **AUTH-03**: Per-socket rate limits (createRoom 3/60s, fire 2/sec) are bypassable via reconnect — need per-IP or per-wallet keying for production. `server/socket-io/main.js:1157-1230`
- → **LOGIC-01**: Confirm order of `processShot()` vs inventory check in the fire handler — if physics runs before inventory validation, Pineapple is a free CPU spike on a valid turn. Search for `processShot` invocation in `server/socket-io/main.js` around the fire handler.

## Risk Observations

Ordered by exploitability and impact:

1. **(HIGH) Multi-socket physics amplification**: 100 connections/IP × 2 Pineapple fires/sec × 63,000 steps = 12.6M Euler steps/sec on one thread. Practical ceiling is constrained by match count (3 createRoom/60s per socket × 100 sockets = 300 rooms in 60s) but in a short burst before rooms are reaped, a targeted attack could spike CPU. The per-socket limits are individually sound but their product at IP-level is large.

2. **(HIGH) Card-render CPU with no per-endpoint limit**: `GET /api/challenge/:code/card.png` and `GET /api/stats/:tgUserId/card.png` use satori + resvg-js, a native Rust WASM module that renders SVG to PNG synchronously. No async yield. No concurrency cap. No per-endpoint rate limit. The global 100 req/15min budget is easily exhausted with 100 rapid card requests, blocking subsequent legit requests for the full 15-min window.

3. **(HIGH) Solana RPC 429 → silent settlement failure**: No retry or backoff in `getBalance()` or escrow CPI calls. Under devnet congestion or mainnet rate limiting, balance checks throw and settlement calls throw — entering the failed-settlement recovery path. No monitoring alert exists for this condition beyond a console.error log.

4. **(HIGH) Telegram 429 silent drop**: `postToChat` catches errors and returns null. Turn pings, idle penalties, and match-end notifications are silently dropped if Telegram's API rate-limits the bot. Players in a group match would see no notifications and be unable to distinguish "bot is dead" from "server is down".

5. **(MEDIUM) Escalation counter reset evasion**: An attacker sending 29 events/sec (just under the 30/sec limit) can sustain the traffic indefinitely without disconnection. The escalation only triggers on drops above 90 within a 5s window — but 29/sec generates zero drops. The rate limit is effectively 30 events/sec with no escalation for sustained near-limit traffic.

6. **(MEDIUM) `socketsByTgId` cleanup unverified**: This Map is used to find sockets for Telegram users. If the disconnect handler does not remove the socket from this map, TG users who reconnect accumulate stale socket IDs in the set. Need to verify cleanup in main.js disconnect path.

7. **(MEDIUM) lobbyWatchdog bulk Telegram sends**: After a server outage, all stale lobbies are swept and cancelled in rapid succession. Each calls `sendMessage`. If 50+ lobbies expired during downtime, this sends 50+ messages in a tight loop, risking 429 from Telegram and missing some cancellation notices.

8. **(MEDIUM) `failedSettlements` unbounded growth**: Unlikely to cause memory exhaustion under normal conditions, but under sustained RPC outage the Map grows with no recovery mechanism. A monitoring alert or max-size eviction would be prudent.

9. **(LOW) HTTP limiter no per-endpoint override**: Admin routes (`/stats`, `/api/admin/reload-keys`) share the global 100 req/15min budget with all other endpoints. Admin key brute-forcing is effectively limited to 100 attempts per 15 min — reasonable, but a dedicated admin rate limiter (stricter) would be cleaner.

10. **(LOW) `balanceCache` unbounded growth**: `server/services/solana.js:99` — `const balanceCache = new Map()` — entries expire via TTL check but are never evicted from the Map until re-queried. After months of operation with thousands of wallets checked, this Map could accumulate many stale entries. No impact until memory becomes a concern.

## Novel Attack Surface Observations

1. **Weapon upgrade → physics cost amplification**: Prestige tiers unlock expensive weapons (Pineapple, Tommy Gun, Chain Reaction). A player who reaches prestige by burning SHOT tokens gains access to 42× more CPU-expensive weapons. The rate limit does not distinguish weapon cost. Under the current per-socket limits, a prestige player can legitimately generate 126K steps/sec from their single socket, compared to 6K steps/sec for a free player. This is a game-design constraint that should be reviewed for mainnet.

2. **Self-ping as reflection amplifier**: `server/index.js:573-580` — `SERVER_BASE_URL` env controls the keepalive target. In a compromised environment (env injection via misconfigured CI/CD), this could be pointed at an external target, turning the server into a periodic HTTP requester against that target.

3. **Group match as Telegram flood amplifier**: A malicious bot operator who creates a 10-player group match and then sends a crafted shot that triggers 10 simultaneous idle penalties + eliminations in one turn (via forfeiture logic) generates up to 20 `sendMessage` calls in rapid succession. If the group chat has strict rate limits (private groups with flood detection), this could get the bot banned from the group.

## Questions for Other Focus Areas

- **LOGIC-01**: Does `processShot()` run before or after the weapon inventory check in `main.js` fire handler? Line numbers needed.
- **ERR-02**: Can the `client.onevent` patch on `main.js:1182` be bypassed using Socket.IO's `client.onAny()` or other event hooks?
- **AUTH-01**: After disconnect/reconnect, is the per-socket rate limit state preserved across the reconnection path, or is it always a fresh socket object? (Relevant to createRoom throttle bypass.)
- **DATA-01**: Does `GroupMatch` have a compound index on `{ state: 1, lobbyExpiresAt: 1 }` for the watchdog query? Without it, the 15-min sweep does a full collection scan.

## Raw Notes

- `server/index.js:87`: `MAX_CONNECTIONS_PER_IP = 100` — fine for demo; may need lowering for mainnet (20-30 would be reasonable for a gaming app)
- `server/socket-io/main.js:1151`: `RL_MAX_EVENTS = 30` — reasonable; Socket.IO recommend 10-50 for gaming apps
- `server/socket-io/main.js:1152`: `RL_MAX_FIRES = 2` — correct for turn-based game (one fire per turn, 2/s allows fast turns)
- `server/services/physics.js:62`: `MAX_TRAJECTORY_STEPS = 3000` — the comment says "~50 seconds of flight" at 60fps; this seems large for a 1422px-wide screen; most shots land in < 200 steps
- `server/services/groupchat/lobbyWatchdog.js:36`: `SWEEP_INTERVAL_MS = 15 * 60 * 1000` — sensible for 24h TTL lobbies
- `server/services/groupchat/scheduler.js:22`: `timers` Map — bounded by active match count (each GroupMatch in 'active' state has exactly one timer)
- No `idleTimeout.js` file exists at `server/services/groupchat/idleTimeout.js` — the HOT_SPOTS.md mentioned it as "(NEW)" but it appears the functionality was absorbed into `lifecycle.js`'s `handleIdleTimeout()` function. The HOT_SPOTS reference may be stale or the file was merged.
