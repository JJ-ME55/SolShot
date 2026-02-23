/**
 * SolShot Security Guards
 *
 * Reusable middleware for socket event handlers and Express routes:
 *   - requireAdminKey: gate admin HTTP endpoints behind x-admin-key header
 *   - requireAuth: gate wager-related events behind authentication
 *   - validatePayload: null-guard + type-check socket payloads
 *   - validateFireParams: dedicated fire handler input validation
 *   - sanitizeName: cap length + strip unsafe characters
 *   - withLock: async mutex to prevent concurrent settlement
 *   - safeHandler: try/catch wrapper for async socket handlers
 *
 * Fixes: H006, H015, H009, H017, H020, H062, IM-02
 */

import { trackError } from '../services/monitoring.js';

// ─── requireAdminKey ────────────────────────────────────────
// Express middleware — checks x-admin-key header against ADMIN_API_KEY env var.
// Returns 401 if key is missing, wrong, or ADMIN_API_KEY is not configured.
// Usage: app.get('/stats', requireAdminKey, getStats)
//
// Fixes: IM-02 — unauthenticated /stats endpoint exposing financial metrics

export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ─── requireAuth ────────────────────────────────────────────
// Checks client.isAuthenticated. Emits error if not authed.
// Returns true if authenticated, false otherwise.
// Usage: if (!requireAuth(client, 'createRoom')) return;
//
// Fixes: H006 — auth bypass (isAuthenticated never checked)

export function requireAuth(client, eventName) {
    if (!client.isAuthenticated) {
        client.emit(`${eventName}Error`, { reason: 'Authentication required' });
        return false;
    }
    return true;
}

// ─── validatePayload ────────────────────────────────────────
// Null-guards all socket payloads and validates field types.
// Schema format: { fieldName: 'number' | 'string' | 'object' | 'boolean' }
// Returns { valid: true } or { valid: false, reason: '...' }
//
// Fixes: H015 — null payload crash (destructure of undefined)

export function validatePayload(data, schema) {
    if (data === null || data === undefined || typeof data !== 'object') {
        return { valid: false, reason: 'Missing or invalid payload' };
    }

    for (const [field, expectedType] of Object.entries(schema)) {
        if (data[field] === undefined || data[field] === null) {
            return { valid: false, reason: `Missing field: ${field}` };
        }
        if (typeof data[field] !== expectedType) {
            return { valid: false, reason: `Invalid type for ${field}: expected ${expectedType}` };
        }
    }

    return { valid: true };
}

// ─── validateFireParams ─────────────────────────────────────
// Dedicated validator for the fire handler's numeric inputs.
// Checks Number.isFinite, range bounds, and integer for weaponId.
// Returns { valid: true } or { valid: false, reason: '...' }
//
// Fixes: H009 — NaN injection via fire handler

export function validateFireParams({ angle, power, weaponId }) {
    if (!Number.isFinite(angle)) {
        return { valid: false, reason: 'Invalid angle: must be a finite number' };
    }
    if (!Number.isFinite(power) || power < 0 || power > 100) {
        return { valid: false, reason: 'Invalid power: must be 0-100' };
    }
    if (!Number.isInteger(weaponId) || weaponId < 0) {
        return { valid: false, reason: 'Invalid weaponId: must be a non-negative integer' };
    }
    return { valid: true };
}

// ─── sanitizeName ───────────────────────────────────────────
// Caps name length at 20 characters, strips unsafe characters,
// trims whitespace. Falls back to 'Player' if input invalid.
//
// Fixes: H017 — megabyte player name broadcast

export function sanitizeName(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
        return 'Player';
    }
    // Allow alphanumeric, spaces, dashes, underscores, and periods
    const cleaned = name.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim();
    if (cleaned.length === 0) return 'Player';
    return cleaned.substring(0, 20);
}

// ─── withLock ───────────────────────────────────────────────
// Async mutex with timeout. Prevents concurrent execution per key.
// If fn hangs beyond timeoutMs, the lock auto-releases to prevent
// permanent deadlocks (e.g., Solana RPC never responds).
//
// Usage: await withLock('settle:roomId', async () => { ... })
//
// Fixes: H020 — double settlement race condition

const LOCK_TIMEOUT_MS = 30_000; // 30 seconds
const locks = new Map();

export async function withLock(key, fn, timeoutMs = LOCK_TIMEOUT_MS) {
    // Wait for any existing lock on this key
    while (locks.has(key)) {
        await locks.get(key);
    }

    // Create a new lock
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    locks.set(key, promise);

    // Deadlock safety net — auto-release after timeout
    const timer = setTimeout(() => {
        if (locks.get(key) === promise) {
            locks.delete(key);
            resolve();
            console.error(`[withLock] TIMEOUT: Lock "${key}" held for ${timeoutMs}ms — force-released (possible deadlock)`);
            trackError(new Error(`Lock timeout: ${key}`), 'lock_timeout');
        }
    }, timeoutMs);

    try {
        return await fn();
    } finally {
        clearTimeout(timer);
        locks.delete(key);
        resolve();
    }
}

// ─── safeHandler ────────────────────────────────────────────
// Returns a wrapper function that calls the handler inside
// try/catch. On error, logs and tracks via monitoring.
// Preserves socket context (this = client).
//
// Fixes: H062 — fire handler unhandled rejection

export function safeHandler(handlerFn) {
    return async function(...args) {
        try {
            await handlerFn.apply(this, args);
        } catch (err) {
            console.error(`[SafeHandler] Unhandled error in socket handler:`, err.message || err);
            trackError(err, 'socket_handler');
            // Don't re-throw — prevent unhandled rejection from killing process
        }
    };
}
