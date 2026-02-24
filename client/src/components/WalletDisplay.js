import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolShotWallet } from '../wallet/WalletContext';

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
  // CS-04: Use context hook instead of polling window.solWallet
  const { balance, shotBalance, connected } = useSolShotWallet();

  if (!connected) {
    return (
      <div style={styles.container}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <WalletMultiButton />
          {!compact && (
            <a
              href="https://solana.com/learn/blockchain-basics"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10,
                color: 'var(--kh)',
                opacity: 0.6,
                letterSpacing: 1,
                textDecoration: 'none',
                display: 'block',
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              {'WHAT IS A WALLET?'}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* SOL Balance */}
      <div style={styles.chip}>
        <span style={{ ...styles.icon, color: 'var(--sg)' }}>{'\u25C6'}</span>
        <span style={styles.solValue}>
          {balance.toFixed(2)} SOL
        </span>
      </div>

      {/* SHOT Balance */}
      {!compact && (
        <div style={styles.chip}>
          <span style={{ ...styles.icon, color: 'var(--am)' }}>{'\u2B21'}</span>
          <span style={styles.shotValue}>
            {shotBalance.toLocaleString()} SHOT
          </span>
        </div>
      )}

      <WalletMultiButton />
    </div>
  );
}

export default WalletDisplay;
