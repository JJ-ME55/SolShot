# BATCH-01: Access Control Findings

**Auditor:** Claude Opus 4.6 (automated hypothesis investigation)
**Date:** 2026-02-14
**Scope:** Access control vulnerabilities in SolShot server (`server/socket-io/main.js`, `server/middleware/auth.js`, `server/index.js`)
**Branch:** dev

---

## H001: Unauthenticated wager room creation

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `createRoom` handler at `server/socket-io/main.js:354-410` has zero authentication checks. There is no guard that verifies `client.isAuthenticated === true` or that `authenticatedWallets[client.id]` exists before allowing wager room creation.

```javascript
// main.js:354
client.on('createRoom', async ({player}) => {
    // ... no auth check anywhere ...
    const wagerAmount = player.wager || 0                                   // line 369
    const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null  // line 370
    if (wagerAmount > 0 && !isValidWager(wagerAmount)) {                    // line 371
        client.emit('createRoomError', { reason: 'Invalid wager tier' })
        return
    }
    wagerStates[roomId] = {                                                 // line 375
        amount: wagerAmount,
        wallets: { [client.id]: walletAddress }
    }
```

The only validation performed is `isValidWager(wagerAmount)` which checks that the tier is in `[0, 0.01, 0.05, 0.1, 0.25, 0.5]`. No authentication is required. No balance check is performed on the creator's wallet (only the joiner gets a balance check at line 307). The wallet address is taken directly from the untrusted payload (`player.walletAddress`) with the authenticated wallet only as a fallback.

**Exploit scenario:**

1. Attacker connects a raw Socket.IO client (no wallet, no authentication).
2. Attacker emits `createRoom` with `{ player: { name: "attacker", color: 1, wager: 0.5, walletAddress: "AnyArbitraryBase58String" } }`.
3. Server creates the room with a 0.5 SOL wager tied to a spoofed wallet address.
4. Server never verifies that the attacker owns the wallet or has 0.5 SOL.
5. A legitimate player joins, passes the balance check, and plays the match.
6. On match completion, settlement references the spoofed wallet -- if real settlement were implemented, the attacker risks nothing (no deposit was taken) while the legitimate player's funds are at stake.

**Recommendation:**

1. Require `client.isAuthenticated === true` before allowing any `createRoom` with `wagerAmount > 0`.
2. Use `authenticatedWallets[client.id]` as the sole source of the creator's wallet address -- never accept it from the payload.
3. Perform a `verifyBalance()` check on the creator's wallet, identical to the joiner check.
4. Implement escrow/deposit at room creation time so funds are locked before the match begins.

---

## H002: Wallet address spoofing in joinRoom

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `joinRoom` handler at `server/socket-io/main.js:288-344` accepts the wallet address from the untrusted payload first, falling back to the authenticated wallet only if the payload field is absent:

```javascript
// main.js:296
const joinerWallet = walletAddress || authenticatedWallets[client.id] || null
```

This means a client can:
- Authenticate as wallet A (via proper signature verification).
- Then emit `joinRoom` with `walletAddress: "WalletB"` in the payload.
- The server stores `WalletB` in `wagerStates` at line 333: `ws.wallets[client.id] = joinerWallet`.

The same pattern exists in `createRoom` at line 370:
```javascript
const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
```

The balance check at lines 306-317 runs against the spoofed wallet, not the authenticated one. Furthermore, the balance check fails open -- if the RPC call throws, the `catch` block at line 315 logs a warning and allows the join to proceed:

```javascript
} catch (err) {
    console.warn('[Solana] Balance check skipped:', err.message)
    // No return -- player joins anyway
}
```

Additionally, the balance check at line 308 has a logic bug: it only rejects if `balanceCheck.balance > 0 && !balanceCheck.sufficient`. When the RPC fails, `verifyBalance()` returns `{ sufficient: false, balance: 0, required: ... }` (solana.js:97-101). Since `balance` is 0, the condition `balance > 0` is false, so the player is not rejected even through the normal flow.

**Exploit scenario:**

1. Attacker authenticates with their own wallet (WalletA, which has 0 SOL).
2. Attacker emits `joinRoom` with `{ walletAddress: "SomeRichWalletAddress", roomId: "abc123" }`.
3. Balance check runs against the rich wallet -- passes.
4. `wagerStates[roomId].wallets[attacker.id]` is set to the rich wallet address.
5. On settlement, the server believes the attacker's wallet is the rich wallet.
6. With real settlement, the attacker could lose SOL from someone else's wallet, or (more likely) the on-chain transaction would fail since the attacker cannot sign for that wallet, causing settlement to fail entirely.
7. Alternatively, the attacker provides an invalid/nonexistent wallet address, the balance check throws and is caught at line 315, and the attacker joins with 0 balance.

**Recommendation:**

1. Never accept wallet addresses from the payload for wager operations. Always use `authenticatedWallets[client.id]`.
2. Reject the join if `authenticatedWallets[client.id]` is undefined (require authentication for wagered rooms).
3. Fix the balance check logic: reject when `!balanceCheck.sufficient` regardless of whether `balance > 0`.
4. Do not silently skip the balance check on RPC error -- reject the join or retry.

---

## H003: deleteRoom host-only bypass

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The `deleteRoom` handler at `server/socket-io/main.js:274-284` performs no host verification whatsoever:

```javascript
// main.js:274-284
client.on('deleteRoom', async () => {
    if (client.roomId !== null) {
        client.leave(client.roomId)
        await removeRoom(client.roomId)                    // Deletes ALL state for the room
        io.sockets.in(client.roomId).emit('opponentLeft', {})
        io.emit('setRooms', {rooms: getOpenRooms()})
        io.socketsLeave(client.roomId);
        client.roomId = null
        client.isHost = false
    }
})
```

The only check is `client.roomId !== null` -- i.e., is the caller in any room. There is no check for `client.isHost === true`.

The `removeRoom()` function at lines 89-108 destroys all state: `rooms`, `matchStates`, `goldStates`, `weaponInventories`, `shopReady`, `wagerStates`, and `shopTimers`. Critically, it deletes `wagerStates[roomId]` without performing settlement.

**Exploit scenario:**

1. Player A (host) creates a wagered room with 0.5 SOL.
2. Player B (non-host) joins.
3. Match progresses to BATTLE state.
4. Player B is losing the match.
5. Player B emits `deleteRoom`.
6. Server calls `removeRoom()` which deletes `wagerStates[roomId]` -- no settlement occurs.
7. Player B avoids losing their wager. Player A loses their wager with no payout.
8. Both players are ejected. The room and all evidence of the match are destroyed.

**Recommendation:**

1. Add `if (!client.isHost) return` guard at the top of the handler.
2. If the room has an active wager (`wagerStates[roomId]?.amount > 0`) and the match is in progress, treat deletion as a forfeit by the deleter and settle in favor of the opponent before removing the room.
3. Log room deletions with enough context to audit disputes.

---

## H006: Auth bypass via skipping authenticate

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The `client.isAuthenticated` property is set to `false` on connection (line 166) and set to `true` in `handleAuthenticate()` (auth.js:135). However, `isAuthenticated` is **never read or checked** anywhere in the codebase after assignment:

```
$ grep isAuthenticated server/socket-io/main.js
Line 166:   client.isAuthenticated = false       // <-- set on connect

$ grep isAuthenticated server/middleware/auth.js
Line 135:   client.isAuthenticated = true;        // <-- set on auth success
```

There are zero conditional checks like `if (!client.isAuthenticated)` anywhere in the server code. Every single socket event handler -- `createRoom`, `joinRoom`, `fire`, `buyWeapon`, `deleteRoom`, `leaveRoom`, `ready`, `playAgainRequest`, and all 15+ other handlers -- executes unconditionally for any connected socket.

The `authenticatedWallets` map is used in a few places (lines 296, 370, 600, 615, 841-842), but always with the `||` fallback pattern, meaning the payload value takes priority and the authenticated value is only a fallback. If the payload includes a wallet address, authentication is irrelevant.

**Exploit scenario:**

1. Attacker connects a raw Socket.IO client. Never calls `authenticate`.
2. `client.isAuthenticated` remains `false`. `authenticatedWallets[client.id]` is `undefined`.
3. Attacker emits `createRoom` with `{ player: { name: "x", color: 1, wager: 0.5, walletAddress: "SpoofedWallet" } }`.
4. Server creates the wagered room. `walletAddress` comes from the payload (line 370). Since `authenticatedWallets[client.id]` is undefined, the fallback is never reached, but it does not matter -- the payload value is used first.
5. Attacker can play the entire match, trigger settlement, earn SHOT tokens -- all without ever authenticating.

Full list of handlers with no auth guard (all 27 socket events):
- `authenticate`, `disconnect`, `leaveRoom`, `deleteRoom`, `joinRoom`, `getRooms`, `createRoom`, `ready`, `buyWeapon`, `shopDone`, `getShotInfo`, `prestigeBurn`, `weaponPick`, `getWeaponArray`, `createWeaponArray`, `shoot`, `fire`, `requestTerrain`, `weaponChange`, `angleChange`, `powerChange`, `terrainPath`, `getTerrainPath`, `stepLeft`, `stepRight`, `giveTurn`, `requestTurn`, `playAgainRequest`

**Recommendation:**

1. Create middleware that checks `client.isAuthenticated` for all wager-related and economy-related events.
2. At minimum, guard `createRoom` (when wager > 0), `joinRoom` (when room has wager), and `fire` with authentication checks.
3. Never use payload-supplied wallet addresses -- always derive from `authenticatedWallets[client.id]`.

---

## H007: JWT secret hardcoded fallback

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

The JWT secret at `server/middleware/auth.js:17` uses a hardcoded fallback:

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'solshot-dev-secret-change-me';
```

If `JWT_SECRET` is not set in the environment (which is the default for development and likely for any deployment that does not explicitly configure it), every JWT is signed with the well-known string `'solshot-dev-secret-change-me'`.

Furthermore, `verifyToken()` (auth.js:100-107) is **never called** from `main.js` or any other file in the server:

```
$ grep verifyToken server/socket-io/main.js
(no results)
```

The import at main.js:7 only imports `handleAuthenticate`:
```javascript
import { handleAuthenticate } from '../middleware/auth.js';
```

`verifyToken` is exported but never imported or invoked anywhere. This means:
- JWTs are generated (auth.js:131) and sent to the client (auth.js:137).
- The client receives the JWT but can never use it -- the server never validates it.
- Even if the server did validate JWTs, the hardcoded secret means any attacker can forge valid tokens for any wallet address.

**Exploit scenario (if JWT validation were ever added):**

1. Attacker knows the secret is `'solshot-dev-secret-change-me'` (it is in the source code).
2. Attacker forges a JWT: `jwt.sign({ wallet: "VictimWalletAddress" }, 'solshot-dev-secret-change-me', { expiresIn: '24h' })`.
3. If any future code path validates this JWT, the attacker is authenticated as the victim's wallet.

**Current practical impact:** The JWT system is entirely decorative. It neither provides security nor is it consumed. The real authentication mechanism (`authenticatedWallets` map) is what matters, and as shown in H006, even that is never enforced.

**Recommendation:**

1. Remove the hardcoded fallback. Require `JWT_SECRET` via environment variable and fail startup if not set.
2. Actually call `verifyToken()` on subsequent requests, or remove the JWT system entirely if socket-based auth (the `authenticatedWallets` map) is the intended mechanism.
3. If keeping JWTs, use a cryptographically random secret of at least 256 bits.

---

## H008: CORS wildcard

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

Both Socket.IO and Express are configured with wildcard CORS at `server/index.js:15-22`:

**Socket.IO (line 15-20):**
```javascript
const io = new socket.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})
```

**Express (line 22):**
```javascript
app.use(cors())
```

The `cors()` middleware with no arguments defaults to `Access-Control-Allow-Origin: *`, which permits any origin.

This means:
- Any website on the internet can open a Socket.IO connection to the SolShot server.
- Any website can make HTTP requests to `/health` and `/stats` endpoints.
- A malicious site can execute cross-origin attacks against players who have active SolShot sessions.

Combined with the lack of authentication enforcement (H006), this means an attacker can host a malicious webpage that silently connects to the SolShot server and performs any action -- create rooms, join matches, fire weapons, trigger settlement -- all from a third-party origin.

**Exploit scenario:**

1. Attacker hosts `evil-site.com` with JavaScript that opens a Socket.IO connection to the SolShot server.
2. Victim visits `evil-site.com` (e.g., via phishing link).
3. The attacker's JavaScript creates a wagered room, joins rooms, or interferes with active matches.
4. Since no authentication is required (H006) and CORS allows any origin, the attack succeeds without the victim's knowledge.
5. The `/stats` endpoint exposes wager totals, match counts, and settlement data to any origin, enabling reconnaissance.

**Recommendation:**

1. Replace `origin: "*"` with an explicit allowlist of trusted origins (e.g., the production frontend domain).
2. Configure Express CORS similarly: `app.use(cors({ origin: 'https://solshot.gg' }))`.
3. In development, use a separate env-driven CORS config that allows `localhost` origins.
4. Add authentication to the `/stats` endpoint or remove sensitive financial data from its response.

---

## Summary

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| H001 | Unauthenticated wager room creation | CONFIRMED | CRITICAL |
| H002 | Wallet address spoofing in joinRoom | CONFIRMED | CRITICAL |
| H003 | deleteRoom host-only bypass | CONFIRMED | HIGH |
| H006 | Auth bypass via skipping authenticate | CONFIRMED | CRITICAL |
| H007 | JWT secret hardcoded fallback | CONFIRMED | HIGH |
| H008 | CORS wildcard | CONFIRMED | HIGH |

**Total: 6 findings -- 3 CRITICAL, 3 HIGH. All 6 hypotheses confirmed.**

The access control posture of SolShot is fundamentally broken. Authentication exists as code but is never enforced. Every socket event handler is accessible to anonymous, unauthenticated connections. Wallet addresses are accepted from untrusted payloads rather than derived from verified authentication state. The combination of CORS wildcard + no auth enforcement + wallet spoofing means any website on the internet can interact with the game server as any wallet.
