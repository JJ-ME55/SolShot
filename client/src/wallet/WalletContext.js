/**
 * SolShot Wallet Context
 *
 * Provides Solana wallet connectivity throughout the app.
 *
 * Architecture (Phase 2 of the Syndicate-pattern migration, 2026-05-04):
 *   - Outer: PrivyProvider — provides embedded Solana wallets (silent UX)
 *     plus integrated external-wallet connectors (Phantom, Solflare).
 *     New users sign in with email → Privy auto-creates a Solana wallet.
 *     Power users with Phantom can still connect their existing wallet.
 *   - Inner: ConnectionProvider + wallet-adapter (legacy path) — kept as
 *     a fallback for dev environments where REACT_APP_PRIVY_APP_ID isn't
 *     set, and to support Reown / Jupiter Mobile connectors that aren't
 *     yet first-class in Privy's externalWallets.
 *
 * The unified SolShotWalletInner reads BOTH layers and picks the active
 * wallet at signing time:
 *   - If Privy authenticated AND has a Solana wallet → use Privy
 *   - Else if wallet-adapter connected → use wallet-adapter
 *   - Else → no wallet
 *
 * Usage in React (unchanged from before):
 *   import { useSolShotWallet } from './wallet/WalletContext';
 *   const { walletAddress, signAndSendEscrowDeposit, login } = useSolShotWallet();
 */

import React, { useMemo, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, LAMPORTS_PER_SOL, Transaction, PublicKey } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

// Privy SDK (Phase 2 — embedded Solana wallets via dashboard.privy.io)
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import {
    useWallets as usePrivySolanaWallets,
    useSignMessage as usePrivySignMessage,
    useSignAndSendTransaction as usePrivySignAndSend,
    toSolanaWalletConnectors,
} from '@privy-io/react-auth/solana';

// Jupiter Mobile adapter via Reown/WalletConnect (JUP-01) — kept on the
// wallet-adapter path; not yet wired into Privy's externalWallets list.
import { useWrappedReownAdapter } from '@jup-ag/jup-mobile-adapter';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// ─── Env / config ──────────────────────────────────────────────────────

const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);
const REOWN_PROJECT_ID = process.env.REACT_APP_REOWN_PROJECT_ID || '';
const PRIVY_APP_ID = process.env.REACT_APP_PRIVY_APP_ID || '';

const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
    ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
    : null;

const ESCROW_PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID)
    : null;

// CS-01: Known deposit_wager discriminator (SHA-256 of "global:deposit_wager" first 8 bytes)
// Verified from IDL: [234, 73, 235, 136, 168, 103, 239, 207]
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

/**
 * CS-01: Validate escrow deposit transaction instructions before signing.
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateEscrowTransaction(tx) {
    if (!ESCROW_PROGRAM_ID) {
        return { valid: true }; // Dev mode — no program ID configured
    }
    const instructions = tx.instructions;
    if (!instructions || instructions.length === 0) {
        return { valid: false, reason: 'Transaction has no instructions' };
    }
    let hasDepositInstruction = false;
    for (const ix of instructions) {
        const programId = ix.programId.toBase58();
        if (ix.programId.equals(ESCROW_PROGRAM_ID)) {
            if (ix.data.length < 8) {
                return { valid: false, reason: 'Escrow instruction data too short' };
            }
            const discriminator = ix.data.slice(0, 8);
            if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
                return { valid: false, reason: 'Unknown escrow instruction (discriminator mismatch)' };
            }
            hasDepositInstruction = true;
        } else if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
            continue;
        } else {
            return { valid: false, reason: `Unexpected program: ${programId}` };
        }
    }
    if (!hasDepositInstruction) {
        return { valid: false, reason: 'No deposit_wager instruction found' };
    }
    return { valid: true };
}

// ─── Context ───────────────────────────────────────────────────────────

const SolShotWalletContext = createContext({
    balance: 0,
    refreshBalance: () => {},
    walletAddress: null,
    isAuthenticated: false,
    authenticate: () => {},
    login: () => {},
    logout: () => {},
});

export function useSolShotWallet() {
    return useContext(SolShotWalletContext);
}

// ─── Inner provider — uses both Privy and wallet-adapter hooks ─────────

function SolShotWalletInner({ children }) {
    // Wallet-adapter hooks (legacy path — kept for users with Phantom extension
    // or for Jupiter Mobile via Reown)
    const {
        publicKey: adapterPubkey,
        connected: adapterConnected,
        signMessage: adapterSignMessage,
        signTransaction: adapterSignTransaction,
        sendTransaction: adapterSendTransaction,
    } = useWallet();
    const { connection } = useConnection();

    // Privy hooks (primary path — silent embedded wallet UX)
    // These all gracefully no-op when PrivyProvider isn't wrapping (PRIVY_APP_ID
    // unset), because PrivyConditionalProvider falls through to the legacy path
    // entirely in that case. So no try/catch needed here.
    const { ready: privyReady, authenticated: privyAuthed, login: privyLogin, logout: privyLogout } = usePrivy();
    const { wallets: privySolanaWallets } = usePrivySolanaWallets();
    const { signMessage: privySignMessageFn } = usePrivySignMessage();
    const { signAndSendTransaction: privySignAndSendFn } = usePrivySignAndSend();

    // Pick the active wallet — prefer Privy when authenticated AND has a wallet
    const privyWallet = useMemo(() => {
        if (!privyAuthed || !privySolanaWallets || privySolanaWallets.length === 0) return null;
        return privySolanaWallets[0]; // first wallet is the user's primary
    }, [privyAuthed, privySolanaWallets]);

    const activeSource = privyWallet ? 'privy' : (adapterConnected ? 'adapter' : null);

    const publicKey = useMemo(() => {
        if (privyWallet) {
            try { return new PublicKey(privyWallet.address); } catch { return null; }
        }
        return adapterPubkey || null;
    }, [privyWallet, adapterPubkey]);

    const connected = !!privyWallet || adapterConnected;

    const [balance, setBalance] = useState(0);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [shotBalance, setShotBalance] = useState(0);
    const [prestigeInfo, setPrestigeInfo] = useState({ tier: 0, tierName: 'Unranked' });

    // JUP-01: Inject CSS to highlight first wallet (Jupiter Mobile) in the
    // wallet-adapter modal — only relevant for the legacy wallet-adapter path
    // (when user picks "Connect Phantom/Solflare/Jupiter Mobile" instead of
    // signing in with Privy).
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

    // Fetch SOL balance for the active wallet
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

    useEffect(() => {
        if (connected && publicKey) {
            refreshBalance();
        } else {
            setBalance(0);
            setIsAuthenticated(false);
        }
    }, [connected, publicKey, refreshBalance]);

    // SHOT balance + prestige info from server socket
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

    useEffect(() => {
        if (isAuthenticated && window.socket) {
            window.socket.emit('getShotInfo');
        }
    }, [isAuthenticated]);

    // ─── Unified signing methods — pick Privy or adapter at call time ───

    const signMessageUnified = useCallback(async (encodedMessage) => {
        if (privyWallet) {
            const result = await privySignMessageFn({ message: encodedMessage, wallet: privyWallet });
            return result.signature; // Uint8Array
        }
        if (adapterSignMessage) {
            return adapterSignMessage(encodedMessage);
        }
        throw new Error('No wallet available to sign message');
    }, [privyWallet, privySignMessageFn, adapterSignMessage]);

    const sendTransactionUnified = useCallback(async (tx, conn) => {
        if (privyWallet) {
            const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
            const result = await privySignAndSendFn({
                transaction: new Uint8Array(serialized),
                wallet: privyWallet,
            });
            // signature is Uint8Array — convert to base58 (Solana TX-signature format)
            return bs58.encode(result.signature);
        }
        if (adapterSendTransaction) {
            return adapterSendTransaction(tx, conn);
        }
        throw new Error('No wallet available to send transaction');
    }, [privyWallet, privySignAndSendFn, adapterSendTransaction]);

    // ─── App-specific actions (authenticate, escrow deposit, SHOT burn) ───

    const authenticate = useCallback(async () => {
        if (!walletAddress) {
            console.warn('[SolShot] Cannot authenticate: no wallet');
            return null;
        }
        try {
            const timestamp = Date.now();
            const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signature = await signMessageUnified(encodedMessage);
            const signatureBase64 = btoa(String.fromCharCode(...signature));
            const socket = window.socket;
            if (socket) {
                socket.emit('authenticate', {
                    walletAddress,
                    message,
                    signature: signatureBase64,
                    timestamp,
                });
            }
            return { walletAddress, signature: signatureBase64, message };
        } catch (err) {
            console.error('[SolShot] Auth error:', err.message);
            setIsAuthenticated(false);
            return null;
        }
    }, [walletAddress, signMessageUnified]);

    const signAndSendEscrowDeposit = useCallback(async (serializedTxBase64, roomId) => {
        if (!publicKey || !connection) {
            console.warn('[SolShot] Cannot sign escrow deposit: wallet not ready');
            return null;
        }
        try {
            const txBuffer = Buffer.from(serializedTxBase64, 'base64');
            const tx = Transaction.from(txBuffer);

            const validation = validateEscrowTransaction(tx);
            if (!validation.valid) {
                console.error('[SolShot] TX validation FAILED:', validation.reason);
                const socket = window.socket;
                if (socket) {
                    socket.emit('suspiciousTx', { reason: validation.reason, roomId });
                }
                return null;
            }

            const signature = await sendTransactionUnified(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            const socket = window.socket;
            if (socket) {
                socket.emit('escrowDepositConfirm', { roomId, txSignature: signature });
            }
            refreshBalance();
            return signature;
        } catch (err) {
            console.error('[SolShot] Escrow deposit error:', err.message);
            return null;
        }
    }, [publicKey, connection, sendTransactionUnified, refreshBalance]);

    const signAndBurnShot = useCallback(async (burnAmount) => {
        if (!publicKey || !connection || !SHOT_TOKEN_MINT) {
            console.warn('[SolShot] Cannot burn SHOT: wallet not ready or no token mint');
            return null;
        }
        try {
            const ata = await getAssociatedTokenAddress(SHOT_TOKEN_MINT, publicKey);
            const rawAmount = burnAmount * 1_000_000_000;
            const burnIx = createBurnInstruction(
                ata, SHOT_TOKEN_MINT, publicKey, rawAmount, [], TOKEN_PROGRAM_ID
            );
            const tx = new Transaction().add(burnIx);
            tx.feePayer = publicKey;
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            const signature = await sendTransactionUnified(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (err) {
            console.error('[SolShot] SHOT burn error:', err.message);
            return null;
        }
    }, [publicKey, connection, sendTransactionUnified]);

    // Listen for auth result from server
    useEffect(() => {
        const checkSocket = () => {
            const socket = window.socket;
            if (!socket) return false;
            const handler = (result) => {
                if (result.success) {
                    setIsAuthenticated(true);
                } else {
                    console.warn('[SolShot] Auth rejected:', result.reason);
                    setIsAuthenticated(false);
                }
            };
            socket.on('authResult', handler);
            return () => { socket.off('authResult', handler); };
        };
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
        const tryAuth = () => {
            if (window.socket && window.socket.connected) {
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

    // Public login/logout — exposed for Connect Wallet button
    const login = useCallback(() => {
        if (privyLogin) {
            privyLogin();
        } else {
            console.warn('[SolShot] Privy login unavailable — fall back to wallet-adapter modal');
        }
    }, [privyLogin]);

    const logout = useCallback(async () => {
        if (privyLogout && privyAuthed) {
            await privyLogout();
        }
        // Wallet-adapter disconnect is handled by its own modal — we don't
        // force-disconnect here because users may want to swap accounts.
    }, [privyLogout, privyAuthed]);

    const value = useMemo(() => ({
        balance,
        refreshBalance,
        walletAddress,
        connected,
        isAuthenticated,
        authenticate,
        login,
        logout,
        shotBalance,
        prestigeInfo,
        signAndSendEscrowDeposit,
        signAndBurnShot,
        // Source = which wallet path is active
        source: activeSource,
        privyReady,
        privyAuthed,
        // Read by <DebugAuthOverlay> when ?debug=1
        debug: {
            source: activeSource,
            connected,
            hasPublicKey: !!publicKey,
            walletAddress,
            isAuthenticated,
            privyReady,
            privyAuthed,
            adapterConnected,
            privyHasWallet: !!privyWallet,
        },
    }), [
        balance, refreshBalance, walletAddress, connected, isAuthenticated, authenticate,
        login, logout, shotBalance, prestigeInfo, signAndSendEscrowDeposit, signAndBurnShot,
        activeSource, privyReady, privyAuthed, publicKey, privyWallet, adapterConnected,
    ]);

    return (
        <SolShotWalletContext.Provider value={value}>
            {children}
        </SolShotWalletContext.Provider>
    );
}

// ─── Wallet-adapter (legacy path) provider ─────────────────────────────

function LegacyBrowserWalletProvider({ children }) {
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
            console.warn('[SolShot] REACT_APP_REOWN_PROJECT_ID not set — Jupiter Mobile adapter disabled');
            return [
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter(),
            ];
        }
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

// ─── Top-level provider — Privy + wallet-adapter ────────────────────────

const PRIVY_CONFIG = {
    loginMethods: ['email', 'wallet'],
    embeddedWallets: {
        // Solana embedded wallet — auto-create on login for users without
        // an external wallet linked. This is the "silent UX" — user signs
        // in with email, lands in the app, wallet is already provisioned.
        solana: { createOnLogin: 'users-without-wallets' },
    },
    externalWallets: {
        // Allow users to connect existing Phantom / Solflare via the Privy
        // modal. Privy handles the integration; we don't need wallet-adapter
        // for this path (but keep wallet-adapter around for the Reown /
        // Jupiter Mobile connector that isn't wired into Privy yet).
        solana: { connectors: toSolanaWalletConnectors() },
    },
    solanaClusters: [
        { name: 'devnet', rpcUrl: clusterApiUrl('devnet') },
        { name: 'mainnet-beta', rpcUrl: clusterApiUrl('mainnet-beta') },
    ],
    appearance: {
        theme: 'dark',
        accentColor: '#FFB200',
        // Relative path so the logo works on any host (Vercel preview URLs,
        // localhost, solshot.gg) — absolute URLs cause CSP violations when
        // the page origin doesn't match.
        logo: '/og-preview.png',
        landingHeader: 'Sign in to SolShot',
        showWalletLoginFirst: false, // email first (Web2 UX), wallet second
    },
};

export function SolShotWalletProvider({ children }) {
    // Dev-mode guard: if no Privy app ID configured, fall through to the
    // legacy wallet-adapter-only path. This keeps local dev working without
    // requiring every contributor to set up a Privy account.
    if (!PRIVY_APP_ID) {
        console.warn('[SolShot] REACT_APP_PRIVY_APP_ID not set — falling back to wallet-adapter-only mode (no embedded wallet)');
        return <LegacyBrowserWalletProvider>{children}</LegacyBrowserWalletProvider>;
    }
    return (
        <PrivyProvider appId={PRIVY_APP_ID} config={PRIVY_CONFIG}>
            <LegacyBrowserWalletProvider>{children}</LegacyBrowserWalletProvider>
        </PrivyProvider>
    );
}

export { NETWORK, RPC_URL };
