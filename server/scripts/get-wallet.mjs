/**
 * One-shot lookup: print the full wallet address for a user (matched
 * by username/handle substring, case-insensitive).
 *
 * Usage (from /server):
 *   node scripts/get-wallet.mjs <substring>
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const needle = process.argv[2];
if (!needle) {
    console.error('Usage: node scripts/get-wallet.mjs <substring>');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const rx = new RegExp(needle, 'i');
const matches = await User.find(
    { $or: [{ username: rx }, { handle: rx }] },
    { walletAddress: 1, telegramUserId: 1, username: 1, handle: 1 }
).lean();

if (!matches.length) {
    console.log(`No users match /${needle}/i`);
} else {
    for (const u of matches) {
        const handle = u.username ? `@${u.username}` : (u.handle || '(no handle)');
        console.log(`${handle.padEnd(22)} tg=${u.telegramUserId || '(none)'}`);
        console.log(`  wallet: ${u.walletAddress || '(none)'}`);
    }
}

await mongoose.disconnect();
