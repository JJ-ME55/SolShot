/**
 * One-shot diagnostic: list every User doc that has a wallet bound.
 * Reports per-row TG identity + wallet + handle, plus a summary.
 *
 * Usage (from /server):
 *   node scripts/list-wallet-links.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const URI = process.env.MONGODB_URI;
if (!URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
}

await mongoose.connect(URI);

// Pull every user that has either a wallet OR a TG ID. We split into
// buckets so we can see who's properly linked vs orphaned vs TG-only.
const all = await User.find(
    { $or: [{ walletAddress: { $ne: null } }, { telegramUserId: { $ne: null } }] },
    { walletAddress: 1, telegramUserId: 1, username: 1, handle: 1, uid: 1, lastActive: 1 }
).lean();

const linked = all.filter(u => u.walletAddress && u.telegramUserId);
const walletOnly = all.filter(u => u.walletAddress && !u.telegramUserId);
const tgOnly = all.filter(u => !u.walletAddress && u.telegramUserId);

console.log('═══ WALLET LINK STATUS ═══\n');

console.log(`Total docs scanned: ${all.length}`);
console.log(`  Properly linked (wallet + TG): ${linked.length}`);
console.log(`  Wallet only (orphan / web-first): ${walletOnly.length}`);
console.log(`  TG only (no wallet bound yet): ${tgOnly.length}\n`);

if (linked.length) {
    console.log('─── Properly linked ───');
    for (const u of linked) {
        const wallet = u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-4);
        const handle = u.username ? `@${u.username}` : (u.handle || '(no handle)');
        const last = u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 16) : '?';
        console.log(`  ${handle.padEnd(20)} tg=${String(u.telegramUserId).padEnd(12)} wallet=${wallet}  last=${last}`);
    }
    console.log();
}

if (walletOnly.length) {
    console.log('─── Wallet-only (orphans) ───');
    for (const u of walletOnly) {
        const wallet = u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-4);
        const handle = u.handle || '(no handle)';
        const last = u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 16) : '?';
        console.log(`  ${handle.padEnd(20)} wallet=${wallet}  last=${last}`);
    }
    console.log();
}

if (tgOnly.length) {
    console.log('─── TG-only (no wallet bound) ───');
    for (const u of tgOnly) {
        const handle = u.username ? `@${u.username}` : (u.handle || '(no handle)');
        const last = u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 16) : '?';
        console.log(`  ${handle.padEnd(20)} tg=${u.telegramUserId}  last=${last}`);
    }
}

await mongoose.disconnect();
