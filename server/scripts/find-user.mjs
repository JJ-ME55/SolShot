/**
 * One-shot lookup: find users by partial username/handle match (case-insensitive).
 *
 * Usage (from /server):
 *   node scripts/find-user.mjs <substring>
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const needle = process.argv[2];
if (!needle) {
    console.error('Usage: node scripts/find-user.mjs <substring>');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const rx = new RegExp(needle, 'i');
const matches = await User.find(
    { $or: [{ username: rx }, { handle: rx }] },
    { walletAddress: 1, telegramUserId: 1, username: 1, handle: 1, lastActive: 1 }
).lean();

if (!matches.length) {
    console.log(`No users match /${needle}/i`);
} else {
    console.log(`Found ${matches.length} match(es) for /${needle}/i:\n`);
    for (const u of matches) {
        const wallet = u.walletAddress
            ? u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-4)
            : '(no wallet)';
        const handle = u.username ? `@${u.username}` : (u.handle || '(no handle)');
        const tg = u.telegramUserId || '(no tg)';
        const last = u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 16) : '?';
        console.log(`  ${handle.padEnd(22)} tg=${String(tg).padEnd(12)} wallet=${wallet}  last=${last}`);
    }
}

await mongoose.disconnect();
