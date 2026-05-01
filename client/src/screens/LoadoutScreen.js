import React, { useState, useEffect, useCallback } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';

const CONSUMABLES = [
  { id: 'extra_rations',    name: 'Extra Rations',    cost: 5,  desc: '+200G starting gold',          icon: 'G', tier: 'STD'  },
  { id: 'smoke_screen',     name: 'Smoke Screen',     cost: 8,  desc: 'Blocks opponent Scope',         icon: 'S', tier: 'STD'  },
  { id: 'tactical_scope',   name: 'Tactical Scope',   cost: 12, desc: 'Trajectory preview (1/3 arc)',  icon: 'T', tier: 'TAC'  },
  { id: 'reinforced_armor', name: 'Reinforced Armor', cost: 18, desc: '+25 HP (275 total)',            icon: 'A', tier: 'TAC'  },
  { id: 'overcharge',       name: 'Overcharge',       cost: 25, desc: 'Power max 115',                 icon: 'O', tier: 'RARE' },
];
const TIER_COLOR = { STD: '#7a9060', TAC: '#4fc0b4', RARE: '#c8a84a' };

export default function LoadoutScreen({ navigate }) {
  const [shotBalance, setShotBalance] = useState(0);
  const [activeConsumables, setActiveConsumables] = useState({});
  const [buying, setBuying] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    sock.emit('getShotInfo');
    const handler = (data) => {
      setShotBalance(data.balance || 0);
      if (data.consumables) setActiveConsumables(data.consumables);
    };
    sock.on('shotInfo', handler);
    return () => sock.off('shotInfo', handler);
  }, []);

  const buyConsumable = useCallback((consumableId) => {
    if (buying) return;
    const sock = window.socket;
    if (!sock) return;
    setBuying(consumableId);
    sock.emit('buyConsumable', { consumableId });
    const handler = (data) => {
      setBuying(null);
      if (data.success) {
        setShotBalance(data.newBalance);
        setActiveConsumables(data.activeConsumables || {});
        setFeedback({ type: 'success', text: 'ACTIVATED' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'FAILED' });
      }
      setTimeout(() => setFeedback(null), 2000);
      sock.off('buyConsumableResult', handler);
    };
    sock.on('buyConsumableResult', handler);
  }, [buying]);

  return (
    // Scroll-safe pattern: flex:1 + overflowY:auto + minHeight:0 inside
    // Layout's flex viewport. See BarracksScreen for root-cause notes.
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

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px', position: 'relative', zIndex: 3 }}>
        <ScreenHeader
          title="LOADOUT"
          subtitle="CONSUMABLES · PAID IN $SHOT · LAST 5 MATCHES"
          onBack={() => navigate('menu')}
          rightExtras={
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.22em' }}>
              ◆ {shotBalance.toFixed(1)} SHOT
            </div>
          }
        />

        {feedback && (
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 12,
            color: feedback.type === 'success' ? '#7fd060' : '#c86060',
            letterSpacing: '0.22em', marginBottom: 12, textAlign: 'center',
          }}>{feedback.text}</div>
        )}

        {/* Active loadout indicator — 3 inline tiles showing currently-
            assigned consumables. Dashed when empty per design brief.
            Comment-style footer line in mono / olive (//-prefix) keeps
            the field-manual tone. */}
        {(() => {
          const activeIds = CONSUMABLES.filter(c => (activeConsumables[c.id] || 0) > 0);
          const slots = 3;
          const tiles = [];
          for (let i = 0; i < slots; i++) {
            const c = activeIds[i];
            const filled = !!c;
            tiles.push(
              <div key={i} style={{
                width: 64, height: 64,
                background: filled ? 'var(--bg-raised)' : 'transparent',
                border: filled ? '1px solid ' + (TIER_COLOR[c.tier] || 'var(--olive)') : '1px dashed var(--muted)',
                clipPath: 'var(--clip-6)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4,
                opacity: filled ? 1 : 0.7,
              }}>
                <div style={{
                  fontFamily: 'var(--f-display)',
                  fontSize: 18,
                  color: filled ? (TIER_COLOR[c.tier] || 'var(--bone)') : 'var(--muted)',
                  lineHeight: 1,
                }}>{filled ? c.icon : '—'}</div>
                <div style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 7,
                  color: filled ? 'var(--olive)' : 'var(--muted)',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>{filled ? c.name.split(' ')[0] : 'EMPTY'}</div>
              </div>
            );
          }
          const overflow = Math.max(0, activeIds.length - slots);
          return (
            <div style={{
              marginBottom: 18,
              padding: '14px 16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              clipPath: 'var(--clip-10)',
            }}>
              <div style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                color: 'var(--olive)',
                letterSpacing: '0.22em',
                marginBottom: 10,
              }}>
                ACTIVE LOADOUT &middot; {activeIds.length}/{slots}{overflow > 0 ? ` +${overflow}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {tiles}
              </div>
              <div style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 9,
                color: 'var(--muted)',
                letterSpacing: '0.18em',
                marginTop: 12,
                textTransform: 'uppercase',
              }}>
                // CONSUMABLES BURN ON USE &middot; EARN $SHOT TO STOCK UP
              </div>
            </div>
          );
        })()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {CONSUMABLES.map(c => {
            const remaining = activeConsumables[c.id] || 0;
            const isActive = remaining > 0;
            const canAfford = shotBalance >= c.cost;
            const tierColor = TIER_COLOR[c.tier];
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, alignItems: 'center',
                padding: '14px 18px',
                background: isActive ? 'var(--bg-raised)' : 'var(--bg-surface)',
                border: '1px solid ' + (isActive ? '#7fd060' : 'var(--border)'),
                clipPath: 'var(--clip-6)',
              }}>
                <div style={{
                  width: 44, height: 44,
                  background: 'var(--bg-deep)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--f-display)', fontSize: 22,
                  color: isActive ? '#7fd060' : tierColor,
                  clipPath: 'var(--clip-6)',
                }}>{c.icon}</div>
                <div>
                  <div style={{ fontFamily: 'var(--f-sec)', fontSize: 15, color: 'var(--bone)', letterSpacing: '0.04em' }}>{c.name}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.1em', marginTop: 3 }}>
                    <span style={{ color: tierColor, letterSpacing: '0.22em' }}>{c.tier}</span> · {c.desc}
                  </div>
                </div>
                {isActive ? (
                  <div style={{
                    padding: '8px 14px', textAlign: 'center',
                    color: '#7fd060', border: '1px solid #7fd060',
                    clipPath: 'var(--clip-6)',
                    fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.22em', lineHeight: 1.4,
                  }}>
                    ACTIVE<br />{remaining} LEFT
                  </div>
                ) : (
                  <button
                    disabled={!canAfford || buying === c.id}
                    onClick={canAfford && !buying ? () => buyConsumable(c.id) : undefined}
                    style={{
                      padding: '10px 14px',
                      background: canAfford ? 'var(--accent)' : 'var(--bg-deep)',
                      color: canAfford ? '#0e1209' : 'var(--muted)',
                      border: '1px solid ' + (canAfford ? 'var(--accent-hot)' : 'var(--border)'),
                      fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.15em',
                      clipPath: 'var(--clip-6)',
                      cursor: canAfford && !buying ? 'pointer' : 'not-allowed',
                      opacity: canAfford && !buying ? 1 : 0.6,
                      whiteSpace: 'nowrap',
                    }}>
                    {buying === c.id ? '…' : c.cost + ' SHOT'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10,
          color: 'var(--muted)', letterSpacing: '0.22em',
        }}>
          CONSUMABLES LAST 5 MATCHES — SHOT IS BURNED ON PURCHASE
        </div>
      </div>

      <TerrainSilhouette />
    </div>
  );
}
