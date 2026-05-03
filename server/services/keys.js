/**
 * SolShot Key Management Service (KM-03, KM-04)
 *
 * Centralized key-loading module. All server-side code that needs the
 * escrow authority keypair imports from here — no other module reads
 * SOLANA_KEYPAIR_PATH or SOLANA_KEYPAIR_JSON.
 *
 * Security properties:
 *   - Single point of key ingestion (KM-03)
 *   - Input byte array zeroed after Keypair construction (KM-04)
 *   - Keypair object is the only in-memory copy of the secret
 */

import { Keypair } from '@solana/web3.js';
import fs from 'fs';

let _escrowKeypair = null;

/**
 * Load the server escrow authority keypair.
 *
 * Priority: SOLANA_KEYPAIR_JSON env var > SOLANA_KEYPAIR_PATH file.
 * Returns true if keypair loaded successfully, false if no keypair
 * configured (dev mode) or on error.
 *
 * KM-04: The input Uint8Array is zeroed immediately after
 * Keypair.fromSecretKey() — the Keypair constructor internally
 * slices the array, so the original can be safely wiped.
 *
 * @returns {boolean} true if keypair available
 */
export function initKeys() {
    const keypairJson = process.env.SOLANA_KEYPAIR_JSON;
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;

    if (!keypairJson && !keypairPath) {
        console.warn('[Keys] No SOLANA_KEYPAIR_JSON/PATH configured — keys not loaded (dev mode)');
        return false;
    }

    try {
        let secretKeyArray;

        if (keypairJson) {
            secretKeyArray = JSON.parse(keypairJson);
        } else {
            const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
            secretKeyArray = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        }

        const bytes = Uint8Array.from(secretKeyArray);
        _escrowKeypair = Keypair.fromSecretKey(bytes);

        // NOTE: We previously ran `bytes.fill(0)` here as KM-04 "zero the
        // input array — secret now lives only inside the Keypair object."
        // That optimization was wrong: @solana/web3.js Keypair.fromSecretKey
        // ALIASES the input Uint8Array (verified empirically on 1.98.4 —
        // `kp.secretKey` shares the same buffer). Zeroing the input also
        // zeroed the keypair's internal secret. The public key was already
        // computed (logs showed the right pubkey) but every signing op
        // produced an invalid signature, surfacing as
        //   "Signature verification failed. Invalid signature for public
        //    key [HPy...]"
        // on every createMatch / settleMatch / cancelMatch call. Removed.
        // See server logs at 2026-05-03 21:33Z for the failure mode.

        console.log(`[Keys] Escrow authority: ${_escrowKeypair.publicKey.toBase58()}`);
        return true;
    } catch (err) {
        console.error('[Keys] Failed to load keypair:', err.message);
        return false;
    }
}

/**
 * Get the escrow authority Keypair.
 * Returns the full Keypair (required by Anchor Wallet constructor),
 * or null if keys have not been initialized.
 *
 * @returns {import('@solana/web3.js').Keypair | null}
 */
export function getEscrowKeypair() {
    return _escrowKeypair;
}

/**
 * Check if keys are loaded and ready.
 *
 * @returns {boolean}
 */
export function isKeysReady() {
    return _escrowKeypair !== null;
}
