/**
 * Throwaway: check devnet SOL balances of the wallets used in tonight's
 * 4P playtest, plus any others tied to recent trenchdemon69 / jj_me sessions.
 * Tells JJ which wallets need topping up for another 0.1-SOL 4P run.
 *
 * Usage (from /server):
 *   node scripts/check-playtest-balances.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import User from '../models/User.js';

dotenv.config();

const WAGER_SOL = 0.1;
const TX_BUFFER_SOL = 0.01; // generous — covers deposit TX fee + a few cents rent overhead
const REQUIRED_SOL = WAGER_SOL + TX_BUFFER_SOL;
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

await mongoose.connect(process.env.MONGODB_URI);

// Anyone active in the last 2 hours OR trenchdemon69/jj_me — catches the
// 4 fresh Privy wallets (replyguy55, thearcadeldn etc) AND legacy accounts
const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
const docs = await User.find(
    {
        $or: [
            { handle: /trenchdemon|jj_me/i },
            { username: /trenchdemon|jj_me/i },
            { lastActive: { $gte: twoHoursAgo } },
        ],
        walletAddress: { $ne: null, $exists: true },
    },
    { walletAddress: 1, telegramUserId: 1, handle: 1, username: 1, lastActive: 1, 'stats.matchesPlayed': 1 }
).sort({ lastActive: -1 }).lean();

// De-dupe by wallet — multiple docs can share the same wallet via walletHistory rotations
const seenWallets = new Set();
const wallets = [];
for (const u of docs) {
    if (!u.walletAddress || seenWallets.has(u.walletAddress)) continue;
    seenWallets.add(u.walletAddress);
    wallets.push({
        address: u.walletAddress,
        tg: u.telegramUserId,
        handle: u.handle || u.username || '-',
        matches: u.stats?.matchesPlayed || 0,
        lastActive: u.lastActive,
    });
}

await mongoose.disconnect();

console.log(`\nChecking ${wallets.length} wallets on ${RPC}\n`);
console.log(`Required per wallet: ${REQUIRED_SOL} SOL  (wager ${WAGER_SOL} + buffer ${TX_BUFFER_SOL})\n`);
console.log('═'.repeat(112));
console.log(
    'Wallet'.padEnd(46) +
    'Balance (SOL)'.padStart(15) +
    '  Status'.padEnd(14) +
    '  TG'.padEnd(14) +
    '  Matches'.padStart(10) +
    '  Last active'
);
console.log('═'.repeat(112));

const connection = new Connection(RPC, 'confirmed');
const results = await Promise.all(
    wallets.map(async (w) => {
        try {
            const lamports = await connection.getBalance(new PublicKey(w.address), 'confirmed');
            return { ...w, balanceSol: lamports / LAMPORTS_PER_SOL, ok: true };
        } catch (err) {
            return { ...w, error: err.message, ok: false };
        }
    })
);

// Sort: insufficient first (most urgent), then by balance asc
results.sort((a, b) => {
    const aHas = (a.balanceSol ?? -1) >= REQUIRED_SOL;
    const bHas = (b.balanceSol ?? -1) >= REQUIRED_SOL;
    if (aHas !== bHas) return aHas ? 1 : -1;
    return (a.balanceSol ?? 0) - (b.balanceSol ?? 0);
});

let funded = 0;
let needFunding = [];
for (const r of results) {
    if (!r.ok) {
        console.log(`${r.address}  ERROR: ${r.error}`);
        continue;
    }
    const sufficient = r.balanceSol >= REQUIRED_SOL;
    const status = sufficient ? '✓ OK   ' : '✗ TOP UP';
    const ago = r.lastActive ? Math.floor((Date.now() - new Date(r.lastActive)) / 1000 / 60 / 60) : '?';
    console.log(
        r.address.padEnd(46) +
        r.balanceSol.toFixed(4).padStart(15) +
        `  ${status}`.padEnd(14) +
        `  ${r.tg || '-'}`.padEnd(14) +
        `  ${r.matches}`.padStart(10) +
        `  ${ago}h ago`
    );
    if (sufficient) funded++;
    else needFunding.push(r);
}

console.log('═'.repeat(112));
console.log(`\n${funded} of ${results.length} wallets have enough for a 0.1 SOL match.\n`);

if (needFunding.length > 0) {
    console.log(`Wallets needing top-up (need at least ${REQUIRED_SOL} SOL each):\n`);
    needFunding.forEach((r) => {
        const deficit = REQUIRED_SOL - r.balanceSol;
        console.log(`  ${r.address}`);
        console.log(`    current: ${r.balanceSol.toFixed(4)} SOL  →  need +${deficit.toFixed(4)} (round up to 0.2 for headroom)`);
        console.log(`    TG: ${r.tg || 'none'}  handle: ${r.handle}\n`);
    });
    console.log(`Fund via: https://faucet.solana.com  →  pick "devnet"  →  paste address  →  2 SOL each`);
} else {
    console.log(`All wallets are funded. Ready for another 4P run.`);
}
