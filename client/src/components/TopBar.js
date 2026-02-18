import React from 'react';
import WalletDisplay from './WalletDisplay';

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    padding: '0 14px',
    borderBottom: '1px solid var(--od)',
    background: 'rgba(10, 12, 8, 0.7)',
    flexShrink: 0,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'none',
    border: 'none',
    color: 'var(--kh)',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '5px 10px',
    borderRadius: 3,
    transition: 'color 0.15s',
  },
  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--bn)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
};

function TopBar({ title, onBack, showWallet = true }) {
  return (
    <div style={styles.bar}>
      <div style={styles.wrapper}>
        {/* Left: Back button */}
        <div>
          {onBack && (
            <button
              style={styles.backBtn}
              onClick={onBack}
              onMouseEnter={(e) => { e.target.style.color = 'var(--rg)'; }}
              onMouseLeave={(e) => { e.target.style.color = 'var(--kh)'; }}
            >
              {'\u25C0'} MENU
            </button>
          )}
        </div>

        {/* Center: Title */}
        {title && <div style={styles.title}>{title}</div>}

        {/* Right: Wallet */}
        <div>
          {showWallet && <WalletDisplay compact />}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
