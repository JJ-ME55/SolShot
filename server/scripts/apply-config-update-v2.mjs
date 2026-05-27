#!/usr/bin/env node
// S2-T1 / S2-T2: apply a pending config update after the 24h timelock elapses.
// Permissionless on-chain — anyone can pay the gas to call apply_config_update.
// Server authority pays gas in this script for convenience.
//
// Usage (from /server):
//   node scripts/apply-config-update-v2.mjs
//
// Will fail with TimelockNotElapsed if called too early (< 24h after
// the update_config that wrote the pending state). That's expected.

import { initKeys } from '../services/keys.js';
import { initEscrowV2, applyConfigUpdateV2, getConfigStateV2 } from '../services/escrow-v2.js';

if (!initKeys() || !initEscrowV2()) {
    console.error('Init failed.');
    process.exit(1);
}

const pre = await getConfigStateV2();
console.log('Pre-apply config state:');
console.log(JSON.stringify(pre, null, 2));

if (pre.pendingConfigTs === 0) {
    console.error('\nNo pending config to apply (pendingConfigTs is 0). Run update-config-v2.mjs first.');
    process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const elapsedSinceProposal = now - pre.pendingConfigTs;
const timelockSecs = 24 * 3600;
const remaining = timelockSecs - elapsedSinceProposal;

console.log(`\nProposal age: ${elapsedSinceProposal}s (${(elapsedSinceProposal / 3600).toFixed(2)}h)`);
if (remaining > 0) {
    console.log(`Timelock NOT yet elapsed. ${remaining}s (${(remaining / 3600).toFixed(2)}h) remaining.`);
    console.log('Calling anyway to demonstrate the on-chain TimelockNotElapsed error...');
} else {
    console.log('Timelock elapsed. Applying...');
}

const result = await applyConfigUpdateV2();
if (!result.success) {
    console.error('\napply_config_update failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Solscan: https://solscan.io/tx/' + result.txSignature + '?cluster=devnet');
console.log('\nPost-apply config state (pending_* fields should be null, lastConfigUpdateTs set):');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
