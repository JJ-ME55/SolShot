import React from 'react';
import WalletDisplay from './WalletDisplay';


const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: 60,
    padding: '0 18px',
    borderBottom: '1px solid var(--od)',
    background: 'rgba(10, 12, 8, 0.7)',
    flexShrink: 0,
  },
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  left: {
    flexShrink: 0,
    minWidth: 80,
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  right: {
    flexShrink: 0,
    minWidth: 80,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    color: 'var(--kh)',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 3,
    transition: 'color 0.15s',
  },
  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 22,
    color: 'var(--bn)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  handleText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 2,
  },
};

function TopBar({ title, onBack, showWallet = true }) {
  const handle = localStorage.getItem('solshot_handle');
  return (
    <div style={styles.bar}>
      <div style={styles.wrapper}>
        {/* Left: Back button */}
        <div style={styles.left}>
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
        <div style={styles.center}>
          {title && <div style={styles.title}>{title}</div>}
        </div>

        {/* Right: Handle or Wallet */}
        <div style={styles.right}>
          {handle ? (
            <span style={styles.handleText}>{handle}</span>
          ) : (
            showWallet && <WalletDisplay compact />
          )}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
