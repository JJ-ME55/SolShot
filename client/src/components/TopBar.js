import React from 'react';


const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: 60,
    // Reserve corner space for the TG Mini App back/X liquid-glass
    // chrome — TopBar is used on every non-game screen so this fixes
    // every screen at once.
    padding: '0 var(--tg-chrome-side)',
    borderBottom: '1px solid var(--border)',
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
    color: 'var(--olive)',
    fontFamily: 'var(--f-mono)',
    fontSize: 14,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '6px 12px',
    clipPath: 'var(--clip-6)',
    transition: 'color 0.15s',
  },
  title: {
    fontFamily: 'var(--f-display)',
    fontSize: 22,
    color: 'var(--bone)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  handleText: {
    fontFamily: 'var(--f-mono)',
    fontSize: 14,
    color: 'var(--bone)',
    letterSpacing: '0.15em',
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

        {/* Right: Handle */}
        <div style={styles.right}>
          {handle && <span style={styles.handleText}>{handle}</span>}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
