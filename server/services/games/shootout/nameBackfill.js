/**
 * One-shot backfill for ShootoutStats display names (2026-06-10).
 *
 * Until runner 948d2a7, runner.start() dropped displayName, so every
 * stats row persisted with the 'tg-<telegramUserId>' fallback — which
 * is what the public leaderboard then showed ('looks really bad for
 * new visitors', Fish). The runner fix stops NEW bad rows; this
 * backfill repairs the EXISTING ones at boot.
 *
 * Resolution order per bad row:
 *   1. SolShot User collection (artillery users share TG ids)
 *   2. Telegram getChat(tgId) via the arcade bot — works for anyone
 *      who has DM'd the bot (every bot-launched player has)
 *   3. 'Player <last4>' — clean fallback for guests / unresolvable ids
 *
 * Idempotent + self-retiring: only rows matching /^tg-\d+$/ are
 * touched, and every outcome rewrites displayName to something that
 * no longer matches, so subsequent boots find nothing to do. Failures
 * are logged and skipped — a Telegram hiccup must never block boot
 * (call this fire-and-forget AFTER server.listen).
 */

import ShootoutStats from '../../../models/ShootoutStats.js';
import User from '../../../models/User.js';

export async function backfillShootoutNames({ telegram } = {}) {
    const bad = await ShootoutStats.find({ displayName: /^tg-\d+$/ }).lean();
    if (bad.length === 0) {
        console.log('[shootout-backfill] no tg-<id> rows — nothing to do');
        return { fixed: 0, total: 0 };
    }
    console.log(`[shootout-backfill] repairing ${bad.length} placeholder name(s)`);
    let fixed = 0;
    for (const row of bad) {
        const tgId = row.telegramUserId;
        let name = null;
        // 1. SolShot User collection
        try {
            const u = await User.findOne({ telegramUserId: tgId }).lean();
            if (u?.username) name = `@${u.username}`;
        } catch (err) {
            console.warn('[shootout-backfill] User lookup failed for', tgId, err.message);
        }
        // 2. Telegram getChat via the arcade bot
        if (!name && telegram) {
            try {
                const chat = await telegram.getChat(tgId);
                if (chat?.username)         name = `@${chat.username}`;
                else if (chat?.first_name)  name = chat.first_name;
            } catch {
                // Expected for guests / users who never DM'd the bot.
            }
        }
        // 3. Clean fallback — still better than tg-<full id>
        if (!name) name = `Player ${String(tgId).slice(-4)}`;
        try {
            await ShootoutStats.updateOne(
                { telegramUserId: tgId, displayName: /^tg-\d+$/ },
                { $set: { displayName: name } },
            );
            fixed += 1;
            console.log(`[shootout-backfill] ${tgId} → ${name}`);
        } catch (err) {
            console.warn('[shootout-backfill] update failed for', tgId, err.message);
        }
    }
    console.log(`[shootout-backfill] done — ${fixed}/${bad.length} repaired`);
    return { fixed, total: bad.length };
}

export default { backfillShootoutNames };
