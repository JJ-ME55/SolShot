/**
 * Dump on-chain escrow state for a match.
 *
 * Usage (from /server):
 *   node scripts/dump-escrow-state.mjs <matchId>
 */
import dotenv from 'dotenv';
import { initKeys } from '../services/keys.js';
import { initEscrowV2, getEscrowPDAV2 } from '../services/escrow-v2.js';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { getEscrowKeypair } from '../services/keys.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const matchId = process.argv[2];
if (!matchId) {
    console.error('Usage: node scripts/dump-escrow-state.mjs <matchId>');
    process.exit(1);
}

if (!initKeys()) { console.error('Keys not configured'); process.exit(1); }
if (!initEscrowV2()) { console.error('Init failed'); process.exit(1); }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'idl', 'solshot_escrow_v2.json'), 'utf-8'));

const conn = new Connection(process.env.SOLANA_RPC || 'https://api.devnet.solana.com', 'confirmed');
const provider = new AnchorProvider(conn, new Wallet(getEscrowKeypair()), { commitment: 'confirmed' });
const program = new Program(idl, provider);

const [pda] = getEscrowPDAV2(matchId);
console.log(`Match ${matchId}`);
console.log(`PDA: ${pda.toBase58()}`);

const balance = await conn.getBalance(pda);
console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

const escrow = await program.account.matchEscrow.fetch(pda);

const stateName = ['Pending', 'AwaitingDeposits', 'Active', 'Settled', 'Cancelled'][escrow.state] || `Unknown(${escrow.state})`;
console.log(`State:           ${stateName}`);
console.log(`Authority:       ${escrow.authority.toBase58()}`);
console.log(`Wager:           ${escrow.wagerLamports.toNumber() / LAMPORTS_PER_SOL} SOL`);
console.log(`Max players:     ${escrow.maxPlayers}`);
console.log(`Deposits mask:   ${escrow.depositsMask.toString(2).padStart(escrow.maxPlayers, '0')}`);
console.log(`Created at:      ${new Date(escrow.createdAt.toNumber() * 1000).toISOString()}`);
console.log(`Activated at:    ${escrow.activatedAt > 0 ? new Date(escrow.activatedAt.toNumber() * 1000).toISOString() : '(not activated)'}`);
console.log(`Match end ts:    ${escrow.matchEndTs > 0 ? new Date(escrow.matchEndTs.toNumber() * 1000).toISOString() : '(not set)'}`);
console.log(`Treasury (snap): ${escrow.treasurySnapshot.toBase58()}`);
console.log(`Ops (snap):      ${escrow.opsSnapshot.toBase58()}`);
console.log(`\nPlayers:`);
for (let i = 0; i < escrow.maxPlayers; i++) {
    const deposited = (escrow.depositsMask >> i) & 1;
    console.log(`  [${i}] ${escrow.players[i].toBase58()}  ${deposited ? '✓ deposited' : '✗ no deposit'}`);
}

process.exit(0);
