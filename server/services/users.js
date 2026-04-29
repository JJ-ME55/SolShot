/**
 * Users service — identity linking and lookup helpers.
 *
 * Identity sources for a single human:
 *   • walletAddress     — Solana wallet (Phantom/Solflare on web, Dynamic on TG)
 *   • uid               — anonymous browser-session id (always present once
 *                         the client emits `registerIdentity` on connect)
 *   • telegramUserId    — Telegram user id (from validated initData)
 *
 * On a TG-validated socket that ALSO authenticates a wallet, all three
 * collapse into one User document. linkTelegramIdentity does that upsert.
 *
 * Bot commands (/stats, /prestige, etc.) call lookupUserByTelegramId to
 * fetch the User by ctx.from.id.
 */

import User from '../models/User.js';

/**
 * Link a Telegram user id to a User document. Called when a socket has
 * BOTH validated TG initData AND an authenticated wallet (or uid) — the
 * server now knows these identities belong to the same human, so we
 * persist that link.
 *
 * Upsert priority:
 *   1. If walletAddress is provided, find by walletAddress and stamp telegramUserId
 *   2. Else if uid is provided, find by uid and stamp telegramUserId
 *   3. Else upsert by telegramUserId alone (TG-only user, no wallet yet)
 *
 * @param {object} args
 * @param {number} args.telegramUserId - Validated TG user id from initData
 * @param {string} [args.walletAddress] - Authenticated wallet address
 * @param {string} [args.uid] - Browser-session uid
 * @param {string} [args.handle] - Display callsign (best-effort sync)
 * @param {string} [args.username] - Telegram username (separate from handle)
 * @returns {Promise<object|null>} Updated User document (lean) or null on error
 */
export async function linkTelegramIdentity({
    telegramUserId,
    walletAddress = null,
    uid = null,
    handle = null,
    username = null,
}) {
    if (!telegramUserId || typeof telegramUserId !== 'number') return null;

    const set = { telegramUserId, lastActive: new Date() };
    if (handle)   set.handle = handle;
    if (username) set.username = username;

    try {
        // Priority 1: link to existing wallet-keyed user
        if (walletAddress) {
            const byWallet = await User.findOneAndUpdate(
                { walletAddress },
                { $set: set, $setOnInsert: { walletAddress } },
                { new: true, upsert: true }
            ).lean();
            return byWallet;
        }

        // Priority 2: link to existing uid-keyed user
        if (uid) {
            const byUid = await User.findOneAndUpdate(
                { uid },
                { $set: set, $setOnInsert: { uid } },
                { new: true, upsert: true }
            ).lean();
            return byUid;
        }

        // Priority 3: TG-only user (no wallet, no browser session)
        return await User.findOneAndUpdate(
            { telegramUserId },
            { $set: set, $setOnInsert: { telegramUserId } },
            { new: true, upsert: true }
        ).lean();
    } catch (err) {
        // Most likely: duplicate-key error if two User docs both claim the same
        // telegramUserId (multi-identity edge case). Log and bail; merge flow is
        // a separate v2 problem.
        console.warn('[users] linkTelegramIdentity failed:', err.message);
        return null;
    }
}

/**
 * Look up a User by Telegram user id. Returns lean object or null.
 * Used by bot commands for smart text replies.
 */
export async function lookupUserByTelegramId(telegramUserId) {
    if (!telegramUserId || typeof telegramUserId !== 'number') return null;
    try {
        return await User.findOne({ telegramUserId }).lean();
    } catch (err) {
        console.warn('[users] lookupUserByTelegramId failed:', err.message);
        return null;
    }
}
