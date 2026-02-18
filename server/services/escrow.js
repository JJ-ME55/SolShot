/**
 * SolShot Escrow Service
 *
 * Wraps the on-chain solshot-escrow Anchor program for server-side calls.
 * The server (authority) creates escrow PDAs, and players deposit client-side.
 * After match ends, server calls settle or cancel.
 *
 * Instructions:
 *   createMatch   — server creates PDA escrow for a room
 *   settleMatch   — server distributes pot (90/7/3 split)
 *   cancelMatch   — server refunds both players
 *
 * Client-side (not here):
 *   depositWager  — player signs + sends from their wallet
 */

import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load IDL
const IDL_PATH = path.join(__dirname, '..', 'idl', 'solshot_escrow.json');

// Program ID — must match deployed program
const PROGRAM_ID = new PublicKey('CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD');

// Config from environment
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const OPS_WALLET = process.env.OPS_WALLET;

let program = null;
let provider = null;
let serverKeypair = null;

/**
 * Initialize the escrow service.
 * Requires server keypair (authority) to be available.
 *
 * @returns {boolean} true if initialized, false if keypair missing
 */
export function initEscrow() {
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    const keypairJson = process.env.SOLANA_KEYPAIR_JSON;
    if (!keypairPath && !keypairJson) {
        console.warn('[Escrow] No SOLANA_KEYPAIR_PATH/JSON — escrow disabled (practice mode only)');
        return false;
    }

    try {
        let secretKey;
        if (keypairJson) {
            secretKey = JSON.parse(keypairJson);
        } else {
            const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
            secretKey = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        }
        serverKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const wallet = new Wallet(serverKeypair);
        provider = new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
        });

        // Load IDL and create Program
        const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
        program = new Program(idl, provider);

        console.log(`[Escrow] Initialized — authority: ${serverKeypair.publicKey.toBase58()}`);
        console.log(`[Escrow] Program ID: ${PROGRAM_ID.toBase58()}`);
        console.log(`[Escrow] Treasury: ${TREASURY_WALLET || 'NOT SET'}`);
        console.log(`[Escrow] Ops: ${OPS_WALLET || 'NOT SET'}`);

        return true;
    } catch (err) {
        console.error('[Escrow] Init failed:', err.message);
        return false;
    }
}

/**
 * Check if escrow service is available
 */
export function isEscrowEnabled() {
    return program !== null && serverKeypair !== null;
}

/**
 * Derive the escrow PDA for a match ID.
 *
 * @param {string} matchId — room/match identifier (max 32 chars)
 * @returns {[PublicKey, number]} [pda, bump]
 */
export function getEscrowPDA(matchId) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('match'), Buffer.from(matchId)],
        PROGRAM_ID
    );
}

/**
 * Create a match escrow on-chain.
 * Called by server when both players have joined a wagered room.
 *
 * @param {string} matchId — unique room ID
 * @param {number} wagerSOL — wager per player in SOL
 * @param {string} playerOneAddress — player 1 wallet (base58)
 * @param {string} playerTwoAddress — player 2 wallet (base58)
 * @returns {Promise<{success: boolean, txSignature?: string, escrowPDA?: string, error?: string}>}
 */
export async function createMatchEscrow(matchId, wagerSOL, playerOneAddress, playerTwoAddress) {
    if (!program) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        const wagerLamports = Math.round(wagerSOL * LAMPORTS_PER_SOL);
        const playerOne = new PublicKey(playerOneAddress);
        const playerTwo = new PublicKey(playerTwoAddress);
        const [escrowPDA] = getEscrowPDA(matchId);

        const tx = await program.methods
            .createMatch(matchId, new BN(wagerLamports), playerOne, playerTwo)
            .accounts({
                escrow: escrowPDA,
                authority: serverKeypair.publicKey,
                systemProgram: PublicKey.default,
            })
            .rpc();

        console.log(`[Escrow] Created match ${matchId} — PDA: ${escrowPDA.toBase58()}, TX: ${tx}`);

        return {
            success: true,
            txSignature: tx,
            escrowPDA: escrowPDA.toBase58(),
        };
    } catch (err) {
        console.error(`[Escrow] createMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Build the deposit_wager instruction for a player to sign client-side.
 * The server doesn't sign this — it returns the serialized transaction
 * for the client to sign with their wallet.
 *
 * @param {string} matchId
 * @param {string} playerAddress — depositor's wallet (base58)
 * @returns {Promise<{success: boolean, transaction?: string, error?: string}>}
 */
export async function buildDepositTransaction(matchId, playerAddress) {
    if (!program) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        const player = new PublicKey(playerAddress);
        const [escrowPDA] = getEscrowPDA(matchId);

        // Build unsigned transaction for client to sign
        const ix = await program.methods
            .depositWager()
            .accounts({
                escrow: escrowPDA,
                player: player,
                systemProgram: PublicKey.default,
            })
            .instruction();

        const connection = provider.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const tx = new Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: player,
        });
        tx.add(ix);

        // Serialize for client (base64)
        const serialized = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return {
            success: true,
            transaction: serialized,
            escrowPDA: escrowPDA.toBase58(),
        };
    } catch (err) {
        console.error(`[Escrow] buildDeposit failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Settle a match — distribute pot to winner (90%), treasury (7%), ops (3%).
 * Called by server after match ends.
 *
 * @param {string} matchId
 * @param {string} winnerAddress — winner's wallet (base58)
 * @returns {Promise<{success: boolean, txSignature?: string, settlement?: object, error?: string}>}
 */
export async function settleMatchEscrow(matchId, winnerAddress) {
    if (!program) {
        return { success: false, error: 'Escrow not initialized' };
    }

    if (!TREASURY_WALLET || !OPS_WALLET) {
        return { success: false, error: 'Treasury/Ops wallets not configured' };
    }

    try {
        const winner = new PublicKey(winnerAddress);
        const treasury = new PublicKey(TREASURY_WALLET);
        const ops = new PublicKey(OPS_WALLET);
        const [escrowPDA] = getEscrowPDA(matchId);

        const tx = await program.methods
            .settleMatch(winner)
            .accounts({
                escrow: escrowPDA,
                authority: serverKeypair.publicKey,
                winner: winner,
                treasury: treasury,
                ops: ops,
                systemProgram: PublicKey.default,
            })
            .rpc();

        // Fetch settlement amounts from the escrow before it was closed
        // (we already know the math: 90/7/3)
        console.log(`[Escrow] Settled match ${matchId} — winner: ${winnerAddress}, TX: ${tx}`);

        return {
            success: true,
            txSignature: tx,
        };
    } catch (err) {
        console.error(`[Escrow] settleMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a match — refund all deposited players.
 * Called by server on room cancel, disconnect timeout, etc.
 *
 * @param {string} matchId
 * @param {string} playerOneAddress
 * @param {string} playerTwoAddress
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
 */
export async function cancelMatchEscrow(matchId, playerOneAddress, playerTwoAddress) {
    if (!program) {
        return { success: false, error: 'Escrow not initialized' };
    }

    try {
        const playerOne = new PublicKey(playerOneAddress);
        const playerTwo = new PublicKey(playerTwoAddress);
        const [escrowPDA] = getEscrowPDA(matchId);

        const tx = await program.methods
            .cancelMatch()
            .accounts({
                escrow: escrowPDA,
                caller: serverKeypair.publicKey,
                playerOne: playerOne,
                playerTwo: playerTwo,
                systemProgram: PublicKey.default,
            })
            .rpc();

        console.log(`[Escrow] Cancelled match ${matchId} — TX: ${tx}`);

        return {
            success: true,
            txSignature: tx,
        };
    } catch (err) {
        console.error(`[Escrow] cancelMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch escrow account data for a match.
 * Useful for verifying deposit status.
 *
 * @param {string} matchId
 * @returns {Promise<object|null>}
 */
export async function getEscrowState(matchId) {
    if (!program) return null;

    try {
        const [escrowPDA] = getEscrowPDA(matchId);
        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        return {
            matchId: escrow.matchId,
            authority: escrow.authority.toBase58(),
            playerOne: escrow.playerOne.toBase58(),
            playerTwo: escrow.playerTwo.toBase58(),
            wagerLamports: escrow.wagerLamports.toNumber(),
            wagerSOL: escrow.wagerLamports.toNumber() / LAMPORTS_PER_SOL,
            playerOneDeposited: escrow.playerOneDeposited,
            playerTwoDeposited: escrow.playerTwoDeposited,
            state: Object.keys(escrow.state)[0],
            createdAt: escrow.createdAt.toNumber(),
        };
    } catch (err) {
        // Account doesn't exist or was closed
        return null;
    }
}

export { PROGRAM_ID };
