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

import { initKeys } from '../services/keys.js';
import { initEscrowV2, proposeAuthorityV2, getConfigStateV2 } from '../services/escrow-v2.js';

const NEW_AUTHORITY = process.env.NEW_AUTHORITY;
if (!NEW_AUTHORITY) {
    console.error('Pass NEW_AUTHORITY env var (base58 pubkey).');
    process.exit(1);
}

if (!initKeys() || !initEscrowV2()) {
    console.error('Init failed.');
    process.exit(1);
}

const pre = await getConfigStateV2();
console.log('Pre-propose config:');
console.log('  authority:        ', pre.authority);
console.log('  pendingAuthority: ', pre.pendingAuthority || '(none)');

console.log('\nProposing new authority:', NEW_AUTHORITY);
const result = await proposeAuthorityV2(NEW_AUTHORITY);
if (!result.success) {
    console.error('propose_authority failed:', result.error);
    process.exit(1);
}

console.log('TX:', result.txSignature);
console.log('Solscan: https://solscan.io/tx/' + result.txSignature + '?cluster=devnet');

const post = await getConfigStateV2();
console.log('\nPost-propose config:');
console.log('  authority:        ', post.authority, '(unchanged)');
console.log('  pendingAuthority: ', post.pendingAuthority);
console.log('\nNext: have the NEW authority run accept-authority-v2.mjs to complete the rotation.');
