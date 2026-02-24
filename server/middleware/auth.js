/**
 * SolShot Wallet Authentication
 *
 * Verifies that a client owns a Solana wallet by checking
 * that they signed a message with their private key.
 *
 * Flow:
 *   1. Client signs "SolShot Auth: <walletAddress> at <timestamp>" with wallet
 *   2. Server verifies signature using @solana/web3.js
 *   3. Server issues JWT or marks socket as authenticated
 */

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// H007: Remove hardcoded JWT secret fallback
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] FATAL: JWT_SECRET must be set in production');
        process.exit(1);
    }
    const devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] No JWT_SECRET set — using random secret (dev mode). Tokens will not survive restart.');
    return devSecret;
})();
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes — signature must be recent

/**
 * Verify a wallet signature
 *
 * @param {string} walletAddress - Base58 public key
 * @param {string} message - The signed message (plaintext)
 * @param {string} signatureBase64 - Base64-encoded signature
 * @returns {{valid: boolean, reason?: string}}
 */
export function verifyWalletSignature(walletAddress, message, signatureBase64) {
    try {
        // Validate wallet address format
        const publicKey = new PublicKey(walletAddress);
        if (!PublicKey.isOnCurve(publicKey.toBytes())) {
            return { valid: false, reason: 'Invalid wallet address' };
        }

        // Decode signature
        const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
        const messageBytes = new TextEncoder().encode(message);

        // Verify with nacl
        const verified = nacl.sign.detached.verify(
            messageBytes,
            signature,
            publicKey.toBytes()
        );

        if (!verified) {
            return { valid: false, reason: 'Signature verification failed' };
        }

        return { valid: true };
    } catch (err) {
        return { valid: false, reason: `Verification error: ${err.message}` };
    }
}

/**
 * Verify the auth message format and timestamp
 *
 * @param {string} message - "SolShot Auth: <wallet> at <timestamp>"
 * @param {string} walletAddress
 * @param {number} timestamp
 * @returns {{valid: boolean, reason?: string}}
 */
export function verifyAuthMessage(message, walletAddress, timestamp) {
    const expected = `SolShot Auth: ${walletAddress} at ${timestamp}`;
    if (message !== expected) {
        return { valid: false, reason: 'Invalid message format' };
    }

    // Check timestamp is recent
    const age = Date.now() - timestamp;
    if (age > AUTH_TIMEOUT || age < -60000) {
        return { valid: false, reason: 'Auth message expired' };
    }

    return { valid: true };
}

/**
 * Generate JWT for authenticated wallet
 *
 * @param {string} walletAddress
 * @returns {string} JWT token
 */
export function generateToken(walletAddress) {
    return jwt.sign(
        { wallet: walletAddress },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

// E1: verifyToken removed — was dead code (never imported anywhere)

/**
 * Socket.IO authentication handler
 * Attach to socket events in main.js
 *
 * @param {object} client - Socket.IO client
 * @param {object} data - { walletAddress, message, signature, timestamp }
 * @returns {{success: boolean, token?: string, reason?: string}}
 */
export function handleAuthenticate(client, { walletAddress, message, signature, timestamp }) {
    // Verify message format
    const msgCheck = verifyAuthMessage(message, walletAddress, timestamp);
    if (!msgCheck.valid) {
        return { success: false, reason: msgCheck.reason };
    }

    // Verify signature
    const sigCheck = verifyWalletSignature(walletAddress, message, signature);
    if (!sigCheck.valid) {
        return { success: false, reason: sigCheck.reason };
    }

    // Generate JWT
    const token = generateToken(walletAddress);

    // Mark socket as authenticated
    client.walletAddress = walletAddress;
    client.isAuthenticated = true;

    return { success: true, token, walletAddress };
}
