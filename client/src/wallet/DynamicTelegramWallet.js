/**
 * Dynamic Embedded Wallet for Telegram Mini App
 *
 * Only active when running inside Telegram. Provides the same interface
 * as SolShotWalletInner but uses Dynamic's embedded wallet instead of
 * Phantom/Solflare.
 *
 * The game code doesn't know the difference — it uses useSolShotWallet()
 * the same way regardless of which wallet provider is active.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DynamicContextProvider, useDynamicContext, useTelegramLogin } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import { isSolanaWallet } from '@dynamic-labs/solana';
import { GlobalWalletExtension } from '@dynamic-labs/global-wallet';
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const DYNAMIC_ENV_ID = process.env.REACT_APP_DYNAMIC_ENV_ID || '';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || 'https://api.devnet.solana.com';

const SHOT_TOKEN_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT
  ? new PublicKey(process.env.REACT_APP_SHOT_TOKEN_MINT)
  : null;

/**
 * Inner component that uses Dynamic hooks to provide wallet functionality.
 * Mirrors SolShotWalletInner's interface.
 */
export function DynamicWalletInner({ children, onWalletReady }) {
  const { primaryWallet, sdkHasLoaded, user, setShowAuthFlow } = useDynamicContext();
  const { telegramSignIn } = useTelegramLogin();
  const [balance, setBalance] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  // Silent TMA auth on first load.
  //
  // The bot mints a JWT (server/services/dynamicAuthToken.js) containing
  // the Telegram user identity + an HMAC hash, signed with the bot token.
  // It appends that JWT as `?telegramAuthToken=<jwt>` to the Mini App URL
  // when sending a `web_app:` button. useTelegramLogin().telegramSignIn()
  // reads the token from the URL, exchanges it server-side with Dynamic
  // for a session, and provisions a Solana embedded wallet — all without
  // a popup, phone-number step, or Safari "URL can't be shown" error.
  //
  // Fallback: if the Mini App was opened via a path that didn't carry the
  // token (group-chat t.me link, deep-link from another app, etc.) we
  // call setShowAuthFlow(true) so the user can still authenticate via the
  // dashboard-trimmed modal (currently just "Continue with Telegram").
  useEffect(() => {
    if (!sdkHasLoaded || autoLoginAttempted) return;
    if (user || primaryWallet) {
      // Already authenticated — Dynamic restored a session from local storage
      setAutoLoginAttempted(true);
      return;
    }
    setAutoLoginAttempted(true);
    const hasAuthToken = new URLSearchParams(window.location.search).has('telegramAuthToken');
    if (hasAuthToken) {
      console.log('[Dynamic] telegramAuthToken found — silent TMA sign-in');
      telegramSignIn({ forceCreateUser: true }).catch((err) => {
        console.error('[Dynamic] telegramSignIn failed:', err);
        setShowAuthFlow(true);
      });
    } else {
      console.log('[Dynamic] No auth token in URL — falling back to modal');
      setShowAuthFlow(true);
    }
  }, [sdkHasLoaded, autoLoginAttempted, user, primaryWallet, telegramSignIn, setShowAuthFlow]);

  const walletAddress = useMemo(() => {
    if (!primaryWallet) return null;
    return primaryWallet.address;
  }, [primaryWallet]);

  const publicKey = useMemo(() => {
    return walletAddress ? new PublicKey(walletAddress) : null;
  }, [walletAddress]);

  // Fetch SOL balance
  const refreshBalance = useCallback(async () => {
    if (!publicKey) { setBalance(0); return; }
    try {
      const connection = new Connection(RPC_URL);
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (err) {
      console.warn('[Dynamic] Balance fetch error:', err.message);
      setBalance(0);
    }
  }, [publicKey]);

  // Refresh balance when wallet connects
  useEffect(() => {
    if (primaryWallet && walletAddress) {
      refreshBalance();
      // Authenticate with game server
      authenticateWithServer();
    }
  }, [primaryWallet, walletAddress]);

  // Authenticate with game server using Dynamic wallet
  const authenticateWithServer = useCallback(async () => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet)) return null;

    try {
      const signer = await primaryWallet.getSigner();
      const timestamp = Date.now();
      const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signer.signMessage(encodedMessage);

      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

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
      console.error('[Dynamic] Auth error:', err.message);
      return null;
    }
  }, [primaryWallet, walletAddress]);

  // Listen for auth result
  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;
    const handler = (result) => {
      if (result.success) setIsAuthenticated(true);
      else setIsAuthenticated(false);
    };
    socket.on('authResult', handler);
    return () => socket.off('authResult', handler);
  }, []);

  // Sign and send escrow deposit
  const signAndSendEscrowDeposit = useCallback(async (serializedTxBase64, roomId) => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet)) return null;

    try {
      const signer = await primaryWallet.getSigner();
      const connection = await primaryWallet.getConnection();

      const txBuffer = Buffer.from(serializedTxBase64, 'base64');
      const tx = Transaction.from(txBuffer);

      const result = await signer.signAndSendTransaction(tx);

      await connection.confirmTransaction(result.signature, 'confirmed');

      const socket = window.socket;
      if (socket) {
        socket.emit('escrowDepositConfirm', { roomId, txSignature: result.signature });
      }

      refreshBalance();
      return result.signature;
    } catch (err) {
      console.error('[Dynamic] Escrow deposit error:', err.message);
      return null;
    }
  }, [primaryWallet, refreshBalance]);

  // Burn SHOT tokens
  const signAndBurnShot = useCallback(async (burnAmount) => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet) || !SHOT_TOKEN_MINT) return null;

    try {
      const signer = await primaryWallet.getSigner();
      const connection = await primaryWallet.getConnection();
      const owner = new PublicKey(primaryWallet.address);

      const ata = await getAssociatedTokenAddress(SHOT_TOKEN_MINT, owner);
      const rawAmount = burnAmount * 1_000_000_000;

      const burnIx = createBurnInstruction(ata, SHOT_TOKEN_MINT, owner, rawAmount, [], TOKEN_PROGRAM_ID);

      const tx = new Transaction().add(burnIx);
      tx.feePayer = owner;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const result = await signer.signAndSendTransaction(tx);
      await connection.confirmTransaction(result.signature, 'confirmed');

      return result.signature;
    } catch (err) {
      console.error('[Dynamic] SHOT burn error:', err.message);
      return null;
    }
  }, [primaryWallet]);

  // Expose same interface as SolShotWalletInner via callback
  useEffect(() => {
    if (onWalletReady) {
      onWalletReady({
        balance,
        refreshBalance,
        walletAddress,
        connected: !!primaryWallet,
        isAuthenticated,
        authenticate: authenticateWithServer,
        shotBalance: 0, // Managed by server via socket
        prestigeInfo: { tier: 0, tierName: 'Unranked' },
        signAndSendEscrowDeposit,
        signAndBurnShot,
      });
    }
  }, [balance, walletAddress, primaryWallet, isAuthenticated, onWalletReady, refreshBalance, authenticateWithServer, signAndSendEscrowDeposit, signAndBurnShot]);

  return <>{children}</>;
}

/**
 * Dynamic provider wrapper for Telegram.
 * Only renders when REACT_APP_DYNAMIC_ENV_ID is set.
 */

// Brand Dynamic's modal/signing UI in SolShot's CRT field-manual aesthetic.
// Dynamic renders inside a Shadow DOM and exposes ~80 CSS custom properties
// for theming; we map them onto SolShot's CRT theme tokens (see
// client/src/styles/tokens.css [data-theme="crt"]). Border-radius is
// flattened to 0 because SolShot uses clip-path angles, not rounded
// corners — keeping radius makes Dynamic's modal feel like a different app.
//
// String form is supported by the SDK's ShadowDOM component
// (StyleElement = <style nonce={cspNonce}>{cssOverrides}</style>).
const DYNAMIC_CSS_OVERRIDES = `
  :host {
    /* Surfaces — CRT theme values from tokens.css */
    --dynamic-base-1: #050a04;
    --dynamic-base-2: #081006;
    --dynamic-base-3: #0b1708;
    --dynamic-base-4: #1a3312;
    --dynamic-base-white: #b8d89a;

    /* Borders */
    --dynamic-border: #2a5a20;
    --dynamic-border-1: #1a3312;
    --dynamic-border-2: #2a5a20;
    --dynamic-border-color: #1a3312;
    --dynamic-border-radius: 0px;

    /* Brand / accent */
    --dynamic-brand: #e8a430;
    --dynamic-brand-dark: #ffb840;
    --dynamic-brand-primary-color: #e8a430;
    --dynamic-brand-secondary-color: #ffb840;

    /* Text */
    --dynamic-text-primary: #b8d89a;
    --dynamic-text-primary-color: #b8d89a;
    --dynamic-text-secondary: #6eaf52;
    --dynamic-text-secondary-color: #6eaf52;
    --dynamic-text-tertiary: #2a4a1c;
    --dynamic-text-link: #e8a430;
    --dynamic-text-white: #b8d89a;

    /* Buttons */
    --dynamic-button-primary-background: #e8a430;
    --dynamic-button-primary-border: 1px solid #e8a430;
    --dynamic-button-secondary-background: #0b1708;
    --dynamic-button-secondary-border: 1px solid #1a3312;
    --dynamic-button-shadow: none;

    /* Connect button (used in some flows) */
    --dynamic-connect-button-background: #0b1708;
    --dynamic-connect-button-background-hover: #141c0d;
    --dynamic-connect-button-border: 1px solid #1a3312;
    --dynamic-connect-button-border-hover: 1px solid #2a5a20;
    --dynamic-connect-button-color: #b8d89a;
    --dynamic-connect-button-color-hover: #b8d89a;
    --dynamic-connect-button-radius: 0px;
    --dynamic-connect-button-shadow: none;
    --dynamic-connect-button-shadow-hover: none;

    /* Modal */
    --dynamic-modal-backdrop-background: rgba(5, 10, 4, 0.85);
    --dynamic-modal-backdrop-filter: blur(2px);
    --dynamic-overlay: rgba(5, 10, 4, 0.85);

    /* Wallet list tiles (auth modal) */
    --dynamic-wallet-list-tile-background: #0b1708;
    --dynamic-wallet-list-tile-background-hover: #141c0d;
    --dynamic-wallet-list-tile-border: 1px solid #1a3312;
    --dynamic-wallet-list-tile-border-hover: 1px solid #2a5a20;
    --dynamic-wallet-list-tile-shadow: none;
    --dynamic-wallet-list-tile-shadow-hover: none;

    /* Search bar */
    --dynamic-search-bar-background: #0b1708;
    --dynamic-search-bar-background-focus: #141c0d;
    --dynamic-search-bar-background-hover: #141c0d;
    --dynamic-search-bar-border: 1px solid #1a3312;
    --dynamic-search-bar-border-focus: 1px solid #e8a430;
    --dynamic-search-bar-border-hover: 1px solid #2a5a20;

    /* Header / footer */
    --dynamic-header-background: #050a04;
    --dynamic-header-border-bottom: 1px solid #1a3312;
    --dynamic-footer-background: #050a04;
    --dynamic-footer-border-top: 1px solid #1a3312;

    /* Status colors — keep semantic meaning, shift to CRT-friendly hues */
    --dynamic-success-1: #6eaf52;
    --dynamic-success-2: #b8d89a;
    --dynamic-error-1: #a83a1a;
    --dynamic-error-2: #c84a2a;
    --dynamic-alert-1: #c8781a;
    --dynamic-red-2: #a83a1a;

    /* Badge */
    --dynamic-badge-background: #0b1708;
    --dynamic-badge-color: #6eaf52;
    --dynamic-badge-primary-background: #e8a430;
    --dynamic-badge-primary-color: #050a04;

    /* Typography — match SolShot's mono-first stack */
    --dynamic-font-family-primary: "Share Tech Mono", "Courier New", monospace;
    --dynamic-font-family-mono: "Share Tech Mono", "Courier New", monospace;
    --dynamic-font-family-numbers: "Share Tech Mono", "Courier New", monospace;

    /* Shadows — SolShot uses no drop shadows on its CRT theme */
    --dynamic-shadow-down-1: none;
    --dynamic-shadow-down-3: none;
    --dynamic-shadow-up-1: none;
  }
`;

export function DynamicTelegramProvider({ children }) {
  if (!DYNAMIC_ENV_ID) {
    console.warn('[Dynamic] REACT_APP_DYNAMIC_ENV_ID not set — embedded wallet disabled');
    return <>{children}</>;
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        walletConnectors: [SolanaWalletConnectors],
        walletConnectorExtensions: [GlobalWalletExtension],
        cssOverrides: DYNAMIC_CSS_OVERRIDES,
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
