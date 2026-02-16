import React, { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import { PRESTIGE_TIERS } from '../data/tiers';

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },

  /* Left: Current rank */
  leftPanel: {
    width: '35%',
    minWidth: 180,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    gap: 10,
    borderRight: '1px solid var(--ol)',
  },
  badgeRing: (color) => ({
    width: 80,
    height: 80,
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 16px ${color}33`,
  }),
  badgeTier: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    color: color,
    lineHeight: 1,
  }),
  rankName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 3,
    textAlign: 'center',
  },
  rankSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.7,
    textAlign: 'center',
  },
  shotBalance: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: 'var(--sp)',
    letterSpacing: 1,
    padding: '4px 10px',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: 3,
    background: 'rgba(153, 69, 255, 0.04)',
    marginTop: 6,
  },
  comingSoon: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 9,
    color: 'var(--am)',
    letterSpacing: 3,
    textAlign: 'center',
    padding: '5px 12px',
    border: '1px solid var(--am)',
    borderRadius: 4,
    background: 'rgba(255, 182, 39, 0.04)',
    marginTop: 6,
  },

  /* Right: Tier list */
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  tierHeader: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 10,
    color: 'var(--am)',
    letterSpacing: 2,
    padding: '10px 14px',
    borderBottom: '1px solid var(--ol)',
  },
  tierList: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  tierRow: (color, isCurrent) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    borderRadius: 4,
    border: isCurrent ? `1px solid ${color}` : '1px solid transparent',
    background: isCurrent ? `rgba(${hexToRgb(color)}, 0.06)` : 'transparent',
  }),
  tierBadge: (color) => ({
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: `2px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontFamily: "'Bebas Neue', sans-serif",
    color: color,
    flexShrink: 0,
  }),
  tierInfo: {
    flex: 1,
    minWidth: 0,
  },
  tierName: (color) => ({
    fontFamily: "'Black Ops One', cursive",
    fontSize: 9,
    color: color,
    letterSpacing: 1,
  }),
  tierCost: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
  },
  tierReward: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.5,
    flexShrink: 0,
    textAlign: 'right',
    maxWidth: 120,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}


function PrestigeScreen({ navigate }) {
  const [currentTier, setCurrentTier] = useState(0);
  const [shotBalance, setShotBalance] = useState(0);

  // Read prestige info from wallet
  useEffect(() => {
    const wallet = window.solWallet;
    if (wallet && wallet.prestigeInfo) {
      setCurrentTier(wallet.prestigeInfo.tier || 0);
    }
    if (wallet && wallet.shotBalance !== undefined) {
      setShotBalance(wallet.shotBalance);
    }
  }, []);

  const currentPrestige = PRESTIGE_TIERS[currentTier] || PRESTIGE_TIERS[0];

  return (
    <>
      <TopBar title="PRESTIGE" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Left: Current Rank */}
        <div style={s.leftPanel}>
          <div style={s.badgeRing(currentPrestige.color)}>
            <span style={s.badgeTier(currentPrestige.color)}>
              P{currentPrestige.tier}
            </span>
          </div>
          <div style={s.rankName}>{currentPrestige.name.toUpperCase()}</div>
          <div style={s.rankSub}>CURRENT RANK</div>

          <div style={s.shotBalance}>
            {'* ' + shotBalance.toFixed(0) + ' SHOT'}
          </div>

          <Button
            variant="gold"
            disabled
            style={{ fontSize: 9, padding: '6px 14px', marginTop: 6 }}
          >
            BURN SHOT TO RANK UP
          </Button>
          <div style={s.comingSoon}>COMING SOON</div>
        </div>

        {/* Right: Tier List */}
        <div style={s.rightPanel}>
          <div style={s.tierHeader}>PRESTIGE TIERS</div>
          <div style={s.tierList}>
            {PRESTIGE_TIERS.map((tier) => (
              <div key={tier.tier} style={s.tierRow(tier.color, tier.tier === currentTier)}>
                <div style={s.tierBadge(tier.color)}>
                  {tier.tier === 0 ? '--' : 'P' + tier.tier}
                </div>
                <div style={s.tierInfo}>
                  <div style={s.tierName(tier.color)}>{tier.name.toUpperCase()}</div>
                  <div style={s.tierCost}>
                    {tier.cost === 0 ? 'DEFAULT' : tier.cost.toLocaleString() + ' SHOT'}
                  </div>
                </div>
                <div style={s.tierReward}>{tier.reward}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default PrestigeScreen;
