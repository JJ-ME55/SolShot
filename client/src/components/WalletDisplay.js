import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolShotWallet } from '../wallet/WalletContext';
import useIsMobile from '../hooks/useIsMobile';

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
  const isMobile = useIsMobile();

  // Mobile: static dummy button — no wallet adapter, no click handler (re-enable for mainnet)
  if (isMobile) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{
          padding: '8px 16px',
          borderRadius: 4,
          background: 'rgba(42, 51, 31, 0.4)',
          border: '1px solid var(--ol)',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13,
          letterSpacing: 2,
          color: 'var(--kh)',
          opacity: 0.4,
          cursor: 'default',
        }}>
          CONNECT
        </div>
        <span style={{
          position: 'absolute',
          top: -6,
          right: -6,
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 7,
          letterSpacing: 1,
          color: 'var(--bn)',
          background: 'var(--sd)',
          border: '1px solid var(--st)',
          borderRadius: 3,
          padding: '1px 4px',
          textTransform: 'uppercase',
        }}>
          SOON
        </span>
      </div>
    );
  }

  if (!connected) {
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
          {balance.toFixed(2)} SOL
        </span>
      </div>

      {/* SHOT Balance — hidden in practice mode */}

      <WalletMultiButton />
    </div>
  );
}

export default WalletDisplay;
