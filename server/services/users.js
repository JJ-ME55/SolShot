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
    firstName = null,
}) {
    if (!telegramUserId || typeof telegramUserId !== 'number') return null;

    // Identity-policy A: TG username is the canonical display name. If a
    // user has a TG @handle, that's their SolShot display name everywhere
    // (leaderboard, in-game labels, AAR, bot replies). first_name fallback
    // for users with no @handle. The caller-supplied `handle` only
    // matters for browser-only users who never had TG identity.
    //
    // This explicitly OVERWRITES previously-set callsigns. Per JJ:
    // "we just run it with whatever I want, I think A". Few users today,
    // so the migration cost is near-zero.
    const canonicalHandle = username || firstName || handle || null;

    const baseSet = { telegramUserId, lastActive: new Date() };
    if (canonicalHandle) baseSet.handle = canonicalHandle;
    if (username)        baseSet.username = username;

    try {
        // ─── Step 1: Telegram ID is the canonical merge target ─────────
        // Once a User doc has a telegramUserId, that's the most stable
        // identity for that human. Wallet addresses can rotate (Dynamic
        // can re-provision); browser uid resets when localStorage clears;
        // but the TG account id is set by Telegram and persists forever.
        //
        // CRITICAL: search by telegramUserId FIRST. If found, augment
        // with wallet/uid as the user picks them up over time. This is
        // what allows TG-only testers (today, pre-Dynamic) to seamlessly
        // gain a wallet later without orphaning stats.
        const existingByTg = await User.findOne({ telegramUserId });
        if (existingByTg) {
            const update = { ...baseSet };

            // Attach wallet only if (a) doc has none yet, (b) we can
            // safely claim it. Three cases:
            //   1. No conflict → just attach, normal path
            //   2. Conflict is an "orphan" (no telegramUserId on the
            //      conflicting doc — pure Privy sign-in artifact) →
            //      consume the orphan: copy any non-trivial state we'd
            //      want to preserve, then delete it, then attach. This
            //      is the typical "/play after signing in" sequence
            //      and the previous "skip with warning" behaviour was
            //      blocking it permanently.
            //   3. Conflict has a different telegramUserId (real
            //      duplicate user, two TG accounts claiming same
            //      wallet) → refuse + warn, manual merge needed.
            if (walletAddress && !existingByTg.walletAddress) {
                const conflict = await User.findOne({
                    walletAddress,
                    _id: { $ne: existingByTg._id },
                }).lean();
                if (!conflict) {
                    update.walletAddress = walletAddress;
                    console.log(`[users] linked wallet ${walletAddress.slice(0, 8)}… to tg ${telegramUserId}`);
                } else if (!conflict.telegramUserId) {
                    // Orphan — consume it. Delete the empty Privy-only
                    // doc and attach its wallet to our TG-keyed doc.
                    await User.deleteOne({ _id: conflict._id });
                    update.walletAddress = walletAddress;
                    console.log(`[users] consumed orphan ${conflict._id} → linked wallet ${walletAddress.slice(0, 8)}… to tg ${telegramUserId}`);
                } else {
                    // Real conflict — wallet belongs to a different TG
                    // user. Refuse + warn; manual merge required.
                    console.warn(`[users] cannot link wallet to tg ${telegramUserId} — wallet already on User ${conflict._id} (tg ${conflict.telegramUserId})`);
                }
            }

            // Same defensive check for uid (browser session id).
            if (uid && !existingByTg.uid) {
                const conflict = await User.findOne({
                    uid,
                    _id: { $ne: existingByTg._id },
                }).lean();
                if (!conflict) {
                    update.uid = uid;
                }
            }

            return await User.findOneAndUpdate(
                { telegramUserId },
                { $set: update },
                { returnDocument: 'after' }
            ).lean();
        }

        // ─── Step 2: No TG-keyed doc — fall through to wallet ──────────
        // User exists by wallet (e.g. they played on web first), now
        // opening Mini App for the first time and adding the TG link.
        if (walletAddress) {
            const existingByWallet = await User.findOne({ walletAddress });
            if (existingByWallet) {
                console.log(`[users] linked tg ${telegramUserId} to existing wallet User ${existingByWallet._id}`);
                return await User.findOneAndUpdate(
                    { walletAddress },
                    { $set: baseSet },
                    { returnDocument: 'after' }
                ).lean();
            }
        }

        // ─── Step 3: Try uid (browser-session-keyed doc) ───────────────
        if (uid) {
            const existingByUid = await User.findOne({ uid });
            if (existingByUid) {
                const update = { ...baseSet };
                // Opportunistically attach wallet if doc has none + no
                // conflict elsewhere (same logic as Step 1).
                if (walletAddress && !existingByUid.walletAddress) {
                    const conflict = await User.findOne({
                        walletAddress,
                        _id: { $ne: existingByUid._id },
                    }).lean();
                    if (!conflict) update.walletAddress = walletAddress;
                }
                return await User.findOneAndUpdate(
                    { uid },
                    { $set: update },
                    { returnDocument: 'after' }
                ).lean();
            }
        }

        // ─── Step 4: Brand-new identity — create the User doc ──────────
        // No prior record exists for any of telegramUserId, walletAddress,
        // or uid. Insert a fresh User keyed on whatever we know.
        const insert = { ...baseSet };
        if (walletAddress) insert.walletAddress = walletAddress;
        if (uid)           insert.uid = uid;
        const newUser = new User(insert);
        await newUser.save();
        return newUser.toObject();
    } catch (err) {
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

/**
 * Get the top N players by wins for in-chat leaderboard display.
 * Excludes players with zero matches. Tiebreaker: fewer matches played
 * (higher win rate ranks better).
 *
 * Also filters out users without a real callsign — legacy test docs that
 * predate HandleModal lock-in had no `handle` set, which surfaced as
 * a stack of "OPERATIVE OPERATIVE OPERATIVE" rows on the public board
 * (AJVD QA pass May 8). Users with a non-null trimmed `handle` only.
 *
 * @param {number} [limit=10]
 * @returns {Promise<Array<{ handle, stats: { wins, losses, matchesPlayed, totalDamage } }>>}
 */
export async function getTopPlayers(limit = 10) {
    try {
        return await User.find(
            {
                'stats.matchesPlayed': { $gte: 1 },
                handle: { $exists: true, $nin: [null, ''] },
            },
            { handle: 1, 'stats.wins': 1, 'stats.losses': 1, 'stats.matchesPlayed': 1, 'stats.totalDamage': 1 }
        )
            .sort({ 'stats.wins': -1, 'stats.matchesPlayed': 1 })
            .limit(limit)
            .lean();
    } catch (err) {
        console.warn('[users] getTopPlayers failed:', err.message);
        return [];
    }
}

/**
 * Compute a player's leaderboard rank (1-indexed). Same sort order as
 * getTopPlayers (wins desc, matchesPlayed asc).
 *
 * @param {number} telegramUserId
 * @returns {Promise<number|null>} Rank (1-based) or null if no matches played
 */
export async function getPlayerRank(telegramUserId) {
    if (!telegramUserId) return null;
    try {
        const me = await User.findOne(
            { telegramUserId },
            { 'stats.wins': 1, 'stats.matchesPlayed': 1 }
        ).lean();
        if (!me?.stats || (me.stats.matchesPlayed || 0) === 0) return null;

        const myWins = me.stats.wins || 0;
        const myMatches = me.stats.matchesPlayed || 0;

        const ahead = await User.countDocuments({
            'stats.matchesPlayed': { $gte: 1 },
            $or: [
                { 'stats.wins': { $gt: myWins } },
                { 'stats.wins': myWins, 'stats.matchesPlayed': { $lt: myMatches } },
            ],
        });
        return ahead + 1;
    } catch (err) {
        console.warn('[users] getPlayerRank failed:', err.message);
        return null;
    }
}
