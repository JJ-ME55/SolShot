/**
 * One-shot manual patch — restore Elliot's 1008-pt free-kicks run.
 *
 * Context: 2026-06-02 17:52 UTC, Elliot (@ellzonchain) scored 1008 pts on
 * the-arcade-eta.vercel.app/play/free-kicks/launch. The POST to
 * /api/games/freekicks/score failed silently (likely network blip — server
 * `totalSubmissions` stayed at 37 confirming the request never reached
 * Render). At that point in time the hub's free-kicks `boot.js` was forked
 * from an older upstream commit that lacked the localStorage stash + retry-
 * on-boot path, so refresh didn't recover the score either.
 *
 * The fix shipped in 2026-06-02 commits:
 *   - JJ-ME55/The-Arcade e0456b013 (free-kicks boot.js retrofit)
 *   - JJ-ME55/The-Arcade bc0c3d7da (basketball + keepie-uppies retrofit)
 *
 * Future incidents like this self-heal via the new retry layer. This patch
 * restores Elliot's specific lost run because we know the score
 * (eyewitness screenshot from him in TG group chat).
 *
 * Idempotent: the `bestScore: { $lt: 1008 }` guard means re-running this
 * once it's applied is a no-op. It also can't accidentally lower a higher
 * score someone else has since posted.
 *
 * Usage (from /server):
 *   MONGODB_URI=<atlas-uri> node scripts/patch-elliot-1008.mjs
 *
 * Or with MONGODB_URI in .env:
 *   node scripts/patch-elliot-1008.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import FreeKicksScore from '../models/FreeKicksScore.js';

dotenv.config();

const TARGET_USERNAME = 'ellzonchain';
const NEW_BEST = 1008;
// Per Elliot's screenshot timestamp.
const ACHIEVED_AT = new Date('2026-06-02T17:52:00Z');

if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set (env var or .env). Aborting.');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

// 1. Pre-flight — show current state so we can verify before the write.
const before = await FreeKicksScore.findOne(
    { telegramUsername: TARGET_USERNAME },
    { telegramUserId: 1, telegramUsername: 1, firstName: 1, bestScore: 1, totalSubmissions: 1, bestAchievedAt: 1 }
).lean();

if (!before) {
    // Fallback: try case-insensitive partial — usernames can change but the
    // record is keyed by telegramUserId. If they renamed, this finds them.
    console.error(`[patch] No record with exact telegramUsername='${TARGET_USERNAME}'. Looking for partial matches...`);
    const candidates = await FreeKicksScore.find(
        { telegramUsername: { $regex: 'ellz', $options: 'i' } },
        { telegramUserId: 1, telegramUsername: 1, firstName: 1, bestScore: 1 }
    ).lean();
    if (candidates.length === 0) {
        console.error('[patch] No partial matches either. Manual investigation needed.');
        console.error('[patch] Try: db.freekicksscores.find({}, {telegramUsername:1, bestScore:1}).sort({bestScore:-1}).limit(20)');
    } else {
        console.error('[patch] Candidates found — re-run with the right username, or edit TARGET_USERNAME:');
        for (const c of candidates) console.error('  ', c);
    }
    await mongoose.disconnect();
    process.exit(2);
}

console.log('[patch] BEFORE:', {
    telegramUserId: before.telegramUserId,
    telegramUsername: before.telegramUsername,
    firstName: before.firstName,
    bestScore: before.bestScore,
    totalSubmissions: before.totalSubmissions,
    bestAchievedAt: before.bestAchievedAt,
});

if (before.bestScore >= NEW_BEST) {
    console.log(`[patch] Already has bestScore >= ${NEW_BEST} (${before.bestScore}). No-op.`);
    await mongoose.disconnect();
    process.exit(0);
}

// 2. The update — guarded so it can't lower a score and can't double-apply.
const after = await FreeKicksScore.findOneAndUpdate(
    { telegramUsername: TARGET_USERNAME, bestScore: { $lt: NEW_BEST } },
    {
        $set: {
            bestScore: NEW_BEST,
            bestAchievedAt: ACHIEVED_AT,
            lastSubmittedAt: new Date(),
        },
        $inc: { totalSubmissions: 1 },
    },
    { new: true, lean: true }
);

if (!after) {
    console.error('[patch] Update returned null — guard fired between the pre-flight read and the write. Re-run if needed.');
    await mongoose.disconnect();
    process.exit(3);
}

console.log('[patch] AFTER:', {
    telegramUserId: after.telegramUserId,
    telegramUsername: after.telegramUsername,
    bestScore: after.bestScore,
    totalSubmissions: after.totalSubmissions,
    bestAchievedAt: after.bestAchievedAt,
});

// 3. Post-flight — show the top 5 so we can eyeball leaderboard ordering.
const top5 = await FreeKicksScore.find(
    {},
    { telegramUsername: 1, firstName: 1, bestScore: 1, bestAchievedAt: 1 }
)
    .sort({ bestScore: -1, bestAchievedAt: 1 })
    .limit(5)
    .lean();

console.log('[patch] Top 5 after patch:');
for (const [i, row] of top5.entries()) {
    console.log(
        `  ${i + 1}. @${row.telegramUsername || row.firstName || row.telegramUserId} — ${row.bestScore} pts`
    );
}

await mongoose.disconnect();
console.log('[patch] Done.');
