#!/usr/bin/env node
// S2-T2: one-shot migration of the GlobalConfig PDA from pre-S2-T1 SPACE
// (110 bytes, no pending/last_update fields) to post-S2-T1 SPACE (231 bytes).
//
// Why this exists: when S2-T1 added pending_* + last_config_update_ts to the
// GlobalConfig struct, SPACE grew. The deployed devnet program will refuse
// to deserialize the old 110-byte account as the new 231-byte struct.
// migrate_config calls Anchor's `realloc` constraint to grow the account
// in place. New fields default to None / 0 (zero-byte serialization).
//
// Usage (from /server):
//   node scripts/migrate-config-v2.mjs
//
// Idempotent — re-running on an already-migrated PDA is a no-op (Anchor's
// realloc constraint compares current size to target).
//
// Devnet-only. Mainnet deploys with new SPACE from initialize_config genesis.

import { initKeys } from '../services/keys.js';
import { initEscrowV2, migrateConfigV2, getConfigStateV2 } from '../services/escrow-v2.js';

if (!initKeys() || !initEscrowV2()) {
    console.error('Init failed.');
    process.exit(1);
}

console.log('Pre-migrate config state (may fail to deserialize if old struct):');
try {
    const pre = await getConfigStateV2();
    console.log(JSON.stringify(pre, null, 2));
} catch (err) {
    console.log('(deserialization failed — this is expected if account is still 110 bytes)');
    console.log('  ', err.message);
}

console.log('\nCalling migrate_config...');
const result = await migrateConfigV2();
if (!result.success) {
    console.error('migrate_config failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Solscan: https://solscan.io/tx/' + result.txSignature + '?cluster=devnet');

console.log('\nPost-migrate config state (should now show pending_* and last_config_update_ts):');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
console.log('\nDone. PDA is now 231 bytes; pending_* fields are None/0.');
