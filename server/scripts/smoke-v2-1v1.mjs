/**
 * Smoke test: confirm the v2 escrow accepts a 2-player (1v1) match create.
 *
 * Validates the shouldUseEscrowV2 fix — mainnet is v2-only, so 1v1 now routes to
 * v2 (the N-player 2-10 program). This proves v2 accepts N=2 through the server's
 * own createMatchEscrowV2 path. No game, no human players, no deposits required
 * (create is authority-signed; players don't sign the create).
 *
 * REQUIRED ENV:
 *   SOLANA_RPC            devnet RPC
 *   ESCROW_PROGRAM_ID_V2  devnet v2 program (BVKXL…)
 *   SOLANA_KEYPAIR_PATH   server authority keypair (solshot-dev.json on devnet)
 *
 * USAGE (from repo root):
 *   SOLANA_RPC=https://api.devnet.solana.com \
 *   ESCROW_PROGRAM_ID_V2=BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
 *   SOLANA_KEYPAIR_PATH=C:/Users/johnk/.config/solana/solshot-dev.json \
 *   node server/scripts/smoke-v2-1v1.mjs
 */
import { Keypair } from '@solana/web3.js';
import crypto from 'crypto';
import { initKeys } from '../services/keys.js';
import {
    shouldUseEscrowV2,
    V2_DEFAULT_MATCH_DURATION_SECS,
    V2_DEFAULT_DEPOSIT_WINDOW_SECS,
} from '../services/solana.js';
import {
    initEscrowV2,
    createMatchEscrowV2,
    getEscrowStateV2,
    cancelMatchEscrowV2,
} from '../services/escrow-v2.js';

const fail = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
const ok = (m) => console.log(`✓ ${m}`);

// 1) dispatch unit check — 1v1 must route to v2
if (shouldUseEscrowV2(2) !== true) fail('shouldUseEscrowV2(2) !== true — 1v1 would not route to v2');
ok('shouldUseEscrowV2(2) === true (1v1 routes to v2)');

// 2) init keys + v2 service
if (!initKeys()) fail('initKeys failed — check SOLANA_KEYPAIR_PATH');
if (!initEscrowV2()) fail('initEscrowV2 failed — check SOLANA_RPC + ESCROW_PROGRAM_ID_V2');
ok('keys + v2 escrow initialized');

// 3) create a 2-player escrow on-chain
const matchId = 'smoke1v1_' + crypto.randomBytes(4).toString('hex');
const players = [
    Keypair.generate().publicKey.toBase58(),
    Keypair.generate().publicKey.toBase58(),
];
console.log(`\nCreating 2-player v2 escrow: matchId=${matchId}`);
const res = await createMatchEscrowV2(
    matchId, 0.1, players,
    V2_DEFAULT_MATCH_DURATION_SECS, V2_DEFAULT_DEPOSIT_WINDOW_SECS,
);
if (!res.success) fail(`createMatchEscrowV2 (2 players) FAILED: ${res.error}`);
ok(`v2 accepted 2-player create — PDA ${res.escrowPDA}`);
console.log(`   TX: ${res.txSignature}`);

// 4) verify on-chain state
const state = await getEscrowStateV2(matchId);
if (!state) fail('getEscrowStateV2 returned null after create');
console.log('on-chain state:', JSON.stringify(state, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
ok('escrow state readable on-chain');

// 5) cleanup — cancel the empty escrow to reclaim rent (best-effort)
const cancel = await cancelMatchEscrowV2(matchId, players);
if (cancel.success) ok(`cleaned up — cancelled empty escrow, TX ${cancel.txSignature}`);
else console.warn(`(cleanup) cancel returned: ${cancel.error} — empty PDA reclaims via timeout; harmless on devnet`);

console.log('\n🎉 1v1-via-v2 smoke PASSED — v2 accepts 2-player create through the server path.\n');
process.exit(0);
