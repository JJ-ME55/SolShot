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
  badgeRing: () => ({
    width: 140,
    height: 140,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  badgeTier: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 40,
    color: color,
    lineHeight: 1,
  }),
  rankName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--bn)',
    letterSpacing: 3,
    textAlign: 'center',
  },
  rankSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.7,
    textAlign: 'center',
  },
  shotBalance: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--sp)',
    letterSpacing: 1,
    padding: '5px 12px',
    border: '1px solid rgba(153, 69, 255, 0.2)',
    borderRadius: 3,
    background: 'rgba(153, 69, 255, 0.04)',
    marginTop: 8,
  },
  comingSoon: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    color: 'var(--am)',
    letterSpacing: 3,
    textAlign: 'center',
    padding: '6px 14px',
    border: '1px solid var(--am)',
    borderRadius: 4,
    background: 'rgba(255, 182, 39, 0.04)',
    marginTop: 8,
  },
  nextTierInfo: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 4,
  },
  burnResult: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 12,
    letterSpacing: 2,
    textAlign: 'center',
    padding: '6px 14px',
    border: '1px solid',
    borderRadius: 4,
    marginTop: 8,
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
    fontSize: 16,
    color: 'var(--am)',
    letterSpacing: 2,
    padding: '12px 14px',
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
    gap: 12,
    padding: '8px 10px',
    borderRadius: 4,
    border: isCurrent ? `1px solid ${color}` : '1px solid transparent',
    background: isCurrent ? `rgba(${hexToRgb(color)}, 0.06)` : 'transparent',
  }),
  tierBadge: () => ({
    width: 52,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  tierInfo: {
    flex: 1,
    minWidth: 0,
  },
  tierName: (color) => ({
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: color,
    letterSpacing: 1,
  }),
  tierCost: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
  },
  tierReward: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.5,
    flexShrink: 0,
    textAlign: 'right',
    maxWidth: 160,
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

const BADGE_IMAGES = {
  1: '/assets/images/badges/badge-bronze.png',
  2: '/assets/images/badges/badge-silver.png',
  3: '/assets/images/badges/badge-gold.png',
  4: '/assets/images/badges/badge-platinum.png',
  5: '/assets/images/badges/badge-diamond.png',
};


function PrestigeScreen({ navigate }) {
  const [currentTier, setCurrentTier] = useState(0);
  const [shotBalance, setShotBalance] = useState(0);
  const [burning, setBurning] = useState(false);
  const [burnResult, setBurnResult] = useState(null); // { success, message, tierName, color }

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

  // Listen for prestige result from server
  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    const handleResult = (data) => {
      setBurning(false);
      if (data.success) {
        setCurrentTier(data.tier);
        setShotBalance(data.balance);
        setBurnResult({
          success: true,
          message: `PROMOTED TO ${data.tierName.toUpperCase()}!`,
          tierName: data.tierName,
          color: data.color,
        });
        // Update wallet context too
        if (window.solWallet) {
          window.solWallet.prestigeInfo = { tier: data.tier, tierName: data.tierName };
          window.solWallet.shotBalance = data.balance;
        }
      } else {
        setBurnResult({
          success: false,
          message: data.reason || 'Burn failed',
        });
      }
      // Auto-clear result after 4 seconds
      setTimeout(() => setBurnResult(null), 4000);
    };

    socket.on('prestigeResult', handleResult);
    return () => { socket.off('prestigeResult', handleResult); };
  }, []);

  const currentPrestige = PRESTIGE_TIERS[currentTier] || PRESTIGE_TIERS[0];
  const nextTier = PRESTIGE_TIERS[currentTier + 1] || null;
  const canBurn = nextTier && shotBalance >= nextTier.cost && !burning;
  const isMaxTier = !nextTier;

  const handleBurn = async () => {
    if (!canBurn || !nextTier) return;

    const wallet = window.solWallet;
    if (!wallet || !wallet.signAndBurnShot) {
      setBurnResult({ success: false, message: 'Wallet not connected' });
      setTimeout(() => setBurnResult(null), 3000);
      return;
    }

    setBurning(true);
    setBurnResult(null);

    try {
      // Step 1: Burn SHOT tokens on-chain (player signs)
      const txSignature = await wallet.signAndBurnShot(nextTier.cost);

      if (!txSignature) {
        setBurning(false);
        setBurnResult({ success: false, message: 'Burn transaction cancelled' });
        setTimeout(() => setBurnResult(null), 3000);
        return;
      }

      // Step 2: Send tx signature to server for verification + tier unlock
      const socket = window.socket;
      if (socket) {
        socket.emit('prestigeBurn', { txSignature, burnAmount: nextTier.cost });
      }
      // Server will respond via 'prestigeResult' event (handled in useEffect above)
    } catch (err) {
      setBurning(false);
      setBurnResult({ success: false, message: err.message || 'Burn failed' });
      setTimeout(() => setBurnResult(null), 3000);
    }
  };

  // Button label logic
  let burnLabel = 'BURN SHOT TO RANK UP';
  if (burning) burnLabel = 'BURNING...';
  else if (isMaxTier) burnLabel = 'MAX PRESTIGE';
  else if (nextTier) burnLabel = `BURN ${nextTier.cost.toLocaleString()} SHOT`;

  return (
    <>
      <TopBar title="PRESTIGE" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Left: Current Rank */}
        <div style={s.leftPanel}>
          <div style={s.badgeRing()}>
            {BADGE_IMAGES[currentPrestige.tier] ? (
              <img src={BADGE_IMAGES[currentPrestige.tier]} alt={currentPrestige.name} style={{ width: 140, height: 140, objectFit: 'contain' }} />
            ) : (
              <span style={s.badgeTier(currentPrestige.color)}>P{currentPrestige.tier}</span>
            )}
          </div>
          <div style={s.rankName}>{currentPrestige.name.toUpperCase()}</div>
          <div style={s.rankSub}>CURRENT RANK</div>

          <div style={s.shotBalance}>
            {'* ' + shotBalance.toFixed(0) + ' SHOT'}
          </div>

          {nextTier && (
            <div style={s.nextTierInfo}>
              NEXT: {nextTier.name.toUpperCase()} ({nextTier.cost.toLocaleString()} SHOT)
            </div>
          )}

          <Button
            variant="gold"
            disabled={!canBurn}
            onClick={handleBurn}
            style={{ fontSize: 9, padding: '6px 14px', marginTop: 6, opacity: burning ? 0.6 : 1 }}
          >
            {burnLabel}
          </Button>

          {burnResult && (
            <div style={{
              ...s.burnResult,
              color: burnResult.success ? (burnResult.color || 'var(--sp)') : '#ff4444',
              borderColor: burnResult.success ? (burnResult.color || 'var(--sp)') : '#ff4444',
            }}>
              {burnResult.message}
            </div>
          )}

          {isMaxTier && (
            <div style={s.comingSoon}>DIAMOND ACHIEVED</div>
          )}
        </div>

        {/* Right: Tier List */}
        <div style={s.rightPanel}>
          <div style={s.tierHeader}>PRESTIGE TIERS</div>
          <div style={s.tierList}>
            {PRESTIGE_TIERS.map((tier) => {
              const isCompleted = tier.tier > 0 && tier.tier <= currentTier;
              const isNext = tier.tier === currentTier + 1;
              return (
                <div key={tier.tier} style={s.tierRow(tier.color, tier.tier === currentTier)}>
                  <div style={s.tierBadge()}>
                    {BADGE_IMAGES[tier.tier] ? (
                      <img src={BADGE_IMAGES[tier.tier]} alt={tier.name} style={{ width: 52, height: 52, objectFit: 'contain', opacity: isCompleted ? 1 : 0.4 }} />
                    ) : (
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: tier.color }}>{tier.tier === 0 ? '--' : 'P' + tier.tier}</span>
                    )}
                  </div>
                  <div style={s.tierInfo}>
                    <div style={s.tierName(tier.color)}>
                      {tier.name.toUpperCase()}
                      {isCompleted && ' ✓'}
                      {isNext && ' ◄'}
                    </div>
                    <div style={s.tierCost}>
                      {tier.cost === 0 ? 'DEFAULT' : tier.cost.toLocaleString() + ' SHOT'}
                    </div>
                  </div>
                  <div style={s.tierReward}>{tier.reward}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export default PrestigeScreen;
