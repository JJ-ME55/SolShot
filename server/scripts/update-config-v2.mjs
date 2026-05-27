/**
 * One-shot script to PROPOSE v2 GlobalConfig changes (treasury/ops/fee BPS).
 *
 * S2-T1 (Bundle 1) update: this now PROPOSES changes (writes to pending state).
 * Apply happens automatically 24h later via apply_config_update — or run the
 * apply-config-update-v2.mjs script after the timelock elapses.
 *
 * Authority rotation is SEPARATE — use propose-authority-v2.mjs +
 * accept-authority-v2.mjs (NEW key signs accept). NEW_AUTHORITY env var
 * here is now an ERROR (caller's likely intent is authority rotation,
 * which has its own flow).
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
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    updateConfigV2,
    getConfigStateV2,
} from '../services/escrow-v2.js';

if (process.env.NEW_AUTHORITY) {
    console.error('NEW_AUTHORITY is not supported via update_config (S2-T1 separation).');
    console.error('Use propose-authority-v2.mjs + accept-authority-v2.mjs for the 2-step authority rotation flow.');
    process.exit(1);
}

const NEW_TREASURY = process.env.NEW_TREASURY_WALLET || null;
const NEW_OPS = process.env.NEW_OPS_WALLET || null;
const NEW_FEE_BPS_TREASURY = process.env.NEW_FEE_BPS_TREASURY != null ? Number(process.env.NEW_FEE_BPS_TREASURY) : null;
const NEW_FEE_BPS_OPS = process.env.NEW_FEE_BPS_OPS != null ? Number(process.env.NEW_FEE_BPS_OPS) : null;

if (!NEW_TREASURY && !NEW_OPS && NEW_FEE_BPS_TREASURY == null && NEW_FEE_BPS_OPS == null) {
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

console.log('Proposing pending changes:');
console.log({
    treasury: NEW_TREASURY ?? '(unchanged)',
    ops: NEW_OPS ?? '(unchanged)',
    feeBpsTreasury: NEW_FEE_BPS_TREASURY ?? '(unchanged)',
    feeBpsOps: NEW_FEE_BPS_OPS ?? '(unchanged)',
});
console.log('(Apply happens 24h later via apply-config-update-v2.mjs)');

const result = await updateConfigV2(NEW_TREASURY, NEW_OPS, NEW_FEE_BPS_TREASURY, NEW_FEE_BPS_OPS);

if (!result.success) {
    console.error('updateConfig failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Pending state:');
console.log(JSON.stringify(await getConfigStateV2(), null, 2));
console.log('Done. Wait 24h, then call apply-config-update-v2.mjs to apply.');
