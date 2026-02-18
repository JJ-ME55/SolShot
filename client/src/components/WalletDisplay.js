import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    background: 'rgba(26, 32, 16, 0.6)',
    border: '1px solid var(--od)',
    borderRadius: 3,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 1,
  },
  solValue: {
    color: 'var(--sg)',
  },
  shotValue: {
    color: 'var(--am)',
  },
  icon: {
    fontSize: 12,
  },
};

function WalletDisplay({ compact = false }) {
  const [walletState, setWalletState] = useState({
    balance: 0,
    shotBalance: 0,
    connected: false,
  });

  // Poll window.solWallet for updates
  useEffect(() => {
    const poll = setInterval(() => {
      if (window.solWallet) {
        setWalletState({
          balance: window.solWallet.balance || 0,
          shotBalance: window.solWallet.shotBalance || 0,
          connected: window.solWallet.connected || false,
        });
      }
    }, 1000);
    return () => clearInterval(poll);
  }, []);

  if (!walletState.connected) {
    return (
      <div style={styles.container}>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* SOL Balance */}
      <div style={styles.chip}>
        <span style={{ ...styles.icon, color: 'var(--sg)' }}>{'\u25C6'}</span>
        <span style={styles.solValue}>
          {walletState.balance.toFixed(2)} SOL
        </span>
      </div>

      {/* SHOT Balance */}
      {!compact && (
        <div style={styles.chip}>
          <span style={{ ...styles.icon, color: 'var(--am)' }}>{'\u2B21'}</span>
          <span style={styles.shotValue}>
            {walletState.shotBalance.toLocaleString()} SHOT
          </span>
        </div>
      )}

      <WalletMultiButton />
    </div>
  );
}

export default WalletDisplay;
