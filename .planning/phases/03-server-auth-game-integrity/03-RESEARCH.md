# Phase 3: Server Auth & Game Integrity - Research

**Researched:** 2026-02-22
**Domain:** Socket.IO server security hardening (auth guards, Ed25519 reconnect verification, server-authoritative game state)
**Confidence:** HIGH

---

## Summary

Phase 3 fixes 6 discrete server-side vulnerabilities all located in `server/socket-io/main.js`. All research was conducted by direct code inspection of the live codebase — no external library research required, since the fix patterns either already exist in the codebase or are one-line additions.

The core pattern is already established: `requireAuth(client, 'handlerName')` from `server/middleware/guards.js` exists and works correctly. `handleAuthenticate` from `server/middleware/auth.js` already does full Ed25519 verification via nacl. The `authenticate` socket handler already does it right. The `fire` handler already does turn-ownership checking (`ms.currentTurn !== this.id`). All 6 fixes are mechanical applications of patterns that already exist.

The only non-trivial fix is SA-02 (rejoin Ed25519 re-verification), which requires understanding the client-side rejoin flow before deciding the approach. The client currently sends only `{ walletAddress }` — the server will need to either (a) issue a nonce at disconnect time that the client signs, or (b) require a fresh Ed25519 signature using the same message format as the initial `authenticate` handler.

**Primary recommendation:** All 6 SAs are one-file changes to `server/socket-io/main.js`. Apply them in order SA-01 through SA-06. SA-02 is the only one requiring a client-side change (App.js `attemptRejoin` function must send a signature alongside walletAddress).

---

## Standard Stack

This phase uses no new libraries. Everything needed is already installed and used.

### Already In Use
| Component | Purpose | Location |
|-----------|---------|----------|
| `requireAuth(client, name)` | Gate handlers behind `client.isAuthenticated` | `server/middleware/guards.js:24-30` |
| `handleAuthenticate(client, data)` | Full Ed25519 signature verification | `server/middleware/auth.js:127-148` |
| `verifyWalletSignature(wallet, msg, sig)` | nacl.sign.detached.verify | `server/middleware/auth.js:38-65` |
| `verifyAuthMessage(msg, wallet, ts)` | Format + timestamp validation | `server/middleware/auth.js:75-88` |
| `ms.currentTurn` | Turn ownership tracking | `server/services/match.js` |
| `MATCH_STATES` | State machine constants | `server/services/match.js` |
| `client.roomId` | Socket's current room | Set on join, used as implicit room validation |
| `authenticatedWallets[client.id]` | Server-verified wallet map | `server/socket-io/main.js:44` |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Handler List: Auth Status (SA-01 scope)

All 30 socket event handlers and their current auth guard status:

| Handler | Has requireAuth? | Touches Financial/Game State? | Needs Guard? |
|---------|-----------------|-------------------------------|--------------|
| `authenticate` | N/A (is the auth handler) | No | N/A |
| `disconnect` | No | Triggers settlement | No (system event) |
| `leaveRoom` | No | Triggers settlement | No (cleanup only) |
| `deleteRoom` | No | Destroys room/wager | Needs guard |
| `joinRoom` | YES (wagered only) | Yes | Partial — already OK |
| `getRooms` | No | Read-only | Not needed |
| `createRoom` | YES (wagered only) | Yes | Partial — already OK |
| `joinQueue` | No | Creates wagered match | Needs guard (wagered) |
| `leaveQueue` | No | Queue state | Not needed |
| `ready` | No | Transitions match state | Needs guard |
| `buyWeapon` | No | Gold economy | Needs guard |
| `shopDone` | No | Match state transition | Needs guard |
| `getShotInfo` | No | Read-only, gracefully handles no wallet | Not needed |
| `getStats` | No | Read-only, gracefully handles no wallet | Not needed |
| `prestigeBurn` | No — BUT wallet check at line 1460 | Financial | Already safe (wallet null check) |
| `weaponPick` | No | Visual relay | Not needed |
| `getWeaponArray` | No | Read-only state | Not needed |
| `createWeaponArray` | No | Generates weapon array | Needs guard |
| `shoot` | No | Visual relay (LEGACY) | Low risk (relay only) |
| `escrowDepositConfirm` | NO | FINANCIAL — escrow | CRITICAL needs guard |
| `fire` | No — BUT turn check guards it | Game state + Gold | Needs guard |
| `requestTerrain` | No | Generates terrain | Needs guard |
| `weaponChange` | No | Visual relay | Not needed |
| `angleChange` | No | Visual relay | Not needed |
| `powerChange` | No | Visual relay | Not needed |
| `positionUpdate` | No | Server position state | Needs guard + distance check |
| `terrainPath` | No | Overwrites heightmap | Needs removal/gate |
| `getTerrainPath` | No | Read-only | Not needed |
| `stepLeft` | No — BUT validateAction | Server position + turns | Needs guard + turn check |
| `stepRight` | No — BUT validateAction | Server position + turns | Needs guard + turn check |
| `giveTurn` | No | LEGACY relay | Not needed |
| `requestTurn` | No | Turn relay | Needs guard |
| `playAgainRequest` | No | Match state reset | Needs guard |
| `rejoinRoom` | No | Session restoration + auth bypass | CRITICAL needs Ed25519 |

**Handlers that SA-01 should guard (financial/game state impact):**
`deleteRoom`, `ready`, `buyWeapon`, `shopDone`, `escrowDepositConfirm`, `fire`, `requestTerrain`, `positionUpdate`, `stepLeft`, `stepRight`, `requestTurn`, `playAgainRequest`, `createWeaponArray`

**Note on `joinQueue` wagered path:** Should require auth when `wagerAmount > 0`, mirroring the existing `createRoom` / `joinRoom` pattern.

### Pattern 1: requireAuth Guard (SA-01)

The existing pattern from `guards.js`:

```javascript
// Source: server/middleware/guards.js:24-30
export function requireAuth(client, eventName) {
    if (!client.isAuthenticated) {
        client.emit(`${eventName}Error`, { reason: 'Authentication required' });
        return false;
    }
    return true;
}
```

Usage is a one-liner guard at the top of any handler:

```javascript
// Source: server/socket-io/main.js:882 (existing usage)
if (!requireAuth(client, 'joinRoom')) return
```

The `eventName` parameter determines the error event name emitted to the client (e.g., `'fire'` emits `'fireError'`). Match the handler name exactly.

### Pattern 2: Ed25519 Re-verification on Rejoin (SA-02)

The `authenticate` handler already does the full flow:

```javascript
// Source: server/middleware/auth.js:127-148
export function handleAuthenticate(client, { walletAddress, message, signature, timestamp }) {
    const msgCheck = verifyAuthMessage(message, walletAddress, timestamp);
    if (!msgCheck.valid) return { success: false, reason: msgCheck.reason };
    const sigCheck = verifyWalletSignature(walletAddress, message, signature);
    if (!sigCheck.valid) return { success: false, reason: sigCheck.reason };
    const token = generateToken(walletAddress);
    client.walletAddress = walletAddress;
    client.isAuthenticated = true;
    return { success: true, token, walletAddress };
}
```

The message format is: `"SolShot Auth: ${walletAddress} at ${timestamp}"` (auth.js:76).

For rejoin, the server already knows which wallet address is allowed (keyed by `pendingReconnects[walletAddress]`). The rejoin handler should:
1. Verify the payload includes `walletAddress`, `message`, `signature`, `timestamp`
2. Call `verifyAuthMessage` and `verifyWalletSignature` using the existing helpers
3. Only restore `client.isAuthenticated = true` after successful verification
4. If verification fails, emit `rejoinError` and do NOT cancel the disconnect timer

**Client-side change required:** `App.js` at line 55:
```javascript
// CURRENT (App.js:52-57) — must be changed:
const attemptRejoin = () => {
    const walletAddress = window.solWallet?.publicKey?.toString();
    if (walletAddress) {
        window.socket.emit('rejoinRoom', { walletAddress });  // NO signature
    }
};
```

The client needs to call `signMessage` before emitting rejoinRoom. The WalletContext `authenticate` callback (WalletContext.js:111-144) shows the full pattern. `attemptRejoin` must be made async and call `window.solWallet.signMessage`.

### Pattern 3: terrainPath Removal/Gating (SA-03)

The `requestTerrain` handler (line 2109) now generates terrain server-side via `generateTerrain()`. The `terrainPath` handler is a legacy relay that overwrites `room.heightmap` with client-supplied data.

Two options:
- **Option A (preferred by spec):** Delete the handler entirely (lines 2213-2269). The `getTerrainPath` handler (lines 2273-2278) can remain as a read-only relay. But since `requestTerrain` now handles full terrain generation and broadcast, `getTerrainPath` may also be vestigial.
- **Option B (gate to pre-BATTLE host-only):** Add state check + host check at the top of `terrainPath`.

The spec says "remove entirely or restrict to pre-BATTLE states and host-only." Given that `requestTerrain` now handles terrain generation authoritatively, Option A (delete) is cleaner. The client should not need to send terrain data at all anymore.

**Risk assessment:** Deleting `terrainPath` may break clients that still send it. Since the client sends `requestTerrain` and receives `terrainGenerated`, the `terrainPath` handler is only a vestige of the old flow. Safe to delete.

### Pattern 4: Fire Handler Position Fix (SA-04)

Current behavior at lines 1724-1734:
```javascript
// Current code — VULNERABLE (writes client position back to server state)
if (data.position && typeof data.position === 'object' &&
    Number.isFinite(data.position.x) && Number.isFinite(data.position.y)) {
    const dx = Math.abs(data.position.x - serverPos.x)
    const dy = Math.abs(data.position.y - serverPos.y)
    if (dx <= 400 && dy <= 200) {
        startX = data.position.x
        startY = data.position.y
        serverPos.x = startX    // <-- THIS IS THE VULNERABILITY
        serverPos.y = startY    // <-- THIS IS THE VULNERABILITY
    }
}
```

Fix: Remove lines 1731-1732 (`serverPos.x = startX` and `serverPos.y = startY`). Use server position for authoritative state; client position only for the physics calculation on this shot.

For `positionUpdate` (lines 2195-2211), add a distance check:
```javascript
client.on('positionUpdate', (data) => {
    if (!data || typeof data !== 'object') return
    const { x, y } = data
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const clampedX = Math.min(1199, Math.max(0, x))
    const clampedY = Math.min(800, Math.max(0, y))
    var room = findRoom(client.roomId)
    if (!room) return
    // ADD: distance validation against server position (4 steps * 80px = 320px + margin)
    const pos = (room.host && room.host.socketId === client.id) ? room.host.pos : room.player?.pos
    if (pos) {
        const dx = Math.abs(clampedX - pos.x)
        const dy = Math.abs(clampedY - pos.y)
        if (dx > 400 || dy > 200) return  // reject teleport attempts
    }
    // ... rest of handler
```

### Pattern 5: Turn Ownership in Step Handlers (SA-05)

The `fire` handler already has this check at line 1674:
```javascript
// Source: server/socket-io/main.js:1674
if (ms.currentTurn && ms.currentTurn !== this.id) {
    this.emit('fireRejected', { reason: 'Not your turn' })
    return
}
```

Add the equivalent to `stepLeft` (line 2282) and `stepRight` (line 2314), immediately after the `validateAction` check:
```javascript
client.on('stepLeft', () => {
    if (!client.roomId) return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'stepLeft')) return
    // ADD: turn ownership check (mirrors fire handler at main.js:1674)
    if (ms && ms.currentTurn && ms.currentTurn !== client.id) return
    // ... rest of handler
```

### Pattern 6: Cross-Room Isolation (SA-06)

Handlers that accept client-supplied `roomId`:
- `escrowDepositConfirm` (line 1569): extracts `roomId: rid` from payload
- `joinRoom` (line 865): extracts `roomId` from payload
- Possibly `giveTurn` data relay

The check to add: verify the client is actually in the supplied room.

```javascript
// Pattern: validate supplied roomId against socket's actual room
function validateRoomId(client, rid) {
    if (!rid || client.roomId !== rid) {
        return false;
    }
    return true;
}
```

For `escrowDepositConfirm`, add at line 1574:
```javascript
// After: const room = findRoom(rid)
if (!room) return
// ADD: cross-room isolation
if (client.roomId !== rid) {
    client.emit('escrowError', { reason: 'Not your room' })
    return
}
```

For `joinRoom`, the roomId in the payload is the room the client wants to JOIN (not their current room), so the validation is different — the client should NOT already be in that room. The check at line 870 (`if (client.roomId === roomId) return`) already handles this correctly. No change needed for `joinRoom`.

### Anti-Patterns to Avoid

- **Writing a separate auth middleware:** The inline `requireAuth(client, name)` pattern is already established. Do not add Socket.IO middleware (the `io.use()` pattern) — it only runs at connection time, not per-event.
- **Checking `authenticatedWallets[client.id]` instead of `client.isAuthenticated`:** Use `requireAuth()` which checks `client.isAuthenticated`. The `authenticatedWallets` map is for wallet address lookup only.
- **Cancelling the disconnect timer on rejoin failure:** If Ed25519 re-verification fails during `rejoinRoom`, the disconnect timer should NOT be cancelled. The timer should keep running so the forfeit path still executes if the legitimate player does not reconnect.
- **Using `io.sockets.in(roomId)` membership checks:** Socket.IO room membership is separate from `client.roomId`. Use `client.roomId !== rid` (the stored property), not `io.sockets.adapter.rooms.get(rid)?.has(client.id)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ed25519 verification | Custom crypto | `verifyWalletSignature()` in auth.js | Already production-tested, uses nacl |
| Auth message format/timing | Custom format | `verifyAuthMessage()` in auth.js | Timestamp replay protection already included |
| Auth guard function | Inline `if (!client.isAuthenticated)` | `requireAuth(client, name)` from guards.js | Handles error emission, consistent naming |
| Room membership | `io.sockets.adapter.rooms` | `client.roomId !== rid` | Simpler, already maintained throughout |

---

## Common Pitfalls

### Pitfall 1: Breaking the Disconnect Timer on Failed Rejoin

**What goes wrong:** If `rejoinRoom` fails Ed25519 verification, the handler currently calls `delete pendingReconnects[walletAddress]` and `clearTimeout(disconnectTimers[walletAddress])` at lines 733-736. If the verification is added after the null check at line 716-730 but before the timer cancellation, a failed rejoin attempt clears the pending state — meaning the legitimate player can never rejoin even after re-authenticating.

**How to avoid:** Move `delete pendingReconnects` and `clearTimeout` to AFTER successful verification. On failure, emit `rejoinError` and return — leave the pending state intact.

**Warning signs:** Test by: rejoin attempt with wrong signature -> should still be rejoinable with correct signature.

### Pitfall 2: requireAuth Error Event Name Mismatch

**What goes wrong:** `requireAuth(client, 'fire')` emits `'fireError'`. If the client listens for `'fireRejected'` (the existing pattern in the fire handler), the client never sees the auth rejection.

**How to avoid:** For `fire`, the handler already uses `this.emit('fireRejected', ...)`. Use `requireAuth(client, 'fire')` anyway — the client handles both `fireError` (auth) and `fireRejected` (input/state). Or use the existing pattern: `if (!client.isAuthenticated) { this.emit('fireRejected', { reason: 'Authentication required' }); return }`.

**Warning signs:** Test by: unauthenticated socket sends `fire` event — server should emit a rejection event the client can receive.

### Pitfall 3: Client-Side Rejoin Cannot Use signMessage Before Wallet Loads

**What goes wrong:** `App.js:52-56` calls `attemptRejoin` on `socket.on('connect', attemptRejoin)`. At connection time, the wallet adapter may not have loaded yet — `window.solWallet?.signMessage` may be undefined.

**How to avoid:** The rejoin attempt should only fire if `window.solWallet?.signMessage` is available. If not, skip the rejoin attempt (the player will reconnect normally via the lobby). The 30-second window is ample time for the wallet to load and for the user to manually rejoin.

**Warning signs:** `signMessage is not a function` errors in client console during page reload.

### Pitfall 4: positionUpdate During Non-Battle States

**What goes wrong:** Adding a distance validation to `positionUpdate` that references `room.heightmap` may throw if `room.heightmap` is null (pre-battle). The handler runs in LOBBY and WEAPON_SHOP states too (visual sync).

**How to avoid:** Only apply distance validation when `ms && ms.status === MATCH_STATES.BATTLE`.

### Pitfall 5: Deleting terrainPath Breaks Legacy Flow

**What goes wrong:** If the client game (Phaser) still sends `terrainPath` after local terrain generation, deleting the handler means the client's terrain path is never relayed to the opponent. Since `requestTerrain` now broadcasts `terrainGenerated` to both players with identical terrain, the relay is not needed — but verify this in client code before deleting.

**How to avoid:** Search `client/src` for `terrainPath` emit calls to confirm the client no longer sends it.

**Warning signs:** Opponent client shows no terrain after match starts.

---

## Code Examples

### Applying requireAuth (SA-01 standard pattern)

```javascript
// Source: existing pattern at server/socket-io/main.js:882
// Add at top of any handler (BEFORE payload destructuring):

client.on('escrowDepositConfirm', async (data) => {
    if (!requireAuth(client, 'escrowDepositConfirm')) return   // ADD THIS
    if (!data || typeof data !== 'object') return
    // ... rest of handler unchanged
})

client.on('fire', safeHandler(async function(data) {
    if (!requireAuth(this, 'fire')) return   // ADD THIS (note: 'this' not 'client' inside safeHandler)
    // ... rest unchanged
```

### Ed25519 Re-verification in rejoinRoom (SA-02)

```javascript
// Source: uses verifyAuthMessage + verifyWalletSignature from server/middleware/auth.js
client.on('rejoinRoom', (data) => {
    if (!data || !data.walletAddress) {
        client.emit('rejoinError', { reason: 'Missing wallet address' })
        return
    }
    const { walletAddress, message, signature, timestamp } = data

    // H006: Ed25519 re-verification before restoring session
    if (!message || !signature || !timestamp) {
        client.emit('rejoinError', { reason: 'Signature required for rejoin' })
        return
    }
    const msgCheck = verifyAuthMessage(message, walletAddress, timestamp)
    if (!msgCheck.valid) {
        client.emit('rejoinError', { reason: msgCheck.reason })
        return
    }
    const sigCheck = verifyWalletSignature(walletAddress, message, signature)
    if (!sigCheck.valid) {
        client.emit('rejoinError', { reason: sigCheck.reason })
        return
    }

    const pending = pendingReconnects[walletAddress]
    if (!pending) {
        client.emit('rejoinError', { reason: 'No active match to rejoin' })
        return
    }
    // ... rest of handler continues (cancel timer, migrate state, etc.)
```

Note: `verifyAuthMessage` and `verifyWalletSignature` must be imported from `../middleware/auth.js`. Currently only `handleAuthenticate` is imported.

### Client-Side Rejoin with Signature (SA-02 client change)

```javascript
// Source: client/src/App.js:52-57 — CURRENT version, needs signature
// Location: App.js attemptRejoin function

const attemptRejoin = async () => {
    const walletAddress = window.solWallet?.publicKey?.toString();
    const signMessage = window.solWallet?.signMessage;
    if (walletAddress && signMessage) {
        try {
            const timestamp = Date.now();
            const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signature = await signMessage(encodedMessage);
            const signatureBase64 = btoa(String.fromCharCode(...signature));
            window.socket.emit('rejoinRoom', { walletAddress, message, signature: signatureBase64, timestamp });
        } catch (err) {
            // signMessage rejected (wallet not ready or user declined) — skip rejoin
            console.warn('[SolShot] Rejoin signature failed:', err.message);
        }
    }
};
```

### Turn Ownership in Step Handlers (SA-05)

```javascript
// Source: mirror of fire handler pattern at main.js:1674
client.on('stepLeft', () => {
    if (!client.roomId) return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'stepLeft')) return
    // ADD: turn ownership check (H036)
    if (ms && ms.currentTurn && ms.currentTurn !== client.id) return
    // ... rest of handler unchanged
```

### Cross-Room Isolation for escrowDepositConfirm (SA-06)

```javascript
// Source: pattern for cross-room validation
client.on('escrowDepositConfirm', async (data) => {
    if (!requireAuth(client, 'escrowDepositConfirm')) return
    if (!data || typeof data !== 'object') return
    const { roomId: rid, txSignature } = data
    if (!rid || !txSignature || typeof txSignature !== 'string') return

    // H009: Cross-room isolation — verify client is actually in this room
    if (client.roomId !== rid) {
        client.emit('escrowError', { reason: 'Room mismatch' })
        return
    }

    const room = findRoom(rid)
    if (!room) return
    // ... rest of handler unchanged
```

---

## State of the Art

| Old Approach | Current Approach | Phase 3 Change |
|--------------|-----------------|----------------|
| No auth guards on most handlers | Auth guards on 2 of 30 handlers | Auth guards on ~13 key handlers |
| `rejoinRoom` accepts wallet address as sole credential | `rejoinRoom` accepts wallet address as sole credential | Require Ed25519 signature on rejoin |
| `terrainPath` overwrites server heightmap unconditionally | `terrainPath` validates path format but still overwrites heightmap | Delete handler (server generates terrain) |
| Fire handler writes client position back to server state | Fire handler writes client position back to server state | Remove the writeback; server position is authoritative |
| `stepLeft`/`stepRight` check state but not turn ownership | Same | Add turn ownership check |
| `escrowDepositConfirm` accepts any socket's roomId | Same | Validate roomId against client.roomId |

**Status of related prior fixes (Phase 2):**
- `fire` handler: startX/startY are now read from `serverPos` first (H036 partially addressed). The 400px tolerance writeback remains (SA-04 fixes this residual).
- `escrowDepositConfirm`: on-chain verification added (Phase 2). Auth guard missing (SA-01 fixes this).
- `requireAuth` and `verifyWalletSignature`: functions exist, just not applied to enough handlers.

---

## Open Questions

1. **terrainPath client usage**
   - What we know: `requestTerrain` → `terrainGenerated` is the current flow for terrain initialization
   - What's unclear: Does the Phaser client still emit `terrainPath` during gameplay (e.g., after terrain deformation from weapons)?
   - Recommendation: `grep -r "terrainPath" client/src` before deleting. If found, gate to pre-BATTLE + host-only (Option B) instead of deleting.

2. **Window.solWallet.signMessage availability during page reload**
   - What we know: `window.solWallet` is set by WalletContext, which initializes asynchronously
   - What's unclear: Is `signMessage` available synchronously on socket connect? Or does it require the wallet adapter to fully initialize?
   - Recommendation: Wrap the `attemptRejoin` call in a check. If `signMessage` is unavailable at connect time, set a 1-2s delayed retry. The 30s reconnect window provides ample margin.

3. **joinQueue auth scope**
   - What we know: SA-01 requirement says "24 unguarded handlers" — joinQueue is one of them
   - What's unclear: The spec says "game state or financial operations." `joinQueue` with wager=0 is low risk; `joinQueue` with wager>0 should require auth
   - Recommendation: Apply the same conditional pattern as `createRoom` and `joinRoom`: `if (wagerAmount > 0 && !requireAuth(client, 'joinQueue')) return`

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `server/socket-io/main.js` (2431 lines, all handlers reviewed)
- Direct code inspection: `server/middleware/auth.js` (full Ed25519 flow)
- Direct code inspection: `server/middleware/guards.js` (requireAuth pattern)
- Direct code inspection: `server/services/match.js` (MATCH_STATES, turn ownership)
- Direct code inspection: `client/src/App.js` (rejoin flow)
- Direct code inspection: `client/src/wallet/WalletContext.js` (signMessage pattern)

### Secondary (MEDIUM confidence)
- `.audit/findings/BATCH-01-access-control.md` — original finding evidence (some findings pre-date Phase 2 fixes)

---

## Metadata

**Confidence breakdown:**
- SA-01 (requireAuth guards): HIGH — pattern exists, handler list is enumerated from code, one-liner additions
- SA-02 (Ed25519 rejoin): HIGH — verifyWalletSignature/verifyAuthMessage exist; client change is small but requires testing async timing
- SA-03 (terrainPath removal): MEDIUM — removal is safe if client no longer sends it; verify with grep before deleting
- SA-04 (position writeback removal): HIGH — exact lines identified (1731-1732), distance check pattern identified
- SA-05 (turn ownership): HIGH — exact pattern exists in fire handler at line 1674, two one-line additions
- SA-06 (cross-room isolation): HIGH — `client.roomId !== rid` check is trivial; `escrowDepositConfirm` is the only handler with supplied roomId that is not already validated by socket room membership

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable codebase, no external dependencies)
