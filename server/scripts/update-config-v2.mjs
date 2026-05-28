/**
 * One-shot script to PROPOSE v2 GlobalConfig changes (treasury/ops/fee BPS).
 *
 * S2-T1 (Bundle 1) update: this PROPOSES changes (writes to pending state).
 * Apply happens automatically 24h later via apply_config_update — or run the
 * apply-config-update-v2.mjs script after the timelock elapses.
 *
 * Authority rotation is SEPARATE — use propose-authority-v2.mjs +
 * accept-authority-v2.mjs (NEW key signs accept). NEW_AUTHORITY env var
 * here is now an ERROR (caller's likely intent is authority rotation,
 * which has its own flow).
 *
 * DB audit #3 AUTH-N03 family fix: mirror the safety guards from
 * propose-authority-v2.mjs — RPC mainnet allowlist when
 * UPDATE_CONFIG_NETWORK=mainnet, dry-run-by-default with
 * UPDATE_CONFIG_CONFIRM=YES gate, base58 validation of new pubkeys,
 * BPS bounds pre-flight.
 *
 * Usage (from /server):
 *   SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json \
 *   NEW_TREASURY_WALLET=<treasury_pubkey> \
 *   NEW_OPS_WALLET=<ops_pubkey> \
 *   NEW_FEE_BPS_TREASURY=700 \
 *   NEW_FEE_BPS_OPS=300 \
 *   node scripts/update-config-v2.mjs
 *
 * Any unset env var → field unchanged. After running, wait 24h then call
 * apply-config-update-v2.mjs (or any user can call apply_config_update on-chain).
 *
 * NOTE: Once applied, changes do NOT affect already-created MatchEscrows —
 * those snapshot their treasury/ops/fee BPS at create time. Only future matches
 * see the new values.
 */
import { PublicKey } from '@solana/web3.js';
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    updateConfigV2,
    getConfigStateV2,
} from '../services/escrow-v2.js';
import { assertMainnetRpcAllowlisted, fail, printDryRunReminder } from './_op_guards.mjs';

if (process.env.NEW_AUTHORITY) {
    fail('NEW_AUTHORITY is not supported via update_config (S2-T1 separation).\n  Use propose-authority-v2.mjs + accept-authority-v2.mjs for the 2-step authority rotation flow.');
}

const RPC = process.env.SOLANA_RPC;
const CONFIRM = process.env.UPDATE_CONFIG_CONFIRM;
const IS_MAINNET_ENV = process.env.UPDATE_CONFIG_NETWORK === 'mainnet';
const NEW_TREASURY = process.env.NEW_TREASURY_WALLET || null;
const NEW_OPS = process.env.NEW_OPS_WALLET || null;
const NEW_FEE_BPS_TREASURY = process.env.NEW_FEE_BPS_TREASURY != null ? Number(process.env.NEW_FEE_BPS_TREASURY) : null;
const NEW_FEE_BPS_OPS = process.env.NEW_FEE_BPS_OPS != null ? Number(process.env.NEW_FEE_BPS_OPS) : null;

if (!RPC) fail('SOLANA_RPC env var required.');
if (IS_MAINNET_ENV) assertMainnetRpcAllowlisted(RPC);

if (!NEW_TREASURY && !NEW_OPS && NEW_FEE_BPS_TREASURY == null && NEW_FEE_BPS_OPS == null) {
    fail('Pass at least one NEW_* env var.');
}

if (NEW_TREASURY) {
    try { new PublicKey(NEW_TREASURY); }
    catch { fail(`NEW_TREASURY_WALLET is not a valid base58 pubkey: "${NEW_TREASURY}"`); }
}
if (NEW_OPS) {
    try { new PublicKey(NEW_OPS); }
    catch { fail(`NEW_OPS_WALLET is not a valid base58 pubkey: "${NEW_OPS}"`); }
}
// Sanity bounds — on-chain enforces these too but we surface the failure locally.
if (NEW_FEE_BPS_TREASURY != null && (!Number.isInteger(NEW_FEE_BPS_TREASURY) || NEW_FEE_BPS_TREASURY < 0 || NEW_FEE_BPS_TREASURY > 10_000)) {
    fail(`NEW_FEE_BPS_TREASURY out of range (0-10000): ${NEW_FEE_BPS_TREASURY}`);
}
if (NEW_FEE_BPS_OPS != null && (!Number.isInteger(NEW_FEE_BPS_OPS) || NEW_FEE_BPS_OPS < 0 || NEW_FEE_BPS_OPS > 10_000)) {
    fail(`NEW_FEE_BPS_OPS out of range (0-10000): ${NEW_FEE_BPS_OPS}`);
}

if (!initKeys()) fail('Failed to load escrow keypair.');
if (!initEscrowV2()) fail('Failed to initialize v2 escrow service.');

const pre = await getConfigStateV2();
if (!pre) fail('Could not fetch current config from chain.');

const cluster = IS_MAINNET_ENV ? 'mainnet' : 'devnet';

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`  v2 update_config (propose) — ${cluster.toUpperCase()}`);
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`  RPC                : ${RPC}`);
console.log(`  Signer (authority) : ${getEscrowKeypair().publicKey.toBase58()}`);
console.log(`  Current authority  : ${pre.authority}`);
console.log('  Proposed changes:');
console.log(`    treasury        : ${NEW_TREASURY ?? `(unchanged — ${pre.treasury})`}`);
console.log(`    ops             : ${NEW_OPS ?? `(unchanged — ${pre.ops})`}`);
console.log(`    feeBpsTreasury  : ${NEW_FEE_BPS_TREASURY ?? `(unchanged — ${pre.feeBpsTreasury})`}`);
console.log(`    feeBpsOps       : ${NEW_FEE_BPS_OPS ?? `(unchanged — ${pre.feeBpsOps})`}`);
console.log('  (Apply happens 24h later via apply-config-update-v2.mjs)');
console.log('════════════════════════════════════════════════════════════════════════\n');

if (CONFIRM !== 'YES') {
    printDryRunReminder({ confirmVar: 'UPDATE_CONFIG_CONFIRM', isMainnet: IS_MAINNET_ENV, opLabel: 'update_config TX' });
    process.exit(0);
}

console.log('Confirmation matched. Sending update_config TX...\n');
const result = await updateConfigV2(NEW_TREASURY, NEW_OPS, NEW_FEE_BPS_TREASURY, NEW_FEE_BPS_OPS);
if (!result.success) fail(`updateConfig failed: ${result.error}`);

console.log(`\n✔ Proposal submitted.`);
console.log(`  TX        : ${result.txSignature}`);
const explorerCluster = IS_MAINNET_ENV ? '' : `?cluster=${cluster}`;
console.log(`  Explorer  : https://solscan.io/tx/${result.txSignature}${explorerCluster}`);
console.log('\nPending state:');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
console.log('\nDone. Wait 24h, then call apply-config-update-v2.mjs to apply.');
