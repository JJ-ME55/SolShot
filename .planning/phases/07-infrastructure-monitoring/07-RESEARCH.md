# Phase 7: Infrastructure & Monitoring - Research

**Researched:** 2026-02-23
**Domain:** Node.js security hardening — build pipeline, auth guards, connection limiting, structured logging, CSPRNG
**Confidence:** HIGH (all 5 requirements verified against codebase and official sources)

## Summary

Phase 7 comprises five discrete security fixes (IM-01 through IM-05), each targeting a specific finding from the security audit. They are independent of each other and can be implemented in any order. No new major libraries are needed — pino is the only addition, and it is a drop-in structured logger. The Socket.IO per-IP connection limit and /stats auth guard reuse existing patterns already present in the codebase.

The terrain seed entropy fix (IM-05) has a subtle complexity: the `seededRandom` function in `physics.js` uses mulberry32 which operates on a 32-bit integer (`s |= 0`). You cannot pass a 128-bit value directly. The correct approach is to generate 128 bits of CSPRNG entropy as a hex string, then derive the 32-bit mulberry32 seed from the first 4 bytes. The full 128-bit hex is stored as `room.terrainSeed` for auditability; only the derived 32-bit value is passed to `generateTerrain()`.

The logging redaction fix (IM-04) does NOT require replacing all `console.log` calls. The strategy is to build a thin `logger` wrapper using pino with `redact` paths configured, then replace only the calls that log wallet addresses or balances. The existing `console.log` calls for non-sensitive data (e.g., `[Server] Keys: LOADED`) can remain.

**Primary recommendation:** Implement in order IM-01, IM-02, IM-03, IM-04, IM-05 — each is a small, self-contained change. Total implementation is ~150 lines of code changes across 5 files.

## Standard Stack

No new dependencies are required for IM-01, IM-02, IM-03, or IM-05. IM-04 adds pino.

### Core (Existing — already in server/package.json)
| Library | Installed Version | Purpose | Relevant to |
|---------|------------------|---------|-------------|
| `socket.io` | 4.5.1 | WebSocket server | IM-03 connection limiting |
| `express` | 4.18.1 | HTTP framework | IM-02 /stats auth guard |
| `crypto` | Node built-in | CSPRNG | IM-01, IM-05 |

### New Addition (IM-04 only)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pino` | ^10.3.1 | Structured JSON logger with built-in redaction | Fastest Node logger; built-in `redact` paths API; active maintenance (latest: 10.3.1, Feb 2026) |
| `pino-pretty` | ^13.x | Human-readable output in dev | Dev-only; production uses JSON |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pino` | `winston` | Winston has no built-in redact; requires manual field scrubbing in format() |
| `pino` | Custom redaction in console.log | Fragile; misses new log sites; not auditable |
| pino redact paths | Regex scrubbing | Regex on serialized JSON is brittle; misses nested paths |

**Installation (IM-04 only):**
```bash
# In server/
npm install pino
npm install --save-dev pino-pretty
```

## Architecture Patterns

### Recommended File Structure Changes

```
server/
├── index.js                  # IM-01: render.yaml only; IM-02: add auth guard; IM-03: add io middleware
├── render.yaml               # IM-01: line 16 change
├── services/
│   ├── logger.js             # IM-04: NEW — pino logger singleton with redact config
│   ├── monitoring.js         # IM-02: add requireStatsAuth() guard helper
│   ├── shot-token.js         # IM-04: replace wallet/balance console.log calls
│   └── solana.js             # IM-04: replace wallet/address console.log calls
└── socket-io/
    └── main.js               # IM-03: add io.use() IP limiter; IM-04: replace wallet log; IM-05: new seed pattern
```

### Pattern 1: IM-01 — render.yaml Build Command

**What:** Single-line change to `render.yaml:16`.
**Why npm ci instead of npm install:** `npm ci` installs from lock file (exact versions), fails if lock file is out of sync, and does not update `package-lock.json`. `--ignore-scripts` prevents lifecycle hooks (`postinstall`, `preinstall`, `prepare`) from running during build, eliminating a supply-chain attack vector.

```yaml
# render.yaml line 16 — BEFORE:
    buildCommand: npm install

# AFTER:
    buildCommand: npm ci --ignore-scripts
```

**Verified:** The server `package.json` has no `prepare`, `postinstall`, or `preinstall` scripts — `--ignore-scripts` will not break the build. (Source: codebase inspection)

### Pattern 2: IM-02 — /stats Endpoint Auth Guard

**What:** Add the same `x-admin-key` check already used by `/api/admin/reload-keys`.
**Pattern already in codebase** (`index.js` lines 93-95):

```javascript
// EXISTING pattern on /api/admin/reload-keys:
const apiKey = req.headers['x-admin-key'];
if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```

**Apply same guard to /stats.** Two approaches:

Option A — Inline guard in `monitoring.js` `getStats()`:
```javascript
// Source: codebase inspection of existing KM-05 pattern
export function getStats(req, res) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // ... existing stats logic
}
```

Option B — Extract reusable Express middleware (preferred):
```javascript
// server/middleware/adminAuth.js (new file, or add to guards.js)
export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// index.js
import { requireAdminKey } from './middleware/adminAuth.js';
app.get('/stats', requireAdminKey, getStats);
```

**Recommendation:** Option B (middleware) — DRY, testable, consistent with existing `guards.js` pattern. The `/health` endpoint should remain public (used by Render's health check at `healthCheckPath: /health` in `render.yaml`).

### Pattern 3: IM-03 — Socket.IO Per-IP Connection Limiting

**What:** Track active connections per IP in a Map; reject new connections when a single IP exceeds the limit.
**Socket.IO built-in:** No built-in `maxConnections` or per-IP option exists (verified via official docs). Must use `io.use()` middleware.
**Access the IP:** Use `socket.handshake.address` (direct connection) or `socket.handshake.headers['x-forwarded-for']` (behind Render proxy).

```javascript
// Source: Socket.IO official middleware docs (https://socket.io/docs/v4/middlewares/)
// Place in server/index.js after `const io = new socket.Server(...)`

const MAX_CONNECTIONS_PER_IP = 5; // tune based on game flow (1-2 per player expected)
const ipConnectionCounts = new Map(); // ip => count

io.use((socket, next) => {
    // Render is a reverse proxy — use x-forwarded-for, fallback to direct address
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
             || socket.handshake.address;

    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }
    ipConnectionCounts.set(ip, current + 1);

    // Decrement on disconnect
    socket.on('disconnect', () => {
        const count = ipConnectionCounts.get(ip) || 1;
        if (count <= 1) {
            ipConnectionCounts.delete(ip);
        } else {
            ipConnectionCounts.set(ip, count - 1);
        }
    });

    next();
});
```

**Success criterion:** "More than 100 connections from a single IP are rejected." Set `MAX_CONNECTIONS_PER_IP` to 100 (or lower — 5 is realistic for a 2-player game, but 100 is the audit threshold).

**Render proxy note:** Render routes through its load balancer. The `x-forwarded-for` header is set by Render's infrastructure. Test that IP extraction works correctly in production.

### Pattern 4: IM-04 — Structured Logging with Redaction

**What:** Create a pino logger singleton with `redact` paths configured; replace sensitive `console.log` calls.

**Step 1: Create `server/services/logger.js`**
```javascript
// server/services/logger.js
// Source: pino official docs (https://github.com/pinojs/pino/blob/main/docs/redaction.md)
import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'walletAddress',
            'wallet',
            'winner',
            'loser',
            'player',
            'p1wallet',
            'p2wallet',
            'winnerAddress',
            'loserAddress',
            '*.walletAddress',
            '*.wallet',
        ],
        censor: '[REDACTED]',
    },
    // In production, output JSON; in dev, use pino-pretty if installed
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
});

export default logger;
```

**Step 2: Replace sensitive log calls** in these specific locations:

| File | Line | Current (cleartext) | Fix |
|------|------|---------------------|-----|
| `socket-io/main.js` | 541 | `console.log('[Auth] ... as ${result.walletAddress}')` | `logger.info({ socketId: client.id }, '[Auth] Socket authenticated')` — omit wallet |
| `socket-io/main.js` | 1637 | `console.log('[Prestige] ... ${wallet} → Tier...')` | `logger.info({ tier: result.tier, tierName: result.tierName, tx: txSignature }, '[Prestige] On-chain burn verified')` |
| `services/shot-token.js` | 181 | `console.log('[SHOT] Loaded state for ${walletAddress}: tier=..., balance=...')` | `logger.info({ tier: state.prestigeTier, wageredMatches: state.wageredMatchesPlayed }, '[SHOT] Loaded player state')` — omit address and balance |
| `services/shot-token.js` | 385 | `console.log('[SHOT] Prestige burn: ${walletAddress} → Tier...')` | `logger.info({ tier: nextTier.tier, tierName: nextTier.name, burned: nextTier.burnCost }, '[SHOT] Prestige burn')` |
| `services/solana.js` | 202-206 | `console.log('[Solana] On-chain settlement:', { winner: winnerAddress, ... })` | `logger.info({ matchId, txSignature: result.txSignature }, '[Solana] On-chain settlement')` — omit wallet addresses |
| `services/solana.js` | 219-225 | `console.log('[Solana] Settlement (off-chain):', { winner: winnerAddress, ... })` | `logger.info({ winnerSOL: settlement.winner, totalPot }, '[Solana] Settlement (off-chain)')` — omit wallet addresses |
| `services/solana.js` | 260-263 | `console.log('[Solana] Refund (off-chain):', { player: playerAddress, amount: wagerSOL })` | `logger.info({ amount: wagerSOL }, '[Solana] Refund (off-chain)')` — omit player address |

**Non-sensitive logs may remain as console.log** — no requirement to convert all logging.

### Pattern 5: IM-05 — 128-bit Terrain Seed Entropy

**Constraint:** `seededRandom()` in `physics.js` uses mulberry32, which operates on a 32-bit integer via `s |= 0`. A 128-bit value passed directly would be truncated to 32 bits. This constraint is inherent in the algorithm.

**Solution:** Generate 128 bits of CSPRNG entropy; derive a 32-bit seed from the first 4 bytes for the PRNG; store and send the full 128-bit hex string as the audit/fairness seed.

```javascript
// In socket-io/main.js — replaces line 2291:
// BEFORE:
// const seed = crypto.randomInt(1000000)

// AFTER:
// Generate 128 bits CSPRNG entropy
const fullSeed = crypto.randomBytes(16).toString('hex');
// Derive 32-bit value for mulberry32 (uses first 4 bytes)
const seed32 = parseInt(fullSeed.slice(0, 8), 16) >>> 0;

const { path, heightmap } = generateTerrain(1200, 800, seed32);
const tankPositions = generateTankPositions(heightmap);
const wind = generateWind();

// Store full 128-bit seed for auditability
room.terrainSeed = fullSeed;
// ...

// In the terrainGenerated emit (around line 2325-2330):
io.to(roomId).emit('terrainGenerated', {
    path,
    heightmap,
    tankPositions,
    seed: fullSeed,  // Changed from numeric seed32 to full 128-bit hex
    wind,
    // ...
});
```

**Client impact:** Client receives `seed` in `terrainGenerated` event but only uses `path`, `heightmap`, `tankPositions`, `wind` — does not use `seed` for terrain regeneration (verified in `client/src/scenes/main/index.js:432`). Changing seed from number to hex string is safe for client.

**Why `parseInt(fullSeed.slice(0,8), 16) >>> 0`:**
- `slice(0,8)` takes the first 8 hex chars = 4 bytes = 32 bits
- `parseInt(..., 16)` parses as hex
- `>>> 0` converts to unsigned 32-bit integer (mulberry32 expects unsigned)

### Anti-Patterns to Avoid

- **Don't use `Math.random()` for any game-critical generation** — not CSPRNG, predictable.
- **Don't hash the seed for the PRNG with a slow hash** — `parseInt(slice)` is instant; SHA-256 is overkill for deriving a seed.
- **Don't redact in format strings** — `'wallet: ' + walletAddress.slice(0,8)` is still a leak (partial exposure). Log without any wallet data.
- **Don't add `io.use()` middleware after `io.on('connection')`** — middleware must be registered before the connection handler to intercept it.
- **Don't use `socket.handshake.address` alone on Render** — Render is a reverse proxy; the real client IP is in `x-forwarded-for`.
- **Don't apply `requireAdminKey` to `/health`** — `render.yaml` configures `healthCheckPath: /health`; if `/health` returns 401, Render marks the service as unhealthy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sensitive field redaction | Custom `sanitize(obj)` functions | pino `redact` paths | pino redact handles nested paths, arrays, wildcards; custom code misses new log sites |
| Per-IP rate limiting | Custom request counter in global var | `io.use()` Map-based counter (as shown) | Simple Map approach is correct for this scale; no npm package needed |
| CSPRNG hex generation | Custom byte-to-hex loop | `crypto.randomBytes(16).toString('hex')` | Built-in; auditable; no deps |

**Key insight:** None of these problems require npm packages beyond pino. The existing crypto module, Express, and Socket.IO APIs provide everything needed.

## Common Pitfalls

### Pitfall 1: Render Reverse Proxy IP Address

**What goes wrong:** `socket.handshake.address` returns `::ffff:10.x.x.x` (Render's internal load balancer IP) instead of the real client IP, making all connections appear to be from the same host.
**Why it happens:** Render terminates SSL and proxies connections through their infrastructure.
**How to avoid:** Always use `x-forwarded-for` first: `socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address`
**Warning signs:** All IPs in the Map are the same internal Render IP; connection limiting fires incorrectly.

### Pitfall 2: seededRandom 32-bit Truncation

**What goes wrong:** Passing a large BigInt or hex string directly to `seededRandom(seed)` — the `s |= 0` operation truncates to a signed 32-bit integer, silently discarding all but the low 32 bits.
**Why it happens:** JavaScript bitwise OR coerces operands to 32-bit signed integers per spec.
**How to avoid:** Always derive the numeric seed via `parseInt(fullSeed.slice(0,8), 16) >>> 0` before passing to `generateTerrain()`. The `>>> 0` ensures unsigned interpretation.
**Warning signs:** Two 128-bit seeds differing only in the upper 96 bits produce identical terrain.

### Pitfall 3: Redacting Non-Object Log Calls

**What goes wrong:** pino's `redact` only works when the redacted field is passed as a property of the first object argument: `logger.info({ wallet: addr }, 'msg')`. Template literals like `logger.info('[Auth] wallet: ' + addr)` are NOT redacted.
**Why it happens:** pino redact operates on the structured data object, not on the message string.
**How to avoid:** Never put sensitive values in the message string. Pass them as object properties and let redact remove them. Or simply omit sensitive values from the log entirely.
**Warning signs:** `[REDACTED]` not appearing in output where expected.

### Pitfall 4: Breaking /health with Auth Guard

**What goes wrong:** Applying `requireAdminKey` to `/health` causes Render's health checker to receive 401 and repeatedly restart the service.
**Why it happens:** `render.yaml` configures `healthCheckPath: /health` — Render polls this without auth headers.
**How to avoid:** Only protect `/stats`, never `/health`. The auth guard belongs on `app.get('/stats', requireAdminKey, getStats)`.
**Warning signs:** Service shows as "unhealthy" in Render dashboard after deploying the auth guard.

### Pitfall 5: npm ci --ignore-scripts Breaks a prepare Script

**What goes wrong:** If a dependency has a `prepare` script that compiles native code, `--ignore-scripts` will skip it, causing runtime `MODULE_NOT_FOUND` errors.
**Why it happens:** `--ignore-scripts` suppresses all lifecycle hooks including `prepare` which is needed by some native addons.
**How to avoid:** Confirmed — SolShot server has NO `prepare`, `postinstall`, or `preinstall` scripts in its own `package.json`. Review if any dependency requires native compilation. (Current dependencies are all pure JS; no native addons present.)
**Warning signs:** Build succeeds but `node index.js` fails with module errors.

### Pitfall 6: IP Counter Map Memory Leak

**What goes wrong:** If a socket disconnects during the middleware (before `next()` is called), the `disconnect` listener registered in middleware may not fire, leaving the IP count permanently incremented.
**Why it happens:** Socket.IO docs note: "The Socket instance is not actually connected when the middleware gets executed... no disconnect event will be emitted if the connection eventually fails."
**How to avoid:** Register the decrement handler and trust that normal disconnections will trigger it. For the extreme case (middleware-stage drops), the count is bounded: Render restarts are infrequent, and the Map naturally self-corrects as connections cycle. Optionally: use a TTL-based cleanup interval to reset stale entries.
**Warning signs:** `ipConnectionCounts` Map grows unboundedly; legitimate users get blocked.

## Code Examples

### IM-01: render.yaml Build Command

```yaml
# Source: npm official docs (https://docs.npmjs.com/cli/v9/commands/npm-ci/)
# render.yaml line 16
    buildCommand: npm ci --ignore-scripts
```

### IM-02: Express Auth Middleware (reusable)

```javascript
// Source: existing codebase pattern from KM-05 (index.js:93-95)
// server/middleware/adminAuth.js (or append to guards.js)
export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// index.js usage:
// app.get('/stats', requireAdminKey, getStats);   // protected
// app.get('/health', healthCheck);                 // remains public
```

### IM-03: Socket.IO Per-IP Connection Limiting

```javascript
// Source: Socket.IO middleware docs (https://socket.io/docs/v4/middlewares/)
// Place in index.js immediately after io = new socket.Server(...)

const MAX_CONNECTIONS_PER_IP = 100; // success criterion threshold
const ipConnectionCounts = new Map();

io.use((socket, next) => {
    const ip = (socket.handshake.headers['x-forwarded-for'] || '')
                    .split(',')[0]
                    .trim()
               || socket.handshake.address;

    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }

    ipConnectionCounts.set(ip, current + 1);

    socket.on('disconnect', () => {
        const count = ipConnectionCounts.get(ip) || 1;
        if (count <= 1) {
            ipConnectionCounts.delete(ip);
        } else {
            ipConnectionCounts.set(ip, count - 1);
        }
    });

    next();
});
```

### IM-04: Pino Logger with Redaction

```javascript
// Source: pino redaction docs (https://github.com/pinojs/pino/blob/main/docs/redaction.md)
// server/services/logger.js
import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'walletAddress',
            'wallet',
            'winner',
            'loser',
            'player',
            'p1wallet',
            'p2wallet',
            'winnerAddress',
            'loserAddress',
            '*.walletAddress',
            '*.wallet',
        ],
        censor: '[REDACTED]',
    },
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
});

export default logger;
```

```javascript
// Usage — replacing sensitive console.log calls:
// BEFORE: console.log(`[Auth] Socket ${client.id} authenticated as ${result.walletAddress}`)
// AFTER:
logger.info({ socketId: client.id }, '[Auth] Socket authenticated');

// BEFORE: console.log(`[SHOT] Loaded state for ${walletAddress}: tier=${state.prestigeTier}, balance=${state.balance}`)
// AFTER:
logger.info({ tier: state.prestigeTier, wageredMatches: state.wageredMatchesPlayed }, '[SHOT] Loaded player state');

// BEFORE: console.log('[Solana] Settlement (off-chain):', { winner: winnerAddress, winnerSOL: settlement.winner, ... })
// AFTER:
logger.info({ winnerSOL: settlement.winner, treasurySOL: settlement.treasury, totalPot }, '[Solana] Settlement (off-chain)');
```

### IM-05: 128-bit Terrain Seed

```javascript
// Source: Node.js crypto docs (https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
// In socket-io/main.js — replaces line 2291

// Generate 128 bits of CSPRNG entropy
const fullSeed = crypto.randomBytes(16).toString('hex');
// Derive 32-bit unsigned int for mulberry32 PRNG (uses first 4 bytes = 32 bits)
const seed32 = parseInt(fullSeed.slice(0, 8), 16) >>> 0;

const { path, heightmap } = generateTerrain(1200, 800, seed32);
const tankPositions = generateTankPositions(heightmap);
const wind = generateWind();

room.heightmap = heightmap;
room.terrainSeed = fullSeed;  // Store full 128-bit hex, not the truncated 32-bit
room.wind = wind;
// ...

// In terrainGenerated emit:
io.to(roomId).emit('terrainGenerated', {
    path,
    heightmap,
    tankPositions,
    seed: fullSeed,  // Send 128-bit hex to client (client stores but does not use for generation)
    wind,
    firstTurn: ms ? ms.currentTurn : null,
    seq: ms ? ms.turnSequence : 0,
});
```

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|------------------|----------------------|
| `npm install` in CI | `npm ci --ignore-scripts` | IM-01: prevents malicious lifecycle scripts |
| Unauthenticated stats endpoint | Auth-guarded via `x-admin-key` | IM-02: blocks financial metric exposure |
| No per-IP Socket.IO limit | `io.use()` middleware Map counter | IM-03: prevents connection floods |
| `console.log` with wallet strings | pino with `redact` paths | IM-04: no PII in production logs |
| `crypto.randomInt(1000000)` (~20-bit) | `crypto.randomBytes(16)` (128-bit) | IM-05: terrain unpredictable |

**Deprecated/outdated:**
- `npm install` in production CI: replaced by `npm ci` (deterministic, lock-file-enforced) since npm 5+
- `pino-noir` package: superseded by pino's built-in `redact` option (pino v5+); do not use pino-noir

## Open Questions

1. **MAX_CONNECTIONS_PER_IP value**
   - What we know: Success criterion says "more than 100 connections rejected" — so limit must be ≤ 100
   - What's unclear: Is the limit checked (≥ 100) or strictly (> 100)? I.e., is the 100th connection rejected or the 101st?
   - Recommendation: Set `MAX_CONNECTIONS_PER_IP = 5` for realistic game protection; the test verifying success criterion should attempt 6+ connections from same IP and confirm the 6th is rejected. Or set to 100 if the criterion is literally "reject beyond 100."

2. **pino-pretty in production**
   - What we know: `pino-pretty` is a dev dependency for human-readable logs; production should use JSON
   - What's unclear: Whether any log aggregation service (e.g., Render's log viewer) parses JSON automatically
   - Recommendation: Default to JSON in production (`NODE_ENV === 'production'`). The conditional transport pattern handles this.

3. **x-forwarded-for trust on Render**
   - What we know: Render is a reverse proxy; it sets `x-forwarded-for`
   - What's unclear: Whether `x-forwarded-for` can be spoofed by clients (some proxies append client-supplied values)
   - Recommendation: Render's docs indicate their infrastructure controls the header. Use `split(',')[0]` to get the leftmost IP (original client). This is the standard pattern.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `server/render.yaml`, `server/package.json`, `server/index.js`, `server/services/physics.js`, `server/services/monitoring.js`, `server/services/solana.js`, `server/services/shot-token.js`, `server/socket-io/main.js`, `server/middleware/guards.js`
- Socket.IO official docs: https://socket.io/docs/v4/middlewares/ — middleware pattern for connection limiting
- Socket.IO official docs: https://socket.io/docs/v4/server-options/ — confirmed no built-in maxConnections per-IP
- pino redaction docs: https://github.com/pinojs/pino/blob/main/docs/redaction.md — redact paths API, wildcard patterns, censor config
- Node.js crypto built-in — `randomBytes`, `randomInt` (platform built-in, no docs URL needed)
- npm cli docs: https://docs.npmjs.com/cli/v9/commands/npm-ci/ — `--ignore-scripts` flag behavior

### Secondary (MEDIUM confidence)
- WebSearch + betterstack.com: pino v10.3.1 is latest (Feb 9, 2026); pino v9→v10 only breaking change is Node 18 support drop (redact API unchanged)
- WebSearch + github.com/npm/cli/issues/2434: `npm ci --ignore-scripts` bug fixed in npm v7.4.0 (Jan 2021); Node 18+ ships npm 9+, not affected
- engine.io GitHub issue #504: `allowRequest` receives IncomingMessage with `x-forwarded-for` header access

### Tertiary (LOW confidence)
- Render proxy behavior with `x-forwarded-for` — assumed standard reverse proxy behavior; not explicitly documented in Render's public YAML spec

## Metadata

**Confidence breakdown:**
- IM-01 (render.yaml): HIGH — single line change, verified no breaking scripts, fix is trivial
- IM-02 (/stats auth): HIGH — exact pattern exists in codebase at KM-05, no new concepts
- IM-03 (connection limit): HIGH — Socket.IO middleware pattern verified against official docs; IP extraction pattern verified via engine.io issue
- IM-04 (pino redact): HIGH — pino official docs confirm redact API; specific log lines identified in codebase
- IM-05 (terrain seed): HIGH — mulberry32 truncation verified by code inspection and node test; fix verified as correct

**Research date:** 2026-02-23
**Valid until:** 2026-05-23 (stable libraries; 90 days)
