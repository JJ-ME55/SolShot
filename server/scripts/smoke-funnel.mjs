#!/usr/bin/env node
// Smoke test for the V1 funnel instrumentation (S1-T2).
// Connects to MongoDB, writes synthetic FunnelEvent docs across all stages
// for two synthetic identities, reads back via getFunnelAggregates, prints
// the result, then cleans up.
//
// Run:
//   cd server && node scripts/smoke-funnel.mjs

import 'dotenv/config';
import mongoose from 'mongoose';
import FunnelEvent, { FUNNEL_STAGES } from '../models/FunnelEvent.js';
import { recordFunnelEvent, getFunnelAggregates } from '../services/funnel.js';

const TEST_TAG = 'smoke-test-funnel-2026-05-26';
const TEST_IDENTITIES = [
    { walletAddress: 'SMOKETEST_WALLET_A', telegramUserId: 991001 },
    { walletAddress: 'SMOKETEST_WALLET_B', telegramUserId: 991002 },
    { walletAddress: 'SMOKETEST_WALLET_C', telegramUserId: 991003 }, // drops at wallet_linked
    { uid: 'SMOKETEST_UID_D' }, // drops at register
];

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set in environment. Aborting.');
        process.exit(1);
    }

    console.log('[smoke] Connecting to Mongo...');
    await mongoose.connect(uri);
    console.log('[smoke] Connected.');

    // Clean any stale smoke-test docs from prior runs
    await FunnelEvent.deleteMany({ 'metadata.tag': TEST_TAG });

    // === EMIT SYNTHETIC EVENTS ===
    //
    // Funnel shape we're simulating (4 identities total):
    //
    //   register      → 4 (A, B, C, D)
    //   auth          → 3 (A, B, C)
    //   wallet_linked → 2 (A, B)
    //   first_deposit → 2 (A, B)
    //   first_settle  → 1 (A)   (B deposits but never settles)
    //
    // Expected retention: 1.0, 0.75, 0.67, 1.0, 0.5

    console.log('[smoke] Emitting synthetic events...');
    const metadata = { tag: TEST_TAG };

    // Stage 1: register — all four identities
    for (const id of TEST_IDENTITIES) {
        recordFunnelEvent('register', id, metadata);
    }

    // Stage 2: auth — first three (D never auths)
    for (let i = 0; i < 3; i++) {
        recordFunnelEvent('auth', TEST_IDENTITIES[i], metadata);
    }

    // Stage 3: wallet_linked — first two (C never links)
    for (let i = 0; i < 2; i++) {
        recordFunnelEvent('wallet_linked', TEST_IDENTITIES[i], metadata);
    }

    // Stage 4: first_deposit — first two
    for (let i = 0; i < 2; i++) {
        recordFunnelEvent('first_deposit', TEST_IDENTITIES[i], metadata);
        // Try dedupe — calling again should be a no-op
        recordFunnelEvent('first_deposit', TEST_IDENTITIES[i], metadata);
    }

    // Stage 5: first_settle — only first
    recordFunnelEvent('first_settle', TEST_IDENTITIES[0], metadata);
    // Dedupe attempt — should not produce a second row
    recordFunnelEvent('first_settle', TEST_IDENTITIES[0], metadata);

    // recordFunnelEvent is fire-and-forget; let async writes drain
    await new Promise((r) => setTimeout(r, 500));

    // === VERIFY RAW COUNTS ===
    console.log('[smoke] Raw counts per stage:');
    for (const stage of FUNNEL_STAGES) {
        const count = await FunnelEvent.countDocuments({ stage, 'metadata.tag': TEST_TAG });
        console.log(`  ${stage.padEnd(15)} : ${count}`);
    }

    // === RUN AGGREGATION ===
    console.log('\n[smoke] Aggregation via getFunnelAggregates("24h"):');
    const aggregates = await getFunnelAggregates('24h');
    console.log(JSON.stringify(aggregates, null, 2));

    // === VALIDATE ===
    console.log('\n[smoke] Validation:');
    const expectations = {
        register: 4,
        auth: 3,
        wallet_linked: 2,
        first_deposit: 2,
        first_settle: 1,
    };
    let pass = true;
    for (const stage of FUNNEL_STAGES) {
        const actual = await FunnelEvent.countDocuments({ stage, 'metadata.tag': TEST_TAG });
        const expected = expectations[stage];
        const ok = actual === expected;
        console.log(`  ${stage.padEnd(15)} : ${actual} (expected ${expected}) ${ok ? '✓' : '✗ FAIL'}`);
        if (!ok) pass = false;
    }

    // === CLEANUP ===
    const deleted = await FunnelEvent.deleteMany({ 'metadata.tag': TEST_TAG });
    console.log(`\n[smoke] Cleaned up ${deleted.deletedCount} test docs.`);

    await mongoose.disconnect();
    console.log(pass ? '\n[smoke] PASS ✓' : '\n[smoke] FAIL ✗');
    process.exit(pass ? 0 : 1);
}

main().catch((err) => {
    console.error('[smoke] ERROR:', err);
    mongoose.disconnect().finally(() => process.exit(1));
});
