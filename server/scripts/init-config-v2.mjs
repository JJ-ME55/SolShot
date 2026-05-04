/**
 * One-shot script to initialize the GlobalConfig PDA on the deployed
 * solshot-escrow-v2 program. Run AFTER fresh deploy / redeploy.
 *
 * Usage (from /server):
 *   SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json \
 *   TREASURY_WALLET=<treasury_pubkey> \
 *   OPS_WALLET=<ops_pubkey> \
 *   FEE_BPS_TREASURY=700 \
 *   FEE_BPS_OPS=300 \
 *   node scripts/init-config-v2.mjs
 *
 * v2 differences from v1:
 *   - Includes fee BPS in initialize_config (fees are now configurable in GlobalConfig
 *     and snapshotted into MatchEscrow at create_match time).
 *
 * Idempotent: fails safely (account already exists) if the v2 GlobalConfig PDA was
 * already initialized for this program.
 */
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    initializeConfigV2,
    getConfigStateV2,
    getConfigPDAV2,
    PROGRAM_ID,
} from '../services/escrow-v2.js';

const TREASURY = process.env.TREASURY_WALLET;
const OPS = process.env.OPS_WALLET;
const FEE_BPS_TREASURY = Number(process.env.FEE_BPS_TREASURY ?? 700);
const FEE_BPS_OPS = Number(process.env.FEE_BPS_OPS ?? 300);

if (!TREASURY || !OPS) {
    console.error('Missing TREASURY_WALLET or OPS_WALLET env var.');
    process.exit(1);
}

if (!Number.isFinite(FEE_BPS_TREASURY) || FEE_BPS_TREASURY < 0) {
    console.error('FEE_BPS_TREASURY must be a non-negative integer.');
    process.exit(1);
}
if (!Number.isFinite(FEE_BPS_OPS) || FEE_BPS_OPS < 0) {
    console.error('FEE_BPS_OPS must be a non-negative integer.');
    process.exit(1);
}
if (FEE_BPS_TREASURY + FEE_BPS_OPS > 1000) {
    console.error('Combined fee BPS exceeds program cap of 1000 (10%).');
    process.exit(1);
}

if (!initKeys()) {
    console.error('Failed to load escrow keypair. Set SOLANA_KEYPAIR_PATH or SOLANA_KEYPAIR_JSON.');
    process.exit(1);
}

if (!initEscrowV2()) {
    console.error('Failed to initialize v2 escrow service.');
    process.exit(1);
}

const authority = getEscrowKeypair().publicKey.toBase58();
const [configPDA] = getConfigPDAV2();

console.log('--------------------------------------------------------------------------------');
console.log('Program ID         :', PROGRAM_ID.toBase58());
console.log('Config PDA         :', configPDA.toBase58());
console.log('Authority          :', authority);
console.log('Treasury           :', TREASURY);
console.log('Ops                :', OPS);
console.log('Fee BPS Treasury   :', FEE_BPS_TREASURY, `(${FEE_BPS_TREASURY / 100}%)`);
console.log('Fee BPS Ops        :', FEE_BPS_OPS, `(${FEE_BPS_OPS / 100}%)`);
console.log('--------------------------------------------------------------------------------');

const existing = await getConfigStateV2();
if (existing) {
    console.log('v2 Config already exists on-chain:');
    console.log(JSON.stringify(existing, null, 2));
    console.log('Aborting — initialize_config can only run once.');
    process.exit(0);
}

console.log('Calling initializeConfig (v2)...');
const result = await initializeConfigV2(authority, TREASURY, OPS, FEE_BPS_TREASURY, FEE_BPS_OPS);

if (!result.success) {
    console.error('initializeConfig failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Config PDA created:', result.configPDA);
console.log('Verifying state...');

const fresh = await getConfigStateV2();
console.log(JSON.stringify(fresh, null, 2));
console.log('Done.');
