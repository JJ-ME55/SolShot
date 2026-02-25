import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SHOT_MINT = process.env.REACT_APP_SHOT_TOKEN_MINT || '4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd';
const REFERRAL_ACCOUNT = process.env.REACT_APP_JUPITER_REFERRAL_ACCOUNT || '';
const REFERRAL_FEE = 50; // 0.5% in basis points

const defaultButtonStyle = {
  fontFamily: "'Black Ops One', cursive",
  fontSize: 10,
  letterSpacing: 2,
  color: '#9945FF',
  background: 'rgba(153, 69, 255, 0.06)',
  border: '1px solid rgba(153, 69, 255, 0.3)',
  borderRadius: 4,
  padding: '6px 14px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

// Module-level singleton tracking
let jupiterInitialized = false;
let jupiterReady = false; // eslint-disable-line no-unused-vars

function JupiterSwap({
  mode = 'modal',
  buttonLabel = 'BUY SHOT',
  buttonStyle = {},
  containerId = 'jup-integrated',
  onSuccess,
  onClose,
}) {
  const wallet = useWallet();
  const { connection } = useConnection(); // eslint-disable-line no-unused-vars
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Wait for window.Jupiter to be available (CDN defer load)
  useEffect(() => {
    if (window.Jupiter) {
      setReady(true);
      return;
    }
    pollRef.current = setInterval(() => {
      if (window.Jupiter) {
        setReady(true);
        clearInterval(pollRef.current);
      }
    }, 200);
    // Give up after 10 seconds
    const timeout = setTimeout(() => {
      if (!window.Jupiter) {
        setError('Jupiter Plugin failed to load');
        clearInterval(pollRef.current);
      }
    }, 10000);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, []);

  // Sync wallet state whenever wallet changes
  useEffect(() => {
    if (!ready || !window.Jupiter || !jupiterInitialized) return;
    try {
      window.Jupiter.syncProps({
        passthroughWalletContextState: {
          publicKey: wallet.publicKey,
          connected: wallet.connected,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions,
          sendTransaction: wallet.sendTransaction,
        },
      });
    } catch (e) {
      console.warn('[JupiterSwap] syncProps error:', e.message);
    }
  }, [ready, wallet.publicKey, wallet.connected, wallet.signTransaction, wallet.signAllTransactions, wallet.sendTransaction]);

  const openSwap = useCallback(() => {
    if (!window.Jupiter || !ready) return;

    const formProps = {
      initialInputMint: SOL_MINT,
      initialOutputMint: SHOT_MINT,
      fixedMint: SHOT_MINT,
      swapMode: 'ExactIn',
    };

    // Add referral if configured
    if (REFERRAL_ACCOUNT) {
      formProps.referralAccount = REFERRAL_ACCOUNT;
      formProps.referralFee = REFERRAL_FEE;
    }

    const config = {
      displayMode: mode === 'integrated' ? 'integrated' : 'modal',
      enableWalletPassthrough: true,
      formProps,
      branding: {
        logoUri: '/assets/images/branding/solshot-logo.png',
        name: 'SolShot',
      },
      onSuccess: ({ txid }) => {
        if (onSuccess) onSuccess(txid);
      },
      onSwapError: ({ error: swapError }) => {
        console.warn('[JupiterSwap] Swap error:', swapError);
      },
      onClose: () => {
        if (onClose) onClose();
      },
    };

    if (mode === 'integrated') {
      config.integratedTargetId = containerId;
    }

    try {
      if (!jupiterInitialized) {
        window.Jupiter.init(config);
        jupiterInitialized = true;
        jupiterReady = true;

        // Sync wallet state immediately after init
        window.Jupiter.syncProps({
          passthroughWalletContextState: {
            publicKey: wallet.publicKey,
            connected: wallet.connected,
            signTransaction: wallet.signTransaction,
            signAllTransactions: wallet.signAllTransactions,
            sendTransaction: wallet.sendTransaction,
          },
        });
      } else {
        // Re-open with updated config (singleton already initialized)
        // For modal mode, just call init again — Plugin handles re-opening
        window.Jupiter.init(config);
        window.Jupiter.syncProps({
          passthroughWalletContextState: {
            publicKey: wallet.publicKey,
            connected: wallet.connected,
            signTransaction: wallet.signTransaction,
            signAllTransactions: wallet.signAllTransactions,
            sendTransaction: wallet.sendTransaction,
          },
        });
      }
    } catch (e) {
      console.error('[JupiterSwap] Init error:', e);
      setError('Failed to open swap widget');
    }
  }, [ready, mode, containerId, onSuccess, onClose, wallet]);

  if (error) {
    return (
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', opacity: 0.5, textAlign: 'center', padding: '4px 8px' }}>
        {error}
      </div>
    );
  }

  if (mode === 'integrated') {
    return (
      <div>
        <div id={containerId} style={{ minHeight: 400, border: '1px solid var(--ol)', borderRadius: 4 }} />
        {ready && !jupiterInitialized && (
          <button onClick={openSwap} style={{ ...defaultButtonStyle, ...buttonStyle }}>
            {buttonLabel}
          </button>
        )}
      </div>
    );
  }

  // Modal mode — render a button
  return (
    <button
      onClick={openSwap}
      disabled={!ready}
      style={{ ...defaultButtonStyle, ...buttonStyle, opacity: ready ? 1 : 0.5 }}
    >
      {ready ? buttonLabel : 'LOADING...'}
    </button>
  );
}

export default JupiterSwap;
