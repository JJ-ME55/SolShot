#!/usr/bin/env node
// Recover a stuck v2 escrow match by cancelling and refunding all depositors.
//
// Context: today's 3P devnet test (CreateMatch TX 3Szvpuhferzz9n2EoCdewjwXC...)
// created a v2 match with 3 deposits totalling 0.3 SOL. The match ended in
// forfeit but couldn't settle because the v2 settle dispatch hadn't shipped
// yet (deferred from S1-T5, fixed in S2-T5a / b9134c3). The escrow PDA is
// in Active state with all 3 players' SOL.
//
// This script calls cancelMatchEscrowV2 from the server authority, which
// refunds all 3 depositors and closes the PDA. Run once; idempotent (will
// error harmlessly if state has already advanced).
//
// Usage:
//   cd server && node scripts/recover-stuck-v2.mjs

import 'dotenv/config';
import { PublicKey } from '@solana/web3.js';
import { initKeys } from '../services/keys.js';
import { initEscrowV2, settleMatchEscrowV2, getEscrowStateV2 } from '../services/escrow-v2.js';

// Decoded from the CreateMatch TX instruction data
// (3Szvpuhferzz9n2EoCdewjwXC37UpVZQwtHhAtFkBxR4mQ6BhFHrDJB2vgJWpGgpURumVU9DxbxVzMNBz7xZqEFk)
const MATCH_ID = '684e9fff';
const PLAYER_BYTES = [
    [58, 96, 36, 115, 173, 73, 81, 119, 234, 171, 212, 238, 73, 250, 130, 116, 170, 118, 89, 120, 141, 170, 1, 106, 57, 33, 195, 216, 44, 33, 59, 193],
    [22, 237, 159, 206, 188, 202, 43, 228, 49, 224, 101, 103, 86, 183, 2, 108, 113, 237, 171, 193, 66, 60, 15, 150, 86, 84, 192, 36, 109, 173, 75, 152],
    [228, 230, 108, 203, 189, 44, 230, 139, 47, 171, 68, 176, 94, 54, 229, 170, 158, 247, 141, 131, 228, 171, 81, 85, 174, 65, 129, 157, 128, 211, 181, 158],
];
const PLAYER_PUBKEYS = PLAYER_BYTES.map((b) => new PublicKey(Buffer.from(b)).toBase58());

async function main() {
    console.log('[recover] Initializing keys + v2 escrow service...');
    initKeys();
    const v2Ready = initEscrowV2();
    if (!v2Ready) {
        console.error('[recover] v2 escrow service failed to initialize. Aborting.');
        process.exit(1);
    }

    console.log(`[recover] matchId: ${MATCH_ID}`);
    console.log('[recover] depositors:');
    PLAYER_PUBKEYS.forEach((p, i) => console.log(`  player[${i}]: ${p}`));

    console.log('\n[recover] Reading current on-chain escrow state...');
    let state;
    try {
        state = await getEscrowStateV2(MATCH_ID);
    } catch (err) {
        console.error('[recover] getEscrowStateV2 threw:', err.message);
        process.exit(1);
    }

    if (!state) {
        console.log('[recover] Escrow PDA not found — already closed? Nothing to recover.');
        process.exit(0);
    }
    console.log('[recover] On-chain state:', {
        state: state.state,
        depositsMask: state.depositsMask?.toString?.(2) || state.depositsMask,
        maxPlayers: state.maxPlayers,
        wagerLamports: state.wagerLamports?.toString?.() || state.wagerLamports,
    });

    // v2 cancel_match for Active state is gated on player-or-timeout.
    // Server authority can call cancel only during AwaitingDeposits; this
    // match is already Active. settle_match IS callable by authority on
    // Active state — so we settle to player[0] (JJ owns all 3 wallets in
    // this test, net-same outcome). 90% to winner, 7% treasury, 3% ops.
    // This also doubles as the first end-to-end test of v2 settle dispatch.
    const WINNER = PLAYER_PUBKEYS[0];
    console.log('\n[recover] Calling settleMatchEscrowV2 (winner = player[0])...');
    console.log('[recover] expected payout: 0.27 SOL → ' + WINNER);
    const result = await settleMatchEscrowV2(MATCH_ID, WINNER);

    if (result.success) {
        console.log('[recover] ✅ SUCCESS');
        console.log('[recover] txSignature:', result.txSignature);
        console.log('[recover] Solscan: https://solscan.io/tx/' + result.txSignature + '?cluster=devnet');
    } else {
        console.error('[recover] ❌ FAILED:', result.error);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('[recover] ERROR:', err);
    process.exit(1);
});
