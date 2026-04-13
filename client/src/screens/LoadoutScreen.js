import React, { useState, useEffect, useCallback } from 'react';
import Button from '../components/Button';
import useIsMobile from '../hooks/useIsMobile';

const CONSUMABLES = [
  { id: 'extra_rations',    name: 'Extra Rations',    cost: 5,  desc: '+200G starting gold', icon: 'G' },
  { id: 'smoke_screen',     name: 'Smoke Screen',     cost: 8,  desc: 'Blocks opponent Scope', icon: 'S' },
  { id: 'tactical_scope',   name: 'Tactical Scope',   cost: 12, desc: 'Trajectory preview (1/3 arc)', icon: 'T' },
  { id: 'reinforced_armor', name: 'Reinforced Armor', cost: 18, desc: '+25 HP (275 total)', icon: 'A' },
  { id: 'overcharge',       name: 'Overcharge',       cost: 25, desc: 'Power max 115', icon: 'O' },
];

export default function LoadoutScreen({ navigate }) {
  const isMobile = useIsMobile();
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
    setBuying(consumableId);
    const sock = window.socket;
    if (!sock) return;

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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', height: '100vh',
      background: 'var(--bg, #0a0a1a)', color: '#fff',
      padding: isMobile ? '12px 8px' : '20px', overflowY: 'auto',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
        background: 'linear-gradient(transparent, rgba(34,139,34,0.06))',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'absolute', top: isMobile ? 8 : 16, left: isMobile ? 8 : 16, zIndex: 2 }}>
        <Button variant="secondary" onClick={() => navigate('menu')}
          style={{ padding: '6px 14px', fontSize: isMobile ? 11 : 13 }}>
          {'< BACK'}
        </Button>
      </div>

      <div style={{
        fontFamily: "'Black Ops One', cursive", fontSize: isMobile ? 20 : 28,
        letterSpacing: 3, marginTop: isMobile ? 30 : 16, marginBottom: 4, zIndex: 1,
      }}>LOADOUT</div>

      <div style={{
        fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
        color: 'var(--am)', letterSpacing: 2, marginBottom: 16, zIndex: 1,
      }}>
        {shotBalance.toFixed(1)} SHOT
      </div>

      {feedback && (
        <div style={{
          fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
          color: feedback.type === 'success' ? 'var(--sg)' : '#ff4444',
          letterSpacing: 2, marginBottom: 8, zIndex: 1,
        }}>
          {feedback.text}
        </div>
      )}

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        width: '100%', maxWidth: 420, zIndex: 1,
      }}>
        {CONSUMABLES.map(c => {
          const remaining = activeConsumables[c.id] || 0;
          const isActive = remaining > 0;
          const canAfford = shotBalance >= c.cost;

          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: isMobile ? '10px 12px' : '12px 16px',
              background: isActive ? 'rgba(34, 139, 34, 0.15)' : 'rgba(42, 51, 31, 0.3)',
              border: isActive ? '1px solid rgba(34, 139, 34, 0.4)' : '1px solid var(--ol)',
              borderRadius: 6,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 4,
                background: isActive ? 'rgba(34, 139, 34, 0.3)' : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Black Ops One', cursive", fontSize: 18,
                color: isActive ? 'var(--sg)' : 'var(--kh)',
                flexShrink: 0,
              }}>
                {c.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Black Ops One', cursive", fontSize: 13,
                  color: 'var(--bn)', letterSpacing: 1,
                }}>{c.name}</div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  color: 'var(--kh)', letterSpacing: 1,
                }}>{c.desc}</div>
              </div>

              {isActive ? (
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  color: 'var(--sg)', letterSpacing: 1, textAlign: 'right',
                  flexShrink: 0,
                }}>
                  ACTIVE<br />{remaining} LEFT
                </div>
              ) : (
                <Button
                  variant={canAfford ? 'primary' : 'disabled'}
                  onClick={canAfford ? () => buyConsumable(c.id) : undefined}
                  disabled={!canAfford || buying === c.id}
                  style={{ padding: '6px 12px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {buying === c.id ? '...' : c.cost + ' SHOT'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
        color: 'rgba(255,255,255,0.3)', marginTop: 16, textAlign: 'center',
        letterSpacing: 1, zIndex: 1,
      }}>
        CONSUMABLES LAST 5 MATCHES — SHOT IS BURNED ON PURCHASE
      </div>
    </div>
  );
}
