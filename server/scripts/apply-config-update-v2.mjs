#!/usr/bin/env node
// S2-T1 / S2-T2: apply a pending config update after the 24h timelock elapses.
// Permissionless on-chain — anyone can pay the gas to call apply_config_update.
// Server authority pays gas in this script for convenience.
//
// DB audit #3 AUTH-N03 family fix: mirror the safety guards from
// propose-authority-v2.mjs — RPC mainnet allowlist when
// APPLY_CONFIG_NETWORK=mainnet, dry-run-by-default with
// APPLY_CONFIG_CONFIRM=YES gate, summary of what's being applied.
//
// Lower risk than the proposer/rotator scripts (this only finalises a
// previously-proposed state and the on-chain timelock blocks early calls),
// but the same guard pattern prevents accidental cluster mix-ups.
//
// Usage (from /server):
//   SOLANA_RPC=https://api.devnet.solana.com node scripts/apply-config-update-v2.mjs
//
// Will fail with TimelockNotElapsed if called too early (< 24h after
// the update_config that wrote the pending state). That's expected.

import { initKeys } from '../services/keys.js';
import { initEscrowV2, applyConfigUpdateV2, getConfigStateV2 } from '../services/escrow-v2.js';
import { assertMainnetRpcAllowlisted, fail, printDryRunReminder } from './_op_guards.mjs';

const RPC = process.env.SOLANA_RPC;
const CONFIRM = process.env.APPLY_CONFIG_CONFIRM;
const IS_MAINNET_ENV = process.env.APPLY_CONFIG_NETWORK === 'mainnet';

if (!RPC) fail('SOLANA_RPC env var required.');
if (IS_MAINNET_ENV) assertMainnetRpcAllowlisted(RPC);

if (!initKeys() || !initEscrowV2()) fail('Init failed.');

const pre = await getConfigStateV2();
if (!pre) fail('Could not fetch current config from chain.');

if (pre.pendingConfigTs === 0) {
    fail('No pending config to apply (pendingConfigTs is 0). Run update-config-v2.mjs first.');
}

const now = Math.floor(Date.now() / 1000);
const elapsedSinceProposal = now - pre.pendingConfigTs;
const timelockSecs = 24 * 3600;
const remaining = timelockSecs - elapsedSinceProposal;
const cluster = IS_MAINNET_ENV ? 'mainnet' : 'devnet';

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`  v2 apply_config_update — ${cluster.toUpperCase()}`);
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`  RPC               : ${RPC}`);
console.log(`  Proposal age      : ${elapsedSinceProposal}s (${(elapsedSinceProposal / 3600).toFixed(2)}h)`);
console.log(`  Timelock status   : ${remaining > 0 ? `NOT elapsed — ${remaining}s (${(remaining / 3600).toFixed(2)}h) remaining; TX will fail with TimelockNotElapsed` : 'elapsed (OK to apply)'}`);
console.log('  Pending state to apply:');
console.log(`    treasury        : ${pre.pendingTreasury ?? '(unchanged)'}`);
console.log(`    ops             : ${pre.pendingOps ?? '(unchanged)'}`);
console.log(`    feeBpsTreasury  : ${pre.pendingFeeBpsTreasury ?? '(unchanged)'}`);
console.log(`    feeBpsOps       : ${pre.pendingFeeBpsOps ?? '(unchanged)'}`);
console.log('════════════════════════════════════════════════════════════════════════\n');

if (CONFIRM !== 'YES') {
    printDryRunReminder({ confirmVar: 'APPLY_CONFIG_CONFIRM', isMainnet: IS_MAINNET_ENV, opLabel: 'apply_config_update TX' });
    process.exit(0);
}

console.log('Confirmation matched. Applying...\n');
const result = await applyConfigUpdateV2();
if (!result.success) fail(`apply_config_update failed: ${result.error}`);

console.log('TX:', result.txSignature);
const explorerCluster = IS_MAINNET_ENV ? '' : `?cluster=${cluster}`;
console.log(`Solscan: https://solscan.io/tx/${result.txSignature}${explorerCluster}`);
console.log('\nPost-apply config state (pending_* fields should be null, lastConfigUpdateTs set):');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
