import React, { useState, useEffect } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import ScanBtn from '../components/design/ScanBtn';
import TerrainSilhouette from '../components/design/Terrain';
import useIsMobile from '../hooks/useIsMobile';
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
  const isMobile = useIsMobile();
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

  // ── MOBILE LANDSCAPE LAYOUT ───────────────────────────────────────
  // Ports HAndover/mobile/MobileArmoryPrestige.jsx (Prestige half).
  // Horizontal 5-tier ladder spans the screen; bottom panel pins the
  // primary BURN CTA. Fits within the 844×390 frame without scrolling.
  // Renders Bronze→Diamond (tiers 1-5); Unranked (tier 0) is the
  // pre-Bronze starting state and is shown in the header pill.
  if (isMobile) {
    const ladderTiers = PRESTIGE_TIERS.filter(t => t.tier >= 1);
    return (
      <div style={{
        position: 'relative', height: '100%',
        background: 'var(--bg-deep)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center', gap: 10,
          padding: '6px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <button onClick={() => navigate('menu')} style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'var(--f-mono)', fontSize: 9,
            color: 'var(--olive)', letterSpacing: '0.22em',
          }}>◂ MENU</button>
          <div style={{ textAlign: 'center' }}>
            <div className="stencil" style={{
              fontSize: 14, color: 'var(--bone)', letterSpacing: '0.18em', lineHeight: 1,
            }}>PRESTIGE</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)',
              letterSpacing: '0.2em', marginTop: 2,
            }}>BURN $SHOT · UNLOCK SIG WEAPONS</div>
          </div>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 9,
            color: currentPrestige.color, letterSpacing: '0.15em',
          }}>{currentPrestige.name.toUpperCase()} · LV {currentTier}</div>
        </div>

        {/* Ladder — 5 tiers across */}
        <div style={{
          flex: 1, padding: '8px 14px',
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
          alignItems: 'center', gap: 4, minHeight: 0,
        }}>
          {ladderTiers.map((t, i) => {
            const isCurrent = t.tier === currentTier;
            const isLocked = t.tier > currentTier + 1;
            const isNext = t.tier === currentTier + 1;
            const prevIsCurrent = i > 0 && ladderTiers[i - 1].tier === currentTier;
            return (
              <div key={t.tier}
                onClick={() => setSelected(t.tier)}
                style={{
                  position: 'relative', textAlign: 'center', cursor: 'pointer',
                  opacity: isLocked ? 0.5 : 1,
                }}
              >
                {/* Connector line to previous tier */}
                {i > 0 && (
                  <div style={{
                    position: 'absolute', left: '-50%', right: '50%',
                    top: 28, height: 1,
                    borderTop: '1px dashed ' + (prevIsCurrent || isCurrent ? 'var(--accent)' : 'var(--border)'),
                  }} />
                )}
                <img src={BADGE_IMAGES[t.tier]} alt={t.name}
                  style={{
                    width: 56, height: 56,
                    filter: isCurrent
                      ? 'drop-shadow(0 0 14px rgba(218,138,40,0.55))'
                      : isLocked ? 'grayscale(1) brightness(0.6)' : 'none',
                    position: 'relative', zIndex: 1,
                  }} />
                <div className="stencil" style={{
                  fontSize: 11, letterSpacing: '0.2em', marginTop: 2,
                  color: isCurrent ? 'var(--accent)' : 'var(--bone)',
                }}>{t.name.toUpperCase()}</div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 6,
                  color: isCurrent ? 'var(--bone)' : 'var(--olive)',
                  letterSpacing: '0.25em', marginTop: 2,
                }}>
                  {isCurrent ? '★ CURRENT' : `${t.cost.toLocaleString()} SHOT`}
                </div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 6,
                  color: 'var(--muted)', letterSpacing: '0.18em', marginTop: 1,
                }}>
                  {t.weapons && t.weapons.length > 0 ? t.reward.toUpperCase() : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA panel */}
        {!isMaxTier ? (() => {
          const insufficient = shotBalance < nextTier.cost;
          const progressPct = Math.max(0, Math.min(100, (shotBalance / nextTier.cost) * 100));
          return (
            <div style={{
              padding: '8px 14px',
              background: 'var(--bg-raised)',
              borderTop: '1px solid var(--accent)',
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12,
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)',
                  letterSpacing: '0.3em',
                }}>// NEXT PRESTIGE</div>
                <div className="stencil" style={{
                  fontSize: 13, color: 'var(--bone)',
                  letterSpacing: '0.18em', marginTop: 1,
                }}>BURN {nextTier.cost.toLocaleString()} SHOT → {nextTier.name.toUpperCase()}</div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 7,
                  color: insufficient ? 'var(--red, #c86060)' : 'var(--accent)',
                  letterSpacing: '0.22em', marginTop: 2,
                }}>
                  {insufficient
                    ? `NEED ${(nextTier.cost - shotBalance).toLocaleString()} MORE`
                    : `UNLOCKS ${(nextTier.reward || '').toUpperCase()}`}
                </div>
                {/* Compact progress bar */}
                <div style={{
                  marginTop: 4, height: 3, background: 'var(--bg-deep)',
                  border: '1px solid var(--border)', borderRadius: 1,
                }}>
                  <div style={{
                    height: '100%', width: progressPct + '%',
                    background: insufficient ? 'var(--olive)' : 'var(--accent)',
                  }} />
                </div>
              </div>
              <ScanBtn
                onClick={canBurn ? handleBurn : undefined}
                width={110} height={40} fontSize={13}
                style={canBurn ? {} : { opacity: 0.5, cursor: 'default' }}
              >{burning ? '...' : 'BURN'}</ScanBtn>
            </div>
          );
        })() : (
          <div style={{
            padding: '10px 14px',
            background: 'var(--bg-raised)',
            borderTop: '1px solid var(--accent)',
            textAlign: 'center',
          }}>
            <div className="stencil" style={{
              fontSize: 13, color: 'var(--accent)', letterSpacing: '0.18em',
            }}>★ MAX PRESTIGE — DIAMOND ★</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)',
              letterSpacing: '0.22em', marginTop: 3,
            }}>ALL SIGNATURE WEAPONS UNLOCKED</div>
          </div>
        )}

        {/* Burn result toast */}
        {burnResult && (
          <div style={{
            position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: burnResult.success ? 'rgba(127,208,96,0.15)' : 'rgba(168,58,26,0.15)',
            border: `1px solid ${burnResult.success ? '#7fd060' : 'var(--red, #c86060)'}`,
            clipPath: 'var(--clip-6)',
            fontFamily: 'var(--f-display)', fontSize: 12,
            color: burnResult.success ? '#7fd060' : 'var(--red, #c86060)',
            letterSpacing: '0.18em',
            zIndex: 50,
          }}>
            {burnResult.message}
          </div>
        )}
      </div>
    );
  }

  return (
    // Scroll-safe pattern: flex:1 + overflowY:auto + minHeight:0 inside
    // Layout's flex viewport. Tier list can grow long.
    <div style={{
      position: 'relative',
      flex: 1,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: 'var(--bg-deep)',
      minHeight: 0,
    }}>
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

            {nextTier && (() => {
              // Progress visual: how close are they to the burn cost?
              // Caps at 100% even if balance > cost (so the bar pegs
              // when canBurn is true).
              const progressPct = Math.max(0, Math.min(100, (shotBalance / nextTier.cost) * 100));
              const insufficient = shotBalance < nextTier.cost;
              const remaining = Math.max(0, nextTier.cost - shotBalance);
              return (
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

                  {/* Progress bar — visualizes shotBalance / nextTier.cost.
                      Pegs at 100% when burnable. Helps players see how
                      close they are to the next burn instead of a flat
                      'insufficient' message. */}
                  <div style={{
                    marginTop: 12,
                    width: 180,
                    height: 6,
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: 0, top: 0, bottom: 0,
                      width: `${progressPct}%`,
                      background: nextTier.color,
                      transition: 'width 0.3s ease-out',
                    }} />
                  </div>
                  <div style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 9,
                    color: insufficient ? 'var(--muted)' : nextTier.color,
                    letterSpacing: '0.18em',
                    marginTop: 4,
                    textTransform: 'uppercase',
                  }}>
                    {insufficient
                      ? `${shotBalance.toLocaleString()} / ${nextTier.cost.toLocaleString()} · ${remaining.toLocaleString()} TO GO`
                      : 'READY TO BURN'}
                  </div>
                </>
              );
            })()}

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

            {/* Earn-more hint when insufficient — field-manual comment style. */}
            {nextTier && shotBalance < nextTier.cost && !burning && (
              <div style={{
                marginTop: 14, maxWidth: 260,
                fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--muted)',
                letterSpacing: '0.18em', textAlign: 'center', textTransform: 'uppercase',
              }}>
                // EARN $SHOT BY WINNING WAGERED MATCHES OR DAILY OPS
              </div>
            )}
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
