/**
 * One-shot script to UPDATE the v2 GlobalConfig (rotate treasury/ops/fees).
 *
 * Usage (from /server):
 *   SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json \
 *   NEW_TREASURY_WALLET=<treasury_pubkey> \
 *   NEW_OPS_WALLET=<ops_pubkey> \
 *   NEW_FEE_BPS_TREASURY=700 \
 *   NEW_FEE_BPS_OPS=300 \
 *   node scripts/update-config-v2.mjs
 *
 * Any unset env var → field unchanged. NEW_AUTHORITY also supported (use with care).
 *
 * NOTE: Updating fields here does NOT affect already-created MatchEscrows —
 * those snapshot their treasury/ops/fee BPS at create time. Only future matches
 * see the new values.
 */
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    updateConfigV2,
    getConfigStateV2,
} from '../services/escrow-v2.js';

const NEW_AUTHORITY = process.env.NEW_AUTHORITY || null;
const NEW_TREASURY = process.env.NEW_TREASURY_WALLET || null;
const NEW_OPS = process.env.NEW_OPS_WALLET || null;
const NEW_FEE_BPS_TREASURY = process.env.NEW_FEE_BPS_TREASURY != null ? Number(process.env.NEW_FEE_BPS_TREASURY) : null;
const NEW_FEE_BPS_OPS = process.env.NEW_FEE_BPS_OPS != null ? Number(process.env.NEW_FEE_BPS_OPS) : null;

if (!NEW_AUTHORITY && !NEW_TREASURY && !NEW_OPS && NEW_FEE_BPS_TREASURY == null && NEW_FEE_BPS_OPS == null) {
    console.error('Pass at least one NEW_* env var.');
    process.exit(1);
}

if (!initKeys()) {
    console.error('Failed to load escrow keypair.');
    process.exit(1);
}

if (!initEscrowV2()) {
    console.error('Failed to initialize v2 escrow service.');
    process.exit(1);
}

console.log('Current config:');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));

console.log('Updating with:');
console.log({
    authority: NEW_AUTHORITY ?? '(unchanged)',
    treasury: NEW_TREASURY ?? '(unchanged)',
    ops: NEW_OPS ?? '(unchanged)',
    feeBpsTreasury: NEW_FEE_BPS_TREASURY ?? '(unchanged)',
    feeBpsOps: NEW_FEE_BPS_OPS ?? '(unchanged)',
});

const result = await updateConfigV2(NEW_AUTHORITY, NEW_TREASURY, NEW_OPS, NEW_FEE_BPS_TREASURY, NEW_FEE_BPS_OPS);

if (!result.success) {
    console.error('updateConfig failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Verifying...');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
console.log('Done.');
