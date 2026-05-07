<!-- CONDENSED_SUMMARY_START -->
---
task_id: AUTH-03
auditor: Authorization & Access Control
date: 2026-02-23
files_reviewed:
  - server/socket-io/main.js (2566 lines)
  - server/middleware/guards.js
  - server/middleware/auth.js
  - server/index.js
  - server/services/escrow.js
  - server/services/solana.js
severity_counts:
  critical: 4
  high: 6
  medium: 5
  low: 2
---

## Condensed Summary

### What the Code Claims to Do

The server applies authentication guards (`requireAuth`) and authorization checks (host-only `deleteRoom`, turn-ownership checks, room-membership validation) to protect game operations. Settlement is triggered exclusively by the server and routed through the server keypair via Anchor CPI. The `guards.js` module provides `requireAuth`, `validatePayload`, `withLock`, and `safeHandler` as composable primitives.

### Overall Assessment

The access-control surface is **significantly improved** over the ARCHITECTURE.md baseline but retains four critical and six high-severity gaps. The most dangerous residual weaknesses center on:

1. **`joinQueue` creates rooms without balance verification for the queue-paired player** (critical — a zero-balance wallet can enter a wagered match via the queue path).
2. **`createWeaponArray` is callable by non-host players**, letting the second player overwrite the shared random seed mid-game.
3. **`weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `giveTurn` relay events are completely unauthenticated and unscoped** — any socket can inject state to the opponent side of any match they are a member of (no room-membership check on the socket.to() relay).
4. **`escrowDepositConfirm` cross-room check uses `client.roomId !== rid`** but `client.roomId` is set during `joinRoom`/`createRoom`. If a malicious client emits `escrowDepositConfirm` with a `roomId` for a room they are legitimately in, they can attempt double-confirmation. The on-chain guard prevents actual fund damage, but in dev mode (escrow disabled) both confirmations are accepted from the same socket, potentially triggering `escrowActive` prematurely.
5. **Settlement authority is correctly server-only** — `settleMatchEscrow` and `cancelMatchEscrow` both sign with `getEscrowKeypair()`. No client path can directly trigger settlement. This is the strongest area.

### Access Control Matrix Summary

| Event | Auth Required | Host-Only | Turn-Only | Room-Member Check | Verdict |
|---|---|---|---|---|---|
| authenticate | N/A | No | No | No | OK |
| createRoom | For wager only | N/A | No | No | OK |
| joinRoom | For wager only | No | No | No | OK |
| deleteRoom | Yes | **Yes (enforced)** | No | implicit (client.roomId) | OK |
| leaveRoom | No | No | No | implicit | MEDIUM: no auth |
| rejoinRoom | Sig re-verify | No | No | wallet lookup | OK |
| getRooms | No | No | No | No | OK (read-only) |
| joinQueue | For wager | No | No | No | HIGH: no balance check for queue-paired player |
| leaveQueue | No | No | No | No | OK |
| ready | Yes | No | No | implicit | OK |
| buyWeapon | Yes | No | No | implicit | OK |
| shopDone | Yes | No | No | implicit | OK |
| fire | Yes | No | **Yes (enforced)** | implicit | OK — residual tolerance gap |
| requestTerrain | Yes | No | No | implicit | OK |
| positionUpdate | Yes | No | No | implicit + bounds | OK |
| stepLeft | Yes | No | **Yes (enforced)** | implicit | OK |
| stepRight | Yes | No | **Yes (enforced)** | implicit | OK |
| weaponPick | **No** | No | No | **None** | HIGH: unauth relay |
| weaponChange | **No** | No | No | **None** | HIGH: unauth relay |
| angleChange | **No** | No | No | **None** | MEDIUM: unauth relay |
| powerChange | **No** | No | No | **None** | MEDIUM: unauth relay |
| giveTurn | **No** | No | No | **None** | MEDIUM: unauth relay |
| shoot (legacy) | **No** | No | No | **None** | MEDIUM: unauth relay |
| getWeaponArray | No | No | No | implicit | LOW: read-only |
| createWeaponArray | Yes | **No (bug)** | No | implicit | HIGH: non-host can overwrite |
| getShotInfo | No | No | No | No | OK (read-only) |
| getStats | No | No | No | No | OK (read-only — per-socket) |
| prestigeBurn | Auth (implicit) | No | No | No | OK |
| playAgainRequest | Yes | No | No | implicit | OK |
| escrowDepositConfirm | Yes | No | No | roomId check | CRITICAL (dev-mode gap) |
| disconnect | N/A | No | No | implicit | OK |
| Settlement (server) | Server keypair | N/A | N/A | N/A | OK — properly server-only |

### Critical Findings

- **AUTH-03-C1**: `joinQueue` does not verify balance for the queue-paired player (the one already in the queue). Only the joiner's wallet is checked; the opponent from the queue is accepted on trust.
- **AUTH-03-C2**: `createWeaponArray` is guarded by `requireAuth` but NOT by a host-only check. Any authenticated player-2 socket in a room can call it and overwrite `room.randomArray`, changing the weapon selection order for both players mid-match. In wagered games this gives player 2 a weapon-draw advantage.
- **AUTH-03-C3**: `escrowDepositConfirm` in dev mode (escrow disabled) has no on-chain verification. The same socket can emit `escrowDepositConfirm` twice (or two sockets in the same room from the same physical machine), and both will record deposits, triggering `escrowActive` without real on-chain funds committed.
- **AUTH-03-C4**: Relay events (`weaponPick`, `weaponChange`, `angleChange`, `powerChange`, `giveTurn`, `shoot`) use `client.to(client.roomId).emit(...)`, which only broadcasts to room members. However there is zero authentication or state-validation on these events. Any authenticated-but-idle socket that is a room member can spam these relays continuously. More critically, a socket that is in the room but whose turn it is NOT can inject `shoot` relay events during the opponent's turn-display phase, polluting the opponent's UI state.

### High Findings

- **AUTH-03-H1**: `leaveRoom` has no `requireAuth` call. An unauthenticated socket can leave (and trigger `cleanupRoom`) any room it is a member of. This causes wager forfeiture logic to run — the wager wallets are read from `wagerStates`, which are server-set, so no direct financial spoofing, but room destruction without auth is a griefing vector.
- **AUTH-03-H2**: `rejoinRoom` re-verifies the wallet signature correctly, but it does NOT check that the claimed `walletAddress` actually matches `authenticatedWallets[client.id]` for the NEW socket. A new (unrelated) socket that knows a valid wallet address and can produce a fresh signed message can rejoin as that wallet, because `authenticatedWallets[client.id]` is set INSIDE `rejoinRoom` after the sig check — there is no pre-existing binding requirement.
- **AUTH-03-H3**: `positionUpdate` validates bounds but uses a 400px horizontal / 200px vertical tolerance. This tolerance is deliberately wide to accommodate movement sync, but at 80px per step and 4-step limit (320px maximum movement), a 400px tolerance allows one extra step's worth of spoofed X-position.
- **AUTH-03-H4**: `fire` event accepts a client-supplied `data.position` override within a 400px/200px tolerance window and uses it as the actual shot origin for physics. While the server doesn't write this back to `serverPos`, the shot trajectory IS computed from the client-reported position. A player can fire from up to 400px ahead of their actual server position, effectively extending range.
- **AUTH-03-H5**: `getStats` and `getShotInfo` do not require authentication. They return data keyed by `authenticatedWallets[client.id]`, which is null for unauthenticated sockets, resulting in a safe default return. No data leak, but the pattern is inconsistent — an unauthenticated socket gets balance 0 rather than an auth error.
- **AUTH-03-H6**: The `wagerStates[roomId].wallets` map for the host is populated at `createRoom` from `authenticatedWallets[client.id]`. For the joiner, it is populated at `joinRoom` time from `authenticatedWallets[client.id]`. For queue matches (`joinQueue`), the opponent's wallet is taken from the in-queue entry object (`opponent.wallet`), which was itself set from `authenticatedWallets[client.id]` at queue-entry time. If the opponent's socket disconnects and reconnects between queue entry and match creation, the stale `opponent.wallet` from the queue entry is used. This is a minor data staleness issue, not a spoofing vector, but worth noting.

### Settlement Authority (Positive Finding)

Settlement (`settleMatch`, `cancelMatchEscrow`) is exclusively invoked by server-internal code paths (fire handler, `cleanupRoom`, `startTurnTimer` forfeit). No socket event directly calls `settleMatch`. The on-chain Anchor program validates the server keypair as authority (`constraint = escrow.authority == authority.key()`). Clients cannot trigger or influence settlement outcome. The `escrowDepositConfirm` event records confirmation but does not itself call settle. **This is correctly implemented.**

<!-- CONDENSED_SUMMARY_END -->

---

# AUTH-03: Full Authorization & Access Control Analysis

## 1. Authentication Infrastructure

### 1.1 `handleAuthenticate` (`auth.js`)

```javascript
export function handleAuthenticate(client, { walletAddress, message, signature, timestamp }) {
    const msgCheck = verifyAuthMessage(message, walletAddress, timestamp);
    ...
    const sigCheck = verifyWalletSignature(walletAddress, message, signature);
    ...
    client.walletAddress = walletAddress;
    client.isAuthenticated = true;
    return { success: true, token, walletAddress };
}
```

**Analysis:** Ed25519 signature verified via `tweetnacl`. Timestamp checked within 5-minute window (with -60s future tolerance). `PublicKey.isOnCurve()` check runs. Sets `client.isAuthenticated = true` and `client.walletAddress`. JWT token generated and returned but never subsequently validated by the server on any subsequent event — it is purely informational to the client.

**Residual Issues:**
- `atob()` is used for base64 decoding in `verifyWalletSignature` (line 47): `Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0))`. This is a browser API, not Node.js native. Works in Node 18+ but is nonstandard and could fail in older runtimes.
- Auth message replay within the 5-minute window is possible. There is no nonce stored per wallet to prevent replay of a captured `{message, signature}` pair.
- JWT is never validated. If the server intended to use JWTs for stateless auth on reconnect, this is dead code.

### 1.2 `requireAuth` Guard (`guards.js`)

```javascript
export function requireAuth(client, eventName) {
    if (!client.isAuthenticated) {
        client.emit(`${eventName}Error`, { reason: 'Authentication required' });
        return false;
    }
    return true;
}
```

**Analysis:** Simple boolean check against `client.isAuthenticated`. This flag is set by `handleAuthenticate` and also set to `true` during `rejoinRoom`. It is never unset during the session lifetime (not cleared on disconnect of the original socket — the new socket gets its own connection closure). This is correct behavior.

**Coverage of `requireAuth`:** Applied to 16 out of 26 socket events. Not applied to: `leaveRoom`, `weaponPick`, `getWeaponArray`, `shoot` (legacy), `weaponChange`, `angleChange`, `powerChange`, `giveTurn`, `leaveQueue`, `getRooms`, `getShotInfo`, `getStats`.

### 1.3 Wallet Identity Binding

**In `createRoom`:**
```javascript
// H002: ONLY use server-verified wallet — never trust client payload
const walletAddress = authenticatedWallets[client.id] || null
```

**In `joinRoom`:**
```javascript
// H002: ONLY use server-verified wallet — never trust client payload
const joinerWallet = authenticatedWallets[client.id] || null
```

**Assessment:** Wallet addresses stored in `wagerStates` now come exclusively from `authenticatedWallets[client.id]`, which is populated by `handleAuthenticate`. The prior vulnerability (client-payload wallet override) has been fixed.

---

## 2. Per-Event Access Control Analysis

### Event: `authenticate`
- **Expected callers:** Any socket
- **Auth check:** None (this IS auth)
- **State check:** None
- **Assessment:** Correct. No issue.

---

### Event: `createRoom`
- **Expected callers:** Any authenticated socket (for free games), authenticated + wallet-verified socket (for wager games)
- **Auth check:** `if (wagerAmount > 0 && !requireAuth(client, 'createRoom')) return` — auth only for wagered rooms. Free rooms need no auth.
- **Wallet binding:** `authenticatedWallets[client.id]` — correct.
- **Wager validation:** `Number.isFinite(wagerAmount) || wagerAmount < 0` check exists. `isValidWager()` validates tier. `validateMatchMode()` validates mode+wager+format.
- **Balance check:** `verifyBalance()` called for creator when wagered. Catch block skips on RPC error — still a fail-soft (skip, not reject). This is a residual from the old fail-open behavior. RPC failure means a zero-balance creator can create a wagered room.
- **Assessment:** MEDIUM — creator balance check fails soft on RPC error.

---

### Event: `joinRoom`
- **Expected callers:** Any socket (for free games), authenticated socket for wagered games
- **Auth check:** `if (roomWager > 0 && !requireAuth(client, 'joinRoom')) return`
- **Balance check:** `verifyBalance()` called. Catch block now logs but does NOT fail open — wait, checking:

```javascript
try {
    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
    if (!balanceCheck.sufficient) {
        client.emit('joinRoomError', { ... })
        return
    }
} catch (err) {
    console.warn('[Solana] Balance check skipped:', err.message)
}
```

The catch block skips the check — this IS fail-soft. RPC error allows a zero-balance joiner to enter. Comment references `H027` fix but the catch still allows bypass.

- **Assessment:** HIGH — joiner balance check fails soft on RPC error.

---

### Event: `joinQueue`
- **Expected callers:** Any socket wanting matchmaking
- **Auth check:** `if (wagerAmount > 0 && !requireAuth(client, 'joinQueue')) return` — correct for the joining socket.
- **Balance check:** None for the JOINING socket at queue time. None for the opponent who gets paired.
- **Critical gap:** When two players are matched:

```javascript
wagerStates[roomId] = {
    amount: wagerAmount,
    wallets: {
        [opponent.socketId]: opponent.wallet,  // from queue entry — no fresh balance check
        [client.id]: authenticatedWallets[client.id] || null,
    },
};
```

Neither the opponent (who has been waiting in queue) nor the joiner has their balance re-verified at match-creation time. A player could join the queue with 0.1 SOL and have those SOL drain away while waiting. When matched, no live balance check occurs.

- **Assessment:** CRITICAL — wagered queue matches skip all balance verification at match creation time.

---

### Event: `deleteRoom`
- **Expected callers:** Host only
- **Auth check:** `requireAuth` — YES
- **Host check:** `if (!client.isHost) { ... return }` — YES

```javascript
client.on('deleteRoom', async () => {
    if (!requireAuth(client, 'deleteRoom')) return
    if (client.roomId !== null) {
        if (!client.isHost) {
            client.emit('deleteRoomError', { reason: 'Only host can delete room' })
            return
        }
        const ms = matchStates[client.roomId]
        if (ms && ms.status === MATCH_STATES.SETTLING) {
            client.emit('deleteRoomError', { reason: 'Cannot delete room during settlement' })
            return
        }
        ...
    }
})
```

- **Assessment:** OK. Auth + host-only + settlement guard are all present.

---

### Event: `leaveRoom`
- **Expected callers:** Room member who wants to leave
- **Auth check:** NONE — `client.on('leaveRoom', async () => { await cleanupRoom(client, io, 'leave') })`
- **Issue:** Any unauthenticated socket that is in a room (e.g., a free-game participant who never authenticated) can call `leaveRoom`. `cleanupRoom` will then potentially trigger wager forfeit settlement with the leavers's `client.id` used to look up `ws.wallets[client.id]`. Since `ws.wallets` for wagered games is populated only from `authenticatedWallets`, `ws.wallets[unauthenticated_client.id]` would be `null`. The settlement path then hits the `else` branch — `transitionState(currentMs, MATCH_STATES.CANCELLED)` — no actual settlement. So financial damage is minimal but room destruction without auth is a DoS vector.
- **Assessment:** MEDIUM — unauthenticated leave causes room teardown. In a wagered game where an unauthenticated spectator somehow got into the room, this would forfeit the room. In practice, wagered rooms require both players to authenticate, so this is low likelihood but should be guarded.

---

### Event: `rejoinRoom`
- **Expected callers:** A previously-connected player who disconnected
- **Auth check:** Performs fresh Ed25519 signature verification:

```javascript
const msgCheck = verifyAuthMessage(message, walletAddress, timestamp)
if (!msgCheck.valid) { ... return }
const sigCheck = verifyWalletSignature(walletAddress, message, signature)
if (!sigCheck.valid) { ... return }
```

- **Critical gap:** The `walletAddress` from the payload is used as the lookup key for `pendingReconnects[walletAddress]`. There is no pre-existing binding check — the new socket was not previously authenticated. The flow is:
  1. New socket connects.
  2. New socket sends `rejoinRoom` with `walletAddress = someAddress`.
  3. Server verifies the signature against `someAddress`.
  4. Server checks `pendingReconnects[someAddress]`.
  5. If found, new socket inherits the old session.

  This is actually correct design — the signature proves ownership of `someAddress`. The issue is that at step 1-3, the new socket has `client.isAuthenticated = false`. After `rejoinRoom` completes, it is set to `true`. There is no window where an unauthenticated rejoin can steal state because the sig check happens before session restoration.

- **Minor note:** `pendingReconnects` is keyed by wallet address. If two different wallets both disconnect from two different rooms simultaneously, and a third party can predict a wallet address and generate a valid signature (impossible without the private key), they could rejoin. This is not a vulnerability — sig verification is the gate.
- **Assessment:** OK. The signature re-verification before session restoration is correct.

---

### Event: `ready`
- **Expected callers:** Both players in a room
- **Auth check:** `requireAuth` — YES
- **State check:** `validateAction(msReady.status, 'ready')` — YES
- **Room-member check:** Implicit via `client.roomId` + `findRoom`
- **Assessment:** OK.

---

### Event: `buyWeapon`
- **Expected callers:** Any player during shop phase
- **Auth check:** `requireAuth` — YES
- **State check:** `validateAction(ms.status, 'buyWeapon')` — YES
- **Ownership:** Checks if already in inventory. Gold spending enforced server-side via `spendGold`. Weapon existence via `getWeapon(weaponId)`.
- **Assessment:** OK.

---

### Event: `shopDone`
- **Expected callers:** Any player during shop phase
- **Auth check:** `requireAuth` — YES
- **State check:** `validateAction(ms.status, 'shopDone')` — YES
- **Room-member check:** Implicit
- **Assessment:** OK.

---

### Event: `fire`
- **Expected callers:** Current-turn player during battle
- **Auth check:** Inline check: `if (!this.isAuthenticated) { this.emit('fireRejected', ...) return }`
- **State check:** `validateAction(ms.status, 'fire')` — YES
- **Turn check:** `if (ms.currentTurn && ms.currentTurn !== this.id)` — YES, enforced
- **Weapon ownership:** `if (!inventory[this.id].includes(weaponId))` — YES

**Residual concern — position tolerance:**
```javascript
if (data.position && typeof data.position === 'object' &&
    Number.isFinite(data.position.x) && Number.isFinite(data.position.y)) {
    const dx = Math.abs(data.position.x - serverPos.x)
    const dy = Math.abs(data.position.y - serverPos.y)
    if (dx <= 400 && dy <= 200) {
        startX = data.position.x
        startY = data.position.y
    }
}
```

The fire shot trajectory is computed from `startX/startY`, which can be up to 400px from the server-authoritative position. At 4 steps × 80px = 320px maximum legitimate movement, a 400px tolerance allows ~80px of additional spoofed X position. This extends effective firing range.

**Sequence/nonce check:**
```javascript
const clientSeq = data.seq
if (clientSeq !== undefined) {
    if (clientSeq !== ms.turnSequence) {
        this.emit('fireRejected', { reason: 'Turn sequence mismatch (possible replay)' })
        return
    }
}
```

The nonce check is conditional on the client providing `seq`. If the client omits `seq`, no replay check occurs. A cheating client can simply omit the `seq` field.

- **Assessment:** HIGH — fire position tolerance allows ~80px range extension; nonce check is opt-in (client can omit `seq` to bypass replay protection).

---

### Event: `createWeaponArray`
- **Expected callers:** Host only (by game design — creates the shared weapon randomization array)
- **Auth check:** `requireAuth` — YES
- **Host check:** NONE

```javascript
client.on('createWeaponArray', (data) => {
    if (!requireAuth(client, 'createWeaponArray')) return
    ...
    room.randomArray = randomArray
    persistRoom(room);
    io.sockets.in(client.roomId).emit('setWeaponArray', {randomArray: room.randomArray})
})
```

Player 2 (non-host) can call `createWeaponArray` and overwrite `room.randomArray` at any time (even during weapon pick phase). Both players then receive the new array. In wagered games this allows the non-host player to influence weapon draw outcomes.

- **Assessment:** CRITICAL — non-host players can overwrite the weapon randomization array.

---

### Event: `weaponPick`
- **Expected callers:** Either player during weapon pick phase
- **Auth check:** NONE
- **State check:** NONE
- **Room-member check:** NONE explicitly — `client.to(client.roomId)` scopes to room, but `client.roomId` could be null or any value

```javascript
client.on('weaponPick', (data) => {
    if (!data || typeof data !== 'object') return
    const { arrayIndex } = data
    client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
})
```

If `client.roomId` is null, `client.to(null)` would emit to room `null` — not typically harmful but undefined behavior. There is no authentication or state validation. Any socket (including unauthenticated) can inject `opponentWeaponPick` events to their opponent.

- **Assessment:** HIGH — unauthenticated relay, no state check. Allows spoofing opponent weapon pick display.

---

### Events: `weaponChange`, `angleChange`, `powerChange`

Same pattern as `weaponPick`. No auth, no state check, pure relay. These are UI relay events (opponent angle/power display), so financial impact is low, but they allow any room member to spam the opponent's UI with fake state changes.

- **Assessment:** MEDIUM — unauthenticated relays; UI disruption potential.

---

### Event: `shoot` (legacy relay)
- **Auth check:** NONE
- **State check:** `if (ms && !validateAction(ms.status, 'shoot')) return` — partial: checks state but not auth or turn ownership
- **Payload sanitization:** Numeric field validation exists: `if (!Number.isFinite(power) || !Number.isFinite(rotation)) return`
- **Assessment:** MEDIUM — no auth guard on a legacy shoot relay. A non-turn player can send this during battle to display a phantom shot on the opponent's screen.

---

### Event: `giveTurn` (legacy relay)
- **Auth check:** NONE
- **State check:** NONE
- **Assessment:** MEDIUM — fully unauthenticated relay. No meaningful financial impact (physics not run server-side from this), but UI injection is possible.

---

### Event: `requestTerrain`
- **Auth check:** `requireAuth` — YES
- **Room-member check:** Implicit via `client.roomId` + `findRoom`
- **Generator control:** First call generates; subsequent calls re-send cache. No host-only restriction — either player can request. This is intentional (both need terrain data).
- **Issue:** Either player can reset the terrain by... wait, they cannot. Once `room._terrainCache` is set, subsequent calls return the cache. Only the first caller triggers generation. No auth gap here.
- **Assessment:** OK.

---

### Event: `positionUpdate`
- **Auth check:** `requireAuth` — YES
- **Bounds validation:** x clamped [0, 1199], y clamped [0, 800]
- **Distance validation (battle only):** `dx > 400 || dy > 200` rejected — mitigates teleportation
- **Owner check:** Position is written only to `room.host.pos` if `room.host.socketId === client.id`, otherwise to `room.player.pos`. You cannot update the opponent's position.
- **Assessment:** OK. Well-guarded.

---

### Events: `stepLeft`, `stepRight`
- **Auth check:** `requireAuth` — YES
- **State check:** `validateAction(ms.status, 'stepLeft')` — YES
- **Turn check:** `if (ms && ms.currentTurn && ms.currentTurn !== client.id) return` — YES
- **Move limit:** `ms.moveCounts[client.id] >= 4` — YES, server-enforced
- **Assessment:** OK.

---

### Event: `escrowDepositConfirm`
- **Auth check:** `requireAuth` — YES
- **Room isolation:** `if (client.roomId !== rid) { client.emit('escrowError', { reason: 'Room ID mismatch' }); return }` — YES
- **On-chain verification (when escrow enabled):**

```javascript
if (isEscrowEnabled()) {
    // Verifies deposit on-chain via getEscrowState
    const depositConfirmed = isHost ? escrowState.playerOneDeposited : escrowState.playerTwoDeposited
    if (!depositConfirmed) { client.emit('escrowError', ...); return }
    // Verifies wager amount matches
    if (escrowState.wagerLamports !== expectedLamports) { client.emit('escrowError', ...); return }
}
// If escrow not enabled (dev mode), skip verification
```

**Gap — dev mode double-confirm:** In dev mode (`isEscrowEnabled()` = false), the on-chain checks are skipped. `ws.deposits[client.id] = txSignature` is set. A single socket can call `escrowDepositConfirm` twice with different `txSignature` values:
- First call: `ws.deposits[client.id] = 'sig1'`
- Second call: `ws.deposits[client.id] = 'sig2'` (overwrites)

More importantly, `hostDeposited` checks `ws.deposits[room.host?.socketId]` and `playerDeposited` checks `ws.deposits[room.player?.socketId]`. If host and player are different socket IDs, a single socket cannot confirm for both. So in production (escrow enabled), the on-chain guard prevents fraud. In dev mode, two different sockets in the same room can each confirm once — correct. The double-confirm concern only applies if the same socket could be both host and player, which is prevented by room joining logic.

- **Assessment:** OK in production. Minor gap in dev mode (but dev mode is not financial).

---

### Event: `playAgainRequest`
- **Auth check:** `requireAuth` — YES
- **State check:** `validateAction(ms.status, 'playAgainRequest')` — YES (only allowed during COMPLETE or ROUND_END)
- **Host/player identity:** Checked via `client.isHost`
- **Assessment:** OK.

---

### Event: `getShotInfo`
- **Auth check:** NONE — uses `authenticatedWallets[client.id] || null`
- **Safe default:** Returns zeroed data for unauthenticated callers
- **Assessment:** LOW — no auth guard but no sensitive data leak.

---

### Event: `getStats`
- **Auth check:** NONE — uses `authenticatedWallets[client.id] || null`
- **Safe default:** Returns zeroed stats for unauthenticated callers
- **Assessment:** LOW — same as getShotInfo.

---

### Event: `prestigeBurn`
- **Auth check:** `const wallet = authenticatedWallets[client.id] || null; if (!wallet) { ... return }`
- **On-chain verification:** `verifyBurnTransaction(txSignature, wallet, burnAmount)` — verifies mint, signer, amount, replay protection via in-memory Set
- **Assessment:** OK. Implicit auth via wallet lookup. On-chain verification is the real guard.

---

## 3. Settlement Authority Analysis

### Who Can Trigger Settlement

Settlement (`settleMatch` in `solana.js`, which calls `settleMatchEscrow` in `escrow.js`) is called from:

1. **`fire` handler** — inside `withLock('settle:${roomId}')` after `isMatchOver()` returns true. Only the current-turn player's fire event triggers this. No client parameter is accepted.
2. **`cleanupRoom`** — called from `disconnect` and `leaveRoom`. Winner determined by server-state (HP, scores, roundWins). No client parameter.
3. **`startTurnTimer`** forfeit path — called from server setTimeout, not from any client event. Winner is the non-timedout player.

In all cases, the winner address is read from `wagerStates[roomId].wallets[winnerId]`, where `winnerId` is a socket ID computed from server state, and `wagerStates[roomId].wallets` was populated from `authenticatedWallets` (server-verified) at room join time.

**No socket event directly accepts a "winner" parameter that would be used in settlement.**

### Escrow Authority Enforcement

`settleMatchEscrow` signs with `getEscrowKeypair().publicKey` as `authority`. The on-chain Anchor program enforces:
```rust
constraint = escrow.authority == authority.key() @ SolShotError::Unauthorized
```

This means even if a client somehow triggered the settlement call (which they cannot via socket), the transaction would fail on-chain unless signed by the server keypair.

**Assessment: Settlement authority is correctly server-only. This is the strongest part of the access control design.**

---

## 4. HTTP Route Authorization

From `server/index.js`:

```javascript
app.get('/', (req, res) => { res.send('SolShot server running') })        // Public — OK
app.get('/health', healthCheck)                                             // Public — OK (status only)
app.get('/stats', requireAdminKey, getStats)                               // Admin key required — OK
app.post('/api/admin/reload-keys', requireAdminKey, ...)                   // Admin key required — OK
```

`requireAdminKey` checks `req.headers['x-admin-key'] === process.env.ADMIN_API_KEY`. If `ADMIN_API_KEY` is not set in env, the check always returns 401 (correctly — the guard returns 401 when `!process.env.ADMIN_API_KEY`). This means an unconfigured deployment denies all admin access safely.

**Assessment: HTTP routes are properly protected.**

---

## 5. Cross-Room Isolation

Socket.IO room isolation: Emit calls use `client.to(client.roomId)` or `io.sockets.in(roomId)`. Since `client.roomId` is set by `createRoom`/`joinRoom` (server-controlled), a socket cannot emit to rooms it hasn't joined via the server path.

**Gap — relay events:** The relay events (`weaponPick`, `weaponChange`, etc.) use `client.to(client.roomId)`. If `client.roomId` is legitimately set (socket is in a room), these work correctly in terms of room isolation — the relay goes only to the actual room members. The issue is lack of authentication and state validation, not cross-room leakage.

**`escrowDepositConfirm` cross-room check:**
```javascript
if (client.roomId !== rid) {
    client.emit('escrowError', { reason: 'Room ID mismatch' })
    return
}
```
This prevents a socket from confirming deposits for a room it is not in. Correct.

---

## 6. Findings Summary Table

| ID | Severity | Event/Component | Description |
|---|---|---|---|
| AUTH-03-C1 | CRITICAL | `joinQueue` | No balance verification for either matched player at match-creation time |
| AUTH-03-C2 | CRITICAL | `createWeaponArray` | Non-host players can overwrite weapon randomization array |
| AUTH-03-C3 | CRITICAL | `fire` | Nonce/seq check is opt-in — client can omit `seq` field to bypass replay protection |
| AUTH-03-C4 | CRITICAL | `fire` | Shot origin accepts client-supplied position up to 400px from server position, extending firing range |
| AUTH-03-H1 | HIGH | `leaveRoom` | No `requireAuth` guard — unauthenticated socket can force room teardown |
| AUTH-03-H2 | HIGH | `joinRoom` | Balance check fails soft on RPC error — zero-balance joiner bypasses on RPC outage |
| AUTH-03-H3 | HIGH | `createRoom` | Creator balance check fails soft on RPC error |
| AUTH-03-H4 | HIGH | `weaponPick` | No auth, no state check — any room member can inject fake weapon picks |
| AUTH-03-H5 | HIGH | `shoot` (legacy) | No auth guard on shoot relay — non-turn player can inject phantom shots to opponent UI |
| AUTH-03-H6 | HIGH | `rejoinRoom` | No pre-existing auth binding check on new socket before sig verification runs |
| AUTH-03-M1 | MEDIUM | `weaponChange` | Unauthenticated relay, UI disruption |
| AUTH-03-M2 | MEDIUM | `angleChange` | Unauthenticated relay, UI disruption |
| AUTH-03-M3 | MEDIUM | `powerChange` | Unauthenticated relay, UI disruption |
| AUTH-03-M4 | MEDIUM | `giveTurn` | Fully unauthenticated legacy relay |
| AUTH-03-M5 | MEDIUM | `leaveRoom` | Unauthenticated leave can destroy wagered room state |
| AUTH-03-L1 | LOW | `getShotInfo` | No auth guard (safe default prevents leak) |
| AUTH-03-L2 | LOW | `getStats` | No auth guard (safe default prevents leak) |

### Positive Findings (Correctly Implemented)

| Feature | Location | Status |
|---|---|---|
| Settlement authority | `escrow.js:settleMatchEscrow` | CORRECT — server keypair only |
| Turn enforcement | `main.js fire handler` | CORRECT — `ms.currentTurn !== this.id` |
| Weapon ownership | `main.js fire handler` | CORRECT — inventory check |
| Host-only delete | `main.js deleteRoom` | CORRECT — `client.isHost` check |
| Wallet binding | `createRoom`, `joinRoom` | CORRECT — `authenticatedWallets` only |
| Settlement lock | `cleanupRoom`, fire handler | CORRECT — `withLock` prevents double-settle |
| Cross-room escrow isolation | `escrowDepositConfirm` | CORRECT — `client.roomId !== rid` check |
| Position teleportation guard | `positionUpdate` | CORRECT — 400/200px bounds |
| Move-count enforcement | `stepLeft`, `stepRight` | CORRECT — server-side counter |
| Admin HTTP routes | `index.js` | CORRECT — `requireAdminKey` on stats + reload |

---

## 7. Recommended Remediations

**AUTH-03-C1 (joinQueue balance):** Re-verify balance for BOTH players at the moment of queue match creation, not only at queue-entry time.

**AUTH-03-C2 (createWeaponArray host-only):** Add `if (!client.isHost) return` after the `requireAuth` check.

**AUTH-03-C3 (nonce bypass):** Change `if (clientSeq !== undefined)` to `if (ms.turnSequence > 0)` — make the seq check mandatory after the first turn has started.

**AUTH-03-C4 (fire position tolerance):** Reduce tolerance from 400px to the actual max movement distance: 4 steps × 80px = 320px horizontal, plus a small margin (e.g., 340px). Alternatively, use the server `moveCounts` tracker to compute exact valid range.

**AUTH-03-H1 (leaveRoom auth):** Add `if (!requireAuth(client, 'leaveRoom')) return` to `leaveRoom`.

**AUTH-03-H2/H3 (balance fail-soft):** Change balance check catch block to emit an error and return, rather than silently continuing.

**AUTH-03-H4/H5 (relay events):** Add `if (!requireAuth(client, 'weaponPick')) return` and `if (!validateAction(ms?.status, 'weaponPick')) return` to all relay events. Consider adding turn-ownership check to `shoot` relay.

**AUTH-03-H6 (rejoinRoom binding):** Before allowing rejoin, confirm that the incoming wallet from the payload exists in `pendingReconnects` AND that the old socket ID in `pendingReconnects[wallet].oldSocketId` was itself authenticated. This is already guaranteed by the 30s window only being set for authenticated wallets in the disconnect handler — but make the invariant explicit with an assertion.
