import React, { useState, useEffect } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';
import { PRESTIGE_TIERS } from '../data/tiers';
import { useSolShotWallet } from '../wallet/WalletContext';

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
  const [burnResult, setBurnResult] = useState(null);
  const [selected, setSelected] = useState(null);

  const { prestigeInfo, shotBalance: contextShotBalance, signAndBurnShot } = useSolShotWallet();

  useEffect(() => {
    if (prestigeInfo) setCurrentTier(prestigeInfo.tier || 0);
    if (contextShotBalance !== undefined) setShotBalance(contextShotBalance);
  }, [prestigeInfo, contextShotBalance]);

  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;
    const handleResult = (data) => {
      setBurning(false);
      if (data.success) {
        setCurrentTier(data.tier);
        setShotBalance(data.balance);
        setBurnResult({ success: true, message: `PROMOTED TO ${data.tierName.toUpperCase()}!`, tierName: data.tierName, color: data.color });
      } else {
        setBurnResult({ success: false, message: data.reason || 'Burn failed' });
      }
      setTimeout(() => setBurnResult(null), 4000);
    };
    socket.on('prestigeResult', handleResult);
    return () => socket.off('prestigeResult', handleResult);
  }, []);

  const currentPrestige = PRESTIGE_TIERS[currentTier] || PRESTIGE_TIERS[0];
  const nextTier = PRESTIGE_TIERS[currentTier + 1] || null;
  const canBurn = nextTier && shotBalance >= nextTier.cost && !burning;
  const isMaxTier = !nextTier;

  const sel = selected ? PRESTIGE_TIERS.find(t => t.tier === selected) : null;

  const handleBurn = async () => {
    if (!canBurn || !nextTier) return;
    if (!signAndBurnShot) {
      setBurnResult({ success: false, message: 'Wallet not connected' });
      setTimeout(() => setBurnResult(null), 3000);
      return;
    }
    setBurning(true);
    setBurnResult(null);
    try {
      const txSignature = await signAndBurnShot(nextTier.cost);
      if (!txSignature) {
        setBurning(false);
        setBurnResult({ success: false, message: 'Burn transaction cancelled' });
        setTimeout(() => setBurnResult(null), 3000);
        return;
      }
      const socket = window.socket;
      if (socket) socket.emit('prestigeBurn', { txSignature, burnAmount: nextTier.cost });
    } catch (err) {
      setBurning(false);
      setBurnResult({ success: false, message: err.message || 'Burn failed' });
      setTimeout(() => setBurnResult(null), 3000);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px', position: 'relative', zIndex: 3 }}>
        <ScreenHeader
          title="PRESTIGE"
          subtitle="BURN $SHOT · EARN RANK · UNLOCK SIGNATURE WEAPONS"
          onBack={() => navigate('menu')}
          rightExtras={
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em' }}>
              ◆ {shotBalance.toLocaleString(undefined, { maximumFractionDigits: 1 })} SHOT
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28 }}>
          {/* LEFT: Current rank */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
            <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              {BADGE_IMAGES[currentPrestige.tier] ? (
                <img src={BADGE_IMAGES[currentPrestige.tier]} style={{ width: 200, height: 200, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))' }} alt={currentPrestige.name} />
              ) : (
                <div style={{
                  width: 200, height: 200, border: '3px dashed var(--muted)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 60, color: 'var(--muted)', letterSpacing: '0.1em' }}>P0</div>
                </div>
              )}
            </div>

            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.25em', marginBottom: 4 }}>CURRENT RANK</div>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 28, color: 'var(--bone)',
              letterSpacing: '0.15em', marginBottom: 14, textTransform: 'uppercase',
            }}>{currentPrestige.name}</div>

            {nextTier && (
              <>
                <div style={{
                  padding: '10px 18px',
                  background: `rgba(${hexToRgb(nextTier.color)}, 0.12)`,
                  border: `1px solid ${nextTier.color}`,
                  clipPath: 'var(--clip-6)',
                  fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
                  color: nextTier.color,
                }}>◆ {nextTier.cost.toLocaleString()} SHOT</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.22em', marginTop: 8 }}>
                  NEXT: {nextTier.name.toUpperCase()}
                </div>
              </>
            )}

            <button
              onClick={handleBurn}
              disabled={!canBurn}
              style={{
                marginTop: 20,
                padding: '12px 24px',
                background: canBurn ? 'var(--accent)' : 'transparent',
                color: canBurn ? '#0e1209' : 'var(--muted)',
                border: '1px ' + (canBurn ? 'solid var(--accent-hot)' : 'dashed var(--muted)'),
                clipPath: 'var(--clip-6)',
                fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.2em',
                cursor: canBurn ? 'pointer' : 'not-allowed',
                boxShadow: canBurn ? '0 0 18px rgba(218,138,40,0.22)' : 'none',
              }}>
              {burning ? 'BURNING…' : isMaxTier ? 'MAX PRESTIGE' : canBurn ? `BURN ${nextTier.cost.toLocaleString()} SHOT` : nextTier ? 'INSUFFICIENT SHOT' : 'LOCKED'}
            </button>

            {burnResult && (
              <div style={{
                marginTop: 14,
                fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
                textAlign: 'center',
                padding: '8px 16px',
                color: burnResult.success ? (burnResult.color || 'var(--accent)') : '#c86060',
                border: '1px solid ' + (burnResult.success ? (burnResult.color || 'var(--accent)') : '#c86060'),
                clipPath: 'var(--clip-6)',
              }}>{burnResult.message}</div>
            )}

            <div style={{
              marginTop: 28, maxWidth: 260,
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
              letterSpacing: '0.08em', lineHeight: 1.6, textAlign: 'center',
            }}>
              Prestige burns $SHOT for permanent rank, unlocks a signature weapon, and stamps your callsign across the leaderboards.
            </div>
          </div>

          {/* RIGHT: Tier ladder */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.22em', marginBottom: 14 }}>PRESTIGE TIERS</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESTIGE_TIERS.map(tier => {
                const isSel = selected === tier.tier;
                const isCur = tier.tier === currentTier;
                const isCompleted = tier.tier > 0 && tier.tier <= currentTier;
                return (
                  <div key={tier.tier} onClick={() => setSelected(tier.tier)} style={{
                    display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 16, alignItems: 'center',
                    padding: '12px 18px',
                    background: isSel ? 'var(--bg-raised)' : 'var(--bg-surface)',
                    border: '1px solid ' + (isSel || isCur ? tier.color : 'var(--border)'),
                    clipPath: 'var(--clip-6)',
                    cursor: 'pointer',
                    opacity: tier.tier === 0 ? 0.75 : 1,
                  }}>
                    <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {BADGE_IMAGES[tier.tier] ? (
                        <img src={BADGE_IMAGES[tier.tier]} alt={tier.name}
                          style={{ width: 48, height: 48, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', opacity: isCompleted || isCur ? 1 : 0.5 }} />
                      ) : (
                        <div style={{
                          width: 42, height: 42, border: '2px dashed var(--muted)', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--muted)', fontFamily: 'var(--f-mono)', fontSize: 14,
                        }}>—</div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: tier.color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{tier.name}</span>
                        {isCur && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.25em' }}>◂ CURRENT</span>}
                        {isCompleted && !isCur && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#7fd060', letterSpacing: '0.25em' }}>✓</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.2em', marginTop: 2 }}>
                        {tier.cost > 0 ? `${tier.cost.toLocaleString()} SHOT` : 'DEFAULT'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.22em' }}>UNLOCKS</div>
                      <div style={{ fontFamily: 'var(--f-sec)', fontSize: 13, color: 'var(--bone)', letterSpacing: '0.05em', marginTop: 2 }}>
                        {tier.reward || 'NONE'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {sel && sel.tier > 0 && (
              <div style={{
                marginTop: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                clipPath: 'var(--clip-10)', padding: '20px 24px',
                display: 'grid', gridTemplateColumns: '120px 1fr', gap: 20, alignItems: 'center',
              }}>
                {BADGE_IMAGES[sel.tier] && (
                  <img src={BADGE_IMAGES[sel.tier]} style={{ width: 110, height: 110, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }} alt={sel.name} />
                )}
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: sel.color, letterSpacing: '0.25em' }}>PRESTIGE TIER</div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, color: sel.color, letterSpacing: '0.15em', marginTop: 2, marginBottom: 8, textTransform: 'uppercase' }}>
                    {sel.name}
                  </div>
                  <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em' }}>
                    <span>
                      <span style={{ color: 'var(--olive)' }}>COST</span>{' '}
                      <span style={{ color: sel.color, marginLeft: 6 }}>◆ {sel.cost.toLocaleString()} SHOT</span>
                    </span>
                    <span>
                      <span style={{ color: 'var(--olive)' }}>UNLOCK</span>{' '}
                      <span style={{ color: 'var(--bone)', marginLeft: 6 }}>{sel.reward}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <TerrainSilhouette />
    </div>
  );
}

function hexToRgb(hex) {
  if (!hex || hex[0] !== '#') return '200, 120, 26';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export default PrestigeScreen;
