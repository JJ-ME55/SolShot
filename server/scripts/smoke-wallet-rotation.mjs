#!/usr/bin/env node
// Smoke test for S2-T6 updateWalletForTgUser helper.
//
// Verifies the four behaviors:
//   1. No-op when newWallet === existing (idempotent)
//   2. Initial attach when no walletAddress was set
//   3. Rotation: pushes prior to walletHistory + updates walletAddress
//   4. Conflict: refuses when another user has the new wallet
//
// Uses synthetic TG IDs in the 990xxx range to avoid colliding with real
// users. Cleans up after itself.
//
// Run:
//   cd server && node scripts/smoke-wallet-rotation.mjs

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { updateWalletForTgUser } from '../services/users.js';

const TEST_TAG = 'smoke-wallet-rotation-2026-05-27';
// 44-char base58-shaped strings — not real pubkeys but pass the shape check
const W_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const W_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const W_C = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const TG_PRIMARY = 990201;
const TG_OTHER   = 990202;
const TG_NEW     = 990203;

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
    await mongoose.connect(uri);

    // Clean up any prior runs
    await User.deleteMany({ telegramUserId: { $in: [TG_PRIMARY, TG_OTHER, TG_NEW] } });

    let pass = true;
    const check = (name, cond, detail = '') => {
        const ok = !!cond;
        console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
        if (!ok) pass = false;
    };

    // ─── Test 1: no-op on missing user ──────────────────────────────
    console.log('\n[1] No-op when user does not exist:');
    const r1 = await updateWalletForTgUser(TG_NEW, W_A, 'test');
    check('refuses with user_not_found', r1.ok === false && r1.reason === 'user_not_found');

    // ─── Setup: TG-only user with no wallet yet ─────────────────────
    await new User({ telegramUserId: TG_PRIMARY, handle: 'TestPrimary' }).save();

    // ─── Test 2: initial attach ─────────────────────────────────────
    console.log('\n[2] Initial wallet attach (no prior wallet):');
    const r2 = await updateWalletForTgUser(TG_PRIMARY, W_A, 'test');
    check('returns ok', r2.ok === true);
    check('rotated flag false (was a first attach, not a rotation)', r2.rotated === false);
    const u2 = await User.findOne({ telegramUserId: TG_PRIMARY }).lean();
    check('walletAddress now set', u2.walletAddress === W_A);
    check('walletHistory still empty', !u2.walletHistory || u2.walletHistory.length === 0);

    // ─── Test 3: idempotent (same wallet) ───────────────────────────
    console.log('\n[3] Idempotent — same wallet:');
    const r3 = await updateWalletForTgUser(TG_PRIMARY, W_A, 'test');
    check('returns ok', r3.ok === true);
    check('noop flag true', r3.noop === true);
    const u3 = await User.findOne({ telegramUserId: TG_PRIMARY }).lean();
    check('walletHistory still empty', !u3.walletHistory || u3.walletHistory.length === 0);

    // ─── Test 4: rotation ───────────────────────────────────────────
    console.log('\n[4] Rotation — different wallet:');
    const r4 = await updateWalletForTgUser(TG_PRIMARY, W_B, 'privy-rotation');
    check('returns ok', r4.ok === true);
    check('rotated flag true', r4.rotated === true);
    const u4 = await User.findOne({ telegramUserId: TG_PRIMARY }).lean();
    check('walletAddress is now W_B', u4.walletAddress === W_B);
    check('walletHistory has 1 entry', u4.walletHistory?.length === 1);
    check('walletHistory[0].address === W_A', u4.walletHistory?.[0]?.address === W_A);
    check('walletHistory[0].source recorded', u4.walletHistory?.[0]?.source === 'privy-rotation');

    // ─── Test 5: second rotation appends ────────────────────────────
    console.log('\n[5] Second rotation — appends to history:');
    const r5 = await updateWalletForTgUser(TG_PRIMARY, W_C, 'manual');
    check('returns ok', r5.ok === true);
    const u5 = await User.findOne({ telegramUserId: TG_PRIMARY }).lean();
    check('walletAddress is now W_C', u5.walletAddress === W_C);
    check('walletHistory has 2 entries', u5.walletHistory?.length === 2);
    check('history order preserved: A then B', u5.walletHistory?.[0]?.address === W_A && u5.walletHistory?.[1]?.address === W_B);

    // ─── Test 6: conflict — another user has the new wallet ─────────
    console.log('\n[6] Conflict — wallet belongs to another user:');
    await new User({ telegramUserId: TG_OTHER, walletAddress: W_A, handle: 'TestOther' }).save();
    const r6 = await updateWalletForTgUser(TG_PRIMARY, W_A, 'test');
    check('refused', r6.ok === false);
    check('reason is wallet_belongs_to_other_user', r6.reason === 'wallet_belongs_to_other_user');
    check('conflict.telegramUserId reported', r6.conflict?.telegramUserId === TG_OTHER);
    const u6 = await User.findOne({ telegramUserId: TG_PRIMARY }).lean();
    check('primary user wallet unchanged (still W_C)', u6.walletAddress === W_C);
    check('walletHistory unchanged (still 2 entries)', u6.walletHistory?.length === 2);

    // ─── Test 7: input validation ───────────────────────────────────
    console.log('\n[7] Input validation:');
    const r7a = await updateWalletForTgUser(null, W_A);
    check('null tgId rejected', r7a.ok === false);
    const r7b = await updateWalletForTgUser(TG_PRIMARY, '');
    check('empty wallet rejected', r7b.ok === false);
    const r7c = await updateWalletForTgUser(TG_PRIMARY, 'tooshort');
    check('shape-invalid wallet rejected', r7c.ok === false && r7c.reason === 'wallet_shape_invalid');

    // ─── Cleanup ────────────────────────────────────────────────────
    const deleted = await User.deleteMany({ telegramUserId: { $in: [TG_PRIMARY, TG_OTHER, TG_NEW] } });
    console.log(`\n[smoke] Cleaned up ${deleted.deletedCount} test docs.`);

    await mongoose.disconnect();
    console.log(pass ? '\n[smoke] PASS ✓' : '\n[smoke] FAIL ✗');
    process.exit(pass ? 0 : 1);
}

main().catch((err) => {
    console.error('[smoke] ERROR:', err);
    mongoose.disconnect().finally(() => process.exit(1));
});
