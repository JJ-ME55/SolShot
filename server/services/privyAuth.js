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
    // Bug 4 (2026-05-28): log APP_ID on init so we can correlate against client's
    // REACT_APP_PRIVY_APP_ID when "signature verification failed" surfaces. If the
    // two don't match, JWT signed for app A can never verify against app B's key.
    console.log(`[privyAuth] Initialized — JWT verification enabled (PRIVY_APP_ID=${PRIVY_APP_ID})`);
    return privy;
}

/**
 * Best-effort decode of a JWT's payload WITHOUT signature verification.
 * Used purely for diagnostic logging on verification failure — we want
 * to know WHAT failed (audience mismatch, expired, wrong issuer)
 * without re-trusting the token. Returns null if structure is malformed.
 */
function unsafeDecodeForLogging(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        // Base64URL → Base64 → JSON
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const json = Buffer.from(padded, 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch {
        return null;
    }
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
            // Bug 4 (2026-05-28): on failure, decode the token payload (no signature
            // check) so we can see WHAT mismatched. Print: endpoint URL, claim
            // audience (= which Privy app ID the token was signed FOR), claim
            // issuer, age relative to issue/exp. If aud !== our PRIVY_APP_ID,
            // that's the smoking gun for an APP_ID env mismatch.
            const claims = unsafeDecodeForLogging(token);
            const now = Math.floor(Date.now() / 1000);
            const ageSinceIssue = claims?.iat ? now - claims.iat : null;
            const secsUntilExpiry = claims?.exp ? claims.exp - now : null;
            const audMatchesEnv = claims?.aud === PRIVY_APP_ID;
            console.warn('[privyAuth] Token verification failed', {
                err: err?.message || String(err),
                endpoint: `${req.method} ${req.path}`,
                tokenAudience: claims?.aud || '(unparseable)',
                ourAppId: PRIVY_APP_ID,
                audMatchesEnv,
                issuer: claims?.iss || '(unparseable)',
                privyDid: claims?.sub || '(unparseable)',
                ageSinceIssueSecs: ageSinceIssue,
                secsUntilExpiry,
                expired: secsUntilExpiry != null && secsUntilExpiry < 0,
            });
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
        // Bug 4 (2026-05-28): same diagnostic dump as the middleware path.
        const claims = unsafeDecodeForLogging(token);
        const now = Math.floor(Date.now() / 1000);
        console.warn('[privyAuth] verifyPrivyToken failed', {
            err: err?.message || String(err),
            tokenAudience: claims?.aud || '(unparseable)',
            ourAppId: PRIVY_APP_ID,
            audMatchesEnv: claims?.aud === PRIVY_APP_ID,
            issuer: claims?.iss || '(unparseable)',
            privyDid: claims?.sub || '(unparseable)',
            ageSinceIssueSecs: claims?.iat ? now - claims.iat : null,
            secsUntilExpiry: claims?.exp ? claims.exp - now : null,
            expired: claims?.exp ? claims.exp - now < 0 : null,
        });
        return null;
    }
}

export function isPrivyAuthConfigured() {
    return !!(PRIVY_APP_ID && PRIVY_APP_SECRET);
}

/**
 * Fetch a Privy user's Telegram-linked account, if any.
 *
 * Called by the score-submit endpoints after verifying a Privy access
 * token to determine WHICH telegramUserId to write the score under. If
 * the user signed in via TG OAuth (or later called linkTelegram()),
 * Privy stores the bound TG identity in user.linkedAccounts[].
 *
 * Returns { telegramUserId, username, firstName } on success, or null
 * if the Privy user isn't linked to Telegram (email/Google/wallet-only).
 * Client surfaces "Link Telegram to save scores" inline error in that case.
 *
 * @param {string} privyUserId — the `userId` claim from a verified Privy token
 * @returns {Promise<{telegramUserId:number, username:string|null, firstName:string|null} | null>}
 */
export async function getTelegramAccountFromPrivy(privyUserId) {
    const client = getClient();
    if (!client || !privyUserId) return null;
    try {
        // PrivyClient.getUser returns the full user including linkedAccounts.
        const user = await client.getUser(privyUserId);
        const linked = Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : [];
        const tg = linked.find((a) => a && a.type === 'telegram');
        if (!tg) return null;
        const tgIdRaw = tg.telegramUserId ?? tg.subject ?? null;
        const tgId = tgIdRaw != null ? Number(tgIdRaw) : null;
        if (!Number.isFinite(tgId)) return null;
        return {
            telegramUserId: tgId,
            username: tg.username || null,
            firstName: tg.firstName || null,
        };
    } catch (err) {
        console.warn('[privyAuth] getTelegramAccountFromPrivy failed', {
            privyUserId,
            err: err?.message || String(err),
        });
        return null;
    }
}
