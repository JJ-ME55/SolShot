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

import fs from 'fs';
import { Keypair, Connection } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYPAIR_PATH = process.env.NEW_AUTHORITY_KEYPAIR;
if (!KEYPAIR_PATH) {
    console.error('Pass NEW_AUTHORITY_KEYPAIR env var (path to new authority keypair JSON).');
    process.exit(1);
}

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
const connection = new Connection(SOLANA_RPC, 'confirmed');
const wallet = new Wallet(newAuthority);
const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
});
const idlPath = path.join(__dirname, '..', 'idl', 'solshot_escrow_v2.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
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

console.log('\nAccepting authority...');
try {
    const tx = await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: newAuthority.publicKey })
        .rpc();
    console.log('TX:', tx);
    console.log('Solscan: https://solscan.io/tx/' + tx + '?cluster=devnet');
} catch (err) {
    console.error('accept_authority failed:', err.message);
    process.exit(1);
}

const postConfig = await program.account.globalConfig.fetch(configPDA);
console.log('\nPost-accept config:');
console.log('  authority:        ', postConfig.authority.toBase58(), postConfig.authority.equals(newAuthority.publicKey) ? '✓ rotated' : '✗ MISMATCH');
console.log('  pendingAuthority: ', postConfig.pendingAuthority ? postConfig.pendingAuthority.toBase58() : '(none — cleared ✓)');
