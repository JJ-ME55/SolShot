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
import { clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Solana network (devnet for development, mainnet-beta for production)
const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);

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
    const { publicKey, connected, signMessage } = useWallet();
    const { connection } = useConnection();
    const [balance, setBalance] = useState(0);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

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

    // Expose wallet state to Phaser via window
    useEffect(() => {
        window.solWallet = {
            publicKey: walletAddress,
            balance,
            connected,
            refreshBalance,
        };
    }, [walletAddress, balance, connected, refreshBalance]);

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

    const value = useMemo(() => ({
        balance,
        refreshBalance,
        walletAddress,
        isAuthenticated,
        authenticate,
    }), [balance, refreshBalance, walletAddress, isAuthenticated, authenticate]);

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
