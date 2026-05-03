/**
 * One-shot script to initialize the GlobalConfig PDA on the deployed
 * solshot-escrow program. Run AFTER fresh deploy / redeploy.
 *
 * Usage (from /server):
 *   SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-dev.json \
 *   TREASURY_WALLET=4Ekd8xxsym6HiGaKbDVP7hgf3AoBsLmBSenyfx3N2hGk \
 *   OPS_WALLET=G2TgxypFAQHvcfwRA1dkJMx2St4gYpDpz37uiG1Q9grx \
 *   node scripts/init-config.mjs
 *
 * Idempotent in the sense that it will fail safely (account already exists)
 * if the GlobalConfig PDA was already initialized for this program.
 */
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import { initEscrow, initializeConfig, getConfigState, getConfigPDA, PROGRAM_ID } from '../services/escrow.js';

const TREASURY = process.env.TREASURY_WALLET;
const OPS = process.env.OPS_WALLET;

if (!TREASURY || !OPS) {
    console.error('Missing TREASURY_WALLET or OPS_WALLET env var.');
    process.exit(1);
}

if (!initKeys()) {
    console.error('Failed to load escrow keypair. Set SOLANA_KEYPAIR_PATH or SOLANA_KEYPAIR_JSON.');
    process.exit(1);
}

if (!initEscrow()) {
    console.error('Failed to initialize escrow service.');
    process.exit(1);
}

const authority = getEscrowKeypair().publicKey.toBase58();
const [configPDA] = getConfigPDA();

console.log('--------------------------------------------------------------------------------');
console.log('Program ID :', PROGRAM_ID.toBase58());
console.log('Config PDA :', configPDA.toBase58());
console.log('Authority  :', authority);
console.log('Treasury   :', TREASURY);
console.log('Ops        :', OPS);
console.log('--------------------------------------------------------------------------------');

const existing = await getConfigState();
if (existing) {
    console.log('Config already exists on-chain:');
    console.log(JSON.stringify(existing, null, 2));
    console.log('Aborting — initialize_config can only run once.');
    process.exit(0);
}

console.log('Calling initializeConfig...');
const result = await initializeConfig(authority, TREASURY, OPS);

if (!result.success) {
    console.error('initializeConfig failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Config PDA created:', result.configPDA);
console.log('Verifying state...');

const fresh = await getConfigState();
console.log(JSON.stringify(fresh, null, 2));
console.log('Done.');
