/**
 * Privy access-token verification.
 *
 * Validates an `Authorization: Bearer <token>` header on inbound HTTP
 * requests against Privy's public key. Returns the decoded claims
 * (userId, sessionId, appId) on success, throws on failure.
 *
 * Production hardening for /api/wallet/link-from-tg-token: previously
 * the magic-link token alone authorized the bind. With JWT verify
 * enforced, an attacker would also need a valid Privy session for the
 * wallet they're claiming — the threat model lifts from "TG-DM-only
 * intercept" to "Privy-session-also-compromised" which is materially
 * stronger.
 *
 * Graceful rollout: if PRIVY_APP_ID + PRIVY_APP_SECRET aren't both
 * configured (e.g. dev mode, or Render env not yet set), verification
 * is skipped and we log a warning. Once both are set in production,
 * enforcement turns on automatically with no code change.
 *
 * Set on Render:
 *   PRIVY_APP_ID     = cmorbf1nk00z10cidg6jitsgm  (same as client public)
 *   PRIVY_APP_SECRET = <from dashboard.privy.io → SolShot → API Keys>
 */

import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';

let privy = null;
let initWarned = false;

function getClient() {
    if (privy) return privy;
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
        if (!initWarned) {
            console.warn('[privyAuth] PRIVY_APP_ID or PRIVY_APP_SECRET not configured — JWT verification disabled (dev mode). Set both on Render for production hardening.');
            initWarned = true;
        }
        return null;
    }
    privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
    console.log('[privyAuth] Initialized — JWT verification enabled');
    return privy;
}

/**
 * Express middleware: verifies the Privy access token in the
 * Authorization header. On success, sets req.privyUserId and
 * req.privyAuth (full claims). On failure, returns 401.
 *
 * Skipped (passes through) if Privy isn't configured server-side —
 * lets dev mode keep working without enforcing verification.
 *
 * @param {object} options
 * @param {boolean} [options.required=false] — If true, missing token
 *   returns 401 even when Privy is configured. If false, missing
 *   token passes through (caller decides what to do with un-verified
 *   request).
 */
export function requirePrivyAuth(options = {}) {
    const { required = false } = options;
    return async (req, res, next) => {
        const client = getClient();
        if (!client) {
            // H002 fix — when `required: true`, never silently pass through.
            // Production must reject if Privy isn't configured (was: silent fail-open
            // because PRIVY_APP_SECRET absent in render.yaml made every required-auth
            // endpoint completely ungated).
            if (required) {
                if (process.env.NODE_ENV === 'production') {
                    console.error('[privyAuth] Refusing request: required=true but Privy is not configured. Set PRIVY_APP_ID + PRIVY_APP_SECRET.');
                    return res.status(503).json({ error: 'auth_not_configured' });
                }
                // Dev fallback: pass through so local development keeps working,
                // but log loudly so the gap is visible.
                console.warn('[privyAuth] DEV-MODE pass-through on required=true endpoint. Set PRIVY env vars for parity.');
                req.privyAuth = null;
                req.privyUserId = null;
                return next();
            }
            // Soft mode — pass through unverified
            return next();
        }

        const auth = req.headers.authorization || '';
        const match = auth.match(/^Bearer\s+(.+)$/i);
        const token = match ? match[1] : null;

        if (!token) {
            if (required) {
                return res.status(401).json({ error: 'missing_authorization_header' });
            }
            // Soft mode — allow through but mark unverified
            req.privyAuth = null;
            req.privyUserId = null;
            return next();
        }

        try {
            const verified = await client.verifyAuthToken(token);
            req.privyAuth = verified;
            req.privyUserId = verified.userId; // Privy DID
            return next();
        } catch (err) {
            console.warn('[privyAuth] Token verification failed:', err?.message || err);
            // Soft mode: log + pass through unverified. Caller decides
            // what to do with req.privyAuth = null (e.g. magic-link
            // endpoint has its own primary auth and falls back to it).
            // Strict mode: reject 401 so caller can't slip past.
            if (required) {
                return res.status(401).json({ error: 'invalid_or_expired_token' });
            }
            req.privyAuth = null;
            req.privyUserId = null;
            return next();
        }
    };
}

/**
 * Lower-level helper: verify a token directly without express middleware.
 * Returns the decoded claims, or null on any failure.
 *
 * Useful when verification is desired but graceful — caller decides
 * what to do with null vs verified claims (e.g. "log unverified, allow
 * through" vs "reject 401").
 */
export async function verifyPrivyToken(token) {
    const client = getClient();
    if (!client || !token) return null;
    try {
        return await client.verifyAuthToken(token);
    } catch (err) {
        console.warn('[privyAuth] verifyPrivyToken failed:', err?.message || err);
        return null;
    }
}

export function isPrivyAuthConfigured() {
    return !!(PRIVY_APP_ID && PRIVY_APP_SECRET);
}
