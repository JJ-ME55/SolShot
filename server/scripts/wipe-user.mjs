/**
 * One-shot user wipe — delete ALL User docs whose username/handle/tgUserId
 * matches a substring or exact-id match. Used for QA: clearing a tester's
 * Mongo state so they can re-run the new-user-bind flow from scratch.
 *
 * Usage (from /server):
 *   node scripts/wipe-user.mjs <substring-or-tg-id>
 *
 * Examples:
 *   node scripts/wipe-user.mjs Peralta            # all docs matching /Peralta/i
 *   node scripts/wipe-user.mjs 7937081650         # exact tg id match
 *
 * Prints affected docs BEFORE delete and asks via env var WIPE_CONFIRM=YES
 * to actually delete. Without confirmation, dry-runs.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const needle = process.argv[2];
if (!needle) {
    console.error('Usage: node scripts/wipe-user.mjs <substring-or-tg-id>');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const isNumericTgId = /^\d+$/.test(needle);
const filter = isNumericTgId
    ? { telegramUserId: Number(needle) }
    : {
        $or: [
            { username: new RegExp(needle, 'i') },
            { handle: new RegExp(needle, 'i') },
        ],
    };

const matches = await User.find(filter,
    { _id: 1, username: 1, handle: 1, telegramUserId: 1, walletAddress: 1, lastActive: 1 }
).lean();

if (!matches.length) {
    console.log(`No users match ${isNumericTgId ? 'tg=' + needle : '/' + needle + '/i'}`);
    await mongoose.disconnect();
    process.exit(0);
}

console.log(`Found ${matches.length} matching User doc(s):`);
for (const u of matches) {
    const handle = u.username ? `@${u.username}` : (u.handle || '(no handle)');
    console.log(`  ${handle.padEnd(22)} tg=${u.telegramUserId || '(none)'}  wallet=${u.walletAddress || '(none)'}  lastActive=${u.lastActive || '(none)'}`);
}

if (process.env.WIPE_CONFIRM !== 'YES') {
    console.log('\nDRY RUN — set WIPE_CONFIRM=YES to actually delete.');
    console.log('Example: WIPE_CONFIRM=YES node scripts/wipe-user.mjs ' + needle);
    await mongoose.disconnect();
    process.exit(0);
}

const result = await User.deleteMany(filter);
console.log(`\nDeleted ${result.deletedCount} doc(s).`);

await mongoose.disconnect();
