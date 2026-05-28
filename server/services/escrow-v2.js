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
//
// Default = devnet. Mainnet sets ESCROW_PROGRAM_ID_V2 in env (Render var, or the
// init-config-mainnet.mjs script export). Keeping a hardcoded devnet fallback
// means dev workflows JustWork — no env needed locally — while mainnet flip is
// purely an env-var rotation. Both PROGRAM_ID and the IDL's `address` field need
// to match (Anchor 0.30+ binds the Program object via IDL.address).
const DEFAULT_PROGRAM_ID = 'BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N';
const PROGRAM_ID = new PublicKey(process.env.ESCROW_PROGRAM_ID_V2 || DEFAULT_PROGRAM_ID);

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
        // Anchor 0.30+ reads program ID from idl.address. Overwrite so a mainnet
        // env override actually binds — otherwise the Program object would still
        // target devnet.
        idl.address = PROGRAM_ID.toBase58();
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
 * S2-T1 (Bundle 1): Propose treasury/ops/fee BPS changes. Writes to pending
 * state — does NOT apply immediately. After CONFIG_TIMELOCK_SECS (24h) elapses,
 * anyone can call applyConfigUpdateV2 to apply pending → live.
 *
 * Authority rotation is SEPARATE — use proposeAuthorityV2 / acceptAuthorityV2.
 * The on-chain update_config instruction no longer accepts new_authority.
 *
 * Pass null to leave a field unchanged.
 */
export async function updateConfigV2(newTreasury, newOps, newFeeBpsTreasury, newFeeBpsOps) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .updateConfig(
                newTreasury ? new PublicKey(newTreasury) : null,
                newOps ? new PublicKey(newOps) : null,
                newFeeBpsTreasury ?? null,
                newFeeBpsOps ?? null
            )
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Config proposed (24h timelock) — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] updateConfig failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * S2-T1 (Bundle 1): Apply pending config → live. Permissionless — anyone can
 * pay gas to call after CONFIG_TIMELOCK_SECS elapses since update_config.
 * The on-chain instruction enforces the timelock; this wrapper just pays gas
 * with whatever keypair is loaded (server authority by default).
 */
export async function applyConfigUpdateV2() {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .applyConfigUpdate()
            .accounts({ payer: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Config applied (pending → live) — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] applyConfigUpdate failed:', err.message);
        return { success: false, error: err.message };
    }
}

// DB audit #3 CHAIN-N03 fix: migrateConfigV2() wrapper removed. The on-chain
// `migrate_config` instruction was deleted in commit da04b5e (SOS N002).
// Devnet migration completed 2026-05-27 via TX 2kMPbgLesnfAtV8oaipjggu2hRBpWkC1X56KkwHVhbBYWBKws8XMhdDHt...
// The corresponding scripts/migrate-config-v2.mjs is also being removed.

/**
 * S2-T1 (Bundle 1): Step 1 of authority rotation. Current authority signs.
 * Writes pending_authority = newAuthorityPubkey. accept_authority (step 2,
 * signed by NEW authority) must follow to complete the transfer.
 *
 * Overwrite policy: if pending_authority is already set, this OVERWRITES it.
 * Useful for cancelling a prior bad proposal (re-propose with current authority's
 * own pubkey as a no-op revert).
 */
export async function proposeAuthorityV2(newAuthorityPubkey) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    try {
        const tx = await program.methods
            .proposeAuthority(new PublicKey(newAuthorityPubkey))
            .accounts({ authority: getEscrowKeypair().publicKey })
            .rpc();
        console.log(`[EscrowV2] Authority proposed (${newAuthorityPubkey}) — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] proposeAuthority failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * S2-T1 (Bundle 1): Step 2 of authority rotation. NEW authority must sign.
 * Caller must construct + sign the TX with the new authority keypair —
 * this wrapper takes a Keypair (or signer) since the loaded escrow keypair
 * may be the OLD authority at this point.
 *
 * @param {import('@solana/web3.js').Keypair} newAuthoritySigner
 */
export async function acceptAuthorityV2(newAuthoritySigner) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };
    if (!newAuthoritySigner?.publicKey) {
        return { success: false, error: 'newAuthoritySigner must be a Keypair' };
    }
    try {
        const tx = await program.methods
            .acceptAuthority()
            .accounts({ newAuthority: newAuthoritySigner.publicKey })
            .signers([newAuthoritySigner])
            .rpc();
        console.log(`[EscrowV2] Authority accepted by ${newAuthoritySigner.publicKey.toBase58()} — TX: ${tx}`);
        return { success: true, txSignature: tx };
    } catch (err) {
        console.error('[EscrowV2] acceptAuthority failed:', err.message);
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
            // Live fields
            authority: config.authority.toBase58(),
            treasury: config.treasury.toBase58(),
            ops: config.ops.toBase58(),
            feeBpsTreasury: config.feeBpsTreasury,
            feeBpsOps: config.feeBpsOps,
            isPaused: config.isPaused,
            // S2-T1: pending authority (2-step rotation) + pending config (24h timelock)
            pendingAuthority: config.pendingAuthority ? config.pendingAuthority.toBase58() : null,
            pendingTreasury: config.pendingTreasury ? config.pendingTreasury.toBase58() : null,
            pendingOps: config.pendingOps ? config.pendingOps.toBase58() : null,
            pendingFeeBpsTreasury: config.pendingFeeBpsTreasury ?? null,
            pendingFeeBpsOps: config.pendingFeeBpsOps ?? null,
            pendingConfigTs: config.pendingConfigTs ? Number(config.pendingConfigTs) : 0,
            lastConfigUpdateTs: config.lastConfigUpdateTs ? Number(config.lastConfigUpdateTs) : 0,
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
 * Cancel a match — refund deposited players.
 *
 * S2-T7 (DB H014): the refund-target subset is derived from the ON-CHAIN
 * deposits_mask, not from the caller-provided list. Server-side wagerStates
 * can diverge from on-chain truth (missed confirmation, server crash mid-flow,
 * RPC blip on deposit verify) — passing the caller's list would risk
 * IncompleteRefund and stick funds in the PDA.
 *
 * The `providedPlayerAddresses` arg is kept for backward-compat with existing
 * call sites + used as a sanity cross-check. If caller's list diverges from
 * on-chain, we log a warning and proceed with the on-chain set.
 *
 * The v2 contract expects remaining_accounts.length == count_ones(deposits_mask)
 * with accounts in player-index order matching set bits. This wrapper handles
 * that construction atomically against the same RPC read as the count.
 */
export async function cancelMatchEscrowV2(matchId, providedPlayerAddresses) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);

        // Fetch escrow state to derive the correct refund-target list
        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        const maxPlayers = escrow.maxPlayers;
        const depositsMask = escrow.depositsMask;

        const refundTargets = [];
        for (let i = 0; i < maxPlayers; i++) {
            if ((depositsMask >> i) & 1) {
                refundTargets.push(escrow.players[i].toBase58());
            }
        }

        // Sanity cross-check vs caller's view (non-blocking — log only)
        if (Array.isArray(providedPlayerAddresses) && providedPlayerAddresses.length > 0) {
            const callerSorted = [...providedPlayerAddresses].sort().join(',');
            const onChainSorted = [...refundTargets].sort().join(',');
            if (callerSorted !== onChainSorted) {
                console.warn(`[EscrowV2] cancelMatch refund list divergence for ${matchId} — caller: [${callerSorted}] on-chain: [${onChainSorted}] — using on-chain`);
            }
        }

        if (refundTargets.length === 0) {
            console.warn(`[EscrowV2] cancelMatch ${matchId}: no deposits to refund (deposits_mask=0)`);
            // Still call cancel — closes the PDA and reclaims rent to authority
        }

        const tx = await program.methods
            .cancelMatch()
            .accounts({ escrow: escrowPDA, caller: getEscrowKeypair().publicKey })
            .remainingAccounts(
                refundTargets.map(addr => ({
                    pubkey: new PublicKey(addr),
                    isWritable: true,
                    isSigner: false,
                }))
            )
            .rpc();

        console.log(`[EscrowV2] Cancelled match ${matchId} (${refundTargets.length} refunds via on-chain mask) — TX: ${tx}`);
        return { success: true, txSignature: tx, refundCount: refundTargets.length };
    } catch (err) {
        console.error(`[EscrowV2] cancelMatch failed for ${matchId}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Permissionless reclaim — anyone can trigger refund after match_end_ts + 24h grace.
 * Caller receives PDA rent reserve as economic incentive.
 *
 * S2-T7 (DB H014): same on-chain-derived refund-target pattern as cancelMatchEscrowV2.
 * Especially important here — permissionless_reclaim can be called by ANYONE after
 * grace expires, including third parties whose view of who-deposited may not exist
 * at all. Deriving from on-chain is the only correct path.
 */
export async function permissionlessReclaimEscrowV2(matchId, providedPlayerAddresses) {
    if (!program) return { success: false, error: 'EscrowV2 not initialized' };

    try {
        const [escrowPDA] = getEscrowPDAV2(matchId);

        const escrow = await program.account.matchEscrow.fetch(escrowPDA);
        const maxPlayers = escrow.maxPlayers;
        const depositsMask = escrow.depositsMask;

        const refundTargets = [];
        for (let i = 0; i < maxPlayers; i++) {
            if ((depositsMask >> i) & 1) {
                refundTargets.push(escrow.players[i].toBase58());
            }
        }

        if (Array.isArray(providedPlayerAddresses) && providedPlayerAddresses.length > 0) {
            const callerSorted = [...providedPlayerAddresses].sort().join(',');
            const onChainSorted = [...refundTargets].sort().join(',');
            if (callerSorted !== onChainSorted) {
                console.warn(`[EscrowV2] permissionlessReclaim refund list divergence for ${matchId} — caller: [${callerSorted}] on-chain: [${onChainSorted}] — using on-chain`);
            }
        }

        const tx = await program.methods
            .permissionlessReclaim()
            .accounts({ escrow: escrowPDA, caller: provider.wallet.publicKey })
            .remainingAccounts(
                refundTargets.map(addr => ({
                    pubkey: new PublicKey(addr),
                    isWritable: true,
                    isSigner: false,
                }))
            )
            .rpc();

        console.log(`[EscrowV2] Permissionless reclaim ${matchId} (${refundTargets.length} refunds via on-chain mask) — TX: ${tx}`);
        return { success: true, txSignature: tx, refundCount: refundTargets.length };
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
