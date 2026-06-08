/**
 * Standalone SHOOTOUT session-auth service.
 *
 * For the standalone FPS at fps-staking-game.vercel.app (embedded by
 * The Arcade hub + launched directly from the bot's `/shootout`
 * command). Mirrors the Basketball pattern: the bot mints a server-
 * signed JWT carrying the user's Telegram identity, the game receives
 * it via `?session=<jwt>` in the launch URL, decodes it client-side
 * for the local display name, and forwards `telegramUserId` over the
 * existing `shootout:lobby:*` + `shootout:input` sockets. Server
 * trusts the id and the existing lobby/match flow writes against the
 * real `User` record (ShootoutStats + ShootoutLobby are already keyed
 * by `telegramUserId`).
 *
 * Score submission is intentionally NOT in this module — Shootout
 * tracks its own per-match stats via the lifecycle / runner flow,
 * which writes to ShootoutStats keyed on telegramUserId. This file
 * is only the auth handoff.
 *
 * Public API:
 *   mintSession({telegramUserId, telegramUsername?, firstName?})
 *       → JWT string the arcade bot embeds in /shootout launch URL
 *   verifySession(token)
 *       → decoded TG identity, or throws on invalid/expired
 *
 * Companion env var: SHOOTOUT_LEADERBOARD_SECRET. Required in prod;
 * dev falls back to an ephemeral random secret with a one-time warn.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ─── JWT config ─────────────────────────────────────────────────────────

const ALG = 'HS256';
// 7 days — matches Basketball's hardened window. Bot users get a fresh
// JWT each /shootout tap; web Privy users get one per Arcade
// /api/arcade/mint-session call.
const SESSION_TTL = '7d';
const ISSUER = 'arcade-bot:shootout';

function getSecret() {
    const secret = process.env.SHOOTOUT_LEADERBOARD_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[shootout-leaderboard] FATAL: SHOOTOUT_LEADERBOARD_SECRET must be set in production');
            throw new Error('SHOOTOUT_LEADERBOARD_SECRET missing');
        }
        // Dev fallback — ephemeral, regenerated per process. Tokens
        // don't survive a restart but local iteration keeps working.
        if (!process.env._SHOOTOUT_DEV_SECRET_WARNED) {
            console.warn('[shootout-leaderboard] SHOOTOUT_LEADERBOARD_SECRET not set — using ephemeral dev secret');
            process.env._SHOOTOUT_DEV_SECRET_WARNED = '1';
            process.env._SHOOTOUT_DEV_SECRET = crypto.randomBytes(32).toString('hex');
        }
        return process.env._SHOOTOUT_DEV_SECRET;
    }
    return secret;
}

/**
 * Mint a session token for the standalone Shootout client.
 *
 * Called by:
 *   - arcadeBot.js GAMES.shootout.sessionMinter when a user taps
 *     /shootout in the bot
 *   - server/index.js POST /api/arcade/mint-session?game=shootout
 *     for Privy web users on thearcade.gg
 *
 * @param {Object} args
 * @param {number} args.telegramUserId   - required, numeric TG id
 * @param {string} [args.telegramUsername]
 * @param {string} [args.firstName]
 * @returns {string} JWT token
 */
export function mintSession({ telegramUserId, telegramUsername, firstName }) {
    if (!telegramUserId || typeof telegramUserId !== 'number') {
        throw new Error('telegramUserId required (number)');
    }
    const payload = {
        tg: telegramUserId,
        ...(telegramUsername ? { un: telegramUsername } : {}),
        ...(firstName ? { fn: firstName } : {}),
    };
    return jwt.sign(payload, getSecret(), {
        algorithm: ALG,
        expiresIn: SESSION_TTL,
        issuer: ISSUER,
    });
}

/**
 * Verify + decode a session token. Throws on invalid/expired/forged.
 *
 * Used server-side only (e.g. a future /api/shootout/* endpoint that
 * accepts client-supplied JWTs). The Shootout MP socket path doesn't
 * verify the JWT today — it trusts the telegramUserId in the wire
 * payload, same as SolShot. Tightening that is a wagering-blocker
 * task for later.
 *
 * @param {string} token
 * @returns {{telegramUserId: number, telegramUsername: string|null, firstName: string|null}}
 */
export function verifySession(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('session token required');
    }
    const decoded = jwt.verify(token, getSecret(), {
        algorithms: [ALG],
        issuer: ISSUER,
    });
    if (!decoded.tg || typeof decoded.tg !== 'number') {
        throw new Error('invalid session payload');
    }
    return {
        telegramUserId: decoded.tg,
        telegramUsername: decoded.un || null,
        firstName: decoded.fn || null,
    };
}

export default { mintSession, verifySession };
