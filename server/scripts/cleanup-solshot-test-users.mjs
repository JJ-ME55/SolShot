/**
 * One-shot cleanup: delete obvious test users + duplicate / fallback-named
 * SolShot players from the User collection. Per JJ's 2026-06-03 call
 * surfacing the messy roster on the Arcade leaderboard.
 *
 * Deletion criteria:
 *   1. Joke / test handles  → TankyTester, hahahah, hahahahah, StraightShooter
 *      (case-insensitive against handle OR username)
 *   2. OPERATIVE — fallback display name. Users with stats.matchesPlayed >= 1
 *      who have no handle, no username, no telegramUserId. These appear on
 *      the LB as "OPERATIVE" via formatDisplayName.
 *   3. Duplicate TRENCHDEMON69 — case-insensitive on handle OR username.
 *      Keep the doc with the most matchesPlayed; drop the rest.
 *
 * Usage (from /server):
 *   node scripts/cleanup-solshot-test-users.mjs           # dry-run, prints plan
 *   node scripts/cleanup-solshot-test-users.mjs --execute # actually deletes
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const EXECUTE = process.argv.includes('--execute');

const JOKE_HANDLES = ['TankyTester', 'hahahah', 'hahahahah', 'StraightShooter'];
const DUPLICATE_HANDLE = 'trenchDemon69';

if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set in env');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

function fmt(u) {
    const handle = u.handle ? `h:${u.handle}` : '';
    const uname = u.username ? `u:${u.username}` : '';
    const id = [handle, uname].filter(Boolean).join(' / ') || '(unnamed)';
    const tg = u.telegramUserId || '(no tg)';
    const m = u.stats?.matchesPlayed || 0;
    const w = u.stats?.wins || 0;
    const l = u.stats?.losses || 0;
    return `  ${id.padEnd(40)}  tg=${String(tg).padEnd(12)}  matches=${String(m).padEnd(3)}  W-L=${w}-${l}`;
}

const toDelete = [];

// 1. Joke / test handles — match either handle OR username, case-insensitive
const jokeQuery = {
    $or: JOKE_HANDLES.flatMap((h) => [
        { handle: { $regex: `^${h}$`, $options: 'i' } },
        { username: { $regex: `^${h}$`, $options: 'i' } },
    ]),
};
const jokeMatches = await User.find(jokeQuery, {
    handle: 1, username: 1, telegramUserId: 1, stats: 1,
}).lean();
console.log(`\nJoke / test handles → ${jokeMatches.length} candidate(s):`);
for (const u of jokeMatches) {
    console.log(fmt(u));
    toDelete.push(u);
}

// 2. OPERATIVE fallback — users with matches but no callsign or tg identity.
//    These display as "OPERATIVE" via formatDisplayName on the LB.
const operativeMatches = await User.find(
    {
        'stats.matchesPlayed': { $gte: 1 },
        $and: [
            { $or: [{ handle: null }, { handle: '' }, { handle: { $exists: false } }] },
            { $or: [{ username: null }, { username: '' }, { username: { $exists: false } }] },
            { $or: [{ telegramUserId: null }, { telegramUserId: { $exists: false } }] },
        ],
    },
    { handle: 1, username: 1, telegramUserId: 1, stats: 1, walletAddress: 1 }
).lean();
console.log(`\nOPERATIVE fallback (no name + no tg, has matches) → ${operativeMatches.length} candidate(s):`);
for (const u of operativeMatches) {
    console.log(fmt(u));
    toDelete.push(u);
}

// 3. Duplicate TRENCHDEMON69 — case-insensitive on either field. Keep top by matchesPlayed.
const trenchMatches = await User.find(
    {
        $or: [
            { handle: { $regex: `^${DUPLICATE_HANDLE}$`, $options: 'i' } },
            { username: { $regex: `^${DUPLICATE_HANDLE}$`, $options: 'i' } },
        ],
    },
    { handle: 1, username: 1, telegramUserId: 1, stats: 1 }
).lean();
trenchMatches.sort(
    (a, b) => (b.stats?.matchesPlayed || 0) - (a.stats?.matchesPlayed || 0)
);
const keepTrench = trenchMatches[0];
const dropTrench = trenchMatches.slice(1);
console.log(`\n${DUPLICATE_HANDLE} dedupe → ${trenchMatches.length} total. Keeping top by matchesPlayed:`);
if (keepTrench) console.log(`  KEEP  ${fmt(keepTrench).trim()}`);
for (const u of dropTrench) {
    console.log(`  DROP  ${fmt(u).trim()}`);
    toDelete.push(u);
}

// Dedupe to-delete by _id (in case multiple criteria match same user)
const uniqueById = new Map();
for (const u of toDelete) {
    uniqueById.set(String(u._id), u);
}
const finalList = [...uniqueById.values()];

console.log(`\n──────────────────────────────────────────────`);
console.log(`Total users to delete: ${finalList.length}`);
console.log(`Mode: ${EXECUTE ? 'EXECUTE (hard delete)' : 'DRY-RUN (no changes)'}`);
console.log(`──────────────────────────────────────────────\n`);

if (!finalList.length) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
}

if (!EXECUTE) {
    console.log('Re-run with --execute to actually delete these users.');
    await mongoose.disconnect();
    process.exit(0);
}

const ids = finalList.map((u) => u._id);
const result = await User.deleteMany({ _id: { $in: ids } });
console.log(`Deleted: ${result.deletedCount} User document(s).`);

await mongoose.disconnect();
