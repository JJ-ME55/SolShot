/**
 * walletLinkTokens — short-lived one-shot tokens that bind a Telegram
 * user to a wallet address discovered later in the PWA.
 *
 * Use case: user runs /link in the bot. We mint a 32-byte CSPRNG token
 * and DM them a URL like `https://solshot.gg/?linkToken=<token>`. When
 * they open it and Privy provisions a wallet, the client POSTs back
 * the (token, walletAddress) pair. We validate the token, stamp the
 * Telegram identity onto the User doc via linkTelegramIdentity, then
 * burn the token.
 *
 * Storage is in-memory (Map keyed by token). Tokens expire after 10
 * minutes and are removed on the first successful consume. A periodic
 * sweep removes expired entries so the Map can't grow unbounded if
 * tokens are minted but never consumed.
 *
 * Threat model (hackathon devnet scope):
 *   - Token is a 32-byte CSPRNG one-shot, delivered via Telegram DM.
 *   - 10-minute TTL bounds replay window if intercepted.
 *   - Consume is single-use (deleted on success).
 *   - Production-hardening TODO: verify a Privy access-token JWT
 *     server-side as well, so the wallet claim is provably owned by
 *     the user submitting the link request (not just "anyone with
 *     that address string"). Privy publishes a JWKS endpoint we can
 *     use with `jose`. For devnet, the random TG-DM'd token is
 *     sufficient.
 */
import crypto from 'crypto';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 10 * 60 * 1000;            // 10 min
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;        // 5 min

/**
 * @typedef {Object} TokenEntry
 * @property {number} telegramUserId
 * @property {string} [username]
 * @property {string} [firstName]
 * @property {number} expiresAt   - Unix ms
 */

/** @type {Map<string, TokenEntry>} */
const store = new Map();

let sweepTimer = null;

/**
 * Mint a fresh one-shot link token bound to a TG user.
 *
 * @param {object} args
 * @param {number} args.telegramUserId
 * @param {string} [args.username]
 * @param {string} [args.firstName]
 * @returns {{ token: string, expiresAt: number }}
 */
export function mintLinkToken({ telegramUserId, username, firstName }) {
    if (!telegramUserId || typeof telegramUserId !== 'number') {
        throw new Error('telegramUserId required');
    }
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    store.set(token, { telegramUserId, username, firstName, expiresAt });
    ensureSweeperRunning();
    return { token, expiresAt };
}

/**
 * Consume a token (single-use). Returns the bound TG identity or null
 * if the token is invalid, expired, or already consumed.
 *
 * @param {string} token
 * @returns {TokenEntry|null}
 */
export function consumeLinkToken(token) {
    if (!token || typeof token !== 'string') return null;
    const entry = store.get(token);
    if (!entry) return null;
    // Always delete on lookup — single-use semantics
    store.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
}

/**
 * Periodic sweep so abandoned (minted-but-never-consumed) tokens don't
 * accumulate forever. Runs every SWEEP_INTERVAL_MS once any token has
 * been minted.
 */
function ensureSweeperRunning() {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [token, entry] of store.entries()) {
            if (entry.expiresAt < now) store.delete(token);
        }
        // Stop the sweeper if the store has drained — saves a recurring
        // timer when no one is using the feature.
        if (store.size === 0) {
            clearInterval(sweepTimer);
            sweepTimer = null;
        }
    }, SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive solely for this sweeper.
    if (sweepTimer.unref) sweepTimer.unref();
}

/**
 * Test/diagnostic helper — returns the current size of the in-memory
 * token store. Not used in production code paths.
 */
export function _debugTokenStoreSize() {
    return store.size;
}
