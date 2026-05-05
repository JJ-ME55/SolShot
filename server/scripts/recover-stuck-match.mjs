/**
 * One-shot recovery: settle an active escrow whose match is locally
 * marked cancelled but never released funds on-chain.
 *
 * Background: /cancelmatch on an active wagered match calls
 * cancelMatchEscrowV2, but the program rejects (Unauthorized — authority
 * can only cancel during AwaitingDeposits). Mongo gets stamped
 * 'cancelled' but the SOL stays locked.
 *
 * Recovery path: settleMatchEscrowV2 with a chosen winner. Pot
 * distributes 90% winner / 7% treasury / 3% ops.
 *
 * Usage (from /server):
 *   node scripts/recover-stuck-match.mjs <matchId> <winnerWalletAddress>
 *
 * Example:
 *   node scripts/recover-stuck-match.mjs 92T2 6ZSXPeF6...5Saq
 */
import dotenv from 'dotenv';
import { initKeys } from '../services/keys.js';
import { initEscrowV2, settleMatchEscrowV2, getEscrowPDAV2 } from '../services/escrow-v2.js';

dotenv.config();

const matchId = process.argv[2];
const winner = process.argv[3];

if (!matchId || !winner) {
    console.error('Usage: node scripts/recover-stuck-match.mjs <matchId> <winnerWallet>');
    process.exit(1);
}

if (!initKeys()) {
    console.error('Keys not configured');
    process.exit(1);
}
if (!initEscrowV2()) {
    console.error('EscrowV2 init failed');
    process.exit(1);
}

const [pda] = getEscrowPDAV2(matchId);
console.log(`Settling match ${matchId}`);
console.log(`  Escrow PDA: ${pda.toBase58()}`);
console.log(`  Winner:     ${winner}`);

const result = await settleMatchEscrowV2(matchId, winner);

if (result.success) {
    console.log(`\n✓ Settled. TX: ${result.txSignature}`);
    console.log(`  https://solscan.io/tx/${result.txSignature}?cluster=devnet`);
} else {
    console.error(`\n✗ Failed: ${result.error}`);
    process.exit(1);
}

process.exit(0);
