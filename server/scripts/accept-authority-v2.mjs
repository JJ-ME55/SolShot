#!/usr/bin/env node
// S2-T1: step 2 of authority rotation. Signed by the NEW authority (not the
// current one). After this TX confirms, authority = pending_authority, and
// pending_authority = None.
//
// Usage (from /server):
//   NEW_AUTHORITY_KEYPAIR=/path/to/new-authority.json node scripts/accept-authority-v2.mjs
//
// The new-authority keypair MUST already be present in config.pending_authority
// (set by a prior propose-authority-v2 call). Otherwise the on-chain check
// rejects with Unauthorized.
//
// DB audit #3 AUTH-N03 family fix: mirror the safety guards from
// propose-authority-v2.mjs — RPC mainnet allowlist when ACCEPT_AUTHORITY_NETWORK=mainnet,
// dry-run-by-default with ACCEPT_AUTHORITY_CONFIRM=YES gate, pre-flight summary.

import fs from 'fs';
import { Keypair, Connection } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertMainnetRpcAllowlisted, fail, printDryRunReminder } from './_op_guards.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYPAIR_PATH = process.env.NEW_AUTHORITY_KEYPAIR;
const CONFIRM = process.env.ACCEPT_AUTHORITY_CONFIRM;
const IS_MAINNET_ENV = process.env.ACCEPT_AUTHORITY_NETWORK === 'mainnet';

if (!KEYPAIR_PATH) fail('NEW_AUTHORITY_KEYPAIR env var required (path to new authority keypair JSON).');

// Resolve ~ to $HOME on Windows + Unix
const resolvedPath = KEYPAIR_PATH.startsWith('~')
    ? KEYPAIR_PATH.replace('~', process.env.HOME || process.env.USERPROFILE || '')
    : KEYPAIR_PATH;

let newAuthority;
try {
    const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    newAuthority = Keypair.fromSecretKey(Uint8Array.from(raw));
} catch (err) {
    console.error('Failed to load keypair:', err.message);
    process.exit(1);
}

console.log('Loaded new authority keypair:', newAuthority.publicKey.toBase58());

// Build a fresh Anchor program instance signed by THIS keypair (not the
// server's loaded escrow keypair, which is likely the OLD authority).
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
if (IS_MAINNET_ENV) assertMainnetRpcAllowlisted(SOLANA_RPC);
const connection = new Connection(SOLANA_RPC, 'confirmed');
const wallet = new Wallet(newAuthority);
const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
});
const idlPath = path.join(__dirname, '..', 'idl', 'solshot_escrow_v2.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
// The committed IDL's `address` is devnet (BVKXL). Anchor 0.30+ binds the Program
// to idl.address, so honor ESCROW_PROGRAM_ID_V2 the same way escrow-v2.js does —
// otherwise this targets the devnet program/config on a mainnet RPC.
if (process.env.ESCROW_PROGRAM_ID_V2) idl.address = process.env.ESCROW_PROGRAM_ID_V2;
const program = new Program(idl, provider);

// Probe current config state before
const configSeed = Buffer.from('config');
const [configPDA] = await import('@solana/web3.js').then(w =>
    w.PublicKey.findProgramAddressSync([configSeed], program.programId)
);
const preConfig = await program.account.globalConfig.fetch(configPDA);
console.log('\nPre-accept config:');
console.log('  authority:        ', preConfig.authority.toBase58());
console.log('  pendingAuthority: ', preConfig.pendingAuthority ? preConfig.pendingAuthority.toBase58() : '(none)');

if (!preConfig.pendingAuthority || !preConfig.pendingAuthority.equals(newAuthority.publicKey)) {
    console.error('\nThis keypair does not match config.pendingAuthority. Refusing.');
    console.error('Expected:', preConfig.pendingAuthority?.toBase58() || '(none)');
    console.error('Got:     ', newAuthority.publicKey.toBase58());
    process.exit(1);
}

const cluster = IS_MAINNET_ENV ? 'mainnet' : 'devnet';

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`  v2 accept_authority — ${cluster.toUpperCase()}`);
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`  RPC                 : ${SOLANA_RPC}`);
console.log(`  Signer (new auth)   : ${newAuthority.publicKey.toBase58()}`);
console.log(`  Current authority   : ${preConfig.authority.toBase58()}`);
console.log(`  Pending authority   : ${preConfig.pendingAuthority.toBase58()}`);
console.log(`  After this TX       : authority = ${newAuthority.publicKey.toBase58()}, pending = none`);
console.log('════════════════════════════════════════════════════════════════════════\n');

if (CONFIRM !== 'YES') {
    printDryRunReminder({ confirmVar: 'ACCEPT_AUTHORITY_CONFIRM', isMainnet: IS_MAINNET_ENV, opLabel: 'accept_authority TX' });
    process.exit(0);
}

console.log('Confirmation matched. Accepting authority...');
try {
    const tx = await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: newAuthority.publicKey })
        .rpc();
    console.log('TX:', tx);
    const explorerCluster = IS_MAINNET_ENV ? '' : `?cluster=${cluster}`;
    console.log(`Solscan: https://solscan.io/tx/${tx}${explorerCluster}`);
} catch (err) {
    console.error('accept_authority failed:', err.message);
    process.exit(1);
}

const postConfig = await program.account.globalConfig.fetch(configPDA);
console.log('\nPost-accept config:');
console.log('  authority:        ', postConfig.authority.toBase58(), postConfig.authority.equals(newAuthority.publicKey) ? '✓ rotated' : '✗ MISMATCH');
console.log('  pendingAuthority: ', postConfig.pendingAuthority ? postConfig.pendingAuthority.toBase58() : '(none — cleared ✓)');
