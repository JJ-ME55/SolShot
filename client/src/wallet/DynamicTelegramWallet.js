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
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
