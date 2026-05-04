/**
 * SolShot Escrow Service — v2 (N-player 2-10, async/idle)
 *
 * Wraps the on-chain solshot-escrow-v2 Anchor program for server-side calls.
 * Mirrors escrow.js (v1) structure for consistency, with v2-specific differences:
 *   - 2-10 players (was 2-4); deposits_mask is u16 (was u8)
 *   - Per-match duration_secs (60s-7d) and deposit_window_secs (60s-24h)
 *   - Treasury/ops + fee BPS snapshotted into MatchEscrow at create time
 *     (settle reads snapshot, NOT live config — config changes don't re-route in-flight fees)
 *   - Permissionless reclaim trigger: match_end_ts + 24h grace
 *
 * Instructions:
 *   initializeConfig — one-time GlobalConfig setup (now includes feeBps args)
 *   updateConfig     — rotate authority/treasury/ops/feeBps (snapshots are per-match)
 *   pauseProgram     — emergency pause (blocks new creates + deposits, allows settle/refund)
 *   unpauseProgram   — resume
 *   createMatch      — server creates PDA escrow for an N-player room
 *   settleMatch      — server picks winner; pot distributed via SNAPSHOT bps
 *   cancelMatch      — server/player refund flow
 *   permissionlessReclaim — anyone after match_end_ts + 24h
 *   startWithDepositors   — authority activates with subset of pledges (after deposit window)
 *
 * Client-side (not here):
 *   depositWager     — player signs + sends from their wallet (via Privy embedded wallet)
 */
import logger from './logger.js';

import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEscrowKeypair, isKeysReady } from './keys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IDL_PATH = path.join(__dirname, '..', 'idl', 'solshot_escrow_v2.json');

// v2 program ID — deployed to devnet 2026-05-04
// Tx: 55E7KiCapU51GXGSnAhR5i2gQrPSX2Yyxtzvnai973JgwtwxPBiv1LrbLakePjLCydoGmC5g9bcT5sCHUuGCBPHo
const PROGRAM_ID = new PublicKey('BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N');

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

let program = null;
let provider = null;

/**
 * Initialize the v2 escrow service.
 * Requires server keypair (authority) to be available.
 *
 * @returns {boolean} true if initialized, false if keypair missing
 */
export function initEscrowV2() {
    provider = null;
    program = null;

    if (!isKeysReady()) {
        console.warn('[EscrowV2] No keypair configured — v2 escrow disabled');
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

        const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));
        program = new Program(idl, provider);

        const [configPDA] = getConfigPDAV2();

        console.log(`[EscrowV2] Initialized — authority: ${escrowKeypair.publicKey.toBase58()}`);
        console.log(`[EscrowV2] Program ID: ${PROGRAM_ID.toBase58()}`);
        console.log(`[EscrowV2] Config PDA: ${configPDA.toBase58()}`);

        return true;
    } catch (err) {
        console.error('[EscrowV2] Init failed:', err.message);
        return false;
    }
}

export function isEscrowV2Enabled() {
    return program !== null && isKeysReady();
}

/**
 * Derive the v2 escrow PDA for a match ID.
 */
export function getEscrowPDAV2(matchId) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('match'), Buffer.from(matchId)],
        PROGRAM_ID
    );
}

/**
 * Derive the v2 global config PDA.
 */
export function getConfigPDAV2() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID
    );
}

// ─── CONFIG MANAGEMENT ────────────────────────────────────────────────────────

/**
 * One-time GlobalConfig PDA initialization. Distinct addresses required.
 *
 * @param {string} authorityPubkey
 * @param {string} treasuryAddress
 * @param {string} opsAddress
 * @param {number} feeBpsTreasury — basis points (700 = 7%)
 * @param {number} feeBpsOps — basis points (300 = 3%)
 */
export async function initializeConfigV2(authorityPubkey, treasuryAddress, opsAddress, feeBpsTreasury, feeBpsOps) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const [configPDA] = getConfigPDAV2();
        const tx = await program.methods
            .initializeConfig(
                new PublicKey(authorityPubkey),
                new PublicKey(treasuryAddress),
                new PublicKey(opsAddress),
                feeBpsTreasury,
                feeBpsOps
            )
            .accounts({ payer: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Config initialized — TX: ${tx}`);
        return { success: true, txSignature: tx, configPDA: configPDA.toBase58() };
    } catch (err) {
        console.error('[EscrowV2] initializeConfig failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Update config fields. Pass null to keep current value.
 * Note: changes do NOT affect in-flight matches (snapshots are taken at create_match).
 */
export async function updateConfigV2(newAuthority, newTreasury, newOps, newFeeBpsTreasury, newFeeBpsOps) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .updateConfig(
                newAuthority ? new PublicKey(newAuthority) : null,
                newTreasury ? new PublicKey(newTreasury) : null,
                newOps ? new PublicKey(newOps) : null,
                newFeeBpsTreasury ?? null,
                newFeeBpsOps ?? null
            )
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Config updated — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] updateConfig failed:', err.message);
        return { success: false, error: err.message };
    }
}

export async function pauseProgramV2() {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .pauseProgram()
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Program paused — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] pauseProgram failed:', err.message);
        return { success: false, error: err.message };
    }
}

export async function unpauseProgramV2() {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .unpauseProgram()
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Program unpaused — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] unpauseProgram failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch global config state. Returns null if not initialized.
 */
export async function getConfigStateV2() {
    if (!program) return null;
    try {
        const [configPDA] = getConfigPDAV2();
        const config = await program.account.globalConfig.fetch(configPDA);
        return {
            authority: config.authority.toBase58(),
            treasury: config.treasury.toBase58(),
            ops: config.ops.toBase58(),
            feeBpsTreasury: config.feeBpsTreasury,
            feeBpsOps: config.feeBpsOps,
            isPaused: config.isPaused,
        };
    } catch (err) {
        return null;
    }
}

// ─── MATCH LIFECYCLE ──────────────────────────────────────────────────────────

/**
 * Create a v2 match escrow. 2-10 players supported.
 *
 * @param {string} matchId — unique room ID (max 32 chars)
 * @param {number} wagerSOL — wager per player in SOL
 * @param {string[]} playerAddresses — 2-10 player wallet addresses (base58)
 * @param {number} durationSecs — match duration (60s-604800s = 7d)
 * @param {number} depositWindowSecs — deposit window (60s-86400s = 24h)
 */
export async function createMatchEscrowV2(matchId, wagerSOL, playerAddresses, durationSecs, depositWindowSecs) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const wagerLamports = Math.round(wagerSOL * LAMPORTS_PER_SOL);
        const players = playerAddresses.map(a => new PublicKey(a));
        const [escrowPDA] = getEscrowPDAV2(matchId);

        // Anchor 0.30+ auto-resolves: escrow PDA (from match_id arg), config PDA (constant
        // seeds), system_program. Pass only authority (signer).
        const tx = await program.methods
            .createMatch(matchId, new BN(wagerLamports), players, durationSecs, depositWindowSecs)
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();

        console.log(`[EscrowV2] Created match ${matchId} (${players.length}p, ${durationSecs}s) — PDA: ${escrowPDA.toBase58()}, TX: ${tx}`);

        return { success: true, txSignature: tx, escrowPDA: escrowPDA.toBase58() };
    } catch (err) {
        console.error(`[EscrowV2] createMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Build the deposit_wager instruction for a player to sign client-side.
 * Server returns serialized base64 transaction; client signs via Privy embedded wallet.
 *
 * @param {string} matchId
 * @param {string} playerAddress — depositor's wallet (base58)
 */
export async function buildDepositTransactionV2(matchId, playerAddress) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const player = new PublicKey(playerAddress);
        const [escrowPDA] = getEscrowPDAV2(matchId);

        // escrow PDA is account-derived (seed = match_id stored on account), pass explicit.
        // config + system_program auto-resolved.
        const ix = await program.methods
            .depositWager()
            .accounts({ escrow: escrowPDA, player })
            .instruction();

        const connection = provider.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: player });
        tx.add(ix);

        const serialized = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return { success: true, transaction: serialized, escrowPDA: escrowPDA.toBase58() };
    } catch (err) {
        console.error(`[EscrowV2] buildDeposit failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Settle a match — pay winner + treasury + ops using the snapshot stored on the match.
 * Reads escrow first to get snapshot pubkeys (immune to mid-flight config changes).
 */
export async function settleMatchEscrowV2(matchId, winnerAddress) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);

        // Read snapshot pubkeys from the escrow itself (not from config)
        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        const treasury = escrow.treasurySnapshot;
        const ops = escrow.opsSnapshot;
        const winner = new PublicKey(winnerAddress);

        const tx = await program.methods
            .settleMatch(winner)
            .accounts({
                escrow: escrowPDA,
                authority: getEscrowKeypair().publicKey,
                winner,
                treasury,
                ops,
            })
            .rpc();

        logger.info({ matchId, tx }, '[EscrowV2] Settled match');
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error(`[EscrowV2] settleMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Cancel a match — refund deposited players. Players passed via remainingAccounts in player-index order.
 */
export async function cancelMatchEscrowV2(matchId, playerAddresses) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);

        const tx = await program.methods
            .cancelMatch()
            .accounts({ escrow: escrowPDA, caller: getEscrowKeypair().publicKey })
            .remainingAccounts(
                playerAddresses.map(addr => ({
                    pubkey: new PublicKey(addr),
                    isWritable: true,
                    isSigner: false,
                }))
            )
            .rpc();

        console.log(`[EscrowV2] Cancelled match ${matchId} — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error(`[EscrowV2] cancelMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Permissionless reclaim — anyone can trigger refund after match_end_ts + 24h grace.
 * Caller receives PDA rent reserve as economic incentive.
 */
export async function permissionlessReclaimEscrowV2(matchId, playerAddresses) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);

        const tx = await program.methods
            .permissionlessReclaim()
            .accounts({ escrow: escrowPDA, caller: provider.wallet.publicKey })
            .remainingAccounts(
                playerAddresses.map(addr => ({
                    pubkey: new PublicKey(addr),
                    isWritable: true,
                    isSigner: false,
                }))
            )
            .rpc();

        console.log(`[EscrowV2] Permissionless reclaim TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error(`[EscrowV2] Permissionless reclaim failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Start match with subset of depositors. Only callable AFTER deposit window closes.
 * Compacts deposited players to front of array; reduces max_players to N deposited.
 */
export async function startWithDepositorsEscrowV2(matchId) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);
        const tx = await program.methods
            .startWithDepositors()
            .accounts({ escrow: escrowPDA, authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] startWithDepositors for ${matchId} — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error(`[EscrowV2] startWithDepositors failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Popcount — count set bits in a u16 mask.
 */
function countBits(n) {
    let count = 0;
    while (n) { count += n & 1; n >>>= 1; }
    return count;
}

/**
 * Fetch escrow account data for a match (v2 N-player fields).
 */
export async function getEscrowStateV2(matchId) {
    if (!program) return null;

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);
        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        const maxPlayers = escrow.maxPlayers;
        const depositsMask = escrow.depositsMask;
        const numDeposited = countBits(depositsMask);
        return {
            matchId: escrow.matchId,
            authority: escrow.authority.toBase58(),
            players: escrow.players.slice(0, maxPlayers).map(p => p.toBase58()),
            maxPlayers,
            wagerLamports: escrow.wagerLamports.toNumber(),
            wagerSOL: escrow.wagerLamports.toNumber() / LAMPORTS_PER_SOL,
            depositsMask,
            numDeposited,
            durationSecs: escrow.durationSecs,
            depositWindowSecs: escrow.depositWindowSecs,
            treasurySnapshot: escrow.treasurySnapshot.toBase58(),
            opsSnapshot: escrow.opsSnapshot.toBase58(),
            feeBpsTreasurySnapshot: escrow.feeBpsTreasurySnapshot,
            feeBpsOpsSnapshot: escrow.feeBpsOpsSnapshot,
            state: Object.keys(escrow.state)[0],
            createdAt: escrow.createdAt.toNumber(),
            activatedAt: escrow.activatedAt.toNumber(),
            matchEndTs: escrow.matchEndTs.toNumber(),
        };
    } catch (err) {
        return null;
    }
}

export { PROGRAM_ID };
