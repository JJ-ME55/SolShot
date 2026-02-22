# Phase 2: Server Financial Security - Research

**Researched:** 2026-02-22
**Domain:** Node.js/Socket.IO server security — on-chain deposit verification, settlement failure propagation, rate limiting, queue validation
**Confidence:** HIGH

---

## Summary

This phase patches five discrete server-side security defects identified in the Bulwark audit. All five changes are surgical edits to existing files; no new packages are needed. The code patterns required are already present in the codebase: `verifyBurnTransaction()` in `shot-token.js` is a near-exact template for deposit verification, and `settleMatchEscrow()` in `escrow.js` already returns `{ success, error }` that callers can propagate. The rate limiter bug is a one-line type change. Queue wager validation follows the same `validateMatchMode()` helper already used everywhere else.

The dominant risk is correctness of the deposit verification logic: the server must verify the right things (correct PDA, correct player, correct amount, not an error TX) without creating new denial-of-service vectors (e.g., blocking both players if one TX is slow to confirm). Settlement recovery requires preserving the `escrowPDA` mapping across the room teardown boundary, which `removeRoom()` currently destroys.

**Primary recommendation:** Implement all five fixes in a single PR. None depend on each other's output at runtime, but SF-03 (recovery) depends on SF-02 (propagation) being correct to know when to trigger recovery.

---

## Standard Stack

No new packages required. Everything uses libraries already present.

### Core (already installed)
| Library | In Use | Purpose | Notes |
|---------|--------|---------|-------|
| `@solana/web3.js` | Yes | `connection.getParsedTransaction()`, `getEscrowPDA()` | `getConnection()` exported from `solana.js` |
| `@coral-xyz/anchor` | Yes | `program.account.matchEscrow.fetch()` via `getEscrowState()` | Already in `escrow.js` |
| `bn.js` | Yes | Lamport comparison | Already imported in `escrow.js` |
| Node.js built-ins | Yes | `Float64Array` typed array | Drop-in replacement for `Int32Array` |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| None needed | — | All fixes are logic changes within existing files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getParsedTransaction` (TX verification) | `getEscrowState()` (PDA state check) | PDA state check via `getEscrowState()` is simpler and more reliable — it reads on-chain account state directly rather than parsing raw instruction data. Both approaches are valid; use PDA state as primary, TX signature as secondary. |
| `Float64Array` for rate limiter | Regular JS array | `Float64Array` preserves O(1) GC-free property of typed arrays; regular array works but adds GC pressure. `Float64Array` is strictly better here. |
| In-memory failed-settlement store | MongoDB persistence for retry queue | In-memory is lost on restart. MongoDB is the correct approach for the retry queue. For this phase, a `Map` in process memory is acceptable as the initial implementation if MongoDB schema changes are deferred. |

**Installation:** No new packages.

---

## Architecture Patterns

### Recommended Project Structure (no changes needed)

The existing file layout handles all five fixes:

```
server/
├── services/
│   ├── solana.js          — settleMatch() fix (SF-02), new verifyDepositTransaction() (SF-01)
│   └── escrow.js          — getEscrowState() already exists, cancelMatchEscrow() for SF-03
└── socket-io/
    └── main.js            — escrowDepositConfirm handler (SF-01), rate limiter (SF-04),
                             joinQueue handler (SF-05), settlement recovery (SF-03)
```

### Pattern 1: On-Chain Deposit Verification (SF-01)

**What:** Call `getEscrowState(matchId)` (Anchor account fetch) in `escrowDepositConfirm` handler. The escrow PDA's on-chain state tracks `playerOneDeposited` and `playerTwoDeposited` boolean flags. After a player's TX confirms, those flags flip to `true`. This is more reliable than parsing raw TX instructions because the Anchor program guarantees the state reflects the true on-chain outcome.

**When to use:** Immediately when `escrowDepositConfirm` arrives from the client.

**Critical detail:** `getEscrowState()` is already imported in `main.js` (line 10) but never called in the `escrowDepositConfirm` handler (confirmed: lines 1473-1502 have no RPC calls).

**Implementation approach:**

```javascript
// In escrowDepositConfirm handler, after validating roomId + txSignature:
// 1. Fetch on-chain escrow state
const escrowState = await getEscrowState(rid);
if (!escrowState) {
    client.emit('escrowError', { reason: 'Escrow PDA not found on-chain' });
    return;
}

// 2. Determine which player this is (host vs player)
const isHost = room.host?.socketId === client.id;
const playerWallet = ws.wallets[client.id];
if (!playerWallet) {
    client.emit('escrowError', { reason: 'No wallet registered for this socket' });
    return;
}

// 3. Verify this player's deposit flag is set on-chain
const depositConfirmed = isHost
    ? escrowState.playerOneDeposited
    : escrowState.playerTwoDeposited;

if (!depositConfirmed) {
    client.emit('escrowError', { reason: 'Deposit not confirmed on-chain yet' });
    return;
}

// 4. Verify wager amount matches (guard against amount spoofing)
const expectedLamports = Math.round(ws.amount * LAMPORTS_PER_SOL);
if (escrowState.wagerLamports !== expectedLamports) {
    client.emit('escrowError', { reason: 'On-chain wager amount mismatch' });
    return;
}

// 5. Accept deposit — proceed with existing logic
ws.deposits[client.id] = txSignature;
// ... existing "both players deposited" check ...
```

**Alternative (TX signature verification using `getParsedTransaction`):**

If PDA state verification is used as the primary check, `getParsedTransaction` provides a secondary confirmation (auditable txSignature tied to the deposit event). The existing `verifyBurnTransaction()` pattern in `shot-token.js:459-540` is the exact template for this — it calls `connection.getParsedTransaction(txSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })` and inspects `tx.transaction.message.instructions` for the specific program and instruction type.

For deposit verification, the relevant check would be:
- `tx.meta?.err === null` (TX succeeded)
- An instruction from the escrow program (`PROGRAM_ID.toBase58()`) is present
- The escrow PDA matches `room.escrowPDA`

**Timing risk:** `getParsedTransaction` may return `null` if the TX hasn't been confirmed yet. The client only calls `escrowDepositConfirm` after their wallet confirms the TX, but devnet confirmation can lag. Retry with a brief delay or use `'finalized'` commitment for safety. The PDA state approach (`getEscrowState`) is simpler and avoids this risk because it reads current on-chain state regardless of when the TX confirmed.

**Recommendation:** Use `getEscrowState()` as primary verification (reads PDA booleans). Store `txSignature` for audit trail. This avoids parsing instruction bytes entirely.

### Pattern 2: Settlement Failure Propagation (SF-02)

**What:** `settleMatch()` in `solana.js:239-255` has a silent fallback — when `settleMatchEscrow()` fails, it falls through to the `// Fallback: log settlement` block and returns `{ success: true, txSignature: null }`. This must return `{ success: false, error }` instead.

**Current code (lines 238-255):**
```javascript
console.error('[Solana] On-chain settle failed, logging only:', result.error);
// Falls through to:
console.log('[Solana] Settlement (off-chain):', { ... });
return { success: true, settlement, txSignature: null };  // BUG: silently reports success
```

**Fix:**
```javascript
if (isEscrowEnabled() && matchId) {
    const result = await settleMatchEscrow(matchId, winnerAddress);
    if (result.success) {
        return { success: true, settlement, txSignature: result.txSignature };
    }
    // Propagate failure — do NOT fall through
    console.error('[Solana] On-chain settle failed:', result.error);
    return { success: false, error: result.error, settlement };
}

// Only reach fallback when escrow is NOT enabled (dev mode, no wager)
```

**Impact on callers:** There are three settlement call sites in `main.js`:

1. **Line 1791** (normal match end, `fire` handler): Already handles `catch (err)` and transitions to `CANCELLED`. But it only catches thrown errors, not `{ success: false }` returns. After the fix, the caller must check `sResult.success === false` as well.

2. **Line 266** (forfeit/turn-timer): Same pattern — catches errors but not `{ success: false }`.

3. **Line 509** (cleanupRoom disconnect forfeit): Same pattern.

All three callers need to be updated to check `result.success === false` in addition to catching thrown exceptions.

### Pattern 3: Settlement Failure Recovery (SF-03)

**What:** When settlement fails, the server should:
1. Call `cancelMatchEscrow()` to attempt on-chain refund
2. If cancel also fails, persist the failed match to a retry queue
3. Preserve the `escrowPDA` value before `removeRoom()` destroys it

**The `removeRoom()` problem:** `removeRoom()` at line 146-166 deletes `rooms.delete(roomId)` and `delete wagerStates[roomId]`. The `escrowPDA` is stored on `room.escrowPDA` (set at lines 849, 1090). After `removeRoom()`, this is gone.

**Fix approach:**
1. Before calling `removeRoom()` in the settlement failure path, capture `room.escrowPDA`, `ws.wallets`, and `ws.amount`.
2. Call `cancelMatchEscrow(roomId, p1wallet, p2wallet)` with those captured values.
3. If cancel fails too, push to an in-memory retry queue (Map keyed by roomId).
4. A `setInterval` every 60s (or similar) retries failed cancels.

**Retry queue shape:**
```javascript
// Module-level in main.js (or a new services/recovery.js)
const failedSettlements = new Map();
// { [roomId]: { escrowPDA, p1wallet, p2wallet, wagerSOL, failedAt, attempts } }
```

**Where to add the retry ticker:** In `server/index.js` or as module-level code in `main.js` after the socket handler setup.

**Note on data loss:** An in-memory retry queue is lost on server restart. For this phase, in-memory is acceptable as a first iteration. The audit recommendation (H020) calls for persistent storage; that can be a follow-up once the recovery path is proven correct. If MongoDB is already connected at this point, a simple `FailedSettlement` collection would be ideal.

### Pattern 4: Float64Array Rate Limiter Fix (SF-04)

**What:** `Int32Array` stores 32-bit signed integers with max value 2,147,483,647. `Date.now()` in 2026 returns approximately 1,770,000,000,000 (13 digits). Assignment to `Int32Array` truncates via `ToInt32`, producing garbage values. `ringCount()` then compares these garbage values to a timestamp cutoff, always returning 0. All three ring buffers have never functioned.

**The fix is exactly three lines** (lines 369, 373, 375 in main.js):

```javascript
// Before:
const createRing = new Int32Array(RL_MAX_CREATES + 1)
const eventRing = new Int32Array(RL_MAX_EVENTS + 1)
const fireRing = new Int32Array(RL_MAX_FIRES + 1)

// After:
const createRing = new Float64Array(RL_MAX_CREATES + 1)
const eventRing = new Float64Array(RL_MAX_EVENTS + 1)
const fireRing = new Float64Array(RL_MAX_FIRES + 1)
```

`Float64Array` stores IEEE-754 doubles, which handle the full range of `Date.now()` values exactly (up to 2^53, approximately year 285 million). The rest of `ringCount()`, the ring head tracking, and all comparisons remain identical.

**Why Float64Array over regular Array:** Typed arrays avoid GC pressure from boxing/unboxing numbers. The audit explicitly recommends Float64Array for this reason (H021/H054). A regular JS `Array` would also work functionally.

**Verification:** After the fix, sending 31 events within 1 second should result in the 31st being dropped. The existing escalation logic (disconnect after 3x limit for 5 seconds) will also activate correctly.

### Pattern 5: Queue Wager Validation (SF-05)

**What:** In `joinQueue`, when a queued opponent is found (line 1032-1143), the room is created using `wagerAmount` from the *joiner*, not `opponent.wager`. The queued opponent may have queued at a different wager amount (within the same match mode's wager range). The `wagerStates[roomId].amount` becomes the joiner's amount, not the opponent's expected amount.

**The bug is at line 1049:**
```javascript
const roomData = {
    ...
    wager: wagerAmount,  // joiner's wager — opponent.wager ignored
    ...
};
wagerStates[roomId] = {
    amount: wagerAmount,  // same problem
    ...
};
```

**The fix:** Before accepting the match, verify `wagerAmount === opponent.wager`. If they differ, do not match — put the joiner in the queue instead (or reject with a clear error).

```javascript
if (queue.length > 0) {
    const opponent = queue[0]; // peek, don't shift yet

    // SF-05: Validate wager matches before pairing
    if (opponent.wager !== wagerAmount) {
        client.emit('queueError', {
            reason: `Wager mismatch: queue has ${opponent.wager} SOL, you sent ${wagerAmount} SOL`
        });
        return;
    }

    queue.shift(); // now safe to consume
    // ... rest of match creation ...
}
```

**Note:** The queue key already separates by `matchMode:matchLength` (e.g., `quick_match:1`). For `quick_match`, the wager range is `[0.1, 0.1]` — only one valid wager. For `duel`, the range is `[0.25, 0.5]`, so a 0.25 SOL queuer and a 0.5 SOL joiner could be paired on the same key. This is the mismatch vector.

**Alternative:** Instead of rejecting, use `opponent.wager` as the authoritative wager for the room (the queued player was first). This prevents the joiner from overriding. Either approach works; rejection is safer and more transparent.

### Anti-Patterns to Avoid

- **Async in `escrowDepositConfirm` without error handling:** The handler already has no try/catch. Add one — RPC calls can throw.
- **Blocking both players on slow confirmation:** If `getEscrowState()` returns null, emit `escrowError` only to the player who sent the confirmation, not both. The other player's deposit may still be in flight.
- **Removing the dev-mode fallback entirely in `settleMatch`:** The fallback after `// Fallback: log settlement` should stay — it's the correct behavior when escrow is NOT enabled (practice mode, dev mode). Only remove the fallback when `isEscrowEnabled() && matchId` is true.
- **Using `Int32Array.BYTES_PER_ELEMENT` as a version check:** Just replace the type. No compatibility issues.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TX instruction parsing for deposits | Custom byte deserializer | `getEscrowState()` — reads Anchor PDA state directly | The PDA boolean `playerOneDeposited` is the ground truth; parsing IX bytes is fragile and error-prone |
| Retry queue persistence | Custom file-based queue | MongoDB `FailedSettlement` collection (or in-memory Map for this phase) | Reinventing persistence is wasteful; Mongoose is already connected |
| Rate limiter from scratch | New algorithm | Fix the existing `Int32Array` → `Float64Array` | The ring-buffer design is correct; only the storage type is wrong |

**Key insight:** The codebase already has all the building blocks. The patterns are already proven (`verifyBurnTransaction`, `getEscrowState`, `cancelMatchEscrow`). This phase is about wiring them correctly, not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: `getEscrowState` Returns Null When Escrow Not Enabled
**What goes wrong:** `getEscrowState()` returns `null` when `program` is null (escrow disabled). If the deposit handler calls it unconditionally, it throws or silently passes.
**Why it happens:** `isEscrowEnabled()` guards most escrow calls; `escrowDepositConfirm` should do the same.
**How to avoid:** Guard the entire verification block with `if (isEscrowEnabled())`. In dev mode (escrow disabled), accept deposits without on-chain verification (same dev-mode behavior as prestige burns).
**Warning signs:** `[Escrow] Initialized` not in server startup logs means escrow is disabled.

### Pitfall 2: Settlement Failure Propagation Breaks Caller Assumptions
**What goes wrong:** All three settlement callers in `main.js` (lines 266, 509, 1791) only `catch` thrown errors. After SF-02, `settleMatch()` returns `{ success: false }` instead of throwing. Callers that do `await settleMatch(...)` and then unconditionally use `sResult.settlement.winner` will crash with a TypeError.
**Why it happens:** The existing callers were written assuming `settleMatch()` always succeeds.
**How to avoid:** Update all three call sites simultaneously. Check `sResult.success === false` explicitly. The line 1791 caller already handles thrown errors by transitioning to `CANCELLED`; it should do the same for `!sResult.success`.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'winner')` in server logs after SF-02.

### Pitfall 3: `escrowPDA` Lost Before Recovery Can Run
**What goes wrong:** `removeRoom()` is called before `cancelMatchEscrow()`. After `removeRoom()`, `rooms.get(roomId)` returns `undefined`, so `room.escrowPDA` is gone.
**Why it happens:** The teardown order in the forfeit path (lines 309-317) and `cleanupRoom()` (lines 472-538) calls `removeRoom()` without capturing escrow data first.
**How to avoid:** Capture `const escrowPDA = room?.escrowPDA`, `const p1wallet = ws?.wallets[hostId]`, `const p2wallet = ws?.wallets[playerId]` **before** `removeRoom()`. Then use captured values for `cancelMatchEscrow()`.
**Warning signs:** `cancelMatchEscrow` logs `matchId` correctly but `escrowPDA` derivation fails because `matchId` still works (it's passed as a parameter, not from room state). The PDA is derived from `matchId` deterministically via `getEscrowPDA()`, so `cancelMatchEscrow(matchId, p1wallet, p2wallet)` only needs the wallet addresses — which come from `wagerStates`, also deleted by `removeRoom()`. Capture wallet addresses too.

### Pitfall 4: Rate Limiter Test Requires Correct Initial State
**What goes wrong:** After changing to `Float64Array`, the escalation counter `dropCount` may have old state from a previous load. On server restart, the new buffers start at zero (all zeros in Float64Array, which are valid but very old timestamps — effectively 0ms, always outside the 1-second window). No issue here.
**Why it happens:** N/A on fresh start. The concern is if someone assumes `Float64Array` filled with zeros would count as recent events — it won't, since `0 > (Date.now() - 1000)` is false.
**How to avoid:** No action needed; `Float64Array` zero-initialization is correct for this use case.
**Warning signs:** Rate limiter test: send 35 events in 1 second; events 31-35 should be dropped.

### Pitfall 5: Queue Wager Mismatch Fix Must Handle Duel Mode
**What goes wrong:** `duel` mode allows wagers `[0.25, 0.5]`. Two players queue with different valid wagers (0.25 and 0.5). The queue key is `duel:3` for both. The strict equality check `opponent.wager !== wagerAmount` would reject a valid match.
**Why it happens:** The queue key doesn't encode the wager amount, only the mode and format.
**How to avoid:** Two options: (a) require exact wager match — simplest, safest, may reduce matchmaking speed for duel; (b) separate queue keys by wager as well: `duel:3:0.25` and `duel:3:0.5`. Option (b) is the correct long-term fix. Option (a) is safe for the current small user base. The audit finding H017 describes option (a) as the fix.
**Warning signs:** If option (a), duel players with different wagers never match. This is correct behavior — they have different stakes expectations.

---

## Code Examples

Verified patterns from existing codebase (HIGH confidence — read directly from source):

### Existing getParsedTransaction Pattern (from shot-token.js:459-540)
```javascript
// Source: server/services/shot-token.js:461-508
const tx = await connection.getParsedTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
});

if (!tx) return { valid: false, reason: 'Transaction not found or not confirmed' };
if (tx.meta?.err) return { valid: false, reason: 'Transaction failed on-chain' };

const instructions = tx.transaction.message.instructions;
for (const ix of instructions) {
    if (ix.program === 'spl-token' && ix.parsed) {
        const { type, info } = ix.parsed;
        // ... verify type, info.mint, info.authority, info.amount
    }
}
// Also check tx.meta?.innerInstructions for CPI-wrapped instructions
```

### Existing getEscrowState Pattern (from escrow.js:480-503)
```javascript
// Source: server/services/escrow.js:480-503
export async function getEscrowState(matchId) {
    if (!program) return null;
    try {
        const [escrowPDA] = getEscrowPDA(matchId);
        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        return {
            matchId: escrow.matchId,
            playerOne: escrow.playerOne.toBase58(),
            playerTwo: escrow.playerTwo.toBase58(),
            wagerLamports: escrow.wagerLamports.toNumber(),
            playerOneDeposited: escrow.playerOneDeposited,
            playerTwoDeposited: escrow.playerTwoDeposited,
            state: Object.keys(escrow.state)[0],
            activatedAt: escrow.activatedAt?.toNumber() || 0,
        };
    } catch (err) {
        return null; // Account doesn't exist or was closed
    }
}
```

### Existing cancelMatchEscrow Pattern (from escrow.js:437-470)
```javascript
// Source: server/services/escrow.js:437-470
export async function cancelMatchEscrow(matchId, playerOneAddress, playerTwoAddress) {
    // Returns: { success: boolean, txSignature?: string, error?: string }
    if (!program) return { success: false, error: 'Escrow not initialized' };
    try {
        const tx = await program.methods.cancelMatch()
            .accounts({ escrow: escrowPDA, caller: serverKeypair.publicKey,
                        playerOne, playerTwo, config: configPDA, systemProgram: PublicKey.default })
            .rpc();
        return { success: true, txSignature: tx };
    } catch (err) {
        return { success: false, error: err.message };
    }
}
```

### Current settleMatch Silent Fallback (from solana.js:238-255)
```javascript
// Source: server/services/solana.js:238-255 — THIS IS THE BUG
console.error('[Solana] On-chain settle failed, logging only:', result.error);
// Falls through to:
return { success: true, settlement, txSignature: null };  // WRONG — should be { success: false }
```

### Current escrowDepositConfirm Handler (from main.js:1473-1502)
```javascript
// Source: server/socket-io/main.js:1473-1502 — NO ON-CHAIN VERIFICATION
client.on('escrowDepositConfirm', async (data) => {
    const { roomId: rid, txSignature } = data;
    // ... room/ws lookups ...
    ws.deposits[client.id] = txSignature;  // stores any string, no verification
    if (hostDeposited && playerDeposited) {
        io.sockets.in(rid).emit('escrowActive', { ... });  // fires on fake TX
    }
})
```

### Current Int32Array Rate Limiter (from main.js:369-375)
```javascript
// Source: server/socket-io/main.js:369-375 — BUG: Int32 overflows Date.now()
const createRing = new Int32Array(RL_MAX_CREATES + 1)
const eventRing = new Int32Array(RL_MAX_EVENTS + 1)
const fireRing = new Int32Array(RL_MAX_FIRES + 1)
// Fix: replace Int32Array with Float64Array — all three lines
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Trust client's `txSignature` assertion | Verify deposit flags on Anchor PDA via `getEscrowState()` | Blocks zero-cost match entry (H013/H049) |
| Silent success fallback on settlement error | Return `{ success: false }` and trigger cancel | Surfaces failures, enables recovery (H015/H020) |
| Int32Array for timestamps | Float64Array | Restores all three rate limiters (H021/H054) |
| Accept any joiner wager in queue | Validate joiner.wager === opponent.wager | Prevents stake mismatch (H017) |

**Deprecated patterns in this codebase:**
- `ws.deposits[client.id] = txSignature` without verification: replaced by on-chain state check
- Silent escrow fallback (`success: true` on failure): replaced by proper error propagation

---

## Open Questions

1. **Wager mismatch rejection vs. separate queue keys (SF-05)**
   - What we know: `duel` mode allows `[0.25, 0.5]` SOL range; two players could queue with different valid wagers on the same `duel:N` key
   - What's unclear: Whether the product wants to allow cross-wager duel matches or require exact wager matching
   - Recommendation: Default to exact match validation (simplest, safest); if matchmaking rate suffers, add wager to queue key as a follow-up

2. **Retry queue persistence (SF-03)**
   - What we know: In-memory Map is lost on restart; MongoDB is connected but has no `FailedSettlement` schema
   - What's unclear: Whether adding a MongoDB schema is in scope for this phase
   - Recommendation: Implement in-memory retry Map for this phase; add MongoDB persistence as a follow-up task. The 24-hour on-chain cancel timeout provides a safety net.

3. **Dev-mode behavior for deposit verification (SF-01)**
   - What we know: `verifyBurnTransaction()` skips on-chain verification when `SHOT_TOKEN_MINT` is unset; devnet keypair exists and escrow is enabled
   - What's unclear: Whether escrow is currently enabled in local dev (SOLANA_KEYPAIR_PATH set?)
   - Recommendation: Guard SF-01 with `if (isEscrowEnabled())` — if escrow disabled, skip verification. This mirrors prestige burn behavior.

4. **Confirmation timing for `getEscrowState()` (SF-01)**
   - What we know: The client calls `escrowDepositConfirm` after their wallet adapter reports the TX confirmed
   - What's unclear: Devnet can lag 2-5 seconds between wallet confirmation and RPC `getParsedTransaction` returning non-null
   - Recommendation: If `getEscrowState()` returns null or `playerOneDeposited === false` right after a client-reported confirmation, add a single retry with a 2-second delay before rejecting. Emit `escrowVerifying` to the client while polling.

---

## Sources

### Primary (HIGH confidence)
- Direct code reading: `server/socket-io/main.js` (lines 350-445 rate limiter, 1005-1144 joinQueue, 1473-1502 escrowDepositConfirm, 1780-1817 settlement)
- Direct code reading: `server/services/solana.js` (lines 216-290 settleMatch/refundWager)
- Direct code reading: `server/services/escrow.js` (lines 386-470 settleMatchEscrow/cancelMatchEscrow, 480-503 getEscrowState)
- Direct code reading: `server/services/shot-token.js` (lines 447-540 verifyBurnTransaction — template for deposit verification)
- Direct code reading: `server/socket-io/main.js` (lines 145-166 removeRoom — confirms escrowPDA destruction)
- `.bulwark/FINAL_REPORT.md` — H013, H015, H017, H020/H050, H021/H054 findings

### Secondary (MEDIUM confidence)
- QuickNode getParsedTransaction documentation — confirmed method signature and `commitment: 'confirmed'` + `maxSupportedTransactionVersion: 0` options
- Bulwark audit report confirmation that `getEscrowState()` is imported but unused in the deposit handler (H051)

### Tertiary (LOW confidence)
- None — all findings verified against actual source code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new packages; all libraries already in use, confirmed by reading package.json and import statements
- Architecture: HIGH — All patterns read directly from existing source code; no external API assumptions
- Pitfalls: HIGH — Derived from reading actual call sites and data flow in main.js, solana.js, escrow.js

**Research date:** 2026-02-22
**Valid until:** Stable — these are internal code findings, not external API-dependent. Only changes if the files listed above are modified before planning.
