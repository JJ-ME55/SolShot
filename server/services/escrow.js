/**
 * SolShot Escrow Service
 *
 * Wraps the on-chain solshot-escrow Anchor program for server-side calls.
 * The server (authority) creates escrow PDAs, and players deposit client-side.
 * After match ends, server calls settle or cancel.
 *
 * Instructions:
 *   initializeConfig — one-time setup of GlobalConfig PDA after deploy (OC-01)
 *   pauseProgram     — emergency pause via config PDA (OC-04)
 *   unpauseProgram   — resume after emergency pause (OC-04)
 *   updateConfig     — rotate authority/treasury/ops addresses
 *   createMatch      — server creates PDA escrow for a room
 *   settleMatch      — server distributes pot (90/7/3 split)
 *   cancelMatch              — server refunds both players
 *   permissionlessReclaim    — anyone triggers 48h safety refund (DCA-02)
 *
 * Client-side (not here):
 *   depositWager     — player signs + sends from their wallet
 */

import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEscrowKeypair, isKeysReady } from './keys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load IDL
const IDL_PATH = path.join(__dirname, '..', 'idl', 'solshot_escrow.json');

// Program ID — must match deployed program
// NOTE: This ID will change after fresh deploy — see OC-14 deploy checklist
const PROGRAM_ID = new PublicKey('CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD');

// Config from environment
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const OPS_WALLET = process.env.OPS_WALLET;

let program = null;
let provider = null;

/**
 * Initialize the escrow service.
 * Requires server keypair (authority) to be available.
 *
 * @returns {boolean} true if initialized, false if keypair missing
 */
export function initEscrow() {
    // Reset module state — supports re-initialization after SIGHUP key reload (04-02)
    provider = null;
    program = null;

    // Dev-mode guard: no keypair means escrow is disabled
    if (!isKeysReady()) {
        console.warn('[Escrow] No keypair configured — escrow disabled (practice mode only)');
        return false;
    }

    try {
        const escrowKeypair = getEscrowKeypair();

        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const wallet = new Wallet(escrowKeypair);
        provider = new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
        });

        // Load IDL and create Program
        const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
        program = new Program(idl, provider);

        const [configPDA] = getConfigPDA();

        console.log(`[Escrow] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}`);
        console.log(`[Escrow] Program ID: ${PROGRAM_ID.toBase58()}`);
        console.log(`[Escrow] Config PDA: ${configPDA.toBase58()}`);
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
    return program !== null && isKeysReady();
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
 * Derive the global config PDA (OC-01).
 * Seeds: [b"config"]
 *
 * @returns {[PublicKey, number]} [pda, bump]
 */
export function getConfigPDA() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID
    );
}

// ─── CONFIG MANAGEMENT ────────────────────────────────────────────────────────

/**
 * One-time initialization of the GlobalConfig PDA (OC-01).
 * Call immediately after fresh program deploy.
 * Authority, treasury, and ops must all be distinct addresses.
 *
 * @param {string} authorityPubkey — server hot wallet address (base58)
 * @param {string} treasuryAddress — treasury wallet address (base58)
 * @param {string} opsAddress — ops wallet address (base58)
 * @returns {Promise<{success: boolean, txSignature?: string, configPDA?: string, error?: string}>}
 */
export async function initializeConfig(authorityPubkey, treasuryAddress, opsAddress) {
    if (!program) return { success: false, error: 'Escrow not initialized' };
    try {
        const [configPDA] = getConfigPDA();
        const authority = new PublicKey(authorityPubkey);
        const treasury = new PublicKey(treasuryAddress);
        const ops = new PublicKey(opsAddress);
        const tx = await program.methods
            .initializeConfig(authority, treasury, ops)
            .accounts({
                config: configPDA,
                payer: getEscrowKeypair().publicKey,
                systemProgram: PublicKey.default,
            })
            .rpc();
        console.log(`[Escrow] Config initialized — TX: ${tx}`);
        return { success: true, txSignature: tx, configPDA: configPDA.toBase58() };
    } catch (err) {
        console.error('[Escrow] initializeConfig failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Update config fields (authority/treasury/ops). Pass null to keep current value.
 * Requires current authority as signer.
 *
 * @param {string|null} newAuthority — new authority pubkey (base58) or null
 * @param {string|null} newTreasury — new treasury pubkey (base58) or null
 * @param {string|null} newOps — new ops pubkey (base58) or null
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
 */
export async function updateConfig(newAuthority, newTreasury, newOps) {
    if (!program) return { success: false, error: 'Escrow not initialized' };
    try {
        const [configPDA] = getConfigPDA();
        const tx = await program.methods
            .updateConfig(
                newAuthority ? new PublicKey(newAuthority) : null,
                newTreasury ? new PublicKey(newTreasury) : null,
                newOps ? new PublicKey(newOps) : null
            )
            .accounts({
                config: configPDA,
                authority: getEscrowKeypair().publicKey,
            })
            .rpc();
        console.log(`[Escrow] Config updated — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[Escrow] updateConfig failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Emergency pause — halts all economic instructions (OC-04).
 * Idempotent — safe to call even if already paused.
 *
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
 */
export async function pauseProgram() {
    if (!program) return { success: false, error: 'Escrow not initialized' };
    try {
        const [configPDA] = getConfigPDA();
        const tx = await program.methods
            .pauseProgram()
            .accounts({
                config: configPDA,
                authority: getEscrowKeypair().publicKey,
            })
            .rpc();
        console.log(`[Escrow] Program paused — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[Escrow] pauseProgram failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Emergency unpause — resumes economic instructions (OC-04).
 * Idempotent — safe to call even if already unpaused.
 *
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
 */
export async function unpauseProgram() {
    if (!program) return { success: false, error: 'Escrow not initialized' };
    try {
        const [configPDA] = getConfigPDA();
        const tx = await program.methods
            .unpauseProgram()
            .accounts({
                config: configPDA,
                authority: getEscrowKeypair().publicKey,
            })
            .rpc();
        console.log(`[Escrow] Program unpaused — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[Escrow] unpauseProgram failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch the global config PDA state.
 * Returns null if config not yet initialized.
 *
 * @returns {Promise<{authority: string, treasury: string, ops: string, isPaused: boolean}|null>}
 */
export async function getConfigState() {
    if (!program) return null;
    try {
        const [configPDA] = getConfigPDA();
        const config = await program.account.globalConfig.fetch(configPDA);
        return {
            authority: config.authority.toBase58(),
            treasury: config.treasury.toBase58(),
            ops: config.ops.toBase58(),
            isPaused: config.isPaused,
        };
    } catch (err) {
        // Config not initialized or account doesn't exist
        return null;
    }
}

// ─── MATCH LIFECYCLE ──────────────────────────────────────────────────────────

/**
 * Create a match escrow on-chain (OC-04, OC-06, OC-08, OC-12).
 * Called by server when both players have joined a wagered room.
 * Requires config PDA for pause guard.
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
        const [configPDA] = getConfigPDA();

        const tx = await program.methods
            .createMatch(matchId, new BN(wagerLamports), playerOne, playerTwo)
            .accounts({
                escrow: escrowPDA,
                authority: getEscrowKeypair().publicKey,
                config: configPDA,
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
 * Build the deposit_wager instruction for a player to sign client-side (OC-04, OC-07, OC-09).
 * The server doesn't sign this — it returns the serialized transaction
 * for the client to sign with their wallet.
 * Requires config PDA for pause guard.
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
        const [configPDA] = getConfigPDA();

        // Build unsigned transaction for client to sign
        const ix = await program.methods
            .depositWager()
            .accounts({
                escrow: escrowPDA,
                player: player,
                config: configPDA,
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
 * Called by server after match ends (OC-02, OC-03, OC-04, OC-07, OC-09, OC-10, OC-11).
 * Treasury and ops are validated on-chain against config PDA.
 * Requires config PDA for validated treasury/ops pubkeys and pause guard.
 *
 * @param {string} matchId
 * @param {string} winnerAddress — winner's wallet (base58)
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
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
        const [configPDA] = getConfigPDA();

        const tx = await program.methods
            .settleMatch(winner)
            .accounts({
                escrow: escrowPDA,
                authority: getEscrowKeypair().publicKey,
                winner: winner,
                treasury: treasury,
                ops: ops,
                config: configPDA,
                systemProgram: PublicKey.default,
            })
            .rpc();

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
 * Cancel a match — refund all deposited players (OC-04, OC-05, OC-07, OC-09, OC-10).
 * Called by server on room cancel, disconnect timeout, etc.
 * Requires config PDA for authority pubkey + pause guard.
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
        const [configPDA] = getConfigPDA();

        const tx = await program.methods
            .cancelMatch()
            .accounts({
                escrow: escrowPDA,
                caller: getEscrowKeypair().publicKey,
                playerOne: playerOne,
                playerTwo: playerTwo,
                config: configPDA,
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
 * DCA-02: Permissionless reclaim — anyone can trigger refund after 48 hours.
 * Caller receives PDA rent as incentive. No authority/player restriction.
 *
 * @param {string} matchId
 * @param {string} playerOneAddress
 * @param {string} playerTwoAddress
 * @returns {Promise<{success: boolean, txSignature?: string, error?: string}>}
 */
export async function permissionlessReclaimEscrow(matchId, playerOneAddress, playerTwoAddress) {
    if (!program) return { success: false, error: 'Escrow not initialized' };

    try {
        const [escrowPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('match'), Buffer.from(matchId)],
            program.programId,
        );

        const playerOnePubkey = new PublicKey(playerOneAddress);
        const playerTwoPubkey = new PublicKey(playerTwoAddress);

        const tx = await program.methods
            .permissionlessReclaim()
            .accounts({
                escrow: escrowPDA,
                caller: provider.wallet.publicKey,
                playerOne: playerOnePubkey,
                playerTwo: playerTwoPubkey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log(`[Escrow] Permissionless reclaim TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error(`[Escrow] Permissionless reclaim failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch escrow account data for a match.
 * Useful for verifying deposit status.
 * Returns activated_at field (OC-07) — 0 means match not yet active.
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
            activatedAt: escrow.activatedAt?.toNumber() || 0,
        };
    } catch (err) {
        // Account doesn't exist or was closed
        return null;
    }
}

export { PROGRAM_ID };
