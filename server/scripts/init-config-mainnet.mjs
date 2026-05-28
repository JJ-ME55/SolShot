/**
 * One-shot MAINNET init for the v2 GlobalConfig PDA.
 *
 * Run AFTER `anchor deploy --provider.cluster mainnet --upgrade-authority <squads-vault-pda>`.
 *
 * IRREVERSIBLE: `initialize_config` can only be called once per program.
 * The authority field set here can only be changed via the on-chain
 * propose_authority → accept_authority two-step. The treasury/ops fields
 * can only be rotated via update_config + 24h timelock. There is no undo.
 *
 *  ── REQUIRED ENV ─────────────────────────────────────────────────────────────
 *  ESCROW_PROGRAM_ID_V2     mainnet program ID (= Anchor.toml [programs.mainnet])
 *  SOLANA_RPC               mainnet RPC URL (must contain "mainnet")
 *  SOLANA_KEYPAIR_PATH      path to solshot-server-authority.json (payer/signer)
 *  SQUADS_AUTHORITY_PDA     Squads vault PDA #1 (governance — update_config etc)
 *  SQUADS_TREASURY_PDA      Squads vault PDA #2 (7% fee destination)
 *  SQUADS_OPS_PDA           Squads vault PDA #3 (3% fee destination)
 *
 *  ── OPTIONAL ENV ─────────────────────────────────────────────────────────────
 *  FEE_BPS_TREASURY         default 700  (7%)
 *  FEE_BPS_OPS              default 300  (3%)
 *  INIT_MAINNET_CONFIRM     set to "I_UNDERSTAND_MAINNET_IRREVERSIBLE" to execute;
 *                           otherwise the script dry-runs and exits.
 *
 *  ── WHY 3 SEPARATE VAULTS ────────────────────────────────────────────────────
 *  The on-chain program enforces distinctness:
 *    require!(authority != treasury, EscrowError::InvalidConfig);
 *    require!(authority != ops,      EscrowError::InvalidConfig);
 *    require!(treasury  != ops,      EscrowError::DuplicateFeeAccount);
 *
 *  Squads v3 supports multiple vault PDAs under a single multisig — create one
 *  multisig with 3 vaults (Authority/Treasury/Ops) so the same 2-of-3 signer set
 *  governs all three roles. Passing the same PDA for any two will fail on-chain
 *  with InvalidConfig.
 *
 *  ── USAGE ────────────────────────────────────────────────────────────────────
 *  # 1) dry-run (no INIT_MAINNET_CONFIRM)
 *  ESCROW_PROGRAM_ID_V2=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS \
 *  SOLANA_RPC=https://api.mainnet-beta.solana.com \
 *  SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server-authority.json \
 *  SQUADS_AUTHORITY_PDA=<vault0_pda> \
 *  SQUADS_TREASURY_PDA=<vault1_pda> \
 *  SQUADS_OPS_PDA=<vault2_pda> \
 *  node scripts/init-config-mainnet.mjs
 *
 *  # 2) for real
 *  INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE \
 *  ... (same env) ... \
 *  node scripts/init-config-mainnet.mjs
 */
import { PublicKey } from '@solana/web3.js';
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    initializeConfigV2,
    getConfigStateV2,
    getConfigPDAV2,
    PROGRAM_ID,
} from '../services/escrow-v2.js';

const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

// ── env validation ──────────────────────────────────────────────────────────
const PROGRAM_ID_ENV = process.env.ESCROW_PROGRAM_ID_V2;
const RPC = process.env.SOLANA_RPC;
const KP = process.env.SOLANA_KEYPAIR_PATH;
const AUTH = process.env.SQUADS_AUTHORITY_PDA;
const TREAS = process.env.SQUADS_TREASURY_PDA;
const OPS = process.env.SQUADS_OPS_PDA;
const FEE_BPS_TREASURY = Number(process.env.FEE_BPS_TREASURY ?? 700);
const FEE_BPS_OPS = Number(process.env.FEE_BPS_OPS ?? 300);
const CONFIRM = process.env.INIT_MAINNET_CONFIRM;
const REQUIRED_CONFIRM = 'I_UNDERSTAND_MAINNET_IRREVERSIBLE';

if (!PROGRAM_ID_ENV) fail('ESCROW_PROGRAM_ID_V2 must be set (mainnet program ID).');
if (!RPC) fail('SOLANA_RPC must be set to a mainnet RPC URL.');
// DB audit #3 CHAIN-N04 fix: substring `/mainnet/i.test(RPC)` accepted
// attacker domains like `mainnet.attacker.com`. Switched to explicit host
// allowlist of the major reputable mainnet RPC providers. If you need a
// different mainnet RPC, add its host here after verifying it's legitimate.
const MAINNET_RPC_HOST_ALLOWLIST = [
    'api.mainnet-beta.solana.com',
    'mainnet.helius-rpc.com',
    'rpc.helius.xyz',                     // older helius host
    'solana-mainnet.g.alchemy.com',
    'solana-mainnet.rpc.extrnode.com',
    'mainnet.rpcpool.com',
    'rpc.ankr.com',                       // ankr (host varies by path)
    'solana-api.projectserum.com',
];
const isAllowedMainnetRpc = (url) => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return MAINNET_RPC_HOST_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
};
if (!isAllowedMainnetRpc(RPC)) {
    fail(
        `SOLANA_RPC host is not in the mainnet allowlist (got "${RPC}").\n` +
        `Allowed hosts: ${MAINNET_RPC_HOST_ALLOWLIST.join(', ')}\n` +
        `If you need a different mainnet RPC, add its host to MAINNET_RPC_HOST_ALLOWLIST in this script after verifying it's a legitimate Solana mainnet endpoint.`
    );
}
if (!KP) fail('SOLANA_KEYPAIR_PATH must be set (server authority keypair).');
if (!AUTH || !TREAS || !OPS) {
    fail('SQUADS_AUTHORITY_PDA, SQUADS_TREASURY_PDA, SQUADS_OPS_PDA must all be set — 3 separate Squads vault PDAs.');
}

// Validate base58
const parsePubkey = (label, val) => {
    try { return new PublicKey(val); }
    catch { fail(`${label} is not a valid base58 pubkey: "${val}"`); }
};
const authPk = parsePubkey('SQUADS_AUTHORITY_PDA', AUTH);
const treasPk = parsePubkey('SQUADS_TREASURY_PDA', TREAS);
const opsPk = parsePubkey('SQUADS_OPS_PDA', OPS);

// Mirror the on-chain distinctness check up-front so we fail loudly
// before sending the TX (saves a round-trip + makes the error obvious).
if (authPk.equals(treasPk)) fail('SQUADS_AUTHORITY_PDA == SQUADS_TREASURY_PDA — must be distinct (on-chain require!).');
if (authPk.equals(opsPk))   fail('SQUADS_AUTHORITY_PDA == SQUADS_OPS_PDA — must be distinct (on-chain require!).');
if (treasPk.equals(opsPk))  fail('SQUADS_TREASURY_PDA == SQUADS_OPS_PDA — must be distinct (on-chain require!).');

if (!Number.isFinite(FEE_BPS_TREASURY) || FEE_BPS_TREASURY < 0 || !Number.isInteger(FEE_BPS_TREASURY)) {
    fail('FEE_BPS_TREASURY must be a non-negative integer.');
}
if (!Number.isFinite(FEE_BPS_OPS) || FEE_BPS_OPS < 0 || !Number.isInteger(FEE_BPS_OPS)) {
    fail('FEE_BPS_OPS must be a non-negative integer.');
}
if (FEE_BPS_TREASURY + FEE_BPS_OPS > 1000) {
    fail(`Combined fee BPS (${FEE_BPS_TREASURY} + ${FEE_BPS_OPS}) exceeds program cap of 1000 (10%).`);
}

// ── keypair + service init ───────────────────────────────────────────────────
if (!initKeys()) fail('Failed to load server keypair. Check SOLANA_KEYPAIR_PATH.');
if (!initEscrowV2()) fail('Failed to initialize v2 escrow service.');

const payerPk = getEscrowKeypair().publicKey.toBase58();
const [configPDA] = getConfigPDAV2();

// Sanity: PROGRAM_ID actually picked up the env override.
if (PROGRAM_ID.toBase58() !== PROGRAM_ID_ENV) {
    fail(`escrow-v2.js PROGRAM_ID (${PROGRAM_ID.toBase58()}) != ESCROW_PROGRAM_ID_V2 env (${PROGRAM_ID_ENV}). Env override failed.`);
}

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log('  MAINNET v2 GlobalConfig Initialization');
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`  RPC                : ${RPC}`);
console.log(`  Program ID         : ${PROGRAM_ID.toBase58()}`);
console.log(`  Config PDA         : ${configPDA.toBase58()}`);
console.log(`  Payer (server)     : ${payerPk}`);
console.log('  ───── on-chain config to write ─────────────────────────────────────');
console.log(`  Authority   (Squads) : ${authPk.toBase58()}`);
console.log(`  Treasury    (Squads) : ${treasPk.toBase58()}`);
console.log(`  Ops         (Squads) : ${opsPk.toBase58()}`);
console.log(`  Fee BPS Treasury     : ${FEE_BPS_TREASURY}  (${FEE_BPS_TREASURY / 100}%)`);
console.log(`  Fee BPS Ops          : ${FEE_BPS_OPS}  (${FEE_BPS_OPS / 100}%)`);
console.log(`  Combined fee         : ${(FEE_BPS_TREASURY + FEE_BPS_OPS) / 100}%  (cap 10%)`);
console.log('════════════════════════════════════════════════════════════════════════\n');

// ── idempotency check ───────────────────────────────────────────────────────
const existing = await getConfigStateV2();
if (existing) {
    console.log('⚠  v2 Config ALREADY EXISTS on-chain for this program:');
    console.log(JSON.stringify(existing, null, 2));
    console.log('\nAborting — initialize_config can only run once per program.');
    console.log('Use scripts/update-config-v2.mjs (with timelock) to rotate fields after launch.');
    process.exit(0);
}

// ── confirmation guard ──────────────────────────────────────────────────────
if (CONFIRM !== REQUIRED_CONFIRM) {
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('  DRY RUN — no transaction sent.');
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('  Review the values above. When ready, re-run with:');
    console.log(`    INIT_MAINNET_CONFIRM=${REQUIRED_CONFIRM}`);
    console.log('  (Any other value, including "yes" or "true", will dry-run again.)');
    console.log('────────────────────────────────────────────────────────────────────────\n');
    process.exit(0);
}

// ── execute ─────────────────────────────────────────────────────────────────
console.log('Confirmation matched. Sending initialize_config TX...\n');
const result = await initializeConfigV2(
    authPk.toBase58(),
    treasPk.toBase58(),
    opsPk.toBase58(),
    FEE_BPS_TREASURY,
    FEE_BPS_OPS,
);

if (!result.success) {
    console.error('\n✖ initializeConfig FAILED:', result.error);
    process.exit(1);
}

console.log(`\n✔ Mainnet config initialized.`);
console.log(`  TX            : ${result.txSignature}`);
console.log(`  Config PDA    : ${result.configPDA}`);
console.log(`  Explorer      : https://explorer.solana.com/tx/${result.txSignature}`);

console.log('\nVerifying on-chain state...');
const fresh = await getConfigStateV2();
console.log(JSON.stringify(fresh, null, 2));

if (
    fresh?.authority !== authPk.toBase58() ||
    fresh?.treasury !== treasPk.toBase58() ||
    fresh?.ops !== opsPk.toBase58() ||
    fresh?.feeBpsTreasury !== FEE_BPS_TREASURY ||
    fresh?.feeBpsOps !== FEE_BPS_OPS
) {
    console.error('\n✖ Post-init state does not match expected values. Manual investigation required.');
    process.exit(1);
}

console.log('\n✔ State matches expected. Mainnet v2 GlobalConfig is LIVE.');
console.log('  Next steps:');
console.log('    1. Update Render env: SOLANA_RPC=https://api.mainnet-beta.solana.com,');
console.log('       ESCROW_PROGRAM_ID_V2=<mainnet id>, plus mainnet wallet/SHOT vars.');
console.log('    2. Smoke-test 1v1 wagered match on mainnet with tiny wager (0.001 SOL).');
console.log('    3. Verify settle splits 90/7/3 land in the three Squads vaults.');
console.log('    4. Update Docs/KEY_MANAGEMENT.md §8 change log + Docs/internal/V1_LAUNCH_SPRINT.md.\n');
