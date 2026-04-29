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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: 'var(--bg, #0a0a1a)',
      color: '#fff',
      gap: isMobile ? 12 : 20,
      padding: 20,
      position: 'relative',
    }}>
      {/* Background elements */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
        background: 'linear-gradient(transparent, rgba(34,139,34,0.08))',
        pointerEvents: 'none',
      }} />

      {/* Back button */}
      <div style={{ position: 'absolute', top: isMobile ? 8 : 16, left: isMobile ? 8 : 16, zIndex: 2 }}>
        <Button
          variant="secondary"
          onClick={() => navigate('menu')}
          style={{ padding: '6px 14px', fontSize: isMobile ? 11 : 13 }}
        >
          {'< BACK'}
        </Button>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Black Ops One', cursive",
        fontSize: isMobile ? 22 : 32,
        letterSpacing: 3,
        zIndex: 1,
      }}>
        VS <span style={{ color: 'var(--kh, #999)' }}>SHOT BOT</span>
      </div>

      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: isMobile ? 10 : 13,
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        maxWidth: 360,
        zIndex: 1,
      }}>
        Practice against the AI. Stats are not recorded.
      </div>

      {/* Color picker */}
      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: isMobile ? 10 : 12,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 2,
        marginTop: isMobile ? 4 : 10,
        zIndex: 1,
      }}>
        CHOOSE YOUR COLOR
      </div>

      <div style={{
        display: 'flex',
        gap: isMobile ? 6 : 10,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 320,
        zIndex: 1,
      }}>
        {PLAYER_COLORS.map(c => (
          <div
            key={c.id}
            onClick={() => setSelectedColor(c)}
            style={{
              width: isMobile ? 32 : 40,
              height: isMobile ? 32 : 40,
              borderRadius: 6,
              background: c.hex,
              border: selectedColor.id === c.id
                ? '3px solid #fff'
                : '2px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              transition: 'transform 0.15s, border-color 0.15s',
              transform: selectedColor.id === c.id ? 'scale(1.15)' : 'scale(1)',
              boxShadow: selectedColor.id === c.id
                ? `0 0 12px ${c.hex}40`
                : 'none',
            }}
          />
        ))}
      </div>

      {/* Start button */}
      <Button
        variant="primary"
        onClick={handleStart}
        disabled={launching}
        style={{
          marginTop: isMobile ? 8 : 16,
          padding: isMobile ? '10px 32px' : '14px 48px',
          fontSize: isMobile ? 14 : 18,
          zIndex: 1,
          letterSpacing: 3,
        }}
      >
        {launching ? 'LAUNCHING...' : 'START'}
      </Button>
    </div>
  );
}
