#!/usr/bin/env node
// S2-T1: step 1 of authority rotation. Current authority signs, writes
// pending_authority = NEW_AUTHORITY. Step 2 (accept-authority-v2.mjs)
// must be signed by the NEW authority to complete the transfer.
//
// No timelock on authority rotation — recovery scenarios may need speed.
// The 2-step pattern is the protection: new key must sign accept before
// old key loses access.
//
// Usage (from /server):
//   NEW_AUTHORITY=<base58 pubkey> node scripts/propose-authority-v2.mjs
//
// Overwrite policy: if pending_authority is already set, this OVERWRITES it.
// Use the CURRENT authority's own pubkey as NEW_AUTHORITY to effectively
// cancel a prior bad proposal.
//
// DB audit #3 AUTH-N03 fix: added the same safety guards as
// init-config-mainnet.mjs — env validation, base58 shape check, mainnet
// RPC allowlist, dry-run-by-default + PROPOSE_AUTHORITY_CONFIRM=YES guard,
// distinctness check against current authority/treasury/ops, post-action
// verification.

import { PublicKey } from '@solana/web3.js';
import { initKeys, getEscrowKeypair } from '../services/keys.js';
import {
    initEscrowV2,
    proposeAuthorityV2,
    getConfigStateV2,
} from '../services/escrow-v2.js';

const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

// ── env validation ─────────────────────────────────────────────────────────
const NEW_AUTHORITY = process.env.NEW_AUTHORITY;
const RPC = process.env.SOLANA_RPC;
const CONFIRM = process.env.PROPOSE_AUTHORITY_CONFIRM;
const REQUIRED_CONFIRM = 'YES';
const IS_MAINNET_ENV = process.env.PROPOSE_AUTHORITY_NETWORK === 'mainnet';

if (!NEW_AUTHORITY) fail('NEW_AUTHORITY env var required (base58 pubkey).');
if (!RPC) fail('SOLANA_RPC env var required.');

// On mainnet, enforce the same host allowlist as init-config-mainnet.mjs.
// Devnet runs are guarded only by the confirm prompt.
if (IS_MAINNET_ENV) {
    const MAINNET_RPC_HOST_ALLOWLIST = [
        'api.mainnet-beta.solana.com',
        'mainnet.helius-rpc.com',
        'rpc.helius.xyz',
        'solana-mainnet.g.alchemy.com',
        'solana-mainnet.rpc.extrnode.com',
        'mainnet.rpcpool.com',
        'rpc.ankr.com',
        'solana-api.projectserum.com',
    ];
    let host;
    try { host = new URL(RPC).hostname.toLowerCase(); }
    catch { fail(`SOLANA_RPC is not a valid URL: "${RPC}"`); }
    const allowed = MAINNET_RPC_HOST_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`));
    if (!allowed) {
        fail(`Mainnet rotation rejected — SOLANA_RPC host "${host}" not in allowlist:\n  ${MAINNET_RPC_HOST_ALLOWLIST.join(', ')}`);
    }
}

// Validate NEW_AUTHORITY as base58 pubkey shape.
let newAuthPk;
try { newAuthPk = new PublicKey(NEW_AUTHORITY); }
catch { fail(`NEW_AUTHORITY is not a valid base58 pubkey: "${NEW_AUTHORITY}"`); }

if (!initKeys() || !initEscrowV2()) fail('Init failed — check SOLANA_KEYPAIR_PATH + ESCROW_PROGRAM_ID_V2 env.');

const pre = await getConfigStateV2();
if (!pre) fail('Could not fetch current config from chain.');

// Distinctness pre-flight — same check as the on-chain program will do at
// accept-time, but surfacing it now so a misconfig fails locally before
// burning a TX.
if (newAuthPk.toBase58() === pre.treasury) {
    fail(`NEW_AUTHORITY equals current treasury (${pre.treasury}). The on-chain accept_authority will reject this.`);
}
if (newAuthPk.toBase58() === pre.ops) {
    fail(`NEW_AUTHORITY equals current ops (${pre.ops}). The on-chain accept_authority will reject this.`);
}

const cluster = IS_MAINNET_ENV ? 'mainnet' : 'devnet';

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`  v2 propose_authority — ${cluster.toUpperCase()}`);
console.log('════════════════════════════════════════════════════════════════════════');
console.log(`  RPC                  : ${RPC}`);
console.log(`  Signer (current auth): ${getEscrowKeypair().publicKey.toBase58()}`);
console.log(`  Current authority    : ${pre.authority}`);
console.log(`  Pending authority    : ${pre.pendingAuthority || '(none)'}`);
console.log(`  NEW authority        : ${newAuthPk.toBase58()}`);
console.log(`  Cancel mode          : ${newAuthPk.toBase58() === pre.authority ? 'YES — proposing self to cancel prior proposal' : 'no'}`);
console.log('════════════════════════════════════════════════════════════════════════\n');

if (CONFIRM !== REQUIRED_CONFIRM) {
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('  DRY RUN — no transaction sent.');
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('  Review the values above. When ready, re-run with:');
    console.log(`    PROPOSE_AUTHORITY_CONFIRM=${REQUIRED_CONFIRM}`);
    if (IS_MAINNET_ENV) {
        console.log('  (Mainnet enforces RPC host allowlist as well.)');
    }
    console.log('────────────────────────────────────────────────────────────────────────\n');
    process.exit(0);
}

console.log('Confirmation matched. Sending propose_authority TX...\n');
const result = await proposeAuthorityV2(newAuthPk.toBase58());
if (!result.success) {
    console.error('\n✖ propose_authority FAILED:', result.error);
    process.exit(1);
}

console.log(`\n✔ Proposal submitted.`);
console.log(`  TX        : ${result.txSignature}`);
const explorerCluster = IS_MAINNET_ENV ? '' : `?cluster=${cluster}`;
console.log(`  Explorer  : https://solscan.io/tx/${result.txSignature}${explorerCluster}`);

const post = await getConfigStateV2();
console.log('\nPost-propose config:');
console.log('  authority:        ', post.authority, '(unchanged until accept)');
console.log('  pendingAuthority: ', post.pendingAuthority);

if (post.pendingAuthority !== newAuthPk.toBase58()) {
    fail('Post-state mismatch — pending_authority is not what was proposed. Manual investigation required.');
}

console.log('\n✔ State matches expected.');
console.log(`\nNext step: have the NEW authority (holder of ${newAuthPk.toBase58()})`);
console.log(`run accept-authority-v2.mjs with NEW_AUTHORITY_KEYPAIR pointing at their keypair.`);
