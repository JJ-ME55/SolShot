/**
 * Resolve which Privy user owns each wallet — or which wallets belong to
 * a given email. Bridges the "I don't recognize this wallet" gap.
 *
 * Usage (from /server, needs PRIVY_APP_ID + PRIVY_APP_SECRET):
 *
 *   # Look up by email substring (case-insensitive):
 *   node scripts/find-privy-owner.mjs --email replyguy
 *   node scripts/find-privy-owner.mjs --email thearcade
 *
 *   # Look up by wallet address (exact):
 *   node scripts/find-privy-owner.mjs --wallet 6ZSXPeF69DwGzhstxDdXBi5kUs2x4RnDb5f5pVdG5Saq
 *
 *   # Dump ALL Privy users (uses cursor pagination):
 *   node scripts/find-privy-owner.mjs --all
 *
 * For each match, prints:
 *   - Privy user id
 *   - All linkedAccounts (email, telegram, wallets, anything else)
 *   - Cross-references against SolShot Mongo (finds the User doc keyed
 *     on telegramUserId or walletAddress that matches)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { PrivyClient } from '@privy-io/server-auth';

dotenv.config();

const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
    console.error('PRIVY_APP_ID and PRIVY_APP_SECRET required. Copy from Render env.');
    process.exit(1);
}

const args = process.argv.slice(2);
const mode = args[0];
const value = args[1];

if (!['--email', '--wallet', '--all'].includes(mode)) {
    console.error('Usage: node scripts/find-privy-owner.mjs [--email <substring> | --wallet <address> | --all]');
    process.exit(1);
}

const privy = new PrivyClient(APP_ID, APP_SECRET);

await mongoose.connect(process.env.MONGODB_URI);

/**
 * Format a Privy user for display, with SolShot DB cross-reference.
 */
async function dumpUser(pUser) {
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log(`Privy user id : ${pUser.id}`);
    console.log(`Created       : ${pUser.createdAt ? new Date(pUser.createdAt).toISOString().slice(0, 16) : '?'}`);
    console.log(`Linked accounts (${pUser.linkedAccounts?.length || 0}):`);

    const walletAddrs = [];
    const tgIds = [];

    for (const acc of pUser.linkedAccounts || []) {
        switch (acc.type) {
            case 'email':
                console.log(`  email     : ${acc.address}`);
                break;
            case 'phone':
                console.log(`  phone     : ${acc.number}`);
                break;
            case 'telegram':
                console.log(`  telegram  : tg=${acc.telegramUserId}  username=@${acc.username || '(none)'}  firstName=${acc.firstName || '(none)'}`);
                tgIds.push(acc.telegramUserId);
                break;
            case 'wallet':
            case 'smart_wallet':
                console.log(`  ${acc.type.padEnd(10)}: ${acc.address}  (chain=${acc.chainType || acc.chain || '?'}, walletClientType=${acc.walletClientType || acc.connectorType || '?'})`);
                walletAddrs.push(acc.address);
                break;
            case 'google_oauth':
            case 'twitter_oauth':
            case 'discord_oauth':
            case 'apple_oauth':
                console.log(`  ${acc.type.padEnd(10)}: ${acc.email || acc.username || '(no identifier)'}`);
                break;
            default:
                console.log(`  ${acc.type.padEnd(10)}: ${JSON.stringify(acc).slice(0, 80)}…`);
        }
    }

    // SolShot DB cross-reference
    if (walletAddrs.length || tgIds.length) {
        const orClauses = [];
        if (walletAddrs.length) orClauses.push({ walletAddress: { $in: walletAddrs } });
        if (tgIds.length) orClauses.push({ telegramUserId: { $in: tgIds } });
        const matches = await User.find(
            { $or: orClauses },
            { handle: 1, username: 1, telegramUserId: 1, walletAddress: 1, 'stats.matchesPlayed': 1, lastActive: 1 }
        ).lean();
        if (matches.length) {
            console.log(`SolShot User docs matching this Privy user:`);
            matches.forEach((u) => {
                console.log(`  • ${u._id}  handle=${u.handle || '-'}  tg=${u.telegramUserId || '-'}  wallet=${u.walletAddress ? u.walletAddress.slice(0, 8) + '…' + u.walletAddress.slice(-4) : '-'}  matches=${u.stats?.matchesPlayed || 0}`);
            });
        } else {
            console.log(`SolShot DB: no matching User doc (Privy-only / never bound)`);
        }
    }
    console.log('');
}

try {
    if (mode === '--wallet') {
        if (!value) { console.error('--wallet needs an address'); process.exit(1); }
        // Privy SDK lookup by wallet
        try {
            const pUser = await privy.getUserByWalletAddress(value);
            if (!pUser) {
                console.log(`No Privy user owns wallet ${value}`);
            } else {
                await dumpUser(pUser);
            }
        } catch (err) {
            console.error('Privy lookup failed:', err.message);
        }
    } else if (mode === '--email') {
        if (!value) { console.error('--email needs a substring'); process.exit(1); }
        // Privy doesn't expose a "search by email substring" API — we have to page
        // through users and filter client-side. For dev environments this is fine.
        console.log(`Scanning all Privy users for email matching /${value}/i ...`);
        const needle = new RegExp(value, 'i');
        let cursor = undefined;
        let scanned = 0;
        let matched = 0;
        do {
            const page = await privy.getUsers({ cursor, limit: 100 });
            for (const u of page.data || []) {
                scanned++;
                const emailAccounts = (u.linkedAccounts || []).filter(a => a.type === 'email' && a.address && needle.test(a.address));
                const oauthEmails = (u.linkedAccounts || []).filter(a => a.email && needle.test(a.email));
                if (emailAccounts.length || oauthEmails.length) {
                    matched++;
                    await dumpUser(u);
                }
            }
            cursor = page.nextCursor;
        } while (cursor);
        console.log(`\nScanned ${scanned} Privy users, matched ${matched}.`);
    } else if (mode === '--all') {
        console.log('Dumping ALL Privy users (paginated)...\n');
        let cursor = undefined;
        let scanned = 0;
        do {
            const page = await privy.getUsers({ cursor, limit: 100 });
            for (const u of page.data || []) {
                scanned++;
                await dumpUser(u);
            }
            cursor = page.nextCursor;
        } while (cursor);
        console.log(`\nScanned ${scanned} Privy users total.`);
    }
} finally {
    await mongoose.disconnect();
}
