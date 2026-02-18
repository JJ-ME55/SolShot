import React, { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import { PRESTIGE_TIERS } from '../data/tiers';

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 30px',
    gap: 14,
  },

  /* Profile header */
  profileSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  badgeRing: (color) => ({
    width: 90,
    height: 90,
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 12px ${color}33`,
  }),
  badgeText: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 32,
    color: color,
    lineHeight: 1,
  }),
  rankName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--bn)',
    letterSpacing: 3,
    textAlign: 'center',
  },
  walletAddress: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    padding: '3px 10px',
    border: '1px solid var(--ol)',
    borderRadius: 3,
  },

  /* Stats grid */
  statsSection: {
    width: '100%',
    maxWidth: 440,
    marginTop: 6,
  },
  statsLabel: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
  },
  statCard: {
    textAlign: 'center',
    padding: '8px 6px',
    background: 'rgba(42, 51, 31, 0.2)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    color: 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    marginTop: 3,
  },

  /* Joined date */
  joinedLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.4,
    marginTop: 6,
  },
};


function BarracksScreen({ navigate }) {
  const [walletAddr, setWalletAddr] = useState(null);
  const [prestige, setPrestige] = useState({ tier: 0, tierName: 'Unranked' });

  useEffect(() => {
    const wallet = window.solWallet;
    if (wallet && wallet.connected && wallet.publicKey) {
      setWalletAddr(wallet.publicKey.toString());
    }
    if (wallet && wallet.prestigeInfo) {
      setPrestige(wallet.prestigeInfo);
    }
  }, []);

  const currentTier = PRESTIGE_TIERS[prestige.tier] || PRESTIGE_TIERS[0];
  const displayAddr = walletAddr
    ? walletAddr.slice(0, 6) + '...' + walletAddr.slice(-6)
    : 'NOT CONNECTED';

  return (
    <>
      <TopBar title="BARRACKS" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Profile */}
        <div style={s.profileSection}>
          <div style={s.badgeRing(currentTier.color)}>
            <span style={s.badgeText(currentTier.color)}>
              P{currentTier.tier}
            </span>
          </div>
          <div style={s.rankName}>{currentTier.name.toUpperCase()}</div>
          <div style={s.walletAddress}>{'* ' + displayAddr}</div>
        </div>

        {/* Stats */}
        <div style={s.statsSection}>
          <div style={s.statsLabel}>COMBAT RECORD</div>
          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>MATCHES</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>WINS</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>LOSSES</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>WIN RATE</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>SOL EARNED</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statValue}>--</div>
              <div style={s.statLabel}>SHOT EARNED</div>
            </div>
          </div>
        </div>

        <div style={s.joinedLine}>STATS TRACKING -- COMING SOON</div>
      </div>
    </>
  );
}

export default BarracksScreen;
