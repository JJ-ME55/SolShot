#!/usr/bin/env node
// One-shot cleanup: collapse duplicate FunnelEvent rows for the one-shot
// stages ('first_deposit', 'first_settle') to a single row per identity.
//
// Why this exists: before S2-T8 hardening, oneShotInsert relied on
// findOneAndUpdate+upsert WITHOUT a backing unique index. Concurrent
// emissions for the same identity could race and produce duplicate rows.
// This script collapses the duplicates so the new sparse-unique partial-
// filter indexes (model file) can build cleanly.
//
// Idempotent. Safe to re-run.
//
// Usage:
//   cd server && node scripts/dedupe-funnel-oneshots.mjs

import 'dotenv/config';
import mongoose from 'mongoose';
import FunnelEvent from '../models/FunnelEvent.js';

const ONE_SHOT_STAGES = ['first_deposit', 'first_settle'];

async function dedupeStageByIdentity(stage, identityField, identityType) {
    const filter = {
        stage,
        [identityField]: { $type: identityType, $ne: null },
    };
    // Find identities that have >1 row
    const dupes = await FunnelEvent.aggregate([
        { $match: filter },
        {
            $group: {
                _id: `$${identityField}`,
                ids: { $push: '$_id' },
                count: { $sum: 1 },
                earliestTs: { $min: '$createdAt' },
                latestTs: { $max: '$createdAt' },
            },
        },
        { $match: { count: { $gt: 1 } } },
    ]);

    if (dupes.length === 0) {
        console.log(`  ${stage}/${identityField}: 0 duplicate identities`);
        return 0;
    }

    let removed = 0;
    for (const grp of dupes) {
        // Keep the earliest row, remove the rest
        const sortedRows = await FunnelEvent.find(
            { stage, [identityField]: grp._id },
            { _id: 1, createdAt: 1 }
        ).sort({ createdAt: 1 }).lean();

        const keep = sortedRows[0]._id;
        const toRemove = sortedRows.slice(1).map((r) => r._id);
        const result = await FunnelEvent.deleteMany({ _id: { $in: toRemove } });
        removed += result.deletedCount;
        console.log(`  ${stage}/${identityField}: ${grp._id} had ${grp.count} rows — kept ${keep}, removed ${result.deletedCount}`);
    }
    console.log(`  ${stage}/${identityField}: removed ${removed} duplicate rows total`);
    return removed;
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
    await mongoose.connect(uri);

    let totalRemoved = 0;
    for (const stage of ONE_SHOT_STAGES) {
        console.log(`\n=== ${stage} ===`);
        totalRemoved += await dedupeStageByIdentity(stage, 'walletAddress', 'string');
        totalRemoved += await dedupeStageByIdentity(stage, 'telegramUserId', 'number');
        totalRemoved += await dedupeStageByIdentity(stage, 'uid', 'string');
    }

    console.log(`\n[dedupe] Total duplicate rows removed: ${totalRemoved}`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('[dedupe] ERROR:', err);
    mongoose.disconnect().finally(() => process.exit(1));
});
