/**
 * SolShot Wallet Context — Privy-only.
 *
 * Single sign-in path: Privy. New users tap SIGN IN, pick email or
 * Telegram, and Privy provisions an embedded Solana wallet silently.
 * No Phantom/Solflare/wallet-adapter — those were stripped in favor
 * of the simpler "two-button login" UX.
 *
 * All sign/send operations go through the Privy SDK; we broadcast
 * transactions through our own Connection (clusterApiUrl) because
 * Privy's hosted devnet RPC has been unreliable
 * (`wss://solana-devnet.rpc.privy.systems` failed in production,
 * killing useSignAndSendTransaction with a misleading "Failed to
 * connect to wallet" error).
 *
 * Usage in React:
 *   import { useSolShotWallet } from './wallet/WalletContext';
 *   const { walletAddress, signAndSendEscrowDeposit, login } = useSolShotWallet();
 */

import React, { useMemo, useEffect, useCallback, useRef, useState, createContext, useContext } from 'react';
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, Transaction, PublicKey } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Privy SDK (Phase 2 — embedded Solana wallets via dashboard.privy.io)
import { PrivyProvider, usePrivy, useLogin } from '@privy-io/react-auth';
import {
    useWallets as usePrivySolanaWallets,
    useSignMessage as usePrivySignMessage,
    // useSignAndSendTransaction broadcasts via Privy's hosted RPC, which is
    // unreliable on devnet. useSignTransaction signs only — we broadcast
    // through our own Connection (api.devnet.solana.com) instead.
    useSignTransaction as usePrivySignTransaction,
    useCreateWallet as usePrivyCreateSolanaWallet,
    useExportWallet as usePrivyExportSolanaWallet,
    useFundWallet as usePrivyFundSolanaWallet,
    defaultSolanaRpcsPlugin,
} from '@privy-io/react-auth/solana';

// ─── Env / config ──────────────────────────────────────────────────────

const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);
const PRIVY_APP_ID = process.env.REACT_APP_PRIVY_APP_ID || '';
// Privy uses Solana standard chain identifiers (solana:mainnet / solana:devnet).
// Without an explicit `chain` arg, signTransaction defaults to mainnet
// (verified in the SDK source). Mismatch with our actual network breaks
// signing.
const PRIVY_SOLANA_CHAIN = NETWORK === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet';

const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
    ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
    : null;

const ESCROW_PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID)
    : null;

// v2 escrow program (2–10 player matches via TG group chat). Same
// instruction discriminator for `deposit_wager` (Anchor derives from
// instruction name, not program), but a different program ID. The TX
// validator accepts deposits to either program — 1v1 quick-match → v1,
// group chat → v2.
const ESCROW_V2_PROGRAM_ID = process.env.REACT_APP_ESCROW_V2_PROGRAM_ID
    ? new PublicKey(process.env.REACT_APP_ESCROW_V2_PROGRAM_ID)
    : null;

const ALLOWED_ESCROW_PROGRAM_IDS = [ESCROW_PROGRAM_ID, ESCROW_V2_PROGRAM_ID].filter(Boolean);

// CS-01: Known deposit_wager discriminator (SHA-256 of "global:deposit_wager"
// first 8 bytes). Verified from IDL: [234, 73, 235, 136, 168, 103, 239, 207]
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

/**
 * CS-01: Validate escrow deposit transaction instructions before signing.
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateEscrowTransaction(tx) {
    if (ALLOWED_ESCROW_PROGRAM_IDS.length === 0) {
        return { valid: true }; // Dev mode — no program ID configured
    }
    const instructions = tx.instructions;
    if (!instructions || instructions.length === 0) {
        return { valid: false, reason: 'Transaction has no instructions' };
    }
    let hasDepositInstruction = false;
    for (const ix of instructions) {
        const programId = ix.programId.toBase58();
        const matchesEscrow = ALLOWED_ESCROW_PROGRAM_IDS.some(p => ix.programId.equals(p));
        if (matchesEscrow) {
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

// ─── Inner provider (Privy-only) ───────────────────────────────────────

function SolShotWalletInner({ children }) {
    const {
        ready: privyReady,
        authenticated: privyAuthed,
        logout: privyLogout,
        user: privyUser,
        linkEmail: privyLinkEmail,
        linkTelegram: privyLinkTelegram,
        getAccessToken: privyGetAccessToken,
    } = usePrivy();
    // useLogin gives us onComplete + onError callbacks (usePrivy().login
    // does not). onComplete fires after successful auth with the user
    // object + isNewUser flag — we use isNewUser to flag the welcome
    // funding prompt on first sign-in.
    const [isFreshSignIn, setIsFreshSignIn] = useState(false);
    const { login: privyLogin } = useLogin({
        onComplete: ({ isNewUser } = {}) => {
            if (isNewUser) {
                // Defer the prompt: wallet provisioning fires its own
                // useEffect which races with this callback. Set a flag
                // and let the LobbyScreen / MenuScreen pick it up once
                // the wallet is ready.
                setIsFreshSignIn(true);
            }
        },
        onError: (err) => {
            console.warn('[Privy] login error:', err?.message || err);
        },
    });
    const { wallets: privySolanaWallets, ready: privyWalletsReady } = usePrivySolanaWallets();
    const { signMessage: privySignMessageFn } = usePrivySignMessage();
    const { signTransaction: privySignTransactionFn } = usePrivySignTransaction();
    const { createWallet: privyCreateSolanaWallet } = usePrivyCreateSolanaWallet();
    // Solana-specific exportWallet — opens an iframe-isolated modal showing
    // the user's embedded wallet address + private-key reveal. usePrivy()
    // also exposes exportWallet but its docs explicitly say "Ethereum
    // address", so the Solana hook is the correct path here.
    const { exportWallet: privyExportSolanaWalletFn } = usePrivyExportSolanaWallet();
    // Solana-specific fundWallet — opens Privy's onramp iframe (Apple Pay,
    // Google Pay, debit/credit card via MoonPay/Coinbase). Requires
    // dashboard.privy.io → User management → Account funding → "Pay with
    // card" enabled. The cluster arg routes mainnet vs devnet per env.
    const { fundWallet: privyFundSolanaWalletFn } = usePrivyFundSolanaWallet();

    // Stable Connection — replaces useConnection from wallet-adapter.
    // Memoized so it's reused across all sign/send/burn callbacks.
    const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);

    // Manual wallet creation after authentication — replaces the broken
    // `createOnLogin: 'users-without-wallets'` auto-create flow that
    // crashed in EmbeddedWalletOnAccountCreateScreen with "Cannot
    // destructure property 'onSuccess' of 'a.createWallet'". This effect
    // fires once after Privy is ready + authenticated and the user
    // doesn't have a Solana wallet yet, then calls createWallet directly
    // (no modal screen, no broken destructure).
    const [createWalletInFlight, setCreateWalletInFlight] = useState(false);
    useEffect(() => {
        if (!privyReady || !privyAuthed || !privyWalletsReady) return;
        if (privySolanaWallets && privySolanaWallets.length > 0) return;
        if (createWalletInFlight) return;
        setCreateWalletInFlight(true);
        privyCreateSolanaWallet()
            .then((result) => {
                console.log('[Privy] Embedded Solana wallet created:', result?.wallet?.address || '(no address returned)');
            })
            .catch((err) => {
                const msg = err?.message || String(err);
                if (msg.includes('already has an embedded wallet')) {
                    // Wallet was created in a previous session — useWallets()
                    // will pick it up on its next render. Not an error.
                    return;
                }
                console.error('[Privy] Failed to create embedded Solana wallet:', msg);
            })
            .finally(() => {
                setCreateWalletInFlight(false);
            });
    }, [privyReady, privyAuthed, privyWalletsReady, privySolanaWallets, privyCreateSolanaWallet, createWalletInFlight]);

    // Pick the active wallet — find the Privy embedded wallet by name.
    // Per Privy docs canonical pattern, `wallets[0]` would pick the wrong
    // entry if the user ever links an external wallet (Phantom etc.) via
    // Privy. `standardWallet.name === 'Privy'` is the explicit signal.
    //
    // The `ready` flag from useWallets is critical: a wallet can appear
    // in the array before its signing channel is established, and trying
    // to signMessage on a not-ready wallet throws "Failed to connect to
    // wallet". Waiting for `privyWalletsReady` avoids that race.
    const privyWallet = useMemo(() => {
        if (!privyAuthed) return null;
        if (!privyWalletsReady) return null;
        if (!privySolanaWallets || privySolanaWallets.length === 0) return null;
        const embedded = privySolanaWallets.find(
            (w) => w?.standardWallet?.name === 'Privy'
        );
        return embedded || privySolanaWallets[0]; // fall back if shape unexpected
    }, [privyAuthed, privyWalletsReady, privySolanaWallets]);

    const publicKey = useMemo(() => {
        if (!privyWallet) return null;
        try { return new PublicKey(privyWallet.address); } catch { return null; }
    }, [privyWallet]);

    const connected = !!privyWallet;

    const [balance, setBalance] = useState(0);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [shotBalance, setShotBalance] = useState(0);
    const [prestigeInfo, setPrestigeInfo] = useState({ tier: 0, tierName: 'Unranked' });
    // Wallet-anchored callsign — server emits after auth via 'walletHandle'
    // event. `handle` is null until server replies. `locked` is true once
    // a handle is persisted for this wallet (one-time-set semantic). When
    // locked, the client UI should hide any "change name" input — this
    // wallet's display name is fixed.
    //
    // walletHandle.telegramUserId — server-resolved TG id linked to this
    // wallet (via linkTelegramIdentity). Replaces the now-broken
    // window.Telegram.WebApp.initDataUnsafe.user.id path (we removed
    // telegram-web-app.js because it crashed Privy's modal). Used by
    // GroupMatchScreen + other TG-keyed flows to identify the user.
    const [walletHandle, setWalletHandleState] = useState({ handle: null, locked: false, telegramUserId: null });

    const walletAddress = useMemo(() => {
        return publicKey ? publicKey.toBase58() : null;
    }, [publicKey]);

    // ─── Phase 2B: TG-wallet binding via magic link ────────────────────────
    //
    // When a Telegram user runs /play in the bot, the launch button URL
    // includes `?linkToken=<base64url-32-bytes>`. After Privy provisions
    // their embedded Solana wallet, we POST the token + wallet address
    // back to the server, which calls linkTelegramIdentity to write the
    // binding onto the User doc. Without this, Privy users cannot join
    // wagered groupchat matches (handleJoinCallback gates on
    // User.walletAddress).
    //
    // The token is single-use and 10-min TTL, so we only run this once
    // per page load. We strip the token from the URL on success/failure
    // so a refresh doesn't try to reuse it.

    // Auto-open Privy login when a linkToken is present and the user
    // isn't authenticated yet. This is the fresh-TG-user fast path: bot
    // /play button → opens solshot.gg?linkToken=... → Privy modal pops
    // immediately. User picks email or Telegram, signs in, wallet
    // provisions, linkToken effect (below) binds it to their TG id.
    // Without this auto-pop, fresh users land on the menu with a
    // SIGN IN button they may not notice.
    const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
    useEffect(() => {
        if (autoLoginAttempted) return;
        if (!privyReady) return;
        if (privyAuthed) return;
        if (!privyLogin) return;
        const params = new URLSearchParams(window.location.search);
        const token = params.get('linkToken');
        if (!token) return;
        setAutoLoginAttempted(true);
        try {
            privyLogin();
        } catch (err) {
            console.warn('[link] auto-login failed:', err?.message || err);
        }
    }, [privyReady, privyAuthed, privyLogin, autoLoginAttempted]);

    const [linkTokenAttempted, setLinkTokenAttempted] = useState(false);
    useEffect(() => {
        if (linkTokenAttempted) return;
        if (!walletAddress) return;
        const params = new URLSearchParams(window.location.search);
        const token = params.get('linkToken');
        if (!token) return;
        setLinkTokenAttempted(true);
        const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001';

        // Attach the Privy access token (JWT) so the server can verify
        // we're actually the authenticated user claiming this wallet —
        // production hardening on top of the magic-link CSPRNG token.
        // If getAccessToken isn't available (Privy still warming up),
        // we send without — server's graceful mode allows it through
        // when PRIVY_APP_SECRET isn't set; rejects with 401 when it is.
        const headers = { 'Content-Type': 'application/json' };
        const tokenPromise = privyGetAccessToken
            ? privyGetAccessToken().catch(() => null)
            : Promise.resolve(null);

        tokenPromise.then((accessToken) => {
            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }
            return fetch(`${serverUrl}/api/wallet/link-from-tg-token`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ token, walletAddress }),
            });
        })
            .then(async (resp) => {
                const body = await resp.json().catch(() => ({}));
                if (resp.ok) {
                    console.log('[link] Wallet bound to TG user', body.telegramUserId);
                } else {
                    console.warn('[link] Token bind failed:', resp.status, body.error);
                }
            })
            .catch((err) => {
                console.warn('[link] Bind request errored:', err?.message || err);
            })
            .finally(() => {
                // Strip linkToken from URL so a refresh doesn't replay
                try {
                    params.delete('linkToken');
                    const qs = params.toString();
                    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
                    window.history.replaceState({}, '', newUrl);
                } catch (_) { /* ignore */ }
            });
    }, [walletAddress, linkTokenAttempted, privyGetAccessToken]);

    // Fetch SOL balance for the active wallet
    const refreshBalance = useCallback(async () => {
        if (!publicKey) {
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

    // Wallet-anchored callsign: server emits after auth (and again after
    // setWalletHandle). Authoritative — overrides any client-side
    // localStorage handle.
    useEffect(() => {
        const socket = window.socket;
        if (!socket) return;
        const handler = (data) => {
            if (!data || typeof data !== 'object') return;
            setWalletHandleState({
                handle: data.handle || null,
                locked: !!data.locked,
                telegramUserId: data.telegramUserId || null,
            });
            // Sync to localStorage so legacy callers (LobbyScreen.getPlayerName,
            // BarracksScreen, AAR, etc.) pick up the server-canonical value
            // even before they're refactored to read from context.
            if (data.handle) {
                try { localStorage.setItem('solshot_handle', data.handle); } catch (_) {}
            }
        };
        socket.on('walletHandle', handler);
        return () => { socket.off('walletHandle', handler); };
    }, []);

    // Auto-bind via Privy-linked Telegram. Bypasses the /play magic-link
    // round-trip when:
    //   1. User is signed in with a wallet (walletAddress set)
    //   2. Their Privy user object has telegram linked (privyUser.telegram)
    //      — true if they signed in with "Continue with Telegram", OR
    //      tapped "ADD TELEGRAM BACKUP" in the wallet menu
    //   3. Server says walletHandle.telegramUserId is null (not yet bound
    //      in our User doc)
    //
    // POSTs to /api/wallet/link-from-privy-telegram with Bearer JWT.
    // Server verifies the JWT (proves auth) and writes the link.
    // Then walletHandle event re-fires (because we re-emit on
    // setWalletHandle path? actually we'd need a server push) —
    // simpler: client refetches walletHandle by re-emitting authenticate
    // — but that's heavy. We'll just optimistically set state.
    const [autoBindAttempted, setAutoBindAttempted] = useState(false);
    useEffect(() => {
        if (autoBindAttempted) return;
        if (!walletAddress) return;
        if (!privyGetAccessToken) return;
        // Only bind when Privy says we have telegram linked AND server
        // says we don't have it yet. Avoids unnecessary POSTs.
        const privyTgId = privyUser?.telegram?.telegramUserId;
        if (!privyTgId) return;
        if (walletHandle?.telegramUserId) return; // already bound
        setAutoBindAttempted(true);
        const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001';
        privyGetAccessToken()
            .then((accessToken) => {
                if (!accessToken) return null;
                return fetch(`${serverUrl}/api/wallet/link-from-privy-telegram`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        telegramUserId: Number(privyTgId),
                        telegramUsername: privyUser?.telegram?.username || null,
                        walletAddress,
                    }),
                });
            })
            .then(async (resp) => {
                if (!resp) return;
                const body = await resp.json().catch(() => ({}));
                if (resp.ok) {
                    console.log('[link] Privy-direct TG bind succeeded for tg user', body.telegramUserId);
                    // Optimistic update — match the shape the server will
                    // emit in walletHandle. Triggers re-render so screens
                    // pick up the bound state immediately.
                    setWalletHandleState((prev) => ({
                        ...prev,
                        telegramUserId: Number(privyTgId),
                    }));
                } else {
                    console.warn('[link] Privy-direct bind failed:', resp.status, body.error);
                }
            })
            .catch((err) => {
                console.warn('[link] Privy-direct bind errored:', err?.message || err);
            });
    }, [walletAddress, privyUser, walletHandle, privyGetAccessToken, autoBindAttempted]);

    /**
     * One-time-set the callsign for this wallet. Server enforces "first
     * set wins" — subsequent calls re-emit the existing handle without
     * overwriting. Returns true on success, false on validation error.
     */
    const setWalletHandle = useCallback((handle) => {
        const socket = window.socket;
        if (!socket || !socket.connected) return false;
        const clean = String(handle || '').trim().slice(0, 16);
        if (!clean) return false;
        socket.emit('setWalletHandle', { handle: clean });
        return true;
    }, []);

    useEffect(() => {
        if (isAuthenticated && window.socket) {
            window.socket.emit('getShotInfo');
        }
    }, [isAuthenticated]);

    // ─── Privy signing methods ─────────────────────────────────────────

    const signMessageUnified = useCallback(async (encodedMessage) => {
        if (!privyWallet) throw new Error('Wallet not connected');
        // showWalletUIs: false suppresses Privy's confirmation modal for
        // this signature. Used for the auth signMessage which fires once
        // per page load — popping a "confirm" modal every page load is
        // friction. We keep the modal ON for real-money paths
        // (sendTransactionUnified — escrow deposits, SHOT burns).
        const result = await privySignMessageFn({
            message: encodedMessage,
            wallet: privyWallet,
            options: { uiOptions: { showWalletUIs: false } },
        });
        return result.signature; // Uint8Array
    }, [privyWallet, privySignMessageFn]);

    // Sign locally via Privy, broadcast through our own RPC connection.
    // Avoids Privy's unreliable hosted devnet RPC which kills
    // useSignAndSendTransaction with a misleading "Failed to connect to
    // wallet" error.
    const sendTransactionUnified = useCallback(async (tx, conn) => {
        if (!privyWallet) throw new Error('Wallet not connected');
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const signResult = await privySignTransactionFn({
            transaction: new Uint8Array(serialized),
            wallet: privyWallet,
            chain: PRIVY_SOLANA_CHAIN,
        });
        // signResult.signedTransaction is a Uint8Array of the fully signed TX.
        const signature = await conn.sendRawTransaction(signResult.signedTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
        return signature;
    }, [privyWallet, privySignTransactionFn]);

    // ─── App-specific actions (authenticate, escrow deposit, SHOT burn) ───

    const authenticate = useCallback(async () => {
        if (!walletAddress) {
            // No wallet yet — don't spam the console; auto-auth retries periodically.
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
            // "Failed to connect to wallet" fires while Privy's signer channel
            // is still warming up — happens on page-refresh-with-restored-session.
            // Silent here; auto-auth retry covers it on subsequent ticks.
            const msg = err?.message || String(err);
            if (!msg.includes('Failed to connect')) {
                console.error('[SolShot] Auth error:', msg);
            }
            setIsAuthenticated(false);
            return null;
        }
    }, [walletAddress, signMessageUnified]);

    const signAndSendEscrowDeposit = useCallback(async (serializedTxBase64, roomId) => {
        if (!publicKey) {
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

    /**
     * Sign and send a wagered group-chat match deposit.
     * Mirrors signAndSendEscrowDeposit but for v2 escrow + group matches.
     * On success, emits `confirmGroupDeposit` so the server can verify the
     * deposit on-chain and (if all paid) auto-activate the match.
     */
    const signAndSendGroupDeposit = useCallback(async (serializedTxBase64, matchId) => {
        if (!publicKey) {
            console.warn('[SolShot] Cannot sign group deposit: wallet not ready');
            return null;
        }
        try {
            const txBuffer = Buffer.from(serializedTxBase64, 'base64');
            const tx = Transaction.from(txBuffer);

            const validation = validateEscrowTransaction(tx);
            if (!validation.valid) {
                console.error('[SolShot] Group deposit TX validation FAILED:', validation.reason);
                const socket = window.socket;
                if (socket) {
                    socket.emit('suspiciousTx', { reason: validation.reason, matchId });
                }
                return null;
            }

            const signature = await sendTransactionUnified(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            const socket = window.socket;
            if (socket) {
                socket.emit('confirmGroupDeposit', { matchId, txSignature: signature });
            }
            refreshBalance();
            return signature;
        } catch (err) {
            console.error('[SolShot] Group deposit error:', err.message);
            return null;
        }
    }, [publicKey, connection, sendTransactionUnified, refreshBalance]);

    const signAndBurnShot = useCallback(async (burnAmount) => {
        if (!publicKey || !SHOT_TOKEN_MINT) {
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

    // Auto-authenticate when wallet connects and socket is ready.
    //
    // We deliberately do NOT include `authenticate` in the deps array even
    // though we call it. Privy hooks regenerate signMessage/etc on each
    // render, which would cascade through `signMessageUnified` →
    // `authenticate` → this effect, causing repeated sign prompts on
    // user rejection. Use a ref so the effect only fires when actual
    // auth-state inputs change.
    //
    // Once a sign attempt has been made (success OR rejection), we set
    // `authAttemptedRef.current = true` and the effect won't retry until
    // wallet/connect state actually changes. This prevents a rejected
    // popup from immediately re-prompting.
    const authenticateRef = useRef(authenticate);
    useEffect(() => { authenticateRef.current = authenticate; }, [authenticate]);
    const authAttemptedRef = useRef(false);
    useEffect(() => {
        // Reset attempt flag when wallet/connection state changes — a new
        // wallet connecting deserves a fresh auth attempt.
        authAttemptedRef.current = false;
    }, [connected, publicKey]);

    // Reset auth state on socket disconnect + auto-trigger re-auth on
    // reconnect. Without this, iOS Safari's tab-backgrounding socket
    // recycles produced a session-killing race:
    //   1. iOS backgrounds the tab, socket.io disconnects
    //   2. iOS resumes the tab, socket.io auto-reconnects with NEW socket id
    //   3. Server has no auth state for the new socket id
    //   4. Client's isAuthenticated is still true from the previous session
    //   5. Auto-auth effect skips because isAuthenticated===true
    //   6. fireGroupShot calls hit the no_identity rejection at the server
    // Symptom seen in JJ's iPad session: shots silently fail, projectiles
    // never appear, HP never updates — server logs show
    // `[client tg=anon w=?] [GC shotResult] {"ok":false,"error":"no_identity"}`.
    //
    // Resetting isAuthenticated + the attempt-ref on disconnect lets the
    // auto-auth effect re-fire when reconnect happens.
    useEffect(() => {
        const checkSocket = () => {
            const socket = window.socket;
            if (!socket) return false;
            const onDisconnect = (reason) => {
                console.warn('[SolShot] socket disconnect — resetting auth', reason);
                setIsAuthenticated(false);
                authAttemptedRef.current = false;
            };
            const onConnect = () => {
                // socket.io may emit 'connect' on initial mount AND on
                // every successful reconnect. Resetting authAttempted here
                // (in addition to disconnect) catches the rare edge case
                // where 'disconnect' didn't fire but a fresh socket id is
                // present (e.g. transport upgrade, server restart).
                authAttemptedRef.current = false;
            };
            socket.on('disconnect', onDisconnect);
            socket.on('connect', onConnect);
            return () => {
                socket.off('disconnect', onDisconnect);
                socket.off('connect', onConnect);
            };
        };
        const cleanup = checkSocket();
        if (cleanup) return cleanup;
        const timer = setInterval(() => {
            const c = checkSocket();
            if (c) { clearInterval(timer); }
        }, 500);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        if (!connected || !publicKey || isAuthenticated) return;
        if (authAttemptedRef.current) return;
        const tryAuth = () => {
            if (window.socket && window.socket.connected) {
                authAttemptedRef.current = true;
                authenticateRef.current();
                return true;
            }
            return false;
        };
        if (tryAuth()) return;
        const timer = setInterval(() => {
            if (tryAuth()) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [connected, publicKey, isAuthenticated]);

    // Public login — opens Privy's modal (email + Telegram options).
    const login = useCallback(() => {
        if (privyLogin) {
            privyLogin();
        } else {
            console.warn('[SolShot] Privy login unavailable — provider not mounted');
        }
    }, [privyLogin]);

    const logout = useCallback(async () => {
        if (privyLogout && privyAuthed) {
            await privyLogout();
        }
    }, [privyLogout, privyAuthed]);

    // Open Privy's built-in account modal (shows full address + private-key
    // export). Only works for embedded-wallet users.
    //
    // We pass the explicit Solana wallet address because the default
    // selection picks the user's first embedded wallet, which would be
    // wrong if they ever link an EVM wallet alongside Solana.
    const openPrivyAccount = useCallback(async () => {
        if (!privyAuthed || !privyExportSolanaWalletFn) return false;
        if (!privyWallet?.address) return false;
        try {
            await privyExportSolanaWalletFn({ address: privyWallet.address });
            return true;
        } catch (err) {
            console.warn('[Privy] exportWallet failed:', err?.message || err);
            return false;
        }
    }, [privyAuthed, privyExportSolanaWalletFn, privyWallet]);

    /**
     * Open Privy's funding modal — Apple Pay, Google Pay, or card. After
     * the user pays, SOL arrives in their embedded wallet typically
     * within seconds (card) to a few minutes (slower providers).
     *
     * @param {Object} [opts]
     * @param {string} [opts.amount] — Decimal SOL amount string (e.g. '0.05')
     * @param {string} [opts.cluster] — 'devnet' | 'mainnet-beta' (defaults to NETWORK)
     * @returns {Promise<boolean>} — true if modal opened, false otherwise
     */
    /**
     * Recovery status — what login methods does the user have linked?
     * If they only have one (e.g. just Telegram), losing access to that
     * account means losing the wallet. Two methods = recoverable.
     *
     * Returns { hasEmail, hasTelegram, hasWallet (external), needsRecovery }
     * where `needsRecovery` is true if user has only one auth method.
     */
    const recoveryStatus = useMemo(() => {
        const hasEmail = !!(privyUser?.email?.address || privyUser?.linkedAccounts?.some?.((a) => a.type === 'email'));
        const hasTelegram = !!(privyUser?.telegram?.telegramUserId || privyUser?.linkedAccounts?.some?.((a) => a.type === 'telegram'));
        const hasExternalWallet = !!(privyUser?.linkedAccounts?.some?.((a) => a.type === 'wallet' && a.walletClient !== 'privy'));
        const methodCount = (hasEmail ? 1 : 0) + (hasTelegram ? 1 : 0) + (hasExternalWallet ? 1 : 0);
        return {
            hasEmail,
            hasTelegram,
            hasExternalWallet,
            needsRecovery: privyAuthed && methodCount < 2,
        };
    }, [privyUser, privyAuthed]);

    /**
     * Open Privy's "link an email" modal. Lets a TG-logged-in user add
     * email as a recovery method (or vice versa). Idempotent — returns
     * false if the user already has an email linked.
     */
    const linkEmailRecovery = useCallback(async () => {
        if (!privyAuthed || !privyLinkEmail) return false;
        if (recoveryStatus.hasEmail) return false;
        try {
            await privyLinkEmail();
            return true;
        } catch (err) {
            console.warn('[Privy] linkEmail failed:', err?.message || err);
            return false;
        }
    }, [privyAuthed, privyLinkEmail, recoveryStatus]);

    const linkTelegramRecovery = useCallback(async () => {
        if (!privyAuthed || !privyLinkTelegram) return false;
        if (recoveryStatus.hasTelegram) return false;
        try {
            await privyLinkTelegram();
            return true;
        } catch (err) {
            console.warn('[Privy] linkTelegram failed:', err?.message || err);
            return false;
        }
    }, [privyAuthed, privyLinkTelegram, recoveryStatus]);

    const fundWallet = useCallback(async ({ amount, cluster } = {}) => {
        if (!privyAuthed || !privyFundSolanaWalletFn) return false;
        if (!privyWallet?.address) return false;
        try {
            const clusterName = cluster || (NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet');
            await privyFundSolanaWalletFn(privyWallet.address, {
                cluster: { name: clusterName },
                ...(amount ? { amount } : {}),
            });
            // After funding completes, refresh the displayed balance
            // (the user may have closed the modal mid-flow; balance will
            // catch up on next refresh either way).
            refreshBalance();
            return true;
        } catch (err) {
            console.warn('[Privy] fundWallet failed:', err?.message || err);
            return false;
        }
    }, [privyAuthed, privyFundSolanaWalletFn, privyWallet, refreshBalance]);

    const activeSource = privyWallet ? 'privy' : null;

    // Stable identity uid for the User-doc registration flow. Order of
    // preference (most stable → least):
    //   1. tg_<id>          — Privy user has Telegram linked. Same uid we
    //                          generate from Mini App initData on App.js
    //                          line 116, so a TG-Mini-App user and a
    //                          web-Privy-TG-OAuth user collapse to the
    //                          same User doc.
    //   2. privyUser.id     — Stable per Privy account (e.g. did:privy:cltz…),
    //                          persists across sessions / browsers / cache
    //                          clears. Email-only users hit this branch.
    //   3. null             — No identity yet; HandleModal / App.js must
    //                          fall back to a random UUID until Privy
    //                          authenticates. Pre-orphan-fix behaviour.
    //
    // The orphan-account bug (2026-05-10): HandleModal was minting a fresh
    // crypto.randomUUID() per session, which created a new User doc every
    // time a user came back from a different browser / cache clear. Fish
    // had four docs (one TG, three orphans). This stable uid kills that
    // creation-by-cache-miss pattern at the source.
    const stableUid = useMemo(() => {
        if (!privyAuthed || !privyUser) return null;
        const tgId = privyUser?.telegram?.telegramUserId
            || privyUser?.linkedAccounts?.find?.((a) => a.type === 'telegram')?.telegramUserId;
        if (tgId) return `tg_${tgId}`;
        if (privyUser?.id) return privyUser.id;
        return null;
    }, [privyAuthed, privyUser]);

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
        signAndSendGroupDeposit,
        signAndBurnShot,
        openPrivyAccount,
        fundWallet,
        // Recovery / linking — for the "secure your account" flow that
        // lets a TG-only user add email as a backup (or vice versa).
        recoveryStatus,
        linkEmailRecovery,
        linkTelegramRecovery,
        // Wallet-anchored callsign. `walletHandle.handle` is the
        // authoritative display name for this wallet (null until server
        // emits). `walletHandle.locked` is true once persisted —
        // client UI should hide "change name" controls when locked.
        // Call `setWalletHandle(name)` to one-time-set after wallet auth.
        walletHandle,
        setWalletHandle,
        // Set to true once after a fresh first-time sign-in. Screens read
        // this to show a "Welcome — add SOL?" prompt, then call
        // clearFreshSignIn() to dismiss.
        isFreshSignIn,
        clearFreshSignIn: () => setIsFreshSignIn(false),
        // Source = which wallet path is active (always 'privy' or null now)
        source: activeSource,
        privyReady,
        privyAuthed,
        // Stable identity uid (see definition above). Consumed by App.js
        // and HandleModal to avoid minting orphan User docs on every
        // browser session.
        stableUid,
        // Read by <DebugAuthOverlay> when ?debug=1
        debug: {
            source: activeSource,
            connected,
            hasPublicKey: !!publicKey,
            walletAddress,
            isAuthenticated,
            privyReady,
            privyAuthed,
            privyWalletsReady,
            privyHasWallet: !!privyWallet,
        },
    }), [
        balance, refreshBalance, walletAddress, connected, isAuthenticated, authenticate,
        login, logout, shotBalance, prestigeInfo, signAndSendEscrowDeposit, signAndSendGroupDeposit, signAndBurnShot,
        openPrivyAccount, fundWallet, isFreshSignIn,
        recoveryStatus, linkEmailRecovery, linkTelegramRecovery,
        walletHandle, setWalletHandle,
        activeSource, privyReady, privyAuthed, privyWalletsReady, publicKey, privyWallet,
        stableUid,
    ]);

    return (
        <SolShotWalletContext.Provider value={value}>
            {children}
        </SolShotWalletContext.Provider>
    );
}

// ─── Top-level provider ────────────────────────────────────────────────

// Privy v3.23.1 config.
//
// loginMethods:
//   - 'email' — primary path, magic-link email confirmation.
//   - 'telegram' — Telegram Login Widget. Requires:
//       (a) Telegram login enabled in dashboard.privy.io
//       (b) Bot token provided to Privy dashboard
//       (c) Bot domain set via @BotFather: /setdomain → solshot.gg
//
// embeddedWallets.solana.createOnLogin: 'users-without-wallets' —
//   auto-creates a Solana wallet during the Privy login modal flow if
//   the user doesn't have one. The previous setting was 'off' due to
//   an SDK crash ("Cannot destructure property 'onSuccess' of
//   'a.createWallet'" in EmbeddedWalletOnAccountCreateScreen) on an
//   older SDK version; retesting on @privy-io/react-auth@3.23.1.
//   Keeping the manual createWallet useEffect below as a belt-and-
//   suspenders fallback during this test cycle — if auto-create works
//   reliably, the manual path will become a no-op (the if-already-
//   exists check at line ~206 short-circuits) and we can remove it in
//   a follow-up commit.
//
// plugins: [defaultSolanaRpcsPlugin()] — registers Privy's hosted Solana
//   RPC for chain identification. Without it, sign methods throw
//   "No RPC configuration found for chain solana:devnet". (We still
//   broadcast through our own Connection — see sendTransactionUnified.)
const PRIVY_CONFIG = {
    loginMethods: ['email', 'telegram'],
    embeddedWallets: {
        solana: { createOnLogin: 'users-without-wallets' },
    },
    appearance: {
        theme: 'dark',
        accentColor: '#FFB200',
        logo: '/og-preview.png',
        landingHeader: 'Sign in to SolShot',
    },
    plugins: [defaultSolanaRpcsPlugin()],
};

// Local-dev fallback context — Privy can't initialize without an app ID,
// and SolShotWalletInner's hooks would crash if called outside a
// PrivyProvider. So when REACT_APP_PRIVY_APP_ID is unset, we render a
// minimal no-op context so the rest of the app can still mount.
const LOCAL_DEV_FALLBACK_VALUE = {
    balance: 0,
    refreshBalance: () => {},
    walletAddress: null,
    connected: false,
    isAuthenticated: false,
    authenticate: () => null,
    login: () => console.warn('[SolShot] Login unavailable — REACT_APP_PRIVY_APP_ID not set'),
    logout: async () => {},
    shotBalance: 0,
    prestigeInfo: { tier: 0, tierName: 'Unranked' },
    signAndSendEscrowDeposit: async () => null,
    signAndSendGroupDeposit: async () => null,
    signAndBurnShot: async () => null,
    openPrivyAccount: async () => false,
    fundWallet: async () => false,
    isFreshSignIn: false,
    clearFreshSignIn: () => {},
    recoveryStatus: { hasEmail: false, hasTelegram: false, hasExternalWallet: false, needsRecovery: false },
    linkEmailRecovery: async () => false,
    linkTelegramRecovery: async () => false,
    walletHandle: { handle: null, locked: false, telegramUserId: null },
    setWalletHandle: () => false,
    source: null,
    privyReady: false,
    privyAuthed: false,
    debug: { source: null, connected: false, isAuthenticated: false },
};

export function SolShotWalletProvider({ children }) {
    if (!PRIVY_APP_ID) {
        console.warn('[SolShot] REACT_APP_PRIVY_APP_ID not set — wallet disabled (local dev mode)');
        return (
            <SolShotWalletContext.Provider value={LOCAL_DEV_FALLBACK_VALUE}>
                {children}
            </SolShotWalletContext.Provider>
        );
    }
    return (
        <PrivyProvider appId={PRIVY_APP_ID} config={PRIVY_CONFIG}>
            <SolShotWalletInner>{children}</SolShotWalletInner>
        </PrivyProvider>
    );
}

export { NETWORK, RPC_URL };
