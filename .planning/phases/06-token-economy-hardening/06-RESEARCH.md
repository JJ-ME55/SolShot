# Phase 6: Token Economy Hardening - Research

**Researched:** 2026-02-23
**Domain:** In-memory Set persistence to MongoDB, fail-hard startup
**Confidence:** HIGH

## Summary

Phase 6 addresses three replay/reset vulnerabilities in the SHOT token economy. All three are in `server/services/shot-token.js` with supporting model changes in `server/models/User.js` and `server/models/ServerState.js`.

The core problem: two in-memory Sets (`verifiedBurnTxs` and per-player `claimedMatchIds`) lose state on server restart, enabling replay attacks. Additionally, `initShotState()` silently falls back to zero on MongoDB failure, resetting the emission counter and bypassing the supply cap.

**Primary recommendation:** Persist both Sets to MongoDB (verifiedBurnTxs as a global ServerState array, claimedMatchIds as a User schema field), and make `initShotState()` throw on any DB failure so `index.js` crashes before accepting connections.

## Standard Stack

No new libraries needed. All changes use existing Mongoose models.

### Core (already in project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| mongoose | existing | MongoDB ODM | Already used for User, ServerState |

### No New Dependencies Required

This phase is pure application logic — persist existing in-memory data structures to existing MongoDB collections.

## Architecture Patterns

### Pattern 1: Global Set as ServerState Array
**What:** Store `verifiedBurnTxs` as an array field on the ServerState singleton document
**When to use:** For the global burn TX replay protection Set
**Why:** Single document with upsert pattern already exists (`key: 'global'`). Adding an array field is the simplest persistence approach.

```javascript
// ServerState schema addition
verifiedBurnTxs: { type: [String], default: [] },
```

On startup: `verifiedBurnTxs = new Set(state.verifiedBurnTxs)`
On new verification: `$addToSet: { verifiedBurnTxs: txSignature }`

### Pattern 2: Per-User Set as User Schema Array
**What:** Store `claimedMatchIds` as an array field on the User document
**When to use:** For per-player match ID deduplication
**Why:** Already saving other milestone state to User.stats via `saveMilestoneState()`.

```javascript
// User schema addition
claimedMatchIds: { type: [String], default: [] },
```

On `loadMilestoneState()`: `state.claimedMatchIds = new Set(user.stats.claimedMatchIds)`
On `saveMilestoneState()`: `'stats.claimedMatchIds': [...state.claimedMatchIds]`

### Pattern 3: Fail-Hard Startup
**What:** `process.exit(1)` if emission counter can't load from MongoDB
**When to use:** For `initShotState()` — MUST NOT start with zeroed counter
**Why:** A zeroed counter allows re-emitting the entire 7M reward pool.

```javascript
export async function initShotState() {
    const state = await loadServerState(); // throws on failure
    totalShotEmitted = state.totalShotEmitted;
}
```

`loadServerState()` must throw instead of returning defaults when DB is unreachable.

### Anti-Patterns to Avoid
- **Silent fallback to defaults:** Current `loadServerState()` returns `{ totalShotEmitted: 0 }` on error — this IS the vulnerability
- **Unbounded array growth:** `verifiedBurnTxs` array could grow indefinitely — consider TTL or max-size, but for v1.1 the realistic volume is tiny (prestige burns are rare)
- **Set serialization without dedup:** Always use `$addToSet` for atomic MongoDB additions, `[...set]` for serialization

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic set addition | Manual read-modify-write | `$addToSet` operator | Race-condition safe |
| Startup health check | Custom retry logic | `process.exit(1)` + container restart | Render auto-restarts crashed services |

## Common Pitfalls

### Pitfall 1: loadServerState Silently Returning Defaults
**What goes wrong:** MongoDB is unreachable but server starts with `totalShotEmitted = 0`
**Why it happens:** Current code catches all errors and returns `{ totalShotEmitted: 0 }`
**How to avoid:** Remove the try-catch in loadServerState (let it throw), or re-throw after logging
**Warning signs:** Server starts without "[ServerState] Loaded:" log line

### Pitfall 2: claimedMatchIds Not Restored on loadMilestoneState
**What goes wrong:** Player reconnects, `loadMilestoneState()` restores stats but NOT claimedMatchIds
**Why it happens:** claimedMatchIds isn't in the User schema and isn't part of save/load logic
**How to avoid:** Add to User schema, add to both load and save functions
**Warning signs:** After restart, same matchId earns rewards twice

### Pitfall 3: verifiedBurnTxs Not Restored on Startup
**What goes wrong:** Server restarts, same burn TX signature can unlock prestige again
**Why it happens:** `verifiedBurnTxs` is a module-level `new Set()` — lost on restart
**How to avoid:** Load from ServerState on init, save on each new verification
**Warning signs:** Player uses same burn TX to unlock multiple prestige tiers

### Pitfall 4: Set → Array Serialization
**What goes wrong:** `new Set()` can't be directly stored in MongoDB
**Why it happens:** MongoDB has no native Set type
**How to avoid:** Convert with `[...set]` for writes, `new Set(array)` for reads
**Warning signs:** Empty arrays in DB despite in-memory Set having entries

## Code Examples

### Current State (Vulnerable)

```javascript
// shot-token.js:41 — LOST on restart
const verifiedBurnTxs = new Set();

// shot-token.js:134 — LOST on restart (per-player)
claimedMatchIds: new Set(),

// ServerState.js:37-39 — SILENTLY returns zero on failure
} catch (err) {
    console.error('[ServerState] Load error:', err.message);
    return { totalShotEmitted: 0 };  // ← THE BUG
}
```

### Target State (Hardened)

```javascript
// ServerState.js — add verifiedBurnTxs array to schema
verifiedBurnTxs: { type: [String], default: [] },

// ServerState.js — loadServerState throws on failure
export async function loadServerState() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected — cannot load server state');
    }
    const state = await ServerState.findOne({ key: 'global' });
    return {
        totalShotEmitted: state?.totalShotEmitted ?? 0,
        verifiedBurnTxs: state?.verifiedBurnTxs ?? [],
    };
    // NO try-catch — let errors propagate to caller
}

// User.js — add claimedMatchIds to stats schema
claimedMatchIds: { type: [String], default: [] },

// shot-token.js — initShotState loads verifiedBurnTxs
export async function initShotState() {
    const state = await loadServerState(); // throws on failure → process crashes
    totalShotEmitted = state.totalShotEmitted;
    state.verifiedBurnTxs.forEach(tx => verifiedBurnTxs.add(tx));
}

// shot-token.js — persist burn tx immediately after verification
verifiedBurnTxs.add(txSignature);
persistBurnTx(txSignature); // $addToSet to ServerState

// shot-token.js — loadMilestoneState restores claimedMatchIds
if (user.stats.claimedMatchIds?.length > 0) {
    state.claimedMatchIds = new Set(user.stats.claimedMatchIds);
}

// shot-token.js — saveMilestoneState includes claimedMatchIds
'stats.claimedMatchIds': [...state.claimedMatchIds],
```

## Key Files

| File | Changes |
|------|---------|
| `server/services/shot-token.js` | Load/save verifiedBurnTxs + claimedMatchIds; initShotState fail-hard |
| `server/models/ServerState.js` | Add verifiedBurnTxs field; make loadServerState throw on failure |
| `server/models/User.js` | Add stats.claimedMatchIds field |
| `server/index.js` | Wrap initShotState in try-catch with process.exit(1) |

## Open Questions

None — all three requirements are straightforward persistence changes in well-understood code.

## Sources

### Primary (HIGH confidence)
- Direct source code analysis: `server/services/shot-token.js`, `server/models/ServerState.js`, `server/models/User.js`, `server/index.js`
- `.planning/REQUIREMENTS.md` — TE-01, TE-02, TE-03 requirement definitions
- `.planning/ROADMAP.md` — Phase 6 success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries needed
- Architecture: HIGH — extending existing Mongoose patterns already in codebase
- Pitfalls: HIGH — bugs are clearly identified in source code

**Research date:** 2026-02-23
**Valid until:** Indefinite (no external dependency changes)
