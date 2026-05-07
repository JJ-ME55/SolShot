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

import crypto from 'node:crypto';
import { trackError } from '../services/monitoring.js';

// ─── requireAdminKey ────────────────────────────────────────
// Express middleware — checks x-admin-key header against ADMIN_API_KEY env var.
// Returns 401 if key is missing, wrong, or ADMIN_API_KEY is not configured.
// Usage: app.get('/stats', requireAdminKey, getStats)
//
// Fixes: IM-02 — unauthenticated /stats endpoint exposing financial metrics
//        H083 — timing-unsafe `!==` compare replaced with crypto.timingSafeEqual

export function requireAdminKey(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Constant-time comparison: convert both to fixed-length buffers.
    // Length mismatch → fail without revealing which length is correct.
    const a = Buffer.from(apiKey);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
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
    // Allow up to 115 for Overcharge consumable (exact cap enforced in fire handler)
    if (!Number.isFinite(power) || power < 0 || power > 115) {
        return { valid: false, reason: 'Invalid power: must be 0-115' };
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

// Profanity check for display names (shared with main.js logic)
const _PROF = [
    'nigger','nigga','niggers','niggas','negro','nig','coon','darkie','darky','sambo',
    'jigaboo','porchmonkey','spade','pickaninny','golliwog','buckwheat','uncletom',
    'kike','kyke','jewbag','jewboy','heeb','hymie','yid','zhid','jewfag','jew',
    'spic','spick','beaner','wetback','greaser','borderhopper',
    'chink','gook','slanteye','zipperhead','chinaman','chingchong','paki','raghead',
    'towelhead','cameljockey','sandnigger','muzzie','muzrat','jihadist',
    'redskin','injun','squaw','wagonburner',
    'mick','paddy','wop','dago','guinea','greaseball','kraut','polack',
    'gypo','pikey','tinker','halfbreed','mulatto','mongrel',
    'faggot','fag','faggy','dyke','lesbo','tranny','shemale','ladyboy','homo','sodomite',
    'battyboy','bugger','pansy','sissy',
    'retard','retarded','tard','spaz','spastic','mongoloid','mong','cripple','gimp',
    'fuck','fucker','fucked','fucking','fuckface','fuckhead','motherfucker','assfuck',
    'shit','shite','shithead','shitface','shitbag','shithole','bullshit',
    'bitch','biatch','bytch','biotch','bitchass',
    'cunt','kunt','dick','dickhead','dickface','dicksucker',
    'cock','cocksucker','cockhead','cockface',
    'pussy','penis','prick','asshole','arsehole','asswipe','assclown','asshat',
    'vagina','twat','snatch','clunge',
    'slut','slag','sket','whore','hooker','skank','hoe','thot',
    'cumslut','cumwhore','blowjob','handjob','gangbang','cumshot','dildo','buttfuck',
    'tits','titty','boob','boobs','nipple','nutsack','ballsack','schlong',
    'boner','cum','jizz','spunk','semen','wanker','wank','tosser','fap',
    'rape','rapist','molest','molester','pedo','pedophile','paedo','groomer',
    'kys','killself','killurself','killyourself','suicide','suicidal','selfharm',
    'lynch','genocide','massacre','decapitate','behead',
    'nazi','nazism','hitler','heil','siegheil','kkk','klan','kuklux',
    'aryan','whitepride','whitepower','1488','jihad','atomwaffen','boogaloo',
    'incel','femoid','foid','roastie',
    'admin','administrator','moderator','solshot','official','support','staff','developer','devteam',
    'cocaine','heroin','methamphetamine','crackhead','fentanyl',
    'dumbass','dipshit','dumbfuck','numbnuts','douchebag','scumbag','bellend','knobhead','gobshite',
];
const _PROF_RE = new RegExp(_PROF.join('|'), 'i');
function _norm(t) {
    return t.toLowerCase().replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e')
        .replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t').replace(/8/g,'b')
        .replace(/@/g,'a').replace(/\$/g,'s').replace(/!/g,'i')
        .replace(/(.)\1{1,}/g,'$1');
}

export function sanitizeName(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
        return 'Player';
    }
    // Allow alphanumeric, spaces, dashes, underscores, and periods
    const cleaned = name.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim();
    if (cleaned.length === 0) return 'Player';
    const capped = cleaned.substring(0, 20);
    // Profanity guard (strip allowlisted words first — e.g. jewel contains jew)
    const _ALLOW = /jewel|jewelry|jeweler|jewell/gi;
    const rawClean = capped.toLowerCase().replace(_ALLOW, '');
    const normClean = _norm(capped).replace(_ALLOW, '');
    if (_PROF_RE.test(rawClean) || _PROF_RE.test(normClean)) return 'Player';
    return capped;
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
