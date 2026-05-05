/**
 * One-shot: stamp a GroupMatch doc as settled in Mongo. Use AFTER an
 * out-of-band on-chain settle (e.g. recover-stuck-match.mjs) so the
 * Mongo record matches the chain. Without this, /customgame in the
 * same chat may collide on the legacy 'active' record and the chat
 * UI will show stale state.
 *
 * Usage (from /server):
 *   node scripts/mark-match-settled.mjs <matchId> [winnerWallet]
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GroupMatch from '../models/GroupMatch.js';

dotenv.config();

const matchId = process.argv[2];
const winnerWallet = process.argv[3] || null;

if (!matchId) {
    console.error('Usage: node scripts/mark-match-settled.mjs <matchId> [winnerWallet]');
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const match = await GroupMatch.findOne({ matchId });
if (!match) {
    console.error(`No GroupMatch found for ${matchId}`);
    process.exit(1);
}

console.log(`Before: matchId=${match.matchId} state=${match.state}`);

match.state = 'settled';
match.settledAt = new Date();
if (winnerWallet) {
    match.winnerWallet = winnerWallet;
    const winnerPlayer = match.players.find(p => p.walletAddress === winnerWallet);
    if (winnerPlayer) match.winnerTelegramId = winnerPlayer.telegramUserId;
}
await match.save();

console.log(`After:  matchId=${match.matchId} state=${match.state}`);
console.log(`Winner: ${winnerWallet || '(not set)'}`);

await mongoose.disconnect();
process.exit(0);
