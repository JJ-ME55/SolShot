/**
 * Throwaway diagnostic for the 4P playtest unblock — full state dump on
 * every trenchdemon69 User doc so JJ can identify which wallet is which.
 *
 * Usage (from /server):
 *   node scripts/dump-trenchdemon.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const docs = await User.find(
    { handle: /trenchdemon|jj_me/i },
    {
        walletAddress: 1,
        walletHistory: 1,
        telegramUserId: 1,
        uid: 1,
        username: 1,
        handle: 1,
        lastActive: 1,
        createdAt: 1,
        'stats.matchesPlayed': 1,
        'stats.wins': 1,
        'stats.wageredMatchesPlayed': 1,
    }
).sort({ lastActive: -1 }).lean();

console.log(`Found ${docs.length} docs.\n`);
docs.forEach((u, i) => {
    const ago = u.lastActive ? Math.floor((Date.now() - new Date(u.lastActive)) / 1000 / 60 / 60) : null;
    console.log(`─── Doc ${i + 1} ─────────────────────────────────────`);
    console.log(`  _id          : ${u._id}`);
    console.log(`  handle       : ${u.handle || '(none)'}`);
    console.log(`  username     : ${u.username || '(none)'}`);
    console.log(`  telegramId   : ${u.telegramUserId || '(none)'}`);
    console.log(`  uid (browser): ${u.uid || '(none)'}`);
    console.log(`  walletAddress: ${u.walletAddress || '(none)'}`);
    if (u.walletHistory?.length) {
        console.log(`  prior wallets: ${u.walletHistory.length}`);
        u.walletHistory.forEach((h, j) => {
            console.log(`    [${j}] ${h.address} (${h.source}, ${new Date(h.timestamp).toISOString().slice(0, 16)})`);
        });
    }
    console.log(`  matchesPlayed: ${u.stats?.matchesPlayed || 0}  (wins: ${u.stats?.wins || 0}, wagered: ${u.stats?.wageredMatchesPlayed || 0})`);
    console.log(`  createdAt    : ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 16) : '?'}`);
    console.log(`  lastActive   : ${u.lastActive ? new Date(u.lastActive).toISOString().slice(0, 16) : '?'}  (${ago != null ? `${ago}h ago` : '?'})`);
    console.log('');
});

await mongoose.disconnect();
