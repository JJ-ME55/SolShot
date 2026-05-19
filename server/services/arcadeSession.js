/**
 * arcadeSession — cross-domain session handoff between The Arcade
 * (arcade.xyz) and SolShot (solshot.gg).
 *
 * Flow:
 *   1. Authenticated user on arcade.xyz taps the SolShot tile.
 *   2. Arcade client posts to POST /api/arcade/session-handoff with
 *      their Privy access token in the Authorization header.
 *   3. Server resolves the Privy DID → User doc → mints a short-lived
 *      handoff JWT containing { uid, walletAddress, telegramUserId,
 *      handle }. Returns the JWT.
 *   4. Arcade client redirects to `solshot.gg/?arcade_token=<jwt>`.
 *   5. SolShot client reads the token from URL, posts to
 *      POST /api/arcade/session-validate, gets the claims back,
 *      displays a welcome banner ("from The Arcade — <callsign>"),
 *      strips the URL param. If the user isn't already signed in
 *      via Privy on solshot.gg, the normal sign-in flow runs;
 *      Privy native session sharing across the same appId means most
 *      users won't see a re-prompt anyway. The token gives them a
 *      hint, not a session.
 *
 * Token is a stateless JWT (HS256). 10-min TTL bounds replay window.
 * Not single-use — same caveat as Privy access tokens. The data inside
 * is hints (callsign for the welcome banner), not authorisation —
 * SolShot's real auth still goes through Privy.
 *
 * Production secret: ARCADE_SESSION_SECRET env var, 48-byte base64url
 * recommended (same generation pattern as the standalone leaderboard
 * secrets). Dev fallback: ephemeral per-process random — tokens don't
 * survive restart but local iteration keeps working.
 *
 * Same modelling pattern as
 * `server/services/games/basketball-standalone/standaloneLeaderboard.js`.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ALG = 'HS256';
const SESSION_TTL = '10m';
const ISSUER = 'arcade:session-handoff';

let _devSecret = null;

function getSecret() {
    const secret = process.env.ARCADE_SESSION_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[arcadeSession] FATAL: ARCADE_SESSION_SECRET must be set in production');
            throw new Error('ARCADE_SESSION_SECRET missing');
        }
        if (!_devSecret) {
            console.warn('[arcadeSession] ARCADE_SESSION_SECRET not set — using ephemeral dev secret (tokens reset on process restart)');
            _devSecret = crypto.randomBytes(48).toString('base64url');
        }
        return _devSecret;
    }
    return secret;
}

/**
 * Mint a short-lived arcade→solshot handoff JWT.
 *
 * @param {Object} args
 * @param {string} args.uid                 - Privy DID (from req.privyUserId)
 * @param {string} [args.walletAddress]     - linked wallet, if any
 * @param {number} [args.telegramUserId]    - linked TG id, if any
 * @param {string} [args.handle]            - callsign (User.handle)
 * @returns {string} JWT
 */
export function mintArcadeSession({ uid, walletAddress, telegramUserId, handle }) {
    if (!uid || typeof uid !== 'string') {
        throw new Error('uid (Privy DID) required');
    }
    const payload = {
        uid,
        ...(walletAddress ? { wa: walletAddress } : {}),
        ...(telegramUserId ? { tg: telegramUserId } : {}),
        ...(handle ? { h: handle } : {}),
    };
    return jwt.sign(payload, getSecret(), {
        algorithm: ALG,
        expiresIn: SESSION_TTL,
        issuer: ISSUER,
    });
}

/**
 * Verify + decode an arcade→solshot handoff JWT. Throws on
 * invalid/expired/forged. Returns the same shape mintArcadeSession
 * was called with (minus the JWT exp/iat/iss claims).
 *
 * @param {string} token
 * @returns {{ uid: string, walletAddress?: string, telegramUserId?: number, handle?: string }}
 */
export function verifyArcadeSession(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('token required');
    }
    const decoded = jwt.verify(token, getSecret(), {
        algorithms: [ALG],
        issuer: ISSUER,
    });
    if (!decoded.uid || typeof decoded.uid !== 'string') {
        throw new Error('invalid session payload');
    }
    return {
        uid: decoded.uid,
        ...(decoded.wa ? { walletAddress: decoded.wa } : {}),
        ...(decoded.tg ? { telegramUserId: decoded.tg } : {}),
        ...(decoded.h ? { handle: decoded.h } : {}),
    };
}
