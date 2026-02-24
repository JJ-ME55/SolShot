/**
 * SolShot Wallet Context
 *
 * Provides Solana wallet connectivity throughout the app.
 * Supports Phantom, Solflare, and other Solana wallets.
 *
 * Usage in React:
 *   import { useSolShotWallet } from './wallet/WalletContext';
 *   const { balance, walletAddress, signAndSendEscrowDeposit } = useSolShotWallet();
 *
 *   import { useWallet } from '@solana/wallet-adapter-react';
 *   const { publicKey, connected, signMessage } = useWallet();
 */

import React, { useMemo, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, LAMPORTS_PER_SOL, Transaction, PublicKey } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Jupiter Mobile adapter via Reown/WalletConnect (JUP-01)
import { useWrappedReownAdapter } from '@jup-ag/jup-mobile-adapter';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Solana network (devnet for development, mainnet-beta for production)
const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);

// Reown (WalletConnect) project ID — required for Jupiter Mobile adapter
// Register at https://dashboard.reown.com to get a project ID
const REOWN_PROJECT_ID = process.env.REACT_APP_REOWN_PROJECT_ID || '';

// SHOT token mint address (set in .env after deploying to devnet)
const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
    ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
    : null;

// CS-01: Escrow program ID for TX validation
const ESCROW_PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID)
    : null;

// CS-01: Known deposit_wager discriminator (SHA-256 of "global:deposit_wager" first 8 bytes)
// Verified from IDL: [234, 73, 235, 136, 168, 103, 239, 207]
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);

// CS-01: Allowed program IDs in escrow deposit transactions
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

/**
 * CS-01: Validate escrow deposit transaction instructions before signing.
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateEscrowTransaction(tx) {
    if (!ESCROW_PROGRAM_ID) {
        // Dev mode — no program ID configured, skip validation
        return { valid: true };
    }

    const instructions = tx.instructions;
    if (!instructions || instructions.length === 0) {
        return { valid: false, reason: 'Transaction has no instructions' };
    }

    let hasDepositInstruction = false;

    for (const ix of instructions) {
        const programId = ix.programId.toBase58();

        if (ix.programId.equals(ESCROW_PROGRAM_ID)) {
            // Escrow program instruction — verify it's deposit_wager
            if (ix.data.length < 8) {
                return { valid: false, reason: 'Escrow instruction data too short' };
            }
            const discriminator = ix.data.slice(0, 8);
            if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
                return { valid: false, reason: `Unknown escrow instruction (discriminator mismatch)` };
            }
            hasDepositInstruction = true;
        } else if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
            // ComputeBudget is allowed (server may add compute unit price/limit)
            continue;
        } else {
            // Unknown program — reject
            return { valid: false, reason: `Unexpected program: ${programId}` };
        }
    }

    if (!hasDepositInstruction) {
        return { valid: false, reason: 'No deposit_wager instruction found' };
    }

    return { valid: true };
}

// Context for SolShot-specific wallet state
const SolShotWalletContext = createContext({
    balance: 0,
    refreshBalance: () => {},
    walletAddress: null,
    isAuthenticated: false,
    authenticate: () => {},
});

export function useSolShotWallet() {
    return useContext(SolShotWalletContext);
}

/**
 * Inner provider that uses wallet adapter hooks
 */
function SolShotWalletInner({ children }) {
    const { publicKey, connected, signMessage, signTransaction, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [balance, setBalance] = useState(0);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [shotBalance, setShotBalance] = useState(0);
    const [prestigeInfo, setPrestigeInfo] = useState({ tier: 0, tierName: 'Unranked' });

    // JUP-01: Inject CSS to visually highlight the first wallet (Jupiter Mobile) in the modal
    // Uses the wallet-adapter-react-ui modal's list structure
    useEffect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-solshot-jup-highlight', 'true');
        style.textContent = `
            .wallet-adapter-modal-list li:first-child {
                border: 1px solid rgba(153, 69, 255, 0.4) !important;
                background: rgba(153, 69, 255, 0.08) !important;
                border-radius: 6px !important;
                position: relative;
            }
            .wallet-adapter-modal-list li:first-child::after {
                content: 'RECOMMENDED';
                position: absolute;
                top: -8px;
                right: 8px;
                font-size: 9px;
                font-family: 'Share Tech Mono', monospace;
                letter-spacing: 2px;
                color: rgba(153, 69, 255, 0.8);
                background: #1a1a2e;
                padding: 1px 6px;
                border-radius: 2px;
            }
        `;
        document.head.appendChild(style);
        return () => {
            const existing = document.querySelector('[data-solshot-jup-highlight]');
            if (existing) document.head.removeChild(existing);
        };
    }, []);

    const walletAddress = useMemo(() => {
        return publicKey ? publicKey.toBase58() : null;
    }, [publicKey]);

    // Fetch SOL balance
    const refreshBalance = useCallback(async () => {
        if (!publicKey || !connection) {
            setBalance(0);
            return;
        }
        try {
            const lamports = await connection.getBalance(publicKey);
            setBalance(lamports / LAMPORTS_PER_SOL);
        } catch (err) {
            console.warn('[SolShot] Balance fetch error:', err.message);
            setBalance(0);
        }
    }, [publicKey, connection]);

    // Refresh balance when wallet connects
    useEffect(() => {
        if (connected && publicKey) {
            refreshBalance();
        } else {
            setBalance(0);
            setIsAuthenticated(false);
        }
    }, [connected, publicKey, refreshBalance]);

    // Listen for SHOT balance updates from server
    useEffect(() => {
        const socket = window.socket;
        if (!socket) return;

        const handleShotInfo = (data) => {
            setShotBalance(data.balance || 0);
            if (data.prestige) setPrestigeInfo(data.prestige);
        };

        socket.on('shotInfo', handleShotInfo);
        return () => { socket.off('shotInfo', handleShotInfo); };
    }, []);

    // Request SHOT info when authenticated
    useEffect(() => {
        if (isAuthenticated && window.socket) {
            window.socket.emit('getShotInfo');
        }
    }, [isAuthenticated]);

    // Authenticate with server (sign a message to prove wallet ownership)
    const authenticate = useCallback(async () => {
        if (!publicKey || !signMessage) {
            console.warn('[SolShot] Cannot authenticate: no wallet or signMessage');
            return null;
        }

        try {
            const timestamp = Date.now();
            const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signature = await signMessage(encodedMessage);

            // Convert signature to base64 for transport
            const signatureBase64 = btoa(String.fromCharCode(...signature));

            // Send to server via socket
            const socket = window.socket;
            if (socket) {
                socket.emit('authenticate', {
                    walletAddress,
                    message,
                    signature: signatureBase64,
                    timestamp,
                });
            }

            // Don't set isAuthenticated here — wait for server 'authResult' confirmation
            return { walletAddress, signature: signatureBase64, message };
        } catch (err) {
            console.error('[SolShot] Auth error:', err.message);
            setIsAuthenticated(false);
            return null;
        }
    }, [publicKey, signMessage, walletAddress]);

    // Sign and send an escrow deposit transaction (base64 from server)
    const signAndSendEscrowDeposit = useCallback(async (serializedTxBase64, roomId) => {
        if (!publicKey || !sendTransaction || !connection) {
            console.warn('[SolShot] Cannot sign escrow deposit: wallet not ready');
            return null;
        }

        try {
            // Deserialize the transaction from base64
            const txBuffer = Buffer.from(serializedTxBase64, 'base64');
            const tx = Transaction.from(txBuffer);

            // CS-01: Validate transaction instructions before signing
            const validation = validateEscrowTransaction(tx);
            if (!validation.valid) {
                console.error('[SolShot] TX validation FAILED:', validation.reason);
                // Silent report to server (don't reveal detection details to attacker)
                const socket = window.socket;
                if (socket) {
                    socket.emit('suspiciousTx', {
                        reason: validation.reason,
                        roomId,
                    });
                }
                return null;
            }

            // Send via wallet adapter (prompts user to sign)
            const signature = await sendTransaction(tx, connection);
            console.log('[SolShot] Escrow deposit TX sent:', signature);

            // Confirm
            await connection.confirmTransaction(signature, 'confirmed');
            console.log('[SolShot] Escrow deposit confirmed:', signature);

            // Notify server
            const socket = window.socket;
            if (socket) {
                socket.emit('escrowDepositConfirm', { roomId, txSignature: signature });
            }

            // Refresh balance after deposit
            refreshBalance();

            return signature;
        } catch (err) {
            console.error('[SolShot] Escrow deposit error:', err.message);
            return null;
        }
    }, [publicKey, sendTransaction, connection, refreshBalance]);

    // Burn SHOT tokens for prestige tier upgrade
    const signAndBurnShot = useCallback(async (burnAmount) => {
        if (!publicKey || !sendTransaction || !connection || !SHOT_TOKEN_MINT) {
            console.warn('[SolShot] Cannot burn SHOT: wallet not ready or no token mint');
            return null;
        }

        try {
            // Get player's associated token account for SHOT
            const ata = await getAssociatedTokenAddress(SHOT_TOKEN_MINT, publicKey);

            // burnAmount is in whole tokens — convert to raw (9 decimals)
            // Max burn is 4000 SHOT = 4e12 raw — well within Number.MAX_SAFE_INTEGER
            const rawAmount = burnAmount * 1_000_000_000;

            // Build burn instruction (burns from player's ATA, reducing total supply)
            const burnIx = createBurnInstruction(
                ata,              // token account to burn from
                SHOT_TOKEN_MINT,  // mint
                publicKey,        // owner (signer)
                rawAmount,        // amount in raw units
                [],               // multi-signers (none)
                TOKEN_PROGRAM_ID
            );

            const tx = new Transaction().add(burnIx);
            tx.feePayer = publicKey;
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;

            // Send via wallet adapter (prompts user to sign)
            const signature = await sendTransaction(tx, connection);
            console.log('[SolShot] SHOT burn TX sent:', signature);

            // Confirm
            await connection.confirmTransaction(signature, 'confirmed');
            console.log('[SolShot] SHOT burn confirmed:', signature);

            return signature;
        } catch (err) {
            console.error('[SolShot] SHOT burn error:', err.message);
            return null;
        }
    }, [publicKey, sendTransaction, connection]);

    // Listen for auth result from server
    useEffect(() => {
        const checkSocket = () => {
            const socket = window.socket;
            if (!socket) return false;
            const handler = (result) => {
                if (result.success) {
                    console.log('[SolShot] Auth confirmed by server');
                    setIsAuthenticated(true);
                } else {
                    console.warn('[SolShot] Auth rejected:', result.reason);
                    setIsAuthenticated(false);
                }
            };
            socket.on('authResult', handler);
            return () => { socket.off('authResult', handler); };
        };
        // Socket might not exist yet — poll briefly
        const cleanup = checkSocket();
        if (cleanup) return cleanup;
        const timer = setInterval(() => {
            const c = checkSocket();
            if (c) { clearInterval(timer); }
        }, 500);
        return () => clearInterval(timer);
    }, []);

    // Auto-authenticate when wallet connects and socket is ready
    useEffect(() => {
        if (!connected || !publicKey || isAuthenticated) return;
        // Poll for socket availability (may not exist on first render)
        const tryAuth = () => {
            if (window.socket && window.socket.connected) {
                console.log('[SolShot] Auto-authenticating wallet...');
                authenticate();
                return true;
            }
            return false;
        };
        if (tryAuth()) return;
        const timer = setInterval(() => {
            if (tryAuth()) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [connected, publicKey, isAuthenticated, authenticate]);

    const value = useMemo(() => ({
        balance,
        refreshBalance,
        walletAddress,
        connected,
        isAuthenticated,
        authenticate,
        shotBalance,
        prestigeInfo,
        signAndSendEscrowDeposit,
        signAndBurnShot,
    }), [balance, refreshBalance, walletAddress, connected, isAuthenticated, authenticate, shotBalance, prestigeInfo, signAndSendEscrowDeposit, signAndBurnShot]);

    return (
        <SolShotWalletContext.Provider value={value}>
            {children}
        </SolShotWalletContext.Provider>
    );
}

/**
 * Main wallet provider — wrap your app with this
 */
export function SolShotWalletProvider({ children }) {
    // JUP-01: Jupiter Mobile adapter via Reown/WalletConnect
    // Hook must always be called (React rules of hooks — no conditional calls)
    // When REOWN_PROJECT_ID is empty, the adapters are still created but connection will fail gracefully
    const { jupiterAdapter } = useWrappedReownAdapter({
        appKitOptions: {
            metadata: {
                name: 'SolShot',
                description: 'Artillery wagering on Solana',
                url: 'https://solshot.gg',
                icons: ['/logo192.png'],
            },
            projectId: REOWN_PROJECT_ID,
            features: { analytics: false, email: false, socials: false },
            enableWallets: false,
        },
    });

    const wallets = useMemo(() => {
        if (!REOWN_PROJECT_ID) {
            // No project ID — hide Jupiter Mobile, log warning
            console.warn('[SolShot] REACT_APP_REOWN_PROJECT_ID not set — Jupiter Mobile adapter disabled');
            return [
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter(),
            ];
        }
        // Jupiter Mobile at position 0 (top of list, highlighted as RECOMMENDED)
        return [
            jupiterAdapter,
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ].filter(Boolean);
    }, [jupiterAdapter]);

    return (
        <ConnectionProvider endpoint={RPC_URL}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <SolShotWalletInner>
                        {children}
                    </SolShotWalletInner>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}

export { NETWORK, RPC_URL };
