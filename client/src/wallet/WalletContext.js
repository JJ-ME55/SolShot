/**
 * SolShot Wallet Context
 *
 * Provides Solana wallet connectivity throughout the app.
 * Supports Phantom, Solflare, and other Solana wallets.
 *
 * Usage in React:
 *   import { useWallet } from '@solana/wallet-adapter-react';
 *   const { publicKey, connected, signMessage } = useWallet();
 *
 * Usage in Phaser (via window):
 *   window.solWallet.publicKey  - connected wallet address
 *   window.solWallet.balance    - SOL balance
 *   window.solWallet.connected  - boolean
 */

import React, { useMemo, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, LAMPORTS_PER_SOL, Transaction, PublicKey } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Solana network (devnet for development, mainnet-beta for production)
const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);

// SHOT token mint address (set in .env after deploying to devnet)
const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
    ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
    : null;

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

            setIsAuthenticated(true);
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

    // Expose wallet state to Phaser via window
    useEffect(() => {
        window.solWallet = {
            publicKey: walletAddress,
            balance,
            connected,
            refreshBalance,
            shotBalance,
            prestigeInfo,
            signAndSendEscrowDeposit,
            signAndBurnShot,
        };
    }, [walletAddress, balance, connected, refreshBalance, shotBalance, prestigeInfo, signAndSendEscrowDeposit, signAndBurnShot]);

    const value = useMemo(() => ({
        balance,
        refreshBalance,
        walletAddress,
        isAuthenticated,
        authenticate,
        shotBalance,
        prestigeInfo,
        signAndSendEscrowDeposit,
        signAndBurnShot,
    }), [balance, refreshBalance, walletAddress, isAuthenticated, authenticate, shotBalance, prestigeInfo, signAndSendEscrowDeposit, signAndBurnShot]);

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
    const wallets = useMemo(() => [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
    ], []);

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
