#!/usr/bin/env node
// reconcile-wallets — one-shot pre-mainnet cleanup of stale wallet bindings.
//
// Background: before S2-T6 (DB H009 fix), linkTelegramIdentity would not
// update an existing walletAddress on a User doc. If Privy re-provisioned
// the user's embedded wallet between sign-ins, the DB silently kept the
// stale address — and any future settlement would route to the wrong wallet.
//
// This script:
//   1. Scans User docs with telegramUserId set
//   2. (Optional) for each, fetches the current embedded wallet from Privy
//   3. Reports discrepancies (--report mode, default)
//   4. Fixes them via updateWalletForTgUser (--fix mode)
//
// Privy lookup requires PRIVY_APP_ID + PRIVY_APP_SECRET. If those aren't
// set, the script runs in "summary-only" mode (counts + walletHistory stats,
// no Privy comparison). That's still useful as a pre-mainnet smoke.
//
// Usage:
//   cd server
//   node scripts/reconcile-wallets.mjs            # report mode, default
//   node scripts/reconcile-wallets.mjs --fix      # apply rotations live
//
// Idempotent. Safe to run multiple times.

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { updateWalletForTgUser } from '../services/users.js';

const MODE = process.argv.includes('--fix') ? 'fix' : 'report';
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_AVAILABLE = !!(PRIVY_APP_ID && PRIVY_APP_SECRET);

async function getPrivyClient() {
    if (!PRIVY_AVAILABLE) return null;
    try {
        const { PrivyClient } = await import('@privy-io/server-auth');
        return new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
    } catch (err) {
        console.warn('[reconcile] Privy SDK not available:', err.message);
        return null;
    }
}

/**
 * Look up the current embedded Solana wallet for a TG-linked Privy user.
 * Returns the base58 address or null if not found / no Solana wallet.
 */
async function lookupPrivyWallet(client, telegramUserId) {
    try {
        // Privy: find users by linked Telegram account.
        // The SDK's exact method name varies by version. Try `getUserByTelegramUserId`
        // first; fall back to filtering all users (slow but works).
        if (typeof client.getUserByTelegramUserId === 'function') {
            const privyUser = await client.getUserByTelegramUserId(telegramUserId);
            return findSolanaWalletInPrivyUser(privyUser);
        }
        // Fallback: no direct method. Caller can pass privyDid via DB
        // if we ever store it. For now, return null = "couldn't check".
        return null;
    } catch (err) {
        console.warn(`[reconcile] Privy lookup failed for tg ${telegramUserId}:`, err.message);
        return null;
    }
}

function findSolanaWalletInPrivyUser(privyUser) {
    if (!privyUser?.linkedAccounts) return null;
    for (const acct of privyUser.linkedAccounts) {
        if (acct.type === 'wallet' && acct.chainType === 'solana') {
            return acct.address;
        }
    }
    return null;
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('[reconcile] MONGODB_URI not set. Aborting.');
        process.exit(1);
    }

    console.log(`[reconcile] Mode: ${MODE.toUpperCase()}`);
    console.log(`[reconcile] Privy lookup: ${PRIVY_AVAILABLE ? 'ENABLED' : 'DISABLED (no PRIVY_APP_* env)'}`);
    console.log('');

    await mongoose.connect(uri);

    // ─── PHASE 1: DB summary ────────────────────────────────────────
    console.log('=== DB summary ===');
    const totalUsers = await User.countDocuments();
    const tgLinked = await User.countDocuments({ telegramUserId: { $ne: null } });
    const walletLinked = await User.countDocuments({ walletAddress: { $ne: null } });
    const both = await User.countDocuments({ telegramUserId: { $ne: null }, walletAddress: { $ne: null } });
    const withHistory = await User.countDocuments({ 'walletHistory.0': { $exists: true } });

    console.log(`  Total users:                ${totalUsers}`);
    console.log(`  With telegramUserId:        ${tgLinked}`);
    console.log(`  With walletAddress:         ${walletLinked}`);
    console.log(`  With BOTH TG + wallet:      ${both}`);
    console.log(`  With walletHistory (past rotations): ${withHistory}`);

    // Show top-N users by walletHistory length
    if (withHistory > 0) {
        console.log('\n  Users with most rotation history:');
        const rotators = await User.find(
            { 'walletHistory.0': { $exists: true } },
            { telegramUserId: 1, walletAddress: 1, walletHistory: 1, handle: 1 }
        ).sort({ 'walletHistory': -1 }).limit(5).lean();
        rotators.forEach((u) => {
            console.log(`    tg ${u.telegramUserId} (${u.handle || '-'}): ${u.walletHistory.length} prior wallet(s)`);
        });
    }
    console.log('');

    // ─── PHASE 2: Privy comparison (if available) ───────────────────
    if (!PRIVY_AVAILABLE) {
        console.log('=== Privy comparison: SKIPPED (set PRIVY_APP_ID + PRIVY_APP_SECRET to enable) ===');
        await mongoose.disconnect();
        console.log('\n[reconcile] Done (summary-only mode).');
        return;
    }

    console.log('=== Privy comparison ===');
    const client = await getPrivyClient();
    if (!client) {
        console.error('[reconcile] Privy client init failed. Aborting comparison.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const candidates = await User.find(
        { telegramUserId: { $ne: null }, walletAddress: { $ne: null } },
        { telegramUserId: 1, walletAddress: 1, handle: 1 }
    ).lean();

    let scanned = 0;
    let agreed = 0;
    let mismatched = 0;
    let unfetchable = 0;
    let fixed = 0;
    let fixFailed = 0;

    for (const u of candidates) {
        scanned++;
        const privyWallet = await lookupPrivyWallet(client, u.telegramUserId);
        if (!privyWallet) {
            unfetchable++;
            continue;
        }
        if (privyWallet === u.walletAddress) {
            agreed++;
            continue;
        }

        // Mismatch found
        mismatched++;
        console.log(`\n  MISMATCH for tg ${u.telegramUserId} (${u.handle || '-'}):`);
        console.log(`    DB has:       ${u.walletAddress}`);
        console.log(`    Privy reports: ${privyWallet}`);

        if (MODE === 'fix') {
            const result = await updateWalletForTgUser(u.telegramUserId, privyWallet, 'reconcile');
            if (result.ok) {
                console.log(`    ✓ FIXED`);
                fixed++;
            } else {
                console.log(`    ✗ FIX FAILED: ${result.reason}`);
                fixFailed++;
            }
        } else {
            console.log(`    (report mode — re-run with --fix to apply)`);
        }
    }

    console.log('\n=== Results ===');
    console.log(`  Scanned:       ${scanned}`);
    console.log(`  Agreed:        ${agreed}`);
    console.log(`  Mismatched:    ${mismatched}`);
    console.log(`  Unfetchable:   ${unfetchable}`);
    if (MODE === 'fix') {
        console.log(`  Fixed:         ${fixed}`);
        console.log(`  Fix failed:    ${fixFailed}`);
    }

    await mongoose.disconnect();
    console.log('\n[reconcile] Done.');
}

main().catch((err) => {
    console.error('[reconcile] ERROR:', err);
    mongoose.disconnect().finally(() => process.exit(1));
});
