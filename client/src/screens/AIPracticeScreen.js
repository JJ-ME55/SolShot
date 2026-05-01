import React, { useState, useCallback, useEffect } from 'react';
import Button from '../components/Button';
import TANK_COLORS from '../data/colors';
import useIsMobile from '../hooks/useIsMobile';

// Player-selectable colors (exclude WHITE id:8, reserved for Shot Bot)
const PLAYER_COLORS = TANK_COLORS.filter(c => c.id !== 8);

export default function AIPracticeScreen({ navigate }) {
  const isMobile = useIsMobile();
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
  const [launching, setLaunching] = useState(false);

  const handleStart = useCallback(() => {
    if (launching) return;
    setLaunching(true);

    const sock = window.socket;
    if (!sock?.connected) {
      setLaunching(false);
      return;
    }

    sock.emit('createAIMatch', {
      player: {
        name: localStorage.getItem('solshot_handle') || 'Player',
        color: selectedColor.phaserHex,
      },
    });
  }, [launching, selectedColor]);

  // Listen for shopPhase to navigate into the match
  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;

    const onShopPhase = (data) => {
      navigate('shop', { ...data, isAIMatch: true });
    };

    sock.on('shopPhase', onShopPhase);
    return () => sock.off('shopPhase', onShopPhase);
  }, [navigate]);

  return (
    // Field-manual aesthetic — uses design tokens throughout. Was the
    // worst Tier 3 offender (literal '#fff', '#999', --bg fallback hex,
    // borderRadius:6) — rewritten to match the rest of the app.
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      minHeight: 0,
      background: 'var(--bg-deep)',
      color: 'var(--bone)',
      gap: isMobile ? 12 : 20,
      padding: `var(--tg-chrome-top) var(--tg-chrome-side) max(20px, env(safe-area-inset-bottom, 20px))`,
      position: 'relative',
    }}>
      {/* Subtle terrain wash at the bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
        background: 'linear-gradient(transparent, rgba(122,144,96,0.08))',
        pointerEvents: 'none',
      }} />

      {/* Back button — positioned inside the TG chrome reserve */}
      <div style={{ position: 'absolute', top: 'var(--tg-chrome-top)', left: 'var(--tg-chrome-side)', zIndex: 2 }}>
        <Button
          variant="secondary"
          onClick={() => navigate('menu')}
          style={{ padding: '6px 14px', fontSize: isMobile ? 11 : 13 }}
        >
          {'◂ BACK'}
        </Button>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: 'var(--f-display)',
        fontSize: isMobile ? 22 : 32,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        zIndex: 1,
      }}>
        VS <span style={{ color: 'var(--accent)' }}>SHOT BOT</span>
      </div>

      <div style={{
        fontFamily: 'var(--f-mono)',
        fontSize: isMobile ? 10 : 13,
        color: 'var(--olive)',
        textAlign: 'center',
        maxWidth: 360,
        letterSpacing: '0.15em',
        zIndex: 1,
      }}>
        PRACTICE AGAINST THE AI &middot; STATS ARE NOT RECORDED
      </div>

      {/* Color picker label */}
      <div style={{
        fontFamily: 'var(--f-mono)',
        fontSize: isMobile ? 10 : 12,
        color: 'var(--olive)',
        letterSpacing: '0.22em',
        marginTop: isMobile ? 4 : 10,
        textTransform: 'uppercase',
        zIndex: 1,
      }}>
        CHOOSE YOUR COLOR
      </div>

      <div style={{
        display: 'flex',
        gap: isMobile ? 8 : 10,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 360,
        zIndex: 1,
      }}>
        {PLAYER_COLORS.map(c => {
          const selected = selectedColor.id === c.id;
          // Touch target ≥44px even on mobile (Apple/Google HIG min).
          const swatchSize = isMobile ? 44 : 48;
          return (
            <div
              key={c.id}
              onClick={() => setSelectedColor(c)}
              role="button"
              aria-label={`Tank color ${c.name || c.id}`}
              aria-pressed={selected}
              style={{
                width: swatchSize,
                height: swatchSize,
                clipPath: 'var(--clip-6)',
                background: c.hex,
                border: selected
                  ? '2px solid var(--bone)'
                  : '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'transform 0.15s, border-color 0.15s',
                transform: selected ? 'scale(1.1)' : 'scale(1)',
                boxShadow: selected
                  ? `0 0 14px ${c.hex}55`
                  : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Start button */}
      <Button
        variant="primary"
        onClick={handleStart}
        disabled={launching}
        style={{
          marginTop: isMobile ? 8 : 16,
          padding: isMobile ? '12px 32px' : '14px 48px',
          fontSize: isMobile ? 15 : 18,
          minHeight: 44, // touch target floor
          zIndex: 1,
          letterSpacing: '0.22em',
        }}
      >
        {launching ? 'LAUNCHING...' : 'START'}
      </Button>
    </div>
  );
}
